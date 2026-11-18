/*
 * Checkbox: 16 box, radius xs, strong 1px inner ring; checked fills with primary and shows a 12 check.
 * Multi-select lists (data table rows, multi-select menus) use it; a single choice uses a check mark, or radio() in a row list.
 */
import { html, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'checkbox';

export const css = `
.cbx { width: var(--icon); height: var(--icon); border-radius: var(--r-mark); box-shadow: inset 0 0 0 var(--line) var(--border-surface-strong); display: inline-grid; place-items: center; flex-shrink: 0; vertical-align: middle; color: var(--primary-foreground); transition: background-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard); }
.cbx.interactive { border: 0; padding: 0; background: transparent; }
.cbx.interactive:hover { box-shadow: inset 0 0 0 var(--line) var(--muted-foreground); }
.cbx.interactive:disabled { background: var(--surface-tertiary); color: var(--muted-foreground); box-shadow: inset 0 0 0 var(--line) var(--border); }
.cbx.interactive:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--space-0_5); }
.cbx[aria-checked="mixed"], .cbx[data-state="mixed"] { background: var(--primary); box-shadow: none; }
.cbx[aria-checked="true"], .cbx[data-state="true"] { background: var(--primary); box-shadow: none; }
.cbx .wi { width: var(--icon-xs); height: var(--icon-xs); }
.rdo { width: var(--icon); height: var(--icon); border-radius: var(--r-pill); box-shadow: inset 0 0 0 var(--line) var(--border-surface-strong); display: inline-grid; place-items: center; flex-shrink: 0; transition: box-shadow var(--dur-fast) var(--ease-standard); }
.rdo::after { content: ""; width: var(--space-2); height: var(--space-2); border-radius: var(--r-pill); background: var(--primary); transform: scale(0); transition: transform var(--dur-fast) var(--ease-standard); }
.rdo.on { box-shadow: inset 0 0 0 var(--line) var(--primary); }
.rdo.on::after { transform: none; }
@media (prefers-reduced-motion: reduce) { .cbx.interactive { transition: none; } }
`;

/** decorative: the box drawn inside a row that carries the checkbox role itself (a menu row): no role, hidden from assistive tech
 * @param {{checked?: boolean, action?: string, arg?: any, label?: string, interactive?: boolean, indeterminate?: boolean, disabled?: boolean, decorative?: boolean}} p */
export function render(p = {}) {
  if (p.interactive !== undefined && typeof p.interactive !== 'boolean') throw new TypeError('invalid checkbox interaction');
  if (p.interactive === true) {
    if (typeof p.label !== 'string' || !p.label.trim()) throw new TypeError('interactive checkbox requires a label');
    for (const key of ['checked', 'indeterminate', 'disabled']) if (p[key] !== undefined && typeof p[key] !== 'boolean') throw new TypeError('invalid checkbox state');
    const state = p.indeterminate ? 'mixed' : String(!!p.checked);
    return html`<button type="button" class="cbx interactive" role="checkbox" data-c="checkbox" aria-checked="${state}"${attrs({ 'data-action': p.action, 'data-arg': p.arg, 'aria-label': p.label, disabled: p.disabled })}>${p.indeterminate ? icon('minus') : p.checked ? icon('check') : ''}</button>`;
  }
  if (p.decorative) return html`<span class="cbx" data-c="checkbox" aria-hidden="true"${attrs({ 'data-state': p.indeterminate ? 'mixed' : String(!!p.checked) })}>${p.indeterminate ? icon('minus') : p.checked ? icon('check') : ''}</span>`;
  return html`<span class="cbx" role="checkbox" data-c="checkbox" aria-checked="${p.indeterminate ? 'mixed' : String(!!p.checked)}"${attrs({ 'data-action': p.action, 'data-arg': p.arg, 'aria-label': p.label })}>${p.indeterminate ? icon('minus') : p.checked ? icon('check') : ''}</span>`;
}

/** Radio mark of a single choice row (the row carries role radio) @param {{checked?: boolean}} p */
export function radio(p = {}) {
  return html`<span class="${p.checked ? 'rdo on' : 'rdo'}" aria-hidden="true"></span>`;
}
