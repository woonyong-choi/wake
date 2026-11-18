import test from 'node:test';
import assert from 'node:assert/strict';
import { paneNarrow, trimMiddle } from './pane.js';

const windowWith = (width, tokens) => ({ innerWidth: width, document: { documentElement: {} }, getComputedStyle: () => ({ getPropertyValue: name => tokens[name] ?? '' }) });
const tokens = { '--pane-narrow-w': String(480), '--trim-max': '20', '--trim-head': '11', '--trim-tail': '6' }; // parseFloat reads the number

test('a card narrower than the token is narrow; without a window or tokens nothing is', () => {
  assert.equal(paneNarrow(windowWith(340, tokens)), true);
  assert.equal(paneNarrow(windowWith(480, tokens)), false);
  assert.equal(paneNarrow(windowWith(340, {})), false);
  assert.equal(paneNarrow(null), false);
});

test('a long generated name keeps its start and its end', () => {
  assert.equal(trimMiddle('checkout-756cc4448c-rfr8b', windowWith(400, tokens)), 'checkout-75…-rfr8b');
  assert.equal(trimMiddle('inventory-0', windowWith(400, tokens)), 'inventory-0');
  assert.equal(trimMiddle('checkout-756cc4448c-rfr8b', windowWith(400, {})), 'checkout-756cc4448c-rfr8b');
  assert.equal(trimMiddle(undefined, null), '');
});

import { tokenPx } from './pane.js';
test('a length token reads as its px number; none without a window or token', () => {
  assert.equal(tokenPx('--fl-label-under-max', windowWith(400, { '--fl-label-under-max': String(116) })), 116);
  assert.equal(tokenPx('--x', windowWith(400, {})), null);
  assert.equal(tokenPx('--x', null), null);
});

/* the test helper token-source.mjs had no consumer and is gone: a windowless test gives token values through the public useTokenSource */
test('token_values_for_windowless_tests_come_only_through_the_public_use_token_source', async () => {
  const { existsSync } = await import('node:fs');
  assert.equal(existsSync(new URL('./token-source.mjs', import.meta.url)), false, 'no second way to give token values');
  assert.equal(typeof (await import('../page/index.js')).useTokenSource, 'function');
});
