/*
 * Menu (dropdown). Rendered from definition data; opening, closing, keyboard and submenu behavior all live here.
 *
 * Definition: { items: [...], side: 'bottom'|'top', align: 'start'|'end', width, minWidth, morph, variant, icons, sideOffset, alignOffset, pending }
 *   pending (a promise): the menu opens with the items it has now (a loading row); when the promise settles the trigger's menu is asked
 *   again and refreshed in place (no new open motion). A refreshed menu without items closes.
 *   icons shows the item icons of a native-variant menu (a web menu drawn the way the reference draws its own menus, items without an icon aligned to the labels).
 *   variant 'popover' adds the rows of popover.js (Tab and Shift+Tab move like the arrows); every menu has the one floating surface and item height.
 *   items are menu-item definitions. A submenu is item.submenu = { items, ... }.
 *   morph opens submenus in place (narrow panel); otherwise they open to the side (hover 100ms or ArrowRight).
 *
 * Combobox (combo(trigger, def, { onKeep, onClose })): a list under a text box that keeps the focus in the box. It opens once and is then
 * refreshed in place (no new open motion) as the box asks again; arrows highlight without moving focus, Enter chooses only a highlighted
 * row (otherwise the box gets the key), Esc and Tab close, typing never jumps rows, and pressing inside the box keeps it open.
 * An item with keep runs its action and keeps the list (a retry row): onKeep lets the box ask again.
 * Hosts: ctx.openSide(def, itemRect) / ctx.closeSide() let the host show a side submenu outside this document (desktop floating surface);
 * a swatch choice is emitted with { keep: true } (the menu stays open); ctx.surface marks a document that is itself the menu's window.
 * Wiring: pressing (mousedown) an element with [data-menu="name"] asks ctx.resolveMenu(name, arg, el) for the definition and opens it.
 * Choosing an item calls ctx.emit(item.action, { arg: item.arg, item }) and closes. Switch items keep the menu open; a confirm switch closes and emits the requested value instead of changing it.
 * A multi list (checkbox items) keeps the menu open on each choice; a bulk row over it is the tri-state select-all row (checked, mixed, empty by the
 * rows in sight; a search narrows them): choosing it turns the rows in sight on, or off when they all are, and emits the list's action once with
 * { arg: { ...arg, values: the ids on }, bulk: 'all'|'none' }.
 * Row end buttons (item.actions) run their own action and keep the menu open. A choice (menu-item choices row) runs its action: a color swatch keeps the menu open with the choice marked, an icon closes it.
 *
 * A trigger inside [data-menu-bounds] (the side panel) keeps its menu inside that box: the menu is at most as wide as the box and long
 * item end values shorten with an ellipsis, as the reference panel menus cannot leave the panel.
 * Motion (measured on the reference): open and close 100ms, opacity 0 to 1, scale .95 to 1, 8px slide from the opening side (no slide on close).
 * In-place submenu: height spring (420/34), opacity 100ms, inner text blur 4px to 0 over 80ms, parent scales to .96 and its items dim to 50%.
 */
import { t } from '../core/i18n.js';
import { html } from '../core/html.js';
import { place } from '../core/position.js';
import * as menuItem from './menu-item.js';
import * as submenu from './submenu.js';
import * as checkbox from './checkbox.js';

export const name = 'menu';

