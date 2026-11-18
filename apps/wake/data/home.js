/*
 * 클러스터 홈과 지표 화면의 자료(순수 함수, 글 없음): 지표 정의, Pod 상태 흐름(namespace → 워크로드 → Pod 상태), 변경 표시(Kubernetes 원본에서),
 * 출처 상태(도구 칩), 이벤트 행을 eventSummary 입력으로. 시뮬레이션 design/sim/sim-world.js의 podFlow·changesOf와 같은 규칙을 실제 목록 행(kinds.js)에 쓴다.
 * 논리 검사: home.test.mjs
 */
import { eventSummary, eventRowKey } from './incident-model.js';

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
/** 변경 타임라인의 칸(배포 · 설정 · 인프라 · 증상)과 아이콘: 홈·지표·이벤트 화면이 같이 쓴다 */
export const CHANGE_LANES = [['deploy', 'k8s-deployment'], ['config', 'k8s-configmap'], ['infra', 'k8s-node'], ['symptom', 'exclamation-triangle']];

/* 홈 지표(시뮬레이션 METRICS와 같은 넷): 허브 질의 정의의 시리즈 이름(desktop/reads/metrics.cjs, 질의 글은 허브가 가짐), 단위, 임계값,
   나눠 보는 기준(Node 또는 namespace)과 그 상위 5 시리즈 */
export const METRIC_DEFS = Object.freeze([
  { id: 'cpu', series: 'cluster.cpu', bySeries: 'cluster.cpu.byNode', unit: '%', threshold: 80, by: 'node', color: '--series-1' },
  { id: 'mem', series: 'cluster.mem', bySeries: 'cluster.mem.byNode', unit: '%', threshold: 85, by: 'node', color: '--series-2' },
  { id: 'err', series: 'cluster.err', bySeries: 'cluster.err.byNs', unit: '%', threshold: 1, by: 'ns', color: '--series-4' },
  { id: 'rps', series: 'cluster.rps', bySeries: 'cluster.rps.byNs', unit: '/s', threshold: null, by: 'ns', color: '--series-1' },
]);
export const metricDef = id => METRIC_DEFS.find(m => m.id === id) ?? null;
/** 초당 요청 글의 소수 자리: 유효 숫자 둘(340 → 0, 2.4 → 1, 0.53 → 2). 한 줄의 값들은 가장 큰 값의 자리로(A2-11) */
export const rateDigits = v => { const a = Math.abs(v); return !a || a >= 10 ? 0 : a >= 1 ? 1 : 2; };
/** 5xx 비율 글의 소수 자리: 늘 둘(0.90% · 1.02% · 임계값 1.00%, 홈·네트워크가 같음) */
export const ERR_DIGITS = 2;

/* Pod 상태 톤(흐름 그래프 상태): 목록 행 색조 -> ok · warn · fail · idle */
const TONE = { ok: 'ok', warn: 'warn', danger: 'fail', neutral: 'idle' };
export const podTone = row => TONE[row.status?.[0]] ?? 'warn';
const podState = row => row.status?.[1] ?? 'Unknown';
/** Pod를 만든 워크로드: ReplicaSet 소유는 Deployment(이름에서 pod-template-hash를 뗌), 그 밖은 소유자 그대로, 소유자가 없으면 Pod 자신 */
export function workloadOf(row) {
  const o = row.owner;
  if (!o) return { kind: 'Pod', name: row.name };
  if (o.kind === 'ReplicaSet') return { kind: 'Deployment', name: o.name.replace(/-[a-z0-9]{4,10}$/, '') };
  return { kind: o.kind, name: o.name };
}

/**
 * Pod 상태 흐름(시뮬레이션 podFlow): 열 0 namespace, 열 1 워크로드, 열 2 Pod 상태. 노드 값은 Pod 수, 띠는 같은 단위(Pod 수).
 * 반환: { nodes: [{ id, col, value, label, kind, state, ns?, name?, status? }], links: [{ from, to, value, state }] }
 */
