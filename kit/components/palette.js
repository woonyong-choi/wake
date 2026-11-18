/*
 * Palette: a panel whose top edge sits where a full-height (--palette-h) panel centered in the window would start; it takes the height of
 * its results up to --palette-h, so a few results (or none) leave no empty box and typing never moves its top edge. Input + grouped rows
 * (icon, name, trailing action text); the list scrolls inside.
 * Typing filters by name, arrow keys move, Enter runs, Esc or an outside press closes.
 * Row definition: { id, icon, fav, label, end, endIcon, action, arg }; fav draws the icon as a page icon tile. Group: { label, rows }.
 */
import { html, cx, attrs } from '../core/html.js';
import { icon, favicon } from '../icons/icons.js';
import { t } from '../core/i18n.js';
import * as kbd from './kbd.js';

export const name = 'palette';

export const css = `
.pal-scrim { position: fixed; inset: 0; z-index: var(--z-scrim); }
.pal { position: fixed; z-index: var(--z-palette); top: max(var(--space-4), calc(50% - var(--palette-h) / 2)); left: 50%; width: var(--palette-w); max-width: calc(100vw - 2 * var(--space-4)); max-height: min(var(--palette-h), calc(100vh - 2 * var(--space-4))); display: flex; flex-direction: column; transform: translateX(-50%); border-radius: var(--r-panel); corner-shape: var(--corner); background: var(--pal-bg); -webkit-backdrop-filter: var(--native-glass-filter); backdrop-filter: var(--native-glass-filter); box-shadow: var(--shadow-palette), 0 0 0 var(--hairline) var(--n-palette-ring); font-family: var(--font-sans); color: var(--surface-primary-foreground); transform-origin: top center; }
.pal[data-state="open"] { animation: pal-in var(--dur-menu) var(--ease-enter) both; }
@keyframes pal-in { from { opacity: 0; transform: translateX(-50%) scale(var(--enter-scale)); } }
.pal-input { height: var(--pal-input-h); flex-shrink: 0; display: flex; align-items: center; gap: var(--space-2_5); padding: 0 var(--space-3); color: var(--muted-foreground); }
.pal-input > .wi { width: var(--icon-lg); height: var(--icon-lg); }
.pal-input input { flex: 1; min-width: 0; height: 100%; padding: 0; background: none; border: 0; outline: 0; font: inherit; font-size: var(--text-base); letter-spacing: var(--tracking-tight); color: var(--surface-primary-foreground); }
.pal-input input::placeholder { color: var(--muted-foreground); }
.pal-input .kbd { background: var(--pal-kbd); font-size: var(--text-xs); height: var(--pal-kbd-h); padding: 0 var(--space-1_5); border-radius: var(--r-control-sm); corner-shape: var(--corner); color: var(--surface-primary-foreground); }
.pal-list { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-1) var(--space-2); }
.pal-group { padding: calc(var(--space-2) + var(--space-1_5)) var(--space-2) var(--space-1_5); font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--muted-foreground); line-height: var(--leading-xs); }
.pal-group:first-child { padding-top: calc(var(--space-1) + var(--space-1_5)); }
.pal-row { height: var(--pal-row-h); display: flex; align-items: center; gap: var(--space-2); padding: 0 var(--space-2); border-radius: var(--r-control); corner-shape: var(--corner); font-size: var(--text-sm); line-height: var(--leading-sm); font-weight: var(--weight-medium); cursor: default; }
.pal-row + .pal-row { margin-top: var(--space-0_5); }
.pal-row[data-highlighted] { background: var(--secondary); }
.pal-row > .wi { width: var(--icon); height: var(--icon); margin: 0 calc((var(--icon-lg) - var(--icon)) / 2); color: var(--muted-foreground); flex-shrink: 0; }
.pal-row .end { margin-left: auto; color: var(--muted-foreground); font-size: var(--text-xs); line-height: var(--leading-xs); display: flex; gap: var(--space-2); align-items: center; white-space: nowrap; flex-shrink: 0; }
.pal-row .end .wi { width: var(--icon-sm); height: var(--icon-sm); }
.pal-empty { padding: var(--space-3) var(--space-2); color: var(--muted-foreground); font-size: var(--text-sm); text-align: center; }
`;

