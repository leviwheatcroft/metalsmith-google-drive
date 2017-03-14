import plugin from '../lib'
import nock from 'nock'
import config from 'config'
import debug from 'debug'
import { join } from 'path'
import { assert } from 'chai'
import Metalsmith from 'metalsmith'
import sinon from 'sinon'
import { writeFileSync, readFileSync } from 'fs'

const dbg = debug('metalsmith-google-drive')

nock.recorder.rec()
function getFix (src) {
  let buffer = readFileSync(join('test/fixtures', src))
  return JSON.parse(buffer.toString('utf8'))
}

function setFix (value, src) {
  writeFileSync(join('test/fixtures', src), JSON.stringify(value))
}

describe('metalsmith-google-drive', () => {
  beforeEach(() => {
    // create spy
    // sinon.spy(cloudinary.api, 'resources')
  })
  afterEach(() => {
    // cloudinary.api.resources.restore()
  })
  it('should be able to scrape a folder', (done) => {
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
