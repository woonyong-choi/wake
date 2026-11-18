/*
 * 도구 상태 판단 하나(conn-view toolViews)를 쓰는 화면들이 같은 입력에서 같은 말을 하는지: 홈 칩, 홈 연결 카드, 위쪽 도구 메뉴, 클러스터 도구 목록, 도구 상세, 설정 › 도구.
 * 입력 매트릭스: 허브 출처 상태(값 · 거절 · 아직) × 도구 열거(값 · 거절) × 연결 근거(연결 기록 · 찾기 확인 근거만 · 없음), 그리고 실패에서 즉시 복구.
 * 기대값은 판단 함수에 같은 입력을 넣은 결과이고, 각 화면의 실제 출력(그린 마크업·정의)이 그것과 같아야 한다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import config from './app.config.js';
import { unconnected } from './data/index.js';
import { toolViews, read } from './data/conn-view.js';
import { extendIcons, extendGlyphs } from '../../kit/index.js';
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
extendGlyphs(config.icons.glyphs); extendIcons(config.icons.map);

/* 페이지 모듈을 bootPage 없이 만드는 함수로 읽음(시험 안에서만) */
async function pageFactory(file) {
  let create;
  globalThis.captureSurface = (_, c) => { create = c; };
  const source = (await readFile(new URL(file, import.meta.url), 'utf8'))
    .replaceAll(/from '([^']+)'/g, (_, path) => `from '${new URL(path, new URL(file, import.meta.url)).href}'`)
    .replace('bootPage(config,', 'globalThis.captureSurface(config,');
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  delete globalThis.captureSurface;
  return create;
}
const createHome = await pageFactory('./pages/cluster-home.js');
const createTools = await pageFactory('./pages/tools.js');
const createDetail = await pageFactory('./pages/tool-detail.js');
const settingsTools = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'tools');
const tick = () => new Promise(r => setImmediate(r));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

let CLUSTER = 'surface-context', serial = 0;
const TOOL = { kind: 'prometheus', selection: 'unverified', state: 'found', ready: 1, svc: 'monitoring/kps-prometheus:9090', ns: 'monitoring', uid: 'svc-uid-1' };
const VERIFIED = { ...TOOL, selection: 'verified' }; // 찾기가 확인한 같은 Service(UID 같음)
const HUB_STATE = { state: 'error' }; // 허브가 읽은 값: 지금 끊김
const BOOM = Object.assign(new Error('surface read refused'), { kind: 'unavailable' });

/* 한 입력: hub 'ok'|'failed'|'unread', inventory 'ok'|'failed', evidence 'record'(연결 기록)|'found'(찾기 확인 근거만, 연결 기록 없음)|false */
function world(input) {
  const { hub, inventory, evidence } = input;
  CLUSTER = `surface-${hub}-${inventory}-${evidence}-${++serial}`; // 설정의 클러스터별 읽기는 잠깐 다시 쓰므로 입력마다 다른 클러스터
  const settings = evidence === 'found' ? { 'wake.tools.found': { [`${CLUSTER}-prometheus`]: { cluster: CLUSTER, kind: 'prometheus', uid: 'svc-uid-1', ns: 'monitoring', svc: 'kps-prometheus', at: '2026-11-16T00:00:00.000Z' } } }
    : evidence ? { 'wake.connections': { [`${CLUSTER}-prometheus`]: { target: `${CLUSTER}-prometheus`, method: 'tool-open', kind: 'tool', where: { cluster: CLUSTER, tool: { kind: 'prometheus' } } } },
    'wake.conn.live': { [`${CLUSTER}-prometheus`]: { state: 'connected' } } } : {};
  const never = new Promise(() => {}), tool = evidence === 'found' ? VERIFIED : TOOL;
  const get = async key => {
    if (key === 'clusterTools') { if (inventory === 'failed') throw BOOM; return [tool]; }
    if (key === 'sourceStates') { if (hub === 'failed') throw BOOM; if (hub === 'unread') return never; return { prometheus: HUB_STATE }; }
    if (key === 'toolAccess') return { access: 'ok' };
    if (key === 'toolKinds') return [{ id: 'prometheus', name: 'Prometheus', icon: 'brand-prometheus', role: 'metrics' }];
    if (key === 'cluster') return { id: CLUSTER, state: 'ok' };
    if (key === 'agent') return { lookup: 'absent', installed: false };
    throw unconnected(key);
  };
  const expected = toolViews({ cluster: CLUSTER, settings, inventory: inventory === 'failed' ? read.failed(BOOM) : read.ok([tool]),
    hub: hub === 'failed' ? read.failed(BOOM) : hub === 'unread' ? read.unread() : read.ok({ prometheus: HUB_STATE }) });
  return { input, settings, tool, data: { get }, expected: expected.views.find(v => v.kind === 'prometheus') ?? { included: false }, set: expected };
}
const ctxOf = (w, extra = {}) => ({ params: { cluster: CLUSTER, ...extra.params }, route: { id: extra.route ?? 'cluster' }, query: {}, data: w.data, t: (k, v) => (v ? `${k}${JSON.stringify(v)}` : k),
  update() {}, settings: () => w.settings, desktopInfo: () => null, state: () => ({ q: '', range: { preset: '1h' } }), setState() {}, api: { navigate() {}, setMeta() {}, setSetting(k, v) { w.settings = { ...w.settings, [k]: v }; } } });

