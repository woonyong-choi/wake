import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDataSource } from './index.js';
import { contract, applicationIdentity, createGitopsPolling } from './gitops.js';
import { KIND_LIST } from './kinds.js';

const params = { cluster: 'fixture-cluster', kind: 'pods', ns: 'payments', name: 'fixture-pod' };
/* 테스트 전용 합성 Kubernetes 객체(이 파일 안에만 있음). 기준 2026-11-02T01:15:00Z: Pod는 9일 전 생성, Warning 이벤트 7건이 지난 1시간 안(가장 새것 20초 전),
   1건은 1시간보다 오래됨, Normal 1건 */
const AT = Date.parse('2026-11-02T01:15:00Z'), iso = ms => new Date(ms).toISOString();
const POD = { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'fixture-pod', namespace: 'payments', uid: 'uid-fixture-pod', creationTimestamp: iso(AT - 9 * 86400e3) },
  spec: { nodeName: 'fixture-node', containers: [{ name: 'app', image: 'fixture/app:1' }] }, status: { phase: 'Running', containerStatuses: [{ name: 'app', ready: true, restartCount: 0, state: { running: {} } }] } };
const event = (i, type, agoMs) => ({ apiVersion: 'v1', kind: 'Event', metadata: { name: `fixture-pod.${i}`, namespace: 'payments', uid: `uid-event-${i}`, creationTimestamp: iso(AT - agoMs) },
  involvedObject: { apiVersion: 'v1', kind: 'Pod', name: 'fixture-pod', namespace: 'payments', uid: 'uid-fixture-pod' }, type, reason: type === 'Warning' ? 'BackOff' : 'Pulled', message: 'fixture', count: 1, lastTimestamp: iso(AT - agoMs) });
const OBJECTS = { pods: [POD], events: [...[20e3, 60e3, 120e3, 300e3, 600e3, 1200e3, 3000e3].map((ago, i) => event(i, 'Warning', ago)), event(7, 'Warning', 2 * 3600e3), event(8, 'Normal', 30e3)] };
const originalFetch = globalThis.fetch;
afterEach(() => { delete globalThis.kitService; globalThis.fetch = originalFetch; });
function host(call) {
  globalThis.kitService = { call: (name, args) => name === 'kube.read' ? Promise.resolve({ contexts: [{ id: params.cluster }] }) : Promise.resolve().then(() => call(name, args)) };
  return createDataSource();
}
for (const key of ['resources', 'logs', 'events']) {
  const input = key === 'events' ? { ...params, name: undefined } : params;
  test(`${key}: empty success stays empty`, async () => {
    const value = key === 'logs' ? '' : [];
    assert.deepEqual(await host(() => value).get(key, input), value);
  });
  for (const status of [500, 403]) test(`${key}: rejection preserves identity, status and cause ${status}`, async () => {
    const cause = new Error('fixture transport');
    const error = Object.assign(new Error('fixture read failed', { cause }), { status, need: { verb: 'list', resource: key, namespace: params.ns } });
    await assert.rejects(host(() => { throw error; }).get(key, input), e => e === error && e.cause === cause && e.status === status && e.need.namespace === params.ns);
  });
  test(`${key}: delayed response remains pending until resolved`, async () => {
    let release, settled = false;
    const wait = new Promise(r => { release = r; });
    const request = host(() => wait).get(key, input).then(x => { settled = true; return x; });
    await new Promise(r => setImmediate(r));
    assert.equal(settled, false);
    release(key === 'logs' ? '' : []);
    await request;
    assert.equal(settled, true);
  });
}
test('resource, event and log successes keep shapes and requested context', async () => {
  const calls = [];
  const ds = host((name, args) => { calls.push({ name, args }); return name === 'kube.logs' ? 'fixture log\n' : [args.kind === 'events' ? OBJECTS.events[0] : OBJECTS.pods[0]]; });
  assert.equal((await ds.get('resources', params))[0].name, OBJECTS.pods[0].metadata.name);
  assert.ok((await ds.get('events', { ...params, name: undefined }))[0].object);
  assert.equal(await ds.get('logs', { ...params, previous: true, container: 'fixture-container', tail: 12 }), 'fixture log\n');
  assert.ok(calls.every(c => c.args.id === params.cluster && c.args.ns === params.ns));
  assert.deepEqual(calls.at(-1).args, { id: params.cluster, ns: params.ns, name: params.name, container: 'fixture-container', previous: true, tail: 12 });
});
test('contexts without a service host are rejected, never filled', async () => {
  const ds = createDataSource();
  for (const cluster of ['unknown', 'prod-apne2', 'gke-services', 'aks-platform', 'staging-old']) {
    for (const key of ['cluster', 'resources', 'logs', 'events', 'namespaces', 'summary', 'gitops', 'agent', 'metrics']) {
      await assert.rejects(ds.get(key, { ...params, cluster }), Error);
    }
  }
  host(() => { throw new Error('must not read an unknown context'); });
  await assert.rejects(ds.get('resources', { ...params, cluster: 'unknown' }), /unknown cluster/);
  assert.equal((await ds.get('kind', params)).kind, 'Pod');
});
test('missing cluster is rejected for cluster keys', async () => {
  host(() => []);
  await assert.rejects(createDataSource().get('resources', { kind: 'pods' }), /cluster required/);
});
test('kube.read failure is preserved, retry and context removal are observed', async () => {
  const ds = createDataSource(), error = Object.assign(new Error('fixture kube.read denied'), { status: 403 });
  globalThis.kitService = { call: () => Promise.reject(error) };
  await assert.rejects(ds.get('resources', params), e => e === error);
  host(() => []);
  assert.deepEqual(await ds.get('resources', params), []);
  globalThis.kitService.call = () => Promise.resolve({ contexts: [] });
  await assert.rejects(ds.get('resources', params), /unknown cluster/);
});
for (const key of ['access', 'agent', 'clusterTools', 'toolAccess', 'gitops']) test(`${key}: service failure is not empty success`, async () => {
  const error = Object.assign(new Error('fixture forbidden'), { status: 403 });
  const cluster = `${params.cluster}-${key}`;
  globalThis.kitService = { call: name => name === 'kube.read' ? Promise.resolve({ contexts: [{ id: cluster }] }) : Promise.reject(error) };
  await assert.rejects(createDataSource().get(key, { ...params, cluster }), e => e === error);
});
/* R4-02: cluster › 에이전트 offered "설치" for a chart whose image this version does not carry, and the press then stopped out of sight. A missing
   agent's answer carries the image state of the chart the app would install (agent.prep), so the screens can say so instead of offering it */
