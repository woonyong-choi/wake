import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDesktopHost } from './desktop-host.js';

function createHost() {
  const calls = [], captures = [], images = [], listeners = new Map();
  const bounds = { left: 0, top: 0, right: 800, bottom: 600 };
  const slot = { getBoundingClientRect: () => bounds, appendChild: image => images.push(image) };
  const doc = {
    defaultView: { addEventListener() {} }, addEventListener: (name, listener) => listeners.set(name, listener),
    createElement: () => ({ style: {}, remove() { const index = images.indexOf(this); if (index >= 0) images.splice(index, 1); } }),
  };
  const bridge = {
    on() {},
    invoke(channel, ...args) {
      calls.push([channel, ...args]);
      if (channel === 'tabs:freeze') return new Promise(resolve => captures.push(resolve));
    },
  };
  const host = createDesktopHost({ doc, bridge, entryUrl: x => x, radius: () => 0 });
  host.mount(slot); host.show('a'); calls.length = 0;
  return { host, calls, captures, images, listeners, slot, bounds };
}

function installLayoutStubs(t) {
  const frames = [];
  for (const [key, value] of Object.entries({
    requestAnimationFrame: callback => frames.push(callback),
    ResizeObserver: class { observe() {} unobserve() {} },
  })) {
    const previous = globalThis[key];
    globalThis[key] = value;
    t.after(() => { if (previous === undefined) delete globalThis[key]; else globalThis[key] = previous; });
  }
  return () => frames.splice(0).forEach(callback => callback());
}

test('setOverlay_multiple_owners_release_only_after_last_owner', async t => {
  installLayoutStubs(t);
  const h = createHost();
  const pending = h.host.setOverlay(true, null, { focus: false, owner: 'toast' });
  h.captures[0]('picture'); await pending;

  await h.host.setOverlay(true, null, { owner: 'dialog' });
  await h.host.setOverlay(false, null, { owner: 'toast' });
  assert.equal(h.images.length, 1);
  assert.equal(h.calls.filter(([name]) => name === 'tabs:thaw').length, 0);
  await h.host.setOverlay(false, null, { owner: 'dialog' });

  assert.equal(h.images.length, 0);
  assert.deepEqual(h.calls, [['tabs:freeze', 'a', false], ['shell:focus'], ['tabs:thaw', 'a']]);
});

test('setOverlay_late_capture_cannot_release_a_new_toast_cycle', async t => {
  installLayoutStubs(t);
  const h = createHost();
  const first = h.host.setOverlay(true, null, { focus: false, owner: 'toast' });
  await h.host.setOverlay(false, null, { owner: 'toast' });
  const second = h.host.setOverlay(true, null, { focus: false, owner: 'toast' });

  h.captures[1]('new picture'); await second;
  h.captures[0]('old picture'); await first;

  assert.deepEqual(h.images.map(image => image.src), ['new picture']);
  assert.equal(h.calls.filter(([name]) => name === 'tabs:thaw').length, 1);
  await h.host.setOverlay(false, null, { owner: 'toast' });
  assert.equal(h.images.length, 0);
});

test('setOverlay_tab_switch_or_close_releases_pending_capture', async t => {
  installLayoutStubs(t);
  for (const action of ['show', 'destroy']) {
    const h = createHost();
    const pending = h.host.setOverlay(true, null, { focus: false, owner: 'toast' });

    h.host[action](action === 'show' ? 'b' : 'a');
    h.captures[0]('old picture'); await pending;

    assert.equal(h.images.length, 0);
    assert.equal(h.calls.filter(([name]) => name === 'tabs:thaw').length, 1);
  }
});

function detailPanes(h, width = 300) {
  const rectOf = (left, w) => ({ getBoundingClientRect: () => ({ left, right: left + w, top: 40, bottom: 600, width: w, height: 560 }) });
  const list = rectOf(0, 800), overlay = rectOf(0, width);
  h.host.setPanes([{ id: 'a', el: h.slot }, { id: 'd', el: overlay }]);
  return { list, overlay };
}

test('detail overlay: the overlay view becomes the open page and both views are placed, never the list alone', t => {
  const paint = installLayoutStubs(t);
  const h = createHost();
  h.host.setCards(['a', 'd'], 'd');
  assert.deepEqual(h.calls, [['tabs:show', 'd', { under: ['a'] }]]); // the trusted marker names the list under; no list show: it would draw above the overlay
  h.calls.length = 0;
  detailPanes(h);
  paint();
  assert.deepEqual(h.calls, [['tabs:layout', [{ id: 'a', rect: { x: 0, y: 0, width: 800, height: 600 } }, { id: 'd', rect: { x: 0, y: 40, width: 300, height: 560 } }], 0]]);
});

