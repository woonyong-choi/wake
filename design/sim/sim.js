/*
 * Wake 전체 시뮬레이션: 클러스터 홈에서 시작해 리소스·이벤트·로그·알림·인시던트·설정을 모두 눌러 보는 견본 앱. 백엔드 없이 재생한다.
 * 화면은 사이드바 | 본문(홈, 리소스, 이벤트, 로그, 알림, 인시던트 목록, 인시던트, 설정) | 상세 | AI 창.
 * 시나리오는 운영 규모의 세계(sim-world.js) 안에서 일어난다: 감지 전 홈에서 시작하고, 알림이 오면 홈·사이드바·알림에 인시던트가 나타난다.
 * 시계는 1·5·30배로 돌고, 사람의 동작(승인, PR 병합, 조치 완료)을 기다리는 곳에서 멈춘다. 새 부품은 sim-parts.js(승인 전 견본).
 */
import config from '../../apps/wake/app.config.js';
import { bootPage, components as C, html, attachSplitPanes } from '../../kit/page/index.js';
import { surfaceKey } from '../../kit/core/shortcuts.js';
import { useLocale } from '../../kit/core/i18n.js';
import { SCENARIOS, CADENCE, NEED, MAX, MIN_WINDOWS, CHANGE_LANES, FAIL_WINDOW, ME, MODEL } from './sim-data.js';
import { T0, hm, hms, ymd, when, dur } from './sim-format.js';
import { createParts, css as partsCss, KEYS } from './sim-parts.js';
import { world, CLUSTERS, alertsOf, pastOf, changesOf, alertText, backgroundAlert, replacementName, errorRate, STATE_WORD, podStatus, userImpactOf, freshness, memoryOf } from './sim-world.js';
import { createViews, KINDS } from './sim-views.js';
import { navDefaults, AI_KEYS, RANGE_KEYS, PRESETS, aiRangeKey, setters, SCOPE_PAGES, SCOPE_RESET, scopeKey } from './sim-screens.js';
import { createEngine, incidentStart, causeStatus } from './sim-engine.js';
import { t } from './sim-locale.js';
import { createReport, reportStore } from './sim-report.js';
import { mask, maskCount, redactedTotal } from './sim-mask.js';
import { actionsFor, copyCommands, containersOf } from './sim-gaps.js';
import { deleteSelectedOp } from '../../kit/core/report.js';
import { createSettingsSim } from './sim-settings.js';

const STAGES = ['scope', 'time', 'cause', 'act', 'verify', 'record'].map(id => [id, t('sim.stage.' + id)]);

