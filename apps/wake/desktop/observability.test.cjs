const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createObservability, LIMITS } = require('./observability.cjs');

const WINDOW = Object.freeze({ from: '2026-01-01T00:00:00Z', to: '2026-01-01T00:05:00Z', step: 30 });
const SUBJECT = Object.freeze({ namespace: 'payments', name: 'api-0', kind: 'Pod', uid: 'pod-uid', container: 'api' });
function config(provider = 'prometheus') {
  return { version: 1, connections: [{ id: 'source', provider, contextId: 'test-context', account: '111122223333', profile: 'test-profile', region: 'us-west-2', logGroup: '/test/logs',
    targets: [{ id: 'target', label: 'API', subject: { ...SUBJECT }, queries: [{ id: 'cpu', operation: 'metrics', expression: 'cpu{namespace="payments",pod="api-0"}', expectedLabels: { namespace: 'payments', pod: 'api-0', container: 'api' }, unit: 'cores' }] }] }] };
}
function request(extra = {}) {
  return { requestId: 'request-1', connectionId: 'source', targetId: 'target', operation: 'metrics', queryId: 'cpu', queryWindow: { ...WINDOW }, ...extra };
}
const promBody = (values = [[1767225600, '0.5']]) => ({ status: 'success', data: { resultType: 'matrix', result: [{ metric: { namespace: 'payments', pod: 'api-0', container: 'api' }, values }] } });
const response = body => new Response(JSON.stringify(body), { status: 200 });
/* 읽기는 허브의 Prometheus 주소(prometheusOrigin)를 기다린 뒤에 fetch한다 */
const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(saved = config(), overrides = {}) {
  const execute = overrides.execFileImpl || (() => { throw new Error('unexpected AWS call'); });
  const executeIdentity = overrides.stsImpl || ((_command, _args, _options, callback) => callback(null, JSON.stringify({ Account: '111122223333' })));
  return createObservability({ readConfig: () => saved, contextIds: () => ['test-context'], client: () => { throw new Error('unexpected cluster call'); },
    fetchImpl: async () => response(promBody()), prometheusOrigin: async () => 'http://127.0.0.1:41234', now: () => '2026-01-02T00:00:00.000Z', ...overrides,
    awsExecutable: overrides.awsExecutable || (() => '/test/native/aws'),
    execFileImpl: (command, args, options, callback) => (args[0] === 'sts' ? executeIdentity : execute)(command, args, options, callback) });
}

function operationConfig(provider, operation) {
  const saved = config(provider);
  saved.connections[0].targets[0].queries = [{ id: 'read', operation }];
  if (provider === 'cloudwatch') saved.connections[0].targets[0].logStreamNames = ['api'];
  return saved;
}

test('missing native config is unconfigured without fallback or IO', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-observability-'));
  try {
    const service = createObservability({ userData: dir, contextIds: () => [] });
    assert.deepEqual(service['observability.catalog'](), { status: 'unconfigured', connections: [] });
    fs.writeFileSync(path.join(dir, 'observability-connections.json'), '{');
    assert.equal(service['observability.catalog']().status, 'invalid_configuration');
  } finally { fs.rmSync(dir, { recursive: true }); }
});

function nativeBindingQuery(service) { return service['observability.catalog']().connections[0].targets[0].queries[0].definitionBinding; }
function assertNativeBinding(binding) {
  assert.ok(binding && binding.version === 1 && binding.scope === 'observability-config-tuple');
  assert.match(binding.id, /^obd1\.[0-9a-f-]{36}$/);
  assert.deepEqual(Object.keys(binding).sort(), ['version', 'scope', 'id', 'provider', 'connectionId', 'targetId', 'queryId', 'operation', 'identity', 'subject', 'queryDefinition'].sort());
}
test('native_binding_catalog_read_equality_excludes_window_echo_and_preserves_raw', async () => {
  const saved = config(), service = setup(saved), binding = nativeBindingQuery(service);
  assertNativeBinding(binding);
  const first = await service['observability.read'](request());
  const second = await service['observability.read'](request({ requestId: 'next', query: saved.connections[0].targets[0].queries[0].expression, queryWindow: { ...WINDOW, step: 60 } }));
  assert.deepEqual(first.executionBinding, binding); assert.deepEqual(second.executionBinding, binding);
  assert.equal(second.queryWindow.step, 60); assert.deepEqual(first.data.raw, promBody());
  const publicText = JSON.stringify(service['observability.catalog']());
  for (const value of [saved.connections[0].profile, '127.0.0.1:41234']) assert.ok(!publicText.includes(value));
  first.executionBinding.identity.account = 'changed'; assert.deepEqual(nativeBindingQuery(service), binding);
  assert.equal((await service['observability.read'](request({ query: 'up' }))).executionBinding, null);
});
test('native_binding_registry_retains_A_B_A_and_cold_factories_and_branch_defaults', () => {
  const saved = config(), service = setup(saved), first = nativeBindingQuery(service);
  assertNativeBinding(first); saved.connections[0].targets[0].queries[0].mode = 'range';
  assert.equal(nativeBindingQuery(service).id, first.id);
  saved.connections[0].targets[0].queries[0].expectedLabels.pod = 'other'; const other = nativeBindingQuery(service); assert.notEqual(other.id, first.id);
  saved.connections[0].targets[0].queries[0].expectedLabels.pod = 'api-0'; assert.equal(nativeBindingQuery(service).id, first.id);
  assert.notEqual(nativeBindingQuery(setup(saved)).id, first.id);
  saved.connections[0].targets[0].queries[0].mode = 'instant'; assert.notEqual(nativeBindingQuery(service).id, first.id);
});
test('native_binding_safe_failures_leave_provider_status_catalog_and_Pod_evidence_unchanged', async () => {
  const saved = config(), service = setup(saved, { bindingIdFactory() { throw new Error('unavailable'); } });
  const catalog = service['observability.catalog'](); assert.equal(catalog.status, 'ok'); assert.equal(catalog.connections.length, 1);
  assert.equal(catalog.connections[0].targets[0].queries[0].definitionBinding, null);
  const result = await service['observability.read'](request()); assert.equal(result.status, 'ok'); assert.equal(result.executionBinding, null); assert.deepEqual(result.data.raw, promBody());
  const pod = podSource(), observed = await pod.read(podRequest('cpu')); assert.equal(observed.executionBinding, null); assert.equal(observed.status, 'ok');
  const invalid = await service['observability.read'](request({ targetId: 'missing' })); assert.ok(Object.hasOwn(invalid, 'executionBinding')); assert.equal(invalid.executionBinding, null);
});
test('native_binding_pins_resolve_source_across_await_and_detects_observed_in_place_mutation', async () => {
  const saved = config(); let release;
  const service = setup(saved, { fetchImpl: () => new Promise(resolve => { release = () => resolve(response(promBody())); }) });
  const first = nativeBindingQuery(service), pending = service['observability.read'](request());
  saved.connections = [{ ...saved.connections[0], account: '999900001111' }]; const second = nativeBindingQuery(service); assert.notEqual(first.id, second.id);
  await settle(); release(); const result = await pending; assert.equal(result.status, 'ok'); assert.equal(result.executionBinding.id, first.id);
  const again = service['observability.read'](request()); saved.connections[0].region = 'us-east-1'; await settle(); release();
  const changed = await again; assert.equal(changed.status, 'ok'); assert.equal(changed.executionBinding, null); assert.deepEqual(changed.data.raw, promBody());
});
test('native_binding_failure_and_empty_have_resolved_binding_but_pre_resolve_rejection_does_not', async () => {
  for (const mode of ['empty', 'denied', 'network']) {
    const service = setup(config(), { fetchImpl: async () => {
      if (mode === 'network') throw new Error('unavailable');
      return mode === 'denied' ? new Response('', { status: 403 }) : response(promBody([]));
    } });
    const binding = nativeBindingQuery(service), result = await service['observability.read'](request());
    assert.equal(result.status, mode === 'empty' ? 'empty' : mode === 'denied' ? 'forbidden' : 'network_error');
    assertNativeBinding(binding); assertNativeBinding(result.executionBinding); assert.deepEqual(result.executionBinding, binding);
  }
});
test('native_binding_registry_capacity_and_unknown_fields_never_evict_or_break_old_data', async () => {
  const saved = config(); let sequence = 0;
  const service = setup(saved, { bindingIdFactory(...args) { assert.equal(args.length, 0); return '00000000-0000-4000-8000-' + String(++sequence).padStart(12, '0'); } });
  const original = nativeBindingQuery(service); assertNativeBinding(original);
  const template = saved.connections[0].targets[0].queries[0];
  saved.connections[0].targets[0].queries = Array.from({ length: 4097 }, (_, i) => ({ ...template, id: 'metric-' + i }));
  const queries = service['observability.catalog']().connections[0].targets[0].queries;
  assert.equal(queries.at(-1).definitionBinding, null); assert.ok(queries.some(q => q.definitionBinding));
  saved.connections[0].targets[0].queries = [template]; assert.equal(nativeBindingQuery(service).id, original.id);
  template.unknownSelector = 'opaque'; assert.equal(nativeBindingQuery(service), null);
  const result = await service['observability.read'](request()); assert.equal(result.status, 'ok'); assert.equal(result.executionBinding, null);
});
test('native_binding_key_total_budget_and_UUID_collision_fail_closed_without_eviction', async () => {
  const saved = config();
  let generated = 0;
  const service = setup(saved, { bindingIdFactory: () => '00000000-0000-4000-8000-' + String(++generated).padStart(12, '0') });
  const first = nativeBindingQuery(service), original = saved.connections[0].targets[0].queries[0];
  original.unit = 'x'.repeat(33000); assert.equal(nativeBindingQuery(service), null);
  original.unit = 'cores'; assert.equal(nativeBindingQuery(service).id, first.id);
  saved.connections[0].targets[0].queries = Array.from({ length: 200 }, (_, index) => ({ ...original, id: 'large-' + index, unit: 'x'.repeat(24000) }));
  const queries = service['observability.catalog']().connections[0].targets[0].queries;
  assert.ok(queries.some(query => query.definitionBinding)); assert.equal(queries.at(-1).definitionBinding, null); assert.ok(generated < 200);
  saved.connections[0].targets[0].queries = [original]; assert.equal(nativeBindingQuery(service).id, first.id);
  let attempts = 0;
  const collisions = setup(saved, { bindingIdFactory() { attempts++; return '00000000-0000-4000-8000-000000000001'; } });
  const initial = nativeBindingQuery(collisions); original.mode = 'instant'; assert.equal(nativeBindingQuery(collisions), null); assert.equal(attempts, 9);
  delete original.mode; assert.equal(nativeBindingQuery(collisions).id, initial.id);
  original.unknownSelector = true;
  const result = await collisions['observability.read'](request()); assert.equal(result.status, 'ok'); assert.equal(result.executionBinding, null);
});
test('native_binding_private_selectors_and_provider_semantics_change_ID_without_public_leak', () => {
  const cloud = operationConfig('cloudwatch', 'metrics');
  cloud.connections[0].targets[0].queries[0].metric = { namespace: 'Test/Node', name: 'CPU', statistic: 'Average', dimensions: [{ name: 'Node', value: 'test-node' }] };
  const cases = [
    [cloud, connection => { connection.profile = 'other-profile'; }, 'other-profile'],
    [cloud, connection => { connection.targets[0].queries[0].metric.statistic = 'Maximum'; }, null],
    [cloud, connection => { connection.targets[0].queries[0].metric.dimensions[0].value = 'other-node'; }, null],
    [gcpConfig(), connection => { connection.credentialSource.command = '/other/gke-gcloud-auth-plugin'; }, '/other/gke-gcloud-auth-plugin'],
    [gcpConfig(), connection => { connection.location = 'other-region'; }, null],
    [operationConfig('kubernetes', 'logs'), connection => { connection.targets[0].queries[0].previous = true; }, null],
    [operationConfig('gitops', 'changes'), connection => { connection.targets[0].subject.uid = 'new-uid'; }, null],
  ];
  for (const [saved, mutate, hidden] of cases) {
    const service = setup(saved, { contextIds: () => [saved.connections[0].contextId] }), before = nativeBindingQuery(service);
    assertNativeBinding(before); mutate(saved.connections[0]); const after = nativeBindingQuery(service); assertNativeBinding(after); assert.notEqual(after.id, before.id);
    if (hidden) assert.equal(JSON.stringify(service['observability.catalog']()).includes(hidden), false);
  }
});
test('native_binding_GCP_actual_read_and_401_have_same_native_definition_without_credentials', async () => {
  for (const denied of [false, true]) {
    const fixture = gcpSetup(denied ? { fetch: async () => new Response('', { status: 401 }) } : {});
    const definition = nativeBindingQuery(fixture.api), result = await fixture.read(); assertNativeBinding(definition);
    assert.equal(result.status, denied ? 'unauthenticated' : 'ok'); assert.deepEqual(result.executionBinding, definition);
    for (const hidden of [GCP_COMMAND, 'synthetic-oauth-value']) assert.equal(JSON.stringify(result.executionBinding).includes(hidden), false);
    if (!denied) assert.deepEqual(result.data.raw.timeSeries, [gcpSeries()]);
  }
});
test('native_binding_unknown_metadata_and_normalizer_failure_preserve_existing_output', async () => {
  const saved = config(), query = saved.connections[0].targets[0].queries[0];
  Object.defineProperty(query, 'unit', { enumerable: true, get: () => 'cores' });
  const service = setup(saved), catalog = service['observability.catalog']();
  assert.equal(catalog.status, 'ok'); assert.equal(catalog.connections[0].targets[0].queries[0].definitionBinding, null);
  const result = await service['observability.read'](request()); assert.equal(result.status, 'ok'); assert.equal(result.executionBinding, null); assert.deepEqual(result.data.raw, promBody());
});
test('catalog exposes native IDs, subjects and units without credentials or origins', () => {
  const saved = config(); saved.connections[0].password = 'private-value';
  const result = setup(saved)['observability.catalog']();
  assert.equal(result.connections[0].targets[0].queries[0].unit, 'cores');
  assert.equal(result.connections[0].identity.cluster, 'test-context');
  assert.ok(!JSON.stringify(result).includes('private-value'));
  assert.ok(!JSON.stringify(result).includes('127.0.0.1'));
});

