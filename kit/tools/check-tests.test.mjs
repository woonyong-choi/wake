import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const SOURCE = readFileSync(new URL('./check-tests.mjs', import.meta.url), 'utf8');

function spawnFixture(command, args, options) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(command, args, { ...options, env });
}

function runCheck(t, { tests = {}, desktop = {}, spawn = spawnFixture } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-tests-reporting-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'kit', 'tools'), { recursive: true });
  mkdirSync(join(root, 'apps'));
  for (const [name, source] of Object.entries({ ...tests, ...desktop })) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
  const output = [];
  const calls = [];
  const exit = new Error('check exited');
  let status = 0;
  const script = SOURCE.replace(/^import .+ from '[^']+';\n/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(new URL(`file://${root}/kit/tools/check-tests.mjs`).href));
  try {
    runInNewContext(script, {
      readdirSync, statSync, existsSync, resolve, dirname, join, relative, fileURLToPath,
      spawnSync: (...args) => { calls.push(args[1]); return spawn(...args); },
      console: { log: text => output.push(text), error: text => output.push(text) },
      process: { execPath: process.execPath, exit: code => { status = code; throw exit; } },
    });
  } catch (error) {
    if (error !== exit) throw error;
  }
  return { status, output: output.join('\n'), calls, root };
}

test('check-tests_success_reports_observed_total_including_skips', t => {
  const result = runCheck(t, { desktop: { 'kit/desktop/valid.cjs': 'module.exports = true;' }, tests: {
    'kit/fixture.test.mjs': "import test from 'node:test'; test('passes', () => {}); test.skip('skipped', () => {});",
    'apps/sample/fixture.test.cjs': "require('node:test')('also passes', () => {});",
  } });

  assert.equal(result.status, 0);
  assert.match(result.output, /ok \(2 files, 3 tests\)/);
  assert.equal(result.calls.length, 2);
});

test('check-tests_output_larger_than_the_default_child_buffer_still_reports_the_summary', t => {
  const result = runCheck(t, { tests: {
    'kit/loud.test.mjs': "import test from 'node:test'; test('loud', () => { for (let i = 0; i < 4096; i++) console.log('x'.repeat(1024)); });",
  } });

  assert.equal(result.status, 0, result.output.slice(-2000));
  assert.match(result.output, /ok \(1 files, 1 tests\)/);
});

test('check-tests_assertion_failure_preserves_name_location_and_stack', t => {
  const result = runCheck(t, { tests: {
    'kit/failure.test.mjs': "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('diagnostic assertion', () => assert.equal(false, true));\n",
  } });

  assert.equal(result.status, 1);
  assert.match(result.output, /diagnostic assertion/);
  assert.match(result.output, /failure\.test\.mjs:3/);
  assert.match(result.output, /expected: true/);
  assert.match(result.output, /actual: false/);
  assert.match(result.output, /stack:/);
  assert.match(result.output, /1 failed \(1 files, 1 tests\)/);
});

test('check-tests_syntax_failure_stops_before_tests_with_original_diagnostic', t => {
  const result = runCheck(t, {
    desktop: { 'apps/sample/desktop/broken.cjs': 'const broken = ;' },
    tests: { 'kit/fixture.test.mjs': "throw new Error('must not run');" },
  });

  assert.equal(result.status, 1);
  assert.equal(result.calls.length, 1);
  assert.match(result.output, /SyntaxError/);
  assert.match(result.output, /broken\.cjs:1/);
  assert.match(result.output, /syntax check failed in apps\/sample\/desktop\/broken\.cjs/);
  assert.doesNotMatch(result.output, /must not run/);
});

test('check-tests_process_failure_reports_error_signal_and_unknown_counts', t => {
  for (const failure of [
    { status: null, signal: null, error: Object.assign(new Error('spawn node ENOENT'), { code: 'ENOENT' }), stdout: null, stderr: null },
    { status: null, signal: 'SIGTERM', stdout: 'partial output', stderr: 'child diagnostic' },
    { status: 2, signal: null, stdout: '', stderr: 'runner failed before summary' },
  ]) {
    const result = runCheck(t, { spawn: () => failure });

    assert.equal(result.status, 1);
    assert.match(result.output, /unknown failed \(0 files, unknown tests\)/);
    assert.match(result.output, new RegExp(`status=${failure.status ?? 'unknown'} signal=${failure.signal ?? 'none'}`));
    if (failure.error) assert.match(result.output, /Error: spawn node ENOENT/);
    if (failure.stderr) assert.ok(result.output.includes(failure.stderr));
    if (failure.stdout) assert.ok(result.output.includes(failure.stdout));
  }
});

test('check-tests_missing_summary_reports_unknown_without_inventing_zero', t => {
  const result = runCheck(t, { spawn: () => ({ status: 0, signal: null, stdout: '', stderr: '' }) });

  assert.equal(result.status, 0);
  assert.match(result.output, /ok \(0 files, unknown tests\)/);
  assert.doesNotMatch(result.output, /undefined/);
});

test('check-tests_syntax_process_error_stops_before_tests', t => {
  const result = runCheck(t, {
    desktop: { 'kit/desktop/valid.cjs': 'module.exports = true;' },
    spawn: () => ({ status: null, signal: 'SIGTERM', stdout: null, stderr: 'syntax worker stopped', error: new Error('spawn failure') }),
  });

  assert.equal(result.status, 1);
  assert.equal(result.calls.length, 1);
  assert.match(result.output, /syntax worker stopped/);
  assert.match(result.output, /spawn failure/);
  assert.match(result.output, /signal=SIGTERM/);
  assert.match(result.output, /syntax check failed in kit\/desktop\/valid.cjs/);
});
