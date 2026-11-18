/*
 * Shortcut control.
 *   keys: a secondary button with the key combination (height 32, 10 side padding) and an outline "…" menu button, 4 apart.
 *   record: a read-only field (height 28, width 96, muted fill, no border, 12 centered tabular text) that records a combination:
 *     on focus it empties and shows the "press keys" placeholder; a modifier with a letter, digit, arrow or navigation key records it and
 *     leaves the field; Escape leaves without change; Tab moves on. A key without a modifier is rejected with a toast. An optional ghost reset
 *     button follows it.
 *   edit: the key button itself records (focus shows the "press keys" text muted; a combination saves it, Escape keeps the old one,
 *     Backspace without modifiers on an empty run removes it); "Not set" when it has none. The "…" menu holds reset and remove.
 *   scope: 'surface' (record and edit): a single-key work surface shortcut. It takes a letter, digit, punctuation (with '?'), an arrow or Enter,
 *     with Shift or alone; anything with Control, Option/Alt or Command/Meta (those belong to the system and the app menus) and the reserved keys
 *     Space and Backspace are rejected with a toast (shortcut.invalidSurface). At run time core/shortcuts.js surfaceKey(e) reads such a key.
 * Platforms: on macOS ⌘ is the primary modifier (mod) and ⌃ is ctrl, shown as symbols with no separator (⇧⌘E); elsewhere Control is mod, shown
 * as words joined with '+' (Ctrl+Shift+E), and the Windows key is rejected. keys are shown through core/shortcuts.js keyText.
 * The recorded keys go out as ctx.emit(action, { arg, keys, combo }) (keys: the platform's tokens, combo: 'mod+shift+e').
 */
import { t } from '../core/i18n.js';
import { html, attrs } from '../core/html.js';
import * as button from './button.js';
import * as iconButton from './icon-button.js';
import { comboOf, keyText, keyWord, isMac, physicalKey, surfaceKey } from '../core/shortcuts.js';

export const name = 'shortcut';

export const css = `
.sc { display: flex; align-items: center; gap: var(--space-1); }
.sc-field { height: var(--control-h-sm); width: var(--sc-field-w); padding: 0 var(--space-2); border: 0; border-radius: var(--r-control); corner-shape: var(--corner); background: var(--muted); color: var(--foreground); font: inherit; font-size: var(--text-xs); text-align: center; font-variant-numeric: tabular-nums; outline: none; caret-color: transparent; cursor: default; transition: box-shadow var(--dur-fast) var(--ease-standard); }
.sc-field::placeholder { color: var(--muted-foreground); }
.sc-field:focus-visible { box-shadow: 0 0 0 var(--focus-w) var(--focus-soft); }

.sc-field:disabled { opacity: .5; }
.sc-edit { font-variant-numeric: tabular-nums; }
.sc-edit.capturing, .sc-edit.unset { color: var(--muted-foreground); }
`;

export const hook = 'data-sc-record';

/* the more button of one shortcut row: named with that row, so a page of shortcuts has no six buttons all called "More" (B3-13) */
const more = p => (p.name ? `${t('settings.more')}, ${p.name}` : undefined);
/** @param {{keys?: string[], menu?: string, arg?: any, record?: boolean, edit?: boolean, action?: string, reset?: string, disabled?: boolean, label?: string, tip?: string, scope?: 'surface', name?: string}} p  name: the row it belongs to (its more button is "More, <name>") */
export function render(p) {
  const shown = keyText(p.keys || []), scope = p.scope === 'surface' ? 'surface' : null;
  if (p.record) return html`<span class="sc" data-c="shortcut"><input class="sc-field" readonly spellcheck="false" autocomplete="off"${attrs({ 'data-sc-record': p.action, 'data-sc-scope': scope, 'data-arg': p.arg, value: shown, placeholder: t('shortcut.notSet'), 'aria-label': p.label, disabled: p.disabled })}>${p.reset ? iconButton.render({ icon: 'arrow-undo-up', tip: t('shortcut.reset'), size: 'sm', action: p.reset, arg: p.arg, disabled: p.disabled }) : ''}</span>`;
  if (p.edit) return html`<span class="sc" data-c="shortcut"><button class="${p.keys?.length ? 'btn secondary sc-edit' : 'btn secondary sc-edit unset'}" data-c="button"${attrs({ 'data-sc-record': p.action, 'data-sc-scope': scope, 'data-arg': p.arg, 'data-before': shown, 'aria-label': p.label, title: p.tip, disabled: p.disabled })}>${p.keys?.length ? shown : t('shortcut.notSet')}</button>${p.menu ? button.render({ icon: 'more', variant: 'outline', menu: p.menu, arg: p.arg, tip: t('settings.more'), ariaLabel: more(p) }) : ''}</span>`;
  return html`<span class="sc" data-c="shortcut">${button.render({ label: shown, variant: 'secondary' })}${p.menu ? button.render({ icon: 'more', variant: 'outline', menu: p.menu, arg: p.arg, tip: t('settings.more'), ariaLabel: more(p) }) : ''}</span>`;
}

