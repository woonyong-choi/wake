const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createToolBootstrap, loadOperatorReceipts, enrollOperatorCredential } = require('./tool-bootstrap.cjs');
const { createToolConnect } = require('./tool-connect.cjs');
const uid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
function setup(t, kind = 'grafana') {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-bootstrap-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const url = new URL('https://operator.invalid/');
  const entry = { contextId: 'cluster-a', kind, namespace: 'observability', namespaceUid: uid(1), serviceName: kind, serviceUid: uid(2),
    podName: 'tool-pod', podUid: uid(3), secretName: 'admin', secretUid: uid(4), evidence: { mode: 'helm-workload-ref', release: { name: 'tool', namespace: 'observability' } },
    operatorKubeconfig: '/synthetic/operator', operatorContext: 'operator', expiresAt: new Date(Date.now() + 120000).toISOString(), serverSha256: createHash('sha256').update(url.href).digest('hex') };
  const binding = { contextId: entry.contextId, kind, namespace: entry.namespace, serviceName: entry.serviceName, serviceUid: entry.serviceUid, podName: entry.podName, podUid: entry.podUid, port: 80 };
  const keys = kind === 'grafana' ? ['admin-user', 'admin-password'] : ['password'];
  const state = { reads: 0, validations: 0, changed: false, rawCredential: false }, calls = [], buffers = [], audits = [];
  const pod = { metadata: { uid: uid(3) }, spec: { containers: [{ name: 'tool', env: keys.map(key => ({ name: key, valueFrom: { secretKeyRef: { name: 'admin', key } } })) }] } };
  const cluster = { 'certificate-authority-data': 'Y2E=' };
  const c = { url, cluster, user: { tokenRef: 'operator-only-ref' },
    async getMetadata(input) { assert.equal(input.uid, uid(1)); return { metadata: { uid: state.changed ? uid(9) : uid(1) } }; },
    async getToolSecretMetadata(input) { calls.push(input); return { metadata: { uid: input.uid, resourceVersion: '123' }, ownershipMatched: true }; },
    async getToolBootstrapSecret(input) { state.reads++; assert.deepEqual(input.dataKeys, keys); const data = Object.fromEntries(keys.map(key => [key, Buffer.from(key === 'admin-user' ? 'admin' : 'synthetic-bootstrap-password')])); buffers.push(...Object.values(data)); return { data, metadata: { resourceVersion: '123' } }; },
    async request(method, route) { assert.equal(method, 'GET'); assert.ok(route.endsWith('/pods/tool-pod')); return structuredClone(pod); },
  };
  const file = path.join(userData, 'tool-bootstrap-operators.json');
  const save = () => fs.writeFileSync(file, JSON.stringify({ version: 1, entries: [entry] }), { mode: 0o600 }); save();
  const bootstrap = createToolBootstrap({ userData, operatorClient: () => { if (state.rawCredential) return { ...c, user: { token: 'forbidden-plaintext' } }; return c; }, registeredClient: () => ({ url, cluster, provider: 'gke' }), audit: row => audits.push(row) });
  const validate = async () => { state.validations++; if (state.changed) throw new Error('synthetic-bootstrap-password'); };
  return { bootstrap, entry, binding, state, calls, buffers, audits, userData, file, save, pod, c, validate };
}
test('operator bootstrap uses one Secret body read and existing issuance stores only reader reference', async t => {
  for (const kind of ['grafana', 'argocd']) {
    const f = setup(t, kind); let config = {}; const stored = new Map(), http = [];
    let issuedId, expiration;
    const fetcher = async (url, options) => {
      http.push({ url, options }); assert.equal(options.redirect, 'error'); assert.equal(new URL(url).origin, 'http://127.0.0.1:1234');
      const route = new URL(url).pathname;
      if (route === '/api/v1/session') return new Response(JSON.stringify({ token: 'synthetic-admin-jwt' }));
      if (options.headers.authorization === 'Bearer synthetic-reader-token') {
        assert.equal(route, kind === 'grafana' ? '/api/search' : '/api/v1/applications');
        return Response.json(kind === 'grafana' ? [] : { items: [] });
      }
      assert.match(options.headers.authorization, /^(Basic |Bearer synthetic-admin-jwt)/);
      const sent = options.body ? JSON.parse(options.body) : null;
      if (new URL(url).pathname.endsWith('/tokens') && options.method === 'POST') { assert.ok(sent.secondsToLive > 0 && sent.secondsToLive <= 120); expiration = Math.floor(Date.now() / 1000) + sent.secondsToLive; }
      if (new URL(url).pathname.endsWith('/token') && options.method === 'POST') { assert.ok(sent.expiresIn > 0 && sent.expiresIn <= 120); issuedId = sent.id; expiration = Math.floor(Date.now() / 1000) + sent.expiresIn; }
      if (route.endsWith('/tokens') && options.method === 'GET') return new Response(JSON.stringify([{ id: 18, expiration: new Date(expiration * 1000).toISOString() }]));
      let body = route.includes('serviceaccounts/search') ? { serviceAccounts: [], totalCount: 0 } : route === '/api/serviceaccounts' ? { id: 17, name: 'wake-reader', role: 'Viewer' }
        : route.endsWith('/tokens') ? { key: 'synthetic-reader-token', id: 18 } : route.endsWith('/userinfo') ? { loggedIn: true }
        : route.endsWith('/wake-reader') ? { capabilities: ['apiKey'], ...(issuedId ? { tokens: [{ id: issuedId, expiresAt: String(expiration) }] } : {}) } : route.endsWith('/token') ? { token: 'synthetic-reader-token' } : [];
      return new Response(JSON.stringify(body));
    };
    const ops = createToolConnect({ audit: row => f.audits.push(row), bootstrap: f.bootstrap, client: () => ({}), keychain: { set(v) { stored.set('ref', v); return 'ref'; }, get: id => stored.get(id), delete: id => stored.delete(id) },
      conns: () => structuredClone(config), saveConns: v => { config = structuredClone(v); }, partition: () => ({ fetch: async () => { throw new Error('session must not receive bootstrap secrets'); } }), fetchImpl: fetcher,
      toolAccess: { open: async () => ({ url: 'http://127.0.0.1:1234/', binding: f.binding, validate: f.validate }) } });
    const result = await ops.issue({ key: 'cluster-a-' + kind, cluster: 'cluster-a', tool: { kind } });
    assert.equal(result.ok, true); assert.equal(f.state.reads, 1); assert.equal(stored.get('ref'), 'synthetic-reader-token');
    assert.equal(result.role, kind === 'grafana' ? 'Viewer' : 'unverified');
    assert.doesNotMatch(JSON.stringify({ result, config }), /synthetic-reader-token|synthetic-admin-jwt|synthetic-bootstrap-password/);
    assert.ok(f.buffers.every(buffer => buffer.every(byte => byte === 0)));
    assert.ok(http.every(call => !call.url.includes('synthetic')));
    /* S-09: the admin Secret read and every write to the tool (admin session, service account, token) leave an audit row, never a value */
    assert.deepEqual(f.audits.map(r => [r.action, r.tool, r.scope, r.target, r.result, r.permission]), kind === 'grafana' ? [
      ['tool.adminSecret.read', 'grafana', 'cluster-a', 'Secret/observability/admin', 'ok', 'admin'],
      ['tool.serviceAccount.create', 'grafana', 'cluster-a', 'POST /api/serviceaccounts', 'ok', 'admin'],
      ['tool.token.create', 'grafana', 'cluster-a', 'POST /api/serviceaccounts/17/tokens', 'ok', 'admin'],
    ] : [
      ['tool.adminSecret.read', 'argocd', 'cluster-a', 'Secret/observability/admin', 'ok', 'admin'],
      ['tool.adminSession.create', 'argocd', 'cluster-a', 'POST /api/v1/session', 'ok', 'admin'],
      ['tool.token.create', 'argocd', 'cluster-a', 'POST /api/v1/account/wake-reader/token', 'ok', 'admin'],
    ]);
    assert.doesNotMatch(JSON.stringify(f.audits), /synthetic/);
  }
});
test('receipt or target changes fail closed and never invoke credential callback', async t => {
  for (const mode of ['namespace', 'binding', 'plaintext', 'missing-reference', 'duplicate', 'permission', 'symlink']) {
    const f = setup(t); let used = 0;
    if (mode === 'namespace') f.state.changed = true;
    if (mode === 'binding') f.binding.podUid = uid(9);
    if (mode === 'plaintext') f.state.rawCredential = true;
    if (mode === 'missing-reference') f.pod.spec.containers[0].env = [];
    if (mode === 'duplicate') fs.writeFileSync(f.file, JSON.stringify({ version: 1, entries: [f.entry, f.entry] }));
    if (mode === 'permission') fs.chmodSync(f.file, 0o644);
    if (mode === 'symlink') { fs.renameSync(f.file, f.file + '.original'); fs.symlinkSync(f.file + '.original', f.file); }
    await assert.rejects(() => f.bootstrap.run(f.binding, f.validate, async () => ({}), async () => { used++; }));
    assert.equal(used, 0); assert.equal(f.state.reads, 0);
  }
});

