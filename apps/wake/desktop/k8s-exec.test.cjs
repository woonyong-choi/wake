const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createClient, execConsentKey, execInvocation } = require('./k8s.cjs');

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
  granted.add(execConsentKey(execInvocation(f.kc.users.get('u').exec, process.env)));
  assert.equal((await client.credentials()).token, 'synthetic');
  assert.equal(f.runs(), 1);
  /* 다른 인자는 다른 명령: 다시 동의가 필요하다 */
  const other = fixture(t, ['token', '--other']);
  await assert.rejects(createClient(other.kc, 'lab', { execConsent: { granted: key => granted.has(key) } }).credentials(), error => error.kind === 'needs_consent');
});

/* review 7: an edited kubeconfig kept the command and arguments and changed exec.env; the earlier consent was reused and the plugin ran with the
   new environment. Consent is bound to the executable file, the arguments and the kubeconfig environment; what is shown or kept of it names
   the environment variables without their values */
test('exec_plugin_consent_is_asked_again_when_the_kubeconfig_environment_or_the_executable_changes_and_never_shows_env_values', async t => {
  const f = fixture(t, ['token', '--env-bound']);
  const granted = new Set(), consent = { granted: key => granted.has(key) };
  const exec = f.kc.users.get('u').exec;
  granted.add(execConsentKey(execInvocation(exec, process.env)));
  assert.equal((await createClient(f.kc, 'lab', { execConsent: consent }).credentials()).token, 'synthetic');
  assert.equal(f.runs(), 1);
  exec.env = [{ name: 'PLUGIN_ONLY', value: 'changed-synthetic-value' }];
  await assert.rejects(createClient(f.kc, 'lab', { execConsent: consent }).credentials(), error => error.kind === 'needs_consent'
    && JSON.stringify(error.env) === JSON.stringify(['PLUGIN_ONLY']) && !JSON.stringify(error).includes('changed-synthetic-value'));
  assert.equal(f.runs(), 1, 'the plugin did not run with the changed environment');
  exec.env = [{ name: 'PLUGIN_ONLY', value: 'yes' }, { name: 'EXTRA', value: '1' }];
  assert.throws(() => createClient(f.kc, 'lab', { execConsent: consent }).checkExec(), error => error.kind === 'needs_consent', 'an added variable');
  exec.env = [{ name: 'PLUGIN_ONLY', value: 'yes' }];
  assert.doesNotThrow(() => createClient(f.kc, 'lab', { execConsent: consent }).checkExec(), 'the consented environment again');
  /* the same path now holds another program */
  fs.rmSync(f.command);
  fs.writeFileSync(f.command, '#!/bin/sh\necho other\n', { mode: 0o755 });
  assert.throws(() => createClient(f.kc, 'lab', { execConsent: consent }).checkExec(), error => error.kind === 'needs_consent', 'a replaced executable');
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

/* An exec plugin that answers with a client certificate gives PEM text (ExecCredential status.clientCertificateData/clientKeyData), while the
   kubeconfig fields hold base64. The plugin's PEM was decoded as base64 and the TLS handshake failed (PEM NO_START_LINE) */
test('exec_plugin_client_certificate_pem_is_used_as_pem', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-exec-pem-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pem = '-----BEGIN CERTIFICATE-----\nc3ludGhldGlj\n-----END CERTIFICATE-----\n', command = path.join(dir, 'auth-helper');
  fs.writeFileSync(path.join(dir, 'cred.json'), JSON.stringify({ apiVersion: 'client.authentication.k8s.io/v1beta1', kind: 'ExecCredential', status: { clientCertificateData: pem, clientKeyData: pem.replaceAll('CERTIFICATE', 'PRIVATE KEY') } }));
  fs.writeFileSync(command, `#!/bin/sh\ncat '${path.join(dir, 'cred.json')}'\n`, { mode: 0o755 });
  const kc = { contexts: new Map([['lab', { cluster: 'c', user: 'u' }]]), clusters: new Map([['c', { server: 'https://127.0.0.1:1' }]]),
    users: new Map([['u', { exec: { apiVersion: 'client.authentication.k8s.io/v1beta1', command, args: ['pem'] } }]]) };
  const cred = await createClient(kc, 'lab', { env: { PATH: '/usr/bin:/bin' } }).credentials();
  assert.equal(Buffer.from(cred.cert, 'base64').toString('utf8'), pem, 'the PEM reaches TLS as is');
  assert.match(Buffer.from(cred.key, 'base64').toString('utf8'), /BEGIN PRIVATE KEY/);
});
