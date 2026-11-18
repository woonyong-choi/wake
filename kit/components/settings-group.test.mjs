import test from 'node:test';
import assert from 'node:assert/strict';
import { render as group } from './settings-group.js';

test('a round settings group is the reference wide round widget: the same rows in a bigger round card', () => {
  assert.match(group({ children: 'x', round: true }).s, /class="sg-card round"/);
  assert.match(group({ children: 'x' }).s, /class="sg-card"/);
});

test('a settings row can carry a help mark after its title, its text is the tip', async () => {
  const { render } = await import('./settings-row.js');
  const m = render({ title: 'alpha', help: 'beta tip', icon: 'circle-info' }).s;
  assert.match(m, /sr-help" data-tip="beta tip"/);
  assert.doesNotMatch(render({ title: 'alpha' }).s, /sr-help/);
});

test('an empty card can take the body cards round shape; without the option it keeps its own', async () => {
  const { render } = await import('./empty-state.js');
  assert.match(render({ icon: 'search', title: 'x', variant: 'card', round: true }).s, /class="empty card round"/);
  assert.match(render({ icon: 'search', title: 'x', variant: 'card' }).s, /class="empty card"/);
});
