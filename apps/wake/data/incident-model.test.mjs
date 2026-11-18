/* 인시던트 파생 값: node --test apps/wake/data/incident-model.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLO_DEFAULT, VERIFY_DEFAULT, burnRate, impactFromSeries, batchRunOf, userImpact, eventSummary, verifyCounts, causeStatus,
  verifyVerdict, recoveryKind, recoveryTone, nextShare, deadlineCheck, figureWindow, freshness, linksOf,
} from './incident-model.js';

const MIN = 60_000, H = 60 * MIN, STEP = 15_000;
const T0 = Date.parse('2026-11-09T01:47:20Z'); /* the alert */
const iso = at => new Date(at).toISOString();
/* a checkout 5xx ratio range query: 0.3% baseline, 3.1% from 9 minutes before the alert until the fix 20 minutes after */
const FROM = T0 - 9 * MIN, FIX = T0 + 20 * MIN;
const ratioSeries = (start, end, fix = FIX) => { const out = []; for (let at = start; at <= end; at += STEP) out.push({ at, value: at > FROM && at < fix ? 3.1 : 0.3 }); return out; };
const ratio = ratioSeries(T0 - H, T0 + 30 * MIN);

test('burn rate: the ratio over the budget of the SLO', () => {
  assert.equal(SLO_DEFAULT, 99.9);
  assert.equal(Math.round(burnRate(3.1) * 10) / 10, 31);
  assert.equal(burnRate(1, 99), 1);
  assert.equal(burnRate(null), null);
  assert.equal(burnRate(1, 100), null);
});

test('impactFromSeries: one series gives mean, now, peak and failed requests', () => {
  const x = impactFromSeries({ ratio, rps: 420, from: FROM, to: T0 + 5 * MIN });
  assert.equal(x.now, 3.1);
  assert.equal(x.peak, 3.1);
  assert.ok(x.peakAt > FROM && x.peakAt <= T0 + 5 * MIN);
  assert.equal(x.mean, 3.1);
  assert.equal(x.requests, 420 * 14 * 60);
  assert.equal(x.failed, Math.round(420 * 14 * 60 * 0.031));
  assert.equal(x.symptomTo, T0 + 5 * MIN);
  assert.ok(x.budgetUsed > 0);
});

test('impactFromSeries: every burn names its window (N7)', () => {
  const to = T0 + 30 * MIN, x = impactFromSeries({ ratio, rps: [{ at: T0 - H, value: 420 }], from: FROM, to, fixAt: FIX });
  assert.deepEqual(x.burns.map(b => b.id), ['1h', 'incident', 'peak']);
  for (const b of x.burns) { assert.ok(Number.isFinite(b.from) && Number.isFinite(b.to) && b.from < b.to, b.id); assert.ok(b.value > 0); }
  assert.deepEqual([x.burns[0].from, x.burns[0].to], [to - H, to]);
  assert.deepEqual([x.burns[1].from, x.burns[1].to], [FROM, to]);
  assert.equal(x.burns[2].to - x.burns[2].from, 5 * MIN);
  assert.equal(x.burns[2].value, 31);
  assert.equal(x.symptomTo, FIX);
  assert.equal(x.now, 0.3);
});

test('impactFromSeries: gaps are spread over the window; nothing collected is null', () => {
  const gappy = ratio.map((s, i) => (i % 2 ? { ...s, value: null } : s));
  const x = impactFromSeries({ ratio: gappy, rps: 100, from: FROM, to: T0 });
  assert.equal(x.requests, 100 * 9 * 60);
  assert.equal(impactFromSeries({ ratio: [], rps: 100, from: FROM, to: T0 }), null);
  const unknownRps = impactFromSeries({ ratio, rps: [], from: FROM, to: T0 });
  assert.equal(unknownRps.failed, null);
  assert.equal(unknownRps.budgetUsed, null);
});

/* the reports-batch CronJob: the run due at DUE was Pending (no Node), resumed after the fix and completed */
const DUE = T0 - 735_000;
const job = (name, sched, status) => ({ apiVersion: 'batch/v1', kind: 'Job', metadata: { name, namespace: 'reports', creationTimestamp: iso(sched + 1000),
  annotations: { 'batch.kubernetes.io/cronjob-scheduled-timestamp': iso(sched) }, ownerReferences: [{ kind: 'CronJob', name: 'reports-batch' }] }, status });
