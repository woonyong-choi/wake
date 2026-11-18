import test from 'node:test';
import assert from 'node:assert/strict';
import { liveInterval, sourceView, SOURCE_VIEW } from './live.js';

const windowWith = value => ({ document: { documentElement: {} }, getComputedStyle: () => ({ getPropertyValue: () => value }) });

test('the refresh interval comes from the token; no window or token means no polling', () => {
  assert.equal(liveInterval(windowWith(String(10000))), 10000);
  assert.equal(liveInterval(windowWith('')), null);
  assert.equal(liveInterval(windowWith(String(0))), null);
  assert.equal(liveInterval(null), null);
});

test('a source state shows as a source chip state; unknown is being checked and nothing outside the contract shows as connected', () => {
  assert.deepEqual(Object.keys(SOURCE_VIEW).sort(), ['empty', 'error', 'forbidden', 'loading', 'partial', 'ready', 'stale', 'unconfigured', 'unknown']);
  assert.deepEqual(['ready', 'stale', 'forbidden', 'unconfigured', 'unknown'].map(sourceView), ['ok', 'limited', 'perm', 'idle', 'busy']);
  assert.equal(sourceView('ok'), 'error');
  assert.equal(sourceView(undefined), 'error');
});

/* refresh path load: shared identical requests, a concurrency cap, no tick while one is in flight, a hidden document pauses, jittered retries and backoff */
const deferred = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

test('identical requests in flight share one promise; a settled request is read again', async () => {
  const { createRequestGate } = await import('./live.js');
  const gate = createRequestGate({ limit: 6 }), d = deferred();
  let calls = 0;
  const fn = () => { calls++; return d.promise; };
  const a = gate.run('list items', 'c1', fn), b = gate.run('list items', 'c1', fn);
  assert.equal(a, b);
  assert.equal(calls, 1);
  d.resolve(["item"]);
  assert.deepEqual(await b, ["item"]);
  await gate.run('list items', 'c1', async () => { calls++; return []; });
  assert.equal(calls, 2);
});

test('at most `limit` requests run at once per server; another server is not held back', async () => {
  const { createRequestGate } = await import('./live.js');
  const gate = createRequestGate({ limit: 3 }), waits = [];
  let active = 0, peak = 0;
  const fn = () => { active++; peak = Math.max(peak, active); const d = deferred(); waits.push(d); return d.promise.finally(() => { active--; }); };
  const all = Array.from({ length: 10 }, (_, i) => gate.run(`k${i}`, 'c1', fn));
  let other = false; void gate.run('x', 'c2', async () => { other = true; });
  await flush();
  assert.equal(peak, 3);
  assert.equal(other, true);
  while (waits.length) { waits.shift().resolve(); await flush(); }
  await Promise.all(all);
  assert.equal(peak, 3);
});

const fakeClock = () => { const timers = []; return { timers, setTimer: (f, ms) => { const t = { f, ms }; timers.push(t); return t; }, clearTimer: t => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }, fire: () => timers.shift()?.f() }; };

test('a poll never starts while the previous read of it is in flight, and times the next only after it settled', async () => {
  const { createLivePoll } = await import('./live.js');
  const clock = fakeClock(), d = deferred();
  let reads = 0;
  const poll = createLivePoll({ every: 10_000, read: () => { reads++; return d.promise; }, visible: () => true, random: () => 1, ...clock, listen: null });
  poll.start();
  clock.fire();
  assert.equal(reads, 1);
  assert.equal(poll.tick(), false);
  assert.equal(reads, 1);
  assert.equal(clock.timers.length, 0, 'no next read is queued while one is in flight');
  d.resolve(); await flush();
  assert.equal(clock.timers.length, 1);
  poll.stop();
});

test('a hidden document does not read; it reads once, jittered, when shown again', async () => {
  const { createLivePoll } = await import('./live.js');
  const clock = fakeClock();
  let hidden = true, reads = 0, onShow;
  const poll = createLivePoll({ every: 10_000, read: async () => { reads++; }, visible: () => !hidden, random: () => 0, ...clock, listen: (_, f) => { onShow = f; } });
  poll.start(); clock.fire();
  assert.equal(reads, 0);
  hidden = false; onShow();
  assert.ok(poll.delay() >= 500 && poll.delay() <= 1000, `resume wait ${poll.delay()}`);
  clock.fire(); await flush();
  assert.equal(reads, 1);
  poll.stop();
});

