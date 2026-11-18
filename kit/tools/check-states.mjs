#!/usr/bin/env node
/*
 * Interaction state check (scripted run). Exit code 1 if anything fails.
 *   node kit/tools/check-states.mjs --app <id>
 * Needs playwright-core (NODE_PATH) and Chromium, like check.mjs.
 *
 * Checks, on the shell, every route page, components.html and layouts.html:
 *  1. motion: hovering each interactive element; every property that changes (background, color, shadow, opacity, transform,
 *     padding, width) must be covered by a transition with a non-zero duration. Elements measured as instant on the reference
 *     (native style rows and top bar buttons, menu items) are listed in INSTANT and are skipped.
 *  2. shape: pill elements (composer toolbar buttons, composer round buttons, wide composer) are fully round.
 *  3. kit motion: switch thumb, tab indicators, menus, tooltips, scroll bars and section chevrons declare a transition or animation;
 *     after a redraw the switch, the indicator and the composer input are the same elements (no replace), and the indicator
 *     passes through intermediate positions.
 *  4. reduced motion: with prefers-reduced-motion every --dur-* token is 0.
 *  5. scroll: every overflowing scroller is a [data-scroll] element with no native bar width (overlay bars only);
 *     the bar shows while scrolling and hides after --delay-scrollbar-hide; in a rounded scroller the bar starts below the corner;
 *     adding content until a scroller overflows moves nothing inside it (no width change, no shift).
 *  6. outlines: a bordered or ringed rounded element inside a clipping ancestor is not cut at its left, right or top edge.
 *  7. input method: composing Hangul (U+3147, U+C544 -> U+C548) in the conversation card's composer while the page context changes and its bottom
 *     redraws keeps the field, its value and its focus.
 *  8. desktop window material: with a simulated window.kitShell (shell) and window.kitBridge (tab page), html has is-desktop and,
 *     in dark and light, after a redraw and after a reload, every box from the sidebar scroller up to html paints
 *     no background (the macOS vibrancy shows through) while the center card (frame-main, which also holds the conversation card) keeps its own
 *     background; on the window material no element paints an opaque background except those the reference also draws opaque (OPAQUE_ON_MATERIAL, measured over two
 *     backgrounds in dark and light: page icon tiles and status dots, the context chip and its icon tile, the dictate and send buttons; in light
 *     also the composer card and its round button, the selected row and the selected tile). On a screen that lays out its own body card
 *     (.frame-main.bare, settings) the center card paints no face and that body card is the one opaque round card, with no frame around or card inside it.
 *  9. question panel (when the app has a chat route and a conversation with a waiting proposal in its examples): the proposal's target
 *     line and diff are in the answer as text and a code block; the panel sits right above the composer, narrower than it, and takes focus;
 *     the composer below is in answer mode; the panel appears without transition or animation while its rows fade their fill;
 *     up and down move the selection with wrapping and focus the row; Enter submits the selected row, Escape declines and mod+enter
 *     allows (each leaves a result line in the conversation and closes the panel); text sent from the composer is a message and
 *     declines the proposal; with ai.approvals.allowAlways false no 'always' option is drawn and a config that defines one fails validation.
 * 10. overlay scroll bar ends: at scrollTop 0 and at the end the thumb sits inside its track (both caps whole, full travel) and its
 *     rounded box is inside the scroller's own rounded clip and, in a desktop tab page, inside the view's rounded corners.
 * 11. floating surfaces: in the browser menu and submenu are glass (92% dark, 94% light, blur 24px); in desktop mode menu and submenu are
 *     the popover color at 80% with blur 8px (measured on the real screen; the conversation card's menus sit in a tab page document, which in light
 *     takes white at 80% in the browser and opaque white on desktop) and the palette is opaque; the tooltip is opaque in both; dark and light,
 *     and no ancestor cuts their backdrop.
 * 12. top bar popovers (identity chip and right-side buttons with a menu), in the browser and in desktop mode, dark and light:
 *     opening runs the open animation and marks the trigger open; the panel is translucent with a backdrop blur in the browser and opaque in desktop mode,
 *     and no ancestor cuts its backdrop; Tab moves the highlight inside; Escape runs the close animation, removes the panel and returns
 *     focus to the trigger; a confirm switch row closes the panel without changing its value.
 * 13. path: on every example route opened in the shell, no path segment repeats the identity chip label, and the rule after the chip
 *     is drawn only when a path follows.
 * 14. theme: choosing light, dark or system (with the OS scheme changing) applies to the shell and every open tab page at once, without a reload;
 *     in desktop mode the shell asks the window for the same theme (theme:set) so the window material follows.
 * 15. corner radii: per role the computed corner radius and corner shape (superellipse factor, 1 = circular) match the role table of spec/rules.md#RULE-PANE
 *     and, for the side tone, the values measured on the reference (RADII in check-surfaces.mjs); the settings body is the one frame of its screen (ONE_FRAME; with it the shell's center card is bare), on the shell (with the composer + menu open), every tab page frame, components.html and layouts.html.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { RADII, ONE_FRAME, readSurfaces, judgeSurfaces, readSurface } from './check-surfaces.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const args = process.argv.slice(2);
const appId = args[args.indexOf('--app') + 1];
if (!args.includes('--app') || !appId) { console.error('usage: check-states.mjs --app <id>'); process.exit(2); }
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { console.error('playwright-core not found (set NODE_PATH)'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const p = resolve(repo, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(repo) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const config = (await import(pathToFileURL(join(repo, 'apps', appId, 'app.config.js')))).default;
const fixturePath = join(repo, 'apps', appId, 'test-fixtures', 'check-states.json');
const { settings: surfaceSettings = {}, ...serviceFixtures } = existsSync(fixturePath) ? JSON.parse(readFileSync(fixturePath, 'utf8')) : {};
const features = { tabs: true, panel: true, settings: true, palette: true, ...(config.features || {}) };
const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

/* Interactive elements whose hover change is instant on the reference (measured on a 60 fps recording: 1 frame) */
/* (composer dictate and send buttons are marked transition-none on the reference; file tree rows have no transition class in the bundle) */
const INSTANT = ['.sb-row', '.sb-sec-head', '.snav-i', '.mi', '.nav-btn', '.seg', '.sb-row .x', '.m-sub-head', '.cmp-send', '.ft-row'];
const PROPS = ['background-color', 'color', 'box-shadow', 'opacity', 'transform', 'padding-left', 'padding-right', 'width'];
const SEL = 'button, [role=tab], [role=switch], [role=button], a[href], [data-action], [data-menu]';
const PILLS = ['.tbb', '.cmp-round', '.cmp.wide', '.pills .pill', '.sw'];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// the app's first-run flow is checked on its own; the other checks start past it (kit.firstRun.done unless a check set it)
const launchPage = browser.newPage.bind(browser);
browser.newPage = async o => { const p = await launchPage(o); await p.addInitScript(id => { try { const k = id + ':settings', v = JSON.parse(localStorage.getItem(k) || '{}'); if (v['kit.firstRun.done'] === undefined) localStorage.setItem(k, JSON.stringify({ ...v, 'kit.firstRun.done': true })); } catch { /* no storage */ } }, config.id); return p; };

async function motion(page, where) {
  for (const fr of page.frames()) {
    const n = await fr.evaluate(([sel, instant]) => {
      const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null && !instant.some(s => e.matches(s)) && !e.closest('.menu, .tip'));
      document.querySelectorAll('[data-st]').forEach(e => e.removeAttribute('data-st'));
      els.forEach((e, i) => e.setAttribute('data-st', i));
      return els.length;
    }, [SEL, INSTANT]).catch(() => 0);
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const info = await fr.evaluate(([i, props]) => {
        const e = document.querySelector(`[data-st="${i}"]`); if (!e) return null;
        e.scrollIntoView({ block: 'center' });
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e), st = {};
        props.forEach(p => { st[p] = cs.getPropertyValue(p); });
        return { key: (e.dataset.c || e.tagName.toLowerCase()) + '.' + [...e.classList].slice(0, 3).join('.'), st, tp: cs.transitionProperty, td: cs.transitionDuration, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
      }, [i, PROPS]);
      if (!info || seen.has(info.key) || !info.w) continue;
      seen.add(info.key);
      const off = fr === page.mainFrame() ? { x: 0, y: 0 } : await (await fr.frameElement()).boundingBox();
      await page.mouse.move(off.x + info.x, off.y + info.y);
      await page.waitForTimeout(450);
      const hov = await fr.evaluate(([i, props]) => { const e = document.querySelector(`[data-st="${i}"]`); if (!e) return null; const cs = getComputedStyle(e), st = {}; props.forEach(p => { st[p] = cs.getPropertyValue(p); }); return st; }, [i, PROPS]);
      if (!hov) continue; // the page drew again under the pointer: that element is gone
      const tps = info.tp.split(',').map(s => s.trim()), tds = info.td.split(',').map(parseFloat);
      const covered = p => tps.some((t, k) => (t === 'all' || t === p || (t === 'background' && p === 'background-color') || (t === 'padding' && (p.startsWith('padding') || p === 'width'))) && (tds[k % tds.length] || 0) > 0);
      const instant = PROPS.filter(p => hov[p] !== info.st[p] && !covered(p));
      if (instant.length) fail(where, `${info.key} changes ${instant.join(', ')} on hover without a transition`);
      await page.mouse.move(1, 1);
    }
  }
}

async function shapes(page, where) {
  for (const fr of page.frames()) {
    const bad = await fr.evaluate(pills => {
      const out = [];
      for (const s of pills) for (const e of document.querySelectorAll(s)) {
        if (e.offsetParent === null) continue;
        const r = e.getBoundingClientRect(), rad = parseFloat(getComputedStyle(e).borderTopLeftRadius);
        if (rad + 0.5 < Math.min(r.width, r.height) / 2) out.push(`${s} radius ${rad} < ${Math.min(r.width, r.height) / 2}`);
      }
      return out;
    }, PILLS).catch(() => []);
    for (const b of [...new Set(bad)]) fail(where, `pill shape: ${b}`);
  }
}

