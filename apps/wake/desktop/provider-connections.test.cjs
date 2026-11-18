const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createServer } = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createClient } = require('./k8s.cjs');
const { createProviderConnections } = require('./provider-connections.cjs');

function kubeconfig(id, server, exec, file = 'fixture-config') {
  return {
    current: id,
    contexts: new Map([[id, { cluster: 'fixture-cluster', user: 'shared-user', file }]]),
    clusters: new Map([['fixture-cluster', { server, file }]]),
    users: new Map([['shared-user', { exec, file }]]),
  };
}

function pluginFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-exec-fixture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const entry = path.join(directory, 'credential.cjs');
  fs.writeFileSync(entry, `
const fs = require('node:fs');
const marker = process.argv[2];
const count = fs.existsSync(marker) ? Number(fs.readFileSync(marker, 'utf8')) + 1 : 1;
fs.writeFileSync(marker, String(count));
process.stdout.write(JSON.stringify({ status: { token: process.env.FIXTURE_ACCOUNT + '-' + count } }));
`);
  return { directory, args: [entry, path.join(directory, 'count')] };
}

test('exec_credentials_are_isolated_by_context_source_actor_and_effective_account', async t => {
  const { args } = pluginFixture(t);
  const server = 'https://fixture.invalid';
  function client(id, account, file, credentialScope) {
    const exec = { command: process.execPath, args, env: [{ name: 'FIXTURE_ACCOUNT', value: account }] };
    return createClient(kubeconfig(id, server, exec, file), id, { env: {}, credentialScope });
  }

  const primary = client('gke_primary', 'observer');
  assert.equal((await primary.credentials()).token, 'observer-1');
  assert.equal((await client('gke_primary', 'observer').credentials()).token, 'observer-1');
  assert.equal((await client('gke_second', 'observer').credentials()).token, 'observer-2');
  assert.equal((await client('gke_primary', 'other-account').credentials()).token, 'other-account-3');
  assert.equal((await client('gke_primary', 'observer', 'second-config').credentials()).token, 'observer-4');
  assert.equal((await client('gke_primary', 'observer', undefined, 'tool-operator').credentials()).token, 'observer-5');
});

test('provider_probe_and_access_use_the_kubeconfig_exec_path', { skip: process.platform === 'win32' }, async t => {
  const { directory, args } = pluginFixture(t);
  const command = 'wake-fixture-auth-plugin';
  fs.symlinkSync(process.execPath, path.join(directory, command));
  const authorizations = [];
  const server = createServer((req, res) => {
    authorizations.push(req.headers.authorization);
    const response = req.url === '/version' ? { gitVersion: 'v1.35.0' }
      : req.url.includes('selfsubjectreviews') ? { status: { userInfo: { username: 'observer' } } }
      : req.url.includes('selfsubjectaccessreviews') ? { status: { allowed: true } }
      : { items: [{ metadata: { name: 'fixture-ns' } }] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(response));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const id = 'gke_probe';
  const exec = { command, args, env: [{ name: 'PATH', value: directory }, { name: 'FIXTURE_ACCOUNT', value: 'observer' }] };
  const config = kubeconfig(id, 'http://127.0.0.1:' + server.address().port, exec);
  const providers = createProviderConnections({ load: () => config, createClient: (source, context) => createClient(source, context, { env: {} }) });
  const steps = [];

  const result = await providers.probe(id, { onStep: step => steps.push(step) });
  assert.equal(result.state, 'ok');
  assert.equal(result.username, 'observer');
  assert.deepEqual(steps, ['authTool', 'reach', 'cert', 'authn', 'version', 'perm']);
  assert.equal(providers.registeredClient(id).provider, 'gke');
  assert.deepEqual(await providers.access(id), [{ ns: 'fixture-ns', read: true, write: true, secret: true }]);
  assert.ok(authorizations.length > 1);
  assert.deepEqual([...new Set(authorizations)], ['Bearer observer-1']);
});

/* H-009 갱신 경로 부하: 한 클러스터에 동시에 나가는 API 요청 수 상한, 같은 GET이 진행 중이면 한 요청을 같이 쓴다(다른 클러스터는 막지 않음) */
test('cluster_requests_are_capped_per_cluster_and_identical_gets_in_flight_are_shared', async () => {
  let active = 0, peak = 0, sent = 0;
  const waits = [];
  const fake = () => ({ request: (method, p) => { sent++; active++; peak = Math.max(peak, active); return new Promise(resolve => waits.push(() => { active--; resolve({ path: p }); })); } });
  const providers = createProviderConnections({ load: () => ({ contexts: new Map(), clusters: new Map(), users: new Map() }), createClient: fake });
  const reads = Array.from({ length: 12 }, (_, i) => providers.client('a').request('GET', `/api/v1/kind${i}`));
  const same = [providers.client('a').request('GET', '/api/v1/kind0'), providers.client('a').request('GET', '/api/v1/kind0')];
  const other = providers.client('b').request('GET', '/api/v1/pods');
  await new Promise(r => setImmediate(r));
  assert.ok(peak <= 7, `cluster a peak ${peak}`);
  assert.ok(waits.length >= 1 && waits.length <= 7, 'cluster b is not held behind cluster a');
  while (waits.length) { waits.shift()(); await new Promise(r => setImmediate(r)); }
  await Promise.all([...reads, ...same, other]);
  assert.equal(sent, 13, 'twelve paths and the other cluster, the repeated GETs shared');
  assert.equal(peak <= 7, true);
});
