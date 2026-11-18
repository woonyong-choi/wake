import test from 'node:test';
import assert from 'node:assert/strict';
import { render, SLOTS } from './list-toolbar.js';

const order = m => [...m.matchAll(/data-slot="(\w+)"/g)].map(x => x[1]);

test('slots stand in one order whatever order they are given in, left then right', () => {
  const m = render({ view: 'V', time: 'T', filters: 'F', search: 'S', scope: 'C' }).s;
  assert.deepEqual(order(m), ['scope', 'search', 'filters', 'time', 'view']);
  assert.match(m, /^<div class="ltb slots" data-c="list-toolbar"><div class="ltb-s">.*data-slot="filters".*<\/div><div class="ltb-e"><div class="ltb-slot" data-slot="time">/s);
  assert.deepEqual(SLOTS, { start: ['scope', 'search', 'filters'], end: ['time', 'view'] });
});

test('an absent slot is left out and the others keep their places; no right group without its slots', () => {
  assert.deepEqual(order(render({ search: 'S', time: 'T' }).s), ['search', 'time']);
  const left = render({ scope: 'C', filters: 'F' }).s;
  assert.deepEqual(order(left), ['scope', 'filters']);
  assert.doesNotMatch(left, /ltb-e/);
  assert.deepEqual(order(render({ view: 'V' }).s), ['view']);
});

test('the older start/end form draws as it did', () => {
  assert.equal(render({ start: 'A', end: 'B' }).s, '<div class="ltb" data-c="list-toolbar"><div class="ltb-s">A</div><div class="ltb-e">B</div></div>');
  assert.equal(render({ start: 'A', fill: true }).s, '<div class="ltb fill" data-c="list-toolbar"><div class="ltb-s">A</div><div class="ltb-e"></div></div>');
});
