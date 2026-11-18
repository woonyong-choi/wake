/*
 * 알림(spec/backend.md#F-BE-006): Prometheus 규칙(/api/v1/rules: state, expr, for, labels)과 Alertmanager 알림(/api/v2/alerts),
 * 받은 알림의 이력(허브 저장소 hub-store.cjs의 alert-history 기록, 90일). 지난(resolved) 알림은 이 이력에서만 나온다.
 *   alerts.read { id } -> { at, rules: { groups }, alertmanager: [...], history: [{ fingerprint, labels, annotations, startsAt, endsAt, receivers }], historyDays, sources }
 *   historyDays: 이 이력을 지키는 날 수(Alertmanager 자신의 보관 기간은 API가 알려 주지 않아 화면이 쓰지 않음)
 *   alerts.expr { id, rule: { group, name }, from, to, step } -> { query, step, range, fetchedAt, data: { result } } — 규칙 expr은 허브가 규칙 응답에서 찾는다
 * 이력 기록: 알림(지문 + 시작)마다 한 줄. 지금 Alertmanager에 없는 기록은 끝난 것: endsAt은 마지막으로 본 시각(Alertmanager가 준 끝 예정 시각이 더 이르면 그것).
 */
const { rangeOf } = require('./metrics.cjs');

const RETENTION_DAYS = 90, DAY = 86_400_000;
const ms = v => { const n = Date.parse(v ?? ''); return Number.isFinite(n) ? n : null; };
const keyOf = row => `${row.fingerprint}|${row.startsAt}`;

/** 이번에 받은 알림과 이력 -> 새로 쓸 줄(새 알림, 다시 본 알림의 lastSeen, 끝난 알림) */
function historyUpdates(active, history, at) {
  const seen = new Set(), out = [];
  for (const a of active ?? []) {
    if (!a?.fingerprint || ms(a.startsAt) == null || a.status?.state === 'unprocessed') continue;
    const row = { at: ms(a.startsAt), fingerprint: a.fingerprint, labels: a.labels ?? {}, annotations: a.annotations ?? {}, startsAt: a.startsAt, endsAt: null,
      receivers: (a.receivers ?? []).map(r => r?.name ?? r).filter(Boolean), lastSeen: new Date(at).toISOString() };
    seen.add(keyOf(row)); out.push(row);
  }
  for (const h of history ?? []) {
    if (h.endsAt || seen.has(keyOf(h))) continue;
    const last = ms(h.lastSeen) ?? at;
    out.push({ ...h, endsAt: new Date(last).toISOString() });
  }
  return out;
}

/** log: 허브 저장소의 기록 하나({ append, list }). 같은 알림(지문 + 시작)은 마지막 줄이 이긴다 */
function createAlerts({ log, prom, alertmanager, now = Date.now }) {
  const store = { append: rows => { for (const row of rows) log.append(row); },
    read: filter => { const by = new Map(); for (const row of log.list(r => r.at >= now() - RETENTION_DAYS * DAY && filter(r))) { const k = `${row.cluster}|${keyOf(row)}`; by.delete(k); by.set(k, row); } return [...by.values()]; } };
  const settle = p => p.then(value => ({ value }), error => ({ error }));
  async function read({ id }) {
    const [rules, am] = await Promise.all([settle(prom(id, '/api/v1/rules', { type: 'alert' })), settle(alertmanager(id, '/api/v2/alerts', { active: 'true', silenced: 'true', inhibited: 'true' }))]);
    if (rules.error && am.error) throw am.error.kind === 'unconfigured' && rules.error.kind === 'unconfigured' ? am.error : rules.error.kind !== 'unconfigured' ? rules.error : am.error;
    const at = now(), mine = row => row.cluster === id;
    if (!am.error) store.append(historyUpdates(am.value, store.read(row => mine(row) && !row.endsAt), at).map(row => ({ ...row, cluster: id })));
    const history = store.read(row => mine(row) && !!row.endsAt).map(({ fingerprint, labels, annotations, startsAt, endsAt, receivers }) => ({ fingerprint, labels, annotations, startsAt, endsAt, receivers }));
    return { at: new Date(at).toISOString(), rules: rules.error ? null : { groups: rules.value.groups ?? [] }, alertmanager: am.error ? [] : am.value, history, historyDays: RETENTION_DAYS,
      partial: rules.error ? 'prometheus' : am.error ? 'alertmanager' : null };
  }
  async function expr({ id, rule, from, to, step }) {
    if (typeof rule?.name !== 'string' || typeof rule?.group !== 'string') throw Object.assign(new Error('invalid rule'), { kind: 'invalid_request' });
    const data = await prom(id, '/api/v1/rules', { type: 'alert' });
    const found = (data.groups ?? []).filter(g => g.name === rule.group).flatMap(g => g.rules ?? []).filter(r => r.type === 'alerting' && r.name === rule.name);
    if (found.length !== 1 || typeof found[0].query !== 'string') throw Object.assign(new Error('rule not found'), { kind: 'missing' });
    const r = rangeOf(from, to, step), query = found[0].query;
    const result = await prom(id, '/api/v1/query_range', { query, start: r.from, end: r.to, step: r.step });
    return { query, step: r.step, range: { from: r.from * 1000, to: r.to * 1000 }, fetchedAt: now(), data: { result: result.result ?? [] } };
  }
  return { read, expr };
}

module.exports = { createAlerts, historyUpdates, RETENTION_DAYS };
