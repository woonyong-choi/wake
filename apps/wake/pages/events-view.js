/*
 * 이벤트 화면(시뮬레이션 eventsPage()): 머리(이벤트 · Kubernetes Events · 클러스터) → 범위 검색 상자(대상·Reason·메시지 · 종류 · namespace · 구간)
 * → 도구 줄(Type 알약, Reason 해제 | 목록/Reason별). 종류를 고르면 그 종류의 객체와 그것이 소유한 것(Deployment의 ReplicaSet · Pod)의 이벤트(data/scope.js)
 * → 타임라인 카드(변경 칸과 Warning 칸, 끌어 구간 좁히기) → 이벤트 카드(Warning · Reason · 전체, kubectl get events 표 30줄씩 또는 Reason별 묶음).
 * 행 = Event 하나(대상 + Reason + 메시지, Total Count = Event.count 누적), 카드 머리·알약·타임라인이 eventSummary 한 결과에서 센다(N8).
 * 머리의 Reason·발생은 구간 안 발생 수(홈 카드와 같은 셈, A2-01). 행을 누르면 그 Event의 상세 칸.
 */
import { createReadGuard } from '../data/read-state.js';
import { components as C, html } from '../../../kit/page/index.js';
import { status, eventAddress, num } from './parts.js';
import { SKEL, skel, skeletonTable, readRow, readFailure } from './view-parts.js';
import { when, hm } from './incident-parts.js';
import { eventSummary, eventRowParts } from '../data/incident-model.js';
import { eventObjectOf, changeMarks, reasonsInWindow, windowOf, CHANGE_LANES, DAY } from '../data/home.js';

const PER = 30;
/* 시각 열(at)은 한 칸 폭에서 시작해 그 시각 글만큼 넓어진다(fit: 오늘은 HH:mm, 다른 날은 날짜까지): 날짜 기준 고정 폭이 820px에서 표를 가로로 밀던 것(A-06) */
const W = { at: 'var(--space-16)', type: 'calc(var(--space-16) * 1.6)', reason: 'calc(var(--space-16) * 2)', n: 'var(--space-16)', src: 'calc(var(--space-16) * 2.2)' };
const typeCell = type => status([type === 'Warning' ? 'warn' : 'neutral', type]);
/** 구간 안 발생 수 글(구간 전에 시작한 이벤트가 있으면 "≥", 홈 카드와 같은 셈: data/home.js reasonsInWindow·warningSummary) */
export const inWindowText = (n, atLeast) => `${atLeast ? '≥' : ''}${num(n)}`;
/* 머리의 상위 Reason 둘(Warning의 구간 안 발생 수 순) */
const topReasons = (list, k = 2) => reasonsInWindow(list.filter(e => e.type === 'Warning')).slice(0, k).map(r => `${r.reason} ${inWindowText(r.n, r.atLeast)}`).join(' · ');
/** 이벤트 카드의 머리(모든 이벤트 표가 같음, 홈 경고 이벤트 카드와 같은 칸·같은 모집단): Warning 행 · 상위 Reason · Warning 구간 안 발생 · 전체 행 */
export const eventHead = (t, list) => { const warnRows = list.filter(e => e.type === 'Warning'), warn = warnRows.length, top = topReasons(list);
  const occ = warnRows.reduce((n, e) => n + (e.inWindow ?? e.count), 0), atLeast = warnRows.some(e => e.atLeast);
  return [{ id: 'w', label: 'Warning', value: num(warn), ...(warn ? { tone: 'warn', priority: 3 } : {}) }, ...(top ? [{ id: 'r', label: 'Reason', value: top, priority: 2 }] : []),
    ...(warn ? [{ id: 'o', label: t('wake.view.occurrences'), value: inWindowText(occ, atLeast), priority: 1 }] : []), { id: 'n', label: t('wake.list.all'), value: num(list.length), priority: 1 }]; };
