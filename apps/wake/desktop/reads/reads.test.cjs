/* 허브 읽기 서비스(desktop/reads) 논리 검사. 자료는 이 파일 안의 합성 값뿐이다. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seriesQuery, rangeOf, usageRows, createMetrics, SERIES } = require('./metrics.cjs');
const { historyUpdates, createAlerts } = require('./alerts.cjs');
const { podServices, byService, createNetwork } = require('./network.cjs');
const { changedEvents, createEvents } = require('./events.cjs');
const { levelCounts, createLogLevels } = require('./log-levels.cjs');
const { createSourceStates, errorCode } = require('./source-checks.cjs');
const { createHubReads } = require('./index.cjs');

const memoryLog = () => { const rows = []; return { rows, append: row => { rows.push(structuredClone(row)); return row; }, list: (f = () => true) => rows.filter(f), prune: () => 0 }; };
const T0 = Date.parse('2026-11-15T00:00:00Z');

test('series definitions build PromQL from a name and Kubernetes-name labels only', () => {
  assert.match(seriesQuery('ingress.p95', { namespace: 'shop', ingress: 'web' }).query, /histogram_quantile\(0\.95, sum by \(le\) \(rate\(nginx_ingress_controller_request_duration_seconds_bucket\{namespace="shop",ingress="web"\}/);
  assert.equal(seriesQuery('pvc.used', { namespace: 'shop', persistentvolumeclaim: 'data-0' }).unit, '%');
  assert.throws(() => seriesQuery('sum(up)'), { kind: 'invalid_request' });
  assert.throws(() => seriesQuery('pod.cpu', { namespace: 'shop"}', pod: 'a' }), { kind: 'invalid_request' });
  assert.throws(() => seriesQuery('pod.cpu', { namespace: 'shop' }), { kind: 'invalid_request' });
  assert.throws(() => seriesQuery('cluster.cpu', { namespace: 'shop' }), { kind: 'invalid_request' });
  for (const [id, def] of Object.entries(SERIES)) {
    const target = Object.fromEntries((def.target ?? []).map(k => [k, k === 'workload' ? 'deployments' : 'a-1']));
    assert.doesNotThrow(() => seriesQuery(id, target), id);
  }
});

test('workload_series_sum_every_owned_pod_in_one_promql_through_kube_pod_owner_without_a_pod_list', () => {
  const dep = seriesQuery('workload.cpu', { namespace: 'shop', workload: 'deployments', name: 'web' });
  assert.equal(dep.unit, 'm');
  /* one series for the whole workload: the pod usage joined to its owner (Deployment -> ReplicaSet -> Pod), never a list of pod names */
  assert.match(dep.query, /^1000 \* sum\(sum by \(namespace, pod\) \(rate\(container_cpu_usage_seconds_total\{namespace="shop",container!=""\}\[5m\]\)\) \* on \(namespace, pod\) group_left\(\) /);
  assert.match(dep.query, /label_replace\(kube_pod_owner\{namespace="shop",owner_kind="ReplicaSet"\}, "replicaset", "\$1", "owner_name", "\(\.\*\)"\)/);
  assert.match(dep.query, /kube_replicaset_owner\{namespace="shop",owner_kind="Deployment",owner_name="web"\}/);
  assert.doesNotMatch(dep.query, /pod=~?"/);
  const sts = seriesQuery('workload.mem', { namespace: 'shop', workload: 'statefulsets', name: 'db' });
  assert.equal(sts.unit, 'bytes');
  assert.match(sts.query, /^sum\(sum by \(namespace, pod\) \(container_memory_working_set_bytes\{namespace="shop",container!=""\}\) \* on \(namespace, pod\) group_left\(\) max by \(namespace, pod\) \(kube_pod_owner\{namespace="shop",owner_kind="StatefulSet",owner_name="db"\}\)\) and on \(\) /);
  assert.match(seriesQuery('workload.cpu', { namespace: 'shop', workload: 'daemonsets', name: 'agent' }).query, /owner_kind="DaemonSet",owner_name="agent"/);
  for (const workload of ['pods', 'jobs', 'Deployment', 'deployments"}']) assert.throws(() => seriesQuery('workload.cpu', { namespace: 'shop', workload, name: 'web' }), { kind: 'invalid_request' }, workload);
});

