const test = require('node:test');
const assert = require('node:assert/strict');
const { createToolConnect } = require('./tool-connect.cjs');
function fixture(kind = 'grafana', rebind) {
  let config = {}; const values = new Map(), calls = [], writes = [], state = { invalid: false, denied: false, redirect: false, saved: 0, origin: 'http://127.0.0.1:12345', deleted: [], issuedRefs: 0 };
  const binding = { contextId: 'cluster-a', kind, namespace: 'monitoring', serviceName: kind, serviceUid: 'svc-a', port: 3000, portName: 'http', podUid: 'pod-a' };
  const token = 'synthetic-private-api-token', f = { key: 'cluster-a-' + kind, cluster: 'cluster-a', tool: { kind, bindingId: 'main-handle' } };
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const fetcher = async (url, options) => {
    calls.push({ url, method: options.method, redirect: options.redirect, authorization: options.headers?.authorization });
    assert.equal(options.redirect, 'error'); assert.equal(new URL(url).origin, state.origin);
    if (state.redirect) return response({}, 302);
    if (state.tokenDenied && options.headers?.authorization) return response({}, 401);
    if (options.method === 'POST' || options.method === 'DELETE') writes.push(new URL(url).pathname);
    if (kind === 'grafana' && url.endsWith('/api/search?limit=1')) return response(state.invalidRead ? {} : [], state.denied ? 403 : 200);
    if (url.includes('/api/serviceaccounts/search')) return response({ serviceAccounts: [] });
    if (url.endsWith('/api/serviceaccounts')) return response({ id: 17, role: 'Viewer' });
    if (url.endsWith('/api/serviceaccounts/17/tokens')) { state.onToken?.(); return response({ key: token, id: 19 }); }
    if (url.includes('/api/v1/session/userinfo')) return response({ loggedIn: true });
    if (url.endsWith('/api/v1/account/wake-reader')) return response({ capabilities: ['apiKey'] });
    if (url.endsWith('/api/v1/account/wake-reader/token')) return response({ token });
    if (url.includes('/loki/api/v1/labels')) return response(state.invalidRead ? {} : { status: 'success', data: ['namespace'] });
    if (url.includes('/api/search?') && kind === 'tempo') return response({ traces: [] });
    if (url.endsWith('/api/v1/applications')) return response(state.invalidRead ? {} : { items: [] }, state.denied ? 403 : 200);
    if (state.argoDiff && url.includes('/api/v1/applications/')) return response(state.argoDiff(new URL(url)));
    return response({});
  };
  const validate = async () => { if (state.invalid) throw new Error(token); };
  const ops = createToolConnect({ client: () => ({}), keychain: { set(value) { const id = 'ref-' + ++state.issuedRefs; values.set(id, value); return id; }, get: id => values.get(id), delete(id) { state.deleted.push(id); if (state.deleteFailure) throw new Error(token); return values.delete(id); } },
    conns: () => structuredClone(config), saveConns(value) {
      if (state.saveFailure) {
        if (state.saveFailure === 'published') config = structuredClone(value);
        throw Object.assign(new Error('synthetic-private-save-error'), { published: state.saveFailure === 'published' });
      }
      config = structuredClone(value); state.saved++;
    }, partition: () => ({ fetch: fetcher }), fetchImpl: fetcher,
    toolAccess: { rebind, async open() { await validate(); return { url: state.origin + '/', via: 'port-forward', binding: structuredClone(binding), validate }; } } });
  return { ops, f, calls, writes, state, values, binding, token, config: () => config };
}
test('Argo CD compares selected resources without exporting Secret data', async () => {
  const f = fixture('argocd');
  const application = { name: 'guestbook', namespace: 'argocd', uid: 'd86f2ac1-d538-42f9-a899-0196251f98be', revision: 'commit' };
  const resource = { kind: 'Service', metadata: { name: 'frontend' }, spec: { type: 'ClusterIP' } };
  const secret = { kind: 'Secret', metadata: { name: 'private' }, data: { token: 'secret-value' } };
  let version = 0;
  f.state.argoDiff = url => {
    assert.equal(url.searchParams.get('appNamespace'), 'argocd');
    if (!url.pathname.endsWith('/managed-resources')) return { metadata: { ...application, resourceVersion: String(9 + version) }, status: { sync: { revision: 'commit' } }, spec: { project: 'default' } };
    assert.equal(url.searchParams.get('project'), 'default');
    return { items: [{ kind: 'Service', name: 'frontend', namespace: 'demo', targetState: JSON.stringify(resource), modified: true },
      { kind: 'Secret', name: 'private', namespace: 'demo', targetState: JSON.stringify(secret), modified: true }] };
  };
  assert.equal((await f.ops.setToken(f.f, { token: f.token })).ok, true);
  const result = await f.ops.gitopsDiff(f.f, { application });
  assert.equal(result.state, 'available');
  assert.deepEqual(result.files.map(file => [file.file, file.change, file.live]), [['demo/Service/frontend.yaml', 'A', '']]);
  assert.match(result.files[0].git, /type: ClusterIP/);
  assert.doesNotMatch(JSON.stringify(result), /secret-value/);
  assert.ok(f.calls.slice(-3).every(call => call.method === 'GET' && call.authorization === 'Bearer ' + f.token));
  const read = f.state.argoDiff;
  f.state.argoDiff = url => { const body = read(url); if (url.pathname.endsWith('/managed-resources')) version++; return body; };
  assert.deepEqual(await f.ops.gitopsDiff(f.f, { application }), { state: 'identity_changed' });
});
test('Argo CD checks its stored credential at a new origin before opening Applications', async () => {
  const f = fixture('argocd');
  assert.equal((await f.ops.issue(f.f)).ok, true);
  f.state.origin = 'http://127.0.0.1:23456';
  assert.equal((await f.ops.home(f.f)).url, f.state.origin + '/applications');
  assert.equal(f.calls.at(-1).authorization, 'Bearer ' + f.token);
  assert.equal(f.config().toolMeta[f.f.key].origin, f.state.origin);
  f.state.origin = 'http://127.0.0.1:23457';
  f.state.tokenDenied = true;
  assert.equal((await f.ops.home(f.f)).state, 'unauthorized');
  assert.equal(f.config().toolMeta[f.f.key].origin, null);
});