test('the configured Flux receipt only reads its exact target and respects cancellation', async t => {
  const f = setup(t, 'loki');
  Object.assign(f.entry, { secretName: null, secretUid: null, evidence: { mode: 'transport-only' } });
  f.save();
  const namespace = 'gitops';
  const target = { version: 1, contextId: 'cluster-a', operatorContext: 'operator', namespace,
    kustomization: { name: 'checkout', uid: uid(7) }, repository: { name: 'source', uid: uid(8) } };
  fs.writeFileSync(path.join(f.userData, 'flux-read-targets.json'), JSON.stringify(target), { mode: 0o600 });
  const reads = [];
  f.c.request = async (method, route) => {
    assert.equal(method, 'GET');
    reads.push(route);
    const isApp = route.includes('/kustomizations/');
    return isApp
      ? { apiVersion: 'kustomize.toolkit.fluxcd.io/v1', kind: 'Kustomization',
        metadata: { ...target.kustomization, namespace }, spec: { sourceRef: { kind: 'GitRepository', name: 'source' } } }
      : { apiVersion: 'source.toolkit.fluxcd.io/v1', kind: 'GitRepository', metadata: { ...target.repository, namespace } };
  };
  const expected = { ...target.kustomization, namespace };
  for (const different of [{ name: 'other' }, { namespace: 'other' }, { uid: uid(10) }]) {
    assert.equal(await f.bootstrap.readFlux('cluster-a', { expected: { ...expected, ...different } }), null);
  }
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(f.bootstrap.readFlux('cluster-a', { expected, signal: abort.signal }), { name: 'AbortError' });
  assert.equal(reads.length, 0);
  const result = await f.bootstrap.readFlux('cluster-a', { expected });
  assert.equal(result.kustomization.metadata.uid, expected.uid);
  assert.equal(reads.length, 2);
});
test('credential callback failure wipes decoded Secret buffers and returns no upstream cause', async t => {
  const f = setup(t);
  await assert.rejects(() => f.bootstrap.run(f.binding, f.validate, async () => ({}), async () => { f.state.changed = true; throw new Error('synthetic-bootstrap-password'); }), error => {
    assert.equal(error.kind, 'bootstrap_unverified'); assert.doesNotMatch(error.stack, /synthetic-bootstrap-password/); return true;
  });
  assert.deepEqual(f.audits.map(r => [r.action, r.result]), [['tool.adminSecret.read', 'ok']], 'the Secret was read even though the use failed');
  assert.equal(f.state.reads, 1); assert.ok(f.buffers.every(buffer => buffer.every(byte => byte === 0)));
});
test('enrollment persists only tokenRef away from observer kubeconfig discovery and never overwrites', t => {
  const f = setup(t), values = new Map();
  const keychain = { usable: () => true, set(value) { values.set('operator-ref', value); return 'operator-ref'; }, get: key => values.get(key), delete: key => values.delete(key) };
  const input = { keychain, userData: f.userData, contextId: 'operator-context', server: 'https://operator.invalid', certificateAuthorityData: Buffer.from('synthetic CA').toString('base64'), token: 'synthetic-operator-token' };
  const result = enrollOperatorCredential(input);
  assert.equal(result.status, 'stored'); assert.equal(path.dirname(result.operatorKubeconfig), path.join(f.userData, 'operator-credentials'));
  const document = JSON.parse(fs.readFileSync(result.operatorKubeconfig));
  assert.equal(document.users[0].user.tokenRef, 'operator-ref'); assert.equal(document.users[0].user.token, undefined);
  assert.doesNotMatch(fs.readFileSync(result.operatorKubeconfig, 'utf8'), /synthetic-operator-token/);
  assert.equal(fs.statSync(result.operatorKubeconfig).mode & 0o777, 0o600);
  assert.equal(enrollOperatorCredential(input).status, 'blocked');
  assert.equal(values.size, 1);
});
test('enrollment keychain or atomic publish failure preserves unrelated references and reports cleanup failure', t => {
  const f = setup(t); const values = new Map([['existing', 'preserved']]);
  const input = { userData: f.userData, contextId: 'operator', server: 'https://operator.invalid', certificateAuthorityData: 'Y2E=', token: 'synthetic-operator-token' };
  const keychain = { usable: () => true, set(v) { values.set('new', v); throw new Error('synthetic failure'); }, get: key => values.get(key), delete: key => values.delete(key) };
  assert.equal(enrollOperatorCredential({ ...input, keychain }).status, 'credential_cleanup_failed'); assert.equal(values.get('existing'), 'preserved');
  const f2 = setup(t), fsLink = fs.linkSync;
  t.mock.method(fs, 'linkSync', () => { throw new Error('publish failure'); });
  const failing = { usable: () => true, set: () => 'new', get: () => input.token, delete() { throw new Error('synthetic failure'); } };
  assert.equal(enrollOperatorCredential({ ...input, userData: f2.userData, keychain: failing }).status, 'credential_cleanup_failed');
  assert.equal(fs.linkSync === fsLink, false);
});

