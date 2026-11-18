/* 보고서 문서(spec/design.md#B-049; spec/screens/report.md#SCR-REPORT): node --test apps/wake/pages/incident-report-doc.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ko from '../locale/ko.js';
import { figureWindow } from '../data/incident-model.js';
import { incidentReport, finished, markdownOf } from './incident-report-doc.js';
import { evidenceTag } from './incident-parts.js';

const t = (k, v = {}) => { assert.ok(k in ko, `missing key ${k}`); return ko[k].replace(/\{(\w+)\}/g, (m, n) => (n in v ? String(v[n]) : m)); };
/* 테스트 전용 합성 인시던트 작업면(incident.workspace 모양, 이 파일 안에만 있음): 열린 한 건과 같은 건의 해결 단계 */
const MIN = 60_000, DET = Date.parse('2026-11-02T00:40:00Z');
const series = (from, to, step, f) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => ({ at: from + i * step, value: f(i) }));
const evidence = [
  { n: 1, kind: 'events', source: 'kubernetes', query: 'kubectl get events -n payments --field-selector involvedObject.name=checkout-api-p4x2m', window: { from: DET - 30 * MIN, to: DET + 5 * MIN }, collectedAt: DET + 5 * MIN, total: 3, masked: 0,
    target: { kind: 'Pod', name: 'checkout-api-p4x2m' }, result: { rows: [{ last: DET - 2 * MIN, type: 'Warning', reason: 'OOMKilling', object: 'Pod/checkout-api-p4x2m', count: 9, message: 'Memory cgroup out of memory' },
      { last: DET - MIN, type: 'Warning', reason: 'BackOff', object: 'Pod/checkout-api-p4x2m', count: 4, message: 'Back-off restarting failed container' }, { last: DET - 20 * MIN, type: 'Normal', reason: 'Pulled', object: 'Pod/checkout-api-p4x2m', count: 1, message: 'Container image pulled' }] } },
  { n: 2, kind: 'logs', source: 'loki', query: '{namespace="payments", pod="checkout-api-p4x2m"} |= "heap"', key: 'heap', hits: [2], total: 3, window: { from: DET - 10 * MIN, to: DET }, collectedAt: DET + 6 * MIN, masked: 1,
    target: { kind: 'Pod', name: 'checkout-api-p4x2m', container: 'checkout-api', previous: true }, result: { lines: [{ n: 1, at: DET - 3 * MIN, level: 'INFO', text: 'serving' }, { n: 2, at: DET - 2 * MIN, level: 'ERROR', text: 'java.lang.OutOfMemoryError: Java heap space' }, { n: 3, at: DET - 2 * MIN, level: 'INFO', text: 'shutdown' }] } },
  { n: 3, kind: 'metric', source: 'prometheus', query: 'container_memory_working_set_bytes{namespace="payments", pod="checkout-api-p4x2m"}', window: { from: DET - 30 * MIN, to: DET + 5 * MIN }, collectedAt: DET + 5 * MIN, total: 36, masked: 0,
    target: { kind: 'Pod', name: 'checkout-api-p4x2m' }, result: { series: [{ labels: { pod: 'checkout-api-p4x2m' }, unit: 'Mi', refs: [{ value: 256, label: 'limit 256Mi', tone: 'limit' }], samples: series(DET - 30 * MIN, DET + 90 * MIN, MIN, i => 180 + (i % 12) * 6) }] } },
];
const option = { id: 'mem', title: 'raise-memory-limit', grade: 'confirmed', reach: '3 Pods recreated one by one', basis: '9 OOMKilled and a heap error', plan: { route: 'pr', target: { kind: 'Deployment', name: 'checkout-api', namespace: 'payments' },
  values: [{ path: 'spec.template.spec.containers[0].resources.limits.memory', before: '256Mi', after: '384Mi' }] } };
