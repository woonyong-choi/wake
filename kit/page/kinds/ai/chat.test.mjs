import assert from 'node:assert/strict';
import test from 'node:test';

import { createChatPage } from './chat.js';

const config = { ai: {
  permissions: [{ id: 'ask', label: { raw: 'Permission' }, icon: 'lock' }], defaultPermission: 'ask',
  providers: [{ id: 'fixture', label: { raw: 'Provider' }, icon: 'bubbles', models: [{ id: 'model', label: { raw: 'Model' } }] }],
  defaultModel: { provider: 'fixture', model: 'model' },
  efforts: [{ id: 'medium', label: { raw: 'Effort' } }], defaultEffort: 'medium',
  placeholder: { start: { raw: 'Start' }, reply: { raw: 'Reply' } },
} };

test('createChatPage_deleted_conversation_clears_body_and_keeps_other_conversations', async t => {
  const original = globalThis.document;
  globalThis.document = { querySelector: () => null };
  t.after(() => { globalThis.document = original; });
  const ctx = { config, params: { id: 'c1' }, settings: () => ({}), update() {}, t: key => key, text: value => value,
    data: { get: async () => [{ id: 'c1', title: 'fixture.savedTitle', messages: [{ role: 'user', text: 'saved body' }] }] } };
  const page = await createChatPage(ctx);
  page.onConversationRemoved('c2');
  assert.equal(page.meta().title, 'fixture.savedTitle');
  page.onConversationRemoved('c1');
  const view = String(page.render());
  assert.ok(view.includes('chat.notFound'));
  assert.ok(!view.includes('saved body') && !view.includes('data-composer-input'));
});