test('opening a tool rejects an expired saved token at the same origin and allows replacement', async () => {
  for (const kind of ['grafana', 'argocd']) {
    const f = fixture(kind);
    assert.equal((await f.ops.setToken(f.f, { token: f.token })).ok, true);
    const origin = f.config().toolMeta[f.f.key].origin;
    const savedRef = f.config().toolTokens[f.f.key];

    f.state.tokenDenied = true;
    const denied = await f.ops.home(f.f);
    assert.equal(denied.url, undefined);
    assert.equal(denied.state, 'unauthorized');
    assert.equal(denied.code, 'tool_unauthorized');
    assert.equal(f.config().toolMeta[f.f.key].origin, null);
    assert.equal(f.config().toolTokens[f.f.key], savedRef);

    f.state.tokenDenied = false;
    assert.equal((await f.ops.setToken(f.f, { token: f.token + '-replacement' })).ok, true);
    assert.equal(f.values.has(savedRef), false);
    assert.equal(f.config().toolMeta[f.f.key].origin, origin);
    assert.equal(new URL((await f.ops.home(f.f)).url).origin, origin);
  }
});

test('main Grafana and Argo issuance stores only references and reuses the verified same binding token', async () => {
  for (const kind of ['grafana', 'argocd']) {
    const f = fixture(kind), first = await f.ops.issue(f.f);
    assert.equal(first.ok, true); assert.equal(f.values.size, 1); assert.equal([...f.values.values()][0], f.token);
    assert.equal(JSON.stringify(first).includes(f.token), false); assert.equal(JSON.stringify(f.config()).includes(f.token), false);
    assert.equal(f.config().toolMeta[f.f.key].binding.serviceUid, 'svc-a');
    const writes = f.writes.length, second = await f.ops.issue(f.f);
    assert.equal(second.reused, true); assert.equal(f.writes.length, writes); assert.equal(f.state.saved, 1);
    assert.equal((await f.ops.verify(f.f)).via, 'token');
  }
});
test('authenticated redirect and post-issue UID changes never persist credentials or expose response secrets', async () => {
  for (const mode of ['redirect', 'uid', 'forbidden']) {
    const f = fixture();
    if (mode === 'redirect') f.state.redirect = true;
    if (mode === 'uid') f.state.onToken = () => { f.state.invalid = true; };
    if (mode === 'forbidden') f.state.denied = true;
    const result = await f.ops.issue(f.f);
    assert.notEqual(result.ok, true); assert.equal(f.state.saved, 0); assert.equal(f.values.size, 0);
    assert.equal(JSON.stringify(result).includes(f.token), false); assert.ok(f.calls.every(call => call.redirect === 'error'));
  }
});
test('renderer key context mismatch cannot mint or resolve a credential', async () => {
  const f = fixture(); const result = await f.ops.issue({ ...f.f, key: 'other-cluster-grafana' });
  assert.notEqual(result.ok, true); assert.equal(f.calls.length, 0); assert.equal(f.values.size, 0);
});

