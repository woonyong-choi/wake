/*
 * Kit shortcuts and the user's changes to them.
 * Each shortcut has an id (the action, or action:arg); kit.shortcuts in the settings store maps an id to new keys ('mod+shift+e')
 * or null (removed). Settings pages list them by id with the default keys shown in "Reset to default".
 */
/* Shortcuts that open the model and effort menus (shown in the composer button tooltips) */
export const AI_SHORTCUTS = { model: 'mod+shift+m', effort: 'mod+shift+.' };
export const KIT_SHORTCUTS = [
  { keys: 'mod+t', action: 'kit.tab.new' },
  { keys: 'mod+w', action: 'kit.tab.close-active' },
  { keys: 'mod+shift+t', action: 'kit.tab.reopen' },
  { keys: 'ctrl+tab', action: 'kit.tab.next' },
  { keys: 'ctrl+shift+tab', action: 'kit.tab.prev' },
  { keys: 'mod+d', action: 'kit.tab.bookmark' },
  { keys: 'mod+[', action: 'kit.history.back' },
  { keys: 'mod+]', action: 'kit.history.forward' },
  { keys: 'mod+r', action: 'kit.history.reload' },
  { keys: 'mod+s', action: 'kit.sidebar.toggle' },
  { keys: 'mod+e', action: 'kit.panel.toggle' },
  { keys: 'mod+shift+e', action: 'kit.panel.new' },
  { keys: 'mod+,', action: 'kit.settings.open' },
  { keys: 'mod+shift+h', action: 'kit.home' },
  { keys: 'mod+0', action: 'kit.zoom.reset' },
  { keys: 'mod+=', action: 'kit.zoom.in' },
  { keys: 'mod+shift++', action: 'kit.zoom.in', id: 'kit.zoom.in:plus' },
  { keys: 'mod+-', action: 'kit.zoom.out' },
  { keys: AI_SHORTCUTS.model, action: 'kit.menu.open', arg: 'kit.ai.model', id: 'kit.ai.model' },
  { keys: AI_SHORTCUTS.effort, action: 'kit.menu.open', arg: 'kit.ai.effort', id: 'kit.ai.effort' },
];

/** All shortcuts of an app with their default keys: kit ones, the app's own, and the palette keys (search tabs is 'kit.palette.tabs') */
export function defaultShortcuts(config) {
  const list = [...KIT_SHORTCUTS, ...(config.shortcuts || [])].map(s => ({ ...s, id: s.id || s.action }));
  const features = { palette: true, ...(config.features || {}) };
  if (features.palette) {
    list.push({ id: 'kit.palette.open', keys: config.palette?.shortcut || 'mod+k', action: 'kit.palette.open' });
    list.push({ id: 'kit.palette.tabs', keys: 'mod+shift+a', action: 'kit.palette.open', arg: 'tabs' }); // search tabs: the open and recently closed tabs only
    list.push({ id: 'kit.palette.location', keys: 'mod+l', action: 'kit.palette.open' });
  }
  // the terminal panel (config.terminal): ⌃` on macOS, Ctrl+` elsewhere (Ctrl is mod there), as in code editors
  if (config.terminal) list.push({ id: 'kit.terminal.toggle', keys: isMac() ? 'ctrl+`' : 'mod+`', action: 'kit.terminal.toggle' });
  return list;
}

/** The shortcuts in effect: defaults with the user's changes (kit.shortcuts); a removed one keeps its entry without keys */
export const effectiveShortcuts = (config, changes = {}) => defaultShortcuts(config).map(s => (s.id in changes ? { ...s, keys: changes[s.id] || null } : s));

/** macOS (and iOS) or not. override: a platform string ('MacIntel', 'Win32') or a boolean, for tests; without it the browser's platform */
export function isMac(override) {
  if (typeof override === 'boolean') return override;
  return /Mac|iPhone|iPad/.test(override ?? globalThis.navigator?.platform ?? globalThis.navigator?.userAgent ?? '');
}

