/*
 * 로그 수준별 줄 수(spec/architecture.md#F-ARC-T06): Loki가 줄마다 붙이는 detected_level로 구간 전체를 센다(화면이 읽은 100줄이 아니라).
 *   logs.levels { id, ns, pod, container, from, to } -> { counts: { all, ERROR, WARN, INFO, DEBUG, unknown }, query, range, fetchedAt }
 */
const NAME = /^[a-z0-9](?:[-a-z0-9.]{0,251}[a-z0-9])?$/;
const LEVEL = { error: 'ERROR', err: 'ERROR', critical: 'ERROR', fatal: 'ERROR', panic: 'ERROR', warn: 'WARN', warning: 'WARN', info: 'INFO', debug: 'DEBUG', trace: 'DEBUG' };

/** Loki 지금 값 벡터(by detected_level) -> 화면 수준별 수 */
function levelCounts(result) {
  const counts = { all: 0, ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, unknown: 0 };
  for (const s of result ?? []) {
    const n = Number(s.value?.[1]);
    if (!Number.isFinite(n)) continue;
    counts.all += n; counts[LEVEL[String(s.metric?.detected_level ?? '').toLowerCase()] ?? 'unknown'] += n;
  }
  return counts;
}

function createLogLevels({ loki, now = Date.now }) {
  return async function levels({ id, ns, pod, container, from, to }) {
    if (![ns, pod].every(v => typeof v === 'string' && NAME.test(v)) || (container !== undefined && !(typeof container === 'string' && NAME.test(container)))
      || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 30 * 86_400_000) throw Object.assign(new Error('invalid log levels request'), { kind: 'invalid_request' });
    const seconds = Math.max(1, Math.ceil((to - from) / 1000));
    const query = `sum by (detected_level) (count_over_time({namespace="${ns}", pod="${pod}"${container ? `, container="${container}"` : ''}}[${seconds}s]))`;
    const data = await loki(id, '/loki/api/v1/query', { query, time: Math.floor(to / 1000) });
    return { counts: levelCounts(data.result), query, range: { from, to }, fetchedAt: now() };
  };
}

module.exports = { createLogLevels, levelCounts };
