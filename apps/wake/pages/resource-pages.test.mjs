import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { useTokenSource } from '../../../kit/page/index.js';
import { localTime } from './parts.js';
import { logCard, logModel, parseLogs } from './log-card.js';
import { KIND_OF, KIND_LIST, rowOf } from '../data/kinds.js';
import { createDataSource } from '../data/index.js';
import ko from '../locale/ko.js';
import en from '../locale/en.js';
import kitKo from '../../../kit/locale/ko.js';
import { extendIcons, extendGlyphs } from '../../../kit/index.js';
import { ICON_MAP } from '../icon-map.js';
import { GLYPHS } from '../glyphs.js';
import { BRAND_GLYPHS, BRAND_MAP } from '../assets/brands/brand-glyphs.js';

/* the shell registers the app's icons (app.config icons): the page under test sees the same set, brand marks included */
extendGlyphs({ ...GLYPHS, ...BRAND_GLYPHS }); extendIcons({ ...ICON_MAP, ...BRAND_MAP });
/* 창이 없는 시험: 길이 토큰(tokenPx)은 토큰 파일의 값을 읽는다 */
const TOKENS = Object.fromEntries([...readFileSync(new URL('../../../kit/tokens.css', import.meta.url), 'utf8').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
useTokenSource(name => TOKENS[name]);

const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const params = { cluster: 'fixture-context', kind: 'pods', ns: 'payments', name: 'checkout-api-7cf98-p4x2m' };
/* 테스트 전용 합성 클러스터(이 파일 안에만 있음, 앱 코드는 읽지 않음): 실제 Kubernetes API 모양의 원본 객체. 메인 프로세스 서비스를 흉내 낸 호스트로
   createDataSource()의 실제 경로(kube.read, kube.list, kube.get, kube.logs, kube.relationships, kube.summary)를 지난다. 기준 시각은 테스트 실행 시각(분 단위) */
const CLUSTER = (() => {
const OBSERVED_AT = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
const VERSION = 'v1.31.2';
const ago = s => new Date(Date.parse(OBSERVED_AT) - s * 1000).toISOString();
const H = 3600, D = 86400;
const own = (kind, name) => [{ apiVersion: kind === 'ReplicaSet' ? 'apps/v1' : kind === 'Job' ? 'batch/v1' : 'apps/v1', kind, name, uid: ({ 'nightly-report-28941': 'uid-job1', 'db-migrate-4': 'uid-job2', 'reindex-search': 'uid-job3' })[name] || `uid-${name}`, controller: true }];
const container = (name, image, port) => ({ name, image, ...(port ? { ports: [{ containerPort: port, protocol: 'TCP' }] } : {}), resources: { requests: { cpu: '250m', memory: '128Mi' }, limits: { cpu: '500m', memory: '256Mi' } } });
const running = (name, restarts = 0, last) => ({ name, ready: true, restartCount: restarts, state: { running: { startedAt: ago(2 * H) } }, ...(last ? { lastState: { terminated: { reason: last, exitCode: 137 } } } : {}) });

function pod(ns, name, app, owner, node, status, { image = ({ 'checkout-api': 'registry.local/checkout:2.4.0', 'billing-api': 'registry.local/billing-api:1.8.0', 'inventory-worker': 'registry.local/inventory-worker:3.2.1', 'session-gateway': 'registry.local/session-gateway:1.4.3', 'search-api': 'registry.local/search-api:2.0.0-rc1', report: 'registry.local/report:5.1.0', reindex: 'registry.local/search-tools:1.2.0', 'node-exporter': 'prom/node-exporter:v1.8.2' })[app] || `${app}:1.0.0`, port = 8080, born = 3 * D, deleting = false, containers } = {}) {
  return { apiVersion: 'v1', kind: 'Pod', metadata: { name, namespace: ns, uid: `uid-${name}`, creationTimestamp: ago(born), labels: { app, 'app.kubernetes.io/name': app }, ownerReferences: owner,
    ...(deleting ? { deletionTimestamp: ago(30) } : {}) }, spec: { nodeName: node, containers: containers || [container(app, image, port)] }, status: { podIP: node ? `10.20.${node.slice(-1).charCodeAt(0) % 9}.${name.length * 3 % 250}` : '', startTime: ago(born), ...status } };
}
const ok = (app, restarts, last) => ({ phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }], containerStatuses: [running(app, restarts, last)] });
const waiting = (app, reason, restarts = 0, last) => ({ phase: reason === 'ContainerCreating' || reason === 'ImagePullBackOff' || reason === 'ErrImagePull' ? 'Pending' : 'Running', conditions: [{ type: 'Ready', status: 'False', reason: 'ContainersNotReady' }],
  containerStatuses: [{ name: app, ready: false, restartCount: restarts, state: { waiting: { reason, message: reason === 'ImagePullBackOff' ? `Back-off pulling image "registry.local/${app}:2.0.0-rc1"` : `back-off 5m0s restarting failed container=${app}` } }, ...(last ? { lastState: { terminated: { reason: last, exitCode: last === 'OOMKilled' ? 137 : 1, finishedAt: ago(149) } } } : {}) }] });

/* 노드와 그 사용량(metrics-server의 NodeMetrics로 따로 내보냄: USAGE). 노드 원본에는 API에 있는 필드만 */
const NODE_SPECS = [
  { name: 'worker-a', ready: true, cpu: 41, mem: 58 }, { name: 'worker-b', ready: true, cpu: 78, mem: 91 }, { name: 'worker-c', ready: false, cpu: 0, mem: 0 }, { name: 'worker-d', ready: true, cordon: true, cpu: 12, mem: 22 },
];
const NODES = NODE_SPECS.map((n, i) => ({ apiVersion: 'v1', kind: 'Node', metadata: { name: n.name, uid: `uid-${n.name}`, creationTimestamp: ago(60 * D), labels: { 'kubernetes.io/hostname': n.name, ...(i === 0 ? { 'node-role.kubernetes.io/control-plane': '' } : {}) } },
  spec: { ...(n.cordon ? { unschedulable: true, taints: [{ key: 'node.kubernetes.io/unschedulable', effect: 'NoSchedule' }] } : {}) },
  status: { conditions: [{ type: 'Ready', status: n.ready ? 'True' : 'False', reason: n.ready ? 'KubeletReady' : 'NodeStatusUnknown', message: n.ready ? 'kubelet is posting ready status' : 'Kubelet stopped posting node status.' }, { type: 'MemoryPressure', status: n.mem > 90 ? 'True' : 'False' }],
    addresses: [{ type: 'InternalIP', address: `10.20.0.${11 + i}` }], allocatable: { cpu: '4', memory: '15Gi' }, nodeInfo: { kubeletVersion: VERSION } } }));

const deploy = (ns, name, replicas, ready, avail, image, born = 9 * D) => ({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name, namespace: ns, uid: `uid-${name}`, creationTimestamp: ago(born), labels: { app: name }, annotations: { 'deployment.kubernetes.io/revision': '12' } },
  spec: { replicas, selector: { matchLabels: { app: name } }, strategy: { type: 'RollingUpdate' }, template: { metadata: { labels: { app: name } }, spec: { containers: [container(name, image, 8080)] } } },
  status: { replicas, readyReplicas: ready, availableReplicas: avail, updatedReplicas: replicas, conditions: [{ type: 'Available', status: avail >= replicas ? 'True' : 'False', reason: avail >= replicas ? 'MinimumReplicasAvailable' : 'MinimumReplicasUnavailable' }, { type: 'Progressing', status: 'True', reason: avail >= replicas ? 'NewReplicaSetAvailable' : 'ReplicaSetUpdated' }] } });
const rs = name => own('ReplicaSet', name);

const OBJECTS = {
  nodes: NODES,
  deployments: [deploy('payments', 'checkout-api', 3, 2, 2, 'registry.local/checkout:2.4.0'), deploy('payments', 'billing-api', 3, 0, 0, 'registry.local/billing-api:1.8.0', 21 * D),
    deploy('payments', 'inventory-worker', 3, 3, 3, 'registry.local/inventory-worker:3.2.1', 34 * D), deploy('platform', 'session-gateway', 2, 2, 2, 'registry.local/session-gateway:1.4.3', 34 * D),
    deploy('platform', 'search-api', 2, 1, 1, 'registry.local/search-api:2.0.0-rc1', 2 * H)],
  statefulsets: [{ apiVersion: 'apps/v1', kind: 'StatefulSet', metadata: { name: 'orders-db', namespace: 'payments', uid: 'uid-orders-db', creationTimestamp: ago(60 * D), labels: { app: 'orders-db' } },
    spec: { replicas: 2, selector: { matchLabels: { app: 'orders-db' } }, template: { spec: { containers: [container('postgres', 'postgres:16.4', 5432)] } } }, status: { replicas: 2, readyReplicas: 1, updatedReplicas: 2 } }],
  daemonsets: [{ apiVersion: 'apps/v1', kind: 'DaemonSet', metadata: { name: 'node-exporter', namespace: 'monitoring', uid: 'uid-node-exporter', creationTimestamp: ago(60 * D), labels: { app: 'node-exporter' } },
    spec: { selector: { matchLabels: { app: 'node-exporter' } }, template: { spec: { containers: [container('node-exporter', 'prom/node-exporter:v1.8.2', 9100)] } } }, status: { desiredNumberScheduled: 4, currentNumberScheduled: 4, numberReady: 3, numberAvailable: 3, updatedNumberScheduled: 4 } }],
  jobs: [
    { apiVersion: 'batch/v1', kind: 'Job', metadata: { name: 'nightly-report-28941', namespace: 'batch', uid: 'uid-job1', creationTimestamp: ago(9 * H), labels: { 'job-name': 'nightly-report-28941' } }, spec: { completions: 1, template: { spec: { containers: [container('report', 'registry.local/report:5.1.0')] } } }, status: { startTime: ago(9 * H), completionTime: ago(9 * H - 312), succeeded: 1, conditions: [{ type: 'Complete', status: 'True' }] } },
    { apiVersion: 'batch/v1', kind: 'Job', metadata: { name: 'db-migrate-4', namespace: 'payments', uid: 'uid-job2', creationTimestamp: ago(2 * H), labels: { 'job-name': 'db-migrate-4' } }, spec: { completions: 1, backoffLimit: 3, template: { spec: { containers: [container('migrate', 'registry.local/migrate:4.0.0')] } } }, status: { startTime: ago(2 * H), failed: 4, conditions: [{ type: 'Failed', status: 'True', reason: 'BackoffLimitExceeded', message: 'Job has reached the specified backoff limit' }] } },
    { apiVersion: 'batch/v1', kind: 'Job', metadata: { name: 'reindex-search', namespace: 'batch', uid: 'uid-job3', creationTimestamp: ago(240), labels: { 'job-name': 'reindex-search' } }, spec: { completions: 3, template: { spec: { containers: [container('reindex', 'registry.local/search-tools:1.2.0')] } } }, status: { startTime: ago(240), active: 1, succeeded: 1 } },
  ],
  services: [
    ...['checkout-api', 'billing-api', 'inventory-worker'].map((n, i) => ({ apiVersion: 'v1', kind: 'Service', metadata: { name: n, namespace: 'payments', uid: `uid-svc-${n}`, creationTimestamp: ago(30 * D) }, spec: { type: 'ClusterIP', clusterIP: `10.96.${12 + i}.${40 + i}`, selector: { app: n }, ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }] } })),
    { apiVersion: 'v1', kind: 'Service', metadata: { name: 'session-gateway', namespace: 'platform', uid: 'uid-svc-gw', creationTimestamp: ago(30 * D) }, spec: { type: 'LoadBalancer', clusterIP: '10.96.30.7', selector: { app: 'session-gateway' }, ports: [{ port: 443, nodePort: 31443, protocol: 'TCP' }] }, status: { loadBalancer: { ingress: [{ ip: '203.0.113.24' }] } } },
    { apiVersion: 'v1', kind: 'Service', metadata: { name: 'orders-db', namespace: 'payments', uid: 'uid-svc-db', creationTimestamp: ago(60 * D) }, spec: { type: 'ClusterIP', clusterIP: 'None', selector: { app: 'orders-db' }, ports: [{ port: 5432, protocol: 'TCP' }] } },
  ],
  ingresses: [
    { apiVersion: 'networking.k8s.io/v1', kind: 'Ingress', metadata: { name: 'checkout', namespace: 'payments', uid: 'uid-ing1', creationTimestamp: ago(30 * D) }, spec: { ingressClassName: 'nginx', rules: [{ host: 'checkout.example.com', http: { paths: [{ path: '/', backend: { service: { name: 'checkout-api', port: { number: 80 } } } }] } }] }, status: { loadBalancer: { ingress: [{ ip: '203.0.113.10' }] } } },
    { apiVersion: 'networking.k8s.io/v1', kind: 'Ingress', metadata: { name: 'search', namespace: 'platform', uid: 'uid-ing2', creationTimestamp: ago(2 * H) }, spec: { ingressClassName: 'nginx', rules: [{ host: 'search.example.com', http: { paths: [{ path: '/', backend: { service: { name: 'search-api', port: { number: 80 } } } }] } }] }, status: {} },
  ],
  configmaps: [
    { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'checkout-config', namespace: 'payments', uid: 'uid-cm1', creationTimestamp: ago(9 * D) }, data: { 'LOG_LEVEL': 'info', 'PAYMENT_TIMEOUT_MS': '3000', 'application.yaml': 'server:\n  port: 8080\npool:\n  max: 32\n' } },
    { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'kube-root-ca.crt', namespace: 'payments', uid: 'uid-cm2', creationTimestamp: ago(60 * D) }, data: { 'ca.crt': '-----BEGIN CERTIFICATE-----\nMIIC5zCCAc+gAwIBAgIBADANBgkqhkiG9w0BAQsFADAVMRMwEQYDVQQDEwprdWJl\n-----END CERTIFICATE-----\n' } },
  ],
  pods: [
    pod('payments', 'checkout-api-7cf98-p4x2m', 'checkout-api', rs('checkout-api-7cf98'), 'worker-b', waiting('checkout-api', 'CrashLoopBackOff', 9, 'OOMKilled'), { born: 9 * D }),
    pod('payments', 'checkout-api-7cf98-d9m2p', 'checkout-api', rs('checkout-api-7cf98'), 'worker-a', ok('checkout-api'), { born: 9 * D }),
    pod('payments', 'checkout-api-7cf98-b8k5n', 'checkout-api', rs('checkout-api-7cf98'), 'worker-d', ok('checkout-api', 1), { born: 9 * D }),
    pod('payments', 'billing-api-7bd4f-a7x2k', 'billing-api', rs('billing-api-7bd4f'), 'worker-a', { phase: 'Failed', reason: 'Evicted', message: 'The node was low on resource: memory.' }, { born: 21 * D }),
    pod('payments', 'billing-api-7bd4f-b9j5n', 'billing-api', rs('billing-api-7bd4f'), 'worker-b', { phase: 'Running', conditions: [{ type: 'Ready', status: 'False' }], containerStatuses: [{ name: 'billing-api', ready: false, restartCount: 7, state: { terminated: { reason: 'Error', exitCode: 1 } } }] }, { born: 21 * D }),
    pod('payments', 'billing-api-7bd4f-c3m8p', 'billing-api', rs('billing-api-7bd4f'), 'worker-c', ok('billing-api'), { born: 21 * D, deleting: true }),
    ...['h2k4q', 'm7t2w', 'x9r3e'].map((s, i) => pod('payments', `inventory-worker-5d8c9-${s}`, 'inventory-worker', rs('inventory-worker-5d8c9'), ['worker-a', 'worker-b', 'worker-d'][i], ok('inventory-worker'), { born: 34 * D })),
    pod('payments', 'orders-db-0', 'orders-db', own('StatefulSet', 'orders-db'), 'worker-a', ok('postgres'), { born: 60 * D, port: 5432, containers: [container('postgres', 'postgres:16.4', 5432)] }),
    pod('payments', 'orders-db-1', 'orders-db', own('StatefulSet', 'orders-db'), '', { phase: 'Pending', conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable', message: '0/4 nodes are available: 1 node(s) were unschedulable, 3 Insufficient memory.' }] }, { born: 40 * 60, containers: [container('postgres', 'postgres:16.4', 5432)] }),
    pod('payments', 'db-migrate-4-k2v9s', 'migrate', own('Job', 'db-migrate-4'), 'worker-a', { phase: 'Failed', containerStatuses: [{ name: 'migrate', ready: false, restartCount: 0, state: { terminated: { reason: 'Error', exitCode: 2 } } }] }, { born: 2 * H, image: 'registry.local/migrate:4.0.0' }),
    ...['q8w4e', 'z5n1v'].map((s, i) => pod('platform', `session-gateway-6f7d2-${s}`, 'session-gateway', rs('session-gateway-6f7d2'), ['worker-a', 'worker-d'][i], ok('session-gateway'), { born: 34 * D })),
    pod('platform', 'search-api-84c1b-t6p3d', 'search-api', rs('search-api-84c1b'), 'worker-a', ok('search-api'), { born: 2 * H }),
    pod('platform', 'search-api-84c1b-r1k8m', 'search-api', rs('search-api-84c1b'), 'worker-b', waiting('search-api', 'ImagePullBackOff'), { born: 2 * H }),
    pod('platform', 'search-api-84c1b-w4n2c', 'search-api', rs('search-api-84c1b'), 'worker-d', waiting('search-api', 'ContainerCreating'), { born: 20 }),
    pod('batch', 'nightly-report-28941-gx7lp', 'report', own('Job', 'nightly-report-28941'), 'worker-a', { phase: 'Succeeded', containerStatuses: [{ name: 'report', ready: false, state: { terminated: { reason: 'Completed', exitCode: 0 } } }] }, { born: 9 * H }),
    pod('batch', 'reindex-search-5hq2z', 'reindex', own('Job', 'reindex-search'), 'worker-d', ok('reindex'), { born: 240 }),
    ...['worker-a', 'worker-b', 'worker-c', 'worker-d'].map((n, i) => pod('monitoring', `node-exporter-${['8rk2d', 'p3m7x', 'v6t1q', 'c9w5h'][i]}`, 'node-exporter', own('DaemonSet', 'node-exporter'), n, n === 'worker-c' ? { phase: 'Unknown', reason: 'NodeLost' } : ok('node-exporter'), { born: 60 * D, port: 9100 })),
  ],
  events: [
    ['payments', 'Warning', 'BackOff', 'Pod', 'checkout-api-7cf98-p4x2m', 'Back-off restarting failed container checkout-api in pod checkout-api-7cf98-p4x2m_payments', 41, 120],
    ['payments', 'Warning', 'OOMKilling', 'Pod', 'checkout-api-7cf98-p4x2m', 'Memory cgroup out of memory: Killed process 4121 (java) total-vm:2312880kB, anon-rss:262144kB', 9, 149],
    ['payments', 'Normal', 'Pulled', 'Pod', 'checkout-api-7cf98-p4x2m', 'Container image "registry.local/checkout:2.4.0" already present on machine', 9, 200],
    ['payments', 'Normal', 'Started', 'Pod', 'checkout-api-7cf98-p4x2m', 'Started container checkout-api', 9, 200],
    ['payments', 'Warning', 'Evicted', 'Pod', 'billing-api-7bd4f-a7x2k', 'The node was low on resource: memory. Threshold quantity: 100Mi, available: 87Mi.', 1, 1500],
    ['payments', 'Warning', 'BackOff', 'Pod', 'billing-api-7bd4f-b9j5n', 'Back-off restarting failed container billing-api in pod billing-api-7bd4f-b9j5n_payments', 23, 300],
    ['payments', 'Warning', 'FailedScheduling', 'Pod', 'orders-db-1', '0/4 nodes are available: 1 node(s) were unschedulable, 3 Insufficient memory. preemption: 0/4 nodes are available.', 12, 400],
    ['payments', 'Warning', 'BackoffLimitExceeded', 'Job', 'db-migrate-4', 'Job has reached the specified backoff limit', 1, 3600],
    ['payments', 'Normal', 'ScalingReplicaSet', 'Deployment', 'checkout-api', 'Scaled up replica set checkout-api-7cf98 to 3', 1, 9 * D],
    ['platform', 'Warning', 'Failed', 'Pod', 'search-api-84c1b-r1k8m', 'Failed to pull image "registry.local/search-api:2.0.0-rc1": not found', 6, 600],
    ['platform', 'Normal', 'Scheduled', 'Pod', 'search-api-84c1b-w4n2c', 'Successfully assigned platform/search-api-84c1b-w4n2c to worker-d', 1, 20],
    ['', 'Warning', 'NodeNotReady', 'Node', 'worker-c', 'Node worker-c status is now: NodeNotReady', 1, 1800],
    ['', 'Normal', 'NodeNotSchedulable', 'Node', 'worker-d', 'Node worker-d status is now: NodeNotSchedulable', 1, 2 * D],
  ].map(([ns, type, reason, kind, name, message, count, at], i) => ({ apiVersion: 'v1', kind: 'Event', metadata: { name: `${name}.${i}`, uid: `uid-event-${i}`, namespace: ns || 'default', creationTimestamp: ago(at) }, type, reason, message, count, lastTimestamp: ago(at), involvedObject: { kind, name, namespace: ns, uid: kind === 'Job' ? 'uid-job2' : `uid-${name}` } })),
};
/* ReplicaSet도 실제 UID 연결을 유지하되 종류 목록에는 추가하지 않는다. */
OBJECTS.replicasets = OBJECTS.deployments.map(d => {
  const owner = OBJECTS.pods.find(p => p.metadata.namespace === d.metadata.namespace && p.metadata.labels.app === d.metadata.name)?.metadata.ownerReferences[0];
  return { apiVersion: 'apps/v1', kind: 'ReplicaSet', metadata: { name: owner.name, namespace: d.metadata.namespace, uid: owner.uid, ownerReferences: own('Deployment', d.metadata.name) }, spec: { selector: d.spec.selector, template: d.spec.template } };
});
for (const p of OBJECTS.pods) {
  const c = p.spec.containers[0];
  p.status.conditions ||= [];
  if (!p.status.conditions.some(c => c.type === 'Ready')) p.status.conditions.push({ type: 'Ready', status: 'False', reason: p.status.reason || 'ContainersNotReady' });
  p.status.containerStatuses ||= [{ name: c.name, ready: false, restartCount: 0, state: p.status.reason === 'Evicted' ? { terminated: { reason: 'Evicted', exitCode: 137, finishedAt: ago(1500) } } : { waiting: { reason: p.status.reason || 'PodInitializing' } } }];
  for (const state of p.status.containerStatuses) {
    state.restartCount ??= 0;
    state.lastState ||= {};
    for (const termination of [state.state.terminated, state.lastState.terminated].filter(Boolean)) {
      termination.startedAt ||= p.metadata.creationTimestamp;
      termination.finishedAt ||= ago(p.status.phase === 'Succeeded' ? 9 * H - 312 : 300);
    }
    if (p.metadata.name === 'billing-api-7bd4f-b9j5n') state.lastState = { terminated: { reason: 'Error', exitCode: 1, startedAt: ago(800), finishedAt: ago(700) } };
  }
  const owner = p.metadata.ownerReferences[0];
  const replica = OBJECTS.replicasets.find(r => r.metadata.uid === owner?.uid);
  if (replica) {
    replica.metadata.annotations = { 'deployment.kubernetes.io/revision': '12' };
    p.metadata.labels['pod-template-hash'] = replica.metadata.name.split('-').at(-1);
  }
}

const ENDPOINT_SLICES = OBJECTS.services.map(s => ({
  apiVersion: 'discovery.k8s.io/v1', kind: 'EndpointSlice',
  metadata: { name: `${s.metadata.name}-fixture`, namespace: s.metadata.namespace, uid: `uid-es-${s.metadata.name}`, labels: { 'kubernetes.io/service-name': s.metadata.name } },
  addressType: 'IPv4', ports: s.spec.ports.map(p => ({ port: p.targetPort || p.port, protocol: p.protocol })),
  endpoints: OBJECTS.pods.filter(p => p.metadata.namespace === s.metadata.namespace && p.metadata.labels.app === s.spec.selector.app && p.status.podIP).map(p => {
    const ready = p.status.conditions.some(c => c.type === 'Ready' && c.status === 'True') && !p.metadata.deletionTimestamp && NODES.some(n => n.metadata.name === p.spec.nodeName && n.status.conditions.some(c => c.type === 'Ready' && c.status === 'True'));
    return { addresses: [p.status.podIP], conditions: { ready, serving: ready, terminating: !!p.metadata.deletionTimestamp }, nodeName: p.spec.nodeName, targetRef: { apiVersion: 'v1', kind: 'Pod', namespace: p.metadata.namespace, name: p.metadata.name, uid: p.metadata.uid } };
  }),
}));

const allObjects = () => Object.values(OBJECTS).flat();
function relatedObjects(object) {
  const result = [object], seen = new Set([object.metadata.uid]);
  for (const parent of result) for (const child of allObjects()) {
    if (seen.has(child.metadata.uid) || child.metadata.namespace !== parent.metadata.namespace) continue;
    if (!child.metadata.ownerReferences?.some(r => r.uid === parent.metadata.uid && r.kind === parent.kind && r.name === parent.metadata.name)) continue;
    result.push(child); seen.add(child.metadata.uid);
  }
  return result;
}

const NAMESPACES = ['payments', 'platform', 'monitoring', 'batch', 'default'];
/* 사용률(metrics.k8s.io 모양): Node마다 CPU·메모리 사용량 */
const USAGE = NODE_SPECS.filter(n => n.ready).map(n => ({ metadata: { name: n.name }, usage: { cpu: `${Math.round(n.cpu * 40)}m`, memory: `${Math.round(n.mem * 15 * 1024 / 100)}Mi` } }));

/* 로그: Pod마다 몇 줄, 이전 컨테이너는 죽기 직전 줄 */
const T = s => ago(s).replace('Z', '000000Z').replace(/\.\d{3}/, '.123');
function logsOf(name, { previous = false, ns, container: selected, tail } = {}) {
  const p = OBJECTS.pods.find(o => o.metadata.name === name && o.metadata.namespace === ns);
  if (!p) throw Object.assign(new Error('fixture Pod not found'), { status: 404 });
  const c = p.spec.containers.find(c => !selected || c.name === selected);
  if (!c) throw Object.assign(new Error('fixture container not found'), { status: 404 });
  const state = p.status.containerStatuses?.find(s => s.name === c.name);
  if (!NODES.find(n => n.metadata.name === p.spec.nodeName)?.status.conditions.some(c => c.type === 'Ready' && c.status === 'True')) return '';
  if (!state || p.status.reason === 'NodeLost' || p.status.reason === 'Evicted' || (previous && !state.lastState?.terminated)) return '';
  let lines = [];
  if (name === 'checkout-api-7cf98-p4x2m') lines = previous
    ? [[200, 'INFO', 'starting checkout-api version=2.4.0'], [190, 'INFO', 'connected to orders-db pool=32'], [180, 'WARN', 'heap usage 91% of 256Mi'], [150, 'ERROR', 'java.lang.OutOfMemoryError: Java heap space'], [150, 'ERROR', 'at com.example.checkout.CartService.load(CartService.java:88)']]
    : [[200, 'INFO', 'starting checkout-api version=2.4.0'], [180, 'WARN', 'heap usage 87% of 256Mi'], [150, 'ERROR', 'java.lang.OutOfMemoryError: Java heap space']];
  else if (name === 'billing-api-7bd4f-b9j5n') lines = previous ? [[790, 'INFO', 'starting billing-api version=1.8.0'], [710, 'ERROR', 'config: PAYMENT_PROVIDER_URL is not set'], [701, 'ERROR', 'exit status 1']] : [[390, 'INFO', 'starting billing-api version=1.8.0'], [370, 'ERROR', 'config: PAYMENT_PROVIDER_URL is not set'], [369, 'ERROR', 'exit status 1']];
  else if (p.status.phase === 'Succeeded') lines = [[9 * H, 'INFO', `starting ${c.name} image=${c.image}`], [9 * H - 312, 'INFO', 'report completed exitCode=0']];
  else if (p.status.phase === 'Failed') lines = [[2 * H, 'INFO', `starting ${c.name} image=${c.image}`], [3601, 'ERROR', 'migration failed exitCode=2']];
  else if (state.state?.running) lines = Array.from({ length: 64 }, (_, i) => [640 - i * 10, i % 17 === 0 ? 'WARN' : 'INFO', c.name === 'postgres' ? `checkpoint ${i % 17 === 0 ? 'requested' : 'complete'} buffers=${32 + i}` : c.name === 'inventory-worker' ? `queue=inventory job=${i} status=${i % 17 === 0 ? 'retry' : 'completed'} duration_ms=${20 + i}` : `GET /${c.name === 'search-api' ? 'search' : 'health'} status=200 duration_ms=${3 + i % 12} trace_id=trace-${p.metadata.name}-${i}`]);
  const result = lines.map(([s, l, m]) => `${T(s)} ${l} ${m}`);
  return (tail > 0 ? result.slice(-tail) : result).join('\n');
}
  /* Argo CD가 동기화하는 Deployment(tracking-id 주석): checkout-api, billing-api. inventory-worker는 관리자 없음 */
  for (const d of OBJECTS.deployments.filter(o => ['checkout-api', 'billing-api'].includes(o.metadata.name))) {
    const app = d.metadata.name.replace(/-api$/, '');
    d.metadata.annotations = { ...(d.metadata.annotations ?? {}), 'argocd.argoproj.io/tracking-id': `${app}:apps/Deployment:${d.metadata.namespace}/${d.metadata.name}` };
  }
  return { OBJECTS, ENDPOINT_SLICES, NAMESPACES, USAGE, NODES, logsOf, VERSION, OBSERVED_AT };
})();
const inNs = (ns, o) => !ns || ns === '_all' || o.metadata?.namespace === ns;
globalThis.kitService = { on() {}, call: async (name, a = {}) => {
  const { OBJECTS, ENDPOINT_SLICES, NAMESPACES, USAGE, logsOf, VERSION } = CLUSTER, list = kind => (OBJECTS[kind] || []).filter(o => kind === 'nodes' || inNs(a.ns, o));
  if (name === 'kube.read') return { contexts: [{ id: params.cluster }] };
  if (name === 'kube.list') return structuredClone(a.kind === 'namespaces' ? NAMESPACES : list(a.kind));
  if (name === 'kube.get') return structuredClone(list(a.kind).find(o => o.metadata.name === a.name) ?? null);
  if (name === 'events.read') return { partial: false, items: structuredClone(list('events')).filter(e => !a.subjectUid || e.involvedObject?.uid === a.subjectUid) };
  if (name === 'kube.logs') return logsOf(a.name, { ns: a.ns, container: a.container, previous: a.previous, tail: a.tail });
  if (name === 'kube.summary') return { version: VERSION, namespaces: NAMESPACES.length, nodes: OBJECTS.nodes, pods: OBJECTS.pods, events: OBJECTS.events, usage: USAGE };
  if (name === 'kube.relationships') return { partial: false, items: structuredClone(a.kind === 'deployments'
    ? OBJECTS.replicasets.filter(r => r.metadata.namespace === a.ns && r.metadata.ownerReferences?.some(o => o.kind === 'Deployment' && o.uid === a.uid && o.controller))
    : ENDPOINT_SLICES.filter(s => s.metadata.namespace === a.ns && s.metadata.labels['kubernetes.io/service-name'] === a.name)) };
  throw Object.assign(new Error(`not connected: ${name}`), { kind: 'unconfigured' });
} };
const cluster = createDataSource();
/* the page module runs with its own imports, except the page host (bootPage, config, the desktop service and the live timer), which the test plays */
async function moduleOf(name) {
  const url = new URL(`./resource-${name}.js`, import.meta.url), source = readFileSync(url, 'utf8'), names = [], values = [];
  /* the app definition is the shell's: the page sees an empty config and the one address helper it uses */
  const appConfig = { default: {}, viewAddress: (cluster, view) => `wake://cluster/${cluster}${view === 'home' ? '' : '/' + view}` };
  for (const [, def, list, spec] of source.matchAll(/^import (?:(\w+))?(?:,\s*)?(?:\{([^}]+)\})? from '([^']+)';$/gm)) {
    const mod = spec.endsWith('app.config.js') ? appConfig : await import(new URL(spec, url));
    if (def) { names.push(def); values.push(mod.default); }
    if (!list) continue;
    for (const part of list.split(',').map(x => x.trim()).filter(Boolean)) { const [orig, alias = orig] = part.split(/\s+as\s+/); names.push(alias); values.push(mod[orig]); }
  }
  return { body: source.replace(/^import .*;\n/gm, ''), names, values };
}
async function pageOf(name, get, query = {}, routeParams = params, native = null) {
  let create, onHide, updates = 0, mounted = null, page; const navigations = [], panels = [];
  const { body, names, values } = await moduleOf(name);
  const host = { addEventListener: (event, fn) => { if (event === 'pagehide') onHide = fn; } };
  const stub = { bootPage: (_, fn) => { create = fn; }, service: native, hasService: () => typeof native === 'function', liveInterval: () => null, globalThis: host };
  const all = [...new Set([...names, ...Object.keys(stub)])];
  new Function(...all, body)(...all.map(n => (n in stub ? stub[n] : values[names.indexOf(n)])));
  let state = {}, settings = {}; /* 셸처럼 쓰기를 바로 설정에 남긴다(범위 상자는 늘 설정에서 읽음) */
  const ctx = { params: routeParams, query, t: (key, vars) => (ko[key] || key).replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? ''), data: { get }, settings: () => settings,
    update: () => { updates++; if (mounted) page.afterRender?.(mounted); }, state: () => state, setState: patch => { state = { ...state, ...patch }; ctx.update(); },
    api: { navigate: (address, o) => navigations.push(address), setMeta() {}, openPanel: p => panels.push(p), setSetting: (key, value) => { settings = { ...settings, [key]: value }; } } };
  page = await create(ctx);
  if (page.screen) state = structuredClone(page.screen.state);
  return { page, navigations, panels, setState: patch => ctx.setState(patch), render: () => page.render().s, hide: () => onHide(), updates: () => updates, mount: root => { mounted = root; page.afterRender?.(root); } };
}
/* the detail page shows one metric group at a time (tabs): the charts of cpu, memory and network, read by opening each group */
const unpack = html => [...html.matchAll(/data-chart="([^"]+)"/g)].map(match => JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&')));
/* a chart is drawn empty (axis only) when nothing is verified: no series holds a point */
const noSeries = html => unpack(html).every(chart => (chart.series || []).every(series => !(series.observations || series.values || []).some(point => point !== null && point !== undefined)));
const groupCharts = async app => { const out = []; for (const group of ['cpu', 'memory', 'network']) { app.page.actions['wake.detail.metricGroup']({ arg: group }); await settle(); out.push(...unpack(app.render())); } return out; };
const provider = override => (key, p, options) => override(key, p, options) ?? cluster.get(key, p, options);

