const { withRequestScope } = require('./k8s.cjs');
const { TOOL_CONNECTION_TIMEOUT_MS } = require('../data/tool-connection-limits.js');

const SECOND = 1_000;
const HOUR = 3_600_000;
const MAX_COVERAGE_GAP_MS = 300_000;
const MAX_COVERAGE_GAP_FRACTION = 0.1;
const PERIODS = { '24h': 24 * HOUR, '7d': 168 * HOUR, '30d': 720 * HOUR };
const FIELDS = { total: 'totalCost', cpu: 'cpuCost', memory: 'ramCost', storage: 'pvCost', network: 'networkCost' };
const GROUPS = { namespace: 'namespace', workload: 'namespace,controllerKind,controller', pod: 'namespace,pod', node: 'node' };
const SUBJECTS = ['namespace', 'controllerKind', 'controller', 'pod', 'node'];
const nameOf = value => typeof value === 'string' && /^[a-z0-9](?:[-.a-z0-9]{0,251}[a-z0-9])?$/i.test(value);
const uidOf = value => typeof value === 'string' && /^[a-z0-9-]{1,128}$/i.test(value);
const clusterOf = value => typeof value === 'string' && /^[a-z0-9_.:/-]{1,253}$/i.test(value);
const issue = kind => Object.assign(new Error('OpenCost ' + kind), { kind });
const floorSecond = value => Math.floor(value / SECOND) * SECOND;
const allocationWindow = (start, end) => `${start / SECOND},${end / SECOND}`;

function groupsOf(response) {
  if (!Array.isArray(response?.data)) throw issue('invalid_response');
  return response.data.map(set => {
    if (!set || typeof set !== 'object' || Array.isArray(set)) throw issue('invalid_response');
    return Object.entries(set);
  });
}

function identify(response, uid, nodes) {
  const candidates = new Map();
  for (const [, item] of groupsOf(response).flat()) {
    const { cluster, node } = item?.properties || {};
    if (!clusterOf(cluster) || !nameOf(node)) continue;
    if (!candidates.has(cluster)) candidates.set(cluster, new Set());
    candidates.get(cluster).add(node);
  }
  if (candidates.has(uid)) return uid;
  const matching = [...candidates].filter(([, names]) => [...names].some(node => nodes.has(node)));
  if (matching.length !== 1 || [...matching[0][1]].some(node => !nodes.has(node))) throw issue('identity_unverified');
  return matching[0][0];
}

function requestOf(args, now) {
  const { period = '7d', from, to, view = 'namespace' } = args;
  if (!Object.hasOwn(PERIODS, period) || !Object.hasOwn(GROUPS, view)) throw issue('target');
  const custom = from != null || to != null;
  const requestedEnd = custom ? to : Math.floor(now / 60_000) * 60_000;
  const requestedStart = custom ? from : requestedEnd - PERIODS[period];
  if (!Number.isSafeInteger(requestedStart) || !Number.isSafeInteger(requestedEnd) || requestedStart <= 0
    || requestedEnd <= requestedStart || requestedEnd > now || requestedEnd - requestedStart > PERIODS['30d']) throw issue('target');
  const start = Math.ceil(requestedStart / SECOND) * SECOND;
  const end = floorSecond(requestedEnd);
  if (end <= start) throw issue('target');
  const duration = end - start;
  const step = duration !== PERIODS[period] ? duration : period === '24h' ? HOUR : period === '7d' ? 6 * HOUR : 24 * HOUR;
  const subject = Object.fromEntries(SUBJECTS.filter(key => args[key] != null).map(key => [key, args[key]]));
  if (Object.values(subject).some(value => !nameOf(value)) || !!subject.controllerKind !== !!subject.controller
    || (subject.controller || subject.pod) && !subject.namespace || subject.node && Object.keys(subject).length !== 1) throw issue('target');
  return { start, end, step, view, subject };
}

function filters(cluster, subject) {
  return Object.entries({ cluster, ...subject }).map(([key, value]) => (key === 'controller' ? 'controllerName' : key) + ':"' + value + '"').join('+');
}

function totals(rows) {
  return Object.fromEntries(Object.entries(FIELDS).map(([field, source]) => [field,
    rows.length && rows.every(row => Number.isFinite(row[source])) ? rows.reduce((sum, row) => sum + row[source], 0) : null]));
}

