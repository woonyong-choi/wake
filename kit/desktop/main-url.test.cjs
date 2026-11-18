const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function startToolHost(tools, appExtra = {}) {
  const handlers = new Map(), listeners = new Map(), views = [], windows = [], timers = [];
  const external = [];
  const sender = { id: 1, isDestroyed: () => false, send() {} };
  class View {
    constructor(options) {
      this.options = options;
      this.events = new Map();
      this.webContents = {
        session: { setSpellCheckerEnabled() {}, setPermissionRequestHandler() {}, setPermissionCheckHandler() {} },
        id: views.length + 2,
        on: (name, callback) => this.events.set(name, callback),
        setWindowOpenHandler() {},
        loadURL: async url => { this.url = url; },
        isLoading: () => false,
        capturePage: async () => { throw new Error('no synthetic image'); },
        isDestroyed: () => false,
        getTitle: () => '',
        navigationHistory: { canGoBack: () => false, canGoForward: () => false },
      };
      views.push(this);
    }
    setBackgroundColor() {}
    setBorderRadius(radius) { this.radius = radius; }
    setBounds(bounds) { this.bounds = bounds; }
    setVisible(visible) { this.visible = visible; }
  }
  const electron = {
    app: { isPackaged: true, setName() {}, setPath() {}, getVersion: () => '0.0.0', getPath: () => '/synthetic', whenReady: () => ({ then() {} }), on() {}, ...appExtra },
    WebContentsView: View,
    ipcMain: { handle: (name, callback) => handlers.set(name, callback), on: (name, callback) => listeners.set(name, callback) },
    protocol: { registerSchemesAsPrivileged() {} },
    nativeTheme: { shouldUseDarkColors: false },
    shell: { openExternal: url => external.push(url) },
  };
  const dependencies = {
    electron,
    'node:path': path,
    'node:fs': { readFileSync() { throw new Error('no synthetic preferences'); } },
    'node:url': { pathToFileURL() { throw new Error('unexpected file URL'); } },
    'node:os': { homedir: () => '/synthetic', userInfo: () => ({ homedir: '/synthetic' }) },
    'node:child_process': { execFile() { throw new Error('unexpected system execution'); } },
    'node:crypto': require('node:crypto'),
    './tool-auth.cjs': require('./tool-auth.cjs'),
    './menu.cjs': {},
    './named-bundle.cjs': { relaunchNamed: () => false },
    './background-run.cjs': require('./background-run.cjs'), '../core/live.js': require('../core/live.js'), './native.cjs': {},
    './platform/index.cjs': { capabilities: () => ({ translucent: false }) },
    './terminal.cjs': {},
    './updater.cjs': { createUpdater: () => ({ methods: {} }), UPDATE_METHODS: [] },
    './terminal-appearance.cjs': {},
  };
  const context = {
    module: { exports: {} }, __dirname, process: { platform: 'linux', env: {} }, URL, setTimeout: callback => { timers.push(callback); }, clearTimeout() {},
    Set: class extends Set { constructor(...args) { super(...args); windows.push(this); } },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `unexpected dependency: ${name}`);
      return dependencies[name];
    },
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, 'main.cjs'), 'utf8'), context, { filename: path.join(__dirname, 'main.cjs') });
  context.module.exports.start({ appId: 'sample', name: 'Sample', scheme: 'sample', tools, window: { translucent: false } }, { appRoot: __dirname, repoRoot: path.join(__dirname, '..') });
  const children = [], removed = [];
  const contentView = { children, addChildView(view) { children.push(view); }, removeChildView(view) {
    removed.push(view);
    children.splice(children.indexOf(view), 1);
  } };
  const W = { shellView: { webContents: sender }, tabs: new Map(), panes: [], radius: 0, menuState: {}, win: { contentView } };
  windows[0].add(W);
  return { W, sender, views, runTimers: () => timers.splice(0).forEach(callback => callback()), external, children, removed, call: (channel, from, ...args) => handlers.get('kit:' + channel)({ sender: from }, ...args),
    pageSays: (view, env) => { view.webContents.mainFrame ||= {}; listeners.get('kit:page')({ sender: view.webContents, senderFrame: view.webContents.mainFrame }, env); } };
}

