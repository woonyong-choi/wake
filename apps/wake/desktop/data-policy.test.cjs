/* 보관 정책(spec/data-policy.md): 저장소 묶음마다 선언한 등급(archive·cache·reference·config), TTL·크기 상한·정리, 저장 금지 검사, 연결 해제·클러스터 삭제·내보내기·전부 지우기.
 * 격리한 userData(.local/tmp)와 합성 행만 쓴다 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createHubStore } = require('./hub-store.cjs');
const { POLICY, CLASSES, guard } = require('./data-policy.cjs');

const DAY = 86_400_000;
const T0 = Date.parse('2026-11-18T00:00:00Z');
const HIDE = '••••';
const maskText = text => { const out = String(text).replace(/password=\S+/g, `password=${HIDE}`); return { text: out, n: out === text ? 0 : 1 }; };

function fixture(t, extra = {}) {
  const root = path.resolve(__dirname, '../../../.local/tmp');
  fs.mkdirSync(root, { recursive: true });
  const userData = fs.mkdtempSync(path.join(root, 'policy-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  let clock = T0;
  const open = () => createHubStore({ userData, maskText, now: () => clock, ...extra });
  return { userData, store: open(), open, tick: ms => { clock += ms; }, at: () => clock, file: name => path.join(userData, 'hub', name) };
}

test('every_collection_declares_a_class_and_an_undeclared_name_is_refused', t => {
  const { store } = fixture(t);
  for (const [name, p] of Object.entries(POLICY)) {
    assert.ok(CLASSES.includes(p.class), `${name} has a known class`);
    assert.ok(['log', 'docs'].includes(p.shape), `${name} has a shape`);
    assert.ok(Number.isInteger(p.recordBytes) && p.recordBytes > 0, `${name} has a record cap`);
    if (p.class === 'cache' || p.class === 'reference') assert.ok(Number.isInteger(p.maxBytes) && Number.isFinite(p.days), `${name} cache has TTL and size cap`);
  }
  assert.throws(() => store.log('scratch'), /undeclared collection/);
  assert.throws(() => store.docs('audit'), /declared as log/, 'a collection keeps its declared shape');
  /* 저장소를 여는 모든 코드의 묶음 이름이 선언돼 있다 */
  const used = new Set();
  const walk = dir => { for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); if (fs.statSync(p).isDirectory()) { if (n !== 'vendor' && n !== 'node_modules') walk(p); } else if (/\.(c|m)?js$/.test(n) && !/\.test\./.test(n)) for (const m of fs.readFileSync(p, 'utf8').matchAll(/\.(?:log|docs)\('([a-z][a-z0-9-]*)'\)/g)) used.add(m[1]); } };
  walk(path.join(__dirname, '..'));
  for (const name of used) if (!['check-release: ok'].includes(name)) assert.ok(Object.hasOwn(POLICY, name), `${name} is declared`);
});

test('cache_rows_past_ttl_are_purged_while_archive_rows_follow_their_incident', t => {
  const { store, open, tick } = fixture(t);
  const catalog = store.docs('tool-catalog');
  catalog.put('c1|prometheus|rules', { cluster: 'c1', source: 'prometheus', items: [{ ref: 'g|HighErrors', hash: 'h1' }] });
  const incidents = store.docs('incidents'), evidence = store.log('evidence');
  incidents.put('open-1', { cluster: 'c1', phase: 'open' });
  incidents.put('done-1', { cluster: 'c1', phase: 'resolved', resolvedAt: T0 });
  evidence.append({ incident: 'open-1', n: 1, result: { object: 'a' } });
  evidence.append({ incident: 'done-1', n: 1, result: { object: 'b' } });
  store.log('audit').append({ incident: 'open-1', tool: 'get_incident' });
  tick(POLICY['tool-catalog'].days * DAY + 1);
  open().prune();
  assert.equal(open().docs('tool-catalog').all().length, 0, 'a catalogue past its TTL is rebuilt from the source, not kept');
  /* 열린 인시던트는 마지막 기록보다 오래 남지 않지만, 해결 안 된 동안 그 근거·감사는 인시던트를 따라간다 */
  tick(91 * DAY);
  store.docs('incidents').put('open-1', { ...store.docs('incidents').get('open-1'), lastSignalAt: T0 + 100 * DAY });
  open().prune();
  const s = open();
  assert.ok(s.docs('incidents').get('open-1'), 'an unresolved incident is protected');
  assert.deepEqual(s.log('evidence').list().map(r => r.incident), ['open-1'], 'evidence of the live incident stays; evidence of the incident resolved >90 days ago goes with it');
  assert.equal(s.log('audit').list().length, 1, 'the audit row of a live incident stays past 90 days');
  assert.equal(s.docs('incidents').get('done-1'), null);
});