test('a view never covers its card outline: fractional card edges round inward', t => {
  const paint = installLayoutStubs(t);
  const h = createHost();
  const card = { getBoundingClientRect: () => ({ left: 100.4, right: 400.6, top: 40.3, bottom: 599.7, width: 300.2, height: 559.4 }) };
  h.host.setPanes([{ id: 'a', el: card }]);
  h.calls.length = 0;
  h.host.relayout();
  paint();
  const [, panes] = h.calls.find(([name]) => name === 'tabs:layout');
  assert.deepEqual(panes, [{ id: 'a', rect: { x: 101, y: 41, width: 299, height: 558 } }]);
});

test('detail overlay: a shell overlay freezes the overlay and the list under it, and thaws both', async t => {
  installLayoutStubs(t);
  const h = createHost();
  h.host.setCards(['a', 'd'], 'd'); const { overlay } = detailPanes(h); h.calls.length = 0;
  const pending = h.host.setOverlay(true, null, { owner: 'menu' });
  assert.deepEqual(h.calls, [['tabs:freeze', 'd', true], ['tabs:freeze', 'a', true]]);
  h.captures[0]('overlay picture'); h.captures[1]('list picture'); await pending;
  assert.deepEqual(h.images.map(image => image.src), ['overlay picture', 'list picture']);
  assert.match(h.images[0].style.cssText, new RegExp(`width:${overlay.getBoundingClientRect().width}px`), 'the overlay picture has the overlay card\'s width');
  await h.host.setOverlay(false, null, { owner: 'menu' });
  assert.deepEqual(h.calls.filter(([name]) => name === 'tabs:thaw'), [['tabs:thaw', 'd'], ['tabs:thaw', 'a']]);
  assert.equal(h.images.length, 0);
});

test('detail overlay: closing shows the list again and gives it the keyboard', t => {
  installLayoutStubs(t);
  const h = createHost();
  h.host.setCards(['a', 'd'], 'd'); h.calls.length = 0;
  h.host.destroy('d'); h.host.setCards(['a'], 'a', { refocus: true });
  assert.deepEqual(h.calls, [['tabs:close', 'd'], ['tabs:show', 'a'], ['tabs:focus', 'a']]);
});

test('scrolling the frame moves the native viewport without following sibling scrolls', t => {
  const paint = installLayoutStubs(t);
  const { calls, listeners, slot, bounds } = createHost();
  paint();
  calls.length = 0;

  const scroll = listeners.get('scroll');
  Object.assign(bounds, { left: 243.6, right: 1044.1, top: 40.7, bottom: 840.3 });
  scroll({ target: { contains: () => false } });
  paint();
  assert.deepEqual(calls, []);

  scroll({ target: { contains: element => element === slot } });
  paint();
  assert.deepEqual(calls, [['tabs:layout', [{ id: 'a', rect: { x: 244, y: 41, width: 800, height: 799 } }], 0]]);
});

test('context menus pop up through the desktop bridge', async t => {
  installLayoutStubs(t);
  const { host, calls } = createHost();
  assert.equal(typeof host.contextMenu, 'function');
  await host.contextMenu([{ id: 'copy', label: 'tab.close' }], { x: 4, y: 8 });
  assert.deepEqual(calls.find(([channel]) => channel === 'menu:popup')?.[2], { x: 4, y: 8 });
});

// A spinner or a button transition inside a row once sent the view's unchanged place every frame for 400ms
test('relayout_sends_a_changed_place_once_and_follows_only_boxes_that_can_move_the_slot', t => {
  const flush = installLayoutStubs(t);
  const h = createHost();
  flush(); h.calls.length = 0;
  h.listeners.get('animationstart')({ target: { parentElement: { contains: () => false } } }); // a spinner in a sidebar row
  flush();
  assert.deepEqual(h.calls, []);
  h.host.show('a'); flush();
  assert.deepEqual(h.calls.filter(([name]) => name === 'tabs:layout'), []);   // the same place is not sent again
  h.bounds.right = 600;
  h.listeners.get('transitionrun')({ target: { parentElement: { contains: el => el === h.slot } } }); // a pane beside the slot
  flush();
  assert.deepEqual(h.calls.filter(([name]) => name === 'tabs:layout'), [['tabs:layout', [{ id: 'a', rect: { x: 0, y: 0, width: 600, height: 600 } }], 0]]);
});
