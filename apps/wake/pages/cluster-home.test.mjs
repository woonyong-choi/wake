import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import config from '../app.config.js';
import { unconnected } from '../data/index.js';
import { components as C } from '../../../kit/page/index.js';
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
import { extendIcons, extendGlyphs } from '../../../kit/index.js';
extendGlyphs(config.icons.glyphs); extendIcons(config.icons.map);

let createPage;
globalThis.captureHome = (_, create) => { createPage = create; };
const source = (await readFile(new URL('./cluster-home.js', import.meta.url), 'utf8'))
  .replaceAll(/from '([^']+)'/g, (_, path) => `from '${new URL(path, import.meta.url).href}'`)
  .replace('bootPage(config,', 'globalThis.captureHome(config,');
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
delete globalThis.captureHome;
const tick = () => new Promise(resolve => setImmediate(resolve));
/* 테스트 전용 합성 행(이 파일 안에만 있음): 메인 프로세스가 준 모양의 행. 출처가 없는 자료 키는 앱과 같이 연결 안 됨으로 거절 */
const ROWS = {
  pods: [{ name: 'checkout-api-7cf98-p4x2m', ns: 'payments', status: ['danger', 'CrashLoopBackOff'], restarts: 9, owner: { kind: 'ReplicaSet', name: 'checkout-api-7cf98' } },
    { name: 'checkout-api-7cf98-d9m2p', ns: 'payments', status: ['ok', 'Running'], restarts: 0, owner: { kind: 'ReplicaSet', name: 'checkout-api-7cf98' } }],
  deployments: [{ name: 'checkout-api', ns: 'payments', kind: 'Deployment', status: ['warn', 'Progressing'] }],
};
const FIXTURE = {
  cluster: async () => ({ id: 'fixture-context', state: 'ok' }),
  summary: async () => ({ usage: { cpu: 31, memory: 40 }, nodes: { total: 1, notReady: 0 } }),
  resources: async p => structuredClone(ROWS[p.kind] ?? []),
  events: async () => [],
  clusterTools: async () => [],
  agent: async () => ({}),
};
async function pageWith(override = {}, cluster = 'fixture-context', view = 'cluster') {
  const data = { get: (key, params) => Object.hasOwn(override, key) ? override[key](params) : FIXTURE[key] ? FIXTURE[key](params) : Promise.reject(unconnected(key)) };
  let state = { q: '', range: { preset: '1h' } };
  const navigated = [];
  let settings = {}; /* 셸처럼 쓰기를 바로 설정에 남긴다(범위 상자는 늘 설정에서 읽음) */
  const ctx = { params: { cluster, ...(view === 'metric' ? { metric: 'cpu' } : {}) }, route: { id: view }, query: {}, data, t: (key, vars) => vars ? `${key}${JSON.stringify(vars)}` : key, update() {}, settings: () => settings, desktopInfo: () => null,
    state: () => state, setState: patch => { state = { ...state, ...patch }; }, api: { navigate: address => navigated.push(address), setMeta() {}, setSetting: (key, value) => { settings = { ...settings, [key]: value }; } } };
  const page = await createPage(ctx); await page.init?.();
  return { page, ctx, navigated };
}
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };

test('home_follows_the_simulation_order_and_names_the_missing_incident_store', async () => {
  /* 칩 줄은 연결한 것이 있을 때만 있다: 설치된 에이전트 하나로 순서를 본다 */
  const { page } = await pageWith({ agent: async () => ({ lookup: 'present', installed: true, rolloutReady: true }) }); await settle(); page.render(); await settle();
  const s = page.render().s;
  const order = ['data-c="page-header"', 'data-c="source-chips"', 'data-id="wake-scope"', ...['wake.home.incidents', 'wake.metric.cpu', 'wake.view.podFlow', 'wake.home.badPods', 'wake.view.unavailable', 'wake.view.warnEvents', 'wake.view.recentChanges', 'wake.view.conn', 'wake.inc.list.past'].map(x => `aria-label="${x}"`)];
  const at = order.map(x => s.indexOf(x));
  assert.ok(at.every(i => i >= 0), JSON.stringify(order.filter((_, i) => at[i] < 0)));
  assert.deepEqual([...at].sort((a, b) => a - b), at, JSON.stringify(order.map((x, i) => [x, at[i]])));
  assert.doesNotMatch(s, /data-c="pill-tabs"[^>]*id="home"/, 'no pill tabs between views');
  assert.match(s, /aria-label="wake.home.incidents"[\s\S]*?wake.view.toolOff/, 'incident card says its store is not connected');
  assert.doesNotMatch(s, /wake.home.openIncidents/, 'no incident count without the store');
});

/* A-04: 홈의 기간 고르기는 Prometheus가 말하지 않은 보관 기간(지어낸 15일)으로 막지 않는다 */
test('home_range_has_no_invented_metric_retention', async () => {
  const { page } = await pageWith(); await settle();
  assert.equal(page.screen.range.retention, undefined, 'no retention the source did not report');
  assert.doesNotMatch(page.render().s, /timeRange\.beyond/, 'no preset disabled by an invented retention');
});

test('home_warning_events_are_counted_once_per_object_and_reason', async () => {
  const at = new Date(Date.now() - 60_000).toISOString();
  const ev = (uid, name, count) => ({ uid, ns: 'app', name: uid, type: 'Warning', reason: 'BackOff', message: 'm', at, count, object: { kind: 'Pod', ns: 'app', name } });
  const { page } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({}), events: async () => [ev('e1', 'a', 3), ev('e2', 'a', 4), ev('e3', 'b', 1)] }, 'native-context');
  await settle();
  const s = page.render().s;
  assert.match(s, /wake.view.warnEvents<\/span>[\s\S]*?<b>2<\/b>/, 'two rows: object and reason');
  assert.match(s, /wake.view.occurrences<\/span><b>8<\/b>/, 'occurrences summed');
});

/* R4-03: 좁은 폭(820px 창·AI 창 열림)의 홈 경고 이벤트 카드는 이벤트 화면과 같은 규칙으로 접는다: 대상(Object)·Count는 남고 Message가 먼저 접히며,
   대상 이름은 가운데를 줄여 끝(구별하는 꼬리)을 남긴다 */
