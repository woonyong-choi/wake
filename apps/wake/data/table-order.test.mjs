import assert from 'node:assert/strict';
import test from 'node:test';
import { compareText, compareResources, compareHistory, compareIncidents } from './table-order.js';

test('compareResources_orders_tone_namespace_name_and_uid_without_mutating_input', () => {
  const rows = [
    { uid: 'z', ns: 'a', name: 'same', status: ['ok'] },
    { uid: 'w', ns: 'a', name: 'same', status: ['warn'] },
    { uid: 'b', ns: 'b', name: 'same', status: ['danger'] },
    { uid: '2', ns: 'a', name: 'same', status: ['danger'] },
    { uid: '1', ns: 'a', name: 'same', status: ['danger'] },
  ];
  assert.deepEqual([...rows].sort(compareResources).map(row => row.uid), ['1', '2', 'b', 'w', 'z']);
  assert.equal(rows[0].uid, 'z');
  assert.ok(compareText('\u{10000}', '\uffff') > 0);
  assert.ok(compareText('Z', 'a') < 0);
});

test('compareHistory_keeps_missing_last_and_uses_identity_for_equal_instants', () => {
  const rows = [{ id: 'missing', at: null }, { id: 'old', at: 0 }, { id: 'b', at: 1000 }, { id: 'a', at: '1970-01-01T00:00:01Z' }, { id: 'invalid', at: 'invalid' }];
  assert.deepEqual(rows.sort(compareHistory).map(row => row.id), ['a', 'b', 'old', 'invalid', 'missing']);
});

test('compareIncidents_prioritizes_unresolved_then_severity_time_and_id', () => {
  const rows = [{ id: 'done', result: 'fixed', sev: 'critical', at: 30 }, { id: 'low', sev: 'low', at: 20 }, { id: 'a', sev: 'critical', at: 10 }];
  assert.deepEqual(rows.sort(compareIncidents).map(row => row.id), ['a', 'low', 'done']);
  assert.ok(compareIncidents({ id: 'old', result: 'fixed', sev: 'critical', at: 0 }, { id: 'new', result: 'fixed', sev: 'low', at: 1 }) > 0);
});