// Issue #11: exercise the registered product callback without network or OS effects.
test('user_data_follows_the_user_data_dir_switch_and_defaults_to_the_app_folder', () => {
  const seen = [];
  const setPath = (name, value) => seen.push([name, value]);
  startToolHost([], { setPath, commandLine: { getSwitchValue: name => (name === 'user-data-dir' ? '/synthetic/isolated' : '') } });
  startToolHost([], { setPath, commandLine: { getSwitchValue: () => '' } });
  assert.deepEqual(seen.filter(([name]) => name === 'userData').map(([, value]) => value), ['/synthetic/isolated', path.join('/synthetic', 'sample')]);
});

test('tool_navigation_enforces_origin_and_path_boundaries', async t => {
  const host = startToolHost([{
    id: 'tool', origin: 'https://tool.example.test',
    allowNavigate: ['https://login.example.test/signin', 'https://auth.example.test/flow/', 'invalid', '//relative.example.test'],
  }]);
  host.call('tabs:create', host.sender, 'tool', 'https://tool.example.test/view', { tool: 'tool' });
  const navigate = host.views[0].events.get('will-navigate');
  const { headersFor } = require('./tool-auth.cjs');
  const cases = [
    ['https://tool.example.test/ok', true, true],
    ['https://tool.example.test/path?q=1#part', true, true],
    ['https://tool.example.test', true, true],
    ['https://TOOL.example.test:443/ok', true, true],
    ['https://tool.example.test/%2Foutside?q=%23#part', true, true],
    ['https://%74ool.example.test/ok', true, true],
    ['https://tool.example.test.attacker.invalid/x', false, false],
    ['https://tool.example.test@attacker.invalid/x', false, false],
    ['https://tool.example.test:444/x', false, false],
    ['http://tool.example.test/x', false, false],
    ['https://tool.example.test%2eattacker.invalid/x', false, false],
    ['https://tool.example.test%40attacker.invalid/x', false, false],
    ['https://tool.example.test%2fattacker.invalid/x', false, false],
    ['https://tool.example.test./x', false, false],
    ['https://outside.invalid/', false, false],
    ['https://login.example.test/signin', true, false],
    ['https://login.example.test/signin/step?q=1#part', true, false],
    ['https://login.example.test/signin?next=/outside#part', true, false],
    ['https://login.example.test/signin-evil', false, false],
    ['https://login.example.test/signin%2fevil', false, false],
    ['https://login.example.test/signin%5cevil', false, false],
    ['https://login.example.test/signin/../outside', false, false],
    ['https://login.example.test/signin/%2e%2e/outside', false, false],
    ['https://login.example.test/outside?next=/signin', false, false],
    ['https://login.example.test.attacker.invalid/signin', false, false],
    ['https://login.example.test@attacker.invalid/signin', false, false],
    ['https://login.example.test:444/signin', false, false],
    ['http://login.example.test/signin', false, false],
    ['https://auth.example.test/flow/step', true, false],
    ['https://auth.example.test/flow/', true, false],
    ['https://auth.example.test/flow', false, false],
    ['https://auth.example.test/flow-evil', false, false],
    ['/relative', false, false],
    ['//tool.example.test/path', false, false],
    ['#part', false, false],
    ['?query', false, false],
    ['', false, false],
    ['invalid', false, false],
    ['https://[invalid', false, false],
    ['file:///sample', false, false],
    ['javascript:void(0)', false, false],
    ['sample://start', false, false],
  ];

  for (const [url, allowed, authenticated] of cases) {
    await t.test(url || 'empty URL', () => {
      let prevented = false;
      const externalBefore = host.external.length;
      navigate({ preventDefault() { prevented = true; } }, url);

      assert.equal(!prevented, allowed, 'navigation allow list');
      const opensExternal = !allowed && /^https?:/.test(url);
      assert.equal(host.external.length - externalBefore, Number(opensExternal), 'external browser fallback');
      if (opensExternal) assert.equal(host.external.at(-1), url);
      assert.equal(!!headersFor(url, 'https://tool.example.test', () => ({ Authorization: 'Bearer synthetic' })), authenticated, 'Bearer origin boundary');
    });
  }
});


