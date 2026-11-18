const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function startHost() {
  const handlers = new Map(), windows = [], contents = [];
  const image = { isEmpty: () => false, resize() { return this; }, toDataURL: () => 'data:image/png;base64,AA==' };
  let keyboard = null;
  function createContents() {
    const wc = new EventEmitter();
    Object.assign(wc, {
      id: contents.length + 1, destroyed: false, focusCalls: 0,
      session: { setSpellCheckerEnabled() {} },
      focus() { this.focusCalls++; keyboard = this; this.emit('focus'); },
      isFocused() { return keyboard === this; },
      isDestroyed() { return this.destroyed; },
      close() { this.destroyed = true; if (keyboard === this) keyboard = null; this.emit('destroyed'); },
      capturePage: async () => image,
      setWindowOpenHandler() {}, async loadURL() {}, send() {},
    });
    contents.push(wc);
    return wc;
  }
  class View {
    constructor() { this.webContents = createContents(); }
    setBackgroundColor() {}
    setBounds() {}
    setVisible(on) { this.visible = on; if (!on && keyboard === this.webContents) keyboard = null; }
    getVisible() { return this.visible; }
  }
  const win = new EventEmitter();
  Object.assign(win, {
    focused: true, minimized: false,
    isFocused() { return this.focused; }, isMinimized() { return this.minimized; }, isDestroyed: () => false,
    contentView: { addChildView() {}, removeChildView() {} },
    focus() { assert.fail('window activation forbidden'); }, show() { assert.fail('window display forbidden'); },
  });
  const sender = createContents();
  const dependencies = {
    electron: {
      app: { isPackaged: true, setName() {}, setPath() {}, getVersion: () => '0.0.0', getPath: () => '/synthetic', whenReady: () => ({ then() {} }), on() {}, focus() { assert.fail('app activation forbidden'); } },
      WebContentsView: View, ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} },
      protocol: { registerSchemesAsPrivileged() {} }, nativeTheme: { shouldUseDarkColors: false },
    },
    'node:path': path, 'node:fs': { readFileSync() { throw new Error('no preferences'); } },
    'node:url': {}, 'node:os': { homedir: () => '/synthetic', userInfo: () => ({ homedir: '/synthetic' }) }, 'node:child_process': {},
    'node:crypto': require('node:crypto'), './updater.cjs': require('./updater.cjs'), './terminal-appearance.cjs': require('./terminal-appearance.cjs'),
    './tool-auth.cjs': {}, './menu.cjs': {}, './named-bundle.cjs': { relaunchNamed: () => false },
    './background-run.cjs': require('./background-run.cjs'), '../core/live.js': require('../core/live.js'), './native.cjs': {}, './platform/index.cjs': { capabilities: () => ({ translucent: false }) }, './terminal.cjs': {},
  };
  const context = {
    module: { exports: {} }, __dirname, process: { platform: 'linux', env: {} }, URL,
    setTimeout() {}, clearTimeout() {},
    Set: class extends Set { constructor(...args) { super(...args); windows.push(this); } },
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, 'main.cjs'), 'utf8'), context);
  context.module.exports.start({ appId: 'sample', name: 'Sample', scheme: 'sample', window: { translucent: false } }, { appRoot: __dirname, repoRoot: __dirname });
  const W = { win, shellView: { webContents: sender }, tabs: new Map(), panes: [], active: null };
  windows[0].add(W);
  const call = (name, ...args) => handlers.get('kit:' + name)({ sender }, ...args);
  for (const id of ['a', 'b']) call('tabs:create', id, 'sample://start');
  call('tabs:show', 'a');
  call('tabs:layout', [{ id: 'a', rect: { x: 0, y: 0, width: 800, height: 600 } }], 0);
  const page = W.tabs.get('a').view.webContents;
  page.focus(); page.focusCalls = 0;
  return { W, win, sender, page, call, image };
}

test('tabs_thaw_passive_toast_restores_previous_page_only_once', async () => {
  const h = startHost();
  const destroyedListeners = h.page.listenerCount('destroyed');

  await h.call('tabs:freeze', 'a', false);
  assert.equal(h.page.isFocused(), false);
  h.call('tabs:thaw', 'a');
  h.call('tabs:thaw', 'a');

  assert.equal(h.page.isFocused(), true);
  assert.equal(h.page.focusCalls, 1);
  assert.equal(h.sender.focusCalls, 0);
  assert.equal(h.page.listenerCount('destroyed'), destroyedListeners);
  assert.equal(h.win.listenerCount('blur'), 0);
});

test('tabs_thaw_user_movement_cancels_restoration', async t => {
  const cases = {
    'inactive window': h => { h.win.focused = false; h.win.emit('blur'); },
    'blur and return': h => { h.win.emit('blur'); },
    minimized: h => { h.win.minimized = true; h.win.emit('minimize'); },
    'minimize and return': h => { h.win.emit('minimize'); },
    'shell input': h => h.sender.focus(),
    'other page': h => h.W.tabs.get('b').view.webContents.focus(),
    'tab switch': h => h.call('tabs:show', 'b'),
    'tab close': h => h.call('tabs:close', 'a'),
  };
  for (const [name, move] of Object.entries(cases)) await t.test(name, async () => {
    const h = startHost();
    await h.call('tabs:freeze', 'a', false);

    move(h);
    h.call('tabs:thaw', 'a');

    assert.equal(h.page.focusCalls, 0);
    assert.equal(h.win.listenerCount('blur'), 0);
  });
});