test('concurrent sanitized cluster-key collision cannot mint twice and stored origin rebinding cannot reuse a ref', async () => {
  const f = fixture();
  const first = f.ops.issue(f.f), second = await f.ops.issue({ ...f.f, cluster: 'cluster/a', key: 'cluster/a-grafana' });
  assert.equal(second.state, 'busy'); assert.equal((await first).ok, true);
  assert.equal(f.writes.filter(path => path.endsWith('/tokens')).length, 1);
  f.binding.podUid = 'replacement';
  const result = await f.ops.verify(f.f); assert.notEqual(result.ok, true); assert.equal(f.state.saved, 1);
});

test('return226 same audience token is verified and rebound only to each new main forward origin', async () => {
  const f = fixture(); assert.equal((await f.ops.issue(f.f)).ok, true);
  const originalRef = f.config().toolTokens[f.f.key], writes = f.writes.length;
  for (const port of [12346, 12347]) {
    f.state.origin = 'http://127.0.0.1:' + port;
    const result = await f.ops.verify({ ...f.f, origin: 'https://attacker.invalid', tool: { ...f.f.tool, origin: 'https://attacker.invalid' } });
    assert.equal(result.ok, true); assert.equal(result.via, 'token');
    assert.equal(f.config().toolMeta[f.f.key].origin, f.state.origin);
    assert.equal(f.config().toolTokens[f.f.key], originalRef); assert.equal(f.writes.length, writes);
  }
  assert.equal((await f.ops.issue(f.f)).reused, true); assert.equal(f.values.size, 1);
});
test('return226 Pod replacement or unavailable binding never prevents local forget or disconnect cleanup', async () => {
  for (const action of ['forget', 'disconnect']) {
    const f = fixture(); await f.ops.issue(f.f); const writes = f.writes.length;
    f.binding.podUid = 'other-pod'; f.state.invalid = true;
    const result = await f.ops[action](f.f);
    assert.equal(result.ok, true); assert.equal(result.localDeleted, true); assert.equal(result.remoteRevoked, false);
    assert.equal(f.values.size, 0); assert.equal(f.config().toolTokens?.[f.f.key], undefined);
    assert.equal(f.config().toolMeta?.[f.f.key], undefined); assert.equal(f.writes.length, writes);
  }
});
test('return226 stale audience issue cleans the old local ref before a normal new issuance', async () => {
  const f = fixture(); await f.ops.issue(f.f); const ref = f.config().toolTokens[f.f.key];
  f.binding.podUid = 'replacement-pod'; f.state.origin = 'http://127.0.0.1:12346';
  const result = await f.ops.issue(f.f);
  assert.equal(result.ok, true); assert.equal(result.reused, undefined); assert.deepEqual(f.state.deleted, [ref]);
  assert.notEqual(f.config().toolTokens[f.f.key], ref); assert.equal(f.config().toolMeta[f.f.key].binding.podUid, 'replacement-pod');
  assert.equal(f.config().toolMeta[f.f.key].origin, f.state.origin); assert.equal(f.values.size, 1);
});
test('return226 unauthorized reuse disables old origin and can clean then issue again through the normal session', async () => {
  const f = fixture(); await f.ops.issue(f.f); const ref = f.config().toolTokens[f.f.key];
  f.state.tokenDenied = true; f.state.origin = 'http://127.0.0.1:12346';
  const verified = await f.ops.verify(f.f); assert.equal(verified.state, 'unauthorized');
  assert.equal(f.config().toolMeta[f.f.key].origin, null);
  const result = await f.ops.issue(f.f); assert.equal(result.ok, true); assert.deepEqual(f.state.deleted, [ref]);
  assert.equal(f.config().toolMeta[f.f.key].origin, f.state.origin);
});
test('return226 keychain deletion failure preserves the reference and prevents a false cleanup or reissuance success', async () => {
  for (const action of ['forget', 'disconnect', 'issue']) {
    const f = fixture(); await f.ops.issue(f.f); const ref = f.config().toolTokens[f.f.key], writes = f.writes.length;
    f.binding.podUid = 'replacement'; f.state.deleteFailure = true;
    const result = await f.ops[action](f.f);
    assert.notEqual(result.ok, true); assert.equal(result.state, 'credential_cleanup_failed');
    assert.equal(f.config().toolTokens[f.f.key], ref); assert.equal(f.values.size, 1); assert.equal(f.writes.length, writes);
    assert.equal(f.config().toolMeta[f.f.key].origin, null);
    assert.equal(JSON.stringify(result).includes(f.token), false);
  }
});
test('return226 disconnect revokes upstream only for an exact audience and still deletes the local credential', async () => {
  const f = fixture(); await f.ops.issue(f.f); f.state.origin = 'http://127.0.0.1:12346';
  const result = await f.ops.disconnect(f.f);
  assert.equal(result.ok, true); assert.equal(result.localDeleted, true); assert.equal(result.remoteRevoked, true);
  assert.ok(f.writes.some(path => path === '/api/serviceaccounts/17/tokens/19'));
  assert.equal(f.values.size, 0); assert.equal(f.config().toolTokens?.[f.f.key], undefined);
});

