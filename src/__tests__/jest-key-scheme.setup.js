// Unit tests import modules that import src/config.ts, which refuses to load without a key scheme.
// Tests that are about the scheme name it themselves (config.test.ts, key-scheme.test.ts,
// actions.test.ts); every other test gets "legacy" here, whatever the shell has set.
// Likewise the poem list (#110): "bundled" here; the tests about it name their own.
process.env.MIDST_KEY_SCHEME = 'legacy'
process.env.MIDST_POEM_LIST = 'bundled'
