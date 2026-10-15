import { Call } from '../app/publisher'
import { closingFromText, loadPatronsList, namesFromText, savePatronsList } from '../app/patrons'

// The publisher's patrons routes (docs/app-api.md, "Patrons"; #58). Names are invented.

describe('the patrons calls', () => {
  it('use the contract’s routes, methods and bodies', async () => {
    const call = jest.fn(async () => ({})) as unknown as Call & jest.Mock
    await loadPatronsList(call)
    await savePatronsList(call, ['Zq Vel', 'Orrin Taf'], 'Anonymous donors', '"p1"')
    await savePatronsList(call, [], null, 'none')
    expect(call.mock.calls).toEqual([
      ['/publisher/patrons'],
      ['/publisher/patrons', { method: 'PUT', body: { patronsEtag: '"p1"', patrons: ['Zq Vel', 'Orrin Taf'], closing: 'Anonymous donors' } }],
      ['/publisher/patrons', { method: 'PUT', body: { patronsEtag: 'none', patrons: [], closing: null } }],
    ])
  })
})

describe('the form’s text', () => {
  it('becomes one name per line, trimmed, blank lines left out, in order, whatever the line endings', () => {
    expect(namesFromText('  Orrin Taf \n\nZq Vel\r\n   \r\nLumb Quell\n')).toEqual(['Orrin Taf', 'Zq Vel', 'Lumb Quell'])
    expect(namesFromText('')).toEqual([])
    expect(namesFromText(' \n \n')).toEqual([])
  })

  it('keeps a name that appears twice: two patrons may share a name', () => {
    expect(namesFromText('Zq Vel\nZq Vel')).toEqual(['Zq Vel', 'Zq Vel'])
  })

  it('makes a blank closing line null, and trims one that is not', () => {
    expect(closingFromText('  ')).toBeNull()
    expect(closingFromText('')).toBeNull()
    expect(closingFromText(' Anonymous donors ')).toBe('Anonymous donors')
  })
})
