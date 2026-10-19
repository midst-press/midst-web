// The About page's build line is read from three build inputs (issue #77). Its wording is the
// editor's, from midst-format's build-label, and is tested there.

describe('BUILD_DESCRIPTION', () => {
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
