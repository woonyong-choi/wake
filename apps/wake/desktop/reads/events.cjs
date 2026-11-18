/*
 * 이벤트 7일 보관(spec/backend.md#F-BE-004): API 서버는 이벤트를 1시간만 둔다. 허브가 읽은 이벤트를 이 컴퓨터(허브 저장소 events 기록)에 7일 둔다.
 *   events.read { id, ns?, subjectUid? } -> { items(보관한 것 + 지금 것, UID마다 마지막), partial, retainedFrom }
 * 같은 UID는 count·마지막 시각이 바뀌었을 때만 새 줄을 쓴다. 보관 줄의 at은 그 이벤트의 마지막 시각(보관 기간의 기준).
 */
const DAY = 86_400_000;
const RETENTION_DAYS = 7;
const UID = /^[a-zA-Z0-9_.:-]{1,128}$/;
const NS = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/;
const KEEP = ['type', 'reason', 'message', 'note', 'count', 'firstTimestamp', 'lastTimestamp', 'eventTime', 'series', 'involvedObject', 'regarding', 'source', 'reportingController', 'reportingComponent', 'action'];

const lastAt = e => Date.parse(e.series?.lastObservedTime || e.lastTimestamp || e.eventTime || e.firstTimestamp || e.metadata?.creationTimestamp || '');
/** 보관할 모양(managedFields 없음): metadata의 이름·namespace·uid·생성 시각과 이벤트 필드 */
const slim = e => ({ apiVersion: 'v1', kind: 'Event', metadata: { name: e.metadata?.name, namespace: e.metadata?.namespace, uid: e.metadata?.uid, creationTimestamp: e.metadata?.creationTimestamp,
  ...(e.metadata?.resourceVersion ? { resourceVersion: e.metadata.resourceVersion } : {}) },
  ...Object.fromEntries(KEEP.filter(k => e[k] !== undefined).map(k => [k, e[k]])) });
const subjectOf = e => (e.involvedObject || e.regarding || {}).uid;

/** 이번에 읽은 이벤트 중 보관에 새로 쓸 것(처음 보거나 count·마지막 시각이 바뀜) */
function changedEvents(items, known) {
  return (items ?? []).filter(e => e?.metadata?.uid && Number.isFinite(lastAt(e))).filter(e => {
    const k = known.get(e.metadata.uid);
    return !k || k.at !== lastAt(e) || k.count !== (e.series?.count ?? e.count ?? null);
  });
}

/* 메모리 색인의 클러스터마다 상한(가장 오래된 것부터 버림): 보관 파일은 그대로 7일 */
const MEMORY_CAP = 50_000;
/** live(id, ns) -> 지금 이벤트(공유 watch 캐시, kube-watch.cjs) | null: 있으면 API 서버에 목록을 다시 묻지 않는다 */
function createEvents({ log, client, now = Date.now, live = () => null }) {
  const known = new Map();
  /* 보관 기록은 처음 한 번만 읽어 클러스터마다 UID 색인으로 둔다(읽을 때마다 파일 전체를 읽지 않음). 새로 쓰는 줄은 색인에도 넣는다 */
  let index = null;
  const byCluster = id => { if (!index.has(id)) index.set(id, new Map()); return index.get(id); };
  function load() {
    if (index) return;
    index = new Map();
    for (const row of log.list(r => r.at >= now() - RETENTION_DAYS * DAY)) if (row.event?.metadata?.uid) byCluster(row.cluster).set(row.event.metadata.uid, row);
    for (const rows of index.values()) for (const row of rows.values()) known.set(row.event.metadata.uid, { at: row.at, count: row.event.series?.count ?? row.event.count ?? null });
  }
  function retained(id) {
    const rows = byCluster(id), floor = now() - RETENTION_DAYS * DAY;
    for (const [uid, row] of rows) if (row.at < floor) rows.delete(uid);
    return [...rows.values()];
  }
  /** 바뀐 이벤트를 보관(처음 보거나 count·마지막 시각이 바뀐 것만). watch가 받은 변화도 여기로 온다 */
  function record(id, items) {
    load();
    for (const e of changedEvents((items ?? []).map(slim), known)) {
      known.set(e.metadata.uid, { at: lastAt(e), count: e.series?.count ?? e.count ?? null });
      const row = log.append({ at: lastAt(e), cluster: id, event: e }) ?? { at: lastAt(e), cluster: id, event: e };
      const rows = byCluster(id); rows.delete(e.metadata.uid); rows.set(e.metadata.uid, row);
      if (rows.size > MEMORY_CAP) rows.delete(rows.keys().next().value);
    }
  }
  /** 지금 이벤트: 공유 watch 캐시가 있으면 그것, 없으면 API 서버에서 읽어 바뀐 것을 보관 */
  async function capture(id, ns, subjectUid) {
    load();
    const cached = subjectUid ? null : live(id, ns);
    if (cached) return { items: cached.map(slim), partial: false };
    const q = new URLSearchParams({ limit: '500' });
    if (subjectUid) q.set('fieldSelector', 'involvedObject.uid=' + subjectUid);
    const list = await client(id).request('GET', `/api/v1${ns ? `/namespaces/${ns}` : ''}/events?${q}`);
    const items = (list.items ?? []).map(slim);
    record(id, items);
    return { items, partial: Boolean(list.metadata?.continue) };
  }
  async function read({ id, ns, subjectUid }) {
    const scope = ns && ns !== '_all' ? ns : '';
    if ((scope && !NS.test(scope)) || (subjectUid !== undefined && (typeof subjectUid !== 'string' || !UID.test(subjectUid)))) throw Object.assign(new Error('invalid events request'), { kind: 'invalid_request' });
    const current = await capture(id, scope, subjectUid);
    const by = new Map();
    for (const row of retained(id)) {
      const e = row.event;
      if ((scope && e.metadata?.namespace !== scope) || (subjectUid && subjectOf(e) !== subjectUid)) continue;
      by.set(e.metadata.uid, e);
    }
    for (const e of current.items) by.set(e.metadata.uid, e);
    return { items: [...by.values()], partial: current.partial, retainedFrom: new Date(now() - RETENTION_DAYS * DAY).toISOString() };
  }
  return { read, capture, record };
}

module.exports = { createEvents, changedEvents, slim, RETENTION_DAYS };
