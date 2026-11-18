/*
 * Wake 데이터 공급(DataSource). get(key, params) -> Promise.
 * 'live'는 데스크톱 메인 프로세스 서비스(apps/wake/desktop/services.cjs), 'http'는 Wake 서버(같은 키를 /api/<key>로 읽음).
 * 앱 안에 견본 자료는 없다. 출처가 아직 없는 자료 키는 그 출처 이름과 함께 "연결 안 됨"(kind 'unconfigured')으로 거절한다.
 */
import { KIND_LIST, KIND_OF, rowOf, isProblem, summaryOf, toYaml, cpuM, memMi } from './kinds.js';
import { TOOL_KINDS } from './tool-kinds.js';
import { clusterMetadata, readClusterCatalog } from './live.js';
import { parseForbidden } from './perm.js';
import { service, onService, hasService, text, createRequestGate, createLiveFeed } from '../../../kit/page/index.js';

/* ---------- 클러스터 자료: 실제 클러스터(메인 프로세스가 읽은 원본)가 종류 표(kinds.js)를 지남 ---------- */
export const kindsGroups = (count = () => null) => ['Workloads', 'Network', 'Storage', 'Config', 'Cluster'].map(group => ({ group, items: KIND_LIST.filter(k => k.group === group && k.plural !== 'events').map(k => ({ kind: k.kind, short: k.short, plural: k.plural, api: k.api, icon: k.icon, cluster: !!k.cluster, ...count(k) })) }));
const kindInfo = plural => { const k = KIND_OF[plural]; return k ? { kind: k.kind, short: k.short, plural: k.plural, api: k.api, icon: k.icon, tabs: k.tabs, columns: k.columns, facts: k.facts || [], spec: k.spec || [], cluster: !!k.cluster } : null; };
/* 허브 읽기 서비스(desktop/reads): 실패는 { error, source }로 오고 여기서 화면이 아는 오류로 바꾼다(연결 안 됨은 kind 'unconfigured' + 빠진 출처) */
const HUB_ERROR = { forbidden: 403, http_401: 401, http_403: 403 };
const hubRead = call => call.then(r => {
  if (!r?.error) return r;
  throw Object.assign(new Error(`hub read failed: ${r.error}`), { kind: r.error === 'unconfigured' ? 'unconfigured' : HUB_ERROR[r.error] ? 'forbidden' : r.error, source: r.source, ...(HUB_ERROR[r.error] ? { status: HUB_ERROR[r.error] } : {}) });
});
/* 메인 프로세스 공급원: list(kind, ns) -> 원본[], get(kind, ns, name), logs(ns, name, o), summary() -> 원본 묶음, namespaces().
   이벤트는 허브의 7일 보관(events.read: 보관한 것 + 지금 것) */
