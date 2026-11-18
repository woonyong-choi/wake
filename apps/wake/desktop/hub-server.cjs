/*
 * 외부 AI 길(spec/architecture.md#F-ARC-006): 127.0.0.1에만 여는 HTTP 서버 하나에 두 경로.
 *   POST /mcp                 MCP(Streamable HTTP, JSON 응답): initialize, ping, tools/list, tools/call. stdio 클라이언트는 mcp-stdio.cjs가 이어 준다
 *   GET  /api/v1/tools        도구 목록(입력 JSON 스키마)
 *   POST /api/v1/tools/<이름> 도구 하나 부르기(본문 JSON = 인자)
 *   GET  /api/v1/audit?from&to&incident&transport&tool  감사 기록(query_audit 도구와 같음)
 * 인증: 클라이언트마다 토큰(Authorization: Bearer). 저장소에는 토큰의 SHA-256만 두고 값은 만들 때 한 번만 보인다.
 * 클라이언트는 경로(mcp 또는 api) 하나와 범위(클러스터, namespace, 종류)를 가진다. 경로마다 켜고 끈다(기본 꺼짐).
 * 기본 주소: 127.0.0.1:47821(DEFAULT_PORT, 설정 › AI 연결에서 바꿈). 모든 호출은 도구 층(hub-tools.cjs)을 지나 감사 기록에 transport와 함께 남는다.
 * 남용 막기(S-14): JSON-RPC 묶음은 16개까지, 클라이언트마다 10초에 RATE_MAX 호출(넘으면 429), 마지막 호출 시각은 메모리에 두고 1분마다 한 번 저장,
 *   토큰은 만든 뒤 TOKEN_DAYS(기본 90일) 지나면 401 token_expired. rotateClient는 새 토큰을 내고 이전 토큰을 바로 무효로 한다(만료 기록이 없는 옛 클라이언트는 만료 없음).
 */
const http = require('node:http');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 47821;
const PROTOCOL = '2025-06-18';
const MAX_BODY = 1024 * 1024;
const MAX_BATCH = 16, RATE_WINDOW = 10_000, RATE_MAX = 50, FLUSH_EVERY = 60_000, TOKEN_DAYS = 90, DAY = 86_400_000;
const sha = v => createHash('sha256').update(String(v)).digest();
const readBody = req => new Promise((resolve, reject) => { let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('json'), { status: 400 })); } }); req.on('error', reject); });

/** MCP JSON-RPC 한 메시지(initialize, ping, tools/list, tools/call). list() -> 도구 정의, call(name, args) -> 도구 층 결과({ result } 또는 { error }).
 *  외부 클라이언트(아래 서버)와 내장 AI의 구독 CLI 실행(ai-cli.cjs)이 같은 응답 모양을 쓴다. 알림(id 없음)은 null */
async function mcpMessage(msg, { list, call, version = '0' }) {
  const reply = result => ({ jsonrpc: '2.0', id: msg.id, result }), fail = (code, message) => ({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code, message } });
  if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'invalid request');
  if (msg.id === undefined) return null; // notification (notifications/initialized …)
  if (msg.method === 'initialize') return reply({ protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'wake', version },
    instructions: 'Wake desktop hub: read-only Kubernetes incident tools. propose_action only creates a request a person approves in the Wake desktop.' });
  if (msg.method === 'ping') return reply({});
  if (msg.method === 'tools/list') return reply({ tools: list().map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: t.readOnly } })) });
  if (msg.method === 'tools/call') {
    const r = await call(msg.params?.name, msg.params?.arguments ?? {});
    return reply(r.error ? { isError: true, content: [{ type: 'text', text: JSON.stringify(r) }] } : { content: [{ type: 'text', text: JSON.stringify(r) }], structuredContent: r });
  }
  return fail(-32601, 'method not found');
}