test('tabs_freeze_capture_races_do_not_hide_or_restore_stale_page', async t => {
  for (const movement of ['thaw', 'close', 'switch']) await t.test(movement, async () => {
    const h = startHost();
    let finish;
    h.page.capturePage = () => finish ? Promise.resolve(h.image) : new Promise(resolve => { finish = resolve; });
    const pending = h.call('tabs:freeze', 'a', false);

    if (movement === 'thaw') h.call('tabs:thaw', 'a');
    if (movement === 'close') h.call('tabs:close', 'a');
    if (movement === 'switch') h.call('tabs:show', 'b');
    finish(h.image);
    await pending;

    assert.ok(!h.W.tabs.get('a')?.frozen);
    assert.equal(h.page.focusCalls, 0);
  });
});

test('tabs_freeze_underlay_only_for_the_presented_detail_overlay', async t => {
  const panes = [{ id: 'a', rect: { x: 0, y: 0, width: 800, height: 600 } }, { id: 'b', rect: { x: 0, y: 0, width: 300, height: 600 } }];
  await t.test('stale laid-out pane after a plain switch is not frozen', async () => {
    const h = startHost();
    h.call('tabs:layout', panes, 0);
    h.call('tabs:show', 'b'); // no marker: W.panes still lists the old pane 'a'
    assert.equal(await h.call('tabs:freeze', 'a', false), null);
    assert.ok(!h.W.tabs.get('a').frozen);
  });
  await t.test('the list under the presented overlay is frozen with it', async () => {
    const h = startHost();
    h.call('tabs:show', 'b', { under: 'a' });
    assert.notEqual(await h.call('tabs:freeze', 'a', false), null);
    assert.equal(h.W.tabs.get('a').frozen, true);
  });
  await t.test('a marker for another list does not allow this one', async () => {
    const h = startHost();
    h.call('tabs:show', 'b', { under: 'a' });
    h.call('tabs:create', 'c', 'sample://start');
    assert.equal(await h.call('tabs:freeze', 'c', false), null);
  });
  for (const movement of ['switch', 'close overlay', 'close list']) await t.test('capture race: ' + movement, async () => {
    const h = startHost();
    let finish;
    h.page.capturePage = () => new Promise(resolve => { finish = resolve; });
    h.call('tabs:show', 'b', { under: 'a' });
    const pending = h.call('tabs:freeze', 'a', false);
    if (movement === 'switch') { h.call('tabs:create', 'c', 'sample://start'); h.call('tabs:show', 'c'); }
    if (movement === 'close overlay') h.call('tabs:close', 'b');
    if (movement === 'close list') h.call('tabs:close', 'a');
    h.call('tabs:layout', panes, 0); // a stale pane list must not revive the capture
    finish(h.image);
    assert.equal(await pending, null);
    assert.ok(!h.W.tabs.get('a')?.frozen);
    assert.equal(h.page.focusCalls, 0);
  });
});

test('tabs_freeze_old_capture_does_not_replace_new_cycle', async () => {
  const h = startHost();
  const finishes = [];
  h.page.capturePage = () => new Promise(resolve => finishes.push(resolve));
  const first = h.call('tabs:freeze', 'a', false);
  h.call('tabs:thaw', 'a');
  const second = h.call('tabs:freeze', 'a', false);

  finishes[1](h.image); await second;
  finishes[0](h.image); await first;
  h.call('tabs:thaw', 'a');

  assert.equal(h.page.isFocused(), true);
  assert.equal(h.page.focusCalls, 1);
});

test('tabs_thaw_shell_owned_and_background_overlays_do_not_take_focus', async t => {
  for (const mode of ['menu', 'shell', 'background', 'failed capture']) await t.test(mode, async () => {
    const h = startHost();
    if (mode === 'shell') h.sender.focus();
    if (mode === 'background') h.win.focused = false;
    if (mode === 'failed capture') h.page.capturePage = async () => { throw new Error('capture unavailable'); };

    await h.call('tabs:freeze', 'a', mode === 'menu');
    h.call('tabs:thaw', 'a');

    assert.equal(h.page.focusCalls, Number(mode === 'failed capture'));
    if (mode === 'menu') assert.equal(h.sender.isFocused(), true);
  });
});

test('tabs_freeze_user_focus_during_capture_is_preserved', async () => {
  const h = startHost();
  let finish;
  h.page.capturePage = () => new Promise(resolve => { finish = resolve; });
  const pending = h.call('tabs:freeze', 'a', false);

  h.sender.focus();
  finish(h.image); await pending;
  h.call('tabs:thaw', 'a');

  assert.equal(h.sender.isFocused(), true);
  assert.equal(h.page.focusCalls, 0);
});

test('setOverlay_real_freeze_thaw_callbacks_restore_after_last_owner', async t => {
  const { createDesktopHost } = await import('../shell/hosts/desktop-host.js');
  const previousRaf = globalThis.requestAnimationFrame, previousObserver = globalThis.ResizeObserver;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.ResizeObserver = class { observe() {} };
  t.after(() => { globalThis.requestAnimationFrame = previousRaf; globalThis.ResizeObserver = previousObserver; });
  const h = startHost();
  const images = new Set();
  const doc = {
    defaultView: { addEventListener() {} }, addEventListener() {},
    createElement: () => ({ style: {}, remove() { images.delete(this); } }),
  };
  const host = createDesktopHost({ doc, bridge: { on() {}, invoke: h.call }, entryUrl: x => x, radius: () => 0 });
  host.mount({ getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600 }), appendChild: image => images.add(image) });
  host.show('a');

  await host.setOverlay(true, null, { owner: 'toast', focus: false });
  await host.setOverlay(true, null, { owner: 'preview', focus: false });
  await host.setOverlay(false, null, { owner: 'toast' });
  assert.equal(h.page.isFocused(), false);
  await host.setOverlay(false, null, { owner: 'preview' });

  assert.equal(h.page.isFocused(), true);
  assert.equal(h.page.focusCalls, 1);
  assert.equal(images.size, 0);
});
