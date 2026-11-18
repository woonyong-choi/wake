import test from 'node:test';
import assert from 'node:assert/strict';
import { isMac, comboOf, keyText, surfaceKey, matchCombo, physicalKey } from './shortcuts.js';
import { recordKeys } from '../components/shortcut.js';

const mac = { mac: true }, pc = { mac: false };
const key = (code, mods = {}, extra = {}) => ({ code, key: '', ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, isComposing: false, target: { tagName: 'DIV' }, ...mods, ...extra });

test('the platform comes from the browser or an override', () => {
  assert.equal(isMac('MacIntel'), true);
  assert.equal(isMac('Win32'), false);
  assert.equal(isMac('Linux x86_64'), false);
  assert.equal(isMac(true), true);
});

test('comboOf reads symbols and words: Command is mod, Control is ctrl on macOS and mod elsewhere', () => {
  assert.equal(comboOf(['⇧', '⌘', 'E'], mac), 'mod+shift+e');
  assert.equal(comboOf(['⌃', 'Tab'], mac), 'ctrl+tab');
  assert.equal(comboOf(['Ctrl', 'Shift', 'E'], pc), 'mod+shift+e');
  assert.equal(comboOf(['Ctrl', 'Alt', 'Enter'], pc), 'mod+alt+enter');
  assert.equal(comboOf(['⌘', '↩'], mac), 'mod+enter');
  assert.equal(comboOf(['⇧', 'J'], mac), 'shift+j');
  assert.equal(comboOf(['?'], pc), '?');
  assert.equal(comboOf(['⌘', 'Space'], mac), 'mod+ ');
});

test('keyText shows symbols with no separator on macOS and words joined by + elsewhere', () => {
  assert.equal(keyText(['⇧', '⌘', 'E'], mac), '⇧⌘E');
  assert.equal(keyText('mod+shift+e', mac), '⇧⌘E');
  assert.equal(keyText('mod+shift+e', pc), 'Ctrl+Shift+E');
  assert.equal(keyText(['Ctrl', 'Alt', 'Shift', 'E'], pc), 'Ctrl+Alt+Shift+E');
  assert.equal(keyText('ctrl+alt+enter', mac), '⌃⌥↩');
  assert.equal(keyText('mod+enter', pc), 'Ctrl+Enter');
  assert.equal(keyText('mod+shift++', pc), 'Ctrl+Shift++');
  assert.equal(keyText(['⇧⌘E'], mac), '⇧⌘E', 'an already formatted label stays');
  assert.equal(keyText(['?'], pc), '?');
  assert.equal(keyText([], pc), '');
});

test('the physical key names a letter the same under another input source', () => {
  assert.equal(physicalKey(key('KeyJ', {}, { key: '\u3153' })), 'j');
  assert.equal(physicalKey(key('Digit3')), '3');
  assert.equal(physicalKey(key('BracketLeft', {}, { key: '\u0445' })), '[');
  assert.equal(physicalKey(key('ShiftLeft')), null);
});

test('surfaceKey: one key from its physical position, Shift allowed, nothing with Control, Alt or Command, nothing from a field', () => {
  assert.equal(surfaceKey(key('KeyJ', {}, { key: '\u3153' })), 'j');
  assert.equal(surfaceKey(key('KeyJ', { shiftKey: true })), 'shift+j');
  assert.equal(surfaceKey(key('Slash', { shiftKey: true })), '?');
  assert.equal(surfaceKey(key('Digit2')), '2');
  assert.equal(surfaceKey(key('Enter')), 'enter');
  assert.equal(surfaceKey(key('ArrowDown')), 'arrowdown');
  assert.equal(surfaceKey(key('KeyJ', {}, { isComposing: true })), null);
  for (const m of ['ctrlKey', 'altKey', 'metaKey']) assert.equal(surfaceKey(key('KeyJ', { [m]: true })), null, m);
  for (const c of ['Tab', 'Escape', 'Space', 'Backspace']) assert.equal(surfaceKey(key(c)), null, c);
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(surfaceKey(key('KeyJ', {}, { target: { tagName } })), null, tagName);
  assert.equal(surfaceKey(key('KeyJ', {}, { target: { tagName: 'DIV', isContentEditable: true } })), null);
  assert.equal(surfaceKey(key('KeyJ', {}, { target: { tagName: 'INPUT' } }), { field: true }), 'j');
});

