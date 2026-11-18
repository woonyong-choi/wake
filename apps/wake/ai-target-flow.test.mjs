/* B1: 대화 저장 계약. 실제 kit 대화 엔진, 앱 어댑터(app.config ai), 허브(createHub), 디스크 저장소. 등록 목록과 공급자(fetch)만 이 파일 안의 대역.
   - 저장된 대화는 허브가 준 id로 이어진다(엔진이 그 id를 지니고 다음 질문에 보냄, 클라이언트 글로 다시 만들지 않음)
   - 허브는 자기가 저장한 메시지(실패한 답의 종류·문구·부분 글·단계, 거절한 대상)를 지우지 않고 새 질문만 붙인다
   node --test apps/wake/ai-target-flow.test.mjs */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createHub } = require('./desktop/hub.cjs');
const { createHubStore } = require('./desktop/hub-store.cjs');
const { default: ko } = await import('./locale/ko.js');
const { said } = await import('./data/index.js');
const { createPanelEngine, extendIcons, extendGlyphs } = await import('../../kit/index.js');

/* the page's service bridge is wired once per process (kit core/service.js): one bridge for the file, each world plugs its hub into it */
const bus = new Set();
let current = null;
globalThis.kitService = { on: fn => { bus.add(fn); return () => bus.delete(fn); }, call: (name, arg) => current(name, arg) };
async function world(registry) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-ai-flow-')), subscribers = bus, wire = [], results = [], modelCalls = [], notifications = [];
  const answers = { next: async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'answer' }] }) }) };
  globalThis.fetch = async (url, init) => { modelCalls.push(url); return answers.next(url, init); };
  const hub = await createHub({ userData: dir, sources: {}, contexts: () => registry, secret: (method, target) => (method === 'ai-key' && target === 'anthropic' ? 'test-key' : null), version: 'test', emit: (name, p) => { for (const fn of subscribers) fn(name, p); } });
  current = async (name, arg) => { if (name === 'ai.run') { wire.push(JSON.parse(JSON.stringify(arg))); const r = await hub.run(arg); results.push(r); return r; } return name === 'ai.conversations' ? hub.conversations(arg) : []; };
  const { default: config } = await import('./app.config.js');
  extendGlyphs(config.icons.glyphs); extendIcons(config.icons.map);
  const settings = { 'wake.clusters.list': [{ id: 'other-cluster', name: 'other-cluster', state: 'ok' }], 'wake.clusters.connected': ['other-cluster'], 'wake.scope.cluster': 'other-cluster' };
  let tick = 0;
  const engine = () => createPanelEngine({ ...config, ai: { ...config.ai, defaultModel: { provider: 'anthropic', model: 'm' } } },
    { data: { get: async () => said(hub.conversations()) }, getSettings: () => settings, onNotify: (kind, c) => notifications.push({ kind, id: c.id }), now: () => new Date(Date.parse('2026-11-16T06:00:00+09:00') + ++tick * 1000) });
  const store = () => createHubStore({ userData: dir, maskText: s => ({ text: s, n: 0 }) });
  const reopen = async id => { const e = engine(); await e.loadList(); e.select(id); return e; };
  return { wire, results, modelCalls, notifications, engine, store, reopen, answers, last: () => results.at(-1).conversation };
}
const notFound = ko['wake.flow.c.notFound'];
/* the words, or their key where this process has no locale set (the page's own locale is the shell's) */
const shows = (h, key, words) => h.includes(words) || h.includes(key);
const showsRefusal = h => shows(h, 'wake.flow.c.notFound', notFound);
const chip = { icon: 'search', title: 'tool', sub: 'team/prod', ref: { cluster: 'team/prod', kind: 'prometheus' } };

