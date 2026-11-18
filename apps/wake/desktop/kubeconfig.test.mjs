/* 공급자 판별 규칙: node --test apps/wake/desktop/kubeconfig.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { providerOf } = createRequire(import.meta.url)('./kubeconfig.cjs');

test('provider from server host, exec command and cluster entry (first rule wins)', () => {
  assert.equal(providerOf('prod', 'https://ABC.gr7.ap-northeast-2.eks.amazonaws.com', { exec: { command: 'aws' } }, 'prod'), 'eks');
  assert.equal(providerOf('x', 'https://10.0.0.1', { exec: { command: '/usr/local/bin/aws-iam-authenticator' } }), 'eks');
  assert.equal(providerOf('x', 'https://dns-1.hcp.koreacentral.azmk8s.io:443', {}), 'aks');
  assert.equal(providerOf('x', 'https://10.0.0.1', { exec: { command: 'kubelogin' } }), 'aks');
  assert.equal(providerOf('x', 'https://34.1.2.3', { exec: { command: 'gke-gcloud-auth-plugin' } }), 'gke');
  assert.equal(providerOf('x', '', {}, 'gke_proj_asia-northeast3_c1'), 'gke');
  assert.equal(providerOf('wake-reader', 'https://127.0.0.1:62956', {}, 'kind-wake-test'), 'kind');
  assert.equal(providerOf('kind-a', '', {}), 'kind');
  assert.equal(providerOf('docker-desktop', '', {}, 'docker-desktop'), 'docker');
  assert.equal(providerOf('wake-closed-port', 'https://127.0.0.1:1', {}, 'wake-closed-port'), 'kubernetes');
});

test('a context on the same server as a kind cluster is kind', () => {
  const { contextList } = createRequire(import.meta.url)('./kubeconfig.cjs');
  const kc = { current: '', users: new Map([['u', {}]]), clusters: new Map([['kind-wake-test', { server: 'https://127.0.0.1:62956' }], ['wake-test', { server: 'https://127.0.0.1:62956' }], ['fake', { server: 'https://127.0.0.1:1' }]]),
    contexts: new Map([['wake-reader', { cluster: 'wake-test', user: 'u' }], ['wake-closed-port', { cluster: 'fake', user: 'u' }]]) };
  const by = Object.fromEntries(contextList(kc).map(c => [c.id, c.provider]));
  assert.deepEqual(by, { 'wake-reader': 'kind', 'wake-closed-port': 'kubernetes' });
});
