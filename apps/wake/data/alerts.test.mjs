import assert from 'node:assert/strict';
import test from 'node:test';
import { alertList, alertsIn, alertCounts, alertSteps, sameAlert, targetOf, thresholdOf, durationMs, forText, labelKey } from './alerts.js';
import * as alerts from './alerts.js';

const T = Date.parse('2026-11-02T01:00:00Z'), iso = ms => new Date(ms).toISOString(), MIN = 60_000;

test('alertList_default_order_uses_time_before_state_and_identity_for_ties', () => {
  const alertmanager = [{ labels: { alertname: 'Old' }, startsAt: iso(T - MIN), fingerprint: 'old' }];
  const history = ['b', 'a'].map(fingerprint => ({ fingerprint, labels: { alertname: fingerprint }, startsAt: iso(T), endsAt: iso(T + MIN) }));
  const rows = alertList({ alertmanager, history });
  assert.deepEqual(rows.map(row => row.name), ['a', 'b', 'Old']);
});
const rules = { status: 'success', data: { groups: [{ name: 'g', file: '/rules/a.yaml', rules: [
  { type: 'alerting', name: 'PodCrash', query: 'x >= 1', duration: 900, labels: { severity: 'warning' }, annotations: { summary: 'crash' },
    alerts: [{ labels: { namespace: 'app', pod: 'p-1' }, state: 'firing', activeAt: iso(T - 30 * MIN), value: '1' }, { labels: { namespace: 'app', pod: 'p-2' }, state: 'pending', activeAt: iso(T - 5 * MIN), value: '1' }] },
  { type: 'recording', name: 'job:x', query: 'sum(x)' },
] }] } };
const am = [{ fingerprint: 'abc', labels: { alertname: 'PodCrash', severity: 'warning', namespace: 'app', pod: 'p-1' }, annotations: { summary: 'from am' }, startsAt: iso(T - 30 * MIN), status: { state: 'active', silencedBy: ['s1'], inhibitedBy: [] }, receivers: [{ name: 'slack' }] },
  { fingerprint: 'only-am', labels: { alertname: 'External', severity: 'critical', namespace: 'edge' }, annotations: {}, startsAt: iso(T - 10 * MIN), status: { state: 'active', silencedBy: [] }, receivers: [] }];
const history = [{ fingerprint: 'abc', labels: { alertname: 'PodCrash', severity: 'warning', namespace: 'app', pod: 'p-1' }, annotations: { summary: 'old' }, startsAt: iso(T - 3 * 24 * 60 * MIN), endsAt: iso(T - 3 * 24 * 60 * MIN + 20 * MIN) }];

test('alert_states_come_from_prometheus_rules_alertmanager_and_the_kept_history', () => {
  const rows = alertList({ rules, alertmanager: am, history });
  assert.deepEqual(rows.map(r => [r.name, r.state, r.target]), [['PodCrash', 'pending', 'app/p-2'], ['External', 'firing', 'edge'], ['PodCrash', 'firing', 'app/p-1'], ['PodCrash', 'resolved', 'app/p-1']]);
  const fire = rows.find(r => r.state === 'firing' && r.name === 'PodCrash');
  assert.equal(fire.id, 'abc', 'the Alertmanager fingerprint names a firing alert');
  assert.equal(fire.silenced, true); assert.deepEqual(fire.receivers, ['slack']);
  assert.equal(fire.rule.expr, 'x >= 1'); assert.equal(fire.rule.for, '15m');
  assert.equal(fire.summary, 'from am');
  assert.notEqual(rows.find(r => r.state === 'resolved').id, 'abc', 'a past alert keeps its own id beside the firing one');
});

test('a_down_source_never_reads_as_a_current_state', () => {
  const rows = alertList({ rules, alertmanager: am, history, stale: { prometheus: true } });
  assert.ok(rows.filter(r => r.name === 'PodCrash' && r.state !== 'resolved').every(r => r.state === null), 'Prometheus states are blank');
  assert.equal(rows.find(r => r.name === 'External').state, 'firing', 'Alertmanager still current');
  assert.equal(alertList({ alertmanager: am, stale: { alertmanager: true } }).find(r => r.name === 'External').state, null);
});