/* The expectation changed (2026-11-16): a tool tab used to keep a square viewport (radius 0), so its card alone had square corners next to
   the app panes and the AI card (user report; pane corner rule: every card takes the window's inner radius). A tool view now takes the same
   corner as every pane, from its first placement and on every change */
test('external tabs take the same corner as the app panes when the window applies its internal radius', () => {
  const host = startToolHost([{ id: 'tool', origin: 'https://tool.example.test' }]);
  const layout = (panes, radius) => host.call('tabs:layout', host.sender, panes, radius);
  const makeTab = (id, url, options) => host.call('tabs:create', host.sender, id, url, options);
  const internal = { id: 'internal', rect: { x: 264, y: 41, width: 420, height: 759 } };
  const external = { id: 'external', rect: { x: 692, y: 41, width: 308, height: 759 } };
  layout([], 16);
  makeTab('internal', 'sample://start', {});
  makeTab('external', 'https://tool.example.test/view', { tool: 'tool' });
  const [page, tool] = host.views;
  assert.equal(page.radius, 16);
  assert.equal(tool.radius, 16);

  layout([internal, external], 12);
  assert.equal(page.radius, 12);
  assert.equal(tool.radius, 12);
  assert.equal(tool.bounds, external.rect);
  assert.equal(tool.visible, false);
  tool.events.get('did-finish-load')();
  assert.equal(tool.visible, true);
  assert.equal(tool.options.webPreferences.preload, undefined);

  layout([internal], 16);
  assert.equal(tool.visible, false);
  assert.equal(tool.radius, 16);
});

// An empty glass window, then an empty content card, showed while the shell and the first page loaded: a window is shown once its shell
// has placed its views and the in-app pages it placed have drawn (page:ready drawn, or a failed load), at most 1.5s after the first placement
test('a window shows once its placed in-app pages have drawn, and a place already sent is not sent to the view again', () => {
  const host = startToolHost([]);
  let shown = 0;
  Object.assign(host.W.win, { show() { shown++; }, setOpacity(o) { this.opacity = o; } });
  host.W.reveal = { placed: 0, done: false, timer: null };
  const call = (channel, ...args) => host.call(channel, host.sender, ...args);
  const pane = id => ({ id, rect: { x: 264, y: 41, width: 800, height: 700 } });
  call('tabs:create', 'home', 'sample://start');
  call('tabs:create', 'other', 'sample://start');
  const [home, other] = host.views;
  call('tabs:layout', [pane('home')], 0);
  assert.equal(home.visible, true);
  assert.equal(shown, 0);
  host.pageSays(other, { v: 1, type: 'page:ready', payload: { drawn: true } });  // a tab that is not placed does not hold the window
  assert.equal(shown, 0);
  host.pageSays(home, { v: 1, type: 'page:ready', payload: {} });                 // ready without a drawing (a page waiting for the shell's init)
  assert.equal(shown, 0);
  host.pageSays(home, { v: 1, type: 'page:ready', payload: { drawn: true } });
  assert.equal(shown, 1);
  assert.equal(host.W.win.opacity, 1);
  host.pageSays(home, { v: 1, type: 'page:ready', payload: { drawn: true } });
  assert.equal(shown, 1);

  const bounds = home.bounds;
  call('tabs:layout', [pane('home')], 0);
  assert.equal(home.bounds, bounds);                                              // the same place is not set again
});

