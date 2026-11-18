/* H-009 갱신 경로 부하: 범위 관계는 같은 입력이면 한 번만 계산하고, 이벤트 타임라인은 표시마다 목록을 훑지 않으며,
   로그 따라가기와 홈의 출처 상태 갱신은 읽는 중에 다음 읽기를 쌓지 않고 숨은 문서에서 읽지 않는다. 이 파일 안의 합성 응답만 쓴다 */
import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { readFile } from 'node:fs/promises';
import config from '../app.config.js';
import { unconnected } from '../data/index.js';
import { extendIcons, extendGlyphs } from '../../../kit/index.js';
import { scopeBox } from './scope-box.js';
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
extendGlyphs(config.icons.glyphs); extendIcons(config.icons.map);
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { for (let i = 0; i < 12; i++) await tick(); };

const C_ID = 'fixture-context', NOW = Date.now(), iso = ms => new Date(ms).toISOString(), MIN = 60_000;
const t = (key, vars) => (vars ? `${key}${JSON.stringify(vars)}` : key);
const pod = (ns, name, i) => ({ kind: 'Pod', ns, name, uid: `p${i}`, labels: { app: name }, ownerReferences: [], owner: null, status: ['ok', 'Running'], age: '1d', containerList: [{ name: 'app' }] });

let imports = 0;
async function pageOf(file, fixture) {
  let create;
  globalThis.captureLivePage = (_, c) => { create = c; };
  const source = (await readFile(new URL(file, import.meta.url), 'utf8'))
    .replaceAll(/from '([^']+)'/g, (_, path) => `from '${new URL(path, import.meta.url).href}'`).replace(/bootPage\(config,/, 'globalThis.captureLivePage(config,') + `\n// live ${++imports}`;
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  delete globalThis.captureLivePage;
  return async ({ params = {}, query = {}, settings = {}, route } = {}) => {
    const data = { get: (key, p) => (fixture[key] ? fixture[key](p) : Promise.reject(unconnected(key))) };
    let state = {}, values = { ...settings };
    const ctx = { params: { cluster: C_ID, ...params }, query, route, data, t, update() {}, settings: () => values, desktopInfo: () => null,
      state: () => state, setState: patch => { state = { ...state, ...patch }; }, api: { navigate() {}, setMeta() {}, setSetting: (k, v) => { values = { ...values, [k]: v }; } } };
    const page = await create(ctx);
    state = { ...(page.screen?.state ?? {}) };
    await page.init?.(); await settle();
    return { page, ctx, html: () => String(page.render().s ?? page.render()) };
  };
}

test('scope_relation_is_computed_once_for_the_same_inputs_not_once_per_row', async () => {
  let scans = 0;
  const pods = Array.from({ length: 50 }, (_, i) => pod('payments', `api-${i}`, i));
  const counted = Object.assign([...pods], { filter(...a) { scans++; return Array.prototype.filter.apply(this, a); } });
  let values = { 'wake.scope': { [C_ID]: { kinds: ['pods'], ns: ['payments'] } } };
  const ctx = { t, data: { get: (key, p) => Promise.resolve(key === 'resources' && p.kind === 'pods' ? counted : []) }, update() {}, settings: () => values, api: { setSetting: (k, v) => { values = { ...values, [k]: v }; } } };
  const box = scopeBox(ctx, C_ID, 'network');
  await box.init(); await settle();
  scans = 0;
  const first = box.relation(), once = scans;
  for (let row = 0; row < 200; row++) assert.equal(box.relation(), first, 'the same relation for every row');
  assert.equal(scans, once, `the scope Pods were scanned ${scans} times for 200 rows (${once} for one relation)`);
  box.actions['wake.scope.ns']({ arg: { values: ['shop'] } }); await settle();
  assert.notEqual(box.relation(), first, 'a new scope is a new relation');
});

