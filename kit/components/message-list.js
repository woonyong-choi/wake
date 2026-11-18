/*
 * Conversation list: stacks message parts in order. Date line at the top (centered 12/500 muted).
 * variant 'panel' (narrow panel) or 'full' (full tab, centered 820 column). New messages rise slightly from below as they appear.
 */
import { html, cx } from '../core/html.js';

export const name = 'message-list';

export const css = `
.msgs { --surface-radius: var(--r-panel); --surface-corner: var(--corner); padding: var(--msgs-pad-top) var(--msgs-pad-x) var(--space-4); font-size: var(--text-sm); line-height: var(--leading-sm); }
.msgs.full { max-width: calc(var(--chat-col-w) + 2 * var(--space-4)); margin: 0 auto; padding: var(--msgs-full-pad-top) var(--space-4) var(--space-16); line-height: var(--leading-chat); }
.msg-date { text-align: center; font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--muted-foreground); line-height: var(--leading-xs); margin: 0 0 var(--msg-date-gap); }
.msgs.full .msg-date { margin-bottom: var(--msg-date-gap-full); }
/* a proposal in an answer: target line, change code block, result line */
.msgs .ans + .cb, .msgs .cb + .ans { margin-top: var(--space-2); } /* words and a code view next to each other in an answer keep the proposal's own distance */
.msgs [data-proposal] { display: flex; flex-direction: column; gap: var(--space-2); margin: .5em 0; }
.msgs [data-proposal] [data-c="step-row"] { padding-bottom: 0; }
`;

/** @param {{date?: string, items: any[], variant?: 'panel'|'full'}} p */
export function render(p) {
  return html`<div class="${cx('msgs', p.variant === 'full' && 'full')}" data-c="message-list" role="log">
    ${p.date ? html`<div class="msg-date">${p.date}</div>` : ''}${p.items}
  </div>`;
}
