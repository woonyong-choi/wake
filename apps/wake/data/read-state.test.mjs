import test from 'node:test';
import assert from 'node:assert/strict';
import { readIdentity, retainRead } from './read-state.js';

test('retainRead_requires_same_query_range_and_target_and_rejects_cancelled_reads', () => {
  const previous = { value: 7, range: { from: 0, to: 3600 } };
  const key = (query = 'cpu', range = { preset: '1h' }) => readIdentity('c1', 'prometheus', query, range);
  const before = key();
  assert.equal(retainRead(previous, { before, after: key(), error: { kind: 'timeout' } }), previous);
  assert.equal(retainRead(previous, { before, after: key(), error: { kind: 'forbidden' } }), previous);
  for (const after of [key('memory'), key('cpu', { preset: '15m' }), key('cpu', { from: 0, to: 3600, live: false })]) {
    assert.equal(retainRead(previous, { before, after, error: { kind: 'timeout' } }), null);
  }
  const absolute = { from: 0, to: 3600, live: false };
  assert.equal(retainRead(previous, { before: key('cpu', absolute), after: key('cpu', { ...absolute, to: 3601 }) }), null);
  for (const kind of ['identity_changed', 'cancelled', 'unconfigured']) {
    assert.equal(retainRead(previous, { before, after: before, error: { kind } }), null);
  }
  assert.equal(retainRead(previous, { before, after: before, target: { uid: 'old' }, sourceState: { target: { uid: 'new' } } }), null);
  assert.equal(retainRead(previous, { before, after: before, sourceState: { previous: { target: { uid: 'old' } } } }), null);
});
