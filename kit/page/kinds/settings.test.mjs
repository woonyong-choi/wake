import assert from 'node:assert/strict';
import test from 'node:test';
import { createSettingsPage } from './settings.js';

const context = sections => ({
  config: { settings: { defaults: {}, groups: [{ pages: [{ id: 'test', label: 'test', icon: 'settings', sections }] }] }, routes: [{ id: 'settings', kind: 'settings' }] },
  params: { page: 'test' }, router: { build: () => 'test://settings/test' },
  settings: () => ({}), text: x => x?.raw ?? x ?? '', t: x => x, update() {}, api: { setSetting() {} },
});
const ready = rows => [{ records: { rows, empty: 'empty-result' } }];
test('settings distinguishes empty success, failure and forbidden without exception text', async () => {
  for (const status of [0, 403, 501]) {
    const ctx = context(async () => { throw Object.assign(new Error('credential-do-not-display'), { status }); });
    const page = createSettingsPage(ctx); await page.actions['kit.settings.reload']();
    const html = page.render().s;
    assert.match(html, new RegExp(status === 403 ? 'flow.perm' : status === 501 ? 'desktop.unavailable.other' : 'code.failed'));
    assert.doesNotMatch(html, /credential-do-not-display|empty-result/);
    assert.match(html, /kit.settings.reload/);
  }
  const page = createSettingsPage(context(ready([]))); await page.init(); assert.match(page.render().s, /empty-result/);
});
test('settings keeps loading visible, retries errors and discards old responses', async () => {
  let resolveOld, calls = 0;
  const ctx = context(() => ++calls === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(ready([{ title: 'current-result' }])));
  const page = createSettingsPage(ctx), pending = page.actions['kit.settings.reload']();
  assert.match(page.render().s, /skeleton/);
  await page.actions['kit.settings.reload']();
  resolveOld(ready([{ title: 'stale-result' }])); await pending;
  assert.match(page.render().s, /current-result/); assert.doesNotMatch(page.render().s, /stale-result/);
});
test('settings shows loading when the selected tab has no sections yet', async () => {
  let settle, calls = 0;
  const ctx = context(() => ++calls === 1 ? [{ tab: 'shared', title: 'other-tab' }] : new Promise(resolve => { settle = resolve; }));
  ctx.config.settings.groups[0].pages[0].tabs = [{ id: 'clusters', label: 'test.clusters' }, { id: 'shared', label: 'test.shared' }];
  const page = createSettingsPage(ctx);
  await page.actions['kit.settings.reload']();
  const pending = page.actions['kit.settings.reload']();
  assert.match(page.render().s, /tab.loading/);
  assert.match(page.render().s, /aria-busy="true"/);
  settle([{ tab: 'clusters', title: 'current-inventory' }]); await pending;
  assert.match(page.render().s, /current-inventory/);
  assert.doesNotMatch(page.render().s, /aria-busy="true"/);
});

test('failed record request clears stale data and retry restores the page', async () => {
  let fail = false;
  const page = createSettingsPage(context(async () => ready(async () => { if (fail) throw new Error('secret'); return [{ title: 'restored-result' }]; })));
  await page.actions['kit.settings.reload'](); fail = true; await page.actions['kit.settings.reload']();
  assert.doesNotMatch(page.render().s, /restored-result|secret/); assert.match(page.render().s, /code.failed/);
  fail = false; await page.actions['kit.settings.reload'](); assert.match(page.render().s, /restored-result/);
});

test('settings keeps the existing filter control while refreshing records', async () => {
  let resolveRefresh, waiting = false;
  const ctx = context(() => waiting ? new Promise(resolve => { resolveRefresh = resolve; }) : [{ toolbar: { start: [{ type: 'search', key: 'filter', placeholder: 'filter-label' }] }, groups: [] }]);
  const page = createSettingsPage(ctx); await page.actions['kit.settings.reload']();
  waiting = true; const pending = page.actions['kit.settings.reload']();
  assert.match(page.render().s, /filter-label/);
  resolveRefresh([{ toolbar: { start: [{ type: 'search', key: 'filter', placeholder: 'filter-label' }] }, groups: [] }]); await pending;
  assert.match(page.render().s, /filter-label/);
});

