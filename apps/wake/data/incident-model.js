import { compareHistory } from './table-order.js';
/*
 * 인시던트 파생 값(순수 함수). 실제 출처의 원본 모양을 받아 코드와 숫자만 돌려준다. 화면 글은 apps/wake/locale이 만든다.
 *
 * 시각: 모든 시각은 epoch 밀리초(ms)다. Prometheus 범위 질의 표본은 [{ at: ms, value }]로 받는다
 *   (query_range의 [초, "값"] 쌍은 호출하는 쪽이 at = 초 × 1000, value = Number(값)으로 바꿔 넘긴다). value가 null이면 수집 공백이다.
 * Kubernetes 시각(creationTimestamp, startTime, lastTimestamp …)은 RFC 3339 글이고 여기서 ms로 읽는다.
 */

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/** the availability objective a 5xx burn rate is read against when the service declares none (percent) */
export const SLO_DEFAULT = 99.9;

/** the recovery check defaults (ms): one collection every 30 s, 5 minutes of continuous health, 10 minutes blind in a row end it without a verdict */
export const VERIFY_DEFAULT = Object.freeze({ cadence: 30_000, need: 300_000, max: 600_000 });

/** how fast an error ratio (percent) spends the error budget: 3.1% at 99.9% is 31. Null for a missing ratio */
export function burnRate(pct, slo = SLO_DEFAULT) {
  if (pct == null || !Number.isFinite(Number(pct)) || !(slo < 100)) return null;
  return Number(pct) / (100 - slo);
}

const ms = v => (v == null || v === '' ? null : typeof v === 'number' ? v : (t => (Number.isFinite(t) ? t : null))(Date.parse(v)));
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
const r2 = v => (v == null ? null : Math.round(v * 100) / 100);
const avg = xs => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null);
const valid = samples => (samples ?? []).filter(s => s && Number.isFinite(s.at) && s.value != null && Number.isFinite(Number(s.value))).map(s => ({ at: s.at, value: Number(s.value) })).sort((a, b) => a.at - b.at);

/**
 * The 5xx figures of an incident over one window, all from one ratio series: the ratio (mean, now, peak), the burn rates (each naming its window, N7),
 * the requests served and failed, and the error budget spent.
 *  ratio: Prometheus range samples of the error ratio in percent; rps: range samples of the request rate (req/s) or one number;
 *  from, to: the window (ms); fixAt: when the fix took effect (the symptom ends there); slo: percent; scrape: the step of the samples (ms);
 *  rate: the range of the query's rate() (ms): the peak burn's window is that range ending at the peak sample.
 * Samples in (from, to] count. Gaps are scaled over: the requests and failures of the covered steps are spread over the whole window.
 * Null when the window holds no sample.
 */
export function impactFromSeries({ ratio, rps, from, to, fixAt = Infinity, slo = SLO_DEFAULT, scrape = 15_000, rate = 5 * MIN }) {
  const all = valid(ratio), pts = all.filter(s => s.at > from && s.at <= to);
  if (!pts.length) return null;
  const rates = typeof rps === 'number' ? null : valid(rps);
  const rpsAt = at => { if (typeof rps === 'number') return rps; if (!rates.length) return null; let v = rates[0].value; for (const s of rates) { if (s.at > at) break; v = s.value; } return v; };
  const mean = avg(pts.map(s => s.value)), now = pts.at(-1).value;
  const top = pts.reduce((a, s) => (s.value > a.value ? s : a), pts[0]);
  const covered = pts.length * scrape, scale = covered > 0 ? Math.max(1, (to - from) / covered) : 1;
  const hasRps = pts.every(s => rpsAt(s.at) != null);
  const requests = hasRps ? Math.round(pts.reduce((a, s) => a + rpsAt(s.at) * scrape / 1000, 0) * scale) : null;
  const failed = hasRps ? Math.round(pts.reduce((a, s) => a + rpsAt(s.at) * scrape / 1000 * s.value / 100, 0) * scale) : null;
  const meanRps = hasRps ? avg(pts.map(s => rpsAt(s.at))) : null;
  const budget = meanRps == null ? null : meanRps * 30 * DAY / 1000 * (100 - slo) / 100;
  const hour = all.filter(s => s.at > to - HOUR && s.at <= to).map(s => s.value);
  const burns = [
    { id: '1h', value: r1(burnRate(avg(hour), slo)), from: to - HOUR, to },
    { id: 'incident', value: r1(burnRate(mean, slo)), from, to },
    { id: 'peak', value: r1(burnRate(top.value, slo)), from: top.at - rate, to: top.at },
  ];
  return { from, to, symptomTo: Math.min(to, fixAt), mean: r2(mean), now, peak: top.value, peakAt: top.at, burns, requests, failed,
    budgetUsed: budget ? Math.round(failed / budget * 1000) / 10 : null, slo };
}