const MODIFIER = new Set(['Meta', 'Control', 'Alt', 'Shift', 'OS', 'AltGraph']);

/**
 * The key tokens a keydown records, or the locale key of the reason it is refused. mac: the platform.
 * surface: one key with Shift or alone; otherwise a modifier is needed (⌘ ⌃ ⌥ on macOS, Ctrl or Alt elsewhere, never the Windows key).
 */
export function recordKeys(e, { mac = isMac(), surface = false } = {}) {
  if (surface) {
    const k = surfaceKey(e, { field: true });
    if (!k) return { error: 'shortcut.invalidSurface' };
    if (k === '?') return { keys: ['?'] };
    const shift = k.startsWith('shift+'), key = shift ? k.slice(6) : k;
    return { keys: [shift && (mac ? '⇧' : 'Shift'), keyWord(key, { mac })].filter(Boolean) };
  }
  const k = physicalKey(e), error = mac ? 'shortcut.invalid' : 'shortcut.invalidPc';
  if (!k || ['escape', 'tab'].includes(k) || (!mac && e.metaKey)) return { error };
  if (!(mac ? e.metaKey || e.ctrlKey || e.altKey : e.ctrlKey || e.altKey)) return { error };
  const keys = mac ? [e.ctrlKey && '⌃', e.altKey && '⌥', e.shiftKey && '⇧', e.metaKey && '⌘'] : [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'];
  return { keys: [...keys.filter(Boolean), keyWord(k, { mac })] };
}

export function attach(root, ctx) {
  const isButton = f => f.tagName === 'BUTTON';
  const mac = isMac();
  root.addEventListener('focusin', e => {
    const f = e.target.closest?.('[data-sc-record]'); if (!f) return;
    if (isButton(f)) { f.classList.add('capturing'); f.textContent = t('shortcut.press'); ctx.emit('kit.shortcuts.suspend', { on: true }); return; }
    f.dataset.before = f.value; f.value = ''; f.placeholder = t('shortcut.press');
  });
  root.addEventListener('focusout', e => {
    const f = e.target.closest?.('[data-sc-record]'); if (!f) return;
    if (isButton(f)) { f.classList.remove('capturing'); f.textContent = f.dataset.before || t('shortcut.notSet'); ctx.emit('kit.shortcuts.suspend', { on: false }); return; }
    if (!f.value) f.value = f.dataset.before || '';
    f.placeholder = t('shortcut.notSet');
  });
  root.addEventListener('keydown', e => {
    const f = e.target.closest?.('[data-sc-record]'); if (!f || e.isComposing) return;
    if (e.key === 'Tab') return;
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') { f.blur(); return; }
    if (MODIFIER.has(e.key)) return;
    const { keys, error } = recordKeys(e, { mac, surface: f.dataset.scScope === 'surface' });
    if (error) { ctx.toast?.show({ title: t(error), tone: 'error' }); return; }
    if (!isButton(f)) { f.value = keyText(keys, { mac }); f.dataset.before = f.value; }
    ctx.emit(f.dataset.scRecord, { arg: f.dataset.arg ? JSON.parse(f.dataset.arg) : undefined, keys, combo: comboOf(keys, { mac }) });
    f.blur();
  }, true);
}
