import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './row-list.js';

test('rows are buttons with a lead, a title and sub, a meta, an end and the chevron; the arg defaults to the id', () => {
  const m = render({ rows: [
    { id: 'a', icon: 'search', title: 'Title <a>', sub: 'sub', meta: '09:42', end: 'END', action: 'x.open', arg: { page: 'a' } },
    { id: 'b', lead: 'LEAD', title: 'B', action: 'x.open' },
  ] }).s;
  assert.match(m, /^<div class="rwl" data-c="row-list">/);
  assert.equal((m.match(/<button type="button" class="rwl-row"/g) || []).length, 2);
  assert.match(m, /data-action="x.open" data-arg="\{&quot;page&quot;:&quot;a&quot;\}"/);
  assert.match(m, /data-arg="&quot;b&quot;"><span class="rwl-lead">LEAD<\/span>/);
  assert.match(m, /<span class="rwl-t"><b>Title &lt;a&gt;<\/b><span>sub<\/span><\/span><span class="rwl-m">09:42END<\/span>/);
  assert.match(m, /<span class="rwl-t"><b>B<\/b><\/span><span class="rwl-m"><\/span>/);
});
