/*
 * Context chip: 32 icon tile (radius md) on the left (a page icon tile inside with fav) + title (12/500) / secondary line (12 muted). Height 44 plus a hairline edge outside, radius xl.
 * On the window material the chip and its tile are opaque (tokens --chip-*); the tile takes the page tint (--tint) when the tab has one.
 * removable shows a remove mark inside the chip at its top right on hover (no fill of its own, measured).
 */
import { t } from '../core/i18n.js';
import { html, cx, attrs } from '../core/html.js';
import { icon, favicon } from '../icons/icons.js';

export const name = 'context-chip';

export const css = `
.chip { display: flex; align-items: center; gap: var(--space-2); height: var(--chip-h); padding: 0 var(--space-3) 0 var(--space-1_5); border-radius: var(--r-panel); corner-shape: var(--corner); background: var(--chip-bg); box-shadow: 0 0 0 var(--hairline) var(--chip-ring); max-width: var(--chip-max-w); min-width: 0; position: relative; user-select: none; }
.chip.raised { background: var(--chip-raised); }
.chip-tile { width: var(--chip-tile); height: var(--chip-tile); border-radius: var(--r-control-sm); corner-shape: var(--corner); display: grid; place-items: center; flex-shrink: 0; background: color-mix(in srgb, var(--tint, var(--tint-neutral)) var(--chip-tint), var(--chip-tile-base)); color: var(--foreground); }
.chip-tile > .wi { width: var(--icon-lg); height: var(--icon-lg); }
.chip-text { min-width: 0; }
.chip-text b { display: block; font-size: var(--text-xs); font-weight: var(--weight-medium); line-height: var(--leading-xs); }
.chip-text small { display: block; font-size: var(--text-xs); color: var(--muted-foreground); line-height: var(--leading-xs); }
.chip .chip-x { position: absolute; top: var(--space-1); right: var(--space-1_5); width: var(--sb-x-size); height: var(--sb-x-size); display: grid; place-items: center; color: var(--muted-foreground); opacity: 0; transition: opacity var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard); }
.chip .chip-x:hover { color: var(--foreground); }
.chip:hover .chip-x, .chip .chip-x:focus-visible { opacity: 1; }
`;

/** @param {{icon: string, fav?: boolean, title: string, sub?: string, tile?: string, tint?: string, removable?: boolean, raised?: boolean}} p  tile: tile background token name, tint: page tint color */
export function render(p) {
  return html`<div class="${cx('chip', p.raised && 'raised')}" data-c="context-chip"${attrs({ style: p.tint ? `--tint:${p.tint}` : null })}>
    <span class="chip-tile"${attrs({ style: p.tile ? `background:var(${p.tile})` : null })}>${p.fav ? favicon(p.icon, 'xl') : icon(p.icon)}</span>
    <span class="chip-text"><b class="trunc">${p.title}</b>${p.sub ? html`<small class="trunc">${p.sub}</small>` : ''}</span>
    ${p.removable ? html`<button class="chip-x" data-action="kit.composer.remove-context" aria-label="${t('composer.removeContext')}" data-tip="${t('composer.removeContext')}">${icon('cross-small', 'xs')}</button>` : ''}
  </div>`;
}
