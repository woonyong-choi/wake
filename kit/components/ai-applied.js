/*
 * AI applied: the quiet row above a screen's body that says what the AI changed on it. A label, one removable chip a value the AI set
 * (a secondary small round button with a cross: a press puts that value back as it was before the AI, emitting action with the chip's key),
 * and an optional end at the far side (a link to where the AI work came from). No band and no card face. No chips draws nothing.
 * bootPage's screen declaration keeps the values (ctx.aiApplied(), ctx.resetAi(key), the built-in action 'kit.screen.ai-reset').
 */
import { html } from '../core/html.js';
import * as button from './button.js';

export const name = 'ai-applied';

export const css = `
.aia { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1_5) var(--space-2); min-width: 0; }
.aia-l { margin-inline-end: var(--space-1); font-size: var(--text-xs); color: var(--muted-foreground); }
.aia-end { margin-inline-start: auto; }
`;

/** @param {{label: string, chips: {key: string, label: string}[], end?: any, action: string}} p */
export function render(p) {
  const chips = p.chips || [];
  if (!chips.length) return '';
  return html`<div class="aia" data-c="ai-applied"><span class="aia-l">${p.label}</span>${chips.map(c => button.render({ label: c.label, iconEnd: 'cross-small', variant: 'secondary', size: 'sm', round: true, action: p.action, arg: c.key }))}${p.end ? html`<span class="aia-end">${p.end}</span>` : ''}</div>`;
}
