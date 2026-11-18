import test from 'node:test';
import assert from 'node:assert/strict';
import { motionOf, css } from './state-motion.js';

test('only the states that need a person move: waiting and warning breathe, failing breathes and shakes', () => {
  for (const s of ['wait', 'warn', 'event']) assert.equal(motionOf(s), 'wait', s);
  for (const s of ['fail', 'error']) assert.equal(motionOf(s), 'fail', s);
  for (const s of ['ok', 'idle', 'unknown', 'run', 'live', undefined]) assert.equal(motionOf(s), null, String(s));
});

test('the motion takes its times from the shared tokens and stops under reduced motion with the halo still drawn', () => {
  assert.match(css, /var\(--dur-state-pulse\)/);
  assert.match(css, /var\(--dur-state-shake\)/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^}]*animation: none/);
  assert.match(css, /\.stm-halo \{ opacity: 1; \}/);
});
