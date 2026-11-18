import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './query-line.js';

test('a query line is a status mark, the source and the query in mono, escaped', () => {
  const m = render({ source: 'logs', query: '{app="a"} |= "<err>"' }).s;
  assert.match(m, /^<div class="qln" data-c="query-line"><span class="sti ok"/);
  assert.match(m, /<span class="qln-s">logs<\/span><code>\{app=&quot;a&quot;\} \|= &quot;&lt;err&gt;&quot;<\/code><\/div>$/);
  assert.match(render({ query: 'q', state: 'perm' }).s, /sti perm/);
  assert.doesNotMatch(render({ query: 'q' }).s, /qln-s/);
});
