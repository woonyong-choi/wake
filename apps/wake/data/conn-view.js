import { ACTIONS } from './connect-flow.js';
import { toolState } from './home.js';
import { TOOL_KINDS } from './tool-kinds.js';
import { sourceView } from '../../../kit/page/index.js';

/*
 * 연결 행 하나의 모습(데이터): 연결 흐름의 지금 모습(설정 wake.conn.live)과 연결 기록(wake.connections)에서 상태 아이콘 종류, 한 줄 설명,
 * 머리의 동작 버튼, 단계를 만든다. 첫 실행, 설정(클러스터·도구·AI·알림·GitOps), 클러스터 대시보드가 같은 값으로 kit 연결 행을 그린다.
 * 머리 동작은 상태 하나에서만 나옴(HEAD 표): 진행 중에는 연결됨의 동작(열기·연결 해제)이 절대 나오지 않음.
 * 설명 줄은 그 연결이 무엇인지, 상태는 행 끝 상태 묶음(진행 숫자 없음). 연결됨은 누구 자격인지 짧게(서비스 계정 wake-reader · 읽기 전용).
 */
/* 상태 -> 머리 상태 아이콘 종류. 멈춘 흐름은 원인의 종류(error 빨강, fix 주황, perm 중립)가 우선 */
const KIND = { idle: 'idle', running: 'busy', waiting: 'busy', 'needs-install': 'fix', 'needs-login': 'fix', 'needs-input': 'fix', 'needs-approve': 'fix', 'needs-perm': 'perm', watching: 'busy',
  failed: 'error', cancelled: 'idle', timeout: 'error', connected: 'ok' };
const STATE_WORD = { running: 'wake.conn.st.running', waiting: 'wake.conn.st.waiting', cancelled: 'wake.conn.st.cancelled', idle: 'wake.conn.st.idle', watching: 'wake.flow.watch' };

/* 상태마다 머리에 올 수 있는 동작(이 표 밖의 버튼은 나오지 않음, conn-view.test.mjs가 고정).
   connect: 연결 전 주 버튼, alt: 대체 방법(토큰 직접 입력), cancel: 진행 중 취소(취소할 수 있는 흐름만), step: 멈춘 단계의 동작 하나(흐름 단계가 없을 때만, 있으면 그 흐름의 동작들이 행 끝에),
   open: 도구 열기, disconnect: 연결 해제 */
export const HEAD = {
  idle: ['alt', 'connect'], running: ['cancel'], waiting: ['cancel'],
  'needs-install': ['step'], 'needs-login': ['step'], 'needs-input': ['step'], 'needs-approve': ['step'], 'needs-perm': ['step'], watching: ['perm'], failed: ['step'], timeout: ['step'], cancelled: ['step'],
  connected: ['open', 'disconnect'],
};


/** 읽기 하나의 결과(세 갈래를 섞지 않음): 아직 읽지 않음 · 읽기 실패(error 보존) · 값 */
export const read = { unread: () => ({ status: 'unread' }), failed: error => ({ status: 'failed', error }), ok: value => ({ status: 'ok', value }) };
/** 약속 하나를 읽기 결과로(거절을 null이나 빈 값으로 바꾸지 않음) */
export const readOf = promise => Promise.resolve(promise).then(read.ok, read.failed);

/*
 * 찾기 확인 근거(설정 wake.tools.found): 찾기가 고정 receipt로 확인한 도구(verified·not-ready)를 클러스터·종류·Service UID·확인 시각으로 남긴다.
 * 열거를 읽지 못하는 동안에도 이 근거로 도구가 남는다(건강은 허브·실패 사유). 열거가 다시 오면 같은 대상(같은 UID)일 때만 유지하고
 * 다른 UID거나 그 종류가 없으면 지운다. 클러스터 연결을 해제하면 그 클러스터 것을 모두 지운다(forgetFound).
 */
export const FOUND_KEY = 'wake.tools.found';
const FOUND_SELECTIONS = ['verified', 'not-ready'];
const foundOf = (settings, cluster) => Object.fromEntries(Object.entries(settings?.[FOUND_KEY] || {})
  .filter(([key, r]) => r && r.cluster === cluster && key === `${cluster}-${r.kind}` && typeof r.uid === 'string' && r.uid));
