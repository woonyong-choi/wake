/* R5-07: an observer that writes layout inside its ResizeObserver callback resizes what it observes in the same frame, and the browser reports
   "ResizeObserver loop completed with undelivered notifications" on a width change. The shell's terminal fit, the effort label box and the
   section-tab folding write in the next frame instead */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* a fake window: ResizeObserver callbacks are called by hand, frames run on flush() */
function fakeWindow() {
  const observers = [], frames = [];
  class RO { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} unobserve() {} disconnect() {} }
  class MO { constructor() {} observe() {} disconnect() {} takeRecords() { return []; } }
  const win = { ResizeObserver: RO, MutationObserver: MO, requestAnimationFrame: f => { frames.push(f); return frames.length; } };
  return { win, observers, flush: () => { const list = frames.splice(0); list.forEach(f => f()); }, frames };
}

const px = n => n + 'px';

test('effort_label_box_width_is_written_in_the_next_frame_not_in_the_observer_callback', async () => {
  const { attach } = await import('./toolbar-button.js');
  const { win, observers, flush } = fakeWindow();
  const box = { style: { width: px(40), transition: '' }, getBoundingClientRect() {} }, span = { parentElement: box, offsetWidth: 72, isConnected: true };
  const doc = { defaultView: win, body: {}, querySelectorAll: () => [span] };
  attach({ ownerDocument: doc });
  observers[0].cb([{ target: span }]);
  assert.equal(box.style.width, px(40), 'nothing is written inside the callback');
  flush();
  assert.equal(box.style.width, px(72), 'the next frame writes the new width');
});

test('section_tabs_fold_in_the_next_frame_not_in_the_observer_callback', async () => {
  const { win, observers, flush } = fakeWindow();
  const prior = { RO: globalThis.ResizeObserver, MO: globalThis.MutationObserver, raf: globalThis.requestAnimationFrame };
  Object.assign(globalThis, { ResizeObserver: win.ResizeObserver, MutationObserver: win.MutationObserver, requestAnimationFrame: win.requestAnimationFrame });
  try {
    const { attach } = await import('./pill-tabs.js');
    let reads = 0;
    const row = new Proxy({ isConnected: true, matches: s => s === '[data-pills-fold]' }, { get(target, key) { if (!(key in target)) { reads++; return undefined; } return target[key]; } });
    const doc = { body: {}, documentElement: {}, querySelectorAll: () => [], addEventListener() {} };
    attach({ ownerDocument: doc, addEventListener() {}, querySelectorAll: () => [] }, {});
    const fold = observers.find(o => /pills-fold/.test(o.cb.toString()));
    assert.ok(fold, 'the folding observer');
    fold.cb([{ target: row }]);
    assert.equal(reads, 0, 'the row is not measured or written inside the callback');
    try { flush(); } catch { /* the fake row cannot be folded: only that the fold ran in the frame matters */ }
    assert.ok(reads > 0, 'the next frame folds the row');
  } finally { Object.assign(globalThis, { ResizeObserver: prior.RO, MutationObserver: prior.MO, requestAnimationFrame: prior.raf }); }
});

test('shell_terminal_fit_runs_in_the_next_frame_not_in_the_observer_callback', () => {
  const src = readFileSync(new URL('../shell/shell.js', import.meta.url), 'utf8');
  const line = src.split('\n').find(l => /new ResizeObserver\(/.test(l) && /terms\.fit/.test(l));
  assert.ok(line, 'the terminal panel observer');
  assert.match(line, /requestAnimationFrame\(/, `the fit is scheduled for the next frame: ${line.trim()}`);
});
