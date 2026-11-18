import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import en from '../locale/en.js';
import ko from '../locale/ko.js';
import { setLocales, t, useLocale } from './i18n.js';
import { localizeMenu } from './text.js';

afterEach(() => {
  setLocales();
  useLocale('en');
});

test('localizeMenu_search_key_uses_current_locale_without_mutating_definition', () => {
  setLocales({ en, ko });
  const arg = Object.freeze({ selection: 'payments' });
  const item = Object.freeze({ type: 'search', placeholder: 'shell.search', value: 'pay', arg });
  const definition = Object.freeze({ width: 240, items: Object.freeze([item]) });

  for (const [locale, expected] of [['ko', ko['shell.search']], ['en', 'Search'], ['ko', ko['shell.search']]]) {
    useLocale(locale);
    const result = localizeMenu(definition);

    assert.equal(result.items[0].placeholder, expected);
    assert.equal(result.items[0].type, 'search');
    assert.equal(result.items[0].value, 'pay');
    assert.equal(result.items[0].arg, arg);
    assert.equal(result.width, 240);
    assert.equal(item.placeholder, 'shell.search');
  }
});

test('localizeMenu_search_text_forms_resolve_raw_variables_and_functions', () => {
  useLocale('en');
  const cases = [
    [{ raw: 'item-1' }, 'item-1'],
    [{ key: 'tab.memory', vars: { size: { raw: '128 MiB' } } }, 'Memory usage: 128 MiB'],
    [() => ({ key: 'shell.search' }), 'Search'],
  ];

  for (const [placeholder, expected] of cases) {
    const result = localizeMenu({ items: [{ type: 'search', placeholder }] });

    assert.equal(result.items[0].placeholder, expected);
  }
});

test('localizeMenu_nullish_placeholders_and_other_type_properties_are_preserved', context => {
  const warnings = context.mock.method(console, 'warn', () => {});
  const choices = [{ label: { raw: 'item-1' }, action: 'select', arg: 'item-1' }];
  const items = [
    { type: 'search' },
    { type: 'search', placeholder: null },
    { type: 'search', placeholder: undefined },
    { type: 'header', label: 'shell.search' },
    { type: 'label', label: 'shell.search' },
    { type: 'separator' },
    { type: 'choices', shape: 'icon', items: choices },
  ];

  const result = localizeMenu({ items });

  assert.equal(Object.hasOwn(result.items[0], 'placeholder'), false);
  assert.equal(result.items[1].placeholder, null);
  assert.equal(Object.hasOwn(result.items[2], 'placeholder'), true);
  assert.equal(result.items[2].placeholder, undefined);
  assert.deepEqual(result.items.slice(3).map(item => [item.type, item.label]), [
    ['header', 'Search'], ['label', 'Search'], ['separator', undefined], ['choices', undefined],
  ]);
  assert.equal(result.items[6].items, choices);
  assert.equal(result.items[6].shape, 'icon');
  assert.equal(warnings.mock.callCount(), 0);
  assert.equal(localizeMenu(null), null);
  assert.equal(localizeMenu(undefined), undefined);
});

test('localizeMenu_missing_and_pretranslated_strings_keep_text_fallback_warnings', context => {
  const warnings = context.mock.method(console, 'warn', () => {});
  useLocale('en');
  const translated = t('shell.search');

  const result = localizeMenu({ items: [
    { type: 'search', placeholder: 'missing.search' },
    { type: 'search', placeholder: translated },
    { type: 'search', placeholder: { raw: translated } },
  ] });

  assert.deepEqual(result.items.map(item => item.placeholder), ['missing.search', 'Search', 'Search']);
  assert.deepEqual(warnings.mock.calls.map(call => call.arguments), [
    ['missing locale key: missing.search'], ['missing locale key: Search'],
  ]);
});

test('localizeMenu_dictionary_replacement_reuses_original_keys_and_raw_is_literal', () => {
  const definition = Object.freeze({ items: Object.freeze([
    Object.freeze({ type: 'search', placeholder: 'shell.search' }),
  ]) });
  setLocales({ en: { 'shell.search': 'first' } });
  useLocale('en');
  const first = localizeMenu(definition);
  setLocales({ en: { 'shell.search': 'second', first: 'reinterpreted' } });
  useLocale('en');

  assert.equal(localizeMenu(definition).items[0].placeholder, 'second');
  assert.equal(localizeMenu(first).items[0].placeholder, 'reinterpreted');
  assert.equal(localizeMenu({ items: [{ type: 'search', placeholder: { raw: 'first' } }] }).items[0].placeholder, 'first');
  assert.equal(definition.items[0].placeholder, 'shell.search');
});

test('localizeMenu_nested_search_preserves_normal_rows_and_action_payloads', () => {
  const arg = Object.freeze({ selection: 'payments' });
  const submenu = Object.freeze({ items: Object.freeze([
    Object.freeze({ type: 'search', placeholder: 'shell.search', kbd: Object.freeze(['/']) }),
  ]) });
  const row = Object.freeze({ id: 'item-1', label: 'shell.search', desc: 'shell.more',
    end: Object.freeze({ raw: 'item-1' }), action: 'select', arg, checked: true, subButton: 'shell.more',
    actions: Object.freeze([Object.freeze({ id: 'open', tip: 'shell.search', action: 'open', arg })]), submenu });
  const definition = Object.freeze({ side: 'top', items: Object.freeze([null, row]) });

  const result = localizeMenu(definition);

  assert.equal(result.items.length, 1);
  assert.equal(result.side, 'top');
  assert.equal(result.items[0].label, 'Search');
  assert.equal(result.items[0].desc, 'More tools');
  assert.equal(result.items[0].end, 'item-1');
  assert.equal(result.items[0].subButton, 'More tools');
  assert.equal(result.items[0].actions[0].tip, 'Search');
  assert.equal(result.items[0].actions[0].arg, arg);
  assert.equal(result.items[0].arg, arg);
  assert.equal(result.items[0].action, 'select');
  assert.equal(result.items[0].checked, true);
  assert.equal(result.items[0].submenu.items[0].placeholder, 'Search');
  assert.equal(result.items[0].submenu.items[0].kbd, submenu.items[0].kbd);
  assert.equal(row.label, 'shell.search');
  assert.equal(submenu.items[0].placeholder, 'shell.search');
});

