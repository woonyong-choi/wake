/*
 * 샌키 그리기 범위 검수: kit flow-graph가 스스로 고르는 보기(전체 비례 / 문제 중심 / 문제 중심 + 묶음)를 잘못될 수 있는 상황마다 보인다.
 * 상황은 위쪽 선택에서 고른다. 상황마다 한 줄 설명과 규칙이 고른 보기(그려진 그래프에서 읽음)를 함께 쓴다. 살아 있는 상황은 3초마다 값이 바뀐다.
 * 홈 흐름과 요청 흐름은 시뮬레이션 자료(sim-world.js)를, 나머지는 같은 모양(namespace → 워크로드 → Pod 상태)의 만든 자료를 쓴다.
 */
import config from '../../apps/wake/app.config.js';
import { bootPage, components as C, html } from '../../kit/page/index.js';
import { world, podFlow, requestFlow, POD_STATE_WORDS } from '../sim/sim-world.js';
import { colourOf } from '../sim/sim-flows.js';

/* Pod 상태(kubectl 원문)와 그 색 */
const TONE = { Running: 'ok', Succeeded: 'idle', Pending: 'warn', ContainerCreating: 'busy', CrashLoopBackOff: 'fail', OOMKilled: 'fail', ImagePullBackOff: 'fail', Error: 'fail', Evicted: 'warn', Unknown: 'fail', Terminating: 'warn' };
const ICON = { ok: 'circle-check', idle: 'check', busy: 'clock' };
const SUMMARY = { 0: { label: '기타 namespace {k}개', icon: 'k8s-namespace' }, 1: { label: '기타 워크로드 {k}개', icon: 'k8s-deployment' }, 2: { label: 'Running {n}', icon: 'circle-check' } };
const FOLD = { label: '기타 {k}개', more: '외 {k}개' };

/** namespace → 워크로드 → Pod 상태. spec: [namespace, [[workload, { 상태: Pod 수 }]]][]; 문제 Pod가 있는 워크로드는 경고 이상 */
function cluster(spec) {
  const nodes = [], links = [], states = new Map();
  for (const [ns, wls] of spec) {
    nodes.push({ id: 'ns-' + ns, col: 0, value: wls.reduce((t, [, pods]) => t + Object.values(pods).reduce((u, v) => u + v, 0), 0), label: ns, icon: 'k8s-namespace', tone: 'soc' });
    for (const [wl, pods] of wls) {
      const total = Object.values(pods).reduce((t, v) => t + v, 0), worst = Object.keys(pods).filter(k => pods[k] > 0).map(k => TONE[k]).sort((a, b) => rank(b) - rank(a))[0] ?? 'ok';
      nodes.push({ id: 'w-' + ns + '/' + wl, col: 1, value: total, label: wl, icon: 'k8s-deployment', tone: 'other', state: worst === 'fail' ? 'fail' : worst === 'ok' || worst === 'idle' ? 'ok' : 'warn' });
      links.push({ from: 'ns-' + ns, to: 'w-' + ns + '/' + wl, value: total, text: total.toLocaleString() });
      for (const [st, n] of Object.entries(pods)) if (n > 0) { states.set(st, (states.get(st) ?? 0) + n); links.push({ from: 'w-' + ns + '/' + wl, to: 's-' + st, value: n, text: n.toLocaleString(), state: TONE[st] }); }
    }
  }
  for (const [st, n] of states) nodes.push({ id: 's-' + st, col: 2, value: n, label: st, icon: ICON[TONE[st]] ?? 'exclamation-triangle', state: TONE[st] });
  return { nodes, links };
}
const rank = s => ({ fail: 3, warn: 2, busy: 1 })[s] ?? 0;
/* namespace마다 실제 클러스터처럼 이름 붙은 워크로드 */
const WORKLOADS = {
  payments: ['payments-api', 'payments-worker', 'payments-ledger', 'payments-webhook', 'fraud-scorer'], orders: ['orders-api', 'orders-sync', 'orders-cron', 'order-events-consumer', 'invoice-renderer'],
  checkout: ['checkout-api', 'checkout-web', 'cart-service', 'promo-engine', 'tax-calculator'], search: ['search-indexer', 'search-api', 'query-suggester', 'synonym-loader', 'ranking-service'],
  'ml-serving': ['ml-feature-store', 'model-gateway', 'embedding-service', 'recommendation-api', 'feature-flags'], reports: ['reports-batch', 'report-exporter', 'dashboard-api', 'metrics-rollup', 'pdf-renderer'],
  web: ['web-frontend', 'web-bff', 'static-assets', 'image-resizer', 'sitemap-builder'], api: ['api-gateway', 'auth-service', 'rate-limiter', 'session-store', 'graphql-router'],
  data: ['etl-runner', 'etl-cache', 'cdc-connector', 'warehouse-loader', 'schema-registry'], identity: ['identity-api', 'token-issuer', 'mfa-service', 'user-directory', 'audit-writer'],
  notifications: ['email-sender', 'push-dispatcher', 'sms-gateway', 'template-renderer', 'digest-scheduler'], shipping: ['shipping-api', 'label-printer', 'carrier-sync', 'tracking-poller', 'rate-quoter'],
  inventory: ['inventory-api', 'stock-reconciler', 'warehouse-sync', 'reservation-service', 'sku-importer'], analytics: ['analytics-collector', 'session-aggregator', 'funnel-builder', 'event-router', 'clickstream-sink'],
  pricing: ['pricing-api', 'discount-engine', 'currency-rates', 'price-history', 'experiment-allocator'], batch: ['nightly-reindex', 'invoice-generator', 'log-compactor', 'backup-agent', 'thumbnail-builder', 'report-mailer', 'cache-warmer', 'data-retention', 'sitemap-export', 'feed-importer', 'usage-billing', 'audit-archiver'],
};
/** namespace의 정상 워크로드 n개(앞에서 skip개 건너뜀): Pod 수를 고르게 나눠 갖는다 */
const healthy = (ns, n, pods, skip = 0) => WORKLOADS[ns].slice(skip, skip + n).map((name, i) => [name, { Running: Math.floor(pods / n) + (i < pods % n ? 1 : 0) }]);

