#!/usr/bin/env node
/*
 * Reuse check. Exit code 1 on any finding. Run before every commit.
 *   node kit/tools/check-reuse.mjs
 *
 * Apps only compose kit components from definitions:
 *  1. apps/** holds no CSS file except the app theme token file (apps/<id>/theme.css).
 *  2. apps/** HTML files are page skeletons only (html, head, meta, title, link, body, main, script and one mount element with only an id)
 *     with no style attribute or <style> block.
 *  3. apps/** scripts hold no inline style (a style attribute or style key), no style text (a css: string), and no HTML element markup in any
 *     string or template: screens are made of component render calls and definition data only. Generated glyph files and Electron
 *     main-process files are skipped.
 *  4. no class-bearing markup fragment repeats across apps/** files (the same UI implemented twice).
 * The kit implements each UI once:
 *  5. no two kit components render the same markup skeleton (tags and attribute names in order, four tags or more) in any template:
 *     a second component that draws the same structure must reuse the first.
 * UI quality gate (quality.mjs, rules in kit/QUALITY.md): icons from the kit set, motion from tokens, every clickable part with hover, press,
 * focus and disabled states, no raw error text on screens.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join, extname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qualityProblems } from './quality.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const rel = p => relative(repo, p).split(sep).join('/');
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const problems = [];

/* String and template literal contents of a script (comments skipped, regular expression literals skipped).
   Template parts between interpolations are returned as separate chunks; interpolations are scanned recursively. */
function literals(src) {
  const out = [];
  let i = 0, line = 1, prev = '';
  const n = src.length;
  const regexAllowed = () => /^(|[(,=:[!&|?{};+\-*%<>~^]|return|typeof|case|in|of)$/.test(prev);
  function readTemplate() { // at the char after the opening backtick
    let chunk = '', start = line, whole = '';
    const first = line;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { chunk += src.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { i++; out.push({ text: chunk, line: start }); out.push({ text: whole + chunk, line: first, whole: true }); return; }
      if (c === '$' && src[i + 1] === '{') { out.push({ text: chunk, line: start }); whole += chunk + '§'; chunk = ''; i += 2; readCode('}'); start = line; continue; }
      if (c === '\n') line++;
      chunk += c; i++;
    }
  }
  function readCode(end) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); line += (src.slice(i, j).match(/\n/g) || []).length; i = j < 0 ? n : j + 2; continue; }
      if (c === '"' || c === "'") {
        let s = '', start = line; i++;
        while (i < n && src[i] !== c) { if (src[i] === '\\') { s += src.slice(i, i + 2); i += 2; continue; } if (src[i] === '\n') line++; s += src[i++]; }
        i++; out.push({ text: s, line: start }); prev = 'str'; continue;
      }
      if (c === '`') { i++; readTemplate(); prev = 'str'; continue; }
      if (c === '/' && regexAllowed()) { // regular expression literal
        i++; let cls = false;
        while (i < n) { const d = src[i]; if (d === '\\') { i += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; else if (d === '\n') break; i++; }
        i++; while (/[a-z]/i.test(src[i] || '')) i++; prev = 're'; continue;
      }
      if (c === '{') depth++;
      if (c === '}') { if (end === '}' && depth === 0) { i++; return; } depth--; }
      if (/[\w$]/.test(c)) { let w = ''; while (i < n && /[\w$]/.test(src[i])) w += src[i++]; prev = w; continue; }
      prev = c; i++;
    }
  }
  readCode(null);
  return out;
}

const TAG = /<\/?([a-zA-Z][\w-]*)(\s[^<>]*)?\/?>|<([a-zA-Z][\w-]*)(?=[\s>])/g;
/* Skeleton of the markup in a literal: tag names with their attribute names, class values reduced to a count */
const skeleton = text => [...text.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^<>]*)>/g)].map(m => {
  const names = [...m[3].matchAll(/([\w:-]+)(?:=)/g)].map(a => a[1]).sort().join(',');
  return `<${m[1]}${m[2].toLowerCase()}${names ? ' ' + names : ''}>`;
}).join('');

