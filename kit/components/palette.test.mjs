import test from 'node:test';
import assert from 'node:assert/strict';
import { attach } from './palette.js';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve, extname } from 'node:path';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright-core')); } catch { /* Browser checks need playwright-core. */ }

/* B-25: typing in the palette redrew its list from renderGroups(...).s; with matches that was an array of rows (no .s), so every query that
   found something showed the word "undefined" instead of the rows. A small stand-in document is enough: the list's innerHTML is what is drawn */
test('palette_typed_query_with_matches_draws_the_matching_rows', () => {
  const listeners = {}, list = { innerHTML: '' };
  const el = { querySelector: s => (s === '.pal-list' ? list : { focus() {} }), querySelectorAll: () => [], contains: () => false, remove() {} };
  const node = () => ({ addEventListener() {}, remove() {}, set innerHTML(_) {}, firstElementChild: el });
  const doc = { addEventListener: (type, fn) => (listeners[type] ??= []).push(fn), createElement: node, body: { appendChild() {} } };
  const palette = attach(doc, {});
  palette.open({ groups: [{ label: 'fixture.tabs', rows: [{ id: 't', label: 'home' }] }, { label: 'fixture.settings', rows: [{ id: 's', label: 'Settings › Agents' }] }] });
  const type = value => listeners.input.forEach(fn => fn({ target: { matches: () => true, value } }));
  type('agents');
  assert.match(list.innerHTML, /Settings › Agents/, 'the matching row is drawn');
  assert.doesNotMatch(list.innerHTML, /undefined|>home</, 'no "undefined" and no row that does not match');
  type('zzz');
  assert.match(list.innerHTML, /pal-empty/, 'no match: the empty line');
});

/* B-25: with one match (or none) the palette stayed a full-height box with an empty bottom. The box takes the height of its results up to the
   palette height, and its top edge stays where it opened while typing changes the results */
test('palette_shrinks_to_its_results_and_keeps_its_top_edge', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><body></body>'); return; }
    const path = resolve(repo, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(path)] || 'text/html'); res.end(readFileSync(path)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const { css, attach } = await import('/kit/components/palette.js');
      const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
      document.documentElement.style.setProperty('--dur-menu', '0ms');
      const rows = Array.from({ length: 30 }, (_, i) => ({ id: 'r' + i, label: 'row ' + i + (i === 7 ? ' unique' : '') }));
      attach(document, { emit() {} }).open({ groups: [{ label: 'test.rows', rows }] });
    });
    const box = () => page.evaluate(() => { const r = document.querySelector('.pal').getBoundingClientRect(); return { top: Math.round(r.top), height: Math.round(r.height) }; });
    const full = await box();
    await page.locator('[data-pal-input]').fill('unique');
    const one = await box();
    assert.ok(one.height < full.height / 2, `one result takes less than half the full box: ${JSON.stringify({ full, one })}`);
    assert.equal(one.top, full.top, 'the top edge stays put');
  } finally { await browser?.close(); server.close(); }
});
