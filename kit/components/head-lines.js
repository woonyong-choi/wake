/*
 * Head lines: the lines under a detail's head that appear only when their condition holds (why it is in trouble, who manages it, what it is
 * linked to, what cannot be read or changed). At most three, as flat settings rows in one round group (one card, its rows divided by hairlines,
 * never a card in a card). Each row leads with a status mark (tone: a status-icon kind, default idle; attention: the soft ring of a state waiting for
 * the person, for the line that says why), its words, and an optional end (a link button). No rows draws nothing.
 */
import { html } from '../core/html.js';
import * as settingsGroup from './settings-group.js';
import * as settingsRow from './settings-row.js';
import * as statusIcon from './status-icon.js';

export const name = 'head-lines';

export const css = `
.hdl { min-width: 0; }
`;

export const MAX = 3;

/** @param {{rows: {id: string, icon?: string, tone?: 'ok'|'warn'|'fix'|'error'|'perm'|'unknown'|'idle'|'busy', text: string, end?: any, attention?: boolean}[]}} p */
export function render(p) {
  const rows = (p.rows || []).filter(r => r && r.text).slice(0, MAX);
  if (!rows.length) return '';
  return html`<div class="hdl" data-c="head-lines">${settingsGroup.render({ round: true, children: rows.map(r => settingsRow.render({ lead: statusIcon.render({ kind: r.tone || 'idle', icon: r.icon, attention: !!r.attention }), title: html`<span>${r.text}</span>`, control: r.end || '' })) })}</div>`;
}
