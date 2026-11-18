#!/usr/bin/env node
/*
 * Brand color check: lists every element drawn in the brand color (--brand, --brand-content or a mix of them: text, fill, border, ring,
 * SVG fill or stroke) on every route, the first-run steps and the open menus, in dark and light, so each use is a deliberate one.
 * Exit code 1 when an element outside the allowlist below takes the brand color.
 *   node kit/tools/check-brand.mjs --app <id> [--list]
 * Needs playwright-core (NODE_PATH) and Chromium (CHROMIUM_PATH or the playwright default).
 *
 * Allowlist (where the reference app uses its brand color, read from its bundle classes):
 *  - .badge.brand    'New' and recommended badges (text-brand-content on brand/10)
 *  - .badge.tag      plan tag (bg-brand)
 *  - .fr-tile-check  the check on a chosen first-run tile (text-brand, top 10 right 10, 16)
 *  - .chc-pic        the ring on a chosen choice card (brand 30%)
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const appId = opt('--app');
if (!appId) { console.error('usage: check-brand.mjs --app <id> [--list]'); process.exit(2); }
const list = args.includes('--list');
let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright-core')); } catch { console.error('playwright-core not found (set NODE_PATH)'); process.exit(2); }

const ALLOW = ['badge brand', 'badge tag', 'fr-tile-check', 'chc-pic'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = resolve(repo, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(repo) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const config = (await import(pathToFileURL(join(repo, 'apps', appId, 'app.config.js')))).default;

/* elements whose computed colors contain the brand hue: compared with the resolved --brand and --brand-content colors (any alpha) */
const scan = frame => frame.evaluate(allow => {
  const probe = v => { const el = document.createElement('i'); el.style.color = `var(${v})`; document.body.appendChild(el); const c = getComputedStyle(el).color; el.remove(); return c; };
  const rgb = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const brands = ['--brand', '--brand-content'].map(probe).map(rgb);
  const near = c => { const x = rgb(c); if (x.length < 3 || /\/ 0\)|, 0\)$/.test(c)) return false; return brands.some(b => Math.abs(b[0] - x[0]) + Math.abs(b[1] - x[1]) + Math.abs(b[2] - x[2]) < 6); };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.offsetParent === null && el.tagName !== 'svg' && !el.closest('svg')) continue;
    const cs = getComputedStyle(el);
    const hit = [['text', el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) ? cs.color : ''], ['fill', cs.backgroundColor], ['border', cs.borderTopWidth !== '0px' ? cs.borderTopColor : ''],
      ['ring', cs.boxShadow], ['svg', el.closest('svg') ? cs.fill + ' ' + cs.stroke : '']].filter(([, v]) => v && (v.match(/rgba?\([^)]*\)|color\([^)]*\)|oklch\([^)]*\)/g) || []).some(near));
    if (!hit.length) continue;
    const owner = el.closest('[class]');
    const cls = (owner?.className?.baseVal ?? owner?.className ?? '').toString();
    const allowed = allow.some(a => { const want = a.split(' '); let n = el; while (n && n !== document.body) { const c = (n.className?.baseVal ?? n.className ?? '').toString().split(/\s+/); if (want.every(w => c.includes(w))) return true; n = n.parentElement; } return false; });
    out.push({ what: hit.map(h => h[0]).join('+'), cls: cls.slice(0, 60), text: (el.textContent || '').trim().slice(0, 24), allowed });
  }
  return out;
}, ALLOW);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const found = [];
const note = (where, rows) => { for (const r of rows) found.push({ where, ...r }); };
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(([id, th]) => { try { localStorage.setItem(id + ':settings', JSON.stringify({ 'kit.theme': th, 'kit.firstRun.done': false })); } catch { /* none */ } }, [appId, theme]);
  await page.goto(`${base}/apps/${appId}/index.html`); await page.waitForTimeout(1500);
  for (let i = 0; i < 12 && await page.$('[data-first-run] *'); i++) {
    note(`${theme} first-run ${i + 1}`, await scan(page.mainFrame()));
    // a step's primary button may wait for its work (checks) before it is enabled
    const sel = '[data-first-run] .fr-next .btn:not([disabled]), [data-first-run] .fr-left-foot .btn, [data-first-run] .fr-foot .btn:last-child:not([disabled])';
    const btn = await page.waitForSelector(sel, { timeout: 8000 }).catch(() => null);
    if (!btn) break;
    await btn.click().catch(() => {}); await page.waitForTimeout(400);
  }
  note(`${theme} shell`, await scan(page.mainFrame()));
  const examples = config.examples?.params || {};
  for (const r of config.routes) {
    const params = examples[r.id]; if (!params) continue;
    const path = r.pattern.split('/').map(s => s.startsWith(':') ? encodeURIComponent(params[s.slice(1)]) : s).join('/');
    await page.addInitScript(([id, th]) => { try { localStorage.setItem(id + ':settings', JSON.stringify({ 'kit.theme': th, 'kit.firstRun.done': true })); } catch { /* none */ } }, [appId, theme]);
    const fr = await (await page.goto(`${base}/apps/${appId}/pages/${r.page}.html?a=${encodeURIComponent(`${config.scheme}://${path}`)}`)).frame();
    await fr.evaluate(th => { document.documentElement.dataset.theme = th; }, theme);
    await page.waitForTimeout(600);
    note(`${theme} page ${r.id}`, await scan(fr));
  }
  await page.close();
}
await browser.close(); server.close();

const bad = found.filter(f => !f.allowed);
if (list || bad.length) for (const f of (list ? found : bad)) console.log(`${f.allowed ? 'allowed' : 'NOT ALLOWED'}  ${f.where}  ${f.what}  .${f.cls.replace(/\s+/g, '.')}  "${f.text}"`);
console.log(`check-brand: ${found.length} brand-colored element(s), ${bad.length} outside the allowlist`);
process.exit(bad.length ? 1 : 0);
