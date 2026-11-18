#!/usr/bin/env node
/*
 * Unused and raw-value check. Exit code 1 on any finding. Run before every commit.
 *   node kit/tools/unused-check.mjs
 *
 * Rules:
 *  1. Raw values: px lengths other than 0px/1px and color literals (#hex, rgb(), hsl(), oklch()) appear only in
 *     kit/tokens.css and apps/<id>/theme.css. Comments are ignored. kit/tools, generated glyph files and Electron .cjs files are skipped.
 *     A line that only writes out a computed color is excused by its exact text in kit/tools/raw-allow.json; an entry matching no line or more than one is a problem.
 *  2. Every component file in kit/components is registered in components/index.js and used outside its own file
 *     (behavior-only components declare `export const hook = 'data-x'`; using that attribute counts). A test file is not a use.
 *  3. Every token defined in kit/tokens.css or an app theme.css is used somewhere (var(--x) or the '--x' string).
 *     A token is defined at most once per rule block (a second definition silently overrides the first).
 *  4. A class is given base styles (a selector that is the bare class, e.g. `.btn`; modifiers like `.btn.sm` are free) by one component only.
 *  5. Every relative reference (import, require, src, href, url()) resolves to an existing file.
 *  6. Every app locale key under the app prefix is used by the app (or by the root gallery pages): the whole key as written, or a key built
 *     at run time from a written prefix (`'prefix.' + x` or a template `prefix.${x}`). A test file is not a use.
 *  7. Every kit locale key is used outside the locale files (kit, apps or the root gallery pages), with the same two ways. A test file is not a use.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join, extname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rawValues } from './raw-values.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const rel = p => relative(repo, p).split(sep).join('/');
const TEXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html']);
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'vendor' || n.startsWith('.')) continue; // vendor: third-party code kept as published
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (TEXT.has(extname(n))) out.push(p);
  }
  return out;
}
const files = [...walk(join(repo, 'kit')), ...walk(join(repo, 'apps'))];
for (const extra of ['index.html', 'components.html', 'components.js', 'layouts.html', 'layouts.js']) if (existsSync(join(repo, extra))) files.push(join(repo, extra));
const src = new Map(files.map(f => [f, readFileSync(f, 'utf8')]));
const problems = [];
const isTest = f => /\.test\.[cm]?js$/.test(f);
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));

/* 1. raw values */
const RAW_SKIP = [/^kit\/tokens\.css$/, /^apps\/[^/]+\/theme\.css$/, /^kit\/tools\//, /glyphs\.js$/, /\.cjs$/]; // .cjs: Electron options, not styles
const rawAllow = JSON.parse(readFileSync(join(here, 'raw-allow.json'), 'utf8')), rawAllowHits = new Map(rawAllow.map(a => [a, 0]));
for (const [f, s] of src) {
  const r = rel(f);
  if (RAW_SKIP.some(x => x.test(r))) continue;
  stripComments(s).split('\n').forEach((line, i) => {
    const values = rawValues(line); if (!values.length) return;
    const entry = rawAllow.find(a => a.file === r && a.line === line.trim());
    if (entry) { rawAllowHits.set(entry, rawAllowHits.get(entry) + 1); return; }
    for (const value of values) problems.push(`${r}:${i + 1}: raw value "${value}" (use a token)`); // what is not raw: raw-values.mjs
  });
}
for (const [a, n] of rawAllowHits) if (n !== 1) problems.push(`kit/tools/raw-allow.json: ${a.file} entry matches ${n} raw line(s), not 1: ${a.line.slice(0, 60)}`);

/* 1b. corner radii come from the role tokens (kit/tokens.css: --r-surface, --r-panel, --r-dialog, --r-control, --r-control-sm, --r-row, --r-chip, --r-mark, --r-pill,
   --r-round, --r-window, --r-favicon): a border-radius is 0, inherit, one of them, a calc of them, or a component's own custom property that is set from them.
   The sim pages are checked too; the flow graph draws its tiles' corners in its own geometry. */
const RADIUS_SKIP = [/^kit\/tokens\.css$/, /^kit\/tools\//, /flow-graph\.js$/, /\.cjs$/];
const radiusFiles = [...files, ...readdirSync(repo).filter(n => /^sim.*\.(js|html)$/.test(n)).map(n => join(repo, n))];
for (const f of radiusFiles) {
  const r = rel(f); if (RADIUS_SKIP.some(x => x.test(r)) || /\.test\./.test(r)) continue;
  const s = src.get(f) ?? readFileSync(f, 'utf8');
  stripComments(s).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/border(?:-[a-z]+){0,2}-radius:\s*([^;}"`]+)/g)) {
      const v = m[1].trim(); if (v === '0' || v === 'inherit' || /^\$\{/.test(v)) continue;
      const names = [...v.matchAll(/var\(--([\w-]+)/g)].map(x => x[1]), rest = v.replace(/var\(--[\w-]+(,\s*0)?\)/g, ' ').replace(/calc\(|[()+*/-]|\b\d*\.?\d+\b(?![%a-z])/g, ' ').trim();
      if (!names.length || rest || names.some(n => !/^(r-[a-z-]+|surface-radius|frame-[lr])$/.test(n))) problems.push(`${r}:${i + 1}: border-radius "${v}" (use a role token --r-*)`);
    }
  });
}

/* 3a. a token defined twice in one rule block */
for (const f of [join(repo, 'kit/tokens.css'), ...files.filter(f => /apps\/[^/]+\/theme\.css$/.test(rel(f)))]) {
  const css = stripComments(src.get(f) || readFileSync(f, 'utf8'));
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const seen = new Set();
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:/g)) { if (seen.has(d[1])) problems.push(`${rel(f)}: ${d[1]} defined twice in "${m[1].trim().slice(0, 40)}"`); seen.add(d[1]); }
  }
}

