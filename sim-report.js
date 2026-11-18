/*
 * 보고서(시뮬레이션): AI가 글을 흘려 쓰듯 인시던트 문서를 절마다 채운다. 문서는 단계에 맞춘 두 가지다.
 *   열린 인시던트: 상황 공유. 맨 위 "지금 상황"을 10초 안에 읽는다(상태, 영향, 원인 또는 원인 가설과 확인 방법, 지금 필요한 결정과 그 변경·위험,
 *     다음 단계와 담당, 다음 공유, 링크). 그 아래 영향 → 원인과 근거 조각 → 진행 기록 → 부록. 채널에 붙여 넣을 짧은 글(channel)도 같은 값으로 만든다.
 *   해결된 인시던트: 포스트모템. 요약(복구 종류 먼저) → 영향 → 타임라인 → 원인 → 감지 → 대응(요청·외부 실행·관측을 나눔, 복구 확인) → 잘된 점과
 *     아쉬운 점 → 후속 조치 → 부록.
 *   열린 인시던트가 없는 날은 점검 보고서.
 * 모든 값은 화면과 같은 자료에서 읽는다: 시나리오(sim-data), 영향 수치·근거 스냅샷·근거 시계열(sim-world), 조치 기록(엔진의 history), 복구 확인 조건,
 * 복구 종류와 원인 상태(sim-engine). 여기서 다시 계산하거나 다른 말로 고쳐 쓰지 않는다. 한 사실은 한 절에만 쓴다.
 * 문서 표의 글 칸(타임라인 내용, 조건, 할 일)은 칸 안에서 줄을 바꾼다. 원문(로그 줄, 조회, Kubernetes 메시지)만 표 아래 발췌로 옮기고, 행 키를 앞에 둔 전체 값을 쓴다.
 * 조각은 붙이는 순간의 스냅샷이고(근거는 그 근거를 모은 시각), 근거 조각(이벤트·로그)은 본문 화면도 같은 상태로 바꾼다(drive).
 */
import { T0, H, D, hm, hms, ymd, dur } from './sim-format.js';
import { eventsIn, alertsOf, userImpactOf, errorRate, evidenceSnapshot, evidenceSeries } from './sim-world.js';
import { mask, redactedTotal } from './sim-mask.js';
import { SCRAPE, scrapeFloor, ME, MODEL, NEED, CADENCE, MAX, RECOVERY, linksOf } from './sim-data.js';
import { verifyCounts, causeStatus } from './sim-engine.js';
import { applyOp, createState, toMarkdown } from './kit/core/report.js';
import { t as L } from './sim-locale.js';

const num = n => Number(n).toLocaleString('ko-KR');
const full = at => `${ymd(at)} ${hms(at)}`;
const tm = at => (ymd(at) === ymd(0) ? hms(at) : full(at)); /* a table time: the detection day's date is in the caption */
const stop = s => (/[.!?]$/.test(s) ? s : `${s}.`);
/** a report with an undo stack (the kit's ops, plus 'range': a figure's window narrowed in place) */
export function reportStore() {
  let state = createState(), past = [];
  const step = (st, op) => op.op === 'range' ? { ...st, blocks: st.blocks.map(b => (b.id === op.block ? { ...b, data: { ...b.data, ...op.data }, caption: op.caption ?? b.caption } : b)) } : applyOp(st, op);
  return {
    get state() { return state; }, get canUndo() { return past.length > 0; }, get depth() { return past.length; },
    apply(op) { const next = step(state, op); past.push(state); state = next; return state; },
    undo() { if (past.length) { const sel = state.selected; state = past.pop(); const ids = new Set(state.blocks.map(b => b.id)); state = { ...state, selected: sel.filter(k => ids.has(k.split('/')[0])) }; } return state; },
    select(fn) { state = fn(state); return state; },
    reset() { state = createState(); past = []; },
  };
}

