/*
 * 인시던트 감지(순수 함수, spec/backend.md#F-BE-018). 알림(Alertmanager)과 Warning 이벤트, Pod 컨테이너 상태, 조건, Service의 EndpointSlice를 신호로 바꾸고, 소유 워크로드
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
const ALERT_KINDS = new Set(['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'CronJob', 'Job', 'Node', 'Ingress', 'PersistentVolumeClaim']);
/* 없는 ConfigMap·Secret이나 키(kubelet이 컨테이너 시작·볼륨 연결에서 쓰는 말) */
const CONFIG_MISSING = /(configmaps?|secrets?) "[^"]*" not found|couldn't find key/i;
/**
 * 신호 규칙: 이유(reason) → 심각도와 판정 규칙 이름. 이 표에 없는 Warning 이벤트·상태는 인시던트를 열지 않는다(AI가 정하지 않는다).
 *  by: 같은 이유를 여러 장애가 함께 쓸 때 메시지로 나누는 [정규식, 규칙] 목록(먼저 맞는 것). rule이 null이고 맞는 것이 없으면 신호가 아니다.
 *  min: 이벤트 반복 수가 이만큼은 돼야 신호(probe 한두 번 실패는 시작 중의 흔들림).
 *  on, from: 이벤트로 올 때 그 이유를 쓰는 대상 종류와 보고한 구성 요소(남긴 곳이 있을 때만 대조). 다른 컨트롤러가 같은 이유 글자를 쓴 이벤트는 신호가 아니다.
 */
