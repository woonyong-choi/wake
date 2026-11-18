import test from 'node:test';
import assert from 'node:assert/strict';
import { render as progress } from './progress.js';

test('progress draws reference lines at clamped positions and none without marks', () => {
  assert.match(progress({ value: 40, marks: [80] }).s, /class="prg-mark" style="--at:80%"/);
  assert.match(progress({ value: 40, marks: [250, -5] }).s, /--at:100%[\s\S]*--at:0%/);
  assert.doesNotMatch(progress({ value: 40 }).s, /prg-mark/);
});
