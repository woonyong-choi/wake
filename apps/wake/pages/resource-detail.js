import { compareResources } from '../data/table-order.js';
/*
 * 리소스 상세(모든 종류 같은 틀, 시뮬레이션 resourceDetail · eventDetail, spec/design.md#B-042):
 * 머리 한 줄(종류 아이콘 · 이름 · 상태 · 종류·namespace·클러스터 · 주 행동 "조치 제안") → 경고 줄 카드(원인만, Argo CD·Helm 관리는 중립 행)
 * → 탭(요약 · 이벤트 · [로그] · [롤아웃 | 실행 기록] · YAML · 관련)과 오른쪽 구간 → 탭 내용.
 * 요약 순서(모든 종류 같음): 상태 막대 → 지표 → 상태·컨테이너 표 → 조건 → 종류별 속성 → 라벨. 데이터가 없는 구역은 빠진다.
 * Event는 이벤트 상세(대상, 횟수·처음·마지막·출처, Message, 지금 대상 상태, 같은 대상, 같은 Reason, 관련, YAML).
 * 조치 제안은 소유 관계로 길을 정한다(data/ownership.js planFor): 자동 동기화 Argo CD 대상은 Draft PR, 그 밖은 명령. 실행은 AI 칸의 승인 뒤.
 */
import config from '../app.config.js';
import { bootPage, components as C, html, service, hasService, liveInterval, tokenPx } from '../../../kit/page/index.js';
import { status, readableBytes, readableFact, eventAddress, eventSubjectAddress, num, byteRate, rateUnit } from './parts.js';
import { createMonitoringReadQueue, monitoringChartData } from './monitoring-parts.js';
import { when, hm, hms } from './incident-parts.js';
import { parseLogs, logModel, logToolbar, logCard, logActions, logMenus, downloadText, previousOf, logLimitReached } from './log-card.js';
import { eventTable, eventHead } from './events-view.js';
import { INSPECTOR_READ, replicaSetPods, cronJobRuns, claimConsumers, inspectorSections, inspectorConfiguration } from './resource-inspector.js';
import { podMembership, isProblem, KIND_LIST, KIND_OF, toYaml, restartsColumn, rowOf } from '../data/kinds.js';
import { ownedEvents, relatedResources } from '../data/related.js';
import { contract } from '../data/gitops.js';
import { readCause, readFailure, skeletonBar } from './view-parts.js';
import { eventSummary } from '../data/incident-model.js';
import { eventObjectOf, changeMarks, windowOf, CHANGE_LANES, PRESET_SECONDS } from '../data/home.js';
import { ownerOf, planFor } from '../data/ownership.js';

const LOG_ROW_LIMIT = 1000;
const LOG_BYTE_LIMIT = 2 * 1024 * 1024;
const EVENT_PER = 20;
/* 워크로드 지표를 합하는 Pod 수의 끝(Pod마다 CPU·메모리 두 읽기): 넘으면 그 수까지 합하고 머리에 적는다 */
const logEncoder = new TextEncoder();
const A = (...p) => 'wake://' + p.map(encodeURIComponent).join('/');
/* 상세 구간(지표·이벤트·로그가 같이 씀): 공통 프리셋 15분~7일(RULE-RANGE) */
const DETAIL_PRESETS = ['15m', '1h', '6h', '24h', '7d'].map(id => ({ id, seconds: PRESET_SECONDS[id] }));
const DETAIL_SPAN = PRESET_SECONDS['7d'] * 1000;
/* 상태 막대의 이름(kubectl·describe 원문) */
const LABEL = { ready: 'Ready', desired: 'Desired', upToDate: 'Up-to-date', available: 'Available', current: 'Current', restarts: 'Restarts', node: 'Node', ip: 'IP', age: 'Age',
  succeeded: 'Succeeded', completions: 'Completions', failedPods: 'Failed', duration: 'Duration', type: 'Type', clusterIP: 'Cluster-IP', externalIP: 'External-IP', ports: 'Port(s)', class: 'Class', hosts: 'Hosts', address: 'Address',
  keys: 'Data', roles: 'Roles', version: 'Version', internalIP: 'Internal-IP', image: 'Image', strategy: 'Strategy', selector: 'Selector', requested: 'Requested Storage', capacity: 'Capacity', active: 'Active', schedule: 'Schedule', timeZone: 'Time Zone', suspend: 'Suspend', activeJobs: 'Active Jobs', lastSchedule: 'Last Schedule', lastSuccess: 'Last Successful', reference: 'Reference', targets: 'Targets', min: 'Min Replicas', max: 'Max Replicas', volume: 'Volume', accessModes: 'Access Modes', revision: 'Revision', nodeGroup: 'NodeGroup', zone: 'Zone', imageShort: 'Image', storageClass: 'StorageClass' };
/* 종류마다 상태 막대의 이름 붙은 값(시뮬레이션 facts): 나머지 원문 값은 종류별 속성의 사양 카드 */
const HEAD_FACTS = { deployments: ['ready', 'desired', 'revision', 'age', 'imageShort'], statefulsets: ['ready', 'desired', 'age', 'imageShort'], daemonsets: ['desired', 'ready', 'upToDate', 'available', 'age'],
  replicasets: ['desired', 'ready', 'available', 'revision', 'age'], jobs: ['succeeded', 'completions', 'failedPods', 'duration', 'age'], cronjobs: ['schedule', 'suspend', 'active', 'lastSchedule', 'lastSuccess'],
  nodes: ['nodeGroup', 'zone', 'version', 'internalIP', 'age'], services: ['type', 'clusterIP', 'ports', 'externalIP'], persistentvolumeclaims: ['capacity', 'class', 'accessModes', 'volume'], ingresses: ['class', 'hosts', 'address'],
  configmaps: ['age'], secrets: ['type', 'age'], /* the key count is the Data card's own head */ horizontalpodautoscalers: ['min', 'max', 'current', 'reference'] };
const FACT_KEY = { Created: 'wake.fact.created', Namespace: 'wake.col.namespace', Phase: 'wake.fact.phase' };
function rawFacts(resource, kind) {
  const { metadata = {}, spec = {}, status: observed = {} } = resource.raw || {};
  const common = { Namespace: metadata.namespace, Created: metadata.creationTimestamp, 'Deletion Timestamp': metadata.deletionTimestamp }; /* 관측 시각은 메타 글(spec/design.md#B-037)이라 두지 않는다 */
  const byKind = {
    pods: { Phase: observed.phase },
    deployments: { Generation: metadata.generation, 'Observed Generation': observed.observedGeneration, Progressing: observed.conditions?.find(item => item.type === 'Progressing')?.reason },
    statefulsets: { 'Current Revision': observed.currentRevision, 'Update Revision': observed.updateRevision, 'Start Ordinal': spec.ordinals?.start },
    daemonsets: { Misscheduled: observed.numberMisscheduled, Updated: observed.updatedNumberScheduled },
    jobs: { Active: observed.active, 'Start Time': observed.startTime, 'Completion Time': observed.completionTime },
    nodes: { Unschedulable: spec.unschedulable ?? (resource.raw ? false : undefined), 'Capacity CPU': observed.capacity?.cpu, 'Capacity Memory': observed.capacity?.memory },
    configmaps: { Immutable: resource.raw?.immutable ?? (resource.raw ? false : undefined) },
    ingresses: { TLS: spec.tls?.map(tls => tls.secretName).filter(Boolean).join(', ') },
  };
  return Object.entries({ ...common, ...byKind[kind] }).filter(([, value]) => value != null && value !== '')
    .map(([label, value]) => ({ id: 'observed:' + label, label, value }));
}
const NEGATIVE_CONDITIONS = new Set(['MemoryPressure', 'DiskPressure', 'PIDPressure', 'NetworkUnavailable', 'OutOfDisk', 'Failed', 'FailureTarget', 'ReplicaFailure']);
const POSITIVE_CONDITIONS = new Set(['Ready', 'Available', 'Initialized', 'ContainersReady', 'PodScheduled', 'Complete', 'SuccessCriteriaMet']);
const conditionConcern = c => NEGATIVE_CONDITIONS.has(c.type) ? c.status === 'True' : POSITIVE_CONDITIONS.has(c.type) ? c.status === 'False'
  : c.type === 'Progressing' && c.status === 'False';
