/* 도구 사용자 항목(spec/data-policy.md#DP-ITEMS): Prometheus 규칙, Alertmanager 무음·경로, Argo CD 동기화 창, Grafana 대시보드 읽기를 가짜 HTTP 서버로 시험한다.
 * 클러스터·네트워크에 닿지 않는다. 합성 응답은 이 파일 안에만 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createToolItems, silenceMatches, windowActive } = require('./tool-items.cjs');
const { createHubStore } = require('./hub-store.cjs');
const { createToolLayer } = require('./hub-tools.cjs');
const { createIncidentHub } = require('./incident-hub.cjs');

const NOW = Date.parse('2026-11-18T03:30:00Z');
const maskText = s => { const out = String(s).replace(/password=\S+/g, 'password=••••'); return { text: out, n: out === s ? 0 : 1 }; };

const RULES = { groups: [
  { name: 'payments.rules', file: '/etc/prometheus/rules/payments.yaml', interval: 30, rules: [
    { type: 'alerting', name: 'HighErrorRate', query: 'sum(rate(http_requests_total{namespace="pay",code=~"5.."}[5m])) / sum(rate(http_requests_total{namespace="pay"}[5m])) > 0.05', duration: 300,
      labels: { severity: 'critical' }, annotations: { summary: 'pay 5xx' }, health: 'ok', state: 'firing', lastError: '', alerts: [{ labels: { alertname: 'HighErrorRate', namespace: 'pay', severity: 'critical' }, state: 'firing' }] },
    { type: 'recording', name: 'pay:requests:rate5m', query: 'sum(rate(http_requests_total{namespace="pay"}[5m]))', labels: {}, health: 'ok' }] },
  { name: 'node.rules', file: '/etc/prometheus/rules/node.yaml', interval: 60, rules: [
    { type: 'alerting', name: 'NodeDown', query: 'up{job="node"} == 0', duration: 60, labels: { severity: 'warning' }, annotations: {}, health: 'err', lastError: 'boom', state: 'inactive', alerts: [] }] }] };
const SILENCES = [
  { id: 's-active', status: { state: 'active' }, matchers: [{ name: 'alertname', value: 'HighErrorRate', isRegex: false, isEqual: true }, { name: 'namespace', value: 'pa.*', isRegex: true, isEqual: true }],
    startsAt: '2026-11-18T03:00:00Z', endsAt: '2026-11-18T05:00:00Z', createdBy: 'oncall@example.com', comment: 'deploy window, password=abc', updatedAt: '2026-11-18T03:00:00Z' },
  { id: 's-other-ns', status: { state: 'active' }, matchers: [{ name: 'namespace', value: 'shop', isRegex: false, isEqual: true }], startsAt: '2026-11-18T03:00:00Z', endsAt: '2026-11-18T05:00:00Z', createdBy: 'x', comment: '', updatedAt: '2026-11-18T03:00:00Z' },
  { id: 's-not', status: { state: 'active' }, matchers: [{ name: 'namespace', value: 'pay', isRegex: false, isEqual: true }, { name: 'severity', value: 'critical', isRegex: false, isEqual: false }], startsAt: '2026-11-18T03:00:00Z', endsAt: '2026-11-18T05:00:00Z', createdBy: 'x', comment: '', updatedAt: '2026-11-18T03:00:00Z' },
  { id: 's-expired', status: { state: 'expired' }, matchers: [{ name: 'alertname', value: 'HighErrorRate', isRegex: false, isEqual: true }], startsAt: '2026-11-17T00:00:00Z', endsAt: '2026-11-17T01:00:00Z', createdBy: 'x', comment: '', updatedAt: '2026-11-17T00:00:00Z' }];
const AM_CONFIG = `global:
  resolve_timeout: 5m
  slack_api_url: https://hooks.slack.example/services/T000/B000/XXXXSECRET
  smtp_auth_password: hunter2
route:
  receiver: default
  group_by: [alertname, namespace]
  routes:
    - receiver: pay-oncall
      matchers: ['namespace="pay"', 'severity=~"critical|warning"']
      continue: true
    - receiver: 'null'
      match: { alertname: Watchdog }
receivers:
  - name: default
    email_configs: [{ to: 'team@example.com', auth_password: hunter2 }]
  - name: pay-oncall
    slack_configs: [{ channel: '#pay', api_url: 'https://hooks.slack.example/services/T1/B1/ZZZZ' }]
    webhook_configs: [{ url: 'http://user:pw@pager.internal/hook' }]
  - name: 'null'
inhibit_rules:
  - source_matchers: ['severity="critical"']
    target_matchers: ['severity="warning"']
    equal: [namespace, alertname]
`;
const PROJECTS = { items: [
  { metadata: { name: 'payments', namespace: 'argocd' }, spec: { syncWindows: [
    { kind: 'deny', schedule: '0 3 * * *', duration: '1h', applications: ['pay-*'], manualSync: true, timeZone: 'UTC' },
    { kind: 'allow', schedule: '0 22 * * 1-5', duration: '2h', namespaces: ['pay'], timeZone: 'UTC' }] } },
  { metadata: { name: 'default', namespace: 'argocd' }, spec: {} }] };
const APPS = { items: [
  { metadata: { name: 'pay-api', namespace: 'argocd' }, spec: { project: 'payments', destination: { namespace: 'pay', server: 'https://kubernetes.default.svc' } } },
  { metadata: { name: 'shop-web', namespace: 'argocd' }, spec: { project: 'default', destination: { namespace: 'shop' } } }] };
const APPSETS = { items: [{ metadata: { name: 'pay-envs', namespace: 'argocd' }, spec: { generators: [{ list: {} }], template: { spec: { project: 'payments' } } } }] };
const DASHBOARDS = [
  { uid: 'pay-1', title: 'Payments API', url: '/d/pay-1/payments-api', tags: ['pay', 'slo'], folderTitle: 'Payments', type: 'dash-db' },
  { uid: 'node-1', title: 'Node exporter', url: '/d/node-1/node', tags: ['infra'], folderTitle: 'Infra', type: 'dash-db' }];

/** 가짜 서버: 경로마다 응답(JSON). 받은 요청은 seen에 */
async function fakeServer(t, routes) {
  const seen = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x'); seen.push({ path: url.pathname, query: url.searchParams, auth: req.headers.authorization ?? null });
    const route = routes[url.pathname];
    const answer = typeof route === 'function' ? route(url) : route;
    if (answer === undefined) { res.writeHead(404).end('{}'); return; }
    const [status, body] = Array.isArray(answer) && typeof answer[0] === 'number' ? answer : [200, answer];
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { base: `http://127.0.0.1:${server.address().port}`, seen };
}
/* reads/index.cjs의 tool()과 같은 해석: Prometheus는 { status, data }의 data, Alertmanager·Grafana는 본문 그대로, 2xx 밖은 상태로 */
const getter = base => async (_id, kind, route, params = {}) => {
  const qs = new URLSearchParams(); for (const [k, v] of Object.entries(params)) for (const x of [].concat(v)) qs.append(k, x);
  const r = await fetch(`${base}${route}${[...qs].length ? `?${qs}` : ''}`);
  if (r.status !== 200) throw Object.assign(new Error(`http ${r.status}`), { status: r.status, kind: r.status === 403 ? 'forbidden' : `http_${r.status}`, source: kind });
  const body = await r.json();
  if (kind === 'prometheus') { if (body.status !== 'success') throw Object.assign(new Error('query'), { kind: 'query_failed' }); return body.data; }
  return body;
};
const kubeGetter = base => async (_id, route) => { const r = await fetch(base + route); if (r.status !== 200) throw Object.assign(new Error(`kube ${r.status}`), { status: r.status }); return r.json(); };

