// The zip library (@zip.js/zip.js, #270) uses the web streams every browser it supports has. Node has them too, but
// jsdom's test environment does not expose them, so a jsdom test that imports the poem store could not load it.
// They are taken from Node only where the environment lacks them; the node environment already has its own.
const streams = require('stream/web')

for (const name of ['ReadableStream', 'WritableStream', 'TransformStream']) {
  if (typeof globalThis[name] === 'undefined') globalThis[name] = streams[name]
}
