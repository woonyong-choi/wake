/*
 * 인시던트 감지(순수 함수, spec/backend.md#F-BE-018). 알림(Alertmanager)과 Warning 이벤트, Pod 컨테이너 상태를 신호로 바꾸고, 소유 워크로드
 * (ownerReferences를 따라 올라간 Deployment·StatefulSet·DaemonSet·CronJob·Job, Node)와 시간 구간으로 묶어 인시던트를 연다.
 * AI는 알림 여부를 정하지 않는다(제품 제약 2): 규칙 표(SIGNALS)만 정한다.
 * 수명: open(신호가 살아 있음) → mitigated(알림이 풀리고 QUIET 동안 새 신호 없음, 복구 확인 시작) → resolved(복구 확인 통과).
 * mitigated 중 새 신호가 오면 다시 open. resolved 뒤의 새 신호는 새 인시던트.
 * 시각은 모두 epoch ms. 글은 만들지 않고 코드와 숫자만 돌려준다.
 */
import { verifyVerdict, VERIFY_DEFAULT } from './incident-model.js';
import { alertObjects } from './alerts.js';

const MIN = 60_000;
/* 알림 신호가 가리킬 수 있는 종류(소유를 따라 워크로드로 묶는 것) */
const ALERT_KINDS = new Set(['Pod', 'Deployment', 'StatefulSet', 'CronJob', 'Job', 'Node', 'Ingress']);
/** 신호 규칙: 이유(reason) → 심각도와 판정 규칙 이름. 이 표에 없는 Warning 이벤트는 인시던트를 열지 않는다 */
export const SIGNALS = Object.freeze({
  OOMKilled: { severity: 'critical', rule: 'oom-limit' },
  OOMKilling: { severity: 'critical', rule: 'oom-limit' },
  CrashLoopBackOff: { severity: 'critical', rule: 'crash-loop' },
  BackOff: { severity: 'warning', rule: 'crash-loop' },
  FailedScheduling: { severity: 'warning', rule: 'unschedulable' },
  NodeNotReady: { severity: 'critical', rule: 'node-not-ready' },
  BackoffLimitExceeded: { severity: 'warning', rule: 'job-failed' },
  DeadlineExceeded: { severity: 'warning', rule: 'job-failed' },
});
/** 알림 이름 → 신호 이유(wake-lab 규칙과 흔한 kube-prometheus 이름). 모르는 알림은 그 이름 그대로 신호가 되고 severity 라벨을 쓴다 */
const ALERT_REASON = { ContainerOOMKilled: 'OOMKilled', KubeContainerOOMKilled: 'OOMKilled', PodCrashLoopBackOff: 'CrashLoopBackOff', KubePodCrashLooping: 'CrashLoopBackOff',
  NodeNotReady: 'NodeNotReady', KubeNodeNotReady: 'NodeNotReady', CronJobRunFailed: 'BackoffLimitExceeded', KubeJobFailed: 'BackoffLimitExceeded' };

/** 묶는 구간: 신호가 이만큼 끊기면 같은 소유자라도 새 인시던트, 알림이 풀린 뒤 이만큼 조용하면 완화 */
export const DETECT = Object.freeze({ lookback: 60 * MIN, active: 10 * MIN, quiet: 5 * MIN, gap: 30 * MIN, maxSignals: 200 });

const ms = v => (v == null || v === '' ? null : typeof v === 'number' ? v : (t => (Number.isFinite(t) ? t : null))(Date.parse(v)));
const TOP = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'CronJob', 'Node']);

/**
 * The workload that owns an object, following ownerReferences (Pod → ReplicaSet → Deployment, Pod → Job → CronJob).
 *  ref: { kind, namespace, name }; lookup(kind, namespace, name) -> the object or null (from the lists the hub read).
 * Returns { kind, namespace, name, uid } of the topmost known owner (the object itself when it has none).
 */
