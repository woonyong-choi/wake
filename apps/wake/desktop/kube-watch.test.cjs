const assert = require('node:assert/strict');
const test = require('node:test');
const { createKubeWatch, backoffDelay } = require('./kube-watch.cjs');

/* 가짜 시계: 타이머는 advance(ms)로만 흐른다 */
function clock() {
  let at = 0, seq = 0; const timers = new Map();
  const tick = () => new Promise(resolve => setImmediate(resolve));
  return {
    now: () => at,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { fn, due: at + ms }); return id; },
    clearTimer: id => { timers.delete(id); },
    async advance(ms) {
      const end = at + ms;
      for (;;) {
        await tick(); await tick();
        const next = [...timers.entries()].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        timers.delete(next[0]); at = next[1].due; next[1].fn();
      }
      at = end; await tick(); await tick();
    },
    flush: async () => { for (let i = 0; i < 6; i++) await tick(); },
  };
}
const pod = (name, rv, extra = {}) => ({ apiVersion: 'v1', kind: 'Pod', metadata: { name, namespace: 'payments', uid: 'u-' + name, resourceVersion: String(rv) }, ...extra });
const DEF = { kind: 'Pod', api: 'v1', path: ns => (ns ? `/api/v1/namespaces/${ns}/pods` : '/api/v1/pods') };
const EVENT_DEF = { kind: 'Event', api: 'v1', path: ns => (ns ? `/api/v1/namespaces/${ns}/events` : '/api/v1/events') };

/* 가짜 API 서버: 목록은 lists 차례대로, watch는 열린 스트림을 기록하고 테스트가 사건을 보낸다 */
function server({ lists = [[pod('a', 1)]], rv = '10', watchFails = null } = {}) {
  const requests = [], watches = [];
  let listIndex = 0, inflight = 0, peak = 0;
  return {
    requests, watches, peak: () => peak,
    client: () => ({
      async request(method, path) {
        requests.push(path); inflight++; peak = Math.max(peak, inflight);
        await new Promise(resolve => setImmediate(resolve));
        inflight--;
        const items = lists[Math.min(listIndex++, lists.length - 1)];
        return { apiVersion: 'v1', kind: 'PodList', metadata: { resourceVersion: typeof rv === 'function' ? rv() : rv }, items };
      },
      watch(path, { signal, onEvent }) {
        if (watchFails) return Promise.reject(watchFails);
        return new Promise((resolve, reject) => {
          const w = { path, signal, end: resolve, fail: reject, send: event => { try { onEvent(event); } catch (error) { reject(error); } } };
          signal.addEventListener('abort', () => resolve());
          watches.push(w);
        });
      },
    }),
  };
}
const make = (s, c, extra = {}) => createKubeWatch({ client: s.client, definition: async kind => (kind === 'events' ? EVENT_DEF : DEF),
  listItems: r => r.items, setTimer: c.setTimer, clearTimer: c.clearTimer, now: c.now, random: () => 0.5, ...extra });

test('watch_resumes_with_a_new_list_after_410_gone_and_watches_from_its_resource_version', async () => {
  const c = clock(), versions = ['10', '42'], s = server({ rv: () => versions.shift() ?? '42' });
  const w = make(s, c);
  const sub = w.subscribe('lab', 'pods', '_all', () => {});
  await sub.snapshot; await c.flush();
  assert.match(s.watches[0].path, /resourceVersion=10/);
  s.watches[0].send({ type: 'ERROR', object: { kind: 'Status', code: 410, message: 'too old resource version' } });
  await c.flush();
  assert.equal(s.requests.filter(p => p === '/api/v1/pods').length, 2, 'a 410 relists once');
  assert.match(s.watches.at(-1).path, /resourceVersion=42/);
  assert.match(s.watches.at(-1).path, /allowWatchBookmarks=true/);
  assert.match(s.watches.at(-1).path, /timeoutSeconds=\d+/);
});

test('bookmark_resource_version_is_where_the_next_watch_resumes_without_a_new_list', async () => {
  const c = clock(), s = server();
  const w = make(s, c);
  await w.subscribe('lab', 'pods', '_all', () => {}).snapshot; await c.flush();
  await c.advance(5000);
  s.watches[0].send({ type: 'BOOKMARK', object: { kind: 'Pod', metadata: { resourceVersion: '77' } } });
  s.watches[0].end();
  await c.flush();
  assert.equal(s.requests.length, 1, 'a normal end resumes the watch, it does not list again');
  assert.match(s.watches[1].path, /resourceVersion=77/);
});

