/*
 * 클러스터 본문 화면(GitOps, 알림, 네트워크)이 같이 쓰는 조각: 클러스터 이름, 머리, 출처 끊김 줄(B4), "다른 종류에서 N건"(AI 작업 기록).
 * 범위 검색 상자(scope-box.js)의 namespace 고르기도 여러 개 고르기(multiPick)를 쓴다.
 */
import { createReadGuard } from '../data/read-state.js';
import { components as C, sourceView } from '../../../kit/page/index.js';
import { clusterPresentation } from '../data/live.js';
import { freshness } from '../data/incident-model.js';
import { sourcesOf } from '../data/home.js';
import { localTime, status, num } from './parts.js';

export const SCOPE_W = 'calc(var(--space-40) + var(--space-10))';

export const clusterNameOf = (ctx, id) => { const saved = (ctx.settings?.()['wake.clusters.list'] || []).find(c => c.id === id); return clusterPresentation(saved || { id }).name; };
export const viewHeader = (icon, title, sub, end) => C.pageHeader.render({ icon, title, sub, size: 'home', ...(end ? { end } : {}) });

/* 클러스터 구역 알약 탭(시뮬레이션 sim.js:211-215 topbar): 홈 · 리소스 · 네트워크 · GitOps · 이벤트 · 로그 · 알림 · 인시던트. 이 여덟 화면의 머리 끝에 두고, 누르면 같은 탭에서 그 구역(앱 동작 wake.view.section) */
export const SECTIONS = ['home', 'resources', 'network', 'gitops', 'events', 'logs', 'alerts', 'incidents'];
/* 좁은 칸에서는 줄을 옆으로 스크롤(sim .sim-nav: 글자를 자르지 않음, 고른 탭이 보이게) */
export const sectionTabs = (t, current) => C.pillTabs.render({ id: 'wake-section', value: current, action: 'wake.view.section', spaced: true,
  tabs: SECTIONS.map(v => ({ id: v, label: v === 'gitops' ? 'GitOps' : t(`wake.view.${v}`) })) });

/** 여러 개 고르기: 지금 고른 것(null은 전부)과 메뉴의 선택 하나(또는 전부·없음) -> 새 값(전부나 하나도 없으면 null: 아무것도 고르지 않음은 거르지 않음이라 메뉴도 전부 체크로 보인다, C-15) */
export const multiPick = (cur, all, a) => { const arg = a.arg?.value !== undefined || a.arg?.values ? a.arg : a, set = new Set(cur ?? all);
  if (Array.isArray(arg.values)) { set.clear(); for (const v of arg.values) set.add(v); } else { const v = String(arg.value ?? arg); set.has(v) ? set.delete(v) : set.add(v); }
  const picked = all.filter(n => set.has(n)); return picked.length === all.length || !picked.length ? null : picked; };

