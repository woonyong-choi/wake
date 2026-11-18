import { compareHistory } from './table-order.js';
/*
 * 알림 화면의 자료(순수 함수, 글 없음). 입력은 도구 응답 모양 그대로:
 *  rules: Prometheus `/api/v1/rules`(type alerting, query, duration, labels, annotations, alerts[]{ labels, annotations, state pending|firing, activeAt, value }),
 *  alertmanager: Alertmanager `/api/v2/alerts`([{ fingerprint, labels, annotations, startsAt, endsAt, status: { state, silencedBy, inhibitedBy }, receivers }]),
 *  history: Wake가 보관한 지난 알림(같은 Alertmanager 모양, endsAt이 지난 것 = resolved, 보관 날 수는 허브 답의 historyDays).
 * 상태: firing·pending은 Prometheus 규칙의 지금 값, resolved는 보관 기록. 같은 알림(라벨 지문)이 여럿에 있으면 Prometheus가 지금 값이다.
 * 논리 검사: alerts.test.mjs
 */

const MIN = 60_000;
/* 알림이 말하는 객체의 라벨(kube-state-metrics 라벨 이름) → 종류·주소 복수형. 앞의 것이 대상이다 */
const OBJECT_LABELS = [['pod', 'Pod', 'pods'], ['deployment', 'Deployment', 'deployments'], ['statefulset', 'StatefulSet', 'statefulsets'], ['daemonset', 'DaemonSet', 'daemonsets'],
  ['cronjob', 'CronJob', 'cronjobs'], ['job_name', 'Job', 'jobs'], ['replicaset', 'ReplicaSet', 'replicasets'], ['horizontalpodautoscaler', 'HorizontalPodAutoscaler', 'horizontalpodautoscalers'],
  ['persistentvolumeclaim', 'PersistentVolumeClaim', 'persistentvolumeclaims'], ['ingress', 'Ingress', 'ingresses'], ['node', 'Node', 'nodes'], ['service', 'Service', 'services']];
/* Pod를 소유하는 컨트롤러 라벨: 함께 온 pod 라벨이 그 이름으로 시작하지 않으면 그 Pod는 이 객체의 것이 아니라 수집 대상(exporter)의 Pod */
const OWNER_LABELS = new Set(['deployment', 'statefulset', 'daemonset', 'cronjob', 'job_name', 'replicaset', 'owner_name']);
/* 수집 대상(scrape target)이 붙이는 라벨. 같은 이름의 객체 라벨이 있으면 Prometheus가 그것을 exported_<이름>으로 옮긴다(honor_labels 꺼짐) */
const SCRAPE_LABELS = ['namespace', 'pod', 'service', 'container'];
/* 클러스터 상태를 내보내는 exporter: 그 시계열의 pod·service·container 라벨이 exporter 자신의 이름이면 대상이 아니다 */
const STATE_EXPORTER = /kube-state-metrics/;
const HEARTBEAT = new Set(['Watchdog']);

/** 라벨 묶음의 지문: 이름순 key=value(Alertmanager fingerprint가 없는 Prometheus 알림도 같은 값이 같은 지문) */
export const labelKey = labels => Object.keys(labels ?? {}).sort().map(k => `${k}=${labels[k]}`).join(',');
const fp = labels => { let h = 2166136261; for (const ch of labelKey(labels)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); };
/** 규칙 응답의 duration(초) -> Prometheus 글(10m, 1h, 90s). 0이나 없음은 '' */
export const forText = sec => (!(sec > 0) ? '' : sec % 3600 === 0 ? `${sec / 3600}h` : sec % 60 === 0 ? `${sec / 60}m` : `${sec}s`);
const ms = v => { const n = typeof v === 'number' ? v : Date.parse(v ?? ''); return Number.isFinite(n) ? n : null; };

/**
 * 알림이 말하는 객체의 라벨: 수집 대상의 라벨을 빼고 객체 라벨만 남긴다(알림 화면·상세·범위·인시던트 감지가 같은 것을 쓴다).
 *  exported_<이름>이 있으면 그것이 객체의 값(이름 자체는 수집 대상의 것), kube-state-metrics 시계열의 pod·service·container가 exporter 자신이면 뺌,
 *  컨트롤러 라벨(job_name·deployment…)과 함께 온 pod가 그 컨트롤러의 Pod가 아니면 뺌.
 */
