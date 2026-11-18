const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createOpenCost, identify, project, requestOf } = require('./opencost.cjs');

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-08T00:00:00Z');
const id = 'current-cluster';
const uid = 'cluster-uid';
const cluster = 'default-cluster';
const service = { namespace: 'cost', name: 'opencost', uid: 'service-uid' };
const iso = ms => new Date(ms).toISOString();
const allocation = (properties, totalCost, from, to, fields = {}) => ({
  properties: { cluster, ...properties }, totalCost, start: iso(from), end: iso(to),
  window: { start: iso(from), end: iso(to) }, ...fields,
});

test('OpenCost identifies an exact Kubernetes UID or a single matching live node set', () => {
  const data = [{ aws: { properties: { cluster, node: 'worker-1' } }, gke: { properties: { cluster: 'remote', node: 'remote-1' } } }];
  assert.equal(identify({ data }, uid, new Set(['worker-1', 'worker-2'])), cluster);
  data[0].gke.properties.node = 'worker-1';
  assert.throws(() => identify({ data }, uid, new Set(['worker-1'])), { kind: 'identity_unverified' });
  data[0].aws.properties.cluster = uid;
  assert.equal(identify({ data }, uid, new Set(['worker-1'])), uid);
});

test('allocation adds each partition once and preserves zeros, missing fields and empty intervals', () => {
  const query = requestOf({ period: '24h' }, NOW);
  const from = NOW - HOUR;
  const response = { data: [{
    'default-cluster/alpha': allocation({ namespace: 'alpha' }, 3, from, NOW, { cpuCost: 0 }),
    'default-cluster/beta': allocation({ namespace: 'beta' }, 0, from, NOW, { cpuCost: 0 }),
    '__idle__': allocation({}, 2, from, NOW, { cpuCost: 2 }),
    'default-cluster/__unallocated__': allocation({}, 1, from, NOW, { cpuCost: 0 }),
  }] };
  const result = project(response, cluster, query);
  assert.equal(result.status, 'partial');
  assert.deepEqual([result.total, result.cpu, result.memory, result.idle, result.unallocated], [6, 2, null, 2, 1]);
  assert.equal(result.rows.find(row => row.name === 'beta').total, 0);
  assert.deepEqual(result.trend.slice(-2).map(row => row.value), [null, 6]);
  assert.equal(result.covered, 1);
  assert.equal(result.currency, null);
});

test('allocation rejects foreign clusters, wider filters, and duplicate time buckets', () => {
  const query = requestOf({ view: 'pod', namespace: 'alpha', pod: 'app' }, NOW);
  const from = NOW - 6 * HOUR;
  const row = allocation({ namespace: 'alpha', pod: 'app' }, 2, from, NOW);
  assert.equal(project({ data: [{ app: row }] }, cluster, query).rows[0].id, 'alpha/app');
  assert.throws(() => project({ data: [{ app: { ...row, properties: { ...row.properties, cluster: 'foreign' } } }] }, cluster, query), { kind: 'identity_changed' });
  assert.throws(() => project({ data: [{ app: { ...row, properties: { ...row.properties, pod: 'previous-app' } } }] }, cluster, query), { kind: 'identity_changed' });
  assert.throws(() => project({ data: [{ app: row }, { app: row }] }, cluster, query), { kind: 'invalid_response' });
});

test('short allocation windows stay partial when observed time is substantially shorter', () => {
  const from = NOW - 598_000;
  const query = requestOf({ from, to: NOW }, NOW);
  const observed = (start, end) => allocation({ namespace: 'alpha' }, 1, start, end, {
    window: { start: iso(from), end: iso(NOW) },
  });
  const incomplete = project({ data: [{ alpha: observed(from, NOW - 239_000) }] }, cluster, query);
  assert.deepEqual([incomplete.status, incomplete.covered, incomplete.observedThrough], ['partial', 0, NOW - 239_000]);
  const gaps = project({ data: [{ alpha: observed(from + 40_000, NOW - 40_000) }] }, cluster, query);
  assert.equal(gaps.status, 'partial');
  const nearlyComplete = project({ data: [{ alpha: observed(from + 15_000, NOW - 20_000) }] }, cluster, query);
  assert.equal(nearlyComplete.status, 'ready');
});

test('custom windows use only whole seconds inside the selected interval', () => {
  const from = NOW - 3_250, to = NOW - 250;
  const query = requestOf({ from, to }, NOW);
  assert.deepEqual([query.start, query.end, query.step], [NOW - 3_000, NOW - 1_000, 2_000]);
  assert.throws(() => requestOf({ from: NOW - 1_050, to }, NOW), { kind: 'target' });
});

