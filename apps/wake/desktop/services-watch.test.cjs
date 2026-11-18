const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { create } = require('./services.cjs');
const { yaml } = require('./kubeconfig.cjs');
const { createClusterReads } = require('./reads/cluster.cjs');

const UID = '11111111-2222-4333-8444-555555555555';
const pod = (name, rv, extra = {}) => ({ metadata: { name, namespace: 'payments', uid: name === 'api' ? UID : 'uid-' + name, resourceVersion: String(rv), creationTimestamp: '2026-11-18T00:00:00Z' },
  spec: { containers: [{ name: 'app', image: 'x' }] }, status: { phase: 'Running', containerStatuses: [{ name: 'app', containerID: 'c1', restartCount: 0, state: { running: { startedAt: '2026-11-18T00:00:00Z' } } }] }, ...extra });

/* 시험용 API 서버(평문 HTTP, 비밀 없음): 받은 요청 경로를 남기고, watch 스트림은 열어 둔 채 시험이 사건을 보낸다 */
async function cluster(t, routes = {}) {
  const hits = [], streams = [];
  const s = http.createServer((req, res) => {
    hits.push(req.url);
    const [p, q = ''] = req.url.split('?'), params = new URLSearchParams(q);
    if (params.get('watch') === '1') { res.writeHead(200, { 'content-type': 'application/json' }); res.write('\n'); streams.push({ url: req.url, send: e => res.write(JSON.stringify(e) + '\n') }); return; }
    const route = routes[p];
    const body = typeof route === 'function' ? route(params) : route;
    if (body === undefined) { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ kind: 'Status', code: 404, message: 'not found' })); return; }
    res.writeHead(200, { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json' }); res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise(resolve => s.listen(0, '127.0.0.1', resolve));
  t.mock.method(fs, 'watch', () => ({ close() {} }));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-watch-'));
  const file = path.join(userData, 'fixture-config');
  fs.writeFileSync(file, yaml.dump({ apiVersion: 'v1', kind: 'Config', 'current-context': 'lab', contexts: [{ name: 'lab', context: { cluster: 'lab', user: 'u' } }],
    clusters: [{ name: 'lab', cluster: { server: `http://127.0.0.1:${s.address().port}` } }], users: [{ name: 'u', user: { token: 'synthetic' } }] }));
  const previous = process.env.KUBECONFIG; process.env.KUBECONFIG = file;
  const sent = [], broadcast = [];
  const services = create({ app: { isPackaged: true }, emit: (event, payload) => broadcast.push(event), emitTo: (owner, event, payload) => sent.push({ to: owner.senderWebContentsId, event, payload }), userData });
  t.after(() => { services['kube.watch.closeAll']?.(); if (previous === undefined) delete process.env.KUBECONFIG; else process.env.KUBECONFIG = previous; s.closeAllConnections?.(); s.close(); fs.rmSync(userData, { recursive: true, force: true }); });
  return { services, hits, streams, sent, broadcast };
}
function page(address = 'wake://cluster/lab/resources', id = 7) {
  const listeners = new Set(); let current = true;
  return { kind: 'page', senderWebContentsId: id, senderDocumentGeneration: 1, sourceWebContentsId: id, sourceAddress: address, isCurrent: () => current,
    subscribe: cb => { listeners.add(cb); return () => listeners.delete(cb); }, leave() { current = false; for (const f of listeners) f(); } };
}
const until = async (check, ms = 3000) => { const end = Date.now() + ms; while (!check()) { if (Date.now() > end) throw new Error('timed out'); await new Promise(r => setTimeout(r, 20)); } };
const FROM = { mainFrame: true };

test('secret_shapes_lose_values_and_value_bearing_annotations_and_secret_paths_are_refused_before_any_request', async t => {
  const { sanitize } = require('./kube-sanitize.cjs');
  const shaped = sanitize({ apiVersion: 'v1', kind: 'Secret', metadata: { name: 's', annotations: { 'kubectl.kubernetes.io/last-applied-configuration': '{"data":{"password":"cGFzc3dvcmQ="}}', 'meta.helm.sh/release-name': 'shop', 'example.com/note': 'token=abc' }, managedFields: [{ fieldsV1: {} }] },
    data: { password: 'cGFzc3dvcmQ=' }, stringData: { token: 'abc' } });
  assert.doesNotMatch(JSON.stringify(shaped), /cGFzc3dvcmQ|abc/);
  assert.deepEqual(shaped.metadata.annotations, { 'meta.helm.sh/release-name': 'shop' });
  assert.deepEqual(shaped.data, { password: '' });
  const { services, hits } = await cluster(t, { '/api/v1/namespaces/payments/secrets/s': { kind: 'Secret', data: { password: 'cGFzc3dvcmQ=' } } });
  await assert.rejects(services['kube.get']({ id: 'lab', kind: 'secrets', ns: 'payments', name: 's' }), error => error.kind === 'forbidden');
  assert.equal((await services['kube.watch']({ op: 'open', id: 'lab', kind: 'secrets', ns: '_all', sub: 's1' }, FROM, page())).error, 'forbidden');
  const calls = [];
  const reads = createClusterReads({ client: () => ({ request: async (...a) => { calls.push(a); return {}; } }), k8s: (id, fn) => fn(), tool: async () => ({}), sources: {} });
  await assert.rejects(reads.kube('lab', '/api/v1/namespaces/payments/secrets/s'), error => error.kind === 'forbidden');
  await assert.rejects(reads.get('lab', 'Secret', 'payments', 's'));
  assert.deepEqual(calls, []);
  assert.deepEqual(hits.filter(h => h.includes('secrets')), [], 'no Secret request reached the server');
});

test('kube_watch_sends_coalesced_diffs_to_the_subscribing_page_only_and_kube_list_reads_the_shared_cache', async t => {
  const c = await cluster(t, { '/api/v1/pods': { apiVersion: 'v1', kind: 'PodList', metadata: { resourceVersion: '5' }, items: [pod('api', 1), pod('web', 1)] } });
  const owner = page();
  const opened = await c.services['kube.watch']({ op: 'open', id: 'lab', kind: 'pods', ns: '_all', sub: 'w1' }, FROM, owner);
  assert.equal(opened.items.length, 2);
  assert.equal(opened.state.source, 'watch');
  await until(() => c.streams.length === 1);
  assert.match(c.streams[0].url, /resourceVersion=5/);
  for (let i = 0; i < 20; i++) c.streams[0].send({ type: 'MODIFIED', object: { apiVersion: 'v1', kind: 'Pod', ...pod('web', 10 + i) } });
  await until(() => c.sent.length === 1);
  await new Promise(r => setTimeout(r, 400));
  assert.equal(c.sent.length, 1, 'twenty modifications inside one window are one message');
  assert.equal(c.sent[0].to, 7);
  assert.equal(c.sent[0].event, 'kube-watch');
  assert.equal(c.sent[0].payload.sub, 'w1');
  assert.deepEqual(c.sent[0].payload.changes.map(x => x.o.metadata.resourceVersion), ['29']);
  assert.ok(!c.broadcast.includes('kube-watch'), 'diffs never go to every window');
  const lists = c.hits.filter(h => h === '/api/v1/pods').length;
  assert.equal((await c.services['kube.list']({ id: 'lab', kind: 'pods', ns: '_all' })).length, 2);
  assert.equal(c.hits.filter(h => h === '/api/v1/pods').length, lists, 'kube.list answered from the watch cache');
  owner.leave();
  await until(() => c.sent.some(m => m.payload.closed));
});

test('pod_log_follow_reads_pod_identity_from_the_watch_cache_instead_of_two_pod_gets_per_read', async t => {
  const c = await cluster(t, {
    '/api/v1/pods': { apiVersion: 'v1', kind: 'PodList', metadata: { resourceVersion: '5' }, items: [pod('api', 1)] },
    '/api/v1/namespaces/payments/pods/api': { apiVersion: 'v1', kind: 'Pod', ...pod('api', 1) },
    '/api/v1/namespaces/payments/pods/api/log': '2026-11-18T00:00:01.000000000Z hello\n',
  });
  const owner = page('wake://cluster/lab/logs');
  await c.services['kube.watch']({ op: 'open', id: 'lab', kind: 'pods', ns: '_all', sub: 'w2' }, FROM, owner);
  const now = Date.parse('2026-11-18T00:10:00Z');
  for (let i = 0; i < 3; i++) {
    const r = await c.services['kube.logs']({ id: 'lab', ns: 'payments', name: 'api', uid: UID, container: 'app', previous: false, tail: 500, window: { fromMs: now - 3600_000, toMs: now } }, FROM, owner);
    assert.equal(r.text, '2026-11-18T00:00:01.000000000Z hello');
  }
  assert.equal(c.hits.filter(h => h === '/api/v1/namespaces/payments/pods/api').length, 0, 'no pod GET while the pods watch is live');
  assert.equal(c.hits.filter(h => h.startsWith('/api/v1/namespaces/payments/pods/api/log')).length, 3);
});

test('home_summary_pages_through_continue_tokens_and_marks_what_it_could_not_read_whole', async t => {
  const page1 = { apiVersion: 'v1', kind: 'PodList', metadata: { continue: 'next' }, items: [pod('a', 1), pod('b', 1)] };
  const page2 = { apiVersion: 'v1', kind: 'PodList', metadata: {}, items: [pod('c', 1)] };
  const endless = n => ({ apiVersion: 'v1', kind: 'EventList', metadata: { continue: 'more' }, items: Array.from({ length: Number(n.get('limit')) }, (_, i) => ({ metadata: { name: 'e' + i + Math.random(), namespace: 'payments' } })) });
  const c = await cluster(t, { '/api/v1/pods': q => (q.get('continue') === 'next' ? page2 : page1), '/api/v1/events': endless, '/version': { gitVersion: 'v1.31.0' },
    '/api/v1/nodes': { items: [] }, '/api/v1/namespaces': { items: [] } });
  const summary = await c.services['kube.summary']({ id: 'lab' });
  assert.equal(summary.pods.length, 3, 'the second page is read');
  assert.deepEqual(summary.partial, { pods: false, events: true });
  assert.ok(summary.events.length <= 2000);
});

test('quitting_the_app_stops_every_running_ai_cli_and_closes_the_watches', async t => {
  const cli = require('./ai-cli.cjs');
  const stopped = t.mock.method(cli, 'stopAllRuns', () => {});
  const { EventEmitter } = require('node:events');
  const app = Object.assign(new EventEmitter(), { isPackaged: true });
  t.mock.method(fs, 'watch', () => ({ close() {} }));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-quit-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  create({ app, emit() {}, userData });
  app.emit('will-quit');
  assert.equal(stopped.mock.callCount(), 1);
});


test('hub_retention_services_forget_a_source_or_cluster_export_and_delete_only_with_confirmation', async t => {
  t.mock.method(fs, 'watch', () => ({ close() {} }));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-forget-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const services = create({ app: { isPackaged: true }, emit() {}, userData });
  assert.deepEqual(await services['data.delete']({}), { error: 'confirm' });
  assert.equal(typeof (await services['hub.forgetSource']({ cluster: 'lab', source: 'prometheus' })).removed, 'number');
  assert.equal(typeof (await services['hub.forgetCluster']({ cluster: 'lab' })).removed, 'number');
  assert.deepEqual(await services['hub.forgetCluster']({}), { error: 'invalid_request' });
  assert.ok(await services['data.export']());
  assert.equal(typeof (await services['data.delete']({ confirm: true })).removed, 'number');
});

test('terminal_credential_helper_runs_without_electron_as_node_and_its_file_is_private_and_gone_on_quit', async t => {
  t.mock.method(fs, 'watch', () => ({ close() {} }));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-termcred-'));
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: v => Buffer.from('fixture:' + v), decryptString: b => b.toString().slice(8) };
  const ref = require('./keychain.cjs').createKeychain({ safeStorage, userData }).set('synthetic-terminal-token', 'k8s-token');
  const file = path.join(userData, 'fixture-config');
  fs.writeFileSync(file, yaml.dump({ apiVersion: 'v1', kind: 'Config', contexts: [{ name: 'lab', context: { cluster: 'lab', user: 'u' } }], clusters: [{ name: 'lab', cluster: { server: 'https://lab.invalid' } }], users: [{ name: 'u', user: { tokenRef: ref } }] }));
  const previous = process.env.KUBECONFIG; process.env.KUBECONFIG = file;
  t.after(() => { if (previous === undefined) delete process.env.KUBECONFIG; else process.env.KUBECONFIG = previous; fs.rmSync(userData, { recursive: true, force: true }); });
  const { EventEmitter } = require('node:events');
  const app = Object.assign(new EventEmitter(), { isPackaged: true });
  t.mock.method(require('./ai-cli.cjs'), 'stopAllRuns', () => {});
  const services = create({ app, emit() {}, userData, safeStorage });
  const result = services['term.env']({ id: 'lab' });
  const merged = require('./kubeconfig.cjs').loadKubeconfig(result.env.KUBECONFIG.split(path.delimiter));
  const exec = merged.users.get(merged.contexts.get('lab').user).exec;
  assert.notEqual(exec.command, process.execPath, 'the packaged app cannot run itself as Node');
  assert.ok(!JSON.stringify(exec).includes('ELECTRON_RUN_AS_NODE'));
  const credentialFile = exec.args.at(-1);
  assert.equal(fs.statSync(credentialFile).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(credentialFile)).mode & 0o777, 0o700);
  const out = require('node:child_process').execFileSync(exec.command, exec.args, { env: { PATH: process.env.PATH } }).toString();
  assert.equal(JSON.parse(out).status.token, 'synthetic-terminal-token');
  app.emit('will-quit');
  assert.equal(fs.existsSync(credentialFile), false, 'the credential file is removed when the app quits');
});

