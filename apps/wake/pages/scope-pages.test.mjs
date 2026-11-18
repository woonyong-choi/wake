/* 범위 검색 상자(SCR-SEARCH-SCOPE, H-009): 클러스터 화면 여덟이 머리 아래 같은 상자 하나(글 · 종류 · namespace · 기간 · 실행)를 쓰는지,
   종류와 namespace는 화면을 옮겨도 이어지고 글은 화면마다 따로인지, 종류가 소유한 것(Deployment의 Pod 이벤트)을 맞추는지. 이 파일 안의 합성 응답만 쓴다 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import config from '../app.config.js';
import { unconnected } from '../data/index.js';
import { extendIcons, extendGlyphs } from '../../../kit/index.js';
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
extendGlyphs(config.icons.glyphs); extendIcons(config.icons.map);
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { for (let i = 0; i < 12; i++) await tick(); };

const C_ID = 'fixture-context', NOW = Date.now(), iso = ms => new Date(ms).toISOString(), MIN = 60_000;
const ref = (kind, name, uid) => ({ apiVersion: kind === 'Pod' ? 'v1' : 'apps/v1', kind, name, uid, controller: true });
const meta = (kind, ns, name, uid, owner) => ({ kind, ns, name, uid, ownerReferences: owner ? [owner] : [], owner: owner ?? null, labels: {}, status: ['ok', 'Running'], age: '1d' });
const DEPLOYMENTS = [meta('Deployment', 'payments', 'payments-api', 'd1'), meta('Deployment', 'shop', 'cart', 'd2')];
const REPLICASETS = [meta('ReplicaSet', 'payments', 'payments-api-7c9f6', 'r1', ref('Deployment', 'payments-api', 'd1')), meta('ReplicaSet', 'shop', 'cart-5d4b8', 'r2', ref('Deployment', 'cart', 'd2'))];
const PODS = [{ ...meta('Pod', 'payments', 'payments-api-7c9f6-x2k4', 'p1', ref('ReplicaSet', 'payments-api-7c9f6', 'r1')), status: ['danger', 'CrashLoopBackOff'], restarts: 4 },
  { ...meta('Pod', 'shop', 'cart-5d4b8-q8m1', 'p2', ref('ReplicaSet', 'cart-5d4b8', 'r2')), status: ['danger', 'CrashLoopBackOff'], restarts: 2 }];
const ev = (uid, kind, ns, name, reason, type = 'Warning') => ({ uid, type, reason, message: `${reason} ${name}`, object: { kind, name, ns, uid: 'o-' + uid }, at: iso(NOW - 5 * MIN), count: 3, source: 'kubelet' });
const EVENTS = Object.assign([ev('e1', 'Pod', 'payments', 'payments-api-7c9f6-x2k4', 'BackOff'), ev('e2', 'Deployment', 'payments', 'payments-api', 'ScalingReplicaSet', 'Normal'), ev('e3', 'Pod', 'shop', 'cart-5d4b8-q8m1', 'BackOff')], { timeBasis: { referenceAt: iso(NOW) } });
const KINDS = [{ items: [{ kind: 'Deployment', plural: 'deployments', icon: 'k8s-deployment', count: 2, readStatus: 'ok', byNs: { payments: 1, shop: 1 } }, { kind: 'Pod', plural: 'pods', icon: 'k8s-pod', count: 2, readStatus: 'ok', byNs: { payments: 1, shop: 1 } },
  { kind: 'Secret', plural: 'secrets', icon: 'k8s-secret', readStatus: 'forbidden' }] }];
let kindReads = 0;
const ROWS = { deployments: DEPLOYMENTS, replicasets: REPLICASETS, pods: PODS, events: EVENTS, services: [{ ...meta('Service', 'payments', 'payments-api', 's1'), selector: { app: 'x' } }] };
const FIXTURE = {
  cluster: async () => ({ id: C_ID, state: 'ok' }),
  resources: async p => structuredClone(ROWS[p.kind] ?? []),
  namespaces: async () => ['payments', 'shop'],
  kinds: async () => { kindReads++; return structuredClone(KINDS); },
  incidents: async () => [],
};

let imports = 0;
async function pageOf(file) {
  let create;
  globalThis.captureScopePage = (_, c) => { create = c; };
  const source = (await readFile(new URL(file, import.meta.url), 'utf8'))
    .replaceAll(/from '([^']+)'/g, (_, path) => `from '${new URL(path, import.meta.url).href}'`).replace('bootPage(config,', 'globalThis.captureScopePage(config,') + `\n// ${++imports}`;
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  delete globalThis.captureScopePage;
  return async ({ params = {}, query = {}, settings = {}, route } = {}) => {
    const data = { get: (key, p) => (FIXTURE[key] ? FIXTURE[key](p) : Promise.reject(unconnected(key))) };
    let page, state = {}, values = { ...settings };
    const ctx = { params: { cluster: C_ID, ...params }, query, route, data, t: (key, vars) => (vars ? `${key}${JSON.stringify(vars)}` : key), update() {}, settings: () => values, desktopInfo: () => null,
      state: () => state, setState: patch => { state = { ...state, ...patch }; }, api: { navigate() {}, setMeta() {}, setSetting: (k, v) => { values = { ...values, [k]: v }; } } };
    page = await create(ctx);
    state = { ...(page.screen?.state ?? {}) };
    await page.init?.(); await settle();
    return { page, ctx, settings: () => values, setSettings: v => { values = v; }, html: () => String(page.render().s ?? page.render()) };
  };
}
const scoped = { 'wake.scope': { [C_ID]: { kinds: ['deployments'], ns: ['payments'], q: { home: 'payments' } } } };
const PAGES = [['home', './cluster-home.js', { route: { id: 'cluster' } }], ['resources', './resource-list.js', { params: {} }], ['network', './network.js', {}], ['gitops', './gitops.js', {}],
  ['events', './resource-list.js', { params: { kind: 'events', ns: '_all' } }], ['logs', './logs.js', {}], ['alerts', './alerts.js', {}], ['incidents', './cluster-home.js', { route: { id: 'incidents' } }]];

const RANGED = new Set(['home', 'network', 'gitops', 'events', 'logs', 'alerts', 'incidents']);
test('scope_box_is_one_line_under_the_head_of_all_eight_sections_and_the_range_is_its_own_row_under_it', async () => {
  for (const [section, file, o] of PAGES) {
    const { html } = await (await pageOf(file))({ ...o, settings: scoped });
    const s = html();
    assert.match(s, /class="cmp wide run" data-c="composer" data-id="wake-scope"/, `${section}: the one-line (wide) scope box`);
    assert.ok(s.includes(`placeholder="wake.scope.ph.${section}"`), `${section}: its own placeholder`);
    assert.ok(!s.includes('data-c="search-input"'), `${section}: no separate search field`);
    assert.ok(!/data-menu="wake\.(rv|net|git)\.nsMenu"|data-menu="wake\.rv\.kindMenu"/.test(s), `${section}: no separate namespace or kind picker`);
    const box = s.slice(s.indexOf('data-id="wake-scope"'), s.indexOf('data-composer-send'));
    assert.match(box, /data-menu="wake\.scope\.kindMenu"[\s\S]*data-menu="wake\.scope\.nsMenu"/, `${section}: kind then namespace in the box (before the text on the line)`);
    assert.ok(!s.includes('cmp-end-x') && !box.includes('class="tr'), `${section}: no time range inside the box`);
    const under = /data-composer-send[\s\S]*?<\/button>\s*<\/span>\s*<\/div>\s*<\/div>\s*<span class="tr\b/.test(s);
    assert.equal(under, RANGED.has(section), `${section}: ${RANGED.has(section) ? 'the time range is the row right under the box' : 'no time range'}`);
  }
  const css = await readFile(new URL('../theme.css', import.meta.url), 'utf8');
  assert.match(css, /\.pcol > \.cmp \+ \.tr \{[^}]*justify-self: end;/, 'the time range row ends at the right edge of the box');
});

test('scope_pickers_are_the_same_multi_select_menu_with_object_counts_read_when_opened', async () => {
  kindReads = 0;
  const { page, html } = await (await pageOf('./resource-list.js'))({ params: {}, settings: { 'wake.scope': { [C_ID]: { kinds: ['deployments', 'pods'], ns: ['payments'] } } } });
  const box = html().slice(html().indexOf('data-id="wake-scope"'), html().indexOf('data-composer-send'));
  assert.match(box, /data-menu="wake\.scope\.kindMenu"[^>]*>[\s\S]*?wake\.scope\.more\{&quot;name&quot;:&quot;Deployment&quot;,&quot;n&quot;:1\}/, 'many kinds: the first and how many more');
  assert.match(box, /data-menu="wake\.scope\.nsMenu"[^>]*>[\s\S]*?>payments</, 'one namespace: its name');
  const before = kindReads;
  const first = page.menus['wake.scope.kindMenu']();
  assert.ok(first.pending, 'the counts are read when the menu opens');
  assert.ok(first.items.some(i => i.label === 'wake.res.loading'), 'a busy row until the counts arrive');
  await first.pending; await settle();
  assert.equal(kindReads, before + 1, 'read once');
  for (const name of ['wake.scope.kindMenu', 'wake.scope.nsMenu']) {
    const def = page.menus[name](), rows = def.items.filter(i => i.checkbox);
    assert.ok(!def.pending && def.items[0].type === 'search' && def.items[1].type === 'bulk', `${name}: search, the tri-state all row`);
    assert.ok(rows.length && rows.every(i => i.box && i.icon), `${name}: rows of checkbox and icon`);
    assert.ok(!JSON.stringify(def).includes('wake.rv.badN'), `${name}: no problem badge`);
  }
  const kinds = page.menus['wake.scope.kindMenu']().items.filter(i => i.checkbox), label = id => kinds.find(i => i.arg.value === id).label.raw;
  assert.equal(label('deployments'), 'Deployment · 1', 'objects of the kind in the chosen namespaces');
  const secret = page.menus['wake.scope.kindMenu']().items.find(i => i.id === 'secrets');
  assert.ok(secret && !secret.checkbox && secret.disabled && secret.icon === 'lock' && secret.label.raw === 'Secret · wake.rv.noPerm', 'Secret: a locked row that says why, not a choice');
  const ns = page.menus['wake.scope.nsMenu']().items.filter(i => i.checkbox);
  assert.equal(ns.find(i => i.arg.value === 'shop').label.raw, 'shop · 2', 'objects of the chosen kinds in the namespace');
  assert.equal(ns.find(i => i.arg.value === 'shop').icon, 'k8s-namespace');
});

/* A-25 · C-14 · C-15: 종류 메뉴는 워크로드 → 네트워크 → 저장소·구성 순서이고, 읽을 수 없는 종류(Secret: Wake는 읽지 않음, RULE-SECRET)는 자물쇠 줄로만 남아 고를 수 없고
   "전체"에 들지 않는다. 모두 해제는 "거르지 않음"이므로 메뉴도 전부 체크로 돌아와 보이는 것과 적용된 것이 같다 */