/* 2. components registered and used */
const compDir = join(repo, 'kit/components');
const indexSrc = readFileSync(join(compDir, 'index.js'), 'utf8');
const camel = n => n.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
for (const n of readdirSync(compDir).filter(n => n.endsWith('.js') && n !== 'index.js')) {
  const id = basename(n, '.js');
  if (!indexSrc.includes(`./${n}`)) problems.push(`kit/components/${n}: not registered in components/index.js`);
  const own = readFileSync(join(compDir, n), 'utf8');
  const hook = (own.match(/export const hook = '([\w-]+)'/) || [])[1];
  const used = [...src].some(([f, s]) => f !== join(compDir, n) && f !== join(compDir, 'index.js') && !isTest(f) && (s.includes(`.${camel(id)}.`) || s.includes(`'./${n}'`) || s.includes(`"./${n}"`) || s.includes(`/${n}'`) || (hook && s.includes(hook))));
  if (!used) problems.push(`kit/components/${n}: not used outside its own file`);
}

/* 3. tokens used */
const tokenFiles = [join(repo, 'kit/tokens.css'), ...files.filter(f => /apps\/[^/]+\/theme\.css$/.test(rel(f)))];
const defined = new Map();
for (const f of tokenFiles) for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/(--[\w-]+)\s*:/g)) defined.set(m[1], rel(f));
const all = [...src.values()].map(stripComments).join('\n');
for (const [t, f] of defined) {
  const re = new RegExp(`var\\(\\s*${t.replace(/[-]/g, '\\-')}\\s*[,)]|['"\`]${t}['"\`]`);
  if (!re.test(all)) problems.push(`${f}: token ${t} is never used`);
}

/* 4. base styles for a class come from one component */
const owner = new Map();
for (const n of readdirSync(compDir).filter(n => n.endsWith('.js') && n !== 'index.js')) {
  const m = readFileSync(join(compDir, n), 'utf8').match(/export const css = `([\s\S]*?)`;/);
  if (!m) continue;
  const css = stripComments(m[1]).replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '');
  for (const rule of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (let sel of rule[1].split(',')) {
      sel = sel.trim().replace(/::?[\w-]+(\([^)]*\))?/g, '').replace(/\[[^\]]*\]/g, '');
      if (!sel || sel.startsWith('@')) continue;
      const parts = sel.split(/[\s>+~]+/).filter(Boolean);
      if (parts.length !== 1) continue;
      const cls = (parts[0].match(/^\.([\w-]+)$/) || [])[1];
      if (!cls) continue;
      const set = owner.get(cls) || new Set(); set.add(n); owner.set(cls, set);
    }
  }
}
for (const [cls, set] of owner) if (set.size > 1) problems.push(`class .${cls} gets base styles from several components: ${[...set].join(', ')}`);

