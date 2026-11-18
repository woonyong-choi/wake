#!/usr/bin/env node
/*
 * Locale check. Exit code 1 on any finding. Run before every commit.
 *   node kit/tools/check-locale.mjs
 *
 *  1. Every locale of a dictionary set has the same keys: kit/locale/*.js, and apps/<id>/locale/*.js for each app (a key missing in one
 *     locale fails, naming the locale).
 *  2. No user-visible literal outside the locale files, in kit (components, page, shell, core, desktop) and apps:
 *     - Hangul anywhere outside comments;
 *     - text fields of definitions and components written as plain words instead of a locale key
 *       (label, title, description, desc, placeholder, tip, empty, sub, question, primary, prompt: 'Words like this');
 *     - markup text and the aria-label, title and placeholder attributes written as plain words in html`` templates.
 *  3. The app glossary (apps/<id>/locale/glossary.js): one label per concept and language for the keys it lists; no avoided wording
 *     (the global AVOID list and each concept's avoid list) in the dictionaries, nor in the screen strings of the files the glossary
 *     names in SCREENS (prototype screens that keep their words outside the dictionaries). Literals that are values of RAW_FIELDS
 *     (logs, event messages, YAML, queries, commands) and regular expressions are original text and pass.
 *  4. No key reaches the screen untranslated: a key written in a text field (label, title, description, hint, cancel, …) exists in the
 *     dictionaries, and a var of { key, vars } is never a key as a plain string (a plain string var is shown as written: use { key }),
 *     neither written in the vars nor kept in a variable that the vars name.
 *  Domain terms the app declares as never translated (config.terms, e.g. column names and states of the tool it works with) pass, and so does the app's own name (config.name, the page <title>).
 *  Sample data (apps/<id>/data/) is content, not interface, and is left out; locale files, glyph and icon tables, kit/tools and
 *  Electron window options (.cjs) are left out. Unused keys are reported by unused-check.mjs (rules 6 and 7).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const rel = p => relative(repo, p).split(sep).join('/');
const problems = [];
const deferred = []; // checks that need the literal scanner below (run after it is defined)
const TERMS = new Set(); // app domain terms that stay in the original in every language (config.terms)
const names = new Set(); // app names (desktop config name): a product name is the same in every language

/* 1. key parity */
async function parity(dir) {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'glossary.js');
  const sets = {};
  for (const f of files) sets[f] = new Set(Object.keys((await import(pathToFileURL(join(dir, f)))).default));
  const all = new Set(Object.values(sets).flatMap(s => [...s]));
  for (const [f, s] of Object.entries(sets)) for (const k of all) if (!s.has(k)) problems.push(`${rel(join(dir, f))}: missing key ${k}`);
  return files;
}
const kitLocales = await parity(join(repo, 'kit/locale'));
/* every key of every dictionary (rule 4): kit keys for kit files, kit and the app's keys for an app's files */
const keysOf = async dir => existsSync(join(dir, 'en.js')) ? Object.keys((await import(pathToFileURL(join(dir, 'en.js')))).default) : [];
const KIT_KEYS = new Set(await keysOf(join(repo, 'kit/locale'))), APP_KEYS = {};
const apps = readdirSync(join(repo, 'apps')).filter(a => existsSync(join(repo, 'apps', a, 'app.config.js')));
for (const a of apps) {
  try { const c = (await import(pathToFileURL(join(repo, 'apps', a, 'desktop.config.cjs')))).default; if (c?.name) names.add(c.name); } catch { /* no desktop config */ }
  for (const w of (await import(pathToFileURL(join(repo, 'apps', a, 'app.config.js')))).default.terms || []) TERMS.add(w);
  const files = await parity(join(repo, 'apps', a, 'locale'));
  APP_KEYS[a] = new Set([...KIT_KEYS, ...await keysOf(join(repo, 'apps', a, 'locale'))]);
  for (const l of kitLocales) if (files && !files.includes(l)) problems.push(`apps/${a}/locale: no ${l} (the kit has it)`);
  await glossary(a);
}

/* 3. the app glossary (apps/<id>/locale/glossary.js): each concept has one label per language, every key listed for it carries exactly
   that label (same action, same words everywhere), and no dictionary text uses a word the glossary avoids */
