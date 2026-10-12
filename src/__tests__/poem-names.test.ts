// The objects in the bucket are the fixed point, not the code. Every expectation below pins the
// DEPLOYED behaviour of src/poems/poem-names.js exactly, quirks included. A failing test here means
// a URL the site asks for has moved. All data is synthetic.
import * as names from '../poems/poem-names'

describe('authorId', () => {
  it('lower-cases', () => {
    expect(names.authorId('ZQ XV')).toBe('zq-xv')
  })

  it('turns every space into a hyphen, without collapsing', () => {
    expect(names.authorId('zq xv kj')).toBe('zq-xv-kj')
    expect(names.authorId('zq  xv')).toBe('zq--xv')
    expect(names.authorId(' zq ')).toBe('-zq-')
  })

  it('leaves accents, apostrophes and existing hyphens untouched', () => {
    expect(names.authorId("ZqÉ O'Xv-Kj")).toBe("zqé-o'xv-kj")
  })
})

describe('poemUrl', () => {
  it('lower-cases and turns spaces into hyphens', () => {
    expect(names.poemUrl('Zq XV kj')).toBe('zq-xv-kj')
  })

  it('removes every comma', () => {
    expect(names.poemUrl('zq, xv, kj,wm')).toBe('zq-xv-kjwm')
  })

  it('removes italic tags globally, including two spans', () => {
    expect(names.poemUrl('<i>zq</i> xv <i>kj</i>')).toBe('zq-xv-kj')
  })

  it('removes italic tags before slashes, so no stray <i> survives', () => {
    // Old order: slash removal turned </i> into <i>, and the single replace was already spent.
    expect(names.poemUrl('<i>zq</i>')).toBe('zq')
    expect(names.poemUrl('<i>zq</i><i>xv</i>')).toBe('zqxv')
  })

  it('removes upper-case italic tags too, because lower-casing runs first', () => {
    expect(names.poemUrl('<I>zq</I>')).toBe('zq')
  })

  it('removes every slash', () => {
    expect(names.poemUrl('zq/xv/kj')).toBe('zqxvkj')
  })

  it('removes the first "-:)" only, as deployed', () => {
    // The later ")" replace then eats the first ")" of the surviving second occurrence.
    expect(names.poemUrl('zq-:)xv')).toBe('zqxv')
    expect(names.poemUrl('zq-:)xv-:)kj')).toBe('zqxv-:kj')
  })

  it('removes the first "{::" only, as deployed', () => {
    // The later "{" replace then eats the "{" of the surviving second occurrence.
    expect(names.poemUrl('zq{::xv{::kj')).toBe('zqxv::kj')
  })

  it('removes the first "::}" only, as deployed', () => {
    // The later "}" replace then eats the "}" of the surviving second occurrence.
    expect(names.poemUrl('zq::}xv::}kj')).toBe('zqxv::kj')
  })

  it('removes the first "{" only, as deployed', () => {
    expect(names.poemUrl('zq{xv{kj')).toBe('zqxv{kj')
  })

  it('removes the first "}" only, as deployed', () => {
    expect(names.poemUrl('zq}xv}kj')).toBe('zqxv}kj')
  })

  it('removes the first "(" only, as deployed', () => {
    expect(names.poemUrl('zq(xv(kj')).toBe('zqxv(kj')
  })

  it('removes the first ")" only, as deployed', () => {
    expect(names.poemUrl('zq)xv)kj')).toBe('zqxv)kj')
  })

  it('removes the first "#" only, as deployed', () => {
    expect(names.poemUrl('zq#xv#kj')).toBe('zqxv#kj')
  })

  it('removes one trailing hyphen, only at the end', () => {
    expect(names.poemUrl('zq-')).toBe('zq')
    expect(names.poemUrl('zq-xv')).toBe('zq-xv')
    expect(names.poemUrl('zq xv ')).toBe('zq-xv')
  })

  it('removes only one trailing hyphen before collapsing the rest', () => {
    // 'zq--' -> trailing hyphen removed -> 'zq-' -> nothing left to collapse.
    expect(names.poemUrl('zq--')).toBe('zq-')
    expect(names.poemUrl('zq---')).toBe('zq-')
  })

  it('collapses every double hyphen to one', () => {
    expect(names.poemUrl('zq--xv--kj')).toBe('zq-xv-kj')
  })

  it('turns a triple hyphen into a double hyphen (collapse is not repeated)', () => {
    expect(names.poemUrl('zq---xv')).toBe('zq--xv')
    expect(names.poemUrl('zq----xv')).toBe('zq--xv')
  })

  it('removes every double quote', () => {
    expect(names.poemUrl('"zq" "xv"')).toBe('zq-xv')
  })

  describe('where the order of rules matters', () => {
    it('collapses a double hyphen created by removing brackets', () => {
      expect(names.poemUrl('zq (xv) kj')).toBe('zq-xv-kj')
    })

    it('collapses a double hyphen created by removing a slash between spaces', () => {
      expect(names.poemUrl('zq / xv')).toBe('zq-xv')
    })

    it('collapses a double hyphen created by a spaced hyphen', () => {
      expect(names.poemUrl('zq - xv')).toBe('zq--xv')
    })

    it('strips a trailing hyphen created by removing a final bracket', () => {
      expect(names.poemUrl('zq (')).toBe('zq')
      expect(names.poemUrl('zq xv (kj)')).toBe('zq-xv-kj')
    })

    it('strips a trailing hyphen created by removing a final italic tag', () => {
      expect(names.poemUrl('zq <i>xv</i>')).toBe('zq-xv')
      expect(names.poemUrl('zq <i></i>')).toBe('zq')
    })

    it('leaves a hyphen that is only trailing after quotes are removed (deployed behaviour)', () => {
      // Quotes go last, so the trailing-hyphen rule has already looked at '-"'.
      expect(names.poemUrl('zq "')).toBe('zq-')
    })

    it('does not collapse a double hyphen created by removing quotes (deployed behaviour)', () => {
      expect(names.poemUrl('zq "" xv')).toBe('zq--xv')
    })

    it('does not strip a hyphen that a double-hyphen collapse leaves at the end (deployed behaviour)', () => {
      // 'zq xv - ' -> 'zq-xv---' -> trailing removed 'zq-xv--' -> collapsed 'zq-xv-'.
      expect(names.poemUrl('zq xv - ')).toBe('zq-xv-')
    })
  })
})