async function scrolls(page, where) {
  for (const fr of page.frames()) {
    const bad = await fr.evaluate(() => {
      const out = [];
      for (const e of document.querySelectorAll('body *, body')) {
        const cs = getComputedStyle(e);
        if (!/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) continue;
        const oy = e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(cs.overflowY), ox = e.scrollWidth > e.clientWidth + 1 && /(auto|scroll)/.test(cs.overflowX);
        if (!oy && !ox) continue;
        const name = e.tagName.toLowerCase() + '.' + [...e.classList].join('.');
        if (!e.hasAttribute('data-scroll')) out.push(`${name} scrolls without an overlay bar ([data-scroll])`);
        const gutter = e.offsetWidth - e.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
        if (gutter > 0.5) out.push(`${name} has a native scroll bar ${gutter}px wide`);
      }
      return out;
    }).catch(() => []);
    for (const b of [...new Set(bad)]) fail(where, b);
  }
}

/* The sidebar scroller draws no bar while it scrolls (reference) */
async function noBar(fr, where, sel) {
  const shown = await fr.evaluate(async sel => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.style.paddingBottom = '2000px'; el.scrollTop = 40;
    await new Promise(res => setTimeout(res, 250));
    const r = el.getBoundingClientRect();
    const hit = [...document.querySelectorAll('.sa-bar.v.live')].some(b => Math.abs(b.getBoundingClientRect().right - r.right) < 1);
    el.scrollTop = 0; el.style.paddingBottom = '';
    return hit;
  }, sel);
  if (shown) fail(where, `${sel}: the sidebar draws a scroll bar`);
}

/* Bars show while scrolling and hide after the delay; in a rounded scroller the vertical bar starts below the corner */
async function scrollBar(fr, where, sel) {
  const r = await fr.evaluate(async sel => {
    const el = document.querySelector(sel);
    if (!el || el.scrollHeight <= el.clientHeight + 1) return { skip: true };
    el.scrollTop = 0; el.scrollTop = 40;
    await new Promise(res => setTimeout(res, 250));
    const bars = [...document.querySelectorAll('.sa-bar.v.live')];
    const bar = bars.find(b => Math.abs(b.getBoundingClientRect().right - el.getBoundingClientRect().right) < 1);
    if (!bar) return { missing: true };
    const during = parseFloat(getComputedStyle(bar).opacity);
    const delay = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--delay-scrollbar-hide')) || 500;
    await new Promise(res => setTimeout(res, delay + 400));
    const after = parseFloat(getComputedStyle(bar).opacity);
    el.scrollTop = 0;
    return { during, after };
  }, sel);
  if (r.skip) return;
  if (r.missing) { fail(where, `${sel}: no overlay bar while scrolling`); return; }
  if (r.during < 0.5) fail(where, `${sel}: bar not shown while scrolling (opacity ${r.during})`);
  if (r.after > 0.01) fail(where, `${sel}: bar still shown after scrolling stopped (opacity ${r.after})`);
  await scrollEnds(fr, where, sel);
}

/* Thumb at both scroll ends: inside its track --scroll-inset (8) from the end (reference inset) or the corner offset, both caps whole inside the
   scroller's rounded corners and, in a desktop tab page, inside the native view's rounded corners (--r-window) */
async function scrollEnds(fr, where, sel) {
  const res = await fr.evaluate(async sel => {
    const el = document.querySelector(sel);
    if (!el || el.scrollHeight <= el.clientHeight + 1) return null;
    const root = getComputedStyle(document.documentElement), pad = parseFloat(root.getPropertyValue('--scroll-inset'));
    const vr = window.kitBridge ? parseFloat(root.getPropertyValue('--r-window')) || 0 : 0;
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const out = [];
    for (const end of ['start', 'end']) {
      el.scrollTop = end === 'start' ? 1 : 0; await new Promise(r => setTimeout(r, 30));
      el.scrollTop = end === 'start' ? 0 : el.scrollHeight; await new Promise(r => setTimeout(r, 120));
      const er = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const bar = [...document.querySelectorAll('.sa-bar.v.live')].find(b => Math.abs(b.getBoundingClientRect().right - er.right) < 1);
      if (!bar) { out.push(`${end}: no bar`); continue; }
      const br = bar.getBoundingClientRect(), t = bar.querySelector('.sa-thumb').getBoundingClientRect();
      if (end === 'start' && Math.abs(t.top - (br.top + pad)) > 0.5) out.push(`start: thumb top ${(t.top - br.top).toFixed(1)} from the track start, expected ${pad}`);
      if (end === 'end' && Math.abs(t.bottom - (br.bottom - pad)) > 0.5) out.push(`end: thumb bottom ${(br.bottom - t.bottom).toFixed(1)} from the track end, expected ${pad}`);
      if (t.top < er.top - 0.5 || t.bottom > er.bottom + 0.5) out.push(`${end}: thumb outside the scroller box`);
      // round caps against each clipping corner (own radius, view radius where the scroller meets the viewport corner)
      const h = t.width / 2, cx = t.left + h;
      const corners = [
        ['top', Math.max(parseFloat(cs.borderTopRightRadius) || 0, vr && Math.abs(er.right - vw) < 1 && Math.abs(er.top) < 1 ? vr : 0), t.top + h, er.top],
        ['bottom', Math.max(parseFloat(cs.borderBottomRightRadius) || 0, vr && Math.abs(er.right - vw) < 1 && Math.abs(er.bottom - vh) < 1 ? vr : 0), t.bottom - h, er.bottom],
      ];
      for (const [side, R, cy, edge] of corners) {
        if (!R) continue;
        const ccx = er.right - R, ccy = side === 'top' ? edge + R : edge - R;
        const inZone = cx > ccx && (side === 'top' ? cy < ccy : cy > ccy);
        if (inZone && Math.hypot(cx - ccx, cy - ccy) + h > R + 0.5) out.push(`${end}: thumb ${side} cap cut by the ${R}px corner`);
      }
    }
    el.scrollTop = 0;
    return out;
  }, sel);
  for (const m of res || []) fail(where, `${sel} scroll ends: ${m}`);
}

/* Growing content until the scroller overflows must not move or resize anything already inside it */
async function noShift(fr, where, sel) {
  const result = await fr.evaluate(async sel => {
    const el = document.querySelector(sel); if (!el) return null;
    /* a spinning status ring turns in place: its box changes with the angle, not with the layout */
    const collect = () => [...el.querySelectorAll('*')].filter(k => k.offsetParent !== null && !k.closest('.sti.busy')).slice(0, 60);
    let kids = collect();
    const geometry = () => kids.map(k => { const r = k.getBoundingClientRect(); return [r.left, r.width]; });
    const finiteTransitions = () => el.getAnimations({ subtree: true }).filter(a => typeof a.transitionProperty === 'string' && Number.isFinite(a.effect?.getComputedTiming().endTime) && !['finished', 'idle'].includes(a.playState));
    let fontsReady = !document.fonts || document.fonts.status === 'loaded';
    document.fonts?.ready.then(() => { fontsReady = true; });
    /* a page still drawing its first content (a report written out step by step, a load that settles) replaces nodes while it settles:
       when a measured node is replaced the nodes are collected again and the wait starts over. The geometry counts as settled after two
       unchanged frames in a row (stable >= 2, fonts loaded, no finite transition running), found within 60 frames of the last replacement;
       at most 600 frames in all. This does not wait for the page to finish writing: only for two still frames. A page that keeps replacing
       its nodes until the cap fails with 'measured nodes changed before overflow' */
    let previous = null, stable = 0, frames = 0, before, settleFrom = 0;
    for (; frames < 600 && frames - settleFrom < 60; frames++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (kids.some(k => !k.isConnected)) { kids = collect(); previous = null; stable = 0; settleFrom = frames; continue; }
      const current = geometry();
      const unchanged = previous && current.every((r, i) => r.every((v, j) => v === previous[i][j]));
      stable = fontsReady && (!document.fonts || document.fonts.status === 'loaded') && !finiteTransitions().length && unchanged ? stable + 1 : 0;
      previous = current;
      if (stable >= 2) { before = current; break; }
    }
    if (!before && settleFrom && frames - settleFrom < 60) return { setupFailure: 'measured nodes changed before overflow', geometry: previous, frames, replacedAt: settleFrom };
    if (!before) return { setupFailure: 'font/finite-transition/geometry did not settle', geometry: previous, frames, fontsReady, transitions: finiteTransitions().map(a => ({ property: a.transitionProperty, state: a.playState })) };
    const pad = document.createElement('div'); pad.style.height = (el.clientHeight * 3) + 'px'; el.appendChild(pad);
    try {
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const after = geometry(), moved = [];
      kids.forEach((k, i) => { if (Math.abs(after[i][0] - before[i][0]) > 0.5 || Math.abs(after[i][1] - before[i][1]) > 0.5) moved.push(k.tagName.toLowerCase() + '.' + [...k.classList].join('.')); });
      return { before, after, moved, frames, nodes: kids.map(k => k.tagName.toLowerCase() + '.' + [...k.classList].join('.')) };
    } finally { pad.remove(); }
  }, sel);
  if (!result) return;
  console.log(`${where} ${sel} overflow geometry: ${JSON.stringify(result)}`);
  if (result.setupFailure) { fail(where, `${sel}: setup failed: ${result.setupFailure}`); return; }
  if (result.moved.length) fail(where, `${sel}: content moved when overflow started (${result.moved.slice(0, 3).join(', ')})`);
}

async function outlines(page, where) {
  for (const fr of page.frames()) {
    const bad = await fr.evaluate(() => {
      const out = [];
      for (const e of document.querySelectorAll('body *')) {
        if (e.offsetParent === null || e.closest('.menu, .tip, svg')) continue;
        const cs = getComputedStyle(e);
        if (!(parseFloat(cs.borderTopLeftRadius) > 4)) continue;
        const ring = cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0;
        if (!ring) continue;
        const r = e.getBoundingClientRect(); if (r.width < 24 || r.height < 24) continue;
        for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
          const as = getComputedStyle(a);
          if (as.overflowX === 'visible' && as.overflowY === 'visible') continue;
          const ar = a.getBoundingClientRect();
          // only elements meant to be fully visible at the current scroll position
          if (r.top < ar.top - 1 && a.scrollTop > 0) break;
          if (r.bottom > ar.bottom + 1) break;
          if (r.left < ar.left - 0.5 || r.right > ar.right + 0.5 || r.top < ar.top - 0.5) out.push(`${e.tagName.toLowerCase()}.${[...e.classList].join('.')} cut by ${a.tagName.toLowerCase()}.${[...a.classList].join('.')}`);
          break;
        }
      }
      return out;
    }).catch(() => []);
    for (const b of [...new Set(bad)].slice(0, 5)) fail(where, `outline: ${b}`);
  }
}

