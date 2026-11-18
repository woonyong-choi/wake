/*
 * 클러스터 안 도구 연결(메인 프로세스). 화면의 연결 흐름(data/connect-flow.js)이 단계마다 부르는 동작:
 *   reach      포트 포워딩(또는 바깥 주소)으로 그 도구의 상태 주소에 닿는지
 *   session    그 도구 탭의 세션(도구마다 따로인 영구 세션)이 로그인돼 있는지, Wake 전용 읽기 계정의 토큰을 만들 수 있는지
 *   issue      그 세션으로 Wake 전용 읽기 계정(Grafana 서비스 계정 Viewer, Argo CD 계정 wake-reader)의 토큰을 만들어 키체인에 저장
 *   verify     저장한 토큰(없으면 세션)으로 읽기 요청이 통하는지
 *   setToken   직접 넣은 토큰을 키체인에 / forget 저장한 토큰을 지움(도구에서는 지우지 않음) / disconnect 도구에서 토큰을 지우고 키체인에서도 지움
 *   home       그 도구에서 열 첫 화면 주소(Grafana 대시보드, Prometheus 그래프, Argo CD 애플리케이션)
 * 승인된 operator bootstrap 자격은 main에서만 사용한다. 토큰 값은 키체인에만 두고 화면·로그·작업 기록에 내보내지 않는다.
 * 감사(audit, S-09): 도구에 보내는 쓰기 요청(GET 밖: 관리자 세션, Grafana 서비스 계정, 토큰 만들기·지우기)마다 행 하나(동작·메서드·경로·결과, 값 없음).
 */

const { TOOL_CONNECTION_TIMEOUT_MS, TOOL_REQUEST_TIMEOUT_MS } = require('../data/tool-connection-limits.js');
const os = require('node:os');
const { yaml } = require('./kubeconfig.cjs');

