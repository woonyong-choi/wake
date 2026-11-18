/*
 * 네트워크 화면(시뮬레이션 networkPage()): 머리(네트워크 · Prometheus · 클러스터 · 보관, 보관은 Prometheus가 알려 준 storageRetention이 있을 때만) → 범위 검색 상자(Service 이름 · 종류 · namespace · 구간) → 출처 끊김 줄 → 도구 줄(Service/namespace)
 * → 네트워크 대역폭 카드(수신 · 송신 · 수신 최대 · 송신 최대, 그래프) → 서비스 흐름 카드(Ingress → Service, 관측한 nginx 요청률만)
 * → 트래픽 상위 카드(활성 연결 · 5xx 비율 최대, 수신 + 송신이 큰 순서의 표 20줄씩). 값은 Prometheus 질의 결과를 network.js가 계산한다.
 * 5xx 상태(흐름 · 표 칸 · 머리)는 홈 5xx 막대의 임계값을 넘으면 실패 하나.
 * 범위: Service 종류는 그 Service, 다른 종류는 범위의 Pod를 selector로 고르는 Service(data/scope.js), namespace는 시리즈의 namespace 라벨.
 */
import { readIdentity, retainRead } from '../data/read-state.js';
import config from '../app.config.js';
import { bootPage, components as C, html } from '../../../kit/page/index.js';
import { when, axisTime } from './incident-parts.js';
import { clusterNameOf, viewHeader, sourceLines, readRow, readFailure, sectionTabs } from './view-parts.js';
import { scopeBox } from './scope-box.js';
import { serviceRows, networkSummary, serviceFlow, trafficRows, errOver, errTone } from '../data/network.js';
import { windowOf, stepOf, rateDigits, ERR_DIGITS, DAY } from '../data/home.js';
import { num, byteRate, byteRates, rateUnit } from './parts.js';
import { LIMITS } from '../data/connect-flow.js';

const PER = 20;
const W2 = 'calc(var(--space-16) * 2)', W15 = 'calc(var(--space-16) * 1.5)';
const A = (...p) => 'wake://' + p.map(encodeURIComponent).join('/');
const rate = byteRate;
const pct = v => (v == null ? '' : `${Math.round(v * 10) / 10}%`);
/* 5xx 비율과 초당 요청은 홈과 같은 글(A2-11): 5xx 소수 둘째 자리, 요청은 유효 숫자 둘(한 그래프의 값들은 가장 큰 값의 자리) */
const errPct = v => (v == null ? '' : `${v.toFixed(ERR_DIGITS)}%`);
const reqRate = (v, d = rateDigits(v)) => `${d ? v.toFixed(d) : num(Math.round(v))}/s`;

