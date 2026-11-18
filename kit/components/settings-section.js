/* Settings section: title (display 14/550 muted 80%) + description (12/500 muted) + groups. 32 between sections */
import { html } from '../core/html.js';

export const name = 'settings-section';

export const css = `
.ss + .ss { margin-top: var(--pane-section-gap, var(--space-8)); }
.ss-head { margin-bottom: var(--space-2); }
.ss-title { font-family: var(--font-display); font-size: var(--text-section); font-weight: var(--weight-section); line-height: var(--leading-sm); color: var(--muted-foreground-80); display: flex; align-items: center; gap: var(--space-1_5); }
.ss-title .n { font-weight: var(--weight-medium); }
.ss-tools { display: inline-flex; align-items: center; gap: var(--space-2); min-width: 0; margin-inline-start: auto; font-family: var(--font-sans); }
.ss-desc { margin-top: var(--space-1); font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--muted-foreground); }
`;

/** @param {{title?: string, count?: number, badge?: any, mark?: any, tools?: any, description?: string, children}} p  badge is a small badge after the title; mark a status mark before it;
 *  tools sit at the end of the title line (a period switch, a link to the full list) */
export function render(p) {
  return html`<section class="ss" data-c="settings-section">
    ${p.title ? html`<div class="ss-head"><h2 class="ss-title">${p.mark || ''}${p.title}${p.count != null ? html`<span class="n">${p.count}</span>` : ''}${p.badge || ''}${p.tools ? html`<span class="ss-tools">${p.tools}</span>` : ''}</h2>${p.description ? html`<p class="ss-desc">${p.description}</p>` : ''}</div>` : ''}
    ${p.children}
  </section>`;
}
