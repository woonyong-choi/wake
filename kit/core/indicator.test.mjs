import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { /* Browser checks require playwright-core. */ }
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const FIXTURE = `<!doctype html><html data-theme="dark">
<link rel="stylesheet" href="/kit/fonts/fonts.css"><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css">
<body><main><div id="pill" style="width:calc(var(--space-40) * 2)"></div><div id="underline" style="width:calc(var(--space-40) * 2)"></div></main>
<div id="unrelated" aria-selected="false"></div><button class="pill" id="outside" aria-selected="false">0</button>
<script type="module">
import { components as C, addAllStyles } from '/kit/components/index.js';
import { morph } from '/kit/core/morph.js';
import { t } from '/kit/core/i18n.js';
addAllStyles(document);
const tabs = [{ id: 'a', label: t('tab.new') }, { id: 'b', label: t('dialog.cancel') }, { id: 'c', label: t('dialog.close') }];
const kinds = ['pill', 'underline'];
const component = kind => C[kind === 'pill' ? 'pillTabs' : 'underlineTabs'];
window.change = (kind, value) => morph(document.getElementById(kind), component(kind).render({ id: kind, tabs, value, action: 'test.select', spaced: kind === 'pill' }));
for (const kind of kinds) window.change(kind, 'a');
C.pillTabs.attach(document); C.underlineTabs.attach(document);
const original = Object.fromEntries(kinds.map(kind => {
  const wrap = document.getElementById(kind).querySelector('[role="tablist"]');
  return [kind, { wrap, tabs: [...wrap.querySelectorAll('[role="tab"]')], indicator: wrap.querySelector(kind === 'pill' ? '.pill-ind' : '.utab-ind') }];
}));
window.read = () => kinds.map(kind => {
  const wrap = document.getElementById(kind).querySelector('[role="tablist"]');
  const selected = wrap.querySelector('[aria-selected="true"]');
  const indicator = wrap.querySelector(kind === 'pill' ? '.pill-ind' : '.utab-ind');
  const css = getComputedStyle(indicator);
  return { kind, selected: JSON.parse(selected.dataset.arg), left: parseFloat(css.left), width: parseFloat(css.width), expectedLeft: selected.offsetLeft, expectedWidth: selected.offsetWidth,
    sameWrap: original[kind].wrap === wrap, sameIndicator: original[kind].indicator === indicator,
    sameTabs: original[kind].tabs.every((tab, i) => tab === wrap.querySelectorAll('[role="tab"]')[i]), transition: css.transitionProperty };
});
window.settle = async () => {
  await document.fonts.ready;
  await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  let previous = '', stable = 0;
  for (let frame = 0; frame < 40; frame++) {
    await new Promise(requestAnimationFrame);
    const next = JSON.stringify(window.read());
    stable = next === previous ? stable + 1 : 0;
    if (stable === 3) return window.read();
    previous = next;
  }
  throw new Error('indicator geometry did not stabilize');
};
window.startTracking = () => {
  window.scans = { pill: 0, underline: 0 }; window.styleChanges = 0; window.selectionMutations = [];
  const query = document.querySelectorAll.bind(document);
  document.querySelectorAll = selector => { if (selector === '.pills') window.scans.pill++; if (selector === '.utabs') window.scans.underline++; return query(selector); };
  for (const kind of kinds) {
    new MutationObserver(records => { window.styleChanges += records.length; }).observe(original[kind].indicator, { attributes: true, attributeFilter: ['style'] });
    new MutationObserver(records => window.selectionMutations.push(...records.map(record => ({ kind, type: record.type, attribute: record.attributeName })))).observe(original[kind].wrap, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
  }
};
window.addGroup = () => {
  const host = document.createElement('div'); host.id = 'added-group';
  morph(host, C.pillTabs.render({ id: 'added-group', tabs, value: 'c', action: 'test.select' }));
  document.querySelector('main').append(host);
};
window.ready = true;
</script>`;