export function podFlow(pods) {
  const nodes = [], links = [], byNs = new Map(), byWl = new Map(), groups = new Map();
  for (const p of pods ?? []) {
    byNs.set(p.ns, (byNs.get(p.ns) ?? 0) + 1);
    const w = workloadOf(p), key = `${p.ns}/${w.kind}/${w.name}`;
    if (!byWl.has(key)) byWl.set(key, { ns: p.ns, ...w, pods: [] });
    byWl.get(key).pods.push(p);
    const s = podState(p);
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(p);
  }
  for (const ns of [...byNs.keys()].sort((a, b) => byNs.get(b) - byNs.get(a) || a.localeCompare(b))) nodes.push({ id: 'ns-' + ns, col: 0, value: byNs.get(ns), label: ns, kind: 'Namespace', state: 'ok', ns });
  for (const [key, w] of [...byWl].sort((a, b) => b[1].pods.length - a[1].pods.length || a[0].localeCompare(b[0]))) {
    const bad = w.pods.filter(p => p.status?.[0] !== 'ok' && podTone(p) !== 'idle'), state = bad.some(p => podTone(p) === 'fail') ? 'fail' : bad.length ? 'warn' : 'ok';
    nodes.push({ id: 'w-' + key, col: 1, value: w.pods.length, label: w.name, kind: w.kind, state, ns: w.ns, name: w.name });
    links.push({ from: 'ns-' + w.ns, to: 'w-' + key, value: w.pods.length, state });
    const per = new Map();
    for (const p of w.pods) per.set(podState(p), [...(per.get(podState(p)) ?? []), p]);
    for (const [s, list] of per) links.push({ from: 'w-' + key, to: 's-' + s, value: list.length, state: podTone(list[0]) });
  }
  const states = [...groups.keys()].sort((a, b) => (a === 'Running' ? 1 : b === 'Running' ? -1 : groups.get(b).length - groups.get(a).length || a.localeCompare(b)));
  for (const s of states) nodes.push({ id: 's-' + s, col: 2, value: groups.get(s).length, label: s, kind: 'Status', state: podTone(groups.get(s)[0]), status: s });
  return { nodes, links };
}

/** kinds.js 이벤트 행 -> eventSummary가 읽는 Event 모양(core/v1) */
export const eventObjectOf = row => ({ metadata: { uid: row.uid ?? null }, type: row.type, reason: row.reason, message: row.message,
  involvedObject: { kind: row.object?.kind, name: row.object?.name, namespace: row.object?.ns ?? '', uid: row.object?.uid ?? null },
  lastTimestamp: row.at, firstTimestamp: row.firstAt ?? row.at, count: row.count ?? 1, source: { component: row.source ?? '' } });
/** 이벤트 행(eventSummary rows)의 Reason마다 구간 안 발생 수 [{ reason, n, atLeast }] 많은 순: 카드 머리의 Reason 칸(홈·이벤트·상세가 같음) */
export function reasonsInWindow(list) {
  const by = new Map();
  for (const e of list) { const x = by.get(e.reason) ?? { reason: e.reason, n: 0, atLeast: false }; x.n += e.inWindow ?? e.count; x.atLeast ||= !!e.atLeast; by.set(e.reason, x); }
  return [...by.values()].sort((a, b) => b.n - a.n || (a.reason < b.reason ? -1 : 1));
}
/** 구간의 Warning 이벤트: 행(대상 + Reason + 메시지)과 발생 수를 한 결과에서 셈(N8, A2-01).
 *  inWindow: 구간 안 발생 수(eventSummary windowOccurrences: 구간 안에서 처음 난 이벤트는 count 전부, 구간 전에 시작한 이벤트는 마지막 하나만 확실해 1, atLeast).
 *  count(행)는 이벤트가 처음 난 뒤의 누적. byReason: Reason마다 같은 셈 */
export function warningSummary(rows, { from, to }) {
  const summary = eventSummary((rows ?? []).map(eventObjectOf), { from, to, type: 'Warning' });
  return { ...summary, inWindow: summary.windowOccurrences, atLeast: summary.windowAtLeast, byReason: reasonsInWindow(summary.rows) };
}

/**
 * 변경 표시(change-timeline 칸): Kubernetes 원본에서 나온 것만. deploy = Deployment의 ScalingReplicaSet 이벤트와 구간 안에 만든 Deployment·StatefulSet·DaemonSet,
 * config = 구간 안에 만든 ConfigMap, infra = Node 이벤트, symptom = 그 밖의 Warning 이벤트(이벤트 행 하나(대상 + Reason + 메시지)에 한 표시).
 *  반환: [{ id, key(이벤트 행 키), lane, at(ms), tone, kind, title, text, ns }] 시각 순
 */
