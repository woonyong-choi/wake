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

/* ---------- 흔한 장애 종류 전부(F-BE-018 표): 근거 → 원인 등급·결론 → 조치 → 두 사전의 글. 합성 출처 ---------- */
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const dicts = Promise.all(['ko', 'en'].map(l => import(pathToFileURL(path.join(__dirname, `../locale/${l}.js`)).href).then(m => m.default)));
const NS = 'pay', T0 = 10_000_000, iso = v => new Date(v).toISOString();
const keysIn = v => (Array.isArray(v) ? v.flatMap(keysIn) : v && typeof v === 'object' ? (typeof v.$t === 'string' ? [v.$t, ...keysIn(v.vars)] : Object.values(v).flatMap(keysIn)) : []);
const dep = (extra = {}, revision = '2') => ({ kind: 'Deployment', metadata: { name: 'api', namespace: NS, uid: 'd1', generation: 5, annotations: { 'deployment.kubernetes.io/revision': revision } }, spec: { replicas: 1, template: { metadata: { labels: {} }, spec: { containers: [{ name: 'app', image: 'busybox:nope', resources: {} }] } } }, status: { readyReplicas: 0 }, ...extra });
const classPod = (status, spec = {}) => ({ kind: 'Pod', metadata: { name: 'api-7d9-abc', namespace: NS, uid: 'p1', ownerReferences: [{ kind: 'ReplicaSet', name: 'api-7d9' }] }, spec: { containers: [{ name: 'app', resources: {} }], ...spec }, status });
const waiting = (reason, message) => ({ phase: 'Pending', containerStatuses: [{ name: 'app', ready: false, restartCount: 0, state: { waiting: { reason, message } } }] });
const warn = (reason, message, object, count = 1) => ({ type: 'Warning', reason, message, count, involvedObject: { namespace: NS, ...object }, lastTimestamp: iso(T0), metadata: { uid: `${reason}-${object.name}` } });
const rsOf = (revision, at = T0 - 60_000, name = 'api-7d9') => ({ kind: 'ReplicaSet', metadata: { name, namespace: NS, uid: `rs-${name}`, creationTimestamp: iso(at), annotations: { 'deployment.kubernetes.io/revision': String(revision) }, ownerReferences: [{ kind: 'Deployment', name: 'api', uid: 'd1' }] },
  spec: { template: { metadata: { labels: { app: 'api', 'pod-template-hash': name } }, spec: { containers: [{ name: 'app', image: `api:${revision}` }] } } } });
/* the revision the Deployment ran before the bad rollout: three hours old */
const olderRs = revision => rsOf(revision, T0 - 3 * 3_600_000, `api-old${revision}`);

/* 감지도 같은 목록을 읽는다(kube 경로의 마지막 조각이 목록 종류): 심은 인시던트 하나 대신 그 목록에서 감지가 연 것과 같은 대상이 작업면이 된다 */
async function classCase({ rule, target = { kind: 'Deployment', name: 'api', namespace: NS, uid: 'd1' }, owner = dep(), pods = [], events = [], replicasets = [rsOf(1)], jobs = [], stored = {}, services = [], deployments = [], applications = [], kube = null }) {
  const inc = { id: 'i1', number: 'INC-0001', cluster: 'c1', key: 'k', target, rule, reasons: { X: 1 }, severity: 'warning', alert: null, detectedAt: T0, lastSignalAt: T0, phase: 'open', signals: [], ...stored };
  const lists = { pods, replicasets, jobs, events, services, deployments: deployments.length || owner?.kind !== 'Deployment' ? deployments : [owner], nodes: owner?.kind === 'Node' ? [owner] : [], applications };
  kube ??= async (_id, p) => ({ items: lists[String(p).split('?')[0].split('/').pop()] ?? [] });
  const sources = { alerts: async () => [], get: async () => owner, kube, promRange: async () => [], sourceState: () => ({ state: 'ok' }), state: () => [],
    list: async (_id, kind) => lists[kind] ?? [] };
  const sets = { incidents: docs({ i1: inc }), meta: docs({}) }, logs = {};
  const store = { docs: name => (sets[name] ??= docs({})), log: name => (logs[name] ??= (() => { const rows = []; return { list: f => rows.filter(f ?? (() => true)), append: v => { rows.push(v); return v; }, prune: () => 0 }; })()) };
  const hub = createIncidentHub({ store, sources, now: () => T0 + 60_000, user: () => 'tester' });
  const w = await hub.workspace({ cluster: 'c1', id: 'i1' });
  const [ko, en] = await dicts;
  for (const k of keysIn({ chain: w.chain, options: w.options.map(o => ({ title: o.title, basis: o.basis, reach: o.reach, kind: o.kind })), verify: w.verify })) {
    assert.ok(k in ko && k in en, `${rule}: ${k} in both dictionaries`);
  }
  return w;
}
const opt = (w, id) => w.options.find(o => o.id === id);

test('image_pull_is_confirmed_by_the_kubelet_state_and_offers_a_manual_check_and_the_rollback_of_the_new_revision', async () => {
  const w = await classCase({ rule: 'image-pull', pods: [classPod(waiting('ImagePullBackOff', 'Back-off pulling image "busybox:nope"'))], replicasets: [olderRs(1), rsOf(2)],
    events: [warn('Failed', 'Failed to pull image "busybox:nope": rpc error: not found', { kind: 'Pod', name: 'api-7d9-abc' })] });
  assert.equal(w.chain.grade, 'confirmed');
  assert.equal(w.chain.conclusion.$t, 'wake.inc.rule.image-pull.notfound');
  assert.ok(w.chain.cells.observe.some(c => c.text.$t === 'wake.inc.obs.fact' && c.refs.length));
  assert.equal(opt(w, 'check').plan.route, 'manual');
  assert.equal(opt(w, 'check').plan.command, 'kubectl describe pod api-7d9-abc -n pay');
  const back = opt(w, 'rollback');
  assert.equal(back.plan.route, 'command');
  assert.equal(back.title.vars.revision, 1);
  const ops = JSON.parse(/-p '(.*)' --context 'c1'$/.exec(back.plan.command)[1]);
  assert.deepEqual(ops.filter(o => o.op === 'test').map(o => [o.path, o.value]), [['/metadata/uid', 'd1'], ['/metadata/generation', 5], ['/metadata/annotations/deployment.kubernetes.io~1revision', '2']]);
  assert.deepEqual(ops.at(-1), { op: 'replace', path: '/spec/template', value: { metadata: { labels: { app: 'api' } }, spec: { containers: [{ name: 'app', image: 'api:1' }] } } },
    'the template of revision 1, without the hash label the controller adds, replaces the current one');
  /* an automatically synced Application: the rollback is a revert of the synced commit through a Draft PR */
  const app = { kind: 'Application', metadata: { name: 'api', namespace: 'argocd' }, spec: { destination: {}, source: { repoURL: 'https://git.example/api.git', path: 'k8s' }, syncPolicy: { automated: {} } },
    status: { sync: { revision: 'abc123' }, resources: [{ group: 'apps', kind: 'Deployment', namespace: NS, name: 'api' }] } };
  const gitops = await classCase({ rule: 'image-pull', owner: { ...dep(), apiVersion: 'apps/v1' }, applications: [app], pods: [classPod(waiting('ImagePullBackOff', 'Back-off pulling image "busybox:nope"'))], replicasets: [olderRs(1), rsOf(2)] });
  assert.deepEqual([opt(gitops, 'rollback').plan.route, opt(gitops, 'rollback').plan.checks.includes('git-revert'), opt(gitops, 'rollback').title.vars.revision], ['pr', true, 1]);
});

test('container_config_names_the_missing_configmap_key_and_checks_it_without_writing', async () => {
  const w = await classCase({ rule: 'container-config', pods: [classPod(waiting('CreateContainerConfigError', 'couldn\'t find key missing in ConfigMap pay/app-cfg'))] });
  assert.equal(w.chain.grade, 'confirmed');
  assert.equal(w.chain.conclusion.$t, 'wake.inc.rule.container-config.key');
  assert.equal(w.chain.conclusion.vars.object, 'app-cfg');
  assert.equal(opt(w, 'check').plan.command, 'kubectl get configmap app-cfg -n pay -o yaml');
  const s = await classCase({ rule: 'container-config', pods: [classPod(waiting('CreateContainerConfigError', 'secret "db" not found'))] });
  assert.equal(opt(s, 'check').plan.command, 'kubectl get secret db -n pay', 'a Secret is checked without printing its values');
  const vague = await classCase({ rule: 'container-config', pods: [classPod(waiting('CreateContainerConfigError', 'failed to sync secret cache: timed out waiting for the condition'))] });
  assert.equal(vague.chain.grade, 'inferred', 'a message that names no missing object or key does not confirm the cause');
});

