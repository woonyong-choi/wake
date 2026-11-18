/*
 * Record list (history, usage, audit): one card (surface fill, radius xl, widened 14 outward, clear border in dark) of rows
 * 52 high with 12 x 8 inside and 16 between parts, separated by a rule (background colored in dark).
 * Row: optional lead, title (14/500, one line) over a muted 12 meta line (parts 6 apart), and an end value (14/500 tabular, right aligned).
 * The end never colors its words: tone ok draws only the success status icon (the words are its name for assistive tech), busy a spinning
 * ring with the words in muted 12, warn and danger a badge of that tone (10% fill). loading draws skeleton rows of the same shape;
 * an empty list shows one muted line, 192 high.
 */
import { html } from '../core/html.js';
import * as skeleton from './skeleton.js';
import * as badge from './badge.js';
import * as statusIcon from './status-icon.js';

export const name = 'record-list';

export const css = `
.rl { margin: 0 calc(-1 * var(--space-3_5)); background: var(--surface-secondary); border: var(--line) solid var(--border); border-radius: var(--r-panel); corner-shape: var(--corner); overflow: hidden; }
:root:not([data-theme="light"]) .rl { border-color: transparent; }
.rl-row { display: flex; align-items: center; gap: var(--space-4); min-height: var(--srow-min-h); padding: var(--space-2) var(--space-3); border-bottom: var(--line) solid var(--border); }
:root:not([data-theme="light"]) .rl-row { border-bottom-color: var(--background); }
.rl-row:last-child { border-bottom: 0; }
.rl-lead { display: grid; place-items: center; color: var(--muted-foreground); flex-shrink: 0; }
.rl-txt { flex: 1; min-width: 0; }
.rl-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--primary); }
.rl-meta { margin-top: var(--space-0_5); display: flex; align-items: center; gap: var(--space-1_5); min-width: 0; font-size: var(--text-xs); color: var(--muted-foreground); white-space: nowrap; }
.rl-meta > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.rl-meta > :not(:last-child) { flex-shrink: 0; }
.rl-end { flex-shrink: 0; text-align: right; font-size: var(--text-sm); font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; color: var(--primary); display: flex; align-items: center; gap: var(--space-2); }
.rl-skel { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-1_5); }
.rl-empty { height: var(--rl-empty-h); display: flex; align-items: center; justify-content: center; font-size: var(--text-sm); color: var(--muted-foreground); }
`;

/* end value by tone: success icon only, running ring + muted words, waiting / failed badge, otherwise the plain value */
const end = r => r.tone === 'ok' ? statusIcon.render({ kind: 'ok', label: r.end }) : r.tone === 'busy' ? statusIcon.render({ kind: 'busy', text: r.end })
  : r.tone === 'warn' || r.tone === 'danger' ? badge.render({ tone: r.tone, label: r.end }) : r.end;

/**
 * @param {{rows?: {lead?: any, title: string, meta?: any[], end?: any, tone?: string}[], loading?: number, empty?: string}} p
 */
export function render(p) {
  if (p.loading) return html`<div class="rl" data-c="record-list" aria-busy="true">${Array.from({ length: p.loading }, () => html`<div class="rl-row"><div class="rl-skel">${skeleton.render({ width: '45%', height: 'var(--skel-line)' })}${skeleton.render({ width: '30%', height: 'var(--skel-line-sm)' })}</div>${skeleton.render({ width: 'var(--skel-end-w)', height: 'var(--skel-line)' })}</div>`)}</div>`;
  if (!p.rows?.length) return html`<div class="rl" data-c="record-list"><div class="rl-empty">${p.empty || ''}</div></div>`;
  return html`<div class="rl" data-c="record-list">${p.rows.map(r => html`<div class="rl-row">${r.lead ? html`<span class="rl-lead">${r.lead}</span>` : ''}<div class="rl-txt"><div class="rl-title trunc">${r.title}</div>${r.meta?.length ? html`<div class="rl-meta">${r.meta.map(m => html`<span>${m}</span>`)}</div>` : ''}</div>${r.end != null ? html`<div class="rl-end">${end(r)}</div>` : ''}</div>`)}</div>`;
}
