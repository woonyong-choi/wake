/*
 * 인시던트 허브(spec/backend.md#F-BE-018): 감지 실행(data/incident-detect.js 규칙), 인시던트 저장(허브 저장소 docs 'incidents'),
 * 근거 스냅샷(log 'evidence': 한 번 읽어 고정, 같은 조각은 같은 번호), 작업면 view model(incident.workspace, 화면 pages/incident-detail.js 모양).
 * 근거는 단계(open → mitigated → resolved)가 바뀔 때 한 번씩 모은다. 화면, 보고서, AI가 같은 저장 조각을 읽어 숫자가 같다.
 * 원인 사슬: 관측·규칙·확인 안 됨·확인 계획은 규칙과 근거에서 만든다. 해석(interpret)은 AI가 쓴 것만(연결 안 됨이면 비움).
 * 글 값은 { $t: 사전 키, vars }로 내고 화면 쪽 자료 공급(data/index.js)이 사전으로 바꾼다.
 * 도구 사용자 항목(tool-items.cjs): 울린 알림의 규칙 식과 그 알림·namespace에 걸린 무음을 근거 스냅샷(kind object, role rule|silences)으로 고정하고 ref(도구·종류·id·해시)를 붙인다.
 * 감지 읽기(P-01): 공유 감시 캐시(sources.cached)가 있으면 그것을, 없으면 Kubernetes 목록을 500개씩 페이지로 읽고 감지에 쓰는 필드만 남긴다.
 */
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { yaml } = require('./kubeconfig.cjs');
const { SOURCE_NAMES } = require('./reads/cluster.cjs');
const { createToolItems, silenceMatches, hashOf: itemHash } = require('./tool-items.cjs');
/* 출처 상태(SourceState) -> 화면 칩 상태: 화면과 같은 표 하나(kit/core/live.js, 메인 프로세스 공개 입구로) */
const { sourceView } = require('../../../kit/desktop/index.cjs');

const MIN = 60_000, HOUR = 60 * MIN;
const esm = name => import(pathToFileURL(path.join(__dirname, '../data', name)).href);
const T = (key, vars = {}) => ({ $t: key, vars });
const SOURCE_ICON = { kubernetes: 'k8s-cluster', prometheus: 'brand-prometheus', alertmanager: 'brand-prometheus', loki: 'brand-loki', argocd: 'brand-argo' };
/** 서비스마다 SLO 덮어쓰기: Service 주석(퍼센트, 예 "99.5"). 없으면 incident-model SLO_DEFAULT */
const SLO_ANNOTATION = 'wake.dev/slo';
/* 판정 규칙의 이름과 버전은 data/incident-detect.js RULES(감지와 같은 표). 근거가 원인을 증명하는 규칙·원인만 confirmed(나머지는 inferred) */
/* 준비된 endpoint 없음: 선택자에 맞는 것이 하나도 없다는 것은 읽은 목록이 증명한다. Pod가 준비되지 않았거나 없는 까닭은 slice에 없다 */
const CONFIRMS = { 'image-pull': () => true, 'container-config': c => c != null, unschedulable: c => c != null, 'create-denied': c => c != null, evicted: c => c === 'limit', 'no-endpoints': c => c === 'selector' };
/* 새 revision 뒤에 생기면 되돌리기가 후보인 규칙 */
const ROLLBACK_RULES = new Set(['oom-limit', 'crash-loop', 'image-pull', 'container-config', 'probe-failed', 'rollout-stuck']);
/* 원인 사실을 관측 줄로 따로 쓰는 규칙(oom-limit·crash-loop·alert는 재시작·이벤트 줄이 그 일을 함) */
const FACT_RULES = new Set(['image-pull', 'container-config', 'probe-failed', 'unschedulable', 'volume', 'evicted', 'node-pressure', 'node-not-ready', 'job-failed', 'rollout-stuck', 'create-denied', 'no-endpoints']);
/* 소유자 조건을 근거로 고정하는 종류와 그 읽기 경로 */
const OWNER_PATH = { Node: (ns, n) => `/api/v1/nodes/${n}`, Deployment: (ns, n) => `/apis/apps/v1/namespaces/${ns}/deployments/${n}`, StatefulSet: (ns, n) => `/apis/apps/v1/namespaces/${ns}/statefulsets/${n}`,
  DaemonSet: (ns, n) => `/apis/apps/v1/namespaces/${ns}/daemonsets/${n}`, Job: (ns, n) => `/apis/batch/v1/namespaces/${ns}/jobs/${n}` };
const POD_OWNER = { Deployment: 'ReplicaSet', StatefulSet: null, DaemonSet: null, Job: null, CronJob: 'Job' };
const ms = v => (v == null || v === '' ? null : typeof v === 'number' ? v : (t => (Number.isFinite(t) ? t : null))(Date.parse(v)));
const memMi = v => { const m = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|k|M|G)?$/.exec(String(v ?? '')); if (!m) return null; const f = { Ki: 1 / 1024, Mi: 1, Gi: 1024, Ti: 1048576, k: 1000 / 1048576, M: 1e6 / 1048576, G: 1e9 / 1048576 }[m[2]] ?? 1 / 1048576; return Number(m[1]) * f; };
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
/* 이 객체가 그 UID의 객체인지(UID를 모르면 그렇다고 봄). 정적 Pod는 정적 UID를 mirror Pod의 kubernetes.io/config.mirror 주석에 둔다 */
const isUid = (o, uid) => !uid || !o?.metadata?.uid || o.metadata.uid === uid || o.metadata.annotations?.['kubernetes.io/config.mirror'] === uid;
/* 워크로드의 사용자 경로: 템플릿 라벨을 고르는 Service와 그 Service로 보내는 Ingress(작업면 근거와 복구 확인이 같은 것을 고름) */
/* 워크로드의 모든 사용자 경로: 템플릿 라벨을 고르는 Service마다 그 Service로 보내는 Ingress마다 하나 */
function userPaths(workload, svcs, ings) {
  const labels = workload?.spec?.template?.metadata?.labels ?? {}, ns = workload?.metadata?.namespace ?? '';
  const chosen = (svcs ?? []).filter(s => (s.metadata?.namespace ?? '') === ns && Object.keys(s.spec?.selector ?? {}).length && Object.entries(s.spec.selector).every(([k, v]) => labels[k] === v));
  /* 규칙의 경로와 기본 백엔드(spec.defaultBackend) 모두 */
  const sends = (ing, name) => ing.spec?.defaultBackend?.service?.name === name || (ing.spec?.rules ?? []).some(r => (r.http?.paths ?? []).some(p => p.backend?.service?.name === name));
  return { services: chosen, paths: chosen.flatMap(svc => (ings ?? []).filter(i => (i.metadata?.namespace ?? '') === ns && sends(i, svc.metadata.name)).map(ing => ({ svc, ing }))) };
}
/* 작업면 근거가 고르는 첫 경로(그 Service는 경로가 없어도 SLO를 줌) */
function userPath(workload, svcs, ings) {
  const { services, paths } = userPaths(workload, svcs, ings);
  return paths[0] ?? { svc: services[0] ?? null, ing: null };
}
/* 그 Ingress의 5xx 비율(퍼센트)과 요청률 질의 */
const impactQueries = (ns, ingress) => {
  const sel = `namespace="${ns}", ingress="${ingress}"`;
  return { ratio: `sum(rate(nginx_ingress_controller_requests{${sel}, status=~"5.."}[5m])) / sum(rate(nginx_ingress_controller_requests{${sel}}[5m])) * 100`, rps: `sum(rate(nginx_ingress_controller_requests{${sel}}[5m]))` };
};
/* 인시던트 신호가 가리킨 컨테이너 이름(먼저 온 것부터, 중복 없이) */
const signalContainers = inc => [...new Set((inc.signals ?? []).map(s => s.object?.container).filter(Boolean))];
/* 소유자 템플릿의 컨테이너를 이름으로: { container, index, field: 'containers' | 'initContainers' } | null */
function templateContainer(owner, name) {
  const s = owner?.spec?.template?.spec;
  if (!s || !name) return null;
  for (const field of ['containers', 'initContainers']) { const i = (s[field] ?? []).findIndex(c => c.name === name); if (i >= 0) return { container: s[field][i], index: i, field }; }
  return null;
}
const maxOf = (values, floor = -Infinity) => values.reduce((a, v) => (v > a ? v : a), floor);
/* Prometheus 한 질의의 점 수 상한(11,000) 아래로: 구간이 길면 step을 늘린다(최소 30초) */
const stepFor = w => Math.max(30_000, Math.ceil((w.to - w.from) / 10_000 / 1000) * 1000);
/* 감지가 읽는 목록: 경로와 남길 필드(P-01). 페이지 500개, 최대 40페이지(넘으면 partial) */
const NSP = n => (n ? `/namespaces/${encodeURIComponent(n)}` : '');
const DETECT_PATH = { pods: n => `/api/v1${NSP(n)}/pods`, events: n => `/api/v1${NSP(n)}/events`, nodes: () => '/api/v1/nodes', replicasets: n => `/apis/apps/v1${NSP(n)}/replicasets`, deployments: n => `/apis/apps/v1${NSP(n)}/deployments`,
  statefulsets: n => `/apis/apps/v1${NSP(n)}/statefulsets`, daemonsets: n => `/apis/apps/v1${NSP(n)}/daemonsets`, jobs: n => `/apis/batch/v1${NSP(n)}/jobs`, cronjobs: n => `/apis/batch/v1${NSP(n)}/cronjobs`,
  persistentvolumeclaims: n => `/api/v1${NSP(n)}/persistentvolumeclaims`, services: n => `/api/v1${NSP(n)}/services`, ingresses: n => `/apis/networking.k8s.io/v1${NSP(n)}/ingresses`, endpointslices: n => `/apis/discovery.k8s.io/v1${NSP(n)}/endpointslices` };
const DETECT_KIND = { pods: 'Pod', events: 'Event', nodes: 'Node', replicasets: 'ReplicaSet', deployments: 'Deployment', statefulsets: 'StatefulSet', daemonsets: 'DaemonSet', jobs: 'Job', cronjobs: 'CronJob',
  persistentvolumeclaims: 'PersistentVolumeClaim', services: 'Service', endpointslices: 'EndpointSlice', ingresses: 'Ingress' };