test('Prometheus executes configured query and preserves labels, numeric samples, source time and app time', async () => {
  let url, init;
  const service = setup(config(), { fetchImpl: async (u, i) => { url = u; init = i; return response(promBody()); } });
  const result = await service['observability.read'](request());
  assert.equal(result.status, 'ok');
  assert.equal(url.pathname, '/api/v1/query_range');
  assert.equal(url.searchParams.get('query'), result.query);
  assert.equal(init.redirect, 'error');
  assert.equal(result.data.matrix[0].values[0][1], '0.5');
  assert.equal(result.data.matrix[0].metric.namespace, 'payments');
  assert.equal(result.observedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(result.receivedAt, '2026-01-02T00:00:00.000Z');
  assert.deepEqual(result.queryWindow, WINDOW);
});

test('unknown connection/target and provider mismatch never execute another adapter', async () => {
  let calls = 0;
  const read = setup(config(), { fetchImpl: async () => { calls++; throw new Error('must not call'); } })['observability.read'];
  assert.equal((await read(request({ connectionId: 'unknown' }))).status, 'unconfigured');
  assert.equal((await read(request({ targetId: 'unknown' }))).status, 'unconfigured');
  assert.equal((await read(request({ operation: 'logs' }))).status, 'unsupported');
  assert.equal((await read(request({ query: 'up' }))).status, 'invalid_request');
  assert.equal((await read(request({ url: 'https://untrusted.example' }))).status, 'invalid_request');
  assert.equal(calls, 0);
});

test('range, step, absolute timestamps and impossible dates are rejected before IO', async () => {
  const read = setup()['observability.read'];
  const invalid = [
    { ...WINDOW, from: '2026-02-30T00:00:00Z' }, { ...WINDOW, from: '2026-01-01' },
    { ...WINDOW, to: WINDOW.from }, { ...WINDOW, step: 0 }, { ...WINDOW, step: '30' },
    { ...WINDOW, to: '2026-01-03T00:00:00Z' }, { ...WINDOW, to: '2026-01-02T00:00:00Z', step: 1 },
  ];
  for (const window of invalid) assert.equal((await read(request({ queryWindow: window }))).status, 'invalid_request');
});

test('hub Prometheus origin rejects credentials, paths, metadata SSRF and redirect following', async () => {
  for (const origin of ['http://169.254.169.254', 'http://metadata.google.internal', 'http://user:pass@example.com', 'http://example.com/api', 'file:///tmp/data']) {
    assert.equal((await setup(config(), { prometheusOrigin: async () => origin })['observability.read'](request())).status, 'unconfigured');
  }
  const service = setup(config(), { fetchImpl: async (_url, init) => { assert.equal(init.redirect, 'error'); throw new TypeError('redirect with secret=private-value'); } });
  const result = await service['observability.read'](request());
  assert.equal(result.status, 'network_error');
  assert.ok(!JSON.stringify(result).includes('private-value'));
});

test('forbidden, empty, invalid JSON and network failure remain distinct with safe errors', async () => {
  const cases = [
    [async () => new Response('private-value', { status: 403 }), 'forbidden'],
    [async () => response({ status: 'success', data: { resultType: 'matrix', result: [] } }), 'empty'],
    [async () => new Response('private-value'), 'invalid_response'],
    [async () => { throw new Error('private-value'); }, 'network_error'],
  ];
  for (const [fetchImpl, status] of cases) {
    const result = await setup(config(), { fetchImpl })['observability.read'](request());
    assert.equal(result.status, status);
    assert.ok(!JSON.stringify(result).includes('private-value'));
    if (status === 'empty') assert.equal(result.observedAt, null);
  }
});

test('Prometheus rejects wrong subject labels, nonfinite values, out-of-window points and wrong shape', async () => {
  const wrongLabels = promBody(); wrongLabels.data.result[0].metric.namespace = 'another';
  const cases = [wrongLabels, promBody([[1767225600, 'NaN']]), promBody([[1767226000, '1']]), { status: 'success', data: { resultType: 'vector', result: [] } }];
  for (const body of cases) assert.equal((await setup(config(), { fetchImpl: async () => response(body) })['observability.read'](request())).status, 'invalid_response');
  const saved = config(); delete saved.connections[0].targets[0].queries[0].expectedLabels;
  assert.equal((await setup(saved)['observability.read'](request())).status, 'unconfigured');
});

test('bounded streaming body fails before parsing an oversized response', async () => {
  const fetchImpl = async () => new Response(new Uint8Array(LIMITS.bodyBytes + 1));
  assert.equal((await setup(config(), { fetchImpl })['observability.read'](request())).status, 'invalid_response');
});

for (const differentWindow of [false, true]) {
  test(`independent same-query reads preserve each response when completion reverses (differentWindow=${differentWindow})`, async () => {
    const releases = [];
    const service = setup(config(), { fetchImpl: url => new Promise(resolve => releases.push({ url, resolve })) });
    const firstInput = request();
    const secondInput = request({ requestId: 'request-2', queryWindow: differentWindow ? { ...WINDOW, from: '2026-01-01T00:01:00Z', to: '2026-01-01T00:06:00Z' } : { ...WINDOW } });
    const first = service['observability.read'](firstInput), second = service['observability.read'](secondInput);
    await settle();
    const bodies = releases.map((item, index) => promBody([[Number(item.url.searchParams.get('start')), index === 0 ? '0.5000' : '0.7500']]));
    releases[1].resolve(response(bodies[1]));
    const secondResult = await second;
    releases[0].resolve(response(bodies[0]));
    const firstResult = await first;
    for (const [index, result] of [firstResult, secondResult].entries()) {
      const input = index === 0 ? firstInput : secondInput;
      assert.equal(result.status, 'ok');
      assert.equal(result.requestId, input.requestId);
      assert.equal(result.connectionId, input.connectionId);
      assert.equal(result.targetId, input.targetId);
      assert.equal(result.queryId, input.queryId);
      assert.deepEqual(result.queryWindow, input.queryWindow);
      assert.deepEqual(result.data.raw, bodies[index]);
      assert.deepEqual(result.data.matrix, bodies[index].data.result);
      assert.equal(result.observedAt, new Date(Date.parse(input.queryWindow.from)).toISOString());
    }
  });
}

test('sixteen concurrent independent reads retain the resource limit and release capacity after completion', async () => {
  const releases = [];
  const service = setup(config(), { fetchImpl: () => new Promise(resolve => releases.push(resolve)) });
  const pending = Array.from({ length: 16 }, (_, index) => service['observability.read'](request({ requestId: 'concurrent-' + index })));
  assert.equal((await service['observability.read'](request({ requestId: 'overflow' }))).status, 'not_queried');
  await settle();
  for (const release of releases) release(response(promBody()));
  const results = await Promise.all(pending);
  assert.ok(results.every((result, index) => result.status === 'ok' && result.requestId === 'concurrent-' + index));
  const retry = service['observability.read'](request({ requestId: 'retry' }));
  await settle();
  releases[16](response(promBody()));
  assert.equal((await retry).status, 'ok');
});

test('CloudWatch uses explicit profile/region/logGroup, no shell, bounded pagination and strips ambient credentials', async () => {
  const saved = operationConfig('cloudwatch', 'logs');
  let invocation;
  const service = setup(saved, { execFileImpl(command, args, options, callback) {
    invocation = { command, args, options };
    callback(null, JSON.stringify({ events: [{ timestamp: 1767225600000, message: 'real returned message', logStreamName: 'api' }], nextToken: 'more' }));
  } });
  const result = await service['observability.read'](request({ operation: 'logs', queryId: 'read' }));
  assert.equal(result.status, 'ok');
  assert.equal(invocation.command, '/test/native/aws');
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.args[invocation.args.indexOf('--profile') + 1], 'test-profile');
  assert.equal(invocation.args[invocation.args.indexOf('--region') + 1], 'us-west-2');
  assert.ok(invocation.args.includes('--no-paginate'));
  assert.equal(invocation.options.env.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(result.data.truncated, true);
  assert.equal(result.data.records[0].message, 'real returned message');
});

test('CloudWatch missing profile or default never invokes AWS', async () => {
  for (const profile of [undefined, '', 'default']) {
    const saved = operationConfig('cloudwatch', 'logs'); saved.connections[0].profile = profile;
    assert.equal((await setup(saved)['observability.read'](request({ operation: 'logs', queryId: 'read' }))).status, 'unconfigured');
  }
});

test('CloudWatch permission failures do not return stderr credentials', async () => {
  const service = setup(operationConfig('cloudwatch', 'logs'), { execFileImpl(_command, _args, _options, callback) { callback(new Error('private-value'), '', 'AccessDenied private-value'); } });
  const result = await service['observability.read'](request({ operation: 'logs', queryId: 'read' }));
  assert.equal(result.status, 'forbidden');
  assert.ok(!JSON.stringify(result).includes('private-value'));
});

test('Kubernetes reads Pod UID before logs, passes absolute start and filters end', async () => {
  const calls = [];
  const client = id => { assert.equal(id, 'test-context'); return { async request(method, url, _body, options) {
    calls.push({ method, url, options });
    if (!url.includes('/log?')) return { metadata: { uid: SUBJECT.uid } };
    return '2026-01-01T00:00:01Z first\n2026-01-01T00:06:01Z outside\n';
  } }; };
  const result = await setup(operationConfig('kubernetes', 'logs'), { client })['observability.read'](request({ operation: 'logs', queryId: 'read' }));
  assert.equal(result.status, 'ok');
  assert.equal(result.data.records.length, 1);
  assert.ok(calls[1].url.includes('sinceTime=2026-01-01T00%3A00%3A00Z'));
  assert.ok(calls.every(call => call.method === 'GET' && !call.url.includes('secrets')));
  assert.ok(!result.data.raw.includes('outside'));
});

test('Kubernetes unknown context, changed UID and permission failure never become empty success', async () => {
  const saved = operationConfig('kubernetes', 'logs');
  assert.equal((await setup(saved, { contextIds: () => [] })['observability.read'](request({ operation: 'logs', queryId: 'read' }))).status, 'unconfigured');
  let calls = 0;
  const client = () => ({ request: async () => { calls++; return { metadata: { uid: 'replacement' } }; } });
  assert.equal((await setup(saved, { client })['observability.read'](request({ operation: 'logs', queryId: 'read' }))).status, 'not_queried');
  assert.equal(calls, 1);
  const forbidden = () => ({ request: async () => { throw Object.assign(new Error('private-value'), { kind: 'forbidden' }); } });
  assert.equal((await setup(saved, { client: forbidden })['observability.read'](request({ operation: 'logs', queryId: 'read' }))).status, 'forbidden');
});

test('events restrict the UID and retained time range without broad secret collection', async () => {
  const client = () => ({ request: async (_method, url) => {
    if (!url.includes('/events?')) return { metadata: { uid: SUBJECT.uid } };
    assert.ok(decodeURIComponent(url).includes('involvedObject.uid=pod-uid'));
    return { items: [
      { involvedObject: { uid: SUBJECT.uid }, lastTimestamp: '2026-01-01T00:01:00Z', message: 'BackOff' },
      { involvedObject: { uid: 'another' }, lastTimestamp: '2026-01-01T00:01:00Z' },
    ], metadata: { continue: 'more' } };
  } });
  const result = await setup(operationConfig('kubernetes', 'events'), { client })['observability.read'](request({ operation: 'events', queryId: 'read' }));
  assert.equal(result.status, 'ok');
  assert.equal(result.data.records.length, 1);
  assert.equal(result.data.truncated, true);
});

test('GitOps returns actual retained deployment history in the selected time window', async () => {
  const saved = operationConfig('gitops', 'changes'); saved.connections[0].targets[0].subject.kind = 'Application';
  const client = () => ({ request: async (_method, url) => {
    assert.ok(url.startsWith('/apis/argoproj.io/v1alpha1/namespaces/payments/applications/'));
    return { metadata: { uid: SUBJECT.uid }, status: { history: [{ id: 1, revision: 'commit-from-source', deployedAt: '2026-01-01T00:02:00Z' }, { id: 2, deployedAt: '2026-01-02T00:00:00Z' }] } };
  } });
  const result = await setup(saved, { client })['observability.read'](request({ operation: 'changes', queryId: 'read' }));
  assert.equal(result.status, 'ok');
  assert.equal(result.data.records[0].revision, 'commit-from-source');
  assert.equal(result.data.records.length, 1);
  assert.equal(result.data.coverage, 'retained_deployment_history');
});

test('saved tool addresses make the connection unconfigured instead of opening a fixed address', async () => {
  const saved = config(); saved.connections[0].tools = [{ id: 'observability-grafana', kind: 'grafana', origin: 'https://grafana.example', path: '/d/test' }];
  const service = setup(saved, { fetchImpl: () => assert.fail('saved tool address must not be read') });
  const catalog = service['observability.catalog']();
  assert.equal(catalog.connections[0].status, 'unconfigured'); assert.deepEqual(catalog.connections[0].operations, []);
  assert.equal(Object.hasOwn(catalog.connections[0], 'tools'), false); assert.ok(!JSON.stringify(catalog).includes('grafana.example'));
  assert.equal((await service['observability.read'](request())).status, 'unconfigured');
  assert.equal(Object.hasOwn(service, 'observability.tool'), false);
});

test('duplicate native IDs or invalid schema fail closed', () => {
  const saved = config(); saved.connections.push(saved.connections[0]);
  assert.equal(setup(saved)['observability.catalog']().status, 'invalid_configuration');
  assert.equal(setup({ version: 2, connections: [] })['observability.catalog']().status, 'invalid_configuration');
});

test('catalog publishes explicit query metadata without ID inference', () => {
  const saved = config();
  const connection = saved.connections[0];
  const query = connection.targets[0].queries[0];
  Object.assign(query, { role: 'cpu', title: 'CPU usage', polling: { supported: true, intervalSeconds: 15 } });
  const result = setup(saved)['observability.catalog']().connections[0];
  assert.equal(result.targets[0].queries[0].expression, query.expression);
  assert.equal(result.targets[0].queries[0].role, 'cpu');
  assert.equal(result.targets[0].queries[0].polling.intervalSeconds, 15);
  delete query.role; delete query.title; delete query.polling;
  const metadata = setup(saved)['observability.catalog']().connections[0].targets[0].queries[0];
  assert.equal(metadata.role, null);
  assert.equal(metadata.title, null);
  assert.equal(metadata.polling.supported, false);
});

test('read disables polling after denial and preserves configured polling only for actual returned results', async () => {
  const saved = config(); saved.connections[0].targets[0].queries[0].polling = { supported: true, intervalSeconds: 15 };
  const success = await setup(saved)['observability.read'](request());
  assert.equal(success.polling.supported, true);
  const denied = await setup(saved, { fetchImpl: async () => new Response('', { status: 403 }) })['observability.read'](request());
  assert.deepEqual(denied.polling, { supported: false, intervalSeconds: null, reason: 'forbidden' });
});

test('instant Prometheus query preserves original metric and string sample representation', async () => {
  const saved = config(); saved.connections[0].targets[0].queries[0].mode = 'instant';
  let endpoint;
  const metric = { namespace: 'payments', pod: 'api-0', container: 'api' };
  const raw = { status: 'success', data: { resultType: 'vector', result: [{ metric, value: [1767225900, '0.5000'] }] } };
  const result = await setup(saved, { fetchImpl: async url => { endpoint = url; return response(raw); } })['observability.read'](request());
  assert.equal(result.status, 'ok');
  assert.equal(endpoint.pathname, '/api/v1/query');
  assert.equal(endpoint.searchParams.get('time'), '1767225900');
  assert.deepEqual(result.data.matrix, [{ metric, values: [[1767225900, '0.5000']] }]);
  assert.deepEqual(result.data.raw, raw);
});

test('CloudWatch refuses missing stream subject mapping or another returned stream', async () => {
  const saved = operationConfig('cloudwatch', 'logs'); delete saved.connections[0].targets[0].logStreamNames;
  assert.equal((await setup(saved)['observability.read'](request({ operation: 'logs', queryId: 'read' }))).status, 'unconfigured');
  saved.connections[0].targets[0].logStreamNames = ['api'];
  const service = setup(saved, { execFileImpl(_command, _args, _options, callback) { callback(null, JSON.stringify({ events: [{ timestamp: 1767225600000, message: 'wrong subject', logStreamName: 'another' }] })); } });
  assert.equal((await service['observability.read'](request({ operation: 'logs', queryId: 'read' }))).status, 'invalid_response');
});

test('Pod replacement during log read discards logs from unstable identity', async () => {
  let calls = 0;
  const client = () => ({ request: async () => {
    calls++;
    if (calls === 1) return { metadata: { uid: SUBJECT.uid } };
    if (calls === 2) return '2026-01-01T00:00:01Z message';
    return { metadata: { uid: 'new-uid' } };
  } });
  const result = await setup(operationConfig('kubernetes', 'logs'), { client })['observability.read'](request({ operation: 'logs', queryId: 'read' }));
  assert.equal(result.status, 'not_queried');
  assert.deepEqual(result.data.records, []);
});

test('CloudWatch metrics uses explicit native metric/dimensions/statistic and real returned points', async () => {
  const saved = operationConfig('cloudwatch', 'metrics');
  saved.connections[0].targets[0].queries[0].metric = { namespace: 'Test/Node', name: 'MemoryUsed', statistic: 'Average', dimensions: [{ name: 'Node', value: 'test-node' }] };
  let args;
  const service = setup(saved, { execFileImpl(_command, a, _options, callback) {
    args = a;
    callback(null, JSON.stringify({ Datapoints: [{ Timestamp: '2026-01-01T00:01:00Z', Average: 128, Unit: 'Bytes' }], Label: 'MemoryUsed' }));
  } });
  const result = await service['observability.read'](request({ operation: 'metrics', queryId: 'read', queryWindow: { ...WINDOW, step: 60 } }));
  assert.equal(result.status, 'ok');
  assert.deepEqual(args.slice(0, 2), ['cloudwatch', 'get-metric-statistics']);
  assert.ok(args.includes('Name=Node,Value=test-node'));
  assert.equal(result.data.matrix[0].values[0][1], '128');
  assert.equal(result.data.sourceUnit, 'Bytes');
  assert.equal(result.data.unit, null);
  assert.equal(result.data.matrix[0].metric.Node, 'test-node');
});

test('CloudWatch metrics refuses unsupported period or missing metric instead of inventing values', async () => {
  const saved = operationConfig('cloudwatch', 'metrics');
  const input = request({ operation: 'metrics', queryId: 'read' });
  assert.equal((await setup(saved)['observability.read'](input)).status, 'unconfigured');
  saved.connections[0].targets[0].queries[0].metric = { namespace: 'Test/Node', name: 'CPU', statistic: 'Average', dimensions: [] };
  assert.equal((await setup(saved)['observability.read'](input)).status, 'invalid_request');
});

test('explicit polling is disabled for an empty unobserved response', async () => {
  const saved = config(); saved.connections[0].targets[0].queries[0].polling = { supported: true, intervalSeconds: 15 };
  const service = setup(saved, { fetchImpl: async () => response({ status: 'success', data: { resultType: 'matrix', result: [] } }) });
  const result = await service['observability.read'](request());
  assert.deepEqual(result.polling, { supported: false, intervalSeconds: null, reason: 'empty' });
});

test('subject name and UID label mismatches are rejected before returning metric data', async () => {
  const saved = config(); saved.connections[0].targets[0].subject.name = 'another-pod';
  assert.equal((await setup(saved)['observability.read'](request())).status, 'unconfigured');
  saved.connections[0].targets[0].subject.name = 'api-0';
  saved.connections[0].targets[0].queries[0].expectedLabels.uid = 'another-uid';
  const body = promBody(); body.data.result[0].metric.uid = 'another-uid';
  const result = await setup(saved, { fetchImpl: async () => response(body) })['observability.read'](request());
  assert.equal(result.status, 'unconfigured');
  assert.deepEqual(result.data.matrix, []);
});

test('Prometheus connection with a saved origin or an unknown context is unconfigured before any hub or fetch call', async () => {
  let calls = 0;
  for (const change of [saved => { saved.connections[0].origin = 'http://127.0.0.1:9090'; }, saved => { saved.connections[0].contextId = 'other-context'; }, saved => { delete saved.connections[0].contextId; }]) {
    const saved = config(); change(saved);
    const service = setup(saved, { prometheusOrigin: async () => { calls++; return 'http://127.0.0.1:41234'; }, fetchImpl: async () => { calls++; return response(promBody()); } });
    assert.equal((await service['observability.read'](request())).status, 'unconfigured');
  }
  assert.equal(calls, 0);
});

test('Prometheus read asks the hub for the context origin and passes hub failures through', async () => {
  const asked = [], urls = [];
  const service = setup(config(), { prometheusOrigin: async contextId => { asked.push(contextId); return 'http://127.0.0.1:41234'; }, fetchImpl: async url => { urls.push(url); return response(promBody()); } });
  assert.equal((await service['observability.read'](request())).status, 'ok');
  assert.deepEqual(asked, ['test-context']); assert.equal(urls[0].origin, 'http://127.0.0.1:41234'); assert.equal(urls[0].pathname, '/api/v1/query_range');
  const missing = setup(config(), { prometheusOrigin: async () => { throw Object.assign(new Error('none'), { status: 'unconfigured' }); } });
  assert.equal((await missing['observability.read'](request())).status, 'unconfigured');
  const denied = setup(config(), { prometheusOrigin: async () => { throw Object.assign(new Error('denied'), { kind: 'forbidden' }); } });
  assert.equal((await denied['observability.read'](request())).status, 'forbidden');
});

test('CloudWatch requires native 12 digit account and STS identity equality before querying', async () => {
  const saved = operationConfig('cloudwatch', 'logs');
  let calls = 0;
  for (const account of [undefined, '123', 111122223333]) {
    saved.connections[0].account = account;
    const service = setup(saved, { stsImpl() { calls++; }, execFileImpl() { calls++; } });
    assert.equal((await service['observability.read'](request({ operation: 'logs', queryId: 'read' }))).status, 'unconfigured');
  }
  assert.equal(calls, 0);
  saved.connections[0].account = '111122223333';
  const service = setup(saved, { stsImpl(_command, args, _options, callback) {
    assert.deepEqual(args.slice(0, 2), ['sts', 'get-caller-identity']);
    assert.equal(args[args.indexOf('--profile') + 1], 'test-profile');
    callback(null, JSON.stringify({ Account: '999988887777' }));
  }, execFileImpl() { calls++; } });
  const result = await service['observability.read'](request({ operation: 'logs', queryId: 'read' }));
  assert.equal(result.status, 'forbidden');
  assert.equal(calls, 0);
  assert.equal(result.polling.supported, false);
});

test('AWS executable and environment ignore ambient credential/config/CA/proxy/PATH overrides while retaining default login home', async () => {
  const keys = ['AWS_CONFIG_FILE', 'AWS_SHARED_CREDENTIALS_FILE', 'AWS_CA_BUNDLE', 'AWS_LOGIN_CACHE_DIRECTORY', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'https_proxy', 'REQUESTS_CA_BUNDLE', 'PYTHONPATH', 'PYTHONHOME', 'DYLD_INSERT_LIBRARIES', 'PATH', 'HOME'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let identityChecked = false;
  const inspect = (command, _args, options) => {
    assert.equal(command, '/test/native/aws');
    assert.equal(options.env.HOME, os.userInfo().homedir);
    assert.equal(options.env.PATH, '/usr/bin:/bin');
    for (const key of keys.filter(key => !['PATH', 'HOME'].includes(key))) assert.equal(options.env[key], undefined, key);
    assert.equal(options.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS, 'true');
  };
  try {
    for (const key of keys) process.env[key] = 'untrusted-override';
    const service = setup(operationConfig('cloudwatch', 'logs'), { stsImpl(command, args, options, callback) {
      inspect(command, args, options); identityChecked = true;
      callback(null, JSON.stringify({ Account: '111122223333' }));
    }, execFileImpl(command, args, options, callback) {
      inspect(command, args, options); assert.equal(identityChecked, true);
      callback(null, JSON.stringify({ events: [] }));
    } });
    assert.equal((await service['observability.read'](request({ operation: 'logs', queryId: 'read' }))).status, 'empty');
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('missing verified AWS executable stops before identity or data commands', async () => {
  let calls = 0;
  const service = setup(operationConfig('cloudwatch', 'logs'), { awsExecutable: () => { throw Object.assign(new Error('unconfigured'), { status: 'unconfigured' }); }, stsImpl() { calls++; } });
  assert.equal((await service['observability.read'](request({ operation: 'logs', queryId: 'read' }))).status, 'unconfigured');
  assert.equal(calls, 0);
});

function podRequest(metricId = 'cpu', extra = {}) {
  return { requestId: 'pod-metric-1', connectionId: 'source', operation: 'metrics', metricId, queryWindow: { ...WINDOW }, subject: { context: 'test-context', namespace: 'payments', name: 'api-0', uid: 'pod-uid', container: 'api' }, ...extra };
}
function livePod(extra = {}) { return { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'api-0', namespace: 'payments', uid: 'pod-uid', creationTimestamp: '2025-12-31T00:00:00Z' }, spec: { containers: [{ name: 'api' }] }, ...extra }; }
function podSource({ metricId = 'cpu', body, pod = () => livePod(), fetchImpl, contextIds } = {}) {
  const calls = [], data = body || promBody();
  if (!body) data.data.result[0].metric.uid = SUBJECT.uid;
  const service = setup(config(), { contextIds: contextIds || (() => ['test-context']), client: id => ({ request: async (...args) => { calls.push({ id, args });return pod(calls.length); } }), fetchImpl: fetchImpl || (async (url, init) => { calls.push({ url, init });return response(data); }) });
  return { read: input => service['observability.read'](input || podRequest(metricId)), service, calls, data };
}

test('typed Pod metrics bind registered context and actual UID before and after a controlled query', async () => {
  const source = podSource(), input = podRequest(), before = structuredClone(input);
  const result = await source.read(input);
  assert.equal(result.status, 'ok');assert.equal(result.data.identity.resourceUID, 'verified');assert.equal(result.data.identity.seriesUID, 'verified');
  assert.equal(result.data.scope.kind, 'container');assert.equal(result.data.scope.container, 'api');
  assert.equal(source.calls.length, 3);assert.ok(source.calls[0].args[1].endsWith('/namespaces/payments/pods/api-0'));assert.equal(source.calls[2].args[0], 'GET');
  assert.equal(source.calls[1].url.origin, 'http://127.0.0.1:41234');assert.equal(source.calls[1].url.searchParams.get('query'), 'rate(container_cpu_usage_seconds_total{namespace="payments",pod="api-0",container="api"}[5m])');
  assert.deepEqual(result.queryWindow, WINDOW);assert.deepEqual(result.data.raw, source.data);assert.deepEqual(input, before);
});

for (const metricId of ['memory', 'network_rx', 'network_tx']) test(`typed Pod ${metricId} preserves metric scope and source samples without aggregation`, async () => {
  const network = metricId.startsWith('network_'), body = promBody();
  body.data.result[0].metric = { namespace: SUBJECT.namespace, pod: SUBJECT.name, container: network ? 'POD' : SUBJECT.container, uid: SUBJECT.uid, ...(network ? { interface: 'eth0' } : {}) };
  if (network) body.data.result.push({ metric: { ...body.data.result[0].metric, interface: 'eth1' }, values: [[1767225600, '0.75000']] });
  const source = podSource({ metricId, body }), before = structuredClone(body), result = await source.read();
  assert.equal(result.status, 'ok');assert.equal(result.metricId, metricId);assert.equal(result.queryId, metricId);
  assert.equal(result.data.unit, network ? 'bytes/s' : 'bytes');assert.equal(result.data.scope.kind, network ? 'pod' : 'container');
  assert.equal(result.data.scope.container, network ? undefined : 'api');assert.deepEqual(result.data.matrix, body.data.result);assert.deepEqual(result.data.raw, before);
  assert.ok(!result.query.includes('sum('));assert.equal(result.query.includes('container='), !network);assert.equal(result.query.includes('[5m]'), network);
  assert.deepEqual(body, before);assert.equal(source.calls.length, 3);
});

for (const stage of ['before', 'after', 'container', 'namespace', 'name']) test(`typed Pod identity ${stage} mismatch discards data`, async () => {
  const source = podSource({ pod: call => {
    const value = livePod();
    if (stage === 'before' || stage === 'after' && call === 3) value.metadata.uid = 'replacement';
    if (stage === 'container') value.spec.containers = [{ name: 'other-container' }];
    if (stage === 'namespace') value.metadata.namespace = 'other-namespace';
    if (stage === 'name') value.metadata.name = 'other-pod';
    return value;
  } });
  const result = await source.read();assert.equal(result.status, 'identity_changed');assert.deepEqual(result.data.matrix, []);assert.equal(result.data.raw, null);
  assert.equal(source.calls.some(call => call.url), stage === 'after');
});

for (const code of [403, 404]) test(`typed Pod GET ${code} stays distinct and never returns successful samples`, async () => {
  const source = podSource({ pod: () => { throw Object.assign(new Error('private-value'), { status: code }); } });
  const result = await source.read();assert.equal(result.status, code === 403 ? 'forbidden' : 'missing');assert.equal(source.calls.length, 1);assert.deepEqual(result.data.matrix, []);assert.ok(!JSON.stringify(result).includes('private-value'));
});

for (const key of ['namespace', 'pod', 'container', 'uid', '__name__']) test(`typed Pod returned ${key} mismatch fails closed`, async () => {
  const body = promBody();Object.assign(body.data.result[0].metric, { uid: SUBJECT.uid, [key]: 'another' });
  const result = await podSource({ body }).read();assert.equal(result.status, 'invalid_response');assert.equal(result.data.raw, null);
});

test('typed Pod network duplicate interfaces and missing interface fail instead of guessed sums', async () => {
  for (const mode of ['duplicate', 'missing', 'loopback', 'wrong-container']) {
    const body = promBody();body.data.result[0].metric = { namespace: SUBJECT.namespace, pod: SUBJECT.name, uid: SUBJECT.uid, container: 'POD', interface: 'eth0' };
    if (mode === 'duplicate') body.data.result.push({ metric: { ...body.data.result[0].metric, job: 'another-scrape' }, values: [[1767225600, '7']] });
    if (mode === 'missing') delete body.data.result[0].metric.interface;
    if (mode === 'loopback') body.data.result[0].metric.interface = 'lo';
    if (mode === 'wrong-container') body.data.result[0].metric.container = 'api';
    const result = await podSource({ metricId: 'network_rx', body }).read();assert.equal(result.status, 'invalid_response', mode);assert.deepEqual(result.data.matrix, []);
  }
});

test('typed Pod duplicate container series are not silently selected or summed', async () => {
  const body = promBody();body.data.result.push(structuredClone(body.data.result[0]));
  const result = await podSource({ body }).read();assert.equal(result.status, 'invalid_response');assert.deepEqual(result.data.matrix, []);
});

test('historical samples without UID labels stay explicitly unverified even after current Pod UID GETs match', async () => {
  const body = promBody(), source = podSource({ body, pod: () => { const value = livePod();value.metadata.creationTimestamp = '2026-01-02T00:00:00Z';return value; } });
  const result = await source.read();assert.equal(result.status, 'unverified');assert.equal(result.data.identity.resourceUID, 'verified');assert.equal(result.data.identity.seriesUID, 'unverified');assert.equal(result.data.identity.reason, 'uid_label_missing');
  assert.deepEqual(result.data.raw, body);assert.deepEqual(result.data.matrix, body.data.result);assert.equal(source.calls.length, 3);assert.equal(result.polling.supported, false);
});

test('a claimed matching UID with samples before that Pod was created is rejected', async () => {
  const source = podSource({ pod: () => { const value = livePod();value.metadata.creationTimestamp = '2026-01-02T00:00:00Z';return value; } });
  assert.equal((await source.read()).status, 'invalid_response');
});

test('typed Pod empty series remain empty rather than zero or UID verified', async () => {
  const body = { status: 'success', data: { resultType: 'matrix', result: [] } }, result = await podSource({ body }).read();
  assert.equal(result.status, 'empty');assert.deepEqual(result.data.matrix, []);assert.equal(result.observedAt, null);assert.equal(result.data.identity.seriesUID, 'unverified');
});

test('typed request rejects unknown fields, mixed legacy form, unsafe subject and unregistered contexts before IO', async () => {
  const source = podSource();
  for (const extra of [{ query: 'up' }, { url: 'http://untrusted.invalid' }, { origin: 'http://untrusted.invalid' }, { targetId: 'target' }, { queryId: 'cpu' }, { signal: {} }, { subject: { ...podRequest().subject, namespace: '../other' } }, { subject: { ...podRequest().subject, unsafe: 'value' } }, { operation: 'logs' }]) assert.equal((await source.read(podRequest('cpu', extra))).status, 'invalid_request');
  assert.equal((await source.read(podRequest('unknown'))).status, 'unsupported');assert.equal((await source.read(podRequest('cpu', { subject: { ...podRequest().subject, context: 'unknown-context' } }))).status, 'unconfigured');
  assert.equal(source.calls.length, 0);
  assert.equal((await source.service['observability.read'](request({ subject: podRequest().subject }))).status, 'invalid_request');
});

test('typed Pod metrics refuse saved origins and unknown contexts without new URLs', async () => {
  for (const change of [saved => { saved.connections[0].origin = 'http://localhost:41234'; }, saved => { saved.connections[0].contextId = 'other-context'; }, saved => { saved.connections[0].provider = 'cloudwatch'; }]) {
    const saved = config();change(saved);let io = 0;
    const service = setup(saved, { client: () => { io++;throw new Error('unexpected IO'); }, fetchImpl: () => { io++;throw new Error('unexpected IO'); } });
    assert.equal((await service['observability.read'](podRequest())).status, 'unconfigured');assert.equal(io, 0);
  }
});

test('late cancelled Pod response cannot expose samples or replace an independent fresh response', async () => {
  let release, calls = 0, signal;
  const source = podSource({ fetchImpl: async (_url, init) => { calls++;if (calls === 1) { signal = init.signal;return new Promise(resolve => { release = resolve; }); } const body = promBody();body.data.result[0].metric.uid = SUBJECT.uid;return response(body); } });
  const controller = new AbortController(), pending = source.service['observability.read'](podRequest('cpu', { requestId: 'old' }), { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));controller.abort();assert.equal(signal.aborted, true);
  const fresh = await source.service['observability.read'](podRequest('cpu', { requestId: 'fresh' })), before = structuredClone(fresh);
  const old = promBody();old.data.result[0].metric.uid = SUBJECT.uid;release(response(old));const result = await pending;
  assert.equal(result.status, 'cancelled');assert.equal(result.requestId, 'old');assert.deepEqual(result.data.matrix, []);assert.equal(result.data.raw, null);assert.equal(fresh.status, 'ok');assert.deepEqual(fresh, before);
});

test('cancellation during the first Pod GET prevents a later Prometheus request', async () => {
  let release, fetches = 0;const controller = new AbortController();
  const service = setup(config(), { client: () => ({ request: () => new Promise(resolve => { release = resolve; }) }), fetchImpl: () => { fetches++;return response(promBody()); } });
  const pending = service['observability.read'](podRequest(), { signal: controller.signal });controller.abort();release(livePod());
  const result = await pending;assert.equal(result.status, 'cancelled');assert.equal(fetches, 0);
});

for (const status of [403, 404]) test(`typed Pod second GET ${status} discards already fetched Prometheus samples`, async () => {
  const source = podSource({ pod: call => { if (call === 3) throw Object.assign(new Error('private-value'), { status });return livePod(); } });
  const result = await source.read();assert.equal(result.status, status === 403 ? 'forbidden' : 'missing');assert.equal(source.calls.length, 3);assert.equal(result.data.raw, null);assert.deepEqual(result.data.matrix, []);
});

test('network with any UID-less series stays unverified without discarding raw interfaces', async () => {
  const body = promBody();body.data.result[0].metric = { namespace: SUBJECT.namespace, pod: SUBJECT.name, container: 'POD', uid: SUBJECT.uid, interface: 'eth0' };
  body.data.result.push({ metric: { namespace: SUBJECT.namespace, pod: SUBJECT.name, container: 'POD', interface: 'eth1' }, values: [[1767225600, '0.7']] });
  const result = await podSource({ metricId: 'network_rx', body }).read();assert.equal(result.status, 'unverified');assert.equal(result.data.matrix.length, 2);assert.deepEqual(result.data.raw, body);
});

test('typed metrics reject extra window fields before Pod or Prometheus IO', async () => {
  const source = podSource(), result = await source.read(podRequest('cpu', { queryWindow: { ...WINDOW, query: 'up' } }));assert.equal(result.status, 'invalid_request');assert.equal(source.calls.length, 0);
});

test('typed native requests share the unchanged sixteen-slot limit with legacy reads', async () => {
  const releases = [], source = podSource({ fetchImpl: () => new Promise(resolve => releases.push(resolve)) });
  const pending = Array.from({ length: 16 }, (_, index) => source.service['observability.read'](podRequest('cpu', { requestId: 'typed-' + index })));
  await new Promise(resolve => setImmediate(resolve));assert.equal(releases.length, 16);
  assert.equal((await source.service['observability.read'](request({ requestId: 'legacy-overflow' }))).status, 'not_queried');
  assert.equal((await source.service['observability.read'](podRequest('cpu', { requestId: 'typed-overflow' }))).status, 'not_queried');
  const body = promBody();body.data.result[0].metric.uid = SUBJECT.uid;for (const release of releases) release(response(body));
  const results = await Promise.all(pending);assert.ok(results.every(result => result.status === 'ok'));
});

const CG_UID = 'f198b05a-2d6e-43c4-9f84-5ad369e2c29d';
const CG_OTHER = 'a198b05a-2d6e-43c4-9f84-5ad369e2c29d';
const CG_ID = `/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod${CG_UID.replaceAll('-', '_')}.slice/cri-containerd-fixture.scope`;
function cgroupRequest(metricId = 'memory', extra = {}) { return podRequest(metricId, { subject: { context: 'test-context', namespace: 'argocd', name: 'argocd-application-controller-0', uid: CG_UID, container: 'application-controller' }, ...extra }); }
function cgroupPod() { const value = livePod();value.metadata = { ...value.metadata, name: 'argocd-application-controller-0', namespace: 'argocd', uid: CG_UID };value.spec.containers = [{ name: 'application-controller' }];return value; }
function cgroupBody(metricId = 'memory') { return { status: 'success', data: { resultType: 'matrix', result: [{ metric: { namespace: 'argocd', pod: 'argocd-application-controller-0', id: CG_ID, ...(metricId.startsWith('network_') ? { interface: 'eth0' } : { container: 'application-controller' }) }, values: [[1767225600, '1.25000']] }] } }; }
function cgroupSource({ metricId = 'memory', body = cgroupBody(metricId), pod = () => cgroupPod() } = {}) {
  const calls = [], service = setup(config(), { client: id => ({ request: async (...args) => { calls.push({ id, args });return pod(calls.length); } }), fetchImpl: async (url, init) => { calls.push({ url, init });return response(body); } });
  return { service, calls, body, read: (input = cgroupRequest(metricId)) => service['observability.read'](input) };
}

test('systemd Pod component matches observed memory label shape without inventing a uid label', async () => {
  const source = cgroupSource(), before = structuredClone(source.body), result = await source.read();
  assert.equal(result.status, 'ok');assert.equal(result.data.identity.seriesUID, 'verified');assert.equal(result.data.subjectBinding, 'cgroup_pod_component');
  assert.equal(result.data.identity.evidenceMeaning, 'observed_label_binding');assert.equal(result.data.identity.evidence[0].cgroupFormat, 'systemd');
  assert.equal(Object.hasOwn(result.data.matrix[0].metric, 'uid'), false);assert.deepEqual(result.data.raw, before);assert.deepEqual(source.body, before);assert.equal(source.calls.length, 3);
});

for (const metricId of ['network_rx', 'network_tx']) for (const empty of [false, true]) test(`sandbox ${metricId} with ${empty ? 'empty' : 'absent'} container keeps Pod scope and cgroup evidence`, async () => {
  const body = cgroupBody(metricId);if (empty) body.data.result[0].metric.container = '';
  const source = cgroupSource({ metricId, body }), before = structuredClone(body), result = await source.read();
  assert.equal(result.status, 'ok');assert.equal(result.data.scope.kind, 'pod');assert.equal(result.data.scope.container, undefined);assert.equal(result.data.identity.evidence[0].source, 'cgroup_pod_component');
  assert.equal(result.query.includes('container='), false);assert.ok(result.query.includes('namespace="argocd",pod="argocd-application-controller-0"'));assert.equal(result.data.unit, 'bytes/s');assert.equal(result.data.matrix[0].metric.container, empty ? '' : undefined);
  assert.deepEqual(result.data.raw, before);assert.equal(source.calls.length, 3);
});

for (const id of [`/kubepods/burstable/pod${CG_UID}/fixture`, `/kubepods/besteffort/pod${CG_UID}/`, `/kubepods.slice/kubepods-pod${CG_UID.replaceAll('-', '_')}.slice/fixture`, `/kubepods.slice/kubepods-besteffort-pod${CG_UID.replaceAll('-', '_')}.slice/fixture`]) test(`only whole allowed Pod component verifies ${id}`, async () => {
  const body = cgroupBody();body.data.result[0].metric.id = id;const result = await cgroupSource({ body }).read();
  assert.equal(result.status, 'ok');assert.equal(result.data.identity.evidence[0].source, 'cgroup_pod_component');
});

for (const id of [undefined, '', `/kubepods/prefixpod${CG_UID}/fixture`, `/kubepods/pod${CG_UID}.suffix/fixture`, `/custom-pod${CG_UID.replaceAll('-', '_')}.slice/fixture`, `/kubepods-pod${CG_UID.replaceAll('-', '_')}.slice.suffix/fixture`, `/pod${CG_UID}/pod${CG_UID}/fixture`, `/../pod${CG_UID}/fixture`, `/pod${CG_UID}//fixture`, `http://host/pod${CG_UID}/fixture`, `/pod${CG_UID.toUpperCase()}/fixture`]) test(`unsupported or ambiguous cgroup path stays unverified: ${String(id)}`, async () => {
  const body = cgroupBody();if (id === undefined) delete body.data.result[0].metric.id;else body.data.result[0].metric.id = id;
  const result = await cgroupSource({ body }).read();
  assert.equal(result.status, 'unverified');assert.equal(result.data.identity.seriesUID, 'unverified');assert.deepEqual(result.data.raw, body);
});

for (const mode of ['cgroup-mismatch', 'uid-label-conflict', 'both-components']) test(`different UID evidence ${mode} is rejected`, async () => {
  const body = cgroupBody();
  if (mode === 'cgroup-mismatch') body.data.result[0].metric.id = CG_ID.replace(CG_UID.replaceAll('-', '_'), CG_OTHER.replaceAll('-', '_'));
  if (mode === 'uid-label-conflict') body.data.result[0].metric.uid = CG_OTHER;
  if (mode === 'both-components') body.data.result[0].metric.id = `/pod${CG_UID}/pod${CG_OTHER}/fixture`;
  const result = await cgroupSource({ body }).read();assert.equal(result.status, 'invalid_response');assert.equal(result.data.raw, null);
});

test('two matching Pod components stay ambiguous even when an explicit uid label agrees', async () => {
  const body = cgroupBody();Object.assign(body.data.result[0].metric, { id: `/pod${CG_UID}/pod${CG_UID}/fixture`, uid: CG_UID });
  const result = await cgroupSource({ body }).read();assert.equal(result.status, 'unverified');assert.equal(result.data.identity.reason, 'cgroup_component_ambiguous');
});

test('sandbox needs the exact cgroup component even if a uid label exists', async () => {
  const body = cgroupBody('network_rx');delete body.data.result[0].metric.id;body.data.result[0].metric.uid = CG_UID;
  const result = await cgroupSource({ metricId: 'network_rx', body }).read();assert.equal(result.status, 'unverified');assert.equal(result.data.identity.reason, 'sandbox_cgroup_uid_missing');
});

test('real application container network cannot be relabeled as Pod sandbox', async () => {
  const body = cgroupBody('network_rx');body.data.result[0].metric.container = 'application-controller';
  const result = await cgroupSource({ metricId: 'network_rx', body }).read();assert.equal(result.status, 'invalid_response');assert.deepEqual(result.data.matrix, []);
});

test('sandbox interfaces stay separate and duplicate interface is never selected or summed', async () => {
  const body = cgroupBody('network_rx');body.data.result.push({ metric: { ...body.data.result[0].metric, interface: 'eth1' }, values: [[1767225600, '2.7500']] });
  const result = await cgroupSource({ metricId: 'network_rx', body }).read();assert.equal(result.status, 'ok');assert.equal(result.data.matrix.length, 2);assert.deepEqual(result.data.raw, body);
  body.data.result[1].metric.interface = 'eth0';body.data.result[1].metric.job = 'duplicate-scrape';
  const rejected = await cgroupSource({ metricId: 'network_rx', body }).read();assert.equal(rejected.status, 'invalid_response');assert.deepEqual(rejected.data.matrix, []);
});

test('cgroup observation never bypasses post-read Pod replacement or Pod lifetime checks', async () => {
  const source = cgroupSource({ pod: call => { const value = cgroupPod();if (call === 3) value.metadata.uid = CG_OTHER;return value; } });
  assert.equal((await source.read()).status, 'identity_changed');
  const futurePod = cgroupSource({ pod: () => { const value = cgroupPod();value.metadata.creationTimestamp = '2026-01-02T00:00:00Z';return value; } });
  assert.equal((await futurePod.read()).status, 'invalid_response');
});

test('caller cannot supply cgroup paths or regex rules through the strict request', async () => {
  const source = cgroupSource();for (const extra of [{ id: CG_ID }, { cgroupPath: CG_ID }, { regex: '.*' }, { subject: { ...cgroupRequest().subject, id: CG_ID } }]) assert.equal((await source.read(cgroupRequest('memory', extra))).status, 'invalid_request');
  assert.equal(source.calls.length, 0);
});

const GCP_CONTEXT = 'gcp-fixture';
const GCP_COMMAND = '/fixture/gke-gcloud-auth-plugin';
function gcpConfig(templateId = 'node-cpu-time') {
  const templates = {
    'node-cpu-time': ['cpu-time', 's{CPU}'], 'node-cpu-rate': ['cpu', 'cores'],
    'node-memory-evictable': ['memory-evictable', 'By'], 'node-memory-non-evictable': ['memory-non-evictable', 'By'],
    'node-network-rx-total': ['network-rx-total', 'By'], 'node-network-rx-rate': ['network-rx', 'By/s'],
    'node-network-tx-total': ['network-tx-total', 'By'], 'node-network-tx-rate': ['network-tx', 'By/s'],
    'node-ephemeral-storage-used': ['ephemeral-storage-used', 'By'],
  };
  const [role, unit] = templates[templateId];
  return { version: 1, connections: [{ id: 'google', provider: 'gcp-monitoring', contextId: GCP_CONTEXT, projectId: 'fixture-project', location: 'fixture-region', clusterName: 'fixture-cluster', credentialSource: { kind: 'gke-exec', command: GCP_COMMAND }, targets: [{ id: 'nodes', subject: { kind: 'Cluster', name: 'fixture-cluster' }, queries: [{ id: 'metric', operation: 'metrics', templateId, role, unit, title: templateId, polling: { supported: true, intervalSeconds: 60 } }] }] }] };
}
function gcpSeries(type = 'cpu/core_usage_time', overrides = {}) {
  return { metric: { type: 'kubernetes.io/node/' + type, labels: {} }, resource: { type: 'k8s_node', labels: { project_id: 'fixture-project', location: 'fixture-region', cluster_name: 'fixture-cluster', node_name: 'historical-node' } }, metricKind: 'CUMULATIVE', valueType: 'DOUBLE', points: [
    { interval: { startTime: '2025-12-31T00:00:00Z', endTime: '2026-01-01T00:02:00Z' }, value: { doubleValue: 130 } },
    { interval: { startTime: '2025-12-31T00:00:00Z', endTime: '2026-01-01T00:01:00Z' }, value: { doubleValue: 100 } },
  ], ...overrides };
}
function gcpDescriptor(type = 'kubernetes.io/node/cpu/core_usage_time', project = 'fixture-project', extra = {}) {
  const gauge = type.includes('/memory/') || type.includes('/ephemeral_storage/');
  return { name: `projects/${project}/metricDescriptors/${type}`, type, metricKind: gauge ? 'GAUGE' : 'CUMULATIVE', valueType: type.includes('/cpu/') ? 'DOUBLE' : 'INT64', unit: type.includes('/cpu/') ? 's{CPU}' : 'By', monitoredResourceTypes: ['k8s_node'], metadata: { samplePeriod: '60s', ingestDelay: '0s' }, ...extra };
}
function gcpSetup({ saved = gcpConfig(), body = { timeSeries: [gcpSeries()] }, fetch, descriptor, credentials, native, contexts = [GCP_CONTEXT], clock, now } = {}) {
  const calls = [], descriptorCalls = [], credentialCalls = [];
  const client = native || { execCommand: GCP_COMMAND, user: { exec: { command: GCP_COMMAND } }, credentials: async () => { credentialCalls.push(true); return credentials ? credentials() : { token: 'synthetic-oauth-value' }; } };
  const api = createObservability({ readConfig: () => saved, contextIds: () => contexts, client: id => { assert.equal(id, saved.connections[0].contextId); return client; }, fetchImpl: async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/metricDescriptors/')) {
      descriptorCalls.push({ url: parsed, options });
      return descriptor ? descriptor(url, options, descriptorCalls.length) : response(gcpDescriptor(decodeURIComponent(parsed.pathname.split('/metricDescriptors/')[1]), saved.connections[0].projectId));
    }
    calls.push({ url: parsed, options }); return fetch ? fetch(url, options, calls.length) : response(body);
  }, execFileImpl() { assert.fail('GCP must not execute another command'); }, now: now || (() => '2026-01-02T00:00:00Z'), samplingClock: clock });
  return { api, calls, descriptorCalls, credentialCalls, read: (extra = {}, options) => api['observability.read'](request({ connectionId: 'google', targetId: 'nodes', queryId: 'metric', ...extra }), options) };
}

test('GCP fixed node template uses approved native OAuth only and preserves historical source values', async () => {
  const f = gcpSetup(), catalog = f.api['observability.catalog']();
  assert.equal(catalog.connections[0].status, 'configured');
  const result = await f.read(); assert.equal(result.status, 'ok');
  assert.deepEqual(result.data.matrix[0].values, [[1767225660, '100'], [1767225720, '130']]);
  assert.equal(result.data.unit, 's{CPU}'); assert.equal(result.data.identityEvidence.level, 'name-bound'); assert.equal(result.data.identityEvidence.uid, null);
  assert.equal(result.observedAt, '2026-01-01T00:02:00Z'); assert.equal(result.receivedAt, '2026-01-02T00:00:00Z');
  assert.equal(f.calls[0].url.origin, 'https://monitoring.googleapis.com'); assert.equal(f.calls[0].options.method, 'GET'); assert.equal(f.calls[0].options.redirect, 'error');
  assert.equal(f.calls[0].options.headers.authorization, 'Bearer synthetic-oauth-value');
  assert.ok(!JSON.stringify(result).includes('synthetic-oauth-value')); assert.ok(!JSON.stringify(catalog).includes(GCP_COMMAND));
});

test('GCP401 is unauthenticated while 403 and successful empty stay distinct', async () => {
  for (const [status, expected] of [[401, 'unauthenticated'], [403, 'forbidden']]) {
    const f = gcpSetup({ fetch: async () => new Response('untrusted error text', { status }) });
    const result = await f.read(); assert.equal(result.status, expected); assert.equal(result.error, expected); assert.equal(result.data.raw, null);
    assert.ok(!JSON.stringify(result).includes('untrusted error text'));
  }
  assert.equal((await gcpSetup({ body: {} }).read()).status, 'empty');
  const unsupported = gcpSetup(); assert.equal((await unsupported.read({ operation: 'logs' })).status, 'unsupported'); assert.equal(unsupported.calls.length, 0);
});

function gcpIntSeries(metric, values, extra = {}) {
  return gcpSeries(metric, { metricKind: metric.includes('memory') || metric.includes('storage') ? 'GAUGE' : 'CUMULATIVE', valueType: 'INT64',
    points: values.map(([time, value, start = '2025-12-31T00:00:00Z']) => ({ interval: { startTime: start, endTime: time }, value: { int64Value: value } })), ...extra });
}

test('GCP native binding and OAuth credential source fail closed before Google fetch', async () => {
  for (const change of [c => { c.contextId = 'other'; }, c => { c.projectId = 'invalid/project'; }, c => { c.credentialSource.kind = 'static'; }, c => { c.credentialSource.command = '/fixture/gcloud'; }, c => { c.origin = 'https://untrusted.invalid'; }, c => { c.targets[0].subject.uid = 'current-uid'; }]) {
    const saved = gcpConfig(); change(saved.connections[0]); const f = gcpSetup({ saved });
    assert.equal((await f.read()).status, 'unconfigured'); assert.equal(f.calls.length, 0); assert.equal(f.credentialCalls.length, 0);
  }
  for (const native of [{ execCommand: GCP_COMMAND, credentials: async () => ({ token: 'synthetic' }) }, { execCommand: '/wrong/plugin', user: { exec: { command: GCP_COMMAND } }, credentials: async () => ({ token: 'synthetic' }) }]) {
    const f = gcpSetup({ native }); assert.equal((await f.read()).status, 'unconfigured'); assert.equal(f.calls.length, 0);
  }
  for (const credential of [{}, { token: 'synthetic', basic: 'not-oauth' }, { token: 'synthetic', cert: 'not-oauth' }, { token: 'with space' }]) {
    const f = gcpSetup({ credentials: async () => credential }); assert.equal((await f.read()).status, 'unauthenticated'); assert.equal(f.calls.length, 0);
  }
});

test('GCP query roles units and templates are explicit and renderer filters or window extras are rejected', async () => {
  for (const change of [q => { q.role = 'invented'; }, q => { q.unit = 'percent'; }, q => { q.templateId = 'node-gpu'; }, q => { q.expression = 'arbitrary filter'; }]) {
    const saved = gcpConfig(); change(saved.connections[0].targets[0].queries[0]); const f = gcpSetup({ saved });
    assert.equal((await f.read()).status, 'unconfigured'); assert.equal(f.calls.length, 0);
  }
  for (const extra of [{ projectId: 'forged' }, { url: 'https://untrusted.invalid' }, { pageToken: 'forged' }, { query: 'arbitrary filter' }, { queryWindow: { ...WINDOW, pageSize: 1 } }]) {
    const f = gcpSetup(); assert.equal((await f.read(extra)).status, 'invalid_request'); assert.equal(f.calls.length, 0);
  }
  const f = gcpSetup(); const expression = f.api['observability.catalog']().connections[0].targets[0].queries[0].expression;
  assert.equal((await f.read({ query: expression })).query, expression);
});

test('GCP validates every resource label kind unit metric and source timestamp', async () => {
  for (const change of [s => { s.resource.labels.project_id = 'other-project'; }, s => { s.resource.labels.location = 'other-region'; }, s => { s.resource.labels.cluster_name = 'other-cluster'; }, s => { delete s.resource.labels.node_name; }, s => { s.resource.labels.uid = 'invented'; }, s => { s.metric.type = 'kubernetes.io/node/cpu/total_cores'; }, s => { s.metricKind = 'GAUGE'; }, s => { s.valueType = 'INT64'; }, s => { s.unit = 'percent'; }, s => { s.points[0].interval.endTime = '2026-01-01T00:06:00Z'; }, s => { s.points[0].interval.endTime = '2026-02-30T00:00:00Z'; }, s => { s.points[0].value.doubleValue = -1; }, s => { s.points[0].privateToken = 'forged'; }]) {
    const series = gcpSeries(); change(series); const f = gcpSetup({ body: { timeSeries: [series] } });
    const result = await f.read(); assert.equal(result.status, 'invalid_response'); assert.deepEqual(result.data.matrix, []); assert.equal(result.data.raw, null);
  }
  const saved = gcpConfig(); saved.connections[0].targets[0].subject = { kind: 'Node', name: 'different-node' };
  assert.equal((await gcpSetup({ saved }).read()).status, 'invalid_response');
});

test('GCP memory types stay separate and raw INT64 remains exact above Number precision', async () => {
  const metric = 'memory/used_bytes', series = gcpIntSeries(metric, [['2026-01-01T00:01:00Z', '9007199254740993']], { metric: { type: 'kubernetes.io/node/' + metric, labels: { memory_type: 'evictable' } } });
  const f = gcpSetup({ saved: gcpConfig('node-memory-evictable'), body: { timeSeries: [series] } });
  const result = await f.read(); assert.equal(result.status, 'ok'); assert.equal(result.data.matrix[0].values[0][1], '9007199254740993');
  assert.equal(result.data.matrix[0].metric.memory_type, 'evictable'); assert.equal(result.data.unit, 'By');
  series.metric.labels.memory_type = 'non-evictable'; assert.equal((await f.read()).status, 'invalid_response');
  series.metric.labels.memory_type = 'evictable'; series.points[0].value.int64Value = '9223372036854775808'; assert.equal((await f.read()).status, 'invalid_response');
});

test('GCP explicit CPU and network rate use adjacent intervals and preserve raw counters', async () => {
  const cpu = await gcpSetup({ saved: gcpConfig('node-cpu-rate') }).read();
  assert.equal(cpu.status, 'ok'); assert.deepEqual(cpu.data.matrix[0].values, [[1767225720, '0.5']]); assert.equal(cpu.data.unit, 'cores');
  assert.equal(cpu.data.transform.meaning, 'interval-average'); assert.equal(cpu.data.raw.timeSeries[0].points[0].value.doubleValue, 130);
  const series = gcpIntSeries('network/received_bytes_count', [['2026-01-01T00:01:00Z', '9007199254740993'], ['2026-01-01T00:02:00Z', '9007199254741053']]);
  const net = await gcpSetup({ saved: gcpConfig('node-network-rx-rate'), body: { timeSeries: [series] } }).read();
  assert.equal(net.data.matrix[0].values[0][1], '1'); assert.equal(net.data.unit, 'By/s');
  assert.equal(net.data.raw.timeSeries[0].points[0].value.int64Value, '9007199254740993');
});

test('GCP counter reset or new cumulative start creates gaps and never negative or manufactured zero', async () => {
  const series = gcpSeries(); series.points.push({ interval: { startTime: '2026-01-01T00:02:30Z', endTime: '2026-01-01T00:03:00Z' }, value: { doubleValue: 3 } }, { interval: { startTime: '2026-01-01T00:02:30Z', endTime: '2026-01-01T00:04:00Z' }, value: { doubleValue: 9 } });
  const result = await gcpSetup({ saved: gcpConfig('node-cpu-rate'), body: { timeSeries: [series] } }).read();
  assert.deepEqual(result.data.matrix[0].values, [[1767225720, '0.5'], [1767225840, '0.1']]); assert.equal(result.data.transform.resetCount, 1);
  const single = gcpSeries(); single.points = single.points.slice(0, 1);
  const empty = await gcpSetup({ saved: gcpConfig('node-cpu-rate'), body: { timeSeries: [single] } }).read();
  assert.equal(empty.status, 'empty'); assert.deepEqual(empty.data.matrix[0].values, []); assert.equal(empty.data.coverage.sourcePoints, 1);
  assert.equal(empty.observedAt, single.points[0].interval.endTime);
});

test('GCP full pagination merges only identical series and never exposes native cursor', async () => {
  const first = gcpSeries(), second = gcpSeries(); first.points = first.points.slice(1); second.points = second.points.slice(0, 1);
  const f = gcpSetup({ fetch: async (url, _options, n) => {
    assert.equal(new URL(url).searchParams.get('view'), 'FULL'); assert.equal(new URL(url).searchParams.get('pageSize'), '500');
    if (n === 2) assert.equal(new URL(url).searchParams.get('pageToken'), 'native-cursor');
    return response(n === 1 ? { timeSeries: [first], nextPageToken: 'native-cursor' } : { timeSeries: [second] });
  } });
  const result = await f.read(); assert.equal(result.status, 'ok'); assert.equal(result.data.coverage.pages, 2); assert.equal(result.data.matrix.length, 1); assert.equal(result.data.matrix[0].values.length, 2);
  assert.ok(!JSON.stringify(result).includes('native-cursor')); assert.equal(result.data.raw.timeSeries.length, 2);
});

test('GCP later-page denial cursor loops page limits and duplicate conflicts discard partial results', async () => {
  for (const mode of ['forbidden', 'loop', 'limit', 'conflict']) {
    const f = gcpSetup({ fetch: async (_url, _options, n) => {
      if (mode === 'forbidden' && n === 2) return new Response('untrusted', { status: 403 });
      const series = gcpSeries(); if (mode === 'conflict' && n === 2) series.points[0].value.doubleValue++;
      return response({ timeSeries: [series], ...(mode === 'conflict' && n === 2 ? {} : { nextPageToken: mode === 'loop' ? 'same' : String(n) }) });
    } });
    const result = await f.read(); assert.equal(result.status, mode === 'forbidden' ? 'forbidden' : 'invalid_response'); assert.deepEqual(result.data.matrix, []); assert.equal(result.data.raw, null);
    assert.ok(f.calls.length <= 10);
  }
});

test('GCP response bytes point count and series count are bounded across the whole read', async () => {
  const points = gcpSeries(); points.points = Array.from({ length: LIMITS.points + 1 }, () => points.points[0]);
  assert.equal((await gcpSetup({ body: { timeSeries: [points] } }).read()).status, 'invalid_response');
  const series = Array.from({ length: 501 }, (_, n) => { const s = gcpSeries(); s.resource.labels.node_name = 'node-' + n; return s; });
  assert.equal((await gcpSetup({ body: { timeSeries: series } }).read()).status, 'invalid_response');
  const repeated = gcpSeries(); repeated.points = [];
  assert.equal((await gcpSetup({ body: { timeSeries: Array.from({ length: 501 }, () => repeated) } }).read()).status, 'invalid_response');
  const big = gcpSetup({ fetch: async () => new Response('x'.repeat(LIMITS.bodyBytes + 1)) }); assert.equal((await big.read()).status, 'invalid_response');
});

test('GCP pending credentials cancellation prevents late fetch and a subsequent independent read recovers', async () => {
  let release, initial = true;
  const f = gcpSetup({ credentials: () => initial ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ token: 'synthetic-oauth-value' }) });
  const controller = new AbortController(), pending = f.read({}, { signal: controller.signal });
  controller.abort(); const cancelled = await pending; assert.equal(cancelled.status, 'cancelled'); assert.equal(f.calls.length, 0);
  release({ token: 'synthetic-oauth-value' }); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.calls.length, 0);
  initial = false; assert.equal((await f.read()).status, 'ok');
});