/* A2-17: 한 시각에 도는 Pod 중 하나의 표본이 빠지면(컨테이너 재시작으로 시리즈가 바뀐 순간 등) 합이 반으로 떨어진 "가짜 하락"이 그려졌다(실제 wake-lab checkout-api 59→29→56Mi).
   합은 그 시각 Running인 소유 Pod가 모두 값을 낼 때만 두고, 아니면 그 점을 비운다(부분 합 대신 끊긴 선, RULE-CHART) */
test('workload_sum_leaves_a_step_empty_when_a_running_owned_pod_has_no_sample_instead_of_a_partial_sum', () => {
  for (const [series, workload, owner] of [['workload.mem', 'statefulsets', 'owner_kind="StatefulSet",owner_name="db"'], ['workload.cpu', 'deployments', 'owner_kind="Deployment",owner_name="db"']]) {
    const { query } = seriesQuery(series, { namespace: 'shop', workload, name: 'db' });
    const [sum, guard] = query.split(' and on () ');
    assert.ok(guard, `${series}: the sum is kept only under a completeness guard: ${query}`);
    assert.match(guard, /^\(count\(.+\) >= \(count\(.+kube_pod_status_phase\{namespace="shop",phase="Running"\} == 1.+\) or vector\(0\)\)\)$/, `${series}: the pods that answered are at least the running owned pods (none known: no guard)`);
    assert.ok(guard.includes(owner) && sum.includes(owner), `${series}: both sides count the same owner`);
  }
});

test('ranges use 15 second steps, at most 1000 points and at most 15 days', () => {
  assert.deepEqual(rangeOf(T0, T0 + 3600e3, 29), { from: T0 / 1000, to: T0 / 1000 + 3600, step: 30 });
  assert.equal(rangeOf(T0, T0 + 3600e3, 1).step, 15);
  assert.ok((86400 * 7) / rangeOf(T0, T0 + 7 * 86400e3, 15).step <= 1000);
  assert.throws(() => rangeOf(T0, T0 - 1, 15), { kind: 'invalid_request' });
  assert.throws(() => rangeOf(T0, T0 + 16 * 86400e3, 15), { kind: 'invalid_request' });
});

test('metrics.range returns the query, step, range and fetch time with the series', async () => {
  const calls = [];
  const metrics = createMetrics({ now: () => T0, prom: async (id, route, params) => { calls.push({ id, route, params }); return { result: [{ metric: {}, values: [[T0 / 1000, '1.5']] }] }; } });
  const r = await metrics.range({ id: 'c1', series: 'cluster.rps', from: T0 - 600e3, to: T0, step: 60 });
  assert.deepEqual(calls[0], { id: 'c1', route: '/api/v1/query_range', params: { query: 'sum(rate(nginx_ingress_controller_requests[5m]))', start: T0 / 1000 - 600, end: T0 / 1000, step: 60 } });
  assert.deepEqual({ ...r, result: r.result.length }, { series: 'cluster.rps', query: calls[0].params.query, unit: '/s', step: 60, range: { from: T0 - 600e3, to: T0 }, fetchedAt: T0, result: 1 });
});

test('usage rows: Pod values, Deployment sums through ReplicaSet owners, Node percent, PVC used', () => {
  const v = (metric, value) => ({ metric, value: [0, String(value)] });
  const vectors = {
    podCpu: [v({ namespace: 'a', pod: 'web-1-x' }, 3.4), v({ namespace: 'a', pod: 'web-1-y' }, 2.2), v({ namespace: 'a', pod: 'solo' }, 9)],
    podMem: [v({ namespace: 'a', pod: 'web-1-x' }, 1048576), v({ namespace: 'a', pod: 'web-1-y' }, 2097152)],
    podRestarts: [v({ namespace: 'a', pod: 'web-1-x' }, 1.9)],
    podOwner: [{ metric: { namespace: 'a', pod: 'web-1-x', owner_name: 'web-1' } }, { metric: { namespace: 'a', pod: 'web-1-y', owner_name: 'web-1' } }],
    rsOwner: [{ metric: { namespace: 'a', replicaset: 'web-1', owner_name: 'web' } }],
  };
  assert.deepEqual(usageRows('pods', vectors)['a/web-1-x'], { cpu: 3, memory: 1048576, restarts1h: 2 });
  assert.deepEqual(usageRows('deployments', vectors), { 'a/web': { cpu: 6, memory: 3145728, restarts1h: 2 } });
  assert.deepEqual(usageRows('nodes', { nodeCpu: [v({ nodename: 'n1' }, 10.4)], nodeMem: [v({ nodename: 'n1' }, 48.6)] }), { n1: { cpu: 10, memory: 49 } });
  assert.deepEqual(usageRows('persistentvolumeclaims', { pvcUsed: [v({ namespace: 'a', persistentvolumeclaim: 'd' }, 50)], pvcCapacity: [v({ namespace: 'a', persistentvolumeclaim: 'd' }, 200)] }), { 'a/d': { used: 50, usedPct: 25 } });
  assert.deepEqual(usageRows('pods', { podCpu: [v({ namespace: 'a', pod: 'p' }, 'NaN')] }), {});
});

