import assert from 'node:assert/strict';
import test from 'node:test';

import { createPanelEngine } from './panel-engine.js';

const config = { ai: { permissions: [{ id: 'read', label: { raw: 'Read only' }, icon: 'eye', desc: { raw: 'Read' } }, { id: 'ask', label: { raw: 'Ask first' }, icon: 'shield', desc: { raw: 'Ask' } }], defaultPermission: 'read', defaultModel: {}, providers: [], efforts: [], settingsAddress: 'test://settings/models', approvals: { allowAlways: false, choices: [{ id: 'allow' }, { id: 'deny' }] } } };


test('composer_permission_menus_keep_only_safe_choices_and_model_settings', () => {
  const panel = createPanelEngine(config, { data: {} });
  const menus = panel.menus({});
  assert.equal(panel.state.permission, 'read');
  for (const permission of ['read', 'ask']) {
    panel.actions['kit.ai.set-permission']({ arg: permission });
    const direct = menus['kit.ai.permission']().items;
    const nested = menus['kit.ai.plus']().items.find(item => item.id === 'plus-perm').submenu.items;
    for (const items of [direct, nested]) {
      assert.deepEqual(items.map(item => item.arg), ['read', 'ask']);
      assert.deepEqual(items.filter(item => item.checked).map(item => item.arg), [permission]);
      assert.ok(items.every(item => !item.icon && !item.desc));
    }
  }
  const settings = menus['kit.ai.model']().items.find(item => item.id === 'ai-settings');
  assert.equal(settings.arg.address, config.ai.settingsAddress);
  assert.equal(config.ai.approvals.allowAlways, false);
  assert.deepEqual(config.ai.approvals.choices.map(choice => choice.id), ['allow', 'deny']);
  panel.newChat();
  assert.equal(panel.state.permission, 'read');
});

test('approval_requires_explicit_ask_allow_and_an_execution_result', async () => {
  for (const permission of ['read', 'ask', 'unknown']) for (const choice of ['allow', 'deny', 'always']) {
    let calls = 0;
    const adapter = { recordApprovalDecision: (id, choice, extra) => ({ state: 'denied', by: 'actor', time: extra.time }), async resolveApproval(id, selected, extra) { calls++; assert.equal(extra.permission, 'ask'); return { state: 'ran' }; } };
    const panel = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {} });
    const proposal = { type: 'approval', id: 'p', state: 'pending' };
    panel.adopt({ id: 'c', messages: [{ parts: [proposal] }] });
    panel.state.permission = permission;
    await panel.actions['kit.question.choose']({ id: 'p', choice });
    assert.equal(proposal.state, permission === 'ask' && choice === 'allow' ? 'ran' : 'denied');
    assert.equal(calls, permission === 'ask' && ['allow', 'deny'].includes(choice) ? 1 : 0);
    await panel.actions['kit.question.choose']({ id: 'p', choice: 'allow' });
    assert.equal(calls, permission === 'ask' && ['allow', 'deny'].includes(choice) ? 1 : 0);
  }
  const panel = createPanelEngine({ ai: { ...config.ai, adapter: {} } }, { data: {} });
  const proposal = { type: 'approval', id: 'p', state: 'pending' };
  panel.adopt({ id: 'c', messages: [{ parts: [proposal] }] }); panel.state.permission = 'ask';
  await panel.actions['kit.question.choose']({ id: 'p', choice: 'allow' });
  assert.equal(proposal.state, 'denied');
});


test('failed_block_record_stays_pending_and_retries_without_resolving', async t => {
  t.mock.method(console, 'error', () => {});
  let fail = true, calls = 0;
  const adapter = {
    recordApprovalDecision(id, choice, extra) { if (fail) throw new Error('record failed'); return { state: 'denied', by: 'actor', time: extra.time }; },
    resolveApproval() { calls++; },
  };
  const panel = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {} });
  const proposal = { type: 'approval', id: 'failure', state: 'pending' };
  panel.adopt({ id: 'c', messages: [{ parts: [proposal] }] });
  await panel.actions['kit.question.cancel']({ id: proposal.id });
  assert.equal(proposal.state, 'pending');
  fail = false;
  await panel.actions['kit.question.cancel']({ id: proposal.id });
  assert.equal(proposal.state, 'denied'); assert.equal(proposal.by, 'actor'); assert.equal(calls, 0);
});