export const SIGNALS = Object.freeze({
  OOMKilled: { severity: 'critical', rule: 'oom-limit' },
  OOMKilling: { severity: 'critical', rule: 'oom-limit' },
  CrashLoopBackOff: { severity: 'critical', rule: 'crash-loop' },
  BackOff: { severity: 'warning', rule: null, by: [[/pulling image/i, 'image-pull'], [/restarting failed container/i, 'crash-loop']], on: ['Pod'], from: 'kubelet' },
  ImagePullBackOff: { severity: 'critical', rule: 'image-pull' },
  ErrImagePull: { severity: 'critical', rule: 'image-pull' },
  InvalidImageName: { severity: 'critical', rule: 'image-pull' },
  ErrImageNeverPull: { severity: 'critical', rule: 'image-pull' },
  Failed: { severity: 'critical', rule: null, by: [[CONFIG_MISSING, 'container-config'], [/ImagePull|ErrImage|InvalidImageName|pull(ing)? image/i, 'image-pull']], on: ['Pod'], from: 'kubelet' },
  CreateContainerConfigError: { severity: 'critical', rule: 'container-config' },
  CreateContainerError: { severity: 'critical', rule: 'container-config' },
  Unhealthy: { severity: 'warning', rule: 'probe-failed', min: 3, on: ['Pod'], from: 'kubelet' },
  FailedScheduling: { severity: 'warning', rule: 'unschedulable' },
  FailedMount: { severity: 'warning', rule: 'volume', by: [[CONFIG_MISSING, 'container-config']] },
  FailedAttachVolume: { severity: 'warning', rule: 'volume' },
  ProvisioningFailed: { severity: 'warning', rule: 'volume' },
  Evicted: { severity: 'warning', rule: 'evicted' },
  EvictionThresholdMet: { severity: 'warning', rule: 'node-pressure' },
  MemoryPressure: { severity: 'warning', rule: 'node-pressure' },
  DiskPressure: { severity: 'warning', rule: 'node-pressure' },
  PIDPressure: { severity: 'warning', rule: 'node-pressure' },
  NodeNotReady: { severity: 'critical', rule: 'node-not-ready' },
  BackoffLimitExceeded: { severity: 'warning', rule: 'job-failed' },
  DeadlineExceeded: { severity: 'warning', rule: 'job-failed' },
  ProgressDeadlineExceeded: { severity: 'warning', rule: 'rollout-stuck' },
  FailedCreate: { severity: 'warning', rule: 'create-denied' },
  ReplicaFailure: { severity: 'warning', rule: 'create-denied' },
  NoReadyEndpoints: { severity: 'critical', rule: 'no-endpoints' },
});
/** 규칙마다 원인 갈래: [원인, 정규식] 먼저 맞는 것(이유와 메시지를 함께 읽음). 맞는 것이 없으면 원인은 null(메시지가 원인을 말하지 않음) */
export const CAUSES = Object.freeze({
  'image-pull': [['name', /InvalidImageName|invalid reference/i], ['access', /unauthorized|authenticat|access denied|authorization|forbidden/i], ['notfound', /not found|manifest unknown/i]],
  /* 빠진 대상을 말하는 메시지만 원인(ConfigMap·Secret이라는 낱말만 나오는 일반 오류는 원인을 말하지 않음) */
  'container-config': [['key', /couldn't find key/i], ['configmap', /configmaps? "[^"]*" not found/i], ['secret', /secrets? "[^"]*" not found/i]],
  'probe-failed': [['liveness', /Liveness/i], ['readiness', /Readiness/i], ['startup', /Startup/i]],
  unschedulable: [['pvc', /unbound|PersistentVolumeClaim|volume node affinity/i], ['resources', /Insufficient /i], ['affinity', /affinity|selector/i], ['taint', /taint|toleration/i]],
  volume: [['provision', /ProvisioningFailed/], ['attach', /FailedAttachVolume/], ['mount', /FailedMount/]],
  evicted: [['node', /node was low on resource/i], ['limit', /exceed/i]],
  'node-pressure': [['memory', /memory/i], ['disk', /disk|ephemeral|nodefs|imagefs/i], ['pid', /PID/]],
  'node-not-ready': [['unreachable', /^NodeNotReady Ready=Unknown/]],
  'job-failed': [['backoff', /BackoffLimitExceeded|backoff limit/i], ['deadline', /DeadlineExceeded|deadline/i]],
  'create-denied': [['quota', /quota/i], ['admission', /admission webhook|denied the request|denied request|ValidatingAdmissionPolicy/i]],
  'no-endpoints': [['selector', /no Pod or workload matches/], ['nopods', /no Pod matches/], ['notready', /not ready/]],
});
/** 판정 규칙의 이름과 버전(앱 자료). 글은 locale wake.inc.rule.<규칙>.* */
export const RULES = Object.freeze({ 'oom-limit': 'v1', 'crash-loop': 'v1', 'image-pull': 'v1', 'container-config': 'v1', 'probe-failed': 'v1', unschedulable: 'v2', volume: 'v1', evicted: 'v1',
  'node-pressure': 'v1', 'node-not-ready': 'v2', 'job-failed': 'v2', 'rollout-stuck': 'v1', 'create-denied': 'v1', 'no-endpoints': 'v1', alert: 'v1' });
/* 한 인시던트에 여러 규칙의 신호가 모이면 더 구체적인 원인의 규칙이 이름이 된다(앞이 더 구체적): 멈춘 롤아웃은 이미지 받기 실패의 증상, 준비된 endpoint 없음은 Pod 쪽 원인의 증상 */
const RANK = ['oom-limit', 'image-pull', 'container-config', 'create-denied', 'volume', 'unschedulable', 'node-not-ready', 'node-pressure', 'evicted', 'probe-failed', 'crash-loop', 'job-failed', 'no-endpoints', 'rollout-stuck', 'alert'];
const rankOf = rule => (RANK.includes(rule) ? RANK.indexOf(rule) : RANK.length);
const better = (a, b) => (rankOf(b) < rankOf(a) ? b : a);

/* 스케줄러 메시지의 Node별 사유 중 원인 후보: 첫 문장("0/3 nodes are available: …")의 사유에서 control-plane taint(모든 kind·kubeadm 클러스터가 늘 보고)를 뺀 것 */
function schedulingReasons(message) {
  const first = String(message).split(/\.\s/)[0], list = first.includes(': ') ? first.slice(first.indexOf(': ') + 2) : first;
  return list.split(/,\s(?=\d|pod )/).filter(p => !/node-role\.kubernetes\.io\/(control-plane|master)/.test(p)).join(', ');
}

/**
 * The rule a reason and its message stand for, from the table alone: { rule, severity, cause } or null (not a signal).
 * cause is the branch of CAUSES the reason and message name, null when the message does not say.
 */
export function classify(reason, message = '') {
  const s = SIGNALS[reason];
  if (!s) return null;
  const hit = (s.by ?? []).find(([re]) => re.test(message ?? ''));
  const rule = hit ? hit[1] : s.rule;
  if (!rule) return null;
  const text = rule === 'unschedulable' ? schedulingReasons(message ?? '') : `${reason} ${message ?? ''}`;
  return { rule, severity: s.severity, cause: (CAUSES[rule] ?? []).find(([, re]) => re.test(text))?.[0] ?? null };
}

/** 알림 이름 → 신호 이유(wake-lab 규칙과 흔한 kube-prometheus 이름). 모르는 알림은 그 이름 그대로 신호가 되고 severity 라벨을 쓴다 */
const ALERT_REASON = { ContainerOOMKilled: 'OOMKilled', KubeContainerOOMKilled: 'OOMKilled', PodCrashLoopBackOff: 'CrashLoopBackOff', KubePodCrashLooping: 'CrashLoopBackOff',
  NodeNotReady: 'NodeNotReady', KubeNodeNotReady: 'NodeNotReady', KubeNodeUnreachable: 'NodeNotReady', CronJobRunFailed: 'BackoffLimitExceeded', KubeJobFailed: 'BackoffLimitExceeded',
  KubeDeploymentRolloutStuck: 'ProgressDeadlineExceeded', KubePersistentVolumeErrors: 'ProvisioningFailed' };

/**
 * Facts an object's own conditions state (Node, Deployment, Job): [{ reason, message, at, status }] for the conditions the rule table reads.
 * Node: Ready not True (NodeNotReady, status True|False|Unknown kept in the message head) and a pressure condition True; Deployment: Progressing
 * False with ProgressDeadlineExceeded and ReplicaFailure True; Job: Failed True with its reason. The hub fixes the same facts as evidence.
 */
export function conditionFacts(obj) {
  const kind = obj?.kind, out = [];
  for (const c of obj?.status?.conditions ?? []) {
    const at = ms(c.lastTransitionTime) ?? ms(c.lastUpdateTime);
    if (kind === 'Node' && c.type === 'Ready' && c.status !== 'True') out.push({ reason: 'NodeNotReady', status: c.status, message: `Ready=${c.status}: ${c.message ?? c.reason ?? ''}`, at });
    if (kind === 'Node' && ['MemoryPressure', 'DiskPressure', 'PIDPressure'].includes(c.type) && c.status === 'True') out.push({ reason: c.type, message: c.message ?? '', at });
    if (kind === 'Deployment' && c.type === 'Progressing' && c.status === 'False' && c.reason === 'ProgressDeadlineExceeded') out.push({ reason: 'ProgressDeadlineExceeded', message: c.message ?? '', at });
    if (kind === 'Deployment' && c.type === 'ReplicaFailure' && c.status === 'True') out.push({ reason: 'ReplicaFailure', message: c.message ?? '', at });
    if (kind === 'Job' && c.type === 'Failed' && c.status === 'True' && SIGNALS[c.reason]) out.push({ reason: c.reason, message: c.message ?? '', at });
  }
  return out;
}

/**
 * Facts a Pod's own status states: [{ reason, message, container? }] (waiting reasons of its containers and init containers, an eviction,
 * and the scheduler's PodScheduled=False message as FailedScheduling). The hub fixes the same facts as evidence.
 */
export function podFacts(p) {
  const out = [];
  for (const c of [...(p?.status?.initContainerStatuses ?? []), ...(p?.status?.containerStatuses ?? [])]) {
    const w = c.state?.waiting;
    if (w?.reason && SIGNALS[w.reason]) out.push({ reason: w.reason, message: w.message ?? '', container: c.name, containerId: c.containerID ?? null });
  }
  if (p?.status?.reason === 'Evicted') out.push({ reason: 'Evicted', message: p.status.message ?? '' });
  const sched = (p?.status?.conditions ?? []).find(c => c.type === 'PodScheduled' && c.status === 'False' && c.reason === 'Unschedulable');
  if (sched) out.push({ reason: 'FailedScheduling', message: sched.message ?? '', at: ms(sched.lastTransitionTime) });
  return out;
}

/* 선택자가 고르는 Pod를 만드는 워크로드(템플릿 라벨) */
const TEMPLATE_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet']);
const matches = (selector, labels) => Object.entries(selector).every(([k, v]) => (labels ?? {})[k] === v);

/**
 * Facts a Service's EndpointSlices state: [{ reason: 'NoReadyEndpoints', message, at, selector, pods, workload }] when a Service with a selector has no
 * ready endpoint, else []. A Service without selector (its endpoints are kept by hand) or ExternalName has none to read. No ready endpoint is a fact only
 * when something is meant to serve: Pods match the selector but none is ready (notready), a workload whose template carries the labels wants Pods but has
 * none (nopods), or nothing at all carries the labels (selector). Workloads scaled to zero on purpose and finished Pods (Succeeded, Failed) are not.
 *  slices: discovery.k8s.io/v1 EndpointSlices (any namespace: those of this Service are picked by the kubernetes.io/service-name label);
 *  pods, workloads: lists of the same cluster (Deployment, StatefulSet, DaemonSet templates are read). An endpoint with no ready condition is ready (API).
 * at: the last endpoint change the slices record (endpoints.kubernetes.io/last-change-trigger-time), else the Service creation.
 */
export function endpointFacts(service, { slices = [], pods = [], workloads = [] } = {}) {
  const sel = service?.spec?.selector ?? {}, ns = service?.metadata?.namespace ?? '', name = service?.metadata?.name;
  if (service?.spec?.type === 'ExternalName' || !Object.keys(sel).length) return [];
  const own = slices.filter(s => (s.metadata?.namespace ?? '') === ns && s.metadata?.labels?.['kubernetes.io/service-name'] === name);
  if (own.some(s => (s.endpoints ?? []).some(e => e.conditions?.ready !== false))) return [];
  const selector = Object.entries(sel).map(([k, v]) => `${k}=${v}`).join(',');
  const matching = pods.filter(p => (p.metadata?.namespace ?? '') === ns && matches(sel, p.metadata?.labels)), live = matching.filter(p => !['Succeeded', 'Failed'].includes(p.status?.phase));
  const makers = workloads.filter(w => TEMPLATE_KINDS.has(w.kind) && (w.metadata?.namespace ?? '') === ns && matches(sel, w.spec?.template?.metadata?.labels));
  const want = w => (w.kind === 'DaemonSet' ? w.status?.desiredNumberScheduled ?? 1 : w.spec?.replicas ?? 1);
  const wanting = makers.find(w => want(w) > 0) ?? null;
  const at = maxMs(own.map(s => ms(s.metadata?.annotations?.['endpoints.kubernetes.io/last-change-trigger-time']) ?? ms(s.metadata?.creationTimestamp))) ?? ms(service.metadata?.creationTimestamp);
  const endpoints = own.reduce((a, s) => a + (s.endpoints ?? []).length, 0);
  const fact = message => [{ reason: 'NoReadyEndpoints', message, at, selector, pods: live, workload: wanting }];
  if (live.length) return fact(`0 of ${endpoints} endpoints ready: ${live.length} Pod(s) matching ${selector} not ready`);
  if (wanting) return fact(`no Pod matches ${selector}: ${wanting.kind} ${wanting.metadata?.name} wants ${want(wanting)}`);
  if (makers.length || matching.length) return [];
  return fact(`no Pod or workload matches ${selector}`);
}

/** 묶는 구간: 신호가 이만큼 끊기면 같은 소유자라도 새 인시던트, 알림이 풀린 뒤 이만큼 조용하면 완화. 준비된 endpoint 없음은 endpointGrace 동안 이어져야 신호(Pod가 막 뜨는 중) */
export const DETECT = Object.freeze({ lookback: 60 * MIN, active: 10 * MIN, quiet: 5 * MIN, gap: 30 * MIN, maxSignals: 200, endpointGrace: 2 * MIN });

const ms = v => (v == null || v === '' ? null : typeof v === 'number' ? v : (t => (Number.isFinite(t) ? t : null))(Date.parse(v)));
const maxMs = values => values.reduce((a, v) => (v != null && (a == null || v > a) ? v : a), null);
const TOP = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'CronJob', 'Node']);

