import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './icon-stack.js';

const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, name: 'name-' + id, icon: 'search', status: ['ok', 'warn', 'error', 'idle', undefined, 'bogus'][i] }));

test('marks beyond max fold into one +N mark that names them', () => {
  const m = render({ items, max: 3 }).s;
  assert.equal(m.match(/class="ist-i"/g).length, 3);
  assert.match(m, /<span class="ist-more" data-tip="name-d, name-e, name-f"[^>]*>\+3<\/span>/);
  assert.doesNotMatch(render({ items: items.slice(0, 2) }).s, /ist-more/);
});

test('a mark carries a status dot only for a known state, an image or an initial without an icon', () => {
  const m = render({ items, max: 6 }).s;
  for (const s of ['ok', 'warn', 'error', 'idle']) assert.match(m, new RegExp(`class="ist-s ${s}"`));
  assert.equal(m.match(/class="ist-s /g).length, 4);
  assert.match(render({ items: [{ id: 'x', name: 'zeta' }] }).s, /<span class="ist-c">z<\/span>/);
  assert.match(render({ items: [{ id: 'x', name: 'zeta', src: 'a.png' }] }).s, /<img src="a.png" alt="">/);
  assert.match(render({ items, size: 'sm', label: 'L' }).s, /class="ist sm" data-c="icon-stack" role="group" aria-label="L"/);
});

test('a brand mark sits on the white disc, alone or in the row', async () => {
  const { disc } = await import('./icon-stack.js');
  assert.match(render({ items: [{ id: 'g', name: 'gamma', brand: 'search', status: 'ok' }] }).s, /<span class="ist-c disc"><svg class="wi"[^>]*data-icon="search"/);
  assert.match(disc('search').s, /^<span class="ist-disc" aria-hidden="true"><svg/);
  assert.match(disc('search', 'lg').s, /style="--ist-size:var\(--tile\)"/);
});

test('a connection row names its state next to the icon in the state colour, and leads with a brand mark at 24', async () => {
  const cr = await import('./connection-row.js');
  const m = cr.render({ id: 'c', brand: 'search', title: 't', kind: 'ok', state: 's-ok' }).s;
  assert.match(m, /<span class="cr-state" data-kind="ok">s-ok<\/span><span class="sti ok" data-c="status-icon" aria-hidden="true">/);
  assert.match(m, /<span class="ist-disc" style="--ist-size:var\(--control-h-xs\)" aria-hidden="true">/);
  const quiet = cr.render({ id: 'c', icon: 'search', title: 't', kind: 'error', state: 's-err', showState: false }).s;
  assert.doesNotMatch(quiet, /cr-state/);
  assert.match(quiet, /class="sti error"[^>]*role="img" aria-label="s-err"/);
});