/* Reason 칸이 Warning의 상태 표시를 갖는다(홈 경고 이벤트 카드와 같음): Type은 글만이라 좁은 폭에서 접혀도 경고가 남는다 */
/* 같은 Reason(Unhealthy 등)을 probe가 가른다: Message가 "Liveness probe …"처럼 probe로 시작하면 Reason 칸에 그 probe를 붙인다. 좁은 폭에서 Message가 접혀도 두 줄이 갈린다(R4-10) */
const probeOf = e => /^(Liveness|Readiness|Startup) probe\b/.exec(String(e.message ?? ''))?.[1] ?? '';
/* probe가 앞: 좁은 표에서 Reason 글이 말줄임으로 잘려도 갈리는 말(Liveness · Readiness)이 남는다 */
const reasonText = e => (probeOf(e) ? `${probeOf(e)} · ${e.reason}` : e.reason);
/* 좁은 표에서 Reason 칸이 자리를 돌려주면 글은 말줄임으로 끝나고 전체(probe 포함)는 올리면 보인다(reveal) */
const reasonCell = e => (e.type === 'Warning' ? C.statusIcon.render({ kind: 'warn', text: reasonText(e), reveal: true }) : reasonText(e));
/** Event.count(kubectl COUNT): 처음 난 뒤의 누적이라 머리 칸(구간 안 발생)과 다른 수임을 머리에 적는다(A2-01) */
export const TOTAL_COUNT = 'Total Count';
/** kubectl get events 표(이벤트 화면과 상세의 이벤트 탭이 같음): 행은 eventSummary 행(Event 하나: 대상 + Reason + 메시지).
 *  좁은 폭에서 대상(Object)·Count는 접지 않는다(SCR-RESOURCE-EVENTS-V02): First Seen → Source → Message → Type 순서로 접히고(A2-05, A3-09) 대상 칸이 남은 폭을 갖는다.
 *  두 시각은 Last Seen 한 칸으로 합쳐 읽는다: Last Seen 칸에 올리면 First Seen. 대상 이름은 가운데를 줄여 끝(구별하는 꼬리)을 남긴다.
 *  그래도 모자라면 가로로 밀지 않고(clip) Reason이 제 폭까지 양보해 말줄임 + 전문 툴팁 */
const eventColumns = now => [
  { id: 'last', label: 'Last Seen', time: true, width: W.at, cell: e => when(e.last, now), hint: e => `First Seen ${when(e.first, now)}` }, { id: 'type', label: 'Type', muted: true, optional: 4, width: W.type, fit: true },
  { id: 'reason', label: 'Reason', width: W.reason, fit: true, cell: reasonCell, tip: reasonText }, { id: 'obj', label: 'Object', trim: 'middle' }, { id: 'count', label: TOTAL_COUNT, kind: 'number', width: W.n, cell: e => num(e.count) },
  { id: 'first', label: 'First Seen', time: true, optional: 1, width: W.at, cell: e => when(e.first, now) }, { id: 'source', label: 'Source', muted: true, optional: 2, width: W.src }, { id: 'message', label: 'Message', muted: true, optional: 3 }];
export const eventTable = (list, { now, action, activeKey }) => C.dataTable.render({ clip: true, rowKey: 'key', rows: list.map(e => ({ ...e, obj: [e.kind, e.name].join('/') })), rowAction: action, activeKey, reveal: true, columns: eventColumns(now) });
/** 한 Event 행(kinds.js)의 상세 주소: 같은 대상 + Reason + 메시지의 가장 최근 Event 오브젝트 */
const eventRowAddress = (rows, key, cluster, at) => { const { kind, ns, name, reason, message } = eventRowParts(key);
  const e = rows.filter(x => x.object?.kind === kind && (x.object?.ns ?? '') === ns && x.object?.name === name && x.reason === reason && (x.message ?? '') === message).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  return e ? eventAddress(e, cluster, at) : ''; };

