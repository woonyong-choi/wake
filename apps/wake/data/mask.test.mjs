/* 터미널 명령 기록의 비밀 값 가리기: node --test apps/wake/data/mask.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskSecrets as m } from './mask.js';

test('토큰·비밀번호 플래그', () => {
  assert.equal(m('kubectl get pods --token abc.def.ghi'), 'kubectl get pods --token ••••');
  assert.equal(m('kubectl --token=abc get ns'), 'kubectl --token=•••• get ns');
  assert.equal(m('helm repo add x https://h --password "p w"'), 'helm repo add x https://h --password ••••');
});
test('Secret 리터럴과 변수 대입', () => {
  assert.equal(m('kubectl create secret generic db --from-literal=password=hunter2'), 'kubectl create secret generic db --from-literal=password=••••');
  assert.equal(m('GITHUB_TOKEN=ghp_123 gh pr list'), 'GITHUB_TOKEN=•••• gh pr list');
  assert.equal(m('export AWS_SECRET_ACCESS_KEY=xyz'), 'export AWS_SECRET_ACCESS_KEY=••••');
});
test('헤더와 URL 자격 증명', () => {
  assert.equal(m('curl -H "Authorization: Bearer eyJhbGciOi" https://x'), 'curl -H "Authorization: Bearer ••••" https://x');
  assert.equal(m('git clone https://me:s3cret@github.com/a/b'), 'git clone https://me:••••@github.com/a/b');
  assert.equal(m('mysql -u root -phunter2'), 'mysql -u root -p••••');
});
test('비밀이 없으면 그대로', () => {
  assert.equal(m('kubectl get pods -n payments -o wide'), 'kubectl get pods -n payments -o wide');
  assert.equal(m('kubectl logs deploy/api --previous'), 'kubectl logs deploy/api --previous');
});