/**
 * The workload that owns an object, following ownerReferences (Pod → ReplicaSet → Deployment, Pod → Job → CronJob).
 *  ref: { kind, namespace, name }; lookup(kind, namespace, name) -> the object or null (from the lists the hub read).
 * Returns { kind, namespace, name, uid } of the topmost known owner (the object itself when it has none).
 * Every hop is checked by UID: an object read under the name whose UID is not the one the reference names is a replacement, so the chain stops at
 * the reference (the replaced owner) and never climbs into the replacement's owners.
 */
export function ownerChain(ref, lookup) {
  let cur = { kind: ref.kind, namespace: ref.namespace ?? '', name: ref.name, uid: ref.uid ?? null };
  for (let i = 0; i < 4 && !TOP.has(cur.kind); i++) {
    /* 정적 Pod의 이벤트는 정적 UID를 말하고, API의 mirror Pod는 그 UID를 kubernetes.io/config.mirror 주석에 둔다(같은 객체) */
    const read = lookup(cur.kind, cur.namespace, cur.name), same = !read || !cur.uid || !read.metadata?.uid || read.metadata.uid === cur.uid || read.metadata.annotations?.['kubernetes.io/config.mirror'] === cur.uid;
    const obj = same ? read : null;
    if (read && !obj) break;
    const up = (obj?.metadata?.ownerReferences ?? []).find(o => o.controller) ?? obj?.metadata?.ownerReferences?.[0];
    /* 지워진 Pod(롤아웃이 바꾼 것)의 이벤트: 이름의 ReplicaSet(<rs>-<5자>)이 아직 있으면 그 ReplicaSet을 따라 올라간다 */
    const rs = !obj && cur.kind === 'Pod' && /-[a-z0-9]{5}$/.test(cur.name) ? cur.name.replace(/-[a-z0-9]{5}$/, '') : null;
    if (rs && lookup('ReplicaSet', cur.namespace, rs)) { cur = { kind: 'ReplicaSet', namespace: cur.namespace, name: rs, uid: null }; continue; }
    if (!obj) break;
    cur.uid = cur.uid ?? obj.metadata?.uid ?? null;
    if (!up) break;
    cur = { kind: up.kind, namespace: up.kind === 'Node' ? '' : cur.namespace, name: up.name, uid: up.uid ?? null };
  }
  /* 맨 위 소유자(알림이 Deployment 라벨로 바로 가리킨 경우 등)의 UID를 모르면 읽은 목록에서 채운다: 같은 이름의 대체와 구별하려고 */
  if (TOP.has(cur.kind) && !cur.uid) cur.uid = lookup(cur.kind, cur.namespace, cur.name)?.metadata?.uid ?? null;
  return cur;
}