test('incident_counter_is_configuration_and_never_pruned', t => {
  const { store, open, tick } = fixture(t);
  store.docs('meta').put('counter', { n: 41 });
  tick(400 * DAY);
  open().prune();
  assert.equal(open().docs('meta').get('counter').n, 41, 'INC numbers do not restart after a quiet quarter');
});

test('size_cap_evicts_oldest_cache_rows_first_and_compacts_the_file', t => {
  const { store, file, tick } = fixture(t, { policy: { events: { ...POLICY.events, maxBytes: 4096 } } });
  const log = store.log('events');
  for (let i = 0; i < 80; i++) { log.append({ n: i, message: 'x'.repeat(100) }); tick(1000); }
  assert.ok(fs.statSync(file('events.jsonl')).size <= 4096 * 1.25, 'the file never grows far past its cap between purges');
  store.prune();
  const rows = log.list();
  assert.ok(fs.statSync(file('events.jsonl')).size <= 4096);
  assert.equal(rows.at(-1).n, 79, 'the newest row stays');
  assert.ok(rows[0].n > 0, 'the oldest rows went first');
  assert.deepEqual(rows.map(r => r.n), [...rows.map(r => r.n)].sort((a, b) => a - b));
});

test('size_cap_evicts_oldest_catalogue_documents', t => {
  const { store, tick } = fixture(t, { policy: { 'tool-catalog': { ...POLICY['tool-catalog'], maxBytes: 2048 } } });
  const docs = store.docs('tool-catalog');
  for (let i = 0; i < 20; i++) { docs.put(`c${i}|prometheus|rules`, { cluster: `c${i}`, source: 'prometheus', items: [{ ref: 'x'.repeat(150), hash: String(i) }] }); tick(1000); }
  store.prune();
  const left = docs.all().map(d => d.cluster);
  assert.ok(left.includes('c19') && !left.includes('c0'));
  assert.ok(JSON.stringify(Object.fromEntries(docs.all().map(d => [d.id, d]))).length <= 2048);
});

test('never_store_guard_rejects_secret_like_payloads_before_anything_is_written', t => {
  const { store, file } = fixture(t);
  const refused = (fn, why) => assert.throws(fn, e => e.kind === 'never_store' && e.reason === why);
  refused(() => store.log('audit').append({ args: { password: 'hunter2' } }), 'secret_field');
  refused(() => store.docs('incidents').put('i1', { notes: { headers: { Authorization: 'Bearer abc.def.ghi' } } }), 'secret_field');
  refused(() => store.log('evidence').append({ result: { kind: 'Secret', apiVersion: 'v1', data: { 'db-password': 'c2VjcmV0' } } }), 'secret_object');
  refused(() => store.log('evidence').append({ result: { users: { 'client-key-data': 'LS0tLS1CRUdJTi' } } }), 'secret_field');
  refused(() => store.log('evidence').append({ kind: 'logs', result: { lines: Array.from({ length: 2001 }, (_, i) => ({ n: i, text: 'l' })) } }), 'raw_logs');
  refused(() => store.log('audit').append({ blob: 'x'.repeat(POLICY.audit.recordBytes) }), 'too_large');
  assert.equal(fs.existsSync(file('audit.jsonl')), false, 'nothing reached the disk');
  assert.equal(fs.existsSync(file('incidents.json')), false);
  /* 가린 값, 해시, 키 이름만 남은 Secret, 숫자 토큰 수는 저장한다 */
  store.log('audit').append({ args: { password: HIDE }, tokenHash: 'ab12', usage: { input_tokens: 3 } });
  store.log('evidence').append({ result: { kind: 'Secret', apiVersion: 'v1', data: { 'db-password': '' } } });
  assert.equal(store.log('audit').list().length, 1);
  assert.equal(guard({ token: '' }, 1024), null);
});

