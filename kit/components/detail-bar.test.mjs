import assert from 'node:assert/strict';
import test from 'node:test';
import { css } from './detail-bar.js';

test('a detail page follows its pane width and draws no edge of its own (it sits in its own pane beside the list)', () => {
  const body = css.split('\n').find(line => line.startsWith('html.is-detail body[data-kind="page"] {'));
  assert.ok(body);
  assert.doesNotMatch(body, /min-width/);
  assert.doesNotMatch(css, /::after/);
});
