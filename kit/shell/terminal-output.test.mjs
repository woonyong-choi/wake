import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createTerminalOutputs, createTerminalOutputViews, createTerminals } from './terminal.js';

const shellSource = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
const output = { title: 'diagnostic.title', rawText: 'HTTP 503', source: 'http', sourceLabel: 'diagnostic.http', readOnlyLabel: 'diagnostic.readOnly', truncated: true, limitLabel: 'diagnostic.lastPart' };
function fixture(onChange) {
  const tabs = new Set(['a', 'b']), contexts = new Map([['a', 'unit://view/a'], ['b', 'unit://view/b']]);
  let active = 'a';
  const outputs = createTerminalOutputs({ hasTab: id => tabs.has(id), activeTab: () => active, contextOf: id => contexts.get(id), onChange });
  const action = (payload = {}, tabId = 'a') => outputs.bindAction(payload, tabId);
  const identity = (bound = action(), attempt = 1) => ({ owner: bound.outputOwner, scope: 'target-a', tool: 'prometheus', flow: 'connection-a', attempt });
  return { tabs, contexts, outputs, action, identity, activate: id => { active = id; } };
}

function extract(start, end) {
  return shellSource.slice(shellSource.indexOf(start), shellSource.indexOf(end, shellSource.indexOf(start)));
}

test('page_action_binds_real_sender_and_consumer_reads_stored_flow_raw', () => {
  const f = fixture(), payload = { name: 'diagnose', sourceTabId: 'b', outputOwner: {}, arg: { sourceTabId: 'b', ownerTabId: 'b', outputOwner: {}, raw: 'forged raw', flow: 'connection-a' }, values: { sourceTabId: 'b', outputOwner: {} } };
  const storedFlows = new Map([['connection-a', { ...output }]]);
  let bound;
  const config = { actions: { diagnose(a) { bound = a; const ticket = f.outputs.begin(f.identity(a)); assert.equal(f.outputs.show(ticket, storedFlows.get(a.arg.flow)).ok, true); } } };
  const runAction = runInNewContext(extract('  function runAction(', '  function runShortcut(') + '\nrunAction', { panel: null, kitActions: {}, config, terminalOutputs: f.outputs, tabs: { state: { active: 'b' } }, api: {}, console });
  const branch = shellSource.match(/case 'page:action': ([^\n]+) break;/)[1];
  const dispatch = runInNewContext('(p, tabId) => { ' + branch + ' }', { config, runAction });
  dispatch(payload, 'a');
  assert.equal(bound.sourceTabId, 'a');
  assert.notEqual(bound.outputOwner, payload.outputOwner);
  assert.notEqual(bound.outputOwner, bound.arg.outputOwner);
  assert.equal(f.outputs.current().ownerTabId, 'a');
  assert.equal(f.outputs.current().rawText, 'HTTP 503');
  assert.equal(bound.arg.raw, 'forged raw');
  assert.equal(f.outputs.begin({ ...f.identity(), owner: JSON.parse(JSON.stringify(bound.outputOwner)) }), null);
});

test('output_tickets_reject_forgery_late_attempts_and_context_changes', () => {
  const f = fixture(), identity = f.identity(), first = f.outputs.begin(identity);
  assert.equal(f.outputs.show({}, output).reason, 'invalid-ticket');
  identity.scope = 'changed'; identity.tool = 'changed';
  assert.equal(f.outputs.show(first, output).ok, true);
  assert.equal(f.outputs.current().scope, 'target-a');
  assert.equal(f.outputs.current().tool, 'prometheus');
  const next = f.outputs.begin(f.identity(f.action(), 2));
  assert.equal(f.outputs.current(), null);
  assert.equal(f.outputs.show(first, output).reason, 'stale-attempt');
  assert.equal(f.outputs.begin(f.identity(f.action(), 1)), null);
  assert.equal(f.outputs.begin(f.identity(f.action(), 2)), next);
  assert.equal(f.outputs.show(next, output).ok, true);
  f.contexts.set('a', 'unit://view/b');
  assert.equal(f.outputs.current(), null);
  assert.equal(f.outputs.show(next, output).reason, 'owner-target-changed');
  assert.equal(f.outputs.begin(f.identity()), null);
  f.contexts.set('a', 'unit://view/a');
  assert.equal(f.outputs.current().rawText, 'HTTP 503');
  for (const attempt of [0, -1, NaN, Infinity, 1.5]) assert.equal(f.outputs.begin(f.identity(f.action(), attempt)), null);
});