test('home_warning_events_keep_the_object_and_fold_the_message_first_like_the_events_screen', async () => {
  const at = new Date(Date.now() - 60_000).toISOString();
  const { page } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({}), events: async () => [{ uid: 'e1', ns: 'app', name: 'e1', type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container', at, count: 3, object: { kind: 'Pod', ns: 'app', name: 'checkout-api-58cbf4fb5f-x2x9k' } }] }, 'native-context');
  await settle();
  const s = page.render().s, card = s.slice(s.indexOf('aria-label="wake.view.warnEvents"'), s.indexOf('aria-label="wake.view.recentChanges"'));
  const heads = [...card.matchAll(/<th class="[^"]*"([^>]*)>([^<]*)</g)].map(m => [m[2], m[1].match(/data-opt="(\d+)"/)?.[1] ?? null]);
  const folds = heads.filter(([, o]) => o).sort((a, b) => a[1] - b[1]).map(([label]) => label);
  assert.deepEqual(folds, ['Message'], `only the Message folds, the Object and the Count stay: ${JSON.stringify(heads)}`);
  assert.match(card, /class="dt-trim" data-trim>Pod\/checkout-api-58cbf4fb5f-x2x9k</, 'the Object keeps its end when cut (middle trim)');
});

test('home_pending_failure_forbidden_and_retry_are_distinct', async () => {
  for (const error of [new Error('offline'), Object.assign(new Error('denied'), { status: 403 })]) {
    let fail = true;
    const { page } = await pageWith({ resources: p => fail && p.kind === 'pods' ? Promise.reject(error) : FIXTURE.resources(p) });
    await settle(); assert.match(page.render().s, error.status === 403 ? /wake.flow.c.forbidden/ : /wake.find.c.read/);
    fail = false; await page.actions['wake.home.retry'](); await settle();
    assert.doesNotMatch(page.render().s, /wake.find.c.read|wake.flow.c.forbidden/);
  }
});

test('a_down_cluster_is_never_shown_as_current', async () => {
  /* 연결 확인(kube.probe)이 Pod 읽기보다 나중에 실패: 마지막 읽기가 실패라 끊김 */
  let probed; const late = new Promise(resolve => { probed = resolve; });
  const { page } = await pageWith({ cluster: () => late, summary: async () => ({}), resources: async () => [{ name: 'p', ns: 'app', status: ['danger', 'Error'] }] }, 'native-context'); await settle();
  await new Promise(resolve => setTimeout(resolve, 5)); probed({ state: 'off' }); await settle();
  const s = page.render().s;
  assert.match(s, /data-c="stale-line"/); assert.match(s, /wake.view.k8sDown/); assert.match(s, /wake.view.snapshot/);
});

/* B-08: 연결 확인 한 번이 실패(state off)해도 그 뒤 Kubernetes 읽기가 성공하면 끊김이 아니다. 끊김은 마지막 읽기가 실패일 때만, 마지막 성공 시각과 함께 */
test('home_kubernetes_state_follows_the_latest_read_and_names_the_last_success_when_down', async () => {
  const { page } = await pageWith({ cluster: async () => ({ state: 'off' }), summary: async () => ({}), resources: async p => { await settle(); return FIXTURE.resources(p); } }, 'native-context');
  await settle(); await settle();
  assert.doesNotMatch(page.render().s, /wake.view.k8sDown/, 'a later successful read is not shown as disconnected');
  const okAt = new Date(2025, 10, 16, 10, 4).getTime();
  const offline = () => Promise.reject(new Error('connect ECONNREFUSED'));
  const down = await pageWith({ cluster: async () => ({ state: 'off' }), resources: offline, events: offline, sourceStates: async () => ({ kubernetes: { id: 'kubernetes', state: 'error', at: Date.now(), last: okAt } }) }, 'native-context');
  await settle(); await settle();
  const s = down.page.render().s;
  assert.match(s, /data-c="stale-line"[\s\S]*?wake.view.k8sDown · wake.tool.lastOk 2025-11-16 10:04/, 'every read failed: down with the hub\'s last success time');
});

/* 머리 값과 그래프는 같은 기준(B1, 2026-11-16 사용자 지적 "머리 2%, 그래프 3.9%"): 허브 시리즈가 있으면 머리는 그 선의 마지막 점이다.
   이전 기대(머리 = metrics-server 사용량 31%)는 그래프(Prometheus 시리즈)와 다른 출처·다른 식이라 같은 화면에서 두 값이 어긋났다 */
test('metric_bars_head_the_last_point_of_the_drawn_series_and_ask_the_hub_for_named_series', async () => {
  const asked = [];
  const result = name => ({ series: name, query: `query of ${name}`, unit: '%', step: 30, range: { from: Date.now() - 3600e3, to: Date.now() }, fetchedAt: Date.now(), result: [{ metric: {}, values: [[Math.floor(Date.now() / 1000), name === 'cluster.err' ? '2.5' : '7']] }] });
  const { page } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({ usage: { cpu: 31, memory: 40 } }), metricSeries: p => { asked.push(p); return Promise.resolve(result(p.series)); } }, 'native-context');
  for (let i = 0; i < 6 && asked.length < 4; i++) { page.render(); await settle(); }
  page.render(); await settle(); const s = page.render().s;
  assert.deepEqual(asked.map(p => p.series), ['cluster.cpu', 'cluster.mem', 'cluster.err', 'cluster.rps']);
  assert.ok(asked.every(p => !('query' in p) && p.step >= 15 && p.to > p.from), 'names, window and step only (no PromQL from the screen)');
  assert.doesNotMatch(s, /wake.home.openIncidents/); assert.match(s, /2\.50%/); assert.match(s, /query of cluster\.rps/);
  assert.match(s, /aria-label="wake.metric.cpu"[\s\S]*?7%/, 'the CPU head is the last point of cluster.cpu, the line drawn under it');
  assert.doesNotMatch(s, />(31|40)%</, 'not the metrics-server usage, a value the chart does not draw');
  /* 허브 시리즈가 없을 때만 metrics-server 지금 사용량 */
  const off = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({ usage: { cpu: 31, memory: 40 } }) }, 'native-context');
  await settle(); off.page.render(); await settle();
  assert.match(off.page.render().s, />31%</);
});

