const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');

const { loadKubeconfig } = require('./kubeconfig.cjs');
const { createClient } = require('./k8s.cjs');
const { create } = require('./services.cjs');
const MARKER = 'synthetic-secret-9381';
const INVALID_YAML = `apiVersion: v1\nusers:\n- name: sample\n  user:\n    token: ${MARKER}\n    broken: [\n`;

function assertNoSecret(value) {
  assert.equal(String(value).includes(MARKER), false, 'secret must not cross the error boundary');
}

function createIpc(services) {
  const source = fs.readFileSync(path.join(__dirname, '../../../kit/desktop/main.cjs'), 'utf8');
  const begin = source.indexOf("ipcMain.handle('kit:service:call'");
  const end = source.indexOf("\n  ipcMain.on('kit:settings:load'", begin);
  assert.ok(begin >= 0 && end > begin);
  let call;
  const sender = { id: 777, mainFrame: {} };
  const ownerBegin = source.indexOf('function createServiceOwnerTracker()'), ownerEnd = source.indexOf('\nfunction start(', ownerBegin);
  const serviceOwners = vm.runInNewContext('(' + source.slice(ownerBegin, ownerEnd) + ')')();
  vm.runInNewContext(source.slice(begin, end), {
    serviceOwners,
    ipcMain: { handle: (_name, handler) => { call = handler; } },
    byContents: new Map([[777, { tabId: 'sample', W: { tabs: new Map([['sample', { view: { webContents: sender } }]]) } }]]),
    shellOf: () => false,
    services,
  });
  return (name, args) => call({ sender, senderFrame: sender.mainFrame }, name, args);
}

function client() {
  return createClient({
    contexts: new Map([['sample', { cluster: 'sample', user: 'sample' }]]),
    clusters: new Map([['sample', { server: 'https://synthetic.invalid' }]]),
    users: new Map([['sample', { token: 'synthetic-token' }]]),
  }, 'sample');
}

test('kube IPC malformed YAML returns positions without source text (#48)', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-safe-errors-'));
  const originalConfig = process.env.KUBECONFIG;
  t.after(() => {
    if (originalConfig === undefined) delete process.env.KUBECONFIG;
    else process.env.KUBECONFIG = originalConfig;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.env.KUBECONFIG = path.join(dir, 'fixture.yaml');
  fs.writeFileSync(process.env.KUBECONFIG, INVALID_YAML, { mode: 0o600 });
  t.mock.method(fs, 'watch', () => ({ close() {} }));
  const logs = [];
  for (const method of ['log', 'warn', 'error']) t.mock.method(console, method, (...args) => logs.push(args));
  const services = create({ app: { isPackaged: true }, emit() {}, userData: dir });
  const ipc = createIpc(services);

  const read = await ipc('kube.read', {});
  const paste = await ipc('kube.addPaste', { text: INVALID_YAML });
  for (const result of [read.files[0], paste]) {
    assertNoSecret(JSON.stringify(result));
    assert.equal(result.code, 'YAML_PARSE_ERROR');
    assert.equal(result.line, 7);
    assert.equal(result.column, 1);
    assert.match(result.error, /line 7, column 1/);
  }
  assert.equal(read.files[0].state, 'invalid');
  assert.deepEqual(read.contexts, []);
  assertNoSecret(JSON.stringify(logs));
  assert.deepEqual(logs, []);
});

test('kubeconfig YAML tag diagnostics omit attacker controlled reason (#48)', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-safe-errors-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'tag.yaml');
  fs.writeFileSync(file, `value: !${MARKER} secret\n`);

  const result = loadKubeconfig([file]).files[0];
  assert.equal(result.state, 'invalid');
  assert.equal(result.code, 'YAML_PARSE_ERROR');
  assert.ok(result.line > 0 && result.column > 0);
  assertNoSecret(JSON.stringify(result));
});

