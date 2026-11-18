import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { test } from 'node:test';

import { envelope } from '../core/bridge-protocol.js';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright-core')); } catch { /* Browser checks require playwright-core. */ }

// Boot contracts exercise the real bridge and lifecycle without browser-only UI behavior.
const uiModules = new Map([
  [new URL('../components/index.js', import.meta.url).href, 'export function addAllStyles() {} export function attachAll() {} export const components = {};'],
  [new URL('../core/style.js', import.meta.url).href, 'export function addStyles() {}'],
  [new URL('../core/morph.js', import.meta.url).href, 'export function morph(root, html) { root.innerHTML = String(html); } export function trackComposition() {}'],
]);
const uiHooks = registerHooks({
  load(url, context, nextLoad) {
    if (uiModules.has(url)) return { format: 'module', source: uiModules.get(url), shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { bootPage, detailOp } = await import('./boot.js');
uiHooks.deregister();

test('bootPage_hosted_init_prepares_identity_before_settings_and_first_render', async () => {
  const harness = await createHarness();
  assert.deepEqual(harness.events, [['create', null], ['init', null]]);
  assert.equal(harness.ctx.pageIdentity(), null);
  assert.equal(harness.sent.at(-1).type, 'page:ready');

  harness.receive('shell:init', identityPayload({ settings: { selected: 'first' }, handoff: { item: 'one' } }));

  assert.deepEqual(harness.events.slice(2).map(([name]) => name), ['settings', 'handoff', 'render']);
  for (const [, identity] of harness.events.slice(2)) {
    assert.deepEqual(identity, { appId: 'sample', tabId: 'tab-one', address: 'sample://item/one' });
  }
  assert.equal(harness.root.innerHTML, 'tab-one');
  assert.deepEqual(harness.ctx.settings(), { selected: 'first' });
  assert.equal(harness.doc.documentElement.dataset.theme, 'dark');
});

test('bootPage_desktop_draws_from_the_boot_values_before_the_shell_init_and_says_it_drew', async () => {
  const harness = await createHarness({ extra: { onHandoff: undefined }, desktop: { appId: 'sample', tabId: 'tab-one', theme: 'light', locale: 'en', settings: { selected: 'stored' } } });
  assert.deepEqual(harness.events.map(([name]) => name), ['create', 'init', 'settings', 'render']);
  assert.equal(harness.root.innerHTML, 'tab-one');
  assert.equal(harness.doc.documentElement.dataset.theme, 'light');
  assert.equal(harness.ctx.settings().selected, 'stored');
  assert.equal(harness.ctx.settings()['kit.timeZone'], 'system');            // kit defaults under the stored values, as the shell's settings have them
  assert.deepEqual(harness.sent.at(-1).payload, { drawn: true });

  harness.receive('shell:init', identityPayload({ settings: { selected: 'shell' } }));   // the shell's init still follows and is the authority
  assert.equal(harness.ctx.settings().selected, 'shell');
  assert.equal(harness.events.at(-1)[0], 'render');
});

test('bootPage_desktop_page_taking_a_handoff_waits_for_the_shell_init', async () => {
  const harness = await createHarness({ desktop: { appId: 'sample', tabId: 'tab-one', theme: 'light', locale: 'en', settings: {} } });
  assert.deepEqual(harness.events.map(([name]) => name), ['create', 'init']);
  assert.deepEqual(harness.sent.at(-1).payload, { drawn: false });
});

/* charts redraw every plate when data-time-zone or data-theme changes (chart-card.js observes both): a settings message that leaves the
   zone and the theme as they are must not write them again (writing the same value is still a mutation; on a home with charts a
   section click that made the shell send its settings spent 140ms redrawing the old page before the next one could load) */
test('bootPage_settings_and_theme_messages_that_change_nothing_leave_the_zone_and_theme_attributes_untouched', async () => {
  const harness = await createHarness();
  harness.receive('shell:init', identityPayload({ settings: { 'kit.timeZone': 'UTC' } }));
  const writes = [];
  const data = { ...harness.doc.documentElement.dataset };
  harness.doc.documentElement.dataset = new Proxy(data, { set(o, k, v) { writes.push(k); o[k] = v; return true; } });
  harness.receive('shell:settings', { values: { 'kit.timeZone': 'UTC', selected: 'other' } });
  harness.receive('shell:theme', { theme: data.theme });
  assert.deepEqual(writes, [], 'no attribute written when nothing changed');
  harness.receive('shell:settings', { values: { 'kit.timeZone': 'Asia/Seoul' } });
  assert.deepEqual(writes, ['timeZone']);
  assert.equal(data.timeZone, 'Asia/Seoul');
});

test('bootPage_standalone_lifecycle_and_updates_keep_identity_null', async () => {
  const harness = await createHarness({ standalone: true });

  harness.ctx.update();

  assert.deepEqual(harness.events.map(([name]) => name), ['create', 'init', 'render', 'render']);
  assert.ok(harness.events.every(([, identity]) => identity === null));
  assert.equal(harness.ctx.pageIdentity(), null);
  assert.equal(harness.doc.documentElement.dataset.theme, 'dark');
});

test('bootPage_invalid_identity_preserves_init_and_later_valid_identity_is_accepted', async () => {
  const invalid = [
    { appId: 'other' }, { appId: undefined }, { appId: 1 },
    { tabId: undefined }, { tabId: null }, { tabId: '' }, { tabId: ' \t' }, { tabId: 1 }, { tabId: {} },
    { address: undefined }, { address: null }, { address: '' }, { address: '\n' }, { address: false }, { address: [] },
  ];
  for (const fields of invalid) {
    const harness = await createHarness();
    harness.receive('shell:init', identityPayload({ ...fields, theme: 'light', settings: { selected: 'retained' } }));

    assert.equal(harness.ctx.pageIdentity(), null, JSON.stringify(fields));
    assert.deepEqual(harness.events.slice(2), [['settings', null], ['render', null]]);
    assert.deepEqual(harness.ctx.settings(), { selected: 'retained' });
    assert.equal(harness.doc.documentElement.dataset.theme, 'light');

    harness.receive('shell:init', identityPayload());
    assert.equal(harness.ctx.pageIdentity().tabId, 'tab-one');
  }
});

test('bootPage_first_valid_identity_is_frozen_and_survives_conflicts_and_updates', async () => {
  const harness = await createHarness();
  const payload = identityPayload({ tabId: ' tab-one ', address: ' sample://item/one ' });
  harness.receive('shell:init', payload);
  const identity = harness.ctx.pageIdentity();

  assert.ok(Object.isFrozen(identity));
  for (const key of ['appId', 'tabId', 'address']) {
    assert.throws(() => { identity[key] = 'changed'; }, TypeError);
    payload[key] = 'changed';
  }
  harness.receive('shell:init', identityPayload({ tabId: 'tab-two', address: 'sample://item/two', settings: { selected: 'second' } }));
  harness.receive('shell:settings', { values: { selected: 'third', pageIdentity: { tabId: 'spoof' } } });
  harness.receive('shell:locale', { locale: 'en', tabId: 'spoof' });
  harness.receive('shell:theme', { theme: 'light', address: 'spoof' });
  harness.ctx.update();

  assert.equal(harness.ctx.pageIdentity(), identity);
  assert.deepEqual(identity, { appId: 'sample', tabId: ' tab-one ', address: ' sample://item/one ' });
  assert.equal(harness.ctx.settings().selected, 'third');
  assert.equal(harness.doc.documentElement.dataset.theme, 'light');
  assert.ok(harness.events.slice(2).every(([, value]) => value === identity));
});

test('bootPage_browser_bridge_ignores_identity_from_non_parent_or_other_origin', async () => {
  const harness = await createHarness();
  const message = envelope('shell:init', identityPayload());

  harness.deliver({ source: {}, origin: harness.win.location.origin, data: message });
  harness.deliver({ source: harness.win.parent, origin: 'https://other.invalid', data: message });

  assert.equal(harness.ctx.pageIdentity(), null);
  assert.deepEqual(harness.events.map(([name]) => name), ['create', 'init']);
});

test('bootPage_screen_declaration_keeps_state_wires_actions_and_redraws', async () => {
  const own = () => 'own';
  const harness = await createHarness({ standalone: true, extra: { screen: { state: { kind: 'all', page: 2 }, ai: ['kind'], set: { 'x.kind': ['kind', 'pick', { page: 1 }], 'x.own': ['page', 'page'] } }, actions: { 'x.own': own } } });
  const { ctx } = harness, renders = () => harness.events.filter(([name]) => name === 'render').length;
  assert.deepEqual(ctx.state(), { kind: 'all', page: 2 });
  assert.deepEqual(ctx.screen().ai, ['kind']);
  const before = renders();
  harness.page.actions['x.kind']({ arg: 'warn' });
  assert.deepEqual(ctx.state(), { kind: 'warn', page: 1 });
  assert.equal(renders(), before + 1);
  assert.equal(harness.page.actions['x.own'], own); // the page's own handler wins over a declared one
  assert.equal(typeof harness.page.actions['kit.screen.ai-reset'], 'function');
  ctx.setState({ kind: 'error' }, { ai: true });
  assert.deepEqual(ctx.aiApplied(), [{ key: 'kind', value: 'error', before: 'warn' }]);
  assert.equal(ctx.resetAi('kind'), true);
  assert.equal(ctx.state().kind, 'warn');
});

test('bootPage_without_screen_answers_empty_screen_calls', async () => {
  const { ctx } = await createHarness({ standalone: true });
  assert.deepEqual(ctx.state(), {});
  assert.deepEqual(ctx.setState({ a: 1 }), []);
  assert.equal(ctx.resetAi(), false);
  assert.deepEqual(ctx.aiApplied(), []);
  assert.equal(ctx.screen(), null);
});

test('detail_bar_buttons_map_to_shell_detail_ops_and_the_size_button_toggles', () => {
  assert.equal(detailOp('kit.detail.back', false), 'back');
  assert.equal(detailOp('kit.detail.close', true), 'close');
  assert.equal(detailOp('kit.detail.toggle', false), 'expand', 'beside its list: the size button expands');
  assert.equal(detailOp('kit.detail.toggle', true), 'collapse', 'expanded: the size button puts it back beside its list');
  assert.equal(detailOp('kit.detail.other', false), null, 'a name no detail bar button carries sends nothing');
});

function identityPayload(fields = {}) {
  return { protocol: 1, appId: 'sample', tabId: 'tab-one', address: 'sample://item/one', theme: 'dark', locale: 'en', ...fields };
}

async function createHarness({ standalone = false, extra = {}, desktop = null, initialize } = {}) {
  const events = [], sent = [];
  let deliver, ctx;
  const win = {
    location: { origin: 'https://sample.invalid', search: '?a=sample://item/one', href: 'https://sample.invalid/page.html' },
    localStorage: { getItem: () => null },
    addEventListener(name, handler) { if (name === 'message') deliver = handler; },
  };
  win.parent = standalone ? win : { postMessage: message => sent.push(message) };
  // the desktop preload: kitBridge carries the messages and answers the first drawing's values at once (boot)
  if (desktop) win.kitBridge = { send: message => sent.push(message), on: handler => { deliver = event => handler(event.data); }, boot: () => desktop };
  const doc = { defaultView: win, documentElement: { classList: { add() {} }, dataset: {} }, addEventListener() {} };
  const root = { ownerDocument: doc, dataset: {}, innerHTML: '' };
  const config = {
    schema: 1, id: 'sample', name: 'Sample', scheme: 'sample', defaultLocale: 'en', locales: { en: {} },
    features: { panel: false, settings: false }, sidebar: { sections: [] },
    routes: [{ id: 'item', pattern: 'item/:id', page: 'item.html', title: () => 'Item', icon: () => '', crumbs: () => [] }],
  };

  const result = await bootPage(config, context => {
    ctx = context;
    events.push(['create', ctx.pageIdentity()]);
    return {
      init() { events.push(['init', ctx.pageIdentity()]); return initialize?.(ctx); },
      onSettings() { events.push(['settings', ctx.pageIdentity()]); },
      onHandoff() { events.push(['handoff', ctx.pageIdentity()]); },
      render() { events.push(['render', ctx.pageIdentity()]); return ctx.pageIdentity()?.tabId || 'standalone'; },
      ...extra,
    };
  }, { root });
  assert.equal(result.ctx, ctx);
  return { ctx, page: result.page, events, sent, root, doc, win,
    deliver: event => deliver(event),
    receive: (type, payload) => deliver({ source: win.parent, origin: win.location.origin, data: envelope(type, payload) }),
  };
}

test('bootPage_actual_browser_normalizes_only_explicit_page_menu_text', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const { createServer } = await import('node:http');
  const { readFileSync } = await import('node:fs');
  const { resolve, extname } = await import('node:path');
  const repo = resolve(import.meta.dirname, '../..');
  const fixture = `<!doctype html><html><link rel="stylesheet" href="/kit/fonts/fonts.css"><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><body><main id="page"></main><script type="module">
    import { bootPage, components as C, html } from '/kit/page/index.js';
    const config = { schema: 1, id: 'sample', name: 'Sample', scheme: 'sample', defaultLocale: 'en', locales: { en: {} }, features: { panel: false, settings: false }, sidebar: { sections: [] }, routes: [{ id: 'item', pattern: 'item/:id', page: 'item.html', title: () => 'Item', icon: () => '', crumbs: () => [] }], menus: { 'test.config': () => ({ items: [{ id: 'config', label: 'shell.search' }] }) } };
    window.calls = [];
    await bootPage(config, ctx => ({
      render: () => html\`\${C.button.render({ label: ctx.t('shell.search'), menu: 'test.raw' })}\${C.button.render({ label: ctx.t('dialog.cancel'), menu: 'test.nested' })}\${C.button.render({ label: ctx.t('dialog.close'), menu: 'test.config' })}\`,
      menus: {
        'test.raw': () => C.select.menuDef({ options: Array.from({ length: 26 }, (_, i) => ({ id: String(i), label: { raw: 'resource-' + i } })), value: '0', action: 'test.pick', key: 'resource' }),
        'test.nested': () => ({ items: [{ id: 'translated', label: ctx.t('shell.search'), end: html\`<strong>0</strong>\`, actions: [{ id: 'inspect', icon: 'search', tip: { raw: '0' }, action: 'test.inspect', arg: { identity: 'one' } }] }, { id: 'parent', label: { raw: '1' }, subButton: { raw: '2' }, submenu: () => ({ items: [{ id: 'child', label: { key: 'dialog.cancel' }, action: 'test.child', arg: { identity: 'one' } }] }) }] }),
      },
      actions: { 'test.pick': payload => window.calls.push(payload), 'test.child': payload => window.calls.push(payload), 'test.inspect': payload => window.calls.push(payload) },
    }));
    window.ready = true;
  </script>`;
  const failures = [], warnings = [], errors = [], external = [];
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end(fixture); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  let browser;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage({ viewport: { width: 860, height: 1000 }, reducedMotion: 'reduce' });
    const origin = `http://127.0.0.1:${server.address().port}`;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
    await page.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); external.push(route.request().url()); return route.abort(); });
    await page.goto(origin + '/?a=sample://item/one');
    await page.waitForFunction(() => window.ready);
    await page.locator('[data-menu="test.raw"]').click();
    const rows = page.locator('.menu [role="menuitemradio"]');
    assert.deepEqual((await rows.allTextContents()).map(label => label.trim()), Array.from({ length: 26 }, (_, i) => 'resource-' + i));
    // a list longer than the select shows opens with its search field focused (select.js): the raw label is what the query finds and Enter picks
    assert.equal(await page.evaluate(() => document.activeElement.matches('[data-menu-search]')), true);
    await page.keyboard.type('resource-25');
    assert.deepEqual((await rows.filter({ visible: true }).allTextContents()).map(label => label.trim()), ['resource-25']);
    await page.keyboard.press('Enter');
    await page.locator('.menu').waitFor({ state: 'detached' });
    assert.deepEqual(await page.evaluate(() => window.calls[0].arg), { key: 'resource', value: '25' });
    await page.locator('[data-menu="test.nested"]').click();
    assert.equal(await page.locator('[data-item="translated"] .mi-text > span').first().textContent(), 'Search');
    assert.equal(await page.locator('[data-item="translated"] .mi-end strong').textContent(), '0');
    assert.equal(await page.locator('[data-item="translated"] [data-act="inspect"]').getAttribute('aria-label'), '0');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.locator('[data-item="child"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-item="child"] .mi-text > span').first().textContent(), 'Cancel');
    await page.keyboard.press('Enter');
    await page.locator('.menu').waitFor({ state: 'detached' });
    assert.deepEqual(await page.evaluate(() => window.calls[1].arg), { identity: 'one' });
    await page.locator('[data-menu="test.config"]').click();
    assert.equal(await page.locator('[data-item="config"] .mi-text > span').first().textContent(), 'Search');
    await page.keyboard.press('Escape');
    await page.locator('.menu').waitFor({ state: 'detached' });
    assert.deepEqual(warnings, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    assert.deepEqual(external, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('bootPage_coalesces_same_task_updates_before_paint_without_losing_the_latest_state', async () => {
  const harness = await createHarness({ standalone: true });
  const frames = [];
  harness.win.queueMicrotask = callback => { frames.push(callback); };
  const before = harness.events.filter(([name]) => name === 'render').length;
  for (let i = 0; i < 12; i++) harness.ctx.update();
  assert.equal(harness.events.filter(([name]) => name === 'render').length, before);
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(harness.events.filter(([name]) => name === 'render').length, before + 1);
  let latest = 'old';
  harness.page.render = () => latest;
  harness.ctx.update();
  latest = 'new';
  harness.ctx.update();
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(harness.root.innerHTML, 'new');
});

test('bootPage_after_the_first_drawing_updates_from_several_tasks_in_one_frame_draw_once', async () => {
  const harness = await createHarness({ standalone: true });
  const frames = [], microtasks = [];
  harness.win.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  harness.win.queueMicrotask = callback => { microtasks.push(callback); };
  const before = harness.events.filter(([name]) => name === 'render').length;
  for (let task = 0; task < 9; task++) { harness.ctx.update(); while (microtasks.length) microtasks.shift()(); }
  assert.equal(harness.events.filter(([name]) => name === 'render').length, before, 'answers arriving in nine tasks wait for the frame');
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(harness.events.filter(([name]) => name === 'render').length, before + 1);
});

test('bootPage_updates_during_init_wait_for_the_first_render_and_afterRender', async () => {
  let release, context;
  const calls = [];
  const ready = createHarness({ standalone: true, initialize: ctx => {
    context = ctx; return new Promise(resolve => { release = resolve; });
  }, extra: { render: () => { calls.push('render'); return 'ready'; }, afterRender: () => calls.push('afterRender') } });
  while (!context) await new Promise(resolve => setImmediate(resolve));
  context.update();
  assert.deepEqual(calls, [], 'updates during init must not close the first-drawing decision');
  release(); await ready;
  assert.deepEqual(calls, ['render', 'afterRender']);
});
