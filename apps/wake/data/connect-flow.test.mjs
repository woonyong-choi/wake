/* 연결 상태 표와 정책의 논리 검사: node --test apps/wake/data/connect-flow.test.mjs (kit/tools/check-tests.mjs가 실행) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { LIMITS, STATES, TRANSITIONS, ACTION_OF, STATE_OF_CAUSE, RULES, CAUSES, ACTIONS, METHODS, STEP_LABEL, RECHECK, stateOf, createFlows, connectionRecord, policyProblems } from './connect-flow.js';

LIMITS.stepMinMs = 0; // 화면 속도 조절은 논리 검사에서 뺌

test('모든 상태가 idle에서 닿고 나가는 길이 있음', () => {
  const seen = new Set(['idle']), queue = ['idle'];
  while (queue.length) for (const to of Object.values(TRANSITIONS[queue.shift()] || {})) if (!seen.has(to)) { seen.add(to); queue.push(to); }
  assert.deepEqual([...seen].sort(), [...STATES].sort());
  for (const s of STATES) assert.ok(Object.keys(TRANSITIONS[s] || {}).length, `${s} has no exit`);
  for (const [s, t] of Object.entries(TRANSITIONS)) { assert.ok(STATES.includes(s), s); for (const to of Object.values(t)) assert.ok(STATES.includes(to), `${s} -> ${to}`); }
});
test('사람이 조치할 상태마다 동작이 정확히 하나, 그 동작이 표와 버튼에 있음', () => {
  for (const s of STATES.filter(x => x.startsWith('needs-') || ['failed', 'cancelled', 'timeout', 'waiting', 'connected'].includes(x))) {
    assert.equal(typeof ACTION_OF[s], 'string', s);
    assert.ok(TRANSITIONS[s][ACTION_OF[s]], `${s}: ${ACTION_OF[s]} is not a transition`);
    if (ACTION_OF[s] !== 'disconnect' || ACTIONS.disconnect) assert.ok(ACTIONS[ACTION_OF[s]], `${s}: no button for ${ACTION_OF[s]}`);
  }
});
test('원인마다 상태 하나와 화면 글자, 판정 규칙의 동작은 모두 버튼이 있음', () => {
  for (const c of Object.keys(STATE_OF_CAUSE)) { assert.ok(CAUSES[c], c); assert.ok(STATES.includes(STATE_OF_CAUSE[c]), c); }
  for (const r of RULES) { assert.ok(STATE_OF_CAUSE[r.cause], r.cause); for (const a of r.actions) assert.ok(ACTIONS[a], a); }
});
test('같은 뜻의 단계는 같은 이름: 모든 방법·다시 확인의 단계가 공용 단계 표에 있음', () => {
  for (const [m, d] of Object.entries(METHODS)) for (const s of d.steps) assert.ok(STEP_LABEL[s], `${m}: ${s}`);
  for (const s of RECHECK) assert.ok(STEP_LABEL[s], s);
});
test('연결됨에는 끊기와 다시 확인, 취소는 정해진 상태로', () => {
  assert.equal(TRANSITIONS.connected.disconnect, 'idle'); assert.equal(TRANSITIONS.connected.recheck, 'running');
  for (const s of STATES) if (TRANSITIONS[s].cancel) assert.ok(STATES.includes(TRANSITIONS[s].cancel));
  assert.equal(TRANSITIONS.waiting.cancel, 'cancelled');
});
test('한 흐름은 한 상태, 같은 입력은 같은 상태', () => {
  const f = { order: ['tool', 'kubeconfig'], state: { tool: 'done', kubeconfig: 'fail' }, cause: 'notInstalled' };
  assert.equal(stateOf(f), 'needs-install'); assert.equal(stateOf({ ...f }), 'needs-install');
  assert.equal(stateOf({ ...f, running: true, cause: null }), 'running'); assert.equal(stateOf({ ...f, running: true, cause: 'quiet' }), 'waiting');
  assert.equal(stateOf({ ...f, cause: null, state: { tool: 'done', kubeconfig: 'done' } }), 'connected');
  assert.equal(stateOf({ ...f, cause: 'approve' }), 'needs-approve');
});

const fakeEnv = (over = {}) => ({ service: async () => ({}), redraw() {}, audit() {}, rescan: async () => {}, runEnv: () => ({}), record() {}, done() {}, probeText: () => '', probeKind: () => 'ok', probe: async () => ({ state: 'ok' }),
  terminal: () => ({ run: async () => ({ exit: 0 }), cancel() {}, close() {} }), ...over });
const settle = () => new Promise(r => setTimeout(r, 0));

test('다시 시도는 실패한 단계부터(앞 단계는 완료로)', async () => {
  let exit = 1; const runs = [];
  const env = fakeEnv({ service: async n => (n === 'cli.check' ? { missing: [] } : n === 'kube.fingerprint' ? { hash: String(runs.length), contexts: runs.length ? ['kind-x'] : [] } : {}),
    terminal: () => ({ run: async ({ command }) => { runs.push(command); return { exit }; }, cancel() {}, close() {} }) });
  const flows = createFlows(env);
  await flows.run('k', 'kind', { name: 'x' });
  assert.equal(flows.state('k'), 'failed');
  assert.equal(flows.get('k').state.tool, 'done');
  exit = 0; await flows.retry('k');
  assert.equal(flows.get('k').state.tool, 'done'); assert.equal(runs.length, 2); assert.equal(flows.state('k'), 'connected');
});
test('명령이 없으면(127) 도구 확인에서 설치 필요로 멈춤', async () => {
  const env = fakeEnv({ service: async n => (n === 'cli.check' ? { missing: [] } : n === 'kube.fingerprint' ? { hash: 'a', contexts: [] } : {}), terminal: () => ({ run: async () => ({ exit: 127 }), cancel() {}, close() {} }) });
  const flows = createFlows(env); await flows.run('k', 'kind', { name: 'x' });
  assert.equal(flows.state('k'), 'needs-install'); assert.equal(flows.get('k').state.tool, 'fail');
});
test('종료 0인데 kubeconfig가 그대로면 실패(입력값 확인)', async () => {
  const env = fakeEnv({ service: async n => (n === 'cli.check' ? { missing: [] } : n === 'kube.fingerprint' ? { hash: 'same', contexts: [] } : {}) });
  const flows = createFlows(env); await flows.run('k', 'kind', { name: 'x' });
  assert.equal(flows.state('k'), 'failed'); assert.equal(flows.get('k').cause, 'unchanged');
});

/* 도구 로그인해서 연결: 세션이 있으면 로그인 단계 통과, 승인하면 서비스 계정 토큰 발급, 권한이 없으면 세션만으로 연결 */
const toolEnv = (session, issue, approve = true, recs = {}) => fakeEnv({ record: (k, r) => { recs[k] = r; }, approve: async () => (typeof approve === 'function' ? approve() : approve), openLogin: async () => {}, loginOpen: () => true, closeLogin() {},
  tool: async op => ({ reach: { ok: true, url: 'http://127.0.0.1:1/' }, session, issue, verify: { ok: true }, setToken: { ok: true }, disconnect: { ok: true } })[op] || {} });
