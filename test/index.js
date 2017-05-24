import plugin from '../lib'
import {
  back as nockBack
} from 'nock'
import config from 'config'
import debug from 'debug'
import { join } from 'path'
import { assert } from 'chai'
import Metalsmith from 'metalsmith'
import sinon from 'sinon'
import hjson from 'hjson'
import { writeFileSync, readFileSync } from 'fs'

const dbg = debug('metalsmith-google-drive')
nockBack.setMode('record')
nockBack.fixtures = 'test/fixtures/scrape'

describe('metalsmith-google-drive test', () => {
  beforeEach(() => {
    // create spy
    // sinon.spy(cloudinary.api, 'resources')
  })
  afterEach(() => {
    // cloudinary.api.resources.restore()
  })
  it('should be able to scrape a folder', (done) => {
    nockBack('nock', (writeRequests) => {
      Metalsmith('test/fixtures/scrape')
      .use(plugin({
        auth: config.get('metalsmith-google-drive'),
        src: '0B1QpLgu4mpt8YXJTYzRlZURkazg',
        dest: 'articles',
        invalidateCache: true
      }))
      .build((err, files) => {
        if (err) return done(err)
        // writeRequests()
        done()
      })
    })
  }).timeout(0)
})