test('loadList_selected_id_preserves_empty_body_and_default_panel_list_35', async () => {
  const known = { id: 'archived-fixture', title: 'fixture.original', last: 'Summary only', messages: [], bodyMissing: true };
  const active = { id: 'active-fixture', title: 'fixture.active', messages: [{ role: 'user', text: 'Original body' }] };
  const calls = [];
  const panel = createPanelEngine(config, { data: { async get(key, params) {
    calls.push({ key, params });
    if (params.id === 'failed-fixture') throw new Error('read failed');
    return params.id ? params.id === known.id ? [known] : [] : [active];
  } } });

  await panel.loadList();
  assert.deepEqual(panel.state.list, [active]);
  assert.deepEqual(calls[0], { key: 'ai.conversations', params: {} });
  panel.select(active.id);
  assert.equal(panel.current().messages[0].text, 'Original body');
  await panel.loadList({ id: known.id });
  panel.select(known.id);
  assert.deepEqual(calls.at(-1).params, { id: known.id });
  assert.equal(panel.current().id, known.id);
  assert.equal(panel.current().title, known.title);
  assert.deepEqual(panel.current().messages, []);
  assert.equal(panel.renderMessages(), '');
  panel.renderMessages('full');
  assert.deepEqual(panel.current().messages, []);
  for (const id of ['unknown-fixture', 'failed-fixture']) {
    await panel.loadList({ id }); panel.select(id);
    assert.equal(panel.current(), undefined);
    assert.equal(panel.renderMessages('full'), '');
  }
  panel.adopt({ id: 'new-empty-fixture', title: '', messages: [] });
  assert.equal(panel.renderMessages('full'), '');
  panel.newChat();
  assert.equal(panel.renderMessages('full'), '');
  panel.adopt({ ...active, messages: [{ role: 'user', text: 'Unsaved handoff' }] });
  assert.equal(panel.current().messages[0].text, 'Unsaved handoff');
});

test('an allowed proposal the app only recorded reads approved, never ran; a deny never becomes approved', async () => {
  for (const choice of ['allow', 'deny']) {
    const adapter = { recordApprovalDecision: () => ({ state: 'denied', by: 'a', time: 't' }), resolveApproval: async () => ({ state: 'approved', by: 'oncall', time: '10:00' }) };
    const panel = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {} });
    const proposal = { type: 'approval', id: 'p', state: 'pending' };
    panel.adopt({ id: 'c', messages: [{ parts: [proposal] }] }); panel.state.permission = 'ask';
    await panel.actions['kit.question.choose']({ id: 'p', choice });
    assert.equal(proposal.state, choice === 'allow' ? 'approved' : 'denied');
  }
});

test('models() replaces the providers and picks the first model; none connected says so on the model button', async () => {
  const lists = [[{ id: 'local', label: { raw: 'Local' }, icon: 'ai', models: [{ id: 'm1', label: { raw: 'Model one' } }] }], []];
  for (const list of lists) {
    const panel = createPanelEngine({ ai: { ...config.ai, adapter: {}, models: async () => list } }, { data: {} });
    assert.equal(panel.state.modelsRead, false);
    await panel.loadModels();
    assert.equal(panel.state.modelsRead, true);
    assert.deepEqual(panel.state.model, list.length ? { provider: 'local', model: 'm1' } : {});
    assert.equal(panel.menus({})['kit.ai.model']().items.filter(i => String(i.id).startsWith('prov-')).length, list.length);
  }
});