const PAGE = 500, MAX_PAGES = 40;
const slimMeta = m => ({ name: m?.name, namespace: m?.namespace, uid: m?.uid, creationTimestamp: m?.creationTimestamp, labels: m?.labels, annotations: m?.annotations, ownerReferences: m?.ownerReferences });
/** 감지에 쓰는 필드만(큰 spec·managedFields·주석 본문을 들고 있지 않게) */
function project(o, kind) {
  const base = { kind, metadata: slimMeta(o.metadata) };
  if (kind === 'Event') return { ...o, kind, metadata: slimMeta(o.metadata) };
  if (kind === 'Pod') return { ...base, spec: { nodeName: o.spec?.nodeName, containers: (o.spec?.containers ?? []).map(c => ({ name: c.name, resources: c.resources })),
    volumes: (o.spec?.volumes ?? []).filter(v => v.persistentVolumeClaim).map(v => ({ name: v.name, persistentVolumeClaim: { claimName: v.persistentVolumeClaim.claimName } })) },
  status: { phase: o.status?.phase, reason: o.status?.reason, message: o.status?.message, startTime: o.status?.startTime, conditions: o.status?.conditions, containerStatuses: o.status?.containerStatuses, initContainerStatuses: o.status?.initContainerStatuses } };
  if (kind === 'Node') return { ...base, status: { conditions: o.status?.conditions } };
  if (kind === 'PersistentVolumeClaim') return { ...base, status: { phase: o.status?.phase } };
  if (kind === 'Service') return { ...base, spec: { type: o.spec?.type, clusterIP: o.spec?.clusterIP, selector: o.spec?.selector } };
  if (kind === 'Ingress') return { ...base, spec: { ...(o.spec?.defaultBackend?.service?.name ? { defaultBackend: { service: { name: o.spec.defaultBackend.service.name } } } : {}),
    rules: (o.spec?.rules ?? []).map(r => ({ http: { paths: (r.http?.paths ?? []).map(p => ({ backend: { service: { name: p.backend?.service?.name } } })) } })) } };
  if (kind === 'EndpointSlice') return { ...base, endpoints: (o.endpoints ?? []).map(e => ({ addresses: e.addresses, conditions: e.conditions, targetRef: e.targetRef ? { kind: e.targetRef.kind, name: e.targetRef.name } : undefined })) };
  return { ...base, spec: { replicas: o.spec?.replicas, template: { metadata: { labels: o.spec?.template?.metadata?.labels } } }, status: { readyReplicas: o.status?.readyReplicas, numberReady: o.status?.numberReady, desiredNumberScheduled: o.status?.desiredNumberScheduled, failed: o.status?.failed, succeeded: o.status?.succeeded, conditions: o.status?.conditions } };
}

/**
 * The read-only command a person runs to check the cause where the fix lies outside Wake (null when there is nothing to name).
 * Secrets are checked without -o yaml so their values are never printed (RULE-SECRET).
 */
function checkCommand({ rule, cause, tg, pod, container, missing, facts, cx }) {
  const nsf = tg.namespace ? ` -n ${tg.namespace}` : '', describePod = pod ? `kubectl describe pod ${pod}${nsf}` : null;
  const claim = facts.find(f => f.kind === 'PersistentVolumeClaim')?.object ?? cx.claims?.[0] ?? null;
  const failedJob = tg.kind === 'Job' ? tg.name : facts.find(f => f.kind === 'Job')?.object ?? (cx.jobs ?? []).find(j => j.status?.failed > 0)?.metadata.name ?? null;
  switch (rule) {
    case 'image-pull': case 'probe-failed': return describePod;
    case 'crash-loop': return pod && container ? `kubectl logs ${pod}${nsf} -c ${container} --previous` : describePod;
    case 'container-config': return !missing?.name ? describePod : missing.kind === 'secret' ? `kubectl get secret ${missing.name}${nsf}` : `kubectl get configmap ${missing.name}${nsf} -o yaml`;
    case 'unschedulable': return cause === 'resources' ? "kubectl describe nodes | grep -A 8 'Allocated resources'" : cause === 'taint' ? 'kubectl get nodes -o custom-columns=NAME:.metadata.name,TAINTS:.spec.taints'
      : cause === 'affinity' && pod ? `kubectl get pod ${pod}${nsf} -o jsonpath='{.spec.nodeSelector} {.spec.affinity.nodeAffinity}'` : cause === 'pvc' ? `kubectl get pvc${nsf}` : describePod;
    case 'volume': return claim ? `kubectl describe pvc ${claim}${nsf}` : describePod;
    case 'evicted': { const node = facts.find(f => f.node)?.node; return cause === 'node' && node ? `kubectl describe node ${node}` : describePod; }
    case 'node-not-ready': case 'node-pressure': return `kubectl describe node ${tg.name}`;
    case 'job-failed': return failedJob ? `kubectl logs job/${failedJob}${nsf} --all-containers` : null;
    case 'rollout-stuck': return tg.kind === 'Deployment' ? `kubectl rollout status deployment/${tg.name}${nsf}` : null;
    case 'create-denied': return cause === 'quota' ? `kubectl describe resourcequota${nsf}` : cause === 'admission' ? 'kubectl get validatingadmissionpolicies,validatingwebhookconfigurations,mutatingwebhookconfigurations' : `kubectl describe ${String(tg.kind).toLowerCase()}/${tg.name}${nsf}`;
    case 'no-endpoints': { /* 선택자에 맞는 것이 없으면 namespace의 Pod 라벨, Pod가 준비되지 않았으면 그 Pod들, 그 밖에는 Service의 slice */
      const svc = facts.find(f => f.kind === 'Service'), name = svc?.object ?? (tg.kind === 'Service' ? tg.name : null);
      if (cause === 'selector') return `kubectl get pods${nsf} --show-labels`;
      if (cause === 'notready' && svc?.selector) return `kubectl get pods -l ${svc.selector}${nsf}`;
      if (cause === 'nopods' && tg.kind !== 'Service') return `kubectl describe ${String(tg.kind).toLowerCase()}/${tg.name}${nsf}`;
      return name ? `kubectl get endpointslices -l kubernetes.io/service-name=${name}${nsf}` : null;
    }
    default: return null;
  }
}

