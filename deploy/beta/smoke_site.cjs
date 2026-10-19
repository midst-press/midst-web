// smoke_site.cjs <midst-web worktree> <site URL> [expected-tag] [expected-commit] -- open every published poem on the deployed site
// and check that the player mounts with text. Also checks /about's build line against the expected
// tag and commit (when given). It does NOT check fonts: every poem's font today is a
// system font (Helvetica, Times New Roman, Garamond) that the site does not serve, so there is
// nothing to load and no load to fail. Reads the poem list from the worktree's src/poems/*.json
// (the same records the site was built from) and uses its poem-names.js for the page URLs, so it
// checks exactly what was deployed. Prints counts and failing record INDEXES only, never titles.
// Exit 0 all mounted (and /about matches if checked), 1 otherwise.
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const [wt, siteUrl, expectedTag, expectedCommit] = process.argv.slice(2);
if (!wt || !siteUrl) { console.error('usage: smoke_site.cjs <midst-web worktree> <site URL> [expected-tag] [expected-commit]'); process.exit(1); }
const req = createRequire(path.join(path.resolve(wt), 'package.json'));
const { chromium } = req('@playwright/test');
const names = req('./src/poems/poem-names.js');
const poemUrl = (names.default || names).poemUrl;
const base = siteUrl.endsWith('/') ? siteUrl : siteUrl + '/';

(async () => {
  const dir = path.join(wt, 'src/poems');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const browser = await chromium.launch();
  let mounted = 0, unpublished = 0, notPoem = 0, aboutOk = true, aboutDetail = '';
  const failed = [];
  for (const [i, f] of files.entries()) {
    const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!rec.title) { notPoem++; continue; }
    if (rec.published === false) { unpublished++; continue; }
    const page = await browser.newPage();
    try {
      await page.goto(`${base}poem/${poemUrl(rec.title)}/`, { waitUntil: 'domcontentloaded' });
      const ed = await page.waitForSelector('.midst-tiptap-player .editor', { timeout: 30000 }).catch(() => null);
      const ok = ed ? await ed.evaluate(e => e.innerText.trim().length > 0) : false;
      if (ok) mounted++; else failed.push(i);
    } catch {
      failed.push(i);
    }
    await page.close();
  }
  if (expectedTag || expectedCommit) {
    const page = await browser.newPage();
    try {
      await page.goto(`${base}about/`, { waitUntil: 'domcontentloaded' });
      const buildLine = await page.evaluate(() => {
        const el = document.querySelector('.build-info');
        return el ? el.innerText.trim() : null;
      });
      const { buildLineMatches } = require('./build-line.cjs');
      if (!buildLineMatches(buildLine, expectedTag, expectedCommit)) {
        aboutOk = false;
        aboutDetail = `/about build line "${buildLine}" does not match expected (tag=${expectedTag}, commit=${expectedCommit})`;
      }
    } catch (e) {
      aboutOk = false;
      aboutDetail = `/about not reachable: ${e.message}`;
    }
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify({ mounted, failedIndexes: failed, unpublished, notPoem, aboutOk, aboutDetail }));
  process.exit(failed.length === 0 && mounted > 0 && aboutOk ? 0 : 1);
})();