test('kubeconfig missing and valid files retain their diagnostics (#48)', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-safe-errors-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const missing = loadKubeconfig([path.join(dir, 'missing')]).files[0];
  assert.equal(missing.state, 'missing');
  assert.equal(missing.code, 'ENOENT');
  const valid = path.join(dir, 'valid.yaml');
  fs.writeFileSync(valid, 'contexts: [{name: sample, context: {cluster: sample}}]\ncurrent-context: sample\n');
  const result = loadKubeconfig([valid]);
  assert.equal(result.files[0].state, 'ok');
  assert.equal(result.current, 'sample');
  assert.equal(result.contexts.get('sample').cluster, 'sample');
});

test('kube addPaste retains keychain failure without storing plaintext (#48)', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-safe-errors-'));
  const originalConfig = process.env.KUBECONFIG;
  process.env.KUBECONFIG = path.join(dir, 'missing');
  t.after(() => {
    if (originalConfig === undefined) delete process.env.KUBECONFIG;
    else process.env.KUBECONFIG = originalConfig;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  t.mock.method(fs, 'watch', () => ({ close() {} }));
  const ipc = createIpc(create({ app: {}, emit() {}, userData: dir }));
  const text = `contexts: [{name: sample, context: {user: sample}}]\nusers: [{name: sample, user: {token: ${MARKER}}}]\n`;

  const result = await ipc('kube.addPaste', { text });
  assert.equal(result.kind, 'keychain');
  assert.equal(result.error, 'keychain unavailable');
  assertNoSecret(JSON.stringify(result));
  assert.deepEqual(fs.readdirSync(dir), []);
  t.mock.method(fs, 'mkdirSync', () => { throw new Error(`storage failure ${MARKER}`); });
  const failedSave = await ipc('kube.addPaste', { text: 'contexts: [{name: sample}]' });
  assertNoSecret(JSON.stringify(failedSave));
  assert.equal(failedSave.code, 'CONFIG_SAVE_ERROR');
  assert.equal(failedSave.kind, 'config');
});

test('request and upgrade HTTP errors omit upstream bodies and preserve status (#48)', async t => {
  let status = 403;
  let calls = 0;
  const logs = [];
  for (const method of ['log', 'warn', 'error']) t.mock.method(console, method, (...args) => logs.push(args));
  t.mock.method(https, 'request', (_options, callback) => {
    calls++;
    const req = new EventEmitter();
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = status;
      res.resume = () => {};
      if (callback) callback(res);
      else req.emit('response', res);
      res.emit('data', Buffer.from(`denied token=${MARKER}`));
      res.emit('end');
    };
    return req;
  });
  const c = client();
  for (const [code, kind] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'unknown'], [500, 'unknown']]) {
    status = code;
    for (const run of [() => c.request('GET', '/api/v1/pods'), () => c.request('GET', '/log', null, { raw: true }), () => c.upgrade('/synthetic', 'synthetic')]) {
      await assert.rejects(run, error => {
        assertNoSecret(error.stack);
        assertNoSecret(JSON.stringify(error));
        assert.equal(error.kind, kind);
        assert.equal(error.status, code);
        assert.equal(error.code, 'K8S_HTTP_ERROR');
        assert.match(error.message, new RegExp(`HTTP ${code}`));
        return true;
      });
    }
  }
  assert.equal(calls, 12);
  assertNoSecret(JSON.stringify(logs));
  assert.deepEqual(logs, []);
});

test('request network failure and successful responses retain behavior (#48)', async t => {
  let mode = 'network';
  t.mock.method(https, 'request', (_options, callback) => {
    const req = new EventEmitter();
    req.end = () => {
      if (mode === 'network') return req.emit('error', Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }));
      const res = new EventEmitter();
      res.statusCode = 200;
      callback(res);
      res.emit('data', Buffer.from(mode === 'json' ? '{"items":[]}' : 'synthetic log'));
      res.emit('end');
    };
    return req;
  });
  const c = client();
  await assert.rejects(() => c.request('GET', '/version'), error => error.kind === 'unreachable' && error.message === 'ECONNREFUSED');
  mode = 'json';
  assert.deepEqual(await c.request('GET', '/api/v1/pods'), { items: [] });
  mode = 'raw';
  assert.equal(await c.request('GET', '/log', null, { raw: true }), 'synthetic log');
});

