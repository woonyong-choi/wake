const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function daemonSet() {
  return { kind: 'DaemonSet', metadata: { name: 'wake-agent', namespace: 'wake-system', uid: 'fixture-ds-uid', generation: 7,
    labels: { 'app.kubernetes.io/instance': 'wake-agent', 'app.kubernetes.io/component': 'agent', 'app.kubernetes.io/version': 'fixture-label-not-runtime-version' } },
    spec: { template: { spec: { containers: [{ name: 'sidecar', image: 'fixture-sidecar:1' }, { name: 'agent', image: 'registry.fixture:5000/wake@sha256:' + 'a'.repeat(64) }] } } },
    status: { observedGeneration: 7, desiredNumberScheduled: 2, currentNumberScheduled: 2, updatedNumberScheduled: 2, numberReady: 2, numberAvailable: 2, numberUnavailable: 0, numberMisscheduled: 0 } };
}
function fixture(response = daemonSet(), error) {
  const source = fs.readFileSync(path.join(__dirname, 'services.cjs'), 'utf8');
  const start = source.indexOf("    'agent.status':"), end = source.indexOf('    /* GitOps:', start);
  const calls = [], clients = [];
  const methods = vm.runInNewContext('({' + source.slice(start, end) + '})', {
    providers: { client(id) { clients.push({ id }); return { async request(method, url) {
      calls.push({ method, url }); if (error) throw error; return structuredClone(response);
    } }; } },
  });
  return { read: (args = { id: 'fixture-context' }) => methods['agent.status'](args), calls, clients };
}

test('agent_status_reads_only_exact_chart_daemonset', async () => {
  const f = fixture(), r = await f.read();
  assert.deepEqual(f.calls, [{ method: 'GET', url: '/apis/apps/v1/namespaces/wake-system/daemonsets/wake-agent' }]);
  assert.deepEqual(f.clients, [{ id: 'fixture-context' }]);
  assert.equal(r.lookup, 'present'); assert.equal(r.installed, true); assert.equal(r.unknown, false);
  assert.equal(r.identity.kind, 'DaemonSet'); assert.equal(r.identity.name, 'wake-agent'); assert.equal(r.identity.uid, 'fixture-ds-uid');
  assert.equal(r.rolloutReady, true); assert.equal(r.rollout.state, 'ready');
  assert.equal(r.version, null);
});

test('agent_status_rejects_renderer_identity_overrides_before_client_access', async () => {
  const f = fixture();
  for (const args of [null, [], {}, { id: '' }, { id: 'bad\ncontext' }, { id: 'x'.repeat(257) }, { id: 'fixture-context', namespace: 'other' },
    { id: 'fixture-context', name: 'other' }, { id: 'fixture-context', kind: 'Deployment' }, { id: 'fixture-context', host: 'other' }]) {
    const r = await f.read(args); assert.equal(r.lookup, 'query_error'); assert.equal(r.installed, null); assert.equal(r.rolloutReady, null);
    assert.equal(r.readError.kind, 'invalid_request');
  }
  assert.equal(f.calls.length, 0); assert.equal(f.clients.length, 0);
});

test('agent_status_distinguishes_absence_forbidden_timeout_and_query_error_without_raw_payload', async () => {
  for (const [error, expected] of [[{ status: 404 }, 'absent'], [{ status: 403 }, 'forbidden'], [{ kind: 'forbidden' }, 'forbidden'],
    [{ kind: 'timeout' }, 'timeout'], [{ code: 'ETIMEDOUT' }, 'timeout'], [{ status: 504 }, 'timeout'], [{ status: 401 }, 'query_error'],
    [{ status: 500 }, 'query_error'], [{ message: 'fixture private error body' }, 'query_error']]) {
    const f = fixture(null, error), r = await f.read();
    assert.equal(r.lookup, expected); assert.equal(r.installed, expected === 'absent' ? false : null);
    assert.equal(r.rolloutReady, expected === 'absent' ? false : null); assert.equal(r.unknown, expected !== 'absent');
    assert.equal(f.calls.length, 1);
    assert.equal(JSON.stringify(r).includes('fixture private error body'), false);
  }
});

test('agent_status_does_not_adopt_name_kind_namespace_or_release_collision', async () => {
  for (const mutate of [d => { d.kind = 'Deployment'; }, d => { d.metadata.name = 'wake-agent-other'; }, d => { d.metadata.namespace = 'other'; },
    d => { d.metadata.labels['app.kubernetes.io/instance'] = 'other-release'; }, d => { d.metadata.labels['app.kubernetes.io/component'] = 'other'; }]) {
    const d = daemonSet(); mutate(d); const r = await fixture(d).read();
    assert.equal(r.lookup, 'query_error'); assert.equal(r.readError.kind, 'identity_mismatch'); assert.equal(r.installed, null); assert.equal(r.rolloutReady, null);
  }
});

test('agent_status_stale_generation_zero_desired_partial_rollout_and_deletion_never_ready', async () => {
  const cases = [
    [d => { d.status.observedGeneration = 6; }, 'generation_not_observed'],
    [d => { for (const k of Object.keys(d.status)) if (k !== 'observedGeneration') d.status[k] = 0; }, 'no_desired_nodes'],
    [d => { d.status.currentNumberScheduled = 1; }, 'rollout_incomplete'],
    [d => { d.status.updatedNumberScheduled = 1; }, 'rollout_incomplete'],
    [d => { d.status.numberReady = 1; }, 'rollout_incomplete'],
    [d => { d.status.numberAvailable = 1; d.status.numberUnavailable = 1; }, 'rollout_incomplete'],
    [d => { d.status.numberMisscheduled = 1; }, 'rollout_incomplete'],
    [d => { d.metadata.deletionTimestamp = '2026-11-06T00:00:00Z'; }, 'deleting'],
  ];
  for (const [mutate, reason] of cases) {
    const d = daemonSet(); mutate(d); const r = await fixture(d).read();
    assert.equal(r.lookup, 'present'); assert.equal(r.installed, true); assert.equal(r.rolloutReady, false); assert.equal(r.rollout.reason, reason);
  }
});