/* service: 이 문서가 같은 읽기를 공유하는 서비스 호출, live: 공유 watch 목록과 짧게 다시 쓰는 읽기(createLiveReads) */
const realApi = (id, service, live = null) => ({
  /* Secret은 읽지 않는다(D-01): 화면은 권한 없음. 그 밖의 목록은 공유 watch 구독(없으면 kube.list 한 번) */
  list: async (kind, ns) => {
    if (kind === 'secrets') throw Object.assign(new Error('Secret is not read by Wake'), { kind: 'forbidden', status: 403 });
    return (await live?.list(id, kind, ns)) ?? service('kube.list', { id, kind, ns });
  },
  relationships: ({ kind, ns, name, uid }) => service('kube.relationships', { id, kind, ns, name, uid }),
  eventSnapshot: async (ns, subjectUid) => (!subjectUid && await live?.events(id, ns)) || hubRead(service('events.read', { id, ns, ...(subjectUid ? { subjectUid } : {}) })),
  /* 오브젝트 하나(상세): 그 종류·namespace의 공유 watch 목록에서(문서가 구독, 밀려온 차이가 곧 상세의 새 값). managedFields가 필요한 YAML,
     watch가 없는 호스트, 목록 권한 없이 get만 되는 경우는 kube.get */
  get: async (kind, ns, name, o = {}) => {
    if (!o.managedFields && live && kind !== 'secrets' && kind !== 'events') { /* 이벤트 watch는 보관용으로 줄인 모양 */
      const items = await live.list(id, kind, ns).catch(() => null);
      /* 목록 항목에는 apiVersion·kind가 없다: 그 목록의 종류로 앞에 되살린다(kubectl get -o yaml과 같은 머리) */
      const x = items?.find(o => o?.metadata?.name === name && (KIND_OF[kind]?.cluster || !ns || ns === '_all' || o.metadata.namespace === ns));
      if (items) return x && KIND_OF[kind] ? { apiVersion: KIND_OF[kind].api, kind: KIND_OF[kind].kind, ...x } : x ?? null;
    }
    return service('kube.get', { id, kind, ns, name, managedFields: !!o.managedFields });
  },
  logs: async (ns, name, o = {}) => {
    const args = { id, ns, name, container: o.container, previous: !!o.previous,
      tail: o.tail, ...(o.window ? { uid: o.uid, window: o.window } : {}) };
    const read = async extra => {
      const result = o.source === 'loki' ? await service('loki.logs', { ...args, search: o.search, cursor: o.cursor }) : await service('kube.logs', { ...args, ...extra });
      if (result?.error) throw Object.assign(new Error('failed to read pod logs'), { kind: result.error });
      return result;
    };
    /* 따라가기: 같은 Pod·컨테이너의 다음 구간은 이미 가진 마지막 줄부터만 읽는다(창 전체를 다시 받지 않음) */
    return o.window && o.source !== 'loki' && !o.previous && live ? live.logs(args, read) : read();
  },
  summary: () => service('kube.summary', { id }),
  namespaces: () => service('kube.list', { id, kind: 'namespaces' }),
});
/* CPU·메모리 사용률(%): 사용량 합 / 할당 가능 합(사용량을 못 읽으면 없음) */
const usageOf = (nodes, usage) => { if (!usage?.length || !nodes?.length) return null; const by = Object.fromEntries(usage.map(u => [u.metadata.name, u.usage])), live = nodes.filter(n => by[n.metadata.name]);
  const sum = (f, g) => live.reduce((a, n) => a + f(g(n)), 0);
  const measure = (key, parse, scale, unit) => {
    const used = sum(parse, n => by[n.metadata.name][key]);
    const allocatable = sum(parse, n => n.status.allocatable[key]);
    return { used: used / scale, allocatable: allocatable / scale, unit };
  };
  const cpu = measure('cpu', cpuM, 1, 'mCPU');
  const memory = measure('memory', memMi, 1024, 'GiB');
  const percent = ({ used, allocatable }) => Math.round(100 * used / allocatable);
  return { cpu: percent(cpu), memory: percent(memory), amounts: { cpu, memory } };
};

function requestReferenceMs(value) {
  const parts = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) throw new RangeError('invalid observation reference');
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const offsetHour = Number(parts[7] || 0), offsetMinute = Number(parts[8] || 0);
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) throw new RangeError('invalid observation reference');
  const parsedMs = Date.parse(value);
  if (!Number.isFinite(parsedMs)) throw new RangeError('invalid observation reference');
  return parsedMs;
}
function timeBasis(api, observedAt = api.observedAt) {
  const receivedAtMs = Date.now(), parsedMs = observedAt === undefined ? receivedAtMs : Date.parse(observedAt);
  const state = !Number.isFinite(parsedMs) ? 'invalid' : parsedMs > receivedAtMs ? 'future' : 'valid';
  const requestedAt = api.requestedAt ?? null, requestedMs = requestedAt === null ? null : requestReferenceMs(requestedAt);
  if (requestedMs !== null && requestedMs > receivedAtMs) throw new RangeError('invalid observation reference');
  const nowMs = requestedMs ?? (state === 'valid' ? parsedMs : NaN);
  return { mode: api.observedAt === undefined ? 'live' : 'snapshot', source: api.source || 'kubernetes-api', state, rawObservedAt: observedAt ?? null,
    reference: requestedAt !== null ? 'request-anchor' : observedAt === undefined ? 'client-received' : api.observedAt === undefined ? 'response-observed' : 'fixed-snapshot',
    requestedAt, referenceAt: Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : null,
    observedAt: state === 'valid' ? new Date(parsedMs).toISOString() : null, timezone: 'UTC',
    warningWindow: Number.isFinite(nowMs) ? { start: new Date(nowMs - 3600e3).toISOString(), end: new Date(nowMs).toISOString(), endInclusive: true, startInclusive: false } : null };
}
function observedRow(api, kind, object, basis = timeBasis(api)) {
  return { ...rowOf(kind, object, basis.referenceAt ? Date.parse(basis.referenceAt) : NaN), timeBasis: basis };
}