test('metric_view_names_prometheus_for_the_top_five_until_the_hub_reads_series', async () => {
  const { page, navigated } = await pageWith({}, 'fixture-context', 'metric'); await settle(); page.render(); await settle();
  const s = page.render().s;
  assert.match(s, /wake.metric.byNode[\s\S]*?wake.view.toolOff/); assert.doesNotMatch(s, /topk\(5/);
  page.actions['wake.home.metric']({ arg: 'mem' });
  assert.deepEqual(navigated, ['wake://cluster/fixture-context/metrics/mem']);
});

test('cluster_search_lists_names_under_the_toolbar_and_opens_the_detail', async () => {
  const { page, ctx, navigated } = await pageWith(); await settle();
  page.actions['kit.composer.send']({ id: 'wake-scope', text: 'checkout' }); page.render(); await settle();
  const s = page.render().s;
  assert.match(s, /wake.search.result/); assert.match(s, /checkout-api/);
  page.actions['wake.search.open']({ arg: 'deployments/payments/checkout-api' });
  assert.deepEqual(navigated, ['wake://cluster/fixture-context/ns/payments/deployments/checkout-api']);
});

test('incident_view_names_the_missing_incident_store', async () => {
  const { page } = await pageWith({}, 'native-context', 'incidents'); await settle();
  assert.match(page.render().s, /wake.view.toolOff/);
});

/* B-01: the costs and agent screens had no way in from the cluster. The chip row ends with both screens as chips with no state
   (the agent chip only while no agent is installed: an installed agent already has its source chip), each opening its screen */
test('home_chip_row_ends_with_the_costs_and_agent_screens', async () => {
  const { page, navigated } = await pageWith({ agent: async () => ({ lookup: 'absent', installed: false }), sourceStates: async () => ({}) });
  await settle(); page.render(); await settle();
  const s = page.render().s.match(/<div class="srcc" data-c="source-chips">[\s\S]*?<\/div>/)?.[0] ?? '';
  const screens = [...s.matchAll(/data-action="wake.home.screen" data-arg="&quot;(\w+)&quot;"/g)].map(m => m[1]);
  assert.deepEqual(screens, ['agent', 'costs'], 'the chip row names the agent and costs screens');
  assert.doesNotMatch(s, /data-action="wake.home.screen"[^>]*data-state|data-state="[a-z]+" data-action="wake.home.screen"/, 'a screen chip carries no source state');
  page.actions['wake.home.screen']({ arg: 'costs' }); page.actions['wake.home.screen']({ arg: 'agent' });
  assert.deepEqual(navigated, ['wake://cluster/fixture-context/costs', 'wake://cluster/fixture-context/agent']);
  const installed = await pageWith({ agent: async () => ({ lookup: 'present', installed: true, rolloutReady: true }), sourceStates: async () => ({}) });
  await settle(); installed.page.render(); await settle();
  assert.deepEqual([...installed.page.render().s.matchAll(/data-action="wake.home.screen" data-arg="&quot;(\w+)&quot;"/g)].map(m => m[1]), ['costs'], 'an installed agent keeps its source chip only');
});

test('home_source_chips_show_only_connected_tools_and_an_installed_agent_and_open_their_cluster_screens', async () => {
  /* 연결하지 않은 도구(찾기로 확인 안 됨·연결 기록 없음)와 설치되지 않은 에이전트는 칩이 없다 */
  const none = await pageWith({ clusterTools: async () => [{ kind: 'prometheus', selection: 'unverified', svc: 'monitoring/kps-prometheus' }], agent: async () => ({ lookup: 'absent', installed: false }), sourceStates: async () => ({}) });
  await settle(); none.page.render(); await settle();
  assert.doesNotMatch(none.page.render().s, /data-state="[a-z]+" data-action="wake.home.source"/, 'no source chip, only the screen chips (B-01)');
  /* 찾기로 확인한 도구는 칩이 있고 상태는 허브 출처 상태(hub.sources): 답하지 않으면 끊김 */
  const some = await pageWith({ clusterTools: async () => [{ kind: 'prometheus', selection: 'verified', svc: 'monitoring/kps-prometheus' }, { kind: 'loki', selection: 'unverified', svc: 'monitoring/loki' }],
    agent: async () => ({ lookup: 'present', installed: true, rolloutReady: true }), sourceStates: async () => ({ prometheus: { state: 'error' } }) });
  await settle(); some.page.render(); await settle();
  const s = some.page.render().s.match(/<div class="srcc" data-c="source-chips">[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(s, /data-c="source-chips"/);
  assert.match(s, /data-state="error" data-action="wake.home.source" data-arg="&quot;prometheus&quot;"/);
  assert.doesNotMatch(s, /data-arg="&quot;loki&quot;"/);
  /* 칩은 그 클러스터 본문의 에이전트·도구 화면으로 */
  some.page.actions['wake.home.source']({ arg: 'agent' }); some.page.actions['wake.home.source']({ arg: 'prometheus' });
  assert.deepEqual(some.navigated, ['wake://cluster/fixture-context/agent', 'wake://cluster/fixture-context/tools?tool=prometheus']);
});

/* U-01 S7: Prometheus가 멈추면(시간 초과) 홈 값이 마지막 값 없이 사라졌다. 마지막으로 읽은 선과 그 시각을 남기고 머리는 값 없이 "<출처> 끊김 · 마지막 수집" */
test('a_connected_tool_that_stops_answering_keeps_its_chip_and_shows_it_down', async () => {
  /* 연결 근거가 있는 도구만: Prometheus는 찾기가 고정 receipt로 확인한 뒤 Pod 준비가 내려감(not-ready), Loki는 이 클러스터에 연결한 기록이 있고 허브가 지금 끊김 */
  const p = await pageWith({ clusterTools: async () => [{ kind: 'prometheus', selection: 'not-ready', ready: 0, state: 'found', svc: 'monitoring/kps-prometheus' }, { kind: 'loki', selection: 'unverified', svc: 'monitoring/loki' }],
    agent: async () => ({ lookup: 'absent', installed: false }), sourceStates: async () => ({ loki: { state: 'error', lastSuccessAt: new Date(Date.now() - 600e3).toISOString() } }) });
  p.ctx.settings = () => ({ 'wake.connections': { 'fixture-context-loki': { target: 'fixture-context-loki', method: 'tool-open', kind: 'tool', where: { cluster: 'fixture-context', tool: { kind: 'loki', ns: 'monitoring', svc: 'loki' } } } } });
  await settle(); p.page.render(); await settle();
  const s = p.page.render().s.match(/<div class="srcc" data-c="source-chips">[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(s, /data-state="error" data-action="wake.home.source" data-arg="&quot;prometheus&quot;"/);
  assert.match(s, /data-state="error" data-action="wake.home.source" data-arg="&quot;loki&quot;"/, 'a tool with a connection record keeps its chip while it is down');
});

test('a_tool_whose_first_attempt_failed_and_was_never_connected_makes_no_chip', async () => {
  /* 허브에 실패 시도만 있는(연결 기록 없음·찾기 미확인) 도구: unconfigured·forbidden·unavailable 어느 것도 칩이 아님 */
  for (const state of ['unconfigured', 'forbidden', 'error']) {
    const p = await pageWith({ clusterTools: async () => [{ kind: 'loki', selection: 'unverified', svc: 'monitoring/loki' }],
      agent: async () => ({ lookup: 'absent', installed: false }), sourceStates: async () => ({ loki: { state, lastSuccessAt: null } }) });
    await settle(); p.page.render(); await settle();
    assert.doesNotMatch(p.page.render().s, /class="srcc-chip"[^>]*data-arg="&quot;loki&quot;"/, state);
  }
});

test('the_connections_card_lists_only_connected_tools_with_the_hub_state_and_nothing_else', async () => {
  const card = html => html.match(/aria-label="wake.view.conn"[\s\S]*?<\/details>/)?.[0] ?? '';
  /* 연결 근거 없음(찾기 미확인·연결 기록 없음·허브에 실패 시도만, 에이전트 미설치): 줄 없음, 설정 › 도구로 가는 링크 하나 */
  const none = await pageWith({ clusterTools: async () => [{ kind: 'loki', selection: 'unverified', svc: 'monitoring/loki' }], agent: async () => ({ lookup: 'absent', installed: false }), sourceStates: async () => ({ loki: { state: 'error' } }) });
  await settle(); none.page.render(); await settle();
  const empty = card(none.page.render().s);
  assert.doesNotMatch(empty, /data-arg="&quot;loki&quot;"|data-arg="&quot;agent&quot;"/);
  assert.match(empty, /wake:\/\/settings\/tools/);
  /* 연결한 뒤 끊김: 줄이 남고 허브 상태(끊김) */
  const down = await pageWith({ clusterTools: async () => [{ kind: 'loki', selection: 'unverified', svc: 'monitoring/loki' }, { kind: 'tempo', selection: 'unverified', svc: 'monitoring/tempo' }], agent: async () => ({ lookup: 'absent', installed: false }),
    sourceStates: async () => ({ loki: { state: 'error' }, tempo: { state: 'error' } }) });
  down.ctx.settings = () => ({ 'wake.connections': { 'fixture-context-loki': { target: 'fixture-context-loki', method: 'tool-open', kind: 'tool', where: { cluster: 'fixture-context', tool: { kind: 'loki' } } } } });
  await settle(); down.page.render(); await settle();
  const kept = card(down.page.render().s);
  assert.match(kept, /data-arg="&quot;loki&quot;"/, 'a connected tool keeps its row');
  assert.match(kept, /sti error/, 'and shows it down');
  assert.doesNotMatch(kept, /data-arg="&quot;tempo&quot;"/, 'a never-connected tool has no row');
});

test('a_series_whose_source_stops_answering_keeps_its_last_line_and_names_the_source', async () => {
  let down = false;
  const at = Math.floor(Date.now() / 1000) - 120;
  const result = name => ({ series: name, query: `query of ${name}`, unit: '%', step: 30, range: { from: Date.now() - 3600e3, to: Date.now() }, fetchedAt: Date.now(), result: [{ metric: {}, values: [[at - 30, '6'], [at, '7']] }] });
  const { page, ctx } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({ usage: { cpu: 31, memory: 40 } }),
    metricSeries: p => down ? Promise.reject(Object.assign(new Error('timeout'), { kind: 'timeout', source: 'prometheus' })) : Promise.resolve(result(p.series)) }, 'native-context');
  await settle(); page.render(); await settle();
  assert.match(page.render().s, /aria-label="wake.metric.cpu"[\s\S]*?7%/);
  down = true; await page.actions['wake.home.retry'](); page.render(); await settle();
  const s = page.render().s, cpu = s.slice(s.indexOf('aria-label="wake.metric.cpu"'), s.indexOf('aria-label="wake.metric.mem"'));
  assert.match(cpu, /wake.view.toolDown\{&quot;tool&quot;:&quot;Prometheus&quot;\}/, 'the source is named');
  const head = cpu.split('data-chart=')[0];
  assert.match(head, /wake.view.toolDown\{&quot;tool&quot;:&quot;Prometheus&quot;\}/, 'the source is down');
  assert.match(head, /<small>wake.view.lastCollected\{&quot;at&quot;:&quot;\d\d:\d\d&quot;\}<\/small>/, 'when the kept value was observed, in a cell of its own (never cut off by the state\'s ellipsis)');
  assert.match(head, /<b>7%<\/b>/, 'the last good value stays in the value cell, with nothing added to it (a fixed-width cell)');
  assert.doesNotMatch(head, /wake.rv.lastSample/);
  assert.match(head, /data-shrink[^>]*>[\s\S]*?data-tip-overflow/, 'the state gives way with an ellipsis and its whole words as a tip');
  assert.doesNotMatch(cpu, /wake.find.c.read/, 'not a read failure: the last line stays');
  assert.match(cpu, /data-chart=/, 'the chart keeps the last line');
  /* the Prometheus chip says the same as the values (connected tool), and clears with the next good read */
  down = false; await page.actions['wake.home.retry'](); page.render(); await settle();
  const back = page.render().s, cpuBack = back.slice(back.indexOf('aria-label="wake.metric.cpu"'), back.indexOf('aria-label="wake.metric.mem"'));
  assert.doesNotMatch(cpuBack, /wake.view.toolDown/, 'a good read clears it');
  assert.match(cpuBack, /7%/);
});

test('the_prometheus_chip_fails_with_the_series_it_could_not_read', async () => {
  let down = false;
  const at = Math.floor(Date.now() / 1000) - 120;
  const result = name => ({ series: name, query: 'q', unit: '%', step: 30, range: { from: Date.now() - 3600e3, to: Date.now() }, fetchedAt: Date.now(), result: [{ metric: {}, values: [[at, '7']] }] });
  const { page, ctx } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({}),
    clusterTools: async () => [{ kind: 'prometheus', selection: 'verified', svc: 'monitoring/kps-prometheus' }], sourceStates: async () => ({ prometheus: { state: 'ready', lastSuccessAt: new Date().toISOString() } }),
    metricSeries: p => down ? Promise.reject(Object.assign(new Error('timeout'), { kind: 'timeout', source: 'prometheus' })) : Promise.resolve(result(p.series)) }, 'native-context');
  await settle(); page.render(); await settle();
  const state = () => { const h = page.render().s, i = h.indexOf('data-c="source-chips"'); return i < 0 ? null : (/data-state="(\w+)"/.exec(h.slice(i)) || [])[1]; };
  const before = state();
  assert.ok(before && before !== 'error', `chip drawn and not failing first (${before})`);
  down = true; await page.actions['wake.home.retry'](); page.render(); await settle();
  assert.equal(state(), 'error', `chip was ${before}, now fails with the values`);
  down = false; await page.actions['wake.home.retry'](); page.render(); await settle();
  assert.equal(state(), before, 'and comes back with the next good read');
});

/* U-01 S7 B: 새로 연 홈에서 출처가 답하지 않으면 남길 마지막 값이 없다. 그때 다른 출처(metrics-server)의 값으로 칸을 채우지 않고 "<출처> 끊김", 칩도 같은 실패 */
test('a_fresh_home_whose_series_source_does_not_answer_names_it_and_borrows_no_other_value', async () => {
  const { page } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({ usage: { cpu: 31, memory: 40 } }),
    clusterTools: async () => [{ kind: 'prometheus', selection: 'verified', svc: 'monitoring/kps-prometheus' }], sourceStates: async () => ({ prometheus: { state: 'ready', lastSuccessAt: new Date().toISOString() } }),
    metricSeries: () => Promise.reject(Object.assign(new Error('timeout'), { kind: 'timeout', source: 'prometheus' })) }, 'native-context');
  for (let i = 0; i < 4; i++) { page.render(); await settle(); }
  const s = page.render().s, cpu = s.slice(s.indexOf('aria-label="wake.metric.cpu"'), s.indexOf('aria-label="wake.metric.mem"'));
  assert.match(cpu, /wake.view.toolDown\{&quot;tool&quot;:&quot;Prometheus&quot;\}/);
  assert.doesNotMatch(s, />(31|40)%</, 'no metrics-server value in place of the series');
  assert.equal((/data-state="(\w+)"/.exec(s.slice(s.indexOf('data-c="source-chips"'))) || [])[1], 'error');
});

