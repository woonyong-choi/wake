/* 소유 관계와 조치 계획: node --test apps/wake/data/ownership.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerOf, planFor, rollbackChange } from './ownership.js';

const deployment = (name, ns, meta = {}) => ({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name, namespace: ns, uid: `uid-${name}`, ...meta }, spec: { replicas: 3 } });
const application = (name, { auto = true, resources = [], dest = { name: 'prod-a', namespace: 'payments' }, enabled } = {}) => ({
  apiVersion: 'argoproj.io/v1alpha1', kind: 'Application', metadata: { name, namespace: 'argocd' },
  spec: { destination: dest, source: { repoURL: 'https://github.com/acme/payments-deploy.git', path: 'apps/payments', targetRevision: 'main' },
    syncPolicy: auto ? { automated: { prune: true, selfHeal: true, ...(enabled === undefined ? {} : { enabled }) } } : {} },
  status: { sync: { status: 'Synced', revision: '3f9a1c2d4e5f60718293a4b5c6d7e8f901234567' }, resources },
});
const listed = (kind, ns, name, group = 'apps') => ({ group, version: 'v1', kind, namespace: ns, name, status: 'Synced', health: { status: 'Healthy' } });

test('ownerOf: Argo CD by status.resources, matched by group, kind, namespace and name (not identity)', () => {
  const apps = [application('orders', { resources: [listed('Deployment', 'orders', 'orders')] }), application('payments', { resources: [listed('Deployment', 'payments', 'payments'), listed('Service', 'payments', 'payments', '')] })];
  const read = JSON.parse(JSON.stringify(deployment('payments', 'payments'))); /* the object read again: a new object */
  assert.deepEqual(ownerOf(read, { applications: apps }), { kind: 'argocd', app: 'payments', namespace: 'argocd', auto: true, repo: 'https://github.com/acme/payments-deploy.git', path: 'apps/payments', revision: '3f9a1c2d4e5f60718293a4b5c6d7e8f901234567' });
  assert.equal(ownerOf({ apiVersion: 'v1', kind: 'Service', metadata: { name: 'payments', namespace: 'payments' } }, { applications: apps }).app, 'payments');
  /* same name in another namespace or kind is not owned */
  assert.equal(ownerOf(deployment('payments', 'staging'), { applications: apps }), null);
  assert.equal(ownerOf({ apiVersion: 'apps/v1', kind: 'StatefulSet', metadata: { name: 'payments', namespace: 'payments' } }, { applications: apps }), null);
  /* an Application deploying to another cluster does not own it */
  assert.equal(ownerOf(deployment('payments', 'payments'), { applications: apps, cluster: { name: 'prod-b' } }), null);
  assert.equal(ownerOf(deployment('payments', 'payments'), { applications: apps, cluster: { name: 'prod-a' } }).app, 'payments');
});

test('ownerOf: sync policy read from spec.syncPolicy.automated', () => {
  const r = [listed('Deployment', 'payments', 'payments')];
  assert.equal(ownerOf(deployment('payments', 'payments'), { applications: [application('payments', { auto: false, resources: r })] }).auto, false);
  assert.equal(ownerOf(deployment('payments', 'payments'), { applications: [application('payments', { resources: r, enabled: false })] }).auto, false);
});

test('ownerOf: the tracking-id annotation counts only for its own target', () => {
  const tracked = deployment('payments', 'payments', { annotations: { 'argocd.argoproj.io/tracking-id': 'payments:apps/Deployment:payments/payments' } });
  assert.equal(ownerOf(tracked, { applications: [application('payments')] }).auto, true);
  /* the Application is not readable: owned, sync policy unknown */
  assert.deepEqual(ownerOf(tracked, { applications: [] }), { kind: 'argocd', app: 'payments', namespace: null, auto: null, repo: null, path: null, revision: null });
  const apps2 = { applications: [{ ...application('pay'), metadata: { name: 'pay', namespace: 'team-a' } }] };
  const nsTracked = deployment('payments', 'payments', { annotations: { 'argocd.argoproj.io/tracking-id': 'team-a_pay:apps/Deployment:payments/payments' } });
  assert.equal(ownerOf(nsTracked, apps2).namespace, 'team-a');
  /* an annotation copied to another object does not make it owned */
  const copied = deployment('payments-copy', 'payments', { annotations: { 'argocd.argoproj.io/tracking-id': 'payments:apps/Deployment:payments/payments' } });
  assert.equal(ownerOf(copied, { applications: [application('payments')] }), null);
});

