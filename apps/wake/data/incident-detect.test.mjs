/* 인시던트 감지 규칙과 수명(data/incident-detect.js): node --test apps/wake/data/incident-detect.test.mjs. 합성 자료는 이 파일 안에만 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signalsOf, detect, ownerChain, stableId, DETECT, classify, SIGNALS, RULES, endpointFacts } from './incident-detect.js';

const MIN = 60_000, NOW = Date.parse('2026-11-15T08:00:00Z');
const iso = ms => new Date(ms).toISOString();
const rs = { kind: 'ReplicaSet', metadata: { name: 'api-7d9', namespace: 'shop', uid: 'rs1', ownerReferences: [{ kind: 'Deployment', name: 'api', controller: true, uid: 'd1' }] } };
const pod = (name, extra = {}) => ({ kind: 'Pod', metadata: { name, namespace: 'shop', uid: `u-${name}`, ownerReferences: [{ kind: 'ReplicaSet', name: 'api-7d9', controller: true }] }, status: { containerStatuses: [] }, ...extra });
const index = new Map([rs, pod('api-7d9-a'), pod('api-7d9-b')].map(o => [`${o.kind}|${o.metadata.namespace}|${o.metadata.name}`, o]));
const lookup = (k, ns, n) => index.get(`${k}|${ns}|${n}`) ?? null;
let counter = 0;
const nextNumber = () => `INC-${String(++counter).padStart(4, '0')}`;

test('ownerReferences lead from a Pod through its ReplicaSet to the Deployment', () => {
  assert.deepEqual(ownerChain({ kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lookup), { kind: 'Deployment', namespace: 'shop', name: 'api', uid: 'd1' });
});

test('an OOMKilled container, a BackOff event and a firing alert of one Deployment become one incident with a stable id', () => {
  counter = 0;
  const oomPod = pod('api-7d9-a', { status: { containerStatuses: [{ name: 'api', restartCount: 3, lastState: { terminated: { reason: 'OOMKilled', exitCode: 137, finishedAt: iso(NOW - 2 * MIN) } }, state: { waiting: { reason: 'CrashLoopBackOff' } } }] } });
  const signals = signalsOf({ now: NOW, lookup, pods: [oomPod],
    events: [{ type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-b' }, lastTimestamp: iso(NOW - MIN), count: 4, metadata: { uid: 'e1' } },
      { type: 'Warning', reason: 'Unhealthy', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-b' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'e2' } }],
    alerts: [{ fingerprint: 'f1', startsAt: iso(NOW - MIN), status: { state: 'active' }, labels: { alertname: 'ContainerOOMKilled', namespace: 'shop', pod: 'api-7d9-a', severity: 'critical' } }] });
  assert.ok(!signals.some(s => s.reason === 'Unhealthy'), 'a Warning reason outside the rule table opens nothing');
  const { incidents, opened } = detect({ cluster: 'c1', signals, now: NOW, nextNumber });
  assert.equal(opened.length, 1);
  const [inc] = incidents;
  assert.deepEqual(inc.target, { kind: 'Deployment', namespace: 'shop', name: 'api', uid: 'd1' });
  assert.equal(inc.rule, 'oom-limit');
  assert.equal(inc.severity, 'critical');
  assert.equal(inc.phase, 'open');
  assert.equal(inc.number, 'INC-0001');
  assert.equal(inc.alert.name, 'ContainerOOMKilled');
  assert.equal(inc.id, stableId(`c1|Deployment|shop|api|d1|${Math.floor(inc.detectedAt / MIN)}`));
  const again = detect({ cluster: 'c1', incidents, signals, now: NOW + 10_000, nextNumber });
  assert.equal(again.opened.length, 0, 'the same signals add no incident');
});

test('lifecycle: quiet after the alert clears is mitigated, enough ok windows resolve it, a new signal while mitigated opens it again', () => {
  counter = 0;
  const first = signalsOf({ now: NOW, lookup, events: [{ type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lastTimestamp: iso(NOW - MIN), count: 2, metadata: { uid: 'e1' } }] });
  let [inc] = detect({ cluster: 'c1', signals: first, now: NOW, nextNumber }).incidents;
  const quiet = NOW + DETECT.active + MIN;
  const stale = first.map(s => ({ ...s, active: false }));
  [inc] = detect({ cluster: 'c1', incidents: [inc], signals: stale, now: quiet, ready: () => true, nextNumber }).incidents;
  assert.equal(inc.phase, 'mitigated');
  let t = quiet;
  for (let i = 0; i < 12 && inc.phase !== 'resolved'; i++) { t += 30_000; [inc] = detect({ cluster: 'c1', incidents: [inc], signals: stale, now: t, ready: () => true, nextNumber }).incidents; }
  assert.equal(inc.phase, 'resolved');
  assert.equal(inc.recovery, 'service');
  assert.deepEqual(detect({ cluster: 'c1', incidents: [inc], signals: stale, now: t + 30_000, ready: () => true, nextNumber }).incidents, [], 'the signals of a resolved incident open nothing new');

  const [m] = detect({ cluster: 'c1', signals: first, now: NOW, nextNumber }).incidents;
  const [mit] = detect({ cluster: 'c1', incidents: [m], signals: stale, now: quiet, ready: () => true, nextNumber }).incidents;
  const back = signalsOf({ now: quiet + MIN, lookup, events: [{ type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lastTimestamp: iso(quiet + MIN), count: 3, metadata: { uid: 'e9' } }] });
  const [re] = detect({ cluster: 'c1', incidents: [mit], signals: back, now: quiet + MIN, ready: () => true, nextNumber }).incidents;
  assert.equal(re.phase, 'open');
  assert.equal(re.id, m.id);
});

test('a window the hub could not read is a miss, never ok; a not-ready workload fails the check and it starts again', () => {
  counter = 0;
  const s = signalsOf({ now: NOW, lookup, events: [{ type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'e1' } }] });
  let [inc] = detect({ cluster: 'c1', signals: s, now: NOW, nextNumber }).incidents;
  const stale = s.map(x => ({ ...x, active: false })), quiet = NOW + DETECT.active + MIN;
  [inc] = detect({ cluster: 'c1', incidents: [inc], signals: stale, now: quiet, ready: () => null, nextNumber }).incidents;
  [inc] = detect({ cluster: 'c1', incidents: [inc], signals: stale, now: quiet + 30_000, ready: () => null, nextNumber }).incidents;
  assert.deepEqual(inc.verify.windows, ['miss']);
  [inc] = detect({ cluster: 'c1', incidents: [inc], signals: stale, now: quiet + 60_000, ready: () => false, nextNumber }).incidents;
  assert.equal(inc.phase, 'mitigated');
  assert.deepEqual(inc.verify.windows, [], 'a failed check starts over');
});

test('a signal of a Pod that is gone (its owner can no longer be read) joins the incident that already holds that Pod', () => {
  counter = 0;
  const live = signalsOf({ now: NOW, lookup, events: [{ type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'e1' } }] });
  const [inc] = detect({ cluster: 'c1', signals: live, now: NOW, nextNumber }).incidents;
  const gone = signalsOf({ now: NOW + MIN, lookup: () => null, alerts: [{ fingerprint: 'f9', startsAt: iso(NOW), status: { state: 'active' }, labels: { alertname: 'PodCrashLoopBackOff', namespace: 'shop', pod: 'api-7d9-a' } }] });
  assert.equal(gone[0].owner.kind, 'Pod');
  const r = detect({ cluster: 'c1', incidents: [inc], signals: gone, now: NOW + MIN, nextNumber });
  assert.equal(r.opened.length, 0);
  assert.equal(r.incidents[0].id, inc.id);
});

test('a kube-state-metrics Job alert signals the Job, not the exporter Pod that scraped it', () => {
  /* R5-01: 알림 화면과 같은 대상(data/alerts.js alertObjects) */
  const [s] = signalsOf({ now: NOW, lookup: () => null, alerts: [{ fingerprint: 'fj', startsAt: iso(NOW - MIN), status: { state: 'active' },
    labels: { alertname: 'KubeJobFailed', namespace: 'orders', job_name: 'ledger-reconcile-29916145', pod: 'kps-kube-state-metrics-654bf57f64-rhlqp', job: 'kube-state-metrics', service: 'kps-kube-state-metrics', container: 'kube-state-metrics' } }] });
  assert.deepEqual(s.object, { kind: 'Job', namespace: 'orders', name: 'ledger-reconcile-29916145' });
});