test('bootstrap issuance sends bounded TTL and rejects missing or excessive expiration without infinite fallback', async () => {
  const { KINDS } = require('./tool-connect.cjs');
  for (const kind of ['grafana', 'argocd']) for (const invalid of [null, 'missing', 'late']) {
    const deadline = Date.now() + 60000, calls = []; let id;
    const send = async (method, route, body) => {
      if (typeof body === 'function') body = body();
      calls.push({ method, route, body });
      if (route.includes('/serviceaccounts/search')) return { ok: true, body: { serviceAccounts: [{ name: 'wake-reader', id: 7, role: 'Viewer' }], totalCount: 1 } };
      if (route.endsWith('/tokens') && method === 'POST') { assert.ok(body.secondsToLive > 0 && body.secondsToLive < 60); return { ok: true, body: { id: 8, key: 'synthetic-reader-token' } }; }
      if (route.endsWith('/tokens')) return { ok: true, body: invalid === 'missing' ? [] : [{ id: 8, expiration: new Date(deadline + (invalid === 'late' ? 1000 : -2000)).toISOString() }] };
      if (method === 'POST') { assert.ok(body.expiresIn > 0 && body.expiresIn < 60); id = body.id; return { ok: true, body: { token: 'synthetic-reader-token' } }; }
      return { ok: true, body: { tokens: invalid === 'missing' ? [] : [{ id, expiresAt: String(Math.floor(deadline / 1000) + (invalid === 'late' ? 2 : -2)) }] } };
    };
    const result = await KINDS[kind].issue(send, 'fixture', deadline);
    if (invalid) { assert.equal(result.error, 'expiry_unverified'); assert.equal(result.token, undefined); assert.equal(result.meta.incomplete, true); }
    else { assert.equal(result.token, 'synthetic-reader-token'); assert.ok(Date.parse(result.meta.expiresAt) <= deadline); }
    assert.ok(calls.some(call => call.method === 'POST'));
    let attempted = 0;
    assert.equal((await KINDS[kind].issue(async () => { attempted++; }, 'fixture', NaN)).error, 'expiry_unverified');
    assert.equal(attempted, 0);
  }
});