test('도구: 승인하면 서비스 계정으로 연결됨, 기록은 나만·읽기 전용·서비스 계정', async () => {
  const recs = {}, flows = createFlows(toolEnv({ signedIn: true, canIssue: true }, { ok: true, identity: 'wake-reader' }, true, recs));
  await flows.run('c-grafana', 'tool-login', {}, null, { kind: 'tool' });
  assert.equal(flows.state('c-grafana'), 'connected');
  assert.deepEqual([recs['c-grafana'].scope, recs['c-grafana'].credentialMode, recs['c-grafana'].accessLevel, recs['c-grafana'].secretRead], ['me', 'service', 'read', false]);
});
test('도구: 토큰 만들 권한이 없으면 승인·발급을 건너뛰고 세션만으로 연결(각자 로그인)', async () => {
  const recs = {}, flows = createFlows(toolEnv({ signedIn: true, canIssue: false }, null, true, recs));
  await flows.run('c-argocd', 'tool-login', {}, null, { kind: 'tool' });
  const f = flows.get('c-argocd');
  assert.equal(flows.state('c-argocd'), 'connected'); assert.equal(f.state.approve, 'skip'); assert.equal(f.state.issue, 'skip'); assert.equal(recs['c-argocd'].credentialMode, 'personal');
});
test('도구: 발급을 거절하면 취소 상태, 다시 시도는 승인 단계부터', async () => {
  const flows = createFlows(toolEnv({ signedIn: true, canIssue: true }, { ok: true, identity: 'w' }, false));
  await flows.run('t', 'tool-login', {}, null, { kind: 'tool' });
  assert.equal(flows.state('t'), 'cancelled'); assert.equal(flows.get('t').state.login, 'done'); assert.equal(flows.get('t').state.approve, 'fail');
});
test('도구: 승인 대기 중 발급하지 않고 허용 뒤 새 요청으로 한 번만 발급', async () => {
  let decide, pending, issues = 0;
  const ready = new Promise(resolve => { pending = resolve; });
  const outcomes = [];
  const env = toolEnv({ signedIn: true, canIssue: true }, { ok: true });
  env.approve = () => new Promise(resolve => { decide = resolve; pending(); });
  env.toolApprovalResult = (_, ok) => outcomes.push(ok);
  const base = env.tool;
  env.tool = async (op, f, scope) => {
    if (op === 'issue') { issues++; assert.equal(scope.flowStart, true); assert.equal(scope.flowId, undefined); }
    return { ...await base(op, f, scope), flowId: op === 'issue' ? 'new' : 'old' };
  };
  const flows = createFlows(env);
  const done = flows.run('t', 'tool-login', {}, null, { kind: 'tool' });
  await ready;
  assert.equal(flows.state('t'), 'needs-approve');
  assert.deepEqual(flows.view('t').actions.map(action => action.action), ['wake.flow.deny', 'wake.flow.approve']);
  await flows.retry('t');
  assert.equal(issues, 0);
  assert.deepEqual(outcomes, []);
  decide(true);
  await done;
  assert.equal(issues, 1);
  assert.deepEqual(outcomes, [true]);
});
test('도구: 로그인 탭을 닫으면 취소', async () => {
  const env = toolEnv({ signedIn: false }, null); env.loginOpen = () => false;
  const flows = createFlows(env); await flows.run('t', 'tool-login', {}, null, { kind: 'tool' });
  assert.equal(flows.state('t'), 'cancelled'); assert.equal(flows.get('t').cause, 'tabClosed');
});
test('도구: 토큰이 거부되면 로그인 필요(다시 로그인·토큰 다시 입력)', async () => {
  const env = toolEnv({ signedIn: true, canIssue: true }, { ok: true }); const base = env.tool; env.tool = async (op, f, x) => op === 'verify' ? { state: 'unauthorized' } : base(op, f, x);
  const flows = createFlows(env); await flows.run('t', 'tool-login', {}, null, { kind: 'tool' });
  assert.equal(flows.state('t'), 'needs-login'); assert.deepEqual(flows.view('t').actions.map(a => a.action), ['wake.flow.login', 'wake.flow.token']);
});
test('도구가 내려가 있으면 접속에서 실패, 다시 시도', async () => {
  const env = toolEnv({ signedIn: true }, null); env.tool = async op => (op === 'reach' ? { state: 'notReady' } : {});
  const flows = createFlows(env); await flows.run('t', 'tool-open', {}, null, { kind: 'tool' });
  assert.equal(flows.state('t'), 'failed'); assert.equal(flows.get('t').state.reach, 'fail'); assert.equal(flows.view('t').actions[0].action, 'wake.flow.retry');
});
test('연결 해제는 기록을 지우고 idle로', async () => {
  const recs = {}, flows = createFlows(toolEnv({ signedIn: true, canIssue: true }, { ok: true }, true, recs));
  await flows.run('t', 'tool-login', {}, null, { kind: 'tool' }); await flows.disconnect('t'); await settle();
  assert.equal(flows.state('t'), 'idle'); assert.equal(recs.t, null);
});

test('정책: 기본은 나만·각자 로그인·읽기 전용·Secret 꺼짐', () => {
  const r = connectionRecord({ target: 'kind-a', method: 'kind' });
  assert.deepEqual([r.scope, r.credentialMode, r.accessLevel, r.secretRead, r.users, r.admins, r.createdBy], ['me', 'personal', 'read', false, ['me'], ['me'], 'me']);
});
test('정책: 팀 연결은 한 사람의 개인 자격을 담을 수 없음', () => {
  assert.throws(() => connectionRecord({ target: 'x', method: 'aws', scope: 'team', credentialMode: 'personal', identity: 'arn:aws:iam::1:user/me' }));
  assert.equal(policyProblems(connectionRecord({ target: 'x', method: 'aws', scope: 'team', credentialMode: 'personal' })).length, 0);
  assert.equal(policyProblems(connectionRecord({ target: 'x', method: 'tool-login', scope: 'team', credentialMode: 'service', identity: 'wake-reader' })).length, 0);
  assert.ok(policyProblems({ ...connectionRecord({ target: 'x', method: 'kind' }), users: ['me', 'kim'] }).length);
});

