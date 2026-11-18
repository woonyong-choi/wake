const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const LIMITS = Object.freeze({ rangeSeconds: 86400, points: 11000, timeoutMs: 10000, bodyBytes: 2097152 });
const OPERATIONS = Object.freeze({ kubernetes: ['logs', 'events'], prometheus: ['metrics'], gitops: ['changes'], cloudwatch: ['logs', 'metrics'], 'gcp-monitoring': ['metrics'] });
const { commandPath } = require('./connect-cli.cjs');
const ID = /^[\w.:-]{1,200}$/;
const NAME = /^[a-z0-9][a-z0-9.-]{0,252}$/;
const fail = status => Object.assign(new Error(status), { status });
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = value => typeof value === 'string' && ID.test(value);
const isName = value => typeof value === 'string' && NAME.test(value);
const isText = value => typeof value === 'string' && value.length > 0 && value.length <= 8192;

const BINDING_LIMITS = Object.freeze({ entries: 4096, keyUnits: 32768, totalUnits: 4194304 });
const CONNECTION_BINDING_KEYS = Object.freeze(['id', 'provider', 'contextId', 'origin', 'account', 'profile', 'region', 'namespace', 'logGroup', 'projectId', 'location', 'clusterName', 'credentialSource', 'targets', 'title', 'label', 'icon']);
const SUBJECT_BINDING_KEYS = Object.freeze(['kind', 'name', 'pod', 'namespace', 'uid', 'container', 'context', 'logGroup']);
const QUERY_BINDING_KEYS = Object.freeze(['id', 'operation', 'expression', 'unit', 'role', 'title', 'polling', 'numerator', 'denominator', 'mode', 'expectedLabels', 'metric', 'previous', 'templateId']);
function bindingSafe(action) { try { return action(); } catch { return null; } }
function bindingKeys(value, allowed) {
  if (!isObject(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('binding unavailable');
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!allowed.includes(key) || !Object.hasOwn(descriptor, 'value')) throw new Error('binding unavailable');
  }
}
function bindingScalar(value) {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  throw new Error('binding unavailable');
}
function bindingCanonical(value) {
  let remaining = BINDING_LIMITS.keyUnits;
  const emit = text => { remaining -= text.length; if (remaining < 0) throw new Error('binding unavailable'); return text; };
  function encode(item, depth) {
    if (depth > 12) throw new Error('binding unavailable');
    if (item === null || ['string', 'boolean', 'number'].includes(typeof item)) return emit(JSON.stringify(bindingScalar(item)));
    if (Array.isArray(item)) {
      if (item.length > BINDING_LIMITS.entries) throw new Error('binding unavailable');
      return emit('[') + item.map(entry => encode(entry, depth + 1)).join(emit(',')) + emit(']');
    }
    if (!isObject(item) || ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new Error('binding unavailable');
    const descriptors = Object.getOwnPropertyDescriptors(item), keys = Object.keys(descriptors).sort();
    if (keys.length > BINDING_LIMITS.entries) throw new Error('binding unavailable');
    return emit('{') + keys.map(key => {
      if (!Object.hasOwn(descriptors[key], 'value')) throw new Error('binding unavailable');
      return emit(JSON.stringify(key) + ':') + encode(descriptors[key].value, depth + 1);
    }).join(emit(',')) + emit('}');
  }
  const result = encode(value, 0);
  if (result.length > BINDING_LIMITS.keyUnits) throw new Error('binding unavailable');
  return result;
}
function bindingCopy(value) { return JSON.parse(bindingCanonical(value)); }
function bindingIdentity(connection) {
  const identity = { source: 'observability-connections.v1' };
  for (const [key, field] of Object.entries({ account: 'account', region: 'region', cluster: 'contextId', namespace: 'namespace' })) identity[key] = bindingScalar(connection[field]);
  if (connection.provider === 'gcp-monitoring') for (const key of ['projectId', 'location', 'clusterName']) identity[key] = bindingScalar(connection[key]);
  return identity;
}
function bindingDefinition(connection, target, query) {
  bindingKeys(connection, CONNECTION_BINDING_KEYS);
  bindingKeys(target, ['id', 'label', 'subject', 'queries', 'logStreamNames']);
  bindingKeys(target.subject, SUBJECT_BINDING_KEYS);
  bindingKeys(query, QUERY_BINDING_KEYS);
  if (!isId(connection.id) || !isId(target.id) || !isId(query.id) || !OPERATIONS[connection.provider]?.includes(query.operation)) throw new Error('binding unavailable');
  if (query.polling !== undefined) bindingKeys(query.polling, ['supported', 'intervalSeconds', 'reason']);
  const subject = Object.fromEntries(Object.keys(target.subject).map(key => [key, bindingScalar(target.subject[key])]));
  const queryDefinition = Object.fromEntries(['expression', 'unit', 'role', 'numerator', 'denominator'].map(key => [key, bindingScalar(query[key])]));
  const publicTuple = { provider: connection.provider, connectionId: connection.id, targetId: target.id, queryId: query.id, operation: query.operation, identity: bindingIdentity(connection), subject, queryDefinition };
  let execution;
  if (connection.provider === 'prometheus') {
    if (!['range', 'instant', undefined].includes(query.mode)) throw new Error('binding unavailable');
    if (!isObject(query.expectedLabels) || Object.values(query.expectedLabels).some(value => typeof value !== 'string')) throw new Error('binding unavailable');
    execution = { contextId: connection.contextId, api: 'prometheus/v1', mode: query.mode === 'instant' ? 'instant' : 'range', expectedLabels: query.expectedLabels };
  } else if (connection.provider === 'cloudwatch') {
    execution = { api: query.operation === 'metrics' ? 'get-metric-statistics/v1' : 'filter-log-events/v1', profile: connection.profile };
    if (query.operation === 'metrics') {
      bindingKeys(query.metric, ['namespace', 'name', 'statistic', 'dimensions']);
      if (!Array.isArray(query.metric.dimensions)) throw new Error('binding unavailable');
      for (const dimension of query.metric.dimensions) bindingKeys(dimension, ['name', 'value']);
      execution.metric = query.metric;
    } else Object.assign(execution, { logGroup: connection.logGroup, streams: target.logStreamNames ?? null, groupTarget: target.subject.logGroup === connection.logGroup });
  } else if (connection.provider === 'gcp-monitoring') {
    bindingKeys(connection.credentialSource, ['kind', 'command']);
    const template = gcpTemplate(query);
    execution = { endpoint: GCP_ORIGIN, api: 'monitoring/v3', templateId: query.templateId, template, credentialSource: connection.credentialSource };
  } else execution = { contextId: connection.contextId, api: connection.provider === 'gitops' ? 'argoproj.io/v1alpha1/applications' : 'v1/pods', previous: query.previous === true };
  return { publicTuple: bindingCopy(publicTuple), key: bindingCanonical({ domain: 'wake.observability.definition.v1', ...publicTuple, execution }) };
}

function parseWindow(value) {
  if (!isObject(value)) throw fail('invalid_request');
  const parse = text => {
    if (typeof text !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(text)) throw fail('invalid_request');
    const time = Date.parse(text);
    if (!Number.isFinite(time) || new Date(time).toISOString().replace('.000Z', 'Z') !== text.replace('.000Z', 'Z')) throw fail('invalid_request');
    return time;
  };
  const from = parse(value.from), to = parse(value.to), step = value.step;
  if (!(from < to) || to - from > LIMITS.rangeSeconds * 1000) throw fail('invalid_request');
  if (!Number.isInteger(step) || step < 1 || (to - from) / (step * 1000) > LIMITS.points) throw fail('invalid_request');
  return { from: value.from, to: value.to, step };
}

function parseOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw fail('unconfigured'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw fail('unconfigured');
  if (url.pathname !== '/' || url.search || url.hash) throw fail('unconfigured');
  if (/^(169\.254\.|0\.|metadata\.)/i.test(url.hostname) || url.hostname === '[::]' || url.hostname === '[fd00:ec2::254]') throw fail('unconfigured');
  return url.origin;
}

function loadConfig(userData) {
  try {
    const file = path.join(userData, 'observability-connections.json');
    if (fs.statSync(file).size > LIMITS.bodyBytes) throw fail('invalid_configuration');
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value.version !== 1 || !Array.isArray(value.connections)) throw fail('invalid_configuration');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, connections: [] };
    throw fail('invalid_configuration');
  }
}