async function eventRowsOf(api, input) {
  const subject = input.subject;
  if (input.name && (!subject?.uid || subject.name !== input.name)) {
    throw Object.assign(new Error('event subject identity unavailable'), { kind: 'unverified' });
  }
  const result = await api.eventSnapshot(input.ns, subject?.uid);
  const basis = timeBasis(api);
  const byIdentity = new Map();
  for (const object of Array.isArray(result) ? result : result.items) {
    const row = observedRow(api, 'events', object, basis), ref = row.object;
    if (subject && (ref.uid !== subject.uid || ref.kind !== subject.kind || ref.name !== subject.name || ref.ns !== subject.ns || ref.apiVersion && ref.apiVersion !== subject.apiVersion)) continue;
    const key = row.uid || JSON.stringify([row.ns, row.name]);
    const prior = byIdentity.get(key);
    if (!prior || Date.parse(row.at) > Date.parse(prior.at) || row.at === prior.at && row.count > prior.count) byIdentity.set(key, row);
  }
  const rows = [...byIdentity.values()].sort((left, right) => (Date.parse(right.at) || 0) - (Date.parse(left.at) || 0));
  Object.defineProperty(rows, 'timeBasis', { value: basis });
  return result.partial === true ? Object.assign(rows, { partial: true }) : rows;
}

/* namespace마다 객체 수(범위 고르기 메뉴의 수): 같은 목록에서 세고 다시 읽지 않는다. 클러스터 범위 객체는 namespace가 없어 빠진다 */
const countByNs = rows => { const by = {}; for (const r of rows) if (r.ns) by[r.ns] = (by[r.ns] ?? 0) + 1; return by; };
/* 클러스터 열쇠 -> 자료(한 공급원 위에 같은 계산) */
const CLUSTER_KEYS = {
  namespaces: (a) => a.namespaces(),
  kinds: async (a, p) => {
    const kinds = KIND_LIST.filter(k => k.plural !== 'events');
    const results = await Promise.allSettled(kinds.map(k => a.list(k.plural, p.ns).then(list => list.map(object => observedRow(a, k.plural, object)))));
    const by = new Map(kinds.map((kind, index) => [kind.plural, results[index]]));
    /* Node는 namespace가 없다: namespace마다 그 namespace의 Pod가 도는 Node 이름(범위 목록과 같은 Node→Pod 관계, A3-13) */
    const podRows = by.get('pods')?.status === 'fulfilled' ? by.get('pods').value : [];
    const nodesByNs = {}; for (const p of podRows) if (p.ns && p.node) (nodesByNs[p.ns] ??= new Set()).add(p.node);
    return kindsGroups(kind => { const result = by.get(kind.plural); return result.status === 'fulfilled'
      ? { count: result.value.length, problems: result.value.filter(isProblem).length, readStatus: 'ok', byNs: countByNs(result.value), ...(kind.plural === 'nodes' ? { namesByNs: Object.fromEntries(Object.entries(nodesByNs).map(([ns, set]) => [ns, [...set]])) } : {}) }
      : { readStatus: result.reason?.status === 403 ? 'forbidden' : 'error', error: result.reason }; });
  },
  resources: async (a, p) => {
    if (p.kind === 'events') return eventRowsOf(a, p);
    const objects = await a.list(p.kind, p.ns), basis = timeBasis(a);
    return objects.map(o => observedRow(a, p.kind, o, basis));
  },
  resource: async (a, p) => { const o = await a.get(p.kind, p.ns, p.name); return o ? { ...observedRow(a, p.kind, o), raw: o } : { name: p.name, status: ['neutral', 'Unknown'], missing: true }; },
  events: eventRowsOf,
  relationships: (api, p) => api.relationships?.(p) || null,
  yaml: async (a, p) => { const o = await a.get(p.kind, p.ns, p.name, { managedFields: p.managedFields }); if (p.uid && o?.metadata?.uid !== p.uid) throw Object.assign(new Error('resource UID changed'), { kind: 'identity_changed' }); return o ? toYaml(o, { managedFields: !!p.managedFields }) : ''; },
  logs: (a, p) => a.logs(p.ns, p.pod || p.name, { container: p.container, previous: p.previous, tail: p.tail, window: p.window, uid: p.uid, source: p.source, search: p.search, cursor: p.cursor }),
  /* 홈 요약: 사용률, Node, Pod 단계별, 최근 경고 이벤트 */
  summary: async a => { const r = await a.summary(), basis = timeBasis(a, r.observedAt); const s = summaryOf({ pods: r.pods || [], nodes: r.nodes || [], events: r.events || [] }, basis.referenceAt ? Date.parse(basis.referenceAt) : NaN);
    return { timeBasis: basis, version: r.version, namespaces: r.namespaces, nodes: r.nodes ? s.nodes : null, pods: r.pods ? s.pods : null, warnings: r.events && basis.state === 'valid' ? s.warnings : null, usage: usageOf(r.nodes, r.usage) }; },
};

