import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './stale-line.js';

test('a stale line is a warning mark with its words and an optional link', () => {
  const m = render({ text: 'Old data <x>', action: { label: 'agent', action: 'x.go', arg: { page: 'agent' } } }).s;
  assert.match(m, /^<div class="stl" data-c="stale-line"><span class="sti-text warn"/);
  assert.match(m, /Old data &lt;x&gt;/);
  assert.match(m, /btn link[^>]*data-action="x.go"/);
  const idle = render({ text: 'Before', kind: 'idle', icon: 'clock' }).s;
  assert.match(idle, /sti-text idle/); assert.doesNotMatch(idle, /btn/);
});