function validateConnection(connection, contextIds) {
  if (!isObject(connection) || !isId(connection.id) || !Object.hasOwn(OPERATIONS, connection.provider)) throw fail('invalid_configuration');
  if (!Array.isArray(connection.targets) || connection.targets.length > 500) throw fail('invalid_configuration');
  const ids = new Set();
  for (const target of connection.targets) {
    if (!isObject(target) || !isId(target.id) || ids.has(target.id)) throw fail('invalid_configuration');
    ids.add(target.id);
    if (!Array.isArray(target.queries) || !isObject(target.subject)) throw fail('invalid_configuration');
    const queries = new Set();
    for (const query of target.queries) {
      if (!isObject(query) || !isId(query.id) || queries.has(query.id) || !OPERATIONS[connection.provider].includes(query.operation)) throw fail('invalid_configuration');
      queries.add(query.id);
      if (query.expression !== undefined && !isText(query.expression)) throw fail('invalid_configuration');
    }
  }
  /* 도구 주소는 저장하지 않는다: 도구 탭은 클러스터 안에서 찾은 도구의 포트 포워딩 주소로만 연다(tools.cjs) */
  if (Object.hasOwn(connection, 'tools')) return false;
  if (['kubernetes', 'gitops', 'prometheus'].includes(connection.provider) && !contextIds.includes(connection.contextId)) return false;
  if (connection.provider === 'prometheus') {
    /* 주소는 저장하지 않는다: 허브가 그 클러스터 안 Prometheus를 찾아 Kubernetes API 포트 포워딩으로 닿는다(prometheusOrigin) */
    if (Object.hasOwn(connection, 'origin')) return false;
    if (connection.targets.some(t => t.queries.some(q => !isText(q.expression) || !isObject(q.expectedLabels) || !Object.keys(q.expectedLabels).length))) return false;
  }
  if (connection.provider === 'cloudwatch') {
    if (typeof connection.account !== 'string' || !/^\d{12}$/.test(connection.account)) return false;
    if (!/^[\w.-]{1,128}$/.test(connection.profile || '') || connection.profile === 'default') return false;
    if (!/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(connection.region || '')) return false;
    if (!/^[.\w/#-]{1,512}$/.test(connection.logGroup || '')) return false;
  }
  if (connection.provider === 'gcp-monitoring') return validGcpConnection(connection, contextIds);
  return true;
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(LIMITS.timeoutMs), headers: { accept: 'application/json' } });
  if ([401, 403].includes(response.status)) throw fail('forbidden');
  if (!response.ok) throw fail('network_error');
  const declaredSize = Number(response.headers.get('content-length'));
  if (declaredSize > LIMITS.bodyBytes) throw fail('invalid_response');
  const reader = response.body?.getReader();
  if (!reader) throw fail('invalid_response');
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS.bodyBytes) throw fail('invalid_response');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('invalid_response'); }
}

function resolveAwsExecutable() {
  try {
    const found = commandPath('aws');
    if (!found) throw fail('unconfigured');
    const executable = fs.realpathSync(found);
    if (!fs.statSync(executable).isFile()) throw fail('unconfigured');
    fs.accessSync(executable, fs.constants.X_OK);
    return executable;
  } catch { throw fail('unconfigured'); }
}

