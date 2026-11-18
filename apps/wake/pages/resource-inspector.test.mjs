import test from 'node:test';
import assert from 'node:assert/strict';
import { replicaSetPods, cronJobRuns, claimConsumers, hpaMetricRows, scaleTarget, controllerOwner } from './resource-inspector.js';
import { rowOf } from '../data/kinds.js';

test('replicaSetPods_and_claimConsumers_order_problems_before_the_limit', () => {
  const row = { uid: 'rs1', ns: 'a', name: 'rs' };
  const pods = Array.from({ length: 51 }, (_, index) => ({ uid: String(index), ns: 'a', name: `pod-${index}`, status: [index === 50 ? 'danger' : 'ok'], claims: ['rs'], ownerReferences: [{ kind: 'ReplicaSet', name: 'rs', uid: 'rs1', apiVersion: 'apps/v1', controller: true }] }));
  for (const result of [replicaSetPods(row, pods), claimConsumers(row, pods)]) {
    assert.equal(result.items[0].name, 'pod-50');
    assert.equal(result.items.length, 50);
    assert.equal(result.total, 51);
  }
});

const ref = (kind, name, uid) => [{ kind, name, uid, apiVersion: kind === 'ReplicaSet' ? 'apps/v1' : kind === 'CronJob' ? 'batch/v1' : 'v1', controller: true }];
test('ReplicaSet groups only Pods with the same namespace and controller UID', () => {
  const rs = { uid: 'rs1', ns: 'a', name: 'rs' };
  const pods = [{ name: 'p1', ns: 'a', ownerReferences: ref('ReplicaSet', 'rs', 'rs1') }, { name: 'p2', ns: 'a', ownerReferences: ref('ReplicaSet', 'rs', 'other') },
    { name: 'p3', ns: 'b', ownerReferences: ref('ReplicaSet', 'rs', 'rs1') }, { name: 'p4', ns: 'a', ownerReferences: [] }];
  assert.deepEqual(replicaSetPods(rs, pods).items.map(p => p.name), ['p1']);
  assert.equal(controllerOwner({ ownerReferences: ref('Deployment', 'd', 'd1') }).name, 'd');
});
test('CronJob runs are filtered by controller UID, newest first and bounded', () => {
  const cron = { uid: 'c1', ns: 'a', name: 'c' };
  const jobs = [{ name: 'old', ns: 'a', startTime: '2026-01-01T00:00:00Z', ownerReferences: ref('CronJob', 'c', 'c1') }, { name: 'new', ns: 'a', startTime: '2026-02-01T00:00:00Z', ownerReferences: ref('CronJob', 'c', 'c1') },
    { name: 'same-name', ns: 'a', ownerReferences: ref('CronJob', 'c', 'c2') }];
  assert.deepEqual(cronJobRuns(cron, jobs).items.map(j => j.name), ['new', 'old']);
  const many = Array.from({ length: 80 }, (_, i) => ({ name: 'j' + i, ns: 'a', ownerReferences: ref('CronJob', 'c', 'c1') }));
  assert.deepEqual([cronJobRuns(cron, many).items.length, cronJobRuns(cron, many).total], [50, 80]);
});
test('PVC consumers are read from Pod volume claim names', () => {
  const pod = rowOf('pods', { metadata: { name: 'p', namespace: 'a', uid: 'u' }, spec: { volumes: [{ name: 'v', persistentVolumeClaim: { claimName: 'data' } }, { name: 'e', emptyDir: {} }] } }, 0);
  assert.deepEqual(pod.claims, ['data']);
  assert.equal(claimConsumers({ ns: 'a', name: 'data' }, [pod]).items.length, 1);
  assert.equal(claimConsumers({ ns: 'b', name: 'data' }, [pod]).items.length, 0);
});
test('HPA metrics match spec and currentMetrics, missing current stays null', () => {
  const raw = { spec: { scaleTargetRef: { kind: 'Deployment', name: 'web', apiVersion: 'apps/v1' }, metrics: [
    { type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 70 } } },
    { type: 'Resource', resource: { name: 'memory', target: { averageValue: '200Mi' } } }] },
  status: { currentMetrics: [{ type: 'Resource', resource: { name: 'cpu', current: { averageUtilization: 12 } } }] } };
  assert.deepEqual(hpaMetricRows(raw).map(m => [m.metric, m.current, m.target]), [['cpu', '12%', '70%'], ['memory', null, '200Mi']]);
  assert.deepEqual(scaleTarget(raw), { kind: 'Deployment', name: 'web', plural: 'deployments' });
  assert.equal(scaleTarget({ spec: { scaleTargetRef: { kind: 'Custom', name: 'x' } } }).plural, null);
});

/* A3-11: the CronJob summary said "Suspend False" and its configuration "false": one value, one notation (kubectl get's True/False); and the closed
   configuration card named nothing but itself: its head carries the settings that matter */
test('cronjob_configuration_writes_true_false_like_the_summary_and_names_its_key_settings_in_its_head', async () => {
  const { inspectorConfiguration } = await import('./resource-inspector.js');
  const raw = { spec: { schedule: '*/5 * * * *', suspend: false, concurrencyPolicy: 'Forbid', successfulJobsHistoryLimit: 3, failedJobsHistoryLimit: 3 } };
  let head = null, body = null;
  const card = (id, label, items, b) => { head = items; body = b; return 'card'; };
  const C = { propertyGrid: { render: p => JSON.stringify(p.items) } };
  inspectorConfiguration('cronjobs', { C, t: k => k, raw, card });
  assert.match(body, /"id":"suspend","label":"wake\.inspector\.config\.suspend","value":"False"/, 'False, as the summary writes it');
  assert.deepEqual(head.map(i => [i.label, i.value]), [['wake.inspector.config.concurrencyPolicy', 'Forbid'], ['wake.inspector.config.successfulJobsHistoryLimit', 3], ['wake.inspector.config.failedJobsHistoryLimit', 3]]);
});
