/*
 * 설정 › 도구·에이전트 화면(시뮬레이션 toolsPage · toolDetail · agentPage · agentDetail)이 같이 쓰는 조각:
 * 연결 상태 글과 표시(ok · limited · perm · idle · error · busy, kit source.* 말), 도구 한 줄의 값(이름 · 역할 · 주소 · 버전 · 상태 · 마지막 확인),
 * 상태가 부르는 동작 하나, 응답 지연 차트(지난 6시간), 에이전트의 값(agent.status + agent.heartbeat).
 */
import { components as C, text, formatValue } from '../../../kit/page/index.js';
import { sourceOff } from '../data/index.js';
import { toolState, agentState, silentNodes, HOUR } from '../data/home.js';
import { formatToolVersion } from '../version-display.js';
import { hm, when } from './incident-parts.js';

export const STATE_KIND = { ok: 'ok', limited: 'warn', perm: 'perm', idle: 'idle', error: 'error', busy: 'busy' };
export const STATES = Object.keys(STATE_KIND);
/** 연결 상태 표시: 정상은 아이콘만, 그 밖은 아이콘 + 상태 글 */
export const stateMark = (t, state) => (state === 'ok' ? C.statusIcon.render({ kind: 'ok', label: t('source.ok') }) : stateWords(t, state));
/** 상태 칸(이름 붙은 값 칸): 정상도 아이콘 + 상태 글 */
export const stateWords = (t, state) => (state === 'ok' ? C.statusIcon.render({ kind: 'ok', subject: t('source.ok') }) : C.statusIcon.render({ kind: STATE_KIND[state] ?? 'idle', text: t(`source.${STATE_KIND[state] ? state : 'idle'}`) }));
/** 상태가 부르는 동작 하나(시뮬레이션과 같음): 연결됨은 연결 확인, 연결 안 됨은 연결, 권한·제한은 필요한 권한(상세), 끊김은 다시 시도.
 *  label은 사전 키(연결 행이 한 번 읽음, 단추에 바로 쓰는 곳은 text()로 읽음): 번역한 글을 넘기면 다시 키로 찾는다(R5-05) */
export function stateAction(state, { connect, detail }) {
  if (state === 'busy') return null;
  if (state === 'ok') return { label: 'wake.tool.check', icon: 'arrow-rotate-clockwise', variant: 'ghost', ...connect };
  if (state === 'idle') return { label: 'wake.flow.connect', ...connect };
  if (state === 'perm' || state === 'limited') return { label: 'wake.tool.needPerm', variant: 'secondary', ...detail };
  return { label: 'wake.flow.a.retry', ...connect };
}

/** 도구 행·상세 머리의 동작 하나(label은 사전 키, 상태 표시와 같은 판단, 사용자 지적 2026-11-15 "연결됨인데 누르면 연결하라고 뜸"): 연결됨·제한은 그 도구를 엶,
 *  연결 안 됨은 연결하는 곳(설정 › 도구)으로, 권한·끊김은 stateAction(상세 · 다시 시도). arg: { cluster, tool } */
/* listed: 지금 열 대상(확인된 바인딩)이 있음(판단 함수의 openable). 근거로만 남은 도구·확인 못 한 행은 열기를 두지 않음(다시 시도는 아래 실패 줄, 사유는 줄 설명) */
export function toolAction(state, arg, detail, listed = true) {
  if ((state === 'ok' || state === 'limited') && !listed) return null;
  if (state === 'ok' || state === 'limited') return { label: 'wake.home.open', icon: 'arrow-up-right', variant: 'ghost', action: 'wake.tool.open', arg };
  if (state === 'idle') return { label: 'wake.tools.manage', icon: 'arrow-up-right', variant: 'link', action: 'kit.navigate', arg: { address: 'wake://settings/tools', newTab: true } };
  return stateAction(state, { connect: { action: 'wake.tool.connect', arg }, detail });
}

/** 클러스터 안 도구 목록(tools.find) -> 화면 줄: { id, name, icon, role, where, version, state, last, raw } */
export function toolRows(t, tools, kinds, lives, cluster) {
  return tools.map(x => { const k = kinds.find(y => y.id === x.kind) ?? { name: x.kind, icon: 'puzzle', role: '' }, live = lives[`${cluster}-${x.kind}`];
    return { id: x.kind, name: k.name, icon: k.icon, role: k.role ? t(`wake.tool.role.${k.role}`) : '', where: x.svc || '', version: formatToolVersion(x.version), state: toolState(x, live),
      last: Date.parse(live?.last ?? x.last ?? '') || null, live, raw: x.raw || x }; });
}
/** toolViews(conn-view)의 도구 하나 -> 화면 줄: 열거에 있으면 그 값(이름 · 역할 · 주소 · 버전), 연결 기록만 있으면 이름만. 상태는 판단 함수의 health 하나 */
export function viewRow(t, v, kinds, lives, cluster) {
  const base = v.tool ? toolRows(t, [v.tool], kinds, lives, cluster)[0]
    : (k => ({ id: v.kind, name: k.name, icon: k.icon, role: k.role ? t(`wake.tool.role.${k.role}`) : '', where: '', version: '', last: null, live: lives[`${cluster}-${v.kind}`], raw: { kind: v.kind } }))(kinds.find(y => y.id === v.kind) ?? { name: v.kind, icon: 'puzzle', role: '' });
  return { ...base, state: v.health, reason: v.reason, listed: !!v.openable, blocked: v.blocked ?? null, last: Date.parse(v.last ?? '') || base.last };
}
/** 마지막 성공: 그 도구의 확인 기록(toolChecks samples)의 마지막 응답과 허브의 지난 성공(연결됨일 때) 중 늦은 것, 없으면 null.
 *  도구 목록의 "확인"과 도구 상세의 "마지막 성공"이 같은 시각을 말한다(R5-04) */