/* 출처 이름(화면 글): 고유 이름은 그대로, Wake 저장소는 사전 키 */
const SOURCE_LABEL = { prometheus: { raw: 'Prometheus' }, alertmanager: { raw: 'Alertmanager' }, loki: { raw: 'Loki' }, kubernetes: { raw: 'Kubernetes API' }, incidentStore: 'wake.src.incidentStore',
  auditStore: 'wake.ailog.source', ai: { raw: 'AI' } };
/** "<출처> 연결 안 됨" 글(Text 값) */
export const sourceOff = source => ({ key: 'wake.view.toolOff', vars: { tool: SOURCE_LABEL[source] ?? { raw: String(source) } } });
/** 출처가 없는 자료의 거절: kind 'unconfigured'(화면의 연결 안 됨), source(빠진 출처) */
export const unconnected = (key, source) => Object.assign(new Error(`data source not connected: ${key}`), { kind: 'unconfigured', source });

/* 허브 인시던트·감사·AI 저장소(desktop/hub.cjs). 글 값 { $t: 사전 키, vars }는 여기서 화면 사전으로 바꾼다(said, AI 이벤트도 같이 씀). 서비스 호스트가 없으면 그 저장소의 연결 안 됨 */
export const said = value => {
  if (Array.isArray(value)) return value.map(said);
  if (value && typeof value === 'object') {
    if (typeof value.$t === 'string') return text({ key: value.$t, vars: said(value.vars ?? {}) });
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, said(v)]));
  }
  return value;
};
const hubStore = (source, read) => (hasService() ? read().then(said) : Promise.reject(Object.assign(new Error(`data source not connected: ${source}`), { kind: 'unconfigured', source })));
const HUB_KEYS = {
  incidents: p => hubStore('incidentStore', () => service('incident.list', p.cluster ? { cluster: p.cluster } : {})),
  incident: p => hubStore('incidentStore', () => service('incident.workspace', { cluster: p.cluster, id: p.id })),
  audit: p => hubStore('auditStore', () => service('audit.query', { cluster: p.cluster })),
  'ai.conversations': p => hubStore('ai', () => service('ai.conversations', p.id ? { id: p.id } : {})),
  /* 내 자료 내보내기·지우기(지우기는 confirm: true일 때만 허브가 지움) */
  dataExport: () => hubStore('incidentStore', () => service('data.export', {})),
  dataDelete: p => hubStore('incidentStore', () => service('data.delete', { confirm: p.confirm === true })),
};

/* 데스크톱에서 kubeconfig에 있는 실제 context(첫 실행에서 연결한 클러스터)는 메인 프로세스 서비스로 읽음 */
/* 조회 실패와 사라진 context는 그대로 거절한다. 다음 조회는 kubeconfig를 다시 읽어 재시도한다.
   readContexts: 성공한 kube.read를 kubeconfig가 바뀔 때(kube-changed)까지 다시 쓰는 읽기(createLiveReads) */
