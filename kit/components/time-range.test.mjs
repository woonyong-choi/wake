import test from 'node:test';
import assert from 'node:assert/strict';
import { render, compact, validate, presetRange, monthGrid, DEFAULT_PRESETS, QUICK } from './time-range.js';
import { parseDateTime } from '../core/clock.js';
import { t } from '../core/i18n.js';

const at = text => parseDateTime(text, 'utc');

test('a custom window is written in a few characters: the second date only when the day differs, now for an open end', () => {
  assert.equal(compact({ from: at('2026-11-12 13:20'), to: at('2026-11-12 14:05') }, { timeZone: 'utc' }), '2026-11-12 13:20–14:05');
  assert.equal(compact({ from: at('2026-11-11 23:00'), to: at('2026-11-12 01:00') }, { timeZone: 'utc' }), '2026-11-11 23:00 – 2026-11-12 01:00');
  assert.equal(compact({ from: at('2026-11-12 13:20'), to: 0, live: true }, { timeZone: 'utc' }), `2026-11-12 13:20 – ${t('timeRange.now')}`);
  assert.equal(compact({ from: at('2026-11-12 04:20'), to: at('2026-11-12 05:05') }, { timeZone: 'Asia/Seoul' }), '2026-11-12 13:20–14:05', 'in the zone');
});

test('a window is checked: a date-time, the end after the start, not in the future, not before what is kept', () => {
  const now = at('2026-11-12 15:00'), retention = 30 * 86400;
  assert.equal(validate({ from: at('2026-11-12 13:00'), to: at('2026-11-12 14:00') }, { now, retention }), null);
  assert.equal(validate({ from: NaN, to: at('2026-11-12 14:00') }, { now }).key, 'timeRange.badFormat');
  assert.equal(validate({ from: at('2026-11-12 14:00'), to: at('2026-11-12 14:00') }, { now }).key, 'timeRange.order');
  assert.equal(validate({ from: at('2026-11-12 14:00'), to: at('2026-11-12 16:00') }, { now }).key, 'timeRange.future');
  assert.deepEqual(validate({ from: at('2026-10-01 00:00'), to: at('2026-11-12 14:00') }, { now, retention }), { key: 'timeRange.retention', vars: { days: 30 } });
  assert.equal(validate({ from: at('2026-11-12 14:00'), to: NaN, live: true }, { now }), null, 'an open end runs to now');
});

test('presets and quick ranges are the last N up to now', () => {
  assert.deepEqual(presetRange(3600, 10000), { from: 6400, to: 10000 });
  assert.deepEqual(DEFAULT_PRESETS.map(p => p.id), ['15m', '1h', '6h', '24h', '7d']);
  assert.deepEqual(QUICK.map(p => p.seconds), [900, 1800, 10800, 43200, 172800, 2592000]);
});

test('a month is a 6 x 7 grid from Sunday, with the days of the months around it marked', () => {
  const g = monthGrid(2026, 11);
  assert.equal(g.length, 42);
  assert.deepEqual(g[0], { y: 2026, m: 11, d: 1, out: false }, '2026-11-01 is a Sunday');
  assert.equal(g.filter(c => !c.out).length, 30);
  assert.deepEqual(monthGrid(2026, 12)[0], { y: 2026, m: 11, d: 29, out: true });
});

test('the pills: presets, then Custom showing the window in use, and a clear button only then', () => {
  const preset = render({ id: 'a', action: 'x.range', value: { preset: '6h' } }).s;
  assert.match(preset, /data-c="time-range" data-tr="x.range"/);
  assert.match(preset, /aria-selected="true" data-action="kit.timeRange" data-arg="&quot;6h&quot;"/);
  assert.ok(preset.includes(`>${t('timeRange.custom')}</button>`));
  assert.doesNotMatch(preset, /data-tr-clear/);
  const custom = render({ id: 'a', action: 'x.range', timeZone: 'utc', value: { from: at('2026-11-12 13:20'), to: at('2026-11-12 14:05') } }).s;
  assert.match(custom, /aria-selected="true" data-action="kit.timeRange" data-arg="&quot;__custom&quot;"[^>]*>2026-11-12 13:20–14:05<\/button>/);
  assert.match(custom, /<span class="tr-x" data-tr-clear><button class="ib xs"[^>]*aria-label="[^"]+"/);
  const own = render({ id: 'a', action: 'x', value: { preset: 'q' }, presets: [{ id: 'q', label: 'q-1', seconds: 60 }] }).s;
  assert.match(own, />q-1<\/button>/);
});

