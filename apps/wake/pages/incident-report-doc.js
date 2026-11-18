/*
 * 보고서 문서(spec/screens/report.md#SCR-REPORT): 인시던트 작업면과 같은 자료(incident.workspace 모양)에서 단계에 맞는 문서 한 장을 kit 보고서 작업(op) 목록으로 만든다.
 *   열린 인시던트 = 상황 공유: 1 지금 상황 → 2 영향(그림) → 3 원인과 근거(3.1~ 이벤트 · 로그 · 지표) → 4 진행 기록 → 5 부록
 *   해결된 인시던트 = 사후 분석: 1 요약 → 2 영향(최종값, 그림) → 3 타임라인 → 4 원인(4.1~ 근거) → 5 감지 → 6 대응(6.1 복구 확인)
 *     → 7 잘된 점과 아쉬운 점(기록에서) → 8 후속 조치 → 9 부록
 *   인시던트가 없는 날 = 점검 보고서: 요약 → 클러스터 상태 → 활성 알림 → Warning 이벤트 → 문제 Pod
 * 화면 칸(보고서 캔버스), PDF, Markdown, 채널용 요약이 이 한 곳의 값을 쓴다. 작업마다 AI 칸 단계 줄로 보일 말(say)이 붙는다.
 * 숫자는 자료의 순수 함수(incident-model) 결과를 그대로 쓰고 다시 계산하지 않는다. 시각 글은 incident-parts 하나.
 */
import { createReport, toMarkdown } from '../../../kit/page/index.js';
import { verifyCounts, causeStatus, deadlineCheck } from '../data/incident-model.js';
import { evidenceTag, hm, hms, ymd, docTime, zoneOf, duration, gradeOf, recoveryWord, routeKeys, routeOf, changeOf, seriesChart } from './incident-parts.js';
import { num } from './parts.js';

const MIN = 60_000, H = 60 * MIN, D = 24 * H;
const stop = s => (/[.!?]$/.test(s) ? s : `${s}.`);
const uniq = xs => [...new Set(xs)];
const sec = ms => Math.floor(ms / 1000);
const stepWord = ms => (ms >= H ? `${ms / H}h` : ms >= MIN ? `${ms / MIN}m` : `${ms / 1000}s`);
const add = (block, say, extra = {}) => ({ op: 'add', block, say, ...extra });
/* 원문 칸(로그·조회·메시지)은 칸이 아니라 표 아래 발췌: excerpt에 행 키 */
const SOURCE = { kubernetes: 'Kubernetes API', prometheus: 'Prometheus', loki: 'Loki', argocd: 'Argo CD', github: 'GitHub', alertmanager: 'Alertmanager' };

