const assert = require('node:assert/strict');
const test = require('node:test');
const { ignore } = require('./release.cjs');

const left = p => ignore.some(re => re.test(p));

/* C-13: a package carries the app, not its tests, specs, design simulation, review shots or test fixtures; the brand notice (licenses) ships */
test('release_leaves_out_tests_spec_simulation_review_shots_and_fixtures_and_keeps_the_brand_notice', () => {
  for (const p of ['/kit/components/menu.test.mjs', '/apps/demo/desktop/hub.test.cjs', '/sim-engine.test.mjs', '/apps/demo/pages/x.test.mjs.before',
    '/spec/rules.md', '/spec/check-canonical.py', '/spec/data.csv', '/sim.html', '/sim.js', '/sim-data.js', '/tr/err-dark.png',
    '/apps/demo/test-fixtures/kubeconfig.yaml', '/kit/desktop/debug.cjs', '/kit/tools/check.mjs', '/AGENTS.md']) assert.ok(left(p), `${p} is packaged`);
  for (const p of ['/apps/demo/assets/brands/NOTICE.md', '/apps/demo/app.config.js', '/kit/components/menu.js', '/kit/vendor/echarts/NOTICE', '/apps/demo/pages/scope-box.js']) assert.ok(!left(p), `${p} is left out`);
});

/* S-02: packaging setup. A package carries only the runtime allow-list, has the required fuses, a minimal hardened-runtime entitlement set,
   signing from the environment only, the product metadata, and refuses to build without a bundle id */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const release = require('./release.cjs');

function repoFixture(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'release-repo-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  for (const f of ['kit/desktop/main.cjs', 'kit/desktop/debug.cjs', 'kit/desktop/native/window.m', 'kit/desktop/native/window.node', 'kit/tools/check.mjs', 'kit/components/menu.js',
    'kit/components/menu.test.mjs', 'kit/package.json', 'kit/README.md', 'kit/.local/x', 'kit/node_modules/x/index.js', 'apps/demo/desktop.cjs', 'apps/demo/package.json',
    'apps/demo/desktop/hub.cjs', 'apps/demo/desktop/hub.test.cjs', 'apps/demo/test-fixtures/k.yaml', 'apps/demo/assets/brands/NOTICE.md', 'apps/demo/agent/agent.mjs',
    'apps/demo/.pytest_cache/v/x', 'apps/demo/pages/x.js.before', 'apps/other/app.js', 'spec/rules.md', 'sim.html', 'sankey-review.html', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
    fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); fs.writeFileSync(path.join(repo, f), 'x');
  }
  fs.writeFileSync(path.join(repo, 'LICENSE'), APACHE_HEAD); fs.writeFileSync(path.join(repo, 'NOTICE'), 'Demo\nCopyright someone\n');
  return repo;
}
const APACHE_HEAD = '\n                                 Apache License\n                           Version 2.0, January 2004\n                        http://www.apache.org/licenses/\n';
const PKG = { name: 'demo', productName: 'Demo', version: '0.1.0', description: 'd', author: 'someone', license: 'Apache-2.0', copyright: 'Copyright someone', devDependencies: { electron: '44.7.2' } };

test('package_carries_only_the_runtime_allow_list', t => {
  const repo = repoFixture(t);
  assert.deepEqual(release.runtimeFiles(repo, 'demo'), ['kit/components/menu.js', 'kit/desktop/main.cjs', 'kit/desktop/native/window.node', 'kit/package.json',
    'apps/demo/assets/brands/NOTICE.md', 'apps/demo/desktop/hub.cjs', 'apps/demo/desktop.cjs', 'apps/demo/package.json']);
});

