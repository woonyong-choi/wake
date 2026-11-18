import test from 'node:test';
import assert from 'node:assert/strict';
import { readableBytes, shownTime, readableFact } from './parts.js';

test('bytes in Ki read as MiB or GiB and anything else stays as it is', () => {
  assert.equal(readableBytes('3516704Ki'), '3.4GiB');
  assert.equal(readableBytes('16384Ki'), '16MiB');
  assert.equal(readableBytes('16Mi'), '16Mi');
  assert.equal(readableBytes('N/A'), 'N/A');
});

test('a recorded time reads as the local date and minutes; text that is not a time stays', () => {
  assert.match(shownTime('2026-11-08T21:56:45Z'), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(shownTime('not a time'), 'not a time');
});

const NAME = { memory: 'Capacity Memory', created: 'Created', phase: 'Phase', cpu: 'CPU' }; // Kubernetes field names, as the cluster spells them
test('a fact reads by its label and value: memory as bytes, recorded times as dates, others as they are', () => {
  assert.equal(readableFact({ id: 'a', label: NAME.memory, value: '16384Ki' }).value, '16MiB');
  assert.match(readableFact({ id: 'b', label: NAME.created, value: '2026-11-08T21:56:45Z' }).value, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.deepEqual(readableFact({ id: 'c', label: NAME.phase, value: 'Running' }), { id: 'c', label: NAME.phase, value: 'Running' });
  assert.deepEqual(readableFact({ id: 'd', label: NAME.cpu, value: 3 }), { id: 'd', label: NAME.cpu, value: 3 });
});

/* A3-08: the network head said "1 KiB/s" over a line at 1.25 on an axis of 0.5 steps, and the parts below it did not add up to it: a byte rate under ten
   of its unit keeps one decimal (two significant digits, as the axis and the request rates), so the head, the axis and the table read the same */
test('byte_rates_under_ten_of_their_unit_keep_one_decimal_like_the_axis', async () => {
  const { byteRate } = await import('./parts.js');
  assert.equal(byteRate(1.25 * 1024), '1.3 KiB/s');
  assert.equal(byteRate(1.75 * 1024), '1.8 KiB/s');
  assert.equal(byteRate(7 * 1024), '7 KiB/s', 'a whole value has no .0');
  assert.equal(byteRate(77 * 1024 + 300), '77 KiB/s');
  assert.equal(byteRate(2.5 * 1048576), '2.5 MiB/s');
  assert.equal(byteRate(300), '300 B/s');
});

/* R4-17: one column of a table read "1.6 KiB/s", "2 KiB/s" and "12 KiB/s": each value had its own decimals. In one column every value of one unit
   has the same decimals (one when any of them needs it), so the figures line up and read alike */
test('byte_rates_in_one_column_share_their_decimals_per_unit', async () => {
  const { byteRates } = await import('./parts.js');
  const col = byteRates([1.6 * 1024, 2 * 1024, 12 * 1024, 300, null, 2.5 * 1048576, 40 * 1048576]);
  assert.deepEqual([1.6 * 1024, 2 * 1024, 12 * 1024, 300, null, 2.5 * 1048576, 40 * 1048576].map(col), ['1.6 KiB/s', '2.0 KiB/s', '12.0 KiB/s', '300 B/s', '', '2.5 MiB/s', '40.0 MiB/s']);
  const whole = byteRates([7 * 1024, 77 * 1024]);
  assert.deepEqual([7 * 1024, 77 * 1024].map(whole), ['7 KiB/s', '77 KiB/s'], 'no decimal when none of the unit needs one');
});

test('the_network_table_formats_its_receive_and_transmit_columns_as_one_column_each', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./network.js', import.meta.url), 'utf8');
  assert.ok(/byteRates\(/.test(src), 'the network table reads each byte-rate column with one formatter');
  assert.ok(!/cell: x => rate\(x\.(rx|tx)\)/.test(src), 'not a value at a time');
});