async function fixture(t, over = {}) {
  const prom = await fakeServer(t, { '/api/v1/rules': { status: 'success', data: RULES }, ...over.prom });
  const am = await fakeServer(t, { '/api/v2/silences': SILENCES, '/api/v2/status': { config: { original: AM_CONFIG } }, '/api/v2/alerts': [{ labels: { alertname: 'HighErrorRate', namespace: 'pay', severity: 'critical' }, status: { state: 'suppressed', silencedBy: ['s-active'] } }], ...over.am });
  const kube = await fakeServer(t, { '/apis/argoproj.io/v1alpha1/appprojects': PROJECTS, '/apis/argoproj.io/v1alpha1/applications': APPS, '/apis/argoproj.io/v1alpha1/applicationsets': APPSETS, ...over.kube });
  const graf = await fakeServer(t, { '/api/search': url => DASHBOARDS.filter(d => (!url.searchParams.get('query') || d.title.toLowerCase().includes(url.searchParams.get('query').toLowerCase())) && url.searchParams.getAll('tag').every(tag => d.tags.includes(tag))), ...over.graf });
  const bases = { prometheus: prom.base, alertmanager: am.base, grafana: graf.base };
  const tool = (id, kind, route, params) => getter(bases[kind])(id, kind, route, params);
  return { tool, kube: kubeGetter(kube.base), seen: { prom: prom.seen, am: am.seen, kube: kube.seen, graf: graf.seen } };
}

