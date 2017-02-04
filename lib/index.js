import {
  compact,
  each,
  map,
  keys,
  filter,
  zipObject
} from 'lodash'
import debug from 'debug'
import vow from 'vow'
import matter from 'gray-matter'
import readline from 'readline'
import highland from 'highland'
import google from 'googleapis'
import GoogleAuth from 'google-auth-library'
import store from 'node-persist'
import {
  join
} from 'path'

const dbg = debug('metalsmith-google-drive')
const drive = google.drive('v3')
let oauth
let cache = true
let initialised = false

/**
 * ### default
 *
 * see README.md re: auth properties
 *
 * @param {Object} options
 * @param {String} options.src google drive parent id folder
 * @param {String} options.dest path under which to place files for metalsmith
 * @param {Object} options.auth
 * @param {String} options.auth.client_id
 * @param {String} options.auth.client_secret
 * @param {Array} options.auth.redirect_uris
 */
function plugin (options) {
  if (!options) throw new Error('no options passed')
  if (!options.src) throw new Error('required: options.src')
  if (!options.dest) throw new Error('required: options.dest')
  if (!options.auth) throw new Error('required: options.auth')
  if (options.cache !== undefined) cache = options.cache

  return (files, metalsmith, done) => {
    dbg('waiting for auth (sorry!)')
    return vow.resolve()
    .then(() => _init())
    .then(() => _doAuth(options.auth))
    .then(() => _scrape(options.src, options.dest))
    .then((files) => _getFiles(options.dest, files))
    .then((result) => Object.assign(files, result))
    .then(() => store.setItemSync('lastRun', new Date().toISOString()))
    .catch(dbg)
    .then(() => {
      done()
    })
  }
}
/**
 * ### _init
 *
 * initialise node-persist only once
 */
function _init () {
  if (initialised) return
  initialised = true
  store.initSync({
    continuous: true,
    interval: false,
    expiredInterval: false
  })
}

function clearCache () {
  let token
  _init()
  token = store.getItemSync('token')
  store.clearSync()
  store.setItemSync('token', token)
}

/**
 * ### _getFiles
 *
 * this gets files from local persistent store, *not* from drive
 *
 * @param {String} dest path under which to store files
 */
function _getFiles (dest, files) {
  let paths
  // files arg contains only files downloaded this time, values contains all
  if (cache) files = store.values()
  // ignore non-file things we've stored
  files = filter(files, 'id')
  dbg(`got ${files.length} files`)
  files = map(files, (file) => {
    file.contents = new Buffer(file.contents)
    return file
  })
  paths = map(files, (file) => join(dest, file.name))
  files = zipObject(paths, files)
  return files
}

/**
 * ### _scrape
 *
 * scrape files from google drive
 *
 * nested highland stream...
 *
 *  * without backpressure a stream will just push everything into a slow
 *    consumer which is kind of the antithesis of a stream (a lake?)
 *  * the calls to drive api do not have any inherant backpressure so it needs
 *    to be created artificially. highlands `throttle` or `ratelimit` are based
 *    on ms, so that would just be an arbitrary limit uneffected by how fast the
 *    api is running. `parallel` allows to have x concurrent requests.
 *  * `parallel` only works on a stream of streams, that means if you want
 *    `generator().map( ... ).parallel(5)` then map *must* return a stream. In
 *    this case the stream returned contains only a single promise. Think of it
 *    more like a promise decorated with the highland api rather than an actual
 *    stream.
 *
 * @param {string} src google drive parent folder id
 */
function _scrape (src) {
  const defer = vow.defer()
  // returns a highland stream
  _streamFiles(src)
  .map((file) => {
    // must return stream (or *highland decorated promise*)
    return highland(
      vow.resolve(file)
      .then(_downloadFile)
      .then(_frontMatter)
      .then(_storeFile)
      .catch(dbg)
    )
  })
  // artificial backpressure
  .parallel(5)
  .toArray((files) => {
    defer.resolve(files)
  })
  return defer.promise()
}

/**
 * ### _storeFile
 *
 * store file in persist cache with drive id as key
 *
 * @param {Object} file
 */
function _storeFile (file) {
  if (cache) store.setItemSync(file.id, file)
  return file
}
/**
 * ### _frontMatter
 *
 * @param {Object} file
 */
