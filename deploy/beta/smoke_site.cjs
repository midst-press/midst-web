// smoke_site.cjs <midst-web worktree> <site URL> -- open every published poem on the deployed site
// and check that the player mounts with text. It does NOT check fonts: every poem's font today is a
// system font (Helvetica, Times New Roman, Garamond) that the site does not serve, so there is
// nothing to load and no load to fail. Reads the poem list from the worktree's src/poems/*.json
// (the same records the site was built from) and uses its poem-names.js for the page URLs, so it
// checks exactly what was deployed. Prints counts and failing record INDEXES only, never titles.
// Exit 0 all mounted, 1 otherwise.
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const [wt, siteUrl] = process.argv.slice(2);
if (!wt || !siteUrl) { console.error('usage: smoke_site.cjs <midst-web worktree> <site URL>'); process.exit(1); }
const req = createRequire(path.join(path.resolve(wt), 'package.json'));
const { chromium } = req('@playwright/test');
const names = req('./src/poems/poem-names.js');
const poemUrl = (names.default || names).poemUrl;
const base = siteUrl.endsWith('/') ? siteUrl : siteUrl + '/';

(async () => {
  const dir = path.join(wt, 'src/poems');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const browser = await chromium.launch();
  let mounted = 0, unpublished = 0, notPoem = 0;
  const failed = [];
  for (const [i, f] of files.entries()) {
    const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!rec.title) { notPoem++; continue; }
    if (rec.published === false) { unpublished++; continue; }
    const page = await browser.newPage();
    await page.goto(`${base}poem/${poemUrl(rec.title)}/`, { waitUntil: 'domcontentloaded' });
    const ed = await page.waitForSelector('.midst-tiptap-player .editor', { timeout: 30000 }).catch(() => null);
    const ok = ed ? await ed.evaluate(e => e.innerText.trim().length > 0) : false;
    if (ok) mounted++; else failed.push(i);
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify({ mounted, failedIndexes: failed, unpublished, notPoem }));
  process.exit(failed.length === 0 && mounted > 0 ? 0 : 1);
})();
