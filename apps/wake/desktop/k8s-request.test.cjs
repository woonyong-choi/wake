const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { createClient } = require('./k8s.cjs');

/* 시험용 API 서버(평문 HTTP, 비밀 없음) */
async function server(t, handler) {
  const s = http.createServer(handler);
  let connections = 0;
  s.on('connection', () => { connections++; });
  await new Promise(resolve => s.listen(0, '127.0.0.1', resolve));
  t.after(() => { s.closeAllConnections?.(); s.close(); });
  const kc = { contexts: new Map([['lab', { cluster: 'c', user: 'u' }]]), clusters: new Map([['c', { server: `http://127.0.0.1:${s.address().port}` }]]), users: new Map([['u', { token: 'synthetic' }]]) };
  return { kc, connections: () => connections };
}

test('a_response_that_trickles_forever_is_cut_at_the_total_deadline_not_only_on_idle', async t => {
  const { kc } = await server(t, (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); const timer = setInterval(() => res.write(' '), 50); res.on('close', () => clearInterval(timer)); });
  const client = createClient(kc, 'lab', { env: {} });
  const began = Date.now();
  await assert.rejects(Promise.race([client.request('GET', '/api/v1/pods', null, { timeout: 400 }), new Promise((_, reject) => setTimeout(() => reject(new Error("still waiting after 2.5s")), 2500))]),
    error => error.kind === 'timeout' || error.kind === 'unreachable');
  assert.ok(Date.now() - began < 1800);
});

test('responses_have_a_default_byte_limit', async t => {
  const { kc } = await server(t, (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('[' + '0,'.repeat(4096) + '0]'); });
  const client = createClient(kc, 'lab', { env: {}, maxResponseBytes: 1024 });
  await assert.rejects(client.request('GET', '/api/v1/pods'), error => error.kind === 'response_too_large');
});

test('an_error_status_keeps_the_kubernetes_status_message_and_reason', async t => {
  const { kc } = await server(t, (req, res) => { res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ kind: 'Status', apiVersion: 'v1', status: 'Failure', reason: 'Forbidden', code: 403, message: 'pods is forbidden: User "system:serviceaccount:wake-system:wake-reader" cannot watch resource "pods" in API group "" at the cluster scope' })); });
  const client = createClient(kc, 'lab', { env: {} });
  await assert.rejects(client.request('GET', '/api/v1/pods'), error => error.status === 403 && error.kind === 'forbidden' && error.reason === 'Forbidden'
    && /cannot watch resource "pods"/.test(error.message));
});

test('sequential_requests_to_one_cluster_reuse_a_kept_alive_connection', async t => {
  const f = await server(t, (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"kind":"Status"}'); });
  for (let i = 0; i < 3; i++) await createClient(f.kc, 'lab', { env: {} }).request('GET', '/version');
  assert.equal(f.connections(), 1, 'three requests through new clients of the same cluster share one connection');
});

test('watch_streams_newline_delimited_events_split_across_chunks_and_stops_on_abort', async t => {
  let path = '';
  const { kc } = await server(t, (req, res) => {
    path = req.url; res.writeHead(200, { 'content-type': 'application/json' });
    const a = JSON.stringify({ type: 'ADDED', object: { metadata: { name: 'a', resourceVersion: '2' } } }), b = JSON.stringify({ type: 'BOOKMARK', object: { metadata: { resourceVersion: '3' } } });
    res.write(a.slice(0, 10)); setTimeout(() => res.write(a.slice(10) + '\n' + b + '\n'), 30);
  });
  const events = [], controller = new AbortController();
  const done = createClient(kc, 'lab', { env: {} }).watch('/api/v1/pods?watch=1', { signal: controller.signal, onEvent: e => { events.push(e); if (events.length === 2) controller.abort(); } });
  await done;
  assert.equal(path, '/api/v1/pods?watch=1');
  assert.deepEqual(events.map(e => e.type), ['ADDED', 'BOOKMARK']);
});

test('watch_rejects_with_the_http_status_when_the_watch_verb_is_refused', async t => {
  const { kc } = await server(t, (req, res) => { res.writeHead(403); res.end(); });
  await assert.rejects(createClient(kc, 'lab', { env: {} }).watch('/api/v1/pods?watch=1', { onEvent() {} }), error => error.status === 403 && error.kind === 'forbidden');
});