export function alertLabels(labels = {}) {
  const out = { ...labels };
  for (const k of SCRAPE_LABELS) if (labels[`exported_${k}`]) out[k] = labels[`exported_${k}`];
  if (STATE_EXPORTER.test(labels.job ?? '') || STATE_EXPORTER.test(labels.service ?? ''))
    for (const k of ['pod', 'service', 'container']) if (!labels[`exported_${k}`] && STATE_EXPORTER.test(out[k] ?? '')) delete out[k];
  if (out.pod && Object.keys(out).some(k => OWNER_LABELS.has(k) && out[k] && !String(out.pod).startsWith(`${out[k]}-`))) delete out.pod;
  return out;
}

/** 알림이 말하는 객체들(대상 먼저): [{ label, kind, plural, namespace, name }]. owner_kind·owner_name은 그 종류의 객체(종류가 없으면 CronJob) */
export function alertObjects(labels = {}) {
  const l = alertLabels(labels), ns = l.namespace ?? '';
  const out = OBJECT_LABELS.filter(([k]) => l[k]).map(([label, kind, plural]) => ({ label, kind, plural, namespace: kind === 'Node' ? '' : ns, name: String(l[label]) }));
  const owner = l.owner_name && OBJECT_LABELS.find(([, kind]) => kind === (l.owner_kind || 'CronJob')), job = out.findIndex(o => o.kind === 'Job');
  if (owner) out.splice(job < 0 ? out.length : job, 0, { label: 'owner_name', kind: owner[1], plural: owner[2], namespace: ns, name: String(l.owner_name) });
  return out;
}
/** 알림이 말하는 객체 하나(alertObjects의 첫째) 또는 null(namespace만, instance만) */
export const alertSubject = labels => alertObjects(labels)[0] ?? null;

/** 알림 대상: `namespace/이름`(알림이 말하는 객체), 클러스터 범위 객체는 이름, 없으면 namespace, 그것도 없으면 instance */
export function targetOf(labels = {}) {
  const s = alertSubject(labels), l = alertLabels(labels);
  if (s) return s.namespace ? `${s.namespace}/${s.name}` : s.name;
  return l.namespace || l.instance || '';
}

/** expr의 임계값: 마지막 비교(>, >=, <, <=, ==, !=)와 그 오른쪽 수. 없으면 null */
export function thresholdOf(expr) {
  const m = /(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?(?:e-?\d+)?)\s*(?:\*\s*(\d+(?:\.\d+)?))?\s*$/i.exec(String(expr ?? '').trim());
  return m ? { op: m[1], value: Number(m[2]) * (m[3] ? Number(m[3]) : 1) } : null;
}

/** Prometheus duration 글(10m, 1h30m, 90s) -> ms */
export function durationMs(text) {
  let total = 0, any = false;
  for (const [, n, u] of String(text ?? '').matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d|w|y)/g)) { any = true; total += Number(n) * { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5, y: 31536e6 }[u]; }
  return any ? total : null;
}

/**
 * 알림 목록 행: { id, name, state, severity, target, ns, at, end, labels, annotations, summary, rule: { expr, for, group, file } | null,
 *  receivers, silenced, incident }. firing → pending → resolved, 같은 상태는 최근 시작 먼저.
 *  incidents: [{ id, number, alert, ns, at(ms) }] — 같은 알림 이름과 namespace이고 시작이 인시던트 감지 앞뒤 15분 안이면 그 인시던트.
 *  stale: { prometheus, alertmanager } 끊긴 출처(B4): 끊긴 Prometheus의 firing·pending은 지금 값이 아니라 state가 null(값 칸을 비움)
 */