/** 인시던트 한 건의 문서: { kind: 'status' | 'postmortem', head, ops, channel } */
export function incidentReport(t, inc) {
  const done = inc.phase === 'resolved', day = inc.detectedAt, zone = zoneOf(day), at = ms => docTime(ms, day), full = ms => `${ymd(ms)} ${hms(ms)}`;
  const past = s => (done && typeof s === 'string' ? s.replaceAll(t('wake.rep.now.word'), t('wake.rep.then')) : s); /* 해결 문서는 "지금"을 쓰지 않는다(N5) */
  const snap = (source, query, ms) => ({ source, query, at: sec(ms) });
  const ref = n => t('wake.rep.ref', { n });
  const oncall = t('wake.rep.oncallWho', { name: inc.oncall.name });
  const chosen = inc.options.find(o => o.id === inc.chosen) ?? null, next = inc.options[0] ?? null;
  const status = causeStatus(inc.chain, inc.rule), held = status === 'hypothesis';
  const grade = gradeOf(t, inc.chain.grade).label;
  const causeLabel = held ? t('wake.rep.cause.hypo') : status === 'supported' ? t('wake.rep.cause.supported') : t('wake.rep.cause.label', { grade });
  const end = done ? inc.resolvedAt : inc.now, start = inc.impact?.from ?? inc.detectedAt;
  const judged = inc.audit.find(r => r.action === 'judge')?.at ?? null;
  const recovery = done ? recoveryWord(t, inc.recovery) : '';
  const srcName = id => inc.sources.find(s => s.id === id)?.name ?? (id === 'wake' ? t('wake.rep.src.wake') : SOURCE[id] ?? id);

  /* ---------- 영향: 항목마다 숫자와 구간(burn rate는 늘 구간 이름과 함께, N7). 해결 문서는 최종값만(N5) ---------- */
  const unit = inc.impact?.unit ?? '';
  const burnWindow = x => (x.id === 'burn-1h' ? t('wake.rep.burn.1h', { to: hm(x.to) }) : x.id === 'burn-incident' ? t('wake.rep.burn.incident', { from: hm(x.from), to: hm(x.to) }) : t('wake.rep.burn.peak', { to: hms(x.to) }));
  const impactValue = x => {
    if (x.state === 'unknown') return t('wake.rep.unknown', { why: t('wake.rep.why.noSource', { src: srcName(x.source) }) });
    if (x.id === 'ratio' || x.id === 'login') return x.peak != null ? t('wake.rep.imp.ratioFinal', { peak: `${x.peak}${unit}`, at: hms(x.peakAt), from: hm(x.from), to: hm(x.to), end: `${x.end}${unit}` }) : t('wake.rep.imp.ratioNow', { now: `${x.now}${unit}`, limit: `${inc.impact.threshold}${unit}`, from: hm(x.from) });
    if (x.id === 'failed') return t('wake.rep.imp.failed', { n: num(x.failed), all: num(x.requests), from: hm(x.from), to: hm(x.to) });
    if (x.id.startsWith('burn-')) return t('wake.rep.imp.burn', { v: x.burn, window: burnWindow(x), slo: x.slo });
    if (x.id === 'budget') return t('wake.rep.imp.budget', { v: x.budgetUsed, slo: x.slo });
    return '';
  };
  const impactLabel = x => (x.id === 'ratio' || x.id === 'login' ? inc.impact?.label ?? '' : t(`wake.rep.impL.${x.id.startsWith('burn-') ? 'burn' : x.id}`));
  const impacts = (inc.userImpact ?? []).map(x => ({ id: `u-${x.id}`, label: impactLabel(x), value: impactValue(x) }));
  const affected = inc.affected ?? inc.scope.filter(r => r.status[0] !== 'ok');
  const impactWords = impacts[0] ? `${impacts[0].label} ${impacts[0].value}` : affected.map(r => `${r.kind} ${r.name}`).join(' · ');

  /* ---------- 링크: 자료의 https 주소(화면 · PDF · Markdown · 채널이 같다) ---------- */
  const l = inc.links ?? {};
  const links = [['incident', l.incident], ['alert', l.alert], ['runbook', l.runbook], ['pr', l.pr], ['dashboard', l.dashboard]].filter(([, u]) => u).map(([k, u]) => `${t(`wake.rep.link.${k}`)} ${u}`);

  /* ---------- 다음 단계와 결정(열린 문서) ---------- */
  const stepOwner = k => ({ pr: t('wake.rep.owner.githubApp'), merge: t('wake.rep.owner.reviewer'), sync: 'Argo CD', rollout: 'Kubernetes' })[k] ?? oncall;
  const verifyStep = t('wake.rep.step.verify', { min: inc.verify.need / MIN });
  function nextSteps() {
    if (done) return [];
    if (!chosen) return next ? [[t('wake.rep.step.approve', { title: next.title }), oncall], ...routeKeys(next.plan).map((k, i) => [routeOf(t, next.plan)[i], stepOwner(k)]), [verifyStep, 'Wake']] : [];
    return [[verifyStep, 'Wake']];
  }
  function decision() {
    if (done || chosen || !next) return [];
    const p = next.plan.target;
    return [t('wake.rep.now.decide', { title: next.title, who: oncall }), t('wake.rep.now.target', { text: `${inc.cluster} · ${p.namespace} · ${p.kind} ${p.name}` }), t('wake.rep.now.change', { text: changeOf(t, next) }),
      ...(next.reach ? [t('wake.rep.now.risk', { text: next.reach })] : []), ...(next.residual ? [t('wake.rep.now.residual', { text: next.residual })] : []), ...(next.basis ? [t('wake.rep.now.basis', { text: next.basis })] : [])];
  }
  /* 배치 마감 전 확인: 한 절에 시각 하나 */
  const checks = [deadlineCheck(inc.batch ?? null, inc.now)].filter(Boolean).map(c => t('wake.rep.now.check', { at: hm(c.at), job: c.job ?? '', who: oncall }));

  /* ---------- 머리: 한 줄 값만 ---------- */
  const service = `${inc.target.kind} ${inc.target.name} · ${inc.target.namespace}`, made = t('wake.rep.h.madeV', { at: `${full(inc.now)} ${zone}` });
  const head = done
    ? { title: t('wake.rep.pm.title', { inc: inc.number, title: inc.title }), rows: [
      { label: t('wake.rep.h.severity'), value: inc.severity }, { label: t('wake.rep.h.result'), value: recovery }, { label: t('wake.rep.h.service'), value: service },
      { label: t('wake.rep.h.detected'), value: `${full(inc.detectedAt)} ${zone}` }, { label: t('wake.rep.h.closed'), value: `${full(inc.resolvedAt)} ${zone}` },
      { label: t('wake.rep.h.duration'), value: t('wake.rep.h.durV', { from: hm(start), to: hm(inc.resolvedAt), dur: duration(t, inc.resolvedAt - start) }) },
      { label: t('wake.rep.h.oncall'), value: inc.oncall.name }, { label: t('wake.rep.h.made'), value: made }] }
    : { title: t('wake.rep.su.title', { inc: inc.number, title: inc.title }), rows: [
      { label: t('wake.rep.h.severity'), value: inc.severity }, { label: t('wake.rep.h.status'), value: t(`wake.inc.phase.${inc.phase}`) }, { label: t('wake.rep.h.service'), value: service },
      { label: t('wake.rep.h.detected'), value: `${full(inc.detectedAt)} ${zone}` }, { label: t('wake.rep.h.oncall'), value: inc.oncall.name }, { label: t('wake.rep.h.made'), value: made }] };

  /* ---------- 그림: 해결 문서는 감지 30분 전부터 복구 확인까지(figureWindow), 승인 · 적용 · 복구 확인 표시와 7일 관찰(N6) ---------- */
  const fig = done ? inc.figure : null;
  const marks = done ? [[inc.approvedAt, 'approve'], [inc.fixAt, 'fix'], [inc.resolvedAt, 'end']].filter(([ms]) => ms != null).map(([ms, k], i) => ({ at: ms, n: i + 1, label: t(`wake.rep.mark.${k}`), kind: k, tone: k === 'end' ? 'ok' : 'run' })) : [];
  const markWords = marks.length ? t('wake.rep.mark.cap', { list: marks.map(m => `${m.n} ${m.label} ${hms(m.at)}`).join(' · ') }) : '';
  const watchWords = fig?.watchUntil ? t('wake.rep.fig.watch', { date: ymd(fig.watchUntil) }) : '';
  const windowOf = (a, b) => (ymd(a) === ymd(b) ? `${ymd(a)} ${hm(a)}–${hm(b)}` : `${ymd(a)} ${hm(a)} – ${ymd(b)} ${hm(b)}`);
  const peakOf = (samples, a, b) => samples.filter(x => x.at >= a && x.at <= b && x.value != null).reduce((p, x) => (!p || x.value > p.value ? x : p), null);

  function impactOps() {
    const items = [...(affected.length ? [{ id: 'res', label: t('wake.rep.imp.resources'), value: affected.map(r => `${r.kind} ${r.name}`).join(' · ') }] : []),
      ...impacts.slice(done ? 0 : 1), ...(done ? [] : [{ id: 'since', label: t('wake.rep.imp.since'), value: `${full(start)} ${zone}` }])];
    const ops = [add({ id: 's-imp', kind: 'summary', title: t('wake.rep.sec.impact'), data: { items } }, t('wake.rep.say.impact'))];
    const i = inc.impact;
    if (i?.samples?.length) {
      const a = done ? fig.from : start - 15 * MIN, b = done ? fig.to : inc.now, pk = peakOf(i.samples, a, b), lim = t('wake.rep.fig.limit', { v: `${i.threshold}${i.unit}` });
      const caption = [t('wake.rep.fig.cap', { peak: `${pk?.value ?? ''}${i.unit}`, at: pk ? hms(pk.at) : '', ref: lim, window: windowOf(a, b), step: stepWord(i.scrape) }), markWords, watchWords].filter(Boolean).join(' · ');
      ops.push(add({ id: 'c-err', kind: 'chart', sub: true, title: i.label, caption, snapshot: snap('Prometheus', i.query, end),
        data: { card: seriesChart({ title: i.label, name: i.label, unit: i.unit, samples: i.samples, refs: [{ value: i.threshold, label: lim, tone: 'limit' }], from: a, to: b, events: marks, key: 'err', color: '--series-1', marksLabel: t('wake.rep.fig.marksL') }) } }, t('wake.rep.say.fig')));
    }
    return ops;
  }

  /* ---------- 근거 조각: 이벤트 · 로그 · 지표(수집한 그대로의 스냅샷) ---------- */
  const EV_COLS = [{ id: 'at', label: 'Last Seen', w: '10ch' }, { id: 'type', label: 'Type', w: '9ch', muted: true }, { id: 'reason', label: 'Reason', w: '24%' }, { id: 'obj', label: 'Object' }, { id: 'n', label: 'Count', end: true, w: '7ch' }, { id: 'msg', label: 'Message', excerpt: ['reason'] }];
  function eventOps(sub) {
    const e = inc.evidence.find(x => x.kind === 'events' && x.result?.rows?.length); if (!e) return [];
    const rows = e.result.rows.map((r, i) => ({ id: `ev${i}`, at: at(r.last), type: r.type, reason: r.reason, obj: r.object, n: num(r.count), msg: r.message }));
    const warn = rows.filter(r => r.type === 'Warning'), hot = warn.filter(r => ['OOMKilling', 'BackOff', 'Unhealthy', 'Killing', 'FailedScheduling', 'Failed', 'BackoffLimitExceeded'].includes(r.reason)).slice(0, 3);
    const caption = [t('wake.rep.ev.cap', { w: num(warn.length), all: num(rows.length), date: ymd(e.window.from), from: hm(e.window.from), to: hm(e.window.to), zone }), ref(e.n)].join(' · ');
    return [
      add({ id: 'c-ev', kind: 'table', sub, title: t('wake.rep.ev.title', { target: `${e.target.kind} ${e.target.name}` }), caption, snapshot: snap(srcName(e.source), e.query, e.collectedAt), data: { columns: EV_COLS, rows } }, t('wake.rep.say.ev')),
      ...(warn.length < rows.length ? [{ op: 'filter', block: 'c-ev', keep: warn.map(r => r.id), say: t('wake.rep.say.evWarn', { n: num(rows.length - warn.length) }) }] : []),
      ...(hot.length ? [{ op: 'highlight', block: 'c-ev', ids: hot.map(r => r.id), say: t('wake.rep.say.evHot', { reasons: hot.map(r => r.reason).join(', ') }) }] : []),
    ];
  }
  function logOps(sub) {
    const e = inc.evidence.find(x => x.kind === 'logs' && x.result?.lines?.length); if (!e) return [];
    const lines = e.result.lines.map(x => ({ id: `lg${x.n}`, n: x.n, text: `${hms(x.at)} ${x.level} ${x.text}` })), hits = new Set(e.hits ?? []), hitIds = lines.filter(x => hits.has(x.n)).map(x => x.id);
    const name = e.target.previous ? t('wake.rep.log.prev', { name: e.target.name }) : `${e.target.kind} ${e.target.name}`;
    const caption = [t('wake.rep.log.cap', { q: e.key, hits: num(hits.size), n: num(e.total) }), t('wake.rep.log.last', { last: hms(e.result.lines.at(-1).at) }), e.target.container, ref(e.n)].filter(Boolean).join(' · ');
    const ops = [add({ id: 'c-log', kind: 'log', sub, title: t('wake.rep.log.title', { name, range: `${ymd(e.window.from)} ${hms(e.window.from)}–${hms(e.window.to)}` }), caption, snapshot: snap(srcName(e.source), e.query, e.collectedAt), data: { lines } }, t('wake.rep.say.log', { n: num(lines.length) }))];
    if (lines.length > 12) ops.push({ op: 'collapse', block: 'c-log', around: hitIds, context: 2, say: t('wake.rep.say.logFold', { q: e.key }) });
    if (hitIds.length) ops.push({ op: 'highlight', block: 'c-log', ids: hitIds, say: t('wake.rep.say.logHit', { q: e.key, n: num(hitIds.length) }) });
    return ops;
  }
  function seriesOps(sub) {
    return inc.evidence.filter(e => e.kind === 'metric' && e.result?.series?.length).map(e => {
      const s = e.result.series[0], a = done ? fig.from : e.window.from, b = done ? fig.to : e.window.to, refs = s.refs ?? [];
      const got = [...s.samples].reverse().find(x => x.at <= e.collectedAt && x.value != null) ?? s.samples.at(-1);
      const title = t('wake.rep.m.title', { name: e.target.name }), step = s.samples.length > 1 ? s.samples[1].at - s.samples[0].at : 0;
      const caption = [t('wake.rep.fig.capV', { value: t('wake.rep.fig.got', { value: `${got.value}${s.unit}`, at: hms(got.at) }), ref: refs.map(r => r.label).join(' · ') || t('wake.rep.fig.noRef'), window: windowOf(a, b), step: stepWord(step) }), ref(e.n), markWords, watchWords].filter(Boolean).join(' · ');
      return add({ id: `c-m${e.n}`, kind: 'chart', sub, title, caption, snapshot: snap(srcName(e.source), e.query, e.collectedAt),
        data: { card: seriesChart({ title, name: s.labels.pod ?? e.target.name, unit: s.unit, samples: s.samples, refs, from: a, to: b, events: marks, marksLabel: t('wake.rep.fig.marksL') }) } }, t('wake.rep.say.fig'));
    });
  }
  const evidenceOps = () => [...eventOps(true), ...logOps(true), ...seriesOps(true)];

  /* ---------- 타임라인: 감지 전의 변경·증상과 기록(알림, 판정, 승인, PR, 병합, 동기화, 롤아웃, 복구 확인). 실행 기록은 여기에만 쓴다 ---------- */
  const LANE_SRC = { deploy: 'Argo CD', config: 'Argo CD' };
  const RECORDED = ['alert', 'judge', 'propose', 'approve', 'deny', 'pr', 'merge', 'sync', 'rollout', 'resolve', 'fail'], KEY = ['alert', 'approve', 'merge', 'resolve', 'fail'];
  const actor = r => (r.requester.kind === 'ai' ? r.client ?? r.requester.name : r.requester.name);
  const recordText = r => (r.action === 'judge' ? (held ? t('wake.rep.tl.hypo', { rule: `${inc.rule.name} ${inc.rule.version}` }) : t('wake.rep.tl.judged', { grade, rule: `${inc.rule.name} ${inc.rule.version}` }))
    : r.action === 'alert' ? `${r.target} firing · ${inc.severity}` : r.action === 'resolve' ? recovery : typeof r.summary === 'string' ? r.summary : t(r.summary.key, r.summary.vars));
  function timelineOps(title) {
    const rows0 = [...inc.timeline.filter(m => m.at < inc.detectedAt).map(m => ({ at: m.at, src: LANE_SRC[m.lane] ?? 'Kubernetes API', text: `${m.kind} · ${m.title} · ${m.text}`, key: m.lane === 'symptom' })),
      ...inc.audit.filter(r => RECORDED.includes(r.action)).map(r => ({ at: r.at, src: actor(r), text: recordText(r), key: KEY.includes(r.action) }))];
    const rows = rows0.sort((x, y) => x.at - y.at).map((r, i) => ({ id: `tl${i}`, at: at(r.at), src: r.src, text: past(r.text), key: r.key }));
    const wide = rows.some(r => r.at.length > 8), keys = rows.filter(r => r.key).map(r => r.id);
    return [add({ id: 's-tl', kind: 'table', title, caption: t('wake.rep.timeZone', { date: ymd(day), zone }),
      data: { columns: [{ id: 'at', label: t('wake.rep.col.at'), w: wide ? '19ch' : '10ch' }, { id: 'src', label: t('wake.rep.col.src'), w: '18%', muted: true }, { id: 'text', label: t('wake.rep.col.event'), wrap: true }], rows } }, t('wake.rep.say.timeline')),
    ...(keys.length ? [{ op: 'highlight', block: 's-tl', ids: keys, say: t('wake.rep.say.tlMark', { n: num(keys.length) }) }] : [])];
  }

  /* ---------- 원인: 사슬의 칸(관측 · 기준 · 해석 · 확인 안 됨)과 근거 번호, 판정 규칙 ---------- */
  const cells = ids => ids.flatMap(id => (inc.chain.cells[id] ?? []).map((c, i) => ({ id: `${id}${i}`, label: i ? '' : t(`wake.inc.cell.${id}`), text: stop(past(c.text)), refs: (c.refs ?? []).map(tagOf) })));
  const ruleItem = () => ({ id: 'rule', label: t('wake.rep.cause.rule'), text: [`${t('wake.inc.src.rule')} ${inc.rule.name} ${inc.rule.version}`, inc.skill ? `${t('wake.inc.src.skill')} ${inc.skill.id} ${inc.skill.version}` : ''].filter(Boolean).join(' · ') });
  const tagOf = n => evidenceTag(t, inc.evidence.find(e => String(e.n) === String(n))) ?? { label: `[${n}]` };
  const refsOf = id => uniq((inc.chain.cells[id] ?? []).flatMap(c => c.refs ?? [])).map(tagOf);

  /* ---------- 부록: 근거와 자료(번호, 출처, 구간, 수집, 결과, 조회 원문), 자료 · 마스킹 · 작성 ---------- */
  const resultWords = e => (e.kind === 'logs' ? t('wake.rep.evd.logs', { q: e.key, hits: num(e.hits?.length ?? 0), n: num(e.total) })
    : e.kind === 'metric' ? t('wake.rep.evd.samples', { n: num(e.total) }) : e.kind === 'events' ? t('wake.rep.evd.rows', { n: num(e.total) })
      : String(e.result?.object ?? '').split('\n').filter(x => /\S/.test(x) && !x.startsWith('---') && !/:\s*$/.test(x)).map(x => x.trim()).join(' · '));
  function appendixOps() {
    const range = e => (e.window.from === e.window.to ? at(e.window.from) : `${at(e.window.from)} – ${at(e.window.to)}`);
    const rows = inc.evidence.map(e => ({ id: `e${e.n}`, no: evidenceTag(t, e)?.label ?? '', src: srcName(e.source), range: range(e), got: judged != null && e.collectedAt > judged ? t('wake.rep.evd.late', { at: at(e.collectedAt) }) : at(e.collectedAt), result: resultWords(e), query: e.query }));
    const masked = inc.evidence.reduce((a, e) => a + (e.masked || 0), 0), model = inc.audit.find(r => r.model)?.model;
    const wide = rows.some(r => r.range.length > 20);
    const caption = [t('wake.rep.evd.cap', { n: num(rows.length), date: ymd(day), zone }), `${t('wake.rep.h.sources')} ${uniq([...inc.evidence.map(e => srcName(e.source)), 'Wake']).join(' · ')}`,
      `${t('wake.rep.h.masked')} ${masked ? t('wake.rep.h.maskedN', { n: num(masked) }) : t('wake.rep.h.maskedNone')}`, `${t('wake.rep.h.writer')} ${t('wake.rep.h.writerV', { model: model ?? '' })}`, ...(done ? links : [])];
    return [add({ id: 's-ev', kind: 'table', title: t('wake.rep.sec.evidence'), caption, data: { columns: [{ id: 'no', label: t('wake.rep.col.no'), w: '24ch' }, { id: 'src', label: t('wake.rep.col.src'), w: '16%' },
      { id: 'range', label: t('wake.rep.col.window'), w: wide ? '30%' : '20%' }, { id: 'got', label: t('wake.rep.col.collected'), w: '10ch' }, { id: 'result', label: t('wake.rep.col.result'), wrap: true }, { id: 'query', label: t('wake.rep.col.query'), excerpt: ['no'] }], rows } }, t('wake.rep.say.evidence'))];
  }

  /* ---------- 상황 공유 ---------- */
  function statusOps() {
    const steps = nextSteps(), dec = decision();
    const now = [{ id: 'state', label: t('wake.rep.now.stateL'), text: t('wake.rep.now.state', { phase: t(`wake.inc.phase.${inc.phase}`), since: duration(t, inc.now - inc.detectedAt) }) },
      { id: 'impact', label: t('wake.rep.now.impactL'), text: impactWords },
      { id: 'cause', label: causeLabel, text: stop(inc.chain.conclusion), refs: refsOf('observe') },
      ...(inc.chain.cells.verify ?? []).map((c, i) => ({ id: `ver${i}`, label: i ? '' : t('wake.rep.now.confirmL'), text: stop(c.text) })),
      ...dec.map((x, i) => ({ id: `decide${i}`, label: i ? '' : t('wake.rep.now.decideL'), text: x })),
      ...steps.map(([s, who], i) => ({ id: `next${i}`, label: i ? '' : t('wake.rep.now.nextL'), text: `${i + 1}. ${s} — ${who}` })),
      ...checks.map((x, i) => ({ id: `check${i}`, label: i ? '' : t('wake.rep.now.checkL'), text: x })),
      { id: 'update', label: t('wake.rep.now.updateL'), text: t('wake.rep.now.update', { time: `${hm(inc.nextShare)} ${zone}`, sev: inc.severity, every: (inc.nextShare - inc.detectedAt) / MIN }) },
      ...links.map((x, i) => ({ id: `link${i}`, label: i ? '' : t('wake.rep.now.linksL'), text: x }))];
    return [add({ id: 's-now', kind: 'statements', title: t('wake.rep.sec.now'), data: { items: now } }, t('wake.rep.say.now')),
      ...impactOps(),
      add({ id: 's-cause', kind: 'statements', title: held ? t('wake.rep.sec.hypo') : t('wake.rep.sec.causeEv'), data: { items: [...cells(['observe', 'interpret', 'unknown']), ruleItem()] } }, t('wake.rep.say.cause')),
      ...evidenceOps(), ...timelineOps(t('wake.rep.sec.progress')), ...appendixOps()];
  }

  /* ---------- 사후 분석 ---------- */
  const firstSymptom = [...inc.timeline].filter(m => m.lane === 'symptom' && m.at < inc.detectedAt).sort((a, b) => a.at - b.at)[0] ?? null;
  const has = action => inc.audit.find(r => r.action === action) ?? null;
  const dueOf = days => ymd(inc.resolvedAt + days * D);
  const followUps = () => (inc.followUps ?? []).map((x, i) => ({ id: `f${i}`, text: x.title, kind: t(`wake.rep.fu.kind.${x.from}`), owner: x.owner ?? t('wake.rep.fu.ownerNeeded'), due: x.due ?? dueOf(x.days) }));
  function postmortemOps() {
    const o = chosen, fixAt = inc.fixAt ?? inc.verify.verifyFrom;
    const sum = [t(`wake.rep.pm.sum.${inc.recovery}`, { action: o?.title ?? '', fix: hm(fixAt), time: hm(inc.resolvedAt), dur: duration(t, inc.resolvedAt - start) }), t('wake.rep.pm.sumRef', { label: causeLabel })];
    const lead = inc.timeline.filter(m => m.lane !== 'symptom' && m.at <= start).sort((a, b) => b.at - a.at), contrib = lead.slice(1).filter(m => m.at > start - 6 * H);
    const cause = [{ id: 'root', label: held || status === 'supported' ? causeLabel : t('wake.rep.cause.root', { grade }), text: stop(past(inc.chain.conclusion)), refs: refsOf('interpret') },
      ...contrib.map((m, i) => ({ id: `ct${i}`, label: i ? '' : t('wake.rep.cause.contrib'), text: t('wake.rep.cause.change', { time: hm(m.at), kind: m.kind, title: m.title, text: m.text }) })),
      ...cells(['observe', 'basis', 'unknown']), ruleItem()];
    const approve = has('approve');
    const det = [{ id: 'how', label: t('wake.rep.det.how'), value: `${inc.alert.source} ${inc.alert.name} · ${inc.severity}` },
      ...(firstSymptom ? [{ id: 'first', label: t('wake.rep.det.first'), value: `${at(firstSymptom.at)} · ${firstSymptom.kind} · ${firstSymptom.title}` }, { id: 'tta', label: t('wake.rep.det.toAlert'), value: duration(t, inc.detectedAt - firstSymptom.at) }] : []),
      ...(judged != null ? [{ id: 'ttj', label: held ? t('wake.rep.det.toHypo') : t('wake.rep.det.toJudge'), value: duration(t, judged - inc.detectedAt) }] : []),
      ...(approve ? [{ id: 'tap', label: t('wake.rep.det.toApprove'), value: duration(t, approve.at - inc.detectedAt) }] : []), { id: 'tte', label: t('wake.rep.det.toEnd'), value: duration(t, inc.resolvedAt - inc.detectedAt) }];
    const act = o ? [['option', t('wake.rep.col.action'), o.title], ['change', t('wake.rep.col.change'), changeOf(t, o)], ['impact', t('wake.rep.col.impact'), o.reach], ['basis', t('wake.rep.col.basis'), o.basis],
      ['approve', t('wake.rep.col.approve'), approve ? `${approve.requester.name} · ${at(approve.at)}` : ''], ['result', t('wake.rep.col.result'), recovery]].filter(([, , v]) => v).map(([k, label, text]) => ({ id: `a-${k}`, label, text: past(text) })) : [];
    const word = { pass: t('wake.rep.ver.pass'), watch: t('wake.rep.ver.watch'), fail: t('wake.rep.ver.fail'), unknown: t('wake.rep.ver.notJudged') };
    const conds = inc.verify.conditions.map(c => ({ ...c, state: c.state ?? 'unknown' })), counts = verifyCounts(conds);
    /* 잘된 점과 아쉬운 점: 기록에서 나온 것만(판정까지 걸린 시간, Draft PR 길의 기록, 알림 공백, 그때 연결 상태가 정상이 아닌 출처) */
    const good = [...(judged != null ? [t('wake.rep.lr.judge', { dur: duration(t, judged - inc.detectedAt) })] : []), ...(has('pr') && has('merge') && has('sync') ? [t('wake.rep.lr.pr', { pr: has('pr').target.split('#').pop() })] : [])];
    const bad = [...(firstSymptom ? [t('wake.rep.lr.alertGap', { dur: duration(t, inc.detectedAt - firstSymptom.at) })] : []),
      ...inc.sources.filter(s => s.state !== 'ok').map(s => (s.state === 'idle' ? t('wake.rep.lr.idle', { name: s.name }) : t('wake.rep.lr.limited', { name: s.name, detail: s.detail ?? '' })))];
    const fu = followUps();
    return [add({ id: 's-sum', kind: 'text', title: t('wake.rep.sec.summary'), data: { text: sum.join(' ') } }, t('wake.rep.say.sum')),
      ...impactOps(), ...timelineOps(t('wake.rep.sec.timeline')),
      add({ id: 's-cause', kind: 'statements', title: t('wake.rep.sec.cause'), data: { items: cause } }, t('wake.rep.say.cause')),
      ...evidenceOps(),
      add({ id: 's-det', kind: 'summary', title: t('wake.rep.sec.detect'), data: { items: det } }, t('wake.rep.say.detect')),
      add({ id: 's-act', kind: 'statements', title: t('wake.rep.sec.response'), data: { items: act } }, t('wake.rep.say.action')),
      add({ id: 's-ver', kind: 'table', sub: true, title: t('wake.rep.sec.verify'), caption: t('wake.rep.ver.cap', { pass: num(counts.passed), nj: num(counts.unjudged), min: inc.verify.need / MIN, sec: inc.verify.cadence / 1000, max: inc.verify.max / MIN, from: at(inc.verify.verifyFrom) }),
        data: { columns: [{ id: 'label', label: t('wake.rep.col.cond'), wrap: true }, { id: 'kind', label: t('wake.rep.col.kind'), w: '7ch' }, { id: 'state', label: t('wake.rep.col.result'), w: '9ch' }, { id: 'value', label: t('wake.rep.col.value'), muted: true, w: '30%', wrap: true }],
          rows: conds.map(c => ({ id: c.id, label: c.label, kind: c.optional ? t('wake.rep.ver.optional') : t('wake.rep.ver.required'), state: word[c.state] ?? c.state, value: srcName(c.source) })) } }, t('wake.rep.say.verify')),
      ...(good.length || bad.length ? [add({ id: 's-lr', kind: 'statements', title: t('wake.rep.sec.lessons'), data: { items: [...good.map((x, i) => ({ id: `g${i}`, label: i ? '' : t('wake.rep.lr.goodL'), text: stop(x) })), ...bad.map((x, i) => ({ id: `b${i}`, label: i ? '' : t('wake.rep.lr.badL'), text: stop(x) }))] } }, t('wake.rep.say.lessons'))] : []),
      ...(fu.length ? [add({ id: 's-fu', kind: 'table', title: t('wake.rep.sec.follow'), data: { columns: [{ id: 'text', label: t('wake.rep.col.todo'), wrap: true }, { id: 'kind', label: t('wake.rep.col.kind'), w: '8%' }, { id: 'owner', label: t('wake.rep.col.owner'), w: '14%' }, { id: 'due', label: t('wake.rep.col.due'), w: '13ch' }], rows: fu } }, t('wake.rep.say.follow'))] : []),
      ...appendixOps()];
  }

  /* ---------- 채널용 요약: 5~8줄, 문서 맨 위와 같은 값 ---------- */
  function channel() {
    const linkLine = `${t('wake.rep.now.linksL')}: ${links.filter(x => !x.startsWith(t('wake.rep.link.pr'))).join(' · ')}`;
    if (done) {
      const fu = followUps();
      return [t('wake.rep.ch.first', { inc: inc.number, title: inc.title, sev: inc.severity, state: recovery }),
        [t('wake.rep.ch.resolved', { time: `${full(inc.resolvedAt)} ${zone}`, dur: duration(t, inc.resolvedAt - start), action: chosen?.title ?? '' }), ...(l.pr ? [`PR ${l.pr}`] : [])].join(' · '),
        `${t('wake.rep.now.impactL')}: ${impactWords}`, `${causeLabel}: ${stop(inc.chain.conclusion)}`,
        ...(fu.length ? [`${t('wake.rep.sec.follow')}: ${fu.map(x => t('wake.rep.ch.fu', { text: x.text, owner: x.owner, due: x.due })).join(' · ')}`] : []), linkLine].join('\n');
    }
    const dec = decision(), steps = nextSteps();
    return [t('wake.rep.ch.first', { inc: inc.number, title: inc.title, sev: inc.severity, state: t(`wake.inc.phase.${inc.phase}`) }), `${t('wake.rep.now.impactL')}: ${impactWords}`, `${causeLabel}: ${stop(inc.chain.conclusion)}`,
      ...(dec.length ? [`${t('wake.rep.now.decideL')}: ${dec.join(' · ')}`] : []), ...(steps.length ? [`${t('wake.rep.now.nextL')}: ${steps.map(([s, who]) => `${s}(${who})`).join(' → ')}`] : []),
      ...(checks.length ? [`${t('wake.rep.now.checkL')}: ${checks.join(' · ')}`] : []),
      `${t('wake.rep.now.updateL')}: ${t('wake.rep.now.update', { time: `${hm(inc.nextShare)} ${zone}`, sev: inc.severity, every: (inc.nextShare - inc.detectedAt) / MIN })}`, linkLine].join('\n');
  }

  return { kind: done ? 'postmortem' : 'status', head, ops: done ? postmortemOps() : statusOps(), channel: channel() };
}

