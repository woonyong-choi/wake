const { TOOL_REQUEST_TIMEOUT_MS } = require('../data/tool-connection-limits.js');
const { withRequestScope } = require('./k8s.cjs');
const { randomUUID, X509Certificate, createHash } = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const { checkServerIdentity, createSecureContext } = require('node:tls');
const { forward: nativeForward } = require('./portforward.cjs');

const KNOWN = [
  { kind: 'grafana', ui: true, match: s => s.labels['app.kubernetes.io/name'] === 'grafana' || /(^|-)grafana$/.test(s.name) },
  { kind: 'prometheus', ui: true, match: s => /(^|-)prometheus(-server)?$/.test(s.name) && !/operator|operated|exporter/.test(s.name) },
  { kind: 'alertmanager', ui: true, match: s => /(^|-)alertmanager$/.test(s.name) },
  { kind: 'argocd', ui: true, match: s => s.name === 'argocd-server' },
  { kind: 'loki', ui: false, match: s => /^(?:wake-)?loki(-gateway)?$/.test(s.name) },
  { kind: 'tempo', ui: false, match: s => /^(?:wake-)?tempo$/.test(s.name) },
];
const validName = value => typeof value === 'string' && /^[a-z0-9](?:[-a-z0-9.]{0,251}[a-z0-9])?$/.test(value);
const validUid = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(value);
// k8s.cjs가 시간 초과·네트워크 오류에 붙이는 종류만 일시 오류로 본다(그 밖의 오류는 확정 실패).
const TRANSIENT_KINDS = new Set(['unreachable', 'timeout']);
const failure = kind => Object.assign(new Error('tool target ' + kind), { kind });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function identity(object, kind, name, ns, uid) {
  return object?.apiVersion === 'v1' && object.kind === kind && object.metadata?.name === name && object.metadata.namespace === ns
    && validUid(object.metadata.uid) && (!uid || object.metadata.uid === uid) && !object.metadata.deletionTimestamp;
}
const HTTP_PORTS = Object.freeze({
  grafana: [['service', 80, 3000, ['grafana']], ['http', 3000, 3000, ['grafana']]],
  prometheus: [['http', 80, 9090, []], ['http', 9090, 9090, []], ['http-web', 9090, 9090, ['http-web']]],
  alertmanager: [['http', 9093, 9093, []], ['http-web', 9093, 9093, ['http-web']]],
  argocd: [['http', 80, 8080, []]],
  loki: [['http-metrics', 3100, 3100, ['http-metrics']]],
  tempo: [['tempo-prom-metrics', 3200, 3200, []]],
  opencost: [['http', 9003, 9003, ['http']]],
});
function webPort(service, kind, pinnedTls = false) {
  const contract = pinnedTls && kind === 'argocd' ? [['https', 443, 8080, []]] : HTTP_PORTS[kind] || [];
  const candidates = [];
  for (const port of service.spec?.ports || []) for (const [name, number, target, targetNames] of contract) {
    if (port.name !== name || port.port !== number || port.protocol && port.protocol !== 'TCP') continue;
    const expectedTarget = port.targetPort === target || typeof port.targetPort === 'string' && targetNames.includes(port.targetPort)
      || port.targetPort === undefined && port.port === target;
    if (expectedTarget) candidates.push({ ...port, targetNumber: target });
  }
  return candidates.length === 1 ? candidates[0] : null;
}