/* B1: 지난 구간을 보는 동안 머리 값은 그 구간 끝의 값이고, 그 구간이 머리에 보인다. 처음 보던 지금 창으로 돌아오면 지금 기간으로 돌아가고 표시가 사라진다 */
test('a_past_window_names_its_span_in_the_head_and_going_back_restores_the_live_range', async () => {
  const asked = [];
  const result = (name, from, to) => ({ series: name, query: 'q', unit: '%', step: 60, range: { from, to }, fetchedAt: Date.now(),
    result: [{ metric: {}, values: [[Math.ceil(from / 1000), '5'], [Math.floor(to / 1000), to < Date.now() - 60e3 ? '9' : '7']] }] });
  const { page, ctx } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({}), metricSeries: p => { asked.push(p); return Promise.resolve(result(p.series, p.from, p.to)); } }, 'native-context');
  for (let i = 0; i < 4; i++) { page.render(); await settle(); }
  const cpu = () => { const s = page.render().s; return s.slice(s.indexOf('aria-label="wake.metric.cpu"'), s.indexOf('aria-label="wake.metric.mem"')).split('data-chart=')[0]; };
  assert.match(cpu(), /<b>7%<\/b>/); assert.doesNotMatch(cpu(), /wake.overview.collected/, 'the live window has no span note');
  const live = ctx.state().range, drawn = asked.find(p => p.series === 'cluster.cpu');
  /* a narrower window told by the chart (axis stretch): a past window */
  const mid = (drawn.from + drawn.to) / 2000;
  page.actions['wake.home.zoom']({ id: 'home:cluster.cpu', from: Math.round(mid - 600), to: Math.round(mid + 600), source: 'scale' });
  for (let i = 0; i < 4; i++) { page.render(); await settle(); }
  assert.equal(ctx.state().range.live, false);
  assert.match(cpu(), /<b>9%<\/b>/, 'the head is the last point of the window shown');
  assert.match(cpu(), /<small>wake.overview.collected\{&quot;from&quot;:&quot;[^&]+&quot;,&quot;to&quot;:&quot;[^&]+&quot;\}<\/small>/, 'and says which span it is the end of');
  /* back to the window it started from (a double click on the axis tells that window): the live range again, and the note goes */
  page.actions['wake.home.zoom']({ id: 'home:cluster.cpu', from: drawn.from / 1000, to: drawn.to / 1000, source: 'scale' });
  for (let i = 0; i < 4; i++) { page.render(); await settle(); }
  assert.deepEqual(ctx.state().range, live);
  assert.doesNotMatch(cpu(), /wake.overview.collected/);
});