/** 열거 읽기 결과로 갱신한 찾기 확인 근거 전체. 바뀐 것이 없으면 null(설정을 다시 쓰지 않음). 열거가 값이 아니면 근거를 건드리지 않음 */
export function foundAfter(settings, cluster, inventory, at = new Date().toISOString()) {
  if (!cluster || inventory?.status !== 'ok') return null;
  const all = settings?.[FOUND_KEY] || {}, mine = foundOf(settings, cluster), next = Object.fromEntries(Object.entries(all).filter(([, r]) => r?.cluster !== cluster));
  for (const tool of inventory.value || []) {
    if (!tool?.kind || typeof tool.uid !== 'string' || !tool.uid) continue;
    const key = `${cluster}-${tool.kind}`, old = mine[key], raw = tool.raw || tool; // raw: 서비스가 준 그대로(ns · Service 이름 · 포트), 화면용 svc 글이 아님
    const target = { ns: typeof raw.ns === 'string' ? raw.ns : '', svc: typeof raw.svc === 'string' ? raw.svc : '', port: Number.isInteger(raw.port) ? raw.port : null };
    if (FOUND_SELECTIONS.includes(tool.selection)) next[key] = old?.uid === tool.uid && old.ns === target.ns && old.svc === target.svc && old.port === target.port ? old : { cluster, kind: tool.kind, uid: tool.uid, ...target, at };
    else if (old?.uid === tool.uid) next[key] = old; // 같은 대상을 지금 확인하지 못했을 뿐(일시 오류): 근거 유지
  }
  return JSON.stringify(next) === JSON.stringify(all) ? null : next;
}
/** 열거 읽기 결과를 찾기 확인 근거에 반영(바뀔 때만 설정을 씀). get: 지금 설정 전체, set: 설정 쓰기(key, value) */
export const rememberFound = (get, set, cluster, inventory) => { const next = foundAfter(get() || {}, cluster, inventory); if (next && set) set(FOUND_KEY, next); };
/** 클러스터 연결 해제: 그 클러스터의 찾기 확인 근거를 모두 지운 전체(바뀐 것이 없으면 null) */
export const forgetFound = (settings, cluster) => { const all = settings?.[FOUND_KEY] || {}, next = Object.fromEntries(Object.entries(all).filter(([, r]) => r?.cluster !== cluster));
  return Object.keys(next).length === Object.keys(all).length ? null : next; };

/**
 * 도구 상태 판단 하나(홈 칩, 홈 연결 카드, 위쪽 도구 메뉴, 클러스터 도구 목록, 도구 상세, 설정 › 도구가 모두 이것만 씀).
 * 입력: cluster, settings(연결 기록 wake.connections, 연결 흐름 wake.conn.live), inventory(도구 열거 tools.find의 읽기 결과), hub(허브 출처 상태 hub.sources의 읽기 결과).
 * 출력: 도구 종류마다 { kind, tool, included, health, reason, retry }와 목록 전체의 { inventory: 'unread'|'failed'|'ok', retry }.
 *   included: 연결 근거가 있음 — 찾기가 고정 receipt로 확인(verified, 그 receipt의 Pod 준비가 내려간 not-ready) 또는 같은 대상(이 클러스터·이 종류)의 연결 기록.
 *     저장한 찾기 확인 근거(wake.tools.found)도 연결 근거: 열거를 읽지 못하면(아직·실패) 그대로, 열거가 왔으면 그 종류의 행이 같은 Service UID일 때만
 *     (같은 대상을 지금 확인하지 못함 — Endpoints 권한·일시 오류의 unverified·not-ready도 포함). 다른 UID거나 성공한 목록에 없으면 근거가 아님.
 *     열거·허브 읽기가 실패해도 연결 기록이나 찾기 확인 근거가 있는 도구는 포함, 한 번도 연결·확인하지 않은 도구는 제외(허브에 실패 시도만 있는 것도 제외).
 *   health: ok · limited · perm · idle · error · busy(SOURCE_VIEW 말). 허브 읽기 실패나(허브가 그 종류를 읽는데) 열거 실패면 error(확인 불가)와 reason, 과거 정상(끝난 연결 흐름)을 지금 건강으로 쓰지 않음.
 *     허브가 읽기에 성공했지만 그 종류의 항목이 없으면 찾기 결과와 지금 진행 중이거나 이번 실행의 확인으로 남은 연결 흐름(toolState).
 *   reason: 'hub'(출처 상태 읽기 실패) · 'inventory'(도구 열거 실패) · 'missing'(연결 기록은 있으나 열거에 없음) · null. retry: 다시 읽으면 바뀔 수 있음(실패)
 *   openable: 지금 열 대상(확인된 바인딩)이 있음 — 포함된 도구의 현재 열거 행이 verified. 근거로만 남은 도구·확인 못 한 행은 열지 않음.
 *   blocked: 열거 행이 있는데 열 수 없는 사유(권한 { key, vars } 또는 'wake.home.toolNotReady'), 없으면 null. 건강과 따로 보인다.
 */
