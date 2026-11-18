const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createTools, readCostAllocation } = require('./tools.cjs');
function fixture() {
  const service = { apiVersion: 'v1', kind: 'Service', metadata: { name: 'grafana', namespace: 'monitoring', uid: 'service-a' }, spec: { ports: [{ name: 'http', port: 3000 }], selector: { app: 'grafana' } } };
  const pod = { apiVersion: 'v1', kind: 'Pod', metadata: { name: 'grafana-a', namespace: 'monitoring', uid: 'pod-a', labels: { app: 'grafana' } }, spec: { containers: [{ name: 'grafana', image: 'grafana:11' }] }, status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] } };
  const endpoint = { apiVersion: 'v1', kind: 'Endpoints', metadata: { name: 'grafana', namespace: 'monitoring', uid: 'ep-a' }, subsets: [{ addresses: [{ targetRef: { kind: 'Pod', name: 'grafana-a', namespace: 'monitoring', uid: 'pod-a' } }], ports: [{ name: 'http', port: 3000 }] }] };
  const state = { services: [service], service, pod, endpoint, reads: [], closed: 0, forwarded: 0 };
  const client = { async request(method, url) {
    assert.equal(method, 'GET'); state.reads.push(url);
    if (url === '/api/v1/services') return { apiVersion: 'v1', kind: 'ServiceList', items: structuredClone(state.services) };
    if (url.includes('/services/')) return structuredClone(state.service);
    if (url.includes('/endpoints/')) return structuredClone(state.endpoint);
    if (url.includes('/pods/')) return structuredClone(state.pod);
    assert.fail('unexpected API');
  } };
  const tools = createTools({ forward: async (_client, target) => { state.forwarded++; assert.deepEqual(await target(), { ns: 'monitoring', pod: 'grafana-a', port: 3000 }); return { port: 12345, close() { state.closed++; } }; } });
  return { state, client, tools };
}
test('tool binding requires current exact context Service and Pod UID', async () => {
  const f = fixture(), [row] = await f.tools.find(f.client, 'context-a');
  const opened = await f.tools.open(f.client, 'context-a', row);
  assert.equal(opened.url, 'http://127.0.0.1:12345/'); assert.equal(opened.binding.serviceUid, 'service-a'); assert.equal(opened.binding.podUid, 'pod-a');
  await assert.rejects(f.tools.open(f.client, 'context-b', row));
  await assert.rejects(f.tools.open(f.client, 'context-a', { ...row, svc: 'foreign' }));
  f.state.service.metadata.uid = 'replacement'; await assert.rejects(f.tools.open(f.client, 'context-a', row));
  assert.equal(f.state.closed, 1); f.tools.closeAll();
});
test('a denied endpoint read leaves the discovered Service visible and withholds the binding', async () => {
  const f = fixture();
  const request = f.client.request;
  f.client.request = async (method, route) => {
    if (route.includes('/endpoints/')) throw Object.assign(new Error('private error text'), { status: 403, kind: 'forbidden' });
    return request(method, route);
  };
  const [row] = await f.tools.find(f.client, 'context-a');
  assert.equal(row.svc, 'grafana');
  assert.deepEqual(row.permission, { verb: 'get', resource: 'endpoints', namespace: 'monitoring' });
  assert.equal(row.bindingId, undefined);
  assert.doesNotMatch(JSON.stringify(row), /private error text/);
  await assert.rejects(f.tools.open(f.client, 'context-a', row));
  assert.equal(f.state.forwarded, 0);
});