async function reduced(where) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await p.goto(`${base}/apps/${appId}/index.html`); await p.waitForTimeout(800);
  const bad = await p.evaluate(() => {
    const out = [];
    for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; } for (const r of rules) if (r.style) for (const n of r.style) if (n.startsWith('--dur')) { const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); if (v && parseFloat(v) !== 0 && /ms|s$/.test(v)) out.push(`${n} = ${v}`); } }
    return [...new Set(out)].filter(x => !/--dur-(skeleton|spin|shimmer|flow|chart)/.test(x));
  });
  for (const b of bad) fail(where, `reduced motion keeps ${b}`);
  await p.close();
}

/* Desktop mode: the shell and page documents sit on the macOS window material, so nothing between it and the sidebar or panel may paint */
const FAKE_SHELL = ({ services, settings = {} }) => {
  window.__on = {}; window.__stateTabs = {}; window.__stateActive = null;
  window.kitShell = {
    invoke: async (channel, ...args) => {
      if (channel === 'tabs:create' || channel === 'tabs:navigate') window.__stateTabs[args[0]] = { address: args[1] };
      if (channel === 'tabs:show') window.__stateActive = args[0];
      if (channel === 'tabs:send') window.__toTab?.(args[0], args[1]); // a page document opened in its own Page relays (openConversationCard)
      return channel === 'desktop:info' ? { dev: true } : channel === 'service:call' ? structuredClone(services[args[0]] ?? null) : null;
    },
    on(ev, cb) { window.__on[ev] = cb; },
    settingsBackend: { load: () => ({ ...settings, 'kit.firstRun.done': true }), save: async () => {} },
  };
};
const FAKE_BRIDGE = () => { window.kitBridge = { send() {}, on() {} }; };
/* Parts the reference draws opaque on the window material (live5 measurement): theme -> selectors */
const OPAQUE_ON_MATERIAL = {
  dark: ['.fav', '.dot', '.chip', '.chip-tile', '.cmp-voice', '.cmp-send', '.prg > i'],
  light: ['.fav', '.dot', '.chip', '.chip-tile', '.cmp-voice', '.cmp-send', '.cmp', '.cmp-round', '.sb-row.sel', '.pt-tile.sel', '.prg > i'],
};
const opaqueOnMaterial = allow => {
  const alpha = c => { const m = c.match(/rgba?\(([^)]+)\)/) || c.match(/color\([^ ]+ ([^)]+)\)/) || c.match(/okl\w+\(([^)]+)\)/); if (!m) return c === 'transparent' ? 0 : 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
  const out = [];
  for (const root of document.querySelectorAll('[data-surface="material"]')) for (const e of root.querySelectorAll('*')) {
    if (e.offsetParent === null || allow.some(s => e.matches(s))) continue;
    const cs = getComputedStyle(e);
    if (alpha(cs.backgroundColor) >= 0.99) out.push(`${e.tagName.toLowerCase()}.${[...e.classList].join('.')} (${cs.backgroundColor})`);
  }
  return out;
};
/* Only the sidebar sits on the material: the AI conversation is a content card beside the center card (its own document and background) */
const painted = () => {
  const alpha = c => { const m = c.match(/rgba?\(([^)]+)\)/) || c.match(/color\([^ ]+ ([^)]+)\)/); if (!m) return c === 'transparent' ? 0 : 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
  const name = e => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  const chain = sel => { const out = []; for (let e = document.querySelector(sel); e; e = e.parentElement) out.push(e); return out; };
  const out = { desktop: document.documentElement.classList.contains('is-desktop'), opaque: [], missing: [], card: null };
  for (const sel of ['.sidebar-scroll']) {
    const els = chain(sel);
    if (!els.length) { out.missing.push(sel); continue; }
    for (const e of els) { const cs = getComputedStyle(e); if (alpha(cs.backgroundColor) > 0 || cs.backgroundImage !== 'none') out.opaque.push(`${name(e)} (${cs.backgroundColor}${cs.backgroundImage !== 'none' ? ' ' + cs.backgroundImage.slice(0, 40) : ''})`); }
  }
  const main = document.querySelector('.frame-main');
  if (main) { const cs = getComputedStyle(main); out.card = alpha(cs.backgroundColor); out.bare = main.classList.contains('bare'); out.cardShadow = cs.boxShadow; }
  return out;
};
async function desktopMaterial(where) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => fail(where, e.message));
  await p.addInitScript(FAKE_SHELL, { services: serviceFixtures });
  await p.goto(`${base}/apps/${appId}/index.html`); await p.waitForTimeout(1000);
  const judge = async step => {
    for (const theme of ['dark', 'light']) {
      await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      await p.waitForTimeout(400); // theme transitions settle
      const r = await p.evaluate(painted);
      const w = `${where} ${step} ${theme}`;
      for (const o of [...new Set(await p.evaluate(opaqueOnMaterial, OPAQUE_ON_MATERIAL[theme]))]) fail(w, `opaque on the window material (the reference shows the material through it): ${o}`);
      if (!r.desktop) fail(w, 'html.is-desktop is missing with window.kitShell');
      for (const m of r.missing) fail(w, `${m} missing`);
      for (const o of [...new Set(r.opaque)]) fail(w, `paints over the window material: ${o}`);
      /* a page that lays out its own body card (settings: .frame-main.bare, polish/decisions.md:35, user decision 2026-11-16 04:15) is the one card of the
         screen: the shell's center card then paints no face of its own, and the page's body card is checked below as that one opaque card */
      if (r.bare) { sawBare = true; if (r.card > 0.01 || r.cardShadow !== 'none') fail(w, `bare center card paints (background alpha ${r.card}, shadow ${r.cardShadow}), expected no face: the page's body card is the one card`); }
      else if (!(r.card > 0.5)) fail(w, `center card background alpha ${r.card}, expected its own background`);
    }
  };
  let sawBare = false;
  await judge('first draw');
  // redraw the sidebar and the panel (section collapse and open again, panel toggle twice)
  await p.evaluate(async () => {
    const head = document.querySelector('.sb-sec-head'); head?.click(); await new Promise(r => setTimeout(r, 300)); head?.click();
    await new Promise(r => setTimeout(r, 300));
  });
  await p.keyboard.press('ControlOrMeta+e'); await p.waitForTimeout(400); await p.keyboard.press('ControlOrMeta+e'); await p.waitForTimeout(600);
  await judge('after redraw');
  await p.reload(); await p.waitForTimeout(1000);
  await judge('after reload');
  await p.close();
  // the one body card of a bare screen (settings), in its desktop view: an opaque face with its round corner, no frame around it or card inside it
  const settingsRoute = config.routes.find(r => r.kind === 'settings' && config.examples?.params?.[r.id]);
  if (sawBare && !settingsRoute) fail(where, 'a bare center card was drawn but the app has no settings example to check its body card');
  if (sawBare && settingsRoute) {
    const params = config.examples.params[settingsRoute.id];
    const path = settingsRoute.pattern.split('/').map(s => s.startsWith(':') ? encodeURIComponent(params[s.slice(1)]) : s).join('/');
    const q = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const address = `${config.scheme}://${path}`;
    // the settings page draws after the shell's init message (kit/page/boot.js shell:init), which a desktop view receives from the shell
    await q.addInitScript(({ appId, address }) => { let receive; window.kitBridge = { on(cb) { receive = cb; }, send(m) { if (m.type === 'page:ready') receive({ v: 1, type: 'shell:init', payload: { protocol: 1, appId, address, theme: 'dark', tabId: 'state-check' } }); } }; }, { appId: config.id, address });
    await q.goto(`${base}/apps/${appId}/pages/${settingsRoute.page}.html?a=${encodeURIComponent(address)}`);
    await q.locator('.cc-card').first().waitFor({ timeout: 10000 }).catch(() => {});
    for (const theme of ['dark', 'light']) {
      await q.evaluate(t => { document.documentElement.dataset.theme = t; }, theme); await q.waitForTimeout(300);
      const w = `${where} bare body card ${theme}`;
      const c = await q.evaluate(() => {
        const e = document.querySelector('.cc-card'); if (!e) return null;
        const cs = getComputedStyle(e), m = cs.backgroundColor.match(/\/\s*([\d.]+)\s*\)$/) || cs.backgroundColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
        return { alpha: cs.backgroundColor === 'transparent' ? 0 : m ? parseFloat(m[1]) : 1, bg: cs.backgroundColor, radius: parseFloat(cs.borderTopLeftRadius) || 0 };
      });
      if (!c) { fail(w, '.cc-card missing'); continue; }
      if (!(c.alpha > 0.5) || !(c.radius > 0)) fail(w, `body card ${c.bg} radius ${c.radius}px, expected one opaque round card`);
      { const got = await readSurfaces(q); judgeSurfaces({ radii: [], frames: got.frames }, w, fail); }
    }
    await q.close();
  }
  // tab page document in a desktop view
  const r0 = config.routes.find(r => config.examples?.params?.[r.id]);
  if (r0) {
    const params = config.examples.params[r0.id];
    const path = r0.pattern.split('/').map(s => s.startsWith(':') ? encodeURIComponent(params[s.slice(1)]) : s).join('/');
    const q = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await q.addInitScript(FAKE_BRIDGE);
    await q.goto(`${base}/apps/${appId}/pages/${r0.page}.html?a=${encodeURIComponent(`${config.scheme}://${path}`)}`); await q.waitForTimeout(800);
    for (const theme of ['dark', 'light']) {
      const r = await q.evaluate(t => {
        document.documentElement.dataset.theme = t;
        const bg = e => { const cs = getComputedStyle(e); return cs.backgroundImage !== 'none' ? cs.backgroundImage : cs.backgroundColor; };
        const probe = document.body.appendChild(document.createElement('div')); probe.style.background = 'var(--content-inner)'; const inner = getComputedStyle(probe).backgroundColor; probe.remove();
        const main = document.querySelector('body > main');
        return { desktop: document.documentElement.classList.contains('is-desktop'), html: bg(document.documentElement), body: bg(document.body), main: main ? bg(main) : inner, inner };
      }, theme);
      if (!r.desktop) fail(`${where} page ${theme}`, 'html.is-desktop is missing with window.kitBridge');
      /* the page document itself is the window's material: html stays clear. Its body and main are the center card's content, one opaque face of --content-inner
         over the whole scroll view (the app theme, commit b9326e6); the sidebar staying clear on the material is checked above */
      if (!/^(transparent|rgba\(0, 0, 0, 0\))$/.test(r.html)) fail(`${where} page ${theme}`, `html paints ${r.html}`);
      const opaque = c => /^(rgb\(|oklch\([^/]*\)$|color\([^/]*\)$|lab\([^/]*\)$)/.test(c);
      for (const k of ['body', 'main']) if (r[k] !== r.inner || !opaque(r[k])) fail(`${where} page ${theme}`, `${k} paints ${r[k]}, expected the opaque content face ${r.inner}`);
    }
    await q.close();
  }
  // tab pages in a desktop view: scroll bar ends against the view's rounded corners
  for (const rt of config.routes) {
    const params = config.examples?.params?.[rt.id]; if (!params) continue;
    const path = rt.pattern.split('/').map(s => s.startsWith(':') ? encodeURIComponent(params[s.slice(1)]) : s).join('/');
    const q = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    await q.addInitScript(FAKE_BRIDGE);
    await q.goto(`${base}/apps/${appId}/pages/${rt.page}.html?a=${encodeURIComponent(`${config.scheme}://${path}`)}`); await q.waitForTimeout(800);
    await scrollEnds(q.mainFrame(), `${where} page ${rt.id}`, '[data-scroll="content"]');
    await scrollEnds(q.mainFrame(), `${where} page ${rt.id}`, '.cc.inset');
    await q.close();
  }
}

/* Floating surfaces keep the reference glass in desktop mode: the same fill and backdrop filter as in the browser, menus nearly opaque
   (92% dark, 94% light, measured: text below a reference menu cannot be read) with a 24px blur, and no ancestor that would cut the backdrop (filter, opacity, mask, backdrop-filter, blend) */
const TOPBAR_MENU = '.topbar [data-menu]:not(.path [data-menu]):visible';

function addressOfRoute(target, params) {
  return `${config.scheme}://` + target.pattern.split('/').map(s => s.startsWith(':') ? encodeURIComponent(params[s.slice(1)]) : s).join('/');
}

async function prepareRoute(page, target, params, where) {
  const address = addressOfRoute(target, params);
  if (await page.evaluate(() => !!window.kitShell)) {
    // This transport observes shell metadata and surfaces, never a native tab document or service success.
    await page.waitForFunction(() => window.__on?.['tab-message'] && window.__stateActive && window.__stateTabs?.[window.__stateActive]);
    await page.evaluate(address => window.__on['tab-message'](window.__stateActive, { v: 1, type: 'page:navigate', id: 'surface-setup', payload: { address } }), address);
    await page.waitForFunction(address => {
      const active = window.__stateActive;
      return window.__stateTabs?.[active]?.address === address && !!document.querySelector('.frame') &&
        [...document.querySelectorAll('.sb-row.sel[data-id]')].some(row => row.dataset.id === active);
    }, address);
    console.log(`${where}: simulated desktop shell route ${address}`);
    return { address };
  }
  const activeFrame = page.locator('.kit-frames iframe.on');
  await activeFrame.waitFor({ state: 'visible' });
  const initialTab = await (await activeFrame.elementHandle()).contentFrame();
  if (!initialTab) throw new Error(`${where}: active tab document missing`);
  await initialTab.evaluate(address => window.parent.postMessage({ v: 1, type: 'page:navigate', id: 'surface-setup', payload: { address } }, location.origin), address);
  await page.waitForFunction(({ address, pagePath }) => {
    const doc = document.querySelector('.kit-frames iframe.on')?.contentDocument;
    if (!doc || doc.readyState === 'loading') return false;
    const url = new URL(doc.location.href);
    return url.pathname === pagePath && url.searchParams.get('a') === address && !!doc.getElementById('page')?.firstElementChild;
  }, { address, pagePath: `/apps/${appId}/pages/${target.page}.html` });
  const tab = await (await activeFrame.elementHandle()).contentFrame();
  if (!tab) throw new Error(`${where}: prepared tab document missing`);
  return { address, tab };
}

async function preparePanelRoute(page, where) {
  const panelRoute = r => !['chat', 'settings'].includes(r.kind);
  const exampleParams = config.examples?.params || {};
  const target = config.routes.find(r => panelRoute(r) && !r.pattern.split('/').some(s => s.startsWith(':')))
    || config.routes.find(r => panelRoute(r) && exampleParams[r.id] && r.pattern.split('/').every(s => !s.startsWith(':') || exampleParams[r.id][s.slice(1)] != null));
  if (!target) throw new Error(`${where}: no panel-capable route with an address`);
  const prepared = await prepareRoute(page, target, exampleParams[target.id] || {}, where);
  if (features.panel) prepared.chat = await openConversationCard(page, where);
  return prepared;
}

/* The AI conversation opens as a card beside the page (kit.panel.toggle). Browser: its document is a frame of the shell.
   Simulated desktop: the shell asks for a native view (tabs:create); that address opens as a desktop page (window.kitBridge) with its own Page,
   which the caller closes. Returns the document whose bottom holds the composer and its model menu. */
async function openConversationCard(page, where) {
  const route = config.routes.find(r => r.kind === 'chat');
  if (!route) throw new Error(`${where}: no chat route for the conversation card`);
  const toggle = page.locator('button[data-action="kit.panel.toggle"]:visible');
  if (await toggle.count()) await toggle.first().click(); // the ask button is drawn only while no conversation card is open
  let chat;
  if (await page.evaluate(() => !!window.kitShell)) {
    const address = addressOfRoute(route, { id: 'new' });
    // the native view the shell asked for (its address or its page URL); its messages go both ways through the simulated shell
    const cardId = await (await page.waitForFunction(address => Object.entries(window.__stateTabs || {})
      .find(([, t]) => t.address === address || String(t.address).includes(encodeURIComponent(address)))?.[0], address)).jsonValue();
    chat = await browser.newPage({ viewport: { width: 720, height: 900 } });
    chat.on('pageerror', e => fail(where, e.message));
    await chat.exposeFunction('__toShell', m => page.evaluate(([id, m]) => window.__on['tab-message']?.(id, m), [cardId, m]).catch(() => {}));
    await chat.addInitScript(() => { const ls = []; window.__fromShell = m => ls.forEach(f => f(m)); window.kitBridge = { send: m => window.__toShell(m), on: f => ls.push(f) }; });
    await page.exposeFunction('__toTab', (id, env) => { if (id === cardId) chat.evaluate(e => window.__fromShell(e), env).catch(() => {}); });
    await chat.goto(`${base}/apps/${appId}/pages/${route.page}.html?a=${encodeURIComponent(address)}`);
  } else {
    const card = page.locator('.kit-frames iframe.on');
    await page.waitForFunction(() => [...document.querySelectorAll('.kit-frames iframe.on')].some(f => f.contentDocument?.querySelector('[data-chat-bottom] textarea')?.getClientRects().length));
    const handles = await card.elementHandles();
    for (const h of handles) { const fr = await h.contentFrame(); if (fr && await fr.evaluate(() => !!document.querySelector('[data-chat-bottom] textarea')).catch(() => false)) { chat = fr; break; } }
    if (!chat) throw new Error(`${where}: conversation card document missing`);
  }
  await chat.locator('[data-chat-bottom] textarea').waitFor({ state: 'visible' });
  await chat.locator('[data-menu="kit.ai.model"]:visible').first().waitFor({ state: 'visible' });
  /* the card opens by growing from no width while the body shrinks (kit/shell/shell.js, startFrom). Its document is resized all along, and a resize
     closes any open menu at once (kit/components/menu.js, window resize): a menu opened before the card has its size is gone a few ms later.
     So the card is ready when its size has not changed for 10 frames in a row (at most 600 frames) */
  const settled = await chat.evaluate(() => new Promise(done => {
    let last = '', same = 0, n = 0;
    const step = () => { const k = `${innerWidth}x${innerHeight}`; same = k === last ? same + 1 : 0; last = k; if (same >= 10) done(true); else if (++n > 600) done(false); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }));
  if (!settled) fail(where, 'the conversation card kept changing size for 600 frames after it opened');
  return chat;
}

async function openSurfaceRoute(page, where) {
  const target = config.routes.find(r => {
    const params = config.examples?.params?.[r.id];
    return params && config.topbar?.ident !== false && r.ident?.(params, config.data)?.menu;
  });
  if (!target) throw new Error(`${where}: no identity-menu route with example parameters`);
  const params = config.examples.params[target.id];
  const { address } = await prepareRoute(page, target, params, where);
  const menu = target.ident(params, config.data).menu;
  await page.waitForFunction(menu => [...document.querySelectorAll('.topbar .ident[data-menu]')].some(e => e.dataset.menu === menu && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'), menu);
  if (!(await page.locator('.topbar .ident[data-menu]:visible').evaluateAll((els, menu) => els.some(e => e.dataset.menu === menu), menu))) fail(where, `${address}: identity menu ${menu} missing`);
  console.log(`${where}: surface ${address}, identity ${menu}`);
  return address;
}

async function checkSettingsMenus(page, where) {
  if (!features.settings) return;
  await page.keyboard.press('ControlOrMeta+,');
  await page.waitForTimeout(500);
  const expected = await page.evaluate(async id => {
    const { default: cfg } = await import(`/apps/${id}/app.config.js`);
    const { createRouter } = await import('/kit/core/routes.js');
    const settings = window.kitShell?.settingsBackend.load() || JSON.parse(localStorage.getItem(cfg.id + ':settings') || '{}');
    const route = cfg.routes.find(r => r.kind === 'settings');
    const address = createRouter(cfg).build(route.id, { page: cfg.settings.groups[0].pages[0].id });
    const match = createRouter(cfg).parse(address);
    const identity = cfg.topbar?.ident === false ? null : match.route.ident?.(match.params, cfg.data);
    if (identity?.menu) return { address, absent: false };
    const buttons = cfg.topbar?.buttons?.(match, { settings }) || [];
    return { address, absent: !buttons.some(b => b.menu) };
  }, appId);
  if (expected.absent && await page.locator(TOPBAR_MENU).count()) fail(where, `${expected.address}: unexpected top bar menu on a route without menu definitions`);
  console.log(`${where}: settings ${expected.address}, no-menu expected ${expected.absent}`);
}

/* A surface the floating check reads as missing: what the documents held at that moment, to tell a surface that never opened (the trigger missing,
   the click landing elsewhere, the menu opening in another document) from one that opened late. Written to CHECK_STATES_DIAG (default: the system
   temp folder) as JSON and a picture of the document the keys went to; the failure line names the file */
const diagDir = process.env.CHECK_STATES_DIAG || join(tmpdir(), 'check-states-diag');
let diagN = 0;
async function floatingDiag({ p, card, cardPage, desktop, theme, missing, trigger }) {
  const name = `floating-${desktop ? 'desktop' : 'browser'}-${theme}-${missing}-${++diagN}`;
  const docState = (d, trigger) => d.evaluate(trigger => {
    const desc = e => e ? e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') + (e.dataset?.menu ? `[data-menu=${e.dataset.menu}]` : '') : null;
    return {
      url: location.href, hasFocus: document.hasFocus(), active: desc(document.activeElement),
      triggers: [...document.querySelectorAll(trigger)].map(e => ({ visible: !!e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden', open: e.hasAttribute('data-popup-open'), disabled: e.disabled || e.getAttribute('aria-disabled') === 'true' })),
      menus: [...document.querySelectorAll('.menu')].map(m => ({ state: m.dataset.state || null, cls: desc(m), visible: !!m.getClientRects().length, rows: m.querySelectorAll('.mi').length, sub: !!m.querySelector('.m-sub'), subRows: [...m.querySelectorAll('.mi')].filter(x => x.getAttribute('aria-haspopup') || x.querySelector('.mi-sub')).length, highlighted: desc(m.querySelector('[data-highlighted]')) })),
      frames: [...document.querySelectorAll('iframe')].map(f => ({ on: f.classList.contains('on'), src: f.getAttribute('src') })),
      chatBottom: !!document.querySelector('[data-chat-bottom] textarea'), log: window.__floatLog || null,
    };
  }, trigger).catch(e => ({ error: e.message }));
  const cardDetached = card.isDetached ? card.isDetached() : card.isClosed?.();
  const info = { missing, mode: desktop ? 'desktop' : 'browser', theme, cardDocument: desktop ? 'desktop page (its own Page)' : 'frame of the shell', cardDetached,
    card: cardDetached ? null : await docState(card, trigger), shell: await docState(p.mainFrame(), trigger) };
  // a late surface: read again after a further wait, only for this record (the check itself keeps its result)
  await p.waitForTimeout(2000);
  info.after2s = cardDetached ? null : await card.evaluate(() => [...document.querySelectorAll('.menu')].map(m => ({ state: m.dataset.state || null, visible: !!m.getClientRects().length, sub: !!m.querySelector('.m-sub') }))).catch(e => ({ error: e.message }));
  try {
    mkdirSync(diagDir, { recursive: true });
    writeFileSync(join(diagDir, `${name}.json`), JSON.stringify(info, null, 1));
    await cardPage.screenshot({ path: join(diagDir, `${name}.png`) }).catch(() => {});
  } catch { /* the record is a help, not the check */ }
  console.log(`floating diag ${name}: ${JSON.stringify(info)}`);
  return join(diagDir, `${name}.json`);
}

async function floating(where) {
  const read = async (desktop, theme) => {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    p.on('pageerror', e => fail(where, e.message));
    if (desktop) await p.addInitScript(FAKE_SHELL, { services: serviceFixtures });
    await p.goto(`${base}/apps/${appId}/index.html`); await p.waitForTimeout(1000);
    const { chat } = await preparePanelRoute(p, `${where} ${desktop ? 'desktop' : 'browser'} ${theme}`);
    // the conversation card's document: a frame of the shell in the browser, its own desktop page in desktop mode
    const card = chat || p.mainFrame(), cardPage = chat && desktop ? chat : p;
    for (const d of new Set([p, card])) await d.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    // a surface is read only when it is shown (check-surfaces.mjs readSurface): one that stays hidden, closed, tiny or absent is { missing: reason }
    const probe = async (sel, d = p, settleMs = 300) => { const r = await readSurface(d, sel, { settleMs }); return r.surface || { missing: r.reason }; };
    const out = {}, diag = {};
    // the conversation card's plus menu (its rows open submenus, whatever models the app knows); an app without the panel: the first menu trigger in the shell
    const model = features.panel ? card.locator('[data-menu="kit.ai.plus"]:visible').first() : p.locator('[data-menu]:visible').first();
    /* each surface is awaited until it is shown before it is read (a slow draw is not a missing surface; one that never shows is 'not drawn' with the reason),
       and Escape is pressed only while a menu or the palette is open: in the conversation card an Escape with nothing open closes the card itself
       (kit/page/boot.js, a detail card), which detached its frame under the next read */
    const OPEN_MENU = '.menu:not([data-state="closed"])';
    // a record of what happens around the click (menus added and removed, focus moves), kept for floatingDiag
    await card.evaluate(() => {
      const t0 = performance.now(), log = window.__floatLog = [], at = () => Math.round(performance.now() - t0);
      const desc = e => e?.nodeType === 1 ? e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') : String(e?.nodeName || e);
      new MutationObserver(ms => { for (const m of ms) { for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches('.menu, .m-sub')) log.push([at(), 'menu+', desc(n)]); for (const n of m.removedNodes) if (n.nodeType === 1 && (n.matches('.menu, .m-sub') || n.querySelector?.('[data-menu="kit.ai.plus"]'))) log.push([at(), 'removed', desc(n)]); if (m.type === 'attributes') log.push([at(), 'state', desc(m.target), m.target.dataset.state]); } })
        .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
      for (const ev of ['focusin', 'focusout', 'pointerdown', 'click']) document.addEventListener(ev, e => log.push([at(), ev, desc(e.target)]), true);
      window.addEventListener('blur', () => log.push([at(), 'window blur']));
      window.addEventListener('resize', () => log.push([at(), 'resize', `${innerWidth}x${innerHeight}`]));
      window.addEventListener('message', e => log.push([at(), 'message', e.data?.type || typeof e.data, e.data?.type === 'shell:ask-context' ? JSON.stringify(e.data.payload).slice(0, 80) : '']));
    }).catch(() => {});
    await model.click();
    out.menu = await probe(OPEN_MENU, card);
    if (out.menu.missing) diag.menu = await floatingDiag({ p, card, cardPage, desktop, theme, missing: 'menu', trigger: '[data-menu="kit.ai.plus"]' });
    await cardPage.keyboard.press('ArrowDown'); await cardPage.keyboard.press('ArrowDown'); await cardPage.keyboard.press('ArrowRight');
    out.submenu = await probe('.m-sub', card, 500);
    if (out.submenu.missing) diag.submenu = await floatingDiag({ p, card, cardPage, desktop, theme, missing: 'submenu', trigger: '[data-menu="kit.ai.plus"]' });
    for (let i = 0; i < 3 && await card.locator(OPEN_MENU).count(); i++) { await cardPage.keyboard.press('Escape'); await p.waitForTimeout(300); }
    await p.keyboard.press('ControlOrMeta+k');
    out.palette = await probe('.pal');
    if (await p.locator('.pal').count()) await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    const tipEl = card.locator('[data-chat-bottom] [data-tip]:visible').first();
    if (features.panel && !(await tipEl.count())) fail(where, `${desktop ? 'desktop' : 'browser'} ${theme}: no visible conversation tooltip target`);
    if (await tipEl.count()) { const bb = await tipEl.boundingBox(); await cardPage.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(900); out.tooltip = await probe('.tip', card, 0); await cardPage.mouse.move(1, 1); }
    if (chat && desktop) await chat.close();
    await p.close();
    return { out, diag };
  };
  for (const theme of ['dark', 'light']) {
    const { out: web, diag: webDiag } = await read(false, theme), { out: desk, diag: deskDiag } = await read(true, theme);
    for (const k of Object.keys(web)) {
      const a = web[k], b = desk[k], w = `${where} ${theme} ${k}`;
      if (k === 'submenu' && !features.panel && (!a || a.missing) && (!b || b.missing)) continue; // the first shell menu of a panel-less app may have no submenu
      if (!a || !b || a.missing || b.missing) { fail(w, `not drawn${[(!a || a.missing) && `browser: ${a?.missing || 'not read'}${webDiag[k] ? ', ' + webDiag[k] : ''}`, (!b || b.missing) && `desktop: ${b?.missing || 'not read'}${deskDiag[k] ? ', ' + deskDiag[k] : ''}`].filter(Boolean).map(x => ` (${x})`).join('')}`); continue; }
      const deskGlass = k === 'menu' || k === 'submenu';
      // the conversation card's menus are in a tab page document: in light they take the page white (kit/tokens.css, tab page documents),
      // 80% in the browser and opaque in the desktop window; dark and the shell's own menus keep the shell values
      const pageLight = features.panel && deskGlass && theme === 'light';
      const deskAlpha = pageLight ? 1 : 0.8, webAlpha = pageLight ? 0.8 : theme === 'dark' ? 0.92 : 0.94;
      if (deskGlass && (Math.abs(b.alpha - deskAlpha) > 0.01 || !/blur\(8px\)/.test(b.filter))) fail(w, `desktop glass ${b.bg} / ${b.filter}, expected ${deskAlpha * 100}% with blur(8px)`);
      if (!deskGlass && k !== 'tooltip' && b.alpha < 0.99) fail(w, `desktop fill ${b.bg} is not opaque`);
      // an in-place submenu sits on its own glass menu, which already blurs the page behind both
      const roots = k === 'submenu' ? b.roots.filter(r => r !== 'div.menu') : b.roots;
      if (roots.length) fail(w, `backdrop cut by ${roots.join(', ')}`);
      if ((k === 'menu' || k === 'submenu') && (Math.abs(a.alpha - webAlpha) > 0.01 || !/blur\(24px\)/.test(a.filter))) fail(w, `browser glass ${a.bg} / ${a.filter}, expected ${webAlpha * 100}% with blur(24px)`);
      if (k === 'tooltip' && b.alpha < 0.99) fail(w, `tooltip fill ${b.bg} is not opaque`);
    }
  }
}

/* Corner radius per role and the one-frame rule: RADII and ONE_FRAME in check-surfaces.mjs (each with its basis) */
async function galleryReady(page, file) {
  const mount = file === 'components.html' ? '#page > .g' : '#page > .l';
  if (new URL(page.url()).pathname !== `/${file}`) throw new Error(`gallery setup: unexpected URL for ${file}`);
  await page.waitForFunction(selector => {
    const error = document.querySelector('.kit-error');
    if (error) throw new Error(`gallery setup: ${error.textContent}`);
    const root = document.querySelector(selector);
    return !!root?.children.length && !!root.querySelector('[data-c]');
  }, mount);
}

async function radii(where) {
  const seen = new Set();
  const read = async (fr, w) => judgeSurfaces(await readSurfaces(fr), `${where} ${w}`, fail, seen);
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`${base}/apps/${appId}/index.html`); await p.waitForTimeout(1200);
  const plus = p.locator('[data-slot="panel"] .cmp-round[data-menu]').first();
  if (await plus.count()) { await plus.dispatchEvent('mousedown'); await p.waitForTimeout(300); }
  for (const fr of p.frames()) await read(fr, fr === p.mainFrame() ? 'shell' : 'tab');
  // the shell around a page with its own body card (.frame-main.bare, settings) paints no second face (polish/decisions.md:35, 04:15)
  const bare = await p.evaluate(() => { const m = document.querySelector('.frame-main.bare'); if (!m) return null; const c = getComputedStyle(m); return { bg: c.backgroundColor, shadow: c.boxShadow }; });
  if (bare && (!/^(transparent|rgba\(0, 0, 0, 0\))$/.test(bare.bg) || bare.shadow !== 'none')) fail(`${where} shell .frame-main.bare`, `paints ${bare.bg} / ${bare.shadow}, expected no face around the page's body card`);
  await p.close();
  const examples = config.examples?.params || {};
  const pages = config.routes.filter(r => examples[r.id]).map(r => [`apps/${appId}/pages/${r.page}.html?a=${encodeURIComponent(`${config.scheme}://${r.pattern.split('/').map(x => x.startsWith(':') ? encodeURIComponent(examples[r.id][x.slice(1)]) : x).join('/')}`)}`, `page ${r.id}`]);
  for (const [page, w] of [['components.html', 'components.html'], ['layouts.html', 'layouts.html'], ...pages]) {
    const g = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await g.goto(`${base}/${page}`); await g.waitForTimeout(900);
    if (['components.html', 'layouts.html'].includes(page)) await galleryReady(g, page);
    await read(g.mainFrame(), w);
    await g.close();
  }
  for (const [s] of [...RADII, ...ONE_FRAME]) if (!seen.has(s)) fail(where, `${s} is not drawn anywhere it is checked`);
}

/* Top bar popovers: open and close motion, Escape, focus return, translucent glass in browser and desktop mode, confirm switches */
async function popovers(where) {
  for (const desktop of [false, true]) for (const theme of ['dark', 'light']) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    p.on('pageerror', e => fail(where, e.message));
    if (desktop) await p.addInitScript(FAKE_SHELL, { services: serviceFixtures, settings: surfaceSettings });
    else await p.addInitScript(({ id, settings }) => {
      const key = id + ':settings';
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...stored, ...settings }));
    }, { id: appId, settings: surfaceSettings });
    await p.goto(`${base}/apps/${appId}/index.html`); await p.waitForTimeout(1000);
    await checkSettingsMenus(p, `${where} ${desktop ? 'desktop' : 'browser'} ${theme}`);
    const address = await openSurfaceRoute(p, `${where} ${desktop ? 'desktop' : 'browser'} ${theme}`);
    await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    let multiMenu = false;
    const triggers = await p.evaluate(() => [...document.querySelectorAll('.topbar [data-menu]')].filter(e => !e.closest('.path') && e.offsetParent !== null).map((e, i) => { e.setAttribute('data-pt', i); return e.dataset.menu; }));
    for (let i = 0; i < triggers.length; i++) {
      const w = `${where} ${desktop ? 'desktop' : 'browser'} ${theme} ${triggers[i]}`;
      const t = p.locator(`[data-pt="${i}"]`);
      await p.evaluate(() => {
        window.__popoverMotion = [];
        document.addEventListener('animationstart', e => {
          if (!e.target.matches('.menu.popover')) return;
          const cs = getComputedStyle(e.target);
          window.__popoverMotion.push({ anim: e.animationName, dur: parseFloat(cs.animationDuration), state: e.target.dataset.state });
        }, { signal: (window.__popoverMotionAbort?.abort(), (window.__popoverMotionAbort = new AbortController()).signal) });
      });
      await t.click();
      await p.waitForFunction(() => window.__popoverMotion.some(x => x.anim === 'menu-in'));
      const open = await p.evaluate(() => {
        const e = document.querySelector('.menu.popover'); if (!e) return null;
        const cs = getComputedStyle(e), roots = [];
        for (let a = e.parentElement; a; a = a.parentElement) { const c = getComputedStyle(a); if (c.filter !== 'none' || parseFloat(c.opacity) < 1 || c.maskImage !== 'none' || c.backdropFilter !== 'none' || c.mixBlendMode !== 'normal') roots.push(a.tagName.toLowerCase() + '.' + String(a.className).split(' ')[0]); }
        const m = cs.backgroundColor.match(/\/\s*([\d.]+)\s*\)$/) || cs.backgroundColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
        return { ...window.__popoverMotion.find(x => x.anim === 'menu-in'), bg: cs.backgroundColor, alpha: m ? parseFloat(m[1]) : 1, filter: cs.backdropFilter, roots };
      });
      if (!open) { fail(w, 'no popover opened'); continue; }
      if (open.anim !== 'menu-in' || !(open.dur > 0)) fail(w, `open motion ${open.anim} ${open.dur}s`);
      if (!(await t.getAttribute('data-popup-open') !== null)) fail(w, 'trigger not marked open');
      if (!desktop && (!(open.alpha < 1) || !/blur\(/.test(open.filter))) fail(w, `not translucent: ${open.bg} / ${open.filter}`);
      if (desktop && open.alpha < 0.99) fail(w, `desktop fill ${open.bg} is not opaque`);
      if (open.roots.length) fail(w, `backdrop cut by ${open.roots.join(', ')}`);
      await p.waitForTimeout(200);
      const count = await p.evaluate(() => {
        window.__popoverRows = [...document.querySelectorAll('.menu.popover .mi')].filter(row => row.offsetParent !== null && row.getAttribute('aria-disabled') !== 'true');
        return window.__popoverRows.length;
      });
      if (!count) fail(w, 'no enabled visible menu rows for keyboard navigation');
      if (count > 1) multiMenu = true;
      const keys = count ? [['Tab', 0], ...Array.from({ length: count }, (_, index) => ['Tab', (index + 1) % count]),
        ...Array.from({ length: count }, (_, index) => ['Shift+Tab', count - index - 1]), ['Tab', 1 % count]] : [];
      for (const [key, expected] of keys) {
        await p.keyboard.press(key);
        const state = await p.evaluate(() => {
          const rows = [...document.querySelectorAll('.menu.popover .mi')].filter(row => row.offsetParent !== null && row.getAttribute('aria-disabled') !== 'true');
          return { same: rows.length === window.__popoverRows.length && rows.every((row, i) => row === window.__popoverRows[i]), highlighted: rows.indexOf(document.querySelector('.menu.popover [data-highlighted]')), ids: rows.map(row => row.dataset.item) };
        });
        console.log(`${w} keyboard ${key}: ${JSON.stringify({ count, expected, ...state })}`);
        if (!state.same || state.highlighted !== expected) fail(w, `${key}: highlights row ${state.highlighted}, expected ${expected} of ${count}, rows unchanged ${state.same}`);
      }
      await p.keyboard.press('Escape');
      await p.waitForFunction(() => window.__popoverMotion.some(x => x.anim === 'menu-out'));
      const closing = await p.evaluate(() => window.__popoverMotion.find(x => x.anim === 'menu-out'));
      if (!closing || closing.state !== 'closed' || closing.anim !== 'menu-out' || !(closing.dur > 0)) fail(w, `close motion ${JSON.stringify(closing)}`);
      await p.waitForTimeout(300);
      if (await p.locator('.menu.popover').count()) fail(w, 'still open after Escape');
      if (!(await p.evaluate(() => document.activeElement?.hasAttribute('data-pt')))) fail(w, 'focus did not return to the trigger');
      // confirm switches keep their value
      await t.click(); await p.waitForTimeout(200);
      const rows = await p.$$eval('.menu.popover [data-confirm]', els => els.map(e => [e.dataset.item, e.getAttribute('aria-checked')]));
      await p.keyboard.press('Escape'); await p.waitForTimeout(250);
      for (const [id, before] of rows) {
        await p.locator(`[data-pt="${i}"]`).click(); await p.waitForTimeout(200);
        await p.locator(`.menu.popover [data-item="${id}"]`).click(); await p.waitForTimeout(300);
        if (await p.locator('.menu.popover').count()) { fail(w, `${id}: confirm switch left the popover open`); await p.keyboard.press('Escape'); await p.waitForTimeout(250); }
        // a fresh shell reads the stored values again
        await p.goto(`${base}/apps/${appId}/index.html`); await p.waitForTimeout(800);
        await openSurfaceRoute(p, w);
        await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
        await p.evaluate(() => [...document.querySelectorAll('.topbar [data-menu]')].filter(e => !e.closest('.path') && e.offsetParent !== null).forEach((e, k) => e.setAttribute('data-pt', k)));
        await p.locator(`[data-pt="${i}"]`).click(); await p.waitForTimeout(200);
        const after = await p.locator(`.menu.popover [data-item="${id}"]`).getAttribute('aria-checked');
        if (after !== before) fail(w, `${id}: confirm switch changed ${before} -> ${after} without confirmation`);
        await p.keyboard.press('Escape'); await p.waitForTimeout(250);
      }
    }
    if (!multiMenu) fail(where, `${desktop ? 'desktop' : 'browser'} ${theme}: no real multi-row popover exercised`);
    if (address && !triggers.length) fail(where, `${address}: no top bar popover trigger on the selected surface route`);
    await p.close();
  }
}

async function pathIdentity(where) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => fail(where, e.message));
  await p.goto(`${base}/apps/${appId}/index.html`); await p.waitForTimeout(1200);
  const ex = config.examples?.params || {};
  for (const r of config.routes) {
    const params = ex[r.id]; if (!params) continue;
    const address = `${config.scheme}://` + r.pattern.split('/').map(s => s.startsWith(':') ? encodeURIComponent(params[s.slice(1)]) : s).join('/');
    const tab = p.frames().find(f => f !== p.mainFrame() && f.parentFrame() === p.mainFrame() && f.url() !== 'about:blank');
    if (!tab) { fail(where, 'no tab page'); break; }
    await tab.evaluate(a => window.parent.postMessage({ v: 1, type: 'page:navigate', id: 'path-check', payload: { address: a } }, location.origin), address);
    await p.waitForTimeout(900);
    const res = await p.evaluate(() => {
      const el = document.querySelector('.topbar .ident');
      const visibleLabel = el?.querySelector(':scope > span')?.textContent.trim() || '';
      const ariaLabel = el?.getAttribute('aria-label')?.trim() || '';
      return { hasIdent: !!el, visibleLabel, ariaLabel, role: el?.getAttribute('role'), tag: el?.tagName,
        ident: ariaLabel || visibleLabel || null,
        segs: [...document.querySelectorAll('.topbar .path .seg')].map(e => e.textContent.trim()), rule: !!document.querySelector('.topbar .vdiv') };
    });
    console.log(`${where} ${r.id} identity/path: ${JSON.stringify(res)}`);
    if (res.hasIdent && !res.ident) fail(`${where} ${r.id}`, 'identity has no semantic name');
    if (res.hasIdent && !res.visibleLabel && !res.ariaLabel) fail(`${where} ${r.id}`, 'icon-only identity has no nonempty aria-label');
    if (res.hasIdent && !res.visibleLabel && res.tag !== 'BUTTON' && res.role !== 'img') fail(`${where} ${r.id}`, 'static icon-only identity has no img role');
    if (res.visibleLabel && res.ariaLabel && res.visibleLabel !== res.ariaLabel) fail(`${where} ${r.id}`, `identity visible name "${res.visibleLabel}" differs from aria-label "${res.ariaLabel}"`);
    if (res.segs.includes(res.ident)) fail(`${where} ${r.id}`, `path repeats the identity "${res.ident}": ${res.segs.join(' › ')}`);
    if (res.rule !== (res.segs.length > 0 && res.hasIdent)) fail(`${where} ${r.id}`, `rule ${res.rule ? 'drawn without' : 'missing before'} a path`);
  }
  await p.close();
}

async function themeFollow(where) {
  for (const desktop of [false, true]) {
    const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    if (desktop) await p.addInitScript(() => { window.__themeSet = []; window.__on = {}; window.kitShell = { invoke: async (c, ...a) => { if (c === 'service:call' && a[0] === 'app.runtime') return { dev: true }; if (c === 'theme:set') window.__themeSet.push(a[0]); if (c === 'tabs:create') window.__tab = a[0]; return null; }, on(ev, cb) { window.__on[ev] = cb; }, settingsBackend: { load: () => null, save: async () => {} } }; });
    await p.goto(`${base}/apps/${appId}/index.html`); await p.waitForTimeout(1200);
    const w = `${where} ${desktop ? 'desktop' : 'browser'}`;
    const state = () => p.evaluate(() => ({ shell: document.documentElement.dataset.theme, tabs: [...document.querySelectorAll('iframe')].map(f => f.contentDocument?.documentElement.dataset.theme).filter(Boolean), set: window.__themeSet || [] }));
    const tab = desktop ? null : p.frames().find(f => f !== p.mainFrame() && f.url() !== 'about:blank');
    const marker = tab ? await tab.evaluate(() => (window.__alive = Math.random())) : null;
    // a tab page asks for the setting (desktop: the message arrives through the window bridge)
    const ask = v => tab ? tab.evaluate(v => window.parent.postMessage({ v: 1, type: 'page:setting-set', id: 'theme-check', payload: { key: 'kit.theme', value: v } }, location.origin), v)
      : p.evaluate(v => window.__on['tab-message']?.(window.__tab, { v: 1, type: 'page:setting-set', id: 'theme-check', payload: { key: 'kit.theme', value: v } }), v);
    for (const [mode, want] of [['light', 'light'], ['dark', 'dark'], ['system', 'dark']]) {
      await ask(mode);
      await p.waitForTimeout(250);
      const st = await state();
      if (st.shell !== want || st.tabs.some(t => t !== want)) fail(w, `${mode}: shell ${st.shell}, tabs ${st.tabs.join(',')}, expected ${want}`);
      if (desktop && st.set[st.set.length - 1] !== mode) fail(w, `${mode}: window theme not set (${st.set.join(',')})`);
    }
    await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(250);
    const sys = await state();
    if (sys.shell !== 'light' || sys.tabs.some(t => t !== 'light')) fail(w, `system scheme change: shell ${sys.shell}, tabs ${sys.tabs.join(',')}`);
    if (tab && await tab.evaluate(() => window.__alive).catch(() => null) !== marker) fail(w, 'tab page reloaded on a theme change');
    await p.evaluate(() => localStorage.clear());
    await p.close();
  }
}

/* ---------- run ---------- */
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => fail('pageerror', e.message));
await page.goto(`${base}/apps/${appId}/index.html`);
await page.waitForTimeout(1500);

// shell + current tab
await motion(page, 'shell'); await shapes(page, 'shell'); await scrolls(page, 'shell'); await outlines(page, 'shell');
await noBar(page.mainFrame(), 'shell', '[data-slot="sidebar"] [data-scroll]');
await noShift(page.mainFrame(), 'shell', '.panel-body');

// redraw keeps elements: the conversation card's composer composing Korean while its bottom redraws
if (features.panel) {
  const { address, tab, chat } = await preparePanelRoute(page, 'input method setup');
  if (!tab) throw new Error('input method setup: browser tab document missing');
  const ta = chat.locator('[data-chat-bottom] textarea');
  await ta.click();
  if (!(await ta.evaluate(el => el.ownerDocument.activeElement === el))) throw new Error('input method setup: composer did not receive focus');
  console.log(`input method setup: ${address}, visible focused composer`);
  const cdp = await page.context().newCDPSession(page);
  await chat.evaluate(() => { window.__ta = document.querySelector('[data-chat-bottom] textarea'); });
  await cdp.send('Input.imeSetComposition', { text: '\u3147', selectionStart: 1, selectionEnd: 1 });
  // the tab reports a new context: the shell sends it to the conversation card, which redraws its bottom (context chip) while the field keeps focus
  await tab.evaluate(() => window.parent.postMessage({ v: 1, type: 'page:meta', id: 'state-check', payload: { title: 'state check', icon: 'globe', context: { icon: 'globe', title: 'state check', sub: 'redraw' } } }, location.origin));
  await chat.waitForFunction(() => document.querySelector('[data-chat-bottom]')?.textContent.includes('state check'), null, { timeout: 3000 })
    .catch(() => fail('input method', 'the conversation bottom was not redrawn with the new page context'));
  await cdp.send('Input.imeSetComposition', { text: '\uC544', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '\uC548' });
  const r = await chat.evaluate(() => { const t = document.querySelector('[data-chat-bottom] textarea'); return { same: t === window.__ta, value: t.value, focus: document.activeElement === t }; });
  if (!r.same) fail('input method', 'the composer field was replaced during composition');
  if (!r.focus) fail('input method', 'the composer field lost focus during composition');
  if (r.value !== '\uC548') fail('input method', `composed value is "${r.value}", expected U+C548`);
  await chat.evaluate(() => { const t = document.querySelector('[data-chat-bottom] textarea'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); });
}

// every route page
const examples = config.examples?.params || {};
for (const r of config.routes) {
  const params = examples[r.id]; if (!params) continue;
  const path = r.pattern.split('/').map(s => s.startsWith(':') ? encodeURIComponent(params[s.slice(1)]) : s).join('/');
  const p = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  p.on('pageerror', e => fail(`page ${r.id}`, e.message));
  await p.goto(`${base}/apps/${appId}/pages/${r.page}.html?a=${encodeURIComponent(`${config.scheme}://${path}`)}`);
  await p.waitForTimeout(900);
  const w = `page ${r.id}`;
  await motion(p, w); await shapes(p, w); await scrolls(p, w); await outlines(p, w);
  await scrollBar(p.mainFrame(), w, '[data-scroll="content"]');
  await scrollBar(p.mainFrame(), w, '.cc.inset');
  await noShift(p.mainFrame(), w, 'main');
  if (r.kind === 'settings') {
    // a switch keeps its element and slides after a setting change redraws the page.
    // The slide is read from the running transition (Web Animations), not from a position sampled at a fixed delay:
    // a transition starts at the next style update, so a sample taken before the page renders a frame reads the start position.
    const res = await p.evaluate(async () => {
      const sw = document.querySelector('button.sw[data-switch]'); if (!sw) return null;
      const th = () => document.querySelector('button.sw[data-switch] .sw-thumb');
      const x0 = th().getBoundingClientRect().x;
      sw.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
      getComputedStyle(th()).transform; // style update: the transition starts now
      const slide = th().getAnimations().filter(a => a.transitionProperty === 'transform').map(a => { const k = a.effect.getKeyframes(); return { dur: a.effect.getComputedTiming().duration, from: k[0]?.transform, to: k[k.length - 1]?.transform }; })[0] || null;
      await new Promise(res => setTimeout(res, 600));
      const now = document.querySelector('button.sw[data-switch]');
      return { same: now === sw, x0, x1: now.querySelector('.sw-thumb').getBoundingClientRect().x, slide };
    });
    if (res && !res.same) fail(w, 'switch element replaced on change');
    if (res && !(res.slide && res.slide.dur > 0 && res.slide.from !== res.slide.to)) fail(w, `switch thumb jumped (no running transform transition: ${JSON.stringify(res.slide)})`);
    if (res && !(Math.abs(res.x1 - res.x0) > 0.5)) fail(w, `switch thumb did not move (${res.x0} -> ${res.x1})`);
  }
  await p.close();
}

// gallery pages
for (const g of ['components.html', 'layouts.html']) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => fail(g, e.message));
  await p.goto(`${base}/${g}`); await p.waitForTimeout(1200);
  await galleryReady(p, g);
  await motion(p, g); await shapes(p, g); await scrolls(p, g); await outlines(p, g);
  await p.close();
}

