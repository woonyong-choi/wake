#!/usr/bin/env node
/*
 * Glass check: nothing under a translucent menu can be read (scripted run). Exit code 1 if anything fails.
 *   node kit/tools/check-glass.mjs --app <id>
 * Needs playwright-core (NODE_PATH) and Chromium (CHROMIUM_PATH or the playwright default), like check.mjs.
 *
 * Runs in desktop mode (simulated window.kitShell / window.kitBridge) with a transparent page background, as in the desktop window,
 * where the macOS material shows through. Headless Chromium draws a backdrop blur the same way as the desktop window (measured: the
 * same sharpness numbers on both), so the check needs no Electron.
 * In dark and light, on the shell and on every route page, it opens every menu trigger ([data-menu]), the first submenu of each menu
 * and the web context menus ([data-context]) one by one. For each open surface it captures the surface's box twice: as drawn, and with
 * everything below the menu layer hidden (the menus' own rows and the menu's own overlay scroll bar are hidden in both, check-surfaces.mjs). The difference is what shows through from below; its sharpest edge (largest Laplacian of the
 * premultiplied luminance difference) must stay under SHARP. A blurred backdrop gives a few units, text or a glyph that shows through
 * sharp gives tens.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { SHARP, PROBE_CSS, measureGlass } from './check-surfaces.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const args = process.argv.slice(2);
const appId = args[args.indexOf('--app') + 1];
if (!args.includes('--app') || !appId) { console.error('usage: check-glass.mjs --app <id>'); process.exit(2); }
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
const serviceFixtures = existsSync(fixturePath) ? JSON.parse(readFileSync(fixturePath, 'utf8')) : {};
const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);
let surfaces = 0;

const FAKE_SHELL = ({ services }) => {
  window.kitShell = {
    invoke: async (channel, name) => channel === 'service:call' ? structuredClone(services[name] ?? null) : null,
    on() {}, settingsBackend: { load: () => ({ 'kit.firstRun.done': true }), save: async () => {} },
  };
};
/* A service the fixture does not answer fails the call, as the desktop host does for a service it cannot run (kit/desktop/main.cjs, unknown service)
   and as a page without a service host does (kit/core/service.js); it never answers null, which no host sends */
const FAKE_BRIDGE = ({ appId, address, theme, services }) => {
  let receive;
  window.kitService = {
    call: async name => { if (!Object.hasOwn(services, name)) throw new Error(`unknown service: ${name}`); return structuredClone(services[name]); },
    on() {},
  };
  window.kitBridge = {
    on(callback) { receive = callback; },
    send(message) {
      if (message.type === 'page:ready') receive({ v: 1, type: 'shell:init', payload: { protocol: 1, appId, address, theme, tabId: 'glass-check' } });
    },
  };
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// the app's first-run flow is checked on its own; the other checks start past it (kit.firstRun.done unless a check set it)
const launchPage = browser.newPage.bind(browser);
browser.newPage = async o => { const p = await launchPage(o); await p.addInitScript(id => { try { const k = id + ':settings', v = JSON.parse(localStorage.getItem(k) || '{}'); if (v['kit.firstRun.done'] === undefined) localStorage.setItem(k, JSON.stringify({ ...v, 'kit.firstRun.done': true })); } catch { /* no storage */ } }, config.id); return p; };
const lab = await browser.newPage();

/* The newest open surface, measured by check-surfaces.mjs (its own rows and own scroll bar hidden in both captures) */
async function measure(p, where) {
  const s = await measureGlass(p, lab);
  if (!s) return false;
  surfaces++;
  if (!(s.lap < SHARP)) fail(where, `content below shows through sharp (edge ${s.lap.toFixed(1)} >= ${SHARP} at ${s.at}; fill ${s.box.bg}, filter ${s.box.filter})`);
  return true;
}

async function closeAll(p) {
  for (let i = 0; i < 3; i++) await p.keyboard.press('Escape');
  await p.mouse.move(1, 1);
  await p.waitForTimeout(250);
}

async function open(url, init, theme, address) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => fail(url, e.message));
  await p.addInitScript(init, { appId, address, theme, services: serviceFixtures });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await p.goto(url);
  // a page that draws nothing is a failure of that page, not of the run: the other pages are still checked
  if (address && !(await p.locator('#page > *').first().waitFor({ timeout: 15000 }).then(() => true, () => false))) { fail(url, 'the page drew nothing into #page'); await p.close(); return null; }
  await p.waitForTimeout(1000);
  await p.evaluate(([t, css]) => { document.documentElement.dataset.theme = t; const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }, [theme, PROBE_CSS]);
  await p.waitForTimeout(200);
  return p;
}

