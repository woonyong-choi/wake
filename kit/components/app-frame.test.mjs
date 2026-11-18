import test from 'node:test';
import assert from 'node:assert/strict';

/* A2-04: an 820px window with the sidebar (548px center) gave the list beside a detail 226px: its title and scope box were cut to a letter.
   The list keeps its least width (--pane-list-min); when the list and the detail cannot both keep theirs, the list folds and the detail
   takes the center (as an expanded detail) */
test('detail_split_keeps_the_list_pane_readable_and_folds_it_when_both_cannot_fit', async t => {
  const { createRequire } = await import('node:module'), require = createRequire(import.meta.url);
  let chromium; try { ({ chromium } = require('playwright-core')); } catch { t.skip('playwright-core unavailable'); return; }
  const { createServer } = await import('node:http'), { readFileSync } = await import('node:fs'), { resolve, extname } = await import('node:path');
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><div id="box"></div>'); return; }
    const file = resolve(repo, '.' + pathname);
    if (!file.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(file)] || 'text/html'); res.end(readFileSync(file)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const measure = async width => {
      const page = await browser.newPage({ viewport: { width, height: 500 } });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const seen = await page.evaluate(async () => {
        const frame = await import('/kit/components/app-frame.js');
        const style = document.createElement('style'); style.textContent = frame.css; document.head.append(style);
        document.getElementById('box').innerHTML = frame.render({ sidebar: '', topbar: '<div class="tb">top</div>', content: '' }).s;
        const main = document.querySelector('.frame-main');
        main.classList.add('split', 'v', 'detail'); main.style.setProperty('--w0', '0.42'); main.style.setProperty('--w1', '0.58');
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const w = sel => document.querySelector(sel).getBoundingClientRect().width;
        return { center: w('.frame-panes'), list: w('[data-pane="0"]'), detail: w('[data-pane="1"]'), min: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pane-list-min')) };
      });
      await page.close(); return seen;
    };
    /* the 820px window with the sidebar: 548px center. Both panes cannot keep their least width: the list folds, the detail takes the center */
    const narrow = await measure(820);
    assert.equal(Math.round(narrow.center), 548);
    assert.deepEqual({ list: narrow.list, detail: Math.round(narrow.detail) }, { list: 0, detail: 548 }, JSON.stringify(narrow));
    /* a 1000px window: the 42% share would give the list 306px; it keeps its least width and the detail takes the rest */
    const wide = await measure(1000);
    assert.ok(wide.list >= wide.min && wide.min > 0, `the list keeps ${wide.min}px: ${JSON.stringify(wide)}`);
    assert.ok(wide.detail > 0 && Math.round(wide.list + wide.detail + 8) === Math.round(wide.center), JSON.stringify(wide));
    /* wide enough: the shares as dragged */
    const roomy = await measure(1600);
    assert.ok(Math.abs(roomy.list / (roomy.list + roomy.detail) - 0.42) < 0.01, JSON.stringify(roomy));
  } finally { await browser?.close(); server.close(); }
});