describe('poemId', () => {
  it('joins the author id and the title url with a double hyphen', () => {
    expect(names.poemId('Zq Xv', 'Kj, Wm')).toBe('zq-xv--kj-wm')
  })
})

describe('poemFolder', () => {
  it('uses the override when present', () => {
    expect(names.poemFolder({ author: 'Zq Xv', authorSecondaryFolder: 'kj-folder' })).toBe('kj-folder')
  })

  it('derives the author id when there is no override', () => {
    expect(names.poemFolder({ author: 'Zq Xv' })).toBe('zq-xv')
  })

  it('falls back to the derived id for an empty-string override', () => {
    expect(names.poemFolder({ author: 'Zq Xv', authorSecondaryFolder: '' })).toBe('zq-xv')
  })
})

describe('timelapseObjectName', () => {
  it('uses the derived folder without an override', () => {
    expect(names.timelapseObjectName({ author: 'Zq Xv', title: 'Kj Wm' })).toBe('zq-xv/zq-xv--kj-wm.midst.zip')
  })

  it('uses the override folder but keeps the derived poem id', () => {
    expect(names.timelapseObjectName({ author: 'Zq Xv', title: 'Kj Wm', authorSecondaryFolder: 'zq-folder' })).toBe(
      'zq-folder/zq-xv--kj-wm.midst.zip'
    )
  })

  it('does not URL-encode accents or percent signs', () => {
    expect(names.timelapseObjectName({ author: 'Zq', title: 'é%' })).toBe('zq/zq--é%.midst.zip')
  })
})

describe('processNoteObjectName', () => {
  it('uses the derived folder without an override', () => {
    expect(names.processNoteObjectName({ author: 'Zq Xv' })).toBe('zq-xv/zq-xv.md')
  })

  it('uses the override folder with the derived author id', () => {
    expect(names.processNoteObjectName({ author: 'Zq Xv', authorSecondaryFolder: 'zq-folder' })).toBe('zq-folder/zq-xv.md')
  })

  it('is keyed on the author, so two titles by one author share a note', () => {
    const first = names.processNoteObjectName({ author: 'Zq Xv', title: 'Kj' } as { author: string })
    const second = names.processNoteObjectName({ author: 'Zq Xv', title: 'Wm' } as { author: string })
    expect(first).toBe('zq-xv/zq-xv.md')
    expect(second).toBe(first)
  })

  it('does not URL-encode the author id', () => {
    expect(names.processNoteObjectName({ author: 'Zé%' })).toBe('zé%/zé%.md')
  })
})

describe('unicode', () => {
  it('gives different ids for NFC and NFD spellings of the same author (no normalisation)', () => {
    const nfc = 'zéq'
    const nfd = 'zéq'
    expect(nfc.normalize('NFD')).toBe(nfd)
    expect(names.authorId(nfc)).toBe('zéq')
    expect(names.authorId(nfd)).toBe('zéq')
    expect(names.authorId(nfc)).not.toBe(names.authorId(nfd))
  })
})