test('GCP deadline includes pending credentials and never starts a late HTTP request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let release;
  try {
    const f = gcpSetup({ credentials: () => new Promise(resolve => { release = resolve; }) }), pending = f.read();
    t.mock.timers.tick(LIMITS.timeoutMs); assert.equal((await pending).status, 'network_error');
    release({ token: 'synthetic-oauth-value' }); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.calls.length, 0);
  } finally { t.mock.timers.reset(); }
});

test('GCP independent duplicate-query reads retain slot16 bounds reverse completion and recovery', async () => {
  const pending = [];
  const f = gcpSetup({ fetch: () => new Promise(resolve => pending.push(resolve)) });
  const reads = Array.from({ length: 16 }, (_, n) => f.read({ requestId: 'gcp-' + n }));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(pending.length, 16);
  assert.equal((await f.read({ requestId: 'overflow' })).status, 'not_queried');
  for (let n = 15; n >= 0; n--) pending[n](response({ timeSeries: [gcpSeries()] }));
  const results = await Promise.all(reads); results.forEach((result, n) => { assert.equal(result.status, 'ok'); assert.equal(result.requestId, 'gcp-' + n); });
  const next = f.read({ requestId: 'recovered' }); await new Promise(resolve => setImmediate(resolve)); pending[16](response({})); assert.equal((await next).status, 'empty');
});

