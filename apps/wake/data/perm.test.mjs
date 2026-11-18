/* 필요한 권한 판정과 부여 명령(perm.js) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseForbidden, grantOf, canGrantCheck } from './perm.js';

test('쿠버네티스 403 메시지에서 사용자·동사·리소스·그룹·namespace를 읽음', () => {
  const n = parseForbidden('403 {"message":"services is forbidden: User \\"wake-reader\\" cannot list resource \\"services\\" in API group \\"\\" at the cluster scope"}'.replace(/\\"/g, '"'));
  assert.deepEqual(n, { user: 'wake-reader', verb: 'list', resource: 'services', group: '', namespace: '' });
  const m = parseForbidden('applications.argoproj.io is forbidden: User "dev" cannot list resource "applications" in API group "argoproj.io" in the namespace "argocd"');
  assert.deepEqual(m, { user: 'dev', verb: 'list', resource: 'applications', group: 'argoproj.io', namespace: 'argocd' });
});
test('연결 확인의 한 줄과 기본값도 읽음, 모르면 null', () => {
  assert.deepEqual(parseForbidden('cannot list pods in namespace "payments"', { user: 'me' }), { user: 'me', verb: 'list', resource: 'pods', group: '', namespace: 'payments' });
  assert.equal(parseForbidden('boom'), null);
});
test('namespace 권한은 Role·RoleBinding, 클러스터 범위는 ClusterRole·ClusterRoleBinding, 동사는 읽기만', () => {
  const g = grantOf({ user: 'dev@example.com', resource: 'pods', group: '', namespace: 'payments' }, 'kind-x');
  assert.equal(g.scope, 'namespace'); assert.match(g.kubectl, /kubectl create role 'wake-read-pods' --verb=get,list,watch --resource='pods' -n 'payments' --context 'kind-x'/);
  assert.match(g.yaml, /kind: RoleBinding/); assert.match(g.yaml, /verbs: \["get", "list", "watch"\]/); assert.doesNotMatch(g.yaml, /verbs: \[.*(create|delete|update|patch)/);
  const c = grantOf({ user: 'wake-reader', resource: 'applications', group: 'argoproj.io', namespace: '' });
  assert.equal(c.scope, 'cluster'); assert.match(c.kubectl, /--resource='applications.argoproj.io'/); assert.match(c.yaml, /kind: ClusterRoleBinding/);
  assert.deepEqual(canGrantCheck({ namespace: 'a' }).resource, 'rolebindings'); assert.equal(canGrantCheck({ namespace: '' }).resource, 'clusterrolebindings');
});
