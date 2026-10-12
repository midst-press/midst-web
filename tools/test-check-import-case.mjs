#!/usr/bin/env node
// Does tools/check-import-case.mjs report a wrong-case import, and only that?
//
// Run: node --test tools/test-check-import-case.mjs
//
// Invented file names only. No filesystem and no git: the checker takes a list of tracked paths and
// a reader, which is also why its verdict does not depend on the platform it runs on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlHolds, findMismatches, specifiers } from './check-import-case.mjs';

const run = (files) => findMismatches(Object.keys(files), (f) => files[f]);
const found = (files) => run(files).mismatches.map((m) => `${m.file} ${m.specifier} -> ${m.tracked}`);

test('the built-in control holds', () => {
  assert.equal(controlHolds(), true);
});

test('correct imports of every supported shape are clean', () => {
  const result = run({
    'src/Zq.ts': '',
    'src/data/Xv.json': '{}',
    'src/kj/index.tsx': '',
    'src/wm.css': '',
    'src/user.ts': [
      "import a from './Zq'",
      "import b from './Zq.ts'",
      "export { c } from './kj'",
      "const d = require('./data/Xv.json')",
      "const e = require('./data/Xv')",
      "import('./kj/index')",
      "import './wm.css'",
    ].join('\n'),
  });
  assert.deepEqual(result, { mismatches: [], checked: 7, unresolved: 0 });
});

for (const [shape, line] of [
  ['import from', "import a from './zq'"],
  ['bare import', "import './zq'"],
  ['export from', "export { a } from './zq'"],
  ['require', "const a = require('./zq')"],
  ['dynamic import', "const a = import('./zq')"],
  ['explicit extension', "import a from './zq.ts'"],
]) {
  test(`a wrong-case file name is reported: ${shape}`, () => {
    assert.equal(found({ 'src/Zq.ts': '', 'src/user.tsx': line }).length, 1);
  });
}

test('the finding names the importer, the specifier and the tracked spelling', () => {
  assert.deepEqual(found({ 'src/Zq.ts': '', 'src/user.ts': "import a from './zq'" }), ['src/user.ts ./zq -> src/Zq.ts']);
});

test('a wrong-case directory is reported', () => {
  assert.deepEqual(found({ 'src/Kj/wm.ts': '', 'src/user.ts': "import a from './kj/wm'" }), [
    'src/user.ts ./kj/wm -> src/Kj/wm.ts',
  ]);
});

test('a wrong-case directory index is reported', () => {
  assert.deepEqual(found({ 'src/Kj/index.ts': '', 'src/user.ts': "import a from './kj'" }), [
    'src/user.ts ./kj -> src/Kj/index.ts',
  ]);
});

test('a parent-relative import is resolved from the importing file', () => {
  assert.deepEqual(found({ 'src/Zq.ts': '', 'src/deep/er/user.ts': "import a from '../../zq'" }), [
    'src/deep/er/user.ts ../../zq -> src/Zq.ts',
  ]);
});

test('the JSON data case this site shipped: require of a name in the wrong case', () => {
  assert.deepEqual(found({ 'src/poems/Zq_Xv.json': '{}', 'src/poems/index.ts': "module.exports = [require('./zq_xv')]" }), [
    'src/poems/index.ts ./zq_xv -> src/poems/Zq_Xv.json',
  ]);
});

test('a different Unicode form of the same name is reported, and the same form is clean', () => {
  const composed = 'Zoé';
  const decomposed = 'Zoé';
  assert.equal(found({ [`src/${composed}.json`]: '{}', 'src/user.ts': `require('./${decomposed}.json')` }).length, 1);
  assert.equal(found({ [`src/${composed}.json`]: '{}', 'src/user.ts': `require('./${composed}.json')` }).length, 0);
});

test('when both spellings are tracked, the exact one is used and nothing is reported', () => {
  assert.deepEqual(found({ 'src/Zq.ts': '', 'src/zq.ts': '', 'src/user.ts': "import a from './zq'" }), []);
});

test('package imports and imports with no tracked target are not judged', () => {
  const result = run({ 'src/user.ts': "import react from 'react'\nimport gen from './generated'\nimport x from '/abs/Zq'" });
  assert.deepEqual(result, { mismatches: [], checked: 1, unresolved: 1 });
});

test('an import inside a comment or a string is not an import', () => {
  assert.deepEqual(found({ 'src/Zq.ts': '', 'src/user.ts': "// import a from './zq'\nconst s = \"import a from './zq'\"" }), []);
});

test('css url() and @import are checked, with query and fragment ignored', () => {
  assert.deepEqual(
    found({
      'src/fonts/Zq.woff': '',
      'src/Base.css': '',
      'src/site.css': "@import './base.css';\n.a { src: url(./fonts/zq.woff?v=1#x); }\n.b { src: url('./fonts/Zq.woff'); }\n.c { background: url(data:image/png;base64,AAAA); }",
    }),
    ['src/site.css ./fonts/zq.woff -> src/fonts/Zq.woff', 'src/site.css ./base.css -> src/Base.css'],
  );
});

test('html src and href are checked; absolute and external ones are not', () => {
  assert.deepEqual(
    found({
      'src/Main.tsx': '',
      'src/index.html': '<script src="./main.tsx"></script><link href="/site.css"><a href="https://example.invalid/Main.tsx">x</a>',
    }),
    ['src/index.html ./main.tsx -> src/Main.tsx'],
  );
});

test('vendored trees and other file types are not scanned', () => {
  assert.deepEqual(
    found({
      'src/Zq.ts': '',
      'static/vendor.js': "require('../src/zq')",
      'etc/old.js': "require('../src/zq')",
      'README.md': "import a from './src/zq'",
    }),
    [],
  );
});

test('specifiers keeps relative ones only', () => {
  assert.deepEqual(specifiers('a.ts', "import a from './x'\nimport b from 'pkg'\nimport c from '../y'"), ['./x', '../y']);
});
