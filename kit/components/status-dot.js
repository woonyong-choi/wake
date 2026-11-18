/*
 * Status dot: 8 round dot colored by state (ok, warn/medium, off, high, critical). One component for every dot
 * (sidebar rows, settings rows, list rows, popover rows).
 */
import { html } from '../core/html.js';

export const name = 'status-dot';

export const css = `
.dot { width: var(--dot); height: var(--dot); border-radius: var(--r-round); flex-shrink: 0; display: inline-block; }
.dot.ok { background: var(--success); }
.dot.warn, .dot.medium { background: var(--warning); }
.dot.off { background: var(--n-tertiary); }
.dot.high { background: var(--serious); }
.dot.critical { background: var(--destructive); }
`;

/** @param {{tone: string, label?: string}} p  label is read by assistive tech */
export function render(p) {
  return html`<span class="dot ${p.tone}" data-c="status-dot"${p.label ? html` role="img" aria-label="${p.label}"` : ''}></span>`;
}
