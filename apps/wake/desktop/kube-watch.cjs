/*
 * 쿠버네티스 목록의 공유 캐시(메인 프로세스). 클러스터·종류·namespace마다 목록을 한 번 읽고(list) 그 resourceVersion부터 watch로 바뀐 것만 받는다.
 *   subscribe(id, kind, ns, sink) -> { snapshot: Promise<{ items, state }>, close() }   sink({ seq, changes?, resync?, items?, state })
 *   peek(id, kind, ns) -> 지금 맞는 목록(동기화된 캐시가 있을 때만, 없으면 null)   object(id, kind, ns, name) -> 캐시의 객체 하나 | undefined
 * - 같은 키의 화면·탭은 캐시 하나를 같이 쓴다(구독자 수를 셈). 구독자가 모두 떠나면 GRACE_MS 뒤 watch를 닫고 목록을 버린다.
 * - watch: allowWatchBookmarks(빈 시간에도 resourceVersion 갱신), timeoutSeconds(서버가 닫으면 마지막 resourceVersion부터 다시), 410 Gone이면 다시 목록.
 * - 구독자에게는 BATCH_MS마다 한 번, 그동안 바뀐 객체만(같은 객체는 마지막 것 하나) 보낸다. 쌓인 것이 QUEUE_CAP을 넘으면 버리고 전체 목록 한 번(resync).
 * - 실패: 흔든 지수 물러남(기본 1초에서 최대 60초, 기다림은 [d/2, d]). 다시 목록 읽기는 클러스터마다 동시 RELIST_LIMIT개(요청 문), 복구 뒤에는 이전 목록과의 차이만 보낸다.
 * - watch 권한이 없으면(403·405) 같은 목록을 POLL_MS마다 읽어 차이를 만든다: 출처 상태 source 'poll', reason 'watch_forbidden'.
 * - 이벤트는 가장 많은 종류라 메모리 상한(EVENT_CAP개, EVENT_WINDOW_MS 안의 것)만 둔다. 오래된 것부터 버린다.
 */
const { createRequestGate } = require('../../../kit/desktop/index.cjs');

const DEFAULTS = Object.freeze({ batchMs: 300, graceMs: 60_000, queueCap: 2000, pollMs: 10_000, timeoutSeconds: 290,
  backoffBaseMs: 1000, backoffMaxMs: 60_000, relistLimit: 2, eventCap: 10_000, eventWindowMs: 3 * 3_600_000 });

const keyOf = object => (object?.metadata?.namespace ? object.metadata.namespace + '/' : '') + (object?.metadata?.name ?? '');
const rvOf = object => object?.metadata?.resourceVersion ?? null;
const lastAt = e => Date.parse(e?.series?.lastObservedTime || e?.lastTimestamp || e?.eventTime || e?.firstTimestamp || e?.metadata?.creationTimestamp || '') || 0;
const statusError = (status, message = 'kubernetes watch failed') => Object.assign(new Error(message), { status, kind: status === 403 ? 'forbidden' : status === 410 ? 'gone' : 'unknown' });

/** 물러남 대기(ms): failures번째 실패 뒤 d = min(max, base·2^(failures-1)), 실제 기다림은 [d/2, d] 안의 임의 시점 */
function backoffDelay(failures, { backoffBaseMs = DEFAULTS.backoffBaseMs, backoffMaxMs = DEFAULTS.backoffMaxMs } = {}, random = Math.random) {
  const d = Math.min(backoffMaxMs, backoffBaseMs * 2 ** Math.max(0, failures - 1));
  return d * (0.5 + 0.5 * random());
}

/**
 * client(id) -> { request(method, path), watch(path, { signal, onEvent }) -> Promise(스트림 끝) }
 * definition(kind) -> Promise<{ path(ns), kind, api, cluster }>   listItems(response, def) -> 객체[]   clean(object, def) -> 객체(값 정리)
 * onChange(id, kind, ns, changes) 캐시가 받은 변화(허브의 이벤트 보관이 같은 watch를 쓴다)
 */
