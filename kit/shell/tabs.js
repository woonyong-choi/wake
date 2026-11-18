/*
 * Tab model. Each tab keeps its history (entries, index); closed tabs are kept with their history in closed (reopen).
 * History rules (shared by both hosts):
 *  - replace swaps the current entry and creates no new one.
 *  - navigating to the current address does nothing.
 *  - reopening a closed tab restores its history and position.
 * The desktop host keeps the real history in webContents; this model mirrors it (restore, palette).
 * Split views: splits [{ a, b, dir: 'h'|'v', ratio }] (b is null while the second pane waits for a tab).
 * Groups: groups [{ id, name, color, collapsed }]; a grouped tab carries group (the group's tabs stay next to each other in the list).
 * name: a name the user gave the tab; it is shown instead of the page title until cleared.
 * opener: the tab a page or tool tab was opened from. Back at the start of a tab's own history goes to its opener (while it is open).
 * toolDef: a tool tab's run-time tool ({ id, name, icon, partition, reopen? }); saved so a restored tab is named by it and can be opened again.
 * nav: an external tool tab's own history ({ canBack, canForward }) as the host reports it; the tool page moves in it by itself, so the
 * model keeps only whether a step is possible, not the addresses.
 */
let seq = 0;
const newId = () => `t${Date.now().toString(36)}${(++seq).toString(36)}`;

