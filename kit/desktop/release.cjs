/*
 * Release packaging (electron-builder, version pinned in kit/package.json devDependencies; driver: node kit/tools/package.mjs --app <id>).
 *   ignore                  paths (relative to the repository root, '/'-separated, leading '/') a package leaves out. The debug module is the
 *                           one entry to every debug-only aid, so leaving it out removes them all; kit/tools/check-release.mjs fails when it is not listed
 *   runtimeFiles(repo, app) the allow-list of files a package carries: everything under kit/ and apps/<app>/ that ignore and PACKAGE_ONLY keep
 *   REQUIRED_FUSES          Electron fuses a package must have (written by electron-builder, read back from the built binary by readFuses)
 *   ENTITLEMENTS            the only macOS entitlements the hardened runtime gets (V8 needs JIT)
 *   builderConfig(...)      the electron-builder configuration; signing and notarization read their identity and credentials from the
 *                           environment at build time (CSC_NAME or CSC_LINK + CSC_KEY_PASSWORD; APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER
 *                           or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID); nothing is stored in the repository
 *   packageProblems(...)    what keeps a package from being built (no bundle id, missing metadata, a forbidden file, ...): [] when ready
 *   readFuses(buffer)       the fuse wire of an Electron framework binary: { version, fuses: '0'|'1'|'r' per fuse } or null
 *   asarProblems(...)       entries of a built app.asar outside the allow-list and the runtime node modules: [] when clean
 */
const fs = require('node:fs');
const path = require('node:path');

const ignore = [/^\/kit\/desktop\/debug\.cjs$/, /^\/kit\/tools\//,
  /\.test\.[^/]+$/, /\.(before|diff|orig|rej)$/, // tests and their leftovers (x.test.mjs, x.test.cjs, x.test.mjs.before), patch leftovers
  /^\/spec\//, /^\/design\//, /^\/tr\/[^/]+\.png$/, /\/test-fixtures\//, // specs, the design pages (simulation, gallery, review), review shots, test fixtures
  /^(?!.*\/brands\/NOTICE\.md$).*\.md$/]; // documents, except the brand notice (third-party marks and their licenses ship with the app)

/* left out of a package on top of ignore: the native helper source (the built window.node ships), the agent source that runs elsewhere
   (its own container image), Python caches and scripts, review pages */
const PACKAGE_ONLY = [/^\/kit\/desktop\/native\/[^/]+\.m$/, /^\/apps\/[^/]+\/agent\//, /\/__pycache__\//, /\.pyc?$/, /-review\.(html|js)$/, /\.DS_Store$/];
const left = p => ignore.some(re => re.test(p)) || PACKAGE_ONLY.some(re => re.test(p));

/** repository-relative paths ('kit/…', 'apps/<app>/…') of every file a package carries; dot files and folders and node_modules are never walked */
function runtimeFiles(repo, app) {
  const out = [];
  const walk = rel => {
    for (const name of fs.readdirSync(path.join(repo, rel)).sort()) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const r = `${rel}/${name}`, st = fs.statSync(path.join(repo, r));
      if (st.isDirectory()) walk(r); else if (!left('/' + r)) out.push(r);
    }
  };
  walk('kit'); walk(`apps/${app}`);
  return out;
}

/* fuse wire order (Electron fuse schema v1) and the value each must have in a package */
const FUSE_ORDER = ['runAsNode', 'enableCookieEncryption', 'enableNodeOptionsEnvironmentVariable', 'enableNodeCliInspectArguments',
  'enableEmbeddedAsarIntegrityValidation', 'onlyLoadAppFromAsar', 'loadBrowserProcessSpecificV8Snapshot', 'grantFileProtocolExtraPrivileges'];
const REQUIRED_FUSES = Object.freeze({ runAsNode: false, enableCookieEncryption: true, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false,
  enableEmbeddedAsarIntegrityValidation: true, onlyLoadAppFromAsar: true, loadBrowserProcessSpecificV8Snapshot: false, grantFileProtocolExtraPrivileges: false });
const ENTITLEMENTS = Object.freeze(['com.apple.security.cs.allow-jit']);
const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');

function readFuses(buffer) {
  const at = buffer.indexOf(SENTINEL);
  if (at < 0) return null;
  const version = buffer[at + SENTINEL.length], length = buffer[at + SENTINEL.length + 1];
  return { version, fuses: buffer.subarray(at + SENTINEL.length + 2, at + SENTINEL.length + 2 + length).toString('latin1') };
}
/** fuses of a built binary that differ from REQUIRED_FUSES: [] when all match */
function fuseProblems(wire) {
  if (!wire || wire.version !== 1) return ['fuse wire not found or unknown version'];
  return Object.entries(REQUIRED_FUSES).flatMap(([name, want]) => {
    const got = wire.fuses[FUSE_ORDER.indexOf(name)];
    return got === (want ? '1' : '0') || (!want && got === 'r') ? [] : [`fuse ${name} is ${got ?? 'missing'}, expected ${want ? 'on' : 'off'}`];
  });
}

