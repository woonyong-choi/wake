/* 연결 확인 상태 -> 묶음 표 고정: node --test apps/wake/data/live.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUP_OF, GROUPS, cardOf } from './live.js';

test('누가 풀 수 있는가 기준 세 묶음', () => {
  assert.deepEqual(GROUPS.map(g => g.id), ['ok', 'check', 'perm']);
  assert.deepEqual(Object.entries(GROUP_OF).filter(([, g]) => g === 'check').map(([s]) => s).sort(), ['cert', 'config', 'needs_consent', 'noAuthTool', 'timeout', 'unauthorized', 'unknown', 'unreachable', 'unsupported']);
  assert.deepEqual(Object.entries(GROUP_OF).filter(([, g]) => g === 'perm').map(([s]) => s).sort(), ['forbidden']);
  assert.equal(GROUP_OF.ok, 'ok');
});
test('카드: 연결됨은 체크와 버전·노드, 문제는 동작 버튼 하나', () => {
  const ctx = { id: 'c', ctx: 'c', authKind: 'exec', provider: 'eks', file: '/k' };
  const ok = cardOf(ctx, { state: 'ok', version: 'v1.32.2', nodes: 1 });
  assert.equal(ok.kind, 'ok'); assert.equal(cardOf(ctx, { state: 'unknown' }).kind, 'error'); assert.equal(cardOf(ctx, { state: 'cert' }).kind, 'error'); assert.equal(cardOf(ctx, { state: 'unreachable' }).kind, 'error'); assert.equal(cardOf(ctx, { state: 'noAuthTool' }).kind, 'fix'); assert.equal(cardOf(ctx, { state: 'forbidden' }).kind, 'perm'); assert.equal(ok.action, null); assert.deepEqual(ok.desc.vars, { version: 'v1.32', n: 1 });
  assert.equal(cardOf(ctx, { state: 'unauthorized' }).action.label, 'wake.flow.a.login');
  assert.equal(cardOf(ctx, { state: 'unauthorized' }).action.arg.command, 'aws sso login');
  assert.equal(cardOf({ ...ctx, authKind: 'token' }, { state: 'unauthorized' }).action.label, 'wake.flow.a.retry');
  assert.equal(cardOf(ctx, { state: 'noAuthTool', command: '/usr/bin/kubelogin' }).action.arg.command, 'brew install Azure/kubelogin/kubelogin');
  assert.equal(cardOf(ctx, { state: 'forbidden', error: 'x' }).action.action, 'wake.cluster.needPerm');
  for (const st of ['cert', 'unsupported']) assert.equal(cardOf(ctx, { state: st, error: 'x' }).action.label, 'wake.flow.a.retry');
  assert.equal(cardOf(ctx, { state: 'unreachable' }).action.label, 'wake.flow.a.retry');
});

test('default_browser_connection_discovery_has_no_mock_contexts_or_probe_success', async () => {
  const { createLive } = await import('./live.js');
  const live = createLive();
  assert.deepEqual((await live.readKube()).contexts, []);
  await assert.rejects(live.probe('prod-apne2'), /no service host/);
});


test('cluster presentation uses exact native metadata and actual endpoint without changing identity', async () => {
  const { clusterMetadata, clusterPresentation } = await import('./live.js');
  const context = { id: 'gke_project_region_long-context', ctx: 'original-context', provider: 'gke', server: 'https://gke-real.example.goog', state: 'forbidden' };
  const before = structuredClone(context);
  const catalog = { status: 'ok', connections: [{ status: 'configured', identity: { cluster: context.id, clusterName: 'wake-credit-check', projectId: 'project-a', location: 'region-a', source: 'observability-connections.v1' } }] };
  const metadata = clusterMetadata(context, catalog);
  assert.equal(clusterPresentation({ ...context, presentation: metadata }).name, 'wake-credit-check');
  assert.equal(clusterPresentation(context).name, context.id);
  assert.equal(clusterPresentation({ id: 'loading' }).name, 'loading');
  assert.equal(clusterMetadata(context, { status: 'ok', connections: [null] }), null);
  assert.equal(clusterPresentation(context).endpoint, 'gke-real.example.goog');
  assert.deepEqual(context, before);
  for (const server of ['https://10.2.3.4', 'https://10.2.3.4:6443', 'https://[2001:db8::1]:6443']) {
    assert.equal(clusterPresentation({ ...context, provider: 'eks', server }).endpoint, new URL(server).hostname + ':' + (new URL(server).port || '443'));
  }
  assert.equal(clusterPresentation({ ...context, server: 'invalid' }).endpoint, '');
  assert.equal(clusterMetadata(context, { ...catalog, connections: [...catalog.connections, { ...catalog.connections[0], identity: { ...catalog.connections[0].identity, clusterName: 'other-cluster' } }] }), null);
  assert.equal(clusterPresentation({ ...context, server: 'https://other.example', presentation: metadata }).name, context.id);
  assert.equal(clusterMetadata(context, { status: 'invalid_configuration', connections: catalog.connections }), null);
});


test('optional catalog reads coalesce in flight, terminate and never replace kube state or query metrics', async t => {
  const { readClusterCatalog, createLive } = await import('./live.js');
  let release, calls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const call = name => { calls++; assert.equal(name, 'observability.catalog'); return pending; };
  const a = readClusterCatalog(call), b = readClusterCatalog(call);
  assert.equal(a, b); await Promise.resolve(); assert.equal(calls, 1);
  release({ status: 'unconfigured', connections: [] }); await a;
  await readClusterCatalog(async () => { throw new Error('optional catalog denied'); });
  let expire;
  t.mock.method(globalThis, 'setTimeout', fn => { expire = fn; return 1; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  const delayed = readClusterCatalog(() => new Promise(() => {})); expire(); assert.equal(await delayed, null);
  t.mock.restoreAll();
  const context = { id: 'real', ctx: 'real', server: 'https://10.0.0.1', provider: 'kubernetes' };
  const methods = [];
  globalThis.kitService = { call: async name => { methods.push(name); if (name === 'kube.read') return { contexts: [context] }; throw new Error('optional denied'); } };
  t.after(() => { delete globalThis.kitService; });
  const kube = await createLive().readKube();
  assert.equal(kube.contexts[0].id, 'real'); assert.equal(kube.contexts[0].presentation, null);
  assert.deepEqual(methods, ['kube.read', 'observability.catalog']);
});

test('live_probe_reversed_responses_keep_latest_identity_and_recheck_persists_it', async t => {
  const { createLive } = await import('./live.js');
  const pending = [];
  globalThis.kitService = { call: () => new Promise(resolve => pending.push(resolve)) };
  t.after(() => { delete globalThis.kitService; });
  const live = createLive();
  const old = live.probe('same-context'), latest = live.probe('same-context');
  const current = { state: 'ok', identity: { uid: 'new', ref: 'Namespace/kube-system' }, identityError: null };
  pending[1](current); await latest;
  pending[0]({ state: 'ok', identity: { uid: 'old', ref: 'Namespace/kube-system' } }); await old;
  assert.equal(live.st.results['same-context'].identity.uid, 'new');
  const saved = { 'wake.clusters.list': [{ id: 'same-context', state: 'ok', identity: { uid: 'old' } }], 'wake.connections': { 'same-context': { kind: 'cluster', identity: { uid: 'old' } } } };
  const api = { settings: { get: key => saved[key] }, setSetting: (key, value) => { saved[key] = value; } };
  const retry = live.recheck(api, ['same-context'], { recheckDone() {} });
  pending[2](current); await retry;
  assert.equal(saved['wake.clusters.list'][0].identity.uid, 'new');
  assert.equal(saved['wake.connections']['same-context'].identity.uid, 'new');
});

async function liveRaceHarness(t, ids = ['context']) {
  const { createLive } = await import('./live.js');
  const pending = [], done = [];
  globalThis.kitService = { call: async (name, args) => {
    if (name === 'kube.read') return { contexts: ids.map(id => ({ id })) };
    if (name === 'observability.catalog') return null;
    assert.equal(name, 'kube.probe');
    return new Promise(resolve => pending.push({ id: args.id, resolve }));
  } };
  t.after(() => { delete globalThis.kitService; });
  const saved = { 'wake.clusters.list': ids.map(id => ({ id, state: 'unknown' })), 'wake.connections': Object.fromEntries(ids.map(id => [id, { target: id }])) };
  const api = { firstRun: { active: () => false }, settings: { get: key => saved[key] }, setSetting: (key, value) => { saved[key] = value; } };
  const flows = { recheckDone: (id, result) => done.push({ id, result }) };
  const result = uid => ({ state: 'ok', identity: { uid, ref: 'Namespace/kube-system' }, identityError: null, checkedAt: uid });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { live: createLive(), pending, saved, api, flows, done, result, flush };
}

for (const cancelledAtStart of [true, false]) test(`live_ineligible_onboarding_probe_does_not_displace_active_recheck_${cancelledAtStart}`, async t => {
  const h = await liveRaceHarness(t);
  const update = h.live.recheck(h.api, ['context'], h.flows);
  let current = !cancelledAtStart;
  const abandoned = h.live.probe('context', () => current);
  current = false;
  h.pending[1].resolve(h.result('abandoned')); await abandoned;
  h.pending[0].resolve(h.result('current')); await update;
  assert.equal(h.live.st.results.context?.identity.uid, 'current');
  assert.equal(h.saved['wake.connections'].context.identity.uid, 'current');
});

test('live_first_recheck_rejects_old_response_while_new_request_is_pending', async t => {
  const h = await liveRaceHarness(t);
  const old = h.live.recheck(h.api, ['context'], h.flows);
  const latest = h.live.recheck(h.api, ['context'], h.flows);
  h.pending[0].resolve(h.result('old')); await old;
  assert.equal(h.live.st.results.context, undefined);
  assert.equal(h.saved['wake.connections'].context.identity, undefined);
  assert.equal(h.done.length, 0);
  h.pending[1].resolve(h.result('new')); await latest;
  assert.equal(h.saved['wake.connections'].context.identity.uid, 'new');
});

for (const first of ['refresh', 'recheck']) for (const olderFinishesFirst of [true, false]) test(`live_refresh_recheck_generation_${first}_${olderFinishesFirst}`, async t => {
  const h = await liveRaceHarness(t);
  const run = name => name === 'refresh' ? h.live.refresh(h.api) : h.live.recheck(h.api, ['context'], h.flows);
  const old = run(first); await h.flush();
  const latest = run(first === 'refresh' ? 'recheck' : 'refresh'); await h.flush();
  const order = olderFinishesFirst ? [0, 1] : [1, 0];
  for (const index of order) {
    h.pending[index].resolve(h.result(index === 0 ? 'old' : 'new'));
    await [old, latest][index];
    const expected = index === 0 && olderFinishesFirst ? undefined : 'new';
    assert.equal(h.saved['wake.clusters.list'][0].identity?.uid, expected);
    assert.equal(h.saved['wake.connections'].context.identity?.uid, expected);
  }
  assert.equal(h.live.st.results.context.identity.uid, 'new');
});

test('live_refresh_later_row_does_not_restore_an_earlier_row_snapshot', async t => {
  const h = await liveRaceHarness(t, ['context', 'second']);
  const refresh = h.live.refresh(h.api); await h.flush();
  h.pending[0].resolve(h.result('old')); await h.flush();
  const retry = h.live.recheck(h.api, ['context'], h.flows);
  h.pending[2].resolve(h.result('new')); await retry;
  h.pending[1].resolve(h.result('second')); await refresh;
  assert.equal(h.saved['wake.clusters.list'][0].identity.uid, 'new');
  assert.equal(h.saved['wake.connections'].context.identity.uid, 'new');
});

/* A-31: a context without a server address (or one that is not a URL) gives an empty endpoint without throwing inside: the page's
   exception log ("Invalid URL" on every page) stays empty */
