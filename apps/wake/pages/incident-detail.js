/*
 * 인시던트 작업면(시뮬레이션 workspace): 위에서부터 머리 줄(대상 · 영향 · 당번 · 다음 공유 · 조치), 머리 값(심각도 · 클러스터 · namespace · 감지),
 * 출처 칩, 행동 줄(왼쪽 검색 칸, 오른쪽 AI에게 묻기 · 내보내기 · 링크 복사), 그리고 인시던트 한 건이 상태 흐름 카드 하나다:
 * 감지 → 범위 → 원인 → 조치 → 확인 → 결과 줄, 사람이 결정할 것 한 줄, 단계마다 접히는 구역(범위, 타임라인, 원인, 조치, 확인, 기록).
 * 자료는 incident.workspace 한 번(허브 응답 모양, 관문 2 전에는 Wake 인시던트 저장소 연결 안 됨). 근거 번호는 근거 상세 칸을 연다.
 * 본문 안 돌아가기 링크는 없다(경로 막대가 맡음).
 */
import config, { incidentAddress, viewAddress } from '../app.config.js';
import { bootPage, components as C, html, saveText, text } from '../../../kit/page/index.js';
import { sourceOff } from '../data/index.js';
import { status } from './parts.js';
import { hm, hms, ymd, when, duration, evidenceTag, gradeOf, severityStatus, requesterMark, sourceBadge, auditSummary, routeSteps, compareOption, recoveryWord } from './incident-parts.js';
import { KIND_LIST, restartsColumn } from '../data/kinds.js';
import { CHANGE_LANES } from '../data/home.js';
import { compareResources, compareHistory } from '../data/table-order.js';
import { clusterSearch } from './cluster-search.js';
import { linksOf, recoveryTone } from '../data/incident-model.js';
import { incidentReport, finished, markdownOf } from './incident-report-doc.js';
import { toolViews, readOf, read, rememberFound } from '../data/conn-view.js';
import { readRow } from './view-parts.js';

const CELLS = ['observe', 'basis', 'interpret', 'verify', 'unknown'], COUNTED = new Set(['observe', 'basis', 'unknown']);
const pluralOf = kind => KIND_LIST.find(k => k.kind === kind)?.plural;