test('ownerOf: Helm by labels and release annotations', () => {
  const loki = { apiVersion: 'apps/v1', kind: 'StatefulSet', metadata: { name: 'loki', namespace: 'monitoring', labels: { 'app.kubernetes.io/managed-by': 'Helm' }, annotations: { 'meta.helm.sh/release-name': 'loki', 'meta.helm.sh/release-namespace': 'monitoring' } } };
  assert.deepEqual(ownerOf(loki), { kind: 'helm', release: 'loki', namespace: 'monitoring' });
  assert.deepEqual(ownerOf(loki, { helm: [{ name: 'loki', namespace: 'monitoring', revision: 9, chart: 'grafana/loki' }] }), { kind: 'helm', release: 'loki', namespace: 'monitoring', revision: 9, chart: 'grafana/loki' });
  assert.equal(ownerOf(loki, { helm: [{ name: 'loki', namespace: 'logging' }] }), null);
  /* managed-by Helm without the release annotation (a chart rendered by Argo CD) is not a Helm release */
  assert.equal(ownerOf({ ...loki, metadata: { ...loki.metadata, annotations: {} } }), null);
  assert.equal(ownerOf(null), null);
});

const CHANGE = { id: 'rollback', title: 'rev13', values: [
  { path: 'spec.template.spec.containers[0].env[0].value', before: '-Xmx480m', after: '-Xmx384m' },
  { path: 'spec.template.spec.containers[0].resources.requests.cpu', before: '420m', after: '300m' }],
diff: { path: 'apps/payments/deployment.yaml', before: ['          value: -Xmx480m', '            cpu: 420m'], after: ['          value: -Xmx384m', '            cpu: 300m'] } };

test('planFor: an auto-synced Argo CD target gets a Draft PR, never a cluster command (N2)', () => {
  const res = deployment('payments', 'payments'), owner = ownerOf(res, { applications: [application('payments', { resources: [listed('Deployment', 'payments', 'payments')] })] });
  const p = planFor({ resource: res, change: CHANGE, owner });
  assert.equal(p.route, 'pr');
  assert.equal(p.command, null);
  assert.equal(p.repo, 'https://github.com/acme/payments-deploy.git');
  assert.equal(p.path, 'apps/payments/deployment.yaml');
  assert.equal(p.values.length, 2); /* every value */
  assert.deepEqual(p.diff, CHANGE.diff);
  assert.deepEqual(p.checks, ['gitops-auto-sync']);
  /* a rollout undo or restart on it becomes a revert PR, not kubectl */
  const undo = planFor({ resource: res, change: { id: 'undo', values: [], command: 'kubectl rollout undo deployment/payments -n payments' }, owner });
  assert.equal(undo.route, 'pr');
  assert.equal(undo.command, null);
  assert.ok(undo.checks.includes('git-revert'));
  /* sync policy unknown: treated as automated */
  const unknown = planFor({ resource: res, change: CHANGE, owner: { kind: 'argocd', app: 'payments', auto: null, repo: null, path: null } });
  assert.equal(unknown.route, 'pr');
  assert.ok(unknown.checks.includes('gitops-sync-unknown'));
});

