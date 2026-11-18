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
/** 판정 규칙 표(앱 자료): 이름과 버전. 글은 locale wake.inc.rule.<id>.* */
const RULES = { 'oom-limit': 'v1', 'crash-loop': 'v1', unschedulable: 'v1', 'node-not-ready': 'v1', 'job-failed': 'v1', alert: 'v1' };
const POD_OWNER = { Deployment: 'ReplicaSet', StatefulSet: null, DaemonSet: null, Job: null, CronJob: 'Job' };
const ms = v => (v == null || v === '' ? null : typeof v === 'number' ? v : (t => (Number.isFinite(t) ? t : null))(Date.parse(v)));
const memMi = v => { const m = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|k|M|G)?$/.exec(String(v ?? '')); if (!m) return null; const f = { Ki: 1 / 1024, Mi: 1, Gi: 1024, Ti: 1048576, k: 1000 / 1048576, M: 1e6 / 1048576, G: 1e9 / 1048576 }[m[2]] ?? 1 / 1048576; return Number(m[1]) * f; };
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
const maxOf = (values, floor = -Infinity) => values.reduce((a, v) => (v > a ? v : a), floor);
/* Prometheus 한 질의의 점 수 상한(11,000) 아래로: 구간이 길면 step을 늘린다(최소 30초) */
const stepFor = w => Math.max(30_000, Math.ceil((w.to - w.from) / 10_000 / 1000) * 1000);
/* 감지가 읽는 목록: 경로와 남길 필드(P-01). 페이지 500개, 최대 40페이지(넘으면 partial) */
const NSP = n => (n ? `/namespaces/${encodeURIComponent(n)}` : '');
const DETECT_PATH = { pods: n => `/api/v1${NSP(n)}/pods`, events: n => `/api/v1${NSP(n)}/events`, nodes: () => '/api/v1/nodes', replicasets: n => `/apis/apps/v1${NSP(n)}/replicasets`, deployments: n => `/apis/apps/v1${NSP(n)}/deployments`,
  statefulsets: n => `/apis/apps/v1${NSP(n)}/statefulsets`, daemonsets: n => `/apis/apps/v1${NSP(n)}/daemonsets`, jobs: n => `/apis/batch/v1${NSP(n)}/jobs` };
const DETECT_KIND = { pods: 'Pod', events: 'Event', nodes: 'Node', replicasets: 'ReplicaSet', deployments: 'Deployment', statefulsets: 'StatefulSet', daemonsets: 'DaemonSet', jobs: 'Job' };
const PAGE = 500, MAX_PAGES = 40;
const slimMeta = m => ({ name: m?.name, namespace: m?.namespace, uid: m?.uid, creationTimestamp: m?.creationTimestamp, labels: m?.labels, annotations: m?.annotations, ownerReferences: m?.ownerReferences });
/** 감지에 쓰는 필드만(큰 spec·managedFields·주석 본문을 들고 있지 않게) */
function project(o, kind) {
  const base = { kind, metadata: slimMeta(o.metadata) };
  if (kind === 'Event') return { ...o, kind, metadata: slimMeta(o.metadata) };
  if (kind === 'Pod') return { ...base, spec: { nodeName: o.spec?.nodeName, containers: (o.spec?.containers ?? []).map(c => ({ name: c.name, resources: c.resources })) }, status: { phase: o.status?.phase, conditions: o.status?.conditions, containerStatuses: o.status?.containerStatuses } };
  if (kind === 'Node') return { ...base, status: { conditions: o.status?.conditions } };
  return { ...base, spec: { replicas: o.spec?.replicas }, status: { readyReplicas: o.status?.readyReplicas, numberReady: o.status?.numberReady, desiredNumberScheduled: o.status?.desiredNumberScheduled, failed: o.status?.failed, succeeded: o.status?.succeeded } };
}