test('prometheus_rules_reader_reads_rule_groups_with_expression_reference_and_stable_hash', async t => {
  const f = await fixture(t);
  const items = createToolItems({ tool: f.tool, kube: f.kube, now: () => NOW });
  const all = await items.rules('c1');
  assert.deepEqual(all.items.map(r => [r.type, r.group, r.name]), [['alert', 'payments.rules', 'HighErrorRate'], ['record', 'payments.rules', 'pay:requests:rate5m'], ['alert', 'node.rules', 'NodeDown']]);
  const high = all.items[0];
  assert.match(high.expr, /code=~"5\.\."/);
  assert.equal(high.for, 300);
  assert.equal(high.firing, 1);
  assert.deepEqual(high.ref, { tool: 'prometheus', kind: 'rule', id: 'payments.rules|HighErrorRate', file: '/etc/prometheus/rules/payments.yaml' });
  assert.match(high.hash, /^[0-9a-f]{64}$/);
  assert.equal((await items.rules('c1')).items[0].hash, high.hash, 'the same rule hashes the same');
  assert.equal(all.items[2].lastError, 'boom');
  const one = await items.rules('c1', { name: 'HighErrorRate', type: 'alert' });
  assert.deepEqual(one.items.map(r => r.name), ['HighErrorRate']);
  const q = f.seen.prom.at(-1).query;
  assert.equal(q.get('type'), 'alert');
  assert.deepEqual(q.getAll('rule_name[]'), ['HighErrorRate'], 'the server filters by rule name where it can');
  const ns = await items.rules('c1', { namespace: 'pay' });
  assert.deepEqual(ns.items.map(r => r.name), ['HighErrorRate', 'pay:requests:rate5m'], 'namespace keeps rules that select or fire in it');
});

test('prometheus_rules_reader_passes_on_the_source_failure', async t => {
  const f = await fixture(t, { prom: { '/api/v1/rules': [403, {}] } });
  const items = createToolItems({ tool: f.tool, kube: f.kube, now: () => NOW });
  await assert.rejects(items.rules('c1'), e => e.kind === 'forbidden');
});