/**
 * The run of a CronJob that the incident held up, read from the Jobs it created.
 *  due: when the run was scheduled (ms); jobs: the CronJob's Job objects; pods: the Pods of those Jobs (optional: the resume time is the first
 *  container start, since a Job's status.startTime is set when the controller takes it, even while its Pod is Pending);
 *  items: { total, processed } from the batch's own metric (optional); deadline: the next schedule (ms); policy: spec.concurrencyPolicy; now (ms).
 * The run is the first Job scheduled at or after due that is Complete, otherwise the newest one (Replace swaps a Pending Job for a new one).
 * complete only with the Job's Complete condition True and, when the items are known, all of them processed; before that it has resumed.
 * delay: completion minus (due + the typical run time of the earlier complete Jobs); null when there is no earlier run to compare with.
 */
export function batchRunOf({ due, jobs = [], pods = [], items = null, deadline = null, policy = null, now = null }) {
  const scheduled = j => ms(j?.metadata?.annotations?.['batch.kubernetes.io/cronjob-scheduled-timestamp']) ?? ms(j?.metadata?.creationTimestamp);
  const isComplete = j => (j?.status?.conditions ?? []).some(c => c.type === 'Complete' && c.status === 'True');
  const runs = jobs.filter(j => scheduled(j) != null && scheduled(j) >= due).sort((a, b) => scheduled(a) - scheduled(b));
  const job = runs.find(isComplete) ?? runs.at(-1) ?? null;
  const name = job?.metadata?.name ?? null;
  const own = pods.filter(p => p?.metadata?.labels?.['job-name'] === name || (p?.metadata?.ownerReferences ?? []).some(o => o.kind === 'Job' && o.name === name));
  const starts = own.flatMap(p => (p.status?.containerStatuses ?? []).map(c => ms(c.state?.running?.startedAt) ?? ms(c.state?.terminated?.startedAt))).filter(v => v != null);
  const jobComplete = isComplete(job), succeeded = job?.status?.succeeded ?? 0;
  const resumed = starts.length ? Math.min(...starts) : jobComplete || succeeded > 0 || (job?.status?.ready ?? 0) > 0 ? ms(job?.status?.startTime) : null;
  const done = jobComplete ? ms(job.status.completionTime) : null;
  const allItems = items?.total == null || (items.processed != null && items.processed >= items.total);
  const complete = jobComplete && allItems;
  const took = jobs.filter(j => j !== job && isComplete(j) && scheduled(j) < due).map(j => ms(j.status?.completionTime) - ms(j.status?.startTime)).filter(Number.isFinite).sort((a, b) => a - b);
  const typical = took.length ? took[Math.floor(took.length / 2)] : null;
  return { job: name, due, resumed, done, jobComplete, complete, succeeded, waited: (resumed ?? now ?? due) - due,
    items: items?.total ?? null, processed: items?.processed ?? null, typical, delay: complete && done != null && typical != null ? done - (due + typical) : null, deadline, policy };
}