test('출력 없이 오래 가면 응답 기다리는 중, 계속 기다리기는 진행 중으로, 최대 시간이 지나면 시간 초과', async () => {
  const keep = { ...LIMITS }; Object.assign(LIMITS, { quietMs: 30, kubeconfigMs: 2600 });
  let cancel; const seen = [];
  const env = fakeEnv({ service: async n => (n === 'cli.check' ? { missing: [] } : n === 'kube.fingerprint' ? { hash: 'a', contexts: [] } : {}),
    terminal: () => ({ run: () => new Promise(r => { cancel = () => r({ exit: null }); }), cancel: () => cancel?.(), close() {} }) });
  const flows = createFlows(env); env.redraw = () => seen.push(flows.state('k'));
  const done = flows.run('k', 'kind', { name: 'x' });
  await new Promise(r => setTimeout(r, 1500));
  assert.ok(seen.includes('waiting'), 'waiting shown');
  flows.wait('k'); assert.equal(flows.state('k'), 'running');
  await done; Object.assign(LIMITS, keep);
  assert.equal(flows.state('k'), 'timeout'); assert.equal(flows.view('k').actions[0].action, 'wake.flow.retry');
});

test('두 번 눌러도 흐름은 하나(진행 중에 다시 시작하면 무시)', async () => {
  let runs = 0; const env = fakeEnv({ service: async n => (n === 'cli.check' ? { missing: [] } : n === 'kube.fingerprint' ? { hash: String(runs), contexts: runs ? ['kind-x'] : [] } : {}),
    terminal: () => ({ run: async () => { runs++; await settle(); return { exit: 0 }; }, cancel() {}, close() {} }) });
  const flows = createFlows(env);
  await Promise.all([flows.run('k', 'kind', { name: 'x' }), flows.run('k', 'kind', { name: 'x' })]);
  assert.equal(runs, 1); assert.equal(flows.state('k'), 'connected');
});
/* AI·알림·GitOps: 단계마다 메인 프로세스 확인 하나 */
const opEnv = (fail, recs = {}) => fakeEnv({ record: (k, r) => { recs[k] = r; }, service: async (n, a) => (n === 'conn.save' ? { ok: true } : n === 'conn.step' ? (fail && fail.at === a.step ? fail : { ok: true }) : {}) });
test('AI API 키: 키가 거부되면 인증에서 로그인 필요, 동작은 다시 입력', async () => {
  const flows = createFlows(opEnv({ at: 'authn', cause: 'unauthorized' }));
  await flows.run('ai-openai', 'ai-key', { key: 'k' }, null, { target: 'openai' });
  const f = flows.get('ai-openai');
  assert.equal(flows.state('ai-openai'), 'needs-login'); assert.equal(f.state.input, 'done'); assert.equal(f.state.reach, 'done'); assert.equal(f.state.authn, 'fail');
  assert.deepEqual(flows.view('ai-openai').actions.map(a => a.action), ['wake.flow.input']); assert.equal(flows.view('ai-openai').short, 'wake.conn.short.login'); assert.deepEqual(f.values, {}, 'secret not kept in the flow');
});
test('공식 CLI가 없으면 도구 확인에서 설치 필요, 설치 명령은 복사만', async () => {
  const flows = createFlows(opEnv({ at: 'tool', cause: 'notInstalled', install: 'npm install -g x', missing: 'x' }));
  await flows.run('ai-gemini-cli', 'ai-cli', {}, null, { target: 'gemini-cli' });
  assert.equal(flows.state('ai-gemini-cli'), 'needs-install'); assert.deepEqual(flows.view('ai-gemini-cli').actions.map(a => a.action), ['wake.flow.copyInstall']);
});
test('GitOps: 목록을 읽을 권한이 없으면 권한 단계에서 권한 필요, 성공하면 기록(나만·읽기 전용)', async () => {
  const flows = createFlows(opEnv({ at: 'perm', cause: 'forbidden', need: { resource: 'applications' } }));
  await flows.run('g', 'gitops', {}, null, { target: 'c/argocd' });
  assert.equal(flows.state('g'), 'needs-perm'); assert.equal(flows.view('g').actions[0].action, 'wake.flow.perm'); assert.equal(flows.view('g').kind, 'perm');
  const recs = {}, ok = createFlows(opEnv(null, recs)); await ok.run('g', 'gitops', {}, null, { target: 'c/argocd' });
  assert.equal(ok.state('g'), 'connected'); assert.deepEqual([recs.g.kind, recs.g.scope, recs.g.accessLevel], ['gitops', 'me', 'read']);
});
test('다시 확인: 답이 없으면 응답 기다리는 중, 취소하면 취소 상태이고 늦은 답은 버림', async () => {
  const keep = { ...LIMITS }; LIMITS.quietMs = 20;
  const flows = createFlows(fakeEnv());
  flows.recheck('c'); await new Promise(r => setTimeout(r, 60));
  assert.equal(flows.state('c'), 'waiting'); assert.deepEqual(flows.view('c').actions.map(a => a.action), ['wake.flow.cancel', 'wake.flow.wait']);
  flows.cancel('c'); assert.equal(flows.state('c'), 'cancelled');
  flows.recheckDone('c', { state: 'ok' }); assert.equal(flows.state('c'), 'cancelled');
  Object.assign(LIMITS, keep);
});
test('다시 확인: 인증 도구가 끝나지 않아 메인이 시간 초과로 답하면 시간 초과(다시 시도)', () => {
  const flows = createFlows(fakeEnv()); flows.recheck('c'); flows.recheckDone('c', { state: 'timeout' });
  assert.equal(flows.state('c'), 'timeout'); assert.equal(flows.get('c').state.authn, 'fail');
});
test('기록 되살리기: 확인 결과의 멈춘 단계·원인으로, 사람이 결정을 기다리는 흐름은 그대로', async () => {
  const flows = createFlows(fakeEnv());
  flows.restore('ai-x', { method: 'ai-key', target: 'openai', kind: 'ai' }, { at: 'authn', cause: 'quota' });
  assert.equal(flows.state('ai-x'), 'failed'); assert.equal(flows.get('ai-x').state.authn, 'fail');
  const t = createFlows(toolEnv({ signedIn: true, canIssue: true }, { ok: true }, () => new Promise(() => {})));
  t.run('c-g', 'tool-login', {}, null, { kind: 'tool' }); await settle(); await settle();
  t.restore('c-g', { method: 'tool-login', kind: 'tool' }, { ok: true });
  assert.equal(t.state('c-g'), 'needs-approve');
});
test('다시 확인: 권한이 없으면 필요한 권한 보기가 그 자리의 동작, 본 뒤에는 권한이 생기면 자동으로 이어서 연결', async () => {
  let granted = false, sheets = 0;
  const flows = createFlows(fakeEnv({ probeKind: r => (r.state === 'forbidden' ? 'perm' : 'fix'), probeNeed: () => ({ resource: 'pods', namespace: 'a' }), permSheet: () => { sheets++; }, permGranted: async () => granted, recheck: ids => ids.forEach(id => flows.recheck(id)) }));
  flows.recheck('c'); flows.recheckDone('c', { state: 'forbidden' });
  assert.equal(flows.state('c'), 'needs-perm'); assert.equal(flows.view('c').actions[0].action, 'wake.flow.perm'); assert.deepEqual(flows.get('c').need, { resource: 'pods', namespace: 'a' });
  flows.perm('c'); assert.equal(sheets, 1); assert.equal(flows.state('c'), 'watching'); assert.equal(flows.view('c').status.kind, 'busy');
  granted = true; await new Promise(r => setTimeout(r, LIMITS.watchMs + 50));
  assert.equal(flows.get('c').running, true, 'granted: the check runs again by itself');
});
test('다시 확인이 닿지 않으면 그 줄에서 멈춤(원인과 두 낱말), 확인 결과만 있는 줄은 누르면 같은 모습', async () => {
  const flows = createFlows(fakeEnv({ probeKind: () => 'error', probeText: () => 'unreachable' }));
  flows.recheck('a'); flows.recheckDone('a', { state: 'unreachable' });
  flows.detail('b', { state: 'unreachable' }); assert.equal(flows.view('b').short, 'wake.conn.short.reach');
  const st = flows.view('a').status; assert.equal(st.kind, 'error'); assert.ok(st.text);
  assert.equal(flows.view('a').short, 'wake.conn.short.reach');
});
test('진행 중 한 줄: 하는 일과 단계가 시작된 시각(초 세기), 응답이 늦으면 응답 기다리는 중과 취소·계속 기다리기', () => {
  const flows = createFlows(fakeEnv({}));
  const f = flows.recheck('w'); flows.onProbeStep('w', 'reach');
  const v = flows.view('w'); assert.equal(v.status.kind, 'busy'); assert.ok(v.status.since <= Date.now()); assert.equal(v.actions.map(a => a.action).join(), 'wake.flow.cancel');
  f.cause = 'quiet'; assert.equal(flows.view('w').status.text.key, 'wake.flow.c.quiet'); assert.deepEqual(flows.view('w').actions.map(a => a.action), ['wake.flow.cancel', 'wake.flow.wait']);
  clearTimeout(f.quiet);
});

