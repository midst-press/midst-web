import { describeBuild } from '../build-info'

// What the About page says about the build in front of the reader (issue #77).

describe('describeBuild', () => {
  it('says only "Development build" when nothing was passed to the build', () => {
    expect(describeBuild({})).toBe('Development build')
    expect(describeBuild({ tag: '', commit: '', date: '' })).toBe('Development build')
    expect(describeBuild({ tag: '  ', commit: ' ' })).toBe('Development build')
  })

  it('shows the tag exactly as written, the commit and the commit date in UTC', () => {
    expect(describeBuild({ tag: 'v0.3.0-beta.1', commit: 'a1b2c3d', date: '2026-10-14T09:30:00+13:00' }))
      .toBe('Version v0.3.0-beta.1, commit a1b2c3d, committed 2026-10-13 20:30 UTC')
  })

  it('says a build from a commit with no tag is untagged, and never invents a version', () => {
    expect(describeBuild({ commit: 'a1b2c3d', date: '2026-10-13T20:30:00Z' }))
      .toBe('Untagged build, commit a1b2c3d, committed 2026-10-13 20:30 UTC')
  })

  it('keeps a dirty marker on the commit visible', () => {
    expect(describeBuild({ tag: 'v0.3.0', commit: 'a1b2c3d-dirty', date: '2026-10-13T20:30:00Z' }))
      .toBe('Version v0.3.0, commit a1b2c3d-dirty, committed 2026-10-13 20:30 UTC')
  })

  it('leaves out a part that was not passed, without guessing it', () => {
    expect(describeBuild({ tag: 'v0.3.0' })).toBe('Version v0.3.0')
    expect(describeBuild({ tag: 'v0.3.0', commit: 'a1b2c3d' })).toBe('Version v0.3.0, commit a1b2c3d')
    expect(describeBuild({ date: '2026-10-13T20:30:00Z' })).toBe('Untagged build, committed 2026-10-13 20:30 UTC')
  })

  it('shows a date it cannot read as it was given, so a wrong input is seen and not hidden', () => {
    expect(describeBuild({ tag: 'v0.3.0', commit: 'a1b2c3d', date: 'zq not a date' }))
      .toBe('Version v0.3.0, commit a1b2c3d, committed zq not a date')
  })
})

describe('BUILD', () => {
  const KEYS = ['MIDST_BUILD_TAG', 'MIDST_BUILD_COMMIT', 'MIDST_BUILD_DATE'] as const
  const saved: Record<string, string | undefined> = {}
  beforeEach(() => { for (const key of KEYS) saved[key] = process.env[key] })
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    jest.resetModules()
  })

  it('is read from the three build inputs', () => {
    process.env.MIDST_BUILD_TAG = 'v9.9.9-zq'
    process.env.MIDST_BUILD_COMMIT = 'zq12345'
    process.env.MIDST_BUILD_DATE = '2001-02-03T04:05:00Z'
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const info = require('../build-info') as typeof import('../build-info')
    expect(info.BUILD_DESCRIPTION).toBe('Version v9.9.9-zq, commit zq12345, committed 2001-02-03 04:05 UTC')
  })

  it('is a development build when none is set', () => {
    for (const key of KEYS) delete process.env[key]
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const info = require('../build-info') as typeof import('../build-info')
    expect(info.BUILD_DESCRIPTION).toBe('Development build')
  })
})