test('GCP resets are gaps even when a new counter starts higher and timestamp precision conflicts are rejected', async () => {
  for (const mode of ['higher-new-start', 'lower-same-start']) {
    const series = gcpSeries(); series.points[0].value.doubleValue = mode === 'higher-new-start' ? 200 : 3;
    if (mode === 'higher-new-start') series.points[0].interval.startTime = '2026-01-01T00:01:30Z';
    const result = await gcpSetup({ saved: gcpConfig('node-cpu-rate'), body: { timeSeries: [series] } }).read();
    assert.equal(result.status, 'empty'); assert.deepEqual(result.data.matrix[0].values, []); assert.equal(result.data.transform.resetCount, 1);
  }
  const series = gcpSeries(); series.points[0].interval.endTime = '2026-01-01T00:01:00.000000001Z'; series.points[1].interval.endTime = '2026-01-01T00:01:00.000000002Z';
  assert.equal((await gcpSetup({ body: { timeSeries: [series] } }).read()).status, 'invalid_response');
});


test('GCP sampling comes only from fixed live descriptor metadata and never request step', async () => {
  const f = gcpSetup(); const result = await f.read();
  assert.equal(result.status, 'ok'); assert.equal(result.data.source.samplePeriod, '60s'); assert.equal(result.data.source.ingestDelay, '0s');
  const sampling = result.data.source.sampling;
  assert.equal(sampling.status, 'ok'); assert.equal(sampling.samplePeriodSeconds, 60); assert.equal(sampling.ingestDelaySeconds, 0);
  assert.equal(sampling.provenance.kind, 'metricDescriptor.metadata'); assert.equal(sampling.provenance.contextId, GCP_CONTEXT);
  assert.equal(sampling.provenance.metricType, 'kubernetes.io/node/cpu/core_usage_time'); assert.equal(sampling.observedAt, '2026-01-02T00:00:00Z');
  assert.equal(sampling.cache.hit, false); assert.equal(f.descriptorCalls.length, 1);
  assert.equal(f.descriptorCalls[0].url.origin, 'https://monitoring.googleapis.com');
  assert.equal(f.descriptorCalls[0].url.pathname, '/v3/projects/fixture-project/metricDescriptors/kubernetes.io/node/cpu/core_usage_time');
  assert.equal(f.descriptorCalls[0].options.method, 'GET'); assert.equal(f.descriptorCalls[0].options.headers.authorization, 'Bearer synthetic-oauth-value');
  assert.deepEqual(result.data.matrix[0].values, [[1767225660, '100'], [1767225720, '130']]);
  const different = gcpSetup({ descriptor: async () => response(gcpDescriptor(undefined, undefined, { metadata: { samplePeriod: '120.5s', ingestDelay: '1.25s' } })) });
  const changed = await different.read({ queryWindow: { ...WINDOW, step: 60 } });
  assert.equal(changed.data.source.samplePeriod, '120.5s'); assert.equal(changed.data.source.sampling.samplePeriodSeconds, 120.5); assert.equal(changed.data.source.sampling.ingestDelaySeconds, 1.25);
});

