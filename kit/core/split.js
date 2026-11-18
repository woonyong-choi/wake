/*
 * Resizing side-by-side panes by the gap between them: the one drag the shell uses between its cards, and the same for a page's own panes.
 *   dragSplit(e, { container, index, weights, vertical, min, onMove, onEnd }): starts a drag from a pointerdown on the handle after pane `index`.
 *     weights are the panes' shares (they sum to 1); only the two panes beside the handle change, each keeping at least `min` of the room.
 *     onMove(weights) on every move, onEnd(weights) once when the pointer is let go.
 *   attachSplitPanes(root, { min, onChange }): for a page. A container [data-split="<id>"] (data-split-dir="h" for panes stacked top to bottom)
 *     holds panes and, between them, handles [data-split-handle="<index>"]. The shares are written on the container as --w0, --w1, ... (the page
 *     lays its panes out with them, e.g. flex: var(--w0) 1 0); the drag follows the pointer with no transition (class "dragging"), and
 *     onChange({ id, weights }) is called once at the end (the page keeps them, e.g. as a setting). Without shares on the container the panes'
 *     drawn sizes are read.
 */

/** split the room between two neighbours at the pointer: pure, for tests */
export function resizeShares(weights, index, at, min = 0.14) {
  const w = weights.slice(), before = w.slice(0, index).reduce((x, y) => x + y, 0), both = w[index] + w[index + 1];
  w[index] = Math.min(both - min, Math.max(min, at - before)); w[index + 1] = both - w[index];
  return w;
}

export function dragSplit(e, { container, index, weights, vertical = true, min = 0.14, onMove, onEnd }) {
  e.preventDefault();
  const doc = container.ownerDocument, r = container.getBoundingClientRect();
  let w = weights.slice();
  const move = ev => {
    const at = vertical ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height;
    w = resizeShares(weights, index, at, min);
    onMove?.(w);
  };
  const up = () => { doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', up); onEnd?.(w); };
  doc.addEventListener('pointermove', move); doc.addEventListener('pointerup', up);
}

export function attachSplitPanes(root, { min = 0.14, onChange } = {}) {
  root.addEventListener('pointerdown', e => {
    const h = e.target.closest?.('[data-split-handle]'), box = h?.closest('[data-split]');
    if (!h || !box) return;
    const vertical = box.dataset.splitDir !== 'h';
    const panes = [...box.children].filter(c => !c.matches('[data-split-handle]'));
    const own = panes.map((_, k) => parseFloat(box.style.getPropertyValue('--w' + k)));
    const sizes = panes.map(p => (vertical ? p.getBoundingClientRect().width : p.getBoundingClientRect().height)), total = sizes.reduce((a, b) => a + b, 0) || 1;
    const weights = own.every(Number.isFinite) && Math.abs(own.reduce((a, b) => a + b, 0) - 1) < 0.01 ? own : sizes.map(s => s / total);
    const write = w => w.forEach((x, k) => box.style.setProperty('--w' + k, x.toFixed(4)));
    box.classList.add('dragging');
    dragSplit(e, { container: box, index: Number(h.dataset.splitHandle) || 0, weights, vertical, min, onMove: write,
      onEnd: w => { box.classList.remove('dragging'); write(w); onChange?.({ id: box.dataset.split, weights: w }); } });
  });
}
