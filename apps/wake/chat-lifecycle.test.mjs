import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { EventEmitter } from 'node:events';

import config from './app.config.js';
import { conversations, refreshConversations } from './ai-hub.js';
import { chatList, filterArchive } from './data/chats.js';
import storeModule from './desktop/hub-store.cjs';
import runnerModule from './desktop/ai-run.cjs';
import servicesModule from './desktop/services.cjs';

function fixture(t) {
  const root = new URL('../../.local/tmp/', import.meta.url);
  mkdirSync(root, { recursive: true });
  const userData = mkdtempSync(join(root.pathname, 'chat-lifecycle-'));
  t.after(() => rmSync(userData, { recursive: true, force: true }));
  const maskText = text => ({ text, n: 0 });
  const store = storeModule.createHubStore({ userData, maskText });
  const at = Date.now() - 1000;
  for (const id of ['c1', 'c2']) store.docs('conversations').put(id, { title: 'fixture.sameTitle', cluster: 'fixture', at, messages: [{ role: 'user', text: id }], state: 'active' });
  const runner = runnerModule.createAiRunner({ store, maskText, secret: (method, target) => (method === 'ai-key' && target === 'anthropic' ? 'test-key' : null), audit() {}, tools: { list: () => [] } });
  return { userData, store, runner, at, reopen: () => storeModule.createHubStore({ userData, maskText }) };
}

test('archive_restore_remove_persist_same_id_and_preserve_audit', t => {
  const { runner, store, reopen, at } = fixture(t);
  store.log('audit').append({ conversation: 'c1', action: 'model' });
  assert.equal(runner.archive('c1'), true);
  assert.deepEqual(runner.list().map(c => c.id), ['c2']);
  const archived = runner.list({ includeArchived: true });
  assert.deepEqual(filterArchive(chatList(archived, {}), {}).map(c => c.id), ['c1']);
  assert.equal(reopen().docs('conversations').get('c1').at, at);
  assert.equal(runner.restore('c1'), true);
  assert.equal(reopen().docs('conversations').get('c1').state, 'active');
  assert.equal(runner.list().length, 2);
  assert.equal(runner.remove('c1'), true);
  assert.equal(reopen().docs('conversations').get('c1'), null);
  assert.deepEqual(runner.list({ includeArchived: true }).map(c => c.id), ['c2']);
  assert.equal(store.log('audit').list().length, 1);
  assert.equal(runner.archive('missing'), false);
  assert.equal(runner.restore('missing'), false);
  assert.equal(runner.remove('missing'), false);
});

test('run_finishing_after_archive_or_delete_does_not_undo_the_change', async t => {
  for (const op of ['archive', 'remove']) {
    const { runner, reopen } = fixture(t);
    let release;
    t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { release = resolve; }));
    const pending = runner.run({ conversation: 'c1', messages: [{ role: 'user', text: 'next' }], model: { provider: 'anthropic', model: 'fixture' } }, () => {});
    assert.equal(runner[op]('c1'), true);
    release({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'late answer' }] }) });
    await pending;
    const saved = reopen().docs('conversations').get('c1');
    if (op === 'archive') assert.equal(saved.state, 'archived');
    else assert.equal(saved, null);
    t.mock.restoreAll();
  }
});

test('chat_actions_use_service_before_success_and_delete_only_after_confirmation', async t => {
  const { userData, reopen } = fixture(t);
  const app = new EventEmitter(), previous = process.env.KUBECONFIG;
  process.env.KUBECONFIG = join(userData, 'missing-kubeconfig');
  const services = servicesModule.create({ userData, app, emit() {} });
  t.after(() => {
    app.emit('will-quit');
    if (previous === undefined) delete process.env.KUBECONFIG; else process.env.KUBECONFIG = previous;
    delete globalThis.kitService;
    conversations.splice(0);
  });
  const calls = [], toasts = [], navigations = [], settings = { 'wake.clusters.list': [{ id: 'fixture', state: 'ok' }], 'wake.clusters.connected': ['fixture'] };
  globalThis.kitService = { on() {}, call: async (name, args) => {
    calls.push({ name, args });
    assert.equal(typeof services[name], 'function', name);
    return services[name](args);
  } };
  await refreshConversations();
  const api = { state: { settings }, settings: { get: key => settings[key] }, setSetting: (key, value) => { settings[key] = value; },
    refresh() {}, toast: value => toasts.push(value), navigate: (...args) => navigations.push(args) };
  const rows = () => config.sidebar.sections.find(s => s.id === 'conversations').rows(api.state).filter(r => r.kind === 'conv');
  await config.actions['wake.chat.archive']({ arg: 'c1' }, api);
  assert.ok(calls.some(c => c.name === 'ai.chat' && c.args.op === 'archive'));
  assert.equal(reopen().docs('conversations').get('c1').state, 'archived');
  assert.deepEqual(rows().map(r => r.id), ['c2']);
  const archive = config.settings.groups.flatMap(g => g.pages).find(p => p.id === 'archive');
  assert.equal((await archive.sections({ settings: () => settings }))[0].count, 1);
  await config.actions['wake.chat.reopen']({ arg: 'c1' }, api);
  assert.equal(reopen().docs('conversations').get('c1').state, 'active');
  assert.equal(navigations[0][0], 'wake://chat/c1');
  const dialog = config.dialogs['wake.chat.deleteDlg']('c1');
  assert.ok(reopen().docs('conversations').get('c1'), 'opening or cancelling the dialog does not delete');
  await config.actions[dialog.submit.action]({ arg: dialog.submit.arg }, api);
  assert.equal(reopen().docs('conversations').get('c1'), null);
  assert.ok(reopen().docs('conversations').get('c2'));
  await refreshConversations();
  assert.deepEqual(rows().map(r => r.id), ['c2']);
  assert.equal(toasts.at(-1).title, 'wake.chat.deleted');

  globalThis.kitService.call = async () => { throw new Error('write failed'); };
  await config.actions['wake.chat.delete']({ arg: 'c2' }, api);
  assert.ok(reopen().docs('conversations').get('c2'));
  assert.equal(toasts.at(-1).tone, 'error');
  assert.deepEqual(rows().map(r => r.id), ['c2']);
});