function createHubServer({ store, tools, version = '0', now = Date.now }) {
  const clients = store.docs('ai-clients'), settings = store.docs('ai-server');
  const lastCalls = new Map(), rates = new Map();
  let server = null, listening = null;
  const config = () => ({ mcp: false, api: false, port: DEFAULT_PORT, ...(settings.get('config') ?? {}) });

  /** 클라이언트 추가: 토큰 값은 이 응답에만 있다 */
  function addClient({ name, transport, scope, days = TOKEN_DAYS }) {
    if (typeof name !== 'string' || !name.trim() || name.length > 80) throw Object.assign(new Error('name'), { kind: 'invalid_request' });
    if (!['mcp', 'api'].includes(transport)) throw Object.assign(new Error('transport'), { kind: 'invalid_request' });
    if (typeof scope?.cluster !== 'string' || !scope.cluster) throw Object.assign(new Error('scope'), { kind: 'invalid_request' });
    const list = v => (Array.isArray(v) ? v : String(v ?? '').split(',')).map(x => String(x).trim()).filter(Boolean);
    const token = `wake_${randomBytes(24).toString('base64url')}`, id = `cl-${randomBytes(6).toString('hex')}`;
    const life = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : TOKEN_DAYS;
    clients.put(id, { name: name.trim(), transport, scope: { cluster: scope.cluster, namespaces: list(scope.namespaces), kinds: list(scope.kinds) }, tokenHash: sha(token).toString('hex'), createdAt: now(), expiresAt: now() + life * DAY, lastCall: null });
    return { id, token };
  }
  /** 새 토큰(값은 이 응답에만): 이전 토큰은 바로 무효, 만료는 지금부터 다시 */
  function rotateClient(id, { days = TOKEN_DAYS } = {}) {
    const c = clients.get(id); if (!c) return null;
    const token = `wake_${randomBytes(24).toString('base64url')}`, life = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : TOKEN_DAYS;
    clients.put(id, { ...c, tokenHash: sha(token).toString('hex'), rotatedAt: now(), expiresAt: now() + life * DAY });
    return { id, token };
  }
  const listClients = () => clients.all().map(({ tokenHash, ...c }) => ({ ...c, lastCall: lastCalls.get(c.id) ?? c.lastCall ?? null })).sort((a, b) => a.createdAt - b.createdAt);
  const removeClient = id => { lastCalls.delete(id); rates.delete(id); return clients.remove(id); };
  function authenticate(req) {
    const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization ?? '');
    if (!m) return null;
    const h = sha(m[1]);
    return clients.all().find(c => { const want = Buffer.from(c.tokenHash, 'hex'); return want.length === h.length && timingSafeEqual(want, h); }) ?? null;
  }
  const caller = (client, transport) => ({ transport, requester: { kind: 'external', name: client.name }, client: client.name, scope: client.scope });
  /* 마지막 호출 시각: 요청마다 디스크에 쓰지 않고 메모리에, FLUSH_EVERY마다 바뀐 것만 저장 */
  const touch = client => lastCalls.set(client.id, now());
  function flush() {
    for (const [id, at] of lastCalls) { const c = clients.get(id); if (c && c.lastCall !== at) { try { clients.put(id, { ...c, lastCall: at }); } catch { /* 다음 번에 */ } } }
  }
  const flusher = setInterval(flush, FLUSH_EVERY); flusher.unref?.();
  /** 10초 창에 RATE_MAX 호출(묶음은 메시지 수만큼) */
  function allowed(client, cost = 1) {
    const t = now(), r = rates.get(client.id);
    if (!r || t - r.start >= RATE_WINDOW) { rates.set(client.id, { start: t, count: cost }); return cost <= RATE_MAX; }
    r.count += cost; return r.count <= RATE_MAX;
  }

  const send = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }); res.end(body === undefined ? '' : JSON.stringify(body)); };
  /* MCP JSON-RPC 한 메시지: 외부 클라이언트의 도구 호출은 그 클라이언트의 범위로 */
  const mcp = (msg, client) => mcpMessage(msg, { list: () => tools.list(), call: (name, args) => tools.call(name, args, caller(client, 'mcp')), version });

  async function handle(req, res) {
    const url = new URL(req.url, `http://${HOST}`), c = config();
    if (req.headers.origin) return send(res, 403, { error: 'origin' }); // 브라우저 페이지에서 오는 요청(DNS rebinding 포함)은 받지 않는다
    const isMcp = url.pathname === '/mcp', isApi = url.pathname.startsWith('/api/v1/');
    if (!isMcp && !isApi) return send(res, 404, { error: 'not_found' });
    if ((isMcp && !c.mcp) || (isApi && !c.api)) return send(res, 503, { error: 'transport_off' });
    const client = authenticate(req);
    if (!client) return send(res, 401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' });
    if (client.expiresAt && now() >= client.expiresAt) return send(res, 401, { error: 'token_expired' }, { 'www-authenticate': 'Bearer error="invalid_token"' });
    if (client.transport !== (isMcp ? 'mcp' : 'api')) return send(res, 403, { error: 'transport' });
    if (!allowed(client)) return send(res, 429, { error: 'rate_limited' }, { 'retry-after': String(Math.ceil(RATE_WINDOW / 1000)) });
    touch(client);
    try {
      if (isMcp) {
        if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { allow: 'POST' });
        const body = await readBody(req);
        if (Array.isArray(body) && (body.length === 0 || body.length > MAX_BATCH)) return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: `batch of 1 to ${MAX_BATCH} messages` } });
        if (Array.isArray(body) && !allowed(client, body.length - 1)) return send(res, 429, { error: 'rate_limited' }, { 'retry-after': String(Math.ceil(RATE_WINDOW / 1000)) });
        if (Array.isArray(body)) { const out = (await Promise.all(body.map(m => mcp(m, client)))).filter(Boolean); return out.length ? send(res, 200, out) : send(res, 202); }
        const out = await mcp(body, client);
        return out ? send(res, 200, out) : send(res, 202);
      }
      if (req.method === 'GET' && url.pathname === '/api/v1/tools') return send(res, 200, { tools: tools.list() });
      if (req.method === 'GET' && url.pathname === '/api/v1/audit') {
        const q = Object.fromEntries(url.searchParams), now = Date.now();
        const args = { window: { from: q.from ?? new Date(now - 86_400_000).toISOString(), to: q.to ?? new Date(now).toISOString() }, ...(q.incident ? { incident: q.incident } : {}), ...(q.transport ? { transport: q.transport } : {}), ...(q.tool ? { tool: q.tool } : {}) };
        const r = await tools.call('query_audit', args, caller(client, 'api'));
        return send(res, r.error ? (r.error === 'forbidden' ? 403 : 400) : 200, r);
      }
      const m = /^\/api\/v1\/tools\/([a-z_]+)$/.exec(url.pathname);
      if (m && req.method === 'POST') {
        const r = await tools.call(m[1], await readBody(req), caller(client, 'api'));
        return send(res, r.error ? ({ forbidden: 403, invalid_request: 400, unknown_tool: 404, missing: 404, unconfigured: 503 })[r.error] ?? 502 : 200, r);
      }
      return send(res, 404, { error: 'not_found' });
    } catch (error) { return send(res, error.status ?? 500, { error: error.status === 413 ? 'too_large' : error.status === 400 ? 'invalid_json' : 'failed' }); }
  }

  /** 켜진 경로가 있으면 열고, 없으면 닫는다. { listening, host, port, mcp, api } */
  async function apply() {
    const c = config(), want = c.mcp || c.api;
    if (server && (!want || listening !== c.port)) { flush(); await new Promise(r => server.close(() => r())); server.closeAllConnections?.(); server = null; listening = null; }
    if (want && !server) {
      const s = http.createServer((req, res) => { handle(req, res).catch(() => send(res, 500, { error: 'failed' })); });
      await new Promise((resolve, reject) => { s.once('error', reject); s.listen(c.port, HOST, resolve); });
      server = s; listening = c.port;
    }
    return state();
  }
  const state = () => ({ ...config(), listening: !!server, host: HOST, url: server ? `http://${HOST}:${listening}` : null });
  async function set(patch) {
    const c = config(), next = { mcp: patch.mcp ?? c.mcp, api: patch.api ?? c.api, port: Number.isInteger(patch.port) && patch.port > 1023 && patch.port < 65536 ? patch.port : c.port };
    settings.put('config', next);
    try { return await apply(); } catch (error) { settings.put('config', { ...next, mcp: false, api: false }); await apply(); return { ...state(), error: error.code === 'EADDRINUSE' ? 'port_in_use' : 'listen_failed' }; }
  }
  return { apply, set, state, addClient, rotateClient, listClients, removeClient, flush };
}

module.exports = { createHubServer, mcpMessage, readBody, DEFAULT_PORT, HOST };
