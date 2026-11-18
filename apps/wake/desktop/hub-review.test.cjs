/* 백엔드·보안 검토 지적(spec/data-policy.md#DP-REVIEW): 도구 층 범위·권한, Secret·last-applied, 시각 형식, 로그 잘림, 지표 step, 감지 페이지 읽기,
 * 외부 서버 남용 막기, 자동 해석 기본 꺼짐, 식별 필드 가리지 않기, 깨진 저장 파일 격리. 합성 대역만 쓴다 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const { createHubStore } = require('./hub-store.cjs');
const { createToolLayer } = require('./hub-tools.cjs');
const { createHubServer } = require('./hub-server.cjs');
const { createIncidentHub } = require('./incident-hub.cjs');
const { createAiRunner } = require('./ai-run.cjs');

const plainMask = s => ({ text: String(s), n: 0 });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wake-review-'));
const iso = ms => new Date(ms).toISOString();

function layer({ sources = {}, hub = {}, approvals = {} } = {}) {
  const store = createHubStore({ userData: tmp(), maskText: plainMask });
  const base = { state: () => [], sourceState: (_id, s) => ({ id: s, state: 'ready', last: 1 }), kube: async () => ({ items: [] }), list: async () => [], get: async () => null, promRange: async () => [] };
  const tools = createToolLayer({ sources: { ...base, ...sources }, hub: { get: () => null, rows: () => [], scan: async () => null, ...hub }, store, approvals: { propose: async () => ({ approval: 'a1', state: 'waiting' }), ...approvals },
    screen: { get: async () => ({ view: 'x' }), set: async () => ({ applied: [] }) }, contexts: () => ['c1'], report: async () => ({}) });
  return { tools, store };
}
const ext = scope => ({ transport: 'mcp', requester: { kind: 'external', name: 'cli' }, client: 'cli', scope });
const ai = (scope, permission = 'read') => ({ transport: 'desktop', requester: { kind: 'ai', name: 'Wake' }, permission, scope });

test('S01_get_resource_never_returns_last_applied_or_secret_values', async () => {
  const lastApplied = 'kubectl.kubernetes.io/last-applied-configuration';
  const { tools } = layer({ sources: { kube: async (_id, route) => (route.includes('/secrets/')
    ? { kind: 'Secret', metadata: { name: 's', annotations: { [lastApplied]: '{"data":{"pw":"aHVudGVy"}}' } }, data: { pw: 'aHVudGVy' }, stringData: { pw: 'hunter' } }
    : { kind: 'ConfigMap', metadata: { name: 'cm', annotations: { [lastApplied]: '{"data":{"token":"abc"}}', keep: 'yes' } }, data: { a: '1' } }) } });
  const cm = await tools.call('get_resource', { cluster: 'c1', namespace: 'shop', kind: 'ConfigMap', name: 'cm' }, ext({ cluster: 'c1' }));
  assert.equal(cm.result.object.metadata.annotations[lastApplied], undefined);
  assert.equal(cm.result.object.metadata.annotations.keep, 'yes');
  const secret = await tools.call('get_resource', { cluster: 'c1', namespace: 'shop', kind: 'Secret', name: 's' }, ext({ cluster: 'c1' }));
  assert.ok(!JSON.stringify(secret).includes('aHVudGVy') && !JSON.stringify(secret).includes('hunter'));
  assert.deepEqual(secret.result.object.data, { pw: '' });
});

test('S04_built_in_ai_without_scope_is_refused_and_read_permission_cannot_propose', async () => {
  const { tools } = layer();
  assert.equal((await tools.call('list_resources', { cluster: 'c1', kind: 'Pod' }, ai(undefined))).error, 'out_of_scope', 'no scope, no read');
  assert.equal((await tools.call('list_resources', { cluster: 'c2', kind: 'Pod' }, ai({ cluster: 'c1', namespaces: [], kinds: [] }))).error, 'out_of_scope', 'another cluster');
  assert.ok(!(await tools.call('list_resources', { cluster: 'c1', kind: 'Pod' }, ai({ cluster: 'c1', namespaces: [], kinds: [] }))).error);
  const propose = { target: { cluster: 'c1', namespace: 'shop', kind: 'Deployment', name: 'api' }, change: { title: 'x' } };
  assert.equal((await tools.call('propose_action', propose, ai({ cluster: 'c1', namespaces: [], kinds: [] }, 'read'))).error, 'forbidden');
  assert.ok(!(await tools.call('propose_action', propose, ai({ cluster: 'c1', namespaces: [], kinds: [] }, 'ask'))).error);
});

test('S04_the_built_in_ai_caller_carries_the_asked_scope_and_permission', async () => {
  const seen = [];
  const store = createHubStore({ userData: tmp(), maskText: plainMask });
  const replies = [{ content: [{ type: 'tool_use', id: 't1', name: 'list_resources', input: { cluster: 'c1', kind: 'Pod' } }] }, { content: [{ type: 'text', text: 'ok' }], usage: {} }];
  const original = globalThis.fetch;
  globalThis.fetch = async url => ({ ok: true, status: 200, json: async () => (String(url).endsWith('/v1/models') ? { data: [{ id: 'm' }] } : replies.shift()) });
  try {
    const runner = createAiRunner({ store, tools: { list: () => [], call: async (n, a, caller) => { seen.push(caller); return { result: [] }; } }, secret: (m, t) => (m === 'ai-key' && t === 'anthropic' ? 'k' : null), audit() {}, maskText: plainMask });
    await runner.run({ messages: [{ role: 'user', text: 'q' }], model: { provider: 'anthropic', model: 'm' }, scope: { cluster: 'c1', namespace: 'shop' } }, () => {});
  } finally { globalThis.fetch = original; }
  assert.deepEqual(seen[0].scope, { cluster: 'c1', namespaces: ['shop'], kinds: [] });
  assert.equal(seen[0].permission, 'read');
});

test('S05_external_clients_cannot_use_screen_state_namespace_scope_cannot_read_cluster_kinds_and_app_evidence_checks_the_read_namespace', async () => {
  const inc = { id: 'i1', cluster: 'c1', target: { kind: 'Deployment', namespace: 'shop', name: 'api' }, detectedAt: 0 };
  let appRead = null;
  const { tools } = layer({ hub: { get: () => inc, cite: () => ({ n: 1, hash: 'h' }) }, sources: { get: async (_id, kind, ns, name) => { appRead = ns; return kind === 'Application' ? { metadata: { namespace: ns, name }, status: { history: [] } } : null; } } });
  assert.equal((await tools.call('get_screen_state', {}, ext({ cluster: 'c1' }))).error, 'out_of_scope');
  assert.equal((await tools.call('set_screen_state', { patch: {} }, ext({ cluster: 'c1' }))).error, 'out_of_scope');
  assert.equal((await tools.call('list_resources', { cluster: 'c1', namespace: 'shop', kind: 'Node' }, ext({ cluster: 'c1', namespaces: ['shop'] }))).error, 'out_of_scope', 'Node is cluster scoped');
  const app = await tools.call('collect_evidence', { incident: 'i1', spec: { kind: 'app', name: 'shop-app' } }, ext({ cluster: 'c1', namespaces: ['shop'] }));
  assert.equal(app.error, 'out_of_scope', 'the Application is read in argocd, outside the shop scope');
  assert.equal(appRead, null);
});

test('K09_a_window_without_a_time_zone_offset_is_refused', async () => {
  const { tools } = layer();
  const r = await tools.call('list_events', { cluster: 'c1', window: { from: '2026-11-18T00:00:00', to: '2026-11-18T01:00:00' } }, ext({ cluster: 'c1' }));
  assert.equal(r.error, 'invalid_request');
  assert.ok(!(await tools.call('list_events', { cluster: 'c1', window: { from: '2026-11-18T00:00:00+09:00', to: '2026-11-18T01:00:00Z' } }, ext({ cluster: 'c1' }))).error);
});

test('K11_read_logs_starts_at_the_window_and_says_when_it_was_cut', async () => {
  const routes = [];
  const from = Date.parse('2026-11-18T00:00:00Z');
  const lines = Array.from({ length: 2000 }, (_, i) => `${iso(from + i * 1000)} line ${i}`).join('\n');
  const { tools } = layer({ sources: { kube: async (_id, route) => { routes.push(route); return lines; } } });
  const r = await tools.call('read_logs', { cluster: 'c1', namespace: 'shop', pod: 'api-1', window: { from: iso(from), to: iso(from + 3_600_000) } }, ext({ cluster: 'c1' }));
  assert.match(routes[0], /sinceTime=2026-11-18T00%3A00%3A00Z/);
  assert.equal(r.result.truncated, true);
});

test('K10_metric_evidence_step_keeps_a_long_window_under_the_point_limit', async () => {
  const steps = [];
  const inc = { id: 'i1', cluster: 'c1', target: { kind: 'Deployment', namespace: 'shop', name: 'api' }, detectedAt: Date.now() };
  const { tools } = layer({ hub: { get: () => inc, cite: () => ({ n: 1, hash: 'h' }) }, sources: { promRange: async (_id, _q, w) => { steps.push(w); return []; } } });
  const to = Date.parse('2026-11-18T00:00:00Z'), from = to - 30 * 86_400_000;
  await tools.call('collect_evidence', { incident: 'i1', spec: { kind: 'metric', query: 'up', window: { from: iso(from), to: iso(to) } } }, ext({ cluster: 'c1' }));
  assert.ok((steps[0].to - steps[0].from) / steps[0].step <= 11_000, `points ${(steps[0].to - steps[0].from) / steps[0].step}`);
});

test('P01_list_incidents_returns_stored_incidents_without_scanning_clusters', async () => {
  let scans = 0;
  const { tools } = layer({ hub: { scan: async () => { scans++; }, rows: () => [{ id: 'i1', ns: 'shop' }] } });
  const r = await tools.call('list_incidents', {}, ext({ cluster: 'c1' }));
  assert.deepEqual(r.result.map(x => x.id), ['i1']);
  assert.equal(scans, 0);
});

test('P01_detection_reads_lists_in_pages_and_prefers_the_shared_watch_cache', async () => {
  const docs = () => { const m = new Map(); return { get: id => m.get(id) ?? null, all: () => [...m.values()], put: (id, v) => { m.set(id, { ...v, id }); return m.get(id); }, remove: id => m.delete(id), prune: () => 0 }; };
  const sets = {}, store = { docs: n => (sets[n] ??= docs()), log: () => ({ list: () => [], append: v => v, prune: () => 0 }) };
  const routes = [];
  const pod = i => ({ metadata: { name: `p${i}`, namespace: 'shop', uid: `u${i}`, managedFields: [{ big: 'x'.repeat(100) }] }, spec: { containers: [{ name: 'c' }], volumes: [{ name: 'v' }] }, status: { phase: 'Running', containerStatuses: [] } });
  const kube = async (_id, route) => { routes.push(route); if (!route.startsWith('/api/v1/pods')) return { items: [], metadata: {} };
    return route.includes('continue=next') ? { items: [pod(2)], metadata: {} } : { items: [pod(1)], metadata: { continue: 'next' } }; };
  const sources = { kube, alerts: async () => [], list: async () => { throw new Error('unpaged list used'); }, sourceState: () => ({}), state: () => [] };
  const hub = createIncidentHub({ store, sources, now: () => 1_000_000 });
  await hub.scan('c1');
  const podRoutes = routes.filter(r => r.startsWith('/api/v1/pods'));
  assert.equal(podRoutes.length, 2);
  assert.match(podRoutes[0], /limit=500/);
  assert.match(podRoutes[1], /continue=next/);
  let cachedAsked = 0;
  const hub2 = createIncidentHub({ store, sources: { ...sources, kube: async () => { throw new Error('kube used'); }, cached: async () => { cachedAsked++; return []; } }, now: () => 2_000_000 });
  await hub2.scan('c1');
  assert.ok(cachedAsked >= 8, 'every detection list came from the watch cache');
});

test('S14_external_server_caps_batches_rate_limits_keeps_last_call_in_memory_and_expires_and_rotates_tokens', async t => {
  const store = createHubStore({ userData: tmp(), maskText: plainMask });
  let clock = Date.parse('2026-11-18T00:00:00Z');
  const tools = { list: () => [], call: async () => ({ result: 1 }) };
  const server = createHubServer({ store, tools, now: () => clock });
  const port = 40000 + Math.floor(Math.random() * 20000);
  const st = await server.set({ mcp: true, api: true, port });
  t.after(() => server.set({ mcp: false, api: false }));
  const c = server.addClient({ name: 'agent', transport: 'mcp', scope: { cluster: 'c1' } });
  const post = (token, body) => fetch(st.url + '/mcp', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const ping = id => ({ jsonrpc: '2.0', id, method: 'ping' });
  assert.equal((await post(c.token, Array.from({ length: 17 }, (_, i) => ping(i)))).status, 400, 'a batch over 16 is refused');
  const writes = () => store.docs('ai-clients').get(c.id).lastCall;
  assert.equal((await post(c.token, ping(1))).status, 200);
  assert.equal(writes(), null, 'the last call is not written on every request');
  assert.ok(server.listClients()[0].lastCall, 'but the list shows it');
  let limited = false;
  for (let i = 0; i < 60 && !limited; i++) limited = (await post(c.token, ping(i))).status === 429;
  assert.ok(limited, 'too many calls in 10 seconds are rate limited');
  clock += 11_000;
  const rotated = server.rotateClient(c.id);
  assert.equal((await post(c.token, ping(2))).status, 401, 'the old token stops at rotation');
  assert.equal((await post(rotated.token, ping(3))).status, 200);
  clock += 91 * 86_400_000;
  const expired = await post(rotated.token, ping(4));
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).error, 'token_expired');
});

test('S15_incident_interpretation_sends_nothing_unless_turned_on', async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async url => { calls++; return { ok: true, status: 200, json: async () => (String(url).endsWith('/v1/models') ? { data: [{ id: 'm' }] } : { content: [{ type: 'text', text: 'x' }], usage: {} }) }; };
  try {
    const mk = on => createAiRunner({ store: createHubStore({ userData: tmp(), maskText: plainMask }), tools: { list: () => [], call: async () => ({}) }, secret: (m, t) => (m === 'ai-key' && t === 'anthropic' ? 'k' : null), audit() {}, maskText: plainMask, ...(on ? { autoInterpret: () => true } : {}) });
    assert.equal(await mk(false).interpret({ id: 'i1', target: {}, reasons: {} }, []), null);
    assert.equal(calls, 0, 'nothing went to the model by default');
    await mk(true).interpret({ id: 'i1', target: {}, reasons: {} }, []);
    assert.ok(calls > 0);
  } finally { globalThis.fetch = original; }
});

test('K01_identifier_fields_are_not_masked_but_text_is', async () => {
  const { maskText } = await import(pathToFileURL(path.join(__dirname, '../data/mask.js')).href);
  const store = createHubStore({ userData: tmp(), maskText });
  const ctx = 'admin@prod.us-west-2.eksctl.io';
  const row = store.log('audit').append({ cluster: ctx, scope: `${ctx}/shop`, target: { cluster: ctx, name: 'api' }, incident: 'i1', note: `mail ops@example.com from ${ctx}` });
  assert.equal(row.cluster, ctx);
  assert.equal(row.scope, `${ctx}/shop`);
  assert.equal(row.target.cluster, ctx);
  assert.doesNotMatch(row.note, /ops@example\.com/);
});

test('K12_a_corrupt_document_file_is_quarantined_and_not_overwritten', () => {
  const dir = tmp();
  const store = createHubStore({ userData: dir, maskText: plainMask });
  store.docs('incidents').put('i1', { cluster: 'c1' });
  const f = path.join(dir, 'hub', 'incidents.json');
  fs.writeFileSync(f, '{"i1": {"cluster": "c1"}, "i2": {');
  const reopened = createHubStore({ userData: dir, maskText: plainMask });
  assert.deepEqual(reopened.docs('incidents').all(), []);
  assert.throws(() => reopened.docs('incidents').put('i3', { cluster: 'c1' }), e => e.kind === 'store_corrupt');
  assert.equal(fs.readFileSync(f, 'utf8'), '{"i1": {"cluster": "c1"}, "i2": {', 'the damaged file is kept as it was');
  assert.ok(fs.readdirSync(path.join(dir, 'hub')).some(n => n.startsWith('incidents.json.corrupt-')), 'a quarantine copy exists');
});
