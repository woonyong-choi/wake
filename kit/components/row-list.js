/*
 * Row list: a few one-line rows inside a parent face (a summary bar's body, a stage), divided by hairlines; it draws no face of its own
 * (never a card in a card). Each row is a button the height of a table row: a lead (a status mark or an icon), the title (medium, cut with an
 * ellipsis) with an optional muted sub line under it, a muted meta at the end (tabular figures), an optional end and the chevron that says
 * the row opens something. The first row starts as a table's first row does under a bar's rule. A row emits action with arg (or its id).
 */
import { html, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'row-list';

export const css = `
.rwl { display: grid; min-width: 0; }
.rwl-row { all: unset; box-sizing: border-box; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 0 var(--space-3); min-height: var(--dt-row-h); padding-block: var(--space-1); border-block-start: var(--line) solid var(--border-surface); cursor: pointer; font-size: var(--text-sm); line-height: var(--leading-sm); }
.rwl > :first-child { border-block-start: 0; }
.sbar-body > .rwl:first-child > .rwl-row:first-child { margin-block-start: calc(-1 * var(--space-1_5)); } /* under a bar's rule the first row starts as a table's first row does, not a row lower */
.rwl-row:hover .rwl-t b { text-decoration: underline; text-underline-offset: var(--space-0_5); }
.rwl-row:focus-visible { box-shadow: 0 0 0 var(--focus-w) var(--focus); border-radius: var(--r-row); }
.rwl-lead { display: inline-grid; place-items: center; color: var(--muted-foreground); }
.rwl-t { display: grid; min-width: 0; } .rwl-t b { font-weight: var(--weight-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .rwl-t span { font-size: var(--text-xs); color: var(--muted-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rwl-m { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); color: var(--muted-foreground); white-space: nowrap; font-variant-numeric: tabular-nums; }
.rwl-row > .wi { color: var(--muted-foreground); }
`;

/** @param {{rows: {id: string, icon?: string, lead?: any, title: string, sub?: string, meta?: any, end?: any, action: string, arg?: any}[]}} p */
export function render(p) {
  return html`<div class="rwl" data-c="row-list">${(p.rows || []).map(r => html`<button type="button" class="rwl-row"${attrs({ 'data-key': JSON.stringify(['row-list', r.id]), 'data-action': r.action || null, 'data-arg': r.action ? r.arg ?? r.id : null })}><span class="rwl-lead">${r.lead || (r.icon ? icon(r.icon) : '')}</span><span class="rwl-t"><b>${r.title}</b>${r.sub ? html`<span>${r.sub}</span>` : ''}</span><span class="rwl-m">${r.meta ?? ''}${r.end || ''}</span>${icon('chevron-right-small', 'sm')}</button>`)}</div>`;
}