test('planFor: manual Argo CD, Helm and unowned resources', () => {
  const res = deployment('payments', 'payments');
  const manual = planFor({ resource: res, change: CHANGE, owner: { kind: 'argocd', app: 'payments', auto: false }, context: 'prod-a' });
  assert.equal(manual.route, 'command');
  assert.deepEqual(manual.checks, ['gitops-manual-drift']);
  const helm = planFor({ resource: res, change: { id: 'mem', values: [{ path: 'resources.limits.memory', before: '512Mi', after: '768Mi' }] }, owner: { kind: 'helm', release: 'payments', namespace: 'payments', chart: 'acme/payments' }, context: 'prod-a' });
  assert.equal(helm.route, 'helm');
  assert.equal(helm.command, "helm upgrade payments acme/payments -n payments --reuse-values --set 'resources.limits.memory=768Mi' --kube-context 'prod-a'");
  const noChart = planFor({ resource: res, change: CHANGE, owner: { kind: 'helm', release: 'payments', namespace: 'payments' } });
  assert.equal(noChart.command, null);
  assert.ok(noChart.checks.includes('helm-chart-unknown'));
  const plain = planFor({ resource: res, change: CHANGE, owner: null, context: 'prod-a' });
  assert.equal(plain.route, 'command');
  assert.deepEqual(plain.checks, ['not-gitops']);
  assert.ok(plain.command.startsWith('kubectl patch deployment/payments -n payments --type=json -p '));
  const ops = JSON.parse(/-p '(.*)' --context/.exec(plain.command)[1]);
  assert.deepEqual(ops, [{ op: 'test', path: '/metadata/uid', value: 'uid-payments' },
    { op: 'test', path: '/spec/template/spec/containers/0/env/0/value', value: '-Xmx480m' }, { op: 'test', path: '/spec/template/spec/containers/0/resources/requests/cpu', value: '420m' },
    { op: 'replace', path: '/spec/template/spec/containers/0/env/0/value', value: '-Xmx384m' }, { op: 'replace', path: '/spec/template/spec/containers/0/resources/requests/cpu', value: '300m' }], 'the patch fails closed when the object, or a value it changes, moved since the plan');
  const restart = planFor({ resource: res, change: { id: 'restart', values: [], command: 'kubectl rollout restart deployment/payments -n payments' }, owner: null, context: 'prod-a' });
  assert.equal(restart.command, "kubectl rollout restart deployment/payments -n payments --context 'prod-a'");
  const unbound = planFor({ resource: res, change: CHANGE, owner: null });
  assert.deepEqual([unbound.command, unbound.checks.includes('context-unbound')], [null, true], 'a write without the context it was made for has no command');
});

test('planFor: a write names the context it was made for and guards the container it changes', () => {
  const res = deployment('payments', 'payments', { generation: 7 });
  const change = { id: 'mem', guards: [{ path: 'spec.template.spec.containers[1].name', value: 'app' }], values: [{ path: 'spec.template.spec.containers[1].resources.limits.memory', before: '64Mi', after: '128Mi' }] };
  const plain = planFor({ resource: res, change, owner: null, context: 'prod-a' });
  assert.ok(plain.command.endsWith(" --context 'prod-a'"), plain.command);
  const ops = JSON.parse(/-p '(.*)' --context/.exec(plain.command)[1]);
  assert.deepEqual(ops.slice(0, 4).map(o => [o.op, o.path, o.value]), [['test', '/metadata/uid', 'uid-payments'], ['test', '/metadata/generation', 7], ['test', '/spec/template/spec/containers/1/name', 'app'], ['test', '/spec/template/spec/containers/1/resources/limits/memory', '64Mi']],
    'a newer rollout of the same object (a new generation) fails the patch');
  assert.deepEqual(plain.guards, [{ path: 'spec.template.spec.containers[1].name', value: 'app' }], 'the plan shows what it guards');
  const cordon = planFor({ resource: { apiVersion: 'v1', kind: 'Node', metadata: { name: 'w1', uid: 'n1' } }, change: { id: 'cordon', values: [{ path: 'spec.unschedulable', after: true, op: 'add' }] }, owner: null, context: 'prod-a' });
  assert.deepEqual(JSON.parse(/-p '(.*)' --context/.exec(cordon.command)[1]), [{ op: 'test', path: '/metadata/uid', value: 'n1' }, { op: 'add', path: '/spec/unschedulable', value: true }], 'a cordon names the Node it was planned for');
  const helm = planFor({ resource: res, change, owner: { kind: 'helm', release: 'payments', namespace: 'payments', chart: 'acme/payments' }, context: 'prod-a' });
  assert.ok(helm.command.endsWith(" --kube-context 'prod-a'"));
});