// declared motion of kit parts (computed on the gallery page)
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`${base}/components.html`); await p.waitForTimeout(1200);
  await galleryReady(p, 'components.html');
  const res = await p.evaluate(() => {
    const has = (sel, prop) => { const e = document.querySelector(sel); if (!e) return `${sel} missing`; const cs = getComputedStyle(e); const ok = cs.transitionProperty.split(',').some((t, i) => (t.trim() === prop || t.trim() === 'all') && parseFloat(cs.transitionDuration.split(',')[i % cs.transitionDuration.split(',').length]) > 0); return ok ? null : `${sel} has no ${prop} transition`; };
    return [has('.sw-thumb', 'transform'), has('.pill-ind', 'left'), has('.utab-ind', 'left'), has('.sb-sec-head .chev .wi', 'transform'), has('.tbb', 'padding'), has('.slt', 'background'), has('.acc-body', 'grid-template-rows'), has('.acc-trigger .wi', 'transform'), has('.dsc-body', 'grid-template-rows'), has('.prg > i', 'width')].filter(Boolean);
  });
  for (const b of res) fail('kit motion', b);
  const css = await p.evaluate(() => [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(r => r.cssText); } catch { return []; } }).join('\n'));
  for (const [what, re] of [['menu open', /\.menu\[data-state="open"\][^{]*\{[^}]*animation/], ['menu close', /\.menu\[data-state="closed"\][^{]*\{[^}]*animation/], ['tooltip open', /\.tip\[data-state="open"\][^{]*\{[^}]*animation/], ['scroll bar fade', /\.sa-bar[^{]*\{[^}]*transition: opacity/], ['dialog open', /\.dlg-layer\[data-state="open"\] \.dlg[^{]*\{[^}]*animation/], ['dialog close', /\.dlg-layer\[data-state="closed"\] \.dlg[^{]*\{[^}]*animation/]]) if (!re.test(css)) fail('kit motion', `${what} has no animation`);
  await p.close();
}

/* Question panel on the full-tab conversation */
async function approvals(where) {
  const r = config.routes.find(x => x.kind === 'chat'); const params = config.examples?.params?.[r?.id];
  if (!r || !params) return;
  const path = r.pattern.split('/').map(s => s.startsWith(':') ? encodeURIComponent(params[s.slice(1)]) : s).join('/');
  const url = `${base}/apps/${appId}/pages/${r.page}.html?a=${encodeURIComponent(`${config.scheme}://${path}`)}`;
  const { setLocales, useLocale, t: translate } = await import('../core/i18n.js');
  setLocales(config.locales);
  useLocale(config.defaultLocale || 'en');
  const answerPh = translate('approval.answer');
  const p = await browser.newPage({ viewport: { width: 1280, height: 860 }, locale: config.defaultLocale || 'en' });
  p.on('pageerror', e => fail(where, e.message));
  let proposalId;
  const open = async () => {
    await p.goto(url); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(900);
    if (await p.locator('.qp').count()) {
      // A persisted example is not a current adapter-bound proposal. Request a fresh one through the composer.
      await p.locator('.qp').focus(); await p.keyboard.press('Escape');
      await p.locator('.qp').waitFor({ state: 'detached' });
      if (config.ai.permissions.some(x => x.id === 'read') && config.ai.permissions.some(x => x.id === 'ask')) {
        await p.locator('[data-menu="kit.ai.permission"]').click();
        if (await p.locator('.menu:not([data-state="closed"]) [data-item="perm-read"]').getAttribute('aria-checked') !== 'true') fail(where, 'the default permission is not read');
        await p.locator('.menu:not([data-state="closed"]) [data-item="perm-ask"]').click();
        await p.locator('[data-menu="kit.ai.permission"]').click();
        if (await p.locator('.menu:not([data-state="closed"]) [data-item="perm-ask"]').getAttribute('aria-checked') !== 'true') fail(where, 'ask permission was not selected');
        await p.keyboard.press('Escape');
      }
      const input = p.locator('[data-chat-bottom] .cmp textarea');
      await input.fill('state check'); await input.press('Enter');
      await p.locator('.qp').waitFor();
      await p.waitForTimeout(100);
      proposalId = await p.locator('.qp').getAttribute('data-id');
    }
  };
  await open();
  if (!(await p.locator('.qp').count())) { await p.close(); return; }
  const st = await p.evaluate(() => {
    const qp = document.querySelector('.qp'), wrap = qp.closest('.qp-wrap'), row = qp.querySelector('.qp-o'), cmp = document.querySelector('[data-chat-bottom] .cmp');
    const cs = e => getComputedStyle(e), rq = qp.getBoundingClientRect(), rc = cmp?.getBoundingClientRect();
    const fades = cs(row).transitionProperty.split(',').some((t, i) => /background|all/.test(t) && parseFloat(cs(row).transitionDuration.split(',')[i] ?? cs(row).transitionDuration) > 0);
    return {
      inBottom: !!qp.closest('[data-chat-bottom]'), composer: !!cmp, above: rc ? rq.bottom <= rc.top + 0.5 : false, narrower: rc ? rq.left > rc.left && rq.right < rc.right : false,
      placeholder: cmp?.querySelector('textarea')?.placeholder, focus: document.activeElement === qp,
      choices: [...qp.querySelectorAll('.qp-o')].map(c => c.dataset.choice),
      appear: [wrap, qp].filter(e => cs(e).animationName !== 'none' || cs(e).transitionDuration.split(',').some(d => parseFloat(d) > 0)).map(e => e.className),
      fades, diffInAnswer: !!document.querySelector('[data-proposal] .cb'), diffInPanel: !!qp.querySelector('.cb'),
    };
  });
  if (!st.inBottom || !st.composer || !st.above) fail(where, 'the question panel is not right above the composer');
  if (!st.narrower) fail(where, 'the question panel is not narrower than the composer');
  if (answerPh && st.placeholder !== answerPh) fail(where, `composer is not in answer mode (placeholder "${st.placeholder}")`);
  if (!st.focus) fail(where, 'the question panel did not take focus when it appeared');
  if (st.appear.length) fail(where, `transition or animation when the panel appears: ${st.appear.join(', ')}`);
  if (!st.fades) fail(where, 'option rows change their fill without the button transition');
  if (!st.diffInAnswer || st.diffInPanel) fail(where, 'the proposed change is not a code block in the answer');
  if (config.ai.approvals?.allowAlways === false && st.choices.includes('always')) fail(where, 'an always option is drawn while ai.approvals.allowAlways is false');
  const sel = () => p.evaluate(() => ({ sel: document.querySelector('.qp-o.is-sel')?.dataset.index, focus: document.activeElement?.dataset?.index }));
  await p.keyboard.press('ArrowDown'); const d1 = await sel();
  if (d1.sel !== '1' || d1.focus !== '1') fail(where, `ArrowDown: selected ${d1.sel}, focused ${d1.focus}`);
  for (let i = 1; i < st.choices.length; i++) await p.keyboard.press('ArrowDown');
  const d2 = await sel(); if (d2.sel !== '0') fail(where, `ArrowDown does not wrap to the first row (selected ${d2.sel})`);
  await p.keyboard.press('ArrowUp'); const d3 = await sel(); if (d3.sel !== String(st.choices.length - 1)) fail(where, `ArrowUp does not wrap to the last row (selected ${d3.sel})`);
  const after = () => p.evaluate(id => ({ state: document.querySelector(`[data-proposal="${id}"]`)?.dataset.state, result: !!document.querySelector(`[data-proposal="${id}"] [data-c="step-row"]`), panel: !!document.querySelector('.qp'), ph: document.querySelector('[data-chat-bottom] .cmp textarea')?.placeholder }), proposalId);
  // an answer written in the composer: a message, never an approval
  const msgs0 = await p.locator('.ub').count();
  await p.locator('[data-chat-bottom] .cmp textarea').fill('state check'); await p.locator('[data-chat-bottom] .cmp textarea').press('Enter'); await p.waitForTimeout(900);
  const ans = await after();
  if ((await p.locator('.ub').count()) <= msgs0) fail(where, 'the written answer was not sent as a message');
  if (ans.state !== 'denied') fail(where, `the written answer left the proposal ${ans.state}, expected denied`);
  // Enter submits the selected row (first: allow), Escape declines, mod+enter allows
  for (const [keys, want] of [[['Enter'], 'ran'], [['ArrowDown', 'Enter'], 'denied'], [['Escape'], 'denied'], [['ControlOrMeta+Enter'], 'ran']]) {
    await open(); await p.locator('.qp').focus();
    for (const k of keys) await p.keyboard.press(k);
    await p.waitForTimeout(1200);
    const res = await after();
    if (res.state !== want) fail(where, `${keys.join(' ')}: result ${res.state}, expected ${want}`);
    if (!res.result) fail(where, `${keys.join(' ')}: no result line in the conversation`);
    if (res.panel || res.ph === answerPh) fail(where, `${keys.join(' ')}: the panel did not close`);
  }
  await p.evaluate(() => localStorage.clear());
  // policy: a config that defines an always choice while allowAlways is false fails validation
  if (config.ai.approvals?.allowAlways === false) {
    const { validate } = await import(pathToFileURL(join(repo, 'kit/core/validate.js')));
    const bad = { ...config, ai: { ...config.ai, approvals: { ...config.ai.approvals, choices: [...config.ai.approvals.choices, { id: 'always', label: { raw: 'always' } }] } } };
    if (!validate(bad).some(e => /allowAlways/.test(e))) fail(where, 'validation accepts an always choice while allowAlways is false');
  }
  await p.close();
}
await approvals('question panel');
await reduced('reduced motion');
await desktopMaterial('desktop material');
await floating('floating surfaces');
await popovers('top bar popovers');
await pathIdentity('path');
await themeFollow('theme');
await radii('corner radii');
await browser.close();
server.close();
if (failures.length) { console.log(`FAIL ${failures.length}\n` + failures.join('\n')); process.exit(1); }
console.log('check-states: ok');