/** 신호 하나: { id, kind: alert|event|pod|node|workload, reason, rule, cause, severity, at, end?, active, object, owner, alert?, message, count } */
const signal = (s, owner) => {
  const c = classify(s.reason, s.message);
  return { ...s, owner, rule: c?.rule ?? (s.kind === 'alert' ? 'alert' : null), cause: c?.cause ?? null, severity: s.severity ?? c?.severity ?? SIGNALS[s.reason]?.severity ?? 'warning' };
};

/**
 * Signals from what the hub read.
 *  alerts: Alertmanager /api/v2/alerts rows; events: core/v1 Events; pods: Pod objects; nodes: Node objects; workloads: Deployment, StatefulSet, DaemonSet and Job objects;
 *  services, slices: Services and EndpointSlices (endpointFacts); lookup: as ownerChain; now (ms).
 * A PersistentVolumeClaim joins the workload of a Pod that mounts it (the claim has no owner of its own). A Service without ready endpoints joins the
 * workload of its Pods (or the one that wants them) so the Pod side cause names the incident; with nothing behind its selector it stays on the Service.
 */
export function signalsOf({ alerts = [], events = [], pods = [], nodes = [], workloads = [], services = [], slices = [], lookup = () => null, now }) {
  const out = [], claims = new Map();
  for (const p of pods) for (const v of p.spec?.volumes ?? []) if (v.persistentVolumeClaim?.claimName) claims.set(`${p.metadata?.namespace ?? ''}/${v.persistentVolumeClaim.claimName}`, p);
  const ownerOf = ref => {
    const user = ref.kind === 'PersistentVolumeClaim' ? claims.get(`${ref.namespace ?? ''}/${ref.name}`) : null;
    return user ? ownerChain({ kind: 'Pod', namespace: user.metadata.namespace, name: user.metadata.name, uid: user.metadata.uid ?? null }, lookup) : ownerChain(ref, lookup);
  };
  for (const a of alerts) {
    const l = a.labels ?? {}, reason = ALERT_REASON[l.alertname] ?? l.alertname;
    /* 알림이 말하는 객체(알림 화면과 같은 alertObjects: 수집 대상 라벨은 뺌) 중 인시던트가 묶는 종류의 첫째 */
    const o = alertObjects(l).find(x => ALERT_KINDS.has(x.kind)), ref = o ? { kind: o.kind, namespace: o.namespace, name: o.name } : null;
    if (!ref) continue;
    const firing = (a.status?.state ?? 'active') === 'active';
    out.push(signal({ id: `alert:${a.fingerprint}`, kind: 'alert', reason, severity: l.severity === 'critical' ? 'critical' : SIGNALS[reason]?.severity ?? 'warning', at: ms(a.startsAt), end: firing ? null : ms(a.endsAt),
      active: firing, object: ref, alert: { name: l.alertname, fingerprint: a.fingerprint, severity: l.severity ?? null }, message: a.annotations?.summary ?? a.annotations?.description ?? '', count: 1 }, ownerOf(ref)));
  }
  for (const e of events) {
    const message = e.message ?? e.note ?? '', count = e.series?.count ?? e.count ?? 1;
    if (e.type !== 'Warning' || !classify(e.reason, message) || count < (SIGNALS[e.reason].min ?? 1)) continue;
    const o = e.involvedObject ?? e.regarding ?? {}, { on, from } = SIGNALS[e.reason], reporter = e.source?.component || e.reportingController || null;
    if ((on && !on.includes(o.kind)) || (from && reporter && reporter !== from)) continue;
    const at =ms(e.series?.lastObservedTime) ?? ms(e.lastTimestamp) ?? ms(e.eventTime) ?? ms(e.metadata?.creationTimestamp);
    if (at == null) continue;
    const ref = { kind: o.kind, namespace: o.namespace ?? '', name: o.name, uid: o.uid ?? null };
    /* node-controller가 그 Node의 Pod마다 남기는 NodeNotReady는 워크로드가 아니라 그 Node의 일 */
    const node = e.reason === 'NodeNotReady' && ref.kind === 'Pod' ? lookup('Pod', ref.namespace, ref.name)?.spec?.nodeName : null;
    out.push(signal({ id: `event:${e.metadata?.uid}`, kind: 'event', reason: e.reason, at, first: ms(e.firstTimestamp) ?? at, active: now - at < DETECT.active, object: ref, message, count },
      node ? { kind: 'Node', namespace: '', name: node, uid: null } : ownerOf(ref)));
  }
  for (const p of pods) {
    const ref = { kind: 'Pod', namespace: p.metadata?.namespace ?? '', name: p.metadata?.name, uid: p.metadata?.uid ?? null }, owner = ownerOf(ref);
    const started = ms(p.status?.startTime) ?? ms(p.metadata?.creationTimestamp) ?? now;
    for (const c of [...(p.status?.initContainerStatuses ?? []), ...(p.status?.containerStatuses ?? [])]) {
      const term = c.lastState?.terminated;
      if (term?.reason === 'OOMKilled' && ms(term.finishedAt) != null) {
        const at = ms(term.finishedAt);
        out.push(signal({ id: `pod:${ref.uid}:${c.name}:oom:${at}`, kind: 'pod', reason: 'OOMKilled', at, active: now - at < DETECT.active, object: { ...ref, container: c.name, containerId: c.containerID ?? null },
          message: `exit ${term.exitCode}`, count: c.restartCount ?? 1 }, owner));
      }
    }
    /* 상태가 지금 말하는 것(대기 이유, 축출, 스케줄 못 함): 그 상태가 남아 있는 동안 살아 있는 신호 */
    for (const f of podFacts(p)) {
      const c = (p.status?.containerStatuses ?? []).find(x => x.name === f.container), term = c?.lastState?.terminated;
      if (f.reason === 'CrashLoopBackOff') {
        out.push(signal({ id: `pod:${ref.uid}:${f.container}:crashloop`, kind: 'pod', reason: f.reason, at: ms(term?.finishedAt) ?? now, active: true, object: { ...ref, container: f.container, containerId: f.containerId },
          message: f.message, count: c?.restartCount ?? 1 }, owner));
      } else if (f.reason === 'Evicted') {
        const cond = (p.status?.conditions ?? []).find(x => x.type === 'DisruptionTarget' && x.status === 'True') ?? (p.status?.conditions ?? []).find(x => x.type === 'Ready');
        const at = ms(cond?.lastTransitionTime) ?? started;
        out.push(signal({ id: `pod:${ref.uid}:evicted`, kind: 'pod', reason: f.reason, at, active: now - at < DETECT.active, object: ref, message: f.message, count: 1 }, owner));
      } else if (classify(f.reason, f.message)) {
        out.push(signal({ id: `pod:${ref.uid}:${f.container ?? 'pod'}:${classify(f.reason, f.message).rule}`, kind: 'pod', reason: f.reason, at: f.at ?? started, active: true,
          object: f.container ? { ...ref, container: f.container, containerId: f.containerId } : ref, message: f.message, count: 1 }, owner));
      }
    }
  }
  /* Node와 워크로드의 조건: 조건이 서 있는 동안 살아 있음(실패한 Job은 지난 일이라 그 시각부터 active 구간만) */
  for (const o of [...nodes, ...workloads]) {
    /* Job은 예약 시각도 신호에 남긴다(그 Job이 TTL로 지워진 뒤에도 CronJob 복구가 영향받은 실행 뒤의 실행을 고를 수 있게) */
    const scheduledAt = o.kind === 'Job' ? ms(o.metadata?.annotations?.['batch.kubernetes.io/cronjob-scheduled-timestamp']) ?? ms(o.metadata?.creationTimestamp) : null;
    const ref = { kind: o.kind, namespace: o.metadata?.namespace ?? '', name: o.metadata?.name, uid: o.metadata?.uid ?? null, ...(scheduledAt != null ? { scheduledAt } : {}) };
    for (const f of conditionFacts(o)) {
      if (f.at == null) continue;
      out.push(signal({ id: `${o.kind === 'Node' ? 'node' : 'workload'}:${ref.uid ?? ref.name}:${f.reason}:${f.at}`, kind: o.kind === 'Node' ? 'node' : 'workload', reason: f.reason, at: f.at,
        active: o.kind === 'Job' ? now - f.at < DETECT.active : true, object: ref, message: f.message, count: 1 }, o.kind === 'Node' ? { kind: 'Node', namespace: '', name: ref.name, uid: ref.uid } : ownerOf(ref)));
    }
  }
  /* 준비된 endpoint 없는 Service: 그 상태가 endpointGrace 넘게 이어지는 동안 살아 있는 신호 */
  for (const svc of services) {
    const ref = { kind: 'Service', namespace: svc.metadata?.namespace ?? '', name: svc.metadata?.name, uid: svc.metadata?.uid ?? null };
    for (const f of endpointFacts(svc, { slices, pods, workloads })) {
      if (f.at == null || now - f.at < DETECT.endpointGrace) continue;
      const p = [...f.pods].sort((a, b) => String(a.metadata?.name).localeCompare(String(b.metadata?.name)))[0];
      const owner = p ? ownerOf({ kind: 'Pod', namespace: p.metadata.namespace, name: p.metadata.name, uid: p.metadata.uid ?? null })
        : f.workload ? { kind: f.workload.kind, namespace: ref.namespace, name: f.workload.metadata?.name, uid: f.workload.metadata?.uid ?? null } : ref;
      out.push(signal({ id: `service:${ref.uid ?? ref.name}:no-endpoints`, kind: 'service', reason: f.reason, at: f.at, active: true, object: ref, message: f.message, count: 1 }, owner));
    }
  }
  return out.filter(s => s.at != null && s.owner?.name);
}