async function glossary(a) {
  const g = join(repo, 'apps', a, 'locale', 'glossary.js'); if (!existsSync(g)) return;
  const { GLOSSARY = {}, AVOID = [] } = await import(pathToFileURL(g));
  const dict = {};
  for (const l of ['ko', 'en']) dict[l] = { ...(await import(pathToFileURL(join(repo, 'kit/locale', l + '.js')))).default, ...(existsSync(join(repo, 'apps', a, 'locale', l + '.js')) ? (await import(pathToFileURL(join(repo, 'apps', a, 'locale', l + '.js')))).default : {}) };
  for (const [c, e] of Object.entries(GLOSSARY)) for (const k of e.keys) for (const l of ['ko', 'en']) {
    if (!(k in dict[l])) problems.push(`apps/${a}/locale/glossary.js: ${c}: key ${k} not in ${l}`);
    else if (dict[l][k] !== e[l]) problems.push(`apps/${a}/locale/${l}.js: ${k} is "${dict[l][k]}", the glossary says "${e[l]}" (${c})`);
  }
  for (const [k, v] of Object.entries(dict.ko)) for (const w of AVOID) if (String(v).includes(w)) problems.push(`apps/${a}/locale/ko.js: ${k} uses "${w}" (avoided wording: see glossary.js)`);
  /* per-concept avoided wording: the dictionaries, and the screen strings of the files the glossary names (SCREENS) */
  const rules = avoidRules(GLOSSARY);
  for (const [k, v] of Object.entries(dict.ko)) for (const r of rules) { const hit = r.find(String(v)); if (hit && !AVOID.includes(hit)) problems.push(`apps/${a}/locale/ko.js: ${k} uses "${hit}" (${r.concept}: use "${r.use}")`); }
  const { SCREENS = [], RAW_FIELDS = [] } = await import(pathToFileURL(g));
  const all = [...rules, ...AVOID.map(w => ({ concept: 'AVOID', use: 'other wording, see glossary.js', find: s => (s.includes(w) ? w : null) }))];
  deferred.push(() => { const seen = new Set(); for (const f of screenFiles(SCREENS)) {
    const text = readFileSync(f, 'utf8');
    for (const lit of literals(strip(text), new Set(RAW_FIELDS))) for (const r of all) {
      const hit = r.find(lit.text); if (!hit) continue;
      const line = lit.line + lit.text.slice(0, lit.text.indexOf(hit)).split('\n').length - 1, id = `${rel(f)}:${line}:${hit}`;
      if (seen.has(id)) continue; seen.add(id);
      problems.push(`${rel(f)}:${line}: "${hit}" (${r.concept}: use "${r.use}")`);
    }
  } });
}
/* glossary avoid entries (string: contained, RegExp: matched) as finders that return the offending text */
function avoidRules(G) {
  const out = [];
  for (const [c, e] of Object.entries(G)) for (const w of e.avoid || []) out.push({ concept: c, use: e.ko, find: w instanceof RegExp ? s => { const m = new RegExp(w.source, w.flags.replace('g', '')).exec(s); return m ? m[0].replace(/^[^\uac00-\ud7a3\w]+/, '') || m[0] : null; } : s => (s.includes(w) ? w : null) });
  return out;
}
/* repo-root file names a glossary lists for screen strings kept outside the dictionaries ('*' within a file name) */
function screenFiles(patterns) {
  const out = new Set();
  for (const p of patterns) {
    const dir = join(repo, dirname(p)), re = new RegExp('^' + p.split('/').pop().replace(/[.+?^$()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    if (existsSync(dir)) for (const n of readdirSync(dir)) if (re.test(n) && !/\.test\.m?js$/.test(n)) out.add(join(dir, n));
  }
  return [...out];
}
/* string literals that carry Hangul, with the line they start on: quotes and template text (not the ${…} code inside it, which is
   scanned as code), regular-expression literals skipped, and a literal that is the value of a raw field (log, YAML, query, command) left out */
function literals(src, raw) {
  const out = [], n = src.length;
  let i = 0, line = 1, lastSig = '', lastWord = '';
  const prop = at => /(\w+)\s*:\s*$/.exec(src.slice(Math.max(0, at - 60), at))?.[1];
  const push = (text, at, l) => { if (HANGUL.test(text) && !raw.has(prop(at))) out.push({ text, line: l }); };
  const stack = []; // template nesting: brace depth of each open ${
  let depth = 0;
  const code = () => {
    const c = src[i];
    if (c === '\n') { line++; i++; return; }
    if (c === "'" || c === '"') {
      const at = i, l = line; let j = i + 1, s = '';
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') { s += src[j] + src[j + 1]; j += 2; continue; } s += src[j++]; }
      push(s, at, l); i = j + 1; lastSig = c; return;
    }
    if (c === '`') { i++; template(i - 1); return; }
    if (c === '/' && (/[(,=:[!&|?{};+\-*%<>~^]/.test(lastSig) || lastSig === '' || /^(return|typeof|case|in|of)$/.test(lastWord))) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') { const d = src[j]; if (d === '\\') { j += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; j++; }
      i = j + 1; while (/[a-z]/.test(src[i] || '')) i++; lastSig = '/'; return;
    }
    if (c === '{') depth++;
    if (c === '}') { if (stack.length && depth === stack[stack.length - 1]) { stack.pop(); depth--; i++; template(null); return; } depth--; }
    if (/\w/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; lastWord = src.slice(i, j); lastSig = 'w'; i = j; return; }
    if (!/\s/.test(c)) { lastSig = c; lastWord = ''; }
    i++;
  };
  /* a template part runs from here to the closing backtick or the next ${ */
  const template = open => {
    const at = open ?? i, l = line; let s = '';
    while (i < n) {
      const d = src[i];
      if (d === '\\') { s += d + src[i + 1]; i += 2; continue; }
      if (d === '`') { i++; push(s, at, l); lastSig = '`'; return; }
      if (d === '$' && src[i + 1] === '{') { push(s, at, l); i += 2; depth++; stack.push(depth); lastSig = '{'; return; }
      if (d === '\n') line++;
      s += d; i++;
    }
  };
  while (i < n) code();
  return out;
}

/* 2. literals */
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (['.js', '.mjs', '.html'].includes(extname(n))) out.push(p);
  }
  return out;
};
const lineOf = (s, i) => s.slice(0, i).split('\n').length;
const SKIP = [/\/locale\//, /^kit\/tools\//, /^apps\/[^/]+\/data\//, /glyphs\.js$/, /icon-map\.js$/, /base-map\.js$/, /^kit\/fonts\//];
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length)).replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
const HANGUL = /[\uac00-\ud7a3]/;
const KEY = /^[a-z][\w-]*(\.[\w-]+)+$/;
const words = v => !TERMS.has(v) && !names.has(v) && (/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(v) || /^[A-Z][a-z]{2,}$/.test(v));
const FIELD = /\b(label|title|description|desc|placeholder|tip|empty|sub|question|primary|prompt)\s*:\s*'([^'\\]*)'/g;
const ATTR = /\b(aria-label|title|placeholder)="([^"$]*)"/g;
const TEXT = />([^<>${}]*[A-Za-z]{2,}[^<>${}]*)</g;
const KEY_FIELD = /\b(label|title|description|desc|placeholder|tip|empty|hint|cancel|question|prompt)\s*:\s*'([a-z][\w-]*(?:\.[\w-]+)+)'/g;
for (const f of [...walk(join(repo, 'kit')), ...walk(join(repo, 'apps'))]) {
  const r = rel(f);
  if (SKIP.some(x => x.test(r))) continue;
  const src = strip(readFileSync(f, 'utf8')), lines = src.split('\n');
  /* 4. keys that would show untranslated */
  const app = /^apps\/([^/]+)\//.exec(r)?.[1], known = app ? APP_KEYS[app] : new Set([...KIT_KEYS, ...Object.values(APP_KEYS).flatMap(s => [...s])]);
  if (known) {
    const ns = new Set([...known].map(k => k.split('.')[0]));
    const isKey = v => KEY.test(v) && known.has(v), looksKey = v => KEY.test(v) && ns.has(v.split('.')[0]) && !/\.(js|mjs|cjs|json|yaml|yml|png|svg|com|io|dev)$/.test(v);
    lines.forEach((line, i) => { for (const m of line.matchAll(KEY_FIELD)) if (looksKey(m[2]) && !known.has(m[2])) problems.push(`${r}:${i + 1}: ${m[1]} '${m[2]}' has no translation (no such key)`); });
    for (const m of src.matchAll(/\bvars\s*:\s*\{([^{}]*)\}/g)) {
      const at = `${r}:${lineOf(src, m.index)}`;
      for (const v of m[1].split(',').map(x => x.trim()).filter(Boolean)) {
        const [name, val = name] = v.split(':').map(x => x.trim());
        const lit = /^'([^']*)'$/.exec(val)?.[1];
        if (lit != null) { if (isKey(lit)) problems.push(`${at}: var ${name} is the key '${lit}' as a plain string (shown untranslated: use { key: '${lit}' })`); continue; }
        if (!/^[A-Za-z_$][\w$]*$/.test(val)) continue;
        const def = new RegExp(`\\b(?:const|let|var)\\s+${val}\\s*=([^;\\n]*)`).exec(src)?.[1] || '';
        for (const k of def.matchAll(/(key\s*:\s*)?'([^']*)'/g)) if (!k[1] && isKey(k[2])) problems.push(`${at}: var ${name} can be the key '${k[2]}' as a plain string (shown untranslated: use { key: '${k[2]}' })`);
      }
    }
  }
  lines.forEach((line, i) => {
    const at = `${r}:${i + 1}`;
    if (HANGUL.test(line)) problems.push(`${at}: Hangul literal (use a locale key)`);
    for (const m of line.matchAll(FIELD)) if (!KEY.test(m[2]) && words(m[2])) problems.push(`${at}: ${m[1]} '${m[2]}' is a literal (use a locale key)`);
    if (!/html`|<\w/.test(line)) return;
    for (const m of line.matchAll(ATTR)) if (words(m[2])) problems.push(`${at}: ${m[1]}="${m[2]}" is a literal (use t())`);
    for (const m of line.matchAll(TEXT)) { const v = m[1].trim(); if (v && words(v) && !/[=;(){}]/.test(v)) problems.push(`${at}: markup text "${v.slice(0, 30)}" is a literal (use t())`); }
  });
}

for (const run of deferred) run();
if (problems.length) { for (const p of problems) console.error(p); console.error(`check-locale: ${problems.length} problem(s)`); process.exit(1); }
console.log(`check-locale: ok (kit ${kitLocales.join(', ')}; ${apps.map(a => a).join(', ')})`);