test('scope_kind_menu_orders_kinds_by_group_and_never_chooses_a_kind_wake_cannot_read', async () => {
  const { page, settings } = await (await pageOf('./resource-list.js'))({ params: {} });
  await page.menus['wake.scope.kindMenu']().pending; await settle();
  const def = page.menus['wake.scope.kindMenu'](), order = def.items.filter(i => i.checkbox).map(i => i.arg.value);
  assert.deepEqual(order, ['nodes', 'deployments', 'statefulsets', 'daemonsets', 'replicasets', 'jobs', 'cronjobs', 'pods', 'horizontalpodautoscalers', 'services', 'ingresses', 'persistentvolumeclaims', 'configmaps'], 'kinds grouped, Secret not a choice');
  assert.equal(def.items.at(-1).id, 'secrets', 'the locked kind is the last row');
  page.actions['wake.scope.kinds']({ arg: { key: 'kinds', value: 'secrets' } }); await settle();
  assert.ok(!(settings()['wake.scope']?.[C_ID]?.kinds ?? []).includes('secrets'), 'Secret is never stored as a chosen kind');
  page.actions['wake.scope.kinds']({ arg: { key: 'kinds', values: [] }, bulk: 'none' }); await settle();
  assert.equal(settings()['wake.scope'][C_ID].kinds, null, 'nothing chosen is stored as no filter');
  const after = page.menus['wake.scope.kindMenu']().items.filter(i => i.checkbox);
  assert.ok(after.every(i => i.checked), 'no filter shows every kind checked, as the screen shows every kind');
});