test('GCP sampling TTL cache retains verification time and never pretends every query rechecked metadata', async () => {
  let clock = 0, wall = '2026-01-02T00:00:00Z';
  const f = gcpSetup({ clock: () => clock, now: () => wall }); const first = await f.read();
  clock = 1000; wall = '2026-01-02T00:00:01Z'; const second = await f.read();
  assert.equal(f.descriptorCalls.length, 1); assert.equal(second.data.source.sampling.cache.hit, true);
  assert.equal(second.data.source.sampling.observedAt, first.data.source.sampling.observedAt); assert.equal(second.receivedAt, wall);
  first.data.source.sampling.provenance.metricType = 'forged'; first.data.source.sampling.samplePeriod = '999s';
  assert.equal((await f.read()).data.source.samplePeriod, '60s');
  clock = 300001; wall = '2026-01-02T00:05:01Z'; const expired = await f.read();
  assert.equal(f.descriptorCalls.length, 2); assert.equal(expired.data.source.sampling.cache.hit, false); assert.equal(expired.data.source.sampling.observedAt, wall);
});

test('GCP sampling failure or malformed metadata preserves exact timeSeries values with unknown cadence', async () => {
  const cases = [
    [() => new Response('untrusted-secret', { status: 403 }), 'forbidden'],
    [() => new Response('untrusted-secret', { status: 401 }), 'unauthenticated'],
    [() => new Response('untrusted-secret', { status: 404 }), 'empty'],
    [() => response({}), 'empty'],
    [() => new Response('not-json-untrusted-secret'), 'invalid_response'],
    [() => response(gcpDescriptor(undefined, undefined, { metadata: undefined })), 'empty'],
    [() => response(gcpDescriptor(undefined, undefined, { metadata: { samplePeriod: '0s', ingestDelay: '0s' } })), 'invalid_response'],
    [() => response(gcpDescriptor(undefined, undefined, { metadata: { samplePeriod: '60s', ingestDelay: '-1s' } })), 'invalid_response'],
    [() => response(gcpDescriptor(undefined, undefined, { metadata: { samplePeriod: 60, ingestDelay: 0 } })), 'invalid_response'],
    [() => response(gcpDescriptor(undefined, undefined, { type: 'kubernetes.io/node/wrong' })), 'invalid_response'],
    [() => response(gcpDescriptor(undefined, undefined, { name: 'projects/other-project/metricDescriptors/kubernetes.io/node/cpu/core_usage_time' })), 'invalid_response'],
    [() => response(gcpDescriptor(undefined, undefined, { metricKind: 'GAUGE' })), 'invalid_response'],
    [() => response(gcpDescriptor(undefined, undefined, { valueType: 'INT64' })), 'invalid_response'],
    [() => response(gcpDescriptor(undefined, undefined, { unit: 'percent' })), 'invalid_response'],
    [() => response(gcpDescriptor(undefined, undefined, { monitoredResourceTypes: ['global'] })), 'invalid_response'],
  ];
  for (const [descriptor, expected] of cases) {
    const f = gcpSetup({ descriptor }), result = await f.read();
    assert.equal(result.status, 'ok'); assert.deepEqual(result.data.matrix[0].values, [[1767225660, '100'], [1767225720, '130']]);
    assert.deepEqual(result.data.raw, { timeSeries: [gcpSeries()] }); assert.equal(result.data.identityEvidence.uid, null);
    assert.equal(result.observedAt, '2026-01-01T00:02:00Z'); assert.deepEqual(result.queryWindow, WINDOW);
    assert.equal(result.data.source.sampling.status, expected); assert.equal(result.data.source.samplePeriod, null); assert.equal(result.data.source.ingestDelay, null);
    assert.equal(result.data.source.sampling.samplePeriodSeconds, null); assert.equal(result.data.source.sampling.observedAt, null);
    assert.ok(!JSON.stringify(result).includes('untrusted-secret'));
  }
});