/* ---------- 흔한 장애 종류 전부(F-BE-018 표): 신호 → 규칙·원인 → 소유 워크로드 ---------- */
const at = iso(NOW - MIN);
const ev = (reason, message, object, extra = {}) => ({ type: 'Warning', reason, message, involvedObject: { namespace: 'shop', ...object }, lastTimestamp: at, count: 1, metadata: { uid: `e-${reason}-${object.name}-${message.length}` }, ...extra });
const onPod = { kind: 'Pod', name: 'api-7d9-a' };
const waitingPod = (reason, message, extra = {}) => pod('api-7d9-a', { status: { startTime: at, containerStatuses: [{ name: 'api', ready: false, restartCount: 0, state: { waiting: { reason, message } } }] }, ...extra });
const one = (input, n = 1) => { const s = signalsOf({ now: NOW, lookup, ...input }); assert.equal(s.length, n, JSON.stringify(s.map(x => x.reason))); return s[0]; };

test('classify: the rule table alone names the rule and the cause, reading the message only where the reason is shared', () => {
  assert.deepEqual(classify('BackOff', 'Back-off pulling image "busybox:nope"'), { rule: 'image-pull', severity: 'warning', cause: null });
  assert.equal(classify('BackOff', 'Back-off restarting failed container api in pod api-7d9-a').rule, 'crash-loop');
  assert.equal(classify('Failed', 'Error: configmap "app-cfg" not found').rule, 'container-config');
  assert.equal(classify('Failed', 'Failed to pull image "busybox:nope": not found').rule, 'image-pull');
  assert.equal(classify('Failed', 'Error: something else'), null, 'a Failed event the table does not name opens nothing');
  assert.equal(classify('InvalidImageName', 'Failed to apply default image tag "Bad//Name": invalid reference format').cause, 'name');
  assert.equal(classify('ErrImagePull', 'failed to resolve reference "docker.io/library/busybox:nope": not found').cause, 'notfound');
  assert.equal(classify('ErrImagePull', 'pull access denied, repository does not exist or may require authorization').cause, 'access');
  assert.equal(classify('CreateContainerConfigError', 'couldn\'t find key missing in ConfigMap shop/app-cfg').cause, 'key');
  assert.equal(classify('CreateContainerConfigError', 'secret "db" not found').cause, 'secret');
  assert.equal(classify('FailedMount', 'MountVolume.SetUp failed for volume "cfg" : configmap "nope" not found').rule, 'container-config');
  assert.equal(classify('FailedMount', 'Unable to attach or mount volumes: timed out waiting for the condition').rule, 'volume');
  assert.equal(classify('Unhealthy', 'Liveness probe failed: HTTP probe failed with statuscode: 500').cause, 'liveness');
  assert.equal(classify('Unhealthy', 'Readiness probe failed: dial tcp 10.0.0.1:80: connect: connection refused').cause, 'readiness');
  const cp = '1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }';
  const sched = m => classify('FailedScheduling', `0/3 nodes are available: ${m}. preemption: 0/3 nodes are available: 3 Preemption is not helpful for scheduling.`).cause;
  assert.equal(sched(`${cp}, 2 Insufficient cpu`), 'resources', 'the control-plane taint every kind cluster reports is not the cause');
  assert.equal(sched(`${cp}, 2 node(s) had untolerated taint {dedicated: db}`), 'taint');
  assert.equal(sched(`${cp}, 2 node(s) didn't match Pod's node affinity/selector`), 'affinity');
  assert.equal(sched('pod has unbound immediate PersistentVolumeClaims'), 'pvc');
  assert.equal(classify('Evicted', 'Pod ephemeral local storage usage exceeds the total limit of containers 10Mi.').cause, 'limit');
  assert.equal(classify('Evicted', 'The node was low on resource: memory. Threshold quantity: 100Mi').cause, 'node');
  assert.equal(classify('FailedCreate', 'Error creating: pods "api-7d9-x" is forbidden: exceeded quota: tiny, requested: pods=1, used: pods=1, limited: pods=1').cause, 'quota');
  assert.equal(classify('FailedCreate', 'Error creating: admission webhook "deny.example.com" denied the request: no').cause, 'admission');
  assert.equal(classify('FailedCreate', 'Error creating: pods "x" is forbidden: ValidatingAdmissionPolicy \'deny-pods\' with binding \'deny-pods\' denied request: no').cause, 'admission');
  assert.equal(classify('ProgressDeadlineExceeded', 'ReplicaSet "api-7d9" has timed out progressing.').rule, 'rollout-stuck');
  assert.equal(classify('BackoffLimitExceeded', 'Job has reached the specified backoff limit').cause, 'backoff');
  assert.equal(classify('DeadlineExceeded', 'Job was active longer than specified deadline').cause, 'deadline');
  assert.equal(classify('DiskPressure', '').rule, 'node-pressure');
  for (const rule of new Set(Object.values(SIGNALS).flatMap(s => [s.rule, ...(s.by ?? []).map(b => b[1])]).filter(Boolean))) assert.ok(RULES[rule], `rule ${rule} has a version`);
});

