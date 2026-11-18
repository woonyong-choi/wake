const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function startHost() {
  const handlers = new Map(), windows = [], contents = [];
  const image = { isEmpty: () => false, resize() { return this; }, toDataURL: () => 'data:image/png;base64,AA==' };
  let keyboard = null, popups = [], template = null, popupError = null;
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
    setVisible(on) { if (!on && this.visible && popups.length) popups.at(-1).callback(); this.visible = on; if (!on && keyboard === this.webContents) keyboard = null; }
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
      Menu: { buildFromTemplate(items) { template = items; if (popupError) throw popupError; return { popup(options) { popups.push(options); } }; } },
      WebContentsView: View, ipcMain: { handle: (name, fn) => handlers.set(name, fn), on() {} },
      protocol: { registerSchemesAsPrivileged() {} }, nativeTheme: { shouldUseDarkColors: false },
    },
    'node:path': path, 'node:fs': { readFileSync() { throw new Error('no preferences'); } },
    'node:url': {}, 'node:os': { homedir: () => '/synthetic', userInfo: () => ({ homedir: '/synthetic' }) }, 'node:child_process': {},
    'node:crypto': require('node:crypto'), './updater.cjs': require('./updater.cjs'), './terminal-appearance.cjs': require('./terminal-appearance.cjs'),
    './tool-auth.cjs': {}, './menu.cjs': {}, './named-bundle.cjs': { relaunchNamed: () => false },
    './background-run.cjs': require('./background-run.cjs'), '../core/live.js': require('../core/live.js'), './native.cjs': { loadNative: () => null }, './platform/index.cjs': { capabilities: () => ({ translucent: false }) }, './terminal.cjs': {},
  };
  const context = {
    module: { exports: {} }, __dirname, process: { platform: 'linux', env: {} }, URL,
    setTimeout() {}, clearTimeout() {}, setImmediate,
    Set: class extends Set { constructor(...args) { super(...args); windows.push(this); } },
    require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; },
  };
  vm.runInNewContext(readFileSync(process.env.KIT_MAIN_SOURCE || path.join(__dirname, 'main.cjs'), 'utf8'), context);
  context.module.exports.start({ appId: 'sample', name: 'Sample', scheme: 'sample', window: { translucent: false } }, { appRoot: __dirname, repoRoot: __dirname });
  const W = { win, shellView: { webContents: sender }, tabs: new Map(), panes: [], active: null };
  windows[0].add(W);
  const call = (name, ...args) => handlers.get('kit:' + name)({ sender }, ...args);
  for (const id of ['a', 'b']) call('tabs:create', id, 'sample://start');
  call('tabs:show', 'a');
  call('tabs:layout', [{ id: 'a', rect: { x: 0, y: 0, width: 800, height: 600 } }], 0);
  const page = W.tabs.get('a').view.webContents;
  page.focus(); page.focusCalls = 0;
  return { W, win, sender, page, call, image,
    open: () => call('menu:popup', [{ id: 'ko', label: 'Korean' }], { x: 10, y: 10 }),
    close(chosen) { if (chosen) template[0].click(); const current = popups.pop(); current.callback(); },
    fail() { popupError = new Error('popup unavailable'); },
  };
}


const tick = () => new Promise(resolve => setImmediate(resolve));

test('menu_popup_passive_freeze_waits_until_selection_or_cancel', async t => {
  for (const chosen of [false, true]) await t.test(String(chosen), async () => {
    const h = startHost();
    const menu = h.open();
    let ready = false;
    const freeze = h.call('tabs:freeze', 'a', false).then(() => { ready = true; });
    await tick();
    assert.equal(h.W.tabs.get('a').view.getVisible(), true);
    assert.equal(ready, false);
    assert.equal(h.sender.focusCalls, 0);
    h.close(chosen);
    assert.equal(await menu, chosen ? 'ko' : null);
    await freeze;
    assert.equal(h.W.tabs.get('a').view.getVisible(), false);
    await h.call('tabs:thaw', 'a');
    assert.equal(h.page.isFocused(), true);
    assert.equal(h.W.nativeMenus.size, 0);
  });
});

