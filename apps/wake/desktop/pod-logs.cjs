const { createHash } = require('node:crypto');
const { TOOL_REQUEST_TIMEOUT_MS } = require('../data/tool-connection-limits.js');

const MAX_WINDOW_MS = 86_400_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const TAIL_OPTIONS = new Set([100, 500, 1000]);

const validName = value => typeof value === 'string' && /^[a-z0-9](?:[-a-z0-9.]{0,251}[a-z0-9])?$/.test(value);
const validUid = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,128}$/.test(value);
const logError = kind => Object.assign(new Error('pod logs ' + kind), { kind });

function logWindow(input) {
  const { fromMs, toMs } = input || {};
  if (!Number.isSafeInteger(fromMs) || !Number.isSafeInteger(toMs) || fromMs < 0 ||
    toMs <= fromMs || toMs - fromMs > MAX_WINDOW_MS || toMs > 8.64e15) throw logError('invalid_request');
  return { fromMs, toMs };
}

function podLogTarget(client, args, signal) {
  const { ns, name, uid, container, previous, tail } = args;
  const window = logWindow(args.window);
  if (![ns, name, container].every(validName) || !validUid(uid) ||
    typeof previous !== 'boolean' || !TAIL_OPTIONS.has(tail)) throw logError('invalid_request');

  const path = '/api/v1/namespaces/' + encodeURIComponent(ns) + '/pods/' + encodeURIComponent(name);
  const requestOptions = { timeout: TOOL_REQUEST_TIMEOUT_MS, signal };
  const identify = async () => {
    const pod = await client.request('GET', path, null, requestOptions);
    if (pod?.apiVersion !== 'v1' || pod.kind !== 'Pod' || pod.metadata?.uid !== uid ||
      pod.metadata.name !== name || pod.metadata.namespace !== ns) throw logError('identity_changed');
    const containers = ['containers', 'initContainers', 'ephemeralContainers'].flatMap(key => pod.spec?.[key] || []);
    if (!containers.some(item => item.name === container)) throw logError('identity_changed');
    const observed = ['containerStatuses', 'initContainerStatuses', 'ephemeralContainerStatuses']
      .flatMap(key => pod.status?.[key] || []).find(item => item.name === container);
    const incarnation = previous ? observed?.lastState?.terminated : observed?.state?.running || observed?.state?.terminated;
    return {
      startMs: Date.parse(incarnation?.startedAt || pod.metadata.creationTimestamp),
      instanceStartMs: Date.parse(incarnation?.startedAt),
      identity: JSON.stringify([observed?.containerID, observed?.restartCount, incarnation?.startedAt, incarnation?.containerID]),
    };
  };

  return { path, window, requestOptions, identify };
}

async function readPodLogWindow(client, args, signal) {
  const { container, previous, tail } = args;
  const { path, window, requestOptions, identify } = podLogTarget(client, args, signal);
  const before = await identify();
  if (Number.isFinite(before.startMs) && before.startMs > window.toMs) {
    return { text: '', window, partial: false, outsideRetention: true };
  }
  const query = new URLSearchParams({
    timestamps: 'true',
    sinceTime: new Date(window.fromMs).toISOString(),
    limitBytes: String(MAX_BODY_BYTES),
    container,
  });
  query.set('tailLines', String(tail));
  if (previous) query.set('previous', 'true');
  const text = await client.request('GET', path + '/log?' + query, null, {
    ...requestOptions, raw: true, maxBytes: MAX_BODY_BYTES,
  });
  const after = await identify();
  if (before.identity !== after.identity) throw logError('identity_changed');
  if (typeof text !== 'string') throw logError('invalid_response');

  const bytes = Buffer.byteLength(text);
  const lines = text.split('\n');
  const truncatedLine = Boolean(text && !text.endsWith('\n') && bytes >= MAX_BODY_BYTES - 4);
  if (lines.at(-1) === '' || truncatedLine) lines.pop();
  const inRange = lines.filter(line => {
    const delimiter = line.indexOf(' ');
    const timestamp = delimiter < 0 ? NaN : Date.parse(line.slice(0, delimiter));
    return timestamp >= window.fromMs && timestamp <= window.toMs;
  });
  const hitByteLimit = bytes >= MAX_BODY_BYTES || truncatedLine;
  /* 줄 수 상한: 구간으로 거르기 전에 받은 줄로 본다(구간 밖 줄을 거르면 남은 줄이 상한보다 적어도 앞부분은 읽지 않은 것, R5-02) */
  const limitReached = lines.length >= tail;
  const partial = limitReached || inRange.length !== lines.length || hitByteLimit;
  return { text: inRange.slice(-tail).join('\n'), window, partial, limitReached, outsideRetention: false };
}

const LOKI_PAGE_SIZE = 100;
const NANOSECONDS_PER_MS = 1_000_000n;
const LOG_LABELS = Object.freeze({
  kubernetes: ['namespace', 'pod', 'container', 'pod_uid'],
  otel: ['k8s_namespace_name', 'k8s_pod_name', 'k8s_container_name', 'k8s_pod_uid'],
});
const nanoTime = value => typeof value === 'string' && /^[1-9][0-9]{0,22}$/.test(value);

