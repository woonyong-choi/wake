/*
 * 알림 화면(시뮬레이션 alertsPage()): 머리(알림 · Prometheus · Alertmanager · 클러스터 · 보관 90일) → 범위 검색 상자(알림 이름·대상 · 종류 · namespace · 구간) → 출처 끊김 줄
 * → 도구 줄(전체·firing·pending·resolved 알약) → 알림 카드(firing · critical · warning · 가장 오래된 firing · pending · resolved, 표: 알림 · 상태 · 심각도 · 대상 · 시작 · 인시던트, 30줄씩).
 * 범위는 알림 라벨(namespace와 pod·deployment… 라벨)로 맞추고, namespace 라벨이 없는 알림(Node 등)은 늘 보인다(data/scope.js alertInScope).
 * 상태 색은 상태로만(firing 오류, pending 진행, resolved 정상), 심각도는 글자. 행을 누르면 알림 상세 칸(alert-detail.js).
 */
import { readIdentity, retainRead, createReadGuard } from '../data/read-state.js';
import config from '../app.config.js';
import { bootPage, components as C, html } from '../../../kit/page/index.js';
import { when, duration } from './incident-parts.js';
import { clusterNameOf, viewHeader, sourceLines, readRow, alertState, sectionTabs } from './view-parts.js';
import { scopeBox } from './scope-box.js';
import { alertInScope } from '../data/scope.js';
import { alertList, alertsIn, alertCounts } from '../data/alerts.js';
import { windowOf, DAY } from '../data/home.js';
import { num } from './parts.js';

