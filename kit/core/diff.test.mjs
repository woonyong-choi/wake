/* Line diff: a line in both is led by a space, one only before by -, one only after by + */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineDiff } from './diff.js';

test('a changed line is - then +, the rest is kept', () => {
  assert.equal(lineDiff('a\nb\nc', 'a\nB\nc'), ' a\n-b\n+B\n c');
});
test('a text on one side only is all + or all -', () => {
  assert.equal(lineDiff('', 'x\ny'), '+x\n+y');
  assert.equal(lineDiff('x\n', ''), '-x');
});
