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
import { join } from 'path'
import {
  Store,
  params
} from './store'

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
  const store = new Folder(options)
  return store.plugin.bind(store)
}

class Folder {
  constructor (options) {
    Object.keys(options).forEach((key) => { this[key] = options[key] })
    this.name = this.src.slice(-8)
    this.store = new Store(this.src)
    if (this.invalidateCache) {
      this.store.invalidate()
      params.setLastRun(this, false)
    }
  }
  plugin (files, metalsmith) {
    this.files = files
    this.metalsmith = metalsmith
    return vow.resolve()
    .then(() => _doAuth(this.auth))
    .then(() => this.scrape())
    .then(() => this.mergeStore())
    .then(() => params.setLastRun(this))
    .then(() => vow.resolve(this.files))
    .catch(dbg)
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
    dbg('scrape', this.name)
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
    let lastRun = params.getLastRun(this)
    dbg('lastRun', lastRun)
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
            this.store.removeResource(file.id)
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
    let encoding = /^text/.exec(file.mimeType) ? 'utf8' : 'base64'
    file.contents = file.contents.toString(encoding)
    this.store.setResource(join(this.dest, file.id), file)
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
    const store = this.store.getResources(this.dest)
    Object.keys(store).forEach((key) => {
      let encoding = /^text/.exec(store[key].mimeType) ? 'utf8' : 'base64'
      store[key].contents = new Buffer(store[key].contents, encoding)
    })
    dbg(
      `merging ${Object.keys(store).length} ` +
      `tracked files from ${this.store.name}`
    )
    Object.assign(this.files, store)
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
    return params.getToken() ||
    config.get('metalsmith-google-drive').token ||
    _tokenFlow()
  })
  .then((token) => {
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
      if (err) {
        dbg(err)
        defer.reject(err)
      } else {
        console.log('---------- snip ----------')
        console.log(`metalsmith-google-drive: { token: ${result} }`)
        console.log('---------- snip ----------')
        console.log('put this in an untracked config file like local.js')
        params.setToken(result)
        defer.resolve(result)
      }
    })
  })
  return defer.promise()
}

export default plugin
export {
  plugin
}
