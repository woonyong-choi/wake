/* 허브 연결(hub.cjs): 자동 해석 설정(기본 꺼짐), 클라이언트 토큰 교체, 도구 연결 해제·클러스터 삭제의 저장소 정리, 내 자료 내보내기·지우기 서비스.
 * 격리 userData와 합성 출처만 쓴다. ai-run의 createAiRunner는 받은 옵션을 보려고 감싼다 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const aiRun = require('./ai-run.cjs');
const realRunner = aiRun.createAiRunner;
let runnerOptions = null;
aiRun.createAiRunner = options => { runnerOptions = options; return realRunner(options); };
const { createHub } = require('./hub.cjs');
const { createHubStore } = require('./hub-store.cjs');

const sources = { state: () => [], sourceState: (_id, s) => ({ id: s, state: 'ready' }), list: async () => [], get: async () => null, kube: async () => ({ items: [] }), alerts: async () => [], promRange: async () => [] };
async function open(t) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-hub-wiring-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const hub = await createHub({ userData, emit: () => {}, sources, contexts: () => ['c1'], secret: () => null });
  return { hub, userData, store: () => createHubStore({ userData, maskText: s => ({ text: String(s), n: 0 }) }) };
}

test('auto_interpretation_follows_the_saved_setting_and_is_off_by_default', async t => {
  const { userData } = await open(t);
  assert.equal(typeof runnerOptions.autoInterpret, 'function', 'the hub hands the setting to the AI runner');
  assert.equal(runnerOptions.autoInterpret(), false, 'off without a setting');
  fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ 'wake.ai.autoInterpret': true }));
  assert.equal(runnerOptions.autoInterpret(), true, 'read again on each call');
  fs.writeFileSync(path.join(userData, 'settings.json'), '{ broken');
  assert.equal(runnerOptions.autoInterpret(), false, 'an unreadable setting is off');
});

test('opening_the_incident_list_of_a_cluster_starts_its_detection_at_once', async t => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-hub-wiring-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const read = [];
  const hub = await createHub({ userData, emit: () => {}, sources: { ...sources, kube: async (id, p) => { read.push([id, p]); return { items: [] }; } }, contexts: () => ['c1', 'c2'], secret: () => null });
  await hub.incidents({ cluster: 'c1' });
  for (let i = 0; i < 100 && !read.length; i++) await new Promise(resolve => setTimeout(resolve, 10)); /* well under the 30 s cycle */
  assert.ok(read.some(([id, p]) => id === 'c1' && p.startsWith('/api/v1/pods')), 'the list read of c1 started a detection pass of c1');
  assert.ok(!read.some(([id]) => id === 'c2'), 'another cluster is not read');
});

test('client_rotate_gives_a_new_token_through_the_hub', async t => {
  const { hub } = await open(t);
  const made = hub.client({ op: 'add', name: 'agent', transport: 'mcp', scope: { cluster: 'c1' } });
  const rotated = hub.client({ op: 'rotate', id: made.id });
  assert.equal(rotated.id, made.id);
  assert.match(rotated.token, /^wake_/);
  assert.notEqual(rotated.token, made.token);
  assert.deepEqual(hub.client({ op: 'rotate', id: 'nope' }), { error: 'missing' });
});

test('tool_disconnect_and_cluster_delete_clean_cache_and_references_but_keep_the_archive', async t => {
  const { hub, store } = await open(t);
  const s = store();
  s.docs('tool-catalog').put('c1|prometheus|rule', { cluster: 'c1', source: 'prometheus', items: [] });
  s.docs('tool-catalog').put('c1|alertmanager|silence', { cluster: 'c1', source: 'alertmanager', items: [] });
  s.log('events').append({ cluster: 'c1', reason: 'BackOff' });
  s.docs('incidents').put('i1', { cluster: 'c1', phase: 'resolved', resolvedAt: Date.now() });
  assert.deepEqual(hub.forgetSource({ cluster: 'c1', source: 'prometheus' }), { removed: 1 });
  assert.deepEqual(store().docs('tool-catalog').all().map(d => d.id), ['c1|alertmanager|silence']);
  assert.ok(hub.forgetCluster({ cluster: 'c1' }).removed >= 2);
  assert.equal(store().docs('tool-catalog').all().length, 0);
  assert.equal(store().log('events').list().length, 0);
  assert.ok(store().docs('incidents').get('i1'), 'the incident archive stays');
  assert.deepEqual(hub.forgetCluster({}), { error: 'invalid_request' });
  assert.deepEqual(hub.forgetSource({ cluster: 'c1' }), { error: 'invalid_request' });
});

test('export_and_delete_my_data_are_services', async t => {
  const { hub, store, userData } = await open(t);
  store().docs('incidents').put('i1', { cluster: 'c1', phase: 'open' });
  store().docs('tool-catalog').put('c1|prometheus|rule', { cluster: 'c1', source: 'prometheus', items: [] });
  const out = hub.exportData();
  assert.ok(out.collections.incidents.length === 1 && !out.collections['tool-catalog']);
  assert.deepEqual(hub.deleteData({}), { error: 'confirm' }, 'deleting needs an explicit confirm');
  const gone = hub.deleteData({ confirm: true });
  assert.ok(gone.removed >= 2);
  assert.deepEqual(fs.readdirSync(path.join(userData, 'hub')), []);
});

/* B2-04: a conversation started in the app was saved by the run but no document heard of it (the sidebar, ⌘K and the new-tab cards read
   their own copy of the list on 'ai-chat'), so it showed only after a restart. A finished run tells every document the conversation was saved */
test('a_finished_run_tells_the_documents_its_conversation_was_saved', async t => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-hub-wiring-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const events = [];
  aiRun.createAiRunner = options => ({ ...realRunner(options), run: async (args, onEvent) => { onEvent({ type: 'done', conversation: args.conversation }); return { conversation: args.conversation }; } });
  try {
    const hub = await createHub({ userData, emit: (event, p) => events.push([event, p]), sources, contexts: () => ['c1'], secret: () => null });
    await hub.run({ run: 'r1', conversation: 'cv-new-1', messages: [{ role: 'user', text: 'hi' }] });
  } finally { aiRun.createAiRunner = options => { runnerOptions = options; return realRunner(options); }; }
  assert.deepEqual(events.filter(([e]) => e === 'ai-chat'), [['ai-chat', { op: 'saved', id: 'cv-new-1' }]]);
});

/* B3-09: every tool the answer could name has its words in both languages (the hub hands them to the runner) */
test('every_tool_id_an_answer_could_name_has_its_words_in_both_languages', async () => {
  const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
  const src = fs.readFileSync(path.join(__dirname, 'ai-run.cjs'), 'utf8');
  const names = [...(/const TOOL_STEPS = new Set\(\[([\s\S]*?)\]\)/.exec(src)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.ok(names.length > 10);
  for (const lang of ['ko', 'en']) {
    const dict = (await import(pathToFileURL(path.join(__dirname, '..', 'locale', lang + '.js')).href)).default;
    assert.deepEqual(names.filter(n => !dict[`wake.ai.toolWord.${n}`]), [], `${lang} words for every tool`);
  }
  assert.match(fs.readFileSync(path.join(__dirname, 'hub.cjs'), 'utf8'), /createAiRunner\(\{[^}]*toolWord/, 'the hub hands the words to the runner');
});