function createIncidentHub({ store, sources, now = Date.now, user = () => os.userInfo().username, audit = () => {}, interpret = null }) {
  const lib = Promise.all([esm('incident-detect.js'), esm('incident-model.js'), esm('ownership.js'), esm('log-excerpt.js'), esm('alerts.js')])
    .then(([detect, model, ownership, logs, alerts]) => ({ ...detect, ...model, ...ownership, ...logs, alertLabels: alerts.alertLabels }));
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
  async function run(id) {
    const L = await lib;
    const settle = p => p.then(v => v, e => ({ error: e }));
    const [alerts, events, pods, rs, jobs, deps, sts, dss, nodes] = await Promise.all([settle(sources.alerts(id)), settle(listAll(id, 'events', 'fieldSelector=type%3DWarning')),
      settle(listAll(id, 'pods')), settle(listAll(id, 'replicasets')), settle(listAll(id, 'jobs')), settle(listAll(id, 'deployments')),
      settle(listAll(id, 'statefulsets')), settle(listAll(id, 'daemonsets')), settle(listAll(id, 'nodes'))]);
    if (pods.error && events.error) throw pods.error;
    const arr = v => (Array.isArray(v) ? v : []);
    const index = new Map();
    for (const o of [...arr(pods), ...arr(rs), ...arr(jobs), ...arr(deps), ...arr(sts), ...arr(dss), ...arr(nodes)]) index.set(`${o.kind}|${o.metadata.namespace ?? ''}|${o.metadata.name}`, o);
    const lookup = (kind, ns, name) => index.get(`${kind}|${ns ?? ''}|${name}`) ?? null;
    const t = now();
    const signals = L.signalsOf({ alerts: arr(alerts), events: arr(events), pods: arr(pods), lookup, now: t });
    const ready = owner => {
      const o = lookup(owner.kind, owner.namespace, owner.name);
      if (!o) return pods.error ? null : owner.kind === 'Pod' || owner.kind === 'Job' ? true : null;
      if (owner.kind === 'Node') return (o.status?.conditions ?? []).some(c => c.type === 'Ready' && c.status === 'True');
      if (owner.kind === 'Job') return !(o.status?.failed > 0) || o.status?.succeeded > 0;
      if (owner.kind === 'CronJob') return true;
      const want = o.spec?.replicas ?? o.status?.desiredNumberScheduled ?? 1, have = o.status?.readyReplicas ?? o.status?.numberReady ?? 0;
      const restarting = arr(pods).some(p => podOf(owner, p, lookup) && (p.status?.containerStatuses ?? []).some(c => c.state?.waiting?.reason === 'CrashLoopBackOff'));
      return have >= want && !restarting;
    };
    const mine = incidents.all().filter(i => i.cluster === id);
    const { incidents: changed, opened } = L.detect({ cluster: id, incidents: mine, signals, now: t, ready, nextNumber });
    for (const inc of changed) {
      const before = mine.find(i => i.id === inc.id);
      const saved = incidents.put(inc.id, { ...inc, at: t, alertSource: alerts.error ? null : 'alertmanager' });
      if (!before) audit({ at: inc.detectedAt, incident: inc.id, action: 'alert', requester: { kind: 'wake', name: inc.alert?.source ?? 'Wake' }, transport: 'desktop', scope: id, executor: 'Wake',
        target: `${inc.target.namespace}/${inc.target.kind}/${inc.target.name}`, result: 'firing', summary: T('wake.inc.audit.detected', { reasons: Object.keys(inc.reasons).join(', ') }) });
      else if (before.phase !== saved.phase) audit({ incident: inc.id, action: saved.phase === 'resolved' ? 'resolve' : 'judge', requester: { kind: 'wake', name: 'Wake' }, transport: 'desktop', scope: id, executor: 'Wake',
        target: `${inc.target.namespace}/${inc.target.kind}/${inc.target.name}`, result: saved.phase === 'resolved' ? saved.recovery : 'ok', summary: T(`wake.inc.audit.${saved.phase}`) });
    }
    return { changed: changed.length, opened: opened.length, signals: signals.length, alerts: alerts.error ? 'error' : arr(alerts).length };
  }
  /* 이 Pod가 소유자 아래인지(ownerReferences 한두 단계) */
  function podOf(owner, pod, lookup) {
    if (pod.metadata.namespace !== owner.namespace) return false;
    const up = (pod.metadata.ownerReferences ?? [])[0];
    if (!up) return owner.kind === 'Pod' && pod.metadata.name === owner.name;
    if (up.kind === owner.kind && up.name === owner.name) return true;
    if (POD_OWNER[owner.kind] === up.kind) { const mid = lookup(up.kind, owner.namespace, up.name); return (mid?.metadata?.ownerReferences ?? []).some(o => o.kind === owner.kind && o.name === owner.name); }
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
  /** 근거 한 조각을 고정: 같은 조각(인시던트, 종류, 질의, 구간, 대상)이면 저장된 번호를 돌려주고 덮어쓰지 않는다 */
  function cite(inc, piece) {
    const identity = hashOf({ incident: inc.id, kind: piece.kind, query: piece.query, window: piece.window, target: piece.target });
    const all = evidence.list(r => r.incident === inc.id);
    const had = all.find(r => r.identity === identity);
    if (had) return had;
    const n = all.reduce((a, r) => Math.max(a, r.n), 0) + 1;
    const decided = inc.chosen && inc.approvedAt && piece.collectedAt > inc.approvedAt;
    return evidence.append({ incident: inc.id, n, identity, ...piece, hash: hashOf(piece.result), ...(decided ? { addedAfter: 'decision' } : {}) });
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

  /** 소유자와 그 Pod, 소유 Application, Service·Ingress(5xx 영향), SLO */
  async function context(inc) {
    const id = inc.cluster, tg = inc.target, ns = tg.namespace;
    const settle = p => p.then(v => v, () => null);
    const [owner, pods, rs, jobs, svcs, ings, apps, cms] = await Promise.all([settle(sources.get(id, tg.kind, ns, tg.name)), settle(sources.list(id, 'pods', ns)),
      settle(sources.list(id, 'replicasets', ns)), settle(sources.list(id, 'jobs', ns)), settle(sources.list(id, 'services', ns)), settle(sources.list(id, 'ingresses', ns)),
      settle(sources.list(id, 'applications')), settle(sources.kube(id, `/api/v1/namespaces/${encodeURIComponent(ns)}/configmaps`).then(r => r.items))]);
    const index = new Map([...(rs ?? []), ...(jobs ?? [])].map(o => [`${o.kind}|${o.metadata.name}`, o]));
    const lookup = (kind, _ns, name) => index.get(`${kind}|${name}`) ?? null;
    const own = tg.kind === 'Node' ? [] : (pods ?? []).filter(p => podOf(tg, p, lookup));
    const labels = owner?.spec?.template?.metadata?.labels ?? {};
    const svc = (svcs ?? []).find(s => Object.keys(s.spec?.selector ?? {}).length && Object.entries(s.spec.selector).every(([k, v]) => labels[k] === v)) ?? null;
    const ing = svc ? (ings ?? []).find(i => (i.spec?.rules ?? []).some(r => (r.http?.paths ?? []).some(p => p.backend?.service?.name === svc.metadata.name))) ?? null : null;
    const L = await lib;
    const slo = Number(svc?.metadata?.annotations?.[SLO_ANNOTATION]);
    const ownership = owner ? L.ownerOf(owner, { applications: apps ?? [] }) : null;
    const app = ownership?.kind === 'argocd' ? (apps ?? []).find(a => a.metadata.name === ownership.app) ?? null : null;
    const refs = new Set((owner?.spec?.template?.spec?.containers ?? []).flatMap(c => [...(c.envFrom ?? []).map(e => e.configMapRef?.name), ...(c.env ?? []).map(e => e.valueFrom?.configMapKeyRef?.name)])
      .concat((owner?.spec?.template?.spec?.volumes ?? []).map(v => v.configMap?.name)).filter(Boolean));
    return { owner, pods: own, replicasets: (rs ?? []).filter(r => (r.metadata.ownerReferences ?? []).some(o => o.kind === tg.kind && o.name === tg.name)),
      svc, ing, slo: Number.isFinite(slo) && slo > 0 && slo < 100 ? slo : L.SLO_DEFAULT, ownership, app, configmaps: (cms ?? []).filter(c => refs.has(c.metadata.name)), argoReadable: apps !== null };
  }

  /** 단계가 바뀔 때 근거를 모아 고정한다(대상 Pod 상태, 이벤트, 메모리, 5xx 비율, 이전 컨테이너 로그, Application 이력) */
  /* 읽기 실패는 근거 조각이 아니다(RULE-EVIDENCE): 종류·질의·원인을 인시던트에 남기고 그 단계는 모은 것으로 치지 않는다. EVIDENCE_RETRY(1분) 뒤 실패한 읽기만 다시 한다 */
  const failureReason = e => e?.kind || (Number(e?.status) === 403 ? 'forbidden' : Number(e?.status) === 404 ? 'missing' : Number(e?.status) >= 500 ? `http_${Number(e.status)}` : e?.name === 'AbortError' ? 'cancelled' : 'query_error');
  const EVIDENCE_RETRY = MIN;
  async function collect(inc, cx) {
    const L = await lib, id = inc.cluster, tg = inc.target, ns = tg.namespace, at = now();
    const window = { from: inc.detectedAt - 30 * MIN, to: at };
    const tasks = [], failures = [];
    const retry = inc.collectPending?.phase === inc.phase ? new Set(inc.collectPending.failures.map(f => f.key)) : null, want = key => !retry || retry.has(key);
    const read = (key, kind, query, promise) => { if (want(key)) tasks.push(promise().catch(e => { failures.push({ key, kind, query, reason: failureReason(e), at }); })); };
    const worst = [...cx.pods].sort((a, b) => restarts(b) - restarts(a)).slice(0, 2);
    for (const p of retry ? [] : worst) {
      const status = (p.status?.containerStatuses ?? []).map(c => ({ name: c.name, containerID: c.containerID, restartCount: c.restartCount, state: c.state, lastState: c.lastState }));
      const limits = (p.spec?.containers ?? []).map(c => ({ name: c.name, resources: c.resources ?? {} }));
      tasks.push(Promise.resolve(cite(inc, { kind: 'object', source: 'kubernetes', target: { kind: 'Pod', namespace: ns, name: p.metadata.name, uid: p.metadata.uid }, window: { from: at, to: at },
        query: `GET /api/v1/namespaces/${ns}/pods/${p.metadata.name}`, result: { object: yaml.dump({ containerStatuses: status, containers: limits }, { lineWidth: 160 }), restarts: restarts(p), oomKilled: status.some(c => c.lastState?.terminated?.reason === 'OOMKilled') }, total: status.length, collectedAt: at, sourceState: 'ok' })));
    }
    const eventsQuery = `GET /api/v1/namespaces/${ns}/events (involvedObject in ${tg.kind} ${tg.name} and its Pods)`;
    read('events', 'events', eventsQuery, () => sources.list(id, 'events', ns).then(list => {
      const names = new Set([tg.name, ...cx.pods.map(p => p.metadata.name), ...cx.replicasets.map(r => r.metadata.name)]);
      const summary = L.eventSummary(list.filter(e => names.has(e.involvedObject?.name)), { from: window.from, to: window.to });
      return cite(inc, { kind: 'events', source: 'kubernetes', target: { kind: tg.kind, namespace: ns, name: tg.name, uid: tg.uid ?? null }, window,
        query: eventsQuery,
        result: { rows: summary.rows.map(r => ({ last: r.last, type: r.type, reason: r.reason, object: `${r.kind}/${r.name}`, count: r.count, message: r.message })) }, total: summary.occurrences, collectedAt: at, sourceState: 'ok' });
    }));
    const container = cx.owner?.spec?.template?.spec?.containers?.[0]?.name;
    /* 메모리는 이 소유자의 실제 Pod 이름으로만 고른다: 이름 앞부분(api-.*)은 다른 워크로드(api-gateway)의 Pod도 잡는다 */
    const podNames = cx.pods.map(p => p.metadata.name).filter(name => /^[a-z0-9.-]+$/.test(name));
    if (container && tg.kind !== 'Node' && podNames.length) {
      const q = `max by (pod) (container_memory_working_set_bytes{namespace="${ns}", pod=~"${podNames.map(name => name.replaceAll('.', '\\\\.')).join('|')}", container="${container}"}) / 1048576`;
      const limit = memMi(cx.owner.spec.template.spec.containers[0].resources?.limits?.memory);
      read('memory', 'metric', q, () => sources.promRange(id, q, { ...window, step: stepFor(window) }).then(series => cite(inc, { kind: 'metric', source: 'prometheus', target: { kind: tg.kind, namespace: ns, name: tg.name, container }, window, query: q,
        result: { series: series.map(s => ({ labels: { ...s.labels, container }, unit: 'Mi', refs: limit ? [{ value: limit, label: `limit ${cx.owner.spec.template.spec.containers[0].resources.limits.memory}`, tone: 'limit' }] : [], samples: s.samples.map(x => ({ at: x.at, value: r1(x.value) })) })) },
        total: series.reduce((a, s) => a + s.samples.length, 0), collectedAt: at, sourceState: 'ok' })));
    }
    if (cx.ing) {
      const sel = `namespace="${ns}", ingress="${cx.ing.metadata.name}"`;
      const ratio = `sum(rate(nginx_ingress_controller_requests{${sel}, status=~"5.."}[5m])) / sum(rate(nginx_ingress_controller_requests{${sel}}[5m])) * 100`;
      const rps = `sum(rate(nginx_ingress_controller_requests{${sel}}[5m]))`;
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
    incidents.put(inc.id, failures.length ? { ...incidents.get(inc.id), collectPending: { phase: inc.phase, failures, retryAt: at + EVIDENCE_RETRY } }
      : { ...incidents.get(inc.id), collectedPhase: inc.phase, collectedAt: at, collectPending: null });
  }
  const restarts = p => (p.status?.containerStatuses ?? []).reduce((a, c) => a + (c.restartCount ?? 0), 0);

  /* ---------- 작업면 ---------- */
  async function workspace({ cluster, id }) {
    const L = await lib;
    await scan(cluster).catch(() => null);
    let inc = incidents.get(id);
    if (!inc || inc.cluster !== cluster) return null;
    const cx = await context(inc);
    if (inc.collectedPhase !== inc.phase && !(inc.collectPending?.phase === inc.phase && inc.collectPending.retryAt > now())) { await collect(inc, cx); inc = incidents.get(id); }
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
        impact = { label: '5xx', unit: '%', now: r1(im.now), baseline: before.length ? r1(before.reduce((a, v) => a + v, 0) / before.length) : 0, threshold: r1(100 - ratioEv.result.slo), from: inc.detectedAt - 5 * MIN,
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
      ...inc.signals.map(s => ({ id: `sig-${s.id}`, lane: s.reason === 'NodeNotReady' ? 'infra' : 'symptom', at: s.at, ...(s.end ? { end: s.end } : {}), tone: 'danger', kind: s.reason, title: `${s.object.kind} ${s.object.name}`, text: s.message || `× ${s.count}` })),
    ].filter(m => m.at != null && m.at >= from && m.at <= end + MIN).sort((a, b) => a.at - b.at);

    /* 원인 사슬: 관측(근거 번호), 규칙, AI 해석(있을 때만), 확인 안 됨, 확인 계획 */
    const rule = inc.rule, oom = objectEv.flatMap(e => (e.result.oomKilled ? [e.n] : []));
    const memPeak = memEv ? maxOf(memEv.result.series.flatMap(s => s.samples.map(x => x.value ?? 0)), 0) : null, limit = memEv?.result.series[0]?.refs?.[0]?.value ?? null;
    const observe = [
      ...(objectEv.length ? [{ text: T('wake.inc.obs.restarts', { pods: objectEv.length, n: objectEv.reduce((a, e) => a + (e.result.restarts ?? 0), 0), reasons: Object.keys(inc.reasons).join(', ') }), refs: objectEv.map(e => e.n) }] : []),
      ...(memEv && memPeak != null ? [{ text: T(limit ? 'wake.inc.obs.memLimit' : 'wake.inc.obs.mem', { peak: r1(memPeak), limit: r1(limit) }), refs: [memEv.n] }] : []),
      ...(eventsEv ? [{ text: T('wake.inc.obs.events', { n: eventsEv.total, rows: eventsEv.result.rows.filter(r => r.type === 'Warning').map(r => `${r.reason} ×${r.count}`).slice(0, 3).join(', ') }), refs: [eventsEv.n] }] : []),
      ...(logEv?.hits?.length ? [{ text: T('wake.inc.obs.logs', { n: logEv.hits.length, total: logEv.total }), refs: [logEv.n] }] : []),
      ...(impact ? [{ text: T('wake.inc.obs.ratio', { now: impact.now, limit: impact.threshold }), refs: [ratioEv.n] }] : []),
      ...(appEv ? [{ text: T('wake.inc.obs.app', { app: appEv.result.app, sync: appEv.result.sync ?? '?' }), refs: [appEv.n] }] : []),
    ];
    const matched = rule === 'oom-limit' ? oom.length > 0 : observe.length > 0;
    const ai = inc.interpretation;
    const chain = { grade: !matched ? 'insufficient' : rule === 'oom-limit' ? 'confirmed' : 'inferred', source: { kind: 'rule', name: rule, version: RULES[rule] ?? 'v1' },
      conclusion: T(matched ? `wake.inc.rule.${rule}.conclusion` : 'wake.inc.rule.unmatched', { name: tg.name, limit: cx.owner?.spec?.template?.spec?.containers?.[0]?.resources?.limits?.memory ?? '' }),
      cells: { observe, basis: [{ text: T(`wake.inc.rule.${rule}.basis`) }], interpret: ai ? [{ text: ai.text, refs: ai.refs ?? [] }] : [],
        unknown: [{ text: T(`wake.inc.rule.${rule}.unknown`) }], verify: [{ text: T('wake.inc.verify.plan', { min: 5 }) }] } };

    /* 조치 후보: 소유 관계(ownership.js)가 길을 정한다. 자동 동기화 Application이면 Draft PR */
    const options = [];
    const ctr = cx.owner?.spec?.template?.spec?.containers ?? [];
    if (rule === 'oom-limit' && cx.owner && ctr.length) {
      const i = Math.max(0, ctr.findIndex(c => c.resources?.limits?.memory)), before = ctr[i].resources?.limits?.memory;
      const mi = memMi(before);
      if (mi) {
        const after = `${Math.ceil(mi * 2)}Mi`;
        options.push({ id: 'raise-memory', title: T('wake.inc.opt.raiseMemory', { before, after }), grade: 'confirmed', basis: T('wake.inc.opt.basisOom', { refs: oom.join(', ') }), reach: T('wake.inc.opt.reachRollout', { n: want ?? cx.pods.length }),
          recovery: 'service', plan: L.planFor({ resource: cx.owner, change: { id: 'raise-memory', title: 'raise-memory', values: [{ path: `spec.template.spec.containers[${i}].resources.limits.memory`, before, after }] }, owner: cx.ownership }) });
      }
    }
    const recentRollout = cx.replicasets.filter(r => ms(r.metadata.creationTimestamp) > inc.detectedAt - 2 * HOUR && Number(r.metadata.annotations?.['deployment.kubernetes.io/revision']) > 1);
    if (cx.owner && tg.kind === 'Deployment' && recentRollout.length && ['oom-limit', 'crash-loop'].includes(rule)) {
      options.push({ id: 'rollback', title: T('wake.inc.opt.rollback', { name: tg.name }), grade: 'inferred', basis: T('wake.inc.opt.basisRollout', { at: recentRollout.at(-1).metadata.creationTimestamp }), reach: T('wake.inc.opt.reachRollout', { n: want ?? cx.pods.length }),
        recovery: 'service', plan: L.planFor({ resource: cx.owner, change: { id: 'rollback', title: 'rollback', values: [], command: `kubectl rollout undo deployment/${tg.name} -n ${tg.namespace}` }, owner: cx.ownership }) });
    }

    /* 확인 계획: 같은 신호 없음, Ready, 5xx(있을 때). 완화 뒤 30초 구간 */
    const verdict = L.verifyVerdict({ verifyFrom: inc.verify?.verifyFrom ?? null, now: end, windows: inc.verify?.windows ?? [] });
    const condState = inc.phase === 'resolved' ? 'pass' : inc.phase === 'mitigated' ? 'watch' : undefined;
    const conditions = [{ id: 'no-signal', label: T('wake.inc.verify.noSignal', { reasons: Object.keys(inc.reasons).join(', ') }), source: 'kubernetes', state: condState },
      { id: 'ready', label: T('wake.inc.verify.ready'), source: 'kubernetes', state: condState },
      ...(impact ? [{ id: 'ratio', label: T('wake.inc.verify.ratio', { limit: impact.threshold }), source: 'prometheus', state: condState, optional: true }] : [])];

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
      oncall: { name: user() }, target: { kind: tg.kind, name: tg.name, namespace: tg.namespace, uid: cx.owner?.metadata?.uid ?? tg.uid ?? null },
      alert: { source: inc.alert?.source ?? 'Wake', name: inc.alert?.name ?? Object.keys(inc.reasons)[0] },
      links: Object.fromEntries(Object.entries(L.linksOf({}, { id: inc.id, cluster }) ?? {}).filter(([, v]) => typeof v === 'string')), sources: sourceList, scope, impact, userImpact, timeline: marks, chain, rule: { name: rule, version: RULES[rule] ?? 'v1' }, skill: null,
      options, chosen: inc.chosen ?? null, approvedAt: inc.approvedAt ?? null, fixAt: inc.mitigatedAt ?? null, evidence: ev.map(({ identity, incident, ...e }) => e),
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
