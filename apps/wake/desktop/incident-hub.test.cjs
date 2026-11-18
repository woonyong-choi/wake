/* 인시던트 허브 목록 행: 범위 검색 상자(SCR-SEARCH-SCOPE, H-009)의 종류가 인시던트 대상과 맞도록 대상(종류 · 이름 · namespace)을 행에 싣는다. 합성 저장소만 쓴다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createIncidentHub } = require('./incident-hub.cjs');

const docs = seed => { const m = new Map(Object.entries(seed)); return { get: id => m.get(id) ?? null, all: () => [...m.values()], put: (id, v) => { m.set(id, { ...v, id }); return m.get(id); }, remove: id => m.delete(id), prune: () => 0 }; };
const log = () => ({ list: () => [], append: v => v, prune: () => 0 });

test('incident_list_rows_carry_the_target_the_scope_kind_matches', () => {
  const inc = { id: 'i1', number: 'INC-0001', cluster: 'c1', key: 'k', target: { kind: 'Deployment', name: 'payments-api', namespace: 'payments', uid: 'd1' }, reasons: { CrashLoopBackOff: 1 }, severity: 'critical',
    alert: null, detectedAt: 1000, lastSignalAt: 1000, phase: 'open', signals: [] };
  const sets = { incidents: docs({ i1: inc }), meta: docs({}) };
  const hub = createIncidentHub({ store: { docs: name => sets[name] ?? docs({}), log }, sources: {}, now: () => 2000, user: () => 'tester' });
  const [row] = hub.rows({ cluster: 'c1' });
  assert.deepEqual(row.target, { kind: 'Deployment', name: 'payments-api', ns: 'payments' });
  assert.equal(row.ns, 'payments');
});

/* 근거 수집(RULE-EVIDENCE): 합성 출처. api와 api-gateway가 같은 namespace에 있다 */
function evidenceHub({ promRange, events }) {
  const inc = { id: 'i1', number: 'INC-0001', cluster: 'c1', key: 'k', target: { kind: 'Deployment', name: 'api', namespace: 'pay', uid: 'd1' }, reasons: { CrashLoopBackOff: 1 }, severity: 'critical',
    alert: null, detectedAt: 1_000_000, lastSignalAt: 1_000_000, phase: 'open', signals: [] };
  const rs = (name, owner) => ({ kind: 'ReplicaSet', metadata: { name, namespace: 'pay', uid: name, ownerReferences: [{ kind: 'Deployment', name: owner }] } });
  const pod = (name, owner) => ({ kind: 'Pod', metadata: { name, namespace: 'pay', uid: name, ownerReferences: [{ kind: 'ReplicaSet', name: owner }] }, status: { containerStatuses: [] } });
  const deployment = { kind: 'Deployment', metadata: { name: 'api', namespace: 'pay', uid: 'd1' }, spec: { replicas: 1, template: { metadata: { labels: {} }, spec: { containers: [{ name: 'app' }] } } }, status: {} };
  const lists = { pods: [pod('api-7d9-abc', 'api-7d9'), pod('api-gateway-5f-xyz', 'api-gateway-5f')], replicasets: [rs('api-7d9', 'api'), rs('api-gateway-5f', 'api-gateway')], deployments: [deployment] };
  const sources = { alerts: async () => [], get: async () => deployment, kube: async () => ({ items: [] }), promRange, sourceState: () => ({ state: 'ok' }), state: () => [],
    list: async (_id, kind) => (kind === 'events' ? events() : lists[kind] ?? []) };
  const sets = { incidents: docs({ i1: inc }), meta: docs({}) }, logs = {};
  const store = { docs: name => (sets[name] ??= docs({})), log: name => (logs[name] ??= (() => { const rows = []; return { list: f => rows.filter(f ?? (() => true)), append: v => { rows.push(v); return v; }, prune: () => 0 }; })()) };
  let clock = 2_000_000;
  const hub = createIncidentHub({ store, sources, now: () => clock, user: () => 'tester' });
  return { hub, tick: ms => { clock += ms; }, incident: () => sets.incidents.get('i1') };
}

test('memory_evidence_query_names_the_workload_pods_not_a_prefix_that_catches_other_workloads', async () => {
  const queries = [];
  const { hub } = evidenceHub({ promRange: async (_id, q) => { queries.push(q); return []; }, events: async () => [] });
  await hub.workspace({ cluster: 'c1', id: 'i1' });
  const memory = queries.find(q => q.includes('container_memory_working_set_bytes'));
  assert.ok(memory, 'memory query issued');
  assert.match(memory, /pod=~"api-7d9-abc"/);
  assert.doesNotMatch(memory, /api-gateway/);
  assert.doesNotMatch(memory, /pod=~"api-\.\*"/);
});

test('failed_evidence_reads_are_recorded_with_reason_and_retried_not_marked_collected', async () => {
  let fail = true, eventReads = 0;
  const { hub, tick, incident } = evidenceHub({ promRange: async () => { if (fail) throw Object.assign(new Error('prometheus timed out'), { kind: 'timeout' }); return []; },
    events: async () => { eventReads++; if (fail) throw Object.assign(new Error('forbidden'), { status: 403 }); return []; } });
  const first = await hub.workspace({ cluster: 'c1', id: 'i1' });
  assert.notEqual(incident().collectedPhase, incident().phase, 'a phase with failed reads is not collected');
  const reasons = Object.fromEntries(first.evidenceFailures.map(f => [f.kind, f.reason]));
  assert.equal(reasons.events, 'forbidden');
  assert.equal(reasons.metric, 'timeout');
  assert.ok(first.evidenceFailures.every(f => f.query && Number.isFinite(f.at)));
  assert.ok(!first.evidence.some(e => e.kind === 'events' || e.kind === 'metric'), 'a failed read is never an evidence piece');
  fail = false; tick(2 * 60_000);
  const second = await hub.workspace({ cluster: 'c1', id: 'i1' });
  assert.ok(eventReads >= 2, 'failed read retried later');
  assert.deepEqual(second.evidenceFailures, []);
  assert.equal(incident().collectedPhase, incident().phase);
});
