/*
 * 클러스터 › 에이전트(시뮬레이션 agentPage()): 머리(에이전트 · DaemonSet wake-agent · 클러스터 | 클러스터 전체 검색) → 검색 결과
 * → 클러스터 에이전트 묶음(연결 행 하나: wake-agent 버전 · namespace · heartbeat · Ready·Desired, 상태가 부르는 동작 하나, 상태). 행을 누르면 에이전트 상세 칸.
 * 값은 클러스터 안 DaemonSet wake-agent를 읽은 agent.status와 Node별 heartbeat Lease(agent.heartbeat).
 */
import config from '../app.config.js';
import { bootPage, components as C, html, text } from '../../../kit/page/index.js';
import { connView } from '../data/conn-view.js';
import { clusterSearch } from './cluster-search.js';
import { clusterNameOf, readRow } from './view-parts.js';
import { agentFacts, readyText, stateAction, STATE_KIND } from './setup-parts.js';
import { hms } from './incident-parts.js';

bootPage(config, ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  let agent = null, phase = 'loading', active = false, started = false;
  const search = clusterSearch(ctx, id);
  async function load() {
    phase = 'loading'; ctx.update();
    try { agent = await data.get('agent', { cluster: id }); phase = 'ready'; }
    catch (e) { phase = e?.status === 403 ? 'forbidden' : 'error'; }
    ctx.update();
  }
  function body() {
    const head = C.pageHeader.render({ icon: 'wake-agent', title: t('wake.home.agent'), sub: ['DaemonSet wake-agent', clusterNameOf(ctx, id)], size: 'home', end: search.field() });
    if (phase !== 'ready') return html`${head}${search.results()}${readRow(t, phase, 'wake.agent.retry')}`;
    const f = agentFacts(agent), word = t(`source.${f.state}`);
    const line = f.missing ? t('wake.s.ag.none') : [f.namespace, f.beat ? `heartbeat ${hms(Date.parse(f.beat.at))}` : '', readyText(f.ready), f.beat?.latencyMs != null ? t('wake.agent.latency', { ms: f.beat.latencyMs }) : '', f.silent.length ? t('wake.agent.noBeat', { nodes: f.silent.join(', ') }) : ''].filter(Boolean).join(' · ');
    const title = ['wake-agent', f.version].filter(Boolean).join(' ');
    const live = (ctx.settings?.()['wake.conn.live'] || {})[FLOW];
    const row = f.missing || (live && live.state !== 'connected') ? installRow(f, title)
      : C.connectionRow.render({ id: 'agent', brand: 'brand-kubernetes', title, description: line, state: f.state === 'ok' ? undefined : word, statusLabel: word,
        kind: STATE_KIND[f.state], attention: active, rowAction: 'wake.agent.open', action: stateAction(f.state, { connect: { action: 'wake.agent.retry' }, detail: { action: 'wake.agent.open' } }) });
    return html`${head}${search.results()}${C.settingsSection.render({ title: t('wake.agent.section'), children: C.settingsGroup.render({ children: [row] }) })}`;
  }
  /* 설치 안 됨·설치 중: 설정 › 에이전트와 같은 연결 흐름(셸이 돌리고 wake.conn.live로 알림)을 이 행에 그림(단계·상태·멈춘 이유와 그 동작, R4-02).
     앱이 설치할 차트의 이미지가 이 버전에 없으면(agent installImage) 설치 단추 대신 그 이유 */
  const FLOW = 'agent-' + id;
  function installRow(f, title) {
    const img = f.missing ? agent?.installImage : null;
    const blocked = img && img.published !== true ? (img.reason === 'agent_values_unreadable' ? 'wake.flow.c.chartUnreadable' : 'wake.flow.c.imageUnpublished') : null;
    const v = connView(ctx.settings?.() || {}, FLOW, { connect: blocked ? null : { label: 'wake.s.ag.install', icon: 'download', action: 'wake.agent.install', arg: id }, idleText: blocked || 'wake.s.ag.none' });
    const button = b => C.button.render({ size: 'sm', variant: 'secondary', ...b, label: text(b.label) });
    return C.connectionRow.render({ id: 'agent', brand: 'brand-kubernetes', title, description: text(v.description), kind: v.kind, busy: v.busy, attention: v.attention || active,
      state: v.word ? text(v.word) : undefined, statusLabel: text(v.word || v.description), action: v.action ? { ...v.action, label: text(v.action.label) } : undefined,
      extra: v.extra.length ? html`${v.extra.map(button)}` : undefined, flow: v.flow });
  }
  return {
    screen: { state: { q: '' }, ai: [], search: { key: 'q', scope: 'cluster' } },
    init: () => { if (started) return; started = true; void load(); },
    render: () => C.pageColumn.render({ width: 'home', children: body() }),
    afterRender: root => { root.dataset.wakeView = 'agent'; },
    onDetail: p => { if (p.state !== 'open' && active) { active = false; ctx.update(); } },
    /* 설치 흐름이 움직이면(wake.conn.live) 그 행을 다시 그리고, 연결되면 에이전트를 다시 읽음 */
    onSettings: () => { const live = (ctx.settings?.()['wake.conn.live'] || {})[FLOW]; if (live?.state === 'connected' && agentFacts(agent).missing && phase === 'ready') void load(); else ctx.update(); },
    meta: () => ({ title: t('wake.home.agent'), icon: 'wake-agent' }),
    actions: {
      ...search.actions,
      'wake.agent.retry': () => load(),
      'wake.agent.open': () => { active = true; ctx.update(); ctx.api.navigate(`wake://cluster/${encodeURIComponent(id)}/agent/wake-agent`, { presentation: 'detail' }); },
    },
  };
});
