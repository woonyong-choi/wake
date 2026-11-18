/*
 * Icon button: no background at rest, muted 50% background on hover. Sizes md 32, sm 28, xs 24.
 * variant 'native' is for the sidebar and top bar (native look).
 */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'icon-button';

export const css = `
.ib { width: var(--control-h); height: var(--control-h); display: grid; place-items: center; border-radius: var(--r-control); corner-shape: var(--corner); color: var(--muted-foreground); flex-shrink: 0; transition: background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard); }
.ib:hover, .ib[aria-expanded="true"] { background: var(--ghost-hover); color: var(--foreground); }
.ib.sm { width: var(--control-h-sm); height: var(--control-h-sm); }
.ib.xs { width: var(--control-h-xs); height: var(--control-h-xs); border-radius: var(--r-control-sm); }
.ib:disabled { opacity: .45; pointer-events: none; }
.ib.native { color: var(--n-secondary); border-radius: var(--r-control); corner-shape: var(--corner-round); }
.ib.native:hover, .ib.native[aria-expanded="true"] { background: var(--n-btn-hover); color: var(--n-label); }
.ib.native.tertiary { color: var(--n-tertiary); }
`;

/**
 * @param {{icon: string, tip?: string, size?: 'md'|'sm'|'xs', iconSize?: string, variant?: 'native'|'tertiary', action?: string, arg?: any, menu?: string, disabled?: boolean, label?: string}} p
 */
export function render(p) {
  return html`<button class="${cx('ib', p.size && p.size !== 'md' && p.size, p.variant === 'native' && 'native', p.variant === 'tertiary' && 'native tertiary')}" data-c="icon-button"${attrs({
    'data-action': p.action, 'data-arg': p.arg, 'data-menu': p.menu, 'data-menu-arg': p.menu ? p.arg : null,
    'data-tip': p.tip, 'aria-label': p.label || p.tip, disabled: p.disabled,
  })}>${icon(p.icon, p.iconSize || 'md')}</button>`;
}
