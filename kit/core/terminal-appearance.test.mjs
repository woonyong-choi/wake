import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { APPEARANCE_COLORS, validateTerminalAppearance, resolveTerminalAppearance, applyTerminalAppearance } from './terminal-appearance.js';

const TOKENS = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');
const PROFILE_LABEL = 'Synthetic appearance';
function tokenColor(name) {
  const value = new RegExp(name + ':\\s*(#[\\da-fA-F]{6})\\s*;').exec(TOKENS)?.[1];
  assert.ok(value, `opaque hex token ${name} exists`);
  return value.toLowerCase();
}
const FOREGROUND = tokenColor('--window-flat'), BACKGROUND = tokenColor('--window-top');
const RED = tokenColor('--window-upper'), BRIGHT_RED = tokenColor('--window-lower');

function snapshot(overrides = {}) {
  return { version: 1, id: 'sample', label: PROFILE_LABEL, source: { appId: 'example.terminal', appVersion: '1.0',
    profileLabel: 'Selected profile', importedAt: '2026-11-06T00:00:00Z' }, colors: {}, font: {}, ...overrides };
}

test('validateTerminalAppearance_empty_values_do_not_fabricate_imported_data', () => {
  for (const value of [snapshot(), snapshot({ raw: 'private', env: { secret: 'private' }, colors: { unknown: FOREGROUND } })]) {
    assert.deepEqual(validateTerminalAppearance(value), { status: 'no-data', unsupportedFields: [] });
  }
});

test('validateTerminalAppearance_whitelist_normalizes_and_discards_untrusted_fields', () => {
  const input = snapshot({ raw: 'private', path: '/private', colors: { foreground: FOREGROUND.toUpperCase(), command: 'private' },
    font: { family: 'Example Mono', env: 'private' }, unsupportedFields: ['references'] });
  input.source.path = '/private';
  const result = validateTerminalAppearance(input);

  assert.equal(result.status, 'partial');
  assert.deepEqual(result.snapshot.colors, { foreground: FOREGROUND });
  assert.deepEqual(result.snapshot.font, { family: 'Example Mono' });
  assert.deepEqual(result.snapshot.unsupportedFields, ['references']);
  assert.ok(result.snapshot.missingFields.includes('brightRed'));
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(input.colors.foreground, FOREGROUND.toUpperCase());
});

test('validateTerminalAppearance_invalid_values_are_rejected_without_reflecting_input', () => {
  const inherited = Object.create({ version: 1 });
  const cases = [inherited, snapshot({ version: 2 }), snapshot({ id: '../private' }), snapshot({ label: '/private' }),
    snapshot({ colors: { foreground: '#not-a-color' } }), snapshot({ font: { family: 'url(private)' } }),
    snapshot({ unsupportedFields: ['private'] })];
  const badDate = snapshot(); badDate.source.importedAt = '2026-02-30T00:00:00Z'; cases.push(badDate);
  const accessor = snapshot(); Object.defineProperty(accessor, 'raw', { get() { throw new Error('must not invoke'); } }); cases.push(accessor);
  for (const value of cases) {
    const result = validateTerminalAppearance(value);
    assert.equal(result.status, 'error');
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
});

test('resolveTerminalAppearance_preserves_distinct_bright_colors_and_sparse_snapshot', () => {
  const result = validateTerminalAppearance(snapshot({ colors: { red: RED, brightRed: BRIGHT_RED } }));
  const before = JSON.stringify(result.snapshot);
  const effective = resolveTerminalAppearance(result.snapshot, { colors: { background: FOREGROUND, red: BACKGROUND }, font: { family: 'Fallback Mono' } });

  assert.deepEqual(effective.colors, { background: FOREGROUND, red: RED, brightRed: BRIGHT_RED });
  assert.deepEqual(effective.fallbackFields, ['background', 'font.family']);
  assert.deepEqual(effective.font, { family: 'Fallback Mono' });
  assert.equal(JSON.stringify(result.snapshot), before);
});

test('applyTerminalAppearance_failure_cancel_absence_and_unconfirmed_partial_preserve_every_key', () => {
  for (const selection of ['app', 'midnight', 'paper', 'solarized', 'imported:old']) {
    const settings = { 'kit.terminal.theme': selection, 'kit.terminal.appearances': [{ id: 'old', custom: true }], other: { draft: 'kept' } };
    const before = JSON.stringify(settings);
    const partial = validateTerminalAppearance(snapshot({ colors: { foreground: FOREGROUND } }));
    for (const result of [null, { status: 'cancelled' }, { status: 'error', reason: 'read-failed' }, { status: 'no-data' }, partial,
      { status: 'ready', snapshot: partial.snapshot }]) {
      const proposal = applyTerminalAppearance(settings, result);
      assert.equal(proposal.applied, false);
      assert.equal(proposal.settings, settings);
      assert.equal(JSON.stringify(settings), before);
    }
  }
});

test('applyTerminalAppearance_confirmed_partial_replaces_only_matching_id_and_preserves_other_settings', () => {
  const other = { id: 'other', futureKey: 'preserved' }, draft = { text: 'kept' };
  const settings = { 'kit.terminal.theme': 'paper', 'kit.terminal.appearances': [other, { id: 'sample' }], unrelated: draft };
  const partial = validateTerminalAppearance(snapshot({ font: { family: 'Example Mono' } }));
  const proposal = applyTerminalAppearance(settings, partial, { acceptPartial: true });

  assert.equal(proposal.applied, true);
  assert.equal(proposal.settings['kit.terminal.theme'], 'imported:sample');
  assert.equal(proposal.settings.unrelated, draft);
  assert.equal(proposal.settings['kit.terminal.appearances'][0], other);
  assert.deepEqual(proposal.settings['kit.terminal.appearances'][1].colors, {});
  assert.equal(settings['kit.terminal.theme'], 'paper');
});

test('applyTerminalAppearance_complete_snapshot_needs_no_partial_confirmation_and_registry_is_bounded', () => {
  const result = validateTerminalAppearance(snapshot({ colors: Object.fromEntries(APPEARANCE_COLORS.map(key => [key, FOREGROUND])), font: { family: 'Example Mono' } }));
  assert.equal(result.status, 'ready');
  assert.equal(applyTerminalAppearance({}, result).applied, true);
  const settings = { 'kit.terminal.appearances': Array.from({ length: 20 }, (_, index) => ({ id: `old-${index}` })) };
  assert.equal(applyTerminalAppearance(settings, result).reason, 'capacity');
  assert.equal(applyTerminalAppearance(settings, result).settings, settings);
});
