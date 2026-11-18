import test from 'node:test';
import assert from 'node:assert/strict';
import { render, css, bulkState } from './menu.js';
import { css as itemCss } from './menu-item.js';
import { menuDef } from './select.js';

const opts = n => Array.from({ length: n }, (_, i) => ({ id: 'o' + i, label: 'o' + i }));
const rule = selector => { const at = css.indexOf(selector + ' {'); return at < 0 ? '' : css.slice(at, css.indexOf('}', at)); };

/* A menu with a search field (a long multi list with select all, the Owner menu): only the rows scroll. The search field and the bulk row stay
   at the top, and the scroller (its overlay bar) starts under them, not beside the search field */
test('a menu with a search field scrolls only its rows; the search field and the bulk row stay above the scroller', () => {
  const s = render(menuDef({ options: opts(30), value: ['o1'], multi: true, boxes: true, bulk: true, action: 'x', key: 'k' })).s;
  const list = s.indexOf('<div class="m-list" data-scroll="menu">');
  assert.ok(list > 0, 'the rows sit in a scroller of their own');
  assert.ok(s.indexOf('m-search') < list && s.indexOf('m-all') < list, 'the search field and the bulk row come before it, outside it');
  assert.equal(s.slice(0, list).match(/role="menuitemcheckbox"/g)?.length, 1, 'no row before the scroller but the select-all row');
  assert.match(s.slice(0, list), /m-all/);
  assert.equal(s.slice(list).match(/role="menuitemcheckbox"/g)?.length, 30, 'every row inside it');
  assert.match(rule('.menu:has(> .m-root > .m-list)'), /display: flex;[^}]*flex-direction: column;[^}]*overflow: hidden/, 'the menu itself no longer scrolls');
  assert.match(rule('.m-root:has(> .m-list)'), /min-height: 0/);
  assert.match(rule('.m-list'), /overflow-y: auto/, 'the rows scroll');
  assert.match(rule('.m-list'), /min-height: 0/, 'and can shrink below their height inside the menu');
});

test('a menu with no search field keeps one scroller, the menu itself', () => {
  const s = render({ items: opts(30).map(o => ({ id: o.id, label: o.label, action: 'x' })) }).s;
  assert.doesNotMatch(s, /m-list/);
  const single = render(menuDef({ options: opts(30), value: 'o2', action: 'x' })).s;
  assert.ok(single.indexOf('m-search') < single.indexOf('m-list'), 'a single list with a search field gets the same fixed field');
});

test('a morph menu with a search field keeps its single scroller (its in-place sheet grows past the menu edge)', () => {
  assert.doesNotMatch(render({ morph: true, items: [{ type: 'search', placeholder: 'p' }, ...opts(20).map(o => ({ id: o.id, label: o.label, submenu: { items: [] } }))] }).s, /m-list/);
});

/* A multi list leads with one standard tri-state "All" checkbox row in place of the two "select all / clear all" text links:
   checked when all rows are on, aria-checked="mixed" (a dash) when some are, empty when none. The row is a menuitemcheckbox, so arrows, Enter and Space reach it */
test('a multi list leads with one tri-state select-all row: checked, mixed or empty by the rows it covers, no text links', () => {
  const head = v => { const s = render(menuDef({ options: opts(30), value: v, multi: true, boxes: true, bulk: true, action: 'x', key: 'k' })).s; return s.slice(0, s.indexOf('<div class="m-list"')); };
  for (const [value, state] of [[opts(30).map(o => o.id), 'true'], [['o1', 'o2'], 'mixed'], [[], 'false']]) {
    const row = head(value).match(/<div class="[^"]*\bm-all\b[^"]*"[^>]*>.*?<\/div>/)?.[0] ?? '';
    assert.match(row, /role="menuitemcheckbox"/, 'the row is a menu checkbox item (keyboard and screen readers)');
    assert.match(row, new RegExp(`aria-checked="${state}"`), `${value.length} of 30 on: ${state}`);
    assert.match(row, new RegExp(`class="cbx"[^>]*data-state="${state}"`), 'the kit checkbox draws the same state');
    if (state === 'mixed') assert.match(row, /data-icon="minus"|minus/, 'the mixed box shows the dash');
  }
  assert.doesNotMatch(head([]), /data-bulk="(all|none)"|m-bulk/, 'no select all / clear all text links');
});