const keyOf = (cluster, o) => `${cluster}|${o.kind}|${o.namespace ?? ''}|${o.name}`;
/** 같은 대상인지: 종류·namespace·이름이 같고, 둘 다 UID를 알면 UID도 같다(같은 이름으로 다시 만든 객체는 다른 대상) */
export const sameSubject = (a, b) => !!a && !!b && a.kind === b.kind && (a.namespace ?? '') === (b.namespace ?? '') && a.name === b.name && (!a.uid || !b.uid || a.uid === b.uid);
/* 안정 id: 같은 소유자(UID를 알면 UID까지)와 같은 첫 신호 분이면 같은 id(FNV-1a 64) */
export function stableId(text) {
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(text)) { h ^= BigInt(b); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return 'inc-' + h.toString(16).padStart(16, '0');
}
const worse = (a, b) => (a === 'critical' || b === 'critical' ? 'critical' : 'warning');

/**
 * One detection pass: attaches signals to the incidents they belong to and moves each incident along its lifecycle.
 *  cluster: context id; incidents: the stored incidents of that cluster; signals: signalsOf(); now (ms);
 *  ready(target, incident) -> true | false | null | 'gone': whether the target is healthy now (null: could not read: the window is a miss;
 *  'gone': the lists were read and the target is not there, or only a replacement with another UID is);
 *  nextNumber(): the next incident number (INC-0001 …), called only for a new incident;
 *  openNew: false when the owner lists (ReplicaSet, Deployment, Job …) could not be read: signals still join open incidents, none opens a new one;
 *  gone(incident) -> true when the lists were read and its target is not there (or only another UID is): it closes as a symptom recovery at once;
 *  blind(incident) -> true when a read behind its signals failed this pass: an open incident then stays open (a signal not read is not a quiet one).
 * A signal joins an incident of the same subject (sameSubject): a same-name replacement with another UID opens its own incident.
 * Returns { incidents (changed or new, whole records), opened: [id] }.
 */
