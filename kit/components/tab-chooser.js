/*
 * Tab chooser (measured on the reference): fills the empty pane of a new split view with a centered card listing the other tabs, most
 * recently used first (56 page icon tile, title, secondary line), between plain bands above and below the scrolling list; choosing one puts
 * that tab in the pane. The close button at the pane's top right gives up the split.
 */
import { html, attrs } from '../core/html.js';
import { icon, favicon } from '../icons/icons.js';
import { t } from '../core/i18n.js';

export const name = 'tab-chooser';

export const css = `
.tch { position: absolute; inset: 0; display: grid; place-items: center; background: var(--tch-pane); border-radius: inherit; }
.tch-card { width: var(--tch-w); max-height: var(--tch-max-h); display: flex; flex-direction: column; padding: var(--tch-band) 0; border-radius: var(--r-dialog); corner-shape: var(--corner); background: var(--tch-card); overflow: hidden; }
.tch-list { flex: 1; min-height: 0; overflow-y: auto; background: var(--tch-list); }
.tch-row { width: 100%; height: var(--tch-row-h); display: flex; align-items: center; gap: var(--tch-gap); padding: 0 var(--tch-row-px); text-align: left; font-family: var(--font-native); color: var(--n-label-strong); }
.tch-row:hover { background: var(--tch-hover); }
.tch-tile { width: var(--tch-tile); height: var(--tch-tile); flex-shrink: 0; display: grid; place-items: center; border-radius: var(--r-control); corner-shape: var(--corner); background: var(--tch-tile-bg); }
.tch-row b { display: block; font-size: var(--text-native-sm); font-weight: var(--weight-regular); line-height: var(--leading-xs); }
.tch-row small { display: block; font-size: var(--text-xs); color: var(--n-secondary); line-height: var(--leading-xs); }
.tch-x { position: absolute; top: var(--space-3); right: var(--space-3); }
`;

/** @param {{rows: {id: string, icon: string, fav?: boolean, title: string, sub?: string}[], action: string, close: string}} p */
export function render(p) {
  return html`<div class="tch" data-c="tab-chooser">
    <button class="ib sm tch-x" data-action="${p.close}" aria-label="${t('dialog.close')}">${icon('cross-medium')}</button>
    <div class="tch-card"><div class="tch-list" data-scroll="chooser">${p.rows.map(r => html`<button class="tch-row"${attrs({ 'data-action': p.action, 'data-arg': r.id, title: r.title })}><span class="tch-tile">${r.fav ? favicon(r.icon) : icon(r.icon)}</span><span class="trunc"><b class="trunc">${r.title}</b>${r.sub ? html`<small class="trunc">${r.sub}</small>` : ''}</span></button>`)}</div></div>
  </div>`;
}
