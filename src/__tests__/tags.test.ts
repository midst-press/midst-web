import { Call } from '../app/publisher'
import { contrast, loadTags, saveTags, tagsAfterToggle, textColourFor } from '../app/tags'

// The tags' calls and arithmetic (#310). Names are invented.

describe('textColourFor', () => {
  it('is black on light colours and white on dark ones', () => {
    expect(textColourFor('#ffffff')).toBe('#000000')
    expect(textColourFor('#ffff00')).toBe('#000000')
    expect(textColourFor('#000000')).toBe('#ffffff')
    expect(textColourFor('#00008b')).toBe('#ffffff')
  })

  it('always reads at WCAG AA (4.5:1) or better, over every colour of a 4096-colour grid and its edges', () => {
    const steps = [...Array(16).keys()].map(i => (i * 17).toString(16).padStart(2, '0'))
    let worst = 21
    for (const r of steps) for (const g of steps) for (const b of steps) {
      const colour = `#${r}${g}${b}`
      worst = Math.min(worst, contrast(colour, textColourFor(colour)))
    }
    expect(worst).toBeGreaterThanOrEqual(4.5)
  })

  it('takes the contrast the way WCAG defines it: 21 for black on white, 1 for a colour on itself, either order', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrast('#2e8b57', '#2e8b57')).toBe(1)
  })
})

describe('tagsAfterToggle', () => {
  const tags = [{ id: 'ta', name: 'Zq A', colour: '#000000' }, { id: 'tb', name: 'Zq B', colour: '#ffffff' }, { id: 'tc', name: 'Zq C', colour: '#2e8b57' }]
  it('adds or removes the one tag, in the tags\' order', () => {
    expect(tagsAfterToggle(tags, ['tc'], 'ta')).toEqual(['ta', 'tc'])
    expect(tagsAfterToggle(tags, ['ta', 'tc'], 'ta')).toEqual(['tc'])
    expect(tagsAfterToggle(tags, undefined, 'tb')).toEqual(['tb'])
  })
  it('sends back only tag ids: a legacy word, or an id that is no longer a tag, is dropped', () => {
    expect(tagsAfterToggle(tags, ['Mexico', 'gone', 'tb'], 'ta')).toEqual(['ta', 'tb'])
  })
})

describe('the tags routes', () => {
  it('load, and save the whole list on its etag', async () => {
    const call = jest.fn(async () => ({})) as unknown as Call & jest.Mock
    await loadTags(call)
    await saveTags(call, [{ id: 'ta', name: 'Zq A', colour: '#000000' }, { name: 'Zq New', colour: '#ffffff' }], '"t1"')
    expect(call.mock.calls).toEqual([
      ['/publisher/tags'],
      ['/publisher/tags', { method: 'PUT', body: { tagsEtag: '"t1"', tags: [{ id: 'ta', name: 'Zq A', colour: '#000000' }, { name: 'Zq New', colour: '#ffffff' }] } }],
    ])
  })
})