/**
 * 인시던트가 없는 날의 점검 보고서: { cluster, now(ms), ns?, nodes, pods, alerts, events } (클러스터 화면이 읽는 같은 행).
 * alerts가 null이면 알림 출처를 읽지 못함: 0건으로 쓰지 않고 alertsOff(그 출처의 연결 안 됨 글)를 쓴다.
 * 요약 → 클러스터 상태 → 활성 알림 → Warning 이벤트(지난 1시간) → 문제 Pod
 */
export function checkReport(t, { cluster, now, oncall, nodes = [], pods = [], alerts = [], alertsOff = '', events = [], problems = [] }) {
  const zone = zoneOf(now), from = now - H, at = ms => docTime(ms, now);
  const firing = (alerts ?? []).filter(a => a.state === 'firing' || a.state === 'pending'), warn = events.filter(e => e.type === 'Warning' && Date.parse(e.at) >= from);
  const next = [...firing.slice(0, 1).map(a => t('wake.rep.q.nextAlert', { name: a.name, target: a.target })), ...problems.slice(0, 1).map(p => t('wake.rep.q.nextPod', { ns: p.ns, name: p.name, st: p.status[1] }))];
  const head = { title: t('wake.rep.q.title', { cluster, date: ymd(now) }), rows: [{ label: t('wake.rep.h.window'), value: `${hm(from)}–${hm(now)} ${zone}` }, { label: 'Namespace', value: t('wake.rep.allNs') },
    ...(oncall ? [{ label: t('wake.rep.h.oncall'), value: oncall }] : []), { label: t('wake.rep.h.made'), value: t('wake.rep.h.madeV', { at: `${ymd(now)} ${hms(now)} ${zone}` }) }] };
  const ops = [
    add({ id: 's-sum', kind: 'text', title: t('wake.rep.sec.summary'), data: { text: [t('wake.rep.q.sum1', { cluster, from: hm(from), to: hm(now), zone }), (alerts ? t('wake.rep.q.sum2', { a: num(firing.length), w: num(warn.length), p: num(problems.length) }) : t('wake.rep.q.sum2Off', { w: num(warn.length), p: num(problems.length), off: alertsOff })), next.length ? t('wake.rep.q.sumNext', { list: next.join(', ') }) : ''].filter(Boolean).join(' ') } }, t('wake.rep.say.sum')),
    add({ id: 's-st', kind: 'summary', title: t('wake.rep.q.state'), data: { items: [{ id: 'n', label: 'Node', value: num(nodes.length) }, { id: 'p', label: 'Pod', value: num(pods.length) }] } }, t('wake.rep.say.state')),
    add({ id: 's-al', kind: firing.length ? 'table' : 'text', title: t('wake.rep.q.alerts'), ...(firing.length
      ? { caption: t('wake.rep.timeZone', { date: ymd(now), zone }), data: { columns: [{ id: 'name', label: t('wake.rep.col.alertname') }, { id: 'sev', label: t('wake.rep.col.severity'), w: '9ch' }, { id: 'state', label: t('wake.rep.col.state'), w: '8ch' }, { id: 'target', label: t('wake.rep.col.target') }, { id: 'at', label: t('wake.rep.col.since'), w: '19ch' }],
        rows: firing.map(a => ({ id: a.id, name: a.name, sev: a.severity, state: a.state, target: a.target, at: at(a.at) })) } }
      : { data: { text: alerts ? t('wake.rep.q.noAlerts') : alertsOff } }) }, t('wake.rep.say.alerts')),
    ...(warn.length ? [add({ id: 'c-ev', kind: 'table', title: t('wake.rep.ev.title', { target: t('wake.rep.allNs') }), caption: t('wake.rep.timeZone', { date: ymd(now), zone }),
      data: { columns: [{ id: 'at', label: 'Last Seen', w: '10ch' }, { id: 'reason', label: 'Reason', w: '24%' }, { id: 'obj', label: 'Object' }, { id: 'n', label: 'Count', end: true, w: '7ch' }, { id: 'msg', label: 'Message', excerpt: ['reason'] }],
        rows: warn.slice(0, 20).map((e, i) => ({ id: `ev${i}`, at: at(Date.parse(e.at)), reason: e.reason, obj: `${e.object.kind}/${e.object.name}`, n: num(e.count ?? 1), msg: e.message })) } }, t('wake.rep.say.ev'))] : []),
    ...(problems.length ? [add({ id: 's-pb', kind: 'table', title: t('wake.rep.q.problems'), data: { columns: [{ id: 'name', label: 'Name' }, { id: 'ns', label: 'Namespace', w: '17%' }, { id: 'st', label: 'Status', w: '30%' }, { id: 'rs', label: 'Restarts', w: '9ch', end: true }],
      rows: problems.slice(0, 20).map(p => ({ id: `${p.ns}/${p.name}`, name: p.name, ns: p.ns, st: p.status[1], rs: num(p.restarts ?? 0) })) }, caption: problems.length > 20 ? t('wake.rep.q.more', { shown: num(20), n: num(problems.length) }) : '' }, t('wake.rep.say.problems'))] : []),
  ];
  const channel = [head.title, t('wake.rep.ch.quiet', { a: num(firing.length), w: num(warn.length), p: num(problems.length) }), ...(next.length ? [`${t('wake.rep.ch.nextL')}: ${next.join(' · ')}${oncall ? ` — ${oncall}` : ''}`] : []), [`${head.rows[0].label} ${head.rows[0].value}`, ...(oncall ? [`${t('wake.rep.h.oncall')} ${oncall}`] : [])].join(' · ')].join('\n');
  return { kind: 'check', head, ops, channel };
}

/** 보고서를 다 쓴 상태(작업을 모두 적용): 작업면의 Markdown 내보내기와 시험이 쓴다 */
export function finished(doc) {
  const r = createReport();
  for (const { say, ...op } of doc.ops) r.apply(op);
  return r.state;
}

/** Markdown: 머리 두 칸 표, 번호 붙은 절, 표와 발췌, 로그 코드 블록, 캡션 기울임, 출처 각주 */
export const markdownOf = (t, state, head) => toMarkdown(state, { title: head.title, head: head.rows, format: s => `${ymd(s * 1000)} ${hms(s * 1000)} ${zoneOf(s * 1000)}`, hidden: n => t('wake.rep.md.hidden', { n: num(n) }) });
