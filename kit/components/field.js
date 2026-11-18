/*
 * Form field: label + control + error line.
 *   layout 'stack' (default): label (14/500, line 1) above the control, 8 apart; a required field marks its label with a destructive asterisk.
 *   layout 'grid': label column 160 (14, muted) and the control, 12 apart, centered on the row.
 *   layout 'row': a property row inside rows(): label on the left, control on the right, 44 high, 16 side padding.
 * The error is one destructive 14 line under the control (only when there is something to fix).
 * rows() wraps 'row' fields in a bordered card (radius lg, rules between rows).
 */
import { html, cx } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'field';

export const css = `
.fld { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.fld-label { display: flex; align-items: center; gap: var(--space-1); font-size: var(--text-sm); font-weight: var(--weight-medium); line-height: 1; user-select: none; }
.fld-label .req { color: var(--destructive); }
.fld-err { font-size: var(--text-sm); color: var(--destructive); }
.fld-err:empty { display: none; }
.fld-hint { font-size: var(--text-xs); line-height: var(--leading-xs); color: var(--muted-foreground); }
.fld-lock { display: inline-grid; color: var(--muted-foreground); margin-left: auto; }
.fld-lock .wi { width: var(--icon-xs); height: var(--icon-xs); }
.fld.grid { display: grid; grid-template-columns: var(--fld-label-w) minmax(0, 1fr); align-items: center; column-gap: var(--space-3); row-gap: var(--space-1); }
.fld.grid .fld-label { font-weight: var(--weight-regular); color: var(--muted-foreground); line-height: var(--leading-sm); }
.fld.grid .fld-err { grid-column: 2; }
.fld.row { flex-direction: row; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: var(--fld-row-h); padding: 0 var(--space-2) 0 var(--space-3_5); }
.fld.row .fld-label { font-weight: var(--weight-regular); line-height: var(--leading-sm); }
.fld-rows { display: flex; flex-direction: column; border: var(--line) solid var(--border); border-radius: var(--r-control); corner-shape: var(--corner); overflow: hidden; }
.fld-rows > .fld + .fld { border-top: var(--line) solid var(--border); }
.fld-stack { display: flex; flex-direction: column; gap: var(--space-4); }
`;

/** @param {{label: string, control: any, required?: boolean, error?: string, hint?: string, lock?: string, layout?: 'stack'|'grid'|'row', key?: string, id?: string}} p
 *  hint: one muted line under the control (where the value comes from); lock: a small lock after the label for a secret, its text as a tooltip (where it is kept) */
export function render(p) {
  return html`<div class="${cx('fld', p.layout && p.layout !== 'stack' && p.layout)}" data-c="field"${p.key ? html` data-field-box="${p.key}"` : ''}><label class="fld-label"${p.id ? html` for="${p.id}"` : ''}>${p.label}${p.required ? html`<span class="req" aria-hidden="true">*</span>` : ''}${p.lock ? html`<span class="fld-lock" data-tip="${p.lock}" aria-label="${p.lock}">${icon('lock')}</span>` : ''}</label>${p.control}${p.hint && !p.error ? html`<div class="fld-hint">${p.hint}</div>` : ''}<div class="fld-err" role="alert">${p.error || ''}</div></div>`;
}

/** Bordered card of 'row' fields @param {{children}} p */
export function rows(p) {
  return html`<div class="fld-rows">${p.children}</div>`;
}

/** Vertical stack of fields, 16 apart @param {{children}} p */
export function stack(p) {
  return html`<div class="fld-stack">${p.children}</div>`;
}
