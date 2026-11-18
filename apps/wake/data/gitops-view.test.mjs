import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { contract, syncHistory, shortRev, ownedWarnings, appRows, appBad } from './gitops.js';

const H = 3600_000, T = Date.parse('2026-11-02T01:00:00Z'), iso = ms => new Date(ms).toISOString();
const sha = c => c.repeat(40);

test('appRows_default_order_uses_danger_before_warning_and_namespace_before_name', () => {
  const applications = [
    { application_id: 'warning', name: 'a', binding: { namespace: 'a' }, sync: 'OutOfSync', health: 'Healthy' },
    { application_id: 'danger-b', name: 'a', binding: { namespace: 'b' }, sync: 'Synced', health: 'Degraded' },
    { application_id: 'danger-a', name: 'z', binding: { namespace: 'a' }, sync: 'Synced', health: 'Degraded' },
  ];
  assert.deepEqual(appRows(applications).map(row => row.id), ['danger-a', 'danger-b', 'warning']);
});
const app = (name, extra = {}, history = [], resources = []) => ({ name, kind: 'Application', controller: 'argocd', cluster: 'c1', ns: 'app', path: `apps/${name}`, sync: 'Synced', health: 'Healthy', auto: true,
  deployment: { history, resources: { items: resources, read: true } }, ...extra });
const rec = (i, at, state = 'succeeded', by) => ({ key: `deploy:${i}`, stage: 'apply', revision: [sha(String(i % 10))], at: iso(at), state, source: 'status.history', ...(by ? { by } : {}) });
const dep = (name, available, ready, desired) => ({ kind: 'Deployment', ns: 'app', name, ready, desired, application: '', conditions: [{ type: 'Available', status: available, reason: available === 'True' ? 'MinimumReplicasAvailable' : 'MinimumReplicasUnavailable' }] });
const res = (kind, name) => ({ kind, name, namespace: 'app', group: 'apps' });

test('a_healthy_application_with_an_unavailable_owned_deployment_is_not_plainly_healthy', () => {
  const [a] = contract([{ id: 'r', apps: [app('checkout', {}, [], [res('Deployment', 'checkout-api'), res('Service', 'checkout-api')])] }]).applications;
  const warn = ownedWarnings(a, [dep('checkout-api', 'False', 2, 3), dep('other', 'False', 0, 1)]);
  assert.deepEqual(warn, [{ kind: 'Deployment', ns: 'app', name: 'checkout-api', reason: 'MinimumReplicasUnavailable', ready: 2, desired: 3 }]);
  const [row] = appRows([a], {}, [dep('checkout-api', 'False', 2, 3)]);
  assert.equal(row.health, 'Healthy', 'Argo raw health is kept as written');
  assert.ok(appBad(row), 'counted as a problem');
  assert.deepEqual(ownedWarnings(a, [dep('checkout-api', 'True', 3, 3)]), []);
  assert.ok(!appBad(appRows([a], {}, [dep('checkout-api', 'True', 3, 3)])[0]));
});

test('owned_resources_fall_back_to_the_tracking_annotation_and_count_statefulset_readiness', () => {
  const [a] = contract([{ id: 'r', apps: [app('db', {}, [], [])] }]).applications;
  const sts = { kind: 'StatefulSet', ns: 'app', name: 'orders-db', ready: 1, desired: 2, application: 'db' };
  assert.deepEqual(ownedWarnings(a, [sts, { ...sts, name: 'x', application: 'else' }]).map(w => [w.name, w.reason]), [['orders-db', 'NotReady']]);
});

test('rows_count_syncs_in_the_window_and_sort_problems_first', () => {
  const hist = [rec(1, T - 2 * H), rec(2, T - 30 * H, 'failed', 'jiwoo.han'), rec(3, T - 200 * H)];
  const apps = contract([{ id: 'r', apps: [app('zeta', {}, hist), app('alpha', { sync: 'OutOfSync' }, []), app('beta', {}, [])] }]).applications;
  const rows = appRows(apps, { from: T - 48 * H, to: T });
  assert.deepEqual(rows.map(r => r.name), ['alpha', 'beta', 'zeta']);
  const z = rows.find(r => r.name === 'zeta');
  assert.deepEqual([z.syncs, z.last, z.auto], [2, T - 2 * H, true]);
  assert.deepEqual(syncHistory(apps[0]).map(h => [h.result[1], h.by]), [['Succeeded', ''], ['Failed', 'jiwoo.han'], ['Succeeded', '']]);
  assert.equal(shortRev(sha('a')), 'aaaaaaa'); assert.equal(shortRev('v1.2.0'), 'v1.2.0');
});

/* C-18: Wake는 Secret을 읽지 않는다(RULE-SECRET): 릴리스 Secret 라벨로 Helm 릴리스를 만드는 경로와 그 화면(GitOps의 Helm 카드·HelmRelease 상세)은 늘 "연결 안 됨"이라 실행되지 않는 코드다 */
test('gitops_has_no_helm_release_path_built_from_release_secrets', async () => {
  const gitops = await import('./gitops.js');
  assert.equal(gitops.helmReleases, undefined, 'no Helm release reader from release Secrets');
  for (const page of ['../pages/gitops.js', '../pages/gitops-detail.js']) {
    const src = readFileSync(new URL(page, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /data\.get\('helm'|HelmRelease|helmCell/, `${page} has no Helm release path`);
  }
});
