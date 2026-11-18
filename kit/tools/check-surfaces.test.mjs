/*
 * Surface rules of check-states and check-glass held against pages built to pass and to fail.
 * The judging is tested on its own; the page reading and the glass measure run in Chromium (playwright-core via NODE_PATH, as the
 * browser checks) and are skipped when it is not there.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { RADII, ONE_FRAME, readSurfaces, judgeSurfaces, measureGlass, PROBE_CSS, SHARP, readSurface } from './check-surfaces.mjs';
import { readRegressionsInPage, readScrollEndInPage } from './check-regressions.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright-core')); } catch { /* no browser: the page tests are skipped */ }

const judge = got => { const out = []; judgeSurfaces(got, 'test', (w, m) => out.push(`${w}: ${m}`)); return out; };
const only = (sel, value, key = 'radii') => {
  const list = key === 'radii' ? RADII : ONE_FRAME;
  return { radii: RADII.map(() => null), frames: ONE_FRAME.map(() => null), [key]: list.map(([s]) => (s === sel ? value : null)) };
};

test('a link button keeps its own radius role: the chip radius passes, any other radius fails', () => {
  assert.ok(RADII.some(([s]) => s === '.btn.link'), 'the link button is checked');
  assert.deepEqual(judge(only('.btn.link', { r: [5.6, 5.6], k: 1.4, flat: true })), []);
  assert.match(judge(only('.btn.link', { r: [99, 99], k: 1.4, flat: true }))[0], /\.btn\.link: radius 99\/99px/);
  assert.match(judge(only('.btn.link', { r: [11.2, 11.2], k: 1.4, flat: true }))[0], /\.btn\.link: radius 11\.2/);
});

test('the sidebar row keeps the side tone pixels: 8px circular', () => {
  assert.deepEqual(judge(only('.sb-row', { r: [8, 8], k: 1, flat: true })), []);
  assert.equal(judge(only('.sb-row', { r: [11.2, 11.2], k: 1.4, flat: true })).length, 1);
});

test('the settings body is the one frame: a frame around it or a card inside it fails', () => {
  const one = { self: 'div.cc-card (radius 16px, background rgb(0, 0, 0))', outer: [], inner: [], groups: [] };
  assert.match(judge(only('.cc-card', { ...one, groups: ['div.sg-card (border rgb(85, 85, 85))'] }, 'frames'))[0], /settings group inside the body card draws a visible border/);
  assert.deepEqual(judge(only('.cc-card', one, 'frames')), []);
  assert.deepEqual(judge(only('.cc-card', { ...one, self: null }, 'frames')), [], 'a body with no face of its own is one frame too');
  assert.match(judge(only('.cc-card', { ...one, outer: ['div.frame (radius 16px, background x)'] }, 'frames'))[0], /\.cc-card: a frame inside a frame/);
  assert.match(judge(only('.cc-card', { ...one, inner: ['div.box (radius 23px, border)'] }, 'frames'))[0], /\.cc-card: a card inside the body card/);
});

/* ---------- in the browser ---------- */
const pages = new Map();
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (pages.has(path)) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(pages.get(path)); return; }
  const p = resolve(repo, '.' + decodeURIComponent(path));
  if (!p.startsWith(repo) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.css': 'text/css' }[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
});

/* A blank page with one open menu in the menu layer (opaque, so nothing below can show through it) that scrolls with its own overlay bar,
   and optionally another scroller whose bar lies inside the menu's box. The bars stay shown (a long hide delay) once scrolled */
const glassPage = ({ foreign, rest = false }) => `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="/kit/tokens.css">
<style>:root { --delay-scrollbar-hide: 600000ms; } body { margin: 0; background: #fff; } .row { height: 28px; }
.menu { position: absolute; left: 100px; top: 100px; width: 200px; height: 200px; overflow: auto; border-radius: 12px; background: #fff; scrollbar-width: none; }
.other { position: absolute; left: 150px; top: 120px; width: 140px; height: 150px; overflow: auto; scrollbar-width: none; }</style></head>
<body>${foreign ? '<div class="other" data-scroll="content"><div style="height:2000px"></div></div>' : ''}
<div class="m-layer" style="position: fixed; inset: 0; z-index: var(--z-menu)"><div class="menu" data-scroll="menu" data-state="idle"><div class="m-root">${'<div class="row"></div>'.repeat(30)}</div></div></div>
<script type="module">import { attach, css } from '/kit/components/scroll-area.js';
const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); attach(document);
window.ready = new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
  for (const el of document.querySelectorAll(${rest ? "'.other'" : "'[data-scroll]'"})) el.scrollTop = 40;
  requestAnimationFrame(() => requestAnimationFrame(r));
})));</script></body></html>`;