/* key tokens, as recorded or written: macOS symbols ('⇧', '⌘', '↩') and words ('Shift', 'Ctrl', 'Enter') -> the shortcut text's names */
const MODS = { '⌘': 'meta', cmd: 'meta', command: 'meta', meta: 'meta', mod: 'mod', '⌃': 'control', ctrl: 'control', control: 'control', '⌥': 'alt', alt: 'alt', option: 'alt', opt: 'alt', '⇧': 'shift', shift: 'shift' };
const NAMED = { '↑': 'arrowup', '↓': 'arrowdown', '←': 'arrowleft', '→': 'arrowright', '↩': 'enter', '⏎': 'enter', '⌫': 'backspace', '⌦': 'delete', '↖': 'home', '↘': 'end', '⇞': 'pageup', '⇟': 'pagedown',
  space: ' ', enter: 'enter', return: 'enter', esc: 'escape', escape: 'escape', tab: 'tab', backspace: 'backspace', delete: 'delete', del: 'delete', home: 'home', end: 'end', pageup: 'pageup', pagedown: 'pagedown',
  up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright', arrowup: 'arrowup', arrowdown: 'arrowdown', arrowleft: 'arrowleft', arrowright: 'arrowright' };
/* the shortcut text's role of a modifier token: ⌘ is mod everywhere; Control is ctrl on macOS and mod elsewhere (it is the primary modifier there) */
const roleOf = (token, mac) => { const m = MODS[String(token).toLowerCase()] ?? MODS[token]; return m === 'meta' ? 'mod' : m === 'control' ? (mac ? 'ctrl' : 'mod') : m; };
const keyOf = token => { const k = String(token), l = k.toLowerCase(); return NAMED[k] ?? NAMED[l] ?? (k.length === 1 || /^f\d{1,2}$/.test(l) ? l : null); };

/** Recorded key tokens (['⇧', '⌘', 'E'] on macOS, ['Ctrl', 'Shift', 'E'] elsewhere) -> shortcut text ('mod+shift+e'). opts.mac: the platform (default: this one) */
export function comboOf(keys, { mac = isMac() } = {}) {
  const mods = [], rest = [];
  for (const k of keys) { const r = roleOf(k, mac); if (r) mods.push(r); else rest.push(k); }
  const key = rest.length ? keyOf(rest[0]) ?? String(rest[0]).toLowerCase() : '';
  return [...['mod', 'ctrl', 'alt', 'shift'].filter(m => mods.includes(m)), key].join('+');
}

/* a shortcut text -> its modifiers and its key ('mod+shift++': the last '+' is the key) */
function parse(combo) {
  const parts = String(combo).toLowerCase().split('+'), key = parts.pop() || (parts.pop(), '+');
  return { mods: parts, key };
}
const MAC_MOD = { ctrl: '⌃', alt: '⌥', shift: '⇧', mod: '⌘' };
const MAC_KEY = { enter: '↩', backspace: '⌫', delete: '⌦', home: '↖', end: '↘', pageup: '⇞', pagedown: '⇟', escape: 'Esc', tab: 'Tab', ' ': 'Space' };
const PC_KEY = { enter: 'Enter', backspace: 'Backspace', delete: 'Delete', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', escape: 'Esc', tab: 'Tab', ' ': 'Space' };
const ARROW = { arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→' };
/** A key's name as shown on the platform (shortcut text names: 'e', 'enter', 'arrowup') */
export const keyWord = (key, { mac = isMac() } = {}) => ARROW[key] ?? (mac ? MAC_KEY : PC_KEY)[key] ?? (key.length === 1 || /^f\d{1,2}$/.test(key) ? key.toUpperCase() : key);

/**
 * Keys for display: macOS symbols in the system order with no separator (⇧⌘E), elsewhere words joined with '+' (Ctrl+Shift+E).
 * keys: recorded tokens (symbols or words, in any order) or a shortcut text ('mod+shift+e'). A single token that is no key name (an already formatted
 * label such as '⇧⌘E') is shown as it is. opts.mac: the platform (default: this one).
 */
export function keyText(keys, { mac = isMac() } = {}) {
  if (keys == null || !keys.length) return '';
  let mods, key;
  if (typeof keys === 'string') ({ mods, key } = parse(keys));
  else {
    if (keys.length === 1 && !roleOf(keys[0], mac) && keyOf(keys[0]) == null) return String(keys[0]);
    const combo = comboOf(keys, { mac }); ({ mods, key } = parse(combo));
  }
  if (mac) return ['ctrl', 'alt', 'shift', 'mod'].filter(m => mods.includes(m)).map(m => MAC_MOD[m]).join('') + keyWord(key, { mac });
  const words = [...new Set(['mod', 'ctrl', 'alt', 'shift'].filter(m => mods.includes(m)).map(m => (m === 'mod' || m === 'ctrl' ? 'Ctrl' : m === 'alt' ? 'Alt' : 'Shift')))];
  return [...words, keyWord(key, { mac })].join('+');
}

/* the physical key of a key event, named as on a US layout, whatever the input source or layout types ('j' for KeyJ with a Korean source) */
const PUNCT = { Backslash: '\\', IntlBackslash: '\\', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`' };
const CODES = { Enter: 'enter', NumpadEnter: 'enter', Escape: 'escape', Tab: 'tab', Space: ' ', Backspace: 'backspace', Delete: 'delete', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
  ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright' };
/** The physical key of a key event as a shortcut text key name ('j', '1', '/', 'enter', 'arrowup', 'f5'), or null for a modifier or an unknown key */
export function physicalKey(e) {
  const c = e.code || '';
  if (/^Key[A-Z]$/.test(c)) return c.slice(3).toLowerCase();
  if (/^Digit\d$/.test(c)) return c.slice(-1);
  if (/^F\d{1,2}$/.test(c)) return c.toLowerCase();
  return PUNCT[c] ?? CODES[c] ?? null;
}

/* keys a work surface shortcut may not take: they move focus, close, scroll and erase */
const RESERVED = new Set(['tab', 'escape', ' ', 'backspace', 'delete']);
/* a shortcut text key that is typed with Shift on the key under it ('?' is Shift+/, '+' is Shift+=) */
const SHIFTED = { '?': '/', '+': '=', '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', _: '-', '<': ',', '>': '.', ':': ';', '"': "'", '{': '[', '}': ']', '|': '\\', '~': '`' };
const SURFACE = /^([a-z0-9]|[\\\-=,./[\];'`]|enter|arrow(up|down|left|right))$/;
const editable = el => !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName || ''));

/**
 * The key of a keydown for a single-key work surface shortcut, from the physical key (so any layout or input source gives the same key):
 * a letter, digit or punctuation ('j', '1', '/'), '?' for Shift+/, 'enter' and the arrows, with 'shift+' before it when Shift is held ('shift+j').
 * null while an input method composes, when Control, Option/Alt or Command/Meta is held, for a reserved key (Tab, Escape, Space, Backspace) and
 * when the event comes from a text field, a select or editable content. opts.field: true also reads an event from a field (a key recorder).
 */
export function surfaceKey(e, { field = false } = {}) {
  if (e.isComposing || e.keyCode === 229 || e.ctrlKey || e.altKey || e.metaKey) return null;
  if (!field && editable(e.target)) return null;
  const k = physicalKey(e);
  if (!k || RESERVED.has(k) || !SURFACE.test(k)) return null;
  if (e.shiftKey && k === '/') return '?';
  return e.shiftKey ? 'shift+' + k : k;
}

/**
 * Does a keydown match a shortcut text ('mod+shift+e', 'ctrl+tab', 'mod+shift++')? The key is the physical one (any layout or input source),
 * mod is Command on macOS and Control elsewhere; ctrl is Control (elsewhere the same key as mod). opts.mac: the platform (default: this one).
 */
export function matchCombo(e, combo, { mac = isMac() } = {}) {
  if (!combo || e.isComposing) return false;
  const { mods, key } = parse(combo), has = m => mods.includes(m);
  const base = SHIFTED[key], shift = has('shift') || !!base;
  if (e.ctrlKey !== (mac ? has('ctrl') : has('mod') || has('ctrl'))) return false;
  if (e.metaKey !== (mac && has('mod'))) return false;
  if (e.altKey !== has('alt') || e.shiftKey !== shift) return false;
  return physicalKey(e) === (base ?? key);
}