test('단계 이름, 원인, 동작 문구가 두 언어에 모두 있음', async () => {
  const ko = (await import('../locale/ko.js')).default, en = (await import('../locale/en.js')).default;
  const keys = [...Object.values(STEP_LABEL), ...Object.values(CAUSES).map(c => c.text), ...Object.values(ACTIONS).map(a => a.label)].filter(k => typeof k === 'string');
  for (const k of keys) { assert.ok(k in ko, `ko: ${k}`); assert.ok(k in en, `en: ${k}`); }
});


const nativeAgentObject = () => ({ kind: 'DaemonSet', metadata: { name: 'wake-agent', namespace: 'wake-system', uid: 'fixture-agent-uid', generation: 2, labels: { 'app.kubernetes.io/instance': 'wake-agent', 'app.kubernetes.io/component': 'agent' } }, spec: { template: { spec: { containers: [{ name: 'agent', image: 'fixture.invalid/agent@sha256:' + 'a'.repeat(64) }] } } }, status: { observedGeneration: 2, desiredNumberScheduled: 1, currentNumberScheduled: 1, updatedNumberScheduled: 1, numberReady: 1, numberAvailable: 1, numberUnavailable: 0, numberMisscheduled: 0 } });
async function nativeAgentRead(object = nativeAgentObject(), error) {
  const source = await readFile(new URL('../desktop/services.cjs', import.meta.url), 'utf8');
  const start = source.indexOf("    'agent.status':"), end = source.indexOf('    /* GitOps:', start);
  const calls = [];
  const methods = runInNewContext('({' + source.slice(start, end) + '})', { providers: { client: context => ({ request: async (method, path) => { calls.push({ context, method, path }); if (error) throw error; return structuredClone(object); } }) } });
  return { read: async () => JSON.parse(JSON.stringify(await methods['agent.status']({ id: 'fixture-cluster' }))), calls };
}
const agentFlowEnv = read => fakeEnv({ service: async name => { assert.equal(name, 'agent.status'); return read(); }, terminal: () => ({ run() { assert.fail('status consumer must not install'); }, cancel() {}, close() {} }) });

async function runAgentConsumer(flows) {
  const oldLimit = LIMITS.kubeconfigMs, oldPoll = LIMITS.pollMs; LIMITS.kubeconfigMs = 12; LIMITS.pollMs = 1;
  try { await flows.run('agent-fixture', 'agent', {}, 'agent', { cluster: 'fixture-cluster' }); }
  finally { LIMITS.kubeconfigMs = oldLimit; LIMITS.pollMs = oldPoll; }
}

test('agent_native_rollout_ready_connects_from_the_daemonset_alone', async () => {
  const native = await nativeAgentRead(), status = await native.read();
  assert.equal(status.rolloutReady, true);
  const flows = createFlows(agentFlowEnv(native.read));
  await runAgentConsumer(flows);
  assert.equal(flows.get('agent-fixture').state.agent, 'done');
  assert.equal(flows.state('agent-fixture'), 'connected');
  assert.ok(native.calls.every(x => x.method === 'GET' && x.path === '/apis/apps/v1/namespaces/wake-system/daemonsets/wake-agent'));
});

test('agent_native_a2_lookup_errors_remain_distinct_and_do_not_become_install_or_permission_guesses', async () => {
  for (const [error, expected] of [[{ status: 404 }, 'absent'], [{ status: 403 }, 'forbidden'], [{ code: 'ETIMEDOUT' }, 'timeout'], [{ status: 500 }, 'unknown']]) {
    const native = await nativeAgentRead(null, error), flows = createFlows(agentFlowEnv(native.read));
    await runAgentConsumer(flows);
    assert.equal(flows.get('agent-fixture').cause, expected);
    assert.equal(flows.get('agent-fixture').state.agent, 'fail');
    if (expected !== 'forbidden') assert.notEqual(flows.state('agent-fixture'), 'needs-perm');
  }
});