test('attachTabs_tracks_controlled_selection_without_unrelated_scans_or_style_loops', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end(FIXTURE); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', MIME[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  let browser;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    for (const width of [860, 1440]) for (const reducedMotion of ['no-preference', 'reduce']) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => window.ready);
      const settled = async selected => {
        const states = await page.evaluate(() => window.settle());
        for (const state of states) {
          assert.equal(state.selected, selected);
          assert.ok(Math.abs(state.left - state.expectedLeft) < .5, JSON.stringify(state));
          assert.ok(Math.abs(state.width - state.expectedWidth) < .5, JSON.stringify(state));
          assert.ok(state.sameWrap && state.sameIndicator && state.sameTabs);
          assert.match(state.transition, /left/);
        }
      };
      await settled('a');
      await page.locator('#pill [role="tab"]').first().focus();
      await page.evaluate(() => window.startTracking());
      for (const value of ['b', 'c', 'a', 'b']) {
        await page.evaluate(value => { window.change('pill', value); window.change('underline', value); }, value);
        await settled(value);
      }
      assert.equal(await page.locator('#pill [role="tab"]').first().evaluate(tab => tab === document.activeElement), true);
      const mutations = await page.evaluate(() => window.selectionMutations);
      assert.equal(mutations.length, 16);
      assert.ok(mutations.every(record => record.type === 'attributes' && record.attribute === 'aria-selected'));
      const beforeUnrelated = await page.evaluate(() => ({ scans: { ...window.scans }, styleChanges: window.styleChanges }));
      await page.evaluate(() => {
        document.getElementById('unrelated').setAttribute('aria-selected', 'true');
        document.getElementById('outside').setAttribute('aria-selected', 'true');
        for (const kind of ['pill', 'underline']) document.querySelector('#' + kind + ' [role="tab"]').setAttribute('data-unrelated', 'changed');
      });
      await settled('b');
      assert.deepEqual(await page.evaluate(() => ({ scans: { ...window.scans }, styleChanges: window.styleChanges })), beforeUnrelated);
      for (const kind of ['pill', 'underline']) await page.locator('#' + kind + ' [role="tab"]').nth(2).click();
      await settled('c');
      await page.evaluate(() => { window.change('pill', 'b'); window.change('underline', 'b'); });
      await settled('b');
      await page.evaluate(() => { for (const kind of ['pill', 'underline']) document.getElementById(kind).style.width = 'var(--space-40)'; });
      await settled('b');
      await page.evaluate(() => { window.change('pill', 'a'); window.change('underline', 'a'); });
      await settled('a');
      await page.evaluate(() => { for (const kind of ['pill', 'underline']) document.getElementById(kind).style.display = 'none'; });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await page.evaluate(() => { for (const kind of ['pill', 'underline']) { window.change(kind, 'b'); document.getElementById(kind).style.display = ''; } });
      await settled('b');
      const idle = await page.evaluate(() => ({ scans: { ...window.scans }, styleChanges: window.styleChanges }));
      await settled('b');
      assert.deepEqual(await page.evaluate(() => ({ scans: { ...window.scans }, styleChanges: window.styleChanges })), idle);
      await page.evaluate(() => window.addGroup());
      await settled('b');
      const added = await page.locator('[data-tabs="added-group"]').evaluate(host => {
        const selected = host.querySelector('[aria-selected="true"]'), indicator = host.querySelector('.pill-ind');
        return { selected: JSON.parse(selected.dataset.arg), left: parseFloat(getComputedStyle(indicator).left), width: parseFloat(getComputedStyle(indicator).width), expectedLeft: selected.offsetLeft, expectedWidth: selected.offsetWidth };
      });
      assert.equal(added.selected, 'c');
      assert.ok(Math.abs(added.left - added.expectedLeft) < .5 && Math.abs(added.width - added.expectedWidth) < .5);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
