const test = require('node:test');
const assert = require('node:assert/strict');
const { prepare, present } = require('./background-run.cjs');

const fakeWin = () => { const calls = []; const rec = name => (...a) => calls.push([name, ...a]); return { calls, setOpacity: rec('setOpacity'), setIgnoreMouseEvents: rec('setIgnoreMouseEvents'), show: rec('show'), showInactive: rec('showInactive'), focus: rec('focus') }; };

test('a background run shows a window without the front or the focus, invisible and click-through', () => {
  const w = fakeWin();
  present(w, { focus: true }, { KIT_BACKGROUND: '1' });
  const names = w.calls.map(c => c[0]);
  assert.ok(names.includes('showInactive'));
  assert.ok(!names.includes('show') && !names.includes('focus'), 'never takes the front or the focus');
  assert.deepEqual(w.calls.find(c => c[0] === 'setOpacity'), ['setOpacity', 0]);
  assert.deepEqual(w.calls.find(c => c[0] === 'setIgnoreMouseEvents'), ['setIgnoreMouseEvents', true]);
});

test('a normal run shows the window at full opacity and focuses only when asked', () => {
  const w = fakeWin();
  present(w, {}, {});
  assert.deepEqual(w.calls.map(c => c[0]), ['setOpacity', 'show']);
  const f = fakeWin();
  present(f, { focus: true }, {});
  assert.deepEqual(f.calls.map(c => c[0]), ['setOpacity', 'show', 'focus']);
});

test('a background run on macOS is an accessory app; a normal run changes nothing', () => {
  const calls = [];
  const app = { setActivationPolicy: p => calls.push(p) };
  prepare(app, {});
  assert.deepEqual(calls, []);
  prepare(app, { KIT_BACKGROUND: '1' });
  assert.deepEqual(calls, process.platform === 'darwin' ? ['accessory'] : []);
});