const realContext = async (id, service, readContexts = () => service('kube.read', {})) => {
  if (!hasService()) throw new Error(`no service host for cluster: ${id}`);
  /* 다시 쓴 목록에 없는 context는 새로 읽어 확인한다(방금 더한 context를 옛 목록으로 거절하지 않음) */
  let c = (await readContexts()).contexts.find(x => x.id === id);
  if (!c) c = (await readContexts(true)).contexts.find(x => x.id === id);
  if (!c) throw new Error(`unknown cluster: ${id}`);
  return c;
};
/* 도구 찾기 한 번을 도구 목록과 권한이 같이 씀(같은 클러스터를 잠깐 동안 다시 묻지 않음) */
const toolsSeen = new Map();
const toolDiscoveryRequests = new WeakMap();
const toolsOf = ({ cluster: id, discovery, refresh }) => {
  if (discovery) {
    if (!toolDiscoveryRequests.has(discovery)) toolDiscoveryRequests.set(discovery, service('tools.find', refresh === true ? { id, refresh: true } : { id }));
    return toolDiscoveryRequests.get(discovery);
  }
  const cached = toolsSeen.get(id);
  if (cached && Date.now() - cached.at < 3000) return cached.p;
  const p = service('tools.find', { id });
  toolsSeen.set(id, { at: Date.now(), p });
  return p;
};
const REAL = {
  cluster: async (p, c) => {
    let catalog = null;
    void readClusterCatalog().then(value => { catalog = value; });
    const r = await service('kube.probe', { id: p.cluster });
    const presentation = clusterMetadata(c, catalog);
    return { id: p.cluster, ctx: p.cluster, presentation, server: c?.server || '', state: r.state === 'ok' ? 'ok' : r.state === 'forbidden' ? 'warn' : 'off', kind: c?.provider || 'kubernetes', where: c?.server || '', version: r.version || '', agent: false, perm: 'read', ns: r.namespace || 'default', real: true }; },
  access: p => service('kube.access', { id: p.cluster }),
  /* exec 인증 명령 동의(셸 문서에서만 받음): kube.read 행의 execConsent { state, command, args }를 사람에게 보인 뒤 허락할 때 */
  execConsent: p => service('kube.execConsent', { id: p.cluster, allow: true }),
  /* 보관 정책(허브): 도구 하나·클러스터 하나의 받아 둔 자료 잊기. 화면 단추는 사용자 승인 뒤 */
  forgetSource: p => service('hub.forgetSource', { cluster: p.cluster, source: p.source }),
  forgetCluster: p => service('hub.forgetCluster', { cluster: p.cluster }),
  /* 에이전트: DaemonSet rollout(agent.status)에 Node별 heartbeat Lease(agent.heartbeat)를 더함. heartbeat 읽기 실패는 beatLookup으로 남김 */
  /* 설치 안 됨이면 앱이 설치할 차트의 이미지 상태(agent.prep image)를 installImage로: 공개되지 않았으면 화면이 설치 단추 대신 그 이유를 말함(R4-02). 못 읽으면 null(모름) */
  agent: p => Promise.all([service('agent.status', { id: p.cluster }), service('agent.heartbeat', { id: p.cluster }).catch(() => ({ lookup: 'error' }))])
    .then(async ([status, beat]) => (status.lookup === 'absent' ? { ...status, installImage: await service('agent.prep', {}).then(r => (r?.exists ? r.image ?? null : null), () => null) }
      : status.lookup !== 'present' ? status : { ...status, beatLookup: beat.lookup, version: beat.version ?? status.version,
      heartbeat: beat.heartbeat ?? null, nodes: beat.nodes ?? null, watch: beat.watch ?? null, rules: beat.rules ?? null })),
  agentBeats: p => service('agent.heartbeat', { id: p.cluster }).then(beat => ({ at: beat.at, samples: beat.samples ?? [] })),
  /* 클러스터 안에서 찾은 도구: 준비된 Pod가 있으면 연결됨, 바깥 주소(Ingress)가 없으면 포트 포워딩, 웹 화면이 없으면 Grafana에서 봄 */
  /* 찾기 자체가 실패(권한 없음·시간 초과·응답 이상)하면 빈 목록이 아니라 거절: 화면은 0개와 읽기 실패를 나눠 보인다(일부만 읽은 partial은 값) */
  clusterTools: p => toolsOf(p).then(r => { if (!['ok', 'partial'].includes(r.access)) throw Object.assign(new Error(`tool discovery failed: ${r.access}`), { kind: r.access, ...(r.access === 'forbidden' ? { status: 403 } : {}) }); return r; }).then(r => r.list.map(x => ({ ...x, svc: [x.ns, x.svc].filter(value => typeof value === 'string' && value).join('/') + (Number.isInteger(x.port) && x.port > 0 && x.port <= 65535 ? ':' + x.port : ''), raw: x, state: x.ready ? 'ok' : 'found', open: !x.ui ? { via: 'grafana' } : x.url ? { via: 'ingress', url: x.url } : { via: 'port-forward' } }))),
  /* 도구를 찾을 권한: ok, forbidden(실제로 막힌 권한과 함께) */
  toolAccess: p => toolsOf(p).then(r => ({ access: r.access, need: r.access === 'forbidden' ? parseForbidden(r.error, { resource: 'services' }) : null })),
  gitops: p => service('gitops.read', { id: p.cluster }),
  /* OpenCost 연결 상태(저장된 연결 기록): 설정 › 도구 행과 비용 화면이 같은 사실 */
  costState: p => service('costs.state', { id: p.cluster }),
  /* 허브 읽기(desktop/reads): 화면은 이름 붙은 시리즈·대상·구간만 보낸다(PromQL 없음) */
  metricSeries: p => hubRead(service('metrics.range', { id: p.cluster, series: p.series, ...(p.target ? { target: p.target } : {}), from: p.from, to: p.to, step: p.step })),
  usage: p => hubRead(service('metrics.usage', { id: p.cluster, kind: p.kind })),
  alerts: p => hubRead(service('alerts.read', { id: p.cluster })),
  alertExpr: p => hubRead(service('alerts.expr', { id: p.cluster, rule: p.rule, from: p.from, to: p.to, step: p.step })),
  network: p => hubRead(service('network.read', { id: p.cluster, from: p.from, to: p.to, step: p.step })),
  logLevels: p => hubRead(service('logs.levels', { id: p.cluster, ns: p.ns, pod: p.pod, ...(p.container ? { container: p.container } : {}), from: p.from, to: p.to })),
  toolChecks: p => hubRead(service('tool.checks', { id: p.cluster, kind: p.kind })),
  sourceStates: p => hubRead(service('hub.sources', { id: p.cluster, ...(p.refresh ? { refresh: true } : {}) })).then(r => r.sources),
};

