/* GitOps · 알림 · 네트워크 화면(목록과 상세 칸): 이 파일 안의 합성 응답으로 그리고, 출처가 없거나 끊기거나 읽기가 실패하면 지금 값으로 보이지 않는지 본다 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import config from '../app.config.js';
import { unconnected } from '../data/index.js';
import { extendIcons, extendGlyphs } from '../../../kit/index.js';
import { alertList } from '../data/alerts.js';
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
extendGlyphs(config.icons.glyphs); extendIcons(config.icons.map);
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

/* 테스트 전용 합성 응답(이 파일 안에만 있음). 클러스터 fixture-context, 기준 시각은 테스트 실행 시각 */
const C_ID = 'fixture-context', NOW = Date.now(), iso = ms => new Date(ms).toISOString(), MIN = 60_000, HOUR = 60 * MIN;
const sync = (name, i, state = 'succeeded', by = 'automated') => ({ key: `deploy:${name}:${i}`, stage: 'apply', revision: [`${name}${i}`.padEnd(40, '0')], at: iso(NOW - (i + 1) * 5 * HOUR), state, source: state === 'failed' ? 'status.operationState' : 'status.history', by });
const managed = (kind, name, sync = 'Synced', health = 'Healthy') => ({ name, namespace: 'payments', group: kind === 'Service' ? '' : 'apps', version: 'v1', kind, uid: `uid-${name}`, sync, health });
const GITOPS = { at: iso(NOW), access: 'ok', controllers: { [C_ID]: [{ kind: 'argocd', ns: 'argocd', version: 'v2.13.3' }] }, repos: [{ id: 'gitops', name: 'fixture-org/gitops', url: 'https://example.invalid/fixture-org/gitops', branch: 'main', commit: 'a3f9c21e8b', apps: [
  { name: 'checkout', kind: 'Application', controller: 'argocd', cluster: C_ID, ns: 'payments', path: 'apps/checkout', sync: 'Synced', health: 'Healthy', auto: true, revision: 'checkout0'.padEnd(40, '0'),
    deployment: { history: [sync('checkout', 0), sync('checkout', 1, 'succeeded', 'fixture.user')], resources: { items: [managed('Deployment', 'checkout-api'), managed('Service', 'checkout-api')] } } },
  { name: 'billing', kind: 'Application', controller: 'argocd', cluster: C_ID, ns: 'payments', path: 'apps/billing', sync: 'OutOfSync', health: 'Degraded', auto: false, revision: 'billing0'.padEnd(40, '0'),
    diffState: 'available', diffFiles: [{ file: 'deployment.yaml', kind: 'Deployment', name: 'billing-api', ns: 'payments', change: 'M', live: 'image: registry.local/billing-api:1.8.0\n', git: 'image: registry.local/billing-api:1.8.1\n' }],
    deployment: { history: [sync('billing', 0, 'failed'), sync('billing', 1)], resources: { items: [managed('Deployment', 'billing-api', 'OutOfSync', 'Degraded')] } } },
] }] };
const DEPLOYMENTS = [{ name: 'checkout-api', ns: 'payments', status: ['warn', 'Progressing'], ready: 2, desired: 3, conditions: [{ type: 'Available', status: 'False', reason: 'MinimumReplicasUnavailable' }] },
  { name: 'billing-api', ns: 'payments', status: ['danger', 'Unavailable'], ready: 0, desired: 1, conditions: [{ type: 'Available', status: 'False', reason: 'MinimumReplicasUnavailable' }] }];