test('image pull: a waiting container and the pull events of a Deployment open one image-pull incident on the Deployment', () => {
  counter = 0;
  const signals = signalsOf({ now: NOW, lookup, pods: [waitingPod('ImagePullBackOff', 'Back-off pulling image "busybox:nope"')],
    events: [ev('BackOff', 'Back-off pulling image "busybox:nope"', onPod), ev('Failed', 'Error: ErrImagePull', onPod)] });
  assert.equal(signals.length, 3);
  assert.ok(signals.every(s => s.rule === 'image-pull' && s.owner.name === 'api'));
  const { incidents } = detect({ cluster: 'c1', signals, now: NOW, nextNumber });
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].rule, 'image-pull');
  assert.equal(incidents[0].severity, 'critical');
});

test('container config: a missing ConfigMap key in a waiting container is a container-config signal on its Deployment', () => {
  const s = one({ pods: [waitingPod('CreateContainerConfigError', 'couldn\'t find key missing in ConfigMap shop/app-cfg')] });
  assert.equal(s.rule, 'container-config');
  assert.equal(s.cause, 'key');
  assert.equal(s.owner.name, 'api');
});

test('probe failures open only after the table minimum, split into liveness and readiness', () => {
  assert.equal(signalsOf({ now: NOW, lookup, events: [ev('Unhealthy', 'Readiness probe failed: 503', onPod, { count: 2 })] }).length, 0, 'two failures are a blip');
  const s = one({ events: [ev('Unhealthy', 'Liveness probe failed: 500', onPod, { count: 3 })] });
  assert.equal(s.rule, 'probe-failed');
  assert.equal(s.cause, 'liveness');
});

test('unschedulable: a Pod held by the scheduler signals from its PodScheduled condition too, with the cause read from the message', () => {
  const pending = pod('api-7d9-a', { status: { phase: 'Pending', conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable', lastTransitionTime: at,
    message: '0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 Insufficient memory. preemption: 0/3 nodes are available: 3 No preemption victims found for incoming pod.' }] } });
  const s = one({ pods: [pending] });
  assert.equal(s.rule, 'unschedulable');
  assert.equal(s.cause, 'resources');
  assert.equal(s.active, true);
  assert.equal(s.owner.name, 'api');
});

test('volume: a PVC event joins the workload whose Pod mounts the claim, and the provisioning failure outranks the scheduling symptom', () => {
  counter = 0;
  const mounting = pod('api-7d9-a', { spec: { volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'data' } }] }, status: { phase: 'Pending' } });
  const signals = signalsOf({ now: NOW, lookup, pods: [mounting], events: [ev('FailedScheduling', '0/3 nodes are available: pod has unbound immediate PersistentVolumeClaims.', onPod, { lastTimestamp: iso(NOW - 2 * MIN) }),
    ev('ProvisioningFailed', 'storageclass.storage.k8s.io "nope" not found', { kind: 'PersistentVolumeClaim', name: 'data' })] });
  assert.equal(signals.find(s => s.reason === 'ProvisioningFailed').owner.name, 'api');
  const { incidents } = detect({ cluster: 'c1', signals, now: NOW, nextNumber });
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].rule, 'volume');
});

