import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './verify-card.js';
import { t } from '../core/i18n.js';

const conditions = [
  { id: 'a', label: 'error-rate', state: 'pass', value: '0.2%' },
  { id: 'b', label: 'ready', state: 'watch' },
  { id: 'c', label: 'latency <p99>', state: 'fail', value: '820ms' },
  { id: 'd', label: 'logs', state: 'unknown', optional: true },
  { id: 'e', label: 'queue', state: 'unjudged' },
];

test('the card draws no strip of big time figures: those are named values in the head of the stage around it', () => {
  const m = render({ conditions }).s;
  assert.doesNotMatch(m, /data-c="property-grid"/);
  assert.doesNotMatch(m, /\d+:\d\d</);
});

test('each condition is a row with the status mark of its state and the state word, its value and optional at the end', () => {
  const m = render({ conditions }).s;
  assert.match(m, /data-state="pass"><span class="sti-text ok"[^>]*>.*error-rate<\/span><em>Passed · 0.2%<\/em>/);
  assert.match(m, /sti-text busy/);
  assert.match(m, /sti-text error[^>]*>.*latency &lt;p99&gt;/);
  assert.ok(m.includes(`<em>${t('verify.state.unknown')} · ${t('verify.optional')}</em>`));
  assert.ok(m.includes(`<em>${t('verify.state.unjudged')}</em>`));
});

test('windows are named counts, never a fraction, and a label given by the page replaces a word', () => {
  const m = render({ conditions, windows: ['ok', 'ok', 'bad', 'miss', 'none'], min: 10 }).s;
  assert.match(m, /<div class="vfc-cap"><span>Windows 3<\/span><span>Missed 1<\/span><span>Needed 10<\/span><\/div>/);
  assert.doesNotMatch(m, /\d\s*\/\s*\d/);
  const o = render({ conditions: conditions.slice(0, 1), windows: ['ok'], labels: { windows: 'Got {n}', states: { pass: 'Good' } } }).s;
  assert.match(o, /<span>Got 1<\/span>/); assert.match(o, /<em>Good · 0.2%<\/em>/);
  assert.doesNotMatch(render({ conditions: [] }).s, /vfc-cap/);
});