test('cluster_presentation_of_a_context_without_a_url_server_throws_nothing_inside', async () => {
  const { clusterPresentation } = await import('./live.js');
  const Real = globalThis.URL; let thrown = 0;
  globalThis.URL = class extends Real { constructor(...a) { try { super(...a); } catch (e) { thrown++; throw e; } } };
  try {
    for (const server of [undefined, '', 'not a url']) assert.equal(clusterPresentation({ id: 'c', server }).endpoint, '');
    assert.equal(clusterPresentation({ id: 'c', server: 'https://10.0.0.1:6443' }).endpoint, '10.0.0.1:6443');
  } finally { globalThis.URL = Real; }
  assert.equal(thrown, 0, 'no Invalid URL thrown and caught');
});

/* G-1: kubeconfig의 exec 인증 명령은 사람이 허락해야 실행한다(k8s.cjs needs_consent). 줄은 그 명령을 이름으로 말하고, 할 일은 명령을 보고 허락하기다 */
test('exec_command_waiting_for_consent_names_the_command_and_offers_to_review_it', () => {
  const card = cardOf({ id: 'eks-prod', authKind: 'exec', provider: 'eks' }, { state: 'needs_consent', command: '/opt/homebrew/bin/aws' });
  assert.equal(GROUP_OF.needs_consent, 'check', 'a thing to check on this computer, not a cluster failure');
  assert.equal(card.kind, 'fix');
  assert.deepEqual(card.desc, { key: 'wake.chk.desc.needs_consent', vars: { ns: 'default', command: 'aws', version: '' } });
  assert.equal(card.action?.action, 'wake.exec.review'); assert.deepEqual(card.action?.arg, { id: 'eks-prod' });
});

