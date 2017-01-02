import Metalsmith from 'metalsmith'
import assert from 'assert'
import googleDrive from '../lib'
import config from 'config'
import lint from 'mocha-eslint'

// lint(['lib/index.js'])

describe('metalsmith-mime-type', () => {
  it('should be able to do something', (done) => {
    googleDrive(config.get('metalsmith-google-drive'), 'src', 'dest', done)
  }).timeout(0)
})
