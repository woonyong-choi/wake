import test from 'node:test';
import assert from 'node:assert/strict';
import { render, list, inText } from './ref.js';

test('a reference is "[n]" as a button that emits its number, and without an action it is a plain mark', () => {
  const m = render({ n: 3, action: 'x.ref' }).s;
  assert.match(m, /^<span class="evr" data-c="ref" role="button" tabindex="0" data-action="x.ref" data-arg="3">\[3\]<\/span>$/);
  assert.doesNotMatch(render({ n: 3 }).s, /role=|data-action/);
});

test('references after a sentence keep the order and numbers given', () => {
  const m = list([4, 1], 'x.ref').s;
  assert.deepEqual([...m.matchAll(/>\[(\d+)\]</g)].map(x => x[1]), ['4', '1']);
});

test('a text with [n] marks gets references in their place and the rest of the text is escaped', () => {
  const m = inText('a <b> [2] and [10]', 'x.ref').s;
  assert.match(m, /^a &lt;b&gt; <span class="evr"[^>]*data-arg="2">\[2\]<\/span> and <span class="evr"[^>]*data-arg="10">\[10\]<\/span>$/);
});

test('a labelled reference reads where the evidence is from, its excerpt as the tip, and still opens it by its number', async () => {
  const ref = await import('./ref.js');
  const labelOf = n => ({ label: n === 1 ? 'Logs · checkout-api · 14:02:05' : 'Event · OOMKilled', tip: 'excerpt ' + n });
  const one = ref.render({ n: 1, action: 'open', ...labelOf(1) }).s;
  assert.match(one, /data-action="open" data-arg="1" data-tip="excerpt 1">Logs · checkout-api · 14:02:05<\/span>/);
  assert.doesNotMatch(one, /\[1\]/);
  const list = ref.list([1, 2, 1], 'open', labelOf).s;
  assert.equal((list.match(/Logs · checkout-api · 14:02:05/g) || []).length, 2, 'the same evidence has the same label');
  assert.match(ref.inText('it broke [2].', 'open', labelOf).s, /it broke <span[^>]*>Event · OOMKilled<\/span>\./);
});
