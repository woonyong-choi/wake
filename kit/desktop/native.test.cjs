/* S-08 native window helper: built and signed at package time (kit/tools/build-native.mjs), shipped unpacked, loaded only from the app.
   At run time nothing is compiled and nothing is loaded from the user data folder. node --test kit/desktop/native.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('native_helper_is_never_compiled_or_loaded_from_user_data_at_run_time', () => {
  const src = fs.readFileSync(path.join(__dirname, 'native.cjs'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /xcrun|clang|execFile|child_process/, 'no compiler at run time');
  assert.doesNotMatch(src, /userData|getPath/, 'nothing from the user data folder');
});

test('native_helper_path_is_the_unpacked_file_inside_the_app_bundle', () => {
  const { nativePath } = require('./native.cjs');
  const res = '/Applications/Demo.app/Contents/Resources';
  assert.equal(nativePath({ dir: `${res}/app.asar/kit/desktop`, isPackaged: true, resourcesPath: res }), `${res}/app.asar.unpacked/kit/desktop/native/window.node`);
  assert.equal(nativePath({ dir: '/tmp/elsewhere/kit/desktop', isPackaged: true, resourcesPath: res }), null, 'a packaged app loads nothing outside its bundle');
  assert.equal(nativePath({ dir: '/repo/kit/desktop', isPackaged: false, resourcesPath: '/x' }), '/repo/kit/desktop/native/window.node', 'a development run loads the prebuilt file next to the source');
});

test('load_native_returns_null_without_a_prebuilt_file_and_does_not_build_one', () => {
  const { loadNative } = require('./native.cjs');
  const opened = [];
  const r = loadNative({ platform: 'darwin', dir: '/nowhere/kit/desktop', isPackaged: false, resourcesPath: '/x', exists: () => false, dlopen: (m, f) => opened.push(f) });
  assert.equal(r, null);
  assert.deepEqual(opened, []);
  const mod = loadNative({ platform: 'darwin', dir: '/repo/kit/desktop', isPackaged: false, resourcesPath: '/x', exists: () => true, dlopen: (m, f) => { opened.push(f); m.exports = { ok: true }; } });
  assert.deepEqual(mod, { ok: true });
  assert.deepEqual(opened, ['/repo/kit/desktop/native/window.node']);
});
