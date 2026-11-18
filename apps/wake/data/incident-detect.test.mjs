/* 인시던트 감지 규칙과 수명(data/incident-detect.js): node --test apps/wake/data/incident-detect.test.mjs. 합성 자료는 이 파일 안에만 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signalsOf, detect, ownerChain, stableId, DETECT } from './incident-detect.js';

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
    events: [{ type: 'Warning', reason: 'BackOff', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-b' }, lastTimestamp: iso(NOW - MIN), count: 4, metadata: { uid: 'e1' } },
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
  assert.equal(inc.id, stableId(`c1|Deployment|shop|api|${Math.floor(inc.detectedAt / MIN)}`));
  const again = detect({ cluster: 'c1', incidents, signals, now: NOW + 10_000, nextNumber });
  assert.equal(again.opened.length, 0, 'the same signals add no incident');
});

test('lifecycle: quiet after the alert clears is mitigated, enough ok windows resolve it, a new signal while mitigated opens it again', () => {
  counter = 0;
  const first = signalsOf({ now: NOW, lookup, events: [{ type: 'Warning', reason: 'BackOff', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lastTimestamp: iso(NOW - MIN), count: 2, metadata: { uid: 'e1' } }] });
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
  const back = signalsOf({ now: quiet + MIN, lookup, events: [{ type: 'Warning', reason: 'BackOff', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lastTimestamp: iso(quiet + MIN), count: 3, metadata: { uid: 'e9' } }] });
  const [re] = detect({ cluster: 'c1', incidents: [mit], signals: back, now: quiet + MIN, ready: () => true, nextNumber }).incidents;
  assert.equal(re.phase, 'open');
  assert.equal(re.id, m.id);
});

test('a window the hub could not read is a miss, never ok; a not-ready workload fails the check and it starts again', () => {
  counter = 0;
  const s = signalsOf({ now: NOW, lookup, events: [{ type: 'Warning', reason: 'BackOff', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'e1' } }] });
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
  const live = signalsOf({ now: NOW, lookup, events: [{ type: 'Warning', reason: 'BackOff', involvedObject: { kind: 'Pod', namespace: 'shop', name: 'api-7d9-a' }, lastTimestamp: iso(NOW - MIN), metadata: { uid: 'e1' } }] });
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
