/*
 * AI 작업 기록(시뮬레이션 aiLogPage()): 머리(AI 작업 기록 · Wake 감사 기록 · 클러스터 · 보관 90일) → 도구 줄(기록 검색 → 요청자 · 경로 알약 | 구간 7일)
 * → AI 작업 요약(AI 읽기 · 거부·실패 · 모델 전달 · 마스킹 · 사람 요청·승인) → 기록 카드(시각 · 인시던트 · 요청 · 한 일 · 실행 주체(모델) · 양, 30줄씩) → "다른 종류에서 N건".
 * 행 하나가 도구 호출 하나(감사 기록 6.2). 요청 칸은 요청자와 출처 이름표(클라이언트 · 데스크톱/MCP/API). 행을 누르면 상세 칸(ailog-detail.js).
 */
import config from '../app.config.js';
import { bootPage, components as C, html } from '../../../kit/page/index.js';
import { when, requesterMark, sourceBadge, auditSummary, auditIcon, auditSize, auditExec } from './incident-parts.js';
import { clusterSearch, SEARCH_W } from './cluster-search.js';
import { clusterNameOf, viewHeader, otherKinds, readRow, SCOPE_W } from './view-parts.js';
import { auditCounts, auditIn, auditFilter, requesterGroup, AUDIT_RETENTION_DAYS } from '../data/audit.js';
import { windowOf, DAY } from '../data/home.js';
import { num } from './parts.js';

const PER = 30;
const RETENTION = AUDIT_RETENTION_DAYS * DAY / 1000;