test('settings page menu preserves grouped navigation, child pages and footer links', async () => {
  const ctx = context([]);
  ctx.router.build = (_route, params) => `test://settings/${params.page}`;
  ctx.config.settings.groups[0].label = 'group';
  ctx.config.settings.groups[0].pages.push({ id: 'parent', label: 'parent', children: () => [{ id: 'child', label: 'child' }] });
  ctx.config.settings.footer = [{ id: 'docs', label: 'docs', url: 'https://example.com/docs' }];
  const page = createSettingsPage(ctx);
  await page.init();

  const menu = page.menus['kit.settings.pages']();
  assert.equal(menu.items[0].type, 'search');
  assert.equal(menu.items[1].label, 'group');
  assert.equal(menu.items.find(item => item.id === 'test').checked, true);
  for (const id of ['test', 'parent', 'child']) {
    const item = menu.items.find(item => item.id === id);
    assert.equal(item.action, 'kit.navigate');
    assert.deepEqual(item.arg, { address: `test://settings/${id}` });
  }
  assert.deepEqual(menu.items.at(-1), { id: 'docs', label: 'docs', url: 'https://example.com/docs', action: 'kit.settings.link', arg: 'https://example.com/docs' });
});

// #35: a tab mark must not replace the settings navigation or context icon.
test('createSettingsPage_tabIcon_keeps_navigation_and_context_icons', () => {
  for (const tabIcon of [undefined, 'app-mark']) {
    const ctx = context([]);
    ctx.config.settings.tabIcon = tabIcon;

    const page = createSettingsPage(ctx);

    assert.equal(page.meta().icon, tabIcon || 'settings');
    assert.equal(page.meta().context.icon, 'settings');
    assert.match(page.render().s, /data-icon="settings"/);
  }
});

