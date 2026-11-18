/*
 * File tree: rows 32 high (radius lg, 8 side padding, 6 between icon and name, 14 text in the primary surface color).
 * Hover and keyboard focus use the secondary fill, the open file the muted fill with foreground text. A folder row toggles its children
 * (indented 14) and shows a chevron before its icon, as trees do (right when closed, down when open); a file row keeps the chevron's room empty so icons line up.
 * The row end (status, change letter) stays on the right. Rows are buttons that emit their action with the node id.
 */
import { html, cx, attrs } from '../core/html.js';
import { icon } from '../icons/icons.js';

export const name = 'file-tree';

export const css = `
.ft { display: flex; flex-direction: column; gap: 0; padding: var(--space-2); min-width: 0; }
.ft-row { height: var(--control-h); width: 100%; min-width: 0; display: flex; align-items: center; gap: var(--space-1_5); padding: 0 var(--space-2); border-radius: var(--r-control); corner-shape: var(--corner); text-align: left; font-size: var(--text-sm); color: var(--surface-primary-foreground); outline: none; }
.ft-row:hover, .ft-row:focus-visible { background: var(--secondary); }
.ft-row[aria-current="true"] { background: var(--muted); color: var(--foreground); }
.ft-row > .wi { color: var(--muted-foreground); flex-shrink: 0; }
.ft-row .ft-chev { flex: none; display: grid; place-items: center; width: var(--icon-sm); height: var(--icon-sm); margin-inline-end: calc(var(--space-0_5) * -1); color: var(--muted-foreground); transition: transform var(--dur-fast) var(--ease-standard); }
.ft-row .ft-chev .wi { width: var(--icon-sm); height: var(--icon-sm); }
.ft-row[aria-expanded="true"] .ft-chev { transform: rotate(90deg); }
.ft-end { margin-left: auto; display: flex; align-items: center; gap: var(--space-1_5); flex-shrink: 1; min-width: 0; max-width: 45%; } /* the name has the room first; the state gives way (to its own ellipsis) */
.ft-row > .trunc { flex: 0 1 auto; min-width: 0; }
.ft-letter { width: var(--space-3); text-align: center; font-size: var(--text-xs); font-weight: var(--weight-semibold); }
.ft-letter.M { color: var(--warning-content); } .ft-letter.A { color: var(--success-content); } .ft-letter.D { color: var(--destructive-content); }
.ft-row.gone .trunc { text-decoration: line-through; color: var(--muted-foreground); }
.ft-kids { padding-left: var(--ft-indent); }
.ft-kids[hidden] { display: none; }
`;

/**
 * @param {{nodes: {id: string, name: string, icon?: string, end?: any, letter?: 'M'|'A'|'D', letterLabel?: string, children?: object[], open?: boolean}[], current?: string, action: string}} p
 *   icon: the row icon; end: a status icon at the row end; letter: the change mark after it (D strikes the name through)
 */
/** a change letter like a source control list: M changed, A only on the new side, D gone (also a code view's file head mark) */
export const letter = (k, label) => html`<span class="${cx('ft-letter', k)}" title="${label || k}">${k}</span>`;
/* the row end: a status icon (end) and the change letter */
const end = n => n.end || n.letter ? html`<span class="ft-end">${n.end || ''}${n.letter ? letter(n.letter, n.letterLabel) : ''}</span>` : '';
/* what the user opened or closed, by folder path key; kept here because a redraw morphs the rendered state over the DOM */
const toggled = new Map();
const holds = (n, id) => n.id === id || !!n.children?.some(c => holds(c, id));
export function render(p) {
  const node = (n, parent = '') => {
    if (!n.children) return html`<button class="${cx('ft-row', n.letter === 'D' && 'gone')}"${attrs({ 'data-action': p.action, 'data-arg': n.id, 'aria-current': n.id === p.current ? 'true' : null, title: n.name })}><span class="ft-chev" aria-hidden="true"></span>${icon(n.icon || 'file-text')}<span class="trunc">${n.name}</span>${end(n)}</button>`;
    const key = parent + '/' + (n.id || n.name);
    const open = toggled.has(key) ? toggled.get(key) : holds(n, p.current) ? true : n.open !== false;
    return html`<button class="ft-row" data-key="${'b' + key}" aria-expanded="${String(open)}" data-ft-folder data-ft-key="${key}" title="${n.name}"><span class="ft-chev" aria-hidden="true">${icon('chevron-right-small', 'sm')}</span>${icon(n.icon || (open ? 'folder-open' : 'folder'))}<span class="trunc">${n.name}</span>${end(n)}</button><div class="ft-kids" data-key="${'k' + key}" ${open ? '' : html`hidden`}>${n.children.map(c => node(c, key))}</div>`;
  };
  return html`<div class="ft" role="tree" data-c="file-tree">${p.nodes.map(n => node(n))}</div>`;
}

export const hook = 'data-ft-folder';

export function attach(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-ft-folder]'); if (!b) return;
    const open = b.getAttribute('aria-expanded') !== 'true';
    toggled.set(b.dataset.ftKey, open);
    b.setAttribute('aria-expanded', String(open));
    b.nextElementSibling.hidden = !open;
  });
}