test('alert history: new alerts are written, alerts gone from Alertmanager end at the last time they were seen', () => {
  const active = [{ fingerprint: 'f1', startsAt: '2026-11-15T00:00:00Z', labels: { alertname: 'A' }, receivers: [{ name: 'r' }], status: { state: 'active' } },
    { fingerprint: 'f2', startsAt: '2026-11-15T00:00:00Z', labels: {}, status: { state: 'unprocessed' } }];
  const rows = historyUpdates(active, [], T0);
  assert.deepEqual(rows.map(r => [r.fingerprint, r.endsAt, r.receivers]), [['f1', null, ['r']]]);
  const ended = historyUpdates([], [{ ...rows[0], lastSeen: '2026-11-15T00:05:00Z' }], T0 + 600e3);
  assert.equal(ended[0].endsAt, '2026-11-15T00:05:00.000Z');
  assert.deepEqual(historyUpdates(active, [rows[0]], T0).length, 1);
});

test('alerts.read keeps rules, live alerts and the resolved history; alerts.expr reads the rule expr itself', async () => {
  let live = [{ fingerprint: 'f1', startsAt: '2026-11-14T23:00:00Z', labels: { alertname: 'Down' }, annotations: {}, receivers: [], status: { state: 'active' } }];
  let now = T0;
  const groups = [{ name: 'g', rules: [{ type: 'alerting', name: 'Down', query: 'up == 0', state: 'firing' }] }];
  const calls = [];
  const prom = async (id, route, params) => { calls.push([route, params]); return route === '/api/v1/rules' ? { groups } : { result: [{ metric: {}, values: [[1, '0']] }] }; };
  const log = memoryLog(), alerts = createAlerts({ log, now: () => now, prom, alertmanager: async () => live });
  let r = await alerts.read({ id: 'c1' });
  assert.deepEqual([r.rules.groups.length, r.alertmanager.length, r.history.length, r.partial], [1, 1, 0, null]);
  live = []; now = T0 + 120e3;
  r = await alerts.read({ id: 'c1' });
  assert.deepEqual(r.history.map(h => [h.fingerprint, h.endsAt]), [['f1', new Date(T0).toISOString()]]);
  assert.equal((await alerts.read({ id: 'other' })).history.length, 0);
  const expr = await alerts.expr({ id: 'c1', rule: { group: 'g', name: 'Down' }, from: T0 - 3600e3, to: T0, step: 60 });
  assert.equal(expr.query, 'up == 0');
  assert.equal(calls.at(-1)[1].query, 'up == 0');
  await assert.rejects(alerts.expr({ id: 'c1', rule: { group: 'g', name: 'Missing' }, from: T0 - 60e3, to: T0 }), { kind: 'missing' });
  const down = createAlerts({ log: memoryLog(), prom: async () => { throw Object.assign(new Error('x'), { kind: 'unconfigured' }); }, alertmanager: async () => { throw Object.assign(new Error('x'), { kind: 'unconfigured', source: 'alertmanager' }); } });
  await assert.rejects(down.read({ id: 'c1' }), { kind: 'unconfigured' });
});