export function detect({ cluster, incidents = [], signals = [], now, ready = () => null, nextNumber, openNew = true, blind = () => false, gone = () => false }) {
  const open = incidents.filter(i => i.phase !== 'resolved');
  /* 해결된 인시던트가 이미 가진 신호(같은 id, 그 마지막 신호까지)는 새 인시던트를 열지 않는다(같은 대상의 가장 최근 것) */
  const closed = incidents.filter(i => i.phase === 'resolved').sort((a, b) => b.resolvedAt - a.resolvedAt);
  const changed = new Map(), opened = [], current = inc => changed.get(inc.id) ?? inc;
  /* 이미 어느 인시던트가 가진 신호(같은 id)는 그 인시던트에 남는다(소유자가 지워져 사슬이 짧아져도). 지워진 객체(롤백으로 사라진 Pod)는 소유자를 다시
     찾을 수 없다: 그 객체의 신호를 이미 가진 인시던트의 대상에 붙인다 */
  /* 소유 사슬이 끊겨 Pod·ReplicaSet에 열렸던 인시던트는 지금 그 객체의 신호가 위 소유자로 이어지면 그 소유자로 올린다(같은 사건을 두 인시던트로 나누지 않음).
     이미 그 소유자의 열린 인시던트가 있으면 올리지 않는다 */
  for (const inc of open) {
    if (TOP.has(inc.target.kind)) continue;
    const up = signals.find(s => sameSubject(s.object, inc.target) && s.owner.kind !== inc.target.kind && TOP.has(s.owner.kind))?.owner;
    if (!up || open.some(o => o !== inc && sameSubject(current(o).target, up))) continue;
    changed.set(inc.id, { ...current(inc), target: { ...up }, key: keyOf(cluster, up), promotedFrom: { ...inc.target } });
  }
  const holders = [...open, ...closed];
  /* 같은 id의 신호라도(알림 fingerprint는 대체 뒤에도 같음) 지금 소유자가 같은 종류의 다른 UID면 그 인시던트를 잇지 않는다 */
  const replaced = (target, owner) => target.kind === owner.kind && !!target.uid && !!owner.uid && target.uid !== owner.uid;
  const subjectOf = s => holders.map(current).find(inc => inc.signals.some(x => x.id === s.id) && !replaced(inc.target, s.owner))?.target
    ?? (s.owner.kind === s.object.kind ? holders.map(current).find(inc => inc.signals.some(x => sameSubject(x.object, s.object)) && !replaced(inc.target, s.owner))?.target ?? s.owner : s.owner);
  const openFor = subject => { const all = open.map(current).filter(i => sameSubject(i.target, subject)); return all.find(i => i.target.uid && i.target.uid === subject.uid) ?? all[0] ?? null; };
  const recent = signals.filter(s => s.active || now - s.at < DETECT.lookback).sort((a, b) => a.at - b.at);
  for (const s of recent) {
    const subject = subjectOf(s);
    let inc = openFor(subject);
    if (inc && !s.active && s.at < inc.detectedAt - DETECT.gap) continue;
    if (!inc) {
      if (!openNew) continue; // the owner lists could not be read: a signal may be grouped under the wrong owner, so it opens nothing this pass
      const done = closed.find(i => sameSubject(i.target, subject));
      if (done && (s.at <= done.lastSignalAt || done.signals.some(x => x.id === s.id && x.at === s.at))) continue;
      if (!s.active && now - s.at > DETECT.gap) continue; // an old signal with nothing open does not open an incident afterwards
      const detectedAt = s.at, rule = s.rule ?? classify(s.reason, s.message)?.rule ?? 'alert', key = keyOf(cluster, subject);
      inc = { id: stableId([key, subject.uid, Math.floor(detectedAt / MIN)].filter(x => x != null && x !== '').join('|')), number: nextNumber(), cluster, key, target: { ...subject }, rule, reasons: {}, severity: s.severity,
        alert: s.alert ? { name: s.alert.name, source: 'Alertmanager' } : null, detectedAt, lastSignalAt: s.at, phase: 'open', mitigatedAt: null, resolvedAt: null, recovery: null,
        signals: [], verify: { windows: [], verifyFrom: null, lastWindowAt: null } };
      open.push(inc); opened.push(inc.id);
    }
    const had = inc.signals.find(x => x.id === s.id);
    const row = { id: s.id, kind: s.kind, reason: s.reason, at: s.at, end: s.end ?? null, active: s.active, object: s.object, alert: s.alert ?? null, message: s.message, count: s.count };
    if (had && JSON.stringify(had) === JSON.stringify(row)) { continue; }
    const signalsNext = had ? inc.signals.map(x => (x.id === s.id ? row : x)) : [...inc.signals, row].slice(-DETECT.maxSignals);
    const reasons = { ...inc.reasons, [s.reason]: (inc.reasons[s.reason] ?? 0) + (had ? 0 : 1) };
    inc = { ...inc, target: inc.target.uid || !subject.uid ? inc.target : { ...inc.target, uid: subject.uid }, signals: signalsNext, reasons, severity: worse(inc.severity, s.severity),
      lastSignalAt: Math.max(inc.lastSignalAt, s.at), detectedAt: Math.min(inc.detectedAt, s.at),
      alert: inc.alert ?? (s.alert ? { name: s.alert.name, source: 'Alertmanager' } : null), rule: better(inc.rule, s.rule ?? classify(s.reason, s.message)?.rule ?? 'alert') };
    changed.set(inc.id, inc);
  }
  for (const base of open) {
    const inc = current(base);
    const next = advance(inc, signals.filter(s => sameSubject(subjectOf(s), inc.target)), now, ready, blind, gone);
    if (next !== inc || changed.has(inc.id)) changed.set(inc.id, next);
  }
  return { incidents: [...changed.values()], opened };
}

