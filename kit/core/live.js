/*
 * How often a page that shows live system state reads it again. The interval lives in a token (--live-refresh-ms), never in a page.
 * Without a window (a test) or without the token a page does not poll: null.
 * A source's state (the common source state contract: ready, loading, empty, unconfigured, forbidden, partial, stale, error, unknown) is shown with
 * the status words a source chip already has (ok, limited, perm, idle, error, busy). One table for every screen and the main process.
 */
export function liveInterval(win = typeof window === 'undefined' ? null : window) {
  if (!win) return null;
  const value = parseFloat(win.getComputedStyle(win.document.documentElement).getPropertyValue('--live-refresh-ms'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/* stale and partial read as limited (a value is there but not current or not whole); unknown is still being checked */
export const SOURCE_VIEW = Object.freeze({ ready: 'ok', empty: 'ok', loading: 'busy', unknown: 'busy', partial: 'limited', stale: 'limited', forbidden: 'perm', unconfigured: 'idle', error: 'error' });
/** source state -> source chip state; a state outside the contract is an error, never ok */
export const sourceView = state => SOURCE_VIEW[state] ?? 'error';

/**
 * One gate in front of a server: identical requests in flight share one promise (same key), and at most `limit` run at once per lane
 * (a lane is one server); the rest wait in order. A null key is never shared (a request with its own cancel signal).
 *   run(key, lane, fn) -> Promise   stats() -> { active, waiting, shared }
 */
export function createRequestGate({ limit = 6 } = {}) {
  const inflight = new Map(), lanes = new Map();
  let shared = 0;
  const laneOf = name => { let lane = lanes.get(name); if (!lane) lanes.set(name, lane = { active: 0, queue: [] }); return lane; };
  function admit(name, fn) {
    const lane = laneOf(name);
    return new Promise((resolve, reject) => {
      const start = () => {
        lane.active++;
        let result;
        try { result = Promise.resolve(fn()); } catch (error) { result = Promise.reject(error); }
        result.then(resolve, reject).finally(() => {
          lane.active--;
          const next = lane.queue.shift();
          if (next) next(); else if (!lane.active) lanes.delete(name);
        });
      };
      if (lane.active < limit) start(); else lane.queue.push(start);
    });
  }
  function run(key, name, fn) {
    if (key == null) return admit(name, fn);
    const known = inflight.get(key);
    if (known) { shared++; return known; }
    const promise = admit(name, fn).finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }
  const stats = () => ({ active: [...lanes.values()].reduce((n, l) => n + l.active, 0), waiting: [...lanes.values()].reduce((n, l) => n + l.queue.length, 0), shared });
  return { run, stats };
}

/**
 * A live refresh that never piles up: the next read is timed only after the previous one settled (a tick while one is in flight is skipped),
 * a document nobody can see does not read (it reads once, jittered, when shown again), and the interval grows when reads fail
 * (doubling up to `maxFactor`) or are slow (at least `slowFactor` times the last read's duration). The first read and every retry are
 * jittered (a random point in the later half of the wait) so many pages, tabs or windows that start or recover together do not read together.
 *   read({ recovering }) -> Promise; recovering is true on the first read after a failure
 *   start() stop() tick() -> whether a read started   delay() -> the wait before the next read (ms)
 */
export function createLivePoll({ every, read, visible = () => !globalThis.document?.hidden, random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout,
  maxFactor = 8, slowFactor = 4, listen = globalThis.document?.addEventListener?.bind(globalThis.document), unlisten = globalThis.document?.removeEventListener?.bind(globalThis.document) }) {
  let timer = null, running = false, busy = false, failures = 0, took = 0, owed = false, wait = 0;
  const jitter = ms => ms * (0.5 + 0.5 * random());
  const delay = () => Math.min(every * maxFactor, Math.max(every * 2 ** Math.min(failures, Math.log2(maxFactor)), took * slowFactor));
  /* a waiting poll never keeps a process alive by itself (Node timers: unref) */
  const arm = ms => { clearTimer(timer); wait = ms; timer = running ? setTimer(() => { timer = null; tick(); }, ms) : null; timer?.unref?.(); };
  function tick() {
    if (!running || busy) return false;
    if (!visible()) { owed = true; return false; }
    owed = false; busy = true;
    const began = Date.now(), recovering = failures > 0;
    let result;
    try { result = Promise.resolve(read({ recovering })); } catch (error) { result = Promise.reject(error); }
    result.then(() => { failures = 0; }, () => { failures++; }).finally(() => {
      took = Date.now() - began; busy = false;
      arm(failures ? jitter(delay()) : delay());
    });
    return true;
  }
  const shown = () => { if (running && owed && visible() && !busy) arm(jitter(Math.min(every, 1000))); };
  return {
    start() { if (running) return; running = true; listen?.('visibilitychange', shown); arm(jitter(every)); },
    stop() { running = false; clearTimer(timer); timer = null; unlisten?.('visibilitychange', shown); },
    tick, delay: () => wait,
  };
}

/**
 * A pushed live refresh: the page reads again when its source says something changed (notify), not on a clock. Notices in one task are
 * one read; notices while a read is in flight are one more read after it; a document nobody can see does not read (it reads once when
 * shown again). An optional slow heartbeat (`every`: ms, or a function returning ms or null) reads what nobody pushes (a clock-relative age,
 * a polled side source); it doubles after failures up to `maxFactor`.
 *   start() stop() notify() tick() -> whether a read started
 */
export function createLiveFeed({ read, every = null, visible = () => !globalThis.document?.hidden, random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout,
  maxFactor = 8, listen = globalThis.document?.addEventListener?.bind(globalThis.document), unlisten = globalThis.document?.removeEventListener?.bind(globalThis.document) }) {
  let running = false, busy = false, changed = false, owed = false, failures = 0, soon = null, beat = null;
  const interval = () => { const ms = typeof every === 'function' ? every() : every; return Number.isFinite(ms) && ms > 0 ? ms * Math.min(maxFactor, 2 ** failures) : null; };
  const unref = t => { t?.unref?.(); return t; };
  function heartbeat() { clearTimer(beat); beat = null; const ms = running ? interval() : null; if (ms) beat = unref(setTimer(() => { beat = null; changed = true; tick(); }, ms * (0.75 + 0.25 * random()))); }
  function tick() {
    if (!running || busy) return false;
    if (!visible()) { owed = true; return false; }
    owed = false; changed = false; busy = true;
    let result;
    try { result = Promise.resolve(read()); } catch (error) { result = Promise.reject(error); }
    result.then(() => { failures = 0; }, () => { failures++; }).finally(() => {
      busy = false;
      if (changed && running) schedule(); else heartbeat();
    });
    return true;
  }
  function schedule() { if (soon || !running) return; soon = unref(setTimer(() => { soon = null; tick(); }, 0)); }
  const shown = () => { if (running && owed && visible() && !busy) { clearTimer(soon); soon = unref(setTimer(() => { soon = null; tick(); }, 0)); } };
  return {
    start() { if (running) return; running = true; listen?.('visibilitychange', shown); heartbeat(); },
    stop() { running = false; clearTimer(soon); clearTimer(beat); soon = beat = null; unlisten?.('visibilitychange', shown); },
    notify() { changed = true; if (!running || busy) return; if (!visible()) { owed = true; return; } schedule(); },
    tick,
  };
}