test('agent: a missing agent carries the install image state and a failed image read leaves it unknown', async () => {
  const absent = { lookup: 'absent', installed: false, unknown: false };
  for (const [prep, want] of [[() => ({ exists: true, image: { published: false, reason: 'agent_image_unpublished' } }), { published: false, reason: 'agent_image_unpublished' }], [() => { throw new Error('prep failed'); }, null]]) {
    const value = await host(name => name === 'agent.status' ? absent : name === 'agent.heartbeat' ? { lookup: 'absent' } : name === 'agent.prep' ? prep() : assert.fail(name)).get('agent', params);
    assert.deepEqual(value.installImage, want);
  }
});
test('http success, empty, status, transport error and AbortSignal remain distinct', async () => {
  const ds = createDataSource('http'), signal = new AbortController().signal;
  for (const key of ['resources', 'logs', 'events']) {
    for (const value of [key === 'logs' ? 'fixture log' : [{ name: 'fixture' }], key === 'logs' ? '' : []]) {
      globalThis.fetch = async (_url, opts) => { assert.equal(opts.signal, signal); return { ok: true, json: async () => value }; };
      assert.deepEqual(await ds.get(key, params, { signal }), value);
    }
    for (const status of [403, 500]) {
      globalThis.fetch = async () => ({ ok: false, status });
      await assert.rejects(ds.get(key, params), e => e instanceof Error && e.status === status);
    }
  }
  const error = new Error('fixture offline');
  globalThis.fetch = async () => { throw error; };
  await assert.rejects(ds.get('resources', params), e => e === error);
});

test('live summary uses response observation or current time without borrowing snapshot (#35)', async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-11-05T01:15:00Z');
  try {
    for (const [observedAt, warnings] of [[undefined, 0], ['2026-11-02T01:15:00Z', 7], ['invalid', null], ['2026-11-06T01:15:00Z', null]]) {
      const ds = host(() => ({ observedAt, events: OBJECTS.events }));
      const summary = await ds.get('summary', params);
      assert.equal(summary.warnings, warnings);
      assert.equal(summary.timeBasis.mode, 'live');
      assert.equal(summary.timeBasis.observedAt, observedAt === undefined ? '2026-11-05T01:15:00.000Z' : warnings === null ? null : '2026-11-02T01:15:00.000Z');
    }
    const rows = await host(() => [OBJECTS.pods[0]]).get('resources', params);
    assert.equal(rows[0].age, '12d');
    assert.equal(rows[0].timeBasis.mode, 'live');
  } finally { Date.now = originalNow; }
});

test('explicit request reference agrees across fresh row sources without claiming historical observation (#35)', async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-11-05T01:15:00Z');
  try {
    const rawBefore = JSON.stringify(OBJECTS), calls = [];
    host((name, args) => {
      calls.push(name);
      if (name === 'kube.summary') return { observedAt: '2026-11-02T01:15:00Z', events: OBJECTS.events };
      return name === 'kube.get' ? OBJECTS.pods[0] : name === 'events.read' ? { items: OBJECTS.events } : OBJECTS[args.kind] || [];
    });
    const summary = await createDataSource().get('summary', params);
    const at = summary.timeBasis.referenceAt;
    for (const key of ['resources', 'events', 'resource']) {
      const value = await createDataSource().get(key, { ...params, at, kind: key === 'resources' ? 'events' : 'pods', name: undefined });
      const row = Array.isArray(value) ? value[0] : value;
      assert.equal(row.timeBasis.referenceAt, at);
      assert.equal(row.timeBasis.requestedAt, at);
      assert.equal(row.timeBasis.observedAt, '2026-11-05T01:15:00.000Z');
      assert.equal(row.timeBasis.reference, 'request-anchor');
      assert.equal(row.timeBasis.mode, 'live');
      if (key !== 'resource') assert.equal(row.last, '20s');
    }
    assert.ok((await createDataSource().get('kinds', { ...params, at })).length);
    assert.equal(calls.filter(name => name === 'kube.summary').length, 1);
    assert.equal(JSON.stringify(OBJECTS), rawBefore);
  } finally { Date.now = originalNow; }
});

test('request references reject invalid and future values including empty results (#35)', async () => {
  const ds = host(() => []);
  for (const cluster of [params.cluster]) for (const key of ['resources', 'events', 'resource', 'kinds']) {
    for (const at of ['', 'invalid', '2026-11-02', '2999-01-01T00:00:00Z']) {
      await assert.rejects(ds.get(key, { ...params, cluster, ns: 'empty', at }), RangeError);
    }
  }
});

test('request references reject impossible wall dates and strict clock boundaries before normalization (#35)', async () => {
  const ds = host(() => []);
  const invalid = ['2026-02-30T01:15:00Z', '2026-04-31T01:15:00+09:00', '2026-01-00T01:15:00Z', '2026-13-01T01:15:00Z', '2025-02-29T01:15:00Z', '1900-02-29T01:15:00Z', '2026-01-01T24:00:00Z', '2026-01-01T23:60:00Z', '2026-01-01T23:59:60Z', '2026-01-01T00:00:00+24:00', '2026-01-01T00:00:00-01:60', '2026-01-01T00:00:00.1234Z'];
  for (const cluster of [params.cluster]) for (const key of ['kinds', 'resources', 'resource', 'events']) {
    for (const at of invalid) await assert.rejects(ds.get(key, { ...params, cluster, ns: 'empty', at }), RangeError, `${cluster}/${key}/${at}`);
    await ds.get(key, { ...params, cluster, name: key === 'events' ? undefined : params.name, at: '2000-02-29T00:00:00Z' });
  }
});

