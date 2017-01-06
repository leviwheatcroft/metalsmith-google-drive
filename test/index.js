import Metalsmith from 'metalsmith'
import assert from 'assert'
import googleDrive from '../lib'
import config from 'config'
import lint from 'mocha-eslint'

// lint(['lib/index.js'])

describe('metalsmith-google-drive', () => {
  it('should be able to do something', (done) => {
    Metalsmith('test/fixtures')
    .use(googleDrive({
      auth: config.get('metalsmith-google-drive'),
      src: '0B1QpLgu4mpt8R1hHWi1wWFkyV2s',
      dest: 'articles'
    }))
    .build((err, files) => {
      if (err) return done(err)
      done()
    })
  }).timeout(0)
})