/* ---------- apps ---------- */
const appFiles = walk(join(repo, 'apps'));
const fragments = new Map(); // fragment -> Set(files)
for (const f of appFiles) {
  const r = rel(f), ext = extname(f);
  if (ext === '.css') { if (!/^apps\/[^/]+\/theme\.css$/.test(r)) problems.push(`${r}: CSS file in an app (only theme.css holds the app's token values)`); continue; }
  const src = readFileSync(f, 'utf8');
  if (ext === '.html') {
    for (const m of src.matchAll(/<([a-zA-Z][\w-]*)([^>]*)>/g)) {
      const mount = /^(div|main)$/i.test(m[1]) && /^\s*id="[\w-]+"\s*$/.test(m[2]); // the element the shell or page mounts into
      if (!mount && !['html', 'head', 'meta', 'title', 'link', 'body', 'main', 'script'].includes(m[1].toLowerCase())) problems.push(`${r}: <${m[1]}> markup in a page file (pages draw from components)`);
      if (/\sstyle\s*=/.test(m[2])) problems.push(`${r}: style attribute`);
    }
    continue;
  }
  if (!['.js', '.mjs'].includes(ext) || basename(f).endsWith('glyphs.js')) continue; // glyph files (kit, app, brand marks) hold drawings, not markup
  for (const lit of literals(src).filter(l => !l.whole)) {
    const t = lit.text;
    if (/\bstyle\s*=/.test(t) && /</.test(t)) problems.push(`${r}:${lit.line}: inline style attribute`);
    if (/<\/?[a-zA-Z][\w-]*[\s>/]/.test(t)) problems.push(`${r}:${lit.line}: HTML markup "${t.trim().slice(0, 50)}" (compose kit components instead)`);
    for (const m of t.matchAll(/<[a-zA-Z][\w-]*[^<>]*\bclass="[^"]+"[^<>]*>(?:[^<>]*<[^<>]+>){1,}/g)) {
      const k = m[0].replace(/>[^<]+</g, '><');
      if (!fragments.has(k)) fragments.set(k, new Set()); fragments.get(k).add(r);
    }
  }
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  for (const m of code.matchAll(/\bstyle\s*:\s*['"`]/g)) problems.push(`${r}:${code.slice(0, m.index).split('\n').length}: inline style key`);
  for (const m of code.matchAll(/\bcss\s*:\s*`/g)) problems.push(`${r}:${code.slice(0, m.index).split('\n').length}: style text (css:) in an app script; styles belong to kit components and tokens`);
}
for (const [k, files] of fragments) if (files.size > 1) problems.push(`same markup in ${[...files].join(', ')}: ${k.slice(0, 80)}`);

/* ---------- kit components ---------- */
const seen = new Map(); // skeleton -> component file
const compDir = join(repo, 'kit/components');
for (const f of readdirSync(compDir).filter(n => n.endsWith('.js') && n !== 'index.js')) {
  const src = readFileSync(join(compDir, f), 'utf8');
  const mine = new Set();
  for (const lit of literals(src).filter(l => l.whole)) {
    const sk = skeleton(lit.text);
    if ((sk.match(/<[a-z]/g) || []).length < 4 || mine.has(sk)) continue;
    mine.add(sk);
    const other = seen.get(sk);
    if (other && other !== f) problems.push(`kit/components/${f}:${lit.line}: renders the same markup as kit/components/${other} (${sk.slice(0, 70)}…); reuse that component`);
    else seen.set(sk, f);
  }
}

problems.push(...qualityProblems({ repo, rel, walk }));
if (problems.length) { console.log(problems.join('\n')); console.log(`check-reuse: ${problems.length} problem(s)`); process.exit(1); }
console.log(`check-reuse: ok (${appFiles.length} app files, ${seen.size} component markup shapes)`);