test('one tool job rejects overlap, aborts HTTP at the total deadline and never stores a late token', async () => {
  let resolveHttp, saves = 0, signal;
  const f = { key: 'c-grafana', cluster: 'c', tool: { kind: 'grafana' } };
  const ops = createToolConnect({ operationTimeoutMs: 20, client: () => ({}),
    toolAccess: { open: async () => ({ url: 'http://127.0.0.1:1234/', binding: {}, validate: async () => {} }) },
    keychain: { set() { saves++; } }, conns: () => ({}), saveConns() { saves++; },
    partition: () => ({ fetch: (url, options) => { signal = options.signal; return new Promise(resolve => { resolveHttp = resolve; }); } }) });
  const first = ops.session(f);
  while (!resolveHttp) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await ops.issue(f)).state, 'busy');
  assert.equal((await first).state, 'timeout');
  assert.equal(signal.aborted, true);
  assert.equal((await ops.session(f)).state, 'busy');
  resolveHttp(new Response('[]'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saves, 0);
});
test('explicit cancellation aborts the active job without allowing a late credential write', async () => {
  const f = fixture();
  let release;
  f.state.onToken = () => {};
  const ops = createToolConnect({ client: () => ({}), operationTimeoutMs: 1000,
    toolAccess: { open: () => new Promise(resolve => { release = resolve; }) } });
  const pending = ops.session(f.f);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await ops.cancel(f.f)).state, 'cancelled');
  assert.equal((await pending).state, 'cancelled');
  release({ url: 'http://127.0.0.1:1/', validate: async () => {} });
  await new Promise(resolve => setImmediate(resolve));
});

test('partial upstream token metadata blocks a second issuance and local forget instead of dropping its identity', async () => {
  const f = fixture(); await f.ops.issue(f.f);
  delete f.config().toolTokens[f.f.key]; f.config().toolMeta[f.f.key].incomplete = true;
  const writes = f.writes.length, saved = f.state.saved;
  const result = await f.ops.issue(f.f);
  assert.equal(result.code, 'credential_partial_pending'); assert.equal(result.stage, 'issue');
  assert.equal(f.writes.length, writes); assert.equal(f.state.saved, saved);
  assert.equal((await f.ops.forget(f.f)).state, 'credential_cleanup_failed');
  assert.equal(f.config().toolMeta[f.f.key].id, 19);
});
test('TTL factory is evaluated after slow preguards with HTTP budget reserved for both Grafana and Argo', async t => {
  const { KINDS } = require('./tool-connect.cjs');
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  for (const kind of ['grafana', 'argocd']) {
    const cap = now + 60000; let issued, tokenId;
    const result = await KINDS[kind].issue(async (method, route, body) => {
      if (method === 'POST') {
        now += 20000;
        assert.equal(typeof body, 'function');
        const actual = body(); issued = kind === 'grafana' ? actual.secondsToLive : actual.expiresIn; tokenId = actual.id;
        assert.equal(issued, 30); assert.ok(now + issued * 1000 + 8000 <= cap);
        return { ok: true, body: kind === 'grafana' ? { id: 8, key: 'synthetic-reader' } : { token: 'synthetic-reader' } };
      }
      if (route.includes('/serviceaccounts/search')) return { ok: true, body: { totalCount: 1, serviceAccounts: [{ id: 7, name: 'wake-reader', role: 'Viewer' }] } };
      return { ok: true, body: kind === 'grafana' ? [{ id: 8, expiration: new Date(now + issued * 1000).toISOString() }]
        : { tokens: [{ id: tokenId, expiresAt: String((now + issued * 1000) / 1000) }] } };
    }, 'fixture', cap);
    assert.equal(result.token, 'synthetic-reader');
  }
});
test('main-issued flow budget is shared by sequential operations and cannot be refreshed by renderer deadlines', async t => {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const ops = createToolConnect({ client: () => ({}), conns: () => ({}), toolAccess: { async open() { return { url: 'http://127.0.0.1:1/', binding: null, async validate() {} }; } },
    fetchImpl: async () => { now += 25000; return new Response('{}'); }, partition: () => ({ fetch: async () => { now += 25000; return new Response('[]'); } }) });
  const f = { key: 'c-grafana', cluster: 'c', tool: { kind: 'grafana' } };
  const first = await ops.reach(f, { flowStart: true });
  assert.equal(typeof first.flowId, 'string'); assert.equal(first.flowExpiresAt, 1120000);
  const second = await ops.session(f, { flowId: first.flowId, deadline: now + 999999 });
  assert.equal(second.flowExpiresAt, first.flowExpiresAt);
  now = first.flowExpiresAt + 1;
  assert.equal((await ops.verify(f, { flowId: first.flowId })).state, 'timeout');
  await ops.cancel(f);
});

