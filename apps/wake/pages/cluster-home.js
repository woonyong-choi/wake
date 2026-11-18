import { compareResources, compareHistory, compareIncidents } from '../data/table-order.js';
/*
 * 클러스터 본문 화면(시뮬레이션 design/sim/sim-views.js): 홈, 지표 화면, 인시던트 목록. GitOps·알림·네트워크·로그·리소스는 각자의 페이지.
 * 사이드바의 클러스터 구역과 경로 막대(클러스터 › 구역 › 이름)가 이 화면들 사이를 잇는다. 본문 안 알약 탭은 없다.
 * 홈(sim home): 머리(클러스터 · 출처 · 환경 · 보관) → 도구 칩 → 범위 검색 상자(scope-box.js: 리소스 이름 · 종류 · namespace · 기간) → 출처 끊김 줄 → 검색 결과 → 요약 막대
 *   → 인시던트 → 지표 막대 넷 + Pod 상태 흐름 → 문제 Pod → Unavailable 워크로드 → 경고 이벤트 → 최근 변경.
 * 범위(종류 · namespace)는 홈의 Kubernetes 카드(문제 Pod · Pod 흐름 · Unavailable · 경고 이벤트 · 변경 · 인시던트)를 좁히고, 지표 줄은 클러스터 값 그대로 줄 끝에 "클러스터 전체".
 * 인시던트 화면: 머리 → 범위 검색 상자(제목·번호·알림 · 대상의 종류 · namespace · 기간) → 결과 알약 → 열린 · 지난 인시던트.
 * 지표 화면(sim metricPage): 머리(Prometheus · 클러스터 · 보관) → 도구 줄(지표 고르기 | 기간) → 큰 그래프 → Node·namespace별 상위 5 → 변경 → 경고 이벤트.
 * 값의 출처가 끊기면 그 값은 지금 값으로 보이지 않는다(B4): 값 칸을 비우고 "<도구> 끊김"과 마지막 수집 시각.
 */
import { createHomeMonitoring } from './monitoring-parts.js';
import { readIdentity, retainRead, matchesReadTarget } from '../data/read-state.js';
import config, { scopeClusters, incidentAddress, viewAddress, CLUSTER_EXTRAS } from '../app.config.js';
import { bootPage, components as C, html, text, service, hasService, createLivePoll } from '../../../kit/page/index.js';
import { status, eventAddress, num, localTime } from './parts.js';
import { incidentsView, incidentRange, incidentsTable, when, axisTime } from './incident-parts.js';
import { stateMark as sourceMark } from './setup-parts.js';
import { clusterSearch } from './cluster-search.js';
import { scopeBox } from './scope-box.js';
import { sectionTabs, readRow } from './view-parts.js';
import { TOTAL_COUNT, inWindowText } from './events-view.js';
import { clusterPresentation } from '../data/live.js';
import { isProblem, KIND_OF, restartsColumn } from '../data/kinds.js';
import { METRIC_DEFS, metricDef, podFlow, workloadOf, warningSummary, changeMarks, CHANGE_LANES, agentState, windowOf, stepOf, rateDigits, ERR_DIGITS, HOUR, DAY } from '../data/home.js';
import { toolKind } from '../data/tool-kinds.js';
import { toolViews, read, rememberFound } from '../data/conn-view.js';
import { sourceOff } from '../data/index.js';

const A = (...p) => 'wake://' + p.map(encodeURIComponent).join('/');
const VIEWS = { cluster: 'home', incidents: 'incidents', metric: 'metric' };
const VIEW_ICON = { incidents: 'incident' };
/* 지표 막대 묶음의 열 폭(시뮬레이션 v-metrics): 이름, 지금 값, 읽기 셋 */
const METRIC_COLUMNS = ['calc(var(--space-16) * 1.9)', 'calc(var(--space-16) * 1.1)', 'calc(var(--space-16) * 3.4)', 'calc(var(--space-16) * 2.95)', 'calc(var(--space-16) * 2.55)'];
/* 기간 선택의 한도: Prometheus 기본 보관 15일(실제 보관 기간 읽기는 관문 2) */
const PLURAL_OF = { Deployment: 'deployments', StatefulSet: 'statefulsets', DaemonSet: 'daemonsets', Job: 'jobs', Pod: 'pods', ReplicaSet: 'replicasets' };
const LANES = CHANGE_LANES;
const HUE = { warn: '--warning', fail: '--destructive', busy: '--brand' };
/* 보이는 값은 판정과 어긋나지 않는다: 판정은 알림 규칙과 같은 원시값 비교(>)이고, 원시값이 임계값을 넘으면 보인 값도 임계값보다 크게 보이는 자리까지 늘린다
   (CPU 80.3%는 "80.3%"). 그 밖의 값은 늘 쓰는 자리: 5xx 비율은 늘 소수 둘째 자리(0.90% · 1.02% · 임계값 1.00%: 값이 임계값을 오가도 자릿수가 그대로, A2-11),
   초당 요청은 유효 숫자 둘(2.4/s · 0.53/s · 340/s), 나머지 정수 */
const digitsOf = (m, v) => { let d = m.id === 'err' ? ERR_DIGITS :m.unit === '/s' ? rateDigits(v) : 0; if (m.threshold != null && v > m.threshold) while (d < 6 && Number(v.toFixed(d)) <= m.threshold) d++; return d; };
/* 한 막대의 값 · 기간 최고 · 임계값은 같은 자릿수(A-27): 그 막대 값들 가운데 가장 많이 필요한 자릿수. 초당 요청은 가장 큰 값의 유효 숫자 둘(340/s 옆의 0.5/s가 340.00/s가 되지 않게) */
const rowDigits = (m, values) => { const v = values.filter(Number.isFinite);
  return m.unit === '/s' ? rateDigits(Math.max(0, ...v.map(Math.abs))) : Math.max(digitsOf(m, 0), ...v.map(x => digitsOf(m, x))); };
const fmt = (m, v, d = digitsOf(m, v)) => { if (v == null || !Number.isFinite(v)) return ''; return m.unit === '%' ? `${v.toFixed(d)}%` : `${d ? v.toFixed(d) : num(Math.round(v))}${m.unit}`; };