const KIND = { ok: 'ok', limited: 'warn', perm: 'perm', idle: 'idle', error: 'error', busy: 'busy' };
const DOT = { ok: 'ok', limited: 'warn', perm: 'warn', error: 'critical' }; // 메뉴 줄의 점(건강 -> 점, 확인 중·연결 안 됨은 점 없음)
/* 각 화면의 실제 출력에서 Prometheus의 포함 여부와 상태 */
async function surfaces(w) {
  const out = {};
  /* 위쪽 도구 메뉴(셸의 메뉴 정의): 같은 입력을 서비스 호스트 흉내로 줌 */
  const before = globalThis.kitService;
  globalThis.kitService = { on() { return () => {}; }, call: async name => {
    /* 열거 실패는 서비스가 실제로 돌려주는 모양(빈 목록 + access)으로: 자료 층이 거절로 바꿔야 함 */
    if (name === 'tools.find') return w.input.inventory === 'failed' ? { list: [], access: 'unknown', error: 'surface read refused' } : { list: [w.tool], access: 'ok' };
    if (name === 'hub.sources') { if (w.input.hub === 'failed') throw BOOM; if (w.input.hub === 'unread') return new Promise(() => {}); return { sources: w.hubSources ?? { prometheus: HUB_STATE } }; }
    if (name === 'kube.read') return { contexts: [{ id: CLUSTER }] };
    return {}; } };
  try {
    let m = config.menus['wake.tools']({ route: 'cluster', cluster: CLUSTER }, { settings: w.settings }, {});
    if (m.pending) { await m.pending; await settle(); m = config.menus['wake.tools']({ route: 'cluster', cluster: CLUSTER }, { settings: w.settings }, {}); }
    const it = m.items.find(i => i.id === 'tool-prometheus');
    out.menu = it ? { included: true, dot: it.dot ?? null, open: !!it.submenu?.items?.some(i => i?.id === 'tm-open') } : { included: false, failure: m.items.some(i => i.id === 'tools-failed') };
  } finally { globalThis.kitService = before; }
  const home = await createHome(ctxOf(w)); await home.init?.(); await settle(); home.render(); await settle();
  const h = home.render().s;
  const chip = h.match(/<div class="srcc" data-c="source-chips">[\s\S]*?<\/div>/)?.[0]?.match(/class="srcc-chip" data-state="(\w+)" data-action="wake.home.source" data-arg="&quot;prometheus&quot;"/);
  out.chip = chip ? { included: true, health: chip[1] } : { included: false };
  const card = h.match(/aria-label="wake.view.conn"[\s\S]*?<\/details>/)?.[0] ?? '';
  const row = card.match(/data-arg="&quot;prometheus&quot;"[\s\S]*?(?=<\/button>)/)?.[0];
  out.card = row ? { included: true, kind: row.match(/class="sti (\w+)/)?.[1] ?? 'ok', failure: /wake.find.c.read/.test(card) } : { included: false, failure: /wake.find.c.read|wake.flow.a.retry/.test(card) };
  const tools = await createTools(ctxOf(w, { route: 'tools' })); await tools.init?.(); await settle();
  const ts = tools.render().s, trow = ts.match(/data-key="prometheus"[\s\S]*?<\/div><\/div>|data-c="connection-row"[^>]*data-key="prometheus"[\s\S]*?data-c="status-icon"[^>]*/)?.[0];
  out.tools = trow ? { included: true, kind: trow.match(/class="sti (\w+)/)?.[1], failure: /wake.find.c.read/.test(ts), open: /wake.tool.open/.test(trow) } : { included: false, failure: /wake.find.c.read|wake.flow.a.retry/.test(ts) };
  const detail = await createDetail(ctxOf(w, { route: 'tool', params: { tool: 'prometheus' } })); await detail.init?.(); await settle();
  const ds = detail.render().s, head = ds.match(/data-c="page-header"[\s\S]*?<\/header>/)?.[0] ?? '';
  out.detail = { kind: head.match(/class="sti (\w+)/)?.[1] ?? null };
  let all = settingsTools.sections({ settings: () => ({ ...w.settings, 'wake.clusters.list': [{ id: CLUSTER, state: 'ok' }] }), data: w.data, fresh: true });
  for (let i = 0; i < 3 && all.some(s => s.pending); i++) { await Promise.race([Promise.all(all.map(s => s.pending)), new Promise(r => setTimeout(r, 300))]); all = settingsTools.sections({ settings: () => ({ ...w.settings, 'wake.clusters.list': [{ id: CLUSTER, state: 'ok' }] }), data: w.data }); }
  const srow = all.find(s => s.tab === 'clusters')?.groups?.flat().find(r => r.id === `tool-${CLUSTER}-prometheus`);
  out.settings = { kind: srow?.connection?.kind ?? null, action: srow?.connection?.action?.action ?? null, open: JSON.stringify(srow?.connection ?? null).includes('wake.tool.open'), description: srow?.description?.raw ?? srow?.description ?? null, failure: JSON.stringify(all).includes('kit.settings.reload') };
  return out;
}

const MATRIX = [];
for (const hub of ['ok', 'failed', 'unread']) for (const inventory of ['ok', 'failed']) for (const evidence of ['record', 'found', false]) MATRIX.push({ hub, inventory, evidence });

for (const input of MATRIX) {
  test(`tool_surfaces_agree hub=${input.hub} inventory=${input.inventory} evidence=${input.evidence}`, async () => {
    const w = world(input), e = w.expected, s = await surfaces(w), name = JSON.stringify(input);
    /* 연결 근거(연결 기록·찾기 확인 근거)가 있으면 열거·허브가 실패해도 포함(판단 함수 자체가 그렇게 말해야 화면 비교가 의미 있음) */
    assert.equal(!!e.included, !!input.evidence, `judgement ${name}`);
    /* 포함: 홈 칩·카드·도구 목록은 판단 함수의 included와 같음(연결 근거 없는 도구는 어디에도 없음) */
    assert.equal(s.chip.included, !!e.included, `chip ${name}`);
    assert.equal(s.card.included, !!e.included, `card ${name}`);
    assert.equal(s.tools.included, !!e.included, `tools ${name}`);
    assert.equal(s.menu.included, !!e.included, `menu ${name}`);
    if (e.included) {
      /* 건강: 같은 입력이면 같은 상태(과거 연결 기록 connected가 있어도 허브 실패·끊김을 정상으로 덮지 않음) */
      assert.equal(s.chip.health, e.health, `chip health ${name}`);
      assert.equal(s.card.kind, KIND[e.health], `card health ${name}`);
      assert.equal(s.tools.kind, KIND[e.health], `tools health ${name}`);
      assert.equal(s.detail.kind, KIND[e.health], `detail health ${name}`);
      assert.equal(s.menu.dot ?? null, DOT[e.health] ?? null, `menu health ${name}`);
      assert.notEqual(e.health, 'ok', 'no input here makes the tool healthy');
    }
    /* 열거 실패는 0개가 아님: 카드·목록에 실패와 다시 시도 */
    if (input.inventory === 'failed' && !e.included) { assert.ok(s.card.failure, `card failure ${name}`); assert.ok(s.tools.failure, `tools failure ${name}`); assert.ok(s.menu.failure, `menu failure ${name}`); }
    if (input.inventory === 'ok' && input.hub !== 'unread') assert.equal(s.settings.kind, e.included ? KIND[e.health] : null, `settings ${name}`);
    if (input.inventory === 'failed' && input.hub !== 'unread') assert.ok(s.settings.failure, `settings failure ${name}`);
    /* 열거를 읽지 못해도 연결 근거(연결 기록·찾기 확인 근거)가 있는 도구는 설정에도 같은 건강으로 남음 */
    if (input.inventory === 'failed') assert.equal(s.settings.kind, e.included ? KIND[e.health] : null, `settings kept ${name}`);
  });
}

test('tool_surfaces_recover_together_after_the_hub_and_the_inventory_answer_again', async () => {
  const failing = world({ hub: 'failed', inventory: 'failed', evidence: 'record' });
  const down = await surfaces(failing);
  assert.equal(down.chip.health, 'error'); assert.equal(down.tools.kind, 'error'); assert.equal(down.detail.kind, 'error');
  /* 즉시 복구: 허브가 정상(ready)을 주면 모든 화면이 정상 */
  const ok = world({ hub: 'ok', inventory: 'ok', evidence: 'record' });
  ok.tool = VERIFIED;
  ok.hubSources = { prometheus: { state: 'ready' } };
  const get = ok.data.get; ok.data.get = async key => (key === 'sourceStates' ? ok.hubSources : key === 'clusterTools' ? [VERIFIED] : get(key));
  const up = await surfaces(ok);
  assert.equal(up.chip.health, 'ok'); assert.equal(up.menu.dot, 'ok'); assert.equal(up.card.kind, 'ok'); assert.equal(up.tools.kind, 'ok'); assert.equal(up.detail.kind, 'ok'); assert.equal(up.settings.kind, 'ok'); assert.equal(up.tools.open, true); // 열거에 있으면 열기
});

test('tool_surfaces_keep_a_tool_the_finder_verified_after_the_inventory_starts_failing', async () => {
  /* 연결 기록 없이 찾기가 확인한 도구: 열거가 오면 화면이 확인 근거를 남기고, 그 뒤 열거가 실패해도 여섯 화면 모두 남음 */
  const w = world({ hub: 'ok', inventory: 'ok', evidence: false });
  w.tool = VERIFIED; const get = w.data.get; w.data.get = async key => (key === 'clusterTools' ? [VERIFIED] : get(key));
  await surfaces(w);
  assert.equal(w.settings['wake.tools.found']?.[`${CLUSTER}-prometheus`]?.uid, 'svc-uid-1', 'an ok read stores the verified receipt');
  w.input = { ...w.input, inventory: 'failed' }; w.data.get = async key => { if (key === 'clusterTools') throw BOOM; return get(key); };
  const s = await surfaces(w);
  assert.equal(s.chip.included, true); assert.equal(s.card.included, true); assert.equal(s.tools.included, true); assert.equal(s.menu.included, true);
  /* 설정은 같은 클러스터의 성공한 읽기를 10초 다시 쓰므로 여기서는 포함만 본다(설정의 열거 실패 × 찾기 확인 근거는 위 매트릭스의 evidence=found) */
  assert.equal(s.detail.kind, 'error'); assert.equal(s.settings.kind, 'error'); assert.ok(s.tools.failure); assert.ok(s.card.failure);
});

test('surfaces_offer_no_open_for_a_healthy_tool_they_cannot_enumerate_now', async () => {
  /* 허브는 정상이라 하지만 열거를 못 읽어 열 대상(바인딩)이 없음: 찾기 확인 도구 줄에 열기가 없고, 다시 시도는 실패 줄 하나 */
  const w = world({ hub: 'ok', inventory: 'failed', evidence: 'found' });
  w.hubSources = { prometheus: { state: 'ready' } };
  const get = w.data.get; w.data.get = async key => (key === 'sourceStates' ? w.hubSources : get(key));
  const s = await surfaces(w);
  assert.equal(s.settings.kind, 'ok'); assert.equal(s.settings.action, null); assert.ok(s.settings.failure); assert.equal(s.chip.health, 'ok');
  assert.equal(s.tools.kind, 'ok'); assert.equal(s.tools.open, false); assert.ok(s.tools.failure);
});

test('the_tools_menu_reads_again_once_its_last_good_answer_is_old_instead_of_showing_it', async () => {
  /* 성공한 메뉴 결과가 10초를 넘으면, 그 뒤 열거가 실패할 때 오래된 정상 목록을 다시 보이지 않고 새로 읽어 실패 줄을 보임 */
  const w = world({ hub: 'ok', inventory: 'ok', evidence: 'found' });
  const realNow = Date.now; let shift = 0; Date.now = () => realNow() + shift;
  try {
    await surfaces(w);
    shift = 11000; w.input = { ...w.input, inventory: 'failed' };
    const before = globalThis.kitService;
    globalThis.kitService = { on() { return () => {}; }, call: async name => name === 'tools.find' ? { list: [], access: 'unknown' } : name === 'hub.sources' ? { sources: { prometheus: HUB_STATE } } : name === 'kube.read' ? { contexts: [{ id: CLUSTER }] } : {} };
    try {
      let m = config.menus['wake.tools']({ route: 'cluster', cluster: CLUSTER }, { settings: w.settings }, {});
      assert.ok(m.pending, 'an old answer is read again');
      await m.pending; await settle(); m = config.menus['wake.tools']({ route: 'cluster', cluster: CLUSTER }, { settings: w.settings }, {});
      assert.ok(m.items.some(i => i.id === 'tools-failed')); assert.ok(m.items.some(i => i.id === 'tool-prometheus'));
    } finally { globalThis.kitService = before; }
  } finally { Date.now = realNow; }
});

test('a_verified_tool_stays_on_every_surface_while_the_same_service_cannot_be_verified_and_comes_back', async () => {
  /* 정상 찾기(verified) -> 같은 Service UID인데 Endpoints 403 · 일시 오류로 unverified -> 복구. 저장 근거와 같은 UID라 여섯 화면 모두 남고, 그 동안 열기는 없고 사유가 보임 */
  const realNow = Date.now; let shift = 0; Date.now = () => realNow() + shift;
  try {
    const w = world({ hub: 'ok', inventory: 'ok', evidence: false });
    w.hubSources = { prometheus: { state: 'ready' } };
    let row = VERIFIED; const get = w.data.get;
    w.data.get = async key => (key === 'clusterTools' ? [row] : key === 'sourceStates' ? w.hubSources : get(key));
    const step = async next => { row = next; w.tool = next; shift += 11000; return surfaces(w); }; // 화면마다의 잠깐 다시 쓰기(10초)를 넘겨 새로 읽음
    const before = await step(VERIFIED);
    assert.equal(w.settings['wake.tools.found']?.[`${CLUSTER}-prometheus`]?.uid, 'svc-uid-1');
    assert.equal(before.tools.open, true);
    for (const denied of [{ ...TOOL, permission: { verb: 'get', resource: 'endpoints', namespace: 'monitoring' } }, { ...TOOL }]) {
      const s = await step(denied), name = JSON.stringify(denied.permission ?? 'transient');
      assert.equal(s.chip.included, true, `chip ${name}`); assert.equal(s.card.included, true, `card ${name}`);
      assert.equal(s.tools.included, true, `tools ${name}`); assert.equal(s.menu.included, true, `menu ${name}`);
      assert.notEqual(s.detail.kind, null, `detail ${name}`); assert.notEqual(s.settings.kind, null, `settings ${name}`);
      assert.equal(s.tools.open, false, `no open for an unverified binding ${name}`);
      assert.equal(s.menu.open, false, `menu: no open ${name}`); assert.equal(s.settings.open, false, `settings: no open ${name}`);
      assert.match(String(s.settings.description), denied.permission ? /wake.home.toolPermission|get endpoints/ : /wake.home.toolNotReady/, `settings reason ${name}`);
      assert.equal(w.settings['wake.tools.found']?.[`${CLUSTER}-prometheus`]?.uid, 'svc-uid-1', `evidence kept ${name}`);
      const set = toolViews({ cluster: CLUSTER, settings: w.settings, inventory: read.ok([denied]), hub: read.ok(w.hubSources) });
      assert.deepEqual(set.views[0].blocked, denied.permission ? { key: 'wake.home.toolPermission', vars: { permission: 'get endpoints' } } : 'wake.home.toolNotReady');
    }
    const after = await step(VERIFIED);
    assert.equal(after.tools.included, true); assert.equal(after.tools.open, true); assert.equal(after.menu.open, true); assert.equal(after.settings.open, true); assert.equal(after.chip.health, 'ok');
    /* 다른 UID거나 성공한 빈 목록이면 근거가 아님 */
    const other = await step({ ...TOOL, uid: 'svc-uid-2' });
    assert.equal(other.chip.included, false); assert.equal(other.tools.included, false); assert.equal(other.menu.included, false);
    assert.equal(other.settings.kind, null, 'settings do not retain the old receipt for a new unverified UID');
    assert.equal(w.settings['wake.tools.found']?.[`${CLUSTER}-prometheus`], undefined);
  } finally { Date.now = realNow; }
});

test('tool_detail_shows_the_inventory_failure_and_reads_again_even_when_the_hub_says_healthy', async () => {
  /* 저장 근거로 상세가 그려져도(허브 정상) 지금 열거 실패와 다시 시도가 보이고, 다시 시도는 실제로 열거를 다시 읽음 */
  const w = world({ hub: 'ok', inventory: 'failed', evidence: 'found' });
  const get = w.data.get; let reads = 0;
  w.data.get = async key => { if (key === 'clusterTools') reads++; return key === 'sourceStates' ? { prometheus: { state: 'ready' } } : get(key); };
  const detail = await createDetail(ctxOf(w, { route: 'tool', params: { tool: 'prometheus' } })); await detail.init?.(); await settle();
  const ds = detail.render().s;
  assert.match(ds.match(/data-c="page-header"[\s\S]*?<\/header>/)?.[0] ?? '', /class="sti ok/, 'health stays the hub value');
  assert.match(ds, /wake\.find\.c\.read/); assert.match(ds, /wake\.td\.retry/);
  assert.doesNotMatch(ds, /wake\.tool\.open/, 'nothing to open without a verified binding');
  const before = reads; await detail.actions['wake.td.retry'](); await settle();
  assert.equal(reads, before + 1, 'retry reads the inventory again');
});

test('tool_detail_recent_errors_order_by_time_before_display', async () => {
  const w = world({ hub: 'ok', inventory: 'ok', evidence: 'found' });
  const get = w.data.get, at = Date.parse('2026-11-17T00:00:00Z');
  w.data.get = async key => key === 'toolChecks' ? { at: new Date(at).toISOString(), samples: [], errors: [{ at: at - 1000, text: 'older-error' }, { at, text: 'newer-error' }] } : get(key);
  const detail = await createDetail(ctxOf(w, { route: 'tool', params: { tool: 'prometheus' } }));
  await settle();
  const markup = detail.render().s;
  assert.ok(markup.indexOf('newer-error') < markup.indexOf('older-error'));
});

test('tool_detail_failed_checks_do_not_claim_zero_errors_and_retry_recovers', async () => {
  const w = world({ hub: 'ok', inventory: 'ok', evidence: 'found' });
  const get = w.data.get;
  let failed = true;
  w.data.get = async key => {
    if (key !== 'toolChecks') return get(key);
    if (failed) throw Object.assign(new Error('checks timeout'), { kind: 'timeout' });
    return { at: '2026-11-17T00:00:00Z', samples: [], errors: [] };
  };
  const detail = await createDetail(ctxOf(w, { route: 'tool', params: { tool: 'prometheus' } }));
  await settle();
  const failedMarkup = detail.render().s;
  assert.doesNotMatch(failedMarkup, /wake\.tool\.noErrors/);
  assert.match(failedMarkup, /wake\.td\.retry/);
  failed = false;
  await detail.actions['wake.td.retry']();
  await settle();
  assert.match(detail.render().s, /wake\.tool\.noErrors/);
});

test('tool_detail_does_not_inherit_a_receipt_for_a_new_unverified_uid', async () => {
  const w = world({ hub: 'ok', inventory: 'ok', evidence: 'found' });
  const get = w.data.get;
  w.data.get = async key => key === 'clusterTools' ? [{ ...TOOL, uid: 'new-service' }] : get(key);
  const detail = await createDetail(ctxOf(w, { route: 'tool', params: { tool: 'prometheus' } }));
  await settle();
  assert.match(detail.render().s, /wake\.tool\.gone/);
  assert.doesNotMatch(detail.render().s, /wake\.tool\.recentErrors/);
});

test('incident_chips_use_connection_evidence_and_current_health_instead_of_failed_attempts', async () => {
  const createIncident = await pageFactory('./pages/incident-detail.js');
  const w = world({ hub: 'ok', inventory: 'ok', evidence: 'found' });
  const at = Date.parse('2026-11-17T00:00:00Z');
  const incident = { id: 'test-incident', number: 'INC-TEST', title: CLUSTER, cluster: CLUSTER, namespace: 'monitoring', severity: 'warning', phase: 'detected', detectedAt: at, now: at,
    oncall: { name: 'test' }, target: { namespace: 'monitoring', kind: 'Pod', name: 'test' }, alert: { source: 'Kubernetes', name: 'Test' },
    sources: [{ id: 'prometheus', name: 'Prometheus', state: 'ok' }, { id: 'tempo', name: 'Tempo', state: 'error' }],
    scope: [{ kind: 'Pod', name: 'healthy-first', status: ['ok', 'Running'] }, { kind: 'Pod', name: 'failed-last', status: ['danger', 'CrashLoopBackOff'] }], timeline: [], chain: { grade: 'insufficient', source: { kind: 'rule', name: 'test' }, cells: {} }, options: [], verify: { verifyFrom: null }, audit: [] };
  let inventory = [VERIFIED];
  const get = w.data.get;
  w.data.get = async key => key === 'incident' ? incident : key === 'clusterTools' ? inventory : get(key);
  const render = async () => { const page = await createIncident(ctxOf(w, { route: 'incident', params: { id: incident.id } })); await page.init(); await settle(); return page.render().s; };
  const ordered = [...(await render()).matchAll(/class="dt-lead-t"[^>]*>([^<]+)</g)].map(match => match[1]);
  assert.deepEqual(ordered, ['failed-last', 'healthy-first']);
  const markup = await render();
  const chips = markup.match(/data-c="source-chips">[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.doesNotMatch(chips, /Tempo/);
  assert.match(chips, /data-state="error"/);
  inventory = [{ ...TOOL, uid: 'new-service' }];
  assert.doesNotMatch(await render(), /data-c="source-chips"/);
});

/* A2-20: 설정 › 도구의 OpenCost 행은 비용 화면과 같은 한 사실(데스크톱의 OpenCost 연결 기록)을 말한다: 연결 안 됨이면 비용 화면과 같은 "연결 안 됨",
   연결되면 연결됨과 고른 Service. 이전에는 연결과 무관하게 비용 자료 설명("할당 추정 · 가격 출처 확인 안 됨")을 보여 연결된 것처럼 읽혔다 */
test('settings_opencost_row_says_the_same_connection_state_as_the_costs_screen', async () => {
  for (const [answer, want, kind] of [[{ status: 'unconfigured' }, 'wake.cost.unconfigured', null], [{ status: 'connected', service: 'opencost/opencost' }, 'opencost/opencost', 'ok']]) {
    const w = world({ hub: 'ok', inventory: 'ok', evidence: false });
    const get = w.data.get; w.data.get = async (key, p) => (key === 'costState' ? answer : get(key, p));
    const st = () => ({ ...w.settings, 'wake.clusters.list': [{ id: CLUSTER, state: 'ok' }] });
    let all = settingsTools.sections({ settings: st, data: w.data, fresh: true });
    for (let i = 0; i < 3 && all.some(s => s.pending); i++) { await Promise.race([Promise.all(all.map(s => s.pending)), new Promise(r => setTimeout(r, 300))]); all = settingsTools.sections({ settings: st, data: w.data }); }
    const row = all.find(s => s.tab === 'clusters')?.groups?.flat().find(r => r.id === `costs-${CLUSTER}`);
    const said = JSON.stringify(row?.description ?? null);
    assert.ok(said.includes(want), `${answer.status}: ${said}`);
    assert.ok(!said.includes('wake.cost.basis'), 'not the cost data caption');
    assert.equal(row?.control?.kind ?? null, kind, `${answer.status}: state mark`);
  }
});

/* A2-24: Loki 상세의 응답 지연 카드가 제목을 세 번(카드 머리·차트 제목·범례), 축은 "4000ms", 40분 자료에 6시간 축, 상태 칸은 말 없이 아이콘만이었다 */
test('tool_detail_latency_card_names_itself_once_reads_seconds_spans_its_data_and_says_the_state', async () => {
  const w = world({ hub: 'ok', inventory: 'ok', evidence: 'found' });
  const get = w.data.get, at = Date.now(), MIN = 60_000;
  const samples = Array.from({ length: 40 }, (_, i) => ({ at: at - (40 - i) * MIN, ms: i === 39 ? 1647 : 120 }));
  w.data.get = async key => key === 'toolChecks' ? { at: new Date(at).toISOString(), samples, errors: [] } : key === 'sourceStates' ? { prometheus: { state: 'ready' } } : get(key);
  const detail = await createDetail(ctxOf(w, { route: 'tool', params: { tool: 'prometheus' } })); await detail.init?.(); await settle();
  const s = detail.render().s;
  const card = s.slice(s.indexOf('aria-label="wake.tool.latencyChart"'), s.indexOf('aria-label="wake.tool.recentErrors"'));
  assert.equal([...card.matchAll(/>wake\.tool\.latencyChart</g)].length, 1, 'the card names itself once');
  assert.match(card, />1\.65s</, 'the head reads seconds');
  assert.doesNotMatch(s, /1,647ms/, 'no four-digit milliseconds anywhere');
  const chart = JSON.parse(card.match(/data-chart="([^"]*)"/)?.[1]?.replaceAll('&quot;', '"').replaceAll('&amp;', '&') ?? 'null');
  assert.ok(chart, 'a chart');
  assert.ok(chart.timeAxis.to - chart.timeAxis.from <= 45 * 60, `the time axis spans the 40 minutes of data, not 6 hours: ${(chart.timeAxis.to - chart.timeAxis.from) / 60} min`);
  const state = s.slice(s.indexOf('wake.tool.state'), s.indexOf('wake.tool.state') + 600);
  assert.match(state, /<\/span>source\.ok<\/span>/, 'the state cell says the state in visible words, not only an icon with an aria label');
});

/* B-13: while the tool detail reads (after a restart the tool list may take long, or not answer), its tab and header were named by the
   address's raw tool id ("loki"); the tool's own name (Loki) is known from the tool kinds without any read */
test('tool_detail_is_named_by_its_tool_kind_while_it_reads_not_by_the_raw_id', async () => {
  const w = world({ hub: 'unread', inventory: 'ok', evidence: false });
  w.data.get = () => new Promise(() => {});
  const detail = await createDetail(ctxOf(w, { route: 'tool', params: { tool: 'loki' } })); detail.init?.(); await settle();
  const meta = detail.meta();
  assert.equal(meta.title, 'Loki'); assert.equal(meta.context.title, 'Loki');
  assert.match(detail.render().s.match(/data-c="page-header"[\s\S]*?<\/header>/)?.[0] ?? '', />Loki</);
});

/* R4-12: the Loki detail opened at 12:55 still said "last success 12:55 · 197ms" at 13:09 while the tool list said "checked 13:07": the detail read
   its checks once. It reads them again on the live cadence of the other live screens (six live ticks), without going back to "reading", and its
   head and chart move to the new answer. The latency chart held its first and last samples on the plot edges (half a dot cut off): the time
   axis keeps half a sample step around the data */
test('tool_detail_reads_its_checks_again_on_the_live_cadence_and_its_axis_holds_the_edge_samples', async t => {
  const { mock } = await import('node:test');
  mock.timers.enable({ apis: ['setInterval'] });
  t.after(() => mock.timers.reset());
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { document: { documentElement: {} }, getComputedStyle: () => ({ getPropertyValue: k => (k === '--live-refresh-ms' ? '10000' : '') }) } });
  t.after(() => (prior ? Object.defineProperty(globalThis, 'window', prior) : delete globalThis.window));
  const w = world({ hub: 'ok', inventory: 'ok', evidence: 'found' });
  const get = w.data.get, MIN = 60_000, first = Date.parse('2026-11-18T12:55:00Z');
  let at = first, reads = 0;
  const answer = () => ({ at: new Date(at).toISOString(), samples: [{ at: first - 30 * MIN, ms: 110 }, { at: first - 29 * MIN, ms: 172 }, ...(at > first ? [{ at: first, ms: 197 }] : []), { at, ms: at > first ? 64 : 197 }], errors: [] });
  w.data.get = async (key, p) => { if (key === 'toolChecks') { reads++; return answer(); } return key === 'sourceStates' ? { prometheus: { state: 'ready' } } : get(key, p); };
  const detail = await createDetail(ctxOf(w, { route: 'tool', params: { tool: 'prometheus' } })); await detail.init?.(); await settle();
  const chartOf = s => JSON.parse(s.match(/data-chart="([^"]*)"/)?.[1]?.replaceAll('&quot;', '"').replaceAll('&amp;', '&') ?? 'null');
  const before = detail.render().s, axis = chartOf(before).timeAxis;
  assert.ok(axis.from < (first - 30 * MIN) / 1000 && axis.to > first / 1000, `the first and last samples sit inside the axis: ${axis.from}..${axis.to}`);
  assert.match(before, />197ms</);
  at = first + 14 * MIN;
  const base = reads;
  mock.timers.tick(60_000); await settle();
  assert.equal(reads, base + 1, 'the checks are read again after six live ticks');
  const after = detail.render().s;
  assert.match(after, />64ms</, 'the head reads the new latency');
  assert.doesNotMatch(after, /wake\.td\.retry|data-c="skeleton"/, 'no reading state while it refreshes');
  assert.ok(chartOf(after).timeAxis.to > at / 1000, 'the axis follows the new answer');
});

/* R5-04: 도구 목록의 "확인" 시각이 허브의 지난 성공(13:18)에 멈춰 상세의 마지막 성공(15:28)과 달랐고 다시 읽지도 않았다.
   목록도 상세와 같은 마지막 성공(확인 기록의 마지막 응답과 허브 성공 중 늦은 것)을 쓰고 같은 박자로 다시 읽는다 */
test('tools_list_check_time_is_the_detail_last_success_and_refreshes_on_the_same_cadence', async t => {
  const { mock } = await import('node:test');
  const { when } = await import('./pages/incident-parts.js');
  mock.timers.enable({ apis: ['setInterval'] });
  t.after(() => mock.timers.reset());
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { document: { documentElement: {} }, getComputedStyle: () => ({ getPropertyValue: k => (k === '--live-refresh-ms' ? '10000' : '') }) } });
  t.after(() => (prior ? Object.defineProperty(globalThis, 'window', prior) : delete globalThis.window));
  const w = world({ hub: 'ok', inventory: 'ok', evidence: 'found' });
  const get = w.data.get, MIN = 60_000, hubLast = Date.now() - 130 * MIN;
  let at = Date.now() - 2 * MIN;
  w.data.get = async (key, p) => (key === 'toolChecks' ? { at: new Date(at).toISOString(), samples: [{ at: at - MIN, ms: 40 }, { at, ms: 33 }], errors: [] }
    : key === 'sourceStates' ? { prometheus: { state: 'ready', lastSuccessAt: new Date(hubLast).toISOString() } } : get(key, p));
  const list = await createTools(ctxOf(w)); await list.init?.(); await settle(); await settle();
  const checkedAt = ms => `wake.tool.checkedAt${JSON.stringify({ at: when(ms, Date.now()) })}`.replaceAll('"', '&quot;');
  assert.ok(list.render().s.includes(checkedAt(at)), `the list says the detail's last success, not the hub's ${when(hubLast, Date.now())}`);
  at += 5 * MIN;
  mock.timers.tick(60_000); await settle(); await settle();
  assert.ok(list.render().s.includes(checkedAt(at)), 'the list reads the checks again on the live cadence');
});

/* R4-02: cluster › 에이전트 "설치" ran the install flow in the shell and this screen never showed it (the stop and its reason were only in settings),
   and it offered the install for a chart whose image this version does not carry. The row draws the install flow (steps, status, cause) from the
   same published flow state as settings, and says why instead of offering an install it cannot do */
test('cluster_agent_screen_shows_the_install_flow_and_offers_no_install_the_app_cannot_do', async () => {
  const createAgent = await pageFactory('./pages/agent.js');
  const w = world({ hub: 'ok', inventory: 'ok', evidence: false });
  const absent = { lookup: 'absent', installed: false, unknown: false };
  const draw = async agent => { const get = w.data.get; w.data.get = async (key, p) => (key === 'agent' ? agent : get(key, p));
    const page = await createAgent(ctxOf(w, { route: 'agent' })); page.init?.(); await settle(); w.data.get = get; return page; };
  const blocked = (await draw({ ...absent, installImage: { published: false, reason: 'agent_image_unpublished' } })).render().s;
  assert.doesNotMatch(blocked, /wake\.agent\.install/, 'no install to press');
  assert.match(blocked, /wake\.flow\.c\.imageUnpublished/, 'the row says why');
  const open = await draw(absent);
  assert.match(open.render().s, /wake\.agent\.install/, 'an install whose image state is unknown stays (the flow checks)');
  const steps = [{ id: 'perm', label: 'wake.flow.s.perm', state: 'fail' }, { id: 'install', label: 'wake.flow.s.install', state: 'wait' }];
  w.settings = { ...w.settings, 'wake.conn.live': { [`agent-${CLUSTER}`]: { steps, running: false, state: 'needs-perm', cause: { key: 'wake.flow.c.installForbidden', vars: {} }, kind: 'perm',
    status: { kind: 'perm', text: { key: 'wake.flow.c.installForbidden', vars: {} } }, raw: '', short: 'wake.conn.short.perm', actions: [{ label: 'wake.flow.a.perm', action: 'wake.flow.perm', arg: { key: `agent-${CLUSTER}` } }] } } };
  open.onSettings?.();
  const flow = open.render().s;
  assert.match(flow, /data-c="flow-status"[\s\S]*?wake\.conn\.short\.perm/, 'the stop in its words on this screen, as in settings');
  assert.match(flow, /wake\.flow\.perm/, 'with the action the stop calls for');
});

/* B-20: in the cluster tool list every row but Loki named when it was last checked: the hub's source state for Loki carries no last success,
   while the tool's own checks (the detail pane's latency samples) do. A row with no last success from the hub takes the last answered check */
test('tool_list_row_names_its_last_check_from_the_tool_checks_when_the_hub_has_none', async () => {
  const w = world({ hub: 'ok', inventory: 'ok', evidence: false });
  const loki = { kind: 'loki', selection: 'verified', state: 'found', ready: 1, svc: 'monitoring/loki:3100', ns: 'monitoring', uid: 'svc-uid-loki' };
  const at = Date.parse('2026-11-17T12:36:00Z');
  w.settings = { 'wake.tools.found': { [`${CLUSTER}-loki`]: { cluster: CLUSTER, kind: 'loki', uid: 'svc-uid-loki', ns: 'monitoring', svc: 'loki', at: '2026-11-16T00:00:00.000Z' } } };
  const base = w.data.get;
  w.data.get = async (key, p) => key === 'clusterTools' ? [loki] : key === 'sourceStates' ? { loki: { state: 'ready' } } : key === 'toolKinds' ? [{ id: 'loki', name: 'Loki', icon: 'brand-loki', role: 'logs' }]
    : key === 'toolChecks' ? (p.kind === 'loki' ? { at: new Date(at).toISOString(), samples: [{ at: at - 60000, ms: 80 }, { at, ms: 91 }] } : null) : base(key, p);
  const page = await createTools(ctxOf(w, { route: 'tools' })); page.init?.(); await settle();
  const row = page.render().s.match(/data-row-action="wake.tools.open"[\s\S]*?Loki[\s\S]*?<\/div>/)?.[0] ?? page.render().s;
  assert.match(row, /wake\.tool\.checkedAt/, 'the Loki row names its last check');
});
