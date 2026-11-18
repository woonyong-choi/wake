/*
 * Browser host: one same-origin iframe per tab in the content slot (alive as long as the tab).
 * The tabs model keeps history; the iframe only moves with location.replace so browser history stays clean.
 * Loading: from setting the address until the page sends page:ready.
 * External tool pages open in a new browser tab, not as a tab (noopener, noreferrer).
 */
import { accept } from '../../core/bridge-protocol.js';

export function createIframeHost({ doc, entryUrl, pageOf, onMessage, onState }) {
  const bundled = doc.defaultView.__KIT_PAGES || null; // single-file bundle: page HTML lives here
  let slot = null;
  const frames = new Map(); // tabId -> iframe
  let shown = [];
  const overlayOwners = new Map();
  const css = `.kit-frames { position: absolute; inset: 0; } .kit-frames:not(.split) { overflow-x: auto; } .kit-frames iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; visibility: hidden; color-scheme: normal; } .kit-frames iframe.on { visibility: visible; } .kit-frames:not(.split) iframe.on { min-width: calc(var(--panel-w) * var(--page-zoom, 0)); }`;
  const style = doc.createElement('style'); style.textContent = css; doc.head.appendChild(style);

  let paneList = null;
  const watched = new Set();
  const paneObserver = new doc.defaultView.ResizeObserver(() => { if (paneList) placePanes(); });
  function showOnly(tabId) { shown = [tabId]; for (const [id, f] of frames) { f.classList.toggle('on', id === tabId); f.style.inset = ''; f.style.width = ''; f.style.height = ''; } syncScrollFocus(); }
  function placePanes() {
    if (!slot || !paneList) return;
    const box = slot.getBoundingClientRect();
    shown = paneList.map(p => p.id).filter(Boolean);
    for (const [id, f] of frames) {
      const p = paneList.find(x => x.id === id);
      f.classList.toggle('on', !!p);
      if (!p) continue;
      const r = p.el.getBoundingClientRect();
      Object.assign(f.style, { inset: 'auto', left: `${r.left - box.left}px`, top: `${r.top - box.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    }
  }
  function syncScrollFocus() { if (slot) slot.tabIndex = slot.scrollWidth > slot.clientWidth ? 0 : -1; }

  doc.addEventListener('focusin', e => {
    if (slot?.contains(e.target)) return;
    const overlay = [...overlayOwners.values()].reverse().find(o => !o.el || o.el.contains(e.target));
    if (overlay) overlay.focus = e.target;
  });
  doc.addEventListener('blur', () => {
    queueMicrotask(() => {
      if (!doc.hasFocus() || ![...frames.values()].includes(doc.activeElement)) return;
      const overlay = [...overlayOwners.values()].reverse().find(o => o.focus?.isConnected && (!o.el || o.el.contains(o.focus)));
      overlay?.focus.focus({ preventScroll: true });
    });
  }, true);

  doc.defaultView.addEventListener('message', e => {
    if (!bundled && e.origin !== doc.defaultView.location.origin && e.origin !== 'null') return;
    const msg = accept(e.data);
    if (!msg) return;
    for (const [id, f] of frames) if (f.contentWindow === e.source) {
      if (msg.type === 'page:ready') onState(id, { loading: false });
      onMessage(id, msg);
      return;
    }
  });

  return {
    kind: 'iframe',
    mount(el) {
      slot = doc.createElement('div'); slot.className = 'kit-frames'; el.appendChild(slot);
      slot.dataset.scroll = 'x';
      slot.tabIndex = -1;
      new doc.defaultView.ResizeObserver(syncScrollFocus).observe(slot);
      for (const f of frames.values()) slot.appendChild(f);
    },
    create(tabId, address) {
      const f = doc.createElement('iframe');
      f.title = '';
      f.setAttribute('allow', 'clipboard-write');
      frames.set(tabId, f);
      if (slot) slot.appendChild(f);
      this.navigate(tabId, address);
      return f;
    },
    navigate(tabId, address) {
      const f = frames.get(tabId);
      if (!f) return;
      onState(tabId, { loading: true });
      if (bundled) {
        const page = bundled[pageOf(address)];
        if (!page) return;
        f.srcdoc = page.replace(/<meta charset="utf-8">/i, m => `${m}<script>window.__KIT_ADDRESS = ${JSON.stringify(address)};<\/script>`);
        return;
      }
      const url = entryUrl(address);
      if (!url) return;
      if (!f.src) f.src = url; else f.contentWindow.location.replace(url);
    },
    back(tabId, address) { this.navigate(tabId, address); },
    forward(tabId, address) { this.navigate(tabId, address); },
    reload(tabId) { const f = frames.get(tabId); if (!f) return; onState(tabId, { loading: true }); if (bundled) { const d = f.srcdoc; f.srcdoc = ''; f.srcdoc = d; } else f.contentWindow.location.reload(); },
    show(tabId) { showOnly(tabId); },
    /* split view or a detail overlay: each pane's frame is placed over its pane slot (frames are never moved in the DOM, which would reload them).
       The frames follow their slots when those change size (an overlay opening, the panel opening): relayout is otherwise a no-op here. */
    setPanes(list) {
      slot.classList.toggle('split', !!list);
      paneList = list;
      for (const el of watched) if (!list?.some(p => p.el === el)) { paneObserver.unobserve(el); watched.delete(el); }
      for (const { el } of list || []) if (!watched.has(el)) { paneObserver.observe(el); watched.add(el); }
      if (!list) { showOnly(shown[0]); return; }
      placePanes();
    },
    destroy(tabId) { const f = frames.get(tabId); if (f) f.remove(); frames.delete(tabId); },
    send(tabId, env) { const f = frames.get(tabId); const o = doc.defaultView.location.origin; f?.contentWindow?.postMessage(env, o === 'null' || bundled ? '*' : o); },
    broadcast(env) { for (const id of frames.keys()) this.send(id, env); },
    openTool(url) { doc.defaultView.open(url, '_blank', 'noopener,noreferrer'); return false; },
    setOverlay(on, el, { focus = true, owner = 'overlay' } = {}) {
      if (on && focus) {
        overlayOwners.set(owner, { el, focus: el?.contains(doc.activeElement) ? doc.activeElement : null });
      } else overlayOwners.delete(owner);
    },
    /* a detail overlay is one more pane the shell places with setPanes; showing it must not show only it (the list stays alive under it) */
    setCards() {},
    relayout() {},
    contextMenu: null,
    /* page zoom per tab: the frame document's zoom (same origin) */
    async zoom(tabId, factor) { const f = frames.get(tabId), d = f?.contentDocument?.documentElement; if (!d) return 1; if (factor > 0) { d.style.zoom = factor === 1 ? '' : String(factor); if (factor > 1) f.style.setProperty('--page-zoom', String(factor)); else f.style.removeProperty('--page-zoom'); syncScrollFocus(); } return parseFloat(d.style.zoom) || 1; },
    mute(tabId, on) { const d = frames.get(tabId)?.contentDocument; d?.querySelectorAll('audio, video').forEach(m => { m.muted = !!on; }); },
  };
}