const METADATA_UID = '00000000-0000-4000-8000-000000000001';
const OTHER_UID = '00000000-0000-4000-8000-000000000002';
function metadataInput() {
  return { kind: 'Deployment', namespace: 'wake-system', name: 'fixture-object', uid: METADATA_UID };
}
function metadataResponse() {
  return { apiVersion: 'meta.k8s.io/v1', kind: 'PartialObjectMetadata', metadata: {
    name: 'fixture-object', namespace: 'wake-system', uid: METADATA_UID, resourceVersion: '12',
    labels: { 'synthetic-extra': MARKER },
    annotations: { synthetic: MARKER }, managedFields: [{ synthetic: MARKER }], ownerReferences: [],
  } };
}
function mockMetadataTransport(t, options = {}) {
  const calls = [], state = { destroyed: 0 }, body = options.body === undefined ? metadataResponse() : options.body;
  t.mock.method(https, 'request', (requestOptions, callback) => {
    calls.push(requestOptions); const request = new EventEmitter();
    request.destroy = () => { state.destroyed++; };
    request.end = () => {
      const response = new EventEmitter(); response.statusCode = options.status || 200;
      response.headers = { 'content-type': 'application/json' }; response.destroy = () => { state.destroyed++; };
      response.resume = () => {};
      callback(response);
      const bytes = typeof body === 'string' ? body : JSON.stringify(body);
      response.emit('data', Buffer.from(bytes)); response.emit('end');
    }; return request;
  });
  return { calls, state };
}
test('metadata_only_returns_UID_and_RV_without_secret_or_raw_labels', async t => {
  const f = mockMetadataTransport(t), c = client();
  const value = await c.getMetadata(metadataInput());
  assert.equal(value.kind, 'PartialObjectMetadata'); assert.equal(value.apiVersion, 'meta.k8s.io/v1');
  assert.equal(value.metadata.uid, METADATA_UID); assert.equal(value.metadata.resourceVersion, '12'); assert.equal(value.ownershipMatched, undefined);
  assert.equal(value.metadata.labels, undefined); assert.equal(value.metadata.annotations, undefined); assert.equal(value.metadata.managedFields, undefined);
  assertNoSecret(JSON.stringify(value)); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].method, 'GET'); assert.equal(f.calls[0].path, '/apis/apps/v1/namespaces/wake-system/deployments/fixture-object');
  assert.equal(f.calls[0].headers.accept, 'application/json;as=PartialObjectMetadata;g=meta.k8s.io;v=v1'); assert.equal(f.calls[0].timeout, 15000);
});
test('metadata_406_and_redirect_never_retry_or_forward_authorization_to_another_host', async t => {
  for (const status of [302, 406]) {
    const f = mockMetadataTransport(t, { status, body: { message: MARKER } });
    await assert.rejects(() => client().getMetadata(metadataInput()), error => { assertNoSecret(error.stack); assertNoSecret(JSON.stringify(error)); return true; });
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].host, 'synthetic.invalid');
    t.mock.restoreAll();
  }
});
test('metadata_full_Secret_extra_payload_oversize_and_deletion_are_rejected_without_body_leak', async t => {
  for (const body of [
    { apiVersion: 'v1', kind: 'Secret', metadata: metadataResponse().metadata, data: { password: MARKER } },
    { ...metadataResponse(), stringData: { password: MARKER } },
    { ...metadataResponse(), metadata: { ...metadataResponse().metadata, deletionTimestamp: '2026-11-06T00:00:00Z' } },
    MARKER.repeat(4000),
  ]) {
    const f = mockMetadataTransport(t, { body });
    await assert.rejects(() => client().getMetadata(metadataInput()), error => { assertNoSecret(error.stack); assertNoSecret(JSON.stringify(error)); return true; });
    assert.equal(f.calls.length, 1); assert.ok(f.state.destroyed > 0);
    t.mock.restoreAll();
  }
});
test('metadata_input_identity_fails_closed_without_relaxing_UID', async t => {
  for (const extra of [{ uid: 'not-uuid' }, { namespace: '../other' }, { name: 'bad/name' }, { resourceVersion: '12' },
    { url: 'https://other.invalid' }, { headers: { accept: 'application/json' } }, { kind: 'Unknown' }, { kind: 'Secret' }]) {
    const f = mockMetadataTransport(t);
    await assert.rejects(() => client().getMetadata({ ...metadataInput(), ...extra })); assert.equal(f.calls.length, 0); t.mock.restoreAll();
  }
  for (const mutate of [body => { body.metadata.uid = OTHER_UID; }, body => { body.metadata.namespace = 'other'; },
    body => { body.metadata.resourceVersion = 'opaque'; }]) {
    const body = metadataResponse(); mutate(body); const f = mockMetadataTransport(t, { body });
    await assert.rejects(() => client().getMetadata(metadataInput())); assert.equal(f.calls.length, 1); t.mock.restoreAll();
  }
});