test('alerts_link_the_incident_opened_for_the_same_alert_name_namespace_and_time', () => {
  const incidents = [{ id: 'inc-1', number: 'INC-1', alert: 'PodCrash', ns: 'app', at: T - 25 * MIN }, { id: 'inc-2', number: 'INC-2', alert: 'PodCrash', ns: 'other', at: T - 30 * MIN }];
  const rows = alertList({ rules, history, incidents });
  assert.equal(rows.find(r => r.state === 'firing').incident.number, 'INC-1');
  assert.equal(rows.find(r => r.state === 'resolved').incident, null, 'a past alert three days earlier is not that incident');
});

test('counts_window_steps_and_history_read_the_same_rows', () => {
  const rows = alertList({ rules, alertmanager: am, history });
  const week = alertsIn(rows, { from: T - 7 * 24 * 60 * MIN, to: T }), hour = alertsIn(rows, { from: T - 60 * MIN, to: T });
  assert.equal(week.length, 4); assert.equal(hour.length, 3, 'a firing alert stays in every window, a past one only in its own');
  const c = alertCounts(week);
  assert.deepEqual([c.all, c.firing, c.pending, c.resolved, c.bySeverity.critical, c.bySeverity.warning], [4, 2, 1, 1, 1, 1]);
  assert.equal(c.oldest, T - 30 * MIN);
  const fire = rows.find(r => r.id === 'abc');
  assert.deepEqual(alertSteps(fire).map(s => s.state), ['pending', 'firing']);
  assert.equal(alertSteps(fire)[0].at, T - 45 * MIN, 'pending begins one for-duration before firing');
  assert.equal(sameAlert(rows, fire).length, 2);
});

test('rule_fields_read_as_prometheus_writes_them', () => {
  assert.deepEqual(thresholdOf('rate(x[5m]) > 0.01'), { op: '>', value: 0.01 });
  assert.deepEqual(thresholdOf('a - time() < 14 * 86400'), { op: '<', value: 14 * 86400 });
  assert.equal(thresholdOf('up'), null);
  assert.equal(durationMs('1h30m'), 90 * MIN); assert.equal(durationMs(''), null);
  assert.deepEqual([forText(600), forText(3600), forText(90), forText(0)], ['10m', '1h', '90s', '']);
  assert.equal(targetOf({ namespace: 'a', deployment: 'd' }), 'a/d'); assert.equal(targetOf({ instance: 'n1' }), 'n1'); assert.equal(targetOf({ namespace: 'a' }), 'a');
  assert.equal(labelKey({ b: 1, a: 2 }), 'a=2,b=1');
});

test('an alert Alertmanager holds with the external labels added is the same row as its rule alert, and the Watchdog heartbeat is not listed', () => {
  const rules = { data: { groups: [{ name: 'g', rules: [
    { type: 'alerting', name: 'Watchdog', labels: { severity: 'none' }, alerts: [{ state: 'firing', activeAt: '2026-11-15T04:06:00Z', labels: {} }] },
    { type: 'alerting', name: 'NodeSystemSaturation', labels: { severity: 'warning' }, alerts: [{ state: 'pending', activeAt: '2026-11-15T15:23:00Z', labels: { instance: 'n1' } }] }] }] } };
  const alertmanager = [
    { labels: { alertname: 'Watchdog', severity: 'none', prometheus: 'monitoring/kps-prometheus' }, startsAt: '2026-11-15T04:06:00Z', fingerprint: 'w1' },
    { labels: { alertname: 'NodeSystemSaturation', severity: 'warning', instance: 'n1', prometheus: 'monitoring/kps-prometheus' }, startsAt: '2026-11-15T15:23:00Z', fingerprint: 'n1', annotations: { summary: 'load' } }];
  const rows = alertList({ rules, alertmanager });
  assert.deepEqual(rows.map(r => r.name), ['NodeSystemSaturation']);
  assert.equal(rows[0].id, 'n1');
  assert.equal(rows[0].summary, 'load');
});