bootPage(config, ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  let snap = null, phase = 'loading', activeKey = null, started = false;
  const search = clusterSearch(ctx, id), folded = {};
  const st = () => ctx.state();
  const now = () => Date.parse(snap?.at ?? '') || Date.now();
  async function load() {
    phase = 'loading'; ctx.update();
    try { snap = await data.get('audit', { cluster: id }); phase = 'ready'; }
    catch (e) { phase = e?.kind === 'unconfigured' ? 'unconfigured' : e?.status === 403 ? 'forbidden' : 'error'; }
    ctx.update();
  }
  const range = () => C.timeRange.render({ id: 'ailog-range', value: st().range, action: 'kit.screen.range', fallback: '7d', retention: RETENTION, now: Math.floor(now() / 1000), label: t('wake.view.range') });
  const tabs = (key, value, list, all) => C.pillTabs.render({ id: `wake-ailog-${key}`, label: t(`wake.ailog.${key}`), value, action: `wake.ailog.${key}`, tabs: list.map(([k, label]) => ({ id: k, label, count: num(all(k)) })) });
  const TRANSPORTS = ['all', 'desktop', 'mcp', 'api'];
  const transportLabel = k => (k === 'all' ? t('wake.ailog.allTransports') : t(`wake.inc.transport.${k}`));
  function body() {
    const s = st(), q = (s.q || '').trim();
    const head = viewHeader('ai', t('wake.view.ailog'), [t('wake.ailog.source'), clusterNameOf(ctx, id), t('wake.inc.list.retention', { n: AUDIT_RETENTION_DAYS })]);
    const searchField = C.searchInput.render({ placeholder: t('wake.ailog.search'), action: 'kit.screen.search', value: s.q || '', width: SEARCH_W });
    if (phase !== 'ready') {
      const blank = phase === 'unconfigured' ? C.emptyState.render({ icon: 'ai', plainIcon: true, title: t('wake.view.toolOff', { tool: t('wake.ailog.source') }) }) : readRow(t, phase, 'wake.ailog.retry');
      return html`${head}${C.listToolbar.render({ search: searchField, time: range() })}${blank}`;
    }
    const all = auditIn(snap.rows, windowOf(s.range, now())), found = auditFilter(all, { q });
    const rows = auditFilter(found, { requester: s.requester, transport: s.transport }), c = auditCounts(all);
    /* 범위(경로 하나 고르기) → 검색 → 요청자 알약 | 구간 */
    /* 경로(MCP · HTTP API · 화면)는 범위가 아니라 거르기: 검색 다음(범위 → 검색 → 거르기) */
    const tools = C.listToolbar.render({ search: searchField, time: range(),
      filters: html`${C.select.render({ value: transportLabel(s.transport), icon: 'plug', menu: 'wake.ailog.transportMenu', label: t('wake.ailog.transport'), width: SCOPE_W })}${tabs('requester', s.requester, [['all', t('wake.list.all')], ['ai', 'AI'], ['human', t('wake.ailog.person')]], k => (k === 'all' ? found.length : found.filter(r => requesterGroup(r) === k).length))}` });
    const summary = C.summaryBar.render({ label: t('wake.ailog.work'), items: [{ id: 'r', label: t('wake.ailog.reads'), value: num(c.reads) }, ...(c.failed ? [{ id: 'd', label: t('wake.ailog.failed'), value: num(c.failed), tone: 'warn' }] : []),
      { id: 'm', label: t('wake.ailog.toModel'), value: num(c.model) }, { id: 'k', label: t('wake.ailog.masked'), value: num(c.masked) }, { id: 'u', label: t('wake.ailog.byPeople'), value: num(c.human) }] });
    const pages = Math.max(1, Math.ceil(rows.length / PER)), page = Math.min(s.page, pages), label = t('wake.ailog.record');
    const table = C.dataTable.render({ clip: true, rowKey: 'id', rows: rows.slice((page - 1) * PER, page * PER), rowAction: 'wake.ailog.open', activeKey, reveal: true, columns: [
      { id: 'at', label: t('wake.inc.record.time'), time: true, width: 'calc(var(--space-40) * .9)', cell: r => when(r.at, now()) },
      { id: 'inc', label: t('wake.home.incidents'), width: 'calc(var(--space-16) * 1.4)', cell: r => r.incidentNumber ?? '' },
      { id: 'req', label: t('wake.ailog.request'), width: 'calc(var(--space-40) * 1.5)', cell: r => html`${requesterMark(r)} ${sourceBadge(t, r)}`, tip: r => r.requester.name },
      { id: 'what', label: t('wake.ailog.what'), cell: r => C.statusIcon.render({ kind: 'idle', icon: auditIcon(r), text: auditSummary(t, r) }), tip: r => auditSummary(t, r) },
      { id: 'exec', label: t('wake.ailog.execModel'), muted: true, optional: true, width: 'calc(var(--space-40) * 1.2)', cell: r => auditExec(t, r), tip: r => auditExec(t, r) },
      { id: 'size', label: t('wake.ailog.size'), kind: 'number', optional: true, width: 'calc(var(--space-16) * 1.6)', cell: r => auditSize(t, r.size) }] });
    const card = C.summaryBar.render({ label, open: !folded.list, toggle: { action: 'wake.ailog.fold', arg: 'list' }, items: [{ id: 't', label: '', value: label }, { id: 'n', label: '', value: num(rows.length) }],
      body: rows.length ? html`${table}${C.pager.range({ page, per: PER, total: rows.length, action: 'wake.ailog.page' })}` : C.emptyState.render({ title: t('wake.ailog.none'), variant: 'line' }) });
    return html`${head}${tools}${summary}${card}${otherKinds(ctx, search, id, q)}`;
  }
  return {
    screen: { state: { q: '', requester: 'all', transport: 'all', page: 1, range: { preset: '7d' } }, ai: ['requester', 'transport', 'page', 'range'], search: { key: 'q', scope: 'list', reset: { page: 1 } }, range: { key: 'range', retention: RETENTION } },
    init: () => { if (started) return; started = true; void load(); },
    render: () => C.pageColumn.render({ width: 'home', children: body() }),
    menus: { 'wake.ailog.transportMenu': () => C.select.menuDef({ key: 'transport', value: st().transport, options: TRANSPORTS.map(k => ({ id: k, label: { raw: transportLabel(k) } })), action: 'wake.ailog.transport' }) },
    afterRender: root => { root.dataset.wakeView = 'ailog'; },
    onDetail: p => { if (p.state !== 'open' && activeKey != null) { activeKey = null; ctx.update(); } },
    meta: () => ({ title: t('wake.view.ailog'), icon: 'ai' }),
    actions: {
      ...search.actions,
      'wake.ailog.retry': () => load(),
      'wake.ailog.fold': a => { folded[a.arg] = !a.open; },
      'wake.ailog.requester': a => ctx.setState({ requester: String(a.arg?.value ?? a.arg), page: 1 }),
      'wake.ailog.transport': a => ctx.setState({ transport: String(a.arg?.value ?? a.arg), page: 1 }),
      'wake.ailog.page': a => ctx.setState({ page: Number(a.arg?.value ?? a.arg) || 1 }),
      'wake.ailog.open': a => { activeKey = String(a.arg); ctx.update(); ctx.api.navigate(`wake://cluster/${encodeURIComponent(id)}/ailog/${encodeURIComponent(activeKey)}`, { presentation: 'detail' }); },
    },
  };
});
