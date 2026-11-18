import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bannedTerms } from './banned-terms.mjs';

const tool = fileURLToPath(new URL('./check-deps.mjs', import.meta.url));
const allowList = JSON.parse(readFileSync(new URL('./banned-allow.json', import.meta.url), 'utf8'));
const run = (...args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });

test('banned_terms_match_whole_words_case_insensitive_in_comments_too', () => {
  const { findings } = bannedTerms('kit/a.js', '/* the Zorbel */\nconst zorbeling = 1;\nzorbel-row', ['zorbel'], []);
  assert.deepEqual(findings, ['kit/a.js:1: banned term "zorbel"', 'kit/a.js:3: banned term "zorbel"']);
});

test('banned_allow_entry_excuses_only_its_own_file_and_term', () => {
  const allow = [{ file: 'kit/vendor/x.mjs', term: 'zorbel', lines: 1 }];
  const vendor = bannedTerms('kit/vendor/x.mjs', 'zorbel\nquilm', ['zorbel', 'quilm'], allow);
  assert.deepEqual(vendor.findings, ['kit/vendor/x.mjs:2: banned term "quilm"'], 'another term in the excused file is still a finding');
  assert.deepEqual(vendor.excused, allow);
  const other = bannedTerms('kit/core/y.js', 'zorbel', ['zorbel'], allow);
  assert.deepEqual(other.findings, ['kit/core/y.js:1: banned term "zorbel"'], 'the same term in another file is still a finding');
  assert.deepEqual(other.excused, []);
});

test('banned_allow_entry_excuses_only_its_counted_lines_and_only_third_party_code', () => {
  const allow = [{ file: 'kit/vendor/x.mjs', term: 'zorbel', lines: 1 }];
  assert.deepEqual(bannedTerms('kit/vendor/x.mjs', 'zorbel\nzorbel', ['zorbel'], allow).findings, ['kit/vendor/x.mjs: banned term "zorbel" excused on 1 line(s), found on 2'], 'one more line is a finding again');
  const own = [{ file: 'kit/core/y.js', term: 'zorbel', lines: 1 }];
  const r = bannedTerms('kit/core/y.js', 'zorbel', ['zorbel'], own);
  assert.deepEqual(r.findings, ['kit/core/y.js:1: banned term "zorbel"'], 'an entry for kit code outside kit/vendor excuses nothing');
  assert.deepEqual(r.excused, []);
});

test('banned_allow_list_holds_one_entry_for_the_vendored_chart_library_whose_term_is_in_that_file', () => {
  assert.equal(allowList.length, 1);
  const [entry] = allowList;
  assert.equal(entry.file, 'kit/vendor/echarts/echarts-6.1.0.mjs');
  const vendor = readFileSync(new URL(`../../${entry.file}`, import.meta.url), 'utf8');
  assert.equal(bannedTerms(entry.file, vendor, [entry.term], []).findings.length, 1, 'the excused term occurs once in the third-party file');
});

test('check_deps_passes_on_the_repo_and_still_reports_other_terms_in_the_excused_file', () => {
  const ok = run();
  assert.equal(ok.status, 0, ok.stderr);
  const dir = mkdtempSync(join(tmpdir(), 'check-deps-'));
  try {
    const extra = join(dir, 'terms.txt');
    writeFileSync(extra, 'echarts\n');
    const bad = run('--extra-terms-file', extra);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /^kit\/vendor\/echarts\/echarts-6\.1\.0\.mjs:\d+: banned term "echarts"$/m);
    assert.doesNotMatch(bad.stderr, new RegExp(`banned term "${allowList[0].term}"`));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