async function tlsBridge(upstreamPort, pin) {
  const cert = new X509Certificate(pin.pem);
  const hash = raw => createHash('sha256').update(raw).digest('hex');
  if (hash(cert.raw) !== pin.sha256 || Date.parse(cert.validFrom) > Date.now() || Date.parse(cert.validTo) <= Date.now()) throw failure('identity_unverified');
  const servername = 'argocd-server.argocd.svc';
  if (!cert.checkHost(servername)) throw failure('identity_unverified');
  const secureContext = createSecureContext({ ca: pin.pem, allowPartialTrustChain: true });
  const hop = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
  const endToEnd = headers => Object.fromEntries(Object.entries(headers).filter(([name]) => !hop.has(name)));
  const server = http.createServer((incoming, outgoing) => {
    if (incoming.headers.host !== '127.0.0.1:' + server.address().port || !incoming.url?.startsWith('/') || incoming.url.startsWith('//')) {
      outgoing.writeHead(400).end(); return;
    }
    const upstream = https.request({ hostname: '127.0.0.1', port: upstreamPort, path: incoming.url, method: incoming.method,
      headers: endToEnd(incoming.headers), servername, secureContext, rejectUnauthorized: true, agent: false,
      checkServerIdentity: (name, peer) => hash(peer.raw) === pin.sha256 ? checkServerIdentity(name, peer) : failure('identity_changed') }, response => {
      outgoing.writeHead(response.statusCode, endToEnd(response.headers)); response.pipe(outgoing);
    });
    upstream.setTimeout(TOOL_REQUEST_TIMEOUT_MS, () => upstream.destroy());
    upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
    outgoing.on('close', () => upstream.destroy());
    incoming.pipe(upstream);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { port: server.address().port, close() { server.close(); server.closeAllConnections(); } };
}
const TOOL_QUERY_ACCEPT = new Set(['application/json', '*/*']);
/* 메인 프로세스가 도구에 보내는 읽기 질의(GET)의 경로 허용 목록. 화면 탭이 없는 도구(Loki, Tempo)는 포워딩 자체를 이 목록으로 막는다(toolQueryBridge) */
const TOOL_QUERY_PATH = {
  loki: /^\/loki\/api\/v1\/(?:query(?:_range)?|labels?|series|rules|label\/[a-zA-Z_][a-zA-Z0-9_]*\/values)$/,
  tempo: /^\/api\/(?:v2\/)?(?:search(?:\/tags|\/tag\/[a-zA-Z0-9_.-]+\/values)?|traces\/[a-fA-F0-9]+|metrics\/query(?:_range)?)$/,
  prometheus: /^\/api\/v1\/(?:query(?:_range)?|series|labels|label\/[a-zA-Z_][a-zA-Z0-9_]*\/values|rules|alerts|metadata|status\/(?:buildinfo|runtimeinfo))$/,
  alertmanager: /^\/api\/v2\/(?:alerts(?:\/groups)?|silences|status)$/,
  /* Grafana: 대시보드 찾기만(Viewer 토큰을 Bearer로) */
  grafana: /^\/api\/search$/,
};
const QUERY_ONLY = new Set(KNOWN.filter(kind => !kind.ui).map(kind => kind.kind));

async function toolQueryBridge(upstreamPort, kind, validateTarget) {
  const server = http.createServer(async (incoming, outgoing) => {
    const origin = 'http://127.0.0.1:' + server.address().port;
    if (incoming.headers.host !== new URL(origin).host || !incoming.url?.startsWith('/') || incoming.url.startsWith('//')) {
      outgoing.writeHead(400).end(); return;
    }
    const url = URL.parse(incoming.url, origin);
    if (incoming.method !== 'GET' || incoming.headers['transfer-encoding'] || Number(incoming.headers['content-length'] || 0) !== 0) {
      outgoing.writeHead(405, { allow: 'GET' }).end(); return;
    }
    if (url?.origin !== origin || url.pathname !== '/ready' && !TOOL_QUERY_PATH[kind].test(url.pathname)) {
      outgoing.writeHead(403).end(); return;
    }
    try { await validateTarget(); } catch { outgoing.writeHead(502).end(); return; }
    if (outgoing.destroyed) return;
    const accept = TOOL_QUERY_ACCEPT.has(incoming.headers.accept) ? incoming.headers.accept : 'application/json';
    const upstream = http.get({ hostname: '127.0.0.1', port: upstreamPort, path: url.pathname + url.search,
      headers: { accept }, agent: false }, response => {
      const headers = { 'cache-control': 'no-store' };
      if (response.headers['content-type']) headers['content-type'] = response.headers['content-type'];
      outgoing.writeHead(response.statusCode, headers);
      response.on('error', () => outgoing.destroy());
      response.pipe(outgoing);
    });
    upstream.setTimeout(TOOL_REQUEST_TIMEOUT_MS, () => upstream.destroy());
    upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
    outgoing.on('close', () => upstream.destroy());
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { port: server.address().port, close() { server.close(); server.closeAllConnections(); } };
}

function readCostAllocation(port, params, signal) {
  const url = new URL(`http://127.0.0.1:${port}/allocation`);
  url.search = new URLSearchParams(params);
  return new Promise((resolve, reject) => {
    const request = http.get(url, { agent: false, signal, headers: { accept: 'application/json' } }, async response => {
      if (response.statusCode !== 200) {
        response.destroy();
        reject(failure([401, 403].includes(response.statusCode) ? 'forbidden' : 'upstream'));
        return;
      }
      try {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of response) {
          bytes += chunk.length;
          if (bytes > 8 * 1024 * 1024) throw failure('too_large');
          chunks.push(chunk);
        }
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (result?.code !== 200 || !Array.isArray(result.data)) throw failure('invalid_response');
        resolve(result);
      } catch (error) {
        response.destroy();
        reject(error);
      }
    });
    request.once('error', reject);
  });
}

/* 읽기 질의(query)가 확인한 바인딩(Service·Endpoints·Pod 대조)을 다시 쓰는 시간: 이 안의 질의는 API 서버에 확인 GET을 다시 보내지 않는다.
   탭으로 여는 도구(open)와 확인 실패는 그대로 매번 확인한다 */
const QUERY_VALIDATION_TTL_MS = 30_000;
/* 로컬 질의 다리(Loki·Tempo)의 요청마다 확인을 다시 쓰는 짧은 시간: 공유 Pod watch 캐시가 같은 Pod(같은 UID)를 보일 때만. 캐시가 다른 UID·없음을
   보이거나 캐시가 없으면(podIdentity가 undefined) 요청마다 확인한다(교체된 Pod는 다음 요청에서 막힘) */
const BRIDGE_VALIDATION_TTL_MS = 10_000;
function createTools({ forward = nativeForward, now = Date.now, validationTtlMs = QUERY_VALIDATION_TTL_MS, bridgeTtlMs = BRIDGE_VALIDATION_TTL_MS, podIdentity = () => undefined } = {}) {
  const bindings = new Map(), generations = new Map(), forwards = new Map(), forwardJobs = new Map(), discoveries = new Map(), found = new Map();
  function close(bindingId) { const open = forwards.get(bindingId); if (open) { forwards.delete(bindingId); open.close(); } }
  async function costTargets(client, scope) {
    const result = await withRequestScope(client, scope).request('GET', '/api/v1/services');
    if (result?.apiVersion !== 'v1' || result.kind !== 'ServiceList' || !Array.isArray(result.items)) throw failure('invalid_response');
    return result.items.flatMap(item => {
      const { namespace, name, uid, labels } = item?.metadata || {};
      const service = { apiVersion: 'v1', kind: 'Service', ...item };
      const named = validName(name) && (labels?.['app.kubernetes.io/name'] === 'opencost' || /(^|-)opencost$/.test(name));
      return named && validName(namespace) && identity(service, 'Service', name, namespace)
        && service.spec?.clusterIP !== 'None' && webPort(service, 'opencost') ? [{ namespace, name, uid }] : [];
    });
  }
  async function costSource(client, service, scope) {
    const target = await observe(client, service.namespace, service.name, undefined, 'opencost', scope);
    if (target.binding.serviceUid !== service.uid) throw failure('identity_changed');
    const pod = { ns: service.namespace, pod: target.binding.podName, port: target.binding.targetPort };
    const validate = async () => {
      await observe(client, service.namespace, service.name, target.binding, 'opencost', scope);
      return pod;
    };
    const tunnel = await forward(client, validate, () => scope, pod);
    return {
      allocation: params => readCostAllocation(tunnel.port, params, scope.signal),
      validate, close: tunnel.close,
    };
  }
  async function observe(client, ns, name, expected, kind, scope = {}) {
    client = withRequestScope(client, scope);
    const prefix = '/api/v1/namespaces/' + ns;
    const read = async (resource, target) => {
      try { return await client.request('GET', prefix + '/' + resource + '/' + target); }
      catch (error) {
        if (error?.kind !== 'forbidden' && error?.status !== 403) throw error;
        throw Object.assign(failure('forbidden'), { status: 403, permission: { verb: 'get', resource, namespace: ns } });
      }
    };
    // 확정 오류(403 등)가 일시 오류(시간 초과)에 가려지지 않도록 둘 다 끝난 뒤 확정 오류를 먼저 던진다.
    const settled = await Promise.allSettled([read('services', name), read('endpoints', name)]);
    const failed = settled.filter(r => r.status === 'rejected').map(r => r.reason);
    if (failed.length) throw failed.find(error => !TRANSIENT_KINDS.has(error?.kind)) ?? failed[0];
    const [service, endpoints] = settled.map(r => r.value);
    if (!identity(service, 'Service', name, ns, expected?.serviceUid) || service.spec?.clusterIP === 'None') throw failure('identity_changed');
    const port = webPort(service, kind);
    if (!port || expected && (port.port !== expected.port || (port.name || '') !== expected.portName)) throw failure('identity_changed');
    if (!identity(endpoints, 'Endpoints', name, ns)) throw failure('identity_unverified');
    const candidates = [];
    for (const sub of endpoints.subsets || []) {
      const ports = (sub.ports || []).filter(p => (p.name || '') === (port.name || '') && p.port === port.targetNumber && (!p.protocol || p.protocol === 'TCP'));
      if (ports.length !== 1) continue;
      for (const address of sub.addresses || []) {
        const ref = address.targetRef;
        if (ref?.kind !== 'Pod' || !validName(ref.name) || !validUid(ref.uid) || ref.namespace && ref.namespace !== ns) continue;
        candidates.push({ name: ref.name, uid: ref.uid, port: ports[0].port });
      }
    }
    if (candidates.length !== 1) throw failure('identity_unverified');
    const ref = candidates[0], pod = await read('pods', ref.name);
    if (!identity(pod, 'Pod', ref.name, ns, ref.uid) || pod.status?.phase !== 'Running' || !pod.status.conditions?.some(c => c.type === 'Ready' && c.status === 'True')
      || !service.spec?.selector || !Object.keys(service.spec.selector).length || !Object.entries(service.spec.selector).every(([key, value]) => pod.metadata.labels?.[key] === value)) throw failure('identity_changed');
    const binding = { serviceUid: service.metadata.uid, podUid: ref.uid, podName: ref.name, targetPort: ref.port, port: port.port, portName: port.name || '' };
    if (expected && !same(binding, expected)) throw failure('identity_changed');
    const current = await read('services', name);
    if (!identity(current, 'Service', name, ns, binding.serviceUid) || !same(current.spec, service.spec)) throw failure('identity_changed');
    return { binding, pod };
  }
  /* maxAge: 그 시간 안에 끝난 찾기 결과를 다시 쓴다(출처 대상 확인·관측 주소처럼 자주 묻는 쪽). refresh는 언제나 새로 찾는다 */
  function find(client, contextId, { refresh = false, maxAge = 0 } = {}) {
    const running = discoveries.get(contextId);
    if (running && !refresh) return running;
    const recent = found.get(contextId);
    if (!refresh && maxAge > 0 && recent && now() - recent.at < maxAge) return Promise.resolve(structuredClone(recent.rows));
    const pending = discover(client, contextId);
    discoveries.set(contextId, pending);
    const clear = () => { if (discoveries.get(contextId) === pending) discoveries.delete(contextId); };
    void pending.then(rows => { found.set(contextId, { at: now(), rows: structuredClone(rows) }); if (found.size > 128) found.delete(found.keys().next().value); clear(); }, () => { found.delete(contextId); clear(); });
    return pending;
  }
  async function discover(client, contextId) {
    if (typeof contextId !== 'string' || !contextId || contextId.length > 512) throw failure('unconfigured');
    if (!generations.has(contextId) && generations.size >= 128) throw failure('capacity');
    const generation = (generations.get(contextId) || 0) + 1; generations.set(contextId, generation);
    const result = await client.request('GET', '/api/v1/services');
    if (result?.apiVersion !== 'v1' || result.kind !== 'ServiceList' || !Array.isArray(result.items)) throw failure('invalid_response');
    const servicesList = result.items.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || Object.hasOwn(item, 'apiVersion') && item.apiVersion !== 'v1' || Object.hasOwn(item, 'kind') && item.kind !== 'Service') throw failure('invalid_response');
      return { ...item, apiVersion: 'v1', kind: 'Service' };
    });
    const out = [], active = new Set();
    for (const kind of KNOWN) {
      const services = servicesList.filter(s => s.spec?.clusterIP !== 'None' && kind.match({ name: s.metadata?.name || '', labels: s.metadata?.labels || {} }));
      if (!services.length) continue;
      if (services.length !== 1) { out.push({ kind: kind.kind, ui: kind.ui, selection: 'ambiguous', ready: 0, notReady: 0, svc: '', ns: '' }); continue; }
      const service = services[0], ns = service.metadata?.namespace, name = service.metadata?.name;
      if (!validName(ns) || !validName(name) || !identity(service, 'Service', name, ns)) throw failure('invalid_response');
      const base = { kind: kind.kind, ui: kind.ui, ns, svc: name, url: '', uid: typeof service.metadata.uid === 'string' ? service.metadata.uid : '' }; // uid: 찾기 확인 근거가 같은 대상인지 보는 Service UID
      let observed;
      try { observed = await observe(client, ns, name, undefined, kind.kind); if (observed.binding.serviceUid !== service.metadata.uid) throw failure('identity_changed'); }
      catch (error) {
        // 일시 오류: 같은 Service UID로 이미 열린 포워드가 있는 기존 바인딩만 유지하되 새 TCP 연결은 같은 바인딩을 다시 확인할 때까지 멈춘다(suspended).
        if (TRANSIENT_KINDS.has(error?.kind) && typeof service.metadata.uid === 'string') {
          const held = [...bindings].find(([id, b]) => !b.fixed && b.contextId === contextId && b.row.kind === kind.kind && b.row.ns === ns && b.row.svc === name
            && b.binding.serviceUid === service.metadata.uid && forwards.has(id));
          if (held) { active.add(held[0]); held[1].suspended = true; }
        }
        out.push({ ...base, selection: 'unverified', ready: 0, notReady: 0, ...(error?.kind === 'forbidden' && error.permission ? { permission: error.permission } : {}) });
        continue;
      }
      if (generations.get(contextId) !== generation) throw failure('stale_discovery');
      const old = [...bindings.values()].find(b => !b.fixed && b.contextId === contextId && b.row.kind === kind.kind && b.row.ns === ns && b.row.svc === name && same(b.binding, observed.binding));
      const bindingId = old?.row.bindingId || randomUUID();
      const row = { ...base, port: observed.binding.port, portName: observed.binding.portName, ready: 1, notReady: 0, bindingId, selection: 'verified', version: '' };
      if (!old) bindings.set(bindingId, { contextId, binding: observed.binding, row });
      else old.suspended = false;
      active.add(bindingId); out.push(structuredClone(row));
    }
    if (generations.get(contextId) !== generation) throw failure('stale_discovery');
    for (const [key, binding] of bindings) if (!binding.fixed && binding.contextId === contextId && !active.has(key)) { close(key); bindings.delete(key); }
    return out;
  }
  async function findFixed(contextId, entries, scope) {
    const out = [], seen = new Set();
    for (const { receipt, client, validate: validateReceipt } of entries) {
      if (receipt.contextId !== contextId || !['grafana', 'argocd', 'prometheus', 'loki', 'tempo'].includes(receipt.kind) || seen.has(receipt.kind)) throw failure('identity_unverified');
      seen.add(receipt.kind);
      const observeFixed = async (scope = {}, includeReceipt = true) => {
        const scopedClient = withRequestScope(client, scope);
        if (includeReceipt) await validateReceipt(scope);
        const prefix = '/api/v1/namespaces/' + receipt.namespace;
        const [service, pod] = await Promise.all([
          scopedClient.request('GET', prefix + '/services/' + receipt.serviceName),
          scopedClient.request('GET', prefix + '/pods/' + receipt.podName),
        ]);
        const port = webPort(service, receipt.kind, Boolean(receipt.evidence?.tls)), selector = service.spec?.selector;
        if (!identity(service, 'Service', receipt.serviceName, receipt.namespace, receipt.serviceUid)
          || !identity(pod, 'Pod', receipt.podName, receipt.namespace, receipt.podUid) || !port
          || !selector || !Object.keys(selector).length || !Object.entries(selector).every(([key, value]) => pod.metadata.labels?.[key] === value)) throw failure('identity_changed');
        const ports = (pod.spec?.containers || []).flatMap(c => c.ports || []).filter(p => p.containerPort === port.targetNumber && (typeof port.targetPort !== 'string' || p.name === port.targetPort) && (!p.protocol || p.protocol === 'TCP'));
        if (ports.length !== 1) throw failure('identity_unverified');
        const ready = pod.status?.phase === 'Running' && pod.status.conditions?.some(c => c.type === 'Ready' && c.status === 'True');
        return { pod, ready, binding: { serviceUid: receipt.serviceUid, podUid: receipt.podUid, podName: receipt.podName,
          targetPort: port.targetNumber, port: port.port, portName: port.name || '' } };
      };
      const { binding, ready } = await observeFixed(scope);
      const base = { kind: receipt.kind, ui: !['loki', 'tempo'].includes(receipt.kind), ns: receipt.namespace, svc: receipt.serviceName, url: '', uid: receipt.serviceUid,
        port: binding.port, portName: binding.portName, version: '' };
      if (!ready) {
        out.push({ ...base, ready: 0, notReady: 1, selection: 'not-ready' });
        continue;
      }
      const old = [...bindings.values()].find(b => b.fixed && b.contextId === contextId && b.row.kind === receipt.kind && same(b.binding, binding) && same(b.receipt, receipt));
      const bindingId = old?.row.bindingId || randomUUID();
      const row = { ...base, ready: 1, notReady: 0, bindingId, selection: 'verified' };
      const validate = async (scope, includeReceipt = true) => {
        const observed = await observeFixed(scope, includeReceipt);
        if (!same(observed.binding, binding)) throw failure('identity_changed');
        if (!observed.ready) throw failure('unreachable');
        return { pod: observed.pod };
      };
      for (const [id, entry] of bindings) {
        if (entry.fixed && entry.contextId === contextId && entry.row.kind === receipt.kind && id !== bindingId) {
          close(id);
          bindings.delete(id);
        }
      }
      if (!old) bindings.set(bindingId, { contextId, binding, row, fixed: true, receipt, client, validate });
      out.push(structuredClone(row));
    }
    return out;
  }
  async function rebind(client, contextId, requested, entries, scope) {
    const keys = ['kind', 'ns', 'svc', 'port', 'portName', 'url'];
    const matches = row => keys.every(key => requested[key] === row[key]);
    const current = [...bindings.values()].filter(entry => entry.contextId === contextId && matches(entry.row));
    const fixed = entries.filter(({ receipt }) => receipt.kind === requested.kind);
    if (fixed.length) {
      const rows = await findFixed(contextId, fixed, scope);
      if (rows.length === 1 && matches(rows[0])) {
        if (!rows[0].bindingId) throw failure('unreachable');
        return rows[0];
      }
      throw failure('identity_changed');
    }
    if (current.length === 1) return current[0].row;
    if (current.length > 1) throw failure('identity_unverified');
    const pending = discoveries.get(contextId) || find(withRequestScope(client, scope), contextId);
    let found;
    try { found = await pending; }
    catch (error) {
      const latest = discoveries.get(contextId);
      if (error.kind !== 'stale_discovery' || !latest || latest === pending) throw error;
      found = await latest;
    }
    const rows = found.filter(row => row.bindingId && matches(row));
    if (rows.length !== 1) throw failure('identity_unverified');
    return rows[0];
  }
  async function open(client, contextId, requested, scope = {}) {
    scope.signal?.throwIfAborted();
    const entry = bindings.get(requested?.bindingId);
    if (!entry || entry.contextId !== contextId || !['kind', 'ns', 'svc', 'port', 'portName', 'url'].every(key => requested[key] === entry.row[key])) throw failure('unconfigured');
    if (entry.fixed) client = entry.client;
    entry.operationScope = scope;
    const validate = async (includeReceipt = true) => {
      try {
        scope.signal?.throwIfAborted();
        if (bindings.get(entry.row.bindingId) !== entry) throw failure('identity_changed');
        const result = entry.fixed ? await entry.validate(scope, includeReceipt) : await observe(client, entry.row.ns, entry.row.svc, entry.binding, entry.row.kind, scope);
        scope.signal?.throwIfAborted();
        if (bindings.get(entry.row.bindingId) !== entry) throw failure('identity_changed');
        entry.suspended = false; entry.validatedAt = now();
        return result;
      } catch (error) {
        if (!entry.fixed && TRANSIENT_KINDS.has(error?.kind)) entry.suspended = true; else close(entry.row.bindingId);
        throw error;
      }
    };
    let current = forwards.get(entry.row.bindingId);
    const fresh = scope.queryBridge && current && !entry.suspended && now() - (entry.validatedAt ?? -Infinity) < validationTtlMs;
    if (!fresh && (!current || !scope.queryBridge || !QUERY_ONLY.has(entry.row.kind))) await validate();
    scope.signal?.throwIfAborted();
    if (!current) {
      let job = forwardJobs.get(entry.row.bindingId);
      if (!job) {
        job = (async () => {
          const activeScope = () => entry.operationScope?.finished ? undefined : entry.operationScope;
          const target = async () => {
            if (bindings.get(entry.row.bindingId) !== entry) throw failure('identity_changed');
            if (entry.fixed) await entry.validate(activeScope());
            else await observe(client, entry.row.ns, entry.row.svc, entry.binding, entry.row.kind, activeScope());
            return { ns: entry.row.ns, pod: entry.binding.podName, port: entry.binding.targetPort };
          };
          const initialTarget = { ns: entry.row.ns, pod: entry.binding.podName, port: entry.binding.targetPort };
          // 일시 오류로 멈춘 동안에는 새 TCP 연결마다 같은 바인딩을 다시 확인하고, 통과해야 연결을 연다.
          const guard = async () => {
            if (entry.suspended) await target();
            if (bindings.get(entry.row.bindingId) !== entry) throw failure('identity_changed');
            entry.suspended = false;
          };
          const opened = await forward(client, target, activeScope, initialTarget, guard);
          let bridge;
          try {
            if (entry.receipt?.evidence?.tls) bridge = await tlsBridge(opened.port, entry.receipt.evidence.tls);
            else if (QUERY_ONLY.has(entry.row.kind)) {
              let checkedAt = -Infinity;
              const bridgeTarget = async () => {
                const seen = podIdentity(contextId, entry.row.ns, entry.binding.podName);
                if (typeof seen === 'string' && seen === entry.binding.podUid && !entry.suspended && bindings.get(entry.row.bindingId) === entry && now() - checkedAt < bridgeTtlMs) return;
                checkedAt = -Infinity;
                await target();
                checkedAt = now();
              };
              bridge = await toolQueryBridge(opened.port, entry.row.kind, bridgeTarget);
            }
          } catch (error) { opened.close(); throw error; }
          if (scope.signal?.aborted || bindings.get(entry.row.bindingId) !== entry) {
            bridge?.close(); opened.close();
            scope.signal?.throwIfAborted();
            throw failure('identity_changed');
          }
          const scheme = !bridge && (entry.binding.port === 443 || /https/.test(entry.binding.portName)) ? 'https' : 'http';
          const result = { url: `${scheme}://127.0.0.1:${bridge?.port || opened.port}/`, close() { bridge?.close(); opened.close(); } };
          forwards.set(entry.row.bindingId, result);
          return result;
        })();
        forwardJobs.set(entry.row.bindingId, job);
      }
      try { current = await job; }
      finally { if (forwardJobs.get(entry.row.bindingId) === job) forwardJobs.delete(entry.row.bindingId); }
    }
    return { url: current.url, via: 'port-forward', source: entry.fixed ? 'operator-fixed-pod' : 'endpoints', binding: Object.freeze({ contextId, kind: entry.row.kind, namespace: entry.row.ns, serviceName: entry.row.svc, ...entry.binding }), validate, validateTarget: () => validate(false) };
  }
  /* bearer: 그 도구의 읽기 토큰(Grafana Viewer, 키체인). 포워딩한 로컬 주소로 가는 이 요청에만 붙는다 */
  async function query(client, contextId, kind, route, entries, signal, accept = 'application/json', bearer = null) {
    if (!TOOL_QUERY_ACCEPT.has(accept)) return { error: 'header' };
    if (!Object.hasOwn(TOOL_QUERY_PATH, kind) || typeof route !== 'string' || route.length > 8192 ||
      !route.startsWith('/') || route.startsWith('//') || /[\\#\x00-\x20\x7f]/.test(route)) return { error: 'route' };
    const path = new URL(route, 'http://127.0.0.1').pathname;
    if (path !== '/ready' && !TOOL_QUERY_PATH[kind].test(path)) return { error: 'route' };
    const started = performance.now(), fixed = entries.filter(({ receipt }) => receipt.kind === kind);
    const scope = { queryBridge: true, signal: AbortSignal.any([signal, AbortSignal.timeout(TOOL_REQUEST_TIMEOUT_MS)]), deadline: Date.now() + TOOL_REQUEST_TIMEOUT_MS };
    try {
      const current = [...bindings.values()].filter(entry => entry.contextId === contextId && entry.row.kind === kind && !!entry.fixed === !!fixed.length);
      const rows = current.length ? current.map(entry => entry.row)
        : (fixed.length ? await findFixed(contextId, fixed, scope) : await find(withRequestScope(client, scope), contextId)).filter(row => row.kind === kind);
      if (rows.length === 0) return { error: 'unconfigured' };
      if (rows.length !== 1 || !rows[0].bindingId) return { error: 'target' };
      const { url } = await open(client, contextId, rows[0], scope);
      const response = await fetch(new URL(route, url), { headers: { accept, ...(typeof bearer === 'string' && bearer ? { authorization: 'Bearer ' + bearer } : {}) }, redirect: 'error', signal: scope.signal });
      const chunks = []; let size = 0, truncated = false;
      for await (const chunk of response.body || []) {
        const remaining = 1024 * 1024 - size;
        chunks.push(chunk.subarray(0, remaining)); size += Math.min(remaining, chunk.length);
        if (chunk.length > remaining) { truncated = true; break; }
      }
      return { status: response.status, type: response.headers.get('content-type'), elapsedMs: Math.round(performance.now() - started),
        headers: Object.fromEntries(response.headers), bytes: size, truncated, body: Buffer.concat(chunks).toString('utf8') };
    } catch (error) {
      /* the common error contract (timeout / cancelled / connection): a request the tool did not answer before the limit is a timeout even when the
         forward's socket was torn down by that same abort first (fetch then reports a closed socket); a refused or dropped connection is a connection error.
         A failure that already names its kind (the binding's own checks) keeps it. The message carries no address */
      if (typeof error?.kind === 'string') throw error;
      /* the socket can close a moment before the abort that closed it is seen here: give the abort a beat to land before calling it a dropped connection */
      if (!scope.signal.aborted) await new Promise(resolve => setTimeout(resolve, 50));
      if (scope.signal.aborted) {
        const reason = scope.signal.reason;
        throw Object.assign(new Error('tool request ' + (reason?.name === 'TimeoutError' ? 'timed out' : 'cancelled')), { kind: reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled' });
      }
      throw Object.assign(new Error('tool connection failed'), { kind: 'connection' });
    } finally { scope.finished = true; }
  }
  return { find, findFixed, open, rebind, query, costTargets, costSource, isFixed(contextId, row) { const entry = bindings.get(row?.bindingId); return entry?.fixed === true && entry.contextId === contextId && ['kind', 'ns', 'svc', 'port', 'portName', 'url'].every(key => row[key] === entry.row[key]); }, isBound(contextId, requested) {
    const entry = bindings.get(requested?.bindingId);
    return !!entry && entry.contextId === contextId && ['kind', 'ns', 'svc', 'port', 'portName', 'url'].every(key => requested[key] === entry.row[key]);
  }, closeAll() { for (const id of forwards.keys()) close(id); bindings.clear(); generations.clear(); discoveries.clear(); found.clear(); } };
}
module.exports = { createTools, readCostAllocation };