/* ---------- 공유 watch 목록과 짧게 다시 쓰는 읽기(데스크톱 메인 프로세스 kube-watch.cjs) ----------
   목록 하나(클러스터·종류·namespace)는 문서마다 구독 하나: 처음 한 번 전체(snapshot), 그 뒤로는 메인 프로세스가 묶어 보낸 차이(kube-watch)만 반영한다.
   숨은 문서는 구독을 모두 닫고(다시 보이면 갱신이 다시 연다), IDLE_MS 동안 아무 읽기도 쓰지 않은 목록은 닫는다(가장 최근 갱신이 쓴 목록은 남김).
   메인 프로세스가 kube.watch를 모르면(시험·옛 호스트) 이 문서는 kube.list로 읽는다 */
const WATCH_IDLE_MS = 60_000, HISTORY_MS = 300_000, CONTEXT_MS = 60_000;
const objectKey = o => (o?.metadata?.namespace ? o.metadata.namespace + '/' : '') + (o?.metadata?.name ?? '');
const logTime = line => { const at = line.indexOf(' '); return at < 0 ? NaN : Date.parse(line.slice(0, at)); };
function createLiveReads(service) {
  const stores = new Map(), bySub = new Map(), followers = new Set(), history = new Map(), logCache = new Map();
  let off = false, wired = false, seq = 0, sweeper = null, contexts = null;
  const doc = () => globalThis.document;
  const canPush = () => hasService() && typeof globalThis.kitService?.on === 'function' || typeof globalThis.kitShell?.on === 'function';
  const usable = () => !off && hasService() && canPush() && typeof doc()?.addEventListener === 'function';
  function wire() {
    if (wired || !canPush()) return; wired = true;
    onService((event, p) => {
      if (event === 'kube-changed') { contexts = null; return; }
      if (event !== 'kube-watch') return;
      const store = bySub.get(p?.sub);
      if (!store) return;
      if (p.closed) { drop(store, false); notify(store.id); return; }
      if (!store.live) { store.early.push(p); return; }
      apply(store, p); notify(store.id);
    });
    doc()?.addEventListener?.('visibilitychange', () => { if (doc().hidden) for (const store of [...stores.values()]) drop(store, true); });
  }
  function apply(store, p) {
    if (!(p.seq > store.seq)) return;
    store.seq = p.seq;
    if (p.resync) store.items = new Map((p.items || []).map(o => [objectKey(o), o]));
    for (const c of p.changes || []) if (c.t === 'd') store.items.delete(c.k); else store.items.set(c.k, c.o);
    if (p.state) store.state = p.state;
  }
  const notify = id => { for (const f of followers) if (f.cluster === id) f.feed.notify(); };
  function drop(store, close) {
    if (stores.get(store.key) !== store) return;
    stores.delete(store.key); bySub.delete(store.sub);
    if (close && store.live) service('kube.watch', { op: 'close', sub: store.sub }).catch(() => {});
  }
  function sweep() {
    const kept = new Set([...followers].flatMap(f => [...f.lastPass]));
    for (const store of [...stores.values()]) if (Date.now() - store.touched > WATCH_IDLE_MS && !kept.has(store.key)) drop(store, true);
    if (!stores.size) { clearInterval(sweeper); sweeper = null; }
  }
  function open(id, kind, ns) {
    const key = JSON.stringify([id, kind, ns]);
    const known = stores.get(key);
    if (known) return known;
    wire();
    const sub = 'w' + (++seq) + '-' + Math.random().toString(36).slice(2, 8);
    const store = { key, id, kind, ns, sub, items: new Map(), state: null, seq: 0, live: false, early: [], touched: Date.now() };
    stores.set(key, store); bySub.set(sub, store);
    store.ready = service('kube.watch', { op: 'open', id, kind, ns, sub }).then(r => {
      if (!r || !Array.isArray(r.items)) throw Object.assign(new Error('watch unavailable'), { fallback: ['invalid_request', 'target', 'capacity'].includes(r?.error) ? 'once' : 'off' });
      store.items = new Map(r.items.map(o => [objectKey(o), o])); store.seq = r.seq ?? 0; store.state = r.state ?? null; store.live = true;
      for (const p of store.early.splice(0)) apply(store, p);
    });
    store.ready.catch(() => drop(store, false));
    if (!sweeper) { sweeper = setInterval(sweep, WATCH_IDLE_MS / 2); sweeper.unref?.(); } /* 정리 타이머만으로 프로세스(시험)를 붙잡지 않는다 */
    return store;
  }
  /** 목록: 구독한 캐시의 객체들(null이면 호출자가 kube.list). 첫 목록을 읽지 못한 구독은 그 실패로 거절 */
  async function list(id, kind, ns) {
    if (!usable()) return null;
    const scope = KIND_OF[kind]?.cluster || !ns ? '_all' : ns;
    const store = open(id, kind, scope);
    try { await store.ready; } catch (error) { if (error?.fallback !== 'once') off = true; return null; }
    store.touched = Date.now();
    for (const f of followers) if (f.reading) f.pass.add(store.key);
    const state = store.state?.state;
    if ((state === 'error' || state === 'forbidden' || state === 'loading') && !store.items.size) {
      const status = store.state.error?.status ?? (state === 'forbidden' ? 403 : null);
      throw Object.assign(new Error(`kubernetes list failed${status ? ` (HTTP ${status})` : ''}`), { kind: state === 'forbidden' ? 'forbidden' : store.state.error?.kind || 'unknown', ...(status ? { status } : {}) });
    }
    return [...store.items.values()];
  }
  /** 이벤트: 보관 이력(events.read)은 HISTORY_MS마다 한 번, 지금 이벤트는 공유 watch. 같은 UID는 지금 것이 이긴다 */
  async function events(id, ns) {
    if (!usable()) return null;
    const key = JSON.stringify([id, ns || '_all']);
    let past = history.get(key);
    if (!past || Date.now() - past.at > HISTORY_MS) { past = { at: Date.now(), read: hubRead(service('events.read', { id, ns })) }; history.set(key, past); past.read.catch(() => history.delete(key)); }
    const [kept, current] = await Promise.all([past.read, list(id, 'events', ns || '_all')]);
    if (!current) return null;
    const by = new Map((kept.items || []).map(e => [e.metadata?.uid, e]));
    for (const e of current) by.set(e.metadata?.uid, e);
    return { items: [...by.values()], partial: !!kept.partial };
  }
  /** 로그 구간: 같은 Pod·컨테이너·UID·줄 수의 앞 결과가 있으면 그 마지막 줄 시각부터만 읽어 붙인다 */
  async function logs(args, read) {
    const key = JSON.stringify([args.id, args.ns, args.name, args.container, args.uid, args.tail]), prior = logCache.get(key), { fromMs, toMs } = args.window;
    const keep = (lines, partial, limitReached) => { logCache.delete(key); logCache.set(key, { lines, partial, limitReached, toMs, lastMs: Math.max(fromMs, ...lines.map(logTime).filter(Number.isFinite)) });
      if (logCache.size > 4) logCache.delete(logCache.keys().next().value); };
    try {
      if (!prior || prior.toMs <= fromMs || prior.toMs > toMs) {
        const full = await read();
        if (typeof full?.text === 'string' && !full.outsideRetention) keep(full.text ? full.text.split('\n') : [], !!full.partial, !!full.limitReached); else logCache.delete(key);
        return full;
      }
      const since = Math.max(fromMs, prior.lastMs);
      const delta = await read({ window: { fromMs: since, toMs } });
      if (typeof delta?.text !== 'string' || delta.outsideRetention) { logCache.delete(key); return delta; }
      const fresh = delta.text ? delta.text.split('\n') : [], seen = new Set(prior.lines.filter(line => logTime(line) >= since));
      const merged = [...prior.lines.filter(line => logTime(line) >= fromMs), ...fresh.filter(line => !seen.has(line))];
      /* 줄 수 상한: 앞 결과나 이번 조각이 상한에 닿았거나(거르기 전 받은 줄, limitReached), 붙인 줄이 상한을 넘음 */
      const limitReached = !!prior.limitReached || !!delta.limitReached || merged.length > args.tail;
      const lines = merged.slice(-args.tail), partial = prior.partial || limitReached;
      keep(lines, partial, limitReached);
      return { ...delta, text: lines.join('\n'), window: { fromMs, toMs }, partial, limitReached };
    } catch (error) { logCache.delete(key); throw error; }
  }
  function follow(cluster, read, every) {
    const f = { cluster, reading: false, pass: new Set(), lastPass: new Set() };
    f.feed = createLiveFeed({ every, read: async () => {
      f.reading = true; f.pass = new Set();
      try { return await read(); } finally { f.reading = false; f.lastPass = f.pass; }
    } });
    return { start() { followers.add(f); wire(); f.feed.start(); }, stop() { followers.delete(f); f.feed.stop(); }, tick: () => f.feed.tick() };
  }
  /* kube.read: 이벤트를 들을 수 있으면 성공을 kubeconfig가 바뀔 때(또는 CONTEXT_MS)까지 다시 쓴다. 실패는 다시 쓰지 않는다 */
  function readContexts(fresh = false) {
    if (!canPush()) return service('kube.read', {});
    wire();
    if (!fresh && contexts && Date.now() - contexts.at < CONTEXT_MS) return contexts.read;
    const entry = { at: Date.now(), read: service('kube.read', {}) };
    contexts = entry;
    entry.read.catch(() => { if (contexts === entry) contexts = null; });
    return entry.read;
  }
  return { list, events, logs, follow, contexts: readContexts };
}