test('package_fuses_entitlements_and_signing_come_from_the_config_and_the_environment_only', () => {
  assert.deepEqual(release.REQUIRED_FUSES, { runAsNode: false, enableCookieEncryption: true, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true, onlyLoadAppFromAsar: true, loadBrowserProcessSpecificV8Snapshot: false, grantFileProtocolExtraPrivileges: false });
  assert.deepEqual(release.ENTITLEMENTS, ['com.apple.security.cs.allow-jit']);
  const desktop = { bundleId: 'com.example.demo', packageIcon: 'assets/icon/icon.icns', packageUnpack: ['desktop/charts/**'] };
  const unsigned = release.builderConfig({ app: 'demo', pkg: PKG, desktop, stage: '/s', out: '/o', resources: '/r', env: {}, unsigned: true });
  assert.equal(unsigned.mac.identity, null); assert.equal(unsigned.mac.notarize, false);
  assert.equal(unsigned.mac.hardenedRuntime, true); assert.equal(unsigned.asar, true);
  assert.ok(unsigned.asarUnpack.includes('**/*.node'));
  assert.ok(unsigned.asarUnpack.includes('apps/demo/desktop/charts/**'), 'files another program reads by path stay outside the archive');
  const signed = release.builderConfig({ app: 'demo', pkg: PKG, desktop, stage: '/s', out: '/o', resources: '/r',
    env: { CSC_NAME: 'Developer ID Application: X (TEAM)', APPLE_API_KEY: '/k.p8', APPLE_API_KEY_ID: 'id', APPLE_API_ISSUER: 'iss' } });
  assert.equal(signed.mac.identity, 'Developer ID Application: X (TEAM)'); assert.equal(signed.mac.notarize, true);
  assert.deepEqual(signed.electronFuses, release.REQUIRED_FUSES);
  assert.doesNotMatch(JSON.stringify(signed), /k\.p8|"iss"/, 'credentials are read by the builder from the environment, not written into the config');
  assert.match(release.entitlementsPlist(), /com\.apple\.security\.cs\.allow-jit/);
});

test('unsigned_package_skips_signing_even_with_credentials_but_keeps_the_fuses_and_an_ad_hoc_seal_so_it_launches', () => {
  const desktop = { bundleId: 'com.example.demo', packageIcon: 'assets/icon/icon.icns' };
  const env = { CSC_NAME: 'Developer ID Application: X (TEAM)', APPLE_API_KEY: '/k.p8', APPLE_API_KEY_ID: 'id', APPLE_API_ISSUER: 'iss' };
  const unsigned = release.builderConfig({ app: 'demo', pkg: PKG, desktop, stage: '/s', out: '/o', resources: '/r', env, unsigned: true });
  assert.equal(unsigned.mac.identity, null, 'no identity even when the environment has one');
  assert.equal(unsigned.mac.notarize, false);
  assert.equal(unsigned.electronFuses.resetAdHocDarwinSignature, true, 'arm64 refuses a binary whose seal the fuse flip broke');
  const { resetAdHocDarwinSignature, ...fuses } = unsigned.electronFuses;
  assert.deepEqual(fuses, release.REQUIRED_FUSES);
  assert.equal(unsigned.asar, true);
  assert.ok(unsigned.files.includes('!node_modules/*/{src,scripts,deps,third_party,typings}/**'), 'a rebuilt module ships without its sources');
  const signed = release.builderConfig({ app: 'demo', pkg: PKG, desktop, stage: '/s', out: '/o', resources: '/r', env });
  assert.equal(signed.electronFuses.resetAdHocDarwinSignature, undefined, 'a signed build is sealed by its identity');
  assert.throws(() => release.builderConfig({ app: 'demo', pkg: PKG, desktop, stage: '/s', out: '/o', resources: '/r', env: {} }), /--unsigned/,
    'without an identity a build says so instead of making an app arm64 will not open');
});

test('built_archive_holds_only_the_allow_list_its_package_json_and_runtime_node_modules', () => {
  const files = ['kit/desktop/main.cjs', 'apps/demo/desktop.cjs'];
  const ok = ['/package.json', '/kit', '/kit/desktop', '/kit/desktop/main.cjs', '/apps', '/apps/demo', '/apps/demo/desktop.cjs',
    '/node_modules', '/node_modules/node-pty', '/node_modules/node-pty/package.json', '/node_modules/node-pty/lib/index.js'];
  assert.deepEqual(release.asarProblems(ok, files, ['node-pty']), []);
  const bad = release.asarProblems([...ok, '/spec/rules.md', '/kit/tools/check.mjs', '/apps/demo/desktop/hub.test.cjs', '/sim.html', '/.local/x', '/apps/demo/extra.js',
    '/node_modules/electron-builder/package.json'], files, ['node-pty']);
  assert.deepEqual(bad, ['/spec/rules.md', '/kit/tools/check.mjs', '/apps/demo/desktop/hub.test.cjs', '/sim.html', '/.local/x', '/apps/demo/extra.js',
    '/node_modules/electron-builder/package.json'].map(p => `${p} is in app.asar but not in the runtime allow-list`));
});

