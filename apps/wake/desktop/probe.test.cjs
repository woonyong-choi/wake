const assert = require('node:assert/strict');
const test = require('node:test');
const { probe } = require('./probe.cjs');
const { K8sError } = require('./k8s.cjs');

test('probe_reads_cluster_identity_from_namespace_uid_and_does_not_invent_it', async () => {
  for (const uid of ['uid-before', 'uid-after', null]) {
    const reads = [];
    const client = { namespace: 'default', checkExec() {}, async reach() {}, async handshake() {}, async request(method, path) {
      reads.push(path);
      if (path.endsWith('selfsubjectreviews')) return { status: { userInfo: { username: 'reader' } } };
      if (path.endsWith('selfsubjectaccessreviews')) return { status: { allowed: true } };
      if (path === '/version') return { gitVersion: 'v1.36.0' };
      if (path === '/api/v1/namespaces/kube-system') {
        if (uid === null) throw new K8sError('forbidden', 'namespace identity denied', { status: 403 });
        return { metadata: { uid } };
      }
      if (path === '/api/v1/nodes') return { items: [] };
      throw Error('unexpected request');
    } };
    const result = await probe(() => client);
    assert.deepEqual(result.identity, uid ? { uid, ref: 'Namespace/kube-system' } : null);
    assert.equal(result.identityError, uid ? null : 'forbidden');
    assert.ok(reads.includes('/api/v1/namespaces/kube-system'));
    assert.equal(reads.some(path => path.includes('secrets')), false);
  }
});

test('probe_starts_permission_reads_while_namespace_identity_is_pending', async () => {
  let releaseIdentity, identityStarted;
  const started = new Promise(resolve => { identityStarted = resolve; });
  const permissions = [];
  const client = { namespace: 'default', checkExec() {}, async reach() {}, async handshake() {}, async request(method, path, body) {
    if (path.endsWith('selfsubjectreviews')) return {};
    if (path === '/version') return { gitVersion: 'v1.36.0' };
    if (path === '/api/v1/namespaces/kube-system') {
      identityStarted();
      return new Promise(resolve => { releaseIdentity = resolve; });
    }
    if (path.endsWith('selfsubjectaccessreviews')) { permissions.push(body.spec.resourceAttributes.resource); return { status: { allowed: false } }; }
    throw Error('unexpected request');
  } };
  const pending = probe(() => client);
  await started;
  const concurrent = [...permissions];
  releaseIdentity({ metadata: { uid: 'same' } });
  const result = await pending;
  assert.deepEqual(concurrent.sort(), ['namespaces', 'pods']);
  assert.equal(result.state, 'forbidden');
  assert.equal(result.identity.uid, 'same');
});

test('probe_waiting_for_exec_consent_stops_at_the_auth_tool_step_and_returns_the_exact_command_and_args', async () => {
  const requests = [];
  const client = { namespace: 'default', checkExec() { throw new K8sError('needs_consent', '/usr/local/bin/aws: running this authentication command needs your consent', { code: 'EXEC_CONSENT_REQUIRED', command: '/usr/local/bin/aws', args: ['eks', 'get-token', '--cluster-name', 'prod'] }); },
    async reach() { requests.push('reach'); }, async handshake() {}, async request(m, p) { requests.push(p); return {}; } };
  const result = await probe(() => client);
  assert.equal(result.state, 'needs_consent');
  assert.equal(result.step, 2, 'the auth tool step, before anything reaches the server');
  assert.equal(result.code, 'EXEC_CONSENT_REQUIRED');
  assert.equal(result.command, '/usr/local/bin/aws');
  assert.deepEqual(result.args, ['eks', 'get-token', '--cluster-name', 'prod'], 'the consent screen shows the arguments that will run');
  assert.deepEqual(requests, []);
});
