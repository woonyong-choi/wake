import test from 'node:test';
import assert from 'node:assert/strict';
import { ticks, pickStep, zoom, pan, whole, niceScale, reading, snap } from './time-axis.js';

const at = (s) => Date.parse(s + 'Z') / 1000;

test('the step keeps marks apart for the width', () => {
  assert.equal(pickStep(3600, 640, 64), 900);
  assert.equal(pickStep(86400, 640, 64), 21600);
  assert.equal(pickStep(7 * 86400, 640, 64), 86400);
  assert.equal(pickStep(1800, 2560, 64), 60);
  assert.equal(pickStep(1800, 640, 64), 300);
});

test('majors are day boundaries named with the year, minors the time of day', () => {
  const t = ticks(at('2026-11-09T18:00:00'), at('2026-11-10T06:00:00'), 600, { zone: 'utc' });
  const major = t.filter(x => x.major);
  assert.deepEqual(major.map(x => x.label), ['2026-11-10']);
  assert.equal(major[0].at, at('2026-11-10T00:00:00'));
  assert.ok(t.filter(x => !x.major).every(x => /^\d{2}:\d{2}$/.test(x.label)));
  assert.ok(t.every((x, i) => !i || x.at > t[i - 1].at));
});

test('a day boundary follows the zone, not UTC', () => {
  const t = ticks(at('2026-11-09T12:00:00'), at('2026-11-10T12:00:00'), 600, { zone: 'Asia/Seoul' });
  assert.deepEqual(t.filter(x => x.major).map(x => [x.label, x.at]), [['2026-11-10', at('2026-11-09T15:00:00')]]);
});

test('a window inside one day names its first mark with the date', () => {
  const t = ticks(at('2026-11-09T10:00:00'), at('2026-11-09T11:00:00'), 600, { zone: 'utc' });
  assert.equal(t[0].label, '2026-11-09 10:00');
  assert.ok(t[0].major);
  assert.ok(t.slice(1).every(x => /^\d{2}:\d{2}$/.test(x.label)));
});

test('a long window has day marks only, every one a date', () => {
  const t = ticks(at('2026-11-01T00:00:00'), at('2026-11-15T00:00:00'), 400, { zone: 'utc' });
  assert.ok(t.length > 1 && t.every(x => x.major && /^2026-11-\d{2}$/.test(x.label)));
});

test('the reading is the whole date and time to the second', () => {
  assert.equal(reading(at('2026-11-09T14:02:05'), 'utc'), '2026-11-09 14:02:05');
});

test('zoom keeps the time under the pointer, holds the bounds and the narrowest window', () => {
  const r = { from: 0, to: 1000 }, bounds = { from: 0, to: 1000 };
  const z = zoom(r, 250, .5, { bounds });
  assert.deepEqual(z, { from: 125, to: 625 });
  assert.equal((250 - z.from) / (z.to - z.from), .25);
  assert.deepEqual(zoom(z, 250, 4, { bounds }), bounds);
  assert.equal(zoom(r, 500, .001, { bounds, min: 60 }).to - zoom(r, 500, .001, { bounds, min: 60 }).from, 60);
  assert.deepEqual(zoom(r, 0, .5, { bounds }), { from: 0, to: 500 });
});

test('pan moves the window and stops at the bounds; a window is whole when it covers them', () => {
  const bounds = { from: 0, to: 1000 };
  assert.deepEqual(pan({ from: 100, to: 300 }, 50, { bounds }), { from: 150, to: 350 });
  assert.deepEqual(pan({ from: 100, to: 300 }, -500, { bounds }), { from: 0, to: 200 });
  assert.deepEqual(pan({ from: 100, to: 300 }, 5000, { bounds }), { from: 800, to: 1000 });
  assert.ok(whole({ from: 0, to: 1000 }, bounds));
  assert.ok(!whole({ from: 10, to: 1000 }, bounds));
});

test('a nice scale covers the visible values in round steps', () => {
  assert.deepEqual(niceScale(0, 37), { min: 0, max: 40, ticks: [0, 10, 20, 30, 40] });
  const s = niceScale(0, 0.33);
  assert.ok(s.max >= .33 && s.ticks[0] === 0);
});

test('a marked span rounds out to the step of its marks and stays inside the bounds', () => {
  const r = snap({ from: 1000 + 125, to: 1000 + 1730 }, 600, { minPx: 64 });
  const step = pickStep(1730 - 125, 600, 64);
  assert.equal(r.from % step, 0); assert.equal(r.to % step, 0);
  assert.ok(r.from <= 1125 && r.to >= 2730);
  assert.deepEqual(snap({ from: 5, to: 95 }, 600, { bounds: { from: 10, to: 90 } }), { from: 10, to: 90 });
});

test('a short window gets at least four marks, every 15 or 30 seconds, written with seconds', () => {
  assert.equal(pickStep(120, 800), 15);
  assert.equal(pickStep(300, 300), 60);
  const t = ticks(at('2026-11-09T10:00:00'), at('2026-11-09T10:02:00'), 800, { zone: 'utc' });
  assert.ok(t.length >= 4);
  assert.ok(t.slice(1).every(x => /^\d{2}:\d{2}:\d{2}$/.test(x.label)), t.map(x => x.label).join());
});
