/*
 * 리소스 화면(시뮬레이션 resources()): 머리(리소스 · Kubernetes API · 클러스터) → 범위 검색 상자(scope-box.js: 이름 · 리소스 종류 · namespace) →
 * 도구 줄(문제 거르기, Pod는 상태 · Node · Owner) → 요약 카드(종류 · 수 · 그 종류의 개수들) 안의 kubectl 머리글 표와 범위 줄 → "다른 종류에서 N건"(누르면 전체 종류).
 * 종류를 고르지 않으면 읽을 수 있는 모든 종류를, 여럿 고르면 그 종류들을 한 목록(Name · Kind · Namespace · Status · Age, 문제 먼저, 막대 이름은 고른 종류들). Secret은 그 종류를 고를 때만 읽는다.
 * 열은 종류 표(kinds.js) 한 정의이고, 모든 행에 값이 없는 열은 출처가 없는 것이라 빠진다(spec/rules.md#RULE-STATE).
 * 이벤트(kind events)는 같은 페이지의 이벤트 화면(events-view.js, 시뮬레이션 eventsPage()).
 * 주소의 종류 · namespace는 범위가 된다(홈 요약에서 연 목록), ?filter=bad / ?type=Warning은 처음 거르기.
 */
import config from '../app.config.js';
import { bootPage, components as C, html, liveInterval } from '../../../kit/page/index.js';
import { status, num } from './parts.js';
import { when } from './incident-parts.js';
import { clusterSearch } from './cluster-search.js';
import { eventsView } from './events-view.js';
import { scopeBox } from './scope-box.js';
import { sectionTabs, readRow, SKEL, skeletonTable, SCOPE_W } from './view-parts.js';
import { clusterPresentation } from '../data/live.js';
import { KIND_OF, KIND_ORDER, listFacts, titleOf, restartsColumn } from '../data/kinds.js';
import { parseForbidden } from '../data/perm.js';
import { compareResources } from '../data/table-order.js';
import { rank } from '../data/find.js';

const A = (...p) => 'wake://' + p.map(encodeURIComponent).join('/');
const PER = 20;
const USAGE_KINDS = new Set(['pods', 'deployments', 'nodes', 'persistentvolumeclaims']);
/* 종류를 고르지 않은 한 목록에 읽는 종류: 종류 고르기 순서에서 이벤트와 Secret(값을 담은 종류는 고를 때만) 뺌 */
const ALL_KINDS = KIND_ORDER.filter(p => p !== 'secrets' && p !== 'events');
const MiB = 1048576;
/* 종류 고르기의 이름(시뮬레이션 KINDS: PersistentVolumeClaim은 PVC) */
const kindName = k => k?.short || k?.kind || '';

