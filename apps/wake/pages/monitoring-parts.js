import { components as C } from '../../../kit/page/index.js';
import { hm } from './incident-parts.js';

const PAGE_READ_TIMEOUT_MS = 10000;
const MAX_DOCUMENT_READS = 2;
const MAX_RECOVERY_ATTEMPTS = 2;
const GCP_HOME_ROLES = ['cpu', 'memory-evictable', 'memory-non-evictable', 'network-rx', 'network-tx', 'ephemeral-storage-used'];
const monitoringReadKey = input => JSON.stringify([input.connectionId, input.targetId, input.operation, input.queryId]);
const monitoringSourceIdentity = (connection, target, query) => JSON.stringify([connection?.identity, target?.subject, query?.expression]);
function monitoringResult(previous, request, response, error, receivedAt) {
  const lastSuccess = previous?.response?.status === 'ok'
    ? { request: previous.request, response: previous.response, receivedAt: previous.receivedAt } : previous?.lastSuccess;
  return { request, response, error, receivedAt, ...(lastSuccess ? { lastSuccess } : {}) };
}

export function createMonitoringReadQueue() {
  const jobs = new Map(), queued = [], waiting = new Set();
  let active = 0;
  function drain() {
    while (active < MAX_DOCUMENT_READS && queued.length) {
      const job = queued.shift();
      if (jobs.get(job.key) !== job) continue;
      if (!job.valid()) { job.cancel(); continue; }
      job.active = true; active++;
      Promise.resolve().then(() => { if (!job.valid()) throw Object.assign(new Error('read cancelled before dispatch'), { kind: 'cancelled' }); return job.read(); }).then(job.resolve, job.reject).finally(() => {
        active--; jobs.delete(job.key); clearTimeout(job.deadline); job.finished(); drain();
      });
    }
  }
  const queue = {
    has: key => jobs.has(key),
    read(key, read, valid) {
      if (jobs.has(key)) {
        const original = jobs.get(key);
        return new Promise((resolve, reject) => {
          const waiter = { active: true };
          const finish = (value, error) => { if (!waiter.active) return; waiter.active = false; clearTimeout(waiter.deadline); waiting.delete(waiter); if (error) reject(error); else resolve(value); };
          waiter.cancel = () => finish(null, Object.assign(new Error('read wait cancelled'), { kind: 'cancelled' }));
          waiter.deadline = setTimeout(() => finish(null, Object.assign(new Error('native slot wait deadline exceeded'), { kind: 'timeout' })), PAGE_READ_TIMEOUT_MS);
          waiting.add(waiter);
          original.settled.then(() => {
            if (!waiter.active) return;
            if (!valid()) { waiter.cancel(); return; }
            queue.read(key, read, () => waiter.active && valid()).then(value => finish(value), error => finish(null, error));
          });
        });
      }
      return new Promise((resolve, reject) => {
        const job = { key, read, valid, resolve, reject, active: false };
        job.settled = new Promise(done => { job.finished = done; });
        job.cancel = () => { clearTimeout(job.deadline); jobs.delete(key); reject(Object.assign(new Error('read cancelled before dispatch'), { kind: 'cancelled' })); };
        job.deadline = setTimeout(() => {
          if (!job.active) jobs.delete(key);
          reject(Object.assign(new Error('page read deadline exceeded'), { kind: 'timeout' }));
        }, PAGE_READ_TIMEOUT_MS);
        jobs.set(key, job); queued.push(job); drain();
      });
    },
    cancelDisplay() {
      for (const job of queued.splice(0)) if (jobs.get(job.key) === job) job.cancel();
      for (const job of jobs.values()) if (job.active) { clearTimeout(job.deadline); job.reject(Object.assign(new Error('read display cancelled'), { kind: 'cancelled' })); }
      for (const waiter of [...waiting]) waiter.cancel();
    },
  };
  return queue;
}