/* Rows shown for the typed text: a query-only group (whole-catalogue search) stays hidden until something is typed, and a group with a limit shows that many matches */
const visible = (groups, q) => groups.map(g => ({ ...g, rows: g.queryOnly && !q ? [] : g.rows.filter(r => !q || r.label.toLowerCase().includes(q)).slice(0, g.limit ?? Infinity) }));

/** @param {{groups: {label: string, rows: object[], queryOnly?: boolean, limit?: number}[], placeholder?: string, keys?: string[]}} p */
export function render(p) {
  let i = 0;
  return html`<div class="pal" role="dialog" aria-modal="true" data-c="palette" data-state="open">
    <div class="pal-input">${icon('search', 'lg')}<input data-pal-input placeholder="${p.placeholder || t('palette.placeholder')}" aria-label="${p.placeholder || t('palette.placeholder')}" autocomplete="off" spellcheck="false">${p.keys ? kbd.render({ keys: [p.keys.join('')] }) : ''}</div>
    <div class="pal-list" role="listbox" data-scroll="list">${renderGroups(visible(p.groups, ''), () => i++)}</div>
  </div>`;
}

function renderGroups(groups, next) {
  const shown = groups.filter(g => g.rows.length);
  if (!shown.length) return html`<div class="pal-empty">${t('menu.empty')}</div>`;
  return html`${shown.map(g => html`<div class="pal-group">${g.label}</div>${g.rows.map(r => {
    const n = next();
    return html`<div class="${cx('pal-row')}" role="option" data-index="${n}"${attrs({ 'data-highlighted': n === 0 ? '' : null, 'data-label': r.label })}>${r.fav ? favicon(r.icon || 'globe', 'lg') : icon(r.icon || 'globe')}<span class="trunc">${r.label}</span><span class="end">${r.end || ''}${r.endIcon ? icon(r.endIcon, 'sm') : ''}</span></div>`;
  })}`)}`; /* one markup value: filter() writes its .s into the list */
}

export function attach(root, ctx) {
  const doc = root.ownerDocument || root;
  let el = null, scrim = null, groups = [], flat = [], idx = 0;
  const rows = () => [...el.querySelectorAll('.pal-row')];
  const hl = i => { const r = rows(); if (!r.length) return; idx = (i + r.length) % r.length; r.forEach((x, k) => x.toggleAttribute('data-highlighted', k === idx)); r[idx].scrollIntoView({ block: 'nearest' }); };
  const filter = q => {
    q = q.trim().toLowerCase();
    const gs = visible(groups, q);
    flat = gs.flatMap(g => g.rows);
    let i = 0;
    el.querySelector('.pal-list').innerHTML = renderGroups(gs, () => i++).s;
    idx = 0;
  };
  function close() {
    if (!el) return;
    el.remove(); scrim.remove(); el = scrim = null;
    ctx.onOverlay?.(false, null, { owner: 'palette' });
  }
  function open(def) {
    close();
    groups = def.groups; flat = visible(groups, '').flatMap(g => g.rows);
    scrim = doc.createElement('div'); scrim.className = 'pal-scrim'; doc.body.appendChild(scrim);
    const wrap = doc.createElement('div'); wrap.innerHTML = render(def).s; el = wrap.firstElementChild; doc.body.appendChild(el);
    el.querySelector('[data-pal-input]').focus();
    scrim.addEventListener('mousedown', close);
    ctx.onOverlay?.(true, el, { owner: 'palette' });
  }
  const run = i => { const r = flat[i]; close(); if (r?.action) ctx.emit(r.action, { arg: r.arg }); };
  doc.addEventListener('input', e => { if (el && e.target.matches('[data-pal-input]')) filter(e.target.value); });
  doc.addEventListener('keydown', e => {
    if (!el) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hl(idx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hl(idx - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(idx); }
  }, true);
  doc.addEventListener('pointermove', e => { const r = e.target.closest?.('.pal-row'); if (r && el?.contains(r)) hl(+r.dataset.index); });
  doc.addEventListener('click', e => { const r = e.target.closest?.('.pal-row'); if (r && el?.contains(r)) run(+r.dataset.index); });
  return { open, close, isOpen: () => !!el };
}
