#!/usr/bin/env node
/*
 * Package an app for release (electron-builder, pinned in kit/package.json devDependencies). Stops before building on any packaging problem.
 *   node kit/tools/package.mjs --app <id> --check     packaging check only (exit 1 on a finding): bundle id, metadata, allow-list, native helper,
 *                                                     license and third-party notices; with --release also signing and notarization credentials
 *   node kit/tools/package.mjs --app <id> [--release] stage the allow-listed runtime files into .local/package/<id>/app with a generated
 *                                                     package.json and the runtime node modules (copied from kit/node_modules as locked),
 *                                                     then run electron-builder (macOS dmg and zip; it rebuilds node-pty for the app's Electron)
 *                                                     and read the built app back: every required fuse, the archive holds only the
 *                                                     allow-list, the unpacked native helper and node-pty binary. Needs a signing identity
 *   node kit/tools/package.mjs --app <id> --unsigned  the same package for a local test on this computer: never signed or notarized (even with
 *                                                     credentials in the environment), same fuses, archive and integrity; not for customers
 *                                                     (Gatekeeper refuses it on another computer). Not combined with --release
 * Before the first run: node kit/tools/build-native.mjs, node kit/tools/notices.mjs --app <id>, and the builder installed
 * (cd kit && npm install --save-dev --save-exact electron-builder@<version in kit/package.json>; needs the network).
 * Signing identity and notarization credentials come only from the environment (see kit/desktop/release.cjs).
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const release = require(join(repo, 'kit/desktop/release.cjs'));
const args = process.argv.slice(2), app = args[args.indexOf('--app') + 1];
const isRelease = args.includes('--release'), isUnsigned = args.includes('--unsigned');
if (args.indexOf('--app') < 0 || !app || !existsSync(join(repo, 'apps', app, 'package.json')) || (isRelease && isUnsigned)) {
  console.error('usage: node kit/tools/package.mjs --app <id> [--check] [--release | --unsigned]'); process.exit(2);
}
const pkg = JSON.parse(readFileSync(join(repo, 'apps', app, 'package.json'), 'utf8'));
const desktop = require(join(repo, 'apps', app, 'desktop.config.cjs'));
const kitPkg = JSON.parse(readFileSync(join(repo, 'kit/package.json'), 'utf8'));
const files = release.runtimeFiles(repo, app);
const noticesFresh = spawnSync(process.execPath, [join(repo, 'kit/tools/notices.mjs'), '--app', app, '--check'], { stdio: 'ignore' }).status === 0;
const problems = release.packageProblems({ repo, app, pkg, desktop, files, release: isRelease, noticesFresh });
if (!kitPkg.devDependencies?.['electron-builder'] || !/^\d+\.\d+\.\d+$/.test(kitPkg.devDependencies['electron-builder'])) problems.push('kit/package.json pins no exact electron-builder version');
console.log(`package: ${app} ${pkg.version}, ${files.length} runtime files, bundle id ${desktop.bundleId ?? '(not set)'}${isRelease ? ', release' : ''}${isUnsigned ? ', unsigned' : ''}`);
if (problems.length) { for (const p of problems) console.error(`package: ${p}`); process.exit(1); }
if (args.includes('--check')) { console.log('package: check ok'); process.exit(0); }

/* the runtime node modules with their locked dependencies (as kit/tools/notices.mjs lists them), copied as installed */
const lock = JSON.parse(readFileSync(join(repo, 'kit/package-lock.json'), 'utf8')).packages || {};
const modules = new Set(Object.keys({ ...kitPkg.dependencies, ...kitPkg.optionalDependencies }));
for (const [key, entry] of Object.entries(lock)) if (key && !entry.dev && modules.has(key.replace(/^.*node_modules\//, ''))) for (const d of Object.keys(entry.dependencies || {})) modules.add(d);
for (const m of modules) if (!existsSync(join(repo, 'kit/node_modules', m, 'package.json'))) { console.error(`package: ${m} is not installed (cd kit && npm ci)`); process.exit(2); }
/* not carried from a module: other platforms' prebuilt binaries, Windows-only sources, its tests and source maps */
const moduleFile = p => !/\/prebuilds\/(?!darwin-)[^/]+(\/|$)|\/deps\/winpty(\/|$)|\.test\.js(\.map)?$|\.js\.map$/.test(p);

const builder = join(repo, 'kit/node_modules/.bin/electron-builder');
if (!existsSync(builder)) {
  console.error(`package: electron-builder is not installed. Install it (network): cd kit && npm install --save-dev --save-exact electron-builder@${kitPkg.devDependencies['electron-builder']}`);
  process.exit(2);
}
const root = join(repo, '.local/package', app), stage = join(root, 'app'), resources = join(root, 'resources'), out = join(root, 'dist');
let config;
try { config = release.builderConfig({ app, pkg, desktop, stage, out, resources, unsigned: isUnsigned }); } catch (e) { console.error(`package: ${e.message}`); process.exit(1); }
rmSync(root, { recursive: true, force: true });
for (const f of files) { mkdirSync(dirname(join(stage, f)), { recursive: true }); copyFileSync(join(repo, f), join(stage, f)); }
for (const m of modules) cpSync(join(repo, 'kit/node_modules', m), join(stage, 'node_modules', m), { recursive: true, filter: p => moduleFile(p.split('\\').join('/')) });
writeFileSync(join(stage, 'package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description,
  author: pkg.author, license: pkg.license, copyright: pkg.copyright, private: true, main: `apps/${app}/${pkg.main}`,
  dependencies: { ...kitPkg.dependencies, ...kitPkg.optionalDependencies } }, null, 2));
mkdirSync(resources, { recursive: true });
writeFileSync(join(resources, 'entitlements.mac.plist'), release.entitlementsPlist());
for (const f of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.txt']) copyFileSync(join(repo, f), join(resources, f));
writeFileSync(join(root, 'builder.json'), JSON.stringify(config, null, 2));
const built = spawnSync(builder, ['--mac', '--config', join(root, 'builder.json'), '--projectDir', stage], { stdio: 'inherit', env: process.env });
if (built.status !== 0) process.exit(built.status ?? 1);

/* read the result back: fuses in the framework binary, the archive contents, the unpacked native helper and node-pty binary of every built app */
const asar = createRequire(join(repo, 'kit/package.json'))('@electron/asar');
const apps = readdirSync(out).filter(d => d.startsWith('mac')).map(d => join(out, d, `${pkg.productName}.app`)).filter(existsSync);
const found = [];
for (const a of apps) {
  const wire = release.readFuses(readFileSync(join(a, 'Contents/Frameworks/Electron Framework.framework/Electron Framework')));
  found.push(...release.fuseProblems(wire).map(p => `${a}: ${p}`));
  const archive = join(a, 'Contents/Resources/app.asar'), unpacked = join(a, 'Contents/Resources/app.asar.unpacked');
  if (!existsSync(archive)) { found.push(`${a}: no app.asar`); continue; }
  const entries = asar.listPackage(archive, { isPack: false });
  found.push(...release.asarProblems(entries, files, [...modules]).map(p => `${a}: ${p}`));
  if (!existsSync(join(unpacked, 'kit/desktop/native/window.node'))) found.push(`${a}: native helper not unpacked`);
  const pty = ['build/Release/pty.node', `prebuilds/darwin-${process.arch}/pty.node`].filter(p => existsSync(join(unpacked, 'node_modules/node-pty', p)));
  if (modules.has('node-pty') && !pty.length) found.push(`${a}: node-pty binary not unpacked`);
  console.log(`package: ${a}: ${entries.length} archive entries, fuses ${wire?.fuses}, node-pty ${pty.join(', ') || 'none'}`);
}
if (!apps.length) found.push('no built app found');
for (const p of found) console.error(`package: ${p}`);
process.exit(found.length ? 1 : 0);