test('request references keep valid leap dates and offset day crossings across row queries (#35)', async () => {
  const calls = [];
  const ds = host((name, args) => { calls.push(name); return name === 'kube.get' ? OBJECTS.pods[0] : name === 'events.read' ? { items: OBJECTS.events } : OBJECTS[args.kind] || []; });
  const valid = [
    ['2000-02-29T00:00:00Z', '2000-02-29T00:00:00.000Z'],
    ['2024-02-29T00:15:00+09:00', '2024-02-28T15:15:00.000Z'],
    ['2024-02-29T23:15:00-03:00', '2024-03-01T02:15:00.000Z'],
    ['2026-01-01T00:15:00.123+09:00', '2025-12-31T15:15:00.123Z'],
    ['2025-12-31T23:15:00-09:00', '2026-01-01T08:15:00.000Z'],
    ['0000-02-29T00:00:00Z', '0000-02-29T00:00:00.000Z'],
  ];
  for (const cluster of [params.cluster]) for (const key of ['kinds', 'resources', 'resource', 'events']) for (const [at, expected] of valid) {
    const value = await ds.get(key, { ...params, cluster, ns: '_all', name: key === 'events' ? undefined : OBJECTS.pods[0].metadata.name, at });
    if (key === 'kinds') { assert.ok(value.length); continue; }
    const row = Array.isArray(value) ? value[0] : value;
    assert.equal(row.timeBasis.requestedAt, at);
    assert.equal(row.timeBasis.referenceAt, expected);
    assert.equal(row.timeBasis.mode, 'live');
  }
  assert.equal(calls.includes('kube.summary'), false);
});

test('live target changes and stale list completions cannot replace another request reference (#35)', async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-11-05T01:15:00Z');
  try {
    let release, calls = 0;
    const old = new Promise(resolve => { release = resolve; });
    globalThis.kitService = { call: async (name, args) => {
      if (name === 'kube.read') return { contexts: [{ id: 'a' }, { id: 'b' }] };
      if (name === 'kube.summary') throw new Error('unexpected summary');
      if (args.id === 'a' && ++calls === 1) return old;
      return OBJECTS.events;
    } };
    const ds = createDataSource(), p = { kind: 'events', ns: '_all' };
    const stale = ds.get('resources', { ...p, cluster: 'a', at: '2026-11-02T01:15:00Z' });
    await new Promise(resolve => setImmediate(resolve));
    const b = await ds.get('resources', { ...p, cluster: 'b', at: '2026-11-04T01:15:00Z' });
    /* the same list in flight is shared (H-009): the newer request waits for that answer and still keeps its own reference */
    const pending = ds.get('resources', { ...p, cluster: 'a' });
    release(OBJECTS.events);
    const fresh = await pending;
    assert.equal((await stale)[0].last, '20s');
    assert.equal(b[0].timeBasis.referenceAt, '2026-11-04T01:15:00.000Z');
    assert.equal(fresh[0].timeBasis.reference, 'client-received');
    assert.equal((await ds.get('resources', { ...p, cluster: 'a' }))[0].last, '3d');
  } finally { Date.now = originalNow; }
});

for (const at of [undefined, '2026-11-02T01:15:00Z']) for (const mode of ['ok', '403', 'timeout', 'delay', 'stall', 'partial']) {
  test(`row reads remain independent of summary ${mode}, reference ${at ?? 'missing'} (#35)`, async () => {
    const calls = [];
    const ds = host((name, args) => {
      calls.push(name);
      if (name === 'kube.summary') {
        if (mode === '403') throw Object.assign(new Error('fixture summary forbidden'), { status: 403 });
        if (mode === 'timeout') throw Object.assign(new Error('fixture timeout'), { code: 'ETIMEDOUT' });
        if (mode === 'stall' || mode === 'delay') return new Promise(() => {});
        return mode === 'partial' ? { events: null } : {};
      }
      return name === 'kube.get' ? OBJECTS.pods[0] : name === 'events.read' ? { items: OBJECTS.events } : OBJECTS[args.kind] || [];
    });
    for (const key of ['kinds', 'resources', 'resource', 'events']) {
      calls.length = 0;
      await ds.get(key, { ...params, at, name: key === 'events' ? undefined : params.name });
      assert.equal(calls.includes('kube.summary'), false);
      /* Secret은 묻지 않는다(D-01) */
      assert.equal(calls.length, key === 'kinds' ? KIND_LIST.filter(k => k.plural !== 'events' && k.plural !== 'secrets').length : 1);
    }
  });
}

test('summary failure stays a failure and a later summary can recover (#35)', async () => {
  const error = Object.assign(new Error('fixture summary forbidden'), { status: 403 });
  let failed = true;
  const ds = host(() => { if (failed) throw error; return {}; });
  await assert.rejects(ds.get('summary', params), e => e === error);
  failed = false;
  assert.equal((await ds.get('summary', params)).timeBasis.reference, 'client-received');
});

test('helm_and_git_account_keys_no_screen_reads_are_gone_and_unknown_keys_never_call_a_service', async () => {
  globalThis.kitService = { call: () => { throw new Error('must not call a service for an unknown key'); } };
  const source = createDataSource();
  for (const key of ['helm', 'gitAccounts', 'unknown-key']) await assert.rejects(source.get(key, { cluster: params.cluster }), /unknown data key/, key);
  assert.equal(source.now, undefined);
  assert.equal(source.sample, undefined);
});
test('definitions read without a cluster or a service host', async () => {
  const source = createDataSource();
  assert.equal((await source.get('kind', { kind: 'pods' })).kind, 'Pod');
  assert.ok((await source.get('kinds')).flatMap(g => g.items).some(k => k.plural === 'deployments'));
  assert.ok((await source.get('toolKinds')).some(k => k.id === 'prometheus'));
});
test('kinds_keep_successful_counts_and_each_denied_kind_without_zero_fallback', async () => {
  const denied = Object.assign(new Error('denied'), { status: 403 });
  const source = host((name, args) => { if (name === 'kube.list' && args.kind === 'services') throw denied; return args.kind === 'pods' ? [OBJECTS.pods[0]] : []; });
  const items = (await source.get('kinds', params)).flatMap(group => group.items);
  assert.equal(items.find(item => item.plural === 'pods').count, 1);
  const service = items.find(item => item.plural === 'services');
  assert.equal(service.readStatus, 'forbidden'); assert.equal(service.count, undefined); assert.equal(service.error, denied);
});
test('kinds_count_each_kind_per_namespace_from_the_same_lists', async () => {
  /* the scope pickers' counts: the lists the kinds key already reads, counted by namespace (no second read) */
  const pod = (name, namespace) => ({ ...OBJECTS.pods[0], metadata: { ...OBJECTS.pods[0].metadata, name, namespace, uid: name } });
  let lists = 0;
  const source = host((name, args) => { if (name === 'kube.list') lists++; return args.kind === 'pods' ? [pod('a', 'payments'), pod('b', 'payments'), pod('c', 'shop')] : []; });
  const items = (await source.get('kinds', params)).flatMap(group => group.items);
  assert.deepEqual(items.find(item => item.plural === 'pods').byNs, { payments: 2, shop: 1 });
  assert.deepEqual(items.find(item => item.plural === 'deployments').byNs, {});
  assert.ok(lists <= items.length, 'no more than one list read a kind');
});


