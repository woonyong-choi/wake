import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './step-row.js';
import { render as group } from './step-group.js';

test('the icon form is unchanged: an icon or a dot, a spinner while running, no state', () => {
  const m = render({ icon: 'search', text: 'alpha' }).s;
  assert.match(m, /class="sr" data-c="step-row"/);
  assert.doesNotMatch(m, /sr-meta|data-state|status-icon/);
  assert.match(render({ text: 'beta', running: true }).s, /class="sr running"/);
  assert.match(render({ text: 'gamma' }).s, /sr-dot/);
});

test('the state form leads with the status icon of its state and is a compact row', () => {
  const kinds = { run: 'busy', done: 'ok', fail: 'error', wait: 'idle', blocked: 'perm', off: 'idle' };
  for (const [state, kind] of Object.entries(kinds)) {
    const m = render({ state, text: 'x' }).s;
    assert.match(m, new RegExp(`class="sr st" data-c="step-row" data-state="${state}"`));
    assert.match(m, new RegExp(`class="sti ${kind}"`), state);
  }
});

test('meta sits at the end of the row, a live line in the mono face; no meta, no cell', () => {
  assert.match(render({ state: 'done', text: 'read', meta: '1,255' }).s, /<span class="sr-meta" data-tip="1,255" data-tip-overflow>1,255<\/span>/);
  assert.match(render({ state: 'run', text: 'run', meta: 'line', live: true }).s, /<span class="sr-meta live" data-tip="line" data-tip-overflow>line<\/span>/);
  assert.doesNotMatch(render({ state: 'wait', text: 'next' }).s, /sr-meta/);
});

test('a step group holds state rows as it holds icon rows', () => {
  const rows = [render({ state: 'done', text: 'a', meta: '1' }), render({ state: 'run', text: 'b' })];
  const m = group({ id: 'g', seconds: 3, open: true, steps: rows }).s;
  assert.match(m, /sg-inner"><div class="sr st"[\s\S]*data-state="run"/);
});