function attest(f, mode) {
  const grafana = mode === 'wake-operation-attestation';
  f.entry.secretName = grafana ? 'wake-grafana-admin' : 'argocd-initial-admin-secret';
  f.entry.evidence = { mode, purpose: grafana ? 'grafana-admin-session' : 'argocd-initial-admin-session', expiresAt: new Date(Date.now() + 60000).toISOString(),
    secretResourceVersion: '123', deployment: { name: 'server', uid: uid(5), image: 'registry.invalid/tool@sha256:' + 'a'.repeat(64) },
    podImageID: 'containerd://sha256:' + 'a'.repeat(64), transaction: { id: 'fixture-install-operation', artifactSha256: 'b'.repeat(64) },
    ...(grafana ? { creationResourceVersion: null, expectedLabels: { 'wake.dev/owner': 'fixture-owner', 'wake.dev/purpose': 'fixture-purpose' } } : {}) };
  f.pod.metadata.ownerReferences = [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'server-rs', uid: uid(6), controller: true }];
  f.pod.spec.containers[0].image = f.entry.evidence.deployment.image;
  f.pod.status = { containerStatuses: [{ name: 'tool', ready: true, imageID: f.entry.evidence.podImageID }] };
  for (const env of f.pod.spec.containers[0].env) env.valueFrom.secretKeyRef.name = f.entry.secretName;
  const deployment = { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'server', namespace: f.entry.namespace, uid: uid(5) },
    spec: { template: { spec: { containers: [{ image: f.entry.evidence.deployment.image }] } } } };
  const replica = { apiVersion: 'apps/v1', kind: 'ReplicaSet', metadata: { name: 'server-rs', namespace: f.entry.namespace, uid: uid(6),
    ownerReferences: [{ apiVersion: 'apps/v1', kind: 'Deployment', name: 'server', uid: uid(5), controller: true }] } };
  f.c.request = async (method, route) => {
    assert.equal(method, 'GET');
    if (route.endsWith('/deployments/server')) return structuredClone(deployment);
    if (route.endsWith('/replicasets/server-rs')) return structuredClone(replica);
    assert.ok(route.endsWith('/pods/tool-pod')); return structuredClone(f.pod);
  };
  f.save(); return { replica, deployment };
}
test('GKE attestations are distinct typed credential sources and reject expiry or owner chain changes', async t => {
  for (const mode of ['operator-attestation', 'wake-operation-attestation']) for (const invalid of [null, 'expired', 'chain', 'image', 'secret', 'purpose']) {
    const f = setup(t, mode === 'operator-attestation' ? 'argocd' : 'grafana'), { replica } = attest(f, mode);
    if (invalid === 'expired') f.entry.evidence.expiresAt = new Date(0).toISOString();
    if (invalid === 'chain') replica.metadata.ownerReferences[0].uid = uid(99);
    if (invalid === 'image') f.pod.status.containerStatuses[0].imageID = 'other';
    if (invalid === 'secret') f.entry.secretName = 'renderer-chosen';
    if (invalid === 'purpose') f.entry.evidence.purpose = 'any-secret';
    f.save(); let used = 0;
    const run = () => f.bootstrap.run(f.binding, f.validate, async (method, route, body) => {
      assert.equal(route, '/api/v1/session'); assert.equal(body.username, 'admin'); return { status: 200, body: { token: 'synthetic-admin-token' } };
    }, async authenticated => { used++; assert.equal(typeof authenticated, 'function'); return { verified: true }; });
    if (invalid) { await assert.rejects(run); assert.equal(used, 0); assert.equal(f.state.reads, 0); }
    else { assert.deepEqual(await run(), { verified: true }); assert.equal(f.state.reads, 1); assert.equal(f.calls[0].resourceVersion, '123'); assert.equal(f.calls[0].attestedResourceVersion, '123'); }
  }
});
test('bootstrap serializes same audience and rechecks namespace after the one Secret GET', async t => {
  const f = setup(t); let release;
  const wait = new Promise(resolve => { release = resolve; });
  const first = f.bootstrap.run(f.binding, f.validate, async () => ({}), async () => { await wait; return 'done'; });
  while (!f.state.reads) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(() => f.bootstrap.run(f.binding, f.validate, async () => ({}), async () => {}));
  release(); assert.equal(await first, 'done'); assert.equal(f.state.reads, 1);
  const g = setup(t), get = g.c.getToolBootstrapSecret;
  g.c.getToolBootstrapSecret = async input => { const result = await get(input); g.state.changed = true; return result; };
  await assert.rejects(() => g.bootstrap.run(g.binding, g.validate, async () => ({}), async () => { throw new Error('must not authenticate changed target'); }));
  assert.equal(g.state.reads, 1); assert.ok(g.buffers.every(buffer => buffer.every(byte => byte === 0)));
});

