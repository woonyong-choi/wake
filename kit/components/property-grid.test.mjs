import test from 'node:test';
import assert from 'node:assert/strict';
import { render, css } from './property-grid.js';

/* A2-15: a long name (a label key, a selector) breaks after its separators (/ . - _ = , :), never inside a word */
test('property_names_wrap_after_their_separators_not_inside_a_word', () => {
  const out = render({ items: [{ id: 'a', label: 'app.example.io/name', value: 'team=payments,tier=web' }, { id: 'b', label: 'Ready', value: 'True' }] }).s;
  assert.match(out, /app\.<wbr>example\.<wbr>io\/<wbr>name/, 'the key breaks after its separators');
  assert.match(out, /team=<wbr>payments,<wbr>tier=<wbr>web/, 'a selector value too');
  assert.match(out, />Ready<\/dt>/, 'a plain word is left as it is');
  assert.doesNotMatch(out, /<script|&lt;wbr/, 'the text stays escaped');
  assert.equal(render({ items: [{ id: 'x', label: 'a/b', value: '<b>' }] }).s.includes('&lt;b&gt;'), true);
  assert.doesNotMatch(css, /\.pg-(label|value)\s*\{[^}]*overflow-wrap:\s*anywhere/, 'a word is not cut anywhere while a separator can take the break');
});