const PODS = ['p4x2m', 'd9m2p', 'b8k5n'].map((x, i) => ({ name: `checkout-api-7cf98-${x}`, ns: 'payments', status: i ? ['ok', 'Running'] : ['danger', 'CrashLoopBackOff'], owner: { kind: 'ReplicaSet', name: 'checkout-api-7cf98' } }));
const RULES = { status: 'success', data: { groups: [{ name: 'kubernetes-apps', file: '/rules/apps.yaml', rules: [
  { type: 'alerting', name: 'KubePodCrashLooping', query: 'increase(kube_pod_container_status_restarts_total[10m]) >= 1', duration: 900, labels: { severity: 'warning' },
    annotations: { summary: 'Pod is crash looping', runbook_url: 'https://example.invalid/runbooks/crashloop' },
    alerts: [{ labels: { namespace: 'payments', pod: 'checkout-api-p4x2m' }, state: 'firing', activeAt: iso(NOW - 40 * MIN), value: '3' }, { labels: { namespace: 'payments', pod: 'billing-api-b9j5n' }, state: 'pending', activeAt: iso(NOW - 4 * MIN), value: '1' }] }] }] } };
const ALERTMANAGER = [{ fingerprint: 'fp-crash', labels: { alertname: 'KubePodCrashLooping', severity: 'warning', namespace: 'payments', pod: 'checkout-api-p4x2m' }, annotations: {}, startsAt: iso(NOW - 40 * MIN), status: { state: 'active', silencedBy: [] }, receivers: [{ name: 'oncall' }] }];
const ALERTS = { at: iso(NOW), rules: RULES, alertmanager: ALERTMANAGER, history: [] };
const FIXTURE = {
  cluster: async () => ({ id: C_ID, state: 'ok' }),
  gitops: async () => structuredClone(GITOPS),
  resources: async p => structuredClone(p.kind === 'deployments' ? DEPLOYMENTS : p.kind === 'pods' ? PODS : []),
  clusterTools: async () => [{ kind: 'argocd', state: 'ok', last: iso(NOW - 47 * MIN) }, { kind: 'prometheus', state: 'ok' }, { kind: 'alertmanager', state: 'found', ready: 0, last: iso(NOW - 12 * MIN) }],
  alerts: async () => structuredClone(ALERTS),
};
const LIVE = { [`${C_ID}-argocd`]: { state: 'needs-perm', last: iso(NOW - 47 * MIN) }, [`${C_ID}-prometheus`]: { state: 'connected', last: iso(NOW - MIN) } };

