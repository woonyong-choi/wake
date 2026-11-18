/*
 * Detail bar: the controls of a detail page (back, expand or restore, close), drawn by the page runtime above the page content, outside
 * the page's own render tree (a redraw of the page never touches it). The detail is a page view in the right pane beside its list.
 * html.is-detail: the document is a column (bar, then the page) that follows the pane's width.
 */
import { html } from '../core/html.js';
import { render as iconButton } from './icon-button.js';

export const name = 'detail-bar';

export const css = `
html.is-detail, html.is-detail body[data-kind="page"] { overflow: hidden; }
html.is-detail body[data-kind="page"] { display: flex; flex-direction: column; }
html.is-detail body[data-kind="page"] > main { flex: 1; height: auto; min-height: 0; }
.detail-bar { flex: none; display: flex; align-items: center; gap: var(--space-1); height: var(--topbar-h); padding: 0 var(--space-3); }
.detail-bar .detail-spacer { flex: 1; }
/* html.detail-in: the card has just been placed beside its list (at its share, in one frame): its content slides in from the side it opens on (sim) */
html.detail-in body[data-kind="page"] { animation: detail-in var(--dur-flow-reveal) var(--ease-standard) both; }
@keyframes detail-in { from { opacity: 0; transform: translateX(var(--space-4)); } }
`;

/** @param {{back: string, expand: string, collapse: string, close: string, expanded?: boolean}} p  button labels (translated by the caller) */
export function render(p) {
  return html`<div class="detail-bar" data-c="detail-bar" role="toolbar" aria-label="${p.label || ''}">
    ${iconButton({ icon: 'chevron-left-medium', tip: p.back, size: 'sm', action: 'kit.detail.back' })}
    <span class="detail-spacer"></span>
    ${iconButton({ icon: p.expanded ? 'arrows-collapse' : 'arrows-expand', tip: p.expanded ? p.collapse : p.expand, size: 'sm', action: 'kit.detail.toggle' })}
    ${iconButton({ icon: 'cross-medium', tip: p.close, size: 'sm', action: 'kit.detail.close' })}
  </div>`;
}