const READER = 'wake-reader';
const readSucceeded = (kind, response) => response.status === 200 && (!kind.validRead || kind.validRead(response.body));
const argoApplications = body => Array.isArray(body?.items) || (body?.items == null && !!body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata));
const argoName = value => typeof value === 'string' && /^[a-z0-9][a-z0-9.-]{0,252}$/.test(value);
function argoDiffFiles(body) {
  if (!Array.isArray(body?.items) || body.items.length > 200) throw new Error('invalid managed resources');
  const files = [], seen = new Set();
  let restricted = false;
  for (const item of body.items) {
    if (!argoName(item?.name) || !/^[A-Za-z][A-Za-z0-9]{0,80}$/.test(item.kind || '') ||
        (item.namespace && !argoName(item.namespace)) || (item.group && !argoName(item.group))) throw new Error('invalid resource identity');
    if (item.hook) continue;
    if (item.kind === 'Secret') { restricted ||= item.modified === true; continue; }
    const read = value => {
      if (value == null || value === '' || value === 'null') return null;
      if (typeof value !== 'string') throw new Error('invalid resource state');
      const resource = JSON.parse(value);
      if (resource?.kind !== item.kind || resource.metadata?.name !== item.name) throw new Error('invalid resource identity');
      delete resource.metadata.managedFields;
      delete resource.metadata.annotations?.['kubectl.kubernetes.io/last-applied-configuration'];
      return resource;
    };
    const current = read(item.liveState), target = read(item.targetState);
    if (!current && !target) continue;
    if (current && target && item.modified !== true) continue;
    const live = current ? yaml.dump(read(item.normalizedLiveState) || current, { sortKeys: true }) : '';
    const git = target ? yaml.dump(read(item.predictedLiveState) || target, { sortKeys: true }) : '';
    const file = [item.namespace, item.group, item.kind, item.name + '.yaml'].filter(Boolean).join('/');
    if (seen.has(file) || live.split('\n').length > 600 || git.split('\n').length > 600) throw new Error('unsupported managed resources');
    seen.add(file);
    if (live === git) continue;
    files.push({ file, name: item.name, kind: item.kind, ns: item.namespace || '', change: !current ? 'A' : !target ? 'D' : 'M', live, git });
  }
  return { state: files.length ? 'available' : restricted ? 'unsupported' : 'verified_empty', files };
}
function tokenLifetime(expiresAt) {
  if (expiresAt === undefined) return undefined;
  const seconds = Math.floor((expiresAt - Date.now()) / 1000) - 10;
  if (!Number.isFinite(seconds) || seconds < 1) throw Object.assign(new Error('token expiry unavailable'), { kind: 'expiry_unverified' });
  return seconds;
}
/* 도구 종류마다: 상태 주소, 로그인 확인, 토큰 만들기·지우기, 첫 화면 */
const KINDS = {
  grafana: {
    health: '/api/health', login: true,
    signedIn: async get => { const r = await get('/api/search?limit=1'); return r.status === 200 && Array.isArray(r.body); },
    canIssue: async get => (await get('/api/serviceaccounts/search?perpage=1')).status === 200,
    issue: async (send, label, expiresAt, recordPartial = () => {}) => {
      if (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt - Date.now() < 3000)) return { error: 'expiry_unverified' };
      const found = await send('GET', `/api/serviceaccounts/search?query=${READER}`);
      if (!found.ok || !Array.isArray(found.body?.serviceAccounts)) return { error: 'reader_lookup_failed' };
      if (expiresAt !== undefined && (!Number.isSafeInteger(found.body.totalCount) || found.body.totalCount !== found.body.serviceAccounts.length)) return { error: 'reader_lookup_incomplete' };
      const matches = found.body.serviceAccounts.filter(x => x.name === READER);
      if (matches.length > 1) return { error: 'reader_ambiguous' };
      let sa = matches[0];
      if (!sa) { const r = await send('POST', '/api/serviceaccounts', { name: READER, role: 'Viewer', isDisabled: false }); if (!r.ok) return { error: r.status }; sa = r.body; }
      if (expiresAt !== undefined && sa?.name !== READER) return { error: 'reader_identity_unverified', meta: { ...(Number.isSafeInteger(sa?.id) ? { sa: sa.id } : {}), incomplete: true } };
      if (!Number.isSafeInteger(sa?.id) || sa.id < 1 || sa.role !== 'Viewer' || sa.isDisabled === true) return { error: 'reader_role_unverified', ...(expiresAt !== undefined && Number.isSafeInteger(sa?.id) ? { meta: { sa: sa.id, incomplete: true } } : {}) };
      let t;
      try { t = await send('POST', `/api/serviceaccounts/${sa.id}/tokens`, () => {
        const secondsToLive = tokenLifetime(expiresAt);
        if (expiresAt !== undefined) recordPartial({ sa: sa.id, incomplete: true });
        return { name: `wake-${label}-${Date.now().toString(36)}`, ...(secondsToLive !== undefined ? { secondsToLive } : {}) };
      }); } catch (error) {
        if (error?.kind === 'expiry_unverified') return { error: 'expiry_unverified', meta: { sa: sa.id, incomplete: true } };
        throw error;
      }
      const meta = { sa: sa.id, ...(Number.isSafeInteger(t.body?.id) ? { id: t.body.id } : {}), incomplete: true };
      if (expiresAt !== undefined) recordPartial(meta);
      if (!t.ok || !t.body?.key) return { error: 'token_issue_failed', meta };
      let expiration;
      if (expiresAt !== undefined) {
        const list = await send('GET', `/api/serviceaccounts/${sa.id}/tokens`);
        const matches = Array.isArray(list.body) ? list.body.filter(token => token.id === t.body.id) : [];
        expiration = matches.length === 1 ? Date.parse(matches[0].expiration) : NaN;
        if (!list.ok || !Number.isFinite(expiration) || expiration <= Date.now() || expiration > expiresAt) return { error: 'expiry_unverified', meta };
      }
      return { token: t.body.key, meta: { sa: sa.id, id: t.body.id, ...(expiration ? { expiresAt: new Date(expiration).toISOString() } : {}) }, identity: READER, role: 'Viewer' };
    },
    revoke: (send, m) => send('DELETE', `/api/serviceaccounts/${m.sa}/tokens/${m.id}`),
    read: '/api/search?limit=1',
    validRead: Array.isArray,
    home: '/dashboards',
  },
  argocd: {
    health: '/healthz', login: true,
    /* 로그인 = 이 세션으로 Application을 읽을 수 있음(사용자 세션 쿠키, 또는 관리자가 익명 읽기를 연 서버) */
    signedIn: async get => { const r = await get('/api/v1/session/userinfo'); if (r.status === 200 && r.body?.loggedIn) return true; const list = await get('/api/v1/applications'); return list.status === 200 && argoApplications(list.body); },
    /* 읽기 전용 계정 wake-reader(apiKey 권한)를 관리자가 만들어 둔 경우에만 그 계정의 토큰을 만듦. 없으면 세션만으로 연결 */
    canIssue: async get => { const r = await get(`/api/v1/account/${READER}`); return r.status === 200 && (r.body?.capabilities || []).includes('apiKey'); },
    issue: async (send, label, expiresAt, recordPartial = () => {}) => {
      if (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt - Date.now() < 3000)) return { error: 'expiry_unverified' };
      const id = `wake-${label}-${Date.now().toString(36)}`;
      let r;
      try { r = await send('POST', `/api/v1/account/${READER}/token`, () => {
        const expiresIn = tokenLifetime(expiresAt);
        if (expiresAt !== undefined) recordPartial({ id, incomplete: true });
        return { id, name: id, ...(expiresIn !== undefined ? { expiresIn } : {}) };
      }); } catch (error) {
        if (error?.kind === 'expiry_unverified') return { error: 'expiry_unverified', meta: { id, incomplete: true } };
        throw error;
      }
      if (!r.ok || !r.body?.token) return { error: 'token_issue_failed', meta: { id, incomplete: true } };
      let expiration;
      if (expiresAt !== undefined) {
        const account = await send('GET', `/api/v1/account/${READER}`);
        const matches = Array.isArray(account.body?.tokens) ? account.body.tokens.filter(token => token.id === id) : [];
        expiration = matches.length === 1 && /^[1-9][0-9]{0,15}$/.test(String(matches[0].expiresAt)) ? Number(matches[0].expiresAt) * 1000 : NaN;
        if (!account.ok || !Number.isFinite(expiration) || expiration <= Date.now() || expiration > expiresAt) return { error: 'expiry_unverified', meta: { id, incomplete: true } };
      }
      return { token: r.body.token, meta: { id, ...(expiration ? { expiresAt: new Date(expiration).toISOString() } : {}) }, identity: READER, role: 'unverified' };
    },
    revoke: (send, m) => send('DELETE', `/api/v1/account/${READER}/token/${m.id}`),
    read: '/api/v1/applications',
    validRead: argoApplications,
    home: '/applications',
  },
  prometheus: { health: '/-/ready', read: '/api/v1/query?query=up', home: '/graph?g0.expr=up&g0.tab=0' },
  loki: { health: '/ready', read: '/loki/api/v1/labels?since=15m', validRead: body => body?.status === 'success' && (body.data === undefined || Array.isArray(body.data)) },
  tempo: { health: '/ready', read: '/api/search?limit=1', validRead: body => Array.isArray(body?.traces) },
  alertmanager: { health: '/-/ready', read: '/api/v2/status', home: '/' },
};