bootPage(config, async ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  const events = params.kind === 'events', q0 = ctx.query, section = events ? 'events' : 'resources';
  /* 종류 표에 없는 종류(CRD 주소)는 그 주소의 종류 하나로 연다. 그 밖의 종류는 범위의 것(없으면 모든 종류) */
  const custom = params.kind && !events && !KIND_OF[params.kind] ? await data.get('kind', { ...params, kind: params.kind }) : null;
  let rows = [], pods = [], kinds = [], usage = null, phase = 'loading', failure = null, request = 0, disposed = false, controller, loaded;
  const search = clusterSearch(ctx, id);
  const metaOf = () => (events ? { title: t('wake.view.events'), icon: 'k8s-event' } : plural() ? { title: titleOf(plural()), icon: kindOf()?.icon, context: { icon: kindOf()?.icon, title: titleOf(plural()), sub: clusterName() } } : { title: t('wake.view.resources'), icon: 'k8s-deployment' });
  /* 범위(종류)가 바뀌면 탭 이름도 지금 목록을 말한다(메타는 처음 열 때만 가므로 여기서 다시 보냄) */
  const box = scopeBox(ctx, id, section, { onRun: () => { ctx.setState({ pg: 1, evPage: 1 }); ctx.api.setMeta?.(metaOf()); }, related: events, alive: () => !disposed });
  const plural = () => (events ? 'events' : custom ? params.kind : box.kind());
  /* 종류 하나가 아닌 한 목록에 읽는 종류: 고른 종류 여럿, 없으면 전체 */
  const many = () => box.kinds() ?? ALL_KINDS;
  const readKey = () => plural() ?? many().join(',');
  const kindOf = () => (custom ?? KIND_OF[plural()] ?? null);
  const folded = {};
  async function load({ quiet = false } = {}) {
    if (disposed) return;
    controller?.abort(); controller = new AbortController();
    const seq = ++request, options = { signal: controller.signal }, p = plural();
    loaded = readKey();
    if (!quiet) { phase = 'loading'; usage = null; ctx.update(); }
    /* 종류마다 수와 권한(머리 아래 권한 줄, 뼈대 행 수)은 리소스 화면을 새로 읽을 때만: 실시간 갱신마다 모든 종류를 다시 읽지 않는다 */
    if (!quiet && !events) void data.get('kinds', { cluster: id, ns: '_all' }).then(v => { if (!disposed && seq === request) { kinds = (v || []).flatMap(g => g.items); ctx.update(); } }).catch(() => {});
    /* 사용량 열(허브 metrics.usage): 지금을 볼 때만, 못 읽으면 그 열이 빠진다 */
    if (USAGE_KINDS.has(p) && q0.at === undefined) void data.get('usage', { cluster: id, kind: p }).then(v => { if (!disposed && seq === request) { usage = v?.rows ?? null; ctx.update(); } }, () => { if (!disposed && seq === request) usage = null; });
    const one = k => data.get('resources', { cluster: id, ns: '_all', kind: k, at: q0.at }, options);
    try {
      /* 종류를 고르지 않음(또는 여럿): 그 종류마다 읽어 한 목록(읽지 못한 종류는 빠지고 머리 아래 줄이 말한다) */
      const [list, related] = p ? await Promise.all([one(p), ['nodes', 'persistentvolumeclaims'].includes(p) ? one('pods').catch(() => []) : events ? eventsData.read(options) : []])
        : await Promise.all([Promise.allSettled(many().map(k => one(k).then(l => (l || []).map(r => ({ ...r, plural: k }))))).then(all => all.flatMap(r => (r.status === 'fulfilled' ? r.value : []))),
          many().includes('nodes') && !many().includes('pods') ? one('pods').catch(() => []) : []]); /* Node를 namespace 범위로 거르는 Pod(A3-13) */
      if (disposed || seq !== request) return;
      rows = list || []; pods = related || []; phase = 'ready'; failure = null;
    } catch (e) {
      if (disposed || seq !== request) return;
      /* 실시간 갱신의 실패는 마지막 값을 두고 갱신 간격을 늘린다(createLivePoll) */
      if (quiet) throw e;
      failure = e; phase = e?.name === 'AbortError' ? 'cancelled' : (Number(e?.status) === 403 || e?.kind === 'forbidden') ? 'forbidden' : 'error';
    }
    ctx.update();
  }
  /* 지금을 보는 동안 구독한 목록이 바뀌면 다시 그린다(?at 과거 시점은 고정): 메인 프로세스가 밀어 준 차이 묶음마다 한 번, 읽는 중에는 쌓지 않고, 숨은 문서는 읽지 않는다.
     사용량 열(Prometheus)이 있는 종류만 실시간 간격으로, 그 밖은 나이 글을 위한 느린 박동 */
  const every = q0.at === undefined ? liveInterval() : null;
  const poll = every ? data.follow({ cluster: id, every: () => (USAGE_KINDS.has(plural()) ? every : every * 6), read: () => (!disposed && phase === 'ready' ? load({ quiet: true }) : undefined) }) : null;
  poll?.start();
  globalThis.addEventListener?.('pagehide', () => { disposed = true; ++request; controller?.abort(); poll?.stop(); }, { once: true });

  /* ---------- 머리 ---------- */
  const clusterName = () => { const saved = (ctx.settings?.()['wake.clusters.list'] || []).find(c => c.id === id); return clusterPresentation(saved || { id }).name; };
  /* 리소스·이벤트 목록은 구역 화면: 머리 끝에 구역 알약 탭*/
  const header = (icon, title, sub) => C.pageHeader.render({ icon, title, sub, size: 'home', ...(section ? { end: sectionTabs(t, section) } : {}) });
  const pending = () => readRow(t, phase === 'cancelled' ? 'cancelled' : 'error', 'wake.list.retry');

  /* ---------- 범위: 상자의 종류 · namespace · 이름(글) ---------- */
  const st = () => ctx.state();
  const nsOk = ns => box.relation().inNs(ns);
  /* 고른 종류에서 이름이 다른 종류와 맞는 수(범위의 namespace 안): 누르면 전체 종류(시뮬레이션 otherKinds) */
  const otherKinds = () => { const q = box.text().trim(), p = plural(); if (!q || !p || custom) return ''; const n = search.otherCount(q, p, nsOk); if (!n) return '';
    return C.button.render({ label: t('wake.rv.otherKinds', { n: num(n) }), icon: 'arrow-up-right', variant: 'link', action: 'wake.scope.kinds', arg: { values: [] } }); };

  const denied = k => k?.readStatus === 'forbidden';
  /* 필요한 권한 보기(셸의 권한 시트): 막힌 동사 · 리소스 · API group */
  const permArg = (p, need) => { const k = KIND_OF[p], group = (k?.api || '').includes('/') ? k.api.split('/')[0] : ''; return { cluster: id, need: need ?? { verb: 'list', resource: p, group, namespace: '' } }; };
  /* 읽을 권한이 없는 종류: 머리 아래 한 줄(시뮬레이션의 머리 아래 경고 줄과 같은 자리), 도구 줄 칸을 차지하지 않음. 지금 목록이 읽는 종류(여럿)만 말한다(A-24): 한 종류는 표 자리의 권한 없음이 말한다 */
  const limitedLine = () => { const read = plural() ? [] : many(), blocked = kinds.filter(k => denied(k) && read.includes(k.plural)); return blocked.length ? C.staleLine.render({ kind: 'perm', icon: 'lock', text: t('wake.rv.limited', { kinds: blocked.map(kindName).join(' · ') }), action: { label: t('wake.flow.a.perm'), action: 'wake.perm.show', arg: permArg(blocked[0].plural) } }) : ''; };

  /* ---------- 표: 종류 표의 열 하나로 ---------- */
  const reference = () => Date.parse(rows.timeBasis?.referenceAt ?? rows[0]?.timeBasis?.referenceAt ?? '') || Date.now();
  const gone = v => v == null || v === '' || (Array.isArray(v) && !v.length);
  const CELL = {
    status: r => (r.status ? status(r.status) : ''),
    readyBool: r => status(r.readyBool === 'True' ? ['ok', 'True'] : ['warn', 'False']),
    /* 재시작 수와 마지막 종료 사유: 사유는 상태 원문이라 상태 아이콘 + 톤(정상 종료 Completed는 중립, 그 밖은 경고) */
    age: r => (r.age === 'Unknown' ? '' : r.age),
    when: (r, c) => (r[c.id] ? when(Date.parse(r[c.id]), reference()) : ''),
    cpu: (r, c) => (r[c.id] == null ? '' : `${Math.round(r[c.id])}m`), /* kubectl top처럼 밀리코어에 쉼표 없음 */
    mem: (r, c) => (r[c.id] == null ? '' : `${num(Math.round(r[c.id] / MiB))}Mi`),
    pct: (r, c) => (r[c.id] == null ? '' : `${num(r[c.id])}%`),
  };
  /* 허브 사용량 한 행: Node는 이름, 그 밖은 namespace/이름 */
  const usageOf = r => { const u = usage?.[kindOf()?.cluster ? r.name : [r.ns, r.name].join('/')]; return u ? { cpuUse: u.cpu ?? null, memUse: u.memory ?? null, restarts1h: u.restarts1h ?? null, usedPct: u.usedPct ?? null } : {}; };
  const related = r => plural() === 'nodes' ? { ...r, pods: pods.filter(p => p.node === r.name).length || '' }
    : plural() === 'persistentvolumeclaims' ? { ...r, usedBy: pods.filter(p => p.ns === r.ns && (p.claims || []).includes(r.name)).map(p => p.name).join(', ') } : r;
  const derived = r => ({ ...related(r), ...usageOf(r) });
  /* 모든 종류의 한 목록: 이름(그 종류의 아이콘) · Kind · Namespace · Status · Age */
  const ALL_COLUMNS = [{ id: 'name', label: 'Name', trim: 'middle', lead: r => ({ icon: KIND_OF[r.plural]?.icon }) }, { id: 'kindName', label: 'Kind', muted: true, width: 'calc(var(--space-16) * 1.5)', cell: r => kindName(KIND_OF[r.plural]) },
    { id: 'ns', label: 'Namespace', muted: true, optional: true, width: 'calc(var(--space-16) * 2)' }, { id: 'status', label: 'Status', fit: true, width: 'calc(var(--space-16) * 2.5)', cell: r => (r.status ? status(r.status) : '') },
    { id: 'age', label: 'Age', muted: true, optional: true, width: 'var(--space-16)', cell: r => (r.age === 'Unknown' ? '' : r.age ?? '') }];
  const columns = list => { const kind = kindOf(); if (!kind) return ALL_COLUMNS; return (kind.columns || []).filter(c => (c.id !== 'ns' || !kind.cluster) && (['name', 'status'].includes(c.id) || list.some(r => !gone(r[c.id]))))
    .map(c => c.as === 'restarts' ? restartsColumn({ width: c.width, optional: c.optional }) /* 공용 Restarts 열: kubectl 형식, 숫자만 주의 색, 사유는 툴팁(polish 표 규칙) */
      : ({ ...c, ...(c.id === 'name' ? { lead: () => ({ icon: kind.icon }) } : {}), ...(c.as ? { cell: r => CELL[c.as](r, c) } : c.value ? { cell: r => (typeof r[c.id] === 'number' ? num(r[c.id]) : r[c.id] ?? '') } : {}) })); };
  const podStatusOf = r => r.status?.[1] ?? '';
  const bad = r => ['warn', 'danger'].includes(r.status?.[0]);
  /* 목록이 보이는 행. skip: 그 거르기 하나를 빼고(알약·메뉴의 수는 자기 거르기만 뺀 같은 모집단에서 센다, C-19) */
  /* namespace를 고르면 Node(클러스터 범위)는 그 namespace의 Pod가 도는 것만(SCR-SEARCH-SCOPE의 Node→Pod 관계, A3-13) */
  const nodesInNs = () => { if (!box.ns()?.length) return null; const list = [...pods, ...rows.filter(x => x.plural === 'pods')]; return new Set(list.filter(p => nsOk(p.ns)).map(p => p.node)); };
  let nodeSet = null;
  const inScope = r => ((r.plural ?? plural()) === 'nodes' ? !nodeSet || nodeSet.has(r.name) : nsOk(r.ns));
  const pass = (r, skip = null) => {
    const s = st(), q = box.q(), pod = plural() === 'pods';
    return inScope(r) && (!q || r.name.toLowerCase().includes(q)) && (skip === 'only' || s.only !== 'bad' || bad(r))
      && (!pod || ((skip === 'pst' || s.pst === 'all' || podStatusOf(r) === s.pst) && (skip === 'node' || !s.node || r.node === s.node) && (skip === 'owner' || !s.owner || r.controlledBy === s.owner)));
  };
  const base = skip => { nodeSet = nodesInNs(); return rows.map(derived).filter(r => pass(r, skip)); };
  const idOf = r => r.uid ? `uid:${r.uid}` : [r.plural ?? '', r.ns, r.name].join('/');
  const open = r => { const p = r.plural ?? plural(), k = KIND_OF[p] ?? kindOf();
    return A('cluster', id, 'ns', k?.cluster ? '_all' : r.ns || '_all', p, r.name) + (r.uid ? '?uid=' + encodeURIComponent(r.uid) : '') + (q0.at === undefined ? '' : `${r.uid ? '&' : '?'}at=${encodeURIComponent(q0.at)}`); };
  /* 알약의 수(GitOps·알림·이벤트와 같음): 다 읽은 뒤에만, 문제 있음은 수가 있으면 주의 표시 */
  const count = id => { if (phase !== 'ready') return {}; const list = base('only'), n = id === 'bad' ? list.filter(bad).length : list.length; return { count: num(n), ...(id === 'bad' && n ? { badge: { tone: 'warn' } } : {}) }; };
  const filters = () => {
    const s = st(), only = C.pillTabs.render({ id: 'wake-rv-only', label: t('wake.list.filter'), value: s.only, tabs: [{ id: 'all', label: t('wake.list.all') }, { id: 'bad', label: t('wake.rv.hasBad') }].map(tab => ({ ...tab, ...count(tab.id) })), action: 'wake.rv.only' });
    if (plural() !== 'pods') return only;
    return html`${only}${C.select.render({ value: s.pst === 'all' ? t('wake.rv.allStates') : s.pst, menu: 'wake.rv.stMenu', label: t('wake.rv.state'), width: SCOPE_W })}${C.select.render({ value: s.node || t('wake.rv.allNodes'), icon: 'k8s-node', menu: 'wake.rv.nodeMenu', label: 'Node', width: SCOPE_W })}${C.select.render({ value: s.owner || t('wake.rv.allOwners'), icon: 'k8s-deployment', menu: 'wake.rv.ownerMenu', label: 'Owner', width: SCOPE_W })}`;
  };
  const factItems = list => listFacts(plural() ?? '', list).map(f => ({ ...f, label: f.label.startsWith('wake.') ? t(f.label) : f.label, value: typeof f.value === 'number' ? num(f.value) : f.value }));
  function table() {
    const p = plural(), kind = kindOf(), label = kind ? kindName(kind) : box.kinds() ? box.kinds().map(k => kindName(KIND_OF[k])).join(' · ') : t('wake.scope.allKinds');
    if (phase === 'forbidden') {
      const need = parseForbidden(failure?.message, permArg(p).need);
      return C.emptyState.render({ icon: 'lock', plainIcon: true, title: t('wake.rv.denied', { verb: need?.verb ?? 'list', res: need?.resource ?? p }),
        action: C.button.render({ label: t('wake.flow.a.perm'), variant: 'secondary', size: 'sm', round: true, action: 'wake.perm.show', arg: permArg(p, need) }) });
    }
    /* 읽는 동안: 같은 막대(종류 이름)와 그 종류의 표 머리, 값 자리만 뼈대 행(알려진 수, 없으면 한 쪽) */
    if (phase === 'loading') {
      const cols = kind ? (kind.columns || []).filter(c => c.id !== 'ns' || !kind.cluster) : ALL_COLUMNS, known = kinds.find(k => k.plural === p)?.count;
      return C.summaryBar.render({ label, open: !folded.list, toggle: { action: 'wake.rv.fold', arg: 'list' }, items: [{ id: 't', label: '', value: label }, { id: 'n', label: '', value: SKEL, priority: 9, ariaLabel: t('wake.res.loading') }],
        body: skeletonTable(cols, Math.min(PER, Number.isFinite(known) && known > 0 ? known : PER)) });
    }
    if (phase !== 'ready') return pending();
    /* a name search orders as the cluster search (rank): the same name first, then names starting with it, then names holding it */
    const s = st(), q = box.text().trim(), ns = box.ns(), all = (nodeSet = nodesInNs(), rows.map(derived)), list = all.filter(r => pass(r)).sort((a, b) => (q ? rank(a.name, q) - rank(b.name, q) : 0) || compareResources(a, b)), total = list.length, pages = Math.max(1, Math.ceil(total / PER)), page = Math.min(s.pg, pages);
    const filtered = ns || (p === 'pods' && (s.node || s.owner));
    if (!total) return C.emptyState.render({ icon: 'search', plainIcon: true, title: q ? t('wake.rv.noResults', { q }) : t('wake.rv.noneKind', { kind: label }),
      ...(filtered ? { description: t('wake.rv.noMatch', { filters: [p === 'pods' && s.node ? `Node ${s.node}` : '', p === 'pods' && s.owner ? `Owner ${s.owner}` : '', ns ? `namespace ${ns.join(', ')}` : ''].filter(Boolean).join(' · ') }) } : {}) });
    const shown = list.slice((page - 1) * PER, page * PER).map(r => ({ ...r, id: idOf(r) }));
    return C.summaryBar.render({ label, open: !folded.list, toggle: { action: 'wake.rv.fold', arg: 'list' },
      items: [{ id: 't', label: '', value: label }, { id: 'n', label: '', value: num(total), priority: 9 }, ...factItems(list)],
      body: html`${C.dataTable.render({ clip: true, rowKey: 'id', rows: shown, rowAction: 'wake.list.open', activeKey, reveal: true, columns: columns(list) })}${C.pager.range({ page, per: PER, total, action: 'wake.rv.page' })}` });
  }
  const resources = () => html`
    ${header('k8s-deployment', t('wake.view.resources'), ['Kubernetes API', clusterName()])}
    ${box.render()}
    ${limitedLine()}
    ${C.listToolbar.render({ filters: filters() })}
    ${table()}${otherKinds()}`;

  /* ---------- 이벤트 화면 ---------- */
  const eventsData = eventsView(ctx, { header, box, pending: () => (phase === 'forbidden' ? C.emptyState.render({ icon: 'lock', plainIcon: true, title: t('wake.rv.denied', { verb: 'list', res: 'events' }) }) : pending()), rows: () => rows, ready: () => phase === 'ready', loading: () => phase === 'loading', clusterName, folded });

  /* A detail address opens beside this list (the shell falls back to a plain navigation where it cannot): the list keeps its live document,
     so filter, search, page and scroll stay. The row that opened it stays marked and takes the focus back when the detail closes. */
  let pageRoot = null, opened = null, activeKey = null;
  const toDetail = address => { opened = address; const row = rows.find(r => open(r) === address); if (row) { activeKey = idOf(row); ctx.update(); }
    ctx.api.navigate(address, ctx.router?.parse(address)?.route?.id === 'detail' ? { presentation: 'detail' } : {}); };
  const focusOpener = () => { [...(pageRoot?.querySelectorAll('[data-action="wake.list.open"]') || [])].find(b => b.dataset.arg === JSON.stringify(activeKey) || b.dataset.arg === activeKey)?.focus({ preventScroll: true }); };
  /* 주소가 이름 붙인 종류 · namespace(홈 요약 · 흐름에서 연 목록)는 범위가 된다: 다른 구역에서도 이어짐 */
  void box.adopt({ ...(KIND_OF[params.kind] && !events ? { kind: params.kind } : {}), ...(params.ns && params.ns !== '_all' ? { ns: [params.ns] } : {}) });
  const started = box.init();
  void load();
  return {
    screen: {
      state: { only: q0.filter === 'bad' ? 'bad' : 'all', pst: 'all', node: null, owner: null, pg: 1, ...eventsData.state(q0) },
      ai: ['only', 'pst', 'node', 'owner', 'pg', ...eventsData.ai],
      range: { key: 'evRange', retention: 7 * 86400 },
      set: eventsData.set,
    },
    init: () => started,
    /* 한 열(머리·도구 줄·목록)이 통째로 스크롤된다: 이 페이지는 자기 스크롤 영역을 쓰므로(bootPage scroll: false) 열이 그 영역이어야 한다(빠지면 main이 잘라 내려 볼 수 없었다) */
    render: () => { if (loaded !== undefined && readKey() !== loaded) void load(); return C.pageColumn.render({ width: 'home', scroll: true, children: events ? eventsData.render() : resources() }); },
    afterRender: root => { pageRoot = root; root.dataset.wakeView = events ? 'events' : 'resources'; },
    onDetail: p => { if (p.state === 'open') return; focusOpener(); if (activeKey != null) { activeKey = null; ctx.update(); } },
    meta: () => metaOf(),
    onSettings: () => ctx.update(),
    menus: {
      ...box.menus,
      'wake.rv.stMenu': () => { const n = new Map(); for (const r of base('pst')) n.set(podStatusOf(r), (n.get(podStatusOf(r)) ?? 0) + 1);
        return C.select.menuDef({ key: 'pst', value: st().pst, action: 'wake.rv.pst', options: [{ id: 'all', label: t('wake.rv.allStates') }, ...[...n].sort((a, b) => b[1] - a[1]).map(([s, c]) => ({ id: s, label: { raw: `${s} · ${num(c)}` } }))] }); },
      'wake.rv.nodeMenu': () => { const n = new Map(); for (const r of base('node')) if (r.node) n.set(r.node, (n.get(r.node) ?? 0) + 1);
        return C.select.menuDef({ key: 'node', value: st().node ?? 'all', action: 'wake.rv.node', options: [{ id: 'all', label: t('wake.rv.allNodes') }, ...[...n].sort((a, b) => a[0].localeCompare(b[0])).map(([s, c]) => ({ id: s, label: { raw: `${s} · Pod ${num(c)}` } }))] }); },
      'wake.rv.ownerMenu': () => { const n = new Map(); for (const r of base('owner')) if (r.controlledBy) n.set(r.controlledBy, (n.get(r.controlledBy) ?? 0) + 1);
        return C.select.menuDef({ key: 'owner', value: st().owner ?? 'all', action: 'wake.rv.owner', options: [{ id: 'all', label: t('wake.rv.allOwners') }, ...[...n].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([s, c]) => ({ id: s, label: { raw: `${s} · ${num(c)}` } }))] }); },
      ...eventsData.menus,
    },
    actions: {
      ...search.actions,
      ...box.actions,
      ...eventsData.actions,
      'wake.list.retry': () => Promise.all([box.retry(), load()]).then(() => ctx.update()),
      'wake.rv.only': a => ctx.setState({ only: String(a.arg?.value ?? a.arg), pg: 1 }),
      'wake.rv.page': a => ctx.setState({ pg: Number(a.arg?.value ?? a.arg) || 1 }),
      'wake.rv.fold': a => { folded[a.arg] = !a.open; },
      'wake.rv.pst': a => ctx.setState({ pst: String(a.arg?.value ?? a.arg), pg: 1 }),
      'wake.rv.node': a => { const v = String(a.arg?.value ?? a.arg); ctx.setState({ node: v === 'all' ? null : v, pg: 1 }); },
      'wake.rv.owner': a => { const v = String(a.arg?.value ?? a.arg); ctx.setState({ owner: v === 'all' ? null : v, pg: 1 }); },
      'wake.list.open': a => { const r = rows.find(x => idOf(x) === a.arg); if (r) toDetail(open(r)); },
      'kit.navigate': a => toDetail(a.arg.address),
    },
  };
}, { scroll: false });