/* A-24: 머리 아래 권한 줄은 지금 목록이 읽는 종류 가운데 읽지 못한 것만 말한다: Wake가 읽지 않는 Secret은 목록에 들지 않으니 그 안내도 없다 */
test('scope_permission_line_names_only_kinds_the_list_reads', async () => {
  const { page, html } = await (await pageOf('./resource-list.js'))({ params: {} });
  await page.init?.(); await settle();
  assert.doesNotMatch(html(), /wake\.rv\.limited/, 'no Secret permission line on a list that never reads Secret');
});

test('scope_labels_name_all_none_one_or_the_first_and_how_many_more', async () => {
  for (const [store, kindLabel, nsLabel] of [[{}, 'wake.scope.allKinds', 'wake.list.allNs'], [{ kinds: [], ns: [] }, 'wake.scope.allKinds', 'wake.list.allNs'], [{ kinds: ['pods'], ns: ['payments', 'shop'] }, 'Pod', 'wake.list.allNs'], [{ kinds: ['pods', 'deployments'], ns: ['shop'] }, 'wake.scope.more{&quot;name&quot;:&quot;Pod&quot;,&quot;n&quot;:1}', 'shop']]) {
    const { html } = await (await pageOf('./alerts.js'))({ settings: { 'wake.scope': { [C_ID]: store } } });
    const s = html(), box = s.slice(s.indexOf('class="cmp-tools"'), s.indexOf('data-composer-send'));
    const labels = [...box.matchAll(/class="v">([^<]*)</g)].map(m => m[1]);
    assert.deepEqual(labels, [kindLabel, nsLabel], JSON.stringify(store));
  }
});