test('probe_failures_are_inferred_and_point_at_the_pod_description', async () => {
  const w = await classCase({ rule: 'probe-failed', pods: [classPod({ phase: 'Running', containerStatuses: [{ name: 'app', ready: false, restartCount: 0, state: { running: {} } }] })],
    events: [warn('Unhealthy', 'Readiness probe failed: HTTP probe failed with statuscode: 503', { kind: 'Pod', name: 'api-7d9-abc' }, 6)] });
  assert.equal(w.chain.grade, 'inferred');
  assert.equal(w.chain.conclusion.$t, 'wake.inc.rule.probe-failed.readiness');
  assert.equal(opt(w, 'check').plan.command, 'kubectl describe pod api-7d9-abc -n pay');
});

test('unschedulable_cause_comes_from_the_scheduler_message_and_each_cause_has_its_own_check', async () => {
  const held = message => classPod({ phase: 'Pending', conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable', message, lastTransitionTime: iso(T0) }] });
  const cp = '1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }';
  const cases = [['resources', `0/3 nodes are available: ${cp}, 2 Insufficient cpu. preemption: x`, /Allocated resources/], ['taint', `0/3 nodes are available: ${cp}, 2 node(s) had untolerated taint {dedicated: db}. preemption: x`, /spec.taints/],
    ['affinity', `0/3 nodes are available: ${cp}, 2 node(s) didn't match Pod's node affinity/selector. preemption: x`, /nodeSelector/], ['pvc', '0/3 nodes are available: pod has unbound immediate PersistentVolumeClaims. preemption: x', /get pvc -n pay/]];
  for (const [cause, message, command] of cases) {
    const w = await classCase({ rule: 'unschedulable', pods: [held(message)] });
    assert.equal(w.chain.grade, 'confirmed', cause);
    assert.equal(w.chain.conclusion.$t, `wake.inc.rule.unschedulable.${cause}`);
    assert.match(opt(w, 'check').plan.command, command);
  }
});

test('a_rule_without_fixed_evidence_is_insufficient_and_offers_nothing_confirmed', async () => {
  const w = await classCase({ rule: 'image-pull' });
  assert.equal(w.chain.grade, 'insufficient');
  assert.equal(w.chain.conclusion.$t, 'wake.inc.rule.unmatched');
  assert.ok(!w.options.some(o => o.grade === 'confirmed'));
});

test('volume_failures_join_the_claim_events_and_check_the_claim', async () => {
  const w = await classCase({ rule: 'volume', pods: [classPod({ phase: 'Pending' }, { volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'data' } }] })],
    events: [warn('ProvisioningFailed', 'storageclass.storage.k8s.io "nope" not found', { kind: 'PersistentVolumeClaim', name: 'data' })] });
  assert.equal(w.chain.grade, 'inferred');
  assert.equal(w.chain.conclusion.$t, 'wake.inc.rule.volume.provision');
  assert.equal(opt(w, 'check').plan.command, 'kubectl describe pvc data -n pay');
});

test('eviction_over_the_container_storage_limit_is_confirmed_and_offers_a_raised_limit_through_the_plan', async () => {
  const w = await classCase({ rule: 'evicted', owner: dep({ spec: { replicas: 1, template: { metadata: { labels: {} }, spec: { containers: [{ name: 'app', resources: { limits: { 'ephemeral-storage': '10Mi' } } }] } } } }),
    pods: [classPod({ phase: 'Failed', reason: 'Evicted', message: 'Pod ephemeral local storage usage exceeds the total limit of containers 10Mi.' })] });
  assert.equal(w.chain.grade, 'confirmed');
  const raise = opt(w, 'raise-ephemeral');
  assert.deepEqual(raise.plan.values, [{ path: 'spec.template.spec.containers[0].resources.limits.ephemeral-storage', before: '10Mi', after: '20Mi' }]);
  assert.equal(raise.plan.route, 'command');
});

test('node_not_ready_and_pressure_are_inferred_on_the_node_with_a_describe_check_and_a_cordon_through_approval', async () => {
  const node = conditions => ({ kind: 'Node', metadata: { name: 'w1', uid: 'n1' }, spec: {}, status: { conditions } });
  const target = { kind: 'Node', name: 'w1', namespace: '', uid: 'n1' };
  const down = await classCase({ rule: 'node-not-ready', target, owner: node([{ type: 'Ready', status: 'Unknown', reason: 'NodeStatusUnknown', message: 'Kubelet stopped posting node status.', lastTransitionTime: iso(T0) }]) });
  assert.equal(down.chain.grade, 'inferred');
  assert.equal(down.chain.conclusion.$t, 'wake.inc.rule.node-not-ready.unreachable');
  assert.equal(opt(down, 'check').plan.command, 'kubectl describe node w1');
  assert.equal(opt(down, 'cordon').plan.command, `kubectl patch node/w1 --type=json -p '${JSON.stringify([{ op: 'test', path: '/metadata/uid', value: 'n1' }, { op: 'add', path: '/spec/unschedulable', value: true }])}' --context 'c1'`,
    'the cordon fails unless the Node is still the one the plan named');
  assert.equal(opt(down, 'cordon').plan.route, 'command');
  const disk = await classCase({ rule: 'node-pressure', target, owner: node([{ type: 'Ready', status: 'True' }, { type: 'DiskPressure', status: 'True', message: 'kubelet has disk pressure', lastTransitionTime: iso(T0) }]) });
  assert.equal(disk.chain.grade, 'inferred');
  assert.equal(disk.chain.conclusion.$t, 'wake.inc.rule.node-pressure.disk');
});

