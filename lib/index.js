// import {
//   isString,
//   keys
// } from 'lodash'
import debug from 'debug'
import vow from 'vow'
import readline from 'readline'
import google from 'googleapis'
import GoogleAuth from 'google-auth-library'
import {
  tmpdir
} from 'os'
import {
  join
} from 'path'
import {
  readFileSync as readFile,
  writeFileSync as writeFile,
  exists
} from 'fs'

const dbg = debug('metalsmith-google-drive')

export default function (auth, src, dest, done) {
  const googleAuth = new GoogleAuth()
  const oauth2Client = new googleAuth.OAuth2(
    auth.client_id,
    auth.client_secret,
    auth.redirect_uris[0]
  )
  dbg('auth', auth)
  vow.resolve()
  .then(tokenStore)
  .catch(() => tokenFlow(oauth2Client))
  .then((token) => {
    let defer = vow.defer()
    oauth2Client.credentials = token
    google.drive('v3').files.list({
      auth: oauth2Client,
      pageSize: 10,
      fields: 'nextPageToken, files(id, name)'
    }, (err, result) => {
      if (err) defer.reject(err)
      else defer.resolve(result)
    })
    return defer.promise()
  })
  .then((result) => {
    dbg('files', result)
  })
  .catch((err) => dbg('err', err))
  .then(done)

  // return (files, metalsmith, done) => {
  // }
}

function tokenStore (token) {
  const defer = vow.defer()
  const tokenPath = join(tmpdir(), 'metalsmith-google-drive.json')
  if (token) defer.resolve(writeFile(tokenPath, JSON.stringify(token)))
  else if (exists(tokenPath)) defer.resolve(JSON.parse(readFile(tokenPath)))
  else defer.reject()
  return defer.promise()
}

function tokenFlow (oauth2Client) {
  const defer = vow.defer()
  let prompt
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.metadata.readonly']
  })
  console.log('authorise metalsmith-google-drive by visiting: ', authUrl)
  prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  prompt.question('Enter the code from that page here: ', (code) => {
    prompt.close()
    oauth2Client.getToken(code, (err, result) => {
      if (err) defer.reject(err)
      else tokenStore(result).then(() => defer.resolve(result))
    })
  })
  return defer.promise()
}