export function ownerChain(ref, lookup) {
  let cur = { kind: ref.kind, namespace: ref.namespace ?? '', name: ref.name, uid: ref.uid ?? null };
  for (let i = 0; i < 4 && !TOP.has(cur.kind); i++) {
    const obj = lookup(cur.kind, cur.namespace, cur.name);
    const up = (obj?.metadata?.ownerReferences ?? []).find(o => o.controller) ?? obj?.metadata?.ownerReferences?.[0];
    if (!obj) break;
    cur.uid = cur.uid ?? obj.metadata?.uid ?? null;
    if (!up) break;
    cur = { kind: up.kind, namespace: cur.namespace, name: up.name, uid: up.uid ?? null };
  }
  return cur;
}

/** 신호 하나: { id, kind: alert|event|pod, reason, severity, at, end?, active, object, owner, alert?, message, count } */
const signal = (s, owner) => ({ ...s, owner, severity: s.severity ?? SIGNALS[s.reason]?.severity ?? 'warning' });

/**
 * Signals from what the hub read.
 *  alerts: Alertmanager /api/v2/alerts rows; events: core/v1 Events; pods: Pod objects; lookup: as ownerChain; now (ms).
 */
export function signalsOf({ alerts = [], events = [], pods = [], lookup = () => null, now }) {
  const out = [];
  for (const a of alerts) {
    const l = a.labels ?? {}, reason = ALERT_REASON[l.alertname] ?? l.alertname;
    /* 알림이 말하는 객체(알림 화면과 같은 alertObjects: 수집 대상 라벨은 뺌) 중 인시던트가 묶는 종류의 첫째 */
    const o = alertObjects(l).find(x => ALERT_KINDS.has(x.kind)), ref = o ? { kind: o.kind, namespace: o.namespace, name: o.name } : null;
    if (!ref) continue;
    const firing = (a.status?.state ?? 'active') === 'active';
    out.push(signal({ id: `alert:${a.fingerprint}`, kind: 'alert', reason, severity: l.severity === 'critical' ? 'critical' : SIGNALS[reason]?.severity ?? 'warning', at: ms(a.startsAt), end: firing ? null : ms(a.endsAt),
      active: firing, object: ref, alert: { name: l.alertname, fingerprint: a.fingerprint, severity: l.severity ?? null }, message: a.annotations?.summary ?? a.annotations?.description ?? '', count: 1 }, ownerChain(ref, lookup)));
  }
  for (const e of events) {
    if (e.type !== 'Warning' || !SIGNALS[e.reason]) continue;
    const o = e.involvedObject ?? e.regarding ?? {}, at = ms(e.series?.lastObservedTime) ?? ms(e.lastTimestamp) ?? ms(e.eventTime) ?? ms(e.metadata?.creationTimestamp);
    if (at == null) continue;
    const ref = { kind: o.kind, namespace: o.namespace ?? '', name: o.name, uid: o.uid ?? null };
    out.push(signal({ id: `event:${e.metadata?.uid}`, kind: 'event', reason: e.reason, at, first: ms(e.firstTimestamp) ?? at, active: now - at < DETECT.active, object: ref, message: e.message ?? e.note ?? '', count: e.series?.count ?? e.count ?? 1 }, ownerChain(ref, lookup)));
  }
  for (const p of pods) {
    const ref = { kind: 'Pod', namespace: p.metadata?.namespace ?? '', name: p.metadata?.name, uid: p.metadata?.uid ?? null };
    for (const c of p.status?.containerStatuses ?? []) {
      const term = c.lastState?.terminated, waiting = c.state?.waiting;
      if (term?.reason === 'OOMKilled' && ms(term.finishedAt) != null) {
        const at = ms(term.finishedAt);
        out.push(signal({ id: `pod:${ref.uid}:${c.name}:oom:${at}`, kind: 'pod', reason: 'OOMKilled', at, active: now - at < DETECT.active, object: { ...ref, container: c.name, containerId: c.containerID ?? null },
          message: `exit ${term.exitCode}`, count: c.restartCount ?? 1 }, ownerChain(ref, lookup)));
      }
      if (waiting?.reason === 'CrashLoopBackOff') {
        out.push(signal({ id: `pod:${ref.uid}:${c.name}:crashloop`, kind: 'pod', reason: 'CrashLoopBackOff', at: ms(term?.finishedAt) ?? now, active: true, object: { ...ref, container: c.name, containerId: c.containerID ?? null },
          message: waiting.message ?? '', count: c.restartCount ?? 1 }, ownerChain(ref, lookup)));
      }
    }
  }
  return out.filter(s => s.at != null && s.owner?.name);
}

