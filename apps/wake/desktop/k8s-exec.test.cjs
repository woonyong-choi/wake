const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createClient, execConsentKey } = require('./k8s.cjs');

/* exec 인증 도구 대역: 실행될 때마다 표시 파일에 한 줄, 받은 환경을 env 파일에 남기고 ExecCredential을 출력 */
function fixture(t, args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-exec-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const marker = path.join(dir, 'runs'), envFile = path.join(dir, 'env'), command = path.join(dir, 'auth-helper');
  fs.writeFileSync(command, `#!/bin/sh\necho run >> "${marker}"\nenv > "${envFile}"\nsleep 0.2\necho '{"apiVersion":"client.authentication.k8s.io/v1beta1","kind":"ExecCredential","status":{"token":"synthetic","expirationTimestamp":"2099-01-01T00:00:00Z"}}'\n`, { mode: 0o755 });
  const kc = { contexts: new Map([['lab', { cluster: 'c', user: 'u' }]]), clusters: new Map([['c', { server: 'https://127.0.0.1:1' }]]),
    users: new Map([['u', { exec: { apiVersion: 'client.authentication.k8s.io/v1beta1', command, args, env: [{ name: 'PLUGIN_ONLY', value: 'yes' }] } }]]) };
  const runs = () => (fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim().split('\n').length : 0);
  return { kc, command, runs, env: () => fs.readFileSync(envFile, 'utf8') };
}

test('exec_plugin_does_not_run_before_the_person_consents_to_that_exact_command_and_args', async t => {
  const f = fixture(t, ['token', '--consent-case']);
  const granted = new Set();
  const client = createClient(f.kc, 'lab', { execConsent: { granted: key => granted.has(key) } });
  await assert.rejects(client.credentials(), error => error.kind === 'needs_consent' && error.command === f.command
    && JSON.stringify(error.args) === JSON.stringify(['token', '--consent-case']));
  assert.throws(() => client.checkExec(), error => error.kind === 'needs_consent');
  assert.equal(f.runs(), 0, 'the plugin never ran without consent');
  granted.add(execConsentKey(f.command, ['token', '--consent-case']));
  assert.equal((await client.credentials()).token, 'synthetic');
  assert.equal(f.runs(), 1);
  /* 다른 인자는 다른 명령: 다시 동의가 필요하다 */
  const other = fixture(t, ['token', '--other']);
  await assert.rejects(createClient(other.kc, 'lab', { execConsent: { granted: key => granted.has(key) } }).credentials(), error => error.kind === 'needs_consent');
});

test('exec_plugin_gets_an_allow_listed_environment_not_the_whole_process_environment', async t => {
  const f = fixture(t, ['token', '--env-case']);
  const env = { PATH: '/usr/bin:/bin', HOME: os.homedir(), AWS_PROFILE: 'lab', CLOUDSDK_CONFIG: '/tmp/gcloud', LC_ALL: 'C', OPENAI_API_KEY: 'must-not-leak', GITHUB_TOKEN: 'must-not-leak' };
  await createClient(f.kc, 'lab', { env }).credentials();
  const seen = f.env();
  assert.match(seen, /^AWS_PROFILE=lab$/m);
  assert.match(seen, /^CLOUDSDK_CONFIG=\/tmp\/gcloud$/m);
  assert.match(seen, /^PLUGIN_ONLY=yes$/m);
  assert.match(seen, /^KUBERNETES_EXEC_INFO=/m);
  assert.doesNotMatch(seen, /must-not-leak/, 'unrelated secrets in the app environment reach the plugin');
});

test('concurrent_credential_refreshes_for_one_plugin_share_one_run', async t => {
  const f = fixture(t, ['token', '--share-case']);
  const client = createClient(f.kc, 'lab', { env: { PATH: '/usr/bin:/bin' } });
  const results = await Promise.all([client.credentials(), client.credentials(), client.credentials()]);
  assert.deepEqual(results.map(r => r.token), ['synthetic', 'synthetic', 'synthetic']);
  assert.equal(f.runs(), 1, 'three refreshes in flight ran the plugin once');
});
