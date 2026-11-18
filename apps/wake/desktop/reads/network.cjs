/*
 * 네트워크 화면 자료(data/network.js 입력 모양): Service 단위 트래픽.
 *  rx, tx: Pod 단위 container_network_* 비율을 EndpointSlice(Pod -> Service)로 묶은 구간 행렬, metric { namespace, service }(바이트/초)
 *  err: ingress-nginx 5xx 비율(%) by (namespace, service), ingress: ingress-nginx 초당 요청 by (namespace, ingress, service) — 관측한 연결
 *  conns, retrans: Service 단위로 재는 지표가 없어 빈 목록(화면은 값 칸을 비움)
 * Service 사이 연결(서비스 -> 저장소)은 관측 자료가 없어 화면(data/network.js serviceFlow)이 "추정"으로 그린다.
 *   network.read { id, from, to, step } -> { at, step, range, rx, tx, err, ingress, conns, retrans, queries, unmapped, retention }
 * retention: Prometheus가 지키는 보관 기간(초, /api/v1/status/runtimeinfo의 storageRetention 중 시간 부분). 못 읽거나 크기만 있으면 null(화면은 쓰지 않음)
 */
const { rangeOf } = require('./metrics.cjs');

const NGINX = 'nginx_ingress_controller_requests';
const QUERIES = Object.freeze({
  rx: 'sum by (namespace, pod) (rate(container_network_receive_bytes_total[5m]))',
  tx: 'sum by (namespace, pod) (rate(container_network_transmit_bytes_total[5m]))',
  err: `100 * sum by (namespace, service) (rate(${NGINX}{status=~"5.."}[5m])) / sum by (namespace, service) (rate(${NGINX}[5m]))`,
  ingress: `sum by (namespace, ingress, service) (rate(${NGINX}[5m]))`,
});

/** EndpointSlice 목록 -> Map('<ns>/<pod>' -> service). 한 Pod가 여러 Service에 있으면 headless가 아닌 것 중 이름 순 첫 번째 */
function podServices(slices) {
  const by = new Map();
  for (const s of slices ?? []) {
    const service = s.metadata?.labels?.['kubernetes.io/service-name'], ns = s.metadata?.namespace;
    if (!service || !ns) continue;
    for (const e of s.endpoints ?? []) if (e.targetRef?.kind === 'Pod' && e.targetRef.name) {
      const key = `${ns}/${e.targetRef.name}`;
      by.set(key, [...new Set([...(by.get(key) ?? []), service])]);
    }
  }
  const pick = list => [...list].sort((a, b) => /-headless$/.test(a) - /-headless$/.test(b) || a.localeCompare(b))[0];
  return new Map([...by].map(([k, list]) => [k, pick(list)]));
}

/** Pod 행렬 -> Service 행렬(같은 시각끼리 합). Service가 없는 Pod는 unmapped로 센다 */
function byService(result, services) {
  const series = new Map(); let unmapped = 0;
  for (const s of result ?? []) {
    const svc = services.get(`${s.metric?.namespace}/${s.metric?.pod}`);
    if (!svc) { unmapped++; continue; }
    const key = `${s.metric.namespace}/${svc}`, points = series.get(key) ?? new Map();
    for (const [t, v] of s.values ?? []) { const n = Number(v); if (Number.isFinite(n)) points.set(t, (points.get(t) ?? 0) + n); }
    series.set(key, points);
  }
  const rows = [...series].map(([key, points]) => { const [namespace, service] = key.split('/');
    return { metric: { namespace, service }, values: [...points].sort((a, b) => a[0] - b[0]).map(([t, v]) => [t, String(v)]) }; });
  return { rows, unmapped };
}

/* Prometheus 기간 글(1y2w3d4h5m6s7ms, "15d or 10GiB"의 앞 부분) -> 초. 시간 부분이 없으면 null */
const UNIT = { y: 365 * 86400, w: 7 * 86400, d: 86400, h: 3600, m: 60, s: 1, ms: .001 };
function retentionSeconds(text) {
  const m = /^((?:\d+(?:ms|y|w|d|h|m|s))+)/.exec(String(text ?? '').trim());
  if (!m) return null;
  const sec = [...m[1].matchAll(/(\d+)(ms|y|w|d|h|m|s)/g)].reduce((n, [, v, u]) => n + Number(v) * UNIT[u], 0);
  return sec > 0 ? sec : null;
}
const RUNTIME_TTL = 10 * 60_000;

/** runtimeInfo(id): 그 클러스터 Prometheus의 /api/v1/status/runtimeinfo data(출처 상태를 바꾸지 않는 읽기). 10분 동안 클러스터마다 한 번 */
function createNetwork({ prom, listSlices, runtimeInfo = async () => null, now = Date.now }) {
  const kept = new Map();
  const retentionOf = id => { const hit = kept.get(id); if (hit && now() - hit.at < RUNTIME_TTL) return hit.value;
    const value = Promise.resolve().then(() => runtimeInfo(id)).then(info => retentionSeconds(info?.storageRetention), () => null);
    kept.set(id, { at: now(), value }); return value; };
  return async function read({ id, from, to, step }) {
    const r = rangeOf(from, to, step), at = Math.floor(now() / 1000);
    const range = query => prom(id, '/api/v1/query_range', { query, start: r.from, end: r.to, step: r.step });
    const [slices, rx, tx, err, ingress, retention] = await Promise.all([listSlices(id), range(QUERIES.rx), range(QUERIES.tx),
      prom(id, '/api/v1/query', { query: QUERIES.err, time: at }), prom(id, '/api/v1/query', { query: QUERIES.ingress, time: at }), retentionOf(id)]);
    const services = podServices(slices), rxs = byService(rx.result, services), txs = byService(tx.result, services);
    return { at: new Date(now()).toISOString(), step: r.step, range: { from: r.from * 1000, to: r.to * 1000 }, rx: rxs.rows, tx: txs.rows,
      err: (err.result ?? []).filter(s => s.metric?.service && Number.isFinite(Number(s.value?.[1]))), ingress: ingress.result ?? [], conns: [], retrans: [],
      queries: QUERIES, unmapped: Math.max(rxs.unmapped, txs.unmapped), retention };
  };
}

module.exports = { createNetwork, podServices, byService, QUERIES };