export const css = `
.m-layer { position: fixed; inset: 0; pointer-events: none; z-index: var(--z-menu); }
.menu { position: fixed; pointer-events: auto; min-width: var(--menu-min-w); padding: var(--float-pad); border-radius: var(--r-panel); corner-shape: var(--corner); background: var(--float-bg); -webkit-backdrop-filter: var(--float-filter); backdrop-filter: var(--float-filter); color: var(--surface-primary-foreground); box-shadow: var(--float-edge), var(--float-shadow); font-family: var(--font-sans); font-size: var(--text-sm); max-height: calc(100vh - 2 * var(--space-2)); overflow-x: hidden; overflow-y: auto; outline: none; transform-origin: var(--origin); -webkit-app-region: no-drag; }
.menu[data-state="open"] { animation: menu-in var(--dur-menu) var(--ease-enter) both; }
.menu[data-state="closed"] { animation: menu-out var(--dur-menu) var(--ease-enter) both; pointer-events: none; }
.menu[data-side="bottom"] { --enter-x: 0px; --enter-y: calc(-1 * var(--enter-offset)); }
.menu[data-side="top"] { --enter-x: 0px; --enter-y: var(--enter-offset); }
.menu[data-side="right"] { --enter-x: calc(-1 * var(--enter-offset)); --enter-y: 0px; }
.menu[data-side="left"] { --enter-x: var(--enter-offset); --enter-y: 0px; }
@keyframes menu-in { from { opacity: 0; transform: translate(var(--enter-x), var(--enter-y)) scale(var(--enter-scale)); } }
@keyframes menu-out { to { opacity: 0; transform: scale(var(--enter-scale)); } }
.menu:has(> .m-root > .m-list) { display: flex; flex-direction: column; overflow: hidden; } /* a menu with a search field: the field stays, the rows under it scroll */
.m-root:has(> .m-list) { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }
.m-list { position: relative; min-height: 0; flex: 1 1 auto; overflow-x: hidden; overflow-y: auto; }
.menu.morph-host { overflow: visible; transition: height var(--dur-spring-submenu) var(--ease-spring-submenu), transform var(--dur-spring-submenu) var(--ease-spring-submenu); }
.menu.morph-active { transform: scale(var(--morph-scale)); transform-origin: center; }
.menu.morph-host > .m-root > * { transition: opacity var(--dur-menu) var(--ease-standard); }
.menu.morph-active > .m-root > * { opacity: var(--morph-dim); }
`;

/** Renders only the menu content (item list). Also used to show a static menu elsewhere.
 * A menu that opens with a search field: the leading search field and bulk row stay at the top and only the rows under them scroll
 * (.m-list, the menu's scroller and its overlay bar start under the field). A morph menu keeps one scroller: its in-place sheet grows over the menu's edge */
export function render(def) {
  let i = 0;
  const all = def.items.filter(Boolean), boxes = all.filter(it => it.checkbox);
  const row = it => (it.type === 'bulk' ? menuItem.render({ ...it, state: bulkState(boxes) }, -1) : menuItem.render(it, it.type ? -1 : i++));
  let n = 0; while (n < all.length && ['search', 'bulk'].includes(all[n].type)) n++;
  if (def.morph || !all.slice(0, n).some(it => it.type === 'search')) return html`<div class="m-root" role="presentation">${all.map(row)}</div>`;
  return html`<div class="m-root" role="presentation">${all.slice(0, n).map(row)}<div class="m-list" data-scroll="menu">${all.slice(n).map(row)}</div></div>`;
}

/** The select-all row's state over the rows it covers: 'true' when all are on, 'mixed' when some are, 'false' when none (or no rows) */
export function bulkState(rows) {
  const on = rows.filter(r => r.checked).length;
  return on && on === rows.length ? 'true' : on ? 'mixed' : 'false';
}

/** Static menu box (component gallery) */
export function renderStatic(def) {
  return html`<div class="menu" role="menu" style="position:relative;animation:none;${def.width ? `width:${def.width}px` : ''}">${render(def)}</div>`;
}

export const EDGE = 5; // distance kept from the viewport or the bounds box edge (the chart info panel keeps the same)

const layer = doc => {
  let l = doc.getElementById('m-layer');
  if (!l) { l = doc.createElement('div'); l.id = 'm-layer'; l.className = 'm-layer'; doc.body.appendChild(l); }
  return l;
};