export function createDataSource(mode = 'live') {
  if (mode === 'http') {
    return { get: async (key, params = {}, o = {}) => {
      const r = await fetch(`/api/${key}?${new URLSearchParams(params)}`, { signal: o.signal });
      if (!r.ok) throw Object.assign(new Error(`${key}: ${r.status}`), { status: r.status });
      return r.json();
    } };
  }
  /* 한 화면(문서)의 같은 읽기가 진행 중이면 그 응답을 같이 쓴다: 종류 수와 그 종류의 행, 이벤트 화면의 변경 표시, 범위 관계가 한 갱신에서 같은 목록을 한 번만 읽는다.
     동시 요청 수의 상한은 메인 프로세스가 클러스터마다 둔다(desktop/provider-connections.cjs) */
  const gate = createRequestGate({ limit: Infinity });
  const shared = (name, args) => gate.run(JSON.stringify([name, args]), '', () => service(name, args));
  const live = createLiveReads(shared);
  return {
    /** 실시간 화면의 갱신: 그 클러스터의 구독 목록이 바뀌었다는 알림이 오면 read를 한 번(묶음마다 한 번, 읽는 중이면 끝난 뒤 한 번, 숨은 문서는 다시 보일 때).
        every: 밀려오지 않는 것(나이·지표)을 위한 느린 박동(ms 또는 함수) */
    follow: ({ cluster, read, every = null }) => live.follow(cluster, read, every),
    get: async (key, params = {}) => {
      const id = params.cluster;
      /* 종류 정의는 자료 조회가 아니다. 오류를 받는 소비자는 빈 성공과 별도로 처리해야 한다. */
      if (key === 'kind') return kindInfo(params.kind);
      if (key === 'toolKinds') return structuredClone(TOOL_KINDS);
      if (key === 'kinds' && !id) return kindsGroups();
      if (HUB_KEYS[key]) return HUB_KEYS[key](params);
      if (!CLUSTER_KEYS[key] && !REAL[key]) throw new Error(`unknown data key: ${key}`);
      if (!id) throw new Error(`cluster required for data key: ${key}`);
      const c = await realContext(id, shared, live.contexts);
      if (!CLUSTER_KEYS[key]) return REAL[key](params, c);
      const api = { ...realApi(id, shared, live), requestedAt: params.at };
      if (params.at !== undefined) timeBasis(api);
      return CLUSTER_KEYS[key](api, params);
    },
  };
}
