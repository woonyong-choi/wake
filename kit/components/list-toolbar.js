/*
 * List toolbar above a list: start controls (selects, search) and end controls (icon buttons), 12 apart,
 * widened 4 outward and 8 above the list.
 * List page toolbar (slots): every list page has the same row by construction. render({ scope, search, filters, time, view }):
 *   left, in this order: scope (a select of where the list looks, or the object picker of a log) → search (the search field, --ltb-search-w wide) →
 *   filters (status pill tabs with their counts); right, right-aligned: time (time-range) → view (a view toggle).
 *   An absent slot is left out; a present one never moves to another slot. The row stands --ltb-top under the page header on every page.
 *   When the room is short the right group goes to a line of its own, still right-aligned; the two groups never mix; shorter still, each
 *   group wraps its own items in order (time over view), and a time range folds its pills (time-range.js). Nothing runs past the row.
 * The older form render({ start, end, fill }) draws the same two groups from whatever it is given.
 * In a toolbar the select and the search field are pills of the pill tabs' height (one row, one control shape).
 */
import { html, attrs } from '../core/html.js';

export const name = 'list-toolbar';

export const css = `
.ltb { display: flex; flex-wrap: var(--page-toolbar-wrap, nowrap); align-items: center; justify-content: space-between; gap: var(--space-3); margin: 0 var(--page-toolbar-inset, calc(-1 * var(--space-1))) var(--space-2); min-width: 0; }
.ltb-s, .ltb-e { display: flex; align-items: center; gap: var(--space-1_5); min-width: 0; }
.ltb-e { flex-shrink: 0; }
.ltb.fill > .ltb-s { flex: 1; }
.ltb :is(.slt, .si) { height: var(--control-h); border-radius: var(--r-pill); corner-shape: var(--corner-round); } /* one toolbar, one control shape: the select and the search field are pills of the pill tabs' height */
.ltb .slt { padding-inline: var(--space-3) var(--space-2_5); } .ltb .si { padding-inline-start: var(--space-3); }
.ltb.slots { flex-wrap: wrap; row-gap: var(--space-2); margin-block-start: var(--ltb-top); }
.ltb.slots > .ltb-s { flex-wrap: wrap; row-gap: var(--space-2); }
.ltb.slots > .ltb-e { margin-inline-start: auto; justify-content: flex-end; flex-wrap: wrap; row-gap: var(--space-2); flex-shrink: 1; max-width: 100%; } /* on a line of its own the right group still ends at the right, and short of room its own items wrap (time, then view) */
.ltb-slot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-1_5); min-width: 0; max-width: 100%; } /* a slot with several controls (a select and pill tabs) keeps the toolbar's one gap between them, and wraps the same way */
.ltb.slots > .ltb-s { max-width: 100%; }
.ltb-slot[data-slot="search"] > .si:not([style*="width"]) { width: var(--ltb-search-w); }
`;

export const SLOTS = { start: ['scope', 'search', 'filters'], end: ['time', 'view'] };

/** @param {{start?: any, end?: any, fill?: boolean, scope?: any, search?: any, filters?: any, time?: any, view?: any}} p  slots (scope, search, filters, time, view) or the older start/end */
export function render(p) {
  const slotted = [...SLOTS.start, ...SLOTS.end].some(k => p[k] != null && p[k] !== '');
  if (!slotted) return html`<div class="${p.fill ? 'ltb fill' : 'ltb'}" data-c="list-toolbar"><div class="ltb-s">${p.start || ''}</div><div class="ltb-e">${p.end || ''}</div></div>`;
  const slot = k => (p[k] != null && p[k] !== '' ? html`<div class="ltb-slot"${attrs({ 'data-slot': k })}>${p[k]}</div>` : '');
  const end = SLOTS.end.map(slot);
  return html`<div class="ltb slots" data-c="list-toolbar"><div class="ltb-s">${SLOTS.start.map(slot)}</div>${end.some(Boolean) ? html`<div class="ltb-e">${end}</div>` : ''}</div>`;
}
