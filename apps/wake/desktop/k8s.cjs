/*
 * 쿠버네티스 API 통로(사용자 kubeconfig 권한 그대로). kubectl과 같은 방식으로 인증한다:
 * token / tokenFile / client 인증서 / basic / exec 플러그인(ExecCredential) / oidc auth-provider의 id-token.
 * Wake가 저장한 비밀 값은 tokenRef·clientKeyRef(키체인 참조)로만 들어 있고, 쓸 때 키체인에서 꺼낸다.
 */
const { TOOL_REQUEST_TIMEOUT_MS } = require('../data/tool-connection-limits.js');
const fs = require('node:fs');
const https = require('node:https');
const http = require('node:http');
const net = require('node:net');
const tls = require('node:tls');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');

const b64 = s => Buffer.from(String(s), 'base64');
const readMaybe = (data, file) => data ? b64(data) : file ? fs.readFileSync(file) : undefined;

/* exec 명령이 있는지: 절대 경로면 그 파일, 아니면 PATH에서 찾음 */
function findCommand(cmd, env = process.env) {
  if (!cmd) return null;
  const exts = process.platform === 'win32' ? (env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  const ok = p => { try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; } };
  if (path.isAbsolute(cmd)) return ok(cmd) ? cmd : null;
  for (const dir of (env.PATH || '').split(path.delimiter)) for (const e of exts) { const p = path.join(dir, cmd + e); if (ok(p)) return p; }
  return null;
}
/* macOS 앱은 로그인 셸의 PATH를 받지 못하므로, 흔한 설치 위치를 더한다(gcloud, aws, kubelogin, npm·Volta로 설치한 AI CLI) */
function execPath(env = process.env) {
  const home = require('node:os').homedir();
  const more = ['/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.local/bin'), path.join(home, '.volta/bin'), path.join(home, 'google-cloud-sdk/bin'), '/usr/local/google-cloud-sdk/bin'];
  return [...new Set([...(env.PATH || '').split(path.delimiter), ...more])].filter(Boolean).join(path.delimiter);
}

class K8sError extends Error {
  constructor(kind, message, extra = {}) { super(message); this.kind = kind; Object.assign(this, extra); }
}

/* status: 오류 응답 본문의 Kubernetes Status(있으면 message·reason을 남김: 권한 줄이 거부된 동사·리소스를 읽는다) */
function httpError(status, body) {
  const kind = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'unknown';
  const message = typeof body?.message === 'string' ? body.message.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 1000) : '';
  return new K8sError(kind, `kubernetes API request failed (HTTP ${status})${message ? ': ' + message : ''}`,
    { status, code: 'K8S_HTTP_ERROR', ...(typeof body?.reason === 'string' ? { reason: body.reason.slice(0, 100) } : {}) });
}
/* 오류 응답 본문(64KB까지)을 Status로 읽는다 */
function readError(res, reject) {
  const chunks = []; let bytes = 0;
  res.on('data', chunk => { bytes += chunk.length; if (bytes <= 65536) chunks.push(chunk); });
  res.on('error', () => reject(httpError(res.statusCode)));
  res.on('end', () => { let body = null; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* Status가 아닌 본문 */ } reject(httpError(res.statusCode, body)); });
}
/* 응답 크기 기본 상한(목록 하나): 넘으면 response_too_large */
const MAX_RESPONSE_BYTES = 64 * 1048576;
/* 같은 서버·같은 TLS 자격의 연결은 다시 쓴다(keep-alive). 토큰은 요청 머리라 연결을 같이 써도 섞이지 않는다. 열쇠는 자격의 해시, 최대 32개 */
const agents = new Map();
function agentFor(mod, parts) {
  const key = createHash('sha256').update(JSON.stringify(parts.map(v => (Buffer.isBuffer(v) ? v.toString('base64') : v ?? null)))).digest('hex');
  let agent = agents.get(key);
  if (!agent) {
    if (agents.size >= 32) { const [first, old] = agents.entries().next().value; agents.delete(first); old.destroy(); }
    agent = new mod.Agent({ keepAlive: true, keepAliveMsecs: 15000, maxFreeSockets: 6, timeout: 60000, scheduling: 'lifo' });
    agents.set(key, agent);
  }
  return agent;
}

