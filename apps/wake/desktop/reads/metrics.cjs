/*
 * 지표 질의 정의(허브가 가진 표): 화면은 이름 붙은 시리즈와 대상만 말하고 PromQL을 보내지 않는다.
 *   metrics.range { id, series, target?, from, to, step } -> { series, query, unit, step, range: { from, to }, fetchedAt, result: [{ metric, values: [[초, "값"]] }], source }
 *   metrics.usage { id, kind } -> 목록 사용량 열: { kind, fetchedAt, rows: { '<ns>/<이름>' | '<이름>': { cpu?, memory?, restarts1h?, used?, usedPct? } }, queries, source }
 * 대상 라벨 값은 Kubernetes 이름 규칙만 받는다(질의 글에 따옴표·중괄호가 들어가지 않음).
 */

const NAME = /^[a-z0-9](?:[-a-z0-9.]{0,251}[a-z0-9])?$/;
const WORKLOAD_OWNER = { deployments: 'Deployment', statefulsets: 'StatefulSet', daemonsets: 'DaemonSet' };
const LABEL = { namespace: NAME, ingress: NAME, service: NAME, pod: NAME, container: NAME, node: NAME, persistentvolumeclaim: NAME, name: NAME, workload: /^(?:deployments|statefulsets|daemonsets)$/ };
const NGINX = 'nginx_ingress_controller_requests';
/* node-exporter의 instance(IP:포트)를 Node 이름으로: node_uname_info의 nodename */
const BY_NODE = (expr, node) => `(${expr}) * on (instance) group_left(nodename) node_uname_info${node ? `{nodename="${node}"}` : ''}`;
const sel = (target, keys, extra = '') => `{${[...keys.map(k => `${k}="${target[k]}"`), ...(extra ? [extra] : [])].join(',')}}`;
const ratio5xx = (by, match) => `100 * sum${by}(rate(${NGINX}{${[match, 'status=~"5.."'].filter(Boolean).join(',')}}[5m])) / sum${by}(rate(${NGINX}${match ? `{${match}}` : ''}[5m]))`;
const p95 = (by, match) => `histogram_quantile(0.95, sum by (le${by ? ', ' + by : ''}) (rate(nginx_ingress_controller_request_duration_seconds_bucket${match ? `{${match}}` : ''}[5m])))`;
const FS = 'fstype=~"ext4|xfs|btrfs"';
/* 워크로드가 소유한 Pod(kube-state-metrics의 소유 관계, Pod마다 1): Deployment는 ReplicaSet을 거쳐, StatefulSet·DaemonSet은 바로. Pod 이름 목록 없이
   지난 구간의 Pod(교체된 것 포함)도 그 시각의 소유 관계로 든다 */
const OWNED = t => (t.workload === 'deployments'
  ? `max by (namespace, pod) (label_replace(kube_pod_owner{namespace="${t.namespace}",owner_kind="ReplicaSet"}, "replicaset", "$1", "owner_name", "(.*)") * on (namespace, replicaset) group_left() max by (namespace, replicaset) (kube_replicaset_owner{namespace="${t.namespace}",owner_kind="Deployment",owner_name="${t.name}"}))`
  : `max by (namespace, pod) (kube_pod_owner{namespace="${t.namespace}",owner_kind="${WORKLOAD_OWNER[t.workload]}",owner_name="${t.name}"})`);
/* 합은 그 시각 Running인 소유 Pod가 모두 값을 낼 때만(하나라도 표본이 빠진 시각은 부분 합 대신 빈 점: 차트의 끊긴 선). Pod 단계를 모르면(kube-state-metrics 없음) 거르지 않는다 */
const RUNNING = t => `max by (namespace, pod) (kube_pod_status_phase{namespace="${t.namespace}",phase="Running"} == 1)`;
const byOwner = (perPod, t) => { const joined = `${perPod} * on (namespace, pod) group_left() ${OWNED(t)}`;
  return `sum(${joined}) and on () (count(${joined}) >= (count(${OWNED(t)} * on (namespace, pod) group_left() ${RUNNING(t)}) or vector(0)))`; };