/* U-01 판단(B1 범위): 끊김 뒤 사람이 다시 읽기를 누르면 지표 시리즈도 다시 읽어 값과 끊김 표시가 바뀐다(기간을 바꿀 때만 읽던 결함) */
test('retry_reads_the_metric_series_again', async () => {
  let down = true, asked = 0;
  const at = Math.floor(Date.now() / 1000) - 60;
  const { page } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({}),
    metricSeries: p => { asked++; return down ? Promise.reject(Object.assign(new Error('timeout'), { kind: 'timeout', source: 'prometheus' }))
      : Promise.resolve({ series: p.series, query: 'q', unit: '%', step: 30, range: { from: Date.now() - 3600e3, to: Date.now() }, fetchedAt: Date.now(), result: [{ metric: {}, values: [[at, '7']] }] }); } }, 'native-context');
  const cpu = () => { const s = page.render().s; return s.slice(s.indexOf('aria-label="wake.metric.cpu"'), s.indexOf('aria-label="wake.metric.mem"')); };
  /* a loaded host (check-tests in parallel) takes more turns to answer: wait until the bar is no longer loading, not a fixed number of turns */
  const loaded = async () => { for (let i = 0; i < 200 && /data-state="loading"/.test(cpu()); i++) await settle(); };
  for (let i = 0; i < 4; i++) { page.render(); await settle(); }
  await loaded();
  assert.match(cpu(), /wake.view.toolDown/);
  const before = asked; down = false;
  await page.actions['wake.home.retry']();
  for (let i = 0; i < 4; i++) { page.render(); await settle(); }
  for (let i = 0; i < 200 && !/>7%</.test(cpu()); i++) await settle(); /* bounded: a failure still fails, only later */
  assert.ok(asked > before, 'the series are asked again');
  assert.doesNotMatch(cpu(), /wake.view.toolDown/); assert.match(cpu(), />7%</);
});