test('silences_reader_returns_active_and_pending_silences_and_matches_alert_labels', async t => {
  const f = await fixture(t);
  const items = createToolItems({ tool: f.tool, kube: f.kube, now: () => NOW });
  const r = await items.silences('c1');
  assert.deepEqual(r.items.map(s => s.id), ['s-active', 's-other-ns', 's-not'], 'expired silences are left out by default');
  assert.equal(r.items[0].matchers, 'alertname="HighErrorRate", namespace=~"pa.*"');
  assert.deepEqual(r.items[0].ref, { tool: 'alertmanager', kind: 'silence', id: 's-active' });
  const forAlert = await items.silences('c1', { labels: { alertname: 'HighErrorRate', namespace: 'pay', severity: 'critical' } });
  assert.deepEqual(forAlert.items.map(s => s.id), ['s-active'], 'regex matcher matches; a != matcher on the same value does not');
  const byNs = await items.silences('c1', { namespace: 'pay' });
  assert.deepEqual(byNs.items.map(s => s.id), ['s-active', 's-not']);
  assert.equal((await items.silences('c1', { state: 'all' })).items.length, 4);
  assert.equal(silenceMatches({ matchers: [{ name: 'pod', value: '', isRegex: false, isEqual: true }] }, { alertname: 'x' }), true, 'an empty value matches a missing label');
});

test('routing_reader_keeps_routes_receivers_and_inhibitions_but_no_url_or_secret', async t => {
  const f = await fixture(t);
  const items = createToolItems({ tool: f.tool, kube: f.kube, now: () => NOW });
  const r = await items.routing('c1');
  const text = JSON.stringify(r);
  for (const leak of ['hooks.slack', 'XXXXSECRET', 'hunter2', 'pager.internal', 'team@example.com', 'pw@']) assert.ok(!text.includes(leak), `no ${leak}`);
  assert.deepEqual(r.receivers, [{ name: 'default', integrations: { email: 1 } }, { name: 'pay-oncall', integrations: { slack: 1, webhook: 1 } }, { name: 'null', integrations: {} }]);
  assert.equal(r.route.receiver, 'default');
  assert.deepEqual(r.route.routes[0], { receiver: 'pay-oncall', matchers: ['namespace="pay"', 'severity=~"critical|warning"'], groupBy: [], continue: true, routes: [] });
  assert.deepEqual(r.route.routes[1].matchers, ['alertname="Watchdog"']);
  assert.deepEqual(r.inhibitRules, [{ source: ['severity="critical"'], target: ['severity="warning"'], equal: ['namespace', 'alertname'] }]);
  assert.deepEqual(items.receiversFor(r, { alertname: 'HighErrorRate', namespace: 'pay', severity: 'critical' }), ['pay-oncall'], 'a matched child replaces the parent receiver');
  assert.deepEqual(items.receiversFor(r, { alertname: 'Watchdog', namespace: 'pay', severity: 'warning' }), ['pay-oncall', 'null'], 'continue: true keeps checking the next sibling');
  assert.deepEqual(items.receiversFor(r, { alertname: 'X', namespace: 'shop' }), ['default'], 'no child matched: the root receiver');
  assert.match(r.hash, /^[0-9a-f]{64}$/);
});

test('sync_windows_reader_reads_projects_through_kubernetes_and_tells_which_apps_are_blocked_now', async t => {
  const f = await fixture(t);
  const items = createToolItems({ tool: f.tool, kube: f.kube, now: () => NOW });
  const r = await items.syncWindows('c1');
  const pay = r.projects.find(p => p.name === 'payments');
  assert.deepEqual(pay.windows.map(w => [w.kind, w.active]), [['deny', true], ['allow', false]], '03:30 UTC is inside 03:00 + 1h');
  assert.deepEqual(r.blocked, [{ app: 'pay-api', namespace: 'argocd', project: 'payments', window: 0, kind: 'deny', manualSync: true }]);
  assert.deepEqual(r.applicationSets, [{ name: 'pay-envs', namespace: 'argocd', project: 'payments', generators: ['list'], ref: { tool: 'argocd', kind: 'applicationset', id: 'argocd/pay-envs' } }]);
  const only = await items.syncWindows('c1', { app: 'shop-web' });
  assert.deepEqual(only.blocked, [], 'an app outside every window is not blocked');
  assert.equal(windowActive({ schedule: '0 22 * * 1-5', duration: '2h', timeZone: 'UTC' }, Date.parse('2026-11-18T23:59:00Z')), true, 'Wednesday 22:00 + 2h');
  assert.equal(windowActive({ schedule: '0 22 * * 1-5', duration: '2h', timeZone: 'UTC' }, Date.parse('2026-11-22T23:00:00Z')), false, 'Sunday is outside 1-5');
  assert.equal(windowActive({ schedule: '*/15 * * * *', duration: '5m', timeZone: 'UTC' }, Date.parse('2026-11-18T03:47:00Z')), true);
  assert.equal(windowActive({ schedule: '*/15 * * * *', duration: '5m', timeZone: 'UTC' }, Date.parse('2026-11-18T03:51:00Z')), false);
  assert.equal(windowActive({ schedule: '0 12 * * *', duration: '1h', timeZone: 'Asia/Seoul' }, Date.parse('2026-11-18T03:30:00Z')), true, '12:30 in Seoul');
});

