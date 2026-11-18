import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './approval-head.js';

test('the target path is mono and joined, a tag follows, and the two judgements are status marks with words', () => {
  const m = render({ target: ['repo', 'apps/a.yaml'], tag: 'prod', grade: { label: 'founded', kind: 'ok', icon: 'shield-check' }, cause: { label: 'inferred', kind: 'warn' }, change: 'limit <256> → 384', reach: 'one-service' }).s;
  assert.match(m, /<div class="aph-t">repo \/ apps\/a.yaml<span class="aph-tag">prod<\/span><\/div>/);
  assert.match(m, /<div>limit &lt;256&gt; → 384<\/div>/);
  assert.match(m, /<div class="aph-g"><span class="sti-text warn"[^]*inferred<\/span><span class="sti-text ok"[^]*founded<\/span><span>one-service<\/span><\/div>/);
});

test('a code change is a wrapped code view instead of a line, and nothing given draws no judgement row', () => {
  const m = render({ target: 'a', code: { path: 'a.yaml', text: '-x\n+y', diff: true } }).s;
  assert.match(m, /data-c="code-block"/);
  assert.doesNotMatch(m, /aph-g/);
  assert.doesNotMatch(render({ target: 'a' }).s, /<div><\/div>/);
});
