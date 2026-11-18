import test from 'node:test';
import assert from 'node:assert/strict';
import { menuDef } from './select.js';

const opts = n => Array.from({ length: n }, (_, i) => ({ id: 'o' + i, label: 'o' + i }));

test('a short select list opens with the chosen row over the field and no search', () => {
  const d = menuDef({ options: opts(5), value: 'o2', action: 'x' });
  assert.equal(d.alignItem, true);
  assert.ok(!d.items.some(i => i.type === 'search'));
});

test('a list longer than the visible rows gets a search field on top and opens under the field; search overrides', () => {
  const d = menuDef({ options: opts(30), value: 'o2', action: 'x' });
  assert.equal(d.items[0].type, 'search');
  assert.equal(d.alignItem, false);
  assert.equal(d.items.filter(i => !i.type).length, 30);
  assert.ok(!menuDef({ options: opts(30), value: 'o2', action: 'x', search: false }).items.some(i => i.type === 'search'));
  assert.equal(menuDef({ options: opts(3), value: 'o2', action: 'x', search: true }).items[0].type, 'search');
});

test('a multi list with boxes and bulk: leading checkboxes, one select-all row over the rows, search when long', () => {
  const d = menuDef({ options: opts(30), value: ['o1', 'o2'], multi: true, boxes: true, bulk: true, action: 'x', key: 'k' });
  assert.deepEqual(d.items.slice(0, 2).map(i => i.type), ['search', 'bulk']);
  assert.equal(typeof d.items[1].label, 'string', 'one select-all row (tri-state), not two text links');
  assert.equal(d.items[1].items, undefined);
  const rows = d.items.filter(i => i.checkbox);
  assert.equal(rows.length, 30);
  assert.ok(rows.every(i => i.box));
  assert.deepEqual(rows.filter(i => i.checked).map(i => i.id), ['o1', 'o2']);
  assert.ok(!menuDef({ options: opts(3), value: [], multi: true, action: 'x' }).items.some(i => i.type === 'bulk' || i.box));
});
