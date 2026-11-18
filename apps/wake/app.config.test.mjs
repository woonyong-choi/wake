import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import config, { scopeClusters } from './app.config.js';
import koLocale from './locale/ko.js';
import { sourceOff } from './data/index.js';
import { text } from '../../kit/page/index.js';

test('firstRun_done_skips_failed_clusters_and_keeps_permission_limited_connection', () => {
  const done = config.firstRun.steps.find(step => step.id === 'setup');
  for (const [states, expected] of [
    [['failed', 'ok'], 'wake://cluster/c1'],
    [['unknown', 'forbidden'], 'wake://cluster/c1'],
    [['failed', 'unknown'], 'wake://settings/clusters'],
  ]) {
    const settings = { 'wake.clusters.list': states.map((state, index) => ({ id: `c${index}`, state })), 'wake.clusters.connected': ['c0', 'c1'] };
    assert.equal(done.open({ settings }), expected);
  }
});

/* 첫 실행 단순화(D-USR-2026-11-18): 클러스터 연결 → AI 연결 → 기본 설정(AI 권한 기본값·언어·테마) 세 단계, 시작 화면(welcome)·권한·준비 완료 단계 없음.
   예전 단계에서 멈춘 첫 실행은 그 단계를 넘겨받은 단계로(aliases), "시작"은 연결된 클러스터 홈으로 */
test('first_run_is_three_steps_clusters_ai_and_basic_settings_with_old_steps_mapped', () => {
  const steps = config.firstRun.steps;
  assert.deepEqual(steps.map(st => st.id), ['clusters', 'ai', 'setup']);
  assert.ok(steps.every(st => st.progress), 'three step dots');
  assert.deepEqual(steps[0].aliases, ['welcome']);
  assert.equal(steps[0].back, false, 'the first step has no back button');
  assert.deepEqual(steps[2].aliases, ['permission', 'done']);
  const setup = steps[2];
  assert.equal(setup.kind, 'done');
  assert.deepEqual(setup.options.map(o => o.key), ['wake.perm.default', 'kit.locale', 'kit.theme']);
  assert.deepEqual(setup.options[0].choices.map(c => c.id), ['read', 'ask']);
  assert.equal(config.settings.defaults['wake.perm.default'], 'read', 'read only unless changed here');
  assert.equal(setup.primary, 'wake.fr.start');
});

test('every_route_has_example_params_and_every_cluster_view_has_an_example_screen', () => {
  for (const route of config.routes) {
    assert.ok(Object.hasOwn(config.examples.params, route.id), `${route.id}: missing example params`);
    for (const param of route.pattern.matchAll(/:([a-zA-Z]+)/g)) {
      assert.ok(config.examples.params[route.id][param[1]], `${route.id}: missing ${param[1]}`);
    }
  }
  for (const view of ['resources', 'network', 'gitops', 'logs', 'alerts', 'incidents', 'ailog', 'tools', 'agent', 'metrics/cpu']) assert.ok(config.examples.screens.includes(`wake://cluster/check-cluster/${view}`), view);
  assert.equal(config.routes.some(item => item.id === 'monitoring'), false);
});

test('sidebar_is_clusters_bookmarks_conversations_and_open_tabs_without_page_rows', () => {
  /* 결정: 사이드바는 연결된 클러스터, 북마크, 대화·인시던트, 열린 탭. 클러스터 안 페이지(홈, 리소스 …)는 본문 경로 막대의 구역 전환으로 간다 */
  assert.deepEqual(config.sidebar.sections.map(s => s.id), ['clusters', 'pinned', 'conversations', 'tabs']);
});

test('sidebar_cluster_provider_icons_preserve_navigation_suffix_and_filter', () => {
  const settings = { 'wake.clusters.list': [
    { id: 'eks-fixture', provider: 'eks', state: 'ok' },
    { id: 'gke-fixture', provider: 'gke', state: 'forbidden' },
    { id: 'aks-fixture', provider: 'aks', state: 'ok' },
    { id: 'docker-fixture', provider: 'docker', state: 'ok' },
    { id: 'minikube-fixture', provider: 'minikube', state: 'ok' },
    { id: 'kubernetes-fixture', provider: 'kubernetes', server: 'https://synthetic.invalid', state: 'ok' },
    { id: 'kind-fixture', provider: 'kind', state: 'ok' },
    { id: 'unknown-fixture', provider: 'other', state: 'failed' },
  ] };
  const rows = config.sidebar.sections[0].rows({ settings, dev: false });

  assert.deepEqual(rows.map(r => r.icon), ['brand-aws', 'brand-googlecloud', 'brand-azure', 'brand-docker', 'brand-kubernetes', 'brand-kubernetes', 'brand-kubernetes', 'brand-kubernetes']);
  assert.equal(scopeClusters(settings, true).at(-1).icon, 'brand-kubernetes');
  assert.deepEqual(scopeClusters({ ...settings, 'wake.clusters.connected': ['gke-fixture'] }, false).map(row => row.id), ['gke-fixture']);
  for (const row of rows) {
    assert.equal(row.dot, undefined);
    assert.equal(row.address, `wake://cluster/${row.id}`);
    assert.equal(row.context, 'wake.cluster');
    assert.equal(row.arg, row.id);
  }
  assert.deepEqual(rows.map(r => r.ctx), ['', '', '', '', '', 'synthetic.invalid', '', '']);
  assert.equal(config.sidebar.sections[0].rows({ settings: { ...settings, 'wake.cluster.hideOff': true }, dev: false }).length, 7);
});

test('terminal_cluster_descendants_preserve_namespace_and_resource_identity', () => {
  const st = { settings: { 'wake.clusters.connected': ['fixture-a', 'fixture-b'] }, dev: false };
  for (const route of ['cluster', 'list', 'detail']) {
    const match = { route: { id: route }, params: { cluster: 'fixture-a', ns: 'payments', kind: 'pods', name: 'fixture-pod' } };
    const key = config.terminal.session(match, st);
    assert.deepEqual(JSON.parse(key), { mode: 'remote', cluster: 'fixture-a', namespace: 'payments', scope: 'payments', kind: 'pods', name: 'fixture-pod' });
    assert.notEqual(config.terminal.session({ ...match, params: { ...match.params, ns: 'other' } }, st), key);
    assert.notEqual(config.terminal.session({ ...match, params: { ...match.params, name: 'other-pod' } }, st), key);
    assert.equal(JSON.parse(config.terminal.session({ ...match, params: { ...match.params, cluster: 'fixture-b' } }, st)).cluster, 'fixture-b');
    assert.equal(config.terminal.session({ ...match, params: { cluster: 'unconnected' } }, st), null);
  }
  assert.equal(config.terminal.session({ params: {} }, st), null);
  assert.equal(config.terminal.session({ params: { cluster: 'wake-sample' } }, st), null);
});

test('development_flag_alone_cannot_open_a_sample_terminal', async () => {
  const match = { params: { cluster: 'wake-sample', ns: 'payments', kind: 'pods', name: 'fixture-pod' } };
  assert.equal(config.terminal.session(match, { settings: {}, dev: true }), null);
  await assert.rejects(config.terminal.open(JSON.stringify({ mode: 'local', cluster: 'wake-sample' }), { dev: true }), /unavailable/);
});

test('terminal_without_native_environment_fails_instead_of_inheriting_global_context', async () => {
  await assert.rejects(config.terminal.open(JSON.stringify({ mode: 'remote', cluster: 'fixture-a' }), { dev: false, settings: { get: () => ['fixture-a'] } }), /unavailable/);
});

test('release_without_clusters_uses_existing_connection_settings', () => {
  globalThis.kitService = {};
  try {
    const state = { settings: {} };
    assert.equal(config.start(state), 'wake://settings/clusters');
    assert.equal(config.firstRun.steps.at(-1).open(state), 'wake://settings/clusters');
    assert.equal(config.ai.scope.label(state, {}), 'wake.scope.clusters');
    const rows = config.sidebar.sections.find(section => section.id === 'conversations').rows(state);
    assert.equal(rows.some(row => row.id === 'all'), false);
    assert.deepEqual(config.palette.sources.find(source => source.id === 'conv').search(), []);
  } finally {
    delete globalThis.kitService;
  }
});

test('release_with_connected_context_opens_that_cluster', () => {
  globalThis.kitService = {};
  try {
    const settings = {
      'wake.clusters.list': [{ id: 'test-context', provider: 'kind', state: 'ok' }],
      'wake.clusters.connected': ['test-context'],
    };
    assert.equal(config.start({ settings }), 'wake://cluster/test-context');
    assert.equal(config.firstRun.steps.at(-1).open({ settings }), 'wake://cluster/test-context');
    assert.deepEqual(config.ai.scope.label({}, settings), { raw: 'test-context · default' });
  } finally {
    delete globalThis.kitService;
  }
});

test('no_cluster_appears_without_a_connected_kubeconfig_context', () => {
  globalThis.kitService = {};
  try {
    assert.deepEqual(scopeClusters({}), []);
  } finally {
    delete globalThis.kitService;
  }
});

test('browser_default_has_no_clusters_or_conversations', () => {
  assert.equal(config.start({ settings: {} }), 'wake://settings/clusters');
  assert.deepEqual(scopeClusters({}), []);
  assert.deepEqual(config.palette.sources.find(source => source.id === 'conv').search(), []);
});

test('ai_panel_says_the_ai_is_not_connected_without_calling_a_model', async () => {
  const replies = [];
  for await (const part of config.ai.adapter.send({ messages: [{ role: 'user', text: 'why' }] }, {})) replies.push(part);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].type, 'error');
  assert.equal(replies[0].message, text(sourceOff('ai')));
  assert.deepEqual(sourceOff('ai'), { key: 'wake.view.toolOff', vars: { tool: { raw: 'AI' } } });
  /* 승인 결정은 메인 프로세스(허브)만 기록한다: 서비스 호스트가 없으면 결정이 남지 않고 거절된다 */
  await assert.rejects(config.ai.adapter.resolveApproval('apr-x', 'allow'));
});

test('cluster_settings_sections_follow_the_existing_page_context', () => {
  const page = config.settings.groups.flatMap(group => group.pages).find(item => item.id === 'clusters');
  const sections = dev => page.sections({ settings: () => ({}), desktopInfo: () => ({ dev }) });

  assert.equal(sections(false).some(section => section.title === 'wake.s.clusters.sampleConn'), false);
  assert.equal(sections(true).some(section => section.title === 'wake.s.clusters.sampleConn'), false);
});

test('cluster_settings_preserve_an_explicitly_empty_list', () => {
  const page = config.settings.groups.flatMap(group => group.pages).find(item => item.id === 'clusters');
  const sections = (settings, dev) => page.sections({ settings: () => settings, desktopInfo: () => ({ dev }) });

  for (const dev of [true, false]) assert.equal(sections({ 'wake.clusters.list': [], 'wake.clusters.connected': [] }, dev)[0].count, 0);
  assert.equal(sections({}, false)[0].count, 0);
  assert.equal(sections({}, true)[0].count, 0);
});

test('desktop_start_search_follows_the_existing_page_state', async () => {
  for (const id of ['resources', 'conv']) {
    const source = config.palette.sources.find(item => item.id === id);
    assert.deepEqual(await source.search('', { settings: {}, dev: true }), []);
    assert.deepEqual(await source.search('', { settings: {}, dev: false }), []);
  }
  assert.equal(config.palette.sources.find(item => item.id === 'resources').queryOnly, true);
});

test('empty_bookmarks_use_a_disabled_parent_without_a_submenu', () => {
  const account = config.menus['wake.account'](null, { dev: false, settings: { 'wake.clusters.list': [] } }, {});
  const empty = account.items.find(item => item.id === 'acc-marks');
  assert.equal(empty.label, 'wake.account.noMarks');
  assert.equal(empty.disabled, true);
  assert.equal(empty.submenu, undefined);
  assert.equal(empty.action, undefined);
});

test('saved_bookmarks_keep_the_existing_submenu_and_navigation', () => {
  const bookmark = { id: 'test', label: 'wake.section.pinned', icon: 'bookmark', address: 'wake://settings/general' };
  const account = config.menus['wake.account'](null, { dev: false, settings: { 'wake.clusters.list': [], 'wake.pinned.added': [bookmark] } }, {});
  const item = account.items.find(item => item.id === 'acc-marks');
  assert.equal(item.label, 'wake.section.pinned');
  assert.equal(item.disabled, undefined);
  assert.equal(item.submenu.items[0].id, 'am-test');
  assert.equal(item.submenu.items[0].action, 'kit.navigate');
  assert.equal(item.submenu.items[0].arg.address, bookmark.address);
});


/* R4-16: settings showed switches for what this version does not do (장애 알림, Secret 값 읽기, namespace마다 표시) as locked switches with
   "not supported" under them. A setting that can never be changed is not a setting: no row is a switch that is always disabled */
test('settings_show_no_locked_switch_for_a_feature_this_version_does_not_have', async () => {
  const st = { 'wake.clusters.list': [{ id: 'fixture-ns-cluster', provider: 'kind', state: 'ok' }] };
  const ctx = { settings: () => st, update() {}, desktopInfo: () => ({ dev: false }),
    data: { get: async key => key === 'namespaces' ? ['payments', 'orders'] : key === 'agent' ? { lookup: 'absent', installed: false, unknown: false } : [] } };
  const pages = config.settings.groups.flatMap(g => g.pages).flatMap(p => [p, ...(typeof p.children === 'function' ? p.children({ settings: st }) : p.children || [])]);
  const locked = [], keys = new Map();
  for (const p of pages) {
    const sections = typeof p.sections === 'function' ? await p.sections(ctx) : p.sections;
    for (const s of sections) for (const g of s.groups || []) for (const row of Array.isArray(g) ? g : g.rows) {
      if (row.control?.key) keys.set(row.control.key, row.control);
      if (row.control?.type === 'switch' && row.control.disabled === true) locked.push(`${p.id}/${row.id}`);
    }
  }
  assert.deepEqual(locked, []);
  for (const key of ['wake.archive.keep', 'kit.theme', 'kit.locale', 'wake.cluster.autoRefresh', 'wake.cluster.refresh', 'kit.ai.followUp']) assert.notEqual(keys.get(key)?.disabled, true, key);
  const ko = (await import('./locale/ko.js')).default;
  for (const key of ['wake.s.notifyIncidents', 'wake.s.notifyIncidents.desc', 'wake.s.cl.nsVisibility']) assert.equal(Object.hasOwn(ko, key), false, key);
  assert.equal(Object.hasOwn(config.settings.defaults, 'wake.perm.secret'), false);
  /* the cluster menu (top-bar identity) had the same unsupported feature as a greyed row, "Secret 값 읽기 · 지원하지 않습니다" */
  const info = config.menus['wake.cluster.info']('fixture-ns-cluster', { settings: st }).items;
  assert.deepEqual(info.filter(i => i.disabled).map(i => i.id), [], 'no greyed row for a feature this version does not have');
  for (const key of ['wake.s.perm.secret', 'wake.s.perm.secret.desc']) assert.equal(Object.hasOwn(ko, key), false, key);
});

test('cluster_settings_reject_failed_reads_and_retry_without_cached_failure', async () => {
  const parent = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'clusters');
  const [child] = parent.children({ settings: { 'wake.clusters.list': [{ id: 'fixture-cluster', state: 'ok' }] } });
  const error = Object.assign(new Error('private fixture'), { status: 403 });
  let failed = true;
  const ctx = { settings: () => ({}), data: { get: async key => { if (failed) throw error; return key === 'agent' ? { installed: false } : key === 'gitops' ? {} : []; } } };
  await assert.rejects(child.sections(ctx), e => e === error);
  failed = false;
  assert.ok((await child.sections(ctx)).length > 0);
});