test('scope_deployment_on_the_events_tab_includes_its_pods_events', async () => {
  const { html } = await (await pageOf('./resource-list.js'))({ params: { kind: 'events', ns: '_all' }, settings: scoped });
  const all = html(), s = all.slice(all.lastIndexOf('Last Seen')); /* the list (the timeline above keeps every mark, dimming what is out) */
  assert.ok(s.includes('Pod/payments-api-7c9f6-x2k4'), 'the Deployment\'s Pod event');
  assert.ok(s.includes('Deployment/payments-api'), 'the Deployment\'s own event');
  assert.ok(!s.includes('Pod/cart-5d4b8-q8m1'), 'another namespace\'s Pod event is out');
});

test('scope_kind_and_namespace_carry_over_and_the_text_stays_with_its_section', async () => {
  const home = await (await pageOf('./cluster-home.js'))({ route: { id: 'cluster' }, settings: {} });
  home.page.actions['wake.scope.kinds']({ arg: { values: ['deployments'] } });
  home.page.actions['wake.scope.ns']({ arg: { values: ['payments'] } });
  home.page.actions['kit.composer.send']({ id: 'wake-scope', text: 'payments-api' });
  const carried = home.settings();
  assert.deepEqual({ kinds: carried['wake.scope'][C_ID].kinds, ns: carried['wake.scope'][C_ID].ns }, { kinds: ['deployments'], ns: ['payments'] });
  const alerts = await (await pageOf('./alerts.js'))({ settings: carried });
  const s = alerts.html(), box = s.slice(s.indexOf('data-id="wake-scope"'), s.indexOf('data-composer-send'));
  assert.match(box, />Deployment</, 'the kind came along'); assert.match(box, />payments</, 'the namespace came along');
  assert.match(box, /<textarea[^>]*><\/textarea>/, 'the home text did not');
});

test('scope_resources_without_a_kind_list_every_kind_problems_first', async () => {
  const { html } = await (await pageOf('./resource-list.js'))({ params: {}, settings: { 'wake.scope': { [C_ID]: { kinds: null, ns: ['payments'] } } } });
  const s = html();
  assert.ok(s.includes('aria-label="wake.scope.allKinds"') || s.includes('>wake.scope.allKinds<'), 'one list of every kind');
  assert.ok(s.indexOf('payments-api-7c9f6-x2k4') > 0 && s.indexOf('payments-api-7c9f6-x2k4') < s.indexOf('>payments-api<'), 'the failing Pod first');
  assert.ok(!s.includes('cart-5d4b8-q8m1'), 'only the scope\'s namespaces');
});

test('scope_home_metric_rows_keep_their_cells_and_say_once_above_them_that_they_read_the_whole_cluster', async () => {
  /* a cell per row pushed the threshold cell out below 1060px: the rows keep value | range peak | threshold and the note stands once above them */
  const { html } = await (await pageOf('./cluster-home.js'))({ route: { id: 'cluster' }, settings: scoped });
  const s = html(), at = s.indexOf('>wake.scope.cluster<'), group = s.lastIndexOf('class="sbm"', at), next = s.indexOf('class="sbm"', at);
  assert.equal(s.split('>wake.scope.cluster<').length - 1, 1, 'said once');
  assert.ok(at > 0 && group >= 0 && !s.slice(group, at).includes('data-c="summary-bar"'), 'the first line of the metric rows\' group');
  /* A3-05: the note covers the four cluster rows only: its group holds them and nothing else, the rows that follow the scope (Pod flow first) are the next group */
  const own = s.slice(at, next);
  assert.equal(own.split('data-c="summary-bar"').length - 1, 4, 'the group of the note holds the four metric rows');
  assert.ok(!own.includes('wake.view.podFlow') && s.slice(next).includes('wake.view.podFlow'), 'the Pod flow, which follows the scope, is in the next group');
  const plain = await (await pageOf('./cluster-home.js'))({ route: { id: 'cluster' }, settings: {} });
  assert.ok(!plain.html().includes('wake.scope.cluster'), 'no scope, no note');
});