test('job_failure_rollout_stuck_and_denied_creation_each_get_their_own_conclusion_and_check', async () => {
  const job = { kind: 'Job', metadata: { name: 'nightly', namespace: NS, uid: 'j1' }, spec: { template: { spec: { containers: [{ name: 'run' }] } } }, status: { failed: 1, conditions: [{ type: 'Failed', status: 'True', reason: 'BackoffLimitExceeded', message: 'Job has reached the specified backoff limit', lastTransitionTime: iso(T0) }] } };
  const j = await classCase({ rule: 'job-failed', target: { kind: 'Job', name: 'nightly', namespace: NS, uid: 'j1' }, owner: job });
  assert.equal(j.chain.grade, 'inferred');
  assert.equal(j.chain.conclusion.$t, 'wake.inc.rule.job-failed.backoff');
  assert.equal(opt(j, 'check').plan.command, 'kubectl logs job/nightly -n pay --all-containers');
  const stuck = await classCase({ rule: 'rollout-stuck', replicasets: [olderRs(1), olderRs(2), rsOf(3)], owner: dep({ status: { conditions: [{ type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded', message: 'ReplicaSet "api-7d9" has timed out progressing.', lastTransitionTime: iso(T0) }] } }, '3') });
  assert.equal(stuck.chain.grade, 'inferred');
  assert.equal(opt(stuck, 'check').plan.command, 'kubectl rollout status deployment/api -n pay');
  assert.equal(opt(stuck, 'rollback').title.vars.revision, 2, 'an older and a newer revision around the bad one: the one just before it');
  const quota = await classCase({ rule: 'create-denied', events: [warn('FailedCreate', 'Error creating: pods "api-7d9-x" is forbidden: exceeded quota: tiny, requested: cpu=1, used: cpu=0, limited: cpu=100m', { kind: 'ReplicaSet', name: 'api-7d9' })] });
  assert.equal(quota.chain.grade, 'confirmed');
  assert.equal(quota.chain.conclusion.$t, 'wake.inc.rule.create-denied.quota');
  assert.equal(opt(quota, 'check').plan.command, 'kubectl describe resourcequota -n pay');
});

test('crash_loop_gets_a_previous_log_check_even_without_a_recent_rollout', async () => {
  const w = await classCase({ rule: 'crash-loop', pods: [classPod({ phase: 'Running', containerStatuses: [{ name: 'app', ready: false, restartCount: 4, state: { waiting: { reason: 'CrashLoopBackOff', message: 'back-off' } }, lastState: { terminated: { reason: 'Error', exitCode: 1, finishedAt: iso(T0) } } }] })] });
  assert.equal(w.chain.grade, 'inferred');
  assert.equal(opt(w, 'check').plan.command, 'kubectl logs api-7d9-abc -n pay -c app --previous');
});

test('a_rule_that_changes_after_collection_collects_its_own_evidence_again', async () => {
  const w = await classCase({ rule: 'image-pull', stored: { collectedPhase: 'open', collectedRule: 'rollout-stuck' },
    pods: [classPod(waiting('ImagePullBackOff', 'Back-off pulling image "busybox:nope"'))] });
  assert.equal(w.chain.grade, 'confirmed', 'the evidence of the earlier rule does not judge the new one');
});

test('a_service_without_ready_endpoints_fixes_its_slices_as_evidence_and_checks_by_reading_only', async () => {
  const service = { kind: 'Service', metadata: { name: 'web', namespace: NS, uid: 's1', creationTimestamp: iso(T0 - 3_600_000) }, spec: { type: 'ClusterIP', clusterIP: '10.0.0.9', selector: { app: 'web' } } };
  const slices = endpoints => async (_id, p) => (String(p).includes('/endpointslices') ? { items: [{ metadata: { name: 'web-abc', namespace: NS, labels: { 'kubernetes.io/service-name': 'web' } }, endpoints }] } : { items: [] });
  const sliceReads = [];
  const lonely = await classCase({ rule: 'no-endpoints', target: { kind: 'Service', name: 'web', namespace: NS, uid: 's1' }, owner: service, services: [service],
    kube: async (id, p) => { sliceReads.push(p); return slices([])(id, p); } });
  assert.ok(sliceReads.some(p => p.includes('/apis/discovery.k8s.io/v1/namespaces/pay/endpointslices') && p.includes(encodeURIComponent('kubernetes.io/service-name=web'))), 'the slices of that Service are read');
  assert.equal(lonely.chain.grade, 'confirmed', 'a selector no Pod or workload carries is read, not guessed');
  assert.equal(lonely.chain.conclusion.$t, 'wake.inc.rule.no-endpoints.selector');
  assert.ok(lonely.evidence.some(e => e.role === 'endpoints' && e.target.kind === 'Service' && e.target.name === 'web'));
  assert.equal(opt(lonely, 'check').plan.route, 'manual');
  assert.equal(opt(lonely, 'check').plan.command, 'kubectl get pods -n pay --show-labels');
  const webPod = { ...classPod({ phase: 'Running', conditions: [{ type: 'Ready', status: 'False' }], containerStatuses: [{ name: 'app', ready: false, restartCount: 0, state: { running: {} } }] }) };
  webPod.metadata = { ...webPod.metadata, labels: { app: 'web' } };
  const down = await classCase({ rule: 'no-endpoints', owner: dep(), services: [service], pods: [webPod], deployments: [dep()],
    stored: { signals: [{ id: 'service:s1:no-endpoints', kind: 'service', reason: 'NoReadyEndpoints', at: T0, object: { kind: 'Service', namespace: NS, name: 'web', uid: 's1' }, message: '' }] },
    kube: slices([{ addresses: ['10.1.0.4'], conditions: { ready: false }, targetRef: { kind: 'Pod', name: 'api-7d9-abc' } }]) });
  assert.equal(down.chain.grade, 'inferred', 'why the Pods are not ready is not in the slices');
  assert.equal(down.chain.conclusion.$t, 'wake.inc.rule.no-endpoints.notready');
  assert.equal(opt(down, 'check').plan.command, 'kubectl get pods -l app=web -n pay');
  assert.equal(opt(down, 'check').plan.route, 'manual');
});

test('a_resolved_incident_keeps_the_cause_its_earlier_evidence_proved_when_the_later_pieces_show_recovery', async () => {
  const node = conditions => ({ kind: 'Node', metadata: { name: 'w1', uid: 'n1' }, spec: {}, status: { conditions } });
  const service = { kind: 'Service', metadata: { name: 'web', namespace: NS, uid: 's1' }, spec: { type: 'ClusterIP', selector: { app: 'web' } } };
  const cases = [
    { rule: 'node-pressure', target: { kind: 'Node', name: 'w1', namespace: '', uid: 'n1' }, sick: node([{ type: 'Ready', status: 'True' }, { type: 'MemoryPressure', status: 'True', message: 'kubelet has insufficient memory available', lastTransitionTime: iso(T0) }]),
      well: node([{ type: 'Ready', status: 'True' }, { type: 'MemoryPressure', status: 'False' }]), conclusion: 'wake.inc.rule.node-pressure.memory' },
    { rule: 'no-endpoints', target: { kind: 'Service', name: 'web', namespace: NS, uid: 's1' }, sick: service, well: service, conclusion: 'wake.inc.rule.no-endpoints.selector',
      slices: { sick: [], well: [{ metadata: { name: 'web-a', namespace: NS, labels: { 'kubernetes.io/service-name': 'web' } }, endpoints: [{ conditions: { ready: true } }] }] } },
  ];
  for (const c of cases) {
    let owner = c.sick, slices = c.slices?.sick ?? [], clock = T0 + 60_000;
    const inc = { id: 'i1', number: 'INC-0001', cluster: 'c1', key: 'k', target: c.target, rule: c.rule, reasons: { X: 1 }, severity: 'warning', alert: null, detectedAt: T0, lastSignalAt: T0, phase: 'open', signals: [] };
    const sources = { alerts: async () => [], get: async () => owner, kube: async (_id, p) => ({ items: String(p).includes('/endpointslices') ? slices : [] }), promRange: async () => [], sourceState: () => ({ state: 'ok' }), state: () => [],
      list: async (_id, kind) => (kind === 'services' ? [service] : []) };
    const sets = { incidents: docs({ i1: inc }), meta: docs({}) }, logs = {};
    const store = { docs: name => (sets[name] ??= docs({})), log: name => (logs[name] ??= (() => { const rows = []; return { list: f => rows.filter(f ?? (() => true)), append: v => { rows.push(v); return v; }, prune: () => 0 }; })()) };
    const hub = createIncidentHub({ store, sources, now: () => clock, user: () => 'tester' });
    assert.equal((await hub.workspace({ cluster: 'c1', id: 'i1' })).chain.conclusion.$t, c.conclusion, `${c.rule}: open`);
    owner = c.well; slices = c.slices?.well ?? []; clock += 10 * 60_000;
    sets.incidents.put('i1', { ...sets.incidents.get('i1'), phase: 'resolved', resolvedAt: clock, recovery: 'service' });
    const done = await hub.workspace({ cluster: 'c1', id: 'i1' });
    assert.ok(done.evidence.length > 1, `${c.rule}: the resolved phase fixed its own pieces`);
    assert.equal(done.chain.conclusion.$t, c.conclusion, `${c.rule}: the cause the open phase proved stays`);
  }
});

test('a_revision_made_after_detection_is_the_fix_and_is_never_offered_for_rollback', async () => {
  const w = await classCase({ rule: 'image-pull', replicasets: [rsOf(2, T0 + 10 * 60_000)], pods: [classPod(waiting('ImagePullBackOff', 'Back-off pulling image "busybox:nope"'))] });
  assert.equal(opt(w, 'rollback'), undefined);
});

/* ---------- 원본 목록에서 감지 → 복구 확인 → 작업면까지(합성 클러스터: UID를 가진 객체, 같은 출처를 감지 목록·근거 읽기가 함께 읽음) ---------- */
const PLURAL = { Pod: 'pods', ReplicaSet: 'replicasets', Deployment: 'deployments', StatefulSet: 'statefulsets', DaemonSet: 'daemonsets', Job: 'jobs', CronJob: 'cronjobs', Node: 'nodes',
  PersistentVolumeClaim: 'persistentvolumeclaims', Service: 'services', EndpointSlice: 'endpointslices', Event: 'events', Ingress: 'ingresses' };
function cluster(start) {
  const w = { objects: start, alerts: [], ratio: null, fail: {}, partial: new Set(), approvals: {} };
  const of = plural => { if (w.fail[plural]) throw w.fail[plural]; return w.objects.filter(o => PLURAL[o.kind] === plural); };
  const sources = {
    alerts: async () => { if (w.fail.alerts) throw w.fail.alerts; return w.alerts; },
    kube: async (_id, p) => {
      const plural = String(p).split('?')[0].split('/').pop();
      if (plural === 'configmaps') return { items: [] };
      return { items: of(plural), metadata: w.partial.has(plural) ? { continue: 'more' } : {} };
    },
    list: async (_id, plural, ns) => of(plural).filter(o => !ns || (o.metadata.namespace ?? '') === ns),
    get: async (_id, kind, ns, name) => w.objects.find(o => o.kind === kind && (o.metadata.namespace ?? '') === (ns ?? '') && o.metadata.name === name) ?? null,
    promRange: async (_id, q) => {
      if (w.promFail && !/status=~/.test(q)) throw w.promFail;
      const ing = /ingress="([^"]+)"/.exec(q)?.[1], ratio = w.ratio != null && typeof w.ratio === 'object' ? w.ratio[ing] : w.ratio, at = w.clock - (w.ratioAge ?? 0);
      if (/nginx_ingress_controller_requests/.test(q) && ratio != null) { const v = /status=~/.test(q) ? ratio : 10; return [{ labels: {}, samples: [{ at: at - 60_000, value: v }, { at, value: v }] }]; }
      return [];
    },
    sourceState: () => ({ state: 'ok' }), state: () => [{ id: 'prometheus', state: 'ok' }],
  };
  const sets = { incidents: docs({}), meta: docs({}), approvals: docs(w.approvals) }, logs = {};
  const store = { docs: name => (sets[name] ??= docs({})), log: name => (logs[name] ??= (() => { const rows = []; return { list: f => rows.filter(f ?? (() => true)), append: v => { rows.push(v); return v; }, prune: () => 0 }; })()) };
  w.clock = T0;
  const hub = createIncidentHub({ store, sources, now: () => w.clock, user: () => 'tester' });
  /* 30초마다 감지 한 번을 n번 */
  const passes = async n => { for (let i = 0; i < n; i++) { w.clock += 30_000; await hub.scan('c1', { force: true }); } };
  return { w, hub, sets, passes, all: () => sets.incidents.all() };
}
const meta = (kind, name, uid, extra = {}) => ({ kind, metadata: { name, namespace: NS, uid, creationTimestamp: iso(T0 - 3_600_000), ...extra } });
const deployment = (uid, containers, extra = {}) => ({ ...meta('Deployment', 'api', uid, { generation: 3 }), spec: { replicas: 1, template: { metadata: { labels: { app: 'api' } }, spec: { containers } } }, status: { readyReplicas: 1 }, ...extra });
const replicaSet = (uid, owner, revision = 1) => meta('ReplicaSet', 'api-7d9', uid, { annotations: { 'deployment.kubernetes.io/revision': String(revision) }, ownerReferences: [{ kind: 'Deployment', name: 'api', uid: owner, controller: true }] });
const runningPod = (name, rs, containerStatuses) => ({ ...meta('Pod', name, `p-${name}`, { labels: { app: 'api' }, ownerReferences: [{ kind: 'ReplicaSet', name: 'api-7d9', uid: rs, controller: true }] }),
  spec: { containers: containerStatuses.map(c => ({ name: c.name })) }, status: { phase: 'Running', containerStatuses } });
const okStatus = name => ({ name, ready: true, restartCount: 0, state: { running: {} } });
const oomStatus = (name, finishedAt) => ({ name, ready: true, restartCount: 2, state: { running: {} }, lastState: { terminated: { reason: 'OOMKilled', exitCode: 137, finishedAt: iso(finishedAt) } } });
const crashStatus = name => ({ name, ready: false, restartCount: 4, state: { waiting: { reason: 'CrashLoopBackOff', message: 'back-off' } }, lastState: { terminated: { reason: 'Error', exitCode: 1, finishedAt: iso(T0) } } });

test('an_oom_of_the_app_container_raises_that_container_limit_not_the_sidecar_that_has_the_first_limit', async () => {
  const sidecar = { name: 'proxy', resources: { limits: { memory: '64Mi' } } }, app = { name: 'app', resources: { limits: { memory: '128Mi' } } };
  const c = cluster([deployment('d1', [sidecar, app]), replicaSet('rs1', 'd1'), runningPod('api-7d9-abc', 'rs1', [okStatus('proxy'), oomStatus('app', T0 - 60_000)])]);
  await c.passes(1);
  const [inc] = c.all();
  assert.deepEqual([inc.rule, inc.target.uid], ['oom-limit', 'd1']);
  const w = await c.hub.workspace({ cluster: 'c1', id: inc.id });
  assert.equal(w.chain.grade, 'confirmed');
  assert.equal(w.chain.conclusion.vars.container, 'app');
  assert.equal(w.chain.conclusion.vars.limit, '128Mi');
  const raise = opt(w, 'raise-memory');
  assert.deepEqual(raise.plan.values, [{ path: 'spec.template.spec.containers[1].resources.limits.memory', before: '128Mi', after: '256Mi' }]);
  const ops = JSON.parse(/-p '(.*)' --context/.exec(raise.plan.command)[1]);
  assert.deepEqual(ops.filter(o => o.op === 'test').map(o => [o.path, o.value]), [['/metadata/uid', 'd1'], ['/metadata/generation', 3], ['/spec/template/spec/containers/1/name', 'app'], ['/spec/template/spec/containers/1/resources/limits/memory', '128Mi']],
    'a newer rollout of the same Deployment (another generation) fails the patch');
  assert.ok(raise.plan.command.endsWith(" --context 'c1'"));
});

test('an_old_oom_or_one_of_another_container_does_not_confirm_a_later_oom_alert', async () => {
  const c = cluster([deployment('d1', [{ name: 'app', resources: { limits: { memory: '128Mi' } } }]), replicaSet('rs1', 'd1'), runningPod('api-7d9-abc', 'rs1', [oomStatus('app', T0 - 3 * 3_600_000)])]);
  c.w.alerts = [{ fingerprint: 'f1', startsAt: iso(T0), status: { state: 'active' }, labels: { alertname: 'ContainerOOMKilled', namespace: NS, pod: 'api-7d9-abc', severity: 'critical' } }];
  await c.passes(1);
  const [inc] = c.all();
  const w = await c.hub.workspace({ cluster: 'c1', id: inc.id });
  assert.equal(w.chain.grade, 'insufficient', 'an OOM three hours before the alert is not this incident');
  assert.equal(opt(w, 'raise-memory'), undefined);
});

test('a_deployment_made_again_under_the_same_name_gets_its_own_incident_and_the_old_one_closes_with_its_subject_gone', async () => {
  const c = cluster([deployment('d-old', [{ name: 'app' }]), replicaSet('rs-old', 'd-old'), runningPod('api-7d9-abc', 'rs-old', [crashStatus('app')])]);
  await c.passes(1);
  const [old] = c.all();
  assert.equal(old.target.uid, 'd-old');
  /* deleted and made again: same names, new UIDs; the new Pod crash-loops too */
  c.w.objects = [deployment('d-new', [{ name: 'app' }], { status: { readyReplicas: 0 } }), replicaSet('rs-new', 'd-new'), runningPod('api-7d9-xyz', 'rs-new', [crashStatus('app')])];
  await c.passes(1);
  const fresh = c.all().find(i => i.id !== old.id);
  assert.ok(fresh, 'the replacement opens its own incident');
  assert.equal(fresh.target.uid, 'd-new');
  assert.ok(!c.sets.incidents.get(old.id).signals.some(s => s.object.name === 'api-7d9-xyz'), 'no signal of the replacement joins the old incident');
  const view = await c.hub.workspace({ cluster: 'c1', id: old.id });
  assert.equal(view.target.uid, 'd-old');
  assert.equal(view.target.replaced, true);
  assert.ok(!view.scope.some(r => r.name === 'api-7d9-xyz'), 'the replacement Pods are not the old incident scope');
  assert.ok(!view.options.some(o => o.plan.route !== 'manual'), 'no write is planned on the replacement');
  /* quiet for the quiet time, then one window: the subject is gone */
  c.w.clock += 11 * 60_000;
  await c.passes(2);
  const done = c.sets.incidents.get(old.id);
  assert.deepEqual([done.phase, done.recovery, !!done.subjectGone], ['resolved', 'symptom', true]);
  const closed = await c.hub.workspace({ cluster: 'c1', id: old.id });
  assert.equal(closed.verify.conditions.find(x => x.id === 'ready').label.$t, 'wake.inc.verify.gone');
  assert.equal(closed.verify.conditions.find(x => x.id === 'ready').state, 'unknown', 'a gone subject is never shown as a passed check');
});

test('an_incident_on_a_replicaset_that_is_later_deleted_closes_instead_of_waiting_forever', async () => {
  const bare = meta('ReplicaSet', 'web-5d', 'rs-bare', { annotations: {} });
  const pod = { ...meta('Pod', 'web-5d-abc', 'p-web', { ownerReferences: [{ kind: 'ReplicaSet', name: 'web-5d', uid: 'rs-bare', controller: true }] }), spec: { containers: [{ name: 'web' }] }, status: { phase: 'Running', containerStatuses: [crashStatus('web')] } };
  const c = cluster([{ ...bare, spec: { replicas: 1 }, status: { readyReplicas: 0 } }, pod]);
  await c.passes(1);
  const [inc] = c.all();
  assert.deepEqual([inc.target.kind, inc.target.name], ['ReplicaSet', 'web-5d']);
  c.w.objects = [];
  c.w.clock += 11 * 60_000;
  await c.passes(3);
  assert.deepEqual([c.sets.incidents.get(inc.id).phase, c.sets.incidents.get(inc.id).recovery], ['resolved', 'symptom']);
});

test('a_forbidden_alert_read_or_a_partial_list_is_a_missed_window_never_a_recovery', async () => {
  const c = cluster([deployment('d1', [{ name: 'app' }]), replicaSet('rs1', 'd1'), runningPod('api-7d9-abc', 'rs1', [okStatus('app')])]);
  c.w.alerts = [{ fingerprint: 'f1', startsAt: iso(T0), status: { state: 'active' }, labels: { alertname: 'KubePodNotReady', namespace: NS, deployment: 'api', severity: 'warning' } }];
  await c.passes(1);
  const [inc] = c.all();
  /* the alert keeps firing but Alertmanager now answers 403: Wake cannot see it, so nothing about it is healthy */
  c.w.fail.alerts = Object.assign(new Error('forbidden'), { status: 403 });
  c.w.clock += 6 * 60_000;
  await c.passes(16);
  let now = c.sets.incidents.get(inc.id);
  assert.equal(now.phase, 'open', 'a firing alert Wake cannot read is not a quiet incident');
  /* the alert clears and the check starts; then Alertmanager answers 403 again: every window is a miss */
  delete c.w.fail.alerts; c.w.alerts = [];
  c.w.clock += 6 * 60_000;
  await c.passes(1);
  assert.equal(c.sets.incidents.get(inc.id).phase, 'mitigated');
  c.w.fail.alerts = Object.assign(new Error('forbidden'), { status: 403 });
  await c.passes(14);
  now = c.sets.incidents.get(inc.id);
  assert.equal(now.phase, 'mitigated');
  assert.ok(now.verify.windows.length >= 11 && now.verify.windows.every(x => x === 'miss'), JSON.stringify(now.verify.windows));
  assert.equal(now.observed.conds['no-signal'], 'unknown');
  /* Alertmanager answers again, but the Deployment list stops at the page cap: its readiness is not observed */
  delete c.w.fail.alerts;
  c.w.partial.add('deployments');
  await c.passes(12);
  now = c.sets.incidents.get(inc.id);
  assert.equal(now.phase, 'mitigated', 'a partial list is not an observation');
  assert.equal(now.observed.conds.ready, 'unknown');
  c.w.partial.clear();
  await c.passes(12);
  now = c.sets.incidents.get(inc.id);
  assert.deepEqual([now.phase, now.recovery], ['resolved', 'service'], 'eleven observed healthy windows in a row resolve it');
  const w = await c.hub.workspace({ cluster: 'c1', id: inc.id });
  assert.ok(w.verify.conditions.every(x => x.state === 'pass'), JSON.stringify(w.verify.conditions.map(x => [x.id, x.state])));
});

test('a_5xx_ratio_still_over_the_slo_fails_the_recovery_check_and_the_shown_check_follows_what_was_read', async () => {
  const svc = { ...meta('Service', 'api', 's1'), spec: { type: 'ClusterIP', selector: { app: 'api' } } };
  const ing = { ...meta('Ingress', 'api', 'i1'), spec: { rules: [{ http: { paths: [{ backend: { service: { name: 'api' } } }] } }] } };
  const c = cluster([deployment('d1', [{ name: 'app' }]), replicaSet('rs1', 'd1'), runningPod('api-7d9-abc', 'rs1', [crashStatus('app')]), svc, ing,
    { ...meta('EndpointSlice', 'api-a', 'e1', { labels: { 'kubernetes.io/service-name': 'api' } }), endpoints: [{ conditions: { ready: true } }] }]);
  c.w.ratio = 30;
  await c.passes(1);
  const [inc] = c.all();
  const open = await c.hub.workspace({ cluster: 'c1', id: inc.id });
  assert.ok(open.impact, 'the 5xx ratio is fixed as evidence');
  /* the Pods recover, users still get 5xx through the ingress */
  c.w.objects = c.w.objects.map(o => (o.kind === 'Pod' ? runningPod('api-7d9-abc', 'rs1', [okStatus('app')]) : o));
  c.w.clock += 11 * 60_000;
  await c.passes(15);
  let now = c.sets.incidents.get(inc.id);
  assert.equal(now.phase, 'mitigated', 'Ready replicas alone are not a recovery while 5xx continues');
  assert.equal(now.observed.conds.ratio, 'fail');
  const w = await c.hub.workspace({ cluster: 'c1', id: inc.id });
  assert.equal(w.verify.conditions.find(x => x.id === 'ratio').state, 'fail');
  assert.equal(w.verify.conditions.find(x => x.id === 'ratio').optional, undefined, 'the 5xx check is required once it is read');
  c.w.ratio = 0;
  await c.passes(12);
  now = c.sets.incidents.get(inc.id);
  assert.deepEqual([now.phase, now.observed.conds.ratio], ['resolved', 'pass']);
});

test('events_of_a_same_name_deployment_never_join_the_evidence_of_a_service_incident', async () => {
  const service = { kind: 'Service', metadata: { name: 'web', namespace: NS, uid: 's1' }, spec: { type: 'ClusterIP', selector: { app: 'web' } } };
  const w = await classCase({ rule: 'no-endpoints', target: { kind: 'Service', name: 'web', namespace: NS, uid: 's1' }, owner: service, services: [service],
    events: [warn('FailedCreate', 'Error creating: pods "web-1" is forbidden: exceeded quota: tiny', { kind: 'Deployment', name: 'web' }),
      warn('FailedToUpdateEndpointSlices', 'Error updating Endpoint Slices for Service pay/web', { kind: 'Service', name: 'web', uid: 's1' }),
      warn('FailedToUpdateEndpointSlices', 'an old Service of the same name', { kind: 'Service', name: 'web', uid: 's0' })] });
  const rows = w.evidence.find(e => e.kind === 'events').result.rows;
  assert.deepEqual(rows.map(r => [r.object, r.message]), [['Service/web', 'Error updating Endpoint Slices for Service pay/web']]);
});

test('a_node_incident_offers_a_cordon_only_while_it_is_open_and_the_node_is_still_unwell', async () => {
  const node = conditions => ({ kind: 'Node', metadata: { name: 'w1', uid: 'n1' }, spec: {}, status: { conditions } });
  const target = { kind: 'Node', name: 'w1', namespace: '', uid: 'n1' };
  const sick = [{ type: 'Ready', status: 'Unknown', reason: 'NodeStatusUnknown', message: 'Kubelet stopped posting node status.', lastTransitionTime: iso(T0) }];
  assert.ok(opt(await classCase({ rule: 'node-not-ready', target, owner: node(sick) }), 'cordon'));
  const resolved = await classCase({ rule: 'node-not-ready', target, owner: node(sick), stored: { phase: 'resolved', resolvedAt: T0 + 30_000, recovery: 'service' } });
  assert.equal(opt(resolved, 'cordon'), undefined, 'a resolved incident offers no cordon');
  const well = await classCase({ rule: 'node-not-ready', target, owner: node([{ type: 'Ready', status: 'True' }]), stored: { phase: 'mitigated' } });
  assert.equal(opt(well, 'cordon'), undefined, 'a node that is Ready again is not cordoned');
});

test('the_chosen_action_comes_from_its_saved_approval_with_the_pr_result_as_its_only_receipt', async () => {
  const plan = { id: 'raise-memory', route: 'pr', values: [{ path: 'x', before: '1', after: '2' }], repo: 'r', path: 'p' };
  const w = await classCase({ rule: 'image-pull', stored: { chosen: 'raise-memory', chosenTitle: 'limits.memory 1 → 2', approvedAt: T0 } });
  assert.deepEqual(w.execution, { approval: null, title: 'limits.memory 1 → 2', decidedAt: T0, decidedBy: null, plan: null, receipts: { pr: null } }, 'no saved approval: no plan, no receipt');
  const inc = { id: 'i1', number: 'INC-0001', cluster: 'c1', key: 'k', target: { kind: 'Deployment', name: 'api', namespace: NS, uid: 'd1' }, rule: 'image-pull', reasons: { X: 1 }, severity: 'warning', alert: null,
    detectedAt: T0, lastSignalAt: T0, phase: 'open', signals: [], chosen: 'raise-memory', approvedAt: T0 };
  const sets = { incidents: docs({ i1: inc }), meta: docs({}), approvals: docs({ a1: { id: 'a1', incident: 'i1', state: 'approved', plan, title: 'mem', decidedAt: T0 + 1, decidedBy: 'tester', prResult: 'github-unconnected' } }) };
  const store = { docs: name => (sets[name] ??= docs({})), log: () => ({ list: () => [], append: v => v, prune: () => 0 }) };
  const sources = { alerts: async () => [], get: async () => dep(), kube: async () => ({ items: [] }), promRange: async () => [], sourceState: () => ({ state: 'ok' }), state: () => [], list: async () => [] };
  const hub = createIncidentHub({ store, sources, now: () => T0 + 60_000, user: () => 'tester' });
  const v = await hub.workspace({ cluster: 'c1', id: 'i1' });
  assert.deepEqual([v.execution.approval, v.execution.plan, v.execution.receipts.pr, v.execution.decidedBy], ['a1', plan, 'github-unconnected', 'tester']);
});

test('a_cronjob_incident_recovers_only_on_a_later_successful_run_and_a_failed_job_removed_by_ttl_is_no_service_recovery', async () => {
  const cron = { ...meta('CronJob', 'nightly', 'cj1'), spec: { schedule: '0 * * * *' } };
  const run = (name, at, ok) => ({ ...meta('Job', name, `j-${name}`, { creationTimestamp: iso(at), ownerReferences: [{ kind: 'CronJob', name: 'nightly', uid: 'cj1', controller: true }] }),
    status: ok ? { succeeded: 1, conditions: [{ type: 'Complete', status: 'True', lastTransitionTime: iso(at + 60_000) }] }
      : { failed: 1, conditions: [{ type: 'Failed', status: 'True', reason: 'BackoffLimitExceeded', message: 'Job has reached the specified backoff limit', lastTransitionTime: iso(at + 60_000) }] } });
  const c = cluster([cron, run('nightly-1', T0 - 2 * 60_000, false)]);
  await c.passes(1);
  const [inc] = c.all();
  assert.deepEqual([inc.target.kind, inc.target.name, inc.target.uid], ['CronJob', 'nightly', 'cj1']);
  c.w.clock += 11 * 60_000;
  await c.passes(14);
  assert.equal(c.sets.incidents.get(inc.id).phase, 'mitigated', 'the newest run still failed: not recovered');
  assert.equal(c.sets.incidents.get(inc.id).observed.conds.ready, 'unknown', 'no run after the failed one yet');
  c.w.objects = [cron, run('nightly-1', T0 - 2 * 60_000, false), run('nightly-2', c.w.clock, true)];
  await c.passes(12);
  assert.deepEqual([c.sets.incidents.get(inc.id).phase, c.sets.incidents.get(inc.id).recovery], ['resolved', 'service']);
  /* a failed Job of its own, later removed by its TTL: nothing ran successfully, so it closes as a symptom recovery */
  const lone = { ...meta('Job', 'once', 'j-once'), status: { failed: 1, conditions: [{ type: 'Failed', status: 'True', reason: 'BackoffLimitExceeded', message: 'Job has reached the specified backoff limit', lastTransitionTime: iso(T0) }] } };
  const d = cluster([lone]);
  await d.passes(1);
  const [job] = d.all();
  d.w.objects = []; d.w.clock += 11 * 60_000;
  await d.passes(3);
  assert.deepEqual([d.sets.incidents.get(job.id).phase, d.sets.incidents.get(job.id).recovery], ['resolved', 'symptom']);
});

test('a_volume_incident_grouped_under_its_workload_still_waits_for_the_claim_to_be_bound', async () => {
  const claim = phase => ({ ...meta('PersistentVolumeClaim', 'data', 'pvc1'), status: { phase } });
  const pod = { ...runningPod('api-7d9-abc', 'rs1', [okStatus('app')]), spec: { containers: [{ name: 'app' }], volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'data' } }] } };
  const event = { kind: 'Event', type: 'Warning', reason: 'ProvisioningFailed', message: 'storageclass.storage.k8s.io "nope" not found', count: 3, involvedObject: { kind: 'PersistentVolumeClaim', namespace: NS, name: 'data', uid: 'pvc1' },
    lastTimestamp: iso(T0), metadata: { name: 'data.1', namespace: NS, uid: 'ev1' } };
  const c = cluster([deployment('d1', [{ name: 'app' }]), replicaSet('rs1', 'd1'), pod, claim('Pending'), event]);
  await c.passes(1);
  const [inc] = c.all();
  assert.deepEqual([inc.rule, inc.target.kind], ['volume', 'Deployment']);
  c.w.objects = c.w.objects.filter(o => o.kind !== 'Event');
  c.w.clock += 11 * 60_000;
  await c.passes(14);
  assert.equal(c.sets.incidents.get(inc.id).phase, 'mitigated', 'a Ready workload with a Pending claim is not recovered');
  assert.equal(c.sets.incidents.get(inc.id).observed.conds.claim, 'fail');
  c.w.objects = c.w.objects.map(o => (o.kind === 'PersistentVolumeClaim' ? claim('Bound') : o));
  await c.passes(12);
  assert.equal(c.sets.incidents.get(inc.id).phase, 'resolved');
});

test('evidence_is_fixed_through_the_disclosure_policy_so_an_unlabelled_credential_in_a_log_line_is_hidden', async () => {
  const opaqueKey = 'Zx81Qm4LpT7vNc2RbY9kWd3HsF6gJ0aE';
  const w = await classCase({ rule: 'crash-loop', pods: [classPod({ phase: 'Running', containerStatuses: [{ name: 'app', ready: false, restartCount: 4, state: { waiting: { reason: 'CrashLoopBackOff', message: 'back-off' } }, lastState: { terminated: { reason: 'Error', exitCode: 1, finishedAt: iso(T0) } } }] })],
    kube: async (_id, p) => (String(p).includes('/log?') ? `${iso(T0)} ERROR upstream rejected ${opaqueKey}\n` : { items: [] }) });
  const logs = w.evidence.find(e => e.kind === 'logs');
  assert.ok(logs, 'the previous log is fixed');
  assert.ok(!JSON.stringify(logs.result).includes(opaqueKey), 'the stored piece never holds the credential');
});

test('a_pass_that_could_not_read_the_events_behind_an_open_incident_keeps_it_open', async () => {
  const c = cluster([deployment('d1', [{ name: 'app' }]), replicaSet('rs1', 'd1'),
    { kind: 'Event', type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container app in pod api-7d9-x9z2k', count: 5, involvedObject: { kind: 'Pod', namespace: NS, name: 'api-7d9-x9z2k', uid: 'p-gone' },
      lastTimestamp: iso(T0), metadata: { name: 'e.1', namespace: NS, uid: 'ev-backoff' } }]);
  await c.passes(1);
  const [inc] = c.all();
  assert.deepEqual([inc.phase, inc.target.kind], ['open', 'Deployment']);
  /* the events read fails while the event is still recent: nothing says the symptom stopped */
  c.w.fail.events = Object.assign(new Error('timeout'), { kind: 'timeout' });
  c.w.clock += 6 * 60_000;
  await c.passes(2);
  assert.equal(c.sets.incidents.get(inc.id).phase, 'open', 'a signal Wake could not read is not a quiet incident');
});

test('the 5xx check runs from the scan even when nobody opened the incident, and a failed read is unknown', async () => {
  const svc = { ...meta('Service', 'api', 's1'), spec: { type: 'ClusterIP', selector: { app: 'api' } } };
  const ing = { ...meta('Ingress', 'api', 'i1'), spec: { rules: [{ http: { paths: [{ backend: { service: { name: 'api' } } }] } }] } };
  const c = cluster([deployment('d1', [{ name: 'app' }]), replicaSet('rs1', 'd1'), runningPod('api-7d9-abc', 'rs1', [crashStatus('app')]), svc, ing,
    { ...meta('EndpointSlice', 'api-a', 'e1', { labels: { 'kubernetes.io/service-name': 'api' } }), endpoints: [{ conditions: { ready: true } }] }]);
  c.w.ratio = 30;
  await c.passes(1);
  const [inc] = c.all();
  c.w.objects = c.w.objects.map(o => (o.kind === 'Pod' ? runningPod('api-7d9-abc', 'rs1', [okStatus('app')]) : o));
  c.w.clock += 11 * 60_000;
  await c.passes(15);
  assert.equal(c.sets.incidents.get(inc.id).phase, 'mitigated', 'users still get 5xx: not recovered, though the workspace was never opened');
  assert.equal(c.sets.incidents.get(inc.id).observed.conds.ratio, 'fail');
  c.w.ratio = null;
  await c.passes(2);
  assert.equal(c.sets.incidents.get(inc.id).observed.conds.ratio, 'unknown', 'no ratio sample is not a healthy ratio');
  c.w.ratio = 0;
  await c.passes(14);
  assert.equal(c.sets.incidents.get(inc.id).phase, 'resolved');
});

test('a pass whose owner lists stopped at the page cap opens nothing, so one workload is never split into Pod and Deployment incidents', async () => {
  const c = cluster([deployment('d1', [{ name: 'app' }]), replicaSet('rs1', 'd1'), runningPod('api-7d9-abc', 'rs1', [crashStatus('app')])]);
  c.w.partial.add('replicasets');
  await c.passes(2);
  assert.deepEqual(c.all(), [], 'the ReplicaSet list is incomplete: the Pod cannot be traced to its Deployment');
  c.w.partial.clear();
  await c.passes(1);
  assert.deepEqual(c.all().map(i => [i.target.kind, i.target.name]), [['Deployment', 'api']]);
});

test('a recovery check whose required conditions change midway starts its healthy run again', async () => {
  const svc = { ...meta('Service', 'api', 's1'), spec: { type: 'ClusterIP', selector: { app: 'api' } } };
  const ing = { ...meta('Ingress', 'api', 'i1'), spec: { rules: [{ http: { paths: [{ backend: { service: { name: 'api' } } }] } }] } };
  const c = cluster([deployment('d1', [{ name: 'app' }]), replicaSet('rs1', 'd1'), runningPod('api-7d9-abc', 'rs1', [crashStatus('app')]), svc,
    { ...meta('EndpointSlice', 'api-a', 'e1', { labels: { 'kubernetes.io/service-name': 'api' } }), endpoints: [{ conditions: { ready: true } }] }]);
  await c.passes(1);
  const [inc] = c.all();
  c.w.objects = c.w.objects.map(o => (o.kind === 'Pod' ? runningPod('api-7d9-abc', 'rs1', [okStatus('app')]) : o));
  c.w.clock += 11 * 60_000;
  await c.passes(8);
  assert.equal(c.sets.incidents.get(inc.id).verify.windows.filter(x => x === 'ok').length >= 7, true);
  /* an Ingress now routes users to it: the 5xx check joins, and the earlier healthy windows did not cover it */
  c.w.objects = [...c.w.objects, ing]; c.w.ratio = 0;
  await c.passes(1);
  assert.equal(c.sets.incidents.get(inc.id).verify.windows.at(-1), 'miss');
  await c.passes(5);
  assert.equal(c.sets.incidents.get(inc.id).phase, 'mitigated', 'the run restarted when the 5xx condition joined');
  await c.passes(8);
  assert.equal(c.sets.incidents.get(inc.id).phase, 'resolved');
});

test('a cronjob never recovers on a run older than the failed one, nor on a succeeded count without Complete', async () => {
  const cron = { ...meta('CronJob', 'nightly', 'cj1'), spec: { schedule: '0 * * * *' } };
  const run = (name, at, status) => ({ ...meta('Job', name, `j-${name}`, { creationTimestamp: iso(at), annotations: { 'batch.kubernetes.io/cronjob-scheduled-timestamp': iso(at) }, ownerReferences: [{ kind: 'CronJob', name: 'nightly', uid: 'cj1', controller: true }] }), status });
  const complete = at => ({ succeeded: 1, conditions: [{ type: 'Complete', status: 'True', lastTransitionTime: iso(at + 60_000) }] });
  const failed = at => ({ failed: 1, conditions: [{ type: 'Failed', status: 'True', reason: 'BackoffLimitExceeded', message: 'Job has reached the specified backoff limit', lastTransitionTime: iso(at + 60_000) }] });
  const yesterday = run('nightly-0', T0 - 24 * 3_600_000, complete(T0 - 24 * 3_600_000));
  const c = cluster([cron, yesterday, run('nightly-1', T0 - 2 * 60_000, failed(T0 - 2 * 60_000))]);
  await c.passes(1);
  const [inc] = c.all();
  /* the failed run is removed by its TTL: only yesterday's success is left */
  c.w.objects = [cron, yesterday];
  c.w.clock += 11 * 60_000;
  await c.passes(14);
  assert.equal(c.sets.incidents.get(inc.id).phase, 'mitigated', "yesterday's success is not a run after the failure");
  /* a later run that has started succeeding pods but is not Complete */
  c.w.objects = [cron, yesterday, run('nightly-2', c.w.clock, { succeeded: 1, active: 1 })];
  await c.passes(13);
  assert.equal(c.sets.incidents.get(inc.id).phase, 'mitigated', 'a succeeded count without Complete=True is partial progress');
  c.w.objects = [cron, yesterday, run('nightly-2', c.w.clock - 13 * 30_000, complete(c.w.clock))];
  await c.passes(13);
  assert.deepEqual([c.sets.incidents.get(inc.id).phase, c.sets.incidents.get(inc.id).recovery], ['resolved', 'service']);
});

test('a volume incident whose claim can no longer be read is not recovered by a ready workload', async () => {
  const pod = { ...runningPod('api-7d9-abc', 'rs1', [okStatus('app')]), spec: { containers: [{ name: 'app' }], volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'data' } }] } };
  const event = { kind: 'Event', type: 'Warning', reason: 'ProvisioningFailed', message: 'storageclass.storage.k8s.io "nope" not found', count: 3, involvedObject: { kind: 'PersistentVolumeClaim', namespace: NS, name: 'data', uid: 'pvc1' },
    lastTimestamp: iso(T0), metadata: { name: 'e.2', namespace: NS, uid: 'ev2' } };
  const c = cluster([deployment('d1', [{ name: 'app' }]), replicaSet('rs1', 'd1'), pod, { ...meta('PersistentVolumeClaim', 'data', 'pvc1'), status: { phase: 'Pending' } }, event]);
  await c.passes(1);
  const [inc] = c.all();
  c.w.objects = c.w.objects.filter(o => o.kind !== 'Event' && o.kind !== 'PersistentVolumeClaim');
  c.w.clock += 11 * 60_000;
  await c.passes(14);
  assert.deepEqual([c.sets.incidents.get(inc.id).phase, c.sets.incidents.get(inc.id).observed.conds.claim], ['mitigated', 'unknown']);
});

