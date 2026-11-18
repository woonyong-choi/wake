/* 소유 관계와 조치 계획: node --test apps/wake/data/ownership.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerOf, planFor } from './ownership.js';

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
  const manual = planFor({ resource: res, change: CHANGE, owner: { kind: 'argocd', app: 'payments', auto: false } });
  assert.equal(manual.route, 'command');
  assert.deepEqual(manual.checks, ['gitops-manual-drift']);
  const helm = planFor({ resource: res, change: { id: 'mem', values: [{ path: 'resources.limits.memory', before: '512Mi', after: '768Mi' }] }, owner: { kind: 'helm', release: 'payments', namespace: 'payments', chart: 'acme/payments' } });
  assert.equal(helm.route, 'helm');
  assert.equal(helm.command, "helm upgrade payments acme/payments -n payments --reuse-values --set 'resources.limits.memory=768Mi'");
  const noChart = planFor({ resource: res, change: CHANGE, owner: { kind: 'helm', release: 'payments', namespace: 'payments' } });
  assert.equal(noChart.command, null);
  assert.ok(noChart.checks.includes('helm-chart-unknown'));
  const plain = planFor({ resource: res, change: CHANGE, owner: null });
  assert.equal(plain.route, 'command');
  assert.deepEqual(plain.checks, ['not-gitops']);
  assert.ok(plain.command.startsWith('kubectl patch deployment/payments -n payments --type=json -p '));
  const ops = JSON.parse(/-p '(.*)'$/.exec(plain.command)[1]);
  assert.deepEqual(ops, [{ op: 'replace', path: '/spec/template/spec/containers/0/env/0/value', value: '-Xmx384m' }, { op: 'replace', path: '/spec/template/spec/containers/0/resources/requests/cpu', value: '300m' }]);
  const restart = planFor({ resource: res, change: { id: 'restart', values: [], command: 'kubectl rollout restart deployment/payments -n payments' }, owner: null });
  assert.equal(restart.command, 'kubectl rollout restart deployment/payments -n payments');
});
