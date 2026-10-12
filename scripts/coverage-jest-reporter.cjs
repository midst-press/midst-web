// Jest reporter for `npm run coverage`: keeps the raw V8 coverage of each unit test file, so that
// scripts/coverage-merge.mjs can convert the unit layer with the same converter as the e2e layer.
// Jest's own istanbul JSON comes from a different converter, whose maps do not merge with it.
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join, relative } = require('node:path')

// The positive control, the one file outside src/ that the merge needs (e2e/coverage-control.ts).
const CONTROL = 'e2e/coverage-control.ts'

class RawV8Reporter {
  constructor(globalConfig) {
    this.root = globalConfig.rootDir
    this.out = join(this.root, 'coverage', 'unit-raw')
    this.count = 0
  }

  onTestResult(_test, testResult) {
    const entries = []
    for (const { codeTransformResult, result } of testResult.v8Coverage || []) {
      const path = relative(this.root, result.url.replace(/^file:\/\//, '')).split('\\').join('/')
      if (!(path.startsWith('src/') || path === CONTROL) || !codeTransformResult) continue
      entries.push({
        path,
        functions: result.functions,
        source: codeTransformResult.code,
        // Jest runs each module inside a function wrapper; V8's offsets include it.
        wrapperLength: codeTransformResult.wrapperLength || 0,
        sourceMap: codeTransformResult.sourceMapPath ? JSON.parse(readFileSync(codeTransformResult.sourceMapPath, 'utf8')) : null,
      })
    }
    if (!entries.length) return
    mkdirSync(this.out, { recursive: true })
    writeFileSync(join(this.out, `t${process.pid}-${this.count++}.json`), JSON.stringify(entries))
  }
}

module.exports = RawV8Reporter