/** 시뮬레이션의 홈 흐름: 묶음 노드가 몇 개를 대신하는지(count)를 붙인다 */
function homeFlow() {
  const w = world('s7', -25), f = podFlow(w), nsRest = Number(/(\d+)개/.exec(f.nodes.find(n => n.id === 'ns-rest')?.label ?? '')?.[1] ?? 1);
  const troubled = f.nodes.filter(n => n.col === 1 && !n.rest).length;
  return { nodes: f.nodes.map(n => n.id === 'ns-rest' ? { ...n, count: nsRest } : n.id === 'w-ok' ? { ...n, count: w.workloads.length - troubled } : n), links: f.links };
}

const SCENARIOS = [
  { id: 'home', title: '1 지금 홈', desc: '정상 Pod 2,490개 옆에 문제 Pod 3개(조용한 날 시뮬레이션 자료). 한 비율로는 문제가 실선이 된다.', graphs: () => [['Pod 상태 흐름', homeFlow()]] },
  { id: 'small', title: '2 작은 클러스터', desc: 'Pod 40개, 문제 3개. 가장 작은 흐름도 한 비율로 4px을 넘고 열마다 노드가 7개 이하.',
    graphs: () => [['Pod 상태 흐름', cluster([['payments', [['payments-api', { Running: 8, CrashLoopBackOff: 1 }], ['payments-worker', { Running: 6 }]]], ['orders', [['orders-api', { Running: 10, Pending: 2 }], ['orders-cron', { Running: 4 }]]], ['web', [['web-frontend', { Running: 9 }]]]])]] },
  { id: 'many', title: '3 문제 많음', desc: '문제 Pod가 namespace 15개, 워크로드 40개에 퍼져 있고 정상 Pod 1,500개. 열마다 7개를 넘으면 큰 것 6개만 남기고 묶는다.',
    graphs: () => { const NS = ['payments', 'orders', 'checkout', 'search', 'ml-serving', 'reports', 'web', 'api', 'data', 'identity', 'notifications', 'shipping', 'inventory', 'analytics', 'pricing'], BAD = ['CrashLoopBackOff', 'Pending', 'ImagePullBackOff', 'OOMKilled'];
      return [['Pod 상태 흐름', cluster(NS.map((ns, i) => [ns, [...WORKLOADS[ns].slice(0, i < 10 ? 3 : 2).map((wl, j) => [wl, { Running: 20, [BAD[(i + j) % 4]]: 1 + ((i * 3 + j) % 5) }]), ...healthy(ns, 2, 60, 3)]]))]]; } },
  { id: 'skew', title: '4 문제끼리 95:1', desc: '문제 워크로드 하나는 CrashLoopBackOff 95개, 다른 하나는 Pending 1개. 문제만 그려도 비율이 넓다.',
    graphs: () => [['Pod 상태 흐름', cluster([['checkout', [['checkout-api', { Running: 5, CrashLoopBackOff: 95 }], ...healthy('checkout', 3, 300, 1)]], ['reports', [['reports-batch', { Running: 12, Pending: 1 }], ...healthy('reports', 2, 200, 1)]], ['web', healthy('web', 4, 300)]])]] },
  { id: 'states', title: '5 문제 상태 9가지', desc: 'CrashLoopBackOff, OOMKilled, ImagePullBackOff, Pending, Evicted, ContainerCreating, Error, Unknown, Terminating이 한꺼번에. 상태 열이 7개를 넘는다.',
    graphs: () => [['Pod 상태 흐름', cluster([['payments', [['payments-api', { Running: 30, CrashLoopBackOff: 4, OOMKilled: 2 }], ['payments-worker', { Running: 20, Error: 3 }]]], ['orders', [['orders-api', { Running: 25, ImagePullBackOff: 5 }], ['orders-sync', { Running: 10, Pending: 6 }]]], ['data', [['etl-runner', { Running: 8, Evicted: 3, ContainerCreating: 2 }], ['etl-cache', { Running: 6, Unknown: 2, Terminating: 4 }]]], ['web', healthy('web', 5, 1100)]])]] },
  { id: 'outage', title: '6 노드 장애', desc: 'batch namespace의 Pod 300개가 Unknown·Terminating(워크로드 12개). 다른 namespace는 정상 900개.',
    graphs: () => [['Pod 상태 흐름', cluster([['batch', WORKLOADS.batch.map((name, i) => [name, { Unknown: 15 + (i % 4) * 3, Terminating: 8 + (i % 3) * 2 }])], ['web', healthy('web', 3, 500)], ['api', healthy('api', 3, 400)]])]] },
  { id: 'edge', title: '7 경계 오가기', desc: '5xx가 3초마다 1.9 ↔ 2.3 req/s로 바뀌어 한 비율의 경계를 넘나든다. 여유(80%)가 있어 보기가 왔다 갔다 하지 않아야 한다.', live: true,
    graphs: t => { const e = t % 2 ? 2.3 : 1.9, ok = 230; return [['요청 흐름', { nodes: [{ id: 'ing', col: 0, value: ok + e, label: 'Ingress checkout', icon: 'k8s-ingress', tone: 'system' }, { id: 'p1', col: 1, value: ok + e, label: 'checkout-api', icon: 'k8s-pod', tone: 'other', state: 'warn' }, { id: 'ok', col: 2, value: ok, label: '2xx·3xx', icon: 'circle-check', state: 'ok' }, { id: 'err', col: 2, value: e, label: '5xx', icon: 'exclamation-triangle', state: 'fail' }],
      links: [{ from: 'ing', to: 'p1', value: ok + e, text: `${ok + e}/s` }, { from: 'p1', to: 'ok', value: ok, text: `${ok}/s` }, { from: 'p1', to: 'err', value: e, text: `${e}/s`, state: 'fail' }] }]]; } },
  { id: 'long', title: '8 긴 이름', desc: 'namespace·워크로드 이름이 40~60자(한글·영문). 이름은 잘리거나 겹치지 않고, 낱말 안에서 끊기지 않아야 한다. 1280 폭에서도.',
    graphs: () => [['Pod 상태 흐름', cluster([['customer-identity-verification-and-onboarding-platform', [['identity-document-ocr-verification-worker-deployment', { Running: 6, CrashLoopBackOff: 2 }], ['onboarding-notification-dispatcher', { Running: 5 }]]], ['결제-정산-배치-처리-네임스페이스-운영-환경-전용-공간', [['정산-리포트-생성-워커-장기-실행-배치-작업-디플로이먼트', { Running: 7, Pending: 1 }]]], ['web', [['web-frontend', { Running: 9 }]]]])]] },
  { id: 'live', title: '9 문제가 생기고 사라짐', desc: '3초마다 단계가 바뀐다: 문제 없음 → Pending 2 → CrashLoopBackOff 3 + Pending 2 → 일부 해소. 노드가 들고 나며 흔들리지 않아야 한다.', live: true,
    graphs: t => { const s = t % 4, a = [{ Running: 40 }, { Running: 38, Pending: 2 }, { Running: 35, CrashLoopBackOff: 3, Pending: 2 }, { Running: 38, CrashLoopBackOff: 2 }][s];
      return [['Pod 상태 흐름', cluster([['payments', [['payments-api', a], ...healthy('payments', 2, 300, 1)]], ['orders', healthy('orders', 3, 500)], ['web', healthy('web', 2, 400)]])]]; } },
  { id: 'req', title: '10 요청 흐름(5xx)', desc: '시나리오 3: checkout Pod 2개, 5xx 3%. 한 비율로 그릴 수 있는 범위.', graphs: () => [['요청 흐름', requestFlow(world('s3', 120, 'investigating'), 's3', 'investigating')]] },
  { id: 'lab', title: '12 작은 실제 클러스터', desc: 'Pod 40개, 문제 없음, namespace 9개·워크로드 26개(검수 클러스터와 같은 모양). 긴 워크로드 이름이 띠와 겹치지 않고, 띠 숫자는 교차하는 띠 위에 오지 않아야 한다.',
    graphs: () => [['Pod 상태 흐름', cluster([['kube-system', [['wake-lab-control-plane', { Running: 4 }], ['kube-proxy', { Running: 3 }], ['kindnet', { Running: 3 }], ['coredns', { Running: 2 }], ['local-path-provisioner', { Running: 1 }], ['metrics-server', { Running: 1 }], ['snapshot-controller', { Running: 1 }], ['csi-hostpath', { Running: 1 }], ['kube-state-metrics', { Running: 1 }]]],
      ['monitoring', [['kps-prometheus-node-exporter', { Running: 3 }], ['alloy', { Running: 2 }], ['kps-grafana', { Running: 1 }], ['kps-operator', { Running: 1 }], ['prometheus-kps', { Running: 1 }], ['alertmanager-kps', { Running: 1 }], ['loki', { Running: 1 }]]],
      ['payments', [['checkout-api', { Running: 1 }], ['payments-worker', { Running: 1 }], ['session-gateway', { Running: 1 }], ['ledger', { Running: 1 }]]], ['argocd', [['argocd-server', { Running: 1 }], ['argocd-repo-server', { Running: 1 }], ['argocd-application-controller', { Running: 1 }], ['argocd-redis', { Running: 1 }]]],
      ['orders', [['orders-api', { Running: 2 }], ['orders-worker', { Running: 2 }]]], ['gitops', [['gitea', { Running: 1 }]]], ['batch', [['nightly-report', { Succeeded: 2 }]]], ['default', [['smoke-check', { Succeeded: 1 }]]]])]] },
  { id: 'odd', title: '11 극단', desc: '노드 하나뿐이고 문제 없음 / 모든 Pod가 문제라 정상 노드가 없음.',
    graphs: () => [['노드 하나', { nodes: [{ id: 'ns-only', col: 0, value: 12, label: 'default', icon: 'k8s-namespace', tone: 'soc' }], links: [] }],
      ['모두 문제', cluster([['payments', [['payments-api', { CrashLoopBackOff: 6 }], ['payments-worker', { Pending: 3 }]]], ['orders', [['orders-api', { ImagePullBackOff: 4 }]]]])]] },
];

