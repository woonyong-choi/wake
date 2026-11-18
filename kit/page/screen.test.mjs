import test from 'node:test';
import assert from 'node:assert/strict';
import { createScreen } from './screen.js';

const decl = () => ({
  state: { kind: 'all', q: '', page: 1, range: { preset: '1h' }, tags: ['a'] },
  ai: ['kind', 'range'],
  search: { key: 'q', scope: 'list', reset: { page: 1 } },
  range: { key: 'range', retention: 86400 },
  set: { 'x.kind': ['kind', 'pick', { page: 1 }], 'x.page': ['page', 'page'], 'x.typed': ['q', 'text'], 'x.custom': ['kind', a => a.arg.toUpperCase()] },
});

test('the state starts from the declared defaults (a copy) and the declared actions set one key each with its reset', () => {
  const d = decl(), draws = [];
  const s = createScreen(d, () => draws.push(1));
  assert.deepEqual(s.state(), d.state);
  s.state().tags.push('changed');
  assert.deepEqual(d.state.tags, ['a']); // the declaration is never written to
  s.actions['x.page']({ arg: 3 });
  assert.equal(s.state().page, 3);
  s.actions['x.kind']({ arg: { value: 'warn' } });
  assert.deepEqual([s.state().kind, s.state().page], ['warn', 1]);
  s.actions['x.typed']({ value: 'oom' });
  assert.equal(s.state().q, 'oom');
  s.actions['x.custom']({ arg: 'err' });
  assert.equal(s.state().kind, 'ERR');
  assert.equal(draws.length, 4);
});

test('the built-in search and range actions set the declared keys', () => {
  const s = createScreen(decl());
  s.actions['x.page']({ arg: 4 });
  s.actions['kit.screen.search']({ value: 'api' });
  assert.deepEqual([s.state().q, s.state().page], ['api', 1]);
  s.actions['kit.screen.range']({ from: 10, to: 20, preset: null, live: false });
  assert.deepEqual(s.state().range, { from: 10, to: 20, live: false });
  s.actions['kit.screen.range']({ from: 1, to: 2, preset: '6h', live: true });
  assert.deepEqual(s.state().range, { preset: '6h' });
});

test('the AI sets only its keys, each remembers its value before the AI, and a reset puts one or all back', () => {
  const s = createScreen(decl());
  assert.deepEqual(s.setState({ kind: 'error', page: 9, q: 'oom' }, { ai: true }), ['kind', 'q']);
  assert.equal(s.state().page, 1);
  s.setState({ kind: 'warn' }, { ai: true });
  assert.deepEqual(s.aiApplied(), [{ key: 'kind', value: 'warn', before: 'all' }, { key: 'q', value: 'oom', before: '' }]);
  assert.equal(s.resetAi('kind'), true);
  assert.equal(s.state().kind, 'all');
  assert.deepEqual(s.aiApplied().map(x => x.key), ['q']);
  s.actions['kit.screen.ai-reset']({ arg: 'q' });
  assert.equal(s.state().q, '');
  assert.equal(s.resetAi('q'), false);
  s.setState({ kind: 'x', range: { preset: '24h' } }, { ai: true });
  assert.equal(s.resetAi(), true);
  assert.deepEqual([s.state().kind, s.state().range], ['all', { preset: '1h' }]);
  assert.deepEqual(s.aiApplied(), []);
});

test('a person sets any key, and a set entry that cannot work fails at once', () => {
  const s = createScreen(decl());
  s.setState({ page: 5 });
  assert.equal(s.state().page, 5);
  assert.throws(() => createScreen({ state: {}, set: { 'x.bad': ['k', 'nope'] } }), TypeError);
  assert.throws(() => createScreen(null), TypeError);
});