test('cluster_checks_run_every_two_minutes_at_most_skip_a_hidden_window_and_run_at_once_on_return_or_reconnect', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 });
  const { createLive } = await import('./live.js?probe-pace');
  const probes = [], listeners = {}, doc = { hidden: false, addEventListener: (n, f) => { (listeners['doc:' + n] ??= []).push(f); } };
  globalThis.kitService = { call: async (name, args) => { if (name === 'kube.read') return { contexts: [{ id: 'lab' }] }; if (name === 'kube.probe') { probes.push(args.id); return { state: 'ok', checkedAt: 'x' }; } return null; }, on() {} };
  globalThis.window = { addEventListener: (n, f) => { (listeners[n] ??= []).push(f); } };
  globalThis.document = doc;
  t.after(() => { delete globalThis.kitService; delete globalThis.window; delete globalThis.document; t.mock.timers.reset(); });
  const saved = { 'wake.clusters.list': [{ id: 'lab', state: 'ok' }], 'wake.cluster.refresh': '30', 'wake.cluster.autoRefresh': true, 'wake.cluster.refreshOnFocus': true };
  const api = { firstRun: { active: () => false, render() {} }, settings: { get: key => saved[key] }, setSetting: (key, value) => { saved[key] = value; } };
  const live = createLive(); live.start(api);
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const pass = async ms => { t.mock.timers.tick(ms); await flush(); };
  await pass(60_000);
  assert.deepEqual(probes, [], 'no check every 30 seconds: the least pace is two minutes');
  await pass(60_000);
  assert.deepEqual(probes, ['lab'], 'one check at two minutes');
  doc.hidden = true; await pass(120_000);
  assert.deepEqual(probes, ['lab'], 'a hidden window is not checked on the clock');
  doc.hidden = false; for (const f of listeners['doc:visibilitychange'] ?? []) f(); await flush();
  assert.deepEqual(probes, ['lab', 'lab'], 'the skipped check runs when the window shows again');
  for (const f of listeners.online ?? []) f(); await flush();
  assert.equal(probes.length, 3, 'a reconnect checks at once');
  await pass(61_000); for (const f of listeners.focus ?? []) f(); await flush();
  assert.equal(probes.length, 4, 'coming back to the window checks at once');
});