test('duplicate same-kind Service never chooses the first namespace', async () => {
  const f = fixture(); f.state.services.push({ ...structuredClone(f.state.service), metadata: { name: 'grafana', namespace: 'other', uid: 'service-b' } });
  const [row] = await f.tools.find(f.client, 'context-a'); assert.equal(row.selection, 'ambiguous'); assert.equal(row.bindingId, undefined);
  await assert.rejects(f.tools.open(f.client, 'context-a', row)); assert.equal(f.state.forwarded, 0);
});
test('concurrent home discovery shares a request while an explicit retry starts a new one', async () => {
  const { client, state, tools } = fixture();
  const first = tools.find(client, 'context-a');
  assert.equal(tools.find(client, 'context-a'), first);
  const stale = assert.rejects(first, { kind: 'stale_discovery' });
  const retry = tools.find(client, 'context-a', { refresh: true });
  assert.equal(tools.find(client, 'context-a'), retry);
  assert.equal((await retry)[0].selection, 'verified');
  await stale;
  assert.equal(state.reads.filter(route => route === '/api/v1/services').length, 2);
});
test('same-name Pod replacement endpoint UID mismatch and deleted Service stop before forwarding', async () => {
  for (const change of [s => { s.pod.metadata.uid = 'pod-b'; }, s => { s.endpoint.subsets[0].addresses[0].targetRef.uid = 'pod-b'; }, s => { s.service.metadata.deletionTimestamp = '2026-11-07T00:00:00Z'; }]) {
    const f = fixture(), [row] = await f.tools.find(f.client, 'context-a'); change(f.state);
    await assert.rejects(f.tools.open(f.client, 'context-a', row)); assert.equal(f.state.forwarded, 0);
  }
});

test('simultaneous opens share one forward and closeAll invalidates its saved binding', async () => {
  const f = fixture(), [row] = await f.tools.find(f.client, 'context-a');
  const results = await Promise.all([f.tools.open(f.client, 'context-a', row), f.tools.open(f.client, 'context-a', row)]);
  assert.equal(f.state.forwarded, 1); assert.equal(results[0].url, results[1].url);
  f.tools.closeAll(); await assert.rejects(results[0].validate()); assert.equal(f.state.closed, 1);
});

test('verified ServiceList derives only absent item TypeMeta and rejects explicit null or conflicting types', async () => {
  const f = fixture(), item = structuredClone(f.state.service); delete item.apiVersion; delete item.kind; f.state.services = [item];
  assert.equal((await f.tools.find(f.client, 'context-a'))[0].selection, 'verified');
  assert.equal(Object.hasOwn(item, 'apiVersion'), false);
  for (const change of [s => { s.apiVersion = null; }, s => { s.kind = 'Pod'; }]) {
    const bad = fixture(), item = structuredClone(bad.state.service); change(item); bad.state.services = [item];
    await assert.rejects(bad.tools.find(bad.client, 'context-a'));
  }
});

test('return226 exact wake-loki and wake-tempo names are discovered without allowing arbitrary prefixes or first matches', async () => {
  for (const [name, kind] of [['wake-loki', 'loki'], ['wake-tempo', 'tempo']]) {
    const f = fixture(); f.state.service.metadata.name = name; f.state.endpoint.metadata.name = name;
    const rows = await f.tools.find(f.client, 'context-a'); assert.equal(rows.length, 1); assert.equal(rows[0].kind, kind); assert.equal(rows[0].ui, false);
    f.state.services.push({ ...structuredClone(f.state.service), metadata: { name: kind, namespace: 'other', uid: 'other-service' } });
    assert.equal((await f.tools.find(f.client, 'context-a'))[0].selection, 'ambiguous');
    const wrong = fixture(); wrong.state.service.metadata.name = 'other-' + kind;
    assert.equal((await wrong.tools.find(wrong.client, 'context-a')).length, 0);
  }
});