const PROM = 'prometheus', KUBE = 'kubernetes';
/**
 * What users felt, per kind, as items with numbers, the source and how it is known ('measured' | 'estimated' | 'unknown').
 *  kind: 'api' | 'capacity' | 'batch' | 'auth' | 'deploy'; impact: impactFromSeries(); query: the PromQL behind impact;
 *  batch: batchRunOf(); ready: { ready, desired, min } of the Deployment (min: the lowest Ready during the incident);
 *  revision: { running, blocked } for a held deploy.
 * final = true (resolved documents, N5): final-state values only (peak, window, the value at the end of the window, failed count, Ready after recovery; batch run, completion,
 * processed, delay), never a "now" value or a waiting time.
 */
export function userImpact({ kind, impact = null, query = null, batch = null, ready = null, revision = null, final = false }) {
  const q = query ? { query } : {};
  const ratioItem = id => (!impact ? { id, state: 'unknown', source: PROM, ...q }
    : final ? { id, peak: impact.peak, peakAt: impact.peakAt, from: impact.from, to: impact.symptomTo, end: impact.now, state: 'measured', source: PROM, ...q }
      : { id, now: impact.now, from: impact.from, state: 'measured', source: PROM, ...q });
  const failedItem = () => (impact ? [{ id: 'failed', failed: impact.failed, requests: impact.requests, from: impact.from, to: final ? impact.symptomTo : impact.to, state: impact.failed == null ? 'unknown' : 'measured', source: PROM, ...q }] : []);
  const readyItem = () => (!ready ? { id: 'ready', state: 'unknown', source: KUBE }
    : final ? { id: 'ready', readyAfter: ready.ready, desired: ready.desired, readyDuring: ready.min ?? null, state: 'measured', source: KUBE }
      : { id: 'ready', ready: ready.ready, desired: ready.desired, state: 'measured', source: KUBE });
  const errItem = () => (impact ? [{ id: 'err', mean: impact.mean, peak: impact.peak, from: impact.from, to: final ? impact.symptomTo : impact.to, state: 'estimated', source: PROM, ...q }] : []);
  if (kind === 'api') {
    if (!impact) return [ratioItem('ratio')];
    return [ratioItem('ratio'), ...failedItem(),
      ...impact.burns.filter(b => final || b.id !== 'peak').map(b => ({ id: `burn-${b.id}`, burn: b.value, from: b.from, to: b.to, slo: impact.slo, state: 'measured', source: PROM, ...q })),
      ...(final ? [{ id: 'budget', budgetUsed: impact.budgetUsed, slo: impact.slo, state: impact.budgetUsed == null ? 'unknown' : 'measured', source: PROM, ...q }] : [])];
  }
  if (kind === 'capacity') return [readyItem(), ...errItem()];
  if (kind === 'auth') return [ratioItem('login'), ...failedItem(), readyItem()];
  if (kind === 'deploy') return [revision ? { id: 'blocked', running: revision.running, blocked: revision.blocked, state: 'measured', source: KUBE } : { id: 'blocked', state: 'unknown', source: KUBE }, ...errItem()];
  if (kind === 'batch') {
    if (!batch) return [{ id: 'run', state: 'unknown', source: KUBE }];
    const items = { id: 'items', items: batch.items, processed: batch.processed, state: batch.items == null ? 'unknown' : batch.complete ? 'measured' : 'estimated', source: KUBE };
    if (final) return [{ id: 'run', job: batch.job, due: batch.due, resumed: batch.resumed, done: batch.done, complete: batch.complete, delay: batch.delay, state: 'measured', source: KUBE }, items];
    return [{ id: 'run', job: batch.job, due: batch.due, resumed: batch.resumed, done: batch.done, complete: batch.complete, waited: batch.waited, state: 'measured', source: KUBE }, items,
      ...(batch.resumed == null && batch.deadline != null ? [{ id: 'deadline', deadline: batch.deadline, policy: batch.policy, state: 'measured', source: KUBE }] : [])];
  }
  return [];
}