/* R5-01: kube-state-metrics 시계열의 pod·service·container는 수집 대상(exporter)의 것: 대상은 알림이 말하는 객체(실제 wake-lab KubeJobFailed 라벨) */
const KSM = { severity: 'warning', condition: 'true', container: 'kube-state-metrics', endpoint: 'http', instance: '10.244.2.4:8080', job: 'kube-state-metrics', namespace: 'orders', pod: 'kps-kube-state-metrics-654bf57f64-rhlqp', service: 'kps-kube-state-metrics' };
test('alert_target_is_the_object_the_alert_is_about_not_the_scrape_target_pod', () => {
  const rows = alertList({ alertmanager: ['ledger-reconcile-29916145', 'ledger-reconcile-29916150', 'ledger-reconcile-29916155'].map((job, i) => ({ fingerprint: `j${i}`, startsAt: iso(T - MIN),
    labels: { alertname: 'KubeJobFailed', ...KSM, job_name: job }, status: { state: 'active', silencedBy: [] }, receivers: [] })) });
  assert.deepEqual(rows.map(r => r.target).sort(), ['orders/ledger-reconcile-29916145', 'orders/ledger-reconcile-29916150', 'orders/ledger-reconcile-29916155']);
  assert.deepEqual(alerts.alertSubject?.({ alertname: 'KubeJobFailed', ...KSM, job_name: 'ledger-reconcile-29916145' }), { label: 'job_name', kind: 'Job', plural: 'jobs', namespace: 'orders', name: 'ledger-reconcile-29916145' });
  /* honor_labels가 꺼져 객체 라벨이 exported_*로 온 것 */
  assert.equal(targetOf({ alertname: 'KubePodCrashLooping', namespace: 'monitoring', pod: 'kps-kube-state-metrics-654bf57f64-rhlqp', exported_namespace: 'payments', exported_pod: 'checkout-api-58cbf4fb5f-pgbhx', job: 'kube-state-metrics' }), 'payments/checkout-api-58cbf4fb5f-pgbhx');
  /* kube_pod_* 시계열(honor_labels): pod는 객체의 Pod */
  assert.equal(targetOf({ alertname: 'KubePodCrashLooping', ...KSM, namespace: 'payments', pod: 'checkout-api-58cbf4fb5f-pgbhx', container: 'checkout-api' }), 'payments/checkout-api-58cbf4fb5f-pgbhx');
  /* 객체 라벨이 Deployment뿐인 kube-state-metrics 알림: exporter Pod가 아니라 Deployment */
  assert.equal(targetOf({ alertname: 'KubeDeploymentReplicasMismatch', ...KSM, namespace: 'payments', deployment: 'checkout-api' }), 'payments/checkout-api');
  /* Node 알림은 Node 이름, namespace만 남는 알림은 namespace */
  assert.equal(targetOf({ alertname: 'KubeNodeNotReady', ...KSM, namespace: 'monitoring', node: 'wake-lab-worker' }), 'wake-lab-worker');
  assert.equal(targetOf({ alertname: 'KubeQuotaAlmostFull', ...KSM, resourcequota: 'q' }), 'orders');
  /* 앱이 내보낸 지표의 Pod(수집 대상이 곧 객체)는 그대로 */
  assert.equal(targetOf({ alertname: 'HighErrorRate', namespace: 'payments', pod: 'checkout-api-58cbf4fb5f-pgbhx', service: 'checkout-api', job: 'checkout-api' }), 'payments/checkout-api-58cbf4fb5f-pgbhx');
  /* 컨트롤러 라벨과 그 컨트롤러의 Pod가 함께 오면 Pod(더 좁은 것) */
  assert.equal(targetOf({ alertname: 'X', namespace: 'payments', deployment: 'checkout-api', pod: 'checkout-api-58cbf4fb5f-pgbhx' }), 'payments/checkout-api-58cbf4fb5f-pgbhx');
});
