/*
 * Sub header at the top of a page document (44 high, 14 | 16 side padding, sticky): leading controls, icon + title (13/500, one line),
 * trailing parts after the title (state badge, more), and tabs on the right. Used by the resource detail and the full-tab conversation.
 */
import { html } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'sub-header';

export const css = `
.subh { height: var(--chat-sub-h); display: flex; align-items: center; gap: var(--space-1_5); padding: 0 var(--space-4) 0 var(--space-3_5); flex-shrink: 0; min-width: 0; }
.subh.sticky { position: sticky; top: 0; z-index: var(--z-sticky); }
.subh-t { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-native-sm); font-weight: var(--weight-medium); min-width: 0; }
.subh-t > .wi { color: var(--muted-foreground); flex-shrink: 0; }
.subh-end { margin-left: auto; display: flex; align-items: center; min-width: 0; }
`;

/** @param {{icon?: string, title: string, lead?: any, after?: any, end?: any, sticky?: boolean}} p */
export function render(p) {
  return html`<div class="${p.sticky ? 'subh sticky' : 'subh'}" data-c="sub-header">${p.lead || ''}<div class="subh-t">${p.icon ? icon(p.icon) : ''}<span class="trunc">${p.title}</span></div>${p.after || ''}${p.end ? html`<div class="subh-end">${p.end}</div>` : ''}</div>`;
}
