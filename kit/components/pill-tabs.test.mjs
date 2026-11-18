import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './pill-tabs.js';

test('a tab that cannot be chosen is disabled and says why in its title; the others are plain', () => {
  const m = render({ id: 'x', value: 'a', action: 'x.pick', tabs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', disabled: true, tip: 'why' }] }).s;
  assert.match(m, /aria-selected="true" data-action="x.pick" data-arg="&quot;a&quot;">A</);
  assert.match(m, /data-arg="&quot;b&quot;" disabled title="why">B</);
  assert.equal((m.match(/disabled/g) || []).length, 1);
});

test('a tab can lead with an icon and carry a problem mark: a count in the tone colour, or a dot without one', () => {
  const m = render({ id: 't', value: 'a', action: 'x', tabs: [
    { id: 'a', label: 'A', icon: 'search', count: '1,204', badge: { tone: 'danger', value: 1204 } },
    { id: 'b', label: 'B', badge: { tone: 'warn' } },
    { id: 'c', label: 'C', count: 3 }] }).s;
  assert.match(m, /<button class="pill"[^>]*><svg class="wi wi-sm"[^>]*data-icon="search"[\s\S]*?A<span class="n">1,204<\/span><span class="pill-b" data-tone="danger">1,204<\/span><\/button>/);
  assert.match(m, />B<span class="dot warn" data-c="status-dot"><\/span><\/button>/);
  assert.match(m, />C<span class="n">3<\/span><\/button>/);
});

/* B-02: with the AI pane open the page body was 487px: the section tabs sit in the page header's end slot after the title and its sub line.
   The end slot took only the space the title and sub line left (a few px), so the chosen tab was cut to an empty 24px pill. The sub line
   gives way first (as the header promises): the end slot keeps room for the chosen tab and "more" */
test('narrow_section_tabs_keep_the_chosen_tab_label_whole', async t => {
  const { createRequire } = await import('node:module'), require = createRequire(import.meta.url);
  let chromium; try { ({ chromium } = require('playwright-core')); } catch { t.skip('playwright-core unavailable'); return; }
  const { createServer } = await import('node:http'), { readFileSync } = await import('node:fs'), { resolve, extname } = await import('node:path');
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><div id="box"></div>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 440, height: 300 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const seen = await page.evaluate(async () => {
      const tabs = await import('/kit/components/pill-tabs.js'), header = await import('/kit/components/page-header.js');
      const style = document.createElement('style'); style.textContent = tabs.css + header.css; document.head.append(style);
      const box = document.getElementById('box');
      const end = tabs.render({ id: 's', value: 'home', action: 'x', spaced: true, tabs: ['home', 'resources', 'network', 'gitops', 'events', 'logs', 'alerts', 'incidents'].map(id => ({ id, label: id === 'home' ? 'Home' : id })) });
      box.innerHTML = header.render({ title: 'fixture-lab', icon: 'globe', size: 'home', sub: ['Engine v1.36.1', 'spaces 13', 'items 40'], end }).s;
      tabs.attach(document, { menu: { open() {} } });
      await new Promise(r => setTimeout(r, 300));
      const chosen = box.querySelector('.pill[aria-selected="true"]'), label = chosen.querySelector('.trunc');
      /* a page that draws again (morph) puts back the tabs and "more" as drawn: unhidden tabs, hidden "more"; the row folds again */
      box.querySelectorAll('[data-pills-fold] .pill').forEach(tb => { tb.hidden = false; }); box.querySelector('[data-pills-more]').hidden = true;
      await new Promise(r => setTimeout(r, 300));
      const head = box.querySelector('.ph').getBoundingClientRect(), row = box.querySelector('[data-pills-fold]').getBoundingClientRect(), title = box.querySelector('.ph-title');
      return { hidden: chosen.hidden, width: chosen.getBoundingClientRect().width, labelShown: label.clientWidth, labelNeeds: label.scrollWidth,
        rowInside: row.right <= head.right + 0.5, titleShown: title.getBoundingClientRect().width, more: !box.querySelector('[data-pills-more]').hidden };
    });
    /* the chosen tab keeps its label by folding the others into "more", not by running the row out of the head and pushing the title away */
    assert.deepEqual({ rowInside: seen.rowInside, titleShown: seen.titleShown > 0, more: seen.more }, { rowInside: true, titleShown: true, more: true });
    assert.equal(seen.hidden, false);
    assert.ok(seen.labelShown >= seen.labelNeeds && seen.labelShown > 0, `the chosen tab shows its whole label: ${seen.labelShown} of ${seen.labelNeeds}px (tab ${seen.width}px)`);
  } finally { await browser?.close(); server.close(); }
});

/* B2-14: the incident result pills (six with counts) ran past a 487px card. A toolbar's pills may fold into "more" like the section tabs, without
   the section margins; the incident list uses it */
test('toolbar_filter_pills_fold_into_more_without_section_margins', async () => {
  const { render, css } = await import('./pill-tabs.js');
  const s = String(render({ id: 'x', fold: true, value: 'a', action: 'go', tabs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }).s ?? '');
  assert.match(s, /class="pills-fold flat" data-pills-fold/);
  assert.match(s, /data-pills-more/);
  assert.match(css, /\.pills-fold\.flat \{ margin: 0; \}/);
});

/* R5-07: a width change made the folding write layout (tabs hidden, --pills-need on the head) inside the ResizeObserver callback; the head then
   resized again in the same frame and the browser reported "ResizeObserver loop completed with undelivered notifications". The fold runs in the next frame */
test('section_tabs_refold_on_width_changes_without_a_resize_observer_loop', async t => {
  const { createRequire } = await import('node:module'), require = createRequire(import.meta.url);
  let chromium; try { ({ chromium } = require('playwright-core')); } catch { t.skip('playwright-core unavailable'); return; }
  const { createServer } = await import('node:http'), { readFileSync } = await import('node:fs'), { resolve, extname } = await import('node:path');
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><div id="box"></div>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 1200, height: 300 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      window.__errors = []; window.addEventListener('error', e => window.__errors.push(String(e.message)));
      const tabs = await import('/kit/components/pill-tabs.js'), header = await import('/kit/components/page-header.js');
      const style = document.createElement('style'); style.textContent = tabs.css + header.css; document.head.append(style);
      const end = tabs.render({ id: 's', value: 'alerts', action: 'x', spaced: true, tabs: ['home', 'resources', 'network', 'gitops', 'events', 'logs', 'alerts', 'incidents'].map(id => ({ id, label: id })) });
      document.getElementById('box').innerHTML = header.render({ title: 'fixture-lab', icon: 'globe', size: 'home', sub: ['Engine v1.36.1', 'spaces 13', 'items 40'], end }).s;
      tabs.attach(document, { menu: { open() {} } });
    });
    for (let w = 1200; w >= 420; w -= 23) { await page.setViewportSize({ width: w, height: 300 }); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
    for (let w = 420; w <= 1200; w += 31) { await page.setViewportSize({ width: w, height: 300 }); await page.evaluate(() => new Promise(r => requestAnimationFrame(r))); }
    const seen = await page.evaluate(() => window.__errors);
    assert.deepEqual([...seen, ...errors].filter(m => /ResizeObserver/.test(m)), [], 'no ResizeObserver loop while the width changes');
    const folded = await page.evaluate(() => ({ more: !document.querySelector('[data-pills-more]').hidden, chosen: !document.querySelector('.pill[aria-selected="true"]').hidden }));
    assert.deepEqual(folded, { more: false, chosen: true }, 'back at full width every tab shows again');
  } finally { await browser?.close(); server.close(); }
});