test('unknown_agent_status_is_not_presented_as_uninstalled', async () => {
  /* 이전에는 페이지 전체가 거절됐다(한 클러스터가 다른 클러스터와 페이지를 막음, 검수 B-01). 이제 그 클러스터의 행만 읽기 실패와 다시 시도이고 설치 동작은 없다 */
  const agents = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'agents');
  const ctx = { settings: () => ({ 'wake.clusters.list': [{ id: 'unknown-fixture', state: 'ok' }] }), desktopInfo: () => ({ dev: false }), data: { get: async () => ({ installed: false, unknown: true }) } };
  const first = agents.sections(ctx); await first[0].pending;
  const row = agents.sections(ctx)[0].groups[0][0];
  assert.equal(row.connection.kind, 'error');
  assert.equal(row.connection.action.action, 'kit.settings.reload');
  assert.equal(row.description, 'wake.find.c.read');
  assert.notEqual(row.connection.action.action, 'wake.agent.install');
});

test('settings_reads_per_cluster_never_hold_the_page_and_a_silent_cluster_times_out', async () => {
  const { LIMITS } = await import('./data/connect-flow.js');
  const keep = LIMITS.readMs; LIMITS.readMs = 30;
  try {
    const agents = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'agents');
    const settings = { 'wake.clusters.list': [{ id: 'quiet-fixture', state: 'ok' }, { id: 'fast-fixture', state: 'ok' }] };
    const ctx = { settings: () => settings, data: { get: (_k, p) => (p.cluster === 'quiet-fixture' ? new Promise(() => {}) : Promise.resolve({ lookup: 'present', installed: true, rolloutReady: true })) } };
    /* 첫 그림은 기다리지 않고 바로: 두 클러스터 모두 확인 중 */
    const first = agents.sections(ctx);
    assert.ok(first[0].pending instanceof Promise);
    assert.deepEqual(first[0].groups[0].map(r => r.connection.busy), [true, true]);
    await first[0].pending;
    const second = agents.sections(ctx);
    assert.deepEqual(second[0].groups[0].map(r => r.connection.kind), ['busy', 'ok']);
    await second[0].pending;
    const third = agents.sections(ctx);
    assert.equal(third[0].pending, undefined);
    assert.equal(third[0].groups[0][0].connection.kind, 'error');
    assert.equal(third[0].groups[0][0].description, 'wake.flow.c.timeout');
    /* 권한 페이지의 AI 권한 탭은 클러스터 읽기를 기다리지 않는다 */
    const perms = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'permissions');
    const ps = perms.sections({ settings: () => ({ ...settings, 'wake.clusters.connected': ['quiet-fixture'] }), data: { get: () => new Promise(() => {}) } });
    assert.ok(ps.some(x => x.tab === 'ai' && x.groups[0].length));
    assert.equal(ps.find(x => x.tab === 'cluster').groups[0][0].connection.busy, true);
  } finally { LIMITS.readMs = keep; }
});

test('appearance keeps window style pictures available in the browser preview', async () => {
  const { createSettingsPage } = await import('../../kit/page/index.js');
  const { extendGlyphs, extendIcons } = await import('../../kit/index.js');
  extendGlyphs(config.icons.glyphs); extendIcons(config.icons.map);
  const ctx = { config, params: { page: 'appearance' }, desktop: false, desktopInfo: () => null,
    router: { build: () => 'wake://settings/appearance' }, settings: () => ({}),
    text: x => x?.raw ?? x ?? '', t: x => x, update() {}, api: { setSetting() {} } };
  const page = createSettingsPage(ctx); await page.init();
  assert.match(page.render().s, /data-look="transparent"/);
  assert.match(page.render().s, /data-look="tinted"/);
});

test('cluster_identity_menus_reuse_sidebar_provider_icons_and_connected_filter', () => {
  const settings = {
    'wake.clusters.list': [
      { id: 'eks-fixture', provider: 'eks', state: 'ok' },
      { id: 'gke-fixture', provider: 'gke', state: 'forbidden' },
      { id: 'aks-fixture', provider: 'aks', state: 'ok' },
      { id: 'kind-fixture', provider: 'kind', state: 'ok' },
      { id: 'disconnected-fixture', provider: 'eks', state: 'off' },
    ],
    'wake.clusters.connected': ['eks-fixture', 'gke-fixture', 'aks-fixture', 'kind-fixture'],
    'wake.scope.cluster': 'gke-fixture',
  };
  const state = { settings, dev: false };
  const rows = config.sidebar.sections[0].rows(state);
  const menu = config.menus['wake.switch.cluster']({ cluster: 'gke-fixture' }, state).items;
  assert.deepEqual(menu.map(item => [item.label.raw, item.icon]), rows.map(row => [row.id, row.icon]));
  assert.deepEqual(menu.filter(item => item.checked).map(item => item.label.raw), ['gke-fixture']);
  for (const item of menu) {
    assert.equal(item.action, 'kit.navigate');
    assert.equal(item.arg.address, `wake://cluster/${item.label.raw}`);
  }
  const scope = config.ai.scope.menu({}, null, settings).items.filter(item => item.id?.startsWith('sc-'));
  assert.deepEqual(scope.map(item => [item.label.raw, item.icon]), scopeClusters(settings).map(row => [row.id, row.icon]));
  assert.deepEqual(scope.filter(item => item.checked).map(item => item.arg), ['gke-fixture']);
  assert(scope.every(item => item.action === 'wake.scope.cluster'));
});

test('metric_route_has_no_unconditional_global_entry', () => {
  assert.equal(config.routes.find(item => item.id === 'metric').page, 'cluster-home');
  assert.equal(config.palette.sources.find(item => item.id === 'cmd').search().some(item => item.id === 'cmd-monitoring'), false);
  assert.equal(config.sidebar.sections.find(item => item.id === 'pinned').rows({ settings: {}, dev: true }).some(item => item.id === 'monitoring'), false);
});

test('first_run_has_no_welcome_step_and_no_sign_in_step', () => {
  assert.equal(config.firstRun.steps.find(step => step.kind === 'welcome'), undefined);
  assert.equal(config.firstRun.signIn, undefined);
});

test('native_kubernetes_context_with_aws_infrastructure_keeps_provider_and_uses_aws_icon', () => {
  const cluster = { id: 'native-context', provider: 'kubernetes', infrastructure: { provider: 'aws', account: 'test-account', region: 'test-region' }, state: 'ok' };
  const rows = config.sidebar.sections[0].rows({ settings: { 'wake.clusters.list': [cluster] }, dev: true });
  assert.equal(rows[0].icon, 'brand-aws'); assert.equal(cluster.provider, 'kubernetes'); assert.equal(rows[0].address, 'wake://cluster/native-context');
});


test('tool_open_without_native_descriptor_preserves_personal_tool_identity', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const opened = [], previous = globalThis.kitService;
  const connections = {};
  const api = { openTool: (...args) => opened.push(args), settings: { get: () => connections }, setSetting() {} };
  const action = { arg: { cluster: 'personal', tool: { kind: 'grafana' } } };
  globalThis.kitService = { call: async () => ({ url: 'https://personal.example/dashboards' }) };
  try {
    await config.actions['wake.tool.open'](action, api);
    assert.equal(opened[0][0].id, 'personal-grafana'); assert.equal(opened[0][0].partition, 'personal-grafana');
    assert.equal(opened[0][2].reuseKey, undefined);
    const first = '2026-11-07T12:00:00.000Z';
    const replacement = '2026-11-07T12:05:00.000Z';
    for (const at of [first, first, replacement]) {
      connections['personal-grafana'] = { kind: 'tool', at };
      await config.actions['wake.tool.open'](action, api);
    }
    assert.deepEqual(opened.slice(1).map(call => call[2]), [first, first, replacement].map(reuseKey => ({ reuse: true, reuseKey })));
  } finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; t.mock.timers.reset(); }
});


test('diagnostics_click_uses_stored_open_failure_and_shell_capability_not_renderer_raw', async t => {
  const app = (await import('./app.config.js?diag-click')).default;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previous = globalThis.kitService, owner = Object.freeze({ marker: 'cap-A' }), ticket = Object.freeze({ marker: 'ticket-A' }), begins = [], shown = [];
  globalThis.kitService = { call: async () => ({ state: 'notReady', error: 'native_tool_unreachable' }) };
  const api = { state: { tabs: { active: 'tab-A', tabs: [{ id: 'tab-A', entries: [{ address: 'wake://cluster/diag-context' }], index: 0 }] } }, settings: { get: () => undefined }, setSetting() {}, terminal: { beginOutput: value => { begins.push(value); return value.owner === owner ? ticket : null; }, showOutput: (selected, value) => { shown.push({ selected, value }); return { ok: true, shown: true }; }, closeOutput: () => ({ ok: true }) } };
  const arg = { cluster: 'diag-context', tool: { kind: 'grafana' } };
  try {
    await app.actions['wake.tool.open']({ arg }, api);
    assert.equal(shown.length, 0);
    const result = app.actions['wake.tool.diagnostics']({ sourceTabId: 'tab-A', outputOwner: owner, arg: { ...arg, flowKey: 'diag-context-grafana:open', raw: 'FORGED', outputOwner: 'forged-owner' }, values: { raw: 'FORGED' } }, api);
    assert.equal(result.shown, true); assert.equal(begins.at(-1).owner, owner); assert.equal(begins.at(-1).scope, arg.cluster);
    assert.equal(shown.at(-1).selected, ticket); assert.equal(shown.at(-1).value.rawText, 'native_tool_unreachable');
    assert.equal(shown.at(-1).value.source, 'connection-check'); assert.equal(shown.at(-1).value.truncated, false);
    assert.ok(Number.isSafeInteger(begins.at(-1).attempt)); assert.ok(begins.at(-1).attempt > 0);
  } finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; t.mock.timers.reset(); }
});


let diagnosticCase = 0;
async function diagnosticFixture(t, handler = async () => ({ state: 'notReady', error: 'native_tool_unreachable' })) {
  const app = (await import(`./app.config.js?diagnostic-case-${++diagnosticCase}`)).default;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previous = globalThis.kitService, begins = [], shown = [], closed = [], settings = new Map(), owner = Object.freeze({ tab: 'tab-A' }), otherOwner = Object.freeze({ tab: 'tab-B' });
  const tabs = { active: 'tab-A', tabs: ['tab-A', 'tab-B'].map(id => ({ id, entries: [{ address: 'wake://cluster/diag-context' }], index: 0 })) };
  let latest = null;
  const api = { state: { tabs }, settings: { get: key => settings.get(key), all: () => Object.fromEntries(settings) }, setSetting: (key, value) => settings.set(key, value),
    firstRun: { active: () => false, reveal() {} }, refresh() {}, openTool() {},
    terminal: {
      beginOutput: value => { begins.push(value); if (![owner, otherOwner].includes(value.owner)) return null; latest = Object.freeze({ value }); return latest; },
      showOutput: (ticket, value) => { const visible = ticket === latest && ticket.value.owner.tab === tabs.active; shown.push({ ticket, value, visible }); return { ok: visible, shown: visible, reason: visible ? undefined : 'inactive-or-stale' }; },
      closeOutput: ticket => { closed.push(ticket); if (latest === ticket) latest = null; return { ok: true }; },
    },
  };
  globalThis.kitService = { call: handler };
  const arg = { cluster: 'diag-context', tool: { kind: 'grafana' } }, action = (extra = {}) => ({ sourceTabId: 'tab-A', outputOwner: owner, arg, ...extra });
  return { app, api, arg, action, owner, otherOwner, tabs, begins, shown, closed, settings,
    async flush() { await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(100); await new Promise(resolve => setImmediate(resolve)); },
    async close() { app.actions['wake.flow.cancel']({ arg: { key: 'diag-context-grafana' } }); app.actions['wake.flow.cancel']({ arg: { key: 'diag-context-grafana:open' } }); t.mock.timers.tick(2000); await new Promise(resolve => setImmediate(resolve)); if (previous) globalThis.kitService = previous; else delete globalThis.kitService; t.mock.timers.reset(); },
  };
}

test('API-only tools open a page for the source cluster without a terminal or a network preflight', async t => {
  const h = await diagnosticFixture(t, () => assert.fail('opening the page should not send a request'));
  const opened = [];
  h.api.navigate = (...args) => opened.push(args);
  try {
    for (const kind of ['loki', 'tempo']) {
      await h.app.actions['wake.tool.open'](h.action({ arg: { cluster: h.arg.cluster, tool: { kind } } }), h.api);
    }
    assert.deepEqual(opened, [
      ['wake://cluster/diag-context/api/loki', { newTab: true }],
      ['wake://cluster/diag-context/api/tempo', { newTab: true }],
    ]);
  } finally { await h.close(); }
});

test('diagnostics_saved_restart_snapshot_opens_only_on_explicit_click_and_is_not_a_fresh_api_result', async t => {
  let calls = 0; const h = await diagnosticFixture(t, () => { calls++; assert.fail('saved diagnostic must not execute provider'); });
  try {
    h.settings.set('wake.conn.live', { 'diag-context-grafana:open': { state: 'failed', raw: 'saved-native-failure' } });
    await h.flush(); assert.equal(h.shown.length, 0); assert.equal(h.begins.length, 0);
    const result = h.app.actions['wake.tool.diagnostics'](h.action({ arg: { ...h.arg, flowKey: 'diag-context-grafana:open', raw: 'FORGED' } }), h.api);
    assert.equal(result.shown, true); assert.equal(h.shown[0].value.rawText, 'saved-native-failure');
    assert.equal(h.shown[0].value.sourceLabel, 'Saved connection check');
    assert.notEqual(h.shown[0].value.sourceLabel, 'Connection check');
    assert.equal(calls, 0); assert.equal(h.begins[0].owner, h.owner);
  } finally { await h.close(); }
});

for (const kind of ['wrong-key', 'wrong-context', 'unknown-kind', 'running', 'connected', 'empty', 'forged-owner']) test(`diagnostics_saved_snapshot_rejects_${kind}`, async t => {
  const h = await diagnosticFixture(t);
  try {
    h.settings.set('wake.conn.live', { 'diag-context-grafana:open': { state: kind === 'running' ? 'running' : kind === 'connected' ? 'connected' : 'failed', raw: kind === 'empty' ? '' : 'stored' } });
    const a = h.action({ arg: { ...h.arg, flowKey: kind === 'wrong-key' ? 'other-grafana:open' : 'diag-context-grafana:open', ...(kind === 'unknown-kind' ? { tool: { kind: 'unregistered' } } : {}), raw: 'FORGED', outputOwner: h.owner }, values: { raw: 'FORGED', outputOwner: h.owner } });
    if (kind === 'wrong-context') h.tabs.tabs[0].entries[0].address = 'wake://cluster/other';
    if (kind === 'forged-owner') a.outputOwner = undefined;
    const result = h.app.actions['wake.tool.diagnostics'](a, h.api);
    assert.equal(result.shown, false); assert.equal(h.shown.length, 0);
  } finally { await h.close(); }
});

test('diagnostics_open_failure_auto_shows_once_with_captured_owner_and_does_not_serialize_capabilities', async t => {
  const h = await diagnosticFixture(t);
  try {
    await h.app.actions['wake.tool.open'](h.action(), h.api); await h.flush();
    assert.equal(h.begins.length, 1); assert.equal(h.shown.length, 1); assert.equal(h.shown[0].visible, true);
    assert.equal(h.shown[0].value.rawText, 'native_tool_unreachable'); assert.equal(h.begins[0].owner, h.owner);
    await h.flush(); assert.equal(h.shown.length, 1);
    assert.doesNotMatch(JSON.stringify([...h.settings]), /outputOwner|sourceTabId|ticket/);
  } finally { await h.close(); }
});