test('return195 metadata_total_deadline_stops_slow_chunks_even_when_idle_timeout_would_not_fire', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let response, destroyed = 0;
  t.mock.method(https, 'request', (_options, callback) => {
    const request = new EventEmitter(); request.destroy = () => { destroyed++; };
    request.end = () => {
      response = new EventEmitter(); response.statusCode = 200; response.headers = { 'content-type': 'application/json' };
      response.destroy = () => { destroyed++; }; callback(response); response.emit('data', Buffer.from('{"apiVersion":'));
    }; return request;
  });
  let settled = false, error;
  const operation = client().getMetadata(metadataInput()).then(() => { settled = true; }, failure => { settled = true; error = failure; });
  await Promise.resolve();
  t.mock.timers.tick(5000); response.emit('data', Buffer.from(' '));
  t.mock.timers.tick(5000); response.emit('data', Buffer.from(' '));
  t.mock.timers.tick(4999); response.emit('data', Buffer.from(' '));
  await Promise.resolve(); assert.equal(settled, false);
  t.mock.timers.tick(1); await new Promise(resolve => setImmediate(resolve)); const settledAtDeadline = settled;
  if (!settled) response.emit('end');
  await operation;
  assert.equal(settledAtDeadline, true); assert.equal(error.kind, 'metadata_timeout'); assert.ok(destroyed >= 2); assertNoSecret(error.stack);
});
test('return195 metadata_clears_total_deadline_on_every_success_and_failure_terminal', async t => {
  const pending = new Set(), created = [];
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { const timer = { callback, delay, unref() {} }; pending.add(timer); created.push(timer); return timer; });
  t.mock.method(globalThis, 'clearTimeout', timer => pending.delete(timer));
  const body = metadataResponse(), options = { body, status: 200 }, f = mockMetadataTransport(t, options);
  for (const variant of ['success', '406', 'invalid', 'oversize']) {
    for (const key of Object.keys(body)) delete body[key]; Object.assign(body, metadataResponse()); options.status = variant === '406' ? 406 : 200;
    if (variant === 'invalid') body.kind = 'Secret';
    if (variant === 'oversize') body.metadata.annotations.synthetic = MARKER.repeat(4000);
    if (variant === 'success') await client().getMetadata(metadataInput());
    else await assert.rejects(() => client().getMetadata(metadataInput()));
    assert.equal(pending.size, 0);
  }
  assert.equal(created.length, 4); assert.ok(created.every(timer => timer.delay === 15000)); assert.equal(f.calls.length, 4);
});

