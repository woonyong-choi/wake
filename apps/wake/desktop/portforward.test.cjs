const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { forward } = require('./portforward.cjs');

test('default two argument forward uses the exact client and two argument upgrade contract', async t => {
  let resolveUpgrade; const seen = new Promise(resolve => { resolveUpgrade = resolve; });
  const socket = new EventEmitter(); socket.write = () => {}; socket.end = () => {}; socket.destroy = () => {};
  const client = { async upgrade(...args) {
    assert.equal(this, client); assert.equal(args.length, 2);
    assert.equal(args[0], '/api/v1/namespaces/monitoring/pods/grafana/portforward?ports=3000');
    resolveUpgrade(); return { socket };
  } };
  const open = await forward(client, async () => ({ ns: 'monitoring', pod: 'grafana', port: 3000 }));
  const local = net.connect(open.port, '127.0.0.1'); t.after(() => { local.destroy(); open.close(); });
  await seen;
});
test('optional scope binds current signal and remaining budget to the real upgrade without an abort retry', async t => {
  const abort = new AbortController(); let targetCalls = 0, upgrades = 0, ready;
  const seen = new Promise(resolve => { ready = resolve; });
  const client = { upgrade(route, protocol, options) {
    upgrades++; assert.ok(options.signal instanceof AbortSignal && !options.signal.aborted); assert.ok(options.timeout > 0 && options.timeout <= 1000); /* the handshake's own signal, following the scope's until the handshake ends (B1) */
    assert.equal(protocol, 'v4.channel.k8s.io'); assert.match(route, /ports=3000$/);
    return new Promise((resolve, reject) => { options.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }); ready(); });
  } };
  const open = await forward(client, async () => { targetCalls++; return { ns: 'monitoring', pod: 'grafana', port: 3000 }; },
    () => ({ signal: abort.signal, deadline: Date.now() + 1000 }));
  const local = net.connect(open.port, '127.0.0.1'); t.after(() => { local.destroy(); open.close(); });
  await seen; abort.abort();
  await new Promise(resolve => local.once('close', resolve));
  assert.equal(targetCalls, 1); assert.equal(upgrades, 1);
});
test('a rejecting guard closes the new connection without opening an upgrade, and a passing guard resumes', async t => {
  let upgrades = 0, allow = false, guards = 0, ready;
  const seen = new Promise(resolve => { ready = resolve; });
  const socket = new EventEmitter(); socket.write = () => {}; socket.end = () => {}; socket.destroy = () => {};
  const client = { async upgrade() { upgrades++; ready(); return { socket }; } };
  const open = await forward(client, async () => ({ ns: 'monitoring', pod: 'grafana', port: 3000 }), undefined, { ns: 'monitoring', pod: 'grafana', port: 3000 },
    async () => { guards++; if (!allow) throw new Error('suspended'); });
  t.after(() => open.close());
  const blocked = net.connect(open.port, '127.0.0.1'); blocked.on('error', () => {});
  await new Promise(resolve => blocked.once('close', resolve));
  assert.equal(upgrades, 0); assert.equal(guards, 1);
  allow = true;
  const local = net.connect(open.port, '127.0.0.1'); t.after(() => local.destroy());
  await seen; assert.equal(upgrades, 1);
});

/* B1 (U-01 V-1459): the operation that opened a connection bounds its handshake only. An HTTP client reuses the connection for later requests, so the end of
   the first operation's limit must not cut a later request's stream (it was seen as a "connection" error at ~20 s while the tool was only slow) */
test('the established stream outlives the operation that opened it; aborting during the handshake still cancels it', async t => {
  const first = new AbortController(); let given, ready;
  const seen = new Promise(resolve => { ready = resolve; });
  const socket = new EventEmitter(); socket.write = () => {}; socket.end = () => {}; let destroyed = 0; socket.destroy = () => { destroyed++; };
  const client = { async upgrade(_route, _protocol, options) { given = options.signal; ready(); return { socket }; } };
  const open = await forward(client, async () => ({ ns: 'monitoring', pod: 'prometheus', port: 9090 }), () => ({ signal: first.signal, deadline: Date.now() + 1000 }));
  const local = net.connect(open.port, '127.0.0.1'); t.after(() => { local.destroy(); open.close(); });
  await seen; await new Promise(resolve => setImmediate(resolve));
  first.abort(new DOMException('limit', 'TimeoutError'));
  assert.equal(given.aborted, false, 'the upgraded stream is not bound to the opening operation after the handshake');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(local.destroyed, false); assert.equal(destroyed, 0);
});