test('diagnostics_old_open_response_after_cancel_and_new_attempt_cannot_replace_or_show', async t => {
  let release, calls = 0; const old = new Promise(resolve => { release = resolve; });
  const h = await diagnosticFixture(t, () => ++calls === 1 ? old : { error: 'new-attempt' });
  try {
    const first = h.app.actions['wake.tool.open'](h.action(), h.api);
    h.app.actions['wake.flow.cancel']({ arg: { key: 'diag-context-grafana:open' } });
    await h.app.actions['wake.tool.open'](h.action(), h.api); await h.flush();
    release({ error: 'old-attempt' }); await first; await h.flush();
    assert.equal(h.shown.length, 1); assert.equal(h.shown[0].value.rawText, 'new-attempt');
    assert.ok(h.begins[1].attempt > h.begins[0].attempt); assert.ok(h.closed.length >= 1);
  } finally { await h.close(); }
});

for (const move of ['other-tab', 'other-address', 'closed-tab']) test(`diagnostics_deferred_failure_cannot_show_after_${move}`, async t => {
  let release; const pending = new Promise(resolve => { release = resolve; }); const h = await diagnosticFixture(t, () => pending);
  try {
    const request = h.app.actions['wake.tool.open'](h.action(), h.api);
    if (move === 'other-tab') h.tabs.active = 'tab-B';
    if (move === 'other-address') h.tabs.tabs[0].entries[0].address = 'wake://cluster/other';
    if (move === 'closed-tab') h.tabs.tabs.shift();
    release({ error: 'late-failure' }); await request; await h.flush();
    assert.equal(h.shown.filter(item => item.visible).length, 0);
    h.tabs.active = 'tab-A'; if (move === 'closed-tab') h.tabs.tabs.unshift({ id: 'tab-A', entries: [{ address: 'wake://cluster/diag-context' }], index: 0 }); else h.tabs.tabs[0].entries[0].address = 'wake://cluster/diag-context';
    h.app.actions['wake.flow.cancel']({ arg: { key: 'unrelated:open' } }); await h.flush();
    assert.equal(h.shown.filter(item => item.visible).length, 0);
  } finally { await h.close(); }
});

test('diagnostics_success_does_not_open_output_or_replay_saved_failure', async t => {
  const h = await diagnosticFixture(t, () => ({ url: 'http://127.0.0.1:41234/' }));
  try {
    h.settings.set('wake.conn.live', { 'diag-context-grafana:open': { state: 'failed', raw: 'old-saved-error' } });
    await h.app.actions['wake.tool.open'](h.action(), h.api); await h.flush();
    assert.equal(h.shown.length, 0); assert.ok(h.closed.length >= 1);
  } finally { await h.close(); }
});

test('diagnostics_actual_local_truncation_preserves_connection_error_and_control_characters', async t => {
  const full = 'x'.repeat(4001) + 'connection-check failed\u001b[31m'; const h = await diagnosticFixture(t, () => ({ error: full }));
  try {
    await h.app.actions['wake.tool.open'](h.action(), h.api); await h.flush();
    assert.equal(h.shown[0].value.rawText, full.slice(-4000)); assert.equal(h.shown[0].value.truncated, true); assert.ok(h.shown[0].value.limitLabel);
  } finally { await h.close(); }
});


test('diagnostics_connect_and_retry_capture_actual_flow_generations_and_only_show_their_failure', async t => {
  let message = 'first-check'; const h = await diagnosticFixture(t, async (_name, args) => { assert.equal(args.op, 'reach'); return { state: 'notReady', error: message }; });
  try {
    await h.app.actions['wake.tool.connect'](h.action(), h.api); await h.flush();
    assert.equal(h.shown.length, 1); assert.equal(h.shown[0].value.rawText, 'first-check');
    message = 'retry-check'; await h.app.actions['wake.flow.retry'](h.action({ arg: { key: 'diag-context-grafana' } }), h.api); await h.flush();
    assert.equal(h.shown.length, 2); assert.equal(h.shown[1].value.rawText, 'retry-check'); assert.ok(h.begins[1].attempt > h.begins[0].attempt);
    assert.equal(h.begins[1].flow, 'diag-context-grafana');
  } finally { await h.close(); }
});

test('diagnostics_cancelled_connect_and_late_old_flow_cannot_replace_retry_or_capture_duplicate_running_attempt', async t => {
  let release, calls = 0; const pending = new Promise(resolve => { release = resolve; });
  const h = await diagnosticFixture(t, () => ++calls === 1 ? pending : { state: 'notReady', error: 'new-flow' });
  try {
    const old = h.app.actions['wake.tool.connect'](h.action(), h.api);
    await h.app.actions['wake.tool.connect'](h.action({ sourceTabId: 'tab-B', outputOwner: h.otherOwner }), h.api);
    assert.equal(h.begins.length, 1); assert.equal(calls, 1);
    h.app.actions['wake.flow.cancel']({ arg: { key: 'diag-context-grafana' } }); await h.flush(); assert.equal(h.shown.length, 0);
    await h.app.actions['wake.flow.retry'](h.action({ arg: { key: 'diag-context-grafana' } }), h.api); await h.flush();
    release({ state: 'notReady', error: 'old-flow' }); await old; await h.flush();
    assert.equal(h.shown.length, 1); assert.equal(h.shown[0].value.rawText, 'new-flow'); assert.ok(h.closed.length > 0);
  } finally { await h.close(); }
});

test('diagnostics_does_not_use_saved_raw_while_a_current_live_check_is_running', async t => {
  let release; const pending = new Promise(resolve => { release = resolve; }); const h = await diagnosticFixture(t, () => pending);
  try {
    h.settings.set('wake.conn.live', { 'diag-context-grafana': { state: 'failed', method: 'tool-login', raw: 'saved-old' } });
    const run = h.app.actions['wake.tool.connect'](h.action(), h.api);
    const result = h.app.actions['wake.tool.diagnostics'](h.action({ arg: { ...h.arg, flowKey: 'diag-context-grafana' } }), h.api);
    assert.equal(result.shown, false); assert.equal(h.shown.length, 0);
    h.app.actions['wake.flow.cancel']({ arg: { key: 'diag-context-grafana' } }); release({ error: 'late-old' }); await run; await h.flush();
    assert.equal(h.shown.length, 0);
  } finally { await h.close(); }
});

test('diagnostics_persisted_tool_flow_uses_known_clipping_metadata_and_rejects_non_tool_method', async t => {
  const h = await diagnosticFixture(t);
  try {
    h.settings.set('wake.conn.live', { 'diag-context-grafana': { state: 'failed', method: 'tool-login', raw: 'retained-tail', rawTruncated: true } });
    const a = h.action({ arg: { ...h.arg, flowKey: 'diag-context-grafana' } });
    assert.equal(h.app.actions['wake.tool.diagnostics'](a, h.api).shown, true); assert.equal(h.shown[0].value.truncated, true); assert.ok(h.shown[0].value.limitLabel);
    h.settings.set('wake.conn.live', { 'diag-context-grafana': { state: 'failed', method: 'aws', raw: 'not-a-tool' } });
    assert.equal(h.app.actions['wake.tool.diagnostics'](a, h.api).shown, false); assert.equal(h.shown.length, 1);
  } finally { await h.close(); }
});


test('diagnostics_successful_connect_closes_pending_ticket_without_opening_output', async t => {
  const operations = [];
  const h = await diagnosticFixture(t, async (_name, args) => {
    operations.push(args.op);
    return { ok: true, url: 'http://127.0.0.1:41235/' };
  });
  try {
    const run = h.app.actions['wake.tool.connect'](h.action({ arg: { cluster: 'diag-context', tool: { kind: 'prometheus' } } }), h.api);
    for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(500); }
    await run; await h.flush();
    assert.deepEqual(operations, ['reach', 'verify']);
    assert.equal(h.begins.length, 1); assert.equal(h.shown.length, 0); assert.ok(h.closed.length >= 1);
  } finally { h.app.actions['wake.flow.cancel']({ arg: { key: 'diag-context-prometheus' } }); await h.close(); }
});


for (const outcome of ['cancel', 'success']) test(`diagnostics_${outcome}_does_not_revive_old_saved_open_error_before_publish`, async t => {
  let release; const pending = new Promise(resolve => { release = resolve; }); const h = await diagnosticFixture(t, () => pending);
  try {
    h.settings.set('wake.conn.live', { 'diag-context-grafana:open': { state: 'failed', raw: 'old-saved-error' } });
    const request = h.app.actions['wake.tool.open'](h.action(), h.api);
    if (outcome === 'cancel') h.app.actions['wake.flow.cancel']({ arg: { key: 'diag-context-grafana:open' } });
    release({ url: 'http://127.0.0.1:41234/' }); await request;
    const result = h.app.actions['wake.tool.diagnostics'](h.action({ arg: { ...h.arg, flowKey: 'diag-context-grafana:open' } }), h.api);
    assert.equal(result.shown, false); assert.equal(h.shown.length, 0);
  } finally { await h.close(); }
});


const remoteDescriptor = () => ({ mode: 'remote', contextId: 'fixture-a', transport: 'aws-ssm', accountId: '123456789012', region: 'ap-southeast-2', instanceId: 'i-0123456789abcdef0', profile: 'fixture-profile', session: { kind: 'default-shell' }, scope: 'payments', remoteContext: 'fixture-remote', remoteKubeconfigPath: '/etc/fixture/config', remoteUser: 'fixture-user', expiresAt: '2099-01-01T00:00:00Z', maxDurationMs: 60000, idleTimeoutMs: 30000 });
const terminalApi = () => ({ settings: { get: () => ['fixture-a'] } });

test('remote_terminal_open_uses_flat_native_target_without_local_environment_or_renderer_arguments', async () => {
  const previous = globalThis.kitService, calls = [];
  globalThis.kitService = { call: async (name, args) => { calls.push({ name, args }); return remoteDescriptor(); } };
  try {
    const result = await config.terminal.open(JSON.stringify({ mode: 'remote', cluster: 'fixture-a', namespace: 'renderer-ns', host: 'renderer.invalid', env: { TOKEN: 'ignored' } }), terminalApi());
    assert.deepEqual(calls, [{ name: 'term.target', args: { contextId: 'fixture-a' } }]);
    assert.deepEqual(Object.keys(result).sort(), ['contextId', 'mode', 'notice']);
    assert.equal(result.mode, 'remote'); assert.equal(result.contextId, 'fixture-a');
    assert.equal(result.notice.vars.namespace, 'payments');
    assert.equal(result.notice.vars.remoteUser, 'fixture-user');
  } finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; }
});

test('remote_terminal_native_rejection_or_malformed_target_never_falls_back_to_local', async () => {
  const previous = globalThis.kitService;
  try {
    for (const response of [{ error: 'refused', code: 'REMOTE_SENDER_REJECTED' }, { ...remoteDescriptor(), contextId: 'other' }, { ...remoteDescriptor(), mode: 'local' }, { target: remoteDescriptor() }, null]) {
      const calls = [];
      globalThis.kitService = { call: async name => { calls.push(name); return response; } };
      const result = await config.terminal.open(JSON.stringify({ mode: 'remote', cluster: 'fixture-a' }), terminalApi());
      assert.ok(result.error); assert.equal(result.mode, undefined); assert.equal(result.env, undefined);
      assert.deepEqual(calls, ['term.target']);
    }
    globalThis.kitService = { call: async () => { throw new Error('native transport unavailable'); } };
    await assert.rejects(config.terminal.open(JSON.stringify({ mode: 'remote', cluster: 'fixture-a' }), terminalApi()), /unavailable/);
  } finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; }
});

/* B2-02: a cluster with no remote shell (most) opened the Kubernetes API stand-in through a ticket the section pages (…/incidents) never got, so the panel
   said TERMINAL_UNAVAILABLE. Without a remote target the person's own shell opens with a kubeconfig pinned to that page's context and namespace,
   titled as the local shell (never as the remote one) */
test('cluster_terminal_without_a_remote_target_opens_the_local_shell_pinned_to_that_context', async () => {
  const previous = globalThis.kitService, calls = [];
  const environment = { env: { KUBECONFIG: '/fixture/pinned' }, cwd: '/fixture/home', target: { context: 'fixture-a', namespace: 'payments' } };
  globalThis.kitService = { call: async (name, args) => { calls.push({ name, args }); return name === 'term.target' ? { error: 'remote terminal context unavailable', code: 'REMOTE_UNCONFIGURED' } : environment; } };
  try {
    const key = config.terminal.session({ route: { id: 'incidents' }, params: { cluster: 'fixture-a' } }, { settings: { 'wake.clusters.connected': ['fixture-a'] } });
    const result = await config.terminal.open(key, terminalApi());
    assert.deepEqual(calls.map(c => c.name), ['term.target', 'term.env'], 'the local shell, not a stand-in program');
    assert.equal(calls[1].args.id, 'fixture-a');
    assert.equal(result.mode, 'local'); assert.deepEqual(result.env, environment.env);
    assert.equal(config.terminal.describe({ key, mode: 'local', state: 'open' }, {}).title.key, 'wake.term.localTitle');
    assert.equal(config.terminal.describe({ key, mode: undefined, state: 'failed', code: 'TERMINAL_UNAVAILABLE' }, {}).notice, undefined, 'a failed local open is not described as a remote shell');
  } finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; }
});

/* B3-07: the title read "wake-lab · _all · events · 로컬 셸" (route words) while the shell sat in the context's namespace (payments).
   The title names the scope and the section in words, and the namespace it names is the one the shell is pinned to */
test('terminal_title_names_the_scope_and_section_in_words_and_the_namespace_the_shell_is_pinned_to', async () => {
  const previous = globalThis.kitService, calls = [];
  globalThis.kitService = { call: async (name, args) => { calls.push({ name, args }); return name === 'term.target' ? { code: 'REMOTE_UNCONFIGURED' } : { env: { KUBECONFIG: '/fixture/pinned' }, cwd: '/fixture/home', target: { context: 'fixture-a', namespace: args.namespace } }; } };
  try {
    const st = { settings: { 'wake.clusters.connected': ['fixture-a'], 'wake.ns.default.fixture-a': 'payments' } };
    const key = config.terminal.session({ route: { id: 'list' }, params: { cluster: 'fixture-a', ns: '_all', kind: 'events' } }, st);
    const title = config.terminal.describe({ key, mode: 'local', state: 'open' }, {}).title, scope = title.vars.scope;
    assert.doesNotMatch(scope, /_all|^events| events/, `route words in the title: ${scope}`);
    assert.match(scope, /wake\.term\.allNs · Events/, 'all namespaces in words, then the section name');
    assert.match(koLocale['wake.term.allNs'], /\{namespace\}/, 'the all-namespaces words name the namespace the shell is in');
    await config.terminal.open(key, terminalApi());
    const pinned = calls.find(c => c.name === 'term.env').args.namespace;
    assert.equal(pinned, 'payments', 'the shell is pinned to a namespace the title can name');
    assert.equal(JSON.parse(key).namespace, pinned, 'the title is built from the namespace the shell is pinned to');
    const one = config.terminal.session({ route: { id: 'list' }, params: { cluster: 'fixture-a', ns: 'checkout', kind: 'pods' } }, st);
    assert.equal(config.terminal.title(one).vars.scope, 'checkout · Pods');
  } finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; }
});