test('agent_prep_reports_whether_the_bundled_chart_has_a_published_image', async t => {
  t.mock.method(fs, 'watch', () => ({ close() {} }));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'wake-prep-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const services = create({ app: { isPackaged: false }, emit() {}, userData });
  const prep = services['agent.prep']({});
  assert.equal(prep.exists, true);
  assert.deepEqual(prep.image, require('./agent-install-charts/image-state.cjs').agentImageState(prep.chart));
  assert.equal(prep.image.published, true, 'the bundled chart names the published image by digest (D-USR-2026-11-18-34)');
});

/* review 8: the log IPC returned raw text, so a credential printed by a container reached the page as is. Log text crosses IPC only through the
   shared disclosure policy (data/mask.js discloseText), on the window read and on the plain tail read */
test('pod_logs_cross_ipc_through_the_disclosure_policy', async t => {
  const opaque = 'Zq8RkT2mW9xLp4Vb7Nc3Hd6Jf1Gs5Ya0Ue';
  const c = await cluster(t, {
    '/api/v1/namespaces/payments/pods/api': { apiVersion: 'v1', kind: 'Pod', ...pod('api', 1) },
    '/api/v1/namespaces/payments/pods/api/log': `2026-11-18T00:00:01.000000000Z connected with ${opaque}\n2026-11-18T00:00:02.000000000Z password=synthetic-pass ok\n`,
  });
  const now = Date.parse('2026-11-18T00:10:00Z');
  const windowed = await c.services['kube.logs']({ id: 'lab', ns: 'payments', name: 'api', uid: UID, container: 'app', previous: false, tail: 500, window: { fromMs: now - 3600_000, toMs: now } }, FROM, page('wake://cluster/lab/logs'));
  const tail = await c.services['kube.logs']({ id: 'lab', ns: 'payments', name: 'api', tail: 100 }, FROM, page('wake://cluster/lab/logs'));
  for (const text of [windowed.text, typeof tail === 'string' ? tail : tail?.text]) {
    assert.equal(typeof text, 'string');
    assert.doesNotMatch(text, new RegExp(opaque + '|synthetic-pass'));
    assert.match(text, /connected with ••••/);
  }
});
