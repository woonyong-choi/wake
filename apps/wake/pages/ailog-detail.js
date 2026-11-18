/*
 * AI 작업 기록 상세 칸(시뮬레이션 aiLogDetail()): 주소 cluster/:cluster/ailog/:id(감사 행 id).
 * 머리(한 일 · 결과 · AI 작업 기록 · 클러스터) → 기록 카드(인시던트 · 시각, 한 줄에 값 하나: 요청 · 도구 · 범위 · 실행 주체·권한 · 모델 · 대상 · 질의 · 근거 · 양 · 마스킹). 값이 없는 줄은 두지 않는다.
 */
import config from '../app.config.js';
import { bootPage, components as C, html } from '../../../kit/page/index.js';
import { hms, ymd, requesterMark, sourceBadge, auditSummary, auditResult, auditIcon, auditSize } from './incident-parts.js';
import { clusterNameOf, readRow } from './view-parts.js';

bootPage(config, ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  let phase = 'loading', row = null, open = true;
  async function load() {
    phase = 'loading'; ctx.update();
    try { row = (await data.get('audit', { cluster: id })).rows.find(r => r.id === params.id) ?? null; phase = row ? 'ready' : 'missing'; }
    catch (e) { phase = e?.kind === 'unconfigured' ? 'unconfigured' : e?.status === 403 ? 'forbidden' : 'error'; }
    ctx.update();
  }
  const context = () => [t('wake.view.ailog'), clusterNameOf(ctx, id)].join(' · ');
  function head() {
    if (phase !== 'ready') return C.pageHeader.render({ icon: 'ai', title: t('wake.view.ailog'), size: 'sm', context: clusterNameOf(ctx, id) });
    return C.pageHeader.render({ icon: auditIcon(row), title: auditSummary(t, row), tip: auditSummary(t, row), size: 'sm', after: auditResult(t, row.result), context: context() });
  }
  function body() {
    const r = row, label = t('wake.ailog.record');
    const items = [
      { id: 'q', label: t('wake.ailog.request'), value: html`${requesterMark(r)} ${sourceBadge(t, r)}` },
      { id: 'tool', label: t('wake.ailog.tool'), value: r.tool ?? '' },
      { id: 'scope', label: t('wake.ailog.scope'), value: r.scope ?? '' },
      { id: 'e', label: t('wake.ailog.exec'), value: [r.executor, r.permission].filter(Boolean).join(' · ') },
      { id: 'm', label: t('wake.ailog.model'), value: r.model ?? t('wake.ailog.noModel') },
      { id: 'tg', label: t('wake.ailog.target'), value: r.target ?? '' },
      { id: 'x', label: t('wake.ailog.query'), value: r.query ? C.value.render({ text: r.query, mono: true }) : '' },
      { id: 'ev', label: t('wake.ailog.evidence'), value: (r.evidence ?? []).map(n => `[${n}]`).join(' ') },
      { id: 'n', label: t('wake.ailog.size'), value: auditSize(t, r.size) },
      { id: 'k', label: t('wake.ailog.masked'), value: r.masked ? t('wake.ailog.maskedN', { n: r.masked }) : '' },
    ].filter(x => x.value !== '' && x.value != null);
    return C.summaryBar.render({ label, open, toggle: { action: 'wake.aid.fold' }, items: [{ id: 'i', label: '', value: r.incidentNumber ?? label }, { id: 'a', label: t('wake.inc.record.time'), value: `${ymd(r.at)} ${hms(r.at)}` }],
      body: C.propertyGrid.render({ layout: 'stack', items }) });
  }
  const content = () => (phase === 'ready' ? body() : phase === 'missing' ? C.emptyState.render({ icon: 'ai', plainIcon: true, title: t('wake.ailog.none') })
    : phase === 'unconfigured' ? C.emptyState.render({ icon: 'ai', plainIcon: true, title: t('wake.view.toolOff', { tool: t('wake.ailog.source') }) }) : readRow(t, phase, 'wake.aid.retry'));
  void load();
  return {
    render: () => html`${C.pageColumn.render({ width: 'list', header: true, children: head() })}${C.pageColumn.render({ width: 'list', children: content(), scroll: true })}`,
    meta: () => ({ title: row ? auditSummary(t, row) : t('wake.view.ailog'), icon: 'ai', context: { icon: 'ai', title: row ? auditSummary(t, row) : params.id, sub: context() } }),
    afterRender: root => { root.dataset.wakeView = 'detail'; },
    actions: {
      'wake.aid.retry': () => load(),
      'wake.aid.fold': a => { open = !!a.open; },
    },
  };
}, { scroll: false });