test('GCP sampling cache is context project and metric type bound and shared only across transforms of that type', async () => {
  const saved = gcpConfig(), body = { timeSeries: [gcpSeries()] };
  const f = gcpSetup({ saved, body, contexts: [GCP_CONTEXT, 'other-context'] });
  await f.read(); await f.read(); assert.equal(f.descriptorCalls.length, 1);
  saved.connections[0].contextId = 'other-context'; await f.read(); assert.equal(f.descriptorCalls.length, 2);
  saved.connections[0].projectId = 'other-project'; body.timeSeries[0].resource.labels.project_id = 'other-project'; await f.read(); assert.equal(f.descriptorCalls.length, 3);
  Object.assign(saved.connections[0].targets[0].queries[0], { templateId: 'node-cpu-rate', role: 'cpu', unit: 'cores' });
  const rate = await f.read(); assert.equal(rate.data.source.sampling.cache.hit, true); assert.equal(f.descriptorCalls.length, 3);
  Object.assign(saved.connections[0].targets[0].queries[0], { templateId: 'node-memory-evictable', role: 'memory-evictable', unit: 'By' });
  body.timeSeries = [gcpIntSeries('memory/used_bytes', [['2026-01-01T00:01:00Z', '50']], { metric: { type: 'kubernetes.io/node/memory/used_bytes', labels: { memory_type: 'evictable' } } })];
  body.timeSeries[0].resource.labels.project_id = 'other-project';
  const memory = await f.read(); assert.equal(memory.status, 'ok'); assert.equal(f.descriptorCalls.length, 4); assert.equal(memory.data.source.samplePeriod, '60s');
});

