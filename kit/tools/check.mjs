#!/usr/bin/env node
/*
 * Screen check (scripted run). Exit code 1 if anything fails.
 *   node kit/tools/check.mjs --app <id> [--shots <folder>] [--locale <code>]   (--locale sets kit.locale; default: the browser languages)
 * Needs playwright-core (found via NODE_PATH) and Chromium (CHROMIUM_PATH or the playwright default location).
 *
 * Checks:
 *  - opens the shell and every route as a tab using the app definition's examples.params (browser host).
 *  - in shell and page documents: console errors 0, horizontal scroll 0, overflowing text 0 (ellipsis and scroll areas excluded).
 *  - opens and closes every [data-menu] in the shell and in pages, one by one (errors 0).
 *  - tab behavior: new tab, back, forward, close, reopen closed tab, palette open and close.
 *  - contrast: label on the primary button fill (--action-fg on --action) under 4.5 fails; brand as small text (--brand-content on background)
 *    under 4.5 fails when the app theme overrides --brand-content (the kit default is the reference value and is only reported).
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const appId = opt('--app');
if (!appId) { console.error('usage: check.mjs --app <id> [--shots <folder>]'); process.exit(2); }
const shots = opt('--shots');
const localeCode = opt('--locale');
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
const failures = [];
const fail = (where, msg) => { failures.push(`${where}: ${msg}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// the app's first-run flow is checked on its own; the other checks start past it (kit.firstRun.done unless a check set it)
const launchPage = browser.newPage.bind(browser);
browser.newPage = async o => { const p = await launchPage(o); await p.addInitScript(([id, lc]) => { try { const k = id + ':settings', v = JSON.parse(localStorage.getItem(k) || '{}'); if (v['kit.firstRun.done'] === undefined) v['kit.firstRun.done'] = true; if (lc) v['kit.locale'] = lc; localStorage.setItem(k, JSON.stringify(v)); } catch { /* no storage */ } }, [config.id, localeCode]); return p; };
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', m => { if (m.type() === 'error') fail('console', m.text() + ' ' + (m.location()?.url || '')); });
page.on('pageerror', e => fail('pageerror', e.message));

/* Check one document: horizontal scroll, overflowing text */
async function inspect(frame, where) {
  const r = await frame.evaluate(() => {
    const out = { hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, overflow: [] };
    for (const el of document.querySelectorAll('body *')) {
      if (!el.childNodes.length || el.closest('[data-scroll="x"], [data-scroll="menu"], [data-scroll="list"], [data-scroll="field"], svg')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.offsetParent === null) continue;
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!hasText) continue;
      const clipped = cs.textOverflow === 'ellipsis' || cs.maskImage !== 'none' || cs.overflowX !== 'visible';
      if (el.scrollWidth > el.clientWidth + 1 && !clipped && cs.whiteSpace === 'nowrap') out.overflow.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${el.textContent.trim().slice(0, 30)}"`);
    }
    return out;
  });
  if (r.hscroll) fail(where, 'horizontal scroll');
  for (const o of r.overflow.slice(0, 5)) fail(where, `overflowing text ${o}`);
}
async function openMenus(frame, where) {
  const n = await frame.evaluate(() => document.querySelectorAll('[data-menu]').length);
  for (let i = 0; i < n; i++) {
    const ok = await frame.evaluate(i => {
      const el = [...document.querySelectorAll('[data-menu]')][i];
      if (!el || el.offsetParent === null) return 'skip';
      const live = () => document.querySelectorAll('.menu:not([data-state="closed"])').length;
      const before = live();
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      const open = live() > before;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return open ? 'ok' : `menu "${el.dataset.menu}" did not open`;
    }, i);
    if (ok !== 'ok' && ok !== 'skip') fail(where, ok);
    await frame.waitForTimeout(30);
  }
}

await page.goto(`${base}/apps/${appId}/index.html`);
await page.waitForTimeout(1500);
const shellApi = '__kitShell';
await page.evaluate(n => { window[n] = window[n] || null; }, shellApi);
await inspect(page.mainFrame(), 'shell');
await openMenus(page.mainFrame(), 'shell');

