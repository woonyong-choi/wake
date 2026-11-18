/*
 * Overlay scroll area for every [data-scroll] element. The native bar is hidden, so a bar never takes layout space
 * and content never shifts when overflow starts or stops.
 * Bar: 16 wide track (transparent) with a 7 thick pill in the border color, 8 in from the scroller's outer side.
 * It is invisible at rest and fades in (opacity 150ms) while scrolling, while dragging, and (content, panel and nav
 * scrollers) while the pointer is over its 16px strip. The sidebar scroller draws no bar (measured on the reference). It fades out 500ms after scrolling stops. Vertical and horizontal.
 * The bar takes pointer input only while shown, so the strip never blocks content at rest.
 * The thumb travels the whole track: 8 from each end, as on the reference (measured from the content card border). Where a rounded corner clips the scroller (its own
 * radius, or in a desktop tab page the native view's rounded corners, --r-window) the track end moves in just far enough
 * that the round cap stays whole inside the curve.
 */
export const name = 'scroll-area';
export const hook = 'data-scroll';

export const css = `
[data-scroll] { scrollbar-width: none; overscroll-behavior: contain; }
[data-scroll="x"] { overscroll-behavior-y: auto; }
[data-scroll]::-webkit-scrollbar { display: none; }
.sa-bar { position: fixed; z-index: var(--z-thumb); display: flex; opacity: 0; pointer-events: none; touch-action: none; user-select: none; transition: opacity var(--dur-fast) var(--ease-standard); }
.sa-bar.v { width: var(--scrollbar-w); padding: var(--scroll-inset) var(--scroll-inset) var(--scroll-inset) 0; justify-content: flex-end; }
.sa-bar.h { height: var(--scrollbar-w); padding: 0 var(--scroll-inset) var(--scroll-inset); flex-direction: column; justify-content: flex-end; }
.sa-bar.live.on, .sa-bar.live.hot { opacity: 1; pointer-events: auto; }
.sa-thumb { flex: none; border-radius: var(--r-pill); background: var(--border); position: relative; }
.sa-bar.v .sa-thumb { width: var(--scroll-thumb-w); }
.sa-bar.h .sa-thumb { height: var(--scroll-thumb-w); }
`;

const px = v => parseFloat(v) || 0;
const BARLESS = ['sidebar'];

/* Offset of the track from a corner of radius r so that a thumb of thickness w, pad in from the side and pad from the track end,
   keeps its round cap inside the corner curve. 0 when the corner does not reach the thumb */
const clear = (r, w, pad) => {
  const h = w / 2, c = pad + h;
  if (r <= c) return 0;
  const t = r - h - Math.sqrt((r - h) ** 2 - (r - c) ** 2);
  return Math.max(0, Math.ceil(t - pad));
};

