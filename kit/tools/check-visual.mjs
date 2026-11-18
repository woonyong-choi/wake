#!/usr/bin/env node
/*
 * Visual regression check: renders the component gallery (components.html) in the browser host, dark and light, and compares every
 * gallery box with the committed baseline pictures in kit/tools/visual-baseline/. Controls are also captured with their states forced
 * (hover, focus-visible, active); a tooltip is captured open. Time is fixed and motion is off, so a picture only changes when the look does.
 *
 *   node kit/tools/check-visual.mjs            compare (fails on any picture that differs, is missing or is new)
 *   node kit/tools/check-visual.mjs --update   write the current pictures as the baseline (commit them with the reason in the body)
 *   node kit/tools/check-visual.mjs --root <dir> --out <dir>   render another tree (a baseline from an earlier commit) into <dir>
 *
 * A pixel differs when a channel moves more than TOLERANCE; a picture differs when more than MAX_PIXELS pixels do or its size changed.
 * Baselines are rendered on the check machine (Linux Chromium); a different machine's fonts give different pictures.
 * Needs playwright-core (NODE_PATH) and Chromium, like check.mjs.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, extname, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { console.error('playwright-core not found (set NODE_PATH)'); process.exit(2); }

const here = dirname(fileURLToPath(import.meta.url));
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const root = resolve(arg('--root') || join(here, '../..'));
const baseDir = join(here, 'visual-baseline');
const update = process.argv.includes('--update');
const out = arg('--out') ? resolve(arg('--out')) : update ? baseDir : null;
const TOLERANCE = 24, MAX_PIXELS = 12, FIXED_TIME = new Date('2026-10-29T09:41:00+09:00');
const STATES = ['hover', 'focus-visible', 'active'];
const CONTROLS = '.btn, .ib, .tbb, .inp, .si, .slt, .sw, .chk, .rdo, .seg, .snav-i, .sb-row, .mi, .pill, .utab, .acc-trigger, .dt-open';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

/* PNG decode (8-bit RGB/RGBA, no interlace: what Chromium writes) to compare pixels without another library */
function decode(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } else if (type === 'IDAT') idat.push(d); p += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = px.subarray(y * stride, (y + 1) * stride), prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? row[x - bpp] : 0, b = prev ? prev[x] : 0, c = prev && x >= bpp ? prev[x - bpp] : 0; let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      row[x] = v & 255; } }
  return { w, h, bpp, px };
}
function differ(a, b) {
  const A = decode(a), B = decode(b);
  if (A.w !== B.w || A.h !== B.h) return { size: `${A.w}x${A.h} -> ${B.w}x${B.h}` };
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) { const i = (y * A.w + x) * A.bpp, j = (y * B.w + x) * B.bpp;
    if (Math.max(Math.abs(A.px[i] - B.px[j]), Math.abs(A.px[i + 1] - B.px[j + 1]), Math.abs(A.px[i + 2] - B.px[j + 2])) > TOLERANCE) { n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } }
  return n > MAX_PIXELS ? { pixels: n, box: [x0, y0, x1, y1] } : null;
}

const shots = new Map(); // name -> png buffer
const browser = await chromium.launch();
for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' }));
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.goto(`${base}/components.html`); await page.waitForTimeout(1200);
  await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
  await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(600);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const boxes = page.locator('.g-box'), count = await boxes.count(), seen = new Map();
  for (let i = 0; i < count; i++) {
    const box = boxes.nth(i);
    const label = ((await box.locator('.g-l').first().textContent().catch(() => '')) || 'box').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'box';
    const k = seen.get(label) || 0; seen.set(label, k + 1);
    const name = `${theme}-${label}${k ? '-' + k : ''}`;
    await box.scrollIntoViewIfNeeded();
    shots.set(name, await box.screenshot());
    /* the same box with every control in it held in each state */
    const { root: doc } = await cdp.send('DOM.getDocument', { depth: 0 });
    const boxNode = (await cdp.send('DOM.querySelectorAll', { nodeId: doc.nodeId, selector: '.g-box' })).nodeIds[i];
    const controls = (await cdp.send('DOM.querySelectorAll', { nodeId: boxNode, selector: CONTROLS })).nodeIds;
    if (!controls.length) continue;
    for (const state of STATES) {
      for (const nodeId of controls) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [state] });
      shots.set(`${name}--${state}`, await box.screenshot());
      for (const nodeId of controls) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    }
  }
  /* a tooltip open over its control */
  const tip = page.locator('.g-box [data-tip]').first();
  if (await tip.count()) {
    await tip.scrollIntoViewIfNeeded(); await tip.hover(); await page.waitForTimeout(1500);
    const t = await page.locator('.tip').first().boundingBox().catch(() => null), c = await tip.boundingBox();
    if (t && c) { const x = Math.floor(Math.min(t.x, c.x) - 8), y = Math.floor(Math.min(t.y, c.y) - 8);
      shots.set(`${theme}-tooltip-open`, await page.screenshot({ clip: { x, y, width: Math.ceil(Math.max(t.x + t.width, c.x + c.width) + 8 - x), height: Math.ceil(Math.max(t.y + t.height, c.y + c.height) + 8 - y) } })); }
  }
  await page.close();
}
await browser.close(); server.close();

if (out) {
  if (out === baseDir && existsSync(out)) rmSync(out, { recursive: true });
  mkdirSync(out, { recursive: true });
  for (const [name, png] of shots) writeFileSync(join(out, `${name}.png`), png);
  console.log(`check-visual: wrote ${shots.size} pictures to ${out}`);
  process.exit(0);
}
const have = existsSync(baseDir) ? new Set(readdirSync(baseDir).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4))) : new Set();
const problems = [];
for (const [name, png] of shots) {
  if (!have.has(name)) { problems.push(`${name}: new picture (no baseline)`); continue; }
  const d = differ(readFileSync(join(baseDir, `${name}.png`)), png);
  if (d) problems.push(`${name}: ${d.size ? `size ${d.size}` : `${d.pixels} pixels differ in ${d.box.join(',')}`}`);
}
for (const name of have) if (!shots.has(name)) problems.push(`${name}: baseline without a picture (removed)`);
if (problems.length) { console.error(`check-visual: ${problems.length} problem(s)\n` + problems.join('\n')); process.exit(1); }
console.log(`check-visual: ok (${shots.size} pictures)`);