test('run directly, check-surfaces checks nothing and fails instead of exiting 0', () => {
  const r = spawnSync(process.execPath, [resolve(repo, 'kit/tools/check-surfaces.mjs'), '--app', 'sample'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0, 'a command that checks nothing must not pass');
  assert.match(r.stderr, /checks nothing on its own: run node kit\/tools\/check-states\.mjs/);
  const dir = mkdtempSync(join(tmpdir(), 'surfaces-link-')); const link = join(dir, 'link.mjs');
  try {
    symlinkSync(resolve(repo, 'kit/tools/check-surfaces.mjs'), link);
    assert.equal(spawnSync(process.execPath, [link], { encoding: 'utf8' }).status, 2, 'run through a symlink, it still fails');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('glass and radius reading in the page', { skip: !chromium && 'playwright-core not found (set NODE_PATH)' }, async t => {
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const lab = await browser.newPage();
  const open = async (path, html, { width = 600 } = {}) => {
    pages.set(path, html);
    const p = await browser.newPage({ viewport: { width, height: 700 } });
    await p.goto(base + path);
    return p;
  };
  try {
    await t.test('sidebar_toggle_survives_component_to_plain_button_round_trips', async () => {
      const p = await open('/topbar-morph.html', `<!doctype html><div id="host"></div><script type="module">
        import { render } from '/kit/components/topbar.js';
        import { morph } from '/kit/core/morph.js';
        window.draw = sidebarHidden => morph(document.querySelector('#host'), render({ sidebarHidden, canBack: true }));
      </script>`);
      await p.waitForFunction(() => !!window.draw);
      for (const hidden of [false, true, false, true, false, true]) {
        await p.evaluate(value => window.draw(value), hidden);
        assert.equal(await p.locator('[data-action="kit.sidebar.toggle"]').count(), Number(hidden));
        assert.equal(await p.locator('[data-action="kit.history.back"]').count(), 1);
      }
      await p.close();
    });
    await t.test('folded_tabs_keep_a_wider_selected_tab_visible_across_resize', async () => {
      const p = await open('/folded-tabs.html', `<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><div id="host" style="width:420px"></div><script type="module">
        import { render, attach, css } from '/kit/components/pill-tabs.js';
        const style = document.createElement('style'); style.textContent = css; document.head.append(style);
        document.querySelector('#host').innerHTML = render({ id: 'sections', action: 'choose', spaced: true, value: 'last', tabs: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'A much wider selected tab'].map((label, i) => ({ id: i === 7 ? 'last' : String(i), label })) }).s;
        attach(document); window.ready = true;
      </script>`);
      await p.waitForFunction(() => window.ready);
      for (const width of [420, 300, 760, 420]) {
        await p.locator('#host').evaluate((host, value) => { host.style.width = value + 'px'; }, width);
        await p.waitForTimeout(100);
        assert.deepEqual((await p.evaluate(readRegressionsInPage)).failures, [], `width ${width}`);
        assert.equal(await p.locator('[aria-selected="true"]').isVisible(), true);
      }
      await p.close();
    });
    await t.test('table_coalesces_synchronous_changes_and_does_not_refit_its_own_width_writes', async () => {
      const p = await open('/table-fit-count.html', `<link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main></main><script type="module">
        import { render, attach, css } from '/kit/components/data-table.js';
        const style = document.createElement('style'); style.textContent = css; document.head.append(style);
        document.querySelector('main').innerHTML = render({ columns: [{id:'name',label:'Name'}, {id:'value',label:'Value',width:'40px',fit:true}], rows:[{id:'one',name:'row',value:'1'}], rowKey:'id' }).s;
        window.fits = 0; const createRange = document.createRange.bind(document);
        document.createRange = () => { fits++; return createRange(); };
        attach(document); window.ready = true;
      </script>`);
      await p.waitForFunction(() => window.ready);
      await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const fits = await p.evaluate(async () => {
        fits = 0;
        const cell = document.querySelector('tbody td:last-child');
        for (const text of ['123', '123456789', '123456789012345678901234567890']) cell.textContent = text;
        await new Promise(resolve => setTimeout(resolve, 0));
        return fits;
      });
      assert.equal(fits, 1, 'one fit for the batch, including the width writes made by fit');
      await p.close();
    });
    await t.test('table_removal_releases_observers_and_reinsertion_observes_again', async () => {
      const p = await open('/table-observers.html', `<main></main><script type="module">
        import { render, attach } from '/kit/components/data-table.js';
        const NativeResizeObserver = window.ResizeObserver;
        window.observed = new Set();
        window.ResizeObserver = class extends NativeResizeObserver {
          observe(host) { observed.add(host); super.observe(host); }
          unobserve(host) { observed.delete(host); super.unobserve(host); }
        };
        document.querySelector('main').innerHTML = render({ columns: [{id:'name',label:'Name'}], rows:[{id:'one',name:'row'}], rowKey:'id' }).s;
        window.host = document.querySelector('.dt-host'); attach(document); window.ready = true;
      </script>`);
      await p.waitForFunction(() => window.ready);
      assert.equal(await p.evaluate(() => observed.has(host)), true);
      await p.evaluate(() => host.remove());
      assert.equal(await p.evaluate(() => observed.has(host)), false, 'detached hosts are not retained by ResizeObserver');
      await p.evaluate(() => document.querySelector('main').append(host));
      assert.equal(await p.evaluate(() => observed.has(host)), true, 'a reinserted host is fitted and watched again');
      await p.close();
    });
    await t.test('table_refits_changed_values_before_the_next_paint', async () => {
      const p = await open('/table-before-paint.html', `<link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main style="width:700px"></main><script type="module">
        import { render, attach, css } from '/kit/components/data-table.js';
        import { morph } from '/kit/core/morph.js';
        const style = document.createElement('style'); style.textContent = css; document.head.append(style);
        window.draw = value => morph(document.querySelector('main'), render({ columns: [{id:'name',label:'Name'}, {id:'value',label:'V',width:'100px',fit:true}], rows:[{id:'one',name:'row',value}], rowKey:'id' }));
        draw('1'); attach(document); window.ready = true;
      </script>`);
      await p.waitForFunction(() => window.ready);
      await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const widths = await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
        draw('123456789012345678901234567890');
        queueMicrotask(() => queueMicrotask(() => {
          const cell = document.querySelector('tbody td:last-child');
          const beforePaint = cell.getBoundingClientRect().width;
          const range = document.createRange(); range.selectNodeContents(cell);
          const textWidth = range.getBoundingClientRect().width, cs = getComputedStyle(cell);
          const available = cell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          requestAnimationFrame(() => requestAnimationFrame(() => resolve({ beforePaint, textWidth, available, settled: cell.getBoundingClientRect().width })));
        }));
      })));
      assert.ok(widths.available >= widths.textWidth, JSON.stringify(widths));
      assert.equal(widths.beforePaint, widths.settled, 'fitted column geometry must not change in the next painted frame');
      await p.close();
    });
    await t.test('scroll_wheel_targets_the_last_controls_owner_in_a_two_column_page', async () => {
      const p = await open('/scroll-owner.html', '<div style="display:flex;gap:20px"><aside data-scroll="content" style="width:200px;height:120px;overflow:auto"><div style="height:200px"></div><button>navigation</button></aside><main data-scroll="content" style="width:300px;height:100px;overflow:auto"><div style="height:500px"></div><button>last control</button></main></div>');
      const before = await p.evaluate(readScrollEndInPage, { scroll: false });
      assert.ok(before.wheelTarget?.x > 220, 'the wheel must target the last control owner, not the taller sidebar');
      await p.mouse.move(before.wheelTarget.x, before.wheelTarget.y);
      await p.mouse.wheel(0, before.wheelTarget.distance);
      await p.waitForTimeout(150);
      assert.equal(await p.locator('main').evaluate(el => el.scrollTop === el.scrollHeight - el.clientHeight), true);
      assert.equal(await p.locator('aside').evaluate(el => el.scrollTop), 0);
      const remaining = await p.evaluate(readScrollEndInPage, { scroll: false });
      assert.ok(remaining.wheelTarget.x < 220);
      await p.mouse.move(remaining.wheelTarget.x, remaining.wheelTarget.y);
      await p.mouse.wheel(0, remaining.wheelTarget.distance);
      await p.waitForTimeout(150);
      assert.equal((await p.evaluate(readScrollEndInPage, { scroll: false })).reachable, true);
      await p.close();
    });
    await t.test('scroll_end_reaches_last_control_and_rejects_a_clipped_container', async () => {
      const p = await open('/scroll-end.html', '<div id="scroll" style="height:100px;overflow:auto"><div style="height:500px"></div><button>last control</button></div>');
      const untouched = await p.evaluate(readScrollEndInPage, { scroll: false });
      assert.equal(untouched.reachable, false);
      assert.equal(await p.locator('#scroll').evaluate(el => el.scrollTop), 0);
      const reached = await p.evaluate(readScrollEndInPage);
      assert.equal(reached.reachable, true);
      assert.equal(reached.moved[0].top, reached.moved[0].maximum);
      await p.evaluate(() => { const element = document.querySelector('#scroll'); element.scrollTop = 0; element.style.overflow = 'hidden'; });
      assert.equal((await p.evaluate(readScrollEndInPage)).reachable, false);
      await p.close();
    });
    for (const [rule, mutation] of [
      ['J-105', cell => { cell.style.textAlign = 'right'; }],
      ['J-109', cell => { cell.innerHTML = '<span class="sti"><svg width="16" height="16"></svg></span>9'; }],
      ['J-104', cell => { cell.className = ''; cell.innerHTML = '<span class="sti-text ok">Healthy</span>'; }],
      ['J-108', () => { document.querySelector('.sg-card').style.borderColor = 'red'; }],
    ]) await t.test(`regression_probe_rejects_only_${rule}`, async () => {
      const p = await open(`/regression-${rule}.html`, '<table class="dt"><thead><tr><th style="text-align:left">Name</th></tr></thead><tbody><tr><td class="num" style="text-align:left">9</td></tr></tbody></table><div class="cc-card"><div class="sg-card" style="border:1px solid transparent">group</div></div>');
      assert.deepEqual((await p.evaluate(readRegressionsInPage)).failures, []);
      await p.locator('td').evaluate(mutation);
      assert.deepEqual([...new Set((await p.evaluate(readRegressionsInPage)).failures.map(row => row.rule))], [rule]);
      await p.close();
    });
    await t.test('regression_probe_follows_contents_and_counts_empty_and_unmeasured_values', async () => {
      const p = await open('/contents-cell.html', '<table class="dt" style="width:400px;table-layout:fixed"><thead><tr><th style="text-align:left">State</th></tr></thead><tbody><tr><td style="text-align:left"><span style="display:contents"><span style="display:flex;justify-content:center"><svg width="16" height="16"></svg></span></span></td></tr></tbody></table>');
      const got = await p.evaluate(readRegressionsInPage);
      assert.ok(got.failures.some(row => row.rule === 'J-105'));
      assert.equal(got.alignment.length, 1);
      await p.locator('td').evaluate(cell => { cell.innerHTML = '<span style="display:contents"><span style="display:none">hidden</span></span>'; });
      assert.equal((await p.evaluate(readRegressionsInPage)).emptyCells, 1);
      await p.locator('td').evaluate(cell => { cell.innerHTML = '<span style="display:contents"><span style="display:inline-block;width:16px;height:16px;background:red"></span></span>'; });
      assert.equal((await p.evaluate(readRegressionsInPage)).unmeasuredCells, 1);
      await p.close();
    });
    await t.test('folded_disabled_tab_blocks_pointer_and_keyboard_selection', async () => {
      const p = await open('/disabled-tab.html', `<link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><main style="width:180px"></main><script type="module">
        import * as tabs from '/kit/components/pill-tabs.js';
        import * as menu from '/kit/components/menu.js';
        import * as item from '/kit/components/menu-item.js';
        const style = document.createElement('style'); style.textContent = tabs.css + menu.css + item.css; document.head.append(style);
        document.querySelector('main').innerHTML = tabs.render({id:'attack',spaced:true,value:'a',action:'choose',tabs:[{id:'a',label:'Selected'},{id:'b',label:'Disabled long option',disabled:true},{id:'c',label:'Another option'}]}).s;
        window.calls = []; tabs.attach(document, { menu: menu.attach(document, { emit: (action, value) => calls.push(value.arg) }) }); window.ready = true;
      </script>`);
      await p.waitForFunction(() => window.ready);
      await p.locator('[data-pills-more]').click();
      const disabled = p.locator('.menu [aria-disabled="true"]');
      assert.equal(await disabled.count(), 1);
      await disabled.dispatchEvent('click');
      assert.deepEqual(await p.evaluate(() => calls), []);
      await disabled.dispatchEvent('keydown', { key: 'Enter' });
      assert.deepEqual(await p.evaluate(() => calls), []);
      await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
      assert.deepEqual(await p.evaluate(() => calls), ['c']);
      await p.close();
    });
    await t.test('regression_probe_rejects_centered_content_with_left_text_align', async () => {
      const p = await open('/centered-content.html', '<table class="dt"><thead><tr><th style="text-align:left">Status</th></tr></thead><tbody><tr><td style="text-align:left;width:200px"><span style="display:flex;justify-content:center"><svg width="16" height="16"></svg></span></td></tr></tbody></table>');
      assert.equal(await p.locator('td').evaluate(el => getComputedStyle(el).textAlign), 'left');
      assert.equal((await p.evaluate(readRegressionsInPage)).failures.some(row => row.rule === 'J-105'), true);
      await p.locator('td > span').evaluate(el => { el.style.justifyContent = 'start'; });
      assert.deepEqual((await p.evaluate(readRegressionsInPage)).failures, []);
      for (const [offset, rejected] of [[1.5, false], [2.5, true]]) {
        await p.locator('svg').evaluate((el, value) => { el.style.marginLeft = value + 'px'; }, offset);
        assert.equal((await p.evaluate(readRegressionsInPage)).failures.some(row => row.rule === 'J-105'), rejected);
      }
      await p.locator('td > span').evaluate(el => {
        el.style.justifyContent = 'center';
        el.innerHTML = '<i class="dot" style="width:16px;height:16px;background:black"></i>';
      });
      assert.equal((await p.evaluate(readRegressionsInPage)).failures.some(row => row.rule === 'J-105'), true, 'a painted dot is visible content too');
      await p.close();
    });
    await t.test('morph_skeleton_to_status_keeps_first_visible_content_aligned', async () => {
      const p = await open('/skeleton-status.html', `<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><div id="host"></div><script type="module">
        import * as table from '/kit/components/data-table.js';
        import * as skeleton from '/kit/components/skeleton.js';
        import * as status from '/kit/components/status-icon.js';
        import { morph } from '/kit/core/morph.js';
        const style = document.createElement('style'); style.textContent = table.css + skeleton.css + status.css; document.head.append(style);
        const draw = cell => morph(document.querySelector('#host'), table.render({ columns: [{id:'status', label:'Status', cell}], rows:[{id:'one'}], rowKey:'id' }));
        draw(() => skeleton.render({width:'60%',height:'1lh'}));
        draw(() => status.render({kind:'ok'})); window.ready = true;
      </script>`);
      await p.waitForFunction(() => window.ready);
      const delta = await p.evaluate(() => {
        const range = document.createRange(); range.selectNodeContents(document.querySelector('th'));
        return document.querySelector('td svg').getBoundingClientRect().left - range.getBoundingClientRect().left;
      });
      assert.ok(Math.abs(delta) <= 2, `first content offset ${delta}`);
      await p.close();
    });
    await t.test('morph_nested_components_store_bounded_signatures_and_preserve_behavior', async () => {
      const p = await open('/morph-signatures.html', '<div id="host"></div><script type="module">import { morph, invalidate } from "/kit/core/morph.js"; window.draw = value => morph(document.querySelector("#host"), value); window.invalidate = invalidate;</script>');
      await p.waitForFunction(() => window.draw);
      const result = await p.evaluate(() => {
        const markup = '<section data-c="outer"><div data-c="inner">' + 'x'.repeat(10000) + '</div></section>';
        draw(markup); draw(markup);
        const outer = document.querySelector('section'), inner = outer.firstChild;
        const sizes = [outer, inner].map(el => String(el._morphSrc).length);
        inner.style.width = '42px'; draw(markup);
        const kept = inner.style.width;
        draw(markup.replace('xxxx', 'yyyy'));
        const changed = inner.textContent.startsWith('yyyy');
        inner.textContent = 'local'; invalidate(inner); draw(markup);
        return {sizes, kept, changed, restored: inner.textContent === 'x'.repeat(10000), same: outer === document.querySelector('section')};
      });
      assert.ok(result.sizes.every(size => size <= 40), JSON.stringify(result));
      assert.equal(result.kept, '42px'); assert.equal(result.changed, true); assert.equal(result.restored, true); assert.equal(result.same, true);
      await p.close();
    });
    const tabPage = async (name, tabs, width = 200) => {
      const p = await open('/tabs-' + name + '.html', `<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><div id="host" style="width:${width}px"></div><div id="outside"></div><script type="module">
        import { render, attach, css } from '/kit/components/pill-tabs.js';
        const style = document.createElement('style'); style.textContent = css; document.head.append(style);
        document.querySelector('#host').innerHTML = render({id:'tabs', action:'choose', value:'selected', spaced:true, tabs:${JSON.stringify(tabs)}}).s;
        attach(document); window.ready = true;
      </script>`);
      await p.waitForFunction(() => window.ready); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(100);
      return p;
    };
    await t.test('fold_single_oversized_tab_hides_empty_more', async () => {
      const p = await tabPage('single', [{id:'selected', label:'A very long selected tab that cannot fit'}], 120);
      assert.equal(await p.locator('[data-pills-more]').isVisible(), false);
      await p.close();
    });
    await t.test('fold_oversized_selection_stays_inside_card', async () => {
      const p = await tabPage('oversized', [{id:'selected', label:'A very long selected tab that cannot fit'}, {id:'other', label:'Other'}], 180);
      assert.deepEqual((await p.evaluate(readRegressionsInPage)).failures, []);
      assert.equal(await p.locator('[aria-selected="true"]').isVisible(), true);
      assert.equal(await p.locator('[data-pills-more]').evaluate(el => el._items.length), 1);
      await p.close();
    });
    await t.test('fold_hidden_count_change_refreshes_width_before_unfolding', async () => {
      const p = await tabPage('count', [{id:'selected',label:'Selected'}, {id:'other',label:'Other',count:12}], 140);
      const old = await p.locator('.pill').nth(1).evaluate(el => ({hidden:el.hidden,width:el._w}));
      assert.equal(old.hidden, true);
      await p.locator('.n').evaluate(el => { el.firstChild.data = '120'; });
      await p.waitForTimeout(100);
      assert.ok(await p.locator('.pill').nth(1).evaluate((el, width) => el._w > width, old.width), 'hidden count width must be remeasured');
      await p.locator('#host').evaluate(el => {el.style.width = '500px';}); await p.waitForTimeout(100);
      assert.equal(await p.locator('[data-pills-more]').isVisible(), false);
      await p.close();
    });
    await t.test('fold_unrelated_body_mutation_does_not_measure_tabs', async () => {
      const p = await tabPage('outside', [{id:'selected',label:'Selected'}, {id:'other',label:'Other'}]);
      await p.evaluate(() => {
        window.tabReads = 0;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
        for (const el of document.querySelectorAll('.pills, .pill')) Object.defineProperty(el, 'offsetWidth', {get() {window.tabReads++; return descriptor.get.call(this);}});
        document.querySelector('#outside').append(document.createElement('div'));
      });
      await p.waitForTimeout(100);
      assert.equal(await p.evaluate(() => window.tabReads), 0);
      await p.close();
    });
    await t.test("a menu's own scroll bar drawn over it is part of the menu: passes", async () => {
      const p = await open('/own.html', glassPage({ foreign: false }));
      await p.evaluate(() => window.ready); await p.addStyleTag({ content: PROBE_CSS });
      const shown = await p.evaluate(() => [...document.querySelectorAll('.sa-bar.v.live.on')].length);
      assert.equal(shown, 1, 'the menu bar is shown over the menu');
      const s = await measureGlass(p, lab);
      assert.equal(s.own, 1, 'the menu bar is found as the menu\'s own');
      assert.ok(s.lap < SHARP, `lap ${s.lap}`);
      await p.close();
    });
    await t.test('a menu that has not scrolled yet: the bar the measure makes for it is its own, passes', async () => {
      const p = await open('/rest.html', glassPage({ foreign: false, rest: true }));
      await p.evaluate(() => window.ready); await p.addStyleTag({ content: PROBE_CSS });
      assert.equal(await p.evaluate(() => document.querySelectorAll('.sa-bar').length), 0, 'no bar before the measure');
      const s = await measureGlass(p, lab);
      assert.equal(s.own, 2, 'the two bars (vertical and horizontal) the scroll made for the menu');
      assert.ok(s.lap < SHARP, `lap ${s.lap}`);
      await p.close();
    });
    await t.test("another scroller's bar inside the menu box is not the menu's: fails", async () => {
      const p = await open('/foreign.html', glassPage({ foreign: true }));
      await p.evaluate(() => window.ready); await p.addStyleTag({ content: PROBE_CSS });
      const inside = await p.evaluate(() => {
        const m = document.querySelector('.menu').getBoundingClientRect();
        return [...document.querySelectorAll('.sa-bar.v.live.on .sa-thumb')].filter(b => { const r = b.getBoundingClientRect(); return r.left >= m.left && r.right <= m.right && r.top >= m.top && r.bottom <= m.bottom; }).length;
      });
      assert.equal(inside, 2, 'both thumbs are drawn inside the menu box');
      const s = await measureGlass(p, lab);
      assert.equal(s.own, 1, 'only the menu bar is its own');
      assert.ok(!(s.lap < SHARP), `lap ${s.lap} should reach ${SHARP}`);
      await p.close();
    });
    await t.test('a wrong link radius and a frame inside the body card are read and fail', async () => {
      const html = (link, wrap, inner, wrapClass = '', innerClass = '') => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
<button class="btn link" style="border-radius: ${link}; corner-shape: superellipse(1.4)">link</button>
<div class="${wrapClass}" style="${wrap}; padding: 8px"><div class="cc-card" style="width: 400px; height: 300px; background: #222; border-radius: 16px; padding: 10px">
<div class="${innerClass}" style="${inner}; width: 300px; height: 100px">group</div></div></div></body></html>`;
      const read = async (path, ...a) => { const p = await open(path, html(...a)); const got = await readSurfaces(p); await p.close(); return judge(got); };
      assert.deepEqual(await read('/ok.html', '5.6px', 'background: #111', 'border-bottom: 1px solid #333'), [], 'a page ground and a parted row are not frames');
      assert.deepEqual(await read('/window.html', '5.6px', 'background: #111; border-radius: 16px', '', 'l-box'), [], 'a miniature window (layouts.html .l-box) is the window, not a frame');
      assert.deepEqual(await read('/group.html', '5.6px', '', 'background: #2a2a2a; border-radius: 16.8px; corner-shape: superellipse(1.4)', '', 'sg-card'), [], 'a settings group as a pale face with no border passes');
      assert.match((await read('/group-edge.html', '5.6px', '', 'background: #2a2a2a; border-radius: 16.8px; corner-shape: superellipse(1.4); border: 1px solid #555', '', 'sg-card'))[0], /settings group inside the body card draws a visible border: div\.sg-card/);
      assert.deepEqual(await read('/group-clear.html', '5.6px', '', 'border-radius: 16.8px; corner-shape: superellipse(1.4); border: 1px solid transparent', '', 'sg-card'), [], 'a transparent border is not visible');
      const bad = await read('/bad.html', '99px', 'background: #111; border-radius: 16px', 'background: #333; border-radius: 23px');
      assert.equal(bad.length, 3, bad.join('\n'));
      assert.match(bad[0], /\.btn\.link: radius 99\/99px/);
      assert.match(bad[1], /\.cc-card: a frame inside a frame/);
      assert.match(bad[2], /\.cc-card: a card inside the body card: div \(radius 23px, background/);
    });
    await t.test('a floating surface counts only when shown: hidden or absent fails, late but shown passes', async () => {
      const menuPage = body => `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
      const box = 'position: fixed; left: 40px; top: 40px; width: 200px; height: 120px; background: #fff';
      const cases = [
        ['/m-hidden.html', `<div class="menu" style="${box}; visibility: hidden"></div>`, /not shown within 1500ms: \.menu not shown: hidden/],
        ['/m-display.html', `<div style="display: none"><div class="menu" style="${box}"></div></div>`, /not shown within 1500ms: \.menu not shown: hidden/],
        ['/m-none.html', '', /not shown within 1500ms: no \.menu in the document/],
        ['/m-closed.html', `<div class="menu" data-state="closed" style="${box}"></div>`, /not shown: closing/],
        ['/m-tiny.html', `<div class="menu" style="position: fixed; width: 4px; height: 4px"></div>`, /too small/],
      ];
      cases.push(
        ['/m-opacity.html', `<div class="menu" style="${box}; opacity: 0"></div>`, /hidden \(display, visibility or opacity 0\)/],
        ['/m-opacity-parent.html', `<div style="opacity: 0.02"><div class="menu" style="${box}"></div></div>`, /transparent \(opacity 0\.02\)/],
        ['/m-clip.html', `<div class="menu" style="${box}; clip-path: inset(50%)"></div>`, /cut away \(clip-path inset\(50%\)\)/],
        ['/m-clip-split.html', `<div class="menu" style="${box}; clip-path: inset(40% 0 60% 0)"></div>`, /cut away \(clip-path inset\(40% 0px 60%/],
        ['/m-clip-px.html', `<div class="menu" style="${box}; clip-path: inset(0 100px 0 100px)"></div>`, /cut away \(clip-path inset/],
        ['/m-filter.html', `<div class="menu" style="${box}; filter: opacity(0)"></div>`, /transparent \(opacity 0\.00\)/],
        ['/m-clip-calc.html', `<div class="menu" style="${box}; clip-path: inset(calc(40% + 20px) 0 calc(40% + 20px) 0)"></div>`, /cut away \(clip-path inset\(calc/],
        ['/m-clip-xywh.html', `<div class="menu" style="${box}; clip-path: xywh(50px 50px 0 0)"></div>`, /cut away \(clip-path inset/],
        ['/m-clip-rect.html', `<div class="menu" style="${box}; clip-path: rect(50px 50px 50px 50px)"></div>`, /cut away \(clip-path inset/],
        ['/m-clip-corner.html', `<div class="menu" style="${box}; clip-path: circle(closest-side at 0 0)"></div>`, /cut away \(clip-path circle/],
        ['/m-clip-poly.html', `<div class="menu" style="${box}; clip-path: polygon(0 0, 0 0, 0 0)"></div>`, /cut away \(clip-path polygon/],
        ['/m-clip-parent.html', `<div style="position: fixed; left: 0; top: 0; width: 400px; height: 400px; clip-path: inset(0 0 300px 0)"><div class="menu" style="${box}; top: 200px"></div></div>`, /cut away \(clip-path inset\(0px 0px 300px/],
        ['/m-overflow-parent.html', `<div style="position: fixed; left: 40px; top: 40px; width: 100px; height: 100px; overflow: hidden"><div class="menu" style="position: absolute; top: 300px; width: 200px; height: 120px; background: #fff"></div></div>`, /clipped to nothing by an ancestor/],
        ['/m-filter-tiny.html', `<div class="menu" style="${box}; filter: opacity(0.00001)"></div>`, /transparent \(opacity 0\.00\)/],
        ['/m-filter-parent.html', `<div style="filter: blur(1px) opacity(2%)"><div class="menu" style="${box}"></div></div>`, /transparent \(opacity 0\.02\)/],
        ['/m-scale.html', `<div class="menu" style="${box}; transform: scale(0)"></div>`, /too small \(0x0\)/],
        ['/m-offscreen.html', `<div class="menu" style="${box}; left: -600px"></div>`, /off screen/],
        ['/m-clipped.html', `<div style="position: fixed; left: 40px; top: 40px; width: 0; height: 0; overflow: hidden"><div class="menu" style="width: 200px; height: 120px"></div></div>`, /clipped to nothing by an ancestor|too small/],
      );
      for (const [path, body, reason] of cases) {
        const p = await open(path, menuPage(body));
        const r = await readSurface(p, '.menu', { timeout: 1500, settleMs: 0 });
        assert.equal(r.surface, undefined, path); assert.match(r.reason, reason, path);
        await p.close();
      }
      const ok = await open('/m-ok.html', menuPage(`<div class="menu" style="${box}"></div>`));
      assert.ok((await readSurface(ok, '.menu', { timeout: 1500, settleMs: 0 })).surface, 'a shown menu is read');
      await ok.close();
      // shown counterparts: a partial clip still shows part of the surface (its border can still be wrong), a half-transparent filter still shows it
      for (const [path, style] of [['/m-clip-top.html', 'clip-path: inset(50% 0 0 0)'], ['/m-clip-none.html', 'clip-path: inset(0)'], ['/m-clip-circle.html', 'clip-path: circle(50%)'],
        ['/m-filter-half.html', 'filter: opacity(0.5)'], ['/m-filter-one.html', 'filter: opacity(1)'], ['/m-opacity-one.html', 'opacity: 1'],
        // a box that clips nothing: display: contents has no box; a static clipping ancestor is not on a fixed or absolute box's containing block chain
        ['/m-contents-clip.html', `<div style="display: contents; clip-path: inset(0)"><div class="menu" style="${box}"></div></div>`],
        ['/m-static-clip-abs.html', `<div style="width: 0; height: 0; overflow: hidden"><div class="menu" style="position: absolute; left: 40px; top: 40px; width: 200px; height: 120px; background: #fff"></div></div>`],
        ['/m-static-clip-fixed.html', `<div style="width: 0; height: 0; overflow: hidden"><div class="menu" style="${box}"></div></div>`]]) {
        const p = await open(path, style.startsWith('<') ? menuPage(style) : menuPage(`<div class="menu" style="${box}; ${style}"></div>`));
        const r = await readSurface(p, '.menu', { timeout: 1500, settleMs: 0 });
        assert.ok(r.surface, `${path}: ${r.reason}`);
        await p.close();
      }
      const fade = await open('/m-fade.html', menuPage(`<div class="menu" style="${box}; opacity: 0"></div><script>setTimeout(() => { document.querySelector('.menu').style.opacity = '1'; }, 800);</script>`));
      const rf = await readSurface(fade, '.menu', { timeout: 3000, settleMs: 100 });
      assert.ok(rf.surface, `a menu that becomes opaque later is read once shown: ${rf.reason}`);
      await fade.close();
      const gone = await open('/m-gone.html', menuPage(`<div class="menu" style="${box}"></div><script>setTimeout(() => { document.querySelector('.menu').style.opacity = '0'; }, 150);</script>`));
      const rg = await readSurface(gone, '.menu', { timeout: 1500, settleMs: 400 });
      assert.equal(rg.surface, undefined); assert.match(rg.reason, /^shown, then \.menu not shown: hidden/);
      await gone.close();
      const late = await open('/m-late.html', menuPage(`<script>setTimeout(() => { const m = document.createElement('div'); m.className = 'menu'; m.style.cssText = '${box}'; document.body.appendChild(m); }, 800);</script>`));
      const r = await readSurface(late, '.menu', { timeout: 3000, settleMs: 100 });
      assert.ok(r.surface, r.reason); assert.equal(r.surface.alpha, 1);
      await late.close();
    });
    await t.test('a settings group border fails at any window width and group size', async () => {
      const page = (group, width) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin: 0; width: ${width}px">
<div class="cc-card" style="width: ${width - 200}px; height: 600px; background: #222; border-radius: 16px; display: flex; justify-content: center">
<div style="width: 636px">${group}</div></div></body></html>`;
      const g = (h, w, border) => `<div class="sg-card" style="height: ${h}px; width: ${w}; background: #2a2a2a; border-radius: 16.8px; corner-shape: superellipse(1.4); border: ${border}">row</div>`;
      for (const width of [1000, 1600]) for (const [name, h, w] of [['wide', 200, '100%'], ['one row', 30, '100%'], ['narrow', 200, '120px']]) {
        const read = async border => { const p = await open(`/g-${width}-${name.replace(' ', '')}-${border ? 1 : 0}.html`, page(g(h, w, border || '0')), { width }); const got = await readSurfaces(p); await p.close(); return judge(got); };
        assert.match((await read('2px solid #f00')).join('\n'), /settings group inside the body card draws a visible border/, `${width} ${name}`);
        assert.deepEqual(await read(''), [], `${width} ${name} without a border`);
      }
      // a group that is not shown draws no border on screen: no finding; shown again, its border is found
      const hiddenGroup = async (path, style) => { const p = await open(path, page(g(32, '100%', '2px solid #f00').replace('style="', `style="${style}; `), 1000), { width: 1000 }); const out = judge(await readSurfaces(p)); await p.close(); return out; };
      assert.deepEqual(await hiddenGroup('/g-opacity.html', 'opacity: 0'), [], 'an opacity 0 group');
      assert.deepEqual(await hiddenGroup('/g-visibility.html', 'visibility: hidden'), [], 'a visibility hidden group');
      assert.deepEqual(await hiddenGroup('/g-display.html', 'display: none'), [], 'a display none group');
      assert.match((await hiddenGroup('/g-shown.html', 'opacity: 1')).join('\n'), /settings group inside the body card draws a visible border/, 'the same short group shown');
    });
  } finally {
    await browser.close();
    server.close();
  }
});