test('gitops_native_result_preserves_absent_diff_and_metadata', async () => {
  const raw = { repos: [], access: 'partial', controllers: { test: [{ kind: 'argocd', access: 'forbidden' }] } };
  const ds = host(() => raw);
  assert.deepEqual(await ds.get('gitops', params), raw);
});


test('gitops_contract_keeps_per_application_identity_nullable_times_and_flux_revision', () => {
  const source = { clusterId: 'context', namespace: 'custom', name: 'app', uid: 'uid', resourceVersion: '7' };
  const base = { cluster: 'context', name: 'app', ns: 'destination', sync: 'Synced', health: null, sourceIdentity: source, observedAt: null, reconciledAt: null, receivedAt: 'real-get-time', diffState: 'not_queried', diffFiles: null };
  const result = contract([{ id: 'r', name: 'repo', commit: 'group-commit', apps: [{ ...base, revision: 'one' }, { ...base, name: 'second', controller: 'flux', revision: 'exact-applied', targetRevision: null }, { ...base, name: 'missing', revision: null }] }, { id: 'multi', multiSource: true, name: '', branch: '', apps: [{ ...base, name: 'multi', multiSource: true, revision: null, targetRevision: null }] }]);
  assert.deepEqual(result.applications.map(a => a.revision), ['one', 'exact-applied', null, null]);
  assert.equal(result.applications[0].sourceIdentity.namespace, 'custom');
  assert.equal(result.applications[0].binding.namespace, 'destination');
  for (const a of result.applications) {
    assert.equal(a.health, null); assert.equal(a.observedAt, null); assert.equal(a.reconciledAt, null);
    assert.equal(a.receivedAt, 'real-get-time'); assert.equal(a.diffFiles, null); assert.equal(a.diffState, 'not_queried');
  }
  assert.equal(result.repositories[1].provider, null); assert.equal(result.repositories[1].default_branch, null);
  assert.notEqual(applicationIdentity(result.applications[0]), applicationIdentity({ ...result.applications[0], sourceIdentity: { ...source, uid: 'replacement' } }));
});

function pollingHarness(read, options = {}) {
  const timers = new Map(), values = [], errors = []; let next = 0, target = { context: 'one', uid: 'uid', window: null };
  const poll = createGitopsPolling({ read, identity: () => target, accept: value => values.push(value), onError: error => errors.push(error),
    setTimer: (callback, delay) => { assert.equal(delay, 15000); timers.set(++next, callback); return next; }, clearTimer: id => timers.delete(id), ...options });
  return { poll, timers, values, errors, select: value => { target = value; poll.invalidate(); }, async fire() { const [id, callback] = timers.entries().next().value || []; assert.ok(callback); timers.delete(id); callback(); await new Promise(resolve => setImmediate(resolve)); } };
}

test('gitops_polling_settle_15s_no_overlap_manual_shares_pending_and_success_recovers', async () => {
  let release, calls = 0;
  const h = pollingHarness(() => { calls++; return new Promise(resolve => { release = resolve; }); });
  h.poll.setActive(true);
  const initial = h.poll.read(); await Promise.resolve();
  assert.equal(calls, 1); assert.equal(h.timers.size, 0);
  const manual = h.poll.refresh(); await Promise.resolve(); assert.equal(calls, 1);
  release({ access: 'ok', revision: 'one' }); await Promise.all([initial, manual]);
  assert.equal(h.values.length, 1); assert.equal(h.timers.size, 1);
  const refresh = h.poll.refresh(); await Promise.resolve(); assert.equal(calls, 2); assert.equal(h.timers.size, 0);
  release({ access: 'ok', revision: 'two' }); await refresh; assert.equal(h.values.at(-1).revision, 'two');
  h.poll.dispose(); assert.equal(h.timers.size, 0);
});

test('gitops_polling_resume_reads_a_stale_snapshot_once_and_waits_a_period_for_a_fresh_one', async () => {
  let calls = 0, stale = true;
  const h = pollingHarness(() => { calls++; return Promise.resolve({ access: 'ok' }); }, { resumeNow: () => stale });
  h.poll.setActive(true); await h.poll.read(); assert.equal(calls, 1); assert.equal(h.timers.size, 1);
  h.poll.setVisible(false); assert.equal(h.timers.size, 0);
  h.poll.setVisible(true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2, 'a stale snapshot is read again on return, not after another period'); assert.equal(h.timers.size, 1);
  stale = false; h.poll.setVisible(false); h.poll.setVisible(true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2, 'a fresh snapshot keeps the normal period'); assert.equal(h.timers.size, 1);
  stale = true; h.poll.setActive(false); h.poll.setActive(true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 3, 'tab re-entry follows the same rule');
  h.poll.dispose();
});

test('gitops_polling_resume_never_overrides_a_blocked_or_failed_poll', async () => {
  let calls = 0;
  const h = pollingHarness(() => { calls++; return Promise.reject(Object.assign(new Error('denied'), { status: 403 })); }, { resumeNow: () => true });
  h.poll.setActive(true); await h.poll.read().catch(() => {}); assert.equal(calls, 1);
  h.poll.setVisible(false); h.poll.setVisible(true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1, 'permission denial stays blocked until a manual retry'); assert.equal(h.timers.size, 0);
  h.poll.dispose();
});