const MAX_EXEC_CREDENTIALS = 64;
const credCache = new Map(), credRuns = new Map();
/* exec 인증 도구에 넘기는 환경: 앱 환경 전체가 아니라 셸·로캘·kubeconfig·클라우드 CLI가 쓰는 것만(그 밖의 비밀 환경 값은 넘기지 않음) + kubeconfig의 exec.env */
const EXEC_ENV = /^(?:PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|LANG|LC_[A-Z_]+|KUBECONFIG|AWS_[A-Z0-9_]+|AZURE_[A-Z0-9_]+|GOOGLE_[A-Z0-9_]+|CLOUDSDK_[A-Z0-9_]+)$/;
/** exec 명령 하나의 동의 열쇠: 찾은 명령의 실제 경로와 인자(다른 인자는 다른 명령) */
const execConsentKey = (cmd, args = []) => createHash('sha256').update(JSON.stringify(['exec-consent-v1', cmd, args])).digest('hex');
function execInvocation(exec, env) {
  const e = Object.create(null);
  for (const [name, value] of Object.entries(env || {})) if (EXEC_ENV.test(name) && typeof value === 'string') e[name] = value;
  e.PATH = execPath(env);
  for (const x of exec.env || []) if (x?.name) e[x.name] = String(x.value ?? '');
  const cmd = findCommand(exec.command, e);
  if (!cmd) throw new K8sError('noAuthTool', `${exec.command}: command not found`, { command: exec.command, installHint: exec.installHint || '' });
  e.KUBERNETES_EXEC_INFO = JSON.stringify({ apiVersion: exec.apiVersion || 'client.authentication.k8s.io/v1beta1', kind: 'ExecCredential', spec: { interactive: false } });
  return { cmd, args: exec.args || [], env: e };
}
/* 처음 쓰는 exec 명령은 사람이 그 명령·인자를 보고 동의해야 실행한다(consent.granted(열쇠)가 거짓이면 실행하지 않고 needs_consent) */
function requireConsent(invocation, consent) {
  if (!consent || consent.granted(execConsentKey(invocation.cmd, invocation.args))) return;
  throw new K8sError('needs_consent', `${invocation.cmd}: running this authentication command needs your consent`,
    { code: 'EXEC_CONSENT_REQUIRED', command: invocation.cmd, args: [...invocation.args] });
}

function runExec(exec, env, audience, consent) {
  const invocation = execInvocation(exec, env);
  requireConsent(invocation, consent);
  const { cmd, args } = invocation;
  const file = fs.statSync(cmd);
  const key = createHash('sha256').update(JSON.stringify([
    audience, cmd, file.dev, file.ino, file.mtimeMs, file.ctimeMs, args,
    Object.keys(invocation.env).sort().map(name => [name, invocation.env[name]]),
  ])).digest('hex');
  const hit = credCache.get(key);
  if (hit && hit.until > Date.now() + 30000) return Promise.resolve(hit.cred);
  credCache.delete(key);
  /* 같은 열쇠의 갱신이 진행 중이면 그 실행 하나를 같이 기다린다(동시 요청마다 인증 도구를 다시 띄우지 않음) */
  const running = credRuns.get(key);
  if (running) return running;
  const run = new Promise((resolve, reject) => {
    execFile(cmd, args, { env: invocation.env, timeout: 60000, maxBuffer: 1 << 20 }, (err, stdout) => {
      if (err?.killed) return reject(new K8sError('timeout', `${exec.command}: no answer in 60s`, { step: 'exec' })); // 인증 도구가 끝나지 않음: 시간 초과
      if (err) return reject(new K8sError('unauthorized', `${exec.command}: authentication failed`, { step: 'exec' }));
      try {
        const st = JSON.parse(stdout).status || {};
        const cred = { token: st.token, cert: st.clientCertificateData, key: st.clientKeyData };
        if (credCache.size >= MAX_EXEC_CREDENTIALS) credCache.delete(credCache.keys().next().value);
        credCache.set(key, { cred, until: st.expirationTimestamp ? Date.parse(st.expirationTimestamp) : Date.now() + 5 * 60000 });
        resolve(cred);
      } catch { reject(new K8sError('unknown', 'invalid exec credential', { step: 'exec' })); }
    });
  });
  credRuns.set(key, run);
  const clear = () => { if (credRuns.get(key) === run) credRuns.delete(key); };
  run.then(clear, clear);
  return run;
}

