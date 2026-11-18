/*
 * Sidebar row: icon (page icon tile with fav, or status dot) + name + dim secondary name, selected and hover states, close x on hover for tabs.
 * draggable rows reorder by dragging within the same section (attach): the held row follows the pointer and the rows between move to make room.
 * Right-click is handled by the context-menu component through the data-context value.
 * halves: a split view's two tabs in one row (each half: icon, name, its own close x on hover, click opens that tab), measured on the reference.
 * rename: the name turns into a text box in place (renameBox, also used by the tab group header): it starts with the name selected (empty
 *   when there is none); Return or leaving the box keeps it, Escape cancels. It reports rename.done or rename.cancel { arg, values: { name } }.
 */
import { t } from '../core/i18n.js';
import { html, cx, attrs } from '../core/html.js';
import { icon, favicon } from '../icons/icons.js';
import { dragReorder } from '../core/drag-reorder.js';
import * as statusDot from './status-dot.js';

export const name = 'sidebar-row';

export const css = `
.sb-row { height: var(--row-h); margin: var(--sb-row-gap) var(--sb-row-mx) 0 var(--sb-row-ml); padding: 0 var(--sb-row-px); display: flex; align-items: center; gap: var(--space-2); border-radius: var(--r-row-side); color: var(--n-label); position: relative; width: calc(100% - var(--sb-row-mx) - var(--sb-row-ml)); font-family: var(--font-native); font-size: var(--text-native); line-height: var(--leading-native); }
.sb-row:hover { background: var(--n-hover); }
.sb-row.add + .sb-row { margin-top: var(--sb-after-add-gap); }
.sb-row.sel { background: var(--n-sel); box-shadow: inset 0 0 0 var(--hairline) var(--n-sel-ring), var(--n-sel-shadow); /* the ring sits inside the row: the section that clips its rows never cuts it */ color: var(--n-label-strong); }
.sb-row.add { color: var(--n-secondary); }
.sb-row:not(.add) > .wi, .sb-half > .wi { color: var(--n-icon); }
.sb-row .lbl { flex: 1; }
.sb-row .sb-rename { flex: 0 1 auto; min-width: var(--sb-rename-min-w); max-width: 100%; field-sizing: content; font: inherit; color: var(--n-label-strong); background: none; border: 0; padding: 0; outline: none; }
.sb-row .lbl.fit { flex: 0 1 auto; }
.sb-row .ctx { color: var(--n-tertiary); flex: 1 1 0; min-width: var(--sb-ctx-min); }
.sb-row .lead { width: var(--icon); display: grid; place-items: center; flex-shrink: 0; }
/* every row of the side bar leads with the same mark: a page icon is drawn bare, at the full icon size and in the icon colour, whatever the page (no tile) */
:is(.sb-row, .sb-half) > .fav { width: var(--icon); height: var(--icon); background: transparent; color: var(--n-icon); }
:is(.sb-row, .sb-half) > .fav > .wi { width: 100%; height: 100%; }
.sb-row .x { opacity: 0; position: absolute; right: var(--sb-x-inset); top: var(--sb-x-inset); width: var(--sb-x-size); height: var(--sb-x-size); display: grid; place-items: center; border-radius: var(--r-control-sm); color: var(--n-secondary); }
.sb-row:hover .x, .sb-row:focus-visible .x { opacity: 1; }
.sb-row .x:hover { background: var(--n-hover); }
.sb-row.split { padding: 0; gap: 0; }
.sb-half { flex: 1 1 0; min-width: 0; height: 100%; display: flex; align-items: center; gap: var(--space-2); padding: 0 var(--sb-row-px); position: relative; }
.sb-half .x { opacity: 0; position: absolute; right: var(--sb-x-inset); top: var(--sb-x-inset); width: var(--sb-x-size); height: var(--sb-x-size); display: grid; place-items: center; border-radius: var(--r-control-sm); color: var(--n-secondary); }
.sb-row:hover .sb-half .x { opacity: 1; }
.sb-half .lbl { flex: 1; }
/* drag (measured on the reference): the held row lifts as a selected pill and follows the pointer, the other rows move to open its place */
.sb-row.dragging { z-index: 1; background: var(--n-sel); box-shadow: inset 0 0 0 var(--hairline) var(--n-sel-ring), var(--shadow-lg); color: var(--n-label-strong); }
.sb-row.drag-shift { transition: transform var(--dur-fast) var(--ease-standard); }
.sb-row .spin .wi { animation: spin var(--dur-spin) linear infinite; color: var(--n-secondary); }
@keyframes spin { to { transform: rotate(360deg); } }
`;

