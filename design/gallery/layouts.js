/*
 * 배치 바꾸기 화면: 같은 구성 요소를 다르게 묶어도 그대로 동작하는지 보여 준다.
 *  1. AI 패널을 왼쪽에 둔 창 틀
 *  2. 사이드바 구역 순서를 바꾼 사이드바
 *  3. 다른 정의로 만든 설정 페이지(같은 settings 페이지 종류, 정의만 다름)
 */
import config from '../../apps/wake/app.config.js';
import { bootPage, createSettingsPage, components as C, html } from '../../kit/page/index.js';
/* 배치 바꾸기의 보기 자료(이 화면 전용, 앱은 읽지 않음) */
const CLUSTERS = [{ id: 'wake-sample', ctx: 'wake-sample', state: 'ok', kind: 'kind', where: 'wake-sample', version: 'v1.31.2', agent: true, perm: 'read', ns: 'payments' }];
const CONVERSATIONS = [
  { id: 'c-restart', title: 'checkout-api 재시작 원인', preview: 'p4x2m 컨테이너가 메모리 한도 256Mi에서 OOMKilled', time: '10:15' },
  { id: 'c-ready', title: 'billing-api 시작 실패', preview: 'PAYMENT_PROVIDER_URL 설정 누락, exitCode=1', time: '10:15' },
  { id: 'c-mem', title: 'payments namespace 메모리 사용량', preview: 'checkout-api Pod working set과 256Mi 한도 비교', time: '10:15' },
];


const raw = s => ({ raw: s });

/* 3번에 쓰는 다른 설정 정의: 당번·알림 */
const ONCALL = {
  groups: [{ label: raw('당번'), pages: [{ id: 'oncall', label: raw('당번·알림'), icon: 'bell', sections: [
    { title: raw('당번 순서'), groups: [[
      { id: 'primary', title: raw('주 당번'), description: raw('payments namespace 경보를 먼저 받음'), icon: 'people-circle', control: { type: 'value', text: raw('admin-approver') } },
      { id: 'secondary', title: raw('보조 당번'), description: raw('10분 안에 응답이 없으면 넘김'), icon: 'people-circle', control: { type: 'value', text: raw('platform-team') } },
    ]] },
    { title: raw('알림'), groups: [[
      { id: 'crash', title: raw('CrashLoopBackOff'), description: raw('재시작이 5회를 넘으면 알림'), control: { type: 'switch', key: 'oncall.crash' } },
      { id: 'oom', title: raw('OOMKilled'), description: raw('메모리 limit 초과로 종료되면 알림'), control: { type: 'switch', key: 'oncall.oom' } },
      { id: 'quiet', title: raw('조용한 시간'), control: { type: 'select', key: 'oncall.quiet', options: [{ id: 'none', label: raw('없음') }, { id: 'night', label: raw('00:00–07:00') }] } },
    ]] },
  ] }] }],
};

bootPage(config, async ctx => {
  const { t } = ctx;
  const [clusters, convs] = structuredClone([CLUSTERS, CONVERSATIONS]);
  const row = C.sidebarRow.render;
  const sections = {
    clusters: C.section.render({ id: 'l-clusters', label: t('wake.section.clusters'), body: clusters.map(c => row({ icon: 'k8s-cluster', label: c.id, ctx: c.ctx })) }),
    pinned: C.section.render({ id: 'l-pinned', label: t('wake.section.pinned'), variant: 'collection', body: [row({ icon: 'k8s-namespace', label: 'payments', ctx: 'seoul-lab' }), row({ icon: 'k8s-deployment', label: 'checkout-api', ctx: 'payments' })] }),
    conversations: C.section.render({ id: 'l-convs', label: t('wake.section.conversations'), body: convs.slice(0, 3).map(c => row({ icon: 'message', label: c.title })) }),
    tabs: C.section.render({ id: 'l-tabs', label: t('wake.section.tabs'), body: [row({ icon: 'plus-medium', label: t('tab.new'), add: true }), row({ icon: 'k8s-pod', label: 'billing-api', ctx: 'payments', selected: true, closable: true, arg: 'l1' })] }),
  };
  const sidebar = order => C.sidebar.render({ top: C.iconButton.render({ icon: 'sidebar', variant: 'tertiary', size: 'sm', tip: t('shell.sidebar.hide') }), sections: order.map(k => sections[k]), bottom: '' });

  const settingsCtx = { ...ctx, config: { ...config, settings: ONCALL }, params: {}, settings: () => ({ 'oncall.crash': true, 'oncall.oom': true, 'oncall.quiet': 'night' }) };
  const settingsPage = createSettingsPage(settingsCtx);
  await settingsPage.init();

  return {
    css: `${settingsPage.css}
.l { padding: var(--space-10) var(--space-8) var(--space-16); }
.l-h { font-family: var(--font-display); font-size: var(--text-section); font-weight: var(--weight-section); color: var(--muted-foreground); margin: var(--space-10) 0 var(--space-3); }
.l-h:first-child { margin-top: 0; }
.l-box { height: calc(var(--space-16) * 9); border-radius: var(--r-panel); corner-shape: var(--corner); overflow: hidden; background: var(--window); box-shadow: inset 0 0 0 1px var(--border); }
.l-row { display: flex; gap: var(--space-3); }
.l-sb { width: var(--sidebar-w); background: var(--window); border-radius: var(--r-control); padding: var(--space-1) 0; }
`,
    render: () => html`<div class="l">
      <h2 class="l-h">1. ${t('wake.layout.reorder')}</h2>
      <div class="l-row"><div class="l-sb">${sidebar(['clusters', 'pinned', 'conversations', 'tabs'])}</div><div class="l-sb">${sidebar(['tabs', 'conversations', 'pinned', 'clusters'])}</div></div>
      <h2 class="l-h">2. ${t('wake.layout.otherSettings')}</h2>
      <div class="l-box">${settingsPage.render()}</div>
    </div>`,
    meta: () => ({ title: t('wake.layout.title'), icon: 'palette' }),
    actions: { ...settingsPage.actions, 'kit.composer.send': () => {} },
    menus: settingsPage.menus,
  };
});