function awsEnvironment() {
  return { HOME: os.userInfo().homedir, LANG: 'en_US.UTF-8', PATH: '/usr/bin:/bin',
    AWS_EC2_METADATA_DISABLED: 'true', AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off', AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: 'true' };
}

function runAws(args, execFileImpl, executable) {
  return new Promise((resolve, reject) => {
    execFileImpl(executable, args, { timeout: LIMITS.timeoutMs, maxBuffer: LIMITS.bodyBytes, env: awsEnvironment(), shell: false }, (error, stdout, stderr) => {
      if (error) return reject(fail(/AccessDenied|Unauthorized|Forbidden/.test(String(stderr)) ? 'forbidden' : 'network_error'));
      try { resolve(JSON.parse(stdout)); } catch { reject(fail('invalid_response')); }
    });
  });
}

async function verifyAwsAccount(connection, execFileImpl, executable) {
  const identity = await runAws(['sts', 'get-caller-identity', '--profile', connection.profile, '--region', connection.region, '--output', 'json', '--no-cli-pager'], execFileImpl, executable);
  if (identity?.Account !== connection.account) throw fail('forbidden');
}

function makeData(query) {
  return { matrix: [], records: [], raw: null, unit: query?.unit ?? null, numerator: query?.numerator ?? null, denominator: query?.denominator ?? null };
}

async function readPrometheus({ connection, target, query, window, fetchImpl, prometheusOrigin, signal }) {
  if (!isText(query.expression)) throw fail('unconfigured');
  if (!isObject(query.expectedLabels) || !Object.keys(query.expectedLabels).length) throw fail('unconfigured');
  const instant = query.mode === 'instant';
  const url = new URL(instant ? '/api/v1/query' : '/api/v1/query_range', parseOrigin(await prometheusOrigin(connection.contextId, signal)));
  const params = instant ? { query: query.expression, time: Date.parse(window.to) / 1000 } : { query: query.expression, start: Date.parse(window.from) / 1000, end: Date.parse(window.to) / 1000, step: window.step };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const raw = await fetchJson(url, fetchImpl);
  if (raw.status !== 'success' || raw.data?.resultType !== (instant ? 'vector' : 'matrix') || !Array.isArray(raw.data.result)) throw fail('invalid_response');
  let count = 0, newest = null;
  const matrix = raw.data.result.map(series => {
    if (!isObject(series.metric) || Object.values(series.metric).some(value => typeof value !== 'string')) throw fail('invalid_response');
    const sourceValues = instant ? [series.value] : series.values;
    if (!Array.isArray(sourceValues)) throw fail('invalid_response');
    for (const [key, value] of Object.entries(query.expectedLabels)) if (series.metric[key] !== value) throw fail('invalid_response');
    if (query.expectedLabels.uid && query.expectedLabels.uid !== target.subject.uid) throw fail('unconfigured');
    if (target.subject.kind === 'Pod' && query.expectedLabels.pod !== target.subject.name) throw fail('unconfigured');
    for (const [key, value] of Object.entries(target.subject)) {
      if (['namespace', 'pod', 'container'].includes(key) && query.expectedLabels[key] !== value) throw fail('unconfigured');
    }
    let previous = -Infinity;
    const values = sourceValues.map(point => {
      if (!Array.isArray(point) || point.length !== 2 || typeof point[0] !== 'number' || typeof point[1] !== 'string') throw fail('invalid_response');
      if (!Number.isFinite(point[0]) || (!point[1].trim() || !Number.isFinite(Number(point[1])))) throw fail('invalid_response');
      const ms = point[0] * 1000;
      if (ms < Date.parse(window.from) || ms > Date.parse(window.to) || ++count > LIMITS.points) throw fail('invalid_response');
      if (ms <= previous) throw fail('invalid_response');
      previous = ms;
      newest = Math.max(newest ?? ms, ms);
      return [point[0], point[1]];
    });
    return { metric: series.metric, values };
  });
  return { data: { ...makeData(query), matrix, raw, subjectBinding: query.expectedLabels.uid ? 'uid_label' : 'configured_labels' }, observedAt: newest === null ? null : new Date(newest).toISOString(), empty: count === 0 };
}

const POD_METRICS = Object.freeze({
  cpu: { name: 'container_cpu_usage_seconds_total', unit: 'cores', rate: true, scope: 'container' },
  memory: { name: 'container_memory_working_set_bytes', unit: 'bytes', rate: false, scope: 'container' },
  network_rx: { name: 'container_network_receive_bytes_total', unit: 'bytes/s', rate: true, scope: 'pod' },
  network_tx: { name: 'container_network_transmit_bytes_total', unit: 'bytes/s', rate: true, scope: 'pod' },
});
function assertPodMetricInput(input) {
  const fields = ['requestId', 'connectionId', 'operation', 'metricId', 'queryWindow', 'subject'];
  const subjectFields = ['context', 'namespace', 'name', 'uid', 'container'];
  if (!isObject(input?.queryWindow) || Object.keys(input.queryWindow).some(key => !['from', 'to', 'step'].includes(key))) throw fail('invalid_request');
  if (!isObject(input) || Object.keys(input).some(key => !fields.includes(key)) || !isId(input.requestId) || !isId(input.connectionId) || input.operation !== 'metrics') throw fail('invalid_request');
  if (!isObject(input.subject) || Object.keys(input.subject).some(key => !subjectFields.includes(key))) throw fail('invalid_request');
  const subject = Object.fromEntries(subjectFields.map(key => [key, input.subject[key]]));
  if (!isId(subject.context) || !isId(subject.uid) || ![subject.namespace, subject.name, subject.container].every(isName)) throw fail('invalid_request');
  if (typeof input.metricId !== 'string' || !Object.hasOwn(POD_METRICS, input.metricId)) throw fail('unsupported');
  return { subject, metric: POD_METRICS[input.metricId] };
}
function podCgroupEvidence(id) {
  if (id === undefined || id === '') return { state: 'missing', uids: [] };
  if (!isText(id) || !id.startsWith('/') || ['\\', '\0', '%', '?', '#'].some(value => id.includes(value))) return { state: 'unsupported', uids: [] };
  const parts = id.split('/');
  if (parts.some(part => part === '.' || part === '..') || parts.slice(1, -1).includes('')) return { state: 'unsupported', uids: [] };
  const components = [];
  for (const part of parts) {
    const cgroupfs = /^pod([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(part);
    const systemd = /^kubepods(?:-(?:burstable|besteffort))?-pod([0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12})\.slice$/.exec(part);
    if (cgroupfs) components.push({ uid: cgroupfs[1], format: 'cgroupfs' });
    if (systemd) components.push({ uid: systemd[1].replaceAll('_', '-'), format: 'systemd' });
  }
  return { state: components.length === 1 ? 'component' : components.length ? 'ambiguous' : 'unsupported', uids: components.map(item => item.uid), ...(components.length === 1 ? { format: components[0].format } : {}) };
}
async function readPodMetrics({ subject, metric, connection, window, client, contextIds, fetchImpl, prometheusOrigin, signal }) {
  const check = () => { if (signal?.aborted) throw fail('cancelled'); if (!contextIds().includes(subject.context)) throw fail('unconfigured'); };
  check();
  if (typeof client !== 'function') throw fail('unconfigured');
  const c = client(subject.context), endpoint = `/api/v1/namespaces/${encodeURIComponent(subject.namespace)}/pods/${encodeURIComponent(subject.name)}`;
  const validate = object => {
    const names = ['containers', 'initContainers', 'ephemeralContainers'].flatMap(key => object?.spec?.[key] || []).map(item => item.name);
    if (object?.kind !== 'Pod' || object?.apiVersion !== 'v1' || object?.metadata?.uid !== subject.uid || object.metadata.name !== subject.name || object.metadata.namespace !== subject.namespace || !names.includes(subject.container)) throw fail('identity_changed');
  };
  const before = await c.request('GET', endpoint, null, { timeout: LIMITS.timeoutMs, ...(signal ? { signal } : {}) });
  check(); validate(before);
  const expectedLabels = { namespace: subject.namespace, pod: subject.name, ...(metric.scope === 'container' ? { container: subject.container } : {}) };
  const selector = Object.entries(expectedLabels).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(',') + (metric.scope === 'pod' ? ',interface!="lo"' : '');
  const selected = `${metric.name}{${selector}}`, expression = metric.rate ? `rate(${selected}[5m])` : selected;
  const query = { expression, expectedLabels, unit: metric.unit };
  const value = await readPrometheus({ connection, target: { subject: { kind: 'Pod', name: subject.name, uid: subject.uid, namespace: subject.namespace, ...(metric.scope === 'container' ? { container: subject.container } : {}) } }, query, window, prometheusOrigin, signal,
    fetchImpl: (url, init) => { check(); return fetchImpl(url, signal ? { ...init, signal: AbortSignal.any([init.signal, signal]) } : init); } });
  check();
  const interfaces = new Set(), evidence = [];
  let verified = value.data.matrix.length > 0;
  for (const series of value.data.matrix) {
    if (series.metric.uid !== undefined && series.metric.uid !== subject.uid) throw fail('invalid_response');
    if (series.metric.__name__ !== undefined && series.metric.__name__ !== metric.name) throw fail('invalid_response');
    const cgroup = podCgroupEvidence(series.metric.id);
    if (cgroup.uids.some(uid => uid !== subject.uid)) throw fail('invalid_response');
    const cgroupMatch = cgroup.state === 'component';
    let source = cgroupMatch ? 'cgroup_pod_component' : cgroup.state !== 'ambiguous' && series.metric.uid === subject.uid ? 'uid_label' : null;
    let reason = source ? null : cgroup.state === 'ambiguous' ? 'cgroup_component_ambiguous' : 'uid_label_missing';
    if (metric.scope === 'pod') {
      if (![undefined, '', 'POD'].includes(series.metric.container)) throw fail('invalid_response');
      if (series.metric.container !== 'POD' && !cgroupMatch) { source = null; reason = 'sandbox_cgroup_uid_missing'; }
    }
    evidence.push({ source, cgroupState: cgroup.state, ...(cgroupMatch ? { cgroupFormat: cgroup.format } : {}), reason });
    verified &&= source !== null;
    if (metric.scope === 'pod') {
      const name = series.metric.interface;
      if (typeof name !== 'string' || !/^[a-zA-Z0-9_.:-]{1,64}$/.test(name) || name === 'lo' || interfaces.has(name)) throw fail('invalid_response');
      interfaces.add(name);
    } else if (value.data.matrix.length > 1) throw fail('invalid_response');
    const created = Date.parse(before.metadata.creationTimestamp);
    if (source && Number.isFinite(created) && series.values.some(([at]) => at * 1000 < created)) throw fail('invalid_response');
  }
  const after = await c.request('GET', endpoint, null, { timeout: LIMITS.timeoutMs, ...(signal ? { signal } : {}) });
  check(); validate(after);
  value.data.scope = { kind: metric.scope, context: subject.context, namespace: subject.namespace, pod: subject.name, uid: subject.uid, ...(metric.scope === 'container' ? { container: subject.container } : {}) };
  value.data.identity = { resourceUID: 'verified', seriesUID: verified ? 'verified' : 'unverified', evidenceMeaning: 'observed_label_binding', evidence,
    reason: verified ? null : value.empty ? 'empty' : evidence.find(item => item.reason)?.reason || 'uid_label_missing' };
  const sources = new Set(evidence.map(item => item.source));
  value.data.subjectBinding = verified ? sources.size === 1 ? evidence[0].source : 'mixed_uid_evidence' : 'unverified_uid';
  return { ...value, query: expression, verified };
}

async function readCloudwatch({ connection, target, query, window, execFileImpl, awsExecutable }) {
  const executable = awsExecutable();
  await verifyAwsAccount(connection, execFileImpl, executable);
  if (query.operation === 'metrics') return readCloudwatchMetrics({ connection, query, window, execFileImpl, executable });
  const streams = target.logStreamNames;
  const isGroupTarget = target.subject.logGroup === connection.logGroup;
  if (!isGroupTarget && (!Array.isArray(streams) || !streams.length)) throw fail('unconfigured');
  if (streams && (streams.length > 100 || streams.some(name => !isText(name) || /[:*]/.test(name)))) throw fail('unconfigured');
  const args = ['logs', 'filter-log-events', '--profile', connection.profile, '--region', connection.region, '--log-group-name', connection.logGroup,
    '--start-time', String(Date.parse(window.from)), '--end-time', String(Date.parse(window.to)), '--limit', '500', '--no-paginate', '--output', 'json', '--no-cli-pager'];
  if (streams?.length) args.push('--log-stream-names', ...streams);
  if (query.expression) args.push('--filter-pattern', query.expression);
  const raw = await runAws(args, execFileImpl, executable);
  if (!Array.isArray(raw.events)) throw fail('invalid_response');
  const records = raw.events.map(event => {
    if (!Number.isFinite(event.timestamp) || typeof event.message !== 'string' || event.timestamp < Date.parse(window.from) || event.timestamp >= Date.parse(window.to)) throw fail('invalid_response');
    if (streams?.length && !streams.includes(event.logStreamName)) throw fail('invalid_response');
    return { timestamp: new Date(event.timestamp).toISOString(), message: event.message, logStreamName: event.logStreamName ?? null, eventId: event.eventId ?? null };
  });
  const newest = records.length ? Math.max(...raw.events.map(event => event.timestamp)) : null;
  return { data: { ...makeData(query), records, raw, truncated: !!raw.nextToken }, observedAt: newest === null ? null : new Date(newest).toISOString(), empty: records.length === 0 };
}

async function readCloudwatchMetrics({ connection, query, window, execFileImpl, executable }) {
  const metric = query.metric;
  const validName = value => typeof value === 'string' && /^[a-zA-Z0-9_./:-]{1,255}$/.test(value);
  if (!isObject(metric) || !validName(metric.namespace) || !validName(metric.name)) throw fail('unconfigured');
  if (!['Average', 'Sum', 'Minimum', 'Maximum', 'SampleCount'].includes(metric.statistic)) throw fail('unconfigured');
  if (!Array.isArray(metric.dimensions) || metric.dimensions.length > 30 || window.step < 60 || window.step % 60 !== 0) throw fail('invalid_request');
  if (metric.dimensions.some(item => !validName(item.name) || !validName(item.value))) throw fail('unconfigured');
  const args = ['cloudwatch', 'get-metric-statistics', '--profile', connection.profile, '--region', connection.region,
    '--namespace', metric.namespace, '--metric-name', metric.name, '--start-time', window.from, '--end-time', window.to,
    '--period', String(window.step), '--statistics', metric.statistic, '--output', 'json', '--no-cli-pager'];
  if (metric.dimensions.length) args.push('--dimensions', ...metric.dimensions.map(item => `Name=${item.name},Value=${item.value}`));
  const raw = await runAws(args, execFileImpl, executable);
  if (!Array.isArray(raw.Datapoints)) throw fail('invalid_response');
  let sourceUnit = null;
  const values = raw.Datapoints.map(point => {
    const time = Date.parse(point.Timestamp), value = point[metric.statistic];
    if (!Number.isFinite(time) || typeof value !== 'number' || !Number.isFinite(value)) throw fail('invalid_response');
    if (time < Date.parse(window.from) || time >= Date.parse(window.to)) throw fail('invalid_response');
    if (typeof point.Unit !== 'string' || (sourceUnit !== null && sourceUnit !== point.Unit)) throw fail('invalid_response');
    sourceUnit = point.Unit;
    return [time / 1000, String(value)];
  }).sort((a, b) => a[0] - b[0]);
  if (values.length > LIMITS.points) throw fail('invalid_response');
  const labels = Object.fromEntries(metric.dimensions.map(item => [item.name, item.value]));
  const data = { ...makeData(query), matrix: values.length ? [{ metric: { __name__: metric.name, namespace: metric.namespace, ...labels }, values }] : [], raw, sourceUnit };
  return { data, observedAt: values.length ? new Date(values[values.length - 1][0] * 1000).toISOString() : null, empty: values.length === 0 };
}

async function readKubernetes({ connection, target, query, window, client }) {
  const subject = target.subject;
  if (!isName(subject.namespace) || !isName(subject.name) || !isText(subject.uid)) throw fail('unconfigured');
  const ns = encodeURIComponent(subject.namespace), name = encodeURIComponent(subject.name);
  const c = client(connection.contextId);
  if (connection.provider === 'gitops' && subject.kind !== 'Application') throw fail('unsupported');
  if (connection.provider === 'kubernetes' && subject.kind !== 'Pod') throw fail('unsupported');
  const resource = connection.provider === 'gitops' ? 'applications' : 'pods';
  const base = connection.provider === 'gitops' ? '/apis/argoproj.io/v1alpha1' : '/api/v1';
  const object = await c.request('GET', `${base}/namespaces/${ns}/${resource}/${name}`, null, { timeout: LIMITS.timeoutMs });
  if (object?.metadata?.uid !== subject.uid) throw fail('not_queried');
  if (query.operation === 'logs') {
    const result = await readPodLogs({ c, subject, ns, name, query, window });
    const after = await c.request('GET', `${base}/namespaces/${ns}/${resource}/${name}`, null, { timeout: LIMITS.timeoutMs });
    if (after?.metadata?.uid !== subject.uid) throw fail('not_queried');
    return result;
  }
  if (query.operation === 'changes') {
    const records = (object.status?.history || []).filter(item => inWindow(item.deployedAt, window));
    return { data: { ...makeData(query), records, raw: { history: records }, coverage: 'retained_deployment_history' }, observedAt: newestTimestamp(records.map(item => item.deployedAt)), empty: records.length === 0 };
  }
  const result = await c.request('GET', `/api/v1/namespaces/${ns}/events?fieldSelector=${encodeURIComponent('involvedObject.uid=' + subject.uid)}&limit=500`, null, { timeout: LIMITS.timeoutMs });
  if (!Array.isArray(result?.items)) throw fail('invalid_response');
  const records = result.items.filter(item => item.involvedObject?.uid === subject.uid && inWindow(eventTime(item), window));
  return { data: { ...makeData(query), records, raw: { items: records }, truncated: !!result.metadata?.continue, coverage: 'retained_events' }, observedAt: newestTimestamp(records.map(eventTime)), empty: records.length === 0 };
}

const eventTime = item => item.lastTimestamp || item.eventTime || item.metadata?.creationTimestamp;
const inWindow = (value, window) => Number.isFinite(Date.parse(value)) && Date.parse(value) >= Date.parse(window.from) && Date.parse(value) <= Date.parse(window.to);
const newestTimestamp = values => values.length ? new Date(Math.max(...values.map(value => Date.parse(value)))).toISOString() : null;

async function readPodLogs({ c, subject, ns, name, query, window }) {
  if (subject.kind !== 'Pod' || !isName(subject.container)) throw fail('unconfigured');
  const params = new URLSearchParams({ timestamps: 'true', sinceTime: window.from, tailLines: '5000', limitBytes: String(LIMITS.bodyBytes), container: subject.container });
  if (query.previous === true) params.set('previous', 'true');
  const text = await c.request('GET', `/api/v1/namespaces/${ns}/pods/${name}/log?${params}`, null, { raw: true, timeout: LIMITS.timeoutMs });
  if (typeof text !== 'string' || Buffer.byteLength(text) > LIMITS.bodyBytes) throw fail('invalid_response');
  const records = text.split('\n').filter(Boolean).map(line => {
    const split = line.indexOf(' '), timestamp = line.slice(0, split);
    if (split < 0 || !Number.isFinite(Date.parse(timestamp))) throw fail('invalid_response');
    return { timestamp, message: line.slice(split + 1), container: subject.container, uid: subject.uid };
  }).filter(record => inWindow(record.timestamp, window));
  return { data: { ...makeData(query), records, raw: records.map(record => `${record.timestamp} ${record.message}`).join('\n'), coverage: 'retained_container_logs', truncated: true }, observedAt: newestTimestamp(records.map(record => record.timestamp)), empty: records.length === 0 };
}

const GCP_ORIGIN = 'https://monitoring.googleapis.com';
const GCP_BOUNDS = Object.freeze({ pages: 10, series: 500 });
const GCP_NODE_TEMPLATES = Object.freeze({
  'node-cpu-time': { metric: 'cpu/core_usage_time', kind: 'CUMULATIVE', valueType: 'DOUBLE', sourceUnit: 's{CPU}', unit: 's{CPU}', role: 'cpu-time' },
  'node-cpu-rate': { metric: 'cpu/core_usage_time', kind: 'CUMULATIVE', valueType: 'DOUBLE', sourceUnit: 's{CPU}', unit: 'cores', role: 'cpu', rate: true },
  'node-memory-evictable': { metric: 'memory/used_bytes', kind: 'GAUGE', valueType: 'INT64', sourceUnit: 'By', unit: 'By', role: 'memory-evictable', memoryType: 'evictable' },
  'node-memory-non-evictable': { metric: 'memory/used_bytes', kind: 'GAUGE', valueType: 'INT64', sourceUnit: 'By', unit: 'By', role: 'memory-non-evictable', memoryType: 'non-evictable' },
  'node-network-rx-total': { metric: 'network/received_bytes_count', kind: 'CUMULATIVE', valueType: 'INT64', sourceUnit: 'By', unit: 'By', role: 'network-rx-total' },
  'node-network-rx-rate': { metric: 'network/received_bytes_count', kind: 'CUMULATIVE', valueType: 'INT64', sourceUnit: 'By', unit: 'By/s', role: 'network-rx', rate: true },
  'node-network-tx-total': { metric: 'network/sent_bytes_count', kind: 'CUMULATIVE', valueType: 'INT64', sourceUnit: 'By', unit: 'By', role: 'network-tx-total' },
  'node-network-tx-rate': { metric: 'network/sent_bytes_count', kind: 'CUMULATIVE', valueType: 'INT64', sourceUnit: 'By', unit: 'By/s', role: 'network-tx', rate: true },
  'node-ephemeral-storage-used': { metric: 'ephemeral_storage/used_bytes', kind: 'GAUGE', valueType: 'INT64', sourceUnit: 'By', unit: 'By', role: 'ephemeral-storage-used' },
});
function gcpTemplate(query) {
  if (!isObject(query) || !Object.hasOwn(GCP_NODE_TEMPLATES, query.templateId)) throw fail('unsupported');
  const template = GCP_NODE_TEMPLATES[query.templateId];
  if (query.role !== template.role || query.unit !== template.unit || !isText(query.title)) throw fail('unconfigured');
  return template;
}
function gcpFilter(connection, target, query) {
  const template = gcpTemplate(query);
  const fields = { 'metric.type': 'kubernetes.io/node/' + template.metric, 'resource.type': 'k8s_node',
    'resource.labels.project_id': connection.projectId, 'resource.labels.location': connection.location, 'resource.labels.cluster_name': connection.clusterName };
  if (target.subject.kind === 'Node') fields['resource.labels.node_name'] = target.subject.name;
  if (template.memoryType) fields['metric.labels.memory_type'] = template.memoryType;
  return Object.entries(fields).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join(' AND ');
}
function gcpQuery(connection, target, query) {
  const expression = gcpFilter(connection, target, query) + (gcpTemplate(query).rate ? ' | adjacent-counter-rate' : ' | raw');
  if (query.expression !== undefined && query.expression !== expression) throw fail('unconfigured');
  return { ...query, expression };
}
function validGcpConnection(connection, contextIds) {
  if (!contextIds.includes(connection.contextId) || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(connection.projectId || '')
    || !/^[a-z][a-z0-9-]{0,62}$/.test(connection.location || '') || !isName(connection.clusterName)) return false;
  const source = connection.credentialSource;
  if (!isObject(source) || source.kind !== 'gke-exec' || !isText(source.command) || /[\x00-\x1f\x7f]/.test(source.command)
    || path.basename(source.command) !== 'gke-gcloud-auth-plugin') return false;
  if (['origin', 'url', 'endpoint', 'token', 'credentials', 'profile'].some(key => Object.hasOwn(connection, key))) return false;
  try {
    for (const target of connection.targets) {
      if (Object.keys(target.subject).some(key => !['kind', 'name'].includes(key)) || !['Cluster', 'Node'].includes(target.subject.kind) || !isName(target.subject.name)) return false;
      if (target.subject.kind === 'Cluster' && target.subject.name !== connection.clusterName) return false;
      for (const query of target.queries) gcpQuery(connection, target, query);
    }
    return true;
  } catch { return false; }
}
function gcpWait(promise, signal, external) {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(fail(external?.aborted ? 'cancelled' : 'network_error'));
    if (signal.aborted) { Promise.resolve(promise).catch(() => {}); aborted(); return; }
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}
async function gcpPage(url, token, fetchImpl, budget, signal, external, descriptor = false) {
  const response = await gcpWait(fetchImpl(url, { method: 'GET', redirect: 'error', signal, headers: { accept: 'application/json', authorization: `Bearer ${token}` } }), signal, external);
  if (signal.aborted) throw fail(external?.aborted ? 'cancelled' : 'network_error');
  if (response.status !== 200) {
    if (response.body) await Promise.race([response.body.cancel().catch(() => {}), Promise.resolve()]);
    throw fail(response.status === 401 ? 'unauthenticated' : response.status === 403 ? 'forbidden' : descriptor && response.status === 404 ? 'empty' : 'network_error');
  }
  if (response.redirected || (response.url && (new URL(response.url).origin !== GCP_ORIGIN || new URL(response.url).pathname !== url.pathname))) throw fail('invalid_response');
  if (Number(response.headers.get('content-length')) > LIMITS.bodyBytes - budget.bytes) throw fail('invalid_response');
  const reader = response.body?.getReader();
  if (!reader) throw fail('invalid_response');
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await gcpWait(reader.read(), signal, external);
      if (done) break;
      if (!(value instanceof Uint8Array)) throw fail('invalid_response');
      budget.bytes += value.byteLength;
      if (budget.bytes > LIMITS.bodyBytes) throw fail('invalid_response');
      chunks.push(Buffer.from(value));
    }
  } finally { await Promise.race([reader.cancel().catch(() => {}), Promise.resolve()]); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('invalid_response'); }
}
function gcpTimestamp(value) {
  const match = typeof value === 'string' && /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!match) throw fail('invalid_response');
  const ms = Date.parse(match[1] + 'Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== match[1]) throw fail('invalid_response');
  const fraction = BigInt((match[2] || '').padEnd(9, '0'));
  return { iso: value, ns: BigInt(ms) * 1000000n + fraction, seconds: ms / 1000 + Number(fraction) / 1e9 };
}
function gcpValue(value, type) {
  if (!isObject(value) || Object.keys(value).length !== 1) throw fail('invalid_response');
  if (type === 'INT64') {
    if (typeof value.int64Value !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(value.int64Value)) throw fail('invalid_response');
    const number = BigInt(value.int64Value);
    if (number > 9223372036854775807n) throw fail('invalid_response');
    return { number, text: value.int64Value };
  }
  if (typeof value.doubleValue !== 'number' || !Number.isFinite(value.doubleValue) || value.doubleValue < 0) throw fail('invalid_response');
  return { number: value.doubleValue, text: String(value.doubleValue) };
}
function exactGcpKeys(value, keys) {
  return isObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function gcpSeries(series, connection, target, template, window, budget, groups) {
  if (++budget.fragments > GCP_BOUNDS.series) throw fail('invalid_response');
  const metricType = 'kubernetes.io/node/' + template.metric;
  if (!isObject(series) || Object.keys(series).some(key => !['metric', 'resource', 'metricKind', 'valueType', 'unit', 'points'].includes(key))
    || series.metricKind !== template.kind || series.valueType !== template.valueType || (series.unit !== undefined && series.unit !== template.sourceUnit)
    || !isObject(series.metric) || Object.keys(series.metric).some(key => !['type', 'labels'].includes(key)) || series.metric.type !== metricType
    || !exactGcpKeys(series.resource, ['type', 'labels']) || series.resource.type !== 'k8s_node') throw fail('invalid_response');
  const labels = series.resource.labels, metricLabels = series.metric.labels === undefined ? {} : series.metric.labels;
  if (!exactGcpKeys(labels, ['project_id', 'location', 'cluster_name', 'node_name']) || labels.project_id !== connection.projectId
    || labels.location !== connection.location || labels.cluster_name !== connection.clusterName || !isName(labels.node_name)
    || (target.subject.kind === 'Node' && labels.node_name !== target.subject.name)
    || !exactGcpKeys(metricLabels, template.memoryType ? ['memory_type'] : []) || (template.memoryType && metricLabels.memory_type !== template.memoryType)) throw fail('invalid_response');
  const metric = { __name__: metricType, ...labels, ...metricLabels };
  const key = JSON.stringify(Object.entries(metric).sort(([a], [b]) => a.localeCompare(b)));
  if (!groups.has(key)) {
    if (groups.size >= GCP_BOUNDS.series) throw fail('invalid_response');
    groups.set(key, { metric, points: new Map() });
  }
  const group = groups.get(key);
  if (!Array.isArray(series.points)) throw fail('invalid_response');
  for (const point of series.points) {
    if (++budget.points > LIMITS.points || !exactGcpKeys(point, ['interval', 'value']) || !isObject(point.interval)
      || Object.keys(point.interval).some(name => !['startTime', 'endTime'].includes(name))) throw fail('invalid_response');
    const end = gcpTimestamp(point.interval.endTime);
    const start = point.interval.startTime === undefined && template.kind === 'GAUGE' ? end : gcpTimestamp(point.interval.startTime);
    if (end.ns < BigInt(Date.parse(window.from)) * 1000000n || end.ns > BigInt(Date.parse(window.to)) * 1000000n || start.ns > end.ns) throw fail('invalid_response');
    const value = gcpValue(point.value, template.valueType), previous = group.points.get(end.ns.toString());
    if (previous && (previous.start.ns !== start.ns || previous.value.text !== value.text)) throw fail('invalid_response');
    group.points.set(end.ns.toString(), { end, start, value });
  }
}
function gcpMatrix(groups, template) {
  let newest = null, resetCount = 0, points = 0;
  const matrix = [...groups.values()].map(group => {
    let previous = null;
    const values = [];
    for (const point of [...group.points.values()].sort((a, b) => a.end.ns < b.end.ns ? -1 : a.end.ns > b.end.ns ? 1 : 0)) {
      if (previous && point.end.seconds <= previous.end.seconds) throw fail('invalid_response');
      if (!newest || point.end.ns > newest.ns) newest = point.end;
      if (!template.rate) values.push([point.end.seconds, point.value.text]);
      else if (previous) {
        if (point.start.ns !== previous.start.ns || point.value.number < previous.value.number) resetCount++;
        else {
          const delta = point.value.number - previous.value.number;
          if (typeof delta === 'bigint' && delta > BigInt(Number.MAX_SAFE_INTEGER)) throw fail('invalid_response');
          const rate = Number(delta) / (Number(point.end.ns - previous.end.ns) / 1e9);
          if (!Number.isFinite(rate) || rate < 0) throw fail('invalid_response');
          values.push([point.end.seconds, String(rate)]);
        }
      }
      previous = point;
    }
    points += values.length;
    return { metric: group.metric, values };
  });
  return { matrix, newest, resetCount, points };
}
const GCP_SAMPLING_CACHE = Object.freeze({ ttlMs: 300000, maxEntries: 128 });
function gcpDuration(value, allowZero) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,4})(?:\.\d{1,9})?s$/.test(value)) throw fail('invalid_response');
  const seconds = Number(value.slice(0, -1));
  if (!Number.isFinite(seconds) || seconds > 86400 || (allowZero ? seconds < 0 : seconds <= 0)) throw fail('invalid_response');
  return seconds;
}
function gcpSamplingSnapshot(value, cache) {
  return { ...value, provenance: { ...value.provenance }, cache: { ...cache } };
}
async function gcpSampling({ connection, template, token, fetchImpl, budget, signal, external, samplingCache, samplingClock, now }) {
  const metricType = 'kubernetes.io/node/' + template.metric;
  const key = JSON.stringify([connection.contextId, connection.projectId, metricType]);
  const unknown = { mode: 'source-points', status: 'not_queried', samplePeriod: null, ingestDelay: null, samplePeriodSeconds: null, ingestDelaySeconds: null,
    provenance: { kind: 'metricDescriptor.metadata', provider: 'gcp-monitoring', contextId: connection.contextId, projectId: connection.projectId, metricType }, observedAt: null };
  const clock = samplingClock(), saved = samplingCache.get(key);
  if (saved && clock >= saved.verifiedClock && clock < saved.expiresClock) {
    samplingCache.delete(key); samplingCache.set(key, saved);
    return gcpSamplingSnapshot(saved.value, { hit: true, ttlSeconds: GCP_SAMPLING_CACHE.ttlMs / 1000, expiresAt: saved.expiresAt });
  }
  samplingCache.delete(key);
  const cache = { hit: false, ttlSeconds: GCP_SAMPLING_CACHE.ttlMs / 1000, expiresAt: null };
  if (signal.aborted || budget.bytes >= LIMITS.bodyBytes) return gcpSamplingSnapshot(unknown, cache);
  try {
    const name = `projects/${connection.projectId}/metricDescriptors/${metricType}`;
    const url = new URL('/v3/' + name, GCP_ORIGIN);
    const descriptor = await gcpPage(url, token, fetchImpl, budget, signal, external, true);
    if (signal.aborted) throw fail(external?.aborted ? 'cancelled' : 'network_error');
    if (!isObject(descriptor) || Object.hasOwn(descriptor, 'error')) throw fail('invalid_response');
    if (!Object.keys(descriptor).length) throw fail('empty');
    if (descriptor.type !== metricType || (descriptor.name !== undefined && descriptor.name !== name)
      || descriptor.metricKind !== template.kind || descriptor.valueType !== template.valueType || descriptor.unit !== template.sourceUnit
      || (descriptor.monitoredResourceTypes !== undefined && (!Array.isArray(descriptor.monitoredResourceTypes) || !descriptor.monitoredResourceTypes.includes('k8s_node')))) throw fail('invalid_response');
    if (descriptor.metadata === undefined) throw fail('empty');
    if (!isObject(descriptor.metadata)) throw fail('invalid_response');
    const samplePeriodSeconds = gcpDuration(descriptor.metadata.samplePeriod, false), ingestDelaySeconds = gcpDuration(descriptor.metadata.ingestDelay, true);
    const observedAt = now(), observedMs = Date.parse(observedAt);
    if (!Number.isFinite(observedMs)) throw fail('invalid_response');
    const value = { ...unknown, status: 'ok', samplePeriod: descriptor.metadata.samplePeriod, ingestDelay: descriptor.metadata.ingestDelay,
      samplePeriodSeconds, ingestDelaySeconds, observedAt };
    const verifiedClock = samplingClock(), expiresAt = new Date(observedMs + GCP_SAMPLING_CACHE.ttlMs).toISOString();
    if (!Number.isFinite(verifiedClock)) throw fail('invalid_response');
    const entry = { value, verifiedClock, expiresClock: verifiedClock + GCP_SAMPLING_CACHE.ttlMs, expiresAt };
    samplingCache.delete(key); samplingCache.set(key, entry);
    while (samplingCache.size > GCP_SAMPLING_CACHE.maxEntries) samplingCache.delete(samplingCache.keys().next().value);
    return gcpSamplingSnapshot(value, { ...cache, expiresAt });
  } catch (error) {
    const status = ['forbidden', 'unauthenticated', 'empty', 'invalid_response', 'cancelled'].includes(error?.status) ? error.status : 'network_error';
    return gcpSamplingSnapshot({ ...unknown, status }, cache);
  }
}

