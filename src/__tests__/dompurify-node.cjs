// Jest maps 'dompurify' here (package.json, moduleNameMapper). DOMPurify needs a DOM, and most suites run under the
// node environment, where there is none: this is the real DOMPurify on the test's window, or on a jsdom one.
const path = require('path')
const createDOMPurify = require(path.join(__dirname, '../../node_modules/dompurify/dist/purify.cjs.js'))

module.exports = createDOMPurify(typeof window === 'undefined' ? new (require('jsdom').JSDOM)('').window : window)