/** entries of a built app.asar ('/…', as @electron/asar listPackage gives them) that are neither the generated package.json, a runtime file,
    a folder holding one, nor inside a runtime node module (modules: its package names): [] when the archive holds only the allow-list */
function asarProblems(entries, files, modules) {
  const keep = new Set(['/package.json', ...files.map(f => '/' + f)]);
  const dirs = new Set(files.flatMap(f => f.split('/').slice(0, -1).map((_, i, a) => '/' + a.slice(0, i + 1).join('/'))));
  const moduleOk = e => e === '/node_modules' || modules.some(m => e === `/node_modules/${m}` || e.startsWith(`/node_modules/${m}/`));
  return entries.filter(e => !keep.has(e) && !dirs.has(e) && !moduleOk(e)).map(e => `${e} is in app.asar but not in the runtime allow-list`);
}

const entitlementsPlist = () => ['<?xml version="1.0" encoding="UTF-8"?>',
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
  '<plist version="1.0">', '<dict>', ...ENTITLEMENTS.map(k => `  <key>${k}</key>\n  <true/>`), '</dict>', '</plist>', ''].join('\n');

const RUN_AS_NODE = ['ELECTRON', 'RUN', 'AS', 'NODE'].join('_'); /* spelled in pieces so this file does not match its own rule */
const notaryEnv = env => !!(env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) || !!(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID);
const signingEnv = env => !!(env.CSC_NAME || env.CSC_LINK);

/**
 * @param {{ app, pkg, desktop, stage, out, resources, env, unsigned }} o  pkg: the app package.json, desktop: the app desktop config (bundleId, packageIcon, packageUnpack),
 *   stage: the folder holding the staged files and generated package.json, out: the output folder, resources: entitlements and license files,
 *   unsigned: a local test package (no identity, no notarization even when the environment has them; the same fuses, archive and integrity,
 *   and the fuse flip re-seals the binary ad hoc so arm64 still launches it). Without unsigned and without an identity it throws.
 */
/* Electron's stock Info.plist asks for the camera, the microphone and Bluetooth and turns App Transport Security off; the app uses none of
   them (system dictation needs no app permission, and the app's network traffic goes through Node, not through ATS), so the packed plist drops them */
const UNUSED_INFO_KEYS = ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSAudioCaptureUsageDescription', 'NSBluetoothAlwaysUsageDescription', 'NSBluetoothPeripheralUsageDescription', 'NSAppTransportSecurity'];
function trimInfoPlist(plist, run = (cmd, args) => require('node:child_process').execFileSync(cmd, args, { stdio: 'ignore' })) {
  for (const key of UNUSED_INFO_KEYS) { try { run('/usr/bin/plutil', ['-remove', key, plist]); } catch { /* the key is not there */ } }
}

function builderConfig({ app, pkg, desktop, stage, out, resources, env = process.env, unsigned = false }) {
  const signed = !unsigned && signingEnv(env);
  if (!unsigned && !signed) throw new Error('no signing identity in the environment (CSC_NAME, or CSC_LINK and CSC_KEY_PASSWORD); for a local test package use --unsigned');
  return {
    appId: desktop.bundleId, productName: pkg.productName, copyright: pkg.copyright, electronVersion: pkg.devDependencies?.electron,
    directories: { app: stage, output: out, buildResources: resources },
    /* a node module's build-only parts (sources, scripts, headers) stay out once it is rebuilt for the app's Electron */
    files: ['**/*', '!node_modules/*/{src,scripts,deps,third_party,typings}/**', '!node_modules/**/*.{ts,h,gyp,gypi,c,cc,stamp,Makefile}', '!node_modules/*/binding.gyp'], asar: true,
    /* native modules stay outside the archive, and so do the app's files another program reads by path (desktop config packageUnpack) */
    asarUnpack: ['**/*.node', '**/node_modules/node-pty/**', ...(desktop.packageUnpack || []).map(p => `apps/${app}/${p}`)],
    npmRebuild: true,
    electronFuses: { ...REQUIRED_FUSES, ...(unsigned ? { resetAdHocDarwinSignature: true } : {}) },
    extraResources: ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.txt'].map(f => ({ from: path.join(resources, f), to: f })),
    afterPack: path.join(__dirname, 'after-pack.cjs'), // a path: the configuration is written as JSON
    mac: {
      category: 'public.app-category.developer-tools', icon: path.join(stage, 'apps', app, desktop.packageIcon), target: ['dmg', 'zip'],
      hardenedRuntime: true, gatekeeperAssess: false,
      entitlements: path.join(resources, 'entitlements.mac.plist'), entitlementsInherit: path.join(resources, 'entitlements.mac.plist'),
      identity: signed ? (env.CSC_NAME || undefined) : null, // null: no signing identity in the environment, the build is unsigned
      notarize: signed && notaryEnv(env),
    },
  };
}