test('an oom twenty minutes before an alert, or probe failures another controller reported, prove nothing', async () => {
  const oomPod = classPod({ phase: 'Running', containerStatuses: [{ name: 'app', ready: true, restartCount: 1, state: { running: {} }, lastState: { terminated: { reason: 'OOMKilled', exitCode: 137, finishedAt: iso(T0 - 20 * 60_000) } } }] });
  /* detection sees only the alert (the Pod list read for evidence is the workspace's own read) */
  const alertOnly = await classCase({ rule: 'oom-limit', pods: [oomPod], kube: async () => ({ items: [] }), stored: { signals: [{ id: 'alert:f1', kind: 'alert', reason: 'OOMKilled', at: T0, object: { kind: 'Pod', namespace: NS, name: 'api-7d9-abc' }, message: '' }] } });
  assert.equal(alertOnly.chain.grade, 'insufficient', 'a termination before the incident is not this incident');
  const probes = await classCase({ rule: 'probe-failed', pods: [classPod({ phase: 'Running', containerStatuses: [{ name: 'app', ready: false, restartCount: 0, state: { running: {} } }] })],
    events: [{ ...warn('Unhealthy', 'Readiness probe failed: HTTP probe failed with statuscode: 503', { kind: 'Pod', name: 'api-7d9-abc' }, 6), source: { component: 'mesh-controller' } }] });
  assert.equal(probes.chain.grade, 'insufficient', 'the rule table reads Unhealthy only from the kubelet');
});

