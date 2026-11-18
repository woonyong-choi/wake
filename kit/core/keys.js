/*
 * Shortcut text ('mod+shift+m') for display: on macOS symbols in the system order (⌃⌥⇧⌘ then the key, '⇧⌘M'),
 * elsewhere words joined with '+' ('Ctrl+Shift+M'). Enter is ⏎.
 */
import { isMac, physicalKey } from './shortcuts.js';

const MAC = isMac();
const NAMES = { enter: '⏎', escape: 'Esc', tab: 'Tab', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', backspace: '⌫' };

/* a key that types no Latin character comes from its physical position (⌘K typed with a Korean source reports a Hangul letter, ⌘[ on a Cyrillic layout another letter);
   a Latin character is taken as typed, so Shift+= still reads '+' */
const keyName = (key, code) => (/^[\x20-\x7e]$/.test(key || '') ? key : physicalKey({ code }) ?? (key || '')).toLowerCase();

/** Key event -> shortcut text in the order mod, ctrl, alt, shift, key ('mod+shift+a'). On macOS ⌘ is mod and ⌃ is ctrl; elsewhere Ctrl is mod */
export function shortcutOf(e) {
  const mod = MAC ? e.metaKey : e.metaKey || e.ctrlKey;
  return [mod && 'mod', MAC && e.ctrlKey && 'ctrl', e.altKey && 'alt', e.shiftKey && 'shift', keyName(e.key, e.code)].filter(Boolean).join('+');
}

export function keyLabel(keys) {
  const parts = keys.toLowerCase().split('+');
  const key = parts.pop();
  const k = NAMES[key] || key.toUpperCase();
  if (MAC) return ['ctrl', 'alt', 'shift', 'mod'].filter(m => parts.includes(m)).map(m => ({ ctrl: '⌃', alt: '⌥', shift: '⇧', mod: '⌘' })[m]).join('') + k;
  return [...['mod', 'ctrl', 'alt', 'shift'].filter(m => parts.includes(m)).map(m => ({ mod: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' })[m]), k].join('+');
}
