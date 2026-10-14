// Where the beta app is (src/app/config.ts): read at build time, all three needed.

const KEYS = ['MIDST_APP_API_URL', 'MIDST_APP_AUTH_DOMAIN', 'MIDST_APP_CLIENT_ID'] as const

function load(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key]
  Object.assign(process.env, env)
  jest.resetModules()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../app/config') as typeof import('../app/config')
}

afterAll(() => { for (const key of KEYS) delete process.env[key] })

describe('the app config', () => {
  it('is not available unless all three are set', () => {
    expect(load({}).APP_AVAILABLE).toBe(false)
    expect(load({ MIDST_APP_API_URL: 'https://a.example.invalid', MIDST_APP_AUTH_DOMAIN: 'x.example.invalid' }).APP_AVAILABLE).toBe(false)
    expect(load({ MIDST_APP_API_URL: 'https://a.example.invalid', MIDST_APP_AUTH_DOMAIN: 'x.example.invalid', MIDST_APP_CLIENT_ID: 'c' }).APP_AVAILABLE).toBe(true)
  })

  it('adds https:// to a domain given without a scheme, as the stack outputs it, and keeps one given with it', () => {
    expect(load({ MIDST_APP_AUTH_DOMAIN: 'zq.auth.ap-southeast-2.amazoncognito.com' }).APP_AUTH_DOMAIN)
      .toBe('https://zq.auth.ap-southeast-2.amazoncognito.com')
    expect(load({ MIDST_APP_AUTH_DOMAIN: 'https://zq.example.invalid/' }).APP_AUTH_DOMAIN).toBe('https://zq.example.invalid')
    expect(load({}).APP_AUTH_DOMAIN).toBe('')
  })

  it('drops the trailing slash a function URL comes with', () => {
    expect(load({ MIDST_APP_API_URL: 'https://zq.lambda-url.ap-southeast-2.on.aws/' }).APP_API_URL)
      .toBe('https://zq.lambda-url.ap-southeast-2.on.aws')
  })
})
