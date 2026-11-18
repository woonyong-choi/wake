/* Split button: main button (icon + label) + trailing chevron button, a rule between, only outer corners radius lg, height 32 */
import { html } from '../core/html.js';
import * as button from './button.js';

export const name = 'split-button';

export const css = `
.split { display: inline-flex; align-items: stretch; flex-shrink: 0; }
.split > .btn:first-child { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.split > .btn:last-child { border-top-left-radius: 0; border-bottom-left-radius: 0; padding: 0 var(--space-2); box-shadow: inset var(--line) 0 0 var(--split-divider); }
.split > .slt:first-child { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.split > .slt + .btn { width: var(--control-h); padding: 0; border: var(--line) solid var(--input); border-left: 0; background: transparent; box-shadow: none; }
`;

/** @param {{main: any, menu: string, arg?: any, variant?: string, tip?: string}} p  main is a button or select fragment */
export function render(p) {
  return html`<span class="split" data-c="split-button">${p.main}${button.render({ icon: p.variant === 'more' ? 'more' : 'chevron-down-small', variant: p.variant === 'more' ? 'secondary' : (p.variant || 'default'), menu: p.menu, arg: p.arg, tip: p.tip })}</span>`;
}