export function attach(root, ctx) {
  const doc = root.ownerDocument || root;
  const stack = []; // open menus: { el, def, trigger, items, hl, parent, typed, typedAt }
  let pressTrigger = null;

  const top = () => stack[stack.length - 1];

  const itemsOf = m => [...m.el.querySelectorAll(':scope > .m-root > .mi, :scope > .m-root .mi')].filter(x => !x.closest('.m-sub') || m.isSub);

  function highlight(m, idx, focus = true) {
    const list = m.items.filter(x => x.offsetParent !== null && x.getAttribute('aria-disabled') !== 'true');
    m.items.forEach(x => { x.removeAttribute('data-highlighted'); x.querySelector('[data-tip-open]')?.removeAttribute('data-tip-open'); });
    if (idx == null || !list.length) { m.hl = null; return; }
    const el = typeof idx === 'number' ? list[(idx + list.length) % list.length] : idx;
    el.setAttribute('data-highlighted', '');
    el.querySelector('[data-tip-overflow]')?.setAttribute('data-tip-open', '');
    m.hl = el;
    if (focus && !m.combo && !m.el.querySelector('[data-menu-search]')) el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  }
  const move = (m, d) => {
    const list = m.items.filter(x => x.offsetParent !== null && x.getAttribute('aria-disabled') !== 'true');
    const cur = m.hl ? list.indexOf(m.hl) : -1;
    highlight(m, cur < 0 ? (d > 0 ? 0 : list.length - 1) : cur + d);
  };

  function open(trigger, def, opts = {}) {
    closeAll(false);
    const el = doc.createElement('div');
    el.dataset.scroll = 'menu';
    el.className = 'menu' + (def.morph ? ' morph-host' : '') + (def.variant ? ' ' + def.variant : '') + (def.icons ? ' icons' : '');
    el.setAttribute('role', 'menu');
    el.tabIndex = -1;
    el.dataset.c = 'menu';
    if (def.width) el.style.width = def.width + 'px';
    if (def.minWidth) el.style.minWidth = def.minWidth + 'px';
    const bounds = trigger?.closest?.('[data-menu-bounds]');
    if (bounds) el.style.maxWidth = (bounds.clientWidth - 2 * EDGE) + 'px';
    el.innerHTML = render(def).s;
    layer(doc).appendChild(el);
    const r = opts.point ? { left: opts.point.x, right: opts.point.x, top: opts.point.y, bottom: opts.point.y, width: 0, height: 0 } : trigger.getBoundingClientRect();
    if (!opts.point) el.style.minWidth = Math.max(el.offsetWidth, def.matchTrigger ? r.width : 0) + 'px';
    const cs = getComputedStyle(el);
    const sideOffset = opts.point ? 0 : def.sideOffset ?? parseFloat(cs.getPropertyValue('--space-1'));
    const alignOffset = def.alignOffset ?? 0;
    let pos = place(el, r, { side: def.side || 'bottom', align: def.align || 'start', sideOffset, alignOffset, padding: EDGE, within: bounds?.getBoundingClientRect() });
    const checked = def.alignItem && el.querySelector('.mi[aria-checked="true"]');
    if (checked) {
      // Place the chosen item over the trigger (select field). No open animation in this case
      const vh = doc.documentElement.clientHeight;
      const y = Math.max(5, Math.min(r.top - checked.offsetTop + (r.height - checked.offsetHeight) / 2, vh - el.offsetHeight - 5));
      pos = { ...pos, x: Math.round(r.left - 1), y: Math.round(y), side: 'none' };
    }
    el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px';
    /* a list taller than its room scrolls; the chosen row opens in sight (in the middle when it can be) */
    const chosen = el.querySelector('.mi[aria-checked="true"]'), scroller = el.querySelector(':scope > .m-root > .m-list') || el;
    if (chosen && scroller.scrollHeight > scroller.clientHeight) scroller.scrollTop = Math.max(0, chosen.offsetTop - (scroller.clientHeight - chosen.offsetHeight) / 2);
    el.style.setProperty('--origin', pos.transformOrigin);
    el.dataset.side = pos.side;
    el.dataset.state = checked ? 'idle' : 'open';
    el.addEventListener('animationend', () => { if (el.dataset.state === 'open') el.dataset.state = 'idle'; }, { once: true });
    const m = { el, def, trigger, items: [], hl: null, typed: '', typedAt: 0, defs: def.items.filter(Boolean) };
    m.items = itemsOf(m);
    for (const label of m.el.querySelectorAll('.mi-text:not(:has(.mi-desc)), .mi-endv')) {
      label.dataset.tip = label.textContent; label.setAttribute('data-tip-overflow', '');
    }
    stack.push(m);
    if (trigger) { trigger.setAttribute('aria-expanded', 'true'); trigger.setAttribute('data-popup-open', ''); }
    const search = el.querySelector('[data-menu-search]');
    if (opts.combo) Object.assign(m, { combo: true, onKeep: opts.onKeep, onClose: opts.onClose });
    else if (search) search.focus(); else el.focus({ preventScroll: true });
    if (opts.highlight === 'first') move(m, 1); else if (opts.highlight === 'last') move(m, -1);
    ctx.onOverlay?.(true, el, { owner: 'menu' });
    if (def.pending && trigger?.dataset?.menu) Promise.resolve(def.pending).catch(() => {}).then(() => {
      if (stack[0] !== m || el.dataset.state === 'closed') return;
      const again = ctx.resolveMenu(trigger.dataset.menu, trigger.dataset.menuArg ? JSON.parse(trigger.dataset.menuArg) : undefined, trigger);
      if (!again?.items?.filter(Boolean).length) { closeAll(); return; }
      refill(m, again);
      const p = place(el, trigger.getBoundingClientRect(), { side: again.side || 'bottom', align: again.align || 'start', sideOffset, alignOffset, padding: EDGE, within: bounds?.getBoundingClientRect() });
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    });
    return m;
  }
  /* draw a new definition into an open menu in place (no open motion). What the person did in it stays: the typed search text (it filters
     the new rows too), the highlighted row, the focus in the search field and the list's scroll */
  function refill(m, def) {
    const box = m.el.querySelector('[data-menu-search]'), query = box?.value ?? '', typing = !!box && doc.activeElement === box;
    const caret = typing ? [box.selectionStart, box.selectionEnd] : null, lit = m.hl?.dataset.item;
    const scrollerOf = () => m.el.querySelector(':scope > .m-root > .m-list') || m.el, scroll = scrollerOf().scrollTop;
    m.el.innerHTML = render(def).s;
    if (def.width) m.el.style.width = def.width + 'px';
    Object.assign(m, { def, defs: def.items.filter(Boolean), hl: null });
    m.items = itemsOf(m);
    for (const label of m.el.querySelectorAll('.mi-text:not(:has(.mi-desc)), .mi-endv')) {
      label.dataset.tip = label.textContent; label.setAttribute('data-tip-overflow', '');
    }
    const again = m.el.querySelector('[data-menu-search]');
    if (again && query) { again.value = query; again.dispatchEvent(new Event('input', { bubbles: true })); }
    if (again && !m.combo && (typing || doc.activeElement === m.el)) { again.focus({ preventScroll: true }); if (caret) again.setSelectionRange(...caret); }
    const row = lit && m.items.find(x => x.dataset.item === lit && x.style.display !== 'none');
    if (row) highlight(m, row, false); else if (!query) highlight(m, null);
    scrollerOf().scrollTop = scroll;
  }

  function closeAll(animate = true, returnFocus = false) {
    while (stack.length) {
      const m = stack.pop();
      if (m.trigger) { m.trigger.setAttribute('aria-expanded', 'false'); m.trigger.removeAttribute('data-popup-open'); }
      m.onClose?.();
      if (m.sideSub) { if (m.sideSub.remote) ctx.closeSide?.(); else m.sideSub.el.remove(); }
      if (animate && !m.parent) {
        m.el.dataset.state = 'closed';
        const el = m.el;
        el.addEventListener('animationend', () => el.remove(), { once: true });
        setTimeout(() => el.remove(), 200);
      } else m.el.remove();
      if (returnFocus && m.trigger && !m.parent) m.trigger.focus({ preventScroll: true });
    }
    ctx.onOverlay?.(false, null, { owner: 'menu' });
  }

  /* Combobox list: opened once under its box, then its rows are replaced in place */
  function combo(trigger, def) {
    const m = stack[0], opts = arguments[2] || {};
    if (!m || !m.combo || m.trigger !== trigger || stack.length > 1 || m.el.dataset.state === 'closed') return open(trigger, def, { ...opts, combo: true });
    const keep = m.hl?.dataset.item;
    refill(m, def);
    /* the box can grow while it stays open (a query box taking more lines): the list follows its bottom edge */
    const r = trigger.getBoundingClientRect(), bounds = trigger.closest?.('[data-menu-bounds]');
    const pos = place(m.el, r, { side: def.side || 'bottom', align: def.align || 'start', sideOffset: def.sideOffset ?? parseFloat(getComputedStyle(m.el).getPropertyValue('--space-1')), alignOffset: def.alignOffset ?? 0, padding: EDGE, within: bounds?.getBoundingClientRect() });
    m.el.style.left = pos.x + 'px'; m.el.style.top = pos.y + 'px'; m.el.dataset.side = pos.side;
    Object.assign(m, { onKeep: opts.onKeep, onClose: opts.onClose });
    const again = keep && m.items.find(x => x.dataset.item === keep);
    if (again) highlight(m, again, false);
    return m;
  }
  const closeCombo = trigger => { if (stack[0]?.combo && stack[0].trigger === trigger) closeAll(); };

  /* Open a submenu: in place when morph, otherwise to the side */
  function openSub(m, itemEl, viaKeyboard) {
    const def = m.defs.find(d => d.id === itemEl.dataset.item)?.submenu;
    if (!def) return;
    const subDef = typeof def === 'function' ? def() : def;
    if (m.def.morph) {
      const sub = submenu.openMorph(m, itemEl, subDef, { doc });
      const sm = { el: sub, def: subDef, trigger: itemEl, parent: m, isSub: true, items: [], hl: null, typed: '', typedAt: 0, defs: subDef.items.filter(Boolean), morph: true };
      sm.items = [...sub.querySelectorAll('.mi')];
      stack.push(sm);
      itemEl.setAttribute('aria-expanded', 'true');
      if (viaKeyboard) move(sm, 1); else sub.focus({ preventScroll: true });
    } else {
      if (m.sideSub && m.sideSub.trigger === itemEl) return;
      closeSide(m);
      if (ctx.openSide) { // the host shows the side submenu as its own surface next to the row (desktop floating surface)
        ctx.openSide({ ...subDef, variant: m.def.variant, icons: m.def.icons }, itemEl.getBoundingClientRect());
        m.sideSub = { trigger: itemEl, remote: true };
        itemEl.setAttribute('aria-expanded', 'true');
        return;
      }
      const el = doc.createElement('div');
      el.className = 'menu' + (m.def.variant ? ' ' + m.def.variant : '') + (m.def.icons ? ' icons' : ''); el.dataset.scroll = 'menu'; el.setAttribute('role', 'menu'); el.tabIndex = -1; el.dataset.c = 'menu';
      el.innerHTML = render(subDef).s;
      layer(doc).appendChild(el);
      const pos = place(el, itemEl.getBoundingClientRect(), { side: 'right', align: 'start', sideOffset: 2, alignOffset: -6 });
      el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px';
      el.style.setProperty('--origin', pos.transformOrigin);
      el.dataset.side = pos.side; el.dataset.state = 'open';
      const sm = { el, def: subDef, trigger: itemEl, parent: m, isSub: true, items: [...el.querySelectorAll('.mi')], hl: null, typed: '', typedAt: 0, defs: subDef.items.filter(Boolean) };
      m.sideSub = sm;
      stack.push(sm);
      itemEl.setAttribute('aria-expanded', 'true');
      ctx.onOverlay?.(true, el, { owner: 'menu' }); // a side sheet reaching over the tab view hides it like the menu itself
      if (viaKeyboard) move(sm, 1);
    }
  }
  function closeSide(m) {
    if (!m.sideSub) return;
    if (m.sideSub.remote) { m.sideSub.trigger.setAttribute('aria-expanded', 'false'); m.sideSub = null; ctx.closeSide?.(); return; }
    const i = stack.indexOf(m.sideSub);
    if (i >= 0) stack.splice(i);
    m.sideSub.trigger.setAttribute('aria-expanded', 'false');
    m.sideSub.el.remove();
    m.sideSub = null;
  }
  function closeSub(sm) {
    const i = stack.indexOf(sm);
    if (i >= 0) stack.splice(i);
    sm.trigger.setAttribute('aria-expanded', 'false');
    if (sm.morph) submenu.closeMorph(sm.parent, sm.el);
    else { sm.el.remove(); sm.parent.sideSub = null; }
    highlight(sm.parent, sm.trigger);
  }

  /* a multi list's row shows its state: the box (box) or the trailing check */
  function markChecked(itemEl, def) {
    itemEl.setAttribute('aria-checked', String(def.checked));
    const box = itemEl.querySelector(':scope > .cbx');
    if (box) { const w = itemEl.ownerDocument.createElement('span'); w.innerHTML = checkbox.render({ checked: def.checked, decorative: true }).s; box.replaceWith(w.firstElementChild); return; }
    itemEl.querySelector('.mi-check')?.remove();
    if (def.checked) { const w = itemEl.ownerDocument.createElement('span'); w.innerHTML = menuItem.checkMark().s; itemEl.append(w.firstElementChild); }
  }
  /* the select-all row: its state over the checkbox rows in sight (a search narrows them) */
  const inSight = m => { const shown = new Set(m.items.filter(x => x.style.display !== 'none').map(x => x.dataset.item)); return m.defs.filter(d => d.checkbox && shown.has(d.id)); };
  function syncBulk(m) {
    const row = m.el.querySelector('.mi[data-bulk]'); if (!row) return;
    const state = bulkState(inSight(m));
    if (row.getAttribute('aria-checked') === state) return;
    row.setAttribute('aria-checked', state);
    const w = row.ownerDocument.createElement('span'); w.innerHTML = checkbox.render({ checked: state === 'true', indeterminate: state === 'mixed', decorative: true }).s; row.querySelector(':scope > .cbx')?.replaceWith(w.firstElementChild);
  }
  /* choosing the select-all row: the rows in sight all turn on, or all off when they all are; the list's action is told once with the ids on */
  function bulk(m) {
    const rows = inSight(m), on = bulkState(rows) !== 'true';
    for (const d of rows) if (!d.disabled && d.checked !== on) { d.checked = on; const el = m.items.find(x => x.dataset.item === d.id); if (el) markChecked(el, d); }
    syncBulk(m);
    const first = m.defs.find(d => d.checkbox && !d.disabled); if (!first) return;
    ctx.emit(first.action, { arg: { ...(first.arg && typeof first.arg === 'object' ? first.arg : {}), values: m.defs.filter(d => d.checkbox && d.checked).map(d => d.arg?.value ?? d.id) }, bulk: on ? 'all' : 'none' }, { render: false });
  }

  function activate(m, itemEl, viaKeyboard) {
    if (itemEl.hasAttribute('data-bulk')) { bulk(m); return; }
    const def = m.defs.find(d => d.id === itemEl.dataset.item);
    if (!def || def.disabled) return;
    if (def.submenu) { openSub(m, itemEl, viaKeyboard); return; }
    if (def.switch && def.confirm) {
      // The value stays until the app has asked and the person agreed: close and hand over the requested value
      const trigger = stack[0]?.trigger;
      closeAll(true, viaKeyboard);
      ctx.emit(def.action, { arg: def.arg, on: !def.on, item: def, trigger });
      return;
    }
    if (def.checkbox) {
      def.checked = !def.checked;
      markChecked(itemEl, def); syncBulk(m);
      ctx.emit(def.action, { arg: def.arg, checked: def.checked, item: def }, { render: false });
      return;
    }
    if (def.switch) {
      def.on = !def.on;
      itemEl.setAttribute('aria-checked', String(def.on));
      itemEl.querySelector('.sw')?.classList.toggle('on', def.on);
      ctx.emit(def.action, { arg: def.arg, on: def.on, item: def }, { render: false });
      return;
    }
    if (def.keep && m.combo) { if (def.action) ctx.emit(def.action, { arg: def.arg, item: def }); m.onKeep?.(); return; }
    const trigger = stack[0]?.trigger;
    closeAll(true, viaKeyboard && !m.combo);
    if (def.action) ctx.emit(def.action, { arg: def.arg, item: def, trigger });
  }

  function typeahead(m, ch) {
    const now = performance.now();
    m.typed = now - m.typedAt > 500 ? ch : m.typed + ch;
    m.typedAt = now;
    const list = m.items.filter(x => x.offsetParent !== null);
    const start = m.hl ? list.indexOf(m.hl) + (m.typed.length === 1 ? 1 : 0) : 0;
    for (let k = 0; k < list.length; k++) {
      const x = list[(start + k) % list.length];
      if ((x.dataset.label || '').toLowerCase().startsWith(m.typed.toLowerCase())) { highlight(m, x); return; }
    }
  }

  // Opening: open on press (mousedown). Releasing over an item while still pressed chooses it.
  root.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const t = e.target.closest('[data-menu]');
    if (t && !t.closest('.menu')) {
      e.preventDefault();
      if (stack.length && stack[0].trigger === t) { closeAll(); return; }
      const def = ctx.resolveMenu(t.dataset.menu, t.dataset.menuArg ? JSON.parse(t.dataset.menuArg) : undefined, t);
      if (!def) return;
      open(t, def);
      pressTrigger = { t, at: performance.now(), x: e.clientX, y: e.clientY };
      return;
    }
    if (stack.length && !e.target.closest('.menu') && !(stack[0].combo && stack[0].trigger.contains(e.target))) closeAll();
  }, true);
  doc.addEventListener('mouseup', e => {
    const p = pressTrigger; pressTrigger = null;
    if (!p || !stack.length) return;
    const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4;
    const it = e.target.closest?.('.menu .mi');
    if (moved && it && performance.now() - p.at > 150) {
      const m = stack.find(s => s.el.contains(it));
      if (m) activate(m, it, false);
    }
  });
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-menu]');
    if (t && !t.closest('.menu') && e.detail === 0) { // click from the keyboard
      const def = ctx.resolveMenu(t.dataset.menu, t.dataset.menuArg ? JSON.parse(t.dataset.menuArg) : undefined, t);
      if (def) open(t, def, { highlight: 'first' });
    }
  });
  doc.addEventListener('click', e => {
    const sw = e.target.closest('.menu [data-choice]');
    if (sw && stack.length) {
      // a color swatch marks the choice and keeps the menu open (measured); an icon closes it
      const keep = sw.classList.contains('m-sw');
      if (keep) for (const b of sw.parentElement.children) b.setAttribute('aria-pressed', String(b === sw)); else closeAll();
      ctx.emit(sw.dataset.action, { arg: sw.dataset.arg ? JSON.parse(sw.dataset.arg) : undefined }, keep ? { keep: true } : undefined);
      return;
    }
    const head = e.target.closest('.m-sub-head');
    if (head) { const sm = stack.find(s => s.el.contains(head) && s.isSub); if (sm) closeSub(sm); return; }
    const it = e.target.closest('.menu .mi');
    if (!it) return;
    const m = [...stack].reverse().find(s => s.items.includes(it));
    if (!m) return;
    const act = e.target.closest('.mi-act');
    if (act && act.dataset.act === 'kit.submenu') { openSub(m, it, e.detail === 0); return; }
    if (act) { // row end button (pin and so on): runs its own action and keeps the popover open
      const a = m.defs.find(d => d.id === it.dataset.item)?.actions?.find(x => x.id === act.dataset.act);
      if (!a) return;
      if (a.on !== undefined) { a.on = !a.on; act.classList.toggle('on', a.on); act.setAttribute('aria-pressed', String(a.on)); }
      ctx.emit(a.action, { arg: a.arg, on: a.on }, { render: false });
      return;
    }
    activate(m, it, e.detail === 0);
  });
  // Hover highlights; side submenus open after a 100ms dwell
  let hoverTimer = null;
  doc.addEventListener('pointermove', e => {
    const it = e.target.closest?.('.menu .mi');
    if (!it) {
      const m = top();
      if (m && e.target.closest?.('.menu') === m.el && m.hl && !m.hl.matches('[aria-expanded="true"]')) highlight(m, null);
      return;
    }
    const m = [...stack].reverse().find(s => s.items.includes(it));
    if (!m || m.hl === it) return;
    highlight(m, it);
    clearTimeout(hoverTimer);
    if (!m.def.morph) {
      if (it.hasAttribute('data-sub-click')) { if (m.sideSub && m.sideSub.trigger !== it) hoverTimer = setTimeout(() => closeSide(m), 100); }
      else if (it.getAttribute('aria-haspopup') === 'menu') hoverTimer = setTimeout(() => openSub(m, it, false), parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--delay-submenu')) || 100);
      else hoverTimer = setTimeout(() => closeSide(m), 100);
    }
  });
  doc.addEventListener('keydown', e => {
    const t = e.target.closest?.('[data-menu]');
    if (!stack.length) {
      if (t && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const def = ctx.resolveMenu(t.dataset.menu, t.dataset.menuArg ? JSON.parse(t.dataset.menuArg) : undefined, t);
        if (def) open(t, def, { highlight: e.key === 'ArrowDown' ? 'first' : 'last' });
      }
      return;
    }
    const m = top();
    const inSearch = e.target.matches?.('[data-menu-search]') || m.combo;
    if (m.combo && (e.isComposing || e.keyCode === 229 || ['ArrowRight', 'ArrowLeft', 'Home', 'End', ' '].includes(e.key))) return;
    switch (e.key) {
      case 'Escape': e.preventDefault(); e.stopPropagation();
        if (e.target.matches?.('[data-menu-search]') && e.target.value) { e.target.value = ''; e.target.dispatchEvent(new Event('input', { bubbles: true })); return; } /* a query is cleared first, the menu closes on the next Escape */
        if (m.isSub) closeSub(m); else closeAll(true, true); return;
      case 'Tab': if (stack[0].def.variant === 'popover' && !m.combo) { e.preventDefault(); move(m, e.shiftKey ? -1 : 1); } else closeAll(); return;
      case 'ArrowDown': e.preventDefault(); move(m, 1); return;
      case 'ArrowUp': e.preventDefault(); move(m, -1); return;
      case 'Home': if (!inSearch) { e.preventDefault(); highlight(m, 0); } return;
      case 'End': if (!inSearch) { e.preventDefault(); highlight(m, -1); } return;
      case 'ArrowRight': if (m.hl && m.hl.getAttribute('aria-haspopup') === 'menu') { e.preventDefault(); openSub(m, m.hl, true); } return;
      case 'ArrowLeft': if (m.isSub) { e.preventDefault(); closeSub(m); } return;
      case 'Enter': case ' ':
        if (inSearch && e.key === ' ') return;
        if (m.combo && !m.hl) return;
        if (m.hl) { e.preventDefault(); activate(m, m.hl, true); }
        return;
    }
    if (!inSearch && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) typeahead(m, e.key);
  }, true);
  // Search field: filter items by typed text
  doc.addEventListener('input', e => {
    if (!e.target.matches('[data-menu-search]')) return;
    const m = stack.find(s => s.el.contains(e.target));
    const q = e.target.value.trim().toLowerCase();
    let any = false;
    m.items.forEach(x => { if (x.hasAttribute('data-bulk')) return; const show = !q || (x.dataset.label || '').toLowerCase().includes(q); x.style.display = show ? '' : 'none'; any ||= show; }); /* the select-all row stays and covers what is left */
    syncBulk(m);
    m.el.querySelectorAll('.m-label, .m-sep').forEach(x => { x.style.display = q ? 'none' : ''; });
    let empty = m.el.querySelector('.m-empty');
    if (!any && !empty) { empty = doc.createElement('div'); empty.className = 'm-empty'; empty.textContent = t('menu.empty'); (m.el.querySelector('.m-root > .m-list') || m.el.querySelector('.m-root')).appendChild(empty); }
    if (any && empty) empty.remove();
    highlight(m, any ? 0 : null, false);
  });
  // a floating surface document (ctx.surface) is sized to its menu and closed by its host, so its own resize and blur do not close it
  const win = doc.defaultView;
  if (!ctx.surface) {
    win.addEventListener('resize', () => closeAll(false));
    win.addEventListener('blur', () => closeAll(false));
  }

  /* Open from outside (context menus and so on) */
  return { open, combo, closeCombo, closeAll, isOpen: () => stack.length > 0 };
}
