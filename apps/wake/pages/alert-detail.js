/*
 * 알림 상세 칸(시뮬레이션 alertDetail()): 주소 cluster/:cluster/alerts/:id(Alertmanager 지문, 지난 알림은 지문-시작).
 * 머리(알림 이름 · 상태 · 알림 · namespace · 클러스터 · 머리 끝 인시던트 번호 링크) → 구간 → 요약(심각도 · 시작 · 지속 또는 resolved) → 대상 링크
 * → Annotations(한 줄에 하나) → expr 값(규칙 expr의 범위 질의, 임계값 점선, firing·resolved 표시) → 알림 규칙(code-block) → 상태 이력 → Labels → Receivers → 이력(90일).
 */
import config, { incidentAddress } from '../app.config.js';
import { bootPage, components as C, html, text } from '../../../kit/page/index.js';
import { sourceOff } from '../data/index.js';
import { when, duration, axisTime } from './incident-parts.js';
import { shownTime, num } from './parts.js';
import { clusterNameOf, sourceLines, readRow, alertState } from './view-parts.js';
import { alertList, alertSteps, alertSubject, sameAlert, thresholdOf } from '../data/alerts.js';
import { windowOf, stepOf, HOUR } from '../data/home.js';

const A = (...p) => 'wake://' + p.map(encodeURIComponent).join('/');

