'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (pattern) {
  if ((0, _lodash.isString)(pattern)) pattern = [pattern];
  return (files, metalsmith, done) => {
    const matches = (0, _multimatch2.default)((0, _lodash.keys)(files), pattern);
    const iterator = () => {
      const src = matches.shift();
      const meta = files[src];
      magic.detect(meta.contents, (err, mimeType) => {
        if (err) throw err;
        meta.mimeType = mimeType;
        dbg(`${ src } > ${ mimeType }`);
        if (matches.length) process.nextTick(iterator);else done();
      });
    };
    iterator();
  };
};

var _lodash = require('lodash');

var _multimatch = require('multimatch');

var _multimatch2 = _interopRequireDefault(_multimatch);

var _mmmagic = require('mmmagic');

var _mmmagic2 = _interopRequireDefault(_mmmagic);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const magic = new _mmmagic2.default.Magic(_mmmagic2.default.MAGIC_MIME_TYPE);
const dbg = (0, _debug2.default)('metalsmith-mime-type');

/**
 * ## default fn
 * this fn is exported as the module, designed to be called by `metalsmith#use`
 *
 * ```
 * .use(move(['*', '!*.jpg'])
 * ```
 *
 * @param {String|Array} pattern - one or more multimatch patterns
 */