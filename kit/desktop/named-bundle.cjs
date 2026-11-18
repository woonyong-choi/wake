/*
 * Development run under the app name (macOS). The menu bar title and the Dock name come from the bundle's Info.plist, so a run of the
 * plain runtime shows the runtime's name. relaunchNamed(name) copies the runtime bundle once next to itself as '<name>.app' (copy on write),
 * sets its CFBundleName and CFBundleDisplayName, starts the same command from the copy and resolves true once the copy is running.
 * It resolves false (keep running here) for a packaged app, other platforms, a bundle that already has the name, or when the copy fails to start.
 * The bundle identifier is kept, so system permissions given to the runtime still apply.
 */
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync, spawn } = require('node:child_process');

const PLIST = '/usr/libexec/PlistBuddy';
const STARTED_MS = 2500;

function relaunchNamed(name) {
  if (process.platform !== 'darwin' || app.isPackaged) return Promise.resolve(false);
  const bundle = process.execPath.replace(/\/Contents\/MacOS\/[^/]+$/, '');
  if (!bundle.endsWith('.app')) return Promise.resolve(false);
  try {
    const plistOf = b => path.join(b, 'Contents', 'Info.plist');
    const read = (b, key) => execFileSync(PLIST, ['-c', `Print :${key}`, plistOf(b)]).toString().trim();
    if (read(bundle, 'CFBundleName') === name) return Promise.resolve(false);
    const named = path.join(path.dirname(bundle), `${name}.app`);
    if (!fs.existsSync(named)) {
      execFileSync('/bin/cp', ['-cR', bundle, named]);
      for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
        try { execFileSync(PLIST, ['-c', `Set :${key} ${name}`, plistOf(named)]); } catch { execFileSync(PLIST, ['-c', `Add :${key} string ${name}`, plistOf(named)]); }
      }
    }
    const exec = path.join(named, 'Contents', 'MacOS', path.basename(process.execPath));
    const child = spawn(exec, process.argv.slice(1), { cwd: process.cwd(), detached: true, stdio: 'ignore' });
    return new Promise(resolve => {
      const timer = setTimeout(() => { child.unref(); resolve(true); }, STARTED_MS);
      const fail = () => { clearTimeout(timer); resolve(false); };
      child.once('error', fail);
      child.once('exit', fail);
    });
  } catch {
    return Promise.resolve(false);
  }
}

module.exports = { relaunchNamed };
