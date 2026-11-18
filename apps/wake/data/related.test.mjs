import test from 'node:test';
import assert from 'node:assert/strict';
import { ownedEvents, relatedResources } from './related.js';

const ref = (kind, name, uid) => [{ apiVersion: 'apps/v1', kind, name, uid, controller: true }];
const deployment = { name: 'api', ns: 'shop', uid: 'd1', raw: { metadata: { uid: 'd1' } } };
const rs = { metadata: { name: 'api-5d4b8', namespace: 'shop', uid: 'r1', ownerReferences: ref('Deployment', 'api', 'd1') } };
const pod = { name: 'api-5d4b8-x1', ns: 'shop', uid: 'p1', labels: { app: 'api' }, node: 'worker-a', owner: ref('ReplicaSet', 'api-5d4b8', 'r1')[0], ownerReferences: ref('ReplicaSet', 'api-5d4b8', 'r1'), status: ['ok', 'Running'] };
const other = { ...pod, name: 'api-gateway-7c-x1', uid: 'p2', labels: { app: 'gw' }, owner: ref('ReplicaSet', 'api-gateway-7c', 'r2')[0], ownerReferences: ref('ReplicaSet', 'api-gateway-7c', 'r2') };
const ev = (kind, name, uid) => ({ reason: 'R', object: { kind, name, ns: 'shop', uid } });

test('owned_events_follow_the_owner_chain_and_the_subject_uid', () => {
  const rows = ownedEvents('deployments', deployment, [ev('Deployment', 'api', 'd1'), ev('Deployment', 'api', 'old-uid'), ev('ReplicaSet', 'api-5d4b8', 'r1'), ev('Pod', 'api-5d4b8-x1', 'p1'), ev('Pod', 'api-gateway-7c-x1', 'p2')],
    { pods: [pod, other], replicasets: [rs] });
  assert.deepEqual(rows.map(e => `${e.object.kind}/${e.object.uid}`), ['Deployment/d1', 'ReplicaSet/r1', 'Pod/p1']);
});

test('related_resources_name_selector_service_backend_ingress_scale_target_hpa_and_node', () => {
  const services = [{ name: 'api', ns: 'shop', selector: { app: 'api' }, status: ['ok', 'Active'] }, { name: 'gw', ns: 'shop', selector: { app: 'gw' } }];
  const ingresses = [{ name: 'web', ns: 'shop', backends: [{ service: 'api' }] }, { name: 'gw', ns: 'shop', backends: [{ service: 'gw' }] }];
  const hpas = [{ name: 'api', ns: 'shop', reference: 'Deployment/api' }, { name: 'gw', ns: 'shop', reference: 'Deployment/api-gateway' }];
  const rows = relatedResources('deployments', deployment, { mine: [pod], replicasets: [rs], services, ingresses, hpas });
  assert.deepEqual(rows.map(r => `${r.kind}/${r.name}/${r.relation}`), ['ReplicaSet/api-5d4b8/owner', 'Service/api/selector', 'Ingress/web/backend', 'HorizontalPodAutoscaler/api/scaleTarget']);
  const ofPod = relatedResources('pods', pod, { mine: [pod], services, ingresses, hpas });
  assert.deepEqual(ofPod.map(r => `${r.kind}/${r.name}`), ['Node/worker-a', 'Service/api', 'Ingress/web', 'HorizontalPodAutoscaler/api']);
});

/* A2-16: Deployment의 관련 표에서 ReplicaSet 행도 다른 행처럼 상태(kubectl get rs의 Ready·Desired 판정)를 보인다 */
test('related_replicaset_row_carries_its_status_like_the_other_rows', () => {
  const live = { ...rs, apiVersion: 'apps/v1', kind: 'ReplicaSet', spec: { replicas: 2 }, status: { replicas: 2, readyReplicas: 2, availableReplicas: 2 } };
  const short = { ...live, metadata: { ...rs.metadata, name: 'api-6f7c9', uid: 'r3' }, status: { replicas: 2, readyReplicas: 1, availableReplicas: 1 } };
  const rows = relatedResources('deployments', deployment, { mine: [pod], replicasets: [live, short] });
  assert.deepEqual(rows.map(r => r.status?.[0] ?? null), ['ok', 'warn'], JSON.stringify(rows.map(r => r.status)));
});

/* A3-10: a Pod's related table left the Deployment (the owner's owner) and the Node without a state: the lists the page read give them theirs */
test('related_rows_of_a_pod_carry_the_state_of_its_deployment_and_its_node', () => {
  const owners = [{ kind: 'ReplicaSet', name: 'api-5d4b8', ns: 'shop', uid: 'r1', status: ['ok', 'Ready'] }, { kind: 'Deployment', name: 'api', ns: 'shop', uid: 'd1', status: null }];
  const rows = relatedResources('pods', pod, { mine: [pod], owners, objects: { deployments: [{ name: 'api', ns: 'shop', status: ['warn', 'Progressing'] }], nodes: [{ name: 'worker-a', ns: '', status: ['ok', 'Ready'] }] } });
  assert.deepEqual(rows.map(r => [r.kind, r.status?.[1] ?? null]), [['ReplicaSet', 'Ready'], ['Deployment', 'Progressing'], ['Node', 'Ready']]);
});

/* A3-18: the ConfigMaps and Secrets a Pod (or a workload's Pod template) reads through envFrom, env valueFrom and volumes are related resources;
   a Secret by its name only (Wake never reads a Secret) */
test('related_resources_name_the_configmaps_and_secrets_the_pod_spec_reads', () => {
  const spec = { containers: [{ name: 'app', envFrom: [{ configMapRef: { name: 'api-env' } }, { secretRef: { name: 'api-creds' } }],
    env: [{ name: 'A', valueFrom: { configMapKeyRef: { name: 'flags', key: 'a' } } }, { name: 'B', valueFrom: { secretKeyRef: { name: 'db', key: 'pw' } } }, { name: 'C', value: 'x' }] }],
    initContainers: [{ name: 'init', envFrom: [{ configMapRef: { name: 'api-env' } }] }],
    volumes: [{ name: 'cfg', configMap: { name: 'api-files' } }, { name: 's', secret: { secretName: 'tls' } }, { name: 'p', projected: { sources: [{ configMap: { name: 'ca' } }, { secret: { name: 'token' } }] } }, { name: 'tmp', emptyDir: {} }] };
  const ofPod = relatedResources('pods', { ...pod, raw: { spec } }, { mine: [pod] }).filter(r => ['ConfigMap', 'Secret'].includes(r.kind));
  assert.deepEqual(ofPod.map(r => `${r.kind}/${r.name}/${r.relation}`), ['ConfigMap/api-env/env', 'Secret/api-creds/env', 'ConfigMap/flags/env', 'Secret/db/env',
    'ConfigMap/api-files/volume', 'Secret/tls/volume', 'ConfigMap/ca/volume', 'Secret/token/volume']);
  assert.ok(ofPod.filter(r => r.kind === 'Secret').every(r => r.status == null && r.nameOnly), 'a Secret is named only');
  const ofDeployment = relatedResources('deployments', { ...deployment, raw: { metadata: { uid: 'd1' }, spec: { template: { spec } } } }, { mine: [pod] }).filter(r => r.kind === 'ConfigMap');
  assert.equal(ofDeployment.length, 4, 'a workload reads its Pod template');
});