test('sync_windows_reader_without_argo_cd_is_unconfigured', async t => {
  const f = await fixture(t, { kube: { '/apis/argoproj.io/v1alpha1/appprojects': [404, {}] } });
  const items = createToolItems({ tool: f.tool, kube: f.kube, now: () => NOW });
  await assert.rejects(items.syncWindows('c1'), e => e.kind === 'unconfigured');
});

test('grafana_dashboard_search_reads_the_search_api_and_is_unconfigured_without_a_grafana_reader', async t => {
  const f = await fixture(t);
  const items = createToolItems({ tool: f.tool, kube: f.kube, grafana: true, now: () => NOW });
  const r = await items.dashboards('c1', { query: 'pay' });
  assert.deepEqual(r.items, [{ uid: 'pay-1', title: 'Payments API', folder: 'Payments', tags: ['pay', 'slo'], path: '/d/pay-1/payments-api', ref: { tool: 'grafana', kind: 'dashboard', id: 'pay-1' } }]);
  assert.equal(f.seen.graf.at(-1).query.get('type'), 'dash-db');
  assert.deepEqual((await items.dashboards('c1', { tags: ['infra'] })).items.map(d => d.uid), ['node-1']);
  const off = createToolItems({ tool: f.tool, kube: f.kube, now: () => NOW });
  await assert.rejects(off.dashboards('c1', {}), e => e.kind === 'unconfigured' && e.source === 'grafana');
});

test('a_refreshed_catalogue_stores_only_references_and_hashes', async t => {
  const f = await fixture(t);
  const store = createHubStore({ userData: fs.mkdtempSync(path.join(os.tmpdir(), 'wake-items-')), maskText, now: () => NOW });
  const items = createToolItems({ tool: f.tool, kube: f.kube, store, now: () => NOW });
  const read = await items.rules('c1');
  const saved = store.docs('tool-catalog').get('c1|prometheus|rule');
  assert.equal(saved.items.length, 3);
  assert.deepEqual(Object.keys(saved.items[0]).sort(), ['hash', 'id', 'name']);
  assert.ok(!JSON.stringify(saved).includes('http_requests_total'), 'no rule body in the catalogue');
  assert.equal(items.changed('c1', read.items[0].ref, read.items[0].hash), false);
  assert.equal(items.changed('c1', read.items[0].ref, 'other'), true);
});

/* 허브 도구 층: 같은 검사·범위·가림·감사 경로 */
function layer(f) {
  const store = createHubStore({ userData: fs.mkdtempSync(path.join(os.tmpdir(), 'wake-items-hub-')), maskText });
  const sources = { tool: f.tool, kube: f.kube, state: () => [], sourceState: (_id, source) => ({ id: source, state: 'ready', last: 1 }), list: async () => [], get: async () => null, promRange: async () => [] };
  const hub = { get: () => null, rows: () => [], scan: async () => null };
  return { store, tools: createToolLayer({ sources, hub, store, approvals: {}, screen: {}, contexts: () => ['c1'], report: async () => ({}) }) };
}
const external = scope => ({ transport: 'mcp', requester: { kind: 'external', name: 'cli' }, client: 'cli', scope });