test('terminal_requires_explicit_mode_and_only_explicit_local_uses_existing_env_cwd', async () => {
  const previous = globalThis.kitService, calls = [];
  const environment = { env: { KUBECONFIG: '/fixture/context' }, cwd: '/fixture/home', target: { context: 'fixture-a', namespace: 'payments' } };
  globalThis.kitService = { call: async (name, args) => { calls.push({ name, args }); return environment; } };
  try {
    await assert.rejects(config.terminal.open(JSON.stringify({ cluster: 'fixture-a' }), terminalApi()), /mode/);
    assert.deepEqual(calls, []);
    const result = await config.terminal.open(JSON.stringify({ mode: 'local', cluster: 'fixture-a', namespace: 'payments', scope: 'payments', kind: 'pods', name: 'fixture-pod' }), terminalApi());
    assert.equal(result.mode, 'local'); assert.deepEqual(result.env, environment.env); assert.equal(result.cwd, environment.cwd);
    assert.equal(calls[0].name, 'term.env');
  } finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; }
});

test('remote_terminal_describe_keeps_connecting_mapping_and_failure_distinct_from_verified_success', () => {
  const key = JSON.stringify({ mode: 'remote', cluster: 'fixture-a' });
  for (const state of ['opening', 'connecting', 'failed', 'cancelled', 'expired', 'disconnected', 'cleanup_failed', 'cleanup_unconfirmed']) {
    const status = { key, mode: 'remote', state, code: state === 'connecting' ? 'REMOTE_CONNECTING' : 'REMOTE_START_FAILED', target: state === 'opening' ? null : remoteDescriptor(), user: 'local-user' };
    const original = structuredClone(status);
    const result = config.terminal.describe(status, {});
    assert.equal(result.title.key, 'wake.term.remoteTitle');
    assert.equal(result.notice.key, status.target ? 'wake.term.remoteMapping' : 'wake.term.remoteState');
    assert.deepEqual(status, original);
    if (status.target) {
      assert.equal(result.notice.vars.remoteUser, 'fixture-user');
      assert.equal(result.notice.vars.state.vars.code, status.code);
      assert.equal(result.notice.vars.limits.vars.expiresAt, status.target.expiresAt);
    }
    assert.doesNotMatch(JSON.stringify(result), /connected|verified|local-user/);
  }
});


function appearanceFixture(handler = {}) {
  const ghostty = 'com.mitchellh.ghostty', terminal = 'com.apple.Terminal';
  const calls = [], toasts = [], writes = [], values = {};
  const tab = { id: 'appearance-owner', entries: [{ address: 'wake://settings/appearance' }], index: 0 };
  let active = tab;
  const api = { activeTab: () => active, settings: { all: () => values, get: key => values[key] },
    setSetting: (key, value) => { values[key] = value; },
    setSettings: patch => { writes.push(patch); Object.assign(values, patch); },
    toast: value => toasts.push(value), terminal: { appearance: {} } };
  const snapshot = { id: ghostty, source: { appId: ghostty }, colors: {}, font: { family: 'Fixture Mono' } };
  const listed = { status: 'listed', applications: [{ appId: ghostty, installed: true }, { appId: terminal, installed: true },
    { appId: 'com.googlecode.iterm2', installed: false }],
    sources: [{ id: 'source-capability', appId: ghostty }, { id: 'terminal-capability', appId: terminal }] };
  const imported = { status: 'partial', snapshot, ticketId: 'shell-ticket' };
  for (const [method, result] of Object.entries({ list: listed, import: imported, apply: { status: 'applied', applied: true }, cancel: { status: 'cancelled' } })) {
    api.terminal.appearance[method] = async (...args) => {
      calls.push({ method, args });
      return handler[method] ? handler[method](...args) : result;
    };
  }
  const act = (name, value, sourceTabId = tab.id) => config.actions['wake.appearance.' + name]({ arg: { value }, sourceTabId }, api);
  return { values, calls, toasts, writes, imported, ghostty, terminal, act, leave: () => { active = { ...tab }; } };
}

test('terminal settings list only detected apps and selection directly applies a verified source', async () => {
  const f = appearanceFixture(); await f.act('discover');
  const page = config.settings.groups.flatMap(group => group.pages).find(page => page.id === 'appearance');
  const rows = page.sections.flatMap(section => section.groups.flat());
  const row = rows.find(row => row.id === 'terminal');
  assert.equal(page.initAction, 'wake.appearance.discover');
  assert.equal(row.stack, undefined);
  assert.deepEqual(row.control.options({ settings: () => f.values }).map(option => option.id),
    ['app', f.ghostty, f.terminal, 'midnight', 'paper', 'solarized']);
  await f.act('select', f.ghostty);
  assert.deepEqual(f.calls.slice(-2), [
    { method: 'import', args: [{ sourceId: 'source-capability' }] },
    { method: 'apply', args: ['shell-ticket', { acceptPartial: true, colors: false, font: true, resetMissing: true }] },
  ]);
  await f.act('select', 'app');
  assert.deepEqual(f.writes, [{ 'kit.terminal.theme': 'app', 'kit.terminal.font': 'app' }]);
});

test('terminal settings preserve a saved font-only profile and project a detected profile as its app', () => {
  const f = appearanceFixture();
  const page = config.settings.groups.flatMap(group => group.pages).find(page => page.id === 'appearance');
  const control = page.sections.flatMap(section => section.groups.flat()).find(row => row.id === 'terminal').control;
  const profile = { id: f.terminal, label: f.terminal, source: { appId: f.terminal }, colors: {}, font: { family: 'Fixture Mono' } };
  const values = { 'kit.terminal.font': 'imported:' + f.terminal, 'kit.terminal.appearances': [profile] };
  const ctx = { settings: () => values };
  assert.equal(control.selected(ctx), 'imported:' + f.terminal);
  assert.equal(control.options(ctx).at(-1).id, 'imported:' + f.terminal);
  values['wake.terminal.apps'] = [f.terminal];
  assert.equal(control.selected(ctx), f.terminal);
  assert.equal(control.options(ctx).some(option => option.id === 'imported:' + f.terminal), false);
});

test('terminal settings reject absent apps and stale imports while retaining the latest selection', async () => {
  let finish;
  const f = appearanceFixture({ import: () => new Promise(resolve => { finish = resolve; }) });
  await f.act('select', 'com.googlecode.iterm2');
  assert.equal(f.toasts.at(-1).title, 'wake.appearance.noData');
  await f.act('select', f.ghostty, 'different-tab');
  assert.equal(f.calls.some(call => call.method === 'import'), false);
  const pending = f.act('select', f.ghostty);
  await new Promise(resolve => setImmediate(resolve));
  await f.act('select', 'paper');
  finish(f.imported); await pending;
  assert.equal(f.calls.some(call => call.method === 'apply'), false);
  assert.deepEqual(f.calls.at(-1), { method: 'cancel', args: ['shell-ticket'] });
  assert.equal(f.values['kit.terminal.theme'], 'paper');
});

const defaultShellDescriptor = () => { const result = remoteDescriptor(); delete result.document; return { ...result, session: { kind: 'default-shell' } }; };

test('remote_default_shell_v13_preserves_native_mapping_without_inventing_a_document', async () => {
  const previous = globalThis.kitService, calls = [];
  globalThis.kitService = { call: async (name, args) => { calls.push({ name, args }); return defaultShellDescriptor(); } };
  try {
    const key = JSON.stringify({ mode: 'remote', cluster: 'fixture-a', session: { kind: 'forged' }, document: 'renderer-document', parameters: { command: 'ignored' }, remoteContextVerified: true });
    const result = await config.terminal.open(key, terminalApi());
    assert.equal(result.mode, 'remote'); assert.deepEqual(Object.keys(result).sort(), ['contextId', 'mode', 'notice']);
    assert.deepEqual(calls, [{ name: 'term.target', args: { contextId: 'fixture-a' } }]);
    const description = config.terminal.describe({ key, mode: 'remote', state: 'connecting', code: 'REMOTE_CONNECTING', target: defaultShellDescriptor() }, {});
    assert.equal(description.notice.key, 'wake.term.remoteMapping'); assert.equal(description.notice.vars.instanceId, defaultShellDescriptor().instanceId);
    assert.equal(Object.hasOwn(description.notice.vars, 'document'), false);
    assert.doesNotMatch(JSON.stringify(description), /SSM-SessionManagerRunShell|renderer-document|verified/);
  } finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; }
});

test('remote_default_shell_rejects_mixed_document_parameters_and_unknown_or_missing_session', async () => {
  const previous = globalThis.kitService;
  try {
    for (const change of [{ session: null }, { session: {} }, { session: { kind: 'named' } }, { session: { kind: 'default-shell', command: 'forged' } }, { session: [] }, { session: 'default-shell' }, { document: undefined }, { document: 'SSM-SessionManagerRunShell' }, { parameters: {} }, { params: {} }]) {
      const target = { ...defaultShellDescriptor(), ...change }, calls = [];
      globalThis.kitService = { call: async name => { calls.push(name); return target; } };
      const key = JSON.stringify({ mode: 'remote', cluster: 'fixture-a' });
      const result = await config.terminal.open(key, terminalApi());
      assert.equal(result.code, 'REMOTE_RESPONSE_REJECTED'); assert.ok(result.error);
      assert.deepEqual(calls, ['term.target']);
      assert.equal(config.terminal.describe({ key, mode: 'remote', state: 'connecting', code: 'REMOTE_CONNECTING', target }, {}).notice.key, 'wake.term.remoteState');
    }
    const missing = defaultShellDescriptor(); delete missing.session;
    globalThis.kitService = { call: async () => missing };
    assert.equal((await config.terminal.open(JSON.stringify({ mode: 'remote', cluster: 'fixture-a' }), terminalApi())).code, 'REMOTE_RESPONSE_REJECTED');
  } finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; }
});


const genericScopeDescriptor = scope => { const target = remoteDescriptor(); delete target.namespace; return { ...target, scope }; };

test('remote_generic_scope_maps_to_app_namespace_without_changing_logical_kubernetes_namespace', async () => {
  const previous = globalThis.kitService, calls = [];
  globalThis.kitService = { call: async (name, args) => { calls.push({ name, args }); return genericScopeDescriptor('payments'); } };
  try {
    const match = { params: { cluster: 'fixture-a', ns: 'renderer-namespace', kind: 'pods', name: 'fixture-pod' } };
    const logical = config.terminal.session(match, { settings: { 'wake.clusters.connected': ['fixture-a'] } });
    assert.equal(JSON.parse(logical).namespace, 'renderer-namespace');
    assert.equal(JSON.parse(logical).scope, 'renderer-namespace');
    const result = await config.terminal.open(logical, terminalApi());
    assert.equal(result.mode, 'remote'); assert.equal(result.notice.vars.namespace, 'payments');
    assert.deepEqual(calls, [{ name: 'term.target', args: { contextId: 'fixture-a' } }]);
    const description = config.terminal.describe({ key: logical, mode: 'remote', state: 'connecting', code: 'REMOTE_CONNECTING', target: genericScopeDescriptor('payments') }, {});
    assert.equal(description.notice.key, 'wake.term.remoteMapping'); assert.equal(description.notice.vars.namespace, 'payments');
  } finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; }
});

test('remote_generic_scope_requires_native_dns_label_and_never_falls_back_to_legacy_namespace', async () => {
  const previous = globalThis.kitService, key = JSON.stringify({ mode: 'remote', cluster: 'fixture-a', namespace: 'renderer-fallback' });
  try {
    for (const scope of [undefined, null, '', 'a'.repeat(64), 'Uppercase', 'has_under', 'with/slash', 'white space']) {
      const target = { ...genericScopeDescriptor(scope), namespace: 'legacy-fallback' };
      globalThis.kitService = { call: async () => target };
      const result = await config.terminal.open(key, terminalApi());
      assert.equal(result.code, 'REMOTE_RESPONSE_REJECTED');
      assert.equal(config.terminal.describe({ key, mode: 'remote', state: 'connecting', code: 'REMOTE_CONNECTING', target }, {}).notice.key, 'wake.term.remoteState');
    }
    for (const scope of ['a', 'a'.repeat(63)]) {
      globalThis.kitService = { call: async () => genericScopeDescriptor(scope) };
      assert.equal((await config.terminal.open(key, terminalApi())).notice.vars.namespace, scope);
    }
  } finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; }
});


test('cluster name and endpoint project consistently without changing context navigation or duplicate targets', () => {
  const server = 'https://gke-real.example.goog';
  const make = (id, projectId) => ({ id, ctx: id, server, provider: 'gke', state: 'forbidden', presentation: { contextId: id, server, clusterName: 'wake-credit-check', projectId, location: 'region-a', source: 'observability-connections.v1' } });
  const clusters = [make('long-context-a', 'project-a'), make('long-context-b', 'project-b')];
  const settings = { 'wake.clusters.list': clusters };
  const before = structuredClone(settings);
  const rows = config.sidebar.sections[0].rows({ settings });
  const items = config.menus['wake.switch.cluster']({ cluster: clusters[1].id }, { settings }).items;
  assert.deepEqual(rows.map(row => row.label.raw), ['wake-credit-check', 'wake-credit-check']);
  assert.deepEqual(rows.map(row => row.ctx), [new URL(server).host, new URL(server).host]);
  assert.deepEqual(items.map(row => row.arg.address), clusters.map(c => 'wake://cluster/' + c.id));
  assert.deepEqual(items.filter(row => row.checked).map(row => row.id), ['cl-long-context-b']);
  assert.notEqual(items[0].end, items[1].end);
  const sameProject = { ...settings, 'wake.clusters.list': [make('context-a', 'same-project'), make('context-b', 'same-project')] };
  const sameMenu = config.menus['wake.switch.cluster']({ cluster: 'context-a' }, { settings: sameProject }).items;
  assert.notEqual(sameMenu[0].end, sameMenu[1].end);
  assert.match(sameMenu[0].end, /context-a/); assert.match(sameMenu[1].end, /context-b/);
  assert.deepEqual(settings, before);
});


test('cluster info and copy retain full registered context without synchronous resource lookup or sample fallback', async t => {
  const id = 'full-gke-context-name', original = id + '-unchanged';
  const settings = { 'wake.clusters.list': [{ id, ctx: original, provider: 'gke', server: 'https://actual-dns.example', state: 'forbidden', version: 'v1.36.4' }] };
  const menu = config.menus['wake.cluster.info'](id, { settings });
  assert.equal(menu.items[0].label.raw, original);
  assert.equal(menu.items.find(item => item.id === 'ci-copy').arg, id);
  assert.equal(menu.items.find(item => item.id === 'ci-settings').arg.address, 'wake://settings/clusters?cluster=' + id);
  let copied;
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async value => { copied = value; } } } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'navigator', previous); else delete globalThis.navigator; });
  const api = { settings: { all: () => settings }, toast() {} };
  await config.actions['wake.cluster.copyContext']({ arg: id }, api);
  assert.equal(copied, original);
  copied = undefined;
  await config.actions['wake.cluster.copyContext']({ arg: 'missing-context' }, api);
  assert.equal(copied, undefined);
  assert.equal(config.menus['wake.cluster.info']('missing-context', { settings }), null);
});