test('createChatPage_selected_lookup_keeps_title_and_handoff_35', async () => {
  const originalDocument = globalThis.document;
  globalThis.document = { querySelector: () => null };
  try {
    const calls = [];
    const metadata = { id: 'archive-fixture', title: 'fixture.original', messages: [] };
    const ctx = { config, params: { id: metadata.id }, settings: () => ({}), update() {}, t: key => key, text: value => value,
      data: { async get(key, params) { calls.push({ key, params }); return [metadata]; } } };
    const page = await createChatPage(ctx);
    assert.deepEqual(calls, [{ key: 'ai.conversations', params: { id: metadata.id } }]);
    assert.equal(page.meta().title, metadata.title);
    page.onHandoff({ conversation: { id: metadata.id, title: 'fixture.handoff', messages: [{ role: 'user', text: 'Unsaved message' }] } });
    assert.equal(page.meta().title, 'fixture.handoff');
    const fail = (message, extra = {}) => async () => { throw Object.assign(new Error(message), extra); };
    const cases = [
      [async () => [], 'chat.notFound', false],
      [fail('data source unavailable: ai.conversations', { code: 'UNSUPPORTED' }), 'chat.unconfigured', false],
      [fail('missing', { status: 404 }), 'chat.notFound', false],
      [fail('missing', { kind: 'notFound' }), 'chat.notFound', false],
      [fail('forbidden', { status: 403 }), 'chat.denied', true],
      [fail('read failed'), 'chat.failed', true],
    ];
    for (const [get, title, retry] of cases) {
      const absent = await createChatPage({ ...ctx, data: { get } });
      const view = String(absent.render());
      assert.equal(absent.meta().title, 'chat.title');
      assert.equal(absent.meta().context, undefined);
      assert.ok(view.includes(title), title);
      assert.ok(!view.includes('data-composer-input') && !view.includes('kit.chat.more') && !view.includes('panel.newChat'));
      assert.equal(view.includes('kit.chat.retry'), retry);
    }
    // a handoff for the requested id replaces the missing state; no id stays a new chat
    const handed = await createChatPage({ ...ctx, data: { get: async () => [] } });
    handed.onHandoff({ conversation: { id: metadata.id, title: 'fixture.handoff', messages: [] } });
    assert.equal(handed.meta().title, 'fixture.handoff');
    const fresh = await createChatPage({ ...ctx, params: {}, data: { get: fail('data source unavailable', { code: 'UNSUPPORTED' }) } });
    assert.equal(fresh.meta().title, 'panel.newChat');
    assert.ok(String(fresh.render()).includes('data-composer-input'));

    // retry: guarded while pending, focusable live status in the button's place, shell meta updated on success
    let release;
    const metas = [], focused = [];
    let attempt = 0;
    const retryConfig = { ai: { ...config.ai, chatStates: { retry: 'app.flow.a.retry' } } };
    const retried = await createChatPage({ ...ctx, config: retryConfig, api: { setMeta: m => metas.push(m) }, data: { get: async () => {
      if (!attempt++) throw new Error('read failed');
      await new Promise(resolve => { release = resolve; });
      return [metadata];
    } } });
    assert.ok(String(retried.render()).includes('app.flow.a.retry'));
    const root = { querySelector: selector => selector === '[data-chat-status]' ? { focus: () => focused.push('status') } : null };
    const first = retried.actions['kit.chat.retry']();
    const second = retried.actions['kit.chat.retry'](); // ignored while pending
    const busy = String(retried.render());
    assert.ok(busy.includes('data-chat-status') && busy.includes('role="status"') && !busy.includes('kit.chat.retry'));
    retried.afterRender(root);
    assert.deepEqual(focused, ['status']);
    release();
    await Promise.all([first, second]);
    assert.equal(attempt, 2);
    assert.deepEqual(metas, [{ title: metadata.title, icon: 'bubbles', context: { icon: 'bubbles', title: metadata.title } }]);
    assert.ok(String(retried.render()).includes('data-composer-input'));
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

/* B-21: the conversation header's "…" button (its menu: rename, archive, delete) had only an icon and no accessible name */
test('chat_more_button_has_an_accessible_name', async t => {
  const original = globalThis.document;
  globalThis.document = { querySelector: () => null };
  t.after(() => { globalThis.document = original; });
  const ctx = { config, params: { id: 'c1' }, settings: () => ({}), update() {}, t: key => key, text: value => value,
    data: { get: async () => [{ id: 'c1', title: 'fixture.savedTitle', messages: [{ role: 'user', text: 'saved body' }] }] } };
  const page = await createChatPage(ctx);
  const button = String(page.render()).match(/<button[^>]*data-menu="kit.chat.more"[^>]*>/)?.[0] ?? '';
  assert.match(button, /aria-label="settings.more"/, button);
});

/* B2-04, B2-08: a conversation started here kept the tab "new chat" with no record after its first answer, and sending a message left the
   conversation where it was scrolled. The answer's saved record and title go to the shell (page:meta conversation), and a sent message shows the end */
test('a_conversation_started_here_names_its_saved_record_and_title_and_sending_shows_the_end', async t => {
  const original = globalThis.document;
  globalThis.document = { querySelector: () => null };
  t.after(() => { globalThis.document = original; });
  const metas = [];
  const adapter = { async *send(req) { yield { type: 'title', text: 'fixture.firstTitle' }; yield { type: 'text', delta: 'answer' }; yield { type: 'done', conversation: 'cv-saved' }; } };
  const page = await createChatPage({ config: { ai: { ...config.ai, adapter } }, params: { id: 'new' }, settings: () => ({ 'kit.ai.sound': false, 'kit.ai.notify': [] }), update() {}, t: key => key, text: value => value,
    api: { setMeta: m => metas.push(m) }, data: { get: async () => [] } });
  await page.actions['kit.composer.send']({ text: 'question' });
  assert.deepEqual(metas.at(-1), { title: 'fixture.firstTitle', icon: 'bubbles', context: { icon: 'bubbles', title: 'fixture.firstTitle' }, conversation: 'cv-saved' });
  const body = { scrollTop: 0, scrollHeight: 900 };
  const sent = page.actions['kit.composer.send']({ text: 'next' });
  page.afterRender({ querySelector: s => (s === '[data-chat-body]' ? body : null) });
  assert.equal(body.scrollTop, 900, 'the message just sent is in view');
  await sent;
});
