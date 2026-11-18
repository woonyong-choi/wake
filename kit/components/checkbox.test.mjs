import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve } from 'node:path';
import { test } from 'node:test';
import { render } from './checkbox.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { /* Browser checks require playwright-core. */ }
const controlLabel = 'Choose item';

test('checkbox_preserves_legacy_span_and_validates_interactive_state', () => {
  assert.equal(String(render()), '<span class="cbx" role="checkbox" data-c="checkbox" aria-checked="false"></span>');
  assert.match(String(render({ checked: true })), /<span class="cbx".*data-icon="check"/);
  assert.match(String(render({ interactive: true, label: controlLabel, indeterminate: true })), /<button type="button".*aria-checked="mixed".*data-icon="minus"/);
  assert.match(String(render({ interactive: true, label: '<unsafe>', disabled: true })), /aria-label="&lt;unsafe&gt;" disabled/);
  for (const p of [{}, { label: '' }, { label: controlLabel, checked: 'true' }, { label: controlLabel, disabled: 1 }]) assert.throws(() => render({ ...p, interactive: true }), TypeError);
});

test('checkbox_native_keys_toggle_once_preserve_morph_focus_and_never_submit', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><a href="#">0</a><form></form>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async label => {
      const checkbox = await import('/kit/components/checkbox.js'), { morph } = await import('/kit/core/morph.js');
      const style = document.createElement('style'); style.textContent = checkbox.css; document.head.append(style);
      window.state = { checked: false, indeterminate: true }; window.events = []; window.submits = 0;
      window.draw = () => morph(document.querySelector('form'), checkbox.render({ ...window.state, interactive: true, label, action: 'choose', arg: { key: '<opaque>' } }));
      document.querySelector('form').addEventListener('submit', e => { e.preventDefault(); window.submits++; });
      document.addEventListener('click', e => { const el = e.target.closest('[data-action]'); if (!el) return; window.events.push(JSON.parse(el.dataset.arg)); window.state = { checked: el.getAttribute('aria-checked') !== 'true', indeterminate: false }; window.draw(); });
      window.draw();
    }, controlLabel);
    const control = page.getByRole('checkbox', { name: controlLabel });
    await page.locator('a').focus(); await page.keyboard.press('Tab');
    assert.equal(await control.evaluate(el => el === document.activeElement), true);
    assert.ok(await control.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth) > 0));
    const original = await control.elementHandle();
    await page.keyboard.press('Enter'); assert.equal(await control.getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Space'); assert.equal(await control.getAttribute('aria-checked'), 'false');
    assert.equal(await original.evaluate(el => el === document.activeElement && el.isConnected), true);
    assert.deepEqual(await page.evaluate(() => window.events), [{ key: '<opaque>' }, { key: '<opaque>' }]);
    await page.evaluate(() => { window.state.disabled = true; window.draw(); });
    await control.evaluate(el => el.click()); assert.equal(await page.evaluate(() => window.events.length), 2);
    assert.equal(await page.evaluate(() => window.submits), 0); assert.equal(await control.isDisabled(), true);
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
});

/* C-16: a boxed menu row (role menuitemcheckbox) held a second role="checkbox" inside, so a screen reader read the one choice twice.
   The box inside a menu row is drawing only */
test('boxed_menu_row_has_one_checkbox_role', async () => {
  const menuItem = await import('./menu-item.js');
  for (const item of [{ id: 'a', label: 'payments', checkbox: true, box: true, checked: true }, { type: 'bulk', label: 'test.all', state: 'mixed' }]) {
    const s = menuItem.render(item, 0).s;
    assert.equal((s.match(/role="(menuitemcheckbox|checkbox)"/g) || []).length, 1, `one checkbox role in ${s}`);
    assert.match(s, /<span class="cbx"[^>]*aria-hidden="true"/, 'the drawn box is hidden from assistive tech');
  }
});