/* C안(사용자 결정 2026-11-16): 막대는 화면을 처음 그릴 때 한 번만 값으로 열린다. 처음 그린 뒤 임계값을 넘은 값은 막대를 열지 않고 머리만 위험 표시(U-01: 5xx가 1.0% 근처를
   오가며 카드가 1022↔90px로 열리고 닫혀 아래를 밀었다). 사람이 누른 열림·닫힘이 늘 먼저 */
const root = () => ({ dataset: {}, ownerDocument: { defaultView: { addEventListener() {} } } });
const errBar = s => s.match(/<details class="sbar"[^>]*data-sbar-arg="&quot;m-err&quot;"[^>]*>/)?.[0] ?? s.match(/<details class="sbar"[^>]*data-sbar-arg="\\?"m-err\\?""[^>]*>/)?.[0] ?? '';
const seriesWith = errValue => p => Promise.resolve({ series: p.series, query: 'q', unit: '%', step: 30, range: { from: Date.now() - 3600e3, to: Date.now() }, fetchedAt: Date.now(), result: [{ metric: {}, values: [[Math.floor(Date.now() / 1000), p.series === 'cluster.err' ? String(errValue()) : '7']] }] });
const opened = s => { const i = s.indexOf('aria-label="wake.metric.err"'); const head = s.lastIndexOf('<details', i); return /^<details[^>]* open/.test(s.slice(head, i)); };

test('a_metric_bar_over_its_threshold_opens_only_when_the_screen_is_first_drawn_with_it', async () => {
  let err = 2.5;
  const { page } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({}), metricSeries: seriesWith(() => err) }, 'native-context');
  const first = page.render().s; page.afterRender(root());
  assert.equal(opened(first), true, 'over the threshold at the first drawing: open');
  err = 0.2; page.actions['wake.home.retry'](); for (let i = 0; i < 4; i++) { page.render(); await settle(); }
  assert.equal(opened(page.render().s), true, 'the value falls back: the bar keeps the state it was drawn with');
});

test('a_metric_bar_crossing_its_threshold_after_the_first_drawing_stays_closed_and_marks_its_head', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const { page } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({}), metricSeries: async p => { await waiting; return seriesWith(() => 2.5)(p); } }, 'native-context');
  page.render(); page.afterRender(root());
  release();                                     // drawn before the series came
  for (let i = 0; i < 4; i++) { page.render(); await settle(); }
  const s = page.render().s;
  assert.equal(opened(s), false, 'not opened by itself');
  assert.match(s, /aria-label="wake.metric.err"[\s\S]*?data-tone="danger"[\s\S]*?2\.50%/, 'the head carries the danger value');
  page.actions['wake.home.card']({ arg: 'm-err', open: true });               // a person opens it
  assert.equal(opened(page.render().s), true);
});

test('home_draws_bars_of_the_final_size_with_grey_value_places_before_its_data', async () => {
  const never = () => new Promise(() => {});
  const { page } = await pageWith({ cluster: never, summary: never, resources: never, events: never, incidents: never, metricSeries: never }, 'native-context');
  const s = page.render().s;
  assert.match(s, /<div class="sbar" data-c="summary-bar"><div class="sbar-h">(?:(?!<\/div><\/div>)[\s\S])*?data-c="skeleton"/, 'the summary bar with value places');
  const top = s.slice(0, s.indexOf('aria-label="wake.home.incidents"'));
  assert.doesNotMatch(top, /wake.res.loading/, 'no loading line in place of the bar (a closed bar\'s body may still say it reads)');
  assert.doesNotMatch(s, /aria-label="wake.view.podFlow"[\s\S]{0,400}<b>0<\/b>/, 'no made-up zero before the pods are read');
});

test('home_pending_reads_draw_the_first_skeleton_after_the_fold_window', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  /* the window is measured on performance.now(): hold that clock with the mocked timers, so a slow machine (a long module load) does not use the window up */
  const realNow = performance.now.bind(performance); let clock = 0;
  performance.now = () => clock; t.after(() => { performance.now = realNow; });
  const tickBy = ms => { clock += ms; t.mock.timers.tick(ms); };
  const pending = () => new Promise(() => {});
  let first;
  const opened = pageWith({ cluster: pending, summary: pending, resources: pending, events: pending, clusterTools: pending, agent: pending });
  void opened.then(value => { first = value; });
  await settle();
  assert.equal(first, undefined, 'the fold decision window precedes the first skeleton');
  tickBy(99); await settle();
  assert.equal(first, undefined);
  tickBy(1); await settle();
  assert.ok(first, 'unresolved reads must not hold the skeleton past the fold window');
  assert.match(first.page.render().s, /data-c="skeleton"/);
  first.page.afterRender(root());
});

test('incident_cards_arriving_after_the_first_drawing_stay_closed_until_a_person_opens_them', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const { page } = await pageWith({ incidents: () => waiting }, 'native-context', 'incidents');
  page.render(); page.afterRender(root());
  release([]); await settle();
  const isIncidentOpen = () => { const s = page.render().s, i = s.indexOf('aria-label="wake.home.openIncidents"'); return /^<details[^>]* open/.test(s.slice(s.lastIndexOf('<details', i), i)); };
  assert.equal(isIncidentOpen(), false);
  page.actions['wake.inc.card']({ arg: 'open', open: true });
  assert.equal(isIncidentOpen(), true);
});

/* RULE-FOLD: 지표·인시던트 밖의 카드(문제 Pod·Unavailable)도 자료가 판단 가능해진 시각으로 최초 펼침을 정한다 */
for (const arrival of [50, 160]) test(`home_problem_cards_fold_by_arrival_${arrival}_even_when_first_render_is_late`, async t => {
  let clock = 0;
  t.mock.method(performance, 'now', () => clock);
  const { page } = await pageWith({ incidents: async () => [], resources: async p => { clock = arrival; return structuredClone(ROWS[p.kind] ?? []); }, metricSeries: seriesWith(() => 0.1) });
  clock = 200;
  const first = page.render().s;
  const cardOpen = label => { const at = first.indexOf(`aria-label="${label}"`); return /^<details[^>]* open/.test(first.slice(first.lastIndexOf('<details', at), at)); };
  assert.equal(cardOpen('wake.home.badPods'), arrival <= 100);
  assert.equal(cardOpen('wake.view.unavailable'), arrival <= 100);
});