test('GCP sampling expired or failed metadata never falls back to the previous cadence and recovers independently', async () => {
  let clock = 0, rejected = false;
  const f = gcpSetup({ clock: () => clock, descriptor: async () => rejected ? new Response('untrusted', { status: 403 }) : response(gcpDescriptor(undefined, undefined, { metadata: { samplePeriod: '90s', ingestDelay: '0s' } })) });
  assert.equal((await f.read()).data.source.samplePeriod, '90s');
  clock = 300001; rejected = true; const failure = await f.read(); assert.equal(failure.data.source.samplePeriod, null); assert.equal(failure.data.source.sampling.status, 'forbidden');
  rejected = false; const recovered = await f.read(); assert.equal(recovered.data.source.samplePeriod, '90s'); assert.equal(recovered.data.source.sampling.cache.hit, false);
  assert.equal(f.descriptorCalls.length, 3);
});

test('GCP sampling cache has a bounded LRU footprint', async () => {
  const saved = gcpConfig(), body = { timeSeries: [gcpSeries()] }, f = gcpSetup({ saved, body, clock: () => 0 });
  for (let n = 0; n <= 128; n++) {
    saved.connections[0].projectId = 'fixture-project-' + n; body.timeSeries[0].resource.labels.project_id = saved.connections[0].projectId;
    assert.equal((await f.read()).status, 'ok');
  }
  assert.equal(f.descriptorCalls.length, 129);
  saved.connections[0].projectId = 'fixture-project-0'; body.timeSeries[0].resource.labels.project_id = saved.connections[0].projectId;
  assert.equal((await f.read()).data.source.sampling.cache.hit, false); assert.equal(f.descriptorCalls.length, 130);
});

