/*
 * Icon stack: a row of round marks (a provider's icon, an image or an initial), as the stacked people of a shared document. With room the marks
 * stand a little apart; short of room they slide over one another (each gives way down to --ist-overlap of its size) and the row never wraps.
 * Brand marks stand bare, as in a list row (no ring, no ground behind them); they only slide over one another when the row is short of room.
 * Marks beyond max fold into a "+N" mark at the end, whose tooltip names them. Each mark has a ring of the ground under it so overlapping marks
 * stay apart (the fill is opaque over the ground), and it may carry a status dot at its lower end corner (ok, warn, error, idle: the state colours).
 *   items: { id, name, icon?: IconSlot, brand?: IconSlot, src?: string, status?: 'ok'|'warn'|'error'|'idle' }[]  (name is the mark's title and its label)
 *   brand: a product's own mark in its own colours, bare and at the full size of the slot (no disc, no edge), so it reads as large as the
 *     slot allows; marks whose inner shapes are holes come filled from the app's glyphs. disc(slot, size?) draws the same bare mark alone (a connection row's lead).
 * The ring round each mark is the ground under the row (--ist-ground, default the page background): a row on another face sets it to that face.
 *   max: how many marks are shown before "+N" (default 4); size: 'sm' (20) | 'md' (24, default); label: the group's name for assistive tech
 */
import { html, attrs, cx } from '../core/html.js';
import { icon } from '../icons/icons.js';
import { t } from '../core/i18n.js';

export const name = 'icon-stack';

export const css = `
.ist { --ist-size: var(--control-h-xs); display: inline-flex; align-items: center; gap: var(--space-2); min-width: 0; max-width: 100%; }
.ist.sm { --ist-size: var(--avatar); }
.ist-i { position: relative; flex: 0 1 var(--ist-size); min-width: calc(var(--ist-size) * var(--ist-overlap)); height: var(--ist-size); }
.ist-c { width: var(--ist-size); height: var(--ist-size); display: grid; place-items: center; border-radius: var(--r-round); background: linear-gradient(var(--secondary), var(--secondary)), var(--background); color: var(--foreground); box-shadow: 0 0 0 var(--ist-ring) var(--ist-ground, var(--background)); font-size: var(--text-2xs); font-weight: var(--weight-medium); line-height: 1; text-transform: uppercase; overflow: hidden; }
.ist-c img { width: 100%; height: 100%; object-fit: cover; }
.ist-c .wi { width: calc(var(--ist-size) * var(--ist-mark)); height: calc(var(--ist-size) * var(--ist-mark)); }
.ist-c.disc { background: none; box-shadow: none; overflow: visible; } .ist-c.disc .wi { width: var(--ist-size); height: var(--ist-size); } /* a bare mark, as in a list row */
.ist-disc { --ist-size: var(--icon-xl); width: var(--ist-size); height: var(--ist-size); display: inline-grid; place-items: center; flex-shrink: 0; }
span.ist-disc > .wi { width: var(--ist-size); height: var(--ist-size); }
.ist-s { position: absolute; inset-block-end: calc(-1 * var(--ist-ring)); inset-inline-start: calc(var(--ist-size) - var(--dot) + var(--ist-ring)); z-index: 1; width: var(--dot); height: var(--dot); border-radius: var(--r-round); box-shadow: 0 0 0 var(--ist-ring) var(--ist-ground, var(--background)); }
.ist-s.ok { background: var(--success); } .ist-s.warn { background: var(--warning); } .ist-s.error { background: var(--destructive); } .ist-s.idle { background: var(--n-tertiary); }
.ist-more { position: relative; z-index: 2; flex: none; display: inline-grid; place-items: center; min-width: var(--ist-size); height: var(--ist-size); padding-inline: var(--space-1); border-radius: var(--r-round); background: linear-gradient(var(--secondary), var(--secondary)), var(--background); box-shadow: 0 0 0 var(--ist-ring) var(--ist-ground, var(--background)); color: var(--muted-foreground); font-size: var(--text-2xs); font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; }
`;

const STATUS = ['ok', 'warn', 'error', 'idle'];

/** A product's mark alone, bare at the slot's size (a row's lead). size: 'md' (20, default) | 'row' (24, a connection row's lead) | 'lg' (the tile, 36) */
const DISC_SIZE = { lg: '--ist-size:var(--tile)', row: '--ist-size:var(--control-h-xs)' };
export const disc = (slot, size = 'md') => html`<span class="ist-disc"${attrs({ style: DISC_SIZE[size] ?? null })} aria-hidden="true">${icon(slot)}</span>`;

/** @param {{items: {id: string, name: string, icon?: string, brand?: string, src?: string, status?: 'ok'|'warn'|'error'|'idle'}[], max?: number, size?: 'sm'|'md', label?: string}} p */
export function render(p) {
  const max = Math.max(1, p.max ?? 4), all = p.items || [];
  const shown = all.slice(0, max), rest = all.slice(max);
  const mark = it => html`<span class="ist-i" role="img"${attrs({ 'aria-label': STATUS.includes(it.status) ? `${it.name} · ${t('iconStack.' + it.status)}` : it.name, title: it.name, 'data-key': JSON.stringify(['ist', it.id]) })}><span class="${cx('ist-c', it.brand && 'disc')}">${it.brand ? icon(it.brand) : it.src ? html`<img src="${it.src}" alt="">` : it.icon ? icon(it.icon) : [...(it.name || '?')][0]}</span>${STATUS.includes(it.status) ? html`<i class="${cx('ist-s', it.status)}" aria-hidden="true"></i>` : ''}</span>`;
  return html`<span class="${cx('ist', p.size === 'sm' && 'sm')}" data-c="icon-stack" role="group"${attrs({ 'aria-label': p.label })}>${shown.map(mark)}${rest.length ? html`<span class="ist-more"${attrs({ 'data-tip': rest.map(r => r.name).join(', '), 'aria-label': rest.map(r => r.name).join(', ') })}>+${rest.length}</span>` : ''}</span>`;
}
