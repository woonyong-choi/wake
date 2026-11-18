/* 범위 검색 상자의 관계(SCR-SEARCH-SCOPE, H-009): 리소스 종류와 namespace 하나의 범위가 각 화면의 행과 어떻게 맞는지. 이 파일 안의 합성 행만 쓴다 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { scopeRelation, scopeText, alertInScope, scopeCounts } from './scope.js';

const ref = (kind, name, uid, controller = true) => ({ apiVersion: kind === 'ReplicaSet' || kind === 'Deployment' ? 'apps/v1' : 'v1', kind, name, uid, controller });
const row = (kind, ns, name, uid, owner) => ({ kind, ns, name, uid, ownerReferences: owner ? [owner] : [], owner: owner ?? null, labels: {} });
const DEPLOY = [row('Deployment', 'payments', 'payments-api', 'd1'), row('Deployment', 'payments', 'ledger', 'd2'), row('Deployment', 'shop', 'payments-api', 'd3')];
const RS = [row('ReplicaSet', 'payments', 'payments-api-7c9f6', 'r1', ref('Deployment', 'payments-api', 'd1')), row('ReplicaSet', 'payments', 'ledger-5d4b8', 'r2', ref('Deployment', 'ledger', 'd2')),
  row('ReplicaSet', 'shop', 'payments-api-11aa2', 'r3', ref('Deployment', 'payments-api', 'd3'))];
const PODS = [{ ...row('Pod', 'payments', 'payments-api-7c9f6-x2k4', 'p1', ref('ReplicaSet', 'payments-api-7c9f6', 'r1')), labels: { app: 'payments-api' }, node: 'n1' },
  { ...row('Pod', 'payments', 'ledger-5d4b8-q8m1', 'p2', ref('ReplicaSet', 'ledger-5d4b8', 'r2')), labels: { app: 'ledger' }, node: 'n2' },
  { ...row('Pod', 'shop', 'payments-api-11aa2-a1b2', 'p3', ref('ReplicaSet', 'payments-api-11aa2', 'r3')), labels: { app: 'payments-api' }, node: 'n1' }];

test('scope_deployment_owns_its_replicasets_and_pods_through_owner_references', () => {
  const r = scopeRelation({ kinds: ['deployments'], ns: ['payments'] }, { objects: { deployments: DEPLOY }, pods: PODS, replicasets: RS });
  /* the events tab's involved objects: the Deployment, its ReplicaSet and its Pod are in; the other Deployment's Pod and the same name in another namespace are not */
  assert.equal(r.has('Deployment', 'payments', 'payments-api'), true);
  assert.equal(r.has('ReplicaSet', 'payments', 'payments-api-7c9f6'), true);
  assert.equal(r.has('Pod', 'payments', 'payments-api-7c9f6-x2k4'), true);
  assert.equal(r.has('Pod', 'payments', 'ledger-5d4b8-q8m1'), true, 'ledger is a Deployment in payments too');
  assert.equal(r.has('Pod', 'shop', 'payments-api-11aa2-a1b2'), false, 'outside the namespaces');
  assert.equal(r.has('Service', 'payments', 'payments-api'), false, 'a Service is not owned by a Deployment');
  assert.deepEqual(r.pods.map(p => p.name), ['payments-api-7c9f6-x2k4', 'ledger-5d4b8-q8m1']);
});

test('scope_owned_children_follow_the_owner_reference_not_a_name_prefix', () => {
  /* a Pod named like the Deployment but owned by a ReplicaSet of another Deployment is not its child */
  const stray = { ...row('Pod', 'payments', 'payments-api-zz', 'p9', ref('ReplicaSet', 'ledger-5d4b8', 'r2')), labels: {} };
  const r = scopeRelation({ kinds: ['deployments'], ns: ['payments'] }, { objects: { deployments: [DEPLOY[0]] }, pods: [...PODS, stray], replicasets: RS });
  assert.equal(r.has('Pod', 'payments', 'payments-api-zz'), false);
  assert.equal(r.has('Pod', 'payments', 'payments-api-7c9f6-x2k4'), true);
});

