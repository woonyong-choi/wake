/*
 * Folio app definition: a reading library assembled from kit parts in a different structure from the first app.
 * No AI panel, no identity chip, a sidebar of shelves plus its own section kind (reading goal), list / document / details pages,
 * its own settings tree, first-run steps, menus, shortcuts and a swatch context menu (a floating surface on the desktop).
 * Format: kit/CONTRACTS.md. This file must also load in Node (no browser-only APIs).
 */
import en from './locale/en.js';
import ko from './locale/ko.js';
import { ROUTES } from './routes.js';
import { ICON_MAP } from './icon-map.js';
import { GLYPHS } from './glyphs.js';
import { createDataSource } from './data/index.js';

const data = createDataSource();
const D = (key, p) => data.now(key, p);
const raw = s => ({ raw: s });
const addr = { shelf: id => `folio://shelf/${id}`, doc: id => `folio://doc/${id}`, details: id => `folio://doc/${id}/details`, settings: page => `folio://settings/${page}` };
const sel = (key, options) => ({ type: 'select', key, options });
const opt = (id, label, icon) => ({ id, label, icon });
const item = (id, label, icon, extra = {}) => ({ id, label, icon, ...extra });
const docTitle = id => raw(D('doc', { id })?.title || '');
const shelfCrumb = id => ({ label: `folio.shelf.${id}`, switcher: 'folio.switch.shelf', arg: { shelf: id } });

const SETTINGS = {
  defaults: { 'kit.theme': 'system', 'folio.goal': '30', 'folio.textSize': 'md', 'folio.openIn': 'doc', 'kit.sidebar.sections': ['shelves', 'goal'] },
  groups: [
    { label: 'folio.settings.group.reading', pages: [
      { id: 'reading', label: 'folio.settings.reading', icon: 'book-open', sections: [
        { title: 'folio.s.goal', groups: [[
          { id: 'goal', title: 'folio.s.goal.daily', description: 'folio.s.goal.daily.desc', control: sel('folio.goal', ['15', '30', '60'].map(m => opt(m, { key: 'folio.s.minutes', vars: { count: +m } }))) },
          { id: 'open-in', title: 'folio.s.openIn', description: 'folio.s.openIn.desc', control: sel('folio.openIn', [opt('doc', 'folio.s.openIn.doc'), opt('details', 'folio.s.openIn.details')]) },
        ]] },
        { title: 'folio.s.text', groups: [[
          { id: 'text-size', title: 'folio.s.textSize', control: { type: 'choices', key: 'folio.textSize', options: [opt('sm', 'folio.s.textSize.sm'), opt('md', 'folio.s.textSize.md'), opt('lg', 'folio.s.textSize.lg')] } },
        ]] },
      ] },
    ] },
    { label: 'folio.settings.group.app', pages: [
      { id: 'general', label: 'folio.settings.general', icon: 'settings', activeIcon: 'settings-active', sections: [
        { title: 'folio.s.display', groups: [[
          { id: 'language', title: 'folio.s.language', control: sel('kit.locale', [opt('system', 'locale.system'), opt('ko', 'locale.name.ko'), opt('en', 'locale.name.en')]) },
          { id: 'theme', title: 'folio.s.theme', control: sel('kit.theme', [opt('system', 'folio.s.theme.system', 'contrast'), opt('light', 'folio.s.theme.light', 'sun'), opt('dark', 'folio.s.theme.dark', 'moon')]) },
          { id: 'sections', title: 'folio.s.sections', wideControl: true, control: { type: 'select', key: 'kit.sidebar.sections', multi: true, width: 'var(--select-multi-w)', options: [opt('shelves', 'folio.section.shelves'), opt('goal', 'folio.section.goal')] } },
        ]] },
        { title: 'folio.s.shortcuts', groups: [[
          { id: 'sc-new', title: 'folio.s.sc.newNote', control: { type: 'kbd', shortcut: 'folio.note.new', label: 'folio.s.sc.newNote' } },
        ]] },
      ] },
    ] },
  ],
};

const routeFns = {
  shelf: { title: p => `folio.shelf.${p.shelf}`, icon: p => D('shelves').find(s => s.id === p.shelf)?.icon || 'book-open', crumbs: p => [shelfCrumb(p.shelf)], ident: () => null },
  doc: { title: p => docTitle(p.id), icon: () => 'document', crumbs: p => [shelfCrumb(D('doc', p)?.shelf), { label: docTitle(p.id) }], ident: () => null },
  details: { title: p => docTitle(p.id), icon: () => 'circle-info', crumbs: p => [shelfCrumb(D('doc', p)?.shelf), { label: docTitle(p.id) }, { label: 'folio.details' }], ident: () => null },
  settings: { title: p => SETTINGS.groups.flatMap(g => g.pages).find(x => x.id === p.page)?.label || 'settings.title', icon: () => 'settings', crumbs: () => [{ label: 'settings.title' }], ident: () => null },
};

