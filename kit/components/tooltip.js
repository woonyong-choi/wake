/*
 * Tooltip. Opens after hovering a [data-tip] element for --delay-tooltip. Moving to another element within --delay-tooltip-group of closing opens it at once.
 * Look: the one floating surface (--float-*: background, edge, shadow, radius), 12 text, 4 from the element (data-tip-side changes the side).
 * data-tip-keys adds a shortcut chip after the text (the tooltip's right padding shrinks to 6).
 * Motion: 150ms opacity + .95 scale + 8px from the opening side. While opening instantly, position changes slide over 160ms.
 * Does not open while a menu is open or a press is in progress.
 */
import { place } from '../core/position.js';

export const name = 'tooltip';
export const hook = 'data-tip';

export const css = `
.tip { position: fixed; z-index: var(--z-tooltip); pointer-events: none; max-width: var(--tooltip-max-w); padding: var(--float-tip-pad); border-radius: var(--r-panel); corner-shape: var(--corner); background: var(--float-solid); -webkit-backdrop-filter: var(--float-filter); backdrop-filter: var(--float-filter); color: var(--surface-primary-foreground); box-shadow: var(--float-edge), var(--float-shadow); font-family: var(--font-sans); font-size: var(--text-xs); line-height: var(--leading-xs); font-weight: var(--weight-tip); white-space: nowrap; transform-origin: var(--origin); display: inline-flex; align-items: center; gap: var(--space-1_5); }
.tip.overflow { white-space: normal; overflow-wrap: anywhere; max-width: min(var(--tooltip-max-w), 100%); }
.tip.has-keys { padding-right: var(--space-1_5); }
.tip[data-state="open"] { animation: tip-in var(--dur-fast) var(--ease-enter) both; }
.tip[data-state="closed"] { animation: tip-out var(--dur-fast) var(--ease-enter) both; }
.tip[data-instant] { transition: left var(--dur-tooltip-move) var(--ease-out-expo), top var(--dur-tooltip-move) var(--ease-out-expo); animation: none; }
.tip[data-side="top"] { --enter-x: 0px; --enter-y: var(--enter-offset); }
.tip[data-side="bottom"] { --enter-x: 0px; --enter-y: calc(-1 * var(--enter-offset)); }
.tip[data-side="right"] { --enter-x: calc(-1 * var(--enter-offset)); --enter-y: 0px; }
.tip[data-side="left"] { --enter-x: var(--enter-offset); --enter-y: 0px; }
@keyframes tip-in { from { opacity: 0; transform: translate(var(--enter-x), var(--enter-y)) scale(var(--tooltip-scale)); } }
@keyframes tip-out { to { opacity: 0; transform: scale(var(--tooltip-scale)); } }
`;

const ms = (doc, name, fallback) => parseFloat(getComputedStyle(doc.documentElement).getPropertyValue(name)) || fallback;

function clipped(el) {
  if (el.clientWidth <= 0) return false;
  if (el.scrollWidth > el.clientWidth) return true;
  const rect = el.getBoundingClientRect();
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    if (!/hidden|clip|auto|scroll/.test(getComputedStyle(parent).overflowX)) continue;
    const bounds = parent.getBoundingClientRect();
    if (rect.left < bounds.left || rect.right > bounds.right) return true;
  }
  return false;
}

