/* 보관함은 대화 저장소 읽기 결과를 그대로 말한다: 읽기에 성공한 0건만 "대화 없음", 실패는 조회 실패(이전에 읽어 둔 대화가 있어도).
   새 탭 시작 화면의 카드는 시작 화면과 함께 지웠다(D-USR-2026-11-18) */
import assert from 'node:assert/strict';
import test from 'node:test';

let mode = 'ok', calls = 0, rows = [];
/* 서비스 호스트 흉내(이 시험 파일 안에만): ai.conversations 하나 */
globalThis.kitService = { on() {}, call: async name => { if (name === 'ai.conversations') { calls++; if (mode === 'fail') throw new Error('store unavailable'); return rows; } return []; } };
const { default: config } = await import('./app.config.js');
const { conversationRead, refreshConversations } = await import('./ai-hub.js');
const archive = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'archive');
const ctx = { settings: () => ({}) };
const inLab = { settings: () => ({ 'wake.clusters.list': [{ id: 'lab', state: 'ok' }], 'wake.clusters.connected': ['lab'] }) };

test('archive_says_empty_only_after_a_successful_empty_read_and_the_failure_otherwise', async () => {
  mode = 'ok'; rows = [];
  await refreshConversations();
  assert.equal(conversationRead.state, 'ready');
  assert.equal((await archive.sections(ctx))[0].none.title, 'wake.s.archive.empty');
  mode = 'fail';
  await refreshConversations();
  assert.equal(conversationRead.state, 'failed');
  assert.equal((await archive.sections(ctx))[0].none.title, 'wake.home.conversationsFailed', 'a failed read is not "no chats"');
});

test('archive_reads_the_store_again_while_its_last_read_failed_and_recovers', async () => {
  mode = 'fail'; rows = [];
  await refreshConversations();
  assert.equal((await archive.sections(ctx))[0].none.title, 'wake.home.conversationsFailed');
  mode = 'ok'; const before = calls;
  assert.equal((await archive.sections(ctx))[0].none.title, 'wake.s.archive.empty');
  assert.ok(calls > before);
});

/* B3-08: a conversation's preview was the hub's 120-character cut of the raw answer ("… 범위에 `or"): the markdown is read first and the plain
   words are cut after (the archive row), and the hub keeps enough of the answer for that */
test('archive_conversation_preview_is_plain_words_cut_after_the_markdown_is_read', async () => {
  const answer = 'the orders namespace is **outside** the scope this chat may read. Add `orders` to the scope. ' + 'more words '.repeat(40);
  mode = 'ok'; rows = [{ id: 'c2', title: 'cv-2', cluster: 'lab', last: answer, time: new Date().toISOString(), state: 'archived', archivedAt: new Date().toISOString() }];
  await refreshConversations();
  const row = (await archive.sections(inLab))[0].groups.flat().find(r => r.id === 'ar-c2');
  assert.ok(row, 'the archived conversation is listed');
  const preview = String(row.description.raw).split(' · ')[0];
  assert.doesNotMatch(preview, /[`*]/, `markdown marks in the preview: ${preview}`);
  assert.match(preview, /Add orders to the scope/);
  assert.ok(preview.length <= 160, `cut after reading: ${preview.length}`);
  const { readFileSync } = await import('node:fs');
  const hub = readFileSync(new URL('./desktop/ai-run.cjs', import.meta.url), 'utf8');
  assert.doesNotMatch(hub, /last: c\.messages\.at\(-1\)\?\.text\?\.slice\(0, 120\)/, 'the hub does not cut the raw answer before the screen reads it');
});
