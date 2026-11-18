/*
 * 보고서 칸(상세 칸): 인시던트 작업면의 내보내기 › 보고서로 연다. 단계에 맞는 문서 한 장(incident-report-doc)을 작업 하나씩 흘려 쓰고(작성 중 · 남은 작업,
 * 멈춤 · 이어서 쓰기, 다시 생성), kit 보고서 캔버스로 그린다. 내보내기(PDF 인쇄 시트, Markdown, 채널용 요약)는 같은 값이다.
 * 주소: 인시던트 cluster/:cluster/incidents/:id/report(해결 단계는 ?stage=resolved), 인시던트가 없는 날 cluster/:cluster/report(점검 보고서).
 */
import config from '../app.config.js';
import { bootPage, components as C, html, saveText, createReport, deleteSelectedOp, text } from '../../../kit/page/index.js';
import { sourceOff } from '../data/index.js';
import { alertList } from '../data/alerts.js';
import { isProblem } from '../data/kinds.js';
import { incidentReport, checkReport, markdownOf } from './incident-report-doc.js';

bootPage(config, ctx => {
  const { t, params, data } = ctx;
  let doc = null, inc = null, failure = null, loading = true, report = createReport(), queue = [], streaming = false, running = false;
  const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* 인시던트가 없는 날: 클러스터 화면이 읽는 같은 자료(Node, Pod, 활성 알림, 이벤트) */
  async function checkInput() {
    const c = params.cluster, get = (key, p) => data.get(key, { cluster: c, ...p }).catch(() => null);
    let alertsFailure = null;
    const [summary, nodes, pods, events, alerts] = await Promise.all([get('summary'), get('resources', { ns: '_all', kind: 'nodes' }), get('resources', { ns: '_all', kind: 'pods' }), get('events', { ns: '_all' }),
      data.get('alerts', { cluster: c }).catch(e => { alertsFailure = e; return null; })]);
    const now = Date.parse(summary?.timeBasis?.referenceAt ?? '') || Date.now();
    return { cluster: c, now, nodes: nodes ?? [], pods: pods ?? [], events: Array.isArray(events) ? events : events?.rows ?? [], alerts: alerts ? alertList(alerts) : null, alertsOff: text(alertsFailure?.source ? sourceOff(alertsFailure.source) : 'wake.find.c.read'), problems: (pods ?? []).filter(isProblem) };
  }
  async function load() {
    try {
      if (params.id) { inc = await data.get('incident', { cluster: params.cluster, id: params.id, ...(ctx.query.stage ? { stage: ctx.query.stage } : {}) }); doc = inc ? incidentReport(t, inc) : null; }
      else doc = checkReport(t, await checkInput());
    } catch (e) { failure = e; doc = null; }
    loading = false; ctx.api.setMeta?.(meta()); start();
  }
  const meta = () => ({ title: params.id ? t('wake.rep.title') : t('wake.rep.checkTitle'), icon: 'file-text',
    ...(inc ? { context: { icon: 'incident', title: `${inc.number} ${inc.title}`, sub: `${inc.namespace} · ${inc.cluster}` } } : {}) });

  /* 작업 하나: 빠지는 줄은 흐려진 뒤 적용, 그리고 짧게 쉰다. 움직임 줄이기에서는 바로 */
  async function stream() {
    if (running) return; running = true;
    while (streaming && queue.length) {
      const op = queue[0], root = document.querySelector('[data-rc="wake-report"]');
      if (root && !reduced()) await C.reportCanvas.play(root, report.state, op);
      if (!streaming) break;
      queue.shift(); const { say, ...kitOp } = op; report.apply(kitOp);
      ctx.update(); await sleep(reduced() ? 0 : 650);
    }
    running = false; if (!queue.length) streaming = false; ctx.update();
  }
  function start() { report = createReport(); queue = doc ? [...doc.ops] : []; streaming = queue.length > 0; ctx.update(); void stream(); }

  /* 칸 머리의 도구: 작성 상태 · 다시 생성 · 내보내기(선택이 있으면 kit이 선택 도구로 바꾼다) */
  function tools() {
    const left = queue.length;
    const state = streaming ? html`${C.statusIcon.render({ kind: 'busy', text: t('wake.rep.writing', { n: left }) })}${C.button.render({ label: t('wake.rep.stop'), variant: 'link', action: 'wake.rep.stop' })}`
      : left ? html`${C.statusIcon.render({ kind: 'idle', text: t('wake.rep.stoppedLeft', { n: left }) })}${C.button.render({ label: t('wake.rep.resume'), variant: 'link', action: 'wake.rep.resume' })}` : '';
    return html`${state}${streaming ? '' : C.button.render({ label: t('wake.rep.regen'), icon: 'arrow-rotate-clockwise', variant: 'ghost', size: 'sm', round: true, action: 'wake.rep.regen' })}${C.button.render({ label: t('wake.rep.export'), icon: 'download', variant: 'ghost', size: 'sm', round: true, menu: 'wake.rep.export' })}`;
  }
  const fileName = () => `${inc?.number ?? `${params.cluster}-check`}-report.md`;

  const column = children => C.pageColumn.render({ width: 'list', children });
  return {
    init: () => { void load(); },
    meta,
    afterRender: root => { root.dataset.wakeReport = ''; },
    render: () => {
      if (loading) return column(C.statusIcon.render({ kind: 'busy', text: t('wake.res.loading') }));
      if (failure || !doc) return column(C.emptyState.render({ icon: 'file-text', plainIcon: true, title: failure?.kind === 'unconfigured' ? text(sourceOff(failure.source)) : t('wake.rep.missing') }));
      return column(C.reportCanvas.render({ id: 'wake-report', report: report.state, canUndo: report.canUndo, action: 'wake.rep.canvas', head: doc.head, tools: tools() }));
    },
    menus: {
      'wake.rep.export': () => ({ align: 'end', items: [
        { id: 'pdf', label: t('wake.inc.export.pdf'), icon: 'download', action: 'wake.rep.pdf' },
        { id: 'md', label: t('wake.inc.export.md'), icon: 'file-text', action: 'wake.rep.md' },
        { id: 'channel', label: t('wake.inc.export.channel'), icon: 'copy', action: 'wake.rep.channel' }] }),
    },
    actions: {
      'wake.rep.stop': () => { streaming = false; ctx.update(); },
      'wake.rep.resume': () => { if (queue.length) { streaming = true; ctx.update(); void stream(); } },
      'wake.rep.regen': () => { if (!streaming) start(); },
      'wake.rep.canvas': async a => {
        const p = a?.arg?.type ? a.arg : a;
        if (p.type === 'delete' && report.state.selected.length) { const root = document.querySelector('[data-rc="wake-report"]'); if (root && !reduced()) await C.reportCanvas.play(root, report.state, deleteSelectedOp(report.state)); }
        const res = C.reportCanvas.handle(report, p);
        if (res.refer?.length) ctx.api.openPanel({ prompt: t('wake.rep.refer', { n: res.refer.length, words: res.refer.map(x => String(x.label).slice(0, 80)).join(' · ') }) });
        ctx.update();
      },
      'wake.rep.pdf': () => C.reportCanvas.print(document, { title: doc.head.title, layout: () => ctx.update() }),
      'wake.rep.md': () => saveText(fileName(), markdownOf(t, report.state, doc.head)),
      'wake.rep.channel': () => ctx.api.action('wake.copy', { arg: { value: doc.channel } }),
    },
  };
});
