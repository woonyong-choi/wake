/*
 * Table inside an answer: muted 400 header (12), inline code without background, rules between rows (border under the header, border 50% between rows), expand button at the top right.
 * Cell values are short text (one line). Column widths via widths (px or %).
 * expand (an action) draws the expand button, shown while the table is pointed at or holds focus (it would cover the last header in a narrow
 * panel); the AI panel opens the conversation as a tab with it, where the table has the conversation width.
 */
import { html } from '../core/html.js';
import { t } from '../core/i18n.js';
import { inline } from './answer-text.js';
import * as iconButton from './icon-button.js';

export const name = 'message-table';

export const css = `
.mt { position: relative; margin: var(--space-3) 0; }
.mt table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.mt th { text-align: left; overflow-wrap: anywhere; font-size: var(--text-xs); font-weight: var(--weight-regular); color: var(--muted-foreground); padding: var(--mt-head-pb) var(--space-4) var(--mt-head-pb) 0; border-bottom: var(--line) solid var(--border); }
.mt td { padding: var(--mt-cell-py) var(--space-4) var(--mt-cell-py) 0; overflow-wrap: anywhere; vertical-align: top; line-height: var(--mt-leading); border-bottom: var(--line) solid var(--border-half); color: var(--primary); }
.mt code { font-family: inherit; font-size: var(--mt-code); }
.mt tbody tr:last-child td { border-bottom-color: var(--border); }
.mt .ib { position: absolute; right: var(--mt-ib-inset); top: var(--mt-ib-top); width: var(--mt-ib); height: var(--mt-ib); box-shadow: 0 0 0 var(--line) var(--border); background: var(--background); }
`;

/** @param {{head: string[], rows: any[][], widths?: string[], expand?: string}} p */
export function render(p) {
  return html`<div class="mt reveal-host" data-c="message-table">
    <table><thead><tr>${p.head.map((h, i) => html`<th style="${p.widths?.[i] ? `width:${p.widths[i]}` : ''}">${h}</th>`)}</tr></thead>
    <tbody>${p.rows.map(r => html`<tr>${r.map(c => html`<td>${inline(c)}</td>`)}</tr>`)}</tbody></table>
    ${p.expand ? html`<span class="reveal">${iconButton.render({ icon: 'arrows-expand', tip: t('table.expand'), size: 'xs', iconSize: 'sm', action: p.expand })}</span>` : ''}
  </div>`;
}