test('network: Pod traffic is grouped by the Service of its EndpointSlice; unmeasured values stay empty', async () => {
  const slices = [
    { metadata: { namespace: 'a', labels: { 'kubernetes.io/service-name': 'db-headless' } }, endpoints: [{ targetRef: { kind: 'Pod', name: 'db-0' } }] },
    { metadata: { namespace: 'a', labels: { 'kubernetes.io/service-name': 'db' } }, endpoints: [{ targetRef: { kind: 'Pod', name: 'db-0' } }] },
    { metadata: { namespace: 'a', labels: { 'kubernetes.io/service-name': 'web' } }, endpoints: [{ targetRef: { kind: 'Pod', name: 'web-1' } }, { targetRef: { kind: 'Pod', name: 'web-2' } }] },
  ];
  const map = podServices(slices);
  assert.equal(map.get('a/db-0'), 'db');
  const grouped = byService([{ metric: { namespace: 'a', pod: 'web-1' }, values: [[1, '10'], [2, '20']] }, { metric: { namespace: 'a', pod: 'web-2' }, values: [[1, '5']] }, { metric: { namespace: 'a', pod: 'lonely' }, values: [[1, '1']] }], map);
  assert.deepEqual(grouped, { rows: [{ metric: { namespace: 'a', service: 'web' }, values: [[1, '15'], [2, '20']] }], unmapped: 1 });
  const read = createNetwork({ now: () => T0, listSlices: async () => slices, prom: async (id, route, params) => (route.endsWith('query_range') ? { result: [{ metric: { namespace: 'a', pod: 'web-1' }, values: [[1, '7']] }] }
    : /ingress, service/.test(params.query) ? { result: [{ metric: { namespace: 'a', ingress: 'web', service: 'web' }, value: [1, '2'] }] } : { result: [{ metric: { namespace: 'a', service: 'web' }, value: [1, '1.5'] }, { metric: {}, value: [1, 'NaN'] }] }) });
  const r = await read({ id: 'c1', from: T0 - 3600e3, to: T0, step: 60 });
  assert.deepEqual([r.rx[0].metric, r.err.length, r.ingress.length, r.conns, r.retrans], [{ namespace: 'a', service: 'web' }, 1, 1, [], []]);
});

test('events are kept for 7 days: a stored event outlives the API server list', async () => {
  const ev = (uid, ns, last, count = 1) => ({ metadata: { uid, namespace: ns, name: uid, managedFields: [{}] }, type: 'Warning', reason: 'BackOff', count, lastTimestamp: last, involvedObject: { uid: 'p-' + uid } });
  const known = new Map([['e1', { at: Date.parse('2026-11-14T23:00:00Z'), count: 1 }]]);
  assert.deepEqual(changedEvents([ev('e1', 'a', '2026-11-14T23:00:00Z'), ev('e1b', 'a', '2026-11-14T23:00:00Z'), { metadata: {} }], known).map(e => e.metadata.uid), ['e1b']);
  let live = [ev('e1', 'a', '2026-11-14T23:00:00Z'), ev('e2', 'b', '2026-11-14T23:30:00Z')], now = T0;
  const log = memoryLog(), events = createEvents({ log, now: () => now, client: () => ({ request: async () => ({ items: live }) }) });
  let r = await events.read({ id: 'c1', ns: '_all' });
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].metadata.managedFields, undefined);
  live = []; now = T0 + 3 * 86400e3;
  r = await events.read({ id: 'c1', ns: 'a' });
  assert.deepEqual(r.items.map(e => e.metadata.uid), ['e1']);
  assert.deepEqual((await events.read({ id: 'c1', subjectUid: 'p-e2' })).items.map(e => e.metadata.uid), ['e2']);
  assert.equal((await events.read({ id: 'other' })).items.length, 0);
  now = T0 + 8 * 86400e3;
  assert.equal((await events.read({ id: 'c1' })).items.length, 0);
  await assert.rejects(events.read({ id: 'c1', ns: 'A_B' }), { kind: 'invalid_request' });
  assert.equal(log.rows.length, 2);
});

test('log levels count Loki detected_level over the whole window', async () => {
  assert.deepEqual(levelCounts([{ metric: { detected_level: 'error' }, value: [0, '2'] }, { metric: { detected_level: 'warning' }, value: [0, '3'] }, { metric: { detected_level: 'info' }, value: [0, '5'] }, { metric: {}, value: [0, '1'] }]),
    { all: 11, ERROR: 2, WARN: 3, INFO: 5, DEBUG: 0, unknown: 1 });
  let call;
  const levels = createLogLevels({ now: () => T0, loki: async (id, route, params) => { call = params; return { result: [] }; } });
  await levels({ id: 'c1', ns: 'a', pod: 'web-1', container: 'web', from: T0 - 3600e3, to: T0 });
  assert.equal(call.query, 'sum by (detected_level) (count_over_time({namespace="a", pod="web-1", container="web"}[3600s]))');
  await assert.rejects(levels({ id: 'c1', ns: 'a', pod: 'web"}', from: T0 - 1, to: T0 }), { kind: 'invalid_request' });
});