test('a node under memory pressure is detected from the node list, offers a cordon while it is unwell, and offers none once recovered', async () => {
  const node = conditions => ({ kind: 'Node', metadata: { name: 'w1', uid: 'n1', creationTimestamp: iso(T0 - 3_600_000) }, spec: {}, status: { conditions } });
  const c = cluster([node([{ type: 'Ready', status: 'True' }, { type: 'MemoryPressure', status: 'True', message: 'kubelet has insufficient memory available', lastTransitionTime: iso(T0) }])]);
  await c.passes(1);
  const [inc] = c.all();
  assert.deepEqual([inc.rule, inc.target.kind, inc.target.uid], ['node-pressure', 'Node', 'n1']);
  const open = await c.hub.workspace({ cluster: 'c1', id: inc.id });
  assert.ok(opt(open, 'cordon'), 'cordon while the pressure stands');
  c.w.objects = [node([{ type: 'Ready', status: 'True' }, { type: 'MemoryPressure', status: 'False' }])];
  c.w.clock += 6 * 60_000;
  await c.passes(13);
  assert.deepEqual([c.sets.incidents.get(inc.id).phase, c.sets.incidents.get(inc.id).recovery], ['resolved', 'service']);
  const done = await c.hub.workspace({ cluster: 'c1', id: inc.id });
  assert.equal(opt(done, 'cordon'), undefined);
  assert.equal(done.chain.conclusion.$t, 'wake.inc.rule.node-pressure.memory', 'the cause the open phase proved stays');
});