async function readLokiPodLogWindow(client, args, query, signal) {
  const { ns, name, uid, container, previous, search = '', cursor } = args;
  const { window, identify } = podLogTarget(client, args, signal);
  if (previous || typeof search !== 'string' || search.length > 256 || /[\x00-\x1f\x7f]/.test(search)) throw logError('invalid_request');
  if (cursor != null && (!Object.hasOwn(LOG_LABELS, cursor.schema) || !nanoTime(cursor.at) ||
    !Array.isArray(cursor.seen) || cursor.seen.length < 1 || cursor.seen.length > LOKI_PAGE_SIZE ||
    cursor.seen.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)))) throw logError('invalid_request');

  const before = await identify();
  const empty = { text: '', window, partial: false, cursor: null };
  if (Number.isFinite(before.startMs) && before.startMs > window.toMs) return { ...empty, outsideRetention: true };
  if (!Number.isFinite(before.instanceStartMs)) return { ...empty, unverifiedStream: true };
  const start = BigInt(Math.max(window.fromMs, before.instanceStartMs)) * NANOSECONDS_PER_MS;
  const end = BigInt(window.toMs) * NANOSECONDS_PER_MS + 1n;
  if (cursor && (BigInt(cursor.at) < start || BigInt(cursor.at) >= end)) throw logError('identity_changed');

  async function loki(path, params) {
    const result = await query('/loki/api/v1/' + path + '?' + new URLSearchParams(params));
    if (result?.status === 401 || result?.status === 403) throw logError('forbidden');
    if (result?.error === 'target') throw logError('unconfigured');
    if (result?.truncated) throw logError('response_too_large');
    if (result?.status !== 200) throw logError('connection');
    const decoded = JSON.parse(result.body);
    if (decoded?.status !== 'success') throw logError('invalid_response');
    return decoded.data;
  }

  const schemas = cursor ? [cursor.schema] : Object.keys(LOG_LABELS);
  const matchers = new Map(schemas.map(schema => [schema, Object.fromEntries(
    LOG_LABELS[schema].map((label, index) => [label, [ns, name, container, uid][index]]),
  )]));
  const selector = labels => '{' + Object.entries(labels).map(([key, value]) => key + '=' + JSON.stringify(value)).join(',') + '}';
  const matches = (stream, labels) => stream && Object.entries(labels).every(([key, value]) => stream[key] === value);
  let schema = cursor?.schema;
  if (!schema) {
    const params = new URLSearchParams({ start: String(start), end: String(end) });
    for (const labels of matchers.values()) params.append('match[]', selector(labels));
    const series = await loki('series', params);
    if (!Array.isArray(series)) throw logError('invalid_response');
    schema = schemas.find(candidate => series.some(stream => matches(stream, matchers.get(candidate))));
    if (!schema) return { ...empty, unverifiedStream: true };
  }
  const labels = matchers.get(schema);
  const expression = selector(labels) + (search ? ' |= ' + JSON.stringify(search) : '');
  async function readRange(from, to, limit) {
    if (from >= to) return [];
    const data = await loki('query_range', { query: expression, start: String(from), end: String(to), direction: 'backward', limit });
    if (data?.resultType !== 'streams' || !Array.isArray(data.result)) throw logError('invalid_response');
    const records = [];
    for (const item of data.result) {
      if (!matches(item.stream, labels) || !Array.isArray(item.values)) throw logError('identity_changed');
      const streamKey = JSON.stringify(Object.entries(item.stream).sort(([left], [right]) => left.localeCompare(right)));
      for (const [at, line] of item.values) {
        if (!nanoTime(at) || typeof line !== 'string') throw logError('invalid_response');
        const time = BigInt(at);
        if (time < from || time >= to || records.length >= limit) throw logError('invalid_response');
        records.push({ time, line, hash: createHash('sha256').update(streamKey).update('\0').update(line).digest('hex') });
      }
    }
    return records.sort((a, b) => a.time === b.time ? a.hash.localeCompare(b.hash) : a.time > b.time ? -1 : 1);
  }

  let records;
  if (cursor) {
    const boundary = BigInt(cursor.at);
    const ties = await readRange(boundary, boundary + 1n, LOKI_PAGE_SIZE);
    const remaining = [...ties];
    for (const hash of cursor.seen) {
      const index = remaining.findIndex(record => record.hash === hash);
      if (index < 0) return { ...empty, partial: true };
      remaining.splice(index, 1);
    }
    if (ties.length === LOKI_PAGE_SIZE) return { ...empty, partial: true };
    records = [...remaining, ...await readRange(start, boundary, LOKI_PAGE_SIZE - remaining.length)];
  } else {
    records = await readRange(start, end, LOKI_PAGE_SIZE);
  }

  const after = await identify();
  if (before.identity !== after.identity) throw logError('identity_changed');
  const last = records.at(-1)?.time;
  const next = records.length === LOKI_PAGE_SIZE && last >= start
    ? { schema, at: String(last), seen: records.filter(record => record.time === last).map(record => record.hash) } : null;
  const text = records.reverse().map(({ time, line }) => {
    const fraction = String(time % 1_000_000_000n).padStart(9, '0');
    const second = new Date(Number(time / 1_000_000_000n) * 1000).toISOString().slice(0, 19);
    return second + '.' + fraction + 'Z ' + line;
  }).join('\n');
  return { ...empty, text, cursor: next, limitReached: records.length >= LOKI_PAGE_SIZE };
}

module.exports = { readPodLogWindow, readLokiPodLogWindow };