/* A-21 · C-19: 리소스 거르기 알약은 다른 화면(GitOps · 알림 · 이벤트)처럼 수를 보이고, 알약 · 상태 메뉴 · 카드 머리가 같은 모집단(범위 글을 지난 행)에서 센다 */
test('list_filter_pills_and_menus_count_the_rows_the_search_leaves', async () => {
  const rows = [{ uid: '1', name: 'api-1', ns: 'a', status: ['danger', 'CrashLoopBackOff'] }, { uid: '2', name: 'api-2', ns: 'a', status: ['ok', 'Running'] },
    { uid: '3', name: 'web-1', ns: 'a', status: ['danger', 'CrashLoopBackOff'] }, { uid: '4', name: 'web-2', ns: 'a', status: ['ok', 'Running'] }, { uid: '5', name: 'web-3', ns: 'a', status: ['ok', 'Running'] }];
  const app = await pageOf('list', provider(key => key === 'resources' ? Promise.resolve(rows) : undefined), {}, { ...params, ns: '_all' });
  await settle(); await settle();
  app.page.actions['kit.composer.send']({ id: 'wake-scope', text: 'api' }); await settle(); await settle();
  const pills = /data-tabs="wake-rv-only"[\s\S]*?<\/div>/.exec(app.render())?.[0] ?? '';
  const counts = [...pills.matchAll(/<span class="n">([^<]*)</g)].map(m => m[1]);
  assert.deepEqual(counts, ['2', '1'], `all · bad pills count the searched rows: ${pills.slice(0, 400)}`);
  const states = app.page.menus['wake.rv.stMenu']().items.map(i => i.label?.raw).filter(Boolean);
  assert.deepEqual(states, ['CrashLoopBackOff · 1', 'Running · 1'], 'the state menu counts the same rows the list shows');
});

