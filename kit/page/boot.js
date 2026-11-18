/*
 * Page start. Called from the document of one tab.
 *   bootPage(config, createPage, { scroll: false }) opts out of scrolling the mount when the page provides its own scroller.
 *   createPage(ctx) -> { render(): html, actions?: {}, menus?: {}, dialogs?: {}, contextMenus?: {}, meta?(): PageMeta, onSettings?(values), screen? }
 *   screen: the screen declaration (screen.js): bootPage keeps its state, wires its set actions and redraws on a change
 * Menus and dialogs the page does not define come from the app (config.menus, config.dialogs) with { settings } as their state.
 * ctx = { config, desktop, route, params, query, address, data, api, t, text, icon, settings(), pageIdentity(), update(),
 *         state(), setState(patch, { ai? }), resetAi(key?), aiApplied(), screen() }   (the screen calls answer empty until the page declares one)
 * api = { navigate(address, {newTab, replace}), openPanel({prompt, context}), openTool(toolId, path, title), toast(p), notify(p), updateNotice(id, p), dismissNotice(id), contextMenu(items, x, y), setMeta(meta), setSetting(key, value) }
 */
import { setLocales, useLocale, resolveLocale, t } from '../core/i18n.js';
import { text, localizeMenu, normalizePageMenu } from '../core/text.js';
import { createRouter } from '../core/routes.js';
import { validate, errorScreen } from '../core/validate.js';
import { extendGlyphs, extendIcons, icon } from '../icons/icons.js';
import { addAllStyles, attachAll, components as C } from '../components/index.js';
import { noticeText } from '../components/notice.js';
import { addStyles } from '../core/style.js';
import { createBridgeClient } from './bridge-client.js';
import { morph, trackComposition } from '../core/morph.js';
import { shortcutOf } from '../core/keys.js';
import { KIT_DEFAULTS } from '../core/settings-store.js';
import { createScreen } from './screen.js';
import { onService } from '../core/service.js';

const ZOOM_KEYS = { 'kit.zoom.in': 'mod+=', 'kit.zoom.out': 'mod+-', 'kit.zoom.reset': 'mod+0' };
/* The detail bar's buttons (components/detail-bar.js) as the shell's page:detail ops; the size button says the other state. Another kit.detail.* name is no button: nothing */
const DETAIL_OPS = { 'kit.detail.back': () => 'back', 'kit.detail.close': () => 'close', 'kit.detail.toggle': expanded => (expanded ? 'collapse' : 'expand') };
export const detailOp = (name, expanded) => DETAIL_OPS[name]?.(!!expanded) ?? null;


