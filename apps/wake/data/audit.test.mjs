import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditCounts, auditFilter, auditIn, sourceParts, requesterGroup, resultOf } from './audit.js';

test('counts read rows, model sends, masked values and people', () => {
  const rows = [{ action: 'read', result: 'ok', masked: 2, requester: { kind: 'ai' } }, { action: 'read', result: 'forbidden', masked: 0, requester: { kind: 'ai' } },
    { action: 'model', result: 'ok', model: 'm', masked: 3, requester: { kind: 'ai' } }, { action: 'approve', result: 'ran', masked: 0, requester: { kind: 'human' } }];
  assert.deepEqual(auditCounts(rows), { reads: 1, failed: 1, model: 1, masked: 5, human: 1 });
});

test('filters by requester group, transport, words and window', () => {
  const rows = [{ at: 1, transport: 'mcp', client: 'Claude Code', requester: { kind: 'ai', name: 'Claude Code' }, summary: 'get_incident' },
    { at: 5, transport: 'desktop', requester: { kind: 'human', name: 'jiwoo.han' }, summary: 'approve' }, { at: 9, transport: 'api', client: 'ops', requester: { kind: 'external', name: 'ops' }, summary: 'list_events' }];
  assert.deepEqual(auditFilter(rows, { requester: 'ai' }).map(r => r.at), [1]);
  assert.deepEqual(auditFilter(rows, { transport: 'api' }).map(r => r.at), [9]);
  assert.deepEqual(auditFilter(rows, { q: 'claude' }).map(r => r.at), [1]);
  assert.deepEqual(auditIn(rows, { from: 2, to: 10 }).map(r => r.at), [9, 5]);
  assert.equal(requesterGroup(rows[2]), 'other');
});

test('source label parts only for client calls; result codes map to status', () => {
  assert.deepEqual(sourceParts({ transport: 'desktop', requester: { kind: 'human' } }), []);
  assert.deepEqual(sourceParts({ transport: 'mcp', client: 'Claude Code' }), ['Claude Code', 'mcp']);
  assert.deepEqual(resultOf('waiting'), ['busy', 'wake.audit.r.pending']); assert.equal(resultOf('service')[0], 'ok'); assert.equal(resultOf('mitigated')[0], 'warn');
});