async function pageOf(file) {
  let create;
  globalThis.captureSignalPage = (_, c) => { create = c; };
  const source = (await readFile(new URL(file, import.meta.url), 'utf8'))
    .replaceAll(/from '([^']+)'/g, (_, path) => `from '${new URL(path, import.meta.url).href}'`).replace('bootPage(config,', 'globalThis.captureSignalPage(config,');
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  delete globalThis.captureSignalPage;
  return async ({ params, query = {}, override = {}, state: initial = {} }) => {
    const data = { get: (key, p) => (Object.hasOwn(override, key) ? override[key](p) : FIXTURE[key] ? FIXTURE[key](p) : Promise.reject(unconnected(key))) };
    const navigated = [];
    let page, state = {};
    const ctx = { params: { cluster: C_ID, ...params }, query, data, t: (key, vars) => (vars ? `${key}${JSON.stringify(vars)}` : key), update() {}, settings: () => ({ 'wake.conn.live': LIVE }), desktopInfo: () => null,
      state: () => state, setState: patch => { state = { ...state, ...patch }; }, api: { navigate: (address, o) => navigated.push([address, o?.presentation ?? '']), setMeta() {} } };
    page = await create(ctx);
    state = { ...(page.screen?.state ?? {}), ...initial };
    await page.init?.(); await settle();
    return { page, ctx, navigated, html: () => String(page.render().s ?? page.render()) };
  };
}
const gitops = await pageOf('./gitops.js'), gitopsDetail = await pageOf('./gitops-detail.js');
const alerts = await pageOf('./alerts.js'), alertDetail = await pageOf('./alert-detail.js'), network = await pageOf('./network.js');

test('gitops_list_draws_a_broken_application_as_warning_and_no_card_for_the_unconnected_helm_source', async () => {
  const { html, page, navigated } = await gitops({});
  const s = html();
  for (const want of ['aria-label="Application"', 'data-id="wake-scope"']) assert.ok(s.includes(want), want);
  /* A-20: Kubernetes 객체(Application) 표의 머리는 리소스·이벤트 표와 같은 kubectl 말(영어)이다: 한 표 안에 이름·출처와 Sync·Health가 섞이지 않는다 */
  const heads = [...s.matchAll(/<th class="[^"]*"[^>]*>([^<]*)</g)].map(m => m[1]);
  assert.deepEqual(heads, ['Name', 'Source', 'Sync', 'Health', 'Revision', 'wake.col.lastSync', 'wake.col.syncs', 'wake.col.autoSync'], `one language in the Application table head: ${heads}`);
  /* Helm is not connected: no card, not a card that says so twice (the chip rule of 2026-11-15) */
  assert.ok(!s.includes('aria-label="wake.git.helm"') && !/wake\.view\.toolOff\{&quot;tool&quot;:&quot;Helm/.test(s), 'no Helm card for an unconnected source');
  /* checkout: Synced · Healthy in Argo, its Deployment checkout-api is Available False (N3) */
  const row = s.slice(s.indexOf('>checkout<'), s.indexOf('>checkout<') + 3000);
  assert.match(row, /sti-text warn[^>]*>[\s\S]{0,600}?Healthy<\/span>/, 'Healthy drawn in the warning colour');
  assert.match(s, /wake.view.toolPerm\{&quot;tool&quot;:&quot;Argo CD&quot;\} · wake.view.lastCollected/, 'Argo CD without permission says so with the last collection');
  page.actions['wake.git.open']({ arg: `${C_ID}/billing` });
  assert.deepEqual(navigated.at(-1), [`wake://cluster/${C_ID}/gitops/payments/Application/billing`, 'detail']);
});

/* C-19: Application 카드 머리의 Synced · OutOfSync 수는 표가 보이는 행(범위 글 · 알약을 지난 행)에서 센다: OutOfSync 알약에서 머리가 Synced 1을 세지 않는다 */
test('gitops_card_head_counts_the_rows_its_table_shows', async () => {
  const { html, page } = await gitops({});
  const head = () => { const s = html(); return { synced: /sbar-n">Synced<\/span><b[^>]*>(\d+)/.exec(s)?.[1], out: /sbar-n">OutOfSync<\/span><b[^>]*>(\d+)/.exec(s)?.[1] }; };
  assert.deepEqual(head(), { synced: '1', out: '1' });
  page.actions['wake.git.filter']({ arg: 'OutOfSync' });
  assert.deepEqual(head(), { synced: '0', out: '1' }, 'the head counts what the OutOfSync table shows');
});

test('gitops_read_failures_are_not_an_empty_success', async () => {
  for (const [error, want] of [[Object.assign(new Error('denied'), { status: 403 }), 'wake.home.permissionDenied'], [new Error('offline'), 'wake.gitops.readFailed'], [Object.assign(new Error('x'), { kind: 'unconfigured' }), 'wake.gitops.none']]) {
    const { html } = await gitops({ override: { gitops: () => Promise.reject(error) } });
    assert.match(html(), new RegExp(want.replaceAll('.', '\\.')));
    assert.doesNotMatch(html(), /aria-label="Application"/);
  }
  const { html } = await gitops({ override: { gitops: async () => ({ access: 'ok', repos: [], controllers: { [C_ID]: [{ kind: 'argocd' }] } }) } });
  assert.match(html(), /wake\.gitops\.noApps/);
});

test('a_real_cluster_whose_last_gitops_read_failed_shows_the_last_collection_not_now', async () => {
  let fail = false;
  const apps = { access: 'ok', controllers: {}, repos: [{ id: 'r', name: 'o/r', apps: [{ name: 'app', cluster: 'real', ns: 'n', controller: 'argocd', sync: 'Synced', health: 'Healthy' }] }] };
  const { html, page } = await gitops({ params: { cluster: 'real' }, override: { gitops: () => (fail ? Promise.reject(new Error('offline')) : Promise.resolve(structuredClone(apps))), resources: async () => [], clusterTools: async () => [] } });
  assert.match(html(), /aria-label="Application"/); assert.doesNotMatch(html(), /wake\.view\.k8sDown/);
  fail = true; await page.actions['wake.git.retry'](); await settle();
  assert.match(html(), /data-c="stale-line"[\s\S]*wake\.list\.stale · wake\.view\.lastCollected/);
});

test('application_detail_warns_about_the_owned_deployment_and_shows_the_read_diff', async () => {
  const checkout = await gitopsDetail({ params: { ns: 'payments', kind: 'Application', name: 'checkout' } });
  let s = checkout.html();
  assert.match(s, /Deployment checkout-api · MinimumReplicasUnavailable · Ready 2 · Desired 3/);
  for (const want of ['wake.git.syncHistory', 'data-c="change-timeline"', 'wake.git.resState', 'fixture.user']) assert.ok(s.includes(want), want);
  const billing = await gitopsDetail({ params: { ns: 'payments', kind: 'Application', name: 'billing' } });
  s = billing.html();
  assert.match(s, /data-c="file-tree"/); assert.match(s, /deployment\.yaml/); assert.match(s, /wake\.gitops\.dir/);
  assert.match(s, /billing-api:1\.8\.1/, 'Git side of the diff'); assert.match(s, /Failed/);
  const gone = await gitopsDetail({ params: { ns: 'payments', kind: 'Application', name: 'nope' } });
  assert.match(gone.html(), /wake\.git\.gone/);
});

/* A2-06: Argo CD API가 차이 읽기를 거절하면(401 토큰 거부) "파일 0"이 아니라 원인과 다시 시도, Argo CD 연결을 고치는 설정 길 */
test('application_diff_read_failure_names_the_cause_with_retry_and_settings_not_zero_files', async () => {
  const calls = [];
  let answer = { state: 'unauthorized' };
  globalThis.kitService = { call: async (name, args) => { calls.push(name); return name === 'gitops.diff' ? answer : null; }, on() {} };
  try {
    const app = { ...GITOPS.repos[0].apps[0], sourceIdentity: { name: 'checkout', namespace: 'argocd', uid: '00000000-0000-4000-8000-000000000001' } };
    const gitopsOf = () => ({ ...structuredClone(GITOPS), repos: [{ ...GITOPS.repos[0], apps: [app] }] });
    const tools = async () => [{ kind: 'argocd', state: 'ok', raw: { kind: 'argocd', bindingId: 'b1' } }];
    const { html, page } = await gitopsDetail({ params: { ns: 'payments', kind: 'Application', name: 'checkout' }, override: { gitops: async () => gitopsOf(), clusterTools: tools } });
    await settle();
    const s = html(), card = s.slice(s.indexOf('aria-label="wake.gitops.diff"'), s.indexOf('aria-label="wake.git.resState"') > 0 ? s.indexOf('aria-label="wake.git.resState"') : undefined);
    assert.ok(card.length > 30, 'the diff card is drawn');
    assert.doesNotMatch(card, /wake\.git\.files/, 'no file count for a diff that was not read');
    assert.match(card, /wake\.flow\.c\.unauthorized/, 'the cause');
    assert.match(card, /wake\.flow\.a\.retry/, 'a retry');
    assert.match(card, /wake:\/\/settings\/cluster-fixture-context/, 'the way to the Argo CD connection settings');
    answer = { state: 'available', files: [{ file: 'deployment.yaml', kind: 'Deployment', change: 'M', live: 'a\n', git: 'b\n' }] };
    await page.actions['wake.gd.diff'](); await settle();
    assert.match(html(), /data-c="file-tree"/, 'retry reads the diff again');
    assert.equal(calls.filter(n => n === 'gitops.diff').length, 2);
  } finally { delete globalThis.kitService; }
});

test('alerts_list_counts_states_from_one_list_and_marks_alertmanager_down', async () => {
  const { html, page, navigated } = await alerts({});
  const s = html();
  assert.match(s, /<span class="ph-sub"[^>]*>Alertmanager · /, 'one source in the subtitle, as the simulation');
  assert.match(s, /data-tabs="wake-section"[\s\S]*aria-selected="true" data-action="wake.view.section" data-arg="&quot;alerts&quot;"/, 'the section pill tabs mark this section');
  assert.match(s, /wake\.view\.toolDown\{&quot;tool&quot;:&quot;Alertmanager&quot;\} · wake\.view\.lastCollected/);
  const rows = alertList({ ...ALERTS });
  assert.equal(Number(/^\D*(\d+)/.exec(s.split('sbar-n">firing')[1])?.[1]), rows.filter(r => r.state === 'firing').length, 'the card head counts the same rows');
  page.actions['wake.al.open']({ arg: rows[0].id });
  assert.deepEqual(navigated.at(-1), [`wake://cluster/${C_ID}/alerts/${rows[0].id}`, 'detail']);
  const real = await alerts({ params: { cluster: 'real' }, override: { clusterTools: async () => [], alerts: () => Promise.reject(unconnected('alerts')) } });
  assert.match(real.html(), /wake\.view\.toolOff/);
});

test('alert_detail_reads_annotations_one_a_line_and_names_prometheus_for_the_expression', async () => {
  const a = alertList({ ...ALERTS }).find(x => x.state === 'firing');
  const { html } = await alertDetail({ params: { id: a.id } });
  const s = html();
  assert.match(s, /class="pg stack"/); assert.match(s, /runbook_url/);
  for (const want of ['wake.al.exprValue', 'wake.al.rule', 'wake.al.stateFlow', 'aria-label="Labels"', 'aria-label="Receivers"']) assert.ok(s.includes(want), want);
  assert.match(s, /increase\(kube_pod_container_status_restarts_total/);
  assert.match(s.slice(s.indexOf('wake.al.exprValue')), /wake\.view\.toolOff/, 'the expression chart says Prometheus range reads are not connected');
});

test('alert_detail_links_the_job_a_kube_state_metrics_alert_is_about_not_the_exporter_pod', async () => {
  /* R5-01: 목록의 대상 칸과 상세의 대상 링크가 같은 객체(실제 wake-lab KubeJobFailed 라벨) */
  const job = { fingerprint: 'fp-job', labels: { alertname: 'KubeJobFailed', severity: 'warning', condition: 'true', container: 'kube-state-metrics', endpoint: 'http', instance: '10.244.2.4:8080', job: 'kube-state-metrics',
    job_name: 'ledger-reconcile-29916145', namespace: 'orders', pod: 'kps-kube-state-metrics-654bf57f64-rhlqp', service: 'kps-kube-state-metrics' }, annotations: {}, startsAt: iso(NOW - 10 * MIN), status: { state: 'active', silencedBy: [] }, receivers: [] };
  const snap = { ...ALERTS, rules: { status: 'success', data: { groups: [] } }, alertmanager: [job] };
  const list = await alerts({ override: { alerts: async () => structuredClone(snap) } });
  assert.ok(list.html().includes('orders/ledger-reconcile-29916145'), 'the list target is the Job');
  assert.ok(!list.html().includes('orders/kps-kube-state-metrics'), 'not the exporter Pod');
  const { html } = await alertDetail({ params: { id: 'fp-job' }, override: { alerts: async () => structuredClone(snap) } });
  assert.ok(html().includes(`wake://cluster/${C_ID}/ns/orders/jobs/ledger-reconcile-29916145`), 'the detail links the Job');
  assert.ok(!html().includes('/pods/kps-kube-state-metrics'), 'and not the exporter Pod');
});

test('network_names_prometheus_until_the_hub_reads_series', async () => {
  const { html } = await network({});
  const s = html();
  assert.match(s, /wake\.view\.toolOff\{&quot;tool&quot;:&quot;Prometheus&quot;\}/); assert.doesNotMatch(s, /MiB\/s<\/b>/);
});