function createKubeWatch({ client, definition, listItems, clean = o => o, onChange = () => {}, random = Math.random,
  setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now, ...options }) {
  const o = { ...DEFAULTS, ...options };
  const entries = new Map();
  const relists = createRequestGate({ limit: o.relistLimit });
  const sleep = (entry, ms) => new Promise(resolve => {
    const timer = setTimer(() => { entry.sleeping = null; resolve(); }, ms); timer?.unref?.();
    entry.sleeping = () => { clearTimer(timer); entry.sleeping = null; resolve(); };
  });

  function stateOf(entry) {
    return { state: entry.state, source: entry.source, ...(entry.reason ? { reason: entry.reason } : {}),
      ...(entry.error ? { error: { kind: entry.error.kind || 'unknown', status: entry.error.status ?? null } } : {}),
      syncedAt: entry.syncedAt ? new Date(entry.syncedAt).toISOString() : null };
  }
  /* 구독자에게 보낼 변화: 같은 객체는 마지막 것만, 상한을 넘으면 버리고 전체 목록 한 번 */
  function push(entry, changes) {
    if (!changes.length) return;
    try { onChange(entry.id, entry.kind, entry.ns, changes); } catch { /* 보관 실패가 화면 갱신을 막지 않는다 */ }
    for (const sub of entry.subs) {
      if (!sub.live) continue;
      if (!sub.overflow) for (const change of changes) sub.pending.set(change.k, change);
      if (sub.pending.size > o.queueCap) { sub.pending.clear(); sub.overflow = true; }
      schedule(entry, sub);
    }
  }
  function touchState(entry) { for (const sub of entry.subs) if (sub.live) { sub.stateDirty = true; schedule(entry, sub); } }
  function schedule(entry, sub) {
    if (sub.timer) return;
    sub.timer = setTimer(() => flush(entry, sub), o.batchMs); sub.timer?.unref?.();
  }
  function flush(entry, sub) {
    sub.timer = null;
    if (!entry.subs.has(sub)) return;
    const payload = { seq: ++sub.seq, state: stateOf(entry) };
    if (sub.overflow) Object.assign(payload, { resync: true, items: [...entry.items.values()] });
    else if (sub.pending.size) payload.changes = [...sub.pending.values()];
    else if (!sub.stateDirty) { sub.seq--; return; }
    sub.pending = new Map(); sub.overflow = false; sub.stateDirty = false;
    try { sub.sink(payload); } catch { /* 닫힌 화면: 다음 정리 때 빠진다 */ }
  }

  /* 이벤트 메모리 상한: 창보다 오래된 것과 상한을 넘는 오래된 것을 버린다(상한의 10%를 넘을 때 한 번에 정리) */
  function trim(entry) {
    if (entry.kind !== 'events' || entry.items.size <= o.eventCap * 1.1) return [];
    const floor = now() - o.eventWindowMs, sorted = [...entry.items.entries()].sort((a, b) => lastAt(b[1]) - lastAt(a[1]));
    const dropped = sorted.filter(([, e], i) => i >= o.eventCap || lastAt(e) < floor).map(([k]) => k);
    for (const k of dropped) entry.items.delete(k);
    return dropped.map(k => ({ t: 'd', k }));
  }

  /* 목록 읽기(클러스터마다 동시 RELIST_LIMIT개): 이전 목록이 있으면 차이만 변화로 보낸다 */
  async function relist(entry) {
    const response = await relists.run(null, entry.id, () => client(entry.id).request('GET', entry.def.path(entry.ns === '_all' || entry.def.cluster ? '' : encodeURIComponent(entry.ns))));
    let items = listItems(response, entry.def);
    if (entry.kind === 'events' && items.length > o.eventCap) items = items.sort((a, b) => lastAt(b) - lastAt(a)).slice(0, o.eventCap);
    const next = new Map(items.map(item => [keyOf(item), item])), changes = [];
    if (entry.synced) {
      for (const [k, item] of next) if (rvOf(entry.items.get(k)) !== rvOf(item)) changes.push({ t: 'u', k, o: item });
      for (const k of entry.items.keys()) if (!next.has(k)) changes.push({ t: 'd', k });
    }
    const first = !entry.synced;
    entry.items = next; entry.rv = response?.metadata?.resourceVersion ?? null;
    entry.synced = true; entry.syncedAt = now(); entry.error = null;
    entry.state = 'ready';
    /* 첫 목록이 실패 뒤에 온 경우: 이미 빈 처음 그림을 받은 구독자에게는 전체 목록 한 번 */
    if (first) for (const sub of entry.subs) if (sub.live) { sub.overflow = true; schedule(entry, sub); }
    push(entry, changes); touchState(entry);
    entry.resolveReady();
  }
  function apply(entry, event) {
    const type = event?.type, object = event?.object;
    if (type === 'BOOKMARK') { if (rvOf(object)) entry.rv = rvOf(object); return; }
    if (type === 'ERROR') throw statusError(Number(object?.code) || 500, object?.message);
    if (!['ADDED', 'MODIFIED', 'DELETED'].includes(type) || !object?.metadata) return;
    const item = clean(object, entry.def), k = keyOf(item);
    if (rvOf(item)) entry.rv = rvOf(item);
    entry.syncedAt = now();
    if (type === 'DELETED') { if (entry.items.delete(k)) push(entry, [{ t: 'd', k }]); return; }
    entry.items.set(k, item);
    push(entry, [{ t: 'u', k, o: item }, ...trim(entry)]);
  }
  function watchPath(entry) {
    const base = entry.def.path(entry.ns === '_all' || entry.def.cluster ? '' : encodeURIComponent(entry.ns));
    const q = new URLSearchParams({ watch: '1', allowWatchBookmarks: 'true', resourceVersion: entry.rv, timeoutSeconds: String(o.timeoutSeconds) });
    return base + (base.includes('?') ? '&' : '?') + q;
  }
  async function run(entry) {
    while (!entry.stopped) {
      try {
        if (!entry.synced || !entry.rv || entry.source === 'poll') {
          if (entry.source === 'poll' && entry.synced) await sleep(entry, o.pollMs);
          if (entry.stopped) return;
          await relist(entry);
          entry.failures = 0;
          if (entry.source === 'poll') continue;
        }
        entry.controller = new AbortController();
        const began = now();
        await client(entry.id).watch(watchPath(entry), { signal: entry.controller.signal, onEvent: event => apply(entry, event) });
        /* 서버가 곧바로 닫는 스트림은 실패처럼 물러난다(빈 다시 연결이 이어지지 않게) */
        if (now() - began < 1000) { entry.failures++; await sleep(entry, backoffDelay(entry.failures, o, random)); } else entry.failures = 0;
      } catch (error) {
        if (entry.stopped) return;
        entry.controller?.abort();
        const status = Number(error?.status);
        if (status === 410 || error?.kind === 'gone') { entry.rv = null; continue; }
        /* watch 권한 없음(목록은 읽힘): 목록을 주기로 읽는다. 출처 상태가 그 사실을 말한다 */
        if (entry.synced && (status === 403 || status === 405) && entry.source === 'watch') { entry.source = 'poll'; entry.reason = 'watch_forbidden'; touchState(entry); continue; }
        entry.failures++; entry.error = error;
        entry.state = status === 403 || error?.kind === 'forbidden' ? 'forbidden' : entry.synced ? 'stale' : 'error';
        touchState(entry); entry.resolveReady();
        await sleep(entry, backoffDelay(entry.failures, o, random));
      }
    }
  }

  function entryOf(id, kind, ns) {
    const key = JSON.stringify([id, kind, ns]);
    let entry = entries.get(key);
    if (entry) return entry;
    entry = { key, id, kind, ns, def: null, items: new Map(), rv: null, synced: false, state: 'loading', source: 'watch', reason: null, error: null,
      syncedAt: null, subs: new Set(), failures: 0, stopped: false, stopTimer: null, controller: null, sleeping: null };
    entry.ready = new Promise(resolve => { entry.resolveReady = resolve; });
    entries.set(key, entry);
    Promise.resolve(definition(kind)).then(def => {
      if (!def) throw Object.assign(new Error('unknown kind: ' + kind), { kind: 'invalid_request' });
      entry.def = def; return run(entry);
    }).catch(error => { entry.error = error; entry.state = 'error'; entry.resolveReady(); });
    return entry;
  }
  function stop(entry) {
    entry.stopped = true; entry.controller?.abort(); entry.sleeping?.();
    for (const sub of entry.subs) clearTimer(sub.timer);
    entry.items.clear(); entries.delete(entry.key);
  }
  function release(entry, sub) {
    if (!entry.subs.delete(sub)) return;
    clearTimer(sub.timer);
    if (!entry.subs.size && !entry.stopTimer) { entry.stopTimer = setTimer(() => { entry.stopTimer = null; if (!entry.subs.size) stop(entry); }, o.graceMs); entry.stopTimer?.unref?.(); }
  }

  return {
    subscribe(id, kind, ns, sink) {
      const entry = entryOf(id, kind, ns || '_all');
      if (entry.stopTimer) { clearTimer(entry.stopTimer); entry.stopTimer = null; }
      const sub = { sink, pending: new Map(), overflow: false, stateDirty: false, timer: null, seq: 0, live: false };
      entry.subs.add(sub);
      /* 처음 그림은 목록 전체 한 번, 그 뒤로는 바뀐 것만 */
      const snapshot = entry.ready.then(() => {
        if (!entry.subs.has(sub)) return { items: [], seq: 0, state: stateOf(entry) };
        sub.live = true;
        return { items: [...entry.items.values()], seq: sub.seq, state: stateOf(entry) };
      });
      return { snapshot, close: () => release(entry, sub) };
    },
    /** 동기화된 캐시의 목록(오래됨·실패·읽는 중이면 null: 호출자가 서버에 직접 읽는다) */
    peek(id, kind, ns) {
      const entry = entries.get(JSON.stringify([id, kind, ns || '_all']));
      return entry?.synced && entry.state === 'ready' ? [...entry.items.values()] : null;
    },
    /** 캐시의 객체 하나: 그 namespace나 모든 namespace 캐시에서(동기화된 것만, 클러스터 범위 종류는 ns ''). 캐시가 없으면 undefined, 캐시에 없으면 null */
    object(id, kind, ns, name) {
      for (const scope of ns ? [ns, '_all'] : ['_all']) {
        const entry = entries.get(JSON.stringify([id, kind, scope]));
        if (entry?.synced && entry.state === 'ready') return entry.items.get((ns ? ns + '/' : '') + name) ?? null;
      }
      return undefined;
    },
    stats: () => [...entries.values()].map(e => ({ id: e.id, kind: e.kind, ns: e.ns, items: e.items.size, subs: e.subs.size, state: e.state, source: e.source })),
    /** 클러스터 하나(연결 해제) 또는 모두(앱 종료)의 watch를 닫는다 */
    close(id) { for (const entry of [...entries.values()]) if (id === undefined || entry.id === id) { clearTimer(entry.stopTimer); stop(entry); } },
  };
}

module.exports = { createKubeWatch, backoffDelay, DEFAULTS };
