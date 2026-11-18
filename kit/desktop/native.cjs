/*
 * Native window helper (macOS): native/window.m is built at package time (node kit/tools/build-native.mjs, a universal arm64 + x86_64
 * Node-API module native/window.node), signed with the app and shipped unpacked (app.asar.unpacked). At run time it is only loaded:
 * nothing is compiled and nothing is loaded from the user data folder. A packaged app loads it only from inside its own bundle
 * (process.resourcesPath); a development run loads the prebuilt file next to the source. Returns null when there is no file or it does
 * not load (other platforms, a development run that did not build it); callers then keep the system window shape.
 */
const path = require('node:path');
const fs = require('node:fs');

/** the helper file to load, or null when it would be outside the app bundle */
function nativePath({ dir, isPackaged, resourcesPath }) {
  const file = path.join(dir, 'native', 'window.node');
  if (!isPackaged) return file;
  const asar = path.join(resourcesPath, 'app.asar') + path.sep, unpacked = path.join(resourcesPath, 'app.asar.unpacked') + path.sep;
  if (file.startsWith(asar)) return unpacked + file.slice(asar.length);
  return file.startsWith(unpacked) ? file : null;
}

let cached;
/** options are for tests; the app calls loadNative() and gets one cached result */
function loadNative(options) {
  if (!options && cached !== undefined) return cached;
  const {
    platform = process.platform, dir = __dirname, resourcesPath = process.resourcesPath,
    isPackaged = (() => { try { return require('electron').app.isPackaged; } catch { return false; } })(),
    exists = fs.existsSync, dlopen = (mod, file) => process.dlopen(mod, file),
  } = options || {};
  let result = null;
  if (platform === 'darwin') {
    const file = nativePath({ dir, isPackaged, resourcesPath });
    if (!file || !exists(file)) loadNative.error = file ? `native window helper not built: ${file}` : 'native window helper outside the app bundle';
    else {
      try { const mod = { exports: {} }; dlopen(mod, file); result = mod.exports; }
      catch (e) { loadNative.error = e.message; console.warn('native window helper unavailable:', e.message); }
    }
  }
  if (!options) cached = result;
  return result;
}

module.exports = { loadNative, nativePath };