/* 도구 쓰기 요청 → 감사 동작 이름 */
function writeAction(method, route) {
  if (method === 'POST' && route === '/api/v1/session') return 'tool.adminSession.create';
  if (method === 'POST' && route === '/api/serviceaccounts') return 'tool.serviceAccount.create';
  if (method === 'POST' && /\/tokens?$/.test(route)) return 'tool.token.create';
  if (method === 'DELETE' && /\/tokens?\/[^/]+$/.test(route)) return 'tool.token.revoke';
  return 'tool.write';
}

function createToolConnect({ client, keychain, conns, saveConns, partition, toolAccess, fetchImpl = globalThis.fetch, bootstrap = null, operationTimeoutMs = TOOL_CONNECTION_TIMEOUT_MS, audit = () => {} }) {
  const keyOf = value => String(value).replace(/[^\w.-]+/g, '-');
  const jobs = new Map(), flows = new Map();
  const safeError = (state, code, stage) => ({ state, error: 'tool_connection_failed', ...(code ? { code } : {}), ...(stage ? { stage } : {}) });
  const issueCodes = new Set(['expiry_unverified', 'reader_lookup_failed', 'reader_lookup_incomplete', 'reader_ambiguous', 'reader_identity_unverified', 'reader_role_unverified', 'token_issue_failed', 'forbidden']);
  const check = scope => { scope?.signal?.throwIfAborted(); if (scope?.deadline <= Date.now()) throw Object.assign(new Error('tool deadline exceeded'), { kind: 'timeout' }); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function audience(binding) {
    const names = ['contextId', 'kind', 'namespace', 'serviceName', 'serviceUid', 'podUid'];
    if (!binding || !names.every(key => typeof binding[key] === 'string' && binding[key]) || !Number.isInteger(binding.port) || binding.port < 1 || binding.port > 65535) return null;
    return Object.fromEntries([...names.map(key => [key, binding[key]]), ['port', binding.port]]);
  }
  function credentialStoreFailure(error, ref) {
    if (error?.published !== true) {
      try { keychain.delete(ref); } catch { throw cleanupFailure(); }
    }
    throw Object.assign(new Error('credential store failed'), { kind: error?.kind === 'timeout' ? 'timeout'
        : error?.published === true ? 'credential_store_uncertain' : 'credential_store_failed' });
  }
  const cleanupFailure = () => Object.assign(new Error('tool credential cleanup failed'), { kind: 'credential_cleanup_failed' });
  function removeLocal(f, remoteRevoked = false, disconnect = false, scope) {
    check(scope);
    const id = keyOf(f.key), config = conns(), ref = config.toolTokens?.[id], meta = config.toolMeta?.[id];
    if (meta?.contextId && meta.contextId !== f.cluster || meta?.kind && meta.kind !== f.tool.kind) throw Object.assign(new Error('tool credential identity changed'), { kind: 'identity_changed' });
    if (meta?.incomplete === true && !remoteRevoked) throw cleanupFailure();
    if (meta && meta.origin !== null) {
      config.toolMeta[id] = { ...meta, origin: null };
      try { check(scope); saveConns(config); } catch { throw cleanupFailure(); }
    }
    try { if (ref) keychain.delete(ref); }
    catch { throw cleanupFailure(); }
    delete config.toolTokens?.[id]; delete config.toolMeta?.[id];
    try { check(scope); saveConns(config); } catch { throw cleanupFailure(); }
    return { ok: true, localDeleted: true, remoteRevoked, deleted: disconnect ? remoteRevoked : true };
  }

  async function request(fetcher, origin, method, route, body, headers = {}, scope = {}) {
    check(scope);
    const url = new URL(route, origin);
    if (url.origin !== origin || url.username || url.password || !['GET', 'POST', 'DELETE'].includes(method)) throw new Error('tool request rejected');
    const abort = new AbortController(), cancel = () => abort.abort(scope.signal.reason);
    scope.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => abort.abort(Object.assign(new Error('tool request timed out'), { kind: 'timeout' })),
      Math.min(TOOL_REQUEST_TIMEOUT_MS, Math.max(1, (scope.deadline ?? Infinity) - Date.now())));
    try {
      const response = await fetcher(url.href, { method, redirect: 'error', signal: abort.signal,
        credentials: 'include', headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(typeof body === 'function' ? body() : body) : undefined });
      if (response.status >= 300 && response.status < 400 || response.redirected || response.url && new URL(response.url).origin !== origin) throw new Error('tool redirect rejected');
      const reader = response.body?.getReader?.(); let json = null;
      if (reader) {
        const chunks = []; let length = 0;
        try { for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 1048576) { abort.abort(); throw new Error('tool response too large'); } chunks.push(value); } }
        finally { reader.releaseLock(); }
        const bytes = Buffer.concat(chunks); if (bytes.length) { try { json = JSON.parse(bytes.toString('utf8')); } catch { json = null; } }
      } else if (typeof response.json === 'function') { json = await response.json(); if (Buffer.byteLength(JSON.stringify(json)) > 1048576) throw new Error('tool response too large'); }
      check(scope);
      return { ok: response.status >= 200 && response.status < 300, status: response.status, body: json };
    } catch (error) {
      if (abort.signal.aborted && abort.signal.reason?.kind) throw abort.signal.reason;
      throw error;
    } finally { clearTimeout(timer); scope.signal?.removeEventListener('abort', cancel); }
  }
  /* GET 밖의 요청은 결과와 함께 감사 행 하나 */
  const audited = (f, call) => async (method, route, ...rest) => {
    if (method === 'GET') return call(method, route, ...rest);
    const where = new URL(route, 'http://tool.invalid').pathname;
    const record = result => { try { audit({ action: writeAction(method, where), transport: 'desktop', requester: { kind: 'human', name: os.userInfo().username },
      permission: 'admin', tool: f.tool?.kind, scope: f.cluster, target: `${method} ${where}`, result }); } catch { /* 감사 실패가 흐름을 바꾸지 않음 */ } };
    try { const r = await call(method, route, ...rest); record(r?.ok ? 'ok' : 'failed'); return r; } catch (error) { record('failed'); throw error; }
  };
  async function operation(op, f, extra, scope) {
    check(scope);
    const kind = KINDS[f.tool?.kind];
    if (!kind) return { state: 'unsupported' };
    const opened = await toolAccess.open(client(f.cluster), f.cluster, f.tool, scope), origin = new URL(opened.url).origin;
    check(scope);
    const id = keyOf(f.key), current = () => conns(), reference = () => current().toolTokens?.[id], metadata = () => current().toolMeta?.[id];
    const currentAudience = audience(opened.binding);
    const bound = meta => currentAudience !== null && meta?.contextId === f.cluster && meta.kind === f.tool.kind && same(audience(meta.binding), currentAudience);
    function transportOrigin(ref, value) {
      check(scope);
      const config = current(), meta = config.toolMeta?.[id];
      if (config.toolTokens?.[id] !== ref || !bound(meta)) throw new Error('tool credential changed');
      if (meta.origin !== value || !same(meta.binding, opened.binding)) {
        config.toolMeta[id] = { ...meta, origin: value, binding: structuredClone(opened.binding) }; check(scope); saveConns(config);
      }
    }
    const sessionFetch = (url, options) => partition(f.key).fetch(url, options);
    const send = audited(f, async (method, route, body) => { await opened.validate(); const result = await request(sessionFetch, origin, method, route, body, {}, scope); await opened.validate(); return result; });
    const byToken = async route => {
      const meta = metadata(), ref = reference();
      if (!bound(meta) || !ref) throw Object.assign(new Error('credential binding unverified'), { kind: 'identity_changed' });
      await opened.validate();
      if (meta.origin !== origin) transportOrigin(ref, null);
      const value = keychain.get(ref); if (!value) throw new Error('credential unavailable');
      const result = await request(fetchImpl, origin, 'GET', route, undefined, { authorization: `Bearer ${value}` }, scope);
      await opened.validate();
      transportOrigin(ref, readSucceeded(kind, result) ? origin : null);
      return result;
    };
    const get = route => reference() ? byToken(route) : send('GET', route);
    if (op === 'gitopsDiff') {
      const { name, namespace, uid, revision } = extra.application || {};
      if (f.tool.kind !== 'argocd' || !argoName(name) || !argoName(namespace) ||
          !/^[\da-f-]{36}$/i.test(uid || '') || typeof revision !== 'string' || !revision || revision.length > 256) return { state: 'unsupported' };
      const ref = reference();
      if (ref && !bound(metadata())) return { state: 'identity_changed' };
      const value = ref && keychain.get(ref);
      if (ref && !value) return { state: 'unauthorized' };
      const read = async route => {
        if (reference() !== ref) throw new Error('tool credential changed');
        if (!value) return send('GET', route);
        await opened.validate();
        const response = await request(fetchImpl, origin, 'GET', route, undefined, { authorization: `Bearer ${value}` }, scope);
        await opened.validate();
        return response;
      };
      const api = '/api/v1/applications/' + encodeURIComponent(name);
      const namespaceQuery = new URLSearchParams({ appNamespace: namespace });
      const applicationRoute = api + '?' + namespaceQuery;
      const matches = a => a?.metadata?.uid === uid && a.metadata.name === name && a.metadata.namespace === namespace
        && a.status?.sync?.revision === revision && !(a.spec?.sources?.length > 1);
      const readState = r => r.status === 401 ? 'unauthorized' : r.status === 403 ? 'forbidden' : r.status === 404 ? 'unsupported' : 'error';
      const before = await read(applicationRoute);
      if (!before.ok) return { state: readState(before) };
      if (!matches(before.body) || !before.body.metadata.resourceVersion || !argoName(before.body.spec?.project)) return { state: 'identity_changed' };
      const query = new URLSearchParams({ appNamespace: namespace, project: before.body.spec.project });
      const result = await read(api + '/managed-resources?' + query);
      if (!result.ok) return { state: readState(result) };
      const after = await read(applicationRoute);
      if (!after.ok) return { state: readState(after) };
      if (!matches(after.body) || after.body.metadata.resourceVersion !== before.body.metadata.resourceVersion || reference() !== ref) return { state: 'identity_changed' };
      return argoDiffFiles(result.body);
    }
    const withBootstrap = use => bootstrap.run(opened.binding, opened.validateTarget || opened.validate,
      audited(f, (method, route, body, headers) => request(fetchImpl, origin, method, route, body, headers, scope)), use, scope);
    if (op === 'reach') { const result = await request(fetchImpl, origin, 'GET', kind.health, undefined, {}, scope); await opened.validate(); return result.ok ? { ok: true, url: origin + '/' } : safeError('notReady', 'tool_http_' + result.status, 'reach'); }
    if (op === 'identity') return { identity: bound(metadata()) ? metadata().identity : undefined, role: bound(metadata()) ? metadata().role : undefined, token: bound(metadata()) && !!reference() };
    if (op === 'session') {
      if (!kind.login) return { signedIn: true, canIssue: false };
      if (extra.interactive !== true && bootstrap?.available(opened.binding)) return withBootstrap(async authenticated => ({
        signedIn: false, authentication: 'bootstrap', bootstrapAuthenticated: await kind.signedIn(route => authenticated('GET', route)),
        canIssue: await kind.canIssue(route => authenticated('GET', route)),
      }));
      const signedIn = await kind.signedIn(route => send('GET', route)).catch(() => false);
      return { signedIn, canIssue: extra.interactive !== true && signedIn && await kind.canIssue(route => send('GET', route)).catch(() => false) };
    }
    if (op === 'issue') {
      if (metadata()?.incomplete === true) return safeError('notReady', 'credential_partial_pending', 'issue');
      if (!kind.issue) return { state: 'unsupported' };
      const bootstrapExpiry = bootstrap?.available(opened.binding) ? bootstrap.expiresAt(opened.binding) : undefined;
      if (reference()) {
        if (bootstrapExpiry !== undefined && (!Number.isFinite(Date.parse(metadata()?.expiresAt)) || Date.parse(metadata().expiresAt) > bootstrapExpiry || Date.parse(metadata().expiresAt) <= Date.now())) removeLocal(f, false, false, scope);
      }
      if (reference()) {
        if (!bound(metadata())) removeLocal(f, false, false, scope);
        else {
          const result = await byToken(kind.read);
          if (readSucceeded(kind, result)) return { ok: true, reused: true, readVerified: true, identity: metadata().identity, role: metadata().role };
          if (![401, 403].includes(result.status)) return safeError('notReady');
          removeLocal(f, false, false, scope);
        }
      }
      const issue = async authenticated => {
        if (!await kind.signedIn(route => authenticated('GET', route)) || !await kind.canIssue(route => authenticated('GET', route))) return { error: 'forbidden' };
        return kind.issue(authenticated, 'reader', bootstrapExpiry, meta => {
          check(scope);
          const config = current();
          config.toolMeta = { ...config.toolMeta, [id]: { ...meta, kind: f.tool.kind, contextId: f.cluster, binding: opened.binding, origin: null } };
          check(scope); saveConns(config);
        });
      };
      const result = bootstrap?.available(opened.binding) ? await withBootstrap(issue) : await issue(send);
      const preservePartial = () => {
        check(scope);
        if (result?.meta?.incomplete) {
          const config = current();
          config.toolMeta = { ...config.toolMeta, [id]: { ...result.meta, kind: f.tool.kind, contextId: f.cluster, binding: opened.binding, origin: null } };
          check(scope); saveConns(config);
        }
      };
      if (result?.error) { check(scope); preservePartial(); return safeError('notReady', issueCodes.has(result.error) ? result.error : 'token_issue_failed', 'issue'); }
      if (typeof result?.token !== 'string' || !result.token || result.token.length > 16384 || /[\x00-\x20\x7f]/.test(result.token)) return safeError('forbidden');
      await opened.validate();
      if (bootstrapExpiry !== undefined) {
        const read = await request(fetchImpl, origin, 'GET', kind.read, undefined, { authorization: `Bearer ${result.token}` }, scope);
        await opened.validate();
        if (!readSucceeded(kind, read)) { result.meta = { ...result.meta, incomplete: true }; preservePartial(); return safeError('notReady'); }
      }
      check(scope);
      const config = current(), old = config.toolTokens?.[id];
      if (old) throw new Error('credential changed during issue');
      let ref;
      try { ref = keychain.set(result.token, 'tool-token'); }
      catch { if (bootstrapExpiry !== undefined) { result.meta = { ...result.meta, incomplete: true }; preservePartial(); } throw new Error('credential store failed'); }
      try {
        config.toolTokens = { ...config.toolTokens, [id]: ref };
        config.toolMeta = { ...config.toolMeta, [id]: { ...result.meta, identity: result.identity, role: result.role, kind: f.tool.kind, contextId: f.cluster, origin, binding: opened.binding } };
        check(scope); saveConns(config);
      } catch (error) { credentialStoreFailure(error, ref); }
      return { ok: true, identity: result.identity, role: result.role, ...(bootstrapExpiry !== undefined ? { readVerified: true } : {}) };
    }
    if (op === 'verify') {
      const useToken = kind.login && extra.sessionOnly !== true && !!reference();
      const result = useToken ? await byToken(kind.read) : await send('GET', kind.read);
      if (readSucceeded(kind, result)) return { ok: true, via: kind.login ? (useToken ? 'token' : 'session') : 'read' };
      if (result.status === 401) return safeError('unauthorized', 'tool_unauthorized', op);
      if (result.status === 403) return safeError('forbidden', 'tool_forbidden', op);
      return safeError('notReady', 'tool_read_failed', op);
    }
    if (op === 'home') {
      if (!kind.home) return { error: 'tool_home_unavailable' };
      if (kind.login && reference()) {
        const read = await byToken(kind.read);
        if (read.status === 401) return safeError('unauthorized', 'tool_unauthorized', 'home');
        if (read.status === 403) return safeError('forbidden', 'tool_forbidden', 'home');
        if (!readSucceeded(kind, read)) return safeError('notReady', 'tool_read_failed', 'home');
      }
      const url = new URL(kind.home, origin);
      if (url.origin !== origin || url.username || url.password) throw new Error('tool home rejected');
      return { url: url.href };
    }
    if (op === 'setToken') {
      if (!kind.login) return safeError('unconfigured');
      if (metadata()?.incomplete === true) return safeError('notReady', 'credential_partial_pending', 'input');
      if (typeof extra?.token !== 'string' || !extra.token || extra.token.length > 16384 || /[\x00-\x20\x7f]/.test(extra.token)) return safeError('unauthorized', 'tool_invalid_token', 'input');
      const result = await request(fetchImpl, origin, 'GET', kind.read, undefined, { authorization: `Bearer ${extra.token}` }, scope);
      if (result.status === 401) return safeError('unauthorized', 'tool_unauthorized', 'input');
      if (result.status === 403) return safeError('forbidden', 'tool_forbidden', 'input');
      if (!readSucceeded(kind, result)) return safeError('notReady', 'tool_read_failed', 'input');
      await opened.validate();
      check(scope);
      const config = current(), old = config.toolTokens?.[id], ref = keychain.set(extra.token, 'tool-token');
      if (old && !bound(metadata())) { keychain.delete(ref); return safeError('identity_changed'); }
      config.toolTokens = { ...config.toolTokens, [id]: ref }; config.toolMeta = { ...config.toolMeta, [id]: { kind: f.tool.kind, contextId: f.cluster, origin, binding: opened.binding } };
      try { check(scope); saveConns(config); } catch (error) { credentialStoreFailure(error, ref); }
      if (old) keychain.delete(old); return { ok: true, readVerified: true };
    }
    if (op === 'revoke') {
      const meta = metadata();
      if ((!reference() && meta?.incomplete !== true) || !bound(meta) || !kind.revoke || !meta?.id) return { remoteRevoked: false };
      if (f.tool.kind === 'grafana' && (!Number.isSafeInteger(meta.sa) || meta.sa < 1 || !Number.isSafeInteger(meta.id) || meta.id < 1)) return { remoteRevoked: false };
      if (meta.incomplete === true && !bootstrap?.available(opened.binding)) return { remoteRevoked: false };
      const result = meta.incomplete ? await withBootstrap(async authenticated => {
        if (f.tool.kind === 'grafana') {
          const account = await authenticated('GET', `/api/serviceaccounts/${meta.sa}`);
          if (!account.ok || account.body?.id !== meta.sa || account.body.name !== READER || account.body.role !== 'Viewer' || account.body.isDisabled === true) return { ok: false };
          const tokens = await authenticated('GET', `/api/serviceaccounts/${meta.sa}/tokens`);
          if (!tokens.ok || !Array.isArray(tokens.body) || tokens.body.some(token => !Number.isSafeInteger(token.id) || token.id < 1)
            || tokens.body.filter(token => token.id === meta.id).length > 1) return { ok: false };
        }
        return kind.revoke(authenticated, meta);
      }) : await kind.revoke(send, meta);
      return { remoteRevoked: result.ok || result.status === 404 };
    }
    return { state: 'unsupported' };
  }

  const names = ['reach', 'session', 'issue', 'verify', 'setToken', 'forget', 'disconnect', 'home', 'identity', 'cancel', 'gitopsDiff'];
  return Object.fromEntries(names.map(op => [op, async (f, extra = {}) => {
    if (!f || typeof f.cluster !== 'string' || !f.cluster || !f.tool || !KINDS[f.tool.kind]) return safeError('unconfigured');
    if (op === 'cancel') {
      if (f.key !== f.cluster + '-' + f.tool.kind) return safeError('unconfigured');
      const jobKey = 'credential:' + keyOf(f.key);
      const flow = flows.get(jobKey); if (flow) clearTimeout(flow.timer); flows.delete(jobKey);
      jobs.get(jobKey)?.controller.abort(Object.assign(new Error('tool operation cancelled'), { kind: 'cancelled' }));
      return safeError('cancelled', 'tool_cancelled', 'operation');
    }
    if (f.key !== f.cluster + '-' + f.tool.kind) return safeError('unconfigured');
    const canRebind = (['home', 'setToken', 'gitopsDiff'].includes(op) || op === 'verify' && extra.restore === true) && typeof f.tool.bindingId === 'string' && typeof toolAccess?.rebind === 'function';
    const jobKey = 'credential:' + keyOf(f.cluster + '-' + f.tool.kind);
    const previous = jobs.get(jobKey);
    if (['home', 'gitopsDiff'].includes(op) && previous && ['verify', 'identity', 'reach', 'session', 'home', 'gitopsDiff'].includes(previous.op)) await previous.settled;
    if (jobs.has(jobKey)) return safeError('busy', 'tool_busy', 'operation');
    let flow;
    if (extra.flowStart === true) {
      if (flows.size >= 128 && !flows.has(jobKey)) return safeError('busy', 'tool_busy', 'operation');
      const old = flows.get(jobKey); if (old) clearTimeout(old.timer);
      flow = { id: require('node:crypto').randomUUID(), deadline: Date.now() + operationTimeoutMs };
      flow.timer = setTimeout(() => {
        if (flows.get(jobKey) !== flow) return;
        if (jobs.get(jobKey)?.flowId === flow.id) jobs.get(jobKey).controller.abort(Object.assign(new Error('tool deadline exceeded'), { kind: 'timeout' }));
        flows.delete(jobKey);
      }, operationTimeoutMs);
      flow.timer.unref?.(); flows.set(jobKey, flow);
    } else if (extra.flowId !== undefined) {
      flow = flows.get(jobKey);
      if (!flow || flow.id !== extra.flowId || flow.deadline <= Date.now()) return safeError('timeout', 'tool_deadline', 'operation');
    }
    const controller = new AbortController(), scope = { signal: controller.signal, deadline: flow?.deadline ?? Date.now() + operationTimeoutMs, requestTimeoutMs: TOOL_REQUEST_TIMEOUT_MS };
    const flowFields = flow ? { flowId: flow.id, flowExpiresAt: flow.deadline } : {};
    const job = { controller, flowId: flow?.id, op }; jobs.set(jobKey, job);
    const timer = setTimeout(() => controller.abort(Object.assign(new Error('tool deadline exceeded'), { kind: 'timeout' })), Math.max(1, scope.deadline - Date.now()));
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const work = Promise.resolve().then(async () => {
      check(scope);
      if (canRebind && !toolAccess.isBound?.(f.cluster, f.tool)) {
        const entries = bootstrap?.discoveryEntries?.(f.cluster) || [];
        const tool = await toolAccess.rebind(client(f.cluster), f.cluster, f.tool, entries, scope);
        check(scope);
        const result = await operation(op, { ...f, tool }, extra, scope);
        return result.ok ? { ...result, discovery: tool } : result;
      }
      if (['forget', 'disconnect'].includes(op)) {
        let revoked = false;
        if (op === 'disconnect') {
          try { revoked = (await operation('revoke', f, extra, scope)).remoteRevoked === true; } catch { check(scope); }
        }
        return removeLocal(f, revoked, op === 'disconnect', scope);
      }
      const result = await operation(op, f, extra, scope);
      check(scope);
      return result;
    }).finally(() => {
      if (jobs.get(jobKey) === job) jobs.delete(jobKey);
    });
    const outcome = Promise.race([work, aborted]);
    job.settled = outcome.then(() => {}, () => {});
    try { return { ...await outcome, ...flowFields }; }
    catch (error) {
      const state = controller.signal.aborted ? controller.signal.reason?.kind || 'cancelled'
        : error?.kind === 'timeout' ? 'timeout'
        : error?.published === true || error?.kind === 'credential_store_uncertain' ? 'credential_store_uncertain'
        : error?.status === 401 ? 'unauthorized' : error?.status === 403 ? 'forbidden'
        : ['credential_cleanup_failed', 'identity_changed', 'identity_unverified', 'unconfigured'].includes(error?.kind) ? error.kind : 'notReady';
      if (op === 'home' && state !== 'timeout') throw new Error('tool unavailable');
      return { ...flowFields, ...safeError(state, state === 'timeout' ? 'tool_deadline' : state === 'cancelled' ? 'tool_cancelled' : state === 'credential_store_uncertain' ? 'credential_store_uncertain' : error?.kind === 'bootstrap_unverified' ? 'bootstrap_unverified' : 'tool_failed', op),
        ...(op === 'session' && toolAccess?.isFixed?.(f.cluster, f.tool) === true ? { authentication: 'bootstrap', bootstrapAuthenticated: false } : {}) };
    } finally { scope.finished = true; clearTimeout(timer); controller.signal.removeEventListener('abort', onAbort); }
  }]));
}
module.exports = { createToolConnect, KINDS };