export function toolViews({ cluster, settings = {}, inventory = read.unread(), hub = read.unread() }) {
  const recs = settings['wake.connections'] || {}, lives = settings['wake.conn.live'] || {};
  const tools = inventory.status === 'ok' ? inventory.value || [] : [];
  const recorded = kind => {
    const r = recs[`${cluster}-${kind}`], saved = r?.where?.tool, current = tools.find(t => t.kind === kind);
    if (!r || r.kind === 'cluster') return false;
    if ((saved?.kind && saved.kind !== kind) || (r.where?.cluster && r.where.cluster !== cluster)) return false;
    return !current || !saved?.uid || current.uid === saved.uid;
  };
  const found = foundOf(settings, cluster), receipt = kind => found[`${cluster}-${kind}`] || null;
  const wasFound = kind => { const f = receipt(kind); if (!f) return false; if (inventory.status !== 'ok') return true; const row = tools.find(t => t.kind === kind); return !!row && row.uid === f.uid; };
  const kinds = [...new Set([...tools.map(t => t.kind), ...TOOL_KINDS.map(k => k.id).filter(k => recorded(k) || wasFound(k))])];
  const states = hub.status === 'ok' ? hub.value || {} : {};
  const views = kinds.map(kind => {
    const tool = tools.find(t => t.kind === kind) || null;
    const included = (!!tool && FOUND_SELECTIONS.includes(tool.selection)) || wasFound(kind) || recorded(kind);
    let health, reason = null;
    if (hub.status === 'failed') { health = 'error'; reason = 'hub'; }
    else if (hub.status === 'unread') health = 'busy';
    else if (states[kind]) health = sourceView(states[kind].state);
    else if (inventory.status === 'failed') { health = 'error'; reason = 'inventory'; }
    else if (inventory.status === 'unread') health = 'busy';
    else if (!tool) { health = 'error'; reason = 'missing'; }
    else health = toolState(tool, lives[`${cluster}-${kind}`]);
    const openable = included && tool?.selection === 'verified';
    const blocked = tool && !openable ? toolPermissionLabel(tool) || 'wake.home.toolNotReady' : null;
    return { kind, tool, found: receipt(kind), included, openable, blocked, health, reason, retry: hub.status === 'failed' || inventory.status === 'failed', last: states[kind]?.lastSuccessAt ?? null };
  });
  return { views, included: views.filter(v => v.included), inventory: inventory.status, hub: hub.status, retry: hub.status === 'failed' || inventory.status === 'failed' };
}
/** 도구 상태 -> 연결 행 상태 아이콘 종류 */
export const SOURCE_KIND = { ok: 'ok', limited: 'warn', perm: 'perm', idle: 'idle', error: 'error', busy: 'busy' };

export function hasToolReadPath(settings, key, tool) {
  if (tool.permission) return false;
  const saved = settings['wake.connections']?.[key]?.where?.tool;
  return settings['wake.conn.live']?.[key]?.state === 'connected' && saved?.kind === tool.kind
    && Boolean(tool.ns && tool.svc && saved.ns === tool.ns && saved.svc === tool.svc);
}

export function toolPermissionLabel(tool) {
  const permission = tool.permission;
  if (permission?.verb !== 'get' || !['services', 'endpoints', 'pods'].includes(permission.resource) || permission.namespace !== tool.ns) return null;
  return { key: 'wake.home.toolPermission', vars: { permission: `${permission.verb} ${permission.resource}` } };
}