test('menu_popup_during_capture_defers_hide_and_does_not_restore_menu_focus', async () => {
  const h = startHost();
  let finish;
  h.page.capturePage = () => new Promise(resolve => { finish = resolve; });
  const freeze = h.call('tabs:freeze', 'a', false);
  const menu = h.open();
  finish(h.image); await tick();
  assert.equal(h.W.tabs.get('a').view.getVisible(), true);
  h.close(); await menu; await freeze;
  await h.call('tabs:thaw', 'a');
  assert.equal(h.page.focusCalls, 0);
});

test('menu_popup_pending_thaw_cannot_release_a_new_freeze', async () => {
  const h = startHost();
  await h.call('tabs:freeze', 'a', false);
  const menu = h.open();
  const thaw = h.call('tabs:thaw', 'a');
  const next = h.call('tabs:freeze', 'a', false);
  await tick();
  assert.equal(h.W.tabs.get('a').frozen, true);
  assert.equal(h.page.focusCalls, 0);
  h.close(); await menu; await thaw; await next;
  assert.equal(h.W.tabs.get('a').frozen, true);
  await h.call('tabs:thaw', 'a');
  assert.equal(h.W.tabs.get('a').frozen, false);
});

test('menu_popup_tab_movement_cancels_waiting_freeze', async t => {
  for (const movement of ['switch', 'close', 'thaw']) await t.test(movement, async () => {
    const h = startHost();
    const menu = h.open();
    const freeze = h.call('tabs:freeze', 'a', false);
    if (movement === 'switch') h.call('tabs:show', 'b');
    if (movement === 'close') h.call('tabs:close', 'a');
    const thaw = movement === 'thaw' ? h.call('tabs:thaw', 'a') : null;
    h.close(); await menu; await freeze; await thaw;
    assert.ok(!h.W.tabs.get('a')?.frozen);
    assert.ok(!h.W.tabs.get('b').frozen);
    assert.equal(h.page.focusCalls, 0);
  });
});

test('menu_popup_failure_and_window_close_release_waiters', async () => {
  const failed = startHost(); failed.fail();
  await assert.rejects(failed.open(), /popup unavailable/);
  assert.equal(failed.W.nativeMenus.size, 0);
  await failed.call('tabs:freeze', 'a', false);
  await failed.call('tabs:thaw', 'a');
  const h = startHost();
  const menu = h.open();
  const freeze = h.call('tabs:freeze', 'a', false);
  h.win.isDestroyed = () => true; h.win.emit('closed');
  assert.equal(await menu, null); await freeze;
  assert.ok(!h.W.tabs.get('a').frozen);
  assert.equal(h.W.nativeMenus.size, 0);
  assert.equal(h.win.listenerCount('closed'), 0);
});

test('menu_popup_host_concurrent_toasts_wait_for_all_native_popups', async t => {
  const { createDesktopHost } = await import('../shell/hosts/desktop-host.js');
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  t.after(() => { globalThis.requestAnimationFrame = previousRaf; });
  const h = startHost();
  const previousObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { observe() {} };
  t.after(() => { globalThis.ResizeObserver = previousObserver; });
  const doc = { defaultView: { addEventListener() {} }, addEventListener() {}, createElement: () => ({ style: {}, remove() {} }) };
  const mounted = createDesktopHost({ doc, bridge: { on() {}, invoke: h.call }, entryUrl: x => x, radius: () => 0 });
  mounted.mount({ getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600 }), appendChild() {} });
  mounted.show('a');
  const menus = [h.open(), h.open()];
  let ready = 0;
  const toasts = Array.from({ length: 3 }, () => mounted.setOverlay(true, null, { owner: 'toast', focus: false }).then(() => ready++));
  await tick(); assert.equal(ready, 0);
  h.close(); await menus[1]; await tick(); assert.equal(ready, 0);
  h.close(); await menus[0]; await Promise.all(toasts);
  assert.equal(ready, 3);
  await mounted.setOverlay(true, null, { owner: 'preview', focus: false });
  await mounted.setOverlay(false, null, { owner: 'toast' });
  assert.equal(h.W.tabs.get('a').frozen, true);
  await mounted.setOverlay(false, null, { owner: 'preview' });
  assert.equal(h.W.tabs.get('a').frozen, false);
});

