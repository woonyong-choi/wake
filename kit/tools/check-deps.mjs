#!/usr/bin/env node
/*
 * Dependency and vocabulary check. Exit code 1 on any finding.
 *   node kit/tools/check-deps.mjs [--extra-terms-file <file>]
 *
 * Rules:
 *  1. kit never imports from apps (static import, dynamic import(), require(), HTML src/href).
 *  2. apps import kit only through public entries: kit/index.js, kit/page/index.js, kit/desktop/index.cjs,
 *     plus kit/locale/*.js (dictionaries), kit/*.css and kit/fonts/* from HTML.
 *  3. kit source contains no banned term (word boundary, case-insensitive, comments included).
 *     Terms = union of every app's `kitBannedTerms` in apps/<id>/app.config.js + lines of --extra-terms-file.
 *     Exceptions: kit/tools/banned-allow.json, a list of { "file": "kit/...", "term": "..." } (third-party files kept as published). The list itself
 *     is not scanned (it names the terms it excuses), and an entry that excuses nothing (no such file, or the term is not in it) is a finding.
 *  4. kit source contains no Hangul except kit/locale/ko.js (and language names, locale.name.<code>, in every kit dictionary).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bannedTerms } from './banned-terms.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const rel = p => relative(repo, p).split(sep).join('/');

const TEXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.md']);
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (TEXT.has(extname(n))) out.push(p);
  }
  return out;
}

const problems = [];
const kitFiles = walk(join(repo, 'kit'));
const appsDir = join(repo, 'apps');
const appIds = existsSync(appsDir) ? readdirSync(appsDir).filter(n => statSync(join(appsDir, n)).isDirectory()) : [];
const appFiles = appIds.flatMap(id => walk(join(appsDir, id)));

/* import specifiers: static, dynamic, require, export-from, HTML src/href */
function specifiers(file, src) {
  const out = [];
  const ext = extname(file);
  if (ext === '.html') {
    for (const m of src.matchAll(/\s(?:src|href)="([^"]+)"/g)) out.push(m[1]);
    for (const m of src.matchAll(/<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g)) out.push(...specifiers(file + '.js', m[1]));
    return out;
  }
  if (ext === '.css') { for (const m of src.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"]/g)) out.push(m[1] || m[2]); return out; }
  for (const m of src.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of src.matchAll(/(?:^|[\s;])import\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  for (const m of src.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}
const local = s => (s.startsWith('./') || s.startsWith('../') || s.startsWith('/')) && !s.startsWith('//');

const PUBLIC = [/^kit\/index\.js$/, /^kit\/page\/index\.js$/, /^kit\/desktop\/index\.cjs$/, /^kit\/locale\/[a-z-]+\.js$/];
const PUBLIC_HTML = [/^kit\/[a-z-]+\.css$/, /^kit\/fonts\//];

for (const f of kitFiles) {
  const src = readFileSync(f, 'utf8');
  for (const s of specifiers(f, src)) {
    if (!local(s)) continue;
    const target = rel(resolve(dirname(f), s.split(/[?#]/)[0]));
    if (target.startsWith('apps/')) problems.push(`${rel(f)}: kit imports app file ${target}`);
  }
}
for (const f of appFiles) {
  const src = readFileSync(f, 'utf8');
  for (const s of specifiers(f, src)) {
    if (!local(s)) continue;
    const target = rel(resolve(dirname(f), s.split(/[?#]/)[0]));
    if (!target.startsWith('kit/')) continue;
    const ok = PUBLIC.some(r => r.test(target)) || (extname(f) === '.html' && PUBLIC_HTML.some(r => r.test(target)));
    if (!ok) problems.push(`${rel(f)}: imports kit internal ${target} (use a public entry)`);
  }
}

/* banned terms */
const terms = new Set();
for (const id of appIds) {
  const cfg = join(appsDir, id, 'app.config.js');
  if (!existsSync(cfg)) continue;
  const m = readFileSync(cfg, 'utf8').match(/kitBannedTerms\s*:\s*\[([^\]]*)\]/);
  if (m) for (const t of m[1].matchAll(/['"]([^'"]+)['"]/g)) terms.add(t[1].toLowerCase());
}
const extra = opt('--extra-terms-file');
if (extra) for (const l of readFileSync(extra, 'utf8').split('\n')) if (l.trim()) terms.add(l.trim().toLowerCase());
const ALLOW_FILE = 'kit/tools/banned-allow.json';
const allow = existsSync(join(repo, ALLOW_FILE)) ? JSON.parse(readFileSync(join(repo, ALLOW_FILE), 'utf8')) : [];
const HANGUL = /[가-힣ㄱ-ㆎ]/;
const used = new Set();
for (const f of kitFiles) {
  const r = rel(f);
  if (r === 'kit/tools/check-deps.mjs' || r === ALLOW_FILE) continue;
  const text = readFileSync(f, 'utf8');
  const { findings, excused } = bannedTerms(r, text, terms, allow);
  problems.push(...findings); for (const a of excused) used.add(a);
  text.split('\n').forEach((line, i) => {
    // language names are written in their own script in every dictionary (locale.name.<code>)
    if (r !== 'kit/locale/ko.js' && HANGUL.test(line) && !(/^kit\/locale\//.test(r) && /^\s*'locale\.system'.*'locale\.name\./.test(line))) problems.push(`${r}:${i + 1}: Hangul outside kit/locale/ko.js`);
  });
}

for (const a of allow) if (!used.has(a)) problems.push(`${ALLOW_FILE}: ${JSON.stringify(a)} excuses nothing (remove it)`);

if (problems.length) { console.error(problems.join('\n')); console.error(`check-deps: ${problems.length} problem(s)`); process.exit(1); }
console.log(`check-deps: ok (${kitFiles.length} kit files, ${appFiles.length} app files, ${terms.size} banned terms)`);