const PER = 30;
/* 심각도 순서(알 수 없는 값은 끝) */
const SEV = ['critical', 'high', 'warning', 'medium', 'low', 'info', 'none'];
bootPage(config, ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  let snap = null, incidents = [], phase = 'loading', successKey = '', disposed = false;
  const sources = sourceLines(ctx, id), folded = {};
  const box = scopeBox(ctx, id, 'alerts', { onRun: () => ctx.setState({ page: 1 }), alive: () => !disposed });
  const beginRead = createReadGuard();
  const st = () => ctx.state();
  const now = () => Date.parse(snap?.at ?? '') || Date.now();
  async function load() {
    const current = beginRead(), key = readIdentity(id, 'prometheus+alertmanager', 'alerts', st().range);
    snap = retainRead(snap, { before: successKey, after: key });
    phase = 'loading'; ctx.update();
    let next, nextIncidents, error;
    try {
      next = await data.get('alerts', { cluster: id });
      if (!current()) return;
      nextIncidents = (await data.get('incidents').catch(() => [])).filter(i => i.cluster === id);
    } catch (e) { error = e; }
    if (!current()) return;
    await sources.read(current);
    if (!current()) return;
    if (error) {
      snap = retainRead(snap, { before: successKey, after: key, error });
      phase = error.kind === 'unconfigured' ? 'unconfigured' : error.status === 403 ? 'forbidden' : 'error';
    } else {
      if (next.partial === 'prometheus' && snap?.rules && (!next.sources?.prometheus?.target?.uid || next.sources.prometheus.target.uid === snap.sources?.prometheus?.target?.uid)) next.rules = snap.rules;
      if (next.partial === 'alertmanager' && snap?.alertmanager && (!next.sources?.alertmanager?.target?.uid || next.sources.alertmanager.target.uid === snap.sources?.alertmanager?.target?.uid)) next.alertmanager = snap.alertmanager;
      snap = next; successKey = key; incidents = nextIncidents; phase = 'ready';
    }
    if (phase === 'unconfigured') snap = null;
    if (snap && !sources.matches('prometheus', snap.sources?.prometheus?.target)) snap.rules = null;
    if (snap && !sources.matches('alertmanager', snap.sources?.alertmanager?.target)) snap.alertmanager = [];
    ctx.update();
  }
  globalThis.addEventListener?.('pagehide', () => { disposed = true; beginRead(); }, { once: true }); /* 닫힌 뒤 늦게 온 읽기는 그리지 않는다(C-17) */
  const rowsOf = () => alertList({ ...snap, incidents, stale: { prometheus: !!sources.of('prometheus', now())?.stale, alertmanager: !!sources.of('alertmanager', now())?.stale } });
  const range = () => C.timeRange.render({ id: 'alerts-range', value: st().range, action: 'kit.screen.range', fallback: '7d', retention: snap?.historyDays ? snap.historyDays * DAY / 1000 : undefined, now: Math.floor(now() / 1000), label: t('wake.view.range') });
  function body() {
    const s = st(), q = box.q(), rel = box.relation();
    const head = html`${viewHeader('bell', t('wake.view.alerts'), ['Alertmanager', clusterNameOf(ctx, id)], sectionTabs(t, 'alerts'))}${box.render({ range: range() })}`;
    const lines = html`${sources.line('prometheus', 'Prometheus', now())}${sources.line('alertmanager', 'Alertmanager', now())}`;
    if (!snap) {
      const blank = phase === 'unconfigured' ? C.emptyState.render({ icon: 'bell', plainIcon: true, title: t('wake.view.toolOff', { tool: 'Prometheus · Alertmanager' }), action: C.button.render({ label: t('wake.tools.manage'), size: 'sm', variant: 'secondary', action: 'kit.navigate', arg: { address: 'wake://settings/tools' } }) }) : readRow(t, phase, 'wake.al.retry');
      return html`${head}${blank}`;
    }
    const all = alertsIn(rowsOf(), windowOf(s.range, now())), found = all.filter(a => alertInScope(rel, a.labels) && (!q || `${a.name} ${a.target}`.toLowerCase().includes(q)));
    const rows = found.filter(a => s.state === 'all' || a.state === s.state), c = alertCounts(found);
    const tools = C.listToolbar.render({
      filters: C.pillTabs.render({ id: 'wake-al-state', label: t('wake.al.state'), value: s.state, action: 'wake.al.state', tabs: [['all', t('wake.list.all'), c.all], ['firing', 'firing', c.firing], ['pending', 'pending', c.pending], ['resolved', 'resolved', c.resolved]].map(([k, label, n]) => ({ id: k, label, count: num(n) })) }) });
    const pages = Math.max(1, Math.ceil(rows.length / PER)), page = Math.min(s.page, pages), label = t('wake.view.alerts');
    const items = [{ id: 't', label: '', value: label }, { id: 'f', label: 'firing', value: num(c.firing), ...(c.firing ? { tone: 'danger' } : {}) },
      ...Object.entries(c.bySeverity).sort((a, b) => SEV.indexOf(a[0]) - SEV.indexOf(b[0])).map(([sev, n]) => ({ id: 's-' + sev, label: sev, value: num(n) })) /* 심각도는 글자만(RULE-TONE): 상태색 없음 */,
      ...(c.oldest != null ? [{ id: 'o', label: t('wake.al.oldest'), value: duration(t, now() - c.oldest) }] : []), { id: 'p', label: 'pending', value: num(c.pending) }, { id: 'r', label: 'resolved', value: num(c.resolved) }];
    const table = C.dataTable.render({ clip: true, rowKey: 'id', rows: rows.slice((page - 1) * PER, page * PER), rowAction: 'wake.al.open', activeKey, reveal: true, columns: [
      { id: 'name', label: t('wake.view.alerts') },
      { id: 'state', label: t('wake.al.state'), width: 'calc(var(--space-16) * 1.5)', fit: true, cell: a => alertState(a.state) },
      { id: 'severity', label: t('wake.al.severity'), optional: true, width: 'calc(var(--space-16) * 1.2)' },
      { id: 'target', label: t('wake.al.target'), muted: true, optional: true },
      { id: 'at', label: t('wake.al.start'), time: true, width: 'calc(var(--space-40) * .9)', cell: a => when(a.at, now()) },
      { id: 'inc', label: t('wake.home.incidents'), optional: true, width: 'calc(var(--space-16) * 1.4)', muted: true, cell: a => a.incident?.number ?? '' }] });
    const card = C.summaryBar.render({ label, open: !folded.list, toggle: { action: 'wake.al.fold', arg: 'list' }, items,
      body: rows.length ? html`${table}${C.pager.range({ page, per: PER, total: rows.length, action: 'wake.al.page' })}` : C.emptyState.render({ title: t('wake.al.none'), variant: 'line' }) });
    const failed = phase !== 'ready' && phase !== 'loading';
    const previous = failed ? C.staleLine.render({ kind: 'warn', text: `${t('wake.list.stale')} · ${t('wake.view.lastCollected', { at: when(Date.parse(snap.at), 0) })}` }) : '';
    const retry = failed ? readRow(t, phase, 'wake.al.retry') : '';
    return html`${head}${lines}${previous}${tools}${retry}${box.wait() ? readRow(t, 'loading', 'wake.al.retry') : card}`;
  }
  let activeKey = null, started = false;
  return {
    screen: { state: { state: 'all', page: 1, range: { preset: '7d' } }, ai: ['state', 'page', 'range'], range: { key: 'range' } },
    init: () => { if (started) return; started = true; void box.init(); void load(); },
    render: () => C.pageColumn.render({ width: 'home', children: body() }),
    afterRender: root => { root.dataset.wakeView = 'alerts'; },
    onDetail: p => { if (p.state !== 'open' && activeKey != null) { activeKey = null; ctx.update(); } },
    meta: () => ({ title: t('wake.view.alerts'), icon: 'bell' }),
    onSettings: () => ctx.update(),
    menus: { ...box.menus },
    actions: {
      ...box.actions,
      'wake.al.retry': () => load(),
      'wake.al.fold': a => { folded[a.arg] = !a.open; },
      'wake.al.state': a => ctx.setState({ state: String(a.arg?.value ?? a.arg), page: 1 }),
      'wake.al.page': a => ctx.setState({ page: Number(a.arg?.value ?? a.arg) || 1 }),
      'wake.al.open': a => { activeKey = String(a.arg); ctx.update(); ctx.api.navigate(`wake://cluster/${encodeURIComponent(id)}/alerts/${encodeURIComponent(activeKey)}`, { presentation: 'detail' }); },
    },
  };
});