const audit = [{ at: DET, action: 'alert', target: 'payments/checkout-api-p4x2m', requester: { kind: 'wake', name: 'Alertmanager' } }, { at: DET + 4 * MIN, action: 'judge', requester: { kind: 'ai', name: 'Wake' }, model: 'fixture-model' }];
const open = {
  id: 'inc-0001', number: 'INC-0001', title: 'checkout-api-restarts', cluster: 'fixture-context', severity: 'critical', phase: 'judged', detectedAt: DET, now: DET + 8 * MIN, nextShare: DET + 30 * MIN,
  oncall: { name: 'fixture.oncall' }, target: { kind: 'Deployment', name: 'checkout-api', namespace: 'payments' }, alert: { source: 'Alertmanager', name: 'KubePodCrashLooping' },
  links: { incident: 'https://example.invalid/incidents/INC-0001', runbook: 'https://example.invalid/runbooks/crashloop' },
  sources: [{ id: 'kubernetes', name: 'Kubernetes API', state: 'ok' }, { id: 'prometheus', name: 'Prometheus', state: 'ok' }, { id: 'loki', name: 'Loki', state: 'ok' }],
  scope: [{ kind: 'Deployment', name: 'checkout-api', status: ['danger', 'Degraded'] }],
  impact: { label: '5xx-ratio', unit: '%', threshold: 1, from: DET - 5 * MIN, query: 'sum(rate(http_requests_total{code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100', scrape: 30_000,
    samples: series(DET - 30 * MIN, DET + 90 * MIN, 30_000, i => (i > 50 && i < 160 ? 2.4 : 0.2)) },
  userImpact: [{ id: 'ratio', now: 2.4, from: DET - 5 * MIN }, { id: 'failed', failed: 1240, requests: 51800, from: DET - 5 * MIN, to: DET + 8 * MIN },
    { id: 'burn-1h', burn: 9.1, slo: 99.9, from: DET - 52 * MIN, to: DET + 8 * MIN }, { id: 'burn-incident', burn: 24, slo: 99.9, from: DET - 5 * MIN, to: DET + 8 * MIN }, { id: 'burn-peak', burn: 31, slo: 99.9, from: DET, to: DET + 2 * MIN },
    { id: 'budget', budgetUsed: 12, slo: 99.9 }],
  chain: { grade: 'confirmed', conclusion: 'the container reached its 256Mi memory limit and ended OOMKilled', cells: { observe: [{ text: '9 OOMKilled', refs: [1, 3] }], interpret: [{ text: 'heap use went over the limit', refs: [2] }],
    basis: [{ text: 'the same Pod working set reached 256Mi' }], unknown: [{ text: 'a memory leak is not established' }], verify: [{ text: '5xx ratio below 1% for 10 minutes' }] } },
  rule: { name: 'oom-limit', version: 'v1' }, skill: null, options: [option], chosen: null, evidence, audit, timeline: [
    { at: DET - 25 * MIN, lane: 'deploy', kind: 'Deployment', title: 'checkout-api', text: 'image 1.8.0 → 1.8.1' }, { at: DET - 6 * MIN, lane: 'symptom', kind: 'Pod', title: 'checkout-api-p4x2m', text: 'OOMKilled' }],
  verify: { need: 10 * MIN, cadence: 30_000, max: 30 * MIN, verifyFrom: DET + 40 * MIN, conditions: [{ id: 'v1', label: '5xx-ratio-below-1pct', source: 'prometheus' }, { id: 'v2', label: 'no-restarts', source: 'kubernetes', optional: true }] },
};
const RES = DET + 70 * MIN;
const done = { ...open, phase: 'resolved', chosen: 'mem', recovery: 'service', approvedAt: DET + 12 * MIN, fixAt: DET + 40 * MIN, resolvedAt: RES, now: RES,
  figure: figureWindow({ detectedAt: DET, verifiedAt: RES }),
  userImpact: [{ id: 'ratio', peak: 2.6, peakAt: DET + 3 * MIN, end: 0.2, from: DET - 5 * MIN, to: RES }, ...open.userImpact.slice(1)],
  audit: [...audit, { at: DET + 12 * MIN, action: 'approve', requester: { kind: 'human', name: 'fixture.oncall' }, summary: 'memory limit change approved' }, { at: RES, action: 'resolve', requester: { kind: 'wake', name: 'Wake' } }],
  verify: { ...open.verify, conditions: open.verify.conditions.map(c => ({ ...c, state: 'pass' })) },
  followUps: [{ title: 'add-memory-alert', from: 'detection', days: 7 }, { title: 'review-heap-size', from: 'cause', days: 14 }] };
const blocks = doc => finished(doc).blocks;
const block = (doc, id) => blocks(doc).find(b => b.id === id);
const words = doc => JSON.stringify(blocks(doc).map(b => [b.title, b.caption, b.data?.text, b.data?.items, b.data?.rows])) + doc.channel + JSON.stringify(doc.head);