export function changeMarks({ events = [], configmaps = [], workloads = [] }, { from, to }) {
  const inside = at => Number.isFinite(at) && at >= from && at <= to, out = [];
  for (const w of workloads) { const at = Date.parse(w.createdAt); if (inside(at)) out.push({ id: `wl:${w.kind}/${w.ns}/${w.name}`, lane: 'deploy', at, tone: 'info', kind: w.kind, title: w.name, text: w.image || '', ns: w.ns }); }
  for (const c of configmaps) { const at = Date.parse(c.createdAt); if (inside(at)) out.push({ id: `cm:${c.ns}/${c.name}`, lane: 'config', at, tone: 'info', kind: 'ConfigMap', title: c.name, text: c.ns, ns: c.ns }); }
  const seen = new Set();
  for (const e of [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    const at = Date.parse(e.at), o = e.object ?? {};
    if (!inside(at)) continue;
    const lane = o.kind === 'Node' ? 'infra' : e.reason === 'ScalingReplicaSet' ? 'deploy' : e.type === 'Warning' ? 'symptom' : null;
    if (!lane) continue;
    const key = eventRowKey({ kind: o.kind, ns: o.ns ?? '', name: o.name, reason: e.reason, message: e.message ?? '' });
    if (lane === 'symptom' && seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `ev:${e.uid ?? key}`, key, lane, at, tone: e.type === 'Warning' ? 'warn' : 'info', kind: e.reason, title: `${o.kind}/${o.name}`, text: e.message, ns: o.ns ?? '' });
  }
  return out.sort((a, b) => a.at - b.at);
}

/* 도구 칩 상태(sourceChips): 연결 흐름 상태 -> ok · limited · perm · idle · error · busy */
const FLOW_STATE = { connected: 'ok', 'needs-perm': 'perm', 'needs-login': 'error', failed: 'error', timeout: 'error', running: 'busy', waiting: 'busy', watching: 'busy' };
/** 클러스터 안 도구 하나의 칩 상태: 연결 흐름(wake.conn.live)이 있으면 그것, 준비된 Pod가 없는 도구는 오류, 그 밖은 연결 안 됨 */
export function toolState(tool, live) {
  if (live?.state && FLOW_STATE[live.state]) return FLOW_STATE[live.state];
  return tool.state === 'found' && tool.ready === 0 ? 'error' : 'idle';
}
/** 값마다 출처 상태(6.5 freshness의 입력): 클러스터 안 도구마다 { state: toolState, last(ms, 마지막으로 읽은 시각) }. lives: 설정의 wake.conn.live, cluster: 키 앞부분 */
export function sourcesOf(tools = [], lives = {}, cluster = '') {
  return Object.fromEntries(tools.map(x => { const live = lives[`${cluster}-${x.kind}`]; return [x.kind, { state: toolState(x, live), last: Date.parse(live?.last ?? x.last ?? '') || null }]; }));
}
/** heartbeat가 오지 않는 Node 이름(agent.heartbeat nodes의 stale·missing) */
export const silentNodes = agent => (agent?.nodes ?? []).filter(n => n.state !== 'ok').map(n => n.node);
/** 에이전트 칩 상태: agent.status(lookup, rolloutReady) + heartbeat(beatLookup, nodes) */
export function agentState(agent) {
  if (!agent) return 'idle';
  if (agent.lookup === 'present') {
    /* heartbeat(beatLookup, nodes): 모든 Node가 끊기면 끊김, 일부만 끊기거나 읽지 못하면 제한 */
    const silent = silentNodes(agent);
    if (agent.beatLookup === 'forbidden') return 'perm';
    if (agent.nodes?.length && silent.length === agent.nodes.length) return 'error';
    if (agent.rolloutReady !== true) return agent.rolloutReady === false ? 'busy' : 'limited';
    return silent.length || (agent.beatLookup && agent.beatLookup !== 'ok') ? 'limited' : 'ok';
  }
  return agent.lookup === 'forbidden' ? 'perm' : agent.lookup === 'absent' || agent.installed === false ? 'idle' : 'error';
}

/** 홈 기간 프리셋(kit 시간 범위) -> 초 */
export const PRESET_SECONDS = Object.freeze({ '15m': 900, '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 });
/** 화면 기간 값({ preset } 또는 { from, to, live }, 초) -> { from, to } ms. now: 기준 시각(ms) */
export function windowOf(value, now) {
  if (value?.from != null && value?.to != null) return { from: value.from * 1000, to: value.live ? now : value.to * 1000 };
  return { from: now - (PRESET_SECONDS[value?.preset] ?? 3600) * 1000, to: now };
}
/** 질의 step: 표본 n개가 들어가는 15초의 배수(Grafana가 반올림하는 방식) */
export const stepOf = (from, to, n = 120) => Math.max(15, Math.round((to - from) / 1000 / (n - 1) / 15) * 15);

export { MIN, HOUR, DAY };
