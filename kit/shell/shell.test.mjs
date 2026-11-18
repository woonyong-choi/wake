import test from 'node:test';
import assert from 'node:assert/strict';
import { sidebarBottomItem, topbarIdentity } from './shell.js';

import { line as flowStatusLine, running as flowStatusRunning } from '../components/flow-status.js';
import { render as renderTopbar } from '../components/topbar.js';

const item = { icon: 'globe', tip: 'shell.search', menu: 'account', arg: { id: 'account' } };

test('sidebarBottomItem_only_authenticated_named_profile_uses_avatar', () => {
  for (const profile of [null, { name: 'OS user' }, { authenticated: false, name: 'Person' }, { authenticated: true, name: '' }]) {
    const output = String(sidebarBottomItem({ ...item, profile: () => profile }, {}, {}));
    assert.doesNotMatch(output, /data-c="avatar"/);
    assert.match(output, /data-menu="account"/);
  }
  const output = String(sidebarBottomItem({ ...item, profile: () => ({ authenticated: true, name: 'Person', avatarUrl: 'https://images.example.test/person.png' }) }, {}, {}));
  assert.match(output, /data-c="avatar"/);
  assert.match(output, /aria-label="Person"/);
  assert.match(output, /src="https:\/\/images.example.test\/person.png"/);
  assert.match(output, /data-menu="account"/);
  assert.match(output, /aria-haspopup="menu"/);
  assert.match(output, /data-menu-arg=".*account/);
});

test('sidebarBottomItem_profile_without_photo_uses_name_initial_and_escapes_input', () => {
  const output = String(sidebarBottomItem({ ...item, profile: () => ({ authenticated: true, name: '<Person>' }) }, {}, {}));
  assert.match(output, /data-c="avatar"/);
  assert.match(output, /aria-label="&lt;Person&gt;"/);
  assert.doesNotMatch(output, /<img|<Person>/);
});


test('sidebarBottomItem_provider_failure_or_invalid_name_keeps_existing_icon', () => {
  const providers = [() => { throw new Error('provider failed'); }, () => ({ authenticated: true, name: 7 }), () => ({ authenticated: true, name: '   ' }), () => ({ authenticated: true, name: 'A\nB' }), () => ({ get authenticated() { throw new Error('invalid profile'); } })];
  for (const profile of providers) {
    const output = String(sidebarBottomItem({ ...item, profile }, {}, {}));
    assert.doesNotMatch(output, /data-c="avatar"/);
    assert.match(output, /data-menu="account"/);
  }
});

test('sidebarBottomItem_invalid_avatar_uses_initial_without_elevating_authentication', () => {
  for (const avatarUrl of [null, 5, 'data:image/png;base64,AA==', 'javascript:alert(1)', 'http://images.example.test/a.png', '//images.example.test/a.png', 'https://', 'https://user:pass@images.example.test/a.png', '../assets/a.png', 'assets/../a.png', 'assets/%2e%2e/a.png', 'assets/a.png?path=../b', 'assets/a\\b.png']) {
    const output = String(sidebarBottomItem({ ...item, profile: () => ({ authenticated: true, name: 'Person', avatarUrl }) }, {}, {}));
    assert.match(output, /data-c="avatar"/);
    assert.doesNotMatch(output, /<img/);
    assert.match(output, />P<\/span>/);
  }
  for (const avatarUrl of ['https://images.example.test/a.png', 'assets/profile/person.png', './assets/person.png']) {
    const output = String(sidebarBottomItem({ ...item, profile: () => ({ authenticated: true, name: 'Person', avatarUrl }) }, {}, {}));
    assert.match(output, /<img/);
  }
  const output = String(sidebarBottomItem({ ...item, profile: () => ({ name: 'Person', avatarUrl: 'https://images.example.test/a.png' }) }, {}, {}));
  assert.doesNotMatch(output, /data-c="avatar"|<img/);
});


test('topbarIdentity_explicit_route_brand_hides_only_matching_app_brand', () => {
  const brand = { mark: 'globe', name: { raw: 'Search' } };
  const explicitRoute = () => ({ icon: 'globe', label: 'shell.search', menu: 'brand-menu', arg: { id: 'brand' } });
  const identity = topbarIdentity(explicitRoute(), brand);
  assert.equal(identity.hideLabel, true);
  assert.equal(identity.label, 'Search');
  assert.equal(identity.menu, 'brand-menu');
  assert.deepEqual(identity.arg, { id: 'brand' });
  const output = String(renderTopbar({ ident: identity, path: 'path-value' }));
  assert.equal(output.includes('<span>' + identity.label + '</span>'), false);
  assert.match(output, /aria-label="Search"/);
  assert.match(output, /data-menu="brand-menu"/);
  assert.match(output, /path-value/);
  for (const [ident, isTool] of [
    [{ icon: 'document', label: 'shell.search' }, false],
    [{ icon: 'globe', label: { raw: 'Other' } }, false],
    [explicitRoute(), true],
  ]) assert.equal(topbarIdentity(ident, brand, isTool).hideLabel, false);
  assert.equal(topbarIdentity(null, brand), null);
});


test('flowStatusLine_step_transition_keeps_status_name_without_visual_counter', () => {
  const before = { id: 'first', label: { raw: 'Prepare' }, state: 'done' };
  const current = { id: 'next', label: { raw: 'Connect' }, state: 'run' };
  const props = { steps: [before, current], status: { kind: 'busy', since: Date.now() } };
  const output = String(flowStatusLine(props));
  assert.match(output, /role="status"/);
  assert.match(output, /data-key="next"/);
  assert.match(output, /class="fs-shim"/);
  assert.match(output, /data-since=/);
  assert.match(output, /Connect/);
  assert.match(output, /class="fs-it out"/);
  assert.doesNotMatch(output, /fs-num|<b[ >]|[①-⑳]/);
  assert.equal(flowStatusRunning(props), true);
  const waiting = { ...props, status: { kind: 'busy', text: { raw: 'Waiting' } }, actions: [{}, {}] };
  assert.match(String(flowStatusLine(waiting)), /Waiting/);
  assert.equal(flowStatusRunning(waiting), true);
  const finished = { steps: [{ ...current, state: 'done' }] };
  assert.equal(flowStatusRunning(finished), false);
  assert.match(String(flowStatusLine(finished)), /data-key="fs-done"/);
});

/* B-06: a conversation row in the sidebar navigates the open tab to the conversation's address. With that conversation already open as a
   (full chat) tab, the open tab became a second copy of it: chat tabs are not listed, so the copy could not be seen or closed and it came back
   after a restart. A conversation address already open in a tab brings that tab forward */
test('navigating_to_a_conversation_already_open_in_a_tab_activates_that_tab_instead_of_copying_it', async () => {
  const { readFileSync } = await import('node:fs'), { runInNewContext } = await import('node:vm'), { createTabs } = await import('./tabs.js');
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const nav = source.slice(source.indexOf('  function navigate('), source.indexOf('  /* ---------- Cards beside the body'));
  const tabs = createTabs();
  const chat = tabs.open('app://chat/c1'), page = tabs.open('app://place/home');
  const activated = [];
  const run = runInNewContext(`${nav}\nnavigate`, {
    tabs, toolsAll: () => [], matchesToolOrigin: () => false, features: {}, desktop: null, settings: { get: () => null },
    router: { isInternal: () => true, parse: a => ({ route: { kind: a.startsWith('app://chat/') ? 'chat' : 'page' } }) },
    closeDetailCards: () => {}, activate: id => { tabs.state.active = id; activated.push(id); }, render: () => {}, saveSession: () => {},
    host: { create() {}, show() {}, navigate() {} },
  });
  run('app://chat/c1');
  assert.deepEqual(tabs.state.tabs.map(x => tabs.current(x).address), ['app://chat/c1', 'app://place/home'], 'no copy of the conversation in the page tab');
  assert.deepEqual(activated, [chat.id]);
  run('app://place/other');
  assert.equal(tabs.current(chat).address, 'app://place/other', 'an ordinary page still opens in the open tab');
  assert.equal(page.entries.length, 1);
});

/* B-12/B-13: a tool the app found at run time (a metrics server behind a forwarded port) was dropped from the restored session, and a
   tool tab whose tool was not known any more was named by its raw id. A run-time tool tab that says how it is opened again (reopen) comes back
   under its own name and icon, waits while the app opens the tool again, and takes the new address in the same tab */
test('restored_run_time_tool_tab_keeps_its_name_and_is_opened_again_in_the_same_tab', async () => {
  const { readFileSync } = await import('node:fs'), { runInNewContext } = await import('node:vm'), { createTabs } = await import('./tabs.js');
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const before = createTabs();
  const def = { id: 'lab-prometheus', name: 'Prometheus', icon: 'brand-prometheus', partition: 'lab-prometheus', reopen: { action: 'app.tool.open', arg: { place: 'lab', tool: { kind: 'prometheus' } } } };
  before.open('app://home');
  before.open('http://127.0.0.1:41234/query', { kind: 'tool', toolId: def.id, title: 'fixture.toolTitle', icon: def.icon, toolDef: def });
  before.open('http://127.0.0.1:41235/', { kind: 'tool', toolId: 'gone', title: 'fixture.old', icon: 'globe' });
  const session = JSON.parse(JSON.stringify(before.serialize()));
  const restore = source.slice(source.indexOf('  if (session && tabs.restore(session)) {'), source.indexOf('  } else if (moved?.addresses?.length) {')) + '  }';
  const nameOf = source.slice(source.indexOf('  const liveTools = [];'), source.indexOf('  function prepareTool('));
  const prepare = source.slice(source.indexOf('  function prepareTool('), source.indexOf('  function openTool('));
  const tabs = createTabs(), created = [], ran = [];
  const ctx = runInNewContext(`${nameOf}${prepare}\n${restore}\n({ toolOf, prepareTool })`, {
    session, tabs, config: { tools: [] }, desktop: {}, features: { externalTools: true }, text: x => x, activate: () => {}, render: () => {},
    router: { parse: a => (a.startsWith('app://') ? { route: {} } : null) }, startAt: () => 'app://home', navigate: () => {},
    host: { create: (id, address) => created.push(address), show() {} }, runAction: (name, p, o) => ran.push({ name, arg: p.arg, tab: o?.sourceTabId }),
  });
  const tool = tabs.state.tabs.find(x => x.kind === 'tool');
  assert.ok(tool, 'the run-time tool tab comes back');
  assert.equal(tabs.state.tabs.filter(x => x.kind === 'tool').length, 1, 'a tool tab with no way to open it again is not restored');
  assert.equal(ctx.toolOf(tool.toolId).name, 'Prometheus', 'named by its tool, not its raw id');
  assert.equal(tool.preparingTool, true, 'it waits instead of loading the old forwarded address');
  assert.ok(!created.includes('http://127.0.0.1:41234/query'));
  assert.deepEqual(ran, [{ name: 'app.tool.open', arg: def.reopen.arg, tab: tool.id }]);
  assert.equal(ctx.prepareTool(def, null), tool.id, 'opening it again fills the waiting tab');
});

/* R4-01: a session saved before the start page was removed brought its tab back on 'app://start' (no route): the tab showed "not found" under
   the app brand. A restored tab on a page that is gone (a removed or unknown route) comes back on the start place the app restores to, once
   (a second gone tab or one already open there is dropped); history steps to gone pages are dropped; with no place to restore to
   (config.start answers nothing when restoring) the tab is dropped, and with no tab left the start address opens as on a fresh start */
test('restored_tabs_on_removed_or_unknown_routes_come_back_on_the_start_place_or_are_dropped', async () => {
  const { readFileSync } = await import('node:fs'), { runInNewContext } = await import('node:vm'), { createTabs } = await import('./tabs.js');
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const restore = source.slice(source.indexOf('  if (session && tabs.restore(session)) {'), source.indexOf('  } else if (moved?.addresses?.length) {')) + '  }';
  const routes = ['place/:id', 'settings/:page'];
  const router = { parse: a => { const m = /^app:\/\/(.*)$/.exec(a); if (!m) return null; const segs = m[1].split('/'); return routes.some(r => r.split('/').length === segs.length && r.split('/').every((p, i) => p.startsWith(':') || p === segs[i])) ? { route: {} } : { route: null, notFound: true }; } };
  const saved = () => { const t = createTabs(); t.open('app://start'); t.open('app://place/b', { entries: [{ address: 'app://start', title: '' }, { address: 'app://place/b', title: '' }], index: 1 }); t.open('app://gone/x/y'); t.open('app://place/a'); return JSON.parse(JSON.stringify(t.serialize())); };
  const run = (restoring, session = saved()) => {
    const tabs = createTabs(), created = [], opened = [];
    runInNewContext(restore, {
      session, tabs, router, config: { tools: [] }, desktop: {}, features: {}, text: x => x, activate: () => {}, render: () => {}, liveTools: [],
      startAt: r => (r ? restoring : 'app://settings/clusters'), navigate: (address, o) => opened.push([address, o.newTab]),
      host: { create: (id, address) => created.push(address), show() {} }, runAction: () => {},
    });
    return { tabs: tabs.state.tabs.map(x => tabs.current(x).address), history: tabs.state.tabs.map(x => x.entries.map(e => e.address)), created, opened };
  };
  const home = run('app://place/a');
  assert.deepEqual(home.tabs, ['app://place/b', 'app://place/a'], 'gone tabs map to the start place, which is already open: dropped');
  assert.deepEqual(home.history[0], ['app://place/b'], 'no back step to a gone page');
  const other = run('app://place/h');
  assert.deepEqual(other.tabs, ['app://place/h', 'app://place/b', 'app://place/a'], 'the first gone tab comes back on the start place, the second is dropped');
  const none = run(null);
  assert.deepEqual(none.tabs, ['app://place/b', 'app://place/a'], 'nothing to restore to: dropped');
  const onlyGone = (() => { const t = createTabs(); t.open('app://start'); return JSON.parse(JSON.stringify(t.serialize())); })();
  const empty = run(null, onlyGone);
  assert.deepEqual(empty.tabs, []);
  assert.deepEqual(empty.opened, [['app://settings/clusters', true]], 'no tab left: the start address opens');
  assert.match(source, /const startAt = restoring => \(typeof config\.start === 'function' \? config\.start\(\{ settings: settings\.all\(\), restoring: !!restoring \}\)/);
});

/* R4-01/R4-15: the app-brand identity (a page with no identity of its own) passed the brand name already in words to topbarIdentity, which looked
   it up again as a key ("missing locale key: <brand>"). Identities carry keys or { raw } until topbarIdentity puts them in words */
test('the_brand_and_tool_identities_reach_the_top_bar_as_keys_and_are_put_in_words_once', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('  function topbarHtml(tab) {'), source.indexOf('  const dictate = '));
  assert.doesNotMatch(fn, /label: text\(config\.brand\.name\)|label: text\(toolOf/, 'no word passed where a key is read');
});

/* Start page removed (decision 2026-11-18): a new window, a new tab and the last tab closed open the app's start address as it is at that moment
   (an app may start on the place the person viewed last); there is no separate new-tab page. "restore" brings the last tabs back when there are any */
test('startup_and_a_new_tab_open_the_start_address_as_it_is_now_and_there_is_no_new_tab_page', async () => {
  const { readFileSync } = await import('node:fs'), { runInNewContext } = await import('node:vm');
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const start = source.slice(source.indexOf('  const session = features.restoreSession'), source.indexOf('  render();\n  if (updates)'));
  const run = startup => {
    const opened = [];
    let place = 'app://place/a';
    runInNewContext(start, {
      features: { restoreSession: true }, secondWindow: false, settings: { get: k => (k === 'kit.startup' ? startup : k === 'kit.session' ? null : undefined) },
      renderFrame() {}, tabs: { restore: () => false }, moved: null, startAt: () => place, config: { newTab: 'app://start' },
      navigate: (address, o) => opened.push([address, o.newTab]),
    });
    place = 'app://place/b';
    return opened;
  };
  assert.deepEqual(run('new'), [['app://place/a', true]]);
  assert.deepEqual(run('restore'), [['app://place/a', true]]);
  assert.doesNotMatch(source, /config\.newTab/, 'no new-tab page');
  assert.match(source, /'kit\.tab\.new': \(\) => navigate\(startAt\(\), \{ newTab: true/, 'a new tab opens the start address in a new tab');
});

/* B-25: the palette offered open tabs and the app's sources only: typing the name of a settings page ("Agents") found nothing.
   Every settings page is a row ("Settings › page") that opens it, and an app source's group label may follow the state (the screens of a
   chosen place under its name) */
test('palette_lists_the_settings_pages_and_takes_a_source_label_from_the_state', async () => {
  const { readFileSync } = await import('node:fs'), { runInNewContext } = await import('node:vm');
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('  async function openPalette('), source.indexOf('\n  }\n', source.indexOf('  async function openPalette(')) + 4);
  let opened = null;
  const run = runInNewContext(`${fn}\nopenPalette`, {
    features: { palette: true }, tabs: { state: { tabs: [], closed: [] } }, isPage: () => false, tabLabel: () => '', t: k => k, text: x => (typeof x === 'object' ? x.raw : x),
    settings: { all: () => ({ place: 'lab' }) }, ctx: { palette: { open: def => { opened = def; } } },
    config: { settings: { groups: [{ label: 'fixture.personal', pages: [{ id: 'general', label: { raw: 'General' }, icon: 'settings' }] }, { label: 'fixture.connect', pages: [{ id: 'agent', label: { raw: 'Agents' }, icon: 'robot' }] }] },
      palette: { sources: [{ id: 'screens', label: st => ({ raw: st.place }), search: () => [{ id: 'v-net', label: { raw: 'Network' }, action: 'go' }] }] } },
  });
  await run();
  const settingsGroup = opened.groups.find(g => g.rows.some(r => r.action === 'kit.settings.open'));
  assert.ok(settingsGroup, 'a group of settings pages');
  assert.deepEqual(settingsGroup.rows.map(r => [r.label, r.arg]), [['settings.title › General', 'general'], ['settings.title › Agents', 'agent']]);
  assert.equal(opened.groups.find(g => g.rows.some(r => r.id === 'v-net')).label, 'lab');
});

/* R4 (⌘K): a conversation open in a tab was listed twice, under "Open tabs" and again under the app's recent conversations. A source row that
   opens an address already open in a tab is left out: the open tab's row stands for it */
test('palette_shows_a_place_open_in_a_tab_once_under_the_open_tabs', async () => {
  const { readFileSync } = await import('node:fs'), { runInNewContext } = await import('node:vm'), { createTabs } = await import('./tabs.js');
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('  async function openPalette('), source.indexOf('\n  }\n', source.indexOf('  async function openPalette(')) + 4);
  const tabs = createTabs(); tabs.open('app://chat/c1');
  let opened = null;
  const run = runInNewContext(`${fn}\nopenPalette`, {
    features: { palette: true }, tabs, isPage: () => false, tabLabel: () => 'c1', t: k => k, text: x => (typeof x === 'object' ? x.raw : x),
    settings: { all: () => ({}) }, ctx: { palette: { open: def => { opened = def; } } },
    config: { palette: { sources: [{ id: 'conv', label: 'fixture.conversations', search: () => [
      { id: 'c1', label: { raw: 'one' }, action: 'kit.navigate', arg: { address: 'app://chat/c1' } }, { id: 'c2', label: { raw: 'two' }, action: 'kit.navigate', arg: { address: 'app://chat/c2' } }] }] } },
  });
  await run();
  assert.deepEqual(opened.groups[0].rows.map(r => r.action), ['kit.tab.activate'], 'the open tab');
  assert.deepEqual(opened.groups.find(g => g.label === 'fixture.conversations').rows.map(r => r.id), ['c2'], 'not listed again');
});

/* B2-12: with the conversation card open beside a place page the terminal key was read from the conversation card (the last card), so the
   top bar's terminal button was off with "desktop only". The terminal belongs to the page the top bar is for: the body, or the detail in front of it */
test('terminal_key_follows_the_page_of_the_top_bar_not_the_conversation_card_beside_it', async () => {
  const { readFileSync } = await import('node:fs'), { runInNewContext } = await import('node:vm');
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const line = source.slice(source.indexOf('  const termKey = '), source.indexOf('\n', source.indexOf('  const termKey = ')));
  const body = { id: 'b', address: 'app://place/lab/incidents' }, ai = { id: 'c', address: 'app://chat/new' };
  const termKey = runInNewContext(`${line}\ntermKey`, {
    config: { terminal: { session: m => (m.params.place ? 'term:' + m.params.place : null) } }, desktop: {}, state: {},
    tabs: { presented: () => ai, active: () => body }, navTab: () => body, termTab: () => body,
    routeOf: tab => (tab === body ? { route: { id: 'incidents' }, params: { place: 'lab' } } : { route: { id: 'chat' }, params: {} }),
  });
  assert.equal(termKey(), 'term:lab');
});

/* B2-04: a conversation started in a card or tab stayed at app://chat/new titled "new chat" after its first answer: the lists and ⌘K looked for its
   own address and a restart opened an empty conversation. The page names its saved record in page:meta and the tab's entry takes that address */
test('a_new_conversation_page_naming_its_saved_record_moves_its_tab_to_that_address_without_loading_again', async () => {
  const { readFileSync } = await import('node:fs'), { runInNewContext } = await import('node:vm'), { createTabs } = await import('./tabs.js');
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('  function adoptConversation('), source.indexOf('  function onPageMessage('));
  const tabs = createTabs(), chat = tabs.open('app://chat/new'), page = tabs.open('app://place/home');
  const router = { parse: a => { const m = /^app:\/\/chat\/(.+)$/.exec(a); return m ? { route: { id: 'chat', kind: 'chat' }, params: { id: m[1] } } : { route: { id: 'home', kind: 'page' }, params: {} }; }, build: (_r, p) => `app://chat/${p.id}` };
  const adopt = runInNewContext(`${fn}\nadoptConversation`, { tabs, router });
  assert.equal(adopt(chat, 'cv-1'), true);
  assert.equal(tabs.current(chat).address, 'app://chat/cv-1');
  assert.equal(adopt(chat, 'cv-2'), false, 'an already saved conversation keeps its address');
  assert.equal(adopt(page, 'cv-3'), false, 'only a chat page');
  assert.equal(tabs.current(page).address, 'app://place/home');
  const other = tabs.open('app://chat/new');
  assert.equal(adopt(other, '../x'), false, 'an id that is not one path segment is refused');
});

