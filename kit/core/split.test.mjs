import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeShares } from './split.js';

test('a drag moves only the two panes beside the handle and keeps each at least the minimum', () => {
  const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  assert.ok(near(resizeShares([0.42, 0.58], 0, 0.6), [0.6, 0.4]));
  assert.ok(near(resizeShares([0.34, 0.33, 0.33], 1, 0.5), [0.34, 0.16, 0.5]));
  assert.ok(near(resizeShares([0.5, 0.5], 0, 0.99, 0.2), [0.8, 0.2]), 'the right pane keeps its minimum');
  assert.ok(near(resizeShares([0.5, 0.5], 0, 0.01, 0.2), [0.2, 0.8]), 'the left pane keeps its minimum');
  const w = resizeShares([0.3, 0.3, 0.4], 1, 0.45); assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});
