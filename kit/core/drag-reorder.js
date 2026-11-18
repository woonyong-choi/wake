/*
 * Drag to reorder, shared by sidebar rows and pinned tiles: items matching `sel` with the same data-drag-group. A move over 4px starts a drag.
 * The dragged item follows the pointer (both axes when the items form a grid, vertical in a list) and gets .dragging; the others get
 * .drag-shift and slide to the places they take while it moves (measured on the reference for tab rows and pinned tiles).
 * Dropping emits 'reorder' { group, id, target, after }; the click that ends a drag does not run the item's action.
 */
export function dragReorder(root, ctx, sel, { skip = null } = {}) {
  let drag = null;
  const clear = d => { for (const i of d.items) { i.classList.remove('dragging', 'drag-shift'); i.style.transform = ''; } };
  root.addEventListener('pointerdown', e => {
    const el = e.target.closest(`${sel}[data-drag-group]`);
    if (!el || e.button !== 0 || (skip && e.target.closest(skip))) return;
    drag = { el, x: e.clientX, y: e.clientY, active: false };
  });
  root.addEventListener('pointermove', e => {
    const d = drag;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
      d.active = true;
      d.items = [...root.querySelectorAll(`${sel}[data-drag-group="${d.el.dataset.dragGroup}"]`)];
      d.rects = d.items.map(i => i.getBoundingClientRect());
      d.from = d.to = d.items.indexOf(d.el);
      d.grid = new Set(d.rects.map(r => Math.round(r.top))).size < d.rects.length;
      d.el.classList.add('dragging');
      for (const i of d.items) if (i !== d.el) i.classList.add('drag-shift');
    }
    const r0 = d.rects[d.from], span = k => [Math.min(...d.rects.map(r => r[k])) - r0[k], Math.max(...d.rects.map(r => r[k])) - r0[k]];
    const [x0, x1] = span('left'), [y0, y1] = span('top');
    const dx = d.grid ? Math.max(x0, Math.min(x1, e.clientX - d.x)) : 0, dy = Math.max(y0, Math.min(y1, e.clientY - d.y));
    d.el.style.transform = `translate(${dx}px, ${dy}px)`;
    const px = r0.left + r0.width / 2 + dx, py = r0.top + r0.height / 2 + dy;
    const dist = r => Math.hypot(r.left + r.width / 2 - px, r.top + r.height / 2 - py);
    d.to = d.rects.reduce((best, r, i) => (dist(r) < dist(d.rects[best]) ? i : best), 0);
    const order = d.items.filter(i => i !== d.el);
    order.splice(d.to, 0, d.el);
    order.forEach((it, j) => {
      if (it === d.el) return;
      const a = d.rects[d.items.indexOf(it)], b = d.rects[j];
      it.style.transform = a.left !== b.left || a.top !== b.top ? `translate(${b.left - a.left}px, ${b.top - a.top}px)` : '';
    });
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.active) return;
    clear(d);
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
    root.addEventListener('click', swallow, { capture: true });
    setTimeout(() => root.removeEventListener('click', swallow, { capture: true }), 0);
    if (d.to !== d.from) ctx.emit('reorder', { group: d.el.dataset.dragGroup, id: d.el.dataset.id, target: d.items[d.to].dataset.id, after: d.to > d.from });
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
}