async function gcpConsoleFixture(t, options = {}) {
  const previous = globalThis.kitService, calls = [], toasts = [];
  const records = [
    { id:'gcp-context', provider:'gke', server:'https://gke.invalid', presentation:{contextId:'gcp-context',server:'https://gke.invalid',clusterName:'fixture-cluster',projectId:'fixture-project',location:'fixture-region',source:'observability-connections.v1'} },
    { id:'gcp-other', provider:'gke', server:'https://other.invalid', presentation:{contextId:'gcp-other',server:'https://other.invalid',clusterName:'other-cluster',projectId:'another-project',location:'other-region',source:'observability-connections.v1'} },
    { id:'aws-context', provider:'kubernetes', infrastructure:{provider:'aws'}, server:'https://aws.invalid' },
  ];
  const settings = {'wake.clusters.list':records,'wake.clusters.connected':records.map(c=>c.id)};
  const tabs = records.map((c,i)=>({id:'console-tab-'+i,index:0,entries:[{address:'wake://cluster/'+c.id}]}));
  const state={settings,tabs:{active:tabs[0].id,tabs},dev:false};
  const api={state,activeTab:()=>state.tabs.tabs.find(tab=>tab.id===state.tabs.active&&!tab.unloaded)||null,settings:{get:key=>settings[key],all:()=>settings},toast:message=>toasts.push(message)};
  const nativeReply = input => { const projectId=input.contextId==='gcp-other'?'another-project':'fixture-project';return {status:'requested',requested:true,provider:'gcp-monitoring',connectionId:'native-'+input.contextId,contextId:input.contextId,projectId,url:'https://console.cloud.google.com/monitoring?project='+projectId}; };
  /* the tools menu also reads the cluster's tools; only the console request is under test */
  globalThis.kitService={on:()=>{},call:async(name,input)=>{if(name!=='gcp.console.open')return{};calls.push({name,input});return options.call?options.call(name,input,nativeReply):nativeReply(input);}};
  const app=(await import('./app.config.js?gcp-console-fixture='+crypto.randomUUID())).default;
  t.after(()=>{if(previous===undefined)delete globalThis.kitService;else globalThis.kitService=previous;});
  const contextId=()=>decodeURIComponent(api.activeTab().entries[api.activeTab().index].address.split('/')[3]);
  const menu=()=>app.menus['wake.tools']({cluster:contextId(),route:'cluster'},state,api);
  const entry=()=>menu().items.find(item=>item.action==='wake.gcp.console');
  const act=item=>app.actions['wake.gcp.console']({sourceTabId:api.activeTab()?.id,arg:item?.arg},api);
  return{app,api,state,settings,records,tabs,calls,toasts,nativeReply,entry,act,select:index=>{state.tabs.active=tabs[index].id;}};
}
test('gcp_console_shell_menu_uses_existing_brand_provider_visibility_without_service_or_metadata_dependency',async t=>{
  const f=await gcpConsoleFixture(t);const item=f.entry();assert.ok(item);assert.deepEqual(item.label,{raw:'Google Cloud'});assert.equal(item.icon,'brand-googlecloud');assert.equal(item.dot,undefined);assert.equal(f.calls.length,0);
  f.records[0].presentation=null;assert.ok(f.entry(),'provider alone exposes the action while catalog metadata is missing');
  f.select(2);assert.equal(f.entry(),undefined);assert.equal(f.calls.length,0);
  assert.equal(f.app.locales.ko['wake.cloud.console.requested'],koLocale['wake.cloud.console.requested']);assert.equal(f.app.locales.en['wake.cloud.console.requested'],'Browser open requested');
});
test('gcp_console_explicit_shell_click_calls_context_only_and_consumes_intent_without_authentication_claim',async t=>{
  const f=await gcpConsoleFixture(t),item=f.entry();const result=await f.act(item);
  assert.deepEqual(f.calls,[{name:'gcp.console.open',input:{contextId:'gcp-context'}}]);assert.equal(result.status,'requested');assert.equal(result.requested,true);
  assert.equal(f.toasts.length,1);assert.equal(f.toasts[0].body,'wake.cloud.console.requested');assert.equal(Object.hasOwn(result,'connected'),false);assert.equal(Object.hasOwn(result,'signedIn'),false);
  await f.act(item);assert.equal(f.calls.length,1,'replay makes no second native request');assert.equal(JSON.stringify(f.settings).includes(item.arg.intent),false);assert.equal(JSON.stringify(f.toasts).includes(item.arg.intent),false);
});
test('gcp_console_replaces_menu_intents_and_rejects_page_action_forgery_other_realm_and_getter_payloads',async t=>{
  const f=await gcpConsoleFixture(t),old=f.entry(),latest=f.entry();assert.notEqual(old.arg.intent,latest.arg.intent);assert.match(latest.arg.intent,/^[0-9a-f-]{36}$/);
  await f.act(old);assert.equal(f.calls.length,0);
  const foreign=(await import('./app.config.js?gcp-console-foreign='+crypto.randomUUID())).default;
  const foreignItem=foreign.menus['wake.tools']({cluster:'gcp-context',route:'cluster'},f.state,f.api).items.find(item=>item.action==='wake.gcp.console');
  await f.act(foreignItem);assert.equal(f.calls.length,0);
  let getters=0;const arg={};Object.defineProperty(arg,'intent',{enumerable:true,get(){getters++;return latest.arg.intent;}});
  for(const payload of [{}, {intent:'forged'}, {...latest.arg,url:'https://untrusted.invalid'}, {...latest.arg,projectId:'other-project'},arg])await f.app.actions['wake.gcp.console']({sourceTabId:f.tabs[0].id,arg:payload,outputOwner:'forged'},f.api);
  assert.equal(getters,0);assert.equal(f.calls.length,0);await f.act(latest);assert.equal(f.calls.length,1);
});
test('gcp_console_intent_has_finite_lifetime_and_old_mints_never_accumulate_replay_authority',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.now()});const f=await gcpConsoleFixture(t),expired=f.entry();t.mock.timers.tick(30001);await f.act(expired);assert.equal(f.calls.length,0);
  const first=f.entry();let last;for(let i=0;i<100;i++)last=f.entry();await f.act(first);assert.equal(f.calls.length,0);await f.act(last);assert.equal(f.calls.length,1);
});
test('gcp_console_checks_source_active_tab_exact_address_provider_and_metadata_before_dispatch',async t=>{
  const f=await gcpConsoleFixture(t);
  for(const change of ['source','tab','address','provider','metadata']){
    const item=f.entry(),original=f.tabs[0].entries[0].address,project=f.records[0].presentation.projectId;
    let action={sourceTabId:f.tabs[0].id,arg:item.arg};
    if(change==='source')action.sourceTabId=f.tabs[1].id;
    if(change==='tab')f.select(1);
    if(change==='address')f.tabs[0].entries[0].address='wake://cluster/gcp-context?changed=1';
    if(change==='provider')f.records[0].provider='eks';
    if(change==='metadata')f.records[0].presentation.projectId='changed-project';
    await f.app.actions['wake.gcp.console'](action,f.api);assert.equal(f.calls.length,0,change);
    f.select(0);f.tabs[0].entries[0].address=original;f.records[0].provider='gke';f.records[0].presentation.projectId=project;
    await f.act(item);assert.equal(f.calls.length,0,'observed invalid intent stays discarded');
  }
});
test('gcp_console_inflight_and_own_finally_preserve_other_context_request_and_drop_late_ui',async t=>{
  const pending=[];const f=await gcpConsoleFixture(t,{call:(name,input,reply)=>new Promise(resolve=>pending.push(()=>resolve(reply(input))))});
  const a=f.entry(),first=f.act(a);assert.equal(f.calls.length,1);await f.act(f.entry());assert.equal(f.calls.length,1);
  f.select(1);const second=f.act(f.entry());assert.equal(f.calls.length,2);pending[0]();await first;assert.equal(f.toasts.length,0);
  await f.act(f.entry());assert.equal(f.calls.length,2,'first finally must not clear second context inflight');pending[1]();await second;assert.equal(f.toasts.length,1);
  const third=f.act(f.entry());assert.equal(f.calls.length,3);pending[2]();await third;assert.equal(f.toasts.length,2);
});
test('gcp_console_late_address_close_and_metadata_changes_never_publish_old_success',async t=>{
  let release;const f=await gcpConsoleFixture(t,{call:(name,input,reply)=>new Promise(resolve=>{release=()=>resolve(reply(input));})});
  for(const change of ['address','close','metadata']){
    const item=f.entry(),pending=f.act(item),original=f.tabs[0].entries[0].address,project=f.records[0].presentation.projectId;
    if(change==='address')f.tabs[0].entries[0].address='wake://cluster/gcp-context?other=1';
    if(change==='close')f.tabs[0].unloaded=true;
    if(change==='metadata')f.records[0].presentation.projectId='changed-project';
    release();await pending;assert.equal(f.toasts.length,0,change);f.tabs[0].entries[0].address=original;f.tabs[0].unloaded=false;f.records[0].presentation.projectId=project;
  }
});
test('gcp_console_requires_exact_native_tuple_and_sanitizes_failure_without_connected_fallback',async t=>{
  let transform=value=>value;const f=await gcpConsoleFixture(t,{call:(name,input,reply)=>transform(reply(input))});
  const changes=[v=>({...v,provider:'cloudwatch'}),v=>({...v,contextId:'other'}),v=>({...v,projectId:'other-project',url:'https://console.cloud.google.com/monitoring?project=other-project'}),v=>({...v,url:v.url+'&extra=1'}),v=>({...v,url:v.url+'#fragment'}),v=>({...v,url:v.url.replace('https://','https://user@')}),v=>({...v,unexpected:true}),v=>({...v,status:'ok'}),()=>({status:'unconfigured',requested:false}),()=>{throw new Error('private native detail');}];
  for(const change of changes){transform=change;await f.act(f.entry());assert.equal(f.toasts.some(message=>message.body==='wake.cloud.console.requested'),false);}
  assert.equal(f.calls.length,changes.length);assert.equal(JSON.stringify(f.toasts).includes('private native detail'),false);
  transform=v=>v;await f.act(f.entry());assert.equal(f.toasts.at(-1).body,'wake.cloud.console.requested');
});

test('gcp_console_menu_fails_closed_without_crypto_instead_of_minting_predictable_intent',async t=>{
  const f=await gcpConsoleFixture(t),descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  try{Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined});assert.equal(f.entry(),undefined);assert.equal(f.calls.length,0);}finally{Object.defineProperty(globalThis,'crypto',descriptor);}
  await f.act(f.entry());assert.equal(f.calls.length,1);
});
test('gcp_console_shell_consumer_and_native_service_compare_the_exact_actual_requested_project',async t=>{
  const {createRequire}=await import('node:module'),require=createRequire(import.meta.url),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wake-console-consumer-')),previous=process.env.KUBECONFIG;process.env.KUBECONFIG=path.join(dir,'missing-config');
  const no=()=>assert.fail('unexpected credentials, HTTP, cluster or real external open');
  t.mock.method(require('./desktop/kubeconfig.cjs'),'watchFiles',()=>()=>{});t.mock.method(require('./desktop/kubeconfig.cjs'),'contextList',()=>[{id:'gcp-context'}]);t.mock.method(require('./desktop/k8s.cjs'),'createClient',no);t.mock.method(globalThis,'fetch',no);
  const saved={version:1,connections:[{id:'native-gcp-context',provider:'gcp-monitoring',contextId:'gcp-context',projectId:'fixture-project',location:'fixture-region',clusterName:'fixture-cluster',credentialSource:{kind:'gke-exec',command:'/fixture/gke-gcloud-auth-plugin'},targets:[]}]};
  const file=path.join(dir,'observability-connections.json'),bytes=JSON.stringify(saved);fs.writeFileSync(file,bytes);
  const modulePath=require.resolve('./desktop/services.cjs'),cached=require.cache[modulePath];delete require.cache[modulePath];
  t.after(()=>{if(previous===undefined)delete process.env.KUBECONFIG;else process.env.KUBECONFIG=previous;if(cached)require.cache[modulePath]=cached;else delete require.cache[modulePath];fs.rmSync(dir,{recursive:true,force:true});});
  const opened=[],native=require('./desktop/services.cjs').create({userData:dir,app:{},emit:no,safeStorage:{isEncryptionAvailable:no},openExternal:async url=>{opened.push(url);}});
  const f=await gcpConsoleFixture(t,{call:(name,input)=>native[name](input,{shell:true,mainFrame:true})});
  const result=await f.act(f.entry());assert.equal(result.status,'requested');assert.deepEqual(opened,['https://console.cloud.google.com/monitoring?project=fixture-project']);assert.equal(fs.readFileSync(file,'utf8'),bytes);
  const next=structuredClone(saved);next.connections[0].projectId='another-project';fs.writeFileSync(file,JSON.stringify(next));
  const rejected=await f.act(f.entry());assert.equal(rejected.status,'invalid_response');assert.equal(f.toasts.filter(message=>message.body==='wake.cloud.console.requested').length,1);
  assert.equal(opened[1],'https://console.cloud.google.com/monitoring?project=another-project');assert.equal(f.calls.length,2);
  assert.deepEqual(await native['gcp.console.open']({contextId:'gcp-context'},{shell:false,mainFrame:true}),{status:'forbidden',requested:false});assert.equal(opened.length,2);
});


test('settings agent row connects only on a ready DaemonSet rollout and stale flow cannot override native evidence', async () => {
  const page = config.settings.groups.flatMap(group => group.pages).find(page => page.id === 'agents');
  /* 클러스터마다 따로 읽고 답을 잠깐 다시 쓰므로(perCluster) 경우마다 다른 context. 첫 그림은 확인 중, 답이 오면(pending) 다시 그린 행 */
  let n = 0, cluster = '';
  const read = async (agent, live) => {
    cluster = `fixture-agent-context-${++n}`;
    const settings = { 'wake.clusters.list': [{ id: cluster, provider: 'gke', state: 'ok' }], 'wake.conn.live': live ? { ['agent-' + cluster]: live } : {} };
    const ctx = { settings: () => settings, desktopInfo: () => ({ dev: false }), data: { get: async (key, params) => { assert.equal(key, 'agent'); assert.equal(params.cluster, cluster); return agent; } } };
    let sections = page.sections(ctx); await sections[0].pending; sections = page.sections(ctx);
    return sections[0].groups[0][0];
  };
  const present = { lookup: 'present', installed: true, unknown: false, rolloutReady: true };
  for (const agent of [{ ...present, rolloutReady: false }, { ...present, rolloutReady: null }, { installed: true, rolloutReady: true }]) {
    for (const live of [undefined, { state: 'connected' }]) {
      const row = await read(agent, live);
      assert.notEqual(row.connection.kind, 'ok');
      assert.notEqual(row.description, 'wake.connected');
      assert.equal(row.connection.action.action, 'kit.history.reload');
    }
  }
  const connected = await read(present);
  assert.equal(connected.connection.kind, 'ok'); assert.equal(connected.connection.action, null);
  const absent = await read({ lookup: 'absent', installed: false, unknown: false });
  assert.equal(absent.connection.action.action, 'wake.agent.install'); assert.equal(absent.connection.action.arg, cluster);
  const running = await read(present, { state: 'running', cancel: true });
  assert.equal(running.connection.busy, true); assert.equal(running.connection.action.action, 'wake.flow.cancel');
});

/* R4-02: settings › 에이전트 sat on "확인 중" with a spinner: a read kept for keepMs was thrown away on the next settings change (every flow redraw
   publishes one) and read again from "확인 중", and a failed read was read again on its own the same way. A kept answer stays on screen while
   it is read again in the background; a failed read stays failed (with its retry) until the person retries */