bootPage(config, ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  let snap = null, services = [], phase = 'loading', readKey = '', successKey = '', sequence = 0, disposed = false;
  const sources = sourceLines(ctx, id), folded = {};
  const box = scopeBox(ctx, id, 'network', { onRun: () => ctx.setState({ page: 1 }), alive: () => !disposed });
  /* 닫힌 뒤 늦게 온 읽기는 그리지 않는다(C-17): 순번을 넘겨 진행 중인 읽기를 버린다 */
  globalThis.addEventListener?.('pagehide', () => { disposed = true; sequence++; }, { once: true });
  const st = () => ctx.state();
  const now = () => Date.parse(snap?.at ?? '') || Date.now();
  /* 범위의 Service: 종류가 없으면 namespace만, 종류가 Service면 그 Service, 그 밖의 종류는 범위 Pod를 selector로 고르는 Service */
  /* 한 Service의 답은 같은 관계 · 같은 Service 목록 동안 한 번만 센다(시리즈 행마다 범위 Pod를 다시 훑지 않음) */
  let svcSeen = { rel: null, services: null, by: new Map() };
  const svcOk = (n, name) => { const r = box.relation(); if (!r.kinds) return r.inNs(n);
    if (svcSeen.rel !== r || svcSeen.services !== services) svcSeen = { rel: r, services, by: new Map() };
    const key = JSON.stringify([n, name]);
    if (!svcSeen.by.has(key)) { const svc = services.find(x => x.ns === n && x.name === name);
      svcSeen.by.set(key, r.has('Service', n, name) || (!!svc && Object.keys(svc.selector || {}).length > 0 && r.pods.some(p => p.ns === n && Object.entries(svc.selector).every(([k, v]) => p.labels?.[k] === v)))); }
    return svcSeen.by.get(key); };
  /* 답이 없는 읽기는 끝없는 "불러오는 중"이 아니라 시간 초과(다시 시도): 설정 읽기와 같은 한도(LIMITS.readMs) */
  const within = (p, ms = LIMITS.readMs) => { let timer; return Promise.race([p, new Promise((_, no) => { timer = setTimeout(() => no(Object.assign(new Error('read timeout'), { kind: 'timeout' })), ms); })]).finally(() => clearTimeout(timer)); };
  async function load() {
    const { from, to } = windowOf(st().range, Date.now()), seq = ++sequence;
    const key = readIdentity(id, 'prometheus', 'network', st().range);
    snap = retainRead(snap, { before: successKey, after: key });
    readKey = JSON.stringify(st().range); if (!snap) { phase = 'loading'; ctx.update(); }
    try {
      /* Service 목록과 네트워크 시리즈를 함께 읽어 한도 하나(LIMITS.readMs) 안에 답하거나 시간 초과 */
      const [list, net] = await Promise.all([within(data.get('resources', { cluster: id, ns: '_all', kind: 'services' })).catch(() => []), within(data.get('network', { cluster: id, from, to, step: stepOf(from, to) }))]);
      if (seq !== sequence) return;
      services = list.map(s => ({ ns: s.ns, name: s.name, kind: 'Service', ports: [], selector: s.selector ?? {} }));
      snap = net; successKey = key;
      phase = 'ready';
    } catch (e) { if (seq !== sequence) return; snap = retainRead(snap, { before: successKey, after: key, error: e }); phase = e?.kind === 'unconfigured' ? 'unconfigured' : e?.status === 403 ? 'forbidden' : 'error'; }
    await within(sources.read()).catch(() => {});
    if (seq !== sequence) return;
    if (phase === 'unconfigured' || !sources.matches('prometheus', snap?.sourceState?.target)) snap = null;
    ctx.update();
  }
  /* Prometheus가 지키는 기간(초): 읽은 답의 storageRetention, 모르면 null(머리에 쓰지 않고 기간 고르기를 막지 않음) */
  const kept = () => (Number.isFinite(snap?.retention) && snap.retention > 0 ? snap.retention : null);
  const range = () => C.timeRange.render({ id: 'network-range', value: st().range, action: 'kit.screen.range', fallback: '1h', retention: kept() ?? undefined, now: Math.floor(now() / 1000), label: t('wake.view.range') });
  const card = (key, label, items, body) => C.summaryBar.render({ label, open: !folded[key], toggle: { action: 'wake.net.fold', arg: key }, items: [{ id: 't', label: '', value: label }, ...items], body });
  function traffic(sum) {
    /* 시간 축은 허브가 실제로 질의한 구간(snap.range)이다. 읽기 뒤의 지금(now)으로 다시 계산하면 첫 점이 축보다 앞서 차트가 그려지지 않는다 */
    const title = t('wake.net.traffic'), { from, to } = snap.range;
    const label = axisTime(from, to);
    /* 축 단위는 이 구간의 가장 큰 값에서 고른다(작은 대역폭이 MiB/s 축의 0에 붙지 않음) */
    const { unit, size } = rateUnit(Math.max(0, ...['rx', 'tx'].flatMap(k => sum.series[k].map(o => o.value)).filter(Number.isFinite)));
    const series = [['rx', t('wake.net.rx'), '--series-1'], ['tx', t('wake.net.tx'), '--series-2']].map(([key, name, color]) => ({ key, name, color, dash: 'none', pattern: 'solid',
      observations: sum.series[key].map((o, j) => ({ at: o.at / 1000, value: Math.round(o.value / size * 100) / 100, label: label(o.at), joinPrevious: j > 0 })) }));
    const chart = C.chartCard.render({ title, value: '', widget: true, density: 'compact', legend: series.map(s => ({ label: s.name, color: s.color })),
      info: { title: t('wake.metric.query'), rows: [{ label: 'step', value: `${snap.step}s` }, { label: t('wake.view.range'), value: `${when(from, 0)} – ${when(to, 0)}` }], code: { lang: 'promql', text: [snap.queries.rx, snap.queries.tx].join('\n') } },
      chart: { kind: 'area', height: 200, bleed: true, fade: true, reading: true, axes: true, unit, series, timeAxis: { from: from / 1000, to: to / 1000, maxGapSeconds: stepOf(from, to) * 1.5 }, id: 'net:traffic', rangeAction: 'wake.net.zoom', interactive: 'full' } });
    const items = [{ id: 'rx', label: t('wake.net.rx'), value: rate(sum.rx) }, { id: 'tx', label: t('wake.net.tx'), value: rate(sum.tx) }, { id: 'px', label: t('wake.net.rxPeak'), value: rate(sum.rxPeak) }, { id: 'pt', label: t('wake.net.txPeak'), value: rate(sum.txPeak) }];
    return card('io', title, items, chart);
  }
  function flow(rows) {
    /* 관측한 띠만(Ingress → Service의 nginx 요청률): 서비스 사이 호출은 재지 않아 그리지 않는다(A2-13) */
    const rel = box.relation(), f = serviceFlow({ ingress: (snap.ingress ?? []).filter(s => rel.inNs(s.metric?.namespace)), rows });
    if (!f.nodes.length) return '';
    const HUE = { fail: '--destructive' }, d = rateDigits(f.total);
    const g = { mode: 'relation', visual: 'filledOutline', stack: true, stretch: true, fade: true, live: true, label: t('wake.net.flow'), gid: 'flg-net', width: 920, height: 320, columns: [0, 804], bar: 56, /* 두 열이 카드 폭을 다 쓴다(A-28) */
      stateLabels: { ok: '2xx·3xx', fail: '5xx' },
      nodes: f.nodes.map((n, i) => ({ id: n.id, col: n.col, y: i, h: 0, label: n.label, value: reqRate(n.value, d), icon: n.col === 0 ? 'k8s-ingress' : 'k8s-service', state: n.state,
        ...(HUE[n.state] ? { hue: HUE[n.state] } : { tone: n.col === 0 ? 'soc' : 'other' }), ...(n.name ? { action: 'kit.navigate', arg: { address: A('cluster', id, 'ns', n.ns, 'services', n.name) } } : {}) })),
      links: f.links.map(l => ({ from: l.from, to: l.to, fromOffset: 0, toOffset: 0, size: l.value, amount: l.value, value: reqRate(l.value, d), state: l.state })) };
    return card('flow', t('wake.net.flow'), [{ id: 'n', label: 'Ingress', value: reqRate(f.total, d) }], C.flowGraph.render(g));
  }
  function top(rows, sum, by) {
    const s = st(), pages = Math.max(1, Math.ceil(rows.length / PER)), page = Math.min(s.page, pages), label = t('wake.net.top'), shown = rows.slice((page - 1) * PER, page * PER);
    /* 한 열의 값은 같은 소수 자리(R4-17) */
    const rxRate = byteRates(shown.map(x => x.rx)), txRate = byteRates(shown.map(x => x.tx));
    const table = C.dataTable.render({ clip: true, rowKey: 'id', rows: shown, rowAction: by === 'ns' ? undefined : 'wake.net.open', reveal: true, columns: [
      { id: 'name', label: by === 'ns' ? 'Namespace' : 'Name', lead: () => ({ icon: by === 'ns' ? 'k8s-namespace' : 'k8s-service' }) },
      ...(by === 'ns' ? [] : [{ id: 'ns', label: 'Namespace', muted: true, optional: true, width: W2 }]),
      { id: 'rx', label: t('wake.col.receive'), kind: 'number', width: W2, cell: x => rxRate(x.rx) }, { id: 'tx', label: t('wake.col.transmit'), kind: 'number', width: W2, cell: x => txRate(x.tx) },
      { id: 'conns', label: t('wake.col.connections'), kind: 'number', optional: true, width: W15, cell: x => (x.conns == null ? '' : num(x.conns)) }, { id: 'err', label: '5xx', kind: 'number', optional: true, width: W15, cell: x => errPct(x.err), tone: x => errTone(x.err) },
      { id: 'retrans', label: t('wake.col.retransmits'), kind: 'number', optional: true, width: W15, cell: x => pct(x.retrans) }].filter(c => !['conns', 'err', 'retrans'].includes(c.id) || rows.some(x => x[c.id] != null)) });
    return card('top', label, [{ id: 'n', label: '', value: num(rows.length) }, ...(sum.conns == null ? [] : [{ id: 'c', label: t('wake.net.active'), value: num(sum.conns) }]), ...(sum.worst ? [{ id: 'e', label: t('wake.net.errMax'), value: `${sum.worst.name} ${errPct(sum.worst.err)}`, ...(errOver(sum.worst.err) ? { tone: 'danger' } : {}) }] : [])],
      rows.length ? html`${table}${C.pager.range({ page, per: PER, total: rows.length, action: 'wake.net.page' })}` : C.emptyState.render({ title: t('wake.net.none'), variant: 'line' }));
  }
  function body() {
    const s = st(), q = box.q(), by = s.by;
    if (JSON.stringify(s.range) !== readKey) void load();
    const head = viewHeader('k8s-service', t('wake.view.network'), ['Prometheus', clusterNameOf(ctx, id), kept() >= DAY / 1000 ? t('wake.inc.list.retention', { n: Math.floor(kept() / (DAY / 1000)) }) : ''], sectionTabs(t, 'network'));
    const failed = phase !== 'ready' && phase !== 'loading';
    const lines = failed ? '' : sources.line('prometheus', 'Prometheus', now());
    const scope = box.render({ range: range() });
    const tools = C.listToolbar.render({
      view: C.pillTabs.render({ id: 'wake-net-by', label: t('wake.rv.view'), value: by, action: 'wake.net.by', tabs: [{ id: 'svc', label: 'Service' }, { id: 'ns', label: 'namespace' }] }) });
    if (!snap) return html`${head}${scope}${lines}${tools}${phase === 'unconfigured' ? C.emptyState.render({ icon: 'k8s-service', plainIcon: true, title: t('wake.view.toolOff', { tool: 'Prometheus' }), action: C.button.render({ label: t('wake.tools.manage'), size: 'sm', variant: 'secondary', action: 'kit.navigate', arg: { address: 'wake://settings/tools' } }) }) : readRow(t, phase, 'wake.net.retry', t(phase === 'forbidden' ? 'wake.view.toolPerm' : 'wake.view.toolDown', { tool: 'Prometheus' }))}`;
    /* 같은 대상의 마지막 성공값은 실패 원인과 성공 시각을 붙여 보존한다. */
    const keep = m => svcOk(m?.namespace, m?.service) && (!q || String(m?.service ?? '').toLowerCase().includes(q));
    const input = Object.fromEntries(['rx', 'tx', 'conns', 'err', 'retrans'].map(k => [k, (snap[k] ?? []).filter(x => keep(x.metric))]));
    const sum = networkSummary(input), rows = trafficRows(serviceRows(input, by)); /* 트래픽 상위: 수신 + 송신이 큰 것부터(A2-12) */
    const previous = failed ? C.staleLine.render({ kind: 'warn', text: `${t('wake.list.stale')} · ${t('wake.view.lastCollected', { at: when(Date.parse(snap.at), 0) })}` }) : '';
    const retry = failed ? readRow(t, phase, 'wake.net.retry', t(phase === 'forbidden' ? 'wake.view.toolPerm' : 'wake.view.toolDown', { tool: 'Prometheus' })) : '';
    /* 범위(종류가 소유한 Pod)를 읽지 못하면 빈 목록 대신 그 실패와 원인(다시 시도는 관계도 다시 읽음) */
    const scoped = box.wait() ? readRow(t, 'loading', 'wake.net.retry') : box.failure() ? readRow(t, 'error', 'wake.net.retry', readFailure(t, box.failure())) : null;
    return html`${head}${scope}${lines}${previous}${tools}${retry}${scoped ?? html`${traffic(sum)}${flow(serviceRows(input))}${top(rows, sum, by)}`}`;
  }
  let started = false;
  return {
    screen: { state: { by: 'svc', page: 1, range: { preset: '1h' } }, ai: ['by', 'page', 'range'], range: { key: 'range' } },
    init: () => { if (started) return; started = true; void box.init(); void load(); },
    render: () => C.pageColumn.render({ width: 'home', children: body() }),
    afterRender: root => { root.dataset.wakeView = 'network'; },
    meta: () => ({ title: t('wake.view.network'), icon: 'k8s-service' }),
    onSettings: () => ctx.update(),
    menus: { ...box.menus },
    actions: {
      ...box.actions,
      'wake.net.retry': () => Promise.all([box.retry(), load()]).then(() => { if (!disposed) ctx.update(); }),
      'wake.net.fold': a => { folded[a.arg] = !a.open; },
      'wake.net.by': a => ctx.setState({ by: String(a.arg?.value ?? a.arg), page: 1 }),
      'wake.net.page': a => ctx.setState({ page: Number(a.arg?.value ?? a.arg) || 1 }),
      'wake.net.zoom': a => { if (Number.isFinite(a.from) && Number.isFinite(a.to)) ctx.setState({ range: { from: Math.floor(a.from), to: Math.ceil(a.to), live: false } }); },
      'wake.net.open': a => { const [n, name] = String(a.arg).split('/'); if (name) ctx.api.navigate(A('cluster', id, 'ns', n, 'services', name), { presentation: 'detail' }); },
    },
  };
});