test('menu_popup_without_toast_keeps_view_and_focus_unchanged', async () => {
  const h = startHost();
  const menu = h.open();
  await tick();
  assert.equal(h.W.tabs.get('a').view.getVisible(), true);
  assert.equal(h.page.focusCalls, 0);
  assert.equal(h.sender.focusCalls, 0);
  h.close(); await menu;
});

test('menu_popup_wait_does_not_restore_background_or_changed_input', async t => {
  for (const mode of ['background', 'minimized', 'shell']) await t.test(mode, async () => {
    const h = startHost();
    const menu = h.open();
    const freeze = h.call('tabs:freeze', 'a', false);
    if (mode === 'background') { h.win.focused = false; h.win.emit('blur'); }
    if (mode === 'minimized') { h.win.minimized = true; h.win.emit('minimize'); }
    if (mode === 'shell') h.sender.focus();
    h.close(); await menu; await freeze;
    await h.call('tabs:thaw', 'a');
    assert.equal(h.page.focusCalls, 0);
    assert.equal(h.win.listenerCount('blur'), 0);
  });
});

test('menu_popup_real_toast_and_host_defer_three_timers_until_visible', async t => {
  const { createDesktopHost } = await import('../shell/hosts/desktop-host.js');
  const { attach } = await import('../components/toast.js');
  class Element {
    constructor() {
      this.children = []; this.listeners = {};
      this.style = { setProperty() {} };
      const classes = new Set();
      this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
    }
    set innerHTML(value) { this.firstElementChild = new Element(); }
    get childElementCount() { return this.children.length; }
    appendChild(el) { this.children.push(el); el.parent = this; }
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
    setAttribute() {}
    toggleAttribute() {}
    addEventListener(name, callback) { this.listeners[name] = callback; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 600 }; }
  }
  const doc = { body: new Element(), documentElement: {}, defaultView: { addEventListener() {} }, addEventListener() {}, createElement: () => new Element() };
  const stubs = {
    requestAnimationFrame: () => 1, ResizeObserver: class { observe() {} },
    getComputedStyle: () => ({ getPropertyValue: name => ({ '--toast-duration': '3000', '--dur-toast': '400', '--toast-stack-y': '8' })[name] }),
  };
  for (const [key, value] of Object.entries(stubs)) {
    const previous = globalThis[key]; globalThis[key] = value;
    t.after(() => { if (previous === undefined) delete globalThis[key]; else globalThis[key] = previous; });
  }
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = startHost();
  const host = createDesktopHost({ doc, bridge: { on() {}, invoke: h.call }, entryUrl: x => x, radius: () => 0 });
  host.mount(new Element()); host.show('a');
  const toast = attach(doc, { emit() {}, onOverlay: (...args) => host.setOverlay(...args) });
  const menu = h.open();
  const prepared = ['One', 'Two', 'Three'].map(title => toast.show({ title }));
  await tick(); t.mock.timers.tick(15000);
  assert.equal(doc.body.childElementCount, 0);
  assert.equal(h.W.tabs.get('a').view.getVisible(), true);
  h.close(true); assert.equal(await menu, 'ko'); await Promise.all(prepared);
  assert.equal(doc.body.children[0].childElementCount, 3);
  assert.equal(h.page.focusCalls, 0);
  t.mock.timers.tick(2999);
  assert.equal(doc.body.children[0].childElementCount, 3);
  t.mock.timers.tick(1); t.mock.timers.tick(400); await tick();
  assert.equal(doc.body.children[0].childElementCount, 0);
  assert.equal(h.W.tabs.get('a').view.getVisible(), true);
  assert.equal(h.page.focusCalls, 1);
});
