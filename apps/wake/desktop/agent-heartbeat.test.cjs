const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAgentHeartbeat } = require('./agent-heartbeat.cjs');

const NOW = Date.parse('2026-11-15T00:10:00Z');
const lease = (node, renewAgo, extra = {}) => ({ metadata: { name: `wake-agent-${node}`, annotations: { 'wake-agent/node': node, 'wake-agent/version': '0.1.0', 'wake-agent/api-ms': '12',
  'wake-agent/watch': 'Node,Pod', 'wake-agent/changes-per-sec': '0.5', 'wake-agent/node-ready': 'true', 'wake-agent/history': `${NOW / 60000 - 2}|30,,${node === 'a' ? 50 : 20}`, ...extra } },
spec: { holderIdentity: `pod-${node}`, leaseDurationSeconds: 15, renewTime: new Date(NOW - renewAgo * 1000).toISOString() } });
const routes = over => ({
  '/apis/coordination.k8s.io/v1/namespaces/wake-system/leases?labelSelector=app.kubernetes.io%2Finstance%3Dwake-agent': { items: [lease('a', 3), lease('b', 40)] },
  '/api/v1/nodes': { items: ['a', 'b', 'c'].map(name => ({ metadata: { name } })) },
  '/apis/rbac.authorization.k8s.io/v1/clusterrolebindings': { items: [{ roleRef: { kind: 'ClusterRole', name: 'wake-agent' }, subjects: [{ kind: 'ServiceAccount', name: 'wake-agent', namespace: 'wake-system' }] },
    { roleRef: { kind: 'ClusterRole', name: 'other' }, subjects: [{ kind: 'ServiceAccount', name: 'x', namespace: 'wake-system' }] }] },
  '/apis/rbac.authorization.k8s.io/v1/rolebindings': { items: [{ metadata: { namespace: 'wake-system' }, roleRef: { kind: 'Role', name: 'wake-agent' }, subjects: [{ kind: 'ServiceAccount', name: 'wake-agent', namespace: 'wake-system' }] }] },
  '/apis/rbac.authorization.k8s.io/v1/clusterroles/wake-agent': { rules: [{ apiGroups: [''], resources: ['nodes', 'pods'], verbs: ['get', 'list', 'watch'] }] },
  '/apis/rbac.authorization.k8s.io/v1/namespaces/wake-system/roles/wake-agent': { rules: [{ apiGroups: ['coordination.k8s.io'], resources: ['leases'], verbs: ['get', 'create', 'update'] },
    { apiGroups: ['apps'], resources: ['daemonsets'], resourceNames: ['wake-agent'], verbs: ['get'] }] },
  ...over });
const hub = (over = {}) => {
  const calls = [], table = routes(over);
  const client = () => ({ async request(method, path) { calls.push([method, path]); const v = table[path]; if (v instanceof Error) throw v; if (!v) throw Object.assign(new Error('nf'), { status: 404 }); return structuredClone(v); } });
  return { read: args => createAgentHeartbeat({ client, now: () => NOW }).read(args), calls };
};

test('heartbeat_marks_each_node_ok_stale_or_missing', async () => {
  const h = hub(), r = await h.read({ id: 'ctx' });
  assert.ok(h.calls.every(([m]) => m === 'GET'));
  assert.equal(r.lookup, 'ok'); assert.equal(r.version, '0.1.0');
  assert.deepEqual(r.nodes.map(n => [n.node, n.state, n.ageSeconds]), [['a', 'ok', 3], ['b', 'stale', 40], ['c', 'missing', null]]);
  assert.equal(r.heartbeat.fresh, 1); assert.equal(r.heartbeat.nodes, 3); assert.equal(r.heartbeat.latencyMs, 12); assert.equal(r.heartbeat.eventsPerSec, 0.5);
  assert.deepEqual(r.watch, ['Node', 'Pod']);
  assert.deepEqual(r.samples, [{ at: NOW - 120000, ms: 30 }, { at: NOW, ms: 50 }], 'minute max across nodes, empty minutes left out');
  assert.deepEqual(r.rules.map(x => [x.resource, x.verbs, x.scope]), [['nodes', 'get · list · watch', 'cluster'], ['pods', 'get · list · watch', 'cluster'],
    ['coordination.k8s.io/leases', 'get · create · update', 'wake-system'], ['apps/daemonsets (wake-agent)', 'get', 'wake-system']]);
  assert.ok(r.nodes.every(n => !('samples' in n)));
});

test('heartbeat_read_failures_are_named_not_thrown', async () => {
  const path = '/apis/coordination.k8s.io/v1/namespaces/wake-system/leases?labelSelector=app.kubernetes.io%2Finstance%3Dwake-agent';
  assert.equal((await hub({ [path]: Object.assign(new Error('x'), { status: 403 }) }).read({ id: 'ctx' })).lookup, 'forbidden');
  assert.equal((await hub({ [path]: Object.assign(new Error('x'), { kind: 'timeout' }) }).read({ id: 'ctx' })).lookup, 'error');
  assert.equal((await hub().read({})).lookup, 'invalid_request');
  const noRbac = await hub({ '/apis/rbac.authorization.k8s.io/v1/clusterrolebindings': Object.assign(new Error('x'), { status: 403 }) }).read({ id: 'ctx' });
  assert.equal(noRbac.lookup, 'ok'); assert.equal(noRbac.rules, null);
});

test('no_fresh_lease_means_no_heartbeat_and_no_version', async () => {
  const path = '/apis/coordination.k8s.io/v1/namespaces/wake-system/leases?labelSelector=app.kubernetes.io%2Finstance%3Dwake-agent';
  const r = await hub({ [path]: { items: [lease('a', 100)] } }).read({ id: 'ctx' });
  assert.equal(r.heartbeat, null); assert.equal(r.version, null); assert.equal(r.watch, null);
  assert.deepEqual(r.nodes.map(n => n.state), ['stale', 'missing', 'missing']);
});
