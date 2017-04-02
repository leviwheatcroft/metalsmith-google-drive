import google from 'googleapis'
import GoogleAuth from 'google-auth-library'
import { params } from '../store'
import fs from 'fs'
import config from 'config'

const auth = config.get('metalsmith-google-drive')

const googleAuth = new GoogleAuth()
const oauth = new googleAuth.OAuth2(
  auth.client_id,
  auth.client_secret,
  auth.redirect_uris[0]
)
oauth.credentials = params.getToken()

const drive = google.drive({
  version: 'v3',
  auth: oauth
})

function download (fileId) {
  drive.files.get({
    fileId: fileId
  }, function (err, metadata) {
    if (err) {
      console.error(err)
      return process.exit()
    }

    console.log('Downloading %s...', metadata.name)

    //  auth.setCredentials(tokens)

    var dest = fs.createWriteStream(metadata.name)

    drive.files.get({
      fileId: fileId,
      alt: 'media'
    })
    .on('error', function (err) {
      console.log('Error downloading file', err)
      process.exit()
    })
    .pipe(dest)

    dest
      .on('finish', function () {
        console.log('Downloaded %s!', metadata.name)
        process.exit()
      })
      .on('error', function (err) {
        console.log('Error writing file', err)
        process.exit()
      })
  })
}

download('0B1QpLgu4mpt8SVVOeGdqdFoyc2c')