bootPage(config, async ctx => {
  document.documentElement.lang = useLocale('ko'); /* the simulation is reviewed in Korean: kit strings (graph readings, notices) follow it */
  const { icon } = ctx;
  const P = createParts({ C, html, icon });
  /* ?freeze opens one fixed moment for comparing screens: the clock does not run and window.__sim moves it by hand (a development aid; nothing changes without it) */
  const dev = new URLSearchParams(location.search), frozen = dev.has('freeze');
  const st = { sid: dev.get('sid') || (() => { try { return localStorage.getItem('sim:sid') || 's1'; } catch { return 's1'; } })(), speed: 5 };
  const nav = navDefaults; /* every screen's state and its defaults (sim-screens.js) */
  /* a run's state: every screen's view state, the incident's own state (the engine's), and what the panes show */
  const fresh = () => ({ ...nav(), ...incidentStart(), open: {}, stepsOpen: false, cardOpen: true, aiChainOpen: false, aiOpen: false, approval: false, approvalDenied: false, hint: false, sel: null, selPrev: null, row: 0, note: '', adoptedAlt: false });
  let S = fresh();
  const sc = () => SCENARIOS.find(x => x.id === st.sid);

  /* ---------- 시간에 따라 정해지는 상태: the engine (sim-engine.js) ---------- */
  const E = createEngine({ scenario: sc, world: () => W(), speed: () => st.speed, sid: () => st.sid }); E.bind(S);
  const { phase, tick, windows, skillAt, judgedAt, tool, down, agentDown, blindWhy, prBase, targetOf, optionsNow, failWord, heldWhy, verifyBlind, optOf, modeOf } = E;
  /* alerts arrive as toasts: the scenario's at t0 (with its incident), a background warning a little before it, and a quieter one when recovery is confirmed */
  /* alerts arrive as kit notices, run by the page itself (a page opened on its own has no shell to show them): a critical one stays until it is
     opened or dismissed, others run out; the same alert firing again raises the count of the card that is up */
  let notices = null;
  const notify = p => { notices ??= C.notice.attach(document.body, { emit: (name, payload) => { page.actions[name]?.(payload ?? {}, ctx); }, now: () => (T0 + S.t) * 1000 }); /* ages read against the simulation clock */ return notices.notify(p); };
  const at = rel => (T0 + rel) * 1000; /* the notice's clock is the simulation's: an alert that fired at t0 reads 14:02:00 */
  setTimeout(() => attachSplitPanes(document.body, { min: .2, onChange: ({ id, weights }) => { S.splitW = { ...(S.splitW ?? {}), [id]: weights }; ctx.update(); } }), 0);
  let timer = setInterval(() => {
    const was = S.t, wasPh = phase(); tick(); const s = sc();
    /* an alert reads as Alertmanager sends it: severity and status as their label values with the start time, the annotation summary as the title,
       the alertname and the labels that place it, then Wake's own line (the incident it opened) */
    /* a notice says one thing each: the severity word as Alertmanager sent it, the title, one fact, where (namespace › object) and since when; the alertname and labels are its tooltip */
    const where = (lb, ns) => `${lb.namespace ?? ns ?? ''} › ${lb.pod ? `Pod ${lb.pod}` : lb.deployment ? `Deployment ${lb.deployment}` : lb.job_name ? `Job ${lb.job_name}` : lb.application ? `Application ${lb.application}` : lb.persistentvolumeclaim ? `PVC ${lb.persistentvolumeclaim}` : ''}`;
    const tipOf = (name, lb) => [{ key: 'alertname', value: name }, ...Object.entries(lb).map(([key, value]) => ({ key, value }))];
    if (was < -12 && S.t >= -12 && S.cid === 'wake-prod') { const b = backgroundAlert(S.cid); notify({ id: 'al-gpu', tone: 'warn', title: b.summary, severity: b.severity, fact: t('sim.app.notice.gpuFact'), target: where(b.labels), since: at(-12), labels: tipOf(b.alertname, b.labels), duration: 8000, action: { label: t('sim.app.notice.alerts'), action: 'sim.go', arg: { page: 'alerts' } }, menu: { id: 'sim.alertMenu', arg: b.alertname } }); }
    const a = alertText(st.sid);
    if (was < 0 && S.t >= 0 && a) notify({ id: 'al-' + s.id, tone: a.severity === 'critical' ? 'danger' : 'warn', title: a.summary, severity: a.severity, fact: a.fact, target: where(a.labels, s.ns), since: at(0), labels: tipOf(a.alertname, a.labels), ...(a.severity === 'critical' ? { persist: true } : { duration: 12000 }), action: { label: t('sim.app.notice.openIncident', { id: a.incident }), action: 'sim.go', arg: { page: 'incident' } }, menu: { id: 'sim.alertMenu', arg: a.alertname } });
    if (wasPh !== 'resolved' && phase() === 'resolved' && a) notify({ id: 'al-' + s.id, tone: 'ok', title: a.resolved, severity: a.severity, fact: t('sim.app.notice.resolved'), target: where(a.labels, s.ns), since: at(0), resolvedAt: at(S.resolvedAt), labels: tipOf(a.alertname, a.labels), duration: 8000, action: { label: t('sim.app.notice.openIncident', { id: a.incident }), action: 'sim.go', arg: { page: 'incident' } } }); /* the same card turns resolved in place */
    ctx.update();
  }, 1000);
  if (frozen) { clearInterval(timer);
    window.__sim = { get S() { return S; }, st, phase, update: () => ctx.update(), set: o => { Object.assign(S, o); ctx.update(); },
      run: until => { while (S.t < until) tick(); ctx.update(); }, act: (name, arg) => page.actions[name](arg ?? {}, ctx) }; }
  /* the world at this moment, and what every app view reads */
  /* the world, with the agent's silence counted on the simulation clock from when it went down (not a fixed text) */
  const W = () => { const w = world(st.sid, S.t, phase(), S.conn, S.cid); if (w.agent.state === 'ok' || S.cid === 'wake-dev') return w; const since = S.agentDownAt ?? S.t;
    return { ...w, agent: { ...w.agent, beat: t('sim.app.agent.beat', { ago: dur(Math.max(1, S.t - since)), date: ymd(since), time: hms(since) }) } }; };
  /* the one mark an open incident carries everywhere (sidebar, home, incident list): resolved ok, otherwise failing until it is fixed */
  /* the one mark of a result, from its code: a service recovered and closed is ok; mitigated, bypassed, a symptom back without its cause, or still watched is amber, never a tick */
  const recoveryKind = r => (r && r.kind === 'service' && !r.watching ? 'ok' : 'warn');
  const resolvedKind = () => recoveryKind(E.recovery());
  const incidentKind = () => phase() === 'resolved' ? resolvedKind() : 'error';
  const incidentOpen = () => !sc().quiet && S.t >= 0 && S.cid === 'wake-prod';
  const V = createViews({ C, html, icon, get: () => ({ liveChanges: liveChanges(), S, fixAt: E.fixAt(), w: W(), sid: st.sid, t: S.t, ph: phase(), s: sc(), incidentOpen: incidentOpen(), evidence: E.evidenceNow(), resultKind: incidentKind(), statusWord: statusWord[phase()] ?? '', cid: S.cid }) });
  /* 연결·자료 화면: 설정의 새 줄(exec 명령 허락, 연결 설정 파일 고치기, 내 자료, 자동 해석, 클라이언트 토큰) */
  const SET = createSettingsSim({ C, html, icon, get: () => ({ S }), update: () => ctx.update(), toast: title => toasts.show({ title, tone: 'ok' }) }); /* toasts: the copy toast below (same layer) */
  /* when the incident's effect began: the error rate's own start, else the first symptom on the timeline */
  const impactStart = () => { const s = sc(); return s.impact?.from ?? Math.min(0, ...(s.changes ?? []).filter(c => c.lane === 'symptom' || c.tone === 'danger').map(c => c.at)); };
  const R = createReport({ get: () => ({ E, S, V, w: W(), sid: st.sid, t: S.t, s: sc(), audit: auditTrail, inc: alertText(st.sid)?.incident ?? sc().id, alert: alertText(st.sid), phase, statusWord: statusWord[phase()] ?? '', chain: officialChain, opt: optOf, grade: g => P.grade(g).label, verify: verifyConditions, impactStart, options: optionsNow, modeOf, judgedAt, blindWhy }) }), REP = reportStore();
  const sleep = ms => new Promise(r => setTimeout(r, ms)), reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* the nav fields the AI may set on the main view (its declarative state): what it changes it says, and one press puts them back */
  const NAV_KEYS = AI_KEYS;
  const PRESET_SEC = Object.fromEntries(PRESETS.map(([sec, id]) => [id, sec]));
  /* each thing the AI set is a chip that names it and the view keys it holds: a chip taken off puts those keys back as they were before the AI */
  function drive(d) {
    S.aiDrive ??= { before: Object.fromEntries(NAV_KEYS.map(k => [k, S[k]])), chips: [] };
    for (const k of Object.keys(d.set)) if (!(k in S.aiDrive.before)) S.aiDrive.before[k] = S[k]; /* a key the screens added after the list was made is kept too */
    Object.assign(S, d.set); S.aiDrive.view = S.view; S.aiDrive.flash = Date.now(); syncScope();
    for (const c of d.chips) S.aiDrive.chips = [...S.aiDrive.chips.filter(x => !x.keys.some(k => c.keys.includes(k))), c];
  }
  /* the report streams: each op plays its motion on the canvas, is applied, is logged in the AI pane, and (when it has one) sets the main view;
     a press of the person's own on the main view or the sidebar stops it; the AI never presses approve or merge */
  async function stream() {
    const r = S.report; if (!r || r.running) return; r.running = true;
    while (r === S.report && r.streaming && r.queue.length) {
      const op = r.queue[0], root = document.querySelector('.sim-report');
      if (root && !reduced() && op.op !== 'range') await C.reportCanvas.play(root, REP.state, op);
      if (r !== S.report || !r.streaming) break;
      r.queue.shift(); const { say, drive: d, ...kitOp } = op;
      try { REP.apply(kitOp); } catch (e) { console.warn('report op', e.message); }
      r.log.push({ say, at: S.t }); if (d) drive(d);
      ctx.update(); await sleep(reduced() ? 0 : 650);
    }
    r.running = false; if (!r.queue.length) r.streaming = false; ctx.update();
  }
  /* a resource action is a plan first (the exact command, its reach, the checks); it runs only after a person approves it, and both are recorded */
  /* one record line in the AI pane: mark · what · who · time · the rest, on one line; only the rest gives way (its whole words as its title) */
  const whoTail = (at, text) => html`<time>${hms(at)}</time><span class="ai-x" title="${text}">${text}</span>`;
  function planTalk() {
    const log = (S.planLog ?? []).map(x => html`<div class="ai-who">${C.statusIcon.render({ kind: x.kind === 'deny' ? 'idle' : 'ok' })}<span>${x.kind === 'run' ? t('sim.app.plan.run') : x.kind === 'deny' ? t('sim.app.plan.deny') : t('sim.app.plan.approve')}</span>${x.kind === 'run' ? '' : C.avatar.render({ name: ME, size: 'sm', showName: true })}${whoTail(x.at, x.kind === 'run' ? `${x.cmd} · ${x.result}` : `${x.label} · ${x.target}`)}</div>`);
    const p = S.plan, ask = p ? html`<div class="ai-blk ai-ub">${C.userBubble.render({ text: t('sim.app.plan.proposal', { label: p.label, target: p.target }), time: hm(p.at) })}</div>` : '';
    return log.length || ask ? html`${log.length ? html`<div class="ai-blk">${log}</div>` : ''}${ask}` : '';
  }
  /* the two choices of an approval (the choice itself decides: no second confirm) */
  const CHOICES = [{ id: 'allow', label: t('sim.app.ask.allow'), shortcut: 'mod+enter' }, { id: 'deny', label: t('sim.app.plan.deny'), shortcut: 'escape' }];
  /* a question waiting for a person sits outside the conversation, right above the composer: it never scrolls away; when room runs short only its detail scrolls */
  const pinned = q => q ? html`<div class="ai-pin">${q}</div>` : '';
  function planQuestion() {
    const p = S.plan; if (!p) return '';
    return C.questionPanel.render({ id: 'sim-plan', footer: false, question: t('sim.app.plan.question', { label: p.label }), detail: html`${p.mode === 'pr' ? C.codeBlock.render({ path: p.path ?? p.repo ?? '', text: p.diff ? [...p.diff.before.map(l => '-' + l), ...p.diff.after.map(l => '+' + l)].join('\n') : p.cmd, diff: !!p.diff }) : C.codeBlock.render({ lang: 'sh', text: p.cmd })}${C.propertyGrid.render({ items: [{ id: 't', label: t('sim.app.plan.target'), value: p.target }, ...(p.change ? [{ id: 'g', label: t('sim.app.plan.change'), value: p.change }] : []), { id: 'r', label: t('sim.app.plan.reach'), value: p.reach }, ...(p.checks ?? []).map((c, i) => ({ id: 'c' + i, label: i ? '' : t('sim.app.plan.check'), value: c }))] })}` /* a Git-managed object is changed by a Draft PR (the diff), never a kubectl line */, options: CHOICES, selected: 0 });
  }
  /* the AI pane's input: a simulation understands a few set intents (a report, a view change, why, a change request) and says what it can do otherwise */
  const SUGGEST = ['logs', 'events', 'range', 'why', 'restarts'].map(k => t('sim.ai.suggest.' + k));
  function ask(text0) {
    const raw = text0.trim(); if (!raw) return;
    const { text, n } = maskCount(raw);
    const s = sc(), say = (t, extra = {}) => S.chat.push({ at: S.t, who: 'ai', text: t, ...extra });
    S.chat = [...(S.chat ?? []), { at: S.t, who: 'user', text, masked: n }]; S.aiOpen = true; S.paneTab = 'ai';
    const pod = W().pods.find(p => p.scenario && p.status[0] !== 'ok') ?? W().pods.find(p => p.scenario), ns = s.quiet ? (S.ns !== 'all' ? S.ns : null) : s.ns;
    if (/보고서|리포트|정리해/.test(text)) { say(incidentOpen() ? t('sim.app.say.reportOpen') : t('sim.app.say.reportQuiet')); page.actions['rep.start']({ fromChat: true }); return; }
    /* an answer the model writes in Markdown (AI-2): a sentence, a table of the pods that restart most, a list and the command to look for oneself */
    if (/많은|목록|표로/.test(text)) {
      const top = W().pods.filter(p => p.restarts > 0 && (!ns || p.ns === ns)).sort((a, b) => b.restarts - a.restarts || a.name.localeCompare(b.name)).slice(0, 5);
      say(top.length ? [t('sim.app.say.restarts', { n: top.length }), '', `| Namespace | Pod | Restarts | ${t('sim.app.say.lastReason')} |`, '|---|---|--:|---|', ...top.map(p => `| ${p.ns} | \`${p.name}\` | ${p.restarts} | ${p.lastReason || '-'} |`), '',
        t('sim.app.say.restartsNext'), `- **${top[0].name}**: ${t('sim.app.say.restartsLogs')}`, `- ${t('sim.app.say.restartsEvents')}`, '', '```sh', `kubectl -n ${top[0].ns} describe pod ${top[0].name}`, '```'].join('\n') : t('sim.app.say.noRestarts'));
      ctx.update(); return; }
    if (/재시작|롤백|되돌려|되돌리|스케일|복제 수|drain|비워|축출|삭제|지워|실행해/.test(text)) {
      const wl = s.scope?.find(r => r.kind === 'Deployment' || r.kind === 'StatefulSet'), key = wl ? resKey(wl.name, wl.kind) : pod ? resKey(pod.name, 'Pod') : null, r = key && V.findResource(key);
      const want = /롤백|되돌/.test(text) ? 'rollback' : /스케일|복제/.test(text) ? 'scale' : /drain|비워/.test(text) ? 'drain' : /축출/.test(text) ? 'evict' : 'restart', x = r && actionsFor(r, W()).find(a => a.id === want);
      if (x) { say(t('sim.app.say.planOpened')); page.actions['sim.plan']({ arg: { key, id: want } }); }
      else say(t('sim.app.say.readOnly'));
      ctx.update(); return; }
    if (/왜|근거|이유/.test(text)) { if (s.quiet || !incidentOpen()) say(t('sim.app.say.noJudgement')); else { const ch = officialChain(); say(t('sim.app.say.why', { grade: P.grade(ch.grade).label, conclusion: ch.conclusion }), { refs: E.evidenceNow().filter(e => !e.blocked).map(e => e.id) }); } }
    else if (/로그/.test(text) && pod) { drive({ view: 'logs', set: { view: 'logs', logPod: `${pod.ns}/${pod.name}`, logPage: null, logLevel: 'ERROR' }, chips: [{ label: `Pod ${pod.name}`, keys: ['logPod'] }, { label: 'ERROR', keys: ['logLevel'] }] }); /* the lines that matter: the errors of that pod, not its latest INFO */ say(t('sim.app.say.logs', { pod: pod.name })); }
    else if (/이벤트/.test(text)) { drive({ view: 'events', set: { view: 'events', ...(ns ? { ns, nsMulti: [ns] } : {}), evType: 'Warning', evPage: 1 }, chips: [...(ns ? [{ label: `namespace ${ns}`, keys: ['ns', 'nsMulti'] }] : []), { label: t('sim.r.chip.type'), keys: ['evType'] }] }); say(t('sim.app.say.events')); }
    else if (/지난\s*(\d+)\s*(시간|분)/.test(text)) { const [, k, u] = /지난\s*(\d+)\s*(시간|분)/.exec(text), sec = Number(k) * (u === '시간' ? 3600 : 60), key = aiRangeKey(S.view) ?? 'evRange', view = aiRangeKey(S.view) ? S.view : 'events';
      drive({ view, set: { view, [key]: String(sec) }, chips: [{ label: t('sim.app.say.rangeLabel', { n: k, unit: u }), keys: [key] }] }); say(t('sim.app.say.range', { n: k, unit: u })); }
    else if (/(\S+?)\s*(을|를)?\s*열어/.test(text)) { const name = /(\S+?)\s*(을|를)?\s*열어/.exec(text)[1], key = resKey(name); if (key) { select({ type: 'resource', key }); say(t('sim.app.say.opened', { name })); } else say(t('sim.app.say.notFound', { name })); }
    else say(t('sim.app.say.help'), { suggest: true });
    ctx.update();
  }
  /* an answer's words are Markdown read as the app reads them (answer-text.js parse): text, the answer table and the code view */
  const answer = text => C.answerText.parse(text).map(x => x.type === 'table' ? C.messageTable.render(x) : x.type === 'code' ? C.codeBlock.render({ lang: x.lang, text: x.text }) : C.answerText.render({ blocks: x.blocks }));
  function chatTalk() {
    return (S.chat ?? []).map(m => m.who === 'user' ? html`<div class="ai-blk ai-ub">${C.userBubble.render({ text: m.text, time: hm(m.at) })}</div>`
      : html`<div class="ai-blk ai-msg">${answer(m.text)}${m.refs?.length ? html`<div class="ai-sel">${m.refs.map(id => C.button.render({ label: t('sim.app.say.ref', { id }), variant: 'secondary', size: 'sm', round: true, action: 'sim.ref', arg: id }))}</div>` : ''}${m.suggest ? html`<div class="ai-sel">${SUGGEST.map(q => C.button.render({ label: q, variant: 'ghost', size: 'sm', round: true, action: 'sim.ask', arg: q }))}</div>` : ''}</div>`);
  }
  const composer = () => html`<div class="ai-ask"><div class="ai-sel">${C.button.render({ label: t('sim.ai.report'), icon: 'file-text', variant: 'ghost', size: 'sm', round: true, action: 'sim.ask', arg: t('sim.ai.report') })}</div>${C.composer.render({ id: 'sim-ask', variant: 'panel', placeholder: t('sim.ai.placeholder') })}</div>`;
  /* the line under the composer, the same everywhere: permission · scope · model · reasoning effort */
  const aiFoot = () => { const s = sc(), ns = s.quiet ? (S.nsMulti?.length === 1 ? S.nsMulti[0] : t('sim.ai.allNs')) : s.ns;
    return html`<div class="ai-dst">${icon('lock', 'sm')}<span>${t('sim.ai.perm')}</span><span>${W().cluster.name} · ${ns}</span><span>${MODEL}</span><span>${t('sim.ai.effort')}</span></div>`; };
  function reportPane() {
    const r = S.report, left = r.queue.length;
    /* one quiet row: where the writing is, then the tools; the selection's actions take their place while something is selected */
    const status = r.streaming ? html`<span class="rp-st">${C.statusIcon.render({ kind: 'busy', text: t('sim.app.rep.writing', { n: left }) })}${C.button.render({ label: t('sim.app.rep.stop'), variant: 'link', action: 'rep.stop' })}</span>`
      : r.stopped && left ? html`<span class="rp-st">${C.statusIcon.render({ kind: 'idle', text: t('sim.app.rep.stoppedLeft', { n: left }) })}${C.button.render({ label: t('sim.app.rep.resume'), variant: 'link', action: 'rep.resume' })}</span>` : '';
    const tools = html`${status}${r.streaming ? '' : C.button.render({ label: t('sim.app.rep.regen'), icon: 'arrow-rotate-clockwise', variant: 'ghost', size: 'sm', round: true, action: 'rep.regen' })}${C.button.render({ label: t('sim.app.rep.export'), icon: 'download', variant: 'ghost', size: 'sm', round: true, menu: 'rep.export' })}`;
    const bar = C.reportCanvas.toolbar({ report: REP.state, canUndo: REP.canUndo, action: 'rep.canvas', tools, end: C.iconButton.render({ icon: 'cross-medium', tip: t('sim.app.rep.close'), size: 'sm', action: 'rep.close' }) });
    return html`<section class="sim-detail sim-report">${headRow('detail', bar)}
      ${C.reportCanvas.render({ id: 'sim-rep', report: REP.state, canUndo: REP.canUndo, action: 'rep.canvas', head: r.head, bar: false, zone: 'Asia/Seoul' })}</section>`;
  }
  function reportTalk() {
    const r = S.report;
    if (!r) return '';
    const steps = r.log.map(x => C.stepRow.render({ state: 'done', text: x.say }));
    if (r.streaming && r.queue.length) steps.push(C.stepRow.render({ state: 'run', text: r.queue[0].say, live: true }));
    if (r.stopped && !r.streaming) steps.push(C.stepRow.render({ state: 'off', text: t('sim.app.rep.stopped', { why: r.stopped }) }));
    const follows = r.follows.map(f => html`<div class="ai-blk ai-ub">${C.userBubble.render({ text: t('sim.app.rep.addSelected'), time: hm(f.at) })}<div class="ai-sel">${C.contextChip.render({ icon: 'file-text', title: t('sim.app.rep.selected', { n: f.items.length }), sub: f.items.map(x => x.label).join(' · ') })}</div></div>`);
    return html`${r.fromChat ? '' : html`<div class="ai-blk ai-ub">${C.userBubble.render({ text: t('sim.ai.report'), time: hm(r.asked) })}</div>`}<div class="ai-blk ai-skill"><div class="ai-l">${t('sim.app.rep.work')}</div>${C.stepGroup.render({ id: 'sim-rep', working: r.streaming, seconds: Math.max(1, r.log.length), open: S.repStepsOpen ?? r.streaming, steps, /* the work shows while it runs; once written it folds to its one line */ current: r.streaming ? steps.at(-1) : '' })}${!r.open ? C.button.render({ label: t('sim.app.rep.open'), icon: 'file-text', variant: 'link', action: 'rep.open' }) : ''}</div>${follows}`;
  }
  /* a scope set from elsewhere (a flow band, a home count, the AI): the box shows the text that now runs on the view in sight, unless the person is typing in it */
  const syncScope = () => setTimeout(() => { const ta = document.querySelector(`.cmp[data-id="sim-scope.${S.view}"] [data-composer-input]`), v = S[scopeKey(S.view)] ?? ''; if (ta && ta !== document.activeElement && ta.value !== v) { ta.value = v; ta.dispatchEvent(new Event('input', { bubbles: true })); } }, 0);
  const scopeText = q => { S[scopeKey(S.view)] = String(q); syncScope(); }; /* the text of the view in sight: each view keeps its own */
  const scopeNs = ns => { S.ns = ns; S.nsMulti = [ns]; };
  /** a multi-select picker's choice after one row or the all row: null when every one is on, the list in its order otherwise (empty: none on, read as every one) */
  const toggled = (a, all, now) => { const arg = a.arg?.value !== undefined || a.arg?.values ? a.arg : a, cur = new Set(now ?? all);
    if (Array.isArray(arg.values)) { cur.clear(); for (const v of arg.values) cur.add(v); } else { const v = String(arg.value ?? arg); cur.has(v) ? cur.delete(v) : cur.add(v); }
    return cur.size === all.length ? null : all.filter(x => cur.has(x)); };
  const resKey = (name, kind) => { const w = W(), all = [...w.pods, ...w.workloads, ...w.apps, ...w.nodes], x = (kind && all.find(y => y.name === name && y.kind === kind)) ?? all.find(y => y.name === name); return x ? `${x.ns || '_'}/${x.kind}/${x.name}` : null; };

  /* ---------- 공통 조각 ---------- */
  const stageState = id => {
    const ph = phase(), order = ['scoping', 'investigating', 'judged', 'merge-wait', 'handoff', 'applying', 'verifying', 'failed', 'resolved'], at = order.indexOf({ 'pr-failed': 'merge-wait', inconclusive: 'verifying' }[ph] ?? ph);
    const rule = { scope: [0, 1], time: [1, 1], cause: [1, 2], act: [2, 6], verify: [6, 8], record: [8, 99] }[id];
    if (ph === 'failed') return { scope: 'done', time: 'done', cause: 'done', act: 'active', verify: 'done', record: 'future' }[id];
    return at < rule[0] ? 'future' : at < rule[1] ? 'active' : 'done';
  };
  const elapsed = () => (phase() === 'resolved' ? S.resolvedAt : S.t);
  /* the AI pane says which of the sources it reads cannot be read now: what it wrote earlier stays, what it would read again is missing */
  const aiSources = () => { const bad = W().tools.filter(x => ['prometheus', 'loki', 'argocd', 'github'].includes(x.id) && down(x.id)); return bad.length ? html`<div class="v-stale">${C.statusIcon.render({ kind: 'warn', text: t('sim.app.ai.sourcesDown', { sources: bad.map(x => `${x.name} ${STATE_WORD[x.state]}`).join(' · ') }) })}${C.button.render({ label: t('sim.view.tools'), variant: 'link', action: 'sim.go', arg: { page: 'tools', tool: bad[0].id } })}</div>` : ''; };
  const HIST_WORD = Object.fromEntries(['ack', 'ready', 'review', 'request', 'external', 'observed', 'manual', 'prcreate', 'sync', 'rollout', 'merge', 'prfail', 'prretry', 'approve', 'done', 'fail', 'resolve', 'inconclusive', 'reverify'].map(k => [k, t('sim.hist.' + k)]));
  const statusWord = Object.fromEntries(['scoping', 'investigating', 'judged', 'merge-wait', 'pr-failed', 'handoff', 'applying', 'verifying', 'inconclusive', 'failed', 'resolved', 'idle'].map(k => [k, t('sim.phase.' + k)]));
  const toggleOpen = id => ({ action: 'sim.stage', arg: id });
  const open = id => S.open[id];
  /* a stage is a section under the status line only once it exists: none is drawn ahead of time, each comes in when its stage starts */
  const section = p => p.state === 'future' && p.id !== 'record' ? null : { id: p.id, label: p.title, items: p.items || [], open: p.open ?? (p.state === 'active' || (p.id === 'cause' && S.approvedAt == null)), body: p.body };

  const paneOpen = () => !!(S.sel || S.aiOpen || S.report?.open); /* a detail, the AI pane or the report beside the body */

  /* ---------- 사이드바: 클러스터 · 탐색 · 대화와 인시던트 · 설정 ---------- */
  function sidebar() {
    const s = sc(), ph = phase(), w = W(), kind = incidentKind();
    const row = (lead, text, meta, active, action, arg) => html`<button class="sb-r"${active ? html` data-active` : ''} data-action="${action}" data-arg="${JSON.stringify(arg ?? null)}">${lead}<span class="sb-t" title="${text}">${text}</span>${meta ? html`<span class="sb-m">${meta}</span>` : ''}</button>`;
    const firing = alertsOf(st.sid, S.t, ph, S.cid).filter(a => a.state === 'firing').length;
    const go = (view, ic, meta) => row(icon(ic, 'sm'), t('sim.view.' + view), meta, S.view === view, 'sim.go', { page: view });
    const appBad = w.apps.filter(a => !a.status[1].startsWith('Synced · Healthy')).length;
    return html`<aside class="sim-side">
      <div class="sb-h">${icon('wake-mark', 'sm')}<b>Wake</b></div>
      <div class="sb-l">${t('sim.side.clusters')}</div>${CLUSTERS.map(c => row(C.statusIcon.render({ kind: c.agent === 'error' ? 'error' : c.id === 'wake-prod' && incidentOpen() && ph !== 'resolved' ? 'warn' : 'ok' }), c.name, c.env, S.cid === c.id, 'sim.cluster', c.id))}
      <div class="sb-l">${w.cluster.name}</div>${go('home', 'k8s-cluster')}${go('resources', 'k8s-deployment', w.pods.length.toLocaleString())}${go('network', 'k8s-service')}${go('gitops', 'branch', appBad ? t('sim.side.problems', { n: appBad }) : '')}${go('events', 'k8s-event')}${go('logs', 'terminal')}${go('alerts', 'bell', firing ? `firing ${firing}` : '')}${go('incidents', 'incident', incidentOpen() && ph !== 'resolved' ? t('sim.side.open', { n: 1 }) : '')}${go('ailog', 'ai')}
      <div class="sb-l">${t('sim.side.recent')}</div>
      ${incidentOpen() ? row(C.statusIcon.render({ kind, attention: ph !== 'resolved' && !S.seen }), s.title, s.repeat ? '×' + s.repeat : t('sim.side.now'), S.view === 'incident', 'sim.go', { page: 'incident' }) : ''}
      ${pastOf(S.cid).slice(0, 4).map(p => row(C.statusIcon.render({ kind: p.outcome === 'recovered' ? 'ok' : 'warn' }), p.title, p.when, false, 'sim.past', p.id))}
      <div class="sb-l">${t('sim.side.settings')}</div>${go('tools', 'plug', w.tools.some(x => x.state === 'error') ? t('sim.side.toolsDown') : '')}${go('agent', 'wake-agent', w.agent.state === 'ok' ? '' : t('sim.side.agentDown'))}${go('data', 'shield-check', '')}${row(icon('circle-question', 'sm'), t('sim.side.help'), '?', false, 'sim.help', null)}
    </aside>`;
  }
  /* the page head: where you are, and the cluster's views as tabs */
  function topbar() {
    const w = W(), tabs = ['home', 'resources', 'network', 'gitops', 'events', 'logs', 'alerts', 'incidents'].map(id => [id, t('sim.view.' + id)]);
    const inTabs = tabs.some(([id]) => id === S.view), label = S.view === 'home' ? '' : S.view === 'metric' ? html`${C.button.render({ label: t('sim.view.home'), variant: 'link', action: 'sim.go', arg: { page: 'home' } })}<span>›</span><span>${t('sim.crumb.metric')}</span>` : { tools: t('sim.crumb.tools'), agent: t('sim.crumb.agent'), data: t('sim.crumb.data'), search: t('sim.crumb.search') }[S.view] ?? t('sim.view.' + S.view);
    return html`<div class="sim-top"${paneOpen() ? '' : html` data-notice-below`}><span class="sim-crumb">${icon('k8s-cluster', 'sm')}<b>${w.cluster.name}</b>${label ? html`<span>›</span>${typeof label === 'string' ? html`<span>${label}</span>` : label}` : ''}</span>${inTabs ? html`<div class="sim-nav" data-scroll="x">${C.pillTabs.render({ id: 'sim-nav', label: t('sim.nav.label'), value: S.view, tabs: tabs.map(([id, l]) => ({ id, label: l })), action: 'sim.nav' })}</div>` : ''}</div>`; /* a narrow body scrolls its section pills sideways instead of running past its edge */
  }
  function main() {
    const v = S.view;
    if (v === 'incident' && incidentOpen()) return workspace();
    const body = v === 'search' ? V.searchPage() : v === 'metric' ? V.metricPage() : v === 'gitops' ? V.gitopsPage() : v === 'network' ? V.networkPage() : v === 'ailog' ? V.aiLogPage() : v === 'resources' ? V.resources() : v === 'events' ? V.eventsPage() : v === 'logs' ? V.logsPage() : v === 'alerts' ? V.alertsPage() : v === 'incidents' ? V.incidentsPage() : v === 'tools' ? V.toolsPage() : v === 'agent' ? V.agentPage() : v === 'data' ? SET.page() : V.home();
    const dv = S.aiDrive && S.aiDrive.view === v ? S.aiDrive : null, flash = dv && Date.now() - dv.flash < 2500;
    /* what the AI set on this view: one quiet row of removable filter chips, and the incident it came from */
    const banner = dv?.chips.length ? html`<div class="rp-state"><span class="ai-l">${t('sim.app.drive.lead')}</span>${dv.chips.map((c, i) => C.button.render({ label: c.label, iconEnd: 'cross-small', variant: 'secondary', size: 'sm', round: true, action: 'rep.driveDrop', arg: i }))}${incidentOpen() ? html`<span class="rp-state-end">${C.button.render({ label: alertText(st.sid)?.incident ?? '', icon: 'arrow-up-right', variant: 'link', action: 'sim.go', arg: { page: 'incident', keep: true } })}</span>` : ''}</div>` : '';
    return html`<section class="sim-body"${flash ? ' data-ai-step' : ''}>${topbar()}${banner}${body}</section>`;
  }

  /* ---------- 인시던트 ---------- */
  function header() {
    const s = sc();
    /* what must stay in sight whatever panes are open, as the status update writes it: the target, the user impact, who is on call, when the next update is due, the chosen change */
    const o = optOf(), tgt = s.approval.target, ph = phase(); /* the incident's own target stays; an action on another object names that object in the action item */
    const ui = userImpactOf(st.sid, S.t, S.resolvedAt ?? S.t, E.fixAt())[0], impact = ui ? `${ui.label} ${ui.value}` : ''; /* the first user impact the status update leads with (world userImpactOf: one source) */
    const every = (alertText(st.sid)?.severity ?? s.severity) === 'critical' ? 30 : 60; /* the update cadence the status update promises: critical 30 minutes, the rest 60 */
    const item = (label, value) => html`<span><em>${label}</em>${value}</span>`;
    const focus = html`<div class="ws-focus">${item(t('sim.app.head.target'), tgt.slice(1).join(' · '))}${impact ? item(t('sim.app.head.impact'), impact) : ''}${item(t('sim.app.head.oncall'), C.avatar.render({ name: ME, size: 'sm', showName: true }))}${ph === 'resolved' ? '' : item(t('sim.app.head.nextUpdate'), hm(S.t + every * 60))}${o ? item(t('sim.app.head.action'), o.target && o.target.join('/') !== tgt.join('/') ? `${o.title} · ${o.target.slice(1).join(' · ')}` : o.title) : ''}</div>`;
    return html`${V.stale()}${focus}<div class="ws-head"><div class="ws-m">${V.status(s.severity === 'critical' ? 'error' : 'warn', s.severity)}${s.repeat ? html`<span>${t('sim.app.head.repeat', { n: s.repeat })}</span>` : ''}<span>${s.cluster} · ${s.ns}</span><span>${t('sim.app.head.detected', { date: ymd(0), time: hms(0) })}</span></div><div class="ws-m">${V.connChips(['prometheus', 'loki', 'argocd', 'github', ...(sc().extraTools ?? [])])}</div>
      <div class="ws-a">${V.findBox()}<span class="ws-acts">${S.aiOpen ? '' : C.button.render({ label: t('sim.app.head.askAi'), icon: 'ai', variant: 'ghost', size: 'sm', round: true, action: 'sim.openAi' })}${C.button.render({ label: t('sim.app.head.export'), icon: 'download', variant: 'ghost', size: 'sm', round: true, menu: 'sim.export' })}${C.button.render({ label: t('sim.app.head.copyLink'), icon: 'copy', variant: 'ghost', size: 'sm', round: true, action: 'sim.copyLink' })}</span></div></div>`;
  }
  const kindRow = r => ({ ...r, id: r.name });
  /* after recovery is confirmed the problem rows read as recovered (the pod that failed was replaced by the fix) */
  /* after the fix the rows read as now: the failed pod is replaced by a new one (new name, no restarts, born at the rollout), the workload on its new revision */
  const fixedRow = (r, verifying, failed = false) => r.kind === 'Pod' && (r.status[0] === 'error' || sc().rollsBack) && /-[a-z0-9]{4,5}-[a-z0-9]{4,5}$/.test(r.name) ? { ...r, name: replacementName(r.name), status: failed && r.status[0] === 'error' ? ['error', `CrashLoopBackOff · ${failWord()}`] : verifying ? ['busy', t('sim.app.scope.checking', { status: 'Running' })] : ['ok', 'Running'], restarts: failed && r.status[0] === 'error' ? 1 : 0, change: t('sim.app.scope.created', { time: hm(S.verifyFrom ?? S.t), name: r.name }) }
    : r.status[0] === 'error' || r.status[0] === 'warn' ? { ...r, status: verifying ? ['busy', t('sim.app.scope.checking', { status: r.kind === 'Pod' ? 'Running' : 'Progressing' })] : ['ok', r.kind === 'Pod' ? 'Running' : 'Available'], restarts: r.restarts != null ? 0 : null, change: modeOf(optOf()) === 'pr' && r.kind !== 'Pod' ? (() => { const wl = W().workloads.find(x => x.name === r.name && x.kind === r.kind); return wl?.rev ? (/되돌리기/.test(optOf()?.title ?? '') ? t('sim.app.scope.revTemplate', { rev: wl.rev, time: hm(S.verifyFrom ?? S.t), old: wl.rev - 2 }) : `rev ${wl.rev} · ${hm(S.verifyFrom ?? S.t)}`) : t('sim.app.scope.newRev', { time: hm(S.verifyFrom ?? S.t) }); })() : r.change } : r;
  const scopeRows = () => ['verifying', 'inconclusive', 'resolved'].includes(phase()) ? sc().scope.map(r => fixedRow(r, phase() === 'verifying')) : phase() === 'failed' && S.history.some(h => h.kind === 'rollout') ? sc().scope.map(r => r.kind === 'Pod' ? fixedRow(r, false, true) : r) : sc().scope; /* after an applied change the rows are the pods that run now (a failed check keeps the failure on the new pod) */
  /* a stage's closed head leads with what matters: the problem object and its state (or, once fixed, the object that runs now), then the counts; a zero is not shown */
  const shortState = r => r.status[1].split(' · ').pop();
  function scopeHead(rows, bad, warn) {
    const lead = rows.find(r => r.status[0] === 'error') ?? rows.find(r => r.status[0] === 'warn') ?? rows.find(r => r.kind === 'Pod') ?? rows[0];
    return [...(lead ? [{ id: 'p', label: lead.kind, value: html`<span class="wsc-t">${V.statusCell([lead.status[0], shortState(lead)])}<span>${lead.name}</span></span>`, shrink: true, priority: 3 }] : []), /* the state first, then the name, which gives way */
      ...(bad ? [{ id: 'f', label: t('sim.app.scope.fail'), value: String(bad), tone: 'danger', priority: 1 }] : []), ...(warn ? [{ id: 'w', label: t('sim.app.scope.warn'), value: String(warn), tone: 'warn', priority: 1 }] : [])];
  }
  function scopeCard() {
    const s = sc(), rows = scopeRows().map(kindRow), bad = rows.filter(r => r.status[0] === 'error').length, warn = rows.filter(r => r.status[0] === 'warn').length;
    const table = C.dataTable.render({ clip: true, gridLines: true, rowKey: 'id', rows, activeKey: S.hint ? rows[S.row]?.id : S.sel?.type === 'resource' ? rows.find(r => resKey(r.name, r.kind) === S.sel.key)?.id : null, rowAction: 'sim.row', /* the row the keys stand on is the one marked */ columns: [
      { id: 'name', label: t('sim.app.scope.name'), lead: r => ({ icon: r.icon }) }, { id: 'status', label: t('sim.app.scope.status'), fit: true, cell: r => V.statusCell(r.status) },
      { id: 'restarts', label: t('sim.app.scope.restarts'), value: true, width: 'calc(var(--space-16) + var(--space-2))', cell: r => r.restarts ?? '' }, { id: 'change', label: t('sim.app.scope.change'), muted: true, optional: true, width: 'calc(var(--space-16) * 2)' }], reveal: true });
    return section({ id: 'scope', n: 1, title: t('sim.stage.scope'), state: stageState('scope'), hint: S.hint, toggle: toggleOpen('scope'), open: open('scope'),
      items: scopeHead(rows, bad, warn), body: html`${table}${s.reqFlow ? html`<div class="ws-flow"><span class="ws-note">${t('sim.app.scope.reqFlow')}</span>${V.reqFlow()}</div>` : ''}` });
  }
  /* what was applied during the incident is a change like any other: each rollout or sync lands on the deploy lane when it happens */
  const allChanges = () => [...changesOf(st.sid, S.cid), ...liveChanges()];
  const liveChanges = () => S.history.filter(h => h.kind === 'rollout' || h.kind === 'sync').map((h, i) => ({ id: 'live-' + i, lane: 'deploy', at: h.at, tone: 'run', kind: h.kind === 'sync' ? t('sim.hist.sync') : t('sim.hist.rollout'), title: targetOf(optOf())[2] ?? '', text: h.text }));
  function timeCard() {
    const chs = [...sc().changes, ...liveChanges()];
    const s = sc(), minAt = Math.min(...s.changes.map(c => c.at)), from = T0 + minAt - Math.max(120, Math.round((Math.max(60, S.t) - minAt) * .06)), to = T0 + Math.max(60, S.t); /* the window starts just before the first change: no empty stretch on the left */
    const lead = [...chs].sort((a, b) => b.at - a.at).find(c => c.lane === 'deploy' || c.lane === 'config' || c.lane === 'infra'); /* the latest change, applied ones included */
    const win0 = S.tlWin?.inc; /* a window the person zoomed or moved stays until they reset it: a redraw never puts it back */
    const tl = C.changeTimeline.render({ label: t('sim.app.time.changes'), from: win0?.from ?? from, to: win0?.to ?? to, now: T0 + S.t, selected: S.selChange ?? null, selectAction: 'sim.change', zoomAction: 'sim.tlWin.inc',
      lanes: CHANGE_LANES.map(l => ({ id: l.id, label: t('sim.lane.' + l.id), icon: l.icon })), marks: chs.map(c => ({ id: c.id, lane: c.lane, at: T0 + c.at, ...(c.end != null ? { end: T0 + Math.min(c.end, S.t) } : {}), tone: c.tone, tip: { time: hm(c.at), kind: c.kind, title: c.title, text: c.text } })), timeZone: 'Asia/Seoul', home: { from, to } });
    return section({ id: 'time', n: 2, title: t('sim.stage.time'), state: stageState('time'), hint: S.hint, toggle: toggleOpen('time'), open: open('time'),
      items: lead ? [{ id: 'l', label: t('sim.app.time.last'), value: `${lead.kind} ${when(lead.at)}` }] : [], body: tl });
  }
  const officialChain = () => {
    const s = sc();
    if (S.adoptedAlt && s.aiAlt) return { ...s.aiAlt, source: { ...s.aiAlt.source, adoptedBy: ME }, previous: [E.chainNow().conclusion] };
    const c = E.chainNow();
    return { ...c, grade: causeStatus(c, s.rule) === 'supported' ? 'supported' : c.grade, previous: S.failedOnce ? [t('sim.app.cause.previous', { fail: failWord() })] : [] };
  };
  function causeCard() {
    const s = sc(), ph = phase();
    const running = ph === 'investigating' || ph === 'scoping', ch = officialChain();
    const memory = s.memory ? html`<div class="ws-mem">${C.button.render({ label: t('sim.app.cause.past'), icon: 'arrow-up-right', variant: 'link', action: 'sim.memory' })}</div>` : ''; /* the repeat itself is an observation of the chain: here only the way to the past incidents */
    /* evidence read before its source went down is still the evidence of then: the cause says which of it is old */
    const stale = E.evidenceNow().filter(e => !e.blocked && freshness(W(), V.evidenceSource(e))?.stale), srcs = [...new Set(stale.map(e => { const f = freshness(W(), V.evidenceSource(e)); return `${f.name} ${STATE_WORD[f.state] ?? ''}`.trim(); }))];
    const before = stale.length ? html`<div class="ws-mem ws-before">${C.statusIcon.render({ kind: 'idle', icon: 'clock', text: t('sim.app.cause.before', { refs: stale.map(e => t('sim.p.ref', { id: e.id })).join(' · '), src: srcs.join(' · '), at: hms(Math.max(...stale.map(e => e.to ?? e.at ?? 0))) }) })}</div>` : '';
    const rule = html`<div class="ws-rule">${C.statusIcon.render({ kind: 'idle', icon: 'shield-check', text: t('sim.app.cause.rule', { name: s.rule.name, version: s.rule.version }) })}</div>`;
    const toAi = label => S.aiOpen ? '' : C.button.render({ label, icon: 'arrow-up-right', variant: 'link', action: 'sim.openAi' });
    const alt = !running && s.aiAlt && !S.adoptedAlt ? html`<div class="ws-mem">${C.statusIcon.render({ kind: 'warn', icon: 'sparkles-two-2', text: t('sim.app.cause.aiOpinion') })}${toAi(t('sim.app.cause.aiChat'))}</div>` : '';
    const body = running ? html`<div class="ws-mem">${C.statusIcon.render({ kind: 'busy', text: t('sim.app.cause.skillRunning', { id: s.skill.id, version: s.skill.version }) })}${toAi(t('sim.app.cause.aiChat'))}</div>${memory}`
      : html`${before}${P.reasoningChain({ conclusion: ch.conclusion, grade: ch.grade, source: ch.source, cells: ch.cells, refAction: 'sim.ref', previous: ch.previous })}${rule}${alt}${memory}`;
    return section({ id: 'cause', n: 3, title: t('sim.stage.cause'), state: stageState('cause'), hint: S.hint, toggle: toggleOpen('cause'), open: open('cause'),
      items: running ? [] : [{ id: 'g', label: P.grade(ch.grade).label, value: ch.conclusion, shrink: true, priority: 3 }], body });
  }
  function actCard() {
    const s = sc(), ph = phase(), opt = ph === 'failed' ? null : s.options.find(o => o.id === S.chosen);
    const opts = optionsNow();
    let body;
    if (S.approvedAt == null || ph === 'failed') body = html`${ph === 'failed' ? html`<span class="ws-note">${t('sim.app.act.failedNote', { title: optOf()?.title ?? t('sim.app.act.chosen') })}</span>` : ''}${P.actionCompare({ options: opts, action: 'sim.choose' })}${S.approvalDenied ? html`<span class="ws-note">${t('sim.app.act.denied')}</span>` : ''}`;
    else {
      /* each step leads with its state; its right side says what it did, and while it runs, the live line of what is going on */
      const syncAt = S.mergedAt == null ? null : S.t - S.mergedAt, rollAt = syncAt == null ? null : syncAt - s.applyTimes.sync;
      /* the chosen action drives its own steps: a PR goes Draft PR → merge → Argo CD sync → rollout; a manual action is the request copied,
         the person's action, then the effect read back. A step whose source is down stops there and says why instead of completing */
      const mode = modeOf(opt), argoBad = down('argocd'), ag = agentDown(), held = ag ? t('sim.app.act.heldAgent') : argoBad ? t('sim.app.act.heldArgo', { detail: tool('argocd')?.detail ?? t('sim.app.act.noPerm') }) : '';
      const target = s.scope.find(r => r.kind !== 'Pod') ?? s.scope[0], wl = W().workloads.find(x => x.name === target?.name && x.kind === target?.kind), pods = wl?.replicas ?? (s.scope.filter(r => r.kind === 'Pod').length || 1);
      const steps = mode !== 'pr'
        ? [[t('sim.app.act.copyReq'), 'done', t('sim.app.act.copied', { time: hm(S.approvedAt), to: opt.to ?? t('sim.app.act.team') })], [t('sim.app.act.manual'), S.doneAt != null ? 'done' : 'run', S.doneAt != null ? t('sim.app.act.doneMark', { time: hm(S.doneAt), who: ME }) : t('sim.app.act.waitTo', { to: opt.to ?? t('sim.app.act.team') }), S.doneAt == null], [t('sim.app.act.applyCheck'), S.verifyFrom != null ? 'done' : S.doneAt != null ? (held ? 'blocked' : 'run') : 'wait', S.verifyFrom != null ? hm(S.verifyFrom) : S.doneAt != null ? (held || t('sim.app.act.readingPods')) : '', S.doneAt != null && S.verifyFrom == null && !held]]
        : S.prFailed
          ? [[`Draft PR`, 'fail', t('sim.app.act.prFailed', { why: S.prFailed })], [t('sim.app.act.merge'), 'wait', down('github') ? t('sim.app.act.retryAfter') : t('sim.app.act.retryNow')], [t('sim.app.act.sync'), 'wait', ''], [t('sim.app.act.rollout'), 'wait', '']]
          : [[S.prCreatedAt == null ? `Draft PR` : `Draft PR #${S.prId}`, S.prCreatedAt == null ? 'run' : 'done', S.prCreatedAt == null ? t('sim.app.act.prMaking') : t('sim.app.act.prCreated', { time: hm(S.prCreatedAt), diff: opt.diff ? `+${opt.diff.after.length} −${opt.diff.before.length}` : '' })], [t('sim.app.act.merge'), S.mergedAt != null ? 'done' : 'run', S.mergedAt != null ? `${hm(S.mergedAt)} · ${ME}` : t('sim.app.act.review'), false],
            [t('sim.app.act.sync'), syncAt == null ? 'wait' : held && syncAt < s.applyTimes.sync ? 'blocked' : syncAt < s.applyTimes.sync ? 'run' : 'done', syncAt == null ? t('sim.app.act.syncMax') : held && syncAt < s.applyTimes.sync ? held : syncAt < s.applyTimes.sync ? t('sim.app.act.syncing', { dur: dur(syncAt) }) : `Synced · ${dur(s.applyTimes.sync)}`, syncAt != null && syncAt < s.applyTimes.sync && !held],
            [t('sim.app.act.rollout'), rollAt == null || rollAt < 0 ? 'wait' : held && S.verifyFrom == null ? 'blocked' : S.verifyFrom == null ? 'run' : 'done', rollAt == null || rollAt < 0 ? '' : held && S.verifyFrom == null ? held : S.verifyFrom == null ? t('sim.app.act.ready', { n: Math.min(pods, 1 + Math.floor(rollAt / (s.applyTimes.rollout / pods))), pods }) : t('sim.app.act.readyDone', { pods }), rollAt != null && rollAt >= 0 && S.verifyFrom == null && !held]];
      body = html`<div class="ws-steps">${steps.map(([text, state, meta, live]) => C.stepRow.render({ state, text, meta, live }))}</div>`;
    }
    return section({ id: 'act', n: 4, title: t('sim.stage.act'), state: stageState('act'), hint: S.hint, toggle: toggleOpen('act'), open: open('act'),
      items: opt ? [{ id: 'o', label: t('sim.app.act.selected'), value: opt.title }] : [{ id: 'n', label: t('sim.app.act.candidates'), value: `${s.options.length}` }], body });
  }
  /* each condition names its source and its last good collection; a condition whose source is down cannot be judged, and the stable time stops */
  const SOURCE = { gitops: ['Argo CD', () => down('argocd')], db: ['postgres-exporter', () => true], oom: ['Kubernetes API', () => agentDown()], ready: ['Kubernetes API', () => agentDown()], trigger: ['Kubernetes API', () => agentDown()], log: ['Loki', () => down('loki')], slo: ['Prometheus', () => down('prometheus')] };
  /* the recovery conditions as the check reads them now (the card and the report read the same list) */
  function verifyConditions() {
    const s = sc(), w = windows(), ph = phase(), now = S.t - (S.verifyFrom ?? S.t);
    const lastOk = w.lastIndexOf('ok'), lastAt = lastOk >= 0 ? S.verifyFrom + lastOk * CADENCE : null;
    const state = c => {
      if (c.unjudged) return 'unjudged'; /* a condition Wake cannot judge says so, with its reason, and never passes */
      const [, isDown] = SOURCE[c.metric] ?? ['', () => false];
      if (ph === 'failed') return c.id === 'v1' ? 'fail' : 'pass';
      if (ph === 'resolved') return 'pass';
      if (isDown()) return 'unknown';
      if (c.metric === 'trigger') return now >= 150 ? 'pass' : 'watch';
      if (c.metric === 'slo' && now < 60) return 'unknown';
      return now >= NEED ? 'pass' : 'watch';
    };
    const value = c => { const [src, isDown] = SOURCE[c.metric] ?? ['Kubernetes API', () => false];
      const base = c.value || (c.metric === 'trigger' ? (now >= 150 ? t('sim.app.verify.ranAt', { time: hm(S.verifyFrom + 150) }) : t('sim.app.verify.notRun')) : '');
      /* a source that is up was read in the latest window; one that is down keeps the time of its last good window */
      const curAt = S.verifyFrom != null ? S.verifyFrom + Math.floor(Math.max(0, (ph === 'resolved' ? S.resolvedAt : S.t) - S.verifyFrom) / CADENCE) * CADENCE : null;
      return isDown() && ph !== 'resolved' ? t('sim.app.verify.srcDown', { src, at: lastAt != null ? hms(lastAt) : t('sim.app.verify.never') }) : [src, base, curAt != null ? t('sim.app.verify.collected', { time: hms(curAt) }) : ''].filter(Boolean).join(' · '); };
    return [...s.verify, ...(optOf()?.verifyExtra ?? [])].map(c => ({ id: c.id, optional: !!c.optional, label: c.optional ? t('sim.app.verify.optional', { label: c.label }) : c.label, state: c.metric === 'db' && ph === 'resolved' ? 'unknown' : state(c), value: c.unjudged ? c.unjudged.replace(/^판정 안 함 · /, '') : c.metric === 'db' ? t('sim.app.verify.dbNone') : value(c) }));
  }
  /* how long the check has seen it normal (stops while a source is down) */
  const stableNow = () => phase() === 'resolved' ? NEED : Math.max(0, Math.min(S.t - (S.verifyFrom ?? S.t) - S.downWins.length * CADENCE, NEED));
  /* the check's closed head: the measured value against its threshold first, how long it has been normal and what is left to pass, then the result */
  function verifyHead() {
    const ph = phase(), s = sc(), c = verifyConditions(), main = s.verify.find(v => v.value) ?? null, mainNow = main && c.find(x => x.id === main.id);
    const value = main ? [{ id: 'v', label: s.impact?.label ?? main.label, value: main.value, shrink: true, priority: 3, ...(mainNow?.state === 'fail' ? { tone: 'danger' } : {}) }] : [];
    if (ph === 'failed') return [{ id: 'r', label: t('sim.app.verify.result'), value: html`<span class="wsc-t">${V.statusCell(['error', failWord()])}</span>`, priority: 4 }, ...value];
    if (ph === 'resolved') return [...value, { id: 's', label: t('sim.p.vc.stable'), value: dur(NEED), priority: 2 }, { id: 'a', label: t('sim.app.verify.resolved'), value: hm(S.resolvedAt), priority: 1 }];
    if (ph === 'inconclusive') return [{ id: 'r', label: t('sim.app.verify.result'), value: t('sim.app.verify.inconclusive'), tone: 'warn', priority: 4 }, { id: 'w', label: t('sim.app.verify.missing'), value: dur(S.downWins.length * CADENCE), priority: 2 }, ...value];
    if (ph === 'verifying' && verifyBlind()) return [{ id: 'w', label: t('sim.app.verify.held'), value: html`<span class="wsc-t">${V.statusCell(['error', t('sim.app.verify.down', { src: blindWhy() })])}</span>`, priority: 4 }, ...value];
    if (ph === 'verifying') return [...value, { id: 's', label: t('sim.p.vc.stable'), value: dur(stableNow()), priority: 2 }, { id: 'p', label: t('sim.p.vc.toPass'), value: dur(NEED - stableNow()), priority: 1 }];
    return [];
  }
  function verifyCardFor() {
    const w = windows();
    return P.verifyCard({ minWindows: MIN_WINDOWS, windows: w.length ? w : Array(MAX / CADENCE).fill('none'),
      conditions: verifyConditions() });
  }

  function verifyCard() {
    const ph = phase(), s = sc();
    return section({ id: 'verify', n: 5, title: t('sim.stage.verify'), state: stageState('verify'), hint: S.hint, toggle: toggleOpen('verify'), open: open('verify'),
      items: verifyHead(), body: verifyCardFor() });
  }
  /* the record writes itself: who did what, when, and with which permission, from detection to resolution (no hand-written notes) */
  function auditTrail() {
    const s = sc(), a = alertText(st.sid), ns = s.ns, tg0 = targetOf(optOf()), repo = `acme/${(tg0[2]?.split(' ')[1] ?? ns).split('-')[0]}-deploy`, prUrl = n => `https://github.com/${repo}/pull/${n}`; /* the repository of the object the action changes */
    const rows = [], sys = (name, icon) => ({ name, icon }), me = { name: ME, user: true };
    if (S.t >= 0) rows.push({ at: 0, actor: sys('Alertmanager', 'bell'), action: `${s.alert} firing · ${a?.severity ?? s.severity}`, perm: t('sim.app.audit.rulePerm', { alert: s.alert, ns }) });
    if (S.t >= skillAt()) rows.push({ at: skillAt(), actor: sys('Wake AI', 'ai'), action: t('sim.app.audit.investigate', { id: s.skill.id, version: s.skill.version, n: E.evidenceNow().length }), perm: t('sim.app.audit.agentRead') });
    if (S.t >= judgedAt()) rows.push({ at: judgedAt(), actor: sys(t('sim.app.audit.wakeRule'), 'shield-check'), action: t('sim.app.audit.cause', { grade: P.grade(officialChain().grade).label, conclusion: officialChain().conclusion }), perm: t('sim.app.cause.rule', { name: s.rule.name, version: s.rule.version }) });
    for (const h of S.history) {
      const at = h.attempt ? t('sim.app.audit.attempt', { n: h.attempt }) : '', tg = h.target ?? targetOf(optOf()), pr = h.pr ?? S.prId;
      if (h.kind === 'approve') rows.push({ at: h.at, actor: me, action: t('sim.app.audit.approve', { option: h.option, target: tg[2] ?? '', attempt: at }), perm: h.mode === 'pr' ? t('sim.app.audit.deployer', { repo: repo.split('/')[1].replace('-deploy', '') }) : t('sim.app.audit.operatorCopy', { ns: tg[1] ?? ns }) });
      else if (h.kind === 'prcreate') rows.push({ at: h.at, actor: sys('Wake GitHub App', 'brand-github'), action: `${h.text}${at}`, perm: 'GitHub App · pull_requests: write', link: prUrl(pr) });
      else if (h.kind === 'prfail') rows.push({ at: h.at, actor: sys('Wake GitHub App', 'brand-github'), action: h.text, perm: t('sim.app.audit.tokenExpired') });
      else if (h.kind === 'manual') rows.push({ at: h.at, actor: me, action: t('sim.app.audit.manual', { text: h.text, attempt: at }), perm: t('sim.app.audit.manualPerm') });
      else if (['ack', 'ready', 'review', 'request', 'external', 'observed'].includes(h.kind)) rows.push({ at: h.at, actor: h.actor?.user ? { name: h.actor.name, user: true } : sys(h.actor?.name ?? 'Wake', h.actor?.icon ?? 'circle-check'), action: `${HIST_WORD[h.kind]} · ${h.text}${at}`, perm: h.ticket ?? (h.pr ? `PR #${h.pr}` : ''), ...(h.link ? { link: h.link } : {}) }); /* the people and teams the engine records, with their PR or ticket */
      else if (h.kind === 'merge') rows.push({ at: h.at, actor: h.actor?.user ? { name: h.actor.name, user: true } : me, action: t('sim.app.audit.merge', { pr, attempt: at }), perm: t('sim.app.audit.mergePerm', { repo }), link: h.link ?? prUrl(pr) });
      else if (h.kind === 'sync') rows.push({ at: h.at, actor: sys('Argo CD', 'brand-argo'), action: `${h.text}${at}`, perm: t('sim.app.audit.syncPerm') });
      else if (h.kind === 'rollout') rows.push({ at: h.at, actor: sys('Kubernetes', 'k8s-deployment'), action: `${h.text}${at}`, perm: t('sim.app.audit.rolloutPerm') });
      else if (h.kind === 'done') rows.push({ at: h.at, actor: me, action: h.text, perm: t('sim.app.audit.externalPerm', { ns }) });
      else rows.push({ at: h.at, actor: sys(t('sim.app.audit.wakeCheck'), 'circle-check'), action: h.kind === 'resolve' ? t('sim.app.audit.resolve', { text: h.text.replace(/^복구 확인 · /, '') }) : `${HIST_WORD[h.kind] ?? h.kind} · ${h.text}`, perm: t('sim.app.audit.checkPerm', { min: NEED / 60, sec: CADENCE }) });
    }
    for (const x of S.planLog ?? []) rows.push({ at: x.at, actor: x.kind === 'run' ? sys('wake-executor', 'terminal') : me, action: x.kind === 'run' ? t('sim.app.audit.run', { cmd: x.cmd, result: x.result }) : x.kind === 'deny' ? t('sim.app.audit.deny', { label: x.label, target: x.target }) : t('sim.app.audit.approvePlan', { label: x.label, target: x.target }), perm: x.kind === 'run' ? t('sim.app.audit.runPerm', { ns: x.ns || 'cluster' }) : t('sim.app.audit.approver') });
    return rows.sort((x, y) => x.at - y.at);
  }
  function recordCard() {
    const rows = auditTrail();
    const o = optOf(), fus = S.resolvedAt != null ? o?.followUps ?? [] : [], fu = fus.length ? html`<div class="ws-follow">${C.statusIcon.render({ kind: 'busy', text: t('sim.app.record.followUp', { text: fus[0].title, owner: fus[0].owner ?? t('sim.app.record.ownerNeeded'), due: fus[0].dueDate ?? ymd(S.resolvedAt + fus[0].due) }) })}${fus.length > 1 ? html`<span class="ai-cnt">+${fus.length - 1}</span>` : ''}</div>` : ''; /* the first follow-up and how many more */
    const risk = S.resolvedAt != null && o?.residual ? html`<div class="ws-follow">${C.statusIcon.render({ kind: 'warn', text: t('sim.app.record.residual', { text: o.residual }) })}</div>` : '';
    const hand = S.history.some(h => h.mode === 'manual') ? html`<div class="ws-follow">${C.statusIcon.render({ kind: 'idle', text: t('sim.app.record.handoff', { to: o?.to ?? t('sim.app.act.team') }) })}</div>` : '';
    return section({ id: 'record', n: 6, title: t('sim.stage.record'), state: stageState('record'), hint: S.hint, toggle: toggleOpen('record'), open: open('record'),
      items: [{ id: 'n', label: t('sim.app.record.items'), value: `${rows.length}` }, S.resolvedAt != null ? { id: 'd', label: t('sim.app.record.toRecovery'), value: dur(S.resolvedAt) } : { id: 'd', label: t('sim.app.record.since'), value: t('sim.app.record.notRecovered', { dur: dur(Math.max(0, S.t)) }) }], body: html`${V.auditList(rows)}${risk}${fu}${hand}` });
  }
  /* one incident is one status line, the same part as the GitOps status tool: closed, a pill that names it and where it stands; open, the line
     (detected → scope → cause → action → check → result), what waits for a person under it, then a section for each stage that has started */
  function workspace() {
    const s = sc(), ph = phase(), ch = officialChain(), opt = s.options.find(o => o.id === S.chosen), rows = scopeRows();
    const bad = rows.filter(r => r.status[0] === 'error').length, warn = rows.filter(r => r.status[0] === 'warn').length;
    const stv = id => stageState(id);
    const actDone = S.verifyFrom != null || ph === 'resolved';
    const steps = [
      { id: 'scope', label: t('sim.stage.scope'), state: stv('scope') === 'done' ? 'done' : 'run', text: stv('scope') === 'done' ? (bad ? t('sim.app.flow.fail', { n: bad }) : warn ? t('sim.app.flow.warn', { n: warn }) : t('sim.app.flow.targetOk')) : t('sim.phase.scoping'), meta: `${[bad && warn ? t('sim.app.flow.warn', { n: warn }) : '', t('sim.app.flow.ok', { n: rows.length - bad - warn })].filter(Boolean).join(' · ')}` } /* the same tally as the scope line */,
      { id: 'cause', label: t('sim.stage.cause'), state: stv('cause') === 'future' ? 'idle' : stv('cause') === 'done' ? 'done' : 'run', text: stv('cause') === 'done' ? P.grade(ch.grade).label : stv('cause') === 'future' ? t('sim.app.flow.wait') : ph === 'failed' ? t('sim.app.flow.causeKept') : t('sim.phase.investigating'), meta: stv('cause') === 'done' ? '' : t('sim.app.flow.skill', { id: s.skill.id }) }, /* the rule's name is the cause section's, not the line's */
      { id: 'act', label: t('sim.stage.act'), state: stv('act') === 'future' ? 'idle' : actDone && ph !== 'failed' ? 'done' : ph === 'applying' && !heldWhy() ? 'run' : 'wait',
        text: stv('act') === 'future' ? t('sim.app.flow.wait') : ph === 'failed' ? t('sim.app.flow.otherAct') : actDone ? (modeOf(opt) !== 'pr' ? t('sim.app.flow.actDone') : t('sim.app.flow.applyDone')) : ph === 'applying' ? (heldWhy() ? t('sim.app.flow.held', { why: heldWhy() }) : t('sim.phase.applying')) : ph === 'merge-wait' ? t('sim.app.flow.mergeWait') : ph === 'pr-failed' ? t('sim.hist.prfail') : ph === 'handoff' ? t('sim.app.flow.manual') : S.approval ? t('sim.app.flow.approvalWait') : t('sim.app.flow.chooseWait'),
        meta: opt && S.approvedAt != null ? (modeOf(opt) === 'pr' ? (S.prCreatedAt != null ? `PR #${S.prId}` : t('sim.app.flow.prMaking')) : opt.title) : t('sim.app.flow.actCount', { n: s.options.length }) },
      { id: 'verify', label: t('sim.stage.verify'), state: ph === 'failed' ? 'fail' : ph === 'resolved' ? 'done' : ph === 'verifying' ? 'run' : ph === 'inconclusive' ? 'wait' : 'idle', text: ph === 'failed' ? t('sim.app.flow.recurred') : ph === 'resolved' ? t('sim.app.flow.pass') : ph === 'inconclusive' ? t('sim.hist.inconclusive') : ph === 'verifying' ? (verifyBlind() ? t('sim.app.flow.judgeHeld') : t('sim.app.flow.checking')) : t('sim.app.flow.afterApply'),
        meta: ph === 'verifying' ? t('sim.app.flow.toPass', { dur: dur(NEED - stableNow()) }) : ph === 'resolved' ? hm(S.resolvedAt) : '' },
    ];
    const results = ph === 'resolved' ? [{ id: 'r', tone: resolvedKind(), text: E.recovery().label }] : ph === 'failed' ? [{ id: 'r', tone: 'error', text: failWord() }] : [];
    const opts = optionsNow();
    const decision = S.approval ? { tone: 'warn', text: t('sim.app.dec.approvalText', { title: opt.title }), actions: S.aiOpen ? [] : [{ id: 'ai', label: t('sim.app.dec.seeQuestion'), action: 'sim.openAi', variant: 'default' }] }
      : ph === 'judged' ? { tone: 'warn', text: s.options.length > 1 ? t('sim.app.dec.more', { title: opts[0].title, n: s.options.length - 1 }) : `${opts[0].title}`, actions: [{ id: 'go', label: t('sim.app.dec.seeAct'), action: 'sim.focus', arg: 'act', variant: 'default' }] }
      : ph === 'pr-failed' ? { tone: 'error', text: down('github') ? t('sim.app.dec.prFailedRelogin', { why: S.prFailed }) : t('sim.app.dec.prFailedText', { why: S.prFailed }), actions: down('github') ? [{ id: 'tools', label: t('sim.app.dec.ghTools'), action: 'sim.go', arg: { page: 'tools', tool: 'github' }, variant: 'default' }] : [{ id: 'again', label: t('sim.app.dec.retryPr'), icon: 'arrow-rotate-clockwise', action: 'sim.retryPr', variant: 'default' }] }
      : ph === 'merge-wait' ? { tone: 'warn', text: S.prCreatedAt != null ? t('sim.app.dec.mergeText', { id: S.prId, target: targetOf(optOf())[2] ?? '' }) : `${targetOf(optOf())[2] ?? ''} · GitHub App`, actions: [] }
      : ph === 'handoff' ? { tone: 'warn', text: opt?.title ?? '', actions: [{ id: 'done', label: t('sim.app.dec.markDone'), icon: 'check', action: 'sim.done', variant: 'default' }] }
      : ph === 'inconclusive' ? { tone: 'warn', text: verifyBlind() ? t('sim.app.dec.blind', { src: blindWhy() }) : t('sim.app.dec.missing', { dur: dur(S.downWins.length * CADENCE), need: dur(NEED) }), actions: verifyBlind() ? [{ id: 'tools', label: t('sim.app.dec.seeTools'), action: 'sim.go', arg: { page: 'tools' }, variant: 'default' }] : [{ id: 'again', label: t('sim.app.dec.reverify'), icon: 'arrow-rotate-clockwise', action: 'sim.reverify', variant: 'default' }] }
      : ph === 'applying' && heldWhy() === 'Argo CD 읽기 불가' ? { tone: 'warn', text: t('sim.app.dec.argoHeldText'), actions: [{ id: 'manual', label: t('sim.app.dec.markChecked'), icon: 'check', action: 'sim.manualSync', variant: 'default' }] }
      : ph === 'failed' ? { tone: 'error', text: (o => o ? t('sim.app.dec.next', { title: o.title }) : t('sim.app.dec.noNext'))(opts.find(o => !o.disabled)), actions: [{ id: 'go', label: t('sim.app.dec.seeAct'), action: 'sim.focus', arg: 'act', variant: 'default' }] } : null;
    const tone = ph === 'resolved' ? resolvedKind() : ph === 'failed' ? 'error' : decision ? 'warn' : 'busy';
    const unit = { id: s.id, name: s.title, tool: 'Alertmanager', headline: { tone, text: S.approval ? t('sim.app.dec.approvalWait') : ph === 'applying' && heldWhy() ? t('sim.app.dec.applyHeld', { why: heldWhy() }) : ph === 'verifying' && verifyBlind() ? t('sim.app.dec.judgeHeld', { src: blindWhy() }) : statusWord[ph], meta: dur(elapsed()) },
      event: { id: 'alert', kind: 'webhook', icon: 'bell', keyword: s.alert, active: true, at: hm(0) }, steps, results, decision,
      sections: [scopeCard(), timeCard(), causeCard(), actCard(), verifyCard(), recordCard()].filter(Boolean) };
    const crumb = html`<div class="sim-top"${paneOpen() ? '' : html` data-notice-below`}><span class="sim-crumb">${icon('k8s-cluster', 'sm')}<b>${s.cluster}</b><span>›</span>${C.button.render({ label: t('sim.view.incidents'), variant: 'link', action: 'sim.go', arg: { page: 'incidents' } })}<span>›</span><span title="${alertText(st.sid)?.incident ?? ''} ${s.title}">${alertText(st.sid)?.incident ?? ''} ${s.title}</span></span></div>`;
    return html`<section class="sim-body">${crumb}${header()}${V.findResults()}${C.statusFlow.render({ header: false, compact: true, label: t('sim.flow.label'), open: S.cardOpen, toggle: { action: 'sim.card' }, unit, detail: 'stack', section: 'sim.sec', labels: { listening: t('sim.flow.listening'), event: t('sim.flow.event'), result: t('sim.flow.result'), source: t('sim.flow.source') } })}</section>`;
  }

  /* ---------- 상세 칸: 리소스(그래프·컨테이너·이벤트·로그), 근거 보기, 변경, 과거 인시던트, YAML, 단축키 설정 ---------- */
  /* notices overlay their corner and never move or resize the page (2026-11-14): the stack starts under the head row of the rightmost pane, so it never covers a pane's close button or the page's controls */
  /* the rightmost pane: the AI pane when it is open and not behind the detail tab of a narrow window */
  const rightPane = () => S.aiOpen && !(typeof window !== 'undefined' && window.innerWidth < 1440 && (S.sel || S.report?.open) && (S.paneTab ?? 'detail') !== 'ai') ? 'ai' : 'detail';
    const headRow = (pane, inner) => rightPane() === pane ? html`<div class="dt-back" data-notice-below>${inner}</div>` : html`<div class="dt-back">${inner}</div>`;
  /* why an object is in trouble, never its state again: the kind's own cause, a pod's last termination against its limit, else its latest Warning event;
     a workload reads the cause of its failing pod */
  function causeOf(r) {
    const own = V.whyOf(r); if (own) return own;
    const podCause = p => { const c = containersOf(p).find(x => x.state[0] !== 'ok' && /Terminated/.test(x.last ?? '')); if (c) return t('sim.app.detail.lastState', { last: c.last, ...(/OOMKilled/.test(c.last) ? { limit: `limits.memory ${p.memLim}Mi` } : { limit: '' }) }).replace(/ · $/, '');
      const e = V.eventsOf(p).filter(x => x.type === 'Warning').sort((x, y) => y.at - x.at)[0]; return e ? `${e.reason} · ${e.msg}` : null; };
    if (r.kind === 'Pod') return podCause(r);
    const pod = W().pods.find(p => p.owner?.name === r.name && p.ns === r.ns && p.status[0] !== 'ok');
    if (pod) { const c = podCause(pod); return c ? `Pod ${pod.name} · ${c}` : `Pod ${pod.name} · ${pod.status[1]}`; }
    const e = V.eventsOf(r).filter(x => x.type === 'Warning').sort((x, y) => y.at - x.at)[0];
    return e ? `${e.reason} · ${e.msg}` : null;
  }
  function detail() {
    const s = sc(), sel = S.sel;
    if (!sel) return '';
    const back = headRow('detail', html`${S.selPrev ? C.iconButton.render({ icon: 'chevron-left-small', tip: t('sim.app.detail.back'), size: 'sm', action: 'sim.back' }) : html`<span></span>`}${C.iconButton.render({ icon: 'cross-medium', tip: t('sim.app.detail.close'), size: 'sm', action: 'sim.closeDetail' })}`);
    let inner = '';
    if (sel.type === 'resource') {
      const r = V.findResource(sel.key), inInc = S.view === 'incident' && r?.scenario, bad = r && (r.status[0] === 'error' || r.status[0] === 'warn');
      /* the conditional lines under the head: why it is failing and since when, who manages it, and the incident or past incidents it is part of */
      const app = r && W().apps.find(a => a.target?.name === (r.kind === 'Pod' ? r.owner?.name : r.name) && a.target?.ns === r.ns); /* the one source of truth: the Application that manages it */
      const managed = app ? { text: t('sim.app.detail.managed', { name: app.name, state: app.auto ? t('sim.app.detail.on') : t('sim.app.detail.off') }) } : null;
      const link = r?.scenario && incidentOpen() && !inInc ? { kind: 'incident', text: t('sim.app.detail.incident', { title: s.title }), action: 'sim.go', arg: { page: 'incident' } } : r?.scenario && s.memory ? { kind: 'memory', text: s.memory.text, action: 'sim.memory' } : null;
      const lines = r ? P.headLines({ notes: V.notesOf(r), reasonKind: r.status[0] === 'error' ? 'error' : 'warn', reason: bad ? causeOf(r) : null, /* the warning line says why, in the state's own colour, never the head's state again */ reasonAction: bad && r.scenario && s.changes?.[0] ? { label: `${s.changes[0].kind} ${ymd(s.changes[0].at) === ymd(0) ? hm(s.changes[0].at) : `${ymd(s.changes[0].at)} ${hm(s.changes[0].at)}`}`, action: 'sim.change', arg: s.changes[0].id } : null, managed, link }) : '';
      /* an object that is gone now (a replaced pod) keeps what was seen then: the evidence it was opened for stays as a snapshot, and the object that runs now is a separate link */
      const [ns0, kind0, name0] = sel.key.split('/'), now0 = !r && kind0 === 'Pod' ? W().pods.find(p => p.replaced === name0 && p.ns === ns0) : null, ev0 = !r && S.focus?.ev != null ? E.evidenceNow().find(x => x.id === S.focus.ev) : null;
      inner = r ? V.resourceDetail(sel.key, lines, S.focus ?? {}) : html`<div class="v-stale">${C.statusIcon.render({ kind: 'idle', icon: 'clock', text: now0 ? t('sim.app.detail.replaced', { kind: kind0, name: name0 }) : t('sim.app.detail.gone', { kind: kind0, name: name0 }) })}${now0 ? C.button.render({ label: t('sim.app.detail.openNow', { name: now0.name }), variant: 'link', action: 'sim.openRow', arg: { id: `${now0.ns}/Pod/${now0.name}` } }) : ''}</div>${ev0 ? V.evidenceView(ev0) : V.resourceDetail(sel.key, lines, S.focus ?? {})}`;
    } else if (sel.type === 'ailog') {
      inner = V.aiLogDetail(sel.id, sel.row);
    } else if (sel.type === 'evidence') {
      inner = V.evidenceView(E.evidenceNow().find(x => x.id === sel.id));
    } else if (sel.type === 'event') {
      inner = V.eventDetail(sel.id);
    } else if (sel.type === 'tool') {
      inner = sel.id === 'agent' ? V.agentDetail() : V.toolDetail(sel.id);
    } else if (sel.type === 'alert') {
      inner = V.alertDetail(sel.id);
    } else if (sel.type === 'change') {
      const c = allChanges().find(x => x.id === sel.id);
      inner = c ? html`${C.pageHeader.render({ icon: c.lane === 'deploy' ? 'k8s-deployment' : c.lane === 'config' ? 'k8s-configmap' : 'k8s-node', title: c.title, context: `${c.kind} · ${hm(c.at)}`, size: 'sm' })}${C.summaryBar.render({ label: t('sim.app.detail.change'), items: [{ id: 'k', label: '', value: c.kind }, { id: 'w', label: t('sim.app.detail.at'), value: hm(c.at) }, { id: 'd', label: t('sim.app.detail.toDetect'), value: dur(-c.at) }] })}<p class="dt-p">${c.text}</p>${c.diff ? C.codeBlock.render({ path: c.diff.path, text: [...c.diff.before.map(l => '-' + l), ...c.diff.after.map(l => '+' + l)].join('\n'), diff: true }) : ''}` : '';
    } else if (sel.type === 'memory' || sel.type === 'past') {
      const all = pastOf(S.cid), one = sel.type === 'past' ? all.find(p => p.id === sel.id) : null, key = one ? one.title.split(' ')[0] : s.scope[0].name.split('-')[0], mem = new Set(memoryOf(st.sid).map(m => m.id.toLowerCase())), same = all.filter(p => p === one || mem.has(p.id.toLowerCase()) || (!mem.size && p.title.startsWith(key))); /* the repeat memory is the data's own list (world memoryOf) */
      inner = one ? V.pastDetail(one, same) : html`${C.pageHeader.render({ icon: 'clock', title: t('sim.app.past.title'), context: t('sim.app.past.context', { ns: s.ns, cluster: W().cluster.name }), size: 'sm' })}
        ${C.summaryBar.render({ label: t('sim.app.past.same'), open: true, toggle: { action: 'sim.noop' }, items: [{ id: 't', label: '', value: t('sim.app.past.same') }, { id: 'n', label: t('sim.app.past.days'), value: `${same.length}` }], body: C.dataTable.render({ clip: true, rowKey: 'id', rows: same.slice(0, 12), rowAction: 'sim.past', columns: [{ id: 'when', label: t('sim.app.past.date'), time: true, width: 'calc(var(--space-16) * 1.5)' }, { id: 'title', label: t('sim.app.past.incident') }, { id: 'by', label: t('sim.app.past.action'), muted: true, optional: true }, { id: 'took', label: t('sim.app.past.took'), value: true, width: 'calc(var(--space-16) * 1.2)' }] }) })}`;
    }
    return html`<section class="sim-detail">${back}${inner}</section>`;
  }

  /* ---------- AI 창 ---------- */
  function ai() {
    const s = sc();
    if (!S.aiOpen) return '';
    /* a quiet day has no incident to investigate, but a resource action proposed from a view still opens its command plan here */
    if (s.quiet) return html`<section class="sim-ai">${headRow('ai', html`<span class="ai-l">${t('sim.ai.title')}</span>${C.iconButton.render({ icon: 'cross-medium', tip: t('sim.ai.close'), size: 'sm', action: 'sim.closeAi' })}`)}<div class="ai-scroll">${V.stale()}${planTalk() || ((S.chat ?? []).length || S.report ? '' : C.emptyState.render({ icon: 'ai', plainIcon: true, title: t('sim.app.ai.quietEmpty') }))}${reportTalk()}${chatTalk()}</div>${pinned(planQuestion())}${composer()}${aiFoot()}</section>`;
    const gotAt = i => E.evidenceNow().find(e => e.id === s.skill.ev?.[i])?.got ?? skillAt() + 3 * i; /* a read starts when its evidence was got (the data's own time) */
    const stepsDone = Math.max(0, Math.min(s.skill.steps.length, s.skill.steps.filter((_, i) => gotAt(i) <= S.t + 3).length)), done = S.t >= judgedAt();
    const blocked = s.skill.blocked ?? {};
    /* the skill's reads fold into one line, as AI tools show their work: "N초 동안 작업 >" opens the reads, one line each, led by its state
       (spinner while it reads, check when read, lock or unplugged when it could not read) with what it got on the right; reads not reached yet are not drawn */
    const reached = done ? s.skill.steps.length : stepsDone, got = i => { const id = s.skill.ev?.[i]; return id == null ? null : E.evidenceNow().find(e => e.id === id); }; /* a read is tied to its evidence by id, never by position */
    const rows = s.skill.steps.slice(0, reached).map((step, i) => {
      if (blocked[i] && (done || i < stepsDone - 1)) return C.stepRow.render({ state: blocked[i][0] === 'perm' ? 'blocked' : 'off', text: step, meta: blocked[i][1] });
      const run = !done && i === stepsDone - 1;
      /* a read whose source is gone now says so (agent down, no permission); one with no evidence row says that too */
      const e = got(i), src = e && (e.kind === 'GitOps' ? down('argocd') && t('sim.app.ai.argoPerm') : e.kind === 'Prometheus' ? down('prometheus') && t('sim.app.ai.promDown') : e.kind === '로그' ? down('loki') && t('sim.app.ai.lokiDown') : e.kind === 'Kubernetes API' ? agentDown() && t('sim.app.ai.agentDown') : false);
      if (done && src) return C.stepRow.render({ state: 'blocked', text: step, meta: t('sim.app.ai.readAt', { src, date: ymd(judgedAt()), time: hms(judgedAt() - 2) }) });
      return C.stepRow.render({ state: run ? 'run' : 'done', text: step, meta: run ? (e?.query ?? t('sim.app.ai.reading')) : e ? e.count : (s.skill.notes?.[i] ?? t('sim.app.ai.readUnused')), live: run });
    });
    const skill = S.t >= skillAt() ? html`<div class="ai-blk ai-skill"><div class="ai-l">${t('sim.app.ai.skill', { id: s.skill.id, version: s.skill.version })}</div>${C.stepGroup.render({ id: 'sim-skill', working: !done, seconds: Math.max(0, Math.min(S.t, judgedAt()) - skillAt()), open: S.stepsOpen, steps: rows, current: done ? '' : rows[rows.length - 1] })}</div>` : '';
    const ch = officialChain();
    const pointer = done ? html`<div class="ai-blk">${C.button.render({ label: t('sim.app.ai.toCause', { grade: P.grade(ch.grade).label }), icon: 'arrow-up-right', variant: 'link', action: 'sim.focus', arg: 'cause' })}<span class="ai-cnt">${E.evidenceNow().some(e => e.blocked) ? t('sim.app.ai.evidenceFailed', { n: E.evidenceNow().filter(e => !e.blocked).length, failed: E.evidenceNow().filter(e => e.blocked).length }) : t('sim.app.ai.evidence', { n: E.evidenceNow().filter(e => !e.blocked).length })}</span></div>` : '';
    const altP = s.aiAlt ? { conclusion: s.aiAlt.conclusion, grade: s.aiAlt.grade, source: s.aiAlt.source, cells: s.aiAlt.cells, note: t('sim.app.ai.notAdopted'), refAction: 'sim.ref', adopt: { action: 'sim.adopt', arg: 'alt' } } : null;
    const alt = done && altP && !S.adoptedAlt ? html`<div class="ai-blk ai-op">${C.summaryBar.render({ label: t('sim.app.ai.opinion'), open: S.aiChainOpen, toggle: { action: 'sim.chain', arg: 'alt' }, items: [{ id: 'h', label: '', wrap: true, value: t('sim.app.ai.opinionHead', { grade: P.grade(altP.grade).label, conclusion: altP.conclusion }) }], body: html`${P.reasoningChain({ ...altP, part: 'head' })}${P.reasoningChain({ ...altP, part: 'body' })}` })}</div>` : ''; /* the closed head is the conclusion in at most two lines: the bar keeps one shape at every width; the rest opens below */
    const opt = optionsNow().find(o => o.id === S.chosen) ?? s.options.find(o => o.id === S.chosen);
    const mode = modeOf(opt), ghDown = mode === 'pr' && down('github');
    const approval = S.approval && opt ? C.questionPanel.render({ id: 'sim-q', footer: false, question: mode === 'pr' ? t('sim.app.ask.approve', { title: opt.title }) : t('sim.app.ask.copy', { title: opt.title }), detail: html`${P.approvalHead({ target: opt.target ?? s.approval.target, change: opt.change, impact: opt.impact, diff: opt.diff, prod: s.prod, grade: opt.grade, cause: officialChain().grade, command: opt.command })}${ghDown ? html`<div class="ai-warn">${C.statusIcon.render({ kind: 'error', text: t('sim.app.ask.ghDown', { detail: tool('github')?.detail }) })}</div>` : ''}${mode === 'pr' && down('argocd') ? html`<div class="ai-warn">${C.statusIcon.render({ kind: 'warn', text: t('sim.app.ask.argoDown', { detail: tool('argocd')?.detail ?? t('sim.app.ask.argoNoRead') }) })}</div>` : ''}`, options: CHOICES, selected: 0 }) : '';
    /* every approval and every failure stays: a second approval after a failure is added, it never overwrites the first */
    const decided = S.history.length ? html`<div class="ai-blk">${[...S.history].sort((a, b) => a.at - b.at).map(h => /* in time order, whatever order the engine wrote them */ html`<div class="ai-who">${C.statusIcon.render({ kind: h.kind === 'resolve' ? recoveryKind({ kind: h.recovery ?? 'service', watching: h.watchUntil != null }) : h.kind === 'fail' || h.kind === 'prfail' ? 'error' : h.kind === 'inconclusive' ? 'warn' : 'ok' })}<span>${HIST_WORD[h.kind] ?? h.kind}</span>${h.actor?.user ? C.avatar.render({ name: h.actor.name, size: 'sm', showName: true }) : h.kind === 'approve' || h.kind === 'done' ? C.avatar.render({ name: ME, size: 'sm', showName: true }) : ''}${whoTail(h.at, h.kind === 'approve' ? h.option : h.text)}</div>`)}</div>` : '';
    return html`<section class="sim-ai">${headRow('ai', html`<span class="ai-l">${t('sim.ai.title')}</span>${C.iconButton.render({ icon: 'cross-medium', tip: t('sim.ai.close'), size: 'sm', action: 'sim.closeAi' })}`)}<div class="ai-scroll">${V.stale()}${aiSources()}<div class="ai-blk ai-ub">${C.userBubble.render({ text: t('sim.app.ai.alertIn', { alert: s.alert, severity: alertText(st.sid)?.severity ?? s.severity, skill: s.skill.id }), time: hm(0) })}</div>${skill}${pointer}${alt}${decided}${planTalk()}${reportTalk()}${chatTalk()}</div>${pinned(approval || planQuestion())}${composer()}${aiFoot()}</section>`;
  }

  /* ---------- 시뮬레이션 제어 ---------- */
  function controls() {
    const ph = phase(), s = sc();
    return html`<div class="sim-ctl"><span class="sim-ctl-l">${t('sim.ctl.title')}</span>
      ${C.pillTabs.render({ id: 'sim-sc', label: t('sim.ctl.scenario'), value: st.sid, tabs: SCENARIOS.map((x, i) => ({ id: x.id, label: `${i + 1} ${x.short}` })), action: 'sim.scenario' })}
      ${C.pillTabs.render({ id: 'sim-sp', label: t('sim.ctl.speed'), value: String(st.speed), tabs: [['1', '1×'], ['5', '5×'], ['30', '30×']].map(([id, label]) => ({ id, label })), action: 'sim.speed' })}
      ${s.quiet ? '' : html`${C.button.render({ label: t('sim.ctl.merge'), size: 'sm', variant: 'secondary', round: true, action: 'sim.merge', disabled: ph !== 'merge-wait' || S.prCreatedAt == null || down('github') })}${C.button.render({ label: t('sim.ctl.fail'), size: 'sm', variant: 'secondary', round: true, action: 'sim.fail', disabled: !['applying', 'verifying', 'merge-wait'].includes(ph) || S.failedOnce })}`}
      ${C.pillTabs.render({ id: 'sim-cn', label: t('sim.ctl.conn'), value: S.conn, tabs: ['ok', 'agent-down', 'tools-down', 'limited'].map(id => ({ id, label: t('sim.ctl.conn.' + id) })), action: 'sim.conn' })}
      ${C.button.render({ label: t('sim.ctl.reset'), size: 'sm', variant: 'ghost', round: true, action: 'sim.reset' })}
      ${C.pillTabs.render({ id: 'sim-th', label: t('sim.ctl.theme'), value: document.documentElement.dataset.theme || 'dark', tabs: ['dark', 'light'].map(id => ({ id, label: t('sim.ctl.theme.' + id) })), action: 'sim.theme' })}
${S.note ? html`<span class="sim-note">${S.note}</span>` : ''}</div>`;
  }


  /* ---------- 내보내기 파일 ---------- */
  function exportText(fmt) {
    const s = sc(), ch = officialChain();
    const rec = { cluster: s.cluster, incident: alertText(st.sid)?.incident ?? s.id, symptom: s.symptom, severity: s.severity, detected: hms(0), judged: hms(judgedAt()), approved: S.approvedAt != null ? hms(S.approvedAt) : null, resolved: S.resolvedAt != null ? hms(S.resolvedAt) : null,
      conclusion: { grade: P.grade(ch.grade).label, text: ch.conclusion, source: ch.source }, action: s.options.find(o => o.id === S.chosen)?.title ?? null, rule: s.rule, skill: { id: s.skill.id, version: s.skill.version }, evidence: E.evidenceNow().map(e => ({ id: e.id, kind: e.kind, query: e.query, range: e.range, count: e.count, hash: e.hash })), audit: auditTrail().map(r => ({ at: `${ymd(r.at)} ${hms(r.at)} KST`, actor: r.actor.name, action: r.action, permission: r.perm, ...(r.link ? { link: r.link } : {}) })), redacted: s.redactions };
    if (fmt === 'json') return [JSON.stringify(rec, null, 2), 'application/json', 'json'];
    if (fmt === 'csv') return [[t('sim.app.export.csvHead'), ...E.evidenceNow().map(e => [e.id, e.kind, e.query, e.range, e.count, e.hash].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n'), 'text/csv', 'csv'];
    if (fmt === 'xls') {
      const sheet = (name, rows) => `<Worksheet ss:Name="${name}"><Table>${rows.map(r => `<Row>${r.map(v => `<Cell><Data ss:Type="String">${String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet>`;
      const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheet(t('sim.app.export.sheetIncident'), [[t('sim.app.export.cluster'), t('sim.app.export.incident'), t('sim.app.export.symptom'), t('sim.app.export.severity'), t('sim.app.export.detected'), t('sim.app.export.judged'), t('sim.app.export.approved'), t('sim.app.export.resolved'), t('sim.app.export.grade'), t('sim.app.export.conclusion')], [rec.cluster, rec.incident, rec.symptom, rec.severity, rec.detected, rec.judged, rec.approved, rec.resolved, rec.conclusion.grade, rec.conclusion.text]])}${sheet(t('sim.app.export.sheetTimeline'), [[t('sim.app.export.at'), t('sim.app.export.lane'), t('sim.app.export.kind'), t('sim.app.export.target'), t('sim.app.export.text')], ...s.changes.map(c => [hm(c.at), c.lane, c.kind, c.title, c.text])])}${sheet(t('sim.app.export.sheetEvidence'), [[t('sim.app.export.no'), t('sim.app.export.source'), t('sim.app.export.query'), t('sim.app.export.range'), t('sim.app.export.count'), t('sim.app.export.hash')], ...rec.evidence.map(e => [e.id, e.kind, e.query, e.range, e.count, e.hash])])}${sheet(t('sim.app.export.sheetRecord'), [[t('sim.app.export.at'), t('sim.app.export.who'), t('sim.app.export.did'), t('sim.app.export.perm'), t('sim.app.export.link')], ...rec.audit.map(r => [r.at, r.actor, r.action, r.permission, r.link ?? ''])])}${sheet(t('sim.app.export.sheetApproval'), [[t('sim.app.export.who'), t('sim.app.export.when'), t('sim.app.export.decision'), t('sim.app.export.target'), t('sim.app.export.gradeShort')], ...(S.approvedAt != null ? [[ME, hms(S.approvedAt), t('sim.app.export.approve'), s.approval.target.join('/'), rec.conclusion.grade]] : [])])}</Workbook>`;
      return [xml, 'application/vnd.ms-excel', 'xls'];
    }
    const md = [`# ${s.symptom}`, '', t('sim.app.export.mdMeta', { cluster: s.cluster, severity: s.severity, detected: rec.detected, resolved: rec.resolved ?? t('sim.app.export.mdNotYet') }), '', t('sim.app.export.mdCause'), `${rec.conclusion.grade}: ${ch.conclusion}`, '', ...['observe', 'basis', 'interpret', 'verify', 'unknown'].flatMap(k => (ch.cells[k] || []).map(x => `- ${mask(x.text)}${x.refs ? t('sim.app.export.mdRefs', { refs: x.refs.join(', ') }) : ''}`)), '', t('sim.app.export.mdAction'), rec.action ?? t('sim.app.export.mdNone'), '', t('sim.app.export.mdEvidence'), ...rec.evidence.map(e => `${e.id}. ${e.kind} · ${e.query} · ${e.count} · ${e.hash}`), '', t('sim.app.export.mdRecord'), ...rec.audit.map(r => `- ${r.at} · ${r.actor} · ${r.action} · ${r.permission}${r.link ? ` · ${r.link}` : ''}`), '', t('sim.app.export.mdMasked', { n: redactedTotal(s.redactions) })].join('\n');
    return [md, 'text/markdown', 'md'];
  }
  /* a file the person saves: one way for every export */
  const saveFile = (text, type, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  function download(fmt) {
    if (fmt === 'pdf') { setTimeout(() => window.print(), 300); return; }
    const [text, type, ext] = exportText(fmt);
    saveFile(text, type, `${alertText(st.sid)?.incident ?? sc().id}-incident.${ext}`);
    note(t('sim.app.note.saved', { ext: ext.toUpperCase(), n: redactedTotal(sc().redactions) }));
  }
  const note = t => { S.note = t; ctx.update(); clearTimeout(note.t); note.t = setTimeout(() => { S.note = ''; ctx.update(); }, 2600); };
  /* a copy says so with the app's toast (B-18: at the bottom centre, clear of the page header) */
  const toasts = C.toast.attach(document, { emit() {} }), copied = body => toasts.show({ title: t('sim.app.toast.copied'), body, tone: 'ok' });
  /* the conversation keeps its latest message in sight (above the pinned question): it follows what is added while the reader is at its end, and stays where the reader scrolled otherwise */
  { let last = 0, atEnd = true;
    document.addEventListener('scroll', e => { const el = e.target; if (el?.classList?.contains('ai-scroll')) atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }, true);
    let room = 0; const follow = () => { const el = document.querySelector('.ai-scroll'); if (!el) { last = 0; return; } if (el.scrollHeight !== last || el.clientHeight !== room) { if (atEnd || !last) el.scrollTop = el.scrollHeight; last = el.scrollHeight; room = el.clientHeight; } };
    new MutationObserver(follow).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'open'] }); setTimeout(() => { const ro = new ResizeObserver(follow); const watch = () => { const el = document.querySelector('.ai-scroll'); if (el && !el._ro) { el._ro = 1; ro.observe(el); } }; new MutationObserver(watch).observe(document.body, { childList: true, subtree: true }); watch(); }, 0); }
  const scrollTo = id => setTimeout(() => document.querySelector(`[data-sfl-sec="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
  /* every entry point opens the one view of its object, at the tab and with the focus it came for: an evidence opens the object's 로그·지표·YAML·이벤트·롤아웃
     tab on its range and lines, a change opens the workload's 롤아웃, an event opens the object's 이벤트 with the event in focus */
  const rangeOf = e => (e.from != null ? { from: e.from, to: e.to } : null);
  function route(sel) {
    const s = sc(), res = (key, tab, focus = {}) => key ? { type: 'resource', key, tab, focus: { tab, ...focus } } : null;
    if (sel.type === 'evidence') {
      const e = E.evidenceNow().find(x => x.id === sel.id); if (!e || e.blocked) return sel;
      const label = t('sim.app.route.evidence', { id: e.id, kind: e.kind, range: e.range }), evf = { ev: e.id }, scen = W().pods.find(p => p.scenario), wl = s.scope.find(r => r.kind !== 'Pod' && r.kind !== 'Node');
      const podName = /pods\/log (\S+)/.exec(e.query)?.[1] ?? /pods\/(\S+)/.exec(e.query)?.[1];
      /* an evidence is a snapshot of the incident: it opens the object's tab only while that same object (same pod, not its replacement) still exists;
         otherwise it opens the snapshot itself, with a link to what runs now */
      const same = n => W().pods.some(p => p.name === n && !p.replaced);
      const app = /app="([^"]+)"/.exec(e.query)?.[1];
      if (e.kind === '로그' && podName) { if (!same(podName)) return sel; const q = /OutOfMemory|Connection is not|503|FATAL|timeout/i.exec(e.raw)?.[0] ?? 'ERROR'; return res(resKey(podName, 'Pod'), 'logs', { ...evf, range: rangeOf(e), q, label: `${label} · '${q}'` }) ?? sel; }
      if (e.kind === '로그' && app && S.resolvedAt == null && S.verifyFrom == null) { const q = /Connection is not available|OutOfMemory|503|FATAL|timeout/i.exec(e.raw)?.[0] ?? 'ERROR'; return res(resKey(app, 'Deployment'), 'logs', { ...evf, range: rangeOf(e), q, label: `${label} · ${e.count} · '${q}'` }) ?? sel; }
      /* a metric evidence opens its own series: a pod's memory opens that pod's memory card over the evidence window; any other metric (a 5xx ratio, Redis clients) opens the evidence's own chart */
      if (e.kind === 'Prometheus' && e.metric === 'memory' && e.target?.kind === 'Pod' && same(e.target.name)) { const r = rangeOf(e); if (r) S.detailRange = { from: r.from, to: r.to, live: false }; S.bars = { ...S.bars, 'd-mm': true }; return res(resKey(e.target.name, 'Pod'), 'overview', { ...evf, label }) ?? sel; }
      if (e.kind === 'Kubernetes API' && /events/.test(e.query)) return scen?.replaced ? sel : res(scen ? resKey(scen.name, 'Pod') : wl && resKey(wl.name, wl.kind), 'events', { ...evf, label }) ?? sel;
      if (e.kind === 'Kubernetes API' && podName && same(podName)) return res(resKey(podName, 'Pod'), 'yaml', { ...evf, label, hl: e.raw.split('\n').filter(l => /OOMKilled|exitCode|restartCount|memory|limits/.test(l)).map(l => l.trim()) }) ?? sel;
      if (e.kind === 'GitOps' && wl?.kind === 'Deployment') return res(resKey(wl.name, 'Deployment'), 'rollout', { ...evf, label }) ?? sel;
      return sel;
    }
    if (sel.type === 'change') {
      const c = allChanges().find(x => x.id === sel.id); if (!c) return sel; S.selChange = c.id;
      const name = c.title.split(' ').pop(), key = resKey(name) ?? resKey(name.replace(/-[a-z0-9]{4,5}-[a-z0-9]{4,5}$/, ''));
      const kind = key?.split('/')[1];
      return key ? res(key, kind === 'Deployment' && c.lane === 'deploy' ? 'rollout' : 'events', { label: t('sim.app.route.change', { kind: c.kind, date: ymd(c.at), time: hm(c.at), text: c.text }) }) : sel;
    }
    if (sel.type === 'event') {
      const [, kind, name] = sel.id.split('|'), key = resKey(name, kind);
      return key ? res(key, 'events', { event: sel.id, label: t('sim.app.route.event', { kind, name }) }) : sel;
    }
    if (sel.type === 'memory') { const key = s.scope[0].name.split('-')[0], one = pastOf(S.cid).find(p => p.title.startsWith(key)); return one ? { type: 'past', id: one.id } : sel; }
    if (sel.type === 'resource') return { ...sel, tab: sel.tab ?? 'overview', focus: sel.focus ?? {} };
    return sel;
  }
  const select = sel0 => { const sel = route(sel0); if (sel.type !== 'change') S.selChange = sel0.type === 'change' ? S.selChange : null; if (sel.type !== 'resource' || !sel.focus?.label) S.detailRange = sel0.type === 'evidence' ? S.detailRange : fresh().detailRange; if (sel.type === 'resource') { S.dtab = sel.tab; S.focus = sel.focus; } if (S.sel && (S.sel.type !== sel.type || S.sel.id !== sel.id || S.sel.key !== sel.key)) S.selPrev = S.sel; S.sel = sel; S.paneTab = 'detail'; ctx.update(); };

  /* ---------- 키보드(설계서 10.3) ---------- */
  /* single keys on the work surface: read from the physical key (any layout, a Korean input source too), never while typing or with Ctrl·Alt·Cmd */
  /* a notice closed or opened by hand: the room under the head follows at once, not on the next clock tick */
  document.addEventListener('click', e => { if (e.target.closest?.('.ntcs')) setTimeout(() => ctx.update(), 60); }, true);
  /* the person's own press on the main view or the sidebar takes the view back: the AI stops where it is (what it wrote stays) */
  document.addEventListener('pointerdown', e => { const r = S.report; if (r?.streaming && e.isTrusted && e.target.closest?.('.sim-body, .sim-side') && !e.target.closest('.rp-state')) { r.streaming = false; r.stopped = t('sim.app.rep.stopByHand'); ctx.update(); } }, true);
  document.addEventListener('keydown', e => {
    if (document.querySelector('.dlg-layer, .menu')) return; /* a dialog or menu owns the keys while it is open */
    if (e.key === 'Escape' && !e.target.closest?.('input, textarea')) { if (S.sel) { S.sel = null; S.selPrev = null; ctx.update(); } return; }
    const k0 = surfaceKey(e);
    if (!k0) return;
    const s = sc(), rows = s.scope ?? [];
    const key = k0 === 'enter' ? 'Enter' : k0 === 'arrowdown' ? 'ArrowDown' : k0 === 'arrowup' ? 'ArrowUp' : k0;
    if (key === '?') { e.preventDefault(); openHelp(); return; }
    if (s.quiet || S.view !== 'incident' || !incidentOpen()) { if (/^[jklytxac1-6]$/.test(key) && !e.target.closest?.('input, textarea')) note(t('sim.app.note.keysOnly')); return; }
    if (/^[1-6]$/.test(key)) { S.hint = true; S.cardOpen = true; const id = STAGES[Number(key) - 1][0]; S.open[id] = true; ctx.update(); scrollTo(id); return; }
    if (key === 'j' || key === 'ArrowDown' && e.target === document.body) { S.row = Math.min(rows.length - 1, S.row + 1); S.hint = true; ctx.update(); return; }
    if (key === 'k' || key === 'ArrowUp' && e.target === document.body) { S.row = Math.max(0, S.row - 1); S.hint = true; ctx.update(); return; }
    if (key === 'Enter' && !e.target.closest?.('input, textarea, button, [role="option"]')) { const k = resKey(rows[S.row]?.name, rows[S.row]?.kind); if (k) select({ type: 'resource', key: k }); return; }
    if (key === 'l') { const r = S.hint ? rows[S.row] : null, k = r && (r.kind === 'Pod' || r.kind === 'Deployment' || r.kind === 'StatefulSet') ? resKey(r.name, r.kind) : null; if (k) { select({ type: 'resource', key: k, tab: 'logs', focus: { tab: 'logs' } }); return; } const ev = E.evidenceNow().find(x => x.kind === '로그'); if (ev) select({ type: 'evidence', id: ev.id }); return; } /* the marked row's logs; with no row marked, the incident's log evidence */
    if (key === 'y') { const k = resKey(rows[S.row]?.name, rows[S.row]?.kind); if (k) select({ type: 'resource', key: k, tab: 'yaml', focus: { tab: 'yaml' } }); return; }
    if (key === 't') { S.open.time = true; ctx.update(); scrollTo('time'); return; }
    if (key === 'c') { const v = rows[S.row]?.name; navigator.clipboard?.writeText(v).catch(() => {}); note(t('sim.app.note.copied', { value: v })); return; }
    if (key === 'a') { if (['judged', 'failed'].includes(phase())) { const first = optionsNow().find(o => !o.disabled); if (!first) return; S.chosen = first.id; S.approval = true; S.aiOpen = true; S.paneTab = 'ai'; ctx.update(); } return; } /* the first action not already tried */
    if (key === 'x') document.querySelector('[data-menu="sim.export"]')?.click();
  });

  /* the report as a document: a light page whatever the theme, the print sheet with the incident and the page number, then the theme as it was */
  const printReport = () => {
    const root = document.documentElement, theme = root.dataset.theme, sheet = document.createElement('style');
    sheet.textContent = R.printCss(S.report.head); document.head.appendChild(sheet); root.dataset.theme = 'light'; document.body.classList.add('printing-report');
    const done = () => { document.body.classList.remove('printing-report'); if (theme) root.dataset.theme = theme; else delete root.dataset.theme; sheet.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); setTimeout(() => window.print(), 900); /* the charts redraw at the paper's width first */
  };
  if (frozen) Object.assign(window.__sim, { printReport: () => { const root = document.documentElement, sheet = document.createElement('style'); sheet.textContent = R.printCss(S.report.head); document.head.appendChild(sheet); root.dataset.theme = 'light'; document.body.classList.add('printing-report'); }, markdown: () => R.markdown(REP.state, S.report.head), channel: () => R.channel() }); /* a development aid: the print sheet and the Markdown without the browser's dialogs */
  const openHelp = () => { const b = document.createElement('button'); b.hidden = true; b.dataset.dialog = 'sim.helpDlg'; document.body.appendChild(b); b.click(); b.remove(); };
  const setScenario = id => { for (const x of SCENARIOS) notices?.dismiss('al-' + x.id); notices?.dismiss('al-gpu'); /* a new run starts without the last run's notices */ REP.reset(); st.sid = id; try { localStorage.setItem('sim:sid', id); } catch { /* storage unavailable */ } S = fresh(); E.bind(S); ctx.update(); };

  const page = {
    css: `body { background: var(--background); }
.sim { word-break: keep-all; display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100vh; }
.sim-ctl { display: flex; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; white-space: nowrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-2) var(--space-4); border-bottom: var(--line) dashed var(--border-surface); background: color-mix(in oklab, var(--brand-content) 6%, var(--background)); }
.sim-ctl-l { font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--brand-content); }
.sim-note { font-size: var(--text-xs); color: var(--muted-foreground); }
.sim-frame { display: grid; min-height: 0; grid-template-columns: var(--sidebar-w) minmax(0, 1fr); }
.sim-panes { display: flex; min-width: 0; min-height: 0; }
.sim-panes > section { min-width: 0; } .sim-panes > section:nth-of-type(1) { flex: var(--w0, 1) 1 0; } .sim-panes > section:nth-of-type(2) { flex: var(--w1, 1) 1 0; } .sim-panes > section:nth-of-type(3) { flex: var(--w2, 1) 1 0; }
.sim-stack { display: flex; flex-direction: column; min-height: 0; overflow: hidden; } .sim-stack > .sim-detail, .sim-stack > .sim-ai { flex: 1 1 auto; min-height: 0; overflow: auto; } .sim-stack-t { padding: var(--space-2) var(--space-4) 0; }
.sim-gap { flex: 0 0 var(--space-2); cursor: col-resize; touch-action: none; } .sim-gap:hover, .sim-panes.dragging .sim-gap { background: var(--border-surface); }
.sim-detail, .sim-ai { animation: sim-pane-in var(--dur-flow-reveal) var(--ease-standard) both; } /* a pane comes in from the side it opens on */
@keyframes sim-pane-in { from { opacity: 0; transform: translateX(var(--space-4)); } }
.dt-back { display: flex; align-items: center; justify-content: space-between; min-height: var(--control-h-sm); }
.sim-frame > *, .sim-panes > section { min-height: 0; overflow: auto; } .sim-panes { overflow: hidden; }
.sim-side { padding: var(--space-3) var(--space-2); display: grid; align-content: start; gap: var(--space-0_5); background: var(--window, var(--background)); border-right: var(--line) solid var(--border-surface); }
.sb-h { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-2) var(--space-3); }
.sb-l { padding: var(--space-3) var(--space-2) var(--space-1); font-size: var(--text-xs); color: var(--muted-foreground); }
.sb-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-m { font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.sim-body > * { width: 100%; max-width: var(--sim-measure); justify-self: center; } /* the body column stops widening at a reading width and stays centred */
.sim { --sim-measure: calc(var(--space-16) * 15); }
.sim:has(.sim-detail) .sim-body, .sim:has(.sim-ai) .sim-body { --dt-flex-min: calc(var(--space-40) * 1.1); } /* with a pane open the list column is narrow: its flexible column may shrink further */
.sim-body, .sim-detail, .sim-ai { padding: var(--space-4) var(--space-5) var(--space-16); display: grid; grid-auto-rows: max-content; align-content: start; gap: var(--space-4); }
.sim-detail, .sim-ai { border-left: var(--line) solid var(--border-surface); }
.ws-head { display: grid; gap: var(--space-2); }
.ws-m { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-4); font-size: var(--text-sm); color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.ws-a { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); min-width: 0; } .ws-a > :first-child { flex: 0 1 auto; min-width: calc(var(--space-40) * 0.9); } .ws-acts { display: inline-flex; gap: var(--space-1); margin-left: auto; } /* the page's toolbar: search at its left end, the page actions at its right */

.ws-rule { font-size: var(--text-xs); } .ws-before { margin-bottom: var(--space-3); font-size: var(--text-xs); } .ws-mem { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); }
.ws-steps { display: grid; } .ws-note { font-size: var(--text-xs); color: var(--muted-foreground); }
.ws-follow { margin-top: var(--space-2); }
.ws-focus { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); font-size: var(--text-sm); min-width: 0; } .ws-focus > span { display: inline-flex; align-items: center; min-width: 0; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .ws-focus em { font-style: normal; color: var(--muted-foreground); font-size: var(--text-xs); margin-right: var(--space-1_5); } .ai-warn { padding-inline: var(--space-1); }
.dt-p { margin: 0; font-size: var(--text-sm); color: var(--muted-foreground); }
.sim-detail .ph { flex-wrap: nowrap; } .sim-detail .ph-ctx { flex: 1 1 0; } .sim-detail .ph.ctx .ph-title { flex-shrink: 1; } .sim-detail .ph > :is(.sti, .sti-text) { flex: none; } .sim-detail .ph-title { min-width: var(--space-16); } /* the state word stays whole; the name and the context give way */ .sim-detail .ph-end { flex: none; flex-wrap: nowrap; } /* a detail head is one line: the context gives way first, the action keeps its place at the end */
.sbar-body .card.widget .card-big { display: none; } /* an opened card's chart: the bar's head already reads its value */
.dt-acts { display: flex; gap: var(--space-2); }
.sim-ai { overflow-x: hidden; } .sim-ai * { min-width: 0; } .sim-ai :is(.ai-who, .ai-blk, .v-stale) span { overflow-wrap: break-word; } /* nothing in the pane runs past its edge: words wrap, at their spaces */
.sim-ai { word-break: keep-all; } .sim-ai :is(.cb, code, pre) { word-break: normal; } /* Korean breaks between words, never inside one ("로그 보여 줘" stays whole) */
.ai-ub > * { justify-self: stretch; } .ai-op .sbar-item.wrap > :is(.sbar-n, b) { display: block; -webkit-line-clamp: unset; overflow: visible; } /* the AI's opinion is read whole in its head, never cut to an ellipsis */ .sim-ai .ai-blk.ai-ub > * { justify-self: stretch; } /* the bubble's row spans the pane, so a bubble is as wide as its words (up to the kit's share), never squeezed to a sliver */
.sim-ai .sr-meta { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } /* a step's result gives way in a narrow pane (kit sr-meta does not shrink) */
.ai-blk { display: grid; gap: var(--space-2); } .ai-blk > * { justify-self: start; } .ai-blk > .sbar, .ai-blk > .ah, .ai-blk > .qp-wrap { justify-self: stretch; }
.ai-who { display: flex; flex-wrap: nowrap; align-items: center; gap: var(--space-2); min-width: 0; font-size: var(--text-sm); color: var(--muted-foreground); white-space: nowrap; } .ai-who > * { flex: none; } .ai-who > time { font-variant-numeric: tabular-nums; } .sim-ai .ai-who > .ai-x { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--foreground); } .ai-blk:has(> .ai-who) > .ai-who { justify-self: stretch; } .ai-l { font-size: var(--text-xs); color: var(--muted-foreground); } .ai-cnt { font-size: var(--text-xs); color: var(--muted-foreground); }
.ai-skill { gap: var(--space-0_5); } .ai-skill .sg-fold { padding-bottom: 0; } .ai-skill .sg-inner { padding: var(--space-1) 0 0; }
.sim-ai .sr { padding-bottom: 0; } .sim-ai .sr-mark::after { display: none; } /* reads sit one per line with no gap and no joining line: a short list, not a timeline */
.ai-dst { display: flex; flex-wrap: nowrap; align-items: center; gap: var(--space-1_5); min-width: 0; font-size: var(--text-xs); color: var(--muted-foreground); padding-top: var(--space-3); border-top: var(--line) solid var(--border-surface); white-space: nowrap; } .ai-dst > :is(svg, .icon) { flex: none; }
.ai-dst > span { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; } .ai-dst > span:is(:first-of-type, :last-of-type) { flex: none; } /* the permission and the effort stay whole; the scope and the model give way */ .ai-dst > span + span::before { content: '·'; margin-inline-end: var(--space-1_5); } /* one line in four slots (permission · scope · model · effort): a narrow pane shortens them, never wraps */
@media print { .sim-ctl, .sim-side, .sim-ai, .sim-detail, .ws-a { display: none !important; } .sim, .sim-frame { display: block; height: auto; } .sim-frame > *, .sim-panes > section { overflow: visible; } .sim-panes { display: block; } body { background: #fff; color: #000; } .sbar::details-content { block-size: auto; opacity: 1; content-visibility: visible; } }
${partsCss}
${V.css}
${R.css}
.sim-body { container: simbody / inline-size; }
.ai-msg .dt-p { color: var(--foreground); }
/* the AI pane: its head, the conversation that scrolls, then the composer and the scope line, which stay in their place under it (nothing scrolls under the composer) */
.sim-panes > section.sim-ai, .sim-stack > .sim-ai { display: flex; flex-direction: column; gap: var(--space-2); overflow: hidden; padding-bottom: var(--space-4); }
.sim-ai > .ai-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; display: grid; grid-auto-rows: max-content; align-content: start; gap: var(--space-4); margin-inline: calc(-1 * var(--space-5)); padding: var(--space-1) var(--space-5) var(--space-4); scrollbar-gutter: stable; }
.sim-ai > .ai-scroll { flex-basis: 0; min-height: var(--space-16); }
.sim-ai > .dt-back { flex: none; } .ai-ask { flex: none; display: grid; gap: var(--space-2); padding-block: var(--space-2) var(--space-3); } .sim-ai > .ai-dst { flex: none; }
.ai-pin { flex: 0 1 auto; min-height: 0; display: flex; flex-direction: column; margin-inline: calc(-1 * var(--space-4)); } .ai-pin > .qp-wrap { display: flex; flex-direction: column; min-height: 0; padding-bottom: 0; }
.ai-pin .qp { min-height: 0; } .ai-pin .qp-top, .ai-pin .qp-list { flex: none; } .ai-pin .qp-list { max-height: none; overflow: visible; } .ai-pin .qp-detail { flex: 0 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; } /* the question and its two choices always show; only the detail (diff, command) scrolls */
.ai-pin .cb pre, .ai-pin .cb-body { overflow-x: auto; } .ai-pin .cb :is(pre, code, .cb-line) { white-space: pre; } /* a command is never cut: it scrolls sideways inside its code view */
.rp-state { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1_5) var(--space-2); min-width: 0; } .rp-state > .ai-l { margin-inline-end: var(--space-1); } .rp-state-end { margin-inline-start: auto; }

.sim-nav { min-width: 0; max-width: 100%; overflow-x: auto; scrollbar-width: none; } .sim-nav::-webkit-scrollbar { display: none; }
.sim-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); }
.sim-crumb { display: inline-flex; align-items: center; gap: var(--space-1_5); font-size: var(--text-sm); color: var(--muted-foreground); min-width: 0; white-space: nowrap; } .sim-crumb > * { flex: none; } .sim-crumb > :last-child { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; } /* one line: the last part gives way */ .sim-crumb b { color: var(--foreground); font-weight: var(--weight-medium); }
.sb-r { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: var(--space-2); min-width: 0; height: var(--control-h); padding: 0 var(--space-2); border-radius: var(--r-control); font-size: var(--text-sm); cursor: pointer; } .sb-r:hover { background: var(--accent); } .sb-r[data-active] { background: var(--accent); } .sb-r:focus-visible { box-shadow: 0 0 0 var(--focus-w) var(--focus-soft); }
.sim-detail .rc-kv dd, .sim-stack .rc-kv dd { white-space: normal; overflow: visible; overflow-wrap: break-word; word-break: keep-all; } /* the report pane's key values are read whole: a long one runs on to a second line, never cut */
.ws-flow { display: grid; gap: var(--space-2); margin-top: var(--space-4); }`,
    render: () => {
      /* while an approval is open the AI pane gets the room to read the diff: on a narrow window the detail pane steps aside until it is answered */
      const asking = !!S.approval && S.aiOpen, narrow = typeof window !== 'undefined' && window.innerWidth < 1440;
      let d = asking && narrow ? '' : S.report?.open ? reportPane() : detail(), a = ai();
      /* below 1440 the detail pane and the AI pane share one column as two tabs (the one opened last in front): three columns do not fit */
      if (narrow && d && a) { const front = S.paneTab ?? 'detail'; const tabs = C.pillTabs.render({ id: 'sim-pane', label: t('sim.app.pane.label'), value: front, tabs: [{ id: 'detail', label: S.report?.open ? t('sim.app.pane.report') : t('sim.app.pane.detail') }, { id: 'ai', label: t('sim.ai.title') }], action: 'sim.paneTab' });
        d = html`<section class="sim-stack"><div class="sim-stack-t">${tabs}</div>${front === 'ai' ? a : d}</section>`; a = ''; }
      const rp = S.report?.open && d ? 'r' : '', sig = `m${d ? 'd' : ''}${a ? 'a' : ''}${asking ? 'q' : ''}${rp}`, base = { m: [1], md: [.54, .46], ma: [.6, .4], mda: [.42, .33, .25], maq: [.42, .58], mdaq: [.36, .24, .4], mq: [1], mdq: [.54, .46], mdr: [.55, .45], mdar: [.4, .36, .24], mdaqr: [.3, .3, .4], mdqr: [.44, .56] }[sig] ?? [1], wts = S.splitW?.[sig] ?? base;
      /* the body, detail and AI panes share the room by the gap between them (drag a gap to resize); the shares stay per layout */
      const style = wts.map((x, i) => `--w${i}:${x}`).join(';');
      return html`<div class="sim">${controls()}<div class="sim-frame">${sidebar()}<div class="sim-panes" data-split="${sig}" style="${style}">${main()}${d ? html`<div class="sim-gap" data-split-handle="0"></div>${d}` : ''}${a ? html`<div class="sim-gap" data-split-handle="${d ? 1 : 0}"></div>${a}` : ''}</div></div></div>`; },
    meta: () => ({ title: t('sim.app.page.title'), icon: 'bell' }),
    menus: {
      'sim.scKindMenu': () => V.kindMenu(),
      'sim.actMenu': key => { const r = V.findResource(String(key)); return { items: (r ? actionsFor(r, W()) : []).map(x => ({ id: x.id, label: x.label, action: 'sim.plan', arg: { key: String(key), id: x.id } })) }; },
      'sim.copyCmd': a => { const p = W().pods.find(x => `${x.ns}/${x.name}` === a.pod), c = p && containersOf(p).find(x => x.name === a.c); return { items: c ? copyCommands(p, c).map(x => ({ id: x.id, label: x.label, icon: 'copy', action: 'sim.copy', arg: x.cmd })) : [] }; },
      'sim.nsMulti': () => V.nsMenu(), /* one namespace scope on every page: the same multi-select menu as the kinds */
      'sim.podNodeMenu': () => C.select.menuDef({ key: 'pn', value: S.podNode ?? 'all', options: [{ id: 'all', label: t('sim.app.menu.allNodes') }, ...W().nodes.map(n => ({ id: n.name, label: `${n.name} · Pod ${n.pods}` }))], action: 'sim.pickPodNode' }),
      'sim.podOwnerMenu': () => { const m = new Map(); for (const p of W().pods) if (!S.nsMulti?.length || S.nsMulti.includes(p.ns)) { const k = `${p.owner?.kind}/${p.owner?.name}`; m.set(k, (m.get(k) ?? 0) + 1); } return C.select.menuDef({ key: 'po', value: S.podOwner ?? 'all', options: [{ id: 'all', label: t('sim.app.menu.allOwners') }, ...[...m].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([id, n]) => ({ id, label: `${id} · ${n}` }))], action: 'sim.pickPodOwner' }); },
      'rep.export': () => ({ items: [{ id: 'pdf', label: t('sim.app.rep.pdf'), icon: 'download', action: 'rep.save', arg: 'pdf' }, { id: 'md', label: 'Markdown(.md)', icon: 'file-text', action: 'rep.save', arg: 'md' }, { id: 'chat', label: t('sim.app.rep.channel'), icon: 'copy', action: 'rep.save', arg: 'chat' }] }), 'sim.logAroundMenu': () => C.select.menuDef({ key: 'around', value: String(S.logAround ?? 2), options: [0, 2, 5].map(n => ({ id: String(n), label: n ? t('sim.app.menu.around', { n }) : t('sim.app.menu.matchOnly') })), action: 'sim.pickAround' }), 'sim.export': () => P.exportMenuDef('sim.export'),
      'sim.alertMenu': name => ({ items: [{ id: 'mute', label: t('sim.app.menu.silence'), action: 'sim.mute', arg: name }, { id: 'list', label: t('sim.app.menu.inAlerts'), icon: 'bell', action: 'sim.go', arg: { page: 'alerts' } }] }),
      'sim.stMenu': () => { const n = new Map(); for (const p of W().pods) { const k = podStatus(p); n.set(k, (n.get(k) ?? 0) + 1); } return C.select.menuDef({ key: 'st', value: S.st, options: [{ id: 'all', label: t('sim.app.menu.allStates') }, ...[...n].sort((a, b) => b[1] - a[1]).map(([id, c]) => ({ id, label: `${id} · ${c.toLocaleString()}` }))], action: 'sim.pickSt' }); },
      /* the pods a log is read from: the ones with trouble first, then the busiest ones (a short list; search finds the rest in the resource view) */
      'sim.logPod': () => { const w = W(), inScope = V.scopePods(); const list = inScope ? [...inScope.filter(p => p.status[0] !== 'ok'), ...inScope.filter(p => p.status[0] === 'ok')].slice(0, 40) : [...w.problems, ...w.pods.filter(p => p.status[0] === 'ok' && /api|gateway|payments|checkout/.test(p.owner.name)).slice(0, 14)]; /* the scope's Pods when one is set */ return C.select.menuDef({ key: 'pod', value: S.logPod ?? '', options: list.map(p => ({ id: p.ns + '/' + p.name, label: p.name, group: p.status[0] === 'ok' ? t('sim.app.menu.busyPods') : t('sim.app.menu.problemPods') })), action: 'sim.pickPod' }); } },
    dialogs: {
      ...SET.dialogs,
      /* the help: what each key does where (the incident work surface), and where the rest is found */
      'sim.helpDlg': () => ({ title: { raw: t('sim.app.help.title') }, size: 'md', submit: null, /* a list to read: one close button */ body: C.dataTable.render({ clip: true, rowKey: 'id', rows: KEYS.flatMap(([g, ks]) => ks.map(([k, d], i) => ({ id: g + k, g: i ? '' : g, k, d }))), columns: [{ id: 'g', label: t('sim.app.help.group'), width: 'calc(var(--space-16) * 1.2)', muted: true }, { id: 'k', label: t('sim.app.help.key'), width: 'var(--space-16)', cell: x => C.kbd.render({ keys: [x.k] }) }, { id: 'd', label: t('sim.app.help.does') }] }) }), /* one table: the group named on its first row, one head */
      'sim.exportDlg': fmt => { const s = sc(); return P.exportDialog({ format: fmt, redactions: s.redactions ?? [], save: 'sim.save', basis: [{ label: t('sim.app.exportDlg.cluster'), value: s.cluster }, { label: t('sim.app.exportDlg.incident'), value: s.title }, { label: t('sim.app.exportDlg.at'), value: hms(S.t) }, ...(s.rule ? [{ label: t('sim.app.exportDlg.rule'), value: `${s.rule.name} ${s.rule.version}` }] : []), ...(s.skill ? [{ label: t('sim.app.exportDlg.skill'), value: `${s.skill.id} ${s.skill.version}` }] : [])] }); },
    },
    actions: {
      'sim.noop': () => {},
      ...SET.actions,
      ...setters(() => S, () => ctx.update()), /* the state-setting actions of every screen (sim-screens.js) */
      'sim.aiRow': a => { const id = String(a.arg?.value ?? a.arg); S.sel = { type: 'ailog', id, row: V.aiLogRow(id) }; S.paneTab = 'detail'; ctx.update(); },
      'sim.ask': a => ask(String(a.arg?.value ?? a.arg)),
      'kit.composer.send': a => { if (a.id === 'sim-ask') ask(String(a.text ?? '')); if (a.id === 'sim-scope.' + S.view) { S[scopeKey(S.view)] = String(a.text ?? ''); Object.assign(S, SCOPE_PAGES); ctx.update(); } }, /* the scope box runs its text on the view in sight (its own text: another view keeps its own) */
      ...Object.fromEntries(['inc', 'home'].map(id => ['sim.tlWin.' + id, a => { S.tlWin = { ...(S.tlWin ?? {}), [id]: a.source === 'reset' || a.from == null ? null : { from: a.from, to: a.to } }; ctx.update(); }])),
      'sim.help': () => openHelp(),
      'sim.plan': a => { const g = a.arg?.value ?? a.arg, r = V.findResource(g.key), x = r && actionsFor(r, W()).find(y => y.id === g.id); if (!x) return;
        /* the incident's own choice is approved where the incident approves it (its Draft PR question), never as a second, different command */
        if (x.source === 'incident' && incidentOpen() && optionsNow().some(o => o.id === x.id && !o.disabled)) { S.chosen = x.id; S.approval = true; S.approvalDenied = false; S.aiOpen = true; S.paneTab = 'ai'; ctx.update(); return; }
        S.plan = { ...x, target: Array.isArray(x.target) ? x.target.slice(1).join(' · ') : `${r.kind} ${r.ns ? r.ns + '/' : ''}${r.name}`, ns: r.ns, at: S.t, inc: incidentOpen() ? alertText(st.sid)?.incident : null }; note(t('sim.app.note.planOpened', { label: x.label })); S.aiOpen = true; S.paneTab = 'ai'; ctx.update(); },
      'sim.copy': a => { const v = String(a.arg?.value ?? a.arg); navigator.clipboard?.writeText(v).catch(() => {}); copied(v.slice(0, 60)); },
      'sim.logTs': () => { S.logTs = S.logTs === false; ctx.update(); },
      'sim.logWrap': () => { S.logWrap = S.logWrap === false; ctx.update(); },
      'sim.logDl': a => { const lines = [...document.querySelectorAll('.v-logw .v-log-l')].map(l => [l.querySelector('.v-log-at')?.textContent, l.querySelector('.v-log-lv')?.textContent, l.querySelector('.v-log-tx')?.textContent].join(' ')), masked = lines.map(mask); saveFile(masked.join('\n') + '\n', 'text/plain', `${a.arg?.value ?? a.arg}-logs.txt`); note(t('sim.app.note.logsSaved', { n: lines.length })); },
      'sim.gs': a => { S.gs = String(a.value ?? a.arg?.value ?? a.arg ?? ''); S.view = 'search'; S.sel = null; ctx.update(); }, /* a list's "다른 종류에서" row: the cluster-wide find of that name */
      'sim.cOpen': a => { const id = String(a.arg?.value ?? a.arg); S.cOpen = S.cOpen === id ? null : id; ctx.update(); },
      'sim.appFile': a => { S.appFile = String(a.arg?.value ?? a.arg); ctx.update(); }, /* the changed file shown beside the tree of an Application's last change */
      'sim.pickNsMulti': a => { S.nsMulti = toggled(a, W().namespaces, S.nsMulti); S.ns = S.nsMulti?.length === 1 ? S.nsMulti[0] : 'all'; Object.assign(S, SCOPE_RESET); ctx.update(); }, /* one chosen also names it as the scope (S.ns) */
      'sim.pickKinds': a => { S.scKind = toggled(a, KINDS.map(([k]) => k), S.scKind); Object.assign(S, SCOPE_RESET); ctx.update(); }, /* the relation set is the union of the kinds chosen */
      'sim.pickPodNode': a => { const v = String(a.arg?.value ?? a.arg); S.podNode = v === 'all' ? null : v; S.pg = 1; ctx.update(); },
      'sim.pickPodOwner': a => { const v = String(a.arg?.value ?? a.arg); S.podOwner = v === 'all' ? null : v; S.pg = 1; ctx.update(); },
      'rep.start': a => { REP.reset(); S.report = { open: true, streaming: true, head: R.head(), queue: R.script(), log: [], follows: [], asked: S.t, seq: 0, stopped: null, fromChat: !!a?.fromChat }; S.aiOpen = true; S.sel = null; S.paneTab = 'detail'; ctx.update(); stream(); },
      'rep.regen': () => { const r = S.report; if (!r) return; REP.reset(); Object.assign(r, { head: R.head(), queue: R.script(), log: [], follows: [], streaming: true, stopped: null }); ctx.update(); stream(); },
      'rep.stop': () => { const r = S.report; if (r?.streaming) { r.streaming = false; r.stopped = t('sim.app.rep.stopPressed'); ctx.update(); } },
      'rep.resume': () => { const r = S.report; if (r && r.queue.length) { r.streaming = true; r.stopped = null; ctx.update(); stream(); } },
      'rep.close': () => { if (S.report) { S.report.open = false; S.report.streaming = false; if (S.report.queue.length) S.report.stopped = t('sim.app.rep.closed'); } ctx.update(); },
      'rep.open': () => { if (S.report) { S.report.open = true; S.sel = null; S.paneTab = 'detail'; } ctx.update(); },
      'rep.driveDrop': a => { const d = S.aiDrive, c = d?.chips[Number(a.arg?.value ?? a.arg)]; if (!c) return; for (const k of c.keys) S[k] = d.before[k]; d.chips = d.chips.filter(x => x !== c); if (!d.chips.length) S.aiDrive = null; syncScope(); ctx.update(); },
      'rep.canvas': async a => {
        const p = a?.arg?.type ? a.arg : a, r = S.report; if (!r) return;
        if (p.type === 'delete') { const n = REP.state.selected.length; if (!n) return; const op = deleteSelectedOp(REP.state), root = document.querySelector('.sim-report'); if (root && !reduced()) await C.reportCanvas.play(root, REP.state, op); REP.apply(op); r.log.push({ say: t('sim.app.rep.deleted', { n }), at: S.t }); ctx.update(); return; }
        if (p.type === 'move') { C.reportCanvas.handle(REP, p); r.log.push({ say: t('sim.app.rep.moved'), at: S.t }); ctx.update(); return; }
        const res = C.reportCanvas.handle(REP, a);
        if (p.type === 'undo') r.log.push({ say: t('sim.app.rep.undone'), at: S.t });
        if (res.refer?.length) { r.follows.push({ at: S.t, items: res.refer }); r.queue.push(...R.follow(REP.state, res.refer, ++r.seq)); REP.select(s0 => ({ ...s0, selected: [] })); r.streaming = true; r.stopped = null; S.aiOpen = true; ctx.update(); stream(); return; }
        ctx.update();
      },
      'rep.save': a => { const fmt = String(a.arg?.value ?? a.arg);
        if (fmt === 'pdf') { printReport(); return; }
        if (fmt === 'chat') { navigator.clipboard?.writeText(R.channel()).catch(() => {}); note(t('sim.app.rep.channelCopied')); return; }
        saveFile(R.markdown(REP.state, S.report.head), 'text/markdown', `${alertText(st.sid)?.incident ?? sc().id}-report.md`); note(t('sim.app.rep.saved')); },
      'sim.scenario': a => setScenario(String(a.arg?.value ?? a.arg)),
      'sim.logPrev': a => { S.logPrev = String(a.arg?.value ?? a.arg) === 'prev'; S.logPage = null; ctx.update(); },
      'sim.speed': a => { st.speed = Number(a.arg?.value ?? a.arg); ctx.update(); },
      'sim.theme': a => { document.documentElement.dataset.theme = String(a.arg?.value ?? a.arg); ctx.update(); },
      'sim.reset': () => setScenario(st.sid),
      /* the bar also reports opening and closing that a redraw did (a stage that became active or done): only a press that differs from the stage's own default is kept */
      'sim.stage': a => { const def = stageState(a.arg) === 'active', v = a.open ?? !(S.open[a.arg] ?? def); if (v === def) delete S.open[a.arg]; else S.open[a.arg] = v; ctx.update(); },
      'sim.sec': a => { const id = a.arg?.id, def = stageState(id) === 'active', v = a.open ?? !(S.open[id] ?? def); if (v === def) delete S.open[id]; else S.open[id] = v; ctx.update(); },
      'sim.openAi': () => { S.aiOpen = true; S.paneTab = 'ai'; ctx.update(); },
      'sim.closeAi': () => { S.aiOpen = false; ctx.update(); },
      'sim.closeDetail': () => { S.sel = null; S.selPrev = null; ctx.update(); },
      'sim.card': a => { S.cardOpen = a.open ?? !S.cardOpen; ctx.update(); },
      'sim.row': a => { const id = String(a.arg?.value ?? a.arg); S.row = Math.max(0, sc().scope.findIndex(r => r.name === id)); const k = resKey(id, sc().scope[S.row]?.kind); if (k) select({ type: 'resource', key: k }); },
      /* app navigation: a view, with what it should open filtered to */
      /* a zoom or pan on one chart of a group moves every chart of that group; a double click (reset) gives the whole range back */
      /* a window marked on a chart or a timeline is that view's custom range (the time-range pill shows it); a reset goes back to the preset */
      'sim.zoom': a => { const key = String(a.id ?? '').split(':')[0]; if (!key || !(key in S)) return; S[key] = a.source === 'reset' ? fresh()[key] : { from: a.from - T0, to: a.to - T0, live: false }; ctx.update(); },
      'sim.mute': a => note(t('sim.app.note.muted', { name: a.arg?.value ?? a.arg, until: hm(S.t + 1800) })),
      ...Object.fromEntries(RANGE_KEYS.map(key => ['sim.r.' + key, a => { S[key] = a.preset ? String(PRESET_SEC[a.preset] ?? a.preset) : a.from != null ? { from: a.from - T0, to: a.to - T0, live: !!a.live } : fresh()[key]; if (key === 'logRange') S.logPage = null; if (key === 'evRange') S.evPage = 1; if (key === 'alRange') S.alPage = 1; ctx.update(); }])),
      'sim.metric': a => { S.view = 'metric'; S.metric = String(a.arg?.value ?? a.arg); ctx.update(); document.querySelector('.sim-body')?.scrollTo({ top: 0 }); },
      'sim.nav': a => { S.view = String(a.arg?.value ?? a.arg); ctx.update(); },
      'sim.go': a => { const g = a.arg?.value ?? a.arg ?? {}; if (g.page && g.page !== S.view && !g.keep) { S.sel = null; S.selPrev = null; } /* another page is another context: the pane opened for the last one closes */ S.view = g.page ?? S.view; if (g.kind) { S.scKind = [g.kind]; S.pg = 1; S.st = g.st ?? 'all'; } if (g.only) S.only = g.only; if (g.ns) scopeNs(g.ns); if (g.q != null && g.page === 'resources') scopeText(g.q); if (g.type) S.evType = g.type; if (g.reason != null) { S.evReason = g.reason; S.evGroup = 'list'; S.evPage = 1; } if (g.pod) { S.logPod = g.pod; S.logPage = null; S.logPrev = g.prev ?? null; } if (g.q != null && g.page === 'logs') { scopeText(g.q); S.logContext = true; } if (g.tool) S.sel = { type: 'tool', id: g.tool }; if (g.page === 'agent') S.sel = { type: 'tool', id: 'agent' }; if (g.page === 'incident') { S.seen = true; } if (g.days) S.incRange = { from: S.t - g.days * 86400, to: S.t, live: true }; /* the home's count and the list read the same window */ ctx.update(); document.querySelector('.sim-body')?.scrollTo({ top: 0 }); },
      'sim.openRow': a => { const k = String(a.arg?.id ?? a.arg?.value ?? a.arg); select({ type: 'resource', key: k, ...(a.arg?.tab ? { tab: a.arg.tab, focus: { tab: a.arg.tab } } : {}) }); },
      'sim.toolOpen': a => select({ type: 'tool', id: String(a.arg?.value ?? a.arg) }),
      'sim.flowGo': a => { const g = a.arg?.value ?? a.arg ?? {}; if (g.sel) select({ type: 'resource', key: g.sel }); else { S.view = g.page ?? 'resources'; if (g.kind) S.scKind = [g.kind]; if (g.ns) scopeNs(g.ns); if (g.q) scopeText(g.q); S.pg = 1; ctx.update(); } },
      'sim.bar': a => { const id = a.arg?.value ?? a.arg; S.bars[id] = a.open ?? !S.bars[id]; ctx.update(); },
      'sim.logContext': a => { S.logContext = (a.arg?.value ?? a.arg) === 'only'; S.logPage = null; ctx.update(); },
      'sim.evReasonRow': a => { const id = String(a.arg?.value ?? a.arg); S.evReason = id.split('|')[1]; S.evType = id.split('|')[0]; S.evGroup = 'list'; S.evPage = 1; ctx.update(); },
      /* an event opens its object; an object that is gone now (a replaced pod, a finished job) opens what owns it */
      'sim.openEvent': a => { select({ type: 'event', id: String(a.arg?.value ?? a.arg) }); },
      'sim.openEventObject': a => { const [, kind, name, , okind, oname] = String(a.arg?.value ?? a.arg).split('|'), k = resKey(name, kind) ?? (oname ? resKey(oname, okind) : null); if (k) select({ type: 'resource', key: k }); else note(t('sim.app.note.gone', { kind, name })); },
      'sim.openAlert': a => { const id = String(a.arg?.value ?? a.arg); select({ type: 'alert', id }); const w = V.alertWindow(id); if (w) { S.detailRange = w; ctx.update(); } }, /* the chart follows the detail range, set around the alert's active span */
      'sim.past': a => select({ type: 'past', id: String(a.arg?.value ?? a.arg) }),
      'sim.homeChange': a => select({ type: 'change', id: String(a.arg?.value ?? a.arg) }),
      'sim.cluster': a => { S.cid = String(a.arg?.value ?? a.arg); S.view = 'home'; S.sel = null; S.ns = 'all'; S.nsMulti = null; S.logPod = null; ctx.update(); }, /* another cluster has its own namespaces and Pods: the kind and the text stay */
      'sim.conn': a => { const v = String(a.arg?.value ?? a.arg); if (v === 'tools-down' && S.conn !== 'tools-down') S.toolsDownAt = S.t; if (v === 'agent-down' && S.conn !== 'agent-down') S.agentDownAt = S.t; if (v !== 'agent-down') S.agentDownAt = null; S.conn = v; ctx.update(); },
      'sim.costs': () => note(t('sim.app.note.costs')),
      'sim.toolCheck': a => { const x = W().tools.find(y => y.id === a.arg) ?? (a.arg === 'wake-agent' ? W().agent : null); note(t('sim.app.note.recheck', { tool: x?.name ?? a.arg, ms: x?.latencyMs ?? '' })); }, /* the latency the tool record holds */
      'sim.toolConnect': a => note(t('sim.app.note.connectAt', { tool: a.arg })),
      'sim.change': a => select({ type: 'change', id: String(a.arg?.value ?? a.arg) }),
      'sim.ref': a => select({ type: 'evidence', id: Number(a.arg?.value ?? a.arg) }),
      'sim.memory': () => select({ type: 'memory', id: 'mem' }),
      'sim.back': () => { const p = S.selPrev; S.selPrev = null; S.sel = p; if (p?.type === 'resource') { S.dtab = p.tab ?? 'overview'; S.focus = p.focus ?? {}; } ctx.update(); },
      'sim.focus': a => { const id = String(a.arg?.value ?? a.arg); S.cardOpen = true; S.open[id] = true; ctx.update(); scrollTo(id); },
      'sim.dtab': a => { S.dtab = String(a.arg?.value ?? a.arg); if (S.focus?.tab !== S.dtab) S.focus = {}; ctx.update(); },
      'sim.unfocus': () => { S.focus = {}; S.detailRange = fresh().detailRange; ctx.update(); },
      'kit.steps.toggle': a => { if (a.id === 'sim-rep') S.repStepsOpen = !!a.open; else S.stepsOpen = !!a.open; },
      'sim.chain': a => { S.aiChainOpen = a.open ?? !S.aiChainOpen; ctx.update(); },
      'sim.adopt': () => { S.adoptedAlt = true; note(t('sim.app.note.adopted')); },
      'sim.choose': a => { const id = String(a.arg?.value ?? a.arg); if (optionsNow().find(o => o.id === id)?.disabled) return; S.chosen = id; S.approval = true; S.approvalDenied = false; S.aiOpen = true; S.paneTab = 'ai'; ctx.update(); },
      'kit.question.choose': a => { if (a.id === 'sim-plan') { const p = S.plan; S.plan = null; if (!p) return; S.planLog = [...(S.planLog ?? []), { ...p, at: S.t, kind: a.choice === 'allow' ? 'approve' : 'deny' }]; if (a.choice === 'allow') setTimeout(() => { S.planLog = [...S.planLog, { ...p, at: S.t, kind: 'run', result: p.out }]; ctx.update(); }, 1500); ctx.update(); return; }
        S.approval = false; if (a.choice === 'allow') E.approve(S.chosen); /* the engine: the approval at a person's own time (after the ack and reading the judgement), a new attempt */ else S.approvalDenied = true; ctx.update(); },
      'kit.question.cancel': a => { if (a?.id === 'sim-plan') { S.plan = null; ctx.update(); return; } S.approval = false; S.approvalDenied = true; ctx.update(); },
      'sim.merge': () => { if (E.merge()) ctx.update(); }, /* the engine: ready for review → the reviewer approves → the reviewer merges, each at its own time */
      'sim.retryPr': () => { if (phase() !== 'pr-failed' || down('github')) return; S.prFailed = null; S.prRequestAt = S.t; ctx.update(); }, /* the PR is made again; its creation is recorded when it happens */
      'sim.reverify': () => { if (phase() !== 'inconclusive' || verifyBlind()) return; S.verifyFrom = S.t; S.downWins = []; S.inconclusiveAt = null; S.history.push({ at: S.t, kind: 'reverify', text: t('sim.app.hist.reverify') }); ctx.update(); },
      'sim.manualSync': () => { if (S.manualSync) return; S.manualSync = true; S.history.push({ at: S.t, kind: 'manual', attempt: S.attempt, text: t('sim.app.hist.manualSync', { target: targetOf(optOf())[2] ?? '' }) }); ctx.update(); },
      'sim.done': () => { if (E.done()) ctx.update(); }, /* the engine: request → the team runs it → its effect observed → marked done */
      'sim.fail': () => { S.failInjected = true; note(t('sim.app.note.failInjected', { label: sc().verify[0].label, n: FAIL_WINDOW + 1 })); },
      'sim.export': a => { const b = document.createElement('button'); b.hidden = true; b.dataset.dialog = 'sim.exportDlg'; b.dataset.dialogArg = JSON.stringify(a.arg); document.body.appendChild(b); b.click(); b.remove(); },
      'sim.save': a => download(String(a.arg?.value ?? a.arg)),
      'sim.openUrl': a => { const u = String(a.arg?.value ?? a.arg ?? ''); if (/^https:\/\//.test(u)) window.open(u, '_blank', 'noopener'); }, /* a record's PR or ticket opens where it lives */
      'sim.copyLink': () => { const l = E.links(); navigator.clipboard?.writeText(l ? l.incident : '').catch(() => {}); copied(l ? l.incident : ''); }, /* the web address anyone can open (the app path is beside it in the links) */
    },
  };
  return page;
});