/** an event row's key: involved object, reason and message (kind/ns/name|reason|message) */
export const eventRowKey = e => `${e.kind}/${e.ns}/${e.name}|${e.reason}|${e.message}`;
/** the parts of an event row key: { kind, ns, name, reason, message } */
export function eventRowParts(key) {
  const [obj, reason = '', ...message] = String(key).split('|'), [kind, ns, ...name] = obj.split('/');
  return { kind, ns, name: name.join('/'), reason, message: message.join('|') };
}

/**
 * Events of a window as kubectl lists them: one row per involved object, reason and message, its count the occurrences (Event.series.count, else Event.count).
 * Accepts core/v1 Events (involvedObject, lastTimestamp, count) and events.k8s.io/v1 (regarding, series, eventTime, note). The same Event seen twice
 * (same uid, a watch update) counts once at its larger count; distinct Events of one object, reason and message add up.
 * Every number (rows, objects = rows, warning, normal, occurrences and warningOccurrences (cumulative Event.count), windowOccurrences and
 * windowAtLeast (occurrences inside the window, the one number a head shows for "how many times")) is counted from the one row list (N8).
 *  from, to: ms (an event counts when its last time is inside); ns: one namespace or null; type: 'all' | 'Warning' | 'Normal'.
 */
export function eventSummary(events, { from = -Infinity, to = Infinity, ns = null, type = 'all' } = {}) {
  const byUid = new Map();
  for (const e of events ?? []) {
    const obj = e.involvedObject ?? e.regarding ?? {};
    const last = ms(e.series?.lastObservedTime) ?? ms(e.lastTimestamp) ?? ms(e.eventTime) ?? ms(e.metadata?.creationTimestamp);
    const first = ms(e.firstTimestamp) ?? ms(e.deprecatedFirstTimestamp) ?? ms(e.eventTime) ?? last;
    const count = e.series?.count ?? e.count ?? e.deprecatedCount ?? 1;
    const row = { uid: e.metadata?.uid ?? null, type: e.type, reason: e.reason, kind: obj.kind, name: obj.name, ns: obj.namespace ?? '', objectUid: obj.uid ?? null,
      message: e.message ?? e.note ?? '', source: e.source?.component ?? e.reportingController ?? '', first, last, count };
    if (last == null || last < from || last > to || (ns && row.ns !== ns) || (type !== 'all' && row.type !== type)) continue;
    const k = row.uid ?? `${row.kind}/${row.ns}/${row.name}|${row.reason}|${row.message}|${first}`, had = byUid.get(k);
    if (!had || row.count > had.count || (row.count === had.count && row.last > had.last)) byUid.set(k, row);
  }
  /* a row is one Event as kubectl lists it: object + reason + message (a readiness and a liveness failure of one Pod are two rows, A2-02).
     inWindow: its occurrences inside the window: all of count when it first happened inside, else only its last one is known (atLeast) */
  const rows = new Map();
  for (const e of byUid.values()) {
    const key = eventRowKey(e), r = rows.get(key), before = Number.isFinite(from) && e.first < from, inWindow = before ? 1 : e.count, atLeast = before && e.count > 1;
    if (!r) { rows.set(key, { key, type: e.type, reason: e.reason, kind: e.kind, name: e.name, ns: e.ns, objectUid: e.objectUid, message: e.message, source: e.source, first: e.first, last: e.last, count: e.count, inWindow, atLeast }); continue; }
    r.count += e.count; r.first = Math.min(r.first, e.first); r.inWindow += inWindow; r.atLeast ||= atLeast;
    if (e.last > r.last) Object.assign(r, { last: e.last, source: e.source, type: e.type });
  }
  const list = [...rows.values()].sort((a, b) => compareHistory(a, b, row => row.last)), warn = list.filter(r => r.type === 'Warning');
  return { rows: list, objects: list.length, warning: warn.length, normal: list.length - warn.length,
    occurrences: list.reduce((a, r) => a + r.count, 0), warningOccurrences: warn.reduce((a, r) => a + r.count, 0),
    windowOccurrences: list.reduce((a, r) => a + r.inWindow, 0), windowAtLeast: list.some(r => r.atLeast) };
}