test('an answer whose refs name its "[n]" marks draws them as reference pills that open the cited address; other marks stay as written', async () => {
  const adapter = { async *send() { yield { type: 'text', blocks: [{ p: ['Restarts rose [1], then [2]; see [9].'] }] }; yield { type: 'done', refs: [{ n: 1, label: 'Logs · api · 14:02:05', tip: 'OOMKilled', address: 'app://x/evidence/1' }, { n: 2, label: 'Events · BackOff' }] }; } };
  const panel = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {} });
  await panel.send('why');
  const out = String(panel.renderMessages('panel'));
  assert.match(out, /class="evr"[^>]*data-action="kit\.ai\.ref"[^>]*data-tip="OOMKilled"[^>]*>Logs · api · 14:02:05</);
  assert.match(out, />Events · BackOff</);
  assert.match(out, /see \[9\]\./);
  assert.doesNotMatch(out, /\[1\]|\[2\]/);
  const key = JSON.parse(out.match(/class="evr"[^>]*data-arg="([^"]+)"/)[1].replace(/&quot;/g, '"'));
  const went = [];
  panel.actions['kit.ai.ref']({ arg: key }, { api: { navigate: (address, o) => went.push([address, o.presentation]) } });
  assert.deepEqual(went, [['app://x/evidence/1', 'detail']]);
  panel.actions['kit.ai.ref']({ arg: 'unknown:1' }, { api: { navigate: () => went.push('wrong') } });
  assert.equal(went.length, 1);
});

test('an answer without refs keeps its "[n]" marks as plain text', async () => {
  const adapter = { async *send() { yield { type: 'text', blocks: [{ p: ['see [1]'] }] }; yield { type: 'done' }; } };
  const panel = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {} });
  await panel.send('why');
  const out = String(panel.renderMessages('panel'));
  assert.match(out, /see \[1\]/);
  assert.doesNotMatch(out, /class="evr"/);
});

/* a step the AI reads carries its id: a later step event with the same id changes that row (its state and how long it took), it never adds a second row.
   A step with a state draws as the step row's state form (what the AI reads): the status mark of the state, the text, the quiet meta */
test('a step event with an id updates its row in place and draws its state and meta', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const adapter = { async *send() {
    yield { type: 'step', id: 's1', icon: 'search', text: 'Read the item list in lab', state: 'run' };
    yield { type: 'text', delta: 'Reading ' };
    await gate;
    yield { type: 'step', id: 's1', state: 'done', meta: '2s' };
    yield { type: 'step', id: 's2', icon: 'search', text: 'Read events in lab', state: 'run' };
    yield { type: 'step', id: 's2', state: 'fail', meta: '1s' };
    yield { type: 'text', delta: 'the items.' };
    yield { type: 'done' };
  } };
  const panel = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {} });
  const sent = panel.send('items?');
  await new Promise(r => setTimeout(r, 0));
  const live = panel.current().messages.at(-1);
  assert.deepEqual(live.steps.map(s => [s.id, s.state]), [['s1', 'run']]);
  assert.match(String(panel.renderMessages('panel')), /Reading /, 'the text written so far shows while the step runs');
  release(); await sent;
  const a = panel.current().messages.at(-1);
  assert.deepEqual(a.steps.map(s => [s.id, s.text, s.state, s.meta]), [['s1', 'Read the item list in lab', 'done', '2s'], ['s2', 'Read events in lab', 'fail', '1s']]);
  panel.actions['kit.steps.toggle']({ id: a.id, open: true });
  const out = String(panel.renderMessages('panel'));
  assert.match(out, /class="sr st" data-c="step-row" data-state="done"[\s\S]*?Read the item list in lab[\s\S]*?sr-meta[^>]*>2s</);
  assert.match(out, /data-state="fail"[\s\S]*?Read events in lab/);
  assert.match(out, /Reading the items\./);
});

