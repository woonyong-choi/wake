/*
 * Sidebar section header: name; on hover a background, a collapse chevron (up when open, turned down when closed) and a tooltip.
 * The tooltip is the system one (title): measured on the reference, it opens at the pointer, below and to the right, not at the header.
 * context names the right-click menu of the section (data-context), as on the reference's Chats header.
 */
import { html, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'section-header';

export const css = `
.sb-sec-head { height: var(--section-head-h); margin: var(--sb-head-gap) var(--sb-row-mx) 0; padding: 0 var(--sb-head-px); display: flex; align-items: center; justify-content: space-between; width: calc(100% - 2 * var(--sb-row-mx)); color: var(--n-tertiary); font-family: var(--font-native); font-size: var(--text-native-sm); border-radius: var(--r-row); }
.sb-sec-head:hover { background: var(--n-hover); }
.sb-sec-head .chev { opacity: 0; display: grid; color: var(--n-secondary); transition: opacity var(--dur-fast) var(--ease-standard); }
.sb-sec-head:hover .chev, .sb-sec-head:focus-visible .chev { opacity: 1; }
.sb-sec-head .chev .wi { transition: transform var(--motion-section-chev-dur) var(--motion-section-open-ease); }
.sb-sec-head[aria-expanded="false"] .chev .wi { transform: rotate(180deg); transition: transform var(--motion-section-close-dur) var(--motion-section-close-ease); }
`;

/**
 * @param {{id: string, label: string, tip?: string, collapsed?: boolean, context?: string}} p
 */
export function render(p) {
  return html`<button class="sb-sec-head" data-c="section-header" data-id="${p.id}" aria-expanded="${String(!p.collapsed)}" aria-controls="sec-${p.id}" title="${p.tip || ''}"${attrs({ 'data-context': p.context, 'data-context-arg': p.context ? p.id : null })}>
    <span>${p.label}</span>
    <span class="chev">${icon('chevron-up-small', 'sm')}</span>
  </button>`;
}