test('eviction: an Evicted Pod opens on its workload; node pressure and a NotReady node open on the Node', () => {
  const evicted = pod('api-7d9-a', { status: { phase: 'Failed', reason: 'Evicted', message: 'Pod ephemeral local storage usage exceeds the total limit of containers 10Mi.', startTime: iso(NOW - 5 * MIN),
    conditions: [{ type: 'DisruptionTarget', status: 'True', reason: 'TerminationByKubelet', lastTransitionTime: at }] } });
  const e = one({ pods: [evicted] });
  assert.deepEqual([e.rule, e.cause, e.owner.name, e.at], ['evicted', 'limit', 'api', NOW - MIN]);
  const node = (conditions) => ({ kind: 'Node', metadata: { name: 'w1', uid: 'n1' }, status: { conditions } });
  const p = one({ nodes: [node([{ type: 'Ready', status: 'True' }, { type: 'DiskPressure', status: 'True', reason: 'KubeletHasDiskPressure', message: 'kubelet has disk pressure', lastTransitionTime: at }])] });
  assert.deepEqual([p.rule, p.cause, p.owner.kind, p.owner.name, p.active], ['node-pressure', 'disk', 'Node', 'w1', true]);
  const down = one({ nodes: [node([{ type: 'Ready', status: 'Unknown', reason: 'NodeStatusUnknown', message: 'Kubelet stopped posting node status.', lastTransitionTime: at }])] });
  assert.deepEqual([down.rule, down.cause, down.severity, down.owner.kind], ['node-not-ready', 'unreachable', 'critical', 'Node']);
  assert.equal(signalsOf({ now: NOW, lookup, nodes: [node([{ type: 'Ready', status: 'True' }, { type: 'DiskPressure', status: 'False' }])] }).length, 0);
});

test('job failed and rollout stuck: workload conditions are signals; an image pull of the same Deployment names the cause', () => {
  const job = { kind: 'Job', metadata: { name: 'nightly', namespace: 'shop', uid: 'j1' }, status: { failed: 1, conditions: [{ type: 'Failed', status: 'True', reason: 'BackoffLimitExceeded', message: 'Job has reached the specified backoff limit', lastTransitionTime: at }] } };
  const j = one({ workloads: [job] });
  assert.deepEqual([j.rule, j.cause, j.owner.kind, j.owner.name], ['job-failed', 'backoff', 'Job', 'nightly']);
  const dep = { kind: 'Deployment', metadata: { name: 'api', namespace: 'shop', uid: 'd1' }, status: { conditions: [{ type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded', message: 'ReplicaSet "api-7d9" has timed out progressing.', lastTransitionTime: at }] } };
  const r = one({ workloads: [dep] });
  assert.deepEqual([r.rule, r.owner.kind, r.owner.name, r.active], ['rollout-stuck', 'Deployment', 'api', true]);
  counter = 0;
  const signals = signalsOf({ now: NOW, lookup, workloads: [dep], pods: [waitingPod('ImagePullBackOff', 'Back-off pulling image "busybox:nope"')] });
  const { incidents } = detect({ cluster: 'c1', signals, now: NOW, nextNumber });
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].rule, 'image-pull', 'the stuck rollout is the symptom, the pull failure the cause');
});

test('create denied: FailedCreate of a ReplicaSet and a Deployment ReplicaFailure condition open on the Deployment, split into quota and admission', () => {
  const q = one({ events: [ev('FailedCreate', 'Error creating: pods "api-7d9-x" is forbidden: exceeded quota: tiny, requested: cpu=1, used: cpu=0, limited: cpu=100m', { kind: 'ReplicaSet', name: 'api-7d9' })] });
  assert.deepEqual([q.rule, q.cause, q.owner.kind, q.owner.name], ['create-denied', 'quota', 'Deployment', 'api']);
  const dep = { kind: 'Deployment', metadata: { name: 'api', namespace: 'shop', uid: 'd1' }, status: { conditions: [{ type: 'ReplicaFailure', status: 'True', reason: 'FailedCreate', message: 'admission webhook "deny.example.com" denied the request: no', lastTransitionTime: at }] } };
  const a = one({ workloads: [dep] });
  assert.deepEqual([a.rule, a.cause], ['create-denied', 'admission']);
});

test('known alert names map onto the same rules', () => {
  const alert = name => ({ fingerprint: name, startsAt: at, status: { state: 'active' }, labels: { alertname: name, namespace: 'shop', deployment: 'api' } });
  assert.equal(one({ alerts: [alert('KubeDeploymentRolloutStuck')] }).rule, 'rollout-stuck');
  assert.equal(one({ alerts: [alert('KubePodNotReady')] }).rule, 'alert', 'an alert without one clear cause stays an alert');
});

test('a static Pod probe failure joins its Node incident (cluster scoped, no namespace) and the NotReady node names the rule', () => {
  counter = 0;
  const node = { kind: 'Node', metadata: { name: 'cp', uid: 'n0' }, status: { conditions: [{ type: 'Ready', status: 'False', reason: 'KubeletNotReady', message: 'container runtime network not ready', lastTransitionTime: iso(NOW - 3 * MIN) }] } };
  const mirror = { kind: 'Pod', metadata: { name: 'kube-apiserver-cp', namespace: 'kube-system', uid: 'm1', ownerReferences: [{ kind: 'Node', name: 'cp', controller: true, uid: 'n0' }] }, status: {} };
  const look = (k, ns, n) => (k === 'Pod' && n === 'kube-apiserver-cp' ? mirror : null);
  const signals = signalsOf({ now: NOW, lookup: look, nodes: [node],
    events: [{ type: 'Warning', reason: 'Unhealthy', message: 'Readiness probe failed: 500', count: 4, involvedObject: { kind: 'Pod', namespace: 'kube-system', name: 'kube-apiserver-cp' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'eu' } }] });
  assert.ok(signals.every(s => s.owner.kind === 'Node' && s.owner.namespace === ''));
  const { incidents } = detect({ cluster: 'c1', signals, now: NOW, nextNumber });
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].rule, 'node-not-ready');
});