test('scope_service_reaches_its_pods_by_selector_and_a_pod_scope_reaches_its_workload_for_gitops', () => {
  const svc = { ...row('Service', 'payments', 'payments-api', 's1'), selector: { app: 'payments-api' } };
  const r = scopeRelation({ kinds: ['services'], ns: null }, { objects: { services: [svc] }, pods: PODS, replicasets: RS });
  assert.deepEqual(r.pods.map(p => p.name), ['payments-api-7c9f6-x2k4'], 'a selector reaches the Pods of its own namespace only');
  const p = scopeRelation({ kinds: ['pods'], ns: ['payments'] }, { objects: { pods: PODS }, pods: PODS, replicasets: RS });
  assert.equal(p.touches('Deployment', 'payments', 'payments-api'), true, 'an Application that manages the Pod\'s Deployment is in');
  assert.equal(p.has('Deployment', 'payments', 'payments-api'), false, 'but the Deployment\'s own events are not a Pod\'s');
});

test('scope_namespace_only_and_empty_scope', () => {
  const none = scopeRelation({ kinds: null, ns: null }, {});
  assert.equal(none.on, false); assert.equal(none.has('Pod', 'x', 'y'), true);
  const ns = scopeRelation({ kinds: null, ns: ['payments'] }, {});
  assert.equal(ns.on, true); assert.equal(ns.has('Pod', 'payments', 'a'), true); assert.equal(ns.has('Pod', 'shop', 'a'), false);
  assert.equal(ns.has('Node', '', 'n1'), true, 'a cluster-scoped object stays in a namespace scope');
});

test('scope_alerts_without_a_namespace_label_always_show', () => {
  const r = scopeRelation({ kinds: ['deployments'], ns: ['payments'] }, { objects: { deployments: DEPLOY }, pods: PODS, replicasets: RS });
  assert.equal(alertInScope(r, { alertname: 'NodeDown', instance: 'n1' }), true);
  assert.equal(alertInScope(r, { alertname: 'KubePodCrashLooping', namespace: 'payments', pod: 'payments-api-7c9f6-x2k4' }), true);
  assert.equal(alertInScope(r, { alertname: 'KubePodCrashLooping', namespace: 'shop', pod: 'payments-api-11aa2-a1b2' }), false);
  assert.equal(alertInScope(r, { alertname: 'KubeQuotaAlmostFull', namespace: 'payments' }), false, 'a kind is picked: a namespace-only alert names no object of it');
});

test('scope_alert_uses_the_object_the_alert_is_about_not_the_exporter_labels', () => {
  /* R5-01: kube-state-metrics 알림의 pod 라벨은 exporter Pod: 종류를 고른 범위가 그것으로 맞추지 않는다. exported_namespace가 객체의 namespace */
  const r = scopeRelation({ kinds: ['deployments'], ns: ['payments'] }, { objects: { deployments: DEPLOY }, pods: PODS, replicasets: RS });
  const ksm = { job: 'kube-state-metrics', service: 'kps-kube-state-metrics', container: 'kube-state-metrics' };
  assert.equal(alertInScope(r, { alertname: 'KubeDeploymentReplicasMismatch', ...ksm, namespace: 'payments', deployment: 'payments-api', pod: 'kps-kube-state-metrics-654bf57f64-rhlqp' }), true);
  assert.equal(alertInScope(r, { alertname: 'KubePodCrashLooping', namespace: 'monitoring', exported_namespace: 'payments', exported_pod: 'payments-api-7c9f6-x2k4', pod: 'kps-kube-state-metrics-654bf57f64-rhlqp', ...ksm }), true);
  const ns = scopeRelation({ kinds: null, ns: ['monitoring'] }, {});
  assert.equal(alertInScope(ns, { alertname: 'KubePodCrashLooping', namespace: 'monitoring', exported_namespace: 'payments', exported_pod: 'payments-api-7c9f6-x2k4', ...ksm }), false, 'the exporter namespace is not the alert namespace');
});

test('scope_text_is_kept_per_section', () => {
  const store = { kinds: ['deployments'], ns: ['payments'], q: { home: 'api', logs: 'timeout' } };
  assert.equal(scopeText(store, 'home'), 'api'); assert.equal(scopeText(store, 'logs'), 'timeout'); assert.equal(scopeText(store, 'events'), '');
});

