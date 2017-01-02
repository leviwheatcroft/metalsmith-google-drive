# metalsmith-mime-type

![nodei.co](https://nodei.co/npm/metalsmith-mime-type.png?downloads=true&downloadRank=true&stars=true)

![npm](https://img.shields.io/npm/v/metalsmith-mime-type.svg)

![github-issues](https://img.shields.io/github/issues/leviwheatcroft/metalsmith-mime-type.svg)

![stars](https://img.shields.io/github/stars/leviwheatcroft/metalsmith-mime-type.svg)

![forks](https://img.shields.io/github/forks/leviwheatcroft/metalsmith-mime-type.svg)

[metalsmith](metalsmith.io) plugin to detect mime types from file contents

This plugin is a thin wrapper around
[mmmagic](https://www.npmjs.com/package/mmmagic) which inspects the contents of
files to determine mime type rather than simply looking up the file extension

Take a look at the
[annotated source](https://leviwheatcroft.github.io/metalsmith-mime-type/lib/index.js.html)

## install

`npm i --save metalsmith-mime-type`

## usage

```
mimeType = require('metalsmith-mime-type')

metalsmith(__dirname)
.use(mimeType(['**/*','!*.jpg']))
.build(callback)
```

## options

A single option, `src` is used as a minimatch mask to determine what files
need to to have mimetypes assigned. can be passed in as an object property,
or as a string. See usage example.

## node 4 LTS

`var mimeType = require('metalsmith-mime-type/dist/node4')`

## Author

Levi Wheatcroft <levi@wht.cr>

## Contributing

Contributions welcome; Please submit all pull requests against the master
branch.

## License

 - **MIT** : http://opensource.org/licenses/MIT