export function attach(root) {
  const doc = root.ownerDocument || root;
  const win = doc.defaultView;
  const tracked = new Map(); // el -> { v, h, timer }
  const cache = {};
  const token = n => (cache[n] ??= px(getComputedStyle(doc.documentElement).getPropertyValue(n)));

  const makeBar = (el, axis) => {
    const bar = doc.createElement('div'); bar.className = 'sa-bar ' + axis; bar.setAttribute('aria-hidden', 'true');
    const th = doc.createElement('div'); th.className = 'sa-thumb'; bar.appendChild(th); doc.body.appendChild(bar);
    th.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      th.setPointerCapture(e.pointerId);
      const v = axis === 'v', p0 = v ? e.clientY : e.clientX, s0 = v ? el.scrollTop : el.scrollLeft;
      const ratio = v ? el.scrollHeight / el.clientHeight : el.scrollWidth / el.clientWidth;
      bar.classList.add('on');
      const mv = ev => { const d = ((v ? ev.clientY : ev.clientX) - p0) * ratio; if (v) el.scrollTop = s0 + d; else el.scrollLeft = s0 + d; };
      const up = () => { th.removeEventListener('pointermove', mv); th.removeEventListener('pointerup', up); hideLater(el); };
      th.addEventListener('pointermove', mv); th.addEventListener('pointerup', up);
    });
    bar.addEventListener('wheel', e => { el.scrollBy({ top: e.deltaY, left: e.deltaX }); }, { passive: true });
    bar.addEventListener('pointerleave', () => bar.classList.remove('hot'));
    return { bar, th };
  };
  const entry = el => {
    let t = tracked.get(el);
    if (!t) { t = { v: makeBar(el, 'v'), h: makeBar(el, 'h'), timer: null }; tracked.set(el, t); }
    return t;
  };
  const drop = el => { const t = tracked.get(el); if (!t) return; t.v.bar.remove(); t.h.bar.remove(); clearTimeout(t.timer); tracked.delete(el); };

  /* Places both bars over el. Returns whether any axis overflows */
  const place = el => {
    if (!el.isConnected) { drop(el); return false; }
    if (BARLESS.includes(el.dataset.scroll)) return false;
    const oy = el.scrollHeight > el.clientHeight + 1, ox = el.scrollWidth > el.clientWidth + 1;
    if (!oy && !ox && !tracked.has(el)) return false;
    const t = entry(el), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const w = token('--scrollbar-w'), pad = token('--scroll-inset'), tw = token('--scroll-thumb-w');
    const vis = r.width > 0 && r.height > 0;
    // corner radii that clip this scroller: its own, and the native view's corners where the scroller meets them
    const vr = win.kitBridge ? token('--r-window') : 0, vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
    const at = (x, y) => vr && Math.abs(r[x] - (x === 'right' ? vw : 0)) < 1 && Math.abs(r[y] - (y === 'bottom' ? vh : 0)) < 1 ? vr : 0;
    const corner = (prop, x, y) => Math.max(px(cs[prop]), at(x, y));
    // vertical
    t.v.bar.classList.toggle('live', oy && vis);
    if (oy && vis) {
      const top = clear(corner('borderTopRightRadius', 'right', 'top'), tw, pad), bottom = (ox ? w : clear(corner('borderBottomRightRadius', 'right', 'bottom'), tw, pad));
      const len = r.height - top - bottom, track = len - 2 * pad;
      const size = Math.max(token('--scroll-thumb-min'), track * el.clientHeight / el.scrollHeight);
      Object.assign(t.v.bar.style, { left: r.right - w + 'px', top: r.top + top + 'px', height: len + 'px' });
      t.v.th.style.height = size + 'px';
      t.v.th.style.top = (track - size) * el.scrollTop / (el.scrollHeight - el.clientHeight) + 'px';
    } else t.v.bar.classList.remove('on');
    // horizontal
    t.h.bar.classList.toggle('live', ox && vis);
    if (ox && vis) {
      const left = clear(corner('borderBottomLeftRadius', 'left', 'bottom'), tw, pad), right = (oy ? w : clear(corner('borderBottomRightRadius', 'right', 'bottom'), tw, pad));
      const len = r.width - left - right, track = len - 2 * pad;
      const size = Math.max(token('--scroll-thumb-min'), track * el.clientWidth / el.scrollWidth);
      Object.assign(t.h.bar.style, { left: r.left + left + 'px', top: r.bottom - w + 'px', width: len + 'px' });
      t.h.th.style.width = size + 'px';
      t.h.th.style.left = (track - size) * el.scrollLeft / (el.scrollWidth - el.clientWidth) + 'px';
    } else t.h.bar.classList.remove('on');
    return oy || ox;
  };
  const hideLater = el => {
    const t = tracked.get(el); if (!t) return;
    clearTimeout(t.timer);
    t.timer = setTimeout(() => { t.v.bar.classList.remove('on'); t.h.bar.classList.remove('on'); }, token('--delay-scrollbar-hide') || 500);
  };
  const onScroll = el => {
    if (!place(el)) return;
    const t = tracked.get(el);
    if (t.v.bar.classList.contains('live')) t.v.bar.classList.add('on');
    if (t.h.bar.classList.contains('live')) t.h.bar.classList.add('on');
    hideLater(el);
  };

  doc.addEventListener('scroll', e => {
    const el = e.target.closest?.('[data-scroll]');
    if (el === e.target) onScroll(el);
    all(); // bars of other scrollers move with their scrolled ancestors
  }, true);
  // Pointer over the 16px strip of a content scroller reveals its bar (the bar then takes the pointer)
  const HOVER = ['content', 'panel', 'nav'];
  const hot = (bar, on) => bar.classList.toggle('hot', on);
  root.addEventListener('pointermove', e => {
    const el = e.target.closest?.('[data-scroll]');
    if (!el || !HOVER.includes(el.dataset.scroll)) return;
    if (!place(el)) return;
    const t = tracked.get(el), r = el.getBoundingClientRect(), w = token('--scrollbar-w');
    hot(t.v.bar, t.v.bar.classList.contains('live') && e.clientX >= r.right - w);
    hot(t.h.bar, t.h.bar.classList.contains('live') && e.clientY >= r.bottom - w);
  });
  let queued = false;
  function all() {
    if (queued) return; queued = true;
    win.requestAnimationFrame(() => {
      queued = false;
      for (const el of [...tracked.keys()]) place(el);
    });
  }
  new win.ResizeObserver(all).observe(doc.documentElement);
  new win.MutationObserver(all).observe(doc.body, { childList: true, subtree: true });
  win.addEventListener('resize', all);
  all();
}
