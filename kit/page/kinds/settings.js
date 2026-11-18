/*
 * Settings page: builds the nav and body from the definition (config.settings). Pages only hold data; every element is a kit component.
 *   groups: [{ label, pages: Page[] }]; tabIcon?: a shared tab mark, independent of each page navigation icon.
 *   Page: { id, label, icon, activeIcon?, title?, help?, badge?, children?: Page[] | (state) => Page[], promote?, tabs?, tabsEnd?: Control, initAction?, sections: Section[] | (ctx) => Section[] }
 *   children as a function builds the one-level subpages from data (one per connected item); state is { settings }.
 *   Section: { title?, description?, count?, badge?: { label, tone? }, tab?,
 *              groups?: (Row[] | { notice?: { text, action?: Control }, rows: Row[] })[],
 *              intro?: { title, description?, actions?: Control[], picture?: { icon } },
 *              faq?: { id, title, body }[],
 *              records?: { start?: Control[], end?: Control[], rows: Record[] | (ctx) => Record[], empty },
 *              empty?: { icon, title, description?, action?: Control },
 *              toolbar?: { start?: Control[], end?: Control[] } (above the groups), none?: { icon, title } (when the groups are empty: one muted line),
 *              pending?: Promise (reads still under way: when it settles the page builds its sections again, so a slow source never holds the page) }
 *   sections(ctx) gets ctx.fresh = true when the person asked to read again (kit.settings.reload), so a page can drop what it kept of a failed read.
 *   Row: { id, title, description?, icon?, tile?, avatar?, dot?, control?: Control, extra?: Control[], stack?: Control, trail?: 'chevron'|'external',
 *          action?, arg?, menu?, dialog?, variant?: 'add', wideControl?, desktop? (only in the desktop app),
 *          connection?: { kind, busy?, attention?, action?, extra?: Control[], rowAction?, rowArg?, flow?, open?, fresh?, form?: { fields: { key, placeholder?, label?, type? }[], submit: { label, action, arg? } } }
 *                       (a connection row with its steps; form: the value line in its body) }
 *   Control: { type: 'switch', key, default?, disabled? } | { type: 'select', key, options, multi?, placeholder?, disabled?, default?, action?, selected? } | { type: 'split', key, options, menu }
 *          | { type: 'button', label?, icon?, variant?, size?, action?, arg?, menu?, dialog? } | { type: 'kbd', keys, menu?, record?: key, reset? } | { type: 'kbd', shortcut: id }
 *          | { type: 'search', key, placeholder, width? } (writes its text to the setting as it changes)
 *          | { type: 'value', text } | { type: 'badge', tone, label } | { type: 'status', state, tip?, menu? } | { type: 'more', menu, arg? }
 *          | { type: 'progress', value, tone? } | { type: 'link', label, icon?, action?, arg? } | { type: 'choices', key, options: { id, label, picture?: { icon } | { look } }[] }
 *          | { type: 'group', items: Control[] } | { type: 'state', kind: 'ok'|'fix'|'error'|'perm'|'unknown'|'busy', label, tip?, icon?, labeled? } (status icon and its short text; icon: its own shape;
 *            labeled keeps the text on a healthy state too, for cells that line up in columns such as allowed and denied permissions)
 *   Record: { icon?, avatar?, title, meta?: Text[], end?: Text, tone? }
 * Values live in the settings store (shell); changes are reported with page:setting-set.
 */
import { html } from '../../core/html.js';
import { icon } from '../../icons/icons.js';
import { components as C } from '../../components/index.js';
import { defaultShortcuts, effectiveShortcuts } from '../../core/shortcuts.js';
import { keyLabel } from '../../core/keys.js';
import { playChime } from '../../core/sound.js';
import { ZOOM_STEPS } from '../../core/zoom.js';
import { KIT_DEFAULTS } from '../../core/settings-store.js';

