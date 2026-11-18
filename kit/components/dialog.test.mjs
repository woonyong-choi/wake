import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { /* Browser checks require playwright-core. */ }

/* a required field typed in and emptied again says so under it (the submit button is disabled, so a click alone would say nothing) */
test('dialog_required_field_emptied_after_typing_shows_its_field_error', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><button id="t">open</button>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const dialog = await import('/kit/components/dialog.js');
      window.dialogs = dialog.attach(document, { emit() {} });
      window.dialogs.open({ title: { raw: 'Add' }, fields: [{ key: 'name', label: { raw: 'Name' }, type: 'text', required: true }], submit: { label: { raw: 'Add' }, action: 'add' } }, document.getElementById('t'));
    });
    const err = () => page.evaluate(() => [document.querySelector('[data-field-box="name"] .fld-err').textContent, document.querySelector('[data-field="name"]').getAttribute('aria-invalid')]);
    assert.deepEqual(await err(), ['', null], 'no error before anything is typed');
    await page.keyboard.type('a'); await page.keyboard.press('Backspace');
    const [message, invalid] = await err();
    assert.ok(message.length > 0, 'the emptied required field shows its error');
    assert.equal(invalid, 'true');
    await page.keyboard.type('b');
    assert.deepEqual(await err(), ['', null], 'typing again clears the error');
  } finally {
    await browser?.close();
    server.close();
  }
});

/* B-23: pressing the disabled "Add" with nothing typed said nothing (the button stays disabled while a required field is empty). Leaving an empty
   required field, which pressing the disabled button does, shows the field's error */
test('dialog_pressing_the_disabled_submit_with_an_empty_required_field_shows_its_error', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><button id="t">open</button>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const dialog = await import('/kit/components/dialog.js');
      const style = document.createElement('style'); style.textContent = dialog.css; document.head.appendChild(style);
      window.dialogs = dialog.attach(document, { emit() {} });
      window.dialogs.open({ title: { raw: 'Add' }, fields: [{ key: 'name', label: { raw: 'Name' }, type: 'text', required: true }], submit: { label: { raw: 'Add' }, action: 'add' } }, document.getElementById('t'));
    });
    const submit = page.locator('[data-action="kit.dialog.submit"]');
    assert.equal(await submit.isDisabled(), true, 'the submit is disabled while the field is empty');
    const box = await submit.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const [message, invalid] = await page.evaluate(() => [document.querySelector('[data-field-box="name"] .fld-err').textContent, document.querySelector('[data-field="name"]').getAttribute('aria-invalid')]);
    assert.ok(message.length > 0, 'the empty required field says why the button does nothing');
    assert.equal(invalid, 'true');
  } finally {
    await browser?.close();
    server.close();
  }
});

/* B3-03: a destructive confirm opened with focus on the destructive button, so Enter deleted. It opens on Cancel and Enter cancels.
   B3-11: Korean title and description wrapped inside a word; they wrap between words (keep-all) */
test('dialog_destructive_confirm_opens_on_cancel_so_enter_does_not_delete_and_text_wraps_between_words', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><button id="t">open</button>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      const dialog = await import('/kit/components/dialog.js');
      const style = document.createElement('style'); style.textContent = dialog.css; document.head.appendChild(style);
      window.emitted = [];
      window.dialogs = dialog.attach(document, { emit(name) { window.emitted.push(name); } });
      window.dialogs.open({ title: { raw: 'delete everything kept?' }, description: { raw: 'deleted records cannot come back.' }, icon: 'trash', submit: { label: { raw: 'delete all' }, action: 'delete', variant: 'destructive' } }, document.getElementById('t'));
    });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), 'kit.dialog.cancel', 'focus starts on Cancel');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.dlg-title, .dlg-desc')].map(el => getComputedStyle(el).wordBreak)), ['keep-all', 'keep-all']);
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.emitted), [], 'Enter does not run the destructive action');
    assert.equal(await page.evaluate(() => !!document.querySelector('.dlg-layer[data-state="open"]')), false, 'Enter on Cancel closes the dialog');
  } finally {
    await browser?.close();
    server.close();
  }
});