test('list_default_order_sorts_problems_and_identity_before_pagination', async () => {
  const rows = [
    ...Array.from({ length: 21 }, (_, i) => ({ uid: `ok-${i}`, name: `healthy-${String(i).padStart(2, '0')}`, ns: 'a', status: ['ok', 'Running'] })),
    { uid: 'warn', name: 'warning', ns: 'a', status: ['warn', 'Pending'] },
    { uid: 'danger-b', name: 'danger-b', ns: 'b', status: ['danger', 'CrashLoopBackOff'] },
    { uid: 'danger-a', name: 'danger-a', ns: 'a', status: ['danger', 'CrashLoopBackOff'] },
  ];
  const app = await pageOf('list', provider(key => key === 'resources' ? Promise.resolve(rows) : undefined), {}, { ...params, ns: '_all' });
  await settle(); await settle();
  const markup = app.render();
  const names = [...markup.matchAll(/class="dt-lead-t"[^>]*>([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(names.slice(0, 3), ['danger-a', 'danger-b', 'warning']);
  assert.equal(names.length, 20);
  assert.equal(rows[0].name, 'healthy-00');
  app.hide();
});

function ownerFixture() {
  const ref = { apiVersion: 'apps/v1', kind: 'StatefulSet', name: 'controller', uid: 'owner-uid', controller: true };
  const pod = { name: 'controller-0', ns: 'operators', status: ['ok', 'Running'], containerList: [], owner: { kind: ref.kind, name: ref.name },
    raw: { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'controller-0', namespace: 'operators', uid: 'pod-uid', ownerReferences: [ref] } } };
  const owner = { name: ref.name, ns: pod.ns, status: ['ok', 'Available'],
    raw: { apiVersion: ref.apiVersion, kind: ref.kind, metadata: { name: ref.name, namespace: pod.ns, uid: ref.uid }, spec: { replicas: 1 }, status: { readyReplicas: 1 } } };
  return { ref, pod, owner, params: { ...params, ns: pod.ns, name: pod.name } };
}
function relationGraph(app) {
  const encoded = app.render().match(/data-flow="([^"]+)"/)?.[1];
  assert.ok(encoded, 'owner reference remains a relation graph');
  return JSON.parse(encoded.replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
}

test('detail owner: a matching StatefulSet UID is read once and verified independently of Pod health', async () => {
  const fixture = ownerFixture(), calls = [];
  fixture.pod.status = ['danger', 'CrashLoopBackOff'];
  const app = await pageOf('detail', provider((key, input) => {
    if (key !== 'resource') return undefined;
    calls.push(input); return Promise.resolve(input.kind === 'pods' ? fixture.pod : fixture.owner);
  }), { tab: 'relations' }, fixture.params); await settle(); await settle();
  const graph = relationGraph(app), node = graph.nodes.find(node => node.id === fixture.ref.uid);
  assert.equal(node.state, 'ok'); assert.equal(graph.nodes.find(node => node.id === 'pod-uid').state, 'fail');
  assert.ok(node.sub.includes(ko['wake.detail.owner.verified']));
  assert.equal(calls.length, 2); assert.equal(calls[1].kind, 'statefulsets'); assert.equal(calls[1].name, fixture.ref.name); assert.equal(calls[1].ns, fixture.pod.ns);
  assert.equal(graph.mode, 'relation'); assert.ok(graph.links.every(link => link.active === false));
  assert.ok(!app.render().includes(ko['wake.res.noRelations'])); app.hide();
});

for (const [result, expected] of [
  ['forbidden', 'wake.flow.c.forbidden'], ['missing', 'wake.flow.c.absent'],
  ['uid', 'wake.detail.owner.mismatch'], ['namespace', 'wake.detail.owner.mismatch'],
  ['name', 'wake.detail.owner.mismatch'], ['api', 'wake.detail.owner.mismatch'], ['kind', 'wake.detail.owner.mismatch'],
]) test(`detail owner: ${result} retains the reference without verified health`, async () => {
  const fixture = ownerFixture();
  if (result === 'uid') fixture.owner.raw.metadata.uid = 'replacement-uid';
  if (result === 'namespace') fixture.owner.raw.metadata.namespace = 'other-namespace';
  if (result === 'name') fixture.owner.raw.metadata.name = 'other-name';
  if (result === 'api') fixture.owner.raw.apiVersion = 'apps/v2';
  if (result === 'kind') fixture.owner.raw.kind = 'Deployment';
  const app = await pageOf('detail', provider((key, input) => {
    if (key !== 'resource') return undefined;
    if (input.kind === 'pods') return Promise.resolve(fixture.pod);
    if (result === 'forbidden' || result === 'missing') return Promise.reject({ status: result === 'forbidden' ? 403 : 404 });
    return Promise.resolve(fixture.owner);
  }), { tab: 'relations' }, fixture.params); await settle();
  const graph = relationGraph(app), owner = graph.nodes.find(node => node.id === fixture.ref.uid);
  assert.equal(owner.label, fixture.ref.name); assert.equal(owner.state, 'idle'); assert.equal(owner.action, undefined);
  assert.ok(owner.sub.includes(ko[expected])); assert.equal(graph.links[0].state, 'idle'); assert.equal(graph.links[0].active, false);
  assert.ok(!app.render().includes(ko['wake.res.noRelations'])); app.hide();
});

test('detail owner: a Pod resolves the exact ReplicaSet reference', async () => {
  const fixture = ownerFixture(), reads = [];
  fixture.ref.kind = fixture.owner.raw.kind = 'ReplicaSet';
  const app = await pageOf('detail', provider((key, input) => {
    if (key !== 'resource') return undefined;
    reads.push(input); return Promise.resolve(input.kind === 'pods' ? fixture.pod : fixture.owner);
  }), { tab: 'relations' }, fixture.params); await settle(); await settle();
  assert.equal(reads[1].kind, 'replicasets');
  const owner = relationGraph(app).nodes.find(node => node.id === fixture.ref.uid);
  assert.ok(owner.sub.includes(ko['wake.detail.owner.verified']));
  app.hide();
});

test('detail owner: the owner of a verified ReplicaSet joins the relation graph as the first column', async () => {
  const fixture = ownerFixture();
  fixture.ref.kind = fixture.owner.raw.kind = 'ReplicaSet';
  fixture.owner.raw.metadata.ownerReferences = [{ apiVersion: 'apps/v1', kind: 'Deployment', name: 'checkout', uid: 'deploy-uid', controller: true }];
  const app = await pageOf('detail', provider(key => key === 'resource' ? Promise.resolve(fixture.pod) : undefined), { tab: 'relations' }, fixture.params); await settle(); await settle();
  const withoutGrand = relationGraph(app);
  assert.equal(withoutGrand.nodes.some(node => node.id === 'deploy-uid'), false, 'a record that was not read names no grand owner');
  app.hide();
  const read = await pageOf('detail', provider((key, input) => key === 'resource' ? Promise.resolve(input.kind === 'pods' ? fixture.pod : fixture.owner) : undefined), { tab: 'relations' }, fixture.params); await settle(); await settle();
  const graph = relationGraph(read), grand = graph.nodes.find(node => node.id === 'deploy-uid');
  assert.ok(grand, 'the Deployment is the first column');
  assert.equal(grand.col, 0);
  assert.equal(graph.nodes.find(node => node.id === fixture.ref.uid).col, 1);
  assert.equal(graph.nodes.find(node => node.id === 'pod-uid').col, 2);
  assert.ok(graph.links.some(link => link.from === 'deploy-uid' && link.to === fixture.ref.uid));
  read.hide();
});

for (const mode of ['unsupported', 'row', 'no-ref']) test(`detail owner: ${mode} does not invent an owner lookup`, async () => {
  const fixture = ownerFixture(), reads = [];
  if (mode === 'unsupported') fixture.ref.kind = 'ReplicationController';
  if (mode === 'row') delete fixture.pod.raw;
  if (mode === 'no-ref') fixture.pod.raw.metadata.ownerReferences = [];
  const app = await pageOf('detail', provider((key, input) => {
    if (key !== 'resource') return undefined;
    reads.push(input); return Promise.resolve(fixture.pod);
  }), { tab: 'relations' }, fixture.params); await settle();
  assert.equal(reads.length, 1);
  if (mode === 'no-ref') {
    assert.ok(app.render().includes(ko['wake.detail.owner.none'])); assert.doesNotMatch(app.render(), /data-flow=/);
  } else {
    const graph = relationGraph(app), owner = graph.nodes.find(node => node.label === fixture.ref.name);
    assert.equal(owner.state, 'idle'); assert.ok(owner.sub.includes(ko[`wake.detail.owner.${mode === 'row' ? 'incomplete' : 'unsupported'}`]));
    assert.equal(graph.nodes.length, 2); assert.ok(!graph.nodes.some(node => node.label === 'controller-rs'));
  }
  app.hide();
});

test('detail owner: one failed reference and auxiliary denial do not hide another verified owner', async () => {
  const fixture = ownerFixture();
  fixture.pod.raw.metadata.ownerReferences.push({ ...fixture.ref, name: 'denied-owner', uid: 'denied-uid' });
  const app = await pageOf('detail', provider((key, input) => {
    if (key === 'gitops') return Promise.reject({ status: 403 });
    if (key !== 'resource') return undefined;
    if (input.kind === 'pods') return Promise.resolve(fixture.pod);
    return input.name === fixture.ref.name ? Promise.resolve(fixture.owner) : Promise.reject({ status: 403 });
  }), { tab: 'relations', at: '2026-11-02T01:15:00Z' }, fixture.params); await settle();
  const graph = relationGraph(app);
  assert.equal(graph.nodes.find(node => node.id === fixture.ref.uid).state, 'ok');
  assert.ok(graph.nodes.find(node => node.id === fixture.ref.uid).sub.includes(ko['wake.detail.owner.currentRead']));
  assert.equal(graph.nodes.find(node => node.id === 'denied-uid').state, 'idle');
  assert.ok(app.render().includes(ko['wake.flow.c.forbidden'])); app.hide();
});

for (const boundary of ['pod-uid', 'ref-uid', 'tab', 'dispose']) test(`detail owner: late response after ${boundary} cannot verify or update`, async () => {
  const fixture = ownerFixture(), next = deferred(); let signal;
  const app = await pageOf('detail', provider((key, input, options) => {
    if (key !== 'resource') return undefined;
    if (input.kind === 'pods') return Promise.resolve(fixture.pod);
    signal = options.signal; return next.promise;
  }), { tab: 'relations' }, fixture.params); await settle();
  assert.ok(relationGraph(app).nodes.find(node => node.id === fixture.ref.uid).sub.includes(ko['wake.res.loading']));
  if (boundary === 'pod-uid') fixture.pod.raw.metadata.uid = 'new-pod-uid';
  if (boundary === 'ref-uid') fixture.ref.uid = 'new-owner-uid';
  if (boundary === 'tab') app.page.actions['wake.detail.tab']({ arg: 'summary' });
  if (boundary === 'dispose') app.hide();
  const updates = app.updates(); next.resolve(fixture.owner); await settle();
  assert.equal(app.updates(), updates);
  if (boundary === 'tab' || boundary === 'dispose') assert.ok(signal.aborted);
  if (boundary === 'pod-uid' || boundary === 'ref-uid') assert.ok(!relationGraph(app).nodes.some(node => node.sub.includes(ko['wake.detail.owner.verified'])));
  app.hide();
});

test('detail owner: Deployment does not fabricate a ReplicaSet from its name', async () => {
  const app = await pageOf('detail', (key, input, options) => key === 'relationships' ? Promise.resolve(null) : cluster.get(key, input, options), { tab: 'relations' }, { ...params, kind: 'deployments', name: 'checkout-api' }); await settle();
  assert.ok(app.render().includes(ko['wake.detail.owner.childrenUnverified']));
  assert.doesNotMatch(app.render(), /data-flow=/); app.hide();
});

for (const name of ['list', 'detail']) {
  const key = name === 'list' ? 'resources' : 'resource';
  test(`${name}: pending is not an empty success`, async () => {
    const d = deferred(), app = await pageOf(name, provider(k => k === key ? d.promise : undefined));
    assert.match(app.render(), new RegExp(`${ko['wake.res.loading']}`)); assert.doesNotMatch(app.render(), new RegExp(`${ko['wake.list.empty']}|Unknown|data-menu="wake.detail.actions"`));
    d.resolve(name === 'list' ? [] : { missing: true }); await settle();
    assert.match(app.render(), name === 'list' ? new RegExp(ko['wake.rv.noneKind'].replace('{kind}', 'Pod')) : new RegExp(`${ko['wake.flow.c.absent']}`));
  });
  for (const error of [Object.assign(new Error('private response'), { status: 500 }), Object.assign(new Error('denied'), { status: 403 }), Object.assign(new Error('denied'), { kind: 'forbidden' }), Object.assign(new Error('cancel'), { name: 'AbortError' })]) {
    test(`${name}: ${error.status || error.kind || error.name} and retry success`, async () => {
      let fail = true;
      const app = await pageOf(name, provider(k => k === key && fail ? Promise.reject(error) : undefined)); await settle();
      const body = app.render();
      const denied = error.status === 403 || error.kind === 'forbidden';
      /* the list says which verb it may not use and offers the permission sheet; the detail offers a retry */
      assert.match(body, denied ? new RegExp(name === 'list' ? ko['wake.rv.denied'].replace('{verb}', 'list').replace('{res}', 'pods') : ko['wake.flow.c.forbidden']) : error.name === 'AbortError' ? new RegExp(`${ko['wake.flow.c.cancelled']}`) : new RegExp(name === 'list' ? ko['wake.find.c.read'] : ko['wake.conn.short.failed']));
      assert.match(body, new RegExp(name === 'list' && denied ? ko['wake.flow.a.perm'] : ko['wake.flow.a.retry'])); assert.doesNotMatch(body, new RegExp(`private response|${ko['wake.list.empty']}|Unknown`));
      fail = false; await app.page.actions[name === 'list' ? 'wake.list.retry' : 'wake.detail.retryResource'](); await settle();
      assert.match(app.render(), /checkout-api/); assert.doesNotMatch(app.render(), new RegExp(`${ko['wake.flow.a.retry']}`));
    });
  }
  test(`${name}: disposed request aborts without late update`, async () => {
    const d = deferred(); let signal;
    const app = await pageOf(name, provider((k, p, o) => { if (k === key) { signal = o.signal; return d.promise; } }));
    app.hide(); const updates = app.updates(); assert.equal(signal.aborted, true);
    d.reject(new Error('late rejection')); await settle(); assert.equal(app.updates(), updates);
  });
}

test('list: concurrent retry ignores older success after newer denial', async () => {
  const first = deferred(), second = deferred(); let n = 0, oldSignal;
  const app = await pageOf('list', provider((k, p, o) => { if (k === 'resources') { n++; if (n === 1) oldSignal = o.signal; return n === 1 ? first.promise : second.promise; } }));
  const retry = app.page.actions['wake.list.retry'](); assert.equal(oldSignal.aborted, true);
  second.reject(Object.assign(new Error('denied'), { status: 403 })); await retry;
  first.resolve(await cluster.get('resources', params)); await settle();
  assert.match(app.render(), new RegExp(`${ko['wake.flow.c.forbidden']}`)); assert.doesNotMatch(app.render(), /checkout-api/);
});

test('detail: absent resource has no tabs, command menu, AI context or related requests', async () => {
  const calls = [];
  const app = await pageOf('detail', provider(k => { calls.push(k); return k === 'resource' ? Promise.resolve({ name: params.name, missing: true, status: ['neutral', 'Unknown'] }) : undefined; })); await settle();
  assert.match(app.render(), new RegExp(`${ko['wake.flow.c.absent']}`)); assert.doesNotMatch(app.render(), new RegExp(`Unknown|data-menu|wake.detail.tab|${ko['wake.res.badPods']}`));
  assert.equal(app.page.meta().context.title, ko['wake.flow.c.absent']); assert.equal(app.page.meta().context.sub, ''); assert.equal(app.page.meta().context.icon, 'status-idle'); assert.deepEqual(calls, ['kind', 'resource']);
  app.page.actions['wake.detail.ask']({});
});

for (const tab of ['logs', 'events', 'yaml']) {
  test(`detail ${tab}: loading, forbidden, retry and empty success`, async () => {
    const d = deferred(); let fail = true;
    const app = await pageOf('detail', provider(k => k === tab ? fail ? d.promise : Promise.resolve(tab === 'events' ? [] : '') : undefined), { tab });
    await settle(); assert.match(app.render(), new RegExp(`${ko['wake.res.loading']}`)); assert.doesNotMatch(app.render(), new RegExp(`${ko['wake.rv.noLogs']}|${ko['wake.res.noEvents']}|${ko['wake.res.noData']}`));
    d.reject(Object.assign(new Error('denied'), { status: 403 })); await settle();
    assert.match(app.render(), new RegExp(`${ko['wake.flow.c.forbidden']}`)); assert.match(app.render(), new RegExp(`${ko['wake.flow.a.retry']}`));
    fail = false; app.page.actions['wake.detail.retry'](); await settle();
    assert.match(app.render(), tab === 'events' ? new RegExp(`${ko['wake.res.noEvents']}`) : tab === 'logs' ? new RegExp(`${ko['wake.rv.noLogs']}`) : new RegExp(`${ko['wake.res.noData']}`));
  });
  test(`detail ${tab}: late response after tab switch cannot overwrite summary`, async () => {
    const d = deferred(); let signal;
    const app = await pageOf('detail', provider((k, p, o) => { if (k === tab) { signal = o.signal; return d.promise; } }), { tab }); await settle();
    app.page.actions['wake.detail.tab']({ arg: 'summary' }); assert.equal(signal.aborted, true);
    const summary = app.render(); d.reject(new Error('late failure')); await settle();
    assert.equal(app.render(), summary); assert.doesNotMatch(app.render(), new RegExp(`${ko['wake.conn.short.failed']}|${ko['wake.flow.a.retry']}`));
  });
}

test('detail: related Pod failures are not empty relations', async () => {
  for (const key of ['resources']) {
    const app = await pageOf('detail', provider(k => k === key ? Promise.reject(new Error('dependency failed')) : undefined)); await settle();
    assert.match(app.render(), new RegExp(`${ko['wake.conn.short.failed']}`)); assert.doesNotMatch(app.render(), new RegExp(`${ko['wake.res.noRelations']}|${ko['wake.res.badPods']}`));
  }
});

test('detail: auxiliary failures retain the target and tabs, and retry recovers', async () => {
  const errors = [
    [Object.assign(new Error('private response'), { status: 404 }), 'wake.conn.short.failed'],
    [Object.assign(new Error('private response'), { kind: 'notFound' }), 'wake.conn.short.failed'],
    [Object.assign(new Error('private response'), { status: 403 }), 'wake.flow.c.forbidden'],
    [new TypeError('private response'), 'wake.conn.short.failed'],
    [Object.assign(new Error('private response'), { name: 'AbortError' }), 'wake.flow.c.cancelled'],
  ];
  for (const key of ['resources']) for (const [error, label] of errors) {
    const d = deferred(); let fail = true;
    const app = await pageOf('detail', provider(k => k === key && fail ? d.promise : undefined)); await settle();
    assert.match(app.render(), new RegExp(ko['wake.res.loading']));
    assert.match(app.render(), /wake.detail.tab/);
    d.reject(error); await settle();
    const body = app.render();
    assert.match(body, new RegExp(params.name));
    assert.equal(app.page.meta().context.title, params.name);
    assert.match(body, /wake.detail.tab/);
    assert.match(body, new RegExp(ko[label]));
    assert.match(body, /wake.detail.retryResource/);
    assert.doesNotMatch(body, new RegExp(`private response|${ko['wake.flow.c.absent']}|${ko['wake.res.noRelations']}`));
    app.page.actions['wake.detail.tab']({ arg: 'relations' }); await settle();
    assert.match(app.render(), new RegExp(ko[label]));
    fail = false; await app.page.actions['wake.detail.retryResource'](); await settle();
    assert.match(app.render(), /wake.detail.tab/);
    assert.doesNotMatch(app.render(), /wake.detail.retryResource/);
  }
});

test('detail: only the primary null, missing or 404 removes the target', async () => {
  for (const result of [null, { missing: true }, { status: 404 }, { kind: 'notFound' }]) {
    const app = await pageOf('detail', (k, p, o) => k === 'resource'
      ? result?.status || result?.kind ? Promise.reject(result) : Promise.resolve(result)
      : cluster.get(k, p, o)); await settle();
    assert.match(app.render(), new RegExp(ko['wake.flow.c.absent']));
    assert.doesNotMatch(app.render(), /wake.detail.tab|wake.detail.retryResource/);
  }
});

test('detail: auxiliary requests abort and late replies cannot replace newer results or update disposed pages', async () => {
  for (const key of ['resources']) for (const reject of [false, true]) {
    const d = deferred(); let first = true, signal;
    const app = await pageOf('detail', provider((k, p, o) => {
      if (k === key && first) { first = false; signal = o.signal; return d.promise; }
    })); await settle();
    await app.page.actions['wake.detail.retryResource'](); await settle();
    const body = app.render(); assert.equal(signal.aborted, true);
    if (reject) d.reject(Object.assign(new Error('late private response'), { status: 404 }));
    else d.resolve([]);
    await settle(); assert.equal(app.render(), body);

    const pending = deferred(); let pendingSignal;
    const disposed = await pageOf('detail', provider((k, p, o) => {
      if (k === key) { pendingSignal = o.signal; return pending.promise; }
    })); await settle();
    disposed.hide(); const updates = disposed.updates(); assert.equal(pendingSignal.aborted, true);
    if (reject) pending.reject(new Error('late private response'));
    else pending.resolve([]);
    await settle(); assert.equal(disposed.updates(), updates);
  }
});

test('normal: all declared kinds and tabs render using the fixture cluster', async () => {
  for (const kind of Object.values(KIND_OF)) {
    const p = { ...params, kind: kind.plural, ns: '_all', name: undefined };
    /* Secret은 읽지 않는다(D-01): 목록은 권한 없음으로 그려진다 */
    const rows = kind.plural === 'secrets' ? [] : await cluster.get('resources', p);
    if (kind.plural === 'secrets') await assert.rejects(cluster.get('resources', p), { kind: 'forbidden' });
    const list = await pageOf('list', (key, q, o) => cluster.get(key, q, o), {}, p); await settle(); assert.ok(list.render());
    if (!rows.length || kind.plural === 'events') continue;
    p.name = rows[0].name;
    const detail = await pageOf('detail', (key, q, o) => cluster.get(key, q, o), {}, p); await settle();
    for (const tab of kind.tabs) { detail.page.actions['wake.detail.tab']({ arg: tab }); await settle(); assert.ok(detail.render(), `${kind.plural}/${tab}`); }
  }
});

test('detail: older base resource cannot replace a newer missing result', async () => {
  const first = deferred(), second = deferred(); let n = 0;
  const app = await pageOf('detail', provider(k => k === 'resource' ? (++n === 1 ? first.promise : second.promise) : undefined));
  const retry = app.page.actions['wake.detail.retryResource']();
  second.resolve({ name: params.name, missing: true }); await retry;
  first.resolve(await cluster.get('resource', params)); await settle();
  assert.match(app.render(), new RegExp(ko['wake.flow.c.absent'])); assert.equal(app.page.meta().context.icon, 'status-idle');
});


test('an Event deep link rejects a different UID before fetching related content', async () => {
  const calls = [];
  const route = { ...params, kind: 'events', name: 'pod-event' };
  const app = await pageOf('detail', async key => {
    calls.push(key);
    if (key === 'kind') return KIND_OF.events;
    return { name: route.name, uid: 'replacement', ns: route.ns, type: 'Warning', reason: 'BackOff' };
  }, { uid: 'original' }, route);
  try {
    await settle();
    assert.ok(app.render().includes(ko['wake.ev.identityChanged']));
    assert.doesNotMatch(app.render(), /BackOff/);
    assert.deepEqual(calls, ['kind', 'resource']);
  } finally { app.hide(); }
});

/* ---------- 시뮬레이션 화면으로 옮긴 목록·상세·로그 ---------- */
test('list: a kind table drops a column no row has a value for (no source, no column) and counts the head from the listed rows', async () => {
  const app = await pageOf('list', (key, q, o) => cluster.get(key, q, o), {}, { ...params, kind: 'pods', ns: '_all' }); await settle(); await settle();
  const body = app.render();
  assert.match(body, />Controlled By</); assert.doesNotMatch(body, />QoS</, 'no fixture Pod has a QoS class: the column is left out');
  assert.match(body, />CrashLoopBackOff<\/span><b>1</); assert.match(body, /Last State OOMKilled/);
  assert.match(body, /data-menu="wake.scope.kindMenu"/); assert.doesNotMatch(body, /wake.list.ask/, 'the AI column is gone (8.5)');
});
test('list: usage columns come from the hub (metrics.usage) and are left out when it cannot read them', async () => {
  const get = (key, q, o) => (key === 'usage' ? Promise.resolve({ rows: Object.fromEntries(CLUSTER.OBJECTS.pods.map(p => [`${p.metadata.namespace}/${p.metadata.name}`, { cpu: 12, memory: 64 * 1048576, restarts1h: 1 }])) }) : cluster.get(key, q, o));
  const app = await pageOf('list', get, {}, { ...params, kind: 'pods', ns: '_all' }); await settle(); await settle();
  const body = app.render();
  assert.match(body, />CPU</); assert.match(body, />12m</); assert.match(body, />Memory</); assert.match(body, />64Mi</);
  const plain = await pageOf('list', (key, q, o) => cluster.get(key, q, o), {}, { ...params, kind: 'pods', ns: '_all' }); await settle(); await settle();
  assert.doesNotMatch(plain.render(), />CPU</, 'no usage source, no usage column');
});
test('list: the problem filter and the page size of 20 keep a range row', async () => {
  const app = await pageOf('list', (key, q, o) => cluster.get(key, q, o), {}, { ...params, kind: 'pods', ns: '_all' }); await settle(); await settle();
  assert.match(app.render(), /data-action="wake.rv.page"/);
  app.page.actions['wake.rv.only']({ arg: 'bad' }); await settle();
  assert.doesNotMatch(app.render(), /data-action="wake.rv.page"/); assert.doesNotMatch(app.render(), /inventory-worker-5d8c9-h2k4q/);
});
test('events: rows are one per object and Reason, counted from the same summary as the head (N8)', async () => {
  const app = await pageOf('list', (key, q, o) => cluster.get(key, q, o), {}, { ...params, kind: 'events', ns: '_all' }); await settle(); await settle();
  app.setState({ evRange: { preset: '24h' } }); await settle();
  const body = app.render();
  assert.match(body, /Warning<\/span><b>8</); assert.match(body, /BackOff 64/);
  app.page.actions['wake.ev.group']({ arg: 'reason' }); await settle();
  assert.match(app.render(), /wake.ev.reasonRow/);
});
test('detail: the head has one action, the warning card says why and who manages it, and the summary keeps the rule order', async () => {
  const app = await pageOf('detail', (key, q, o) => cluster.get(key, q, o)); await settle(); await settle();
  const body = app.render();
  assert.match(body, /data-menu="wake.detail.act"/); assert.doesNotMatch(body, /wake.detail.actions/);
  assert.match(body, /Last State OOMKilled · Exit 137 · limits.memory 256Mi/);
  assert.match(body, /Argo CD Application checkout/);
  const at = label => body.indexOf(`aria-label="${label}"`);
  assert.ok(at(ko['wake.detail.status']) < at(ko['wake.kube.containers']) && at(ko['wake.kube.containers']) < at('Conditions') && at('Conditions') < at('Labels'));
});
test('detail: a Deployment synced by Argo CD gets a Draft PR, never a cluster command (N2)', async () => {
  const app = await pageOf('detail', (key, q, o) => cluster.get(key, q, o), {}, { ...params, kind: 'deployments', name: 'checkout-api' }); await settle(); await settle();
  const menu = app.page.menus['wake.detail.act']();
  assert.ok(menu.items.length); assert.ok(menu.items.every(item => item.icon === 'git-pull-request'));
  app.page.actions['wake.detail.plan']({ arg: menu.items[0].arg }); assert.match(app.panels[0].prompt, /Draft PR/); assert.doesNotMatch(app.panels[0].prompt, /kubectl/);
  const plain = await pageOf('detail', (key, q, o) => cluster.get(key, q, o), {}, { ...params, ns: 'payments', kind: 'deployments', name: 'inventory-worker' }); await settle(); await settle();
  assert.ok(plain.page.menus['wake.detail.act']().items.some(item => item.icon === 'terminal'));
});
test('detail logs: a level filter keeps each line its own number and a search keeps the lines around it (N15)', async () => {
  const text = ['INFO a', 'ERROR b', 'INFO c', 'WARN d', 'INFO e', 'ERROR f'].map((l, i) => `2026-11-02T01:1${i}:00Z ${l}`).join('\n');
  const app = await pageOf('detail', provider(k => (k === 'logs' ? Promise.resolve(text) : undefined)), { tab: 'logs' }); await settle(); await settle();
  app.page.actions['wake.log.level']({ arg: 'ERROR' }); await settle();
  const view = () => JSON.stringify([...app.render().matchAll(/class="lgv-n">(\d+)</g)].map(m => Number(m[1])));
  assert.equal(view(), '[2,6]');
  app.page.actions['wake.log.level']({ arg: 'all' }); app.page.actions['wake.log.q']({ value: 'd' }); app.page.actions['wake.log.only']({ arg: 'only' }); app.page.actions['wake.log.around']({ arg: '0' }); await settle();
  assert.equal(view(), '[4]');
});
/* R4-04: 상세 로그 탭이 줄 수 상한(1000줄)까지 받으면 로그 화면과 같은 부분 조회다: 첫 알약 "읽은 줄", 상한을 말하는 알림, 바닥 "읽은 줄 N" */
test('detail logs: lines read up to the line limit are the lines read, said as the logs section says it', async () => {
  const text = Array.from({ length: 1000 }, (_, i) => `2026-11-02T01:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z INFO request ${i}`).join('\n');
  const app = await pageOf('detail', provider(k => (k === 'logs' ? Promise.resolve(text) : undefined)), { tab: 'logs' }); await settle(); await settle();
  const s = app.render(), pills = s.slice(s.indexOf('data-tabs="wake-log-lv"'), s.indexOf('data-tabs="wake-log-lv"') + 600);
  assert.match(pills, new RegExp(`>${ko['wake.log.loaded']}<`), `the first level pill names the lines read, not the whole range: ${pills.slice(0, 300)}`);
  assert.ok(s.includes(ko['wake.log.tailOnly'].replace('{n}', '1,000')), 'the notice names the line limit, as the logs section does');
  /* the footer line in the words of the two locale lines, past the line range: "읽은 줄 {total}" and not "전체 {total}줄" */
  const tailOf = key => ko[key].slice(ko[key].indexOf('{to}') + 4, ko[key].indexOf('{total}'));
  assert.ok(new RegExp(`class="pager-range-n">[^<]*${tailOf('wake.rv.logRangeRead')}`).test(s), 'the footer counts the lines read');
  assert.ok(!new RegExp(`class="pager-range-n">[^<]*${tailOf('wake.rv.logRange')}`).test(s), 'not the whole range');
});

/* R5-02: 상한(1000줄)을 받았는데 구간 밖 줄을 거르고 999줄이 남아도 상한에 닿은 것(백엔드 limitReached). R5-03: 바닥 범위가 보이는 줄 번호와 같다 */
test('detail logs: the line limit counts the lines fetched before the window filter, and the footer range is the lines shown', async () => {
  const text = Array.from({ length: 999 }, (_, i) => `2026-11-02T01:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z INFO request ${i}`).join('\n');
  const app = await pageOf('detail', provider(k => (k === 'logs' ? Promise.resolve({ text, partial: true, limitReached: true }) : undefined)), { tab: 'logs' }); await settle(); await settle();
  const s = app.render();
  assert.ok(s.includes(ko['wake.log.tailOnly'].replace('{n}', '999')), 'the notice names the line limit the read reached, not "partial" alone');
  const shown = [...s.matchAll(/class="lgv-n">(\d+)</g)].map(m => Number(m[1])), range = /class="pager-range-n">([^<]*)</.exec(s)?.[1] ?? '';
  assert.match(range, /\d/, `a footer range: ${s.slice(s.indexOf('pager-range'), s.indexOf('pager-range') + 200)}`);
  const [from, to] = range.match(/[\d,]+/g).map(x => Number(x.replace(/,/g, '')));
  assert.deepEqual([from, to], [shown[0], shown.at(-1)], `footer "${range}" vs lines shown ${shown[0]}–${shown.at(-1)}`);
  app.page.actions['wake.log.page']({ arg: '1' }); await settle();
  const first = app.render(), shown1 = [...first.matchAll(/class="lgv-n">(\d+)</g)].map(m => Number(m[1])), range1 = /class="pager-range-n">([^<]*)</.exec(first)?.[1] ?? '';
  assert.deepEqual(range1.match(/[\d,]+/g).slice(0, 2).map(x => Number(x.replace(/,/g, ''))), [shown1[0], shown1.at(-1)], `first page footer "${range1}" vs ${shown1[0]}–${shown1.at(-1)}`);
});

/* R5-03: 가장 최근 쪽은 끝에서 20줄(980–999)인데 바닥이 앞에서 센 쪽(981–999)을 말했다. 앱의 t처럼 변수 없는 글은 자리 표시를 그대로 둔다 */
test('log card footer range names the line numbers the page shows on every page', () => {
  const kt = (key, vars) => { const s = ko[key] ?? key; return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s; };
  const all = parseLogs(Array.from({ length: 999 }, (_, i) => `2026-11-02T01:00:00Z INFO request ${i}`).join('\n'));
  for (const page of [null, 49, 1]) {
    const st = { q: '', level: 'all', only: false, around: 2, page, ts: true, wrap: false, previous: null, follow: false };
    const html = String(logCard(kt, st, logModel(all, st), { name: 'api' }, 'app', { partial: true }));
    const shown = [...html.matchAll(/class="lgv-n">(\d+)</g)].map(m => Number(m[1])), range = /class="pager-range-n">([^<]*)</.exec(html)?.[1] ?? '';
    assert.deepEqual((range.match(/[\d,]+/g) ?? []).slice(0, 2).map(x => Number(x.replace(/,/g, ''))), [shown[0], shown.at(-1)], `page ${page}: footer "${range}" vs lines ${shown[0]}–${shown.at(-1)}`);
  }
});


/* B1: 관측 연결 묶음이 없어도 홈과 같은 출처(클러스터 안 Prometheus, 허브 metricSeries)로 그 컨테이너를 읽는다.
   이전에는 홈이 값을 보이는 같은 세션에서 상세만 "Prometheus 연결 안 됨"이었다. 그 출처도 연결 안 됨일 때만 연결 안 됨 */
test('detail metrics: without an observability connection the Pod is read from the cluster Prometheus the home reads', async () => {
  const native = async name => { if (name === 'observability.catalog') return { status: 'unconfigured', connections: [] }; throw Object.assign(new Error('no'), { kind: 'unconfigured' }); };
  const asked = [];
  /* as Prometheus answers a range: points on the step grid from the second the window starts in, rounded down (the first can sit before the window) */
  const series = p => { asked.push({ series: p.series, target: p.target }); const a = Math.floor(p.from / 1000), mid = a + p.step, b = Math.floor(p.to / 1000);
    const v = p.series === 'pod.mem' ? ['125829120', '134217728', '150994944'] : ['200', '250', '300'];
    return Promise.resolve({ series: p.series, step: p.step, unit: '', range: { from: p.from, to: p.to }, result: [{ metric: {}, values: [[a, v[0]], [mid, v[1]], [b, v[2]]] }] }); };
  const app = await pageOf('detail', provider((key, p) => (key === 'metricSeries' ? series(p) : undefined)), {}, params, native);
  for (let i = 0; i < 6; i++) await settle();
  const html = app.render();
  assert.doesNotMatch(html, new RegExp(ko['wake.view.toolOff'].replace('{tool}', 'Prometheus')), 'not "not connected" while the cluster Prometheus answers');
  assert.ok(asked.some(x => x.series === 'pod.cpu' && !x.target.container && x.target.pod === params.name && x.target.namespace === params.ns), JSON.stringify(asked)); /* the Pod's total (A2-25) */
  assert.ok(asked.some(x => x.series === 'pod.mem') && asked.some(x => x.series === 'pod.net.rx') && asked.some(x => x.series === 'pod.net.tx'));
  assert.match(html, /300m/, 'the CPU head reads the last point in millicores');
  const charts = unpack(app.render()); 
  assert.ok(charts.length >= 3 && charts.every(chart => chart.series?.some(s => s.observations?.length >= 2)), 'each group draws its line from the hub points inside the window');
  /* the same source not connected: then, and only then, the metrics say so */
  const off = await pageOf('detail', provider(key => (key === 'metricSeries' ? Promise.reject(Object.assign(new Error('off'), { kind: 'unconfigured' })) : undefined)), {}, params, native);
  for (let i = 0; i < 6; i++) await settle();
  assert.match(off.render(), new RegExp(ko['wake.view.toolOff'].replace('{tool}', 'Prometheus')));
});

/* B1: 지표 일부만 실패하면 그 그룹이 실패를 말한다(시간 초과·권한 없음·조회 실패는 "수집 없음"이 아님), 답한 지표는 그대로. Network는 수신·송신 한쪽만 실패해도 드러난다 */
test('detail metrics: a failed read is named in its own group while the reads that answered stay', async () => {
  const native = async name => { if (name === 'observability.catalog') return { status: 'unconfigured', connections: [] }; throw Object.assign(new Error('no'), { kind: 'unconfigured' }); };
  const fail = kind => Promise.reject(Object.assign(new Error(kind), { kind, source: 'prometheus' }));
  const series = p => {
    if (p.series === 'pod.cpu') return fail('timeout');
    if (p.series === 'pod.net.tx') return fail('forbidden');
    const a = Math.ceil(p.from / 1000), b = Math.floor(p.to / 1000);
    return Promise.resolve({ series: p.series, step: p.step, range: { from: p.from, to: p.to }, result: [{ metric: {}, values: [[a, '1048576'], [b, '2097152']] }] });
  };
  const app = await pageOf('detail', provider((key, p) => (key === 'metricSeries' ? series(p) : undefined)), {}, params, native);
  for (let i = 0; i < 8; i++) await settle();
  const html = app.render(), part = (from, to) => html.slice(html.indexOf(`aria-label="${from}"`), to ? html.indexOf(`aria-label="${to}"`) : undefined);
  const strip = x => x.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const cpu = strip(part('CPU', 'Network')), net = strip(part('Network', ko['wake.kube.containers'])), mem = strip(part(ko['wake.metric.memory'], 'CPU'));
  assert.match(cpu, new RegExp(ko['wake.monitor.status.timeout'])); assert.doesNotMatch(cpu, new RegExp(ko['wake.rv.noSample']), 'a timeout is not "no samples"');
  assert.match(net, new RegExp(`${ko['wake.rv.tx']} ${ko['wake.monitor.status.forbidden']}`), 'the transmit side says it was denied');
  assert.match(net, /2 MiB\/s/, 'and the receive side that answered stays');
  assert.match(mem, /2Mi/, 'memory answered and stays');
});

/* H-009 수정 2회차: 닫힌 지표 막대가 이름과 지금 값 하나만 보이던 결함. 이미 읽은 값(같은 시리즈, 컨테이너 resources)만으로 기간 최고·requests·limits·limits 대비를
   이름-값 칸으로 보이고, Network는 수신·송신을 나눈다. 없는 값은 칸을 두지 않는다. 상태 톤은 값 칸 하나에만(RULE-TONE) */
test('detail metrics: closed rows show the range peak, requests, limits and use of limits, and network in and out, from the values already read', async () => {
  const native = async name => { if (name === 'observability.catalog') return { status: 'unconfigured', connections: [] }; throw Object.assign(new Error('no'), { kind: 'unconfigured' }); };
  const V = { 'pod.mem': ['125829120', '150994944', '134217728'], 'pod.cpu': ['200', '320', '300'], 'pod.net.rx': ['3277', '3277', '3277'], 'pod.net.tx': ['300', '300', '300'] };
  const series = p => { const a = Math.ceil(p.from / 1000), b = Math.floor(p.to / 1000), mid = Math.round((a + b) / 2), v = V[p.series];
    return Promise.resolve({ series: p.series, step: p.step, range: { from: p.from, to: p.to }, result: [{ metric: {}, values: [[a, v[0]], [mid, v[1]], [b, v[2]]] }] }); };
  const app = await pageOf('detail', provider((key, p) => (key === 'metricSeries' ? series(p) : undefined)), {}, params, native);
  for (let i = 0; i < 8; i++) await settle();
  try {
    const html = app.render(), part = (from, to) => html.slice(html.indexOf(`aria-label="${from}"`), to ? html.indexOf(`aria-label="${to}"`) : undefined);
    const head = x => x.slice(0, x.search(/<\/summary>/)), strip = x => x.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const mem = head(part(ko['wake.metric.memory'], 'CPU')), cpu = head(part('CPU', 'Network')), net = head(part('Network', ko['wake.kube.containers']));
    const peak = ko['wake.metric.rangePeak'].replace('{range}', kitKo['timeRange.preset.1h']);
    for (const [row, want] of [[mem, [`${peak} 144Mi`, 'requests 128Mi', 'limits 256Mi', `${ko['wake.metric.ofLimits']} 50%`]], [cpu, [`${peak} 320m`, 'requests 250m', 'limits 500m', `${ko['wake.metric.ofLimits']} 60%`]]])
      for (const w of want) assert.match(strip(row), new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${w} in ${strip(row)}`);
    /* a small rate reads in its own unit, never "0.00MiB/s" (the network view's byte-rate formatter) */
    assert.match(strip(net), new RegExp(`${ko['wake.rv.rx']} 3.2 KiB/s`)); assert.match(strip(net), new RegExp(`${ko['wake.rv.tx']} 300 B/s`)); assert.doesNotMatch(strip(net), /MiB\/s/);
    /* the same order and the same fold priority in Memory and CPU: now | range peak | requests | limits | of limits, folding from the end (of limits first) */
    for (const row of [mem, cpu]) {
      const cells = [...row.matchAll(/class="sbar-item[^"]*"([^>]*)data-key="\[&quot;summary-bar&quot;,&quot;(\w+)&quot;\]"/g)].map(m => [m[2], +(m[1].match(/data-prio="(\d+)"/)?.[1] ?? 0)]);
      assert.deepEqual(cells.map(c => c[0]), ['t', 'v', 'p', 'q', 'l', 'u']);
      assert.deepEqual(cells.slice(1).map(c => c[1]), [5, 4, 3, 2, 1], 'the peak stays before requests, limits and of limits');
    }
    assert.doesNotMatch(strip(mem), new RegExp(`${peak} 144Mi ·`), 'the peak cell is the value, as on the home rows (no time beside it)');
    assert.equal((cpu.match(/data-tone=/g) || []).length, 1, 'the state is said once, on the value (300m over its 250m request)');
    /* A3-07: the legend draws each level in its line's colour: requests is the quiet line (muted), limits the warning one */
    const memBody = part(ko['wake.metric.memory'], 'CPU');
    assert.match(memBody, /border-top-color:var\(--muted-foreground\)"><\/i>requests 128Mi/, 'requests in the colour of its line');
    assert.match(memBody, /border-top-color:var\(--chart-limit\)"><\/i>limits 256Mi/, 'limits in the colour of its line');
  } finally { app.hide(); }
});

/* polish 넘김(A-26, handoff-tables.md): 컨테이너 표의 Restarts는 공용 restartsColumn(kubectl "n (경과 ago)", 0보다 크면 숫자만 주의 톤, 사유는 툴팁), 한 셀에 숫자 하나 */
test('detail: the container table counts restarts the kubectl way, warning tone on the figure only, the last state in its tip', async () => {
  const app = await pageOf('detail', (key, q, o) => cluster.get(key, q, o)); await settle(); await settle();
  try {
    const body = app.render(), table = body.slice(body.indexOf(`aria-label="${ko['wake.kube.containers']}"`));
    const cell = table.match(/<td class="[^"]*num[^"]*"[^>]*data-tone="warn"[^>]*>([^<]*)<\/td>/);
    assert.ok(cell, 'a restarted container shows its count in the warning tone');
    assert.match(cell[1], /^\d+ \(\d+[smhd]\w* ago\)$/);
    assert.match(cell[0], /data-tip="Last State: OOMKilled · Finished: /);
  } finally { app.hide(); }
});

/* N12·YAML 머리 값 결정: 리소스 YAML은 긴 줄을 접고(맨 아래에만 있는 가로 막대 없음), 이벤트 YAML 머리 값은 종류를 되풀이하지 않고 그 객체의 resourceVersion */
test('detail: the resource YAML wraps long lines', async () => {
  const app = await pageOf('detail', provider(k => (k === 'yaml' ? Promise.resolve(`metadata:\n  annotations:\n    long: ${'x'.repeat(400)}\n`) : undefined)), { tab: 'yaml' });
  try { await settle(); await settle(); assert.match(app.render(), /class="cb[^"]*\bwrap\b/); } finally { app.hide(); }
});
test('detail: the event YAML head shows its resourceVersion, never the kind again', async () => {
  const route = { ...params, kind: 'events', name: 'pod-event' };
  const app = await pageOf('detail', async key => (key === 'kind' ? KIND_OF.events : key === 'resource' ? { name: route.name, uid: 'e1', ns: route.ns, type: 'Warning', reason: 'BackOff', raw: { kind: 'Event', metadata: { name: route.name, uid: 'e1', resourceVersion: '48213' } } } : undefined), { uid: 'e1' }, route);
  try {
    await settle(); await settle();
    const body = app.render(), head = body.slice(body.indexOf('aria-label="YAML"'), body.indexOf('class="cb'));
    assert.match(head, /resourceVersion/); assert.match(head, />48213</); assert.doesNotMatch(head, />Event</);
  } finally { app.hide(); }
});

/* H-009 수정 1회차: 상세 머리의 상태는 이름 옆에 한 번만(RULE-TONE). 상태 막대 첫 칸에 같은 상태 아이콘을 다시 두지 않는다 */
test('detail: the resource status is shown once beside the name, never again in the first status bar cell', async () => {
  for (const p of [{ ...params, name: 'checkout-api-7cf98-d9m2p' }, params, { ...params, kind: 'deployments', name: 'checkout-api' }, { ...params, kind: 'deployments', name: 'inventory-worker' }]) {
    const app = await pageOf('detail', (key, q, o) => cluster.get(key, q, o), {}, p); await settle(); await settle();
    const body = app.render(), bar = body.slice(body.indexOf(`aria-label="${ko['wake.detail.status']}"`));
    assert.ok(body.includes(`aria-label="${ko['wake.detail.status']}"`), `${p.kind}/${p.name} has a status bar`);
    assert.doesNotMatch(bar.split(/<\/summary>|<\/div><\/div>/)[0], /data-c="status-icon"/, `${p.kind}/${p.name}: no status mark in the status bar`);
    assert.doesNotMatch(body, /summary-bar&quot;,&quot;st&quot;/);
  }
});

/* 출시 검수 수정 1차 */
const dep = name => ({ ...params, kind: 'deployments', name });
const ready = async () => { for (let i = 0; i < 6; i++) await settle(); };
test('detail_read_failure_names_its_cause', async () => {
  const error = new Error("Error invoking remote method 'kit:service:call': Error: kubernetes API request failed (HTTP 503)");
  const app = await pageOf('detail', provider(k => (k === 'resource' ? Promise.reject(error) : undefined))); await ready();
  assert.match(app.render(), /HTTP 503/, 'a failed read says why (RULE-STATE)'); app.hide();
});
test('detail_argo_band_reads_auto_sync_from_the_application', async () => {
  const gitops = { repos: [{ id: 'r', apps: [{ cluster: params.cluster, name: 'checkout', ns: 'payments', auto: true, sourceIdentity: { namespace: 'argocd', name: 'checkout' } }] }] };
  const app = await pageOf('detail', provider(k => (k === 'gitops' ? Promise.resolve(gitops) : undefined))); await ready();
  assert.ok(app.render().includes(ko['wake.rv.managed'].replace('{name}', 'checkout').replace('{state}', ko['wake.rv.syncOn'])), 'Argo CD band names the read sync policy'); app.hide();
});
test('detail_workload_events_include_owned_pods_with_object', async () => {
  const app = await pageOf('detail', provider(() => undefined), { tab: 'events' }, dep('checkout-api')); await ready();
  const body = app.render();
  assert.match(body, /BackOff/, 'the owned Pod warning is in the Deployment events');
  assert.match(body, /Pod\/checkout-api-7cf98-p4x2m/, 'the row names its object');
  assert.doesNotMatch(body, /billing-api-7bd4f/, 'another workload\'s Pod events stay out'); app.hide();
});
test('detail_children_loading_shows_no_developer_wording_and_keeps_pod_card', async () => {
  const d = deferred();
  const app = await pageOf('detail', provider(k => (k === 'relationships' ? d.promise : undefined)), {}, { ...dep('session-gateway'), ns: 'platform' }); await ready();
  assert.ok(!app.render().includes(ko['wake.detail.owner.childrenUnverified']), 'no ownership wording while the relation is read');
  assert.ok(!/Child ownership|Reference identity|lookup unsupported/.test([en['wake.detail.owner.childrenUnverified'], en['wake.detail.owner.incomplete'], en['wake.detail.owner.unsupported']].join('\n')), 'user wording, not developer wording');
  d.resolve(await cluster.get('relationships', { ...dep('session-gateway'), ns: 'platform', uid: 'uid-session-gateway' }));
  assert.match(app.render(), /class="sbar-n">Pod<\/span><b><[^>]*class="skel"/, 'the Pod card waits as a skeleton'); await ready();
  assert.match(app.render(), /aria-label="Pod"/, 'the Pod card is there once read'); app.hide();
});
test('detail_relations_show_replicaset_and_related_resources', async () => {
  const deployment = await pageOf('detail', provider(() => undefined), { tab: 'relations' }, dep('checkout-api')); await ready();
  const graph = relationGraph(deployment);
  assert.ok(graph.nodes.some(node => node.label === 'checkout-api-7cf98'), 'Deployment → ReplicaSet → Pod');
  const body = deployment.render();
  for (const name of ['checkout-api-7cf98', 'checkout']) assert.ok(body.includes(`>${name}<`) || body.includes(`"${name}"`), `related table lists ${name}`);
  assert.match(body, /Ingress/); assert.match(body, /Service/); deployment.hide();
  const pod = await pageOf('detail', provider(() => undefined), { tab: 'relations' }); await ready();
  const podBody = pod.render();
  assert.match(podBody, /worker-b/, 'the Pod\'s Node'); assert.match(podBody, /Service/, 'the Service selecting the Pod'); pod.hide();
});

/* 관련 탭 정리: 표 머리는 다른 표와 같은 말(Kind · Name · … · Status), 관계 값과 흐름 부제는 사람 말(필드 이름 아님),
   HPA는 짧은 종류 이름, 관련 탭 아래 "관련" 카드 제목을 다시 쓰지 않는다 */
test('detail_related_tab_speaks_in_table_words_and_relation_words_not_field_names', async () => {
  const hpa = { name: 'checkout-api', ns: 'payments', uid: 'uid-hpa', reference: 'Deployment/checkout-api', status: ['ok', 'Normal'] };
  const deployment = await pageOf('detail', provider((key, p) => (key === 'resources' && p.kind === 'horizontalpodautoscalers' ? Promise.resolve([hpa]) : undefined)), { tab: 'relations' }, dep('checkout-api')); await ready();
  try {
    const body = deployment.render(), table = body.slice(body.indexOf('data-key="d-related"') > 0 ? body.indexOf('data-key="d-related"') : body.lastIndexOf('<table'));
    const heads = [...table.matchAll(/<th class="[^"]*"[^>]*>([^<]*)</g)].map(m => m[1]).slice(0, 4);
    assert.deepEqual(heads, ['Kind', 'Name', ko['wake.rv.relation'], 'Status'], 'the header words of the other tables');
    for (const field of ['ownerReferences', 'scaleTargetRef', 'backend.service', '>selector<']) assert.ok(!body.includes(field), `no field name: ${field}`);
    assert.ok(body.includes('>HPA<') && !body.includes('>HorizontalPodAutoscaler<'), 'the short kind name');
    assert.ok(!body.includes(`class="card-t">${ko['wake.detail.relations']}`), 'no second "related" title under the related tab');
  } finally { deployment.hide(); }
});

/* 출시 직전 화면 다듬기: 워크로드·Node 상세의 지표 줄(A-11, D-USR-2026-11-18-2), Node 머리의 Ready·스케줄(A-12), PVC 사용량(A-18), 상세 기간 7일(A-29), 중복 수·제목(A-33) */
const detailRows = html => { const strip = x => x.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(), part = (from, to) => html.slice(html.indexOf(`aria-label="${from}"`), to && html.indexOf(`aria-label="${to}"`, html.indexOf(`aria-label="${from}"`)) > 0 ? html.indexOf(`aria-label="${to}"`, html.indexOf(`aria-label="${from}"`)) : undefined);
  const head = x => x.slice(0, x.search(/<\/summary>|<\/div><\/div>/)); return { row: (from, to) => strip(head(part(from, to))), cells: (from, to) => [...head(part(from, to)).matchAll(/data-key="\[&quot;summary-bar&quot;,&quot;(\w+)&quot;\]"/g)].map(m => m[1]) }; };
const flatSeries = values => p => { const a = Math.ceil(p.from / 1000), b = Math.floor(p.to / 1000), mid = Math.round((a + b) / 2), v = values(p);
  return v ? Promise.resolve({ series: p.series, step: p.step, range: { from: p.from, to: p.to }, result: [{ metric: {}, values: [[a, v[0]], [mid, v[1]], [b, v[2]]] }] }) : undefined; };
test('detail_workload_reads_one_summed_series_per_metric_for_all_its_pods_like_the_pod_detail', async () => {
  const asked = [];
  const series = flatSeries(p => { asked.push(p); return p.series === 'workload.cpu' ? ['300', '450', '360'] : p.series === 'workload.mem' ? [String(300 * 1048576), String(384 * 1048576), String(360 * 1048576)] : null; });
  const app = await pageOf('detail', provider((key, p) => (key === 'metricSeries' ? series(p) : undefined)), {}, dep('inventory-worker')); for (let i = 0; i < 10; i++) await settle();
  try {
    const html = app.render(), { row, cells } = detailRows(html), peak = ko['wake.metric.rangePeak'].replace('{range}', kitKo['timeRange.preset.1h']);
    assert.match(html, /data-c="time-range"/, 'the range control is on the summary like the Pod detail');
    const cpu = row('CPU', ko['wake.metric.memory'] === 'CPU' ? null : 'Pod'), mem = row(ko['wake.metric.memory'], 'CPU');
    for (const w of ['360m', `${peak} 450m`, 'requests 750m', 'limits 1500m', `${ko['wake.metric.ofLimits']} 24%`]) assert.ok(cpu.includes(w), `${w} in ${cpu}`);
    for (const w of ['360Mi', `${peak} 384Mi`, 'requests 384Mi', 'limits 768Mi', `${ko['wake.metric.ofLimits']} 47%`]) assert.ok(mem.includes(w), `${w} in ${mem}`);
    assert.deepEqual(cells('CPU', 'Pod'), ['t', 'v', 'p', 'q', 'l', 'u'], 'the same cells as the Pod detail');
    /* one aggregated series per metric (the hub sums every owned pod), never a read per pod nor a cap on the pods summed */
    assert.deepEqual(asked.map(x => [x.series, JSON.stringify(x.target)]).sort(), [['workload.cpu', '{"namespace":"payments","workload":"deployments","name":"inventory-worker"}'], ['workload.mem', '{"namespace":"payments","workload":"deployments","name":"inventory-worker"}']]);
    assert.ok(!asked.some(x => /^pod\./.test(x.series)), 'no per-pod read');
    assert.ok(!/Pod 30/.test(html), 'no note that only some pods were summed');
  } finally { app.hide(); }
});
test('detail_node_shows_cpu_memory_and_pods_against_allocatable_and_fills_the_used_column', async () => {
  const series = flatSeries(p => (p.series === 'node.cpu' ? ['40', '50', '25'] : p.series === 'node.mem' ? ['50', '60', '40'] : null));
  const withCapacity = (key, p, o) => key === 'resource' && p.kind === 'nodes' ? cluster.get(key, p, o).then(r => ({ ...r, raw: { ...r.raw, status: { ...r.raw.status, capacity: { cpu: '4', memory: '16Gi', pods: '110' }, allocatable: { ...r.raw.status.allocatable, pods: '110' } } } })) : undefined;
  const node = { ...params, kind: 'nodes', ns: '_all', name: 'worker-a' };
  const app = await pageOf('detail', provider((key, p, o) => (key === 'metricSeries' ? series(p) : withCapacity(key, p, o))), {}, node); for (let i = 0; i < 10; i++) await settle();
  try {
    const html = app.render(), { row, cells } = detailRows(html), peak = ko['wake.metric.rangePeak'].replace('{range}', kitKo['timeRange.preset.1h']);
    const cpu = row('CPU', 'Pod'), mem = row(ko['wake.metric.memory'], 'CPU');
    for (const w of ['1000m', `${peak} 2000m`, 'requests 1500m', 'allocatable 4000m', `${ko['wake.metric.ofAllocatable']} 25%`]) assert.ok(cpu.includes(w), `${w} in ${cpu}`);
    for (const w of ['6,554Mi', 'requests 768Mi', 'allocatable 15,360Mi', `${ko['wake.metric.ofAllocatable']} 43%`]) assert.ok(mem.includes(w), `${w} in ${mem}`);
    assert.deepEqual(cells('CPU', 'Pod'), ['t', 'v', 'p', 'q', 'l', 'u'], 'the Pod detail\'s cells, allocatable in the place of limits');
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    assert.ok(new RegExp(`Pod 9 ${ko['wake.rv.bad']} \\d+ Restarts \\d+ allocatable 110 ${ko['wake.metric.ofAllocatable']} 5%`).test(text), `the pods placed on it against the pods it may hold, on the one Pod card: ${text}`);
    assert.equal((text.match(/ Pod \d+ /g) || []).length, 1, 'the pod count is said once (one Pod row, not a second metric row); the share counts the 6 pods still placed on it, as the scheduler does');
    const capacity = html.slice(html.indexOf('aria-label="Capacity"')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    assert.match(capacity, /cpu 4,000m 1,000m/, 'the used column reads the CPU in use, in the unit of its allocatable'); assert.match(capacity, /memory 15GiB 6\.4GiB/, 'and the memory in use');
  } finally { app.hide(); }
});
test('detail_node_head_names_ready_and_cordon_beside_the_name', async () => {
  const head = async name => { const app = await pageOf('detail', provider(() => undefined), {}, { ...params, kind: 'nodes', ns: '_all', name }); await ready(); const html = app.render(); app.hide();
    return html.slice(0, html.search(/<\/h1>/) > 0 ? html.indexOf('data-c="list-toolbar"') : 2000); };
  const cordoned = await head('worker-d');
  assert.match(cordoned, /Ready · SchedulingDisabled/, 'a cordoned Ready node says both beside its name');
  const ready0 = await head('worker-a');
  assert.match(ready0, /aria-label="Ready"|label="Ready"/, 'a Ready schedulable node: the ok mark named Ready');
});
test('detail_pvc_shows_its_use_from_kubelet_volume_stats_or_why_not', async () => {
  const pvc = { apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: { name: 'data-orders-db-0', namespace: 'payments', uid: 'uid-pvc', creationTimestamp: new Date(Date.now() - 86400000).toISOString() }, spec: { storageClassName: 'standard', accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '10Gi' } }, volumeName: 'pv-1' }, status: { phase: 'Bound', capacity: { storage: '10Gi' } } };
  CLUSTER.OBJECTS.persistentvolumeclaims = [pvc];
  const route = { ...params, kind: 'persistentvolumeclaims', name: 'data-orders-db-0' };
  try {
    const usage = { rows: { 'payments/data-orders-db-0': { used: 9.1 * 1024 ** 3, usedPct: 91 } } };
    const app = await pageOf('detail', provider(key => (key === 'usage' ? Promise.resolve(usage) : undefined)), {}, route); await ready();
    const body = app.render().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    assert.ok(body.includes(`91% ${ko['wake.rv.used']} 9.1Gi Capacity 10Gi`), `use, used and the claim capacity in the unit of the claim's own quantity (the head reads Capacity 10Gi) in ${body}`); assert.doesNotMatch(body, new RegExp(`${ko['wake.detail.configuration']} 3`), 'no bare count on the configuration card'); app.hide();
    const off = await pageOf('detail', provider(() => undefined), {}, route); await ready();
    assert.ok(off.render().includes(ko['wake.view.toolOff'].replace('{tool}', 'Prometheus')), 'no use read: the reason, never a blank or 0'); off.hide();
  } finally { delete CLUSTER.OBJECTS.persistentvolumeclaims; }
});
test('detail_range_offers_the_seven_day_preset_of_the_common_range', async () => {
  const app = await pageOf('detail', provider(() => undefined), { tab: 'events' }, dep('inventory-worker')); await ready();
  try { const html = app.render(), range = html.slice(html.indexOf('data-c="time-range"'));
    assert.ok(html.includes('data-c="time-range"'), 'the events tab has the range'); assert.match(range.slice(0, 4000), /data-arg="[^"]*7d/, 'the common presets end with 7 days (RULE-RANGE)'); } finally { app.hide(); }
});
test('detail_heads_count_once_and_name_cards_in_user_words', async () => {
  const cm = await pageOf('detail', provider(() => undefined), {}, { ...params, kind: 'configmaps', name: 'checkout-config' }); await ready();
  const body = cm.render(); cm.hide();
  assert.equal((body.match(/>Data</g) || []).length, 1, 'the key count is said once (the Data card), not again in the status bar');
  const d = await pageOf('detail', provider(() => undefined), {}, dep('inventory-worker')); await ready();
  const labels = d.render(); d.hide(); const head = labels.slice(labels.indexOf('aria-label="Labels"'), labels.indexOf('aria-label="Labels"') + labels.slice(labels.indexOf('aria-label="Labels"')).search(/<\/summary>/));
  assert.equal((head.match(/>Labels</g) || []).length, 1, 'the Labels card does not repeat its name as a cell');
});

/* 출시 검수 수정 3차(A2) */
const unconfiguredNative = async name => { if (name === 'observability.catalog') return { status: 'unconfigured', connections: [] }; throw Object.assign(new Error('no'), { kind: 'unconfigured' }); };
/* A2-03: Pod 상세 Network 그래프의 축 단위는 값에서 고른다(네트워크 화면과 같은 rateUnit): 수 KiB/s가 MiB/s 축의 0.0006으로 읽히지 않음 */
test('detail_pod_network_chart_axis_unit_follows_the_data_like_the_network_view', async () => {
  const V = { 'pod.mem': ['125829120', '150994944', '134217728'], 'pod.cpu': ['200', '320', '300'], 'pod.net.rx': ['3277', '2048', '3277'], 'pod.net.tx': ['300', '600', '300'] };
  const series = flatSeries(p => V[p.series]);
  const app = await pageOf('detail', provider((key, p) => (key === 'metricSeries' ? series(p) : undefined)), {}, params, unconfiguredNative); for (let i = 0; i < 8; i++) await settle();
  try {
    const net = unpack(app.render()).find(chart => chart.id === 'detail:network');
    assert.ok(net, 'the network chart is drawn');
    assert.equal(net.unit, 'KiB/s', 'the axis names its unit, picked from the largest value');
    assert.deepEqual(net.series[0].observations.map(o => Math.round(o.value * 10) / 10), [3.2, 2, 3.2], 'the values are in that unit');
  } finally { app.hide(); }
});

/* A2-10: 워크로드 지표 읽기 실패는 원인을 말하고(HTTP 400 · 시간 초과), 닫힌 머리와 편 본문이 같은 글(본문이 "수집 없음"으로 바뀌지 않음) */
test('detail_workload_metric_failure_names_its_cause_the_same_in_the_head_and_the_body', async () => {
  const fail = p => Promise.reject(Object.assign(new Error('hub read failed: http_400'), { kind: 'http_400', source: 'prometheus', series: p.series }));
  const app = await pageOf('detail', provider((key, p) => (key === 'metricSeries' ? fail(p) : undefined)), {}, dep('inventory-worker')); for (let i = 0; i < 10; i++) await settle();
  try {
    const html = app.render(), strip = x => x.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const block = html.slice(html.indexOf(`aria-label="${ko['wake.metric.memory']}"`), html.indexOf('aria-label="CPU"'));
    const head = strip(block.slice(0, block.search(/<\/summary>/))), body = strip(block.slice(block.search(/<\/summary>/)));
    assert.ok(head.includes('HTTP 400'), `the head names the cause: ${head}`);
    assert.ok(!body.includes(ko['wake.rv.noSample']), `a failed read is not "no samples" in the body: ${body}`);
    assert.ok(body.includes('HTTP 400'), `the body says what the head says: ${body}`);
  } finally { app.hide(); }
});

/* A2-25: Pod의 Memory·CPU는 첫 컨테이너가 아니라 Pod 합계(머리 값·requests·limits), 편 그래프에 컨테이너별 선 */
test('detail_pod_metrics_read_the_pod_total_with_each_container_in_the_open_chart', async () => {
  const base = CLUSTER.OBJECTS.pods.find(p => p.metadata.name === 'checkout-api-7cf98-d9m2p'), two = structuredClone(base);
  two.metadata.name = 'checkout-api-7cf98-two1'; two.metadata.uid = 'uid-two1';
  two.spec.containers.push({ name: 'proxy', image: 'envoy:1.31', resources: { requests: { cpu: '100m', memory: '64Mi' }, limits: { cpu: '200m', memory: '128Mi' } } });
  two.status.containerStatuses.push({ ...structuredClone(two.status.containerStatuses[0]), name: 'proxy' });
  CLUSTER.OBJECTS.pods.push(two);
  const asked = [], MI = 1048576;
  const V = { 'pod.mem': [300, 320, 310].map(x => String(x * MI)), 'pod.cpu': ['300', '350', '330'], 'container.mem:checkout-api': [200, 210, 205].map(x => String(x * MI)), 'container.mem:proxy': [100, 110, 105].map(x => String(x * MI)),
    'container.cpu:checkout-api': ['0.2', '0.25', '0.23'], 'container.cpu:proxy': ['0.1', '0.1', '0.1'], 'pod.net.rx': ['10', '10', '10'], 'pod.net.tx': ['10', '10', '10'] };
  const series = flatSeries(p => { asked.push(p); return V[p.target.container ? `${p.series}:${p.target.container}` : p.series]; });
  const route = { ...params, name: two.metadata.name };
  try {
    const app = await pageOf('detail', provider((key, p) => (key === 'metricSeries' ? series(p) : undefined)), {}, route, unconfiguredNative); for (let i = 0; i < 8; i++) await settle();
    const html = app.render(), { row } = detailRows(html); app.hide();
    assert.ok(asked.some(x => x.series === 'pod.mem' && !x.target.container) && asked.some(x => x.series === 'pod.cpu' && !x.target.container), `the pod total is read: ${JSON.stringify(asked.map(x => [x.series, x.target.container]))}`);
    const mem = row(ko['wake.metric.memory'], 'CPU'), cpu = row('CPU', 'Network');
    for (const w of ['310Mi', 'requests 192Mi', 'limits 384Mi']) assert.ok(mem.includes(w), `${w} in ${mem}`);
    for (const w of ['330m', 'requests 350m', 'limits 700m']) assert.ok(cpu.includes(w), `${w} in ${cpu}`);
    const chart = unpack(html).find(c => c.id === 'detail:memory');
    assert.deepEqual(chart.series.map(s => s.name), [two.metadata.name, 'checkout-api', 'proxy'], 'the pod total first, then each container');
  } finally { CLUSTER.OBJECTS.pods.pop(); }
});

/* A2-16: Deployment → ReplicaSet 띠도 ReplicaSet → Pod 띠처럼 지나는 Pod 수를 말하고 같은 굵기 규칙을 쓴다(빈 얇은 띠가 아님) */
test('detail_deployment_to_replicaset_band_counts_the_pods_it_carries_like_the_next_band', async () => {
  const app = await pageOf('detail', provider(() => undefined), { tab: 'relations' }, dep('inventory-worker')); await ready();
  try {
    const graph = relationGraph(app), set = graph.nodes.find(n => n.label === 'inventory-worker-5d8c9');
    const into = graph.links.find(l => l.to === set.id), out = graph.links.filter(l => l.from === set.id);
    assert.equal(into.value, '3', `the Deployment band carries the set's 3 pods: ${JSON.stringify(into)}`);
    assert.equal(into.size, out.reduce((s, l) => s + l.size, 0), 'and is as thick as the bands leaving the set');
  } finally { app.hide(); }
});

/* A2-22: 이름을 찾으면 이름이 같은 행이 맨 위, 다음 그 말로 시작하는 행, 다음 들어 있는 행(같은 순위 안에서는 기본 순서: 문제 먼저) */
test('list_name_search_puts_the_exact_name_first_then_names_starting_with_it', async () => {
  const rows = [{ uid: '1', name: 'checkout-api-canary', ns: 'a', status: ['danger', 'CrashLoopBackOff'] }, { uid: '2', name: 'legacy-checkout-api', ns: 'a', status: ['danger', 'Error'] },
    { uid: '3', name: 'checkout-api', ns: 'a', status: ['ok', 'Running'] }, { uid: '4', name: 'checkout-api-v2', ns: 'a', status: ['ok', 'Running'] }];
  const app = await pageOf('list', provider(key => key === 'resources' ? Promise.resolve(rows) : undefined), {}, { ...params, ns: '_all' });
  await settle(); await settle();
  app.page.actions['kit.composer.send']({ id: 'wake-scope', text: 'checkout-api' }); await settle(); await settle();
  const names = [...app.render().matchAll(/class="dt-lead-t"[^>]*>([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(names, ['checkout-api', 'checkout-api-canary', 'checkout-api-v2', 'legacy-checkout-api']); app.hide();
});

/* A3-10: a Pod's relation graph wrote "Running" on its last band and nothing on the Deployment band: every band counts the Pods it carries (this one),
   like the workload graph's bands; the Pod's own state stays under its name */
test('detail_pod_relation_bands_count_the_pod_they_carry_like_the_workload_graph', async () => {
  const app = await pageOf('detail', provider(() => undefined), { tab: 'relations' }, params); await ready();
  try {
    const graph = relationGraph(app);
    assert.ok(graph.links.length >= 1);
    assert.deepEqual([...new Set(graph.links.map(l => l.value))], ['1'], `each band counts its Pod: ${JSON.stringify(graph.links.map(l => l.value))}`);
  } finally { app.hide(); }
});
