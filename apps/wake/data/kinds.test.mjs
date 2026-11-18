/* 리소스 종류 표(kinds.js): 상태 판정, 분수 없는 개수, 요약 수, 관계, YAML */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { podStatus, rowOf, summaryOf, podMembership, toYaml, KIND_LIST, st, age, timestampState } from './kinds.js';
const podsOf = (kind, row, pods) => podMembership(kind, row, pods).items;

const pod = (name, status, extra = {}) => ({ metadata: { name, namespace: 'a', creationTimestamp: new Date().toISOString(), labels: { app: 'x' }, ownerReferences: [{ kind: 'ReplicaSet', name: 'web-5d' }], ...extra.meta }, spec: { containers: [{ name: 'c', image: 'i:1' }], nodeName: 'n1' }, status });
test('Pod 상태는 kubectl과 같은 판정, 진행 중인 상태만 점', () => {
  assert.deepEqual(podStatus(pod('a', { phase: 'Running', containerStatuses: [{ name: 'c', ready: true, state: { running: {} } }] })), ['ok', 'Running']);
  assert.deepEqual(podStatus(pod('b', { phase: 'Running', containerStatuses: [{ name: 'c', ready: false, state: { waiting: { reason: 'CrashLoopBackOff' } } }] })), ['danger', 'CrashLoopBackOff', false]);
  assert.deepEqual(podStatus(pod('c', { phase: 'Pending' })), ['warn', 'Pending', true]);
  assert.deepEqual(podStatus(pod('d', { phase: 'Running' }, { meta: { deletionTimestamp: 'x' } })), ['warn', 'Terminating', true]);
  assert.deepEqual(podStatus(pod('e', { phase: 'Succeeded', containerStatuses: [{ name: 'c', state: { terminated: { reason: 'Completed', exitCode: 0 } } }] })), ['neutral', 'Completed', false]);
  assert.deepEqual(st('ok', 'Synced'), ['ok', 'Synced']);
});
test('started init sidecars count toward readiness without making a running Pod initialize', () => {
  const resource = pod('sidecar', {
    phase: 'Running',
    conditions: [{ type: 'Initialized', status: 'True' }, { type: 'Ready', status: 'True' }],
    initContainerStatuses: [
      { name: 'writer', started: true, ready: true, restartCount: 1, state: { running: {} } },
      { name: 'install', ready: true, state: { terminated: { exitCode: 0 } } },
    ],
    containerStatuses: [{ name: 'c', ready: true, state: { running: {} } }],
  });
  resource.spec.initContainers = [{ name: 'writer', image: 'writer:1', restartPolicy: 'Always' }, { name: 'install' }];
  const row = rowOf('pods', resource);
  assert.deepEqual(row.status, ['ok', 'Running']);
  assert.deepEqual([row.ready, row.containers, row.restarts], [2, 2, 1]);
  assert.deepEqual(row.containerList.map(item => item.name), ['c', 'writer']);
  assert.equal(summaryOf({ pods: [resource] }).pods.problems, 0);
  resource.status.initContainerStatuses[0] = { name: 'writer', started: false, ready: false, state: { waiting: { reason: 'CrashLoopBackOff' } } };
  resource.status.conditions[1].status = 'False';
  assert.equal(podStatus(resource)[0], 'warn');
  resource.status.phase = 'Pending';
  resource.status.conditions[0].status = 'False';
  assert.equal(podStatus(resource)[1], 'Init:CrashLoopBackOff');
});

test('container state keeps current failures separate from completed containers and past exits', () => {
  const stateOf = (state, lastState) => rowOf('pods', pod('checkout', {
    containerStatuses: [{ name: 'c', state, lastState, ready: Boolean(state.running) }],
  })).containerList[0].status;
  assert.deepEqual(stateOf({ waiting: { reason: 'CrashLoopBackOff' } }), ['danger', 'CrashLoopBackOff', false]);
  assert.deepEqual(stateOf({ terminated: { reason: 'Error', exitCode: 17 } }), ['danger', 'Error', false]);
  assert.deepEqual(stateOf({ terminated: { exitCode: 0 } }), ['ok', 'Completed']);
  assert.deepEqual(stateOf({ running: {} }, { terminated: { reason: 'Error', exitCode: 17 } }), ['ok', 'Running']);
});