export const lastSuccess = (x, samples) => Math.max(samples?.filter(s => s.ms != null).at(-1)?.at ?? 0, x.state === 'ok' ? x.last ?? 0 : 0) || null;
/* blocked: 열 수 없는 사유(권한 필요한 동사·리소스, 또는 준비 안 됨)를 설명 끝에 */
export const blockedText = (t, b) => (!b ? '' : typeof b === 'string' ? t(b) : t(b.key, b.vars));
export const toolLine = (t, x) => [x.role, x.where, x.version, x.last ? t('wake.tool.checkedAt', { at: when(x.last, Date.now()) }) : '', blockedText(t, x.blocked)].filter(Boolean).join(' · ');

/** 지난 6시간 ms 기록(1분 표본, 응답 없음은 null) -> kit 차트 카드. 응답 없는 구간은 비운다 */
/** 지연 값 하나의 글(1초부터 s, 그 아래 ms: 축과 같은 규칙) */
export const latencyText = ms => formatValue(ms, 'ms');
/* 카드 머리가 이미 이름을 말하므로 차트 제목·범례는 두지 않음(선 하나). 시간 축은 지난 6시간 안에서 자료가 있는 구간(최소 15분)만(A2-24).
   첫·마지막 표본이 그림 가장자리에서 반쪽 잘리지 않게 축은 자료 앞뒤로 표본 간격(1분)의 반만큼 넓다(R4-12) */
const EDGE_MS = 30_000;
export function latencyChart(t, { id, title, samples, end }) {
  const recent = samples.filter(s => s.at >= end - 6 * HOUR && s.ms != null), from = Math.max(end - 6 * HOUR, Math.min(recent[0]?.at ?? end, end - HOUR / 4)) - EDGE_MS, label = at => hm(at);
  const to = Math.max(end, recent.at(-1)?.at ?? end) + EDGE_MS;
  const obs = recent.map((s, j) => ({ at: s.at / 1000, value: s.ms, label: `${label(s.at)} · ${latencyText(s.ms)}`, joinPrevious: j > 0 }));
  return C.chartCard.render({ title, hideTitle: true, value: '', widget: true, density: 'compact', legend: false,
    chart: { kind: 'area', height: 140, bleed: true, fade: true, reading: true, axes: true, unit: 'ms', id: `${id}:latency`, interactive: 'none',
      series: [{ key: 'ms', name: title, color: '--series-1', dash: 'none', pattern: 'solid', observations: obs }], timeAxis: { from: from / 1000, to: to / 1000, maxGapSeconds: 150 } } });
}

/** 에이전트(agent.status + agent.heartbeat): 상태, 버전, namespace, Ready·Desired, heartbeat 시각·지연, watch 종류, 캐시, heartbeat 없는 Node(silent) */
export function agentFacts(agent) {
  const c = agent?.rollout?.counters;
  return { state: agentState(agent), version: agent?.version ?? '', namespace: agent?.identity?.namespace ?? '', image: agent?.imageRef ?? '',
    ready: c ? { ready: c.numberReady, desired: c.desiredNumberScheduled } : null, beat: agent?.heartbeat ?? null, watch: agent?.watch ?? null, rules: agent?.rules ?? null, silent: silentNodes(agent),
    missing: agent?.lookup === 'absent' || (!agent?.lookup && agent?.installed === false) };
}
/** Ready·Desired 이름 붙은 값(분수 금지) */
/** 출처가 없는 기록 카드: 접힌 요약 막대에 그 출처의 연결 안 됨(card: 화면의 요약 막대 만들기) */
export const offCard = (card, key, label, source) => { const off = text(sourceOff(source));
  return card(key, label, [{ id: 's', label: '', value: C.statusIcon.render({ kind: 'idle', text: off }) }], C.emptyState.render({ title: off, variant: 'line' }), false); };
export const readyText = r => (r ? `Ready ${r.ready} · Desired ${r.desired}` : '');