test('source checks keep the last success, the error code and a latency history (one row a minute)', async () => {
  let now = T0;
  const log = memoryLog(), sources = createSourceStates({ log, now: () => now });
  assert.equal(sources.state('c1', 'prometheus').state, 'unknown');
  await sources.track('c1', 'prometheus', async () => 1);
  await sources.track('c1', 'prometheus', async () => 1);
  assert.equal(log.rows.length, 1);
  now += 90e3;
  await assert.rejects(sources.track('c1', 'prometheus', async () => { throw Object.assign(new Error('secret url'), { status: 502 }); }));
  /* 출처 상태 v1(공통 계약): 이전 { id, state: 'error', last, at, error } 다섯 필드는 그대로 두고 v1 필드가 더해졌다 */
  const failed = sources.state('c1', 'prometheus');
  assert.deepEqual({ id: failed.id, state: failed.state, last: failed.last, at: failed.at, error: failed.error, lastSuccessAt: failed.lastSuccessAt },
    { id: 'prometheus', state: 'error', last: T0, at: now, error: 'http_502', lastSuccessAt: new Date(T0).toISOString() });
  await assert.rejects(sources.track('c1', 'loki', async () => { throw Object.assign(new Error('x'), { kind: 'unconfigured' }); }));
  assert.equal(sources.state('c1', 'loki').state, 'unconfigured');
  const checks = sources.checks('c1', 'prometheus');
  assert.deepEqual([checks.samples.map(s => s.ms === null), checks.errors.map(e => e.text)], [[false, true], ['http_502']]);
  assert.equal(createSourceStates({ log, now: () => now }).state('c1', 'prometheus').last, T0);
  assert.equal(errorCode(new Error('raw text')), 'connection');
});

test('hub services answer failures as { error, source } and record the source state', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-reads-'));
  try {
    const answers = { prometheus: { status: 200, body: JSON.stringify({ status: 'success', data: { resultType: 'matrix', result: [{ metric: {}, values: [[1, '2']] }] } }) } };
    const hub = createHubReads({ userData, now: () => T0, maskText: text => ({ text, n: 0 }), client: () => ({ request: async () => { throw Object.assign(new Error('denied'), { status: 403 }); } }),
      toolQuery: async (id, kind) => answers[kind] ?? { error: 'unconfigured' } });
    const r = await hub['metrics.range']({ id: 'c1', series: 'cluster.cpu', from: T0 - 600e3, to: T0, step: 60 });
    assert.deepEqual([r.result.length, r.sourceState.state], [1, 'ready']);
    assert.deepEqual(await hub['logs.levels']({ id: 'c1', ns: 'a', pod: 'b', from: T0 - 60e3, to: T0 }), { error: 'unconfigured', source: 'loki' });
    assert.deepEqual(await hub['metrics.range']({ id: 'c1', series: 'nope', from: T0 - 60e3, to: T0 }), { error: 'invalid_request', source: 'prometheus' });
    assert.deepEqual(await hub['metrics.range']({}), { error: 'invalid_request', source: 'prometheus' });
    answers.prometheus = { status: 200, truncated: true, body: '{' };
    assert.equal((await hub['metrics.range']({ id: 'c1', series: 'cluster.cpu', from: T0 - 600e3, to: T0 })).error, 'response_too_large');
    const sources = await hub['hub.sources']({ id: 'c1' });
    /* hub.sources는 1분 안에 시도하지 않은 출처를 확인한다: Alertmanager(없음), Kubernetes와 Argo CD(403) */
    assert.deepEqual(Object.fromEntries(Object.entries(sources.sources).map(([k, v]) => [k, v.state])),
      { prometheus: 'error', alertmanager: 'unconfigured', loki: 'unconfigured', kubernetes: 'forbidden', argocd: 'forbidden' });
    answers.prometheus = { status: 200, body: '{}' };
    const retried = await hub['hub.sources']({ id: 'c1', refresh: true });
    assert.equal(retried.sources.prometheus.state, 'ready', 'explicit retry probes again within the cache interval');
    assert.deepEqual(await hub['tool.checks']({ id: 'c1', kind: 'argocd' }), { at: new Date(T0).toISOString(), samples: [], errors: [], probe: false });
    assert.equal((fs.statSync(path.join(userData, 'hub', 'source-checks.jsonl')).mode & 0o777), 0o600);
    hub.close();
  } finally { fs.rmSync(userData, { recursive: true, force: true }); }
});