test('the select-all state covers the rows in sight: all on, some on, none on', () => {
  assert.equal(bulkState([{ checked: true }, { checked: true }]), 'true');
  assert.equal(bulkState([{ checked: true }, { checked: false }]), 'mixed');
  assert.equal(bulkState([{ checked: false }]), 'false');
  assert.equal(bulkState([]), 'false');
});

/* The search field in a menu read as a second card on the menu's face (its own fill, ring and shadow): it is a line of the menu, the icon and the input, one hairline over the rows */
test('a menu search field is a line of the menu, not a filled box: icon and input, one hairline under it', () => {
  const s = render(menuDef({ options: opts(30), value: 'o2', action: 'x' })).s;
  const field = s.slice(s.indexOf('m-search'), s.indexOf('<div class="m-list"'));
  assert.doesNotMatch(field, /class="si\b|data-c="search-input"/, 'not the standalone search field (its own fill, ring and radius)');
  assert.match(field, /data-menu-search/);
  const at = itemCss.indexOf('.m-search {'), rule = itemCss.slice(at, itemCss.indexOf('}', at));
  assert.match(rule, /border-bottom: var\(--hairline\) solid var\(--border\)/, 'one hairline divides it from the rows');
  assert.doesNotMatch(rule, /background|box-shadow|border-radius/, 'no face of its own');
});

/* C-05: a menu opened with pending data was redrawn whole when the data arrived: the typed search text, the highlighted row, the focus in
   the search field and the list's scroll were all lost. The refreshed menu keeps them (the search still filters the new rows) */
test('pending_menu_refresh_keeps_search_text_highlight_focus_and_scroll', async t => {
  const { createRequire } = await import('node:module'), require = createRequire(import.meta.url);
  let chromium; try { ({ chromium } = require('playwright-core')); } catch { t.skip('playwright-core unavailable'); return; }
  const { createServer } = await import('node:http'), { readFileSync } = await import('node:fs'), { resolve, extname } = await import('node:path');
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><button id="trigger" data-menu="m">open</button>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const after = await page.evaluate(async () => {
      const menu = await import('/kit/components/menu.js'), item = await import('/kit/components/menu-item.js'), { menuDef } = await import('/kit/components/select.js');
      const style = document.createElement('style'); style.textContent = menu.css + item.css; document.head.append(style);
      let release; const pending = new Promise(r => { release = r; });
      let loaded = false;
      const def = n => ({ ...menuDef({ options: Array.from({ length: n }, (_, i) => ({ id: 'o' + i, label: 'item ' + i })), value: '', action: 'x' }), ...(loaded ? {} : { pending }) });
      const api = menu.attach(document, { emit() {}, resolveMenu: () => def(80) });
      const trigger = document.getElementById('trigger');
      api.open(trigger, def(40));
      const search = document.querySelector('[data-menu-search]');
      search.value = 'item 3'; search.dispatchEvent(new Event('input', { bubbles: true }));
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const highlighted = document.querySelector('.menu .mi[data-highlighted]')?.dataset.item;
      const scroller = document.querySelector('.menu .m-list'); scroller.scrollTop = 30; const scrolled = scroller.scrollTop;
      loaded = true; release(); await new Promise(r => setTimeout(r, 50));
      const box = document.querySelector('[data-menu-search]'), list = document.querySelector('.menu .m-list');
      return { value: box?.value, focused: document.activeElement === box, highlighted, now: document.querySelector('.menu .mi[data-highlighted]')?.dataset.item,
        shown: [...document.querySelectorAll('.menu .mi[data-item]')].filter(x => x.style.display !== 'none').length, rows: document.querySelectorAll('.menu .mi[data-item]').length, scrolled, scroll: list?.scrollTop };
    });
    assert.equal(after.rows, 80, 'the new rows are drawn');
    assert.equal(after.value, 'item 3', 'the typed search text stays');
    assert.ok(after.shown < 80, 'and still filters the new rows');
    assert.equal(after.focused, true, 'the focus stays in the search field');
    assert.ok(after.highlighted, 'a row was highlighted before');
    assert.equal(after.now, after.highlighted, 'the same row stays highlighted');
    assert.equal(after.scroll, after.scrolled, 'the list keeps its scroll');
  } finally { await browser?.close(); server.close(); }
});

