#!/usr/bin/env node
// Does tools/serve-local.mjs hold its port from the moment it starts?
//
// The end-to-end server is given a port that was free when it was chosen. It used to bind that port
// only after the fixtures and the build had run, minutes later, so another job on the same host
// could take it in between (issue #35). With --prepare it binds first and builds while holding the
// port, and a port that is already taken fails before anything is built.
//
// Run: node --test tools/test-serve-local.mjs
//
// Synthetic content only: invented words, never a poem. No dependencies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVE = join(dirname(fileURLToPath(import.meta.url)), 'serve-local.mjs');
const NODE = JSON.stringify(process.execPath);

const within = (ms, what, promise) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out: ${what}`)), ms)),
  ]);

// Start the server and expose: the port it reports, its exit code, and what it printed.
const start = (args) => {
  const child = spawn(process.execPath, [SERVE, '--host', '127.0.0.1', ...args]);
  const out = { stdout: '', stderr: '' };
  let gotPort;
  const port = new Promise((resolve, reject) => {
    gotPort = resolve;
    child.on('exit', (code) => reject(new Error(`exited ${code} before binding: ${out.stderr}`)));
  });
  port.catch(() => {});
  child.stdout.on('data', (d) => {
    out.stdout += d;
    const m = out.stdout.match(/bound to 127\.0\.0\.1:(\d+)/);
    if (m) gotPort(Number(m[1]));
  });
  child.stderr.on('data', (d) => (out.stderr += d));
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, out, port, exited };
};

const status = async (port, path = '/') => {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { code: res.status, body: await res.text() };
};

const tmp = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'serve-local-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

// A prepare step the test controls: it waits for a file named `go`, then writes index.html.
const gatedPrepare = (dir) => {
  const script = join(dir, 'prepare.mjs');
  writeFileSync(
    script,
    `import { existsSync, writeFileSync } from 'node:fs';
const [root, go] = process.argv.slice(2);
const wait = () => existsSync(go) ? (writeFileSync(root + '/index.html', '<p>zq xv</p>'), process.exit(0)) : setTimeout(wait, 20);
wait();
`,
  );
  return `${NODE} ${JSON.stringify(script)} ${JSON.stringify(dir)} ${JSON.stringify(join(dir, 'go'))}`;
};

test('with --prepare it holds the port while preparing, answers 503, then serves', async (t) => {
  const dir = tmp(t);
  const s = start(['--root', dir, '--port', '0', '--prepare', gatedPrepare(dir)]);
  t.after(() => s.child.kill('SIGKILL'));

  const port = await within(5000, 'the server to bind before preparing', s.port);
  assert.equal(existsSync(join(dir, 'index.html')), false, 'prepare has not finished yet');
  assert.equal((await status(port)).code, 503);
  assert.equal((await status(port, '/poem/zq')).code, 503);

  writeFileSync(join(dir, 'go'), '');
  const served = await within(
    10000,
    'the server to serve after preparing',
    (async () => {
      for (;;) {
        const r = await status(port);
        if (r.code === 200) return r;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    })(),
  );
  assert.match(served.body, /zq xv/);
  assert.equal((await status(port, '/poem/zq')).code, 200, 'single-page-app fallback still works');
});

test('a port that is already taken fails before anything is prepared', async (t) => {
  const dir = tmp(t);
  writeFileSync(join(dir, 'index.html'), '<p>zq</p>');
  const marker = join(dir, 'prepared');
  const holder = createServer();
  await new Promise((resolve) => holder.listen(0, '127.0.0.1', resolve));
  t.after(() => holder.close());
  const taken = holder.address().port;

  const prepare = `${NODE} -e "require('fs').writeFileSync(process.argv[1],'')" ${JSON.stringify(marker)}`;
  const s = start(['--root', dir, '--port', String(taken), '--prepare', prepare]);
  t.after(() => s.child.kill('SIGKILL'));

  assert.equal(await within(5000, 'the server to give up', s.exited), 3);
  assert.match(s.out.stderr, new RegExp(`${taken}.*already in use`));
  assert.equal(existsSync(marker), false, 'prepare must not run when the port is taken');
});

test('a prepare step that fails stops the server with its own exit code', async (t) => {
  const dir = tmp(t);
  const s = start(['--root', dir, '--port', '0', '--prepare', `${NODE} -e "process.exit(7)"`]);
  t.after(() => s.child.kill('SIGKILL'));

  assert.equal(await within(5000, 'the server to stop', s.exited), 4);
  assert.match(s.out.stderr, /prepare failed/);
});

test('a prepare step that leaves no index.html stops the server', async (t) => {
  const dir = tmp(t);
  const s = start(['--root', dir, '--port', '0', '--prepare', `${NODE} -e "0"`]);
  t.after(() => s.child.kill('SIGKILL'));

  assert.equal(await within(5000, 'the server to stop', s.exited), 2);
});

test('stopping the server stops a prepare step that is still running', async (t) => {
  const dir = tmp(t);
  const pidFile = join(dir, 'pid');
  const script = join(dir, 'slow.mjs');
  writeFileSync(
    script,
    `import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[2], String(process.pid));
setInterval(() => {}, 1000);
`,
  );
  // The same shape as the real prepare (`npm run … && npm run …`): a compound command, so the shell
  // stays as the parent and the step itself is its child. Signalling only the shell would miss it.
  const prepare = `${NODE} ${JSON.stringify(script)} ${JSON.stringify(pidFile)} && true`;
  const s = start(['--root', dir, '--port', '0', '--prepare', prepare]);
  t.after(() => s.child.kill('SIGKILL'));
  await within(5000, 'the server to bind', s.port);
  await within(
    5000,
    'the prepare step to start',
    (async () => {
      while (!existsSync(pidFile)) await new Promise((resolve) => setTimeout(resolve, 20));
    })(),
  );
  const pid = Number(readFileSync(pidFile, 'utf8'));
  // If the server fails to stop it, do not leave it behind: a leaked step keeps this run's output
  // open and the runner never finishes.
  t.after(() => {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone, which is what the test wants
    }
  });

  s.child.kill('SIGTERM');
  await within(5000, 'the server to exit', s.exited);
  await within(
    5000,
    'the prepare step to be stopped',
    (async () => {
      for (;;) {
        try {
          process.kill(pid, 0);
        } catch {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    })(),
  );
});

test('without --prepare a root with no index.html is still refused at once', async (t) => {
  const dir = tmp(t);
  const s = start(['--root', dir, '--port', '0']);
  t.after(() => s.child.kill('SIGKILL'));

  assert.equal(await within(5000, 'the server to refuse', s.exited), 2);
});

test('without --prepare a built root is served straight away', async (t) => {
  const dir = tmp(t);
  writeFileSync(join(dir, 'index.html'), '<p>zq</p>');
  const s = start(['--root', dir, '--port', '0']);
  t.after(() => s.child.kill('SIGKILL'));

  const port = await within(5000, 'the server to bind', s.port);
  assert.equal((await status(port)).code, 200);
});