export function createTabs(initial) {
  /* overlays: a detail page shown over its source tab (never listed, saved or restored); they have their own history like a tab */
  const s = { tabs: [], active: null, closed: [], groups: [], splits: [], overlays: [] };
  const find = id => s.tabs.find(t => t.id === id) || s.overlays.find(t => t.id === id);

  function open(address, { kind = 'page', toolId = null, title = '', icon = null, activate = true, after = null, at = null, entries = null, index = null, pinned = false, group = null, name = '', opener = null, toolDef = null } = {}) {
    const tab = { id: newId(), kind, toolId, toolDef, opener, nav: null, entries: entries || [{ address, title }], index: index ?? 0, title, name, icon, loading: true, pinned, group, usedAt: activate ? Date.now() : 0 };
    const pos = at ?? (after ? s.tabs.findIndex(t => t.id === after) + 1 : s.tabs.length);
    s.tabs.splice(pos, 0, tab);
    if (activate) s.active = tab.id;
    return tab;
  }
  function close(id) {
    const i = s.tabs.findIndex(t => t.id === id);
    if (i < 0) return null;
    const [tab] = s.tabs.splice(i, 1);
    tab.closedAt = i; /* where it stood: a reopened tab goes back there */
    s.closed.push(tab);
    if (s.closed.length > 20) s.closed.shift();
    if (tab.group && !s.tabs.some(t => t.group === tab.group)) s.groups = s.groups.filter(g => g.id !== tab.group);
    s.splits = s.splits.filter(p => p.a !== id && p.b !== id);
    if (s.active === id) s.active = (s.tabs[i] || s.tabs[i - 1] || {}).id || null;
    return tab;
  }
  function reopen(id) {
    const i = id ? s.closed.findIndex(t => t.id === id) : s.closed.length - 1;
    const [tab] = i < 0 ? [] : s.closed.splice(i, 1);
    if (!tab) return null;
    tab.loading = true;
    s.tabs.splice(Math.min(tab.closedAt ?? s.tabs.length, s.tabs.length), 0, tab);
    delete tab.closedAt;
    s.active = tab.id;
    return tab;
  }
  const current = tab => tab.entries[tab.index];
  function push(id, address, { replace = false, title = '' } = {}) {
    const tab = find(id);
    if (!tab) return false;
    if (current(tab).address === address) return false;
    if (replace) tab.entries[tab.index] = { address, title };
    else { tab.entries = tab.entries.slice(0, tab.index + 1); tab.entries.push({ address, title }); tab.index++; }
    return true;
  }
  function go(id, delta) {
    const tab = find(id);
    if (!tab) return null;
    const i = tab.index + delta;
    if (i < 0 || i >= tab.entries.length) return null;
    tab.index = i;
    return current(tab).address;
  }
  function move(id, targetId, after) {
    const i = s.tabs.findIndex(t => t.id === id);
    if (i < 0) return;
    const [tab] = s.tabs.splice(i, 1);
    let j = s.tabs.findIndex(t => t.id === targetId);
    if (j < 0) j = s.tabs.length; else if (after) j++;
    s.tabs.splice(j, 0, tab);
  }
  const serialize = () => ({ tabs: s.tabs.map(t => ({ entries: t.entries, index: t.index, pinned: t.pinned, kind: t.kind, toolId: t.toolId, ...(t.toolDef ? { toolDef: t.toolDef } : {}), title: t.title, name: t.name, icon: t.icon, group: t.group })), active: s.tabs.findIndex(t => t.id === s.active), groups: s.groups });
  const splitOf = id => s.splits.find(p => p.a === id || p.b === id) || null;
  function restore(data) {
    if (!data || !Array.isArray(data.tabs) || !data.tabs.length) return false;
    for (const t of data.tabs) open(t.entries[t.index]?.address, { ...t, activate: false });
    s.active = (s.tabs[data.active] || s.tabs[0]).id;
    s.groups = (data.groups || []).filter(g => s.tabs.some(t => t.group === g.id));
    return true;
  }
  /* a step inside the tab's own history (d: -1 back, 1 forward) */
  const ownStep = (tab, d) => tab.kind === 'tool' ? !!(d < 0 ? tab.nav?.canBack : tab.nav?.canForward) : d < 0 ? tab.index > 0 : tab.index < tab.entries.length - 1;
  const openerOf = tab => (tab.opener && find(tab.opener) ? tab.opener : null);
  const overlayOf = sourceId => s.overlays.find(o => o.source === sourceId) || null;
  /* a source (tab or overlay) has at most one overlay; insert puts a new overlay between the source and the one on it; a second open replaces the overlay's root entry (the id stays).
     onTool: the overlay may sit on a tool tab too (the conversation beside a tool's own page; a detail only ever sits on an app page) */
  function openOverlay(sourceId, address, { insert = false, onTool = false } = {}) {
    const source = find(sourceId); // a tab, or an overlay (a detail opened from a detail: the chain)
    if (!source || !(source.kind === 'page' || onTool && source.kind === 'tool')) return null;
    const had = overlayOf(sourceId);
    if (had && !insert) { had.entries = [{ address, title: '' }]; had.index = 0; had.title = ''; had.loading = true; return had; }
    const overlay = { id: newId(), kind: 'page', overlay: true, source: sourceId, opener: null, nav: null, entries: [{ address, title: '' }], index: 0, title: '', name: '', icon: null, loading: true, pinned: false, group: null, usedAt: 0 };
    if (had) had.source = overlay.id; // insert: the overlay that sat on the source now sits on the new one
    s.overlays.push(overlay);
    return overlay;
  }
  /* an overlay moves to another source (the conversation follows the open tab) */
  const moveOverlay = (id, sourceId) => { const o = s.overlays.find(x => x.id === id); if (o) o.source = sourceId; };
  const closeOverlay = id => { const i = s.overlays.findIndex(o => o.id === id); if (i < 0) return null; const [o] = s.overlays.splice(i, 1); for (const x of s.overlays) if (x.source === id) x.source = o.source; return o; }; // the overlay on it sits on its source now
  /* what the person sees in the center: the active tab's overlay, else the active tab */
  const presented = () => { let a = find(s.active); for (let o; a && (o = overlayOf(a.id));) a = o; return a; }; // the last card of the chain
  if (initial) open(initial);
  return {
    state: s, find, open, close, reopen, push, go, move, current, serialize, restore, splitOf, ownStep, openerOf,
    overlayOf, openOverlay, moveOverlay, closeOverlay, presented,
    active: () => s.tabs.find(t => t.id === s.active),
    canBack: tab => tab.overlay || ownStep(tab, -1) || !!openerOf(tab), // back at an overlay's root closes it
    canForward: tab => ownStep(tab, 1),
  };
}