const complete = at => ({ type: 'Complete', status: 'True', lastTransitionTime: iso(at) });
const earlier = [0, 1, 2].map(k => job(`reports-batch-${k}`, DUE - (k + 1) * 30 * MIN, { startTime: iso(DUE - (k + 1) * 30 * MIN + 2000), completionTime: iso(DUE - (k + 1) * 30 * MIN + 2000 + 240_000), succeeded: 1, conditions: [complete(DUE - (k + 1) * 30 * MIN + 242_000)] }));
const RESUME = T0 + 6 * MIN;
const pod = (jobName, startedAt, terminated) => ({ kind: 'Pod', metadata: { name: `${jobName}-k9x7t`, namespace: 'reports', labels: { 'job-name': jobName } },
  status: { containerStatuses: [{ name: 'reports', state: terminated ? { terminated: { startedAt: iso(startedAt), exitCode: 0 } } : startedAt ? { running: { startedAt: iso(startedAt) } } : { waiting: {} } }] } });

test('batchRunOf: a Pending run has not resumed although its Job has a startTime', () => {
  const held = job('reports-batch-now', DUE, { startTime: iso(DUE + 1000), active: 1, ready: 0 });
  const r = batchRunOf({ due: DUE, jobs: [...earlier, held], pods: [pod('reports-batch-now', null)], deadline: DUE + 30 * MIN, policy: 'Replace', now: T0 });
  assert.equal(r.job, 'reports-batch-now');
  assert.equal(r.resumed, null);
  assert.equal(r.complete, false);
  assert.equal(r.waited, T0 - DUE);
  assert.equal(r.typical, 240_000);
  assert.deepEqual(deadlineCheck(r, T0), { kind: 'deadline', at: DUE + 25 * MIN, deadline: DUE + 30 * MIN, policy: 'Replace', job: 'reports-batch-now' });
  assert.equal(deadlineCheck(r, DUE + 30 * MIN), null);
  assert.equal(deadlineCheck(null), null);
});

test('batchRunOf: complete only with Job Complete and every item processed', () => {
  const running = job('reports-batch-now', DUE, { startTime: iso(DUE + 1000), active: 1, ready: 1, succeeded: 0 });
  const r1 = batchRunOf({ due: DUE, jobs: [...earlier, running], pods: [pod('reports-batch-now', RESUME)], items: { total: 1240, processed: 300 } });
  assert.equal(r1.resumed, RESUME);
  assert.equal(r1.complete, false);
  assert.equal(recoveryKind({ option: { recovery: 'service' }, batch: r1 }), 'resumed');
  assert.equal(deadlineCheck(r1), null);
  /* succeeded pods but no Complete condition yet: still resumed */
  const noCond = job('reports-batch-now', DUE, { startTime: iso(DUE + 1000), succeeded: 1 });
  assert.equal(batchRunOf({ due: DUE, jobs: [noCond], pods: [pod('reports-batch-now', RESUME, true)] }).complete, false);
  /* Complete, but the batch metric says items are left: still resumed */
  const done = job('reports-batch-now', DUE, { startTime: iso(DUE + 1000), completionTime: iso(RESUME + 250_000), succeeded: 1, conditions: [complete(RESUME + 250_000)] });
  assert.equal(batchRunOf({ due: DUE, jobs: [...earlier, done], pods: [pod('reports-batch-now', RESUME, true)], items: { total: 1240, processed: 1100 } }).complete, false);
  const r2 = batchRunOf({ due: DUE, jobs: [...earlier, done], pods: [pod('reports-batch-now', RESUME, true)], items: { total: 1240, processed: 1240 } });
  assert.equal(r2.complete, true);
  assert.equal(r2.done, RESUME + 250_000);
  assert.equal(r2.delay, RESUME + 250_000 - (DUE + 240_000));
  assert.equal(recoveryKind({ option: { recovery: 'service' }, batch: r2 }), 'service');
});

test('batchRunOf: Replace swaps the Pending Job; the complete one is the run', () => {
  const replaced = job('reports-batch-next', DUE + 30 * MIN, { startTime: iso(DUE + 30 * MIN), completionTime: iso(DUE + 35 * MIN), succeeded: 1, conditions: [complete(DUE + 35 * MIN)] });
  const r = batchRunOf({ due: DUE, jobs: [...earlier, replaced] });
  assert.equal(r.job, 'reports-batch-next');
  assert.equal(r.resumed, DUE + 30 * MIN);
  assert.equal(r.complete, true);
});

