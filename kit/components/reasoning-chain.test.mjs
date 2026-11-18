import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './reasoning-chain.js';

const p = {
  grade: { label: 'inferred', kind: 'warn' }, source: 'Rule · memory-check v2', conclusion: 'Limit too low <x>', refAction: 'x.ref',
  cells: [
    { id: 'observe', label: 'observed', count: true, items: [{ text: 'Exit 137', refs: [1, 3] }, { text: 'Restarts 16' }] },
    { id: 'basis', label: 'basis', count: true, items: [{ text: 'Usage near the limit', refs: [2] }] },
    { id: 'interpret', label: 'reading', items: [{ text: 'The process ran out of memory' }] },
    { id: 'unknown', label: 'unconfirmed', count: true, items: [] },
  ],
};

test('the head is the lead mark, the conclusion and a quiet line with the grade word, the source and the counted cells', () => {
  const m = render(p).s;
  assert.match(m, /<section class="rch" data-c="reasoning-chain"><div class="rch-h"><span class="rch-lead">/);
  assert.match(m, /<b>Limit too low &lt;x&gt;<\/b>/);
  assert.match(m, /<span class="rch-g" data-kind="warn">inferred<\/span><span class="rch-src">Rule · memory-check v2<\/span><span>observed 2<\/span><span>basis 1<\/span><\/span>/);
  assert.doesNotMatch(m, /reading 1|unconfirmed 0/);
});

test('each cell with items is a row of its name and items, every item followed by its references; an empty cell is left out', () => {
  const m = render(p).s;
  assert.equal((m.match(/class="rch-row"/g) || []).length, 3);
  assert.match(m, /<div class="rch-row" data-cell="observe"><span>observed<\/span><ul><li>Exit 137<span class="evr"[^>]*data-arg="1">\[1\]<\/span><span class="evr"[^>]*data-arg="3">\[3\]<\/span><\/li><li>Restarts 16<\/li><\/ul><\/div>/);
  assert.doesNotMatch(m, /data-cell="unknown"/);
  assert.doesNotMatch(m, /\d+\/\d+/);
});

test('with toggle the chain is a summary bar: the closed line is the grade and the conclusion, the chain is its body', () => {
  const m = render({ ...p, toggle: { action: 'x.chain', arg: 'a' }, open: true }).s;
  assert.match(m, /<details class="sbar" data-c="summary-bar" open="" data-sbar-toggle="x.chain"/);
  assert.match(m, /<span class="sbar-item wrap"[^>]*><b>inferred · Limit too low &lt;x&gt;<\/b><\/span>/);
  assert.match(m, /<div class="sbar-body"><section class="rch"/);
  assert.match(render({ ...p, toggle: { action: 'x.chain' }, head: 'ai-view' }).s, /<b>ai-view<\/b>/);
  assert.doesNotMatch(render({ ...p, toggle: { action: 'x.chain' } }).s, / open=""/);
});