test('morph_submenu_fits_the_window_and_scrolls_only_its_item_list', async t => {
  const { createRequire } = await import('node:module'), require = createRequire(import.meta.url);
  let chromium; try { ({ chromium } = require('playwright-core')); } catch { t.skip('playwright-core unavailable'); return; }
  const { createServer } = await import('node:http'), { readFileSync } = await import('node:fs'), { resolve, extname } = await import('node:path');
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><button id="trigger" style="position:fixed;left:40%;top:45%">open</button>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 800, height: 420 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const seen = await page.evaluate(async () => {
      const menu = await import('/kit/components/menu.js'), item = await import('/kit/components/menu-item.js'), sub = await import('/kit/components/submenu.js');
      const style = document.createElement('style'); style.textContent = menu.css + item.css + sub.css; document.head.append(style);
      const models = p => ({ items: Array.from({ length: 14 }, (_, i) => ({ id: `${p}-${i}`, label: `${p} model ${i}`, action: 'x' })) });
      const def = { morph: true, items: [{ type: 'search', placeholder: 'search' }, { id: 'a', label: 'Provider A', submenu: models('a') }, { id: 'b', label: 'Provider B', submenu: models('b') }] };
      const api = menu.attach(document, { emit() {} });
      api.open(document.getElementById('trigger'), def);
      document.querySelector('.menu .mi[data-item="b"]').click();
      await new Promise(r => setTimeout(r, 900));
      const vh = innerHeight, card = document.querySelector('.menu .m-sub'), root = document.querySelector('.menu');
      const list = card.querySelector('.m-sub-inner > .m-root'), head = card.querySelector('.m-sub-head');
      const cr = card.getBoundingClientRect(), rr = root.getBoundingClientRect(), headTop = head.getBoundingClientRect().top;
      const items = [...card.querySelectorAll('.mi[data-item]')];
      const reachable = items.every(el => { el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(), l = list.getBoundingClientRect(); return r.top >= l.top - 1 && r.bottom <= l.bottom + 1 && r.bottom <= vh; });
      return { vh, card: [cr.top, cr.bottom], root: [rr.top, rr.bottom], reachable, scrolls: list.scrollHeight > list.clientHeight, headStays: Math.abs(head.getBoundingClientRect().top - headTop) < 1,
        expanded: document.querySelector('.menu .mi[data-item="b"]').getAttribute('aria-expanded') };
    });
    assert.ok(seen.card[0] >= 0 && seen.card[1] <= seen.vh, `the expanded card stays inside the window: ${seen.card} of ${seen.vh}`);
    assert.ok(seen.root[0] >= 0 && seen.root[1] <= seen.vh, `the menu stays inside the window: ${seen.root} of ${seen.vh}`);
    assert.ok(seen.scrolls, 'the item list scrolls on its own');
    assert.ok(seen.reachable, 'every model can be scrolled into view inside the list and the window');
    assert.ok(seen.headStays, 'the provider header stays while the list scrolls');
    assert.equal(seen.expanded, 'true');
  } finally { await browser?.close(); server.close(); }
});