test('agent_native_a2_partial_stale_and_zero_desired_never_complete_rollout', async () => {
  const oldLimit = LIMITS.kubeconfigMs, oldPoll = LIMITS.pollMs; LIMITS.kubeconfigMs = 12; LIMITS.pollMs = 1;
  try {
    for (const mutate of [object => { object.status.numberAvailable = 0; object.status.numberUnavailable = 1; }, object => { object.status.observedGeneration = 1; }, object => { object.status.desiredNumberScheduled = 0; }, object => { delete object.status.numberReady; }]) {
      const object = nativeAgentObject(); mutate(object); const native = await nativeAgentRead(object), status = await native.read();
      assert.notEqual(status.rolloutReady, true);
      const flows = createFlows(agentFlowEnv(native.read)); await runAgentConsumer(flows);
      assert.notEqual(flows.get('agent-fixture').state.agent, 'done'); assert.notEqual(flows.state('agent-fixture'), 'connected');
      assert.notEqual(flows.state('agent-fixture'), 'needs-perm');
    }
  } finally { LIMITS.kubeconfigMs = oldLimit; LIMITS.pollMs = oldPoll; }
});

test('agent install checks DaemonSet permission and runs Helm with the chart the desktop app resolves', async () => {
  const calls = [], commands = [];
  const env = fakeEnv({ service: async (name, args) => {
    calls.push({ name, args });
    if (name === 'kube.can') return { allowed: true };
    if (name === 'agent.prep') return { helm: true, chart: '/fixture/app/agent-install-charts/wake-agent-only', exists: true, image: { published: true, image: 'fixture.invalid/agent@sha256:' + 'a'.repeat(64) } };
    if (name === 'agent.status') return { lookup: 'present', rolloutReady: true };
    assert.fail('unexpected service ' + name);
  }, terminal: () => ({ run: async ({ command }) => { commands.push(command.line); return { exit: 0 }; }, cancel() {}, close() {} }) });
  const flows = createFlows(env);
  await flows.run('agent-install', 'agent', {}, null, { cluster: 'fixture-cluster', kind: 'agent' });
  assert.equal(flows.state('agent-install'), 'connected');
  assert.equal(calls[0].name, 'agent.prep', 'the image is checked before anything else');
  assert.deepEqual(calls[1], { name: 'kube.can', args: { id: 'fixture-cluster', verb: 'create', group: 'apps', resource: 'daemonsets', namespace: 'wake-system' } });
  assert.deepEqual(commands, ["helm upgrade --install wake-agent '/fixture/app/agent-install-charts/wake-agent-only' --namespace wake-system --create-namespace --kube-context 'fixture-cluster' --set identity.clusterId='fixture-cluster'"]);
});
/* 권한 확인이 DaemonSet 생성 하나만 물어, 그것만 있는 사용자(kind 재현: Helm이 secrets 목록에서 forbidden)를 설치로 보냈다. Helm 기록(secrets),
   namespace, 차트의 모든 종류, 그리고 차트 Role·ClusterRole이 주는 권한(가지지 않은 권한은 줄 수 없음)을 모두 묻고 하나라도 없으면 권한 시트로 */
test('agent_install_asks_every_permission_the_helm_install_needs_and_stops_when_any_is_missing', async () => {
  const asked = [];
  const flows = createFlows(fakeEnv({ service: async (name, args) => {
    if (name === 'agent.prep') return { helm: true, chart: '/fixture/app/wake-agent-only', exists: true, image: { published: true, image: 'fixture.invalid/agent@sha256:' + 'a'.repeat(64) } };
    assert.equal(name, 'kube.can'); asked.push(`${args.verb} ${args.group ? args.resource + '.' + args.group : args.resource}${args.namespace ? ' -n ' + args.namespace : ''}`);
    return { allowed: args.resource === 'daemonsets' && args.verb === 'create' };
  }, permSheet: () => {}, permGranted: async () => false, terminal: () => ({ run() { assert.fail('an install the person may not finish must not run Helm'); } }) }));
  await flows.run('agent-narrow', 'agent', {}, null, { cluster: 'fixture-cluster', kind: 'agent' });
  assert.equal(flows.state('agent-narrow'), 'needs-perm');
  for (const need of ['create daemonsets.apps -n wake-system', 'patch daemonsets.apps -n wake-system', 'get serviceaccounts -n wake-system',
    'patch namespaces', 'patch clusterroles.rbac.authorization.k8s.io', 'update secrets -n wake-system',
    'list secrets -n wake-system', 'create secrets -n wake-system', 'create namespaces',
    'create serviceaccounts -n wake-system', 'create roles.rbac.authorization.k8s.io -n wake-system', 'create rolebindings.rbac.authorization.k8s.io -n wake-system',
    'create clusterroles.rbac.authorization.k8s.io', 'create clusterrolebindings.rbac.authorization.k8s.io',
    'list nodes', 'watch nodes', 'list pods', 'watch pods', 'create leases.coordination.k8s.io -n wake-system', 'update leases.coordination.k8s.io -n wake-system'])
    assert.ok(asked.includes(need), `asks: ${need}`);
});
/* 앱에 든 에이전트 차트의 이미지가 아직 공개되지 않았으면(agent.prep image: agent_image_unpublished) Helm을 부르지 않고 그 이유를 사람 말로 보인다 */
test('agent_install_stops_before_helm_and_names_the_unpublished_agent_image', async () => {
  for (const [reason, cause] of [['agent_image_unpublished', 'imageUnpublished'], ['agent_values_unreadable', 'chartUnreadable']]) {
    const flows = createFlows(fakeEnv({ service: async name => {
      if (name === 'kube.can') return { allowed: true };
      if (name === 'agent.prep') return { helm: true, chart: '/fixture/app/agent-install-charts/wake-agent-only', exists: true, image: { published: false, reason } };
      assert.fail('unexpected service ' + name);
    }, terminal: () => ({ run() { assert.fail('an install without a published image must not run Helm'); } }) }));
    await flows.run('agent-image', 'agent', {}, null, { cluster: 'fixture-cluster', kind: 'agent' });
    const f = flows.get('agent-image');
    assert.equal(f.cause, cause, `the install step names why it stopped: ${reason}`);
    assert.equal(f.state.install, 'fail'); assert.deepEqual(f.actions, [], 'nothing the person can run fixes it from here');
    assert.equal(f.install, undefined, 'no install command to copy');
    /* B3-06: the refusal showed the internal code (agent_image_unpublished) in an output box; only the person's reason is shown */
    assert.equal(flows.view('agent-image').raw, '', 'no output box with an internal code');
    assert.equal(flows.view('agent-image').explain, true, 'the human reason still opens under the row');
    const ko = (await import('../locale/ko.js')).default, en = (await import('../locale/en.js')).default;
    assert.ok(CAUSES[cause]?.text && ko[CAUSES[cause].text] && en[CAUSES[cause].text], `${cause} has finished words in both languages`);
  }
});
/* B2-01: the desktop answered agent.prep with agentImageState while the flow read image (and this file's fake answered image), so the real app ran
   Helm with the unpublished chart. The flow is fed the answer of the real agent.prep service over the chart the app carries */