test('incident_archive_keeps_referenced_snapshot_after_catalogue_purge', t => {
  const { store, open, tick } = fixture(t);
  const rule = { group: 'payments.rules', name: 'HighErrorRate', expr: 'sum(rate(http_requests_total{code=~"5.."}[5m])) > 1' };
  const hash = 'sha256-of-rule';
  store.docs('tool-catalog').put('c1|prometheus|rules', { cluster: 'c1', source: 'prometheus', kind: 'rules', items: [{ ref: `${rule.group}|${rule.name}`, hash }] });
  store.docs('incidents').put('i1', { cluster: 'c1', phase: 'open' });
  store.log('evidence').append({ incident: 'i1', n: 1, kind: 'object', role: 'rule', source: 'prometheus', ref: { tool: 'prometheus', kind: 'rule', id: `${rule.group}|${rule.name}`, hash }, result: { object: rule.expr, rules: [rule] } });
  tick(POLICY['tool-catalog'].days * DAY + DAY);
  store.prune();
  const s = open();
  assert.equal(s.docs('tool-catalog').all().length, 0);
  const [piece] = s.log('evidence').list();
  assert.equal(piece.ref.hash, hash);
  assert.equal(piece.result.rules[0].expr, rule.expr, 'the frozen snapshot still carries the rule expression');
});

test('disconnecting_a_tool_or_deleting_a_cluster_drops_cache_and_references_but_keeps_the_archive', t => {
  const { store, open } = fixture(t);
  store.docs('tool-catalog').put('c1|prometheus|rules', { cluster: 'c1', source: 'prometheus', items: [] });
  store.docs('tool-catalog').put('c1|alertmanager|silences', { cluster: 'c1', source: 'alertmanager', items: [] });
  store.docs('tool-catalog').put('c2|prometheus|rules', { cluster: 'c2', source: 'prometheus', items: [] });
  store.log('source-checks').append({ cluster: 'c1', source: 'prometheus', ok: true });
  store.log('events').append({ cluster: 'c1', reason: 'BackOff' });
  store.docs('incidents').put('i1', { cluster: 'c1', phase: 'open' });
  store.log('evidence').append({ incident: 'i1', source: 'prometheus', n: 1 });
  assert.equal(store.forgetSource('c1', 'prometheus'), 2);
  assert.deepEqual(open().docs('tool-catalog').all().map(d => d.id).sort(), ['c1|alertmanager|silences', 'c2|prometheus|rules']);
  store.forgetCluster('c1');
  const s = open();
  assert.deepEqual(s.docs('tool-catalog').all().map(d => d.id), ['c2|prometheus|rules']);
  assert.equal(s.log('events').list().length, 0);
  assert.equal(s.log('source-checks').list().length, 0);
  assert.ok(s.docs('incidents').get('i1'), 'the archive of a deleted cluster stays for its retention');
  assert.equal(s.log('evidence').list().length, 1);
});

test('export_gives_the_archive_and_settings_masked_and_delete_all_leaves_nothing', t => {
  const { store, userData, open } = fixture(t);
  store.docs('incidents').put('i1', { cluster: 'c1', phase: 'open', note: 'login password=abc' });
  store.docs('tool-catalog').put('c1|prometheus|rules', { cluster: 'c1', source: 'prometheus', items: [] });
  store.docs('ai-server').put('config', { mcp: false });
  const out = store.exportAll();
  assert.deepEqual(Object.keys(out.collections).sort(), ['ai-server', 'incidents']);
  assert.equal(out.collections.incidents[0].note, `login password=${HIDE}`);
  assert.equal(out.policy.incidents.class, 'archive');
  const removed = store.deleteAll();
  assert.ok(removed >= 3);
  assert.deepEqual(fs.readdirSync(path.join(userData, 'hub')), []);
  assert.equal(open().docs('incidents').all().length, 0);
});