/* text that streams in pieces: a blank line starts a new paragraph, and the time the steps took before the first words is kept on the answer (not 0 s) */
test('streamed text splits into paragraphs at blank lines and the work before it keeps its time', async t => {
  let clock = 1_000_000;
  t.mock.method(Date, 'now', () => clock);
  let release;
  const gate = new Promise(r => { release = r; });
  const adapter = { async *send() {
    yield { type: 'step', id: 's1', text: 'Read the item list in lab', state: 'run' };
    clock += 5000;
    yield { type: 'step', id: 's1', state: 'done', meta: '5s' };
    yield { type: 'text', delta: 'First para' };
    yield { type: 'text', delta: 'graph.\n\nSecond' };
    await gate;
    yield { type: 'text', delta: ' one.' };
    yield { type: 'done' };
  } };
  const panel = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {} });
  const sent = panel.send('items?');
  for (let i = 0; i < 20 && !panel.current().messages.at(-1)?.parts?.length; i++) await new Promise(r => setTimeout(r, 1));
  const a = panel.current().messages.at(-1);
  assert.equal(a.seconds, 5, 'the steps took 5 s before the words came');
  release(); await sent;
  assert.deepEqual(a.parts.filter(p => p.type === 'text').flatMap(p => p.blocks.map(b => b.p.join(''))), ['First paragraph.', 'Second one.']);
});

/* B-03: with no model to run, the effort menu offered five levels and "fast" as if they would run; and a model that takes no effort (the
   subscription CLIs) still showed the effort button. No model: every effort row and the fast switch are disabled under the reason line.
   A chosen model shows the effort button only when it says it takes an effort (effort: true) */
test('effort_is_disabled_with_a_reason_without_a_model_and_shown_only_for_a_model_that_takes_it', async () => {
  const efforts = [{ id: 'low', label: { raw: 'Low' } }, { id: 'high', label: { raw: 'High' } }];
  const none = createPanelEngine({ ai: { ...config.ai, efforts, defaultEffort: 'high', models: async () => [] } }, { data: {} });
  await none.loadModels();
  const items = none.menus({})['kit.ai.effort']().items;
  const runnable = items.filter(item => item.action?.startsWith('kit.ai.') && !item.disabled).map(item => item.id);
  assert.deepEqual(runnable, [], `nothing runs without a model: ${runnable}`);
  assert.ok(items.some(item => item.type === 'label' && /model/i.test(item.label)), 'a line says why');
  const withModel = takes => createPanelEngine({ ai: { ...config.ai, placeholder: { start: { raw: 'Ask' }, reply: { raw: 'Reply' } }, efforts, defaultEffort: 'high', models: async () => [{ id: 'p', label: { raw: 'P' }, models: [{ id: 'm', label: { raw: 'M' }, ...(takes ? { effort: true } : {}) }] }] } }, { data: {} });
  const cli = withModel(false); await cli.loadModels();
  assert.doesNotMatch(cli.renderBottom().s, /data-menu="kit.ai.effort"/, 'a model that takes no effort shows no effort button');
  const api = withModel(true); await api.loadModels();
  assert.match(api.renderBottom().s, /data-menu="kit.ai.effort"/);
});

/* B-11: with no model connected the model menu held only the search field and "Settings": nothing said there is no model. Its first line says so */
test('model_menu_without_a_model_says_there_is_none_before_the_way_to_settings', async () => {
  const none = createPanelEngine({ ai: { ...config.ai, models: async () => [] } }, { data: {} });
  await none.loadModels();
  const items = none.menus({})['kit.ai.model']().items;
  const line = items.findIndex(item => item.type === 'label' && /model/i.test(item.label)), settings = items.findIndex(item => item.action === 'kit.navigate' || item.id === 'settings');
  assert.ok(line >= 0, `a line says there is no model: ${JSON.stringify(items.map(i => i.type || i.id))}`);
  assert.ok(settings < 0 || line < settings, 'the line comes before the way to settings');
});