test('the stage picks the document: an open incident is a status update, a resolved one a postmortem', () => {
  assert.equal(incidentReport(t, open).kind, 'status');
  assert.equal(incidentReport(t, done).kind, 'postmortem');
  assert.ok(block(incidentReport(t, open), 's-now'));
  assert.ok(!block(incidentReport(t, done), 's-now'), 'no "decision needed" in a postmortem');
  assert.ok(!words(incidentReport(t, done)).includes(t('wake.rep.now.decideL')));
});

test('a resolved document never says "now": final values and "at the end" (N5)', () => {
  const doc = incidentReport(t, done), all = words(doc) + markdownOf(t, finished(doc), doc.head);
  assert.ok(!all.includes(t('wake.rep.now.word').trim()), 'no now word');
  const ratio = block(doc, 's-imp').data.items.find(x => x.id === 'u-ratio');
  assert.match(ratio.value, new RegExp(t('wake.rep.imp.ratioFinal', { peak: '', at: '', from: '', to: '', end: '' }).split(' · ').at(-1).trim()));
});

test('figures run from 30 minutes before detection through the recovery check, marked, with the 7-day watch (N6)', () => {
  const doc = incidentReport(t, done), w = figureWindow({ detectedAt: done.detectedAt, verifiedAt: done.resolvedAt });
  assert.deepEqual(blocks(doc).filter(x => x.kind === 'chart').map(b => b.id), ['c-err', 'c-m3']);
  for (const b of blocks(doc).filter(x => x.kind === 'chart')) {
    assert.equal(b.data.card.chart.timeAxis.from, w.from / 1000, b.id);
    assert.equal(b.data.card.chart.timeAxis.to, w.to / 1000, b.id);
    assert.equal(b.data.card.chart.events.length, 3, b.id);
    assert.ok(String(b.caption).includes(t('wake.rep.fig.watch', { date: '' }).split('·')[0].trim()), b.id);
  }
});

test('burn rate always names its window (N7)', () => {
  for (const inc of [open, done]) {
    const items = block(incidentReport(t, inc), 's-imp').data.items.filter(x => x.label === t('wake.rep.impL.burn'));
    assert.ok(items.length > 0);
    const names = ['1h', 'incident', 'peak'].map(k => t(`wake.rep.burn.${k}`, { from: '', to: '' }).split(' ')[0]);
    for (const x of items) assert.ok(names.some(n => x.value.includes(n)), x.value);
  }
});

test('the check before a held batch deadline carries one time in its clause', () => {
  const batch = { job: 'reports-batch-1', resumed: null, deadline: open.now + 40 * 60_000, policy: 'Replace' };
  const doc = incidentReport(t, { ...open, batch });
  const line = block(doc, 's-now').data.items.find(x => x.id === 'check0').text;
  assert.equal(line.match(/\d{2}:\d{2}/g).length, 1, line);
});

test('document tables wrap prose cells and move raw text whole into an excerpt keyed by its row (N1)', () => {
  const pm = incidentReport(t, done), su = incidentReport(t, open);
  const col = (doc, id, c) => block(doc, id).data.columns.find(x => x.id === c);
  assert.equal(col(pm, 's-tl', 'text').wrap, true);
  assert.equal(col(pm, 's-fu', 'text').wrap, true);
  assert.equal(col(pm, 's-ver', 'label').wrap, true);
  assert.equal(col(pm, 's-ev', 'result').wrap, true);
  assert.deepEqual(col(su, 'c-ev', 'msg').excerpt, ['reason']);
  assert.deepEqual(col(su, 's-ev', 'query').excerpt, ['no']);
  const md = markdownOf(t, finished(su), su.head);
  /* the excerpt is keyed by the evidence's readable label (kind · target · time or value), never a bare number */
  for (const e of open.evidence) assert.ok(md.includes(`${evidenceTag(t, e).label}  ${e.query}`), `whole query of ${evidenceTag(t, e).label}`);
});

test('follow-ups with no owner in the data say "to be assigned"; the on-call is the document on-call', () => {
  const doc = incidentReport(t, done);
  for (const r of block(doc, 's-fu').data.rows) assert.equal(r.owner, t('wake.rep.fu.ownerNeeded'));
  assert.equal(doc.head.rows.find(r => r.label === t('wake.rep.h.oncall')).value, done.oncall.name);
});

test('a recovery other than a service one is written with its own kind, never "recovery confirmed" or "resolved"', () => {
  const doc = incidentReport(t, { ...done, recovery: 'mitigated' }), all = words(doc);
  assert.ok(all.includes(t('wake.inc.result.mitigated')));
  assert.ok(!all.includes(t('wake.inc.result.service')));
  assert.ok(!all.includes(t('wake.inc.phase.resolved')));
});