test('scope_two_kinds_on_resources_are_one_list_with_a_kind_column_problems_first', async () => {
  const { html } = await (await pageOf('./resource-list.js'))({ params: {}, settings: { 'wake.scope': { [C_ID]: { kinds: ['deployments', 'pods'], ns: null } } } });
  const s = html();
  assert.ok(s.includes('aria-label="Deployment · Pod"'), 'the list names the chosen kinds');
  assert.ok(s.includes('>Kind<'), 'a Kind column');
  assert.ok(s.includes('>payments-api<') && s.includes('>cart<'), 'the Deployments');
  const pod = s.indexOf('payments-api-7c9f6-x2k4');
  assert.ok(pod > 0 && pod < s.indexOf('>payments-api<') && pod < s.indexOf('>cart<'), 'the failing Pods first');
  assert.ok(!s.includes('payments-api-7c9f6<'), 'no ReplicaSet: only the chosen kinds');
});

test('scope_that_arrives_after_the_page_opened_still_reads_the_kind_relation', async () => {
  /* the shell sends the settings after the page has started: the box must read the Deployment's Pods then, not keep an empty relation */
  const logs = await (await pageOf('./logs.js'))({ settings: {} });
  logs.setSettings(scoped); logs.html(); await settle();
  const s = logs.html();
  assert.ok(!s.includes('wake.scope.noPod'), 'the scope has a Pod to read');
  assert.ok(s.includes('payments-api-7c9f6-x2k4'), 'the logs read the Deployment\'s Pod (not a loading skeleton that only lacks the no-Pod line)');
  const events = await (await pageOf('./resource-list.js'))({ params: { kind: 'events', ns: '_all' }, settings: {} });
  events.setSettings(scoped); events.html(); await settle();
  const list = events.html(); assert.ok(list.slice(list.lastIndexOf('Last Seen')).includes('Pod/payments-api-7c9f6-x2k4'));
});

/* A2-21: 1시간 구간인데 최근 1,000줄(tail)까지만 읽었다(kubectl은 2,542줄). 알약 "전체 993"은 구간 전체로 읽힌다: 읽은 줄의 수라고 말하고 부분 조회 줄을 보인다 */
test('logs_read_up_to_the_line_limit_count_as_loaded_lines_not_the_whole_range', async () => {
  const at = n => new Date(NOW - (1000 - n) * 1000).toISOString();
  FIXTURE.logs = async () => ({ text: Array.from({ length: 1000 }, (_, i) => `${at(i)} INFO request ${i}`).join('\n') });
  try {
    const logs = await (await pageOf('./logs.js'))({ settings: {} });
    logs.html(); await settle();
    const s = logs.html();
    const pills = s.slice(s.indexOf('wake.rv.level'), s.indexOf('wake.rv.level') + 1500);
    assert.doesNotMatch(pills, />wake\.list\.all</, 'the level pill does not call the loaded lines the whole range');
    assert.match(pills, /wake\.log\.loaded/, 'the pill says these are the loaded lines');
    assert.match(s, /wake\.log\.tailOnly\{&quot;n&quot;:&quot;1,000&quot;\}/, 'a partial line names the line limit');
    /* A3-06: the page footer under the lines says the same: lines read, not "1,000 in all" */
    assert.doesNotMatch(s, /wake\.rv\.logRange(?!Read)/, 'the footer does not call the read lines the whole');
    assert.match(s, /wake\.rv\.logRangeRead/, 'the footer counts the lines read');
  } finally { delete FIXTURE.logs; }
});

test('scope_deployment_leaves_out_a_pod_of_the_same_namespace_it_does_not_own', async () => {
  /* a StatefulSet Pod in the chosen namespace: same namespace, not a Deployment's — its event and its logs are out of a Deployment scope */
  const stray = { ...meta('Pod', 'payments', 'payments-db-0', 'p3', { apiVersion: 'apps/v1', kind: 'StatefulSet', name: 'payments-db', uid: 'ss1', controller: true }), status: ['danger', 'CrashLoopBackOff'], restarts: 1 };
  ROWS.pods.push(stray); EVENTS.push(ev('e4', 'Pod', 'payments', 'payments-db-0', 'BackOff'));
  try {
    const events = await (await pageOf('./resource-list.js'))({ params: { kind: 'events', ns: '_all' }, settings: scoped });
    const all = events.html(), list = all.slice(all.lastIndexOf('Last Seen'));
    assert.ok(list.includes('Pod/payments-api-7c9f6-x2k4'), 'the Deployment\'s own Pod event is in');
    assert.ok(!list.includes('Pod/payments-db-0'), 'a Pod of the same namespace the Deployment does not own is out of the events');
    const logs = await (await pageOf('./logs.js'))({ settings: scoped });
    const menu = JSON.stringify(logs.page.menus?.['wake.logs.podMenu']?.() ?? logs.html());
    assert.ok(!menu.includes('payments-db-0'), 'and out of the Pods the logs offer');
  } finally { ROWS.pods.pop(); EVENTS.pop(); }
});

