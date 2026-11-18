/*
 * 시뮬레이션 엔진: 시계(tick), 단계(phase), 수집 구간과 복구 판정, 승인 뒤 PR·리뷰·병합·동기화·롤아웃과 외부 조치의 진행을 정한다. DOM을 쓰지 않는다.
 * 인시던트 상태(S)는 sim.js가 갖고 bind로 넘긴다. 시나리오와 세계(도구 연결 상태)는 함수로 받는다.
 * 사람과 외부 팀이 하는 일은 실제로 걸리는 간격으로 기록한다: Draft PR → 리뷰 요청 → 다른 사람의 리뷰 승인 → 병합(PR_POLICY),
 * 수동 조치는 요청 → 외부 실행(실행자·티켓) → 관측된 회복 → 완료 표시. merge()와 done()이 그 간격만큼 시계를 앞으로 보낸다.
 */
import { CADENCE, NEED, MAX, MIN_WINDOWS, FAIL_WINDOW, PR_POLICY, RECOVERY, ME, linksOf } from './sim-data.js';
import { hash, hex7, incOf, batchRun } from './sim-world.js';
import { hm, hms, dur } from './sim-format.js';
import { t as L } from './sim-locale.js';

/** the incident's own state at the start of a run: the clock 25 seconds before the alert, nothing approved, applied or checked */
export const incidentStart = () => ({ t: -25, approvedAt: null, chosen: null, mergedAt: null, doneAt: null, observedAt: null, observedFor: null, verifyFrom: null, failAt: null, failInjected: false, failedOnce: false, resolvedAt: null, inconclusiveAt: null, prFailed: null, prRequestAt: null, prId: null, prCreatedAt: null, syncAt: null, attempt: 0, downWins: [], history: [], paused: false });