test('package_check_fails_without_a_bundle_id_and_on_missing_metadata_or_release_credentials', t => {
  const repo = repoFixture(t), files = release.runtimeFiles(repo, 'demo');
  const ok = release.packageProblems({ repo, app: 'demo', pkg: PKG, desktop: { bundleId: 'com.example.demo' }, files, platform: 'darwin', env: {} });
  assert.deepEqual(ok, []);
  const unset = release.packageProblems({ repo, app: 'demo', pkg: PKG, desktop: { bundleId: null }, files, platform: 'darwin', env: {} });
  assert.match(unset.join('\n'), /bundleId is not set/);
  const bad = release.packageProblems({ repo, app: 'demo', pkg: { ...PKG, license: 'MIT', author: '' }, desktop: { bundleId: 'com.example.demo' }, files: [...files, 'spec/rules.md'], release: true, platform: 'darwin', env: {} });
  fs.writeFileSync(path.join(repo, 'apps/demo/desktop/hub.cjs'), "const env = { ELECTRON_RUN_AS_NODE: '1' };\ndelete env.ELECTRON_RUN_AS_NODE;");
  const runAsNode = release.packageProblems({ repo, app: 'demo', pkg: PKG, desktop: { bundleId: 'com.example.demo' }, files, platform: 'darwin', env: {} });
  assert.deepEqual(runAsNode, ['apps/demo/desktop/hub.cjs starts the app binary as Node (ELECTRON_RUN_AS_NODE), which the RunAsNode fuse turns off']);
  for (const re of [/license is MIT/, /no author/, /spec\/rules\.md is in the package/, /without a signing identity/, /without notarization credentials/]) assert.match(bad.join('\n'), re);
});

/* open source (Apache-2.0): the package declares the SPDX id of the repository LICENSE text, and an Apache-2.0 repository keeps its NOTICE */
test('package_license_matches_the_repository_license_text_and_apache_keeps_its_notice', t => {
  const repo = repoFixture(t), files = release.runtimeFiles(repo, 'demo'), desktop = { bundleId: 'com.example.demo' };
  const check = pkg => release.packageProblems({ repo, app: 'demo', pkg, desktop, files, platform: 'darwin', env: {} }).join('\n');
  assert.equal(check(PKG), '');
  assert.match(check({ ...PKG, license: 'UNLICENSED' }), /license is UNLICENSED but LICENSE is Apache-2\.0/);
  fs.rmSync(path.join(repo, 'NOTICE'));
  assert.match(check(PKG), /NOTICE is missing at the repository root \(Apache-2\.0\)/);
  fs.writeFileSync(path.join(repo, 'LICENSE'), 'All rights reserved.');
  assert.match(check(PKG), /LICENSE is not a license text this check knows/);
  fs.writeFileSync(path.join(repo, 'LICENSE'), 'MIT License\n\nCopyright (c) someone\n');
  assert.equal(check({ ...PKG, license: 'MIT' }), '');
});

test('built_binary_fuses_are_read_back_and_compared', () => {
  const wire = s => Buffer.concat([Buffer.from('xxdL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'), Buffer.from([1, s.length]), Buffer.from(s), Buffer.from('yy')]);
  assert.deepEqual(release.readFuses(wire('101100011')), { version: 1, fuses: '101100011' });
  assert.equal(release.fuseProblems(release.readFuses(wire('101100011'))).length, 7, 'stock Electron 44.7.2 (101100011): seven of the eight required fuses are wrong');
  assert.deepEqual(release.fuseProblems(release.readFuses(wire('010011001'))), []);
  assert.equal(release.readFuses(Buffer.from('nothing')), null);
});

test('the packaged Info.plist asks for no device the app does not use and keeps App Transport Security on', () => {
  const calls = [];
  const plist = '/x/App.app/Contents/Info.plist';
  release.trimInfoPlist(plist, (cmd, args) => calls.push([cmd, ...args]));
  const removed = calls.map(c => c[2]);
  for (const key of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSAudioCaptureUsageDescription', 'NSBluetoothAlwaysUsageDescription', 'NSBluetoothPeripheralUsageDescription', 'NSAppTransportSecurity'])
    assert.ok(removed.includes(key), key + ' is removed');
  assert.ok(calls.every(c => c[0] === '/usr/bin/plutil' && c[1] === '-remove' && c[3] === plist));
  const cfg = release.builderConfig({ app: 'sample', pkg: { name: 'sample', version: '0.0.0' }, desktop: { packageIcon: 'i.icns', bundleId: 'a.b.c' }, stage: '/s', out: '/o', resources: '/r', env: {}, unsigned: true });
  assert.ok(require('node:fs').existsSync(cfg.afterPack), 'the build trims the plist after packing through a hook named by path');
  assert.equal(JSON.parse(JSON.stringify(cfg)).afterPack, cfg.afterPack, 'the hook survives the JSON configuration');
});
