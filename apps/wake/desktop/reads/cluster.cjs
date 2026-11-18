/*
 * 인시던트 허브와 AI 도구 층(desktop/hub.cjs, spec/architecture.md#F-ARC-003)이 쓰는 클러스터 읽기. 화면의 읽기 서비스와 같은 도구 질의(index.cjs tool)와
 * 같은 출처 상태(source-checks.cjs track)를 지난다: 화면, 내장 AI, MCP, HTTP API가 같은 함수와 같은 신선도를 본다.
 *   kube(id, path, opts)  Kubernetes GET 하나(원본) / list(id, plural, ns?, params?) / get(id, kind, ns, name)(없으면 null)
 *   promRange(id, query, { from, to, step }) -> [{ labels, samples: [{ at(ms), value }] }]   alerts(id) -> Alertmanager 활성 알림
 *   loki(id, query, { from, to, limit }) -> [{ at, text, labels }]   lokiCount(id, selector, { from, to }) -> { level: n }
 *   state(id) -> [SourceState v1 + name]  이 클러스터에서 읽은 출처마다 · sourceState(id, source) -> 출처 하나(확인 전이면 unknown과 이유)
 * Secret 값과 managedFields는 이 층 밖으로 나가지 않는다(Secret은 키 이름만).
 */
const ns = n => (n ? `/namespaces/${encodeURIComponent(n)}` : '');
const LIST_PATH = {
  pods: n => `/api/v1${ns(n)}/pods`, events: n => `/api/v1${ns(n)}/events`, services: n => `/api/v1${ns(n)}/services`, configmaps: n => `/api/v1${ns(n)}/configmaps`, nodes: () => '/api/v1/nodes',
  replicasets: n => `/apis/apps/v1${ns(n)}/replicasets`, deployments: n => `/apis/apps/v1${ns(n)}/deployments`, statefulsets: n => `/apis/apps/v1${ns(n)}/statefulsets`, daemonsets: n => `/apis/apps/v1${ns(n)}/daemonsets`,
  jobs: n => `/apis/batch/v1${ns(n)}/jobs`, cronjobs: n => `/apis/batch/v1${ns(n)}/cronjobs`, ingresses: n => `/apis/networking.k8s.io/v1${ns(n)}/ingresses`,
  applications: n => `/apis/argoproj.io/v1alpha1${ns(n)}/applications`,
};
const PLURAL = { Pod: 'pods', ReplicaSet: 'replicasets', Deployment: 'deployments', StatefulSet: 'statefulsets', DaemonSet: 'daemonsets', Job: 'jobs', CronJob: 'cronjobs',
  Node: 'nodes', Service: 'services', ConfigMap: 'configmaps', Ingress: 'ingresses', Event: 'events', Application: 'applications' };
const KIND = Object.fromEntries(Object.entries(PLURAL).map(([k, p]) => [p, k]));
const SOURCE_NAMES = { kubernetes: 'Kubernetes API', prometheus: 'Prometheus', alertmanager: 'Alertmanager', loki: 'Loki', tempo: 'Tempo' };

const { sanitize, secretPath } = require('../kube-sanitize.cjs');
const clean = o => sanitize(o);
/* Secret API는 요청 전에 거절한다(RULE-SECRET) */
const refuseSecret = path => { if (secretPath(path)) throw Object.assign(new Error('Secret is not read by Wake'), { kind: 'forbidden', status: 403 }); };

/* 도구 GET(tool)이 닿는 도구 종류: Grafana는 키체인의 Viewer 토큰이 있을 때만 답한다(없으면 unconfigured) */
const TOOL_KINDS = Object.freeze(['prometheus', 'alertmanager', 'loki', 'tempo', 'grafana']);

/** client(id): Kubernetes 클라이언트, k8s(id, fn): 출처 상태를 남기며 실행, tool(id, kind, path, params): 도구 GET(data), sources: source-checks,
    cached(id, plural): 공유 watch 캐시의 모든 namespace 목록 | null(kube-watch.cjs) */
function createClusterReads({ client, k8s, tool, sources, cached = () => null }) {
  const kube = async (id, path, opts) => { refuseSecret(path); return k8s(id, () => client(id).request('GET', path, null, opts)); };
  async function list(id, plural, namespace = '', params = '') {
    if (!LIST_PATH[plural]) throw new Error(`unknown kind: ${plural}`);
    const r = await kube(id, LIST_PATH[plural](namespace) + (params ? `?${params}` : ''));
    return (r.items || []).map(item => clean({ ...item, kind: item.kind || KIND[plural] }));
  }
  /* 없는 객체(404)는 출처 실패가 아니다 */
  async function get(id, kind, namespace, name) {
    const plural = PLURAL[kind] ?? kind;
    if (!LIST_PATH[plural]) throw new Error(`unknown kind: ${kind}`);
    const o = await k8s(id, () => client(id).request('GET', `${LIST_PATH[plural](namespace)}/${encodeURIComponent(name)}`).catch(e => { if (e?.status === 404) return null; throw e; }));
    return o && clean({ ...o, kind: o.kind || kind });
  }
  const promRange = async (id, query, { from, to, step }) => (await tool(id, 'prometheus', '/api/v1/query_range', { query, start: String(Math.floor(from / 1000)), end: String(Math.ceil(to / 1000)), step: String(Math.max(1, Math.round(step / 1000))) })).result
    .map(r => ({ labels: r.metric, samples: r.values.map(([t, v]) => ({ at: Math.round(t * 1000), value: Number.isFinite(Number(v)) ? Number(v) : null })) }));
  const alerts = id => tool(id, 'alertmanager', '/api/v2/alerts', { active: 'true', silenced: 'false', inhibited: 'false' });
  const loki = async (id, query, { from, to, limit = 500 }) => (await tool(id, 'loki', '/loki/api/v1/query_range', { query, start: String(from * 1e6), end: String(to * 1e6), limit: String(limit), direction: 'forward' })).result
    .flatMap(s => s.values.map(([t, text]) => ({ at: Math.round(Number(t) / 1e6), text, labels: s.stream }))).sort((a, b) => a.at - b.at);
  const lokiCount = async (id, selector, { from, to }) => Object.fromEntries((await tool(id, 'loki', '/loki/api/v1/query', { query: `sum by (detected_level) (count_over_time(${selector}[${Math.max(1, Math.round((to - from) / 1000))}s]))`, time: String(to * 1e6) })).result
    .map(x => [x.metric.detected_level || 'unknown', Number(x.value[1])]));
  /* 출처 상태는 SourceState v1 전체에 화면 이름만 더해 넘긴다(관측 시각·대상·coverage·이유를 자르지 않음) */
  const state = id => Object.values(sources.states(id)).map(s => ({ ...s, name: SOURCE_NAMES[s.id] ?? s.id }));
  /** 출처 하나(확인 전이면 unknown과 이유) */
  const sourceState = (id, source) => ({ ...sources.state(id, source), name: SOURCE_NAMES[source] ?? source });
  return { kube, list, get, promRange, alerts, loki, lokiCount, state, sourceState, tool, toolKinds: TOOL_KINDS, cached: async (id, plural) => cached(id, plural) ?? null };
}

module.exports = { createClusterReads, SOURCE_NAMES };