/** scenario: the scenario in play; world: the world now (its tools and agent); speed: the clock's speed; sid: the scenario id */
export function createEngine({ scenario: sc, world: W, speed, sid }) {
  let S = null;
  const bind = s => { S = s; };
  const skillAt = () => sc().script.find(x => x[0] === 'skill')[1], judgedAt = () => sc().script.find(x => x[0] === 'judged')[1];
  const applyEnd = () => S.mergedAt == null ? null : S.mergedAt + sc().applyTimes.sync + sc().applyTimes.rollout;
  /* a collection window is ok only when its source answered: a window taken while Prometheus or Loki (or the agent) was down is missing, never ok */
  const windows = () => {
    if (S.verifyFrom == null || S.t < S.verifyFrom) return [];
    /* the deadline counts seen time: a window the check could not see moves the deadline one window later (up to twice the limit) */
    const len = Math.min(MAX / CADENCE + S.downWins.length, 2 * MAX / CADENCE), n = Math.min(Math.floor((S.t - S.verifyFrom) / CADENCE) + 1, len);
    return Array.from({ length: len }, (_, i) => i >= n ? 'none' : S.downWins.includes(i) ? 'miss' : (S.failInjected && i === FAIL_WINDOW ? 'bad' : (i === sc().missWindow && !S.failedOnce ? 'miss' : 'ok')));
  };
  /* what each step depends on: the PR needs GitHub, the sync and rollout need the agent (and Argo CD readable), the check needs Prometheus and Loki */
  const tool = id => W().tools.find(x => x.id === id);
  const down = id => { const x = tool(id); return !x || ['error', 'idle', 'perm'].includes(x.state); };
  const agentDown = () => W().agent.state !== 'ok';
  const blindWhy = () => [['prometheus', 'Prometheus'], ['loki', 'Loki']].filter(([id]) => down(id)).map(x => x[1]).concat(agentDown() ? ['wake-agent'] : []).join(' · ');
  /* each approval is an attempt with its own PR (a new PR number per attempt) and its own target: the chosen action's object */
  const prBase = () => sc().pr ?? 140 + (hash(sid()) % 50);
  /** the links of the incident (web page, alert, runbook, dashboard) and the PR of the chosen action's repository */
  const links = () => { const s = sc(), l = linksOf(s, incOf(sid()), optOf()?.repo ?? s.repo); return l && { ...l, prNow: S.prId != null ? l.pr(S.prId) : null }; };
  const targetOf = o => o?.target ?? sc().approval?.target ?? [];
  /* an action already tried and failed is not offered again as it was: it goes last, says when it failed, and cannot be picked (its change is applied) */
  const optionsNow = () => { const s = sc(), fails = S.history.filter(h => h.kind === 'fail'), tried = o => fails.find(h => h.option === o.title);
    /* an option's change is read against what runs now: a value an earlier attempt already changed is named at its current value */
    const applied = S.history.filter(h => h.kind === 'approve' && S.history.some(r => r.kind === 'rollout' && r.at > h.at)).map(h => (s.options ?? []).find(o => o.title === h.option)).filter(Boolean);
    const xmxNow = applied.flatMap(o => o.diff?.after ?? []).map(l => /-Xmx(\d+m)/.exec(l)?.[1]).filter(Boolean).pop();
    const now = o => (xmxNow && /-Xmx \d+m 유지/.test(o.change ?? '') ? { ...o, change: o.change.replace(/-Xmx \d+m 유지/, L('sim.e.xmxNow', { v: xmxNow, n: applied.length })) } : o);
    return [...(s.options ?? []).filter(o => !tried(o)).map(now), ...(s.options ?? []).filter(tried).map(o => { const f = tried(o), n = S.history.filter(h => h.kind === 'approve' && h.at <= f.at).length; return { ...o, disabled: true, grade: 'insufficient', basis: L('sim.e.triedFailed', { n, time: hm(f.at) }), note: L('sim.e.alreadyApplied') }; })]; };
  /* what broke the check, said as what happened ("OOMKilled 재발"), not as a failed negation */
  const failWord = () => { const l = sc().verify?.[0]?.label ?? ''; return / 없음/.test(l) ? l.replace(/\s*없음.*$/, '').replace(/^(.*)$/, (m, x) => L('sim.e.occurred', { what: x })).replace('재발 발생', '재발') : L('sim.e.condFailed', { label: l }); };
  const heldWhy = () => agentDown() ? L('sim.e.held.agent') : modeOf(optOf()) === 'pr' && down('argocd') && !S.manualSync ? L('sim.e.held.argocd') : '';
  const verifyBlind = () => down('prometheus') || down('loki') || agentDown();
  /* the effect a manual action showed, for this attempt only (a new approval starts without one) */
  const observed = () => (S.observedFor === S.attempt ? S.observedAt : null);
  const optOf = () => (sc().options ?? []).find(o => o.id === S.chosen); /* a quiet day has no actions */
  const modeOf = o => o?.mode ?? (o?.path?.[0] === 'Draft PR' ? 'pr' : 'manual');
  function phase() {
    const s = sc();
    if (s.quiet) return 'quiet';
    if (S.t < 0) return 'idle';
    if (S.resolvedAt != null && S.t >= S.resolvedAt) return 'resolved';
    if (S.inconclusiveAt != null) return 'inconclusive';
    if (S.failAt != null && S.t >= S.failAt) return 'failed';
    if (S.verifyFrom != null && S.t >= S.verifyFrom) return 'verifying';
    if (S.mergedAt != null || S.doneAt != null) return 'applying';
    if (S.approvedAt != null) return modeOf(optOf()) === 'pr' ? (S.prFailed ? 'pr-failed' : 'merge-wait') : 'handoff';
    if (S.t >= judgedAt()) return 'judged';
    if (S.t >= skillAt()) return 'investigating';
    return 'scoping';
  }
  /* advance one tick: the clock moves, and what time decides happens (apply end → verification, windows → pass or fail) */
  function tick() {
    if (S.paused) return;
    const ph = phase();
    if (ph === 'quiet') { S.t += 1; return; } /* a quiet day has nothing to apply or check: only the clock moves */
    /* waiting on a person runs at real time; what machines do runs at the chosen speed */
    const step = ['merge-wait', 'pr-failed', 'handoff', 'judged', 'resolved', 'failed', 'inconclusive'].includes(ph) ? 1 : speed();
    S.t += step;
    /* with the agent down nothing about the rollout can be read: the sync and rollout do not advance (they are held, not completed) */
    if (ph === 'applying' && heldWhy()) { if (S.mergedAt != null) S.mergedAt += step; else if (S.doneAt != null) S.doneAt += step; }
    /* what happens is recorded when it happens: the PR once GitHub has made it, the sync once Argo CD has applied it, the rollout once it is done */
    const o = optOf(), tg = targetOf(o);
    if (S.t >= ackAt() && !S.history.some(h => h.kind === 'ack')) S.history.push({ at: ackAt(), kind: 'ack', actor: { name: ME, user: true }, text: L('sim.e.ack', { who: ME }) });
    if (S.approvedAt != null && modeOf(o) === 'pr' && !S.prFailed && S.prCreatedAt == null && S.t >= (S.prRequestAt ?? S.approvedAt) + 3) { S.prCreatedAt = (S.prRequestAt ?? S.approvedAt) + 3; S.history.push({ at: S.prCreatedAt, kind: 'prcreate', pr: S.prId, attempt: S.attempt, actor: { name: 'Wake GitHub App', icon: 'brand-github' }, link: links()?.prNow, text: L('sim.e.prCreated', { pr: S.prId, target: tg[2] ?? '' }) }); }
    /* a manual action starts with its request: copied and sent to the team (its ticket) a little after the approval */
    if (S.approvedAt != null && modeOf(o) === 'manual' && o?.external && !S.history.some(h => h.kind === 'request' && h.attempt === S.attempt) && S.t >= S.approvedAt + 20) { const x = o.external; S.history.push({ at: S.approvedAt + 20, kind: 'request', attempt: S.attempt, actor: { name: ME, user: true }, ticket: x.ticket, link: x.ticket ? links()?.ticket(x.ticket) : null, text: x.ticket ? L('sim.e.request', { to: x.team, ticket: x.ticket }) : L('sim.e.requestSelf') }); }
    const syncDur = Math.max(sc().applyTimes.sync, 40); /* Argo CD notices a merged commit after its poll, never in the same second */
    if (S.mergedAt != null && S.syncAt == null && !heldWhy() && S.t >= S.mergedAt + syncDur) { S.syncAt = S.mergedAt + syncDur; S.history.push({ at: S.syncAt, kind: 'sync', pr: S.prId, attempt: S.attempt, text: L('sim.e.synced', { target: tg[2] ?? '', pr: S.prId, commit: hex7(tg.join('/') + S.prId) }) }); }
    const manualEnd = S.doneAt == null ? null : observed() != null ? S.doneAt : S.doneAt + sc().applyTimes.rollout; /* with the effect already observed the check starts at the mark */
    const end = applyEnd() ?? manualEnd;
    if (end != null && S.verifyFrom == null && S.t >= end && observed() != null && S.doneAt != null) S.verifyFrom = end;
    else if (end != null && S.verifyFrom == null && S.t >= end) { S.verifyFrom = end; S.history.push({ at: end, kind: 'rollout', attempt: S.attempt, text: /^ConfigMap/.test(tg[2] ?? '') ? L('sim.e.rolloutConfig', { target: tg[2], name: sc().scope.find(r => r.kind === 'Deployment')?.name ?? tg[1] }) : /^CronJob/.test(tg[2] ?? '') ? L('sim.e.nextRun', { time: hm(end), observed: o?.observed ?? '' }) : /^Application/.test(tg[2] ?? '') ? L('sim.e.rolloutApp', { target: tg[2] }) : modeOf(o) === 'pr' ? L('sim.e.rolloutDone', { target: tg[2] ?? '' }) : L('sim.e.observed', { what: o?.observed ?? tg[2] ?? '' }) }); }
    if (S.verifyFrom != null && S.resolvedAt == null && S.failAt == null && S.inconclusiveAt == null) {
      if (verifyBlind()) { const i = Math.floor((S.t - S.verifyFrom) / CADENCE); if (!S.downWins.includes(i)) S.downWins.push(i); }
      /* blind for as long as the whole limit: the check stops without a verdict and waits for a person to start it again */
      if (S.downWins.length * CADENCE >= MAX) { S.inconclusiveAt = S.t; S.history.push({ at: S.t, kind: 'inconclusive', text: L('sim.e.blind', { why: blindWhy() || L('sim.flow.source'), dur: dur(S.downWins.length * CADENCE) }) }); return; }
      const w = windows(), ok = w.filter(x => x === 'ok').length, bad = w.indexOf('bad');
      const stable = (S.t - S.verifyFrom) - S.downWins.length * CADENCE; /* the stable time stops while the check cannot see */
      if (bad >= 0) { S.failAt = S.verifyFrom + bad * CADENCE; S.failedOnce = true; S.history.push({ at: S.failAt, kind: 'fail', text: L('sim.e.failed', { what: failWord(), time: hms(S.failAt), n: bad + 1 }), option: optOf()?.title }); }
      else if (!verifyBlind() && stable >= NEED && ok >= MIN_WINDOWS) { const r = recovery(); S.resolvedAt = S.t; S.history.push({ at: S.t, kind: 'resolve', recovery: r.kind, watchUntil: r.until, text: r.text }); }
    }
  }

  /** the merge of the open PR, as people do it: the on-call marks the draft ready for review, someone other than the author approves it, then
   *  the merge follows the policy (the reviewer merges). The clock moves to the merge. False when there is no PR to merge yet */
  function merge() {
    if (phase() !== 'merge-wait' || S.prCreatedAt == null || down('github')) return false;
    const who = sc().owners?.reviewer ?? 'reviewer', ready = Math.max(S.t, S.prCreatedAt + 30), review = Math.max(ready + PR_POLICY.reviewAfter, S.t), at = review + PR_POLICY.mergeAfter, link = links()?.prNow;
    const merger = PR_POLICY.mergedBy === 'reviewer' ? who : ME;
    S.history.push({ at: ready, kind: 'ready', pr: S.prId, attempt: S.attempt, actor: { name: ME, user: true }, link, text: L('sim.e.prReady', { pr: S.prId, who }) },
      { at: review, kind: 'review', pr: S.prId, attempt: S.attempt, actor: { name: who, user: true }, link, text: L('sim.e.reviewed', { pr: S.prId, who }) },
      { at, kind: 'merge', pr: S.prId, attempt: S.attempt, actor: { name: merger, user: true }, link, text: L('sim.e.merged', { pr: S.prId, who: merger }) });
    S.t = at; S.mergedAt = at; return true;
  }
  /** a manual action carried out outside Wake: the team (or the on-call) runs it after a while, its effect is observed, and only then is it marked done.
   *  The clock moves to the mark. False when no manual action waits */
  function done() {
    const o = optOf(), x = o?.external;
    if (phase() !== 'handoff' || modeOf(o) !== 'manual') return false;
    if (!x) { S.doneAt = S.t; S.history.push({ at: S.t, kind: 'done', attempt: S.attempt, actor: { name: ME, user: true }, text: L('sim.e.doneMark', { title: o.title }) }); return true; }
    const ran = Math.max(S.t, S.approvedAt + x.after), seen = ran + x.settle, mark = seen + 30, ticket = x.ticket ? links()?.ticket(x.ticket) : null;
    S.history.push({ at: ran, kind: 'external', attempt: S.attempt, actor: { name: x.actor, user: true, team: x.team }, ticket: x.ticket, link: ticket, text: x.ticket ? L('sim.e.external', { team: x.team, who: x.actor, ticket: x.ticket, did: x.did }) : L('sim.e.externalSelf', { did: x.did }) },
      { at: seen, kind: 'observed', attempt: S.attempt, actor: { name: 'Wake', icon: 'circle-check' }, text: L('sim.e.observed', { what: x.observed }) },
      { at: mark, kind: 'done', attempt: S.attempt, actor: { name: ME, user: true }, text: L('sim.e.doneMark', { title: o.title }) });
    S.t = mark; S.observedAt = seen; S.observedFor = S.attempt; S.doneAt = mark; return true;
  }
  /** when the on-call acknowledged the page (its own time, apart from reading the judgement) */
  const ackAt = () => sc().people?.ack ?? 60;
  /** the earliest a person approves: after the ack and after reading the judgement (one to five minutes), never in the judgement's second */
  const approveFrom = () => Math.max(ackAt() + 20, judgedAt() + (sc().people?.read ?? 120));
  /** the approval of a choice, as a person gives it: at least approveFrom(), the clock moves there. Starts a new attempt (its own PR number) */
  function approve(id) {
    const o = (sc().options ?? []).find(x => x.id === id);
    if (!o || o.disabled || !['judged', 'failed'].includes(phase())) return false;
    S.chosen = id; const at = Math.max(S.t, approveFrom()), mode = modeOf(o);
    if (!S.history.some(h => h.kind === 'ack')) S.history.push({ at: ackAt(), kind: 'ack', actor: { name: ME, user: true }, text: L('sim.e.ack', { who: ME }) });
    S.t = at; S.history.push({ at, kind: 'approve', option: o.title, mode, attempt: S.attempt + 1, target: targetOf(o), pr: mode === 'pr' ? prBase() + S.attempt : null, actor: { name: ME, user: true } });
    Object.assign(S, { approvedAt: at, downWins: [], failAt: null, verifyFrom: null, mergedAt: null, doneAt: null, resolvedAt: null, inconclusiveAt: null, failInjected: false, prFailed: null, prCreatedAt: null, prRequestAt: null, syncAt: null, attempt: S.attempt + 1 });
    S.prId = mode === 'pr' ? prBase() + S.attempt - 1 : null;
    if (mode === 'pr' && down('github')) { S.prFailed = tool('github')?.detail ?? ''; S.history.push({ at, kind: 'prfail', text: L('sim.e.prFailed', { why: S.prFailed }) }); }
    return true;
  }
  /** the checks that do not wait for the regular update: before a batch's deadline (its next scheduled run) and when an outside team said it would be done */
  function nextChecks() {
    const s = sc(), out = [], u = s.affects, ph = phase(), run = batchRun(sid(), S.t, fixAt());
    if (['resolved', 'quiet'].includes(ph)) return out;
    if (u?.kind === 'batch' && !run?.resumed && S.t < u.deadline) out.push({ at: u.deadline - 300, kind: 'deadline', owner: ME, text: L('sim.e.checkDeadline', { at: hm(u.deadline), policy: u.policy }) });
    const o = optOf(), x = o?.external;
    if (ph === 'handoff' && x && S.approvedAt != null) out.push({ at: S.approvedAt + x.after + x.settle, kind: 'external', owner: `${x.team} ${x.actor}`, ticket: x.ticket, text: L('sim.e.checkEta', { team: x.team, who: x.actor, ticket: x.ticket ?? '' }) });
    return out.sort((a, b) => a.at - b.at);
  }
  /** the evidence as it stands now: the skill's reads, and a reply from an outside team once it came (numbered on, marked as added after the approval) */
  function evidenceNow() {
    const s = sc(), list = [...(s.evidence ?? [])];
    for (const h of S.history.filter(x => x.kind === 'external')) { const o = (s.options ?? []).find(x => x.external?.ticket && x.external.ticket === h.ticket); if (o?.reply) list.push({ id: Math.max(...list.map(e => e.id)) + 1, ...o.reply, got: h.at, at: h.at, range: L('sim.fmt.at', { time: hms(h.at) }), added: true, link: h.link }); }
    return list;
  }
  /** the cause as it stands now: the judged chain, or the one an outside reply supports once it is in */
  const chainNow = () => { const s = sc(); return s.chainAfterReply && evidenceNow().some(e => e.added) ? s.chainAfterReply : s.chain; };
  /** when the fix took effect (the symptom series drop there): the observed effect of a manual action, else the end of the rollout */
  const fixAt = () => observed() ?? S.verifyFrom ?? Infinity;
  /** how the recovery is classed (service recovered, symptom recovered, mitigated, verification bypassed) and, for an action that needs a watch, until when */
  function recovery() {
    /* a batch is back only when its run completed: until then it has resumed, not recovered */
    const o = optOf(), run = batchRun(sid(), S.t, fixAt()), kind = run && !run.complete ? 'resumed' : o?.recovery ?? 'service', until = o?.watch && S.verifyFrom != null ? S.verifyFrom + o.watch : null;
    return { kind, label: RECOVERY[kind].label, until, watching: until != null, text: until != null ? L('sim.e.resolvedWatch', { label: RECOVERY[kind].label, days: Math.round(o.watch / 86400) }) : o?.residual ? L('sim.e.resolvedResidual', { label: RECOVERY[kind].label, risk: o.residual }) : L('sim.e.resolvedAs', { label: RECOVERY[kind].label, text: RECOVERY[kind].text }) };
  }

  return { nextChecks, approve, approveFrom, ackAt, evidenceNow, chainNow, bind, phase, tick, windows, skillAt, judgedAt, tool, down, agentDown, blindWhy, prBase, targetOf, optionsNow, failWord, heldWhy, verifyBlind, optOf, modeOf, merge, done, fixAt, recovery, links };
}

/** the recovery check's counts, required conditions apart from the ones that could not be judged: { required, passed, unjudged, optional }
 *  conds: the conditions as the check reads them ({ state, optional }) */
export function verifyCounts(conds) {
  const req = conds.filter(c => !c.optional);
  return { required: req.length, passed: req.filter(c => c.state === 'pass').length, unjudged: conds.filter(c => c.state === 'unknown').length, optional: conds.length - req.length };
}
/** whether a cause is judged or still a hypothesis: a rule on hold (or a chain held for missing evidence) leaves a hypothesis */
export const causeStatus = (chain, rule) => (chain?.supported ? 'supported' : chain?.held || rule?.held || chain?.grade === 'insufficient' ? 'hypothesis' : 'judged');