test('userImpact api: live values while open, final values only when resolved (N5)', () => {
  const live = impactFromSeries({ ratio, rps: 420, from: FROM, to: T0 + 5 * MIN });
  const q = 'sum(rate(http_requests_total{code=~"5.."}[5m]))';
  const open = userImpact({ kind: 'api', impact: live, query: q });
  assert.equal(open[0].now, 3.1);
  assert.ok(!open.some(i => i.id === 'burn-peak' || i.id === 'budget'));
  assert.ok(open.every(i => i.state === 'measured' && i.source === 'prometheus' && i.query === q));
  const fin = impactFromSeries({ ratio, rps: 420, from: FROM, to: T0 + 30 * MIN, fixAt: FIX });
  const final = userImpact({ kind: 'api', impact: fin, query: q, final: true });
  assert.deepEqual(final.map(i => i.id), ['ratio', 'failed', 'burn-1h', 'burn-incident', 'burn-peak', 'budget']);
  for (const i of final) { assert.ok(!('now' in i), i.id); assert.ok(!('waited' in i), i.id); }
  assert.equal(final[0].peak, 3.1);
  assert.equal(final[0].to, FIX);
  assert.equal(final[1].to, FIX);
  for (const b of final.filter(i => i.id.startsWith('burn-'))) assert.ok(b.from < b.to);
  assert.deepEqual(userImpact({ kind: 'api' }), [{ id: 'ratio', state: 'unknown', source: 'prometheus' }]);
});

test('userImpact capacity, auth, deploy and batch', () => {
  const live = impactFromSeries({ ratio, rps: 420, from: FROM, to: T0 });
  const cap = userImpact({ kind: 'capacity', impact: live, ready: { ready: 3, desired: 4, min: 3 } });
  assert.deepEqual(cap.map(i => [i.id, i.state]), [['ready', 'measured'], ['err', 'estimated']]);
  assert.equal(cap[0].ready, 3);
  const capFinal = userImpact({ kind: 'capacity', ready: { ready: 4, desired: 4, min: 3 }, final: true });
  assert.deepEqual(capFinal[0], { id: 'ready', readyAfter: 4, desired: 4, readyDuring: 3, state: 'measured', source: 'kubernetes' });
  assert.deepEqual(userImpact({ kind: 'auth', impact: live, ready: { ready: 2, desired: 3 } }).map(i => i.id), ['login', 'failed', 'ready']);
  assert.deepEqual(userImpact({ kind: 'deploy', revision: { running: '1.4.1', blocked: '1.5.0' } })[0], { id: 'blocked', running: '1.4.1', blocked: '1.5.0', state: 'measured', source: 'kubernetes' });
  const held = batchRunOf({ due: DUE, jobs: [job('reports-batch-now', DUE, { startTime: iso(DUE), active: 1 })], items: { total: 1240, processed: 0 }, deadline: DUE + 30 * MIN, policy: 'Replace', now: T0 });
  assert.deepEqual(userImpact({ kind: 'batch', batch: held }).map(i => i.id), ['run', 'items', 'deadline']);
  const doneJob = job('reports-batch-now', DUE, { startTime: iso(DUE), completionTime: iso(RESUME + 250_000), succeeded: 1, conditions: [complete(RESUME + 250_000)] });
  const done = batchRunOf({ due: DUE, jobs: [...earlier, doneJob], pods: [pod('reports-batch-now', RESUME, true)], items: { total: 1240, processed: 1240 } });
  const fin = userImpact({ kind: 'batch', batch: done, final: true });
  assert.deepEqual(fin.map(i => i.id), ['run', 'items']);
  assert.ok(!('waited' in fin[0]));
  assert.equal(fin[0].complete, true);
  assert.equal(fin[1].state, 'measured');
  assert.equal(fin[1].processed, 1240);
  assert.deepEqual(userImpact({ kind: 'batch' }), [{ id: 'run', state: 'unknown', source: 'kubernetes' }]);
  assert.deepEqual(userImpact({ kind: 'other' }), []);
});

/* events as the API returns them: core/v1 with count, events.k8s.io/v1 with series */
const ev = (uid, type, reason, kind, name, count, last, extra = {}) => ({ apiVersion: 'v1', kind: 'Event', metadata: { uid, namespace: 'payments', creationTimestamp: iso(last - 60_000) },
  involvedObject: { kind, name, namespace: 'payments', uid: `obj-${name}` }, type, reason, message: `${reason} message`, count, firstTimestamp: iso(last - (count - 1) * 40_000), lastTimestamp: iso(last), source: { component: 'kubelet' }, ...extra });