const examples = config.examples?.params || {};
for (const r of config.routes) {
  const params = examples[r.id];
  if (!params) { fail('examples', `no example params for route ${r.id}`); continue; }
  const path = r.pattern.split('/').map(s => s.startsWith(':') ? encodeURIComponent(params[s.slice(1)]) : s).join('/');
  const address = `${config.scheme}://${path}`;
  const fr = await (await page.goto(`${base}/apps/${appId}/pages/${r.page}.html?a=${encodeURIComponent(address)}`)).frame();
  await page.waitForTimeout(800);
  await inspect(fr, `page ${r.id}`);
  await openMenus(fr, `page ${r.id}`);
  if (shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${appId}-${r.id}.png`) }); }
}

/* Tab behavior (shell) */
await page.goto(`${base}/apps/${appId}/index.html`);
await page.waitForTimeout(1200);
const tabsCount = () => page.evaluate(() => document.querySelectorAll('.sb-sec[data-section] .sb-row[data-drag-group="tabs"]').length);
const before = await tabsCount();
await page.keyboard.press('ControlOrMeta+t'); await page.waitForTimeout(600);
if (await tabsCount() !== before + 1) fail('tabs', 'new tab did not open');
await page.keyboard.press('ControlOrMeta+w'); await page.waitForTimeout(300);
if (await tabsCount() !== before) fail('tabs', 'close tab did not close');
await page.keyboard.press('ControlOrMeta+Shift+t'); await page.waitForTimeout(600);
if (await tabsCount() !== before + 1) fail('tabs', 'reopen did not restore');
await page.keyboard.press('ControlOrMeta+k'); await page.waitForTimeout(200);
if (!await page.$('.pal')) fail('palette', 'did not open'); else { await page.keyboard.press('Escape'); await page.waitForTimeout(100); if (await page.$('.pal')) fail('palette', 'did not close'); }



/* Closing a nested owner must not return focus to its animation DOM (issue #35). */
{
  const ownerPage = await browser.newPage();
  await ownerPage.goto(`${base}/apps/${appId}/index.html`);
  await ownerPage.setContent('<main></main>');
  await ownerPage.evaluate(async () => {
    const [{ createIframeHost }, palette, dialog, menu] = await Promise.all([
      import('/kit/shell/hosts/iframe-host.js'), import('/kit/components/palette.js'), import('/kit/components/dialog.js'), import('/kit/components/menu.js'),
    ]);
    window.__KIT_PAGES = { probe: '<input id="child">' };
    const host = createIframeHost({ doc: document, pageOf: () => 'probe', entryUrl: () => '', onMessage() {}, onState() {} });
    host.mount(document.querySelector('main'));
    host.create('probe', 'probe'); host.show('probe');
    for (const component of [palette, dialog, menu]) {
      const style = document.createElement('style'); style.textContent = component.css; document.head.appendChild(style);
    }
    const ctx = { onOverlay: (...args) => host.setOverlay(...args), emit: (action, payload) => ownerProbe.dialog.handle(action, payload), resolveMenu: (id, key) => ownerProbe.dialog.menu(key) };
    window.ownerProbe = { palette: palette.attach(document, ctx), dialog: dialog.attach(document, ctx), menu: menu.attach(document, ctx) };
  });
  await ownerPage.locator('iframe').contentFrame().locator('#child').waitFor();
  const closed = await ownerPage.evaluate(() => {
    ownerProbe.palette.open({ groups: [] });
    const input = document.querySelector('.pal input');
    input.value = 'cursor-selection'; input.setSelectionRange(2, 7);
    const trigger = document.createElement('button'); document.body.appendChild(trigger);
    ownerProbe.dialog.open({ title: { raw: 'Dialog' }, fields: [{ key: 'probe', label: { raw: 'Input' }, type: 'text' }], submit: { label: { raw: 'Done' }, action: 'done' } }, trigger);
    trigger.remove(); ownerProbe.dialog.close();
    document.querySelector('iframe').contentDocument.querySelector('input').focus();
    return !!document.querySelector('.dlg-layer[data-state="closed"]');
  });
  if (!closed) fail('overlay owner', 'closed animation fixture missing');
  if (!await ownerPage.evaluate(() => document.activeElement === document.querySelector('.pal input'))) fail('overlay owner', 'remaining palette lost focus');
  if (!await ownerPage.evaluate(() => { const e = document.querySelector('.pal input'); return e.selectionStart === 2 && e.selectionEnd === 7; })) fail('overlay owner', 'lost selection');
  await ownerPage.keyboard.type('Z');
  if (await ownerPage.locator('.pal input').inputValue() !== 'cuZselection') fail('overlay owner', 'lost text input');
  if (await ownerPage.locator('iframe').contentFrame().locator('#child').inputValue()) fail('overlay owner', 'page received palette text');
  await ownerPage.keyboard.press('Escape');
  if (await ownerPage.evaluate(() => ownerProbe.palette.isOpen())) fail('overlay owner', 'did not close');
  await ownerPage.evaluate(() => {
    ownerProbe.dialog.open({ title: { raw: 'Dialog' }, fields: [
      { key: 'probe', label: { raw: 'Input' }, type: 'text', value: 'cursor-selection' },
      { key: 'pick', label: { raw: 'Pick' }, type: 'select', value: 'one', options: [{ id: 'one', label: { raw: 'One' } }] },
    ], submit: { label: { raw: 'Done' }, action: 'done' } });
    document.querySelector('[data-field="probe"]').setSelectionRange(2, 7);
    ownerProbe.menu.open(document.querySelector('.dlg-body [data-menu]'), ownerProbe.dialog.menu('pick'), { highlight: 'first' });
    ownerProbe.menu.closeAll(true, false);
    document.querySelector('iframe').contentDocument.querySelector('input').focus();
  });
  if (!await ownerPage.evaluate(() => !!document.querySelector('.menu[data-state="closed"]'))) fail('dialog owner', 'closed menu fixture missing');
  if (!await ownerPage.evaluate(() => document.activeElement === document.querySelector('[data-field="probe"]'))) fail('dialog owner', 'remaining dialog lost focus');
  if (!await ownerPage.evaluate(() => { const e = document.querySelector('[data-field="probe"]'); return e.selectionStart === 2 && e.selectionEnd === 7; })) fail('dialog owner', 'lost selection');
  await ownerPage.keyboard.type('Z');
  if (await ownerPage.locator('[data-field="probe"]').inputValue() !== 'cuZselection') fail('dialog owner', 'lost text input');
  if (await ownerPage.locator('iframe').contentFrame().locator('#child').inputValue()) fail('dialog owner', 'page received dialog text');
  await ownerPage.evaluate(() => ownerProbe.menu.open(document.querySelector('.dlg-layer[data-state="open"] [data-menu]'), ownerProbe.dialog.menu('pick')));
  await ownerPage.keyboard.press('Escape');
  if (!await ownerPage.evaluate(() => !!document.querySelector('.dlg-layer[data-state="open"]'))) fail('dialog owner', 'menu Escape closed dialog');
  if (await ownerPage.evaluate(() => !!document.querySelector('.menu[data-state="open"], .menu[data-state="idle"]'))) fail('dialog owner', 'menu Escape did not close menu');
  await ownerPage.keyboard.press('Escape');
  if (await ownerPage.evaluate(() => !!document.querySelector('.dlg-layer[data-state="open"]'))) fail('dialog owner', 'second Escape did not close dialog');
  let selectNavigations = 0;
  ownerPage.on('framenavigated', frame => { if (frame === ownerPage.mainFrame()) selectNavigations++; });
  await ownerPage.evaluate(() => {
    window.selectSubmits = 0;
    document.addEventListener('submit', () => selectSubmits++);
    ownerProbe.dialog.open({ title: { raw: 'Dialog' }, fields: [
      { key: 'pick', label: { raw: 'Pick' }, type: 'select', value: 'one', options: [{ id: 'one', label: { raw: 'One' } }, { id: 'two', label: { raw: 'Two' } }] },
    ], submit: { label: { raw: 'Done' }, action: 'done' } });
  });
  const selectTrigger = ownerPage.locator('.dlg-layer[data-state="open"] .dlg-body [data-menu]');
  for (const key of ['Enter', 'Space', 'ArrowDown', 'ArrowUp']) {
    await selectTrigger.focus();
    await ownerPage.keyboard.press(key);
    const selectMenu = ownerPage.locator('.menu[data-state="open"], .menu[data-state="idle"]');
    await selectMenu.waitFor();
    await ownerPage.keyboard.press('Escape');
    if (await selectMenu.count()) fail('dialog select', `${key} menu Escape did not close menu`);
    if (!await ownerPage.evaluate(() => document.activeElement === document.querySelector('.dlg-layer[data-state="open"] .dlg-body [data-menu]'))) fail('dialog select', `${key} lost trigger focus`);
  }
  await ownerPage.keyboard.press('Enter');
  await ownerPage.keyboard.press('ArrowDown');
  await ownerPage.keyboard.press('Enter');
  if ((await selectTrigger.innerText()).trim() !== 'Two') fail('dialog select', 'keyboard choice did not update value');
  if (!await ownerPage.evaluate(() => document.activeElement === document.querySelector('.dlg-layer[data-state="open"] .dlg-body [data-menu]'))) fail('dialog select', 'choice lost trigger focus');
  if (await ownerPage.evaluate(() => selectSubmits !== 0)) fail('dialog select', 'trigger submitted form');
  if (selectNavigations) fail('dialog select', 'trigger navigated document');
  await ownerPage.keyboard.press('Escape');
  if (await ownerPage.locator('.dlg-layer[data-state="open"]').count()) fail('dialog select', 'dialog Escape did not close');
  await ownerPage.close();
}

/* Contrast */
const contrast = await page.evaluate(() => {
  // paint the computed color (oklch and so on) on a canvas and read it back as sRGB
  const rgb = css => { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 1, 1); x.fillStyle = css; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const probe = (fg, bg) => {
    const d = document.createElement('div'); d.style.cssText = `color:${fg};background:${bg}`; document.body.appendChild(d);
    const cs = getComputedStyle(d); const res = [rgb(cs.color), rgb(cs.backgroundColor)]; d.remove(); return res;
  };
  const out = {};
  for (const theme of ['dark', 'light']) {
    document.documentElement.dataset.theme = theme;
    out[theme] = { action: probe('var(--action-fg)', 'var(--action)'), brandContentOnBg: probe('var(--brand-content)', 'var(--background)') };
  }
  document.documentElement.dataset.theme = 'dark';
  return out;
});
const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = ([a, b]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const notes = [];
const themeFile = join(repo, 'apps', appId, 'theme.css');
const appBrand = existsSync(themeFile) && /--brand-content\s*:/.test(readFileSync(themeFile, 'utf8'));
for (const th of ['dark', 'light']) {
  const act = ratio(contrast[th].action);
  notes.push(`contrast ${th}: action-fg on action ${act.toFixed(2)}`);
  if (act < 4.5) fail('contrast', `${th}: --action-fg on --action ${act.toFixed(2)} < 4.5`);
  const small = ratio(contrast[th].brandContentOnBg);
  notes.push(`contrast ${th}: brand-content on background ${small.toFixed(2)}`);
  if (small < 4.5 && appBrand) fail('contrast', `${th}: --brand-content on --background ${small.toFixed(2)} < 4.5`);
}

await browser.close();
server.close();
console.log(notes.join('\n'));
if (failures.length) { console.log(`FAIL ${failures.length}\n` + failures.join('\n')); process.exit(1); }
console.log('check: ok');