test('tool_checks_do_not_reuse_latency_or_errors_from_a_previous_service_uid', async () => {
  const log = memoryLog();
  const sources = createSourceStates({ log, now: () => T0 });
  sources.target('c1', 'loki', { uid: 'old-service', ref: 'monitoring/loki' });
  await sources.track('c1', 'loki', async () => 'ready');
  await assert.rejects(sources.track('c1', 'loki', async () => { throw Object.assign(new Error('timeout'), { kind: 'timeout' }); }));
  assert.equal(sources.checks('c1', 'loki').samples.length, 2);
  sources.target('c1', 'loki', { uid: 'new-service', ref: 'monitoring/loki' });
  assert.deepEqual(sources.checks('c1', 'loki').samples, []);
  assert.deepEqual(sources.checks('c1', 'loki').errors, []);
  await sources.track('c1', 'loki', async () => 'ready');
  assert.equal(sources.checks('c1', 'loki').samples.length, 1);
});

test('a_recovered_probe_is_kept_after_a_data_failure_within_the_same_minute', async () => {
  let now = T0;
  const sources = createSourceStates({ log: memoryLog(), now: () => now });
  await sources.track('c1', 'loki', async () => 'ready', { probe: true });
  now += 1000;
  await assert.rejects(sources.track('c1', 'loki', async () => { throw Object.assign(new Error('failed read'), { kind: 'timeout' }); }));
  now += 1000;
  await sources.track('c1', 'loki', async () => 'ready', { probe: true });
  assert.equal(sources.state('c1', 'loki').state, 'ready');
  assert.notEqual(sources.checks('c1', 'loki').samples.at(-1).ms, null, 'the latest recorded sample must show the recovery');
});

for (const outcome of ['success', 'failure', 'roundtrip']) test(`source_states_overlap_${outcome}_does_not_publish_previous_uid`, async () => {
  let now = T0;
  const log = memoryLog(), sources = createSourceStates({ log, now: () => now });
  sources.target('c1', 'prometheus', { uid: 'old', ref: 'monitoring/prometheus' });
  await sources.track('c1', 'prometheus', async () => 7);
  const pending = Promise.withResolvers();
  const old = sources.track('c1', 'prometheus', () => pending.promise);
  sources.target('c1', 'prometheus', { uid: 'new', ref: 'monitoring/prometheus' });
  if (outcome === 'roundtrip') sources.target('c1', 'prometheus', { uid: 'old', ref: 'monitoring/prometheus' });
  const before = sources.state('c1', 'prometheus');
  assert.equal(before.state, 'unknown');
  assert.equal(before.reasons.lastSuccessAt, 'identity_changed');
  now += 1000;
  if (outcome === 'failure') pending.reject(Object.assign(new Error('read failed'), { kind: 'timeout' }));
  else pending.resolve(7);
  await assert.rejects(old, { kind: outcome === 'failure' ? 'timeout' : 'identity_changed' });
  const after = sources.state('c1', 'prometheus');
  assert.equal(after.state, 'unknown');
  for (const field of ['lastSuccessAt', 'observedAt', 'coverage']) assert.equal(after[field], null);
  assert.equal(after.reasons.lastSuccessAt, 'identity_changed');
  assert.equal(after.previous.lastSuccessAt, outcome === 'success' ? new Date(now).toISOString() : before.previous.lastSuccessAt);
  assert.deepEqual(log.rows.at(-1).target, 'old');
  assert.equal(await sources.track('c1', 'prometheus', async () => 9), 9);
  assert.equal(sources.state('c1', 'prometheus').state, 'ready');
  assert.equal(sources.state('c1', 'prometheus').previous, undefined);
});

test('source_states_forget_pending_read_rejects_value_and_does_not_revive_state', async () => {
  const log = memoryLog(), sources = createSourceStates({ log, now: () => T0 });
  sources.target('c1', 'prometheus', { uid: 'old' });
  const pending = Promise.withResolvers();
  const read = sources.track('c1', 'prometheus', () => pending.promise);
  sources.forget('c1');
  pending.resolve(7);
  await assert.rejects(read, { kind: 'cancelled' });
  assert.deepEqual(sources.states('c1'), {});
  assert.equal(log.rows.length, 0);
});