test('per_cluster_reads_keep_the_last_answer_on_screen_while_reading_again_and_never_reread_a_failure_by_themselves', async () => {
  const { perCluster } = await import('./settings-pages.js');
  let calls = 0, release;
  const tick = () => new Promise(res => setImmediate(res));
  const reads = perCluster(async () => { calls++; await new Promise(res => { release = res; }); return { n: calls }; }, -1);
  const ctx = {};
  let r = reads(ctx, ['c1']); assert.equal(r.of('c1').state, 'busy'); await tick(); release(); await r.pending;
  assert.equal(r.of('c1').state, 'ok');
  await tick();
  r = reads(ctx, ['c1']);
  assert.equal(r.of('c1').state, 'ok', 'an old answer stays on screen while it is read again');
  assert.deepEqual(r.of('c1').value, { n: 1 });
  assert.ok(r.pending, 'the page draws again when the new answer comes');
  await tick(); release(); await r.pending;
  assert.deepEqual(reads(ctx, ['c1']).of('c1').value, { n: 2 }, 'the new answer replaces it');
  const failing = perCluster(async () => { calls++; throw new Error('read failed'); }, -1);
  r = failing(ctx, ['c2']); await r.pending.catch(() => {}); await new Promise(res => setImmediate(res));
  const before = calls;
  for (let i = 0; i < 3; i++) assert.equal(failing(ctx, ['c2']).of('c2').state, 'error');
  assert.equal(calls, before, 'a failed read is not read again until the person retries');
  failing({ fresh: true }, ['c2']); await tick();
  assert.equal(calls, before + 1, 'retry reads it again');
});

/* R4-02: the install the app cannot do (the chart's image is not in this version) was offered as "설치" and the refusal showed only after a press.
   With the image state known, the row says why instead of offering it; with it unknown, Install stays (the flow checks) */
test('settings_agent_row_offers_no_install_when_the_chart_image_is_not_in_this_version', async () => {
  const page = config.settings.groups.flatMap(group => group.pages).find(page => page.id === 'agents');
  let n = 0;
  const row = async agent => { const cluster = `fixture-image-context-${++n}`, settings = { 'wake.clusters.list': [{ id: cluster, provider: 'kind', state: 'ok' }] };
    const ctx = { settings: () => settings, desktopInfo: () => ({ dev: false }), data: { get: async () => agent } };
    let s = page.sections(ctx); await s[0].pending; s = page.sections(ctx); return s[0].groups[0][0]; };
  const absent = { lookup: 'absent', installed: false, unknown: false };
  const blocked = await row({ ...absent, installImage: { published: false, reason: 'agent_image_unpublished' } });
  assert.doesNotMatch(JSON.stringify(blocked), /wake\.agent\.install/, 'no install to press');
  assert.match(JSON.stringify(blocked.description), /wake\.flow\.c\.imageUnpublished/, 'the row says why');
  const unknown = await row(absent);
  assert.equal(unknown.connection.action.action, 'wake.agent.install');
});

test('agent_install_action_preserves_exact_context_and_returns_the_native_flow_completion', async () => {
  const { runInNewContext } = await import('node:vm');
  const source = readFileSync(new URL('./app.config.js', import.meta.url), 'utf8');
  const line = source.split('\n').find(line => line.includes("'wake.agent.install':"));
  const calls = [], pending = {};
  let resolve;
  const completion = new Promise(done => { resolve = done; });
  const actions = runInNewContext('({' + line + '})', { flowApi: null, flows: { run(...args) { calls.push(args); return completion; } } });
  const result = actions['wake.agent.install']({ arg: 'exact/context-gke', approved: true, argv: ['forged'] }, pending);
  assert.equal(typeof result.then, 'function');
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'agent-exact/context-gke'); assert.equal(calls[0][1], 'agent');
  assert.equal(calls[0][4].cluster, 'exact/context-gke'); assert.equal(calls[0][4].target, 'exact/context-gke');
  assert.equal(Object.hasOwn(calls[0][4], 'approved'), false); assert.equal(Object.hasOwn(calls[0][4], 'argv'), false);
  resolve('finished'); assert.equal(await result, 'finished');
});

test('first_run_ai_rows_use_the_settings_connection_row_and_never_show_a_raw_state', () => {
  const step = config.firstRun.steps.find(s => s.id === 'ai');
  const api = { settings: { all: () => ({}) }, firstRun: { opened: () => [] } };
  const rows = step.groups({}, api).flatMap(g => g.rows);
  assert.ok(rows.length >= 5);
  for (const r of rows) {
    assert.notEqual(r.conn.state, 'idle');
    assert.ok(r.conn.state === undefined || typeof r.conn.state === 'string');
    assert.equal(r.badge, undefined, 'no badge with a background');
  }
  const setup = config.firstRun.steps.find(s => s.id === 'setup');
  assert.ok(setup.options.every(o => o.badge === undefined));
});

test('cluster_connect_methods_are_one_definition_in_first_run_and_settings_with_the_cloud_command', () => {
  const add = config.firstRun.steps.find(s => s.id === 'clusters').add().rows.map(r => [r.id, r.label, r.icon]);
  const menu = config.menus['wake.cluster.connect']().items.map(i => [i.id.replace(/^cc-/, ''), i.label, i.icon]);
  assert.deepEqual(menu, add);
  const cloud = config.menus['wake.cluster.connect']().items.find(i => i.id === 'cc-add-cloud');
  assert.deepEqual(cloud.submenu.items.map(i => i.arg), ['add-cloud-aws', 'add-cloud-gcp', 'add-cloud-azure', 'add-cloud-kind']);
});

/* B1: 도구 탭은 어느 클러스터의 어느 도구인지를 정의에 담는다. AI에게 묻기의 참조 칩과 대화 handoff가 이것을 그대로 쓴다(kit shell chipFor) */
test('a_tool_tab_names_its_cluster_and_kind_for_the_ai_reference', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const opened = [], previous = globalThis.kitService;
  const settings = { 'wake.clusters.list': [{ id: 'wake-lab', name: 'wake-lab' }, { id: 'other', name: 'other' }], 'wake.scope.cluster': 'other' };
  const api = { openTool: (...args) => opened.push(args), settings: { get: key => settings[key], all: () => settings }, setSetting() {} };
  globalThis.kitService = { call: async () => ({ url: 'http://127.0.0.1:1/applications' }) };
  try {
    await config.actions['wake.tool.open']({ arg: { cluster: 'wake-lab', tool: { kind: 'argocd' } } }, api);
    const def = opened[0][0];
    assert.deepEqual(def.context.ref, { cluster: 'wake-lab', kind: 'argocd' }, 'the tool\'s own cluster, not the global AI scope (other)');
    assert.equal(def.context.title, 'Argo CD'); assert.equal(def.context.sub, 'wake-lab');
    /* B-12: a restored session opens the tool again the same way (its forwarded address was for that run) */
    assert.deepEqual(def.reopen, { action: 'wake.tool.open', arg: { cluster: 'wake-lab', tool: { kind: 'argocd' } } });
  } finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; t.mock.timers.reset(); }
});

test('ai_run_scope_is_never_empty_when_a_connected_cluster_exists_even_from_a_page_document', async () => {
  /* 대화 탭 문서(셸 상태 없음)에서 보낼 때: kit가 send에 넘기는 설정으로 범위를 정한다(근거: B1 ai-run-received.json의 scope null) */
  const calls = [];
  const before = globalThis.kitService;
  globalThis.kitService = { on() { return () => {}; }, call: async (name, args) => { if (name === 'ai.run') calls.push(args); if (name === 'ai.conversations') return []; return {}; } };
  try {
    const settings = { 'wake.clusters.list': [{ id: 'hidden-off', state: 'off' }, { id: 'lab-ok', state: 'ok' }], 'wake.clusters.connected': ['hidden-off', 'lab-ok'], 'wake.cluster.hideOff': true, 'wake.ns.default.lab-ok': 'payments' };
    const ctrl = new AbortController();
    const it = config.ai.adapter.send({ messages: [{ role: 'user', text: 'q', date: Date.now() }], permission: 'read', model: null }, { signal: ctrl.signal, settings });
    const first = it.next(); await new Promise(r => setTimeout(r, 20)); ctrl.abort(); await Promise.race([first, new Promise(r => setTimeout(r, 50))]);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].scope, { cluster: 'lab-ok', namespace: 'payments' }, 'the first shown connected cluster, not the hidden one, and never null');
  } finally { globalThis.kitService = before; }
});

test('disconnecting_a_cluster_forgets_its_verified_tool_findings', () => {
  const found = { 'gone-prometheus': { cluster: 'gone', kind: 'prometheus', uid: 'u1' }, 'kept-loki': { cluster: 'kept', kind: 'loki', uid: 'u2' } };
  const store = { 'wake.clusters.connected': ['gone', 'kept'], 'wake.tools.found': found };
  const api = { settings: { get: k => store[k], all: () => store }, setSetting: (k, v) => { store[k] = v; } };
  config.actions['wake.cluster.disconnect']({ arg: 'gone' }, api);
  assert.deepEqual(store['wake.clusters.connected'], ['kept']);
  assert.deepEqual(store['wake.tools.found'], { 'kept-loki': { cluster: 'kept', kind: 'loki', uid: 'u2' } });
});

test('firstRun_done_summary_excludes_connections_that_failed_after_being_saved', () => {
  const done = config.firstRun.steps.find(step => step.id === 'setup');
  /* the summary names the clusters still connected (R4-07: names, not a count) */
  const named = d => JSON.stringify(d).match(/"raw":"(c\d)"/g)?.map(x => x.slice(7, -1)) || [];
  for (const [states, expected] of [[['unreachable', 'ok'], ['c1']], [['timeout', 'unknown'], []]]) {
    const settings = { 'wake.clusters.list': states.map((state, index) => ({ id: `c${index}`, state })), 'wake.clusters.connected': ['c0', 'c1'] };
    assert.deepEqual(named(done.description({ settings })), expected);
  }
});

test('firstRun_cancelled_recheck_does_not_save_previous_success_as_current_connection', async t => {
  globalThis.kitService = { call: async () => ({ state: 'ok', identity: { uid: 'uid-current' } }) };
  t.after(() => { delete globalThis.kitService; });
  const { default: app } = await import('./app.config.js?first-run-cancelled');
  await app.firstRun.steps.find(step => step.id === 'clusters').check('context');
  const saved = {};
  const api = { firstRun: { results: () => ({ context: { group: 'check', kind: 'idle' } }) }, settings: { get: key => saved[key] }, setSetting: (key, value) => { saved[key] = value; } };
  await app.actions['wake.firstRun.clusters']({}, api);
  assert.deepEqual(saved['wake.clusters.connected'], []);
  assert.notEqual(saved['wake.clusters.list'][0].state, 'ok');
});

test('firstRun_incomplete_probe_preserves_saved_identity_and_connection_record', async () => {
  for (const row of [null, { group: 'check', kind: 'idle' }, { busy: true, probe: { state: 'ok', identity: { uid: 'unfinished' } } }]) {
    const identity = { uid: 'saved', ref: 'Namespace/kube-system' };
    const record = { target: 'context', identity, identityError: null, at: 'original', accessLevel: 'read' };
    const saved = { 'wake.clusters.list': [{ id: 'context', state: 'ok', identity, identityError: null }], 'wake.connections': { context: record }, 'wake.clusters.connected': ['context'] };
    const api = { firstRun: { results: () => ({ context: row }) }, settings: { get: key => saved[key] }, setSetting: (key, value) => { saved[key] = value; } };
    await config.actions['wake.firstRun.clusters']({}, api);
    assert.deepEqual(saved['wake.clusters.list'][0].identity, identity);
    assert.deepEqual(saved['wake.connections'].context, record);
    assert.notEqual(saved['wake.clusters.list'][0].state, 'ok');
    assert.deepEqual(saved['wake.clusters.connected'], []);
  }
});

test('firstRun_completed_probe_persists_identity_error_in_both_records', async () => {
  for (const identityError of ['forbidden', null]) {
    const identity = identityError ? null : { uid: 'new', ref: 'Namespace/kube-system' };
    const saved = { 'wake.connections': { context: { identity: { uid: 'old' }, identityError: 'missing_uid' } } };
    const api = { firstRun: { results: () => ({ context: { probe: { state: 'ok', identity, identityError } } }) }, settings: { get: key => saved[key] }, setSetting: (key, value) => { saved[key] = value; } };
    await config.actions['wake.firstRun.clusters']({}, api);
    for (const record of [saved['wake.clusters.list'][0], saved['wake.connections'].context]) {
      assert.deepEqual(record.identity, identity);
      assert.equal(record.identityError, identityError);
    }
  }
});

// B2-M1: preserve target IDs and old records, count only this round's completed probes.
test('firstRun_null_and_completed_probes_keep_separate_current_successes', async () => {
  for (const mixed of [false, true]) {
    const identity = { uid: 'saved' };
    const record = { identity };
    const saved = { 'wake.clusters.list': [{ id: 'context', state: 'ok', identity }], 'wake.clusters.connected': ['context'], 'wake.connections': { context: record } };
    const results = { context: null, ...(mixed ? { done: { probe: { state: 'ok', identity: { uid: 'new' } } } } : {}) };
    const api = { firstRun: { results: () => results }, settings: { get: key => saved[key] }, setSetting: (key, value) => { saved[key] = value; } };
    await config.actions['wake.firstRun.clusters']({}, api);
    assert.equal(saved['wake.clusters.list'].find(row => row.id === 'context').state, 'unknown');
    assert.deepEqual(saved['wake.clusters.list'].find(row => row.id === 'context').identity, identity);
    assert.deepEqual(saved['wake.connections'].context, record);
    assert.deepEqual(saved['wake.clusters.connected'], mixed ? ['done'] : []);
    const done = config.firstRun.steps.find(step => step.id === 'setup');
    assert.equal(/"raw":"done"/.test(JSON.stringify(done.description({ settings: saved }))), mixed, 'the summary names only this round\'s success');
    assert.doesNotMatch(JSON.stringify(done.description({ settings: saved })), /"raw":"context"/);
    assert.notEqual(done.open({ settings: saved }), 'wake://cluster/context');
  }
});

/* H-009 D-USR-2026-11-17-01: Ollama는 앱에서 지운다. 첫 실행·설정의 AI 연결은 구독(공식 CLI 셋)과 API 키 두 묶음뿐이고 내 컴퓨터 묶음·ai-local 방법·문구·그림이 없다 */
test('ai_connection_rows_have_no_local_ollama_group_method_text_or_mark', async () => {
  const step = config.firstRun.steps.find(s => s.id === 'ai');
  const groups = step.groups({}, { settings: { all: () => ({}) }, firstRun: { opened: () => [] } });
  assert.deepEqual(groups.map(g => g.label), ['wake.fr.ai.sub', 'wake.fr.ai.api']);
  assert.deepEqual(groups.flatMap(g => g.rows.map(r => r.id)), ['ai-codex-cli', 'ai-gemini-cli', 'ai-claude-cli', 'ai-anthropic', 'ai-openai', 'ai-google']);
  const { METHODS } = await import('./data/connect-flow.js');
  assert.equal(Object.hasOwn(METHODS, 'ai-local'), false);
  for (const key of ['wake.fr.ai.local', 'wake.conn.cred.local']) assert.equal(Object.hasOwn(koLocale, key), false, key);
  const { BRAND_GLYPHS } = await import('./assets/brands/brand-glyphs.js');
  assert.equal(Object.hasOwn(BRAND_GLYPHS, 'brand-ollama'), false);
  assert.doesNotMatch(readFileSync(new URL('./theme.css', import.meta.url), 'utf8'), /brand-invert/);
  assert.doesNotMatch(readFileSync(new URL('./app.config.js', import.meta.url), 'utf8'), /ollama|11434/i);
});

