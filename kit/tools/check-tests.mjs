#!/usr/bin/env node
/*
 * Logic tests of the kit and every app (state tables, decision rules, detection rules): runs each *.test.mjs / *.test.cjs with node --test,
 * after parsing every desktop main-process module (.cjs) with node --check.
 * Exit code 1 when any test fails. Run before every commit.
 *   node kit/tools/check-tests.mjs
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const walk = (dir, out = []) => { if (!existsSync(dir)) return out; for (const n of readdirSync(dir)) { if (n === 'node_modules' || n.startsWith('.')) continue; const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.test\.(mjs|cjs)$/.test(n)) out.push(p); } return out; };
const walkAll = (dir, out = []) => { if (!existsSync(dir)) return out; for (const n of readdirSync(dir)) { if (n === 'node_modules' || n.startsWith('.')) continue; const p = join(dir, n); if (statSync(p).isDirectory()) walkAll(p, out); else out.push(p); } return out; };
const files = [...walk(join(repo, 'kit')), ...walk(join(repo, 'apps'))];
/* main-process modules are loaded only by the desktop app: a syntax error there leaves the app without a window, so parse each one here */
const cjs = [...walkAll(join(repo, 'kit', 'desktop')), ...readdirSync(join(repo, 'apps')).flatMap(a => walkAll(join(repo, 'apps', a, 'desktop')))].filter(p => p.endsWith('.cjs') && !p.includes(`${'/'}vendor${'/'}`));
function printProcessFailure(result) {
  if (result.stdout) console.error(result.stdout.trimEnd());
  if (result.stderr) console.error(result.stderr.trimEnd());
  if (result.error) console.error(result.error.stack || result.error.message);
  console.error(`check-tests: process status=${result.status ?? 'unknown'} signal=${result.signal ?? 'none'}`);
}

for (const p of cjs) {
  const c = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  if (c.status !== 0 || c.error || c.signal) {
    printProcessFailure(c);
    console.error(`check-tests: syntax check failed in ${relative(repo, p)}`);
    process.exit(1);
  }
}
/* the TAP report of every test (with failure diagnostics and test output) can pass spawnSync's default 1 MiB buffer: past it the run is cut off with ENOBUFS and its summary is lost */
const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const total = /^# tests (\d+)$/m.exec(r.stdout ?? '')?.[1];
const fail = /^# fail (\d+)$/m.exec(r.stdout ?? '')?.[1];
if (r.status !== 0 || r.error || r.signal) {
  printProcessFailure(r);
  console.error(`check-tests: ${fail ?? 'unknown'} failed (${files.length} files, ${total ?? 'unknown'} tests)`);
  process.exit(1);
}
console.log(`check-tests: ok (${files.length} files, ${total ?? 'unknown'} tests)`);