test('준비 개수는 분수가 아니라 따로(Ready·Containers, Ready·Desired)', () => {
  const r = rowOf('pods', pod('a', { phase: 'Running', containerStatuses: [{ name: 'c', ready: true, restartCount: 2, lastState: { terminated: { reason: 'OOMKilled' } }, state: { running: {} } }] }));
  assert.equal(r.ready, 1); assert.equal(r.containers, 1); assert.equal(r.restarts, 2); assert.equal(r.lastExit, 'OOMKilled');
  const d = rowOf('deployments', { metadata: { name: 'web' }, spec: { replicas: 3 }, status: { readyReplicas: 2, availableReplicas: 2, updatedReplicas: 3 } });
  assert.equal(d.ready, 2); assert.equal(d.desired, 3); assert.deepEqual(d.status, ['warn', 'Progressing', true]);
  for (const k of KIND_LIST) for (const c of k.columns || []) assert.ok(!/\//.test(c.label) || c.label === 'Port(s)', `${k.plural}.${c.id}`);
});
test('홈 요약 수: Pod 총수와 문제 Pod, NotReady Node, 최근 경고', () => {
  const pods = [pod('a', { phase: 'Running', containerStatuses: [{ name: 'c', ready: true, state: { running: {} } }] }), pod('b', { phase: 'Running', containerStatuses: [{ name: 'c', state: { waiting: { reason: 'CrashLoopBackOff' } } }] }), pod('c', { phase: 'Pending' }), pod('d', { phase: 'Failed', reason: 'Evicted' })];
  const nodes = [{ metadata: { name: 'n1' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }, { metadata: { name: 'n2' }, status: { conditions: [{ type: 'Ready', status: 'False' }] } }];
  const events = [{ type: 'Warning', lastTimestamp: new Date().toISOString() }, { type: 'Warning', lastTimestamp: '2020-01-01T00:00:00Z' }, { type: 'Normal', lastTimestamp: new Date().toISOString() }];
  const s = summaryOf({ pods, nodes, events });
  assert.deepEqual(s.pods, { total: 4, problems: 3 }); assert.deepEqual(s.nodes, { total: 2, notReady: 1 }); assert.equal(s.warnings, 1);
});
test('관계: Deployment·Service·Node의 Pod', () => {
  const rows = [rowOf('pods', pod('web-5d-x', { phase: 'Running' })), rowOf('pods', pod('db-0', { phase: 'Running' }, { meta: { labels: { app: 'db' }, ownerReferences: [{ kind: 'StatefulSet', name: 'db' }] } }))];
  assert.deepEqual(podsOf('deployments', { name: 'web' }, rows), []);
  assert.deepEqual(podsOf('statefulsets', { name: 'db' }, rows), []);
  assert.deepEqual(podsOf('services', { selector: { app: 'x' } }, rows).map(p => p.name), ['web-5d-x']);
  assert.equal(podsOf('nodes', { name: 'n1' }, rows).length, 2);
});
test('YAML: managedFields 숨김, 특수 값은 따옴표', () => {
  const y = toYaml({ apiVersion: 'v1', kind: 'Pod', metadata: { name: 'a', managedFields: [{ x: 1 }], labels: { 'app.kubernetes.io/name': 'yes' } }, spec: { containers: [{ name: 'c', ports: [{ containerPort: 80 }] }] } });
  assert.doesNotMatch(y, /managedFields/); assert.match(y, /app\.kubernetes\.io\/name: "yes"/); assert.match(y, /- name: c/); assert.match(y, /containerPort: 80/);
  assert.match(toYaml({ metadata: { managedFields: [{ a: 1 }] } }, { managedFields: true }), /managedFields/);
  assert.equal(toYaml({ c: [{ n: 'a', r: { q: { cpu: '1' } } }] }), 'c:\n- n: a\n  r:\n    q:\n      cpu: "1"');
});

test('목록 제목은 원문 복수형', async () => {
  const { titleOf } = await import('./kinds.js');
  assert.equal(titleOf('ingresses'), 'Ingresses'); assert.equal(titleOf('events'), 'Events'); assert.equal(titleOf('pods'), 'Pods'); assert.equal(titleOf('nope'), 'nope');
});

test('observation boundaries exclude future, invalid and exactly one-hour-old events (#35)', () => {
  const now = Date.parse('2026-11-02T01:15:00Z');
  const cases = [[now, 1], [now - 3599999, 1], [now - 3600000, 0], [now + 1, 0], ['invalid', 0], [undefined, 0]];
  for (const [at, count] of cases) {
    const timestamp = typeof at === 'number' ? new Date(at).toISOString() : at;
    assert.equal(summaryOf({ events: [{ type: 'Warning', lastTimestamp: timestamp }] }, now).warnings, count);
  }
});


test('age preserves missing, invalid and future timestamp states without zero age (#35)', () => {
  const now = Date.parse('2026-11-02T01:15:00Z');
  for (const [at, state] of [[undefined, 'missing'], ['invalid', 'invalid'], ['2026-11-02T01:15:01Z', 'future']]) {
    assert.equal(age(at, now), 'Unknown');
    assert.equal(timestampState(at, now), state);
  }
  assert.equal(age('2026-11-02T01:15:00Z', now), '0s');
  assert.equal(timestampState('2026-11-02T01:15:00Z', NaN), 'invalid-reference');
});

/* A2-08: Age는 kubectl get의 HumanDuration과 같은 글(내림, 두 단위 구간): 2d15h를 "3d"로 올려 읽지 않는다 */
test('age_reads_like_kubectl_truncating_with_two_units_where_kubectl_shows_them', () => {
  const now = Date.parse('2026-11-18T12:00:00Z'), ago = s => new Date(now - s * 1000).toISOString();
  const H = 3600, D = 86400;
  for (const [s, want] of [[59, '59s'], [119, '119s'], [150, '2m30s'], [180, '3m'], [599, '9m59s'], [1799, '29m'], [3 * H - 1, '179m'], [3 * H, '3h'], [5 * H + 40 * 60, '5h40m'], [8 * H + 59 * 60, '8h'], [47 * H + 59 * 60, '47h'],
    [2 * D + 15 * H, '2d15h'], [3 * D, '3d'], [7 * D + 23 * H, '7d23h'], [8 * D + 23 * H, '8d'], [400 * D, '400d'], [731 * D, '2y1d'], [9 * 365 * D, '9y']])
    assert.equal(age(ago(s), now), want, `${s}s`);
});

function ownershipRows(plural = 'statefulsets', kind = 'StatefulSet', apiVersion = 'apps/v1') {
  const parent = rowOf(plural, { apiVersion, kind, metadata: { name: 'same', namespace: 'team', uid: 'parent-a' }, spec: {}, status: {} });
  const child = (name, overrides = {}) => rowOf('pods', { apiVersion: 'v1', kind: 'Pod', metadata: { name, namespace: 'team', uid: name + '-uid', ownerReferences: [{ apiVersion, kind, name: 'same', uid: 'parent-a', controller: true }], ...overrides }, spec: { nodeName: 'node' }, status: { phase: 'Running' } });
  return { parent, child };
}
test('owner_pod_metadata_preserves_source_uid_api_and_all_reference_fields', () => {
  const { parent, child } = ownershipRows(), row = child('good');
  assert.equal(parent.uid, 'parent-a');assert.equal(parent.apiVersion, 'apps/v1');assert.equal(parent.kind, 'StatefulSet');
  assert.deepEqual(row.owner, { apiVersion: 'apps/v1', kind: 'StatefulSet', name: 'same', uid: 'parent-a', controller: true });assert.deepEqual(row.ownerReferences, [row.owner]);
});
test('owner_pod_never_promotes_a_Deployment_prefix_to_owner_or_matches_a_wrong_parent_identity', () => {
  const { parent, child } = ownershipRows(), wrong = [child('wrong-uid', { ownerReferences: [{ apiVersion: 'apps/v1', kind: 'StatefulSet', name: 'same', uid: 'parent-b' }] }), child('wrong-ns', { namespace: 'other' }), child('wrong-kind', { ownerReferences: [{ apiVersion: 'apps/v1', kind: 'DaemonSet', name: 'same', uid: 'parent-a' }] }), child('missing-uid', { ownerReferences: [{ apiVersion: 'apps/v1', kind: 'StatefulSet', name: 'same' }] })];
  assert.deepEqual(podsOf('statefulsets', parent, wrong), []);
  assert.deepEqual(podsOf('deployments', { name: 'same', ns: 'team', uid: 'parent-a', kind: 'Deployment', apiVersion: 'apps/v1' }, [child('prefix', { ownerReferences: [{ apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'same-abc', uid: 'rs-a' }] })]), []);
});
for (const [plural, kind, api] of [['statefulsets','StatefulSet','apps/v1'],['daemonsets','DaemonSet','apps/v1'],['jobs','Job','batch/v1']]) test('owner_pod_exact_parent_' + plural, () => {
  const { parent, child } = ownershipRows(plural, kind, api), good = child('good'), wrong = child('old', { ownerReferences: [{ apiVersion: api, kind, name: 'same', uid: 'old-parent' }] });
  assert.deepEqual(podsOf(plural, parent, [wrong, good]), [good]);
});

test('owner_pod_coverage_distinguishes_incomplete_unsupported_and_proven_empty', () => {
  const { parent, child } = ownershipRows();
  assert.equal(podMembership('statefulsets', { ...parent, uid: null }, []).coverage, 'unknown');
  const incomplete = podMembership('statefulsets', parent, [child('unknown', { ownerReferences: [{ apiVersion: 'apps/v1', kind: 'StatefulSet', name: 'same' }] })]);assert.equal(incomplete.coverage, 'unknown');assert.deepEqual(incomplete.items, []);
  assert.deepEqual(podMembership('statefulsets', parent, []).items, []);assert.equal(podMembership('statefulsets', parent, []).coverage, 'complete');
  const deployment = ownershipRows('deployments','Deployment');assert.equal(podMembership('deployments', deployment.parent, []).coverage, 'unsupported');
});
test('owner_pod_full_references_keep_partial_verified_members_and_reject_raw_projection_conflicts', () => {
  const { parent, child } = ownershipRows(), good = child('good', { ownerReferences: [{ apiVersion: 'apps/v1', kind: 'Job', name: 'other', uid: 'other' }, { apiVersion: 'apps/v1', kind: 'StatefulSet', name: 'same', uid: 'parent-a', controller: true }] });
  assert.deepEqual(podsOf('statefulsets',parent,[good]),[good]);
  const incomplete=child('unknown',{ownerReferences:[{kind:'StatefulSet',name:'same'}]});const partial=podMembership('statefulsets',parent,[good,incomplete]);assert.equal(partial.coverage,'unknown');assert.deepEqual(partial.items,[good]);
  const aliased={...good,name:'wrong-target',raw:{apiVersion:'v1',kind:'Pod',metadata:{name:'good',namespace:'team',uid:'good-uid',ownerReferences:good.ownerReferences}}};assert.deepEqual(podsOf('statefulsets',parent,[aliased]),[]);assert.equal(podMembership('statefulsets',parent,[aliased]).coverage,'unknown');
});

for (const mode of ['false','missing','multiple','invalid-flag','malformed-other','other-controller']) test('owner_controller_' + mode + '_never_promotes_a_general_owner_reference',()=>{
  const {parent,child}=ownershipRows(),exact={apiVersion:'apps/v1',kind:'StatefulSet',name:'same',uid:'parent-a',controller:true};let refs;
  if(mode==='false')refs=[{...exact,controller:false}];
  if(mode==='missing'){const ref={...exact};delete ref.controller;refs=[ref];}
  if(mode==='multiple')refs=[exact,{...exact,uid:'other',name:'other'}];
  if(mode==='invalid-flag')refs=[{...exact,controller:'true'}];
  if(mode==='malformed-other')refs=[exact,{kind:'Job',name:'unknown',controller:false}];
  if(mode==='other-controller')refs=[{...exact,controller:false},{...exact,uid:'other-controller'}];
  const pod=child('candidate',{ownerReferences:refs}),before=structuredClone(pod);const relation=podMembership('statefulsets',parent,[pod]);assert.deepEqual(relation.items,[]);assert.equal(relation.coverage,'unknown');assert.deepEqual(pod,before);assert.deepEqual(pod.ownerReferences,refs);
});

test('Deployment membership follows both controller UIDs and excludes a reused ReplicaSet name', () => {
  const { parent, child } = ownershipRows('deployments', 'Deployment');
  const set = {
    apiVersion: 'apps/v1', kind: 'ReplicaSet',
    metadata: { namespace: 'team', name: 'same-abc', uid: 'rs-current', ownerReferences: [{ apiVersion: 'apps/v1', kind: 'Deployment', name: parent.name, uid: parent.uid, controller: true }] },
  };
  const reference = { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: set.metadata.name, uid: set.metadata.uid, controller: true };
  const verified = child('verified', { ownerReferences: [reference] });
  const old = child('previous', { ownerReferences: [{ ...reference, uid: 'rs-replaced' }] });
  const result = podMembership('deployments', parent, [old, verified], { items: [set], partial: true });
  assert.deepEqual(result.items, [verified]);
  assert.equal(result.coverage, 'unknown');
  assert.deepEqual(podMembership('deployments', { ...parent, uid: 'different-deployment' }, [verified], { items: [set], partial: false }).items, []);
});

const brief = status => status.slice(0, 2);
const raw = (kind, apiVersion, extra) => ({ kind, apiVersion, metadata: { name: 'x', namespace: 'demo-shop', uid: 'u1', creationTimestamp: '2026-11-01T00:00:00Z' }, ...extra });
test('ReplicaSet: 0 준비는 관측된 status에서만 0, 소유자와 revision은 실제 필드', () => {
  const rs = raw('ReplicaSet', 'apps/v1', { spec: { replicas: 2 }, status: { replicas: 2, readyReplicas: 2, availableReplicas: 2 } });
  rs.metadata.ownerReferences = [{ kind: 'Deployment', name: 'checkout', controller: true }]; rs.metadata.annotations = { 'deployment.kubernetes.io/revision': '3' };
  const row = rowOf('replicasets', rs);
  assert.deepEqual([brief(row.status), row.owner, row.revision, row.available], [['ok', 'Available'], 'Deployment/checkout', '3', 2]);
  assert.equal(rowOf('replicasets', raw('ReplicaSet', 'apps/v1', { spec: { replicas: 2 }, status: { replicas: 2 } })).ready, 0);
  assert.deepEqual(brief(rowOf('replicasets', raw('ReplicaSet', 'apps/v1', { spec: { replicas: 2 }, status: { replicas: 2 } })).status), ['danger', 'Unavailable']);
  const none = rowOf('replicasets', raw('ReplicaSet', 'apps/v1', {}));
  assert.deepEqual([none.desired, none.ready, none.owner, none.revision, none.status[1]], [null, null, '', '', 'Unknown']);
  assert.equal(rowOf('replicasets', raw('ReplicaSet', 'apps/v1', { spec: { replicas: 0 }, status: { replicas: 0 } })).desired, 0);
});
test('CronJob: 중지·실행 중·마지막 시각은 실제 필드만, 성공 기록 없음은 성공이 아님', () => {
  const now = Date.parse('2026-11-01T01:00:00Z');
  const row = rowOf('cronjobs', raw('CronJob', 'batch/v1', { spec: { schedule: '*/5 * * * *', suspend: false }, status: { lastScheduleTime: '2026-11-01T00:55:00Z' } }), now);
  assert.deepEqual([brief(row.status), row.suspend, row.active, row.lastSchedule, row.lastSuccess], [['ok', 'Scheduled'], false, 0, '5m', '']);
  assert.deepEqual(brief(rowOf('cronjobs', raw('CronJob', 'batch/v1', { spec: { schedule: '* * * * *', suspend: true } }), now).status), ['neutral', 'Suspended']);
  assert.equal(rowOf('cronjobs', raw('CronJob', 'batch/v1', { spec: { schedule: '* * * * *' }, status: { active: [{ name: 'j-1' }] } }), now).activeJobs, 'j-1');
  assert.deepEqual(brief(rowOf('cronjobs', raw('CronJob', 'batch/v1', { spec: { schedule: '* * * * *' } }), now).status), ['neutral', 'Never scheduled']);
  assert.equal(rowOf('cronjobs', raw('CronJob', 'batch/v1', { spec: { schedule: '* * * * *' } }), now).suspend, null);
});
test('HPA: 지표 현재 값은 status에 있을 때만, 없으면 unknown, 조건으로 상태 판정', () => {
  const spec = { minReplicas: 1, maxReplicas: 4, scaleTargetRef: { kind: 'Deployment', name: 'storefront' }, metrics: [{ type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 80 } } }] };
  const ok = rowOf('horizontalpodautoscalers', raw('HorizontalPodAutoscaler', 'autoscaling/v2', { spec, status: { currentReplicas: 2, desiredReplicas: 2, currentMetrics: [{ type: 'Resource', resource: { name: 'cpu', current: { averageUtilization: 0 } } }],
    conditions: [{ type: 'AbleToScale', status: 'True' }, { type: 'ScalingActive', status: 'True' }] } }));
  assert.deepEqual([brief(ok.status), ok.targets, ok.min, ok.max, ok.current, ok.reference], [['ok', 'Active'], 'cpu: 0%/80%', 1, 4, 2, 'Deployment/storefront']);
  const bad = rowOf('horizontalpodautoscalers', raw('HorizontalPodAutoscaler', 'autoscaling/v2', { spec, status: { conditions: [{ type: 'AbleToScale', status: 'True' }, { type: 'ScalingActive', status: 'False', reason: 'FailedGetResourceMetric' }] } }));
  assert.deepEqual([brief(bad.status), bad.targets, bad.current], [['danger', 'Not active'], 'cpu: unknown/80%', null]);
  assert.deepEqual(brief(rowOf('horizontalpodautoscalers', raw('HorizontalPodAutoscaler', 'autoscaling/v2', { spec })).status), ['neutral', 'Unknown']);
});
test('PVC: 단계는 status.phase, 요청 용량과 바인딩 용량 분리(사용량 아님)', () => {
  const pvc = rowOf('persistentvolumeclaims', raw('PersistentVolumeClaim', 'v1', { spec: { storageClassName: 'standard', volumeName: 'pv-1', resources: { requests: { storage: '1Gi' } } }, status: { phase: 'Bound', capacity: { storage: '2Gi' }, accessModes: ['ReadWriteOnce'] } }));
  assert.deepEqual([brief(pvc.status), pvc.requested, pvc.capacity, pvc.volume, pvc.class, pvc.accessModes], [['ok', 'Bound'], '1Gi', '2Gi', 'pv-1', 'standard', 'ReadWriteOnce']);
  assert.deepEqual(brief(rowOf('persistentvolumeclaims', raw('PersistentVolumeClaim', 'v1', { status: { phase: 'Pending' } })).status), ['warn', 'Pending']);
  assert.deepEqual(brief(rowOf('persistentvolumeclaims', raw('PersistentVolumeClaim', 'v1', {})).status), ['neutral', 'Unknown']);
  assert.equal(rowOf('persistentvolumeclaims', raw('PersistentVolumeClaim', 'v1', { status: { phase: 'Pending' } })).capacity, '');
});

test('hpa_at_min_replicas_is_normal_but_capped_at_max_is_limited', () => {
  const hpa = reason => rowOf('horizontalpodautoscalers', { metadata: { name: 'web', namespace: 'team', uid: 'h' }, spec: { minReplicas: 2, maxReplicas: 5, scaleTargetRef: { kind: 'Deployment', name: 'web' } },
    status: { currentReplicas: reason === 'TooManyReplicas' ? 5 : 2, conditions: [{ type: 'AbleToScale', status: 'True' }, { type: 'ScalingActive', status: 'True' }, { type: 'ScalingLimited', status: 'True', reason }] } });
  assert.deepEqual(hpa('TooFewReplicas').status, ['ok', 'Active']);
  assert.equal(hpa('TooManyReplicas').status[0], 'warn');
  assert.equal(hpa('TooManyReplicas').status[1], 'Limited');
});