test('window style keeps a saved choice while native capability is pending or unavailable', async () => {
  let info = null;
  const ctx = context([{ groups: [[{ title: 'window-style', control: { type: 'choices', key: 'kit.windowStyle', options: [
    { id: 'tinted', label: 'tinted' }, { id: 'transparent', label: 'transparent', needs: 'translucent' },
  ] } }]] }]);
  ctx.desktop = true; ctx.desktopInfo = () => info;
  ctx.settings = () => ({ 'kit.windowStyle': 'transparent' });
  const writes = []; ctx.api.setSetting = (...args) => writes.push(args);
  const page = createSettingsPage(ctx); await page.init();
  const transparent = () => page.render().s.match(/<button[^>]*data-arg="[^>]*transparent[^>]*>/)?.[0];
  assert.match(transparent(), /disabled/);
  assert.match(page.render().s, /desktop.unavailable.other/);
  info = { capabilities: { translucent: true } };
  assert.doesNotMatch(transparent(), /disabled/);
  assert.match(transparent(), /aria-checked="true"/);
  info = { capabilities: { translucent: false, reason: 'linux' } };
  assert.match(transparent(), /disabled/);
  assert.match(page.render().s, /desktop.unavailable.linux/);
  info = null;
  assert.match(transparent(), /disabled/);
  assert.deepEqual(writes, []);
});

function searchNav(page, query) {
  page.actions['kit.settings.search']({ value: query });
  return page.render().s.match(/<nav\b[\s\S]*?<\/nav>/)[0];
}
function settingsRows(title) { return [{ groups: [[{ title }]] }]; }

// #35: only rows already read on a dynamic page belong in settings search.
test('createSettingsPage_visited_dynamic_rows_filters_existing_child_navigation_without_loading_other_pages', async () => {
  let loads = 0;
  const ctx = context(async () => { loads++; return settingsRows('dynamic-row'); });
  ctx.router.build = (_route, params) => `test://settings/${params.page}`;
  const visited = ctx.config.settings.groups[0].pages.pop();
  ctx.config.settings.groups[0].pages.push(
    { id: 'parent', label: 'parent', icon: 'settings', children: () => [visited, { id: 'unvisited', label: 'unvisited', icon: 'settings', sections: async () => { throw new Error('must not collect unvisited pages'); } }], sections: [] },
    { id: 'static', label: 'static', icon: 'settings', sections: settingsRows('static-row') },
  );
  const page = createSettingsPage(ctx);
  assert.doesNotMatch(searchNav(page, 'dynamic-row'), /test:\/\/settings\/test/);

  await page.actions['kit.settings.reload']();

  const nav = searchNav(page, 'dynamic-row');
  assert.match(nav, /test:\/\/settings\/parent/);
  assert.match(nav, /test:\/\/settings\/test/);
  assert.doesNotMatch(nav, /test:\/\/settings\/unvisited/);
  assert.match(searchNav(page, 'static-row'), /test:\/\/settings\/static/);
  assert.match(searchNav(page, ''), /test:\/\/settings\/unvisited/);
  assert.equal(loads, 1);
  const fresh = createSettingsPage(ctx);
  assert.doesNotMatch(searchNav(fresh, 'dynamic-row'), /test:\/\/settings\/test/);
  ctx.params.page = 'parent';
  assert.doesNotMatch(searchNav(createSettingsPage(ctx), 'dynamic-row'), /test:\/\/settings\/test/);
});

test('createSettingsPage_refresh_discards_old_dynamic_search_rows_and_failed_results', async () => {
  let resolveOld, calls = 0, fail = false;
  const ctx = context(() => {
    if (fail) throw new Error('private-error');
    return ++calls === 1 ? new Promise(resolve => { resolveOld = resolve; }) : settingsRows('latest-row');
  });
  const page = createSettingsPage(ctx);
  const pending = page.actions['kit.settings.reload']();
  await page.actions['kit.settings.reload']();
  resolveOld(settingsRows('stale-row')); await pending;

  assert.match(searchNav(page, 'latest-row'), /test:\/\/settings\/test/);
  assert.doesNotMatch(searchNav(page, 'stale-row'), /test:\/\/settings\/test/);
  fail = true; await page.actions['kit.settings.reload']();
  assert.doesNotMatch(searchNav(page, 'latest-row'), /test:\/\/settings\/test/);
  assert.doesNotMatch(page.render().s, /private-error/);
});

test('createSettingsPage_locale_change_replaces_raw_dynamic_labels_and_ignores_pending_old_locale', async () => {
  let language = 'old', resolveOld;
  const ctx = context(() => language === 'pending'
    ? new Promise(resolve => { resolveOld = resolve; }) : settingsRows(`${language}-row`));
  const page = createSettingsPage(ctx);
  await page.actions['kit.settings.reload']();
  assert.match(searchNav(page, 'old-row'), /test:\/\/settings\/test/);
  language = 'pending'; const pending = page.actions['kit.settings.reload']();
  assert.doesNotMatch(searchNav(page, 'old-row'), /test:\/\/settings\/test/);
  language = 'new';

  await page.onLocale?.();
  resolveOld(settingsRows('old-locale-row')); await pending;

  assert.doesNotMatch(searchNav(page, 'old-row'), /test:\/\/settings\/test/);
  assert.doesNotMatch(searchNav(page, 'old-locale-row'), /test:\/\/settings\/test/);
  assert.match(searchNav(page, 'new-row'), /test:\/\/settings\/test/);
});

test('createSettingsPage_locale_change_searches_static_labels_in_the_current_language', async () => {
  let language = 'old';
  const ctx = context(settingsRows('translated-title'));
  ctx.text = value => value === 'translated-title' ? `${language}-row` : value;
  const page = createSettingsPage(ctx); await page.init();
  assert.match(searchNav(page, 'old-row'), /test:\/\/settings\/test/);

  language = 'new'; await page.onLocale?.();

  assert.doesNotMatch(searchNav(page, 'old-row'), /test:\/\/settings\/test/);
  assert.match(searchNav(page, 'new-row'), /test:\/\/settings\/test/);
});
test('a section with reads still under way draws now and builds again when they settle, and a reload passes fresh', async () => {
  let release, calls = 0; const seen = [];
  const later = new Promise(resolve => { release = resolve; });
  const ctx = context(c => { calls++; seen.push(!!c.fresh); return calls === 1 ? [{ title: 'first-draw', pending: later, groups: [[{ id: 'a', title: 'row-busy' }]] }] : [{ title: 'second-draw', groups: [[{ id: 'a', title: 'row-done' }]] }]; });
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
  const page = createSettingsPage(ctx); await page.init(); await flush();
  assert.match(page.render().s, /row-busy/);
  release(); await later; await flush();
  assert.match(page.render().s, /row-done/);
  await page.actions['kit.settings.reload']();
  assert.deepEqual(seen, [false, false, true]);
});
test('an empty group or record list in a section is one muted line, not an empty-state card', async () => {
  const page = createSettingsPage(context(() => [{ title: 's', groups: [], none: { icon: 'archive', title: 'nothing-here' } }, { title: 'r', records: { rows: [], empty: 'no-records' } }]));
  await page.init(); for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  const s = page.render().s;
  assert.match(s, /class="empty-line" data-c="empty-state">nothing-here</);
  assert.match(s, /class="empty-line" data-c="empty-state">no-records</);
  assert.doesNotMatch(s, /class="empty card"/);
});

/* B2-13, B2-21, stored refresh values: a settings switch or select had no accessible name (only its value), the select said it opens a listbox
   while its list is a menu, and a value stored before the choices changed (30 s, now 2·5·10 min) showed nothing. A row's switch and select are
   named by the row title (the select with its value), the select opens a menu, and an old number shows as the nearest choice */
test('settings_switch_and_select_are_named_by_their_row_and_an_old_number_shows_as_the_nearest_choice', async () => {
  const ctx = context([{ groups: [[
    { title: 'fixture.sounds', control: { type: 'switch', key: 'a.sound' } },
    { title: 'fixture.every', control: { type: 'select', key: 'a.every', options: [{ id: '120', label: '2 min' }, { id: '300', label: '5 min' }, { id: '600', label: '10 min' }] } },
  ]] }]);
  ctx.settings = () => ({ 'a.every': '30' });
  const page = createSettingsPage(ctx); await page.init();
  const s = page.render().s;
  assert.match(s, /aria-label="fixture\.sounds"/, 'the switch is named');
  const select = s.match(/<button[^>]*data-c="select"[^>]*data-menu="kit.settings.select"[^>]*>/)?.[0] || '';
  assert.match(select, /aria-label="fixture\.every, 2 min"/);
  assert.match(select, /aria-haspopup="menu"/);
  assert.match(s, /<span class="trunc">2 min<\/span>/, 'the old 30 s shows as the nearest choice');
});

/* B3-13: six "more" buttons on the shortcuts page and the rows' more buttons all read "settings.more", and the narrow page select read "settings.title"
   without the page it shows. Each names its row (a more button) or its value (the page select) */
test('settings_more_buttons_name_their_row_and_the_page_select_says_its_page', async () => {
  const ctx = context([{ groups: [[
    { title: 'fixture.newTab', control: { type: 'kbd', shortcut: 'tab.new' } },
    { title: 'fixture.client', control: { type: 'group', items: [{ type: 'more', menu: 'fixture.more', arg: 'c1' }] } },
  ]] }]);
  ctx.config.shortcuts = [{ id: 'tab.new', keys: 'mod+t', menu: true }];
  const page = createSettingsPage(ctx); await page.init();
  const s = page.render().s;
  const names = [...s.matchAll(/data-menu="(?:kit\.settings\.shortcut-menu|fixture\.more)"[^>]*>|aria-label="[^"]*"[^>]*data-menu="(?:kit\.settings\.shortcut-menu|fixture\.more)"/g)].map(m => /aria-label="([^"]*)"/.exec(m[0])?.[1]);
  assert.ok(names.includes('settings.more, fixture.client'), `the row's more button names its row: ${names}`);
  assert.ok(names.every(n => n && n !== 'settings.more'), `no bare "more": ${names}`);
  assert.match(s, /s-nav-select[\s\S]*?aria-label="settings\.title, test"/, 'the page select says the page it shows');
});

/* R5-08: a multi choice that shows one summary word ("all") drew a down chevron at its own fixed width, unlike every other select on the page.
   It reads as a select of one value: the same trigger as a single select (up-down chevrons, its own width) */
test('a summary multi select draws the same trigger as a single select', async () => {
  const options = [{ id: 'a', label: 'opt-a' }, { id: 'b', label: 'opt-b' }];
  const page = createSettingsPage(context(() => [{ title: 'sec', groups: [[
    { id: 'one', title: 'one', control: { type: 'select', key: 'one', options, default: 'a' } },
    { id: 'many', title: 'many', control: { type: 'select', key: 'many', multi: true, options, summary: { all: 'all-word', none: 'none-word', some: 'some-word' } } }]] }]));
  await page.actions['kit.settings.reload']();
  const all = [...page.render().s.matchAll(/<button type="button" class="slt[^"]*"[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0]);
  const triggers = ['one', 'many'].map(k => all.find(b => b.includes(`data-menu-arg="&quot;${k}&quot;"`) || b.includes(`data-menu-arg="${k}"`)));
  assert.ok(triggers.every(Boolean), `the two selects: ${all.length}`);
  const shape = b => ({ cls: /class="([^"]*)"/.exec(b)[1], style: /style="([^"]*)"/.exec(b)?.[1] ?? '', chevron: /data-icon="(chevron[^"]*)"/.exec(b)?.[1] });
  assert.deepEqual(shape(triggers[1]), shape(triggers[0]));
});
