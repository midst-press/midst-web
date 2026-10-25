import path from 'path'

// With no window, the real DOMPurify's sanitize returns its input unchanged. Rendering must throw instead (#340).
// This suite runs under the node environment, and maps 'dompurify' to the real module rather than the jsdom shim.
it('rendering with no window throws, and returns nothing unsanitised', () => {
  expect(typeof window).toBe('undefined')
  jest.isolateModules(() => {
    jest.doMock('dompurify', () => require(path.join(__dirname, '../../node_modules/dompurify/dist/purify.cjs.js')))
    const { renderMarkdown } = require('../markdown')
    const allowed = { tags: ['p'], attributes: {} }
    expect(() => renderMarkdown('<img src=x onerror="x()">', allowed)).toThrow('no DOM to sanitise with')
    expect(() => renderMarkdown('zq', allowed)).toThrow('no DOM to sanitise with')
  })
})
