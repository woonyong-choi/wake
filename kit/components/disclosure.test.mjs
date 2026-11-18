import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './disclosure.js';

test('the card variant has a head with closed and open titles and the pill, and grows in place', () => {
  const m = render({ style: 'card', label: 'sleep', activeLabel: 'sleepon', end: 'on', activeEnd: 'off', children: 'X', open: false }).s;
  assert.match(m, /dsc dsc-card/);
  assert.match(m, /on-closed">sleep</);
  assert.match(m, /on-open">sleepon</);
  assert.match(m, /on-open">off</);
  assert.match(m, /aria-expanded="false"/);
});

test('with an action the page owns the state: the control carries data-action and the open flag renders', () => {
  const m = render({ style: 'caret', label: 'adv', children: 'X', open: true, action: 'p.adv' }).s;
  assert.match(m, /data-action="p.adv"/);
  assert.match(m, /aria-expanded="true"/);
});