test('hub_reads_overlap_returns_identity_changed_until_new_target_data_arrives', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-overlap-'));
  let now = T0, uid = 'old', block = false, newReads = 0;
  const pending = Promise.withResolvers(), entered = Promise.withResolvers();
  const response = value => ({ status: 200, body: JSON.stringify({ status: 'success', data: { result: [{ metric: {}, values: [[now / 1000, String(value)]] }] } }) });
  const hub = createHubReads({ userData, now: () => now, maskText: text => ({ text, n: 0 }),
    client: () => ({ request: async () => ({}) }), targetOf: async (_id, source) => ({ uid: source === 'prometheus' ? uid : source, ref: source }),
    toolQuery: async (_id, kind, route) => {
      if (kind !== 'prometheus' || !route.startsWith('/api/v1/query_range')) return { status: 200, body: '{}' };
      if (uid === 'new') newReads++;
      if (block) { entered.resolve(); return pending.promise; }
      return response(uid === 'new' ? 9 : 7);
    } });
  try {
    const args = { id: 'c1', series: 'cluster.cpu', from: T0 - 600e3, to: T0, step: 60 };
    await hub['hub.sources']({ id: 'c1' });
    assert.equal((await hub['metrics.range'](args)).result[0].values[0][1], '7');
    block = true;
    const old = hub['metrics.range'](args);
    await entered.promise;
    uid = 'new'; now += 61_000;
    const before = (await hub['hub.sources']({ id: 'c1', refresh: true })).sources.prometheus;
    assert.equal(before.state, 'unknown');
    assert.equal(before.previous.target.uid, 'old');
    now += 1000; pending.resolve(response(7));
    assert.deepEqual(await old, { error: 'identity_changed', source: 'prometheus' });
    const after = (await hub['hub.sources']({ id: 'c1' })).sources.prometheus;
    assert.equal(newReads, 0);
    assert.equal(after.target.uid, 'new');
    assert.equal(after.state, 'unknown');
    assert.equal(after.reasons.lastSuccessAt, 'identity_changed');
    assert.equal(after.lastSuccessAt, null);
    assert.equal(after.coverage, null);
    assert.equal(after.previous.lastSuccessAt, new Date(now).toISOString());
    block = false;
    const next = await hub['metrics.range'](args);
    assert.equal(newReads, 1);
    assert.equal(next.result[0].values[0][1], '9');
    assert.equal(next.sourceState.state, 'ready');
  } finally { hub.close(); fs.rmSync(userData, { recursive: true, force: true }); }
});

test('hub_sources_answer_kubernetes_and_argo_cd_from_a_live_shared_watch_without_a_probe_request', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-source-watch-'));
  const requests = [];
  let live = { kubernetes: true, argocd: true };
  const hub = createHubReads({ userData, now: () => T0, maskText: text => ({ text, n: 0 }),
    client: () => ({ request: async (_method, route) => { requests.push(route); return {}; } }), toolQuery: async () => ({ status: 200, body: '{}' }),
    targetOf: async () => ({ uid: 'same', ref: 'test' }), liveWatch: (id, source) => id === 'c1' && live[source] === true });
  try {
    const states = (await hub['hub.sources']({ id: 'c1', refresh: true })).sources;
    assert.deepEqual([states.kubernetes.state, states.argocd.state], ['ready', 'ready']);
    assert.deepEqual(requests, [], 'a live watch already shows the API server and the Argo CD applications answer');
    live = { kubernetes: false, argocd: false };
    await hub['hub.sources']({ id: 'c1', refresh: true });
    assert.deepEqual(requests.sort(), ['/apis/argoproj.io/v1alpha1/applications?limit=1', '/version'], 'without a live watch the probe asks');
  } finally { hub.close(); fs.rmSync(userData, { recursive: true, force: true }); }
});

test('hub_sources_returns_current_permission_loss_and_recovery_without_changing_data_time', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-source-current-'));
  let now = T0, denied = false;
  const hub = createHubReads({ userData, now: () => now, maskText: text => ({ text, n: 0 }),
    client: () => ({ request: async (_method, route) => {
      if (route.includes('argoproj') && denied) throw Object.assign(new Error('denied'), { status: 403 });
      return {};
    } }), toolQuery: async () => ({ status: 200, body: '{}' }), targetOf: async () => ({ uid: 'same', ref: 'test' }) });
  try {
    await hub['hub.sources']({ id: 'c1' });
    await hub.track('c1', 'argocd', async () => []);
    const success = (await hub['hub.sources']({ id: 'c1' })).sources.argocd.lastSuccessAt;
    for (const state of ['forbidden', 'ready']) {
      now += 61_000; denied = state === 'forbidden';
      const current = (await hub['hub.sources']({ id: 'c1' })).sources.argocd;
      assert.equal(current.state, state);
      assert.equal(current.lastSuccessAt, success, 'probe must not invent a new data success');
    }
  } finally { hub.close(); fs.rmSync(userData, { recursive: true, force: true }); }
});