/* B-09: an error the app sends with an action (the "no model" failure and its settings page) shows that action as a working link, live and reopened */
test('an_error_with_an_action_shows_the_action_as_a_link_live_and_reopened', async () => {
  const action = { label: 'composer.settings', action: 'kit.navigate', arg: { address: 'test://settings/models' } };
  const adapter = { async *send() { yield { type: 'error', message: 'No models', action }; } };
  const panel = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {} });
  await panel.send('hi');
  const link = /data-action="kit.navigate" data-arg="\{&quot;address&quot;:&quot;test:\/\/settings\/models&quot;\}"><span>composer.settings<\/span>/;
  assert.match(String(panel.renderMessages('panel')), link, 'the live failure links to the settings page');
  panel.adopt({ id: 'r', messages: [{ role: 'assistant', id: 'a', steps: [], parts: [{ type: 'error', text: 'No models', action }] }] });
  assert.match(String(panel.renderMessages('panel')), link, 'the reopened failure links to the settings page');
});

/* AI-2: a streamed and a saved answer draw their Markdown table, list and code with the answer's table and code views; "[n]" marks still cite */
test('an answer written in markdown draws its list, table and code block, live and reopened', async () => {
  const text = 'Restarts [1]:\n\n- **api** 13\n\n| Item | Count |\n|---|---|\n| api | 13 |\n\n```sh\napp list items\n```';
  const adapter = { async *send() { for (const piece of text.match(/[\s\S]{1,7}/g)) yield { type: 'text', delta: piece }; yield { type: 'done', refs: [{ n: 1, label: 'Events · BackOff' }] }; } };
  const panel = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {} });
  await panel.send('why');
  const out = String(panel.renderMessages('panel'));
  assert.match(out, /<ul><li><strong>api<\/strong> 13<\/li><\/ul>/);
  assert.match(out, /data-c="message-table"[\s\S]*<th[^>]*>(?:Item)<\/th>[\s\S]*<td>api<\/td>/);
  assert.match(out, /data-c="code-block"/);
  assert.match(out, />Events · BackOff</);
  assert.doesNotMatch(out, /\|---|```/);
});

/* B2-09: a stopped answer showed only "worked for 3 s" with nothing saying it was stopped, and its running step ended as a failure. A stopped
   answer says it was cancelled (neutral, not an error) and a step still running ends as stopped (off), live and reopened */
test('a_stopped_answer_says_cancelled_and_its_running_step_ends_stopped_not_failed', async () => {
  const adapter = { async *send(_req, { signal }) {
    yield { type: 'step', id: 's1', icon: 'search', text: 'Read pods', state: 'run' };
    await new Promise(r => signal.addEventListener('abort', r, { once: true }));
  } };
  const panel = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {} });
  const sent = panel.send('pods?');
  await new Promise(r => setTimeout(r, 0));
  panel.actions['kit.composer.stop']();
  await sent;
  const a = panel.current().messages.at(-1);
  assert.deepEqual(a.steps.map(s => s.state), ['off'], 'the running step is stopped, not failed');
  const out = String(panel.renderMessages('panel'));
  assert.match(out, /Cancelled/, 'the answer says it was cancelled');
  assert.doesNotMatch(out, /sti error/, 'not drawn as an error');
  const reopened = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: { get: async () => [{ id: 'c1', title: 't', messages: [{ role: 'assistant', id: 'm1', steps: [{ id: 's', text: 'Read pods', state: 'off' }], parts: [{ type: 'cancelled' }], time: null }] }] } });
  await reopened.loadList({}); reopened.select('c1');
  assert.match(String(reopened.renderMessages('panel')), /Cancelled/);
});

/* B2-04: a conversation the store saved without a title event kept the header "new chat"; it is named by its first question, as the store lists it */
test('a_saved_conversation_without_a_title_is_named_by_its_first_question', async () => {
  const adapter = { async *send() { yield { type: 'text', delta: 'ok' }; yield { type: 'done', conversation: 'cv-1' }; } };
  const panel = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {} });
  await panel.send('which pods restart the most?');
  assert.equal(panel.current().title, 'which pods restart the most?');
  assert.equal(panel.current().savedId, 'cv-1');
});

/* B3-05: a saved conversation opened again drew differently from the live one: its steps open as rows (red failures in plain view), no "worked
   for" line, no time under the answer, no context chip on the question. The live and the reopened conversation draw with the same parts and state.
   B3-18: times read the one RULE-TIME way (today HH:mm, another day YYYY-MM-DD HH:mm), not a locale clock ("6:39 AM" in the reader's words) */
test('a_reopened_conversation_draws_like_the_live_one_with_steps_folded_times_and_the_context_chip', async () => {
  const at = new Date(2026, 10, 18, 6, 39, 0), chip = { icon: 'calendar', title: 'events', sub: 'lab' };
  const adapter = { async *send() {
    yield { type: 'step', id: 's1', icon: 'search', text: 'Read events', state: 'run' };
    yield { type: 'step', id: 's1', state: 'fail', meta: '1s' };
    yield { type: 'text', delta: 'None found.' };
    yield { type: 'done', conversation: 'cv-live' };
  } };
  const live = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {}, now: () => at });
  await live.send('warnings?', chip);
  const sent = live.current().messages;
  /* what the store gives back for the same run */
  const saved = [{ id: 'cv-live', title: 'warnings?', messages: [
    { id: 'u1', role: 'user', text: 'warnings?', at: +at, chip },
    { id: 'a1', role: 'assistant', at: +at, seconds: sent[1].seconds, steps: [{ id: 's1', icon: 'search', text: 'Read events', state: 'fail', meta: '1s' }], parts: [{ type: 'text', blocks: [{ p: ['None found.'] }] }] }] }];
  const reopened = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: { get: async () => saved }, now: () => at });
  await reopened.loadList({}); reopened.select('cv-live');
  const shape = s => String(s).replace(/data-message="[^"]*"|data-steps="[^"]*"|id="[^"]*"|aria-controls="[^"]*"|data-arg="[^"]*"/g, '');
  assert.equal(shape(reopened.renderMessages('full')), shape(live.renderMessages('full')), 'the reopened conversation draws as the live one did');
  const out = String(live.renderMessages('full'));
  assert.match(out, />06:39</, 'the time reads HH:mm today');
  assert.doesNotMatch(out, /AM|PM|\uC624\uC804|\uC624\uD6C4/, 'not a locale clock');
  assert.match(out, /data-c="context-chip"[\s\S]*events/, 'the question keeps its context chip');
  const other = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: { get: async () => saved }, now: () => new Date(2026, 10, 20, 9, 0, 0) });
  await other.loadList({}); other.select('cv-live');
  assert.match(String(other.renderMessages('full')), />2026-11-18 06:39</, 'another day reads YYYY-MM-DD HH:mm');
});

/* B3-10: the header title was the question cut at 60 characters with no mark, so the cut read as the whole title. The title is the question
   (the header clips it with an ellipsis and shows it whole as a tooltip); a title cut for length ends with an ellipsis */
test('a_conversation_named_by_its_question_keeps_the_question_and_marks_a_cut', async () => {
  const long = 'show the three latest warning events of the payments space as a table with time, reason, object and message, messages as written.';
  const adapter = { async *send() { yield { type: 'text', delta: 'ok' }; yield { type: 'done', conversation: 'cv-2' }; } };
  const panel = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {} });
  await panel.send(long);
  assert.equal(panel.current().title, long, 'the whole question');
  const longer = 'x'.repeat(300);
  const p2 = createPanelEngine({ ai: { ...config.ai, adapter } }, { data: {} });
  await p2.send(longer);
  assert.match(p2.current().title, /…$/, 'a title cut for length says so');
});
