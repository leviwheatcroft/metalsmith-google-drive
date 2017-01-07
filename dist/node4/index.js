'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.clearCache = exports.plugin = undefined;

var _lodash = require('lodash');

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _vow = require('vow');

var _vow2 = _interopRequireDefault(_vow);

var _grayMatter = require('gray-matter');

var _grayMatter2 = _interopRequireDefault(_grayMatter);

var _readline = require('readline');

var _readline2 = _interopRequireDefault(_readline);

var _highland = require('highland');

var _highland2 = _interopRequireDefault(_highland);

var _googleapis = require('googleapis');

var _googleapis2 = _interopRequireDefault(_googleapis);

var _googleAuthLibrary = require('google-auth-library');

var _googleAuthLibrary2 = _interopRequireDefault(_googleAuthLibrary);

var _nodePersist = require('node-persist');

var _nodePersist2 = _interopRequireDefault(_nodePersist);

var _path = require('path');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const dbg = (0, _debug2.default)('metalsmith-google-drive');
const drive = _googleapis2.default.drive('v3');
let oauth;
let cache = true;
let initialised = false;

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
function plugin(options) {
  if (!options) throw new Error('no options passed');
  if (!options.src) throw new Error('required: options.src');
  if (!options.dest) throw new Error('required: options.dest');
  if (!options.auth) throw new Error('required: options.auth');
  if (options.cache !== undefined) cache = options.cache;

  return (files, metalsmith, done) => {
    dbg('starting');
    return _vow2.default.resolve().then(() => _init()).then(() => _doAuth(options.auth)).then(() => _scrape(options.src, options.dest)).then(files => _getFiles(options.dest, files)).then(result => (0, _lodash.extend)(files, result)).then(() => _nodePersist2.default.setItemSync('lastRun', new Date().toISOString())).catch(dbg).then(() => done());
  };
}
/**
 * ### _init
 *
 * initialise node-persist only once
 */
function _init() {
  if (initialised) return;
  initialised = true;
  _nodePersist2.default.initSync();
}

function clearCache() {
  let token;
  _init();
  token = _nodePersist2.default.getItemSync('token');
  _nodePersist2.default.clearSync();
  _nodePersist2.default.setItemSync('token', token);
}

/**
 * ### _getFiles
 *
 * this gets files from local persistent store, *not* from drive
 *
 * @param {String} dest path under which to store files
 */
function _getFiles(dest, files) {
  let paths;
  // files arg contains only files downloaded this time, values contains all
  if (cache) files = _nodePersist2.default.values();
  // ignore non-file things we've stored
  files = (0, _lodash.filter)(files, 'id');
  dbg(`pushing ${ files.length } files to metalsmith`);
  files = (0, _lodash.map)(files, file => {
    file.contents = new Buffer(file.contents);
    return file;
  });
  paths = (0, _lodash.map)(files, file => (0, _path.join)(dest, file.name));
  files = (0, _lodash.zipObject)(paths, files);
  return files;
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
function _scrape(src) {
  const defer = _vow2.default.defer();
  // returns a highland stream
  _streamFiles(src).map(file => {
    // must return stream (or *highland decorated promise*)
    return (0, _highland2.default)(_vow2.default.resolve(file).then(_downloadFile).then(_frontMatter).then(_storeFile).catch(dbg));
  })
  // artificial backpressure
  .parallel(5).toArray(files => {
    defer.resolve(files);
  });
  return defer.promise();
}

/**
 * ### _storeFile
 *
 * store file in persist cache with drive id as key
 *
 * @param {Object} file
 */
function _storeFile(file) {
  if (cache) _nodePersist2.default.setItemSync(file.id, file);
  return file;
}
/**
 * ### _frontMatter
 *
 * @param {Object} file
 */
function _frontMatter(file) {
  let meta = (0, _grayMatter2.default)(file.contents).data;
  if ((0, _lodash.keys)(meta).length === 0) {
    return _vow2.default.reject(`no front matter? ${ file.name }`);
  }
  return (0, _lodash.extend)(file, meta);
}

/**
 * ### _downloadFileByMeta
 *
 * @param {Object} file as streadmed from _streamFiles
 */
function _downloadFile(file) {
  dbg(`downloading ${ file.name }`);

  const defer = _vow2.default.defer();
  drive.files.get({
    auth: oauth,
    fileId: file.id,
    // `alt: 'media'` triggers file download rather than just meta
    alt: 'media'
  }, (err, result) => {
    if (err) dbg('_downloadFileByMeta error: ', err);
    // note that at this point we just keep a string rather than a Buffer
    file.contents = result;
    // return the whole `file` object rather than just the content
    defer.resolve(file);
  });
  return defer.promise();
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
function _streamFiles(parent) {
  let pageToken = false;
  let lastRun = _nodePersist2.default.getItemSync('lastRun');
  let count = 0;
  return (0, _highland2.default)((push, next) => {
    const request = {};

    // build request object with query
    request.auth = oauth;
    request.fields = 'files(id, name, trashed)';
    request.q = (0, _lodash.compact)(['mimeType != "application/vnd.google-apps.folder"', `"${ parent }" in parents`, lastRun && cache ? `modifiedTime > "${ lastRun }"` : false]).join(' and ');
    if (pageToken) request.pageToken = pageToken;

    // async api call, no need to promisify because we bat for both teams ?
    drive.files.list(request, (err, result) => {
      if (err) throw new Error(err);
      count += result.files.length;
      (0, _lodash.each)(result.files, file => {
        // this is all we need to do to deal with deleted files
        if (file.trashed) {
          dbg(`ignoring trashed ${ file.name }`);
          if (cache) _nodePersist2.default.removeItemSync(file.id);
        } else {
          // push / emit file to the highland stream
          push(null, file);
        }
      });
      if (!result.nextPageToken) {
        // close highland stream with special `highland.nil`
        dbg(`${ count } files to be updated`);
        push(null, _highland2.default.nil);
      } else {
        // indicate that more values can be retrieved
        pageToken = result.nextPageToken;
        next();
      }
    });
  });
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
function _doAuth(auth) {
  const googleAuth = new _googleAuthLibrary2.default();
  oauth = new googleAuth.OAuth2(auth.client_id, auth.client_secret, auth.redirect_uris[0]);
  return _vow2.default.resolve().then(() => _nodePersist2.default.getItemSync('token') || _tokenFlow()).then(token => {
    oauth.credentials = token;
  });
}

/**
 * ### _tokenFlow
 *
 * usually this auth flow happens in your browser, but here we do it via CLI
 * this fn prints the auth url, which gives the user a code to paste back in
 */
function _tokenFlow() {
  const defer = _vow2.default.defer();
  let prompt;
  const authUrl = oauth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.readonly']
  });
  console.log('authorise metalsmith-google-drive by visiting: ', authUrl);
  prompt = _readline2.default.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  prompt.question('Enter the code from that page here: ', code => {
    prompt.close();
    oauth.getToken(code, (err, result) => {
      if (err) defer.reject(err);else {
        _nodePersist2.default.setItemSync('token', result);
        defer.resolve(result);
      }
    });
  });
  return defer.promise();
}
exports.default = plugin;
exports.plugin = plugin;
exports.clearCache = clearCache;