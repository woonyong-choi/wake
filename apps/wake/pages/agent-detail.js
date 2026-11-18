/*
 * 에이전트 상세 칸(시뮬레이션 agentDetail()): 주소 cluster/:cluster/agent/:name.
 * 머리(wake-agent · 상태 · 에이전트 · namespace · 클러스터) → 에이전트 카드(버전 · heartbeat · watch, 상태 · Ready·Desired · 캐시 · 이미지)
 * → heartbeat 지연(지난 6시간) → 리소스 링크(DaemonSet) → RBAC → watch 리소스. heartbeat·watch·캐시·지연 이력은 Node별 Lease(agent.heartbeat), RBAC는 묶인 역할.
 */
import config from '../app.config.js';
import { bootPage, components as C, html } from '../../../kit/page/index.js';
import { hms } from './incident-parts.js';
import { clusterNameOf, readRow } from './view-parts.js';
import { agentFacts, readyText, stateMark, stateWords, latencyChart, latencyText } from './setup-parts.js';

bootPage(config, ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  let agent = null, beats = null, phase = 'loading';
  const folded = {};
  async function load() {
    phase = 'loading'; ctx.update();
    try { agent = await data.get('agent', { cluster: id }); beats = await data.get('agentBeats', { cluster: id }).catch(() => null); phase = agentFacts(agent).missing ? 'missing' : 'ready'; }
    catch (e) { phase = e?.status === 403 ? 'forbidden' : 'error'; }
    ctx.update();
  }
  const card = (key, label, items, body, open = true) => C.summaryBar.render({ label, open: key in folded ? !folded[key] : open, /* folded: 사람이 접은 카드(true)·편 카드(false) */ toggle: { action: 'wake.ag.fold', arg: key }, items: [{ id: 't', label: '', value: label }, ...items], body });
  const context = f => [t('wake.home.agent'), f?.namespace, clusterNameOf(ctx, id)].filter(Boolean).join(' · ');
  function head() {
    const f = phase === 'ready' ? agentFacts(agent) : null;
    return C.pageHeader.render({ icon: 'brand-kubernetes', title: params.name, size: 'sm', after: f ? stateMark(t, f.state) : '', context: context(f) });
  }
  function body() {
    const f = agentFacts(agent), beatAt = f.beat ? hms(Date.parse(f.beat.at)) : '';
    const summary = card('sum', params.name, [...(f.version ? [{ id: 'v', label: t('wake.tool.version'), value: f.version }] : []), ...(beatAt ? [{ id: 'b', label: 'heartbeat', value: beatAt }] : []), ...(f.watch ? [{ id: 'w', label: 'watch', value: String(f.watch.length) }] : [])],
      C.propertyGrid.render({ items: [
        { id: 'd', label: t('wake.tool.state'), value: stateWords(t, f.state) },
        ...(f.silent.length ? [{ id: 's', label: 'heartbeat', value: t('wake.agent.noBeat', { nodes: f.silent.join(', ') }) }] : []),
        ...(f.ready ? [{ id: 'r', label: 'DaemonSet', value: readyText(f.ready) }] : []),
        ...(f.beat?.eventsPerSec != null ? [{ id: 'c', label: t('wake.agent.cache'), value: t('wake.agent.cacheRate', { n: f.beat.eventsPerSec }) }] : []),
        ...(f.image ? [{ id: 'i', label: 'Image', value: C.value.render({ text: f.image, mono: true }) }] : [])] }));
    const samples = beats?.samples ?? [], end = Date.parse(beats?.at ?? '') || Date.now();
    const chart = samples.length ? card('beat', t('wake.agent.beatChart'), [{ id: 'v', label: '', value: f.beat?.latencyMs != null ? latencyText(f.beat.latencyMs) : '' }],
      latencyChart(t, { id: 'agent', title: t('wake.agent.beatChart'), samples, end })) : '';
    const ds = agent?.identity?.uid ? C.button.render({ label: `DaemonSet ${agent.identity.name}`, icon: 'arrow-up-right', variant: 'link', action: 'kit.navigate', arg: { address: `wake://cluster/${encodeURIComponent(id)}/ns/${encodeURIComponent(agent.identity.namespace)}/daemonsets/${encodeURIComponent(agent.identity.name)}` } }) : '';
    const rbac = f.rules ? card('rbac', 'RBAC', [{ id: 'n', label: '', value: String(f.rules.length) }], C.dataTable.render({ clip: true, rowKey: 'resource', rows: f.rules, reveal: true, columns: [
      { id: 'resource', label: t('wake.agent.resource'), mono: true }, { id: 'verbs', label: 'verbs', width: 'calc(var(--space-16) * 2.6)' }, { id: 'scope', label: t('wake.agent.scope'), muted: true, optional: true }] }), false) : '';
    const watched = f.watch ? card('watch', t('wake.agent.watched'), [{ id: 'n', label: '', value: String(f.watch.length) }], C.value.render({ text: f.watch.join(' · '), mono: true }), false) : '';
    return html`${summary}${chart}${ds ? C.listToolbar.render({ scope: ds }) : ''}${rbac}${watched}`;
  }
  const content = () => (phase === 'ready' ? body() : phase === 'missing' ? C.emptyState.render({ icon: 'wake-agent', plainIcon: true, title: t('wake.s.ag.none') }) : readRow(t, phase, 'wake.ag.retry'));
  void load();
  return {
    render: () => html`${C.pageColumn.render({ width: 'list', header: true, children: head() })}${C.pageColumn.render({ width: 'list', children: content(), scroll: true })}`,
    meta: () => ({ title: params.name, icon: 'wake-agent', context: { icon: 'wake-agent', title: params.name, sub: clusterNameOf(ctx, id) } }),
    afterRender: root => { root.dataset.wakeView = 'detail'; },
    actions: {
      'wake.ag.retry': () => load(),
      'wake.ag.fold': a => { folded[a.arg] = !a.open; },
    },
  };
}, { scroll: false });
