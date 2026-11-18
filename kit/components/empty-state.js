/* Empty state: 32 icon cell (radius lg, muted background) + title 14/500 + description 14 muted + one action, centered.
 * variant 'line' is the empty state inside a card (a summary bar's body): one muted line of words, no icon and no action.
 * variant 'card' sits in a settings column: surface card (radius xl, widened 14 outward, 24 inside); round: the card in the body cards' own shape (the round face and its edge of a summary line or an info card) */
import { html } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'empty-state';

export const css = `
.empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--space-2); padding: var(--space-10) var(--space-4); }
.empty-ico { width: var(--control-h); height: var(--control-h); border-radius: var(--r-control); corner-shape: var(--corner); background: var(--muted); display: grid; place-items: center; color: var(--foreground); margin-bottom: var(--space-1); }
.empty-ico.plain { color: var(--muted-foreground); background: transparent; }
.empty-ico.plain .wi { width: var(--space-7); height: var(--space-7); }
.empty-title { font-size: var(--text-sm); font-weight: var(--weight-medium); }
.empty-desc { font-size: var(--text-sm); color: var(--muted-foreground); }
.empty.card { margin: 0 calc(-1 * var(--space-3_5)); padding: var(--space-6); gap: var(--space-1); border-radius: var(--r-panel); corner-shape: var(--corner); background: var(--surface-secondary); min-height: var(--empty-card-h); justify-content: center; }
.empty.card .empty-ico { margin-bottom: var(--space-2); }
.empty-line { margin: 0; padding-block: var(--space-2); font-size: var(--text-sm); color: var(--muted-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty.card.round { border-radius: var(--r-surface); corner-shape: var(--corner-round); border: var(--line) solid var(--border-surface); }
`;

/** @param {{icon?: string, title: string, description?: string, action?: any, variant?: 'card'|'line', round?: boolean, plainIcon?: boolean}} p */
export function render(p) {
  if (p.variant === 'line') return html`<p class="empty-line" data-c="empty-state">${p.title}</p>`;
  return html`<div class="${p.variant === 'card' ? (p.round ? 'empty card round' : 'empty card') : 'empty'}" data-c="empty-state"><span class="${p.plainIcon ? 'empty-ico plain' : 'empty-ico'}">${icon(p.icon)}</span><div class="empty-title">${p.title}</div>${p.description ? html`<div class="empty-desc">${p.description}</div>` : ''}${p.action || ''}</div>`;
}