/** deps: header, box(범위 검색 상자), pending, rows(), ready(), loading(), clusterName(), folded */
export function eventsView(ctx, deps) {
  const { t, data, params } = ctx, id = params.cluster;
  let extra = { workloads: [], configmaps: [] };
  const st = () => ctx.state();
  const now = () => Date.parse(deps.rows().timeBasis?.referenceAt ?? '') || Date.now();
  const win = () => windowOf(st().evRange, now());
  const beginRead = createReadGuard();
  async function read(options) {
    const current = beginRead();
    const kinds = ['deployments', 'statefulsets', 'daemonsets', 'configmaps'];
    const [d, s, ds, cm] = await Promise.all(kinds.map(kind => data.get('resources', { cluster: id, ns: '_all', kind, at: ctx.query.at }, options).catch(() => [])));
    if (!current() || options?.signal?.aborted) return [];
    extra = { workloads: [...d.map(x => ({ ...x, kind: 'Deployment' })), ...s.map(x => ({ ...x, kind: 'StatefulSet' })), ...ds.map(x => ({ ...x, kind: 'DaemonSet' }))], configmaps: cm };
    return [];
  }
  const hay = e => [[e.kind, e.name].join('/'), e.ns, e.reason, e.message].join(' ').toLowerCase();
  function render() {
    const s = st(), q = deps.box.q(), { from, to } = win(), rel = deps.box.relation();
    const head = deps.header('k8s-event', t('wake.view.events'), ['Kubernetes Events', deps.clusterName()]);
    const range = C.timeRange.render({ id: 'events-range', value: s.evRange, action: 'kit.screen.range', fallback: '1h', retention: 7 * DAY / 1000, now: Math.floor(now() / 1000), label: t('wake.view.range') });
    /* 읽는 동안: 같은 도구 줄·타임라인·목록 막대와 표 머리를 그리고 값 자리만 뼈대(홈과 같은 방식). 읽기 실패·권한 없음은 그 줄 */
    const scope = deps.box.render({ range });
    const wait = (!deps.ready() && deps.loading()) || deps.box.wait();
    if (!deps.ready() && !wait) return html`${head}${scope}${deps.pending()}`;
    /* 범위(종류가 소유한 것)를 읽지 못하면 빈 목록 대신 그 실패와 원인 */
    if (!wait && deps.box.failure()) return html`${head}${scope}${readRow(t, 'error', 'wake.list.retry', readFailure(t, deps.box.failure()))}`;
    const all = wait ? [] : eventSummary(deps.rows().map(eventObjectOf), { from, to }).rows;
    const base = all.filter(e => rel.has(e.kind, e.ns, e.name) && (!s.evReason || e.reason === s.evReason) && (!q || hay(e).includes(q)));
    const rows = base.filter(e => s.evType === 'all' || e.type === s.evType), warnN = base.filter(e => e.type === 'Warning').length;
    const tools = C.listToolbar.render({
      filters: html`${C.pillTabs.render({ id: 'wake-ev-type', label: t('wake.rv.evType'), value: s.evType, action: 'wake.ev.type',
        tabs: [['all', t('wake.list.all')], ['Warning', 'Warning'], ['Normal', 'Normal']].map(([k, label]) => ({ id: k, label, count: skel(wait, num(k === 'all' ? base.length : k === 'Warning' ? warnN : base.length - warnN)) })) })}${s.evReason ? C.button.render({ label: t('wake.rv.clearReason', { reason: s.evReason }), icon: 'cross-medium', variant: 'ghost', size: 'sm', round: true, action: 'wake.ev.reason', arg: '' }) : ''}`,
      view: C.pillTabs.render({ id: 'wake-ev-group', label: t('wake.rv.view'), value: s.evGroup, action: 'wake.ev.group', tabs: [{ id: 'list', label: t('wake.rv.evList') }, { id: 'reason', label: t('wake.rv.byReason') }] }) });
    /* 같은 구간을 시간으로: 클러스터의 변경과 Warning(검색에 맞지 않는 표시는 흐리게), 끌어서 구간을 좁힌다 */
    const rowKey = c => c.key;
    const inScope = c => { const [k, ...n] = c.title.split('/'); return rel.has(k, c.ns, n.join('/')); };
    const warnShown = rows.filter(e => e.type === 'Warning').length;
    /* 증상(Warning) 표시는 표와 같은 모집단: 범위 밖 대상은 그리지 않고, 거르기(유형·Reason·검색)에 맞지 않는 것은 흐리게(수에 들지 않음) */
    const changes = changeMarks({ events: deps.rows(), ...extra }, { from, to }).filter(c => c.lane !== 'symptom' || inScope(c)), shownKeys = new Set(rows.map(r => r.key));
    marksSeen = changes;
    const marks = changes.map(c => ({ id: c.id, lane: c.lane, at: Math.floor(c.at / 1000), tone: c.tone,
      ...(c.lane === 'symptom' && !shownKeys.has(rowKey(c)) ? { dim: true } : {}), tip: { time: when(c.at, now()), kind: c.kind, title: c.title, text: c.text } }));
    const sec = ms => Math.floor(ms / 1000);
    const timeline = C.changeTimeline.render({ label: t('wake.rv.timeline'), from: sec(from), to: sec(to) + 60, now: sec(now()), zoomAction: 'wake.ev.zoom', selectAction: 'wake.ev.mark',
      lanes: CHANGE_LANES.map(([lane, icon]) => ({ id: lane, label: t(`wake.inc.lane.${lane}`), icon })), marks });
    const tl = C.summaryBar.render({ label: t('wake.rv.timeline'), open: !deps.folded['ev-tl'], toggle: { action: 'wake.rv.fold', arg: 'ev-tl' },
      items: [{ id: 't', label: '', value: t('wake.rv.timeline') }, { id: 'w', label: 'Warning', value: skel(wait, num(warnShown)) }, { id: 'z', label: t('wake.view.range'), value: `${when(from, 0)} – ${hm(to)}` }], body: timeline });
    let body;
    if (wait) body = skeletonTable(eventColumns(0), 10);
    else if (s.evGroup === 'reason') {
      const g = new Map();
      /* Reason마다 구간 안 발생 수(머리 Reason 칸과 같은 셈) */
      for (const e of rows) { const k = `${e.type}|${e.reason}`, x = g.get(k) ?? { key: k, type: e.type, reason: e.reason, source: e.source, n: 0, atLeast: false, objs: new Set(), last: e.last, message: e.message }; x.n += e.inWindow ?? e.count; x.atLeast ||= !!e.atLeast; x.objs.add([e.kind, e.ns, e.name].join('/')); x.last = Math.max(x.last, e.last); g.set(k, x); }
      const list = [...g.values()].sort((a, b) => (b.type === 'Warning') - (a.type === 'Warning') || b.n - a.n).map(x => ({ ...x, objs: x.objs.size }));
      body = C.dataTable.render({ clip: true, rowKey: 'key', rows: list, rowAction: 'wake.ev.reasonRow', reveal: true, columns: [{ id: 'type', label: 'Type', width: W.type, cell: e => typeCell(e.type) }, { id: 'reason', label: 'Reason', width: 'calc(var(--space-16) * 2.2)' },
        { id: 'count', label: t('wake.view.occurrences'), kind: 'number', width: 'calc(var(--space-16) * 1.2)', cell: e => inWindowText(e.n, e.atLeast) }, { id: 'objs', label: 'Objects', kind: 'number', optional: true, width: 'calc(var(--space-16) * 1.2)', cell: e => num(e.objs) },
        { id: 'source', label: 'Source', muted: true, optional: 1, width: W.src }, { id: 'message', label: 'Message', muted: true, optional: 2 }, { id: 'last', label: 'Last Seen', time: true, width: W.at, cell: e => when(e.last, now()) }] });
    } else {
      const pages = Math.max(1, Math.ceil(rows.length / PER)), page = Math.min(s.evPage, pages);
      body = html`${eventTable(rows.slice((page - 1) * PER, page * PER), { now: now(), action: 'wake.ev.open', activeKey })}${C.pager.range({ page, per: PER, total: rows.length, action: 'wake.ev.page' })}`;
    }
    const card = wait ? C.summaryBar.render({ label: t('wake.view.events'), open: !deps.folded['ev-list'], toggle: { action: 'wake.rv.fold', arg: 'ev-list' }, items: [{ id: 't', label: '', value: t('wake.view.events') }, { id: 'w', label: 'Warning', value: SKEL }], body })
      /* 행이 없어도 알림·인시던트와 같은 모양: 카드 머리(수 0)와 본문 한 줄 빈 상태(A3-19) */
      : C.summaryBar.render({ label: t('wake.view.events'), open: !deps.folded['ev-list'], toggle: { action: 'wake.rv.fold', arg: 'ev-list' }, items: [{ id: 't', label: '', value: t('wake.view.events') }, ...eventHead(t, rows)],
        body: rows.length ? body : C.emptyState.render({ title: t('wake.res.noEvents'), variant: 'line' }) });
    return html`${head}${scope}${tools}${tl}${card}`;
  }
  let activeKey = null, marksSeen = [];
  /* 타임라인 표시를 누르면: 이벤트는 그 Event의 상세, 배포·설정 변경은 그 리소스의 상세 */
  const PLURAL = { Deployment: 'deployments', StatefulSet: 'statefulsets', DaemonSet: 'daemonsets', ConfigMap: 'configmaps' };
  const openMark = markId => { const c = marksSeen.find(x => x.id === markId); if (!c) return;
    if (c.id.startsWith('ev:')) { const uid = c.id.slice(3), e = deps.rows().find(x => x.uid === uid); const address = e && eventAddress(e, id, ctx.query.at); if (address) ctx.api.navigate(address, { presentation: 'detail' }); return; }
    const plural = PLURAL[c.kind]; if (plural) ctx.api.navigate('wake://' + ['cluster', id, 'ns', c.ns || '_all', plural, c.title].map(encodeURIComponent).join('/'), { presentation: 'detail' }); };
  const open = key => { const address = eventRowAddress(deps.rows(), key, id, ctx.query.at); if (!address) return; activeKey = key; ctx.update(); ctx.api.navigate(address, { presentation: 'detail' }); };
  return {
    state: q0 => ({ evType: q0.type === 'Warning' || q0.type === 'Normal' ? q0.type : 'all', evGroup: 'list', evReason: typeof q0.reason === 'string' ? q0.reason : '', evPage: 1, evRange: { preset: '1h' } }),
    ai: ['evType', 'evGroup', 'evReason', 'evPage', 'evRange'],
    set: {},
    read, render, menus: {},
    actions: {
      'wake.ev.open': a => open(a.arg),
      'wake.ev.type': a => ctx.setState({ evType: String(a.arg?.value ?? a.arg), evPage: 1 }),
      'wake.ev.group': a => ctx.setState({ evGroup: String(a.arg?.value ?? a.arg) }),
      'wake.ev.page': a => ctx.setState({ evPage: Number(a.arg?.value ?? a.arg) || 1 }),
      'wake.ev.reason': a => ctx.setState({ evReason: String(a.arg?.value ?? a.arg ?? ''), evPage: 1 }),
      'wake.ev.reasonRow': a => { const [type, ...reason] = String(a.arg).split('|'); ctx.setState({ evReason: reason.join('|'), evType: type, evGroup: 'list', evPage: 1 }); },
      'wake.ev.zoom': a => { if (Number.isFinite(a.from) && Number.isFinite(a.to)) ctx.setState({ evRange: { from: Math.floor(a.from), to: Math.ceil(a.to), live: false }, evPage: 1 }); },
      'wake.ev.mark': a => openMark(a.arg),
    },
    clearActive: () => { activeKey = null; },
  };
}
