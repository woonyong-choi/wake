/*
 * Query line: the query a piece of evidence was read with, as one quiet line: a status mark for whether it could be read (ok: read,
 * perm: no permission, idle: not read), the source's name and the query in mono, wrapped anywhere (never cut).
 */
import { html } from '../core/html.js';
import * as statusIcon from './status-icon.js';

export const name = 'query-line';

export const css = `
.qln { display: flex; align-items: flex-start; gap: var(--space-2); min-width: 0; font-size: var(--text-xs); color: var(--muted-foreground); }
.qln-s { flex: none; white-space: nowrap; }
.qln code { min-width: 0; font-family: var(--font-mono); overflow-wrap: anywhere; }
`;

/** @param {{source?: string, query: string, state?: 'ok'|'perm'|'idle'|'error'}} p */
export function render(p) {
  return html`<div class="qln" data-c="query-line">${statusIcon.render({ kind: p.state || 'ok' })}${p.source ? html`<span class="qln-s">${p.source}</span>` : ''}<code>${p.query}</code></div>`;
}