test('return268 invalid or expired receipt isolates only its audience while other contexts and kinds remain available', t => {
  for (const mode of ['expired', 'evidence-expired', 'malformed', 'duplicate', 'duplicate-invalid', 'invalid-value-type']) {
    const f = setup(t), good = { ...structuredClone(f.entry), contextId: 'cluster-b' };
    if (mode === 'expired') f.entry.expiresAt = new Date(0).toISOString();
    if (mode === 'evidence-expired') { attest(f, 'wake-operation-attestation'); f.entry.evidence.expiresAt = new Date(0).toISOString(); }
    if (mode === 'malformed') f.entry.operatorContext = null;
    if (mode === 'invalid-value-type') f.entry.expiresAt = { toString: null };
    const entries = [f.entry, good];
    if (mode === 'duplicate') entries.push(structuredClone(f.entry));
    if (mode === 'duplicate-invalid') entries.push({ contextId: f.entry.contextId, kind: f.entry.kind, extra: 'invalid' });
    fs.writeFileSync(f.file, JSON.stringify({ version: 1, entries }));
    assert.equal(f.bootstrap.available(f.binding), false);
    assert.equal(f.bootstrap.available({ ...f.binding, contextId: 'cluster-b' }), true);
    assert.deepEqual(loadOperatorReceipts(f.userData).map(e => e.contextId), ['cluster-b']);
    assert.equal(f.state.reads, 0);
  }
});
test('return268 malformed or untrusted receipt file disables bootstrap without throwing into ordinary discovery', t => {
  for (const mode of ['json', 'version', 'permission', 'symlink']) {
    const f = setup(t);
    if (mode === 'json') fs.writeFileSync(f.file, '{');
    if (mode === 'version') fs.writeFileSync(f.file, JSON.stringify({ version: 2, entries: [f.entry] }));
    if (mode === 'permission') fs.chmodSync(f.file, 0o644);
    if (mode === 'symlink') { fs.renameSync(f.file, f.file + '.original'); fs.symlinkSync(f.file + '.original', f.file); }
    assert.deepEqual(f.bootstrap.discoveryEntries('unrelated-ordinary-context'), []);
    assert.equal(f.bootstrap.available(f.binding), false);
    assert.equal(f.state.reads, 0);
  }
});