/* 범위 상자 하나를 합성 문맥으로: 두 탭이 같은 설정을 나눈다(셸이 한 탭의 쓰기를 다른 탭에 보냄) */
const { scopeBox } = await import('./scope-box.js');
function boxOf({ get = (key, p) => (FIXTURE[key] ? FIXTURE[key](p) : Promise.reject(unconnected(key))), shared = { values: {} }, section = 'home', onRun } = {}) {
  const ctx = { t: (key, vars) => (vars ? `${key}${JSON.stringify(vars)}` : key), data: { get }, update() {}, settings: () => shared.values,
    api: { setSetting: (k, v) => { shared.values = { ...shared.values, [k]: v }; } } };
  return scopeBox(ctx, C_ID, section, { onRun });
}
const labels = def => def.items.map(item => (typeof item.label === 'object' ? item.label.raw : item.label));

test('scope_tabs_read_the_shared_settings_and_never_write_back_a_stale_copy', async () => {
  const shared = { values: {} }, runs = [];
  const a = boxOf({ shared }), b = boxOf({ shared, onRun: patch => runs.push(Object.keys(patch)) });
  await b.adopt({ ns: ['payments'] });
  await a.adopt({ kind: 'deployments' });
  assert.deepEqual(b.kinds(), ['deployments'], 'the other tab sees the kind chosen in this tab');
  b.actions['kit.composer.send']({ id: 'wake-scope', text: 'api' });
  const saved = shared.values['wake.scope'][C_ID];
  assert.deepEqual(saved.kinds, ['deployments'], 'a later write from the other tab keeps this tab\'s kind');
  assert.deepEqual(saved.ns, ['payments']);
  assert.equal(saved.q.home, 'api');
  /* a change from another tab reaches the page the same way as its own choice (page re-reads its rows) */
  runs.length = 0; await a.adopt({ ns: ['shop'] }); b.relation(); await settle();
  assert.deepEqual(runs, [['ns']]);
});

test('scope_relation_read_failure_keeps_its_reason_instead_of_an_empty_relation', async () => {
  const denied = Object.assign(new Error('forbidden'), { status: 403, kind: 'forbidden' });
  const box = boxOf({ get: (key, p) => (key === 'resources' && p.kind === 'replicasets' ? Promise.reject(denied) : FIXTURE[key](p)) });
  await box.adopt({ kind: 'deployments' });
  assert.equal(box.wait(), false);
  assert.equal(box.failure()?.kind, 'forbidden', 'a 403 on the owned ReplicaSets is a failure, not an empty owner chain');
});

test('scope_menu_count_failure_shows_the_reason_and_no_zero_counts', async () => {
  const box = boxOf({ get: (key, p) => (key === 'kinds' ? Promise.reject(Object.assign(new Error('timed out'), { kind: 'timeout' })) : FIXTURE[key](p)) });
  await box.init();
  box.menus['wake.scope.nsMenu'](); await settle();
  const ns = labels(box.menus['wake.scope.nsMenu']()), kinds = labels(box.menus['wake.scope.kindMenu']());
  assert.ok(!ns.some(label => / · 0$/.test(String(label))), `no fake zero: ${ns}`);
  assert.ok(ns.includes('wake.flow.c.timeout') && kinds.includes('wake.flow.c.timeout'), 'the menus say why there are no counts');
});

test('scope_home_waits_with_skeletons_while_the_kind_relation_loads_and_shows_the_failure_after', async () => {
  let release, fail = false;
  const gate = new Promise(resolve => { release = resolve; });
  const hold = FIXTURE.resources;
  FIXTURE.resources = async p => { if (p.kind === 'replicasets') { await gate; if (fail) throw Object.assign(new Error('forbidden'), { status: 403 }); } return hold(p); };
  try {
    const home = await (await pageOf('./cluster-home.js'))({ route: { id: 'cluster' }, settings: { 'wake.scope': { [C_ID]: { kinds: ['deployments'], ns: null } } } });
    const s = home.html();
    assert.ok(!/wake\.home\.badPods<\/span><b>0<\/b>/.test(s) && !/wake\.home\.badPods<\/b><\/span><span[^>]*><b>0<\/b>/.test(s), 'no 0 bad Pods while the relation loads');
    assert.match(s, /wake\.home\.badPods<\/span><b><span class="skel"/, 'skeleton in the value place while the relation loads');
    fail = true; release(); await settle();
    const after = home.html();
    assert.ok(after.includes('wake.flow.c.forbidden'), 'the relation failure is said with its reason');
  } finally { FIXTURE.resources = hold; }
});

