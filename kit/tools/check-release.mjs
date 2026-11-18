#!/usr/bin/env node
/*
 * Release check: every debug-only aid is reachable only through kit/desktop/debug.cjs, that module is loaded only by a development run,
 * and release packaging leaves it out. Exit code 1 on any finding. Run before every commit and before packaging.
 *   node kit/tools/check-release.mjs
 *
 * Debug-only entry points (listed on every run):
 *  - the diagnostic log and calibration backdrop (KIT_DESKTOP_DIAG, KIT_DESKTOP_BACKDROP environment variables)
 *  - the native material probes (materialInfo, tuneMaterial)
 *  - the View menu debug items: Developer Tools, Emulate Reduced Motion, Show First Run Again (desktop.menu.devtools, desktop.menu.reducedMotion, desktop.menu.firstRun)
 * Checks:
 *  1. No file in kit or apps other than debug.cjs names an entry point (kit/tools, locale files and the native source that defines the probes excepted).
 *  2. kit/desktop/main.cjs requires debug.cjs once, behind app.isPackaged.
 *  3. kit/desktop/release.cjs ignore patterns leave debug.cjs out of a package.
 *  4. No app definition reaches the first-run reopen action (kit.firstRun.open) from a screen; finished apps have no entry for it.
 *  5. kit/desktop/release.cjs keeps the hardening a package must have: RunAsNode, NODE_OPTIONS and the inspect arguments off, cookie
 *     encryption, archive integrity validation and archive-only loading on; the only entitlement is JIT.
 *  6. kit/desktop/native.cjs never compiles at run time (the helper is built and signed at package time, kit/tools/build-native.mjs).
 * The packaging check itself (bundle id, metadata, notices, credentials, no Electron-as-Node use) is node kit/tools/package.mjs --app <id> --check.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const rel = p => relative(repo, p).split(sep).join('/');
const TEXT = new Set(['.js', '.mjs', '.cjs', '.html']);
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (TEXT.has(extname(n))) out.push(p);
  }
  return out;
};
const ENTRY = [
  ['diagnostic log', /KIT_DESKTOP_DIAG/], ['calibration backdrop', /KIT_DESKTOP_BACKDROP/],
  ['native material probe', /\b(materialInfo|tuneMaterial)\b/], ['developer tools', /toggleDevTools|desktop\.menu\.devtools/],
  ['first-run reopen menu', /desktop\.menu\.firstRun/], ['reduced motion emulation', /desktop\.menu\.reducedMotion|setEmulatedMedia/],
];
const DEBUG_FILE = 'debug.cjs';
const DEBUG = 'kit/desktop/' + DEBUG_FILE;
const SKIP = [/^kit\/tools\//, /^kit\/locale\//, /^apps\/[^/]+\/locale\//];
const problems = [];
for (const f of [...walk(join(repo, 'kit')), ...walk(join(repo, 'apps'))]) {
  const r = rel(f);
  if (r === DEBUG || SKIP.some(x => x.test(r))) continue;
  const s = readFileSync(f, 'utf8');
  for (const [name, re] of ENTRY) if (re.test(s)) problems.push(`${r}: reaches the ${name} outside ${DEBUG}`);
  if (/^apps\//.test(r) && /['"]kit\.firstRun\.open['"]/.test(s)) problems.push(`${r}: an app screen reaches kit.firstRun.open (development menu only)`);
}
const main = readFileSync(join(repo, 'kit/desktop/main.cjs'), 'utf8');
const req = main.split('\n').filter(l => l.includes(`require('./${DEBUG_FILE}')`));
if (req.length !== 1) problems.push(`kit/desktop/main.cjs: requires debug.cjs ${req.length} times (expected once)`);
else if (!new RegExp(`app\\.isPackaged[^?]*\\?\\s*null\\s*:\\s*require\\('\\./${DEBUG_FILE.replace('.', '\\.')}'\\)`).test(req[0])) problems.push('kit/desktop/main.cjs: debug.cjs is not behind app.isPackaged');
const { ignore, REQUIRED_FUSES, ENTITLEMENTS } = createRequire(import.meta.url)(join(repo, 'kit/desktop/release.cjs'));
const HARDENED = { runAsNode: false, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false, enableCookieEncryption: true, enableEmbeddedAsarIntegrityValidation: true, onlyLoadAppFromAsar: true };
for (const [k, v] of Object.entries(HARDENED)) if (REQUIRED_FUSES?.[k] !== v) problems.push(`kit/desktop/release.cjs: fuse ${k} must be ${v ? 'on' : 'off'}`);
if (JSON.stringify(ENTITLEMENTS) !== JSON.stringify(['com.apple.security.cs.allow-jit'])) problems.push('kit/desktop/release.cjs: entitlements beyond JIT');
if (/xcrun|clang|child_process/.test(readFileSync(join(repo, 'kit/desktop/native.cjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))) problems.push('kit/desktop/native.cjs: compiles at run time');
if (!ignore.some(re => re.test('/' + DEBUG))) problems.push(`kit/desktop/release.cjs: ${DEBUG} is not left out of a package`);

console.log(`debug-only entry points (only in ${DEBUG}): ${ENTRY.map(e => e[0]).join(', ')}`);
if (problems.length) { for (const p of problems) console.error(p); process.exit(1); }
console.log('check-release: ok');
