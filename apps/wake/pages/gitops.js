/*
 * GitOps 화면(시뮬레이션 gitopsPage()): 머리(GitOps · 컨트롤러와 버전 · 클러스터) → 범위 검색 상자(Application 이름·manifest 경로 · 종류 · namespace · 구간) → 출처 끊김 줄
 * → 도구 줄(전체·문제 있음·OutOfSync 알약). 종류·namespace 범위는 Application이 관리하는 리소스(Argo status.resources, 없으면 추적 라벨의 워크로드)와 맞춘다(data/scope.js touches)
 * → Application 카드(Synced · OutOfSync · Degraded · Progressing · 마지막 동기화, 표 머리는 kubectl 말: Name · Source · Sync · Health · Revision · Last Sync · Syncs · Auto Sync)
 * 행을 누르면 그 Application의 상세 칸(gitops-detail.js). Application은 Kubernetes API의 Application·Kustomization CRD(gitops.read)에서 읽는다.
 * Argo 원문 Health가 Healthy여도 소유 워크로드가 준비되지 않았으면 경고 색으로 그린다(N3, ownedWarnings).
 */
import { readIdentity, retainRead } from '../data/read-state.js';
import config from '../app.config.js';
import { bootPage, components as C, html } from '../../../kit/page/index.js';
import { when } from './incident-parts.js';
import { clusterNameOf, viewHeader, sourceLines, readRow, readFailure, stateCell, healthCell, sectionTabs } from './view-parts.js';
import { scopeBox } from './scope-box.js';
import { contract, createGitopsPolling, gitopsSnapshotStale, appRows, appBad } from '../data/gitops.js';
import { KIND_OF } from '../data/kinds.js';
import { windowOf, DAY } from '../data/home.js';
import { num } from './parts.js';