test('operator_Secret_metadata_checks_Helm_release_without_relaxing_Wake_ownership_guard', async t => {
  const body = metadataResponse();
  body.metadata.labels = { 'app.kubernetes.io/managed-by': 'Helm' };
  body.metadata.annotations = { 'meta.helm.sh/release-name': 'tool', 'meta.helm.sh/release-namespace': 'wake-system' };
  const f = mockMetadataTransport(t, { body });
  const input = { kind: 'Secret', namespace: 'wake-system', name: body.metadata.name, uid: METADATA_UID, expectedRelease: { name: 'tool', namespace: 'wake-system' } };
  assert.equal((await client().getToolSecretMetadata(input)).ownershipMatched, true);
  assert.equal(f.calls[0].headers.accept, 'application/json;as=PartialObjectMetadata;g=meta.k8s.io;v=v1');
  await assert.rejects(() => client().getMetadata({ ...metadataInput(), kind: 'Secret' }));
  body.metadata.annotations['meta.helm.sh/release-name'] = 'other';
  await assert.rejects(() => client().getToolSecretMetadata(input));
});
test('operator_exact_Secret_body_is_bounded_selects_only_named_keys_and_rejects_redirect_fallback_or_UID_change', async t => {
  const metadata = metadataResponse().metadata;
  metadata.labels = { 'app.kubernetes.io/managed-by': 'Helm' };
  metadata.annotations = { 'meta.helm.sh/release-name': 'tool', 'meta.helm.sh/release-namespace': 'wake-system' };
  const input = { kind: 'Secret', namespace: 'wake-system', name: metadata.name, uid: METADATA_UID,
    expectedRelease: { name: 'tool', namespace: 'wake-system' }, dataKeys: ['admin-password'] };
  for (const mode of ['ok', '302', '406', 'uid', 'oversize', 'POM', 'bad-base64']) {
    const body = { apiVersion: 'v1', kind: 'Secret', metadata: structuredClone(metadata), data: { 'admin-password': Buffer.from(MARKER).toString('base64'), unused: 'dW51c2Vk' } };
    if (mode === 'uid') body.metadata.uid = OTHER_UID;
    if (mode === 'oversize') body.data.unused = 'a'.repeat(32769);
    if (mode === 'POM') { body.apiVersion = 'meta.k8s.io/v1'; body.kind = 'PartialObjectMetadata'; }
    if (mode === 'bad-base64') body.data['admin-password'] = '???';
    const f = mockMetadataTransport(t, { body, status: Number(mode) || 200 });
    if (mode === 'ok') {
      const result = await client().getToolBootstrapSecret(input);
      assert.deepEqual(Object.keys(result.data), ['admin-password']); assert.equal(result.data['admin-password'].toString(), MARKER); result.data['admin-password'].fill(0);
    } else await assert.rejects(() => client().getToolBootstrapSecret(input), error => { assertNoSecret(error.stack); return true; });
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].headers.accept, 'application/json');
    t.mock.restoreAll();
  }
});

test('operator_attestation_is_RV_bound_not_an_ownership_boolean_and_cannot_replace_available_Helm_proof', async t => {
  const input = { kind: 'Secret', namespace: 'wake-system', name: metadataResponse().metadata.name, uid: METADATA_UID, resourceVersion: '12', attestedResourceVersion: '12' };
  for (const mode of ['valid', 'rv', 'Helm', 'labels', 'extra']) {
    const body = metadataResponse(); body.metadata.labels = {}; body.metadata.annotations = {};
    if (mode === 'rv') body.metadata.resourceVersion = '13';
    if (mode === 'Helm') body.metadata.labels['app.kubernetes.io/managed-by'] = 'Helm';
    const request = mode === 'labels' ? { ...input, expectedLabels: { 'wake.dev/owner': 'fixed', 'wake.dev/purpose': 'purpose' } }
      : mode === 'extra' ? { ...input, expectedLabels: { any: 'injected' } } : input;
    const f = mockMetadataTransport(t, { body });
    if (mode === 'valid') assert.equal((await client().getToolSecretMetadata(request)).ownershipMatched, false);
    else await assert.rejects(() => client().getToolSecretMetadata(request));
    assert.equal(f.calls.length, mode === 'extra' ? 0 : 1); t.mock.restoreAll();
  }
});
test('operator_secret_total_deadline_stops_slow_streams_with_no_fallback_or_body_error', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let response, calls = 0, destroyed = 0;
  t.mock.method(https, 'request', (_options, callback) => {
    calls++; const request = new EventEmitter(); request.destroy = () => { destroyed++; };
    request.end = () => { response = new EventEmitter(); response.statusCode = 200; response.headers = { 'content-type': 'application/json' }; response.destroy = () => { destroyed++; }; callback(response); };
    return request;
  });
  let error;
  const operation = client().getToolBootstrapSecret({ kind: 'Secret', namespace: 'wake-system', name: metadataResponse().metadata.name, uid: METADATA_UID,
    resourceVersion: '12', attestedResourceVersion: '12', dataKeys: ['password'] }).catch(value => { error = value; });
  await Promise.resolve();
  for (let i = 0; i < 3; i++) { t.mock.timers.tick(5000); response.emit('data', Buffer.from(MARKER)); }
  await operation;
  assert.equal(error.kind, 'metadata_timeout'); assertNoSecret(error.stack); assert.equal(calls, 1); assert.ok(destroyed >= 2);
});

