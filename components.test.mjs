import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' };

test('gallery_explicit_dialog_examples_mount_open_and_escape_without_services', async () => {
  const repo = resolve(process.env.GALLERY_TEST_ROOT || import.meta.dirname);
  const failures = [], serviceRequests = [], pageErrors = [], consoleErrors = [];
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = pathname === '/components.js' ? resolve(import.meta.dirname, 'components.js') : resolve(repo, '.' + pathname);
    if (pathname !== '/components.js' && !file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', MIME[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); }
    catch { res.writeHead(404).end(); }
  });
  let browser;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const origin = `http://127.0.0.1:${server.address().port}`;
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) failures.push({ url: response.url(), status: response.status() }); });
    page.on('requestfailed', request => failures.push({ url: request.url(), failure: request.failure() }));
    page.on('request', request => { if (['fetch', 'xhr', 'websocket'].includes(request.resourceType())) serviceRequests.push(request.url()); });
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) { serviceRequests.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await page.goto(`${origin}/components.html`);
    await page.locator('#page > .g [data-c]').first().waitFor();
    assert.equal(await page.locator('.kit-error').count(), 0);
    assert.equal(await page.locator('.dlg-layer.static').count(), 4);
    const ids = ['g.confirm', 'g.code', 'g.mcp', 'g.routine'];
    const configuredDialogs = await page.evaluate(async () => Object.keys((await import('/apps/wake/app.config.js')).default.dialogs));
    assert.ok(configuredDialogs.length > 0);
    for (const id of configuredDialogs) assert.equal(await page.locator(`button[data-dialog="${id}"]`).count(), 0);
    for (const id of ids) {
      const trigger = page.locator('.g-sec').filter({ has: page.locator('.dlg-layer.static') }).locator(`button[data-dialog="${id}"]`);
      assert.equal(await trigger.count(), 1);
      assert.ok((await trigger.textContent()).trim());
      await trigger.click();
      const dialog = page.locator('.dlg-layer:not(.static) [role="dialog"]');
      await dialog.waitFor({ state: 'visible' });
      assert.equal(await dialog.getAttribute('aria-modal'), 'true');
      assert.equal((await dialog.locator('#dlg-title').textContent()).trim(), (await trigger.textContent()).trim());
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
    }
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(failures, []);
    assert.deepEqual(serviceRequests, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