function createMonitoringRecovery({ clock, random = Math.random, retry, changed = () => {} }) {
  const episodes = new Map();
  let timer = null, generation = 0, plannedKeys = new Set();
  function cancelTimer() { generation++; if (timer !== null) clearTimeout(timer); timer = null; }
  function stop() { cancelTimer(); for (const episode of episodes.values()) episode.nextAt = null; }
  function schedule(entries) {
    cancelTimer(); plannedKeys = new Set(entries.map(entry => entry.key)); const now = Date.parse(clock());
    for (const entry of entries) {
      let episode = episodes.get(entry.key);
      if (episode && episode.identity !== entry.identity) { episode.blocked = true; stop(); changed(); return; }
      if (!episode) { episode = { attempts: 0, identity: entry.identity, nextAt: null }; episodes.set(entry.key, episode); }
      const interval = entry.query.polling?.intervalSeconds;
      if (entry.result?.response?.status === 'ok') { episode.attempts = 0; episode.nextAt = null; continue; }
      const recoverable = ['empty', 'network_error', 'not_queried'].includes(entry.result?.response?.status) || entry.result?.error === 'timeout';
      if (episode.blocked || !recoverable || entry.query.polling?.supported !== true || !Number.isInteger(interval) || interval < 5 || episode.attempts >= MAX_RECOVERY_ATTEMPTS) { episode.nextAt = null; continue; }
      if (episode.nextAt === null) episode.nextAt = now + Math.max(interval * (episode.attempts ? 4 : 2), episode.attempts ? 60 : 30) * 1000 + random() * interval * 1000;
    }
    const due = entries.filter(entry => episodes.get(entry.key)?.nextAt != null);
    if (!due.length) { changed(); return; }
    const nextAt = Math.min(...due.map(entry => episodes.get(entry.key).nextAt)), seq = generation;
    timer = setTimeout(async () => {
      timer = null;
      if (seq !== generation) return;
      const selected = due.filter(entry => episodes.get(entry.key).nextAt <= Date.parse(clock()));
      for (const entry of selected) { const episode = episodes.get(entry.key); episode.attempts++; episode.nextAt = null; }
      changed();
      await retry(selected);
    }, Math.max(0, nextAt - now));
    changed();
  }
  return { schedule, stop, reset() { stop(); episodes.clear(); }, state: () => [...episodes].filter(([key]) => plannedKeys.has(key)).map(([key, value]) => ({ key, ...value })) };
}
function monitoringConversion(unit) {
  if (unit === 's' || unit === 'seconds') return { unit: 'ms', multiplier: 1000 };
  if (unit === 'cores' || unit === 'core') return { unit: 'mCPU', multiplier: 1000 };
  if (unit === 'bytes/s' || unit === 'B/s') return { unit: 'By/s', multiplier: 1 };
  if (unit === 'ratio') return { unit: '%', multiplier: 100 };
  if (['bytes', 'By', 'Bytes'].includes(unit)) return { unit: 'MiB', multiplier: 1 / 1048576 };
  return { unit, multiplier: 1 };
}
function formatMonitoringValue(value, unit = '', compact = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const conversion = monitoringConversion(unit);
  const digits = compact && ['MiB', 'mCPU'].includes(conversion.unit) ? 0 : conversion.unit === 'MiB' ? 1 : 2;
  return (Number(value) * conversion.multiplier).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + conversion.unit;
}
function monitoringSampleAxis(matrix, { compact = false } = {}) {
  const epochs = [...new Set(matrix.flatMap(series => series.values.map(([at]) => at)))].sort((a, b) => a - b);
  const iso = epochs.map(epoch => new Date(epoch * 1000).toISOString());
  let labels = iso.map(value => compact ? value.slice(11, 19) : value.slice(5, 19).replace('T', ' '));
  const duplicates = values => new Set(values.filter((value, index) => values.indexOf(value) !== index));
  const shortDuplicates = duplicates(labels);
  labels = labels.map((label, index) => shortDuplicates.has(label) ? iso[index].slice(5, 19).replace('T', ' ') : label);
  const secondDuplicates = duplicates(labels);
  labels = labels.map((label, index) => secondDuplicates.has(label) ? `${label}.${String(epochs[index]).split('.')[1] || '0'}` : label);
  const preciseDuplicates = duplicates(labels);
  labels = labels.map((label, index) => preciseDuplicates.has(label) ? `${iso[index].slice(0, 4)}-${label}` : label);
  return { epochs, labels };
}
function monitoringSeriesLabels(query, matrix, { nodeNames = false } = {}) {
  const names = matrix.map(item => { const metric = item.metric || {}; return [metric.service || metric.pod || (nodeNames ? metric.node_name : null) || metric.instance || metric.__name__ || query.title || query.queryId, metric.container || metric.job].filter(Boolean).join(' · '); });
  return matrix.map((item, index) => {
    const peers = matrix.filter((_, other) => names[other] === names[index]);
    if (peers.length === 1) return names[index];
    const keys = [...new Set(peers.flatMap(peer => Object.keys(peer.metric || {})))].sort().filter(key => new Set(peers.map(peer => Object.hasOwn(peer.metric || {}, key) ? JSON.stringify(peer.metric[key]) : undefined)).size > 1);
    return names[index] + ' · ' + (keys.length ? keys.map(key => Object.hasOwn(item.metric || {}, key) ? `${key}=${JSON.stringify(item.metric[key])}` : `!${key}`).join(' · ') : String(index + 1));
  });
}
export function monitoringChartData(query, response, { compact = false, nodeNames = false, timeAxisWindow, sourceIdentity, prometheusRange = false } = {}) {
  const matrix = response?.status === 'ok' ? response.data?.matrix || [] : [];
  const conversion = monitoringConversion(response?.data?.unit || query.unit || '');
  const axis = monitoringSampleAxis(matrix, { compact }), times = axis.epochs, names = monitoringSeriesLabels(query, matrix, { nodeNames });
  const inWindow = !prometheusRange || (timeAxisWindow && matrix.every(item => item.values.every(([at]) => at >= Date.parse(timeAxisWindow.from) / 1000 && at <= Date.parse(timeAxisWindow.to) / 1000)));
  if (timeAxisWindow && inWindow) {
    const source = response?.data?.source, sampling = source?.sampling, provenance = sampling?.provenance;
    const period = sampling?.samplePeriodSeconds;
    const verified = source?.provider === 'gcp-monitoring' && sampling?.status === 'ok' && sampling.mode === 'source-points'
      && provenance?.kind === 'metricDescriptor.metadata' && provenance.provider === source.provider
      && typeof provenance.contextId === 'string' && provenance.contextId === sourceIdentity?.cluster
      && typeof provenance.projectId === 'string' && provenance.projectId === sourceIdentity?.projectId
      && typeof provenance.metricType === 'string' && provenance.metricType === source.metricType
      && Number.isFinite(period) && period > 0 && Number.isFinite(period * 1.5);
    const step = Number(timeAxisWindow.step), responseWindow = response?.queryWindow;
    const evaluated = prometheusRange && !verified && Number.isFinite(step) && step > 0 && responseWindow
      && ['from', 'to', 'step'].every(key => responseWindow[key] === timeAxisWindow[key]);
    const tolerance = evaluated ? Math.max(1e-6, step * 1e-9) : 0;
    const maxGapSeconds = verified ? period * 1.5 : evaluated ? step + tolerance : null;
    const finiteSample = sample => sample !== null && sample !== undefined && Number.isFinite(Number(sample));
    const joins = (at, value, before) => maxGapSeconds !== null && before !== undefined && finiteSample(value) && finiteSample(before[1]) && at > before[0] && at - before[0] <= maxGapSeconds
      && (evaluated ? Math.abs(at - before[0] - step) <= tolerance : response.data.transform?.resetCount === 0);
    const series = matrix.map((item, index) => {
      const observations = item.values.map(([at, value], point) => ({ at, value: value === null ? null : Number((Number(value) * conversion.multiplier).toPrecision(6)),
        joinPrevious: joins(at, value, item.values[point - 1]) }));
      return { key: monitoringMetricSeriesKey(query, response, item.metric), name: names[index], color: ['--series-1', '--series-2', '--series-3'][index % 3], observations };
    });
    const finite = series.flatMap(item => item.observations.map(point => point.value).filter(value => value !== null && Number.isFinite(value)));
    const positive = finite.filter(value => value > 0), max = positive.length ? Math.max(...positive) : 1;
    const tickIndexes = compact ? [0, times.length - 1] : [0, Math.floor((times.length - 1) / 2), times.length - 1];
    const ticks = [...new Set(tickIndexes)].filter(index => index >= 0 && index < times.length).map(index => ({ at: times[index], label: axis.labels[index] }));
    return { kind: 'area', fade: true, reading: true, groupedValues: true, timeAxis: { from: Date.parse(timeAxisWindow.from) / 1000, to: Date.parse(timeAxisWindow.to) / 1000, ticks, maxGapSeconds }, series, max,
      ticks: [0, Number((max / 2).toPrecision(3)), Number(max.toPrecision(3))], unit: conversion.unit };
  }
  const series = matrix.map((item, index) => {
    const name = names[index];
    return { name, color: ['--series-1', '--series-2', '--series-3'][index % 3], values: times.map(time => { const pair = item.values.find(([at]) => at === time); return pair?.[1] != null && Number.isFinite(Number(pair[1])) ? Number((Number(pair[1]) * conversion.multiplier).toPrecision(6)) : null; }) };
  });
  const finite = series.flatMap(item => item.values.filter(Number.isFinite));
  const positive = finite.filter(value => value > 0), max = positive.length ? Math.max(...positive) : 1;
  return { kind: 'area', fade: true, reading: true, groupedValues: true, x: axis.labels, series, max, ticks: [0, Number((max / 2).toPrecision(3)), Number(max.toPrecision(3))], unit: conversion.unit };
}
function monitoringConnections(catalog, cluster) {
  return (catalog?.connections || []).filter(connection => connection.identity?.cluster === cluster);
}
function monitoringResourceKey(metric) {
  const keys = ['project_id', 'location', 'cluster_name', 'node_name'];
  return keys.every(key => typeof metric?.[key] === 'string' && metric[key]) ? JSON.stringify(['k8s_node', ...keys.map(key => metric[key])]) : null;
}
function monitoringMetricSeriesKey(query, response, metric) {
  return JSON.stringify([monitoringResourceKey(metric), query.queryId, response?.data?.source?.metricType || query.expression || null, Object.entries(metric).sort(([a], [b]) => a.localeCompare(b))]);
}
export function createHomeMonitoring({ cluster, service, available, update, now = () => new Date().toISOString(), random = Math.random }) {
  const state = { status: 'loading', items: [], window: null, receivedAt: null, intervalSeconds: null, recovery: [] };
  let sequence = 0, timer = null, disposed = false;
  const responseTimers = new Set(), reader = createMonitoringReadQueue();
  const recovery = createMonitoringRecovery({ clock: now, random, retry: retryFailed, changed: () => { state.recovery = recovery.state(); } });
  async function responseBeforeDeadline(promise) {
    let deadline;
    try { return await Promise.race([promise, new Promise((_, reject) => { deadline = setTimeout(() => reject(Object.assign(new Error('service response deadline exceeded'), { kind: 'timeout' })), PAGE_READ_TIMEOUT_MS); responseTimers.add(deadline); })]); }
    finally { clearTimeout(deadline); responseTimers.delete(deadline); }
  }
  function stop() { if (timer !== null) { clearTimeout(timer); timer = null; } recovery.stop(); }
  const itemKey = item => JSON.stringify([item.connection.connectionId, item.target.targetId]);
  function plannedQueries(item) {
    const metrics = item.target.queries.filter(query => query.operation === 'metrics' && query.role);
    return item.connection.provider === 'gcp-monitoring' ? GCP_HOME_ROLES.flatMap(role => metrics.filter(query => query.role === role)) : metrics;
  }
  function entries() {
    return state.items.flatMap(item => plannedQueries(item).map(query => ({
      key: monitoringReadKey({ connectionId: item.connection.connectionId, targetId: item.target.targetId, operation: query.operation, queryId: query.queryId }),
      query, item, result: item.results[query.queryId], identity: monitoringSourceIdentity(item.connection, item.target, query),
    })));
  }
  async function read(item, query, seq, previous) {
    const request = { requestId: 'monitor:' + crypto.randomUUID(), connectionId: item.connection.connectionId, targetId: item.target.targetId, queryId: query.queryId, operation: query.operation, queryWindow: item.window };
    let response = null, error = null;
    try {
      response = await reader.read(monitoringReadKey(request), () => service('observability.read', request), () => seq === sequence && !disposed);
      if (response?.requestId !== request.requestId || response.connectionId !== request.connectionId || response.targetId !== request.targetId || response.queryId !== request.queryId || JSON.stringify(response.queryWindow) !== JSON.stringify(item.window)) { response = null; error = 'invalid_response'; }
    } catch (failure) { error = failure?.status === 403 ? 'forbidden' : failure?.kind === 'timeout' ? 'timeout' : 'query_error'; }
    return monitoringResult(previous, request, response, error, now());
  }
  function schedule() {
    const all = entries(); state.intervalSeconds = null; recovery.schedule(all);
    if (all.length && all.every(({ query, result }) => query.polling?.supported === true && Number.isInteger(query.polling.intervalSeconds) && query.polling.intervalSeconds >= 5 && result?.response?.polling?.supported === true && result.response.status === 'ok')) {
      recovery.stop(); state.recovery = [];
      state.intervalSeconds = Math.max(...all.map(({ query }) => query.polling.intervalSeconds));
      timer = setTimeout(() => { timer = null; void load({ automatic: true }); }, state.intervalSeconds * 1000);
    }
  }
  async function retryFailed(selected) {
    if (disposed || !selected.length) return;
    const seq = sequence, staged = state.items.map(item => ({ ...item, results: { ...item.results } }));
    let received = false;
    await Promise.allSettled(selected.map(async entry => {
      if (reader.has(entry.key)) return;
      const item = staged.find(item => itemKey(item) === itemKey(entry.item));
      if (item) { item.results[entry.query.queryId] = await read(item, entry.query, seq, item.results[entry.query.queryId]); received = true; }
    }));
    if (disposed || seq !== sequence) return;
    state.items = staged; if (received) state.receivedAt = now(); schedule(); update();
  }
  async function load({ automatic = false, minutes = 15 } = {}) {
    stop(); state.intervalSeconds = null; const seq = ++sequence; reader.cancelDisplay();
    if (!automatic) recovery.reset();
    if (!available()) { state.status = 'unsupported_host'; update(); return; }
    const to = now(), window = { from: new Date(Date.parse(to) - minutes * 60_000).toISOString(), to, step: Math.max(30, minutes) };
    try {
      const catalog = await responseBeforeDeadline(service('observability.catalog', {}));
      if (seq !== sequence || disposed) return;
      const connections = monitoringConnections(catalog, cluster);
      const staged = connections.flatMap(connection => (connection.targets || []).map(target => {
        const item = { connection, target, results: {}, window };
        if (connection.provider === 'gcp-monitoring') item.results = { ...state.items.find(old => itemKey(old) === itemKey(item))?.results };
        return item;
      }));
      await Promise.allSettled(staged.flatMap(item => plannedQueries(item).map(async query => {
        const prior = state.items.find(old => itemKey(old) === itemKey(item));
        const previous = prior?.results[query.queryId];
        const sameIdentity = !prior || monitoringSourceIdentity(prior.connection, prior.target, prior.target.queries.find(old => old.queryId === query.queryId)) === monitoringSourceIdentity(item.connection, item.target, query);
        if (automatic && !sameIdentity) { item.results[query.queryId] = { error: 'identity_changed', receivedAt: now(), previousIdentity: { identity: prior.connection.identity, subject: prior.target.subject, result: previous } }; return; }
        item.results[query.queryId] = await read(item, query, seq, sameIdentity ? previous : null);
      })));
      if (seq !== sequence || disposed) return;
      state.items = staged; state.window = window; state.status = connections.length ? 'ok' : 'unconfigured'; state.receivedAt = now(); schedule();
    } catch (error) { if (seq === sequence && !disposed) state.status = error?.status === 403 ? 'forbidden' : 'query_error'; }
    if (seq === sequence && !disposed) update();
  }
  const OVERVIEW_ROLES = { cpu: ['cpu'], memory: ['memory', 'memory-non-evictable'], network: ['network-rx', 'network-tx'], filesystem: ['ephemeral-storage-used'], pod: ['pods', 'pod-count'] };
  /* why the home chart has nothing to draw: a source/read state (a wake.monitor.status key), or 'empty' when every read succeeded without a sample */
  function overviewStatus(metric) {
    if (state.status !== 'ok') return state.status;
    let missing = true;
    for (const item of state.items) {
      if (!['Node', 'Cluster'].includes(item.target.subject?.kind)) continue;
      for (const query of plannedQueries(item).filter(q => (OVERVIEW_ROLES[metric] || []).includes(q.role))) {
        missing = false;
        const result = item.results[query.queryId], status = result?.error || result?.response?.status || 'loading';
        if (status !== 'ok' && status !== 'empty') return status;
      }
    }
    return missing ? 'not_requested' : 'empty';
  }
  function overview({ t, height, metric }) {
    const roles = OVERVIEW_ROLES;
    if (!(height > 0) || state.status !== 'ok') return null;
    const pointStamp = new Intl.DateTimeFormat(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
    for (const item of state.items) {
      if (!['Node', 'Cluster'].includes(item.target.subject?.kind)) continue;
      const queries = plannedQueries(item);
      const selected = (metric ? [roles[metric] || []] : [roles.cpu, roles.memory]).map(roles => roles
        .map(role => queries.find(q => q.role === role && item.results[q.queryId]?.response?.status === 'ok')).find(Boolean));
      const nodeKey = metric => monitoringResourceKey(metric) || metric?.instance || metric?.node;
      const nodes = new Map();
      for (const query of selected.filter(Boolean)) {
        for (const { metric } of item.results[query.queryId].response.data.matrix) {
          const key = nodeKey(metric);
          if (key && !nodes.has(key)) nodes.set(key, nodes.size);
        }
      }
      const cards = selected.map(query => {
        if (!query) return null;
        const { response, request } = item.results[query.queryId];
        const chart = monitoringChartData(query, response, { compact: true, nodeNames: true,
          timeAxisWindow: ['gcp-monitoring', 'prometheus'].includes(item.connection.provider) ? request.queryWindow : undefined, prometheusRange: item.connection.provider === 'prometheus', sourceIdentity: item.connection.identity });
        chart.series = chart.series.map((series, index) => {
          const slot = nodes.get(nodeKey(response.data.matrix[index].metric));
          const appearance = slot === undefined ? {} : C.chartCard.seriesAppearance(slot);
          return { ...series, ...appearance, ...(series.observations ? {
            observations: series.observations.map(point => ({ ...point, label: pointStamp.format(point.at * 1000) })),
          } : {}) };
        });
        const points = response.data.matrix.flatMap(series => series.values.filter(([, value]) => value !== null && Number.isFinite(Number(value))));
        if (!points.length || (!chart.timeAxis && chart.x.length < 2)) return null;
        const peak = points.reduce((max, [, value]) => Math.max(max, Number(value)), -Infinity);
        const shownValue = formatMonitoringValue(peak, response.data.unit || query.unit || '', true);
        const title = query.role === 'memory-non-evictable' ? t('wake.overview.nonEvictableMemory') : ['cpu', 'memory'].includes(query.role) ? t('wake.monitor.metric.' + query.role) : query.label || metric;
        const { from, to } = request.queryWindow;
        const axis = chart.timeAxis ? { ...chart.timeAxis, ticks: [from, to].map(value => ({ at: Date.parse(value) / 1000, label: hm(Date.parse(value)) })) } : null;
        const { epochs } = monitoringSampleAxis(response.data.matrix, { compact: true });
        const compactAxis = axis ? { timeAxis: axis } : { x: epochs.map(at => hm(at * 1000)), xTicks: [0, epochs.length - 1] };
        const legend = chart.series.map((series, index) => {
          const metric = response.data.matrix[index].metric;
          return { label: metric?.node_name?.split('-').at(-1) || metric?.instance?.replace(/:\d+$/, '') || series.name,
            color: series.color, title: series.name };
        });
        /* one series named like the card says nothing the title does not */
        const repeatsTitle = legend.length === 1 && [legend[0].label, legend[0].title].some(label => String(label).toLowerCase() === String(title).toLowerCase());
        const showLegend = !repeatsTitle && legend.length <= 4 && legend.every(entry => entry.label.length <= 20)
          && new Set(legend.map(entry => entry.label)).size === legend.length;
        /* the axis keeps the whole asked window; when samples cover only part of it, say which part (never stretched, never zero-filled) */
        const sampled = points.map(([at]) => Number(at)).filter(Number.isFinite);
        const firstAt = Math.min(...sampled), lastAt = Math.max(...sampled);
        const windowFrom = Date.parse(from) / 1000, windowTo = Date.parse(to) / 1000, slack = Math.max(Number(request.queryWindow.step) || 0, 60) * 2;
        const partial = Number.isFinite(windowFrom) && Number.isFinite(windowTo) && (firstAt - windowFrom > slack || windowTo - lastAt > slack);
        const collected = partial ? t('wake.overview.collected', { from: hm(firstAt * 1000), to: hm(lastAt * 1000) }) : '';
        /* the same plate as the simulation's chart in a bar (sim-views.js chart): a widget with no title of its own (the bar's head names it), no face or ring of its own.
           The caption stays: its value is the window's peak over the Node lines, not the bar head's value, and says so */
        return C.chartCard.render({ density: 'compact', widget: true, hideTitle: true, title, legend: showLegend ? legend : undefined,
          caption: [t('wake.overview.periodPeak'), shownValue, collected].filter(Boolean).join(' · '), chart: { ...chart, ...compactAxis, height, kind: 'line', axisUnit: false, bleed: true, fade: true, reading: true, axes: true } });
      });
      if (cards.some(Boolean)) return metric ? cards.find(Boolean) : cards.filter(Boolean);
    }
    return null;
  }
  return { state, load, overview, overviewStatus, dispose() { disposed = true; sequence++; stop(); reader.cancelDisplay(); for (const deadline of responseTimers) clearTimeout(deadline); responseTimers.clear(); } };
}
