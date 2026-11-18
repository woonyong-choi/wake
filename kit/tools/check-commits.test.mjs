import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const USER = Object.fromEntries(['name', 'email'].map(key => [key,
  execFileSync('git', ['config', `user.${key}`], { cwd: ROOT, encoding: 'utf8' }).trim(),
]));
const VALID_MESSAGE = 'fix(kit): \uac80\uc0ac \uaddc\uce59 \uc218\uc815';

function createRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'kit-commits-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  const git = (...args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'topic');
  git('config', 'user.name', USER.name);
  git('config', 'user.email', USER.email);
  mkdirSync(join(root, 'kit/tools'), { recursive: true });
  const script = join(root, 'kit/tools/check-commits.mjs');
  copyFileSync(join(ROOT, 'kit/tools/check-commits.mjs'), script);
  const bannedFile = join(root, 'denylist.txt');
  writeFileSync(bannedFile, 'BlockedFixtureName\n');
  let head;

  function commit(message = VALID_MESSAGE, options = {}) {
    if (options.added !== undefined) {
      writeFileSync(join(root, 'content.txt'), options.added);
      git('add', 'content.txt');
    }
    const tree = git('write-tree');
    head = execFileSync('git', ['commit-tree', tree, ...(head ? ['-p', head] : [])], {
      cwd: root, encoding: 'utf8', input: message, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...env, GIT_AUTHOR_NAME: USER.name, GIT_AUTHOR_EMAIL: USER.email,
        GIT_COMMITTER_NAME: USER.name, GIT_COMMITTER_EMAIL: USER.email, ...options.identity },
    }).trim();
    git('update-ref', 'HEAD', head);
    return head;
  }

  function check(options = {}) {
    const checkEnv = { ...env, KIT_BANNED_NAMES: bannedFile, ...options.env };
    if (checkEnv.KIT_BANNED_NAMES === undefined) delete checkEnv.KIT_BANNED_NAMES;
    const result = spawnSync(process.execPath, [script, ...(options.args ?? ['--range', 'HEAD~1..HEAD'])], {
      cwd: root, env: checkEnv, encoding: 'utf8', timeout: 10000,
    });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  }

  const base = commit();
  git('update-ref', 'refs/remotes/origin/main', base);
  return { root, git, commit, check };
}

