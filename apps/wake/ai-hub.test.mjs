/* B1: 화면 쪽 AI 어댑터가 참조 칩의 대상(ref)을 ai.run의 target과 말마다의 ref로, 전역 범위를 scope로 보낸다(서비스는 이 파일 안의 기록 대역) */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import crypto from 'node:crypto';

async function adapterWith(calls) {
  const src = (await readFile(new URL('./ai-hub.js', import.meta.url), 'utf8')).replace(/^import .*;$/mg, '').replace(/^export /mg, '');
  const box = { crypto, console, URL, Intl, hasService: () => true, onService: () => () => {}, service: async (name, arg) => { calls.push({ name, arg }); return name === 'ai.conversations' ? [] : { conversation: 'cv-1' }; }, said: x => x, text: x => x, sourceOff: x => x };
  runInNewContext(src + '\nglobalThis.make = createAiAdapter;', box);
  return box.make;
}

test('a question from a tool page carries the tool\'s cluster and kind to ai.run as the target, the global scope as scope', async () => {
  const calls = [], make = await adapterWith(calls);
  const chip = { title: 'tool', sub: 'wake-lab', ref: { cluster: 'wake-lab', kind: 'prometheus' } };
  const req = { messages: [{ role: 'user', text: 'question', date: Date.now(), chip }], context: chip, model: 'm', permission: 'read' };
  const signal = AbortSignal.timeout(500);
  for await (const _ of make({ scope: () => ({ cluster: 'kind-wake-test', namespace: 'payments' }) }).adapter.send(req, { signal })) { void _; }
  const run = calls.find(c => c.name === 'ai.run').arg;
  assert.deepEqual({ ...run.target }, { cluster: 'wake-lab', kind: 'prometheus' });
  assert.deepEqual({ ...run.scope }, { cluster: 'kind-wake-test', namespace: 'payments' });
  assert.deepEqual({ ...run.messages[0].ref }, { cluster: 'wake-lab', kind: 'prometheus' });
});

/* cluster는 kubeconfig context 식별자 그대로(EKS ARN, 슬래시, 콜론)이고 문자 집합으로 거르지 않는다(등록 여부는 허브가 본다). kind는 도구 종류 허용 목록 */
test('a context id of any form (an EKS ARN, a slash, a colon) is carried as is; an unknown tool kind is not', async () => {
  for (const cluster of ['arn:aws:eks:ap-northeast-2:123456789012:cluster/prod', 'team/prod', 'gke_project:zone:name']) {
    const calls = [], make = await adapterWith(calls);
    const chip = { ref: { cluster, kind: 'prometheus' } };
    for await (const _ of make({ scope: () => ({ cluster: 'other' }) }).adapter.send({ messages: [{ role: 'user', text: 'q', chip }], context: chip }, { signal: AbortSignal.timeout(500) })) { void _; }
    const run = calls.find(c => c.name === 'ai.run').arg;
    assert.deepEqual({ ...run.target }, { cluster, kind: 'prometheus' }); assert.deepEqual({ ...run.messages[0].ref }, { cluster, kind: 'prometheus' });
  }
  const calls = [], make = await adapterWith(calls);
  const bad = { ref: { cluster: 'wake-lab', kind: 'shell; rm -rf' } };
  for await (const _ of make({ scope: () => ({ cluster: 'wake-lab' }) }).adapter.send({ messages: [{ role: 'user', text: 'q', chip: bad }], context: bad }, { signal: AbortSignal.timeout(500) })) { void _; }
  assert.deepEqual({ ...calls.find(c => c.name === 'ai.run').arg.target }, { cluster: 'wake-lab' }, 'the kind outside the list is dropped, the cluster stays');
});

test('without a reference there is no target; a malformed one goes to the hub as asked, for the hub to refuse (never dropped in favour of the scope)', async () => {
  { const calls = [], make = await adapterWith(calls);
    for await (const _ of make({ scope: () => ({ cluster: 'wake-lab' }) }).adapter.send({ messages: [{ role: 'user', text: 'hi' }] }, { signal: AbortSignal.timeout(500) })) { void _; }
    assert.equal(calls.find(c => c.name === 'ai.run').arg.target, undefined); }
  for (const cluster of ['', 'a\nb']) {
    const calls = [], make = await adapterWith(calls);
    for await (const _ of make({ scope: () => ({ cluster: 'wake-lab' }) }).adapter.send({ messages: [{ role: 'user', text: 'hi', chip: { ref: { cluster } } }], context: { ref: { cluster } } }, { signal: AbortSignal.timeout(500) })) { void _; }
    const run = calls.find(c => c.name === 'ai.run').arg;
    assert.deepEqual({ ...run.target }, { cluster }); assert.equal(run.messages[0].ref, undefined);
  }
});

