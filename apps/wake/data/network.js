import { compareResources } from './table-order.js';
import { metricDef } from './home.js';
/*
 * 네트워크 화면의 자료(순수 함수, 글 없음). 입력은 Prometheus 응답 모양(resultType matrix의 result: [{ metric, values: [[초, "값"]] }],
 * vector의 result: [{ metric, value: [초, "값"] }]):
 *  rx, tx: sum by (namespace, service) (rate(container_network_{receive,transmit}_bytes_total[5m])) 구간 행렬(바이트/초)
 *  conns: 서비스별 활성 연결, err: 서비스별 5xx 비율(5분, %), retrans: TCP 재전송 비율(%). 재지 않은 값은 null(빈 칸, 0이 아님)
 *  ingress: sum by (namespace, ingress, service) (rate(nginx_ingress_controller_requests[5m])) 지금 값(초당 요청) — 관측한 연결
 * 서비스 → DB·Redis 같은 서비스 사이 연결은 관측 자료(호출 지표)가 없어 그리지 않는다(같은 namespace라는 추정으로 띠를 만들지 않음, A2-13·RULE-SANKEY).
 * 5xx 상태는 홈 5xx 막대의 임계값(METRIC_DEFS err)을 넘으면 실패 하나(A2-12).
 * 논리 검사: network.test.mjs
 */

const lastOf = s => { const v = s?.values?.at(-1)?.[1] ?? s?.value?.[1]; const n = Number(v); return Number.isFinite(n) ? n : null; };
const keyOf = m => `${m?.namespace ?? ''}/${m?.service ?? ''}`;
/** 5xx 비율(%)이 홈 임계값을 넘었는지(알림 규칙과 같은 '>' 비교) */
const ERR_LIMIT = metricDef('err').threshold;
export const errOver = v => v != null && v > ERR_LIMIT;
/** 5xx 칸의 색조(data-table tone): 넘으면 'error', 아니면 없음 */
export const errTone = v => (errOver(v) ? 'error' : null);
/** 트래픽 상위 표의 순서: 수신 + 송신이 큰 것부터, 같으면 namespace·이름 순 */
export const trafficRows = rows => [...rows].sort((a, b) => ((b.rx ?? 0) + (b.tx ?? 0)) - ((a.rx ?? 0) + (a.tx ?? 0)) || compareResources(a, b, () => null));

/** 여러 시리즈를 같은 시각끼리 더한 한 시리즈: [{ at(ms), value }] */
export function sumSeries(result = []) {
  const by = new Map();
  for (const s of result) for (const [t, v] of s.values ?? []) { const n = Number(v); if (Number.isFinite(n)) by.set(t, (by.get(t) ?? 0) + n); }
  return [...by].sort((a, b) => a[0] - b[0]).map(([t, value]) => ({ at: t * 1000, value }));
}

/**
 * 서비스 행: [{ id, ns, name, rx, tx, conns, err, retrans }](rx·tx 바이트/초의 마지막 값). services: [{ ns, name }] 클러스터의 Service(이름 순서를 정함)
 *  by: 'svc' | 'ns'(namespace별 합, 5xx와 재전송은 최대). 기존 오류 톤의 문제 우선, namespace·이름 순
 */
export function serviceRows({ rx = [], tx = [], conns = [], err = [], retrans = [] }, by = 'svc') {
  const rows = new Map();
  const row = m => { const k = keyOf(m); if (!rows.has(k)) rows.set(k, { id: k, ns: m.namespace ?? '', name: m.service ?? '', rx: null, tx: null, conns: null, err: null, retrans: null }); return rows.get(k); };
  for (const [list, field] of [[rx, 'rx'], [tx, 'tx'], [conns, 'conns'], [err, 'err'], [retrans, 'retrans']]) for (const s of list) { const v = lastOf(s); if (v != null) row(s.metric)[field] = v; }
  let out = [...rows.values()];
  if (by === 'ns') {
    const g = new Map();
    const add = (a, b) => (a == null ? b : b == null ? a : a + b), max = (a, b) => (a == null ? b : b == null ? a : Math.max(a, b));
    for (const r of out) { const x = g.get(r.ns) ?? { id: r.ns, ns: r.ns, name: r.ns, rx: null, tx: null, conns: null, err: null, retrans: null }; x.rx = add(x.rx, r.rx); x.tx = add(x.tx, r.tx); x.conns = add(x.conns, r.conns); x.err = max(x.err, r.err); x.retrans = max(x.retrans, r.retrans); g.set(r.ns, x); }
    out = [...g.values()];
  }
  return out.sort((a, b) => compareResources(a, b, row => (errOver(row.err) ? 'danger' : null)));
}

/** 화면 머리 수: 지금 수신·송신(마지막 값), 구간 최대, 활성 연결 합, 5xx 비율이 가장 높은 서비스 */
export function networkSummary(input) {
  const rx = sumSeries(input.rx), tx = sumSeries(input.tx), rows = serviceRows(input);
  const peak = s => (s.length ? Math.max(...s.map(x => x.value)) : null), worst = [...rows].filter(r => r.err != null).sort((a, b) => b.err - a.err)[0] ?? null;
  const measured = rows.filter(r => r.conns != null);
  return { rx: rx.at(-1)?.value ?? null, tx: tx.at(-1)?.value ?? null, rxPeak: peak(rx), txPeak: peak(tx), conns: measured.length ? measured.reduce((a, r) => a + r.conns, 0) : null, worst: worst && worst.err > 0 ? { name: worst.name, ns: worst.ns, err: worst.err } : null, series: { rx, tx } };
}

/**
 * 서비스 흐름(샌키): 열 0 Ingress 컨트롤러, 열 1 Ingress가 보내는 서비스. 단위는 초당 요청. 관측한 띠만(nginx 요청률), 서비스 사이 추정 띠는 없음.
 *  ingress: 지금 값 벡터(metric: { namespace, ingress, service }), rows: serviceRows 결과(5xx 비율로 상태)
 *  반환 { nodes: [{ id, col, label, value, kind, ns, state }], links: [{ from, to, value, state }], total }
 */
export function serviceFlow({ ingress = [], rows = [] }) {
  const nodes = [], links = [], err = new Map(rows.map(r => [r.id, r.err]));
  const rps = new Map();
  for (const s of ingress) { const v = lastOf(s); if (v == null || !s.metric?.service) continue; const k = keyOf(s.metric); rps.set(k, (rps.get(k) ?? 0) + v); }
  const total = [...rps.values()].reduce((a, v) => a + v, 0);
  if (!rps.size) return { nodes, links, total: 0 };
  nodes.push({ id: 'ingress', col: 0, label: 'Ingress nginx', value: total, kind: 'Ingress', state: 'ok' });
  const stateOf = k => (errOver(err.get(k)) ? 'fail' : 'ok');
  for (const [k, v] of [...rps].sort((a, b) => b[1] - a[1])) {
    const [ns, name] = k.split('/');
    nodes.push({ id: k, col: 1, label: name, value: v, kind: 'Service', ns, name, state: stateOf(k) });
    links.push({ from: 'ingress', to: k, value: v, state: stateOf(k) });
  }
  return { nodes, links, total };
}