const SOURCE_REFRESH_MS = 15_000;
bootPage(config, ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  const view = VIEWS[ctx.route?.id] ?? 'home';
  let cluster = { id }, incidents = [], summary, agent = null, tools = [], sources = {}, pods = [], nodes = [], workloads = [], configmaps = [], events = [], eventsAt = null, seriesKey = '';
  /* 읽은 그대로(클러스터 전체): 그릴 때마다 범위로 좁힌 것이 위의 pods · workloads · configmaps · events · incidents */
  const raw = { pods: [], workloads: [], configmaps: [], events: [], incidents: [] };
  let sequence = 0, failures = {}, disposed = false, series = {}, seriesSeq = 0, sourceSequence = 0, sourcePoll = null, zoomFrom = null; /* zoomFrom: 그래프에서 창을 고르기 전의 지금 기간과 그 창 */
  const pending = new Set(['cluster', 'summary', 'pods', 'events', 'workloads', 'incidents', 'tools', 'sources', 'agent']);
  const forbidden = e => e?.status === 403 || /forbidden|403/i.test(String(e?.kind || e?.message || e));
  /* Kubernetes 출처 상태는 마지막 읽기를 따른다(B-08): 이 화면의 연결 확인·Pod·이벤트 읽기와 허브 출처 상태(hub.sources)의 시도 시각 중 마지막이 실패면 끊김.
     권한 거절은 클러스터가 답한 것이라 성공으로 센다 */
  let k8sOkAt = null, k8sFailAt = null;
  const K8S_READS = new Set(['cluster', 'pods', 'events']);
  const k8sSaw = (ok, at = Date.now()) => { if (!Number.isFinite(at)) return; if (ok) k8sOkAt = Math.max(k8sOkAt ?? at, at); else k8sFailAt = Math.max(k8sFailAt ?? at, at); };
  const search = clusterSearch(ctx, id);
  const box = ['home', 'incidents'].includes(view) ? scopeBox(ctx, id, view, { onRun: () => { st.inc.page = 1; }, alive: () => !disposed }) : null;
  /* 범위로 좁힘: 종류가 있으면 그 종류와 소유한 것(data/scope.js), 인시던트는 대상, 워크로드는 범위 Pod를 만든 것까지 */
  const narrow = () => {
    const r = box?.relation();
    if (!r?.on) { ({ pods, workloads, configmaps, events, incidents } = raw); return; }
    pods = raw.pods.filter(p => (r.kinds ? r.pod(p) : r.inNs(p.ns)));
    workloads = raw.workloads.filter(w => r.touches(w.kind, w.ns, w.name));
    configmaps = raw.configmaps.filter(c => r.has('ConfigMap', c.ns, c.name));
    events = Object.assign(raw.events.filter(e => r.has(e.object?.kind, e.object?.ns, e.object?.name)), { timeBasis: raw.events.timeBasis });
    incidents = raw.incidents.filter(i => (i.target ? r.touches(i.target.kind, i.target.ns, i.target.name) : !r.kinds && r.inNs(i.ns)));
  };
  const monitoring = createHomeMonitoring({ cluster: id, service, available: hasService, update: () => ctx.update() });
  const folded = {};
  const foldDeadline = performance.now() + 100;
  let incidentsReadyAt = Infinity;
  const readyAt = {};
  let seriesRead = Promise.resolve();
  /* 막대·카드의 열림(C안, 사용자 결정 2026-11-16): 사람이 누른 것이 먼저. 그 밖에는 화면을 처음 그릴 때 한 번만 값으로 정한다(known: 그 판단의 자료가 와 있음).
     처음 그린 뒤에 온 자료나 보는 동안 임계값을 넘은 값은 막대를 열지 않고 머리 표시(값의 위험색·상태)만 바꾼다: 막대가 저절로 열리고 닫히며 아래를 밀지 않는다 */
  const decided = {};
  let drawn = false;
  const isOpen = (key, fallback, known = true, availableAt = foldDeadline) => {
    if (key in folded) return folded[key] === false;
    if (!(key in decided) && known) decided[key] = !drawn && availableAt <= foldDeadline && !!fallback;
    return decided[key] ?? false;
  };
  /* 자료가 오기 전 값 자리: 최종과 같은 줄 높이의 회색 막대(kit skeleton). 숫자를 지어 넣지 않는다 */
  const SKEL = C.skeleton.render({ width: 'calc(var(--space-4) * 1.5)' });
  const skelIf = (wait, value) => (wait ? SKEL : value);

  /* 지금: 클러스터를 읽은 기준 시각 */
  const now = () => Date.parse(summary?.timeBasis?.referenceAt ?? '') || Date.parse(eventsAt ?? '') || Date.now();
  const range = () => windowOf(ctx.state().range, now());

  /* ---------- 읽기 ---------- */
  const stateRow = (state, retry = 'wake.home.retry') => C.settingsGroup.render({ role: 'status', children: [C.listRow.render({
    lead: C.statusIcon.render({ kind: state === 'loading' ? 'busy' : forbidden(state) ? 'perm' : 'error' }),
    title: t(state?.kind === 'timeout' ? 'wake.flow.c.timeout' : state === 'loading' ? 'wake.res.loading' : forbidden(state) ? 'wake.flow.c.forbidden' : 'wake.find.c.read'),
    end: state === 'loading' ? '' : C.button.render({ label: t('wake.flow.a.retry'), size: 'sm', variant: 'secondary', action: retry }) })] });
  /* 실제 클러스터의 지표: 관측 연결 묶음(observability.read)의 Node 그래프, 그리고 허브 질의 정의의 시리즈(metricSeries: 클러스터 안 Prometheus) */
  const currentSeries = result => !result.data || matchesReadTarget(result.data?.sourceState?.target ?? result.target, sources.prometheus)
    ? result : { state: 'loading', key: result.key };
  function loadSeries() {
    if (disposed || !['home', 'metric'].includes(view)) return;
    const { from, to } = range(), seq = ++seriesSeq, step = stepOf(from, to);
    const ids = view === 'home' ? METRIC_DEFS.map(m => m.series) : [metricDef(params.metric) ?? METRIC_DEFS[0]].flatMap(m => [m.series, m.bySeries]);
    const reads = ids.map(name => {
      const key = readIdentity(id, 'prometheus', name, ctx.state().range), target = sources.prometheus?.target;
      const had = retainRead(series[name]?.data ? series[name] : null, { before: series[name]?.key, after: key });
      series[name] = had ?? { state: 'loading', key };
      /* 출처가 답하지 않으면(시간 초과·끊김) 마지막으로 읽은 선을 지우지 않는다: 그 값과 시각을 남기고 머리에 "<출처> 끊김 · 마지막 수집"(U-01 S7, spec/rules.md#RULE-STATE) */
      return data.get('metricSeries', { cluster: id, series: name, from, to, step }).then(
        value => ({ state: 'ready', data: value, key, target }), e => {
          const source = e?.source ?? 'prometheus';
          const previous = retainRead(had, { before: had?.key, after: key, error: e, target: had?.data.sourceState?.target, sourceState: sources[source] });
          if (e?.kind === 'unconfigured') return { state: 'off', source };
          return previous ? { ...previous, stale: { source, error: e } } : { state: 'error', source, key, error: e };
        })
        .then(result => { if (seq !== seriesSeq || disposed) return; series[name] = { ...currentSeries(result), readyAt: performance.now() }; ctx.update(); });
    });
    void monitoring.load({ minutes: Math.round((to - from) / 60000) });
    return Promise.all(reads);
  }
  function ensureSeries() {
    const key = JSON.stringify([ctx.state().range ?? null, Math.floor(now() / 15000)]);
    if (['home', 'metric'].includes(view) && !['cluster', 'summary', 'sources'].some(name => pending.has(name)) && key !== seriesKey) {
      seriesKey = key; seriesRead = loadSeries();
    }
    return seriesRead;
  }
  async function refreshSources(refresh = false) {
    const seq = ++sourceSequence;
    try {
      const value = await data.get('sourceStates', { cluster: id, refresh });
      if (disposed || seq !== sourceSequence) return;
      const before = sources.prometheus?.target?.uid;
      sources = value || {}; delete failures.sources;
      const k8s = sources.kubernetes;
      if (Number.isFinite(k8s?.last)) k8sSaw(true, k8s.last);
      if (Number.isFinite(k8s?.at)) k8sSaw(k8s.state !== 'error', k8s.at);
      let invalidated = before !== sources.prometheus?.target?.uid;
      for (const [name, result] of Object.entries(series)) {
        series[name] = currentSeries(result);
        if (series[name] !== result) invalidated = true;
      }
      if (invalidated) { ++seriesSeq; seriesKey = ''; }
    } catch (error) {
      if (disposed || seq !== sourceSequence) return;
      sources = {}; failures.sources = error;
    }
    pending.delete('sources'); ensureSeries(); ctx.update();
  }
  const load = async (refresh = false) => {
    if (disposed) return;
    const seq = ++sequence;
    const reads = {
      cluster: [() => data.get('cluster', params), value => { cluster = value || { id }; }],
      summary: [() => data.get('summary', { cluster: id }), value => { summary = value; }],
      pods: [() => data.get('resources', { cluster: id, ns: '_all', kind: 'pods' }), value => { raw.pods = value || []; }],
      workloads: [() => Promise.all(['deployments', 'statefulsets', 'daemonsets', 'configmaps', 'nodes'].map(kind => data.get('resources', { cluster: id, ns: '_all', kind }).catch(() => [])))
        .then(([d, s, ds, cm, n]) => ({ workloads: [...d, ...s, ...ds].map(w => ({ ...w, kind: w.kind || 'Deployment' })), configmaps: cm, nodes: n })), value => { raw.workloads = value?.workloads || []; raw.configmaps = value?.configmaps || []; nodes = value?.nodes || []; }],
      events: [() => data.get('events', { cluster: id, ns: '_all' }), value => { raw.events = value || []; eventsAt = value?.timeBasis?.referenceAt ?? null; }],
      incidents: [() => data.get('incidents', { cluster: id }), value => { raw.incidents = value || []; incidentsReadyAt = performance.now(); }],
      tools: [() => data.get('clusterTools', { cluster: id, discovery: {}, refresh }), value => { tools = value || []; if (value) rememberFound(ctx.settings, ctx.api?.setSetting, id, read.ok(value)); }], /* 열거가 오면 찾기 확인 근거(wake.tools.found)에 반영: 열거를 못 읽는 동안에도 확인한 도구가 남음 */
      agent: [() => data.get('agent', { cluster: id }), value => { agent = value || {}; }],
    };
    for (const key of Object.keys(reads)) pending.add(key);
    const sourceRead = refreshSources(refresh);
    await Promise.all(Object.entries(reads).map(async ([key, [read, accept]]) => {
      try {
        const value = await read();
        if (seq !== sequence || disposed) return;
        delete failures[key]; accept(value);
        if (K8S_READS.has(key)) k8sSaw(key !== 'cluster' || value?.state !== 'off');
      } catch (error) {
        if (seq !== sequence || disposed) return;
        failures[key] = error; accept(undefined);
        if (K8S_READS.has(key)) k8sSaw(forbidden(error));
      }
      readyAt[key] ??= performance.now();
      pending.delete(key);
      ensureSeries();
      if (key === 'cluster') ctx.api.setMeta?.(pageMeta());
      ctx.update();
    }));
    await sourceRead;
  };

  /* ---------- 머리 ---------- */
  const clusterIcon = () => scopeClusters(ctx.settings()).find(c => c.id === id)?.icon || 'brand-kubernetes';
  const displayCluster = () => {
    const display = clusterPresentation({ ...cluster, id });
    if (display.name !== id) return display;
    const saved = (ctx.settings()['wake.clusters.list'] || []).find(c => c.id === id);
    return saved && (!cluster.server || saved.server === cluster.server) ? clusterPresentation(saved) : display;
  };
  const name = () => displayCluster().name;
  const viewTitle = () => (view === 'metric' ? t(`wake.metric.${metricDef(params.metric)?.id ?? 'cpu'}`) : t(`wake.view.${view}`));
  const pageMeta = () => ({ title: view === 'home' ? name() : viewTitle(), icon: view === 'home' ? clusterIcon() : VIEW_ICON[view] ?? 'chart-line', context: { icon: clusterIcon(), title: name(), sub: displayCluster().endpoint } });
  /* 홈·인시던트는 구역 알약 탭이 머리 끝(지표 화면은 구역이 아니라 탭 없음) */
  const header = ({ icon, title, sub }) => C.pageHeader.render({ icon, title, sub, size: 'home', ...(['home', 'incidents'].includes(view) ? { end: sectionTabs(t, view) } : {}) });
  /* 출처 칩: 에이전트 먼저, 그다음 클러스터 안에서 찾은 도구. 누르면 그 클러스터 본문의 에이전트·도구 화면(시뮬레이션 connChips, 연결 설정은 설정에 그대로)
     도구 칩의 상태는 아래 toolViews 하나: 출처 상태를 읽는 중이면 확인 중, 못 읽으면 끊김(확인 불가) */
  /* 지표 시리즈를 읽다 그 출처가 답하지 않은 동안(마지막 선만 남음) 그 출처 칩도 같은 관측으로 끊김: 칩과 값이 다른 말을 하지 않는다. 다음 성공 읽기에서 함께 풀림 */
  const seriesDown = kind => Object.values(series).filter(r => r?.stale?.source === kind || r?.state === 'error' && r.source === kind);
  /* 도구 상태 판단은 하나(conn-view toolViews): 열거(tools.find)·허브 출처 상태(hub.sources)의 읽기 결과(아직 · 실패 · 값)와 연결 근거로 포함 여부와 건강을 정함.
     홈 칩과 연결 카드, 도구 목록·상세, 위쪽 도구 메뉴, 설정 › 도구가 같은 함수, 같은 입력이면 같은 말 */
  const readState = (key, value) => (pending.has(key) ? read.unread() : failures[key] ? read.failed(failures[key]) : read.ok(value));
  const toolSet = () => toolViews({ cluster: id, settings: ctx.settings(), inventory: readState('tools', tools), hub: readState('sources', sources) });
  const toolChip = v => { const down = seriesDown(v.kind), seen = down.map(r => Number(r.data?.result[0]?.values?.at(-1)?.[0]) * 1000).filter(Number.isFinite);
    if (down.length) return { state: 'error', last: seen.length ? localTime(new Date(Math.max(...seen)).toISOString())?.slice(0, 16) ?? '' : '' };
    return { state: v.health, last: v.last ? localTime(v.last)?.slice(0, 16) ?? '' : '' }; };
  const agentInstalled = () => agent?.lookup === 'present' || agent?.installed === true;
  /* 연결한 것 목록 하나(머리 칩과 '연결' 카드가 같이 씀): 설치된 wake-agent와 연결 근거가 있는 도구 */
  const connections = () => [...(agentInstalled() ? [{ id: 'agent', name: 'wake-agent', icon: 'brand-kubernetes', state: agentState(agent), detail: agent?.version ? `v${agent.version}` : '',
    sub: [agent?.version ? `v${agent.version}` : '', agent?.lastSeen ? `heartbeat ${agent.lastSeen}` : ''].filter(Boolean).join(' · ') }] : []),
    ...toolSet().included.map(v => ({ id: v.kind, name: toolKind(v.kind).name, icon: toolKind(v.kind).icon, ...toolChip(v), detail: v.tool?.svc || '', sub: v.tool?.svc || '' }))];
  /* 구역 탭 밖의 클러스터 화면(B-01): 연결 칩 뒤에 같은 칩으로, 상태 없이. 설치된 에이전트는 이미 연결 칩이 있어 빠짐 */
  const screens = () => CLUSTER_EXTRAS.filter(([v]) => v !== 'agent' || !agentInstalled()).map(([v, label, ic]) => ({ id: v, name: t(label), icon: ic }));
  function chips() {
    /* 읽는 동안에도 연결 근거가 있는 칩(확인 중)은 그 자리에 둔다: 줄이 나중에 끼어 아래를 밀지 않음 */
    return C.sourceChips.render({ action: 'wake.home.source', items: connections(), screenAction: 'wake.home.screen', screens: screens() });
  }
  /* Kubernetes 값의 출처가 끊김(클러스터를 읽지 못함): 모든 값이 지금 값이 아님 */
  const k8sDown = () => !pending.has('cluster') && k8sFailAt !== null && (k8sOkAt === null || k8sFailAt > k8sOkAt);
  const downText = () => [t('wake.view.k8sDown'), k8sOkAt !== null ? `${t('wake.tool.lastOk')} ${when(k8sOkAt, Date.now())}` : ''].filter(Boolean).join(' · ');
  const staleLine = () => (k8sDown() ? C.staleLine.render({ kind: 'error', text: downText(), action: { label: t('wake.ci.settings'), action: 'kit.navigate', arg: { address: `wake://settings/cluster-${encodeURIComponent(id)}` } } }) : '');
  const rangeControl = () => C.timeRange.render({ id: 'home-range', value: ctx.state().range, action: 'kit.screen.range', fallback: '1h', now: Math.floor(now() / 1000), label: t('wake.view.range') });

  /* ---------- 지표 ---------- */
  /* 출처가 없는 그래프: 그 출처의 연결 안 됨 */
  const offChart = (title, source, height = 220) => C.chartCard.render({ title, widget: true, density: 'compact', state: { kind: 'unavailable', title: text(sourceOff(source)) }, chart: { kind: 'area', height, series: [] } });
  /* 허브 시리즈 그래프(질의 줄: 허브가 돌려준 질의 글, step, 구간). 시리즈가 여럿이면(상위 5) Node·namespace 이름으로 */
  const seriesName = metric => metric.nodename ?? metric.namespace ?? metric.ingress ?? metric.service ?? '';
  function hubChart(m, name, title, height = 220) {
    const r = series[name];
    if (!r || r.state === 'loading') return C.chartCard.render({ title, widget: true, density: 'compact', state: { kind: 'loading', title: t('wake.res.loading') }, chart: { kind: 'area', height, series: [] } });
    if (r.state === 'off') return offChart(title, r.source, height);
    if (r.state !== 'ready') return C.chartCard.render({ title, widget: true, density: 'compact', state: { kind: forbidden(r.error) ? 'permission' : 'error', title: t(forbidden(r.error) ? 'wake.view.toolPerm' : 'wake.view.toolDown', { tool: toolKind(r.source).name }), action: { label: t('wake.flow.a.retry'), action: 'wake.home.retry' } }, chart: { kind: 'area', height, series: [] } });
    const { from, to } = r.data.range, label = axisTime(from, to), many = r.data.result.length > 1;
    const lines = r.data.result.map((x, i) => ({ key: seriesName(x.metric) || String(i), name: many ? seriesName(x.metric) : title, ...(many ? C.chartCard.seriesAppearance(i) : { color: m.color, dash: 'none', pattern: 'solid' }),
      observations: x.values.map(([at, v], j) => ({ at, value: Number(v), label: label(at * 1000), joinPrevious: j > 0 })).filter(o => Number.isFinite(o.value)) }));
    return C.chartCard.render({ title, hideTitle: true, value: '', widget: true, density: 'compact', ...(many ? { legend: lines.map(l => ({ label: l.name, color: l.color })) } : {}),
      info: { title: t('wake.metric.query'), rows: [{ label: 'step', value: `${r.data.step}s` }, { label: t('wake.view.range'), value: `${when(from, 0)} – ${when(to, 0)}` }], code: { lang: 'promql', text: r.data.query } },
      chart: { kind: 'area', height, bleed: true, fade: true, reading: true, axes: true, unit: m.unit, series: lines, timeAxis: { from: from / 1000, to: to / 1000, maxGapSeconds: r.data.step * 1.5 }, id: `home:${name}`, rangeAction: 'wake.home.zoom', interactive: 'full' } });
  }
  /* 지금 값: 허브 시리즈의 마지막 점(그래프가 그리는 선의 마지막 값과 같은 질의·같은 점) */
  const lastOf = name => { const v = series[name]?.state === 'ready' ? Number(series[name].data.result[0]?.values?.at(-1)?.[1]) : NaN; return Number.isFinite(v) ? v : null; };
  /* 막대 그래프는 시뮬레이션처럼 클러스터 선 하나(허브 시리즈). 허브 시리즈의 출처가 연결되지 않았을 때(off)만 CPU·메모리는 관측 연결 묶음(observability.read)의 Node 그래프.
     높이는 시뮬레이션과 같은 220(kit이 폭에 맞춰 --chart-h-min과 --chart-h-max 사이로 정함) */
  const HEIGHT = 220;
  const hubReady = m => series[m.series]?.state === 'ready';
  const realChart = (m, title) => (series[m.series]?.state === 'off' && ['cpu', 'mem'].includes(m.id) ? monitoring.overview({ t, height: HEIGHT, metric: m.id === 'cpu' ? 'cpu' : 'memory' }) : null)
    || hubChart(m, m.series, title, HEIGHT);
  function metricBar(m, { open, page = false } = {}) {
    const title = t(`wake.metric.${m.id}`);
    /* 머리 값은 그래프와 같은 기준: 허브 시리즈가 있으면 그 선의 마지막 점, 없을 때만 metrics-server 지금 사용량(그때 그래프는 Node 그래프이고 캡션이 "기간 최고") */
    const r = series[m.series], stale = hubReady(m) ? r.stale : r?.state === 'error' ? { source: r.source, error: r.error } : null;
    /* metrics-server 지금 사용량은 지표 출처가 연결되지 않았을 때(off)만: 출처가 답하지 않는 동안 다른 출처의 값으로 칸을 채우지 않는다 */
    const nowValue = stale ? null : hubReady(m) ? lastOf(m.series) : r?.state === 'off' ? (m.id === 'cpu' ? summary?.usage?.cpu : m.id === 'mem' ? summary?.usage?.memory : null) : null;
    const bad = nowValue != null && m.threshold != null && nowValue > m.threshold; /* 알림 규칙 식과 같은 비교(Prometheus 규칙은 '>'): 임계값과 같으면 넘지 않음 */
    /* 같은 대상의 후속 실패에서는 마지막 성공값과 선을 성공 시각과 함께 남긴다. */
    const lastAt = stale && r.data ? Number(r.data.result[0]?.values?.at(-1)?.[0]) * 1000 : NaN;
    /* 시뮬레이션 metricBar의 끊긴 출처와 같은 말("<도구> 끊김", "마지막 수집 HH:MM")을 칸 둘에 나눠 둔다: 칸 폭이 고정이라 한 칸에 이으면 시각이 말줄임에 가려진다.
       상태 칸은 넘치면 말줄임 + 전체 글 툴팁, 시각은 다음 칸의 흐린 글 */
    /* 지난 구간이면 판정도 그 구간 끝의 값이다: 그 구간을 아래 lastItem의 흐린 글로 보인다 */
    const span = !stale && hubReady(m) && ctx.state().range?.live === false ? r.data.result[0]?.values : null;
    const spanText = span?.length ? t('wake.overview.collected', { from: when(Number(span[0][0]) * 1000, now()), to: when(Number(span.at(-1)[0]) * 1000, now()) }) : '';
    /* 닫힌 막대의 읽기 칸(H-009 수정 1회차): 펼친 그래프와 같은 시리즈의 기간 최고와 임계값, 이름-값 칸(Pod 상태 흐름의 "문제 0"과 같은 칸). 정상 체크 아이콘 하나만 두지 않는다.
       넘음 상태는 한 번만(RULE-TONE): 넘으면 임계값 칸 자리에 "임계값 … 넘음" 하나. 임계값이 없는 막대(초당 요청)는 최고만 */
    const points = !stale && hubReady(m) ? (r.data.result[0]?.values ?? []).map(([, v]) => Number(v)).filter(Number.isFinite) : [];
    const peak = points.length ? Math.max(...points) : null, preset = ctx.state().range?.preset;
    const lastValue = stale && r.data ? Number(r.data.result[0]?.values?.at(-1)?.[1]) : NaN, d = rowDigits(m, [nowValue, peak, lastValue]);
    const peakItem = peak == null ? [] : [{ id: 'p', label: preset ? t('wake.metric.rangePeak', { range: t(`timeRange.preset.${preset}`) }) : t('wake.metric.top'), value: fmt(m, peak, d), priority: 1 }];
    const stateItem = stale ? { id: 's', label: '', value: C.statusIcon.render({ kind: 'error', text: t('wake.view.toolDown', { tool: toolKind(stale.source).name }), reveal: true }), shrink: true, priority: 9 }
      : nowValue == null || m.threshold == null ? null : bad ? { id: 's', label: '', value: C.statusIcon.render({ kind: 'error', text: t('wake.metric.over', { v: fmt(m, m.threshold, d) }) }) }
      : { id: 's', label: t('wake.metric.threshold'), value: fmt(m, m.threshold, d), priority: 2 }; /* 임계값은 판정을 담으므로 기간 최고보다 늦게 접힘(A3-04) */
    /* 끊긴 동안 값 칸은 마지막 성공 값 그대로(그 시각은 옆 상태 칸 "마지막 수집 HH:MM"). 값 칸에 글을 덧붙이지 않는다: 칸 폭이 고정이라 넘친 글이 다음 칸에 겹친다 */
    const valueItem = stale ? (Number.isFinite(lastValue) ? [{ id: 'v', label: '', value: fmt(m, lastValue, d) }] : [])
      : [{ id: 'v', label: '', value: fmt(m, nowValue, d), priority: 3, ...(bad ? { tone: 'danger' } : {}) }];
    /* 지난 구간을 보는 동안(그래프 끌기·사용자 지정 기간, live 아님): 머리 값과 판정은 그 구간 끝의 값이다. 그 구간을 같은 자리에 흐린 글로 둔다("수집 02:40–03:10"),
       지금 구간으로 돌아오면 사라진다 */
    const lastItem = stale && Number.isFinite(lastAt) ? [{ id: 'l', label: '', value: '', meta: t('wake.view.lastCollected', { at: when(lastAt, now()) }) }]
      : spanText ? [{ id: 'l', label: '', value: '', meta: spanText }] : [];
    /* 칸: 이름 | 값 | 기간 최고 | 임계값(범위가 있어도 같은 칸: 클러스터 값이라는 말은 지표 묶음 위에 한 번, box.clusterNote) */
    const items = [{ id: 't', label: '', value: title }, ...valueItem, ...(stale ? [] : peakItem), ...(stateItem ? [stateItem] : []), ...lastItem];
    const body = html`${stale && r.data ? readRow(t, forbidden(stale.error) ? 'forbidden' : 'error', 'wake.home.retry', t(forbidden(stale.error) ? 'wake.view.toolPerm' : 'wake.view.toolDown', { tool: toolKind(stale.source).name })) : ''}${realChart(m, title)}${page ? '' : C.button.render({ label: t('wake.metric.page'), icon: 'arrow-up-right', variant: 'link', action: 'kit.navigate', arg: { address: viewAddress(id, 'metric', m.id) } })}`;
    const known = !!r && r.state !== 'loading';
    const shown = known ? items : [items[0], { id: 'v', label: '', value: SKEL }];
    return { label: title, open: open ?? isOpen('m-' + m.id, bad, known, r?.readyAt), toggle: { action: 'wake.home.card', arg: 'm-' + m.id }, items: shown, body };
  }

  /* ---------- 홈 카드 ---------- */
  /* RULE-FOLD: 카드마다 판단 근거 자료가 처음 도착한 시각으로 최초 펼침을 정한다(늦게 그려져도 마감 뒤 자료는 펼치지 않음) */
  const CARD_SOURCE = { 'h-bad': 'pods', 'h-flow': 'pods', 'h-un': 'workloads', 'h-ev': 'events', 'h-conn': 'tools' };
  const cardReadyAt = key => key === 'h-inc' ? incidentsReadyAt : CARD_SOURCE[key] ? readyAt[CARD_SOURCE[key]] ?? Infinity : foldDeadline;
  const cardProps = (key, label, items, body, fallback, known = true) => ({ label, open: isOpen(key, fallback, known, cardReadyAt(key)), toggle: { action: 'wake.home.card', arg: key }, items: [{ id: 't', label: '', value: label }, ...items.filter(item => item.value != null)], body });
  const card = (...a) => C.summaryBar.render(cardProps(...a));
  const empty = key => C.emptyState.render({ title: t(key), variant: 'line' });
  const link = (key, address) => C.button.render({ label: t(key), icon: 'arrow-up-right', variant: 'link', action: 'kit.navigate', arg: { address } });
  const list = (plural, q = '') => A('cluster', id, 'ns', '_all', plural) + q;
  const warnings = () => warningSummary(events, { from: now() - HOUR, to: now() });
  /* 범위로 좁히는 묶음(Pod · 이벤트 · 워크로드 · 인시던트): 종류 관계를 읽는 동안은 뼈대, 읽지 못했으면 그 실패와 원인(RULE-STATE). 0으로 채우지 않는다. Node·지표는 클러스터 전체라 그대로 */
  const SCOPED = new Set(['pods', 'events', 'workloads', 'incidents']);
  const waiting = key => pending.has(key) || (SCOPED.has(key) && !!box?.wait());
  const failed = key => failures[key] || (SCOPED.has(key) ? box?.failure() ?? null : null);
  const snapshotState = key => (failed(key) ? stateRow(failed(key)) : waiting(key) ? stateRow('loading') : null);
  /* 머리 칸의 값: 읽는 중이면 뼈대, 못 읽었으면 칸 없음(cardProps가 뺌) */
  const shown = (keys, value) => ([keys].flat().some(failed) ? null : skelIf([keys].flat().some(waiting), value));
  function summaryBar() {
    const nodes = summary?.nodes, bad = pods.filter(isProblem).length, ev = warnings(), open = incidents.filter(i => !i.result).sort(compareIncidents);
    if (failures.summary && failed('pods')) return snapshotState('summary');
    const old = k8sDown() ? { meta: t('wake.view.snapshot') } : {};
    /* 읽는 동안: 같은 막대에 이름과 값 자리 뼈대(완성과 같은 줄, 같은 높이) */
    if (pending.has('summary') && waiting('pods')) return C.summaryBar.render({ label: t('wake.home.summary'), items: [{ id: 'n', label: 'Node', value: SKEL, icon: 'k8s-node' }, { id: 'p', label: t('wake.home.badPods'), value: SKEL, icon: 'k8s-pod' }, { id: 'e', label: t('wake.view.warnEvents'), value: SKEL, icon: 'k8s-event' }, { id: 'i', label: t('wake.home.openIncidents'), value: SKEL, icon: 'incident' }] });
    return C.summaryBar.render({ label: t('wake.home.summary'), items: [
      ...(nodes ? [{ id: 'n', label: 'Node', value: num(nodes.total), icon: 'k8s-node', ...old, action: 'kit.navigate', arg: { address: list('nodes') } }, ...(nodes.notReady ? [{ id: 'nr', label: 'NotReady', value: num(nodes.notReady), tone: 'warn', action: 'kit.navigate', arg: { address: list('nodes', '?filter=bad') } }] : [])] : []),
      ...(failed('pods') ? [] : [{ id: 'p', label: t('wake.home.badPods'), value: skelIf(waiting('pods'), num(bad)), icon: 'k8s-pod', ...(bad && !old.meta && !waiting('pods') ? { tone: 'danger' } : {}), ...old, action: 'kit.navigate', arg: { address: list('pods', '?filter=bad') } }]),
      ...(failed('events') ? [] : [{ id: 'e', label: t('wake.view.warnEvents'), value: skelIf(waiting('events'), num(ev.objects)), icon: 'k8s-event', ...(ev.objects && !old.meta && !waiting('events') ? { tone: 'warn' } : {}), meta: old.meta ?? t('wake.view.lastHour'), action: 'kit.navigate', arg: { address: list('events', '?type=Warning') } }]),
      ...(failed('incidents') ? [] : [{ id: 'i', label: t('wake.home.openIncidents'), value: skelIf(waiting('incidents'), num(open.length)), icon: 'incident', ...(open.length && !waiting('incidents') ? { tone: 'danger' } : {}), action: 'kit.navigate', arg: { address: viewAddress(id, 'incidents') } }]),
    ] });
  }
  /* 인시던트 저장소를 읽지 못함: 그 출처의 연결 안 됨(관문 2 전에는 늘), 그 밖의 실패는 읽기 실패 */
  const incidentState = () => (waiting('incidents') ? stateRow('loading')
    : failed('incidents')?.kind === 'unconfigured' ? C.emptyState.render({ title: text(sourceOff(failed('incidents').source)), variant: 'line' })
    : failed('incidents') ? stateRow(failed('incidents')) : null);
  const incidentStateItem = () => (failed('incidents')?.kind === 'unconfigured' ? [{ id: 's', label: '', value: C.statusIcon.render({ kind: 'idle', text: text(sourceOff(failed('incidents').source)) }) }] : []);
  function incidentCard() {
    if (waiting('incidents')) return card('h-inc', t('wake.home.incidents'), [{ id: 'n', label: t('wake.view.open'), value: SKEL }, { id: 'l', label: t('wake.view.last30d'), value: SKEL }], incidentState(), false, false);
    if (incidentState()) return card('h-inc', t('wake.home.incidents'), incidentStateItem(), incidentState(), false);
    const open = incidents.filter(i => !i.result).sort(compareIncidents), month = incidents.filter(i => i.at >= now() - 30 * DAY).length;
    const rows = open.length ? C.rowList.render({ rows: open.map(r => ({ id: r.id, lead: C.statusIcon.render({ kind: 'error', attention: true }), title: `${r.number} ${r.title}`,
      sub: [r.alert, r.sev, r.ns, t('wake.inc.list.createdAt', { at: when(r.at, now()) })].filter(Boolean).join(' · '), meta: t(`wake.inc.phase.${r.phase}`), action: 'wake.home.incident', arg: r.id })) }) : empty('wake.inc.list.noOpen');
    return card('h-inc', t('wake.home.incidents'), [{ id: 'n', label: t('wake.view.open'), value: num(open.length), ...(open.length ? { tone: 'danger' } : {}) }, { id: 'l', label: t('wake.view.last30d'), value: num(month) }],
      html`${rows}${link('wake.view.incidentList', viewAddress(id, 'incidents'))}`, open.length > 0); /* 열린 인시던트가 없으면 접힘(RULE-FOLD, A3-12) */
  }
  /* Pod 상태 흐름: 시뮬레이션 홈과 같은 샌키(받아들인 규칙, spec/rules.md#RULE-SANKEY). 막대·글자 색은 상태만, 인시던트 표시 없음 */
  function flowCard() {
    const flow = podFlow(pods), bad = pods.filter(isProblem).length, pending1 = pods.filter(p => p.status?.[1] === 'Pending').length;
    const restarts = pods.reduce((a, p) => a + (p.restarts ?? 0), 0);
    const g = { mode: 'relation', visual: 'filledOutline', stack: true, stretch: true, fade: true, live: true, label: t('wake.view.podState'), gid: 'flg-home-pods', width: 920, height: 460, columns: [0, 380, 804], bar: 56,
      stateLabels: { ok: 'Ready', warn: 'NotReady', fail: t('wake.view.podFailing'), idle: 'Completed' }, fold: { label: t('wake.view.foldOther'), more: t('wake.view.foldMore') },
      summary: { 0: { label: t('wake.view.otherNs'), icon: 'k8s-namespace', action: 'kit.navigate', arg: { address: list('pods') } }, 1: { label: t('wake.view.otherWl'), icon: 'k8s-deployment', action: 'kit.navigate', arg: { address: list('deployments') } }, 2: { label: t('wake.view.otherRunning'), icon: 'circle-check', action: 'kit.navigate', arg: { address: list('pods') } } },
      nodes: flow.nodes.map((n, i) => ({ id: n.id, col: n.col, y: i, h: 0, label: n.label, value: num(n.value), icon: n.col === 0 ? 'k8s-namespace' : n.col === 1 ? KIND_OF[PLURAL_OF[n.kind]]?.icon ?? 'k8s-pod' : n.state === 'ok' ? 'circle-check' : n.state === 'idle' ? 'check' : 'exclamation-triangle',
        state: n.state, ...(HUE[n.state] ? { hue: HUE[n.state] } : n.state === 'idle' ? {} : { tone: n.col === 0 ? 'soc' : 'other' }),
        ...(n.col === 1 && n.state !== 'ok' ? { reasons: reasonsOf(n) } : {}),
        action: 'kit.navigate', arg: { address: n.col === 0 ? A('cluster', id, 'ns', n.ns, 'pods') : n.col === 1 && PLURAL_OF[n.kind] && n.kind !== 'Pod' ? A('cluster', id, 'ns', n.ns, PLURAL_OF[n.kind], n.name) : list('pods', n.state === 'ok' ? '' : '?filter=bad') } })),
      links: flow.links.map(l => ({ from: l.from, to: l.to, fromOffset: 0, toOffset: 0, size: l.value, amount: l.value, value: num(l.value), state: l.state })) };
    const old = k8sDown(), wait = waiting('pods');
    return cardProps('h-flow', t('wake.view.podFlow'), [{ id: 'a', label: '', value: shown('pods', num(pods.length)) }, { id: 'b', label: t('wake.view.bad'), value: shown('pods', num(bad)), ...(bad ? { tone: 'danger' } : {}) }, { id: 'p', label: 'Pending', value: shown('pods', num(pending1)) }, { id: 'r', label: 'Restarts', value: shown('pods', num(restarts)) },
      ...(wait ? [] : [old ? { id: 's', label: '', value: C.statusIcon.render({ kind: 'error', text: t('wake.view.k8sDown') }) } : { id: 's', label: '', value: bad ? C.statusIcon.render({ kind: 'warn', text: t('wake.view.badPodsN', { n: num(bad) }) }) : C.statusIcon.render({ kind: 'ok', label: t('wake.view.ok') }) }])],
    snapshotState('pods') || C.flowGraph.render(g), false);
  }
  const reasonsOf = n => { const by = new Map(); for (const p of pods.filter(p => p.ns === n.ns && isProblem(p))) { if (workloadOf(p).name === n.name) by.set(p.status[1], (by.get(p.status[1]) ?? 0) + 1); } return [...by].map(([label, count]) => ({ label, count })); };
  function badPodsCard() {
    const bad = pods.filter(isProblem).sort(compareResources), old = k8sDown();
    const reasons = ['CrashLoopBackOff', 'Pending', 'ContainerCreating', 'Evicted'].map(k => ({ id: k, label: k, value: num(bad.filter(p => p.status[1] === k).length) })).filter(x => x.value !== '0');
    const table = C.dataTable.render({ clip: true, rowKey: 'id', rows: bad.slice(0, 8).map(p => ({ ...p, id: `${p.ns}/${p.name}` })), rowAction: 'wake.home.pod', reveal: true, columns: [
      { id: 'name', label: 'Name', lead: () => ({ icon: 'k8s-pod' }) }, { id: 'ns', label: 'Namespace', muted: true, optional: true, width: 'calc(var(--space-16) * 1.6)' },
      { id: 'status', label: 'Status', width: 'calc(var(--space-40) * 1.7)', fit: true, cell: r => status(r.status) }, restartsColumn({ optional: true, width: 'var(--space-16)' })] });
    const wait = waiting('pods');
    return card('h-bad', t('wake.home.badPods'), [{ id: 'n', label: '', value: shown('pods', num(bad.length)), ...(bad.length && !old ? { tone: 'danger' } : {}) }, ...reasons],
      snapshotState('pods') || (bad.length ? html`${table}${link('wake.view.badPodList', list('pods', '?filter=bad'))}` : empty('wake.home.noBadPods')), !!bad.length, !wait);
  }
  function unavailableCard() {
    const rows = workloads.filter(w => w.status?.[0] !== 'ok').sort(compareResources);
    const wait = waiting('workloads');
    return card('h-un', t('wake.view.unavailable'), [{ id: 'n', label: '', value: shown('workloads', num(rows.length)) }],
      snapshotState('workloads') || (rows.length ? C.dataTable.render({ clip: true, rowKey: 'id', rows: rows.map(w => ({ ...w, id: `${PLURAL_OF[w.kind]}/${w.ns}/${w.name}` })), rowAction: 'wake.home.workload', reveal: true, columns: [
        { id: 'name', label: 'Name', lead: r => ({ icon: KIND_OF[PLURAL_OF[r.kind]]?.icon }) }, { id: 'kind', label: 'Kind', muted: true, optional: true, width: 'calc(var(--space-16) * 1.6)' },
        { id: 'status', label: 'Status', width: 'calc(var(--space-16) * 2.5)', fit: true, cell: r => status(r.status) }] }) : empty('wake.view.allAvailable')), !!rows.length, !wait);
  }
  function eventsCard({ from, to, key = 'h-ev' } = {}) {
    const ev = warningSummary(events, { from: from ?? now() - HOUR, to: to ?? now() });
    const top = ev.byReason.slice(0, 2).map(r => `${r.reason} ${inWindowText(r.n, r.atLeast)}`).join(' · ');
    const table = C.dataTable.render({ clip: true, rowKey: 'key', rows: ev.rows.slice(0, 6), rowAction: 'wake.home.event', reveal: true, columns: [
      { id: 'last', label: 'Last Seen', time: true, width: 'calc(var(--space-16) * 2)', cell: r => when(r.last, now()) },
      { id: 'reason', label: 'Reason', width: 'calc(var(--space-16) * 2.4)', fit: true, cell: r => C.statusIcon.render({ kind: 'warn', text: r.reason }) },
      /* 이벤트 화면과 같은 접기(R4-03): 대상·Count는 남고 Message가 먼저 접힌다, 대상 이름은 가운데를 줄여 끝을 남긴다 */
      { id: 'obj', label: 'Object', trim: 'middle', cell: r => `${r.kind}/${r.name}` },
      { id: 'count', label: TOTAL_COUNT, value: true, width: 'var(--space-16)', cell: r => num(r.count) },
      { id: 'message', label: 'Message', muted: true, optional: 1 }] });
    const wait = waiting('events');
    return card(key, t('wake.view.warnEvents'), [{ id: 'w', label: 'Warning', value: shown('events', num(ev.objects)), ...(ev.objects ? { tone: 'warn' } : {}) }, ...(top ? [{ id: 'r', label: 'Reason', value: top, priority: 2 }] : []), { id: 'o', label: t('wake.view.occurrences'), value: shown('events', inWindowText(ev.inWindow, ev.atLeast)), priority: 1 }],
      snapshotState('events') || (ev.rows.length ? html`${table}${link('wake.view.eventList', list('events', '?type=Warning'))}` : empty('wake.home.noWarningEvents')), !!ev.rows.length, !wait);
  }
  const homeMarks = (from, to) => changeMarks({ events, configmaps, workloads }, { from, to });
  function changesCard() {
    const to = now(), from = to - 3 * DAY, marks = homeMarks(from, to), s = ms => Math.floor(ms / 1000), win = folded.tl ?? { from: s(from), to: s(to) + 60 };
    const lanes = LANES.filter(([l]) => l !== 'symptom');
    const body = C.changeTimeline.render({ label: t('wake.inc.time.changes'), from: win.from, to: win.to, now: s(to), home: { from: s(from), to: s(to) + 60 }, zoomAction: 'wake.home.tl', selectAction: 'wake.home.change',
      lanes: LANES.map(([lane, icon]) => ({ id: lane, label: t(`wake.inc.lane.${lane}`), icon })),
      marks: marks.map(c => ({ id: c.id, lane: c.lane, at: s(c.at), tone: c.tone, tip: { time: when(c.at, to), kind: c.kind, title: c.title, text: c.text } })) });
    const wait = ['events', 'workloads'].some(k => pending.has(k));
    return card('h-ch', t('wake.view.recentChanges'), [{ id: 'n', label: t('wake.view.d3'), value: shown(['events', 'workloads'], num(marks.filter(c => c.lane !== 'symptom').length)) }, ...lanes.map(([lane]) => ({ id: 'l-' + lane, label: t(`wake.inc.lane.${lane}`), value: shown(['events', 'workloads'], num(marks.filter(c => c.lane === lane).length)) }))], body, false);
  }
  /* 연결: 에이전트와 도구마다 한 줄(상태 · 주소), 누르면 그 클러스터의 에이전트·도구 화면 */
  /* 연결: 연결한 것만 한 줄씩(머리 칩과 같은 목록), 상태는 허브. 연결한 것이 없으면 줄 없이 설정 › 도구로 가는 링크 하나 */
  function connCard() {
    const rows = connections(), list = rows.filter(x => x.id !== 'agent'), agentRow = rows.find(x => x.id === 'agent');
    /* 도구 열거를 읽지 못함: 연결한 것이 0개라는 뜻이 아니므로 그 실패와 다시 시도(연결 기록이 있는 도구 줄은 함께 남음) */
    const listFailed = toolSet().inventory === 'failed' ? stateRow(failures.tools) : '';
    if (!rows.length) return card('h-conn', t('wake.view.conn'), [], listFailed || link('wake.tools.manage', 'wake://settings/tools'), !!listFailed, !pending.has('tools'));
    const off = list.filter(x => x.state !== 'ok');
    return card('h-conn', t('wake.view.conn'), [...(agentRow ? [{ id: 'a', label: t('wake.home.agent'), value: stateMark(agentRow.state) }] : []), ...(list.length ? [{ id: 'b', label: t('wake.home.tools'), value: C.iconStack.render({ items: list.map(x => ({ id: x.id, name: x.name, brand: x.icon })), max: 9, size: 'sm', label: t('wake.view.conn') }) }] : []), ...(off.length ? [{ id: 'c', label: t('wake.view.connOff'), value: num(off.length), tone: 'warn' }] : [])],
      html`${C.rowList.render({ rows: rows.map(x => ({ id: x.id, icon: x.icon, title: x.name, sub: x.sub, end: stateMark(x.state), action: 'wake.home.source', arg: x.id })) })}${listFailed}`, !!listFailed);
  }
  const stateMark = state => sourceMark(t, state);
  /* 과거 인시던트: 지난 30일 수, 재발(같은 알림이 둘 이상), 표 */
  function pastCard() {
    if (waiting('incidents')) return card('h-past', t('wake.inc.list.past'), [{ id: 'n', label: t('wake.view.last30d'), value: SKEL }, { id: 'r', label: t('wake.view.repeats'), value: SKEL }], incidentState(), false);
    if (incidentState()) return card('h-past', t('wake.inc.list.past'), incidentStateItem(), incidentState(), false);
    const past = incidents.filter(i => i.result).sort(compareHistory), month = past.filter(i => i.at >= now() - 30 * DAY), by = new Map();
    for (const i of past) by.set(i.alert, (by.get(i.alert) ?? 0) + 1);
    return card('h-past', t('wake.inc.list.past'), [{ id: 'n', label: t('wake.view.last30d'), value: num(month.length) }, { id: 'r', label: t('wake.view.repeats'), value: num([...by.values()].filter(v => v > 1).length) }],
      html`${incidentsTable({ t, rows: past.slice(0, 6), action: 'wake.home.incident' })}${link('wake.view.incidentList', viewAddress(id, 'incidents'))}`, false);
  }
  function home() {
    const d = displayCluster(), version = summary?.version || cluster.version;
    return html`
      ${header({ icon: clusterIcon(), title: d.name, sub: [version ? `Kubernetes ${version}` : '', [cluster.kind && cluster.kind !== 'kubernetes' ? cluster.kind : '', summary?.namespaces != null ? `namespace ${num(summary.namespaces)}` : '', raw.pods.length ? `Pod ${num(raw.pods.length)}` : ''].filter(Boolean).join(' · ')] })}
      ${chips()}
      ${box.render({ range: rangeControl() })}
      ${staleLine()}
      ${search.results({ q: box.text(), kinds: box.kinds() ?? undefined, inNs: box.relation().inNs })}
      ${summaryBar()}
      ${incidentCard()}
      ${C.summaryBar.metrics([box.clusterNote(), ...METRIC_DEFS.map(m => metricBar(m))], { columns: METRIC_COLUMNS })}
      ${C.summaryBar.metrics([flowCard(), badPodsCard(), unavailableCard(), eventsCard(), changesCard(), connCard(), pastCard()], { columns: [METRIC_COLUMNS[0]] })}`; /* A-22: the cards under the metrics start their first column where the metric bars do. A3-05: "클러스터 전체 값" 말은 지표 넷의 묶음 안 첫 줄, 범위를 따르는 카드(Pod 흐름부터)는 다음 묶음 */
  }
  function metricPage() {
    const m = metricDef(params.metric) ?? METRIC_DEFS[0], title = t(`wake.metric.${m.id}`), { from, to } = range();
    const byTitle = t(m.by === 'node' ? 'wake.metric.byNode' : 'wake.metric.byNs');
    const marks = homeMarks(from, to).filter(c => c.lane !== 'symptom').sort((a, b) => b.at - a.at).slice(0, 8);
    const changes = marks.length ? C.rowList.render({ rows: marks.map(c => ({ id: c.id, icon: LANES.find(([l]) => l === c.lane)?.[1], title: `${c.kind} ${c.title}`, sub: c.text, end: when(c.at, now()), action: 'wake.home.change', arg: c.id })) }) : empty('wake.view.noChanges');
    const big = metricBar(m, { open: isOpen('mp-v', true), page: true });
    return html`
      ${header({ icon: 'chart-line', title, sub: ['Prometheus', name()] })}
      ${staleLine()}
      ${C.listToolbar.render({ filters: C.pillTabs.render({ id: 'wake-metric', label: t('wake.view.metric'), value: m.id, tabs: METRIC_DEFS.map(x => ({ id: x.id, label: t(`wake.metric.${x.id}`) })), action: 'wake.home.metric' }), time: rangeControl() })}
      ${C.summaryBar.render({ ...big, toggle: { action: 'wake.home.card', arg: 'mp-v' } })}
      ${card('mp-by', byTitle, [], hubChart(m, m.bySeries, byTitle), true)}
      ${card('mp-ch', t('wake.view.changes'), [{ id: 'n', label: '', value: num(marks.length) }], changes, true)}
      ${eventsCard({ from, to, key: 'mp-ev' })}`;
  }

  /* ---------- 인시던트 화면 ---------- */
  const st = { inc: { result: 'all', page: 1, range: { preset: '7d' } }, incFolded: {} };
  const incidentsBody = () => {
    if (pending.has('incidents')) return stateRow('loading');
    if (failures.incidents?.kind === 'unconfigured') return C.emptyState.render({ icon: 'incident', plainIcon: true, title: text(sourceOff(failures.incidents.source)) });
    if (failures.incidents) return C.emptyState.render({ icon: 'incident', plainIcon: true, title: t('wake.home.incidentsFailed') });
    if (box.wait()) return stateRow('loading');
    if (box.failure()) return stateRow(box.failure());
    return incidentsView({ t, list: incidents, st: { ...st.inc, q: box.q() }, folded: { open: !isOpen('inc-open', true, true, incidentsReadyAt), past: !isOpen('inc-past', true, true, incidentsReadyAt), ...st.incFolded }, now: now(),
      actions: { result: 'wake.inc.result', page: 'wake.inc.page', open: 'wake.home.incident', card: 'wake.inc.card' } });
  };
  const sectionHeader = () => header({ icon: VIEW_ICON[view], title: viewTitle(), sub: [config.name, name(), t('wake.inc.list.retention', { n: 90 })] });
  const body = () => {
    /* 기간이 바뀌면(사람, 그래프 끌기, AI) 그 구간을 다시 읽음 */
    ensureSeries();
    narrow();
    if (view === 'home') return home();
    if (view === 'metric') return metricPage();
    return html`${sectionHeader()}${box.render({ range: incidentRange({ st: st.inc, now: now(), action: 'wake.inc.range' }) })}${staleLine()}${incidentsBody()}`;
  };

  let started = false;
  return {
    screen: { state: { range: { preset: '1h' } }, range: { key: 'range' } },
    init: async () => {
      if (started) return;
      started = true;
      /* 다른 화면의 "다른 종류에서 N건"이 연 홈(?q=): 그 이름이 홈의 글 */
      if (box && view === 'home' && typeof ctx.query.q === 'string' && ctx.query.q) box.actions['kit.composer.send']({ id: 'wake-scope', text: ctx.query.q });
      let timer;
      /* 펼침 판단 창(foldDeadline)을 먼저 잡고 범위 상자의 목록 읽기를 시작한다: 창의 남은 시간을 줄이지 않음 */
      const first = Promise.race([load().then(() => seriesRead), new Promise(resolve => { timer = setTimeout(resolve, Math.max(0, foldDeadline - performance.now())); })]);
      void box?.init();
      try { await first; }
      finally { clearTimeout(timer); }
    },
    render: () => C.pageColumn.render({ width: 'home', children: body() }),
    afterRender: root => {
      if (!root.dataset.homeBound) {
        root.dataset.homeBound = 'true';
        const doc = root.ownerDocument;
        /* 출처 상태: 읽는 중에는 다음을 쌓지 않고, 숨은 문서는 읽지 않으며, 실패하면 물러난다 */
        sourcePoll = createLivePoll({ every: SOURCE_REFRESH_MS, read: () => refreshSources().then(() => { if (failures.sources) throw failures.sources; }) });
        sourcePoll.start();
        doc.defaultView.addEventListener('pagehide', () => { disposed = true; sequence++; sourceSequence++; sourcePoll.stop(); monitoring.dispose(); }, { once: true });
      }
      root.dataset.wakeView = view;
      drawn = true;
    },
    meta: pageMeta,
    onSettings: () => ctx.update(),
    menus: { ...(box?.menus ?? {}) },
    actions: {
      ...search.actions,
      ...(box?.actions ?? {}),
      /* 그래프에서 고른 창(끌기·축 늘이기)은 지난 구간(live 아님). 축을 두 번 눌러(또는 0) 처음 보던 지금 창으로 돌아오면 그 전의 지금 기간(프리셋)으로 되돌린다:
         머리의 "수집 …–…" 표시도 함께 사라진다 */
      'wake.home.zoom': a => {
        if (!Number.isFinite(a.from) || !Number.isFinite(a.to)) return;
        const cur = ctx.state().range;
        if (cur?.live !== false) { const w = Object.values(series).find(x => x?.state === 'ready')?.data?.range ?? range(); zoomFrom = { range: cur, from: w.from / 1000, to: w.to / 1000 }; } /* the window the charts were drawn on */
        if (zoomFrom && Math.abs(a.from - zoomFrom.from) <= 1 && Math.abs(a.to - zoomFrom.to) <= 1) { const back = zoomFrom.range; zoomFrom = null; ctx.setState({ range: back }); return; }
        ctx.setState({ range: { from: Math.floor(a.from), to: Math.ceil(a.to), live: false } });
      },
      'wake.home.card': a => { folded[a.arg] = !a.open; },
      'wake.home.tl': a => { if (Number.isFinite(a.from) && Number.isFinite(a.to)) { folded.tl = { from: a.from, to: a.to }; ctx.update(); } },
      'wake.home.change': a => { const c = homeMarks(0, Infinity).find(x => x.id === a.arg); if (!c) return;
        const [kind, name] = c.lane === 'config' ? ['ConfigMap', c.title] : c.id.startsWith('wl:') ? [c.kind, c.title] : c.title.split('/');
        const plural = Object.values(KIND_OF).find(k => k.kind === kind)?.plural;
        if (plural) ctx.api.navigate(A('cluster', id, 'ns', plural === 'nodes' ? '_all' : c.ns || '_all', plural, name), { presentation: 'detail' }); },
      'wake.home.metric': a => { if (metricDef(a.arg)) ctx.api.navigate(viewAddress(id, 'metric', a.arg), { replace: true }); },
      /* 에이전트 칩은 에이전트 화면, 도구 칩은 도구 화면에서 그 도구의 상세 칸 */
      'wake.home.screen': a => ctx.api.navigate(viewAddress(id, a.arg)),
      'wake.home.source': a => ctx.api.navigate(a.arg === 'agent' ? viewAddress(id, 'agent') : `${viewAddress(id, 'tools')}?tool=${encodeURIComponent(a.arg)}`),
      'wake.home.incident': a => { const i = incidents.find(x => x.id === a.arg); if (i) ctx.api.navigate(incidentAddress(i)); },
      'wake.home.pod': a => { const [ns, ...rest] = String(a.arg).split('/'); ctx.api.navigate(A('cluster', id, 'ns', ns, 'pods', rest.join('/')), { presentation: 'detail' }); },
      'wake.home.workload': a => { const [plural, ns, ...rest] = String(a.arg).split('/'); if (KIND_OF[plural]) ctx.api.navigate(A('cluster', id, 'ns', ns, plural, rest.join('/')), { presentation: 'detail' }); },
      'wake.home.event': a => { const r = warnings().rows.find(x => x.key === a.arg) ?? warningSummary(events, { from: 0, to: Infinity }).rows.find(x => x.key === a.arg);
        const e = r && events.filter(x => x.object?.kind === r.kind && x.object?.name === r.name && (x.object?.ns ?? '') === r.ns && x.reason === r.reason && (x.message ?? '') === r.message).sort((x, y) => Date.parse(y.at) - Date.parse(x.at))[0];
        const to = e && eventAddress(e, id, eventsAt); if (to) ctx.api.navigate(to, { presentation: 'detail' }); },
      'wake.home.retry': () => { seriesKey = ''; void box?.retry(); return load(true); }, /* 다시 읽기는 지표 시리즈도 다시 읽는다(U-01: 끊김 뒤 눌러도 값·끊김 표시가 그대로였다) */
      'wake.inc.result': a => { st.inc.result = String(a.arg); st.inc.page = 1; ctx.update(); },
      'wake.inc.page': a => { st.inc.page = Number(a.arg?.value ?? a.arg) || 1; ctx.update(); },
      'wake.inc.range': a => { st.inc.range = a.preset ? { preset: a.preset } : { from: a.from, to: a.to, live: !!a.live }; st.inc.page = 1; ctx.update(); },
      'wake.inc.card': a => { st.incFolded[a.arg] = !a.open; },
    },
  };
});