/* B-30: a dialog in a settings page dimmed only that page's view; the sidebar and top bar stayed bright and live. The page tells the shell
   (page:scrim) and the shell lays the dialog's scrim over the rest; pressing it closes the page's dialog; it goes when the dialog closes */
test('a_page_dialog_dims_the_rest_of_the_window_and_pressing_the_dimming_closes_it', async () => {
  const { readFileSync } = await import('node:fs'), { runInNewContext } = await import('node:vm');
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('  let scrim = null;'), source.indexOf('  function onPageMessage('));
  const body = { children: [], appendChild(el) { this.children.push(el); el.parent = this; } };
  const el = () => ({ dataset: {}, listeners: {}, addEventListener(n, f) { this.listeners[n] = f; }, remove() { body.children = body.children.filter(x => x !== this); } });
  const sent = [];
  const run = runInNewContext(`${fn}\n({ pageScrim, get: () => scrim })`, { doc: { body, createElement: el }, host: { send: (id, m) => sent.push([id, m]) }, envelope: (type, payload) => ({ type, payload }) });
  run.pageScrim('t1', true, true);
  assert.equal(body.children.length, 1);
  assert.equal(body.children[0].className, 'dlg-layer confirm');
  body.children[0].listeners.click();
  assert.equal(JSON.stringify(sent), JSON.stringify([['t1', { type: 'shell:scrim', payload: { op: 'close' } }]]));
  run.pageScrim('t1', false);
  assert.equal(body.children.length, 0, 'gone with the dialog');
});