test('API page queries reach the bound pod, while writes, admin paths and a replacement pod are blocked', async t => {
  const f = fixture();
  f.state.service.metadata.name = 'wake-loki';
  f.state.endpoint.metadata.name = 'wake-loki';
  f.state.service.spec.ports = [{ name: 'http-metrics', port: 3100, targetPort: 3100 }];
  f.state.endpoint.subsets[0].ports = [{ name: 'http-metrics', port: 3100 }];
  const received = [];
  const upstream = http.createServer((req, res) => {
    received.push({ method: req.method, url: req.url, authorization: req.headers.authorization, accept: req.headers.accept });
    res.end('{"status":"success"}');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const tools = createTools({ forward: async () => ({ port: upstream.address().port, close() {} }) });
  t.after(() => { tools.closeAll(); upstream.close(); });
  const [row] = await tools.find(f.client, 'context-a');
  const opened = await tools.open(f.client, 'context-a', row);
  const read = new URL('/loki/api/v1/labels?since=1h', opened.url);
  const signal = new AbortController().signal;
  assert.equal((await tools.query(f.client, 'context-a', 'loki', '/loki/api/v1/labels?since=1h', [], signal)).body, '{"status":"success"}');
  assert.deepEqual(await tools.query(f.client, 'context-a', 'loki', '//example.com/ready', [], signal), { error: 'route' });
  assert.equal((await tools.query(f.client, 'context-a', 'loki', '/loki/api/v1/labels?since=1h', [], signal, '*/*')).status, 200);
  assert.deepEqual(await tools.query(f.client, 'context-a', 'loki', '/ready', [], signal, 'text/html'), { error: 'header' });
  assert.equal((await fetch(read, { headers: { authorization: 'Bearer synthetic', accept: 'text/html' } })).status, 200);
  assert.equal((await fetch(read, { method: 'POST', body: '{}' })).status, 405);
  assert.equal((await fetch(new URL('/flush', opened.url))).status, 403);
  f.state.pod.metadata.uid = 'replacement';
  assert.equal((await fetch(read)).status, 502);
  assert.deepEqual(received, ['application/json', '*/*', 'application/json'].map(accept => ({ method: 'GET', url: '/loki/api/v1/labels?since=1h', authorization: undefined, accept })));
});

test('loki_bridge_requests_reuse_a_short_lived_check_while_the_watch_cache_shows_the_same_pod_and_check_again_when_it_is_replaced', async t => {
  const f = fixture();
  f.state.service.metadata.name = 'wake-loki'; f.state.endpoint.metadata.name = 'wake-loki';
  f.state.service.spec.ports = [{ name: 'http-metrics', port: 3100, targetPort: 3100 }];
  f.state.endpoint.subsets[0].ports = [{ name: 'http-metrics', port: 3100 }];
  const upstream = http.createServer((req, res) => res.end('{"status":"success"}'));
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  let clock = 1_000_000, cached = 'pod-a';
  /* the shared Pod watch cache: the uid it holds for that pod (null: gone from the cache, undefined: no live cache) */
  const podIdentity = (contextId, namespace, name) => (contextId === 'context-a' && namespace === 'monitoring' && name === 'grafana-a' ? cached : undefined);
  const tools = createTools({ forward: async () => ({ port: upstream.address().port, close() {} }), now: () => clock, podIdentity });
  t.after(() => { tools.closeAll(); upstream.close(); });
  const [row] = await tools.find(f.client, 'context-a');
  const opened = await tools.open(f.client, 'context-a', row);
  const read = new URL('/loki/api/v1/labels', opened.url), checks = () => f.state.reads.filter(u => u.includes('/pods/')).length;
  assert.equal((await fetch(read)).status, 200);
  const first = checks();
  for (let i = 0; i < 5; i++) { clock += 1000; assert.equal((await fetch(read)).status, 200); }
  assert.equal(checks(), first, 'requests inside the short check window ask the API server nothing while the cache shows the same pod');
  /* the pod is replaced: the cache shows another uid, the next request checks again and is blocked */
  f.state.pod.metadata.uid = 'replacement'; cached = 'replacement';
  assert.equal((await fetch(read)).status, 502);
  assert.ok(checks() > first, 'a replaced pod is checked again at once');
  /* past the window the check runs again even when the cache says nothing changed */
  f.state.pod.metadata.uid = 'pod-a'; cached = 'pod-a';
  const tools2 = createTools({ forward: async () => ({ port: upstream.address().port, close() {} }), now: () => clock, podIdentity });
  t.after(() => tools2.closeAll());
  const [row2] = await tools2.find(f.client, 'context-a');
  const opened2 = await tools2.open(f.client, 'context-a', row2), read2 = new URL('/loki/api/v1/labels', opened2.url);
  assert.equal((await fetch(read2)).status, 200);
  const before = checks(); clock += 60_000;
  assert.equal((await fetch(read2)).status, 200);
  assert.ok(checks() > before, 'past the window the binding is checked again');
});

test('main process reads Prometheus and Alertmanager APIs by allowlisted GET routes while their tab forward stays whole', async t => {
  const received = [];
  const upstream = http.createServer((req, res) => { received.push(req.url); res.end('{"status":"success"}'); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => upstream.close());
  const signal = new AbortController().signal;
  for (const [kind, name, port, route, blocked] of [
    ['prometheus', 'kps-prometheus', 9090, '/api/v1/query_range?query=up&start=1&end=2&step=1', '/api/v1/admin/tsdb/delete_series'],
    ['alertmanager', 'kps-alertmanager', 9093, '/api/v2/alerts?active=true', '/api/v2/silence/abc'],
  ]) {
    const f = fixture(); f.state.service.metadata.name = name; f.state.endpoint.metadata.name = name;
    f.state.service.spec.ports = [{ name: 'http-web', port, targetPort: port }]; f.state.endpoint.subsets[0].ports = [{ name: 'http-web', port }];
    const tools = createTools({ forward: async () => ({ port: upstream.address().port, close() {} }) });
    t.after(() => tools.closeAll());
    assert.equal((await tools.query(f.client, 'context-a', kind, route, [], signal)).status, 200);
    assert.deepEqual(await tools.query(f.client, 'context-a', kind, blocked, [], signal), { error: 'route' });
    const [row] = await tools.find(f.client, 'context-a');
    const opened = await tools.open(f.client, 'context-a', row);
    assert.equal((await fetch(new URL('/graph', opened.url))).status, 200);
  }
  assert.deepEqual(received, ['/api/v1/query_range?query=up&start=1&end=2&step=1', '/graph', '/api/v2/alerts?active=true', '/graph']);
});

test('query separates a missing tool from an ambiguous target', async () => {
  const signal = new AbortController().signal;
  const missing = fixture();
  assert.deepEqual(await missing.tools.query(missing.client, 'context-a', 'loki', '/ready', [], signal), { error: 'unconfigured' });
  const f = fixture(); f.state.service.metadata.name = 'wake-loki';
  f.state.services = [f.state.service, { ...structuredClone(f.state.service), metadata: { name: 'loki', namespace: 'other', uid: 'service-b' } }];
  assert.deepEqual(await f.tools.query(f.client, 'context-a', 'loki', '/ready', [], signal), { error: 'target' });
});

test('OpenCost allocation uses the fixed read path and closes a waiting response on cancellation', async t => {
  let requested, disconnected;
  const waiting = new Promise(resolve => { requested = resolve; });
  const closed = new Promise(resolve => { disconnected = resolve; });
  const upstream = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' || url.pathname !== '/allocation') { res.writeHead(404).end(); return; }
    if (url.searchParams.get('window') === '7d') {
      res.once('close', disconnected);
      requested();
    } else {
      res.end('{"code":200,"data":[]}');
    }
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  const port = upstream.address().port;
  const controller = new AbortController();
  const allocation = readCostAllocation(port, { window: '7d' }, controller.signal);
  await waiting;
  controller.abort();
  await assert.rejects(allocation, { name: 'AbortError' });
  await closed;
  assert.deepEqual(await readCostAllocation(port, { window: '1h' }, new AbortController().signal), { code: 200, data: [] });
});

test('return226 kind HTTP port contracts ignore array order and reject duplicate HTTP candidates or wrong numbers', async () => {
  const cases = [
    { name: 'argocd-server', kind: 'argocd', ports: [{ name: 'http', port: 80, targetPort: 8080 }, { name: 'https', port: 443, targetPort: 8080 }], selected: 'http', servicePort: 80, target: 8080 },
    { name: 'wake-loki', kind: 'loki', ports: [{ name: 'http-metrics', port: 3100, targetPort: 'http-metrics' }, { name: 'grpc', port: 9095, targetPort: 'grpc' }], selected: 'http-metrics', servicePort: 3100, target: 3100 },
    { name: 'wake-tempo', kind: 'tempo', ports: [{ name: 'tempo-prom-metrics', port: 3200, targetPort: 3200 }, { name: 'tempo-otlp-http', port: 4318, targetPort: 4318 }], selected: 'tempo-prom-metrics', servicePort: 3200, target: 3200 },
    { name: 'kps-prometheus', kind: 'prometheus', ports: [{ name: 'http-web', port: 9090, targetPort: 9090 }, { name: 'reloader-web', port: 8080, targetPort: 'reloader-web' }], selected: 'http-web', servicePort: 9090, target: 9090 },
    { name: 'kps-alertmanager', kind: 'alertmanager', ports: [{ name: 'http-web', port: 9093, targetPort: 9093 }, { name: 'reloader-web', port: 8080, targetPort: 'reloader-web' }], selected: 'http-web', servicePort: 9093, target: 9093 },
  ];
  for (const contract of cases) {
    for (const reversed of [false, true]) {
      const f = fixture(); f.state.service.metadata.name = contract.name; f.state.endpoint.metadata.name = contract.name;
      f.state.service.spec.ports = structuredClone(reversed ? [...contract.ports].reverse() : contract.ports);
      f.state.endpoint.subsets[0].ports = [{ name: contract.selected, port: contract.target }];
      const [row] = await f.tools.find(f.client, 'context-a');
      assert.equal(row.kind, contract.kind); assert.equal(row.selection, 'verified'); assert.equal(row.port, contract.servicePort); assert.equal(row.portName, contract.selected);
      const duplicate = f.state.service.spec.ports.find(p => p.name === contract.selected); f.state.service.spec.ports.push({ ...duplicate });
      assert.equal((await f.tools.find(f.client, 'context-a'))[0].selection, 'unverified');
    }
    for (const wrong of ['number', 'target', 'protocol']) {
      const f = fixture(); f.state.service.metadata.name = contract.name; f.state.endpoint.metadata.name = contract.name;
      f.state.service.spec.ports = structuredClone(contract.ports); f.state.endpoint.subsets[0].ports = [{ name: contract.selected, port: contract.target }];
      const selected = f.state.service.spec.ports.find(p => p.name === contract.selected);
      if (wrong === 'number') selected.port++;
      if (wrong === 'target') selected.targetPort = contract.target + 1;
      if (wrong === 'protocol') selected.protocol = 'UDP';
      assert.equal((await f.tools.find(f.client, 'context-a'))[0].selection, 'unverified');
    }
  }
});

test('operator_fixed_discovery_uses_exact_Pod_without_Endpoints_or_LIST_and_rejects_renderer_registration', async () => {
  const f = fixture(), calls = [], original = f.client.request;
  f.state.pod.spec = { containers: [{ ports: [{ name: 'grafana', containerPort: 3000, protocol: 'TCP' }] }] };
  f.client.request = async (method, route) => { calls.push(route); assert.notEqual(route, '/api/v1/services'); assert.ok(!route.includes('/endpoints/')); return original(method, route); };
  const receipt = { contextId: 'context-a', kind: 'grafana', namespace: f.state.pod.metadata.namespace, podName: f.state.pod.metadata.name,
    podUid: f.state.pod.metadata.uid, serviceName: f.state.service.metadata.name, serviceUid: f.state.service.metadata.uid };
  const entries = [{ receipt, client: f.client, validate: async () => {} }];
  const [row] = await f.tools.findFixed('context-a', entries);
  const opened = await f.tools.open({ request: () => { throw new Error('observer credential must not be used'); } }, 'context-a', row);
  assert.equal(opened.source, 'operator-fixed-pod'); assert.equal(opened.binding.podUid, receipt.podUid);
  const [unchanged] = await f.tools.findFixed('context-a', entries);
  assert.equal(unchanged.bindingId, row.bindingId);
  await opened.validate();
  await assert.rejects(() => f.tools.open(f.client, 'context-a', { ...row, bindingId: 'renderer-created' }));
  await assert.rejects(() => f.tools.findFixed('context-a', [...entries, ...entries]));
  f.state.pod.status.conditions[0].status = 'False';
  const [unavailable] = await f.tools.findFixed('context-a', entries);
  assert.equal(unavailable.selection, 'not-ready');
  assert.equal(unavailable.bindingId, undefined);
  await assert.rejects(() => opened.validate(), { kind: 'unreachable' });
  await assert.rejects(() => f.tools.rebind(f.client, 'context-a', row, entries), { kind: 'unreachable' });
  f.state.pod.status.conditions[0].status = 'True';
  const originalName = f.state.pod.spec.containers[0].ports[0].name;
  f.state.service.spec.ports[0].targetPort = 'grafana'; f.state.pod.spec.containers[0].ports[0].name = 'different';
  await assert.rejects(() => opened.validate());
  f.state.pod.spec.containers[0].ports[0].name = originalName;
  f.state.pod.metadata.uid = 'changed';
  await assert.rejects(() => opened.validate());
  assert.ok(calls.length > 0);
});

test('finished operation scope does not expire a persistent browser forward or its later target checks', async () => {
  const f = fixture(); let scopeProvider, target;
  const tools = createTools({ forward: async (client, resolve, scope) => {
    assert.equal(client, f.client); scopeProvider = scope; target = resolve;
    await target(); return { port: 12345, close() {} };
  } });
  const [row] = await tools.find(f.client, 'context-a');
  const controller = new AbortController(), scope = { signal: controller.signal, deadline: Date.now() + 60000 };
  await tools.open(f.client, 'context-a', row, scope);
  assert.equal(scopeProvider(), scope);
  scope.finished = true; scope.deadline = 1; controller.abort();
  assert.equal(scopeProvider(), undefined);
  assert.deepEqual(await target(), { ns: 'monitoring', pod: 'grafana-a', port: 3000 });
  tools.closeAll();
});

test('transient Kubernetes read errors keep an open forward but never verify or grant new access', async () => {
  const f = fixture(), [row] = await f.tools.find(f.client, 'context-a');
  await f.tools.open(f.client, 'context-a', row);
  const request = f.client.request;
  let fail = { kind: 'unreachable' };
  f.client.request = async (method, route) => { if (fail && route.includes('/endpoints/')) throw Object.assign(new Error('x'), fail); return request(method, route); };
  const [held] = await f.tools.find(f.client, 'context-a', { refresh: true });
  assert.equal(held.selection, 'unverified'); assert.equal(held.bindingId, undefined);
  assert.equal(f.tools.isBound('context-a', row), true); assert.equal(f.state.closed, 0);
  await assert.rejects(f.tools.open(f.client, 'context-a', row), { kind: 'unreachable' });
  assert.equal(f.state.closed, 0);
  fail = null;
  assert.equal((await f.tools.find(f.client, 'context-a', { refresh: true }))[0].bindingId, row.bindingId);
  assert.equal((await f.tools.open(f.client, 'context-a', row)).url, 'http://127.0.0.1:12345/');
  f.tools.closeAll();
});
test('transient errors do not create a binding for fresh discovery or one without a forward', async () => {
  for (const kind of ['unreachable', 'timeout']) {
    const f = fixture(), request = f.client.request;
    f.client.request = async (method, route) => { if (route.includes('/endpoints/')) throw Object.assign(new Error('x'), { kind }); return request(method, route); };
    const [row] = await f.tools.find(f.client, 'context-a');
    assert.equal(row.selection, 'unverified'); assert.equal(row.bindingId, undefined);
    assert.equal(f.tools.isBound('context-a', row), false);
    await assert.rejects(f.tools.open(f.client, 'context-a', row)); assert.equal(f.state.forwarded, 0);
  }
  const f = fixture(), [row] = await f.tools.find(f.client, 'context-a'), request = f.client.request;
  f.client.request = async (method, route) => { if (route.includes('/endpoints/')) throw Object.assign(new Error('x'), { kind: 'unreachable' }); return request(method, route); };
  await f.tools.find(f.client, 'context-a', { refresh: true });
  assert.equal(f.tools.isBound('context-a', row), false);
});
test('authoritative changes and unrecognised errors revoke the old binding and forward', async () => {
  const cases = {
    forbidden: f => { const r = f.client.request; f.client.request = async (m, u) => { if (u.includes('/endpoints/')) throw Object.assign(new Error('x'), { status: 403, kind: 'forbidden' }); return r(m, u); }; },
    plain: f => { const r = f.client.request; f.client.request = async (m, u) => { if (u.includes('/endpoints/')) throw new Error('boom'); return r(m, u); }; },
    unknownKind: f => { const r = f.client.request; f.client.request = async (m, u) => { if (u.includes('/endpoints/')) throw Object.assign(new Error('x'), { kind: 'cert' }); return r(m, u); }; },
    missing: f => { f.state.services = []; },
    uid: f => { f.state.services[0].metadata.uid = 'replacement'; const r = f.client.request; f.client.request = async (m, u) => { if (u.includes('/endpoints/')) throw Object.assign(new Error('x'), { kind: 'unreachable' }); return r(m, u); }; },
    endpoint: f => { f.state.pod.metadata.uid = 'pod-b'; f.state.endpoint.subsets[0].addresses[0].targetRef.uid = 'pod-b'; },
  };
  for (const [name, change] of Object.entries(cases)) {
    const f = fixture(), [row] = await f.tools.find(f.client, 'context-a');
    await f.tools.open(f.client, 'context-a', row);
    change(f);
    await f.tools.find(f.client, 'context-a', { refresh: true }).catch(() => {});
    assert.equal(f.tools.isBound('context-a', row), false, name); assert.equal(f.state.closed, 1, name);
  }
});

test('transient errors suspend new connections on a kept forward until the same binding is reverified', async () => {
  let guard;
  const f = fixture();
  const tools = createTools({ forward: async (_c, _t, _s, _i, g) => { guard = g; return { port: 12345, close() { f.state.closed++; } }; } });
  const [row] = await tools.find(f.client, 'context-a');
  await tools.open(f.client, 'context-a', row);
  await guard();
  const request = f.client.request; let fail = true;
  f.client.request = async (method, route) => { if (fail && route.includes('/endpoints/')) throw Object.assign(new Error('x'), { kind: 'timeout' }); return request(method, route); };
  await tools.find(f.client, 'context-a', { refresh: true });
  await assert.rejects(guard(), { kind: 'timeout' });
  assert.equal(tools.isBound('context-a', row), true); assert.equal(f.state.closed, 0);
  fail = false; f.state.pod.metadata.uid = 'pod-b';
  await assert.rejects(guard(), { kind: 'identity_changed' });
  f.state.pod.metadata.uid = 'pod-a';
  await guard();
  fail = true;
  await guard();
  tools.closeAll();
});
test('an authoritative forbidden error is not masked by a timeout on the parallel read', async () => {
  const f = fixture(), request = f.client.request;
  f.client.request = async (method, route) => {
    if (route.includes('/services/')) throw Object.assign(new Error('x'), { kind: 'timeout' });
    if (route.includes('/endpoints/')) { await new Promise(resolve => setTimeout(resolve, 5)); throw Object.assign(new Error('x'), { status: 403, kind: 'forbidden' }); }
    return request(method, route);
  };
  const [row] = await f.tools.find(f.client, 'context-a');
  assert.deepEqual(row.permission, { verb: 'get', resource: 'endpoints', namespace: 'monitoring' });
});

/* B1 (U-01 V-1459): a request the tool never answers within the request limit is a timeout, even when the forward's socket is torn down by that same abort
   (the race the hub saw at ~20 s as "connection"); a refused or dropped connection is a connection error. The error carries the common contract kind. */
test('query classifies an unanswered request as timeout and a refused or dropped one as connection', async t => {
  const net = require('node:net');
  const prom = f => { f.state.service.metadata.name = 'kps-prometheus'; f.state.endpoint.metadata.name = 'kps-prometheus'; f.state.service.spec.ports = [{ name: 'http-web', port: 9090, targetPort: 9090 }]; f.state.endpoint.subsets[0].ports = [{ name: 'http-web', port: 9090 }]; return f; };
  const route = '/api/v1/query?query=up';
  /* silent: accepts and never answers; when the caller gives up, the forward drops its sockets (as the port forward does on the scope's abort) */
  const held = new Set(), silent = net.createServer(socket => { held.add(socket); socket.on('close', () => held.delete(socket)); });
  await new Promise(resolve => silent.listen(0, '127.0.0.1', resolve));
  t.after(() => { for (const s of held) s.destroy(); silent.close(); });
  {
    const f = prom(fixture()), caller = new AbortController();
    const tools = createTools({ forward: async () => ({ port: silent.address().port, close() {} }) });
    t.after(() => tools.closeAll());
    caller.signal.addEventListener('abort', () => { for (const s of held) s.destroy(); });
    setTimeout(() => caller.abort(new DOMException('limit', 'TimeoutError')), 300);
    await assert.rejects(tools.query(f.client, 'context-a', 'prometheus', route, [], caller.signal), error => error.kind === 'timeout' && !/127\.0\.0\.1/.test(error.message));
  }
  {
    /* refused: nothing listens on the forwarded port */
    const closed = net.createServer(); await new Promise(resolve => closed.listen(0, '127.0.0.1', resolve)); const port = closed.address().port; await new Promise(resolve => closed.close(resolve));
    const f = prom(fixture()), tools = createTools({ forward: async () => ({ port, close() {} }) });
    t.after(() => tools.closeAll());
    await assert.rejects(tools.query(f.client, 'context-a', 'prometheus', route, [], new AbortController().signal), error => error.kind === 'connection');
  }
  {
    /* dropped: the connection closes without an answer */
    const drop = net.createServer(socket => socket.destroy());
    await new Promise(resolve => drop.listen(0, '127.0.0.1', resolve)); t.after(() => drop.close());
    const f = prom(fixture()), tools = createTools({ forward: async () => ({ port: drop.address().port, close() {} }) });
    t.after(() => tools.closeAll());
    await assert.rejects(tools.query(f.client, 'context-a', 'prometheus', route, [], new AbortController().signal), error => error.kind === 'connection');
  }
});

test('prometheus_queries_inside_the_validation_ttl_reuse_the_verified_binding_instead_of_four_reads_each', async t => {
  const upstream = http.createServer((req, res) => res.end('{"status":"success"}'));
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => upstream.close());
  const f = fixture(); f.state.service.metadata.name = 'kps-prometheus'; f.state.endpoint.metadata.name = 'kps-prometheus';
  f.state.service.spec.ports = [{ name: 'http-web', port: 9090, targetPort: 9090 }]; f.state.endpoint.subsets[0].ports = [{ name: 'http-web', port: 9090 }];
  let clock = 1_000_000;
  const tools = createTools({ forward: async () => ({ port: upstream.address().port, close() {} }), now: () => clock });
  t.after(() => tools.closeAll());
  const signal = new AbortController().signal, route = '/api/v1/query?query=up';
  assert.equal((await tools.query(f.client, 'context-a', 'prometheus', route, [], signal)).status, 200);
  const first = f.state.reads.length;
  for (let i = 0; i < 3; i++) assert.equal((await tools.query(f.client, 'context-a', 'prometheus', route, [], signal)).status, 200);
  assert.equal(f.state.reads.length, first, 'three more queries inside the TTL read nothing from the API server');
  clock += 31_000;
  await tools.query(f.client, 'context-a', 'prometheus', route, [], signal);
  assert.ok(f.state.reads.length > first, 'after the TTL the binding is verified again');
});

test('discovery_with_a_max_age_reuses_a_recent_result_and_refresh_still_reads_again', async () => {
  const { client, state, tools } = fixture();
  let clock = 0;
  const timed = createTools({ forward: async () => ({ port: 1, close() {} }), now: () => clock });
  await timed.find(client, 'context-a');
  await timed.find(client, 'context-a', { maxAge: 120_000 });
  assert.equal(state.reads.filter(route => route === '/api/v1/services').length, 1);
  clock += 121_000;
  await timed.find(client, 'context-a', { maxAge: 120_000 });
  await timed.find(client, 'context-a', { refresh: true, maxAge: 120_000 });
  assert.equal(state.reads.filter(route => route === '/api/v1/services').length, 3);
  void tools;
});

test('grafana_search_goes_through_the_query_path_with_the_viewer_token_and_loki_rules_are_readable', async t => {
  const received = [];
  const upstream = http.createServer((req, res) => { received.push([req.url, req.headers.authorization]); res.end('[]'); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => upstream.close());
  const f = fixture();
  const tools = createTools({ forward: async () => ({ port: upstream.address().port, close() {} }) });
  t.after(() => tools.closeAll());
  const signal = new AbortController().signal;
  assert.equal((await tools.query(f.client, 'context-a', 'grafana', '/api/search?type=dash-db', [], signal, 'application/json', 'viewer-token')).status, 200);
  assert.deepEqual(await tools.query(f.client, 'context-a', 'grafana', '/api/admin/users', [], signal, 'application/json', 'viewer-token'), { error: 'route' });
  assert.deepEqual(received, [['/api/search?type=dash-db', 'Bearer viewer-token']]);
  const l = fixture(); l.state.service.metadata.name = 'wake-loki'; l.state.endpoint.metadata.name = 'wake-loki';
  l.state.service.spec.ports = [{ name: 'http-metrics', port: 3100, targetPort: 3100 }]; l.state.endpoint.subsets[0].ports = [{ name: 'http-metrics', port: 3100 }];
  const lokiTools = createTools({ forward: async () => ({ port: upstream.address().port, close() {} }) });
  t.after(() => lokiTools.closeAll());
  assert.equal((await lokiTools.query(l.client, 'context-a', 'loki', '/loki/api/v1/rules', [], signal)).status, 200);
});