/** In-place rename box. @param {{id: string, value?: string, done: string, cancel: string, label: string}} p  done/cancel: the actions it reports */
export const renameBox = p => html`<input class="sb-rename"${attrs({ 'data-rename': p.id, 'data-rename-done': p.done, 'data-rename-cancel': p.cancel, 'aria-label': p.label })} value="${p.value || ''}" spellcheck="false">`;

/* a tab's close button names the tab it closes (a list of tabs has no row of buttons all called "Close tab", B3-13); the tooltip stays short */
const closeName = label => (typeof label === 'string' && label ? `${t('tab.close')}, ${label}` : t('tab.close'));
/**
 * @param {{icon?: string, fav?: boolean, dot?: string, label: string, ctx?: string, selected?: boolean, add?: boolean,
 *   closable?: boolean, loading?: boolean, action?: string, arg?: any, context?: string, contextArg?: any, draggable?: boolean, group?: string, id?: string, preview?: string, halves?: object[], rename?: object}} p  preview: tab id for the tab preview card; rename: renameBox options while editing
 */
export function render(p) {
  if (p.halves) return html`<div class="${cx('sb-row split', p.selected && 'sel')}" data-c="sidebar-row"${attrs({ 'data-context': p.context, 'data-context-arg': p.contextArg, 'aria-current': p.selected ? 'page' : null })}>${p.halves.map(h => html`<div class="sb-half" role="button" tabindex="0"${attrs({ 'data-action': h.action, 'data-arg': h.arg, 'data-preview': h.preview, 'data-context': p.context, 'data-context-arg': h.arg })}>${h.icon ? (h.fav ? favicon(h.icon) : icon(h.icon)) : ''}<span class="lbl fade-trunc">${h.label}</span>${h.closable ? html`<button class="x" data-action="kit.tab.close" ${attrs({ 'data-arg': h.arg })} data-tip="${t('tab.close')}" aria-label="${closeName(h.label)}">${icon('cross-small', 'sm')}</button>` : ''}</div>`)}</div>`;
  const lead = p.loading ? html`<span class="lead spin">${icon('loader')}</span>` : p.dot ? html`<span class="lead">${statusDot.render({ tone: p.dot })}</span>` : p.icon ? (p.fav ? favicon(p.icon) : icon(p.icon)) : '';
  return html`<div class="${cx('sb-row', p.selected && 'sel', p.add && 'add')}" role="button" tabindex="0" data-c="sidebar-row"${attrs({
    'data-action': p.rename ? null : p.action, 'data-arg': p.arg, 'data-context': p.context, 'data-context-arg': p.context ? (p.contextArg ?? p.arg) : null,
    'data-drag-group': p.draggable && !p.rename ? p.group : null, 'data-id': p.id, 'data-preview': p.preview, 'aria-current': p.selected ? 'page' : null,
  })}>
    ${lead}${p.rename ? renameBox(p.rename) : html`<span class="${cx('lbl', p.ctx ? 'trunc fit' : 'fade-trunc')}">${p.label}</span>`}${p.ctx ? html`<span class="ctx trunc">${p.ctx}</span>` : ''}
    ${p.closable ? html`<button class="x" data-action="kit.tab.close" ${attrs({ 'data-arg': p.arg })} data-tip="${t('tab.close')}" aria-label="${closeName(p.label)}">${icon('cross-small', 'sm')}</button>` : ''}
  </div>`;
}

/* Drag to reorder within the same data-drag-group (core/drag-reorder.js); in-place rename: Return or leaving keeps the name, Escape cancels,
   a key that finishes a Hangul syllable does not end it */
export function attach(root, ctx) {
  dragReorder(root, ctx, '.sb-row', { skip: '.x' });
  let done = false;
  const finish = (el, keep) => {
    if (done) return; done = true;
    ctx.emit(keep ? el.dataset.renameDone : el.dataset.renameCancel, { arg: el.dataset.rename, values: { name: el.value } });
  };
  root.addEventListener('focusin', e => { if (e.target.matches?.('[data-rename]')) done = false; });
  root.addEventListener('keydown', e => {
    const el = e.target.closest?.('[data-rename]');
    if (!el || e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); finish(el, true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(el, false); }
  });
  root.addEventListener('focusout', e => { if (e.target.matches?.('[data-rename]')) finish(e.target, true); });
}