function project(response, cluster, query) {
  const series = [];
  for (let end = query.end; end > query.start; end -= query.step) {
    series.unshift({ start: Math.max(end - query.step, query.start), end, entries: [] });
  }
  const buckets = new Map(series.map(bucket => [bucket.end, bucket]));
  const received = new Set();
  const rows = new Map();
  const records = [], idle = [], unallocated = [];
  for (const set of groupsOf(response)) {
    let bucket;
    for (const [key, item] of set) {
      const props = item?.properties;
      if (props?.cluster !== cluster) throw issue('identity_changed');
      const end = Date.parse(item.window?.end), start = Date.parse(item.window?.start);
      const slot = buckets.get(end);
      if (!slot || slot.start !== start || bucket && slot !== bucket || received.has(slot)) throw issue('invalid_response');
      bucket = slot;
      const idleRow = key.split('/').includes('__idle__');
      const unallocatedRow = key.split('/').includes('__unallocated__');
      if (!idleRow && Object.entries(query.subject).some(([name, value]) => props[name] !== value)) throw issue('identity_changed');
      if (idleRow && Object.keys(query.subject).length) continue;
      records.push(item); bucket.entries.push({ item, assigned: !idleRow });
      if (idleRow) idle.push(item);
      if (unallocatedRow) unallocated.push(item);
      const dimension = query.view === 'workload' ? [props.controllerKind, props.controller] : [props[query.view]];
      const label = idleRow ? '__idle__' : unallocatedRow ? '__unallocated__' : dimension.some(part => !nameOf(part)) ? '__unknown__' : dimension.join('/');
      const rowId = ['pod', 'workload'].includes(query.view) && nameOf(props.namespace) ? props.namespace + '/' + label : label;
      if (!rows.has(rowId)) rows.set(rowId, { id: rowId, name: label, namespace: props.namespace || null,
        kind: props.controllerKind || null, controller: props.controller || null, entries: [] });
      rows.get(rowId).entries.push(item);
    }
    if (bucket) received.add(bucket);
  }
  const complete = bucket => {
    const ranges = bucket.entries.filter(entry => entry.assigned && Number.isFinite(entry.item.totalCost))
      .map(({ item }) => [Date.parse(item.start), Date.parse(item.end)])
      .filter(([start, end]) => start >= bucket.start && end <= bucket.end && end > start)
      .sort(([a], [b]) => a - b);
    const durationMs = bucket.end - bucket.start;
    const allowedGapMs = Math.min(MAX_COVERAGE_GAP_MS, durationMs * MAX_COVERAGE_GAP_FRACTION);
    let coveredMs = 0;
    let coveredUntil = bucket.start;
    for (const [start, end] of ranges) {
      coveredMs += Math.max(0, end - Math.max(start, coveredUntil));
      coveredUntil = Math.max(end, coveredUntil);
    }
    return durationMs - coveredMs <= allowedGapMs;
  };
  const covered = series.filter(complete).length;
  const aggregate = totals(records);
  const observedThrough = series.reduce((latest, bucket) => bucket.entries.reduce((last, { item, assigned }) => {
    const end = Date.parse(item.end);
    return assigned && Number.isFinite(end) && end > bucket.start && end <= bucket.end ? Math.max(last, end) : last;
  }, latest), 0);
  const currency = typeof response.currencyCode === 'string' && /^[A-Z]{3}$/.test(response.currencyCode) ? response.currencyCode : null;
  const basis = typeof response.pricingSource === 'string' && /^[a-z0-9 _.-]{1,100}$/i.test(response.pricingSource) ? response.pricingSource : null;
  return { currency, basis, ...aggregate, idle: totals(idle).total, unallocated: totals(unallocated).total,
    status: !records.length ? 'empty' : covered < series.length || aggregate.total === null ? 'partial' : 'ready',
    covered, slots: series.length, observedThrough: observedThrough || null, start: query.start, end: query.end,
    trend: series.map(({ start, end, entries }) => ({ start, end, value: totals(entries.map(entry => entry.item)).total })),
    rows: [...rows.values()].map(({ entries, ...row }) => ({ ...row, ...totals(entries) })) };
}