test('the first read and retries are jittered inside bounds; failures back off up to the cap; slow reads stretch the interval', async () => {
  const { createLivePoll } = await import('./live.js');
  for (const r of [0, 1]) {
    const clock = fakeClock(), seen = [];
    let fail = true;
    const poll = createLivePoll({ every: 1000, maxFactor: 8, read: () => (fail ? Promise.reject(new Error('down')) : Promise.resolve()), visible: () => true, random: () => r, ...clock, listen: null });
    poll.start();
    assert.equal(poll.delay(), 1000 * (0.5 + 0.5 * r), 'first read jittered');
    for (let i = 0; i < 6; i++) { clock.fire(); await flush(); seen.push(poll.delay()); }
    const cap = [2, 4, 8, 8, 8, 8].map(f => f * 1000);
    seen.forEach((ms, i) => assert.ok(ms >= cap[i] * 0.5 && ms <= cap[i], `retry ${i + 1}: ${ms} within [${cap[i] / 2}, ${cap[i]}]`));
    fail = false; clock.fire(); await flush();
    assert.equal(poll.delay(), 1000, 'back to the interval after recovery');
    poll.stop();
  }
  const clock = fakeClock(); let now = 0; const realNow = Date.now; Date.now = () => now;
  try {
    const poll = createLivePoll({ every: 1000, slowFactor: 4, read: async () => { now += 600; }, visible: () => true, random: () => 1, ...clock, listen: null });
    poll.start(); clock.fire(); await flush();
    assert.equal(poll.delay(), 2400, 'a 600ms read waits 4x its duration');
    poll.stop();
  } finally { Date.now = realNow; }
});

/* push path: a change notice reads once per burst, never while a read is in flight (one more after it), never while hidden */
test('a live feed reads once per burst of change notices, once more after an in-flight read, and not while hidden', async () => {
  const { createLiveFeed } = await import('./live.js');
  const timers = new Map(); let seq = 0, hidden = false, shown = null;
  const setTimer = (fn, ms) => { const id = ++seq; timers.set(id, { fn, ms }); return id; }, clearTimer = id => timers.delete(id);
  const run = () => { const due = [...timers.entries()].filter(([, t]) => t.ms === 0); for (const [id, t] of due) { timers.delete(id); t.fn(); } };
  let reads = 0, d = deferred();
  const feed = createLiveFeed({ read: () => { reads++; return d.promise; }, visible: () => !hidden, setTimer, clearTimer, random: () => 0.5,
    listen: (type, f) => { shown = f; }, unlisten: () => { shown = null; } });
  feed.start();
  for (let i = 0; i < 5; i++) feed.notify();
  run(); await flush();
  assert.equal(reads, 1, 'five notices in one task are one read');
  feed.notify(); feed.notify(); run(); await flush();
  assert.equal(reads, 1, 'no read starts while one is in flight');
  d.resolve(); d = deferred(); await flush(); run(); await flush();
  assert.equal(reads, 2, 'the notices that came during the read are one more read after it');
  d.resolve(); await flush();
  hidden = true; feed.notify(); run(); await flush();
  assert.equal(reads, 2, 'a hidden document does not read');
  hidden = false; shown(); for (const [id, t] of [...timers]) { timers.delete(id); t.fn(); } await flush();
  assert.equal(reads, 3, 'shown again: one read for what it missed');
  feed.stop(); feed.notify(); run(); await flush();
  assert.equal(reads, 3);
});

test('a live feed without notices reads on its slow heartbeat only', async () => {
  const { createLiveFeed } = await import('./live.js');
  const timers = []; let reads = 0;
  const feed = createLiveFeed({ every: 60000, read: async () => { reads++; }, visible: () => true, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {}, random: () => 0.5, listen() {}, unlisten() {} });
  feed.start();
  assert.ok(timers.some(t => t.ms >= 30000), 'the heartbeat waits a long interval');
  assert.equal(reads, 0, 'starting does not read: the first drawing already did');
});