test('refused → reopened from the list → the context comes back → a follow-up in the reopened conversation → reopened from a new store: one conversation, the refusal kept', async () => {
  const registry = ['other-cluster'], w = await world(registry);
  const panel = w.engine();
  await panel.send('q1', chip);
  const id = w.last(), answer = panel.current().messages[1];
  assert.equal(w.modelCalls.length, 0, 'no model call for a refused target');
  assert.ok(answer.failed, 'the answer is a failure, not a completed one');
  assert.ok(showsRefusal(String(panel.renderMessages('full'))));
  assert.deepEqual(w.notifications, [], 'a refusal is not announced as done');
  assert.equal(panel.current().savedId, id, 'the engine keeps the store\'s id');
  const reopened = await w.reopen(id);
  const html = String(reopened.renderMessages('full'));
  assert.ok(showsRefusal(html)); assert.doesNotMatch(html, /NaN/);
  registry.push('team/prod');
  await reopened.send('q2', chip);
  assert.equal(w.wire.at(-1).conversation, id, 'the follow-up names the saved conversation');
  assert.equal(w.last(), id, 'and stays in it');
  assert.equal(w.modelCalls.length, 1);
  const disk = w.store().docs('conversations').get(id);
  assert.deepEqual(disk.messages.map(x => [x.role, x.text, x.error ?? null]), [['user', 'q1', null], ['assistant', '', 'target_rejected'], ['user', 'q2', null], ['assistant', 'answer', null]]);
  assert.equal(disk.messages[1].rejectedTarget.cluster, 'team/prod');
  assert.equal(w.store().docs('conversations').all().length, 1, 'no second conversation');
  assert.ok(showsRefusal(String((await w.reopen(id)).renderMessages('full'))), 'the refusal reads back after the follow-up');
});

test('a partial answer and a dropped provider → read again → a question once it is back → read again: the failure, its words and the partial text stay', async () => {
  const w = await world(['team/prod']);
  let calls = 0;
  w.answers.next = async () => {
    if (++calls === 1) return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Pod is Running. Checking memory.' }, { type: 'tool_use', id: 't1', name: 'list_resources', input: { cluster: 'team/prod', kind: 'Pod' } }] }) };
    throw new Error('provider disconnected');
  };
  const panel = w.engine();
  await panel.send('check', chip);
  const id = w.last();
  const live = panel.current().messages[1];
  assert.ok(live.failed); assert.ok(live.parts.some(p => p.type === 'text') && live.parts.some(p => p.type === 'error'));
  const disk = w.store().docs('conversations').get(id).messages[1];
  assert.equal(disk.error, 'failed'); assert.equal(disk.text, 'Pod is Running. Checking memory.'); assert.equal(disk.message.$t, 'wake.ai.failed'); assert.deepEqual([disk.steps[0].text.$t, disk.steps[0].state], ['wake.ai.step.list_resources', 'fail'], 'no cluster reads in this world: the tool fails');
  const again = (await w.reopen(id)).current().messages[1];
  assert.ok(again.failed); assert.deepEqual(again.parts.map(p => p.type), ['text', 'error']); assert.notEqual(again.steps[0].text, 'list_resources'); assert.equal(again.steps[0].state, 'fail');
  w.answers.next = async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'back' }] }) });
  await panel.send('again', chip);
  assert.equal(w.last(), id);
  const after = w.store().docs('conversations').get(id).messages;
  assert.deepEqual(after.map(x => [x.role, x.error ?? null]), [['user', null], ['assistant', 'failed'], ['user', null], ['assistant', null]]);
  const read = (await w.reopen(id)).current().messages;
  assert.ok(read[1].failed && read[1].parts.some(p => p.type === 'error')); assert.equal(read[3].parts[0].blocks[0].p[0], 'back');
});

test('a client with an older copy of the conversation never drops a message the hub has, nor its own new question', async () => {
  const w = await world(['team/prod']);
  const a = w.engine();
  await a.send('first', chip);
  const id = w.last(), b = w.engine();
  b.adopt(JSON.parse(JSON.stringify(a.current())));
  await a.send('follow-up A', chip);
  await b.send('follow-up B', chip);
  const msgs = w.store().docs('conversations').get(id).messages;
  assert.deepEqual(msgs.map(x => [x.role, x.text]), [['user', 'first'], ['assistant', 'answer'], ['user', 'follow-up A'], ['assistant', 'answer'], ['user', 'follow-up B'], ['assistant', 'answer']]);
});

test('a target id goes to the hub as given: 1024 characters pass, 1025 or a control character at 1025 are refused, a longer id never matches a registered prefix', async () => {
  const id1024 = 'a'.repeat(1024), w = await world([id1024]);
  const ask = async cluster => { const panel = w.engine(); await panel.send('q', { ref: { cluster, kind: 'prometheus' } }); return { sent: w.wire.at(-1), saved: w.store().docs('conversations').get(w.last()) }; };
  const ok = await ask(id1024);
  assert.equal(ok.sent.target.cluster.length, 1024); assert.deepEqual(ok.saved.target, { cluster: id1024, kind: 'prometheus' });
  for (const cluster of [id1024 + 'b', id1024 + '\n']) {
    const before = w.modelCalls.length, r = await ask(cluster);
    assert.equal(r.sent.target.cluster, cluster, 'the adapter does not shorten it');
    assert.equal(w.modelCalls.length, before, 'refused before any model call');
    assert.equal(r.saved.rejectedTarget.reason, 'invalid'); assert.equal(r.saved.target, undefined);
  }
});

