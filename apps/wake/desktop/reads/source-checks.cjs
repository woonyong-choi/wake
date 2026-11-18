/*
 * 출처 상태(공통 계약 v1 SourceState, spec/architecture.md#F-ARC-U01): 허브가 출처(prometheus, alertmanager, loki, kubernetes, tempo, argocd)를 읽을 때마다 결과를 남긴다.
 *  읽기는 두 가지다. 데이터 읽기(화면·주기 수집이 실제 값을 받음)와 연결 확인(hub.sources가 출처가 응답하는지만 봄).
 *  연결 확인 성공은 데이터가 새로 관측됐다는 근거가 아니므로 lastSuccessAt·observedAt(데이터 신선도)을 바꾸지 않는다.
 *  기록: { at, start, cluster, source, ok, ms, error?, probe? } — 허브 저장소(hub-store.cjs)의 source-checks 기록, 90일 보관. 같은 출처·종류·결과는 1분에 한 줄.
 *  state(cluster, source) -> SourceState v1:
 *    { id, cluster, target: { uid, ref }, state: ready|unconfigured|forbidden|stale|error|unknown, error,
 *      observedAt(마지막으로 성공한 데이터 읽기의 요청 시각), receivedAt(데이터·연결 확인 중 마지막 응답·실패를 받은 시각), lastSuccessAt(마지막 데이터 읽기 성공을 받은 시각),
 *      checkedAt(마지막 연결 확인 시각), collectionIntervalMs, retention, coverage, reasons, last(ms), at(ms), previous?(대상이 바뀐 뒤: 이전 대상과 그 마지막 성공) }
 *    시각은 ISO8601 UTC. null인 필드는 reasons[필드]에 이유가 있다.
 *    상태: 마지막 시도(데이터·확인)가 실패면 그 실패(error·forbidden·unconfigured). 성공이면,
 *      주기 수집 중인 출처(collectionIntervalMs)는 마지막 데이터 성공이 없거나 주기의 2배보다 오래되면 stale(연결은 되지만 값이 과거값).
 *      확인 기록(coverage)이 없으면 unknown(정상으로 올리지 않음). 나머지는 ready.
 *  checks(cluster, source) -> 도구 상세의 응답 지연(6시간)·최근 오류(24시간): { at(ISO), samples: [{ at, ms|null }], errors: [{ at, text }] }
 */
const HOUR = 3_600_000, DAY = 24 * HOUR, RETENTION_DAYS = 90;
const SOURCES = ['prometheus', 'alertmanager', 'loki', 'kubernetes', 'tempo', 'argocd'];
const KNOWN = new Set(SOURCES);
const STALE_FACTOR = 2;
/* 화면으로 보내는 오류 코드: 공통 계약 v1의 최상위 오류와 기존 세부 코드(http_502 등). 그 밖은 unavailable */
const CODE = /^(unconfigured|forbidden|timeout|unavailable|invalid_request|not_found|partial|stale|storage_error|cancelled|unsupported|connection|target|query_failed|invalid_response|response_too_large|identity_changed|http_\d{3})$/;

/* 화면으로 보내는 원인 코드(원문 메시지는 주소·토큰이 섞일 수 있어 보내지 않는다) */
function errorCode(error) {
  if (error?.name === 'TimeoutError' || error?.cause?.name === 'TimeoutError') return 'timeout';
  if (typeof error?.kind === 'string' && CODE.test(error.kind)) return error.kind;
  if (error?.status === 401 || error?.status === 403) return 'forbidden';
  if (Number.isInteger(error?.status)) return 'http_' + error.status;
  return typeof error?.kind === 'string' ? 'unavailable' : 'connection';
}

