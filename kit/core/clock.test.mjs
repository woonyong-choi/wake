import test from 'node:test';
import assert from 'node:assert/strict';
import { formatInstant, formatDay, formatFull, formatDateTime, parseDateTime, zoneLabel, validZone } from './clock.js';

const at = Date.UTC(2026, 10, 10, 9, 5, 7) / 1000; /* 2026-11-10 09:05:07 UTC */

test('an instant is written in the zone asked: utc, a named zone, and seconds only in a short window, the date only in a long one', () => {
  assert.equal(formatInstant(at, { timeZone: 'utc' }), '09:05');
  assert.equal(formatInstant(at, { timeZone: 'Asia/Seoul' }), '18:05');
  assert.equal(formatInstant(at, { timeZone: 'America/New_York' }), '04:05');
  assert.equal(formatInstant(at, { timeZone: 'utc', span: 300 }), '09:05:07');
  assert.equal(formatInstant(at, { timeZone: 'utc', span: 3600 }), '09:05');
  assert.equal(formatInstant(at, { timeZone: 'Asia/Seoul', span: 3 * 24 * 3600 }), '2026-11-10 18:05');
  assert.equal(formatDateTime(at, 'Asia/Seoul'), '2026-11-10 18:05');
});

test('typed times are read back in the zone, whatever the zone, and wrong text is not a time', () => {
  assert.equal(parseDateTime('2026-11-10 18:05', 'Asia/Seoul'), Date.UTC(2026, 10, 10, 9, 5) / 1000);
  assert.equal(parseDateTime('2026-11-10T09:05:07', 'utc'), at);
  assert.equal(parseDateTime(formatDateTime(at, 'America/New_York'), 'America/New_York'), Math.floor(at / 60) * 60);
  for (const bad of ['', 'x', '2026-13-01 00:00', '2026-02-30 10:00', '2026-11-10 24:00', '2026-11-10 09:60', '11-10 09:05']) assert.ok(Number.isNaN(parseDateTime(bad, 'utc')), bad);
});

test('a time the clock repeats is its first time, and a time it skips lands after the gap (New York, the autumn and the spring changes)', () => {
  assert.equal(parseDateTime('2026-11-01 01:30', 'America/New_York'), Date.UTC(2026, 10, 1, 5, 30) / 1000); /* 01:30 EDT, the first of the two */
  assert.equal(parseDateTime('2026-03-08 02:30', 'America/New_York'), Date.UTC(2026, 2, 8, 7, 30) / 1000); /* 02:30 does not exist: read with the offset before the change */
});

test('a zone has a short name for the reader, and a setting that is no zone is refused', () => {
  assert.equal(zoneLabel('utc'), 'UTC');
  assert.match(zoneLabel('Asia/Seoul', at, 'en'), /GMT\+9|KST/);
  assert.ok(validZone('system') && validZone('utc') && validZone('Asia/Seoul'));
  assert.ok(!validZone('Mars/Base') && !validZone('') && !validZone(undefined));
});

test('a day and a full instant always carry the year', () => {
  const at = Date.UTC(2026, 10, 9, 23, 30, 7) / 1000;
  assert.equal(formatDay(at, 'utc'), '2026-11-09');
  assert.equal(formatDay(at, 'Asia/Seoul'), '2026-11-10');
  assert.equal(formatFull(at, 'utc'), '2026-11-09 23:30:07');
});