export default {
  schema: 1,
  id: 'folio',
  name: 'Folio',
  scheme: 'folio',
  kitVersion: '^0.1.0',
  kitBannedTerms: ['folio', 'shelf', 'shelves', 'reading goal'],
  brand: { mark: 'folio-mark', name: 'folio.name' },
  locales: { en, ko },
  defaultLocale: 'en',
  icons: { map: ICON_MAP, glyphs: GLYPHS },
  features: { tabs: true, panel: false, settings: true, palette: true, externalTools: false, restoreSession: false },
  data,
  dataMode: 'mock',
  routes: ROUTES.map(r => ({ ...r, ...routeFns[r.id] })),
  start: addr.shelf('reading'),
  newTab: addr.shelf('all'),
  sidebar: {
    /* an app section kind: the reading goal drawn from kit components (a progress bar row), no rows of its own */
    kinds: {
      goal: (sec, st, api, { components: C, text }) => {
        const g = D('goal'), goal = +(st.settings['folio.goal'] || g.minutes);
        return C.listRow.render({ icon: 'clock', title: text({ key: 'folio.goal.today', vars: { done: g.today, goal } }), description: C.progress.render({ value: Math.min(100, Math.round(g.today / goal * 100)) }) });
      },
    },
    sections: [
      { id: 'shelves', label: 'folio.section.shelves', optional: true,
        rows: () => [{ id: 'all', icon: 'folder-open', label: 'folio.shelf.all', address: addr.shelf('all') },
          ...D('shelves').map(s => ({ id: s.id, icon: s.icon, label: `folio.shelf.${s.id}`, ctx: String(s.count), address: addr.shelf(s.id), context: 'folio.shelf', arg: s.id }))] },
      { id: 'goal', kind: 'goal', label: 'folio.section.goal', optional: true },
      { id: 'tabs', kind: 'tabs', label: 'folio.section.tabs', untitled: 'folio.tab.loading' },
    ],
    bottom: [
      { icon: 'settings', tip: 'settings.title', action: 'folio.settings' },
      { icon: 'search', tip: 'folio.search', action: 'kit.palette.open' },
    ],
  },
  topbar: {
    ident: false,
    buttons: ({ route, params }) => route?.id === 'doc' ? [
      { icon: 'circle-info', tip: 'folio.details', action: 'kit.navigate', arg: { address: addr.details(params.id) } },
      { icon: 'bookmark', tip: 'folio.save', action: 'folio.save', arg: params.id },
    ] : [],
  },
  menus: {
    'folio.switch.shelf': p => ({ width: 220, items: ['all', ...D('shelves').map(s => s.id)].map(id => item('sh-' + id, `folio.shelf.${id}`, null, { checked: id === p.shelf, action: 'kit.navigate', arg: { address: addr.shelf(id) } })) }),
  },
  contextMenus: {
    /* a shelf row: open it, and its color as swatches (on the desktop this opens as a floating surface) */
    'folio.shelf': id => [
      item('s-open', 'folio.ctx.openNewTab', null, { action: 'kit.navigate', arg: { address: addr.shelf(id), newTab: true } }),
      { type: 'separator' },
      { type: 'label', label: 'folio.ctx.color' },
      { type: 'choices', shape: 'swatch', items: [null, '--grp-green', '--grp-blue', '--grp-purple', '--grp-orange'].map(color => ({ color, label: color ? `folio.color.${color.slice(6)}` : 'folio.color.none', checked: (D('shelves').find(s => s.id === id)?.color || null) === color, action: 'folio.shelf.color', arg: { id, color } })) },
    ],
  },
  dialogs: {
    'folio.note': () => ({ title: 'folio.note.title', fields: [{ id: 'text', label: 'folio.note.text', type: 'textarea' }], submit: { label: 'folio.note.save', action: 'folio.note.save' } }),
  },
  actions: {
    'folio.settings': (_a, api) => api.navigate(addr.settings('reading'), { newTab: true }),
    'folio.save': (a, api) => api.toast({ title: 'folio.saved', tone: 'success' }),
    'folio.shelf.color': (a, api) => api.setSetting('folio.shelf.color', a.arg ?? null),
    'folio.note.new': (_a, api) => api.openDialog?.('folio.note'),
    'folio.note.save': (_a, api) => api.toast({ title: 'folio.note.saved', tone: 'success' }),
  },
  shortcuts: [{ keys: 'mod+shift+n', action: 'folio.note.new' }],
  settings: SETTINGS,
  palette: {
    placeholder: 'folio.palette.placeholder', keys: ['⌘K'], shortcut: 'mod+k',
    sources: [
      { id: 'docs', label: 'folio.palette.docs', search: () => D('docs').map(d => ({ id: d.id, icon: 'document', label: raw(d.title), end: raw(d.author), action: 'kit.navigate', arg: { address: addr.doc(d.id) } })) },
      { id: 'cmd', label: 'folio.palette.commands', search: () => [item('cmd-note', 'folio.note.new', 'pen', { action: 'folio.note.new' })] },
    ],
  },
  firstRun: {
    steps: [
      { id: 'welcome', kind: 'welcome', lines: ['folio.fr.line1', 'folio.fr.line2'], primary: 'folio.fr.start', hero: 'folio-mark' },
      { id: 'goal', kind: 'options', progress: true, title: 'folio.fr.goal', description: 'folio.fr.goal.desc', key: 'folio.goal', setting: true,
        options: ['15', '30', '60'].map(m => ({ id: m, label: { key: 'folio.s.minutes', vars: { count: +m } }, icon: 'clock' })), primary: 'folio.fr.next' },
      { id: 'done', kind: 'done', title: 'folio.fr.done', description: 'folio.fr.done.desc', primary: 'folio.fr.start', options: [] },
    ],
  },
  examples: { params: { shelf: { shelf: 'reading' }, doc: { id: 'd1' }, details: { id: 'd1' }, settings: { page: 'reading' } } },
};