test('reference_count_keeps_one_watch_for_many_subscribers_and_stops_it_after_the_grace_period', async () => {
  const c = clock(), s = server();
  const w = make(s, c, { graceMs: 60_000 });
  const a = w.subscribe('lab', 'pods', '_all', () => {}), b = w.subscribe('lab', 'pods', '_all', () => {});
  await a.snapshot; await b.snapshot; await c.flush();
  assert.equal(s.requests.length, 1); assert.equal(s.watches.length, 1);
  a.close(); await c.advance(120_000);
  assert.equal(s.watches[0].signal.aborted, false, 'one subscriber left keeps the watch');
  b.close(); await c.advance(30_000);
  const again = w.subscribe('lab', 'pods', '_all', () => {});
  assert.equal((await again.snapshot).items.length, 1);
  assert.equal(s.requests.length, 1, 'a page back inside the grace period reads the kept cache, not the server');
  again.close(); await c.advance(60_000);
  assert.equal(s.watches[0].signal.aborted, true, 'nobody subscribed after the grace period: the watch is closed');
  assert.deepEqual(w.stats(), []);
});

test('changes_reach_a_subscriber_as_one_coalesced_batch_of_diffs_per_window_not_the_list', async () => {
  const c = clock(), s = server({ lists: [[pod('a', 1), pod('b', 1), pod('c', 1), ...Array.from({ length: 50 }, (_, i) => pod('x' + i, 1))]] });
  const batches = [];
  const w = make(s, c, { batchMs: 300 });
  const sub = w.subscribe('lab', 'pods', '_all', p => batches.push(p));
  await sub.snapshot; await c.flush();
  for (let i = 2; i < 102; i++) for (const n of ['a', 'b', 'c']) s.watches[0].send({ type: 'MODIFIED', object: pod(n, i * 10 + n.charCodeAt(0)) });
  s.watches[0].send({ type: 'DELETED', object: pod('x1', 9999) });
  assert.equal(batches.length, 0, 'nothing is sent inside the window');
  await c.advance(300);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].changes.length, 4, '300 modifications of three objects and one delete are four changes');
  assert.equal(batches[0].items, undefined, 'a batch carries diffs, never the whole list');
  assert.equal(batches[0].changes.find(x => x.k === 'payments/a').o.metadata.resourceVersion, String(101 * 10 + 97));
  assert.deepEqual(batches[0].changes.find(x => x.k === 'payments/x1'), { t: 'd', k: 'payments/x1' });
  s.watches[0].send({ type: 'MODIFIED', object: pod('a', 5000) });
  await c.advance(299);
  assert.equal(batches.length, 1, 'at most one batch per window');
  await c.advance(1);
  assert.equal(batches.length, 2);
  assert.equal(batches[1].seq, 2);
});

test('a_subscriber_queue_over_its_cap_is_dropped_and_replaced_by_one_full_resync', async () => {
  const c = clock(), s = server();
  const batches = [];
  const w = make(s, c, { queueCap: 5 });
  await w.subscribe('lab', 'pods', '_all', p => batches.push(p)).snapshot; await c.flush();
  for (let i = 0; i < 40; i++) s.watches[0].send({ type: 'ADDED', object: pod('n' + i, 100 + i) });
  await c.advance(300);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].resync, true);
  assert.equal(batches[0].changes, undefined);
  assert.equal(batches[0].items.length, 41);
});

test('backoff_waits_are_jittered_inside_half_to_full_of_an_exponential_cap', () => {
  const o = { backoffBaseMs: 1000, backoffMaxMs: 60_000 };
  for (const [failures, d] of [[1, 1000], [2, 2000], [3, 4000], [7, 60_000], [20, 60_000]]) {
    assert.equal(backoffDelay(failures, o, () => 0), d / 2);
    assert.equal(backoffDelay(failures, o, () => 0.999999).toFixed(0), String(d));
  }
});

test('watch_errors_back_off_with_jitter_and_relists_are_capped_per_cluster', async () => {
  const c = clock(), s = server({ watchFails: Object.assign(new Error('connect refused'), { kind: 'unreachable' }) });
  const w = make(s, c, { relistLimit: 2 });
  const kinds = ['pods', 'a', 'b', 'c', 'd', 'e'];
  for (const kind of kinds) w.subscribe('lab', kind, 'payments', () => {});
  await c.flush();
  assert.equal(s.peak(), 2, 'at most two relists in flight for one cluster');
  const before = s.requests.length;
  await c.advance(400);
  assert.equal(s.requests.length, before, 'a failed watch waits (backoff) before trying again');
});