/** 클러스터 안 도구의 출처 상태(sourcesOf)를 읽는 것: 끊긴 출처의 줄(오류색 "<도구> 끊김" · 마지막 수집 시각, 설정으로 가는 링크) */
export function sourceLines(ctx, cluster) {
  const { t } = ctx;
  let tools = null, hub = {};
  /* 허브가 직접 읽은 출처(hub.sources: 마지막 성공 시각과 실패)가 연결 흐름 상태보다 앞선다. 허브가 아직 읽지 않은 출처는 연결 흐름 상태 */
  const beginRead = createReadGuard();
  const read = async (ownerCurrent = () => true) => {
    const current = beginRead();
    const [nextTools, nextHub] = await Promise.all([
      ctx.data.get('clusterTools', { cluster, discovery: {} }).catch(() => []),
      ctx.data.get('sourceStates', { cluster }).catch(() => ({})),
    ]);
    if (!current() || !ownerCurrent()) return;
    tools = nextTools || []; hub = nextHub || {};
  };
  const sources = () => ({ ...sourcesOf(tools ?? [], ctx.settings?.()['wake.conn.live'] || {}, cluster),
    ...Object.fromEntries(Object.entries(hub).map(([kind, s]) => [kind, { state: sourceView(s.state), last: s.last }])) });
  /** 출처 하나의 지금 상태: { stale, state, last } — 도구 목록을 읽기 전이나 클러스터에 그 도구가 없으면 null */
  const of = (kind, now) => (tools && (tools.some(x => x.kind === kind) || hub[kind]) ? freshness(sources(), kind, now) : null);
  const KIND = { idle: 'idle', perm: 'perm' };
  const TEXT = { idle: 'wake.view.toolOff', perm: 'wake.view.toolPerm' };
  /** 끊긴 출처의 줄 하나(끊기지 않았으면 빈 글) */
  const line = (kind, name, now) => {
    const f = of(kind, now); if (!f?.stale) return '';
    const last = f.last ? t('wake.view.lastCollected', { at: localTime(f.last)?.slice(0, 16) ?? '' }) : '';
    return C.staleLine.render({ kind: KIND[f.state] ?? 'error', text: [t(TEXT[f.state] ?? 'wake.view.toolDown', { tool: name }), last].filter(Boolean).join(' · '),
      action: { label: t('wake.ci.settings'), action: 'kit.navigate', arg: { address: `wake://settings/cluster-${encodeURIComponent(cluster)}` } } });
  };
  const matches = (kind, target) => { const current = hub[kind];
    return !current?.previous && current?.state !== 'unconfigured' && (!target?.uid || !current?.target?.uid || target.uid === current.target.uid);
  };
  return { read, of, line, matches, ready: () => tools !== null };
}

/** 목록 화면 아래 "다른 종류에서 N건"(검색이 다른 종류의 이름과 맞을 때): 클러스터 전체 검색으로 */
export const otherKinds = (ctx, search, cluster, q) => { const n = q ? search.otherCount(q) : 0;
  return n ? C.button.render({ label: ctx.t('wake.rv.otherKinds', { n: num(n) }), icon: 'arrow-up-right', variant: 'link', action: 'kit.navigate', arg: { address: `wake://cluster/${encodeURIComponent(cluster)}?q=${encodeURIComponent(q)}` } }) : ''; };

/** 읽기 실패의 원인(RULE-STATE 오류: 실패 범위·원인·재시도). 오류의 kind·status, 화면 경계를 지나며 kind가 빠진 오류는 글(HTTP 상태·시간 초과·접속)에서 고른다 */
const CAUSE_KIND = { timeout: 'timeout', identity_changed: 'identity_changed', invalid_request: 'invalid_request', invalid_response: 'invalid_response', unconfigured: 'unconfigured',
  forbidden: 'forbidden', unauthorized: 'forbidden', connection: 'network_error', unreachable: 'network_error', network_error: 'network_error' };
export function readCause(t, e) {
  /* the hub names a source's HTTP answer as its code (http_400): the status, as the message's "HTTP 400" */
  const message = String(e?.message ?? ''), status = Number(e?.status) || Number(/^http_(\d{3})$/.exec(e?.kind ?? '')?.[1]) || Number(/HTTP (\d{3})/.exec(message)?.[1]) || null;
  if (e?.kind === 'response_too_large') return t('wake.log.tooLarge');
  const kind = CAUSE_KIND[e?.kind] ?? (status === 403 || status === 401 ? 'forbidden' : /timed? ?out|timeout|no answer/i.test(message) ? 'timeout'
    : /unreachable|ECONN|ENOTFOUND|EHOSTUNREACH|socket hang up|connect /i.test(message) ? 'network_error' : null);
  return kind ? t('wake.monitor.status.' + kind) : status ? `HTTP ${status}` : t('wake.monitor.status.query_error');
}
/** 실패 줄의 글: 무엇을 못 읽었는지 · 원인 */
export const readFailure = (t, e, scope = t('wake.find.c.read')) => `${scope} · ${readCause(t, e)}`;
const READ_WORD = { forbidden: 'wake.flow.c.forbidden', lokiUnavailable: 'wake.log.lokiUnavailable', cancelled: 'wake.flow.c.cancelled' };
/** 읽기 실패(다시 시도) 줄: 다른 카드 머리와 같은 줄(높이·안쪽 여백), 버튼도 그 안에서 위아래 같은 여백. 읽는 중은 글 대신 화면 자리의 뼈대(skeletonBar·skeletonTable) */
export const readRow = (t, state, retry, message = t(READ_WORD[state] ?? 'wake.find.c.read')) => state === 'loading' ? skeletonBar(t('wake.res.loading'), 1, t('wake.res.loading'))
  : C.summaryBar.render({ label: message, items: [
    { id: 's', label: '', value: C.statusIcon.render({ kind: state === 'forbidden' ? 'perm' : state === 'cancelled' ? 'idle' : 'error', text: message }), shrink: true, priority: 9 },
    { id: 'r', label: '', value: C.button.render({ label: t('wake.flow.a.retry'), size: 'sm', variant: 'secondary', action: retry }), priority: 9 }] });