/** the recovery check's counts, required conditions apart from the ones that could not be judged (N12): { required, passed, unjudged, optional }.
 *  conds: [{ state: 'pass' | 'fail' | 'unknown' | 'pending', optional }] */
export function verifyCounts(conds) {
  const req = (conds ?? []).filter(c => !c.optional);
  return { required: req.length, passed: req.filter(c => c.state === 'pass').length, unjudged: req.filter(c => c.state === 'unknown').length, optional: (conds ?? []).length - req.length };
}

/** whether a cause is judged, supported by an outside reply (N4), or still a hypothesis.
 *  chain.grade: 'confirmed' | 'inferred' | 'supported' | 'insufficient'; chain.held or rule.held: the rule waits for missing evidence */
export function causeStatus(chain, rule) {
  if (!chain) return 'hypothesis';
  if (chain.grade === 'supported' || chain.supported) return 'supported';
  if (chain.held || rule?.held || chain.grade === 'insufficient') return 'hypothesis';
  return chain.grade === 'confirmed' || chain.grade === 'inferred' ? 'judged' : 'hypothesis';
}

/**
 * The recovery check's verdict from its collection windows.
 *  verifyFrom, now: ms; cadence, need, max: ms (VERIFY_DEFAULT); windows: one code per window seen so far, oldest first:
 *  'ok' (every source answered and every condition held), 'miss' (a source did not answer: never ok), 'bad' (a condition failed).
 * RULE-RECOVERY: health counts only as one unbroken run of ok windows ending at the last one; a miss restarts the run (health before and after a
 * blind spell never adds up). Pass needs that run to hold at least max(2, need/cadence + 1) windows (11: 0 to 300 s) and, when the windows carry their
 * read times (times, one per window), to span `need` of real time between its first and last read (windows read faster than the cadence do not pass
 * early). Only misses worth the whole limit in a row end the check without a verdict ('inconclusive'); scattered misses keep it pending.
 * Returns { state: 'pending' | 'pass' | 'fail' | 'inconclusive', stable, left, failAt, windows (the latest, padded with 'none' to the limit) }.
 */
export function verifyVerdict({ verifyFrom, now, cadence = VERIFY_DEFAULT.cadence, need = VERIFY_DEFAULT.need, max = VERIFY_DEFAULT.max, windows = [], times = null }) {
  if (verifyFrom == null || now < verifyFrom) return { state: 'pending', stable: 0, left: need, failAt: null, windows: [] };
  const run = code => { let n = 0; for (let i = windows.length - 1; i >= 0 && windows[i] === code; i--) n++; return n; };
  const healthy = run('ok'), blind = run('miss'), len = max / cadence;
  const shown = windows.slice(-len), padded = [...shown, ...Array(Math.max(0, len - shown.length)).fill('none')];
  const timed = Array.isArray(times) && times.length === windows.length;
  const stable = healthy === 0 ? 0 : timed ? times.at(-1) - times[times.length - healthy] : (healthy - 1) * cadence, left = Math.max(0, need - stable);
  const bad = windows.indexOf('bad');
  const out = (state, failAt = null) => ({ state, stable, left, failAt, windows: padded });
  if (bad >= 0) return out('fail', verifyFrom + bad * cadence);
  if (blind * cadence >= max) return out('inconclusive');
  if (healthy >= Math.max(2, Math.ceil(need / cadence) + 1) && stable >= need) return out('pass');
  return out('pending');
}

/** 복구 결과의 종류(인시던트 결과 알약의 순서) */
export const RECOVERY_KINDS = ['service', 'symptom', 'mitigated', 'bypassed', 'resumed'];
/** how a recovery is classed: a batch is back only when its run completed (else 'resumed'); otherwise the chosen action's class
 *  (option.recovery: 'service' | 'symptom' | 'mitigated' | 'bypassed'), 'service' when it names none */