test('a_server_without_the_watch_verb_falls_back_to_polling_the_list_and_says_so', async () => {
  const c = clock();
  const s = server({ lists: [[pod('a', 1), pod('b', 1)], [pod('a', 2), pod('c', 1)]], watchFails: Object.assign(new Error('forbidden'), { status: 403, kind: 'forbidden' }) });
  const batches = [];
  const w = make(s, c, { pollMs: 10_000 });
  const first = await w.subscribe('lab', 'pods', '_all', p => batches.push(p)).snapshot;
  assert.equal(first.items.length, 2);
  await c.advance(300);
  assert.equal(batches.at(-1).state.source, 'poll');
  assert.equal(batches.at(-1).state.reason, 'watch_forbidden');
  await c.advance(10_000); await c.advance(300);
  const diff = batches.at(-1).changes;
  assert.deepEqual(diff.map(x => x.t + ' ' + x.k).sort(), ['d payments/b', 'u payments/a', 'u payments/c']);
  assert.equal(s.requests.length, 2);
});

test('events_kept_in_memory_stay_under_their_cap_with_50k_events', async () => {
  const c = clock();
  const ev = (i, at) => ({ apiVersion: 'v1', kind: 'Event', metadata: { name: 'e' + i, namespace: 'payments', resourceVersion: String(i), uid: 'u' + i }, lastTimestamp: new Date(at).toISOString(), message: 'x'.repeat(200) });
  const s = server({ lists: [[]] });
  const w = make(s, c, { eventCap: 10_000 });
  await w.subscribe('lab', 'events', '_all', () => {}).snapshot; await c.flush();
  const heap = process.memoryUsage().heapUsed, began = performance.now();
  for (let i = 0; i < 50_000; i++) s.watches[0].send({ type: 'ADDED', object: ev(i, 1_800_000_000_000 + i * 1000) });
  const took = performance.now() - began;
  const kept = w.stats()[0].items;
  assert.ok(kept <= 11_000, `kept ${kept} events`);
  assert.ok(w.peek('lab', 'events', '_all').every(e => Date.parse(e.lastTimestamp) >= 1_800_000_000_000 + 39_000 * 1000), 'the newest are kept');
  assert.ok(took < 5000, `50k events took ${took}ms`);
  assert.ok(process.memoryUsage().heapUsed - heap < 120 * 1048576, 'heap growth stays bounded');
});

test('a_namespace_of_5k_pods_lists_once_and_5k_changes_reach_the_page_as_one_diff_batch', async () => {
  const c = clock(), pods = Array.from({ length: 5000 }, (_, i) => pod('p' + i, 1, { spec: { containers: [{ name: 'app', image: 'x' }] } }));
  const s = server({ lists: [pods] }), batches = [];
  const w = make(s, c);
  const snap = await w.subscribe('lab', 'pods', 'payments', p => batches.push(p)).snapshot; await c.flush();
  assert.equal(snap.items.length, 5000);
  const began = performance.now();
  for (let i = 0; i < 5000; i++) s.watches[0].send({ type: 'MODIFIED', object: pod('p' + (i % 500), 100 + i) });
  await c.advance(300);
  assert.ok(performance.now() - began < 2000);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].changes.length, 500, 'only the 500 changed pods, not 5000');
  assert.equal(s.requests.length, 1);
});

test('a_first_list_that_succeeds_after_a_failure_reaches_an_early_subscriber_as_one_resync', async () => {
  const c = clock(); let fail = true;
  const s = server();
  const base = s.client();
  const w = createKubeWatch({ client: () => ({ ...base, request: (...a) => (fail ? Promise.reject(Object.assign(new Error('down'), { kind: 'unreachable' })) : base.request(...a)) }),
    definition: async () => DEF, listItems: r => r.items, setTimer: c.setTimer, clearTimer: c.clearTimer, now: c.now, random: () => 0.5 });
  const batches = [];
  const snap = await w.subscribe('lab', 'pods', '_all', p => batches.push(p)).snapshot;
  assert.equal(snap.state.state, 'error');
  fail = false;
  await c.advance(1000); await c.advance(300);
  assert.equal(batches.at(-1).resync, true);
  assert.equal(batches.at(-1).items.length, 1);
  assert.equal(batches.at(-1).state.state, 'ready');
});
