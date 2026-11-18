import test from 'node:test';
import assert from 'node:assert/strict';
import { scale, span, formatValue, niceStep } from './value-axis.js';

test('steps are 1, 2 or 5 x 10^n', () => {
  assert.equal(niceStep(100, 4), 50);
  assert.equal(niceStep(37, 4), 10);
  assert.equal(niceStep(0.33, 4), 0.1);
  assert.equal(niceStep(800, 4), 200);
});

test('a scale starts at 0 for values that are never negative and leaves about 10% over the top', () => {
  const s = scale(20, 90, { unit: '%' });
  assert.equal(s.min, 0); assert.ok(s.max >= 99 && s.max <= 120, String(s.max));
  assert.deepEqual(s.ticks.map(s.label), s.ticks.map(v => v + '%'));
  const n = scale(-5, 5);
  assert.ok(n.min < 0);
});

test('bytes are read in binary units on round steps: never 4000Mi', () => {
  const s = scale(0, 3600, { unit: 'Mi' });
  assert.deepEqual(s.ticks.map(s.label), ['0Gi', '1Gi', '2Gi', '3Gi', '4Gi']);
  assert.ok(s.ticks.every(v => Number.isFinite(v)));
  assert.equal(formatValue(3456, 'Mi'), '3.38Gi');
  assert.equal(formatValue(512, 'Mi'), '512Mi');
  assert.equal(formatValue(1536, 'MiB'), '1.5GiB');
  assert.deepEqual(scale(0, 450, { unit: 'Mi' }).ticks.map(v => formatValue(v, 'Mi')), ['0B', '200Mi', '400Mi', '600Mi']);
});

test('millicores read as cores above one core', () => {
  assert.equal(formatValue(250, 'm'), '250m');
  assert.equal(formatValue(1500, 'm'), '1.5 cores');
  const s = scale(0, 2600, { unit: 'm' });
  assert.deepEqual(s.ticks.map(s.label), ['0 cores', '1 core', '2 cores', '3 cores']);
});

/* A2-24: a latency axis read "4000ms": milliseconds read as seconds from one second up, like cores above 1000m */
test('milliseconds read as seconds from one second up', () => {
  assert.equal(formatValue(820, 'ms'), '820ms');
  assert.equal(formatValue(1647, 'ms'), '1.65s');
  const s = scale(0, 1700, { unit: 'ms' });
  assert.deepEqual(s.ticks.map(s.label), ['0s', '0.5s', '1s', '1.5s', '2s']);
});

test('other units keep their name and get round steps with at most three significant digits', () => {
  const s = scale(0, 1.09, { unit: 'req/s' });
  assert.ok(s.ticks.map(s.label).every(l => /^[\d.]+ req\/s$/.test(l)));
  assert.equal(formatValue(123456, 'req/s'), '123000 req/s');
});

test('the low end fits the data: 0 only for a percentage or data that reaches near 0', () => {
  const s = scale(450, 520, { unit: 'Mi', count: 5 });
  assert.ok(s.min >= 400 && s.min <= 450, String(s.min)); assert.ok(s.max >= 520 && s.max <= 560, String(s.max));
  assert.equal(scale(40, 62, { unit: '%', count: 5 }).min, 0);
  assert.equal(scale(10, 100, { unit: 'Mi' }).min, 0);
});

test('a percentage steps by 25 when the room allows four steps, finer when it allows more', () => {
  const four = scale(20, 90, { unit: '%', count: 4 });
  assert.deepEqual(four.ticks.map(four.label), ['0%', '25%', '50%', '75%', '100%']);
  const eight = scale(40, 62, { unit: '%', count: 8 });
  assert.equal(eight.ticks[1] - eight.ticks[0], 10);
});

test('a range the reader set keeps its ends exactly, with round marks inside it in the unit read', () => {
  const pct = span(0, 37.3, { unit: '%', count: 4 });
  assert.deepEqual([pct.min, pct.max], [0, 37.3]);
  assert.deepEqual(pct.ticks.map(pct.label), ['0%', '10%', '20%', '30%']);
  const mem = span(512, 3072, { unit: 'Mi', count: 4 });
  assert.equal(mem.max, 3072);
  assert.ok(mem.ticks.every(t => t >= 512 && t <= 3072));
  assert.deepEqual(mem.ticks.map(mem.label), ['1Gi', '2Gi', '3Gi']);
  assert.ok(span(5, 5).max > 5, 'an empty range still has room');
});