for (const arrival of [50, 100, 160]) test(`home_fold_uses_arrival_${arrival}_even_when_first_render_is_late`, async t => {
  let clock = 0;
  t.mock.method(performance, 'now', () => clock);
  const { page } = await pageWith({
    incidents: async () => { clock = arrival; return []; },
    metricSeries: async p => { clock = arrival; return seriesWith(() => 2.5)(p); },
  });
  clock = 200;
  const first = page.render().s;
  assert.equal(opened(first), arrival <= 100);
  const at = first.indexOf('aria-label="wake.home.incidents"');
  /* A3-12: no open incident, nothing to look at: the card stays closed whenever its data came (RULE-FOLD), and stays closed on a revisit */
  assert.equal(/^<details[^>]* open/.test(first.slice(first.lastIndexOf('<details', at), at)), false);
  page.afterRender(root());
  page.actions['wake.home.card']({ arg: 'm-err', open: true });
  page.actions['wake.home.card']({ arg: 'h-inc', open: true });
  assert.equal(opened(page.render().s), true);
});

/* H-009 수정 1회차: 닫힌 지표 막대의 셋째 칸은 정상 체크 아이콘 하나가 아니라, 펼친 그래프와 같은 시리즈의 기간 최고와 임계값(이름-값 칸).
   임계값이 없는 막대(초당 요청)는 최고만. 넘음 상태는 한 번만(RULE-TONE): 넘으면 임계값 칸 자리에 넘음 표시 하나 */
const headOf = (s, id, next) => { const from = s.indexOf(`aria-label="wake.metric.${id}"`), to = next ? s.indexOf(`aria-label="wake.metric.${next}"`) : s.indexOf('aria-label="wake.view.podFlow"'); return s.slice(from, to).split(/data-chart=|<div class="sbar-body">/)[0]; };
const seriesOf = values => p => Promise.resolve({ series: p.series, query: 'q', unit: p.series === 'cluster.rps' ? '/s' : '%', step: 30, range: { from: Date.now() - 3600e3, to: Date.now() }, fetchedAt: Date.now(),
  result: [{ metric: {}, values: values[p.series].map((v, i, all) => [Math.floor(Date.now() / 1000) - (all.length - 1 - i) * 30, String(v)]) }] });
const settled = async page => { for (let i = 0; i < 6; i++) { page.render(); await settle(); } return page.render().s; };

test('metric_rows_show_the_range_peak_and_threshold_from_the_drawn_series_in_place_of_the_ok_mark', async () => {
  const { page } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({}),
    metricSeries: seriesOf({ 'cluster.cpu': [12, 23, 7], 'cluster.mem': [40, 41, 42], 'cluster.err': [0.2, 0.4, 0.1], 'cluster.rps': [120, 340, 200] }) }, 'native-context');
  const s = await settled(page), cpu = headOf(s, 'cpu', 'mem'), err = headOf(s, 'err', 'rps'), rps = headOf(s, 'rps');
  const peak = h => h.match(/<span class="sbar-n">wake\.metric\.rangePeak\{&quot;range&quot;:&quot;timeRange\.preset\.1h&quot;\}<\/span><b>([^<]*)<\/b>/)?.[1];
  const limit = h => h.match(/<span class="sbar-n">wake\.metric\.threshold<\/span><b>([^<]*)<\/b>/)?.[1];
  assert.equal(peak(cpu), '23%', 'the CPU row names the highest point of the hour the chart draws');
  assert.equal(limit(cpu), '80%', 'and its threshold, a name and a value');
  assert.doesNotMatch(cpu, /data-c="status-icon"/, 'no lone ok mark in the row');
  assert.equal(peak(err), '0.40%'); assert.equal(limit(err), '1.00%');
  assert.equal(peak(rps), '340/s', 'a row without a threshold shows the highest point only');
  assert.doesNotMatch(rps, /wake.metric.threshold/);
});

test('a_metric_row_over_its_threshold_states_it_once_in_place_of_the_threshold_cell', async () => {
  const { page } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({}),
    metricSeries: seriesOf({ 'cluster.cpu': [12, 23, 7], 'cluster.mem': [40, 41, 42], 'cluster.err': [0.2, 3.1, 2.5], 'cluster.rps': [1, 2, 3] }) }, 'native-context');
  const err = headOf(await settled(page), 'err', 'rps');
  assert.equal(err.match(/wake\.metric\.over/g)?.length, 1, 'the over state once');
  assert.doesNotMatch(err, /wake\.metric\.threshold/, 'no second threshold cell beside it');
  assert.match(err, /data-tone="danger"[^>]*>[\s\S]*?<b>2.50%<\/b>/);
  assert.match(err, /wake.metric.rangePeak[^<]*<\/span><b>3.10%<\/b>/);
});

/* H-009 수정 1회차: 판정은 알림 규칙과 같은 원시값 비교(>)이고, 보이는 값은 그 판정과 어긋나지 않게 임계값과 갈리는 자리까지 보인다(5xx 1.04%를 "1.0%"로 보이며 "임계값 1.0% 넘음") */
test('a_value_just_over_its_threshold_is_never_shown_at_or_under_it', async () => {
  const { page } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({}),
    metricSeries: seriesOf({ 'cluster.cpu': [12, 80.3], 'cluster.mem': [40, 85], 'cluster.err': [0.2, 1.04], 'cluster.rps': [1, 2] }) }, 'native-context');
  const s = await settled(page), err = headOf(s, 'err', 'rps'), cpu = headOf(s, 'cpu', 'mem'), mem = headOf(s, 'mem', 'err');
  assert.match(err, /<b>1.04%<\/b>/, 'the 5xx value shows the digit that puts it over 1.0%');
  assert.doesNotMatch(err, /<b>1\.0%<\/b>/);
  assert.match(err, /wake\.metric\.over/);
  assert.match(cpu, /<b>80.3%<\/b>/, 'CPU 80.3% is over 80%: not shown as 80%');
  assert.match(mem, /<b>85%<\/b>/, 'a value equal to the threshold is not over it and keeps its usual digits');
  assert.doesNotMatch(mem, /wake\.metric\.over/);
});

