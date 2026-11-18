import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './head-lines.js';

test('head lines are at most three flat rows in one round group, each led by a status mark', () => {
  const rows = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, text: `line ${id} <x>`, tone: ['error', 'idle', 'busy', 'warn'][i], icon: i === 1 ? 'lock' : undefined, attention: i === 0 }));
  const m = render({ rows }).s;
  assert.match(m, /^<div class="hdl" data-c="head-lines"><div class="sg-card round/);
  assert.equal((m.match(/data-c="status-icon"/g) || []).length, 3);
  assert.match(m, /sti error attn/);
  assert.match(m, /line a &lt;x&gt;/);
  assert.doesNotMatch(m, /line d/);
  assert.equal((m.match(/sg-card/g) || []).length, 1);
});

test('an end goes at the row end, and no rows draw nothing', () => {
  assert.match(render({ rows: [{ id: 'l', text: 'linked', end: 'END' }] }).s, /END/);
  assert.equal(render({ rows: [] }), '');
  assert.equal(render({ rows: [{ id: 'x', text: '' }] }), '');
});
