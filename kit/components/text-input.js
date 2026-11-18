/*
 * Text input: height 32, radius lg, 1px input border, input 30% fill (dark), 10 side padding, 14 text, placeholder muted.
 * Focus: ring-colored border and a 3px ring. Invalid (aria-invalid): destructive border and ring. Disabled: 50% opacity.
 * multiline is a textarea (min height 64, 8 x 10 inside, grows with its content, no resize handle); code uses the mono face.
 * The value is read by its owner (dialog, page) through data-field.
 */
import { html, cx, attrs } from '../core/html.js';

export const name = 'text-input';

export const css = `
.inp { width: 100%; min-width: 0; height: var(--page-control-h, var(--control-h)); padding: 0 var(--space-2_5); border-radius: var(--r-control); corner-shape: var(--corner); border: var(--line) solid var(--input); background: var(--input-30); color: var(--foreground); font: inherit; font-size: var(--text-sm); outline: none; text-overflow: ellipsis; transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard); }
:root[data-theme="light"] .inp { background: transparent; }
.inp::placeholder { color: var(--muted-foreground); }
.inp:focus-visible { border-color: var(--focus-border); box-shadow: 0 0 0 var(--focus-w) var(--focus-soft); }
.inp[aria-invalid="true"] { border-color: var(--invalid-border); box-shadow: 0 0 0 var(--focus-w) var(--invalid-ring); }
.inp:disabled { opacity: .5; pointer-events: none; }
textarea.inp { height: auto; min-height: var(--textarea-min-h); padding: var(--space-2) var(--space-2_5); resize: none; field-sizing: content; line-height: var(--leading-sm); text-overflow: clip; }
textarea.inp.code { font-family: var(--font-mono); font-size: var(--text-xs); line-height: var(--leading-code); white-space: pre; field-sizing: fixed; height: var(--textarea-code-h); overflow: auto; }
`;

/**
 * @param {{key: string, value?: string, placeholder?: string, multiline?: boolean, code?: boolean, invalid?: boolean, disabled?: boolean, label?: string, id?: string, type?: 'password'}} p  type 'password' hides the value as it is typed (a secret)
 */
export function render(p) {
  const a = attrs({ id: p.id, 'data-field': p.key, placeholder: p.placeholder, 'aria-label': p.label, 'aria-invalid': p.invalid ? 'true' : null, disabled: p.disabled, spellcheck: 'false', autocomplete: 'off' });
  return p.multiline || p.code
    ? html`<textarea class="${cx('inp', p.code && 'code')}" data-c="text-input"${a}>${p.value || ''}</textarea>`
    : html`<input class="inp" data-c="text-input" type="${p.type === 'password' ? 'password' : 'text'}"${a}${attrs({ value: p.value })}>`;
}