bootPage(config, ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  let phase = 'loading', snap = null, incidents = [], expr = null, range = null;
  const sources = sourceLines(ctx, id), folded = {};
  const now = () => Date.parse(snap?.at ?? '') || Date.now();
  const rows = () => alertList({ ...snap, incidents, stale: { prometheus: !!sources.of('prometheus', now())?.stale, alertmanager: !!sources.of('alertmanager', now())?.stale } });
  const alert = () => rows().find(a => a.id === params.id) ?? null;
  /* 처음 구간: 지난 1시간 안에 시작한 알림은 1시간, 그 밖은 울린 구간 앞뒤(시뮬레이션 alertWindow) */
  const windowFor = a => { if (a.at >= now() - HOUR) return { preset: '1h' }; const end = a.end ?? now(), pad = Math.max(15 * 60_000, (end - a.at) / 2);
    return { from: Math.floor((a.at - pad) / 1000), to: Math.ceil(Math.min(now(), end + pad) / 1000), live: !a.end }; };
  async function load() {
    phase = 'loading'; ctx.update();
    await sources.read();
    try {
      snap = await data.get('alerts', { cluster: id }); incidents = await data.get('incidents', { cluster: id }).catch(() => []);
      const a = alert(); phase = a ? 'ready' : 'missing';
      if (a) { range ??= windowFor(a); void readExpr(); }
    } catch (e) { phase = e?.kind === 'unconfigured' ? 'unconfigured' : e?.status === 403 ? 'forbidden' : 'error'; }
    ctx.update();
  }
  async function readExpr() {
    const a = alert(); if (!a?.rule?.expr) { expr = null; return; }
    const { from, to } = windowOf(range, now()), step = stepOf(from, to);
    expr = { state: 'loading' }; ctx.update();
    let off = null;
    const r = await data.get('alertExpr', { cluster: id, rule: { group: a.rule.group, name: a.name }, from, to, step }).catch(e => { if (e?.kind === 'unconfigured') off = e.source ?? 'prometheus'; return null; });
    expr = off ? { state: 'off', source: off } : r ? { state: 'ready', from, to, step: r.step, query: r.query, samples: (r.data?.result?.[0]?.values ?? []).map(([s, v]) => ({ at: s * 1000, value: Number(v) })) } : { state: 'error' };
    ctx.update();
  }

  const card = (key, label, items, body, open = true) => C.summaryBar.render({ label, open: key in folded ? !folded[key] : open, /* folded: 사람이 접은 카드(true)·편 카드(false) */ toggle: { action: 'wake.ad.fold', arg: key }, items: [{ id: 't', label: '', value: label }, ...items], body });
  function head(a) {
    const inc = a.incident ? C.button.render({ label: a.incident.number, icon: 'arrow-up-right', variant: 'link', action: 'kit.navigate', arg: { address: incidentAddress({ cluster: id, id: a.incident.id }) } }) : '';
    return C.pageHeader.render({ icon: 'bell', title: a.name, tip: a.name, size: 'sm', after: alertState(a.state), context: [t('wake.view.alerts'), a.ns, clusterNameOf(ctx, id)].filter(Boolean).join(' · '), end: inc });
  }
  function exprCard(a) {
    if (!a.rule?.expr) return '';
    const th = thresholdOf(a.rule.expr), title = t('wake.al.exprValue');
    const items = th ? [{ id: 'th', label: t('wake.al.threshold'), value: String(th.value) }] : [];
    if (!expr || expr.state !== 'ready') return card('expr', title, items, expr?.state === 'off' ? C.emptyState.render({ title: text(sourceOff(expr.source)), variant: 'line' }) : expr?.state === 'error' ? C.emptyState.render({ title: t('wake.find.c.read'), variant: 'line' }) : readRow(t, 'loading', 'wake.ad.retry'));
    const { from, to } = expr, label = axisTime(from, to);
    const marks = sameAlert(rows(), a).flatMap(x => [{ at: x.at, kind: 'firing', tone: 'danger', label: `firing · ${when(x.at, 0)}` }, ...(x.end ? [{ at: x.end, kind: 'resolved', tone: 'info', label: `resolved · ${when(x.end, 0)}` }] : [])]).filter(m => m.at >= from && m.at <= to);
    const refs = th ? [{ value: th.value, label: t('wake.al.thresholdOf', { v: String(th.value) }), tone: 'limit' }] : [];
    const chart = C.chartCard.render({ title, value: '', widget: true, density: 'compact', info: { title: t('wake.metric.query'), rows: [{ label: 'step', value: `${expr.step}s` }, { label: t('wake.view.range'), value: `${when(from, 0)} – ${when(to, 0)}` }], code: { lang: 'promql', text: expr.query } },
      legend: [{ label: title, color: '--series-1' }, ...refs.map(r => ({ label: r.label, color: '--chart-limit', dash: true }))],
      chart: { kind: 'area', height: 170, bleed: true, fade: true, reading: true, axes: true, refs, events: marks.map(m => ({ at: m.at / 1000, time: label(m.at), label: m.label, kind: m.kind, tone: m.tone })),
        series: [{ key: 'expr', name: title, color: '--series-1', dash: 'none', pattern: 'solid', observations: expr.samples.map((o, j) => ({ at: o.at / 1000, value: o.value, label: label(o.at), joinPrevious: j > 0 })) }],
        timeAxis: { from: from / 1000, to: to / 1000, maxGapSeconds: expr.step * 1.5 }, id: 'alert:expr', rangeAction: 'wake.ad.zoom', interactive: 'full' } });
    return card('expr', title, items, chart);
  }
  function body(a) {
    const subject = alertSubject(a.labels); /* 알림이 말하는 객체(목록의 대상 칸과 같은 것) */
    const summary = C.summaryBar.render({ label: t('wake.view.alerts'), items: [{ id: 's', label: t('wake.al.severity'), value: a.severity }, { id: 'f', label: t('wake.al.start'), value: shownTime(a.at) },
      a.end == null ? (a.state ? { id: 'd', label: t('wake.al.duration'), value: duration(t, now() - a.at) } : null) : { id: 'e', label: 'resolved', value: shownTime(a.end) }].filter(Boolean) });
    const link = subject ? C.listToolbar.render({ scope: C.button.render({ label: `${subject.kind} ${subject.name}`, icon: 'arrow-up-right', variant: 'link', action: 'kit.navigate', arg: { address: A('cluster', id, 'ns', subject.namespace || '_all', subject.plural, subject.name) } }) }) : '';
    const linkOf = v => (/^https:\/\//.test(v) ? C.button.render({ label: v, tip: v, icon: 'arrow-up-right', variant: 'link', href: v }) : v);
    const ann = Object.entries(a.annotations);
    const notes = ann.length ? card('ann', 'Annotations', [], C.propertyGrid.render({ layout: 'stack', items: ann.map(([k, v]) => ({ id: k, label: k, value: linkOf(String(v)) })) })) : '';
    const r = a.rule, ruleText = r ? [`- alert: ${a.name}`, `  expr: ${r.expr}`, ...(r.for ? [`  for: ${r.for}`] : []), ...(Object.keys(r.labels).length ? ['  labels:', ...Object.entries(r.labels).map(([k, v]) => `    ${k}: ${v}`)] : []),
      ...(Object.keys(r.annotations).length ? ['  annotations:', ...Object.entries(r.annotations).map(([k, v]) => `    ${k}: ${v}`)] : [])].join('\n') : '';
    const rule = r ? card('rule', t('wake.al.rule'), r.for ? [{ id: 'f', label: 'for', value: r.for }] : [], C.codeBlock.render({ path: `${r.group} · ${String(r.file ?? '').split('/').pop()}`, syntax: 'yaml', text: ruleText, wrap: true, file: `${a.name}.yaml` })) : '';
    const steps = alertSteps(a), stepsCard = card('steps', t('wake.al.stateFlow'), a.state ? [{ id: 's', label: '', value: a.state }] : [],
      html`${steps.map(x => C.stepRow.render({ state: x.state === 'firing' && a.state === 'firing' ? 'run' : 'done', text: `${x.state} · ${t(`wake.al.step.${x.state}`, { for: r?.for ?? '' })}`, meta: shownTime(x.at) }))}`);
    const labels = Object.entries(a.labels), labelCard = card('labels', 'Labels', [{ id: 'n', label: '', value: num(labels.length) }], html`${labels.map(([k, v]) => C.badge.render({ label: `${k}=${v}`, tone: 'neutral', size: 'sm' }))}`);
    const amOld = sources.of('alertmanager', now());
    const recv = a.receivers.length ? card('recv', 'Receivers', [{ id: 'n', label: '', value: num(a.receivers.length) }],
      html`${amOld?.stale ? C.staleLine.render({ kind: amOld.state === 'perm' ? 'perm' : 'error', text: [t('wake.view.toolDown', { tool: 'Alertmanager' }), amOld.last ? t('wake.view.lastCollected', { at: when(amOld.last, 0) }) : ''].filter(Boolean).join(' · ') }) : ''}${C.dataTable.render({ clip: true, rowKey: 'r', rows: a.receivers.map(x => ({ r: x })), columns: [{ id: 'r', label: 'receiver' }] })}`, false) : '';
    const same = sameAlert(rows(), a), hist = card('hist', t('wake.al.history'), [{ id: 'n', label: snap?.historyDays ? t('wake.al.d90', { n: snap.historyDays }) : '', value: num(same.length) }],
      C.dataTable.render({ clip: true, rowKey: 'id', rows: same.slice(0, 10), rowAction: 'wake.ad.open', activeKey: a.id, reveal: true, columns: [
        { id: 'state', label: t('wake.al.state'), width: 'calc(var(--space-16) * 1.5)', cell: x => alertState(x.state) },
        { id: 'at', label: t('wake.al.start'), time: true, width: 'calc(var(--space-40) * .9)', cell: x => when(x.at, now()) },
        { id: 'd', label: t('wake.al.duration'), kind: 'number', cell: x => (x.end ? duration(t, x.end - x.at) : t('wake.al.ongoing')) }] }), same.length > 1);
    return html`${summary}${link}${notes}${exprCard(a)}${rule}${stepsCard}${labelCard}${recv}${hist}`;
  }
  const rangeControl = () => C.listToolbar.render({ time: C.timeRange.render({ id: 'alert-range', value: range ?? { preset: '1h' }, action: 'wake.ad.range', fallback: '1h', now: Math.floor(now() / 1000), label: t('wake.view.range') }) });
  const header = () => { const a = phase === 'ready' ? alert() : null;
    return a ? html`${head(a)}${sources.line('prometheus', 'Prometheus', now())}${rangeControl()}` : C.pageHeader.render({ icon: 'bell', title: t('wake.view.alerts'), size: 'sm', context: clusterNameOf(ctx, id) }); };
  const content = () => (phase === 'ready' ? body(alert()) : phase === 'missing' ? C.emptyState.render({ icon: 'bell', plainIcon: true, title: t('wake.al.gone') })
    : phase === 'unconfigured' ? C.emptyState.render({ icon: 'bell', plainIcon: true, title: t('wake.view.toolOff', { tool: 'Prometheus · Alertmanager' }) }) : readRow(t, phase, 'wake.ad.retry'));
  void load();
  return {
    render: () => html`${C.pageColumn.render({ width: 'list', header: true, children: header() })}${C.pageColumn.render({ width: 'list', children: content(), scroll: true })}`,
    meta: () => { const a = phase === 'ready' ? alert() : null; return { title: a?.name ?? t('wake.view.alerts'), icon: 'bell', context: { icon: 'bell', title: a?.name ?? params.id, sub: [a?.ns, clusterNameOf(ctx, id)].filter(Boolean).join(' · ') } }; },
    afterRender: root => { root.dataset.wakeView = 'detail'; },
    actions: {
      'wake.ad.retry': () => load(),
      'wake.ad.fold': a => { folded[a.arg] = !a.open; },
      'wake.ad.range': a => { range = a.preset ? { preset: a.preset } : { from: a.from, to: a.to, live: !!a.live }; void readExpr(); },
      'wake.ad.zoom': a => { if (Number.isFinite(a.from) && Number.isFinite(a.to)) { range = { from: Math.floor(a.from), to: Math.ceil(a.to), live: false }; void readExpr(); } },
      'wake.ad.open': a => ctx.api.navigate(`wake://cluster/${encodeURIComponent(id)}/alerts/${encodeURIComponent(String(a.arg))}`),
    },
  };
}, { scroll: false });