test('other_tabs_hide_output_return_preserves_it_and_closed_owners_are_invalid', () => {
  const f = fixture(), bound = f.action(), ticket = f.outputs.begin(f.identity(bound));
  assert.equal(f.outputs.show(ticket, output).ok, true);
  const record = f.outputs.current();
  f.activate('b');
  assert.equal(f.outputs.current(), null);
  assert.equal(f.outputs.show(ticket, { ...output, rawText: 'late update' }).reason, 'inactive-owner');
  f.activate('a');
  assert.equal(f.outputs.current(), record);
  assert.equal(record.rawText, 'HTTP 503');
  f.tabs.delete('a'); f.outputs.release('a');
  assert.equal(f.outputs.show(ticket, output).reason, 'closed-owner');
  assert.equal(f.outputs.current(), null);
  assert.equal(f.outputs.keys().size, 0);
  f.tabs.add('a');
  assert.equal(f.outputs.begin(f.identity(bound)), null);
  assert.equal(f.outputs.show(ticket, output).reason, 'stale-attempt');
});

test('real_tab_close_and_pinned_unload_revoke_output_owner_capabilities', () => {
  for (const pinned of [false, true]) {
    const f = fixture(), bound = f.action(), ticket = f.outputs.begin(f.identity(bound)), tab = { id: 'a', pinned, unloaded: false };
    f.outputs.show(ticket, output);
    const tabs = { state: { active: 'b', tabs: [tab, { id: 'b', unloaded: false }] }, find: () => tab,
      close: () => { f.tabs.delete('a'); return tab; } };
    const code = extract('  function unloadPinned(', '  /* a new tab right below');
    const handlers = runInNewContext(code + '\n({ unloadPinned, closeTab })', { terminalOutputs: f.outputs, tabs,
      host: { destroy() {}, show() {} }, render() {}, saveSession() {}, navigate() {}, activate() {}, startAddress: 'unit',
      cardOf: () => null, closeDetailCards() {} }); // no detail overlay open: the source tab's own owner is what is revoked
    handlers.closeTab('a');
    assert.equal(f.outputs.current(), null);
    assert.equal(f.outputs.begin(f.identity(bound)), null);
    assert.equal(f.outputs.show(ticket, output).ok, false);
  }
});

test('close_detail_releases_its_own_output_owner_and_pending_work_keeps_no_capability', () => {
  const f = fixture();
  f.tabs.add('d'); f.contexts.set('d', 'unit://detail/d');
  const bound = f.action({}, 'd'), ticket = f.outputs.begin(f.identity(bound)), pending = f.outputs.begin(f.identity(bound, 2));
  f.activate('d');
  assert.equal(f.outputs.show(pending, output).ok, true);
  const calls = [];
  const code = extract('  function dropDetail(', '  function syncDetail(');
  const card = { id: 'd', kind: 'detail', base: 'a', ready: true, expanded: false };
  const context = { chain: [card], detailSent: new Map([['d', 'sent']]), terminalOutputs: f.outputs,
    tabs: { state: { active: 'a' }, closeOverlay: id => { f.tabs.delete(id); calls.push(['closeOverlay', id]); }, find: id => (f.tabs.has(id) ? { id } : null) },
    host: { destroy: id => calls.push(['destroy', id]), send: () => {} }, placeCards() {},
    render() {}, envelope: () => ({}), clearTimeout, setTimeout };
  context.topDetail = () => context.chain[context.chain.length - 1];
  runInNewContext(code + '\nclosed = closeDetailAt', Object.assign(context, { closed: null }))(card, { now: true });
  assert.equal(context.chain.length, 0);
  assert.deepEqual(calls.slice(0, 2), [['closeOverlay', 'd'], ['destroy', 'd']]);
  // the overlay's records are gone and every capability issued for it is dead, even when its id were reused
  assert.equal(f.outputs.current(), null);
  assert.equal(f.outputs.keys().size, 0);
  f.tabs.add('d'); f.activate('d');
  assert.equal(f.outputs.show(ticket, output).ok, false);
  assert.equal(f.outputs.show(pending, output).ok, false);
  assert.equal(f.outputs.begin(f.identity(bound, 3)), null);
});