export function attach(root, ctx) {
  const doc = root.ownerDocument || root;
  let timer = null, tip = null, current = null, lastClose = -1e9, down = false;
  const close = () => {
    clearTimeout(timer);
    if (!tip) return;
    const t = tip; tip = null; current = null; lastClose = performance.now();
    t.dataset.state = 'closed';
    t.addEventListener('animationend', () => t.remove(), { once: true });
    setTimeout(() => t.remove(), 300);
  };
  const show = (el, instant) => {
    const text = el.dataset.tip;
    if (!text || (ctx.menu?.isOpen() && !el.closest('.menu')) || (el.hasAttribute('data-tip-overflow') && !clipped(el))) return;
    let t = tip;
    if (!t) { t = doc.createElement('div'); t.className = 'tip'; t.setAttribute('role', 'tooltip'); doc.body.appendChild(t); }
    t.textContent = text;
    t.classList.toggle('overflow', el.hasAttribute('data-tip-overflow'));
    t.classList.toggle('has-keys', !!el.dataset.tipKeys);
    if (el.dataset.tipKeys) { const k = doc.createElement('kbd'); k.className = 'kbd'; k.textContent = el.dataset.tipKeys; t.appendChild(k); }
    const pos = place(t, el.getBoundingClientRect(), { side: el.dataset.tipSide || 'top', align: 'center', sideOffset: 4 });
    if (instant && tip) t.dataset.instant = ''; else delete t.dataset.instant;
    t.style.left = pos.x + 'px'; t.style.top = pos.y + 'px';
    t.style.setProperty('--origin', pos.transformOrigin);
    t.dataset.side = pos.side;
    if (!tip) t.dataset.state = 'open';
    tip = t; current = el;
  };
  const candidates = new Set();
  const resize = new ResizeObserver(() => refresh());
  const refresh = () => {
    for (const el of root.querySelectorAll('[data-tip-overflow]')) {
      if (!candidates.has(el)) { candidates.add(el); resize.observe(el); }
      const overflow = clipped(el);
      /* a pressable table row (tr[data-action]) does not make its clipped cells interactive: they take focus to reveal their text */
      const interactive = el.closest('button, a, input, [data-action]:not(tr), [data-menu], [data-dialog], [role^="menuitem"]');
      if (overflow && !interactive) { if (el.tabIndex !== 0) el.setAttribute('tabindex', '0'); }
      else if (el.hasAttribute('tabindex')) el.removeAttribute('tabindex');
    }
    for (const el of candidates) if (!el.isConnected) { resize.unobserve(el); candidates.delete(el); }
    if (current && (!current.isConnected || (current.hasAttribute('data-tip-overflow') && !clipped(current)))) close();
  };
  const observer = new MutationObserver(records => {
    refresh();
    for (const r of records) if (r.attributeName === 'data-tip-open') {
      if (r.target.hasAttribute('data-tip-open')) show(r.target, false);
      else if (current === r.target) close();
    }
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['tabindex', 'data-tip-overflow', 'data-tip-open'] });
  refresh();
  root.addEventListener('focusin', e => {
    const el = e.target.closest?.('[data-tip-overflow]') || e.target.querySelector?.('[data-tip-overflow]');
    if (el) { clearTimeout(timer); show(el, false); }
  });
  root.addEventListener('focusout', e => {
    if (current?.hasAttribute('data-tip-overflow')) close();
  });
  root.addEventListener('keydown', e => {
    const el = e.target.closest?.('[data-tip-overflow][tabindex="0"]');
    if (el && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); clearTimeout(timer); show(el, false);
    }
  });
  doc.defaultView.addEventListener('pagehide', () => { observer.disconnect(); resize.disconnect(); clearTimeout(timer); }, { once: true });
  root.addEventListener('pointerover', e => {
    const el = e.target.closest?.('[data-tip]');
    if (el === current) return;
    clearTimeout(timer);
    if (!el || !el.dataset.tip || down || (el.hasAttribute('data-tip-overflow') && !clipped(el))) { if (tip) close(); return; }
    const group = tip || performance.now() - lastClose < ms(doc, '--delay-tooltip-group', 400);
    if (group) show(el, true);
    else { if (tip) close(); timer = setTimeout(() => show(el, false), ms(doc, '--delay-tooltip', 500)); }
  });
  root.addEventListener('pointerout', e => {
    const to = e.relatedTarget?.closest?.('[data-tip]');
    if (to) return;
    if (e.target.closest?.('[data-tip]')) close();
  });
  root.addEventListener('pointerdown', () => { down = true; close(); });
  doc.addEventListener('pointerup', () => { down = false; });
  doc.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  doc.defaultView.addEventListener('blur', close);
  doc.defaultView.addEventListener('resize', () => { refresh(); if (current) show(current, true); });
}
