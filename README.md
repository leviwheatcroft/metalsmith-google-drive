# metalsmith-google-drive

![nodei.co](https://nodei.co/npm/metalsmith-google-drive.png?downloads=true&downloadRank=true&stars=true)

![npm](https://img.shields.io/npm/v/metalsmith-google-drive.svg)

![github-issues](https://img.shields.io/github/issues/leviwheatcroft/metalsmith-google-drive.svg)

![stars](https://img.shields.io/github/stars/leviwheatcroft/metalsmith-google-drive.svg)

![forks](https://img.shields.io/github/forks/leviwheatcroft/metalsmith-google-drive.svg)

[metalsmith](https://metalsmith.io) to scrape files from google drive

Highlights:

 * requests token authorisation via CLI
 * caches token and files, only requests changed files
 * no tests yet


See the [annotated source][1] or [github repo][4]

## install

sorry not published to npm just yet...

`npm i --save github:leviwheatcroft/metalsmith-google-drive`

## usage

### api credentials

Follow [this guide][2], go through A to G under *Step 1*, the downloaded file
will contain the credentials you need to pass into this plugin. In these
examples I'm using [config][3] to store them.

### example

```javascript
Metalsmith('src')
.use(googleDrive({
  auth: config.get('driveAuth'),
  src: '0B1QpLgu4qk48R1hDBi1wWFkyV2s',
  dest: 'articles'
}))
.build( ... )
```

### options

 * `src` {String} being the drive id of the parent folder you want to scrape
 * `dest` {String} the path under which you want to place the scraped files in
    metalsmith
 * `auth` {Object} containing `client_id`, `client_secret` and `redirect_uris`
 * `cache` {Boolean} (default: true) store files in cache

### notes

 * to get a google drive folder id just view it in your browser and copy the id
   from the url
 * files in subfolders on google drive will be included, but their containing
   folders will not be included in the path in metalsmith. In otherwords, this
   plugin does a recursive search but flattens the result.
 * files scraped from drive will not be stored in your source folder, they're
   added directly to metalsmith `files` structure during build.

## node 4 LTS

`var drive = require('metalsmith-google-drive/dist/node4')`

## Author

Levi Wheatcroft <levi@wht.cr>

## Contributing

Contributions welcome; Please submit all pull requests against the master
branch.

## License

 - **MIT** : http://opensource.org/licenses/MIT

[1]: https://leviwheatcroft.github.io/metalsmith-google-drive "fancy annotated source"
[2]: https://developers.google.com/drive/v3/web/quickstart/nodejs "google drive nodejs quickstart"
[3]: https://www.npmjs.com/package/config "config package on npm registry"
[4]: https://github.com/leviwheatcroft/metalsmith-google-drive "github repo"