test('GCP sampling shares the original byte budget and never forwards descriptor raw content', async () => {
  const f = gcpSetup({ descriptor: async () => new Response('x'.repeat(LIMITS.bodyBytes)) }), result = await f.read();
  assert.equal(result.status, 'ok'); assert.equal(result.data.source.sampling.status, 'invalid_response'); assert.equal(result.data.source.samplePeriod, null);
  assert.deepEqual(result.data.matrix[0].values, [[1767225660, '100'], [1767225720, '130']]);
  const clean = gcpSetup({ descriptor: async () => response(gcpDescriptor(undefined, undefined, { description: 'untrusted-secret', metadata: { samplePeriod: '60s', ingestDelay: '0s', privateToken: 'untrusted-secret' } })) });
  assert.ok(!JSON.stringify(await clean.read()).includes('untrusted-secret'));
});

test('GCP sampling uses remaining original deadline and retains completed values when metadata times out', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let releaseSeries, releaseDescriptor;
  try {
    const f = gcpSetup({ fetch: () => new Promise(resolve => { releaseSeries = resolve; }), descriptor: () => new Promise(resolve => { releaseDescriptor = resolve; }) });
    const pending = f.read(); await new Promise(resolve => setImmediate(resolve));
    t.mock.timers.tick(9000); releaseSeries(response({ timeSeries: [gcpSeries()] })); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.descriptorCalls.length, 1); assert.equal(f.calls[0].options.signal, f.descriptorCalls[0].options.signal);
    t.mock.timers.tick(1000); const result = await pending;
    assert.equal(result.status, 'ok'); assert.equal(result.data.source.sampling.status, 'network_error'); assert.equal(result.data.source.samplePeriod, null);
    assert.deepEqual(result.data.matrix[0].values, [[1767225660, '100'], [1767225720, '130']]);
    releaseDescriptor(response(gcpDescriptor())); await new Promise(resolve => setImmediate(resolve));
  } finally { t.mock.timers.reset(); }
});

test('GCP sampling external cancellation still abandons the caller response and does not cache late metadata', async () => {
  let release, first = true;
  const f = gcpSetup({ descriptor: () => first ? new Promise(resolve => { release = resolve; }) : Promise.resolve(response(gcpDescriptor())) });
  const controller = new AbortController(), pending = f.read({}, { signal: controller.signal }); await new Promise(resolve => setImmediate(resolve));
  controller.abort(); assert.equal((await pending).status, 'cancelled');
  release(response(gcpDescriptor())); await new Promise(resolve => setImmediate(resolve)); first = false;
  const next = await f.read(); assert.equal(next.data.source.sampling.cache.hit, false); assert.equal(f.descriptorCalls.length, 2);
});

function consoleResolverFixture(saved = gcpConfig(), contexts = [GCP_CONTEXT]) {
  const no = () => assert.fail('unexpected credential, network or command access');
  return createObservability({ readConfig: () => saved, contextIds: () => contexts, client: no, fetchImpl: no, execFileImpl: no, awsExecutable: no });
}
test('gcp_console_derived_from_unique_native_registration_without_credentials', () => {
  const saved = gcpConfig();
  const before = JSON.stringify(saved), service = consoleResolverFixture(saved);
  const descriptor = service.resolveGcpConsole({ contextId: GCP_CONTEXT });
  assert.deepEqual(descriptor, { provider: 'gcp-monitoring', connectionId: 'google', contextId: GCP_CONTEXT, projectId: 'fixture-project', url: 'https://console.cloud.google.com/monitoring?project=fixture-project' });
  assert.equal(JSON.stringify(saved), before);
  saved.connections[0].projectId = 'another-project';
  assert.equal(descriptor.url, 'https://console.cloud.google.com/monitoring?project=fixture-project');
  assert.equal(service.resolveGcpConsole({ contextId: GCP_CONTEXT }).url, 'https://console.cloud.google.com/monitoring?project=another-project');
});
test('gcp_console_rejects_unknown_input_keys_inherited_getters_and_non_records_without_evaluating_getters', () => {
  let getters = 0;const accessor = {};Object.defineProperty(accessor, 'contextId', { enumerable: true, get() { getters++;return GCP_CONTEXT; } });
  const inputs = [null, [], {}, { contextId: GCP_CONTEXT, url: 'https://untrusted.invalid' }, { contextId: GCP_CONTEXT, project: 'other-project' }, Object.create({ contextId: GCP_CONTEXT }), accessor, { contextId: GCP_CONTEXT, [Symbol('extra')]: true }, { contextId: '' }];
  const service = consoleResolverFixture();for (const input of inputs) assert.throws(() => service.resolveGcpConsole(input), e => e.status === 'invalid_request');
  assert.equal(getters, 0);
});
test('gcp_console_rejects_wrong_provider_duplicate_context_missing_registration_and_invalid_project', () => {
  for (const change of [s => { s.connections = []; }, s => { s.connections[0].provider = 'prometheus'; }, s => { s.connections.push({ ...s.connections[0], id: 'duplicate' }); }]) {
    const saved = gcpConfig();change(saved);assert.throws(() => consoleResolverFixture(saved).resolveGcpConsole({ contextId: GCP_CONTEXT }), e => e.status === 'unconfigured');
  }
  for (const project of ['Upper-project', 'short', 'project_', 'a'.repeat(31), 'project-1&extra=2', 'project-1#fragment', 'user@project-1', 'project-']) {
    const saved = gcpConfig();saved.connections[0].projectId = project;assert.throws(() => consoleResolverFixture(saved).resolveGcpConsole({ contextId: GCP_CONTEXT }), e => e.status === 'unconfigured');
  }
  assert.throws(() => consoleResolverFixture(gcpConfig(), []).resolveGcpConsole({ contextId: GCP_CONTEXT }), e => e.status === 'unconfigured');
  assert.throws(() => consoleResolverFixture(gcpConfig(), [GCP_CONTEXT,GCP_CONTEXT]).resolveGcpConsole({ contextId: GCP_CONTEXT }), e => e.status === 'unconfigured');
});
test('gcp_console_native_metadata_getters_fail_closed_and_public_descriptor_is_only_safe_tuple', () => {
  let getters = 0;const saved = gcpConfig();Object.defineProperty(saved.connections[0], 'projectId', { enumerable: true, get() { getters++;return 'fixture-project'; } });
  assert.throws(() => consoleResolverFixture(saved).resolveGcpConsole({ contextId: GCP_CONTEXT }), e => e.status === 'unconfigured');assert.equal(getters, 0);
  const descriptor = consoleResolverFixture().resolveGcpConsole({ contextId: GCP_CONTEXT }), url = new URL(descriptor.url);
  assert.equal(url.origin, 'https://console.cloud.google.com');assert.equal(url.pathname, '/monitoring');assert.deepEqual([...url.searchParams], [['project','fixture-project']]);assert.equal(url.username+url.password+url.hash, '');
  assert.deepEqual(Object.keys(descriptor).sort(), ['provider','connectionId','contextId','projectId','url'].sort());
  assert.doesNotMatch(JSON.stringify(descriptor), /credential|command|token|profile|partition/);
});


test('gcp_console_same_context_non_gcp_companions_do_not_replace_unique_gcp_registration', () => {
  for (const [provider, operation] of [['kubernetes','logs'],['gitops','changes'],['prometheus','metrics']]) {
    for (const companionFirst of [true, false]) {
      const saved = gcpConfig();
      const companion = operationConfig(provider, operation).connections[0];companion.contextId = GCP_CONTEXT;
      if (companionFirst) saved.connections.unshift(companion);else saved.connections.push(companion);
      const before = JSON.stringify(saved), descriptor = consoleResolverFixture(saved).resolveGcpConsole({ contextId: GCP_CONTEXT });
      assert.deepEqual(descriptor, { provider: 'gcp-monitoring', connectionId: 'google', contextId: GCP_CONTEXT, projectId: 'fixture-project', url: 'https://console.cloud.google.com/monitoring?project=fixture-project' });
      assert.equal(JSON.stringify(saved), before);
      saved.connections.push({ ...gcpConfig().connections[0], id: 'second-google' });
      assert.throws(() => consoleResolverFixture(saved).resolveGcpConsole({ contextId: GCP_CONTEXT }), error => error.status === 'unconfigured');
    }
  }
  assert.throws(() => consoleResolverFixture(gcpConfig(), [GCP_CONTEXT,'aws-context']).resolveGcpConsole({ contextId: 'aws-context' }), error => error.status === 'unconfigured');
});