test('gitops_polling_accepts_current_read_while_hidden_and_pauses_periodic_reads', async () => {
  let release;
  const h = pollingHarness(() => new Promise(resolve => { release = resolve; }));
  h.poll.setActive(true);
  const initial = h.poll.read();
  await Promise.resolve();
  h.poll.setVisible(false);
  release({ access: 'ok', revision: 'one' });
  await initial;
  assert.equal(h.values[0]?.revision, 'one');
  assert.equal(h.timers.size, 0);
  h.poll.setVisible(true);
  assert.equal(h.timers.size, 1);
  h.poll.dispose();
});

test('gitops_polling_allows_two_retries_then_stops_and_manual_reset_recovers', async () => {
  let calls = 0, fail = true;
  const h = pollingHarness(() => { calls++; if (fail) throw Object.assign(new Error('offline'), { kind: 'unreachable', code: 'GITOPS_READ_FAILED' }); return { access: 'ok' }; });
  h.poll.setActive(true); await assert.rejects(h.poll.read(), /offline/);
  await h.fire(); await h.fire();
  assert.equal(calls, 3); assert.equal(h.errors.length, 3); assert.equal(h.timers.size, 0);
  fail = false; await h.poll.refresh(); assert.equal(h.values.length, 1); assert.equal(h.timers.size, 1);
  fail = true; await h.fire(); assert.equal(h.timers.size, 1);
  h.poll.dispose();
});

for (const mode of ['reject403', 'forbidden', 'partial403']) test(`gitops_polling_${mode}_stops_until_manual_reset`, async () => {
  let calls = 0;
  const h = pollingHarness(() => { calls++; if (mode === 'reject403') throw Object.assign(new Error('denied'), { status: 403 }); return { access: mode === 'forbidden' ? 'forbidden' : 'partial', controllers: { one: [{ access: 'forbidden' }] } }; });
  h.poll.setActive(true); await h.poll.read().catch(() => {});
  assert.equal(calls, 1); assert.equal(h.timers.size, 0);
  h.poll.setActive(false); h.poll.setActive(true); assert.equal(h.timers.size, 0);
  await h.poll.refresh().catch(() => {}); assert.equal(calls, 2); assert.equal(h.timers.size, 0); h.poll.dispose();
});

for (const change of ['context', 'uid', 'window', 'exit', 'dispose']) test(`gitops_polling_${change}_discards_late_completion_without_overlap`, async () => {
  let release, calls = 0;
  const h = pollingHarness(() => { calls++; return calls === 1 ? new Promise(resolve => { release = resolve; }) : { access: 'ok', revision: 'new' }; });
  h.poll.setActive(true); const old = h.poll.read(); await Promise.resolve();
  if (change === 'exit') h.poll.setActive(false);
  else if (change === 'dispose') h.poll.dispose();
  else h.select({ context: change === 'context' ? 'two' : 'one', uid: change === 'uid' ? 'new-uid' : 'uid', window: change === 'window' ? 'new-window' : null });
  const overlapping = h.poll.read(); await Promise.resolve(); assert.equal(calls, 1);
  release({ access: 'ok', revision: 'old' }); await Promise.all([old, overlapping]);
  assert.equal(h.values.length, 0);
  if (!['exit', 'dispose'].includes(change)) { await h.fire(); assert.equal(h.values[0].revision, 'new'); }
  else assert.equal(h.timers.size, 0);
  h.poll.dispose();
});

test('gitops_independent_documents_complete_in_reverse_order_without_invalidating_each_other', async () => {
  let release;
  const old = pollingHarness(() => new Promise(resolve => { release = resolve; }));
  const fresh = pollingHarness(() => ({ access: 'ok', receivedAt: 'fresh-time' }));
  const pending = old.poll.read(); await Promise.resolve(); await fresh.poll.read();
  release({ access: 'ok', receivedAt: 'old-time' }); await pending;
  assert.equal(fresh.values[0].receivedAt, 'fresh-time'); assert.equal(old.values[0].receivedAt, 'old-time');
  old.poll.dispose(); fresh.poll.dispose();
});


test('gitops_read_deadline_exposes_failure_without_overlapping_or_accepting_late_native_result', async () => {
  const timers = new Map(), values = [], errors = []; let release, calls = 0, n = 0;
  const poll = createGitopsPolling({ read: () => { calls++; return new Promise(resolve => { release = resolve; }); }, identity: () => 'same', accept: v => values.push(v), onError: e => errors.push(e), timeoutMs: 10000,
    setTimer: (fn, ms) => { timers.set(++n, { fn, ms }); return n; }, clearTimer: id => timers.delete(id) });
  poll.setActive(true); const response = poll.read(); await Promise.resolve();
  const deadline = [...timers.values()].find(t => t.ms === 10000); deadline.fn();
  await assert.rejects(response, e => e.kind === 'timeout'); assert.equal(errors.length, 1);
  const pending = poll.refresh(); await Promise.resolve(); assert.equal(calls, 1);
  release({ access: 'ok', receivedAt: 'late' }); await pending;
  assert.equal(values.length, 0); assert.ok([...timers.values()].some(t => t.ms === 15000));
  poll.dispose(); assert.equal(timers.size, 0);
});

test('gitops_partial_without_complete_failure_classification_stops_without_discarding_usable_snapshots', async () => {
  const h = pollingHarness(() => ({ access: 'partial', repos: ['usable'], controllers: { one: [{ access: 'error' }] } }));
  h.poll.setActive(true); await h.poll.read();
  assert.equal(h.values.length, 1); assert.equal(h.timers.size, 0); assert.deepEqual(h.values.at(-1).repos, ['usable']); h.poll.dispose();
});


test('gitops_empty_scalar_metadata_stays_null_without_group_or_clock_fallback', () => {
  const [app] = contract([{ id: 'repo', commit: 'group', apps: [{ cluster: 'one', name: 'app', health: '', revision: '', targetRevision: '', observedAt: '', reconciledAt: '', receivedAt: '' }] }]).applications;
  for (const key of ['health', 'revision', 'targetRevision', 'observedAt', 'reconciledAt', 'receivedAt']) assert.equal(app[key], null);
});


test('gitops_unclassified_rejection_is_visible_but_not_automatically_retried', async () => {
  const h = pollingHarness(() => { throw new Error('unclassified'); });
  h.poll.setActive(true); await assert.rejects(h.poll.read(), /unclassified/);
  assert.equal(h.errors.length, 1); assert.equal(h.timers.size, 0); h.poll.dispose();
});


