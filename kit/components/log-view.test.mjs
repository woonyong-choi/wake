import test from 'node:test';
import assert from 'node:assert/strict';
import { render, toneOf } from './log-view.js';
import { t } from '../core/i18n.js';

const lines = [
  { n: 120, at: '09:41:02', level: 'INFO', text: 'start' },
  { n: 121, at: '09:41:03', level: 'ERROR', text: 'connection <refused>' },
  { n: 140, at: '09:41:09', level: 'WARN', text: 'retry connection' },
];

test('lines keep the numbers given, never renumbered, with time, level and text; the level words set the tone', () => {
  const m = render({ lines }).s;
  assert.deepEqual([...m.matchAll(/<span class="lgv-n">(\d+)<\/span>/g)].map(x => x[1]), ['120', '121', '140']);
  assert.match(m, /data-level="ERROR" data-tone="error"/);
  assert.match(m, /data-level="WARN" data-tone="warn"/);
  assert.match(m, /connection &lt;refused&gt;/);
  assert.equal(toneOf('fatal'), 'error'); assert.equal(toneOf('info'), null);
});

test('hit lines are the numbers given; without them a query marks the lines that hold it and the matched words', () => {
  const given = render({ lines, hits: [121] }).s;
  assert.equal((given.match(/data-hit/g) || []).length, 1);
  assert.match(given, /data-n="121"[^>]*data-hit/);
  const q = render({ lines, query: 'connection' }).s;
  assert.equal((q.match(/ data-hit/g) || []).length, 2);
  assert.match(q, /<mark>connection<\/mark> &lt;refused&gt;/);
  assert.match(q, /retry <mark>connection<\/mark>/);
});

test('with gaps a run of left out lines between shown ones is one quiet row with its count', () => {
  const m = render({ lines, gaps: true }).s;
  assert.equal((m.match(/class="lgv-gap"/g) || []).length, 1);
  assert.ok(m.includes(`<div class="lgv-gap" role="separator">${t('log.skipped', { n: '18' })}</div>`));
  assert.doesNotMatch(render({ lines }).s, /lgv-gap/);
  assert.match(render({ lines, gaps: true, labels: { skipped: '{n} skipped' } }).s, />18 skipped</);
});

test('times off and wrap off are marked on the view; the list is its own scroller', () => {
  const m = render({ lines, times: false, wrap: false }).s;
  assert.match(m, /^<div class="lgv" data-c="log-view" data-nots data-nowrap><div class="lgv-list" data-scroll="y">/);
  assert.match(render({ lines }).s, /^<div class="lgv" data-c="log-view"><div/);
});