test('a helm-managed deployment rolls back as its release, to the previous release Helm resolves, with that caveat noted', async () => {
  const owned = dep({ metadata: { name: 'api', namespace: NS, uid: 'd1', generation: 5, labels: { 'app.kubernetes.io/managed-by': 'Helm' }, annotations: { 'deployment.kubernetes.io/revision': '2', 'meta.helm.sh/release-name': 'api', 'meta.helm.sh/release-namespace': NS } } });
  const w = await classCase({ rule: 'image-pull', owner: owned, pods: [classPod(waiting('ImagePullBackOff', 'Back-off pulling image "busybox:nope"'))], replicasets: [olderRs(1), rsOf(2)] });
  const back = opt(w, 'rollback');
  assert.equal(back.plan.command, "helm rollback 'api' -n 'pay' --kube-context 'c1' --wait", 'not a template patch that would drift from the release');
  assert.ok(back.plan.checks.includes('helm-previous-release'));
  assert.equal(back.note.$t, 'wake.inc.opt.helmPrevious');
  assert.ok(opt(w, 'check'), 'the read-only check stays');
});

/* ---------- round 3 ---------- */
const userPath = (name, ingress = name) => [{ ...meta('Service', name, `s-${name}`), spec: { type: 'ClusterIP', selector: { app: 'api' } } },
  { ...meta('Ingress', ingress, `i-${ingress}`), spec: { rules: [{ http: { paths: [{ backend: { service: { name } } }] } }] } },
  { ...meta('EndpointSlice', `${name}-a`, `e-${name}`, { labels: { 'kubernetes.io/service-name': name } }), endpoints: [{ conditions: { ready: true } }] }];