const flat = v => v && typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k}=${x}`).join(', ') : String(v ?? '');
/* Kubernetes 수량(resource.Quantity) -> 기본 단위의 수: cpu는 코어, 메모리·저장은 바이트. 모르는 형식은 null */
const QTY = { m: 1e-3, k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6 };
const qty = v => { const m = /^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(m|k|M|G|T|P|E|Ki|Mi|Gi|Ti|Pi|Ei)?$/.exec(String(v ?? '').trim()); return m ? Number(m[1]) * (m[2] ? QTY[m[2]] : 1) : null; };
const memMiOf = v => { const b = qty(v); return b == null ? null : b / 1048576; };
/* 바이트 -> 사람이 읽는 크기(GiB 소수 한 자리, 1GiB 아래는 MiB) */
const bytesText = b => b == null ? '' : b >= 1024 ** 3 ? `${num(Math.round(b / 1024 ** 3 * 10) / 10)}GiB` : `${num(Math.round(b / 1048576))}MiB`;

bootPage(config, async ctx => {
  const { t, params, data } = ctx;
  const kind = await data.get('kind', params);
  const queryParams = { ...params, at: ctx.query.at };
  const anchor = address => ctx.query.at === undefined ? address : address + (address.includes('?') ? '&' : '?') + 'at=' + encodeURIComponent(ctx.query.at);
  let r = null, pods = [], mine = [], tabs = [], allEvents = null, subjectNow = null;
  let relationships = null, relationshipState = null, configKey = null;
  let evidenceRows = null, managerRaw = null;
  let relatedSubject = null;
  let inspector = { read: 'loading', rows: null };
  let argoApps = null, relatedLists = null;
  let volumeUse = null; /* PVC 사용량(kubelet_volume_stats, 허브 metrics.usage): { state, row?, error? } */
  /* 실패한 읽기의 오류(원인 표시, RULE-STATE): phase · related · relationship · tab · inspector */
  const errors = {};
  let ownerRead = { key: null, entries: [] }, podCoverage = { coverage: 'unknown', reason: 'incomplete' };
  const relatedIdentity = () => JSON.stringify([params.cluster, params.kind, params.ns, params.name, r?.raw?.apiVersion ?? r?.apiVersion, r?.raw?.kind ?? r?.kind, r?.raw?.metadata?.uid ?? r?.uid]);
  /* 소유한 Pod를 다 확인하지 못함: 관계 읽기가 끝난 뒤에만(읽는 중은 뼈대) */
  const childCoverage = () => ['deployments', 'statefulsets', 'daemonsets', 'jobs'].includes(params.kind) && relatedRead === 'ready' && podCoverage.coverage !== 'complete';
  const childCoverageRow = () => childCoverage() ? C.statusIcon.render({ kind: 'idle', text: [t('wake.detail.owner.childrenUnverified'),
    podCoverage.reason === 'replicaset' ? `ReplicaSet · ${errors.relationship ? readCause(t, errors.relationship) : t('wake.detail.owner.unsupported')}` : ''].filter(Boolean).join(' · ') }) : '';
  const metricReader = createMonitoringReadQueue();
  let metricSequence = 0;
  const metrics = { pending: false, key: null, view: null, state: 'not_requested', window: null, error: null }; /* error: 모든 읽기가 실패했을 때 원인을 말할 오류 */
  let logMeta = null;
  let eventTimer, eventRefreshPending = false, eventBuffer = null;
  let liveTimer = null, liveBusy = false, liveStale = false, liveController;
  let phase = 'loading', relatedRead = 'loading', request = 0, tabRequest = 0, timer = null, disposed = false, resourceController, tabController, detailScroll = null;
  const folded = {}; // 사람이 접은(true)·편(false) 카드(키별): 바꾼 것만
  const TAB_ALIAS = { pods: 'summary', endpoints: 'summary', data: 'summary', configuration: 'summary' };
  const st = { tab: TAB_ALIAS[ctx.query.tab] || ctx.query.tab || 'summary', range: { preset: '1h' }, yaml: null, managed: false, logs: null, logKey: null, pod: ctx.query.pod || '',
    warnOnly: null, events: null, eventPage: 1, read: 'ready', cOpen: null };
  /* 로그 카드 상태(log-card.js) */
  const ls = { q: ctx.query.q || '', level: 'all', only: false, around: 2, page: null, ts: true, wrap: true, previous: ctx.query.previous === 'true' ? true : null, follow: false, source: 'kubernetes', search: '', container: ctx.query.container || '' };
  const failure = e => e?.kind === 'identity_changed' ? 'changed' : (e?.name === 'AbortError' || e?.kind === 'cancelled') ? 'cancelled' : (Number(e?.status) === 403 || e?.kind === 'forbidden') ? 'forbidden' : (Number(e?.status) === 404 || ['notFound', 'missing'].includes(e?.kind)) ? 'missing' : 'error';
  const stateText = state => t(state === 'logSize' ? 'wake.log.tooLarge' : state === 'lokiUnavailable' ? 'wake.log.lokiUnavailable' : state === 'loading' ? 'wake.res.loading' : state === 'forbidden' ? 'wake.flow.c.forbidden' : state === 'changed' ? 'wake.ev.identityChanged' : state === 'missing' ? 'wake.flow.c.absent' : state === 'cancelled' ? 'wake.flow.c.cancelled' : 'wake.conn.short.failed');
  /* 읽기 상태 줄: 오류는 무엇을 못 읽었는지와 원인(error: 그 읽기의 오류) */
  const pending = (state, action, error) => C.settingsGroup.render({ children: C.settingsRow.render({
    lead: C.statusIcon.render({ kind: state === 'loading' ? 'busy' : state === 'forbidden' ? 'perm' : state === 'error' ? 'error' : 'idle' }),
    title: state === 'error' ? readFailure(t, error) : stateText(state),
    control: ['loading', 'missing', 'changed'].includes(state) ? '' : C.button.render({ label: t('wake.flow.a.retry'), size: 'sm', variant: 'secondary', action }),
  }) });
  /* 카드 하나(시뮬레이션 bar): 이름 · 머리 값 · 본문, 접힘은 사람이 바꾼 것만 기억 */
  const card = (key, label, items, body, open = true) => C.summaryBar.render({ label, open: key in folded ? !folded[key] : open, /* folded: 사람이 접은 카드(true)·편 카드(false) */ toggle: { action: 'wake.detail.fold', arg: key }, items: [{ id: 't', label: '', value: label }, ...items], body });
  const empty = key => C.emptyState.render({ title: t(key), variant: 'line' });

  /* ---------- 기간: 지표·이벤트·로그가 같은 창 ---------- */
  const reference = () => ctx.query.at !== undefined ? Date.parse(ctx.query.at) : Date.parse(r?.timeBasis?.referenceAt ?? '') || Date.now();
  const win = () => windowOf(st.range, reference());
  const rangeControl = () => C.timeRange.render({ id: 'detail-range', value: st.range, action: 'wake.detail.range', fallback: '1h', presets: DETAIL_PRESETS, retention: PRESET_SECONDS['7d'], now: Math.floor(reference() / 1000), label: t('wake.view.range') });

  /* ---------- 소유 관계(ownerReferences 확인) ---------- */
  function ownerBasis() {
    const metadata = r?.raw?.metadata;
    const known = !!metadata?.uid && (metadata.ownerReferences == null || Array.isArray(metadata.ownerReferences));
    const refs = Array.isArray(metadata?.ownerReferences) ? metadata.ownerReferences.map(ref => ({ ...ref }))
      : known ? [] : r?.owner ? [{ ...r.owner }] : [];
    const namespace = metadata?.namespace || r?.ns || params.ns;
    const key = JSON.stringify([params.cluster, namespace, r?.name, metadata?.uid, refs.map(ref => [ref.apiVersion, ref.kind, ref.name, ref.uid])]);
    return { key, refs, known, namespace, podUid: metadata?.uid };
  }
  const ownerDefinition = ref => KIND_LIST.find(item => item.kind === ref.kind && item.api === ref.apiVersion);
  const ownerInitialState = (ref, basis) => !basis.podUid || !ref.uid || !ref.name || !ref.kind || !ref.apiVersion ? 'incomplete' : !ownerDefinition(ref) ? 'unsupported' : 'unread';
  function ownerEntries() {
    const basis = ownerBasis();
    return ownerRead.key === basis.key ? ownerRead.entries : basis.refs.map(ref => ({ ref, state: ownerInitialState(ref, basis) }));
  }
  const ownerStateText = state => ['forbidden', 'missing', 'error', 'cancelled', 'loading'].includes(state)
    ? stateText(state) : t('wake.detail.owner.' + state);
  async function loadOwners(id, options) {
    const basis = ownerBasis(), record = { key: basis.key, entries: basis.refs.map(ref => ({ ref, state: ownerInitialState(ref, basis) })) };
    ownerRead = record;
    const valid = () => !disposed && id === tabRequest && st.tab === 'relations' && ownerBasis().key === basis.key;
    for (const entry of record.entries) if (entry.state === 'unread') entry.state = 'loading';
    ctx.update();
    await Promise.allSettled(record.entries.filter(entry => entry.state === 'loading').map(async entry => {
      const ref = entry.ref, definition = ownerDefinition(ref);
      try {
        const resource = await data.get('resource', { ...params, kind: definition.plural, name: ref.name, ns: definition.cluster ? '_all' : basis.namespace }, options);
        if (!valid()) return;
        if (!resource || resource.missing) { entry.state = 'missing'; return; }
        const raw = resource.raw;
        if (!raw?.metadata?.uid) { entry.state = 'error'; return; }
        const matches = raw.metadata.uid === ref.uid && raw.metadata.name === ref.name && raw.kind === ref.kind && raw.apiVersion === ref.apiVersion && (definition.cluster || raw.metadata.namespace === basis.namespace);
        entry.state = matches ? 'verified' : 'mismatch';
        if (matches) entry.resource = resource;
      } catch (error) { if (valid()) entry.state = failure(error); }
    }));
    return valid();
  }

  /* ---------- Pod 지표(관측 연결의 Prometheus): 메모리 · CPU · 네트워크 ---------- */
  const metricIds = ['cpu', 'memory', 'network_rx', 'network_tx'];
  const metricStatus = state => state === 'missing' ? t('wake.flow.c.absent') : state === 'cancelled' ? t('wake.flow.c.cancelled') : t('wake.monitor.status.' + state);
  /* Pod 지표는 Pod 합계(A2-25): 컨테이너가 여럿이면 편 그래프에 컨테이너별 선을 더한다. 로그에서 고른 컨테이너와 무관 */
  const podContainers = () => (r?.raw?.spec?.containers?.map(c => c.name) ?? r?.containerList?.map(c => c.name) ?? []).filter(Boolean);
  function metricSubject() {
    const meta = r?.raw?.metadata, container = podContainers()[0];
    return { context: params.cluster, namespace: meta?.namespace || r?.ns || params.ns, name: r?.name, uid: meta?.uid, container };
  }
  /* 컨테이너별 선의 결과 키(cpu:proxy): 컨테이너가 하나면 합계가 곧 그 컨테이너라 따로 읽지 않는다 */
  const partIds = id => (podContainers().length > 1 ? podContainers().map(c => `${id}:${c}`) : []);
  /* 같은 시각에 모든 컨테이너가 값을 낸 점만 더한 합계(하나라도 빠진 시각은 부분 합 대신 비움) */
  function sumParts(parts) {
    const failed = parts.find(p => !['ok', 'empty'].includes(p.state));
    if (failed) return { state: failed.state, error: failed.error };
    if (parts.some(p => p.state !== 'ok')) return { state: 'empty' };
    const maps = parts.map(p => new Map(p.hub.values.map(([at, v]) => [at, Number(v)])));
    const values = [...maps[0].keys()].filter(at => maps.every(m => Number.isFinite(m.get(at)))).map(at => [at, String(maps.reduce((s, m) => s + m.get(at), 0))]);
    return values.length ? { state: 'ok', hub: { values, step: parts[0].hub.step } } : { state: 'empty' };
  }
  /* 지표 줄이 있는 종류(D-USR-2026-11-18-2): Pod는 자기 컨테이너, 워크로드는 소유한 Pod의 합, Node는 그 기계의 사용 */
  const METRIC_KINDS = ['pods', 'deployments', 'statefulsets', 'daemonsets', 'nodes'];
  const live = p => !['Succeeded', 'Failed'].includes(p.phase ?? p.raw?.status?.phase) && !!p.node; /* 지금 자원을 쓰는 Pod(kubelet이 세는 Pod) */
  const sumPods = () => (params.kind === 'nodes' || params.kind === 'pods' ? [] : mine.filter(live));
  const metricKey = () => JSON.stringify(params.kind === 'pods' ? [metricSubject(), podContainers(), st.range] : [params.kind, r?.raw?.metadata?.uid, relatedRead, sumPods().map(p => p.name), st.range]);
  function stopMetrics() { metricSequence++; metricReader.cancelDisplay(); metrics.pending = false; }
  function metricWindow() {
    const epoch = value => {
      if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return NaN;
      const at = Date.parse(value); return Number.isFinite(at) && new Date(at).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z') ? at : NaN;
    };
    if (ctx.query.from || ctx.query.to) {
      const from = epoch(ctx.query.from), to = epoch(ctx.query.to), step = Number(ctx.query.step || 30);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to - from > DETAIL_SPAN || !Number.isInteger(step) || step < 1 || (to - from) / (step * 1000) > 11000) return null;
      return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), step };
    }
    const to = ctx.query.at === undefined ? Date.now() : epoch(ctx.query.at), { from, to: end } = windowOf(st.range, to);
    return Number.isFinite(to) && end - from <= DETAIL_SPAN ? { from: new Date(from).toISOString(), to: new Date(end).toISOString(), step: Math.max(30, Math.round((end - from) / 1000 / 240 / 15) * 15) } : null;
  }
  function metricResponse(response, input) {
    if (!response || response.requestId !== input.requestId || response.connectionId !== input.connectionId || response.operation !== 'metrics' || response.queryId !== input.metricId || response.metricId !== undefined && response.metricId !== input.metricId) return false;
    const sameWindow = value => value && ['from', 'to', 'step'].every(key => value[key] === input.queryWindow[key]);
    const sameSubject = value => value?.kind === 'Pod' && Object.keys(input.subject).every(key => value[key] === input.subject[key]);
    if (response.queryWindow && !sameWindow(response.queryWindow)) return false;
    if (response.subject && !sameSubject(response.subject)) return false;
    if (!['ok', 'empty', 'unverified'].includes(response.status)) return true;
    if (!sameSubject(response.subject) || !sameWindow(response.queryWindow)) return false;
    if (!Array.isArray(response.data?.matrix)) return false;
    if (response.status !== 'ok') return true;
    const scope = response.data.scope, network = input.metricId.startsWith('network_');
    if (response.data.identity?.resourceUID !== 'verified' || response.data.identity.seriesUID !== 'verified' || scope?.kind !== (network ? 'pod' : 'container') || scope.context !== input.subject.context || scope.namespace !== input.subject.namespace || scope.pod !== input.subject.name || scope.uid !== input.subject.uid || !network && scope.container !== input.subject.container) return false;
    if (response.data.unit !== ({ cpu: 'cores', memory: 'bytes', network_rx: 'bytes/s', network_tx: 'bytes/s' }[input.metricId])) return false;
    return response.data.matrix.length > 0 && response.data.matrix.every(series => series.metric && Array.isArray(series.values) && series.values.length && series.values.every(point => Array.isArray(point) && point.length === 2 && typeof point[0] === 'number' && typeof point[1] === 'string' && Number.isFinite(Number(point[1])) && point[0] * 1000 >= Date.parse(input.queryWindow.from) && point[0] * 1000 <= Date.parse(input.queryWindow.to)));
  }
  async function loadMetrics() {
    if (disposed || !METRIC_KINDS.includes(params.kind) || st.tab !== 'summary' || phase !== 'ready') return;
    if (params.kind !== 'pods') return loadSetMetrics();
    stopMetrics(); const seq = metricSequence, subject = metricSubject(), key = metricKey(), window = metricWindow();
    if (metrics.key !== key) metrics.view = null;
    metrics.key = key; metrics.window = window;
    if (!subject.uid || !subject.container) { metrics.state = 'unverified'; ctx.update(); return; }
    if (subject.name !== params.name || subject.namespace !== params.ns || r.raw?.metadata?.name !== params.name) { metrics.state = 'identity_changed'; ctx.update(); return; }
    if (!window) { metrics.state = 'invalid_request'; ctx.update(); return; }
    if (!hasService()) { metrics.state = 'unsupported_host'; ctx.update(); return; }
    const valid = () => !disposed && seq === metricSequence && st.tab === 'summary' && metricKey() === key;
    metrics.pending = true; metrics.state = 'loading'; ctx.update();
    try {
      const catalog = await metricReader.read('pod-catalog:' + params.cluster, () => service('observability.catalog', {}), valid);
      if (!valid()) return;
      const connections = catalog?.connections?.filter(item => item.provider === 'prometheus' && item.status === 'configured' && item.identity?.cluster === subject.context) || [];
      if (catalog?.status !== 'ok' || connections.length !== 1) {
        /* 관측 연결 묶음이 없으면 홈·지표 화면과 같은 출처(클러스터 안에서 찾은 Prometheus, 허브 metricSeries)로 읽는다(B1: 홈은 값이 나오는데 상세만 "연결 안 됨"이던 결함).
           그 출처도 연결 안 됨일 때만 연결 안 됨 */
        if (catalog?.status === 'forbidden') { metrics.state = 'forbidden'; metrics.view = null; return; }
        const hub = await readHubMetrics(subject, window);
        if (!valid()) return;
        if (hub.failed) { metrics.state = hub.failed; metrics.error = hub.error; metrics.view = null; return; }
        metrics.view = { key, subject, window, results: hub }; metrics.state = 'ready'; metrics.error = null; return;
      }
      /* 연결은 컨테이너 범위로 답한다: Memory·CPU는 컨테이너마다 읽어 같은 시각끼리 더한 것이 Pod 합계, 컨테이너가 하나면 그 값 */
      const results = {}, names = podContainers();
      const reads = [...['cpu', 'memory'].flatMap(id => names.map(container => [names.length > 1 ? `${id}:${container}` : id, id, container])), ...['network_rx', 'network_tx'].map(id => [id, id, subject.container])];
      await Promise.all(reads.map(async ([key, metricId, container]) => {
        const input = { requestId: 'pod-metric:' + crypto.randomUUID(), connectionId: connections[0].connectionId, operation: 'metrics', metricId, queryWindow: { ...window }, subject: { ...subject, container } };
        try {
          const response = await metricReader.read(JSON.stringify([input.subject, metricId, window]), () => service('observability.read', input), valid);
          const state = metricResponse(response, input) ? response.status : 'invalid_response';
          results[key] = { input, response, state, ...(state === 'ok' && key !== metricId ? { hub: { values: response.data.matrix[0].values, step: window.step } } : {}) }; /* a container's part: points to add up */
        } catch (error) { results[key] = { input, error, state: error?.kind === 'timeout' ? 'timeout' : error?.kind === 'cancelled' ? 'cancelled' : error?.status === 403 ? 'forbidden' : 'query_error' }; }
      }));
      if (names.length > 1) for (const id of ['cpu', 'memory']) results[id] = sumParts(partIds(id).map(k => results[k]));
      if (!valid()) return;
      metrics.view = { key, subject, window, results }; metrics.state = 'ready';
    } catch (error) {
      if (!valid()) return;
      metrics.state = error?.kind === 'timeout' ? 'timeout' : error?.kind === 'cancelled' ? 'cancelled' : error?.status === 403 ? 'forbidden' : 'query_error'; metrics.error = error; metrics.view = null;
    } finally {
      if (valid()) { metrics.pending = false; ctx.update(); }
      else if (!disposed && seq === metricSequence && st.tab === 'summary' && metricKey() !== key) { metrics.pending = false; metrics.view = null; metrics.state = 'identity_changed'; ctx.update(); }
    }
  }
  /* 워크로드(소유한 Pod의 합)와 Node(그 기계)의 CPU·메모리: 홈과 같은 허브 시리즈. 값은 Pod 지표와 같은 단위(코어·바이트)로 바꿔 둔다 */
  async function loadSetMetrics() {
    stopMetrics(); const seq = metricSequence, key = metricKey(), window = metricWindow();
    if (metrics.key !== key) metrics.view = null;
    metrics.key = key; metrics.window = window;
    if (relatedRead !== 'ready') { metrics.state = relatedRead === 'loading' ? 'not_requested' : 'unverified'; return; } /* the pods the sum is made of come with the relation read */
    if (!window) { metrics.state = 'invalid_request'; ctx.update(); return; }
    const valid = () => !disposed && seq === metricSequence && st.tab === 'summary' && metricKey() === key;
    metrics.pending = true; metrics.state = 'loading'; ctx.update();
    try {
      const results = params.kind === 'nodes' ? await readNodeMetrics(window) : await readWorkloadSums(window);
      if (!valid()) return;
      if (results.failed) { metrics.state = results.failed; metrics.error = results.error; metrics.view = null; return; }
      metrics.view = { key, window, results }; metrics.state = 'ready'; metrics.error = null;
    } finally { if (valid()) { metrics.pending = false; ctx.update(); } }
  }
  const hubFailure = e => (e?.kind === 'unconfigured' ? 'unconfigured' : e?.status === 403 || e?.kind === 'forbidden' ? 'forbidden' : e?.kind === 'timeout' ? 'timeout' : 'query_error');
  const hubSeries = (window, series, target) => data.get('metricSeries', { cluster: params.cluster, series, target, from: Date.parse(window.from), to: Date.parse(window.to), step: window.step });
  /* 하나라도 답하면 그룹별 결과, 모두 실패면 { failed: 같은 실패 또는 query_error, error: 원인을 말할 첫 오류 } */
  const settleGroups = (results, states) => (states.some(x => x === 'ok' || x === 'empty') ? results
    : { failed: states.every(x => x === states[0]) ? states[0] : 'query_error', error: Object.values(results).find(x => x?.error)?.error ?? null });
  /* 지표 읽기 실패의 글: 무엇이 실패했는지 · 원인(RULE-STATE). 원인이 상태 글과 같으면 한 번만. 머리와 편 본문이 같은 글을 쓴다 */
  const metricFailure = (state, error) => { if (state === 'unconfigured') return t('wake.view.toolOff', { tool: 'Prometheus' });
    const word = metricStatus(state), cause = error ? readCause(t, error) : ''; return cause && cause !== word ? `${word} · ${cause}` : word; };
  /* 워크로드: 허브가 소유한 모든 Pod를 한 질의로 합한 시리즈(workload.cpu·workload.mem, Pod마다 읽지 않고 상한 없음) */
  async function readWorkloadSums(window) {
    const results = {}, states = [], target = { namespace: r.raw?.metadata?.namespace || params.ns, workload: params.kind, name: r.name };
    await Promise.all([['cpu', 'workload.cpu', 1 / 1000], ['memory', 'workload.mem', 1]].map(async ([id, series, unit]) => {
      try {
        const value = await hubSeries(window, series, target);
        const values = (value?.result?.[0]?.values ?? []).filter(([, v]) => Number.isFinite(Number(v))).map(([at, v]) => [at, String(Number(v) * unit)]);
        results[id] = values.length ? { state: 'ok', hub: { values, step: value?.step ?? window.step } } : { state: 'empty' };
      } catch (e) { results[id] = { state: hubFailure(e), error: e }; }
      states.push(results[id].state);
    }));
    return settleGroups(results, states);
  }
  async function readNodeMetrics(window) {
    const status = r.raw?.status || {}, cores = qty(status.capacity?.cpu ?? status.allocatable?.cpu), bytes = qty(status.capacity?.memory ?? status.allocatable?.memory), results = {}, states = [];
    /* node_exporter reads the share of the whole machine: the share of its capacity, in cores and bytes as the pods' figures */
    await Promise.all([['cpu', 'node.cpu', cores], ['memory', 'node.mem', bytes]].map(async ([id, series, whole]) => {
      if (!whole) { results[id] = { state: 'empty' }; states.push('empty'); return; }
      try {
        const value = await hubSeries(window, series, { node: r.name });
        const values = (value?.result?.[0]?.values ?? []).filter(([, v]) => Number.isFinite(Number(v))).map(([at, v]) => [at, String(Number(v) / 100 * whole)]);
        results[id] = values.length ? { state: 'ok', hub: { values, step: value?.step ?? window.step } } : { state: 'empty' };
      } catch (e) { results[id] = { state: hubFailure(e), error: e }; }
      states.push(results[id].state);
    }));
    return settleGroups(results, states);
  }
  /* 머리의 requests·limits(Node는 allocatable): Pod는 그 컨테이너, 워크로드는 Pod 템플릿 × 합한 Pod 수(limits는 모든 컨테이너에 있을 때만),
     Node는 그 위에서 도는 Pod requests(목록 행의 합, 사이드카 포함)의 합과 allocatable. 단위는 코어·바이트 */
  function boundsOf(resource) {
    if (params.kind === 'pods') { /* the Pod's total, as its line: requests of every container, limits only when every container has one */
      const all = r.raw?.spec?.containers || [], total = field => all.reduce((sum, c) => sum + (qty(c.resources?.[field]?.[resource]) ?? 0), 0);
      return { req: total('requests') || null, lim: all.length && all.every(c => qty(c.resources?.limits?.[resource]) != null) ? total('limits') : null }; }
    if (params.kind === 'nodes') {
      const req = mine.filter(live).reduce((sum, p) => sum + (p.requests?.[resource] ?? 0), 0) * (resource === 'cpu' ? 1 / 1000 : 1048576); /* the row's requests: cpu in m, memory in Mi */
      return { req: req || null, lim: qty(r.raw?.status?.allocatable?.[resource]), alloc: true };
    }
    const all = r.raw?.spec?.template?.spec?.containers || [], n = sumPods().length, total = field => all.reduce((sum, c) => sum + (qty(c.resources?.[field]?.[resource]) ?? 0), 0) * n;
    return { req: total('requests') || null, lim: all.length && all.every(c => qty(c.resources?.limits?.[resource]) != null) ? total('limits') : null };
  }
  /* 지표 막대(시뮬레이션 useHead): 닫힌 머리는 지금 값 · 기간 최고 · requests · limits · limits 대비(Network는 수신 · 송신), 수집이 없으면(재시작 대기) 마지막 수집값과 시각(N14). 연 본문은 그래프 */
  const METRIC_GROUPS = [
    { id: 'memory', label: () => t('wake.metric.memory'), ids: ['memory'], unit: 'MiB', scale: v => v / 1048576, fmt: v => `${num(Math.round(v))}Mi`, resource: 'memory', color: '--series-2' },
    { id: 'cpu', label: () => 'CPU', ids: ['cpu'], unit: 'mCPU', scale: v => v * 1000, fmt: v => `${Math.round(v)}m` /* kubectl처럼 밀리코어에 천 단위 쉼표 없음(A3-14) */, resource: 'cpu', color: '--series-1' },
    { id: 'network', label: () => t('wake.metric.network'), ids: ['network_rx', 'network_tx'], rate: true }, /* the unit comes from the values read (rateUnit, as the network view): rateGroup */
  ];
  /* Network의 축 단위: 읽은 수신·송신 값 중 가장 큰 값에서 고른 MiB/s·KiB/s·B/s(네트워크 화면과 같은 rateUnit). 칸 글은 값마다 제 단위(byteRate) */
  const rawValues = res => res?.state !== 'ok' ? [] : res.hub ? res.hub.values.map(([, v]) => Number(v)) : (res.response?.data?.matrix ?? []).flatMap(s => s.values.map(([, v]) => Number(v)));
  function rateGroup(g, view) {
    if (!g.rate) return g;
    const { unit, size } = rateUnit(Math.max(0, ...g.ids.flatMap(id => rawValues(view?.results[id])).filter(Number.isFinite)));
    return { ...g, unit, scale: v => v / size, fmt: v => byteRate(v * size) };
  }
  /* 허브 시리즈(홈과 같은 출처): 컨테이너의 CPU·메모리, Pod의 네트워크. 하나라도 읽으면 ready, 모두 그 출처 연결 안 됨이면 unconfigured */
  /* [시리즈, 단위 곱(코어·바이트로), 컨테이너] : Memory·CPU는 Pod 합계(pod.mem·pod.cpu)와 컨테이너가 여럿이면 컨테이너마다(container.*) */
  const HUB_METRIC = { memory: ['pod.mem', 1], cpu: ['pod.cpu', 1 / 1000], network_rx: ['pod.net.rx', 1], network_tx: ['pod.net.tx', 1] };
  const HUB_PART = { memory: ['container.mem', 1], cpu: ['container.cpu', 1] };
  async function readHubMetrics(subject, window) {
    const from = Date.parse(window.from), to = Date.parse(window.to), results = {}, states = [];
    const reads = [...metricIds.map(id => [id, ...HUB_METRIC[id], null]), ...['cpu', 'memory'].flatMap(id => podContainers().length > 1 ? podContainers().map(c => [`${id}:${c}`, ...HUB_PART[id], c]) : [])];
    await Promise.all(reads.map(async ([id, series, unit, container]) => {
      try {
        const value = await data.get('metricSeries', { cluster: params.cluster, series, target: { namespace: subject.namespace, pod: subject.name, ...(container ? { container } : {}) }, from, to, step: window.step });
        const values = (value?.result?.[0]?.values ?? []).map(([at, v]) => [at, unit === 1 ? v : String(Number(v) * unit)]);
        results[id] = values.length ? { state: 'ok', hub: { values, step: value?.step ?? window.step } } : { state: 'empty' }; states.push(results[id].state);
      } catch (e) { results[id] = { state: hubFailure(e), error: e }; states.push(results[id].state); }
    }));
    /* one read that answers is enough for the bars: each group then says what its own reads did (a failed CPU read is not "no samples" because memory answered) */
    return settleGroups(results, states);
  }
  function metricBars() {
    if (!METRIC_KINDS.includes(params.kind) || ['unsupported_host', 'not_requested', 'unverified', 'identity_changed', 'invalid_request'].includes(metrics.state)) return '';
    if (params.kind === 'pods' && /Pending|ContainerCreating|ImagePull|ErrImagePull|Evicted/.test(r.status?.[1] || '')) return ''; /* 실행되지 않은 Pod는 잴 것이 없다 */
    if (params.kind !== 'pods' && params.kind !== 'nodes' && !mine.some(live)) return ''; /* 도는 Pod가 없는 워크로드는 잴 것이 없다 */
    const view = metrics.view?.key === metricKey() ? metrics.view : null, window = view?.window || metrics.window || metricWindow();
    /* the Pod or the range moved since the last read (a later resource read, a range choice): read again for what is shown now, never draw the older read */
    if (!view && !metrics.pending && metrics.key !== null && metrics.key !== metricKey() && phase === 'ready' && st.tab === 'summary') queueMicrotask(() => { void loadMetrics(); });
    const from = Date.parse(window?.from) / 1000, to = Date.parse(window?.to) / 1000, height = tokenPx('--space-40') ?? 0; /* the page's least height: the kit fits the chart to its width between --chart-h-min and --chart-h-max */
    const lineName = params.kind === 'pods' && podContainers().length === 1 ? podContainers()[0] : r.name; /* a one-container Pod's total is that container */
    const failed = metrics.state === 'ready' ? null : metrics.pending ? 'loading' : metrics.state;
    const downText = failed && failed !== 'loading' ? metricFailure(failed, metrics.error) : '';
    const down = downText ? { id: 's', label: '', value: C.statusIcon.render({ kind: failed === 'forbidden' ? 'perm' : failed === 'unconfigured' ? 'idle' : 'error', text: downText, reveal: true }), shrink: true, priority: 9 } : null;
    const waiting = params.kind === 'pods' && (r.containerList || []).some(c => c.status?.[0] === 'danger');
    /* each line's name: Network's receive and send, a Pod's total and its containers (the total is the head's value) */
    const nameOf = (g, id) => (g.rate ? t(id === 'network_rx' ? 'wake.rv.rx' : 'wake.rv.tx') : id === g.id ? lineName : id.slice(g.id.length + 1));
    const withParts = g => (params.kind === 'pods' && g.resource ? { ...g, ids: [g.id, ...partIds(g.id)] } : g);
    return C.summaryBar.metrics([...METRIC_GROUPS.filter(g => g.id !== 'network' || params.kind === 'pods').map(group => { const g = withParts(rateGroup(group, view));
      const series = g.ids.flatMap(id => { const res = view?.results[id]; if (res?.state !== 'ok') return [];
        /* the hub's points sit on its step grid from the second the window starts in (rounded down): keep the ones inside the window drawn, as the chart requires */
        if (res.hub) { const v = res.hub.values.filter(([at]) => at >= from && at <= to); return v.length ? [{ key: id, total: id === g.id, name: nameOf(g, id), ...C.chartCard.seriesAppearance(g.ids.indexOf(id)),
          observations: v.map(([at, x], j) => ({ at, value: Number.isFinite(Number(x)) ? g.scale(Number(x)) : null, label: hm(at * 1000), joinPrevious: j > 0 && at - v[j - 1][0] <= res.hub.step * 1.5 })) }] : []; }
        return monitoringChartData({ queryId: id }, res.response, { timeAxisWindow: window }).series.map((s, i) => ({ ...s, total: id === g.id, name: nameOf(g, id), ...C.chartCard.seriesAppearance(g.ids.indexOf(id) + i),
          observations: s.observations.map((p, j, all) => ({ ...p, value: p.value == null ? null : g.scale(p.value), label: hm(p.at * 1000), joinPrevious: j > 0 && p.at - all[j - 1].at <= window.step * 1.5 })) })); });
      /* this group's own failed reads (timeout, forbidden, query error), apart from a read that answered with nothing (empty): named in the head, the reads that answered stay */
      const failedReads = view ? g.ids.map(id => ({ id, state: view.results[id]?.state, error: view.results[id]?.error })).filter(x => x.state && !['ok', 'empty'].includes(x.state)) : [];
      const failText = failedReads.map(x => [g.rate || x.id !== g.id ? nameOf(g, x.id) : '', metricFailure(x.state, x.error)].filter(Boolean).join(' ')).join(' · ');
      const groupDown = failedReads.length ? { id: 'f', label: '', value: C.statusIcon.render({ kind: failedReads[0].state === 'forbidden' ? 'perm' : 'error', text: failText, reveal: true }), shrink: true, priority: 8 } : null; /* the same words as the body's line below */
      const first = g.rate ? series[0] : series.find(s => s.total), points =(first?.observations || []).filter(p => p.value != null), last = points.at(-1), peak = points.reduce((b, p) => (!b || p.value > b.value ? p : b), null);
      const stale = last && to - last.at > window.step * 2;
      /* 닫힌 머리의 읽기 칸(H-009 수정 2회차): 펼친 그래프와 같은 시리즈와 컨테이너 resources만. 기간 최고는 홈 지표 막대와 같은 이름("1시간 최고"), limits 대비는 지금 값을 limits로 나눈 것. 순서와 접는 차례는 Memory·CPU 같음: 지금 | 기간 최고 | requests | limits | limits 대비, 좁으면 끝(limits 대비)부터 접힘. 기간 최고 칸은 홈처럼 값만(시각은 펼친 그래프).
         수신·송신 둘 다 읽은 Network는 두 선의 마지막 값을 이름-값 칸으로 나눈다(그때 최고 칸은 없음). 없는 값은 칸을 두지 않고, 상태 톤은 값 칸 하나에만(RULE-TONE) */
      const preset = st.range?.preset;
      const split = g.rate && series.length > 1 ?series.map((s, i) => { const at = (s.observations || []).filter(p => p.value != null).at(-1); return at ? { id: 'v' + i, label: s.name, value: g.fmt(at.value), priority: 5 } : null; }).filter(Boolean) : [];
      if (split.length < 2) split.length = 0;
      const b = g.resource ? boundsOf(g.resource) : {}, reqV = b.req != null ? g.scale(b.req) : null, limV = b.lim != null ? g.scale(b.lim) : null;
      const limWord = b.alloc ? 'allocatable' : 'limits', ofWord = t(b.alloc ? 'wake.metric.ofAllocatable' : 'wake.metric.ofLimits');
      const items = down ? [down] : !last ? (groupDown ? [groupDown] : [{ id: 'v', label: '', value: failed === 'loading' ? C.statusIcon.render({ kind: 'busy', label: t('wake.res.loading') }) : t('wake.rv.noSample'), priority: 5 }])
        : stale || waiting && stale !== false && !points.some(p => p.at >= to - window.step * 2) ? [{ id: 'v', label: '', value: t('wake.rv.lastSample', { v: g.fmt(last.value), at: hms(last.at * 1000) }), priority: 5 }, ...(limV ? [{ id: 'l', label: limWord, value: g.fmt(limV), priority: 4 }] : [])]
        : [...(split.length ? split : [{ id: 'v', label: '', value: g.fmt(last.value), priority: 5, ...(limV && last.value >= limV * .9 ? { tone: 'danger' } : !b.alloc && reqV && last.value > reqV ? { tone: 'warn' } : {}) }]),
          ...(peak && !split.length ? [{ id: 'p', label: preset ? t('wake.metric.rangePeak', { range: t(`timeRange.preset.${preset}`) }) : t('wake.metric.top'), value: g.fmt(peak.value), priority: 4 }] : []),
          ...(reqV ? [{ id: 'q', label: 'requests', value: g.fmt(reqV), priority: 3 }] : []), ...(limV ? [{ id: 'l', label: limWord, value: g.fmt(limV), priority: 2 }] : []),
          ...(limV ? [{ id: 'u', label: ofWord, value: `${num(Math.round(last.value / limV * 100))}%`, priority: 1 }] : [])];
      const refs = [...(reqV ? [{ value: reqV, label: `requests ${g.fmt(reqV)}`, tone: 'request' }] : []), ...(limV ? [{ value: limV, label: `${limWord} ${g.fmt(limV)}`, tone: 'limit' }] : [])];
      const chart = series.length && height ? { kind: 'area', bleed: true, fade: true, reading: true, axes: true, height, unit: g.unit === 'mCPU' ? 'm' : g.unit === 'MiB' ? 'Mi' : g.unit, series, ...(refs.length ? { refs } : {}),
        timeAxis: { from, to, maxGapSeconds: window.step * 1.5 }, id: `detail:${g.id}`, interactive: 'full' } : null;
      const body = chart ? C.chartCard.render({ title: g.label(), hideTitle: true, value: '', widget: true, density: 'compact', chart, ...(series.length > 1 || refs.length ? { legend: [...series.map(s => ({ label: s.name, color: s.color })), ...refs.map(x => ({ label: x.label, color: x.tone === 'request' ? '--muted-foreground' : '--chart-limit', dash: true })) /* 범례 색은 그 선의 색(requests는 조용한 선, A3-07) */] } : {}) })
        : downText || failText ? C.emptyState.render({ title: downText || failText, variant: 'line' }) : failed === 'loading' ? C.statusIcon.render({ kind: 'busy', label: t('wake.res.loading') }) : empty('wake.rv.noSample');
      if (groupDown && last) items.push(groupDown); /* a group that drew one line but not the other (RX answered, TX timed out) still says what is missing */
      return { label: g.label(), open: 'm-' + g.id in folded ? !folded['m-' + g.id] : false, toggle: { action: 'wake.detail.fold', arg: 'm-' + g.id }, items: [{ id: 't', label: '', value: g.label() }, ...items], body };
    })], { columns: ['calc(var(--space-16) * 1.4)'] }); /* 시뮬레이션 상세 지표 막대(.v-dmetrics): 이름 칸만 고정 폭(읽은 값이 같은 자리에서 시작), 나머지는 내용 폭 — 좁은 상세 칸에서 값이 "+N"으로 접히지 않음 */
  }

  /* ---------- 읽기 ---------- */
  function eventSubject(resource) {
    const uid = resource.raw?.metadata?.uid || resource.uid;
    const apiVersion = resource.raw?.apiVersion || resource.apiVersion;
    const type = resource.raw?.kind || resource.kind;
    if (!uid || !apiVersion || !type) return null;
    return { uid, kind: type, apiVersion, name: resource.name, ns: resource.ns || '' };
  }
  /* 이벤트: 소유·선택하는 종류는 그것이 소유한 것(scope.js와 같은 소유 규칙)의 Event까지(data/related.js ownedEvents) */
  const OWNING = ['deployments', 'statefulsets', 'daemonsets', 'jobs', 'replicasets', 'cronjobs', 'services', 'nodes'];
  async function readEvents(options) {
    if (!OWNING.includes(params.kind)) return data.get('events', { ...queryParams, subject: eventSubject(r) }, options);
    const ns = kind?.cluster ? '_all' : params.ns, cron = params.kind === 'cronjobs';
    const [rows, jobs, cronPods] = await Promise.all([data.get('events', { cluster: params.cluster, at: ctx.query.at, ns }, options),
      cron ? data.get('resources', { ...queryParams, kind: 'jobs', ns }, options) : [], cron ? data.get('resources', { ...queryParams, kind: 'pods', ns }, options) : null]);
    return ownedEvents(params.kind, r, rows, { pods: cronPods ?? pods, replicasets: relationships?.items || [], jobs });
  }
  async function readEvidence(id, options) {
    try { const rows = await readEvents(options); if (disposed || id !== request) return; evidenceRows = rows; } catch { /* 원인 줄은 이벤트 없이도 그린다 */ }
    if (!disposed && id === request) ctx.update();
  }
  /* 이 리소스를 관리하는 것(Argo CD·Helm)을 읽을 오브젝트: Pod는 ReplicaSet 이름의 Deployment(selector가 Pod 라벨과 맞을 때), 다른 종류는 자기 자신 */
  async function readManager(id, options) {
    if (params.kind !== 'pods') { managerRaw = r.raw; return; }
    const ref = (r.raw?.metadata?.ownerReferences || []).find(x => x.controller) || r.raw?.metadata?.ownerReferences?.[0];
    const name = ref?.kind === 'ReplicaSet' ? ref.name.replace(/-[a-z0-9]+$/, '') : '', plural = 'deployments';
    if (!name || name === ref.name) return;
    try {
      const owner = await data.get('resource', { ...queryParams, kind: plural, name, ns: r.ns }, options);
      if (disposed || id !== request || !owner?.raw) return;
      const sel = owner.raw.spec?.selector?.matchLabels || {};
      if (ref.kind === 'ReplicaSet' && !Object.entries(sel).every(([k, v]) => r.labels?.[k] === v)) return;
      managerRaw = owner.raw; ctx.update();
    } catch { /* 관리 줄 없이 그린다 */ }
  }
  /* Argo CD 관리 줄의 자동 동기화: 주석만으로 모르면 GitOps 화면과 같은 Application 읽기(gitops)에서 같은 이름의 Application 하나 */
  async function readArgoApps(id, options) {
    const owner = managerRaw ? ownerOf(managerRaw) : null;
    if (owner?.kind !== 'argocd' || owner.auto != null) return;
    try {
      const g = await data.get('gitops', { cluster: params.cluster }, options);
      if (disposed || id !== request) return;
      argoApps = contract(g?.repos).applications; ctx.update();
    } catch { /* 읽지 못하면 확인 전 그대로 */ }
  }
  /* PVC 사용량(A-18): 목록 사용 열과 같은 읽기(허브 metrics.usage). 지금을 볼 때만 */
  async function readVolumeUse(id, options) {
    if (params.kind !== 'persistentvolumeclaims' || ctx.query.at !== undefined) return;
    volumeUse = { state: 'loading' };
    try {
      const value = await data.get('usage', { cluster: params.cluster, kind: 'persistentvolumeclaims' }, options);
      if (disposed || id !== request) return;
      volumeUse = { state: 'ready', row: value?.rows?.[[r.ns || params.ns, r.name].join('/')] ?? null };
    } catch (error) { if (disposed || id !== request) return; volumeUse = { state: hubFailure(error), error }; }
    ctx.update();
  }
  /* 사용률 · 사용 · Capacity(시뮬레이션 PVC "디스크 사용"). 못 읽으면 이유(RULE-STATE), 빈 칸이나 0을 만들지 않는다. 85% 넘으면 경고, 95% 넘으면 위험 */
  function volumeBar() {
    if (!volumeUse) return '';
    /* the claim's own quantity unit (Capacity 10Gi in the head): used and capacity read in it, one decimal under 10 */
    const unit = /([KMGTP]i)$/.exec(String(r.raw?.status?.capacity?.storage || ''))?.[1], scale = unit ? 1024 ** ('KMGTP'.indexOf(unit[0]) + 1) : 0;
    const claimUnit = v => (scale ? `${num(v / scale < 10 ? Math.round(v / scale * 10) / 10 : Math.round(v / scale))}${unit}` : bytesText(v));
    const label = t('wake.detail.volumeUse'), cap = qty(r.raw?.status?.capacity?.storage), row = volumeUse.row;
    const items = volumeUse.state === 'loading' ? [{ id: 'v', label: '', value: C.statusIcon.render({ kind: 'busy', label: t('wake.res.loading') }) }]
      : volumeUse.state !== 'ready' ? [{ id: 'v', label: '', value: C.statusIcon.render({ kind: volumeUse.state === 'forbidden' ? 'perm' : volumeUse.state === 'unconfigured' ? 'idle' : 'error', text: volumeUse.state === 'unconfigured' ? t('wake.view.toolOff', { tool: 'Prometheus' }) : metricStatus(volumeUse.state) }) }]
      : row?.used == null ? [{ id: 'v', label: '', value: t('wake.rv.noSample') }]
      : [...(row.usedPct != null ? [{ id: 'v', label: '', value: `${num(row.usedPct)}%`, ...(row.usedPct >= 95 ? { tone: 'danger' } : row.usedPct >= 85 ? { tone: 'warn' } : {}) }] : []),
        { id: 'a', label: t('wake.rv.used'), value: claimUnit(row.used) }, ...(cap ? [{ id: 'c', label: 'Capacity', value: claimUnit(cap) }] : [])];
    return C.summaryBar.metrics([{ label, items: [{ id: 't', label: '', value: label }, ...items] }], { columns: ['calc(var(--space-16) * 1.4)'] });
  }
  async function readInspector(id, identity, options) {
    const source = INSPECTOR_READ[params.kind];
    if (!source || params.kind === 'replicasets') { if (params.kind === 'replicasets') return; inspector = { read: 'ready', rows: null }; return; }
    try {
      const rows = await data.get('resources', { ...queryParams, kind: source, ns: params.ns }, options);
      if (disposed || id !== request || identity !== relatedIdentity()) return;
      const list = Array.isArray(rows) ? rows : [];
      inspector = { read: 'ready', rows: params.kind === 'cronjobs' ? cronJobRuns(r, list) : claimConsumers(r, list) };
    } catch (e) {
      if (disposed || id !== request || identity !== relatedIdentity()) return;
      const state = failure(e);
      if (state === 'cancelled') return;
      inspector = { read: state === 'forbidden' ? 'forbidden' : 'error', rows: null }; errors.inspector = e;
    }
    ctx.update();
  }
  /* 이벤트 상세: 같은 대상 · 같은 Reason(클러스터의 이벤트)과 대상의 지금 상태 */
  async function readEventContext(id, options) {
    const ref = r.object || {}, plural = KIND_LIST.find(k => k.kind === ref.kind)?.plural;
    const [list, subject] = await Promise.all([data.get('resources', { cluster: params.cluster, at: ctx.query.at, ns: '_all', kind: 'events' }, options).catch(() => null),
      plural && plural !== 'events' ? data.get('resource', { ...queryParams, kind: plural, ns: KIND_LIST.find(k => k.plural === plural)?.cluster ? '_all' : ref.ns, name: ref.name }, options).catch(() => null) : null]);
    if (disposed || id !== request) return;
    allEvents = list; subjectNow = subject && !subject.missing && (!ref.uid || (subject.raw?.metadata?.uid ?? subject.uid) === ref.uid) ? subject : 'gone';
    ctx.update();
  }
  /* 화면에 있는 동안 오브젝트를 조용히 다시 읽는다: 같은 UID만 바꾸고, 실패나 바뀐 대상이면 그대로 두고 오래됐다고 적는다 */
  async function refreshResource() {
    if (disposed || phase !== 'ready' || liveBusy || globalThis.document?.hidden) return;
    const id = request, uid = r?.raw?.metadata?.uid || r?.uid;
    liveController?.abort(); liveController = new AbortController(); liveBusy = true;
    try {
      const result = await data.get('resource', queryParams, { signal: liveController.signal });
      if (disposed || id !== request) return;
      if (result && !result.missing && (result.raw?.metadata?.uid || result.uid) === uid) { r = result; liveStale = false; } else liveStale = true;
    } catch (e) {
      if (disposed || id !== request || e?.name === 'AbortError') return;
      liveStale = true;
    } finally { liveBusy = false; if (!disposed) ctx.update(); }
  }
  async function loadResource() {
    if (disposed) return;
    resourceController?.abort(); tabController?.abort(); liveController?.abort(); liveBusy = false; liveStale = false; resourceController = new AbortController();
    const options = { signal: resourceController.signal }, id = ++request;
    ++tabRequest; stopMetrics(); clearInterval(timer); clearInterval(eventTimer); eventBuffer = null; phase = 'loading'; relatedRead = 'loading'; r = null; mine = []; relationships = null; relationshipState = null; configKey = null; evidenceRows = null; managerRaw = null; argoApps = null; relatedLists = null; allEvents = null; subjectNow = null; relatedSubject = null; volumeUse = null; inspector = { read: 'loading', rows: null }; podCoverage = { coverage: 'unknown', reason: 'incomplete' }; ctx.api.setMeta?.(meta()); ctx.update();
    try {
      const result = await data.get('resource', queryParams, options);
      if (disposed || id !== request) return;
      if (!result || result.missing) { phase = 'missing'; ctx.api.setMeta?.(meta()); ctx.update(); return; }
      if (ctx.query.uid && (result.raw?.metadata?.uid || result.uid) !== ctx.query.uid) {
        phase = 'changed'; ctx.api.setMeta?.(meta()); ctx.update(); return;
      }
      r = result; mine = params.kind === 'pods' ? [r] : [];
      tabs = kind?.tabs || ['summary', 'yaml'];
      if (!tabs.includes(st.tab)) st.tab = 'summary';
      phase = 'ready'; ctx.api.setMeta?.(meta()); ctx.update();
      if (params.kind === 'events') { relatedRead = 'ready'; void readEventContext(id, options); return; }
      if (eventSubject(r) && tabs.includes('events')) void readEvidence(id, options);
      void readManager(id, options).then(() => readArgoApps(id, options));
      void readVolumeUse(id, options);
      const initialTab = st.tab;
      /* 소유한 것의 Event를 모으는 종류의 이벤트 탭은 관계(Pod·ReplicaSet) 읽기 뒤에 */
      const independent = initialTab === 'yaml' || initialTab === 'events' && !OWNING.includes(params.kind) || params.kind === 'pods' && ['summary', 'relations', 'logs'].includes(initialTab);
      if (independent) void load();
      const identity = relatedIdentity();
      const subject = eventSubject(r);
      const relationRead = ['deployments', 'services'].includes(params.kind) && subject && !r.endpointSlices
        ? Promise.resolve().then(() => data.get('relationships', { ...params, uid: subject.uid }, options))
            .then(value => ({ value: Array.isArray(value?.items) ? value : null }), error => ({ error: failure(error), cause: error }))
        : Promise.resolve({ value: null });
      const related = await Promise.all([
        ['deployments', 'statefulsets', 'daemonsets', 'jobs', 'services', 'nodes', 'pods', 'replicasets'].includes(params.kind) ? data.get('resources', { ...queryParams, kind: 'pods', ns: params.kind === 'nodes' ? '_all' : params.ns }, options) : [],
        relationRead,
      ]);
      if (disposed || id !== request) return;
      if (identity !== relatedIdentity()) throw new Error('resource identity changed during related read');
      [pods] = related; relatedRead = 'ready';
      if (params.kind === 'replicasets') inspector = { read: 'ready', rows: replicaSetPods(r, pods) };
      relationships = related[1].value;
      relationshipState = related[1].error; errors.relationship = related[1].cause;
      relatedSubject = identity;
      podCoverage = podMembership(params.kind, r, pods, relationships);
      mine = params.kind === 'pods' ? [r] : podCoverage.items;
      tabs = (kind?.tabs || ['summary', 'yaml']).filter(x => x !== 'logs' || mine.length || childCoverage());
      if (!tabs.includes(st.tab)) st.tab = tabs[0];
      st.pod ||= (mine.find(isProblem) || mine[0])?.name || '';
      phase = 'ready'; ctx.api.setMeta?.(meta());
      if (independent && st.tab === initialTab || params.kind === 'pods' && st.tab === 'logs' && st.logKey !== null) ctx.update();
      else void load();
      follow();
      void readInspector(id, identity, options);
    } catch (e) {
      if (disposed || id !== request) return;
      if (r) {
        const state = failure(e);
        relatedRead = state === 'missing' ? 'error' : state; errors.related = e;
        if (st.tab === 'events' && OWNING.includes(params.kind)) void load(); /* 관계 없이 대상 자신의 Event만 */
        if (params.kind === 'replicasets') inspector = { read: state === 'forbidden' ? 'forbidden' : 'error', rows: null };
      } else { phase = failure(e); errors.phase = e; }
      ctx.api.setMeta?.(meta()); ctx.update();
    }
  }
  /* 지금을 보는 동안: 그 종류의 공유 watch가 밀어 준 차이마다 한 번 다시 읽는다(읽기는 문서의 watch 목록에서, 요청 없음). 느린 박동은 나이 글과 watch가 없는 호스트용 */
  const liveEvery = ctx.query.at === undefined && !ctx.query.from && !ctx.query.to ? liveInterval() : null;
  const liveFeed = liveEvery && data.follow ? data.follow({ cluster: params.cluster, every: liveEvery * 6, read: () => refreshResource() }) : null;
  if (liveFeed) liveFeed.start(); else if (liveEvery) liveTimer = setInterval(() => void refreshResource(), liveEvery);
  globalThis.addEventListener?.('pagehide', () => { disposed = true; liveFeed?.stop(); clearInterval(liveTimer); liveController?.abort(); stopMetrics(); ++request; ++tabRequest; clearInterval(timer); clearInterval(eventTimer); resourceController?.abort(); tabController?.abort(); }, { once: true });
  const podAddr = p => anchor(A('cluster', params.cluster, 'ns', p.ns, 'pods', p.name));
  const openOf = (plural, ns, name, uid) => anchor(A('cluster', params.cluster, 'ns', KIND_LIST.find(k => k.plural === plural)?.cluster ? '_all' : ns || params.ns, plural, name) + (uid ? '?uid=' + encodeURIComponent(uid) : ''));
  const link = (label, address) => C.button.render({ label, variant: 'link', action: 'kit.navigate', arg: { address } });

  /* ---------- 머리 아래 경고 줄 카드: 원인(왜), 관리(Argo CD · Helm) ---------- */
  const podCause = p => {
    const c = (p.containerList || []).find(x => x.last && (x.status?.[0] !== 'ok' || p === r));
    if (c) { const limit = c.last === 'OOMKilled' ? (p.raw?.spec?.containers || []).find(x => x.name === c.name)?.resources?.limits?.memory : null;
      return t('wake.rv.lastState', { last: [c.last, c.lastExitCode != null ? `Exit ${c.lastExitCode}` : ''].filter(Boolean).join(' · ') }) + (limit ? ` · limits.memory ${limit}` : ''); }
    return null;
  };
  const latestWarning = () => (evidenceRows || []).filter(e => e.type === 'Warning').sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  function cause() {
    if (!r || !['warn', 'danger'].includes(r.status?.[0]) && !(params.kind === 'pods' && r.lastExit === 'OOMKilled')) return null;
    const cond = (r.conditions || []).find(conditionConcern);
    if (params.kind === 'pods') { const own = podCause(r); if (own) return { text: own }; }
    else if (['deployments', 'statefulsets', 'daemonsets', 'replicasets', 'jobs'].includes(params.kind)) {
      const bad = mine.find(isProblem);
      if (bad) return { text: `Pod ${bad.name} · ${podCause(bad) || bad.status?.[1] || ''}` };
      if (params.kind === 'jobs' && cond) return { text: [cond.reason, cond.message].filter(Boolean).join(' · ') };
    } else if (cond && (cond.reason || cond.message)) return { text: [cond.type, cond.reason, cond.message].filter(Boolean).join(' · ') };
    const e = latestWarning();
    return e ? { text: `${e.reason} · ${e.message}`, events: true } : null;
  }
  const manager = () => {
    const owner = managerRaw ? ownerOf(managerRaw) : null;
    if (owner?.kind !== 'argocd' || owner.auto != null || !argoApps) return owner;
    const apps = argoApps.filter(a => a.binding.cluster_id === params.cluster && a.name === owner.app && (!owner.namespace || !a.sourceIdentity?.namespace || a.sourceIdentity.namespace === owner.namespace));
    return apps.length === 1 && apps[0].auto != null ? { ...owner, auto: apps[0].auto } : owner;
  };
  function headLines() {
    if (phase !== 'ready' || params.kind === 'events') return '';
    const why = cause(), owner = manager();
    const rows = [
      why ? { id: 'why', tone: r.status?.[0] === 'danger' ? 'error' : 'warn', attention: true, text: why.text, end: why.events && tabs.includes('events') ? C.button.render({ label: t('wake.view.eventList'), variant: 'link', action: 'wake.detail.tab', arg: 'events' }) : '' } : null,
      owner?.kind === 'argocd' ? { id: 'managed', icon: 'brand-argo', text: t('wake.rv.managed', { name: owner.app, state: t(owner.auto == null ? 'wake.rv.syncUnknown' : owner.auto ? 'wake.rv.syncOn' : 'wake.rv.syncOff') }) } : null,
      owner?.kind === 'helm' ? { id: 'managed', icon: 'brand-helm', text: t('wake.rv.helm', { name: owner.release }) } : null,
      params.kind === 'secrets' ? { id: 'values', icon: 'lock', text: t('wake.rv.secretValues') } : null,
    ];
    return C.headLines.render({ rows });
  }

  /* ---------- 조치 제안: 바꿀 값과 그 길(planFor) ---------- */
  function changes() {
    if (phase !== 'ready' || !r?.raw) return [];
    const ns = r.ns ? ` -n ${r.ns}` : '', k = params.kind, kindWord = kind?.kind?.toLowerCase(), raw = r.raw;
    const owner = managerRaw ? manager() : ownerOf(raw), gitops = owner?.kind === 'argocd' && owner.auto !== false && k !== 'pods';
    const oom = mine.some(p => p.lastExit === 'OOMKilled' || (p.containerList || []).some(c => c.last === 'OOMKilled' || c.state === 'OOMKilled'));
    const replicas = raw.spec?.replicas ?? r.desired, list = [];
    const scale = { id: 'scale', title: `Scale(${replicas} → ${replicas + 1})`, values: [{ path: 'spec.replicas', before: replicas, after: replicas + 1 }] };
    if (['deployments', 'statefulsets'].includes(k)) {
      if (gitops) { if (k === 'deployments') list.push({ id: 'revert', title: t('wake.rv.act.revert'), values: [] }); list.push(scale); }
      else {
        if (!oom) list.push({ id: 'restart', title: t('wake.rv.act.restart'), command: `kubectl rollout restart ${kindWord}/${r.name}${ns}` });
        const lim = raw.spec?.template?.spec?.containers?.[0]?.resources?.limits?.memory, mi = memMiOf(lim);
        if (oom && mi) list.push({ id: 'limits', title: t('wake.rv.act.limits'), values: [{ path: 'spec.template.spec.containers[0].resources.limits.memory', before: lim, after: `${Math.round(mi * 1.5)}Mi` }] });
        list.push(scale);
        if (k === 'deployments') list.push({ id: 'rollback', title: t('wake.rv.act.rollback'), command: `kubectl rollout undo deployment/${r.name}${ns}` });
      }
    }
    if (k === 'daemonsets' && !gitops) list.push({ id: 'restart', title: t('wake.rv.act.restart'), command: `kubectl rollout restart daemonset/${r.name}${ns}` });
    if (k === 'nodes') list.push({ id: 'cordon', title: t('wake.rv.act.cordon'), command: `kubectl cordon ${r.name}` }, { id: 'drain', title: t('wake.rv.act.drain'), command: `kubectl drain ${r.name} --ignore-daemonsets --delete-emptydir-data --timeout=10m` });
    if (k === 'cronjobs') list.push({ id: 'trigger', title: t('wake.rv.act.trigger'), command: `kubectl create job ${r.name}-manual --from=cronjob/${r.name}${ns}` },
      { id: 'suspend', title: t(r.suspend ? 'wake.rv.act.resume' : 'wake.rv.act.suspend'), values: [{ path: 'spec.suspend', before: !!r.suspend, after: !r.suspend }] });
    if (k === 'pods') list.push({ id: 'evict', title: 'Evict', command: `kubectl create --raw /api/v1/namespaces/${r.ns}/pods/${r.name}/eviction -f eviction.json` });
    return list.map(change => ({ change, plan: planFor({ resource: raw, change, owner: k === 'pods' ? null : owner }) }));
  }
  const actButton = () => (changes().length ? C.button.render({ label: t('wake.rv.act'), icon: 'group-check', variant: 'secondary', size: 'sm', round: true, menu: 'wake.detail.act' }) : '');

  /* ---------- 요약 ---------- */
  const factValue = key => {
    const v = r[key];
    if (key === 'lastSchedule' || key === 'lastSuccess') { const at = Date.parse(r[key === 'lastSchedule' ? 'lastScheduleAt' : 'lastSuccessAt']); return Number.isFinite(at) ? when(at, reference()) : ''; }
    if (key === 'suspend') return v == null ? '' : v ? 'True' : 'False';
    if (key === 'capacity' || key === 'requested') return typeof v === 'string' ? readableBytes(v) : v;
    return typeof v === 'number' ? num(v) : typeof v === 'object' ? flat(v) : v;
  };
  function statusBar() {
    const bad = ['warn', 'danger'].includes(r.status?.[0]);
    const facts = params.kind === 'pods' ? [
      { id: 'r', label: 'Ready', value: r.readyBool, priority: 4, ...(r.readyBool === 'False' && r.status?.[1] !== 'Completed' ? { tone: 'danger' } : {}) },
      { id: 's', label: 'Restarts', value: num(r.restarts ?? 0), priority: 4, ...(r.restarts > 2 ? { tone: 'danger' } : {}) },
      ...(r.node ? [{ id: 'n', label: 'Node', value: r.node, action: 'kit.navigate', arg: { address: openOf('nodes', '', r.node) } }] : []), ...(r.ip ? [{ id: 'i', label: 'IP', value: r.ip }] : []),
      ...(r.age && r.age !== 'Unknown' ? [{ id: 'a', label: 'Age', value: r.age }] : []),
      ...(r.owner ? [{ id: 'o', label: r.owner.kind, value: r.owner.name }] : []),
    ] : (HEAD_FACTS[params.kind] || kind?.facts || []).map(key => ({ key, value: factValue(key) })).filter(f => f.value != null && f.value !== '' && f.value !== 'Unknown')
      .map(({ key, value }) => ({ id: key, label: LABEL[key] || key, value: String(value), ...(key === 'ready' && r.ready < r.desired || key === 'failedPods' && r.failedPods > 0 ? { tone: key === 'failedPods' ? 'danger' : 'warn' } : {}) }));
    /* 종류의 사양·원문 값(전에는 따로 "사양 N" 카드): 시뮬레이션처럼 상태 막대를 펼치면 보이는 값으로(사용자 결정 2026-11-16) */
    const more = specItems();
    return C.summaryBar.render({ label: t('wake.detail.status'), open: 'd-st' in folded ? !folded['d-st'] : bad, ...(more.length ? { toggle: { action: 'wake.detail.fold', arg: 'd-st' }, body: C.propertyGrid.render({ items: more }) } : {}),
      items: facts }); /* 상태는 머리의 이름 옆에 한 번만(RULE-TONE): 이 막대 첫 칸에 다시 두지 않는다 */
  }
  const specItems = () => [...(kind?.spec || []).filter(k => r[k] != null && r[k] !== '' && (typeof r[k] !== 'object' || Object.keys(r[k]).length)).map(k => ({ id: 'spec:' + k, label: LABEL[k] || k, value: typeof r[k] === 'object' ? flat(r[k]) : r[k] })),
    /* 판단에 쓰는 값만: namespace는 머리 ctx에 이미 있다 */
    ...rawFacts(r, params.kind).filter(f => f.label !== 'Namespace').map(readableFact).map(f => FACT_KEY[f.label] ? { ...f, label: t(FACT_KEY[f.label]) } : f)];
  /* Pod 컨테이너 표(init 먼저): 누르면 그 컨테이너의 requests·limits · 포트 · probe */
  function containersCard() {
    const rows = r.containerList || []; if (!rows.length) return '';
    const specs = new Map([...(r.raw?.spec?.initContainers || []).map(c => [c.name, { ...c, init: true }]), ...(r.raw?.spec?.containers || []).map(c => [c.name, c])]);
    const list = [...rows].sort((a, b) => Number(!!specs.get(b.name)?.init) - Number(!!specs.get(a.name)?.init));
    const one = list.find(c => c.name === st.cOpen), spec = one && specs.get(one.name);
    const probe = p => p ? [p.httpGet ? `httpGet ${p.httpGet.path ?? ''}:${p.httpGet.port}` : p.tcpSocket ? `tcpSocket ${p.tcpSocket.port}` : p.exec ? `exec ${(p.exec.command || []).join(' ')}` : p.grpc ? `grpc ${p.grpc.port}` : '', p.periodSeconds ? `period ${p.periodSeconds}s` : ''].filter(Boolean).join(' · ') : '';
    const more = spec ? C.propertyGrid.render({ items: [
      { id: 'req', label: 'requests', value: flat(spec.resources?.requests) }, { id: 'lim', label: 'limits', value: flat(spec.resources?.limits) },
      { id: 'ports', label: t('wake.kube.port'), value: (spec.ports || []).map(p => `${p.containerPort}/${p.protocol || 'TCP'}`).join(', ') },
      ...['livenessProbe', 'readinessProbe', 'startupProbe'].map(id => ({ id, label: id, value: probe(spec[id]) })),
      { id: 'env', label: 'env', value: (spec.env || []).map(e => e.name).join(', ') }, { id: 'mnt', label: 'mount', value: (spec.volumeMounts || []).map(m => m.mountPath).join(', ') },
    ].filter(x => x.value) }) : '';
    const init = list.filter(c => specs.get(c.name)?.init).length;
    return card('d-c', t('wake.kube.containers'), [{ id: 'n', label: '', value: `${num(list.length - init)}${init ? ` · init ${init}` : ''}` }, { id: 'r', label: 'Restarts', value: num(r.restarts ?? 0) }, ...(r.raw?.status?.qosClass ? [{ id: 'q', label: 'QoS', value: r.raw.status.qosClass }] : [])],
      html`${C.dataTable.render({ clip: true, rowKey: 'name', rows: list.map(c => ({ ...c, label: specs.get(c.name)?.init ? `${c.name} (init)` : c.name, lastRestartAt: c.lastFinishedAt, lastExit: c.last })), rowAction: 'wake.detail.cOpen', activeKey: st.cOpen, reveal: true, columns: [
        { id: 'label', label: 'Name' }, { id: 'state', label: 'State', width: 'calc(var(--space-16) * 2.5)', fit: true, cell: c => status(c.status || ['neutral', c.state]) },
        restartsColumn({ width: 'var(--space-16)' }),
        { id: 'last', label: 'Last State', muted: true, optional: true, cell: c => [c.last, c.lastExitCode != null ? `Exit ${c.lastExitCode}` : ''].filter(Boolean).join(' · ') },
        { id: 'image', label: 'Image', muted: true, optional: true, cell: c => String(c.image || '').split('/').pop() }] })}${more}`, true);
  }
  /* Node의 Pod 자리: 그 위에 놓인(끝나지 않은) Pod와 allocatable pods. 같은 Pod 카드 머리에 둔다(Pod 수를 두 번 말하지 않음) */
  function nodeSlots() {
    const cap = params.kind === 'nodes' ? qty(r.raw?.status?.allocatable?.pods) : null;
    if (!cap) return [];
    const placed = mine.filter(live).length;
    return [{ id: 'l', label: 'allocatable', value: num(cap) }, { id: 'u', label: t('wake.metric.ofAllocatable'), value: `${num(Math.round(placed / cap * 100))}%`, ...(placed >= cap * .9 ? { tone: 'danger' } : {}) }];
  }
  function podsCard() {
    if (params.kind === 'pods' || !['deployments', 'statefulsets', 'daemonsets', 'jobs', 'services', 'nodes', 'replicasets'].includes(params.kind)) return '';
    if (!mine.length) return relatedRead === 'loading' ? skeletonBar('Pod', ['Pod', t('wake.rv.bad'), 'Restarts'], t('wake.res.loading')) : childCoverageRow() || '';
    const bad = mine.filter(isProblem).length, nodes = new Set(mine.map(p => p.node).filter(Boolean)).size;
    const rows = [...mine].sort(compareResources).slice(0, 12).map(p => ({ ...p, id: p.name }));
    return card('d-p', 'Pod', [{ id: 'n', label: '', value: num(mine.length) }, { id: 'b', label: t('wake.rv.bad'), value: num(bad), ...(bad ? { tone: 'warn' } : {}) }, { id: 'r', label: 'Restarts', value: num(mine.reduce((a, p) => a + (p.restarts ?? 0), 0)) }, ...(params.kind !== 'nodes' && nodes ? [{ id: 'nd', label: 'Node', value: num(nodes) }] : []), ...nodeSlots()],
      html`${childCoverageRow()}${C.dataTable.render({ clip: true, rowKey: 'id', rows, rowAction: 'wake.detail.openPod', reveal: true, columns: [{ id: 'name', label: 'Name', trim: 'middle', lead: () => ({ icon: 'k8s-pod' }) }, { id: 'status', label: 'Status', width: 'calc(var(--space-16) * 2.5)', fit: true, cell: p => status(p.status) },
        restartsColumn({ optional: true, width: 'var(--space-16)' }), ...(params.kind !== 'nodes' ? [{ id: 'node', label: 'Node', muted: true, optional: true, width: 'calc(var(--space-16) * 2)' }] : [])] })}`, bad > 0);
  }
  function conditionsCard() {
    const list = r.conditions || []; if (!list.length) return '';
    const concern = list.filter(conditionConcern);
    return card('d-cond', 'Conditions', list.slice(0, 4).map(c => ({ id: 'c-' + c.type, label: c.type, value: c.status, ...(conditionConcern(c) ? { tone: 'warn' } : {}) })),
      C.dataTable.render({ clip: true, rowKey: 'type', rows: list, reveal: true, columns: [{ id: 'type', label: 'Type', width: 'calc(var(--space-16) * 2.4)' },
        { id: 'status', label: 'Status', width: 'calc(var(--space-16) * 1.5)', fit: true, cell: c => conditionConcern(c) ? C.statusIcon.render({ kind: 'warn', text: c.status }) : C.value.render({ text: c.status ?? 'Unknown' }) },
        { id: 'reason', label: 'Reason', muted: true, optional: true, width: 'calc(var(--space-16) * 2.6)' }, { id: 'message', label: 'Message', muted: true }] }), concern.length > 0);
  }
  /* 종류별 속성: Node Capacity, Service Endpoints, Ingress 규칙, ConfigMap Data, 인스펙터(ReplicaSet · HPA · PVC), 구성(사양 값은 상태 막대 안) */
  function propsCards() {
    const out = [];
    if (params.kind === 'nodes') {
      /* one unit a resource (cpu in millicores as the metric rows, bytes readable), the used column from the metric rows' last reading and the pods running on it */
      const cap = r.raw?.status?.capacity || {}, alloc = r.raw?.status?.allocatable || {}, view = metrics.view?.key === metricKey() ? metrics.view : null;
      const lastOf = id => { const v = view?.results?.[id]?.hub?.values?.at(-1); return v ? Number(v[1]) : null; };
      const show = { cpu: v => (v == null ? '' : `${num(Math.round(v * 1000))}m`), memory: bytesText, 'ephemeral-storage': bytesText, pods: v => (v == null ? '' : num(v)) };
      const used = { cpu: lastOf('cpu'), memory: lastOf('memory'), pods: relatedRead === 'ready' ? mine.filter(live).length : null };
      const rows = ['cpu', 'memory', 'pods', 'ephemeral-storage'].filter(k => cap[k] != null || alloc[k] != null).map(k => ({ k, a: show[k](qty(alloc[k])), c: show[k](qty(cap[k])), q: show[k](used[k] ?? null) }));
      if (rows.length) out.push(card('d-cap', 'Capacity', [...(r.raw?.status?.nodeInfo?.osImage ? [{ id: 'o', label: 'OS', value: r.raw.status.nodeInfo.osImage }] : []), ...(r.raw?.status?.nodeInfo?.containerRuntimeVersion ? [{ id: 'rt', label: 'runtime', value: r.raw.status.nodeInfo.containerRuntimeVersion }] : [])],
        C.dataTable.render({ clip: true, rowKey: 'k', rows, reveal: true, columns: [{ id: 'k', label: 'Resource' }, { id: 'a', label: 'Allocatable', kind: 'number', width: 'calc(var(--space-16) * 1.6)' }, { id: 'q', label: t('wake.rv.used'), kind: 'number', width: 'var(--space-16)' }, { id: 'c', label: 'Capacity', kind: 'number', optional: true, width: 'calc(var(--space-16) * 1.4)' }] })));
    }
    if (params.kind === 'services') out.push(endpointCard());
    if (params.kind === 'ingresses' && r.backends?.length) out.push(card('d-routes', 'Rules', [{ id: 'n', label: '', value: num(r.backends.length) }], C.dataTable.render({ clip: true, rowKey: 'id', rows: r.backends.map((row, id) => ({ ...row, id })), reveal: true, columns: [
      { id: 'host', label: t('wake.kube.host') }, { id: 'path', label: t('wake.kube.path'), width: 'calc(var(--space-16) * 2)' }, { id: 'service', label: 'Service', cell: b => b.service ? link(b.service, openOf('services', r.ns, b.service)) : '' }, { id: 'port', label: t('wake.kube.port'), width: 'var(--space-16)', kind: 'number' }] })));
    if (params.kind === 'configmaps') out.push(dataCard());
    if (params.kind === 'secrets') out.push(card('d-keys', 'Data', [{ id: 'n', label: '', value: (r.keyNames || []).join(' · ') }], r.keyNames?.length ? C.dataTable.render({ clip: true, rowKey: 'k', rows: r.keyNames.map(k => ({ k })), columns: [{ id: 'k', label: t('wake.kube.key') }] }) : empty('wake.res.noData'), false));
    out.push(inspectorSections(params.kind, { C, html, t, status, r, state: inspector, card, address: (plural, name, uid) => openOf(plural, r.ns, name, uid) }));
    const conf = inspectorConfiguration(params.kind, { C, t, raw: r.raw, card });
    out.push(conf);
    return html`${out}`;
  }
  function labelsCard() {
    const labels = Object.entries(r.labels || {}), notes = Object.entries(r.annotations || {}).filter(([k]) => !/last-applied/.test(k)), taints = params.kind === 'nodes' ? r.taints || [] : [];
    if (!labels.length && !notes.length && !taints.length) return '';
    const items = [...labels.map(([k, v]) => ({ id: 'label:' + k, label: k, value: v })), ...notes.map(([k, v]) => ({ id: 'annotation:' + k, label: k, value: v })), ...taints.map((x, i) => ({ id: 'taint:' + i, label: 'Taint', value: x }))];
    return card('d-labels', params.kind === 'nodes' ? 'Labels · Taints' : 'Labels', [{ id: 'l', label: params.kind === 'nodes' ? 'Labels' : '', value: num(labels.length) }, /* the card's name is Labels: its count stands bare, as the Pod and Data cards */ ...(notes.length ? [{ id: 'a', label: 'Annotations', value: num(notes.length) }] : []), ...(taints.length ? [{ id: 'x', label: 'Taints', value: num(taints.length) }] : [])],
      C.propertyGrid.render({ items }), false);
  }
  const summary = () => html`${statusBar()}${metricBars()}${volumeBar()}${containersCard()}${podsCard()}${conditionsCard()}${propsCards()}${labelsCard()}${relatedRead !== 'ready' && params.kind !== 'pods' ? pending(relatedRead, 'wake.detail.retryResource', errors.related) : ''}`;
  function endpointCard() {
    const snapshot = relationships || (r.endpointSlices ? { items: r.endpointSlices, partial: false } : null);
    if (!snapshot) return relationshipState ? pending(relationshipState, 'wake.detail.retryResource', errors.relationship) : '';
    const rows = snapshot.items.flatMap(slice => (slice.endpoints || []).map((endpoint, index) => ({
      id: slice.metadata.uid + ':' + index, addresses: (endpoint.addresses || []).join(', '), ports: (slice.ports || []).map(port => port.port).join(', '),
      ready: endpoint.conditions?.ready === true ? ['ok', 'ready'] : endpoint.conditions?.ready === false ? ['warn', 'notReady'] : ['neutral', 'Unknown'],
      node: endpoint.nodeName || '', target: endpoint.targetRef,
    })));
    const nr = rows.filter(row => row.ready[0] !== 'ok').length;
    return card('d-ep', 'Endpoints', [{ id: 'r', label: 'Ready', value: num(rows.length - nr) }, { id: 'n', label: 'NotReady', value: num(nr), ...(nr ? { tone: 'warn' } : {}) }, ...(Object.keys(r.selector || {}).length ? [{ id: 's', label: 'selector', value: flat(r.selector) }] : [])],
      html`${snapshot.partial ? C.statusIcon.render({ kind: 'warn', text: t('wake.kube.relatedPartial') }) : ''}${rows.length ? C.dataTable.render({ clip: true, rows, rowKey: 'id', reveal: true, columns: [
        { id: 'target', label: 'Pod', cell: row => row.target?.kind === 'Pod' && row.target.uid && row.target.name && row.target.namespace === r.ns ? link(row.target.name, openOf('pods', r.ns, row.target.name, row.target.uid)) : row.target?.name || '' },
        { id: 'ready', label: 'Ready', width: 'calc(var(--space-16) * 2)', fit: true, cell: row => status(row.ready) },
        { id: 'addresses', label: 'IP:Port', muted: true, optional: true, width: 'calc(var(--space-16) * 2.5)', cell: row => [row.addresses, row.ports].filter(Boolean).join(':') }, { id: 'node', label: 'Node', muted: true, optional: true }] }) : empty('wake.res.noEndpoints')}`, nr > 0);
  }
  const configKeys = () => [...Object.keys(r?.data || {}), ...Object.keys(r?.raw?.binaryData || {})];
  function dataCard() {
    const rows = configKeys().map(key => ({ key }));
    const value = configKey !== null && (r.data?.[configKey] ?? r.raw?.binaryData?.[configKey]);
    return card('d-data', 'Data', [{ id: 'n', label: '', value: num(rows.length) }], rows.length ? html`${C.dataTable.render({ clip: true, rows, columns: [{ id: 'key', label: t('wake.kube.key') }], rowKey: 'key', rowAction: 'wake.detail.configKey', activeKey: configKey })}
      ${configKey === null || value == null ? '' : C.codeBlock.render({ path: configKey, text: String(value), file: configKey, fold: false })}` : empty('wake.res.noData'));
  }

  /* ---------- 이벤트 탭: 타임라인과 kubectl get events 표(경고만 · 전체, 공통 페이저) ---------- */
  function eventsTab() {
    const source = st.events || [], { from, to } = win();
    const all = eventSummary(source.map(eventObjectOf), { from, to }).rows, warn = all.filter(e => e.type === 'Warning');
    const list = st.warnOnly ? warn : all, pages = Math.max(1, Math.ceil(list.length / EVENT_PER)), page = Math.min(st.eventPage, pages);
    const sec = ms => Math.floor(ms / 1000), marks = changeMarks({ events: source }, { from, to });
    const tl = params.kind === 'nodes' ? '' : card('d-tl', t('wake.rv.timeline'), [{ id: 'c', label: t('wake.view.changes'), value: num(marks.filter(c => c.lane !== 'symptom').length) }, { id: 'w', label: 'Warning', value: num(warn.length) }],
      C.changeTimeline.render({ label: t('wake.rv.timeline'), from: sec(from), to: sec(to) + 60, now: sec(reference()), zoomAction: 'wake.detail.zoom', selectAction: 'wake.detail.mark', lanes: CHANGE_LANES.map(([lane, icon]) => ({ id: lane, label: t(`wake.inc.lane.${lane}`), icon })),
        marks: marks.map(c => ({ id: c.id, lane: c.lane, at: sec(c.at), tone: c.tone, tip: { time: when(c.at, reference()), kind: c.kind, title: c.title, text: c.text } })) }), warn.length > 0);
    const filter = C.listToolbar.render({ filters: C.pillTabs.render({ id: 'detail-ev', label: t('wake.list.filter'), value: st.warnOnly ? 'warn' : 'all', action: 'wake.detail.evfilter', tabs: [{ id: 'warn', label: t('wake.res.warnOnly'), count: num(warn.length) }, { id: 'all', label: t('wake.list.all'), count: num(all.length) }] }),
      ...(source.partial || eventBuffer ? { view: html`${source.partial ? C.statusIcon.render({ kind: 'warn', text: t('wake.ev.partial') }) : ''}${eventBuffer ? C.button.render({ label: t('wake.ev.new', { n: eventBuffer.changed }), action: 'wake.detail.showEvents', size: 'sm', variant: 'secondary' }) : ''}` } : {}) });
    const body = list.length ? html`${eventTable(list.slice((page - 1) * EVENT_PER, page * EVENT_PER), { now: reference(), action: 'wake.detail.openEvent' })}${C.pager.range({ page, per: EVENT_PER, total: list.length, action: 'wake.detail.eventPage' })}` : empty('wake.res.noEvents');
    return html`${tl}${filter}${card('d-e', t('wake.detail.events'), eventHead(t, list), body)}`;
  }

  /* ---------- 로그 탭: 로그 보기(원본 번호, 수준 거르기, 검색 결과와 앞뒤 줄), 20줄씩 최근 쪽부터 ---------- */
  const podCandidate = name => {
    const pod = mine.find(item => item.name === name);
    if (!pod || !['deployments', 'statefulsets', 'daemonsets', 'jobs'].includes(params.kind)) return pod;
    return relatedSubject === relatedIdentity() && podMembership(params.kind, r, [pod], relationships).items.includes(pod) ? pod : undefined;
  };
  const podRow = () => podCandidate(st.pod || mine[0]?.name);
  const logSourceKey = () => {
    const p = podRow();
    if (!p) return null;
    return JSON.stringify([params.cluster, p.ns || params.ns, p.name, p.raw?.metadata?.uid || p.uid || null, ls.container || p.containerList?.[0]?.name || '', prevOf(p), st.range, ls.source, ls.search]);
  };
  const prevOf = p => previousOf(ls, (p?.containerList || []).find(c => c.name === (ls.container || p.containerList?.[0]?.name)));
  const hasLogSnapshot = () => logSourceKey() != null && st.logs !== null && st.logKey === logSourceKey();
  function logRequest(pod) {
    const request = { ...params, pod: pod.name, ns: pod.ns || params.ns, container: ls.container || pod.containerList?.[0]?.name, previous: prevOf(pod) };
    const uid = pod.raw?.metadata?.uid || pod.uid;
    if (!uid || !pod.containerList?.some(item => item.name === request.container)) throw Object.assign(new Error('log subject unverified'), { kind: 'identity_changed' });
    const { from, to } = win(), loki = ls.source === 'loki';
    return { ...request, uid, tail: loki ? 100 : 1000 /* 받은 줄 수 판단(부분 조회)과 같은 값 */, window: { fromMs: from, toMs: Math.min(to, Date.now()) }, source: ls.source, ...(loki ? { search: ls.search } : {}) };
  }
  function boundedLogRows(rows) {
    let size = 0, count = 0;
    for (const line of rows) { size += logEncoder.encode(line).byteLength + (count ? 1 : 0); if (size > LOG_BYTE_LIMIT || count >= LOG_ROW_LIMIT) break; count++; }
    return rows.slice(0, count);
  }
  function logsTab() {
    const p = podRow();
    if (!p) return childCoverageRow() || empty('wake.res.noPods');
    const cs = p.containerList || [], c = ls.container || cs[0]?.name, all = hasLogSnapshot() ? parseLogs(st.logs) : [], m = logModel(all, ls), loki = ls.source === 'loki';
    const scope = mine.length > 1 ? C.select.render({ value: p.name, icon: 'k8s-pod', menu: 'wake.detail.pods', label: 'Pod', width: 'calc(var(--space-40) + var(--space-10))' }) : '';
    const body = hasLogSnapshot() ? undefined : st.read === 'ready' || st.read === 'loading' ? C.statusIcon.render({ kind: 'busy', text: t('wake.res.loading') }) : pending(st.read, 'wake.detail.retry', errors.tab);
    const empty0 = /Pending|ContainerCreating|ImagePull/.test(p.status?.[1] || '') ? 'wake.rv.notStarted' : logMeta?.outsideRetention ? 'wake.log.outsideRetention' : logMeta?.unverifiedStream ? 'wake.log.streamUnverified' : undefined;
    return html`${logToolbar(t, ls, m, all, { scope, loki, busy: st.read === 'loading', counted: hasLogSnapshot(), partial: hasLogSnapshot() && !!logMeta?.partial })}${logCard(t, ls, m, p, c, { containers: cs, cur: cs.find(x => x.name === c), loki, sources: hasService(), partial: logMeta?.partial, tail: logMeta?.tail, body, empty: empty0 })}`;
  }

  /* ---------- 롤아웃(Deployment): ReplicaSet revision과 마지막 변경 / 실행 기록(CronJob) ---------- */
  function rolloutTab() {
    const items = relationships?.items || [];
    if (!items.length) return relationshipState ? pending(relationshipState, 'wake.detail.retryResource', errors.relationship) : empty('wake.res.noData');
    const rows = items.map(({ metadata, status: observed, spec }) => ({ id: metadata.uid || metadata.name, name: metadata.name, revision: Number(metadata.annotations?.['deployment.kubernetes.io/revision']) || 0,
      ready: observed?.readyReplicas ?? 0, image: spec?.template?.spec?.containers?.map(c => String(c.image || '').split('/').pop()).join(', '), created: Date.parse(metadata.creationTimestamp) }))
      .sort((a, b) => b.revision - a.revision);
    const [now, prev] = rows, diff = now && prev && now.image !== prev.image ? C.codeBlock.render({ path: `${r.name} · rev ${prev.revision} → rev ${now.revision}`, text: ['@@ spec.template.spec.containers @@', `- image: ${prev.image}`, `+ image: ${now.image}`].join('\n'), diff: true }) : '';
    return html`${diff ? card('d-roll', t('wake.rv.rolloutLog'), [{ id: 'r', label: 'Revision', value: `${prev.revision} → ${now.revision}` }, ...(r.strategy ? [{ id: 's', label: t('wake.rv.strategy'), value: r.strategy }] : [])], diff) : ''}
      ${card('d-rs', 'ReplicaSet', [{ id: 'r', label: t('wake.rv.currentRev'), value: String(now?.revision || '') }], C.dataTable.render({ clip: true, rowKey: 'id', rows, reveal: true, columns: [
        { id: 'revision', label: 'Revision', kind: 'number', width: 'var(--space-16)', cell: x => String(x.revision || '') }, { id: 'name', label: 'Name', cell: x => link(x.name, openOf('replicasets', r.ns, x.name)) },
        { id: 'ready', label: 'Pods', kind: 'number', width: 'var(--space-16)', cell: x => num(x.ready) }, { id: 'image', label: 'Image', muted: true, optional: true },
        { id: 'created', label: 'Created', time: true, optional: true, width: 'calc(var(--space-16) * 1.6)', cell: x => Number.isFinite(x.created) ? when(x.created, reference()) : '' }] }))}`;
  }
  function runsTab() {
    const list = inspector.rows || { items: [], total: 0 };
    if (inspector.read !== 'ready') return pending(inspector.read === 'loading' ? 'loading' : inspector.read, 'wake.detail.retryResource', errors.inspector);
    const ok = list.items.filter(j => j.status?.[1] === 'Complete').length, bad = list.items.filter(j => j.status?.[0] === 'danger').length;
    return card('d-run', t('wake.detail.runs'), [{ id: 's', label: 'Schedule', value: r.schedule || '' }, ...(r.concurrency ? [{ id: 'c', label: 'Concurrency Policy', value: r.concurrency }] : []), { id: 'h', label: t('wake.rv.okFail'), value: `${num(ok)} · ${num(bad)}`, ...(bad ? { tone: 'warn' } : {}) }],
      list.items.length ? C.dataTable.render({ clip: true, rowKey: 'name', rows: list.items, reveal: true, columns: [
        { id: 'name', label: 'Job', cell: j => link(j.name, openOf('jobs', r.ns, j.name, j.uid)) }, { id: 'status', label: t('wake.inc.list.result'), width: 'calc(var(--space-16) * 2)', fit: true, cell: j => status(j.status) },
        { id: 'startTime', label: t('wake.inspector.start'), time: true, optional: true, width: 'calc(var(--space-16) * 2)', cell: j => Number.isFinite(Date.parse(j.startTime)) ? when(Date.parse(j.startTime), reference()) : '' },
        { id: 'duration', label: t('wake.inc.list.took'), kind: 'number', optional: true, width: 'calc(var(--space-16) * 1.4)' }] }) : empty('wake.inspector.emptyJobs'));
  }
  const yamlTab = () => (!st.yaml ? empty('wake.res.noData') : card('d-yaml', 'YAML', [...(r.revision ? [{ id: 'r', label: 'Revision', value: String(r.revision) }] : []), ...(r.raw?.metadata?.resourceVersion ? [{ id: 'v', label: 'resourceVersion', value: r.raw.metadata.resourceVersion }] : [])],
    C.codeBlock.render({ path: `${r.ns ? r.ns + '/' : ''}${kind?.kind}/${r.name}.yaml`, text: st.yaml, syntax: 'yaml', file: `${r.name}.yaml`, wrap: true,
      head: C.button.render({ label: t('wake.res.hideManaged'), size: 'xs', variant: st.managed ? 'ghost' : 'secondary', action: 'wake.detail.managed' }) })));

  /* ---------- 관련: 검증된 소유 참조와 selector/backend 참조의 흐름 그래프(받아들인 샌키 규칙). 노드를 누르면 그 상세 → 관련 리소스 표(SCR-RESOURCE-RELATIONS-01) ---------- */
  const RELATED_KINDS = ['pods', 'deployments', 'statefulsets', 'daemonsets', 'replicasets', 'jobs', 'services', 'ingresses', 'horizontalpodautoscalers'];
  const RELATED_LISTS = ['services', 'horizontalpodautoscalers', 'ingresses'], POD_STATE_LISTS = ['deployments', 'cronjobs', 'nodes'];
  /* 같은 namespace의 Service·HPA·Ingress(관련 리소스 표의 출처). 종류마다 따로 실패를 보존한다 */
  async function readRelated(id, options) {
    if (!RELATED_KINDS.includes(params.kind)) { relatedLists = { failed: [] }; return true; }
    const ns = r.ns || params.ns, results = await Promise.allSettled(RELATED_LISTS.map(k => data.get('resources', { ...queryParams, kind: k, ns }, options)));
    if (disposed || id !== tabRequest) return false;
    relatedLists = { failed: [] };
    results.forEach((x, i) => { if (x.status === 'fulfilled') relatedLists[RELATED_LISTS[i]] = Array.isArray(x.value) ? x.value : []; else relatedLists.failed.push({ kind: RELATED_LISTS[i], error: x.reason }); });
    /* Pod 상세: 소유자의 소유자(Deployment·CronJob)와 실행 Node의 상태를 그 목록에서(A3-10). 읽지 못하면 상태 칸만 빈다 */
    if (params.kind === 'pods') {
      const extra = await Promise.allSettled(POD_STATE_LISTS.map(k => data.get('resources', { ...queryParams, kind: k, ns: KIND_OF[k]?.cluster ? '_all' : ns }, options)));
      if (disposed || id !== tabRequest) return false;
      relatedLists.objects = Object.fromEntries(POD_STATE_LISTS.map((k, i) => [k, extra[i].status === 'fulfilled' && Array.isArray(extra[i].value) ? extra[i].value : []]));
    }
    return true;
  }
  function relatedOwners() {
    if (params.kind !== 'pods') return [];
    const ns = ownerBasis().namespace;
    return ownerEntries().filter(entry => entry.state === 'verified').flatMap(entry => {
      const grand = (entry.resource?.raw?.metadata?.ownerReferences || []).find(ref => ref.controller);
      return [{ kind: entry.ref.kind, name: entry.ref.name, ns, uid: entry.ref.uid, status: entry.resource.status }, ...(grand ? [{ kind: grand.kind, name: grand.name, ns, uid: grand.uid, status: null }] : [])];
    });
  }
  function relatedCard() {
    if (!relatedLists) return RELATED_KINDS.includes(params.kind) ? skeletonBar(t('wake.rv.related'), 1, t('wake.res.loading')) : '';
    const rows = relatedResources(params.kind, r, { mine, owners: relatedOwners(), replicasets: params.kind === 'deployments' ? relationships?.items || [] : [],
      services: relatedLists.services || [], hpas: relatedLists.horizontalpodautoscalers || [], ingresses: relatedLists.ingresses || [], objects: relatedLists.objects || {} });
    const failed = relatedLists.failed.map(x => C.statusIcon.render({ kind: Number(x.error?.status) === 403 || x.error?.kind === 'forbidden' ? 'perm' : 'error', text: readFailure(t, x.error, KIND_LIST.find(k => k.plural === x.kind)?.kind) }));
    if (!rows.length && !failed.length) return '';
    return card('d-related', t('wake.rv.related'), [{ id: 'n', label: '', value: num(rows.length) }], html`${failed}${rows.length ? C.dataTable.render({ clip: true, rowKey: 'id', rows, reveal: true, columns: [
      { id: 'kind', label: 'Kind', width: 'calc(var(--space-16) * 1.4)', cell: x => KIND_OF[x.plural]?.short || x.kind },
      { id: 'name', label: 'Name', cell: x => (x.nameOnly ? x.name : link(x.name, openOf(x.plural, x.ns, x.name, x.uid))) }, /* Secret은 이름만: 읽지 않으므로 상세로 가지 않음 */
      { id: 'relation', label: t('wake.rv.relation'), muted: true, optional: true, cell: x => t('wake.detail.relation.' + x.relation) },
      { id: 'status', label: 'Status', width: 'calc(var(--space-16) * 2.5)', fit: true, cell: x => (x.status ? status(x.status) : '') }] }) : ''}`);
  }
  const relations = () => {
    const noOwner = params.kind === 'pods' && !ownerBasis().refs.length, g = noOwner ? null : graphOf();
    const flow = noOwner ? C.emptyState.render({ variant: 'card', icon: 'k8s-pod', title: t(ownerBasis().known ? 'wake.detail.owner.none' : 'wake.detail.owner.unread') })
      : g ? C.chartCard.render({ bleed: true, title: t('wake.detail.relations'), hideTitle: true, caption: [...new Set(g.links.map(l => l.label))].join(' · '), body: C.flowGraph.render(g) }) : childCoverage() ? '' : C.emptyState.render({ variant: 'card', icon: 'k8s-replicaset', title: t('wake.res.noRelations') });
    return html`${childCoverageRow()}${flow}${relatedCard()}`;
  };
  const toState = s => !s ? 'idle' : s[0] === 'ok' || s[1] === 'Completed' ? 'ok' : s[0] === 'danger' ? 'fail' : 'warn';
  const fillVars = (text, vars) => text.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
  function graphOf() {
    const cols = [], iconOf = kindName => KIND_LIST.find(item => item.kind === kindName)?.icon, node = (col, id, label, sub, s, addr, ariaLabel, ico) => { (cols[col] ||= []).push({ id, col, label, ariaLabel, sub, icon: ico, state: toState(s), ...(addr ? { action: 'kit.navigate', arg: { address: addr } } : {}) }); return id; };
    const links = [];
    const SPLIT_ICON = { ok: 'status-ok', warn: 'status-fix', fail: 'status-error' }, SPLIT_STATUS = { ok: 'ok', warn: 'warn', fail: 'danger' };
    /* Pod를 상태 묶음으로: from은 노드 하나 또는 Pod마다 그 소유 노드(ReplicaSet)를 고르는 함수, col은 묶음 칸 */
    const split = (list, from, relation, col = 1) => {
      const by = { ok: [], warn: [], fail: [] };
      list.forEach(p => by[toState(p.status) === 'ok' ? 'ok' : toState(p.status) === 'fail' ? 'fail' : 'warn'].push(p));
      for (const key of ['ok', 'warn', 'fail']) if (by[key].length) {
        const id = 'split-' + key, sources = new Map();
        node(col, id, t('wake.detail.split.' + key), fillVars(t('wake.detail.split.count'), { n: by[key].length }), [SPLIT_STATUS[key]], null, undefined, SPLIT_ICON[key]);
        for (const p of by[key]) { const source = typeof from === 'function' ? from(p) : from; sources.set(source, (sources.get(source) || 0) + 1); }
        for (const [source, n] of sources) links.push([source, id, relation, undefined, n]);
      }
    };
    if (params.kind === 'pods') {
      const entries = ownerEntries(), grandOf = entry => entry.state === 'verified' ? (entry.resource?.raw?.metadata?.ownerReferences || []).find(ref => ref.controller) || entry.resource?.raw?.metadata?.ownerReferences?.[0] : null;
      const deep = entries.some(grandOf), first = deep ? 1 : 0, grands = new Set();
      node(first + 1, r.raw?.metadata?.uid || r.name, r.name, r.status?.[1] || 'Pod', r.status, podAddr(r), undefined, kind?.icon);
      entries.forEach((entry, index) => {
        const grand = grandOf(entry), grandId = grand && (grand.uid || JSON.stringify([grand.kind, grand.name]));
        const ref = entry.ref, definition = ownerDefinition(ref), verified = entry.state === 'verified';
        const id = ref.uid || JSON.stringify([ref.kind, ref.name, index]);
        const grandPlural = KIND_LIST.find(k => k.kind === grand?.kind)?.plural, grandStatus = grand ? (relatedLists?.objects?.[grandPlural] || []).find(x => x.name === grand.name)?.status ?? null : null;
        if (grand && !grands.has(grandId)) { grands.add(grandId); node(0, grandId, grand.name, grand.kind, grandStatus, null, undefined, iconOf(grand.kind)); }
        node(first, id, ref.name || t('wake.detail.owner.unread'), [ref.kind, ownerStateText(entry.state), ctx.query.at === undefined || !verified ? '' : t('wake.detail.owner.currentRead')].filter(Boolean).join(' · '), verified ? entry.resource.status : null,
          verified ? anchor(A('cluster', params.cluster, 'ns', definition.cluster ? '_all' : ownerBasis().namespace, definition.plural, ref.name)) : null, undefined, definition?.icon || iconOf(ref.kind));
        /* 띠마다 그 띠가 나르는 Pod 수(이 Pod 하나): 워크로드 상세의 띠와 같은 수 규칙(A3-10) */
        if (grand) links.push([grandId, id, 'owner', grandStatus ? undefined : 'idle', 1]);
        links.push([id, r.raw?.metadata?.uid || r.name, 'owner', verified ? toState(entry.resource.status) : 'idle', 1]);
      });
    } else if (params.kind === 'services') {
      node(0, 'svc', r.name, `Service · ${r.type}`, ['ok'], null, undefined, kind?.icon);
      split(mine, 'svc', 'selector');
    } else if (['deployments', 'statefulsets', 'daemonsets', 'jobs'].includes(params.kind)) {
      node(0, 'w', r.name, kind.kind, r.status, null, undefined, kind?.icon);
      /* Deployment → ReplicaSet → Pod: Pod를 소유한 ReplicaSet(관계 읽기, UID)을 가운데 칸에 */
      const controllerUid = p => (p.ownerReferences || p.raw?.metadata?.ownerReferences || []).find(ref => ref.controller)?.uid;
      const sets = params.kind === 'deployments' ? (relationships?.items || []).filter(raw => mine.some(p => controllerUid(p) === raw.metadata?.uid)) : [];
      for (const raw of sets) {
        const row = rowOf('replicasets', raw);
        node(1, raw.metadata.uid, raw.metadata.name, 'ReplicaSet', row.status, openOf('replicasets', raw.metadata.namespace, raw.metadata.name, raw.metadata.uid), undefined, iconOf('ReplicaSet'));
        links.push(['w', raw.metadata.uid, 'owner', undefined, mine.filter(p => controllerUid(p) === raw.metadata.uid).length]); /* the pods this set carries: the same count and width rule as the set's bands to its pods */
      }
      if (sets.length) split(mine.filter(p => sets.some(raw => raw.metadata.uid === controllerUid(p))), controllerUid, 'owner', 2);
      else split(mine, 'w', 'owner');
    } else if (params.kind === 'ingresses') {
      node(0, 'ing', r.name, 'Ingress', r.status, null, undefined, kind?.icon);
      (r.backends || []).forEach((b, i) => { node(1, 's' + i, b.service, `Service · ${b.host}${b.path}`, ['ok'], anchor(A('cluster', params.cluster, 'ns', r.ns, 'services', b.service)), undefined, iconOf('Service')); links.push(['ing', 's' + i, 'backend']); });
    } else if (params.kind === 'nodes') {
      node(0, 'node', r.name, 'Node', r.status, null, undefined, kind?.icon);
      split(mine, 'node', 'node');
    } else return null;
    if (!links.length) return null;
    const TILE = 56, GAP = 44, LABEL_H = 44, BAND = 28, STEP = 170, used = cols.filter(Boolean), BAR = TILE, X = used.map((_, i) => i * STEP), nodes = [];
    used.forEach((list, c) => { let y = 8; for (const n of list) { nodes.push({ ...n, col: c, y, h: BAR }); y += BAR + GAP; } });
    const by = Object.fromEntries(nodes.map(n => [n.id, n])), outAt = {}, inAt = {};
    const weightOf = a => links.filter(l => l[0] === a).reduce((sum, l) => sum + (l[4] || 0), 0);
    const L = links.map(([a, b, relation, relationState, weight]) => { const to = by[b], size = weight ? Math.max(8, Math.round(TILE * weight / weightOf(a))) : Math.max(8, Math.round(BAND / links.filter(l => l[0] === a).length));
      const l = { label: t(`wake.detail.relation.${relation}`), from: a, to: b, fromOffset: outAt[a] || 0, toOffset: inAt[b] || 0, size: Math.min(size, weight ? TILE : BAND), value: weight ? String(weight) : relation === 'owner' && to.col === used.length - 1 ? to.sub : '', state: relationState || (to.state === 'fail' ? 'fail' : to.state === 'warn' ? 'warn' : 'ok'), active: false }; outAt[a] = (outAt[a] || 0) + l.size; inAt[b] = (inAt[b] || 0) + l.size; return l; });
    const height = Math.max(...nodes.map(n => n.y + n.h)) + LABEL_H;
    return { mode: 'relation', stretch: true, label: t('wake.detail.relations'), width: X.at(-1) + Math.max(TILE, tokenPx('--fl-label-under-max') ?? TILE), height, columns: X, bar: TILE, gap: tokenPx('--fl-tile-gap') ?? 0, radii: { outer: tokenPx('--fl-tile-r-outer') ?? 0, inner: tokenPx('--fl-tile-r-inner') ?? 0 }, nodes, links: L };
  }

  /* ---------- 이벤트 상세(시뮬레이션 eventDetail) ---------- */
  function eventDetail() {
    const e = r, ref = e.object || {}, at = Date.parse(e.at), first = Date.parse(e.firstAt), day = reference() - 86400000;
    const instance = e.raw?.reportingInstance || e.raw?.source?.host || '';
    const subject = eventSubjectAddress(e, params.cluster, ctx.query.at);
    const target = subject ? C.listToolbar.render({ scope: C.button.render({ label: `${ref.kind} ${ref.name}`, icon: KIND_LIST.find(k => k.kind === ref.kind)?.icon ?? 'k8s-pod', variant: 'secondary', size: 'sm', round: true, action: 'kit.navigate', arg: { address: subject } }) }) : '';
    const stamp = ms => (Number.isFinite(ms) ? `${new Date(ms).toISOString().slice(0, 10) === new Date(reference()).toISOString().slice(0, 10) ? '' : when(ms, 0).slice(0, 10) + ' '}${hms(ms)}` : '');
    const head = C.summaryBar.render({ label: t('wake.view.events'), items: [{ id: 'n', label: 'Count', value: num(e.count ?? 1) }, { id: 'f', label: 'First Seen', value: stamp(first) }, { id: 'l', label: 'Last Seen', value: stamp(at) }, ...(e.source ? [{ id: 's', label: 'Source', value: e.source }] : []), ...(instance ? [{ id: 'i', label: t('wake.rv.instance'), value: instance }] : [])] });
    const msg = e.message ? card('ev-msg', 'Message', [], C.answerText.render({ blocks: [{ p: [e.message] }] })) : '';
    const now = subjectNow == null ? '' : subjectNow === 'gone' ? C.statusIcon.render({ kind: 'idle', text: t('wake.rv.eventGone', { kind: ref.kind }) })
      : C.statusIcon.render({ kind: { ok: 'ok', warn: 'warn', danger: 'error' }[subjectNow.status?.[0]] ?? 'idle', text: t('wake.rv.eventNow', { kind: ref.kind, st: subjectNow.status?.[1] ?? '' }) });
    const rows = allEvents ? eventSummary(allEvents.map(eventObjectOf), { from: day, to: reference() + 1 }).rows : [];
    const same = rows.filter(x => x.kind === ref.kind && x.name === ref.name && x.ns === (ref.ns ?? ''));
    const sameBar = allEvents ? card('ev-same', t('wake.rv.sameTarget'), [{ id: 'd', label: '', value: t('wake.rv.h24') }, ...eventHead(t, same)], same.length ? eventTable(same.slice(0, 20), { now: reference(), action: 'wake.detail.openEvent' }) : empty('wake.res.noEvents')) : '';
    const sameReason = rows.filter(x => x.reason === e.reason), objs = new Set(sameReason.map(x => `${x.kind}/${x.ns}/${x.name}`)).size;
    const reasonBar = allEvents ? card('ev-reason', t('wake.rv.sameReason'), [{ id: 'n', label: t('wake.rv.h24'), value: num(sameReason.reduce((a, x) => a + x.count, 0)) }, { id: 'o', label: 'Object', value: num(objs) }],
      C.button.render({ label: t('wake.rv.reasonList', { reason: e.reason }), icon: 'arrow-up-right', variant: 'link', action: 'kit.navigate', arg: { address: `${A('cluster', params.cluster, 'ns', '_all', 'events')}?${new URLSearchParams({ reason: e.reason, type: e.type })}` } }), false) : '';
    const rel = [];
    const job = /(?:Created|Deleted) job (\S+)/.exec(e.message || '')?.[1], pod = /(?:Created pod: |pod: )(\S+)/.exec(e.message || '')?.[1];
    if (job) rel.push({ kind: 'Job', name: job, plural: 'jobs', why: /Deleted/.test(e.message) ? t('wake.rv.deletedBy') : t('wake.rv.createdBy') });
    if (pod) rel.push({ kind: 'Pod', name: pod, plural: 'pods', why: t('wake.rv.createdBy') });
    const owner = subjectNow && subjectNow !== 'gone' ? subjectNow.owner : null;
    if (owner?.name) rel.push({ kind: owner.kind, name: owner.name, plural: KIND_LIST.find(k => k.kind === owner.kind)?.plural, why: 'Owner' });
    const host = e.raw?.source?.host; if (host && ref.kind !== 'Node') rel.push({ kind: 'Node', name: host, plural: 'nodes', why: t('wake.rv.reporterNode') });
    const relBar = rel.length ? card('ev-rel', t('wake.rv.related'), [{ id: 'n', label: '', value: num(rel.length) }], C.dataTable.render({ clip: true, rowKey: 'id', rows: rel.map((x, i) => ({ ...x, id: 'r' + i })), reveal: true, columns: [
      { id: 'kind', label: 'Kind', width: 'calc(var(--space-16) * 1.4)' }, { id: 'name', label: 'Name', cell: x => x.plural ? link(x.name, openOf(x.plural, ref.ns, x.name)) : x.name }, { id: 'why', label: t('wake.rv.relation'), muted: true, optional: true }] })) : '';
    const yaml = e.raw ? card('ev-yaml', 'YAML', e.raw.metadata?.resourceVersion ? [{ id: 'v', label: 'resourceVersion', value: e.raw.metadata.resourceVersion }] : [], C.codeBlock.render({ path: `${e.ns || 'default'}/Event/${e.name}.yaml`, syntax: 'yaml', text: toYaml(e.raw), wrap: true }), false) : '';
    return html`${target}${head}${msg}${now}${sameBar}${reasonBar}${relBar}${yaml}`;
  }

  const BODY = { summary, events: eventsTab, logs: logsTab, rollout: rolloutTab, runs: runsTab, yaml: yamlTab, relations };
  function watchEvents() {
    clearInterval(eventTimer);
    const document = globalThis.document;
    if (!document || !eventSubject(r) || ctx.query.at !== undefined) return;
    const requestId = tabRequest;
    const keyOf = event => event.uid || JSON.stringify([event.ns, event.name]);
    const older = (event, displayed) => (Date.parse(event.at) || 0) < (Date.parse(displayed.at) || 0) || event.at === displayed.at && event.count < displayed.count;
    eventTimer = setInterval(async () => {
      if (disposed || document.hidden || eventRefreshPending || st.tab !== 'events' || !st.events || requestId !== tabRequest) return;
      eventRefreshPending = true;
      try {
        const rows = await readEvents({ signal: tabController.signal });
        if (disposed || requestId !== tabRequest) return;
        const before = new Map(st.events.map(event => [keyOf(event), event]));
        let changed = 0;
        const updated = rows.map(event => { const previous = before.get(keyOf(event)); if (previous && older(event, previous)) return previous; if (!previous || event.at !== previous.at || event.count !== previous.count) changed++; return event; });
        if (changed) { eventBuffer = { changed, rows: Object.assign(updated, { partial: rows.partial === true }) }; ctx.update(); }
      } catch { /* 배경 새로 읽기가 실패해도 보이는 이벤트는 그대로 */ } finally { eventRefreshPending = false; }
    }, 10000);
  }
  async function load({ background = false } = {}) {
    stopMetrics();
    clearInterval(eventTimer); eventBuffer = null;
    tabController?.abort(); tabController = new AbortController();
    const options = { signal: tabController.signal }, id = ++tabRequest, tab = st.tab;
    if (phase !== 'ready' || (relatedRead !== 'ready' && !['yaml', 'events', 'summary'].includes(tab) && !(params.kind === 'pods' && ['relations', 'logs'].includes(tab))) || disposed) return;
    if (tab === 'events' && OWNING.includes(params.kind) && relatedRead === 'loading') { st.read = 'loading'; st.events = null; ctx.update(); return; } /* 관계 읽기가 끝나면 loadResource가 다시 부른다 */
    const logKey = tab === 'logs' ? logSourceKey() : null;
    if (tab !== 'logs' || !hasLogSnapshot()) { st.logs = null; logMeta = null; }
    st.logKey = logKey;
    st.read = ['yaml', 'logs', 'events'].includes(tab) && !(tab === 'logs' && background) ? 'loading' : 'ready';
    if (tab !== 'yaml') st.yaml = null;
    if (tab !== 'events') st.events = null;
    ctx.update();
    try {
      let result;
      if (tab === 'summary' && METRIC_KINDS.includes(params.kind)) { void loadMetrics(); return; }
      if (tab === 'relations' && params.kind === 'pods' && !await loadOwners(id, options)) return;
      if (tab === 'relations' && !await readRelated(id, options)) return;
      if (tab === 'yaml') result = await data.get('yaml', { ...params, uid: r.raw?.metadata?.uid || r.uid, managedFields: st.managed }, options);
      if (tab === 'logs') {
        const pod = podRow();
        if (!pod) { st.read = 'ready'; ls.follow = false; clearInterval(timer); ctx.update(); return; }
        result = await data.get('logs', logRequest(pod), options);
      }
      if (tab === 'events') result = await readEvents(options);
      if (disposed || id !== tabRequest) return;
      if (tab === 'yaml') st.yaml = result;
      if (tab === 'logs') {
        if (logKey !== logSourceKey()) { st.logs = null; st.logKey = null; st.read = 'cancelled'; ls.follow = false; clearInterval(timer); ctx.update(); return; }
        const snapshot = typeof result === 'string' ? { text: result } : result, text = snapshot?.text;
        if (typeof text !== 'string') throw new Error('invalid log snapshot');
        const { text: _, ...meta } = snapshot, rows = text ? text.split('\n') : [], kept = boundedLogRows(rows.slice().reverse()).reverse(), tail = ls.source === 'loki' ? 100 : 1000;
        /* 줄 수 상한(tail)까지 받았으면 구간의 앞부분은 읽지 않은 것: 로그 화면과 같은 부분 조회(R4-04, A2-21).
           상한에 닿았는지는 백엔드가 구간으로 거르기 전에 받은 줄로 말한다(limitReached, R5-02). 구간 없는 읽기(글 그대로)만 받은 줄로 센다 */
        const limit = logLimitReached(meta, rows.length, tail);
        st.logs = kept.join('\n'); logMeta = { ...meta, partial: meta.partial || kept.length !== rows.length || limit, tail: limit ? Math.min(tail, kept.length) : null };
      }
      if (tab === 'events') { st.events = result; st.warnOnly ??= !ctx.query.event && result.some(event => event.type === 'Warning'); watchEvents(); }
      st.read = 'ready';
    } catch (e) {
      if (disposed || id !== tabRequest) return;
      if (tab === 'logs') { if (logKey !== logSourceKey() || e?.kind === 'identity_changed') { st.logs = null; st.logKey = null; logMeta = null; } ls.follow = false; }
      st.read = tab === 'logs' && e?.kind === 'response_too_large' ? 'logSize' : tab === 'logs' && e?.kind === 'unconfigured' ? 'lokiUnavailable' : failure(e); errors.tab = e;
      clearInterval(timer);
    }
    ctx.update();
  }
  const follow = () => {
    clearInterval(timer);
    if (ls.follow && !prevOf(podRow()) && st.tab === 'logs' && phase === 'ready') timer = setInterval(() => { if (st.read !== 'loading') void load({ background: true }); }, 3000);
  };
  const meta = () => ({ title: params.kind === 'events' && r?.reason ? r.reason : params.name, icon: kind?.icon, context: phase === 'ready' ? { icon: kind?.icon, title: r.name, sub: [kind?.cluster || params.ns === '_all' ? '' : params.ns, params.cluster].filter(Boolean).join(' · ') } : { icon: 'status-idle', title: stateText(phase), sub: '' } });
  /* Node 머리(A-12, RULE-TONE): Ready와 스케줄 가능 여부를 이름 옆 상태 하나로. 정상은 아이콘(이름 Ready), cordon이면 둘 다 글자(kubectl STATUS와 같은 말) */
  const nodeState = () => {
    const ready = (r.raw?.status?.conditions || []).find(c => c.type === 'Ready')?.status === 'True', cordoned = !!r.raw?.spec?.unschedulable;
    const words = [ready ? 'Ready' : 'NotReady', ...(cordoned ? ['SchedulingDisabled'] : [])].join(' · ');
    return !ready ? ['danger', words] : cordoned ? ['warn', words] : ['ok', words];
  };
  const selectTab = tab => { if (tab !== st.tab && detailScroll) detailScroll.scrollTop = 0; st.tab = tab; };
  const TAB_LABEL = { summary: 'wake.detail.summary', events: 'wake.detail.events', logs: 'wake.detail.logs', rollout: 'wake.detail.rollout', runs: 'wake.detail.runs', relations: 'wake.detail.relations' };
  const ranged = () => params.kind !== 'events' && (st.tab === 'events' || st.tab === 'logs' || st.tab === 'summary' && METRIC_KINDS.includes(params.kind) && !!metricBars());
  const detailHeader = () => C.pageColumn.render({ width: 'list', header: true, children: html`
    ${C.pageHeader.render({ icon: kind?.icon, title: params.kind === 'events' && r?.reason ? r.reason : r?.name || params.name, tip: params.kind === 'events' && r?.reason ? r.reason : r?.name || params.name,
      context: [kind?.kind, params.kind === 'events' ? r?.ns : params.ns === '_all' || kind?.cluster ? '' : params.ns, params.cluster].filter(Boolean).join(' · '), size: 'sm',
      after: phase === 'ready' ? (params.kind === 'events' ? status([r.type === 'Warning' ? 'warn' : 'neutral', r.type]) : params.kind === 'nodes' ? status(nodeState()) : r.status === null ? '' : status(r.status || ['neutral', 'Unknown'])) : '',
      end: phase === 'ready' && params.kind !== 'events' ? html`${liveStale ? C.statusIcon.render({ kind: 'idle', text: t('wake.list.stale') }) : ''}${actButton()}` : '' })}
    ${headLines()}
    ${phase === 'ready' && params.kind !== 'events' ? C.listToolbar.render({ filters: C.pillTabs.render({ id: 'detail-tab', label: t('wake.rv.view'), value: st.tab, action: 'wake.detail.tab', tabs: tabs.map(id => ({ id, label: id === 'yaml' ? 'YAML' : t(TAB_LABEL[id]) })) }), ...(ranged() ? { time: rangeControl() } : {}) }) : ''}` });
  const detailBody = () => phase !== 'ready' ? pending(phase, 'wake.detail.retryResource', errors.phase) : params.kind === 'events' ? eventDetail() : html`
    ${params.kind === 'pods' && ['summary', 'relations'].includes(st.tab) ? html`${st.tab === 'summary' ? summary() : relations()}${relatedRead !== 'ready' ? pending(relatedRead, 'wake.detail.retryResource', errors.related) : ''}`
      : relatedRead !== 'ready' && !['summary', 'yaml', 'events'].includes(st.tab) && !(params.kind === 'pods' && st.tab === 'logs') ? pending(relatedRead, 'wake.detail.retryResource', errors.related)
      : st.tab === 'logs' ? logsTab() : st.read === 'ready' ? (BODY[st.tab] || summary)() : pending(st.read, 'wake.detail.retry', errors.tab)}
    ${C.listToolbar.render({ scope: C.button.render({ label: t('wake.action.ask'), icon: 'ai', variant: 'ghost', size: 'sm', round: true, action: 'wake.detail.ask' }) })}`;
  void loadResource();
  return {
    render: () => html`${detailHeader()}${C.pageColumn.render({ width: 'list', children: detailBody(), scroll: true })}`,
    meta,
    afterRender: element => { element.dataset.wakeView = 'detail'; detailScroll = element.querySelector('[data-scroll="content"]'); },
    actions: {
      'wake.detail.retryResource': () => loadResource(),
      'wake.detail.retry': () => { void load(); follow(); },
      'wake.detail.fold': a => { folded[a.arg] = !a.open; },
      'wake.detail.tab': a => { selectTab(a.arg?.value ?? a.arg); if (st.tab === 'logs') ls.previous = null; follow(); void load(); },
      'wake.detail.range': a => { st.range = a.preset ? { preset: a.preset } : { from: a.from, to: a.to, live: !!a.live }; st.eventPage = 1; ls.page = null; void load(); },
      'wake.detail.zoom': a => { if (Number.isFinite(a.from) && Number.isFinite(a.to)) { st.range = { from: Math.floor(a.from), to: Math.ceil(a.to), live: false }; st.eventPage = 1; void load(); } },
      'wake.detail.mark': a => { const e = (st.events || []).find(x => `ev:${x.uid}` === a.arg); const to = e && eventAddress(e, params.cluster, ctx.query.at); if (to) ctx.api.navigate(to); },
      'wake.detail.cOpen': a => { st.cOpen = st.cOpen === a.arg ? null : a.arg; ctx.update(); },
      'wake.detail.openPod': a => { const p = mine.find(x => x.name === a.arg); if (p) ctx.api.navigate(podAddr(p)); },
      'wake.detail.openEvent': a => { const [obj, reason] = String(a.arg).split('|'), [k, ns, ...name] = obj.split('/');
        const e = [...(params.kind === 'events' ? allEvents || [] : st.events || [])].filter(x => x.object?.kind === k && (x.object?.ns ?? '') === ns && x.object?.name === name.join('/') && x.reason === reason).sort((x, y) => Date.parse(y.at) - Date.parse(x.at))[0];
        const to = e && eventAddress(e, params.cluster, ctx.query.at); if (to) ctx.api.navigate(to); },
      ...logActions(() => ls, (patch, after) => { Object.assign(ls, patch); if (after === 'read') { follow(); void load(); } else { if (after === 'follow') follow(); ctx.update(); } },
        { download: () => downloadText(`${podRow()?.name || params.name}${ls.container ? '-' + ls.container : ''}${prevOf(podRow()) ? '.previous' : ''}.log`, st.logs) }),
      'wake.detail.pod': a => { const v = a.arg?.value ?? a.arg; if (!podCandidate(v)) return; st.pod = v; ls.container = ''; ls.previous = null; ls.page = null; follow(); void load(); },
      'wake.detail.evfilter': a => { st.warnOnly = (a.arg?.value ?? a.arg) === 'warn'; st.eventPage = 1; ctx.update(); },
      'wake.detail.eventPage': a => { st.eventPage = Number(a.arg?.value ?? a.arg); ctx.update(); },
      'wake.detail.showEvents': () => { if (eventBuffer) { st.events = eventBuffer.rows; eventBuffer = null; st.eventPage = 1; ctx.update(); } },
      'wake.detail.configKey': a => { if (configKeys().includes(a.arg)) { configKey = a.arg; ctx.update(); } },
      'wake.detail.managed': () => { st.managed = !st.managed; load(); },
      'wake.detail.ask': () => phase === 'ready' && ctx.api.openPanel({ prompt: t('wake.list.askRow', { target: [kind?.kind, r.ns, r.name].filter(Boolean).join(' ') }) }),
      'wake.detail.plan': a => { const x = changes().find(c => c.change.id === (a.arg?.value ?? a.arg)); if (!x) return; const p = x.plan;
        ctx.api.openPanel({ prompt: t('wake.rv.act.prompt', { title: x.change.title, target: [kind?.kind, r.ns, r.name].filter(Boolean).join(' '), how: p.route === 'pr' ? `Draft PR · ${[p.app, p.repo, p.path].filter(Boolean).join(' · ')}` : p.command || '' }) }); },
    },
    menus: {
      ...logMenus(t, () => ls),
      'wake.detail.act': () => ({ align: 'end', items: changes().map(({ change, plan }) => ({ id: 'act-' + change.id, label: { raw: plan.route === 'pr' ? `${change.title} PR` : change.title }, icon: plan.route === 'pr' ? 'git-pull-request' : 'terminal', action: 'wake.detail.plan', arg: change.id })) }),
      'wake.detail.pods': () => ({ items: mine.map(p => ({ id: 'p-' + p.name, label: { raw: p.name }, icon: 'k8s-pod', checked: p.name === st.pod, action: 'wake.detail.pod', arg: p.name })) }),
    },
  };
}, { scroll: false });