/* 수명 한 걸음: 살아 있는 신호가 있으면 open, 없고 조용하면 mitigated(확인 구간을 30초마다 하나씩), 확인이 통과하면 resolved.
   대상이 지워졌거나 같은 이름의 다른 UID로 바뀌었으면(gone) 확인할 대상이 없다: 서비스 복구가 아니라 증상 회복(symptom)으로 닫고 subjectGone을 남긴다 */
function advance(inc, own, now, ready, blind = () => false, gone = () => false) {
  /* 목록을 읽어 대상이 없거나 다른 UID만 있으면(gone) 아직 최근인 신호와 무관하게 닫는다(지워진 객체의 이벤트는 몇 분 더 남음) */
  if (gone(inc)) return { ...inc, phase: 'resolved', mitigatedAt: inc.mitigatedAt ?? now, resolvedAt: now, recovery: 'symptom', subjectGone: now };
  const live = own.some(s => s.active && s.at >= inc.detectedAt - DETECT.gap);
  if (live || now - inc.lastSignalAt < DETECT.quiet || (inc.phase === 'open' && blind(inc))) {
    return inc.phase === 'open' ? inc : { ...inc, phase: 'open', mitigatedAt: null, verify: { windows: [], times: [], verifyFrom: null, lastWindowAt: null } };
  }
  const { cadence } = VERIFY_DEFAULT;
  let v = inc.verify;
  if (inc.phase === 'open') v = { windows: [], times: [], verifyFrom: now, lastWindowAt: now };
  /* 읽은 시각이 없는 옛 연속 구간은 실제 길이를 알 수 없어 믿지 않는다: 다시 시작 */
  else if (v.windows?.length && (v.times ?? []).length !== v.windows.length) v = { ...v, windows: [], times: [] };
  /* 한 번 읽을 때 구간 하나. 읽지 못하고 지나간 구간(앱이 꺼져 있던 동안)만 miss로 채운다: 읽기 간격의 흔들림은 miss가 아니다 */
  const elapsed = now - v.lastWindowAt;
  if (elapsed >= 0.8 * cadence) {
    const r = ready(inc.target, inc), skipped = Math.max(0, Math.round(elapsed / cadence) - 1);
    if (r === 'gone') return { ...inc, phase: 'resolved', mitigatedAt: inc.mitigatedAt ?? v.verifyFrom, resolvedAt: now, recovery: 'symptom', subjectGone: now, verify: { ...v, lastWindowAt: now } };
    /* 판정은 끝의 연속 구간만 읽으므로 최근 구간만 둔다(한도만큼의 연속 누락, 필요한 만큼의 연속 정상). 구간마다 실제 읽은 시각을 함께 둔다(times) */
    const keep = -2 * VERIFY_DEFAULT.max / cadence, last = v.lastWindowAt;
    const windows = [...v.windows, ...Array(skipped).fill('miss'), r === null ? 'miss' : r ? 'ok' : 'bad'].slice(keep);
    const times = [...(v.times ?? []), ...Array.from({ length: skipped }, (_, i) => last + (i + 1) * cadence), now].slice(keep);
    v = { ...v, windows, times, lastWindowAt: now };
  }
  const verdict = verifyVerdict({ verifyFrom: v.verifyFrom, now, windows: v.windows, times: v.times });
  const mitigated = { ...inc, phase: 'mitigated', mitigatedAt: inc.mitigatedAt ?? v.verifyFrom, verify: v };
  if (verdict.state === 'pass') return { ...mitigated, phase: 'resolved', resolvedAt: now, recovery: 'service' };
  if (verdict.state === 'fail' || verdict.state === 'inconclusive') return { ...mitigated, verify: { windows: [], times: [], verifyFrom: now, lastWindowAt: now } };
  return inc.phase === 'mitigated' && v === inc.verify ? inc : mitigated;
}