test('raw_source_and_truncation_provenance_are_required_without_fallback_output', () => {
  const f = fixture(), ticket = f.outputs.begin(f.identity());
  for (const bad of [{ rawText: '' }, { rawText: undefined }, { source: 'pty' }, { sourceLabel: '' }, { readOnlyLabel: '' }, { limitLabel: '' }, { truncated: undefined }]) {
    assert.equal(f.outputs.show(ticket, { ...output, ...bad }).reason, 'invalid-output');
    assert.equal(f.outputs.current(), null);
  }
  assert.equal(f.outputs.show(ticket, { ...output, truncated: false, limitLabel: undefined }).ok, true);
  assert.equal(f.outputs.current().limitLabel, '');
  assert.equal(f.outputs.close(ticket).ok, true);
  assert.equal(f.outputs.current(), null);
});

function documentFixture() {
  const doc = { activeElement: null, createElement: tag => new Element(tag, doc) };
  class Element {
    constructor(tag, document) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = []; this.attributes = {}; this.className = ''; this.textContent = ''; this.scrollTop = 0; this.scrollLeft = 0;
      this.classList = { contains: name => this.className.split(' ').includes(name),
        add: name => { if (!this.classList.contains(name)) this.className += ' ' + name; },
        remove: name => { this.className = this.className.split(' ').filter(x => x !== name).join(' '); } };
    }
    set innerHTML(_) { throw new Error('diagnostic must use safe text nodes'); }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...elements) { for (const element of elements) this.appendChild(element); }
    appendChild(element) { element.remove(); element.parent = this; this.children.push(element); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; }
    focus() { this.ownerDocument.activeElement = this; }
    get firstElementChild() { return this.children[0]; }
    get lastElementChild() { return this.children.at(-1); }
  }
  return { doc, body: doc.createElement('div') };
}

test('diagnostics_render_control_characters_as_text_with_no_pty_or_stdin', () => {
  const { doc, body } = documentFixture(), calls = [];
  const terms = createTerminals({ doc, desktop: { invoke: (...args) => { calls.push(args); throw new Error('PTY forbidden'); }, on: (...args) => { calls.push(args); throw new Error('PTY listeners forbidden'); } }, config: { terminal: {} }, api: {} });
  terms.mount(body);
  const rawText = '\u001b]52;c;payload\u0007\n<script>unsafe()</script>\u001b[31m\r\u202e';
  const record = { ...output, key: 'same-as-interactive', rawText };
  terms.showOutput(record);
  const host = body.firstElementChild;
  assert.equal(host.attributes.tabindex, '0');
  assert.equal(host.attributes.role, 'region');
  assert.match(host.firstElementChild.textContent, /diagnostic.http.*diagnostic.readOnly.*diagnostic.lastPart/);
  assert.equal(host.lastElementChild.textContent, '\\u001b]52;c;payload\\u0007\n<script>unsafe()</script>\\u001b[31m\\u000d\\u202e');
  assert.equal(record.rawText, rawText);
  assert.deepEqual(calls, []);
  assert.equal(terms.has(record.key), false);
  host.scrollTop = 70; host.scrollLeft = 20;
  terms.hide(); terms.showOutput(record);
  assert.equal(body.firstElementChild, host);
  assert.equal(host.scrollTop, 70); assert.equal(host.scrollLeft, 20);
  terms.retainOutputs(new Set());
  assert.equal(body.children.length, 0);
  assert.deepEqual(calls, []);
});

