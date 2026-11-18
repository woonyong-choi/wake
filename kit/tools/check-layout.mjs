#!/usr/bin/env node
/*
 * Layout check: opens every screen the app lists in config.examples.screens (addresses of its sample data) at two window widths, dark and
 * light, and fails when an element's border box sticks out of the box that clips it sideways
 * (an ancestor with overflow-x hidden or clip; a sideways scroller is fine). That is what a card or panel outline cut at its edge is.
 * In a short window (240 high, so that even a screen without data runs past it) it also fails when content runs below the view and no scroller over it moves: what is past the bottom
 * could not be reached with the wheel, the trackpad or the keys (a page that clipped its own scroller once hid the end of its list).
 *   node kit/tools/check-layout.mjs --app <id>
 * Needs playwright-core (NODE_PATH) and Chromium, like check.mjs.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { readRegressionsInPage, readScrollEndInPage } from './check-regressions.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { console.error('playwright-core not found (set NODE_PATH)'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const appId = process.argv[process.argv.indexOf('--app') + 1];
if (!appId || process.argv.indexOf('--app') < 0) { console.error('usage: check-layout.mjs --app <id>'); process.exit(2); }
const config = (await import(pathToFileURL(join(root, 'apps', appId, 'app.config.js')).href)).default;
const screens = config.examples?.screens || [];
if (!screens.length) { console.log('check-layout: no example screens'); process.exit(0); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

/* the route page an address opens (the route whose pattern matches its path) */
const pageOf = address => {
  const path = address.replace(/^[a-z]+:\/\//, '').split('?')[0].split('/');
  for (const r of config.routes) { const pat = r.pattern.split('/');
    if (pat.length === path.length && pat.every((s, i) => s.startsWith(':') || s === path[i])) return r.page; }
  return null;
};

const problems = [];
const browser = await chromium.launch();
for (const width of [1280, 860]) for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width, height: 860 } });
  page.on('pageerror', e => problems.push(`${width} ${theme}: page error ${e.message}`));
  for (const address of screens) {
    const pg = pageOf(address); if (!pg) { problems.push(`${address}: no route`); continue; }
    await page.goto(`${base}/apps/${appId}/pages/${pg}.html?a=${encodeURIComponent(address)}`);
    await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    await page.waitForTimeout(700);
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.waitForTimeout(150);
    for (const failure of (await page.evaluate(readRegressionsInPage)).failures) problems.push(`${address} ${width} ${theme}: ${failure.rule} ${failure.reason}`);
    const bad = await page.evaluate(() => {
      const out = [], name = e => `${e.tagName.toLowerCase()}${e.classList.length ? '.' + [...e.classList].slice(0, 3).join('.') : ''}`;
      for (const e of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
        if (e.closest('[aria-hidden="true"], .menu, .tip, svg, [inert]')) continue;
        const b = e.getBoundingClientRect(); if (b.width < 1 || b.height < 1) continue;
        /* a ring drawn around the box (a box-shadow spread with no blur and no offset that is not inset, an outline) counts as its edge */
        const rings = [...cs.boxShadow.matchAll(/(?:^|,)\s*(?!inset)[^,]*?0px 0px 0px (\d+(?:\.\d+)?)px(?![^,]*inset)/g)].map(m => parseFloat(m[1]));
        const ring = Math.max(0, ...rings, cs.outlineStyle !== 'none' ? parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset) : 0);
        const r = { left: b.left - ring, right: b.right + ring };
        for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
          const as = getComputedStyle(a); if (as.overflowX === 'visible') continue;
          if (as.overflowX === 'auto' || as.overflowX === 'scroll') break; // a sideways scroller shows the rest
          const ar = a.getBoundingClientRect(), l = ar.left + parseFloat(as.borderLeftWidth), rt = ar.right - parseFloat(as.borderRightWidth);
          if (r.left < l - 0.5 || r.right > rt + 0.5) out.push(`${name(e)} (${Math.round(r.left)}..${Math.round(r.right)}) outside ${name(a)} (${Math.round(l)}..${Math.round(rt)})`);
          break;
        }
      }
      return out;
    });
    for (const b of [...new Set(bad)].slice(0, 6)) problems.push(`${address} ${width} ${theme}: ${b}`);
  }
  await page.close();
}
/* below the view: the lowest box that runs past the bottom must have a scroller above it that moves */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 240 } });
  for (const address of screens) {
    const pg = pageOf(address); if (!pg) continue;
    await page.goto(`${base}/apps/${appId}/pages/${pg}.html?a=${encodeURIComponent(address)}`);
    await page.waitForTimeout(700);
    const bad = await page.evaluate(() => {
      const name = e => `${e.tagName.toLowerCase()}${e.classList.length ? '.' + [...e.classList].slice(0, 3).join('.') : ''}`;
      let low = null, bottom = innerHeight + 1;
      for (const e of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed' || e.closest('[aria-hidden="true"], .menu, .tip, svg, [inert], details:not([open]) > :not(summary)')) continue;
        const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
        if (r.bottom > bottom) { bottom = r.bottom; low = e; }
      }
      if (!low) return null;
      for (let a = low.parentElement; a; a = a.parentElement) {
        const oy = getComputedStyle(a).overflowY; if (!['auto', 'scroll'].includes(oy) && a !== document.scrollingElement) continue;
        if (a.scrollHeight <= a.clientHeight) continue;
        const was = a.scrollTop; a.scrollTop = was + 40; const moved = a.scrollTop !== was; a.scrollTop = was;
        if (moved) return null;
      }
      return `${name(low)} runs past the bottom of the view (to ${Math.round(bottom)} of ${innerHeight}) and nothing above it scrolls`;
    });
    if (bad) problems.push(`${address} 1280x240: ${bad}`);
    let wheelEnd = await page.evaluate(readScrollEndInPage, { scroll: false });
    for (let attempt = 0; attempt < 3 && !wheelEnd.reachable && wheelEnd.wheelTarget; attempt++) {
      const target = wheelEnd.wheelTarget;
      await page.mouse.move(target.x, target.y);
      await page.mouse.wheel(0, target.distance);
      await page.waitForTimeout(150);
      wheelEnd = await page.evaluate(readScrollEndInPage, { scroll: false });
    }
    if (wheelEnd.applicable && !wheelEnd.reachable) problems.push(`${address} 1280x240: wheel cannot reach the last control (${wheelEnd.bottom} > ${wheelEnd.boundary})`);
    const end = await page.evaluate(readScrollEndInPage);
    if (end.applicable && !end.reachable) problems.push(`${address} 1280x240: J-101 last control is clipped (${end.bottom} > ${end.boundary})`);
  }
  await page.close();
}
await browser.close(); server.close();
if (problems.length) { console.error(`check-layout: ${problems.length} problem(s)\n${problems.join('\n')}`); process.exit(1); }
console.log(`check-layout: ok (${screens.length} screens, 2 widths, 2 themes)`);