test('palette_recent_conversation_time_reads_as_local_time_not_raw_iso', async () => {
  const { conversations } = await import('./ai-hub.js');
  const today = new Date(); today.setHours(9, 5, 0, 0);
  const old = new Date(2025, 0, 2, 13, 4);
  conversations.splice(0, conversations.length, { id: 'a', title: 'today', time: today.toISOString() }, { id: 'b', title: 'old', time: old.toISOString() });
  try {
    const conv = config.palette.sources.find(s => s.id === 'conv');
    const ends = conv.search('', { settings: {} }).map(r => text(r.end));
    assert.deepEqual(ends, ['09:05', '2025-01-02 13:04'], 'RULE-TIME: today HH:mm, other days YYYY-MM-DD HH:mm');
  } finally { conversations.splice(0); }
});

test('firstRun_done_step_counts_in_the_step_dots_with_the_steps_before_it', () => {
  assert.deepEqual(config.firstRun.steps.filter(step => step.progress).map(step => step.id), ['clusters', 'ai', 'setup']);
});

/* B-16: the cluster's right-click menu was plain text (no icons, a plain "disconnect") while the same cluster's "…" menu shows each
   action's icon and the disconnect in the danger colour. The same actions read the same in both */
test('cluster_context_menu_shows_the_same_icons_and_danger_as_the_cluster_more_menu', () => {
  const settings = { 'wake.clusters.list': [{ id: 'lab', server: 'https://lab' }] };
  const more = config.menus['wake.cluster.more']('lab', { settings }).items, ctx = config.contextMenus['wake.cluster']('lab');
  const open = x => x.find(i => i.action === 'kit.navigate'), off = x => x.find(i => i.action === 'wake.cluster.disconnect');
  assert.equal(open(ctx).icon, open(more).icon);
  assert.equal(off(ctx).icon, off(more).icon);
  assert.equal(off(ctx).danger, true, 'disconnect in the danger colour');
  assert.ok(ctx.filter(i => i.type !== 'separator').every(i => i.icon), 'every action has its icon');
});

/* B-01: the costs and agent screens had no way in. The sidebar cluster menu and the palette's cluster screens name both, each opening its own address */
test('costs_and_agent_screens_are_reached_from_the_sidebar_cluster_menu_and_the_palette', () => {
  const ctx = config.contextMenus['wake.cluster']('lab');
  const target = (items, end) => items.find(i => i.action === 'kit.navigate' && i.arg?.address === `wake://cluster/lab/${end}`);
  assert.ok(target(ctx, 'costs'), 'the cluster menu opens the costs screen');
  assert.ok(target(ctx, 'agent'), 'the cluster menu opens the agent screen');
  const settings = { 'wake.clusters.list': [{ id: 'lab', name: 'lab', state: 'ok' }], 'wake.clusters.connected': ['lab'] };
  const rows = config.palette.sources.find(item => item.id === 'screens').search('', { settings });
  assert.ok(target(rows, 'costs')?.label === 'wake.cost.title', 'the palette lists the costs screen');
  assert.ok(target(rows, 'agent')?.label === 'wake.home.agent', 'the palette lists the agent screen');
  /* B3-17: the tools screen sits with the agent and costs screens in the palette and the cluster menu */
  assert.ok(target(rows, 'tools')?.label === 'wake.home.tools', 'the palette lists the tools screen');
  assert.ok(target(ctx, 'tools'), 'the cluster menu opens the tools screen');
  const order = rows.filter(r => /\/(agent|tools|costs)$/.test(r.arg.address)).map(r => r.arg.address.split('/').pop());
  assert.deepEqual(order, ['agent', 'tools', 'costs']);
});

/* B-25: the palette found no screen: typing "네트워크" or "이벤트" listed nothing. The chosen cluster's screens are rows under its name,
   each opening the same address as the screen switcher */
test('palette_lists_the_chosen_cluster_screens_under_its_name', () => {
  const settings = { 'wake.clusters.list': [{ id: 'lab', name: 'lab', state: 'ok' }], 'wake.clusters.connected': ['lab'] };
  const source = config.palette.sources.find(item => item.id === 'screens');
  assert.ok(source, 'a screens source');
  const rows = source.search('', { settings });
  assert.deepEqual(rows.map(r => r.arg.address).slice(0, 3), ['wake://cluster/lab', 'wake://cluster/lab/resources', 'wake://cluster/lab/network']);
  assert.ok(rows.some(r => r.label === 'wake.view.events' && r.arg.address === 'wake://cluster/lab/ns/_all/events'));
  assert.deepEqual(source.search('', { settings: {} }), [], 'no cluster, no screens');
  assert.equal(source.label(settings).raw, 'lab');
});

/* B-22: the terminal button was missing on a tool's API page and disabled elsewhere with nothing saying why. Every cluster page has it, and
   where it cannot open, its tip names the reason */
test('terminal_button_is_on_every_cluster_page_and_says_why_it_cannot_open', () => {
  const settings = { 'wake.clusters.connected': ['lab'] }, off = { terminal: { key: () => null, open: () => false } };
  const term = (route, params, api = off) => config.topbar.buttons({ route: { id: route }, params }, { settings }, api).find(b => b.action === 'kit.terminal.toggle');
  for (const [route, params, why] of [['tool-api', { cluster: 'lab', tool: 'loki' }, 'wake.term.why.toolApi'], ['cluster', { cluster: 'gone' }, 'wake.term.why.notConnected'], ['cluster', { cluster: 'lab' }, 'wake.term.why.desktop']]) {
    const b = term(route, params);
    assert.ok(b, `${route} has the terminal button`);
    assert.equal(b.disabled, true);
    assert.equal(b.why, why, `${route}/${params.cluster}: the reason`);
  }
  const on = term('cluster', { cluster: 'lab' }, { terminal: { key: () => 'k', open: () => false } });
  assert.equal(on.disabled, false); assert.equal(on.why, undefined);
});

/* B-29: ⌘D added the tab to the bookmarks with nothing on screen saying so. Adding says it was added, adding one already there says so */
test('bookmarking_a_tab_says_it_was_added_or_already_there', () => {
  const toasts = [], settings = {};
  const api = { state: { settings }, setSetting: (k, v) => { settings[k] = v; }, toast: p => toasts.push(p) };
  config.actions['wake.pin']({ arg: { address: 'wake://cluster/lab', title: 'lab', icon: 'k8s-cluster' } }, api);
  config.actions['wake.pin']({ arg: { address: 'wake://cluster/lab', title: 'lab', icon: 'k8s-cluster' } }, api);
  assert.deepEqual(toasts.map(x => x.title), ['wake.pin.added', 'wake.pin.exists'], JSON.stringify(toasts));
  assert.equal(toasts[0].tone, 'ok');
});

/* 첫 출시는 자동 업데이트가 꺼져 있다(desktop.config.cjs에 update.enabled 없음 → updater.cjs unsupported/auto_update_disabled 또는 unconfigured, 위 막대의 업데이트 단추는 숨음).
   설정 › 일반 › Wake 정보가 단추를 말없이 숨기지 않고 그 사실과 새 버전을 받는 길을 한 줄로 말한다 */
test('settings_about_says_automatic_updates_are_off_when_the_desktop_config_does_not_turn_them_on', async () => {
  const { createRequire } = await import('node:module');
  const desktop = createRequire(import.meta.url)('./desktop.config.cjs');
  assert.notEqual(desktop.update?.enabled, true, 'this release ships with automatic updates off');
  const general = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'general');
  const row = general.sections.flatMap(s => s.groups.flat()).find(r => r.id === 'update');
  assert.ok(row, 'the about section has an update line instead of nothing');
  const enLocale = (await import('./locale/en.js')).default;
  assert.ok(koLocale[row.description] && enLocale[row.description] && koLocale[row.title] && enLocale[row.title], 'finished words in both languages');
});

/* G-1: 허락 대화상자는 kubeconfig가 실행할 명령(찾은 실제 경로와 인자)을 그대로 보이고, 허락은 셸에서 kube.execConsent로만 기록한 뒤 그 클러스터를 다시 확인한다 */
test('exec_consent_dialog_shows_the_exact_command_and_allowing_records_it_then_rechecks', async () => {
  const def = config.dialogs['wake.exec.consent']?.({ id: 'eks-prod', command: '/opt/homebrew/bin/aws', args: ['eks', 'get-token', '--cluster-name', 'prod cluster'] });
  assert.ok(def, 'a consent dialog');
  assert.match(String(def.body), /\/opt\/homebrew\/bin\/aws eks get-token --cluster-name &#39;prod cluster&#39;|\/opt\/homebrew\/bin\/aws eks get-token --cluster-name 'prod cluster'/, 'the exact command, arguments quoted as a shell reads them');
  assert.equal(def.submit.action, 'wake.exec.allow'); assert.deepEqual(def.submit.arg, { id: 'eks-prod' });
  assert.ok(koLocale[def.title] && koLocale[def.cancel] && koLocale[def.description.key], 'finished words');
});

/* G-2: 연결 설정 파일(connections.json)을 읽지 못하면 서비스는 환경의 kubeconfig만 읽고 kube.read connections에 오류와 고치는 길을 준다.
   설정 › 클러스터는 그 사실을 줄로 말하고(빈 목록처럼 보이지 않게) 고치는 길에 맞는 안내와 다시 읽기를 준다 */
test('cluster_settings_name_an_unreadable_connections_file_and_how_to_repair_it', () => {
  const page = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'clusters');
  const enLocale = JSON.parse(JSON.stringify({}));
  for (const repair of ['CONNECTIONS_REPAIR_PERMISSIONS', 'CONNECTIONS_REPAIR_CONTENT', 'CONNECTIONS_REPAIR_RETRY']) {
    const sections = page.sections({ settings: () => ({ 'wake.kube.connections': { state: 'error', code: 'CONNECTIONS_JSON_INVALID', repair } }) });
    const rows = sections.flatMap(s => (s.groups || []).flat());
    const row = rows.find(r => r.id === 'cl-conn-file');
    assert.ok(row, `${repair}: a row says the connections file could not be read`);
    assert.equal(row.description, `wake.s.connFile.${repair}`);
    assert.ok(koLocale[row.title] && koLocale[row.description], 'finished words');
    assert.equal(row.connection?.kind, 'error', 'a failed state, not an empty list');
    assert.equal(row.connection?.action?.action, repair === 'CONNECTIONS_REPAIR_PERMISSIONS' ? 'kit.dialog.open' : 'wake.kube.reread', 'and offers to repair permissions or read it again');
  }
  const fine = page.sections({ settings: () => ({ 'wake.kube.connections': null }) }).flatMap(s => (s.groups || []).flat());
  assert.ok(!fine.some(r => r.id === 'cl-conn-file'), 'nothing when the file reads');
  void enLocale;
});

test('a_connections_permission_error_offers_a_confirmed_repair_that_calls_the_repair_service_then_reads_again', async () => {
  const page = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'clusters');
  const rowFor = repair => page.sections({ settings: () => ({ 'wake.kube.connections': { state: 'error', code: 'CONNECTIONS_FILE_INVALID', repair } }) }).flatMap(s => (s.groups || []).flat()).find(r => r.id === 'cl-conn-file');
  const perm = rowFor('CONNECTIONS_REPAIR_PERMISSIONS').connection.action;
  assert.deepEqual([perm.action, perm.arg?.id], ['kit.dialog.open', 'wake.kube.repairDlg'], 'a permission error offers the repair, behind a confirmation');
  assert.ok(koLocale[perm.label], 'finished words on the button');
  const dlg = config.dialogs['wake.kube.repairDlg']();
  assert.equal(dlg.submit.action, 'wake.kube.repair');
  assert.ok(koLocale[dlg.title] && koLocale[dlg.description] && /0600/.test(koLocale[dlg.description]), 'the dialog says what changes');
  for (const other of ['CONNECTIONS_REPAIR_CONTENT', 'CONNECTIONS_REPAIR_RETRY']) assert.equal(rowFor(other).connection.action.action, 'wake.kube.reread', `${other}: content is never repaired by Wake`);
  const calls = [], toasts = [], previous = globalThis.kitService;
  globalThis.kitService = { call: async (name, args) => { calls.push([name, args]); return name === 'kube.connectionsRepair' ? { state: 'repaired', fixed: ['file'], connections: { state: 'ready' } } : { contexts: [], connections: { state: 'ready' } }; }, on() {} };
  try { await config.actions['wake.kube.repair']({}, { toast: t => toasts.push(t), settings: { get: () => undefined, set() {} }, firstRun: { active: () => false } }); }
  finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; }
  assert.deepEqual(calls[0], ['kube.connectionsRepair', { confirm: true }]);
  assert.equal(toasts[0]?.tone, 'ok');
});

/* G-3: 보관 정책(hub data.export · data.delete, wake.ai.autoInterpret, aiserver.client rotate)의 화면 */
test('data_policy_rows_export_delete_with_confirm_auto_interpret_and_token_rotation', async () => {
  const pages = config.settings.groups.flatMap(g => g.pages);
  const chat = pages.find(p => p.id === 'ai-chat'), rowsOf = p => (Array.isArray(p.sections) ? p.sections : []).flatMap(s => (s.groups || []).flat());
  assert.equal(rowsOf(chat).find(r => r.id === 'auto-interpret')?.control?.key, 'wake.ai.autoInterpret', 'the auto-interpret switch (off unless turned on)');
  assert.ok(!config.settings.defaults?.['wake.ai.autoInterpret'], 'off by default');
  const archive = pages.find(p => p.id === 'archive');
  const sections = await archive.sections({ settings: () => ({}) });
  const rows = sections.flatMap(s => (s.groups || []).flat());
  assert.equal(rows.find(r => r.id === 'data-export')?.control?.action, 'wake.data.export');
  assert.equal(rows.find(r => r.id === 'data-delete')?.control?.dialog, 'wake.data.deleteDlg', 'delete opens a confirm dialog first (B2-03: by the dialog property)');
  const dlg = config.dialogs['wake.data.deleteDlg']();
  assert.equal(dlg.submit.action, 'wake.data.delete'); assert.equal(dlg.submit.variant, 'destructive');
  const menu = config.menus['wake.ai.client.more']('c1');
  assert.ok(menu.items.some(i => i.action === 'kit.dialog.open' && i.arg?.id === 'wake.ai.client.rotateDlg'), 'the client menu offers a new token after a confirm');
  assert.equal(config.dialogs['wake.ai.client.rotateDlg']('c1').submit.action, 'wake.ai.client.rotate');
});

/* B3-04: a client token whose clipboard write failed was still announced as copied (and could not be seen again); a rotated token was only a
   toast. Both open the token dialog: the token in a copyable block until the person closes it, and the words say whether it was copied */
test('a_new_or_rotated_client_token_stays_visible_and_says_whether_the_clipboard_took_it', async () => {
  const previous = globalThis.kitService, clip = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.kitService = { call: async (_name, args) => ({ token: 'wk_' + args.op }) };
  try {
    for (const [clipboard, copied] of [[{ writeText: async () => { throw new Error('denied'); } }, false], [undefined, false], [{ writeText: async () => {} }, true]]) {
      Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true, writable: true });
      for (const [action, a] of [['wake.ai.client.add', { values: { name: 'x', cluster: 'c1' } }], ['wake.ai.client.rotate', { arg: 'c1' }]]) {
        const toasts = [], dialogs = [];
        await config.actions[action](a, { toast: p => toasts.push(p.title), dialog: (id, arg) => dialogs.push([id, arg]), refresh() {} });
        assert.deepEqual(toasts, [], `${action}: no toast claims the copy`);
        assert.equal(dialogs.length, 1, `${action}: the token stays on screen until it is closed`);
        const [id, arg] = dialogs[0], def = config.dialogs[id](arg);
        assert.equal(def.submit, null, 'a read-only dialog closed by the person');
        assert.equal(def.description, copied ? 'wake.s.aic.tokenCopied' : 'wake.s.aic.tokenNotCopied');
        assert.match(String(def.body?.s ?? def.body), /wk_(add|rotate)/, 'the token in a copyable block');
      }
    }
  } finally {
    if (previous) globalThis.kitService = previous; else delete globalThis.kitService;
    if (clip) Object.defineProperty(globalThis, 'navigator', clip); else delete globalThis.navigator;
  }
});