test('the hour and minute inputs set the field they follow, clamped', async () => {
  const { withTime } = await import('./time-range.js');
  assert.equal(withTime('2026-11-12 13:20', 'h', 7), '2026-11-12 07:20');
  assert.equal(withTime('2026-11-12 13:20', 'm', 75), '2026-11-12 13:59');
  assert.equal(withTime('2026-11-12 13:20', 'h', -1), '2026-11-12 00:20');
  assert.equal(withTime('2026-11-12 13', 'h', 5), '2026-11-12 13', 'a field that is not a date-time yet is left as typed');
});

test('a preset longer than the data kept is disabled and says why', () => {
  const m = render({ id: 'a', action: 'x', value: { preset: '1h' }, retention: 86400 }).s;
  assert.match(m, /<button class="pill"[^>]*data-arg="&quot;7d&quot;" disabled title="[^"]+">/);
  assert.doesNotMatch(m, /data-arg="&quot;24h&quot;" disabled/);
});

test('zoom out doubles the window around its centre, moved back so it never passes now nor what is kept', async () => {
  const { zoomOut } = await import('./time-range.js');
  assert.deepEqual(zoomOut({ from: 1000, to: 2000 }, { now: 10000 }), { from: 500, to: 2500, live: false });
  assert.deepEqual(zoomOut({ from: 9000, to: 10000 }, { now: 10000 }), { from: 8000, to: 10000, live: true }, 'a window that ends now stays at now');
  assert.deepEqual(zoomOut({ from: 9000, to: 10000 }, { now: 10000, retention: 1500 }), { from: 8500, to: 10000, live: true }, 'not before what is kept');
});

test('the reference zone reads as its offset and its name', async () => {
  const { offsetText, zoneText } = await import('./time-range.js');
  const at = at => parseDateTime(at, 'utc');
  assert.equal(offsetText('Asia/Seoul', at('2026-11-12 00:00')), 'UTC+09:00');
  assert.equal(offsetText('America/New_York', at('2026-11-12 00:00')), 'UTC−05:00');
  assert.equal(offsetText('Asia/Kolkata', at('2026-11-12 00:00')), 'UTC+05:30');
  assert.equal(zoneText('Asia/Seoul', at('2026-11-12 00:00')), 'UTC+09:00 Asia/Seoul');
  assert.equal(zoneText('utc', 0), 'UTC');
});

test('the control has a zoom out button when asked, and the clear button only with a custom window', () => {
  assert.doesNotMatch(render({ id: 'a', action: 'x', value: { preset: '1h' } }).s, /data-tr-zoom/, 'off by default');
  const m = render({ id: 'a', action: 'x', value: { preset: '1h' }, zoomOut: true }).s;
  assert.match(m, /<span data-tr-zoom><button class="ib sm"[^>]*data-tip="[^"]+"[^>]*>/);
  assert.doesNotMatch(m, /data-tr-clear/);
  assert.match(render({ id: 'a', action: 'x', value: { from: 1, to: 2 } }).s, /data-tr-clear/);
});

test('the control carries a folded field that says the window in use, for a narrow room', () => {
  const m = render({ id: 'a', action: 'x', value: { preset: '6h' } }).s;
  assert.match(m, /<span class="tr-compact" data-tr-compact data-tip="6 hours" data-tip-overflow><button type="button" class="slt"/);
  const c = render({ id: 'a', action: 'x', timeZone: 'utc', value: { from: at('2026-11-12 23:00'), to: at('2026-11-13 01:00') } }).s;
  assert.ok(c.includes('data-tip="2026-11-12 23:00 – 2026-11-13 01:00"'), 'both dates whole, the whole text as the tooltip');
});
