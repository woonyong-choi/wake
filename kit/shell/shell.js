/*
 * Shell: owns the window frame (sidebar, top path bar, content cards) and tabs.
 * Tab content is a page document (host: desktop view or iframe) that talks to the shell only through bridge messages.
 *
 * createShell(config, { root, appBase }) - config is the app definition (CONTRACTS.md).
 */
import { html, attrs } from '../core/html.js';
import { setLocales, useLocale, resolveLocale, t, locale } from '../core/i18n.js';
import { text, localizeMenu } from '../core/text.js';
import { createRouter } from '../core/routes.js';
import { validate, errorScreen, FEATURE_DEFAULTS } from '../core/validate.js';
import { createSettingsStore } from '../core/settings-store.js';
import { validateTerminalAppearance, applyTerminalAppearance } from '../core/terminal-appearance.js';
import { envelope, PROTOCOL } from '../core/bridge-protocol.js';
import { extendGlyphs, extendIcons, icon, hasIcon } from '../icons/icons.js';
import { components as C, addAllStyles, attachAll } from '../components/index.js';
import { noticeText } from '../components/notice.js';
import { createTabs } from './tabs.js';
import { morph, trackComposition } from '../core/morph.js';
import { shortcutOf } from '../core/keys.js';
import { dragSplit } from '../core/split.js';
import { createIframeHost } from './hosts/iframe-host.js';
import { createDesktopHost } from './hosts/desktop-host.js';
import { createTerminals, createTerminalOutputs } from './terminal.js';
import { effectiveShortcuts, defaultShortcuts } from '../core/shortcuts.js';
import { zoomStep } from '../core/zoom.js';
import { createUpdateControl } from './update-control.js';

export const KIT_VERSION = '0.1.0';