function fixture() {
  const calls = [];
  const scopes = [];
  let saved = {}, denied = false, returnedCluster = cluster, validateTarget = () => {};
  const native = createOpenCost({ clock: () => NOW,
    client: () => ({ request: async (_, route) => {
      if (denied) throw Object.assign(new Error('Forbidden'), { status: 403 });
      if (route.endsWith('/nodes')) return { apiVersion: 'v1', kind: 'NodeList', items: [{ metadata: { uid: 'node-uid', name: 'worker-1' } }] };
      return { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'kube-system', uid } };
    } }),
    conns: () => structuredClone(saved), saveConns: value => { saved = value; },
    tools: {
      costTargets: async () => [service],
      costSource: async (_, value, scope) => {
        assert.deepEqual(value, service);
        scopes.push(scope);
        return {
          allocation: async args => {
            calls.push(args);
            assert.match(args.window, /^\d+,\d+$/);
            if (args.aggregate === 'cluster,node') return { data: [{ node: { properties: { cluster, node: 'worker-1' } } }] };
            const [from, to] = args.window.split(',').map(seconds => Number(seconds) * 1_000);
            return { currencyCode: 'USD', pricingSource: 'On demand', data: [{ row: allocation(
              { cluster: returnedCluster, namespace: 'alpha', controllerKind: 'deployment', controller: 'main', pod: 'main-1' },
              to === NOW ? 4 : 2, from, to,
            ) }] };
          },
          validate: async () => validateTarget(),
          close: () => { calls.push('close'); },
        };
      },
    },
  });
  return { calls, scopes, saved: () => saved, deny: () => { denied = true; }, replace: () => { returnedCluster = 'other'; },
    failValidation: () => { validateTarget = () => { throw Object.assign(new Error(), { kind: 'identity_changed' }); }; },
    run: (op, args = {}, signal = new AbortController().signal) => native.run(op, { id, ...args }, signal), state: () => native.state(id) };
}

test('service selection verifies live identity before saving and reads only a scoped allocation', async () => {
  const f = fixture();
  assert.deepEqual(await f.run('read'), { status: 'unconfigured' });
  assert.deepEqual(await f.run('connect', { service: 'stale-uid' }), { status: 'target' });
  assert.deepEqual(f.saved(), {});
  assert.equal((await f.run('connect', { service: service.uid })).status, 'connected');
  assert.deepEqual(f.saved(), { costBindings: { [id]: { uid, cluster, service } } });
  const from = NOW - HOUR;
  const result = await f.run('read', { from, to: NOW, compare: true });
  assert.deepEqual([result.status, result.total, result.previous], ['ready', 4, 2]);
  const resultPod = await f.run('read', { from, to: NOW, view: 'pod', namespace: 'alpha', controllerKind: 'deployment', controller: 'main' });
  assert.equal(resultPod.total, 4);
  assert.equal(f.calls.at(-2).filter, 'cluster:"default-cluster"+namespace:"alpha"+controllerKind:"deployment"+controllerName:"main"');
  assert.equal(f.calls.at(-2).includeIdle, 'false');
  f.replace();
  assert.deepEqual(await f.run('read', { from, to: NOW }), { status: 'identity_changed' });
});

test('opencost_state_answers_from_the_saved_binding_without_asking_the_cluster', async () => {
  const f = fixture();
  assert.deepEqual(f.state(), { status: 'unconfigured' });
  await f.run('connect', { service: service.uid });
  f.deny();
  assert.deepEqual(f.state(), { status: 'connected', service: `${service.namespace}/${service.name}` });
});

test('allocation uses the caller cancellation signal while connection verification remains bounded', async () => {
  const f = fixture();
  const controller = new AbortController();
  assert.equal((await f.run('connect', { service: service.uid }, controller.signal)).status, 'connected');
  assert.ok(Number.isFinite(f.scopes[0].deadline));
  assert.notEqual(f.scopes[0].signal, controller.signal);
  await f.run('read', { from: NOW - HOUR, to: NOW }, controller.signal);
  assert.equal(f.scopes[1].deadline, undefined);
  assert.equal(f.scopes[1].signal, controller.signal);
});

test('configuration stays unsaved after cancelled or changed identity checks', async () => {
  const f = fixture();
  f.failValidation();
  assert.deepEqual(await f.run('connect', { service: service.uid }), { status: 'identity_changed' });
  assert.deepEqual(await f.run('connect', { service: service.uid }, AbortSignal.abort()), { status: 'cancelled' });
  assert.deepEqual(f.saved(), {});
  f.deny();
  assert.deepEqual(await f.run('connect', { service: service.uid }), { status: 'forbidden' });
});