test('scope_logs_relation_failure_shows_the_reason_instead_of_no_pod', async () => {
  const hold = FIXTURE.resources;
  FIXTURE.resources = async p => { if (p.kind === 'replicasets') throw Object.assign(new Error('forbidden'), { status: 403, kind: 'forbidden' }); return hold(p); };
  try {
    const logs = await (await pageOf('./logs.js'))({ settings: { 'wake.scope': { [C_ID]: { kinds: ['deployments'], ns: null } } } });
    await settle();
    const s = logs.html();
    assert.ok(s.includes('wake.monitor.status.forbidden'), 'the logs section says the relation read was denied');
    assert.ok(!s.includes('wake.scope.noPod'), 'a denied relation is not "no Pod in scope"');
  } finally { FIXTURE.resources = hold; }
});

/* C-02 나머지: 네트워크 · GitOps · 이벤트도 범위 관계를 읽지 못하면 빈 목록 대신 원인과 다시 시도, 다시 시도는 관계를 다시 읽는다 */
test('scope_network_gitops_events_relation_failure_shows_the_reason_and_retry_instead_of_an_empty_list', async () => {
  const hold = FIXTURE.resources, holdNet = FIXTURE.network, holdGit = FIXTURE.gitops;
  let denied = true;
  FIXTURE.resources = async p => { if (p.kind === 'replicasets' && denied) throw Object.assign(new Error('forbidden'), { status: 403, kind: 'forbidden' }); return hold(p); };
  FIXTURE.network = async () => ({ at: iso(NOW), range: { from: NOW - 60 * MIN, to: NOW }, step: 15, queries: { rx: 'rx', tx: 'tx' }, rx: [{ metric: { namespace: 'payments', service: 'payments-api' }, values: [[NOW / 1000, '2048']] }], tx: [], ingress: [] });
  FIXTURE.gitops = async () => ({ access: 'ok', controllers: {}, repos: [{ id: 'r', apps: [{ name: 'payments-app', kind: 'Application', controller: 'argocd', cluster: C_ID, ns: 'payments', sync: 'Synced', health: 'Healthy' }] }] });
  const retry = { network: 'wake.net.retry', gitops: 'wake.git.retry', events: 'wake.list.retry' };
  try {
    for (const [section, file, o] of [['network', './network.js', {}], ['gitops', './gitops.js', {}], ['events', './resource-list.js', { params: { kind: 'events', ns: '_all' } }]]) {
      denied = true;
      const view = await (await pageOf(file))({ ...o, settings: { 'wake.scope': { [C_ID]: { kinds: ['deployments'], ns: null } } } });
      await settle();
      const s = view.html();
      assert.ok(s.includes('wake.monitor.status.forbidden'), `${section}: the relation failure is shown with its reason`);
      assert.ok(s.includes(`data-action="${retry[section]}"`), `${section}: with a retry`);
      denied = false; await view.page.actions[retry[section]](); await settle();
      assert.ok(!view.html().includes('wake.monitor.status.forbidden'), `${section}: retry reads the relation again`);
    }
  } finally { FIXTURE.resources = hold; FIXTURE.network = holdNet; FIXTURE.gitops = holdGit; }
});

/* 실제 앱: 종류를 Deployment 하나에서 다섯으로 넓혀도 탭 이름이 "Deployments"로 남았다(메타는 처음 열 때만 보냄). 범위가 바뀌면 탭 이름도 지금 목록을 말한다 */
test('resource_tab_name_follows_the_scope_kinds_after_they_change', async () => {
  const sent = [];
  const open = await (await pageOf('./resource-list.js'));
  const { page, ctx } = await open({ params: {}, settings: { 'wake.scope': { [C_ID]: { kinds: ['deployments'], ns: ['payments'] } } } });
  ctx.api.setMeta = m => sent.push(m.title);
  page.actions['wake.scope.kinds']({ value: 'pods' }); await settle();
  assert.equal(sent.at(-1), 'wake.view.resources', `two kinds: the tab is the resources list, not the first kind (${JSON.stringify(sent)})`);
});