test('normalizePageMenu_preserves_resolved_strings_safe_slots_and_action_identity', async context => {
  const { normalizePageMenu } = await import('./text.js');
  const { html } = await import('./html.js');
  const warnings = context.mock.method(console, 'warn', () => {});
  const safe = html`<strong>${'resource-name'}</strong>`;
  const arg = Object.freeze({ selection: 'resource-name' });
  const action = Object.freeze({ id: 'inspect', tip: t('shell.search'), action: 'inspect', arg });
  const source = Object.freeze({ items: Object.freeze([
    Object.freeze({ id: 'literal', label: 'dynamic-resource', desc: t('shell.search'), end: safe, tip: null, placeholder: 0, subButton: 'Open child', action: 'choose', arg, checked: true, actions: Object.freeze([action]) }),
    Object.freeze({ id: 'safe', label: safe, desc: undefined }),
  ]) });
  const result = normalizePageMenu(source);
  assert.equal(result.items[0].label, 'dynamic-resource');
  assert.equal(result.items[0].desc, 'Search');
  assert.equal(result.items[0].end, safe);
  assert.equal(result.items[0].tip, null);
  assert.equal(result.items[0].placeholder, 0);
  assert.equal(result.items[0].subButton, 'Open child');
  assert.equal(result.items[0].actions[0].tip, action.tip);
  assert.equal(result.items[0].actions[0].arg, arg);
  assert.equal(result.items[0].arg, arg);
  assert.equal(result.items[0].action, 'choose');
  assert.equal(result.items[0].checked, true);
  assert.equal(result.items[1].label, safe);
  assert.equal(Object.hasOwn(result.items[1], 'desc'), true);
  assert.equal(result.items[1].desc, undefined);
  assert.equal(source.items[0].end, safe);
  assert.equal(warnings.mock.callCount(), 0);
  assert.equal(normalizePageMenu(null), null);
  assert.equal(normalizePageMenu(undefined), undefined);
});

test('normalizePageMenu_resolves_explicit_text_in_all_slots_without_eager_submenus', async context => {
  const { normalizePageMenu } = await import('./text.js');
  const warnings = context.mock.method(console, 'warn', () => {});
  const raw = Object.freeze({ raw: 'resource-name' });
  const arg = Object.freeze({ selected: 'one' });
  let calls = 0, received;
  const source = Object.freeze({ width: 240, items: Object.freeze([
    Object.freeze({ type: 'header', label: { key: 'shell.search' } }),
    Object.freeze({ type: 'search', placeholder: () => ({ key: 'shell.search' }) }),
    Object.freeze({ type: 'choices', shape: 'icon', items: Object.freeze([Object.freeze({ label: raw, icon: 'search', arg })]) }),
    Object.freeze({ id: 'object', label: raw, desc: { key: 'shell.search' }, end: { number: 123 }, tip: raw, subButton: raw,
      actions: Object.freeze([Object.freeze({ id: 'inspect', tip: { key: 'shell.search' }, arg })]),
      submenu: Object.freeze({ items: Object.freeze([Object.freeze({ id: 'nested', label: raw })]) }) }),
    Object.freeze({ id: 'lazy', label: () => 'shell.search', submenu: function (...args) { calls++; received = [this, args]; return { items: [{ id: 'child', label: raw, arg }] }; } }),
  ]) });
  const result = normalizePageMenu(source);
  assert.equal(calls, 0);
  assert.equal(result.items[0].label, 'Search');
  assert.equal(result.items[1].placeholder, 'Search');
  assert.equal(result.items[2].items[0].label, 'resource-name');
  assert.equal(result.items[2].items[0].arg, arg);
  assert.deepEqual([result.items[3].label, result.items[3].desc, result.items[3].end, result.items[3].tip, result.items[3].subButton], ['resource-name', 'Search', '123', 'resource-name', 'resource-name']);
  assert.equal(result.items[3].actions[0].tip, 'Search');
  assert.equal(result.items[3].actions[0].arg, arg);
  assert.equal(result.items[3].submenu.items[0].label, 'resource-name');
  assert.equal(result.items[4].label, 'Search');
  const receiver = Object.freeze({ name: 'receiver' });
  const nested = result.items[4].submenu.call(receiver, 'one', arg);
  assert.equal(calls, 1);
  assert.equal(received[0], receiver);
  assert.deepEqual(received[1], ['one', arg]);
  assert.equal(nested.items[0].label, 'resource-name');
  assert.equal(nested.items[0].arg, arg);
  assert.equal(source.items[3].label, raw);
  assert.equal(source.items[3].submenu.items[0].label, raw);
  assert.equal(warnings.mock.callCount(), 0);
  assert.throws(() => normalizePageMenu({ items: [{ label: {} }] }), TypeError);
  assert.throws(() => normalizePageMenu({ items: [{ label: () => ({ unsupported: true }) }] }), TypeError);
});