test('check_commits_subject_rules_accept_valid_and_reject_invalid_messages', async t => {
  const repo = createRepo(t);
  const cases = [
    ...['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'style', 'build', 'ci', 'chore', 'revert']
      .map(type => [`type ${type}`, `${type}(kit): \uac80\uc0ac \uc218\uc815`, 0]),
    ...['\ucd94\uac00', '\uc81c\uac70', '\uc218\uc815', '\ubcc0\uacbd', '\uac1c\uc120', '\ubd84\ub9ac', '\ud1b5\ud569', '\uc774\ub3d9', '\uc815\ub9ac', '\uac31\uc2e0', '\uc801\uc6a9', '\ub3c4\uc785', '\ub418\ub3cc\ub9bc']
      .map(ending => [`ending ${ending}`, `fix(kit): \uac80\uc0ac ${ending}`, 0]),
    ['breaking change', 'fix(kit)!: \uac80\uc0ac \uc218\uc815', 0],
    ['scope characters', 'fix(kit-2): \uac80\uc0ac \uc218\uc815', 0],
    ['squash suffix', `${VALID_MESSAGE} (#123)`, 0],
    ['Unicode issue digits', `${VALID_MESSAGE} (#１２３)`, 0],
    ['72 code points', `fix(kit): ${'\uac00'.repeat(70)}\uc218\uc815`, 0],
    ['73 code points', `fix(kit): ${'\uac00'.repeat(71)}\uc218\uc815`, 1],
    ['72 astral code points with suffix', `fix(kit): ${'\u{1F680}'.repeat(70)}\uc218\uc815 (#123)`, 0],
    ['73 astral code points', `fix(kit): ${'\u{1F680}'.repeat(71)}\uc218\uc815`, 1],
    ['leading comments and blanks', `\n# template\n \n${VALID_MESSAGE}\n\n- \uac80\uc0ac \uc801\uc6a9\n`, 0],
    ['comments only', '# template\n\n# another line', 1],
    ['Unicode blank lines', `\u0085\u001f\n\u00a0\n${VALID_MESSAGE}`, 0],
    ['BOM is not blank', `\ufeff\n${VALID_MESSAGE}`, 1],
    ['empty', '', 1],
    ['unknown type', 'feature(kit): \uac80\uc0ac \uc218\uc815', 1],
    ['missing scope', 'fix: \uac80\uc0ac \uc218\uc815', 1],
    ['empty scope', 'fix(): \uac80\uc0ac \uc218\uc815', 1],
    ['uppercase scope', 'fix(Kit): \uac80\uc0ac \uc218\uc815', 1],
    ['numeric scope', 'fix(2kit): \uac80\uc0ac \uc218\uc815', 1],
    ['underscore scope', 'fix(kit_tools): \uac80\uc0ac \uc218\uc815', 1],
    ['missing space', 'fix(kit):\uac80\uc0ac \uc218\uc815', 1],
    ['missing Korean', 'fix(kit): update validation', 1],
    ['unapproved ending', 'fix(kit): \uac80\uc0ac \uc644\ub8cc', 1],
    ['sentence', 'fix(kit): \uac80\uc0ac\ub97c \uc218\uc815\ud55c\ub2e4', 1],
    ...['.', '!', '?', ' '].map(suffix => [`trailing ${JSON.stringify(suffix)}`, VALID_MESSAGE + suffix, 1]),
    ['invalid issue suffix', `${VALID_MESSAGE} (#abc)`, 1],
    ['two issue suffixes', `${VALID_MESSAGE} (#1) (#2)`, 1],
    ['indented comment', ` # template\n${VALID_MESSAGE}`, 1],
  ];

  for (const [label, message, expected] of cases) {
    await t.test(label, () => {
      repo.commit(message);
      const result = repo.check();
      assert.equal(result.status, expected, `subject rule: ${label}`);
      if (expected) assert.match(result.output, /subject/);
    });
  }
});

test('check_commits_identity_uses_email_and_limits_the_committer_exception', async t => {
  const repo = createRepo(t);
  const cases = [
    ['different display names', { GIT_AUTHOR_NAME: 'Different Author', GIT_COMMITTER_NAME: 'Different Committer' }, 0],
    ['hosting committer', { GIT_COMMITTER_NAME: 'Hosting Service', GIT_COMMITTER_EMAIL: 'noreply@github.com' }, 0],
    ['foreign author', { GIT_AUTHOR_EMAIL: 'other@example.invalid' }, 1],
    ['foreign committer', { GIT_COMMITTER_EMAIL: 'other@example.invalid' }, 1],
    ['hosting email as author', { GIT_AUTHOR_EMAIL: 'noreply@github.com' }, 1],
    ['lookalike hosting email', { GIT_COMMITTER_EMAIL: 'noreply@github.com.invalid' }, 1],
  ];

  for (const [label, identity, expected] of cases) {
    await t.test(label, () => {
      repo.commit(VALID_MESSAGE, { identity });
      assert.equal(repo.check().status, expected, `identity rule: ${label}`);
    });
  }
});

test('check_commits_requires_environment_file_and_ignores_legacy_default', t => {
  const repo = createRepo(t);
  repo.commit();
  mkdirSync(join(repo.root, '.local'));
  writeFileSync(join(repo.root, '.local/banned-names.txt'), '\uac80\uc0ac\n');

  assert.equal(repo.check().status, 0);
  for (const value of [undefined, '', join(repo.root, 'missing.txt'), repo.root]) {
    const result = repo.check({ env: { KIT_BANNED_NAMES: value } });
    assert.equal(result.status, 1);
    assert.match(result.output, /KIT_BANNED_NAMES/);
  }
});

test('check_commits_default_range_includes_all_commits_since_origin_main', t => {
  const repo = createRepo(t);
  repo.commit('fix: \uac80\uc0ac \uc218\uc815');
  const head = repo.commit();
  repo.git('update-ref', 'refs/remotes/origin/topic', head);
  repo.git('config', 'remote.origin.url', '.');
  repo.git('config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*');
  repo.git('config', 'branch.topic.remote', 'origin');
  repo.git('config', 'branch.topic.merge', 'refs/heads/topic');

  const result = repo.check({ args: [] });
  assert.equal(result.status, 1);
  assert.match(result.output, /in 2 commit\(s\)/);
  assert.equal(repo.check({ args: ['--range', 'HEAD~1..HEAD'] }).status, 0);
});

test('check_commits_default_range_without_upstream_checks_all_new_commits', t => {
  const repo = createRepo(t);
  repo.commit('fix: \uac80\uc0ac \uc218\uc815');
  repo.commit();

  const result = repo.check({ args: [] });
  assert.equal(result.status, 1);
  assert.match(result.output, /in 2 commit\(s\)/);
});

test('check_commits_preserves_banned_name_trace_secret_and_body_checks', async t => {
  const repo = createRepo(t);
  const trace = ['co-authored', 'by: Someone <someone@example.invalid>'].join('-');
  const cases = [
    ['banned message', `${VALID_MESSAGE}\n\nBlockedFixtureName`, '', /banned name/],
    ['banned addition', VALID_MESSAGE, 'BlockedFixtureName', /banned name/],
    ['message trace', `${VALID_MESSAGE}\n\n${trace}`, '', /authoring trace/],
    ['comment trace', `# ${trace}\n${VALID_MESSAGE}`, '', /authoring trace/],
    ['added trace', VALID_MESSAGE, trace, /authoring trace/],
    ['sentence body', `${VALID_MESSAGE}\n\n- \uac80\uc0ac\ub97c \uace0\ucce4\ub2e4.`, '', /body line/],
    ['access key', VALID_MESSAGE, 'AKIA' + 'A'.repeat(16), /AWS access key/],
    ['private key', VALID_MESSAGE, ['-----BEGIN', 'PRIVATE KEY-----'].join(' '), /private key/],
    ['hosting token', VALID_MESSAGE, 'ghp_' + 'a'.repeat(36), /GitHub token/],
    ['chat token', VALID_MESSAGE, 'xoxb-' + 'a'.repeat(10), /Slack token/],
    ['API key', VALID_MESSAGE, 'sk-' + 'a'.repeat(32), /API key/],
    ['webhook', VALID_MESSAGE, ['hooks.slack.com', 'services', 'A', 'B', 'c'].join('/'), /Slack webhook/],
    ['JWT', VALID_MESSAGE, ['eyJ' + 'a'.repeat(20), 'eyJ' + 'b'.repeat(20), 'c'.repeat(20)].join('.'), /JWT/],
  ];

  for (const [label, message, added, finding] of cases) {
    await t.test(label, () => {
      repo.commit(message, { added });
      const result = repo.check();
      assert.equal(result.status, 1, label);
      assert.match(result.output, finding);
      assert.doesNotMatch(result.output, /BlockedFixtureName/);
    });
  }
  repo.commit(VALID_MESSAGE, { added: 'example: ' + 'AKIA' + 'A'.repeat(16) });
  assert.equal(repo.check().status, 0);
});