test('events_timeline_dims_marks_with_one_lookup_not_a_scan_of_the_rows_per_mark', async () => {
  const N = 300;
  const events = Object.assign(Array.from({ length: N }, (_, i) => ({ uid: `e${i}`, type: 'Warning', reason: 'BackOff', message: `m${i}`, object: { kind: 'Pod', name: `api-${i}`, ns: 'payments', uid: `o${i}` },
    at: iso(NOW - (i % 50) * MIN), count: 1, source: 'kubelet' })), { timeBasis: { referenceAt: iso(NOW) } });
  const fixture = { resources: async p => (p.kind === 'events' ? structuredClone(events) : []), namespaces: async () => ['payments'], kinds: async () => [], cluster: async () => ({ id: C_ID }) };
  const { html } = await (await pageOf('./resource-list.js', fixture))({ params: { kind: 'events', ns: '_all' } });
  html();
  const some = Array.prototype.some;
  let visits = 0;
  Array.prototype.some = function (f, self) { return some.call(this, (...a) => { visits++; return f.apply(self, a); }); };
  try { html(); } finally { Array.prototype.some = some; }
  assert.ok(visits < N * 10, `${visits} row visits for ${N} events (a scan per mark is about ${N * N / 2})`);
});

test('logs_follow_skips_a_tick_while_the_previous_read_is_in_flight_and_does_not_read_while_hidden', async t => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  t.after(() => mock.timers.reset());
  const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  t.after(() => (prior ? Object.defineProperty(globalThis, 'document', prior) : delete globalThis.document));
  let reads = 0, hold = null;
  const fixture = { resources: async () => [pod('payments', 'api', 1)], namespaces: async () => ['payments'],
    logs: () => { reads++; return hold ?? Promise.resolve({ text: '2026-11-17T00:00:00Z line' }); } };
  const { page } = await (await pageOf('./logs.js', fixture))({});
  page.actions['wake.log.follow']({ on: true }); await settle();
  const base = reads;
  hold = new Promise(() => {});
  for (let i = 0; i < 4; i++) { mock.timers.tick(3000); await settle(); }
  assert.equal(reads - base, 1, `follow started ${reads - base} log reads while the first was still in flight`);
  hold = null;
  const { page: hidden } = await (await pageOf('./logs.js', fixture))({});
  hidden.actions['wake.log.follow']({ on: true }); await settle();
  doc.hidden = true;
  const before = reads;
  for (let i = 0; i < 4; i++) { mock.timers.tick(3000); await settle(); }
  assert.equal(reads, before, 'a hidden document does not follow');
});

test('logs_section_counts_the_line_limit_from_the_lines_fetched_before_the_window_filter_and_its_footer_is_the_lines_shown', async () => {
  /* R5-02·R5-03: 백엔드가 상한까지 받았다고 하면(limitReached) 거른 뒤 999줄이어도 상한 알림, 바닥 범위는 보이는 줄 */
  const text = Array.from({ length: 999 }, (_, i) => `${iso(NOW - (1000 - i) * 1000)} INFO request ${i}`).join('\n');
  const fixture = { resources: async () => [pod('payments', 'api', 1)], namespaces: async () => ['payments'], logs: async () => ({ text, partial: true, limitReached: true }) };
  const { html } = await (await pageOf('./logs.js', fixture))({});
  const s = html();
  assert.ok(s.includes('wake.log.tailOnly{&quot;n&quot;:&quot;999&quot;}') || s.includes('wake.log.tailOnly{"n":"999"}'), 'the line-limit notice');
  const shown = [...s.matchAll(/class="lgv-n">(\d+)</g)].map(m => m[1]);
  assert.match(s, new RegExp(`wake\\.rv\\.logRangeRead\\{(&quot;|")from(&quot;|"):(&quot;|")${shown[0]}(&quot;|"),(&quot;|")to(&quot;|"):(&quot;|")${shown.at(-1)}`), `footer equals lines ${shown[0]}–${shown.at(-1)}`);
});
