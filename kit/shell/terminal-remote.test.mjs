import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createTerminals, createTerminalOutputViews, createTerminalOutputs } from './terminal.js';

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function settleUntil(predicate) {
  for (let count = 0; count < 80; count++) { if (predicate()) return; await Promise.resolve(); }
  assert.ok(predicate(), 'expected asynchronous boundary reached');
}
function element() {
  const classes = new Set();
  return { children: [], style: {}, dataset: {}, attributes: {}, scrollTop: 0,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
    appendChild(child) { this.children.push(child); child.parent = this; }, append(...children) { children.forEach(child => this.appendChild(child)); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
    setAttribute(name, value) { this.attributes[name] = value; }, focus() { this.focused = true; },
    get firstElementChild() { return this.children[0]; }, get lastElementChild() { return this.children.at(-1); },
  };
}
function target(contextId) {
  return { contextId, accountId: '123456789012', region: 'example-region', instanceId: 'i-example', scope: 'example-scope',
    remoteContext: 'example-context', remoteKubeconfigPath: '/example/config', remoteUser: 'remote-self', profile: 'example-profile',
    session: { kind: 'default-shell' }, expiresAt: '2026-11-06T01:00:00Z', maxDurationMs: 60000, idleTimeoutMs: 30000 };
}
function fixture({ open = async key => ({ mode: key.startsWith('remote') ? 'remote' : 'local', ...(key.startsWith('remote') ? { contextId: 'context-a' } : { env: { EXAMPLE: 'local' }, cwd: '/example' }) }), invoke } = {}) {
  const calls = [], events = new Map(), states = [], terminals = [], records = [], body = element();
  let owner = { tabId: 'tab-a', address: 'example://target/a' };
  class Terminal {
    constructor(options) { this.options = options; this.cols = 80; this.rows = 24; this.writes = []; terminals.push(this); }
    loadAddon() {} open(host) { this.host = host; } attachCustomKeyEventHandler() {} focus() { this.focused = true; }
    write(value) { this.writes.push(value); } dispose() { this.disposed = true; }
    onData(callback) { this.input = callback; } onResize(callback) { this.resize = callback; }
  }
  class FitAddon { fit() {} }
  const doc = { documentElement: element(), body: element(), head: element(), querySelector: () => null,
    createElement(tag) { const value = element(); if (tag === 'canvas') value.getContext = () => ({ fillRect() {}, getImageData: () => ({ data: [1, 2, 3, 255] }) }); return value; } };
  const desktop = { on: (name, callback) => events.set(name, callback), async invoke(name, ...args) {
    calls.push({ name, args });
    if (invoke) { const result = invoke(name, ...args); if (result !== undefined) return result; }
    if (name === 'pty:open') return args[0].mode === 'remote' ? { id: args[0].id, mode: 'remote', state: 'connecting', target: target(args[0].contextId) }
      : { id: args[0].id, mode: 'local', user: 'local-self' };
    if (name === 'pty:run') return { id: args[0].id, mode: 'local', user: 'local-self' };
    return {};
  } };
  const driverSource = createTerminals.toString().replace("import('../vendor/xterm/xterm.mjs')", 'Promise.resolve({ Terminal: TerminalDouble })')
    .replace("import('../vendor/xterm/addon-fit.mjs')", 'Promise.resolve({ FitAddon: FitAddonDouble })').replaceAll('import.meta.url', 'moduleUrl');
  const create = runInNewContext('(' + driverSource + ')', { TerminalDouble: Terminal, FitAddonDouble: FitAddon, createTerminalOutputViews, URL, moduleUrl: import.meta.url,
    text: value => typeof value === 'string' ? value : value?.raw || '', outputText: value => value,
    t: key => key, shortcutOf: () => '', getComputedStyle: () => ({ getPropertyValue: name => name === '--term-bg' ? 'transparent' : '1', color: 'transparent' }) });
  const terms = create({ doc, desktop, config: { terminal: { open, record: record => records.push(record),
    describe: status => ({ notice: { raw: `example.${status.state}` } }) } }, api: {}, ownerOf: () => owner,
    onState: status => states.push(status) });
  terms.mount(body);
  return { terms, calls, states, terminals, records, body, events, activate: value => { owner = value; },
    openCalls: () => calls.filter(call => call.name === 'pty:open'), emit: (name, ...args) => events.get(name)?.(...args) };
}

test('remote_open_sends_only_allowed_payload_and_never_promotes_connecting', async () => {
  const f = fixture();
  await f.terms.show('remote-a');
  const request = f.openCalls()[0].args[0];
  assert.deepEqual(Object.keys(request).sort(), ['cols', 'contextId', 'id', 'mode', 'rows']);
  assert.equal(request.mode, 'remote'); assert.equal(request.contextId, 'context-a');
  f.emit('pty-data', request.id, 'example remote output');
  f.emit('pty-command', request.id, { command: 'must not record remote command' });
  assert.equal(f.terms.status('remote-a').state, 'connecting');
  assert.equal(f.terms.status('remote-a').user, null);
  assert.equal(f.terms.status('remote-a').target.remoteUser, 'remote-self');
  assert.equal(f.records.length, 0);
  assert.ok(f.terminals[0].writes.includes('example remote output'));
});

test('local_open_and_run_send_explicit_local_mode_and_remote_open_preserves_local_session', async () => {
  const f = fixture();
  await f.terms.show('local-a');
  const local = f.terminals[0];
  await f.terms.show('remote-a');
  assert.equal(local.disposed, undefined);
  assert.equal(f.calls.some(call => call.name === 'pty:close'), false);
  const localRequest = f.openCalls()[0].args[0];
  assert.equal(localRequest.mode, 'local'); assert.equal(localRequest.env.EXAMPLE, 'local');
  assert.equal(Object.hasOwn(localRequest, 'contextId'), false);
  const run = f.terms.run('run-a', { id: 'example.run', args: { item: 'a' }, line: 'example command' }, { env: { EXAMPLE: 'run' } });
  await settleUntil(() => f.calls.some(call => call.name === 'pty:run'));
  const request = f.calls.find(call => call.name === 'pty:run').args[0];
  assert.equal(request.mode, 'local'); assert.equal(request.command, 'example.run'); assert.deepEqual(request.args, { item: 'a' }, 'the declared command and its arguments, never a command line');
  f.emit('pty-exit', request.id, 0);
  assert.equal((await run).exit, 0);
  assert.equal(local.disposed, undefined);
});

test('remote_failures_and_missing_modes_never_open_local_or_retry_dead_session', async () => {
  const cases = [
    { open: async () => ({ env: {} }), expected: 'TERMINAL_MODE_REQUIRED' },
    { open: async () => ({ mode: 'other' }), expected: 'TERMINAL_MODE_REQUIRED' },
    { open: async () => { throw new Error('example failure'); }, expected: 'TERMINAL_UNAVAILABLE' },
    { invoke: name => name === 'pty:open' ? { error: 'fixed native failure', code: 'REMOTE_EXPIRED' } : undefined, expected: 'REMOTE_EXPIRED' },
    { invoke: name => { if (name === 'pty:open') return Promise.reject(new Error('example failure')); }, expected: 'TERMINAL_UNAVAILABLE' },
  ];
  for (const options of cases) {
    const f = fixture(options); await f.terms.show('remote-a'); await f.terms.show('remote-a');
    assert.equal(f.terms.status('remote-a').state, 'failed');
    assert.equal(f.terms.status('remote-a').code, options.expected);
    assert.ok(f.openCalls().every(call => call.args[0].mode === 'remote'));
    assert.ok(f.openCalls().length <= 1);
    assert.equal(f.calls.some(call => call.name === 'pty:run'), false);
    assert.equal(f.terminals[0].options.disableStdin, true);
  }
});

test('remote_input_forbidden_fields_are_rejected_before_native_open', async () => {
  for (const name of ['env', 'cwd', 'host', 'profile', 'argv', 'command', 'preview', 'session', 'document', 'parameters', 'params']) {
    const f = fixture({ open: async () => ({ mode: 'remote', contextId: 'context-a', [name]: 'untrusted' }) });
    await f.terms.show('remote-a');
    assert.equal(f.terms.status('remote-a').code, 'REMOTE_ARGUMENTS_REJECTED');
    assert.equal(f.openCalls().length, 0);
  }
});

test('late_descriptor_and_native_responses_cannot_cross_owner_or_exact_address', async () => {
  for (const owner of [{ tabId: 'tab-b', address: 'example://target/a' }, { tabId: 'tab-a', address: 'example://target/b' }]) {
    const descriptor = deferred(), before = fixture({ open: () => descriptor.promise });
    const starting = before.terms.show('remote-a');
    await settleUntil(() => before.terminals.length > 0);
    before.activate(owner); descriptor.resolve({ mode: 'remote', contextId: 'context-a' }); await starting;
    assert.equal(before.openCalls().length, 0);
    const response = deferred(), after = fixture({ invoke: name => name === 'pty:open' ? response.promise : undefined });
    const pending = after.terms.show('remote-a');
    await settleUntil(() => after.openCalls().length === 1);
    after.activate(owner);
    const request = after.openCalls()[0].args[0];
    response.resolve({ id: request.id, mode: 'remote', state: 'connecting', target: target('context-a') }); await pending;
    assert.equal(after.calls.filter(call => call.name === 'pty:close').length, 1);
    assert.equal(after.openCalls().length, 1);
    assert.equal(after.terms.status('remote-a'), null);
    assert.equal(after.terminals[0].options.disableStdin, true);
  }
});

test('remote_exit_metadata_remains_visible_without_automatic_reconnect', async () => {
  for (const state of ['cancelled', 'expired', 'disconnected', 'cleanup_failed', 'cleanup_pending', 'unverified-success']) {
    const f = fixture(); await f.terms.show('remote-a'); const request = f.openCalls()[0].args[0];
    f.emit('pty-exit', request.id, 0, { mode: 'remote', state, target: target('context-a') });
    await f.terms.show('remote-a');
    assert.equal(f.terms.status('remote-a').state, ['unverified-success', 'cleanup_pending'].includes(state) ? 'failed' : state);
    assert.equal(f.openCalls().length, 1);
    assert.equal(f.terminals[0].options.disableStdin, true);
    assert.equal(f.terms.has('remote-a'), true);
  }
});

test('wrong_owner_cannot_reveal_remote_buffer_or_input_and_original_owner_can_return', async () => {
  const f = fixture(); await f.terms.show('remote-a'); const request = f.openCalls()[0].args[0], term = f.terminals[0];
  f.activate({ tabId: 'tab-b', address: 'example://target/b' });
  f.terms.reveal('remote-a'); term.input('must not send');
  assert.equal(f.terms.has('remote-a'), false);
  assert.equal(term.host.parent.classList.contains('on'), false);
  assert.equal(f.calls.some(call => call.name === 'pty:write'), false);
  f.activate({ tabId: 'tab-a', address: 'example://target/a' }); await f.terms.show('remote-a'); term.input('example input');
  assert.equal(term.host.parent.classList.contains('on'), true);
  assert.equal(f.calls.find(call => call.name === 'pty:write').args[0], request.id);
  assert.equal(f.openCalls().length, 1);
  const run = await f.terms.run('remote-a', 'must not replace remote');
  assert.equal(run.error, 'TERMINAL_SESSION_CONFLICT');
  assert.equal(term.disposed, undefined);
});

test('closed_owner_revokes_pending_remote_and_does_not_close_existing_local', async () => {
  const response = deferred(), f = fixture({ invoke: (name, request) => name === 'pty:open' && request.mode === 'remote' ? response.promise : undefined });
  await f.terms.show('local-a'); const local = f.terminals[0];
  const pending = f.terms.show('remote-a'); await settleUntil(() => f.openCalls().length === 2);
  const outputs = createTerminalOutputs({ hasTab: () => true, activeTab: () => 'tab-a', onRelease: tabId => f.terms.releaseOwner(tabId) });
  outputs.release('tab-a');
  const request = f.openCalls()[1].args[0]; response.resolve({ id: request.id, mode: 'remote', state: 'connecting', target: target('context-a') }); await pending;
  assert.equal(f.calls.filter(call => call.name === 'pty:close').length, 1);
  assert.equal(local.disposed, undefined);
  assert.equal(f.terms.status('local-a').state, 'open');
  assert.equal(f.terms.status('remote-a'), null);
});

test('diagnostic_view_stays_visible_during_late_remote_completion_and_preserves_sessions', async () => {
  const response = deferred(), f = fixture({ invoke: name => name === 'pty:open' ? response.promise : undefined });
  const pending = f.terms.show('remote-a'); await settleUntil(() => f.openCalls().length === 1);
  f.terms.showOutput({ key: 'output-a', title: 'example.diagnostic', rawText: 'HTTP 503', sourceLabel: 'example.http', readOnlyLabel: 'example.readOnly' });
  const outputHost = f.body.children.at(-1), request = f.openCalls()[0].args[0];
  response.resolve({ id: request.id, mode: 'remote', state: 'connecting', target: target('context-a') }); await pending;
  assert.equal(outputHost.classList.contains('on'), true);
  assert.equal(f.terminals[0].host.parent.classList.contains('on'), false);
  assert.equal(f.terminals[0].disposed, undefined);
  assert.equal(f.calls.some(call => call.name === 'pty:close'), false);
  f.terms.reveal('remote-a', { fit: false });
  assert.equal(outputHost.classList.contains('on'), false);
  assert.equal(f.terminals[0].host.parent.classList.contains('on'), true);
});

test('shell_owner_and_state_callbacks_are_bound_to_real_tab_and_current_session', () => {
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const expression = source.match(/ownerOf: (\(\) => \{[^\n]+\})\s*, config:/)[1];
  // the active base tab and the presented detail overlay differ: the owner is the page of the top bar (the detail in front), never the base
  const base = { id: 'base-tab' }, overlay = { id: 'real-tab' };
  let presented = overlay;
  const tabs = { state: { active: base.id }, active: () => base, presented: () => presented, current: tab => ({ address: 'example://target/' + tab.id }) };
  const ownerOf = runInNewContext('(' + expression + ')', { tabs, termTab: () => presented, termKey: () => 'remote-a' });
  assert.equal(ownerOf('remote-a').tabId, 'real-tab');
  assert.equal(ownerOf('remote-a').address, 'example://target/real-tab');
  assert.equal(ownerOf('another-logical-key').tabId, 'real-tab');
  presented = base; // overlay closed: the base tab owns again
  assert.equal(ownerOf('remote-a').tabId, 'base-tab');
  presented = null;
  assert.equal(ownerOf('remote-a'), null);
  assert.ok(source.includes('onState: () => syncDock(true)'));
  assert.ok(source.includes('onRelease: id => { openTerminals.delete(id); terms?.releaseOwner(id); }'));
});

test('remote_response_mismatch_closes_only_requested_session_and_preserves_cleanup_failure', async () => {
  for (const cleanupFails of [false, true]) {
    const f = fixture({ invoke(name, request) {
      if (name === 'pty:open') return { id: request.id, mode: 'local', user: 'must not become remote identity' };
      if (name === 'pty:close' && cleanupFails) return { error: 'fixed close failure' };
    } });
    await f.terms.show('remote-a');
    assert.equal(f.terms.status('remote-a').state, cleanupFails ? 'cleanup_failed' : 'cleanup_unconfirmed');
    assert.equal(f.terms.status('remote-a').user, null);
    assert.equal(f.calls.filter(call => call.name === 'pty:close').length, 1);
    assert.equal(f.openCalls().length, 1);
    assert.equal(f.calls.find(call => call.name === 'pty:close').args[0], f.openCalls()[0].args[0].id);
  }
});

test('remote_exit_before_open_response_keeps_terminal_state_and_blocks_stdin', async () => {
  const response = deferred(), f = fixture({ invoke: name => name === 'pty:open' ? response.promise : undefined });
  const pending = f.terms.show('remote-a'); await settleUntil(() => f.openCalls().length === 1);
  const request = f.openCalls()[0].args[0];
  f.emit('pty-exit', request.id, null, { mode: 'remote', state: 'cleanup_failed' });
  response.resolve({ id: request.id, mode: 'remote', state: 'connecting', target: target('context-a') }); await pending;
  assert.equal(f.terms.status('remote-a').state, 'cleanup_failed');
  assert.equal(f.terminals[0].input, undefined);
  assert.equal(f.terminals[0].options.disableStdin, true);
  await f.terms.show('remote-a');
  assert.equal(f.openCalls().length, 1);
});

test('native_group_capture_failure_keeps_cleanup_unconfirmed_and_same_session_blocked', async () => {
  const f = fixture({ invoke: name => name === 'pty:open' ? { error: 'fixed native failure', code: 'REMOTE_START_FAILED', cleanup: 'unconfirmed' } : undefined });
  await f.terms.show('remote-a'); await f.terms.show('remote-a');
  assert.equal(f.terms.status('remote-a').state, 'cleanup_unconfirmed');
  assert.equal(f.terms.status('remote-a').cleanup, 'unconfirmed');
  assert.equal(f.terms.status('remote-a').errorCode, 'REMOTE_START_FAILED');
  assert.equal(f.terms.status('remote-a').code, 'REMOTE_CLEANUP_UNCONFIRMED');
  assert.equal(f.openCalls().length, 1);
  assert.ok(f.openCalls().every(call => call.args[0].mode === 'remote'));
});

test('logical_key_is_separated_by_trusted_owner_and_exact_address_without_app_identity', async () => {
  for (const other of [{ tabId: 'tab-b', address: 'example://target/a' }, { tabId: 'tab-a', address: 'example://target/b' }]) {
    const f = fixture(); await f.terms.show('local-a'); const local = f.terminals[0];
    await f.terms.show('remote-a'); const first = f.openCalls()[1].args[0], firstView = f.terminals[1];
    f.activate(other); await f.terms.show('remote-a'); const second = f.openCalls()[2].args[0], secondView = f.terminals[2];
    assert.notEqual(first.id, second.id);
    assert.equal(f.calls.some(call => call.name === 'pty:close'), false);
    assert.equal(f.terms.status('remote-a').key, 'remote-a');
    assert.equal(firstView.host.parent.classList.contains('on'), false);
    assert.equal(secondView.host.parent.classList.contains('on'), true);
    firstView.input('must not write');
    assert.equal(f.calls.some(call => call.name === 'pty:write'), false);
    f.activate({ tabId: 'tab-a', address: 'example://target/a' }); await f.terms.show('remote-a'); firstView.input('example');
    assert.equal(f.calls.find(call => call.name === 'pty:write').args[0], first.id);
    assert.equal(f.openCalls().length, 3);
    assert.equal(local.disposed, undefined);
  }
});

test('canonical_native_target_collision_waits_for_confirmed_new_id_cleanup_before_adoption', async () => {
  let opens = 0;
  const f = fixture({ invoke(name, request) {
    if (name === 'pty:open') {
      const descriptor = target(request.contextId); opens++;
      return { id: request.id, mode: 'remote', state: 'connecting', target: opens === 1 ? descriptor : Object.fromEntries(Object.entries(descriptor).reverse()) };
    }
    if (name === 'pty:close') return true;
  } });
  await f.terms.show('remote-a'); const original = f.terminals[0], originalId = f.openCalls()[0].args[0].id;
  await f.terms.show('remote-b'); const duplicate = f.terminals[1], duplicateId = f.openCalls()[1].args[0].id;
  assert.equal(f.terms.status('remote-b').state, 'cleanup_unconfirmed');
  assert.equal(duplicate.disposed, undefined);
  assert.equal(f.calls.filter(call => call.name === 'pty:close')[0].args[0], duplicateId);
  assert.equal(original.disposed, undefined);
  f.emit('pty-exit', duplicateId, null, { mode: 'remote', state: 'cancelled', target: target('context-a') });
  assert.equal(duplicate.disposed, true);
  assert.equal(f.terms.status('remote-b').key, 'remote-b');
  assert.equal(f.terms.status('remote-b').state, 'connecting');
  original.input('example input');
  assert.equal(f.calls.find(call => call.name === 'pty:write').args[0], originalId);
  assert.equal(f.calls.some(call => call.name === 'pty:close' && call.args[0] === originalId), false);
});

test('native_identity_comes_only_from_open_response_and_distinct_targets_do_not_collide', async () => {
  let opens = 0;
  const f = fixture({ open: async () => ({ mode: 'remote', contextId: 'context-a', target: { inventedIdentity: 'must not be authoritative' } }),
    invoke(name, request) {
      if (name !== 'pty:open') return;
      return { id: request.id, mode: 'remote', state: 'connecting', target: { ...target(request.contextId), instanceId: `actual-native-${++opens}` } };
    } });
  await f.terms.show('remote-a'); await f.terms.show('remote-b');
  assert.equal(f.calls.some(call => call.name === 'pty:close'), false);
  assert.equal(f.terms.status('remote-b').target.instanceId, 'actual-native-2');
  assert.equal(Object.hasOwn(f.terms.status('remote-b').target, 'inventedIdentity'), false);
  assert.equal(f.terms.status('remote-b').state, 'connecting');
  await f.terms.show('remote-a');
  assert.equal(f.terms.status('remote-a').target.instanceId, 'actual-native-1');
  assert.equal(f.openCalls().length, 2);
});

test('collision_cleanup_unconfirmed_failed_or_wrong_target_never_adopts_existing_session', async () => {
  for (const outcome of ['accepted', 'unconfirmed', 'failed', 'throw', 'wrong-target']) {
    const f = fixture({ invoke(name) {
      if (name !== 'pty:close') return;
      if (outcome === 'unconfirmed') return { cleanup: 'unconfirmed' };
      if (outcome === 'failed') return false;
      if (outcome === 'throw') return Promise.reject(new Error('fixed cleanup failure'));
      return true;
    } });
    await f.terms.show('remote-a'); const original = f.terminals[0];
    await f.terms.show('remote-b'); const duplicate = f.terminals[1], id = f.openCalls()[1].args[0].id;
    if (outcome === 'wrong-target') f.emit('pty-exit', id, null, { mode: 'remote', state: 'cancelled', target: { ...target('context-a'), instanceId: 'wrong-native-identity' } });
    else if (outcome === 'failed') f.emit('pty-exit', id, null, { mode: 'remote', state: 'cleanup_failed', target: target('context-a') });
    assert.ok(['cleanup_unconfirmed', 'cleanup_failed'].includes(f.terms.status('remote-b').state));
    assert.equal(duplicate.disposed, undefined);
    assert.equal(original.disposed, undefined);
    await f.terms.show('remote-b'); assert.equal(f.openCalls().length, 2);
  }
});

test('late_same_logical_owner_response_cannot_replace_new_owner_alias', async () => {
  const first = deferred(); let opens = 0;
  const f = fixture({ invoke(name, request) { if (name === 'pty:open' && ++opens === 1) return first.promise; } });
  const pending = f.terms.show('remote-a'); await settleUntil(() => f.openCalls().length === 1);
  const id = f.openCalls()[0].args[0].id;
  f.activate({ tabId: 'tab-b', address: 'example://target/b' }); await f.terms.show('remote-a');
  const current = f.terminals[1];
  first.resolve({ id, mode: 'remote', state: 'connecting', target: target('context-a') }); await pending;
  assert.equal(f.terms.status('remote-a').state, 'connecting');
  assert.equal(current.host.parent.classList.contains('on'), true);
  assert.equal(f.calls.find(call => call.name === 'pty:close').args[0], id);
  current.input('example input');
  assert.equal(f.calls.find(call => call.name === 'pty:write').args[0], f.openCalls()[1].args[0].id);
});

test('confirmed_collision_cleanup_does_not_displace_diagnostic_or_cross_changed_owner', async () => {
  for (const changeOwner of [false, true]) {
    const f = fixture({ invoke: name => name === 'pty:close' ? true : undefined });
    await f.terms.show('local-a'); const local = f.terminals[0];
    await f.terms.show('remote-a'); const original = f.terminals[1];
    await f.terms.show('remote-b'); const id = f.openCalls()[2].args[0].id;
    f.terms.showOutput({ key: 'output-a', title: 'example.diagnostic', rawText: 'HTTP 503', sourceLabel: 'example.http', readOnlyLabel: 'example.readOnly' });
    const output = f.body.children.at(-1);
    if (changeOwner) f.activate({ tabId: 'tab-b', address: 'example://target/b' });
    f.emit('pty-exit', id, null, { mode: 'remote', state: 'cancelled', target: target('context-a') });
    assert.equal(output.classList.contains('on'), true);
    assert.equal(original.host.parent.classList.contains('on'), false);
    assert.equal(original.disposed, undefined); assert.equal(local.disposed, undefined);
    if (changeOwner) assert.equal(f.terms.status('remote-b'), null);
    else assert.equal(f.terms.status('remote-b').state, 'connecting');
  }
});

test('revoked_owner_generation_cannot_alias_or_write_to_recreated_same_tab', async () => {
  const f = fixture({ invoke: name => name === 'pty:close' ? true : undefined });
  await f.terms.show('remote-a'); const first = f.openCalls()[0].args[0], old = f.terminals[0];
  f.terms.releaseOwner('tab-a');
  await f.terms.show('remote-a'); const second = f.openCalls()[1].args[0], active = f.terminals[1];
  assert.notEqual(first.id, second.id);
  f.emit('pty-exit', first.id, null, { mode: 'remote', state: 'cancelled', target: target('context-a') });
  assert.equal(f.terms.status('remote-a').state, 'connecting');
  old.input('must not send'); active.input('example input');
  assert.equal(f.calls.filter(call => call.name === 'pty:write').length, 1);
  assert.equal(f.calls.find(call => call.name === 'pty:write').args[0], second.id);
});

test('confirmed_collision_exit_before_close_response_reconciles_once', async () => {
  let f;
  f = fixture({ invoke(name, id) {
    if (name !== 'pty:close') return;
    f.emit('pty-exit', id, null, { mode: 'remote', state: 'cancelled', target: target('context-a') });
    return true;
  } });
  await f.terms.show('remote-a'); await f.terms.show('remote-b');
  assert.equal(f.terminals[1].disposed, true);
  assert.equal(f.terms.status('remote-b').state, 'connecting');
  assert.equal(f.terms.status('remote-b').key, 'remote-b');
  assert.equal(f.calls.filter(call => call.name === 'pty:close').length, 1);
  assert.equal(f.terminals[0].disposed, undefined);
});

test('collision_cannot_adopt_an_existing_remote_already_awaiting_cleanup', async () => {
  const f = fixture({ invoke: name => name === 'pty:close' ? true : undefined });
  await f.terms.show('remote-a'); f.terms.cancel('remote-a');
  await f.terms.show('remote-b'); const duplicate = f.terminals[1], id = f.openCalls()[1].args[0].id;
  f.emit('pty-exit', id, null, { mode: 'remote', state: 'cancelled', target: target('context-a') });
  assert.equal(f.terms.status('remote-b').state, 'failed');
  assert.equal(f.terms.status('remote-a').state, 'cleanup_unconfirmed');
  assert.equal(duplicate.disposed, undefined);
  assert.equal(f.terminals[0].disposed, undefined);
  assert.equal(f.openCalls().length, 2);
});

test('return63_exit_failure_states_and_exact_open_codes_survive_both_delivery_orders', async () => {
  const failures = [['identity_failed', 'REMOTE_IDENTITY_FAILED'], ['account_mismatch', 'REMOTE_ACCOUNT_MISMATCH'],
    ['unavailable', 'REMOTE_PTY_UNAVAILABLE'], ['start_failed', 'REMOTE_START_FAILED']];
  for (const [state, code] of failures) for (const exitFirst of [true, false]) {
    const response = deferred(), f = fixture({ invoke: name => name === 'pty:open' ? response.promise : undefined });
    const opening = f.terms.show('remote-a'); await settleUntil(() => f.openCalls().length === 1);
    const id = f.openCalls()[0].args[0].id, metadata = { mode: 'remote', state, target: target('context-a') };
    if (exitFirst) f.emit('pty-exit', id, null, metadata);
    response.resolve({ error: 'fixed native failure', code }); await opening;
    if (!exitFirst) f.emit('pty-exit', id, null, metadata);
    assert.equal(f.terms.status('remote-a').state, state);
    assert.equal(f.terms.status('remote-a').code, code);
    assert.equal(f.terms.status('remote-a').errorCode, code);
    assert.equal(f.terminals[0].options.disableStdin, true);
    await f.terms.show('remote-a'); assert.equal(f.openCalls().length, 1);
    assert.equal(f.calls.some(call => call.name === 'pty:run'), false);
  }
});

test('return63_spawn_zero_error_envelopes_keep_exact_codes_without_exit_or_fallback', async () => {
  for (const code of ['REMOTE_EXECUTABLE_UNAVAILABLE', 'REMOTE_IDENTITY_FAILED', 'REMOTE_ACCOUNT_MISMATCH', 'REMOTE_PREFLIGHT_CANCELLED']) {
    const f = fixture({ invoke: name => name === 'pty:open' ? { error: 'fixed native failure', code } : undefined });
    await f.terms.show('remote-a'); await f.terms.show('remote-a');
    assert.equal(f.terms.status('remote-a').code, code);
    assert.equal(f.terms.status('remote-a').errorCode, code);
    assert.equal(f.openCalls().length, 1);
    assert.equal(f.openCalls()[0].args[0].mode, 'remote');
    assert.equal(f.terminals[0].input, undefined);
    assert.equal(f.calls.some(call => call.name === 'pty:run'), false);
  }
});

test('return63_native_exit_state_is_not_overwritten_by_late_ipc_rejection', async () => {
  for (const [state, code] of [['identity_failed', 'REMOTE_IDENTITY_FAILED'], ['cleanup_failed', 'REMOTE_CLEANUP_FAILED']]) {
    let reject;
    const response = new Promise((_, fail) => { reject = fail; });
    const f = fixture({ invoke: name => name === 'pty:open' ? response : undefined });
    const opening = f.terms.show('remote-a'); await settleUntil(() => f.openCalls().length === 1);
    f.emit('pty-exit', f.openCalls()[0].args[0].id, null, { mode: 'remote', state, target: target('context-a') });
    reject(new Error('fixed transport failure')); await opening;
    assert.equal(f.terms.status('remote-a').state, state);
    assert.equal(f.terms.status('remote-a').code, code);
    assert.equal(f.openCalls().length, 1);
  }
});

test('return63_pending_identity_owner_release_or_cancel_closes_before_open_settles', async () => {
  for (const action of ['release', 'cancel']) {
    const account = deferred(); let f, cancelled = false, responseSettled = false, simulatedPtySpawns = 0;
    f = fixture({ invoke(name, request) {
      if (name === 'pty:open') return account.promise.then(() => {
        responseSettled = true;
        if (cancelled) return { error: 'fixed preflight cancellation', code: 'REMOTE_PREFLIGHT_CANCELLED' };
        simulatedPtySpawns++;
        return { id: request.id, mode: 'remote', state: 'connecting', accountVerified: true, target: target(request.contextId) };
      });
      if (name === 'pty:close') {
        assert.equal(responseSettled, false);
        cancelled = true;
        f.emit('pty-exit', request, null, { mode: 'remote', state: 'cancelled', target: target('context-a') });
        return true;
      }
    } });
    const opening = f.terms.show('remote-a'); await settleUntil(() => f.openCalls().length === 1);
    if (action === 'release') f.terms.releaseOwner('tab-a'); else f.terms.cancel('remote-a');
    assert.equal(f.calls.filter(call => call.name === 'pty:close').length, 1);
    assert.equal(cancelled, true);
    assert.equal(responseSettled, false);
    account.resolve(); await opening;
    assert.equal(simulatedPtySpawns, 0);
    assert.equal(f.calls.filter(call => call.name === 'pty:close').length, 1);
    assert.equal(f.states.at(-1).state, 'cancelled');
    assert.equal(f.states.at(-1).code, 'REMOTE_PREFLIGHT_CANCELLED');
    assert.equal(f.states.at(-1).errorCode, 'REMOTE_PREFLIGHT_CANCELLED');
    assert.equal(f.terminals[0].input, undefined);
    assert.ok(f.openCalls().every(call => call.args[0].mode === 'remote'));
    if (action === 'release') assert.equal(f.terms.status('remote-a'), null);
  }
});

test('return63_preflight_expiry_and_cleanup_failure_preserve_terminal_state_with_exact_cause', async () => {
  for (const state of ['expired', 'cleanup_failed']) {
    const response = deferred(), f = fixture({ invoke: name => name === 'pty:open' ? response.promise : undefined });
    const opening = f.terms.show('remote-a'); await settleUntil(() => f.openCalls().length === 1);
    f.emit('pty-exit', f.openCalls()[0].args[0].id, null, { mode: 'remote', state, target: target('context-a') });
    response.resolve({ error: 'fixed native failure', code: state === 'expired' ? 'REMOTE_EXPIRED' : 'REMOTE_PREFLIGHT_CANCELLED' }); await opening;
    assert.equal(f.terms.status('remote-a').state, state);
    assert.equal(f.terms.status('remote-a').errorCode, state === 'expired' ? 'REMOTE_EXPIRED' : 'REMOTE_PREFLIGHT_CANCELLED');
    assert.equal(f.terms.status('remote-a').code, state === 'expired' ? 'REMOTE_EXPIRED' : 'REMOTE_CLEANUP_FAILED');
    if (state === 'cleanup_failed') assert.equal(f.terms.status('remote-a').cleanup, 'unconfirmed');
    assert.equal(f.calls.some(call => call.name === 'pty:close'), false);
  }
});

test('return63_account_verification_is_not_promoted_to_remote_connection_success', async () => {
  const f = fixture({ invoke(name, request) {
    if (name === 'pty:open') return { id: request.id, mode: 'remote', state: 'connecting', accountVerified: true,
      target: { ...target(request.contextId), identityVerification: 'required_at_launch' } };
  } });
  await f.terms.show('remote-a');
  assert.equal(f.terms.status('remote-a').state, 'connecting');
  assert.equal(f.terms.status('remote-a').code, 'REMOTE_CONNECTING');
  assert.equal(f.terms.status('remote-a').user, null);
  assert.equal(f.terms.status('remote-a').target.identityVerification, 'required_at_launch');
  assert.equal(Object.hasOwn(f.terms.status('remote-a'), 'accountVerified'), false);
});

test('v13_default_shell_target_is_deeply_isolated_from_response_and_status_mutation', async () => {
  let original;
  const f = fixture({ invoke(name, request) {
    if (name !== 'pty:open') return name === 'pty:close' ? true : undefined;
    const descriptor = target(request.contextId); if (!original) original = descriptor;
    return { id: request.id, mode: 'remote', state: 'connecting', target: descriptor };
  } });
  await f.terms.show('remote-a');
  assert.equal(f.terms.status('remote-a').target.session.kind, 'default-shell');
  original.session.kind = 'response-forged';
  const exposed = f.terms.status('remote-a'); exposed.target.session.kind = 'status-forged';
  const callback = f.states.find(state => state.target); assert.ok(callback.target.session);
  callback.target.session.kind = 'callback-forged';
  assert.equal(f.terms.status('remote-a').target.session.kind, 'default-shell');
  await f.terms.show('remote-b'); const id = f.openCalls()[1].args[0].id;
  assert.equal(f.terms.status('remote-b').state, 'cleanup_unconfirmed');
  f.emit('pty-exit', id, null, { mode: 'remote', state: 'cancelled', target: target('context-a') });
  assert.equal(f.terminals[1].disposed, true);
  assert.equal(f.terms.status('remote-b').target.session.kind, 'default-shell');
  assert.equal(f.terms.status('remote-b').state, 'connecting');
  assert.equal(f.terminals[0].disposed, undefined);
});

test('v13_only_exact_default_shell_session_shape_is_accepted_without_running_accessors', async () => {
  const accessor = {}; Object.defineProperty(accessor, 'kind', { enumerable: true, get() { throw new Error('must not run'); } });
  const symbol = { kind: 'default-shell', [Symbol('extra')]: true };
  for (const session of [null, [], {}, 'default-shell', { kind: 'named' }, { kind: 'default-shell', command: 'forbidden' },
    Object.create({ kind: 'default-shell' }), accessor, symbol]) {
    const f = fixture({ invoke(name, request) {
      if (name === 'pty:open') return { id: request.id, mode: 'remote', state: 'connecting', target: { ...target(request.contextId), session } };
    } });
    await f.terms.show('remote-a');
    assert.equal(f.terms.status('remote-a').state, 'cleanup_unconfirmed');
    assert.equal(f.terms.status('remote-a').target, null);
    assert.equal(f.calls.filter(call => call.name === 'pty:close').length, 1);
    assert.equal(f.openCalls().length, 1); assert.equal(f.terminals[0].input, undefined);
  }
});

test('v13_named_document_mixing_and_other_nested_target_fields_are_rejected', async () => {
  for (const field of ['document', 'parameters', 'params', 'otherNested']) {
    const f = fixture({ invoke(name, request) {
      if (name === 'pty:open') return { id: request.id, mode: 'remote', state: 'connecting', target: { ...target(request.contextId), [field]: field === 'document' ? 'named' : { value: true } } };
    } });
    await f.terms.show('remote-a');
    assert.equal(f.terms.status('remote-a').state, 'cleanup_unconfirmed');
    assert.equal(f.terms.status('remote-a').target, null);
    assert.equal(f.calls.some(call => call.name === 'pty:run'), false);
    assert.ok(f.openCalls().every(call => call.args[0].mode === 'remote'));
  }
});

test('v13_collision_cleanup_with_wrong_session_shape_cannot_adopt_existing_identity', async () => {
  const f = fixture({ invoke: name => name === 'pty:close' ? true : undefined });
  await f.terms.show('remote-a'); await f.terms.show('remote-b'); const id = f.openCalls()[1].args[0].id;
  f.emit('pty-exit', id, null, { mode: 'remote', state: 'cancelled', target: { ...target('context-a'), session: { kind: 'named' } } });
  assert.equal(f.terms.status('remote-b').state, 'cleanup_unconfirmed');
  assert.equal(f.terminals[1].disposed, undefined); assert.equal(f.terminals[0].disposed, undefined);
  assert.equal(f.terms.status('remote-a').target.session.kind, 'default-shell');
});

/* B2-02: a terminal that did not open showed its bare code (TERMINAL_UNAVAILABLE) and wrote the app's Korean words into the terminal cells,
   where each Hangul glyph is spread over two Latin cells. The app's lines go to the line above the screen in words; no code is shown */
test('a_terminal_that_did_not_open_says_why_in_words_above_the_screen_never_as_a_code_in_the_cells', async () => {
  const f = fixture({ invoke: name => name === 'pty:open' ? { error: 'unavailable', code: 'TERMINAL_UNAVAILABLE' } : undefined });
  await f.terms.show('local-a');
  const host = f.body.children[0], note = host.children[0];
  assert.match(note.textContent, /terminal\.openFailed/, 'the reason in words above the screen');
  assert.equal(note.hidden, false);
  assert.ok(!f.terminals[0].writes.some(w => /TERMINAL_UNAVAILABLE|terminal\.openFailed/.test(w)), 'nothing of it written into the terminal cells');
  assert.ok(!note.textContent.includes('TERMINAL_UNAVAILABLE'), 'no bare code');
});