const keyOf = (cluster, o) => `${cluster}|${o.kind}|${o.namespace ?? ''}|${o.name}`;
/* 안정 id: 같은 소유자와 같은 첫 신호 분이면 같은 id(FNV-1a 64) */
export function stableId(text) {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(text)) { h ^= BigInt(b); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return 'inc-' + h.toString(16).padStart(16, '0');
}
const worse = (a, b) => (a === 'critical' || b === 'critical' ? 'critical' : 'warning');

/**
 * One detection pass: attaches signals to the incidents they belong to and moves each incident along its lifecycle.
 *  cluster: context id; incidents: the stored incidents of that cluster; signals: signalsOf(); now (ms);
 *  ready(owner) -> true | false | null: whether the owner workload is healthy now (null: could not read: the window is a miss);
 *  nextNumber(): the next incident number (INC-0001 …), called only for a new incident.
 * Returns { incidents (changed or new, whole records), opened: [id] }.
 */
export function detect({ cluster, incidents = [], signals = [], now, ready = () => null, nextNumber }) {
  const byKey = new Map(), closed = new Map();
  for (const inc of incidents.filter(i => i.phase !== 'resolved')) byKey.set(inc.key, inc);
  /* 해결된 인시던트가 이미 가진 신호(같은 id, 그 마지막 신호까지)는 새 인시던트를 열지 않는다 */
  for (const inc of incidents.filter(i => i.phase === 'resolved')) if (!closed.has(inc.key) || closed.get(inc.key).resolvedAt < inc.resolvedAt) closed.set(inc.key, inc);
  const changed = new Map(), opened = [];
  /* 지워진 객체(롤백으로 사라진 Pod)는 소유자를 다시 찾을 수 없다: 그 객체의 신호를 이미 가진 인시던트에 붙인다 */
  const objectKey = o => `${o.kind}|${o.namespace ?? ''}|${o.name}`, seen = new Map();
  for (const inc of [...byKey.values(), ...closed.values()]) for (const x of inc.signals) seen.set(objectKey(x.object), inc.key);
  const keyFor = s => (s.owner.kind === s.object.kind && seen.has(objectKey(s.object)) ? seen.get(objectKey(s.object)) : keyOf(cluster, s.owner));
  const recent = signals.filter(s => s.active || now - s.at < DETECT.lookback).sort((a, b) => a.at - b.at);
  for (const s of recent) {
    const key = keyFor(s);
    let inc = changed.get(byKey.get(key)?.id) ?? byKey.get(key);
    if (inc && !s.active && s.at < inc.detectedAt - DETECT.gap) continue;
    if (!inc) {
      const done = closed.get(key);
      if (done && (s.at <= done.lastSignalAt || done.signals.some(x => x.id === s.id && x.at === s.at))) continue;
      if (!s.active && now - s.at > DETECT.gap) continue; // an old signal with nothing open does not open an incident afterwards
      const detectedAt = s.at, rule = SIGNALS[s.reason]?.rule ?? 'alert';
      inc = { id: stableId(`${key}|${Math.floor(detectedAt / MIN)}`), number: nextNumber(), cluster, key, target: { ...s.owner }, rule, reasons: {}, severity: s.severity,
        alert: s.alert ? { name: s.alert.name, source: 'Alertmanager' } : null, detectedAt, lastSignalAt: s.at, phase: 'open', mitigatedAt: null, resolvedAt: null, recovery: null,
        signals: [], verify: { windows: [], verifyFrom: null, lastWindowAt: null } };
      byKey.set(key, inc); opened.push(inc.id);
    }
    const had = inc.signals.find(x => x.id === s.id);
    const row = { id: s.id, kind: s.kind, reason: s.reason, at: s.at, end: s.end ?? null, active: s.active, object: s.object, alert: s.alert ?? null, message: s.message, count: s.count };
    if (had && JSON.stringify(had) === JSON.stringify(row)) { continue; }
    const signalsNext = had ? inc.signals.map(x => (x.id === s.id ? row : x)) : [...inc.signals, row].slice(-DETECT.maxSignals);
    const reasons = { ...inc.reasons, [s.reason]: (inc.reasons[s.reason] ?? 0) + (had ? 0 : 1) };
    inc = { ...inc, signals: signalsNext, reasons, severity: worse(inc.severity, s.severity), lastSignalAt: Math.max(inc.lastSignalAt, s.at), detectedAt: Math.min(inc.detectedAt, s.at),
      alert: inc.alert ?? (s.alert ? { name: s.alert.name, source: 'Alertmanager' } : null), rule: inc.rule === 'alert' && SIGNALS[s.reason] ? SIGNALS[s.reason].rule : inc.rule };
    changed.set(inc.id, inc); byKey.set(key, inc);
  }
  for (const base of byKey.values()) {
    const inc = changed.get(base.id) ?? base;
    const next = advance(inc, signals.filter(s => keyFor(s) === inc.key), now, ready);
    if (next !== inc || changed.has(inc.id)) changed.set(inc.id, next);
  }
  return { incidents: [...changed.values()], opened };
}

