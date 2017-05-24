import {
  compact,
  each,
  keys
} from 'lodash'
import debug from 'debug'
import vow from 'vow'
import matter from 'gray-matter'
import readline from 'readline'
import highland from 'highland'
import google from 'googleapis'
import GoogleAuth from 'google-auth-library'
import config from 'config'
import hjson from 'hjson'
import { join } from 'path'
import {
  FileCache,
  ValueCache,
  init as initCache,
  save as saveCache
} from 'metalsmith-cache'

let fileCache = false
let valueCache = false

initCache().then(() => {
  fileCache = new FileCache('google-drive')
  valueCache = new ValueCache('google-drive-params')
})

const dbg = debug('metalsmith-google-drive')
const drive = google.drive('v3')
let oauth

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
  // if (options.cache !== undefined) cache = options.cache
  if (options.invalidateCache) {
    initCache().then(() => {
      dbg('invalidating cache')
      fileCache.collection.clear()
      valueCache.collection.clear()
    })
  }
  const folder = new Folder(options)
  return folder.googleDrive.bind(folder)
}

class Folder {
  constructor (options) {
    Object.assign(this, options)
  }
  googleDrive (files, metalsmith) {
    // enable debug-ui
    debug.log = metalsmith.log || debug.log
    this.files = files
    this.metalsmith = metalsmith
    return vow.resolve()
    .then(() => initCache())
    .then(() => _doAuth(this.auth))
    .then(() => this.scrape())
    .then(() => this.mergeStore())
    .then(() => valueCache.store(this.src, new Date().toISOString()))
    .then(() => saveCache())
    .then(() => vow.resolve(this.files))
    .catch((err) => {
      if (err === 'skip') return dbg('skipped scrape')
      dbg(err)
    })
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
  scrape () {
    dbg('scrape', this.src)
    const defer = vow.defer()
    // returns a highland stream
    this.streamFiles()
    .map((file) => {
      // must return stream (or *highland decorated promise*)
      return highland(
        vow.resolve(file)
        .then((file) => this.downloadFile(file))
        .then((file) => this.frontMatter(file))
        .then((file) => this.storeFile(file))
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
   * ### streamFiles
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
  streamFiles () {
    let pageToken = false
    let lastRun = valueCache.retrieve(this.src)
    dbg(lastRun ? `lastRun: ${lastRun}` : 'first run')
    let count = 0
    return highland((push, next) => {
      const request = {}

      // build request object with query
      request.auth = oauth
      request.fields = 'files(id, name, mimeType, trashed)'
      request.q = compact([
        'mimeType != "application/vnd.google-apps.folder"',
        `"${this.src}" in parents`,
        lastRun ? `modifiedTime > "${lastRun}"` : false
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
            fileCache.remove(join(this.dest, file.id))
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
    })
  }
  /**
   * ### downloadFile
   *
   * @param {Object} file as streadmed from _streamFiles
   */
  downloadFile (file) {
    dbg(`downloading ${file.name}`)

    const defer = vow.defer()
    const chunks = []
    drive.files.get({
      auth: oauth,
      fileId: file.id,
      // `alt: 'media'` triggers file download rather than just meta
      alt: 'media'
    })
    .on('data', (chunk) => {
      chunks.push(chunk)
    })
    .on('end', () => {
      file.contents = Buffer.concat(chunks)
      defer.resolve(file)
    })
    .on('error', (err) => defer.reject(err))
    return defer.promise()
  }
  /**
   * ### frontMatter
   *
   * @param {Object} file
   */
  frontMatter (file) {
    if (!/^text/.exec(file.mimeType)) return file
    let meta = matter(file.contents.toString('utf8'))
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
   * ### storeFile
   *
   * store file in persist cache with drive id as key
   *
   * @param {Object} file
   */
  storeFile (file) {
    // let encoding = /^text/.exec(file.mimeType) ? 'utf8' : 'base64'
    // file.contents = file.contents.toString(encoding)
    fileCache.store(join(this.dest, file.name), file)
    return file
  }
  /**
   * ### _getFiles
   *
   * this gets files from local persistent store, *not* from drive
   *
   * @param {String} dest path under which to store files
   */
  mergeStore () {
    const files = fileCache.match(`${this.dest}/**/*`)
    const count = Object.keys(fileCache)
    dbg(`merging ${count} tracked files from ${this.src}`)
    Object.assign(this.files, files)
  }
}

/**
 * ### _doAuth
 *
 * set up the API auth structure, retrieve cached token or request one
 *
 * __ tokens __
 *  * this token lasts until invalidated.
 *
 * @param {Object} auth see properties passed to googleAuth.OAuth2
 */
function _doAuth (auth) {
  if (oauth) return vow.resolve()
  dbg('doing oAuth2')
  const googleAuth = new GoogleAuth()
  oauth = new googleAuth.OAuth2(
    auth.client_id,
    auth.client_secret,
    auth.redirect_uris[0]
  )
  return vow.resolve()
  .then(() => {
    // see if token has been recorded in config
    let configToken = config.get('metalsmith-google-drive').token
    // no idea why google auth needs the token to be writable, but whatever
    if (configToken) configToken = config.util.cloneDeep(configToken)
    // fall back to cache (params), then do token flow
    return configToken || valueCache.retrieve('token') || _tokenFlow()
  })
  .then((token) => {
    oauth.credentials = token
  })
  .catch((err) => {
    // if some failure occurred invalidate oauth object so we don't simply
    // try to use it next time.
    oauth = false
    return vow.reject(err)
  })
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
  prompt.question(
    'Enter the code from that page here (or "ok" to skip scrape): ',
    (code) => {
      prompt.close()
      if (code === 'ok') return defer.reject('skip')
      oauth.getToken(code, (err, result) => {
        if (err) {
          dbg(err)
          defer.reject(err)
        } else {
          console.log('---------- snip ----------')
          console.log(hjson.stringify(
            { 'metalsmith-google-drive': { token: result } },
            { separator: true, spaces: 2 }
          ))
          console.log('---------- snip ----------')
          console.log('this token is cached automatically, but you can store')
          console.log('it in a config file like config/local.js if you want.')
          valueCache.store('token', result)
          defer.resolve(result)
        }
      })
    }
  )
  return defer.promise()
}

export default plugin
export {
  plugin
}
