// react-router 7 (#342) uses TextEncoder and TextDecoder as it loads. Every browser has them, and so does Node, but
// jsdom's test environment does not expose them, so a jsdom test that renders a route could not load the router.
// They are taken from Node only where the environment lacks them, as jest-web-streams.setup.js does for streams.
const util = require('util')

for (const name of ['TextEncoder', 'TextDecoder']) {
  if (typeof globalThis[name] === 'undefined') globalThis[name] = util[name]
}