test('matchCombo: mod is Command on macOS and Control elsewhere, the key is physical', () => {
  assert.equal(matchCombo(key('KeyE', { metaKey: true, shiftKey: true }), 'mod+shift+e', mac), true);
  assert.equal(matchCombo(key('KeyE', { ctrlKey: true, shiftKey: true }), 'mod+shift+e', mac), false);
  assert.equal(matchCombo(key('KeyE', { ctrlKey: true, shiftKey: true }), 'mod+shift+e', pc), true);
  assert.equal(matchCombo(key('KeyE', { metaKey: true, shiftKey: true }), 'mod+shift+e', pc), false);
  assert.equal(matchCombo(key('KeyK', { metaKey: true }, { key: '\u314f' }), 'mod+k', mac), true);
  assert.equal(matchCombo(key('Tab', { ctrlKey: true }), 'ctrl+tab', mac), true);
  assert.equal(matchCombo(key('Tab', { ctrlKey: true }), 'ctrl+tab', pc), true);
  assert.equal(matchCombo(key('Equal', { metaKey: true, shiftKey: true }), 'mod+shift++', mac), true);
  assert.equal(matchCombo(key('Equal', { metaKey: true }), 'mod+=', mac), true);
  assert.equal(matchCombo(key('Slash', { shiftKey: true }), '?', pc), true);
  assert.equal(matchCombo(key('Slash'), '?', pc), false);
  assert.equal(matchCombo(key('KeyE', { metaKey: true, altKey: true }), 'mod+e', mac), false);
});

test('the recorder: a modifier is needed, Control is the primary one off macOS and the Windows key is refused; the surface scope takes one key', () => {
  assert.deepEqual(recordKeys(key('KeyE', { metaKey: true, shiftKey: true }), mac), { keys: ['⇧', '⌘', 'E'] });
  assert.deepEqual(recordKeys(key('KeyE', { ctrlKey: true, shiftKey: true }), pc), { keys: ['Ctrl', 'Shift', 'E'] });
  assert.equal(comboOf(recordKeys(key('KeyE', { ctrlKey: true, shiftKey: true }), pc).keys, pc), 'mod+shift+e');
  assert.deepEqual(recordKeys(key('KeyE', { metaKey: true }), pc), { error: 'shortcut.invalidPc' });
  assert.deepEqual(recordKeys(key('KeyE'), mac), { error: 'shortcut.invalid' });
  assert.deepEqual(recordKeys(key('KeyJ', { shiftKey: true }), { ...pc, surface: true }), { keys: ['Shift', 'J'] });
  assert.deepEqual(recordKeys(key('KeyJ', { shiftKey: true }), { ...mac, surface: true }), { keys: ['⇧', 'J'] });
  assert.deepEqual(recordKeys(key('Slash', { shiftKey: true }), { ...mac, surface: true }), { keys: ['?'] });
  assert.deepEqual(recordKeys(key('KeyJ', { ctrlKey: true }), { ...pc, surface: true }), { error: 'shortcut.invalidSurface' });
  assert.deepEqual(recordKeys(key('KeyJ', { altKey: true }), { ...mac, surface: true }), { error: 'shortcut.invalidSurface' });
  assert.deepEqual(recordKeys(key('Space'), { ...mac, surface: true }), { error: 'shortcut.invalidSurface' });
  assert.deepEqual(recordKeys(key('Backspace'), { ...pc, surface: true }), { error: 'shortcut.invalidSurface' });
  assert.equal(comboOf(recordKeys(key('KeyJ', { shiftKey: true }), { ...pc, surface: true }).keys, pc), surfaceKey(key('KeyJ', { shiftKey: true })));
});
