import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './page-header.js';

test('without sub the header is what it was', () => {
  assert.equal(render({ title: 'logs', icon: 'search' }).s, render({ title: 'logs', icon: 'search', sub: [] }).s);
  assert.doesNotMatch(render({ title: 'logs' }).s, /ph-sub/);
});

test('sub is the three slots joined by the separator, empty slots left out, escaped', () => {
  const m = render({ title: 'logs', sub: ['Source', '', 'scope <a>', 'Kept 14 d'] }).s;
  assert.match(m, /<h1 class="ph-title" title="logs">logs<\/h1><span class="ph-sub" data-tip="Source · scope &lt;a&gt; · Kept 14 d" data-tip-overflow="">Source · scope &lt;a&gt; · Kept 14 d<\/span><\/header>/);
});
