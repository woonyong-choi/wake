/* 허브 저장소·도구 층·외부 AI 서버·승인·내장 AI(공급자 대역): node --test apps/wake/desktop/hub.test.cjs. 합성 자료와 대역은 이 파일 안에만 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHubStore } = require('./hub-store.cjs');
const { createToolLayer } = require('./hub-tools.cjs');
const { createHubServer } = require('./hub-server.cjs');
const { createApprovals } = require('./approvals.cjs');
const { createAiRunner } = require('./ai-run.cjs');

const maskText = s => { const out = String(s).replace(/password=\S+/g, 'password=••••'); return { text: out, n: out === s ? 0 : 1 }; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wake-hub-test-'));
const DAY = 86_400_000;

test('the store masks every text before it is written and prunes rows older than 90 days', () => {
  let now = Date.parse('2026-11-15T00:00:00Z');
  const dir = tmp(), store = createHubStore({ userData: dir, maskText, now: () => now });
  const log = store.log('audit');
  const row = log.append({ args: { cmd: 'login password=hunter2' } });
  assert.equal(row.masked, 1);
  const raw = fs.readFileSync(path.join(dir, 'hub', 'audit.jsonl'), 'utf8');
  assert.ok(!raw.includes('hunter2'), 'the secret never reaches the disk');
  assert.equal((fs.statSync(path.join(dir, 'hub', 'audit.jsonl')).mode & 0o777), 0o600);
  assert.equal((fs.statSync(path.join(dir, 'hub')).mode & 0o777), 0o700);
  store.docs('incidents').put('i1', { title: 'x' });
  now += 91 * DAY;
  log.append({ args: {} });
  assert.equal(store.prune(), 2);
  assert.equal(log.list().length, 1);
  assert.equal(store.docs('incidents').all().length, 0);
});

function layer(extra = {}) {
  const store = createHubStore({ userData: tmp(), maskText });
  /* 출처 상태는 공통 계약 v1(정상 ready); 도구 층은 출처 하나를 sourceState로 받는다 */
  const sources = { state: () => [{ id: 'kubernetes', state: 'ready', last: 1 }], sourceState: (_id, source) => ({ id: source, state: 'ready', last: 1 }), kube: async () => ({ items: [{ metadata: { name: 'p1', namespace: 'shop', uid: 'u1', creationTimestamp: '2026-11-15T00:00:00Z' }, status: { phase: 'Running' } }] }),
    list: async () => [], get: async () => null, promRange: async () => [], ...extra.sources };
  const hub = { get: () => null, rows: () => [], scan: async () => null, ...extra.hub };
  const approvals = { propose: async () => ({ approval: 'apr-1', plan: { route: 'command' }, state: 'waiting' }) };
  return { store, tools: createToolLayer({ sources, hub, store, approvals, screen: { get: async () => ({}), set: async () => ({}) }, contexts: () => ['c1'], report: async () => ({}) }) };
}
const external = (scope, transport = 'mcp') => ({ transport, requester: { kind: 'external', name: 'cli' }, client: 'cli', scope });

/* R4: asked which Pods restart, the AI listed Pods (phase only) and then read each Pod with get_resource (6 calls). A Pod row says what the
   list screen says: ready containers, restarts, the waiting or last terminated reason and the Node */
test('list_resources gives a Pod row its ready count, restarts, reason and node so the model needs no read per Pod', async () => {
  const pod = { metadata: { name: 'api-1', namespace: 'shop', uid: 'u1', creationTimestamp: '2026-11-15T00:00:00Z' }, spec: { nodeName: 'worker-a' },
    status: { phase: 'Running', containerStatuses: [
      { name: 'app', ready: false, restartCount: 7, state: { waiting: { reason: 'CrashLoopBackOff' } }, lastState: { terminated: { reason: 'OOMKilled', exitCode: 137 } } },
      { name: 'sidecar', ready: true, restartCount: 1, state: { running: {} } }] } };
  const { tools } = layer({ sources: { kube: async () => ({ items: [pod] }) } });
  const [row] = (await tools.call('list_resources', { cluster: 'c1', namespace: 'shop', kind: 'Pod' }, external({ cluster: 'c1', namespaces: ['shop'], kinds: [] }))).result;
  assert.equal(row.restarts, 8);
  assert.deepEqual(row.ready, { ready: 1, total: 2 });
  assert.equal(row.reason, 'CrashLoopBackOff');
  assert.equal(row.lastTerminated, 'OOMKilled');
  assert.equal(row.node, 'worker-a');
  assert.equal(row.status, 'Running');
});

