/*
 * 구성 요소 목록 화면: kit 구성 요소를 상태별로 모두 그리고, 아래쪽에서 동작(메뉴, 하위 메뉴, 선택 칸, 스위치, 탭, 접기, 툴팁, 스크롤)을 직접 해 본다.
 * Wake 정의(글자 사전, 아이콘 표, 표본 데이터)로 그린다. 화면은 구성 요소 조합으로만 만든다.
 */
import config from './apps/wake/app.config.js';
import { bootPage, components as C, html, raw, localizeMenu } from './kit/page/index.js';
import { status } from './apps/wake/pages/parts.js';
import { t as translate } from './kit/page/index.js';
/* 구성 요소 모음의 보기 자료(이 화면 전용, 앱은 읽지 않음) */
const CLUSTERS = [{ id: 'wake-sample', ctx: 'wake-sample', state: 'ok', kind: 'kind', where: 'wake-sample', version: 'v1.31.2', agent: true, perm: 'read', ns: 'payments' }];
const CONVERSATIONS = [
  { id: 'c-restart', title: 'checkout-api 재시작 원인', preview: 'p4x2m 컨테이너가 메모리 한도 256Mi에서 OOMKilled', time: '10:15' },
  { id: 'c-ready', title: 'billing-api 시작 실패', preview: 'PAYMENT_PROVIDER_URL 설정 누락, exitCode=1', time: '10:15' },
  { id: 'c-mem', title: 'payments namespace 메모리 사용량', preview: 'checkout-api Pod working set과 256Mi 한도 비교', time: '10:15' },
];
const TIMES = Array.from({ length: 13 }, (_, i) => new Date(Date.parse('2026-11-02T01:15:00.000Z') - (12 - i) * 5 * 60000).toISOString().slice(11, 16));
const METRICS = {
  cpu: [300, 310, 322, 318, 340, 352, 349, 371, 388, 395, 401, 409, 412],
  restarts: [0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 2, 1, 1],
  memory: { 'd9m2p': [198, 201, 204, 205, 207, 206, 208, 209, 210, 211, 210, 212, 211], 'b8k5n': [192, 195, 196, 199, 201, 202, 203, 204, 206, 205, 207, 208, 209], 'p4x2m': [180, 212, 236, 249, 256, 64, 190, 231, 252, 256, 72, 204, 241] },
};
const INCIDENTS = [{ id: 'inc-a' }, { id: 'inc-b' }, { id: 'inc-c' }];

/* gallery examples only: a traffic relation graph and the CPU, restart and memory chart cards */
/** 트래픽 흐름: Gateway -> Route -> Service -> Pod */
function trafficFlow(t = translate) {
  return {
    mode: 'relation', stack: true, live: true, label: t('wake.flow.relationScope'),
    width: 900, height: 300, columns: [0, 280, 560, 844], bar: 56,
    nodes: [
      { id: 'gw', col: 0, y: 8, h: 160, label: 'payments-gateway', sub: 'Gateway', state: 'ok', icon: 'k8s-gateway' },
      { id: 'http', col: 1, y: 8, h: 100, label: 'checkout-http', sub: 'HTTPRoute', state: 'ok', icon: 'k8s-route' },
      { id: 'grpc', col: 1, y: 150, h: 60, label: 'checkout-grpc', sub: 'GRPCRoute', state: 'ok', icon: 'k8s-route' },
      { id: 'svc', col: 2, y: 8, h: 160, label: 'checkout-api', sub: 'Service · NotReady 1', state: 'warn', icon: 'k8s-service' },
      { id: 'p1', col: 3, y: 8, h: 48, label: 'p4x2m', ariaLabel: 'checkout-api-7cf98-p4x2m', sub: 'CrashLoopBackOff', state: 'fail', icon: 'k8s-pod', action: 'kit.navigate', arg: { address: 'wake://cluster/wake-sample/ns/payments/pods/checkout-api-7cf98-p4x2m' } },
      { id: 'p2', col: 3, y: 76, h: 56, label: 'd9m2p', sub: 'Running', state: 'ok', icon: 'k8s-pod' },
      { id: 'p3', col: 3, y: 154, h: 56, label: 'b8k5n', sub: 'Running', state: 'ok', icon: 'k8s-pod' },
    ],
    links: [
      { from: 'gw', to: 'http', label: 'parentRef', fromOffset: 0, toOffset: 0, size: 100, state: 'ok' },
      { from: 'gw', to: 'grpc', label: 'parentRef', fromOffset: 100, toOffset: 0, size: 60, state: 'ok' },
      { from: 'http', to: 'svc', label: 'backendRef', fromOffset: 0, toOffset: 0, size: 100, state: 'ok' },
      { from: 'grpc', to: 'svc', label: 'backendRef', fromOffset: 0, toOffset: 100, size: 60, state: 'ok' },
      { from: 'svc', to: 'p1', label: 'selector', fromOffset: 0, toOffset: 0, size: 48, state: 'fail' },
      { from: 'svc', to: 'p2', label: 'selector', fromOffset: 48, toOffset: 0, size: 56, state: 'ok' },
      { from: 'svc', to: 'p3', label: 'selector', fromOffset: 104, toOffset: 0, size: 56, state: 'ok' },
    ],
  };
}

/** CPU, 재시작, 메모리 차트 카드 */
function charts(m, t, error, retry) {
  const valid = values => Array.isArray(values) && values.length === m?.times?.length && values.length > 1 && values.every(v => Number.isFinite(v) && v >= 0);
  const denied = error?.status === 403 || /forbidden|403/i.test(String(error?.kind || error?.message || error));
  const unavailable = title => C.chartCard.render({ title, body: C.listRow.render({
    lead: C.statusIcon.render({ kind: error ? denied ? 'perm' : 'error' : 'idle' }),
    end: error && retry ? C.button.render({ ...retry, label: t('wake.flow.a.retry'), size: 'sm', variant: 'secondary' }) : '',
    title: t(error ? denied ? 'wake.flow.c.forbidden' : 'wake.find.c.read' : 'wake.res.noData'),
  }) });
  const cpu = valid(m?.cpu), restarts = valid(m?.restarts), memory = m?.memory && Object.keys(m.memory).length > 0 && Object.values(m.memory).every(valid);
  return [
    cpu && !error ? cpuCard(m, t) : unavailable(t('wake.cpu')),
    restarts && !error ? restartCard(m, t) : unavailable(t('wake.restarts')),
    memory && !error ? memoryCard(m, t) : unavailable(t('wake.memory')),
  ];
}

function cpuCard(m, t) { return C.chartCard.render({ align: true, title: t('wake.cpu'), caption: t('wake.chart.cpuScope', { start: m.times[0], end: m.times.at(-1) }), value: `${m.cpu.at(-1)}m`, badge: C.badge.render({ tone: 'neutral', label: t('wake.cpu.request') }),
      chart: { kind: 'area', height: 120, x: m.times, series: [{ name: 'payments', color: '--series-1', values: m.cpu }], max: 750, ticks: [0, 375, 750], unit: 'm' } }); }

function restartCard(m, t) { return C.chartCard.render({ align: true, title: t('wake.restarts'), caption: t('wake.chart.restartScope', { start: m.times[0], end: m.times.at(-1) }), value: String(m.restarts.reduce((sum, value) => sum + value, 0)),
      chart: { kind: 'bar', height: 120, x: m.times, series: [{ name: t('wake.restarts'), color: '--series-1', values: m.restarts }], max: 4, ticks: [0, 2, 4] } }); }

const seriesColors = ['--series-1', '--series-2', '--series-3'];
function memoryCard(m, t) { return C.chartCard.render({ align: true, title: t('wake.memory'), caption: t('wake.chart.memoryScope', { start: m.times[0], end: m.times.at(-1) }),
      legend: [...Object.entries(m.memory).map(([label, values], i) => ({ label: `${label} · ${values.at(-1)}Mi`, color: seriesColors[i % seriesColors.length] })), { label: t('wake.memory.limit'), dash: true }],
      chart: { kind: 'area', height: 120, x: m.times, series: Object.entries(m.memory).map(([name, values], i) => ({ name, color: seriesColors[i % seriesColors.length], values })), max: 280, ticks: [0, 128, 256], unit: 'Mi', ref: { value: 256 } } });
}