const iso = ms => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/** log: 허브 저장소의 기록 하나({ append, list }, 보관 7일 인스턴스) */
function createSourceStates({ log, now = Date.now }) {
  const recent = (filter = () => true) => log.list(row => row.at >= now() - RETENTION_DAYS * DAY && filter(row)).sort((a, b) => a.at - b.at);
  const latest = new Map(), written = new Map(), intervals = new Map(), targets = new Map(), released = new Map(), identities = new Map();
  const keyOf = (cluster, source) => JSON.stringify([cluster, source]);
  /* 관측은 그때의 대상 UID(row.target)와 함께 보관한다. 다른 대상의 기록은 이전 대상의 데이터 성공을 이어받지 않는다 */
  function remember(row) {
    const k = keyOf(row.cluster, row.source), found = latest.get(k);
    const sameTarget = !found || !row.target || !found.uid || found.uid === row.target;
    const prior = sameTarget ? (found ?? { last: null, dataStart: null, checkedAt: null }) : { last: null, dataStart: null, checkedAt: null };
    const data = row.ok && !row.probe;
    latest.set(k, { at: row.at, start: row.start ?? row.at, ok: row.ok, error: row.error ?? null, uid: row.target ?? prior.uid ?? null,
      last: data ? row.at : prior.last, dataStart: data ? row.start ?? row.at : prior.dataStart, checkedAt: row.probe ? row.at : prior.checkedAt,
      /* 대상이 바뀐 뒤 새 대상의 데이터를 처음 받으면 변경 표시를 푼다 */
      identityChanged: data ? null : prior.identityChanged ?? null });
  }
  for (const row of recent()) remember(row);
  function record(cluster, source, ok, start, ms, error, probe) {
    const uid = targets.get(keyOf(cluster, source))?.uid;
    const row = { at: now(), start, cluster, source, ok, ms: ok ? Math.round(ms) : null, ...(error ? { error } : {}), ...(probe ? { probe: true } : {}), ...(uid ? { target: uid } : {}) };
    const previous = latest.get(keyOf(cluster, source));
    remember(row);
    const k = JSON.stringify([cluster, source, !!probe]), prior = written.get(k);
    const sameState = previous?.ok === ok && previous?.error === (error ?? null);
    if (prior && sameState && prior.uid === uid && prior.ok === ok && prior.error === (error ?? null) && row.at - prior.at < 60_000) return;
    written.set(k, { at: row.at, uid, ok, error: error ?? null });
    try { log.append(row); } catch { /* 기록 실패: 상태는 메모리에 남고, 확인 기록이 없으면 unknown */ }
  }
  /** fn을 실행하고 결과를 그 출처의 확인 한 줄로 남긴다. probe: 연결 확인(데이터 신선도를 바꾸지 않음). 연결 안 됨(그 클러스터에 도구 없음)은 기록하지 않고 상태만 */
  async function track(cluster, source, fn, { probe = false } = {}) {
    if (!KNOWN.has(source)) throw new Error('unknown source');
    const k = keyOf(cluster, source), started = performance.now(), start = now(), generation = released.get(cluster) ?? 0;
    /* 요청을 시작할 때의 대상(UID와 대상 세대)을 고정한다. 읽는 동안 대상이 바뀌면 그 응답은 이전 대상의 것이다 */
    const identity = identities.get(k) ?? 0, uidAtStart = targets.get(k)?.uid ?? null;
    /* 연결 해제(forget) 뒤에 끝난 읽기는 상태를 다시 만들지 않는다 */
    const live = () => (released.get(cluster) ?? 0) === generation;
    const sameTarget = () => (identities.get(k) ?? 0) === identity;
    let value;
    try { value = await fn(); }
    catch (error) {
      if (!live()) throw error;
      if (!sameTarget()) { superseded(cluster, source, uidAtStart, false, start, null, errorCode(error), probe); throw error; }
      if (error?.kind === 'unconfigured') latest.set(k, { ...(latest.get(k) ?? { last: null, dataStart: null, checkedAt: null }), at: now(), start, ok: false, error: 'unconfigured', ...(probe ? { checkedAt: now() } : {}) });
      else record(cluster, source, false, start, null, errorCode(error), probe);
      throw error;
    }
    if (!live()) throw Object.assign(new Error('source released during the read'), { kind: 'cancelled', source });
    if (!sameTarget()) {
      /* 이전 대상의 응답: 현재 대상의 상태에 붙이지 않고(새 대상은 실제 관측 전까지 unknown), 값도 현재 대상의 값으로 내보내지 않는다 */
      superseded(cluster, source, uidAtStart, true, start, performance.now() - started, null, probe);
      throw Object.assign(new Error('source target changed during the read'), { kind: 'identity_changed', source });
    }
    record(cluster, source, true, start, performance.now() - started, null, probe);
    return value;
  }
  /** 대상이 바뀐 뒤 끝난 이전 대상의 읽기: 기록에는 그때의 대상 UID로 남기고(coverage는 대상별), 현재 상태에는 previous의 마지막 성공만 고친다 */
  function superseded(cluster, source, uid, ok, start, ms, error, probe) {
    const row = { at: now(), start, cluster, source, ok, ms: ok ? Math.round(ms) : null, ...(error ? { error } : {}), ...(probe ? { probe: true } : {}), ...(uid ? { target: uid } : {}) };
    try { log.append(row); } catch { /* 기록 실패: 현재 상태에는 원래 붙이지 않는다 */ }
    const k = keyOf(cluster, source), s = latest.get(k), prev = s?.identityChanged?.previous;
    if (ok && !probe && prev && uid && prev.target?.uid === uid) latest.set(k, { ...s, identityChanged: { ...s.identityChanged, previous: { ...prev, lastSuccessAt: iso(row.at) } } });
  }
  /** 주기 수집(index.cjs watch)이 그 출처를 읽는 간격. null이면 주기 없음(화면이 부를 때만) */
  function interval(cluster, source, ms) {
    const k = keyOf(cluster, source);
    if (Number.isFinite(ms) && ms > 0) intervals.set(k, Math.min(ms, intervals.get(k) ?? Infinity)); else intervals.delete(k);
  }
  /** 출처의 대상 identity(그 클러스터의 Service나 Namespace UID): { uid, ref } 또는 { reason }.
   *  UID가 바뀌면(같은 이름으로 다시 만든 대상) 지금까지의 관측은 이전 대상의 것이다: 현재 대상은 미관측(identity_changed)으로 두고,
   *  이전 대상과 그 마지막 성공은 previous로 남긴다. 새 대상의 실제 데이터 관측 뒤에만 ready가 된다 */
  function target(cluster, source, value) {
    const k = keyOf(cluster, source), before = targets.get(k), s = latest.get(k);
    targets.set(k, value);
    /* 대상 세대: 알던 대상의 UID가 다른 UID로 바뀔 때만 올린다(처음 정해질 때는 이전 대상이 없다) */
    if (before?.uid && value?.uid && before.uid !== value.uid) identities.set(k, (identities.get(k) ?? 0) + 1);
    if (!value?.uid || !s) return;
    const observedUid = s.uid ?? before?.uid ?? null;
    if (!observedUid) { latest.set(k, { ...s, uid: value.uid }); return; }
    if (observedUid === value.uid) return;
    latest.set(k, { at: s.at, start: s.start, ok: true, error: null, uid: value.uid, last: null, dataStart: null, checkedAt: null,
      identityChanged: { at: now(), previous: { target: { uid: observedUid, ref: before?.ref ?? null }, lastSuccessAt: iso(s.last) } } });
  }
  /** 이 출처 확인 기록이 덮는 구간: 처음·마지막 기록, 데이터 읽기 사이가 주기의 2배를 넘은 빈 구간, 실패가 섞였는지 */
  function coverageOf(cluster, source, every, uid) {
    /* 지금 대상의 기록만(대상 UID를 모르는 기록은 대상이 정해지기 전의 것) */
    const rows = recent(row => row.cluster === cluster && row.source === source && (!uid || !row.target || row.target === uid));
    if (!rows.length) return null;
    const data = rows.filter(row => row.ok && !row.probe), missingIntervals = [];
    if (every) for (let i = 1; i < data.length; i++) if (data[i].at - data[i - 1].at > STALE_FACTOR * every) missingIntervals.push({ from: iso(data[i - 1].at), to: iso(data[i].at) });
    return { from: iso(rows[0].at), to: iso(rows.at(-1).at), missingIntervals, partial: rows.some(row => !row.ok), truncated: false };
  }
  function stateOf(s, every, at, coverage) {
    if (!s) return 'unknown';
    if (!s.ok) return s.error === 'unconfigured' ? 'unconfigured' : s.error === 'forbidden' ? 'forbidden' : 'error';
    if (s.identityChanged) return 'unknown';
    if (!coverage) return 'unknown';
    if (every && (s.last === null || at - s.last > STALE_FACTOR * every)) return 'stale';
    return 'ready';
  }
  function state(cluster, source) {
    const k = keyOf(cluster, source), s = latest.get(k), every = intervals.get(k) ?? null, at = now();
    const coverage = s && s.error !== 'unconfigured' && !s.identityChanged ? coverageOf(cluster, source, every, s.uid) : null;
    const t = targets.get(k);
    const value = {
      id: source, cluster, target: t?.uid ? { uid: t.uid, ref: t.ref } : null, state: stateOf(s, every, at, coverage), error: s && !s.ok ? s.error : null,
      observedAt: iso(s?.dataStart), receivedAt: iso(s?.at), lastSuccessAt: iso(s?.last), checkedAt: iso(s?.checkedAt),
      collectionIntervalMs: every, retention: { days: RETENTION_DAYS, of: 'source-checks' }, coverage,
      last: s?.last ?? null, at: s?.at ?? null,
      ...(s?.identityChanged ? { previous: s.identityChanged.previous } : {}),
    };
    const reasons = {};
    if (!s) Object.assign(reasons, { observedAt: 'not_observed', receivedAt: 'not_observed', lastSuccessAt: 'not_observed', checkedAt: 'not_observed' });
    else {
      if (value.lastSuccessAt === null) { reasons.lastSuccessAt = s.error === 'unconfigured' ? 'unconfigured' : 'no_data_read_in_retention'; reasons.observedAt = reasons.lastSuccessAt; }
      if (value.checkedAt === null) reasons.checkedAt = 'not_checked';
    }
    if (s?.identityChanged) for (const f of ['observedAt', 'lastSuccessAt', 'last', 'coverage', 'checkedAt', 'error']) if (value[f] === null) reasons[f] = 'identity_changed';
    if (value.target === null) reasons.target = t?.reason ?? (!s ? 'not_observed' : 'not_resolved');
    if (every === null) reasons.collectionIntervalMs = 'on_demand';
    if (coverage === null && !reasons.coverage) reasons.coverage = !s ? 'not_observed' : s.error === 'unconfigured' ? 'unconfigured' : 'no_checks_recorded';
    if (value.error === null && !reasons.error) reasons.error = s ? 'none' : 'not_observed';
    if (value.last === null && !reasons.last) reasons.last = reasons.lastSuccessAt;
    if (value.at === null) reasons.at = 'not_observed';
    value.reasons = reasons;
    return value;
  }
  /** 이 클러스터에서 한 번이라도 확인한 출처(확인 전 출처는 화면 칩에 올리지 않음) */
  const states = cluster => Object.fromEntries(SOURCES.filter(source => latest.has(keyOf(cluster, source))).map(source => [source, state(cluster, source)]));
  /** 마지막 연결 확인·데이터 읽기 시각(ms, 없으면 null): 확인을 다시 할지 정할 때 */
  const attemptedAt = (cluster, source) => latest.get(keyOf(cluster, source))?.at ?? null;
  /** 클러스터 하나를 잊는다(연결 해제): 메모리 상태와 주기·대상. 기록 파일은 보관 기간대로 남는다 */
  function forget(cluster) {
    released.set(cluster, (released.get(cluster) ?? 0) + 1);
    for (const map of [latest, intervals, targets, identities]) for (const k of [...map.keys()]) if (JSON.parse(k)[0] === cluster) map.delete(k);
    for (const k of [...written.keys()]) if (JSON.parse(k)[0] === cluster) written.delete(k);
  }
  function checks(cluster, source) {
    const end = now(), uid = targets.get(keyOf(cluster, source))?.uid;
    const rows = recent(row => row.cluster === cluster && row.source === source && row.at >= end - DAY && (!uid || row.target === uid));
    return { at: new Date(end).toISOString(), samples: rows.filter(row => row.at >= end - 6 * HOUR).map(row => ({ at: row.at, ms: row.ok ? row.ms : null })),
      errors: rows.filter(row => !row.ok).map(row => ({ at: row.at, text: row.error })) };
  }
  return { track, interval, target, state, states, attemptedAt, forget, checks };
}

module.exports = { createSourceStates, errorCode, SOURCES, STALE_FACTOR };