const realAgentPrep = async () => {
  const { createRequire } = await import('node:module'), path = await import('node:path'), fs = await import('node:fs'), os = await import('node:os');
  const file = new URL('../desktop/services.cjs', import.meta.url).pathname, source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf("    'agent.prep':"), end = source.indexOf("    'agent.heartbeat':", start);
  const bundledChart = path.join(path.dirname(file), 'agent-install-charts', 'wake-agent-only');
  assert.ok(source.includes("const bundledChart = path.join(app?.isPackaged ? __dirname.replace(/app\\.asar(?=[\\\\/]|$)/, 'app.asar.unpacked') : __dirname, 'agent-install-charts', 'wake-agent-only');"), 'the services name the bundled chart this way');
  return runInNewContext('({' + source.slice(start, end) + '})', { path, fs, os, process, app: null, __dirname: path.dirname(file), bundledChart, require: createRequire(file) })['agent.prep'];
};
/* D-USR-2026-11-18-34: the bundled chart now names the published image by digest, so the real answer lets the flow go on to the permission question */
test('agent_install_with_the_real_desktop_answer_for_the_bundled_chart_reads_the_published_image_and_asks_permission_next', async () => {
  const prep = await realAgentPrep(), answer = prep({});
  assert.equal(answer.image?.published, true, 'the desktop names the image state under the key the flow reads');
  assert.match(answer.image.image, /^ghcr\.io\/woonyong-choi\/wake-agent@sha256:[0-9a-f]{64}$/);
  const calls = [];
  const flows = createFlows(fakeEnv({ service: async (name, args) => { calls.push(name); return name === 'agent.prep' ? { ...prep(args), helm: true } : name === 'kube.can' ? { allowed: false } : assert.fail('unexpected service ' + name); },
    permSheet: () => {}, permGranted: async () => false, terminal: () => ({ run() { assert.fail('a denied install must not execute'); } }) }));
  await flows.run('agent-real', 'agent', {}, null, { cluster: 'fixture-cluster', kind: 'agent' });
  assert.equal(calls[0], 'agent.prep');
  assert.ok(calls.length > 2 && calls.slice(1).every(c => c === 'kube.can'), 'the image passes, then the permissions are asked');
  assert.equal(flows.state('agent-real'), 'needs-perm');
  assert.notEqual(flows.get('agent-real').cause, 'imageUnpublished');
});
/* B2-15: an install the person may not do offered only a copy of the Helm line; "permission needed" leads to the permission sheet (its direct apply
   runs the declared command in the terminal after the desktop confirmation) */
test('agent install without permission stops before Helm and leads to the permission sheet', async () => {
  const sheets = [];
  const flows = createFlows(fakeEnv({ service: async name => {
    if (name === 'agent.prep') return { helm: true, chart: '/fixture/app/wake-agent-only', exists: true, image: { published: true, image: 'fixture.invalid/agent@sha256:' + 'a'.repeat(64) } };
    assert.equal(name, 'kube.can'); return { allowed: false };
  }, permSheet: f => sheets.push(f.install), permGranted: async () => false, terminal: () => ({ run() { assert.fail('a denied install must not execute'); } }) }));
  await flows.run('agent-denied', 'agent', {}, null, { cluster: 'fixture-cluster' });
  assert.equal(flows.state('agent-denied'), 'needs-perm');
  assert.deepEqual(flows.view('agent-denied').actions.map(a => a.action), ['wake.flow.perm']);
  assert.match(flows.get('agent-denied').install, /^helm upgrade --install wake-agent '\/fixture\/app\/wake-agent-only' /);
  flows.perm('agent-denied');
  assert.equal(sheets.length, 1, 'the permission sheet opens with the install command');
  const f = flows.get('agent-denied'); f.watch = false; clearTimeout(f.watchTimer);
});

test('native session-only skips issuance and requires actual verify before connected without a service-token claim', async () => {
  for (const verified of [true, false]) {
    const calls = [], records = {};
    const flows = createFlows(fakeEnv({ record: (key, record) => { records[key] = record; }, closeLogin() {},
      tool: async op => {
        calls.push(op);
        if (op === 'reach') return { ok: true, url: 'http://127.0.0.1:12345/' };
        if (op === 'session') return { signedIn: true, canIssue: false };
        if (op === 'issue') assert.fail('native session-only cannot issue');
        if (op === 'verify') return verified ? { ok: true, via: 'session' } : { state: 'unauthorized' };
      } }));
    await flows.run('native-context-grafana', 'tool-login', {}, null, { cluster: 'native-context', tool: { kind: 'grafana' }, kind: 'tool' });
    assert.equal(calls.includes('issue'), false); assert.equal(flows.get('native-context-grafana').state.issue, 'skip');
    assert.equal(flows.state('native-context-grafana') === 'connected', verified);
    if (verified) assert.equal(records['native-context-grafana'].credentialMode, 'personal');
    else assert.equal(records['native-context-grafana'], undefined);
  }
});

