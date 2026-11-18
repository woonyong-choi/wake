/* Search field: height 32, radius lg, 1px input border, input 30% background, magnifier + input (text 6 after the icon). Focus: 3px focus ring.
 * surface: on the primary surface with a small shadow (settings nav, measured: white in light). */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'search-input';

export const css = `
.si { height: var(--page-control-h, var(--si-h)); display: flex; align-items: center; padding: 0 0 0 var(--si-pl); border: var(--line) solid var(--input); border-radius: var(--r-control); corner-shape: var(--corner); background: var(--input-30); color: var(--muted-foreground); min-width: 0; transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard); }
.si input { flex: 1; min-width: 0; height: 100%; padding: 0 var(--space-2_5) 0 var(--space-1_5); background: none; border: 0; outline: 0; font-size: var(--text-sm); color: var(--foreground); }
.si input::placeholder { color: var(--muted-foreground); }
.si:focus-within { box-shadow: 0 0 0 var(--focus-w) var(--focus); }
.si.surface { background: var(--surface-primary); box-shadow: var(--shadow-xs); }
.si.sm { height: var(--control-h-sm); }
.si.surface:focus-within { box-shadow: 0 0 0 var(--focus-w) var(--focus), var(--shadow-xs); }
`;

/** @param {{placeholder: string, action?: string, arg?: any, value?: string, width?: string, surface?: boolean, size?: 'sm'}} p  size 'sm': 28 high (a list's search)  action gets { arg, value } as the text changes (not while composing) */
export function render(p) {
  return html`<label class="${cx('si', p.surface && 'surface', p.size === 'sm' && 'sm')}" data-c="search-input"${attrs({ style: p.width ? `width:${p.width}` : null })}>${icon('search')}<input type="search" placeholder="${p.placeholder}" aria-label="${p.placeholder}"${attrs({ 'data-input': p.action, 'data-arg': p.arg, value: p.value })}></label>`;
}

/* a field with data-input sends its text to its action as it changes (an input method's text when composing ends) */
export function attach(root, ctx) {
  const send = e => { const f = e.target.closest?.('.si input[data-input]'); if (!f || e.isComposing) return; ctx.emit(f.dataset.input, { arg: f.dataset.arg ? JSON.parse(f.dataset.arg) : undefined, value: f.value }); };
  root.addEventListener('input', send);
  root.addEventListener('compositionend', send);
}