/* A2-19: 클러스터 안의 에이전트·도구 화면 경로는 클러스터 경로(클러스터 › 에이전트), 앱 설정("설정 › 에이전트")처럼 읽히지 않는다(비용 화면과 같은 모양) */
test('agent_and_tools_screens_inside_a_cluster_read_as_a_cluster_path_not_settings', () => {
  const route = id => config.routes.find(r => r.id === id);
  for (const [id, label] of [['agent', 'wake.home.agent'], ['tools', 'wake.home.tools']]) {
    const labels = route(id).crumbs({ cluster: 'c1' }).map(c => c.label);
    assert.deepEqual(labels.slice(1), [label], `${id}: no settings step in a cluster path: ${JSON.stringify(labels)}`);
    assert.equal(labels.at(-1), label);
    assert.equal(labels.length, route('costs').crumbs({ cluster: 'c1' }).length, `${id}: the same depth as the costs screen`);
  }
});

/* B2-15: the agent install's "permission needed" had no sheet (the sheet needed a read grant to show), so the row offered only a copy.
   The sheet for an install shows the install command with copy, Slack and a direct apply that runs the declared command (Enter in the terminal) */
test('agent_install_permission_sheet_shows_the_install_command_and_a_direct_apply_that_waits_for_enter', async () => {
  const { specOf } = await import('./data/commands.js');
  const line = "helm upgrade --install wake-agent '/fixture/app/wake-agent-only' --namespace wake-system --create-namespace --kube-context 'fixture-a' --set identity.clusterId='fixture-a'";
  const def = config.dialogs['wake.perm.sheet']({ key: 'agent-x', cluster: 'fixture-a', install: line }, { settings: {} });
  assert.ok(def, 'a sheet for the install');
  const apply = def.extra.find(e => e.action === 'wake.perm.apply');
  assert.ok(apply, 'a direct apply');
  assert.equal(apply.arg.command, line);
  assert.equal(specOf(apply.arg.command)?.confirm, true, 'the direct apply waits for the desktop confirmation');
  assert.equal(def.submit.arg.value, line);
});

/* B2-03: "Delete all" (my data) sent the kit action kit.dialog.open from a page button, which a page click never handed to its dialog, so nothing
   opened. The button opens its confirm dialog by the control's dialog property, and confirming runs the delete with confirm: true */
test('my_data_delete_opens_its_confirm_dialog_by_the_dialog_property_and_only_confirming_deletes', async () => {
  const page = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'archive');
  const sections = await page.sections({ settings: () => ({}), desktopInfo: () => ({}) });
  const row = sections.flatMap(s => (s.groups || []).flat()).find(r => r?.id === 'data-delete');
  assert.equal(row.control.dialog, 'wake.data.deleteDlg', 'opened by the dialog property');
  assert.equal(row.control.action, undefined, 'no kit action a page click drops');
  const dlg = config.dialogs['wake.data.deleteDlg']();
  assert.equal(dlg.submit.action, 'wake.data.delete'); assert.equal(dlg.submit.variant, 'destructive');
  const exportRow = sections.flatMap(s => (s.groups || []).flat()).find(r => r?.id === 'data-export');
  assert.equal(exportRow.control.action, 'wake.data.export', 'export is an app action the page sends to the shell');
});

/* B2-14: the incident result pills fold into "more" when the card is narrow (AI pane open, 487px) */
test('incident_result_pills_fold_into_more_when_narrow', async () => {
  const { incidentsView } = await import('./pages/incident-parts.js');
  const s = String(incidentsView({ t: k => k, list: [], st: { result: 'all', q: '' }, now: Date.now(), actions: { result: 'r', page: 'p', open: 'o', card: 'c' } }).s);
  assert.match(s, /class="pills-fold flat" data-pills-fold><div class="pills" role="tablist" data-c="pill-tabs" data-tabs="wake-inc-result"/);
});

/* B2-01: the agent row offered "copy the install command" for a chart whose image is not published (the command would fail in the cluster).
   The copy is offered only once the desktop says the bundled chart's image is published */
test('agent_row_offers_no_install_copy_while_the_agent_image_is_unpublished', async () => {
  const previous = globalThis.kitService;
  globalThis.kitService = { call: async name => (name === 'agent.prep' ? { helm: true, exists: true, image: { published: false, reason: 'agent_image_unpublished' } } : null) };
  try {
    const agents = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'agents');
    const ctx = { settings: () => ({ 'wake.clusters.list': [{ id: 'img-fixture', state: 'ok' }] }), desktopInfo: () => ({ dev: false }), data: { get: async () => ({ lookup: 'absent', installed: false }) } };
    await agents.sections(ctx)[0].pending; await new Promise(r => setTimeout(r, 0));
    const row = agents.sections(ctx)[0].groups[0][0];
    assert.equal(row.connection.action.action, 'wake.agent.install', 'install stays (it stops with the reason)');
    assert.ok(!JSON.stringify(row).includes('wake.flow.a.copyInstall'), 'no copy of an install that cannot work');
  } finally { if (previous) globalThis.kitService = previous; else delete globalThis.kitService; }
});

/* B3-14: settings › Git said "github 연결 안 됨" (the raw source id) with no way to connect. The account is a GitHub connection row: its name,
   its state and a connect action that opens the token field (the token the Draft PR path reads) */
test('settings_git_account_is_a_github_connection_row_with_a_way_to_connect', async () => {
  const git = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'git');
  const sections = await git.sections({ settings: () => ({}), data: { get: async () => null } });
  const account = sections[0];
  assert.doesNotMatch(JSON.stringify(account), /"raw":"github"/, 'not the raw source id');
  const row = (account.groups || []).flat()[0];
  assert.ok(row, 'a row for the account');
  assert.equal(row.title.raw, 'GitHub');
  assert.equal(row.connection?.action?.action, 'wake.conn.form', 'a way to connect');
  assert.equal(row.connection.action.arg, 'git-github');
  const opened = await git.sections({ settings: () => ({ 'wake.conn.form': 'git-github' }), data: { get: async () => null } });
  const form = (opened[0].groups || []).flat()[0].connection.form;
  assert.equal(form.submit.action, 'wake.conn.start');
  assert.equal(form.fields[0].type, 'password', 'the token is a secret field');
});

/* B3-13: on the tools screen the top bar had two buttons named "도구" (the path step and the tools menu). The menu button says what it opens */
test('top_bar_tools_menu_is_named_apart_from_the_tools_screen', () => {
  const buttons = config.topbar.buttons({ route: { id: 'tools' }, params: { cluster: 'lab' } }, { settings: {} }, { terminal: { key: () => null, open: () => false } });
  const tools = buttons.find(b => b.menu === 'wake.tools');
  assert.notEqual(koLocale[tools.tip], koLocale['wake.home.tools'], 'not the same name as the tools screen');
  assert.ok(koLocale[tools.tip], 'named in the dictionary');
});

/* 시작 화면 삭제(D-USR-2026-11-18): 새 탭·앱 시작은 마지막으로 본 클러스터의 홈(연결된 것이 없으면 설정 › 클러스터). 새 탭 시작 화면·그 경로·카드가 없고,
   "시작할 때"는 이전 탭 복원 / 클러스터 홈 둘(예전 "새 탭" 저장 값은 클러스터 홈으로 읽힘) */
test('new_tab_and_start_open_the_last_viewed_cluster_home_and_there_is_no_start_page', async () => {
  assert.equal(config.startPage, undefined, 'no start page');
  assert.equal(config.newTab, undefined, 'no new-tab page');
  assert.equal(config.routes.some(r => r.id === 'start' || r.kind === 'start'), false, 'no start route');
  const list = [{ id: 'a', state: 'ok' }, { id: 'b', state: 'ok' }], connected = ['a', 'b'];
  assert.equal(config.start({ settings: { 'wake.clusters.list': list, 'wake.clusters.connected': connected } }), 'wake://cluster/a', 'the first connected cluster before any was viewed');
  assert.equal(config.start({ settings: { 'wake.clusters.list': list, 'wake.clusters.connected': connected, 'wake.cluster.last': 'b' } }), 'wake://cluster/b', 'the cluster viewed last');
  assert.equal(config.start({ settings: { 'wake.clusters.list': [{ id: 'a', state: 'failed' }], 'wake.cluster.last': 'gone' } }), 'wake://settings/clusters', 'no cluster: connect one');
  /* R4-01: a restored tab on a removed page (the old start page) comes back on the cluster home, and is dropped with no cluster */
  assert.equal(config.start({ settings: { 'wake.clusters.list': list, 'wake.clusters.connected': connected }, restoring: true }), 'wake://cluster/a');
  assert.equal(config.start({ settings: { 'wake.clusters.list': [{ id: 'a', state: 'failed' }] }, restoring: true }), null, 'no cluster: the tab is dropped');
  /* the cluster in front is remembered as the last viewed one */
  const stored = {}, settings = { 'wake.clusters.list': list, 'wake.clusters.connected': connected };
  const api = { activeTab: () => ({ id: 't' }), routeOf: () => ({ params: { cluster: 'b' } }), setSetting: (k, v) => { stored[k] = v; } };
  config.sidebar.sections[0].rows({ settings }, api);
  assert.equal(stored['wake.cluster.last'], 'b');
  const general = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'general');
  const startup = general.sections.flatMap(s => s.groups.flat()).find(r => r.id === 'startup');
  assert.deepEqual(startup.control.options.map(o => o.id), ['restore', 'new']);
  assert.match(koLocale[startup.control.options[1].label], /^\uD074\uB7EC\uC2A4\uD130 \uD648$/, 'the stored "new" reads as the cluster home');
});

/* R4-07: the first-run lines under the titles were counts in system words ("context 1 · 연결됨 1", "kubeconfig 없음", "클러스터 1 · AI 1").
   They name what is connected in product words: "wake-lab 연결됨", "이 컴퓨터에서 찾은 클러스터가 없습니다", and the setup step a short summary */
test('first_run_lines_name_what_is_connected_in_product_words', async () => {
  const { firstRunLine } = await import('./app.config.js');
  /* the line in Korean words: keys from the ko locale, { raw } as it is, {name} filled from vars */
  const en = (await import('./locale/en.js')).default;
  let words = koLocale;
  const useLocale = id => { words = id === 'en' ? en : koLocale; };
  const said = x => (x == null ? '' : typeof x === 'number' ? String(x) : typeof x === 'string' ? words[x]
    : x.raw != null ? x.raw : words[x.key].replace(/\{(\w+)\}/g, (_, k) => said(x.vars[k])));
  assert.equal(said(firstRunLine.clusters(0, [])), '\uC774 \uCEF4\uD4E8\uD130\uC5D0\uC11C \uCC3E\uC740 \uD074\uB7EC\uC2A4\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4');
  assert.equal(said(firstRunLine.clusters(2, [])), '\uC774 \uCEF4\uD4E8\uD130\uC5D0\uC11C \uD074\uB7EC\uC2A4\uD130 2\uAC1C\uB97C \uCC3E\uC558\uC2B5\uB2C8\uB2E4');
  assert.equal(said(firstRunLine.clusters(1, ['wake-lab'])), 'wake-lab \uC5F0\uACB0\uB428');
  assert.equal(said(firstRunLine.clusters(3, ['wake-lab', 'prod', 'stage'])), 'wake-lab \uC678 2\uAC1C \uC5F0\uACB0\uB428');
  assert.equal(said(firstRunLine.ai([])), '');
  assert.equal(said(firstRunLine.ai(['Claude'])), 'Claude \uC5F0\uACB0\uB428');
  assert.equal(said(firstRunLine.setup(['wake-lab'], ['Claude'])), 'wake-lab · Claude \uC5F0\uACB0\uB428');
  assert.equal(said(firstRunLine.setup(['wake-lab'], [])), 'wake-lab \uC5F0\uACB0\uB428 · AI\uB294 \uB098\uC911\uC5D0 \uC5F0\uACB0');
  assert.equal(said(firstRunLine.setup([], ['Claude'])), 'Claude \uC5F0\uACB0\uB428 · \uD074\uB7EC\uC2A4\uD130\uB294 \uB098\uC911\uC5D0 \uC5F0\uACB0');
  assert.equal(said(firstRunLine.setup([], [])), '\uD074\uB7EC\uC2A4\uD130\uC640 AI\uB294 \uC124\uC815\uC5D0\uC11C \uB098\uC911\uC5D0 \uC5F0\uACB0');
  useLocale('en');
  assert.equal(said(firstRunLine.clusters(0, [])), 'No clusters found on this computer');
  assert.equal(said(firstRunLine.clusters(1, [])), 'Clusters found on this computer: 1');
  assert.equal(said(firstRunLine.clusters(3, ['wake-lab', 'prod', 'stage'])), 'wake-lab and 2 more connected');
  useLocale('ko');
  for (const k of ['wake.fr.clusters.state', 'wake.fr.ai.state']) assert.equal(koLocale[k], undefined, `${k}: no count line`);
});

/* R4-09: the cloud connect row offered "연결" with no region or name (it failed at the first step), showed a made-up cluster name
   ("payments-prod") in the name field as if it were found, and under a free-text name field said the region's clusters are listed there */
test('cloud_connect_waits_for_its_fields_and_the_name_field_has_no_made_up_name_and_a_hint_for_typing', () => {
  const cloud = config.firstRun.steps[0].add().rows.find(r => r.id === 'add-cloud');
  for (const c of ['aws', 'gcp', 'azure', 'kind']) {
    const fields = cloud.fields({ cloud: c }).flat(), name = fields.find(f => f.key === 'name');
    assert.equal(name.placeholder.raw, '', `${c}: no example cluster name`);
    assert.notEqual(name.hint, 'wake.fr.add.h.aws.regionFirst');
    assert.equal(cloud.submit({ cloud: c }).disabled, true, `${c}: nothing to connect yet`);
    const filled = Object.fromEntries(fields.filter(f => f.key !== 'cloud').map(f => [f.key, 'x']));
    assert.equal(!!cloud.submit({ cloud: c, ...filled }).disabled, false, `${c}: every field filled`);
  }
  assert.equal(koLocale['wake.fr.add.h.aws.regionFirst'], undefined, 'the free-text name field never says the clusters are listed');
});

/* R4-18: with no cluster connected the sidebar's Clusters section was an empty title. It shows one row that leads to Settings › Clusters
   (the palette's "Connect a cluster" command: same words, icon and place); with a cluster the row is not there */
test('sidebar_clusters_section_with_no_cluster_has_a_connect_row_to_the_cluster_settings', () => {
  const section = config.sidebar.sections.find(s => s.id === 'clusters'), api = { activeTab: () => null, routeOf: () => null, setSetting() {} };
  const none = section.rows({ settings: {} }, api);
  assert.equal(none.length, 1);
  assert.equal(none[0].label, 'wake.cmd.connectCluster');
  assert.equal(none[0].icon, 'plus-medium');
  assert.equal(none[0].address, 'wake://settings/clusters');
  const one = section.rows({ settings: { 'wake.clusters.list': [{ id: 'a', state: 'ok' }], 'wake.clusters.connected': ['a'] } }, api);
  assert.deepEqual(one.map(r => r.id), ['a']);
});