test('the tool layer has the 23 tools, each with a JSON schema, and only propose_action is not read-only', () => {
  const { tools } = layer();
  const list = tools.list();
  assert.equal(list.length, 23);
  for (const t of list) assert.equal(t.inputSchema.type, 'object', t.name);
  assert.deepEqual(list.filter(t => !t.readOnly).map(t => t.name), ['propose_action']);
});

test('a call is checked, scoped and audited with its transport; out of scope ends forbidden and is recorded', async () => {
  const { tools, store } = layer();
  const ok = await tools.call('list_resources', { cluster: 'c1', namespace: 'shop', kind: 'Pod' }, external({ cluster: 'c1', namespaces: ['shop'], kinds: [] }));
  assert.equal(ok.result[0].name, 'p1');
  assert.deepEqual(ok.source, { id: 'kubernetes', state: 'ready', last: 1 });
  const other = await tools.call('list_resources', { cluster: 'c1', namespace: 'kube-system', kind: 'Pod' }, external({ cluster: 'c1', namespaces: ['shop'], kinds: [] }));
  /* B2-07: outside the caller's scope is its own code with words for the model, never the RBAC 'forbidden' */
  assert.equal(other.error, 'out_of_scope');
  assert.match(other.detail, /outside the scope[\s\S]*not a Kubernetes permission/);
  assert.deepEqual(other.scope, { cluster: 'c1', namespaces: ['shop'] });
  const bad = await tools.call('list_resources', { cluster: 'c1', kind: 'Pod', extra: 1 }, external({ cluster: 'c1' }, 'api'));
  assert.equal(bad.error, 'invalid_request');
  const rows = store.log('audit').list();
  assert.deepEqual(rows.map(r => [r.tool, r.transport, r.result]), [['list_resources', 'mcp', 'ok'], ['list_resources', 'mcp', 'forbidden'], ['list_resources', 'api', 'failed']]);
  assert.equal(rows[0].client, 'cli');
  const screen = await tools.call('list_resources', { cluster: 'c1', kind: 'Pod' }, { transport: 'desktop', requester: { kind: 'human', name: 'me' }, screen: true });
  assert.ok(screen.result);
  assert.equal(store.log('audit').list().length, 3, 'a screen read is not a tool call');
});

test('results are masked before they leave the tool layer', async () => {
  const { tools } = layer({ sources: { kube: async () => ({ object: 1, metadata: { name: 'cm', annotations: { note: 'password=abc' } } }) } });
  const r = await tools.call('get_resource', { cluster: 'c1', namespace: 'shop', kind: 'ConfigMap', name: 'cm' }, external({ cluster: 'c1' }));
  assert.equal(r.result.object.metadata.annotations.note, 'password=••••');
  assert.equal(r.masked, 1);
});