bootPage(config, async ctx => {
  const { t, icon } = ctx;
  const [metrics, convs, incidents] = structuredClone([{ times: TIMES, ...METRICS }, CONVERSATIONS, INCIDENTS]);
  const st = { sw: { a: false, b: true }, tab: 'overview', utab: 'skills', sel: 'seoul-lab', approval: 'pending', apSel: 0, multi: ['clusters', 'pinned'], choice: 'compact', hotkey: ['⌥', 'Space'] };
  st.selectedRows = ['series-0', 'outside'];
  st.checkSample = { checked: false, indeterminate: true };
  const selectionRows = Array.from({ length: 6 }, (_, slot) => ({ id: `series-${slot}`, name: `resource-observability-compute-group-instance-00000000-000${slot}`, appearance: C.chartCard.seriesAppearance(slot) }));
  const temporalExample = known => {
    const start = Date.UTC(2026, 0, 1) / 1000 + .123456;
    const series = [
      { key: 'alpha', name: 'Alpha', ...C.chartCard.seriesAppearance(0), observations: [{ at: start, value: 0 }, { at: start + 60.032, value: 1, joinPrevious: true }, { at: start + 180.032, value: 2, joinPrevious: true }, { at: start + 240.032, value: 3, joinPrevious: true, gapBefore: true }, { at: start + 300.032, value: null }, { at: start + 360.032, value: 4, joinPrevious: true }, { at: start + 420.032, value: 5, joinPrevious: true }] },
      { key: 'beta', name: 'Beta', ...C.chartCard.seriesAppearance(4), observations: [{ at: start + .25, value: 3 }, { at: start + 60.25, value: 4, joinPrevious: true }, { at: start + 120.25, value: 5, joinPrevious: true }] },
    ];
    return C.chartCard.render({ density: 'compact', title: known ? 'Epoch observations' : 'Unknown continuity',
      caption: known ? '60.032 s joins · 120 s / explicit gap / null break' : 'Observed points only · no assumed cadence',
      legend: series.map(item => ({ label: item.name, color: item.color })),
      chart: { kind: 'line', height: 64, max: 8, ticks: [0, 4, 8], timeAxis: { from: start, to: start + 600, maxGapSeconds: known ? 90 : null }, series },
    });
  };
  const sec = (title, body) => html`<section class="g-sec"><h2 class="g-h">${title}</h2>${body}</section>`;
  const row = (...items) => html`<div class="g-row">${items}</div>`;
  const box = (label, body, wide) => html`<div class="${wide ? 'g-box wide' : 'g-box'}"><div class="g-l">${label}</div>${body}</div>`;
  const pageChip = { icon: 'k8s-pod', title: 'checkout-api-7cf98-p4x2m', sub: 'payments · seoul-lab', raised: true };
  const diff = '  resources:\n    limits:\n-     memory: 256Mi\n+     memory: 384Mi';
  const ns = ['payments', 'platform', 'observability'];
  /* 질문 패널 상태: 처음(1번 선택), 키보드로 2번 선택, 보내는 중, 그리고 결정 뒤 대화의 결과 줄. 첫 칸은 직접 눌러 볼 수 있다 */
  const qOptions = () => config.ai.approvals.choices.map(c => ({ ...c, label: t(c.label) }));
  const qPanel = (id, o = {}) => C.questionPanel.render({ id, question: t('wake.gallery.approvalQuestion'), options: qOptions(), selected: o.selected, submitting: o.submitting });
  const qResult = (state, by, time) => C.stepRow.render({ icon: state === 'ran' ? 'circle-check' : 'circle-x', text: [t('approval.' + state), by, time].join(' · ') });
  const approvalStates = () => html`
    ${st.approval === 'pending' ? qPanel('g-ap-live', { selected: st.apSel }) : qResult(st.approval, 'woonyong', '09:42')}<div class="g-gap"></div>
    ${qPanel('g-ap-key', { selected: 1 })}<div class="g-gap"></div>
    ${qPanel('g-ap-busy', { submitting: true })}<div class="g-gap"></div>
    ${qResult('ran', 'woonyong', '09:42')}${qResult('denied', 'jiwoo.han', '09:44')}`;

  /* 위쪽 바 팝오버: 앱 정의를 그대로 쓰고 글자만 사전으로 바꾼다 */
  const gs = { settings: { ...config.settings.defaults, 'wake.clusters.list': CLUSTERS } };
  const pop = (id, arg) => localizeMenu(config.menus[id](arg, gs));
  const popArg = { route: 'detail', cluster: 'wake-sample', ns: 'payments', kind: 'deployments', name: 'checkout-api' };
  const menus = {
    'wake.cluster.info': () => pop('wake.cluster.info', 'wake-sample'),
    'wake.tools': () => pop('wake.tools', popArg),
    'g.menu': () => ({ items: [
      { id: 'logs', label: t('wake.detail.logs'), icon: 'file-text', shortcut: ['⌘', 'L'] },
      { id: 'describe', label: 'describe', icon: 'search' },
      { type: 'separator' },
      { type: 'label', label: t('wake.menu.view') },
      { id: 'wrap', label: t('wake.menu.wrap'), switch: true, on: true },
      { id: 'ns', label: 'Namespace', icon: 'folder', submenu: { items: ns.map(n => ({ id: 'ns-' + n, label: n, checked: n === 'payments' })) } },
      { type: 'separator' },
      { id: 'restart', label: 'rollout restart', icon: 'arrow-rotate-clockwise', danger: true },
      { id: 'delete', label: 'delete', disabled: true },
    ] }),
    'g.morph': () => ({ morph: true, width: 220, items: [
      { id: 'cluster', label: 'Cluster', end: st.sel, submenu: { items: ['seoul-lab', 'eks-payments-apne2', 'gke-services-asia', 'aks-platform-east'].map(c => ({ id: c, label: c, checked: c === st.sel, action: 'g.pick', arg: c })) } },
      { id: 'ns', label: 'Namespace', end: 'payments', submenu: { items: ns.map(n => ({ id: n, label: n, checked: n === 'payments' })) } },
      { type: 'separator' },
      { id: 'fast', label: t('composer.fast'), switch: true, on: false },
    ] }),
    'g.multi': () => C.select.menuDef({ key: 'sections', value: st.multi, multi: true, options: ['clusters', 'pinned', 'conversations'].map(id => ({ id, label: t(`wake.section.${id}`) })), action: 'g.multi' }),
    'g.connect': () => ({ width: 300, items: [{ type: 'search', placeholder: t('wake.palette.placeholder') }, { type: 'label', label: 'API' }, { id: 'a', label: 'Claude API', icon: 'brand-claude' }, { id: 'o', label: 'OpenAI', icon: 'brand-openai' }, { type: 'separator' }, { id: 'v', label: 'vLLM', icon: 'provider-local' }, { type: 'separator' }, { id: 'c', label: t('wake.prov.custom'), icon: 'plus-medium', action: 'kit.dialog.open', arg: { id: 'wake.provider.custom' } }] }),
    'g.select': () => C.select.menuDef({ key: 'cluster', value: st.sel, options: ['seoul-lab', 'eks-payments-apne2', 'gke-services-asia', 'aks-platform-east'].map(c => ({ id: c, label: c })), action: 'g.pick' }),
  };

  const sidebarDemo = C.section.render({ id: 'g-tabs', label: t('wake.section.tabs'), body: [
    C.sidebarRow.render({ icon: 'plus-medium', label: t('tab.new'), add: true }),
    C.sidebarRow.render({ icon: 'k8s-cluster', label: 'seoul-lab', ctx: 'payments', selected: true, closable: true, arg: 'a' }),
    C.sidebarRow.render({ label: 'checkout-api', loading: true, closable: true, arg: 'b' }),
    C.sidebarRow.render({ dot: 'critical', label: 'billing-api', ctx: 'CrashLoopBackOff', closable: true, arg: 'c' }),
    C.sidebarRow.render({ dot: 'off', label: 'inventory-worker', closable: true, arg: 'd' }),
  ] });

  /* 설정 화면 요소: 기준 설정 페이지에 나오는 모든 종류를 상태별로 */
  const opts3 = ['seoul-lab', 'eks-payments-apne2', 'gke-services-asia'];
  const sub = [{ id: 's-ov', label: t('wake.gallery.s.overview'), icon: 'columns', current: true }, { id: 's-hi', label: t('wake.gallery.s.history'), icon: 'arrow-undo-up' }, { id: 's-cx', label: t('wake.gallery.s.context'), icon: 'eye', badge: t('wake.gallery.s.new'), promote: true }, { id: 's-cf', label: t('wake.gallery.s.configure'), icon: 'sliders' }];
  const navGroups = open => [{ label: t('wake.settings.group.personal'), items: [{ id: 'g', label: t('wake.settings.general'), icon: 'settings' }, { id: 'm', label: t('wake.gallery.s.memory'), icon: 'archive', children: open ? sub : sub.map(x => ({ ...x, current: false })) }, { id: 'c', label: t('wake.settings.clusters'), icon: 'k8s-cluster', badge: t('wake.gallery.s.new'), current: !open }] }];
  const navFooter = [];
  const pic = ic => html`<span class="g-pic">${icon(ic, 'xl')}</span>`;
  const settingsParts = () => html`
      ${row(box('settings-nav: badge, sub-nav open', C.settingsNav.render({ searchPlaceholder: t('settings.search'), groups: navGroups(true), footer: navFooter })),
        box('settings-nav: sub-nav closed, promoted child', C.settingsNav.render({ searchPlaceholder: t('settings.search'), groups: navGroups(false), footer: navFooter })),
        box('search-input', html`${C.searchInput.render({ placeholder: t('settings.search') })}<div class="g-gap"></div>${C.searchInput.render({ placeholder: t('settings.search'), value: 'payments' })}`))}
      ${box('page-header, section title + count + badge', html`${C.pageHeader.render({ title: t('wake.settings.general') })}${C.pageHeader.render({ title: t('wake.gallery.s.archived'), help: t('wake.gallery.s.help') })}${C.settingsSection.render({ title: t('wake.s.tools.connected'), count: 4, children: '' })}<div class="g-gap"></div>${C.settingsSection.render({ title: t('wake.gallery.s.intro'), badge: C.badge.render({ label: t('wake.gallery.s.pro'), tone: 'tag' }), description: t('wake.gallery.s.introDesc'), children: '' })}`, true)}
      ${box('settings rows', html`<div class="g-col">${C.settingsGroup.render({ children: [
        C.settingsRow.render({ title: t('wake.s.theme'), description: t('wake.s.theme.desc'), control: C.select.render({ value: t('wake.s.theme.dark'), icon: 'moon', menu: 'g.select' }) }),
        C.settingsRow.render({ title: t('wake.gallery.s.sections'), control: C.select.render({ value: [t('wake.section.clusters'), t('wake.section.pinned')].join(', '), menu: 'g.multi', multi: true }) }),
        C.settingsRow.render({ title: t('wake.s.cl.nsDefault'), control: C.select.render({ value: t('wake.gallery.s.choose'), menu: 'g.select', placeholder: true, disabled: true }) }),
        C.settingsRow.render({ title: t('wake.section.pinned'), description: t('wake.s.sidebarSections.desc'), control: C.toggle.render({ on: st.sw.b, action: 'g.switch', arg: 'b', label: 'b' }) }),
        C.settingsRow.render({ title: t('wake.gallery.s.sound'), description: t('wake.gallery.s.soundDesc'), control: C.toggle.render({ on: st.sw.a, action: 'g.switch', arg: 'a', label: 'a' }), extra: html`${C.button.render({ label: t('wake.gallery.s.preview'), icon: 'play', variant: 'secondary', size: 'xs' })}${C.button.render({ label: t('wake.gallery.s.change'), variant: 'secondary', size: 'xs' })}` }),
        C.settingsRow.render({ title: 'kubernetes-mcp', description: 'stdio', control: C.toggle.render({ on: false, disabled: true, label: 'mcp' }), extra: C.button.render({ label: t('wake.gallery.s.mcpHelp'), icon: 'circle-question', variant: 'link' }) }),
      ] })}${C.settingsGroup.render({ children: [
        C.settingsRow.render({ title: 'woonyong', description: 'woonyong@example.com', lead: C.avatar.render({ name: 'woonyong' }), control: C.button.render({ label: t('wake.account.settings'), variant: 'secondary' }) }),
        C.settingsRow.render({ title: t('wake.s.model.default'), description: t('wake.s.model.default.desc'), wideControl: true, control: C.splitButton.render({ main: C.select.render({ value: 'Sonnet 4.5', icon: 'brand-claude', menu: 'g.select', chevron: 'down' }), menu: 'g.menu', variant: 'more' }) }),
        C.settingsRow.render({ title: t('wake.s.tools.servers'), control: C.splitButton.render({ main: C.button.render({ label: t('wake.gallery.s.configure'), icon: 'sliders', variant: 'secondary' }), menu: 'g.menu', variant: 'secondary' }) }),
        C.settingsRow.render({ title: t('wake.s.sc.sidebar'), description: t('wake.s.sc.sidebar.desc'), control: C.shortcut.render({ keys: ['⌘', 'S'], menu: 'g.menu' }) }),
        C.settingsRow.render({ title: t('wake.gallery.s.hotkey'), control: C.shortcut.render({ keys: st.hotkey, record: true, action: 'g.hotkey', reset: 'g.hotkey-reset', label: t('wake.gallery.s.hotkey') }) }),
        C.settingsRow.render({ title: t('wake.gallery.s.tabStyle'), control: C.choiceCards.render({ options: [{ id: 'compact', label: t('wake.gallery.s.compact'), picture: pic('columns') }, { id: 'roomy', label: t('wake.gallery.s.roomy'), picture: pic('sidebar') }], value: st.choice, action: 'g.choice' }), wideControl: true }),
        C.settingsRow.render({ title: t('wake.ctx.delete'), description: t('wake.folder.deleteTitle'), control: C.button.render({ label: t('wake.ctx.delete'), variant: 'destructive', dialog: 'g.confirm' }) }),
        C.settingsRow.render({ title: t('wake.settings.clusters'), description: t('wake.s.clusters.list'), action: 'g.noop', trail: 'chevron' }),
        C.settingsRow.render({ title: t('wake.gallery.s.remaining', { n: 100 }), description: t('wake.gallery.s.renews'), stack: C.progress.render({ value: 100 }) }),
      ] })}</div>`, true)}
      ${row(box('notice + add row', html`<div class="g-col">${C.settingsGroup.render({ notice: { text: t('wake.gallery.s.limit'), action: C.button.render({ label: t('wake.gallery.s.upgrade'), variant: 'secondary', size: 'xs' }) }, children: [C.settingsRow.render({ variant: 'add', title: t('wake.gallery.s.create'), action: 'g.noop' })] })}</div>`),
        box('rows + connect popover', html`<div class="g-col">${C.settingsGroup.render({ children: [...['Claude API', 'OpenAI API', 'vLLM'].map((title, i) => C.settingsRow.render({ tile: ['brand-claude', 'brand-openai', 'provider-local'][i], title, control: C.statusIcon.render({ kind: ['idle', 'busy', 'ok'][i] }) })), C.settingsRow.render({ variant: 'add', title: t('wake.s.connect'), menu: 'g.connect' })] })}</div>`))}
      ${box('underline tabs + import split button + icon list rows', html`<div class="g-col"><div class="g-tabs">${C.underlineTabs.render({ id: 'g-utabs2', tabs: [{ id: 'skills', label: t('wake.s.tools.tab.tools') }, { id: 'mcp', label: t('wake.s.tools.tab.mcp') }], value: st.utab, action: 'g.utab' })}${C.splitButton.render({ main: C.button.render({ label: 'Import', icon: 'plus-medium', variant: 'secondary', size: 'sm' }), menu: 'g.menu', variant: 'secondary' })}</div>${C.settingsSection.render({ title: t('wake.s.tools.connected'), count: 3, children: C.settingsGroup.render({ children: [
        C.settingsRow.render({ tile: 'tool-metrics', title: 'Prometheus', description: 'monitoring/prometheus-server', wideControl: true, control: html`${C.badge.render({ tone: 'ok', label: t('wake.connected') })}${C.iconButton.render({ icon: 'more', size: 'sm', menu: 'g.menu', tip: t('settings.more') })}` }),
        C.settingsRow.render({ tile: 'tool-logs', title: 'Loki', description: 'monitoring/loki-gateway', control: C.button.render({ icon: 'plus-medium', variant: 'outline', size: 'sm', tip: t('wake.s.connect') }) }),
        C.settingsRow.render({ tile: 'tool-gitops', title: 'Argo CD', description: 'argocd/argocd-server', control: C.button.render({ icon: 'plus-medium', variant: 'outline', size: 'sm', tip: t('wake.s.connect') }) }),
      ] }) })}</div>`, true)}
      ${row(box('intro-card', html`<div class="g-col">${C.introCard.render({ title: t('wake.gallery.s.intro'), description: t('wake.gallery.s.introDesc'), actions: C.splitButton.render({ main: C.button.render({ label: t('wake.gallery.s.install'), icon: 'download', variant: 'secondary', size: 'sm' }), menu: 'g.menu', variant: 'secondary' }), picture: pic('wake-agent') })}</div>`, true))}
      ${row(box('empty-state card', html`<div class="g-col">${C.emptyState.render({ variant: 'card', icon: 'archive', title: t('wake.gallery.s.archivedEmpty') })}</div>`))}
      ${box('accordion (FAQ)', html`<div class="g-col">${C.settingsSection.render({ title: t('wake.gallery.s.faq'), children: C.accordion.render({ id: 'g-faq', items: [{ id: 'a', title: t('wake.gallery.s.faq1'), body: t('wake.gallery.s.faq1a'), open: true }, { id: 'b', title: t('wake.gallery.s.faq2'), body: t('wake.gallery.s.faq2a') }] }) })}</div>`, true)}
      ${box('records: list toolbar (date selects + download), rows, loading, empty', html`<div class="g-col">${C.settingsSection.render({ title: t('wake.gallery.s.usage'), children: html`${C.listToolbar.render({ start: html`${C.select.render({ value: '10월', menu: 'g.select' })}${C.select.render({ value: '2026', menu: 'g.select' })}`, end: C.button.render({ icon: 'download', variant: 'ghost', size: 'sm', tip: t('wake.s.ag.export') }) })}${C.recordList.render({ rows: [
        { lead: icon('play'), title: '이미지 롤백 실행', meta: ['Deployment checkout-api · payments', C.avatar.render({ name: 'woonyong', size: 'sm', showName: true }), '10월 28일 17:06'], end: '실행됨', tone: 'ok' },
        { lead: icon('restart'), title: 'Deployment 재시작 제안', meta: ['Deployment billing-api · payments', 'jiwoo.han', '10월 29일 09:52'], end: '거절됨', tone: 'danger' },
        { lead: icon('eye'), title: '상태 조회', meta: ['Pods · payments · seoul-lab', 'AI', '10월 29일 10:12'], end: '읽기' },
      ] })}<div class="g-gap"></div>${C.recordList.render({ loading: 3 })}<div class="g-gap"></div>${C.recordList.render({ rows: [], empty: t('wake.s.audit.empty') })}` })}</div>`, true)}
      ${row(box('progress', html`${C.progress.render({ value: 100 })}<div class="g-gap"></div>${C.progress.render({ value: 25 })}<div class="g-gap"></div>${C.progress.render({ value: 8 })}<div class="g-gap"></div>${C.progress.render({ value: 62, size: 'inline', tone: 'neutral' })}`),
        box('checkbox, avatar, badges', row(C.checkbox.render({}), C.checkbox.render({ checked: true }), C.avatar.render({ name: 'woonyong' }), C.avatar.render({ name: 'jiwoo.han', size: 'sm', showName: true }), C.badge.render({ label: t('wake.gallery.s.new'), tone: 'brand', size: 'sm' }), C.badge.render({ label: t('wake.gallery.s.pro'), tone: 'tag' }))))}
      ${box('file viewer (tree + file)', html`<div class="g-files">${C.fileViewer.render({ treeHead: C.button.render({ label: t('wake.gallery.s.openFolder'), icon: 'folder', variant: 'ghost', size: 'sm' }), tree: C.fileTree.render({ action: 'g.file', current: 'd1', nodes: [{ id: 'ep', name: 'episodic', children: [{ id: 'd1', name: '2026-10-29.md' }, { id: 'd2', name: '2026-10-27.md' }] }, { id: 'm', name: 'MEMORY.md' }, { id: 'u', name: 'USER.md' }] }), path: ['episodic', '2026-10-29.md'], time: t('wake.gallery.s.minutesAgo'), actions: C.button.render({ label: t('wake.gallery.s.edit'), variant: 'secondary', size: 'sm' }), title: '2026-10-29' })}</div>`, true)}
  `;
  const dialogs = {
    ...config.dialogs,
    'g.code': () => ({ title: { raw: 'providers.json' }, size: 'xl', fields: [{ key: 'json', label: { raw: 'JSON' }, type: 'code', value: '{}', required: true, json: true }], submit: { label: 'wake.flow.connect', action: 'g.noop' } }),
    'g.confirm': () => ({ title: 'wake.folder.deleteTitle', description: { key: 'wake.folder.deleteDesc', vars: { name: 'payments' } }, submit: { label: 'wake.ctx.delete', variant: 'destructive', action: 'g.noop' } }),
    'g.mcp': () => ({ title: 'wake.gallery.s.mcp', description: 'wake.gallery.s.mcpDesc', size: 'md', layout: 'grid', fields: [
      { key: 'transport', label: { raw: 'Transport' }, type: 'select', options: [{ id: 'http', label: { raw: 'Streamable HTTP' } }, { id: 'stdio', label: { raw: 'stdio' } }], value: 'http' },
      { key: 'name', label: { raw: 'Name' }, type: 'text', placeholder: { raw: 'kubernetes-mcp' }, required: true },
      { key: 'url', label: { raw: 'URL' }, type: 'text', placeholder: { raw: 'https://mcp.example.com/mcp' } },
      { type: 'advanced', label: 'wake.gallery.s.advanced', style: 'caret', fields: [{ key: 'header', label: { raw: 'Header' }, type: 'text', placeholder: { raw: 'Authorization' } }] },
    ], submit: { label: 'wake.gallery.s.add', action: 'g.noop' } }),
    'g.routine': () => ({ title: 'wake.gallery.s.routine', size: 'lg', fields: [
      { key: 'title', label: 'wake.gallery.s.routineTitle', type: 'text', required: true },
      { key: 'prompt', label: 'wake.gallery.s.routinePrompt', type: 'textarea' },
      { type: 'rows', fields: [
        { key: 'repeat', label: 'wake.gallery.s.repeat', type: 'select', options: [{ id: 'd', label: 'wake.gallery.s.daily' }, { id: 'w', label: 'wake.gallery.s.weekly' }], value: 'd' },
        { key: 'model', label: 'wake.gallery.s.model', type: 'select', options: [{ id: 's', label: { raw: 'Sonnet 4.5' }, icon: 'brand-claude' }], value: 's' },
        { key: 'notify', label: 'wake.gallery.s.notify', type: 'switch', value: true },
      ] },
      { type: 'advanced', label: 'wake.gallery.s.advanced', fields: [{ key: 'ns', label: 'wake.s.cl.nsDefault', type: 'select', options: ns.map(n => ({ id: n, label: { raw: n } })), value: 'payments' }] },
    ], submit: { label: 'wake.gallery.s.create', action: 'g.noop' } }),
  };

  const dialogExamples = ['g.confirm', 'g.code', 'g.mcp', 'g.routine'].map(id => {
    const definition = dialogs[id]();
    const title = definition?.title;
    const named = typeof title === 'string' ? title.trim() : title && typeof title === 'object' &&
      (typeof title.raw === 'string' && title.raw.trim() || typeof title.key === 'string' && title.key.trim());
    if (!named || !ctx.text(title).trim()) throw new TypeError(`invalid gallery dialog title: ${id}`);
    return { id, definition };
  });
  const example = id => dialogExamples.find(item => item.id === id).definition;

  const render = () => html`<div class="g">
    <h1 class="g-title">${t('wake.gallery.title')}</h1>

    ${sec(t('wake.gallery.buttons'), html`
      ${row(...['default', 'secondary', 'ghost', 'destructive'].map(v => C.button.render({ label: v, variant: v })))}
      ${row(C.button.render({ label: 'apply', icon: 'check', size: 'sm' }), C.button.render({ label: 'apply', size: 'xs' }), C.button.render({ label: 'apply', disabled: true }), C.button.render({ label: t('wake.detail.logs'), iconEnd: 'arrow-up-right', variant: 'secondary' }))}
      ${row(C.iconButton.render({ icon: 'settings', tip: t('settings.title') }), C.iconButton.render({ icon: 'settings', size: 'sm', tip: t('settings.title') }), C.iconButton.render({ icon: 'settings', size: 'xs', tip: t('settings.title') }), C.iconButton.render({ icon: 'sidebar', variant: 'native', tip: t('shell.sidebar.hide') }), C.iconButton.render({ icon: 'settings', disabled: true }))}
      ${row(C.splitButton.render({ main: C.button.render({ label: 'Import', icon: 'plus-medium', variant: 'secondary' }), menu: 'g.menu' }), C.toolbarButton.render({ icon: 'play', label: t('wake.perm.ask'), tone: 'risky', menu: 'g.menu' }), C.toolbarButton.render({ icon: 'hexagon', label: 'model', chevron: false, menu: 'g.menu' }))}
      ${row(C.kbd.render({ keys: ['⌘', 'K'] }), ...['ok', 'warn', 'danger', 'neutral', 'brand'].map(tone => C.badge.render({ tone, label: tone })), C.badge.count({ value: 3 }), C.badge.count({ value: 12, tone: 'danger' }), status(['ok', 'Running']), status(['danger', 'CrashLoopBackOff']))}
    `)}

    ${sec(t('wake.gallery.inputs'), html`
      ${row(C.searchInput.render({ placeholder: t('shell.search'), width: 'calc(var(--space-16) * 3.75)' }), C.select.render({ value: st.sel, icon: 'k8s-cluster', menu: 'g.select' }))}
      ${row(C.toggle.render({ on: st.sw.a, action: 'g.switch', arg: 'a', label: 'a' }), C.toggle.render({ on: st.sw.b, action: 'g.switch', arg: 'b', label: 'b' }), C.toggle.render({ on: true, disabled: true, label: 'c' }))}
      ${row(C.pillTabs.render({ id: 'g-pills', tabs: ['overview', 'resources', 'conversations', 'incidents'].map(id => ({ id, label: id === 'overview' ? t('wake.gallery.s.overview') : t(`wake.home.${id}`), count: id === 'incidents' ? incidents.length : undefined })), value: st.tab, action: 'g.tab' }))}
      ${row(C.underlineTabs.render({ id: 'g-utabs', tabs: [{ id: 'skills', label: 'Skills' }, { id: 'mcp', label: 'MCP' }], value: st.utab, action: 'g.utab' }))}
    `)}

    ${sec(t('wake.gallery.menus'), html`
      ${row(C.button.render({ label: t('wake.gallery.openMenu'), variant: 'secondary', menu: 'g.menu' }), C.button.render({ label: t('wake.gallery.openMorph'), variant: 'secondary', menu: 'g.morph' }), html`<div class="g-ctx" data-context="g.ctx" data-context-arg="${JSON.stringify('checkout-api')}">${t('wake.gallery.rightClick')}</div>`)}
      ${row(box('menu', C.menu.renderStatic({ width: 220, items: menus['g.menu']().items })), box('menu (morph)', C.menu.renderStatic({ width: 200, items: menus['g.morph']().items })))}
      ${box('topbar popover', html`<div class="g-tb">${C.topbar.render({ canBack: true, canForward: false, ident: { icon: 'k8s-cluster', label: 'seoul-lab', menu: 'wake.cluster.info' }, buttons: [{ icon: 'puzzle', tip: t('wake.tools.title'), menu: 'wake.tools' }], path: C.pathSegmentSwitcher.render({ segments: [{ label: 'seoul-lab' }, { label: 'payments' }, { label: 'checkout-api' }] }) })}</div>`, true)}
      ${row(box('popover', C.popover.renderStatic(menus['wake.cluster.info']())), box('popover', C.popover.renderStatic(menus['wake.tools']())))}
      ${box('palette', html`<div class="g-pal">${raw(C.palette.render({ placeholder: t('wake.palette.placeholder'), keys: ['⌘K'], groups: [
        { label: t('palette.openTabs'), rows: [{ icon: 'k8s-cluster', label: 'seoul-lab', end: t('palette.switch'), endIcon: 'arrow-up-right' }, { icon: 'k8s-pod', label: 'checkout-api-7cf98-p4x2m', end: t('palette.switch'), endIcon: 'arrow-up-right' }] },
        { label: t('panel.today'), rows: convs.slice(0, 2).map(c => ({ icon: 'message', label: c.title, end: c.time })) },
      ] }).s.replace('class="pal"', 'class="pal g-static"'))}</div>`, true)}
    `)}

    ${sec(t('wake.gallery.frame'), html`
      ${row(box('sidebar', html`<div class="g-sb">${sidebarDemo}${C.section.render({ id: 'g-pins', label: t('wake.section.pinned'), collapsed: true, body: [] })}</div>`),
        box('topbar', html`<div class="g-tb">${C.topbar.render({ canBack: true, canForward: false, ident: { icon: 'k8s-cluster', label: 'seoul-lab' }, path: C.pathSegmentSwitcher.render({ segments: [{ label: 'payments', menu: 'g.menu' }, { label: 'Deployments', menu: 'g.menu' }, { label: 'checkout-api' }] }) })}</div>`, true))}
    `)}

    ${sec(t('wake.gallery.conversation'), html`
      ${row(box('message-list', html`<div class="g-panel"><div class="g-chat-body" data-scroll="y">${C.messageList.render({ date: '09:41', items: [
          C.userBubble.render({ text: t('wake.gallery.question'), time: '09:41', chip: pageChip }),
          C.stepGroup.render({ id: 'g1', seconds: 14, steps: [C.stepRow.render({ icon: 'file-text', text: 'kubectl logs checkout-api-7cf98-p4x2m --previous' }), C.stepRow.render({ icon: 'search', text: 'kubectl describe pod checkout-api-7cf98-p4x2m' })] }),
          C.stepGroup.render({ id: 'g2', working: true, seconds: 3, startedAt: Date.now() - 3000, steps: [], current: C.stepRow.render({ text: 'kubectl get events -n payments', running: true }) }),
          C.answerText.render({ blocks: [{ h2: 'OOMKilled' }, { p: [{ code: 'checkout-api' }, ' ', t('wake.gallery.answer')] }, { ul: [['limits.memory 256Mi'], ['restarts 16']] }] }),
          C.messageTable.render({ expand: 'kit.panel.open-as-tab', head: ['Pod', 'Status', 'Restarts'], rows: [['p4x2m', 'CrashLoopBackOff', '16'], ['d9m2p', 'Running', '0']] }),
          C.codeBlock.render({ lang: 'yaml', text: diff, diff: true }),
          qResult('ran', 'woonyong', '09:42'),
          C.actionRow.render({ time: '09:42', id: 'g-msg' }),
        ] })}</div>
        <div class="g-chat-bottom">${C.composer.render({ id: 'g-c', placeholder: t('wake.home.ask'), chip: { ...pageChip, removable: true } })}${C.composerToolbar.render({ left: [C.toolbarButton.render({ icon: 'eye', label: t('wake.perm.read'), menu: 'g.menu' })], right: [C.toolbarButton.render({ icon: 'hexagon', label: 'model', chevron: false, menu: 'g.menu' }), C.toolbarButton.render({ label: 'High', menu: 'g.menu' })] })}</div>
      </div>`),
      box('question-panel', html`<div data-static>${approvalStates()}</div>`),
      box('composer', html`${C.composer.render({ id: 'g-w', variant: 'wide', placeholder: t('wake.home.ask') })}<div class="g-gap"></div>${C.composer.render({ id: 'g-b', placeholder: t('wake.home.ask'), busy: true })}<div class="g-gap"></div>${C.contextChip.render(pageChip)}`))}
    `)}

    ${sec(t('wake.gallery.settings'), html`
      ${row(box('settings-nav', C.settingsNav.render({ searchPlaceholder: t('shell.search'), groups: [{ label: t('wake.settings.group.personal'), items: [{ id: 'g', label: t('wake.settings.general'), icon: 'settings', current: true }, { id: 'c', label: t('wake.settings.clusters'), icon: 'k8s-cluster' }] }]})),
        box('settings', C.settingsSection.render({ title: t('wake.settings.clusters'), count: 4, children: C.settingsGroup.render({ children: [
          C.settingsRow.render({ title: 'seoul-lab', description: 'v1.31 · kind', icon: 'k8s-cluster', control: status(['ok', 'Ready']) }),
          C.settingsRow.render({ title: 'eks-payments-apne2', description: 'v1.30 · EKS', tile: 'k8s-cluster', control: C.toggle.render({ on: true, label: 'eks' }) }),
          C.settingsRow.render({ title: t('wake.s.theme'), control: C.select.render({ value: 'Dark', menu: 'g.select' }) }),
          C.settingsRow.render({ title: 'gke-services-asia', description: 'v1.30 · GKE', action: 'g.noop', icon: 'k8s-cluster', control: icon('chevron-right-small') }),
          C.settingsRow.render({ title: t('wake.settings.connect'), variant: 'add', icon: 'plus-medium', action: 'g.noop' }),
        ] }) }), true))}
      ${row(box('list-row', C.settingsGroup.render({ children: convs.slice(0, 3).map(c => C.listRow.render({ icon: 'message', title: c.title, description: c.preview, end: html`<span class="g-muted">${c.time}</span>` })) }), true),
        box('connection-row', C.settingsGroup.render({ children: ['idle', 'busy', 'ok'].map((s, i) => C.connectionRow.render({ id: 'g-conn-' + i, icon: 'k8s-cluster', title: ['aks-platform-east', 'gke-services-asia', 'wake-sample'][i], kind: s, busy: s === 'busy' })) })))}
    `)}

    ${sec(t('wake.gallery.settingsParts'), settingsParts())}

    ${sec(t('wake.gallery.dialogs'), html`
      ${row(...dialogExamples.map(({ id, definition }) => C.button.render({ label: ctx.text(definition.title), variant: 'secondary', dialog: id })))}
      ${row(box('dialog confirm', C.dialog.render(example('g.confirm'), undefined, { static: true })), box('dialog grid', C.dialog.render(example('g.mcp'), { values: { name: '' } }, { static: true })))}
      ${row(box('dialog rows + advanced', C.dialog.render(example('g.routine'), undefined, { static: true })), box('dialog code invalid', C.dialog.render(example('g.code'), { values: { json: '{ "providers": ' }, errors: { json: t('dialog.json', { message: 'Unexpected end of JSON input' }) } }, { static: true })))}
    `)}

    ${sec('Incident parts', html`
      ${row(box('page-header · sub', C.pageHeader.render({ title: t('wake.detail.logs'), icon: 'terminal', sub: ['Loki', 'seoul-lab', 'retention 14 d'] }), true))}
      ${row(box('ai-applied', C.aiApplied.render({ label: 'AI applied', chips: [{ key: 'logQ', label: 'Search "OOMKilled"' }, { key: 'logRange', label: 'Last 1 hour' }], end: C.button.render({ label: 'INC-2142', icon: 'arrow-up-right', variant: 'link', action: 'g.noop' }), action: 'g.noop' }), true))}
      ${row(box('source-chips', C.sourceChips.render({ action: 'g.noop', items: [
        { id: 'agent', name: 'wake-agent', icon: 'brand-kubernetes', state: 'ok', detail: 'heartbeat 3s' },
        { id: 'prom', name: 'Prometheus', icon: 'brand-prometheus', state: 'ok' },
        { id: 'loki', name: 'Loki', icon: 'brand-loki', state: 'error', detail: 'timeout', last: '09:31' },
        { id: 'argo', name: 'Argo CD', icon: 'brand-argo', state: 'limited', detail: 'read only' },
        { id: 'gh', name: 'GitHub', icon: 'brand-github', state: 'perm' },
        { id: 'graf', name: 'Grafana', icon: 'brand-grafana', state: 'busy' },
      ] }), true))}
      ${row(box('stale-line', html`${C.staleLine.render({ text: 'Old data · heartbeat 4m ago · agent disconnected', action: { label: 'wake-agent', action: 'g.noop' } })}<div class="g-gap"></div>${C.staleLine.render({ kind: 'idle', icon: 'clock', text: 'Read before Loki disconnected · 09:31:04' })}`),
        box('query-line', html`${C.queryLine.render({ source: 'Loki', query: '{namespace="payments", pod=~"checkout-api-.*"} |= "OOMKilled"' })}<div class="g-gap"></div>${C.queryLine.render({ state: 'perm', query: 'kubectl get secrets -n payments' })}`))}
      ${row(box('head-lines', C.headLines.render({ rows: [
        { id: 'why', tone: 'error', attention: true, text: 'Pod checkout-api-7cf98-p4x2m CrashLoopBackOff · OOMKilled', end: C.button.render({ label: 'Sync 09:12', icon: 'clock', variant: 'link', action: 'g.noop' }) },
        { id: 'managed', icon: 'branch', text: 'Managed by Argo CD payments-app' },
        { id: 'link', tone: 'busy', text: 'INC-2142 open on this object', end: C.button.render({ label: 'Open incident', icon: 'arrow-up-right', variant: 'link', action: 'g.noop' }) },
      ] }), true))}
      ${row(box('reasoning-chain', C.reasoningChain.render({ grade: { label: 'Inferred', kind: 'warn' }, source: 'Rule · memory-limit v3', conclusion: 'The memory limit 256Mi is below the working set after release 2.4.0', refAction: 'g.noop', cells: [
        { id: 'observe', label: 'Observed', count: true, items: [{ text: 'Exit code 137, OOMKilled 16 times in 40 minutes', refs: [1, 2] }, { text: 'Working set 251Mi at the last restart', refs: [3] }] },
        { id: 'basis', label: 'Basis', count: true, items: [{ text: 'Release 2.4.0 synced at 09:12', refs: [4] }] },
        { id: 'interpret', label: 'Reading', items: [{ text: 'The new cache grows past the limit under load' }] },
        { id: 'verify', label: 'How to verify', items: [{ text: 'Restarts stop and 5xx under 1% for 5 minutes' }] },
        { id: 'unknown', label: 'Not confirmed', count: true, items: [{ text: 'Heap profile not collected' }] },
      ] })),
        box('reasoning-chain · bar', C.reasoningChain.render({ grade: { label: 'AI view · Inferred', kind: 'warn' }, source: 'AI', conclusion: 'A connection pool leak in 2.4.0', refAction: 'g.noop', open: true, toggle: { action: 'g.noop', arg: 'alt' }, cells: [{ id: 'observe', label: 'Observed', count: true, items: [{ text: 'HikariPool Connection is not available', refs: [5] }] }] })))}
      ${row(box('verify-card', C.verifyCard.render({ min: 10, windows: ['ok', 'ok', 'ok', 'miss', 'ok', 'none', 'none'], conditions: [
        { id: 'restarts', label: 'No new restarts', state: 'pass', value: '0' },
        { id: 'ready', label: 'Ready Pod 3', state: 'watch', value: 'Ready 2 · Desired 3' },
        { id: 'errors', label: '5xx under 1%', state: 'fail', value: '3.2%' },
        { id: 'logs', label: 'No OOMKilled in logs', state: 'unknown', optional: true },
        { id: 'batch', label: 'Batch queue drained', state: 'unjudged' },
      ] })),
        box('action-compare', C.actionCompare.render({ action: 'g.noop', options: [
          { id: 'limit', title: 'Raise the memory limit', kind: 'GitOps PR', grade: { label: 'Action founded', kind: 'ok', icon: 'shield-check' }, change: 'resources.limits.memory 256Mi → 384Mi', reach: 'checkout-api · 3 Pod rolling', route: ['Draft PR', 'Review', 'Merge', 'Argo CD sync'] },
          { id: 'rollback', title: 'Roll back to 2.3.4', kind: 'Rollback', grade: { label: 'Action inferred', kind: 'warn' }, change: 'image checkout:2.4.0 → 2.3.4', reach: 'checkout-api · all users', note: 'Loses the 2.4.0 payment fix', route: ['Argo CD rollback'], disabled: true },
        ] })))}
      ${row(box('approval-head', C.approvalHead.render({ target: ['payments', 'Deployment', 'checkout-api'], tag: 'production', cause: { label: 'Cause inferred', kind: 'warn' }, grade: { label: 'Action founded', kind: 'ok', icon: 'shield-check' }, reach: 'checkout-api · 3 Pod rolling', code: { path: 'apps/checkout/values.yaml', text: '-      memory: 256Mi\n+      memory: 384Mi', diff: true } })), box('row-list', C.rowList.render({ rows: [
        { id: 'inc', lead: C.statusIcon.render({ kind: 'error', attention: true }), title: 'INC-2142 checkout-api OOMKilled', sub: 'KubePodCrashLooping · critical · payments · 09:14', meta: 'Cause', action: 'g.noop' },
        { id: 'agent', lead: C.iconStack.disc('brand-kubernetes'), title: 'wake-agent', sub: 'wake-system · v0.9.2 · heartbeat 3s', end: C.statusIcon.render({ kind: 'ok', label: 'Connected' }), action: 'g.noop' },
        { id: 'loki', lead: C.iconStack.disc('brand-loki'), title: 'Loki', sub: 'monitoring/loki-gateway', end: C.statusIcon.render({ kind: 'error', text: 'Disconnected', reveal: true }), action: 'g.noop' },
      ] })))}
      ${row(box('log-view · gaps, hits, query', html`${C.logView.render({ query: 'connection', gaps: true, lines: [
        { n: 1180, at: '09:14:02', level: 'INFO', text: 'Started CheckoutApplication in 4.2 seconds' },
        { n: 1181, at: '09:14:05', level: 'WARN', text: 'HikariPool-1 - Connection leak detection triggered' },
        { n: 1204, at: '09:14:31', level: 'ERROR', text: 'HikariPool-1 - Connection is not available, request timed out after 30000ms' },
        { n: 1205, at: '09:14:31', level: 'ERROR', text: 'java.lang.OutOfMemoryError: Java heap space' },
        { n: 1206, at: '09:14:32', level: 'INFO', text: 'Shutting down' },
      ] })}${C.pager.range({ page: 3, per: 20, total: 1206, action: 'g.noop', labels: { range: '{from}–{to} · {total} lines' } })}`, true))}
      ${row(box('log-view · no times, no wrap, given hits', C.logView.render({ times: false, wrap: false, hits: [12], lines: [{ n: 11, level: 'INFO', text: 'GET /health 200' }, { n: 12, level: 'ERROR', text: 'POST /checkout 503 upstream connect error or disconnect/reset before headers. reset reason: connection termination' }] })),
        box('ref · in text', html`<div class="g-line">${C.ref.inText('Exit code 137 matched the limit [1][3]; the sync came first [4].', 'g.noop')}</div>`))}
      ${box('summary-bar · metrics', C.summaryBar.metrics(['CPU', 'Memory'].map((name, i) => ({ items: [
        { id: 't', label: '', value: name }, { id: 'v', label: '', value: ['62%', '81%'][i], tone: i ? 'warn' : undefined },
        { id: 'r', label: 'Requests', value: ['48% of allocatable', '77% of allocatable'][i] }, { id: 'n', label: 'Over 80%', value: ['Node 0', 'Node 2'][i] }, { id: 'p', label: 'Top', value: ['ip-10-0-1-12', 'ip-10-0-3-41'][i] },
      ] })), { columns: ['calc(var(--space-16) * 1.9)', 'calc(var(--space-16) * 1.1)', 'calc(var(--space-16) * 3.4)', 'calc(var(--space-16) * 2.95)', 'calc(var(--space-16) * 2.55)'] }), true)}
    `)}

    ${sec(t('wake.gallery.data'), html`
      ${box('data-table', C.dataTable.render({ rowKey: 'name', selectable: true, selected: ['billing-api'], sort: { id: 'name', dir: 'asc' }, sortAction: 'g.noop', columns: [
        { id: 'name', label: 'Name', width: '30%', strong: true, sortable: true }, { id: 'status', label: 'Status', width: '30%', cell: r => status(r.status) },
        { id: 'restarts', label: 'Restarts', align: 'center', width: '15%' }, { id: 'age', label: 'Age', align: 'center', width: '15%', muted: true },
      ], rows: [{ name: 'billing-api', status: ['danger', 'CrashLoopBackOff'], restarts: 16, age: '3d' }, { name: 'checkout-api', status: ['ok', 'Running'], restarts: 0, age: '3d' }, { name: 'inventory-worker', status: ['warn', 'Pending'], restarts: 0, age: '12m' }] }), true)}
      ${row(...charts(metrics, t).slice(0, 2).map((c, i) => box(['area', 'bar'][i], c)))}
      ${row(box('line', charts(metrics, t)[2], true))}
      ${row(...['default', 'compact'].map(density => box(`chart-card ${density}`, C.chartCard.render({
        title: 'Memory · checkout-api', value: '1024MiB', density: density === 'compact' ? density : undefined,
        caption: 'payments · 09:15–09:30 UTC',
        legend: [{ label: 'checkout-api', color: '--series-1' }, { label: 'inventory-worker', color: '--series-2' }],
        chart: { kind: 'line', height: 64, x: ['09:15', '09:20', '09:25', '09:30'], ticks: [0, 512, 1024], max: 1024, unit: 'MiB',
          series: [{ name: 'checkout-api', color: '--series-1', values: [320, 480, 390, 512] }, { name: 'inventory-worker', color: '--series-2', values: [128, 256, 128, 192] }] },
      }))))}
      ${row(box('chart-card compact · reference', C.chartCard.render({
        density: 'compact', title: 'Requests · checkout-api', value: '1.09req/s',
        legend: [{ label: 'checkout-api', color: '--series-1' }, { label: 'inventory-worker', color: '--series-2' }],
        chart: { kind: 'line', height: 64, x: ['09:15', '09:20', '09:25', '09:30'], ticks: [0, .544, 1.09], max: 1.09, unit: 'req/s', ref: { value: .8, label: 'Limit' },
          series: [{ name: 'checkout-api', color: '--series-1', values: [.2, .4, .3, .5] }, { name: 'inventory-worker', color: '--series-2', values: [.1, .3, .2, .4] }] },
      }), true))}
      ${row(box('property-grid · summary strip', C.propertyGrid.render({ layout: 'strip', items: [
        { id: 'stored', label: 'Stored', value: '0 B' }, { id: 'billing', label: 'Billing', value: 'Not charged' },
        { id: 'retention', label: 'Retention', value: null, meta: 'Not supplied' },
        { id: 'analytics', label: 'Analytics', value: 'Unsupported', actions: C.button.render({ label: 'Details', variant: 'link', menu: 'g.menu' }) },
      ] }), true))}
      ${row(box('property-grid · resource properties', C.propertyGrid.render({ items: [
        { id: 'ready', label: 'Ready containers', value: '1 / 1' }, { id: 'restarts', label: 'Restarts', value: 0 },
        { id: 'node', label: 'Node', value: 'ip-172-31-15-123.ap-southeast-2.compute.internal' },
        { id: 'identity', label: 'UID', value: 'e0729324-997e-40cc-883f-a00fe1e732e8', meta: 'payments · checkout-api', actions: html`${C.button.render({ label: 'Details', variant: 'secondary', size: 'sm', menu: 'g.menu' })}${C.button.render({ label: 'More', variant: 'ghost', size: 'sm', menu: 'g.menu' })}` },
      ] }), true))}
      ${row(box('checkbox · native mixed / disabled', row(C.checkbox.render({ ...st.checkSample, interactive: true, label: 'Choose example item', action: 'g.check' }), C.checkbox.render({ interactive: true, checked: true, disabled: true, label: 'Disabled example item' }))))}
      ${row(box('data-table · controlled selection / shared appearance', html`${C.dataTable.render({
        rowKey: 'id', rows: selectionRows, selected: st.selectedRows, selectable: true,
        selection: { label: 'Select displayed example items', rowLabel: row => row.name, allArg: { groupId: 'gallery', viewRevision: 0 } },
        columns: [{ id: 'name', label: 'Name', width: 'calc(var(--space-40) * 4)' }, { id: 'appearance', label: 'Style', width: 'var(--space-10)', cell: row => C.chartCard.seriesSwatch(row.appearance) }],
      })}${C.value.render({ text: `Displayed selected: ${selectionRows.filter(row => st.selectedRows.includes(row.id)).length} · Hidden selected: ${st.selectedRows.filter(id => !selectionRows.some(row => row.id === id)).length}` })}`, true))}
      ${row(box('chart-card · epoch / bounded joins', temporalExample(true)), box('chart-card · epoch / points only', temporalExample(false)))}
      ${row(box("flow-graph", C.flowGraph.render(trafficFlow()), true))}
      ${row(box('empty-state', C.emptyState.render({ icon: 'k8s-pod', title: t('wake.gallery.emptyTitle'), action: C.button.render({ label: t('wake.gallery.emptyAction'), variant: 'secondary', size: 'sm' }) })))}
      ${row(box('skeleton', html`${C.skeleton.render({ width: '60%' })}<div class="g-gap"></div>${C.skeleton.render({ width: '90%' })}<div class="g-gap"></div>${C.skeleton.render({ width: '40%' })}`), box('toast', html`<div class="g-toast">${C.toast.render({ title: 'rollout restart', body: 'checkout-api', tone: 'ok' })}<div class="g-gap"></div>${C.toast.render({ title: 'OOMKilled', body: 'billing-api', tone: 'error' })}</div>`))}
      ${box('sub-header, value, status-dot, pager', html`${C.subHeader.render({ icon: 'k8s-deployment', title: 'checkout-api', after: status(['warn', 'Progressing']), end: C.underlineTabs.render({ id: 'g-sub', tabs: [{ id: 'a', label: t('wake.detail.summary') }, { id: 'b', label: 'YAML' }], value: 'a', action: 'g.noop' }) })}${row(C.value.render({ text: 'RollingUpdate' }), C.value.render({ text: 'checkout:2.4.0', mono: true }), C.value.render({ text: '09:42', size: 'xs' }), ...['ok', 'warn', 'off', 'critical'].map(tone => C.statusDot.render({ tone })))}${C.pager.render({ page: 1, pages: 3 })}`, true)}
      ${row(box('scroll-area', html`<div class="g-scroll" data-scroll="g">${Array.from({ length: 30 }, (_, i) => html`<div class="g-line">checkout-api-7cf98-p4x2m · ${String(i).padStart(2, '0')}</div>`)}</div>`))}
    `)}
  </div>`;

  return {
    css: `
.g { max-width: var(--list-col-w); margin: 0 auto; padding: var(--space-10) var(--space-8) var(--space-16); }
.g-title { font-family: var(--font-display); font-size: var(--text-2xl); line-height: var(--leading-2xl); font-weight: var(--weight-display); margin: 0 0 var(--space-8); }
.g-sec { margin-bottom: var(--space-10); }
.g-h { font-family: var(--font-display); font-size: var(--text-section); font-weight: var(--weight-section); color: var(--muted-foreground); margin: 0 0 var(--space-3); }
.g-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-3); }
.g-box { flex: 1 1 0; min-width: 0; padding: var(--space-3); border-radius: var(--r-panel); corner-shape: var(--corner); box-shadow: inset 0 0 0 1px var(--border); }
.g-box.wide { flex-basis: 100%; }
.g-box:has(> .menu.popover) { flex: 0 0 auto; }
.g-l { font-size: var(--text-xs); color: var(--muted-foreground); margin-bottom: var(--space-2); font-family: var(--font-mono); }
.g-gap { height: var(--space-2); }
.g-muted { color: var(--muted-foreground); font-size: var(--text-xs); white-space: nowrap; }
.g-ctx { padding: var(--space-2) var(--space-3); border-radius: var(--r-control); background: var(--muted); color: var(--muted-foreground); font-size: var(--text-sm); }
.g-pal { position: relative; height: calc(var(--space-16) * 5); }
.g-pal .pal.g-static { position: absolute; top: 0; left: 0; transform: none; animation: none; width: 100%; }
.g-sb { width: var(--sidebar-w); background: var(--window); border-radius: var(--r-control); padding: var(--space-1) 0; }
.g-tb { background: var(--content); border-radius: var(--r-control); overflow: hidden; }
.g-panel { height: calc(var(--space-16) * 10); display: flex; flex-direction: column; background: var(--window); border-radius: var(--r-control); overflow: hidden; }
.g-chat-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }
.g-chat-bottom { flex-shrink: 0; padding: 0 var(--space-3) var(--space-3); }

.g-toast .toast { position: relative; inset: auto; transform: none; animation: none; margin-bottom: var(--space-2); }
.g-scroll { height: calc(var(--space-16) * 2.5); overflow-y: auto; font-family: var(--font-mono); font-size: var(--text-xs); }
.g-line { line-height: var(--leading-sm); color: var(--muted-foreground); }
.g-col { max-width: calc(var(--settings-col-w) - 2 * var(--space-8)); margin: 0 auto; padding: 0 var(--space-3_5); }
.g-tabs { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
.g-pic { color: var(--muted-foreground); display: grid; }
.g-files { height: calc(var(--space-16) * 4.5); border-radius: var(--r-control); overflow: hidden; box-shadow: inset 0 0 0 1px var(--border); }
.g-box > .dlg-layer { max-width: 100%; }
`,
    render,
    meta: () => ({ title: t('wake.gallery.title'), icon: 'palette' }),
    menus: { ...menus },
    dialogs,
    contextMenus: { 'g.ctx': arg => ({ items: [{ id: 'logs', label: t('wake.detail.logs') }, { id: 'copy', label: t('wake.gallery.copyName') }, { type: 'separator' }, { id: 'open', label: arg }] }) },
    actions: {
      'g.check': () => { st.checkSample = { checked: !st.checkSample.checked, indeterminate: false }; ctx.update(); },
      'kit.table.select': ({ arg }) => { if (!selectionRows.some(row => row.id === arg)) return; st.selectedRows = st.selectedRows.includes(arg) ? st.selectedRows.filter(id => id !== arg) : [...st.selectedRows, arg]; ctx.update(); },
      'kit.table.select-all': ({ arg }) => { if (arg?.groupId !== 'gallery' || arg.viewRevision !== 0) return; const all = selectionRows.every(row => st.selectedRows.includes(row.id)); st.selectedRows = all ? st.selectedRows.filter(id => !selectionRows.some(row => row.id === id)) : [...new Set([...st.selectedRows, ...selectionRows.map(row => row.id)])]; ctx.update(); },
      'g.switch': a => { st.sw[a.arg] = !st.sw[a.arg]; },
      'g.tab': a => { st.tab = a.arg; },
      'g.utab': a => { st.utab = a.arg; },
      'g.pick': a => { st.sel = a.arg?.value ?? a.arg; ctx.update(); },
      'g.noop': () => {},
      'g.multi': a => { st.multi = a.checked ? [...st.multi, a.arg.value] : st.multi.filter(x => x !== a.arg.value); ctx.update(); },
      'g.choice': a => { st.choice = a.arg; ctx.update(); },
      'g.hotkey': a => { st.hotkey = a.keys; },
      'g.hotkey-reset': () => { st.hotkey = ['⌥', 'Space']; ctx.update(); },
      'g.file': () => {},
      'kit.question.select': a => { if (a.id === 'g-ap-live') st.apSel = a.index; },
      'kit.question.choose': a => { if (a.id === 'g-ap-live') { st.approval = a.choice === 'deny' ? 'denied' : 'ran'; ctx.update(); } },
      'kit.question.cancel': a => { if (a.id === 'g-ap-live') { st.approval = 'denied'; ctx.update(); } },
      'kit.composer.send': () => {},
    },
  };
});