test('direct_operator_tunnel_preserves_existing_GET_WebSocket_contract_and_exact_Pod_path', async t => {
  const calls = [];
  t.mock.method(https, 'request', (options, callback) => {
    calls.push(options); const request = new EventEmitter();
    request.end = () => { const response = new EventEmitter(); response.statusCode = 403; response.resume = () => {}; request.emit('response', response); };
    return request;
  });
  const route = '/api/v1/namespaces/observability/pods/fixed-pod/portforward?ports=3000';
  await assert.rejects(() => client().upgrade(route, 'v4.channel.k8s.io'), error => error.status === 403);
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'GET'); assert.equal(calls[0].path, route);
  assert.equal(calls[0].headers['sec-websocket-protocol'], 'v4.channel.k8s.io');
});

test('operation AbortSignal closes only its own real HTTP request and upgraded socket', async t => {
  const http = require('node:http');
  const sockets = new Set(); let requestSeen, upgradeSeen;
  const requestReady = new Promise(resolve => { requestSeen = resolve; });
  const upgradeReady = new Promise(resolve => { upgradeSeen = resolve; });
  const server = http.createServer((req, res) => { requestSeen(); res.writeHead(200, { 'content-type': 'application/json' }); res.write('{'); });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('upgrade', (req, socket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Protocol: v4.channel.k8s.io\r\n\r\n'); upgradeSeen();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { for (const socket of sockets) socket.destroy(); server.close(); });
  const c = createClient({ contexts: new Map([['c', { cluster: 'c', user: 'c' }]]),
    clusters: new Map([['c', { server: 'http://127.0.0.1:' + server.address().port }]]), users: new Map([['c', { token: 'synthetic-token' }]]) }, 'c');
  const first = new AbortController(), second = new AbortController();
  const pending = c.request('GET', '/version', null, { signal: first.signal });
  await requestReady;
  const connection = await c.upgrade('/portforward', 'v4.channel.k8s.io', { signal: second.signal });
  await upgradeReady;
  first.abort();
  await assert.rejects(pending);
  assert.equal(connection.socket.destroyed, false);
  second.abort();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(connection.socket.destroyed, true);
});
test('typed operator metadata receives remaining budget and aborts without returning Secret sentinels', async t => {
  let request, ready; const started = new Promise(resolve => { ready = resolve; });
  t.mock.method(https, 'request', (options, callback) => {
    request = new EventEmitter(); request.destroy = () => {};
    request.end = () => { assert.equal(options.timeout, 25); ready(); }; return request;
  });
  const controller = new AbortController(), c = client();
  const pending = c.getToolSecretMetadata({ kind: 'Secret', namespace: 'monitoring', name: 'admin', uid: METADATA_UID,
    expectedRelease: { name: 'grafana', namespace: 'monitoring' } }, { signal: controller.signal, timeout: 25 });
  await started; controller.abort();
  await assert.rejects(pending, error => { assertNoSecret(error.stack); return error.kind === 'metadata_cancelled'; });
});
