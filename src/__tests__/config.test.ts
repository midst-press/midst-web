const PROD_AUTHORS = 'https://d3nlqr52a31o6y.cloudfront.net/midst-press/authors/production/'
const PROD_SHAPES = 'https://d3nlqr52a31o6y.cloudfront.net/midst-press/site/shapes/'

const POEMS_OVERRIDE = 'http://127.0.0.1:8099/zq/poems/'
const MEDIA_OVERRIDE = 'http://127.0.0.1:8099/zq/media/'
const SHAPES_OVERRIDE = 'http://127.0.0.1:8099/zq/shapes/'

const KEYS = ['MIDST_POEMS_URL', 'MIDST_MEDIA_URL', 'MIDST_SHAPES_URL', 'MIDST_FONTS_URL'] as const

type ConfigModule = typeof import('../config')

const saved: Record<string, string | undefined> = {}

function loadConfig(env: Partial<Record<(typeof KEYS)[number], string>>): ConfigModule {
  for (const key of KEYS) {
    delete process.env[key]
  }
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value
  }
  jest.resetModules()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../config') as ConfigModule
}

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key]
  }
})

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = saved[key]
    }
  }
  jest.resetModules()
})

describe('config asset origins', () => {
  it('defaults every origin to production with no variables set', () => {
    const config = loadConfig({})
    expect(config.POEMS_URL).toBe('https://d3nlqr52a31o6y.cloudfront.net/midst-press/authors/production/')
    expect(config.MEDIA_URL).toBe('https://d3nlqr52a31o6y.cloudfront.net/midst-press/authors/production/')
    expect(config.SHAPES_URL).toBe('https://d3nlqr52a31o6y.cloudfront.net/midst-press/site/shapes/')
    expect(config.USING_NON_PRODUCTION_ASSETS).toBe(false)
  })

  it('changes only POEMS_URL when only MIDST_POEMS_URL is set', () => {
    const config = loadConfig({ MIDST_POEMS_URL: POEMS_OVERRIDE })
    expect(config.POEMS_URL).toBe(POEMS_OVERRIDE)
    expect(config.MEDIA_URL).toBe(PROD_AUTHORS)
    expect(config.SHAPES_URL).toBe(PROD_SHAPES)
    expect(config.USING_NON_PRODUCTION_ASSETS).toBe(true)
  })

  it('changes only MEDIA_URL when only MIDST_MEDIA_URL is set', () => {
    const config = loadConfig({ MIDST_MEDIA_URL: MEDIA_OVERRIDE })
    expect(config.POEMS_URL).toBe(PROD_AUTHORS)
    expect(config.MEDIA_URL).toBe(MEDIA_OVERRIDE)
    expect(config.SHAPES_URL).toBe(PROD_SHAPES)
    expect(config.USING_NON_PRODUCTION_ASSETS).toBe(true)
  })

  it('changes only SHAPES_URL when only MIDST_SHAPES_URL is set', () => {
    const config = loadConfig({ MIDST_SHAPES_URL: SHAPES_OVERRIDE })
    expect(config.POEMS_URL).toBe(PROD_AUTHORS)
    expect(config.MEDIA_URL).toBe(PROD_AUTHORS)
    expect(config.SHAPES_URL).toBe(SHAPES_OVERRIDE)
    expect(config.USING_NON_PRODUCTION_ASSETS).toBe(true)
  })

  it('applies all three overrides together', () => {
    const config = loadConfig({
      MIDST_POEMS_URL: POEMS_OVERRIDE,
      MIDST_MEDIA_URL: MEDIA_OVERRIDE,
      MIDST_SHAPES_URL: SHAPES_OVERRIDE,
    })
    expect(config.POEMS_URL).toBe(POEMS_OVERRIDE)
    expect(config.MEDIA_URL).toBe(MEDIA_OVERRIDE)
    expect(config.SHAPES_URL).toBe(SHAPES_OVERRIDE)
    expect(config.USING_NON_PRODUCTION_ASSETS).toBe(true)
  })

  it('falls back to production when variables are the empty string', () => {
    const config = loadConfig({ MIDST_POEMS_URL: '', MIDST_MEDIA_URL: '', MIDST_SHAPES_URL: '' })
    expect(config.POEMS_URL).toBe('https://d3nlqr52a31o6y.cloudfront.net/midst-press/authors/production/')
    expect(config.MEDIA_URL).toBe('https://d3nlqr52a31o6y.cloudfront.net/midst-press/authors/production/')
    expect(config.SHAPES_URL).toBe('https://d3nlqr52a31o6y.cloudfront.net/midst-press/site/shapes/')
    expect(config.USING_NON_PRODUCTION_ASSETS).toBe(false)
  })

  it('does not flag non-production when a variable equals the production URL', () => {
    const config = loadConfig({
      MIDST_POEMS_URL: 'https://d3nlqr52a31o6y.cloudfront.net/midst-press/authors/production/',
      MIDST_MEDIA_URL: 'https://d3nlqr52a31o6y.cloudfront.net/midst-press/authors/production/',
      MIDST_SHAPES_URL: 'https://d3nlqr52a31o6y.cloudfront.net/midst-press/site/shapes/',
    })
    expect(config.POEMS_URL).toBe('https://d3nlqr52a31o6y.cloudfront.net/midst-press/authors/production/')
    expect(config.MEDIA_URL).toBe('https://d3nlqr52a31o6y.cloudfront.net/midst-press/authors/production/')
    expect(config.SHAPES_URL).toBe('https://d3nlqr52a31o6y.cloudfront.net/midst-press/site/shapes/')
    expect(config.USING_NON_PRODUCTION_ASSETS).toBe(false)
  })
})

describe('config fonts origin', () => {
  it('defaults to fonts/ at the site origin', () => {
    expect(loadConfig({}).FONTS_URL).toBe('/fonts/')
    expect(loadConfig({ MIDST_FONTS_URL: '' }).FONTS_URL).toBe('/fonts/')
  })

  it('takes an override, and does not mark the build as showing non-production data', () => {
    const config = loadConfig({ MIDST_FONTS_URL: 'http://127.0.0.1:8099/zq/fonts/' })
    expect(config.FONTS_URL).toBe('http://127.0.0.1:8099/zq/fonts/')
    expect(config.POEMS_URL).toBe(PROD_AUTHORS)
    expect(config.USING_NON_PRODUCTION_ASSETS).toBe(false)
  })
})

describe('config plain constants', () => {
  it('exposes the site title, page title and arrow key mode', () => {
    const config = loadConfig({})
    expect(config.BASE_SITE_TITLE).toBe('Midst')
    expect(config.BASE_SITE_PAGE_TITLE).toBe('Midst:')
    expect(config.POEM_ARROW_KEY).toBe('timeline')
  })
})