test('read_only_views_keep_interactive_and_run_sessions_alive_even_for_equal_keys', () => {
  const { doc, body } = documentFixture(), calls = [], sessions = new Map();
  for (const key of ['interactive', 'running-command']) {
    const host = doc.createElement('div'); host.className = 'tpn-host on'; body.appendChild(host);
    sessions.set(key, { id: key, host, term: { dispose: () => calls.push('dispose'), write: () => calls.push('write') }, done: () => calls.push('done') });
  }
  const original = [...sessions.values()], views = createTerminalOutputViews({ doc, sessions });
  views.mount(body); views.show({ ...output, key: 'interactive' });
  const readOnly = body.lastElementChild;
  assert.equal(doc.activeElement, readOnly);
  assert.equal(sessions.size, 2);
  assert.deepEqual([...sessions.values()], original);
  assert.ok(original.every(session => body.children.includes(session.host)));
  assert.ok(original.every(session => !session.host.classList.contains('on')));
  readOnly.scrollTop = 25;
  views.hide(); views.show({ ...output, key: 'interactive' });
  assert.equal(body.lastElementChild, readOnly); assert.equal(readOnly.scrollTop, 25);
  views.retain(new Set());
  assert.equal(body.children.length, 2);
  assert.deepEqual(calls, []);
});

test('dock_output_priority_and_close_only_reveal_existing_interactive_or_run_views', () => {
  const f = fixture(), calls = [], state = { terminalOpen: true, run: null };
  const expand = { dataset: { tpnExpanded: 'false' } }, restore = { dataset: { tpnExpanded: 'true' } };
  const controls = { children: [expand, restore] };
  const dock = { firstElementChild: true, querySelector: selector => selector === '[data-tpn-expand]' ? controls : null,
    classList: { toggle: (...args) => calls.push(['dock', ...args]) } };
  const terms = { retainOutputs() {}, has: () => true, showOutput: record => calls.push(['diagnostic', record.key]), reveal: (key, options) => calls.push(['reveal', key, options]), show: key => calls.push(['start', key]), hide: () => calls.push(['hide']) };
  let active = { id: 'tab-a', address: 'demo://subject/a' };
  const tabs = { active: () => active, current: tab => tab };
  const panes = {};
  const context = { dock, terms, tabs, activeTerminalOpen: () => active.id === 'tab-a' || state.terminalOpen, frame: { querySelector: () => panes }, terminalOutputs: f.outputs, placeDock() {}, state, termKey: () => 'interactive', config: {}, text: value => value, firstRun: null, dockExpanded: false };
  const syncDock = runInNewContext(extract('  function syncDock(', '  function render()') + '\nsyncDock', context);
  const ticket = f.outputs.begin(f.identity()); f.outputs.show(ticket, output);
  syncDock(true);
  assert.equal(calls.at(-2)[0], 'diagnostic');
  assert.equal(state.terminalOpen, true);
  f.outputs.close(ticket); syncDock(true);
  assert.ok(calls.some(row => row[0] === 'reveal' && row[1] === 'interactive'));
  state.run = { key: 'running-command', title: 'existing.run' }; const run = state.run;
  f.outputs.show(ticket, output); syncDock(true);
  assert.equal(state.run, run);
  f.outputs.close(ticket); syncDock(true);
  assert.ok(calls.some(row => row[0] === 'reveal' && row[1] === 'running-command'));
  assert.equal(calls.some(row => row[0] === 'start'), false);
  assert.ok(calls.filter(row => row[0] === 'reveal').every(row => row[2].fit === false));
  state.run = null;
  context.termKey = () => active.id === 'tab-a' ? 'tool-shell' : 'interactive';
  context.dockExpanded = true;
  syncDock(true);
  assert.ok(expand.hidden && !restore.hidden);
  assert.equal(panes.inert, true);
  assert.deepEqual(calls.at(-3), ['dock', 'expanded', true]);
  assert.equal(calls.at(-2)[1], 'tool-shell');
  active = { id: 'tab-b', address: 'demo://subject/b' };
  syncDock(true);
  assert.equal(calls.at(-2)[1], 'interactive');
  terms.has = () => false; state.run = null;
  syncDock(true);
  assert.equal(calls.at(-2)[0], 'hide');
  assert.equal(panes.inert, false);
});