/** context 하나의 요청 함수와 연결 정보. execConsent { granted(열쇠) }: 있으면 동의한 exec 명령만 실행 */
function createClient(kc, ctxName, { keychain, env = process.env, credentialScope = 'observer', execConsent = null, maxResponseBytes = MAX_RESPONSE_BYTES } = {}) {
  const ctx = kc.contexts.get(ctxName);
  if (!ctx) throw new K8sError('config', `context "${ctxName}" not found`);
  const cl = kc.clusters.get(ctx.cluster), user = kc.users.get(ctx.user) || {};
  if (!cl) throw new K8sError('config', `cluster "${ctx.cluster}" not found`);
  if (!cl.server) throw new K8sError('config', `cluster "${ctx.cluster}" has no server`);
  let url;
  try { url = new URL(cl.server); } catch { throw new K8sError('config', `invalid server address: ${cl.server}`); }
  const secret = ref => keychain?.get(ref);
  const execAudience = [credentialScope, ctxName, ctx.file, ctx.cluster, cl.file, url.href, ctx.user, user.file];
  function checkExec() { if (user.exec) requireConsent(execInvocation(user.exec, env), execConsent); }

  async function credentials() {
    if (user.exec) return runExec(user.exec, env, execAudience, execConsent);
    if (user['auth-provider']) {
      const ap = user['auth-provider'];
      if (ap.config?.['id-token']) return { token: ap.config['id-token'] };
      throw new K8sError('noAuthTool', `auth-provider "${ap.name}" is no longer supported by kubectl; use its exec plugin`, { command: ap.name });
    }
    return {
      token: user.tokenRef ? await secret(user.tokenRef) : user.token || (user.tokenFile ? fs.readFileSync(user.tokenFile, 'utf8').trim() : undefined),
      cert: user['client-certificate-data'] || (user['client-certificate'] ? fs.readFileSync(user['client-certificate']).toString('base64') : undefined),
      key: user.clientKeyRef ? await secret(user.clientKeyRef) : user['client-key-data'] || (user['client-key'] ? fs.readFileSync(user['client-key']).toString('base64') : undefined),
      basic: user.username ? `${user.username}:${user.passwordRef ? await secret(user.passwordRef) : user.password || ''}` : undefined,
    };
  }
  const tlsOpts = () => ({
    ca: readMaybe(cl['certificate-authority-data'], cl['certificate-authority']),
    rejectUnauthorized: !cl['insecure-skip-tls-verify'],
    servername: cl['tls-server-name'] || (net.isIP(url.hostname) ? undefined : url.hostname),
  });
  const port = +url.port || (url.protocol === 'https:' ? 443 : 80);

  /* 1단계 닿기: TCP 연결만 */
  const reach = (timeout = 5000) => new Promise((resolve, reject) => {
    const s = net.connect({ host: url.hostname, port, timeout });
    s.once('connect', () => { s.destroy(); resolve(); });
    s.once('timeout', () => { s.destroy(); reject(new K8sError('unreachable', `connect ${url.host}: timed out`)); });
    s.once('error', e => reject(new K8sError('unreachable', `connect ${url.host}: ${e.code || e.message}`)));
  });
  /* 2단계 인증서: TLS 악수만(서버 인증서를 CA로 확인) */
  const handshake = (timeout = 8000) => url.protocol !== 'https:' ? Promise.resolve() : new Promise((resolve, reject) => {
    const s = tls.connect({ host: url.hostname, port, ...tlsOpts(), timeout });
    s.once('secureConnect', () => { s.destroy(); resolve(); });
    s.once('timeout', () => { s.destroy(); reject(new K8sError('unreachable', `TLS ${url.host}: timed out`)); });
    s.once('error', e => reject(/CERT|SELF_SIGNED|UNABLE_TO|ALTNAME|certificate/i.test(e.code + e.message) ? new K8sError('cert', `${e.code || ''} ${e.message}`.trim()) : new K8sError('unreachable', `TLS ${url.host}: ${e.code || e.message}`)));
  });

  /* metadataList: 목록의 메타데이터만(PartialObjectMetadataList) 받는다. 본문(Secret 값 등)은 API 서버가 보내지 않는다 */
  async function request(method, p, body, { timeout = 15000, raw = false, signal, maxBytes = maxResponseBytes, metadataList = false } = {}) {
    signal?.throwIfAborted();
    const c = await credentials();
    signal?.throwIfAborted();
    const headers = { accept: metadataList ? 'application/json;as=PartialObjectMetadataList;g=meta.k8s.io;v=v1' : 'application/json', 'user-agent': 'wake-desktop' };
    if (c.token) headers.authorization = `Bearer ${c.token}`;
    else if (c.basic) headers.authorization = `Basic ${Buffer.from(c.basic).toString('base64')}`;
    const data = body ? JSON.stringify(body) : null;
    if (data) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(data); }
    const base = url.pathname.replace(/\/$/, '');
    return new Promise((resolve, reject) => {
      const mod = url.protocol === 'https:' ? https : http, tlsOptions = tlsOpts();
      const cert = c.cert ? b64(c.cert) : undefined, key = c.key ? b64(c.key) : undefined;
      const agent = agentFor(mod, [url.protocol, url.hostname, port, tlsOptions.ca, tlsOptions.rejectUnauthorized, tlsOptions.servername, cert, key]);
      /* 전체 기한(timeout의 3배): timeout은 소켓이 조용한 시간만 재므로, 조금씩 끝없이 오는 응답도 끊는다 */
      let deadline;
      const settle = f => value => { clearTimeout(deadline); f(value); };
      resolve = settle(resolve); reject = settle(reject);
      const req = mod.request({ host: url.hostname, port, method, path: base + p, headers, timeout, signal, ...tlsOptions, cert, key, agent }, res => {
        if (res.statusCode >= 400) return readError(res, reject);
        const chunks = []; let bytes = 0;
        res.on('error', reject);
        res.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            const error = new K8sError('response_too_large', 'kubernetes response exceeded its byte limit');
            reject(error);
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (raw) return resolve(text);
          try { resolve(JSON.parse(text)); } catch { resolve(text); }
        });
      });
      deadline = setTimeout(() => req.destroy(new K8sError('timeout', `${method} ${p}: no complete answer in ${timeout * 3}ms`)), timeout * 3);
      deadline.unref?.();
      req.on('timeout', () => req.destroy(new K8sError('unreachable', `${method} ${p}: timed out`)));
      req.on('error', e => reject(e instanceof K8sError ? e : /CERT|SELF_SIGNED|UNABLE_TO|ALTNAME/i.test(String(e.code)) ? new K8sError('cert', `${e.code} ${e.message}`) : new K8sError('unreachable', `${e.code || e.message}`)));
      if (data) req.write(data);
      req.end();
    });
  }
  /* watch 스트림(kube-watch.cjs): 한 줄에 사건 하나({ type, object }). 오래 열린 연결이라 keep-alive 묶음을 쓰지 않는다.
     onEvent가 던지면(ERROR 사건 등) 스트림을 닫고 그 오류로 끝난다. 신호로 멈추면 조용히 끝난다. idle: 사건·북마크 없이 이만큼 조용하면 끊김 */
  async function watch(p, { signal, onEvent, idle = 300_000, maxLine = 16 * 1048576 } = {}) {
    if (signal?.aborted) return;
    const c = await credentials();
    if (signal?.aborted) return;
    const headers = { accept: 'application/json', 'user-agent': 'wake-desktop' };
    if (c.token) headers.authorization = `Bearer ${c.token}`;
    else if (c.basic) headers.authorization = `Basic ${Buffer.from(c.basic).toString('base64')}`;
    return new Promise((resolve, reject) => {
      const mod = url.protocol === 'https:' ? https : http;
      let done = false, rest = '';
      const finish = (error) => { if (done) return; done = true; signal?.removeEventListener('abort', abort); req.destroy(); error ? reject(error) : resolve(); };
      const abort = () => finish();
      const req = mod.request({ host: url.hostname, port, method: 'GET', path: url.pathname.replace(/\/$/, '') + p, headers, timeout: idle, ...tlsOpts(),
        cert: c.cert ? b64(c.cert) : undefined, key: c.key ? b64(c.key) : undefined, agent: false }, res => {
        if (res.statusCode >= 400) return readError(res, error => finish(error));
        res.setEncoding('utf8');
        res.on('data', chunk => {
          if (done) return;
          rest += chunk;
          if (rest.length > maxLine) return finish(new K8sError('response_too_large', 'kubernetes watch event exceeded its byte limit'));
          let at;
          while (!done && (at = rest.indexOf('\n')) >= 0) {
            const line = rest.slice(0, at); rest = rest.slice(at + 1);
            if (!line.trim()) continue;
            let event;
            try { event = JSON.parse(line); } catch { return finish(new K8sError('invalid_response', 'kubernetes watch sent an invalid event')); }
            try { onEvent(event); } catch (error) { return finish(error); }
          }
        });
        res.on('end', () => finish());
        res.on('error', e => finish(new K8sError('unreachable', `${e.code || e.message}`)));
      });
      signal?.addEventListener('abort', abort, { once: true });
      req.on('timeout', () => finish(new K8sError('unreachable', `watch ${p}: no event in ${idle}ms`)));
      req.on('error', e => finish(e instanceof K8sError ? e : new K8sError('unreachable', `${e.code || e.message}`)));
      req.end();
    });
  }
  async function getMetadata(input, { signal, timeout = 15000 } = {}) {
    signal?.throwIfAborted();
    const invalid = (kind = 'metadata_unavailable', status) => Object.assign(new K8sError(kind, 'resource metadata unavailable'),
      { code: 'K8S_METADATA_UNAVAILABLE', ...(Number.isInteger(status) ? { status } : {}) });
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
    const dnsLabel = value => typeof value === 'string' && value.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
    const dnsName = value => typeof value === 'string' && value.length <= 253 && value.split('.').every(dnsLabel);
    const revision = value => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);
    const registry = {
      Pod: ['v1', 'pods', true], Namespace: ['v1', 'namespaces', false],
      Deployment: ['apps/v1', 'deployments', true], StatefulSet: ['apps/v1', 'statefulsets', true], ReplicaSet: ['apps/v1', 'replicasets', true],
    };
    if (!record(input) || Reflect.ownKeys(input).some(key => !['kind', 'namespace', 'name', 'uid'].includes(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), 'value')) || !Object.hasOwn(registry, input.kind)
      || !dnsName(input.name) || !uuid(input.uid)) throw invalid('invalid_request');
    const [api, resource, namespaced] = registry[input.kind];
    if (namespaced ? !dnsLabel(input.namespace) : Object.hasOwn(input, 'namespace')) throw invalid('invalid_request');
    const requestPath = (api === 'v1' ? '/api/v1' : '/apis/' + api) + (namespaced ? '/namespaces/' + input.namespace : '') + '/' + resource + '/' + input.name;
    let c;
    try { c = await credentials(); } catch { throw invalid('metadata_credential_failed'); }
    const headers = { accept: 'application/json;as=PartialObjectMetadata;g=meta.k8s.io;v=v1', 'user-agent': 'wake-desktop' };
    if (c.token) headers.authorization = `Bearer ${c.token}`;
    else if (c.basic) headers.authorization = `Basic ${Buffer.from(c.basic).toString('base64')}`;
    return new Promise((resolve, reject) => {
      let settled = false, response, req, deadline, chunks = [], bytes = 0;
      const onAbort = () => fail('metadata_cancelled');
      const cleanup = () => { clearTimeout(deadline); signal?.removeEventListener('abort', onAbort); };
      const fail = (kind, status) => {
        if (settled) return;
        settled = true; cleanup(); chunks = [];
        reject(invalid(kind, status)); response?.destroy?.(); req?.destroy?.();
      };
      deadline = setTimeout(() => fail('metadata_timeout'), Math.min(TOOL_REQUEST_TIMEOUT_MS, timeout)); deadline.unref?.();
      if (signal?.aborted) { fail('metadata_cancelled'); return; }
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const mod = url.protocol === 'https:' ? https : http;
        req = mod.request({ host: url.hostname, port, method: 'GET', path: url.pathname.replace(/\/$/, '') + requestPath,
          headers, timeout: Math.min(TOOL_REQUEST_TIMEOUT_MS, timeout), ...tlsOpts(), cert: c.cert ? b64(c.cert) : undefined, key: c.key ? b64(c.key) : undefined, agent: false }, res => {
          response = res;
          if (res.statusCode !== 200) { fail('metadata_unavailable', res.statusCode); return; }
          if (String(res.headers?.['content-type'] || '').split(';')[0].trim() !== 'application/json') { fail('invalid_metadata'); return; }
          res.on('data', chunk => {
            if (settled) return;
            bytes += chunk.length;
            if (bytes > 32768) { fail('metadata_too_large'); return; }
            chunks.push(chunk);
          });
          res.on('error', () => fail('metadata_unavailable'));
          res.on('aborted', () => fail('metadata_unavailable'));
          res.on('end', () => {
            if (settled) return;
            let value;
            try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('invalid_metadata'); return; }
            chunks = [];
            if (!record(value) || value.kind !== 'PartialObjectMetadata' || value.apiVersion !== 'meta.k8s.io/v1'
              || Object.keys(value).some(key => !['apiVersion', 'kind', 'metadata'].includes(key)) || !record(value.metadata)) { fail('invalid_metadata'); return; }
            const metadata = value.metadata;
            if (metadata.name !== input.name || (namespaced ? metadata.namespace !== input.namespace : metadata.namespace !== undefined)
              || metadata.uid !== input.uid || !revision(metadata.resourceVersion) || metadata.deletionTimestamp != null) { fail('metadata_identity_changed'); return; }
            const refs = metadata.ownerReferences ?? [];
            if (!Array.isArray(refs) || refs.length > 16) { fail('invalid_metadata'); return; }
            const ownerReferences = [];
            for (const ref of refs) {
              if (!record(ref) || !uuid(ref.uid) || !dnsName(ref.name) || typeof ref.kind !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,62}$/.test(ref.kind)
                || typeof ref.apiVersion !== 'string' || !/^[a-z0-9.-]+(?:\/[a-z0-9]+)?$/.test(ref.apiVersion)
                || Object.hasOwn(ref, 'controller') && typeof ref.controller !== 'boolean') { fail('invalid_metadata'); return; }
              ownerReferences.push({ apiVersion: ref.apiVersion, kind: ref.kind, name: ref.name, uid: ref.uid,
                ...(Object.hasOwn(ref, 'controller') ? { controller: ref.controller } : {}) });
            }
            settled = true; cleanup();
            resolve({ apiVersion: 'meta.k8s.io/v1', kind: 'PartialObjectMetadata', metadata: {
              name: metadata.name, ...(namespaced ? { namespace: metadata.namespace } : {}), uid: metadata.uid,
              resourceVersion: metadata.resourceVersion, ownerReferences } });
          });
        });
        req.on('timeout', () => fail('metadata_timeout'));
        req.on('error', () => fail('metadata_unavailable'));
        req.end();
      } catch { fail('metadata_unavailable'); }
    });
  }
  /* WebSocket 업그레이드(포트 포워딩): 사용자 인증 그대로, 101이면 소켓을 넘김 */
  async function readToolSecret(input, metadataOnly, { signal, timeout = 15000 } = {}) {
    signal?.throwIfAborted();
    const invalid = (kind = 'metadata_unavailable', status) => Object.assign(new K8sError(kind, 'resource metadata unavailable'),
      { code: 'K8S_METADATA_UNAVAILABLE', ...(Number.isInteger(status) ? { status } : {}) });
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
    const dnsLabel = value => typeof value === 'string' && value.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
    const dnsName = value => typeof value === 'string' && value.length <= 253 && value.split('.').every(dnsLabel);
    const revision = value => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);
    const registry = {
      Secret: ['v1', 'secrets', true], Service: ['v1', 'services', true], Pod: ['v1', 'pods', true],
      ConfigMap: ['v1', 'configmaps', true], PersistentVolumeClaim: ['v1', 'persistentvolumeclaims', true], Namespace: ['v1', 'namespaces', false],
      Deployment: ['apps/v1', 'deployments', true], StatefulSet: ['apps/v1', 'statefulsets', true], ReplicaSet: ['apps/v1', 'replicasets', true],
      Job: ['batch/v1', 'jobs', true], Role: ['rbac.authorization.k8s.io/v1', 'roles', true], RoleBinding: ['rbac.authorization.k8s.io/v1', 'rolebindings', true],
      ClusterRole: ['rbac.authorization.k8s.io/v1', 'clusterroles', false], ClusterRoleBinding: ['rbac.authorization.k8s.io/v1', 'clusterrolebindings', false],
    };
    if (!record(input) || Reflect.ownKeys(input).some(key => !['kind', 'namespace', 'name', 'uid', 'resourceVersion', 'expectedRelease', 'expectedOwner', 'attestedResourceVersion', 'expectedLabels', 'dataKeys'].includes(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), 'value')) || input.kind !== 'Secret'
      || !dnsName(input.name) || !uuid(input.uid) || Object.hasOwn(input, 'resourceVersion') && !revision(input.resourceVersion)) throw invalid('invalid_request');
    const [api, resource, namespaced] = registry[input.kind];
    if (namespaced ? !dnsLabel(input.namespace) : Object.hasOwn(input, 'namespace')) throw invalid('invalid_request');
    if (!metadataOnly && (!Array.isArray(input.dataKeys) || !input.dataKeys.length || input.dataKeys.length > 2 || new Set(input.dataKeys).size !== input.dataKeys.length || input.dataKeys.some(key => !['admin-user', 'admin-password', 'password'].includes(key)))) throw invalid('invalid_request');
    const release = input.expectedRelease, owner = input.expectedOwner, attested = input.attestedResourceVersion;
    if ([release, owner, attested].filter(v => v !== undefined).length !== 1) throw invalid('invalid_request');
    if (release && (!record(release) || Reflect.ownKeys(release).length !== 2 || !dnsName(release.name) || !dnsLabel(release.namespace)
      || Object.keys(release).some(key => !['name', 'namespace'].includes(key)))) throw invalid('invalid_request');
    if (owner && (!record(owner) || Object.keys(owner).sort().join(',') !== 'apiVersion,kind,name,uid'
      || !['Deployment', 'StatefulSet', 'ReplicaSet', 'Pod'].includes(owner.kind) || !dnsName(owner.name) || !uuid(owner.uid)
      || owner.apiVersion !== (owner.kind === 'Pod' ? 'v1' : 'apps/v1'))) throw invalid('invalid_request');
    if (attested !== undefined && (!revision(attested) || input.resourceVersion !== attested)) throw invalid('invalid_request');
    if (input.expectedLabels !== undefined && (!attested || !record(input.expectedLabels) || Object.keys(input.expectedLabels).sort().join(',') !== 'wake.dev/owner,wake.dev/purpose'
      || Object.values(input.expectedLabels).some(value => typeof value !== 'string' || !value || value.length > 63 || /[\x00-\x20\x7f-\x9f]/.test(value)))) throw invalid('invalid_request');
    const requestPath = (api === 'v1' ? '/api/v1' : '/apis/' + api) + (namespaced ? '/namespaces/' + input.namespace : '') + '/' + resource + '/' + input.name;
    let c;
    try { c = await credentials(); } catch { throw invalid('metadata_credential_failed'); }
    const headers = { accept: metadataOnly ? 'application/json;as=PartialObjectMetadata;g=meta.k8s.io;v=v1' : 'application/json', 'user-agent': 'wake-desktop' };
    if (c.token) headers.authorization = `Bearer ${c.token}`;
    else if (c.basic) headers.authorization = `Basic ${Buffer.from(c.basic).toString('base64')}`;
    return new Promise((resolve, reject) => {
      let settled = false, response, req, deadline, chunks = [], bytes = 0;
      const onAbort = () => fail('metadata_cancelled');
      const cleanup = () => { clearTimeout(deadline); signal?.removeEventListener('abort', onAbort); };
      const fail = (kind, status) => {
        if (settled) return;
        settled = true; cleanup(); chunks = [];
        reject(invalid(kind, status)); response?.destroy?.(); req?.destroy?.();
      };
      deadline = setTimeout(() => fail('metadata_timeout'), Math.min(TOOL_REQUEST_TIMEOUT_MS, timeout)); deadline.unref?.();
      if (signal?.aborted) { fail('metadata_cancelled'); return; }
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const mod = url.protocol === 'https:' ? https : http;
        req = mod.request({ host: url.hostname, port, method: 'GET', path: url.pathname.replace(/\/$/, '') + requestPath,
          headers, timeout: Math.min(TOOL_REQUEST_TIMEOUT_MS, timeout), ...tlsOpts(), cert: c.cert ? b64(c.cert) : undefined, key: c.key ? b64(c.key) : undefined, agent: false }, res => {
          response = res;
          if (res.statusCode !== 200) { fail('metadata_unavailable', res.statusCode); return; }
          if (String(res.headers?.['content-type'] || '').split(';')[0].trim() !== 'application/json') { fail('invalid_metadata'); return; }
          res.on('data', chunk => {
            if (settled) return;
            bytes += chunk.length;
            if (bytes > 32768) { fail('metadata_too_large'); return; }
            chunks.push(chunk);
          });
          res.on('error', () => fail('metadata_unavailable'));
          res.on('aborted', () => fail('metadata_unavailable'));
          res.on('end', () => {
            if (settled) return;
            let value;
            try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('invalid_metadata'); return; }
            chunks = [];
            if (!record(value) || value.kind !== (metadataOnly ? 'PartialObjectMetadata' : 'Secret') || value.apiVersion !== (metadataOnly ? 'meta.k8s.io/v1' : 'v1')
              || Object.keys(value).some(key => !(metadataOnly ? ['apiVersion', 'kind', 'metadata'] : ['apiVersion', 'kind', 'metadata', 'data', 'type', 'immutable']).includes(key)) || !record(value.metadata)) { fail('invalid_metadata'); return; }
            const metadata = value.metadata;
            if (metadata.name !== input.name || (namespaced ? metadata.namespace !== input.namespace : metadata.namespace !== undefined)
              || metadata.uid !== input.uid || !revision(metadata.resourceVersion) || metadata.deletionTimestamp != null
              || input.resourceVersion !== undefined && metadata.resourceVersion !== input.resourceVersion) { fail('metadata_identity_changed'); return; }
            if (release && (metadata.labels?.['app.kubernetes.io/managed-by'] !== 'Helm'
              || metadata.annotations?.['meta.helm.sh/release-name'] !== release.name
              || metadata.annotations?.['meta.helm.sh/release-namespace'] !== release.namespace)) {
              fail('metadata_ownership_mismatch'); return;
            }
            if (input.expectedLabels && !Object.entries(input.expectedLabels).every(([key, value]) => metadata.labels?.[key] === value)) { fail('metadata_ownership_mismatch'); return; }
            if (attested && !input.expectedLabels && (metadata.ownerReferences?.length || metadata.labels?.['app.kubernetes.io/managed-by'] === 'Helm')) { fail('metadata_ownership_mismatch'); return; }
            const refs = metadata.ownerReferences ?? [];
            if (!Array.isArray(refs) || refs.length > 16) { fail('invalid_metadata'); return; }
            const ownerReferences = [];
            for (const ref of refs) {
              if (!record(ref) || !uuid(ref.uid) || !dnsName(ref.name) || typeof ref.kind !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,62}$/.test(ref.kind)
                || typeof ref.apiVersion !== 'string' || !/^[a-z0-9.-]+(?:\/[a-z0-9]+)?$/.test(ref.apiVersion)
                || Object.hasOwn(ref, 'controller') && typeof ref.controller !== 'boolean') { fail('invalid_metadata'); return; }
              ownerReferences.push({ apiVersion: ref.apiVersion, kind: ref.kind, name: ref.name, uid: ref.uid,
                ...(Object.hasOwn(ref, 'controller') ? { controller: ref.controller } : {}) });
            }
            let data;
            if (!metadataOnly) {
              if (!record(value.data)) { fail('invalid_metadata'); return; }
              data = {};
              for (const key of input.dataKeys) {
                const encoded = value.data[key];
                if (typeof encoded !== 'string' || encoded.length > 16384 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) { fail('invalid_metadata'); return; }
                data[key] = Buffer.from(encoded, 'base64');
              }
            }
            if (owner && (ownerReferences.length !== 1 || !Object.entries(owner).every(([key, value]) => ownerReferences[0][key] === value))) { fail('metadata_ownership_mismatch'); return; }
            settled = true; cleanup();
            resolve({ ...(data ? { data } : {}), apiVersion: 'meta.k8s.io/v1', kind: 'PartialObjectMetadata', metadata: {
              name: metadata.name, ...(namespaced ? { namespace: metadata.namespace } : {}), uid: metadata.uid,
              resourceVersion: metadata.resourceVersion, ownerReferences }, ownershipMatched: !!(release || owner) });
          });
        });
        req.on('timeout', () => fail('metadata_timeout'));
        req.on('error', () => fail('metadata_unavailable'));
        req.end();
      } catch { fail('metadata_unavailable'); }
    });
  }
  /* WebSocket 업그레이드(포트 포워딩): 사용자 인증 그대로, 101이면 소켓을 넘김 */
  const getToolSecretMetadata = (input, options) => readToolSecret(input, true, options);
  const getToolBootstrapSecret = (input, options) => readToolSecret(input, false, options);

  async function upgrade(p, protocol, { timeout = TOOL_REQUEST_TIMEOUT_MS, signal } = {}) {
    signal?.throwIfAborted();
    const c = await credentials();
    const headers = { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': require('node:crypto').randomBytes(16).toString('base64'), 'sec-websocket-protocol': protocol, 'user-agent': 'wake-desktop' };
    if (c.token) headers.authorization = `Bearer ${c.token}`;
    else if (c.basic) headers.authorization = `Basic ${Buffer.from(c.basic).toString('base64')}`;
    const base = url.pathname.replace(/\/$/, '');
    return new Promise((resolve, reject) => {
      const mod = url.protocol === 'https:' ? https : http;
      signal?.throwIfAborted();
      const req = mod.request({ host: url.hostname, port, method: 'GET', path: base + p, headers, timeout, signal, ...tlsOpts(), cert: c.cert ? b64(c.cert) : undefined, key: c.key ? b64(c.key) : undefined, agent: false });
      req.on('upgrade', (res, socket, head) => {
        const cancel = () => socket.destroy();
        if (signal?.aborted) { socket.destroy(); reject(signal.reason); return; }
        signal?.addEventListener('abort', cancel, { once: true });
        socket.once('close', () => signal?.removeEventListener('abort', cancel));
        socket.setTimeout(0); resolve({ socket, head, protocol: res.headers['sec-websocket-protocol'] });
      });
      req.on('response', res => { res.resume(); reject(httpError(res.statusCode)); });
      req.on('timeout', () => req.destroy(new K8sError('unreachable', `upgrade ${p}: timed out`)));
      req.on('error', e => reject(e instanceof K8sError ? e : new K8sError('unreachable', `${e.code || e.message}`)));
      req.end();
    });
  }
  return { ctx, cluster: cl, user, url, reach, handshake, request, watch, getMetadata, getToolSecretMetadata, getToolBootstrapSecret, upgrade, credentials, checkExec, execCommand: user.exec?.command || null, namespace: ctx.namespace || 'default' };
}

module.exports = { createClient, findCommand, execPath, execInvocation, execConsentKey, K8sError };

function withRequestScope(client, scope = {}) {
  const options = defaultLimit => {
    scope.signal?.throwIfAborted();
    const limit = scope.requestTimeoutMs ?? defaultLimit;
    const remaining = scope.deadline === undefined ? limit : scope.deadline - Date.now();
    if (remaining <= 0) throw Object.assign(new Error('tool operation deadline exceeded'), { kind: 'timeout' });
    return { signal: scope.signal, timeout: Math.min(limit, remaining) };
  };
  return { ...client,
    request: (method, route, body, extra) => client.request(method, route, body, { ...extra, ...options(15000) }),
    getMetadata: input => client.getMetadata(input, options(15000)),
    getToolSecretMetadata: input => client.getToolSecretMetadata(input, options(15000)),
    getToolBootstrapSecret: input => client.getToolBootstrapSecret(input, options(15000)),
    upgrade: (route, protocol) => client.upgrade(route, protocol, options(10000)),
  };
}
module.exports.withRequestScope = withRequestScope;
