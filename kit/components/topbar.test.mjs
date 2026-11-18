import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './topbar.js';
import { createRequire } from 'node:module';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright-core')); } catch { /* Browser checks need playwright-core. */ }

test('render_hidden_brand_keeps_accessible_name_and_menu', () => {
  const output = String(render({ ident: { icon: 'globe', label: 'Application', hideLabel: true, menu: 'account', arg: { id: 'app' } } }));
  assert.match(output, /class="ident" aria-label="Application" aria-haspopup="menu"/);
  assert.match(output, /data-menu="account"/);
  assert.match(output, /data-menu-arg=".*id.*app/);
  assert.doesNotMatch(output, /<span>Application<\/span>/);
});

test('render_visible_identity_and_path_keep_their_names', () => {
  const output = String(render({ ident: { icon: 'globe', label: 'shell.search' }, path: 'path-value' }));
  assert.match(output, /<span>shell.search<\/span>/);
  assert.match(output, /path-value/);
  assert.match(output, /class="vdiv"/);
});

test('render_hidden_static_brand_has_an_accessible_image_name', () => {
  const output = String(render({ ident: { icon: 'globe', label: 'Application', hideLabel: true } }));
  assert.match(output, /class="ident" aria-label="Application" role="img"/);
  assert.doesNotMatch(output, /<span>Application<\/span>/);
});

test('render_no_identity_has_no_divider', () => {
  const output = String(render({ ident: null, path: 'path' }));
  assert.doesNotMatch(output, /class="ident"|class="vdiv"/);
});

test('the ask pill leads with the AI mark like every other ask button', async () => {
  const { render } = await import('./topbar.js');
  const { icon } = await import('../icons/icons.js');
  const s = String(render({ title: 'x', askLabel: 'Ask AI' }).s ?? render({ title: 'x', askLabel: 'Ask AI' }));
  const pill = s.slice(s.indexOf('class="ask-pill"'), s.indexOf('</button>', s.indexOf('class="ask-pill"')));
  assert.ok(pill.includes(String(icon('ai').s ?? icon('ai'))), 'the pill draws the ai icon');
  assert.ok(pill.includes('Ask AI'));
});

/* B-19: in a narrow pane's top bar the path read "Settings › Tools ›": the last segment (the page itself) shrank to nothing after its separator.
   The earlier segments give way first; the last one keeps at least a few letters with an ellipsis */
test('narrow_path_keeps_the_last_segment_readable_after_its_separator', { skip: !chromium && 'playwright-core unavailable' }, async () => {
  const { readFileSync } = await import('node:fs'), { createServer } = await import('node:http'), { resolve, extname } = await import('node:path');
  const repo = resolve(import.meta.dirname, '../..');
  const server = createServer((req, res) => {
    if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/kit/tokens.css"><link rel="stylesheet" href="/kit/base.css"><body><div id="h"></div></body>'); return; }
    const path = resolve(repo, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('content-type', { '.js': 'text/javascript', '.css': 'text/css' }[extname(path)] || 'text/html'); res.end(readFileSync(path)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const widths = await page.evaluate(async () => {
      const P = await import('/kit/components/path-segment-switcher.js');
      const style = document.createElement('style'); style.textContent = P.css; document.head.appendChild(style);
      const h = document.getElementById('h'); h.style.display = 'flex'; h.style.width = `${170}px`;
      h.innerHTML = P.render({ segments: [{ label: 'test.settingsArea' }, { label: 'test.toolsAndSources' }, { label: 'test.loki' }] }).s;
      return [...document.querySelectorAll('.seg')].map(s => Math.round(s.getBoundingClientRect().width));
    });
    assert.ok(widths.at(-1) >= 32, `the last segment keeps a readable width: ${widths}`);
  } finally { await browser?.close(); server.close(); }
});

/* B-22: a disabled top bar button said nothing (a disabled button takes no pointer, so no tip). One with a reason stays hoverable and focusable
   (aria-disabled, no action) and its tip names the reason */
test('disabled_topbar_button_with_a_reason_keeps_its_tip_and_runs_nothing', () => {
  const s = String(render({ buttons: [{ icon: 'terminal', tip: 'test.terminal', action: 'kit.terminal.toggle', disabled: true, why: 'test.desktopOnly' }] }));
  const b = s.match(/<button class="nav-btn tb-keep"[^>]*>/)[0];
  assert.match(b, /aria-disabled="true"/);
  assert.match(b, /data-tip="test.terminal · test.desktopOnly"/);
  assert.doesNotMatch(b, /data-action=|\sdisabled/, 'nothing runs and the button still takes the pointer');
});
