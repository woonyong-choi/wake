import config from '../app.config.js';
import { bootPage, components as C, formatPercent, html, service } from '../../../kit/page/index.js';
import { costAddress, costValue } from '../data/costs.js';
import { compareText } from '../data/table-order.js';
import { when } from './incident-parts.js';
import { SEARCH_W, clusterSearch } from './cluster-search.js';
import { clusterNameOf } from './view-parts.js';

const PERIODS = { '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 };
const VIEWS = ['namespace', 'workload', 'pod', 'node'];
const COLUMNS = ['name', 'total', 'cpu', 'memory', 'storage', 'network', 'share'];
const STATUSES = ['connected', 'ready', 'partial', 'empty', 'unconfigured', 'forbidden', 'failed', 'target',
  'identity_unverified', 'identity_changed', 'timeout', 'too_large', 'busy', 'cancelled'];
const PAGE_SIZE = 25;

bootPage(config, ctx => {
  const { t, params: { cluster: id }, query } = ctx;
  const period = Object.hasOwn(PERIODS, query.period) ? query.period : '7d';
  const view = VIEWS.includes(query.view) ? query.view : 'namespace';
  const scope = Object.fromEntries(['namespace', 'controllerKind', 'controller', 'pod', 'node'].filter(key => query[key]).map(key => [key, query[key]]));
  const fixed = query.from && query.to ? { from: Number(query.from), to: Number(query.to) } : {};
  const custom = fixed.from && fixed.to - fixed.from !== PERIODS[period];
  const base = { period, ...fixed };
  let busy = false, settled = false, disposed = false, data, status = 'unconfigured', targets, selected, configured, found = null;
  let showConfig = query.configure === '1', page = 1, sort = { id: 'total', dir: 'desc' }, folded = false;
  const time = at => when(at, data?.end ?? Date.now());
  /* 비용 자료가 없을 때(연결 안 됨)도 검색 칸은 남는다: 그때는 클러스터 전체 이름 검색(결정 검색 칸) */
  const findAll = clusterSearch(ctx, id);
  const money = number => costValue(number, data?.currency);
  const navigate = next => ctx.api.navigate(costAddress(id, next));
  const key = state => 'wake.cost.state.' + (STATUSES.includes(state) ? state : 'failed');
  const tone = state => state === 'ready' || state === 'connected' ? 'ok' : state === 'forbidden' ? 'perm'
    : state === 'partial' ? 'warn' : ['unconfigured', 'empty'].includes(state) ? 'unknown' : 'error';
  const state = (kind, label) => C.statusIcon.render({ kind, text: t(label) });

  async function perform(op, args = {}) {
    if (disposed || busy || !ctx.desktop) return null;
    busy = true; ctx.update();
    const result = await service('costs.open', { id, op, ...args }).catch(() => ({ status: 'failed' }));
    if (disposed) return null;
    busy = false;
    if (!result) { ctx.update(); return null; }
    if (result.configured?.service) configured = result.configured;
    return result;
  }
  async function discover() {
    if (busy) return;
    showConfig = true;
    const result = await perform('targets');
    if (!result) { ctx.update(); return; }
    /* 찾기의 결과는 찾기 칸 안에서만 말한다: 찾지 못한 이유가 화면의 연결 상태(연결 안 됨)를 덮지 않는다(B2-06) */
    targets = result.targets || null;
    found = targets ? null : result.status || 'failed';
    selected = targets?.find(row => row.uid === (selected || configured?.service.uid))?.uid || targets?.[0]?.uid;
    ctx.update();
  }
  async function read() {
    const result = await perform('read', { ...base, view, ...scope, compare: !Object.keys(scope).length });
    settled = true;
    if (!result) { ctx.update(); return; }
    status = result.status;
    if (result.status === 'identity_changed' || result.status === 'forbidden' || result.status === 'unconfigured') data = null;
    if (result.rows) data = result;
    ctx.update();
    if (showConfig) await discover();
  }
  async function connect() {
    if (!selected) return;
    const result = await perform('connect', { service: selected });
    if (!result) return;
    status = result.status;
    if (status === 'connected') { showConfig = false; data = null; ctx.update(); await read(); }
    else ctx.update();
  }

  const selectedLabel = () => {
    const target = targets?.find(row => row.uid === selected);
    return target ? target.namespace + '/' + target.name : t('wake.cost.service');
  };
  /* 처음 설정 안 됨: 기간·집계 범위·새로고침은 의미가 없으므로 빈 상태 하나와 OpenCost 동작만. 권한·오류는 여기에 들지 않는다 */
  const unconfigured = () => settled && !busy && !data && status === 'unconfigured';
  const configuration = () => {
    if (!showConfig) return '';
    if (targets?.length) return C.settingsSection.render({ title: 'OpenCost', children: C.listToolbar.render({
      start: C.select.render({ label: t('wake.cost.service'), value: selectedLabel(), menu: 'wake.cost.services', disabled: busy }),
      end: C.button.render({ label: t('wake.flow.connect'), action: 'wake.cost.connect', disabled: busy || !selected }) }) });
    /* 찾는 중, 찾은 서비스 없음, 찾지 못한 이유: 모두 OpenCost 카드 안의 한 줄(B2-18) */
    const [kind, words] = targets ? ['idle', 'wake.cost.noService'] : found && !busy ? [tone(found), key(found)] : ['busy', 'wake.res.loading'];
    return C.settingsSection.render({ title: 'OpenCost', children: C.settingsGroup.render({ children: C.listRow.render({ lead: C.statusIcon.render({ kind }), title: t(words),
      end: kind === 'busy' ? '' : C.button.render({ label: t('wake.flow.a.retry'), size: 'sm', variant: 'secondary', action: 'wake.cost.configure', disabled: busy }) }) }) });
  };

  const percent = value => formatPercent(value, { maximumFractionDigits: 1 });
  const seriesCard = (title, times, values, labels = times.map(time)) => {
    const max = Math.max(0, ...values.map(value => value ?? 0)) || 1;
    const series = { name: title, color: '--series-1', values };
    const props = { kind: 'bar', height: 128, x: labels, max, ticks: [0, max / 2, max].map(value => Number(value.toPrecision(3))),
      unit: data.currency ? ' ' + data.currency : '', series: [series] };
    if (times.length > 1 && times.every(value => typeof value === 'number')) {
      const middle = Math.round((data.start + data.end) / 2);
      props.kind = 'area';
      props.timeAxis = { from: data.start / 1000, to: data.end / 1000, maxGapSeconds: (times[1] - times[0]) / 1000,
        ticks: [data.start, middle, data.end].map(at => ({ at: at / 1000, label: time(at) })) };
      props.series = [{ name: title, color: '--series-1', key: 'costs',
        observations: times.map((at, index) => ({ at: at / 1000, value: values[index], joinPrevious: values[index - 1] != null && values[index] != null })) }];
    }
    return C.chartCard.render({ title, density: 'compact', caption: time(data.start) + ' → ' + time(data.end), chart: props });
  };
  const label = row => row.name === '__idle__' ? t('wake.cost.idle') : row.name === '__unallocated__' ? t('wake.cost.unallocated')
    : row.name === '__unknown__' ? t('wake.cost.targetUnknown') : row.name;
  const drillAddress = row => {
    if (row.name.startsWith('__')) return null;
    const window = { period, from: data.start, to: data.end, overlap: query.overlap };
    if (view === 'namespace') return costAddress(id, { ...window, view: 'workload', namespace: row.name });
    if (view === 'workload' && row.namespace && row.kind && row.controller) {
      return costAddress(id, { ...window, view: 'pod', namespace: row.namespace, controllerKind: row.kind, controller: row.controller });
    }
    return null;
  };
  const display = () => {
    const share = row => data.total > 0 && Number.isFinite(row.total) ? row.total / data.total : null;
    const field = (row, col) => col === 'share' ? share(row) : row[col];
    const q = (ctx.state().q || '').trim().toLowerCase();
    const rows = data.rows.filter(row => !q || label(row).toLowerCase().includes(q)).sort((a, b) => {
      if (sort.id === 'name') return (sort.dir === 'asc' ? 1 : -1) * compareText(label(a), label(b)) || compareText(a.id, b.id);
      const first = field(a, sort.id), second = field(b, sort.id);
      if (first == null || second == null) return (first == null) - (second == null) || compareText(a.id, b.id);
      return (sort.dir === 'asc' ? first - second : second - first) || compareText(a.id, b.id);
    });
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), current = Math.max(1, Math.min(page, pages));
    const top = data.rows.filter(row => !row.name.startsWith('__') && row.total != null).sort((a, b) => b.total - a.total);
    const first = top.slice(0, 10), other = top.slice(10);
    const comparison = data.previous > 0 && data.total != null ? percent((data.total - data.previous) / data.previous) : '';
    const charts = [seriesCard(t('wake.cost.trend'), data.trend.map(slot => slot.end), data.trend.map(slot => slot.value))];
    if (view === 'namespace' && first.length) {
      const labels = first.map(row => row.name), values = first.map(row => row.total);
      if (other.length) { labels.push(t('wake.cost.other')); values.push(other.reduce((sum, row) => sum + row.total, 0)); }
      charts.push(seriesCard(t('wake.cost.top'), labels, values, labels));
    }
    const columns = COLUMNS.map(col => ({ id: col, label: t('wake.cost.' + col), align: col === 'name' ? 'left' : 'right', value: col !== 'name',
      sortable: true, width: col === 'name' ? undefined : `calc(${col === 'total' ? 18 : 10}ch + 2 * var(--space-2))`,
      cell: row => {
        if (col === 'name') {
          const address = drillAddress(row);
          return address ? C.button.render({ label: label(row), tip: label(row), size: 'sm', variant: 'ghost', action: 'kit.navigate', arg: { address } })
            : C.value.render({ text: label(row), reveal: true });
        }
        if (col === 'share') return share(row) == null ? '' : percent(share(row));
        return money(row[col]);
      },
    }));
    /* 카드 머리: 이름 | 주 값(총액) | 이름 붙은 값 | 기간 | 상태 */
    const items = [{ id: 'n', label: '', value: t('wake.cost.scope.' + view) }, { id: 'total', label: t('wake.cost.total'), value: money(data.total) },
      { id: 'idle', label: t('wake.cost.idle'), value: money(data.idle) }, { id: 'unallocated', label: t('wake.cost.unallocated'), value: money(data.unallocated) },
      ...(comparison ? [{ id: 'previous', label: t('wake.cost.previous'), value: comparison }] : []),
      { id: 'window', label: t('wake.cost.period'), value: time(data.start) + ' → ' + time(data.observedThrough ?? data.end) },
      ...(status === 'partial' ? [{ id: 'state', label: '', value: t(key(status)), tone: 'warn' }] : [])];
    return html`
      ${rows.length ? C.layoutGrid.render({ fit: true, children: charts }) : ''}
      ${C.summaryBar.render({ label: t('wake.cost.title'), open: !folded, toggle: { action: 'wake.cost.fold' }, items,
        body: rows.length ? html`${C.dataTable.render({ columns, rows: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), rowKey: 'id', sort, sortAction: 'wake.cost.sort' })}${C.pager.range({ page: current, per: PAGE_SIZE, total: rows.length, action: 'wake.cost.page' })}`
          : C.emptyState.render({ title: t('wake.cost.state.empty'), variant: 'line' }) })}`;
  };

  globalThis.addEventListener('pagehide', () => { disposed = true; }, { once: true });
  return {
    init: () => { void read(); },
    screen: { state: { q: '' }, search: { key: 'q', scope: 'list', reset: {} } },
    meta: () => ({ title: t('wake.cost.title'), icon: 'chart-line', context: { icon: 'chart-line', title: t('wake.cost.title'), sub: clusterNameOf(ctx, id) } }),
    render: () => {
      const source = configured ? 'OpenCost ' + configured.service.namespace + '/' + configured.service.name : 'OpenCost';
      /* 머리(A2-18): 연결 안 됨이면 도구·에이전트 화면처럼 머리 끝에 클러스터 검색 칸, "OpenCost 찾기"는 빈 상태의 단추 하나. 연결되면 찾기(secondary)·새로고침 */
      const head = C.pageHeader.render({ icon: 'chart-line', title: t('wake.cost.title'), sub: [source, clusterNameOf(ctx, id)], size: 'home',
        end: html`${busy ? C.button.render({ label: t('wake.cost.cancel'), size: 'sm', variant: 'ghost', action: 'wake.cost.cancel' }) : ''}
          ${unconfigured() ? findAll.field() : html`${C.button.render({ label: t('wake.cost.find'), size: 'sm', variant: 'secondary', action: 'wake.cost.configure', disabled: busy || !ctx.desktop })}
          ${C.button.render({ label: t('wake.monitor.refresh'), icon: 'arrow-rotate-clockwise', size: 'sm', variant: 'ghost', action: 'wake.cost.read', disabled: busy || !ctx.desktop })}`}` });
      /* 찾기를 한 뒤에는 OpenCost 카드의 다시 시도가 같은 동작이다: 빈 상태 단추는 찾기 전에만(B3-16) */
      if (unconfigured() && !targets?.length) return C.pageColumn.render({ width: 'home', children: html`${head}${findAll.results()}${C.emptyState.render({ icon: 'chart-line', plainIcon: true, title: t('wake.cost.unconfigured'),
        action: showConfig ? '' : C.button.render({ label: t('wake.cost.find'), size: 'sm', variant: 'secondary', action: 'wake.cost.configure', disabled: busy || !ctx.desktop }) })}${configuration()}` });
      const scoped = Object.values(scope).join(' / ');
      const tools = unconfigured() ? '' : C.listToolbar.render({
        scope: scoped ? C.select.render({ label: t('wake.cost.scope'), value: scoped, icon: 'k8s-namespace', menu: 'wake.cost.scopes' }) : '',
        search: C.searchInput.render({ placeholder: t('wake.rv.searchName'), action: 'kit.screen.search', value: ctx.state().q || '', width: SEARCH_W }),
        time: C.select.render({ label: t('wake.cost.period'), value: custom ? t('wake.cost.customPeriod') : t('wake.cost.period.' + period), menu: 'wake.cost.periods' }),
        view: C.select.render({ label: t('wake.cost.scope'), value: t('wake.cost.scope.' + view), menu: 'wake.cost.views' }) });
      /* 자료가 없을 때의 상태(읽는 중, 권한, 실패)는 한 줄 */
      const line = !data && (busy || (settled && !unconfigured())) ? C.statusIcon.render({ kind: busy ? 'busy' : tone(status), text: t(busy ? 'wake.res.loading' : key(status)) }) : '';
      return C.pageColumn.render({ width: 'home', children: html`${head}${tools}${unconfigured() ? findAll.results() : ''}${line}${configuration()}${data ? display() : ''}` });
    },
    menus: {
      'wake.cost.periods': () => C.select.menuDef({ options: Object.keys(PERIODS).map(id => ({ id, label: 'wake.cost.period.' + id })), value: custom ? null : period, action: 'wake.cost.period' }),
      'wake.cost.scopes': () => C.select.menuDef({ options: [{ id: 'all', label: 'wake.list.all' }, { id: 'here', label: { raw: Object.values(scope).join(' / ') } }], value: 'here', action: 'wake.cost.scopeAll' }),
      'wake.cost.views': () => C.select.menuDef({ options: ['namespace', 'node'].map(id => ({ id, label: 'wake.cost.scope.' + id })), value: view, action: 'wake.cost.view' }),
      'wake.cost.services': () => C.select.menuDef({ options: (targets || []).map(row => ({ id: row.uid, label: { raw: row.namespace + '/' + row.name } })), value: selected, action: 'wake.cost.service' }),
    },
    actions: {
      ...findAll.actions,
      'wake.cost.read': () => read(),
      'wake.cost.cancel': () => service('costs.open', { id, op: 'cancel' }).catch(() => {}),
      'wake.cost.configure': () => discover(),
      'wake.cost.connect': () => connect(),
      'wake.cost.period': ({ arg }) => navigate({ view, ...scope, period: arg.value, overlap: query.overlap }),
      'wake.cost.view': ({ arg }) => navigate({ ...base, view: arg.value, overlap: query.overlap }),
      'wake.cost.service': ({ arg }) => { selected = arg.value; ctx.update(); },
      'wake.cost.sort': ({ arg }) => { if (COLUMNS.includes(arg)) { sort = { id: arg, dir: arg === sort.id && sort.dir === 'asc' ? 'desc' : 'asc' }; page = 1; ctx.update(); } },
      'wake.cost.page': ({ arg }) => { page = Number(arg?.value ?? arg) || 1; ctx.update(); },
      'wake.cost.fold': a => { folded = !a.open; },
      'wake.cost.scopeAll': ({ arg }) => { if (arg?.value === 'all') navigate({ ...base, view: 'namespace', overlap: query.overlap }); },
    },
  };
});
