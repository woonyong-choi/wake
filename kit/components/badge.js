/*
 * Status badge (shadcn badge with the reference color rules): ok, warn, danger, neutral, brand.
 * A running state is never a badge: it is the spinning status icon with muted words (status-icon text). count is a round cell holding only a number.
 * size 'sm' is 16 high with 11 text (nav 'New'); tone 'tag' is a solid brand tag (10/600 white, radius sm) for plan marks.
 */
import { html, cx } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'badge';

export const css = `
.badge { display: inline-flex; align-items: center; gap: var(--space-1); height: var(--badge-h); padding: 0 var(--space-2); border-radius: var(--r-pill); font-size: var(--text-xs); font-weight: var(--weight-medium); white-space: nowrap; flex-shrink: 0; line-height: var(--leading-xs); }
.badge.ok { background: var(--success-soft); color: var(--success-content); }
.badge.warn { background: var(--warning-soft); color: var(--warning-content); }
.badge.danger { background: var(--destructive-soft); color: var(--destructive-content); }
.badge.neutral { background: var(--secondary); color: var(--muted-foreground); }
.badge.brand { background: var(--brand-badge); color: var(--brand-content); }
.badge .wi { width: var(--icon-xs); height: var(--icon-xs); }
.badge.sm { height: var(--badge-h-sm); padding: 0 var(--space-1_5); font-size: var(--text-2xs); }
.badge.tag { height: auto; padding: var(--space-px) var(--space-1_5); border-radius: var(--r-chip); background: var(--brand); color: var(--brand-fg); font-size: var(--text-3xs); line-height: 1; font-weight: var(--weight-semibold); user-select: none; }
.count { display: inline-flex; align-items: center; justify-content: center; min-width: var(--badge-h); height: var(--badge-h); padding: 0 var(--space-1_5); border-radius: var(--r-pill); font-size: var(--text-xs); font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; background: var(--secondary); color: var(--muted-foreground); }
.count.warn { background: var(--warning-soft); color: var(--warning-content); }
.count.danger { background: var(--destructive-soft); color: var(--destructive-content); }
`;

/** @param {{tone?: string, label: string, icon?: string, size?: 'sm'}} p */
export function render(p) {
  return html`<span class="${cx('badge', p.tone || 'neutral', p.size === 'sm' && 'sm')}" data-c="badge">${p.icon ? icon(p.icon, 'xs') : ''}${p.label}</span>`;
}

/** Count cell @param {{value: number|string, tone?: string}} p */
export function count(p) {
  return html`<span class="${cx('count', p.tone)}" data-c="badge">${p.value}</span>`;
}
