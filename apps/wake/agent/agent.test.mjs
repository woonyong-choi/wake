import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeHistory, encodeHistory, pushHistory, ratePerSec, leaseBody, microTime, podReady, HISTORY_MINUTES, LEASE_SECONDS, WATCH } from './agent.mjs';

test('history_round_trips_and_keeps_empty_minutes', () => {
  const h = decodeHistory('100|38,,41');
  assert.deepEqual(h, { start: 100, values: [38, null, 41] });
  assert.equal(encodeHistory(h), '100|38,,41');
  assert.deepEqual(decodeHistory('bad'), { start: null, values: [] });
  assert.equal(encodeHistory({ start: null, values: [] }), '');
});

test('push_takes_minute_max_fills_gaps_and_trims_to_six_hours', () => {
  let h = pushHistory({ start: null, values: [] }, 10, 30);
  h = pushHistory(h, 10, 50); h = pushHistory(h, 10, 20);
  assert.deepEqual(h, { start: 10, values: [50] });
  h = pushHistory(h, 13, 7);
  assert.deepEqual(h, { start: 10, values: [50, null, null, 7] });
  assert.deepEqual(pushHistory(h, 5, 1), h);
  h = pushHistory(h, 10 + HISTORY_MINUTES + 1, 9);
  assert.equal(h.values.length, HISTORY_MINUTES); assert.equal(h.start, 12); assert.equal(h.values.at(-1), 9);
});

test('rate_counts_last_minute_only', () => {
  const r = ratePerSec([0, 30000, 61000, 62000, 63000], 70000);
  assert.deepEqual(r.times, [30000, 61000, 62000, 63000]); assert.equal(r.rate, 0.1);
});

test('lease_body_renews_with_holder_and_transitions', () => {
  const cache = { objects: 12, rate: 0.3, pods: 11, podsNotReady: 1, nodeReady: true }, history = { start: 5, values: [40] };
  const first = leaseBody({ name: 'wake-agent-n1', namespace: 'wake-system', node: 'n1', pod: 'p1', clusterId: 'c', owner: null, previous: null, now: 0, apiMs: null, dnsMs: 3, cache, history });
  assert.equal(first.spec.holderIdentity, 'p1'); assert.equal(first.spec.leaseDurationSeconds, LEASE_SECONDS);
  assert.equal(first.spec.renewTime, '1970-01-01T00:00:00.000000Z'); assert.equal(first.spec.leaseTransitions, 0);
  assert.equal(first.metadata.annotations['wake-agent/watch'], WATCH.join(','));
  assert.equal(first.metadata.annotations['wake-agent/api-ms'], ''); assert.equal(first.metadata.annotations['wake-agent/history'], '5|40');
  assert.equal(first.metadata.resourceVersion, undefined);
  const prev = { ...first, metadata: { ...first.metadata, resourceVersion: '9' } };
  const same = leaseBody({ name: 'wake-agent-n1', namespace: 'wake-system', node: 'n1', pod: 'p1', clusterId: '', owner: { kind: 'DaemonSet' }, previous: prev, now: 5000, apiMs: 12, dnsMs: null, cache, history });
  assert.equal(same.spec.acquireTime, first.spec.acquireTime); assert.equal(same.metadata.resourceVersion, '9'); assert.equal(same.spec.leaseTransitions, 0);
  assert.deepEqual(same.metadata.ownerReferences, [{ kind: 'DaemonSet' }]); assert.equal(same.metadata.annotations['wake-agent/cluster-id'], undefined);
  const next = leaseBody({ name: 'wake-agent-n1', namespace: 'wake-system', node: 'n1', pod: 'p2', owner: null, previous: prev, now: 9000, apiMs: 12, dnsMs: 2, cache, history });
  assert.equal(next.spec.leaseTransitions, 1); assert.equal(next.spec.acquireTime, microTime(9000));
});

test('pod_ready_reads_condition', () => {
  assert.equal(podReady({ status: { conditions: [{ type: 'Ready', status: 'True' }] } }), true);
  assert.equal(podReady({ status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'False' }] } }), false);
  assert.equal(podReady({ status: { phase: 'Succeeded' } }), true);
});