test('published uncertain credential storage retains its new reference and metadata without a false success or retry', async () => {
  for (const op of ['issue', 'setToken']) for (const phase of ['before', 'published']) {
    const f = fixture(); f.state.saveFailure = phase;
    const result = await f.ops[op](f.f, op === 'setToken' ? { token: f.token } : {});
    assert.notEqual(result.ok, true);
    assert.equal(f.values.size, phase === 'published' ? 1 : 0);
    assert.equal(f.state.deleted.length, phase === 'published' ? 0 : 1);
    assert.equal(!!f.config().toolTokens?.[f.f.key], phase === 'published');
    if (phase === 'published') {
      assert.equal(result.state, 'credential_store_uncertain');
      assert.equal(result.code, 'credential_store_uncertain');
      assert.equal(f.config().toolMeta[f.f.key].binding.podUid, f.binding.podUid);
    }
    assert.equal(JSON.stringify(result).includes(f.token), false);
    assert.equal(JSON.stringify(result).includes('synthetic-private-save-error'), false);
  }
});

test('verify rebinds a stale discovery handle and reads with the saved Viewer instead of the browser session', async () => {
  let reopened;
  const f = fixture('grafana', async (_client, _context, tool) => {
    reopened = { ...tool, bindingId: 'fresh-handle' };
    return reopened;
  });
  assert.equal((await f.ops.issue(f.f)).ok, true);
  f.calls.length = 0;
  const result = await f.ops.verify(f.f, { restore: true });

  assert.equal(result.via, 'token');
  assert.deepEqual(result.discovery, reopened);
  assert.equal(f.calls[0].authorization, 'Bearer ' + f.token);
  assert.equal(f.values.size, 1);
  assert.equal(f.writes.filter(path => path.endsWith('/tokens')).length, 1);
});

test('verify Loki and Tempo requires the read API response rather than readiness alone', async () => {
  for (const kind of ['loki', 'tempo']) {
    const f = fixture(kind);
    assert.equal((await f.ops.verify(f.f)).via, 'read');
    assert.equal(f.calls.length, 1);
  }
  const invalid = fixture('loki');
  invalid.state.invalidRead = true;
  assert.equal((await invalid.ops.verify(invalid.f)).code, 'tool_read_failed');
});

test('user tokens are saved only after the real list API accepts them and returns a list', async () => {
  for (const kind of ['grafana', 'argocd']) {
    const f = fixture(kind);
    for (const [mode, code] of [['tokenDenied', 'tool_unauthorized'], ['denied', 'tool_forbidden'], ['invalidRead', 'tool_read_failed']]) {
      f.state[mode] = true;
      const result = await f.ops.setToken(f.f, { token: f.token });
      assert.equal(result.code, code);
      assert.equal(f.values.size, 0);
      assert.equal(f.state.saved, 0);
      f.state[mode] = false;
    }
    assert.equal((await f.ops.setToken(f.f, { token: f.token })).ok, true);
    assert.equal(f.values.size, 1);
    f.state.origin = 'http://127.0.0.1:23456';
    const home = await f.ops.home(f.f);
    assert.equal(new URL(home.url).origin, f.state.origin);
    assert.equal(new URL(f.calls.at(-1).url).origin, f.state.origin);
    assert.equal(f.calls.at(-1).authorization, 'Bearer ' + f.token);
    assert.equal(f.config().toolMeta[f.f.key].origin, f.state.origin);
  }
});
