/*
 * 근거 상세(상세 칸): 인시던트 근거 스냅샷 하나(6.1)를 읽은 그대로 보인다. 다시 읽지 않는다.
 * 머리(근거 번호 · 종류 · 인시던트 · 수집 시각) → 출처가 지금 끊겼으면 "끊기기 전 자료" 줄 → 요약 막대(근거 · 구간 · 건수, 마스킹) → 질의 줄 →
 * 본문: 로그는 원본 줄 번호 그대로(찾은 줄 표시, 빠진 줄 생략 행), 지표는 그 시계열과 limits 선, 나머지는 받은 원문(코드 보기).
 */
import config from '../app.config.js';
import { bootPage, components as C, html, text } from '../../../kit/page/index.js';
import { sourceOff } from '../data/index.js';
import { freshness } from '../data/incident-model.js';
import { hms, ymd, seriesChart } from './incident-parts.js';

const KIND_ICON = { logs: 'terminal', metric: 'chart-line', events: 'k8s-event', app: 'tool-gitops', object: 'file-text', incidents: 'incident' };

bootPage(config, ctx => {
  const { t, params, data } = ctx;
  let inc = null, failure = null, loading = true;
  async function load() {
    try { inc = await data.get('incident', { cluster: params.cluster, id: params.id }); } catch (e) { failure = e; }
    loading = false; ctx.api.setMeta?.(meta()); ctx.update();
  }
  const ev = () => inc?.evidence.find(e => String(e.n) === String(params.n)) ?? null;
  const meta = () => ({ title: t('wake.inc.ev.n', { n: params.n }), icon: KIND_ICON[ev()?.kind] ?? 'file-text',
    ...(inc ? { context: { icon: 'incident', title: `${inc.number} ${inc.title}`, sub: `${inc.namespace} · ${inc.cluster}` } } : {}) });
  const source = e => inc.sources.find(s => s.id === e.source);
  const range = e => (e.window.from === e.window.to ? hms(e.window.from) : `${hms(e.window.from)} – ${hms(e.window.to)}`);

  function body(e) {
    if (e.kind === 'logs') return C.logView.render({ lines: e.result.lines.map(l => ({ n: l.n, at: hms(l.at), level: l.level, text: l.text })), hits: e.hits, gaps: true, query: e.key });
    if (e.kind === 'metric') {
      const s = e.result.series[0];
      return C.chartCard.render(seriesChart({ title: s.labels.container ?? e.target.name, name: s.labels.pod, unit: s.unit, samples: s.samples, refs: s.refs ?? [], from: e.window.from, to: e.window.to }));
    }
    const text = e.result.object ?? '';
    const diff = text.split('\n').filter(l => !l.startsWith('---')).every(l => /^[-+ ]/.test(l));
    return C.codeBlock.render({ path: `evidence-${e.n}.${diff ? 'diff' : 'yaml'}`, ...(diff ? { diff: true } : { syntax: 'yaml' }), text, wrap: true });
  }

  const column = children => C.pageColumn.render({ width: 'chat', children });
  return {
    init: () => { void load(); },
    meta,
    afterRender: root => { root.dataset.wakeEvidence = ''; },
    render: () => {
      if (loading) return column(C.statusIcon.render({ kind: 'busy', text: t('wake.res.loading') }));
      const e = ev();
      if (failure || !e) return column(C.emptyState.render({ icon: 'search', plainIcon: true, title: failure?.kind === 'unconfigured' ? text(sourceOff(failure.source)) : t('wake.inc.ev.missing') }));
      const src = source(e), f = freshness(Object.fromEntries(inc.sources.map(s => [s.id, s])), e.source, inc.now);
      const stale = src && f.stale && f.state !== 'unknown';
      return column(html`
        ${C.pageHeader.render({ icon: KIND_ICON[e.kind] ?? 'file-text', title: t('wake.inc.ev.n', { n: e.n }), size: 'sm',
          context: [t(`wake.inc.ev.kind.${e.kind}`), inc.title, t('wake.inc.ev.collected', { at: `${ymd(e.collectedAt)} ${hms(e.collectedAt)}` })].join(' · ') })}
        ${stale ? C.staleLine.render({ kind: 'idle', icon: 'clock', text: t('wake.inc.ev.before', { src: src.name, at: hms(e.collectedAt) }) }) : ''}
        ${C.summaryBar.render({ label: t('wake.inc.ev.n', { n: e.n }), items: [
          { id: 'k', label: '', value: `${t('wake.inc.ev.n', { n: e.n })} · ${t(`wake.inc.ev.kind.${e.kind}`)}` },
          { id: 'r', label: t('wake.inc.ev.range'), value: range(e) },
          ...(e.hits ? [{ id: 'h', label: t('wake.inc.ev.hits', { key: e.key }), value: String(e.hits.length) }] : []),
          { id: 'n', label: t('wake.inc.ev.total'), value: String(e.total) },
          ...(e.masked ? [{ id: 'm', label: t('wake.inc.ev.masked'), value: String(e.masked) }] : [])] })}
        ${C.queryLine.render({ source: src?.name, query: e.query, state: e.sourceState === 'limited' ? 'ok' : e.sourceState })}
        ${body(e)}`);
    },
  };
});
