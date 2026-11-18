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
  const plan = { id: 'raise-memory', route: 'pr', target: { kind: 'Deployment', namespace: 'shop', name: 'api' }, values: [{ path: 'a.b', before: '1', after: '2' }] };
  const hub = { get: () => ({ cluster: 'c1', target: plan.target }), workspace: async () => ({ options: [{ id: 'raise-memory', title: 'raise', plan }] }), choose: () => {} };
  const approvals = createApprovals({ store, hub, sources: {}, audit: r => audits.push(r), confirm: async () => true });
  const p = await approvals.propose({ incident: 'i1', option: 'raise-memory', target: { cluster: 'c1', namespace: 'shop', kind: 'Deployment', name: 'api' } }, external({ cluster: 'c1' }));
  assert.equal(p.state, 'waiting');
  assert.equal(approvals.pending().length, 1);
  const d = await approvals.decide(p.approval, 'allow', { by: 'oncall' });
  assert.equal(d.state, 'approved');
  assert.equal(d.pr, 'github-unconnected');
  const again = await approvals.decide(p.approval, 'deny', { by: 'someone' });
  assert.equal(again.state, 'approved');
  assert.equal(again.replayed, true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].summary.$t, 'wake.audit.approve.prUnconnected');
});

/* review 5: the scope was checked on the supplied target while the plan came from a separately supplied incident, so a caller of cluster c1
   received (and recorded under c1) a plan of an incident in c2. The incident option must name the same cluster and object as the target */
const incidentHub = () => {
  const plan = { id: 'raise-memory', route: 'command', target: { kind: 'Deployment', namespace: 'shop', name: 'api' }, values: [{ path: 'spec.x', before: '1', after: '2' }], command: 'kubectl patch deployment/api -n shop' };
  return { get: id => ({ i1: { cluster: 'c1', target: { kind: 'Deployment', namespace: 'shop', name: 'api' } }, i2: { cluster: 'c2', target: { kind: 'Deployment', namespace: 'shop', name: 'api' } } })[id] ?? null,
    workspace: async () => ({ options: [{ id: 'raise-memory', title: 'raise', plan }] }), choose: () => {} };
};
test('a_proposal_from_an_incident_option_is_refused_unless_the_incident_and_its_plan_name_the_requested_cluster_and_object', async () => {
  const store = createHubStore({ userData: tmp(), maskText });
  const approvals = createApprovals({ store, hub: incidentHub(), sources: {}, audit: () => {}, confirm: async () => true });
  const target = (extra = {}) => ({ cluster: 'c1', namespace: 'shop', kind: 'Deployment', name: 'api', ...extra });
  await assert.rejects(approvals.propose({ incident: 'i2', option: 'raise-memory', target: target() }, external({ cluster: 'c1' })), e => e.kind === 'invalid_request', 'an incident of another cluster');
  await assert.rejects(approvals.propose({ incident: 'i1', option: 'raise-memory', target: target({ name: 'web' }) }, external({ cluster: 'c1' })), e => e.kind === 'invalid_request', 'another object of the same cluster');
  await assert.rejects(approvals.propose({ incident: 'i1', option: 'raise-memory', target: target({ namespace: 'other' }) }, external({ cluster: 'c1' })), e => e.kind === 'invalid_request', 'another namespace');
  assert.equal(approvals.pending().length, 0, 'nothing was recorded for a mismatch');
  const ok = await approvals.propose({ incident: 'i1', option: 'raise-memory', target: target({ kind: 'deployments' }) }, external({ cluster: 'c1' }));
  assert.equal(ok.state, 'waiting');
  assert.deepEqual(approvals.pending().map(a => [a.cluster, a.target.name]), [['c1', 'api']]);
  /* through the tool layer: a client scoped to c1 never gets the plan of the c2 incident */
  const tools = createToolLayer({ sources: { sourceState: () => null }, hub: incidentHub(), store, approvals, screen: {}, report: async () => ({}) });
  const r = await tools.call('propose_action', { incident: 'i2', option: 'raise-memory', target: target() }, external({ cluster: 'c1' }));
  assert.equal(r.result, undefined);
  assert.equal(r.error, 'invalid_request');
});

/* review 5: an in-app page could submit approval.decide and it was recorded as the local person's approval. Allowing waits for the main
   process confirmation shown for that approval id and plan hash; without it, or with a changed plan, nothing is recorded */
