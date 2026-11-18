/* 로그 발췌: node --test apps/wake/data/log-excerpt.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logExcerpt } from './log-excerpt.js';

const T = Date.parse('2026-11-09T01:46:59Z');
const LINES = Array.from({ length: 40 }, (_, i) => ({ n: i + 1, at: T + i * 100, level: 'INFO', text: `GET /api/v1/settlements 200 ${10 + i}ms` }));
LINES[11] = { ...LINES[11], level: 'ERROR', text: 'java.lang.OutOfMemoryError: Java heap space at com.example.SettlementBatch.collect' };
LINES[12] = { ...LINES[12], level: 'ERROR', text: 'Exception in thread "settlement-batch-1" java.lang.OutOfMemoryError: Java heap space' };
LINES[30] = { ...LINES[30], level: 'WARN', text: 'G1 Old Generation pause 2977ms, heap 479M->479M(480M)' };

test('original line numbers are kept, never renumbered (N15)', () => {
  const x = logExcerpt(LINES, { key: 'OutOfMemoryError', around: 1 });
  assert.deepEqual(x.hits, [12, 13]);
  assert.deepEqual(x.rows.map(r => r.n ?? `gap${r.gap}`), [11, 12, 13, 14]);
  assert.deepEqual(x.rows.map(r => r.hit), [false, true, true, false]);
  assert.equal(x.total, 40);
  assert.equal(x.last, T + 12 * 100);
});

test('gap rows count the lines left out between kept lines', () => {
  const x = logExcerpt(LINES, { key: /OutOfMemoryError|G1 Old/g, around: 1 });
  assert.deepEqual(x.rows.map(r => r.n ?? `gap${r.gap}`), [11, 12, 13, 14, 'gap15', 30, 31, 32]);
  assert.equal(x.rows.find(r => r.gap).gap, 30 - 14 - 1);
  /* no leading or trailing gap rows: only between kept lines */
  assert.ok(!('gap' in x.rows[0]) && !('gap' in x.rows.at(-1)));
});

test('a list already filtered (Loki) keeps its true gaps from the numbers', () => {
  const filtered = [{ n: 3, text: 'Connection is not available' }, { n: 40, text: 'Connection is not available' }, { n: 41, text: 'Connection is not available' }];
  const x = logExcerpt(filtered, { key: 'Connection is not available', around: 0 });
  assert.deepEqual(x.rows.map(r => r.n ?? `gap${r.gap}`), [3, 'gap36', 40, 41]);
});

test('level matches, no matcher keeps all, no hits keeps none', () => {
  assert.deepEqual(logExcerpt(LINES, { level: 'ERROR', around: 0 }).hits, [12, 13]);
  assert.equal(logExcerpt(LINES.slice(0, 5)).rows.length, 5);
  const none = logExcerpt(LINES, { key: 'not in the log' });
  assert.deepEqual([none.rows, none.hits, none.last], [[], [], null]);
  /* lines without n are numbered by their position */
  assert.deepEqual(logExcerpt([{ text: 'a' }, { text: 'b ERROR' }], { key: 'ERROR', around: 0 }).hits, [2]);
});