async function recovering(objects, ratio) {
  const c = cluster([deployment('d1', [{ name: 'app' }]), replicaSet('rs1', 'd1'), runningPod('api-7d9-abc', 'rs1', [crashStatus('app')]), ...objects]);
  c.w.ratio = ratio;
  await c.passes(1);
  const [inc] = c.all();
  c.w.objects = c.w.objects.map(o => (o.kind === 'Pod' ? runningPod('api-7d9-abc', 'rs1', [okStatus('app')]) : o));
  c.w.clock += 11 * 60_000;
  await c.passes(3);
  return { c, inc, now: () => c.sets.incidents.get(inc.id) };
}

test('every user path in scope is checked, and a list Wake may not read keeps the 5xx condition unknown', async () => {
  const two = await recovering([...userPath('api'), ...userPath('api-public')], { api: 0, 'api-public': 30 });
  await two.c.passes(14);
  assert.deepEqual([two.now().phase, two.now().observed.conds.ratio], ['mitigated', 'fail'], 'the second Service path still returns 5xx');
  const denied = await recovering(userPath('api'), 0);
  denied.c.w.fail.ingresses = Object.assign(new Error('forbidden'), { status: 403 });
  await denied.c.passes(14);
  assert.deepEqual([denied.now().phase, denied.now().observed.conds.ratio], ['mitigated', 'unknown'], 'a path known before is not dropped when its list is denied');
});