/* 정의: unit(화면 단위), target(필요한 대상 라벨), expr(target) */
const SERIES = Object.freeze({
  'cluster.cpu': { unit: '%', expr: () => '100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))' },
  'cluster.mem': { unit: '%', expr: () => '100 * (1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))' },
  'cluster.err': { unit: '%', expr: () => ratio5xx('', '') },
  'cluster.rps': { unit: '/s', expr: () => `sum(rate(${NGINX}[5m]))` },
  'cluster.cpu.byNode': { unit: '%', expr: () => `topk(5, 100 * (1 - avg by (nodename) (${BY_NODE('rate(node_cpu_seconds_total{mode="idle"}[5m])')})))` },
  'cluster.mem.byNode': { unit: '%', expr: () => `topk(5, 100 * (1 - sum by (nodename) (${BY_NODE('node_memory_MemAvailable_bytes')}) / sum by (nodename) (${BY_NODE('node_memory_MemTotal_bytes')})))` },
  'cluster.err.byNs': { unit: '%', expr: () => `topk(5, ${ratio5xx(' by (namespace)', '')})` },
  'cluster.rps.byNs': { unit: '/s', expr: () => `topk(5, sum by (namespace) (rate(${NGINX}[5m])))` },
  'ingress.err': { unit: '%', target: ['namespace', 'ingress'], expr: t => ratio5xx('', sel(t, ['namespace', 'ingress']).slice(1, -1)) },
  'ingress.rps': { unit: '/s', target: ['namespace', 'ingress'], expr: t => `sum(rate(${NGINX}${sel(t, ['namespace', 'ingress'])}[5m]))` },
  'ingress.p95': { unit: 's', target: ['namespace', 'ingress'], expr: t => p95('', sel(t, ['namespace', 'ingress']).slice(1, -1)) },
  'service.err': { unit: '%', target: ['namespace', 'service'], expr: t => ratio5xx('', sel(t, ['namespace', 'service']).slice(1, -1)) },
  'service.rps': { unit: '/s', target: ['namespace', 'service'], expr: t => `sum(rate(${NGINX}${sel(t, ['namespace', 'service'])}[5m]))` },
  'service.p95': { unit: 's', target: ['namespace', 'service'], expr: t => p95('', sel(t, ['namespace', 'service']).slice(1, -1)) },
  'pod.cpu': { unit: 'm', target: ['namespace', 'pod'], expr: t => `1000 * sum(rate(container_cpu_usage_seconds_total${sel(t, ['namespace', 'pod'], 'container!=""')}[5m]))` },
  'pod.mem': { unit: 'bytes', target: ['namespace', 'pod'], expr: t => `sum(container_memory_working_set_bytes${sel(t, ['namespace', 'pod'], 'container!=""')})` },
  /* 워크로드 상세: 소유한 모든 Pod의 합 한 시리즈(Pod마다 읽어 합치지 않음, 상한 없음) */
  'workload.cpu': { unit: 'm', target: ['namespace', 'workload', 'name'], expr: t => `1000 * ${byOwner(`sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{namespace="${t.namespace}",container!=""}[5m]))`, t)}` },
  'workload.mem': { unit: 'bytes', target: ['namespace', 'workload', 'name'], expr: t => byOwner(`sum by (namespace, pod) (container_memory_working_set_bytes{namespace="${t.namespace}",container!=""})`, t) },
  /* 리소스 상세 지표(B1): 관측 연결 묶음이 없을 때 홈과 같은 출처(클러스터 안에서 찾은 Prometheus)로 그 컨테이너·Pod를 읽는다 */
  'container.cpu': { unit: 'cores', target: ['namespace', 'pod', 'container'], expr: t => `sum(rate(container_cpu_usage_seconds_total${sel(t, ['namespace', 'pod', 'container'])}[5m]))` },
  'container.mem': { unit: 'bytes', target: ['namespace', 'pod', 'container'], expr: t => `sum(container_memory_working_set_bytes${sel(t, ['namespace', 'pod', 'container'])})` },
  'pod.net.rx': { unit: 'bytes/s', target: ['namespace', 'pod'], expr: t => `sum(rate(container_network_receive_bytes_total${sel(t, ['namespace', 'pod'])}[5m]))` },
  'pod.net.tx': { unit: 'bytes/s', target: ['namespace', 'pod'], expr: t => `sum(rate(container_network_transmit_bytes_total${sel(t, ['namespace', 'pod'])}[5m]))` },
  'pod.restarts1h': { unit: '', target: ['namespace', 'pod'], expr: t => `sum(increase(kube_pod_container_status_restarts_total${sel(t, ['namespace', 'pod'])}[1h]))` },
  'node.cpu': { unit: '%', target: ['node'], expr: t => `100 * (1 - avg(${BY_NODE('rate(node_cpu_seconds_total{mode="idle"}[5m])', t.node)}))` },
  'node.mem': { unit: '%', target: ['node'], expr: t => `100 * (1 - sum(${BY_NODE('node_memory_MemAvailable_bytes', t.node)}) / sum(${BY_NODE('node_memory_MemTotal_bytes', t.node)}))` },
  'node.disk': { unit: '%', target: ['node'], expr: t => `100 * max(${BY_NODE(`1 - node_filesystem_avail_bytes{${FS}} / node_filesystem_size_bytes{${FS}}`, t.node)})` },
  'pvc.used': { unit: '%', target: ['namespace', 'persistentvolumeclaim'], expr: t => `100 * max(kubelet_volume_stats_used_bytes${sel(t, ['namespace', 'persistentvolumeclaim'])} / kubelet_volume_stats_capacity_bytes${sel(t, ['namespace', 'persistentvolumeclaim'])})` },
});