/* Center of the first visible element matching a key; looked up again each time, as a redraw replaces the elements */
const CENTER = ([attr, key]) => {
  const e = [...document.querySelectorAll(`[${attr}]`)].find(e => e.offsetParent !== null && !e.closest('.menu') && (attr === 'data-menu' ? e.dataset.menu + '|' + (e.dataset.menuArg || '') : e.dataset.context) === key);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
const KEYS = attr => [...new Set([...document.querySelectorAll(`[${attr}]`)].filter(e => e.offsetParent !== null && !e.closest('.menu'))
  .map(e => attr === 'data-menu' ? e.dataset.menu + '|' + (e.dataset.menuArg || '') : e.dataset.context))];

/* Every menu trigger, its first submenu, and the web context menus of a document */
async function sweep(p, where) {
  for (const key of await p.evaluate(KEYS, 'data-menu')) {
    const w = `${where} menu ${key}`;
    const c = await p.evaluate(CENTER, ['data-menu', key]);
    if (!c) continue;
    await p.mouse.click(c.x, c.y);
    if (!(await measure(p, w))) { await closeAll(p); continue; }
    const sub = await p.evaluate(() => {
      const m = [...document.querySelectorAll('.m-layer > .menu')].pop();
      const it = m && [...m.querySelectorAll('.mi')].find(x => x.offsetParent !== null && (x.querySelector('.mi-sub') || x.getAttribute('aria-haspopup')));
      if (!it) return null;
      const r = it.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    // pointer over the row, then the arrow key (no click: a row with a submenu may also run an action)
    if (sub) { await p.mouse.move(sub.x, sub.y); await p.waitForTimeout(150); await p.keyboard.press('ArrowRight'); await measure(p, `${w} submenu`); }
    await closeAll(p);
  }
  for (const kind of await p.evaluate(KEYS, 'data-context')) {
    const c = await p.evaluate(CENTER, ['data-context', kind]);
    if (!c) continue;
    await p.mouse.click(c.x, c.y, { button: 'right' });
    await measure(p, `${where} context ${kind}`);
    await closeAll(p);
  }
}

const examples = config.examples?.params || {};
for (const theme of ['dark', 'light']) {
  const shell = await open(`${base}/apps/${appId}/index.html`, FAKE_SHELL, theme);
  await sweep(shell, `${theme} shell`);
  await shell.close();
  for (const r of config.routes) {
    const params = examples[r.id];
    if (!params) continue;
    const path = r.pattern.split('/').map(s => s.startsWith(':') ? encodeURIComponent(params[s.slice(1)]) : s).join('/');
    const address = `${config.scheme}://${path}`;
    const q = await open(`${base}/apps/${appId}/pages/${r.page}.html?a=${encodeURIComponent(address)}`, FAKE_BRIDGE, theme, address);
    if (!q) continue;
    await sweep(q, `${theme} page ${r.id}`);
    await q.close();
  }
}
await browser.close();
server.close();
if (!surfaces) fail('glass', 'no menu was opened');
if (failures.length) { console.log(`FAIL ${failures.length}\n` + failures.join('\n')); process.exit(1); }
console.log(`check-glass: ok (${surfaces} surfaces)`);