/** 연결 기록의 자격 한 줄: 서비스 계정 이름·역할, 또는 내 로그인. 늘 권한 수준을 붙임 */
const credentialLine = (rec, live) => {
  const who = live?.identity || rec?.identity;
  if (rec?.method === 'tool-open') return { key: 'wake.conn.cred.none' };
  return rec?.credentialMode === 'service' || who ? { key: 'wake.conn.cred.service', vars: { who: who || '' } } : { key: 'wake.conn.cred.personal' };
};

/**
 * @param {object} st 설정 값, @param {string} key 연결 키, @param {{ connect?: object, alt?: object, open?: object, idleText?: object, connectedText?: object }} o
 *   connect: 연결 전 주 버튼(로그인해서 연결 · 연결), alt: 대체 방법 버튼, open: 연결됨일 때 여는 버튼, idleText: 연결 전 설명(서비스 주소), connectedText: 연결됨 설명
 * @returns {{ state, kind, busy, attention, description, action, extra: object[], flow, connected, note }}  action: 주 버튼 하나, extra: 그 앞의 버튼들
 */
export function connView(st, key, o = {}) {
  /* 연결한 도구를 여는 중이면(포트 포워딩, key:open) 그 흐름이 줄을 차지: 여는 동안 진행, 닿지 않으면 그 자리에서 멈춤 */
  const lives = st['wake.conn.live'] || {}, flowKey = lives[key + ':open'] ? key + ':open' : key, live = lives[flowKey], rec = (st['wake.connections'] || {})[key];
  /* 흐름이 있으면 그 상태만 믿음(기록은 흐름이 없을 때만: 앱을 다시 켰을 때 확인 전) */
  const state = live?.state || (rec ? 'connected' : 'idle');
  const flow = live?.steps?.length ? { steps: live.steps, cause: live.cause, kind: live.kind, actions: live.actions, status: live.status, raw: live.raw, short: live.short, approval: live.approval === true, explain: live.explain === true } : null;
  /* 설명 줄은 늘 그 연결이 무엇인지(종류 · 버전, 서비스 주소): 진행·멈춤은 행 끝 상태 묶음(글 + 상태 아이콘)이 말함 */
  const base = o.idleText || o.connectedText || (rec ? { key: 'wake.conn.withCred', vars: { cred: credentialLine(rec, live) } } : null);
  const description = state === 'connected' ? (live?.note || o.connectedText || { key: 'wake.conn.withCred', vars: { cred: credentialLine(rec, live) } })
    : base && flow && state !== 'idle' ? base
    : state === 'watching' ? STATE_WORD.watching : live?.cause && state !== 'running' ? live.cause : live?.hint && state === 'running' ? live.hint : STATE_WORD[state] && state !== 'idle' ? STATE_WORD[state] : o.idleText || STATE_WORD.idle;
  const busy = state === 'running' || state === 'waiting';
  const btn = {
    connect: () => o.connect || null,
    alt: () => o.alt || null,
    cancel: () => (live?.cancel ? { ...ACTIONS.cancel, arg: { key: flowKey } } : null),
    step: () => (flow ? null : live?.actions?.[0] || o.connect || null),
    open: () => o.open || null,
    perm: () => ({ label: 'wake.flow.a.perm', icon: 'lock', variant: 'ghost', action: 'wake.flow.perm', arg: { key: flowKey } }),
    disconnect: () => ({ ...ACTIONS.disconnect, arg: { key } }),
  };
  const all = (HEAD[state] || []).map(id => btn[id]()).filter(Boolean);
  const stopped = /^needs-|^failed$|^timeout$/.test(state);
  /* 행 끝 상태 글(결정: 상태 아이콘과 그 왼쪽 짧은 글, 정상은 아이콘만): 단계가 있는 흐름은 그 흐름의 글이 말하므로 없음, 설명 줄과 같은 말이면 없음 */
  const word = state === 'connected' || flow || !STATE_WORD[state] || STATE_WORD[state] === description ? null : STATE_WORD[state];
  return { state, kind: (stopped && live?.kind && live.kind !== 'busy' ? live.kind : KIND[state]) || 'unknown', busy: busy || state === 'watching', attention: stopped, description, action: all.at(-1) || null, extra: all.slice(0, -1),
    flow, connected: state === 'connected', note: live?.note || null, key: flowKey, word };
}
