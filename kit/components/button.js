/*
 * Button: variant default (filled) / secondary / ghost / outline (input border, 30% input fill, 50% on hover) / destructive / danger (solid red, white label) / link (muted 12/500 text, no box), size lg 36 / default 32 / sm 28 / xs 24.
 * kbd: a key hint chip after the label (confirmation dialogs: Esc, ⌘Q).
 * round: fully round (pill) shape.
 * Icon before the label (icon) or after it (iconEnd).
 */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'button';

export const css = `
.btn { height: var(--page-control-h, var(--control-h)); padding: 0 var(--space-2_5); display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1_5); border-radius: var(--r-control); corner-shape: var(--corner); font-size: var(--text-sm); font-weight: var(--weight-medium); white-space: nowrap; flex-shrink: 0; border: var(--line) solid transparent; background-clip: padding-box; transition: background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), opacity var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard); }
.btn.has-icon { padding-left: var(--space-2); }
.btn.has-icon-end { padding-right: var(--space-2); }
.btn.sm { height: var(--control-h-sm); gap: var(--space-1); font-size: var(--text-btn-sm); }
.btn.sm .wi { width: var(--icon-sm); height: var(--icon-sm); }
.btn.sm.has-icon { padding-left: var(--space-1_5); }
.btn.lg { height: var(--control-h-lg); padding: 0 var(--space-3); }
.btn.xs { height: var(--control-h-xs); padding: 0 var(--space-2); gap: var(--space-1); font-size: var(--text-xs); }
.btn.xs .wi { width: var(--icon-xs); height: var(--icon-xs); }
.btn.round { border-radius: var(--r-pill); }
.btn.icon-only { width: var(--control-h); padding: 0; }
.btn.sm.icon-only { width: var(--control-h-sm); }
.btn.default { background: var(--action); color: var(--action-fg); }
.btn.default:hover { background: var(--action-hover); }
.btn.secondary { background: var(--secondary); color: var(--surface-primary-foreground); }
.btn.secondary:hover, .btn.secondary[aria-expanded="true"] { background: var(--secondary-80); }
.btn.ghost:hover, .btn.ghost[aria-expanded="true"] { background: var(--ghost-hover); color: var(--foreground); }
.btn.outline { border-color: var(--input); background: var(--input-30); color: var(--foreground); }
.btn.outline:hover, .btn.outline[aria-expanded="true"] { background: var(--input-50); }
.btn.destructive { background: var(--destructive-soft); color: var(--destructive); }
.btn.destructive:hover { background: var(--destructive-soft-hover); }
.btn.danger { background: var(--danger-solid); color: var(--danger-solid-fg); --btn-kbd: var(--danger-kbd); }
.btn.danger:hover { background: var(--danger-solid-hover); }
.btn-kbd { height: var(--kbd-h); min-width: var(--kbd-min-w); padding: 0 var(--space-1_5); display: inline-grid; place-items: center; border-radius: var(--r-chip); corner-shape: var(--corner); background: var(--btn-kbd, var(--secondary)); font-size: var(--text-xs); font-weight: var(--weight-medium); opacity: .8; }
.btn.link { height: auto; padding: 0; gap: var(--space-1); border-radius: var(--r-chip); font-size: var(--text-xs); color: var(--muted-foreground); }
a.btn { text-decoration: none; }
.btn.link:hover { color: var(--foreground); }
.btn.link .wi { width: var(--icon-xs); height: var(--icon-xs); }
.btn:disabled { opacity: .5; pointer-events: none; }
`;

/** A strict external address: https only, a host, no userinfo, no control characters or spaces. Returns the normalized href or null. */
export function safeHref(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000- \u007f-\u009f\\]/.test(value) || !/^https:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/* href: one native link (never a button with data-action, so one activation and one key press); a rejected href is inert text */
function renderLink(p, v) {
  const href = safeHref(p.href);
  const content = html`${p.icon ? icon(p.icon) : ''}${p.label ? html`<span>${p.label}</span>` : ''}`;
  const klass = cx('btn', v, p.size && p.size !== 'default' && p.size, p.icon && p.label && 'has-icon', !p.label && 'icon-only');
  if (!href) return html`<span class="${klass}" data-c="button" aria-disabled="true">${content}</span>`;
  return html`<a class="${klass}" data-c="button" href="${href}" target="_blank" rel="noopener noreferrer"${attrs({
    'data-tip': p.tip, 'aria-label': p.ariaLabel || (p.label ? null : p.tip),
  })}>${content}</a>`;
}

/**
 * href (variant link): a native https link opened in a new tab (rel noopener noreferrer); ariaLabel names it for assistive tech.
 * @param {{label?: string, icon?: string, iconEnd?: string, variant?: string, size?: string, round?: boolean, action?: string, arg?: any, menu?: string, dialog?: string, tip?: string, ariaLabel?: string, disabled?: boolean, kbd?: string}} p  dialog opens that dialog with arg; ariaLabel names an icon button more fully than its tip (which row it belongs to)
 */
export function render(p) {
  const v = p.variant || 'default';
  if (p.href != null) return renderLink(p, v);
  return html`<button class="${cx('btn', v, p.size && p.size !== 'default' && p.size, p.round && 'round', p.icon && p.label && 'has-icon', p.iconEnd && 'has-icon-end', !p.label && 'icon-only')}" data-c="button"${attrs({
    'data-action': p.action, 'data-arg': p.arg, 'data-menu': p.menu, 'data-menu-arg': p.menu ? p.arg : null, 'data-dialog': p.dialog, 'data-dialog-arg': p.dialog ? p.arg : null, 'data-tip': p.tip, 'aria-label': p.ariaLabel || (p.label ? null : p.tip), 'aria-expanded': p.expanded == null ? null : String(!!p.expanded), disabled: p.disabled,
  })}>${p.icon ? icon(p.icon) : ''}${p.label ? html`<span>${p.label}</span>` : ''}${p.kbd ? html`<kbd class="btn-kbd">${p.kbd}</kbd>` : ''}${p.iconEnd ? icon(p.iconEnd) : ''}</button>`;
}