/* 수명 한 걸음: 살아 있는 신호가 있으면 open, 없고 조용하면 mitigated(확인 구간을 30초마다 하나씩), 확인이 통과하면 resolved */
function advance(inc, own, now, ready) {
  const live = own.some(s => s.active && s.at >= inc.detectedAt - DETECT.gap);
  if (live || now - inc.lastSignalAt < DETECT.quiet) {
    return inc.phase === 'open' ? inc : { ...inc, phase: 'open', mitigatedAt: null, verify: { windows: [], verifyFrom: null, lastWindowAt: null } };
  }
  const { cadence } = VERIFY_DEFAULT;
  let v = inc.verify;
  if (inc.phase === 'open') v = { windows: [], verifyFrom: now, lastWindowAt: now };
  /* 한 번 읽을 때 구간 하나. 읽지 못하고 지나간 구간(앱이 꺼져 있던 동안)만 miss로 채운다: 읽기 간격의 흔들림은 miss가 아니다 */
  const elapsed = now - v.lastWindowAt;
  if (elapsed >= 0.8 * cadence) {
    const r = ready(inc.target), skipped = Math.max(0, Math.round(elapsed / cadence) - 1);
    const windows = [...v.windows, ...Array(skipped).fill('miss'), r === null ? 'miss' : r ? 'ok' : 'bad'].slice(0, 2 * VERIFY_DEFAULT.max / cadence);
    v = { ...v, windows, lastWindowAt: now };
  }
  const verdict = verifyVerdict({ verifyFrom: v.verifyFrom, now, windows: v.windows });
  const mitigated = { ...inc, phase: 'mitigated', mitigatedAt: inc.mitigatedAt ?? v.verifyFrom, verify: v };
  if (verdict.state === 'pass') return { ...mitigated, phase: 'resolved', resolvedAt: now, recovery: 'service' };
  if (verdict.state === 'fail' || verdict.state === 'inconclusive') return { ...mitigated, verify: { windows: [], verifyFrom: now, lastWindowAt: now } };
  return inc.phase === 'mitigated' && v === inc.verify ? inc : mitigated;
}