/* the SPDX id of a repository LICENSE text, by its opening lines (the official texts start this way), or null */
function licenseId(text) {
  const head = text.trimStart().slice(0, 200);
  if (/^Apache License\s+Version 2\.0, January 2004/.test(head)) return 'Apache-2.0';
  if (/^MIT License\b/.test(head)) return 'MIT';
  return null;
}

/**
 * @param {{ repo, app, pkg, desktop, files, release, env, platform, noticesFresh }} o  release: a build meant for customers (signing and
 *   notarization credentials required); noticesFresh: the generated third-party notices match the sources
 */
function packageProblems({ repo, app, pkg, desktop, files, release = false, env = process.env, platform = process.platform, noticesFresh = true }) {
  const out = [];
  if (typeof desktop.bundleId !== 'string' || !/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+){2,}$/.test(desktop.bundleId))
    out.push(`apps/${app}/desktop.config.cjs bundleId is not set (a reverse-DNS app id decided by the owner, e.g. com.<company>.<product>)`);
  for (const k of ['name', 'productName', 'version', 'description', 'author', 'license', 'copyright']) if (!pkg[k]) out.push(`apps/${app}/package.json has no ${k}`);
  const licenseText = fs.existsSync(path.join(repo, 'LICENSE')) ? fs.readFileSync(path.join(repo, 'LICENSE'), 'utf8') : null, spdx = licenseText == null ? null : licenseId(licenseText);
  if (licenseText != null && !spdx) out.push('LICENSE is not a license text this check knows (Apache-2.0 or MIT, unchanged)');
  if (spdx && pkg.license && pkg.license !== spdx) out.push(`apps/${app}/package.json license is ${pkg.license} but LICENSE is ${spdx}`);
  if (spdx === 'Apache-2.0' && !fs.existsSync(path.join(repo, 'NOTICE'))) out.push('NOTICE is missing at the repository root (Apache-2.0)');
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version || '')) out.push(`apps/${app}/package.json version is not x.y.z`);
  if (!pkg.devDependencies?.electron) out.push(`apps/${app}/package.json pins no electron version`);
  for (const f of files) if (left('/' + f)) out.push(`${f} is in the package but is left out by the release rules`);
  for (const need of [`apps/${app}/desktop.cjs`, 'kit/desktop/main.cjs', ...(platform === 'darwin' ? ['kit/desktop/native/window.node'] : [])])
    if (!files.includes(need)) out.push(`${need} is missing from the package${need.endsWith('.node') ? ' (run node kit/tools/build-native.mjs)' : ''}`);
  /* the RunAsNode fuse is off in a package: anything that starts the app binary as Node would fail there */
  for (const f of files.filter(f => /\.(c|m)?js$/.test(f))) {
    const text = fs.readFileSync(path.join(repo, f), 'utf8');
    if (text.split('\n').some(l => l.includes(RUN_AS_NODE) && !new RegExp(`delete\\s+[\\w.[\\]'"]*${RUN_AS_NODE}`).test(l))) out.push(`${f} starts the app binary as Node (${RUN_AS_NODE}), which the RunAsNode fuse turns off`);
  }
  for (const f of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) if (!fs.existsSync(path.join(repo, f))) out.push(`${f} is missing at the repository root`);
  if (!noticesFresh) out.push('THIRD_PARTY_NOTICES.txt is out of date (run node kit/tools/notices.mjs --app ' + app + ')');
  if (release && !signingEnv(env)) out.push('release build without a signing identity (set CSC_NAME, or CSC_LINK and CSC_KEY_PASSWORD)');
  if (release && !notaryEnv(env)) out.push('release build without notarization credentials (APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER or APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID)');
  return out;
}

module.exports = { trimInfoPlist, ignore, runtimeFiles, REQUIRED_FUSES, FUSE_ORDER, ENTITLEMENTS, entitlementsPlist, builderConfig, packageProblems, readFuses, fuseProblems, asarProblems };