bootPage(config, async ctx => {
  const KEY = 'sankey-review:scenario';
  const st = { id: (() => { try { return localStorage.getItem(KEY) || 'home'; } catch { return 'home'; } })(), t: 0, views: {} };
  if (!SCENARIOS.some(s => s.id === st.id)) st.id = 'home';
  const sc = () => SCENARIOS.find(s => s.id === st.id);
  /* the graph as the kit takes it: values as the sizes of the bands (one unit per drawing), the order of the nodes as given; the kit lays it out and decides the view */
  const build = (key, label, f) => ({ mode: 'relation', visual: 'filledOutline', stack: true, stretch: true, fade: true, live: true, label, gid: 'sr-' + key, width: 920, height: 460, columns: [0, 380, 804], bar: 56,
    stateLabels: POD_STATE_WORDS, summary: SUMMARY, fold: FOLD,
    nodes: f.nodes.map((n, i) => ({ id: n.id, col: n.col, y: i, h: 0, label: n.label, ...(n.short ? { short: n.short } : {}), ...(n.sub ? { sub: n.sub } : {}), icon: n.icon, state: n.state || 'ok', ...colourOf(n.state || 'ok', n.tone),
      ...(n.rest ? { rest: true } : {}), ...(n.count ? { count: n.count } : {}), ...(n.reasons ? { reasons: n.reasons } : {}), hidden: !(n.value > 0) && f.links.every(l => l.from !== n.id && l.to !== n.id) && f.links.length > 0 })),
    links: f.links.map(l => ({ from: l.from, to: l.to, fromOffset: 0, toOffset: 0, size: l.value > 0 ? l.value : 0, value: l.value > 0 ? l.text ?? '' : '', state: l.state || 'ok', hidden: !(l.value > 0) })) });
  const VIEW = { full: '전체 비례', focus: '문제 중심', fold: '문제 중심 + 묶음' };

  /* the view each drawing settled on is read from the drawing (the kit decides it as it lays the graph out) */
  setInterval(() => {
    const seen = {};
    document.querySelectorAll('.sr-g .flow[data-flow]').forEach(el => { const k = el.closest('.sr-g').dataset.k; if (el._view) seen[k] = el._view === 'focus' && el._cur?.nodes.some(n => n.folded) ? 'fold' : el._view; });
    if (JSON.stringify(seen) !== JSON.stringify(st.views)) { st.views = seen; ctx.update(); }
  }, 400);
  setInterval(() => { if (sc().live) { st.t++; ctx.update(); } }, 3000);

  return {
    css: `body { background: var(--background); }
.sr { max-width: calc(var(--space-40) * 8); margin: 0 auto; padding: var(--space-6) var(--space-6) calc(var(--space-16) + var(--space-8)); display: grid; gap: var(--space-5); }
.sr-pick { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.sr-note { margin: 0; max-width: 90ch; font-size: var(--text-sm); line-height: var(--leading-sm); color: var(--muted-foreground); }
.sr-g { display: grid; gap: var(--space-2); min-width: 0; }
.sr-cap { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-3); align-items: center; font-size: var(--text-sm); }`,
    render: () => {
      const s = sc(), graphs = s.graphs(st.t);
      return html`<div class="sr">${C.pageHeader.render({ title: '샌키 그리기 범위', icon: 'chart-line', end: C.pillTabs.render({ id: 'sr-th', label: '테마', value: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', tabs: [{ id: 'dark', label: '어두운' }, { id: 'light', label: '밝은' }], action: 'sr.theme' }) })}
        <p class="sr-note">한 비율로 모든 띠가 4px 이상이고, 열마다 노드가 7개 이하이고, 이름이 들어가면 전체를 비례로 그린다. 아니면 상태가 있는 노드에 닿는 흐름만 그리고 나머지는 열마다 요약 노드 하나로 둔다. 그래도 넘치면 열마다 큰 것 6개만 남기고 묶는다. 띠 위 숫자와 툴팁은 늘 실제 값이다.</p>
        <div class="sr-pick">${C.pillTabs.render({ id: 'sr-sc', label: '상황', value: st.id, tabs: SCENARIOS.map(x => ({ id: x.id, label: x.title })), action: 'sr.pick' })}</div>
        <p class="sr-note">${s.desc}</p>
        ${graphs.map(([label, f], i) => { const key = `${s.id}-${i}`; return html`<div class="sr-g" data-k="${key}"><div class="sr-cap"><b>${label}</b>${C.badge.render({ label: `규칙이 고른 보기: ${VIEW[st.views[key]] ?? '…'}`, tone: st.views[key] === 'full' ? 'neutral' : 'warn', size: 'sm' })}${s.live ? C.badge.render({ label: `실시간 · 단계 ${st.t % 4 + 1}`, tone: 'neutral', size: 'sm' }) : ''}</div>${C.flowGraph.render(build(key, label, f))}</div>`; })}</div>`;
    },
    meta: () => ({ title: '샌키 그리기 범위', icon: 'chart-line' }),
    actions: {
      'sr.theme': a => { document.documentElement.dataset.theme = a.arg?.value ?? a.arg; ctx.update(); },
      'sr.pick': a => { st.id = a.arg?.value ?? a.arg; st.t = 0; st.views = {}; try { localStorage.setItem(KEY, st.id); } catch { /* storage unavailable */ } ctx.update(); },
      'p.flow-go': () => {}, 'go.summary': () => {},
    },
  };
});