test('return268 invalid attestation does not remove another fixed transport kind in the same context', t => {
  const f = setup(t), transport = { ...structuredClone(f.entry), kind: 'prometheus', secretName: null, secretUid: null, evidence: { mode: 'transport-only' } };
  f.entry.expiresAt = new Date(0).toISOString();
  fs.writeFileSync(f.file, JSON.stringify({ version: 1, entries: [f.entry, transport] }));
  assert.equal(f.bootstrap.available(f.binding), false);
  const entries = f.bootstrap.discoveryEntries('cluster-a');
  assert.equal(entries.length, 1); assert.equal(entries[0].receipt.kind, 'prometheus'); assert.equal(f.state.reads, 0);
});

test('fixed target and bootstrap share Pod evidence and perform only one guard on each side of a sensitive HTTP', async t => {
  const { createTools } = require('./tools.cjs');
  const f = setup(t); let reads = 0;
  f.pod.apiVersion = 'v1'; f.pod.kind = 'Pod';
  Object.assign(f.pod.metadata, { name: f.entry.podName, namespace: f.entry.namespace, labels: { app: 'grafana' } });
  f.pod.spec.containers[0].ports = [{ name: 'grafana', containerPort: 3000 }];
  f.pod.status = { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] };
  const service = { apiVersion: 'v1', kind: 'Service', metadata: { name: f.entry.serviceName, namespace: f.entry.namespace, uid: f.entry.serviceUid },
    spec: { selector: { app: 'grafana' }, ports: [{ name: 'service', port: 80, targetPort: 'grafana' }] } };
  const metadata = f.c.getMetadata, secret = f.c.getToolSecretMetadata;
  f.c.getMetadata = async (...args) => { reads++; return metadata(...args); };
  f.c.getToolSecretMetadata = async (...args) => { reads++; return secret(...args); };
  f.c.request = async (_method, route) => { reads++; return structuredClone(route.includes('/services/') ? service : f.pod); };
  const tools = createTools({ forward: async () => ({ port: 1234, close() {} }) });
  t.after(() => tools.closeAll());
  const [row] = await tools.findFixed(f.entry.contextId, f.bootstrap.discoveryEntries(f.entry.contextId));
  const opened = await tools.open(f.c, f.entry.contextId, row);
  await f.bootstrap.run(opened.binding, opened.validateTarget, async () => ({ status: 200 }),
    async authenticated => {
      const before = reads;
      await authenticated('GET', '/api/search?limit=1');
      assert.equal(reads - before, 8);
    });
  assert.equal(f.state.reads, 1);
});
test('Secret resourceVersion changes during bootstrap stop before another sensitive HTTP', async t => {
  const f = setup(t); let calls = 0, http = 0;
  f.c.getToolSecretMetadata = async () => ({ metadata: { resourceVersion: ++calls === 1 ? '123' : '124' }, ownershipMatched: true });
  await assert.rejects(f.bootstrap.run(f.binding, f.validate, async () => { http++; }, async authenticated => authenticated('GET', '/api/search?limit=1')));
  assert.equal(http, 0);
});
test('partial Grafana token disconnect uses exact Viewer/token metadata and preserves partial evidence on failure', async t => {
  for (const mode of ['ok', 'denied', 'wrong-account', 'other-audience']) {
    const f = setup(t); let config = { toolMeta: { 'cluster-a-grafana': { incomplete: true, sa: 17, id: 19, kind: 'grafana',
      contextId: 'cluster-a', origin: null, binding: structuredClone(f.binding) } } }, deleted = 0;
    if (mode === 'other-audience') config.toolMeta['cluster-a-grafana'].binding.podUid = uid(99);
    const ops = createToolConnect({ bootstrap: f.bootstrap, client: () => f.c, conns: () => structuredClone(config), saveConns: value => { config = value; },
      keychain: { delete() { assert.fail('no local reference to delete'); } },
      toolAccess: { open: async () => ({ url: 'http://127.0.0.1:1234/', binding: f.binding, validate: f.validate }) },
      fetchImpl: async (url, options) => {
        assert.match(options.headers.authorization, /^Basic /);
        const route = new URL(url).pathname;
        if (options.method === 'DELETE') { deleted++; assert.equal(route, '/api/serviceaccounts/17/tokens/19'); return new Response('{}', { status: mode === 'denied' ? 403 : 200 }); }
        return new Response(JSON.stringify(route.endsWith('/tokens') ? [{ id: 19 }] : { id: 17, name: mode === 'wrong-account' ? 'other' : 'wake-reader', role: 'Viewer' }));
      } });
    const result = await ops.disconnect({ key: 'cluster-a-grafana', cluster: 'cluster-a', tool: { kind: 'grafana' } });
    assert.equal(result.ok === true, mode === 'ok');
    assert.equal(deleted, ['ok', 'denied'].includes(mode) ? 1 : 0);
    assert.equal(!!config.toolMeta['cluster-a-grafana'], mode !== 'ok');
  }
});