export function recoveryKind({ option = null, batch = null } = {}) {
  if (batch && !batch.complete) return 'resumed';
  return RECOVERY_KINDS.includes(option?.recovery) ? option.recovery : 'service';
}
/** the tone of a recovery (N13): only a service recovery is 'ok'; a symptom recovery, a mitigation, a bypass or a resumed batch is 'warn' */
export const recoveryTone = kind => (kind === 'service' ? 'ok' : 'warn');

/** when the next status share is due (ms): 30 minutes after `at` for a critical incident, 60 otherwise */
export const nextShare = (severity, at) => at + (severity === 'critical' ? 30 : 60) * MIN;

/** the check before a held batch's deadline (its next schedule): one time, 5 minutes before (one clause, one time).
 *  Null once the run resumed, without a deadline, or after it */
export function deadlineCheck(batch, now = null) {
  if (!batch || batch.resumed != null || batch.deadline == null || (now != null && now >= batch.deadline)) return null;
  return { kind: 'deadline', at: batch.deadline - 5 * MIN, deadline: batch.deadline, policy: batch.policy ?? null, job: batch.job ?? null };
}

/** the window a resolved document's figures draw (N6): from 30 minutes before detection through the recovery check, and the 7-day watch after it */
export function figureWindow({ detectedAt, verifiedAt, watchUntil = null }) {
  return { from: detectedAt - 30 * MIN, to: verifiedAt, watchUntil: watchUntil ?? verifiedAt + 7 * DAY };
}

/** whether a value from a source may be shown as now (B4): { state, last, stale, age }. sources: { [id]: { state, last (ms) } } from the connection checks;
 *  a source that is not 'ok' or 'limited' is stale (its last value is shown with its time, never as now); an unknown source is stale */
export function freshness(sources, id, now) {
  const s = sources?.[id];
  if (!s) return { state: 'unknown', last: null, stale: true, age: null };
  const last = ms(s.last);
  return { state: s.state, last, stale: !['ok', 'limited'].includes(s.state), age: last == null || now == null ? null : now - last };
}

const https = base => { try { const u = new URL(base); return u.protocol === 'https:' && !u.username && !u.password ? u.origin + u.pathname.replace(/\/$/, '') : null; } catch { return null; } };
const seg = encodeURIComponent;
/**
 * The links of an incident, from the configured sites (no host is written here): { incident, app, alert, runbook, dashboard, pr(n), ticket(id) }.
 *  sites: { wake, alertmanager, grafana, runbooks, github, tickets } (https only; a missing or non-https site gives null links);
 *  incident: { id, cluster, alert, namespace, runbook: { id, version }, dashboard: { uid, slug }, repo }.
 */
export function linksOf(sites, incident) {
  if (!incident?.id || !incident.cluster) return null;
  const s = Object.fromEntries(Object.entries(sites ?? {}).map(([k, v]) => [k, https(v)]));
  const { id, cluster, alert, namespace, runbook, dashboard, repo } = incident;
  return {
    incident: s.wake ? `${s.wake}/clusters/${seg(cluster)}/incidents/${seg(id)}` : null,
    app: `wake://cluster/${seg(cluster)}/incidents/${seg(id)}`,
    alert: s.alertmanager && alert ? `${s.alertmanager}/#/alerts?filter=${encodeURIComponent(`{alertname="${alert}"${namespace ? `,namespace="${namespace}"` : ''}}`)}` : null,
    runbook: s.runbooks && runbook?.id ? `${s.runbooks}/skills/${seg(runbook.id)}${runbook.version ? `/${seg(runbook.version)}` : ''}` : null,
    dashboard: s.grafana && dashboard?.uid ? `${s.grafana}/d/${seg(dashboard.uid)}/${seg(dashboard.slug ?? '')}?orgId=1${namespace ? `&var-namespace=${seg(namespace)}` : ''}` : null,
    pr: n => (s.github && repo && Number.isInteger(n) ? `${s.github}/${repo.split('/').map(seg).join('/')}/pull/${n}` : null),
    ticket: t => (s.tickets && t ? `${s.tickets}/browse/${seg(t)}` : null),
  };
}