test('tool_items_are_hub_tools_with_the_same_check_scope_mask_and_audit', async t => {
  const f = await fixture(t);
  const { tools, store } = layer(f);
  const names = tools.list().map(x => x.name);
  for (const n of ['list_alert_rules', 'list_silences', 'get_alert_routing', 'list_sync_windows', 'search_dashboards']) assert.ok(names.includes(n), n);
  assert.ok(tools.list().filter(x => names.includes(x.name) && x.name !== 'propose_action').every(x => x.readOnly));
  const rules = await tools.call('list_alert_rules', { cluster: 'c1', name: 'HighErrorRate' }, external({ cluster: 'c1' }));
  assert.equal(rules.result.items[0].name, 'HighErrorRate');
  assert.equal(rules.source.id, 'prometheus');
  const sil = await tools.call('list_silences', { cluster: 'c1' }, external({ cluster: 'c1' }));
  assert.equal(sil.result.items[0].comment, 'deploy window, password=••••', 'results are masked');
  assert.ok(sil.masked >= 1);
  const scoped = await tools.call('list_silences', { cluster: 'c1', namespace: 'kube-system' }, external({ cluster: 'c1', namespaces: ['pay'] }));
  assert.equal(scoped.error, 'out_of_scope');
  const wide = await tools.call('list_alert_rules', { cluster: 'c1' }, external({ cluster: 'c1', namespaces: ['pay'] }));
  assert.equal(wide.error, 'out_of_scope', 'a namespace-scoped client must name its namespace');
  const off = await tools.call('search_dashboards', { cluster: 'c1' }, external({ cluster: 'c1' }));
  assert.equal(off.error, 'unconfigured');
  const bad = await tools.call('list_silences', { cluster: 'c1', extra: 1 }, external({ cluster: 'c1' }));
  assert.equal(bad.error, 'invalid_request');
  assert.deepEqual(store.log('audit').list().map(r => [r.tool, r.result]), [['list_alert_rules', 'ok'], ['list_silences', 'ok'], ['list_silences', 'forbidden'], ['list_alert_rules', 'forbidden'], ['search_dashboards', 'failed'], ['list_silences', 'failed']]);
});

test('an_audit_row_whose_arguments_would_be_refused_is_kept_without_them', async t => {
  const f = await fixture(t);
  const { tools, store } = layer(f);
  const screen = { get: async () => ({}), set: async () => ({ applied: [] }) };
  const l = createToolLayer({ sources: { sourceState: () => null }, hub: {}, store, approvals: {}, screen, contexts: () => [], report: async () => ({}) });
  const ai = { transport: 'desktop', requester: { kind: 'ai', name: 'Wake' }, permission: 'read', scope: { cluster: 'c1' } };
  const r = await l.call('set_screen_state', { tab: 't', patch: { password: 'hunter2' } }, ai);
  assert.ok(!r.error);
  const row = store.log('audit').list().at(-1);
  assert.equal(row.tool, 'set_screen_state');
  assert.deepEqual(row.args, { refused: 'never_store' });
  void tools;
});