for (const message of ['GitOps API request failed', "Error invoking remote method 'kit:service:call': Error: GitOps API request failed"]) {
  test(`gitops_message_only_ipc_rejection_retries_twice_and_manual_recovery_${message}`, async () => {
    let calls = 0, fail = true;
    const rejection = new Error(message);
    assert.deepEqual(Object.keys(rejection), []);
    assert.equal(rejection.kind, undefined); assert.equal(rejection.code, undefined);
    const source = host(() => { calls++; if (fail) throw rejection; return { repos: [], controllers: {}, access: 'ok' }; });
    const h = pollingHarness(() => source.get('gitops', params));
    h.poll.setActive(true); await assert.rejects(h.poll.read(), error => error === rejection);
    await h.fire(); await h.fire();
    assert.equal(calls, 3); assert.equal(h.errors.length, 3); assert.equal(h.timers.size, 0);
    assert.ok(h.errors.every(error => error === rejection));
    fail = false; await h.poll.refresh();
    assert.equal(calls, 4); assert.deepEqual(h.values, [{ repos: [], controllers: {}, access: 'ok' }]);
    assert.equal(h.timers.size, 1); h.poll.dispose();
  });
}

for (const message of [
  'kubernetes API request failed: HTTP 403', 'HTTP 500', 'forbidden', 'no service host',
  'GitOps API request failed: HTTP 500', ' GitOps API request failed', 'GitOps API request failed\n',
  'gitops api request failed', 'Error: GitOps API request failed',
  "Error invoking remote method 'other:call': Error: GitOps API request failed",
  "Error invoking remote method 'kit:service:call': Error: forbidden",
  "Error invoking remote method 'kit:service:call': Error: GitOps API request failed extra",
]) test(`gitops_message_only_unapproved_rejection_stops_${JSON.stringify(message)}`, async () => {
  let calls = 0; const rejection = new Error(message);
  const source = host(() => { calls++; throw rejection; });
  const h = pollingHarness(() => source.get('gitops', params));
  h.poll.setActive(true); await assert.rejects(h.poll.read(), error => error === rejection);
  assert.equal(calls, 1); assert.equal(h.timers.size, 0); assert.deepEqual(h.errors, [rejection]);
  assert.deepEqual(h.values, []); h.poll.dispose();
});


test('real cluster metadata is optional, context-bound and never fans out reads for unrelated resources', async () => {
  const calls = [], c = { id: params.cluster, ctx: params.cluster, provider: 'gke', server: 'https://gke-real.example.goog' };
  let catalogFails = false;
  globalThis.kitService = { call: async (name, args) => {
    calls.push([name, args]);
    if (name === 'kube.read') return { contexts: [c] };
    if (name === 'kube.probe') { await new Promise(resolve => setImmediate(resolve)); return { state: 'forbidden', version: 'v1.36.4' }; }
    if (name === 'observability.catalog') { if (catalogFails) throw Object.assign(new Error('catalog denied'), { status: 403 }); return { status: 'ok', connections: [{ status: 'configured', identity: { cluster: c.id, clusterName: 'wake-credit-check', projectId: 'project-a', location: 'region-a', source: 'observability-connections.v1' } }] }; }
    if (name === 'kube.list') return [];
    throw new Error(name);
  } };
  const ds = createDataSource(), result = await ds.get('cluster', { cluster: c.id });
  assert.equal(result.presentation.clusterName, 'wake-credit-check'); assert.equal(result.server, c.server);
  assert.equal(result.id, c.id); assert.equal(result.ctx, c.ctx); assert.equal(result.state, 'warn');
  assert.deepEqual(calls.map(([name]) => name), ['kube.read', 'kube.probe', 'observability.catalog']);
  calls.length = 0;
  assert.deepEqual(await ds.get('resources', params), []);
  assert.deepEqual(calls.map(([name]) => name), ['kube.read', 'kube.list']);
  catalogFails = true;
  const failed = await ds.get('cluster', { cluster: c.id });
  assert.equal(failed.presentation, null); assert.equal(failed.state, 'warn'); assert.equal(failed.server, c.server);
});