const EVENTS = [
  ev('e1', 'Warning', 'BackOff', 'Pod', 'payments-7c9f6-x2k4', 12, T0 - 30_000),
  ev('e1', 'Warning', 'BackOff', 'Pod', 'payments-7c9f6-x2k4', 14, T0 - 10_000), /* the same Event again, its count grown */
  ev('e2', 'Normal', 'Pulled', 'Pod', 'payments-7c9f6-x2k4', 7, T0 - 20_000),
  ev('e3', 'Warning', 'OOMKilling', 'Node', 'ip-10-0-3-17', 1, T0 - 50_000, { involvedObject: { kind: 'Node', name: 'ip-10-0-3-17' } }),
  { apiVersion: 'events.k8s.io/v1', kind: 'Event', metadata: { uid: 'e4', namespace: 'payments' }, regarding: { kind: 'Pod', name: 'payments-7c9f6-q8m1', namespace: 'payments' },
    type: 'Warning', reason: 'Unhealthy', note: 'Readiness probe failed', eventTime: iso(T0 - 5 * MIN), series: { count: 3, lastObservedTime: iso(T0 - 2 * MIN) }, reportingController: 'kubelet' },
  ev('e5', 'Warning', 'BackOff', 'Pod', 'payments-7c9f6-x2k4', 2, T0 - 3 * H), /* outside the window */
];

test('eventSummary: one row per object and reason, every count from the same rows (N8)', () => {
  const s = eventSummary(EVENTS, { from: T0 - H, to: T0 });
  assert.equal(s.rows.length, 4);
  const back = s.rows.find(r => r.reason === 'BackOff');
  assert.equal(back.count, 14);
  assert.equal(s.rows.find(r => r.reason === 'Unhealthy').count, 3);
  assert.equal(s.rows.find(r => r.reason === 'Unhealthy').message, 'Readiness probe failed');
  assert.equal(s.objects, s.rows.length);
  assert.equal(s.warning, s.rows.filter(r => r.type === 'Warning').length);
  assert.equal(s.warning + s.normal, s.rows.length);
  assert.equal(s.occurrences, s.rows.reduce((a, r) => a + r.count, 0));
  assert.equal(s.occurrences, 14 + 7 + 1 + 3);
  assert.equal(s.warningOccurrences, 14 + 1 + 3);
  assert.deepEqual(s.rows.map(r => r.last), [...s.rows.map(r => r.last)].sort((a, b) => b - a));
  const w = eventSummary(EVENTS, { from: T0 - H, to: T0, type: 'Warning' });
  assert.equal(w.rows.length, s.warning);
  assert.equal(w.occurrences, s.warningOccurrences);
  assert.equal(eventSummary(EVENTS, { from: T0 - H, to: T0, ns: 'payments' }).rows.length, 3);
  /* two distinct Events of one object and reason add up into one row */
  const two = eventSummary([...EVENTS, ev('e6', 'Warning', 'BackOff', 'Pod', 'payments-7c9f6-x2k4', 4, T0 - 15_000)], { from: T0 - H, to: T0 });
  assert.equal(two.rows.find(r => r.reason === 'BackOff').count, 18);
  assert.equal(eventSummary(null).rows.length, 0);
});

/* A2-02: the readiness and the liveness failure of one Pod are two Events with one reason (Unhealthy): kubectl lists them as two rows,
   so the liveness failure behind the restarts is not folded into the readiness row */
test('event_rows_keep_two_events_of_one_object_and_reason_apart_when_their_messages_differ', () => {
  const pod = (uid, message, count, last) => ({ ...ev(uid, 'Warning', 'Unhealthy', 'Pod', 'checkout-api-x', count, last), message });
  const s = eventSummary([pod('r', 'Readiness probe failed: HTTP probe failed with statuscode: 503', 302, T0 - MIN), pod('l', 'Liveness probe failed: HTTP probe failed with statuscode: 500', 9, T0 - 2 * MIN)], { from: T0 - H, to: T0 });
  assert.deepEqual(s.rows.map(r => r.message.split(':')[0]), ['Readiness probe failed', 'Liveness probe failed']);
  assert.equal(new Set(s.rows.map(r => r.key)).size, 2, 'each Event has its own row key');
});