/* A3-13: with the namespace orders chosen every Node of the cluster stayed in the list (a Node has no namespace): a Node is in a namespace scope when
   a Pod of that namespace runs on it (SCR-SEARCH-SCOPE, Node→Pod), and the kind menu counts the same Nodes */
test('scope_namespace_keeps_only_the_nodes_its_pods_run_on_and_counts_them_alike', async () => {
  const nodes = [meta('Node', '', 'worker-a', 'n1'), meta('Node', '', 'worker-b', 'n2')];
  const pods = PODS.map((p, i) => ({ ...p, node: i ? 'worker-b' : 'worker-a' }));
  const saved = { nodes: ROWS.nodes, pods: ROWS.pods }; ROWS.nodes = nodes; ROWS.pods = pods;
  try {
    const { html } = await (await pageOf('./resource-list.js'))({ params: {}, settings: { 'wake.scope': { [C_ID]: { kinds: ['nodes'], ns: ['payments'] } } } });
    const s = html();
    assert.ok(s.includes('>worker-a<'), 'the Node a payments Pod runs on');
    assert.ok(!s.includes('>worker-b<'), 'not the Node only shop Pods run on');
    const all = await (await pageOf('./resource-list.js'))({ params: {}, settings: { 'wake.scope': { [C_ID]: { kinds: null, ns: ['payments'] } } } });
    assert.ok(!all.html().includes('>worker-b<'), 'nor in the list of every kind');
    const mixed = await (await pageOf('./resource-list.js'))({ params: {}, settings: { 'wake.scope': { [C_ID]: { kinds: ['nodes', 'deployments'], ns: ['payments'] } } } });
    const m = mixed.html();
    assert.ok(m.includes('>worker-a<') && !m.includes('>worker-b<'), 'a list of Nodes and other kinds reads the Pods it needs for that');
  } finally { ROWS.nodes = saved.nodes; ROWS.pods = saved.pods; }
  const { scopeCounts } = await import('../data/scope.js');
  assert.equal(scopeCounts([{ plural: 'nodes', cluster: true, readStatus: 'ok', count: 2, byNs: {}, namesByNs: { payments: ['worker-a'], shop: ['worker-b'] } }], { ns: ['payments'] }).kind.nodes, 1, 'the menu counts the same Node');
});

/* R4-05: the events of a Node (cluster wide, no namespace) follow the same Node→Pod rule as the list (A3-13): with a namespace chosen,
   only the Nodes its Pods run on — not every Node's events in every namespace */
test('scope_namespace_keeps_the_events_of_only_the_nodes_its_pods_run_on', async () => {
  const pods = PODS.map((p, i) => ({ ...p, node: i ? 'worker-b' : 'worker-a' }));
  const saved = ROWS.pods; ROWS.pods = pods;
  EVENTS.push(ev('n1', 'Node', '', 'worker-a', 'NodeHasDiskPressure'), ev('n2', 'Node', '', 'worker-b', 'NodeNotReady'));
  try {
    const events = await (await pageOf('./resource-list.js'))({ params: { kind: 'events', ns: '_all' }, settings: { 'wake.scope': { [C_ID]: { kinds: null, ns: ['payments'] } } } });
    events.html(); await settle(); await settle();
    const s = events.html(), list = s.slice(s.lastIndexOf('Last Seen'));
    assert.ok(list.includes('Node/worker-a'), 'the event of the Node a payments Pod runs on');
    assert.ok(!list.includes('Node/worker-b'), 'not the event of a Node only shop Pods run on');
  } finally { ROWS.pods = saved; EVENTS.splice(-2); }
});

/* A3-19: no event in the scope drew a large centred icon while alerts and incidents with nothing to show keep their card with a one-line empty state:
   the events screen is the same card (its head counts 0) with the same line */
test('events_with_nothing_in_scope_keep_their_card_with_a_one_line_empty_state_like_alerts_and_incidents', async () => {
  const events = await (await pageOf('./resource-list.js'))({ params: { kind: 'events', ns: '_all' }, settings: { 'wake.scope': { [C_ID]: { kinds: null, ns: ['nowhere'] } } } });
  events.html(); await settle(); await settle();
  const s = events.html();
  assert.match(s, /<p class="empty-line" data-c="empty-state">wake\.res\.noEvents<\/p>/, 'the one-line empty state');
  assert.ok(s.lastIndexOf('data-c="summary-bar"', s.indexOf('wake.res.noEvents')) > 0, 'inside the events card');
  assert.doesNotMatch(s, /class="empty"[^>]*>[^]*wake\.res\.noEvents/, 'not the large centred one');
});
