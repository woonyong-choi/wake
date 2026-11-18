/*
 * Pinned tiles: pinned tabs drawn as a grid of wide icon tiles at the top of the sidebar, above the sections (measured on the reference:
 * pinning a tab takes it out of the tab list and adds a tile). The tiles stay in place while the sections below scroll.
 * Columns: up to `columns` tiles share one row; more tiles wrap into balanced rows (5 tiles: 3 + 2).
 * States: rest (faint fill and ring), hover (stronger fill, no ring), selected (the open tab): the selected fill and its 1px ring take the
 * page's representative color (--tint, set per tile; neutral page icon color without one), measured on the reference in dark and light.
 * Each tile runs its action on click and opens the tab context menu (context kind) on right-click; tiles reorder by dragging (group 'tiles',
 * measured on the reference: the dragged tile follows the pointer and the others slide).
 */
import { html, cx, attrs } from '../core/html.js';
import { favicon, icon } from '../icons/icons.js';
import { dragReorder } from '../core/drag-reorder.js';

export const name = 'pinned-tiles';

export const css = `
.pt-grid { display: grid; grid-template-columns: repeat(var(--pt-cols), minmax(0, 1fr)); gap: var(--pt-gap); margin: var(--pt-before) var(--sb-row-mx) var(--pt-after) var(--sb-row-ml); flex-shrink: 0; }
.pt-tile { height: var(--pt-h); display: grid; place-items: center; border-radius: var(--r-panel); corner-shape: var(--corner-round); background: var(--n-tile); box-shadow: inset 0 0 0 var(--hairline) var(--n-tile-ring); color: var(--n-label); min-width: 0; }
.pt-tile:hover { background: var(--n-tile-hover); box-shadow: none; }
.pt-tile.sel { background: linear-gradient(color-mix(in srgb, var(--tint, var(--tint-neutral)) var(--n-tint-fill), transparent)), var(--n-tile-sel); box-shadow: inset 0 0 0 var(--space-px) color-mix(in srgb, var(--tint, var(--tint-neutral)) var(--n-tint-ring), var(--n-tile-sel-ring)); color: var(--n-label-strong); }
.pt-tile.dragging { z-index: 1; }
.pt-tile.drag-shift { transition: transform var(--dur-fast) var(--ease-standard); }
.pt-tile > .wi { color: var(--n-icon); }
.pt-tile .spin .wi { animation: spin var(--dur-spin) linear infinite; color: var(--n-secondary); }
`;

/* Balanced grid: the fewest rows that keep each row at most `columns` tiles, then the fewest columns that fill those rows */
export const columnsFor = (count, columns) => { const rows = Math.ceil(count / columns); return Math.ceil(count / rows); };

/**
 * @param {{tiles: {id: string, icon?: string, fav?: boolean, tint?: string, label: string, selected?: boolean, loading?: boolean, action?: string, arg?: any, context?: string}[], columns?: number}} p
 */
export function render(p) {
  if (!p.tiles.length) return '';
  const cols = columnsFor(p.tiles.length, p.columns || 4);
  return html`<div class="pt-grid" data-c="pinned-tiles" style="--pt-cols: ${cols}">${p.tiles.map(x => html`<div class="${cx('pt-tile', x.selected && 'sel')}" role="button" tabindex="0" aria-label="${x.label}"${attrs({
    'data-action': x.action, 'data-arg': x.arg, 'data-context': x.context, 'data-context-arg': x.context ? x.arg : null, 'data-id': x.id, 'data-drag-group': 'tiles', 'data-preview': x.id, 'aria-current': x.selected ? 'page' : null, style: x.tint ? `--tint:${x.tint}` : null,
  })}>${x.loading ? html`<span class="spin">${icon('loader')}</span>` : x.fav ? favicon(x.icon || 'globe') : icon(x.icon || 'globe')}</div>`)}</div>`;
}

export function attach(root, ctx) { dragReorder(root, ctx, '.pt-tile'); }