/** Render a bottom item; only an app-authenticated profile replaces its existing icon. */
export function sidebarBottomItem(item, state, api) {
  let name = null, src;
  try {
    const profile = typeof item.profile === 'function' ? item.profile(state, api) : null;
    if (profile?.authenticated === true && typeof profile.name === 'string') {
      const candidate = profile.name.trim();
      if (candidate && !/[\u0000-\u001f\u007f]/.test(candidate)) name = candidate;
      const image = profile.avatarUrl;
      if (name && typeof image === 'string' && image === image.trim() && !/[\s\\]/.test(image)) {
        if (/^https:\/\//i.test(image)) {
          const url = new URL(image);
          if (url.protocol === 'https:' && url.hostname && !url.username && !url.password) src = url.href;
        } else if (/^(?:\.\/)?assets\/(?:[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\/)*[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(image)) src = image;
      }
    }
  } catch {
    // An app profile provider must not prevent the sidebar from rendering.
  }
  if (!name) {
    return C.iconButton.render({ icon: item.icon, tip: text(item.tip), variant: 'native', size: 'sm', menu: item.menu, action: item.action, arg: item.arg });
  }
  return html`<button type="button" class="ib native sm"${attrs({ 'data-menu': item.menu, 'data-menu-arg': item.menu ? item.arg : null, 'aria-haspopup': item.menu ? 'menu' : null, 'data-action': item.action, 'data-arg': item.arg, 'aria-label': name, 'data-tip': name })}>${C.avatar.render({ name, src })}</button>`;
}

/** Normalize app-brand identity consistently, including explicit route identities. */
export function topbarIdentity(ident, brand, isTool = false) {
  if (!ident) return null;
  const label = text(ident.label);
  return { ...ident, label, hideLabel: !isTool && ident.icon === brand.mark && label === text(brand.name) };
}

/** Keeps imported previews separate from selected settings; only the current shell-issued ticket can be applied. */
export function createTerminalAppearanceControl({ call, settings, ownerOf = () => null, randomId = () => globalThis.crypto?.randomUUID?.() }) {
  const drafts = new Map(); let generation = 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  const failure = reason => ({ status: 'error', applied: false, reason });
  const owner = () => JSON.stringify(ownerOf());
  const basis = () => JSON.stringify(['kit.terminal.theme', 'kit.terminal.font', 'kit.terminal.appearances'].map(key => settings.get(key)));
  async function prepare(method, args) {
    const version = ++generation, sourceOwner = owner(), initial = basis(); drafts.clear();
    let result;
    try { result = await call(`kit.terminal.appearance.${method}`, args); } catch { return generation !== version ? { status: 'cancelled', reason: 'superseded' } : failure('service-failed'); }
    if (generation !== version) return { status: 'cancelled', reason: 'superseded' };
    if (owner() !== sourceOwner) return failure('owner-changed');
    if (!['ready', 'partial'].includes(result?.status)) {
      if (result?.status === 'cancelled') return { status: 'cancelled' };
      if (result?.status === 'no-data') return { status: 'no-data', unsupportedFields: result.unsupportedFields || [] };
      return failure(typeof result?.reason === 'string' && /^[a-z][a-z-]{0,63}$/.test(result.reason) ? result.reason : 'invalid-response');
    }
    const validated = validateTerminalAppearance(result.snapshot);
    if (!validated.snapshot) return failure('invalid-snapshot');
    const ticketId = randomId(); if (typeof ticketId !== 'string' || !ticketId) return failure('unavailable');
    drafts.set(ticketId, { result: validated, sourceOwner, initial, version });
    return { ...validated, snapshot: clone(validated.snapshot), ticketId };
  }
  return {
    async list() { try { return await call('kit.terminal.appearance.list', {}); } catch { return failure('service-failed'); } },
    async import(args) { return prepare('import', args); },
    async chooseFile(args) { return prepare('chooseFile', args); },
    async apply(ticketId, options = {}) {
      const draft = drafts.get(ticketId); if (!draft || draft.version !== generation) return failure('invalid-ticket');
      if (draft.sourceOwner !== owner()) return failure('owner-changed');
      if (draft.initial !== basis()) return failure('settings-changed');
      if (!options || typeof options !== 'object' || Array.isArray(options)) return failure('invalid-options');
      const fields = Object.entries(Object.getOwnPropertyDescriptors(options));
      if (!fields.every(([key, field]) => ['acceptPartial', 'colors', 'font', 'resetMissing'].includes(key) && Object.hasOwn(field, 'value'))) return failure('invalid-options');
      const chosen = { acceptPartial: false, colors: true, font: false, resetMissing: false, ...options };
      if (!Object.values(chosen).every(value => typeof value === 'boolean')) return failure('invalid-options');
      if (!chosen.colors && !chosen.font) return failure('nothing-selected');
      if (chosen.colors && !Object.keys(draft.result.snapshot.colors).length) return failure('no-colors');
      if (chosen.font && !draft.result.snapshot.font.family) return failure('no-font');
      const current = settings.all(), proposal = applyTerminalAppearance(current, draft.result, { acceptPartial: chosen.acceptPartial });
      if (!proposal.applied) return failure(proposal.reason);
      const id = draft.result.snapshot.id, patch = { 'kit.terminal.appearances': proposal.settings['kit.terminal.appearances'] };
      if (chosen.colors) patch['kit.terminal.theme'] = `imported:${id}`;
      else if (chosen.resetMissing) patch['kit.terminal.theme'] = 'app';
      if (chosen.font) patch['kit.terminal.font'] = `imported:${id}`;
      else if (chosen.resetMissing) patch['kit.terminal.font'] = 'app';
      try { settings.setMany(patch); } catch { return failure('commit-failed'); }
      drafts.delete(ticketId);
      return { status: 'applied', applied: true, snapshotId: id, selection: { theme: settings.get('kit.terminal.theme'), font: settings.get('kit.terminal.font') }, persistence: 'requested' };
    },
    async cancel(ticketId) {
      if (ticketId === undefined || drafts.has(ticketId)) { generation++; drafts.clear(); }
      return { status: 'cancelled', cancelled: true };
    },
  };
}

export async function createShell(config, { root = document.getElementById('app'), appBase = './' } = {}) {
  const doc = root.ownerDocument;
  const features = { ...FEATURE_DEFAULTS, ...(config.features || {}) };
  if (config.icons?.glyphs) extendGlyphs(config.icons.glyphs);
  if (config.icons?.map) extendIcons(config.icons.map);
  setLocales(config.locales);
  useLocale(config.defaultLocale);
  addAllStyles(doc);
  trackComposition(doc);
  const problems = validate(config);
  if (problems.length) { root.innerHTML = errorScreen(t('error.config'), problems); return null; }

  const desktop = doc.defaultView.kitShell || null;
  /* a second window (desktop window:new) starts with its own tabs: no session restore or save, optionally at the address it was given */
  const query = new URLSearchParams(doc.defaultView.location.search), secondWindow = query.has('window');
  const moved = (() => { try { return JSON.parse(query.get('open') || 'null'); } catch { return null; } })(); // { addresses, group } of a tab or group moved here
  if (desktop) doc.documentElement.classList.add('is-desktop');
  const router = createRouter(config);
  const settings = createSettingsStore(config.id, config.settings?.defaults, desktop ? desktop.settingsBackend : null);
  let sentMode = null, sentStyle = null;
  const applyTheme = () => {
    const mode = settings.get('kit.theme'), style = settings.get('kit.windowStyle');
    const dark = mode === 'system' ? doc.defaultView.matchMedia('(prefers-color-scheme: dark)').matches : mode !== 'light';
    doc.documentElement.dataset.theme = dark ? 'dark' : 'light';
    doc.documentElement.dataset.termTheme = settings.get('kit.terminal.theme') || 'app'; // the terminal's colors: the app's (light or dark) or a preset
    if (desktop && sentMode !== (mode || 'system')) { sentMode = mode || 'system'; desktop.invoke('theme:set', sentMode).catch(() => {}); } // window material (macOS vibrancy) follows the chosen theme
    if (desktop && style && sentStyle !== style) { sentStyle = style; desktop.invoke('window:style', style).catch(() => {}); } // window background (glass, material, color) of the chosen style
    return dark ? 'dark' : 'light';
  };
  let theme = applyTheme();
  /* language: kit.locale ('system' follows the system's preferred languages); a change applies to the shell, every tab document, the
     menu bar and floating surfaces at once (shell:locale, desktop locale:set) */
  const applyLocale = () => {
    const code = useLocale(resolveLocale(settings.get('kit.locale'), config.defaultLocale));
    doc.documentElement.lang = code;
    if (desktop) desktop.invoke('locale:set', code).catch(() => {});
    return code;
  };
  let localeCode = applyLocale();
  /* the desktop host's picture and capabilities (platform adapter): window style pictures draw the desktop picture, and styles the
     system cannot draw are shown unavailable; a browser has none */
  let desktopInfo = null;
  if (desktop) {
    const take = info => { const was = desktopInfo?.dev; desktopInfo = info || null; host?.broadcast(envelope('shell:desktop', { info: desktopInfo })); if (was !== desktopInfo?.dev) renderSidebar?.(); };
    desktop.invoke('desktop:info').then(take).catch(() => {});
    desktop.on('desktop', take);
  }

  /* ---------- State ---------- */
  /* shortcuts in effect: defaults with the user's changes (kit.shortcuts); a removed one has no keys */
  let shortcuts = [];
  const activeKeys = () => shortcuts.filter(s => s.keys).map(s => s.keys);
  function applyShortcuts() {
    shortcuts = effectiveShortcuts(config, settings.get('kit.shortcuts') || {});
    if (!desktop) return;
    desktop.invoke('shortcuts:set', activeKeys()).catch(() => {});
    // the menu bar shows the keys in effect: default keys -> { keys, action } for the changed ones
    const changed = Object.fromEntries(defaultShortcuts(config).map(d => [d, shortcuts.find(x => x.id === d.id)]).filter(([d, x]) => x && x.keys !== d.keys).map(([d, x]) => [d.keys, { keys: x.keys, action: x.action }]));
    desktop.invoke('menu:state', { keys: changed }).catch(() => {});
  }
  /* the start address as it is now: a function gets the stored settings (an app may start on what the person connected or viewed last). A new window,
     a new tab and the last tab closed all open it; there is no separate new-tab page */
  /* restoring: the place a restored tab on a gone page comes back on (an app may answer nothing: the tab is dropped) */
  const startAt = restoring => (typeof config.start === 'function' ? config.start({ settings: settings.all(), restoring: !!restoring }) : config.start);
  const tabs = createTabs(null);
  /* what a page needs that only the shell holds, by the page's address (a panel conversation opened as a tab); sent with shell:init */
  const handoffs = new Map();
  const state = {
    tabs: tabs.state, sidebarHidden: false,
    collapsed: settings.get('kit.collapsed') || {}, folders: {}, renaming: null, meta: {}, settings: settings.all(),
  };
  const data = config.data;
  const appearances = createTerminalAppearanceControl({
    call: (name, args) => desktop ? desktop.invoke('service:call', name, args) : Promise.reject(new Error('desktop unavailable')),
    settings, ownerOf: () => { const tab = tabs.presented(); return tab ? { tabId: tab.id, address: tabs.current(tab).address } : null; },
  });
  let updateView = null;
  const updates = desktop ? createUpdateControl({
    call: (name, args) => desktop.invoke('service:call', name, args),
    onChange: view => { updateView = view; renderSidebar(); },
    onError: () => api.toast({ title: 'update.failed' }),
  }) : null;

  /* ---------- Tab view host ---------- */
  const entryUrl = address => {
    const m = router.parse(address);
    if (!m) return null;
    const page = m.route ? m.route.page : (config.notFound || 'not-found');
    if (desktop) return address;
    return `${appBase}pages/${page}.html?a=${encodeURIComponent(address)}`;
  };
  const pageOf = address => { const m = router.parse(address); return m?.route ? m.route.page : (config.notFound || 'not-found'); };
  const hostOpts = {
    doc, entryUrl, pageOf,
    onMessage: (tabId, msg) => onPageMessage(tabId, msg),
    onState: (tabId, st) => { const tab = tabs.find(tabId); if (!tab) return; if ('loading' in st) tab.loading = st.loading; if (tab.kind === 'tool' && 'canBack' in st) { tab.nav = { canBack: !!st.canBack, canForward: !!st.canForward }; } if (st.title) tab.title = st.title; if (st.tint) tab.tint = st.tint;
      if ('toolDocument' in st && tab.toolDocument !== st.toolDocument) { tab.toolDocument = st.toolDocument; applyPanes(); }
      renderSidebar(); renderTopbar(); syncMenu(); },
  };
  const host = desktop ? createDesktopHost({ ...hostOpts, bridge: desktop, radius: () => parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--r-window')) || 0 }) : createIframeHost(hostOpts);
  /* showing another tab (or the same one again) while a detail is open: the detail ends first */
  const showHost = host.show.bind(host);
  host.show = id => { closeDetailCards(); showHost(id); };

  /* ---------- api ---------- */
  const api = {
    state, data, router, settings, features, t, text,
    navigate: (address, opts = {}) => navigate(address, opts),
    openTab: address => navigate(address, { newTab: true }),
    closeTab: id => closeTab(id),
    prepareTool,
    cancelPreparedTool: id => { if (tabs.find(id)?.preparingTool) closeTab(id, { unpin: true }); },
    /* open a runtime tool and return its tab id. With reuse, a changed reuseKey navigates the existing tab to the supplied URL. */
    openTool: (def, url, o) => { openTool(def, url, null, o); return tabs.state.active; },
    hasTab: id => !!tabs.find(id),
    /* a development run (browser, or a desktop app that is not packaged): development-only aids (debug menu) */
    get dev() { return !desktop || !!desktopInfo?.dev; },
    /* the system user the desktop app runs as (null in the browser) */
    get user() { return desktopInfo?.user || null; },
    get update() { return updates?.status || null; },
    /* open one of the app's dialogs (config.dialogs[id](arg)) */
    dialog: (id, arg) => { const def = config.dialogs?.[id]?.(arg, state, api); if (def) ctx.dialog.open(def); },
    toast: p => { placeToasts(); return ctx.toast.show({ ...p, title: text(p.title), body: p.body ? text(p.body) : '' }); },
    /* an alert that needs a person: a notice card at the top right (components/notice.js); notify with the id of one that is up updates it */
    notify: p => ctx.notice.notify(noticeText(p, text)),
    updateNotice: (id, p) => ctx.notice.update(id, noticeText(p, text)),
    dismissNotice: id => ctx.notice.dismiss(id),
    openPanel: (p = {}) => askCard(p), // ask the AI: a conversation opens as a card beside the one in front
    setSetting: (k, v) => settings.set(k, v),
    setSettings: values => settings.setMany(values),
    refresh: () => renderSidebar(),
    activeTab: () => tabs.active(),
    routeOf: tab => tab ? router.parse(tabs.current(tab).address) : null,
    /* the first-run screen: draw it again after the app changed what its steps show; check one card again */
    /* the terminal panel (config.terminal): the session key of the open tab (null where it cannot open) and whether it is shown */
    terminal: { key: () => termKey(), open: () => activeTerminalOpen(), appearance: appearances,
      beginOutput: identity => terms && dock ? terminalOutputs.begin(identity) : null,
      showOutput: (ticket, output) => terms && dock ? terminalOutputs.show(ticket, output) : { ok: false, shown: false, reason: 'unavailable' },
      closeOutput: ticket => terminalOutputs.close(ticket),
      /* run a command for the person in the terminal panel (desktop): the panel opens (over the first run too, under its step) and shows
         the command's own output; resolves with { exit } (null: cancelled or unavailable). close(key) hides it again (the app decides when) */
      run: async ({ key, title, command, env, onOutput, onInput }) => { /* command: { id, args, line, confirm } a command the app declared (desktop config commands); line is what the panel shows */
        if (!terms || !dock) return { exit: null, error: 'unavailable' };
        terminalOutputs.closeActive();
        state.run = { key, title }; syncDock();
        /* over the first run the panel takes room at the bottom: keep the row whose work started it in view */
        if (firstRun) revealRow(() => frLayer?.querySelector('.fs-it.run')?.closest('.sr-item[data-key]'));
        const r = await terms.run(key, command, { env, onOutput, onInput });
        return r;
      },
      cancel: key => terms?.cancel(key),
      close: key => { if (state.run?.key !== key) return; state.run = null; syncDock(); } },
    firstRun: { render: () => refreshFirstRun(), recheck: ids => { const st = firstRun && frSteps()[firstRun.index]; if (st?.kind === 'checks') startChecks(st, ids); }, active: () => !!firstRun, results: id => firstRun?.checks[id]?.results || {},
      /* a checks step: 'checking' while any item is being checked, else 'done' */
      phase: id => (firstRun?.checks[id]?.running ? 'checking' : 'done'),
      /* close a connect row (its work is done); its head then shows the row status */
      fold: row => { if (!firstRun) return; firstRun.open = firstRun.open.filter(x => x !== row); renderFirstRun(); },
      /* bring a connection row into view (its flow stopped or needs the person), after its body has opened */
      reveal: id => { if (firstRun) revealRow(() => frLayer?.querySelector(`.sr-item[data-key="${CSS.escape(id)}"]`)); },
      /* connect rows the person opened (their forms show) */
      opened: () => firstRun?.open || [] },
  };

  /* bring a first-run row into view: once its body has opened, and again once the terminal panel under the step has taken
     its room (the scroll area is shorter then) */
  function revealRow(find) {
    const go = () => find()?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    setTimeout(go, cssMs('--motion-enter-dur')); setTimeout(go, cssMs('--motion-enter-dur') * 2);
  }

  /* ---------- Tab actions ---------- */
  /* tools the app opens at run time (an address found while running, own partition per tool id): api.openTool, page:open-tool { tool } */
  const liveTools = [];
  const toolsAll = () => [...(config.tools || []), ...liveTools];
  function matchesToolOrigin(address, origin) {
    try { return /^https?:\/\//.test(address) && new URL(address).origin === origin; } catch { return false; }
  }
  const toolOf = id => toolsAll().find(x => x.id === id) || { id, name: { raw: id }, icon: 'globe' };
  function prepareTool(def, opener) {
    if (!desktop || !features.externalTools) return null;
    const existing = tabs.state.tabs.find(tab => tab.kind === 'tool' && tab.toolId === def.id && !tab.unloaded && !tab.preparingTool);
    if (existing) { activate(existing.id); return null; }
    const waiting = tabs.state.tabs.find(tab => tab.kind === 'tool' && tab.toolId === def.id && tab.preparingTool); // a restored tab waiting for its tool
    if (waiting) return waiting.id;
    if (!liveTools.some(tool => tool.id === def.id)) liveTools.push(def);
    const tab = tabs.open('', { kind: 'tool', toolId: def.id, title: text(def.name), icon: def.icon, after: tabs.state.active, opener: opener || tabs.state.active, toolDef: def });
    tab.preparingTool = true;
    tab.toolDocument = 'loading';
    host.show(tab.id);
    render();
    return tab.id;
  }
  function openTool(def, address, opener = null, { reuse = false, reuseKey, preparedTabId } = {}) {
    /* a tool found at run time names its icon in data: an unknown one would stop the whole shell from drawing, so it shows as a page */
    const tool = { ...def, icon: hasIcon(def.icon) ? def.icon : 'globe', origin: new URL(address).origin };
    if (def.icon && !hasIcon(def.icon)) console.error(`unknown tool icon: ${def.icon}`);
    if (!/^https?:$/.test(new URL(address).protocol)) return;
    const prepared = preparedTabId && tabs.find(preparedTabId);
    if (preparedTabId && !prepared?.preparingTool) return;
    /* reuse: the same tool already open in a tab -> go to that tab instead of opening another (its page and sign-in stay as they are) */
    const open = reuse && tabs.state.tabs.find(x => {
      if (x.kind !== 'tool' || x.toolId !== tool.id || x.unloaded) return false;
      const current = tabs.current(x).address;
      return matchesToolOrigin(current, tool.origin);
    });
    if (open) {
      const keepFocus = prepared && prepared.id !== tabs.state.active;
      if (prepared) closeTab(prepared.id, { unpin: true });
      if (reuseKey !== undefined && reuseKey !== open.reuseKey) {
        open.reuseKey = reuseKey;
        tabs.push(open.id, address, { replace: true });
        host.navigate(open.id, address, { replace: true });
      }
      if (!keepFocus) activate(open.id);
      return;
    }
    const i = liveTools.findIndex(x => x.id === tool.id); if (i >= 0) liveTools.splice(i, 1); liveTools.push(tool);
    if (prepared) {
      prepared.preparingTool = false;
      prepared.toolId = tool.id;
      prepared.toolDef = def;
      prepared.reuseKey = reuseKey;
      tabs.push(prepared.id, address, { replace: true });
      host.create(prepared.id, address, { tool: { id: tool.id, origin: tool.origin, partition: tool.partition } });
      if (tabs.state.active === prepared.id) host.show(prepared.id);
      render(); saveSession();
      return;
    }
    const tab = navigate(address, { newTab: true, opener });
    if (tab) { tab.reuseKey = reuseKey; tab.toolDef = def; }
  }
  /* Where an address opens: a tool address always in a new tool tab (its opener is the tab it came from); an app address in the given or
     open tab, except a tool tab, which never loads app pages: there it goes to a tab already showing it, or a new tab. */
  function navigate(address, { newTab = false, replace = false, tabId = null, first = false, fresh = false, opener = null } = {}) {
    const tool = toolsAll().find(x => matchesToolOrigin(address, x.origin));
    if (!router.isInternal(address) && !tool) return;
    closeDetailCards(); // an ordinary navigation (sidebar, link, address) ends the overlay first: its list would otherwise load under it
    let tab = tabId ? tabs.find(tabId) : tabs.active();
    if (tool) {
      if (!features.externalTools) return;
      if (!desktop) { host.openTool(address); return; }
      tab = tabs.open(address, { kind: 'tool', toolId: tool.id, title: '', icon: tool.icon, after: tabs.state.active, opener: opener || tabs.state.active });
      host.create(tab.id, address, { toolId: tool.id, tool: liveTools.includes(tool) ? { id: tool.id, origin: tool.origin, partition: tool.partition } : null }); host.show(tab.id); render(); saveSession(); return tab;
    }
    if (tab?.kind === 'tool') { tab = null; newTab = true; }
    /* a conversation open as a full tab is not listed: opening it again brings that tab forward, never a second (unlisted) copy in the open tab */
    const once = newTab || router.parse(address)?.route?.kind === 'chat';
    const existing = (!tab || once) && !fresh ? tabs.state.tabs.find(x => x.kind !== 'tool' && tabs.current(x).address === address) : null;
    if (existing && once) { activate(existing.id); return; }
    if (!tab || newTab) {
      // a new blank tab goes to the top of the tab list or its end (setting kit.tab.position), below the pinned tiles
      const at = settings.get('kit.tab.position') === 'bottom' ? tabs.state.tabs.length : tabs.state.tabs.filter(x => x.pinned).length;
      tab = tabs.open(address, first ? { at } : { after: tabs.state.active, opener });
      host.create(tab.id, address); host.show(tab.id);
    } else if (tabs.push(tab.id, address, { replace })) {
      host.navigate(tab.id, address, { replace });
    }
    render(); saveSession();
  }
  /* ---------- Cards beside the body ----------
     The body (the open tab, against the sidebar) can have up to two more cards on its right: a detail and the AI conversation. The detail opens
     right after the body; the AI conversation is always the last card, so a detail opened while the conversation is open goes between the two
     (body | detail | AI), and with no conversation it is body | detail. Opening a detail again, or asking again, replaces that card's page. The body keeps
     its live document (filter, sort, page, scroll, selection, focus); each card is a page of its own for the owner checks of the services (the open page
     is the last card). The gaps between cards set the widths (remembered); expanded, one card takes the whole center. Only an address of
     config.detailPresentation.routes opens as a detail, from the body or from the conversation (the detail's own links navigate inside it). */
  const detailRoutes = config.detailPresentation?.routes || [];
  const chain = []; // [{ id, kind: 'detail' | 'ai', base, ready, expanded }] left to right: the detail (if open), then the conversation (if open)
  const detailSent = new Map();
  const DETAIL_RATIO = 0.42; // the body's share of the center when one card opens
  const DETAIL_THIRDS = [0.34, 0.33, 0.33];
  let applied = [1]; // the shares of the cards as drawn
  const detailOf = id => chain.find(d => d.id === id) || null;
  const cardOf = kind => chain.find(d => d.kind === kind) || null;
  const topDetail = () => chain[chain.length - 1] || null;
  /* the cards drawn beside the body: a card takes its place (at its final width, in one frame) once its page has drawn, so an empty card is
     never shown (sim: the pane comes at its share at once and only its content slides in) */
  const shownCards = () => chain.filter(d => d.ready);
  const CARD_READY_MS = 1500; // a card whose page never says it is ready (an error page) is placed anyway
  const detailRatio = () => { const r = Number(settings.get?.('kit.detail.ratio')); return r >= 0.2 && r <= 0.8 ? r : DETAIL_RATIO; };
  /* the cards' shares of the center (body first) for n cards */
  const weightsFor = n => {
    if (n < 2) return [1];
    if (n === 2) { const r = detailRatio(); return [r, 1 - r]; }
    const w = String(settings.get?.('kit.detail.ratio3') || '').split(',').map(Number);
    return w.length === 3 && w.every(x => x >= 0.1) && Math.abs(w[0] + w[1] + w[2] - 1) < 0.01 ? w : DETAIL_THIRDS;
  };
  /* a card can open beside this page: the open tab (not split) or a card of the chain. The conversation also opens beside a tool tab (an outside tool's own page,
     drawn by its own view): asking from there is the same card on the right, never the conversation in the body */
  const cardable = (source, kind = 'detail') => !!source && (source.kind === 'page' || kind === 'ai' && source.kind === 'tool' && !source.preparingTool) && !source.unloaded && (source.overlay ? !!detailOf(source.id) : source.id === tabs.state.active && !tabs.splitOf(source.id));
  const detailable = (address, source) => { const r = router.parse(address)?.route; return !!r && detailRoutes.includes(r.id) && router.isInternal(address) && cardable(source); };
  /* the views in the order they sit; the focus goes to one of them (the new card, or the last one left when a card closes) */
  const placeCards = (focus, o) => host.setCards?.([tabs.state.active, ...chain.map(d => d.id)], focus, o);
  function openCard(kind, address) {
    const base = tabs.state.active, had = cardOf(kind);
    if (had) { tabs.openOverlay(tabs.find(had.id).source, address); host.navigate(had.id, address); render(); return true; } // the card's root entry is replaced
    // the conversation sits on the last card, a detail on the body (and the conversation, if open, then sits on the detail)
    const overlay = tabs.openOverlay(kind === 'ai' ? (topDetail()?.id || base) : base, address, { insert: kind === 'detail', onTool: kind === 'ai' });
    if (!overlay) return false;
    const d = { id: overlay.id, kind, base, ready: false, expanded: false };
    if (kind === 'detail') chain.unshift(d); else chain.push(d);
    setTimeout(() => { if (chain.includes(d) && !d.ready) { d.ready = true; render(); } }, CARD_READY_MS);
    host.create(overlay.id, address);
    placeCards(d.id);
    if (kind === 'detail') host.send(base, envelope('shell:detail', { state: 'open' }));
    render();
    return true;
  }
  const openDetail = (source, address) => detailable(address, source) && openCard('detail', address);
  /* a card goes away at once (the keyboard goes to the last card left; the body learns its detail closed) */
  function dropDetail(d) {
    if (!chain.includes(d)) return;
    chain.splice(chain.indexOf(d), 1); detailSent.delete(d.id); detailSent.delete(d.id + ':ask');
    tabs.closeOverlay(d.id);
    terminalOutputs.release(d.id); // the overlay's own output owner: pending tickets, records and its terminal go with it
    host.destroy(d.id);
    placeCards(topDetail()?.id || tabs.state.active, { refocus: true });
    if (d.kind === 'detail' && tabs.find(d.base)) host.send(d.base, envelope('shell:detail', { state: 'closed' }));
  }
  /* a card closes at once: the cards left take their shares in the same frame */
  function closeDetailAt(d) {
    if (!d || !chain.includes(d)) return;
    dropDetail(d); render();
  }
  /* the detail ends with the page it was opened from; the conversation stays open until the person closes it, whatever page or tab is open */
  const closeDetailCards = () => { const d = cardOf('detail'); if (!d) return; dropDetail(d); render(); };
  /* the conversation follows the open tab (and sits on its detail, if one is open) */
  function settleCards() {
    const ai = cardOf('ai'), base = tabs.state.active;
    if (!ai || !base || ai.base === base) return;
    ai.base = base; tabs.moveOverlay(ai.id, cardOf('detail')?.id || base);
    placeCards(ai.id);
  }
  /* the conversation is told which page it is about whenever that changes: the detail in front of it, else the open tab */
  function syncAskContext() {
    const ai = cardOf('ai'); if (!ai?.ready) return;
    const front = cardOf('detail'), subject = front ? tabs.find(front.id) : tabs.find(tabs.state.active);
    const context = chipFor(subject), key = 'ask:' + JSON.stringify(context);
    if (detailSent.get(ai.id + ':ask') === key) return;
    detailSent.set(ai.id + ':ask', key);
    host.send(ai.id, envelope('shell:ask-context', { context }));
  }
  /* ask the AI: a new conversation opens as the last card (replacing the one open). The question and the page it was asked about (the detail, else the body) come with the card. */
  function askCard({ prompt, from } = {}) {
    const r = config.routes.find(x => x.kind === 'chat'); if (!r) return;
    const base = tabs.find(tabs.state.active);
    const subject = (from && tabs.find(from)?.kind === 'page' && from !== cardOf('ai')?.id && tabs.find(from)) || (cardOf('detail') ? tabs.find(cardOf('detail').id) : base);
    const address = router.build(r.id, { id: 'new' });
    handoffs.set(address, { ask: { prompt: prompt || '', context: chipFor(subject) } });
    if (cardable(base, 'ai') && openCard('ai', address)) return;
    navigate(address, { newTab: true });
  }
  function syncDetail() {
    for (const d of chain) {
      if (!d.ready) continue;
      const msg = { state: 'open', expanded: !!d.expanded }, key = JSON.stringify(msg);
      if (detailSent.get(d.id) !== key) { detailSent.set(d.id, key); host.send(d.id, envelope('shell:detail', msg)); }
    }
    syncAskContext();
  }
  /* navigation from inside an overlay stays in the overlay (never nests); a new tab or an outside address leaves it for a tab */
  function overlayNavigate(overlay, p) {
    if (p.newTab || !router.isInternal(p.address)) { navigate(p.address, { newTab: true, opener: overlay.source }); return; }
    if (tabs.push(overlay.id, p.address, { replace: p.replace })) { host.navigate(overlay.id, p.address, { replace: p.replace }); render(); }
  }
  /* back and forward: a step in the tab's own history (a tool tab steps in its page's history), else back to the tab it was opened from; at the root of an overlay back closes it */
  /* the top bar and its back, forward and reload belong to the body, or to the detail in front of it; the conversation card has its own bar */
  function navTab() { const d = cardOf('detail'); return d ? tabs.find(d.id) : tabs.active(); }
  function historyStep(d, tab = navTab()) {
    if (!tab) return;
    if (tab.overlay) {
      if (tabs.ownStep(tab, d)) { const ad = tabs.go(tab.id, d); if (d < 0) host.back(tab.id, ad); else host.forward(tab.id, ad); render(); }
      else if (d < 0) closeDetailAt(detailOf(tab.id));
      return;
    }
    if (tabs.ownStep(tab, d)) {
      if (tab.kind === 'tool') { if (d < 0) host.back(tab.id); else host.forward(tab.id); return; }
      const ad = tabs.go(tab.id, d); if (d < 0) host.back(tab.id, ad); else host.forward(tab.id, ad); render(); saveSession(); return;
    }
    const o = d < 0 && tabs.openerOf(tab); if (o) activate(o);
  }
  function activate(id) {
    const tab = tabs.find(id); if (!tab) return;
    if (tab.unloaded) { tab.unloaded = false; tab.loading = true; host.create(id, tabs.current(tab).address, { toolId: tab.toolId }); } // a closed pinned tile loads its page again
    tabs.state.active = id; tab.usedAt = Date.now(); host.show(id); render(); saveSession();
  }
  /* closing a pinned tab keeps its tile and only unloads the page (measured); the tab list's first tab opens in its place */
  function unloadPinned(tab) {
    if (cardOf('detail')?.base === tab.id) closeDetailCards();
    terminalOutputs.release(tab.id);
    host.destroy(tab.id); tab.unloaded = true; tab.loading = false;
    if (tabs.state.active !== tab.id) { render(); saveSession(); return; }
    const next = tabs.state.tabs.find(x => !x.pinned) || tabs.state.tabs.find(x => !x.unloaded);
    if (next) activate(next.id); else navigate(startAt(), { newTab: true });
  }
  function closeTab(id, { unpin = false } = {}) {
    const pinned = tabs.find(id);
    if (pinned?.pinned && !unpin) { if (!pinned.unloaded) unloadPinned(pinned); return; }
    if (cardOf('detail')?.base === id) closeDetailCards();
    const tab = tabs.close(id);
    if (!tab) return;
    terminalOutputs.release(id);
    if (!tab.unloaded) host.destroy(id);
    if (!tabs.state.tabs.some(x => !x.unloaded)) navigate(startAt(), { newTab: true });
    else host.show(tabs.state.active);
    render(); saveSession();
  }
  /* a new tab right below another one (tab menu: new tab below, duplicate) */
  function openBelow(address, afterId) { const nt = tabs.open(address, { after: afterId }); host.create(nt.id, address); host.show(nt.id); render(); saveSession(); }
  /* pinning moves a tab out of the tab list to the end of the pinned tiles; unpinning puts it back at the top of the list (measured) */
  function setPinned(id, on) {
    const list = tabs.state.tabs, i = list.findIndex(x => x.id === id);
    if (i < 0 || !!list[i].pinned === on) return;
    const [tab] = list.splice(i, 1);
    tab.pinned = on;
    const top = list.findIndex(x => !x.pinned);
    if (on) list.push(tab); else list.splice(top < 0 ? list.length : top, 0, tab);
    render(); saveSession();
  }
  /* next and previous tab (⌃⇥, ⌃⇧⇥). Setting kit.tab.switchOrder: 'recent' (default) walks the tabs from the most recently used, the
     order taken when a run of presses starts (presses less than a second apart continue it); 'sidebar' follows the sidebar order:
     pinned tiles, then the tab list. Both wrap around. */
  let switchRun = null;
  function stepTab(d) {
    const open = [...tabs.state.tabs.filter(x => x.pinned && !x.unloaded), ...tabs.state.tabs.filter(x => !x.pinned)];
    if (open.length < 2) return;
    if (settings.get('kit.tab.switchOrder') === 'sidebar') {
      const i = open.findIndex(x => x.id === tabs.state.active);
      activate(open[(i + d + open.length) % open.length].id); return;
    }
    if (!switchRun || Date.now() - switchRun.at > 1000) switchRun = { order: [...open].sort((x, y) => (y.usedAt || 0) - (x.usedAt || 0)).map(x => x.id), i: 0 };
    const order = switchRun.order.filter(id => tabs.find(id));
    switchRun.i = (switchRun.i + d + order.length) % order.length;
    switchRun.at = Date.now();
    const id = order[switchRun.i], keep = switchRun;
    activate(id); switchRun = keep;
  }
  function reopenTab(id) {
    const tab = tabs.reopen(id);
    if (!tab) return;
    if (tab.group && !tabs.state.groups.some(g => g.id === tab.group)) tab.group = null;
    /* the reopened page comes back with its history (back after ⇧⌘T showed an empty body: the new view had only its current page) */
    host.create(tab.id, tabs.current(tab).address, { toolId: tab.toolId, ...(tab.kind === 'page' ? { history: { entries: tab.entries.map(e => e.address), index: tab.index } } : {}) }); host.show(tab.id); render(); saveSession();
  }
  /* Page zoom (measured on the reference): the zoom button and its bubble show for 1.5 s, the level pill on the page for 3 s */
  let zoomTimers = [];
  /* the zoom level setting (kit.zoom) is every page's level; the zoom keys change it for this session and Actual Size goes back to it */
  const defaultZoom = () => parseFloat(settings.get('kit.zoom')) || 1;
  let zoom = defaultZoom();
  function applyDefaultZoom() { zoom = defaultZoom(); if (host.zoom) for (const tb of tabs.state.tabs) if (!tb.unloaded) host.zoom(tb.id, zoom).catch(() => {}); }
  async function zoomBy(dir) {
    const tab = tabs.active(); if (!tab || !host.zoom) return;
    const now = await host.zoom(tab.id);
    const f = dir == null ? now : await host.zoom(tab.id, dir === 0 ? defaultZoom() : zoomStep(now, dir));
    zoom = f;
    zoomTimers.forEach(clearTimeout);
    state.zoomShown = f; renderTopbar();
    const btn = doc.querySelector('.topbar .tb-zoom'), slot = doc.querySelector('.kit-content');
    const css = n => parseFloat(getComputedStyle(doc.documentElement).getPropertyValue(n)) || 0;
    const right = btn && slot ? Math.round(slot.getBoundingClientRect().right - btn.getBoundingClientRect().right - css('--zi-overhang')) : 0;
    const show = (bubble, hud) => host.send(tab.id, envelope('shell:zoom', { zoom: f, bubble: bubble ? { right } : null, hud }));
    show(true, true);
    zoomTimers = [setTimeout(() => { state.zoomShown = null; renderTopbar(); show(false, true); }, css('--zi-bubble-ms')), setTimeout(() => show(false, false), css('--zi-hud-ms'))];
  }
  /* The menu bar's history menu and zoom items follow the shell: back and forward, recently closed tabs, recently visited pages */
  const visits = [];
  let menuSent = '';
  function syncMenu() {
    const tab = tabs.active();
    if (tab && !isChat(tab)) {
      const cur = tabs.current(tab), label = tabLabel(tab);
      if (visits[0]?.address === cur.address) { if (label) visits[0].label = label; } else if (label) { visits.unshift({ address: cur.address, label }); visits.length = Math.min(visits.length, 15); }
    }
    if (!desktop) return;
    const st = { history: { canBack: !!tab && tabs.canBack(tab), canForward: !!tab && tabs.canForward(tab),
      closed: [...tabs.state.closed].reverse().slice(0, 10).map(x => ({ id: x.id, label: tabLabel(x) || text('tab.loading') })), recent: visits.slice(0, 15) } };
    const key = JSON.stringify(st);
    if (key !== menuSent) { menuSent = key; desktop.invoke('menu:state', st).catch(() => {}); }
    if (tab && host.zoom) host.zoom(tab.id).catch(() => {});
  }
  const saveSession = () => { if (features.restoreSession && !secondWindow) settings.set('kit.session', tabs.serialize()); };

  /* ---------- Page messages ---------- */
  /* a conversation started at the chat route's 'new' address names its saved record (page:meta conversation): the tab's entry takes that
     conversation's address without loading the page again, so the lists, ⌘K, a reopened tab and a restart find it */
  function adoptConversation(tab, id) {
    if (typeof id !== 'string' || !id || id.length > 256 || /[\u0000-\u001f\u007f/?#%]/.test(id)) return false;
    const entry = tabs.current(tab), m = entry && router.parse(entry.address);
    if (m?.route?.kind !== 'chat' || m.params?.id !== 'new') return false;
    entry.address = router.build(m.route.id, { ...m.params, id });
    return true;
  }
  /* B-30: a dialog open in a page dims the whole window. The page dims its own view; the shell lays the dialog's own scrim (dialog.js classes) over
     everything else and pressing it closes the page's dialog. It goes when the dialog closes or that page is no longer shown */
  let scrim = null;
  function pageScrim(tabId, on, strong) {
    if (scrim && (!on || scrim.tabId !== tabId)) { scrim.el.remove(); scrim = null; }
    if (!on || !doc.body) return;
    const el = doc.createElement('div'); el.className = 'dlg-layer' + (strong ? ' confirm' : ''); el.dataset.state = 'open'; el.dataset.pageScrim = '';
    el.innerHTML = '<div class="dlg-scrim"></div>';
    el.addEventListener('click', () => host.send(tabId, envelope('shell:scrim', { op: 'close' })));
    doc.body.appendChild(el); scrim = { tabId, el };
  }
  function onPageMessage(tabId, msg) {
    const tab = tabs.find(tabId); if (!tab) return;
    const p = msg.payload || {};
    switch (msg.type) {
      case 'page:ready': {
        tab.loading = false;
        if (host.zoom) {
          if (desktop) host.zoom(tabId, defaultZoom(), { initial: true }).catch(() => {}); // the first internal page of the process takes the zoom setting over a level the profile remembered
          else if (zoom !== 1) host.zoom(tabId, zoom).catch(() => {});
        }
        host.send(tabId, envelope('shell:init', { protocol: PROTOCOL, kitVersion: KIT_VERSION, appId: config.id, address: tabs.current(tab).address, tabId, theme, locale: localeCode, desktopInfo, settings: settings.all(), features, shortcuts: activeKeys(), handoff: handoffs.get(tabs.current(tab).address), ...(tab.overlay ? { presentation: 'detail' } : {}) }));
        host.send(tabId, envelope('shell:history', { canBack: tabs.canBack(tab), canForward: tabs.canForward(tab) }));
        if (tab.overlay && detailOf(tabId)) { const d = detailOf(tabId), first = !d.ready; d.ready = true; detailSent.delete(tabId); render(); if (first && d === topDetail()) host.focusTab?.(tabId); break; }
        else if (chain.some(d => d.kind === 'detail' && d.base === tabId)) host.send(tabId, envelope('shell:detail', { state: 'open' })); // the list's page was loaded again under its overlay
        render(); break;
      }
      case 'page:meta': state.meta[tabId] = p; if (adoptConversation(tab, p.conversation)) renderTopbar(); if (p.title) { tab.title = p.title; tab.entries[tab.index].title = p.title; } if (p.icon) tab.icon = p.icon; syncDetail(); renderSidebar(); renderTopbar(); saveSession(); break;
      case 'page:navigate':
        if (tab.overlay) { if (detailOf(tabId) && !(p.presentation === 'detail' && !p.newTab && !p.replace && openDetail(tab, p.address))) overlayNavigate(tab, p); break; }
        if (p.presentation === 'detail' && !p.newTab && !p.replace && openDetail(tab, p.address)) break;
        navigate(p.address, { newTab: p.newTab, replace: p.replace, tabId: p.newTab ? null : tabId, opener: p.newTab ? tabId : null }); break;
      // only the open overlay's own page may close or resize it
      case 'page:detail':
        if (!tab.overlay || !detailOf(tabId)) break;
        if (p.op === 'close') closeDetailAt(detailOf(tabId)); else if (p.op === 'back') historyStep(-1, tab); else { detailOf(tabId).expanded = p.op === 'expand'; renderFrame(); applyPanes(); }
        break;
      case 'page:open-panel': if (features.panel) api.openPanel({ prompt: p.prompt, from: tabId }); break;
      case 'page:open-tool': { if (p.tool && p.url) { openTool({ id: String(p.tool.id), name: { raw: String(p.tool.name || p.tool.id) }, icon: p.tool.icon || 'globe', partition: p.tool.partition }, p.url, tabId); break; } const tool = toolsAll().find(x => x.id === p.toolId); if (tool) navigate(tool.origin + (p.path || ''), { newTab: true, opener: tabId }); break; }
      case 'page:scrim': pageScrim(tabId, !!p.on, !!p.strong); break;
      case 'page:toast': api.toast(p); break;
      case 'page:notify': if (p.op === 'dismiss') api.dismissNotice(p.id); else if (p.op === 'update') api.updateNotice(p.id, p.notice || {}); else api.notify(p.notice || {}); break;
      case 'page:shortcut': runShortcut(p.keys); break;
      case 'page:shortcuts-suspend': desktop?.invoke('shortcuts:suspend', !!p.on).catch(() => {}); break;
      case 'page:dictate': dictate(); break;
      case 'page:action': if (config.actions?.[p.name]) runAction(p.name, { arg: p.arg, on: p.on, values: p.values }, { sourceTabId: tabId }); break;
      case 'page:setting-set': settings.set(p.key, p.value); break;
      case 'page:context-menu': showContextMenu(p.items, p).then(id => host.send(tabId, envelope('shell:context-choice', { id }, msg.id))); break;
      case 'page:error': console.error(`[page ${tabId}]`, p.message); break;
    }
  }
  settings.subscribe((key, value) => {
    state.settings = settings.all();
    renderSidebar(); // sidebar sections read settings (enabled sections, pinned rows)
    const nt = applyTheme();
    if (key === 'kit.shortcuts') applyShortcuts();
    if (key === 'kit.zoom') applyDefaultZoom();
    if (key === null || ['kit.terminal.theme', 'kit.terminal.font', 'kit.terminal.appearances'].includes(key)) terms?.theme();
    if (key === 'kit.locale') { const code = applyLocale(); if (code !== localeCode) { localeCode = code; host.broadcast(envelope('shell:locale', { locale: code })); render(); } }
    if (key === 'kit.spellcheck' && desktop) desktop.invoke('spellcheck:set', value !== false).catch(() => {});
    if (key === 'kit.openAtLogin' && desktop) desktop.invoke('login:set', !!value).catch(() => {});
    host.broadcast(envelope('shell:settings', { values: settings.all(), shortcuts: activeKeys() }));
    if (firstRun) { if (key) firstRun.values[key] = value; renderFirstRun(); } // a first-run quick setting (language too) shows at once
    if (nt !== theme) { theme = nt; host.broadcast(envelope('shell:theme', { theme })); terms?.theme(); }
  });

  async function showContextMenu(items, pos) {
    if (host.contextMenu) return host.contextMenu(items, pos);
    return new Promise(res => { const m = ctx.menu.open(null, { variant: 'native', items: items.map(i => ({ ...i, action: 'kit.context-choice', arg: i.id })) }, { point: pos }); m.el.dataset.state = 'idle'; pendingChoice = res; });
  }
  let pendingChoice = null;

  /* ---------- Rendering ---------- */
  const routeOf = tab => tab ? router.parse(tabs.current(tab).address) : null;
  /* Pages of the app's own page kind and external tool pages show their icon as a page icon tile (where a browser shows a site icon) */
  const isPage = tab => { if (tab.kind === 'tool') return true; const r = routeOf(tab)?.route; return !!r && (r.kind || 'page') === 'page'; };
  /* A conversation open as a full tab is shown by its conversation row (not in the tab list) */
  const isChat = tab => !!tab && routeOf(tab)?.route?.kind === 'chat';
  // asking the AI is not offered on a full chat tab, on settings and on the start page
  const panelless = tab => !!tab && ['chat', 'settings'].includes(routeOf(tab)?.route?.kind);
  // a settings tab is named with the settings title in front ('Settings › page'), the way the reference names it in the tab list and palette
  const tabLabel = tab => tab.name || (tab.title && routeOf(tab)?.route?.kind === 'settings' ? `${t('settings.title')} › ${tab.title}` : tab.title);
  const tabRow = (tab, sec) => C.sidebarRow.render({ rename: state.renaming === tab.id ? { id: tab.id, value: tabLabel(tab), done: 'kit.tab.renamed', cancel: 'kit.rename.cancel', label: t('tab.rename') } : null, id: tab.id, icon: tab.icon || 'globe', fav: isPage(tab), label: tabLabel(tab) || text(sec.untitled || 'tab.loading'), selected: tab.id === tabs.state.active, closable: true, loading: tab.loading, action: 'kit.tab.activate', arg: tab.id, context: 'kit.tab', draggable: true, group: 'tabs', preview: tab.id });
  /* tab groups: a group shows where its first tab is, with its tabs below the header (tab-group) */
  const groupOf = tab => tab?.group ? tabs.state.groups.find(g => g.id === tab.group) : null;
  const membersOf = id => tabs.state.tabs.filter(x => x.group === id && !x.pinned && !isChat(x));
  const groupName = g => g.name || t('group.new');
  function tabsSection(sec) {
    const rows = [C.sidebarRow.render({ icon: 'plus-medium', label: t('tab.new'), add: true, action: 'kit.tab.new' })], shown = new Set();
    for (const tab of tabs.state.tabs) {
      if (isChat(tab) || tab.pinned) continue;
      const pair = tabs.splitOf(tab.id);
      if (pair) {
        if (tab.id !== pair.a) continue;
        // a new split's second half names the chooser until a tab is chosen (measured)
        const half = x => x ? { icon: x.icon || 'globe', fav: isPage(x), label: tabLabel(x) || text('tab.loading'), action: 'kit.tab.activate', arg: x.id, preview: x.id, closable: true }
          : { icon: config.brand.mark, label: t('split.choose') };
        rows.push(C.sidebarRow.render({ halves: [half(tabs.find(pair.a)), half(pair.b && tabs.find(pair.b))], selected: tabs.state.active === pair.a || tabs.state.active === pair.b, context: 'kit.tab' }));
        continue;
      }
      const g = groupOf(tab);
      if (!g) { rows.push(tabRow(tab, sec)); continue; }
      if (shown.has(g.id)) continue;
      shown.add(g.id);
      const members = membersOf(g.id);
      rows.push(C.tabGroup.render({ id: g.id, name: groupName(g), icon: g.icon, color: g.color, collapsed: g.collapsed, editing: state.renaming === g.id, value: g.name, tip: `${groupName(g)} - ${members.map(m => `'${tabLabel(m) || ''}'`).join(', ')}`, rows: members.map(m => tabRow(m, sec)) }));
    }
    return rows;
  }
  const GROUP_COLORS = [[null, 'none'], ['--grp-red', 'red'], ['--grp-orange', 'orange'], ['--grp-yellow', 'yellow'], ['--grp-green', 'green'], ['--grp-blue', 'blue'], ['--grp-purple', 'purple'], ['--grp-pink', 'pink']];
  /* group icon choices (menu icon grid, 8 columns): icon slot names */
  const GROUP_ICONS = ['sun', 'moon', 'cloud', 'bolt', 'heart', 'flame', 'star', 'wand', 'thumbs-up', 'gem', 'document', 'notebook', 'hourglass', 'clock', 'smile', 'ghost',
    'lock', 'map-pin', 'pin', 'tag', 'flag', 'bag', 'briefcase', 'ticket', 'telescope', 'trophy', 'rocket', 'banknote', 'camera', 'folder', 'bookmark', 'pen',
    'pen-nib', 'brush', 'palette', 'contrast', 'atom', 'headphones', 'bell', 'mail', 'presentation', 'circle-fill', 'square-fill', 'diamond', 'badge', 'navigation', 'terminal', 'message-circle'];
  let groupSeq = 0;
  const dropEmptyGroups = () => { tabs.state.groups = tabs.state.groups.filter(g => tabs.state.tabs.some(x => x.group === g.id)); };
  /* a tab joining a group moves next to the group's last tab */
  function joinGroup(tab, id) {
    const last = membersOf(id).filter(x => x !== tab).pop();
    tab.group = id;
    if (last) tabs.move(tab.id, last.id, true);
    dropEmptyGroups(); renderSidebar(); saveSession();
  }
  /* lead rows stay visible when the section is collapsed */
  function rowsOf(sec, lead = false) {
    if (sec.kind === 'tabs') return lead ? [] : tabsSection(sec);
    // an app section kind (config.sidebar.kinds) draws its own body from kit components; it has no lead rows
    if (sec.kind && config.sidebar.kinds?.[sec.kind]) return lead ? [] : config.sidebar.kinds[sec.kind](sec, state, api, { components: C, html, text, t, icon });
    const active = tabs.active(), current = active ? tabs.current(active).address : null;
    const row = r => C.sidebarRow.render({
      ...r, label: text(r.label), ctx: r.ctx && typeof r.ctx === 'object' ? text(r.ctx) : r.ctx, // a text object (a key) is translated, a plain string is shown as it is
      // a row shows the open page only when no tab row does (a conversation open as a full tab); the tab row is the one selection otherwise
      selected: r.selected ?? (r.address && r.address === current && isChat(active)),
      action: r.action || (r.address ? 'kit.navigate' : null), arg: r.action ? r.arg : (r.address ? { address: r.address } : r.arg), contextArg: r.arg,
    });
    // a row with children is a folder (bookmark folder): it starts folded and keeps its open state in the shell
    return (sec.rows(state, api) || []).filter(r => !!r.lead === lead).map(r => r.children
      ? C.tabGroup.render({ id: r.id, name: text(r.label), folder: true, collapsed: !state.folders[r.id], toggle: 'kit.folder.toggle', context: r.context, contextArg: r.arg, rows: r.children.map(row) })
      : row(r));
  }
  const slots = {};
  const put = (name, h) => { const s = String(h); if (slots[name]?.html === s) return; morph(slots[name].el, s); slots[name].html = s; };
  /* in-place rename of a sidebar name (a tab row or a group header): the box takes the caret with its text selected */
  function startRename(id) {
    state.renaming = id; renderSidebar();
    const box = slots.sidebar.el.querySelector(`[data-rename="${id}"]`);
    if (!box) return;
    host.focus?.(); // after a tab view had the keyboard, the native view keeps it until the shell asks back
    box.focus({ preventScroll: true }); box.select();
  }
  function renderSidebar() {
    // an optional section shows while the user keeps it in kit.sidebar.sections (all optional sections when the setting is unset)
    const shownOptional = settings.get('kit.sidebar.sections');
    const sections = config.sidebar.sections.filter(s => (!s.optional || !shownOptional || shownOptional.includes(s.id)) && (s.enabled === undefined || (typeof s.enabled === 'function' ? s.enabled(state) : s.enabled))).map(s => C.section.render({ id: s.id, kind: s.kind, label: text(typeof s.label === 'function' ? s.label(state) : s.label), tip: text(s.tip || (typeof s.label === 'function' ? s.label(state) : s.label)), context: s.context, collapsed: !!state.collapsed[s.id], lead: rowsOf(s, true), body: rowsOf(s) }));
    const bottom = (config.sidebar.bottom || []).map(b => sidebarBottomItem(b, state, api));
    const pinned = config.sidebar.pinnedTabs ? tabs.state.tabs.filter(x => x.pinned && !isChat(x)) : [];
    put('sidebar', C.sidebar.render({
      top: C.iconButton.render({ icon: 'sidebar', tip: t('shell.sidebar.hide'), variant: 'tertiary', size: 'sm', action: 'kit.sidebar.toggle' }),
      tiles: C.pinnedTiles.render({ columns: config.sidebar.pinnedTabs?.columns, tiles: pinned.map(tab => ({ id: tab.id, icon: tab.icon || 'globe', fav: isPage(tab), tint: tab.tint, label: tabLabel(tab) || text('tab.loading'), selected: tab.id === tabs.state.active, loading: tab.loading, action: 'kit.tab.activate', arg: tab.id, context: 'kit.tab' })) }),
      sections, update: updateView, bottom: html`${bottom[0] || ''}${bottom.slice(1)}`,
    }));
  }
  function crumbsOf(tab) {
    if (!tab) return [];
    if (tab.kind === 'tool') { const tool = toolOf(tab.toolId); return [{ label: text(tool.name) }, { label: tab.title || '' }]; }
    const m = routeOf(tab);
    if (!m?.route) return [{ label: tab.title || '' }];
    const meta = state.meta[tab.id];
    return (meta?.crumbs || m.route.crumbs(m.params, data) || []).map(c => ({ label: text(c.label), menu: c.switcher, arg: c.arg }));
  }
  /* The identity chip already names the top level (for example a site): the path starts at the next level, so no crumb repeats it */
  const pathOf = (crumbs, identLabel) => crumbs.filter(c => c.label !== identLabel);
  /* split view: the active tab's pair (a above or left of b) */
  const activePair = () => tabs.splitOf(tabs.state.active);
  function renderTopbar() {
    const pair = activePair();
    put('topbar', topbarHtml(pair ? tabs.find(pair.a) : navTab()));
    put('topbar2', pair ? topbarHtml(pair.b ? tabs.find(pair.b) : null) : '');
  }
  function topbarHtml(tab) {
    const m = routeOf(tab);
    // identity chip: a tool tab names its tool, a route may name its own (or none: null), else the app brand; topbar.ident false draws none
    const ident = config.topbar?.ident === false ? null : tab?.kind === 'tool' ? { icon: toolOf(tab.toolId).icon, label: toolOf(tab.toolId).name }
      : m?.route?.ident ? m.route.ident(m.params, data) : { icon: config.brand.mark, label: config.brand.name };
    return C.topbar.render({
      sidebarHidden: state.sidebarHidden, canBack: tab && tabs.canBack(tab), canForward: tab && tabs.canForward(tab),
      ident: topbarIdentity(ident, config.brand, tab?.kind === 'tool'),
      buttons: (config.topbar?.buttons ? config.topbar.buttons({ route: m?.route, params: m?.params || {} }, state, api) : []).map(b => ({ ...b, tip: text(b.tip), why: b.why ? text(b.why) : undefined })),
      path: (segs => segs.length ? C.pathSegmentSwitcher.render({ segments: segs }) : '')(pathOf(crumbsOf(tab), ident ? text(ident.label) : null)),
      right: config.topbar?.right ? config.topbar.right(state, api) : '',
      askLabel: features.panel && !panelless(tabs.active()) && !cardOf('ai') && !state.meta[tab?.id]?.ownAsk ? t('shell.ask') : null, /* a page that draws its own ask (meta.ownAsk) keeps one ask on screen */
      zoom: state.zoomShown && tab === tabs.active() ? t('zoom.label', { value: C.zoomIndicator.percent(state.zoomShown) }) : null,
    });
  }
  const dictate = () => desktop?.invoke('dictation:start').catch(() => {});
  function chipFor(tab) {
    if (!tab) return null;
    const meta = state.meta[tab.id];
    if (meta?.context) return { icon: meta.context.icon || tab.icon || 'globe', fav: isPage(tab), title: meta.context.title, sub: meta.context.sub, tile: meta.context.tile, tint: tab.tint };
    /* a tool tab has no page to say what it is about: the app names it when it opens the tool (def.context { title, sub, ref }: which tool, for what; ref is the app's
       own identity of the target, carried as is in the chip and so in the conversation's handoff), with the page's own title after it */
    const own = tab.kind === 'tool' ? toolOf(tab.toolId).context : null;
    if (own?.title) return { icon: tab.icon || 'globe', fav: true, tint: tab.tint, title: String(own.title), sub: [own.sub, tab.title].filter(Boolean).map(String).join(' · '), ...(own.ref ? { ref: structuredClone(own.ref) } : {}) };
    return { icon: tab.icon || 'globe', fav: isPage(tab), tint: tab.tint, title: tabLabel(tab), sub: crumbsOf(tab).map(c => c.label).slice(0, -1).join(' · ') };
  }
  let frame = null;
  function renderFrame() {
    const cls = ['frame', state.sidebarHidden && 'sidebar-hidden'].filter(Boolean).join(' ');
    if (!frame) {
      root.innerHTML = C.appFrame.render({ sidebar: '', topbar: '', content: '', sidebarHidden: state.sidebarHidden, dock: !!config.terminal }).s;
      frame = root.querySelector('.frame');
      if (config.terminal) mountDock(root.querySelector('[data-slot="dock"]'));
      const main = frame.querySelector('[data-slot="main"]');
      const top = doc.createElement('div'); top.style.display = 'contents'; main.querySelector('[data-pane="0"]').prepend(top);
      const top2 = doc.createElement('div'); top2.style.display = 'contents'; main.querySelector('[data-pane="1"]').prepend(top2);
      slots.sidebar = { el: frame.querySelector('[data-slot="sidebar"]'), html: null };
      slots.topbar = { el: top, html: null };
      slots.topbar2 = { el: top2, html: null };
      slots.content2 = { el: frame.querySelector('[data-slot="content2"]'), html: null };
      slots.content3 = { el: frame.querySelector('[data-slot="content3"]'), html: null };
      attachSplit(main);
      const content = frame.querySelector('[data-slot="content"]');
      slots.content = { el: content, html: null };
      content.classList.add('kit-content');
      host.mount(content);
    }
    frame.className = cls;
    const pair = activePair(), main = frame.querySelector('[data-slot="main"]'), cards = shownCards(), shown = !pair && cards.length > 0;
    const expandedAt = shown ? cards.findIndex(d => d.expanded) + 1 : 0;
    main.classList.toggle('split', !!pair || shown); main.classList.toggle('v', pair ? pair.dir === 'v' : shown);
    main.classList.toggle('cols-3', shown && cards.length === 2);
    main.classList.toggle('detail', shown); main.classList.toggle('detail-expanded', expandedAt > 0);
    // a settings page draws its nav on the window ground and its own content card: the frame draws no card around it
    main.classList.toggle('bare', !pair && !shown && routeOf(tabs.active())?.route?.kind === 'settings');
    main.querySelectorAll('.frame-pane').forEach((el, i) => el.classList.toggle('expanded', expandedAt > 0 && expandedAt === i));
    // the shares, drawn at once
    const w = pair ? [pair.ratio, 1 - pair.ratio] : shown ? weightsFor(cards.length + 1) : [1];
    paintWeights(main, w);
    applied = w;
  }
  function paintWeights(main, w) {
    main.style.setProperty('--split-ratio', String(w[0]));
    ['--w0', '--w1', '--w2'].forEach((k, i) => i < w.length && w.length > 1 ? main.style.setProperty(k, String(w[i])) : main.style.removeProperty(k));
    ['--g0', '--g1'].forEach((k, i) => (w.length > 1 && w[i + 1] != null) ? main.style.setProperty(k, w[i + 1] > 0 ? 'var(--split-gap)' : '0px') : main.style.removeProperty(k));
  }
  /* each pane shows its tab; a new split's second pane lists the other tabs to choose from */
  /* toasts sit under the middle of the page the person works in: the body card when cards (the conversation, a detail) stand beside it, else the
     center column (B2-20). The toast layer reads the point as --toast-x */
  function placeToasts() {
    const content = frame?.querySelector('[data-slot="content"]'), beside = !activePair() && shownCards().length > 0 && !chain.some(d => d.expanded);
    const r = beside ? content?.getBoundingClientRect?.() : null;
    doc.documentElement.style.setProperty('--toast-x', r?.width ? `${Math.round(r.left + r.width / 2)}px` : '50%');
  }
  function applyPanes() {
    const pair = activePair(), content = frame.querySelector('[data-slot="content"]');
    const toolStatus = tab => tab?.toolDocument === 'loading' ? html`<div class="frame-tool-status" role="status">${C.statusIcon.render({ kind: 'busy', text: t('tab.loading') })}</div>`
      : tab?.toolDocument === 'error' ? html`<div class="frame-tool-status">${C.emptyState.render({ icon: 'status-error', title: t('tab.loadFailed'), action: C.button.render({ label: t('shell.reload'), action: 'kit.history.reload', arg: tab.id, size: 'sm' }) })}</div>` : '';
    if (desktop) put('content', toolStatus(pair ? tabs.find(pair.a) : tabs.active()));
    put('content2', pair && !pair.b ? C.tabChooser.render({ action: 'kit.split.choose', close: 'kit.split.separate', rows: tabs.state.tabs.filter(x => x.id !== pair.a && !x.unloaded && !isChat(x)).sort((x, y) => (y.usedAt || 0) - (x.usedAt || 0)).map(x => ({ id: x.id, icon: x.icon || 'globe', fav: isPage(x), title: tabLabel(x) || text('tab.loading'), sub: chipFor(x).sub })) }) : pair && desktop ? toolStatus(tabs.find(pair.b)) : '');
    // details: the list stays in the left card, each detail goes in the next card once its page is ready (its view is transparent while it loads);
    // expanded, only that detail is placed (the other cards are hidden)
    const els = [content, slots.content2.el, slots.content3.el], cards = shownCards(), open = !pair && cards.length > 0, ex = open ? cards.find(d => d.expanded) : null;
    host.setPanes?.(pair ? [{ id: pair.a, el: content }, { id: pair.b, el: slots.content2.el }]
      : ex ? [{ id: ex.id, el: els[cards.indexOf(ex) + 1] }]
      : open ? [{ id: tabs.state.active, el: content }, ...cards.map((d, i) => ({ id: d.id, el: els[i + 1] }))] : null);
    syncDetail();
  }
  /* the gap between cards resizes them (it draws nothing: the cursor changes over it); pressing in a pane makes its tab the open one */
  function attachSplit(main) {
    main.addEventListener('pointerdown', e => {
      const pair = activePair(), d = !pair && shownCards().length && !chain.some(x => x.expanded); if (!pair && !d) return;
      const h = e.target.closest('[data-split-handle]');
      if (h) {
        const v = d || pair.dir === 'v', i = Number(h.dataset.splitHandle) || 0;
        const start = pair ? [pair.ratio, 1 - pair.ratio] : weightsFor(shownCards().length + 1).slice();
        dragSplit(e, { container: main, index: i, weights: start, vertical: v, min: pair ? 0.2 : 0.14,
          onMove: w => {
            if (pair) pair.ratio = w[0];
            main.style.setProperty('--split-ratio', String(w[0]));
            w.forEach((x, k) => main.style.setProperty('--w' + k, String(x)));
            host.relayout();
          },
          onEnd: w => {
            applied = w;
            if (d) { if (w.length === 2) settings.set?.('kit.detail.ratio', w[0]); else settings.set?.('kit.detail.ratio3', w.map(x => x.toFixed(4)).join(',')); }
            applyPanes(); saveSession();
          } });
        return;
      }
      if (!pair) return; // in a detail split the open page stays the detail; a row pressed in the list opens its own detail
      const pane = e.target.closest('[data-pane]'), id = pane?.dataset.pane === '1' ? pair.b : pair.a;
      if (id && id !== tabs.state.active) activate(id);
    }, true);
  }
  /* ---------- Terminal panel (config.terminal, desktop) ----------
     A bottom panel inside the center card, under the panes. Each session key (config.terminal.session of the open tab's route) has its own terminal;
     a tab without a key (or a browser) cannot open it, and while such a tab is open the panel stays hidden. The top edge sets the height. */
  let dock = null, terms = null, dockExpanded = false;
  const openTerminals = new Map();
  /* the terminal belongs to the page the top bar is for (the body, or the detail in front of it), never to the conversation card beside it */
  const termTab = () => navTab();
  const activeTerminalOpen = (key = termKey()) => !!key && openTerminals.get(termTab()?.id) === key;
  const terminalOutputs = createTerminalOutputs({ hasTab: id => { const tab = tabs.find(id); return !!tab && !tab.unloaded; }, activeTab: () => tabs.presented()?.id,
    contextOf: id => { const tab = tabs.find(id); return tab ? tabs.current(tab).address : null; }, onChange: () => syncDock(true),
    onRelease: id => { openTerminals.delete(id); terms?.releaseOwner(id); } });
  const termKey = () => { if (!config.terminal || !desktop) return null; const m = routeOf(termTab()); return m ? config.terminal.session({ route: m.route, params: m.params }, state) || null : null; };
  /* the panel sits in the center card, or at the bottom of the first-run step while the first run covers the window */
  function placeDock() {
    if (!dock) return;
    const target = (firstRun && frLayer?.querySelector('[data-fr-dock]')) || frame?.querySelector('[data-slot="main"]');
    if (target && dock.parentElement !== target) target.appendChild(dock);
  }
  function mountDock(el) {
    dock = el;
    terms = createTerminals({ doc, desktop, api, appearanceSettings: () => settings.all(), onExit: (key, id) => {
      if (openTerminals.get(id) === key) openTerminals.delete(id);
      syncDock();
    }, onState: () => syncDock(true),
      ownerOf: () => { const tab = termTab(); return tab ? { tabId: tab.id, address: tabs.current(tab).address } : null; }, config: { ...config, terminal: { ...config.terminal, keysOf: () => activeKeys().filter(k => shortcuts.find(s => s.keys === k)?.action === 'kit.terminal.toggle') } } });
    const wrap = el.parentElement, h = parseFloat(settings.get('kit.terminal.height'));
    if (h) wrap.style.setProperty('--dock-h', h + 'px');
    el.addEventListener('pointerdown', e => {
      if (dockExpanded || !e.target.closest('[data-tpn-grip]')) return;
      e.preventDefault(); dock.classList.add('dragging');
      const bottom = wrap.getBoundingClientRect().bottom, max = wrap.clientHeight * 0.7, min = parseFloat(getComputedStyle(wrap).getPropertyValue('--dock-min-h')) || 120;
      let cur = dock.getBoundingClientRect().height;
      const move = ev => { cur = Math.round(Math.min(max, Math.max(min, bottom - ev.clientY))); wrap.style.setProperty('--dock-h', cur + 'px'); terms.fit(); };
      const up = () => { doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', up); dock.classList.remove('dragging'); settings.set('kit.terminal.height', cur); };
      doc.addEventListener('pointermove', move); doc.addEventListener('pointerup', up);
    });
    /* fitting the terminal resizes its screen inside the observed panel: done in the next frame, once per frame, so the resize that asked for it is
       never answered inside the observer callback (a width change reported "ResizeObserver loop completed with undelivered notifications", R5-07) */
    let fitFrame = 0;
    new ResizeObserver(() => { if (!fitFrame) fitFrame = requestAnimationFrame(() => { fitFrame = 0; terms.fit(); }); }).observe(el);
  }
  function syncDock(restoreOnly = false) {
    if (!dock) return;
    placeDock();
    const output = terminalOutputs.current(); terms.retainOutputs(terminalOutputs.keys());
    const run = state.run;
    const key = run?.key || termKey(), open = !!output || !!run || !!(activeTerminalOpen(key) && (!restoreOnly || terms.has(key)));
    const expanded = open && dockExpanded && !firstRun;
    const panes = frame?.querySelector('[data-slot="main"] > .frame-panes');
    if (panes) panes.inert = expanded;
    dock.classList.toggle('expanded', expanded);
    if (open) {
      if (!dock.firstElementChild) {
        dock.innerHTML = C.terminalPanel.render({ title: '', close: 'kit.terminal.toggle', expand: 'kit.terminal.expand' }).s;
        terms.mount(dock.querySelector('[data-tpn-body]'));
      }
      const toggle = dock.querySelector('[data-tpn-expand]');
      toggle.hidden = !!firstRun;
      for (const button of toggle.children) button.hidden = (button.dataset.tpnExpanded === 'true') !== expanded;
      const session = terms.status?.(key);
      let description;
      try { description = session && config.terminal?.describe?.(session, api); } catch { description = null; }
      const caption = text(output ? output.title : run ? run.title : description?.title ?? config.terminal?.title?.(key) ?? { raw: key });
      const shownTitle = !output && !run && session?.mode === 'remote' && !description?.title ? `${caption} · ${session.code || session.state}` : caption;
      const title = dock.querySelector('.tpn-title .trunc'); if (title) title.textContent = shownTitle;
      dock.querySelector('.tpn')?.setAttribute('aria-label', shownTitle);
      if (output) { terms.showOutput(output); }
      else if (run || restoreOnly) terms.reveal(key, { fit: !restoreOnly }); else terms.show(key);
    } else terms.hide();
    dock.classList.toggle('open', open);
  }
  function render() {
    if (scrim && ![tabs.state.active, ...chain.map(d => d.id)].includes(scrim.tabId)) pageScrim(scrim.tabId, false); // its page is no longer shown
    settleCards();
    renderFrame(); renderSidebar(); renderTopbar(); applyPanes(); syncDock();
    const tab = tabs.presented();
    if (tab) host.send(tab.id, envelope('shell:history', { canBack: tabs.canBack(tab), canForward: tabs.canForward(tab) }));
    syncMenu();
  }

  /* ---------- Menu definition lookup ---------- */
  /* the top bar buttons folded into » (narrow window): choosing one opens its own menu from the » button, or runs its action */
  const topbarButtons = () => { const tab = navTab(), m = routeOf(tab); return config.topbar?.buttons ? config.topbar.buttons({ route: m?.route, params: m?.params || {} }, state, api) : []; };
  function resolveMenu(id, arg, el) {
    if (id === 'kit.topbar.more') {
      const tab = navTab(), hidden = topbarButtons().slice(0, -1);
      return { align: 'end', items: [{ id: 'tb-forward', label: t('shell.forward'), icon: 'chevron-right-medium', action: 'kit.history.forward', disabled: !(tab && tabs.canForward(tab)) },
        ...hidden.map((b, i) => ({ id: 'tb-' + i, label: text(b.tip), icon: b.icon, action: 'kit.topbar.button', arg: i, disabled: !!b.disabled, ...(b.disabled && b.why ? { desc: text(b.why) } : {}) })),
        ...(features.panel && !panelless(tabs.active()) && !cardOf('ai') ? [{ id: 'tb-ask', label: t('shell.ask'), icon: 'ai', action: 'kit.panel.toggle' }] : [])] };
    }
    if (id === 'kit.firstRun.select') return firstRunSelect(arg);
    const f = config.menus?.[id];
    if (!f) { console.error(`unknown menu: ${id}`); return null; }
    return localizeMenu(f(arg, state, api));
  }
  function resolveContext(kind, arg) {
    if (kind === 'kit.tab') {
      const tab = tabs.find(arg); if (!tab) return null;
      if (tab.unloaded) return [{ id: 'tab-pin', label: t('tab.unpin'), action: 'kit.tab.pin', arg }]; // a closed pinned tile offers unpin only (measured)
      // the same menu for a tab row and a pinned tile; close others and close below act on the tab list only
      const listed = tabs.state.tabs.filter(x => !x.pinned), i = listed.indexOf(tab);
      return [
        { id: 'tab-new', label: t('tab.newBelow'), action: 'kit.tab.new-below', arg },
        ...(host.setPanes ? [splitItem(tab)] : []),
        ...(tab.pinned ? [] : tabs.state.groups.some(g => g.id !== tab.group)
          ? [{ id: 'tab-group', label: t('tab.groupAdd'), submenu: { items: [...tabs.state.groups.filter(g => g.id !== tab.group).map(g => ({ id: 'tg-' + g.id, label: groupName(g), action: 'kit.tab.group-add', arg: { tab: arg, group: g.id } })), { type: 'separator' }, { id: 'tg-new', label: t('group.new'), action: 'kit.tab.group-new', arg }] } }]
          : tab.group ? [] : [{ id: 'tab-group-new', label: t('tab.groupNew'), action: 'kit.tab.group-new', arg }]),
        ...(tab.group ? [{ id: 'tab-ungroup', label: t('tab.groupRemove'), action: 'kit.tab.group-remove', arg }] : []),
        ...(desktop ? [{ id: 'tab-window', label: t('tab.toWindow'), action: 'kit.tab.to-window', arg }] : []),
        { type: 'separator' },
        { id: 'tab-reload', label: t('tab.reload'), action: 'kit.history.reload', arg },
        { id: 'tab-dup', label: t('tab.duplicate'), action: 'kit.tab.duplicate', arg },
        ...(tab.pinned ? [] : [{ id: 'tab-rename', label: t('tab.rename'), action: 'kit.tab.rename', arg }]),
        ...(config.sidebar.pinnedTabs ? [{ id: 'tab-pin', label: t(tab.pinned ? 'tab.unpin' : 'tab.pin'), action: 'kit.tab.pin', arg }] : []),
        ...(host.mute ? [{ id: 'tab-mute', label: t(tab.muted ? 'tab.unmute' : 'tab.mute'), action: 'kit.tab.mute', arg }] : []),
        ...(config.sidebar.bookmark ? [{ type: 'separator' }, { id: 'tab-bookmark', icon: 'book-open', label: t('tab.bookmark'), action: 'kit.tab.bookmark', arg }] : []),
        { type: 'separator' },
        { id: 'tab-close', label: t('tab.closeItem'), action: 'kit.tab.close', arg },
        { id: 'tab-close-others', label: t('tab.closeOthers'), action: 'kit.tab.close-others', arg, disabled: listed.filter(x => x !== tab).length === 0 },
        { id: 'tab-close-below', label: t('tab.closeBelow'), action: 'kit.tab.close-below', arg, disabled: tab.pinned || i === listed.length - 1 },
      ];
    }
    if (kind === 'kit.group') {
      const g = tabs.state.groups.find(x => x.id === arg); if (!g) return null;
      return [
        { type: 'label', label: groupName(g) },
        { type: 'choices', shape: 'swatch', items: GROUP_COLORS.map(([color, k]) => ({ color, label: t('group.color.' + k), checked: (g.color || null) === color, action: 'kit.group.color', arg: { id: g.id, color } })) },
        { id: 'g-icon', icon: 'smile-plus', label: t('group.icon'), submenu: { items: [{ type: 'choices', shape: 'icon', items: GROUP_ICONS.map(ic => ({ icon: ic, label: ic, checked: g.icon === ic, action: 'kit.group.icon', arg: { id: g.id, icon: ic } })) }] } },
        { id: 'g-rename', icon: 'pen', label: t('group.rename'), action: 'kit.group.rename', arg },
        { type: 'separator' },
        { id: 'g-new-tab', label: t('group.newTab'), action: 'kit.group.new-tab', arg },
        ...(desktop ? [{ id: 'g-window', label: t('group.toWindow'), action: 'kit.group.to-window', arg }] : []),
        { type: 'separator' },
        { id: 'g-ungroup', icon: 'ungroup', label: t('group.ungroup'), action: 'kit.group.ungroup', arg },
        ...(config.sidebar.bookmark ? [{ id: 'g-bookmark', icon: 'star', label: t('group.toBookmarks'), action: 'kit.group.to-bookmarks', arg }] : []),
        { id: 'g-delete', icon: 'trash', label: t('group.delete'), action: 'kit.group.delete', arg },
      ];
    }
    const f = config.contextMenus?.[kind];
    return f ? f(arg, state, api).map(i => i.type ? i : { ...i, label: text(i.label) }) : null;
  }

  /* split view items of the tab menu (measured on the reference): a new split from the open tab (h: one above the other, v: side by side),
     a split of the open tab with another one, and for a tab in a split: separate, close either view, swap and layout */
  function splitItem(tab) {
    const arg = tab.id, pair = tabs.splitOf(tab.id);
    if (pair?.b) {
      const v = pair.dir === 'v';
      return { id: 'tab-split', icon: 'columns', label: t('split.arrange'), submenu: { items: [
        { id: 'sp-separate', label: t('split.separate'), action: 'kit.split.separate', arg },
        { type: 'separator' },
        { id: 'sp-close-a', label: t(v ? 'split.closeLeft' : 'split.closeTop'), action: 'kit.tab.close', arg: pair.a },
        { id: 'sp-close-b', label: t(v ? 'split.closeRight' : 'split.closeBottom'), action: 'kit.tab.close', arg: pair.b },
        { type: 'separator' },
        { id: 'sp-swap', label: t('split.swap'), action: 'kit.split.swap', arg },
        { id: 'sp-layout', label: t('split.layout'), submenu: { items: [
          { id: 'sp-h', label: t('split.h'), checked: !v, action: 'kit.split.layout', arg: { tab: arg, dir: 'h' } },
          { id: 'sp-v', label: t('split.v'), checked: v, action: 'kit.split.layout', arg: { tab: arg, dir: 'v' } }] } },
      ] } };
    }
    return { id: 'tab-split', icon: 'columns', label: t(tab.id === tabs.state.active ? 'split.addNew' : 'split.withCurrent'), submenu: { items: [
      { id: 'sp-new-h', label: t('split.h'), action: 'kit.split.new', arg: { tab: arg, dir: 'h' } },
      { id: 'sp-new-v', label: t('split.v'), action: 'kit.split.new', arg: { tab: arg, dir: 'v' } }] } };
  }
  function makeSplit(a, b, dir) {
    tabs.state.splits = tabs.state.splits.filter(p => ![a, b].includes(p.a) && ![a, b].includes(p.b));
    tabs.state.splits.push({ a, b, dir, ratio: 0.5 });
    if (b) tabs.move(b, a, true);
    render(); saveSession();
  }

  /* ---------- First run (config.firstRun) ----------
     A full-window flow shown until it is finished once (kit.firstRun.done), and again from the action kit.firstRun.open.
     Steps are definitions: values start from the settings store (key) or the step's value; a step with setting: true writes its
     value to the store on Next, a step with action hands its value to that app action; switch rows write their setting at once. */
  let firstRun = null, frLayer = null;
  const frSteps = () => config.firstRun?.steps || [];
  function openFirstRun() {
    if (!config.firstRun) return;
    if (firstRun) clearInterval(firstRun.timer);
    const values = {};
    for (const st of frSteps()) {
      if (st.key) values[st.key] = settings.get(st.key) ?? (typeof st.value === 'function' ? st.value(state) : st.value);
      for (const o of st.kind === 'switches' || st.kind === 'done' ? st.options || [] : []) if (o.key) values[o.key] = settings.get(o.key);
    }
    const savedStep = settings.get('kit.firstRun.done') ? null : settings.get('kit.firstRun.step');
    /* a step id stored before the steps changed resumes at the step that took it over (aliases) */
    const index = Math.max(0, frSteps().findIndex(st => st.id === savedStep || (st.aliases || []).includes(savedStep)));
    firstRun = { index, values, checks: {}, open: [], scene: 0, timer: null, fields: {}, errors: {} };
    host.suspend?.(true);
    enterStep();
  }
  /* a step's definition value: a function of the shell state (live values the app keeps), or the value itself */
  const val = x => (typeof x === 'function' ? x(state, api) : x);
  const reduced = () => doc.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const cssMs = name => parseFloat(getComputedStyle(doc.documentElement).getPropertyValue(name)) || 0;
  /* entering a step: a checks step starts its checks once; the welcome picture turns its scenes (not with reduced motion) */
  function enterStep() {
    const st = frSteps()[firstRun.index];
    if (!settings.get('kit.firstRun.done')) settings.set('kit.firstRun.step', st.id);
    clearInterval(firstRun.timer); firstRun.timer = null;
    /* the welcome cards slide one by one; after the copy of the first card (index n) the track jumps back to 0 without a transition */
    const n = st.kind === 'welcome' ? val(st.scenes)?.length || 0 : 0;
    if (n > 1 && !reduced()) firstRun.timer = setInterval(() => {
      if (!firstRun) return;
      firstRun.scene = (firstRun.scene + 1) % (n + 1); renderFirstRun();
      if (firstRun.scene === n) setTimeout(() => { if (!firstRun || firstRun.scene !== n) return; firstRun.scene = 0; firstRun.jump = true; renderFirstRun(); firstRun.jump = false; }, cssMs('--fr-scene-in') + 50);
    }, cssMs('--fr-scene-hold'));
    if (st.kind === 'checks' && !firstRun.checks[st.id]) startChecks(st);
    renderFirstRun();
  }
  /* checks: the rows come in together, one after another by --motion-stagger (CSS), and are checked four at a time; when all have an
     answer they move into their groups (st.groups) after a short pause. Check again re-runs one row or all: a row checked again keeps its
     place and last answer with a spinner until the new answer, then moves to its group. Stop leaves the unfinished ones as stopped. */
  function startChecks(st, only) {
    const session = firstRun;
    const c = session.checks[st.id] ||= { order: [], results: {}, fresh: [], grouped: false, tok: {} };
    const ids = only ? [].concat(only) : (val(st.items) || []).map(o => o.id);
    if (!only) { c.grouped = false; c.fresh = ids.filter(id => !c.order.includes(id)); }
    const queue = [];
    for (const id of ids) {
      c.tok[id] = (c.tok[id] || 0) + 1; c.results[id] = c.results[id] ? { ...c.results[id], busy: true } : null; queue.push({ id, tok: c.tok[id] });
      if (!c.order.includes(id)) c.order.push(id);
    }
    c.running = ids.length > 0;
    const done = () => {
      if (Object.values(c.results).some(r => !r || r.busy)) return;
      c.running = false;
      clearTimeout(c.later); c.later = setTimeout(() => { if (firstRun === session && !c.running) { c.grouped = true; c.fresh = []; renderFirstRun(); } }, c.grouped ? 0 : cssMs('--motion-enter-dur') * 2);
    };
    const worker = async () => {
      while (queue.length && firstRun === session) {
        const { id, tok } = queue.shift();
        if (tok !== c.tok[id]) continue;
        let r;
        try { r = await st.check(id, api, () => firstRun === session && tok === c.tok[id]); } catch (e) { r = { group: st.failureGroup || st.groups.at(-1).id, kind: 'unknown', desc: { raw: String(e.message || e) } }; }
        if (firstRun !== session || tok !== c.tok[id]) continue;
        c.results[id] = r; done(); renderFirstRun();
      }
    };
    for (let i = 0; i < Math.min(4, ids.length); i++) worker();
    renderFirstRun();
  }
  function stopChecks() {
    const st = frSteps()[firstRun.index], c = firstRun.checks[st.id]; if (!c) return;
    for (const id of (val(st.items) || []).map(o => o.id)) {
      if (!c.order.includes(id)) c.order.push(id);
      if (c.results[id] && !c.results[id].busy) continue;
      c.tok[id] = (c.tok[id] || 0) + 1;
      c.results[id] = { group: st.failureGroup || st.groups.at(-1).id, kind: 'idle', desc: { raw: t('firstRun.stopped') }, action: { label: { raw: t('firstRun.recheckOne') }, action: 'kit.firstRun.recheck', arg: { id } } };
    }
    c.running = false; c.grouped = true; c.fresh = []; renderFirstRun();
  }
  /* the rows of the current connect step (its groups and the checks step's add group) */
  const frRows = st => [...(st.kind === 'connect' ? val(st.groups) || [] : []).flatMap(g => g.rows || []), ...(val(st.add)?.rows || [])];
  function applyFirstRunStep() {
    const st = frSteps()[firstRun.index], v = st?.key ? firstRun.values[st.key] : undefined;
    if (!st?.key) return;
    if (st.setting) settings.set(st.key, v);
    if (st.action) runAction(st.action, { arg: v });
  }
  function stepFirstRun(d, apply) {
    if (apply) applyFirstRunStep();
    firstRun.index = Math.max(0, Math.min(frSteps().length - 1, firstRun.index + d));
    enterStep();
  }
  function closeFirstRun() {
    settings.set('kit.firstRun.done', true);
    settings.set('kit.firstRun.step', null);
    clearInterval(firstRun.timer);
    firstRun = null; state.run = null; placeDock(); frLayer?.remove(); frLayer = null;
    host.suspend?.(false);
    render();
  }
  function refreshFirstRun() {
    if (!firstRun) return;
    const st = frSteps()[firstRun.index], c = firstRun.checks[st.id];
    if (st.kind === 'checks' && c) {
      const added = (val(st.items) || []).map(item => item.id).filter(id => !c.order.includes(id));
      if (added.length) { startChecks(st, added); return; }
    }
    renderFirstRun();
  }
  function renderFirstRun() {
    if (!firstRun) return;
    if (!frLayer) { frLayer = doc.createElement('div'); frLayer.dataset.firstRun = ''; doc.body.appendChild(frLayer); }
    const buttons = val(frSteps()[firstRun.index].buttons);
    const steps = frSteps(), st = steps[firstRun.index], marked = steps.filter(x => x.progress);
    const loc = x => (x == null ? x : text(val(x)));
    const choices = list => list?.map(o => ({ ...o, label: loc(o.label) }));
    /* a row's fields, status, preview and copy may be functions of the values typed so far */
    const row = r => { const v = firstRun.fields[r.id] || {}, of = x => (typeof x === 'function' ? x(v) : x), status = of(r.status), preview = of(r.preview), copy = of(r.copy);
      const field = f => Array.isArray(f) ? f.map(field) : { ...f, placeholder: loc(f.placeholder), label: loc(f.label), hint: loc(f.hint), lock: loc(f.lock), choices: choices(f.choices) };
      const submit = of(r.submit), flow = of(r.flow);
      return { ...r, label: loc(r.label), desc: loc(r.desc), badge: loc(r.badge), status: status && { ...status, label: loc(status.label) }, button: r.button && { ...r.button, label: loc(r.button.label) },
        submit: submit && { ...submit, label: loc(submit.label) }, fields: of(r.fields)?.map(field), preview, copy: copy && { ...copy, label: loc(copy.label) }, foot: of(r.foot)?.map(b => ({ ...b, label: loc(b.label) })), flow,
        /* the row's own button goes as its key: the connection row puts it in words (as in settings); the extra buttons are drawn here, in words */
        conn: r.conn && { ...r.conn, description: loc(r.conn.description), action: r.conn.action, extra: r.conn.extra?.map(btnOf), flow: r.conn.flow } }; };
    const btnOf = b => b && { ...b, label: loc(b.label) };
    const group = g => g && { ...g, label: loc(g.label), rows: g.rows.map(row) };
    const c = firstRun.checks[st.id];
    const step = { ...st, title: loc(st.title), description: loc(st.description), primary: loc(st.primary), skipTip: loc(st.skipTip), fieldLabel: loc(st.fieldLabel), placeholder: loc(st.placeholder), note: loc(st.note), disabled: !!val(st.disabled),
      lines: st.lines?.map(loc), more: loc(st.more), options: val(st.options)?.map(o => ({ ...o, label: loc(o.label), desc: loc(o.desc), sub: loc(o.sub), badge: loc(o.badge), choices: choices(val(o.choices)) })),
      flows: val(st.flows) || {},
      fields: firstRun.fields, errors: firstRun.errors, state: val(st.state), buttons: buttons?.map(b => ({ ...b, label: loc(b.label) })),
      scenes: val(st.scenes)?.map(x => ({ view: x.view, caption: loc(x.caption) })), items: val(st.items)?.map(o => ({ ...o, label: loc(o.label), checking: t('firstRun.checking') })), groups: st.kind === 'connect' ? val(st.groups)?.map(group) : st.groups?.map(g => ({ ...g, label: loc(g.label) })),
      add: group(val(st.add)), open: firstRun.open, stopLabel: t('firstRun.stop'), recheckLabel: t('firstRun.recheck'),
      checks: c && { ...c, results: Object.fromEntries(Object.entries(c.results).map(([k, r]) => [k, r && { ...r, desc: loc(r.desc), action: r.action && { ...r.action, label: loc(r.action.label) } }])) } }; /* no "last checked" line: a time of a check is meta text (the rows say their own state) */
    /* check rows that change place (into their groups) glide there from where they were */
    const before = new Map([...frLayer.querySelectorAll('[data-c="connection-row"][data-key]')].map(e => [e.dataset.key, e.getBoundingClientRect()]));
    morph(frLayer, C.firstRun.render({ step, values: firstRun.values, mark: config.brand.mark, back: t('firstRun.back'), skip: t('firstRun.skip'), scene: firstRun.scene, jump: firstRun.jump,
      dots: st.progress ? { count: marked.length, index: marked.indexOf(st) } : null }));
    if (!reduced()) for (const e of frLayer.querySelectorAll('[data-c="connection-row"][data-key]')) {
      const a = before.get(e.dataset.key), b = e.getBoundingClientRect();
      if (a && (Math.abs(a.left - b.left) > 1 || Math.abs(a.top - b.top) > 1)) e.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: cssMs('--motion-enter-dur'), easing: getComputedStyle(doc.documentElement).getPropertyValue('--motion-enter-ease').trim() });
    }
    if (!frLayer.contains(doc.activeElement) || doc.activeElement === doc.body) frLayer.querySelector('.fr-next .btn, .fr-left-foot .btn, #fr-email')?.focus({ preventScroll: true });
    placeDock();
  }
  /* the list of a first-run select: a done-step row (arg: its setting key) or a connect row field (arg: { row, key }) */
  function firstRunSelect(arg) {
    if (!firstRun) return null;
    const st = frSteps()[firstRun.index];
    const def = typeof arg === 'string' ? (val(st.options) || []).find(o => o.key === arg) : (typeof (frRows(st).find(r => r.id === arg.row)?.fields) === 'function' ? frRows(st).find(r => r.id === arg.row).fields(firstRun.fields[arg.row] || {}) : frRows(st).find(r => r.id === arg.row)?.fields || []).flat().find(f => f.key === arg.key);
    const cur = typeof arg === 'string' ? firstRun.values[arg] : firstRun.fields[arg.row]?.[arg.key];
    const caps = desktopInfo?.capabilities, out = o => !!(o.needs && caps && !caps[o.needs]);
    const m = C.select.menuDef({ options: (val(def?.choices) || []).map(o => ({ ...o, label: text(o.label) })), value: cur, action: 'kit.firstRun.set' });
    m.items = m.items.map((it, i) => ({ ...it, arg: typeof arg === 'string' ? { key: arg, value: it.id } : { ...arg, value: it.id }, disabled: out(val(def.choices)[i]) }));
    return m;
  }

  /* ---------- Actions ---------- */
  const kitActions = {
    'kit.update.details': () => {
      const status = updates?.status;
      if (status?.state !== 'error') return;
      ctx.dialog.open({ title: 'update.failed', body: C.codeBlock.render({ text: typeof status.error === 'string' ? status.error : '', compact: true }),
        submit: { label: 'update.retry', action: status.releaseVersion ? 'kit.update.download' : 'kit.update.check' } });
    },
    'kit.update.download': () => updates?.run('download'),
    'kit.update.cancel': () => updates?.run('cancel'),
    'kit.update.check': () => updates?.run('check'),
    'kit.navigate': a => navigate(a.arg.address, { newTab: a.arg.newTab }),
    'kit.tab.activate': a => activate(a.arg),
    'kit.topbar.button': a => { const b = topbarButtons()[a.arg], more = a.trigger || doc.querySelector('.topbar .tb-more'); if (!b) return; if (b.menu) requestAnimationFrame(() => ctx.menu.open(more, resolveMenu(b.menu, b.arg, more))); else if (b.action) runAction(b.action, { arg: b.arg }); },
    // unpinning a closed pinned tile removes it; any other tab moves between the tiles and the list
    'kit.tab.pin': a => { const tab = tabs.find(a?.arg ?? tabs.state.active); if (!tab || !config.sidebar.pinnedTabs) return; if (tab.unloaded) closeTab(tab.id, { unpin: true }); else setPinned(tab.id, !tab.pinned); },
    'kit.tab.next': () => stepTab(1),
    'kit.tab.prev': () => stepTab(-1),
    /* adding a tab to bookmarks hands its page to the app's bookmark action (config.sidebar.bookmark), which keeps the bookmark list */
    'kit.tab.bookmark': a => { const tab = tabs.find(a?.arg ?? tabs.state.active); if (tab && config.sidebar.bookmark) runAction(config.sidebar.bookmark, { arg: { address: tabs.current(tab).address, title: tab.title, icon: tab.icon } }); },
    'kit.tab.close': a => closeTab(a.arg),
    'kit.tab.close-active': () => tabs.state.active && closeTab(tabs.state.active),
    'kit.tab.close-others': a => tabs.state.tabs.filter(x => x.id !== a.arg && !x.pinned).map(x => x.id).forEach(closeTab),
    'kit.tab.close-below': a => { const listed = tabs.state.tabs.filter(x => !x.pinned), i = listed.findIndex(x => x.id === a.arg); listed.slice(i + 1).map(x => x.id).forEach(closeTab); },
    'kit.tab.new': () => navigate(startAt(), { newTab: true, first: true, fresh: true }),
    'kit.tab.new-below': a => openBelow(startAt(), a.arg),
    'kit.tab.duplicate': a => { const tab = tabs.find(a.arg); if (tab) openBelow(tabs.current(tab).address, tab.id); },
    'kit.tab.reopen': a => reopenTab(typeof a?.arg === 'string' ? a.arg : undefined),
    'kit.tab.mute': a => { const tab = tabs.find(a?.arg ?? tabs.state.active); if (!tab || !host.mute) return; tab.muted = !tab.muted; host.mute(tab.id, tab.muted); },
    'kit.home': () => navigate(startAt()),
    'kit.split.new': a => { const id = a.arg.tab; if (id === tabs.state.active) makeSplit(id, null, a.arg.dir); else makeSplit(tabs.state.active, id, a.arg.dir); },
    'kit.split.choose': a => { const pair = activePair(); if (!pair) return; const tab = tabs.find(a.arg); if (tab?.pinned) setPinned(tab.id, false); makeSplit(pair.a, a.arg, pair.dir); activate(a.arg); },
    'kit.split.separate': a => { const pair = tabs.splitOf(a?.arg || tabs.state.active); if (!pair) return; tabs.state.splits = tabs.state.splits.filter(p => p !== pair); render(); saveSession(); },
    'kit.split.swap': a => { const pair = tabs.splitOf(a.arg); if (!pair?.b) return; [pair.a, pair.b] = [pair.b, pair.a]; tabs.move(pair.a, pair.b, false); render(); saveSession(); },
    'kit.split.layout': a => { const pair = tabs.splitOf(a.arg.tab); if (!pair) return; pair.dir = a.arg.dir; render(); saveSession(); },
    'kit.tab.to-window': a => { const tab = tabs.find(a.arg); if (!tab || !desktop) return; desktop.invoke('window:new', { open: { addresses: [tabs.current(tab).address] } }); closeTab(tab.id, { unpin: true }); },
    'kit.group.to-window': a => { const g = tabs.state.groups.find(x => x.id === a.arg), members = membersOf(a.arg); if (!g || !members.length || !desktop) return; desktop.invoke('window:new', { open: { addresses: members.map(m => tabs.current(m).address), group: { name: g.name, color: g.color, icon: g.icon } } }); members.forEach(m => closeTab(m.id)); },
    'kit.group.icon': a => { const g = tabs.state.groups.find(x => x.id === a.arg.id); if (g) { g.icon = a.arg.icon; renderSidebar(); saveSession(); } },
    'kit.tab.group-new': a => { const tab = tabs.find(a.arg); if (!tab) return; const id = `g${Date.now().toString(36)}${++groupSeq}`; tabs.state.groups.push({ id, name: '', color: null, icon: null, collapsed: false }); joinGroup(tab, id); },
    'kit.tab.group-add': a => { const tab = tabs.find(a.arg.tab); if (tab) joinGroup(tab, a.arg.group); },
    'kit.tab.group-remove': a => { const tab = tabs.find(a.arg); if (!tab) return; tab.group = null; dropEmptyGroups(); renderSidebar(); saveSession(); },
    'kit.group.toggle': a => { const g = tabs.state.groups.find(x => x.id === a.arg); if (g) { g.collapsed = !g.collapsed; renderSidebar(); saveSession(); } },
    'kit.group.color': a => { const g = tabs.state.groups.find(x => x.id === a.arg.id); if (g) { g.color = a.arg.color; renderSidebar(); saveSession(); } },
    /* rename in place in the group header (measured) and in a tab row: the name box takes the caret with the name selected */
    'kit.group.rename': a => { const g = tabs.state.groups.find(x => x.id === a.arg); if (!g) return; if (g.collapsed) g.collapsed = false; startRename(g.id); },
    'kit.group.renamed': a => { const g = tabs.state.groups.find(x => x.id === a.arg); state.renaming = null; if (g) { g.name = a.values.name.trim(); saveSession(); } renderSidebar(); },
    'kit.tab.rename': a => { if (tabs.find(a.arg)) startRename(a.arg); },
    'kit.tab.renamed': a => { const tab = tabs.find(a.arg); state.renaming = null; if (tab) { tab.name = a.values.name.trim(); saveSession(); renderTopbar(); syncMenu(); } renderSidebar(); },
    'kit.rename.cancel': () => { state.renaming = null; renderSidebar(); },
    /* a group becomes a bookmark folder (measured): a dialog names the folder, saving hands the folder to the app's bookmark action and closes the group's tabs */
    'kit.group.to-bookmarks': a => { const g = tabs.state.groups.find(x => x.id === a.arg); if (g && config.sidebar.bookmark) ctx.dialog.open({ title: 'group.toBookmarks.title', description: 'group.toBookmarks.desc', fields: [{ key: 'name', label: 'group.name', type: 'text', value: groupName(g), required: true }], submit: { label: 'dialog.save', action: 'kit.group.bookmarked', arg: g.id } }); },
    'kit.group.bookmarked': a => {
      const members = membersOf(a.arg); if (!members.length) return;
      runAction(config.sidebar.bookmark, { arg: { folder: a.values.name.trim(), items: members.map(m => ({ address: tabs.current(m).address, title: tabLabel(m), icon: m.icon })) } });
      members.forEach(m => closeTab(m.id));
    },
    'kit.folder.toggle': a => { state.folders[a.arg] = !state.folders[a.arg]; renderSidebar(); },
    'kit.group.new-tab': a => { const last = membersOf(a.arg).pop(); if (!last) return; openBelow(startAt(), last.id); const nt = tabs.active(); if (nt) joinGroup(nt, a.arg); },
    'kit.group.ungroup': a => { for (const x of membersOf(a.arg)) x.group = null; dropEmptyGroups(); renderSidebar(); saveSession(); },
    'kit.group.delete': a => membersOf(a.arg).map(x => x.id).forEach(id => closeTab(id)),
    'kit.group.close': a => membersOf(a.arg).map(x => x.id).forEach(id => closeTab(id)),
    'kit.zoom.in': () => zoomBy(1),
    'kit.zoom.out': () => zoomBy(-1),
    'kit.zoom.reset': () => zoomBy(0),
    'kit.zoom.show': () => zoomBy(null),
    /* an app dialog from a shell row (a first-run link row): the dialog opens over the shell document, the first-run screen included */
    'kit.dialog.open': a => { const def = config.dialogs?.[a.arg?.id]?.(a.arg.arg, state, api); if (def) ctx.dialog.open(def); },
    'kit.terminal.expand': () => { if (!dock?.classList.contains('open') || firstRun) return; dockExpanded = !dockExpanded; syncDock(); },
    'kit.terminal.toggle': () => {
      if (terminalOutputs.closeActive()) return;
      if (state.run) { state.run = null; syncDock(); return; }
      const key = termKey(), tab = termTab();
      if (!key || !tab) return;
      if (activeTerminalOpen(key)) openTerminals.delete(tab.id);
      else openTerminals.set(tab.id, key);
      render();
    },
    'kit.firstRun.open': () => openFirstRun(),
    'kit.firstRun.next': () => stepFirstRun(1, true),
    'kit.firstRun.skip': () => stepFirstRun(1, false),
    'kit.firstRun.back': () => stepFirstRun(-1, false),
    /* finishing opens the last step's open address (a function of the state: what the flow connected) in the current tab */
    'kit.firstRun.finish': a => { applyFirstRunStep(); const to = val(frSteps().at(-1).open); closeFirstRun(); if (a?.arg?.address) navigate(a.arg.address, { newTab: true }); else if (to) navigate(to); },
    'kit.firstRun.pick': a => { const { key, value, multi } = a.arg, v = firstRun.values; if (multi) { const cur = new Set(v[key] || []); if (cur.has(value)) cur.delete(value); else cur.add(value); v[key] = [...cur]; } else v[key] = value; renderFirstRun(); },
    /* a switch row writes its setting at once; with { key, item } it adds or removes one item of a list setting */
    'kit.firstRun.switch': a => {
      if (typeof a.arg === 'object') { const cur = new Set(settings.get(a.arg.key) || []); if (a.on) cur.add(a.arg.item); else cur.delete(a.arg.item); firstRun.values[a.arg.key] = [...cur]; settings.set(a.arg.key, [...cur]); }
      else { firstRun.values[a.arg] = !!a.on; settings.set(a.arg, !!a.on); }
      renderFirstRun();
    },
    'kit.firstRun.recheck': a => { const st = frSteps()[firstRun.index]; if (st.kind === 'checks') startChecks(st, a?.arg?.id); },
    'kit.firstRun.stop': () => stopChecks(),
    /* a connect row opens or closes; in an exclusive group opening one closes the others. Its fields keep what was typed */
    'kit.firstRun.toggle': a => {
      const st = frSteps()[firstRun.index], id = a.arg.row, g = [...(st.kind === 'connect' ? val(st.groups) || [] : []), val(st.add)].find(x => x?.rows.some(r => r.id === id));
      const opening = !firstRun.open.includes(id), siblings = g?.exclusive ? g.rows.map(r => r.id) : [id];
      firstRun.open = [...firstRun.open.filter(x => !siblings.includes(x)), ...(opening ? [id] : [])];
      renderFirstRun();
      if (opening) frLayer.querySelector(`[data-fr-row="${id}"] [data-field]`)?.focus({ preventScroll: true });
    },
    'kit.firstRun.submit': a => {
      const st = frSteps()[firstRun.index], r = frRows(st).find(x => x.id === a.arg.row), form = frLayer.querySelector(`[data-fr-row="${a.arg.row}"]`);
      if (!r?.submit || !form) return;
      const values = { ...Object.fromEntries(Object.entries(firstRun.fields[a.arg.row] || {})), ...Object.fromEntries([...form.querySelectorAll('[data-field]')].map(f => [f.dataset.field, f.value.trim()])) };
      /* validating: each field's own check (required, validate(value, values) -> message key); errors show on the fields and in the row status */
      const defs = (typeof r.fields === 'function' ? r.fields(firstRun.fields[a.arg.row] || {}) : r.fields || []).flat();
      const errs = Object.fromEntries(defs.map(f => [f.key, f.required && !values[f.key] ? text(f.requiredText || 'firstRun.required') : f.validate?.(values[f.key] || '', values)]).filter(([, e]) => e).map(([k, e]) => [k, text(e)]));
      firstRun.errors[a.arg.row] = errs;
      if (Object.keys(errs).length) { renderFirstRun(); return; }
      for (const f of form.querySelectorAll('[data-field][type="password"]')) f.value = ''; // a secret does not stay in the page
      for (const f of defs) if (f.type === 'password' && firstRun.fields[a.arg.row]) delete firstRun.fields[a.arg.row][f.key];
      renderFirstRun();
      runAction((typeof r.submit === 'function' ? r.submit(firstRun.fields[a.arg.row] || {}) : r.submit).action, { arg: (typeof r.submit === 'function' ? r.submit(firstRun.fields[a.arg.row] || {}) : r.submit).arg, values });
    },
    /* a connect row field changed: keep its value, clear its error and redraw when the row shows something made from the values */
    'kit.firstRun.input': a => {
      if (!firstRun) return; const { row, key, value } = a.arg; firstRun.fields[row] = { ...firstRun.fields[row], [key]: value };
      const had = firstRun.errors[row]?.[key]; if (had) delete firstRun.errors[row][key];
      const r = frRows(frSteps()[firstRun.index]).find(x => x.id === row);
      if (had || typeof r?.preview === 'function' || typeof r?.copy === 'function' || typeof r?.submit === 'function' || typeof r?.status === 'function') renderFirstRun();
    },
    'kit.firstRun.set': a => {
      if (!firstRun) return;
      if (a.arg.row) { firstRun.fields[a.arg.row] = { ...firstRun.fields[a.arg.row], [a.arg.key]: a.arg.value }; renderFirstRun(); return; }
      firstRun.values[a.arg.key] = a.arg.value; settings.set(a.arg.key, a.arg.value); renderFirstRun();
    },
    'kit.firstRun.copy': a => {
      const st = frSteps()[firstRun.index], r = frRows(st).find(x => x.id === a.arg.row), v = firstRun.fields[a.arg.row] || {};
      const p = typeof r?.preview === 'function' ? r.preview(v) : r?.preview; if (!p?.text) return;
      doc.defaultView.navigator.clipboard?.writeText(p.text).catch(() => {}); api.toast({ title: 'message.copied', tone: 'ok' });
    },
    'kit.app.quit': () => desktop?.invoke('app:quit'),
    'kit.app.quit-cancel': () => desktop?.invoke('app:quit-cancel'),
    'kit.history.back': () => historyStep(-1),
    'kit.history.forward': () => historyStep(1),
    'kit.history.reload': a => { const id = a?.arg || navTab()?.id; if (id) host.reload(id); },
    'kit.sidebar.toggle': () => { state.sidebarHidden = !state.sidebarHidden; render(); },
    'kit.panel.toggle': () => { const c = cardOf('ai'); if (c) closeDetailAt(c); else askCard({}); }, // the ask button and its shortcut: the conversation card opens or closes
    'kit.panel.new': () => askCard({}),
    'kit.palette.open': a => openPalette(a?.arg === 'tabs' ? 'tabs' : null),
    'kit.settings.open': a => { const r = config.routes.find(x => x.kind === 'settings'); if (r) navigate(router.build(r.id, { page: a?.arg || config.settings.groups[0].pages[0].id }), { newTab: true }); },
    'kit.setting.set': a => settings.set(a.arg.key, a.arg.value),
    'kit.menu.open': a => { const el = doc.querySelector(`[data-menu="${a.arg}"]`); if (el) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); },
    'kit.context-choice': a => { pendingChoice?.(a.arg); pendingChoice = null; },
    /* composer: dictate in the focused input */
    'kit.composer.voice': () => dictate(),
    /* a shortcut field in the shell is capturing keys: the app shortcuts pause meanwhile (pages send page:shortcuts-suspend) */
    'kit.shortcuts.suspend': a => { desktop?.invoke('shortcuts:suspend', !!a.on).catch(() => {}); },
    'section-toggle': a => { state.collapsed[a.id] = a.collapsed; settings.set('kit.collapsed', { ...state.collapsed }); },
    'reorder': a => { if (a.group === 'tabs' || a.group === 'tiles') { tabs.move(a.id, a.target, a.after); renderSidebar(); saveSession(); } },
  };
  function runAction(name, payload = {}, opts = {}) {
    const f = kitActions[name] || config.actions?.[name];
    if (!f) { console.error(`unknown action: ${name}`); return; }
    const bound = f === config.actions?.[name] ? terminalOutputs.bindAction(payload, opts.sourceTabId ?? tabs.state.active) : payload;
    const r = f(bound, api);
    if (r && r.then) r.catch(e => console.error(e));
  }
  function runShortcut(keys) {
    if (firstRun) return false; // the first-run screen covers the app
    const s = keys && shortcuts.find(x => x.keys === keys);
    if (!s) return false;
    if (s.action.startsWith('kit.palette') && !features.palette) return false;
    runAction(s.action, { arg: s.arg });
    return true;
  }

  /* ---------- Palette ---------- */
  /* mode 'tabs' (search tabs, ⇧⌘A): the open and recently closed tabs only */
  async function openPalette(mode = null) {
    if (!features.palette) return;
    const groups = [{ label: t('palette.openTabs'), rows: tabs.state.tabs.filter(tb => !tb.unloaded).map(tb => ({ id: tb.id, icon: tb.icon || 'globe', fav: isPage(tb), label: tabLabel(tb), end: t('palette.switch'), endIcon: 'arrow-up-right', action: 'kit.tab.activate', arg: tb.id })) }];
    if (tabs.state.closed.length) groups.push({ label: t('palette.recentlyClosed'), rows: [...tabs.state.closed].reverse().slice(0, 5).map(tb => ({ id: 'c' + tb.id, icon: tb.icon || 'globe', fav: isPage(tb), label: tabLabel(tb), end: t('palette.reopen'), endIcon: 'arrow-up-right', action: 'kit.tab.reopen', arg: tb.id })) });
    if (mode === 'tabs') { ctx.palette.open({ groups, placeholder: t('palette.placeholder') }); return; }
    /* a source row that opens a place already open in a tab is left out: the open tab's row stands for it */
    const open = new Set(tabs.state.tabs.filter(tb => !tb.unloaded).map(tb => tb.entries?.[tb.index]?.address));
    for (const src of config.palette?.sources || []) {
      const items = (await src.search('', {})).filter(i => !(i.action === 'kit.navigate' && open.has(i.arg?.address)));
      // a source's group label may follow the state (for example the screens of the chosen item under its name)
      groups.push({ label: text(typeof src.label === 'function' ? src.label(settings.all()) : src.label), queryOnly: !!src.queryOnly, limit: src.limit, rows: items.map(i => ({ ...i, label: text(i.label), end: i.end ? text(i.end) : '' })) });
    }
    /* every settings page, named the way its tab is ('Settings › page'): typing a page's name finds it */
    const pages = (config.settings?.groups || []).flatMap(g => g.pages);
    if (pages.length) groups.push({ label: t('settings.title'), rows: pages.map(pg => ({ id: 'set-' + pg.id, icon: pg.icon, label: `${t('settings.title')} › ${text(pg.label)}`, action: 'kit.settings.open', arg: pg.id })) });
    ctx.palette.open({ groups, placeholder: config.palette?.placeholder ? text(config.palette.placeholder) : t('palette.placeholder'), keys: config.palette?.keys });
  }

  /* ---------- Wiring ---------- */
  const ctx = attachAll(doc, {
    emit: (name, payload, opts) => runAction(name, payload, opts),
    resolveMenu, resolveContext,
    resolveDialog: (id, arg) => config.dialogs?.[id]?.(arg, state, api) || null,
    // tab preview card: name, path and, on the desktop, the page picture and memory use
    resolvePreview: async id => { const tab = tabs.find(id); if (!tab) return null; const extra = host.preview ? await host.preview(id) : null; return { title: tabLabel(tab) || text('tab.loading'), sub: chipFor(tab).sub, ...(extra || {}) }; },
    nativeMenu: desktop ? (items, pos) => host.contextMenu(items, pos) : null,
    nativeSurface: desktop ? (def, pos) => desktop.invoke('surface:open', def, pos).catch(() => {}) : null,
    onOverlay: (on, el, o) => host.setOverlay(on, el, o),
  });
  doc.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.closest('.menu, .dlg-layer') || el.matches('[data-menu]')) return; // menus and dialogs run their own buttons
    if (el.closest('.sw-row, .pal-row')) return;
    if (el.classList.contains('sb-row') && e.target.closest('.x')) return;
    const arg = el.dataset.arg ? JSON.parse(el.dataset.arg) : undefined;
    runAction(el.dataset.action, { arg });
  });
  doc.addEventListener('keydown', e => {
    if (e.target.closest?.('.sb-row, .pt-tile') && !e.target.matches?.('input') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.target.click(); return; }
    if (!(e.metaKey || e.ctrlKey) && e.key !== 'Escape') return;
    if (runShortcut(shortcutOf(e))) e.preventDefault();
  });
  if (desktop) desktop.on('shortcut', keys => runShortcut(keys));
  if (desktop) desktop.on('surface-choice', p => { if (p?.action) runAction(p.action, { arg: p.arg }); });
  // menu bar items without a key run a tab action on the open tab
  if (desktop) desktop.on('action', (name, arg) => { if (/^kit\./.test(name)) runAction(name, { arg: arg ?? (/^kit\.tab\./.test(name) ? tabs.state.active : undefined) }); });
  /* quitting asks first (desktop quitConfirm): the reference's question in the window, Esc cancels, the same quit key quits */
  if (desktop) desktop.on('quit-request', () => ctx.dialog.open({ icon: 'circle-x', size: 'md', title: { raw: t('quit.title', { name: text(config.brand.name) }) }, description: 'quit.description',
    cancelKbd: 'Esc', onCancel: 'kit.app.quit-cancel', submit: { label: 'quit.confirm', variant: 'danger', kbd: '⌘Q', action: 'kit.app.quit' } }));
  /* System theme changes (OS setting while the app follows the system) reach the shell and every tab page at once */
  doc.defaultView.addEventListener('languagechange', () => { if ((settings.get('kit.locale') || 'system') === 'system') { const code = applyLocale(); if (code !== localeCode) { localeCode = code; host.broadcast(envelope('shell:locale', { locale: code })); render(); } } });
  const followSystem = () => { const nt = applyTheme(); if (nt !== theme) { theme = nt; host.broadcast(envelope('shell:theme', { theme })); } };
  if (desktop) desktop.on('theme', followSystem);
  // a click inside a split pane's page makes that tab the open one
  if (desktop) desktop.on('tab-focus', id => { const pair = activePair(); if (pair && (pair.a === id || pair.b === id) && id !== tabs.state.active) activate(id); });
  doc.defaultView.addEventListener('resize', () => { if (activePair() || chain.length) applyPanes(); });
  doc.defaultView.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', followSystem);
  applyShortcuts();
  if (desktop) desktop.invoke('spellcheck:set', settings.get('kit.spellcheck') !== false).catch(() => {});

  /* First tabs: last session or the start address */
  const session = features.restoreSession && !secondWindow && settings.get('kit.startup') !== 'new' ? settings.get('kit.session') : null;
  renderFrame();
  if (session && tabs.restore(session)) {
    /* a page that is gone (a removed or unknown route, such as a page an older version had) is not restored as "not found": history steps to it
       are dropped, a tab on it comes back on the place the app restores to (once; a second one, or one already open there, is dropped), and
       with no such place (config.start answers nothing when restoring) the tab is dropped */
    const gone = a => !!router.parse(a)?.notFound;
    const back = startAt(true), there = new Set();
    tabs.state.tabs = tabs.state.tabs.filter(x => {
      if (x.kind === 'tool') return true;
      const now = tabs.current(x), keep = x.entries.filter(e => !gone(e?.address));
      if (now && !gone(now.address)) { x.entries = keep; x.index = keep.indexOf(now); there.add(now.address); return true; }
      x.gone = true; return true;
    }).filter(x => {
      if (!x.gone) return true;
      delete x.gone;
      if (!back || there.has(back)) return false;
      there.add(back); x.entries = [{ address: back, title: '' }]; x.index = 0; x.title = ''; x.icon = null;
      return true;
    });
    /* a tool found at run time had an address for that run only: its tab comes back only when the app said how to open it again (toolDef.reopen),
       named by its tool, and waits (preparing) while the app opens it again into the same tab */
    const known = x => (config.tools || []).some(c => c.id === x.toolId);
    tabs.state.tabs = tabs.state.tabs.filter(x => x.kind !== 'tool' || known(x) || x.toolDef?.reopen?.action);
    const again = tabs.state.tabs.filter(x => x.kind === 'tool' && !known(x));
    for (const tab of again) { if (!liveTools.some(x => x.id === tab.toolDef.id)) liveTools.push(tab.toolDef); tab.preparingTool = true; tab.toolDocument = 'loading'; }
    if (!tabs.state.tabs.some(x => x.id === tabs.state.active)) tabs.state.active = tabs.state.tabs[0]?.id || null;
    for (const tab of tabs.state.tabs) if (!tab.preparingTool) host.create(tab.id, tabs.current(tab).address, { toolId: tab.toolId });
    if (tabs.state.active) host.show(tabs.state.active); else navigate(startAt(), { newTab: true });
    for (const tab of again) runAction(tab.toolDef.reopen.action, { arg: tab.toolDef.reopen.arg }, { sourceTabId: tab.id });
  } else if (moved?.addresses?.length) {
    // a tab or group moved from another window opens here (as the same group)
    const id = moved.group ? `g${Date.now().toString(36)}${++groupSeq}` : null;
    if (id) tabs.state.groups.push({ id, name: moved.group.name || '', color: moved.group.color || null, icon: moved.group.icon || null, collapsed: false });
    for (const address of moved.addresses.filter(x => router.isInternal(x))) navigate(address, { newTab: true, fresh: true });
    if (id) for (const tab of tabs.state.tabs) tab.group = id;
    if (!tabs.state.tabs.length) navigate(startAt(), { newTab: true });
  } else navigate(startAt(), { newTab: true });
  render();
  if (updates) { void updates.start(); doc.defaultView.addEventListener('pagehide', () => updates.stop(), { once: true }); }
  config.onStart?.(api); // the app's own start work (reading local files through its services, status refresh)
  if (config.firstRun && !settings.get('kit.firstRun.done') && !secondWindow) openFirstRun();
  return { api, state, tabs, host, runAction };
}