/* A-04: 네트워크 화면의 보관 기간은 Prometheus가 말하는 실제 값(/api/v1/status/runtimeinfo storageRetention), 모르면 null(화면은 쓰지 않음) */
test('network_retention_is_read_from_prometheus_runtimeinfo_and_null_when_unknown', async () => {
  const runtimeInfo = retention => async () => (retention instanceof Error ? Promise.reject(retention) : { storageRetention: retention });
  const read = r => createNetwork({ now: () => T0, listSlices: async () => [], prom: async () => ({ result: [] }), runtimeInfo: runtimeInfo(r) })({ id: 'c1', from: T0 - 3600e3, to: T0, step: 60 });
  assert.equal((await read('15d')).retention, 15 * 86400);
  assert.equal((await read('1w2d or 10GiB')).retention, 9 * 86400);
  assert.equal((await read('10GiB')).retention, null, 'a size-only retention is no time span');
  assert.equal((await read(Object.assign(new Error('no'), { status: 404 }))).retention, null, 'a failed status read leaves it unknown');
});

test('alerts_read_names_how_long_wake_keeps_the_alert_history', async () => {
  const r = await createAlerts({ log: memoryLog(), prom: async () => ({ groups: [] }), alertmanager: async () => [] }).read({ id: 'c1' });
  assert.equal(r.historyDays, 90);
});

test('events_read_scans_the_stored_log_once_and_serves_live_events_from_the_watch_cache_without_an_api_request', async () => {
  const ev = (uid, last) => ({ metadata: { uid, namespace: 'a', name: uid }, type: 'Normal', reason: 'Pulled', count: 1, lastTimestamp: last, involvedObject: { uid: 'p-' + uid } });
  const base = memoryLog();
  let scans = 0, requests = 0;
  const log = { ...base, list: f => { scans++; return base.list(f); } };
  const live = new Map([['c1', [ev('w1', '2026-11-14T23:50:00Z')]]]);
  const events = createEvents({ log, now: () => T0, client: () => ({ request: async () => { requests++; return { items: [ev('h1', '2026-11-14T23:00:00Z')] }; } }), live: (id, ns) => (ns ? null : live.get(id) ?? null) });
  for (let i = 0; i < 5; i++) await events.read({ id: 'c2', ns: '_all' });
  const r = await events.read({ id: 'c1', ns: '_all' });
  assert.deepEqual(r.items.map(e => e.metadata.uid).sort(), ['w1']);
  assert.equal(requests, 5, 'a cluster with a live events watch is not listed again');
  assert.ok(scans <= 1, `the stored log was scanned ${scans} times for six reads`);
  assert.deepEqual((await events.read({ id: 'c2', ns: '_all' })).items.map(e => e.metadata.uid), ['h1'], 'events stored earlier come from memory');
  events.record('c1', [ev('w2', '2026-11-14T23:55:00Z')]);
  assert.deepEqual(base.rows.map(r => r.event.metadata.uid), ['h1', 'w2'], 'a watched change is stored without a read');
});

test('cluster_reads_hand_the_hub_the_tool_query_its_tool_kinds_and_the_shared_watch_cache', async () => {
  const { createHubReads } = require('./index.cjs');
  const os = require('node:os'), fs = require('node:fs'), path = require('node:path');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-reads-'));
  try {
    const asked = [];
    const reads = createHubReads({ userData, client: () => ({ request: async () => ({}) }), maskText: t => t, cached: (id, plural) => (plural === 'pods' ? [{ metadata: { name: 'a' } }] : null),
      toolQuery: async (id, kind, route) => { asked.push([kind, route]); return { status: 200, body: kind === 'grafana' ? '[{"uid":"d1"}]' : '{"status":"success","data":{"groups":[]}}' }; } });
    const cluster = reads.cluster();
    assert.equal(typeof cluster.tool, 'function');
    assert.deepEqual(cluster.toolKinds, ['prometheus', 'alertmanager', 'loki', 'tempo', 'grafana']);
    assert.deepEqual(await cluster.tool('lab', 'grafana', '/api/search', { type: 'dash-db' }), [{ uid: 'd1' }], 'Grafana answers with its body');
    assert.deepEqual(await cluster.tool('lab', 'prometheus', '/api/v1/rules', {}), { groups: [] });
    assert.deepEqual(asked.map(a => a[0]), ['grafana', 'prometheus']);
    assert.deepEqual(await cluster.cached('lab', 'pods'), [{ metadata: { name: 'a' } }]);
    assert.equal(await cluster.cached('lab', 'nodes'), null);
  } finally { fs.rmSync(userData, { recursive: true, force: true }); }
});
