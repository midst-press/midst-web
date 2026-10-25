import { isSitePath } from '../sitePath'

// A path the router or a redirect may follow: one page of this site, never another origin (#340).
describe('isSitePath', () => {
  it.each(['/', '/me', '/submit', '/read/zq-xv?x=1#y'])('accepts %s', path => {
    expect(isSitePath(path)).toBe(true)
  })

  it.each([
    '', 'me', 'https://elsewhere.example.invalid/', '//elsewhere.example.invalid/',
    '/\\elsewhere.example.invalid/', '/me\\..\\x', '\\\\elsewhere.example.invalid',
    '/\t/elsewhere.example.invalid/', '/\n/elsewhere.example.invalid/', '/\r/elsewhere.example.invalid/',
    '/me\tx', '/me\nx', '/me\rx',
  ])('refuses %j', path => {
    expect(isSitePath(path)).toBe(false)
  })
})