/* A2-01: one population for "how many times in the window": a row's inWindow is its occurrences inside the window (all of them when the Event
   started inside it, at least its last one when it started before), the summary adds the rows up, and count stays the cumulative Event.count */
test('event_rows_carry_the_window_occurrences_and_the_summary_adds_them_up', () => {
  const old = ev('o', 'Warning', 'Unhealthy', 'Pod', 'a', 302, T0 - MIN, { firstTimestamp: iso(T0 - 3 * 24 * H) });
  const fresh = ev('f', 'Warning', 'BackOff', 'Pod', 'b', 5, T0 - MIN);
  const s = eventSummary([old, fresh], { from: T0 - H, to: T0 });
  const of = reason => s.rows.find(r => r.reason === reason);
  assert.deepEqual([of('Unhealthy').count, of('Unhealthy').inWindow, of('Unhealthy').atLeast], [302, 1, true]);
  assert.deepEqual([of('BackOff').count, of('BackOff').inWindow, of('BackOff').atLeast], [5, 5, false]);
  assert.deepEqual([s.windowOccurrences, s.windowAtLeast], [6, true]);
});

test('verifyCounts and causeStatus', () => {
  assert.deepEqual(verifyCounts([{ state: 'pass' }, { state: 'unknown' }, { state: 'pending' }, { state: 'pass', optional: true }, { state: 'unknown', optional: true }]),
    { required: 3, passed: 1, unjudged: 1, optional: 2 });
  assert.equal(causeStatus({ grade: 'confirmed' }), 'judged');
  assert.equal(causeStatus({ grade: 'inferred' }), 'judged');
  assert.equal(causeStatus({ grade: 'supported' }), 'supported');
  assert.equal(causeStatus({ grade: 'inferred', supported: 'reply' }), 'supported');
  assert.equal(causeStatus({ grade: 'insufficient' }), 'hypothesis');
  assert.equal(causeStatus({ grade: 'confirmed' }, { held: true }), 'hypothesis');
  assert.equal(causeStatus(null), 'hypothesis');
});

test('verifyVerdict: pending, pass, fail and the blind-window deadline', () => {
  const { cadence, need, max } = VERIFY_DEFAULT, V = T0 + 10 * MIN;
  assert.equal(verifyVerdict({ verifyFrom: null, now: V }).state, 'pending');
  const early = verifyVerdict({ verifyFrom: V, now: V + 2 * MIN, windows: Array(5).fill('ok') });
  assert.equal(early.state, 'pending');
  assert.equal(early.left, need - 2 * MIN);
  assert.equal(early.windows.length, max / cadence);
  assert.equal(early.windows.at(-1), 'none');
  assert.equal(verifyVerdict({ verifyFrom: V, now: V + need, windows: Array(11).fill('ok') }).state, 'pass');
  const fail = verifyVerdict({ verifyFrom: V, now: V + 3 * MIN, windows: ['ok', 'ok', 'ok', 'ok', 'ok', 'bad', 'ok'] });
  assert.equal(fail.state, 'fail');
  assert.equal(fail.failAt, V + 5 * cadence);
  /* a blind last window never passes */
  assert.equal(verifyVerdict({ verifyFrom: V, now: V + need + 2 * cadence, windows: [...Array(12).fill('ok'), 'miss'] }).state, 'pending');
  /* blind for the whole limit: no verdict */
  assert.equal(verifyVerdict({ verifyFrom: V, now: V + max, windows: Array(max / cadence).fill('miss') }).state, 'inconclusive');
});

