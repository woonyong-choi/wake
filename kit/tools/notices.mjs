#!/usr/bin/env node
/*
 * Third-party notices for a package: THIRD_PARTY_NOTICES.txt at the repository root, generated from what the package carries.
 *   node kit/tools/notices.mjs --app <id>           write the file
 *   node kit/tools/notices.mjs --app <id> --check   exit 1 when the file differs from what would be generated
 * Sources: every license or notice file under kit/vendor/<name>/, kit/icons/ and kit/fonts/, apps/<id>/desktop/vendor/*.LICENSE, the brand notice
 * apps/<id>/assets/brands/NOTICE.md, and the runtime node dependencies of kit/package.json (dependencies and optionalDependencies with
 * their locked dependencies from kit/package-lock.json: the license text from kit/node_modules when installed, else the locked license
 * name and a note that the text is added once installed). Electron and Chromium ship their own LICENSE and LICENSES.chromium.html in the app.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), app = args[args.indexOf('--app') + 1];
if (!app || args.indexOf('--app') < 0 || !existsSync(join(repo, 'apps', app))) { console.error('usage: node kit/tools/notices.mjs --app <id> [--check]'); process.exit(2); }
const out = join(repo, 'THIRD_PARTY_NOTICES.txt');
const read = p => readFileSync(join(repo, p), 'utf8').replace(/\r\n/g, '\n').trimEnd();
const files = dir => (existsSync(join(repo, dir)) ? readdirSync(join(repo, dir)).sort().filter(n => statSync(join(repo, dir, n)).isFile()) : []);
const LICENSE_FILE = /^(LICEN[SC]E|NOTICE|COPYING|OFL)(\.[a-z]+)?$|\.LICENSE$/i;

const sections = [];
const add = (title, body) => sections.push(`${'='.repeat(80)}\n${title}\n${'='.repeat(80)}\n\n${body}\n`);
for (const name of readdirSync(join(repo, 'kit/vendor')).sort()) {
  const dir = `kit/vendor/${name}`;
  for (const f of files(dir).filter(n => LICENSE_FILE.test(n))) add(`${name} (${dir}/${f})`, read(`${dir}/${f}`));
}
for (const f of files('kit/icons').filter(n => LICENSE_FILE.test(n))) add(`Icon glyphs in kit/icons and apps/*/glyphs.js (kit/icons/${f})`, read(`kit/icons/${f}`));
for (const f of files('kit/fonts').filter(n => LICENSE_FILE.test(n))) add(`Fonts in kit/fonts (${f})`, read(`kit/fonts/${f}`));
for (const d of readdirSync(join(repo, 'kit/fonts')).sort().filter(n => statSync(join(repo, 'kit/fonts', n)).isDirectory()))
  for (const f of files(`kit/fonts/${d}`).filter(n => LICENSE_FILE.test(n))) add(`${d} font (kit/fonts/${d}/${f})`, read(`kit/fonts/${d}/${f}`));
/* a license file a font stylesheet names must exist: a shipped font without its license text is a finding */
const missing = files('kit/fonts').filter(n => n.endsWith('.css')).flatMap(css => [...read(`kit/fonts/${css}`).matchAll(/([\w./-]*(?:OFL|LICENSE)[\w.-]*\.txt)/g)]
  .map(m => `kit/fonts/${m[1]}`)).filter(p => !existsSync(join(repo, p)));
for (const f of files(`apps/${app}/desktop/vendor`).filter(n => LICENSE_FILE.test(n))) add(`${f.replace(/\.LICENSE$/, '')} (apps/${app}/desktop/vendor/${f})`, read(`apps/${app}/desktop/vendor/${f}`));
if (existsSync(join(repo, `apps/${app}/assets/brands/NOTICE.md`))) add('Trademarks and brand marks', read(`apps/${app}/assets/brands/NOTICE.md`));

const kitPkg = JSON.parse(read('kit/package.json'));
const lock = existsSync(join(repo, 'kit/package-lock.json')) ? JSON.parse(read('kit/package-lock.json')).packages || {} : {};
const runtime = new Set(Object.keys({ ...kitPkg.dependencies, ...kitPkg.optionalDependencies }));
for (const [key, entry] of Object.entries(lock)) if (key && !entry.dev && runtime.has(key.replace(/^.*node_modules\//, ''))) for (const d of Object.keys(entry.dependencies || {})) runtime.add(d);
for (const name of [...runtime].sort()) {
  const entry = lock[`node_modules/${name}`] || {}, dir = `kit/node_modules/${name}`;
  const text = files(dir).filter(n => LICENSE_FILE.test(n)).map(f => read(`${dir}/${f}`)).join('\n\n');
  add(`${name} ${entry.version || ''} (node dependency, ${entry.license || 'license unknown'})`.replace('  ', ' '),
    text || `License: ${entry.license || 'unknown'}. The full license text is added when the dependency is installed (kit/node_modules).`);
}
add('Electron and Chromium', 'The packaged app includes Electron and Chromium. Their licenses ship inside the app (LICENSE and LICENSES.chromium.html).');

if (missing.length) { for (const p of new Set(missing)) console.error(`notices: ${p} is named by a font stylesheet but is missing (add the font's license text)`); process.exit(1); }
const text = `Third-party software notices\n\nThis product includes the third-party software listed below, each under its own license.\n\n${sections.join('\n')}`;
if (args.includes('--check')) {
  const fresh = existsSync(out) && readFileSync(out, 'utf8') === text;
  console[fresh ? 'log' : 'error'](fresh ? 'notices: ok' : 'notices: THIRD_PARTY_NOTICES.txt is out of date (node kit/tools/notices.mjs --app ' + app + ')');
  process.exit(fresh ? 0 : 1);
}
writeFileSync(out, text);
console.log(`notices: wrote ${out} (${sections.length} sections)`);
