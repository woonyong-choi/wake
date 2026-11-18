/* conn-ops: GitOps 대상 나누기(K-07)와 Slack 보내기 감사(S-09). 클러스터·키체인·fetch는 대역. node --test apps/wake/desktop/conn-ops.test.cjs */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createConnOps } = require('./conn-ops.cjs');

const keychain = values => ({ get: ref => values[ref], set() { return 'r'; }, delete() {} });

test('gitops_target_splits_on_the_last_slash_so_a_cluster_id_with_slashes_is_kept_whole', async () => {
  const asked = [];
  const client = id => { asked.push(id); return { request: async (_m, route) => (route.includes('applications') ? { items: [] } : {}) }; };
  const ops = createConnOps({ keychain: keychain({}), conns: () => ({}), saveConns() {}, client });
  const cluster = 'arn:aws:eks:ap-northeast-2:111122223333:cluster/prod';
  assert.deepEqual(await ops.verify({ method: 'gitops', target: `${cluster}/argocd` }), { ok: true, identity: null });
  assert.deepEqual(asked, [cluster]);
});

test('slack_send_leaves_an_audit_row_with_the_result_and_never_the_webhook_or_text', async t => {
  const url = 'https://hooks.slack.com/services/T000/B000/fakefakefake';
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  const rows = [];
  const ops = createConnOps({ keychain: keychain({ r1: url }), conns: () => ({ secrets: { 'notify:slack': 'r1' } }), saveConns() {}, client: () => null, audit: r => rows.push(r) });
  globalThis.fetch = async () => ({ status: 200, text: async () => 'ok' });
  assert.deepEqual(await ops.send({ target: 'slack', text: '장애 요약 password=x' }), { ok: true });
  globalThis.fetch = async () => ({ status: 404, text: async () => 'no_service' });
  assert.deepEqual(await ops.send({ target: 'slack', text: 'two' }), { error: '404' });
  assert.deepEqual(rows.map(r => [r.action, r.target, r.result, r.permission, r.requester.kind, r.size]),
    [['notify.send', 'slack', 'ok', 'write', 'human', { n: 16, unit: 'chars' }], ['notify.send', 'slack', 'failed', 'write', 'human', { n: 3, unit: 'chars' }]]);
  assert.doesNotMatch(JSON.stringify(rows), /hooks\.slack|fakefake|장애 요약/);
});

/* B3-14: settings › Git said "github 연결 안 됨" with no way to connect. A GitHub token (the one the Draft PR path reads: secret github:token) is
   saved to the keychain and checked against the GitHub API like the other keyed connections */
test('a_github_token_is_kept_in_the_keychain_under_the_name_the_draft_pr_path_reads_and_checked_against_github', async t => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  let store = {}; const saved = {};
  const kc = { get: ref => saved[ref], set(v) { saved.g1 = v; return 'g1'; }, delete() {} };
  const ops = createConnOps({ keychain: kc, conns: () => store, saveConns: c => { store = c; }, client: () => null });
  assert.deepEqual(ops.save({ method: 'github', target: 'token', values: { key: 'github_pat_fake' } }), { ok: true });
  assert.equal(store.secrets['github:token'], 'g1');
  const asked = [];
  globalThis.fetch = async (url, init) => { asked.push([url, init.headers.authorization]); return { status: 200, text: async () => '{}' }; };
  assert.deepEqual(await ops.verify({ method: 'github', target: 'token' }), { ok: true });
  assert.deepEqual(asked, [['https://api.github.com/user', 'Bearer github_pat_fake']]);
  globalThis.fetch = async () => ({ status: 401, text: async () => 'Bad credentials' });
  assert.equal((await ops.verify({ method: 'github', target: 'token' })).cause, 'unauthorized');
  assert.equal((await ops.step({ method: 'github', target: 'token', step: 'authn' })).cause, 'unauthorized');
});
