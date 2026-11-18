#!/usr/bin/env node
/*
 * Build the native window helper before packaging (S-08): kit/desktop/native/window.m -> kit/desktop/native/window.node, one universal
 * (arm64 + x86_64) Node-API bundle made with the system compiler (xcrun clang, Xcode Command Line Tools). The packager signs it with the
 * app (hardened runtime) and ships it unpacked; the app never compiles at run time (kit/desktop/native.cjs).
 *   node kit/tools/build-native.mjs            build (macOS only; elsewhere it says so and exits 0)
 *   node kit/tools/build-native.mjs --check    exit 1 when the built file is missing or older than its source
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const src = join(repo, 'kit/desktop/native/window.m'), out = join(repo, 'kit/desktop/native/window.node');
const fresh = () => existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs;

if (process.argv.includes('--check')) {
  if (fresh()) { console.log(`build-native: ok (${out})`); process.exit(0); }
  console.error(`build-native: ${out} is missing or older than window.m (run node kit/tools/build-native.mjs)`); process.exit(1);
}
if (process.platform !== 'darwin') { console.log('build-native: macOS only, nothing to build'); process.exit(0); }
execFileSync('/usr/bin/xcrun', ['clang', '-bundle', '-undefined', 'dynamic_lookup', '-fobjc-arc', '-O2', '-mmacosx-version-min=13.0',
  '-arch', 'arm64', '-arch', 'x86_64', '-framework', 'AppKit', '-framework', 'QuartzCore', '-o', out, src], { stdio: 'inherit', timeout: 120000 });
console.log(`build-native: built ${out}`);
