import test from 'node:test';
import assert from 'node:assert/strict';
import { render, range } from './pager.js';

test('the range row names the shown range and the total with the pager, never a fraction', () => {
  const m = range({ page: 2, per: 20, total: 45, action: 'x.page' }).s;
  assert.match(m, /^<div class="pager-range"><span class="pager-range-n">21–40 · 45 total<\/span><nav class="pager"/);
  assert.match(m, /data-action="x.page" data-arg="1"/);
  assert.match(m, /data-action="x.page" data-arg="3"/);
  assert.doesNotMatch(m, /\d\s*\/\s*\d/);
  assert.match(range({ page: 3, per: 20, total: 45 }).s, />41–45 · 45 total</);
  assert.match(range({ page: 9, per: 20, total: 45 }).s, />41–45/);
});

test('one page or less draws nothing, and the words can be the page\'s own', () => {
  assert.equal(range({ page: 1, per: 20, total: 20 }), '');
  assert.match(range({ page: 1, per: 20, total: 1234, labels: { range: 'lines {from}–{to} of {total}' } }).s, />lines 1–20 of 1,234</);
});

test('the pager alone keeps its shape', () => {
  assert.match(render({ page: 1, pages: 3 }).s, /^<nav class="pager" data-c="pager"/);
});
