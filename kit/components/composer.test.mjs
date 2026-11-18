import test from 'node:test';
import assert from 'node:assert/strict';
import { attach } from './composer.js';

/* A wide scope box whose input has a pill min-height (44) taller than one line plus its padding (20 + 12 + 10).
   The box measured only line + padding, so one typed character "needed" a second line and the pill turned into the card, and emptying it
   turned it right back into the card again. */
function wideBox({ lineHeight = 20, padTop = 12, padBottom = 10, minHeight = 44, perLine = 40, maxHeight = 160 } = {}) {
  const classes = new Set(['cmp', 'wide']), listeners = {};
  const cmp = { classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) }, dataset: {} };
  const ta = { value: '', style: { height: '' }, closest: () => cmp, matches: s => s === '[data-composer-input]',
    get scrollHeight() { const lines = Math.max(1, Math.ceil(this.value.length / perLine)), content = lines * lineHeight + padTop + padBottom;
      return this.style.height === 'auto' ? Math.max(content, classes.has('multi') ? 0 : minHeight) : Math.max(content, minHeight); } };
  const root = { addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
  globalThis.getComputedStyle = () => ({ lineHeight: `${lineHeight}px`, paddingTop: `${padTop}px`, paddingBottom: `${padBottom}px`, minHeight: classes.has('multi') ? '0px' : `${minHeight}px`, maxHeight: `${maxHeight}px` });
  attach(root, { emit() {} });
  const type = value => { ta.value = value; for (const fn of listeners.input) fn({ target: ta, isComposing: false }); };
  return { type, multi: () => classes.has('multi') };
}

test('wide_composer_stays_a_pill_for_one_line_and_returns_to_it_when_emptied', () => {
  const box = wideBox();
  box.type('a');
  assert.equal(box.multi(), false, 'one character fits the pill line');
  box.type('x'.repeat(100));
  assert.equal(box.multi(), true, 'text that needs a second line turns it into the card');
  box.type('');
  assert.equal(box.multi(), false, 'emptied, it is the pill again');
});

/* check-layout 1280x240: a mouse wheel over the one-line wide box (the scope box under a section head) did not scroll the page: its input is a
   scroll area that keeps its overscroll (contain) even though one line never scrolls. One line passes the wheel on; a box of several lines keeps it */
test('wheel_over_a_one_line_wide_composer_scrolls_the_page', async t => {
  const { createRequire } = await import('node:module');
  let chromium; try { ({ chromium } = createRequire(import.meta.url)('playwright-core')); } catch { t.skip('playwright-core unavailable'); return; }
  const { css, render } = await import('./composer.js'), { css: scrollCss } = await import('./scroll-area.js');
  const { readFileSync } = await import('node:fs');
  const tokens = ['../tokens.css', '../base.css'].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 240 } });
    await page.setContent('');
    await page.addStyleTag({ content: tokens + css + scrollCss });
    await page.evaluate(box => {
      const main = document.body.appendChild(document.createElement('section'));
      main.style.cssText = 'height:100vh;overflow-y:auto';
      main.insertAdjacentHTML('beforeend', box);
      main.appendChild(document.createElement('div')).style.height = 'calc(100vh * 8)';
    }, String(render({ id: 'scope', variant: 'wide', placeholder: 'x', run: 'run' })));
    const at = await page.evaluate(() => { const r = document.querySelector('textarea').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(at.x, at.y); await page.mouse.wheel(0, 300); await page.waitForTimeout(300);
    const seen = await page.evaluate(() => { const ta = document.querySelector('textarea'), cs = getComputedStyle(ta); return { top: document.querySelector('section').scrollTop, over: cs.overscrollBehaviorY, oy: cs.overflowY, cls: ta.closest('.cmp').className, sh: ta.scrollHeight, ch: ta.clientHeight }; });
    assert.ok(seen.top > 0, `the page scrolls under a wheel over the one-line box: ${JSON.stringify(seen)}`);
  } finally { await browser.close(); }
});

/* B2-16: while an answer streams the send button is the stop button, but it was still named and tipped "Send" (with the Enter key). It is named
   and tipped "Stop" then, without a key */
test('composer_send_button_is_named_stop_while_the_answer_runs', async () => {
  const { render } = await import('./composer.js');
  const busy = String(render({ id: 'c', placeholder: 'fixture.ask', busy: true }).s);
  const button = busy.match(/<button class="cmp-send"[^>]*>/)?.[0] || '';
  assert.match(button, /aria-label="Stop"/); assert.match(button, /data-tip="Stop"/);
  assert.doesNotMatch(button, /data-tip-keys/);
  const idle = String(render({ id: 'c', placeholder: 'fixture.ask' }).s).match(/<button class="cmp-send"[^>]*>/)?.[0] || '';
  assert.match(idle, /aria-label="Send"/);
});
