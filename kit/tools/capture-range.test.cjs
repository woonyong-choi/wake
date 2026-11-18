const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCaptureRange } = require('./capture-range.cjs');

test('capture_range_rejects_15_minutes_selected_with_a_60_minute_chart', () => {
  const identity = { range: { preset: '15m' }, charts: [{ timeAxis: { from: 100, to: 3700 } }] };
  assert.throws(() => validateCaptureRange(identity), /mismatch/);
  identity.charts[0].timeAxis.to = 1000;
  assert.doesNotThrow(() => validateCaptureRange(identity));
  identity.range = { from: 100, to: 1000, live: false };
  assert.doesNotThrow(() => validateCaptureRange(identity));
  identity.range.from = 101;
  identity.range.from = 102;
  assert.throws(() => validateCaptureRange(identity), /mismatch/);
  identity.range = {};
  assert.throws(() => validateCaptureRange(identity), /invalid selected interval/);
  delete identity.range;
  assert.throws(() => validateCaptureRange(identity), /missing selected range/);
});
