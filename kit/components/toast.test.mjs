import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve, extname } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { /* Browser checks need playwright-core. */ }

// Issue #46: stacked text, long content and shell overlays must remain readable.
test('toast_stack_long_content_and_overlay_lifecycle', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const mime = { '.js': 'text/javascript', '.css': 'text/css' };
  const server = createServer((req, res) => {
    if (req.url === '/') {
      res.setHeader('content-type', 'text/html');
      res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><body></body>');
      return;
    }
    const path = resolve(repo, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', mime[extname(path)] || 'text/html'); res.end(readFileSync(path)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 860, height: 900 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const { css, attach } = await import('/kit/components/toast.js');
      const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
      document.documentElement.classList.add('is-desktop');
      document.documentElement.style.setProperty('--toast-duration', '60000ms');
      document.documentElement.style.setProperty('--dur-toast', '0ms');
      window.events = []; window.actions = [];
      window.toast = attach(document, { emit: (...args) => actions.push(args), onOverlay: (...args) => events.push(args) });
      const titles = ['First', 'Second', 'Latest'];
      toast.show({ title: titles[0], body: 'First body' });
      toast.show({ title: titles[1], body: 'Second body' });
      toast.show({ title: titles[2], body: 'a'.repeat(600), tone: 'ok', action: 'test:action', arg: 7 });
    });
    const state = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.toast')];
      const front = cards.at(-1), r = front.getBoundingClientRect();
      return { hidden: cards.slice(0, -1).map(e => getComputedStyle(e.lastElementChild).visibility),
        overflow: front.scrollWidth > front.clientWidth, left: r.left, right: r.right, top: r.top,
        header: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')),
        overlay: events.at(-1) };
    });
    assert.deepEqual(state.hidden, ['hidden', 'hidden']);
    assert.equal(state.overflow, false);
    assert.ok(state.left >= 0 && state.right <= 860 && state.top > state.header);
    assert.deepEqual(state.overlay, [true, null, { focus: false, owner: 'toast' }]);
    await page.locator('.toast').last().click();
    assert.deepEqual(await page.evaluate(() => actions), [['test:action', { arg: 7 }]]);
    assert.equal(await page.locator('.toast:not(.leaving)').last().getAttribute('aria-hidden'), 'false');
    await page.locator('.toast:not(.leaving)').last().click();
    await page.locator('.toast:not(.leaving)').last().click();
    await page.waitForFunction(() => !document.querySelector('.toast'));
    assert.deepEqual(await page.evaluate(() => events.at(-1)), [false, null, { focus: false, owner: 'toast' }]);

    await page.mouse.move(0, 899);
    await page.clock.install();
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--toast-duration', '3000ms');
      const title = 'Pause';
      toast.show({ title });
    });
    await page.clock.runFor(1000);
    await page.locator('.toast').hover();
    await page.clock.runFor(5000);
    assert.equal(await page.locator('.toast').count(), 1);
    await page.mouse.move(0, 899);
    await page.clock.runFor(2100);
    assert.equal(await page.locator('.toast').count(), 0);

    await page.evaluate(async () => {
      const { attach } = await import('/kit/components/toast.js');
      const ready = new Promise(resolve => { window.releaseOverlay = resolve; });
      const delayed = attach(document, { emit() {}, onOverlay: on => on ? ready : undefined });
      window.prepared = ['One', 'Two', 'Three'].map(title => delayed.show({ title }));
    });
    await page.clock.runFor(15000);
    assert.equal(await page.locator('.toast').count(), 0);
    await page.evaluate(async () => { releaseOverlay(); await Promise.all(prepared); });
    assert.equal(await page.locator('.toast').count(), 3);
    await page.clock.runFor(2500);
    assert.equal(await page.locator('.toast').count(), 3);
    await page.clock.runFor(600);
    assert.equal(await page.locator('.toast').count(), 0);

  } finally {
    await browser?.close();
    await new Promise(r => server.close(r));
  }
});

/* B-18: a toast at the top centre covered the page header's words (a header count under the copied notice). A toast sits at the bottom centre,
   clear of the top bar and the page header, and enters from below */
test('toast_sits_at_the_bottom_clear_of_the_page_header', { skip: !chromium && 'playwright-core unavailable' }, async () => {
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
    const page = await browser.newPage({ viewport: { width: 860, height: 600 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const r = await page.evaluate(async () => {
      const { css, attach } = await import('/kit/components/toast.js');
      const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
      document.documentElement.classList.add('is-desktop');
      document.documentElement.style.setProperty('--toast-duration', '60000ms');
      document.documentElement.style.setProperty('--dur-toast', '0ms');
      await attach(document, { emit() {}, onOverlay() {} }).show({ title: 'message.copied', tone: 'ok' });
      const b = document.querySelector('.toast').getBoundingClientRect(), offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toast-offset'));
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), offset };
    });
    assert.equal(r.bottom, 600 - r.offset, `the toast rests ${r.offset}px above the window's bottom edge: ${JSON.stringify(r)}`);
  } finally { await browser?.close(); server.close(); }
});
