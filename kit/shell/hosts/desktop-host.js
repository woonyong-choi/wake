/*
 * Desktop host: one main-process WebContentsView per tab. Reports where each visible tab sits (the content slot, or the two pane slots of a
 * split view: setPanes) and the corner radius so each view sits on top of its slot.
 * The real history (back, forward) lives in webContents; the tabs model mirrors it.
 * When a shell menu or the palette overlaps the content slot, the tab view is swapped for a snapshot and hidden briefly (native views draw above the shell document).
 * OS menu item icons: an item's icon slot is drawn here as a PNG at the screen scale (only its shape counts: the OS colors it as a template image).
 * quality:drawing (the kit icon itself, rasterized for the OS menu).
 */
import { icon } from '../../icons/icons.js';

export function createDesktopHost({ doc, bridge, entryUrl, onMessage, onState, radius }) {
  let slot = null, active = null, shots = [], frozen = null, panes = null, observer;
  let detail = null; // the cards beside the open tab: { id (the view that is the open page), under: [the other views placed] } (active is the overlay while it is open: it is the page the services and shortcuts act for)
  const owners = new Set(); // what holds the overlay (a menu, a dialog, the palette, a preview card): the view comes back when none does
  bridge.on('tab-message', (tabId, msg) => onMessage(tabId, msg));
  bridge.on('tab-state', (tabId, st) => onState(tabId, st));

  const rect = el => {
    const r = el.getBoundingClientRect();
    // the view sits inside its card: the left and top round up, the right and bottom round down, so it never covers the card's outline (drawn just outside the card)
    const x = Math.ceil(r.left), y = Math.ceil(r.top);
    return { x, y, width: Math.floor(r.right) - x, height: Math.floor(r.bottom) - y };
  };
  let raf = 0, suspended = false, placed = '';
  // while a full-window screen covers the frame (first run) no tab view is shown; the same places are not sent again
  const place = () => {
    const list = suspended ? [] : (panes || [{ id: active, el: slot }]).filter(p => p.id).map(p => ({ id: p.id, rect: rect(p.el) })), r = radius(), key = JSON.stringify([list, r]);
    if (key === placed) return;
    placed = key; bridge.invoke('tabs:layout', list, r);
  };
  const relayout = () => {
    if (!slot || raf) return;
    raf = requestAnimationFrame(() => { raf = 0; place(); });
  };
  const thaw = () => {
    const pending = frozen; frozen = null;
    for (const shot of shots.splice(0)) shot.remove();
    if (pending) for (const id of pending.ids) bridge.invoke('tabs:thaw', id);
  };
  const pngs = new Map();
  const iconPng = name => {
    if (!pngs.has(name)) pngs.set(name, (async () => {
      const scale = doc.defaultView.devicePixelRatio || 1, size = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--icon')) * scale;
      const svg = icon(name).s.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" `);
      const img = new Image(); img.src = 'data:image/svg+xml,' + encodeURIComponent(svg); await img.decode();
      const c = doc.createElement('canvas'); c.width = c.height = size; c.getContext('2d').drawImage(img, 0, 0, size, size);
      return { png: c.toDataURL('image/png'), scale };
    })());
    return pngs.get(name);
  };
  const withIcons = list => Promise.all(list.map(async it => ({ ...it, icon: it.icon ? await iconPng(it.icon) : undefined, submenu: it.submenu ? await withIcons(it.submenu) : undefined })));
  return {
    kind: 'desktop',
    mount(el) {
      slot = el;
      observer = new ResizeObserver(relayout);
      observer.observe(slot);
      doc.defaultView.addEventListener('resize', relayout);
      doc.addEventListener('scroll', event => {
        if (event.target.contains?.(slot)) relayout();
      }, { capture: true, passive: true });
      // follow slot changes while the sidebar opens or closes and a side card slides in: only a box that can move the slot (one of its
      // containers or a box beside one), never a spinner or a button inside a row
      const follow = e => { if (!e.target?.parentElement?.contains(slot)) return; const t0 = performance.now(); const step = () => { relayout(); if (performance.now() - t0 < 400) requestAnimationFrame(step); }; step(); };
      doc.addEventListener('transitionrun', follow); doc.addEventListener('animationstart', follow);
      relayout();
    },
    /* opts.history { entries: [address], index }: a reopened tab's own pages, so back and forward work in it as before it closed */
    create(tabId, address, opts = {}) { bridge.invoke('tabs:create', tabId, entryUrl(address) || address, { tool: opts.tool || opts.toolId || null,
      ...(opts.history ? { history: { entries: opts.history.entries.map(a => entryUrl(a) || a), index: opts.history.index } } : {}) }); relayout(); },
    navigate(tabId, address, opts = {}) { onState(tabId, { loading: true }); bridge.invoke('tabs:navigate', tabId, entryUrl(address) || address, { replace: !!opts.replace }); },
    back(tabId) { bridge.invoke('tabs:back', tabId); },
    forward(tabId) { bridge.invoke('tabs:forward', tabId); },
    reload(tabId) { bridge.invoke('tabs:reload', tabId); },
    show(tabId) { const changed = active !== tabId; active = tabId; bridge.invoke('tabs:show', tabId); if (changed) thaw(); relayout(); },
    /* split view: [{ id, el }] per pane (id null for a pane without a tab yet), or null for the single content slot */
    setPanes(list) {
      for (const { el } of panes || []) if (el !== slot && !list?.some(pane => pane.el === el)) observer.unobserve(el);
      for (const { el } of list || []) if (el !== slot && !panes?.some(pane => pane.el === el)) observer.observe(el);
      panes = list;
      relayout();
    },
    /* the cards beside the open tab, in the order they sit: [tab, ...cards]. The focus view becomes the open page (the owner of service reads); the
       others are placed beside it and never shown alone (showing the tab would put its view above the cards). The shell places them with setPanes.
       refocus: the keyboard goes to the focus view (a card closed). One view alone is the plain open tab. */
    setCards(ids, focus, { refocus = false } = {}) {
      const top = focus && ids.includes(focus) ? focus : ids[ids.length - 1];
      const under = ids.filter(id => id !== top);
      if (!under.length) {
        detail = null;
        if (frozen) thaw();
        active = top;
        bridge.invoke('tabs:show', top);
        if (refocus) bridge.invoke('tabs:focus', top);
        relayout();
        return;
      }
      detail = { id: top, under };
      active = top;
      bridge.invoke('tabs:show', top, { under });
      if (refocus) { if (frozen) thaw(); bridge.invoke('tabs:focus', top); relayout(); }
    },
    destroy(tabId) { bridge.invoke('tabs:close', tabId); if (frozen?.ids.includes(tabId)) thaw(); },
    send(tabId, env) { bridge.invoke('tabs:send', tabId, env); },
    broadcast(env) { bridge.invoke('tabs:broadcast', env); },
    openTool() { return true; },
    async setOverlay(on, el, { focus = true, owner = 'overlay' } = {}) {
      if (on) {
        const r = el?.getBoundingClientRect(), s = slot.getBoundingClientRect();
        const hits = !r || !(r.right < s.left || r.left > s.right || r.bottom < s.top || r.top > s.bottom);
        if (!hits) return;
        owners.add(owner);
        if (frozen) { if (focus) bridge.invoke('shell:focus'); return frozen.ready; }
        // with a detail overlay open both views (overlay and the list under it) draw above the shell: each gets frozen and its picture placed at its pane
        const pending = frozen = { id: active, ids: detail ? [detail.id, ...detail.under] : [active] };
        pending.ready = (async () => {
          const urls = await Promise.all(pending.ids.map(id => bridge.invoke('tabs:freeze', id, focus)));
          if (frozen !== pending) return; // the overlay closed while the picture was taken
          if (urls[0] == null) { frozen = null; return; } // no such tab
          urls.forEach((url, i) => {
            if (!url) return; // hidden without a picture
            const shot = doc.createElement('img'); shot.src = url; shot.alt = '';
            const pane = detail && panes?.find(p => p.id === pending.ids[i])?.el;
            if (pane) {
              const r = pane.getBoundingClientRect(), s = slot.getBoundingClientRect();
              shot.style.cssText = `position:absolute;left:${r.left - s.left}px;top:${r.top - s.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none`;
            } else shot.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
            slot.appendChild(shot); shots.push(shot);
          });
        })();
        return pending.ready;
      } else {
        owners.delete(owner);
        if (!frozen || owners.size) return; // another overlay still covers the view (closing a menu under the quit question keeps it hidden)
        thaw();
      }
    },
    relayout,
    // hiding goes out at once: under a tab view the shell document counts as covered and gets no animation frame until the views are gone
    suspend(on) { suspended = !!on; if (on) { cancelAnimationFrame(raf); raf = 0; placed = JSON.stringify([[], radius()]); bridge.invoke('tabs:layout', [], radius()); } else relayout(); },
    focus: () => bridge.invoke('shell:focus'),
    focusTab: tabId => bridge.invoke('tabs:focus', tabId), // the keyboard goes to a page view (an overlay that just opened)
    contextMenu: async (items, pos) => bridge.invoke('menu:popup', await withIcons(items), pos),
    preview: tabId => bridge.invoke('tabs:preview', tabId),
    zoom: (tabId, factor, o) => bridge.invoke('tabs:zoom', tabId, factor ?? null, o?.initial ? { initial: true } : null),
    mute: (tabId, on) => bridge.invoke('tabs:mute', tabId, on),
  };
}