test('agent_status_missing_required_fields_are_unknown_instead_of_zero_or_ready', async () => {
  for (const field of ['observedGeneration', 'desiredNumberScheduled', 'currentNumberScheduled', 'updatedNumberScheduled', 'numberReady', 'numberAvailable', 'numberMisscheduled']) {
    const d = daemonSet(); delete d.status[field]; const r = await fixture(d).read();
    assert.equal(r.installed, true); assert.equal(r.rolloutReady, null, field); assert.equal(r.rollout.reason, 'incomplete_observation');
  }
  for (const mutate of [d => { delete d.metadata.uid; }, d => { delete d.metadata.generation; }, d => { delete d.status; }, d => { delete d.spec; },
    d => { d.spec.template.spec.containers[1].image = ''; }]) {
    const d = daemonSet(); mutate(d); const r = await fixture(d).read(); assert.equal(r.rolloutReady, null);
  }
});

test('agent_status_omitted_unavailable_is_explicitly_derived_from_required_counters', async () => {
  const d = daemonSet(); delete d.status.numberUnavailable;
  const ready = await fixture(d).read(); assert.equal(ready.rolloutReady, true); assert.equal(ready.rollout.unavailableDerived, true); assert.equal(ready.rollout.counters.numberUnavailable, 0);
  d.status.numberAvailable = 1;
  const partial = await fixture(d).read(); assert.equal(partial.rolloutReady, false); assert.equal(partial.rollout.counters.numberUnavailable, 1);
  d.status.numberAvailable = 3;
  const invalid = await fixture(d).read(); assert.equal(invalid.rolloutReady, null); assert.equal(invalid.rollout.reason, 'invalid_status');
});

test('agent_status_invalid_counts_and_future_generation_are_not_success', async () => {
  for (const [key, value] of [['observedGeneration', 8], ['numberReady', -1], ['numberAvailable', '2'], ['numberUnavailable', undefined],
    ['desiredNumberScheduled', NaN], ['numberMisscheduled', 0.1], ['updatedNumberScheduled', Number.MAX_SAFE_INTEGER + 1]]) {
    const d = daemonSet(); d.status[key] = value; const r = await fixture(d).read(); assert.equal(r.rolloutReady, null, key);
  }
});

test('agent_status_preserves_exact_agent_image_ref_without_parsing_port_digest_or_version', async () => {
  for (const image of ['registry.fixture:5000/wake:0.1.0', 'registry.fixture:5000/wake@sha256:' + 'b'.repeat(64), 'wake:tag']) {
    const d = daemonSet(); d.spec.template.spec.containers[1].image = image;
    const r = await fixture(d).read(); assert.equal(r.imageRef, image); assert.equal(r.version, null); assert.equal(r.rolloutReady, true);
  }
  const d = daemonSet(); d.spec.template.spec.containers.push({ name: 'agent', image: 'other:1' });
  const ambiguous = await fixture(d).read(); assert.equal(ambiguous.imageRef, null); assert.equal(ambiguous.rolloutReady, null);
});

test('actual strict GCP service still receives exactly the original two from fields', async () => {
  const { EventEmitter } = require('node:events');
  const main = fs.readFileSync(path.join(__dirname, '../../../kit/desktop/main.cjs'), 'utf8');
  const begin = main.indexOf('function createServiceOwnerTracker()'), end = main.indexOf('\nfunction start(', begin);
  const t = vm.runInNewContext('(' + main.slice(begin, end) + ')')();
  const wc = id => Object.assign(new EventEmitter(), { id, mainFrame: { processId: id * 10, routingId: id * 10 + 1 }, isDestroyed: () => false });
  const shell = wc(11), page = wc(12), win = Object.assign(new EventEmitter(), { id: 1, isDestroyed: () => false });
  const W = { win, shellView: { webContents: shell }, tabs: new Map([['a', { view: { webContents: page }, tool: false }]]), active: 'a' };
  const s = { W, e: { sender: shell, senderFrame: shell.mainFrame } };
  const native = fs.readFileSync(path.join(__dirname, 'services.cjs'), 'utf8');
  const first = native.indexOf("    'gcp.console.open':"), last = native.indexOf("    'observability.catalog':", first);
  const a = main.indexOf("  ipcMain.handle('kit:service:call'"), b = main.indexOf("  ipcMain.on('kit:settings:load'", a);
  let callback;
  const requested = [], descriptor = { provider: 'gcp-monitoring', contextId: 'fixture-gke', projectId: 'fixture-project', url: 'https://console.cloud.google.com/monitoring?project=fixture-project' };
  vm.runInNewContext('const services=({' + native.slice(first, last) + '});\n' + main.slice(a, b), {
    URL, ipcMain: { handle(_name, fn) { callback = fn; } }, byContents: new Map(), shellOf: () => s.W, serviceOwners: t,
    observability: { resolveGcpConsole: () => descriptor }, openExternal: async url => requested.push(url),
    saveFile() { throw Error('unexpected file write'); }, appearanceBroker: {}, updateBroker: {},
  });
  const result = await callback(s.e, 'gcp.console.open', { contextId: 'fixture-gke', owner: 'forged' });
  assert.equal(result.status, 'requested'); assert.equal(result.requested, true); assert.deepEqual(requested, [descriptor.url]);
});