test('a named but wrong target (false, 0, empty, null) is refused, not taken as "no target", and not announced as done', async () => {
  const w = await world(['other-cluster']);
  for (const ref of [false, 0, '', null]) {
    const panel = w.engine(), before = w.modelCalls.length, notes = w.notifications.length;
    await panel.send('q', { ref });
    const sent = w.wire.at(-1), saved = w.store().docs('conversations').get(w.last());
    assert.ok('target' in sent, `a target is sent for ${JSON.stringify(ref)}`); assert.equal(sent.target, ref);
    assert.equal(w.modelCalls.length, before); assert.equal(saved.rejectedTarget.reason, 'invalid'); assert.equal(saved.cluster, null);
    assert.equal(w.notifications.length, notes, `${JSON.stringify(ref)}: no "done"`); assert.ok(panel.current().messages[1].failed);
  }
});


test('stopped_first_run_and_followup_keep_both_questions_and_reverse_answers', async () => {
  const w = await world(['team/prod']), panel = w.engine(), pending = [];
  w.answers.next = () => new Promise(resolve => pending.push(resolve));
  const first = panel.send('question-A', chip);
  await new Promise(setImmediate);
  const id = panel.current().id;
  assert.deepEqual(w.store().docs('conversations').get(id).messages.map(m => m.text), ['question-A']);
  panel.stop();
  await first;
  const second = panel.send('question-B', chip);
  await new Promise(setImmediate);
  assert.equal(pending.length, 2, 'followup does not wait for the stopped provider request');
  pending[1]({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'answer-B' }] }) });
  await second;
  pending[0]({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'answer-A' }] }) });
  await new Promise(setImmediate);
  const disk = w.store().docs('conversations').get(id);
  assert.deepEqual(disk.messages.map(m => m.text), ['question-A', 'question-B', 'answer-B', 'answer-A']);
  assert.equal(panel.current().busy, false);
  assert.ok(!JSON.stringify(panel.current().messages).includes('answer-A'), 'stopped run cannot write into the visible followup');
  assert.equal(w.notifications.length, 1);
});

for (const [name, questions] of [
  ['reopened_pending_run_followup_keeps_each_question_once', ['question-A', 'question-B']],
  ['reopened_pending_run_identical_questions_keep_distinct_ids', ['same question', 'same question']],
]) {
  test(name, async () => {
    const w = await world(['other-cluster']), pending = [];
    w.answers.next = (_url, init) => new Promise(resolve => pending.push({ resolve, body: JSON.parse(init.body) }));
    const first = w.engine(), a = first.send(questions[0]);
    await new Promise(setImmediate);
    const id = first.current().id, second = await w.reopen(id);
    const b = second.send(questions[1]);
    await new Promise(setImmediate);
    assert.equal(pending.length, 2);
    pending[1].resolve({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'answer-B' }] }) });
    await b;
    pending[0].resolve({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'answer-A' }] }) });
    await a;
    const users = messages => messages.filter(m => m.role === 'user');
    assert.deepEqual(users(w.wire[0].messages).map(m => m.text), questions.slice(0, 1));
    assert.deepEqual(users(w.wire[1].messages).map(m => m.text), questions);
    assert.deepEqual(users(pending[0].body.messages).map(m => m.content), questions.slice(0, 1));
    assert.deepEqual(users(pending[1].body.messages).map(m => m.content), questions);
    const disk = w.store().docs('conversations').get(id).messages;
    const reopened = (await w.reopen(id)).current().messages;
    assert.deepEqual(disk.map(m => m.text), [...questions, 'answer-B', 'answer-A']);
    assert.deepEqual(users(reopened).map(m => m.text), questions);
    const ids = users(w.wire[1].messages).map(m => m.id);
    assert.ok(ids.every(id => typeof id === 'string' && id.length > 0));
    assert.equal(new Set(ids).size, 2, 'separate sends have separate identities even with identical text');
    assert.equal(w.wire[0].messages[0].id, ids[0]);
    assert.equal(first.current().messages[0].id, ids[0]);
    assert.deepEqual(users(disk).map(m => m.id), ids);
    assert.deepEqual(users(reopened).map(m => m.id), ids);
  });
}