const invalid = () => Object.assign(new Error('invalid metrics request'), { kind: 'invalid_request' });
/** 정의 id와 대상 -> 질의 글(대상 라벨이 이름 규칙이 아니면 거절) */
function seriesQuery(id, target = {}) {
  const def = Object.hasOwn(SERIES, id) ? SERIES[id] : null;
  if (!def) throw invalid();
  const keys = def.target ?? [];
  if (Object.keys(target ?? {}).some(k => !keys.includes(k)) || keys.some(k => typeof target[k] !== 'string' || !LABEL[k].test(target[k]))) throw invalid();
  return { query: def.expr(target), unit: def.unit };
}
/** 구간(ms)과 step(초): step은 15초 배수, 점은 1,000개 이하, 구간은 15일 이하 */
function rangeOf(from, to, step) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 15 * 86_400_000) throw invalid();
  const min = Math.ceil((to - from) / 1000 / 1000 / 15) * 15;
  const s = Math.max(15, min, Math.round((Number(step) || 0) / 15) * 15);
  return { from: Math.floor(from / 1000), to: Math.ceil(to / 1000), step: s };
}

/* 목록 사용량 열의 질의(지금 값) */
const USAGE = Object.freeze({
  podCpu: '1000 * sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{container!=""}[5m]))',
  podMem: 'sum by (namespace, pod) (container_memory_working_set_bytes{container!=""})',
  podRestarts: 'sum by (namespace, pod) (increase(kube_pod_container_status_restarts_total[1h]))',
  podOwner: 'max by (namespace, pod, owner_name) (kube_pod_owner{owner_kind="ReplicaSet"})',
  rsOwner: 'max by (namespace, replicaset, owner_name) (kube_replicaset_owner{owner_kind="Deployment"})',
  nodeCpu: `100 * (1 - avg by (nodename) (${BY_NODE('rate(node_cpu_seconds_total{mode="idle"}[5m])')}))`,
  nodeMem: `100 * (1 - sum by (nodename) (${BY_NODE('node_memory_MemAvailable_bytes')}) / sum by (nodename) (${BY_NODE('node_memory_MemTotal_bytes')}))`,
  pvcUsed: 'max by (namespace, persistentvolumeclaim) (kubelet_volume_stats_used_bytes)',
  pvcCapacity: 'max by (namespace, persistentvolumeclaim) (kubelet_volume_stats_capacity_bytes)',
});
const USAGE_OF = { pods: ['podCpu', 'podMem', 'podRestarts'], deployments: ['podCpu', 'podMem', 'podRestarts', 'podOwner', 'rsOwner'], nodes: ['nodeCpu', 'nodeMem'], persistentvolumeclaims: ['pvcUsed', 'pvcCapacity'] };
const valueOf = item => { const n = Number(item?.value?.[1]); return Number.isFinite(n) ? n : null; };
const round = v => (v == null ? null : Math.round(v));

