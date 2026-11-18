/*
 * Tab group in the tab list (measured on the reference): a header row (folder icon, name, chevron up when open and down when closed,
 * close x on hover, a tooltip naming its tabs) and its tab rows indented below. Clicking the header folds the group; right-click opens the
 * group menu. Hovering the header lights the whole box of a group without a color. A colored group draws a tinted rounded box around the header and its rows and
 * colors the header (--grp); icon replaces the folder icon (group menu icon grid).
 * editing: the name turns into the sidebar row's in-place rename box (measured): an unnamed group starts empty, a named one starts with its
 *   name selected; it reports kit.group.renamed { arg, values: { name } } (empty goes back to unnamed) or kit.rename.cancel.
 * folder: a bookmark folder in a collection section (measured): filled folder icon, chevron at the row end, no close x, the head lights
 *   like a row, and its bookmark rows indented below. toggle: the action that folds it; context: its right-click menu kind.
 */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';
import { t } from '../core/i18n.js';
import { renameBox } from './sidebar-row.js';

export const name = 'tab-group';

export const css = `
.sb-group { margin: var(--sb-row-gap) var(--sb-row-mx) 0 var(--sb-row-ml); border-radius: var(--r-row); corner-shape: var(--corner-round); }
.sb-group { transition: background var(--dur-fast) var(--ease-standard); }
.sb-group:not([data-colored]):has(> .sb-group-head:hover) { background: var(--n-hover); }
.sb-group[data-colored] { background: color-mix(in srgb, var(--grp) var(--grp-fill), var(--grp-wash)); }
.sb-group > .sb-group-head:hover { background: none; }
.sb-group > .sb-row { margin-left: 0; margin-right: 0; width: 100%; }
.sb-group > .sb-row:first-child { margin-top: 0; }
.sb-group-head { color: var(--n-secondary); }
.sb-group[data-colored] .sb-group-head, .sb-group[data-colored] .sb-group-head .x { color: color-mix(in srgb, var(--grp) var(--grp-ink), var(--grp-ink-base)); }
.sb-group-head .chev { width: var(--icon-chev); height: var(--icon-chev); flex-shrink: 0; }
.sb-group-head .lbl { flex: 0 1 auto; }
.sb-group-body > .sb-row { margin-left: 0; margin-right: 0; width: 100%; padding-left: calc(var(--sb-row-px) + var(--sb-group-indent)); }
.sb-group.folder:has(> .sb-group-head:hover) { background: none; }
.sb-group.folder > .sb-group-head { color: var(--n-label); }
.sb-group.folder > .sb-group-head:hover { background: var(--n-hover); }
.sb-group.folder .sb-group-head .chev { margin-left: auto; color: var(--n-secondary); }
.sb-group.folder .sb-group-head .lbl { flex: 0 1 auto; }
.sb-group.folder .sb-group-body > .sb-row { padding-left: calc(var(--sb-row-px) + var(--sb-folder-indent)); }
`;

/** @param {{id: string, name: string, icon?: string, color?: string, collapsed?: boolean, tip?: string, rows: any[], editing?: boolean, value?: string,
 *   folder?: boolean, toggle?: string, context?: string, contextArg?: any}} p  color: a color token name (--grp-red ...); value: the text box start */
export function render(p) {
  const name = p.editing
    ? renameBox({ id: p.id, value: p.value, done: 'kit.group.renamed', cancel: 'kit.rename.cancel', label: t('group.rename') })
    : html`<span class="lbl trunc">${p.name}</span>`;
  return html`<div class="${cx('sb-group', p.folder && 'folder')}" data-c="tab-group"${attrs({ 'data-colored': p.color ? '' : null, style: p.color ? `--grp:var(${p.color})` : null })}>
    <div class="sb-row sb-group-head" role="button" tabindex="0"${attrs({ 'data-action': p.editing ? null : (p.toggle || 'kit.group.toggle'), 'data-arg': p.id, 'data-context': p.context || 'kit.group', 'data-context-arg': p.contextArg ?? p.id, 'data-tip': p.tip, 'aria-expanded': String(!p.collapsed) })}>
      ${icon(p.icon || (p.folder ? 'folder-fill' : 'folder'))}${name}${icon(p.collapsed ? 'chevron-down-small' : 'chevron-up-small', 'sm', 'chev')}
      ${p.folder ? '' : html`<button class="x" data-action="kit.group.close"${attrs({ 'data-arg': p.id })} data-tip="${t('group.close')}" aria-label="${t('group.close')}">${icon('cross-small', 'sm')}</button>`}
    </div>
    ${p.collapsed ? '' : html`<div class="sb-group-body">${p.rows}</div>`}
  </div>`;
}
