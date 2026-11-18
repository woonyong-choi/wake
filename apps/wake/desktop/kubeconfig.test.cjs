const assert = require('node:assert/strict');
const test = require('node:test');
const { contextList } = require('./kubeconfig.cjs');

function contextWith(extensions, extra = {}) {
  return contextList({ current: 'k3s-context', users: new Map([['reader', { tokenRef: 'private-reference' }]]),
    clusters: new Map([['k3s-on-ec2', { server: 'https://127.0.0.1:16443', extensions, ...extra }]]),
    contexts: new Map([['k3s-context', { cluster: 'k3s-on-ec2', user: 'reader', namespace: 'payments' }]]) })[0];
}
const metadata = () => ({ provider: 'aws', account: '111122223333', region: 'us-west-2' });
const extension = value => [{ name: 'wake.infrastructure', extension: value }];

test('explicit AWS infrastructure metadata is icon context and does not turn K3s into EKS', () => {
  const context = contextWith(extension(metadata()));
  assert.equal(context.provider, 'kubernetes');
  assert.equal(context.authKind, 'token');
  assert.equal(context.cluster, 'k3s-on-ec2');
  assert.equal(context.namespace, 'payments');
  assert.equal(context.current, true);
  assert.deepEqual(context.infrastructure, metadata());
  assert.ok(!JSON.stringify(context).includes('private-reference'));
});

test('missing or malformed infrastructure falls back to the original provider without metadata', () => {
  const invalid = [undefined, {}, [], extension(null), extension('aws'), extension([]),
    extension({ ...metadata(), provider: 'eks' }), extension({ ...metadata(), provider: 'unknown' }),
    extension({ ...metadata(), provider: 'AWS' }), extension({ ...metadata(), account: 111122223333 }),
    extension({ ...metadata(), account: '123' }), extension({ ...metadata(), region: 'https://untrusted.example' }),
    extension({ ...metadata(), region: 'us-west-2\n' }), [...extension(metadata()), ...extension(metadata())],
    [{ name: 'other-extension', extension: metadata() }]];
  for (const extensions of invalid) {
    const context = contextWith(extensions);
    assert.equal(context.provider, 'kubernetes');
    assert.equal(context.authKind, 'token');
    assert.equal(Object.hasOwn(context, 'infrastructure'), false);
  }
});

test('infrastructure exposes only validated provider/account/region and preserves actual EKS identification', () => {
  const context = contextWith(extension({ ...metadata(), token: 'private-value', icon: 'injected-icon', kind: 'eks', nested: {} }), { server: 'https://abc.us-west-2.eks.amazonaws.com' });
  assert.equal(context.provider, 'eks');
  assert.deepEqual(context.infrastructure, metadata());
  assert.ok(!JSON.stringify(context.infrastructure).includes('private-value'));
  assert.ok(!Object.hasOwn(context.infrastructure, 'icon'));
});