test('unsettled optional catalog does not delay cluster success or mask kube denial', async t => {
  let expire;
  t.mock.method(globalThis, 'setTimeout', fn => { expire = fn; return 1; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  globalThis.kitService = { call: async name => {
    if (name === 'kube.read') return { contexts: [{ id: params.cluster, server: 'https://gke-real.example.goog' }] };
    if (name === 'kube.probe') return { state: 'ok', version: 'v1.36.4' };
    if (name === 'observability.catalog') return new Promise(() => {});
    throw new Error(name);
  } };
  const result = await createDataSource().get('cluster', { cluster: params.cluster });
  assert.equal(result.state, 'ok'); assert.equal(result.presentation, null);
  expire(); await new Promise(resolve => setImmediate(resolve));
});

test('tool descriptor keeps verified ports and missing observer ports without rendering undefined', async () => {
  const cluster = 'tool-port-contract';
  const rows = [{ kind: 'grafana', ns: 'observability', svc: 'wake-grafana', port: 80, ready: 1, ui: true },
    { kind: 'prometheus', ns: 'observability', svc: 'wake-prometheus', ready: 0, ui: true }];
  globalThis.kitService = { call: async name => name === 'kube.read' ? { contexts: [{ id: cluster }] } : { list: rows, access: 'partial' } };
  const ds = createDataSource('live'), result = await ds.get('clusterTools', { cluster });
  assert.equal(result[0].svc, 'observability/wake-grafana:80');
  assert.equal(result[1].svc, 'observability/wake-prometheus');
  assert.deepEqual(result[1].raw, rows[1]);
  assert.equal(JSON.stringify(result).includes('undefined'), false);
  assert.equal((await ds.get('toolAccess', { cluster })).access, 'partial');
});

test('scoped events keep the newest UID observation and expose incomplete snapshots', async () => {
  const subject = { uid: 'original', kind: 'Pod', name: params.name, ns: params.ns, apiVersion: 'v1' };
  const involvedObject = { uid: subject.uid, kind: subject.kind, name: subject.name, namespace: subject.ns, apiVersion: subject.apiVersion };
  const base = { metadata: { uid: 'event-uid', namespace: params.ns, name: 'backoff.1' }, involvedObject, reason: 'BackOff', type: 'Warning' };
  const ds = host((name, input) => {
    assert.equal(name, 'events.read');
    assert.equal(input.subjectUid, subject.uid);
    return { partial: true, items: [
      { ...base, series: { count: 4, lastObservedTime: '2026-11-05T00:01:00Z' } },
      { ...base, series: { count: 2, lastObservedTime: '2026-11-05T00:00:00Z' } },
      { ...base, metadata: { ...base.metadata, uid: 'foreign-event' }, involvedObject: { ...involvedObject, uid: 'replacement' } },
    ] };
  });
  const rows = await ds.get('events', { ...params, subject });
  assert.equal(rows.partial, true);
  assert.deepEqual(rows.map(row => [row.uid, row.object.uid, row.count, row.at]), [['event-uid', subject.uid, 4, '2026-11-05T00:01:00Z']]);
});

/* H-009 갱신 경로 부하: 한 번의 갱신에서 같은 목록(종류 수와 그 종류의 행, 이벤트 화면의 변경 표시)을 겹쳐 읽으면 한 요청을 같이 쓴다 */
test('refresh_tick_shares_one_read_per_list_while_it_is_in_flight', async () => {
  const counts = {};
  let release;
  const gate = new Promise(r => { release = r; });
  const ds = host(async (name, args) => { const k = `${name}:${args.kind ?? ''}`; counts[k] = (counts[k] ?? 0) + 1; await gate; return []; });
  const reads = [ds.get('kinds', { cluster: params.cluster, ns: '_all' }), ...['deployments', 'statefulsets', 'daemonsets', 'configmaps', 'deployments'].map(kind => ds.get('resources', { cluster: params.cluster, ns: '_all', kind }))];
  await new Promise(r => setImmediate(r));
  release();
  await Promise.all(reads);
  for (const kind of ['deployments', 'statefulsets', 'daemonsets', 'configmaps', 'pods']) assert.equal(counts[`kube.list:${kind}`], 1, kind);
  await ds.get('resources', { cluster: params.cluster, ns: '_all', kind: 'pods' });
  assert.equal(counts['kube.list:pods'], 2, 'a settled list is read again on the next tick');
});

/* 갱신 경로 2차: 목록은 메인 프로세스 공유 watch를 구독하고, 처음 한 번 전체 뒤로는 밀려온 차이만 반영한다(kube.list를 다시 부르지 않음) */
/* kit의 onService는 문서마다 한 번 다리에 붙으므로(실제 앱도 한 문서 = 한 다리) 시험들이 같은 듣는 목록을 쓴다 */
const pushListeners = [];
function watchHost(answer = () => []) {
  const calls = [], listeners = pushListeners, doc = { hidden: false, handlers: {}, addEventListener(type, f) { (this.handlers[type] ??= []).push(f); }, removeEventListener() {} };
  globalThis.document = doc;
  globalThis.kitService = { call: (name, args) => { calls.push([name, args]); return Promise.resolve().then(() => name === 'kube.read' ? { contexts: [{ id: params.cluster }] } : answer(name, args)); },
    on: cb => { listeners.push(cb); } };
  const push = (event, payload) => { for (const f of listeners) f(event, payload); };
  const setHidden = hidden => { doc.hidden = hidden; for (const f of doc.handlers.visibilitychange ?? []) f(); };
  return { ds: createDataSource(), calls, push, setHidden, count: name => calls.filter(c => c[0] === name).length };
}
const POD2 = { ...POD, metadata: { ...POD.metadata, name: 'fixture-pod-2', uid: 'uid-fixture-pod-2' } };
const tick = () => new Promise(r => setImmediate(r));
afterEach(() => { delete globalThis.document; });

test('lists_subscribe_once_to_the_shared_watch_and_apply_pushed_diffs_without_listing_again', async () => {
  const h = watchHost((name, args) => (name === 'kube.watch' && args.op === 'open' ? { sub: args.sub, items: [POD], seq: 0, state: { state: 'ready', source: 'watch' } } : []));
  assert.deepEqual((await h.ds.get('resources', { cluster: params.cluster, ns: '_all', kind: 'pods' })).map(r => r.name), ['fixture-pod']);
  const sub = h.calls.find(c => c[0] === 'kube.watch')[1].sub;
  h.push('kube-watch', { sub, seq: 1, changes: [{ t: 'u', k: 'payments/fixture-pod-2', o: POD2 }], state: { state: 'ready', source: 'watch' } });
  assert.deepEqual((await h.ds.get('resources', { cluster: params.cluster, ns: '_all', kind: 'pods' })).map(r => r.name).sort(), ['fixture-pod', 'fixture-pod-2']);
  h.push('kube-watch', { sub, seq: 2, changes: [{ t: 'd', k: 'payments/fixture-pod' }] });
  assert.deepEqual((await h.ds.get('resources', { cluster: params.cluster, ns: '_all', kind: 'pods' })).map(r => r.name), ['fixture-pod-2']);
  assert.equal(h.count('kube.watch'), 1);
  assert.equal(h.count('kube.list'), 0, 'no list call after the subscription');
});

test('a_pushed_batch_reads_the_following_page_once_and_a_hidden_document_closes_its_subscriptions', async () => {
  const h = watchHost((name, args) => (name === 'kube.watch' && args.op === 'open' ? { sub: args.sub, items: [POD], seq: 0, state: { state: 'ready', source: 'watch' } } : { closed: true }));
  await h.ds.get('resources', { cluster: params.cluster, ns: '_all', kind: 'pods' });
  const sub = h.calls.find(c => c[0] === 'kube.watch')[1].sub;
  let reads = 0;
  const feed = h.ds.follow({ cluster: params.cluster, read: async () => { reads++; } });
  feed.start();
  for (let i = 1; i <= 3; i++) h.push('kube-watch', { sub, seq: i, changes: [{ t: 'u', k: 'payments/x' + i, o: { ...POD, metadata: { ...POD.metadata, name: 'x' + i } } }] });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(reads, 1, 'three pushed batches in one task are one page read');
  h.setHidden(true);
  await tick();
  assert.ok(h.calls.some(([name, args]) => name === 'kube.watch' && args.op === 'close' && args.sub === sub), 'a hidden document closes its subscription');
  feed.stop();
});

test('a_host_without_the_watch_service_still_reads_lists', async () => {
  const h = watchHost(name => (name === 'kube.list' ? [POD] : undefined));
  assert.equal((await h.ds.get('resources', { cluster: params.cluster, ns: '_all', kind: 'pods' })).length, 1);
  assert.equal((await h.ds.get('resources', { cluster: params.cluster, ns: '_all', kind: 'pods' })).length, 1);
  assert.equal(h.count('kube.watch'), 1, 'the watch is tried once per document');
  assert.equal(h.count('kube.list'), 2);
});

test('the_cluster_context_is_read_once_until_the_kubeconfig_changes', async () => {
  const h = watchHost(name => (name === 'kube.list' ? [] : undefined));
  for (let i = 0; i < 4; i++) await h.ds.get('resources', { cluster: params.cluster, ns: '_all', kind: 'pods' });
  assert.equal(h.count('kube.read'), 1);
  h.push('kube-changed', {});
  await h.ds.get('resources', { cluster: params.cluster, ns: '_all', kind: 'pods' });
  assert.equal(h.count('kube.read'), 2);
});

test('log_follow_reads_only_the_lines_after_the_last_one_it_has', async () => {
  const line = s => `2026-11-02T01:${String(s).padStart(2, '0')}:00.000000000Z line ${s}`;
  const answers = [{ text: [line(1), line(2)].join('\n'), partial: false }, { text: [line(2), line(3)].join('\n'), partial: false }];
  const h = watchHost(name => (name === 'kube.logs' ? answers.shift() : undefined));
  const base = { cluster: params.cluster, ns: 'payments', pod: 'fixture-pod', container: 'app', uid: 'uid-fixture-pod', tail: 500, previous: false, source: 'kubernetes' };
  const first = await h.ds.get('logs', { ...base, window: { fromMs: AT - 3600e3, toMs: AT } });
  assert.equal(first.text.split('\n').length, 2);
  const next = await h.ds.get('logs', { ...base, window: { fromMs: AT - 3600e3 + 3000, toMs: AT + 3000 } });
  const asked = h.calls.filter(c => c[0] === 'kube.logs')[1][1].window;
  assert.equal(asked.fromMs, Date.parse('2026-11-02T01:02:00Z'), 'the follow read starts at the last line it already has');
  assert.deepEqual(next.text.split('\n'), [line(1), line(2), line(3)]);
});

test('log_follow_keeps_the_line_limit_the_first_read_reached_before_its_window_filter', async () => {
  /* R5-02: 첫 읽기가 상한에 닿았다고 하면(limitReached) 따라가기로 붙인 결과도 그것을 말한다 */
  const line = s => `2026-11-02T01:${String(s).padStart(2, '0')}:00.000000000Z line ${s}`;
  const answers = [{ text: [line(1), line(2)].join('\n'), partial: true, limitReached: true }, { text: line(3), partial: false, limitReached: false }];
  const h = watchHost(name => (name === 'kube.logs' ? answers.shift() : undefined));
  const base = { cluster: params.cluster, ns: 'payments', pod: 'fixture-pod', container: 'app', uid: 'uid-fixture-pod', tail: 500, previous: false, source: 'kubernetes' };
  assert.equal((await h.ds.get('logs', { ...base, window: { fromMs: AT - 3600e3, toMs: AT } })).limitReached, true);
  assert.equal((await h.ds.get('logs', { ...base, window: { fromMs: AT - 3600e3 + 3000, toMs: AT + 3000 } })).limitReached, true);
});

test('a_resource_detail_reads_its_object_from_the_shared_watch_of_its_kind_and_a_push_is_seen_without_a_get', async () => {
  const h = watchHost((name, args) => (name === 'kube.watch' && args.op === 'open' ? { sub: args.sub, items: [POD], seq: 0, state: { state: 'ready', source: 'watch' } } : name === 'kube.get' ? POD : undefined));
  const one = () => h.ds.get('resource', { cluster: params.cluster, ns: 'payments', kind: 'pods', name: 'fixture-pod' });
  assert.equal((await one()).raw.metadata.name, 'fixture-pod');
  const sub = h.calls.find(c => c[0] === 'kube.watch')[1].sub;
  h.push('kube-watch', { sub, seq: 1, changes: [{ t: 'u', k: 'payments/fixture-pod', o: { ...POD, metadata: { ...POD.metadata, labels: { changed: 'yes' } } } }] });
  assert.equal((await one()).raw.metadata.labels.changed, 'yes', 'the pushed change is what the detail reads');
  h.push('kube-watch', { sub, seq: 2, changes: [{ t: 'd', k: 'payments/fixture-pod' }] });
  assert.equal((await one()).missing, true, 'a deleted object reads as missing');
  assert.equal(h.count('kube.get'), 0, 'no per-object GET while the watch is live');
  assert.equal(h.count('kube.watch'), 1);
  /* the YAML with managedFields is not in the watch cache: that one read still goes to the API */
  await h.ds.get('yaml', { cluster: params.cluster, ns: 'payments', kind: 'pods', name: 'fixture-pod', managedFields: true }).catch(() => {});
  assert.equal(h.count('kube.get'), 1);
});

test('a_detail_yaml_read_from_the_watch_starts_with_apiVersion_and_kind_like_kubectl_get_o_yaml', async () => {
  /* a watch list item has no apiVersion or kind of its own: the list's kind gives them back */
  const { apiVersion, kind, ...bare } = POD;
  const h = watchHost((name, args) => (name === 'kube.watch' && args.op === 'open' ? { sub: args.sub, items: [bare], seq: 0, state: { state: 'ready', source: 'watch' } } : undefined));
  const text = await h.ds.get('yaml', { cluster: params.cluster, ns: 'payments', kind: 'pods', name: 'fixture-pod' });
  assert.deepEqual(text.split('\n').slice(0, 3), ['apiVersion: v1', 'kind: Pod', 'metadata:']);
  const one = await h.ds.get('resource', { cluster: params.cluster, ns: 'payments', kind: 'pods', name: 'fixture-pod' });
  assert.deepEqual([one.raw.apiVersion, one.raw.kind], [apiVersion, kind]);
});