/* 근거 이름표(polish 넘김 A-27): 허브가 넘긴 근거 기록(refs)은 인시던트 화면과 같은 이름표(evidenceTag)와 그 근거 주소로, 실행 중 답과 저장된 대화 모두 */
test('cited evidence records become name tags with the evidence address, in a live answer and in the saved conversations', async () => {
  const { evidenceTag } = await import('./pages/incident-parts.js');
  const src = (await readFile(new URL('./ai-hub.js', import.meta.url), 'utf8')).replace(/^import .*;$/mg, '').replace(/^export /mg, '');
  const ref = { n: 2, incident: 'inc 1', cluster: 'arn:aws:eks:x:1:cluster/prod', kind: 'events', target: { kind: 'Deployment', namespace: 'pay', name: 'api' }, result: { rows: [{ reason: 'BackOff', object: 'Pod/api-1', message: 'Back-off' }] } };
  let listener = null;
  const box = { crypto, console, URL, Intl, hasService: () => true, said: x => x, text: x => x, sourceOff: x => x, evidenceTag, t: k => ({ 'wake.ev.tag.events': 'Events' })[k] ?? k,
    onService: f => { listener = f; return () => {}; },
    service: async (name, arg) => { if (name === 'ai.run') { listener('ai-event', { run: arg.run, ev: { type: 'done', refs: [ref, { n: 3 }] } }); return { conversation: 'cv-1' }; }
      return name === 'ai.conversations' ? [{ id: 'cv-1', messages: [{ role: 'user', text: 'q' }, { role: 'assistant', parts: [], refs: [ref] }] }] : null; } };
  runInNewContext(src + '\nglobalThis.make = createAiAdapter; globalThis.refresh = refreshConversations;', box);
  const got = [];
  for await (const ev of box.make({ scope: () => null }).adapter.send({ messages: [{ role: 'user', text: 'q' }] }, { signal: AbortSignal.timeout(500) })) got.push(ev);
  const want = { n: 2, label: 'Events · BackOff', tip: 'Pod/api-1 · Back-off', address: 'wake://cluster/arn%3Aaws%3Aeks%3Ax%3A1%3Acluster%2Fprod/incidents/inc%201/evidence/2' };
  assert.deepEqual(JSON.parse(JSON.stringify(got.at(-1).refs)), [want], 'a record without its incident is dropped');
  const list = await box.refresh();
  assert.deepEqual(JSON.parse(JSON.stringify(list[0].messages[1].refs)), [want]);
});


test('adapter_service_rejection_is_visible_as_error', async () => {
  const src = (await readFile(new URL('./ai-hub.js', import.meta.url), 'utf8')).replace(/^import .*;$/mg, '').replace(/^export /mg, '');
  const box = { crypto, Intl, hasService: () => true, onService: () => () => {}, said: x => x, text: x => x, sourceOff: x => x,
    t: key => key, service: async name => { if (name === 'ai.run') throw new Error('transport failed'); return []; } };
  runInNewContext(src + '\nglobalThis.make = createAiAdapter;', box);
  const events = [];
  for await (const event of box.make({ scope: () => null }).adapter.send({ messages: [{ role: 'user', text: 'question' }] })) events.push(event);
  assert.deepEqual(events.map(e => e.type), ['error']);
});

/* H-009 D-USR-2026-11-17-13: 멈춤은 화면이 듣기만 그만두는 것이 아니라 허브에 그 실행을 끝내라고 알린다(ai.cancel, 같은 run id): API 요청 중단, 구독 CLI 프로세스 종료 */
test('stopping an answer asks the hub to cancel that run by its id', async () => {
  const src = (await readFile(new URL('./ai-hub.js', import.meta.url), 'utf8')).replace(/^import .*;$/mg, '').replace(/^export /mg, '');
  const calls = [];
  const box = { crypto, Intl, hasService: () => true, onService: () => () => {}, said: x => x, text: x => x, sourceOff: x => x, t: key => key,
    service: (name, arg) => { calls.push({ name, arg }); return name === 'ai.run' ? new Promise(() => {}) : Promise.resolve({ cancelled: true }); } };
  runInNewContext(src + '\nglobalThis.make = createAiAdapter;', box);
  const stop = new AbortController();
  const done = (async () => { for await (const _ of box.make({ scope: () => null }).adapter.send({ messages: [{ role: 'user', text: 'q' }] }, { signal: stop.signal })) void _; })();
  await new Promise(r => setTimeout(r, 10));
  stop.abort();
  await done;
  const run = calls.find(c => c.name === 'ai.run').arg.run;
  assert.deepEqual(calls.filter(c => c.name === 'ai.cancel').map(c => c.arg.run), [run]);
});

/* B2-17: answers wrote the tools' UTC times; the run names the person's time zone (setting kit.timeZone) so the model writes times in it */
test('a_question_carries_the_time_zone_the_person_reads_times_in', async () => {
  for (const [setting, zone] of [['Asia/Seoul', 'Asia/Seoul'], ['utc', 'UTC'], ['system', Intl.DateTimeFormat().resolvedOptions().timeZone]]) {
    const calls = [], make = await adapterWith(calls);
    for await (const _ of make({ scope: () => null }).adapter.send({ messages: [{ role: 'user', text: 'q' }] }, { signal: AbortSignal.timeout(500), settings: { 'kit.timeZone': setting } })) { void _; }
    assert.equal(calls.find(c => c.name === 'ai.run').arg.timeZone, zone, setting);
  }
});

/* R4-15: the CLI gives model and provider names as words ("Haiku", "Claude"); the composer reads labels as Text, so each name was looked up
   as a locale key ("missing locale key: Haiku" x9). The adapter hands them on as { raw } */
test('model_and_provider_names_from_the_cli_reach_the_composer_as_raw_words_not_keys', async () => {
  const src = (await readFile(new URL('./ai-hub.js', import.meta.url), 'utf8')).replace(/^import .*;$/mg, '').replace(/^export /mg, '');
  /* what ai.providers answers: the CLI's own words */
  const cliName = 'Claude', modelName = 'Haiku';
  const box = { crypto, console, URL, Intl, hasService: () => true, onService: () => () => {}, said: x => x, text: x => x, sourceOff: x => x,
    service: async () => [{ id: 'claude', label: cliName, icon: 'brand-claude', models: [{ id: 'haiku', label: modelName }] }] };
  runInNewContext(src + '\nglobalThis.make = createAiAdapter;', box);
  const list = await box.make({ scope: () => null }).models();
  assert.deepEqual(JSON.parse(JSON.stringify(list)), [{ id: 'claude', label: { raw: 'Claude' }, icon: 'brand-claude', models: [{ id: 'haiku', label: { raw: 'Haiku' } }] }]);
});
