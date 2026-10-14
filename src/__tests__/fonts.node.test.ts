/** @jest-environment node */
import { installFonts } from '../fonts'

// The unit tests import the player under Node. fonts.test.ts runs under jsdom, so this is the only
// test of that case.
it('does nothing where there is no document', () => {
  expect(typeof document).toBe('undefined')
  expect(() => installFonts()).not.toThrow()
})