test('the server answers MCP and the HTTP API only with a client token of that transport, only on 127.0.0.1', async () => {
  const { tools, store } = layer();
  const server = createHubServer({ store, tools });
  const port = 40000 + Math.floor(Math.random() * 20000);
  const st = await server.set({ mcp: true, api: true, port });
  assert.equal(st.url, `http://127.0.0.1:${port}`);
  const mcp = server.addClient({ name: 'agent', transport: 'mcp', scope: { cluster: 'c1' } });
  const api = server.addClient({ name: 'script', transport: 'api', scope: { cluster: 'c1' } });
  assert.ok(!JSON.stringify(store.docs('ai-clients').all()).includes(mcp.token), 'only the token hash is stored');
  const post = (p, token, body) => fetch(st.url + p, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const init = await (await post('/mcp', mcp.token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).json();
  assert.equal(init.result.serverInfo.name, 'wake');
  const listed = await (await post('/mcp', mcp.token, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
  assert.equal(listed.result.tools.length, 23);
  const called = await (await post('/mcp', mcp.token, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_resources', arguments: { cluster: 'c1', kind: 'Pod' } } })).json();
  assert.equal(called.result.structuredContent.result[0].name, 'p1');
  assert.equal((await post('/mcp', api.token, { jsonrpc: '2.0', id: 4, method: 'ping' })).status, 403, 'an API client cannot use MCP');
  assert.equal((await post('/api/v1/tools/list_resources', 'nope', {})).status, 401);
  assert.equal((await post('/api/v1/tools/list_resources', api.token, { cluster: 'c1', kind: 'Pod' })).status, 200);
  assert.equal((await fetch(st.url + '/api/v1/tools', { headers: { authorization: `Bearer ${api.token}`, origin: 'https://example.invalid' } })).status, 403, 'browser pages are refused');
  assert.deepEqual(store.log('audit').list().map(r => r.transport), ['mcp', 'api']);
  await server.set({ mcp: false, api: false });
  assert.equal(server.state().listening, false);
});

test('approvals keep the first decision, never run anything, and record a Draft PR that cannot be made without GitHub', async () => {
  const store = createHubStore({ userData: tmp(), maskText });
  const audits = [];
  const plan = { id: 'raise-memory', route: 'pr', values: [{ path: 'a.b', before: '1', after: '2' }] };
  const hub = { get: () => ({ cluster: 'c1' }), workspace: async () => ({ options: [{ id: 'raise-memory', title: 'raise', plan }] }), choose: () => {} };
  const approvals = createApprovals({ store, hub, sources: {}, audit: r => audits.push(r) });
  const p = await approvals.propose({ incident: 'i1', option: 'raise-memory', target: { cluster: 'c1', namespace: 'shop', kind: 'Deployment', name: 'api' } }, external({ cluster: 'c1' }));
  assert.equal(p.state, 'waiting');
  assert.equal(approvals.pending().length, 1);
  const d = approvals.decide(p.approval, 'allow', { by: 'oncall' });
  assert.equal(d.state, 'approved');
  assert.equal(d.pr, 'github-unconnected');
  const again = approvals.decide(p.approval, 'deny', { by: 'someone' });
  assert.equal(again.state, 'approved');
  assert.equal(again.replayed, true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].summary.$t, 'wake.audit.approve.prUnconnected');
});

test('the built-in AI runs tools in the main process and records the model call (provider stand-in)', async t => {
  const store = createHubStore({ userData: tmp(), maskText });
  const { tools } = layer();
  const audits = [];
  const replies = [{ content: [{ type: 'tool_use', id: 't1', name: 'list_resources', input: { cluster: 'c1', kind: 'Pod' } }] }, { content: [{ type: 'text', text: 'p1 is Running.' }], usage: { input_tokens: 3, output_tokens: 2 } }];
  t.mock.method(globalThis, 'fetch', async url => ({ ok: true, status: 200, json: async () => (String(url).endsWith('/v1/models') ? { data: [{ id: 'stand-in' }] } : replies.shift()) }));
  const runner = createAiRunner({ store, tools, secret: (method, target) => (method === 'ai-key' && target === 'anthropic' ? 'test-key' : null), audit: r => audits.push(r), maskText });
  assert.deepEqual((await runner.providers()).map(p => p.id), ['anthropic']);
  const events = [];
  const r = await runner.run({ messages: [{ role: 'user', text: 'pods? password=x' }], model: { provider: 'anthropic', model: 'stand-in' }, scope: { cluster: 'c1' } }, e => events.push(e));
  assert.deepEqual(events.map(e => [e.type, e.state]), [['step', 'run'], ['step', 'done'], ['text', undefined], ['done', undefined]]);
  assert.equal(audits.filter(a => a.action === 'model').length, 2);
  assert.equal(audits[0].masked, 1, 'the question was masked before the model saw it');
  assert.equal(runner.list()[0].id, r.conversation);
});

test('without a provider the built-in AI saves the question and failure under its returned conversation id', async t => {
  const store = createHubStore({ userData: tmp(), maskText });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('ECONNREFUSED'); });
  const runner = createAiRunner({ store, tools: layer().tools, secret: () => null, audit: () => {}, maskText });
  assert.deepEqual(await runner.providers(), []);
  const events = [];
  const result = await runner.run({ messages: [{ role: 'user', text: 'hi' }] }, e => events.push(e));
  assert.equal(result.error, 'unconfigured');
  assert.ok(result.conversation);
  /* B-09: 모델 없음은 설정 › AI 공급자·모델로 가는 동작(링크)을 함께 준다. 다시 연 대화의 오류 조각도 같은 동작 */
  const link = { label: { $t: 'wake.settings.ai', vars: {} }, action: 'kit.navigate', arg: { address: 'wake://settings/ai-models' } };
  assert.deepEqual(events, [{ type: 'error', message: { $t: 'wake.ai.noModel', vars: {} }, action: link, conversation: result.conversation }]);
  assert.deepEqual(runner.list().find(c => c.id === result.conversation).messages[1].parts, [{ type: 'error', text: { $t: 'wake.ai.noModel', vars: {} }, action: link }]);
  const saved = store.docs('conversations').get(result.conversation);
  assert.equal(saved.messages[0].text, 'hi');
  assert.equal(saved.messages[1].error, 'unconfigured');
});