function createOpenCost({ client, tools, conns, saveConns, clock = Date.now }) {
  const writing = new Set();
  const configured = id => {
    const bindings = conns().costBindings;
    return Object.hasOwn(bindings || {}, id) ? bindings[id] : null;
  };
  const clusterUid = async client => {
    const ns = await client.request('GET', '/api/v1/namespaces/kube-system');
    if (ns?.kind !== 'Namespace' || ns.apiVersion !== 'v1' || ns.metadata?.name !== 'kube-system' || !uidOf(ns.metadata.uid)) throw issue('identity_unverified');
    return ns.metadata.uid;
  };

  async function run(op, args, signal) {
    const { id } = args;
    const scope = op === 'read' ? { signal } : {
      signal: AbortSignal.any([signal, AbortSignal.timeout(TOOL_CONNECTION_TIMEOUT_MS)]),
      deadline: Date.now() + TOOL_CONNECTION_TIMEOUT_MS,
    };
    let source;
    try {
      const kube = client(id), scoped = withRequestScope(kube, scope);
      if (op === 'targets') return { targets: await tools.costTargets(kube, scope), configured: configured(id) };
      const binding = configured(id);
      if (op === 'read' && !binding) return { status: 'unconfigured' };
      if (op === 'connect' && writing.has(id)) return { status: 'busy' };
      if (op === 'connect') writing.add(id);
      try {
        const uid = await clusterUid(scoped);
        if (op === 'connect') {
          const targets = await tools.costTargets(kube, scope);
          const service = targets.find(row => row.uid === args.service);
          if (!service) throw issue('target');
          source = await tools.costSource(kube, service, scope);
          const now = floorSecond(clock());
          const [sample, inventory] = await Promise.all([
            source.allocation({ window: allocationWindow(now - 2 * HOUR, now), aggregate: 'cluster,node', resolution: '5m' }),
            scoped.request('GET', '/api/v1/nodes'),
          ]);
          if (inventory?.kind !== 'NodeList' || inventory.apiVersion !== 'v1' || !Array.isArray(inventory.items)) throw issue('identity_unverified');
          const nodes = new Set(inventory.items.filter(node => uidOf(node.metadata?.uid)).map(node => node.metadata.name));
          const cluster = identify(sample, uid, nodes);
          await source.validate();
          if (await clusterUid(scoped) !== uid) throw issue('identity_changed');
          scope.signal.throwIfAborted();
          const state = conns();
          const next = { uid, cluster, service };
          state.costBindings = { ...state.costBindings, [id]: next };
          saveConns(state);
          return { status: 'connected', configured: next };
        }
        if (binding.uid !== uid || !clusterOf(binding.cluster) || !nameOf(binding.service?.namespace)
          || !nameOf(binding.service?.name) || !uidOf(binding.service?.uid)) throw issue('identity_changed');
        const query = requestOf(args, clock());
        source = await tools.costSource(kube, binding.service, scope);
        const read = async range => project(await source.allocation({
          window: allocationWindow(range.start, range.end),
          ...(range.step < range.end - range.start ? { step: range.step / HOUR + 'h' } : {}),
          aggregate: [...new Set(['cluster', ...GROUPS[query.view].split(','), ...Object.keys(query.subject)])].join(','),
          includeIdle: String(!Object.keys(query.subject).length), shareIdle: 'false',
          idleByNode: String(query.view === 'node'), filter: filters(binding.cluster, query.subject),
        }), binding.cluster, range);
        const result = await read(query);
        let previous = null;
        if (args.compare === true && result.status === 'ready' && result.currency && result.basis) {
          const prior = await read({ ...query, start: query.start - (query.end - query.start), end: query.start })
            .catch(error => { if (error?.kind === 'identity_changed') throw error; return null; });
          if (prior?.status === 'ready' && prior.currency === result.currency && prior.basis === result.basis) previous = prior.total;
        }
        await source.validate();
        if (await clusterUid(scoped) !== uid) throw issue('identity_changed');
        scope.signal.throwIfAborted();
        return { ...result, previous, configured: binding, receivedAt: clock() };
      } finally { if (op === 'connect') writing.delete(id); }
    } catch (error) {
      const status = signal.aborted ? 'cancelled' : scope.signal.aborted || error?.kind === 'timeout' ? 'timeout'
        : error?.status === 403 || error?.status === 401 || error?.kind === 'forbidden' ? 'forbidden'
          : ['target', 'identity_unverified', 'identity_changed', 'too_large'].includes(error?.kind) ? error.kind : 'failed';
      return { status };
    } finally { source?.close(); }
  }
  /* 연결 상태(설정 › 도구의 OpenCost 행과 비용 화면이 같은 사실): 저장된 연결 기록만, 클러스터에 묻지 않음 */
  const state = id => {
    const binding = configured(id), service = binding?.service;
    return binding && nameOf(service?.namespace) && nameOf(service?.name) ? { status: 'connected', service: `${service.namespace}/${service.name}` } : { status: 'unconfigured' };
  };
  return { run, state };
}

module.exports = { createOpenCost, identify, project, requestOf };
