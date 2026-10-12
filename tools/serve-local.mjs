#!/usr/bin/env node
// Serve a built midst-web dist/ on the LAN and over Tailscale, for trying things out and for
// showing Annelyse. No dependencies, so nothing to install and nothing to audit.
//
// It needs a history fallback: the site is a single-page app with client-side routes such as
// /poem/december, and a plain file server returns 404 for those. That is the same need the old
// README's .htaccess was meant to serve -- which is also why that instruction is stale now the
// site is on S3 behind CloudFront.
//
//   node serve-midst.mjs [--root DIR] [--port N] [--host 0.0.0.0] [--prepare COMMAND]
//
// --prepare is for the end-to-end suite. The port is taken FIRST and held while COMMAND (the
// fixtures and the build) runs; until it finishes every request gets 503. Binding only after the
// build left minutes in which another job on the same host could take the port (issue #35). If the
// port is already taken, this exits 3 before anything is built.
//
// Binding to 0.0.0.0 exposes this to everything that can reach the machine, which here means the
// LAN and the Tailscale network. That is deliberate and was asked for. It serves static files from
// one directory: no upload, no directory listing, no execution.

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve, extname, normalize, sep } from 'node:path';
import { argv, exit } from 'node:process';

const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : dflt;
};

const ROOT = resolve(arg('root', 'seed/midst-web/dist'));
const PORT = Number(arg('port', 8099));
const HOST = arg('host', '0.0.0.0');
// Serve the poem archive under /archive/ so a locally-built bundle can read poems from disk.
// Same origin as the page, so no CORS and no second server.
const ARCHIVE = arg('archive', '');
const PREPARE = arg('prepare', '');

const requireIndex = () => {
  if (existsSync(join(ROOT, 'index.html'))) return;
  console.error(`No index.html under ${ROOT}. Build first:  npm run build`);
  exit(2);
};
if (!PREPARE) requireIndex();
let ready = !PREPARE;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json; charset=utf-8',
  '.midst': 'application/json; charset=utf-8',
  '.zip': 'application/zip',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Resolve a request to a file INSIDE root, or null. Traversal is rejected rather than clamped, so a
// malformed request shows up in the log instead of quietly serving something else.
function safePath(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null; // malformed percent-encoding
  }
  const candidate = resolve(join(ROOT, normalize(p)));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null;
  return candidate;
}

const server = createServer((req, res) => {
  const started = Date.now();
  const log = (code, what) =>
    console.log(
      `${new Date().toISOString().slice(11, 19)} ${String(code).padEnd(3)} ` +
        `${String(Date.now() - started).padStart(4)}ms  ${req.method} ${req.url}` +
        (what ? '  -> ' + what : ''),
    );

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end('method not allowed\n');
    return log(405);
  }

  if (!ready) {
    res.writeHead(503, { 'retry-after': '1', 'cache-control': 'no-store' }).end('preparing\n');
    return log(503, 'preparing');
  }

  // /archive/<folder>/<file> -> the poem archive on disk, with NFC/NFD tolerance.
  // macOS stores these filenames decomposed while the application generates composed names; that
  // mismatch is the live-site defect that makes four poems unreachable. Locally we accept BOTH, so
  // the demo shows every poem working.
  if (ARCHIVE && (req.url || '').startsWith('/archive/')) {
    let rel;
    try { rel = decodeURIComponent((req.url || '').slice('/archive/'.length).split('?')[0]); }
    catch { res.writeHead(400).end('bad request\n'); return log(400, 'bad encoding'); }
    const direct = resolve(join(ARCHIVE, normalize(rel)));
    if (direct !== resolve(ARCHIVE) && !direct.startsWith(resolve(ARCHIVE) + sep)) {
      res.writeHead(400).end('bad request\n'); return log(400, 'rejected archive path');
    }
    let found = null;
    for (const form of ['NFC', 'NFD']) {
      const c = resolve(join(ARCHIVE, normalize(rel.normalize(form))));
      if (existsSync(c) && statSync(c).isFile()) { found = c; break; }
    }
    if (!found) { res.writeHead(404).end('not found\n'); return log(404, 'archive miss: ' + rel); }
    const t2 = TYPES[extname(found).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': t2, 'content-length': statSync(found).size, 'cache-control': 'no-store' });
    if (req.method === 'HEAD') { res.end(); return log(200, 'archive'); }
    createReadStream(found).pipe(res);
    return log(200, 'archive ' + (found.includes(rel) ? '' : '(normalised)'));
  }

  const p = safePath(req.url || '/');
  if (!p) {
    res.writeHead(400).end('bad request\n');
    return log(400, 'rejected path');
  }

  let file = p;
  let fellBack = false;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) {
    // Single-page-app fallback: unknown paths are client-side routes.
    file = join(ROOT, 'index.html');
    fellBack = true;
  }

  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const { size } = statSync(file);
  res.writeHead(200, {
    'content-type': type,
    'content-length': size,
    // No caching: this exists to try out changes, and a stale bundle wastes everyone's time.
    'cache-control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return log(200, fellBack ? 'index.html (SPA route)' : '');
  }
  createReadStream(file)
    .on('error', () => {
      res.destroy();
      log(500, 'read error');
    })
    .pipe(res);
  log(200, fellBack ? 'index.html (SPA route)' : '');
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`port ${PORT} on ${HOST} is already in use; nothing was prepared or served`);
  exit(3);
});

server.listen(PORT, HOST, () => {
  console.log(`serving ${ROOT}`);
  console.log(`  bound to ${HOST}:${server.address().port} — reachable from the LAN and over Tailscale`);
  console.log(`  single-page-app fallback ON: unknown paths return index.html`);
  console.log(`  poems are still fetched from CloudFront, so the four known-broken ones stay broken`);
  if (!PREPARE) return;

  console.log(`  preparing (503 until done): ${PREPARE}`);
  // Its own process group, signalled as a group: the command is a shell line (`a && b`), so the
  // shell is the parent and the build is its child. Signalling the shell alone leaves the build
  // running, and still writing dist/, after this server has gone.
  const prepare = spawn(PREPARE, { shell: true, stdio: 'inherit', detached: true });
  const stopWith = (signal) => () => {
    try {
      process.kill(-prepare.pid, signal);
    } catch {
      // the group has already gone
    }
    exit(1);
  };
  process.on('SIGTERM', stopWith('SIGTERM'));
  process.on('SIGINT', stopWith('SIGINT'));
  prepare.on('exit', (code, signal) => {
    if (code !== 0) {
      console.error(`prepare failed (${signal ?? 'exit ' + code}); stopping`);
      exit(4);
    }
    requireIndex();
    ready = true;
    console.log('  prepared; serving');
  });
});