/* 인시던트 근거: 울린 알림의 규칙 식과 그 알림에 걸린 무음을 근거 조각으로 고정 */
function alertHub(f, over = {}) {
  const docs = seed => { const m = new Map(Object.entries(seed)); return { get: id => m.get(id) ?? null, all: () => [...m.values()], put: (id, v) => { m.set(id, { ...v, id }); return m.get(id); }, remove: id => m.delete(id), prune: () => 0 }; };
  const inc = { id: 'i1', number: 'INC-0001', cluster: 'c1', key: 'k', target: { kind: 'Deployment', name: 'pay-api', namespace: 'pay', uid: 'd1' }, reasons: { HighErrorRate: 1 }, severity: 'critical', rule: 'alert',
    alert: { name: 'HighErrorRate', source: 'Alertmanager' }, detectedAt: NOW - 600_000, lastSignalAt: NOW - 600_000, phase: 'open', signals: [], ...over.inc };
  const deployment = { kind: 'Deployment', metadata: { name: 'pay-api', namespace: 'pay', uid: 'd1' }, spec: { replicas: 1, template: { metadata: { labels: {} }, spec: { containers: [{ name: 'app' }] } } }, status: {} };
  const sources = { tool: f.tool, kube: async (id, route) => (route.includes('configmaps') ? { items: [] } : f.kube(id, route)), alerts: async () => [], get: async () => deployment, promRange: async () => [], sourceState: (_id, s) => ({ id: s, state: 'ready' }), state: () => [],
    list: async () => [] };
  const sets = { incidents: docs({ i1: inc }), meta: docs({}) }, logs = {};
  const store = { docs: name => (sets[name] ??= docs({})), log: name => (logs[name] ??= (() => { const rows = []; return { list: fn => rows.filter(fn ?? (() => true)), append: v => { rows.push(v); return v; }, prune: () => 0 }; })()) };
  return { hub: createIncidentHub({ store, sources, now: () => NOW, user: () => 'tester' }), incident: () => sets.incidents.get('i1') };
}

test('an_alert_incident_freezes_the_firing_rule_expression_and_its_active_silences_as_evidence', async t => {
  const f = await fixture(t);
  const { hub } = alertHub(f);
  const w = await hub.workspace({ cluster: 'c1', id: 'i1' });
  const rule = w.evidence.find(e => e.role === 'rule');
  assert.ok(rule, 'the rule expression is evidence');
  assert.equal(rule.source, 'prometheus');
  assert.equal(rule.kind, 'object', 'shown with the existing object view');
  assert.deepEqual(rule.target, { kind: 'PrometheusRule', namespace: 'pay', name: 'HighErrorRate' });
  assert.match(rule.result.object, /code=~"5\.\."/);
  assert.equal(rule.ref.id, 'payments.rules|HighErrorRate');
  assert.match(rule.ref.hash, /^[0-9a-f]{64}$/);
  const silences = w.evidence.find(e => e.role === 'silences');
  assert.ok(silences, 'active silences are evidence');
  assert.equal(silences.source, 'alertmanager');
  assert.deepEqual(silences.result.rows.map(s => s.id), ['s-active']);
  assert.equal(silences.total, 1);
  const pods = w.chain.cells.observe.filter(o => o.text.$t === 'wake.inc.obs.restarts');
  assert.equal(pods.length, 0, 'rule and silence pieces are not counted as Pod objects');
});

test('an_incident_without_an_alert_freezes_namespace_wide_silences_only_and_no_rule', async t => {
  const f = await fixture(t);
  const { hub } = alertHub(f, { inc: { alert: null, reasons: { CrashLoopBackOff: 1 }, rule: 'crash-loop' } });
  const w = await hub.workspace({ cluster: 'c1', id: 'i1' });
  assert.equal(w.evidence.find(e => e.role === 'rule'), undefined);
  assert.deepEqual(w.evidence.find(e => e.role === 'silences')?.result.rows.map(s => s.id) ?? [], [], 'no silence names only namespace=pay without other labels');
});

test('an_unreachable_rule_source_is_an_evidence_failure_not_a_piece', async t => {
  const f = await fixture(t, { prom: { '/api/v1/rules': [503, {}] } });
  const { hub, incident } = alertHub(f);
  const w = await hub.workspace({ cluster: 'c1', id: 'i1' });
  assert.equal(w.evidence.find(e => e.role === 'rule'), undefined);
  assert.equal(w.evidenceFailures.find(x => x.kind === 'rule')?.reason, 'http_503');
  assert.notEqual(incident().collectedPhase, 'open');
});