async function readGcp({ connection, target, query, window, client, fetchImpl, signal: external, contextIds, samplingCache, samplingClock, now }) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), LIMITS.timeoutMs);
  const signal = external ? AbortSignal.any([controller.signal, external]) : controller.signal;
  const check = () => { if (signal.aborted) throw fail(external?.aborted ? 'cancelled' : 'network_error'); if (!contextIds().includes(connection.contextId)) throw fail('unconfigured'); };
  try {
    check();
    const c = client(connection.contextId), command = connection.credentialSource.command;
    if (c?.execCommand !== command || c?.user?.exec?.command !== command || typeof c.credentials !== 'function') throw fail('unconfigured');
    let credential;
    try { credential = await gcpWait(c.credentials(), signal, external); }
    catch (error) { if (signal.aborted) check(); throw fail(error.kind === 'unauthorized' ? 'unauthenticated' : ['noAuthTool', 'config'].includes(error.kind) ? 'unconfigured' : 'network_error'); }
    check();
    if (!credential || typeof credential.token !== 'string' || !credential.token.length || credential.token.length > 16384 || /[\x00-\x20\x7f]/.test(credential.token)
      || credential.cert || credential.key || credential.basic) throw fail('unauthenticated');
    const template = gcpTemplate(query), groups = new Map(), budget = { bytes: 0, points: 0, fragments: 0 }, seen = new Set(), raw = [];
    let cursor = null, pages = 0;
    do {
      check();
      if (++pages > GCP_BOUNDS.pages) throw fail('invalid_response');
      const url = new URL(`/v3/projects/${encodeURIComponent(connection.projectId)}/timeSeries`, GCP_ORIGIN);
      for (const [key, value] of Object.entries({ filter: gcpFilter(connection, target, query), 'interval.startTime': window.from, 'interval.endTime': window.to, view: 'FULL', pageSize: '500' })) url.searchParams.set(key, value);
      if (cursor) url.searchParams.set('pageToken', cursor);
      const page = await gcpPage(url, credential.token, fetchImpl, budget, signal, external);
      check();
      if (!isObject(page) || Object.hasOwn(page, 'error') || (page.timeSeries !== undefined && !Array.isArray(page.timeSeries))) throw fail('invalid_response');
      for (const series of page.timeSeries || []) { gcpSeries(series, connection, target, template, window, budget, groups); raw.push(series); }
      cursor = page.nextPageToken;
      if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 4096 || /[\x00-\x20\x7f]/.test(cursor))) throw fail('invalid_response');
      if (cursor) { if (seen.has(cursor)) throw fail('invalid_response'); seen.add(cursor); }
    } while (cursor);
    check();
    const result = gcpMatrix(groups, template);
    const sampling = await gcpSampling({ connection, template, token: credential.token, fetchImpl, budget, signal, external, samplingCache, samplingClock, now });
    if (external?.aborted) throw fail('cancelled');
    if (!contextIds().includes(connection.contextId)) throw fail('unconfigured');
    return { data: { ...makeData(query), matrix: result.matrix, raw: { timeSeries: raw },
      source: { provider: 'gcp-monitoring', metricType: 'kubernetes.io/node/' + template.metric, metricKind: template.kind, valueType: template.valueType, unit: template.sourceUnit, resourceType: 'k8s_node', sampling, requestedStepSeconds: window.step, samplePeriod: sampling.samplePeriod, ingestDelay: sampling.ingestDelay },
      identityEvidence: { level: 'name-bound', uid: null, reason: 'uid_label_unavailable', currentMembership: 'unverified' },
      transform: { kind: template.rate ? 'adjacent-counter-rate' : 'raw', unit: query.unit, resetCount: result.resetCount, ...(template.rate ? { meaning: 'interval-average', firstPoint: 'omitted', reset: 'gap' } : {}) },
      coverage: { completeForQuery: true, pages, series: groups.size, sourceSeriesFragments: budget.fragments, sourcePoints: budget.points, returnedPoints: result.points } },
      observedAt: result.newest?.iso || null, empty: result.points === 0 };
  } finally { clearTimeout(timer); controller.abort(); }
}

