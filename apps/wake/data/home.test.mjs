/* 클러스터 홈 자료(home.js): Pod 상태 흐름, 변경 표시, 출처 상태, 기간 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { podFlow, workloadOf, changeMarks, toolState, agentState, silentNodes, windowOf, stepOf, warningSummary } from './home.js';

const pod = (ns, name, owner, status) => ({ ns, name, owner, status });
const rs = name => ({ kind: 'ReplicaSet', name });

test('워크로드: ReplicaSet 소유는 Deployment, 소유자가 없으면 Pod 자신', () => {
  assert.deepEqual(workloadOf(pod('a', 'web-7cf98-x1', rs('web-7cf98'))), { kind: 'Deployment', name: 'web' });
  assert.deepEqual(workloadOf(pod('a', 'db-0', { kind: 'StatefulSet', name: 'db' })), { kind: 'StatefulSet', name: 'db' });
  assert.deepEqual(workloadOf(pod('a', 'lone')), { kind: 'Pod', name: 'lone' });
});

test('Pod 상태 흐름: 들어온 양과 나간 양이 같고, 워크로드 상태는 가장 나쁜 Pod', () => {
  const pods = [pod('a', 'web-7cf98-x', rs('web-7cf98'), ['ok', 'Running']), pod('a', 'web-7cf98-y', rs('web-7cf98'), ['danger', 'CrashLoopBackOff']), pod('b', 'job-z', { kind: 'Job', name: 'job' }, ['neutral', 'Completed'])];
  const { nodes, links } = podFlow(pods);
  const sum = (list, k) => list.reduce((n, l) => n + l.value, 0);
  assert.equal(sum(nodes.filter(n => n.col === 0)), 3);
  assert.equal(sum(links.filter(l => l.from.startsWith('ns-'))), sum(links.filter(l => l.from.startsWith('w-'))));
  assert.equal(nodes.find(n => n.label === 'web').state, 'fail');
  assert.equal(nodes.find(n => n.label === 'job').state, 'ok');
  assert.equal(nodes.filter(n => n.col === 2).at(-1).label, 'Running');
});

test('변경 표시: 구간 밖 제외, Node는 infra, 같은 대상·Reason 경고는 한 번', () => {
  const at = '2026-11-02T01:00:00Z', ms = Date.parse(at);
  const events = [
    { uid: '1', type: 'Warning', reason: 'BackOff', message: 'x', at, object: { kind: 'Pod', ns: 'a', name: 'p' } },
    { uid: '2', type: 'Warning', reason: 'BackOff', message: 'x', at, object: { kind: 'Pod', ns: 'a', name: 'p' } },
    { uid: '3', type: 'Warning', reason: 'NodeNotReady', message: 'n', at, object: { kind: 'Node', name: 'w' } },
    { uid: '4', type: 'Normal', reason: 'ScalingReplicaSet', message: 's', at, object: { kind: 'Deployment', ns: 'a', name: 'web' } },
    { uid: '5', type: 'Warning', reason: 'Old', message: 'o', at: '2026-10-01T00:00:00Z', object: { kind: 'Pod', ns: 'a', name: 'q' } },
  ];
  const marks = changeMarks({ events, configmaps: [{ ns: 'a', name: 'cfg', createdAt: at }] }, { from: ms - 3600_000, to: ms + 1 });
  assert.deepEqual(marks.map(m => m.lane).sort(), ['config', 'deploy', 'infra', 'symptom']);
  assert.equal(warningSummary(events, { from: ms - 3600_000, to: ms + 1 }).objects, 2);
});

test('출처 상태: 연결 흐름이 먼저, 준비 안 된 도구는 오류, 그 밖은 연결 안 됨', () => {
  assert.equal(toolState({ state: 'ok' }, { state: 'connected' }), 'ok');
  assert.equal(toolState({ state: 'ok' }, { state: 'failed' }), 'error');
  assert.equal(toolState({ state: 'ok' }, { state: 'needs-perm' }), 'perm');
  assert.equal(toolState({ state: 'found', ready: 0 }), 'error');
  assert.equal(toolState({ state: 'ok', conn: 'connected' }), 'idle', 'a tool without a connection flow is not connected');
  assert.equal(toolState({ state: 'ok' }), 'idle');
  assert.equal(agentState({ lookup: 'present', rolloutReady: true }), 'ok');
  assert.equal(agentState({ lookup: 'forbidden' }), 'perm');
  assert.equal(agentState(null), 'idle');
});

test('에이전트 heartbeat: 모든 Node가 끊기면 끊김, 일부면 제한, 읽기 권한이 없으면 권한 필요', () => {
  const nodes = states => states.map((state, i) => ({ node: `n${i}`, state }));
  const present = { lookup: 'present', rolloutReady: true, beatLookup: 'ok' };
  assert.equal(agentState({ ...present, nodes: nodes(['ok', 'ok']) }), 'ok');
  assert.equal(agentState({ ...present, nodes: nodes(['ok', 'stale']) }), 'limited');
  assert.equal(agentState({ ...present, nodes: nodes(['missing', 'stale']) }), 'error');
  assert.equal(agentState({ ...present, rolloutReady: false, nodes: nodes(['ok', 'missing']) }), 'busy');
  assert.equal(agentState({ ...present, beatLookup: 'forbidden', nodes: [] }), 'perm');
  assert.equal(agentState({ ...present, beatLookup: 'error', nodes: [] }), 'limited');
  assert.deepEqual(silentNodes({ nodes: nodes(['ok', 'stale', 'missing']) }), ['n1', 'n2']);
});

test('기간과 step: 프리셋은 기준 시각에서 끝나고 step은 15초의 배수', () => {
  const now = Date.parse('2026-11-02T01:15:00Z');
  assert.deepEqual(windowOf({ preset: '6h' }, now), { from: now - 21600_000, to: now });
  assert.deepEqual(windowOf({ from: 10, to: 20, live: true }, now), { from: 10_000, to: now });
  assert.equal(stepOf(now - 3600_000, now) % 15, 0);
});

test('sources_of_cluster_tools_say_which_values_are_not_current', async () => {
  const { sourcesOf } = await import('./home.js');
  const { freshness } = await import('./incident-model.js');
  const tools = [{ kind: 'prometheus', state: 'ok' }, { kind: 'alertmanager', state: 'found', ready: 0, last: '2026-11-02T01:03:00Z' }, { kind: 'argocd', state: 'ok' }];
  const s = sourcesOf(tools, { 'c1-prometheus': { state: 'connected', last: '2026-11-02T01:14:00Z' }, 'c1-argocd': { state: 'connected', last: '2026-11-02T01:10:00Z' } }, 'c1');
  assert.deepEqual(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.state])), { prometheus: 'ok', alertmanager: 'error', argocd: 'ok' });
  assert.equal(s.alertmanager.last, Date.parse('2026-11-02T01:03:00Z'));
  const now = Date.parse('2026-11-02T01:15:00Z');
  assert.equal(freshness(s, 'prometheus', now).stale, false);
  assert.equal(freshness(s, 'alertmanager', now).stale, true);
  assert.equal(freshness(s, 'loki', now).stale, true, 'a source the cluster does not have is never current');
});
