// MIDST_POEM_LIST in config.ts (#110): required, no default, same style of error as MIDST_KEY_SCHEME.
type ConfigModule = typeof import('../config')

function loadConfig(list: string | undefined): ConfigModule {
  const saved = process.env.MIDST_POEM_LIST
  if (list === undefined) delete process.env.MIDST_POEM_LIST
  else process.env.MIDST_POEM_LIST = list
  jest.resetModules()
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../config') as ConfigModule
  } finally {
    process.env.MIDST_POEM_LIST = saved
  }
}

describe('config POEM_LIST', () => {
  it.each(['bundled', 'published'] as const)('is %s when MIDST_POEM_LIST says so', list => {
    expect(loadConfig(list).POEM_LIST).toBe(list)
  })

  it('refuses to load with no MIDST_POEM_LIST: there is no default', () => {
    expect(() => loadConfig(undefined)).toThrow('MIDST_POEM_LIST must be "bundled" or "published"; it is not set. There is no default.')
  })

  it('refuses a value it does not know', () => {
    expect(() => loadConfig('both')).toThrow('it is "both"')
  })
})