test('return226 cleanup failure or uncertainty keeps the UI record and retry completes the same disconnect', async () => {
  for (const failure of [{ ok: false, state: 'credential_cleanup_failed' }, undefined, { ok: true, localDeleted: false }, 'reject']) {
    const records = {}, env = toolEnv({ signedIn: true, canIssue: true }, { ok: true, identity: 'wake-reader' }, true, records), normal = env.tool;
    let cleanup = 0, connectAfterFailure = 0, allow = false;
    env.tool = async (op, f, extra) => {
      if (op === 'disconnect') { cleanup++; if (allow) return { ok: true, localDeleted: true, remoteRevoked: false }; if (failure === 'reject') throw new Error('synthetic private failure'); return failure; }
      if (cleanup) connectAfterFailure++;
      return normal(op, f, extra);
    };
    const flows = createFlows(env); await flows.run('cleanup-grafana', 'tool-login', {}, null, { cluster: 'cleanup', tool: { kind: 'grafana' }, kind: 'tool' });
    const record = records['cleanup-grafana']; await flows.disconnect('cleanup-grafana');
    assert.equal(records['cleanup-grafana'], record); assert.equal(flows.state('cleanup-grafana'), 'failed');
    assert.equal(flows.view('cleanup-grafana').actions[0].action, 'wake.flow.retry');
    assert.equal(flows.view('cleanup-grafana').raw.includes('synthetic private failure'), false);
    flows.restore('cleanup-grafana', record, { ok: true }); assert.equal(flows.state('cleanup-grafana'), 'failed');
    allow = true; await flows.retry('cleanup-grafana');
    assert.equal(cleanup, 2); assert.equal(connectAfterFailure, 0);
    assert.equal(flows.state('cleanup-grafana'), 'idle'); assert.equal(records['cleanup-grafana'], null);
  }
});
test('return226 legacy explicit cleanup success clears UI and late cleanup cannot delete a replacement flow', async () => {
  const records = {}, env = toolEnv({ signedIn: true, canIssue: false }, null, true, records), normal = env.tool;
  let finish, deferred = false;
  env.tool = async (op, f, extra) => op === 'disconnect' ? deferred ? new Promise(resolve => { finish = resolve; }) : { ok: true } : normal(op, f, extra);
  const flows = createFlows(env); await flows.run('legacy-grafana', 'tool-login', {}, null, { cluster: 'legacy', tool: { kind: 'grafana' }, kind: 'tool' });
  await flows.disconnect('legacy-grafana'); assert.equal(records['legacy-grafana'], null); assert.equal(flows.state('legacy-grafana'), 'idle');
  await flows.run('legacy-grafana', 'tool-login', {}, null, { cluster: 'legacy', tool: { kind: 'grafana' }, kind: 'tool' });
  deferred = true; const pending = flows.disconnect('legacy-grafana'); flows.clear('legacy-grafana');
  await flows.run('legacy-grafana', 'tool-login', {}, null, { cluster: 'legacy', tool: { kind: 'grafana' }, kind: 'tool' });
  const replacement = flows.get('legacy-grafana'), record = records['legacy-grafana']; finish({ ok: true, localDeleted: true }); await pending;
  assert.equal(flows.get('legacy-grafana'), replacement); assert.equal(records['legacy-grafana'], record);
});

test('return226 credential mode follows the verified session or reused token instead of assuming issuance from the skipped step', async () => {
  for (const via of ['session', 'token']) {
    const records = {}, env = toolEnv({ signedIn: true, canIssue: false }, null, true, records), normal = env.tool;
    let issued = 0;
    env.tool = async (op, f, extra) => {
      if (op === 'issue') issued++;
      return op === 'verify' ? { ok: true, via } : normal(op, f, extra);
    };
    const flows = createFlows(env); await flows.run('mode-grafana', 'tool-login', {}, null, { kind: 'tool', cluster: 'mode', tool: { kind: 'grafana' } });
    assert.equal(issued, 0); assert.equal(flows.get('mode-grafana').state.issue, 'skip');
    assert.equal(records['mode-grafana'].credentialMode, via === 'token' ? 'service' : 'personal');
    assert.equal(flows.get('mode-grafana').token, via === 'token');
    assert.equal(flows.get('mode-grafana').note?.key || null, via === 'session' ? 'wake.tool.sessionOnly' : null);
  }
});

test('bootstrap API authentication never opens a browser session and issuance failure is not session-only success', async () => {
  let opened = 0; const recs = {};
  const env = toolEnv({ signedIn: false, authentication: 'bootstrap', bootstrapAuthenticated: true, canIssue: true },
    { state: 'notReady', code: 'expiry_unverified', stage: 'issue' }, true, recs);
  env.openLogin = async () => { opened++; throw new Error('unexpected browser popup'); };
  const flows = createFlows(env);
  await flows.run('c-grafana', 'tool-login', {}, null, { kind: 'tool' });
  assert.equal(opened, 0);
  assert.equal(flows.get('c-grafana').state.issue, 'fail');
  assert.equal(flows.state('c-grafana'), 'failed');
  assert.equal(recs['c-grafana'], undefined);
  assert.match(flows.view('c-grafana').raw, /expiry_unverified/);
  assert.equal(flows.get('c-grafana').note?.key === 'wake.tool.sessionOnly', false);
});
test('bootstrap session failure stops without browser popup or repeated API polling', async () => {
  let calls = 0, opened = 0;
  const env = toolEnv({ authentication: 'bootstrap', state: 'timeout', code: 'tool_deadline', stage: 'session' });
  const call = env.tool;
  env.tool = async (...args) => { if (args[0] === 'session') calls++; return call(...args); };
  env.openLogin = async () => { opened++; throw new Error('unexpected browser popup'); };
  const flows = createFlows(env);
  await flows.run('c-grafana', 'tool-login', {}, null, { kind: 'tool' });
  assert.equal(calls, 1); assert.equal(opened, 0); assert.equal(flows.state('c-grafana'), 'timeout');
});

test('a connection shares its 120-second budget across reach and session before approval', async t => {
  let now = 1000000, issued = 0; const recs = {};
  t.mock.method(Date, 'now', () => now);
  const env = toolEnv({ signedIn: true, canIssue: true }, { ok: true }, true, recs), base = env.tool;
  env.tool = async (op, f, extra) => {
    if (op === 'reach') now += 60000;
    if (op === 'session') now += 61000;
    if (op === 'issue') issued++;
    return base(op, f, extra);
  };
  const flows = createFlows(env);
  await flows.run('c-grafana', 'tool-login', {}, null, { kind: 'tool' });
  assert.equal(issued, 0); assert.equal(flows.state('c-grafana'), 'timeout');
  assert.equal(recs['c-grafana'], undefined);
});

test('a verified bootstrap issuance that takes over one minute connects without a duplicate read', async t => {
  let now = 1000000;
  t.mock.method(Date, 'now', () => now);
  const env = toolEnv({ authentication: 'bootstrap', bootstrapAuthenticated: true, canIssue: true });
  const base = env.tool;
  env.tool = async (op, f, extra) => {
    if (op === 'issue') {
      now += 75000;
      return { ok: true, readVerified: true };
    }
    assert.notEqual(op, 'verify');
    return base(op, f, extra);
  };
  const flows = createFlows(env);
  await flows.run('c-argocd', 'tool-login', {}, null, { kind: 'tool', cluster: 'c', tool: { kind: 'argocd' } });
  assert.equal(flows.state('c-argocd'), 'connected');
});

