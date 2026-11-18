/*
 * Zoom indicator (measured on the reference): changing a page's zoom shows, for 1.5 s, a bubble hanging from the zoom button of the
 * top bar (level, zoom out, zoom in, reset), and for 3 s a level pill near the page's top right. Both hide on their own.
 * It is drawn in the page document (a desktop tab view covers the shell there); the layer undoes the page zoom so it keeps its size,
 * and the shell gives the bubble's distance from the page's right edge (right).
 */
import { html, attrs } from '../core/html.js';
import { t } from '../core/i18n.js';
import * as iconButton from './icon-button.js';
import * as button from './button.js';

export const name = 'zoom-indicator';

export const css = `
.zi-layer { position: fixed; inset: 0; pointer-events: none; z-index: var(--z-toast); font-family: var(--font-sans); }
.zi-bubble { position: absolute; top: 0; right: var(--zi-right); width: var(--zi-w); height: var(--zi-h); display: flex; align-items: center; gap: var(--space-1); padding: 0 var(--space-4) 0 var(--zi-pad-start); border-radius: var(--r-control); corner-shape: var(--corner); background: var(--zi-bg); color: var(--foreground); font-size: var(--text-sm); box-shadow: var(--shadow-lg); pointer-events: auto; }
.zi-bubble .zi-val { flex: 1; }
.zi-bubble .btn { margin-left: var(--space-2); }
.zi-hud { position: absolute; top: var(--zi-hud-top); right: var(--zi-hud-right); height: var(--zi-hud-h); padding: 0 var(--space-3); display: grid; place-items: center; border-radius: var(--r-control); corner-shape: var(--corner); background: var(--zi-hud-bg); box-shadow: inset 0 0 0 var(--space-px) var(--zi-hud-ring); color: var(--foreground); font-size: var(--text-sm); font-weight: var(--weight-semibold); }
`;

export const percent = f => `${Math.round(f * 100)}%`;

/** @param {{zoom: number, bubble?: {right: number} | null, hud?: boolean}} p */
export function render(p) {
  return html`<div class="zi-layer" data-c="zoom-indicator"${attrs({ style: `zoom:${1 / p.zoom}` })}>
    ${p.bubble ? html`<div class="zi-bubble"${attrs({ style: `--zi-right:${p.bubble.right}px` })}><span class="zi-val">${percent(p.zoom)}</span>${iconButton.render({ icon: 'minus-small', tip: t('zoom.out'), size: 'xs', action: 'kit.zoom.out' })}${iconButton.render({ icon: 'plus-small', tip: t('zoom.in'), size: 'xs', action: 'kit.zoom.in' })}${button.render({ label: t('zoom.reset'), variant: 'outline', size: 'sm', action: 'kit.zoom.reset' })}</div>` : ''}
    ${p.hud ? html`<div class="zi-hud">${percent(p.zoom)}</div>` : ''}
  </div>`;
}