test('scope_two_kinds_are_the_union_of_what_each_one_reaches', () => {
  /* a Deployment and a Service picked together: the Deployment's ReplicaSet and Pods and the Service itself are all in; nothing that neither reaches */
  const svc = { ...row('Service', 'payments', 'checkout', 's1'), selector: { app: 'nobody' } };
  const r = scopeRelation({ kinds: ['deployments', 'services'], ns: ['payments'] }, { objects: { deployments: [DEPLOY[0]], services: [svc] }, pods: PODS, replicasets: RS });
  assert.deepEqual(r.kinds, ['deployments', 'services']);
  assert.equal(r.has('Deployment', 'payments', 'payments-api'), true);
  assert.equal(r.has('Pod', 'payments', 'payments-api-7c9f6-x2k4'), true, 'the Deployment\'s Pod');
  assert.equal(r.has('Service', 'payments', 'checkout'), true, 'the Service');
  assert.equal(r.has('Pod', 'payments', 'ledger-5d4b8-q8m1'), false, 'ledger is not picked and the Service selects nothing');
  assert.deepEqual(r.pods.map(p => p.name), ['payments-api-7c9f6-x2k4']);
  assert.equal(r.pod(PODS[0]), true); assert.equal(r.pod(PODS[1]), false);
  assert.equal(scopeRelation({ kinds: [], ns: null }, {}).on, false, 'nothing chosen is no filter');
});

test('scope_picker_counts_are_object_counts_of_the_other_picker', () => {
  /* the kinds read once (count and count per namespace): a kind counts its objects in the chosen namespaces, a namespace counts the objects of the chosen kinds (every readable kind when none) */
  const kinds = [{ plural: 'deployments', count: 3, readStatus: 'ok', byNs: { payments: 2, shop: 1 } }, { plural: 'pods', count: 5, readStatus: 'ok', byNs: { payments: 3, shop: 2 } },
    { plural: 'nodes', cluster: true, count: 2, readStatus: 'ok', byNs: {} }, { plural: 'secrets', readStatus: 'forbidden' }];
  const all = scopeCounts(kinds, { kinds: null, ns: null });
  assert.deepEqual(all.kind, { deployments: 3, pods: 5, nodes: 2, secrets: null }, 'no namespace chosen: every object; an unreadable kind has no count');
  assert.deepEqual(all.ns, { payments: 5, shop: 3 }, 'no kind chosen: every readable kind in the namespace');
  const scoped = scopeCounts(kinds, { kinds: ['deployments'], ns: ['payments'] });
  assert.deepEqual(scoped.kind, { deployments: 2, pods: 3, nodes: 2, secrets: null }, 'in payments; a cluster-scoped kind keeps its count');
  assert.deepEqual(scoped.ns, { payments: 2, shop: 1 }, 'Deployments only');
});

/* R4-06: the namespace menu said payments · 19 while the list of every kind in payments counted 21: the list holds the Nodes payments Pods run on (A3-13)
   and the menu left the cluster-scoped kinds out. One population: a namespace counts those Nodes too (namesByNs), and only when Nodes are in the chosen kinds */
test('scope_namespace_count_holds_the_nodes_its_pods_run_on_like_the_list', () => {
  const kinds = [{ plural: 'pods', count: 5, readStatus: 'ok', byNs: { payments: 3, shop: 2 } },
    { plural: 'nodes', cluster: true, count: 2, readStatus: 'ok', byNs: {}, namesByNs: { payments: ['worker-a', 'worker-b'], shop: ['worker-b'] } }];
  assert.deepEqual(scopeCounts(kinds, { kinds: null, ns: null }).ns, { payments: 5, shop: 3 }, 'every kind: 3 Pods and 2 Nodes in payments, as the list shows them');
  assert.deepEqual(scopeCounts(kinds, { kinds: ['pods'], ns: null }).ns, { payments: 3, shop: 2 }, 'Pods only: no Node');
  assert.deepEqual(scopeCounts(kinds, { kinds: ['nodes'], ns: null }).ns, { payments: 2, shop: 1 }, 'Nodes only: the Nodes each namespace runs on');
});