test('allowing_a_proposal_records_nothing_without_the_main_process_confirmation_of_that_approval_and_plan', async () => {
  const store = createHubStore({ userData: tmp(), maskText });
  const audits = [], asked = [];
  let answer = false, during = null;
  const approvals = createApprovals({ store, hub: incidentHub(), sources: {}, audit: r => audits.push(r),
    confirm: async shown => { asked.push(shown); await during?.(); return answer; } });
  const p = await approvals.propose({ incident: 'i1', option: 'raise-memory', target: { cluster: 'c1', namespace: 'shop', kind: 'Deployment', name: 'api' } }, external({ cluster: 'c1' }));
  const saved = store.docs('approvals').get(p.approval);
  assert.match(saved.planHash, /^[0-9a-f]{64}$/, 'the plan hash is kept with the request');
  await assert.rejects(approvals.decide(p.approval, 'allow', { by: 'oncall' }), e => e.kind === 'not_confirmed', 'cancelled in the confirmation');
  assert.equal(asked[0].id, p.approval);
  assert.equal(asked[0].planHash, saved.planHash);
  assert.equal(asked[0].cluster, 'c1');
  assert.match(asked[0].diff, /spec\.x/);
  assert.equal(store.docs('approvals').get(p.approval).state, 'waiting');
  const unconfirmed = createApprovals({ store, hub: incidentHub(), sources: {}, audit: r => audits.push(r) });
  await assert.rejects(unconfirmed.decide(p.approval, 'allow', { by: 'oncall' }), e => e.kind === 'not_confirmed', 'no main process confirmation at all');
  /* the plan changes while the dialog is open: the confirmation was for another plan */
  answer = true; during = async () => { store.docs('approvals').put(p.approval, { ...saved, plan: { ...saved.plan, values: [{ path: 'spec.x', before: '1', after: '9' }] } }); };
  await assert.rejects(approvals.decide(p.approval, 'allow', { by: 'oncall' }), e => e.kind === 'plan_changed');
  assert.equal(store.docs('approvals').get(p.approval).state, 'waiting');
  assert.equal(audits.length, 0, 'no decision row without a matching confirmation');
  store.docs('approvals').put(p.approval, saved); during = null;
  const d = await approvals.decide(p.approval, 'allow', { by: 'oncall' });
  assert.equal(d.state, 'approved');
  assert.equal(audits[0].planHash, saved.planHash);
  /* refusing changes nothing outside Wake and needs no confirmation */
  const q = await approvals.propose({ incident: 'i1', option: 'raise-memory', target: { cluster: 'c1', namespace: 'shop', kind: 'Deployment', name: 'api' } }, external({ cluster: 'c1' }));
  answer = false;
  assert.equal((await approvals.decide(q.approval, 'deny', { by: 'oncall' })).state, 'denied');
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

/* review 8: log lines read for a model tool or frozen as evidence relied on the label patterns, so an opaque credential printed without a label
   survived. read_logs (and the logs evidence built from it) passes the shared disclosure policy */
test('log_lines_read_by_a_tool_or_frozen_as_evidence_pass_the_disclosure_policy', async () => {
  const opaque = 'Zq8RkT2mW9xLp4Vb7Nc3Hd6Jf1Gs5Ya0Ue';
  const cited = [];
  const { tools } = layer({ sources: { kube: async () => `2026-11-15T00:00:01Z connected with ${opaque}\n` },
    hub: { get: () => ({ id: 'i1', cluster: 'c1', detectedAt: Date.parse('2026-11-15T00:00:00Z'), target: { kind: 'Deployment', namespace: 'shop', name: 'api' } }), cite: (inc, piece) => { cited.push(piece); return { n: 1, hash: 'h' }; } } });
  const window = { from: '2026-11-15T00:00:00Z', to: '2026-11-15T00:10:00Z' };
  const read = await tools.call('read_logs', { cluster: 'c1', namespace: 'shop', pod: 'api-1', window }, external({ cluster: 'c1', namespaces: ['shop'] }));
  assert.equal(read.result.lines[0].text, 'connected with ••••');
  await tools.call('collect_evidence', { incident: 'i1', spec: { kind: 'logs', name: 'api-1', window } }, external({ cluster: 'c1', namespaces: ['shop'] }));
  assert.doesNotMatch(JSON.stringify(cited), new RegExp(opaque));
});

/* recheck 8: an incident id sent with a generic change (no option) skipped the incident check and the approved change became that incident's chosen
   action. An incident needs its option, and the incident's own target and UID must be the live object before anything is saved */
test('a_proposal_names_an_incident_only_with_its_option_and_the_incident_target_uid_must_be_the_live_object', async () => {
  const store = createHubStore({ userData: tmp(), maskText });
  let live = { kind: 'Deployment', metadata: { name: 'api', namespace: 'shop', uid: 'uid-new', resourceVersion: '9' }, spec: { x: '1' } };
  const hub = incidentHub(), chosen = [];
  hub.get = id => (id === 'i1' ? { cluster: 'c1', target: { kind: 'Deployment', namespace: 'shop', name: 'api', uid: 'uid-old' } } : null);
  hub.choose = (...a) => chosen.push(a);
  const approvals = createApprovals({ store, hub, sources: { get: async () => live, list: async () => [] }, audit: () => {}, confirm: async () => true });
  const target = { cluster: 'c1', namespace: 'shop', kind: 'Deployment', name: 'api' };
  await assert.rejects(approvals.propose({ incident: 'i1', target, change: { title: 't', values: [{ path: 'spec.x', before: '1', after: '2' }] } }, external({ cluster: 'c1' })), e => e.kind === 'invalid_request', 'an incident without its option');
  await assert.rejects(approvals.propose({ option: 'raise-memory', target }, external({ cluster: 'c1' })), e => e.kind === 'invalid_request', 'an option without its incident');
  await assert.rejects(approvals.propose({ incident: 'i1', option: 'raise-memory', target }, external({ cluster: 'c1' })), e => e.kind === 'invalid_request', 'the incident object was replaced (UID)');
  assert.equal(approvals.pending().length, 0);
  live = { ...live, metadata: { ...live.metadata, uid: 'uid-old' } };
  assert.equal((await approvals.propose({ incident: 'i1', option: 'raise-memory', target }, external({ cluster: 'c1' }))).state, 'waiting');
});

/* recheck 5: a generic proposal could omit the context and the before values, so its command followed the operator's current context and
   overwrote whatever value was there. Every value needs its before, which must be the live value, and the plan names the cluster context */
test('a_generic_proposal_needs_before_values_that_match_the_live_object_and_its_plan_names_the_cluster_context', async () => {
  const store = createHubStore({ userData: tmp(), maskText });
  const live = { kind: 'Deployment', metadata: { name: 'api', namespace: 'shop', uid: 'u1', resourceVersion: '7' }, spec: { template: { spec: { containers: [{ name: 'app', resources: { limits: { memory: '64Mi' } } }] } } } };
  const approvals = createApprovals({ store, hub: incidentHub(), sources: { get: async () => live, list: async () => [] }, audit: () => {} });
  const target = { cluster: 'kind-c1', namespace: 'shop', kind: 'Deployment', name: 'api' }, path = 'spec.template.spec.containers[0].resources.limits.memory';
  await assert.rejects(approvals.propose({ target, change: { title: 't', values: [{ path, after: '128Mi' }] } }, external({ cluster: 'kind-c1' })), e => e.kind === 'invalid_request', 'no before');
  await assert.rejects(approvals.propose({ target, change: { title: 't', values: [{ path, before: '32Mi', after: '128Mi' }] } }, external({ cluster: 'kind-c1' })), e => e.kind === 'invalid_request', 'a before that is not the live value');
  await assert.rejects(approvals.propose({ target, change: { title: 't', values: [] } }, external({ cluster: 'kind-c1' })), e => e.kind === 'invalid_request', 'no value');
  const ok = await approvals.propose({ target, change: { title: 't', values: [{ path, before: '64Mi', after: '128Mi' }] } }, external({ cluster: 'kind-c1' }));
  assert.match(ok.plan.command, /--context 'kind-c1'/);
  assert.match(ok.plan.command, /"op":"test","path":"\/metadata\/uid","value":"u1"/);
  assert.match(ok.plan.command, /"op":"test","path":"\/spec\/template\/spec\/containers\/0\/resources\/limits\/memory","value":"64Mi"/);
  const { tools } = layer();
  assert.equal(tools.list().find(t => t.name === 'propose_action').inputSchema.properties.change.properties.values.items.required.includes('before'), true, 'the tool schema asks for before');
});

/* round 3 finding 8: a live spec.replicas 2 passed against "2", and the JSON patch then tested the string "2" and wrote "3": a patch that can
   never apply. Values follow the live field type: numbers and booleans stay typed in the test and replace operations */
test('a_generic_proposal_keeps_the_live_field_type_in_its_json_patch_and_refuses_a_value_of_another_type', async () => {
  const store = createHubStore({ userData: tmp(), maskText });
  const live = { kind: 'Deployment', metadata: { name: 'api', namespace: 'shop', uid: 'u1' }, spec: { replicas: 2, paused: false, template: { spec: { containers: [{ name: 'app', image: 'x:1' }] } } } };
  const approvals = createApprovals({ store, hub: incidentHub(), sources: { get: async () => live, list: async () => [] }, audit: () => {} });
  const target = { cluster: 'c1', namespace: 'shop', kind: 'Deployment', name: 'api' };
  const ok = await approvals.propose({ target, change: { title: 't', values: [{ path: 'spec.replicas', before: '2', after: '3' }, { path: 'spec.paused', before: 'false', after: 'true' }] } }, external({ cluster: 'c1' }));
  const ops = JSON.parse(/-p '([^']*)'/.exec(ok.plan.command)[1]);
  assert.deepEqual(ops.filter(o => o.path === '/spec/replicas').map(o => [o.op, o.value]), [['test', 2], ['replace', 3]]);
  assert.deepEqual(ops.filter(o => o.path === '/spec/paused').map(o => [o.op, o.value]), [['test', false], ['replace', true]]);
  await assert.rejects(approvals.propose({ target, change: { title: 't', values: [{ path: 'spec.replicas', before: '2', after: 'three' }] } }, external({ cluster: 'c1' })), e => e.kind === 'invalid_request', 'not a number');
  await assert.rejects(approvals.propose({ target, change: { title: 't', values: [{ path: 'spec.paused', before: 'false', after: 'yes' }] } }, external({ cluster: 'c1' })), e => e.kind === 'invalid_request', 'not a boolean');
  await assert.rejects(approvals.propose({ target, change: { title: 't', values: [{ path: 'spec.template', before: '[object Object]', after: 'x' }] } }, external({ cluster: 'c1' })), e => e.kind === 'invalid_request', 'not a scalar field');
});