export function alertList({ rules, alertmanager = [], history = [], incidents = [], stale = {} } = {}) {
  const ruleList = (rules?.data?.groups ?? rules?.groups ?? []).flatMap(g => (g.rules ?? []).filter(r => r.type === 'alerting').map(r => ({ ...r, group: g.name, file: g.file })));
  const ruleOf = name => ruleList.find(r => r.name === name) ?? null;
  const am = new Map((alertmanager ?? []).map(a => [labelKey(a.labels), a]));
  const same = (inner, outer) => Object.entries(inner).every(([k, v]) => outer?.[k] === v); /* inner의 라벨이 outer에 모두 같은 값으로 있음 */
  const rows = new Map();
  const add = (labels, extra) => {
    const key = labelKey(labels), name = labels.alertname, rule = ruleOf(name), m = am.get(key) ?? (alertmanager ?? []).find(a => same(labels, a.labels));
    const annotations = { ...(rule?.annotations ?? {}), ...(m?.annotations ?? {}), ...(extra.annotations ?? {}) };
    rows.set(key + '|' + (extra.at ?? ''), {
      id: extra.state === 'resolved' ? extra.id : m?.fingerprint ?? extra.id ?? fp(labels), name, labels, annotations, summary: annotations.summary ?? annotations.description ?? '',
      severity: labels.severity ?? '', target: targetOf(labels), ns: alertLabels(labels).namespace ?? '', state: extra.state, at: extra.at, end: extra.end ?? null,
      rule: rule ? { expr: rule.query, for: forText(rule.duration), group: rule.group, file: rule.file, labels: rule.labels ?? {}, annotations: rule.annotations ?? {} } : null,
      receivers: (m?.receivers ?? extra.receivers ?? []).map(r => r.name ?? r), silenced: !!m?.status?.silencedBy?.length, value: extra.value ?? null,
    });
  };
  for (const r of ruleList) for (const a of r.alerts ?? []) {
    if (!['firing', 'pending'].includes(a.state)) continue;
    const labels = { alertname: r.name, ...(r.labels ?? {}), ...(a.labels ?? {}) };
    add(labels, { state: stale.prometheus ? null : a.state, at: ms(a.activeAt), value: a.value != null ? Number(a.value) : null, annotations: a.annotations });
  }
  /* Alertmanager에만 있는 firing(Prometheus 밖 규칙, 또는 규칙 응답이 없는 경우). Alertmanager 쪽 라벨은 Prometheus 외부 라벨(prometheus, cluster 등)이 더해지므로
     규칙 쪽 라벨이 모두 같으면 같은 알림이다(같은 알림이 두 행으로 나오지 않음) */
  const live = [...rows.values()].map(r => r.labels);
  for (const a of alertmanager ?? []) {
    if (live.some(l => same(l, a.labels)) || a.status?.state === 'unprocessed') continue;
    add(a.labels, { state: stale.alertmanager ? null : 'firing', at: ms(a.startsAt), id: a.fingerprint });
  }
  for (const h of history ?? []) {
    const end = ms(h.endsAt);
    if (end == null) continue;
    add(h.labels, { state: 'resolved', at: ms(h.startsAt), end, id: `${h.fingerprint ?? fp(h.labels)}-${ms(h.startsAt)}`, annotations: h.annotations, receivers: h.receivers });
  }
  /* 늘 울리는 heartbeat 규칙(Watchdog)은 알림 목록에 두지 않는다: Alertmanager 출처가 살아 있다는 근거일 뿐 당번이 볼 문제가 아니다(사용자 결정 2026-11-16) */
  const out = [...rows.values()].filter(r => !HEARTBEAT.has(r.name)).map(r => ({ ...r, incident: incidentOf(r, incidents) }));
  return out.sort(compareHistory);
}

function incidentOf(row, incidents) {
  const hit = (incidents ?? []).find(i => i.alert === row.name && (!i.ns || i.ns === row.ns) && Number.isFinite(i.at) && row.at != null && Math.abs(i.at - row.at) <= 15 * MIN);
  return hit ? { id: hit.id, number: hit.number } : null;
}

/** 구간 안 행: 지금 울리는 것(끝나지 않음)은 언제 시작했든, 끝난 것은 시작이 구간 안일 때 */
export const alertsIn = (rows, { from, to }) => rows.filter(r => r.at != null && r.at <= to && (r.end == null || r.at >= from));

/** 알약·카드 머리의 수: 같은 행에서 센다. oldest: 가장 오래된 firing의 시작(ms) */
export function alertCounts(rows) {
  const n = s => rows.filter(r => r.state === s).length, fire = rows.filter(r => r.state === 'firing');
  const bySeverity = {};
  for (const r of fire) bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
  return { all: rows.length, firing: n('firing'), pending: n('pending'), resolved: n('resolved'), bySeverity, oldest: fire.length ? Math.min(...fire.map(r => r.at)) : null };
}

/** 상세의 상태 이력: pending(규칙 for 만큼 앞) → firing → resolved, 시각 순 */
export function alertSteps(row) {
  const forMs = durationMs(row.rule?.for) ?? 0, out = [];
  if (forMs) out.push({ state: 'pending', at: row.at - forMs });
  out.push({ state: 'firing', at: row.at });
  if (row.end != null) out.push({ state: 'resolved', at: row.end });
  return out;
}

/** 같은 알림(이름 + 대상)의 이력, 최근 먼저 */
export const sameAlert = (rows, row) => rows.filter(r => r.name === row.name && r.target === row.target).sort(compareHistory);