test('verifyVerdict: a missed window restarts the healthy streak, so health on both sides of a blind spell never adds up', () => {
  const { cadence, need, max } = VERIFY_DEFAULT, V = T0 + 10 * MIN, ok = n => Array(n).fill('ok');
  const split = verifyVerdict({ verifyFrom: V, now: V + 12 * cadence, windows: [...ok(5), 'miss', ...ok(6)] });
  assert.equal(split.state, 'pending', 'five healthy windows, a miss and six more are not five continuous minutes');
  assert.equal(split.stable, 5 * cadence, 'the stable time counts from the first healthy window after the miss');
  assert.equal(verifyVerdict({ verifyFrom: V, now: V + 17 * cadence, windows: [...ok(5), 'miss', ...ok(11)] }).state, 'pass', 'eleven healthy windows in a row after the miss pass');
  assert.equal(verifyVerdict({ verifyFrom: V, now: V + 20 * cadence, windows: [...ok(19), 'miss'] }).stable, 0);
  /* a long check with misses scattered through it is still pending: only ten continuous minutes blind end it without a verdict */
  const scattered = Array.from({ length: 60 }, (_, i) => (i % 3 === 2 ? 'miss' : 'ok'));
  assert.equal(verifyVerdict({ verifyFrom: V, now: V + 60 * cadence, windows: scattered }).state, 'pending');
  assert.equal(verifyVerdict({ verifyFrom: V, now: V + 30 * cadence, windows: [...ok(10), ...Array(max / cadence - 1).fill('miss')] }).state, 'pending');
  assert.equal(verifyVerdict({ verifyFrom: V, now: V + 30 * cadence, windows: [...ok(10), ...Array(max / cadence).fill('miss')] }).state, 'inconclusive');
  assert.equal(split.left, need - 5 * cadence);
});

test('recoveryKind and recoveryTone: only a service recovery is ok (N13)', () => {
  assert.equal(recoveryKind(), 'service');
  for (const k of ['symptom', 'mitigated', 'bypassed']) assert.equal(recoveryKind({ option: { recovery: k } }), k);
  assert.equal(recoveryKind({ option: { recovery: 'made-up' } }), 'service');
  assert.equal(recoveryTone('service'), 'ok');
  for (const k of ['symptom', 'mitigated', 'bypassed', 'resumed']) assert.equal(recoveryTone(k), 'warn');
});

test('nextShare, figureWindow and freshness', () => {
  assert.equal(nextShare('critical', T0), T0 + 30 * MIN);
  assert.equal(nextShare('warning', T0), T0 + 60 * MIN);
  const V = T0 + 40 * MIN;
  assert.deepEqual(figureWindow({ detectedAt: T0, verifiedAt: V }), { from: T0 - 30 * MIN, to: V, watchUntil: V + 7 * 24 * H });
  assert.equal(figureWindow({ detectedAt: T0, verifiedAt: V, watchUntil: V + H }).watchUntil, V + H);
  const sources = { prometheus: { state: 'ok', last: T0 - 2000 }, argocd: { state: 'limited', last: iso(T0 - 5000) }, loki: { state: 'error', last: T0 - 2 * H } };
  assert.deepEqual(freshness(sources, 'prometheus', T0), { state: 'ok', last: T0 - 2000, stale: false, age: 2000 });
  assert.equal(freshness(sources, 'argocd', T0).stale, false);
  assert.deepEqual(freshness(sources, 'loki', T0), { state: 'error', last: T0 - 2 * H, stale: true, age: 2 * H });
  assert.deepEqual(freshness(sources, 'github', T0), { state: 'unknown', last: null, stale: true, age: null });
});

test('linksOf: built from the configured sites, https only', () => {
  const sites = { wake: 'https://wake.example.test/', alertmanager: 'https://am.example.test', grafana: 'https://grafana.example.test', runbooks: 'https://rb.example.test', github: 'https://github.com', tickets: 'http://tickets.example.test' };
  const inc = { id: 'INC-2142', cluster: 'prod-a', alert: 'PaymentsRestarting', namespace: 'payments', runbook: { id: 'post-deploy-restart', version: 'v2' }, dashboard: { uid: 'payments-overview', slug: 'payments' }, repo: 'acme/payments-deploy' };
  const l = linksOf(sites, inc);
  assert.equal(l.incident, 'https://wake.example.test/clusters/prod-a/incidents/INC-2142');
  assert.equal(l.app, 'wake://cluster/prod-a/incidents/INC-2142');
  assert.equal(l.alert, `https://am.example.test/#/alerts?filter=${encodeURIComponent('{alertname="PaymentsRestarting",namespace="payments"}')}`);
  assert.equal(l.runbook, 'https://rb.example.test/skills/post-deploy-restart/v2');
  assert.equal(l.dashboard, 'https://grafana.example.test/d/payments-overview/payments?orgId=1&var-namespace=payments');
  assert.equal(l.pr(142), 'https://github.com/acme/payments-deploy/pull/142');
  assert.equal(l.ticket('DBA-4127'), null); /* the ticket site is not https */
  assert.equal(linksOf({}, inc).incident, null);
  assert.equal(linksOf(sites, null), null);
});