export async function bootPage(config, createPage, { root = document.getElementById('page'), scroll = true } = {}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  if (scroll) root.dataset.scroll = 'content';
  else root.classList.add('page-with-own-scroll');
  doc.documentElement.classList.add('is-page');
  if (config.icons?.glyphs) extendGlyphs(config.icons.glyphs);
  if (config.icons?.map) extendIcons(config.icons.map);
  setLocales(config.locales);
  // until the shell says (shell:init), the language setting stored for the app (a page opened on its own keeps it)
  doc.documentElement.lang = useLocale(resolveLocale((() => { try { return JSON.parse(win.localStorage.getItem(`${config.id}:settings`) || '{}')['kit.locale']; } catch { return undefined; } })(), config.defaultLocale));
  addAllStyles(doc);
  trackComposition(doc);
  const bridge = createBridgeClient(win);
  if (win.kitBridge) doc.documentElement.classList.add('is-desktop');
  const report = e => bridge.send('page:error', { message: String(e?.message || e), stack: e?.stack ? String(e.stack) : undefined });
  win.addEventListener('error', e => report(e.error || e.message));
  win.addEventListener('unhandledrejection', e => report(e.reason));

  const problems = validate(config);
  if (problems.length) { root.innerHTML = errorScreen(t('error.config'), problems); return; }
  const router = createRouter(config);
  const address = win.__KIT_ADDRESS || new URLSearchParams(win.location.search).get('a') || win.location.href;
  const match = router.parse(address) || { route: null, params: {}, query: {} };
  let settingsValues = {};
  let pageIdentity = null;
  let desktopInfo = null; // the desktop host's picture and capabilities (shell:init, shell:desktop)
  let shortcuts = [];
  let initialized = bridge.standalone;
  /* the desktop answers what the first drawing needs at once (kitBridge.boot): the page draws without waiting for the shell's init, which
     follows and is the authority. A detail route waits (the shell says whether it is drawn as a card, with its bar) */
  const early = !bridge.standalone && typeof win.kitBridge?.boot === 'function' && !(config.detailPresentation?.routes || []).includes(match.route?.id) ? (() => { try { return win.kitBridge.boot(); } catch { return null; } })() : null;
  let drawn = false, stale = false; // draw(): whether the page has been drawn once, and whether a drawing is owed to a hidden document
  let drawPending = false;
  let detailBar = null;
  const detailRoutes = config.detailPresentation?.routes || [];
  const wantsDetail = (to, o) => {
    if (o.newTab || o.replace || o.presentation || !detailRoutes.length || detailRoutes.includes(match.route?.id)) return false; // a detail's own links navigate inside it; the conversation card's links open a detail
    try { return typeof to === 'string' && router.isInternal(to) && detailRoutes.includes(router.parse(to)?.route?.id); } catch { return false; }
  };
  const api = {
    action: (name, payload = {}) => bridge.send('page:action', { name, arg: payload.arg, on: payload.on, values: payload.values }),
    // presentation: 'detail' asks the shell to open the address as a detail overlay over this page (it falls back to a plain navigation where that does not apply)
    // An ordinary same-tab link to a config.detailPresentation route asks for that overlay by itself (the shell still decides: it falls back to a plain navigation).
    // Not asked for: newTab/replace, an explicit other presentation, from a detail route's own page or overlay (detail -> event -> logs stays as it is).
    navigate: (to, o = {}) => bridge.send('page:navigate', { address: to, newTab: !!o.newTab, replace: !!o.replace, ...(o.presentation === 'detail' || wantsDetail(to, o) ? { presentation: 'detail' } : {}) }),
    openPanel: (o = {}) => bridge.send('page:open-panel', o),
    openTool: (toolId, path, title) => bridge.send('page:open-tool', typeof toolId === 'object' ? { tool: toolId, url: path, title } : { toolId, path, title }), // or ({ id, name, icon, partition }, url): a tool found at run time
    toast: p => bridge.send('page:toast', { ...p, title: text(p.title), body: p.body ? text(p.body) : undefined }),
    notify: p => bridge.send('page:notify', { op: 'show', notice: noticeText(p, text) }),
    updateNotice: (id, p) => bridge.send('page:notify', { op: 'update', id, notice: noticeText(p, text) }),
    dismissNotice: id => bridge.send('page:notify', { op: 'dismiss', id }),
    contextMenu: (items, x, y) => bridge.request('page:context-menu', { items: items.map(i => i.type ? { type: i.type } : { id: i.id, label: text(i.label), enabled: !i.disabled, checked: i.checked }), x, y }).then(p => p?.id),
    setMeta: meta => bridge.send('page:meta', meta),
    dictate: () => bridge.send('page:dictate', {}),
    setSetting: (key, value) => { settingsValues = { ...settingsValues, [key]: value }; if (key === 'kit.timeZone') showZone(); bridge.send('page:setting-set', { key, value }); },
  };
  const ctx = {
    config, router, desktop: !!win.kitBridge, route: match.route, params: match.params, query: match.query, address, data: config.data, api, t, text, icon,
    settings: () => settingsValues, pageIdentity: () => pageIdentity, desktopInfo: () => desktopInfo, update: () => { if (page) requestDraw(); },
    state: () => screen?.state() ?? {}, setState: (patch, o) => screen?.setState(patch, o) ?? [], resetAi: key => screen?.resetAi(key) ?? false,
    aiApplied: () => screen?.aiApplied() ?? [], screen: () => screen?.decl ?? null,
  };
  let page, screen = null, prepared = false;
  /* the zone every time on the page is written in (the kit.timeZone setting), on the document as data-time-zone: charts and timelines read it there */
  /* written only when it changes: charts redraw every plate on a change of either (the same value written again is still a mutation) */
  const setData = (key, value) => { if (value !== undefined && doc.documentElement.dataset[key] !== value) doc.documentElement.dataset[key] = value; };
  const showZone = () => setData('timeZone', settingsValues['kit.timeZone'] ?? config.settings?.defaults?.['kit.timeZone'] ?? KIT_DEFAULTS['kit.timeZone'] ?? 'system');
  showZone();
  const pageState = () => ({ settings: { ...KIT_DEFAULTS, ...(config.settings?.defaults || {}), ...settingsValues } });
  try { page = await createPage(ctx); if (page.screen) { screen = createScreen(page.screen, () => ctx.update()); page.actions = { ...screen.actions, ...page.actions }; } if (page.css) addStyles([{ name: 'page', css: page.css }], doc); await page.init?.(); prepared = true; } catch (e) { report(e); root.innerHTML = errorScreen(t('error.config'), [String(e.message || e)]); return; }
  /* a page nobody can see is not drawn again: the first drawing always happens, later ones wait (as one) until the document is shown */
  function draw() { if (!initialized) return; if (drawn && doc.hidden) { stale = true; return; } drawn = true; stale = false; morph(root, page.render()); page.afterRender?.(root); }
  function requestDraw() {
    if (!initialized || !prepared) return;
    if (drawn && doc.hidden) { stale = true; return; }
    if (drawPending) return;
    /* the first drawing waits for nothing but the current task; later updates (answers arriving in several tasks) wait for the next frame and draw once */
    const schedule = drawn && typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame.bind(win) : typeof win.queueMicrotask === 'function' ? win.queueMicrotask.bind(win) : null;
    if (!schedule) { draw(); return; }
    drawPending = true;
    schedule(() => { drawPending = false; draw(); });
  }
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden && stale) draw(); });
  /* AI screen relay (config.ai.screenRelay { event, reply }): the app's main process asks the shown page to read or set its declared screen
     (only the `ai` keys, each a removable chip) or to open a pane beside it (a detail, the report). A hidden page, a detail and a page with
     no screen declaration stay silent; the first answer wins */
  const relay = config.ai?.screenRelay;
  if (relay && screen) onService((event, p) => {
    if (event !== relay.event || doc.hidden || detailBar || typeof p?.request !== 'string') return;
    if (p.op === 'get') relay.reply({ request: p.request, value: { view: pageIdentity?.address ?? null, state: ctx.state(), ai: screen.decl.ai ?? [] } });
    if (p.op !== 'set') return;
    const applied = p.patch && typeof p.patch === 'object' ? ctx.setState(p.patch, { ai: true }) : [];
    if (typeof p.open === 'string') api.navigate(p.open, { presentation: 'detail' });
    relay.reply({ request: p.request, value: { view: pageIdentity?.address ?? null, applied, chips: ctx.aiApplied().map(x => x.key), open: p.open ?? null } });
  });

  /* A detail overlay page (shell:init presentation 'detail'): back, expand and close are drawn above the page, outside #page (a redraw never touches them) */
  let detailExpanded = false; // (detailBar is declared above, before api)
  const drawDetailBar = () => { if (detailBar) detailBar.innerHTML = C.detailBar.render({ label: t('detail.label'), back: t('detail.back'), expand: t('detail.expand'), collapse: t('detail.collapse'), close: t('detail.close'), expanded: detailExpanded }).s; };
  function mountDetail() {
    if (detailBar) return;
    doc.documentElement.classList.add('is-detail');
    detailBar = doc.createElement('div'); detailBar.style.display = 'contents';
    root.parentNode.insertBefore(detailBar, root);
    drawDetailBar();
  }
  const detailAction = name => { const op = detailOp(name, detailExpanded); if (detailBar && op) bridge.send('page:detail', { op }); };
  // Escape closes the overlay unless a field, menu or dialog is using it
  doc.addEventListener('keydown', e => {
    if (!detailBar || e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || doc.querySelector('.menu, .dlg-layer, .pal')) return;
    bridge.send('page:detail', { op: 'close' });
  });

  // Component behavior: menus and actions inside the page are handled by the page; what the shell needs goes over the bridge
  const parts = attachAll(doc, {
    /* a page dialog dims the whole window: the page dims its own view, the shell the rest (sidebar, top bar, other cards) */
    onOverlay: (on, el, o) => { if (o?.owner === 'dialog') bridge.send('page:scrim', { on: !!on, strong: !!el?.classList?.contains('confirm') }); },
    emit: (name, payload = {}) => {
      const f = page.actions?.[name];
      if (f) { const r = f(payload, ctx); if (r?.then) r.catch(report); return; }
      if (name === 'kit.navigate') return api.navigate(payload.arg.address, payload.arg);
      if (name === 'kit.setting.set') return api.setSetting(payload.arg.key, payload.arg.value);
      if (name === 'kit.shortcuts.suspend') return bridge.send('page:shortcuts-suspend', { on: !!payload.on });
      if (name.startsWith('kit.')) return; // shell-side actions are not handled here
      if (config.actions?.[name]) return api.action(name, payload); // app actions run in the shell
      console.error(`unknown action: ${name}`);
    },
    resolveMenu: (id, arg, el) => normalizePageMenu(page.menus?.[id]?.(arg, ctx, el)) || localizeMenu(config.menus?.[id]?.(arg, pageState(), api)) || null,
    resolveDialog: (id, arg, el) => page.dialogs?.[id]?.(arg, ctx, el) || config.dialogs?.[id]?.(arg, pageState(), api) || null,
    resolveContext: (kind, arg, el) => page.contextMenus?.[kind]?.(arg, ctx, el) || null,
    nativeMenu: win.kitBridge ? async (items, pos) => api.contextMenu(items, pos.x, pos.y) : null,
  });
  doc.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.closest('.menu') || el.matches('[data-menu]') || el.matches('button.sw')) return;
    const arg = el.dataset.arg ? JSON.parse(el.dataset.arg) : undefined;
    const name = el.dataset.action;
    const f = page.actions?.[name];
    if (f) f({ arg }, ctx);
    else if (name === 'kit.navigate') api.navigate(arg.address, arg);
    else if (name.startsWith('kit.detail.')) detailAction(name);
    else if (name === 'kit.dialog.open' && !el.closest('.dlg-layer')) parts.emit(name, { arg, trigger: el }); // a page button that opens a dialog (kit.dialog.open { id, arg }) opens it in this page
    else if (ZOOM_KEYS[name]) bridge.send('page:shortcut', { keys: ZOOM_KEYS[name] }); // zoom bubble buttons run the shell's zoom keys
    else if (config.actions?.[name]) api.action(name, { arg }); // an app action on a page button runs in the shell
  });
  // Registered shortcuts go to the shell (plain typing in inputs stays local)
  doc.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) && e.key !== 'Escape') return;
    const k = shortcutOf(e);
    if (shortcuts.includes(k)) { e.preventDefault(); bridge.send('page:shortcut', { keys: k }); }
  });
  /* the tab title and chip (page:meta), in the page's language at the time. Sent at load and again when the shell's language
     arrives (shell:init, which can differ from the stored one the page started in) or changes (shell:locale); only the latest is sent */
  let metaSeq = 0;
  const sendMeta = async () => { const seq = ++metaSeq; const m = await page.meta?.(); if (m && seq === metaSeq) api.setMeta(m); };
  bridge.on(msg => {
    const p = msg.payload;
    if (msg.type === 'shell:init' && !pageIdentity && p.appId === config.id &&
        typeof p.tabId === 'string' && p.tabId.trim() && typeof p.address === 'string' && p.address.trim()) {
      pageIdentity = Object.freeze({ appId: p.appId, tabId: p.tabId, address: p.address });
    }
    if (msg.type === 'shell:init') { if (p.locale) doc.documentElement.lang = useLocale(p.locale); desktopInfo = p.desktopInfo || null; setData('theme', p.theme); settingsValues = p.settings || {}; showZone(); shortcuts = p.shortcuts || []; page.onSettings?.(settingsValues); if (p.handoff) page.onHandoff?.(p.handoff); initialized = true; draw(); sendMeta(); }
    if (msg.type === 'shell:init' && p.presentation === 'detail') mountDetail();
    // the shell's word on a detail: for the detail page its size state (expanded or beside its list); for the list, that its detail opened or closed
    if (msg.type === 'shell:ask-context') page.onAskContext?.(p.context);
    if (msg.type === 'shell:scrim' && p.op === 'close') parts.emit('kit.dialog.cancel', {}); // the shell's part of the dimming was pressed: the dialog closes as with its own // the page the open conversation is about changed
    if (msg.type === 'shell:detail') {
      if (detailBar && p.state === 'open' && !doc.documentElement.classList.contains('detail-in')) doc.documentElement.classList.add('detail-in'); // placed beside its list: the content slides in once
      if (detailBar) {
        detailExpanded = !!p.expanded;
        drawDetailBar();
      }
      page.onDetail?.(p);
    }
    if (msg.type === 'shell:theme') setData('theme', p.theme);
    if (msg.type === 'shell:desktop') { desktopInfo = p.info || null; draw(); }
    if (msg.type === 'shell:locale') { doc.documentElement.lang = useLocale(p.locale); page.onLocale?.(); draw(); sendMeta(); }
    if (msg.type === 'shell:settings') { settingsValues = p.values; showZone(); if (p.shortcuts) shortcuts = p.shortcuts; page.onSettings?.(settingsValues); }
    if (msg.type === 'shell:reload') win.location.reload();
    if (msg.type === 'shell:zoom') { // zoom bubble and level pill (zoom-indicator.js), drawn at the page's own scale
      let z = doc.querySelector('[data-zoom-layer]');
      if (!p.bubble && !p.hud) { z?.remove(); return; }
      if (!z) { z = doc.createElement('div'); z.dataset.zoomLayer = ''; doc.body.appendChild(z); }
      z.innerHTML = C.zoomIndicator.render(p).s;
    }
  });
  if (bridge.standalone) doc.documentElement.dataset.theme = doc.documentElement.dataset.theme || 'dark';
  if (early && !page.onHandoff) { // a page that takes a handoff (a conversation opened with a prompt) waits for the shell's init, which carries it
    if (early.locale) doc.documentElement.lang = useLocale(early.locale);
    if (early.theme) doc.documentElement.dataset.theme = early.theme;
    if (early.appId === config.id && typeof early.tabId === 'string' && early.tabId) pageIdentity = Object.freeze({ appId: early.appId, tabId: early.tabId, address });
    settingsValues = { ...KIT_DEFAULTS, ...(config.settings?.defaults || {}), ...(early.settings || {}) }; showZone();
    page.onSettings?.(settingsValues);
    initialized = true;
  }
  draw();
  await sendMeta();
  // drawn: said once the drawing has reached the screen (two frames), so the window or pane waiting for it never shows an empty card;
  // a hidden document gets no frames and says it at once (the pane keeps its previous tab over it until then)
  if (drawn && !doc.hidden && typeof win.requestAnimationFrame === 'function') await new Promise(r => win.requestAnimationFrame(() => win.requestAnimationFrame(r)));
  bridge.send('page:ready', { drawn });
  return { ctx, page };
}