export function createReport({ get }) {
  const snap = (source, query, at) => ({ source, query, at: T0 + at });
  const add = (block, say, extra = {}) => ({ op: 'add', block, say, ...extra });
  const unknown = why => L('sim.r.unknown', { why });
  const logSource = e => (e.target?.kind === 'Deployment' ? 'Loki' : 'Kubernetes API');
  const sourceOf = e => (e.kind === '로그' ? logSource(e) : e.kind);
  const oncall = () => L('sim.r.oncallWho', { me: ME });

  /* ---------- what every document reads: one place, so the status update, the postmortem and the channel text say the same ---------- */
  function facts() {
    const g = get(), { s, S, t, w, sid } = g, E = g.E, ph = g.phase(), hist = S.history ?? [];
    /* the engine's view as it stands now: the cause an outside reply supports once it came, and the evidence with that reply (numbered on, marked as added) */
    const ch = S.adoptedAlt ? g.chain() : { ...g.chain(), ...E.chainNow() }, ev = E.evidenceNow();
    /* the service: the workload the action changes, or the scope's workload when the action changes its configuration (a ConfigMap, a NodeGroup) */
    const wl = s.scope.find(r => !['Pod', 'Node'].includes(r.kind)), tgt0 = s.approval.target, tgt = /^(ConfigMap|NodeGroup)/.test(tgt0[2]) && wl ? [tgt0[0], tgt0[1], `${wl.kind} ${wl.name}`] : tgt0;
    const approvals = hist.filter(h => h.kind === 'approve'), fails = hist.filter(h => h.kind === 'fail'), resolve = hist.findLast(h => h.kind === 'resolve');
    const bad = s.scope.filter(r => r.status[0] === 'error' || r.status[0] === 'warn');
    /* when the fix took effect, as the engine reads it: the observed effect of a manual action, else the end of the rollout */
    const fixAt = E.fixAt();
    /* what users felt, read exactly as the incident screen reads it; a resolved incident reads the final values (window, peak, failures, Ready after) */
    const final = ph === 'resolved', impact = userImpactOf(sid, S.t, S.resolvedAt ?? S.t, fixAt, final).map(x => (final ? finalItem(x, s, fixAt) : x));
    const opt = g.opt(), next = g.options().find(o => !o.disabled), l = linksOf(s, g.inc, opt?.repo ?? s.repo);
    const prLink = hist.findLast(h => h.pr != null && h.link)?.link ?? (S.prId != null ? l?.pr(S.prId) : null), ticket = hist.findLast(h => h.ticket && h.link);
    return { g, s, S, t, w, sid, E, ph, ch, ev, hist, tgt, fixAt, cause: causeStatus(ch, s.rule), checks: E.nextChecks(), start: g.impactStart(), end: S.resolvedAt ?? null, approvals, fails, resolve, bad, impact, opt, next, links: l, prLink, ticket,
      held: causeStatus(ch, s.rule) === 'hypothesis', inc: g.inc, sev: g.alert?.severity ?? s.severity };
  }
  /* a resolved document's impact line from the item's own fields: the peak, its window and the value at the end (never a "now") */
  const finalItem = (x, s, fixAt) => {
    if (x.id === 'ratio' && x.peak != null) return { ...x, value: L('sim.r.imp.ratioFinal', { peak: x.peak.toFixed(1), from: hm(x.from), to: hm(x.to), end: x.now.toFixed(1) }) };
    if (x.id === 'login' && x.peak != null) return { ...x, value: L('sim.r.imp.loginFinal', { peak: x.peak, n: num(x.failed), from: hm(x.from), to: hm(fixAt) }) };
    if (x.id === 'blocked' && s.affects?.blocked) return { ...x, value: L('sim.r.imp.blockedFinal', { service: s.affects.service, blocked: s.affects.blocked, running: s.affects.running }) };
    return { ...x, value: past(x.value) };
  };
  /* a resolved document speaks of the decision time in the past: "지금" (now, at the time it was written) becomes "당시" */
  const past = t => (typeof t === 'string' ? t.replace(/지금 /g, '당시 ') : t);
  /* how the incident ended, as the engine classed it when the check passed (service recovered, symptom recovered, mitigated, verification bypassed) */
  const recovery = f => (f.ph === 'resolved' ? f.resolve?.recovery ?? f.opt?.recovery ?? 'service' : null);
  const recoveryWord = f => { const k = recovery(f); return `${RECOVERY[k].label}${k === 'resumed' ? '' : ` · ${L(`sim.r.rc.${k}`)}`}${f.resolve?.watchUntil != null ? ` · ${L('sim.r.rc.until', { date: ymd(f.resolve.watchUntil) })}` : ''}`; };
  const causeLabel = f => (f.held ? L('sim.r.cause.hypo') : f.cause === 'supported' ? L('sim.r.cause.supported') : L('sim.r.now.causeL', { grade: f.g.grade(f.ch.grade) }));
  const impactWords = f => (f.impact[0] ? `${f.impact[0].label} ${f.impact[0].value}` : f.bad.map(r => `${r.kind} ${r.name} ${r.status[1]}`).join(' · '));
  /* the step's owner: who presses or runs it, from the step's own words and the data's owners */
  const ownerOf = (step, o, s) => (/Draft PR/.test(step) ? 'Wake GitHub App' : /PR 병합/.test(step) ? L('sim.r.reviewer', { who: s.owners?.reviewer ?? '' }) : /복사|완료 표시|당번/.test(step) ? oncall() : /Argo CD/.test(step) ? 'Argo CD' : /롤아웃|다음 실행|Pod 재시작/.test(step) ? 'Kubernetes' : o?.to ?? oncall());
  /* what is left to do, from where the incident stands */
  function nextSteps(f) {
    const { ph, S, s } = f, verify = L('sim.r.step.verify', { min: NEED / 60 });
    if (ph === 'scoping' || ph === 'investigating') return [[L('sim.r.step.judge', { skill: `${s.skill.id} ${s.skill.version}` }), 'Wake AI']];
    if (ph === 'judged' || ph === 'failed') { const o = f.next; return o ? [[L('sim.r.step.approve', { title: o.title }), oncall()], ...o.path.map(p => [p, ownerOf(p, o, s)]), [verify, 'Wake']] : []; }
    const o = f.opt, path = o?.path ?? [], from = ph === 'merge-wait' ? path.findIndex(p => /PR 병합/.test(p)) : ph === 'pr-failed' ? 0 : ph === 'handoff' ? path.findIndex(p => !/복사/.test(p)) : ph === 'applying' ? path.findIndex(p => /동기화|롤아웃|실행/.test(p)) : path.length;
    const rest = from >= 0 ? path.slice(from) : [];
    if (ph === 'inconclusive') return [[L('sim.r.step.reverify'), oncall()], [verify, 'Wake']];
    return [...rest.map(p => [p, ownerOf(p, o, s)]), ...(S.resolvedAt == null ? [[verify, 'Wake']] : [])];
  }
  /* the decision the incident waits on now: the action, who approves it, and the same list the approval panel shows (target, every change, impact, risk) */
  function decision(f) {
    const { ph, S, s } = f, o = f.next, cur = f.opt;
    if ((ph === 'judged' || ph === 'failed') && o) return [L('sim.r.now.decide', { title: o.title, who: oncall() }), L('sim.r.now.target', { text: (o.target ?? s.approval.target).join(' · ') }), L('sim.r.now.change', { text: o.change }), L('sim.r.now.risk', { text: o.impact }), ...(o.residual ? [L('sim.r.now.residual', { text: o.residual })] : []), ...(o.basis ? [L('sim.r.now.basis', { text: o.basis })] : [])];
    if (ph === 'merge-wait') return [L('sim.r.now.merge', { pr: S.prId ?? '', who: s.owners?.reviewer ?? '' })];
    if (ph === 'pr-failed') return [L('sim.r.now.prFailed', { why: S.prFailed ?? '' })];
    if (ph === 'handoff') return [L('sim.r.now.handoff', { to: cur?.to ?? oncall(), title: cur?.title ?? '' })];
    if (ph === 'inconclusive') return [L('sim.r.now.inconclusive', { why: f.g.blindWhy() })];
    return [];
  }
  const stateWords = f => {
    const { ph, S } = f, since = dur(f.t);
    if (ph === 'verifying' && S.verifyFrom != null) { const ok = Math.max(0, Math.min(f.t - S.verifyFrom - S.downWins.length * CADENCE, NEED)); return L('sim.r.now.stateVerify', { phase: f.g.statusWord, ok: dur(ok), need: dur(NEED), since }); }
    return L('sim.r.now.state', { phase: f.g.statusWord, since });
  };
  const nextUpdate = f => { const every = f.sev === 'critical' ? 30 : 60; return L('sim.r.now.update', { time: hm(f.t + every * 60), every, sev: f.sev }); };
  /* the links a colleague without Wake can open: the data's https addresses, the same on the screen, in the PDF, the Markdown and the channel text */
  const links = f => {
    const l = f.links ?? {};
    return [`${L('sim.r.link.incident')} ${l.incident}`, `${L('sim.r.link.alert')} ${l.alert}`, `${L('sim.r.link.runbook')} ${l.runbook}`, ...(f.prLink ? [`PR ${f.prLink}`] : []),
      ...(f.ticket ? [`${L('sim.r.link.ticket')} ${f.ticket.ticket} ${f.ticket.link}`] : []), `${L('sim.r.link.dashboard')} ${f.g.alert?.annotations?.dashboard_url ?? l.dashboard}`];
  };

  /* ---------- 머리: 한 줄 값만, 긴 것(자료, 마스킹)은 부록 ---------- */
  function head() {
    const g = get(), { s, S, t, w } = g;
    if (s.quiet) return { title: L('sim.r.q.title', { cluster: w.cluster.name, date: ymd(t) }), rows: [{ label: L('sim.r.h.window'), value: `${hm(t - H)}–${hm(t)} KST` }, { label: 'Namespace', value: S.ns !== 'all' ? S.ns : L('sim.r.allNs') }, { label: L('sim.r.h.oncall'), value: ME }, { label: L('sim.r.h.made'), value: L('sim.r.h.madeV', { at: full(t) }) }] };
    const f = facts(), tgt = f.tgt, svc = `${tgt[2]} · ${tgt[1]}`;
    if (f.ph === 'resolved') return { title: L('sim.r.pm.title', { inc: f.inc, title: s.title }), rows: [
      { label: L('sim.r.h.severity'), value: f.sev }, { label: L('sim.r.h.result'), value: recoveryWord(f) }, { label: L('sim.r.h.service'), value: svc }, { label: L('sim.r.h.detected'), value: `${full(0)} KST` },
      { label: L('sim.r.h.closed'), value: `${full(f.end)} KST` }, { label: L('sim.r.h.duration'), value: L('sim.r.h.durV', { from: hm(f.start), to: hm(f.end), dur: dur(f.end - f.start) }) },
      { label: L('sim.r.h.oncall'), value: ME }, { label: L('sim.r.h.made'), value: L('sim.r.h.madeV', { at: full(t) }) }] };
    return { title: L('sim.r.su.title', { inc: f.inc, title: s.title }), rows: [
      { label: L('sim.r.h.severity'), value: f.sev }, { label: L('sim.r.h.status'), value: g.statusWord }, { label: L('sim.r.h.service'), value: svc },
      { label: L('sim.r.h.detected'), value: `${full(0)} KST` }, { label: L('sim.r.h.oncall'), value: ME }, { label: L('sim.r.h.made'), value: L('sim.r.h.madeV', { at: full(t) }) }] };
  }

  /* ---------- 조각: 두 문서가 같이 쓰는 것 ---------- */
  /* kubectl's columns; the Message (long raw text) stands under the table, led by its Reason */
  const EV_COLS = [{ id: 'at', label: 'Last Seen', w: '10ch' }, { id: 'type', label: 'Type', w: '9ch', muted: true }, { id: 'reason', label: 'Reason', w: '24%' }, { id: 'obj', label: 'Object' }, { id: 'n', label: 'Count', end: true, w: '7ch' }, { id: 'msg', label: 'Message', excerpt: ['reason'] }];
  function eventOps(V, ns, at0, at1, t, cid, w, sid, ev, sub = true) {
    const evs = V.groupEv(eventsIn(w, sid, at0, at1, cid).filter(e => !ns || e.ns === ns)).map((e, i) => ({ id: `ev${i}`, at: tm(e.at), type: e.type, reason: e.reason, obj: `${e.kind}/${e.name}`, n: num(e.n), msg: mask(e.msg ?? '') }));
    const warn = evs.filter(e => e.type === 'Warning'), key = ['OOMKilling', 'BackOff', 'Unhealthy', 'Killing', 'FailedScheduling', 'Failed', 'BackoffLimitExceeded', 'OperationCompleted'];
    const hot = [...warn.filter(e => key.includes(e.reason)), ...warn.filter(e => !key.includes(e.reason))].filter((e, i, a) => a.findIndex(x => x.reason === e.reason) === i).slice(0, 3);
    const where = { ns: ns ?? L('sim.r.allNs'), from: hm(at0), to: hm(at1), date: ymd(at0) };
    if (!evs.length) return []; /* no events: no section (the appendix says what was read) */
    const caption = [L('sim.r.ev.cap', { ...where, all: num(evs.length), w: num(warn.length) }), ev ? L('sim.r.ref', { n: ev.id }) : ''].filter(Boolean).join(' · ');
    return [
      add({ id: 'c-ev', kind: 'table', sub, title: L('sim.r.ev.title', where), caption, snapshot: snap('Kubernetes API', `events ${ns ? '-n ' + ns : '--all-namespaces'}`, ev?.got ?? t), data: { columns: EV_COLS, rows: evs } }, L('sim.r.say.ev'),
        { drive: { view: 'events', set: { view: 'events', ns: ns ?? 'all', nsMulti: ns ? [ns] : null, evType: 'all', 'scQ.events': '', scKind: null, evReason: '', evGroup: 'list', evPage: 1, evRange: { from: at0, to: at1, live: false } }, chips: [{ label: `namespace ${ns ?? L('sim.r.allNs')}`, keys: ['ns', 'nsMulti'] }, { label: L('sim.r.chip.range', where), keys: ['evRange'] }] } }),
      { op: 'filter', block: 'c-ev', keep: warn.map(e => e.id), say: L('sim.r.say.evWarn', { n: num(evs.length - warn.length) }), drive: { view: 'events', set: { evType: 'Warning', evPage: 1 }, chips: [{ label: L('sim.r.chip.type'), keys: ['evType'] }] } },
      ...(hot.length ? [{ op: 'highlight', block: 'c-ev', ids: hot.map(e => e.id), say: L('sim.r.say.evHot', { reasons: hot.map(e => e.reason).join(', ') }) }] : []),
    ];
  }
  /* the same kit chart the screens draw (sim-views chart → chart-card props), frozen as the values read when it was taken */
  const figure = (V, { title, fn, from, to, unit, refs, fmt, q, n, events = [] }) => V.chart({ title, fn, from, to, unit, refs, fmt, q, events, height: 150, n: n ?? Math.round((to - from) / SCRAPE) + 1, own: true, props: true });
  /* a postmortem figure runs from 30 minutes before the alert through the recovery check, with the approval, the fix taking effect and the check's pass marked */
  const pmWindow = f => ({ from: scrapeFloor(Math.min(-1800, f.start - 300)), to: f.end });
  const marks = f => [[f.approvals[0]?.at, 'approve'], [f.S.verifyFrom, 'fix'], [f.end, 'end']].filter(([at]) => at != null).map(([at, k], i) => ({ at, label: L(`sim.r.mark.${k}`), kind: k, n: i + 1 }));
  const markWords = f => L('sim.r.mark.cap', { list: marks(f).map(m => `${m.n} ${m.label} ${hms(m.at)}`).join(' · ') });
  /* the peak of a value function on a grid, as Prometheus holds it */
  const peakOf = (fn, from, to, step = SCRAPE) => { let pk = { v: -Infinity, at: from }; for (let at = from; at <= to; at += step) { const v = fn(at); if (v != null && v >= pk.v) pk = { v, at }; } return pk; }; /* a scrape with no sample is skipped */
  /* a figure's window: one day's date once, a window over days with both dates */
  const windowOf = (from, to) => (ymd(from) === ymd(to) ? `${ymd(from)} ${hm(from)}–${hm(to)}` : `${ymd(from)} ${hm(from)} – ${ymd(to)} ${hm(to)}`);
  const stepWord = s => (s >= H ? `${s / H}h` : s >= 60 ? `${s / 60}m` : `${s}s`);

  function impactOps(f) {
    const { s, t, sid, g } = f, V = g.V, items = [];
    if (f.bad.length) items.push({ id: 'res', label: L('sim.r.imp.resources'), value: f.bad.map(r => `${r.kind} ${r.name}`).join(' · ') });
    /* the status update's top already leads with the first impact: its impact section adds the rest */
    f.impact.slice(f.ph === 'resolved' ? 0 : 1).forEach(x => items.push({ id: `u-${x.id}`, label: x.label, value: x.value }));
    if (f.ph !== 'resolved') items.push({ id: 'since', label: L('sim.r.imp.since'), value: `${full(f.start)} KST` });
    const ops = [add({ id: 's-imp', kind: 'summary', title: L('sim.r.sec.impact'), data: { items } }, L('sim.r.say.impact'))];
    if (s.impact) { /* the 5xx ratio: the impact's own query and series, the ratio dropping where the fix took effect */
      const i = s.impact, efn = errorRate(sid, f.fixAt), pm = f.ph === 'resolved', { from, to } = pm ? pmWindow(f) : { from: scrapeFloor(f.start - 900), to: scrapeFloor(t) }, pk = peakOf(at => Math.round(efn(at) * 100) / 100, from, to);
      const ev = f.ev.find(e => e.metric === 'error_ratio'), lim = L('sim.r.fig.limit', { v: `${i.limit}%` });
      ops.push(add({ id: 'c-err', kind: 'chart', sub: true, title: i.label, caption: [L('sim.r.fig.cap', { peak: `${pk.v.toFixed(2)}%`, at: hms(pk.at), ref: lim, window: windowOf(from, to), step: stepWord(SCRAPE) }), ev ? L('sim.r.ref', { n: ev.id }) : '', pm ? markWords(f) : ''].filter(Boolean).join(' · '),
        snapshot: snap('Prometheus', i.query, t), data: { card: figure(V, { title: i.label, fn: efn, from, to, unit: '%', q: i.query, refs: [{ value: i.limit, label: lim, tone: 'limit' }], fmt: v => v.toFixed(2) + '%', events: pm ? marks(f) : [] }) } }, L('sim.r.say.fig')));
    }
    return ops;
  }

  /* an evidence's series as a figure: its own query, target and window (sim-world evidenceSeries); memory opens on six hours and narrows to the evidence's window */
  function seriesOps(f, sub) {
    const { s, t, g } = f, V = g.V, ops = [];
    for (const e of f.ev.filter(x => x.kind === 'Prometheus' && x.metric && x.metric !== 'error_ratio' && !x.blocked)) {
      const pm = f.ph === 'resolved', x = evidenceSeries(f.sid, e.id, f.fixAt, pm ? f.end : null); if (!x?.fn) continue;
      /* a scrape with no sample (a container waiting in CrashLoopBackOff) stays a gap, never a zero */
      const win = pm ? { from: pmWindow(f).from, to: x.view?.to ?? f.end } : { from: x.from, to: x.to }, long = win.to - win.from > D, step = long ? H : SCRAPE, fn = at => { const v = x.fn(scrapeFloor(at)); return v == null ? null : Math.round(v * 100) / 100; };
      /* the reference lines are the data's own (a limit, a threshold, a desired count, a request), each with its words */
      const fmt = x.fmt, refs = (x.refs ?? []).map(r => ({ value: r.value, label: r.label, tone: r.kind === 'request' || r.kind === 'desired' ? 'request' : 'limit' })), refWords = refs.map(r => r.label).join(' · ') || L('sim.r.fig.noRef');
      const title = x.metric === 'memory' ? L('sim.r.m.title', { name: e.target.name }) : x.title;
      /* the caption states the evidence's own value at its collection moment; with no sample then (a container waiting to restart), the last one before it ended */
      const value = x.value == null && x.lastText ? L('sim.r.fig.last', { value: x.lastText, at: hms(x.lastAt) }) : L('sim.r.fig.got', { value: x.valueText, at: hms(x.got) });
      const cap = (from, to) => [L('sim.r.fig.capV', { value, ref: refWords, window: windowOf(from, to), step: stepWord(step) }), L('sim.r.ref', { n: e.id }), pm ? markWords(f) : '', pm && f.resolve?.watchUntil != null ? L('sim.r.rc.until', { date: ymd(f.resolve.watchUntil) }) : ''].filter(Boolean).join(' · ');
      const id = x.metric === 'memory' ? 'c-m' : `c-f${e.id}`, n = Math.round((win.to - win.from) / step) + 1, events = pm ? marks(f) : [];
      if (pm) ops.push(add({ id, kind: 'chart', sub, title, caption: cap(win.from, win.to), snapshot: snap('Prometheus', e.query, f.end), data: { card: figure(V, { title, fn, from: win.from, to: win.to, unit: x.unit, q: e.query, refs, fmt, n, events }) } }, L('sim.r.say.fig')));
      else if (x.metric === 'memory') {
        const wide = -6 * H, end = Math.min(t, x.to + 1200);
        ops.push(add({ id, kind: 'chart', sub, title, caption: L('sim.r.fig.cap6h', { window: windowOf(wide, end) }), snapshot: snap('Prometheus', e.query, e.got), data: { card: figure(V, { title, fn, from: wide, to: end, unit: x.unit, q: e.query, refs, fmt }) } }, L('sim.r.say.fig')));
        ops.push({ op: 'range', block: id, data: { card: figure(V, { title, fn, from: x.from, to: x.to, unit: x.unit, q: e.query, refs, fmt }) }, caption: cap(x.from, x.to), say: L('sim.r.say.range', { from: hm(x.from), to: hm(x.to) }) });
      } else ops.push(add({ id, kind: 'chart', sub, title, caption: cap(x.from, x.to), snapshot: snap('Prometheus', e.query, e.got), data: { card: figure(V, { title, fn, from: x.from, to: x.to, unit: x.unit, q: e.query, refs, fmt, n }) } }, L('sim.r.say.fig')));
    }
    return ops;
  }

  /* the log evidence as it was collected (sim-world evidenceSnapshot): the same lines, numbers and window the evidence view shows */
  function logOps(f, sub) {
    const e = f.ev.find(x => x.kind === '로그' && !x.blocked), x = e && evidenceSnapshot(f.sid, e.id);
    if (!x?.lines?.length) return [];
    const many = x.pods?.length > 1, lines = x.lines.map(l => ({ id: `lg${l.n}`, n: l.n, text: mask(`${hms(l.at)} ${many ? `${l.pod} ` : ''}${l.level} ${l.text}`) })), hits = new Set(x.hits), hitIds = lines.filter(l => hits.has(l.n)).map(l => l.id);
    const name = x.target?.previous ? L('sim.r.log.prev', { name: x.target.name }) : x.target?.kind === 'Pod' ? x.target.name : `${x.target?.kind ?? ''} ${x.target?.name ?? ''}`.trim();
    const caption = [L('sim.r.log.cap', { q: e.key ?? 'ERROR', hits: num(hits.size), n: num(x.total) }), x.last != null ? L('sim.r.log.last', { last: hms(x.last) }) : '', x.container ?? '', L('sim.r.ref', { n: e.id })].filter(Boolean).join(' · ');
    const drive = many && x.pods[0] ? { drive: { view: 'logs', set: { view: 'logs', logPod: `${x.target.ns}/${x.pods[0]}`, logPrev: null, logLevel: 'all', 'scQ.logs': e.key, logContext: null, logPage: null, logRange: { from: x.from, to: x.to, live: false } }, chips: [{ label: `Pod ${x.pods[0]}`, keys: ['logPod'] }, { label: L('sim.r.chip.range', { date: ymd(x.from), from: hm(x.from), to: hm(x.to) }), keys: ['logRange'] }, { label: L('sim.r.chip.search', { q: e.key }), keys: ['scQ.logs'] }] } } : {};
    const ops = [add({ id: 'c-log', kind: 'log', sub, title: L('sim.r.log.title', { name, range: `${ymd(x.from)} ${hms(x.from)}–${hms(x.to)}` }), caption, snapshot: snap(sourceOf(e), e.query, e.got), data: { lines } }, L('sim.r.say.log', { n: num(lines.length) }), drive)];
    /* a long excerpt keeps the lines round what it found; when every line is a match (a filtered query) the first two and the last stand for them */
    if (lines.length > 12) { const all = hitIds.length === lines.length, keep = all ? [...hitIds.slice(0, 2), hitIds.at(-1)] : hitIds; ops.push({ op: 'collapse', block: 'c-log', around: keep, context: all ? 0 : 2, say: L('sim.r.say.logFold', { q: e.key }) }); }
    ops.push({ op: 'highlight', block: 'c-log', ids: hitIds, say: L('sim.r.say.logHit', { q: e.key, n: num(hitIds.length) }) });
    return ops;
  }

  function evidenceOps(f, sub = true) {
    const { s, sid, t, S, w, g } = f, evOf = f.ev.find(e => e.kind === 'Kubernetes API' && /events/.test(e.query));
    return [...eventOps(g.V, s.ns, -1920, Math.min(t, 180), t, S.cid, w, sid, evOf, sub), ...logOps(f, sub), ...seriesOps(f, sub)];
  }

  /* who did a recorded step: the record's own actor, else the system the step belongs to */
  const actorOf = h => h.actor?.name ?? (['approve', 'done', 'manual', 'merge'].includes(h.kind) ? ME : h.kind === 'sync' ? 'Argo CD' : h.kind === 'rollout' ? 'Kubernetes' : L('sim.r.wakeCheck'));
  /* a recorded step's words: the engine's own text, an approval with its action, a result with the recovery class */
  const stepText = (f, h) => (h.kind === 'approve' ? L('sim.r.tl.approve', { option: h.option }) : h.kind === 'resolve' ? recoveryWord(f) : h.text ?? '');
  /* the timeline: the scenario's changes and symptoms, the alert, the investigation and the record, in time order: the one place every executed step is written */
  function timelineOps(f, id, title) {
    const { s, g } = f, srcOf = c => (/5xx/.test(c.kind) ? 'Prometheus' : c.lane === 'deploy' ? 'Argo CD' : 'Kubernetes API');
    const atJudge = causeStatus(s.chain, s.rule) === 'hypothesis', judge = atJudge ? L('sim.r.tl.hypo', { rule: `${s.rule.name} ${s.rule.version}` }) : L('sim.r.tl.judged', { grade: g.grade(f.ch.grade), rule: `${s.rule.name} ${s.rule.version}` });
    const rows0 = [...s.changes.filter(c => c.kind !== '알림').map(c => ({ at: c.at, src: srcOf(c), text: `${c.kind} · ${c.title} · ${c.text}`, key: c.lane === 'symptom' })),
      ...(f.t >= 0 ? [{ at: 0, src: 'Alertmanager', text: `${s.alert} firing · ${f.sev}`, key: true }] : []),
      ...(f.t >= g.judgedAt() ? [{ at: g.judgedAt(), src: L('sim.r.wakeRule'), text: judge, key: false }] : []),
      ...f.hist.map(h => ({ at: h.at, src: actorOf(h), text: stepText(f, h), key: ['approve', 'review', 'merge', 'external', 'observed', 'resolve', 'fail'].includes(h.kind) }))];
    const tl = rows0.sort((a, b) => a.at - b.at).map((r, i) => ({ id: `tl${i}`, at: tm(r.at), src: r.src, text: mask(r.text), _key: r.key }));
    const ops = [add({ id, kind: 'table', title, caption: L('sim.r.timeKst', { date: ymd(0) }), data: { columns: [{ id: 'at', label: L('sim.r.col.at'), w: tl.some(r => r.at.length > 8) ? '19ch' : '10ch' }, { id: 'src', label: L('sim.r.col.src'), w: '18%', muted: true }, { id: 'text', label: L('sim.r.col.event'), wrap: true }], rows: tl } }, L('sim.r.say.timeline'))];
    const keys = tl.filter(r => r._key).map(r => r.id); if (keys.length) ops.push({ op: 'highlight', block: id, ids: keys, say: L('sim.r.say.tlMark', { n: num(keys.length) }) });
    return ops;
  }
  const causeItems = (f, kinds) => {
    const items = [];
    for (const [k, word] of kinds) (f.ch.cells[k] ?? []).forEach((c, i) => items.push({ id: `${k}${i}`, label: i ? '' : L(word), text: stop(f.ph === 'resolved' ? past(c.text) : c.text), refs: c.refs }));
    return items;
  };
  const ruleItem = f => ({ id: 'rule', label: L('sim.r.cause.rule'), text: L('sim.r.cause.ruleV', { name: f.s.rule.name, version: f.s.rule.version, result: f.s.rule.result, skill: f.s.skill.id, sv: f.s.skill.version }) });
  function appendixOps(f) {
    const { s, g } = f, judged = g.judgedAt();
    /* each evidence with the moment it was collected; one collected after the cause was judged says so */
    const rows = f.ev.map(e => ({ id: `e${e.id}`, no: `[${e.id}]`, src: sourceOf(e), range: e.blocked || e.range === '—' ? L('sim.r.evd.notRead') : e.range ?? '', at: e.got == null ? '' : e.added || e.got > judged ? L('sim.r.evd.late', { at: hms(e.got) }) : hms(e.got), count: e.blocked ? unknown(e.blocked) : e.count ?? evidenceSnapshot(f.sid, e.id)?.count ?? '', query: e.query }));
    return [
      /* one block, so the appendix never splits from its sources: the sources, the masking and the writer stand as its caption lines */
      add({ id: 's-ev', kind: 'table', title: L('sim.r.sec.evidence'), caption: [L('sim.r.evd.cap', { n: num(f.ev.length), date: ymd(0) }),
        `${L('sim.r.h.sources')} ${[...new Set([...f.ev.map(sourceOf), 'Wake'])].join(' · ')}`,
        `${L('sim.r.h.masked')} ${s.redactions?.length ? `${s.redactions.map(r => `${r.label} ${r.n}`).join(' · ')} · ${L('sim.r.h.maskedAll', { n: num(redactedTotal(s.redactions)) })}` : L('sim.r.h.maskedNone')}`,
        `${L('sim.r.h.writer')} ${L('sim.r.h.writerV', { model: MODEL })}`, ...(f.ph === 'resolved' ? links(f) : [])], data: { columns: [{ id: 'no', label: L('sim.r.col.no'), w: '5%' }, { id: 'src', label: L('sim.r.col.src'), w: '16%' }, { id: 'range', label: L('sim.r.col.window'), w: rows.some(r => r.at.length > 8) ? '30%' : '38%' }, { id: 'at', label: L('sim.r.col.collected'), w: rows.some(r => r.at.length > 8) ? '22%' : '10%' }, { id: 'count', label: L('sim.r.col.result'), wrap: true }, { id: 'query', label: L('sim.r.col.query'), excerpt: ['no'] }], rows } }, L('sim.r.say.evidence')),
    ];
  }

  /* ---------- 상황 공유: 열린 인시던트 ---------- */
  function statusScript(f) {
    const { ch } = f, ops = [], dec = decision(f), steps = nextSteps(f), early = f.ph === 'scoping' || f.ph === 'investigating';
    const now = [{ id: 'state', label: L('sim.r.now.stateL'), text: stateWords(f) }, { id: 'impact', label: L('sim.r.now.impactL'), text: impactWords(f) },
      ...(early ? [] : [{ id: 'cause', label: causeLabel(f), text: stop(ch.conclusion), refs: [...new Set((ch.cells.observe ?? []).flatMap(c => c.refs ?? []))] }, ...(ch.cells.verify ?? []).map((c, i) => ({ id: `ver${i}`, label: i ? '' : L('sim.r.now.confirmL'), text: stop(c.text) }))]),
      ...dec.map((x, i) => ({ id: `decide${i}`, label: i ? '' : L('sim.r.now.decideL'), text: x })),
      ...steps.map(([step, who], i) => ({ id: `next${i}`, label: i ? '' : L('sim.r.now.nextL'), text: `${i + 1}. ${step} — ${who}` })),
      ...f.checks.map((c, i) => ({ id: `check${i}`, label: i ? '' : L('sim.r.now.checkL'), text: L('sim.r.now.check', { at: hm(c.at), text: c.text, owner: c.owner }) })),
      { id: 'update', label: L('sim.r.now.updateL'), text: nextUpdate(f) },
      ...links(f).map((x, i) => ({ id: `link${i}`, label: i ? '' : L('sim.r.now.linksL'), text: x }))];
    ops.push(add({ id: 's-now', kind: 'statements', title: L('sim.r.sec.now'), data: { items: now } }, L('sim.r.say.now')));
    ops.push(...impactOps(f));
    if (!early) ops.push(add({ id: 's-cause', kind: 'statements', title: f.held ? L('sim.r.sec.hypo') : L('sim.r.sec.causeEv'), data: { items: [...causeItems(f, [['observe', 'sim.p.cell.observe'], ['interpret', 'sim.p.cell.interpret'], ['unknown', 'sim.p.cell.unknown']]), ruleItem(f)] } }, L('sim.r.say.cause')));
    ops.push(...evidenceOps(f));
    ops.push(...timelineOps(f, 's-tl', L('sim.r.sec.progress')));
    ops.push(...appendixOps(f));
    return ops;
  }

  /* ---------- 포스트모템: 해결된 인시던트 ---------- */
  /* an attempt as the decision it was: the action, what it changed, what it risked, why it was chosen, who approved it and how it ended (the steps are the timeline's) */
  function attemptItems(f, h, i, mine, pre) {
    const o = f.s.options.find(x => x.title === h.option), mode = f.g.modeOf(o), out = mine.find(x => ['resolve', 'fail', 'inconclusive'].includes(x.kind)), items = [];
    const item = (k, label, text) => text && items.push({ id: `a${i}-${k}`, label: pre + label, text: past(text) });
    item('option', L('sim.r.col.action'), h.option); item('change', L('sim.r.col.change'), o?.change); item('impact', L('sim.r.col.impact'), o?.impact); item('basis', L('sim.r.col.basis'), o?.basis);
    item('approve', L('sim.r.col.approve'), oncall());
    /* a manual action handed to a team with nothing recorded of its run: the run is unknown, never assumed */
    if (mode !== 'pr' && o?.external && !mine.some(x => x.kind === 'external')) item('ext', L('sim.r.st.external'), unknown(L('sim.r.why.noExternal', { to: o.to })));
    if (out) item('result', L('sim.r.col.result'), out.kind === 'resolve' ? recoveryWord(f) : `${L('sim.hist.' + out.kind)} · ${out.text}`);
    return items;
  }
  function postmortemScript(f) {
    const { s, S, ch, opt, fails, approvals, g } = f, ops = [], last = approvals.at(-1), rc = recovery(f);
    /* the check's conditions with their kind from the data: required, or for reference only (never counted) */
    const def = c => [...s.verify, ...(opt?.verifyExtra ?? [])].find(x => x.id === c.id) ?? c, conds = g.verify().map(c => ({ ...c, optional: !!def(c).optional, label0: def(c).label, ...(def(c).source && c.value ? { value: c.value.replace(/^[^·]+/, `${def(c).source} `) } : {}), ...(def(c).unjudged ? { state: 'unknown', value: def(c).unjudged.replace(/^판정 안 함 · /, '') } : {}) })), counts = verifyCounts(conds); /* a condition the data marks as not judgeable is never a pass */
    /* 1 요약: 어떻게 끝났는지(복구 종류) 먼저, 원인은 4절을 가리킨다 */
    const sum = [L(`sim.r.pm.sum.${rc}`, { action: last?.option ?? '', fix: hm(Number.isFinite(f.fixAt) ? f.fixAt : f.end), time: hm(['symptom', 'resumed'].includes(rc) && Number.isFinite(f.fixAt) ? f.fixAt : f.end), dur: dur(f.end - f.start), to: opt?.to ?? '' }), L('sim.r.pm.sumRef', { label: causeLabel(f) })]; /* the cause is stated once, in 4 */
    ops.push(add({ id: 's-sum', kind: 'text', title: L('sim.r.sec.summary'), data: { text: sum.join(' ') } }, L('sim.r.say.sum')));
    ops.push(...impactOps(f));
    ops.push(...timelineOps(f, 's-tl', L('sim.r.sec.timeline')));
    /* 4 원인: 근본 원인 또는 원인 가설, 같은 시간대 변경, 관측·기준, 확인 안 됨, 근거 */
    const lead = [...s.changes].filter(c => c.lane !== 'symptom' && c.at <= f.start).sort((a, b) => b.at - a.at), contrib = lead.slice(1).filter(c => c.at > f.start - 6 * H);
    const items = [{ id: 'root', label: f.held || f.cause === 'supported' ? causeLabel(f) : L('sim.r.cause.root', { grade: g.grade(ch.grade) }), text: stop(ch.conclusion), refs: [...new Set((ch.cells.interpret ?? []).flatMap(c => c.refs ?? []))] },
      ...contrib.map((c, i) => ({ id: `ct${i}`, label: i ? '' : L('sim.r.cause.contrib'), text: L('sim.r.cause.change', { time: hm(c.at), kind: c.kind, title: c.title, text: c.text }) })),
      ...causeItems(f, [['observe', 'sim.p.cell.observe'], ['basis', 'sim.p.cell.basis'], ['unknown', 'sim.p.cell.unknown']]), ruleItem(f)];
    ops.push(add({ id: 's-cause', kind: 'statements', title: L('sim.r.sec.cause'), data: { items } }, L('sim.r.say.cause')));
    ops.push(...evidenceOps(f));
    /* 5 감지: 어떻게, 얼마나 빨리 */
    const first = [...s.changes].filter(c => c.lane === 'symptom' || c.tone === 'danger').sort((a, b) => a.at - b.at)[0];
    const det = [{ id: 'how', label: L('sim.r.det.how'), value: `Alertmanager ${s.alert} · ${f.sev}` },
      ...(first ? [{ id: 'first', label: L('sim.r.det.first'), value: `${tm(first.at)} · ${first.kind} · ${first.title}` }] : []),
      { id: 'tta', label: L('sim.r.det.toAlert'), value: dur(-f.start) }, { id: 'ttj', label: f.held ? L('sim.r.det.toHypo') : L('sim.r.det.toJudge'), value: dur(g.judgedAt()) },
      ...(approvals.length ? [{ id: 'tap', label: L('sim.r.det.toApprove'), value: dur(approvals[0].at) }] : []), { id: 'ttr', label: L('sim.r.det.toEnd'), value: dur(f.end) }];
    ops.push(add({ id: 's-det', kind: 'summary', title: L('sim.r.sec.detect'), data: { items: det } }, L('sim.r.say.detect')));
    /* 6 대응: 시도마다 무엇을 바꾸기로 했고 왜 골랐는지(실행 기록은 3 타임라인에만) */
    const acts = approvals.flatMap((h, i) => { const nx = approvals[i + 1]?.at ?? Infinity; return attemptItems(f, h, i, f.hist.filter(x => x.at > h.at && x.at < nx), approvals.length > 1 ? `${L('sim.r.col.attempt')} ${i + 1} · ` : ''); });
    ops.push(add({ id: 's-act', kind: 'statements', title: L('sim.r.sec.response'), data: { items: acts } }, L('sim.r.say.action')));
    const word = { pass: L('sim.p.vc.pass'), watch: L('sim.p.vc.watch'), fail: L('sim.p.vc.fail'), unknown: L('sim.r.ver.notJudged') };
    const vrow = c => ({ id: c.id, label: c.label0, kind: c.optional ? L('sim.r.ver.optional') : L('sim.r.ver.required'), state: word[c.state] ?? c.state, value: c.value });
    ops.push(add({ id: 's-ver', kind: 'table', sub: true, title: L('sim.r.sec.verify'), caption: L('sim.r.ver.cap', { pass: num(counts.passed), nj: num(counts.unjudged), min: NEED / 60, sec: CADENCE, max: MAX / 60, from: hms(S.verifyFrom ?? 0) }),
      data: { columns: [{ id: 'label', label: L('sim.r.col.cond'), wrap: true }, { id: 'kind', label: L('sim.r.col.kind'), w: '7ch' }, { id: 'state', label: L('sim.r.col.result'), w: '9ch' }, { id: 'value', label: L('sim.r.col.value'), muted: true, w: '36%', wrap: true }], rows: conds.map(vrow) } }, L('sim.r.say.verify')));
    /* 7 잘된 점과 아쉬운 점: the scenario's own retrospective (its real events), plus a failed check when one happened */
    const good = (s.retro?.good ?? []).map(stop), bad = [...(s.retro?.bad ?? []).map(stop), ...(fails.length ? [L('sim.r.lr.fails', { n: num(fails.length) })] : [])];
    ops.push(add({ id: 's-lr', kind: 'statements', title: L('sim.r.sec.lessons'), data: { items: [...good.map((x, i) => ({ id: `g${i}`, label: i ? '' : L('sim.r.lr.goodL'), text: x })), ...bad.map((x, i) => ({ id: `b${i}`, label: i ? '' : L('sim.r.lr.badL'), text: x }))] } }, L('sim.r.say.lessons')));
    /* 8 후속 조치: 원인과 감지 공백에서 나온 할 일, 담당과 기한 */
    const fu = followUps(f);
    if (fu.length) ops.push(add({ id: 's-fu', kind: 'table', title: L('sim.r.sec.follow'), data: { columns: [{ id: 'text', label: L('sim.r.col.todo'), wrap: true }, { id: 'kind', label: L('sim.r.col.kind'), w: '8%' }, { id: 'owner', label: L('sim.r.col.owner'), w: '14%' }, { id: 'due', label: L('sim.r.col.due'), w: '13%' }], rows: fu.map((r, i) => ({ id: `f${i}`, ...r })) } }, L('sim.r.say.follow')));
    ops.push(...appendixOps(f));
    return ops;
  }
  /* follow-ups: the chosen action's list from the data (cause items first, then the scenario's detection and process items), each with its owner and dated due */
  const followUps = f => (f.opt?.followUps ?? []).map(x => ({ text: x.title, kind: L(`sim.r.fu.kind.${x.from}`), owner: x.owner, due: x.dueDate }));

  /* ---------- 작업 목록 ---------- */
  function script() {
    const g = get();
    if (g.s.quiet) return quietScript(g);
    const f = facts();
    return f.ph === 'resolved' ? postmortemScript(f) : statusScript(f);
  }

  /* the quiet day's counts and its next action: one place for the document and the channel text */
  function quietFacts(g) {
    const { w, sid, t, S, V } = g, ns = S.ns !== 'all' ? S.ns : null, at0 = t - H;
    const firing = alertsOf(sid, t, g.phase(), S.cid).filter(a => a.state !== 'resolved'), evs = V.groupEv(eventsIn(w, sid, at0, t, S.cid).filter(e => !ns || e.ns === ns)), warn = evs.filter(e => e.type === 'Warning');
    const probs = w.problems.filter(p => !ns || p.ns === ns);
    const next = [...firing.filter(a => a.state === 'firing').slice(0, 1).map(a => L('sim.r.q.nextAlert', { name: a.name, target: a.target })), ...probs.slice(0, 1).map(p => L('sim.r.q.nextPod', { name: p.name, ns: p.ns, st: p.status[1] }))];
    return { ns, at0, firing, evs, warn, probs, next };
  }
  /* 열린 인시던트가 없는 날: 보고 있는 namespace(없으면 전체)와 지난 1시간 */
  function quietScript(g) {
    const { w, sid, t, S, V } = g, q = quietFacts(g), ops = [];
    ops.push(add({ id: 's-sum', kind: 'text', title: L('sim.r.sec.summary'), data: { text: [L('sim.r.q.sum1', { cluster: w.cluster.name, from: hm(q.at0), to: hm(t) }), L('sim.r.q.sum2', { a: num(q.firing.length), w: num(q.warn.length), p: num(q.probs.length) }), q.next.length ? L('sim.r.q.sumNext', { list: q.next.join(', ') }) : ''].filter(Boolean).join(' ') } }, L('sim.r.say.sum')));
    /* the connections: the ones that answer on one row, each one that does not with its own state */
    const tools = [{ id: 'agent', name: 'wake-agent', state: w.agent.state, detail: w.agent.detail }, ...w.tools.filter(x => x.state !== 'idle')], ok = tools.filter(x => x.state === 'ok');
    ops.push(add({ id: 's-st', kind: 'summary', title: L('sim.r.q.state'), data: { items: [{ id: 'n', label: 'Node', value: num(w.nodes.length) }, { id: 'p', label: 'Pod', value: num(w.pods.length) }, ...(ok.length ? [{ id: 'ok', label: L('sim.w.state.ok'), value: ok.map(x => x.name).join(' · ') }] : []), ...tools.filter(x => x.state !== 'ok').map(x => ({ id: x.id, label: x.name, value: x.detail }))] } }, L('sim.r.say.state')));
    ops.push(add({ id: 's-al', kind: q.firing.length ? 'table' : 'text', title: L('sim.r.q.alerts'), ...(q.firing.length ? { caption: L('sim.r.timeKst', { date: ymd(t) }), snapshot: snap('Alertmanager', 'GET /api/v2/alerts?active=true', t), data: { columns: [{ id: 'name', label: 'alertname' }, { id: 'sev', label: 'severity', w: '9ch' }, { id: 'state', label: 'state', w: '8ch' }, { id: 'target', label: L('sim.r.col.target') }, { id: 'at', label: L('sim.r.col.since'), w: tm(Math.min(...q.firing.map(a => a.at))).length > 8 ? '19ch' : '10ch' }], rows: q.firing.map(a => ({ id: a.id, name: a.name, sev: a.severity, state: a.state, target: a.target, at: tm(a.at) })) } } : { data: { text: L('sim.r.q.noAlerts') } }) }, L('sim.r.say.alerts')));
    ops.push(...eventOps(V, q.ns, q.at0, t, t, S.cid, w, sid, null, false));
    if (q.probs.length) ops.push(add({ id: 's-pb', kind: 'table', title: L('sim.r.q.problems'), snapshot: snap('Kubernetes API', `pods ${q.ns ? '-n ' + q.ns : '--all-namespaces'}`, t), data: { columns: [{ id: 'name', label: 'Name' }, { id: 'ns', label: 'Namespace', w: '17%' }, { id: 'st', label: 'Status', w: '36%' }, { id: 'rs', label: 'Restarts', w: '9ch', end: true }], rows: q.probs.slice(0, 20).map(p => ({ id: `${p.ns}/${p.name}`, name: p.name, ns: p.ns, st: p.status[1], rs: num(p.restarts ?? 0) })) }, caption: q.probs.length > 20 ? L('sim.r.q.more', { shown: num(20), n: num(q.probs.length) }) : '' }, L('sim.r.say.problems')));
    return ops;
  }

  /* the AI's answer to "선택한 항목": the rows it did not point to get pointed to, and one sentence whose numbers are those rows' own */
  function follow(state, items, seq) {
    const ops = [], byBlock = new Map();
    for (const x of items.filter(y => y.id != null)) byBlock.set(x.block, [...(byBlock.get(x.block) ?? []), x]);
    for (const [bid, xs] of byBlock) {
      const b = state.blocks.find(y => y.id === bid); if (!b) continue;
      ops.push({ op: 'highlight', block: bid, ids: xs.map(x => x.id), say: L('sim.r.follow.markSay', { n: num(xs.length), title: b.title }) });
      const at = state.blocks.findIndex(y => y.id === bid) + 1;
      ops.push({ op: 'add', at, block: { id: `t-u${seq}-${bid}`, kind: 'text', sub: true, title: L('sim.r.follow.title', { title: b.title }), data: { text: L('sim.r.follow.text', { n: num(xs.length), words: xs.map(x => String(x.label).slice(0, 80)).join(' · ') }) } }, say: L('sim.r.follow.textSay') });
    }
    return ops;
  }

  /* ---------- 내보내기 ---------- */
  function markdown(state, h) {
    return toMarkdown(state, { title: h.title, head: h.rows, format: at => `${ymd(at - T0)} ${hms(at - T0)} KST`, hidden: n => L('sim.r.md.hidden', { n: num(n) }) });
  }
  /* the channel text: five to eight plain lines with the same values as the document's top */
  function channel() {
    const g = get();
    if (g.s.quiet) {
      const h = head(), q = quietFacts(g);
      return [h.title, L('sim.r.ch.quiet', { a: num(q.firing.length), w: num(q.warn.length), p: num(q.probs.length) }), ...(q.next.length ? [`${L('sim.r.ch.nextL')}: ${q.next.join(' · ')} — ${ME}`] : []), `${h.rows[0].label} ${h.rows[0].value} · ${h.rows[1].label} ${h.rows[1].value} · ${L('sim.r.h.oncall')} ${ME}`].join('\n');
    }
    const f = facts(), linkLine = `${L('sim.r.now.linksL')}: ${links(f).filter(x => !/^PR /.test(x)).join(' · ')}`;
    if (f.ph === 'resolved') {
      const fu = followUps(f);
      return [`[${f.inc}] ${f.s.title} · ${f.sev} · ${recoveryWord(f)}`, [L('sim.r.ch.resolved', { time: `${full(f.end)} KST`, dur: dur(f.end - f.start), action: f.approvals.at(-1)?.option ?? '' }), ...(f.prLink ? [`PR ${f.prLink}`] : [])].join(' · '), `${L('sim.r.now.impactL')}: ${impactWords(f)}`, `${causeLabel(f)}: ${stop(f.ch.conclusion)}`,
        ...(fu.length ? [`${L('sim.r.sec.follow')}: ${fu.map(x => L('sim.r.ch.fu', { text: x.text, owner: x.owner, due: x.due })).join(' · ')}`] : []), linkLine].join('\n');
    }
    const dec = decision(f), steps = nextSteps(f);
    return [`[${f.inc}] ${f.s.title} · ${f.sev} · ${g.statusWord}`, `${L('sim.r.now.impactL')}: ${impactWords(f)}`, ...(f.ph === 'scoping' || f.ph === 'investigating' ? [] : [`${causeLabel(f)}: ${stop(f.ch.conclusion)}`]), ...(dec.length ? [`${L('sim.r.now.decideL')}: ${dec.join(' · ')}`] : []), ...(steps.length ? [`${L('sim.r.now.nextL')}: ${steps.map(([s0, w]) => (w === oncall() ? `${s0.replace(/ · .*/, '')}(${ME})` : s0.replace(/ · .*/, ''))).join(' → ')}`] : []), ...(f.checks.length ? [`${L('sim.r.now.checkL')}: ${f.checks.map(c => L('sim.r.now.check', { at: hm(c.at), text: c.text, owner: c.owner })).join(' · ')}`] : []), `${L('sim.r.now.updateL')}: ${nextUpdate(f)}`, linkLine].join('\n');
  }

  /* print: A4, light, the document's title and the page number on every page; the screen around the report drops */
  const printCss = h => `@page { size: A4; margin: 18mm 16mm 18mm; @top-left { content: ${JSON.stringify(h.title)}; font-size: 8pt; color: #555; } @bottom-right { content: counter(page); font-size: 8pt; color: #555; } }`;
  const css = `
.ai-sel { display: flex; flex-wrap: wrap; gap: var(--space-1_5); }
.sim-report .rc-sec { animation: rp-in var(--dur-flow-reveal) var(--ease-standard) both; }
@keyframes rp-in { from { opacity: 0; transform: translateY(var(--space-1)); } }
.sim-body[data-ai-step] .rp-state { animation: rp-ring calc(var(--dur-flow-reveal) * 4) var(--ease-standard) both; }
@keyframes rp-ring { 0%, 60% { opacity: .55; } 100% { opacity: 1; } }
.sim-report > .dt-back { position: sticky; top: calc(-1 * var(--space-4)); z-index: 2; background: var(--background); margin-block: calc(-1 * var(--space-4)) 0; padding-block: var(--space-4) var(--space-1); }
@media (prefers-reduced-motion: reduce) { .sim-report .rc-sec, .sim-body[data-ai-step] .rp-state { animation: none; } }
/* printing: the page becomes the paper before the print dialog opens (the same layout on screen and in print, so the charts are drawn at the paper's width) */
html:has(body.printing-report), body.printing-report, body.printing-report :is(main, .sim, .sim-frame, .sim-panes, .sim-report) { background: #fff !important; }
body.printing-report :is(.sim-ctl, .sim-side, .sim-body, .sim-ai, .sim-gap, .sim-stack-t, .dt-back, .ntcs) { display: none !important; }
html:has(body.printing-report), body.printing-report, body.printing-report > main { display: block !important; height: auto !important; overflow: visible !important; }
body.printing-report :is(.sim, .sim-frame, .sim-panes, .sim-stack) { display: block !important; height: auto !important; overflow: visible !important; }
body.printing-report .sim-report { display: block !important; width: 178mm; max-width: 100%; margin-inline: auto; border: 0; padding: 0; overflow: visible !important; animation: none; }
body.printing-report .sim-report .rc-sec { animation: none; }
body.printing-report .sim-report, body.printing-report .sim-report :not(svg *) { color: #000; }
body.printing-report .sim-report :is(.rc-src, .rc-n, .rc-kv dt, .rc-tbl th, .rc-tbl td.muted, .rc-no, .rc-sl, .rc-refs) { color: #444; }
body.printing-report .rc-doc h1 { font-size: 16pt; }
body.printing-report :is(.rc-tbl, .rc-log, .rc-st, .rc-kv, .rc-text, .rc-ex) { font-size: 9pt; }
`;
  return { head, script, follow, markdown, channel, printCss, css };
}