bootPage(config, ctx => {
  const { t, params, data } = ctx;
  let inc = null, failure = null, loading = true, focusSection = null, cardOpen = true;
  let inventory = read.unread(), hub = read.unread();
  const search = clusterSearch(ctx, params.cluster);
  const opened = {};

  async function load(refresh = false) {
    const sourceRead = Promise.all([
      readOf(data.get('clusterTools', { cluster: params.cluster, discovery: {}, refresh })),
      readOf(data.get('sourceStates', { cluster: params.cluster, refresh })),
    ]).then(([tools, sources]) => {
      inventory = tools; hub = sources;
      rememberFound(ctx.settings, ctx.api?.setSetting, params.cluster, inventory);
      ctx.update();
    });
    try { inc = await data.get('incident', { cluster: params.cluster, id: params.id, ...(ctx.query.stage ? { stage: ctx.query.stage } : {}) }); failure = null; }
    catch (e) { failure = e; inc = null; }
    loading = false; ctx.api.setMeta?.(meta()); ctx.update();
    if (refresh) await sourceRead;
  }

  /* 경로 막대 끝 칸은 내부 id가 아니라 인시던트 번호와 제목(시뮬레이션 경로 "인시던트 › INC-2142 제목") */
  const crumbs = () => { const own = config.routes.find(r => r.id === 'incident')?.crumbs?.(params) ?? []; return inc ? [...own.slice(0, -1), { label: { raw: `${inc.number} ${inc.title}` } }] : own; };
  /* 이 화면은 행동 줄에 "AI에게 묻기"가 있으므로 위 막대 단추는 숨긴다(시뮬레이션 자리 하나, 결정 2026-11-16) */
  const meta = () => ({ title: inc?.number ?? params.id, icon: 'incident', ownAsk: true,
    ...(inc ? { crumbs: crumbs(), context: { icon: 'incident', title: `${inc.number} ${inc.title}`, sub: `${inc.namespace} · ${inc.cluster}` } } : {}) });
  const resolved = () => inc.phase === 'resolved';
  /* 고른 조치: 승인 기록에 저장된 것이 먼저(지금 후보에서 빠졌어도 승인한 계획 그대로) */
  const chosen = () => { const o = inc.options.find(x => x.id === inc.chosen) ?? null, ex = inc.execution; return ex?.plan ? { ...(o ?? {}), id: inc.chosen, title: ex.title ?? o?.title, plan: ex.plan } : o; };
  const elapsed = () => (resolved() ? inc.resolvedAt : inc.now) - inc.detectedAt;

  /* ---------- 머리 ---------- */
  function impactText() {
    const i = inc.impact; if (!i) return '';
    /* 고정한 근거의 마지막 표본이 오래됐거나 출처를 지금 읽지 못하면 "지금"이 아니라 그 표본 시각으로 */
    return t(i.stale ? 'wake.inc.head.impactValueAt' : 'wake.inc.head.impactValue', { label: i.label, now: `${i.now}${i.unit}`, at: hm(i.at), base: `${i.baseline}${i.unit}`, limit: `${i.threshold}${i.unit}`, from: hm(i.from) });
  }
  function focusLine() {
    const o = chosen(), tg = inc.target, impact = impactText();
    return C.summaryBar.items([
      { id: 'target', label: t('wake.inc.head.target'), value: `${tg.namespace} · ${tg.kind} ${tg.name}`, shrink: true, priority: 4 },
      ...(impact ? [{ id: 'impact', label: t('wake.inc.head.impact'), value: impact, shrink: true, priority: 3 }] : []),
      { id: 'oncall', label: t('wake.inc.head.oncall'), value: C.avatar.render({ name: inc.oncall.name, size: 'sm', showName: true }), priority: 2 },
      ...(resolved() ? [] : [{ id: 'next', label: t('wake.inc.head.nextUpdate'), value: hm(inc.nextShare), priority: 2 }]),
      ...(o ? [{ id: 'action', label: t('wake.inc.head.action'), value: o.title, priority: 1 }] : []),
    ], { wrap: 'lines' });
  }
  function headMeta() {
    return C.summaryBar.items([
      { id: 'sev', label: '', value: severityStatus(inc.severity) },
      { id: 'where', label: '', value: `${inc.cluster} · ${inc.namespace}` },
      { id: 'at', label: '', value: t('wake.inc.head.detected', { at: `${ymd(inc.detectedAt)} ${hms(inc.detectedAt)}` }) },
    ], { wrap: 'lines' });
  }
  /* 출처 칩은 홈과 같은 규칙(사용자 결정 2026-11-15): 이 클러스터에 연결한 도구만. Kubernetes API는 도구가 아니라 칩이 없고(클러스터 연결은 사이드바·경로 막대), 연결하지 않은 도구(idle)도 칩이 없다.
     누르면 그 클러스터 본문의 도구 화면에서 그 도구 */
  const sourceSet = () => toolViews({ cluster: params.cluster, settings: ctx.settings(), inventory, hub });
  const chipSources = () => sourceSet().included.flatMap(v => {
    const source = inc.sources.find(s => s.id === v.kind);
    return source ? [{ ...source, state: v.health, last: Date.parse(v.last ?? '') || null }] : [];
  });
  const chips = () => (chipSources().length ? C.sourceChips.render({ action: 'wake.inc.source', items: chipSources().map(s => ({ id: s.id, name: s.name, icon: s.icon, state: s.state, detail: s.detail, last: s.last ? hms(s.last) : '' })) }) : '');
  const actionRow = () => C.listToolbar.render({
    start: search.field(),
    end: html`${C.button.render({ label: t('wake.action.ask'), icon: 'ai', variant: 'ghost', size: 'sm', round: true, action: 'wake.inc.ask' })}${C.button.render({ label: t('wake.inc.export'), icon: 'download', variant: 'ghost', size: 'sm', round: true, menu: 'wake.inc.export' })}${C.button.render({ label: t('wake.inc.copyLink'), icon: 'copy', variant: 'ghost', size: 'sm', round: true, action: 'wake.inc.copyLink' })}`,
  });
  /* ---------- 구역 ---------- */
  const isOpen = (id, fallback) => opened[id] ?? fallback;
  const counts = rows => ({ bad: rows.filter(r => r.status[0] === 'danger').length, warn: rows.filter(r => r.status[0] === 'warn').length });
  function scopeSection() {
    const rows = inc.scope.map(r => ({ ...r, id: `${pluralOf(r.kind) ?? r.kind}/${r.name}` })).sort(compareResources), { bad, warn } = counts(rows);
    const lead = rows.find(r => r.status[0] === 'danger') ?? rows.find(r => r.status[0] === 'warn') ?? rows[0];
    const table = C.dataTable.render({ clip: true, gridLines: true, rowKey: 'id', rows, rowAction: 'wake.inc.row', reveal: true, columns: [
      { id: 'name', label: 'Name', lead: r => ({ icon: KIND_LIST.find(k => k.kind === r.kind)?.icon }) },
      { id: 'status', label: 'Status', fit: true, cell: r => status(r.status) },
      { ...restartsColumn({ width: 'calc(var(--space-16) + var(--space-2))' }), cell: r => ((r.restarts ?? '') === '' ? '' : restartsColumn().cell(r)) },
      { id: 'change', label: t('wake.inc.scope.change'), muted: true, optional: true, width: 'calc(var(--space-16) * 2.4)', cell: r => (r.change ? `${r.change.text} ${when(r.change.at, inc.now)}` : '') }] });
    return { id: 'scope', label: t('wake.inc.stage.scope'), open: isOpen('scope', false),
      items: [...(lead ? [{ id: 'p', label: lead.kind, value: html`${status(lead.status)} ${lead.name}`, shrink: true, priority: 3 }] : []),
        ...(bad ? [{ id: 'f', label: t('wake.inc.scope.fail'), value: String(bad), tone: 'danger', priority: 1 }] : []), ...(warn ? [{ id: 'w', label: t('wake.inc.scope.warn'), value: String(warn), tone: 'warn', priority: 1 }] : [])],
      body: table };
  }
  function timeSection() {
    const marks = inc.timeline, s = ms => Math.floor(ms / 1000);
    const first = Math.min(...marks.map(m => m.at)), end = resolved() ? inc.resolvedAt : inc.now;
    const from = s(first) - Math.max(120, Math.round((s(end) - s(first)) * 0.06)), to = s(end) + 60;
    const lead = [...marks].sort((a, b) => b.at - a.at).find(m => m.lane !== 'symptom');
    return { id: 'time', label: t('wake.inc.stage.time'), open: isOpen('time', false),
      items: lead ? [{ id: 'l', label: t('wake.inc.time.last'), value: `${lead.kind} ${when(lead.at, inc.now)}` }] : [],
      body: C.changeTimeline.render({ label: t('wake.inc.time.changes'), from, to, now: s(inc.now), home: { from, to },
        /* 이 인시던트 구간에 표시가 있는 줄만(빈 줄이 높이만 차지하지 않음), 순서는 그대로 */
        lanes: CHANGE_LANES.filter(([id]) => marks.some(m => m.lane === id)).map(([id, icon]) => ({ id, label: t(`wake.inc.lane.${id}`), icon })),
        marks: marks.map(m => ({ id: m.id, lane: m.lane, at: s(m.at), ...(m.end != null ? { end: s(m.end) } : {}), tone: m.tone, tip: { time: hm(m.at), kind: m.kind, title: m.title, text: m.text } })) }) };
  }
  function causeSection() {
    const ch = inc.chain, g = gradeOf(t, ch.grade), src = `${t(`wake.inc.src.${ch.source.kind}`)} · ${ch.source.name}${ch.source.version ? ` ${ch.source.version}` : ''}`;
    const cells = CELLS.map(id => ({ id, label: t(`wake.inc.cell.${id}`), count: COUNTED.has(id), items: ch.cells[id] ?? [] }));
    return { id: 'cause', label: t('wake.inc.stage.cause'), open: isOpen('cause', !resolved()),
      items: [{ id: 'g', label: g.label, value: ch.conclusion, shrink: true, priority: 3 }],
      body: html`${C.reasoningChain.render({ grade: g, source: src, conclusion: ch.conclusion, cells, refAction: 'wake.inc.ref', refLabel: n => evidenceTag(t, inc.evidence?.find(e => String(e.n) === String(n))) })}${inc.rule ? C.statusIcon.render({ kind: 'idle', icon: 'shield-check', text: t('wake.inc.cause.rule', { name: inc.rule.name, version: inc.rule.version }) }) : ''}` };
  }
  /* 고른 조치의 실행 단계: 승인 기록에 저장된 계획(없으면 후보의 계획)과 영수증으로만 상태를 정한다(승인만으로 적용 완료라고 하지 않음) */
  const steps = () => { const plan = chosen()?.plan; return plan ? routeSteps(plan, inc.execution?.receipts) : []; };
  function actSection() {
    const o = chosen();
    if (!o && resolved() && !inc.options.length) return null; /* nothing was chosen and nothing is left to choose */
    const body = !o ? C.actionCompare.render({ action: 'wake.inc.choose', options: inc.options.map(x => compareOption(t, x)) })
      : html`${steps().map(s => C.stepRow.render({ state: s.state, text: t(`wake.inc.route.${s.key}`) }))}`;
    return { id: 'act', label: t('wake.inc.stage.act'), open: isOpen('act', !o),
      items: o ? [{ id: 'o', label: t('wake.inc.act.selected'), value: o.title }] : [{ id: 'n', label: t('wake.inc.act.candidates'), value: String(inc.options.length) }], body };
  }
  function verifySection() {
    const v = inc.verify; if (v.verifyFrom == null) return null;
    const name = id => inc.sources.find(s => s.id === id)?.name ?? '';
    return { id: 'verify', label: t('wake.inc.stage.verify'), open: isOpen('verify', true),
      items: [{ id: 's', label: t('wake.inc.verify.stable'), value: duration(t, Math.min(v.stable, v.need)) },
        ...(resolved() ? [{ id: 'a', label: t('wake.inc.verify.resolved'), value: hm(inc.resolvedAt) }] : [{ id: 'p', label: t('wake.inc.verify.toPass'), value: duration(t, Math.max(0, v.need - v.stable)) }])],
      body: C.verifyCard.render({ min: Math.max(2, Math.ceil(v.need / v.cadence) + 1), windows: v.windows,
        conditions: v.conditions.map(c => ({ id: c.id, label: c.label, state: c.state ?? 'watch', value: name(c.source) })) }) };
  }
  function recordSection() {
    const rows = inc.audit.map(r => ({ ...r, id: r.id ?? JSON.stringify([r.at, r.action, r.target, r.summary]) })).sort(compareHistory), one = new Set(rows.map(r => ymd(r.at))).size === 1;
    const table = C.dataTable.render({ clip: true, rowKey: 'id', rows, reveal: true, columns: [
      { id: 'at', label: one ? `${t('wake.inc.record.time')} · ${ymd(rows[0].at)}` : t('wake.inc.record.time'), time: true, width: one ? 'calc(var(--space-16) * 2)' : 'calc(var(--space-40) * 1.1)', cell: r => (one ? hms(r.at) : `${ymd(r.at)} ${hms(r.at)}`) },
      { id: 'summary', label: t('wake.inc.record.who'), cell: r => html`${requesterMark(r)} ${auditSummary(t, r)} ${sourceBadge(t, r)}` },
      { id: 'permission', label: t('wake.inc.record.perm'), muted: true, optional: true, width: 'calc(var(--space-40) * 1.4)' }] });
    return { id: 'record', label: t('wake.inc.stage.record'), open: isOpen('record', resolved()),
      items: [{ id: 'n', label: t('wake.inc.record.items'), value: String(rows.length) },
        resolved() ? { id: 'd', label: t('wake.inc.record.toRecovery'), value: duration(t, elapsed()) } : { id: 'd', label: t('wake.inc.record.since'), value: t('wake.inc.record.notRecovered', { dur: duration(t, elapsed()) }) }],
      body: table };
  }

  /* ---------- 상태 흐름 ---------- */
  function unit() {
    const { bad, warn } = counts(inc.scope), ok = inc.scope.length - bad - warn, o = chosen(), done = resolved(), g = gradeOf(t, inc.chain.grade);
    const steps = [
      { id: 'scope', label: t('wake.inc.stage.scope'), state: 'done', text: bad ? t('wake.inc.flow.fail', { n: bad }) : warn ? t('wake.inc.flow.warn', { n: warn }) : t('wake.inc.flow.targetOk'),
        meta: [bad && warn ? t('wake.inc.flow.warn', { n: warn }) : '', t('wake.inc.flow.ok', { n: ok })].filter(Boolean).join(' · ') },
      { id: 'cause', label: t('wake.inc.stage.cause'), state: 'done', text: g.label },
      /* recovered with no action chosen: the act step is passed by, never left waiting for a choice */
      o ? (applied => ({ id: 'act', label: t('wake.inc.stage.act'), state: applied ? 'done' : 'wait', text: t(applied ? 'wake.inc.flow.applyDone' : 'wake.inc.flow.approved'), meta: o.title }))(steps().length > 0 && steps().every(s => s.state === 'done'))
        : done ? { id: 'act', label: t('wake.inc.stage.act'), state: 'idle', text: t('wake.inc.flow.noAct') }
        : { id: 'act', label: t('wake.inc.stage.act'), state: 'wait', text: t('wake.inc.flow.chooseWait'), meta: t('wake.inc.flow.actCount', { n: inc.options.length }) },
      /* 대상이 지워져 닫힌 인시던트는 확인을 통과한 것이 아니다: 그 결과 낱말(증상 회복)로 */
      { id: 'verify', label: t('wake.inc.stage.verify'), state: done && !inc.target.gone ? 'done' : 'idle', text: done ? (inc.target.gone ? recoveryWord(t, inc.recovery) : t('wake.inc.flow.pass')) : t('wake.inc.flow.afterApply'), meta: done ? hm(inc.resolvedAt) : '' },
    ];
    const opts = inc.options;
    const decision = done || !opts.length ? null : { tone: 'warn', text: opts.length > 1 ? t('wake.inc.dec.more', { title: opts[0].title, n: opts.length - 1 }) : opts[0].title,
      actions: [{ id: 'go', label: t('wake.inc.dec.seeAct'), action: 'wake.inc.focus', arg: 'act', variant: 'default' }] };
    return { id: inc.id, name: inc.title, tool: inc.alert.source,
      headline: { tone: done ? recoveryTone(inc.recovery) : 'warn', text: t(`wake.inc.phase.${inc.phase}`), meta: duration(t, elapsed()) },
      event: { id: 'alert', kind: 'webhook', icon: 'bell', keyword: inc.alert.name, active: true, at: hm(inc.detectedAt) }, steps,
      results: done ? [{ id: 'r', label: t('wake.inc.flow.result'), tone: recoveryTone(inc.recovery), text: recoveryWord(t, inc.recovery) }] : [],
      decision, sections: [scopeSection(), timeSection(), causeSection(), actSection(), verifySection(), recordSection()].filter(Boolean) };
  }

  /* ---------- 내보내기: 보고서 칸, 그리고 보고서와 같은 값의 Markdown · 채널용 요약(incident-report-doc 하나) ---------- */
  const stage = ctx.query.stage ? `?stage=${encodeURIComponent(ctx.query.stage)}` : '';

  const column = children => C.pageColumn.render({ width: 'list', children });
  return {
    screen: { state: { q: '' }, search: { key: 'q', scope: 'cluster' } },
    init: () => { void load(); },
    meta,
    render: () => {
      if (loading) return column(C.statusIcon.render({ kind: 'busy', text: t('wake.res.loading') }));
      if (failure) return column(C.emptyState.render({ icon: 'incident', plainIcon: true, title: failure?.kind === 'unconfigured' ? text(sourceOff(failure.source)) : t('wake.home.incidentsFailed') }));
      if (!inc) return column(C.emptyState.render({ icon: 'incident', plainIcon: true, title: t('wake.home.noIncidents') }));
      return column(html`
        ${focusLine()}
        ${headMeta()}
        ${chips()}
        ${sourceSet().retry ? readRow(t, inventory.error?.status === 403 || hub.error?.status === 403 ? 'forbidden' : 'error', 'wake.inc.retry') : ''}
        ${actionRow()}
        ${search.results()}
        ${C.statusFlow.render({ header: false, compact: true, label: t('wake.inc.flow.label'), open: cardOpen, toggle: { action: 'wake.inc.card' }, unit: unit(), detail: 'stack', section: 'wake.inc.section',
          labels: { listening: t('wake.inc.flow.listening'), event: t('wake.inc.flow.event'), result: t('wake.inc.flow.result'), source: t('wake.inc.flow.source') } })}`);
    },
    afterRender: root => {
      root.dataset.wakeIncident = '';
      if (!focusSection) return;
      root.querySelector(`[data-sfl-sec="${focusSection}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      focusSection = null;
    },
    menus: {
      'wake.inc.export': () => ({ align: 'end', items: [
        { id: 'report', label: t('wake.inc.export.report'), icon: 'file-text', action: 'wake.inc.report' },
        { id: 'md', label: t('wake.inc.export.md'), icon: 'download', action: 'wake.inc.exportMd' },
        { id: 'channel', label: t('wake.inc.export.channel'), icon: 'copy', action: 'wake.inc.exportChannel' }] }),
    },
    actions: {
      ...search.actions,
      'wake.inc.retry': () => load(true),
      'wake.inc.card': a => { cardOpen = !!a.open; },
      'wake.inc.section': a => { opened[a.arg?.id] = !!a.open; },
      'wake.inc.focus': a => { opened[a.arg] = true; cardOpen = true; focusSection = a.arg; ctx.update(); },
      'wake.inc.row': a => { const [plural, name] = String(a.arg).split('/'), r = inc.scope.find(x => x.name === name);
        if (r && pluralOf(r.kind)) ctx.api.navigate(`wake://${['cluster', inc.cluster, 'ns', r.namespace, plural, name].map(encodeURIComponent).join('/')}`, { presentation: 'detail' }); },
      'wake.inc.ref': a => ctx.api.navigate(`${incidentAddress(inc)}/evidence/${encodeURIComponent(a.arg)}`, { presentation: 'detail' }),
      'wake.inc.source': a => ctx.api.navigate(`${viewAddress(params.cluster, 'tools')}?tool=${encodeURIComponent(a.arg)}`),
      'wake.inc.ask': () => ctx.api.openPanel({}),
      'wake.inc.choose': a => { const o = inc.options.find(x => x.id === a.arg); if (o) ctx.api.openPanel({ prompt: t(o.plan.route === 'manual' ? 'wake.inc.ask.manual' : 'wake.inc.ask.approve', { number: inc.number, title: o.title }) }); },
      'wake.inc.copyLink': () => ctx.api.action('wake.copy', { arg: { value: linksOf({}, inc).app } }),
      'wake.inc.report': () => ctx.api.navigate(`${incidentAddress(inc)}/report${stage}`, { presentation: 'detail' }),
      'wake.inc.exportChannel': () => ctx.api.action('wake.copy', { arg: { value: incidentReport(t, inc).channel } }),
      'wake.inc.exportMd': () => { const doc = incidentReport(t, inc); return saveText(`${inc.number}-report.md`, markdownOf(t, finished(doc), doc.head)); },
    },
  };
});
