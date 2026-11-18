/* Shortcut keys: height 18, min width 20, 6 side padding, radius sm, 11/500 primary text on muted background. keys is a list of key groups */
import { html } from '../core/html.js';

export const name = 'kbd';

export const css = `
.kbd-group { display: inline-flex; align-items: center; gap: var(--space-1); }
.kbd { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1); height: var(--kbd-h); min-width: var(--kbd-min-w); padding: 0 var(--space-1_5); border-radius: var(--r-chip); corner-shape: var(--corner); background: var(--muted); font-family: var(--font-sans); font-size: var(--text-2xs); font-weight: var(--weight-medium); color: var(--primary); line-height: 1; pointer-events: none; user-select: none; }
`;

/** @param {{keys: string[]}} p */
export function render(p) {
  return html`<span class="kbd-group" data-c="kbd">${p.keys.map(k => html`<kbd class="kbd">${k}</kbd>`)}</span>`;
}
