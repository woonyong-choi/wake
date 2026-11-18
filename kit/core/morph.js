/*
 * Patches the children of an element to match new HTML instead of replacing them.
 * Elements that stay keep their identity, so CSS transitions run (indicators slide, switches move, hover stays),
 * focus and caret stay put, and a text field being composed with an input method (Korean and so on) is never touched.
 *
 * Rules
 *  - Children are matched by key (data-key, data-id, data-section, data-item, id) or else by position with the same tag.
 *  - Attributes are synced. Within the same component, a rendered element without a style attribute keeps inline behavior styles.
 *    Class tokens that only behavior code sets (LIVE_CLASSES) are kept.
 *  - input and textarea keep what the user typed; a field that is not focused takes the rendered value.
 *  - data-own-children: the children belong to behavior code (charts). They are kept while the attributes are equal.
 *  - A component (data-c) or a summary row whose rendered markup is the same as the last time is left as it is, with what behavior code wrote
 *    into it (a fitted row, hidden overflow, a measured width): a redraw that changes nothing there does not undo that work and make it run again
 *    (which showed as a flicker on every clock tick).
 */
const KEYS = ['data-key', 'data-id', 'data-section', 'data-item', 'id'];
const LIVE_CLASSES = ['wraps', 'panning', 'selecting', 'has-text', 'multi', 'hover', 'pressed', 'dragging', 'drag-shift', 'morph-active', 'cb-folded', 'cb-seen', 'cb-one', 'cb-two', 'cb-shown', 'settled', 'fitted', 'is-offscreen', 'is-related'];

const keyOf = n => {
  if (n.nodeType !== 1) return null;
  for (const k of KEYS) { const v = n.getAttribute(k); if (v) return k + '=' + v; }
  return null;
};
const same = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.tagName === b.tagName && keyOf(a) === keyOf(b)));

function syncAttrs(o, n) {
  const keepStyle = !n.hasAttribute('style') && o.getAttribute('data-c') === n.getAttribute('data-c');
  for (const a of [...o.attributes]) {
    if (n.hasAttribute(a.name)) continue;
    if (a.name === 'style' && keepStyle) continue;
    o.removeAttribute(a.name);
  }
  for (const a of n.attributes) {
    if (a.name === 'class') {
      const live = LIVE_CLASSES.filter(c => o.classList.contains(c));
      const next = live.length ? [a.value, ...live.filter(c => !n.classList.contains(c))].join(' ') : a.value;
      if (o.getAttribute('class') !== next) o.setAttribute('class', next);
      continue;
    }
    if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
  }
}

// Length and two independent 32-bit accumulators avoid retaining nested serialized subtrees.
function signature(source) {
  let first = 2166136261, second = 5381;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${source.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

function patch(o, n) {
  if (o.nodeType !== 1) { if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue; return; }
  const doc = o.ownerDocument;
  const field = o.tagName === 'TEXTAREA' || o.tagName === 'INPUT';
  if (field && o === doc.activeElement) { if (o.isComposing || o.dataset.composing) return; }
  const unit = n.hasAttribute('data-c') || n.tagName === 'SUMMARY', src = unit ? signature(n.outerHTML) : null;
  if (unit && o._morphSrc === src && o.isConnected) return;
  o._morphSrc = src;
  if (o.hasAttribute('data-own-children')) {
    const dynamic = (n.getAttribute('data-own-attrs') || '').split(' ').filter(Boolean);
    if (dynamic.length && o.getAttribute('data-own-attrs') === n.getAttribute('data-own-attrs')) {
      const stable = [...o.attributes, ...n.attributes].every(a => {
        if (dynamic.includes(a.name)) return true;
        if (a.name === 'class') return [...o.classList].filter(c => !LIVE_CLASSES.includes(c)).join(' ') === n.className;
        return o.getAttribute(a.name) === n.getAttribute(a.name);
      });
      if (stable) { syncAttrs(o, n); return; }
    }
    const equal = o.attributes.length === n.attributes.length && [...n.attributes].every(a => o.getAttribute(a.name) === a.value);
    if (equal) return;
    o.replaceWith(n); return;
  }
  syncAttrs(o, n);
  if (field) {
    if (o !== doc.activeElement && o.tagName === 'INPUT' && o.type !== 'checkbox' && o.type !== 'radio' && o.value !== n.value) o.value = n.value;
    return;
  }
  patchChildren(o, n);
}

function patchChildren(op, np) {
  const olds = [...op.childNodes];
  const byKey = new Map();
  for (const c of olds) { const k = keyOf(c); if (k && !byKey.has(k)) byKey.set(k, c); }
  const used = new Set();
  let cursor = 0;
  const news = [...np.childNodes];
  news.forEach((n, i) => {
    let match = null;
    const k = keyOf(n);
    if (k) { const c = byKey.get(k); if (c && !used.has(c) && same(c, n)) match = c; }
    else {
      while (cursor < olds.length && (used.has(olds[cursor]) || keyOf(olds[cursor]))) cursor++;
      const c = olds[cursor];
      if (c && same(c, n)) { match = c; cursor++; }
    }
    let node;
    if (match) { used.add(match); patch(match, n); node = match.isConnected && match.parentNode === op ? match : n; if (node === n) used.add(n); }
    else node = n;
    const at = op.childNodes[i];
    if (at !== node) op.insertBefore(node, at || null);
  });
  for (const c of olds) if (!used.has(c) && c.parentNode === op) c.remove();
  while (op.childNodes.length > news.length) op.lastChild.remove();
}

/* Behavior code that changes what a render owns (a pressed tab's aria-selected) calls this on the changed element: the next redraw of el and of
   every component around it patches again even when its markup is the same as the last time, so the rendered value wins over the local change */
export function invalidate(el) {
  for (let n = el; n; n = n.parentElement) delete n._morphSrc;
}

/** Makes el's children match html. Returns el */
export function morph(el, html) {
  const tpl = el.ownerDocument.createElement('template');
  tpl.innerHTML = String(html);
  patchChildren(el, tpl.content);
  return el;
}

/* Marks text fields while an input method is composing, so a redraw in that moment leaves them alone */
export function trackComposition(doc) {
  doc.addEventListener('compositionstart', e => { if (e.target.dataset) e.target.dataset.composing = '1'; }, true);
  doc.addEventListener('compositionend', e => { if (e.target.dataset) delete e.target.dataset.composing; }, true);
}
