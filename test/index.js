import Metalsmith from 'metalsmith'
// import assert from 'assert'
import {
  plugin
} from '../lib'
import config from 'config'
// import lint from 'mocha-eslint'
// import sinon from 'sinon'
// import highland from 'highland'
import { parse as parseHjson } from 'hjson'
import vow from 'vow'
import { join } from 'path'
// import { readFileSync } from 'fs'
// import store from 'node-persist'
import debug from 'debug'
// import { keys } from 'lodash'
// import nock from 'nock'
// import util from 'util'
// import { appendFileSync } from 'fs'
// import readline from 'readline'

// nock.recorder.rec({
//   logging: (content) => {
//     appendFileSync('test/fixtures/nock.js', content)
//   }
// })
// nock.recorder.rec()

const dbg = debug('metalsmith-google-drive')
// function copy (desc, obj) {
//   console.log(`<<<<<<-- ${desc} -->>>>>>`)
//   console.log(JSON.stringify(obj, null, 2))
//   console.log(`<<<<<<-- ${desc} -->>>>>>`)
// }
// let fixture = function (basename) {
//   return () => {
//     let path = join('test/fixtures', basename + '.hjson')
//     let file = readFileSync(path, {encoding: 'utf8'})
//     let data = parseHjson(file)
//     return vow.resolve(data)
//   }
// }
// lint(['lib/index.js'])
// before('stub listFolder with empty entries', () => {
//   stubs = [
//     sinon.stub(dropbox, 'filesListFolder', fixture('res3'))
//   ]
// })
// after(function () {
//   each(stubs, (stub) => stub.restore())
// })
describe('metalsmith-google-drive', () => {
  /*
  before(() => {
    store.initSync()
    // nock.load('test/fixtures/setupAuth/nock.json')
  })
  it('should be able to set up auth', (done) => {
//    nock.load('test/fixtures/setupAuth/nock.json')
    nock('https://accounts.google.com:443')
    .post('/o/oauth2/token')
    .reply(
      200,
      {
        "access_token": "dummyToken",
        "expires_in": 3600,
        "refresh_token": "dummyToken",
        "token_type": "Bearer"
      },
      [
        'Content-Type',
        'application/json; charset=utf-8',
        'X-Content-Type-Options',
        'nosniff',
        'Cache-Control',
        'no-cache, no-store, max-age=0, must-revalidate',
        'Pragma',
        'no-cache',
        'Expires',
        'Mon, 01 Jan 1990 00:00:00 GMT',
        'Date',
        'Thu, 19 Jan 2017 22:14:08 GMT',
        'Content-Disposition',
        'attachment; filename="json.txt"; filename*=UTF-8\'\'json.txt',
        'Server',
        'ESF',
        'X-XSS-Protection',
        '1; mode=block',
        'X-Frame-Options',
        'SAMEORIGIN',
        'Alt-Svc',
        'quic=":443"; ma=2592000; v="35,34"',
        'Accept-Ranges',
        'none',
        'Vary',
        'Accept-Encoding',
        'Connection',
        'close'
      ]
    )
    dbg('createInterface', readline.createInterface)
    // stubs
    let stubs = [
      sinon.stub(store, 'getItemSync', false),
      sinon.stub(readline, 'createInterface', {
        question: (text, handler) => {
          handler('dummyToken')
        },
        close: () => {}
      })
    ]
    // process.stdin.write('dummy auth code\r')
    _doAuth(config.get('metalsmith-google-drive'))
    .then(() => {
      copy('oauth', oauth)
      stubs.forEach((stub) => stub.restore())
      done()
    })
  }).timeout(0)
  */
  it('should be able to do something', (done) => {
    Metalsmith('test/fixtures')
    .use(plugin({
      auth: config.get('metalsmith-google-drive'),
      src: '0B1QpLgu4mpt8YXJTYzRlZURkazg',
      dest: 'articles'
    }))
    .build((err, files) => {
      if (err) return done(err)
      done()
    })
  }).timeout(0)
})
