/* Action row under an answer: copy (the answer's text, the code block's copy button) and time (13 muted) */
import { html } from '../core/html.js';
import { copyButton } from './code-block.js';

export const name = 'action-row';

export const css = `
.ar { display: flex; align-items: center; color: var(--muted-foreground); font-size: var(--text-native-sm); margin-top: var(--ar-mt); }
.ar .time { margin-left: var(--space-1); }
`;

/** @param {{time?: string, id?: string}} p */
export function render(p) {
  return html`<div class="ar" data-c="action-row">${copyButton()}${p.time ? html`<span class="time">${p.time}</span>` : ''}</div>`;
}
