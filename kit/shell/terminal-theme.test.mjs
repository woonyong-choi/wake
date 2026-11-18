import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createSettingsStore, KIT_DEFAULTS } from '../core/settings-store.js';
import { APPEARANCE_COLORS, validateTerminalAppearance } from '../core/terminal-appearance.js';
import { createTerminalAppearanceControl } from './shell.js';
import { createTerminals, createTerminalOutputViews } from './terminal.js';

const TOKENS = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');
const PROFILE_LABEL = 'Synthetic appearance';
function color(name) {
  const found = new RegExp(name + ':\\s*(#[\\da-fA-F]{6})\\s*;').exec(TOKENS)?.[1];
  assert.ok(found, `opaque token ${name} exists`); return found.toLowerCase();
}
const FOREGROUND = color('--window-flat'), BACKGROUND = color('--window-top'), RED = color('--window-upper'), BRIGHT_RED = color('--window-lower');
function snapshot(overrides = {}) {
  return { version: 1, id: 'example-snapshot', label: PROFILE_LABEL,
    source: { appId: 'example.terminal', appVersion: 'unknown', profileLabel: PROFILE_LABEL, importedAt: '2026-11-06T00:00:00Z' },
    colors: { foreground: FOREGROUND }, font: { family: 'Example Mono' }, ...overrides };
}
function deferred() { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
function fixture({ defaults = {}, response = validateTerminalAppearance(snapshot()), call } = {}) {
  const saves = [], calls = []; let owner = { tabId: 'tab-a', address: 'example://settings/appearance' }, sequence = 0;
  const settings = createSettingsStore('theme-test', defaults, { load: () => null, save: values => saves.push(structuredClone(values)) });
  const api = createTerminalAppearanceControl({ settings, ownerOf: () => owner, randomId: () => `ticket-${++sequence}`,
    call: async (name, args) => { calls.push({ name, args }); return call ? call(name, args) : name.endsWith('.list') ? { status: 'listed', applications: [], sources: [] } : response; } });
  return { api, settings, saves, calls, owner: value => { owner = value; } };
}

test('appearance_api_all_operations_are_promises_and_prepare_does_not_change_selection', async () => {
  const f = fixture(), before = JSON.stringify(f.settings.all());
  const listing = f.api.list(); assert.equal(typeof listing.then, 'function'); assert.equal((await listing).status, 'listed');
  const imported = f.api.import({ sourceId: 'owned-source' }); assert.equal(typeof imported.then, 'function');
  assert.equal((await imported).status, 'partial');
  const choosing = f.api.chooseFile({ format: 'ghostty' }); assert.equal(typeof choosing.then, 'function'); const preview = await choosing;
  const applying = f.api.apply(preview.ticketId); assert.equal(typeof applying.then, 'function'); assert.equal((await applying).reason, 'confirmation-required');
  const cancelling = f.api.cancel(preview.ticketId); assert.equal(typeof cancelling.then, 'function'); assert.equal((await cancelling).status, 'cancelled');
  assert.equal(JSON.stringify(f.settings.all()), before); assert.equal(f.saves.length, 0);
  assert.deepEqual(f.calls.map(call => call.name), ['kit.terminal.appearance.list', 'kit.terminal.appearance.import', 'kit.terminal.appearance.chooseFile']);
});

test('appearance_no_data_error_cancel_and_invalid_snapshot_preserve_all_existing_choices', async () => {
  for (const selection of ['app', 'midnight', 'paper', 'solarized']) {
    for (const response of [{ status: 'no-data' }, { status: 'cancelled' }, { status: 'error', reason: 'unsupported-format' },
      { status: 'ready', snapshot: {} }, { status: 'error', reason: '/private/credentials' }]) {
      const f = fixture({ defaults: { 'kit.terminal.theme': selection, unrelated: { draft: 'kept' } }, response });
      const before = JSON.stringify(f.settings.all()), result = await f.api.chooseFile({ format: 'terminal' });
      assert.equal(Object.hasOwn(result, 'ticketId'), false);
      assert.equal((await f.api.apply('forged')).reason, 'invalid-ticket');
      assert.equal(JSON.stringify(f.settings.all()), before); assert.equal(f.saves.length, 0);
      assert.equal(JSON.stringify(result).includes('private'), false);
    }
  }
});

test('appearance_apply_uses_sealed_draft_strict_partial_confirmation_and_one_settings_batch', async () => {
  const f = fixture({ defaults: { 'kit.terminal.theme': 'paper', unrelated: { draft: 'kept' } } });
  const unrelated = f.settings.get('unrelated'), preview = await f.api.import({ sourceId: 'owned-source' });
  preview.snapshot.colors.foreground = BACKGROUND; preview.snapshot.source.appId = 'forged';
  assert.equal((await f.api.apply(preview.ticketId, { acceptPartial: 'true' })).reason, 'invalid-options');
  assert.equal((await f.api.apply(preview.ticketId, { snapshot: preview.snapshot })).reason, 'invalid-options');
  assert.equal((await f.api.apply(preview.ticketId)).reason, 'confirmation-required');
  const applied = await f.api.apply(preview.ticketId, { acceptPartial: true, colors: true, font: true });
  assert.equal(applied.status, 'applied'); assert.equal(applied.applied, true); assert.equal(applied.persistence, 'requested');
  assert.equal(f.settings.get('kit.terminal.theme'), 'imported:example-snapshot');
  assert.equal(f.settings.get('kit.terminal.font'), 'imported:example-snapshot');
  assert.equal(f.settings.get('kit.terminal.appearances')[0].colors.foreground, FOREGROUND);
  assert.equal(f.settings.get('kit.terminal.appearances')[0].source.appId, 'example.terminal');
  assert.equal(f.settings.get('unrelated'), unrelated); assert.equal(f.saves.length, 1);
  assert.equal((await f.api.apply(preview.ticketId, { acceptPartial: true })).reason, 'invalid-ticket');
});

test('appearance_color_and_font_choices_are_independent_and_absent_fields_cannot_be_applied', async () => {
  const colors = fixture({ response: validateTerminalAppearance(snapshot({ font: {} })) });
  const colorPreview = await colors.api.chooseFile({ format: 'itermcolors' });
  assert.equal((await colors.api.apply(colorPreview.ticketId, { acceptPartial: true, font: true })).reason, 'no-font');
  assert.equal((await colors.api.apply(colorPreview.ticketId, { acceptPartial: true, colors: false, font: false })).reason, 'nothing-selected');
  assert.equal((await colors.api.apply(colorPreview.ticketId, { acceptPartial: true })).status, 'applied');
  assert.equal(colors.settings.get('kit.terminal.font'), 'app');
  const fonts = fixture({ defaults: { 'kit.terminal.theme': 'midnight' }, response: validateTerminalAppearance(snapshot({ colors: {} })) });
  const fontPreview = await fonts.api.chooseFile({ format: 'ghostty' });
  assert.equal((await fonts.api.apply(fontPreview.ticketId, { acceptPartial: true })).reason, 'no-colors');
  assert.equal((await fonts.api.apply(fontPreview.ticketId, { acceptPartial: true, colors: false, font: true })).status, 'applied');
  assert.equal(fonts.settings.get('kit.terminal.theme'), 'midnight');
  assert.equal(fonts.settings.get('kit.terminal.font'), 'imported:example-snapshot');
});

test('appearance_cancel_supersedes_late_results_and_late_rejections_without_settings_changes', async () => {
  for (const rejects of [false, true]) {
    const pending = deferred(), f = fixture({ call: () => pending.promise }), before = JSON.stringify(f.settings.all());
    const choosing = f.api.chooseFile({ format: 'ghostty' }); await f.api.cancel();
    if (rejects) pending.reject(new Error('/private/late')); else pending.resolve(validateTerminalAppearance(snapshot()));
    const result = await choosing; assert.equal(result.status, 'cancelled'); assert.equal(Object.hasOwn(result, 'ticketId'), false);
    assert.equal(f.saves.length, 0); assert.equal(JSON.stringify(f.settings.all()), before);
  }
  const f = fixture(), preview = await f.api.import({ sourceId: 'owned-source' }); await f.api.cancel(preview.ticketId);
  assert.equal((await f.api.apply(preview.ticketId, { acceptPartial: true })).reason, 'invalid-ticket');
  assert.equal(f.saves.length, 0);
});

test('appearance_owner_and_selection_changes_reject_stale_drafts_but_unrelated_changes_are_kept', async () => {
  const f = fixture(), preview = await f.api.chooseFile({ format: 'ghostty' });
  f.owner({ tabId: 'tab-b', address: 'example://settings/appearance' });
  assert.equal((await f.api.apply(preview.ticketId, { acceptPartial: true })).reason, 'owner-changed');
  f.owner({ tabId: 'tab-a', address: 'example://settings/appearance' });
  f.settings.set('kit.terminal.theme', 'solarized');
  assert.equal((await f.api.apply(preview.ticketId, { acceptPartial: true })).reason, 'settings-changed');
  assert.equal(f.settings.get('kit.terminal.theme'), 'solarized');
  const current = await f.api.chooseFile({ format: 'ghostty' }); f.settings.set('unrelated', 'new draft');
  assert.equal((await f.api.apply(current.ticketId, { acceptPartial: true })).status, 'applied');
  assert.equal(f.settings.get('unrelated'), 'new draft');
  const pending = deferred(), late = fixture({ call: () => pending.promise });
  const choosing = late.api.chooseFile({ format: 'ghostty' }); late.owner({ tabId: 'tab-a', address: 'example://settings/other' });
  pending.resolve(validateTerminalAppearance(snapshot())); assert.equal((await choosing).reason, 'owner-changed'); assert.equal(late.saves.length, 0);
});

test('appearance_ready_snapshot_needs_no_partial_override_and_capacity_failure_preserves_settings', async () => {
  const ready = validateTerminalAppearance(snapshot({ colors: Object.fromEntries(APPEARANCE_COLORS.map(key => [key, FOREGROUND])) }));
  const f = fixture({ response: ready }), preview = await f.api.chooseFile({ format: 'ghostty' });
  assert.equal(preview.status, 'ready'); assert.equal((await f.api.apply(preview.ticketId)).status, 'applied');
  const full = fixture({ defaults: { 'kit.terminal.appearances': Array.from({ length: 20 }, (_, id) => snapshot({ id: `saved-${id}` })) } });
  const before = JSON.stringify(full.settings.all()), draft = await full.api.chooseFile({ format: 'ghostty' });
  assert.equal((await full.api.apply(draft.ticketId, { acceptPartial: true })).reason, 'capacity');
  assert.equal(JSON.stringify(full.settings.all()), before); assert.equal(full.saves.length, 0);
});

test('appearance_defaults_and_batch_notify_preserve_other_keys_without_intermediate_selection', () => {
  assert.equal(KIT_DEFAULTS['kit.terminal.theme'], 'app'); assert.equal(KIT_DEFAULTS['kit.terminal.font'], 'app');
  const f = fixture({ defaults: { unrelated: 'kept' } }), observed = [];
  f.settings.subscribe((key, value, values) => observed.push({ key, value, values }));
  f.settings.setMany({ 'kit.terminal.theme': 'paper', 'kit.terminal.font': 'app', 'kit.terminal.appearances': [] });
  assert.equal(f.saves.length, 1); assert.equal(observed.length, 1); assert.equal(observed[0].key, null);
  assert.equal(observed[0].values['kit.terminal.theme'], 'paper'); assert.equal(observed[0].values.unrelated, 'kept');
});

function element() {
  const classes = new Set();
  return { children: [], style: {}, dataset: {}, classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
    toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
    appendChild(child) { this.children.push(child); child.parent = this; }, append(...children) { children.forEach(child => this.appendChild(child)); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }, setAttribute() {}, focus() {},
    get firstElementChild() { return this.children[0]; }, get lastElementChild() { return this.children.at(-1); } };
}
function driverFixture() {
  const values = {}, calls = [], events = new Map(), terminals = [], body = element();
  class Terminal {
    constructor(options) { this.options = options; this.cols = 80; this.rows = 24; terminals.push(this); }
    loadAddon(addon) { addon.term = this; } open(host) { this.host = host; } attachCustomKeyEventHandler() {} focus() {} write() {}
    onData(callback) { this.input = callback; } onResize(callback) { this.resize = callback; } dispose() { this.disposed = true; }
  }
  class FitAddon { fit() { this.term?.resize?.({ cols: this.term.cols, rows: this.term.rows }); } }
  const doc = { documentElement: element(), body: element(), head: element(), querySelector: () => null,
    createElement(tag) { const el = element(); if (tag === 'canvas') el.getContext = () => ({ fillRect() {}, getImageData: () => ({ data: [1, 2, 3, 255] }) }); return el; } };
  const source = createTerminals.toString().replace("import('../vendor/xterm/xterm.mjs')", 'Promise.resolve({ Terminal: TerminalDouble })')
    .replace("import('../vendor/xterm/addon-fit.mjs')", 'Promise.resolve({ FitAddon: FitAddonDouble })').replaceAll('import.meta.url', 'moduleUrl');
  const create = runInNewContext('(' + source + ')', { TerminalDouble: Terminal, FitAddonDouble: FitAddon, createTerminalOutputViews, validateTerminalAppearance,
    URL, moduleUrl: import.meta.url, text: value => typeof value === 'string' ? value : value?.raw || '', outputText: value => value, t: key => key, shortcutOf: () => '',
    getComputedStyle: () => ({ color: 'transparent', getPropertyValue: name => name === '--term-bg' ? 'transparent' : name === '--font-mono' ? 'Baseline Mono' : '1' }) });
  const terms = create({ doc, appearanceSettings: () => values, ownerOf: () => ({ tabId: 'tab-a', address: 'example://target' }), api: {},
    desktop: { on: (name, callback) => events.set(name, callback), async invoke(name, ...args) {
      calls.push({ name, args }); const request = args[0];
      if (name === 'pty:open') return request.mode === 'remote' ? { id: request.id, mode: 'remote', state: 'connecting', target: { contextId: 'context-a', identity: 'example-target' } }
        : { id: request.id, mode: 'local', user: 'local-self' };
      return {};
    } }, config: { terminal: { open: async key => key.startsWith('remote') ? { mode: 'remote', contextId: 'context-a' } : { mode: 'local' } } } });
  terms.mount(body);
  return { terms, values, calls, terminals, body, emit: (name, ...args) => events.get(name)?.(...args) };
}
async function until(predicate) { for (let index = 0; index < 80; index++) { if (predicate()) return; await Promise.resolve(); } assert.ok(predicate()); }

test('appearance_updates_xterm_colors_and_requested_font_without_replacing_local_remote_run_or_diagnostic', async () => {
  const f = driverFixture(); await f.terms.show('local-a'); const local = f.terminals[0], initialSize = local.options.fontSize;
  await f.terms.show('remote-a'); const remote = f.terminals[1];
  const running = f.terms.run('run-a', 'example command'); await until(() => f.calls.some(call => call.name === 'pty:run'));
  const run = f.terminals[2], runId = f.calls.find(call => call.name === 'pty:run').args[0].id;
  f.terms.showOutput({ key: 'output-a', title: 'example.diagnostic', rawText: 'HTTP 503', sourceLabel: 'example.http', readOnlyLabel: 'example.readOnly' });
  const diagnostic = f.body.lastElementChild;
  const imported = snapshot({ colors: { red: RED, brightRed: BRIGHT_RED }, font: { family: 'Example Mono' } });
  Object.assign(f.values, { 'kit.terminal.appearances': [imported], 'kit.terminal.theme': 'imported:example-snapshot', 'kit.terminal.font': 'imported:example-snapshot' });
  const before = f.calls.length, status = f.terms.theme();
  assert.equal(status.themeStatus, 'imported'); assert.equal(status.fontStatus, 'requested-unverified');
  for (const term of [local, remote, run]) {
    assert.equal(term.options.theme.red, RED); assert.equal(term.options.theme.brightRed, BRIGHT_RED);
    assert.equal(term.options.fontFamily, '"Example Mono", Baseline Mono'); assert.equal(term.options.fontSize, initialSize); assert.equal(term.disposed, undefined);
  }
  assert.equal(diagnostic.classList.contains('on'), true); assert.equal(f.calls.length, before);
  assert.equal(f.terms.status('remote-a').state, 'connecting');
  f.terms.reveal('remote-a', { fit: false }); f.values['kit.terminal.font'] = 'app';
  const count = f.calls.length; f.terms.theme();
  assert.equal(f.calls.slice(count).filter(call => call.name === 'pty:resize').length, 1);
  assert.equal(remote.options.fontFamily, 'Baseline Mono');
  assert.equal(f.calls.slice(count).some(call => ['pty:open', 'pty:run', 'pty:close', 'pty:write'].includes(call.name)), false);
  f.emit('pty-exit', runId, 0); assert.equal((await running).exit, 0);
});

test('appearance_invalid_registry_or_missing_font_falls_back_while_existing_presets_remain_valid', async () => {
  const f = driverFixture(); await f.terms.show('local-a'); const nativeTheme = f.terminals[0].options.theme;
  for (const selection of ['app', 'midnight', 'paper', 'solarized']) { f.values['kit.terminal.theme'] = selection; assert.equal(f.terms.theme().themeStatus, selection); }
  f.values['kit.terminal.theme'] = 'imported:missing'; f.values['kit.terminal.font'] = 'imported:missing';
  const status = f.terms.theme(); assert.equal(status.themeStatus, 'fallback'); assert.equal(status.fontStatus, 'fallback');
  assert.equal(status.reason, 'invalid-snapshot'); assert.equal(f.terminals[0].options.fontFamily, 'Baseline Mono');
  assert.equal(f.terminals[0].options.theme.foreground, nativeTheme.foreground);
  f.values['kit.terminal.appearances'] = [snapshot({ font: {} })]; f.values['kit.terminal.theme'] = 'imported:example-snapshot'; f.values['kit.terminal.font'] = 'imported:example-snapshot';
  assert.equal(f.terms.theme().fontStatus, 'fallback'); assert.equal(f.terms.appearanceStatus().fontFallback, 'missing-font');
});

test('appearance_shell_wiring_uses_existing_service_bridge_and_exposes_the_same_controller', async () => {
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const start = source.indexOf('  const appearances = createTerminalAppearanceControl('), end = source.indexOf('  let updateView', start);
  assert.ok(start >= 0 && end > start);
  const calls = [], f = fixture(), tab = { id: 'actual-tab' };
  const context = { settings: f.settings, tabs: { active: () => ({ id: 'base-tab' }), presented: () => tab, current: () => ({ address: 'example://settings/appearance' }) },
    createTerminalAppearanceControl: options => createTerminalAppearanceControl({ ...options, randomId: () => 'shell-ticket' }),
    desktop: { invoke: async (...args) => { calls.push(args); return validateTerminalAppearance(snapshot()); } } };
  const control = runInNewContext(source.slice(start, end) + '\nappearances', context);
  const preview = await control.chooseFile({ format: 'ghostty' });
  assert.equal(preview.ticketId, 'shell-ticket');
  assert.equal(calls[0][0], 'service:call'); assert.equal(calls[0][1], 'kit.terminal.appearance.chooseFile');
  assert.equal(calls[0][2].format, 'ghostty');
  assert.ok(source.includes('appearance: appearances'));
  assert.ok(source.includes('appearanceSettings: () => settings.all()'));
  const browser = runInNewContext(source.slice(start, end) + '\nappearances', { ...context, desktop: null });
  assert.equal((await browser.list()).reason, 'service-failed');
  assert.equal(f.saves.length, 0);
});
