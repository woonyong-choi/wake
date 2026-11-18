import { invalidate } from './morph.js';

/* Moves the selection indicator (pill, underline) to the selected tab. The first placement does not animate */
export function placeIndicator(wrap, indSel) {
  const on = wrap.querySelector('[aria-selected="true"]'), ind = wrap.querySelector(indSel);
  if (!on || !ind || !on.offsetWidth) return; // do not place while hidden (placed again once visible)
  const first = !ind.style.width;
  if (first) ind.style.transition = 'none';
  ind.style.left = on.offsetLeft + 'px';
  ind.style.width = on.offsetWidth + 'px';
  if (first) { ind.getBoundingClientRect(); ind.style.transition = ''; }
}

/* Tab group behavior: pressing changes the selection and moves the indicator. Re-placed whenever a tab's own size changes (an icon, a count or a
   badge that arrives or changes, a font that loads), the group's size changes, or the window is resized: the indicator never keeps a stale width */
export function attachTabs(root, wrapSel, tabSel, indSel) {
  const doc = root.ownerDocument || root;
  let queued = false;
  const seen = new WeakSet();
  const ro = new ResizeObserver(() => all());
  const all = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; doc.querySelectorAll(wrapSel).forEach(w => { if (!seen.has(w)) { seen.add(w); ro.observe(w); } w.querySelectorAll(tabSel).forEach(t => { if (!seen.has(t)) { seen.add(t); ro.observe(t); } }); placeIndicator(w, indSel); }); }); };
  root.addEventListener('click', e => {
    const b = e.target.closest(tabSel);
    if (!b) return;
    const w = b.closest(wrapSel);
    w.querySelectorAll('[role="tab"]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    invalidate(w); // a redraw that keeps the previous value takes the selection back
    placeIndicator(w, indSel);
  });
  ro.observe(doc.documentElement);
  new MutationObserver(records => {
    if (records.some(record => {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (target?.closest(wrapSel)) return true;
      return [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches(wrapSel) || node.querySelector(wrapSel)));
    })) all();
  }).observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-selected'] });
  doc.fonts?.ready?.then(all);
  all();
}