/** 지금 값 벡터 묶음 -> 행 키마다 사용량. vectors: { podCpu: [{ metric, value }], ... } */
function usageRows(kind, vectors) {
  const rows = {}, put = (key, field, value) => { if (value == null) return; (rows[key] ??= {})[field] = value; };
  const pod = m => `${m.namespace}/${m.pod}`;
  if (kind === 'pods') {
    for (const v of vectors.podCpu ?? []) put(pod(v.metric), 'cpu', round(valueOf(v)));
    for (const v of vectors.podMem ?? []) put(pod(v.metric), 'memory', valueOf(v));
    for (const v of vectors.podRestarts ?? []) put(pod(v.metric), 'restarts1h', round(valueOf(v)));
  } else if (kind === 'deployments') {
    const rs = new Map((vectors.rsOwner ?? []).map(v => [`${v.metric.namespace}/${v.metric.replicaset}`, v.metric.owner_name]));
    const owner = new Map((vectors.podOwner ?? []).flatMap(v => { const d = rs.get(`${v.metric.namespace}/${v.metric.owner_name}`); return d ? [[pod(v.metric), `${v.metric.namespace}/${d}`]] : []; }));
    for (const [field, list, round] of [['cpu', vectors.podCpu, true], ['memory', vectors.podMem, false], ['restarts1h', vectors.podRestarts, true]]) {
      const sums = new Map();
      for (const v of list ?? []) { const d = owner.get(pod(v.metric)), n = valueOf(v); if (d && n != null) sums.set(d, (sums.get(d) ?? 0) + n); }
      for (const [d, n] of sums) put(d, field, round ? Math.round(n) : n);
    }
  } else if (kind === 'nodes') {
    for (const v of vectors.nodeCpu ?? []) put(v.metric.nodename, 'cpu', round(valueOf(v)));
    for (const v of vectors.nodeMem ?? []) put(v.metric.nodename, 'memory', round(valueOf(v)));
  } else if (kind === 'persistentvolumeclaims') {
    const cap = new Map((vectors.pvcCapacity ?? []).map(v => [`${v.metric.namespace}/${v.metric.persistentvolumeclaim}`, valueOf(v)]));
    for (const v of vectors.pvcUsed ?? []) {
      const key = `${v.metric.namespace}/${v.metric.persistentvolumeclaim}`, used = valueOf(v), c = cap.get(key);
      put(key, 'used', used); if (used != null && c > 0) put(key, 'usedPct', Math.round(100 * used / c));
    }
  }
  return rows;
}

/** prom(cluster, path, params, signal) -> Prometheus 응답 data(hub.cjs) */
function createMetrics({ prom, now = Date.now }) {
  return {
    async range({ id, series, target, from, to, step }) {
      const { query, unit } = seriesQuery(series, target), r = rangeOf(from, to, step);
      const data = await prom(id, '/api/v1/query_range', { query, start: r.from, end: r.to, step: r.step });
      return { series, query, unit, step: r.step, range: { from: r.from * 1000, to: r.to * 1000 }, fetchedAt: now(), result: data.result ?? [] };
    },
    async usage({ id, kind }) {
      const names = USAGE_OF[kind];
      if (!names) throw invalid();
      const at = Math.floor(now() / 1000);
      const results = await Promise.all(names.map(name => prom(id, '/api/v1/query', { query: USAGE[name], time: at })));
      const vectors = Object.fromEntries(names.map((name, i) => [name, results[i].result ?? []]));
      return { kind, fetchedAt: now(), rows: usageRows(kind, vectors), queries: names.map(name => USAGE[name]) };
    },
  };
}

module.exports = { SERIES, seriesQuery, rangeOf, usageRows, createMetrics };