export function createSettingsPage(ctx) {
  const { config, text, t } = ctx;
  const kids = p => (typeof p.children === 'function' ? p.children({ settings: { ...config.settings.defaults, ...ctx.settings() } }) : p.children) || null;
  const allPages = () => config.settings.groups.flatMap(g => g.pages.flatMap(p => [p, ...(kids(p) || [])]));
  const pageId = ctx.params.page || allPages()[0].id;
  /* a subpage built from data may appear only once the settings arrive: until then it is an empty page of its own id */
  const findPage = () => allPages().find(p => p.id === pageId) || (ctx.params.page ? { id: pageId, label: { raw: '' }, sections: [] } : allPages()[0]);
  let page = findPage();
  let sections = [], loading = false, loadError = null, loadVersion = 0;
  const records = {};
  const tabState = {};

  const settingsRoute = config.routes.find(r => r.kind === 'settings');
  const addressOf = id => ctx.router.build(settingsRoute.id, { page: id });
  const value = key => ctx.settings()[key] ?? config.settings.defaults?.[key] ?? KIT_DEFAULTS[key];
  // kit keys bring their own options when the definition gives none (kit.zoom: the zoom steps)
  const KIT_OPTIONS = { 'kit.zoom': () => ZOOM_STEPS.map(z => ({ id: String(z), label: { raw: C.zoomIndicator.percent(z) } })) };
  const optionsOf = c => (typeof c.options === 'function' ? c.options(ctx) : c.options) || KIT_OPTIONS[c.key]?.() || [];
  const selectedOf = c => c.selected ? c.selected(ctx) : value(c.key);
  const picture = p => p?.icon ? icon(p.icon, 'xl') : p?.look ? C.windowLook.render({ look: p.look, wallpaper: ctx.desktopInfo?.()?.wallpaper }) : '';
  // an option that needs a system capability (needs: 'translucent') is unavailable where the desktop host cannot draw it; the row says why
  const caps = () => ctx.desktopInfo?.()?.capabilities;
  const unavailable = o => !!(o.needs && (ctx.desktop || caps()) && !caps()?.[o.needs]);
  const reasonOf = c => c?.type === 'choices' && optionsOf(c).some(unavailable) ? t(`desktop.unavailable.${caps()?.reason || 'other'}`) : '';

  const setValue = (key, next) => ctx.api.setSetting(key, next);

  /* name: the row's title, the accessible name of a switch or select that has no label of its own (a select also says its value) */
  function control(c, name = '') {
    if (!c) return '';
    const named = v => (c.label ? text(c.label) : name ? (v ? `${name}, ${v}` : name) : undefined);
    switch (c.type) {
      case 'switch': return C.toggle.render({ on: !!(value(c.key) ?? c.default), action: 'kit.settings.switch', arg: c.key, label: named(), disabled: c.disabled });
      case 'select': {
        // a multi list shows the chosen labels, or with summary { all, none, some } a word for all, none or the count ({n})
        if (c.multi) { const all = optionsOf(c), v = value(c.key) || [], on = all.filter(o => o.fixed || v.includes(o.id)), labels = on.map(o => text(o.label));
          const shown = c.summary ? (on.length === all.length ? text(c.summary.all) : !on.length ? text(c.summary.none) : t(c.summary.some, { n: on.length })) : labels.length ? labels.join(', ') : text(c.placeholder);
          /* with a summary the trigger shows one word ("none" is a value too): it draws as every single select does (R5-08) */
          return C.select.render({ value: shown, menu: 'kit.settings.select', arg: c.key, multi: !c.summary, placeholder: !c.summary && !on.length, disabled: c.disabled, width: c.width, label: named(shown) }); }
        /* a number stored before the choices changed (a check every 30 s, now 2·5·10 min) shows as the nearest choice: what the app uses */
        const opts = optionsOf(c), cur = selectedOf(c), num = Number(cur);
        const nearest = cur != null && cur !== '' && Number.isFinite(num) && opts.length && opts.every(x => Number.isFinite(Number(x.id)))
          ? opts.reduce((a, b) => (Math.abs(Number(b.id) - num) < Math.abs(Number(a.id) - num) ? b : a)) : null;
        const o = opts.find(x => x.id === cur) || nearest || opts.find(x => x.id === c.default);
        return C.select.render({ value: o ? text(o.label) : text(c.placeholder), icon: o?.icon, menu: 'kit.settings.select', arg: c.key, width: c.width, placeholder: !o, disabled: c.disabled, label: named(o ? text(o.label) : '') });
      }
      case 'split': { const o = optionsOf(c).find(x => x.id === value(c.key)); return C.splitButton.render({ main: C.select.render({ value: o ? text(o.label) : '', icon: o?.icon, menu: 'kit.settings.select', arg: c.key, chevron: 'down' }), menu: c.menu, arg: c.arg, variant: 'more' }); }
      case 'button': {
        const b = C.button.render({ label: c.label ? text(c.label) : undefined, icon: c.icon, iconEnd: c.iconEnd, variant: c.variant || 'secondary', size: c.size, action: c.action, arg: c.arg, menu: c.split ? undefined : c.menu, dialog: c.dialog, tip: c.tip ? text(c.tip) : undefined, disabled: c.disabled });
        return c.split ? C.splitButton.render({ main: b, menu: c.split, variant: c.variant || 'secondary' }) : b;
      }
      case 'kbd': if (c.shortcut) { const cur = keysOf(c.shortcut), def = defaultOf(c.shortcut); return C.shortcut.render({ edit: true, keys: cur ? [keyLabel(cur)] : [], action: 'kit.settings.shortcut-set', arg: c.shortcut, menu: 'kit.settings.shortcut-menu', label: c.label ? text(c.label) : undefined, name: name || undefined, tip: def?.keys ? t('shortcut.default', { keys: keyLabel(def.keys) }) : undefined }); }
        return C.shortcut.render({ keys: c.record ? value(c.record) || c.keys : c.keys, menu: c.menu, arg: c.arg ?? c.record, record: !!c.record, action: 'kit.settings.shortcut', reset: c.reset ? 'kit.settings.shortcut-reset' : undefined, label: c.label ? text(c.label) : undefined, name: name || undefined });
      case 'value': return C.value.render({ text: text(c.text), mono: c.mono });
      case 'badge': return C.badge.render({ tone: c.tone, label: text(c.label) });
      case 'more': return C.iconButton.render({ icon: 'more', size: 'sm', menu: c.menu, arg: c.arg, tip: t('settings.more'), label: name ? `${t('settings.more')}, ${name}` : undefined }); /* named with its row (B3-13) */
      case 'progress': return C.progress.render({ value: c.value, tone: c.tone });
      case 'link': return C.button.render({ label: text(c.label), icon: c.icon, variant: 'link', action: c.action, arg: c.arg });
      case 'search': return C.searchInput.render({ placeholder: text(c.placeholder), value: value(c.key) || '', action: 'kit.settings.filter', arg: c.key, width: c.width });
      case 'choices': {
        // a stored choice the system cannot draw shows as the first one it can (what the window actually uses)
        const v = value(c.key), cur = c.options.some(o => o.id === v && !unavailable(o)) ? v : c.options.find(o => !unavailable(o))?.id;
        return C.choiceCards.render({ options: c.options.map(o => ({ id: o.id, label: text(o.label), picture: picture(o.picture), disabled: unavailable(o) })), value: cur, action: 'kit.settings.select', key: c.key });
      }
      case 'group': return html`${c.items.map(x => control(x, name))}`;
      /* badge standard: a healthy state is its icon only (the label is its name and tooltip), a named state shows its text */
      case 'state': return c.kind === 'ok' && !c.labeled ? html`<span class="s-state" data-tip="${text(c.tip || c.label)}">${C.statusIcon.render({ kind: 'ok', icon: c.icon, label: text(c.label) })}</span>`
        : html`<span class="s-state"${c.tip ? html` data-tip="${text(c.tip)}"` : ''}>${C.statusIcon.render({ kind: c.kind, icon: c.icon })}<span>${text(c.label)}</span></span>`;
    }
    return '';
  }
  /* editable shortcuts (control { type: 'kbd', shortcut: id }): kit.shortcuts holds the user's keys per shortcut id, null = removed */
  const changes = () => value('kit.shortcuts') || {};
  const defaultOf = id => defaultShortcuts(config).find(x => x.id === id);
  const keysOf = id => (id in changes() ? changes()[id] : defaultOf(id)?.keys) || null;
  function setShortcut(id, keys) {
    const next = { ...changes() };
    if (keys === defaultOf(id)?.keys) delete next[id]; else next[id] = keys;
    ctx.api.setSetting('kit.shortcuts', next); ctx.update();
  }
  const lead = r => r.dot ? C.statusDot.render({ tone: r.dot }) : r.avatar ? C.avatar.render({ name: text(r.avatar) }) : undefined;
  /* a connection row (row.connection: its state, action and steps): the same connection row as the first run and the dashboards */
  const connection = r => C.connectionRow.render({ ...r.connection, id: r.id, icon: r.icon, tile: r.tile, title: text(r.title), description: r.description ? text(r.description) : '',
    action: r.connection.action && { ...r.connection.action, label: text(r.connection.action.label) }, extra: r.connection.extra ? html`${r.connection.extra.map(x => control(x))}` : undefined, flow: r.connection.flow,
    form: r.connection.form && { ...r.connection.form, fields: r.connection.form.fields.map(f => ({ ...f, placeholder: f.placeholder ? text(f.placeholder) : undefined, label: f.label ? text(f.label) : undefined })), submit: { ...r.connection.form.submit, label: text(r.connection.form.submit.label) } } });
  const row = r => r.connection ? connection(r) : r.variant === 'add'
    ? C.settingsRow.render({ variant: 'add', title: text(r.title), action: r.action, arg: r.arg, menu: r.menu, dialog: r.dialog })
    : C.settingsRow.render({ title: text(r.title), description: reasonOf(r.control) || (r.description ? text(r.description) : ''), icon: r.icon, tile: r.tile, lead: lead(r), control: control(r.control, r.title ? text(r.title) : ''), wideControl: r.wideControl,
        extra: r.extra ? html`${r.extra.map(x => control(x))}` : undefined, stack: r.stack ? control(r.stack) : undefined, trail: r.trail, action: r.action, arg: r.arg, menu: r.rowMenu, dialog: r.dialog });
  const shown = r => !r.desktop || ctx.desktop; // desktop: true rows (window settings) only in the desktop app
  const group = g => Array.isArray(g) ? C.settingsGroup.render({ children: g.filter(shown).map(row) })
    : C.settingsGroup.render({ notice: g.notice ? { text: text(g.notice.text), action: control(g.notice.action) } : undefined, children: g.rows.filter(shown).map(row) });
  const recordRows = i => (records[i] || []).map(r => ({ lead: r.avatar ? C.avatar.render({ name: text(r.avatar) }) : r.icon ? icon(r.icon) : undefined, title: text(r.title), meta: (r.meta || []).map(m => text(m)), end: r.end != null ? text(r.end) : undefined, tone: r.tone }));
  function body(s, i) {
    if (s.intro) return C.introCard.render({ title: text(s.intro.title), description: s.intro.description ? text(s.intro.description) : '', actions: s.intro.actions ? html`${s.intro.actions.map(x => control(x))}` : undefined, picture: picture(s.intro.picture) });
    if (s.faq) return C.accordion.render({ id: `faq-${i}`, items: s.faq.map(q => ({ id: q.id, title: text(q.title), body: text(q.body) })) });
    if (s.empty) return C.emptyState.render({ variant: 'card', icon: s.empty.icon, title: text(s.empty.title), description: s.empty.description ? text(s.empty.description) : '', action: control(s.empty.action) });
    /* an empty list or group in a section is one muted row in its group card (the empty-state card is for a page that is empty as a whole) */
    const emptyRow = title => C.settingsGroup.render({ children: C.emptyState.render({ variant: 'line', title }) });
    if (s.records) return html`${s.records.start || s.records.end ? C.listToolbar.render({ start: html`${(s.records.start || []).map(x => control(x))}`, end: html`${(s.records.end || []).map(x => control(x))}` }) : ''}${records[i]?.length === 0 ? emptyRow(text(s.records.empty)) : C.recordList.render({ rows: recordRows(i), loading: records[i] ? 0 : 5, empty: text(s.records.empty) })}`;
    return html`${s.toolbar ? C.listToolbar.render({ start: html`${(s.toolbar.start || []).map(x => control(x))}`, end: html`${(s.toolbar.end || []).map(x => control(x))}` }) : ''}${(s.groups || []).map(group)}${s.none ? emptyRow(text(s.none.title)) : ''}`;
  }

  async function load(fresh = false) {
    const version = ++loadVersion;
    loading = true; loadError = null; ctx.update();
    try {
      const next = (typeof page.sections === 'function' ? await page.sections(fresh ? { ...ctx, fresh: true } : ctx) : page.sections) || [];
      const nextRecords = await Promise.all(next.map(s => s.records ? (typeof s.records.rows === 'function' ? s.records.rows(ctx) : s.records.rows) : undefined));
      if (version !== loadVersion) return;
      sections = next;
      Object.keys(records).forEach(k => delete records[k]);
      nextRecords.forEach((rows, i) => { if (rows !== undefined) records[i] = rows; });
      const waits = next.map(s => s.pending).filter(Boolean);
      if (waits.length) Promise.race(waits).finally(() => { if (version === loadVersion) load(); }).catch(() => {});
    } catch (error) {
      if (version !== loadVersion) return;
      sections = [];
      // Only a safe status classification reaches the screen; exception text may contain credentials.
      const status = Number(error?.status ?? error?.statusCode);
      loadError = status === 403 ? 'flow.perm' : status === 501 ? 'desktop.unavailable.other' : 'code.failed';
    } finally {
      if (version === loadVersion) { loading = false; ctx.update(); }
    }
  }
  const navItem = p => ({ id: p.id, label: text(p.label), icon: p.icon, activeIcon: p.activeIcon, current: p.id === page.id, badge: p.badge ? text(p.badge) : undefined, promote: p.promote, action: 'kit.navigate', arg: { address: addressOf(p.id) }, children: kids(p)?.map(navItem) });
  let navQuery = '';
  const pageWords = p => {
    const secs = Array.isArray(p.sections) ? p.sections : p.id === page.id && !loading ? sections : [];
    const rows = secs.flatMap(s => [s.title, ...(s.groups || []).flatMap(g => (Array.isArray(g) ? g : g.rows).flatMap(r => [r.title, r.description]))]);
    return [p.label, p.title, ...rows].filter(Boolean).map(x => String(text(x)).toLowerCase()).join(' ');
  };
  const pageOf = id => config.settings.groups.flatMap(g => g.pages.flatMap(x => [x, ...(kids(x) || [])])).find(x => x.id === id);
  const matches = it => { if (!navQuery) return true; const q = navQuery.toLowerCase(), pg = pageOf(it.id);
    return it.label.toLowerCase().includes(q) || (pg && pageWords(pg).includes(q)) || (it.children || []).some(matches); };
  const narrow = it => !navQuery || !it.children ? it : { ...it, children: it.children.filter(matches) };
  function render() {
    const nav = C.settingsNav.render({
      searchPlaceholder: t('settings.search'),
      /* the search field filters the list by page name and the settings on it (a parent stays when one of its pages matches) */
      groups: config.settings.groups.map(g => ({ label: text(g.label), items: g.pages.map(navItem).filter(matches).map(narrow) })).filter(g => g.items.length),
      query: navQuery, empty: t('settings.noMatch'),
      /* footer items: an item with a url opens it in the system browser (an in-app page opens web addresses outside the app) */
      footer: (config.settings.footer || []).map(f => ({ ...f, label: text(f.label), ...(f.url ? { action: 'kit.settings.link', arg: f.url } : {}) })),
    });
    const tab = tabState.tab || page.tabs?.[0].id;
    const tabs = page.tabs ? html`<div class="s-utabs">${C.pillTabs.render({ id: 'settings', tabs: page.tabs.map(x => ({ id: x.id, label: text(x.label) })), value: tab, action: 'kit.settings.tab' })}${page.tabsEnd ? html`<div class="s-utabs-end">${control(page.tabsEnd)}</div>` : ''}</div>` : '';
    const visible = sections.map((s, i) => [s, i]).filter(([s]) => !s.tab || s.tab === tab);
    const navigation = html`<div class="s-nav-select">${C.select.render({ value: text(page.label), icon: page.icon, label: `${t('settings.title')}, ${text(page.label)}`, menu: 'kit.settings.pages', block: true })}</div>`;
    /* the first group's title that only repeats the page title is left out (one name, said once) */
    const heading = text(page.title || page.label);
    const col = html`<div class="s-col">${navigation}${C.pageHeader.render({ title: heading, help: page.help ? text(page.help) : undefined })}${tabs}
      ${loading && !visible.length ? C.settingsSection.render({ title: t('tab.loading'), children: C.recordList.render({ rows: [], loading: 4 }) }) : ''}
      ${loadError ? C.settingsSection.render({ children: C.emptyState.render({ variant: 'card', icon: loadError === 'flow.perm' ? 'lock' : 'status-error', title: t(loadError), action: C.button.render({ label: t('tab.reload'), action: 'kit.settings.reload', variant: 'secondary' }) }) }) : ''}
      ${visible.map(([s, i], n) => C.settingsSection.render({ title: s.title && !(n === 0 && text(s.title) === heading) ? text(s.title) : '', count: s.count, badge: s.badge ? C.badge.render({ label: text(s.badge.label), tone: s.badge.tone || 'tag' }) : undefined, description: s.description ? text(s.description) : '', children: body(s, i) }))}</div>`;
    return C.contentCard.render({ variant: 'inset', nav, children: col });
  }
  const controlOf = key => {
    for (const s of sections) for (const c of [...(s.groups || []).flatMap(g => (Array.isArray(g) ? g : g.rows).map(r => r.control)), ...(s.toolbar?.start || []), ...(s.toolbar?.end || []), ...(s.records?.start || []), ...(s.records?.end || [])]) {
      if (c && (c.type === 'select' || c.type === 'split' || c.type === 'choices') && c.key === key) return c;
    }
    return null;
  };
  return {
    css,
    /* static sections draw at once; sections read at load (connections, records) show loading rows meanwhile instead of a blank page */
    async init() {
      if (ctx.desktop && page.initAction) ctx.api.action(page.initAction);
      if (typeof page.sections !== 'function') return load();
      void load();
    },
    render,
    meta: () => ({ title: text(page.label), icon: config.settings.tabIcon || page.icon, context: { icon: page.icon, title: text(page.label), sub: t('settings.title') } }),
    actions: {
      'kit.settings.reload': () => load(true),
      'kit.settings.search': a => { navQuery = a.value || ''; ctx.update(); },
      'kit.settings.link': a => { if (/^https:\/\//.test(a.arg || '')) window.open(a.arg); },
      'kit.settings.switch': (a) => ctx.api.setSetting(a.arg, a.on),
      'kit.settings.filter': (a) => setValue(a.arg, a.value),
      'kit.settings.select': (a) => {
        const c = controlOf(a.arg.key);
        if (!c || c.disabled) return;
        if (c?.multi) { const v = new Set(value(a.arg.key) || []); if (a.checked) v.add(a.arg.value); else v.delete(a.arg.value); setValue(a.arg.key, [...v]); }
        else setValue(a.arg.key, a.arg.value);
        ctx.update();
      },
      'kit.settings.shortcut': (a) => { ctx.api.setSetting(a.arg, a.keys); ctx.update(); },
      'kit.settings.shortcut-reset': (a) => { ctx.api.setSetting(a.arg, config.settings.defaults?.[a.arg]); ctx.update(); },
      'kit.settings.shortcut-set': (a) => {
        const taken = effectiveShortcuts(config, changes()).some(x => x.id !== a.arg && x.keys === a.combo);
        if (taken) { ctx.api.toast({ title: 'shortcut.taken', tone: 'error' }); ctx.update(); return; }
        setShortcut(a.arg, a.combo);
      },
      'kit.settings.shortcut-default': (a) => setShortcut(a.arg, defaultOf(a.arg)?.keys ?? null),
      'kit.settings.shortcut-remove': (a) => setShortcut(a.arg, null),
      'kit.settings.sound-preview': () => { playChime().catch(() => {}); },
      'kit.settings.tab': (a) => { tabState.tab = a.arg; ctx.update(); },
      ...(page.actions || {}),
    },
    menus: {
      'kit.settings.pages': () => ({ items: [{ type: 'search', placeholder: t('settings.search') }, ...config.settings.groups.flatMap(g => [
        { type: 'label', label: text(g.label) },
        ...g.pages.map(navItem).flatMap(p => [p, ...(p.children || [])]).map(p => ({ id: p.id, label: p.label, icon: p.icon, checked: p.current, action: p.action, arg: p.arg })),
      ]).concat((config.settings.footer || []).map(f => ({ ...f, label: text(f.label), ...(f.url ? { action: 'kit.settings.link', arg: f.url } : {}) })))], variant: 'select', matchTrigger: true }),
      'kit.settings.shortcut-menu': (id) => ({ align: 'end', items: [
        { id: 'sc-reset', label: t('shortcut.resetDefault'), icon: 'arrow-undo-up', end: defaultOf(id)?.keys ? keyLabel(defaultOf(id).keys) : undefined, action: 'kit.settings.shortcut-default', arg: id },
        { id: 'sc-remove', label: t('shortcut.remove'), icon: 'trash', danger: true, action: 'kit.settings.shortcut-remove', arg: id },
      ] }),
      'kit.settings.select': (key) => { const c = controlOf(key); const selected = selectedOf(c); return C.select.menuDef({ options: optionsOf(c).map(o => ({ ...o, label: text(o.label), desc: o.desc ? text(o.desc) : undefined, tip: o.tip ? text(o.tip) : undefined })), value: c.multi ? selected || [] : optionsOf(c).some(o => o.id === selected) ? selected : c.default, action: c.action || 'kit.settings.select', key, multi: c.multi }); },
    },
    onLocale: () => { if (typeof page.sections === 'function') { sections = []; return load(); } },
    onSettings: async () => { const was = page; page = findPage(); if (page !== was || typeof page.sections === 'function') await load(); ctx.update(); }, // sections built from settings (connected items) follow them
  };
}

export const css = `
.s-col { max-width: var(--pane-max-w, var(--settings-col-w)); padding: var(--pane-pad-top, var(--space-16)) var(--pane-pad-inline, var(--space-8)) var(--pane-pad-bottom, var(--space-40)); margin: 0 auto; }
.s-nav-select { display: none; margin-bottom: var(--pane-section-gap, var(--space-6)); }
@container page (max-width: 760px) {
  .snav { display: none; }
  .s-nav-select { display: block; }
  .s-col { padding-inline: var(--pane-pad-inline, var(--space-4)); }
}
.s-utabs { display: flex; align-items: center; margin: 0 0 var(--space-6); } /* page tabs are the pill tabs every page uses (one part for one role) */
.s-utabs-end { margin-left: auto; display: flex; align-items: center; }
.sg-card > .empty-line { min-height: var(--srow-min-h); display: flex; align-items: center; padding: 0 var(--space-3_5); background: var(--surface-secondary); } /* an empty group: one muted row with a row's height and inset */
.s-state { display: flex; align-items: center; gap: var(--space-1_5); font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--muted-foreground); white-space: nowrap; }
`;
