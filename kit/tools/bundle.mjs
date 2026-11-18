#!/usr/bin/env node
/*
 * Single-file bundle: packs the app shell HTML and tab page HTML with ES modules, CSS and fonts into one HTML (preview, sharing).
 *   node kit/tools/bundle.mjs <html file> <output file> [--pages <pages folder>]
 * Tab pages go into window.__KIT_PAGES[name] as HTML strings; the browser host opens them as iframe srcdoc.
 * Fonts split by unicode-range keep only the parts the document's characters need.
 * Modules become a small registry (__kitModules). Supported syntax: import name / * as / default, export const, let, function, class, default, export { } from.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname, basename } from 'node:path';

const MIME = { '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml' };

function bundleModules(entry) {
  const mods = new Map();
  const order = [];
  const visit = file => {
    if (mods.has(file)) return;
    mods.set(file, null);
    let src = readFileSync(file, 'utf8');
    const deps = [];
    const req = spec => { const p = resolve(dirname(file), spec); deps.push(p); return JSON.stringify(p); };
    const names = [];
    // import ... from '...'
    src = src.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm, (_, what, spec) => {
      const r = `__req(${req(spec)})`;
      what = what.trim();
      if (what.startsWith('* as ')) return `const ${what.slice(5)} = ${r};`;
      const parts = [];
      const m = what.match(/^([\w$]+)?\s*,?\s*(\{[\s\S]*\})?$/);
      if (m && m[1]) parts.push(`const ${m[1]} = ${r}.default;`);
      if (m && m[2]) parts.push(`const ${m[2].replace(/\s+as\s+/g, ': ')} = ${r};`);
      return parts.join(' ');
    });
    // export { a, b as c } from '...'
    src = src.replace(/^export\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"];?/gm, (_, list, spec) => {
      const r = req(spec);
      return list.split(',').map(x => x.trim()).filter(Boolean).map(x => { const [a, b] = x.split(/\s+as\s+/); return `Object.defineProperty(__exports, ${JSON.stringify(b || a)}, { enumerable: true, get: () => __req(${r})[${JSON.stringify(a)}] });`; }).join('\n');
    });
    src = src.replace(/^export\s+default\s+/gm, '__exports.default = ');
    src = src.replace(/^export\s+(async\s+function|function|class|const|let)\s+([\w$]+)/gm, (_, kw, name) => { names.push(name); return `${kw} ${name}`; });
    src = src.replace(/^export\s+\{([^}]*)\};?/gm, (_, list) => list.split(',').map(x => x.trim()).filter(Boolean).map(x => { const [a, b] = x.split(/\s+as\s+/); return `Object.defineProperty(__exports, ${JSON.stringify(b || a)}, { enumerable: true, get: () => ${a} });`; }).join('\n'));
    if (/import\(|\bimport\.meta\b/.test(src)) throw new Error(`${file}: dynamic import is not supported by the bundler`);
    const exp = names.map(n => `Object.defineProperty(__exports, ${JSON.stringify(n)}, { enumerable: true, get: () => ${n} });`).join('\n');
    deps.forEach(visit);
    mods.set(file, `__kitDefine(${JSON.stringify(file)}, async (__exports, __req) => {\n${exp}\n${src}\n});`);
    order.push(file);
  };
  visit(resolve(entry));
  const loader = `const __kitDefs = new Map(), __kitCache = new Map();
function __kitDefine(id, fn) { __kitDefs.set(id, fn); }
function __req(id) { if (!__kitCache.has(id)) throw new Error('module not ready: ' + id); return __kitCache.get(id); }
async function __kitRun(order) { for (const id of order) { const ex = {}; __kitCache.set(id, ex); await __kitDefs.get(id)(ex, __req); } }`;
  return `${loader}\n${order.map(f => mods.get(f)).join('\n')}\n__kitRun(${JSON.stringify(order)}).catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', '<pre style="color:red">' + String(e && e.stack || e) + '</pre>'); });`;
}

/* Characters a document can show: its own text and sources, plus date and time words of its language (Intl output). */
function documentChars(text, lang) {
  const chars = new Set();
  for (const ch of text) chars.add(ch.codePointAt(0));
  const add = str => { for (const ch of str) chars.add(ch.codePointAt(0)); };
  const opts = [{ dateStyle: 'full', timeStyle: 'long' }, { month: 'long' }, { month: 'short' }, { weekday: 'long' }, { weekday: 'short' }, { hour: 'numeric', minute: 'numeric' }];
  for (let m = 0; m < 12; m++) for (let d = 1; d <= 7; d++) for (const o of opts) add(new Intl.DateTimeFormat(lang, o).format(new Date(2026, m, d, m * 2, 30)));
  for (const u of ['second', 'minute', 'hour', 'day', 'week', 'month', 'year']) for (const n of [-2, -1, 1, 2]) add(new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(n, u));
  return chars;
}

const inRange = (range, chars) => range.split(',').some(part => {
  const [a, b] = part.trim().replace(/^U\+/i, '').split('-').map(h => parseInt(h.replace(/\?/g, '0'), 16));
  for (const c of chars) if (c >= a && c <= (b ?? a)) return true;
  return false;
});

/* Inline url() files as data URLs. @font-face rules whose unicode-range misses every character of the document are left out. */
function inlineCss(file, chars) {
  let css = readFileSync(file, 'utf8');
  if (chars) css = css.replace(/@font-face\s*\{[^}]*\}\n?/g, rule => { const m = rule.match(/unicode-range:\s*([^;}]+)/); return !m || inRange(m[1], chars) ? rule : ''; });
  return css.replace(/url\(([^)]+)\)/g, (m, u) => {
    u = u.replace(/['"]/g, '');
    if (u.startsWith('data:') || /^https?:/.test(u)) return m;
    const p = resolve(dirname(file), u);
    return `url(data:${MIME[extname(p)] || 'application/octet-stream'};base64,${readFileSync(p).toString('base64')})`;
  });
}

export function bundleHtml(htmlFile, extraHead = '') {
  let html = readFileSync(htmlFile, 'utf8');
  const dir = dirname(htmlFile);
  html = html.replace(/<script type="module" src="([^"]+)"><\/script>/g, (_, src) => `<script type="module">${bundleModules(resolve(dir, src)).replace(/<\/script/g, '<\\/script')}</script>`);
  const chars = documentChars(html, (html.match(/<html[^>]*\blang="([^"]+)"/) || [])[1] || 'en');
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>${inlineCss(resolve(dir, href), chars)}</style>`); // function replacement keeps $ characters intact
  // insert after the meta charset so the head is not read in another encoding
  return html.replace(/<meta charset="utf-8">/i, m => m + extraHead);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const [inFile, outFile] = process.argv.slice(2);
  const pi = process.argv.indexOf('--pages');
  let head = '';
  if (pi > 0) {
    const pdir = resolve(process.argv[pi + 1]);
    const pages = {};
    for (const f of readdirSync(pdir).filter(f => f.endsWith('.html'))) pages[basename(f, '.html')] = bundleHtml(resolve(pdir, f));
    head = `<script>window.__KIT_PAGES = ${JSON.stringify(pages).replace(/<\/script/g, '<\\/script')};</script>`;
  }
  const out = bundleHtml(resolve(inFile), head);
  writeFileSync(outFile, out);
  console.log(`${outFile}: ${(out.length / 1024).toFixed(0)} KB`);
}