/* prometheusOrigin(contextId, signal) -> 'http://127.0.0.1:<포트>': 그 클러스터 안에서 찾은 Prometheus로 여는 포트 포워딩 주소(services.cjs, tools.cjs) */
function createObservability({ userData, contextIds, client, fetchImpl = globalThis.fetch, prometheusOrigin = async () => { throw fail('unconfigured'); }, execFileImpl = execFile, readConfig = () => loadConfig(userData), awsExecutable = resolveAwsExecutable, now = () => new Date().toISOString(), samplingClock = () => performance.now(), bindingIdFactory = randomUUID }) {
  let activeCount = 0;
  const samplingCache = new Map();
  const bindingIds = new Map(), allocatedIds = new Set();
  let bindingUnits = 0;
  function bindingId(key, prefix) {
    if (bindingIds.has(key)) return bindingIds.get(key);
    if (bindingIds.size >= BINDING_LIMITS.entries || key.length > BINDING_LIMITS.keyUnits || bindingUnits + key.length > BINDING_LIMITS.totalUnits) return null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const uuid = bindingIdFactory();
      if (typeof uuid !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid) || allocatedIds.has(uuid)) continue;
      const id = prefix + '.' + uuid;
      bindingIds.set(key, id); allocatedIds.add(uuid); bindingUnits += key.length;
      return id;
    }
    return null;
  }
  function pinBinding(connection, target, query) {
    return bindingSafe(() => {
      const snapshot = bindingDefinition(connection, target, query), id = bindingId(snapshot.key, 'obd1');
      if (!id) return null;
      return { binding: { version: 1, scope: 'observability-config-tuple', id, ...snapshot.publicTuple },
        current: () => bindingDefinition(connection, target, query).key === snapshot.key };
    });
  }
  function currentBinding(pinned) {
    return bindingSafe(() => pinned?.current() ? bindingCopy(pinned.binding) : null);
  }
  function configurations() {
    const config = readConfig();
    if (config?.version !== 1 || !Array.isArray(config.connections)) throw fail('invalid_configuration');
    const ids = new Set();
    return config.connections.map(connection => {
      if (ids.has(connection.id)) throw fail('invalid_configuration');
      ids.add(connection.id);
      return { connection, configured: validateConnection(connection, contextIds()) };
    });
  }
  function resolve(input) {
    if (!isObject(input) || !isId(input.connectionId) || !isId(input.targetId)) throw fail('invalid_request');
    const entry = configurations().find(item => item.connection.id === input.connectionId);
    if (!entry?.configured) throw fail('unconfigured');
    const target = entry.connection.targets.find(item => item.id === input.targetId);
    if (!target) throw fail('unconfigured');
    return { connection: entry.connection, target };
  }
  function resolveGcpConsole(input) {
    const invalid = status => { throw fail(status); };
    if (!isObject(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) invalid('invalid_request');
    const keys = Reflect.ownKeys(input), fields = Object.getOwnPropertyDescriptors(input);
    if (keys.length !== 1 || keys[0] !== 'contextId' || !Object.hasOwn(fields.contextId, 'value') || !isId(fields.contextId.value)) invalid('invalid_request');
    const contextId = fields.contextId.value;
    try {
      const config = readConfig();
      let remaining = 16384;
      const dataOnly = (value, depth = 0) => {
        if (--remaining < 0 || depth > 12) invalid('unconfigured');
        if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
        if (!Array.isArray(value) && (!isObject(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) invalid('unconfigured');
        const descriptors = Object.getOwnPropertyDescriptors(value);
        for (const key of Reflect.ownKeys(value)) {
          if (typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value')) invalid('unconfigured');
          dataOnly(descriptors[key].value, depth + 1);
        }
      };
      dataOnly(config);
      if (config.version !== 1 || !Array.isArray(config.connections)) invalid('unconfigured');
      const contexts = contextIds();
      if (!Array.isArray(contexts) || contexts.filter(id => id === contextId).length !== 1) invalid('unconfigured');
      const matches = config.connections.filter(connection => connection?.provider === 'gcp-monitoring' && connection.contextId === contextId);
      if (matches.length !== 1) invalid('unconfigured');
      const connection = matches[0];
      if (connection.provider !== 'gcp-monitoring' || !isId(connection.id) || !validateConnection(connection, contexts)
        || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(connection.projectId)) invalid('unconfigured');
      const projectId = connection.projectId, url = new URL('https://console.cloud.google.com/monitoring');
      url.searchParams.set('project', projectId);
      if (url.origin !== 'https://console.cloud.google.com' || url.pathname !== '/monitoring' || url.username || url.password || url.hash
        || [...url.searchParams].length !== 1 || url.searchParams.getAll('project').length !== 1 || url.searchParams.get('project') !== projectId) invalid('unconfigured');
      return { provider: 'gcp-monitoring', connectionId: connection.id, contextId, projectId, url: url.href };
    } catch { invalid('unconfigured'); }
  }
  function catalog() {
    try {
      const connections = configurations().map(({ connection: c, configured }) => ({
        connectionId: c.id, provider: c.provider, status: configured ? 'configured' : 'unconfigured',
        identity: { account: c.account ?? null, region: c.region ?? null, cluster: c.contextId ?? null, namespace: c.namespace ?? null, source: 'observability-connections.v1', ...(c.provider === 'gcp-monitoring' ? { projectId: c.projectId, location: c.location, clusterName: c.clusterName } : {}) },
        operations: configured ? OPERATIONS[c.provider] : [],
        targets: c.targets.map(t => ({ targetId: t.id, label: t.label || t.id, subject: t.subject,
          queries: t.queries.map(saved => { const q = c.provider === 'gcp-monitoring' && configured ? gcpQuery(c, t, saved) : saved; return ({ queryId: q.id, operation: q.operation, role: q.role ?? null, title: q.title ?? null, expression: q.expression ?? null, polling: pollingFor(q), unit: q.unit ?? null, numerator: q.numerator ?? null, denominator: q.denominator ?? null, definitionBinding: configured ? currentBinding(pinBinding(c, t, q)) : null }); }) })),
      }));
      return { status: connections.length ? 'ok' : 'unconfigured', connections };
    } catch { return { status: 'invalid_configuration', connections: [] }; }
  }
  async function read(input, options = {}) {
    const podMode = isObject(input) && (Object.hasOwn(input, 'subject') || Object.hasOwn(input, 'metricId'));
    const signal = options?.signal;
    const result = { requestId: input?.requestId ?? null, connectionId: input?.connectionId ?? null, targetId: input?.targetId ?? null,
      operation: input?.operation ?? null, queryWindow: null, queryId: input?.queryId ?? input?.metricId ?? null, query: null, observedAt: null, receivedAt: null, data: makeData(), polling: { supported: false, intervalSeconds: null, reason: 'not_queried' }, error: null, executionBinding: null };
    let hasSlot = false, gcpMode = false, pinned = null;
    try {
      if (podMode) {
        const { subject, metric } = assertPodMetricInput(input);
        if (signal !== undefined && !(signal instanceof AbortSignal)) throw fail('invalid_request');
        if (signal?.aborted) throw fail('cancelled');
        const window = parseWindow(input.queryWindow);
        result.queryWindow = window;
        const entry = configurations().find(item => item.connection.id === input.connectionId);
        if (!entry?.configured || entry.connection.provider !== 'prometheus' || entry.connection.contextId !== subject.context || !contextIds().includes(subject.context)) throw fail('unconfigured');
        const connection = { contextId: entry.connection.contextId };
        result.subject = { ...subject, kind: 'Pod' };
        result.metricId = input.metricId;
        if (activeCount >= 16) throw fail('not_queried');
        activeCount++; hasSlot = true;
        const value = await readPodMetrics({ subject, metric, connection, window, client, contextIds, fetchImpl, prometheusOrigin, signal });
        Object.assign(result, value, { status: value.empty ? 'empty' : value.verified ? 'ok' : 'unverified', polling: { supported: false, intervalSeconds: null, reason: value.empty ? 'empty' : value.verified ? 'not_configured' : value.data.identity.reason } });
        delete result.empty; delete result.verified;
        return result;
      }
      assertReadInput(input);
      const window = parseWindow(input.queryWindow);
      result.queryWindow = window;
      const { connection, target } = resolve(input);
      if (!OPERATIONS[connection.provider].includes(input.operation)) throw fail('unsupported');
      let query = target.queries.find(q => q.id === input.queryId && q.operation === input.operation);
      if (!query) throw fail('unsupported');
      gcpMode = connection.provider === 'gcp-monitoring';
      if (gcpMode) {
        if (signal !== undefined && !(signal instanceof AbortSignal)) throw fail('invalid_request');
        if (signal?.aborted) throw fail('cancelled');
        if (Object.keys(input.queryWindow).some(key => !['from', 'to', 'step'].includes(key))) throw fail('invalid_request');
        query = gcpQuery(connection, target, query);
      }
      if (input.query !== undefined && input.query !== query.expression) throw fail('invalid_request');
      result.polling = pollingFor(query);
      result.query = describeQuery({ connection, target, query, window });
      pinned = pinBinding(connection, target, query);
      if (activeCount >= 16) throw fail('not_queried');
      activeCount++; hasSlot = true;
      const adapters = { prometheus: readPrometheus, cloudwatch: readCloudwatch, kubernetes: readKubernetes, gitops: readKubernetes, 'gcp-monitoring': readGcp };
      const value = await adapters[connection.provider]({ connection, target, query, window, client, fetchImpl, prometheusOrigin, execFileImpl, awsExecutable, signal, contextIds, samplingCache, samplingClock, now });
      Object.assign(result, value, { status: value.empty ? 'empty' : 'ok' });
      if (value.empty) result.polling = { supported: false, intervalSeconds: null, reason: 'empty' };
      delete result.empty;
    } catch (error) {
      result.status = ['invalid_request', 'unconfigured', 'unsupported', 'not_queried', 'forbidden', 'invalid_response', 'superseded', 'invalid_configuration'].includes(error.status) ? error.status : error.kind === 'forbidden' || error.kind === 'unauthorized' ? 'forbidden' : 'network_error';
      if (gcpMode && ['unauthenticated', 'cancelled'].includes(error.status)) result.status = error.status;
      if (gcpMode && signal?.aborted) result.status = 'cancelled';
      if (podMode) {
        if (signal?.aborted || error.status === 'cancelled') result.status = 'cancelled';
        else if (error.status === 'identity_changed') result.status = 'identity_changed';
        else if (Number(error.status || error.statusCode) === 404 || error.kind === 'notFound') result.status = 'missing';
        else if (Number(error.status || error.statusCode) === 403) result.status = 'forbidden';
      }
      result.error = result.status;
      result.polling = { supported: false, intervalSeconds: null, reason: result.status };
    } finally {
      if (hasSlot) activeCount--;
      result.receivedAt = now();
      result.executionBinding = currentBinding(pinned);
    }
    return result;
  }
  return { 'observability.catalog': catalog, 'observability.read': read, resolveGcpConsole };
}

function pollingFor(query) {
  const value = query.polling;
  if (!value || value.supported !== true) return { supported: false, intervalSeconds: null, reason: value?.reason || 'not_configured' };
  if (!Number.isInteger(value.intervalSeconds) || value.intervalSeconds < 5 || value.intervalSeconds > 3600) return { supported: false, intervalSeconds: null, reason: 'invalid_configuration' };
  return { supported: true, intervalSeconds: value.intervalSeconds, reason: null };
}

function describeQuery({ connection, target, query, window }) {
  if (connection.provider === 'gcp-monitoring') return query.expression;
  if (connection.provider === 'prometheus') return query.expression;
  if (connection.provider === 'cloudwatch' && query.operation === 'metrics') return `get-metric-statistics ${query.metric?.namespace}/${query.metric?.name} statistic=${query.metric?.statistic}`;
  if (connection.provider === 'cloudwatch') return `filter-log-events logGroup=${connection.logGroup} filterPattern=${query.expression || ''}`;
  if (query.operation === 'events') return `involvedObject.uid=${target.subject.uid}`;
  if (query.operation === 'changes') return `Application/${target.subject.namespace}/${target.subject.name}/status.history`;
  return `Pod/${target.subject.namespace}/${target.subject.name}/log container=${target.subject.container} sinceTime=${window.from}`;
}

function assertReadInput(input) {
  if (!isObject(input)) throw fail('invalid_request');
  const fields = ['requestId', 'connectionId', 'targetId', 'operation', 'queryWindow', 'queryId', 'query'];
  if (Object.keys(input).some(key => !fields.includes(key))) throw fail('invalid_request');
  if (!isId(input.requestId) || !isId(input.queryId)) throw fail('invalid_request');
  if (!['metrics', 'logs', 'events', 'changes'].includes(input.operation)) throw fail('invalid_request');
}

module.exports = { createObservability, LIMITS };
