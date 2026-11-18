/*
 * Submenu opened in place. Used by menus in narrow panels.
 * The parent scales to .96 and its items dim to 50%; the sub sheet starts at the chosen item's place and height
 * and grows to its content height with a spring. The sheet's top row repeats the chosen item and closes it when pressed.
 * The sheet always fits the window: shorter than the window, it moves up when the room below is short (over the menu's top if it must),
 * and only its item list scrolls (the chosen-item row stays). Side submenus are handled by menu.js.
 */
import { html } from '../core/html.js';
import { icon } from '../icons/icons.js';
import * as menuItem from './menu-item.js';

export const name = 'submenu';

export const css = `
.m-sub { position: absolute; left: 50%; width: 100%; z-index: 1; overflow: hidden; border-radius: var(--r-panel); corner-shape: var(--corner); background: var(--float-bg); -webkit-backdrop-filter: var(--float-filter); backdrop-filter: var(--float-filter); box-shadow: var(--float-edge), var(--float-shadow); transform: translateX(-50%) scale(calc(1 / var(--morph-scale))); transform-origin: top center; transition: height var(--dur-spring-submenu) var(--ease-spring-submenu), opacity var(--dur-menu) var(--ease-standard); outline: none; }
.m-sub.entering { opacity: 0; }
.m-sub.leaving { opacity: 0; pointer-events: none; }
.m-sub-inner { box-sizing: border-box; height: 100%; display: flex; flex-direction: column; padding: var(--float-pad); transition: opacity var(--dur-blur-in) var(--ease-standard), filter var(--dur-blur-in) var(--ease-standard); }
.m-sub-inner > .m-root { min-height: 0; flex: 1 1 auto; overflow-x: hidden; overflow-y: auto; }
.m-sub.entering .m-sub-inner { opacity: 0; filter: blur(var(--blur-submenu-in)); }
.m-sub.leaving .m-sub-inner { opacity: 0; filter: blur(var(--blur-submenu-out)); }
.m-sub-head { width: 100%; text-align: left; }
`;

/** Sub sheet content: header (chosen item look + down chevron) + separator + items */
export function render(headItem, def) {
  let i = 0;
  return html`<div class="m-sub-inner" role="presentation">
    <button type="button" class="mi m-sub-head" tabindex="-1">${headItem.icon ? icon(headItem.icon) : ''}<span class="mi-text">${headItem.label}</span>${menuItem.end(headItem)}<span class="mi-sub">${icon('chevron-down-small')}</span></button>
    <div class="m-sep" role="separator"><div></div></div>
    <div class="m-root" data-scroll="menu">${def.items.filter(Boolean).map(it => menuItem.render(it, it.type ? -1 : i++))}</div>
  </div>`;
}

/** Opens a sub sheet at itemEl inside parent menu m. Returns the sheet element */
export function openMorph(m, itemEl, def, { doc }) {
  const root = m.el;
  const head = m.defs.find(d => d.id === itemEl.dataset.item) || { label: itemEl.dataset.label };
  const rr = root.getBoundingClientRect(), ir = itemEl.getBoundingClientRect();
  const scale = parseFloat(getComputedStyle(root).getPropertyValue('--morph-scale')) || .96;
  const top = ir.top - rr.top;
  m.morphBase = m.morphBase ?? rr.height;
  const sub = doc.createElement('div');
  sub.className = 'm-sub entering';
  sub.setAttribute('role', 'menu');
  sub.tabIndex = -1;
  sub.dataset.c = 'submenu';
  sub.innerHTML = render(head, def).s;
  sub.style.top = top + 'px';
  sub.style.height = ir.height + 'px';
  root.style.height = rr.height + 'px';
  root.appendChild(sub);
  const inner = sub.firstElementChild, list = inner.lastElementChild;
  const edge = parseFloat(getComputedStyle(root).getPropertyValue('--space-2')) || 8, vh = doc.documentElement.clientHeight;
  const rootTop = Number.isFinite(parseFloat(root.style.top)) ? parseFloat(root.style.top) : rr.top; /* placed top: the rect may still carry the opening motion */
  /* natural height: everything above the list plus the list's full content (the inner is a column whose list scrolls) */
  const natural = inner.scrollHeight - list.clientHeight + list.scrollHeight;
  const target = Math.min(natural, vh - 2 * edge);
  /* the parent scales about its centre: a point y below its top shows at rootTop + RH/2·(1−s) + y·s, and the sheet's own 1/s undoes the scale */
  const height = Math.min(Math.max(m.morphBase, top + target / scale), (vh - edge - rootTop) / scale, vh - 2 * edge); /* the menu's own max-height caps it too */
  const shown = y => rootTop + height / 2 * (1 - scale) + y * scale;
  let at = top;
  if (shown(at) + target > vh - edge) at = (vh - edge - target - rootTop - height / 2 * (1 - scale)) / scale;
  if (shown(at) < edge) at = (edge - rootTop - height / 2 * (1 - scale)) / scale;
  sub.style.top = at + 'px';
  sub.getBoundingClientRect();
  root.classList.add('morph-active');
  sub.classList.remove('entering');
  sub.style.height = target + 'px';
  root.style.height = height + 'px';
  return sub;
}

/** Closes the sub sheet and returns the parent menu to its size */
export function closeMorph(m, sub) {
  const root = m.el;
  sub.classList.add('leaving');
  root.classList.remove('morph-active');
  if (m.morphBase != null) root.style.height = m.morphBase + 'px';
  const ms = parseFloat(getComputedStyle(root).getPropertyValue('--dur-spring-submenu')) || 450;
  setTimeout(() => { sub.remove(); if (!root.querySelector('.m-sub')) { root.style.height = ''; m.morphBase = null; } }, ms);
}