test('planFor: a manual step is a check the person runs outside Wake, never a PR or a cluster write, whoever owns the resource', () => {
  const res = deployment('payments', 'payments'), argo = { kind: 'argocd', app: 'payments', auto: true, repo: 'r', path: 'p' };
  for (const owner of [argo, { kind: 'helm', release: 'payments', namespace: 'payments', chart: 'acme/payments' }, null]) {
    const p = planFor({ resource: res, change: { id: 'check', manual: true, values: [{ path: 'x', before: 1, after: 2 }], command: 'kubectl describe pod api-1 -n payments' }, owner });
    assert.equal(p.route, 'manual');
    assert.equal(p.command, 'kubectl describe pod api-1 -n payments');
    assert.deepEqual(p.values, [], 'a manual step changes no value');
    assert.deepEqual(p.checks, ['manual-step']);
  }
});

test('rollbackChange: replaces the template with the earlier ReplicaSet one, only on the same object, generation and revision', () => {
  const dep = deployment('payments', 'payments', { generation: 9, annotations: { 'deployment.kubernetes.io/revision': '13' } });
  const earlier = { kind: 'ReplicaSet', metadata: { name: 'payments-6f7', annotations: { 'deployment.kubernetes.io/revision': '12' } },
    spec: { template: { metadata: { labels: { app: 'payments', 'pod-template-hash': '6f7' } }, spec: { containers: [{ name: 'app', image: 'payments:1.0' }] } } } };
  const change = rollbackChange({ deployment: dep, to: earlier, title: 'rollback' });
  assert.equal(change.revision, 12);
  const plan = planFor({ resource: dep, change, owner: null, context: 'prod-a' });
  assert.equal(plan.route, 'command');
  const ops = JSON.parse(/-p '(.*)' --context 'prod-a'$/.exec(plan.command)[1]);
  assert.deepEqual(ops, [{ op: 'test', path: '/metadata/uid', value: 'uid-payments' }, { op: 'test', path: '/metadata/generation', value: 9 },
    { op: 'test', path: '/metadata/annotations/deployment.kubernetes.io~1revision', value: '13' },
    { op: 'replace', path: '/spec/template', value: { metadata: { labels: { app: 'payments' } }, spec: { containers: [{ name: 'app', image: 'payments:1.0' }] } } }]);
  assert.equal(earlier.spec.template.metadata.labels['pod-template-hash'], '6f7', 'the ReplicaSet read is not changed');
  const pr = planFor({ resource: dep, change, owner: { kind: 'argocd', app: 'payments', auto: true, repo: 'r', path: 'p' }, context: 'prod-a' });
  assert.deepEqual([pr.route, pr.checks.includes('git-revert'), pr.command], ['pr', true, null], 'a synced Application still reverts through a Draft PR');
});

test('rollbackChange on a Helm release: helm rollback to the revision before the current one, or to the previous release Helm resolves when the history is not read', () => {
  const dep = deployment('payments', 'payments', { generation: 4, annotations: { 'deployment.kubernetes.io/revision': '2' } });
  const earlier = { kind: 'ReplicaSet', metadata: { name: 'payments-1', annotations: { 'deployment.kubernetes.io/revision': '1' } }, spec: { template: { metadata: { labels: {} }, spec: { containers: [] } } } };
  const change = rollbackChange({ deployment: dep, to: earlier });
  const known = planFor({ resource: dep, change, owner: { kind: 'helm', release: 'pay', namespace: 'payments', chart: 'acme/pay', revision: 3, history: [{ revision: 1 }, { revision: 2 }, { revision: 3 }] }, context: 'prod-a' });
  assert.deepEqual([known.route, known.command], ['helm', "helm rollback 'pay' 2 -n 'payments' --kube-context 'prod-a' --wait"]);
  /* Wake does not read Helm release Secrets (RULE-SECRET): without the history Helm itself picks the previous release at run time */
  const unknown = planFor({ resource: dep, change, owner: { kind: 'helm', release: 'pay', namespace: 'payments' }, context: 'prod-a' });
  assert.deepEqual([unknown.route, unknown.command, unknown.checks.includes('helm-previous-release'), unknown.revision], ['helm', "helm rollback 'pay' -n 'payments' --kube-context 'prod-a' --wait", true, null]);
});
