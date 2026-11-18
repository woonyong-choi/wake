/*
 * Settings group card: radius xl, no visible border in either theme, widened 14 outward on both sides. Dark theme has 1px gaps between rows, light theme rules.
 * Consecutive groups are 8 apart.
 * notice: a muted banner at the top of the card (13/500, info icon, 16 side padding) with an optional small action on the right (a limit, an upgrade).
 */
import { icon } from '../icons/icons.js';
import { html } from '../core/html.js';

export const name = 'settings-group';

export const css = `
.sg-card.round { margin-inline: 0; border-radius: var(--r-surface); corner-shape: var(--corner-round); background: var(--surface-secondary); border-color: var(--border-surface); gap: 0; transition: background var(--dur-fast) var(--ease-standard); } /* the reference's wide round widget: the same rows in a bigger round card, kept apart from the page edge */
.sg-card.round:hover { background: var(--surface-primary); }
.sg-card.round { padding-block: var(--space-2); } /* the card's corner is big: content keeps clear of its curve, on the sides and at the top and bottom, and the rows take the card's own face */
.sg-card.round > .sr-row, .sg-card.round > .sr-item > .sr-row { --srow-padding: var(--space-1) var(--space-5); background: none; }
.sg-card.round > :not(.sr-row):not(.sr-item) { padding-inline: var(--space-5); }
.sg-card.round > * + * { box-shadow: inset 0 var(--line) 0 var(--border-half); }
.sg-card { margin: 0 var(--page-group-inset, calc(-1 * var(--space-3_5))); border: var(--line) solid transparent; border-radius: var(--r-panel); corner-shape: var(--corner); overflow: hidden; display: flex; flex-direction: column; gap: var(--line); }
.sg-card + .sg-card { margin-top: var(--sg-card-gap); }
:root[data-theme="light"] .sg-card { gap: 0; } /* a borderless face in both themes, as the reference app's group */
:root[data-theme="light"] .sg-card > * + * { box-shadow: inset 0 var(--line) 0 var(--border); }
.sg-notice { display: flex; align-items: center; justify-content: space-between; gap: var(--space-1); min-height: var(--sg-notice-h); padding: 0 var(--space-2) 0 var(--space-4); background: var(--muted); color: var(--muted-foreground); font-size: var(--text-native-sm); font-weight: var(--weight-medium); }
.sg-notice > span { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
`;

/** @param {{children, notice?: {text: string, action?: any}, role?: string, round?: boolean}} p  round: the reference's wide round widget instead of the page group */
export function render(p) {
  return html`<div class="${p.round ? 'sg-card round' : 'sg-card'}" data-c="settings-group"${p.role ? html` role="${p.role}"` : ''}>${p.notice ? html`<div class="sg-notice" role="note"><span>${icon('circle-info', 'sm')}<span class="trunc">${p.notice.text}</span></span>${p.notice.action || ''}</div>` : ''}${p.children}</div>`;
}