test('a recovery streak is bound to its user path, and a stale ratio sample is unknown', async () => {
  const r = await recovering(userPath('api'), 0);
  await r.c.passes(6);
  assert.ok(r.now().verify.windows.filter(x => x === 'ok').length >= 5);
  /* the Ingress is replaced by another one with the same Service: a different source */
  r.c.w.objects = r.c.w.objects.filter(o => o.kind !== 'Ingress').concat(userPath('api', 'api-v2')[1]);
  await r.c.passes(1);
  assert.equal(r.now().verify.windows.at(-1), 'miss', 'the streak does not carry over to another path');
  r.c.w.ratioAge = 3 * 60_000;
  await r.c.passes(2);
  assert.equal(r.now().observed.conds.ratio, 'unknown', 'a sample older than one window is not this window');
});

test('a deployment confirmed gone closes at once even while its events are recent', async () => {
  const c = cluster([deployment('d1', [{ name: 'app' }]), replicaSet('rs1', 'd1'), runningPod('api-7d9-abc', 'rs1', [crashStatus('app')])]);
  await c.passes(1);
  const [inc] = c.all();
  c.w.objects = [];
  await c.passes(1);
  assert.deepEqual([c.sets.incidents.get(inc.id).phase, c.sets.incidents.get(inc.id).recovery], ['resolved', 'symptom']);
});

test('a template rollback is offered only while the implicated rollout is the live revision, with every guard, and its preview hides literal credentials', async () => {
  const pod = classPod(waiting('ImagePullBackOff', 'Back-off pulling image "busybox:nope"'));
  const fixed = await classCase({ rule: 'image-pull', owner: dep({}, '3'), pods: [pod], replicasets: [olderRs(1), rsOf(2), rsOf(3, T0 + 10 * 60_000, 'api-fix')] });
  assert.equal(opt(fixed, 'rollback'), undefined, 'revision 3 (the fix) is live: rolling back to 1 would undo it');
  /* the fix restored the first template: Kubernetes reuses that old ReplicaSet and gives it revision 3 */
  const reused = await classCase({ rule: 'image-pull', owner: dep({}, '3'), pods: [pod], replicasets: [rsOf(3, T0 - 30 * 60_000, 'api-old1'), rsOf(2)] });
  assert.equal(opt(reused, 'rollback'), undefined, 'the implicated rollout is the one whose Pods failed (revision 2), not the reused one now live');
  const bare = await classCase({ rule: 'image-pull', owner: { ...dep(), metadata: { name: 'api', namespace: NS, uid: 'd1' } }, pods: [pod], replicasets: [olderRs(1), rsOf(2)] });
  assert.equal(opt(bare, 'rollback'), undefined, 'without generation and revision the patch cannot be guarded');
  const secretRs = { ...olderRs(1), spec: { template: { metadata: { labels: { app: 'api' } }, spec: { containers: [{ name: 'app', image: 'api:1', env: [{ name: 'API_TOKEN', value: 'Zx81Qm4LpT7vNc2RbY9kWd3HsF6gJ0aE' }] }] } } } };
  const w = await classCase({ rule: 'image-pull', pods: [pod], replicasets: [secretRs, rsOf(2)] });
  const back = opt(w, 'rollback');
  assert.ok(back.plan.command.includes('Zx81Qm4LpT7vNc2RbY9kWd3HsF6gJ0aE'), 'the command itself restores the template as it was');
  assert.ok(!back.plan.preview.includes('Zx81Qm4LpT7vNc2RbY9kWd3HsF6gJ0aE'), 'what is shown hides the value');
});

test('a helm rollback is offered only for a well-formed release, quoted, release-wide in its caution and without a ReplicaSet revision in its title', async () => {
  const owned = release => dep({ metadata: { name: 'api', namespace: NS, uid: 'd1', generation: 5, labels: { 'app.kubernetes.io/managed-by': 'Helm' }, annotations: { 'deployment.kubernetes.io/revision': '2', 'meta.helm.sh/release-name': release, 'meta.helm.sh/release-namespace': NS } } });
  const pod = classPod(waiting('ImagePullBackOff', 'Back-off pulling image "busybox:nope"'));
  const bad = await classCase({ rule: 'image-pull', owner: owned('api;touch x'), pods: [pod], replicasets: [olderRs(1), rsOf(2)] });
  assert.equal(opt(bad, 'rollback'), undefined, 'a release name that is not a Helm name is not put in a command');
  const w = await classCase({ rule: 'image-pull', owner: owned('api'), pods: [pod], replicasets: [olderRs(1), rsOf(2)] });
  const back = opt(w, 'rollback');
  assert.equal(back.plan.command, "helm rollback 'api' -n 'pay' --kube-context 'c1' --wait");
  assert.equal(back.title.$t, 'wake.inc.opt.rollbackRelease');
  assert.equal(back.title.vars.revision, undefined);
  const [ko] = await dicts;
  assert.match(ko['wake.inc.opt.helmPrevious'], /릴리스 \{release\} 전체/);
  assert.deepEqual(back.note.vars, { release: 'api' });
});

test('a cronjob recovers on a run scheduled after the failed one even when that failed Job is gone and the run finished before detection', async () => {
  const cron = { ...meta('CronJob', 'nightly', 'cj1'), spec: { schedule: '*/5 * * * *' } };
  const run = (name, at, status) => ({ ...meta('Job', name, `j-${name}`, { creationTimestamp: iso(at), annotations: { 'batch.kubernetes.io/cronjob-scheduled-timestamp': iso(at) }, ownerReferences: [{ kind: 'CronJob', name: 'nightly', uid: 'cj1', controller: true }] }), status });
  const failedAt = T0 - 6 * 60_000;
  const c = cluster([cron, run('nightly-1', failedAt, { failed: 1, conditions: [{ type: 'Failed', status: 'True', reason: 'BackoffLimitExceeded', message: 'Job has reached the specified backoff limit', lastTransitionTime: iso(T0) }] }),
    run('nightly-2', failedAt + 5 * 60_000, { succeeded: 1, conditions: [{ type: 'Complete', status: 'True', lastTransitionTime: iso(failedAt + 5.5 * 60_000) }] })]);
  await c.passes(1);
  const [inc] = c.all();
  c.w.objects = c.w.objects.filter(o => o.metadata.name !== 'nightly-1');
  c.w.clock += 11 * 60_000;
  await c.passes(14);
  assert.deepEqual([c.sets.incidents.get(inc.id).phase, c.sets.incidents.get(inc.id).recovery], ['resolved', 'service']);
});

/* ---------- round 4 ---------- */
test('a Prometheus fallback query that times out leaves the 5xx condition unknown and never stops detection', async () => {
  const r = await recovering(userPath('api'), null);
  /* no ratio sample, and the request-rate fallback times out */
  r.c.w.ratio = null;
  const base = r.c.hub, rejecting = r.c;
  rejecting.w.promFail = Object.assign(new Error('timeout'), { kind: 'timeout' });
  rejecting.w.objects = [...rejecting.w.objects, { kind: 'Node', metadata: { name: 'w9', uid: 'n9', creationTimestamp: iso(T0) }, spec: {},
    status: { conditions: [{ type: 'Ready', status: 'True' }, { type: 'DiskPressure', status: 'True', message: 'kubelet has disk pressure', lastTransitionTime: iso(rejecting.w.clock) }] } }];
  await rejecting.passes(2);
  assert.ok(rejecting.all().some(i => i.target.kind === 'Node' && i.target.name === 'w9'), 'an unrelated Node incident still opens');
  assert.equal(r.now().observed.conds.ratio, 'unknown');
  assert.ok(base);
});

test('an Ingress that sends everything to the Service by its default backend is a user path, and the Service UID binds the streak', async () => {
  const svc = { ...meta('Service', 'api', 's1'), spec: { type: 'ClusterIP', selector: { app: 'api' } } };
  const ing = { ...meta('Ingress', 'api-default', 'i9'), spec: { defaultBackend: { service: { name: 'api' } } } };
  const slice = { ...meta('EndpointSlice', 'api-a', 'e1', { labels: { 'kubernetes.io/service-name': 'api' } }), endpoints: [{ conditions: { ready: true } }] };
  const r = await recovering([svc, ing, slice], 30);
  await r.c.passes(3);
  assert.equal(r.now().observed.conds.ratio, 'fail', 'the default backend path is checked');
  r.c.w.ratio = 0;
  await r.c.passes(4);
  const before = r.now().verify.windows.filter(x => x === 'ok').length;
  assert.ok(before >= 3);
  /* the Service is made again under the same name: another source */
  r.c.w.objects = r.c.w.objects.map(o => (o.kind === 'Service' ? { ...o, metadata: { ...o.metadata, uid: 's2' } } : o));
  await r.c.passes(1);
  assert.equal(r.now().verify.windows.at(-1), 'miss', 'a new Service UID restarts the streak');
});