test('bootstrap permission failure offers both a token field and actual browser sign-in', async () => {
  let field;
  const env = toolEnv({ authentication: 'bootstrap', bootstrapAuthenticated: true, canIssue: false });
  env.input = f => { field = f.key; };
  const flows = createFlows(env);
  await flows.run('c-grafana', 'tool-login', {}, null, { kind: 'tool', cluster: 'c', tool: { kind: 'grafana' } });
  assert.equal(field, 'c-grafana');
  assert.equal(flows.state(field), 'needs-input');
  assert.deepEqual(flows.view(field).actions.map(a => a.action), ['wake.flow.login', 'wake.flow.token']);
});

test('manual browser login keeps its existing five minute wait outside the automatic API deadline', async t => {
  let now = 1000000, sessions = 0, opened = 0; const recs = {};
  t.mock.method(Date, 'now', () => now);
  const env = toolEnv({ signedIn: true, canIssue: false }, null, true, recs), base = env.tool;
  env.openLogin = async () => { opened++; now += 120000; };
  env.loginOpen = () => false;
  env.tool = async (op, f, extra) => {
    if (op === 'session') {
      sessions++;
      if (sessions === 1) return { signedIn: false, canIssue: false, flowId: 'main-issued-handle' };
      assert.equal(extra.flowStart, undefined); assert.equal(extra.flowId, undefined);
      return { signedIn: true, canIssue: false };
    }
    return base(op, f, extra);
  };
  const flows = createFlows(env);
  await flows.run('c-grafana', 'tool-login', {}, null, { kind: 'tool' });
  assert.equal(opened, 1); assert.equal(sessions, 2);
  assert.equal(flows.state('c-grafana'), 'connected'); assert.equal(recs['c-grafana'].credentialMode, 'personal');
});

test('stored tool credential rejection and timeout keep their own recovery actions', () => {
  const flows = createFlows(toolEnv({}, null));
  const key = 'c-grafana';
  const record = { method: 'tool-token', kind: 'tool', where: { cluster: 'c', tool: { kind: 'grafana' } } };
  flows.restore(key, record, { state: 'forbidden' });
  assert.equal(flows.state(key), 'needs-perm');
  assert.equal(flows.get(key).state.authn, 'fail');
  assert.deepEqual(flows.view(key).actions.map(a => a.action), ['wake.flow.login', 'wake.flow.token']);
  flows.restore(key, record, { state: 'timeout' });
  assert.equal(flows.state(key), 'timeout');
  assert.equal(flows.view(key).actions[0].action, 'wake.flow.retry');
});

test('connectionRecord_preserves_identity_failure_and_normalizes_success', () => {
  for (const identityError of ['forbidden', 'missing_uid', undefined]) {
    const record = connectionRecord({ target: 'context', method: 'kubeconfig', identity: null, identityError });
    assert.equal(record.identityError, identityError || null);
  }
});
test('kubeconfig_paste_yaml_error_shows_the_backend_line_and_column', async () => {
  const env = fakeEnv({ add: async () => ({ error: 'invalid YAML (line 1, column 9)', code: 'YAML_PARSE_ERROR', line: 1, column: 9 }) });
  const flows = createFlows(env); await flows.run('k', 'file', { text: 'foo: [bar' });
  const cause = flows.view('k').cause;
  assert.equal(cause?.key, 'wake.flow.c.yamlAt', 'the cause names the YAML error, not only "kubeconfig 저장 실패"');
  assert.deepEqual([cause.vars.line, cause.vars.column], [1, 9]);
  const flows2 = createFlows(fakeEnv({ add: async () => ({ error: 'invalid YAML', code: 'YAML_PARSE_ERROR' }) }));
  await flows2.run('k', 'file', { text: '\t' });
  assert.equal(flows2.view('k').cause?.key, 'wake.flow.c.yaml');
});

/* G-1: 새로 연결한 kubeconfig의 exec 인증 명령이 허락 전이면(needs_consent) 그 줄은 인증 단계에서 멈추고 "명령 확인"을 먼저 준다 */
test('a_new_connection_whose_sign_in_command_needs_consent_offers_to_review_it', async () => {
  const env = fakeEnv({ add: async () => ({ contexts: ['eks-prod'] }), probe: async () => ({ state: 'needs_consent', command: '/opt/homebrew/bin/aws', error: 'needs your consent' }) });
  const flows = createFlows(env); await flows.run('k', 'file', { text: 'apiVersion: v1' });
  const f = flows.get('k');
  assert.equal(f.state.authn, 'fail', 'stops at the sign-in step');
  assert.deepEqual(f.actions, ['consent', 'retry'], 'review the command first');
  assert.equal(ACTIONS.consent.action, 'wake.exec.review');
});

/* 출시 직전 백엔드 남은 것: 클러스터에 쓰는 명령(commands.json confirm)은 사람의 확인을 기다리는데, 그동안 15초 출력 없음(응답 기다리는 중)이 떴다.
   확인은 데스크톱의 OS 확인 창이 받는다(review 6): 첫 출력 전에는 사람이 할 차례라 출력 없음을 세지 않고, 첫 출력부터 센다 */
test('a_command_waiting_for_the_desktop_confirmation_is_not_reported_as_silent_until_it_starts_printing', async () => {
  const oldQuiet = LIMITS.quietMs; LIMITS.quietMs = 30;
  let output = null, finish = null;
  const seen = [];
  try {
    const flows = createFlows(fakeEnv({ service: async name => (name === 'kube.can' ? { allowed: true } : name === 'agent.prep' ? { helm: true, chart: '/fixture/app/wake-agent-only', exists: true, image: { published: true } } : { lookup: 'present', rolloutReady: true }),
      terminal: () => ({ run: ({ command, onOutput }) => { assert.equal(command.confirm, true); output = onOutput; return new Promise(r => { finish = r; }); }, cancel() {}, close() {} }) }));
    const running = flows.run('agent-confirm', 'agent', {}, null, { cluster: 'fixture-cluster', kind: 'agent' });
    for (let i = 0; i < 40 && !output; i++) await new Promise(r => setTimeout(r, 5));
    await new Promise(r => setTimeout(r, 1300));
    seen.push(flows.get('agent-confirm').cause);
    output?.('Release "wake-agent" does not exist. Installing it now.\n');
    await new Promise(r => setTimeout(r, 1300));
    seen.push(flows.get('agent-confirm').cause);
    finish?.({ exit: 0 }); await running;
  } finally { LIMITS.quietMs = oldQuiet; }
  assert.deepEqual(seen, [null, 'quiet'], 'no silence while the confirmation is open; silence counts after the command starts printing');
});