const PER = 20;
const W = { src: 'calc(var(--space-16) * 1.2)', sync: 'calc(var(--space-16) * 1.7)', health: 'calc(var(--space-16) * 2.2)', rev: 'calc(var(--space-16) * 1.3)', at: 'calc(var(--space-40) * .9)', n: 'calc(var(--space-16) * 1.5)', auto: 'calc(var(--space-16) * 1.4)', ns: 'calc(var(--space-16) * 1.6)' };
const A = (...p) => 'wake://' + p.map(encodeURIComponent).join('/');
bootPage(config, ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  let gitops = null, failure = null, workloads = [], disposed = false, successKey = '';
  const sources = sourceLines(ctx, id), folded = {};
  const box = scopeBox(ctx, id, 'gitops', { onRun: () => ctx.setState({ page: 1 }), alive: () => !disposed });
  const st = () => ctx.state();
  const now = () => Date.now();
  const apps = () => contract(gitops?.repos).applications.filter(a => a.binding.cluster_id === id);
  /* 범위에 드는 Application: 관리하는 리소스(status.resources) 하나라도 범위의 것(종류면 그 객체·소유한 것·범위 Pod를 만든 워크로드), namespace만이면 대상 namespace */
  const appOk = row => { const r = box.relation(); if (!r.on) return true;
    const listed = (row.app.deployment?.resources?.items ?? []).map(x => ({ kind: x.kind, ns: x.namespace ?? '', name: x.name }));
    const managed = listed.length ? listed : workloads.filter(w => w.application === row.name);
    return r.kinds ? managed.some(x => r.touches(x.kind, x.ns, x.name)) : r.inNs(row.ns) || managed.some(x => x.ns && r.inNs(x.ns)); };
  const readKey = () => readIdentity(id, 'argocd', 'gitops', st().range);
  const polling = createGitopsPolling({ read: () => data.get('gitops', { cluster: id }), identity: () => ({ context: id }), accept: v => {
    if (v?.access === 'forbidden') { failure = { kind: 'forbidden', status: 403 }; gitops = retainRead(gitops, { before: successKey, after: readKey(), error: failure }); }
    else { gitops = v || {}; failure = null; gitops.receivedAt = Date.now(); successKey = readKey(); }
    void sources.read().then(() => ctx.update()); ctx.update();
  }, onError: e => { failure = e; gitops = retainRead(gitops, { before: successKey, after: readKey(), error: e }); void sources.read().then(() => ctx.update()); ctx.update(); } });
  async function load() {
    polling.setActive(true); await polling.read().catch(() => {});
    const kinds = ['deployments', 'statefulsets', 'daemonsets'];
    workloads = (await Promise.all(kinds.map(k => data.get('resources', { cluster: id, ns: '_all', kind: k }).then(l => l.map(w => ({ ...w, kind: KIND_OF[k].kind }))).catch(() => [])))).flat();
    void sources.read().then(() => ctx.update());
    if (!disposed) ctx.update();
  }
  globalThis.addEventListener?.('pagehide', () => { disposed = true; polling.dispose(); }, { once: true });

  const forbidden = e => e?.status === 403 || /forbidden|403/i.test(String(e?.kind || e?.message || e));
  const controllers = () => Object.values(gitops?.controllers ?? {}).flat().map(c => `${c.kind === 'flux' ? 'Flux' : 'Argo CD'}${c.version ? ' ' + c.version : ''}`).filter((x, i, all) => all.indexOf(x) === i).join(' · ');
  const range = () => C.timeRange.render({ id: 'gitops-range', value: st().range, action: 'kit.screen.range', fallback: '7d', retention: 90 * DAY / 1000, now: Math.floor(now() / 1000), label: t('wake.view.range') });
  /* 마지막 성공 조회가 오래됐거나 지금 읽기가 실패한 실제 클러스터: 지금 값이 아니다(B4) */
  const staleApps = () => !!gitops?.receivedAt && !!(failure || gitopsSnapshotStale(gitops.receivedAt));
  const staleCell = value => value ? C.statusIcon.render({ kind: 'idle', icon: 'clock', text: value, label: t('wake.list.stale') + ' · ' + value }) : '';
  const k8sLine = () => {
    const old = gitops?.receivedAt && (failure || gitopsSnapshotStale(gitops.receivedAt));
    if (!old) return gitops?.access === 'partial' ? C.staleLine.render({ kind: 'warn', text: t('wake.gitops.partial') }) : '';
    return C.staleLine.render({ kind: forbidden(failure) ? 'perm' : 'warn', text: `${t(forbidden(failure) ? 'wake.home.permissionDenied' : 'wake.list.stale')} · ${t('wake.view.lastCollected', { at: when(gitops.receivedAt, 0) })}`, action: { label: t('wake.flow.a.retry'), action: 'wake.git.retry' } });
  };
  /* Argo CD를 일부만 읽음(끊김은 아님): 시뮬레이션 gitopsPage의 limited 줄처럼 경고 한 줄 + 그 도구 화면 */
  const argoLimited = () => sources.of('argocd', now())?.state !== 'limited' ? ''
    : C.staleLine.render({ kind: 'warn', text: `Argo CD · ${t('wake.gitops.partial')}`, action: { label: t('wake.home.tools'), action: 'kit.navigate', arg: { address: A('cluster', id, 'tools', 'argocd') } } });
  function empty() {
    if (failure && !gitops) {
      const missing = failure?.kind === 'unconfigured' || failure?.code === 'UNSUPPORTED';
      return missing ? C.emptyState.render({ icon: 'tool-gitops', plainIcon: true, title: t('wake.gitops.none') })
        : C.emptyState.render({ icon: forbidden(failure) ? 'lock' : 'status-error', plainIcon: true, title: t(forbidden(failure) ? 'wake.home.permissionDenied' : 'wake.gitops.readFailed'), action: C.button.render({ label: t('wake.flow.a.retry'), size: 'sm', variant: 'secondary', action: 'wake.git.retry' }) });
    }
    if (!gitops) return readRow(t, 'loading', 'wake.git.retry');
    if (gitops.access === 'forbidden') return readRow(t, 'forbidden', 'wake.git.retry');
    if (!apps().length) return C.emptyState.render({ icon: 'tool-gitops', plainIcon: true, title: t(Object.values(gitops.controllers || {}).flat().length ? 'wake.gitops.noApps' : 'wake.gitops.none') });
    return null;
  }
  function appCard(all, rows) {
    const s = st(), pages = Math.max(1, Math.ceil(rows.length / PER)), page = Math.min(s.page, pages), n = f => rows.filter(f).length; /* 머리 수는 표가 보이는 행에서(C-19) */
    const last = Math.max(...rows.map(r => r.last ?? -Infinity));
    const items = [{ id: 't', label: '', value: 'Application' }, { id: 's', label: 'Synced', value: num(n(r => r.sync === 'Synced' || r.sync === 'Ready')) },
      { id: 'o', label: 'OutOfSync', value: num(n(r => r.sync === 'OutOfSync')), ...(n(r => r.sync === 'OutOfSync') ? { tone: 'warn' } : {}) },
      ...[{ id: 'd', label: 'Degraded', value: num(n(r => /Degraded|Failed/.test(r.health))), tone: 'danger' }, { id: 'pg', label: 'Progressing', value: num(n(r => r.health === 'Progressing')) }].filter(x => x.value !== '0'),
      ...(Number.isFinite(last) ? [{ id: 'l', label: t('wake.git.lastSync'), value: when(last, now()) }] : [])];
    const table = C.dataTable.render({ clip: true, rowKey: 'id', rows: rows.slice((page - 1) * PER, page * PER), rowAction: 'wake.git.open', activeKey, reveal: true, columns: [
      { id: 'name', label: 'Name', lead: r => ({ icon: r.controller === 'flux' ? 'brand-flux' : 'tool-gitops' }) },
      { id: 'src', label: 'Source', muted: true, optional: true, width: W.src, cell: r => (r.controller === 'flux' ? 'Flux' : 'Argo CD') },
      { id: 'sync', label: 'Sync', width: W.sync, fit: true, cell: r => staleApps() ? staleCell(r.sync) : stateCell(r.sync) },
      { id: 'health', label: 'Health', width: W.health, fit: true, cell: r => staleApps() ? staleCell(r.health) : healthCell(r) },
      { id: 'revision', label: 'Revision', kind: 'mono', optional: true, width: W.rev },
      { id: 'last', label: t('wake.col.lastSync'), time: true, optional: true, width: W.at, cell: r => (r.last ? when(r.last, now()) : '') },
      { id: 'syncs', label: t('wake.col.syncs'), kind: 'number', optional: true, width: W.n, cell: r => num(r.syncs) },
      ...(all.some(r => r.auto != null) ? [{ id: 'auto', label: t('wake.col.autoSync'), optional: true, width: W.auto, cell: r => (r.auto == null ? '' : t(r.auto ? 'wake.git.on' : 'wake.git.off')) }] : [])] });
    return C.summaryBar.render({ label: 'Application', open: !folded.apps, toggle: { action: 'wake.git.fold', arg: 'apps' }, items,
      body: rows.length ? html`${table}${C.pager.range({ page, per: PER, total: rows.length, action: 'wake.git.page' })}` : C.emptyState.render({ title: t('wake.git.noMatch'), variant: 'line' }) });
  }
  function body() {
    const s = st(), q = box.q();
    const head = html`${viewHeader('tool-gitops', 'GitOps', [controllers(), clusterNameOf(ctx, id)], sectionTabs(t, 'gitops'))}${box.render({ range: range() })}`;
    const lines = failure && !gitops ? '' : k8sLine() || html`${sources.line('argocd', 'Argo CD', now())}${argoLimited()}`;
    const blank = empty();
    const all = appRows(apps(), windowOf(s.range, now()), workloads).filter(appOk);
    const base = all.filter(r => !q || r.name.toLowerCase().includes(q) || (r.app.manifest_path || '').toLowerCase().includes(q));
    const rows = base.filter(r => s.filter === 'all' || (s.filter === 'bad' ? appBad(r) : r.sync === s.filter));
    const pill = (id, label, n) => ({ id, label, count: num(n), ...(id === 'bad' && n ? { badge: { tone: 'warn' } } : {}) });
    const tools = C.listToolbar.render({
      filters: C.pillTabs.render({ id: 'wake-git-filter', label: t('wake.list.filter'), value: s.filter, action: 'wake.git.filter', tabs: [pill('all', t('wake.list.all'), base.length), pill('bad', t('wake.git.hasBad'), base.filter(appBad).length), pill('OutOfSync', 'OutOfSync', base.filter(r => r.sync === 'OutOfSync').length)] }) });
    if (blank) return html`${head}${lines}${tools}${blank}`;
    if (box.wait()) return html`${head}${lines}${tools}${readRow(t, 'loading', 'wake.git.retry')}`;
    /* 범위(종류가 소유한 것)를 읽지 못하면 빈 목록 대신 그 실패와 원인 */
    if (box.failure()) return html`${head}${lines}${tools}${readRow(t, 'error', 'wake.git.retry', readFailure(t, box.failure()))}`;
    return html`${head}${lines}${tools}${apps().length ? appCard(all, rows) : ''}`;
  }
  let activeKey = null;
  const open = (key, address) => { activeKey = key; ctx.update(); ctx.api.navigate(address, { presentation: 'detail' }); };
  let started = false;
  return {
    screen: { state: { filter: 'all', page: 1, range: { preset: '7d' } }, ai: ['filter', 'page', 'range'], range: { key: 'range', retention: 90 * DAY / 1000 } },
    init: () => { if (started) return; started = true; void box.init(); void load(); },
    render: () => C.pageColumn.render({ width: 'home', children: body() }),
    afterRender: root => { root.dataset.wakeView = 'gitops'; },
    onDetail: p => { if (p.state !== 'open' && activeKey != null) { activeKey = null; ctx.update(); } },
    meta: () => ({ title: 'GitOps', icon: 'tool-gitops' }),
    onSettings: () => ctx.update(),
    menus: { ...box.menus },
    actions: {
      ...box.actions,
      'wake.git.retry': () => Promise.all([box.retry(), polling.refresh().catch(() => {})]).then(() => ctx.update()),
      'wake.git.fold': a => { folded[a.arg] = !a.open; },
      'wake.git.filter': a => ctx.setState({ filter: String(a.arg?.value ?? a.arg), page: 1 }),
      'wake.git.page': a => ctx.setState({ page: Number(a.arg?.value ?? a.arg) || 1 }),
      'wake.git.open': a => { const r = appRows(apps()).find(x => x.id === a.arg); if (r) open(a.arg, A('cluster', id, 'gitops', r.ns || '_all', r.kind, r.name) + (r.app.sourceIdentity?.uid ? `?uid=${encodeURIComponent(r.app.sourceIdentity.uid)}` : '')); },
    },
  };
});
