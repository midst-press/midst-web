import { Call } from '../app/publisher'
import { closingFromText, loadPatronsList, savePatronsList, visibilitiesFor } from '../app/patrons'

// The publisher's patrons routes (docs/app-api.md, "Patrons"; #58). Names are invented.

const A = '11111111-1111-4111-8111-111111111111'

describe('the patrons calls', () => {
  it('use the contract’s routes, methods and bodies; a new patron is sent without an id', async () => {
    const call = jest.fn(async () => ({})) as unknown as Call & jest.Mock
    await loadPatronsList(call)
    await savePatronsList(call, [{ id: A, name: 'Zq Vel', visibility: 'private' }, { name: 'Orrin Taf', visibility: 'public' }], 'Anonymous donors', '"p1"')
    await savePatronsList(call, [], null, 'none')
    expect(call.mock.calls).toEqual([
      ['/publisher/patrons'],
      ['/publisher/patrons', {
        method: 'PUT',
        body: {
          patronsEtag: '"p1"',
          patrons: [{ id: A, name: 'Zq Vel', visibility: 'private' }, { name: 'Orrin Taf', visibility: 'public' }],
          closing: 'Anonymous donors',
        },
      }],
      ['/publisher/patrons', { method: 'PUT', body: { patronsEtag: 'none', patrons: [], closing: null } }],
    ])
  })
})

describe('the visibilities the form offers', () => {
  it('public and private either way; undetermined settled as either; never back to undetermined', () => {
    expect(visibilitiesFor('public')).toEqual(['public', 'private'])
    expect(visibilitiesFor('private')).toEqual(['public', 'private'])
    expect(visibilitiesFor('undetermined')).toEqual(['undetermined', 'public', 'private'])
  })

  it('a patron added on the page is public or private, never undetermined', () => {
    expect(visibilitiesFor(null)).toEqual(['public', 'private'])
  })
})

describe('the closing line', () => {
  it('is null when blank, and trimmed when not', () => {
    expect(closingFromText('  ')).toBeNull()
    expect(closingFromText('')).toBeNull()
    expect(closingFromText(' Anonymous donors ')).toBe('Anonymous donors')
  })
})