function createIncidentHub({ store, sources, now = Date.now, user = () => os.userInfo().username, audit = () => {}, interpret = null }) {
  let masker = null;
  const lib = Promise.all([esm('incident-detect.js'), esm('incident-model.js'), esm('ownership.js'), esm('log-excerpt.js'), esm('alerts.js'), esm('mask.js')])
    .then(([detect, model, ownership, logs, alerts, mask]) => { masker = mask.discloseObject; return { ...detect, ...model, ...ownership, ...logs, alertLabels: alerts.alertLabels }; });
  const incidents = store.docs('incidents'), evidence = store.log('evidence'), meta = store.docs('meta');
  const scans = new Map();
  let itemReader = null;
  const items = () => (itemReader ??= createToolItems({ tool: sources.tool, kube: sources.kube, store }));
  /** 감지 목록 하나: 공유 감시 캐시가 있으면 그것, 없으면 페이지로(limit·continue). 필드를 줄여 둔다 */
  async function listAll(id, plural, params = '') {
    const kind = DETECT_KIND[plural];
    const cached = typeof sources.cached === 'function' ? await sources.cached(id, plural) : null;
    if (Array.isArray(cached)) return cached.map(o => project(o, kind));
    if (typeof sources.kube !== 'function') return (await sources.list(id, plural, '', params)).map(o => project(o, kind));
    const out = []; let token = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams(params); q.set('limit', String(PAGE)); if (token) q.set('continue', token);
      const r = await sources.kube(id, `${DETECT_PATH[plural]('')}?${q}`);
      for (const o of r?.items ?? []) out.push(project(o, kind));
      token = r?.metadata?.continue ?? '';
      if (!token) return out;
    }
    out.partial = true;
    return out;
  }

  function nextNumber() {
    const c = meta.get('counter') ?? { n: 0 };
    meta.put('counter', { n: c.n + 1, at: now() });
    return `INC-${String(c.n + 1).padStart(4, '0')}`;
  }

  /* ---------- 감지 ---------- */
  /** 한 클러스터 감지 한 번(같은 클러스터는 20초 안에 다시 읽지 않음): 바뀐 인시던트 수 */
  function scan(id, { force = false } = {}) {
    const last = scans.get(id);
    if (last && !force && (last.running || now() - last.at < 20_000)) return last.promise;
    const promise = run(id).finally(() => { scans.get(id).running = false; });
    scans.set(id, { at: now(), running: true, promise });
    return promise;
  }
  /* 읽기 하나가 관측인지: 실패했거나 페이지 상한에서 멈춘(partial) 목록은 관측이 아니다(복구 확인에서 그 조건은 unknown) */
  const unread = x => !!x?.error || !!x?.partial;
  /* Job 하나의 결과: Complete=True만 성공(succeeded 수는 진행 중일 수 있음), Failed=True는 실패, 그 밖은 모름 */
  const jobDone = j => (!j ? null : (j.status?.conditions ?? []).some(c => c.type === 'Complete' && c.status === 'True') ? true
    : (j.status?.conditions ?? []).some(c => c.type === 'Failed' && c.status === 'True') ? false : null);
  const scheduledAt = j => ms(j?.metadata?.annotations?.['batch.kubernetes.io/cronjob-scheduled-timestamp']) ?? ms(j?.metadata?.creationTimestamp);
  async function run(id) {
    const L = await lib;
    const settle = p => p.then(v => v, e => ({ error: e }));
    const [alerts, events, pods, rs, jobs, cjs, deps, sts, dss, nodes, pvcs, svcs, slices, ings] = await Promise.all([settle(sources.alerts(id)), settle(listAll(id, 'events', 'fieldSelector=type%3DWarning')),
      settle(listAll(id, 'pods')), settle(listAll(id, 'replicasets')), settle(listAll(id, 'jobs')), settle(listAll(id, 'cronjobs')), settle(listAll(id, 'deployments')),
      settle(listAll(id, 'statefulsets')), settle(listAll(id, 'daemonsets')), settle(listAll(id, 'nodes')), settle(listAll(id, 'persistentvolumeclaims')),
      settle(listAll(id, 'services')), settle(listAll(id, 'endpointslices')), settle(listAll(id, 'ingresses'))]);
    if (pods.error && events.error) throw pods.error;
    const arr = v => (Array.isArray(v) ? v : []);
    const index = new Map();
    for (const o of [...arr(pods), ...arr(rs), ...arr(jobs), ...arr(cjs), ...arr(deps), ...arr(sts), ...arr(dss), ...arr(nodes), ...arr(pvcs), ...arr(svcs)]) index.set(`${o.kind}|${o.metadata.namespace ?? ''}|${o.metadata.name}`, o);
    const lookup = (kind, ns, name) => index.get(`${kind}|${ns ?? ''}|${name}`) ?? null;
    const t = now();
    const workloads = [...arr(deps), ...arr(sts), ...arr(dss), ...arr(jobs)];
    /* Service는 그 EndpointSlice와 Pod를 함께 읽은 회차에만 판정한다(하나라도 못 읽으면 준비된 endpoint가 없다고 말하지 않음) */
    const endpointsRead = !unread(svcs) && !unread(slices) && !unread(pods);
    const signals = L.signalsOf({ alerts: arr(alerts), events: arr(events), pods: arr(pods), nodes: arr(nodes), workloads, ...(endpointsRead ? { services: arr(svcs), slices: arr(slices) } : {}), lookup, now: t });
    const mine = incidents.all().filter(i => i.cluster === id);
    /* 확인 중 워크로드 인시던트의 사용자 경로 5xx: 감지가 읽은 Service·Ingress로 경로를 찾아 이번 구간 비율을 읽는다(작업면을 열었는지와 무관).
       Prometheus가 연결되지 않은 클러스터는 이 조건이 없다. 경로 목록을 못 읽었거나, 비율을 못 읽었거나, 표본이 없고 요청률도 0으로 읽히지 않으면 unknown */
    /* 확인 중 워크로드 인시던트의 사용자 경로 5xx: 감지가 읽은 Service·Ingress로 모든 경로를 찾아 경로마다 이번 구간 비율을 읽는다(작업면을 열었는지와 무관).
       Prometheus가 연결되지 않은 클러스터는 이 조건이 없다. 경로 목록을 못 읽었으면(403 포함) 앞에 알던 경로를 버리지 않고 unknown. 경로마다 표본이 한 구간보다
       오래됐거나 앞 구간보다 나아가지 않았거나, 비율 표본이 없고 요청률도 0으로 읽히지 않으면 unknown. 하나라도 SLO를 넘으면 fail.
       basis(경로·질의·임계값)가 앞 구간과 다르면 그 구간은 miss다(아래 ready) */
    const ratios = new Map(), pathRead = !unread(svcs) && !unread(ings), cadence = L.VERIFY_DEFAULT.cadence;
    await Promise.all(mine.filter(i => i.phase === 'mitigated').map(async inc => {
      const w = lookup(inc.target.kind, inc.target.namespace, inc.target.name);
      if (typeof sources.promRange !== 'function' || !w?.spec?.template) return;
      if (!pathRead) { ratios.set(inc.id, { state: 'unknown', basis: inc.observed?.ratioBasis ?? 'unread', at: {} }); return; }
      const { paths } = userPaths(w, arr(svcs), arr(ings));
      if (!paths.length) return;
      const span = { from: t - 2 * MIN, to: t, step: 30_000 }, before = inc.observed?.ratioAt ?? {};
      const latest = query => sources.promRange(id, query, span).then(series => [...(series?.[0]?.samples ?? [])].reverse().find(x => x.value != null) ?? null);
      const read = await Promise.all(paths.map(async ({ svc, ing }) => {
        const slo = Number(svc.metadata?.annotations?.[SLO_ANNOTATION]), limit = r1(100 - (Number.isFinite(slo) && slo > 0 && slo < 100 ? slo : L.SLO_DEFAULT));
        const q = impactQueries(inc.target.namespace, ing.metadata.name), key = `${svc.metadata.name}|${svc.metadata.uid ?? ''}|${ing.metadata.name}|${ing.metadata.uid ?? ''}|${limit}`;
        const fresh = x => x && x.at >= t - cadence && !(before[key] != null && x.at <= before[key]);
        /* 한 경로의 읽기(비율, 없으면 요청률) 실패는 그 경로만 unknown이다: 감지 회차 전체를 멈추지 않는다. Prometheus 미연결만 이 조건이 없음 */
        try {
          const x = await latest(q.ratio);
          if (fresh(x)) return { key, limit, sample: x };
          const r = await latest(q.rps);
          return { key, limit, sample: fresh(r) && Number(r.value) === 0 ? { at: r.at, value: 0 } : null };
        } catch (e) { return { key, limit, sample: e?.kind === 'unconfigured' ? undefined : null }; }
      }));
      if (read.some(x => x.sample === undefined)) return;
      const state = read.some(x => x.sample && Number(x.sample.value) >= x.limit) ? 'fail' : read.some(x => !x.sample) ? 'unknown' : 'pass';
      ratios.set(inc.id, { state, basis: read.map(x => x.key).sort().join(','), limit: Math.min(...read.map(x => x.limit)), at: Object.fromEntries(read.filter(x => x.sample).map(x => [x.key, x.sample.at])) });
    }).map(p => p.catch(() => null)));
    /* 복구 확인 한 구간: 조건마다 관측(pass · fail · unknown)을 남긴다. 하나라도 fail이면 false, 아니고 unknown이 있으면 null(miss), 대상이 없거나
       같은 이름의 다른 UID만 있으면 'gone'. 신호를 낸 읽기(알림·이벤트·목록)가 실패하면 "같은 신호 없음"은 unknown이다 */
    const LISTS = { Pod: pods, ReplicaSet: rs, Job: jobs, CronJob: cjs, Deployment: deps, StatefulSet: sts, DaemonSet: dss, Node: nodes, PersistentVolumeClaim: pvcs, Service: svcs };
    const SIGNAL_READS = { alert: [alerts], event: [events], pod: [pods], node: [nodes], workload: [jobs, deps, sts, dss], service: [svcs, slices, pods] };
    const yes = v => (v == null ? 'unknown' : v ? 'pass' : 'fail');
    const healthy = (owner, o, inc) => {
      if (owner.kind === 'Service') return endpointsRead ? yes(!L.endpointFacts(o, { slices: arr(slices), pods: arr(pods), workloads }).length) : 'unknown';
      if (owner.kind === 'Node') return yes((o.status?.conditions ?? []).some(c => c.type === 'Ready' && c.status === 'True') && !L.conditionFacts(o).length);
      if (owner.kind === 'PersistentVolumeClaim') return yes(o.status?.phase === 'Bound');
      if (owner.kind === 'Pod') return yes(o.status?.phase === 'Succeeded' || ((o.status?.containerStatuses ?? []).length > 0 && o.status.containerStatuses.every(c => c.ready)));
      if (owner.kind === 'Job') return yes(jobDone(o));
      /* CronJob: 영향받은 실행(신호의 Job, 지워졌으면 감지 시각) 뒤에 예약된, 그 CronJob이 만든(UID로 확인한) 실행 중 가장 최근 것이 Complete여야 한다.
         그보다 앞선 성공(어제 실행)은 복구가 아니다 */
      if (owner.kind === 'CronJob') {
        if (unread(jobs)) return 'unknown';
        /* 영향받은 실행의 예약 시각: 읽은 Job, 지워졌으면 신호에 남긴 시각 */
        const affected = inc.signals.filter(s => s.object?.kind === 'Job').map(s => scheduledAt(lookup('Job', s.object.namespace, s.object.name)) ?? s.object.scheduledAt ?? null).filter(v => v != null);
        const after = affected.length ? Math.max(...affected) : inc.detectedAt, strict = affected.length > 0;
        const runs = arr(jobs).filter(j => j.metadata.namespace === o.metadata.namespace && (j.metadata.ownerReferences ?? []).some(r => r.kind === 'CronJob' && r.name === o.metadata.name && (!r.uid || r.uid === o.metadata.uid))
          && scheduledAt(j) != null && (strict ? scheduledAt(j) > after : scheduledAt(j) >= after));
        return yes(jobDone(runs.sort((a, b) => scheduledAt(a) - scheduledAt(b)).at(-1)));
      }
      if (unread(pods)) return 'unknown';
      const want = o.spec?.replicas ?? o.status?.desiredNumberScheduled ?? 1, have = o.status?.readyReplicas ?? o.status?.numberReady ?? 0;
      const stuck = arr(pods).some(p => podOf(owner, p, lookup) && L.podFacts(p).some(f => f.reason !== 'Evicted'));
      return yes(have >= want && !stuck && !L.conditionFacts(o).length);
    };
    const judge = (owner, inc) => {
      const conds = { 'no-signal': blind(inc) ? 'unknown' : 'pass' };
      const list = LISTS[owner.kind];
      if (!list || unread(list)) conds.ready = 'unknown';
      else {
        const read = lookup(owner.kind, owner.namespace, owner.name), o = read && isUid(read, owner.uid) ? read : null;
        if (!o) return { state: 'gone', conds: { ...conds, ready: 'gone' } };
        conds.ready = healthy(owner, o, inc);
      }
      /* 볼륨 신호가 가리킨 PVC는 그 워크로드 아래로 묶여도 Bound여야 한다. 읽은 목록에 없으면(지워졌거나 다른 UID) Bound라고 말할 수 없어 unknown */
      const claims = [...new Map(inc.signals.filter(s => s.object?.kind === 'PersistentVolumeClaim').map(s => [s.object.name, s.object])).values()];
      if (claims.length && owner.kind !== 'PersistentVolumeClaim') {
        const found = claims.map(x => { const c = lookup('PersistentVolumeClaim', owner.namespace, x.name); return c && isUid(c, x.uid) ? c : null; });
        conds.claim = unread(pvcs) || found.some(c => !c) ? 'unknown' : yes(found.every(c => c.status?.phase === 'Bound'));
      }
      const ratio = ratios.get(inc.id);
      if (ratio) conds.ratio = ratio.state;
      const all = Object.values(conds);
      return { state: all.includes('fail') ? false : all.includes('unknown') ? null : true, conds };
    };
    const observed = new Map();
    /* 필수 조건의 묶음이 앞 구간과 다르면(예: 5xx 경로가 새로 생김) 앞의 정상 구간은 그 조건을 덮지 않았다: 이 구간은 miss라 연속 구간이 다시 시작한다 */
    const basisOf = (conds, ratio) => JSON.stringify({ conds: Object.keys(conds).sort(), ratio: ratio?.basis ?? null });
    const ready = (owner, inc) => {
      const r = judge(owner, inc), ratio = ratios.get(inc.id), basis = basisOf(r.conds, ratio), before = inc.phase === 'mitigated' && inc.verify?.windows?.length ? inc.observed?.basis : null;
      observed.set(inc.id, { at: t, conds: r.conds, basis, ...(ratio ? { ratioBasis: ratio.basis, ratioAt: { ...(inc.observed?.ratioAt ?? {}), ...ratio.at }, ...(ratio.limit != null ? { ratioLimit: ratio.limit } : {}) } : {}) });
      return r.state === true && before != null && before !== basis ? null : r.state;
    };
    /* 목록을 읽었는데 대상이 없거나 다른 UID만 있으면 남은 신호와 무관하게 닫는다(detect의 gone) */
    const gone = inc => { const list = LISTS[inc.target.kind]; if (!list || unread(list)) return false; const o = lookup(inc.target.kind, inc.target.namespace, inc.target.name); return !o || !isUid(o, inc.target.uid); };
    /* 소유 목록을 읽지 못했거나 페이지 상한에서 멈춘(partial) 회차는 신호가 엉뚱한 소유자(ReplicaSet, Pod)로 묶일 수 있어 새 인시던트를 열지 않는다 */
    const openNew = ![pods, rs, jobs, deps, sts, dss].some(unread);
    const blind = inc => inc.signals.some(s => (SIGNAL_READS[s.kind] ?? []).some(unread));
    const { incidents: changed, opened } = L.detect({ cluster: id, incidents: mine, signals, now: t, ready, nextNumber, openNew, blind, gone });
    for (const inc of changed) {
      const before = mine.find(i => i.id === inc.id);
      const saved = incidents.put(inc.id, { ...inc, ...(observed.has(inc.id) ? { observed: observed.get(inc.id) } : {}), at: t, alertSource: alerts.error ? null : 'alertmanager' });
      if (!before) audit({ at: inc.detectedAt, incident: inc.id, action: 'alert', requester: { kind: 'wake', name: inc.alert?.source ?? 'Wake' }, transport: 'desktop', scope: id, executor: 'Wake',
        target: `${inc.target.namespace}/${inc.target.kind}/${inc.target.name}`, result: 'firing', summary: T('wake.inc.audit.detected', { reasons: Object.keys(inc.reasons).join(', ') }) });
      else if (before.phase !== saved.phase) audit({ incident: inc.id, action: saved.phase === 'resolved' ? 'resolve' : 'judge', requester: { kind: 'wake', name: 'Wake' }, transport: 'desktop', scope: id, executor: 'Wake',
        target: `${inc.target.namespace}/${inc.target.kind}/${inc.target.name}`, result: saved.phase === 'resolved' ? saved.recovery : 'ok', summary: T(saved.subjectGone ? 'wake.inc.audit.gone' : `wake.inc.audit.${saved.phase}`) });
    }
    return { changed: changed.length, opened: opened.length, signals: signals.length, alerts: alerts.error ? 'error' : arr(alerts).length };
  }
  /* 같은 소유 참조인지: 종류·이름이 같고 둘 다 UID를 알면 UID도 같다 */
  const sameRef = (ref, o) => ref.kind === o.kind && ref.name === o.name && (!ref.uid || !o.uid || ref.uid === o.uid);
  /* 이 Pod가 소유자 아래인지(ownerReferences 한두 단계, 단계마다 UID로 확인: 같은 이름으로 다시 만든 소유자의 Pod는 아님) */
  function podOf(owner, pod, lookup) {
    if (pod.metadata.namespace !== owner.namespace) return false;
    if (owner.kind === 'Pod') return pod.metadata.name === owner.name && isUid(pod, owner.uid);
    const up = (pod.metadata.ownerReferences ?? []).find(o => o.controller) ?? (pod.metadata.ownerReferences ?? [])[0];
    if (!up) return false;
    if (sameRef(up, owner)) return true;
    if (POD_OWNER[owner.kind] === up.kind) {
      const mid = lookup(up.kind, owner.namespace, up.name);
      return !!mid && (!up.uid || !mid.metadata?.uid || up.uid === mid.metadata.uid) && (mid.metadata?.ownerReferences ?? []).some(o => sameRef(o, owner));
    }
    return false;
  }

  /* ---------- 목록 ---------- */
  const took = inc => (inc.resolvedAt ?? now()) - inc.detectedAt;
  function rows({ cluster, state = 'all', window } = {}) {
    return incidents.all().filter(i => (!cluster || i.cluster === cluster) && (state === 'all' || (state === 'open' ? i.phase !== 'resolved' : i.phase === state))
      && (!window || (i.detectedAt >= ms(window.from) && i.detectedAt <= ms(window.to))))
      .sort((a, b) => b.detectedAt - a.detectedAt)
      .map(i => ({ id: i.id, number: i.number, title: titleOf(i), alert: i.alert?.name ?? '', sev: i.severity, severity: i.severity, cluster: i.cluster, ns: i.target.namespace, target: { kind: i.target.kind ?? '', name: i.target.name ?? '', ns: i.target.namespace ?? '' } /* 범위 검색 상자의 종류가 맞추는 대상 */,
        at: i.detectedAt, phase: i.phase, result: i.phase === 'resolved' ? i.recovery : null, took: took(i), action: i.chosen ? i.chosenTitle ?? '' : '' }));
  }
  const titleOf = i => `${i.target.name} ${Object.keys(i.reasons).join(' · ')}`;

  /* ---------- 근거 스냅샷(6.1) ---------- */
  const hashOf = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
  /** 근거 한 조각을 고정: 같은 조각(인시던트, 종류, 질의, 구간, 대상)이면 저장된 번호를 돌려주고 덮어쓰지 않는다.
   *  받는 자리에서 결과에 공개 정책을 적용한다(data/mask.js discloseObject: 비밀 키 이름의 값, 이름표 있는 비밀, 이름표 없는 불투명 자격). 해시는 가린 결과의 것(저장한 것과 같은 값) */
  function cite(inc, piece) {
    const identity = hashOf({ incident: inc.id, kind: piece.kind, query: piece.query, window: piece.window, target: piece.target });
    const all = evidence.list(r => r.incident === inc.id);
    const had = all.find(r => r.identity === identity);
    if (had) return had;
    const n = all.reduce((a, r) => Math.max(a, r.n), 0) + 1;
    const decided = inc.chosen && inc.approvedAt && piece.collectedAt > inc.approvedAt;
    const result = masker ? masker(piece.result).value : piece.result;
    return evidence.append({ incident: inc.id, n, identity, ...piece, result, hash: hashOf(result), ...(decided ? { addedAfter: 'decision' } : {}) });
  }
  const pieces = id => evidence.list(r => r.incident === id).sort((a, b) => a.n - b.n);

  /* ---------- 도구 사용자 항목 근거(DP-ITEMS) ---------- */
  const ruleFields = r => ({ group: r.group, file: r.file, name: r.name, expr: r.expr, for: r.for, labels: r.labels, annotations: r.annotations, health: r.health, lastError: r.lastError, state: r.state, firing: r.firing });
  /** 경보 규칙(이름, 기본은 인시던트 알림)의 식을 고정: 이 namespace에서 울린 규칙을 먼저, 없으면 같은 이름 전부(최대 3). 규칙이 없으면 null */
  async function citeRule(inc, at, name = inc.alert?.name) {
    if (!name) return null;
    const ns = inc.target.namespace, r = await items().rules(inc.cluster, { type: 'alert', name }), { alertLabels } = await lib;
    const here = r.items.filter(x => x.alerts.some(a => alertLabels(a.labels).namespace === ns));
    const found = (here.length ? here : r.items).slice(0, 3);
    if (!found.length) return null;
    return cite(inc, { kind: 'object', role: 'rule', source: 'prometheus', target: { kind: 'PrometheusRule', namespace: ns, name }, window: { from: at, to: at },
      query: `GET /api/v1/rules?type=alert&rule_name[]=${name}`, ref: { ...found[0].ref, hash: found[0].hash },
      result: { object: yaml.dump(found.map(ruleFields), { lineWidth: 160 }), rules: found.map(ruleFields) }, total: found.length, collectedAt: at, sourceState: 'ok' });
  }
  /** 무음 고정: 알림이 있으면 그 알림(Alertmanager가 아는 라벨)을 가리는 무음, 없으면 namespace 전체를 가리는 무음(namespace matcher만 있는 것). 없으면 null */
  async function citeSilences(inc, at) {
    const ns = inc.target.namespace, name = inc.alert?.name;
    let labels = [{ namespace: ns }];
    if (name) {
      const alerts = await sources.tool(inc.cluster, 'alertmanager', '/api/v2/alerts', { filter: `alertname="${name}"`, active: 'true', silenced: 'true', inhibited: 'true' });
      const { alertLabels } = await lib; /* 알림이 말하는 객체의 namespace(수집 대상의 namespace가 아님) */
      labels = (Array.isArray(alerts) ? alerts : []).map(a => a.labels ?? {}).filter(l => !alertLabels(l).namespace || alertLabels(l).namespace === ns);
      if (!labels.length) labels = [{ alertname: name, namespace: ns }];
    }
    const all = (await items().silences(inc.cluster)).items;
    const rows = name ? all.filter(x => labels.some(l => silenceMatches({ matchers: x.matcherList }, l)))
      : all.filter(x => x.matcherList.length && x.matcherList.every(m => m.name === 'namespace') && silenceMatches({ matchers: x.matcherList }, { namespace: ns }));
    if (!rows.length) return null;
    const shown = rows.map(x => ({ id: x.id, state: x.state, matchers: x.matchers, startsAt: x.startsAt, endsAt: x.endsAt, createdBy: x.createdBy, comment: x.comment }));
    return cite(inc, { kind: 'object', role: 'silences', source: 'alertmanager', target: { kind: 'Silence', namespace: ns, name: name ?? ns }, window: { from: at, to: at },
      query: `GET /api/v2/silences (active, matching ${name ? `alertname="${name}"` : `namespace="${ns}"`})`, ref: { tool: 'alertmanager', kind: 'silence', id: rows.map(x => x.id).join(','), hash: itemHash(rows.map(x => x.hash)) },
      result: { object: yaml.dump(shown, { lineWidth: 160 }), rows: shown }, total: rows.length, collectedAt: at, sourceState: 'ok' });
  }
  /** 도구 층 collect_evidence(rule, silences) */
  async function citeToolItems(inc, { kind, name }) {
    if (typeof sources.tool !== 'function') throw Object.assign(new Error('unconfigured'), { kind: 'unconfigured' });
    return kind === 'rule' ? citeRule(inc, now(), name ?? inc.alert?.name) : citeSilences(inc, now());
  }

  /** 소유자와 그 Pod, 소유 Application, Service·Ingress(5xx 영향), SLO.
   *  이름으로 다시 읽은 소유자의 UID가 인시던트 대상의 UID와 다르면 같은 이름의 다른 객체(대체됨)다: owner는 null, replaced는 true(그 객체로 조치를 만들지 않음) */
  async function context(inc) {
    const id = inc.cluster, tg = inc.target, ns = tg.namespace;
    const settle = p => p.then(v => v, () => null);
    const [read, pods, rs, jobs, svcs, ings, apps, cms] = await Promise.all([settle(sources.get(id, tg.kind, ns, tg.name)), settle(sources.list(id, 'pods', ns)),
      settle(sources.list(id, 'replicasets', ns)), settle(sources.list(id, 'jobs', ns)), settle(sources.list(id, 'services', ns)), settle(sources.list(id, 'ingresses', ns)),
      settle(sources.list(id, 'applications')), settle(sources.kube(id, `/api/v1/namespaces/${encodeURIComponent(ns)}/configmaps`).then(r => r.items))]);
    const replaced = !!read && !isUid(read, tg.uid), owner = replaced ? null : read;
    const index = new Map([...(rs ?? []), ...(jobs ?? [])].map(o => [`${o.kind}|${o.metadata.name}`, o]));
    const lookup = (kind, _ns, name) => index.get(`${kind}|${name}`) ?? null;
    const mine = o => (o.metadata.ownerReferences ?? []).some(r => sameRef(r, tg));
    const own = tg.kind === 'Node' ? [] : (pods ?? []).filter(p => podOf(tg, p, lookup));
    const { svc, ing } = userPath(owner, svcs, ings);
    const L = await lib;
    const slo = Number(svc?.metadata?.annotations?.[SLO_ANNOTATION]);
    const ownership = owner ? L.ownerOf(owner, { applications: apps ?? [] }) : null;
    const app = ownership?.kind === 'argocd' ? (apps ?? []).find(a => a.metadata.name === ownership.app) ?? null : null;
    const refs = new Set((owner?.spec?.template?.spec?.containers ?? []).flatMap(c => [...(c.envFrom ?? []).map(e => e.configMapRef?.name), ...(c.env ?? []).map(e => e.valueFrom?.configMapKeyRef?.name)])
      .concat((owner?.spec?.template?.spec?.volumes ?? []).map(v => v.configMap?.name)).filter(Boolean));
    const claims = [...new Set(own.flatMap(p => (p.spec?.volumes ?? []).map(v => v.persistentVolumeClaim?.claimName)).filter(Boolean))];
    return { owner, replaced, pods: own, replicasets: (rs ?? []).filter(mine), claims, jobs: (jobs ?? []).filter(mine),
      svc, ing, slo: Number.isFinite(slo) && slo > 0 && slo < 100 ? slo : L.SLO_DEFAULT, ownership, app, configmaps: (cms ?? []).filter(c => refs.has(c.metadata.name)), argoReadable: apps !== null };
  }

  /** 단계가 바뀔 때 근거를 모아 고정한다(대상 Pod 상태, 이벤트, 메모리, 5xx 비율, 이전 컨테이너 로그, Application 이력) */
  /* 읽기 실패는 근거 조각이 아니다(RULE-EVIDENCE): 종류·질의·원인을 인시던트에 남기고 그 단계는 모은 것으로 치지 않는다. EVIDENCE_RETRY(1분) 뒤 실패한 읽기만 다시 한다 */
  const failureReason = e => e?.kind || (Number(e?.status) === 403 ? 'forbidden' : Number(e?.status) === 404 ? 'missing' : Number(e?.status) >= 500 ? `http_${Number(e.status)}` : e?.name === 'AbortError' ? 'cancelled' : 'query_error');
  const EVIDENCE_RETRY = MIN;
  /* 모은 뒤 더 구체적인 규칙의 신호가 와서 규칙이 바뀌면 그 규칙의 근거를 처음부터 다시 모은다(옛 규칙의 근거로 새 규칙을 판정하지 않음) */
  const ruleChanged = inc => inc.collectedRule != null && inc.collectedRule !== inc.rule;
  async function collect(inc, cx) {
    const L = await lib, id = inc.cluster, tg = inc.target, ns = tg.namespace, at = now();
    const window = { from: inc.detectedAt - 30 * MIN, to: at };
    const tasks = [], failures = [];
    const retry = inc.collectPending?.phase === inc.phase && !ruleChanged(inc) ? new Set(inc.collectPending.failures.map(f => f.key)) : null, want = key => !retry || retry.has(key);
    const read = (key, kind, query, promise) => { if (want(key)) tasks.push(promise().catch(e => { failures.push({ key, kind, query, reason: failureReason(e), at }); })); };
    /* 상태가 장애를 말하는 Pod(대기 이유·축출·스케줄 못 함)를 먼저, 그다음 재시작이 많은 Pod */
    const worst = [...cx.pods].sort((a, b) => L.podFacts(b).length - L.podFacts(a).length || restarts(b) - restarts(a)).slice(0, 2);
    for (const p of retry ? [] : worst) {
      const status = (p.status?.containerStatuses ?? []).map(c => ({ name: c.name, containerID: c.containerID, restartCount: c.restartCount, state: c.state, lastState: c.lastState }));
      const limits = (p.spec?.containers ?? []).map(c => ({ name: c.name, resources: c.resources ?? {} })), facts = L.podFacts(p);
      /* 메모리로 죽은 컨테이너마다 이름·init 여부·끝난 시각(원인 판정이 그 컨테이너와 인시던트 구간에 묶는다) */
      const oom = [...(p.status?.initContainerStatuses ?? []).map(c => [c, true]), ...(p.status?.containerStatuses ?? []).map(c => [c, false])]
        .flatMap(([c, init]) => [c.lastState?.terminated, c.state?.terminated].filter(x => x?.reason === 'OOMKilled').map(x => ({ container: c.name, init, at: ms(x.finishedAt) })));
      const pod = { ...(facts.length ? { phase: p.status?.phase, ...(p.status?.reason ? { reason: p.status.reason, message: p.status.message } : {}), conditions: (p.status?.conditions ?? []).filter(c => c.status !== 'True').map(c => ({ type: c.type, status: c.status, reason: c.reason, message: c.message })) } : {}),
        ...((p.status?.initContainerStatuses ?? []).length ? { initContainerStatuses: p.status.initContainerStatuses.map(c => ({ name: c.name, restartCount: c.restartCount, state: c.state, lastState: c.lastState })) } : {}),
        containerStatuses: status, containers: limits };
      tasks.push(Promise.resolve(cite(inc, { kind: 'object', source: 'kubernetes', target: { kind: 'Pod', namespace: ns, name: p.metadata.name, uid: p.metadata.uid }, window: { from: at, to: at },
        query: `GET /api/v1/namespaces/${ns}/pods/${p.metadata.name}`, result: { object: yaml.dump(pod, { lineWidth: 160 }), restarts: restarts(p), oom,
          ...(facts.length ? { facts: facts.map(({ reason, message, container }) => ({ reason, message, container: container ?? null })), node: p.spec?.nodeName ?? null } : {}) }, total: status.length, collectedAt: at, sourceState: 'ok' })));
    }
    /* 소유자 자신의 조건(Node Ready·압박, 롤아웃 마감, Job 실패): 조건이 장애를 말할 때만(Node는 늘) */
    const ownerFacts = cx.owner && OWNER_PATH[tg.kind] ? L.conditionFacts({ ...cx.owner, kind: tg.kind }) : [];
    if (!retry && cx.owner && OWNER_PATH[tg.kind] && (ownerFacts.length || tg.kind === 'Node')) {
      const conds = (cx.owner.status?.conditions ?? []).map(c => ({ type: c.type, status: c.status, reason: c.reason, message: c.message, lastTransitionTime: c.lastTransitionTime }));
      tasks.push(Promise.resolve(cite(inc, { kind: 'object', role: 'owner', source: 'kubernetes', target: { kind: tg.kind, namespace: ns, name: tg.name, uid: cx.owner.metadata?.uid ?? tg.uid ?? null }, window: { from: at, to: at },
        query: `GET ${OWNER_PATH[tg.kind](ns, tg.name)} (status.conditions)`, result: { object: yaml.dump({ conditions: conds, ...(tg.kind === 'Node' ? { unschedulable: !!cx.owner.spec?.unschedulable, taints: cx.owner.spec?.taints ?? [] } : {}) }, { lineWidth: 160 }),
          facts: ownerFacts.map(({ reason, message }) => ({ reason, message })) }, total: conds.length, collectedAt: at, sourceState: 'ok' })));
    }
    const eventsQuery = `GET /api/v1/namespaces/${ns}/events (involvedObject in ${tg.kind} ${tg.name} and its Pods)`;
    /* 이벤트는 그 대상 객체(종류·이름, 둘 다 UID를 알면 UID까지)로 고른다: 같은 이름의 다른 종류(Service와 같은 이름의 Deployment)나 다시 만든 객체의 이벤트는 섞이지 않는다 */
    const subjects = [{ kind: tg.kind, name: tg.name, uid: tg.uid ?? null }, ...cx.pods.map(p => ({ kind: 'Pod', name: p.metadata.name, uid: p.metadata.uid })),
      ...cx.replicasets.map(r => ({ kind: 'ReplicaSet', name: r.metadata.name, uid: r.metadata.uid })), ...(cx.jobs ?? []).map(j => ({ kind: 'Job', name: j.metadata.name, uid: j.metadata.uid })),
      ...(cx.claims ?? []).map(name => ({ kind: 'PersistentVolumeClaim', name, uid: null }))];
    const about = e => { const o = e.involvedObject ?? e.regarding ?? {}; return subjects.some(s => sameRef(s, { kind: o.kind, name: o.name, uid: o.uid ?? null })); };
    read('events', 'events', eventsQuery, () => sources.list(id, 'events', ns).then(list => {
      const summary = L.eventSummary(list.filter(about), { from: window.from, to: window.to });
      return cite(inc, { kind: 'events', source: 'kubernetes', target: { kind: tg.kind, namespace: ns, name: tg.name, uid: tg.uid ?? null }, window,
        query: eventsQuery,
        result: { rows: summary.rows.map(r => ({ last: r.last, type: r.type, reason: r.reason, object: `${r.kind}/${r.name}`, count: r.count, message: r.message, source: r.source || null })) }, total: summary.occurrences, collectedAt: at, sourceState: 'ok' });
    }));
    /* 준비된 endpoint 없는 Service: 그 EndpointSlice와 선택자에 맞는 Pod·워크로드를 읽어 감지와 같은 endpointFacts로 사실을 고정(신호의 Service, 없으면 대상 Service) */
    const services = [...new Set([...inc.signals.filter(s => s.object?.kind === 'Service').map(s => s.object.name), ...(tg.kind === 'Service' ? [tg.name] : [])])].slice(0, 3);
    if (inc.rule === 'no-endpoints') for (const name of services) {
      const route = `/apis/discovery.k8s.io/v1/namespaces/${ns}/endpointslices?labelSelector=${encodeURIComponent(`kubernetes.io/service-name=${name}`)}`;
      read(`endpoints:${name}`, 'object', `GET ${route}`, async () => {
        const [svcs, slices, pods, ...made] = await Promise.all([sources.list(id, 'services', ns), sources.kube(id, route), sources.list(id, 'pods', ns), ...['deployments', 'statefulsets', 'daemonsets'].map(k => sources.list(id, k, ns))]);
        const svc = (svcs ?? []).find(s => s.metadata?.name === name);
        if (!svc) throw Object.assign(new Error('service not found'), { status: 404 });
        const items = (slices?.items ?? []).map(s => ({ ...s, kind: 'EndpointSlice' }));
        const facts = L.endpointFacts(svc, { slices: items, pods: pods ?? [], workloads: made.flat() });
        const shown = { type: svc.spec?.type ?? 'ClusterIP', selector: svc.spec?.selector ?? {}, slices: items.map(s => ({ name: s.metadata?.name, endpoints: (s.endpoints ?? []).map(e => ({ addresses: e.addresses, ready: e.conditions?.ready ?? null, targetRef: e.targetRef ? `${e.targetRef.kind}/${e.targetRef.name}` : null })) })) };
        return cite(inc, { kind: 'object', role: 'endpoints', source: 'kubernetes', target: { kind: 'Service', namespace: ns, name, uid: svc.metadata?.uid ?? null }, window: { from: at, to: at }, query: `GET ${route}`,
          result: { object: yaml.dump(shown, { lineWidth: 160 }), facts: facts.map(({ reason, message, selector }) => ({ reason, message, selector })) }, total: items.reduce((a, s) => a + (s.endpoints ?? []).length, 0), collectedAt: at, sourceState: 'ok' });
      });
    }
    /* 메모리는 신호가 가리킨 컨테이너(메모리로 죽은 사이드카·init 포함), 없으면 첫 컨테이너 */
    const spec = templateContainer(cx.owner, signalContainers(inc)[0]) ?? templateContainer(cx.owner, cx.owner?.spec?.template?.spec?.containers?.[0]?.name);
    const container = spec?.container.name, memLimit = spec?.container.resources?.limits?.memory;
    /* 메모리는 이 소유자의 실제 Pod 이름으로만 고른다: 이름 앞부분(api-.*)은 다른 워크로드(api-gateway)의 Pod도 잡는다 */
    const podNames = cx.pods.map(p => p.metadata.name).filter(name => /^[a-z0-9.-]+$/.test(name));
    if (container && tg.kind !== 'Node' && podNames.length) {
      const q = `max by (pod) (container_memory_working_set_bytes{namespace="${ns}", pod=~"${podNames.map(name => name.replaceAll('.', '\\\\.')).join('|')}", container="${container}"}) / 1048576`;
      const limit = memMi(memLimit);
      read('memory', 'metric', q, () => sources.promRange(id, q, { ...window, step: stepFor(window) }).then(series => cite(inc, { kind: 'metric', source: 'prometheus', target: { kind: tg.kind, namespace: ns, name: tg.name, container }, window, query: q,
        result: { series: series.map(s => ({ labels: { ...s.labels, container }, unit: 'Mi', refs: limit ? [{ value: limit, label: `limit ${memLimit}`, tone: 'limit' }] : [], samples: s.samples.map(x => ({ at: x.at, value: r1(x.value) })) })) },
        total: series.reduce((a, s) => a + s.samples.length, 0), collectedAt: at, sourceState: 'ok' })));
    }
    if (cx.ing) {
      const { ratio, rps } = impactQueries(ns, cx.ing.metadata.name);
      read('impact', 'metric', ratio, () => Promise.all([sources.promRange(id, ratio, { ...window, step: stepFor(window) }), sources.promRange(id, rps, { ...window, step: stepFor(window) })]).then(([a, b]) => cite(inc, { kind: 'metric', source: 'prometheus', role: 'impact',
        target: { kind: 'Ingress', namespace: ns, name: cx.ing.metadata.name }, window, query: ratio,
        result: { series: [{ labels: { pod: cx.ing.metadata.name, container: '5xx' }, unit: '%', refs: [{ value: r1(100 - cx.slo), label: `SLO ${cx.slo}%`, tone: 'limit' }], samples: (a[0]?.samples ?? []).map(x => ({ at: x.at, value: x.value == null ? null : Math.round(x.value * 1000) / 1000 })) },
          { labels: { pod: cx.ing.metadata.name, container: 'rps' }, unit: 'req/s', samples: b[0]?.samples ?? [] }], rpsQuery: rps, slo: cx.slo },
        total: a[0]?.samples.length ?? 0, collectedAt: at, sourceState: 'ok' })));
    }
    const crashed = worst.find(p => (p.status?.containerStatuses ?? []).some(c => c.lastState?.terminated));
    if (crashed) {
      const c = crashed.status.containerStatuses.find(x => x.lastState?.terminated);
      const route = `/api/v1/namespaces/${ns}/pods/${crashed.metadata.name}/log?container=${encodeURIComponent(c.name)}&previous=true&timestamps=true&tailLines=200`;
      read('logs', 'logs', `GET ${route}`, () => sources.kube(id, route, { raw: true, maxBytes: 512 * 1024 }).then(text => {
        const lines = String(text).split('\n').filter(Boolean).map((l, i) => { const sp = l.indexOf(' '); const level = /\b(error|fatal|panic)\b/i.test(l) ? 'ERROR' : /\bwarn/i.test(l) ? 'WARN' : 'INFO'; return { n: i + 1, at: ms(l.slice(0, sp)) ?? at, level, text: l.slice(sp + 1) }; });
        const ex = L.logExcerpt(lines, { level: 'ERROR', around: 0 });
        return cite(inc, { kind: 'logs', source: 'kubernetes', key: 'ERROR', target: { kind: 'Pod', namespace: ns, name: crashed.metadata.name, uid: crashed.metadata.uid, container: c.name, containerId: c.containerID, previous: true },
          window: { from: lines[0]?.at ?? at, to: lines.at(-1)?.at ?? at }, query: `GET ${route}`, result: { lines }, hits: ex.hits, total: lines.length, collectedAt: at, sourceState: 'ok' });
      }));
    }
    /* 도구 사용자 항목: 도구 GET이 연결된 때만(없으면 근거도 실패도 아님) */
    if (typeof sources.tool === 'function') {
      if (inc.alert?.name) read('rule', 'rule', `GET /api/v1/rules?type=alert&rule_name[]=${inc.alert.name}`, () => citeRule(inc, at));
      read('silences', 'silences', 'GET /api/v2/silences', () => citeSilences(inc, at));
    }
    if (cx.app && !retry) {
      const history = (cx.app.status?.history ?? []).slice(-5).map(h => ({ revision: h.revision, deployedAt: h.deployedAt, id: h.id }));
      tasks.push(Promise.resolve(cite(inc, { kind: 'app', source: 'kubernetes', target: { kind: 'Application', namespace: cx.app.metadata.namespace, name: cx.app.metadata.name, uid: cx.app.metadata.uid },
        window: { from: at, to: at }, query: `GET /apis/argoproj.io/v1alpha1/namespaces/${cx.app.metadata.namespace}/applications/${cx.app.metadata.name} (status.history, sync)`,
        result: { object: yaml.dump({ sync: cx.app.status?.sync?.status, health: cx.app.status?.health?.status, revision: cx.app.status?.sync?.revision, history }), sync: cx.app.status?.sync?.status ?? null, app: cx.app.metadata.name }, total: history.length, collectedAt: at, sourceState: 'ok' })));
    }
    await Promise.all(tasks);
    incidents.put(inc.id, failures.length ? { ...incidents.get(inc.id), collectedRule: inc.rule, collectPending: { phase: inc.phase, failures, retryAt: at + EVIDENCE_RETRY } }
      : { ...incidents.get(inc.id), collectedPhase: inc.phase, collectedRule: inc.rule, collectedAt: at, collectPending: null });
  }
  const restarts = p => (p.status?.containerStatuses ?? []).reduce((a, c) => a + (c.restartCount ?? 0), 0);

  /* ---------- 작업면 ---------- */
  async function workspace({ cluster, id }) {
    const L = await lib;
    await scan(cluster).catch(() => null);
    let inc = incidents.get(id);
    if (!inc || inc.cluster !== cluster) return null;
    const cx = await context(inc);
    if (ruleChanged(inc) || (inc.collectedPhase !== inc.phase && !(inc.collectPending?.phase === inc.phase && inc.collectPending.retryAt > now()))) { await collect(inc, cx); inc = incidents.get(id); }
    const ev = pieces(id), t = now(), tg = inc.target;
    const byRole = (kind, role) => [...ev].reverse().find(e => e.kind === kind && (role ? e.role === role : !e.role)) ?? null;
    const objectEv = ev.filter(e => e.kind === 'object' && !e.role), eventsEv = byRole('events'), memEv = byRole('metric'), ratioEv = byRole('metric', 'impact'), logEv = byRole('logs'), appEv = byRole('app');
    const end = inc.resolvedAt ?? t;

    /* 영향: 저장한 5xx 근거 조각에서(화면과 보고서가 같은 숫자) */
    let impact = null, userImpact = [];
    if (ratioEv) {
      const ratio = ratioEv.result.series[0]?.samples ?? [], rps = ratioEv.result.series[1]?.samples ?? [];
      const im = L.impactFromSeries({ ratio, rps, from: inc.detectedAt - 5 * MIN, to: Math.min(end, ratioEv.window.to), fixAt: inc.mitigatedAt ?? Infinity, slo: ratioEv.result.slo, scrape: 30_000 });
      const before = ratio.filter(s => s.value != null && s.at < inc.detectedAt - 5 * MIN).map(s => s.value);
      const atDetect = [...ratio].reverse().find(s => s.at <= inc.detectedAt && s.value != null)?.value ?? null;
      if (im) {
        /* now는 고정한 근거의 마지막 표본: at이 그 시각. 해결 전에 그 표본이 2분보다 오래됐거나 Prometheus를 지금 읽지 못하면 stale(화면은 "지금"이 아니라 그 시각으로 보임) */
        const at = [...ratio].reverse().find(s => s.value != null)?.at ?? ratioEv.collectedAt, promState = sources.state(cluster).find(s => s.id === 'prometheus')?.state ?? 'unknown';
        impact = { label: '5xx', unit: '%', now: r1(im.now), at, stale: inc.phase !== 'resolved' && (t - at > 2 * MIN || !['ok', 'limited'].includes(promState)),
          baseline: before.length ? r1(before.reduce((a, v) => a + v, 0) / before.length) : 0, threshold: r1(100 - ratioEv.result.slo), from: inc.detectedAt - 5 * MIN,
          atDetect: r1(atDetect ?? im.now), query: ratioEv.query, scrape: 30_000, samples: ratio, slo: ratioEv.result.slo, ref: ratioEv.n };
        userImpact = L.userImpact({ kind: 'api', impact: im, query: ratioEv.query, final: inc.phase === 'resolved' });
      }
    }
    const want = cx.owner?.spec?.replicas ?? null, have = cx.owner?.status?.readyReplicas ?? 0;
    if (!userImpact.length && want != null) userImpact = L.userImpact({ kind: 'capacity', ready: { ready: have, desired: want }, final: inc.phase === 'resolved' });

    /* 범위: 소유자와 그 Pod */
    const podRow = p => {
      const cs = p.status?.containerStatuses ?? [], waiting = cs.find(c => c.state?.waiting)?.state.waiting.reason, last = cs.find(c => c.lastState?.terminated)?.lastState.terminated;
      const ready = cs.length && cs.every(c => c.ready);
      return { kind: 'Pod', name: p.metadata.name, namespace: p.metadata.namespace, uid: p.metadata.uid, status: waiting ? ['danger', waiting] : !ready ? ['warn', p.status?.phase ?? 'Unknown'] : last && ms(last.finishedAt) > inc.detectedAt - 30 * MIN ? ['warn', `Running · ${last.reason}`] : ['ok', 'Running'],
        restarts: restarts(p), change: { text: `rev ${p.metadata.labels?.['pod-template-hash'] ?? ''}`.trim(), at: ms(p.metadata.creationTimestamp) } };
    };
    const scope = [...(cx.owner && tg.kind !== 'Pod' ? [{ kind: tg.kind, name: tg.name, namespace: tg.namespace, status: want != null ? [have >= want ? 'ok' : 'warn', `Ready ${have}/${want}`] : ['neutral', tg.kind], restarts: '' }] : []), ...cx.pods.map(podRow)];

    /* 타임라인: 롤아웃(ReplicaSet revision), ConfigMap 변경, Argo CD 동기화 이력, 증상 신호 */
    const from = inc.detectedAt - 2 * HOUR;
    const marks = [
      ...cx.replicasets.map(r => ({ id: `rs-${r.metadata.uid}`, lane: 'deploy', at: ms(r.metadata.creationTimestamp), tone: 'info', kind: 'ReplicaSet', title: r.metadata.name, text: `revision ${r.metadata.annotations?.['deployment.kubernetes.io/revision'] ?? '?'}` })),
      ...cx.configmaps.map(c => ({ id: `cm-${c.metadata.uid}`, lane: 'config', at: maxOf((c.metadata.managedFields ?? []).map(f => ms(f.time) ?? 0), ms(c.metadata.creationTimestamp) ?? 0), tone: 'info', kind: 'ConfigMap', title: c.metadata.name, text: `resourceVersion ${c.metadata.resourceVersion}` })),
      ...(cx.app?.status?.history ?? []).map(h => ({ id: `argo-${h.id}`, lane: 'deploy', at: ms(h.deployedAt), tone: 'info', kind: 'Argo CD', title: cx.app.metadata.name, text: `sync ${String(h.revision).slice(0, 7)}` })),
      ...inc.signals.map(s => ({ id: `sig-${s.id}`, lane: s.kind === 'node' || s.reason === 'NodeNotReady' ? 'infra' : 'symptom', at: s.at, ...(s.end ? { end: s.end } : {}), tone: 'danger', kind: s.reason, title: `${s.object.kind} ${s.object.name}`, text: s.message || `× ${s.count}` })),
    ].filter(m => m.at != null && m.at >= from && m.at <= end + MIN).sort((a, b) => a.at - b.at);

    /* 원인 사슬: 관측(근거 번호), 규칙, AI 해석(있을 때만), 확인 안 됨, 확인 계획 */
    /* 메모리로 죽은 기록이 원인을 증명하는 것: 신호가 말한 바로 그 종료(컨테이너·끝난 시각), 또는 인시던트 구간 안(감지 직전 active 구간부터)의 그
       컨테이너(신호가 컨테이너를 말하지 않으면 아무 컨테이너) 종료. 오래전 OOM이나 다른 컨테이너의 OOM은 아님 */
    const rule = inc.rule, ooms = inc.signals.filter(s => ['OOMKilled', 'OOMKilling'].includes(s.reason) && s.object?.container);
    const named = new Set(ooms.map(s => s.object.container)), exact = new Set(ooms.map(s => `${s.object.container}|${s.at}`));
    const during = o => o.at != null && o.at >= inc.detectedAt - L.DETECT.active && o.at <= end + MIN && (!named.size || named.has(o.container));
    const oomHits = objectEv.flatMap(e => (e.result.oom ?? []).filter(o => exact.has(`${o.container}|${o.at}`) || during(o)).map(o => ({ ...o, n: e.n })));
    const oom = [...new Set(oomHits.map(o => o.n))], oomAt = templateContainer(cx.owner, oomHits[0]?.container);
    const memPeak = memEv ? maxOf(memEv.result.series.flatMap(s => s.samples.map(x => x.value ?? 0)), 0) : null, limit = memEv?.result.series[0]?.refs?.[0]?.value ?? null;
    const observe = [
      ...(objectEv.length ? [{ text: T('wake.inc.obs.restarts', { pods: objectEv.length, n: objectEv.reduce((a, e) => a + (e.result.restarts ?? 0), 0), reasons: Object.keys(inc.reasons).join(', ') }), refs: objectEv.map(e => e.n) }] : []),
      ...(memEv && memPeak != null ? [{ text: T(limit ? 'wake.inc.obs.memLimit' : 'wake.inc.obs.mem', { peak: r1(memPeak), limit: r1(limit) }), refs: [memEv.n] }] : []),
      ...(eventsEv ? [{ text: T('wake.inc.obs.events', { n: eventsEv.total, rows: eventsEv.result.rows.filter(r => r.type === 'Warning').map(r => `${r.reason} ×${r.count}`).slice(0, 3).join(', ') }), refs: [eventsEv.n] }] : []),
      ...(logEv?.hits?.length ? [{ text: T('wake.inc.obs.logs', { n: logEv.hits.length, total: logEv.total }), refs: [logEv.n] }] : []),
      ...(impact ? [{ text: T('wake.inc.obs.ratio', { now: impact.now, limit: impact.threshold }), refs: [ratioEv.n] }] : []),
      ...(appEv ? [{ text: T('wake.inc.obs.app', { app: appEv.result.app, sync: appEv.result.sync ?? '?' }), refs: [appEv.n] }] : []),
    ];
    /* 원인 사실: 고정한 근거(Pod 상태, 소유자 조건, Warning 이벤트)가 말하는 이유를 감지와 같은 규칙 표로 읽어 이 규칙의 것만 */
    /* 소유자 조건·Service endpoint 조각은 단계마다 하나씩 쌓인다: 복구 뒤 조각에 사실이 없어도 앞 단계 조각이 증명한 원인은 남는다(Pod 조각과 같이 모두 읽음) */
    /* 이벤트 사실은 감지와 같은 표로: 그 이유를 쓰는 대상 종류와 보고 구성 요소(남긴 곳이 있을 때)만 */
    const eventFrom = f => { if (f.reporter === undefined) return true; const { on, from } = L.SIGNALS[f.reason] ?? {}; return (!on || on.includes(f.kind)) && (!from || !f.reporter || f.reporter === from); };
    const ownerEv = ev.filter(e => e.kind === 'object' && e.role === 'owner'), endpointEv = ev.filter(e => e.kind === 'object' && e.role === 'endpoints');
    const facts = [
      ...objectEv.flatMap(e => (e.result.facts ?? []).map(f => ({ ...f, kind: 'Pod', object: e.target.name, node: e.result.node ?? null, n: e.n }))),
      ...endpointEv.flatMap(e => (e.result.facts ?? []).map(f => ({ ...f, kind: 'Service', object: e.target.name, n: e.n }))),
      ...ownerEv.flatMap(e => (e.result.facts ?? []).map(f => ({ ...f, kind: tg.kind, object: tg.name, n: e.n }))),
      ...(eventsEv ? eventsEv.result.rows.filter(r => r.type === 'Warning').map(r => ({ reason: r.reason, message: r.message, count: r.count, kind: String(r.object).split('/')[0], object: String(r.object).split('/').slice(1).join('/'), reporter: r.source ?? null, n: eventsEv.n })) : []),
    ].map(f => ({ ...f, ...(L.classify(f.reason, f.message) ?? {}) })).filter(f => f.rule === rule && (f.count ?? Infinity) >= (L.SIGNALS[f.reason]?.min ?? 1) && eventFrom(f));
    const cause = facts.find(f => f.cause)?.cause ?? null, lead = facts.find(f => f.cause === cause) ?? facts[0] ?? null;
    const shortText = s => { const v = String(s ?? '').replace(/\s+/g, ' ').trim().replace(/\.$/, ''); return v.length > 160 ? `${v.slice(0, 157)}…` : v; };
    const seenFact = new Set();
    if (FACT_RULES.has(rule)) for (const f of facts) {
      const k = `${f.reason}|${f.message}`; if (seenFact.has(k) || seenFact.size >= 3) continue; seenFact.add(k);
      observe.push({ text: T('wake.inc.obs.fact', { object: `${f.kind} ${f.object}`, reason: f.reason, detail: shortText(f.message) || f.reason }), refs: [f.n] });
    }
    const matched = rule === 'oom-limit' ? oom.length > 0 : FACT_RULES.has(rule) ? facts.length > 0 : observe.length > 0;
    const grade = !matched ? 'insufficient' : rule === 'oom-limit' || CONFIRMS[rule]?.(cause) ? 'confirmed' : 'inferred';
    /* 원인 메시지가 가리키는 ConfigMap·Secret과 키 */
    const missing = lead && rule === 'container-config' ? (m => ({ kind: /secret/i.test(m) && !/configmap/i.test(m) ? 'secret' : 'configmap', name: (/(?:configmaps?|secrets?) "([^"]+)"/i.exec(m) ?? /in (?:ConfigMap|Secret) [^/\s]+\/(\S+)/i.exec(m))?.[1] ?? null, key: /couldn't find key (\S+)/i.exec(m)?.[1] ?? null }))(String(lead.message)) : null;
    const pod = facts.find(f => f.kind === 'Pod')?.object ?? cx.pods[0]?.metadata.name ?? null, container = facts.find(f => f.container)?.container ?? cx.owner?.spec?.template?.spec?.containers?.[0]?.name ?? null;
    const vars = { name: tg.name, container: oomAt?.container.name ?? oomHits[0]?.container ?? [...named][0] ?? container ?? '', limit: (oomAt?.container ?? templateContainer(cx.owner, [...named][0])?.container ?? cx.owner?.spec?.template?.spec?.containers?.[0])?.resources?.limits?.memory ?? '',
      detail: shortText(lead?.message), object: missing?.name ?? (lead ? `${lead.kind} ${lead.object}` : ''), key: missing?.key ?? '' };
    const ai = inc.interpretation;
    const chain = { grade, source: { kind: 'rule', name: rule, version: L.RULES[rule] ?? 'v1' },
      conclusion: T(!matched ? 'wake.inc.rule.unmatched' : cause ? `wake.inc.rule.${rule}.${cause}` : `wake.inc.rule.${rule}.conclusion`, vars),
      cells: { observe, basis: [{ text: T(`wake.inc.rule.${rule}.basis`) }], interpret: ai ? [{ text: ai.text, refs: ai.refs ?? [] }] : [],
        unknown: [{ text: T(`wake.inc.rule.${rule}.unknown`) }], verify: [{ text: T('wake.inc.verify.plan', { min: 5 }) }] } };

    /* 조치 후보: 소유 관계(ownership.js)가 길을 정한다. 자동 동기화 Application이면 Draft PR. 고칠 곳이 Wake 밖이면 확인 명령을 든 직접 단계(쓰기 없음).
       쓰는 명령은 이 인시던트의 클러스터(context)를 이름으로 고정하고, 값 바꾸기는 대상 UID·컨테이너 이름·바꾸기 전 값을 JSON patch test로 확인한다(달라졌으면 실패) */
    const options = [], factRefs = [...new Set(facts.map(f => f.n))].join(', ');
    const ctr = cx.owner?.spec?.template?.spec?.containers ?? [];
    /* 컨테이너 한도 두 배(OOMKilled → 메모리로 죽은 그 컨테이너의 limits.memory, 저장 한도 축출 → limits.ephemeral-storage) */
    const raise = (id, res, basis, at) => {
      const before = at?.container.resources?.limits?.[res], mi = memMi(before);
      if (!cx.owner || !at || !mi) return;
      const after = `${Math.ceil(mi * 2)}Mi`, base = `spec.template.spec.${at.field}[${at.index}]`;
      options.push({ id, title: T(id === 'raise-memory' ? 'wake.inc.opt.raiseMemory' : 'wake.inc.opt.raiseEphemeral', { before, after, container: at.container.name }), grade: 'confirmed', basis, reach: T('wake.inc.opt.reachRollout', { n: want ?? cx.pods.length }),
        recovery: 'service', plan: L.planFor({ resource: cx.owner, context: inc.cluster, change: { id, title: id, guards: [{ path: `${base}.name`, value: at.container.name }], values: [{ path: `${base}.resources.limits.${res}`, before, after }] }, owner: cx.ownership }) });
    };
    if (rule === 'oom-limit') raise('raise-memory', 'memory', T('wake.inc.opt.basisOom', { refs: oom.join(', ') }), oomAt);
    if (rule === 'evicted' && cause === 'limit') { const i = ctr.findIndex(c => c.resources?.limits?.['ephemeral-storage']); raise('raise-ephemeral', 'ephemeral-storage', T('wake.inc.opt.basisFacts', { refs: factRefs }), i >= 0 ? { container: ctr[i], index: i, field: 'containers' } : null); }
    /* 되돌리기: 감지 직전 롤아웃의 바로 앞 revision의 템플릿으로(ownership.js rollbackChange). kubectl rollout undo와 달리 같은 객체(UID)·같은
       generation·계획한 revision일 때만 적용되는 JSON patch라 같은 이름의 대체나 그 뒤 롤아웃을 되돌리지 않는다. 자동 동기화 Application이면 Draft PR */
    const revision = r => Number(r.metadata.annotations?.['deployment.kubernetes.io/revision']);
    /* 원인으로 짚은 롤아웃: 인시던트 신호의 Pod가 속한 ReplicaSet(Pod 이름이 <ReplicaSet 이름>-…). 신호에 Pod가 없으면 감지 직전에 만들어진 것 중 revision이 가장 큰 것.
       옛 템플릿으로 되돌린 수정은 옛 ReplicaSet을 다시 써 revision만 올리므로 만든 시각·revision만으로는 짚을 수 없다 */
    const signalled = new Set(inc.signals.filter(x => x.object?.kind === 'Pod').map(x => x.object.name));
    const byPods = cx.replicasets.filter(r => revision(r) > 1 && [...signalled].some(n => n.startsWith(`${r.metadata.name}-`)));
    const recentRollout = (byPods.length ? byPods : cx.replicasets.filter(r => ms(r.metadata.creationTimestamp) > inc.detectedAt - 2 * HOUR && ms(r.metadata.creationTimestamp) <= inc.detectedAt + MIN && revision(r) > 1))
      .sort((a, b) => revision(a) - revision(b));
    const previous = recentRollout.length ? cx.replicasets.filter(r => revision(r) < revision(recentRollout.at(-1))).sort((a, b) => revision(b) - revision(a))[0] ?? null : null;
    /* Helm 릴리스면 helm rollback(revision은 Wake가 읽지 않는 릴리스 Secret에 있어 Helm이 실행 때 앞 릴리스로 고름: 그 주의를 note로). 명령도 PR도 없으면 내지 않는다 */
    /* 지금 살아 있는 revision이 원인으로 짚은 롤아웃의 revision일 때만 낸다(그 뒤 고친 revision이 이미 배포됐으면 되돌리기가 그 수정을 되돌림).
       UID·generation·revision 주석이 모두 있어야 guard를 거는 patch가 된다(rollbackChange가 null이면 내지 않음) */
    const live = Number(cx.owner?.metadata?.annotations?.['deployment.kubernetes.io/revision']);
    const change = cx.owner && tg.kind === 'Deployment' && previous?.spec?.template && ROLLBACK_RULES.has(rule) && live === revision(recentRollout.at(-1)) ? L.rollbackChange({ deployment: cx.owner, to: previous }) : null;
    const back = change ? L.planFor({ resource: cx.owner, context: inc.cluster, change, owner: cx.ownership }) : null;
    if (back && (back.route === 'pr' || back.command)) {
      const release = back.route === 'helm';
      options.push({ id: 'rollback', title: release ? T('wake.inc.opt.rollbackRelease', { name: tg.name, release: back.release }) : T('wake.inc.opt.rollback', { name: tg.name, revision: revision(previous) }),
        grade: 'inferred', basis: T('wake.inc.opt.basisRollout', { at: recentRollout.at(-1).metadata.creationTimestamp }), reach: T('wake.inc.opt.reachRollout', { n: want ?? cx.pods.length }),
        recovery: 'service', plan: back, ...(back.checks.includes('helm-previous-release') ? { note: T('wake.inc.opt.helmPrevious', { release: back.release }) } : {}) });
    }
    const check = checkCommand({ rule, cause, tg, pod, container, missing, facts, cx });
    if (check && rule !== 'oom-limit') {
      options.push({ id: 'check', title: T(`wake.inc.opt.check.${rule}`, vars), kind: T('wake.inc.opt.kindManual'), grade, ...(factRefs ? { basis: T('wake.inc.opt.basisFacts', { refs: factRefs }) } : {}),
        reach: T('wake.inc.opt.reachNone'), note: T(`wake.inc.opt.fix.${rule}`, vars), recovery: 'service',
        plan: L.planFor({ resource: cx.owner ?? { kind: tg.kind, metadata: { name: tg.name, namespace: tg.namespace } }, change: { id: 'check', title: 'check', manual: true, command: check }, owner: cx.ownership }) });
    }
    /* Node가 지금 멈추거나 압박받는 동안만 새 Pod가 오지 않게 막기(승인 뒤 사람이 실행). 해결됐거나, 지금 조건이 정상이거나, 이미 막혀 있으면 내지 않음 */
    const nodeSick = tg.kind === 'Node' && cx.owner ? L.conditionFacts({ ...cx.owner, kind: 'Node' }).length > 0 : false;
    if (['node-not-ready', 'node-pressure'].includes(rule) && matched && inc.phase !== 'resolved' && nodeSick && !cx.owner.spec?.unschedulable) {
      options.push({ id: 'cordon', title: T('wake.inc.opt.cordon', { name: tg.name }), grade: 'inferred', basis: T('wake.inc.opt.basisFacts', { refs: factRefs }), reach: T('wake.inc.opt.reachCordon', { name: tg.name }),
        recovery: 'mitigated', plan: L.planFor({ resource: { ...cx.owner, kind: 'Node' }, context: inc.cluster, change: { id: 'cordon', title: 'cordon', values: [{ path: 'spec.unschedulable', after: true, op: 'add' }] }, owner: null }) });
    }

    /* 확인 계획: 같은 신호 없음, Ready, PVC Bound(볼륨 신호가 있을 때), 5xx(근거가 있을 때). 상태는 마지막 확인 구간이 실제로 관측한 것(scan의 observed)에서만:
       관측하지 못한 조건은 unknown, 해결이어도 관측이 없으면 pass라고 하지 않는다. 대상이 지워졌으면 Ready 대신 그 사실 */
    const verdict = L.verifyVerdict({ verifyFrom: inc.verify?.verifyFrom ?? null, now: end, windows: inc.verify?.windows ?? [], times: inc.verify?.times ?? null });
    const seen = inc.observed?.conds ?? {};
    const condState = cid => (inc.phase === 'open' ? undefined : seen[cid] === 'gone' ? 'unknown' : ['fail', 'unknown'].includes(seen[cid]) ? seen[cid] : inc.phase === 'resolved' ? (seen[cid] === 'pass' ? 'pass' : 'unknown') : 'watch');
    const conditions = [{ id: 'no-signal', label: T('wake.inc.verify.noSignal', { reasons: Object.keys(inc.reasons).join(', ') }), source: 'kubernetes', state: condState('no-signal') },
      { id: 'ready', label: inc.subjectGone ? T('wake.inc.verify.gone', { kind: tg.kind, name: tg.name })
        : T({ Node: 'wake.inc.verify.readyNode', PersistentVolumeClaim: 'wake.inc.verify.readyClaim', Job: 'wake.inc.verify.readyJob', CronJob: 'wake.inc.verify.readyJob' }[tg.kind] ?? 'wake.inc.verify.ready'), source: 'kubernetes', state: condState('ready') },
      ...(seen.claim ? [{ id: 'claim', label: T('wake.inc.verify.readyClaim'), source: 'kubernetes', state: condState('claim') }] : []),
      ...(impact || seen.ratio ? [{ id: 'ratio', label: T('wake.inc.verify.ratio', { limit: impact?.threshold ?? inc.observed?.ratioLimit ?? '' }), source: 'prometheus', state: condState('ratio') }] : [])];

    /* 고른 조치: 승인 기록(approvals)에 저장된 계획과 그 결과(PR 만들기 결과). 실행 단계는 영수증이 있을 때만 끝난 것으로 친다(화면이 다시 만든 후보가 아님) */
    const approval = inc.chosen ? store.docs('approvals').all().filter(a => a.incident === id && a.state === 'approved' && a.plan?.id === inc.chosen).sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0))[0] ?? null : null;
    const execution = inc.chosen ? { approval: approval?.id ?? null, title: approval?.title ?? inc.chosenTitle ?? null, decidedAt: approval?.decidedAt ?? inc.approvedAt ?? null, decidedBy: approval?.decidedBy ?? null,
      plan: approval?.plan ?? null, receipts: { pr: approval?.prResult ?? null } } : null;

    const states = Object.fromEntries(sources.state(cluster).map(s => [s.id, s]));
    const used = [...new Set(['kubernetes', ...(inc.alertSource ? ['alertmanager'] : []), ...ev.map(e => e.source)])];
    const sourceList = used.map(sid => ({ id: sid, name: SOURCE_NAMES[sid] ?? sid, icon: SOURCE_ICON[sid] ?? 'plug', state: sourceView(states[sid]?.state ?? 'unknown'), last: states[sid]?.last ?? null, sourceState: states[sid] ?? sources.sourceState(cluster, sid) }));
    const auditRows = store.log('audit').list(r => r.incident === id).sort((a, b) => a.at - b.at);
    const period = (inc.severity === 'critical' ? 30 : 60) * MIN;
    const nextShare = L.nextShare(inc.severity, inc.detectedAt + Math.max(0, Math.floor((t - inc.detectedAt) / period)) * period);
    if (!ai && interpret && inc.phase !== 'resolved') void interpret({ ...inc, observe, cluster }).catch(() => null);
    return {
      id: inc.id, number: inc.number, title: titleOf(inc), cluster, namespace: tg.namespace, severity: inc.severity, phase: inc.phase, lifecycle: inc.phase,
      detectedAt: inc.detectedAt, now: t, resolvedAt: inc.resolvedAt, mitigatedAt: inc.mitigatedAt, recovery: inc.recovery, nextShare,
      oncall: { name: user() }, target: { kind: tg.kind, name: tg.name, namespace: tg.namespace, uid: tg.uid ?? cx.owner?.metadata?.uid ?? null, ...(cx.replaced ? { replaced: true } : {}), ...(inc.subjectGone ? { gone: inc.subjectGone } : {}) },
      alert: { source: inc.alert?.source ?? 'Wake', name: inc.alert?.name ?? Object.keys(inc.reasons)[0] },
      links: Object.fromEntries(Object.entries(L.linksOf({}, { id: inc.id, cluster }) ?? {}).filter(([, v]) => typeof v === 'string')), sources: sourceList, scope, impact, userImpact, timeline: marks, chain, rule: { name: rule, version: L.RULES[rule] ?? 'v1' }, skill: null,
      options, chosen: inc.chosen ?? null, approvedAt: inc.approvedAt ?? null, execution, fixAt: inc.mitigatedAt ?? null, evidence: ev.map(({ identity, incident, ...e }) => e),
      evidenceFailures: inc.collectPending?.phase === inc.phase ? inc.collectPending.failures.map(({ key, ...f }) => f) : [], audit: auditRows,
      verify: { verifyFrom: inc.verify?.verifyFrom ?? null, stable: verdict.stable, need: L.VERIFY_DEFAULT.need, max: L.VERIFY_DEFAULT.max, cadence: L.VERIFY_DEFAULT.cadence, windows: verdict.windows, conditions },
      ...(inc.phase === 'resolved' ? { figure: L.figureWindow({ detectedAt: inc.detectedAt, verifiedAt: inc.resolvedAt }) } : {}),
      ownership: cx.ownership, argoReadable: cx.argoReadable,
    };
  }

  /** AI 해석 저장(내장 AI가 관측만 보고 쓴 글). 사람이 고친 것이 아님을 모델 이름과 함께 남긴다 */
  function setInterpretation(id, value) { const inc = incidents.get(id); if (inc) incidents.put(id, { ...inc, interpretation: value }); }
  /** 사람이 고른 조치(승인 기록과 함께): 실행하지 않는다 */
  function choose(id, option) { const inc = incidents.get(id); if (inc) incidents.put(id, { ...inc, chosen: option.id, chosenTitle: option.title, approvedAt: now() }); }

  return { scan, rows, workspace, cite, citeToolItems, pieces, setInterpretation, choose, get: id => incidents.get(id) };
}

module.exports = { createIncidentHub };