/* 5. references resolve */
const local = s => (s.startsWith('./') || s.startsWith('../')) && !s.includes('${');
for (const [f, s] of src) {
  const refs = [];
  const ext = extname(f);
  const code = ext === '.html' ? s : stripComments(s);
  if (ext === '.html') for (const m of code.matchAll(/\s(?:src|href)="([^"]+)"/g)) refs.push(m[1]);
  for (const m of code.matchAll(/(?:from\s*|import\s*\(?\s*|require\(\s*)['"]([^'"]+)['"]/g)) refs.push(m[1]);
  for (const m of code.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) refs.push(m[1]);
  for (const r of refs) {
    if (!local(r)) continue;
    const p = resolve(dirname(f), r.split(/[?#]/)[0]);
    if (!existsSync(p)) problems.push(`${rel(f)}: reference ${r} does not exist`);
  }
}

/* 6. app locale keys used */
for (const id of existsSync(join(repo, 'apps')) ? readdirSync(join(repo, 'apps')) : []) {
  const loc = join(repo, 'apps', id, 'locale');
  if (!existsSync(loc)) continue;
  const appSrc = [...src].filter(([f]) => !isTest(f) && ((rel(f).startsWith(`apps/${id}/`) && !rel(f).startsWith(`apps/${id}/locale/`)) || !rel(f).includes('/'))).map(([, s]) => stripComments(s)).join('\n');
  for (const lf of readdirSync(loc)) {
    const s = readFileSync(join(loc, lf), 'utf8');
    for (const m of s.matchAll(new RegExp(`['"](${id}\\.[\\w.-]+)['"]\\s*:`, 'g'))) {
      const key = m[1];
      const parts = key.split('.');
      const prefixes = parts.slice(1).map((_, i) => parts.slice(0, i + 1).join('.') + '.');
      /* a key is used as written, or built from a written prefix: 'prefix.' + x, \`prefix.${x}\` (a bare 'app. prefix alone matches every key, so it does not count) */
      const built = p => appSrc.includes(`'${p}' +`) || appSrc.includes(`"${p}" +`) || new RegExp(`[\`'"]${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\$\\{`).test(appSrc);
      if (!new RegExp(`['"\`]${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`).test(appSrc) && !prefixes.some(built)) problems.push(`apps/${id}/locale/${lf}: key ${key} is never used`);
    }
  }
}

/* 7. kit locale keys used */
const kitLoc = join(repo, 'kit/locale');
if (existsSync(kitLoc)) {
  const useSrc = [...src].filter(([f]) => !/(^|\/)locale\//.test(rel(f)) && !isTest(f)).map(([, s]) => stripComments(s)).join('\n');
  for (const lf of readdirSync(kitLoc)) {
    for (const m of readFileSync(join(kitLoc, lf), 'utf8').matchAll(/^\s*['"]([\w.-]+)['"]\s*:/gm)) {
      const key = m[1];
      const parts = key.split('.');
      const prefixes = parts.slice(1).map((_, i) => parts.slice(0, i + 1).join('.') + '.');
      if (!useSrc.includes(`'${key}'`) && !useSrc.includes(`"${key}"`) && !useSrc.includes(`\`${key}\``) && !prefixes.some(p => useSrc.includes(`\`${p}\${`) || useSrc.includes(`'${p}' +`))) problems.push(`kit/locale/${lf}: key ${key} is never used`);
    }
  }
}

if (problems.length) { console.error(problems.join('\n')); console.error(`unused-check: ${problems.length} problem(s)`); process.exit(1); }
console.log(`unused-check: ok (${files.length} files, ${defined.size} tokens)`);