// An empty card showed between a tab and the new tab opened over it: the pane keeps the tab it showed until the new one has drawn
test('a pane keeps showing its previous tab until the new tab has drawn', () => {
  const host = startToolHost([]);
  const call = (channel, ...args) => host.call(channel, host.sender, ...args);
  const rect = { x: 264, y: 41, width: 800, height: 700 };
  call('tabs:create', 'home', 'sample://start');
  const [home] = host.views;
  call('tabs:layout', [{ id: 'home', rect }], 0);
  host.pageSays(home, { v: 1, type: 'page:ready', payload: { drawn: true } });
  call('tabs:create', 'next', 'sample://start');
  const next = host.views[1];
  call('tabs:layout', [{ id: 'next', rect }], 0);                         // the shell shows the new tab in the same pane
  assert.equal(home.visible, true);
  assert.equal(next.visible, false);
  assert.deepEqual(home.bounds, rect);
  host.pageSays(next, { v: 1, type: 'page:ready', payload: { drawn: true } });
  assert.equal(next.visible, true);
  assert.deepEqual(next.bounds, rect);
  assert.equal(home.visible, true);                                         // still under the new view until its first frame is on screen
  host.runTimers();
  assert.equal(home.visible, false);
});

test('a failed first document counts as drawn for the window', () => {
  const host = startToolHost([]);
  let shown = 0;
  Object.assign(host.W.win, { show() { shown++; }, setOpacity() {} });
  host.W.reveal = { placed: 0, done: false, timer: null };
  host.call('tabs:create', host.sender, 'home', 'sample://start');
  host.call('tabs:layout', host.sender, [{ id: 'home', rect: { x: 0, y: 0, width: 10, height: 10 } }], 0);
  host.views[0].events.get('did-fail-load')({}, -105, 'NAME_NOT_RESOLVED', 'sample://start', true);
  assert.equal(shown, 1);
});

test('showing a newly prepared tool leaves its native view attached, and still raises older tabs', () => {
  const host = startToolHost([{ id: 'tool', origin: 'https://tool.example.test' }]);
  const call = (channel, ...args) => host.call(channel, host.sender, ...args);
  call('tabs:create', 'home', 'sample://start');
  call('tabs:show', 'home');
  call('tabs:show', 'prepared');
  call('tabs:create', 'prepared', 'https://tool.example.test/query', { tool: 'tool' });
  call('tabs:show', 'prepared');
  assert.deepEqual(host.removed, []);
  assert.equal(host.children.at(-1), host.views[1]);
  call('tabs:show', 'home');
  assert.deepEqual(host.removed, [host.views[0]]);
  assert.equal(host.children.at(-1), host.views[0]);
});

// Chromium keeps zoom per host in the profile: the first internal page of the process takes the setting, later ones keep the session level
test('zoom setting is applied once per internal host and process, never to tools', () => {
  const host = startToolHost([{ id: 'tool', origin: 'https://tool.example.test' }]);
  const hostZoom = new Map([['app', 2.5], ['tool.example.test', 2]]);   // levels remembered by the profile
  const make = (id, url, options) => {
    host.call('tabs:create', host.sender, id, url, options);
    const wc = host.views.at(-1).webContents, at = new URL(url).host;
    wc.getURL = () => url;
    wc.setZoomFactor = f => hostZoom.set(at, f);
    wc.getZoomFactor = () => hostZoom.get(at) ?? 1;
  };
  const zoom = (id, ...args) => host.call('tabs:zoom', host.sender, id, ...args);
  make('a', 'sample://app/a.html', {});
  make('b', 'sample://app/b.html', {});
  make('t', 'https://tool.example.test/view', { tool: 'tool' });
  assert.equal(zoom('a', 1, { initial: true }), 1);          // the remembered 2.5 gives way to the setting
  zoom('a', 1.5);                                            // keyboard zoom
  assert.equal(zoom('b', 1, { initial: true }), 1.5);        // another tab or window of the process keeps it
  assert.equal(zoom('t', 1, { initial: true }), 2);          // a tool keeps its own level
  assert.equal(zoom('b', 1), 1);                             // Actual Size still sets it
});