test('an event of a Pod a rollout already deleted joins the Deployment through the ReplicaSet its name carries', () => {
  const [s] = signalsOf({ now: NOW, lookup, events: [{ type: 'Warning', reason: 'Failed', message: 'Error: ErrImagePull', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-zz9x2' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'eg' } }] });
  assert.deepEqual([s.owner.kind, s.owner.name], ['Deployment', 'api']);
});

test('a pass whose owner lists could not be read opens no incident but still feeds the open ones', () => {
  counter = 0;
  const s = signalsOf({ now: NOW, lookup, events: [{ type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'e1' } }] });
  assert.deepEqual(detect({ cluster: 'c1', signals: s, now: NOW, nextNumber, openNew: false }).opened, []);
  const [inc] = detect({ cluster: 'c1', signals: s, now: NOW, nextNumber }).incidents;
  const more = signalsOf({ now: NOW + MIN, lookup, events: [{ type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-b' }, lastTimestamp: iso(NOW), metadata: { uid: 'e2' } }] });
  const r = detect({ cluster: 'c1', incidents: [inc], signals: more, now: NOW + MIN, nextNumber, openNew: false });
  assert.equal(r.incidents[0].signals.length, 2);
});

/* 준비된 endpoint 없는 Service: Service 선택자, 그 EndpointSlice, 선택자에 맞는 Pod·워크로드 템플릿 */
const svc = (extra = {}) => ({ kind: 'Service', metadata: { name: 'web', namespace: 'shop', uid: 's1', creationTimestamp: iso(NOW - 60 * MIN) }, spec: { type: 'ClusterIP', clusterIP: '10.0.0.9', selector: { app: 'web' } }, ...extra });
const slice = (endpoints, changed = NOW - 5 * MIN) => ({ kind: 'EndpointSlice', metadata: { name: 'web-abc', namespace: 'shop', labels: { 'kubernetes.io/service-name': 'web' }, annotations: { 'endpoints.kubernetes.io/last-change-trigger-time': iso(changed) } }, endpoints });
const webPod = (ready, extra = {}) => pod('api-7d9-a', { metadata: { ...pod('api-7d9-a').metadata, labels: { app: 'web' } }, status: { phase: 'Running', conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }] }, ...extra });
const webDep = replicas => ({ kind: 'Deployment', metadata: { name: 'api', namespace: 'shop', uid: 'd1' }, spec: { replicas, template: { metadata: { labels: { app: 'web' } } } }, status: {} });
const notReadyEp = { addresses: ['10.1.0.4'], conditions: { ready: false }, targetRef: { kind: 'Pod', name: 'api-7d9-a' } };

test('no ready endpoints: matching Pods that are not ready join their workload, the cause read from the endpoint facts', () => {
  const facts = endpointFacts(svc(), { slices: [slice([notReadyEp])], pods: [webPod(false)], workloads: [webDep(1)] });
  assert.equal(facts.length, 1);
  assert.equal(classify(facts[0].reason, facts[0].message).cause, 'notready');
  assert.equal(facts[0].selector, 'app=web');
  const s = one({ services: [svc()], slices: [slice([notReadyEp])], pods: [webPod(false)], workloads: [webDep(1)] });
  assert.deepEqual([s.rule, s.cause, s.severity, s.object.kind, s.object.name, s.owner.kind, s.owner.name, s.at], ['no-endpoints', 'notready', 'critical', 'Service', 'web', 'Deployment', 'api', NOW - 5 * MIN]);
  assert.equal(signalsOf({ now: NOW, lookup, services: [svc()], slices: [slice([{ ...notReadyEp, conditions: { ready: true } }])], pods: [webPod(true)] }).length, 0, 'one ready endpoint is enough');
  assert.equal(signalsOf({ now: NOW, lookup, services: [svc()], slices: [slice([{ ...notReadyEp, conditions: {} }])], pods: [webPod(true)] }).length, 0, 'an unset ready condition reads as ready (EndpointSlice API)');
});

test('no ready endpoints: a selector nothing carries opens on the Service; a workload that wants Pods but has none opens on the workload', () => {
  const lonely = one({ services: [svc()], slices: [slice([])], pods: [], workloads: [] });
  assert.deepEqual([lonely.rule, lonely.cause, lonely.owner.kind, lonely.owner.name], ['no-endpoints', 'selector', 'Service', 'web']);
  const none = one({ services: [svc()], slices: [], pods: [], workloads: [webDep(2)] });
  assert.deepEqual([none.cause, none.owner.kind, none.owner.name, none.at], ['nopods', 'Deployment', 'api', NOW - 60 * MIN], 'no slice yet: the Service creation is the start');
});

test('no ready endpoints is not a signal for a Service without selector, ExternalName, a workload scaled to zero, finished Pods or a fresh change', () => {
  const quiet = input => assert.equal(signalsOf({ now: NOW, lookup, slices: [], pods: [], workloads: [], ...input }).length, 0, JSON.stringify(Object.keys(input)));
  quiet({ services: [svc({ spec: { type: 'ClusterIP', clusterIP: '10.0.0.9' } })] });
  quiet({ services: [svc({ spec: { type: 'ClusterIP', clusterIP: '10.0.0.9', selector: {} } })] });
  quiet({ services: [svc({ spec: { type: 'ExternalName', externalName: 'db.example.com', selector: { app: 'web' } } })] });
  quiet({ services: [svc({ spec: { clusterIP: 'None', selector: { app: 'web' } } })], workloads: [webDep(0)] });
  quiet({ services: [svc()], workloads: [webDep(0)] });
  quiet({ services: [svc()], pods: [webPod(false, { status: { phase: 'Succeeded' } })] });
  quiet({ services: [svc()], slices: [slice([notReadyEp], NOW - 30_000)], pods: [webPod(false)] });
  assert.equal(endpointFacts(svc({ spec: { clusterIP: 'None', selector: { app: 'web' } } }), { slices: [], pods: [], workloads: [] })[0].message.includes('app=web'), true, 'a headless Service whose selector matches nothing still signals');
});

test('a not ready Service signal is a symptom: the probe failure of the same Deployment names the incident', () => {
  counter = 0;
  const signals = signalsOf({ now: NOW, lookup, services: [svc()], slices: [slice([notReadyEp])], pods: [webPod(false)], workloads: [webDep(1)], events: [ev('Unhealthy', 'Readiness probe failed: 503', onPod, { count: 5 })] });
  const { incidents } = detect({ cluster: 'c1', signals, now: NOW, nextNumber });
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].rule, 'probe-failed');
  const alone = detect({ cluster: 'c1', signals: signals.filter(s => s.reason === 'NoReadyEndpoints'), now: NOW, nextNumber }).incidents;
  assert.equal(alone[0].rule, 'no-endpoints');
});

test('the NodeNotReady events node-controller leaves on each Pod of a node join that Node, not the Pod workloads', () => {
  const onNode = { ...pod('api-7d9-a'), spec: { nodeName: 'w2' } };
  const look = (k, ns, n) => (k === 'Pod' && n === 'api-7d9-a' ? onNode : lookup(k, ns, n));
  const [s] = signalsOf({ now: NOW, lookup: look, events: [{ type: 'Warning', reason: 'NodeNotReady', message: 'Node is not ready', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'nn' } }] });
  assert.deepEqual([s.owner.kind, s.owner.name, s.rule], ['Node', 'w2', 'node-not-ready']);
});

/* 같은 이름으로 다시 만든 대상(UID가 다름): 옛 인시던트를 잇지 않는다 */
test('a Deployment deleted and made again under the same name opens its own incident, and the old one closes as a symptom recovery with its subject gone', () => {
  counter = 0;
  const rsOf = (uid, owner) => ({ kind: 'ReplicaSet', metadata: { name: 'api-7d9', namespace: 'shop', uid, ownerReferences: [{ kind: 'Deployment', name: 'api', controller: true, uid: owner }] } });
  const podOf = (name, rs, status) => ({ kind: 'Pod', metadata: { name, namespace: 'shop', uid: `u-${name}`, ownerReferences: [{ kind: 'ReplicaSet', name: 'api-7d9', controller: true, uid: rs }] }, status });
  const oom = { containerStatuses: [{ name: 'api', restartCount: 2, lastState: { terminated: { reason: 'OOMKilled', exitCode: 137, finishedAt: iso(NOW - MIN) } } }] };
  const crash = { containerStatuses: [{ name: 'api', restartCount: 3, state: { waiting: { reason: 'CrashLoopBackOff', message: 'back-off' } }, lastState: { terminated: { reason: 'Error', finishedAt: iso(NOW + 9 * MIN) } } }] };
  const look = objects => { const m = new Map(objects.map(o => [`${o.kind}|${o.metadata.namespace}|${o.metadata.name}`, o])); return (k, ns, n) => m.get(`${k}|${ns}|${n}`) ?? null; };
  const before = [rsOf('rs-old', 'd-old'), podOf('api-7d9-a', 'rs-old', oom)];
  const [old] = detect({ cluster: 'c1', signals: signalsOf({ now: NOW, lookup: look(before), pods: [before[1]] }), now: NOW, nextNumber }).incidents;
  assert.equal(old.target.uid, 'd-old');
  /* made again: the new ReplicaSet carries the same name (same template), its Pod crash-loops; the old Pod is still terminating */
  const after = [rsOf('rs-new', 'd-new'), podOf('api-7d9-c', 'rs-new', crash), podOf('api-7d9-a', 'rs-old', oom)];
  const signals = signalsOf({ now: NOW + 10 * MIN, lookup: look(after), pods: after.slice(1) });
  assert.deepEqual(signals.find(s => s.object.name === 'api-7d9-a').owner, { kind: 'ReplicaSet', namespace: 'shop', name: 'api-7d9', uid: 'rs-old' }, 'the old Pod never climbs into the replacement ReplicaSet');
  const r = detect({ cluster: 'c1', incidents: [old], signals, now: NOW + 10 * MIN, nextNumber });
  assert.equal(r.opened.length, 1, 'the replacement opens its own incident');
  const fresh = r.incidents.find(i => i.id !== old.id);
  assert.equal(fresh.target.uid, 'd-new');
  assert.notEqual(fresh.id, old.id);
  assert.ok(!(r.incidents.find(i => i.id === old.id)?.signals ?? old.signals).some(s => s.object.name === 'api-7d9-c'), 'the replacement signals never join the old incident');
  /* later: the old incident is quiet and its subject is gone */
  const quiet = NOW + 30 * MIN;
  let [o] = detect({ cluster: 'c1', incidents: [old], signals: [], now: quiet, ready: () => 'gone', nextNumber }).incidents;
  assert.equal(o.phase, 'mitigated');
  [o] = detect({ cluster: 'c1', incidents: [o], signals: [], now: quiet + 30_000, ready: () => 'gone', nextNumber }).incidents;
  assert.deepEqual([o.phase, o.recovery, o.subjectGone], ['resolved', 'symptom', quiet + 30_000], 'a gone subject is never a service recovery');
});

test('a reason is a signal only from the object kind and reporter that use it, and only where the message names the failure', () => {
  const backOff = (object, extra = {}) => signalsOf({ now: NOW, lookup, events: [ev('BackOff', 'Back-off restarting failed container api in pod api-7d9-a', object, extra)] });
  assert.equal(backOff(onPod).length, 1);
  assert.equal(backOff({ kind: 'HelmRelease', name: 'api' }).length, 0, 'another controller reusing the BackOff reason is not a crash loop');
  assert.equal(backOff(onPod, { source: { component: 'flux-helm-controller' } }).length, 0);
  assert.equal(backOff(onPod, { source: { component: 'kubelet', host: 'w1' } }).length, 1);
  assert.equal(classify('BackOff', 'Back-off 10s waiting for the next reconcile'), null, 'a BackOff that names neither a restart nor a pull opens nothing');
  const alert = name => ({ fingerprint: name, startsAt: at, status: { state: 'active' }, labels: { alertname: name, namespace: 'shop', deployment: 'api' } });
  assert.equal(one({ alerts: [alert('KubeDeploymentGenerationMismatch')] }).rule, 'alert', 'a generation lag is not a stuck rollout');
  assert.equal(classify('FailedScheduling', '0/1 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }. preemption: 0/1 nodes are available: 1 Preemption is not helpful for scheduling.').cause, null,
    'the control-plane taint is never the cause, even alone');
  assert.equal(classify('CreateContainerConfigError', 'failed to sync secret cache: timed out waiting for the condition').cause, null, 'a message that names no missing object or key has no cause');
  assert.equal(classify('CreateContainerConfigError', 'configmap "app-cfg" not found').cause, 'configmap');
});

test('an init container killed for memory is an oom signal of its workload', () => {
  const p = pod('api-7d9-a', { status: { initContainerStatuses: [{ name: 'migrate', restartCount: 2, lastState: { terminated: { reason: 'OOMKilled', exitCode: 137, finishedAt: iso(NOW - MIN) } } }], containerStatuses: [] } });
  const s = one({ pods: [p] });
  assert.deepEqual([s.rule, s.object.container, s.owner.name], ['oom-limit', 'migrate', 'api']);
});

test('a static Pod event names the static UID its mirror Pod carries in an annotation, so it still joins the Node', () => {
  const mirror = { kind: 'Pod', metadata: { name: 'kube-scheduler-cp', namespace: 'kube-system', uid: 'mirror-uid', annotations: { 'kubernetes.io/config.mirror': 'static-hash' }, ownerReferences: [{ kind: 'Node', name: 'cp', controller: true, uid: 'n0' }] }, status: {} };
  const look = (k, ns, n) => (k === 'Pod' && n === 'kube-scheduler-cp' ? mirror : null);
  const [s] = signalsOf({ now: NOW, lookup: look, events: [{ type: 'Warning', reason: 'Unhealthy', message: 'Liveness probe failed: 500', count: 4, involvedObject: { kind: 'Pod', namespace: 'kube-system', name: 'kube-scheduler-cp', uid: 'static-hash' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'es' } }] });
  assert.deepEqual([s.owner.kind, s.owner.name], ['Node', 'cp']);
});

test('an alert that keeps its fingerprint across a replacement follows the new UID instead of pinning the old incident', () => {
  counter = 0;
  const alert = { fingerprint: 'fa', startsAt: iso(NOW - 2 * MIN), status: { state: 'active' }, labels: { alertname: 'KubePodNotReady', namespace: 'shop', pod: 'api-7d9-c' } };
  const looks = (dep, rsUid) => { const rsx = { kind: 'ReplicaSet', metadata: { name: 'api-7d9', namespace: 'shop', uid: rsUid, ownerReferences: [{ kind: 'Deployment', name: 'api', controller: true, uid: dep }] } };
    const p = { kind: 'Pod', metadata: { name: 'api-7d9-c', namespace: 'shop', uid: `p-${dep}`, ownerReferences: [{ kind: 'ReplicaSet', name: 'api-7d9', controller: true, uid: rsUid }] }, status: {} };
    return (k, ns, n) => (k === 'ReplicaSet' && n === 'api-7d9' ? rsx : k === 'Pod' && n === 'api-7d9-c' ? p : null); };
  const [old] = detect({ cluster: 'c1', signals: signalsOf({ now: NOW, lookup: looks('d-old', 'rs-old'), alerts: [alert] }), now: NOW, nextNumber }).incidents;
  assert.equal(old.target.uid, 'd-old');
  const later = signalsOf({ now: NOW + MIN, lookup: looks('d-new', 'rs-new'), alerts: [alert] });
  const r = detect({ cluster: 'c1', incidents: [old], signals: later, now: NOW + MIN, nextNumber });
  assert.equal(r.opened.length, 1, 'the replacement gets its own incident');
  assert.equal(r.incidents.find(i => i.id !== old.id).target.uid, 'd-new');
});

test('the recovery check needs five real minutes of healthy windows, not eleven windows read faster than the cadence', () => {
  counter = 0;
  const s = signalsOf({ now: NOW, lookup, events: [{ type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'e1' } }] });
  let [inc] = detect({ cluster: 'c1', signals: s, now: NOW, nextNumber }).incidents;
  const stale = s.map(x => ({ ...x, active: false }));
  let t = NOW + DETECT.active + MIN;
  [inc] = detect({ cluster: 'c1', incidents: [inc], signals: stale, now: t, ready: () => true, nextNumber }).incidents;
  for (let i = 0; i < 11; i++) { t += 24_000; [inc] = detect({ cluster: 'c1', incidents: [inc], signals: stale, now: t, ready: () => true, nextNumber }).incidents; }
  assert.equal(inc.verify.windows.length, 11);
  assert.equal(inc.phase, 'mitigated', 'eleven windows 24 s apart span four minutes');
  for (let i = 0; i < 3 && inc.phase !== 'resolved'; i++) { t += 24_000; [inc] = detect({ cluster: 'c1', incidents: [inc], signals: stale, now: t, ready: () => true, nextNumber }).incidents; }
  assert.equal(inc.phase, 'resolved', 'it passes once the healthy run spans 300 s');
});

/* ---------- round 3 ---------- */
test('a Deployment-labelled alert resolves the Deployment UID, so a same-name replacement opens its own incident', () => {
  counter = 0;
  const alert = { fingerprint: 'fd', startsAt: iso(NOW - 2 * MIN), status: { state: 'active' }, labels: { alertname: 'KubeDeploymentReplicasMismatch', namespace: 'shop', deployment: 'api' } };
  const depOf = uid => (k, ns, n) => (k === 'Deployment' && n === 'api' ? { kind: 'Deployment', metadata: { name: 'api', namespace: 'shop', uid } } : null);
  const [old] = detect({ cluster: 'c1', signals: signalsOf({ now: NOW, lookup: depOf('d-old'), alerts: [alert] }), now: NOW, nextNumber }).incidents;
  assert.equal(old.target.uid, 'd-old');
  const r = detect({ cluster: 'c1', incidents: [old], signals: signalsOf({ now: NOW + MIN, lookup: depOf('d-new'), alerts: [alert] }), now: NOW + MIN, nextNumber });
  assert.deepEqual(r.incidents.filter(i => i.id !== old.id).map(i => i.target.uid), ['d-new']);
});

test('an incident opened on a Pod is promoted to the owner once the chain resolves, instead of a second incident', () => {
  counter = 0;
  const ev1 = { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a', uid: 'u-api-7d9-a' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'e1' } };
  const [onPod] = detect({ cluster: 'c1', signals: signalsOf({ now: NOW, lookup: () => null, events: [ev1] }), now: NOW, nextNumber }).incidents;
  assert.equal(onPod.target.kind, 'Pod');
  const ev2 = { ...ev1, metadata: { uid: 'e2' }, lastTimestamp: iso(NOW) };
  const r = detect({ cluster: 'c1', incidents: [onPod], signals: signalsOf({ now: NOW + MIN, lookup, events: [ev1, ev2] }), now: NOW + MIN, nextNumber });
  assert.deepEqual(r.opened, [], 'no second incident for the owner');
  const promoted = r.incidents.find(i => i.id === onPod.id);
  assert.deepEqual([promoted.target.kind, promoted.target.name], ['Deployment', 'api']);
  assert.equal(promoted.signals.length, 2);
});

test('a subject confirmed gone closes even while its last signals are still recent', () => {
  counter = 0;
  const s = signalsOf({ now: NOW, lookup, events: [{ type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'e1' } }] });
  const [inc] = detect({ cluster: 'c1', signals: s, now: NOW, nextNumber }).incidents;
  const [after] = detect({ cluster: 'c1', incidents: [inc], signals: s, now: NOW + MIN, nextNumber, gone: () => true }).incidents;
  assert.deepEqual([after.phase, after.recovery, !!after.subjectGone], ['resolved', 'symptom', true]);
});

test('a recovery streak stored without read times starts again', () => {
  counter = 0;
  const s = signalsOf({ now: NOW, lookup, events: [{ type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'e1' } }] });
  let [inc] = detect({ cluster: 'c1', signals: s, now: NOW, nextNumber }).incidents;
  const t = NOW + DETECT.active + 10 * MIN;
  inc = { ...inc, phase: 'mitigated', mitigatedAt: t - 6 * MIN, verify: { windows: Array(10).fill('ok'), verifyFrom: t - 6 * MIN, lastWindowAt: t - 30_000 } };
  [inc] = detect({ cluster: 'c1', incidents: [inc], signals: s.map(x => ({ ...x, active: false })), now: t, ready: () => true, nextNumber }).incidents;
  assert.equal(inc.phase, 'mitigated');
  assert.deepEqual(inc.verify.windows, ['ok'], 'a legacy streak without read times is not trusted');
});

test('a failed Job signal keeps the Job UID and its scheduled time', () => {
  const job = { kind: 'Job', metadata: { name: 'nightly-1', namespace: 'shop', uid: 'j1', creationTimestamp: iso(NOW - 3 * MIN), annotations: { 'batch.kubernetes.io/cronjob-scheduled-timestamp': iso(NOW - 3 * MIN) } },
    status: { failed: 1, conditions: [{ type: 'Failed', status: 'True', reason: 'BackoffLimitExceeded', message: 'Job has reached the specified backoff limit', lastTransitionTime: at }] } };
  const s = one({ workloads: [job] });
  assert.deepEqual([s.object.uid, s.object.scheduledAt], ['j1', NOW - 3 * MIN]);
});