/* B2-11: ⇧⌘A (search tabs) opened the whole palette (the app's sources and the settings pages). It searches the open and recently closed tabs only,
   and a closed tab's row reopens that tab, not the last one closed */
test('search_tabs_lists_only_the_open_and_recently_closed_tabs', async () => {
  const { readFileSync } = await import('node:fs'), { runInNewContext } = await import('node:vm'), { defaultShortcuts } = await import('../core/shortcuts.js');
  assert.equal(defaultShortcuts({}).find(s => s.id === 'kit.palette.tabs').arg, 'tabs');
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('  async function openPalette('), source.indexOf('\n  }\n', source.indexOf('  async function openPalette(')) + 4);
  let opened = null;
  const run = runInNewContext(`${fn}\nopenPalette`, {
    features: { palette: true }, tabs: { state: { tabs: [{ id: 'a', title: 'A' }], closed: [{ id: 'z', title: 'Z' }] } }, isPage: () => true, tabLabel: tb => tb.title, t: k => k, text: x => x,
    settings: { all: () => ({}) }, ctx: { palette: { open: def => { opened = def; } } },
    config: { settings: { groups: [{ pages: [{ id: 'general', label: 'fixture.general' }] }] }, palette: { sources: [{ id: 'x', label: 'X', search: () => [{ id: 'x1', label: 'x' }] }] } },
  });
  await run('tabs');
  assert.equal(opened.groups.map(g => g.label).join(), 'palette.openTabs,palette.recentlyClosed');
  assert.equal(opened.groups[1].rows[0].arg, 'z');
  await run();
  assert.ok(opened.groups.length > 2, 'the whole palette still has its sources');
});

/* B2-20: with the conversation card open a toast stood in the middle of the window, over the gap between the page and the card. It stands under
   the middle of the body card while cards are beside it, and in the middle otherwise */
test('toasts_sit_under_the_body_card_while_cards_stand_beside_it', async () => {
  const { readFileSync } = await import('node:fs'), { runInNewContext } = await import('node:vm'), { css } = await import('../components/toast.js');
  assert.match(css, /\.toasts \{[^}]*left: var\(--toast-x, 50%\)/);
  const source = readFileSync(new URL('./shell.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('  function placeToasts('), source.indexOf('  function applyPanes('));
  const vars = {}, content = { getBoundingClientRect: () => ({ left: 300, width: 500 }) };
  let cards = [{ id: 'c' }];
  const place = runInNewContext(`${fn}\nplaceToasts`, { frame: { querySelector: () => content }, activePair: () => null, shownCards: () => cards, chain: [],
    doc: { documentElement: { style: { setProperty: (k, v) => { vars[k] = v; } } } } });
  place(); assert.equal(vars['--toast-x'], `${300 + 500 / 2}` + 'px');
  cards = []; place(); assert.equal(vars['--toast-x'], '50%');
});