/* A-27: 한 막대의 값 · 기간 최고 · 임계값은 같은 자릿수(같은 비교 집합의 소수점 정책): 1.04% · 1.2% · 1.0%로 흔들리지 않는다 */
test('a_metric_row_reads_its_value_peak_and_threshold_with_the_same_digits', async () => {
  const { page } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({}),
    metricSeries: seriesOf({ 'cluster.cpu': [12, 23, 7], 'cluster.mem': [40, 41, 42], 'cluster.err': [0.2, 1.2, 1.04], 'cluster.rps': [1, 2, 3] }) }, 'native-context');
  const err = headOf(await settled(page), 'err', 'rps');
  const figures = [...err.matchAll(/(\d+\.\d+)%/g)].map(m => m[1]);
  assert.deepEqual([...new Set(figures.map(f => f.split('.')[1].length))], [2], `one digit policy in the row: ${figures}`);
});

/* A2-11: 초당 요청은 유효 숫자 둘(2.4/s, 0.53/s, 340/s), 5xx 비율은 값이 임계값을 넘든 아니든 늘 소수 둘째 자리(0.90% · 1.02% · 임계값 1.00%):
   값이 임계값을 오가도 자릿수가 바뀌지 않는다. 축 글도 같은 모양(단위 앞 공백 없음, kit value-axis) */
test('rates_read_with_two_significant_digits_and_the_5xx_ratio_keeps_two_decimals', async () => {
  const head = async (err, rps) => { const { page } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({}),
    metricSeries: seriesOf({ 'cluster.cpu': [12, 23], 'cluster.mem': [40, 41], 'cluster.err': err, 'cluster.rps': rps }) }, 'native-context');
    const s = await settled(page); return { err: [...headOf(s, 'err', 'rps').matchAll(/<b>([^<]*)<\/b>/g)].map(m => m[1]).filter(v => /%$/.test(v)), rps: [...headOf(s, 'rps').matchAll(/<b>([^<]*)<\/b>/g)].map(m => m[1]).filter(v => /\/s$/.test(v)) }; };
  assert.deepEqual(await head([0.2, 0.4, 0.9], [1.2, 2.41, 2.37]), { err: ['0.90%', '0.90%', '1.00%'], rps: ['2.4/s', '2.4/s'] });
  assert.deepEqual(await head([0.2, 1.3, 1.02], [0.12, 0.53, 0.5]), { err: ['1.02%', '1.30%'], rps: ['0.50/s', '0.53/s'] });
  assert.deepEqual((await head([0.1, 0.2], [120, 340, 200])).rps, ['200/s', '340/s']);
  const { formatValue } = await import('../../../kit/page/index.js');
  assert.equal(formatValue(0.5, '/s'), '0.5/s', 'the axis writes a bare rate like the head');
  assert.equal(formatValue(2, 'MiB/s'), '2 MiB/s', 'a named rate keeps its space');
});

test('home_warning_occurrences_count_only_the_window_not_the_cumulative_event_count', async () => {
  /* a BackOff that began two days ago has count 2439: its earlier repeats are outside the last hour. One that began 10 minutes ago counts all of its 5 */
  const ago = ms => new Date(Date.now() - ms).toISOString();
  const ev = (uid, count, firstAt) => ({ uid, ns: 'app', name: uid, type: 'Warning', reason: 'BackOff', message: 'm', at: ago(60_000), firstAt, count, object: { kind: 'Pod', ns: 'app', name: uid } });
  const { page } = await pageWith({ cluster: async () => ({ state: 'ok' }), summary: async () => ({}), events: async () => [ev('old', 2439, ago(2 * 86_400_000)), ev('new', 5, ago(600_000))] }, 'native-context');
  await settle();
  const s = page.render().s;
  assert.doesNotMatch(s, /wake.view.occurrences<\/span><b>2,?444<\/b>/, 'not the cumulative count');
  assert.match(s, /wake.view.occurrences<\/span><b>≥6<\/b>/, 'the 5 known inside the hour and at least the last one of the older event');
  assert.doesNotMatch(s, /BackOff 2,?444/, 'the Reason cell counts the same window');
});

/* A-21: 인시던트 결과 알약은 알림 상태 알약처럼 늘 같은 결과 다섯을 수와 함께 보이고(결과가 없을 때 "전체 0" 하나만이 아님),
   "전체"는 결과 표가 거르는 모집단(구간 안 지난 인시던트)을 센다: 열린 인시던트는 자기 카드에서 센다 */
test('incident_result_pills_show_every_result_and_count_the_table_population', async () => {
  const { incidentsView } = await import('./incident-parts.js');
  const now = Date.now(), list = [{ id: 'a', number: 'INC-1', title: 'checkout', at: now - 60_000, phase: 'investigating' }, { id: 'b', number: 'INC-2', title: 'past', at: now - 120_000, result: 'symptom', phase: 'resolved' }];
  const s = String(incidentsView({ t: k => k, list, st: { result: 'all', range: { preset: '24h' } }, now, actions: { result: 'r', open: 'o', card: 'c', page: 'p' } }).s);
  const bar = /data-tabs="wake-inc-result"[\s\S]*?pill-ind/.exec(s)?.[0] ?? '';
  const pills = [...bar.matchAll(/data-arg="&quot;(\w+)&quot;"[\s\S]*?<span class="n">(\d+)<\/span>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(pills, [['all', '1'], ['service', '0'], ['symptom', '1'], ['mitigated', '0'], ['bypassed', '0'], ['resumed', '0']]);
});

/* A-22: 홈 지표 아래 카드(문제 Pod · Unavailable 워크로드 · 경고 이벤트 …)는 따로 그려져 이름 칸 폭이 글 길이를 따라 첫 구분선이 줄마다 달랐다.
   지표 막대와 같은 이름 칸 폭의 한 표(summaryBar.metrics)로 묶여 첫 구분선이 같은 자리에 선다 */
test('home_cards_under_the_metrics_share_the_metric_name_column', async () => {
  const { page } = await pageWith({ sourceStates: async () => ({}) });
  await settle(); page.render(); await settle();
  const s = page.render().s;
  const groups = [...s.matchAll(/<div class="sbm"[^>]*style="--sbm-1:([^;"]+)/g)].map(m => m[1]);
  assert.ok(groups.length >= 2 && groups.every(w => w === groups[0]), `the metric bars and the cards under them start their first column at one width: ${JSON.stringify(groups)}`);
  const cards = s.slice(s.lastIndexOf('class="sbm"'));
  assert.match(cards, /aria-label="[^"]*"/, 'the cards under the metrics sit in that group');
});