function _frontMatter (file) {
  let meta = matter(file.contents)
  if (keys(meta).length === 0) {
    return vow.reject(`no front matter? ${file.name}`)
  }
  Object.assign(
    file,
    { contents: meta.content },
    meta.data
  )

  return file
}

/**
 * ### _downloadFileByMeta
 *
 * @param {Object} file as streadmed from _streamFiles
 */
function _downloadFile (file) {
  dbg(`downloading ${file.name}`)

  const defer = vow.defer()
  drive.files.get(
    {
      auth: oauth,
      fileId: file.id,
      // `alt: 'media'` triggers file download rather than just meta
      alt: 'media'
    },
    (err, result) => {
      if (err) return defer.reject(err)
      // note that at this point we just keep a string rather than a Buffer
      file.contents = result
      // return the whole `file` object rather than just the content
      defer.resolve(file)
    }
  )
  return defer.promise()
}

/**
 * ### _streamFileMeta
 *
 * some rad highland stream magic!
 *
 *  * the highland constructor is passed a function which will be called every
 *    time the stream is ready for more data
 *  * the two args passed to this fn are to `push` (queue?) data into the stream
 *    and to `next` when there's a good opportunity to do something else to
 *    consume the data
 *  * so basically every time the stream has capacity, we will request a page
 *    from the API and push each file onto the stream. if there's no
 *    `nextPageToken` then we notify the stream that there's no more.
 *
 * @param {String} parent id of parent folder
 */
function _streamFiles (parent) {
  let pageToken = false
  let lastRun = store.getItemSync('lastRun')
  let count = 0
  return highland((push, next) => {
    const request = {}

    // build request object with query
    request.auth = oauth
    request.fields = 'files(id, name, trashed)'
    request.q = compact([
      'mimeType != "application/vnd.google-apps.folder"',
      `"${parent}" in parents`,
      lastRun && cache ? `modifiedTime > "${lastRun}"` : false
    ]).join(' and ')
    if (pageToken) request.pageToken = pageToken

    // async api call, no need to promisify because we bat for both teams ?
    drive.files.list(request, (err, result) => {
      if (err) throw new Error(err)
      count += result.files.length
      each(result.files, (file) => {
        // this is all we need to do to deal with deleted files
        if (file.trashed) {
          dbg(`ignoring trashed ${file.name}`)
          if (cache) store.removeItemSync(file.id)
        } else {
          // push / emit file to the highland stream
          push(null, file)
        }
      })
      if (!result.nextPageToken) {
        // close highland stream with special `highland.nil`
        dbg(`${count} files to be updated`)
        push(null, highland.nil)
      } else {
        // indicate that more values can be retrieved
        pageToken = result.nextPageToken
        next()
      }
    })
  }) // .done(() => dbg('streamFiles done'))
}

/**
 * ### _doAuth
 *
 * set up the API auth structure, retrieve cached token or request one
 *
 * __ tokens __
 *  * I haven't been able to figure out how long this token lasts for, I have a
 *    feeling it might last until invalidated.
 *  * What happens to a token when the same client_secret is used to generate
 *    another token, like on another machine
 *
 * @param {Object} auth see properties passed to googleAuth.OAuth2
 */
function _doAuth (auth) {
  const googleAuth = new GoogleAuth()
  oauth = new googleAuth.OAuth2(
    auth.client_id,
    auth.client_secret,
    auth.redirect_uris[0]
  )
  return vow.resolve()
  .then(() => store.getItemSync('token') || _tokenFlow())
  .then((token) => {
    dbg(token)
    oauth.credentials = token
  })
  .catch((err) => dbg(err))
}

/**
 * ### _tokenFlow
 *
 * usually this auth flow happens in your browser, but here we do it via CLI
 * this fn prints the auth url, which gives the user a code to paste back in
 */
function _tokenFlow () {
  const defer = vow.defer()
  let prompt
  const authUrl = oauth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.readonly']
  })
  console.log('authorise metalsmith-google-drive by visiting: ', authUrl)
  prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  prompt.question('Enter the code from that page here: ', (code) => {
    prompt.close()
    oauth.getToken(code, (err, result) => {
      dbg('got token')
      if (err) {
        dbg(err)
        defer.reject(err)
      } else {
        store.setItemSync('token', result)
        defer.resolve(result)
      }
    })
  })
  return defer.promise()
}
export default plugin
export {
  plugin,
  clearCache
}
