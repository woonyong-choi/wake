/*
 * electron-builder afterPack hook, named by path in the builder configuration (the configuration is written as JSON, so it cannot carry a
 * function): on macOS the packed Info.plist drops the device permissions and the App Transport Security override the app does not use.
 */
const path = require('node:path');
const { trimInfoPlist } = require('./release.cjs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  trimInfoPlist(path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Info.plist'));
};