/* ---------- 읽는 동안의 뼈대(홈과 같은 방식, 사용자 승인 2026-11-16): 화면의 실제 줄과 표 자리를 먼저 그리고 값 자리만 회색 막대(kit skeleton) ---------- */
export const SKEL = C.skeleton.render({ width: 'calc(var(--space-4) * 1.5)' });
/** 값 자리 하나: 아직 오지 않았으면 뼈대, 왔으면 그 값 */
export const skel = (wait, value) => (wait ? SKEL : value);
/** 이름(들)이 있는 요약 막대: 이름은 실제 글, 값 자리만 뼈대(label: 막대 이름, names: 항목 이름들 또는 항목 수, busy: 보조 기술이 읽는 '읽는 중') */
export const skeletonBar = (label, names = [label], busy = '') => C.summaryBar.render({ label, items: (Array.isArray(names) ? names : Array.from({ length: names }, () => '')).map((n, i) => ({ id: 'k' + i, label: n, value: SKEL, ...(busy && !i ? { ariaLabel: busy } : {}) })) });
/** 표 자리: 머리는 실제 열 이름, 행 n개는 값 자리 뼈대(행 높이는 글 한 줄과 같음) */
export const skeletonTable = (columns, n = 8) => C.dataTable.render({ clip: true, rowKey: 'id', rows: Array.from({ length: n }, (_, i) => ({ id: 'skel' + i })),
  columns: columns.map(c => ({ id: c.id, label: c.label, width: c.width, optional: c.optional, value: c.value, muted: c.muted, cell: () => C.skeleton.render({ width: c.value ? 'calc(var(--space-4) * 2)' : '60%', height: '1lh' }) })) });

/* 컨트롤러 원문 상태 -> 표시: Synced·Healthy·Ready·deployed는 정상, OutOfSync·Missing 경고, Progressing 진행, Degraded·Failed 오류 */
const TONE = { Synced: 'ok', Ready: 'ok', Healthy: 'ok', OutOfSync: 'warn', Missing: 'warn', Suspended: 'neutral', Unknown: 'neutral', Progressing: 'busy', Degraded: 'danger', NotReady: 'danger', Failed: 'danger' };
export const stateCell = v => (v ? TONE[v] === 'busy' ? C.statusIcon.render({ kind: 'busy', text: v }) : status([TONE[v] ?? 'neutral', v]) : '');
/** Health 칸(N3): 소유 워크로드가 준비되지 않았으면 원문 그대로 경고 색 */
export const healthCell = row => (row.warn?.length && row.health === 'Healthy' ? C.statusIcon.render({ kind: 'warn', text: row.health }) : stateCell(row.health));


/** 알림 상태 표시(목록과 상세가 같음): firing 오류, pending 진행, resolved 정상(아이콘만), 끊긴 출처는 빈 칸 */
export const alertState = s => (s === 'firing' ? C.statusIcon.render({ kind: 'error', text: s }) : s === 'pending' ? C.statusIcon.render({ kind: 'busy', text: s }) : s === 'resolved' ? C.statusIcon.render({ kind: 'ok', label: s }) : '');

