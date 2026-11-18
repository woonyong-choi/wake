/*
 * 시뮬레이션의 앱 화면들: 홈, 리소스, 리소스 상세, 이벤트, 로그, 알림, 인시던트 목록, 설정(도구 · 에이전트), 근거 보기(로그 · 지표 · YAML).
 * 화면은 kit 구성 요소만으로 그리고, 자료는 sim-world.js의 세계 하나에서 읽는다. 상태(S)와 동작 이름은 sim.js가 갖는다.
 * 면 규칙: 페이지에 놓이는 면은 요약 막대(summary-bar)와 그래프 카드뿐이고, 그 안의 표·목록·흐름은 면 없이 놓는다.
 */
import { createGapViews, EXTRA_KINDS, EXTRA_ICON, deniedKinds } from './sim-gaps-views.js';
import { helmReleases, containersOf } from './sim-gaps.js';
import { CHANGE_LANES, SCRAPE, scrapeFloor, ME, MODEL, burnRate, SLO } from './sim-data.js';
import { T0, H, D, hm, hms, ymd, day, when as whenOn, span as lasted, kubeAge } from './sim-format.js';
import { wave, alertText, seriesOf, podMem, podCpu, clusterCpu, clusterMem, errorRate, requestRate, eventsIn, changesOf, logsOf, alertsOf, pastOf, podFlow, daily, netOf, netFlow, prevContainer, nodeFacts, sfx, cronRuns, cronLast, hex7, hash, podStatus, podTone, POD_STATE_WORDS, requestFlow, syncHistory, yamlOf, STATE_WORD, allocCpu, freshness, evidenceSeries, evidenceSnapshot, TOOL_LATENCY, incidentList, impactNumbers, eventSummary, memoryOf, roleBinding, lastSchedule, nodeGroups, logWindow } from './sim-world.js';
import { sankey, colourOf } from './sim-flows.js';
import { redactedTotal } from './sim-mask.js';
import { RETENTION, PRESETS, DEFAULT_RANGE, searchOf, scopeKey } from './sim-screens.js';
import { t as L } from './sim-locale.js';
/** a text searched for as it is typed */
const escapeRe = q => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CPU = '--series-1', MEM = '--series-2', COUNT = '--series-4';
/* infrastructure first, then the workloads and their pods (GitOps Applications have their own tab) */
export const KINDS = [['Node', 'Node'], ['Deployment', 'Deployment'], ['StatefulSet', 'StatefulSet'], ['DaemonSet', 'DaemonSet'], ['CronJob', 'CronJob'], ['Pod', 'Pod'], ...EXTRA_KINDS];
const STATE_KIND = { ok: 'ok', limited: 'warn', perm: 'perm', idle: 'idle', error: 'error', busy: 'busy' };

export function createViews({ C, html, icon, get }) {
  const when = at => whenOn(at, get().t);
  const fmt1 = v => (Math.round(v * 10) / 10).toString();
  const num = v => Number(v).toLocaleString();

  /* ---------- 공통 조각 ---------- */
  /** a time chart from a value function over a window: the series, its request/limit levels named in the legend, and change marks that say what changed */
  /** the metrics source of the cluster in view: a chart draws no values when it is not connected, it says why and where to fix it */
  const promOf = () => get().w.tools.find(x => x.id === 'prometheus');
  /* a source that is down: its state in its words, when it last answered (world freshness: the one record of it), and where to fix it */
  const lastOf = id => { const f = freshness(get().w, id); return f?.last != null ? L('sim.v.c.lastAt', { at: f.lastText }) : ''; };
  const sourceState = tool => tool && tool.state !== 'ok' && tool.state !== 'limited' ? { kind: tool.state === 'perm' ? 'permission' : 'unavailable', title: `${tool.name} ${STATE_WORD[tool.state]}`, hint: [lastOf(tool.id), tool.detail].filter(Boolean).join(' · '), action: { label: L('sim.crumb.tools'), action: 'sim.go', arg: { page: 'tools', tool: tool.id } } } : null;
  /* the head item of a value whose source is down: the error-coloured "<tool> 끊김" with its last answer, and no value */
  const downItem = id => { const f = freshness(get().w, id); return f?.stale ? { id: 'down', label: '', value: html`<span class="wsc-t">${C.statusIcon.render({ kind: STATE_KIND[f.state] ?? 'error', text: [`${f.name} ${STATE_WORD[f.state] ?? ''}`.trim(), f.last != null ? L('sim.v.c.lastAt', { at: f.lastText }) : ''].filter(Boolean).join(' · ') })}</span>`, priority: 9 } : null; };
  function chart({ title, fn, series, from, to, unit = '', color = CPU, refs = [], events = [], fmt = v => fmt1(v) + unit, height = 112, n = 72, sync, q, own = false, props = false, named = false }) {
    const down = own ? null : sourceState(promOf()); /* Wake's own measurements (tool latency, agent heartbeat) do not come from Prometheus */
    if (down) return C.chartCard.render({ title, widget: true, density: 'compact', state: down, chart: { kind: 'area', height, series: [] } }); /* an explicit state in the chart's own room, never an empty area */
    /* charts of one group keep one window: zooming or panning one moves the others (and the lists that follow it) */
    const list = series ?? [{ key: 'v', name: title, color, fn }];
    const tick = at => (to - from > D || ymd(at) !== ymd(to) ? day(at) : hm(at));
    const ser = list.map((x, i) => ({ key: x.key, name: x.name, color: x.color, dash: 'none', pattern: list.length > 1 ? ['solid', 'dash', 'dot'][i % 3] : 'solid', /* several lines also differ by their stroke, not only by colour */ observations: seriesOf(x.fn, from, to, n).map(o => ({ ...o, at: T0 + o.at, label: tick(o.at) })) }));
    const shownEv = events.filter(e => e.at >= from && e.at <= to), leg = [...list.map(x => ({ label: x.name, color: x.color })), ...refs.map(r => ({ label: r.label, color: r.tone === 'limit' ? '--chart-limit' : '--muted-foreground', dash: true })), ...(shownEv.length ? [{ label: L('sim.v.chart.changeMark'), color: '--muted-foreground', dash: true }] : [])]; /* the dashed upright rules are named: the changes and events in the window */
    /* what was asked of Prometheus and how: the query, the step between points, the last scrape (every 15 s) */
    const step = Math.max(SCRAPE, Math.round((to - from) / (n - 1) / SCRAPE) * SCRAPE), /* a step on the 15 s scrape grid, as Grafana rounds it */ stepW = step >= H ? `${Math.round(step / H)}h` : step >= 60 ? `${Math.round(step / 60)}m` : `${step}s`, scrape = scrapeFloor(Math.min(to, get().t));
    /* the query, step and last scrape sit behind a small info button in the chart head, not as loose text under it */
    const ci = { q: q ?? list.map(x => x.name).join(', '), step: stepW, scrape: hms(scrape), missing: sourceState(promOf()) ? L('sim.v.chart.notCollected') : L('sim.v.c.none'), range: `${day(from)} – ${day(to)}` };
    const info = { title: L('sim.v.chart.query'), rows: [{ label: 'step', value: ci.step }, { label: L('sim.v.chart.lastScrape'), value: ci.scrape }, { label: L('sim.v.chart.missing'), value: ci.missing }, { label: L('sim.v.c.range'), value: ci.range }], ...(q ? { code: { lang: 'promql', text: q } } : {}) };
    const lastV = [...ser[0].observations].reverse().find(o => o.value != null)?.value, card = ({ title, hideTitle: !named && !props, value: lastV == null ? '' : fmt(lastV), widget: true, density: 'compact', info, ...(leg && (list.length > 1 || refs.length || shownEv.length) ? { legend: leg } : {}), chart: { kind: 'area', height, bleed: true, fade: true, reading: true, unit, axes: true, /* the kit fits the value axis and picks its ticks; every chart shows its axes */
      ...(refs.length ? { refs } : {}), events: events.filter(e => e.at >= from && e.at <= to).map(e => ({ ...e, at: T0 + e.at, time: tick(e.at) })),
      series: ser, timeAxis: { from: T0 + from, to: T0 + to, maxGapSeconds: (to - from) / (n - 1) * 1.5, timeZone: 'Asia/Seoul' },
      ...(sync ? { id: `${sync}:${title}`, rangeAction: 'sim.zoom', interactive: 'full' } : {}) } });
    return props ? card : C.chartCard.render(card); /* props: the card's own props, for a frozen clip of it (a report) */ /* a chart kept in step with a range is a full one: zoom, drag-select, reset */
  }
  /* a summary line is one line in any room: what does not fit folds behind "+N" by priority (the kit), the same shape in a page and in a pane */
  const sumBar = p => C.summaryBar.render(p);
  /* a bar's own opening (C, 2026-11-16): what a person chose first; otherwise decided once, the first time the screen draws it (another view or
     another detail decides again). A value that crosses its threshold while the screen is open marks the bar's head and leaves the bar as it is */
  let autoView = null, auto = {};
  const bar = (id, label, items, body, open = true) => { const { S } = get();
    if (autoView !== S.view) { autoView = S.view; auto = {}; }
    const key = `${S.sel?.key ?? S.sel?.id ?? ''}|${id}`;
    return sumBar({ label, open: S.bars[id] ?? (auto[key] ??= open), toggle: { action: 'sim.bar', arg: id }, items: [{ id: 't', label: '', value: label }, ...items], body }); };
  /* an empty card body: one muted line, no mark (a check would read as healthy) */
  const empty = text => html`<div class="v-empty">${text}</div>`;
  /* one status shape everywhere: healthy is the mark alone (its word for assistive tech), anything else the mark and its words in the state colour */
  const status = (kind, text) => (kind === 'ok' ? C.statusIcon.render({ kind, label: text }) : C.statusIcon.render({ kind, text, reveal: true }));
  const statusCell = st => status(st[0], st[1]);
  const stateCell = state => status(STATE_KIND[state], STATE_WORD[state]);
  /* a connection chip: the provider's own mark and name; a state other than connected follows in its status colour */
  const brandMark = (key, size = 'md') => C.iconStack.disc(key, size === 'lg' ? 'lg' : 'md');
  const toolChip = (x, action, arg) => html`<button class="v-chip" data-action="${action}" data-arg="${JSON.stringify(arg)}" title="${x.name} · ${STATE_WORD[x.state]} · ${x.detail}">${icon(x.icon, 'lg')}<span>${x.name}</span>${x.state === 'ok' ? '' : stateCell(x.state)}</button>`;
  /** the connections an investigation reads through: the cluster agent first, then the tools in use */
  /* a screen outside the section tabs (B-01): the same chip, its name alone, no state */
  const navChip = (name, ic, action, arg) => html`<button class="v-chip" data-action="${action}" data-arg="${JSON.stringify(arg)}" title="${name}">${icon(ic, 'lg')}<span>${name}</span></button>`;
  function connChips(only, screens = false) {
    const { w } = get(), tools = w.tools.filter(x => !only || only.includes(x.id));
    return html`<div class="v-chips">${toolChip({ name: 'wake-agent', icon: 'brand-kubernetes', state: w.agent.state, detail: w.agent.detail }, 'sim.go', { page: 'agent' })}${tools.map(x => toolChip(x, 'sim.go', { page: 'tools', tool: x.id }))}${screens ? navChip(L('sim.view.costs'), 'chart-line', 'sim.costs', null) : ''}</div>`;
  }
  /** providers as one row of marks that overlap when room is short, then +N: the connected ones only, what is not connected is counted apart */
  /* the marks alone, as in the open tool list: the state goes in the text next to them, never as dots on the marks */
  const iconStack = (list, max = 9) => C.iconStack.render({ items: list.map(x => ({ id: x.id ?? x.name, name: x.name, brand: x.icon })), max, size: 'sm', label: L('sim.v.c.conn') });
  /* ---------- 시간 범위: 모든 이력 화면이 같은 kit time-range(프리셋 + 사용자 지정) ----------
     a view's window is S[key]: a preset id ('3600') or a custom window { from, to, live } in seconds from t0; each source keeps its own retention */
  /* windows end on the 15 s scrape grid: a chart redraws when a new point exists, not on every second's refresh (no flicker) */
  const win = key => { const { S } = get(), t = scrapeFloor(get().t), v = S[key]; if (v == null) return null; if (typeof v === 'string') return { from: t - Number(v), to: t, preset: v }; return { from: v.from, to: v.live ? t : v.to, live: !!v.live }; };
  /* one preset set on every page (the kit's: 15분 · 1시간 · 6시간 · 24시간 · 7일 · 사용자 지정); the page only picks its default */
  const PID = Object.fromEntries(PRESETS);
  const rangeCtl = (key, retention = RETENTION.metrics, opts = {}) => { const { S, t } = get(), v = S[key];
    return C.timeRange.render({ id: 'tr-' + key, action: 'sim.r.' + key, value: typeof v === 'string' ? { preset: PID[v] ?? '1h' } : { from: T0 + v.from, to: T0 + (v.live ? t : v.to), live: !!v.live }, fallback: PID[DEFAULT_RANGE[key]] ?? '1h', retention, timeZone: 'Asia/Seoul', now: T0 + t, label: L('sim.v.c.range'), ...opts }); };
  /** the Warning reasons that weigh most in a list of Event objects (their counts summed), as a head reads them: "BackOff 14 · FailedMount 61" */
  const topReasons = (list, k = 2) => { const m = new Map(); for (const e of list) if (e.type === 'Warning') m.set(e.reason, (m.get(e.reason) ?? 0) + (e.n ?? 1)); return [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([r, n]) => `${r} ${num(n)}`).join(' · '); };
  /** one row per reason and object, as Kubernetes keeps them: the count summed, first and last seen */
  /* one Event object per reason and object: its count is already the running total, so a repeat keeps the latest (count, last seen), not a sum */
  const groupEv = list => { const g = new Map(); for (const e of list) { const k = `${e.kind}/${e.ns}/${e.name}|${e.reason}`; /* one Event object per object and reason, the key world eventSummary counts by */ const x = g.get(k); if (!x) g.set(k, { ...e, first: e.first ?? e.at }); else { const first = Math.min(x.first, e.first ?? e.at); if (e.at > x.at) g.set(k, { ...e, n: Math.max(x.n, e.n), first }); else { x.n = Math.max(x.n, e.n); x.first = first; } } } return [...g.values()].sort((a, b) => b.at - a.at); };
  /** one change-timeline: changes by lane and warnings in the symptom lane over a window; marking a span tells zoom (the page narrows to it) */
  function timeline({ from, to, changes = [], events = [], zoom = 'sim.noop', extra = [], home, keepEv, keepCh }) {
    const { t } = get(), span = to - from;
    const evMarks = []; const seen = new Map();
    for (const e of events) { const k = `${e.kind}/${e.ns}/${e.name}|${e.reason}`; if (seen.has(k)) { seen.get(k).n = Math.max(seen.get(k).n, e.n); continue; } const m = { id: 'ev:' + e.id, lane: 'symptom', at: T0 + e.at, tone: 'warn', n: e.n, ...(keepEv && !keepEv(e) ? { dim: true } : {}), tip: { time: day(e.at), kind: e.reason, title: `${e.kind}/${e.name}`, text: e.msg } }; seen.set(k, m); evMarks.push(m); if (evMarks.length >= 120) break; }
    return C.changeTimeline.render({ label: L('sim.v.c.timeline'), from: T0 + from, to: T0 + to + Math.max(30, span * .01), now: T0 + t, timeZone: 'Asia/Seoul', home: home ? { from: T0 + home.from, to: T0 + home.to } : { from: T0 + from, to: T0 + to }, /* a double click (or the reset) returns to the range's default window */ selectAction: 'sim.homeChange', panAction: 'sim.noop', zoomAction: zoom,
      lanes: CHANGE_LANES.map(l => ({ id: l.id, label: L('sim.lane.' + l.id), icon: l.icon })),
      marks: [...changes.filter(c => c.at >= from && c.at <= to).map(c => ({ id: c.id, ...(keepCh && !keepCh(c) ? { dim: true } : {}), lane: c.lane, at: T0 + c.at, ...(c.end != null ? { end: T0 + Math.min(c.end, t) } : {}), tone: c.tone, tip: { time: day(c.at), kind: c.kind, title: c.title, text: c.text } })), ...evMarks.map(({ n, ...m }) => ({ ...m, tip: { ...m.tip, text: `${m.tip.text}${n > 1 ? ` · ${L('sim.v.c.times', { n: num(n) })}` : ''}` } })), ...extra] });
  }

  /* ---------- 목록 도구 막대: 모든 목록이 같은 순서와 같은 부품 ----------
     scope (cluster·namespace or the one object) → search → filters | time range → view → count, one kit list-toolbar under the page header,
     and the same pager under the list */
  const SCOPE_W = 'calc(var(--space-40) + var(--space-10))', SEARCH_W = 'calc(var(--space-40) * 1.5)';
  /* ---------- 범위 입력: 클러스터 화면 여덟이 머리 바로 아래 같은 자리에 같은 칸 하나(AI 대화 입력과 같은 kit composer, 한 줄 wide) ----------
     one line: the kind and the namespace pickers, then the text, then the round run button. The text runs on Enter or the run button and matches
     what the view lists (the placeholder names it); each view keeps its own text. The two pickers are the same multi-select menu (search, the
     tri-state all row, rows of checkbox · icon · name · count), apply at once and are one scope across the eight views. A view whose content is
     time-windowed has its time range on a row of its own right under the box, right-aligned (scopeHead). S.scKind and S.nsMulti: null or empty is every kind and
     every namespace, a list is the kinds (their union) or the namespaces chosen */
  const picked = v => (Array.isArray(v) ? (v.length ? v : null) : v ? [v] : null);
  /* a picker's trigger names what it holds: the field's name for all or none, the one chosen, or the first and how many more */
  const pickLabel = (list, all, field) => !list || list.length >= all ? field : list.length === 1 ? list[0] : L('sim.v.scope.more', { name: list[0], n: list.length - 1 });
  /* a ReplicaSet or a Job named after its owner and one generated part (payments-7c9f6): the owner's name */
  const HASHED = /-(?=[a-z]*\d)[a-z0-9]{4,5}$/;
  /** the scope in force: the text (lower case), the namespaces, and, when kinds are picked, the names of the objects of those kinds in those namespaces with
   *  what they belong to (a Pod's owner, a Service's or an Application's workload) and the Pods they run; rel(name) says whether a name is one of them.
   *  kind is the one kind when exactly one is picked (a list of that kind's own columns) */
  function scope() {
    const { S, w } = get(), kinds = picked(S.scKind), ns = picked(S.nsMulti), raw = (S[scopeKey(S.view)] || '').trim(), q = raw.toLowerCase();
    const inNs = x => !ns || !x || ns.includes(x);
    let names = null; const own = new Map(), kids = new Map();
    if (kinds) {
      names = new Set();
      for (const kind of kinds) {
        const mine = new Set(), runs = new Set(), owners = new Set(); own.set(kind, mine); kids.set(kind, runs);
        for (const r of rowsOfKind(kind)) if (inNs(r.ns)) { mine.add(r.name); owners.add(r.name); if (r.owner?.name) owners.add(r.owner.name); if (r.target?.name) owners.add(r.target.name); }
        if (kind !== 'Pod') for (const p of w.pods) if (inNs(p.ns) && owners.has(p.owner?.name)) runs.add(p.name);
        for (const n of [...owners, ...runs]) names.add(n);
      }
    }
    const rel = n => !names || (!!n && (names.has(n) || names.has(String(n).replace(HASHED, ''))));
    /* an object of a picked kind, or one it owns (its ReplicaSets and Pods): the relation set the home cards use, read by the events' involved object */
    const ownsOf = (kind, k, n) => (k === kind ? own.get(kind).has(n) : kind !== 'Pod' && (k === 'Pod' ? kids.get(kind).has(n) : k === 'ReplicaSet' && own.get(kind).has(String(n).replace(HASHED, ''))));
    const owns = (k, n) => !kinds || (!!n && kinds.some(kind => ownsOf(kind, k, n)));
    return { kinds, kind: kinds?.length === 1 ? kinds[0] : null, ns, q, raw, on: !!(kinds || ns || q), inNs, rel, owns, names };
  }
  /** the scope box itself, one line: the kind and the namespace pickers (the same toolbar button), the text, the round run button */
  const scopeBox = () => { const { S, w } = get(), k = picked(S.scKind);
    const tools = html`${C.toolbarButton.render({ icon: k?.length === 1 ? KIND_ICON[k[0]] ?? 'k8s-deployment' : 'k8s-deployment', label: pickLabel(k, KINDS.length, L('sim.v.scope.allKinds')), chevron: true, menu: 'sim.scKindMenu', tip: L('sim.v.scope.kind') })}${C.toolbarButton.render({ icon: 'k8s-namespace', label: pickLabel(picked(S.nsMulti), w.namespaces.length, L('sim.v.scope.allNs')), chevron: true, menu: 'sim.nsMulti', tip: 'namespace' })}`;
    return C.composer.render({ id: 'sim-scope.' + S.view /* one box per view: its own text, a fresh field when the view changes */, variant: 'wide', placeholder: L('sim.v.scope.ph.' + S.view), run: L('sim.v.scope.run'), tools, value: S[scopeKey(S.view)] || '' }); };
  /** the box and, on a view whose content is time-windowed, its time range on the row right under it */
  const scopeHead = (range = '') => html`<div class="v-scope">${scopeBox()}${range ? html`<div class="v-when">${range}</div>` : ''}</div>`;
  /* a value that stays the whole cluster's while a scope narrows the view: said once, in the line's last cell */
  const clusterWide = () => (scope().on ? [{ id: 'cw', label: '', value: html`<span class="v-sub">${L('sim.v.scope.cluster')}</span>`, priority: 9 }] : []);
  /* the one find field, in the search slot of every body page: it sets the key the view declares (sim-screens.js) */
  const findBox = placeholder => { const { S } = get(), f = searchOf(S.view); return C.searchInput.render({ placeholder: placeholder ?? L('sim.v.find.cluster'), action: 'sim.find', value: S[f.key] || '', width: SEARCH_W }); };
  /* what a name matches across the kinds Wake can read (and Helm releases): exact names first */
  function findAll(q0, sc = null) {
    const { S, w } = get(), q = (q0 || '').toLowerCase().trim(), denied = deniedKinds(S.conn), inNs = sc?.inNs ?? (() => true);
    const kinds = (sc?.kinds ?? [...KINDS.map(([k]) => k), 'Application']).filter(k => !denied.includes(k));
    const hits = q ? kinds.flatMap(k => rowsOfKind(k).filter(r => inNs(r.ns) && r.name.toLowerCase().includes(q)).slice(0, 40).map(r => ({ ...r, id: `${r.ns || '_'}/${r.kind}/${r.name}` }))).concat(sc?.kinds ? [] : helmReleases(w).filter(h => inNs(h.ns) && h.name.includes(q)).map(h => ({ ...h, id: `${h.ns}/HelmRelease/${h.name}` }))) : [];
    const exact = hits.filter(r => r.name.toLowerCase() === q);
    return { kinds, denied, hits, rows: [...exact, ...hits.filter(r => !exact.includes(r))].slice(0, 80) };
  }
  /* a list page's find also counts what matches in the other kinds: one row that opens those results */
  const otherKinds = (q, except = null, go = { action: 'sim.gs', arg: q }) => { if (!(q || '').trim()) return ''; const n = findAll(q, except ? { inNs: scope().inNs } : null).hits.filter(r => r.kind !== except).length;
    return n ? html`<div class="v-acts">${C.button.render({ label: L('sim.v.find.otherKinds', { n: num(n) }), icon: 'arrow-up-right', variant: 'link', ...go })}</div>` : ''; };
  /* the cluster-wide find of a page that is not a list: its results stand under the toolbar while a name is typed (the home: the name the scope box ran, in its kind and namespaces) */
  function findResults(q = get().S.gs || '', sc = null) {
    const { S } = get(); if (!q.trim()) return '';
    const { rows, hits } = findAll(q, sc), byKind = [...new Set(rows.map(r => r.kind))].map(k => ({ id: k, label: k, value: num(rows.filter(r => r.kind === k).length) })); /* every kind found is counted; what does not fit folds behind "+N" */
    return rows.length ? sumBar({ label: L('sim.v.c.result'), open: true, toggle: { action: 'sim.noop' }, items: [{ id: 't', label: '', value: L('sim.v.c.result') }, { id: 'n', label: '', value: num(hits.length) }, ...byKind], body: C.dataTable.render({ clip: true, rowKey: 'id', rows, rowAction: 'sim.openRow', activeKey: S.sel?.key, reveal: true, columns: [{ id: 'name', label: 'Name', lead: r => ({ icon: r.icon }) }, { id: 'kind', label: 'Kind', muted: true, width: 'calc(var(--space-16) * 2.4)', cell: r => r.kind }, { id: 'ns', label: 'Namespace', muted: true, optional: true, width: 'calc(var(--space-16) * 2)', cell: r => r.ns || '' }, { id: 'status', label: 'Status', optional: true, width: 'calc(var(--space-16) * 2.5)', fit: true, cell: r => statusCell(r.status) }] }) })
      : C.emptyState.render({ icon: 'search', plainIcon: true, title: L('sim.v.find.none', { q }) });
  }
  /* the toolbar holds controls only: no free count text whose width moves the controls (counts live in the tabs and under the list) */
  const listBar = ({ scope, search, filters, range, view }) => C.listToolbar.render({ scope: scope || undefined, search: search || undefined, filters: filters || undefined, time: range || undefined, view: view || undefined }); /* the kit's fixed slots: left scope → search → filters, right time → view */
  const pager = (page, per, total, action) => total > per ? html`<div class="v-pager"><span class="v-sub">${num((page - 1) * per + 1)}–${num(Math.min(page * per, total))} · ${L('sim.v.c.totalN', { n: num(total) })}</span>${total > per ? C.pager.render({ page, pages: Math.ceil(total / per), action }) : ''}</div>` : '';

  /* ---------- 홈 지표: 지표 하나가 알약 하나(닫으면 지금 값·추세·상태, 열면 넓은 그래프) ---------- */
  const METRICS = [
    { id: 'cpu', q: '100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))', title: L('sim.v.metric.cpu'), unit: '%', color: CPU, fn: clusterCpu, warn: 80, fmt: v => Math.round(v) + '%', refs: [{ value: 80, label: L('sim.v.metric.th80'), tone: 'limit' }], by: 'node' },
    { id: 'mem', q: '100 * (1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))', title: L('sim.v.metric.mem'), unit: '%', color: MEM, fn: clusterMem, warn: 85, fmt: v => Math.round(v) + '%', refs: [{ value: 85, label: L('sim.v.metric.th85'), tone: 'limit' }], by: 'node' },
    { id: 'err', q: '100 * sum(rate(nginx_ingress_controller_requests{status=~"5.."}[5m])) / sum(rate(nginx_ingress_controller_requests[5m]))', title: L('sim.v.metric.err'), unit: '%', color: COUNT, fn: sid => errorRate(sid, get().fixAt), warn: 1, fmt: v => v.toFixed(1) + '%', refs: [{ value: 1, label: L('sim.v.metric.th1'), tone: 'limit' }], by: 'ns' }, /* one percent form: one decimal for the ratio, the threshold as it is set (1%) */
    { id: 'rps', q: 'sum(rate(nginx_ingress_controller_requests[5m]))', title: L('sim.v.metric.rps'), unit: '', color: CPU, fn: () => requestRate, fmt: v => num(Math.round(v)) + '/s', refs: [], by: 'ns' },
  ];
  /** the world's changes and what was applied during the incident */
  const allChanges = (sid, cid) => [...changesOf(sid, cid), ...(get().liveChanges ?? [])];
  const changeMarks = (sid, cid) => allChanges(sid, cid).filter(c => c.lane !== 'symptom').map(c => ({ at: c.at, label: `${c.kind} · ${c.title} · ${c.text}`, kind: c.kind, tone: c.tone === 'danger' ? 'danger' : c.tone === 'warn' ? 'warning' : 'info' }));
  /** what a metric bar says when closed, beside its value: the few readings an SRE weighs for that metric (each a fixed column) */
  function metricFacts(m) {
    const { w, sid, t } = get(), byCpu = [...w.nodes].sort((a, b) => b.cpu - a.cpu), byMem = [...w.nodes].sort((a, b) => b.mem - a.mem);
    const reqPct = k => Math.round(100 * w.nodes.reduce((a, n) => a + (k === 'cpu' ? n.cpuReq : n.memReq), 0) / w.nodes.reduce((a, n) => a + (k === 'cpu' ? n.cpuCores * 1000 : n.memGi * 1024), 0) * 100) / 100;
    if (m.id === 'cpu') return [{ id: 'r', label: L('sim.v.metric.reqOfAlloc'), value: `${Math.round(reqPct('cpu'))}%` }, { id: 'n', label: L('sim.v.metric.nodesOver80'), value: num(w.nodes.filter(n => n.cpu >= 80).length) }, { id: 'b', label: L('sim.v.metric.top'), value: `${byCpu[0].name} ${byCpu[0].cpu}%` }];
    if (m.id === 'mem') return [{ id: 'r', label: L('sim.v.metric.reqOfAlloc'), value: `${Math.round(reqPct('mem'))}%` }, { id: 'n', label: 'MemoryPressure', value: num(w.nodes.filter(n => n.mem >= 92).length) }, { id: 'b', label: L('sim.v.metric.top'), value: `${byMem[0].name} ${byMem[0].mem}%` }];
    const s = get().s, top = s?.errTop && s.impact ? [s.errTop, s.impact.during] : ['search-api', .4];
    const imp = s?.impact && !s.quiet ? impactNumbers(sid, s.impact.from, t, get().fixAt) : null, b1 = imp?.burns?.[0], burn = b1 ? b1.value : Math.round(burnRate(m.fn(sid)(t)) * 10) / 10, burnLabel = b1?.label ?? L('sim.v.metric.burnNow'); /* the burn rate with its window, from the one source (world impactNumbers) */
    if (m.id === 'err') return [{ id: 'r', label: 'burn rate', value: `${burn.toFixed(1)}× · ${burnLabel.replace(/^burn rate\s*/, '')} · SLO ${SLO}%`, ...(burn >= 14.4 ? { tone: 'danger' } : burn >= 6 ? { tone: 'warn' } : {}) }, { id: 'n', label: L('sim.v.metric.most'), value: `${top[0]} ${top[1]}%` }, { id: 'b', label: 'p95', value: `${Math.round(180 + 40 * wave(3, t) + (top[1] > 1 ? 420 : 0))}ms` }];
    const peak = Math.max(...seriesOf(requestRate, t - D, t, 96).map(o => o.value));
    return [{ id: 'r', label: L('sim.v.metric.peak24h'), value: `${num(Math.round(peak))}/s` }, { id: 'n', label: L('sim.v.metric.most'), value: 'gateway-api' }, { id: 'b', label: '', value: '' }];
  }
  function metricBar(m) {
    const { sid, t, cid } = get(), fn = m.fn(sid), now = fn(t), w0 = win('homeRange'), prom = promOf(), down = sourceState(prom), bad = !down && m.warn != null && now >= m.warn;
    /* a source that is down: no value, its state in the connection colour (끊김 red, 연결 안 됨 neutral) and its last collection; the card stays closed */
    const st = down ? status(STATE_KIND[prom.state] ?? 'error', [down.title, lastOf(prom.id)].filter(Boolean).join(' · ')) : status(bad ? 'error' : 'ok', bad ? L('sim.v.metric.over', { v: `${m.warn}${m.unit}` }) : L('sim.v.c.ok'));
    const items = [...(down ? [{ id: 's', label: '', value: html`<span class="wsc-t">${st}</span>`, priority: 9 }] : [{ id: 'v', label: '', value: m.fmt(now), ...(bad ? { tone: 'danger' } : {}) }, ...metricFacts(m), { id: 's', label: '', value: html`<span class="wsc-t">${st}</span>` }]), ...clusterWide()]; /* the metric rows read the whole cluster whatever the scope */
    const body = down ? C.chartCard.render({ title: m.title, widget: true, density: 'compact', state: down, chart: { kind: 'area', height: 220, series: [] } }) : html`${chart({ title: m.title, q: m.q, fn, from: w0.from, to: w0.to, unit: m.unit, color: m.color, refs: m.refs, events: changeMarks(sid, cid), fmt: m.fmt, height: 220, n: 120, sync: 'homeRange' })}
      <div class="v-acts">${C.button.render({ label: L('sim.v.metric.page'), icon: 'arrow-up-right', variant: 'link', action: 'sim.metric', arg: m.id })}</div>`;
    return bar('m-' + m.id, m.title, items, body, bad);
  }

  /** a metric's own page: a large chart over a chosen range, its breakdown (by node or namespace), and what happened in that window */
  function metricPage() {
    const { S, w, sid, t, cid } = get(), m = METRICS.find(x => x.id === S.metric) ?? METRICS[0], w0 = win('homeRange'), from = w0.from, fn = m.fn(sid);
    const groups = m.by === 'node' ? w.nodes.slice().sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0)).slice(0, 5).map((nd, i) => ({ key: nd.name, name: nd.name, color: `--series-${i + 1}`, fn: at => Math.max(0, Math.min(100, (m.id === 'cpu' ? nd.cpu : nd.mem) + 7 * wave(i * 3 + 1, at) + 5 * Math.sin((at + 8 * H) / D * 2 * Math.PI))) }))
      : w.namespaces.slice(0, 5).map((ns, i) => ({ key: ns, name: ns, color: `--series-${i + 1}`, fn: at => fn(at) * (m.id === 'err' ? (ns === (get().s.ns ?? '') ? 3 : .4 + i * .1) : (.32 - i * .05)) }));
    const wf = w0.from, wt = w0.to; /* the lists follow the window */
    const evAll = eventsIn(w, sid, Math.max(wf, t - D), Math.min(wt, t), cid).filter(e => e.type === 'Warning'), evs = evAll.slice(0, 8), chs = allChanges(sid, cid).filter(c => c.at >= wf && c.at <= wt).sort((a, b) => b.at - a.at).slice(0, 8);
    return html`<section class="v-page"><div class="v-head"><div class="v-title">${icon('k8s-cluster', 'lg')}<b>${m.title}</b><span class="v-sub">Prometheus · ${w.cluster.name} · ${L('sim.v.c.retention', { n: RETENTION.metrics / D })}</span></div></div>${stale()}
      ${listBar({ search: findBox(), filters: C.pillTabs.render({ id: 'sim-metric', label: L('sim.crumb.metric'), value: m.id, tabs: METRICS.map(x => ({ id: x.id, label: x.title })), action: 'sim.metric' }), range: rangeCtl('homeRange', RETENTION.metrics) })}${findResults()}
      ${bar('mp-v', m.title, [{ id: 'v', label: '', value: m.fmt(fn(t)) }, ...metricFacts(m).filter(x => x.value !== '')], chart({ title: m.title, q: m.q, fn, from, to: wt, unit: m.unit, color: m.color, refs: m.refs, events: changeMarks(sid, cid), fmt: m.fmt, height: 300, n: 160, sync: 'homeRange' }))}
      ${(title => bar('mp-by', title, [{ id: 'n', label: '', value: num(groups.length) }], chart({ title, q: `topk(5, ${m.q.replace('sum(', `sum by (${m.by === 'node' ? 'instance' : 'namespace'}) (`)})`, series: groups, from, to: wt, unit: m.unit, fmt: m.fmt, height: 220, n: 120, sync: 'homeRange' })))(m.by === 'node' ? L('sim.v.metric.byNode') : L('sim.v.metric.byNs'))}
      ${bar('m-ch', L('sim.v.metric.changesInRange'), [{ id: 'n', label: '', value: `${chs.length}` }], chs.length ? html`<div class="v-evs">${chs.map(c => html`<button class="v-ev" data-action="sim.homeChange" data-arg="${JSON.stringify(c.id)}">${icon(c.lane === 'deploy' ? 'rocket' : c.lane === 'config' ? 'sliders' : 'k8s-node', 'sm')}<span class="v-ev-t"><b>${c.kind}</b> ${c.title} · ${c.text}</span><span class="v-ev-o"></span><span class="v-ev-m">${when(c.at)}</span></button>`)}</div>` : empty(L('sim.v.metric.noChanges')))}
      ${bar('m-ev', L('sim.v.c.warnEvents'), eventHead(evAll), evs.length ? eventTable(evs) : empty(L('sim.v.c.noWarnEvents')))}</section>`;
  }

  /** why a troubled node of the Pod flow is troubled: the states of its pods, counted (the kit stops the flow on those paths and lets the node breathe) */
  function reasonsOn(g, w) {
    for (const n of g.nodes) {
      if (!['warn', 'fail', 'busy'].includes(n.state)) continue;
      const pods = n.id.startsWith('w-') ? w.pods.filter(p => 'w-' + p.owner.name === n.id) : n.id.startsWith('s-') ? w.problems.filter(p => ('s-' + (p.status[0] === 'busy' ? 'ContainerCreating' : p.status[0] === 'warn' ? 'Pending' : 'Failed')) === n.id) : [];
      const by = new Map(); for (const p of pods.filter(x => x.status[0] !== 'ok')) { const k = p.status[1]; by.set(k, (by.get(k) ?? 0) + 1); }
      if (by.size) n.reasons = [...by].map(([label, count]) => ({ label, count }));
    }
  }

  /** live data that stopped: when the agent is down every view says how old what it shows is */
  const stale = () => { const a = get().w.agent; return a.state === 'ok' ? '' : html`<div class="v-stale">${C.statusIcon.render({ kind: 'warn', text: L('sim.v.c.stale', { beat: a.beat }) })}${C.button.render({ label: L('sim.view.agent'), variant: 'link', action: 'sim.go', arg: { page: 'agent' } })}</div>`; };

  /* ---------- 홈 ---------- */
  function home() {
    const { w: w0, sid, t, ph, s, cid } = get(), CL = w0.cluster, sc = scope();
    /* the scope narrows the home's Kubernetes cards (Pods, the unavailable, warnings, the Pod flow, incidents); the metric rows stay the cluster's */
    const inSc = x => sc.inNs(x.ns) && sc.rel(x.name);
    const w = sc.kinds || sc.ns ? { ...w0, pods: w0.pods.filter(inSc), problems: w0.problems.filter(inSc), unavailable: w0.unavailable.filter(inSc) } : w0;
    const incidentOpen = get().incidentOpen && sc.inNs(s.ns) && (!sc.names || (s.scope ?? []).some(r => sc.rel(r.name)));
    const past = pastOf(cid).filter(p => sc.inNs(p.ns) && (!sc.names || sc.rel(p.target?.name ?? p.title.split(' ')[0])));
    const bad = w.problems.length, warnEv = groupEv(eventsIn(w0, sid, t - H, t, cid).filter(e => e.type === 'Warning' && sc.inNs(e.ns) && sc.owns(e.kind, e.name))); /* the same match as the events view: the kind's objects and what they own */
    const ready = w.nodes.filter(n => n.status[0] === 'ok' || n.status[0] === 'warn').length;

    const head = html`<div class="v-head"><div class="v-title">${icon(CL.provider === 'EKS' ? 'brand-eks' : 'brand-kind', 'lg')}<b>${CL.name}</b><span class="v-sub">${CL.env} · ${CL.provider} · ${CL.region} · Kubernetes ${CL.version} · namespace ${w0.namespaces.length} · ${L('sim.v.home.workloads', { n: num(w0.workloads.length) })} · Pod ${num(w0.pods.length)}</span></div>${connChips(['prometheus', 'loki', 'grafana', 'argocd', 'github'], true)}</div>${scopeHead(rangeCtl('homeRange', RETENTION.metrics))}`;
    /* Kubernetes values come from the agent's watch cache: when it is down they are the last ones it saw, said so, never with a healthy mark */
    const k8s = freshness(w, 'kubernetes'), old = !!k8s?.stale, snap = old ? { meta: L('sim.v.c.snapshot') } : {}, notReady = w.nodes.filter(n => n.status[0] !== 'idle').length - ready;
    const summary = sumBar({ label: L('sim.v.c.summary'), items: [
      { id: 'n', label: 'Node', value: num(ready + notReady), icon: 'k8s-node', ...snap, action: 'sim.go', arg: { page: 'resources', kind: 'Node' } }, ...(notReady ? [{ id: 'nr', label: 'NotReady', value: num(notReady), tone: 'warn', action: 'sim.go', arg: { page: 'resources', kind: 'Node', only: 'bad' } }] : []), /* healthy: the one number; NotReady only when there are some */
      { id: 'p', label: L('sim.v.c.badPods'), value: num(bad), icon: 'k8s-pod', ...(bad && !old ? { tone: 'danger' } : {}), ...snap, action: 'sim.go', arg: { page: 'resources', kind: 'Pod', only: 'bad' } },
      { id: 'e', label: L('sim.v.c.warnEvents'), value: num(warnEv.length), icon: 'k8s-event', ...(warnEv.length && !old ? { tone: 'warn' } : {}), meta: old ? snap.meta : L('sim.v.c.lastHour'), action: 'sim.go', arg: { page: 'events', type: 'Warning' } }, /* the agent's last values while it is down are a snapshot, said on each value */
      { id: 'i', label: L('sim.v.c.openIncidents'), value: String(incidentOpen ? 1 : 0), icon: 'incident', ...(incidentOpen && ph !== 'resolved' ? { tone: 'danger' } : {}), action: 'sim.go', arg: { page: 'incidents' } }, ...(old ? [downItem('kubernetes')] : []) ] }); /* the tool marks already stand in the head line: no second connection item; the agent's values while it is down say when they were collected */
    const inc = incidentOpen ? html`<div class="v-rows"><button class="v-row" data-action="sim.go" data-arg="${JSON.stringify({ page: 'incident' })}">${C.statusIcon.render({ kind: ph === 'resolved' ? get().resultKind : 'error', attention: ph !== 'resolved' })}<span class="v-row-t"><b>${alertText(sid)?.incident ?? ''} ${s.title}</b><span>${s.alert} · ${alertText(sid)?.severity ?? s.severity} · ${s.ns} · ${L('sim.v.c.createdAt', { at: when(0) })}</span></span><span class="v-row-m">${get().statusWord}</span>${icon('chevron-right-small', 'sm')}</button></div>` : empty(L('sim.v.c.noOpenIncidents'));
    /* the kit lays the Pod flow out and picks the view (all to scale, or the problems with the healthy rest summarised); we pass real amounts and actions */
    const flow = podFlow(w), g = { mode: 'relation', visual: 'filledOutline', stack: true, stretch: true, fade: true, live: true, label: L('sim.v.home.podState'), gid: 'flg-home-pods', width: 920, height: 460, columns: [0, 380, 804], bar: 56, wash: String(Math.floor(t / 10)),
      stateLabels: POD_STATE_WORDS, fold: { label: L('sim.v.home.foldOther'), more: L('sim.v.home.foldMore') },
      summary: { 0: { label: L('sim.v.home.otherNs'), icon: 'k8s-namespace', action: 'sim.go', arg: { page: 'resources', kind: 'Pod' } }, 1: { label: L('sim.v.home.otherWl'), icon: 'k8s-deployment', action: 'sim.go', arg: { page: 'resources', kind: 'Deployment' } }, 2: { label: L('sim.v.home.otherRunning'), icon: 'circle-check', action: 'sim.go', arg: { page: 'resources', kind: 'Pod', st: 'Running' } } },
      nodes: flow.nodes.map((n, i) => ({ id: n.id, col: n.col, y: i, h: 0, label: n.label, value: n.value.toLocaleString(), icon: n.icon, /* every node says how many pods it carries */ state: n.state || 'ok', ...colourOf(n.state || 'ok', n.tone), ...(n.reasons ? { reasons: n.reasons } : {}), ...(n.go ? { action: 'sim.go', arg: n.go } : {}) })),
      links: flow.links.map(l => ({ from: l.from, to: l.to, fromOffset: 0, toOffset: 0, size: l.value, amount: l.value, value: l.text ?? '', state: l.state || 'ok' })) };
    reasonsOn(g, w);
    g.nodes.forEach(n => { if (n.action) n.action = 'sim.flowGo'; });
    const podTable = rows => C.dataTable.render({ clip: true, rowKey: 'id', rows: rows.map(p => ({ ...p, id: `${p.ns}/Pod/${p.name}` })), rowAction: 'sim.openRow', activeKey: get().S.sel?.key ?? null, reveal: true, columns: [
      { id: 'name', label: 'Name', lead: r => ({ icon: r.icon }) }, { id: 'ns', label: 'Namespace', muted: true, optional: true, width: 'calc(var(--space-16) * 1.6)' },
      { id: 'status', label: 'Status', width: 'calc(var(--space-40) * 1.7)', fit: true, cell: r => statusCell(r.status) }, { id: 'restarts', label: 'Restarts', value: true, optional: true, width: 'var(--space-16)', cell: r => r.restarts ?? '' }] }); /* the state and its reason are the point of this table: they get the room */
    const marks = allChanges(sid, cid).filter(c => c.at <= t && t - c.at < 3 * D && changeOk(c, sc));
    const changes = C.changeTimeline.render({ label: L('sim.v.c.changes'), from: get().S.tlWin?.home?.from ?? T0 + t - 3 * D, to: get().S.tlWin?.home?.to ?? T0 + t + 60, now: T0 + t, selectAction: 'sim.homeChange', panAction: 'sim.noop', zoomAction: 'sim.tlWin.home', lanes: CHANGE_LANES.map(l => ({ id: l.id, label: L('sim.lane.' + l.id), icon: l.icon })),
      marks: marks.map(c => ({ id: c.id, lane: c.lane, at: T0 + c.at, ...(c.end != null ? { end: T0 + Math.min(c.end, t) } : {}), tone: c.tone, tip: { time: day(c.at), kind: c.kind, title: c.title, text: c.text } })), timeZone: 'Asia/Seoul', home: { from: T0 + t - 3 * D, to: T0 + t + 60 } });
    const conn = connList();
    return html`<section class="v-page">${head}${stale()}${findResults(sc.raw, sc)}${summary}
      ${bar('h-inc', L('sim.view.incidents'), [{ id: 'n', label: L('sim.v.home.open'), value: String(incidentOpen ? 1 : 0), ...(incidentOpen && ph !== 'resolved' ? { tone: 'danger' } : {}) }, { id: 'l', label: L('sim.v.c.last30d'), value: `${num(past.filter(p => p.days <= 30).length + (incidentOpen ? 1 : 0))}` }], html`${inc}${C.button.render({ label: L('sim.v.c.incidentList'), variant: 'link', icon: 'arrow-up-right', action: 'sim.go', arg: { page: 'incidents', days: 30 } })}`)}
      <div class="v-metrics">${METRICS.map(metricBar)}
      ${bar('h-flow', L('sim.v.home.podFlow'), [{ id: 'a', label: '', value: num(w.pods.length) }, { id: 'b', label: L('sim.v.c.bad'), value: num(bad), ...(bad ? { tone: 'danger' } : {}) }, { id: 'p', label: 'Pending', value: num(w.pods.filter(p => /Pending/.test(p.status[1])).length) }, { id: 'r', label: L('sim.v.home.restarts1h'), value: num(w.pods.filter(p => p.restarts > 0 && p.age < 3 * H).reduce((a, p) => a + p.restarts, 0) + (w.problems.find(p => p.scenario)?.restarts ?? 0)) }, (old ? downItem('kubernetes') : { id: 's', label: '', value: html`<span class="wsc-t">${status(bad ? 'warn' : 'ok', bad ? L('sim.v.home.badPodsN', { n: num(bad) }) : L('sim.v.c.ok'))}</span>` })], html`<div class="v-flow">${C.flowGraph.render(g)}</div>`, false)}</div>
      <div class="v-k8s"${old ? ' data-old' : ''}>${bar('h-bad', L('sim.v.c.badPods'), [{ id: 'n', label: '', value: num(bad), ...(bad && !old ? { tone: 'danger' } : {}) }, ...(old ? [downItem('kubernetes')] : []), ...['CrashLoopBackOff', 'Pending', 'ContainerCreating', 'Evicted'].map(k => ({ id: k, label: k, value: num(w.problems.filter(p => podStatus(p) === k).length) })).filter(x => x.value !== '0')], bad ? html`${podTable(w.problems.slice(0, 8))}${C.button.render({ label: L('sim.v.home.badPodList'), variant: 'link', icon: 'arrow-up-right', action: 'sim.go', arg: { page: 'resources', kind: 'Pod', only: 'bad' } })}` : empty(L('sim.v.home.noBadPods')))}
      ${bar('h-un', L('sim.v.home.unavailable'), [{ id: 'n', label: '', value: num(w.unavailable.length) }, ...(old ? [downItem('kubernetes')] : [])], w.unavailable.length ? C.dataTable.render({ clip: true, rowKey: 'id', rows: w.unavailable.map(x => ({ ...x, id: `${x.ns}/${x.kind}/${x.name}` })), rowAction: 'sim.openRow', activeKey: get().S.sel?.key ?? null, reveal: true, columns: [{ id: 'name', label: 'Name', lead: r => ({ icon: r.icon }) }, { id: 'kind', label: 'Kind', muted: true, optional: true, width: 'calc(var(--space-16) * 1.6)' }, { id: 'status', label: 'Status', width: W25, fit: true, cell: r => statusCell(r.status) }] }) : empty(L('sim.v.home.allAvailable')), !!w.unavailable.length)}
      ${bar('h-ev', L('sim.v.c.warnEvents'), [...eventHead(warnEv), ...(old ? [downItem('kubernetes')] : [])], warnEv.length ? html`${eventTable(warnEv.slice(0, 6))}${C.button.render({ label: L('sim.v.home.eventList'), variant: 'link', icon: 'arrow-up-right', action: 'sim.go', arg: { page: 'events', type: 'Warning' } })}` : empty(L('sim.v.c.noWarnEvents')), !!warnEv.length)}
      </div>${bar('h-ch', L('sim.v.home.recentChanges'), [{ id: 'n', label: L('sim.v.home.d3'), value: `${num(marks.length)}` }, ...CHANGE_LANES.filter(l => l.id !== 'symptom').map(l => ({ id: 'l-' + l.id, label: L('sim.lane.' + l.id), value: num(marks.filter(c => c.lane === l.id).length) }))], changes, false)}
      ${bar('h-conn', L('sim.v.c.conn'), conn.items, conn.body, false)}
      ${bar('h-past', L('sim.v.c.pastIncidents'), [{ id: 'n', label: L('sim.v.c.last30d'), value: `${num(past.filter(p => p.days <= 30).length)}` }, { id: 'r', label: L('sim.v.home.repeats'), value: `${num(repeats(cid))}` }], html`${past.length ? pastTable(past.slice(0, 6)) : empty(L('sim.v.inc.none'))}${C.button.render({ label: L('sim.v.c.incidentList'), variant: 'link', icon: 'arrow-up-right', action: 'sim.go', arg: { page: 'incidents', days: 30 } })}`, false)}</section>`;
  }
  /** a change belongs to the scope when it names an object of it (Deployment payments, Pod payments-7c9f6-x2k4) or, with only namespaces, one of them */
  const changeOk = (c, sc) => !sc.on || (sc.names ? `${c.title}`.split(/[\s/]+/).some(n => sc.names.has(n)) : !sc.ns || sc.ns.some(n => `${c.title} ${c.text}`.includes(n)));
  const repeats = cid => { const n = new Map(); for (const p of pastOf(cid)) { const k = p.title.split(' ')[0]; n.set(k, (n.get(k) ?? 0) + 1); } return [...n.values()].filter(v => v > 1).length; };
  const pastTable = rows => C.dataTable.render({ clip: true, rowKey: 'id', rows, rowAction: 'sim.past', activeKey: get().S.sel?.type === 'past' ? get().S.sel.id : null, columns: [{ id: 'when', label: L('sim.v.c.date'), time: true, width: 'calc(var(--space-16) * 1.5)' }, { id: 'title', label: L('sim.view.incidents') }, { id: 'by', label: L('sim.v.c.action'), muted: true, optional: true }, { id: 'result', label: L('sim.v.c.result'), optional: true, width: 'calc(var(--space-16) * 2.2)', cell: r => status(r.outcome === 'recovered' ? 'ok' : 'warn', r.result) }, { id: 'took', label: L('sim.v.c.took'), value: true, width: 'calc(var(--space-16) * 1.2)' }] });
  function connList() {
    const { w } = get(), off = w.tools.filter(x => x.state !== 'ok');
    const row = (x, arg) => html`<button class="v-row" data-action="sim.go" data-arg="${JSON.stringify(arg)}">${brandMark(x.icon)}<span class="v-row-t"><b>${x.name}</b><span>${x.detail}</span></span><span class="v-row-m">${stateCell(x.state)}</span>${icon('chevron-right-small', 'sm')}</button>`;
    return { items: [{ id: 'a', label: L('sim.view.agent'), value: html`<span class="wsc-t">${stateCell(w.agent.state)}</span>` }, { id: 'b', label: L('sim.view.tools'), value: iconStack(w.tools) }, ...(off.length ? [{ id: 'c', label: L('sim.v.home.connOff'), value: num(off.length), tone: 'warn' }] : [])],
      body: html`<div class="v-rows">${row({ name: 'wake-agent', icon: 'brand-kubernetes', detail: `${w.agent.ns} · v${w.agent.version} · heartbeat ${w.agent.beat}`, state: w.agent.state }, { page: 'agent' })}${w.tools.map(x => row(x, { page: 'tools', tool: x.id }))}</div>` };
  }


  /* ---------- 리소스 ---------- */
  function rowsOfKind(kind) {
    const { w } = get(), extra = G.rows(kind); if (extra) return extra;
    if (kind === 'Pod') return w.pods;
    if (kind === 'Node') return w.nodes;
    if (kind === 'Application') return w.apps;
    return w.workloads.filter(x => x.kind === kind);
  }
  const KIND_ICON = { Node: 'k8s-node', Deployment: 'k8s-deployment', StatefulSet: 'k8s-statefulset', DaemonSet: 'k8s-daemonset', CronJob: 'k8s-cronjob', Pod: 'k8s-pod', Application: 'k8s-application', ...EXTRA_ICON };
  /** a kind tab: its icon, its count, and a mark when some of its objects are in trouble */
  const kindTabs = (counts, keep = () => true) => KINDS.map(([k, l]) => { const rows = rowsOfKind(k).filter(keep), bad = rows.filter(r => r.status[0] === 'error').length, warn = rows.filter(r => r.status[0] === 'warn' || r.status[0] === 'busy').length;
    const argo = get().w.tools.find(x => x.id === 'argocd'), unread = (k === 'Application' && argo && ['perm', 'idle', 'error'].includes(argo.state)) || deniedKinds(get().S.conn).includes(k); /* what Wake cannot read has no count */
    return { id: k, label: l, icon: KIND_ICON[k], ...(unread ? {} : { count: counts[k], ...(bad ? { badge: { tone: 'danger', value: bad } } : warn ? { badge: { tone: 'warn', value: warn } } : {}) }) }; });
  /* ---------- 종류마다 표의 칸: kubectl get -o wide와 k9s가 보이는 것, 좁으면 뒤의 optional 칸부터 숨김 ---------- */
  const W1 = 'var(--space-16)', W15 = 'calc(var(--space-16) * 1.5)', W2 = 'calc(var(--space-16) * 2)', W25 = 'calc(var(--space-16) * 2.5)';
  /** what a list's head says before it is opened: the few counts an on-call SRE checks first for that kind, from the rows the table lists, in priority order
   *  (the line folds the last ones behind "+N"); a count that is 0 is left out, and the state mark comes only when something is wrong */
  function listFacts(kind, list) {
    const { w, t, sid, ph } = get(), c = f => list.filter(f).length, st = r => r.status?.[1] ?? '', out = [];
    const add = (id, label, n, tone) => { if (n) out.push({ id, label, value: num(n), priority: tone === 'danger' ? 3 : tone === 'warn' ? 2 : 1, ...(tone ? { tone } : {}) }); }; /* a short head keeps the failures first, then the warnings, then the plain counts */
    const bad = c(r => r.status[0] !== 'ok' && r.status[0] !== 'idle' && r.status[0] !== undefined);
    add('b', L('sim.v.c.bad'), bad, 'warn');
    if (kind === 'Node') {
      add('nr', 'NotReady', c(r => /NotReady/.test(st(r)) || r.status[0] === 'idle'), 'danger'); add('sd', 'SchedulingDisabled', c(r => /SchedulingDisabled/.test(st(r))), 'warn');
      add('pr', 'Pressure', c(r => r.status[0] !== 'idle' && nodeFacts(r, w).conditions.some(x => /Pressure$/.test(x.type) && x.status === 'True')), 'warn');
      const live = list.filter(r => r.status[0] !== 'idle'), sum = k => live.reduce((a, r) => a + r[k], 0);
      if (live.length) { out.push({ id: 'cr', label: L('sim.v.res.cpuReq'), value: `${Math.round(100 * sum('cpuReq') / live.reduce((a, r) => a + r.cpuCores * 1000, 0))}%` }); out.push({ id: 'mr', label: L('sim.v.res.memReq'), value: `${Math.round(100 * sum('memReq') / live.reduce((a, r) => a + r.memGi * 1024, 0))}%` }); }
      for (const g of nodeGroups(w, get().fixAt)) out.push({ id: 'ng-' + g.name, label: `NodeGroup ${g.name}`, value: `Ready ${num(g.ready)} · Desired ${num(g.desired)}`, priority: g.ready < g.desired ? 3 : 0, ...(g.ready < g.desired ? { tone: 'warn' } : {}) }); /* each pool's desiredSize, its Nodes and Ready apart (world nodeGroups) */
      const vs = new Set(live.map(r => r.version)); if (vs.size > 1) out.push({ id: 'v', label: L('sim.v.res.versions'), value: [...vs].sort().join(' · '), tone: 'warn' });
    } else if (kind === 'Pod') {
      add('pe', 'Pending', c(r => podStatus(r) === 'Pending'), 'warn'); add('cl', 'CrashLoopBackOff', c(r => podStatus(r) === 'CrashLoopBackOff'), 'danger');
      add('f', 'Failed', c(r => /Failed|Error|Evicted|ImagePull/.test(podStatus(r))), 'danger'); add('o', 'Last State OOMKilled', c(r => r.lastReason === 'OOMKilled' || /OOMKilled/.test(st(r))), 'danger'); /* Pods whose last termination was OOMKilled (a count of Pods, like 문제) */
      add('rs', 'Restarts', list.reduce((a, r) => a + (r.restarts ?? 0), 0));
    } else if (kind === 'Deployment' || kind === 'StatefulSet') {
      add('ua', L('sim.v.res.unavailable'), c(r => r.ready < r.replicas), 'warn'); add('rp', 'Desired', list.reduce((a, r) => a + (r.replicas ?? 0), 0));
      if (kind === 'Deployment') add('ro', L('sim.v.res.rollingOut'), c(r => (r.upToDate ?? r.replicas) < r.replicas), 'warn');
    } else if (kind === 'DaemonSet') {
      add('ua', L('sim.v.res.unavailable'), c(r => (r.ready ?? 0) < (r.desired ?? 0)), 'warn');
    } else if (kind === 'CronJob') {
      add('lf', L('sim.v.res.lastFailed'), c(r => cronRuns(r, t, 1)[0]?.result[0] === 'error'), 'danger'); add('ac', 'Active', c(r => cronRuns(r, t, 1)[0]?.result[0] === 'busy')); add('su', 'Suspend', c(r => r.suspend));
    } else if (kind === 'Job') {
      add('f', 'Failed', c(r => r.status[0] === 'error'), 'danger'); add('ru', L('sim.v.c.running'), c(r => r.status[0] === 'busy'));
    } else if (kind === 'Service') {
      add('ne', L('sim.v.res.noEndpoints'), c(r => r.status[0] === 'error'), 'danger'); add('lb', 'LoadBalancer', c(r => r.type === 'LoadBalancer'));
    } else if (kind === 'PersistentVolumeClaim') {
      add('u', L('sim.v.res.used85'), c(r => r.used >= 85), 'warn'); add('tm', 'Terminating', c(r => /Terminating/.test(st(r))), 'warn');
    } else if (kind === 'Secret' || kind === 'Certificate') {
      add('nr', 'Ready False', c(r => r.ready === 'False'), 'warn'); add('ex', L('sim.v.res.expiring'), c(r => r.status?.[0] === 'warn' || (r.notAfter != null && r.notAfter - t < 14 * D)), 'warn');
    }
    return out;
  }
  /* the columns every kubectl table shares, with kubectl's own headers */
  const pctOf = (a, b) => (b ? Math.round(100 * a / b) : 0) + '%';
  const nameCol = { id: 'name', label: 'Name', lead: r => ({ icon: r.icon }) }, nsCol = { id: 'ns', label: 'Namespace', muted: true, optional: true, width: W2 }, ageCol = { id: 'age', label: 'Age', time: true, optional: true, width: W1, cell: r => kubeAge(r.age) };
  /* a Pod's STATUS as kubectl get pods prints it (CrashLoopBackOff), the same in its list, its detail head and every Pod table */
  const podCell = r => statusCell([r.status[0], podStatus(r)]);
  const stCol = (width = W25) => ({ id: 'status', label: 'Status', width, fit: true, cell: r => statusCell(r.status) });
  /* usage now against requests (workloads: the sum over their pods) */
  const useOf = r => { const { w, sid, ph, t } = get(), ps = r.kind === 'Pod' ? [r] : w.pods.filter(p => p.owner === r || (p.owner?.name === r.name && p.ns === r.ns)), run = ps.filter(p => p.status[0] === 'ok' || /CrashLoop/.test(p.status[1]));
    const cpu = run.reduce((a, p) => a + podCpu(p, sid)(t), 0), mem = run.reduce((a, p) => a + (podMem(p, sid, ph)(t) ?? 0), 0); /* a pod waiting to restart has no sample: it adds nothing, it is not a zero reading */
    return { cpu: Math.round(cpu), mem: Math.round(mem), cpuReq: ps.reduce((a, p) => a + (p.cpuReq ?? 0), 0), memReq: ps.reduce((a, p) => a + (p.memReq ?? 0), 0), memLim: ps.reduce((a, p) => a + (p.memLim ?? 0), 0) }; };
  const pair = (a, b) => html`<span class="v-pair"><b>${a}</b><span>${b}</span></span>`;
  /** a metric pill's head: the readings an SRE weighs without opening it, from the same series and window as the chart inside, in priority order
   *  (the line folds the last ones behind "+N" when short), and the state against the threshold at the end */
  const peakIn = (fn, from, to) => { let best = null; for (const o of seriesOf(fn, from, to, 72)) if (o.value != null && (!best || o.value > best.value)) best = o; return best; };
  const atText = at => (ymd(at) === ymd(get().t) ? hm(at) : day(at));
  const headState = (bad, warn, text) => ({ id: 's', label: '', value: html`<span class="wsc-t">${status(bad ? 'error' : warn ? 'warn' : 'ok', text ?? L('sim.v.c.ok'))}</span>` });
  /* limLabel·ofLabel: a node reads its use against allocatable, where a pod reads it against limits (requests above use is normal on a node: no warning) */
  function useHead({ fn, now, req, lim, unit, from, to, share = false, limLabel = 'limits', ofLabel = L('sim.v.detail.ofLimit'), reqWarn = true }) {
    const gone = downItem('prometheus'); if (gone) return [gone]; /* a source that is down shows no current value: its state and its last collection */
    if (now == null) { /* no sample now (a container waiting to restart): the last sample and its time, dim, never a blank */
      let lastAt = null; for (let x = scrapeFloor(to); x > to - 1800; x -= SCRAPE) if (fn(x) != null) { lastAt = x; break; }
      return [{ id: 'v', label: '', value: lastAt == null ? L('sim.v.detail.noSample') : html`<span class="v-dim">${L('sim.v.detail.lastSample', { v: `${num(Math.round(fn(lastAt)))}${unit}`, at: hms(lastAt) })}</span>`, priority: 5 }, ...(lim ? [{ id: 'l', label: limLabel, value: `${num(Math.round(lim))}${unit}`, priority: 4 }] : [])]; }
    const f = v => `${num(Math.round(v))}${unit}`, peak = peakIn(fn, from, to), of = lim || 0, pct = of ? Math.round(100 * now / of) : null;
    const bad = share ? now >= 90 : of && now >= of * .9, warn = share ? now >= 80 : reqWarn && req && now > req;
    /* priority when the line is short: the value, then limits and requests, then the state; the peak and the share of the limit give way first */
    return [{ id: 'v', label: '', value: f(now), priority: 5, ...(bad ? { tone: 'danger' } : warn ? { tone: 'warn' } : {}) },
      ...(req ? [{ id: 'q', label: 'requests', value: share ? `${Math.round(req)}%` : f(req), priority: 3 }] : []), ...(of && !share ? [{ id: 'l', label: limLabel, value: f(of), priority: 4 }] : []),
      ...(peak ? [{ id: 'p', label: L('sim.v.metric.top'), value: `${share ? Math.round(peak.value) + '%' : f(peak.value)} · ${atText(peak.at)}`, priority: 1 }] : []),
      ...(pct != null && !share ? [{ id: 'r', label: ofLabel, value: `${pct}%`, priority: 2, ...(pct >= 90 ? { tone: 'danger' } : {}) }] : []),
      { ...headState(bad, warn, bad ? L('sim.v.detail.nearLimit') : warn ? L('sim.v.detail.overReq') : null), priority: 2 }]; }
  /* a narrow list column (a pane open beside it) keeps only the required columns; the kit hides at most four optional ones by itself */
  const G = createGapViews({ C, html, icon, get, bar, sumBar, statusCell, when, num, chart, cols: { W1, W15, W2, W25, nameCol, nsCol, ageCol, stCol }, eventsOf: r => eventsOf(r), eventsTab: (r, evs) => eventsTab(r, evs), head: { peakIn: (...a) => peakIn(...a), atText: at => atText(at), state: (...a) => headState(...a), down: id => downItem(id) } });
  /* the cluster-wide find on a page of its own (where a list's "다른 종류에서" row leads): the same field, the same results */
  function searchPage() {
    const { w } = get(), { denied } = findAll('');
    return html`<section class="v-page"><div class="v-head"><div class="v-title">${icon('search', 'lg')}<b>${L('sim.crumb.search')}</b><span class="v-sub">${w.cluster.name}${denied.length ? ` · ${L('sim.v.find.denied', { kinds: denied.join(', ') })}` : ''}</span></div>${findBox()}</div>
      ${findResults()}</section>`;
  }
  function kindColumns(kind) {
    const { w } = get(), gc = G.columns(kind); if (gc) return gc;
    if (kind === 'Node') return [nameCol, stCol(), { id: 'pool', label: 'NodeGroup', muted: true, optional: true, width: W15 },
      { id: 'cpu', label: 'CPU', value: true, width: W2, cell: r => pair(r.cpu + '%', L('sim.v.c.reqV', { v: pctOf(r.cpuReq, r.cpuCores * 1000) })) }, { id: 'mem', label: 'Memory', value: true, width: W2, cell: r => pair(r.mem + '%', L('sim.v.c.reqV', { v: pctOf(r.memReq, r.memGi * 1024) })) },
      { id: 'pods', label: 'Pods', value: true, optional: true, width: W1, cell: r => num(r.pods) }, { id: 'podCap', label: 'Pod Capacity', value: true, optional: true, width: W15 }, { id: 'cond', label: 'Pressure', optional: true, width: W15, cell: r => { const f = nodeFacts(r, w), p = f.conditions.filter(c => c.type !== 'Ready' && c.type !== 'NetworkUnavailable' && c.status === 'True'); return p.map(c => c.type).join(' · '); } },
      { id: 'taints', label: 'Taints', muted: true, optional: true, width: W25, cell: r => r.taints.join(', ') }, { id: 'zone', label: 'Zone', muted: true, optional: true, width: W2 }, { id: 'type', label: 'Instance Type', muted: true, optional: true, width: W2 },
      { id: 'version', label: 'Version', muted: true, optional: true, width: W25 }, { id: 'internalIP', label: 'Internal-IP', muted: true, optional: true, width: W2 }, ageCol];
    if (kind === 'Deployment') return [nameCol, nsCol, stCol(), { id: 'ready', label: 'Ready', value: true, width: W1, cell: r => num(r.ready) }, { id: 'replicas', label: 'Desired', value: true, width: W15, cell: r => num(r.replicas) },
      { id: 'cpu', label: 'CPU', value: true, optional: true, width: W25, cell: r => { const u = useOf(r); return pair(num(u.cpu) + 'm', L('sim.v.c.reqV', { v: `${num(u.cpuReq)}m` })); } }, { id: 'mem', label: 'Memory', value: true, optional: true, width: W25, cell: r => { const u = useOf(r); return pair(num(u.mem) + 'Mi', L('sim.v.c.reqV', { v: `${num(u.memReq)}Mi` })); } },
      { id: 'available', label: 'Available', value: true, optional: true, width: W15 }, { id: 'restarts1h', label: 'Restarts 1h', value: true, optional: true, width: W15 }, { id: 'rev', label: 'Revision', value: true, optional: true, width: W15 }, { id: 'upToDate', label: 'Up-to-date', value: true, optional: true, width: W15 },
      { id: 'image', label: 'Image', muted: true, optional: true, width: 'calc(var(--space-16) * 3)', cell: r => r.image.split('/').pop() }, { id: 'strategy', label: 'Strategy', muted: true, optional: true, width: W2, cell: r => r.strategy.split(' · ')[0] }, { id: 'app', label: 'Application', muted: true, optional: true, width: W2, cell: r => r.app ?? '' }, ageCol];
    if (kind === 'StatefulSet') return [nameCol, nsCol, stCol(), { id: 'ready', label: 'Ready', value: true, width: W1, cell: r => num(r.ready) }, { id: 'replicas', label: 'Desired', value: true, width: W15, cell: r => num(r.replicas) },
      { id: 'service', label: 'Service', muted: true, optional: true, width: W25 }, { id: 'pvcs', label: 'PVC', value: true, optional: true, width: W2, cell: r => `${r.pvcs.length} · ${L('sim.v.res.pvcEach', { size: r.pvcs[0]?.size ?? 0 })}` },
      { id: 'image', label: 'Image', muted: true, optional: true, width: 'calc(var(--space-16) * 3)', cell: r => r.image.split('/').pop() }, { id: 'strategy', label: 'Update Strategy', muted: true, optional: true, width: W25 }, ageCol];
    if (kind === 'DaemonSet') return [nameCol, nsCol, stCol(), { id: 'desired', label: 'Desired', value: true, width: W15 }, { id: 'current', label: 'Current', value: true, optional: true, width: W15 },
      { id: 'ready', label: 'Ready', value: true, width: W1 }, { id: 'upToDate', label: 'Up-to-date', value: true, optional: true, width: W15 }, { id: 'available', label: 'Available', value: true, optional: true, width: W15 },
      { id: 'selector', label: 'Node Selector', muted: true, optional: true, width: W25 }, ageCol];
    if (kind === 'CronJob') return [nameCol, nsCol, stCol(), { id: 'cron', label: 'Schedule', width: W25, cell: r => pair(r.cron, r.human) },
      { id: 'suspend', label: 'Suspend', optional: true, width: W15, cell: r => r.suspend ? 'True' : 'False' }, { id: 'active', label: 'Active', value: true, optional: true, width: W1, cell: r => String(cronRuns(r, get().t, 1).filter(x => x.result[0] === 'busy').length) },
      { id: 'last', label: 'Last Schedule', time: true, width: W2, cell: r => when(lastSchedule(r, get().t)) }, { id: 'ok', label: 'Last Success', time: true, optional: true, width: 'calc(var(--space-40) * .9)', cell: r => when(cronRuns(r, get().t, 12).find(x => x.result[0] === 'ok')?.at) },
      { id: 'next', label: 'Next Schedule', time: true, optional: true, width: 'calc(var(--space-40) * .9)', cell: r => r.suspend ? '' : when(cronLast(r, get().t) + r.every) }, { id: 'concurrency', label: 'Concurrency Policy', muted: true, optional: true, width: W15 }, ageCol];
    return [nameCol, nsCol, { ...stCol(), cell: r => podCell(r) } /* kubectl STATUS: the last termination reason is the Restarts column's */, { id: 'ready', label: 'Ready', width: W15, fit: true, cell: r => statusCell(r.ready === '1/1' ? ['ok', 'True'] : ['warn', 'False']) }, { id: 'restarts', label: 'Restarts', value: true, width: W2, cell: r => r.restarts ? pair(num(r.restarts), r.lastReason) : '0' },
      { id: 'cpu', label: 'CPU', value: true, optional: true, width: W15, cell: r => /Pending|ContainerCreating|Evicted|ImagePull/.test(r.status[1]) ? '' : useOf(r).cpu + 'm' }, { id: 'mem', label: 'Memory', value: true, optional: true, width: W25, cell: r => /Pending|ContainerCreating|Evicted|ImagePull/.test(r.status[1]) ? '' : pair(useOf(r).mem + 'Mi', r.memLim ? L('sim.v.c.limV', { v: `${r.memLim}Mi` }) : '') },
      { id: 'node', label: 'Node', muted: true, optional: true, width: W25, cell: r => r.node ?? '' }, { id: 'ip', label: 'IP', muted: true, optional: true, width: W2, cell: r => r.node ? r.ip : '' }, { id: 'qos', label: 'QoS', muted: true, optional: true, width: W15 },
      { id: 'owner', label: 'Controlled By', muted: true, optional: true, width: W25, cell: r => `${r.owner?.kind ?? ''}/${r.owner?.name ?? ''}` }, ageCol];
  }
  /* problems first, then namespace and name (RULE-SORT: the resource default) */
  const RANK = { error: 0, warn: 1, busy: 1 };
  const byTrouble = (x, y) => (RANK[x.status?.[0]] ?? 2) - (RANK[y.status?.[0]] ?? 2) || (x.ns || '').localeCompare(y.ns || '') || x.name.localeCompare(y.name);
  function resources() {
    const { S, w } = get(), sc = scope(), kind = sc.kind, q = sc.q;
    /* a Pod's STATUS is a filter of its own: the same word the Pod graph on the home counts, so a band opens exactly the pods it carries */
    const st = kind === 'Pod' ? S.st ?? 'all' : 'all';
    const pod = kind === 'Pod';
    /* no kind picked: every kind Wake can read, one list (the scope's namespaces and name), problems first; one kind: that kind's own columns */
    const denyList = deniedKinds(S.conn), source = kind ? rowsOfKind(kind) : (sc.kinds ?? KINDS.map(([k]) => k)).filter(k => !denyList.includes(k)).flatMap(k => rowsOfKind(k)).sort(byTrouble); /* several kinds: their one list, problems first */
    let rows = source.filter(r => sc.inNs(r.ns) && (!q || r.name.toLowerCase().includes(q)) && (S.only !== 'bad' || r.status[0] !== 'ok') && (st === 'all' || podStatus(r) === st) && (!pod || !S.podNode || r.node === S.podNode) && (!pod || !S.podOwner || `${r.owner?.kind}/${r.owner?.name}` === S.podOwner));
    const denied = !!kind && denyList.includes(kind);
    const total = rows.length, per = 20, pages = Math.max(1, Math.ceil(total / per)), page = Math.min(S.pg, pages);
    const listed = rows; /* the head reads the rows the table lists (every page of them) */
    rows = rows.slice((page - 1) * per, page * per);
    const cols = kind ? kindColumns(kind) : [nameCol, { id: 'kind', label: 'Kind', muted: true, width: W15 }, nsCol, stCol(), { ...ageCol, cell: r => r.age != null ? kubeAge(r.age) : '' }]; /* every width gets the same columns: the table hides optional ones from the right only when they do not fit (kit) */
    const label = kind ?? (sc.kinds ? sc.kinds.join(' · ') : L('sim.v.scope.allKinds'));
    return html`<section class="v-page"><div class="v-head"><div class="v-title">${icon('k8s-deployment', 'lg')}<b>${L('sim.view.resources')}</b><span class="v-sub">Kubernetes API · ${w.cluster.name}</span></div></div>${scopeHead()}${stale()}
      ${w.denied?.length ? html`<div class="v-kinds"><span class="v-perm">${C.statusIcon.render({ kind: 'perm', icon: 'lock', text: L('sim.v.res.limited', { kinds: w.denied.join(' · ') }) })}${C.button.render({ label: L('sim.v.c.viewPerm'), variant: 'link', action: 'sim.go', arg: { page: 'agent' } })}</span></div>` : ''}
      ${listBar({ filters: html`${C.pillTabs.render({ id: 'sim-only', label: L('sim.v.c.filter'), value: S.only, tabs: [{ id: 'all', label: L('sim.v.c.all') }, { id: 'bad', label: L('sim.v.c.hasBad') }], action: 'sim.only' })}${pod ? html`${C.select.render({ value: st === 'all' ? L('sim.v.res.allStates') : st, menu: 'sim.stMenu', label: L('sim.v.c.state'), width: SCOPE_W })}${C.select.render({ value: S.podNode ?? L('sim.v.res.allNodes'), icon: 'k8s-node', menu: 'sim.podNodeMenu', label: 'Node', width: SCOPE_W })}${C.select.render({ value: S.podOwner ?? L('sim.v.res.allOwners'), icon: 'k8s-deployment', menu: 'sim.podOwnerMenu', label: 'Owner', width: SCOPE_W })}` : ''}` })}
      ${denied ? C.emptyState.render({ icon: 'lock', plainIcon: true, title: L('sim.v.res.watchDenied', { res: kind === 'Secret' ? 'secrets' : 'certificates.cert-manager.io' }), action: C.button.render({ label: L('sim.v.c.viewPerm'), variant: 'secondary', size: 'sm', round: true, action: 'sim.go', arg: { page: 'agent' } }) }) : total ? html`${sumBar({ label, open: true, toggle: { action: 'sim.noop' }, items: [{ id: 't', label: '', value: label }, { id: 'n', label: '', value: `${num(total)}`, priority: 9 }, ...listFacts(kind ?? '', listed)], body: html`${C.dataTable.render({ clip: true, rowKey: 'id', rows: rows.map(r => ({ ...r, id: (r.ns || '_') + '/' + r.kind + '/' + r.name })), rowAction: 'sim.openRow', activeKey: S.sel?.type === 'resource' ? S.sel.key : null, reveal: true, columns: cols })}${pager(page, per, total, 'sim.page')}` })}`
        : C.emptyState.render({ icon: 'search', plainIcon: true, title: q ? L('sim.v.res.noResults', { q: sc.raw }) : L('sim.v.res.noneKind', { kind: label }), ...(pod && (S.podNode || S.podOwner) || sc.ns ? { description: L('sim.v.res.noMatch', { filters: [pod && S.podNode ? `Node ${S.podNode}` : '', pod && S.podOwner ? `Owner ${S.podOwner}` : '', sc.ns ? `namespace ${sc.ns.join(', ')}` : ''].filter(Boolean).join(' · ') }) } : {}) })}${kind && q ? otherKinds(sc.raw, kind, { action: 'sim.scKind', arg: 'all' }) : ''}</section>`;
  }

  /* ---------- GitOps: Application 목록 ---------- */
  const syncOf = a => a.status[1].split(' · ')[0], healthOf = a => a.status[1].split(' · ')[1] ?? 'Healthy';
  const syncCell = v => status(v === 'Synced' ? 'ok' : v === 'OutOfSync' ? 'warn' : 'error', v);
  const healthCell = v => status(v === 'Healthy' ? 'ok' : v === 'Progressing' ? 'busy' : v === 'Degraded' || v === 'PreSync Failed' ? 'error' : 'warn', v);
  function gitopsPage() {
    const { S, w, t } = get(), argo = w.tools.find(x => x.id === 'argocd'), down = argo && ['perm', 'idle', 'error'].includes(argo.state) ? sourceState(argo) : null;
    const head = html`<div class="v-head"><div class="v-title">${icon('branch', 'lg')}<b>GitOps</b><span class="v-sub">Argo CD ${argo?.version ?? ''} · ${w.cluster.name} · ${L('sim.v.c.retention', { n: RETENTION.gitops / D })}</span></div></div>${scopeHead(rangeCtl('gitRange', RETENTION.gitops))}${stale()}`;
    if (down) return html`<section class="v-page">${head}${C.emptyState.render({ icon: 'plug', plainIcon: true, title: down.title, description: `${down.hint} · ${L('sim.v.git.cannotRead')}`, action: C.button.render({ label: L('sim.crumb.tools'), variant: 'secondary', size: 'sm', action: 'sim.go', arg: { page: 'tools', tool: 'argocd' } }) })}</section>`;
    /* the text: an Application's name or its manifest path (repo/path); the kind and namespaces: the Applications that manage those objects */
    const sc = scope(), q = sc.q, all = w.apps.filter(a => sc.inNs(a.target?.ns) && (!sc.names || sc.rel(a.name) || sc.rel(a.target?.name))).map(a => ({ ...a, sync: syncOf(a), health: healthOf(a), last: syncHistory(a).filter(x => x.at <= t)[0] }));
    const bad = a => a.sync !== 'Synced' || a.health !== 'Healthy';
    const gw0 = win('gitRange'), inWin = a => syncHistory(a).filter(x => x.at >= gw0.from && x.at <= gw0.to).length;
    const rows = all.filter(a => (!q || `${a.name} ${a.repo ?? ''}/${a.path ?? ''}`.toLowerCase().includes(q)) && (S.gf === 'all' || (S.gf === 'bad' ? bad(a) : a.sync === S.gf))).sort((a, b) => bad(b) - bad(a));
    const per = 20, pages = Math.max(1, Math.ceil(rows.length / per)), page = Math.min(S.gpg, pages);
    const limited = argo?.state === 'limited' ? html`<div class="v-stale">${C.statusIcon.render({ kind: 'warn', text: L('sim.v.app.readOnly') })}${C.button.render({ label: L('sim.crumb.tools'), variant: 'link', action: 'sim.go', arg: { page: 'tools', tool: 'argocd' } })}</div>` : '';
    return html`<section class="v-page">${head}${limited}
      ${listBar({ filters: C.pillTabs.render({ id: 'sim-gf', label: L('sim.v.c.filter'), value: S.gf, tabs: [['all', L('sim.v.c.all'), all.length], ['bad', L('sim.v.c.hasBad'), all.filter(bad).length], ['OutOfSync', 'OutOfSync', all.filter(a => a.sync === 'OutOfSync').length]].map(([id, label, n]) => ({ id, label, count: num(n), ...(id === 'bad' && n ? { badge: { tone: 'warn' } } : {}) })), action: 'sim.gf' }) })}
      ${sumBar({ label: 'Application', open: true, toggle: { action: 'sim.noop' }, items: [{ id: 't', label: '', value: 'Application' }, { id: 's', label: 'Synced', value: num(all.filter(a => a.sync === 'Synced').length) }, { id: 'o', label: 'OutOfSync', value: num(all.filter(a => a.sync === 'OutOfSync').length), ...(all.some(a => a.sync === 'OutOfSync') ? { tone: 'warn' } : {}) }, ...[{ id: 'd', label: 'Degraded', value: num(all.filter(a => /Degraded|Failed/.test(a.health)).length), tone: 'danger' }, { id: 'pg', label: 'Progressing', value: num(all.filter(a => a.health === 'Progressing').length) }].filter(x => x.value !== '0'), ...((last => last ? [{ id: 'l', label: L('sim.v.git.lastSync'), value: when(last) }] : [])(Math.max(...all.map(a => a.last?.at ?? -Infinity).filter(Number.isFinite)) || null))],
        body: html`${C.dataTable.render({ clip: true, rowKey: 'id', rows: rows.slice((page - 1) * per, page * per).map(r => ({ ...r, id: 'argocd/Application/' + r.name })), rowAction: 'sim.openRow', activeKey: get().S.sel?.key, reveal: true, columns: [{ id: 'name', label: L('sim.v.c.name'), lead: r => ({ icon: r.icon }) }, { id: 'src', label: L('sim.v.c.source'), muted: true, optional: true, width: 'calc(var(--space-16) * 1.2)', cell: () => 'Argo CD' }, { id: 'sync', label: 'Sync', width: 'calc(var(--space-16) * 1.7)', fit: true, cell: r => syncCell(r.sync) }, { id: 'health', label: 'Health', width: 'calc(var(--space-16) * 2.2)', fit: true, cell: r => healthCell(r.health) }, { id: 'revision', label: 'Revision', mono: true, optional: true, width: 'calc(var(--space-16) * 1.3)' }, { id: 'last', label: L('sim.v.git.lastSync'), time: true, optional: true, width: 'calc(var(--space-40) * .9)', cell: r => r.last ? when(r.last.at) : '' }, { id: 'win', label: L('sim.v.git.syncsInRange'), value: true, optional: true, width: 'calc(var(--space-16) * 1.5)', cell: r => num(inWin(r)) }, { id: 'auto', label: L('sim.v.c.autoSync'), optional: true, width: 'calc(var(--space-16) * 1.4)', cell: r => r.auto ? L('sim.v.c.on') : L('sim.v.c.off') }] })}${pager(page, per, rows.length, 'sim.gpg')}` })}
      ${(() => { const hs = helmReleases(w).filter(h => sc.inNs(h.ns) && (!sc.names || sc.rel(h.name) || sc.rel(h.app)) && (!q || h.name.includes(q))); return hs.length ? sumBar({ label: L('sim.v.c.helm'), open: true, toggle: { action: 'sim.noop' }, items: [{ id: 't', label: '', value: L('sim.v.c.helm') }, { id: 'n', label: '', value: `${num(hs.length)}` }, { id: 'd', label: 'deployed', value: num(hs.length) }],
        body: C.dataTable.render({ clip: true, rowKey: 'id', rows: hs.map(h => ({ ...h, id: `${h.ns}/HelmRelease/${h.name}` })), rowAction: 'sim.openRow', activeKey: get().S.sel?.key, reveal: true, columns: [{ id: 'name', label: L('sim.v.c.name'), lead: r => ({ icon: r.icon }) }, { id: 'ns', label: 'Namespace', muted: true, optional: true, width: 'calc(var(--space-16) * 1.6)' }, { id: 'status', label: L('sim.v.c.state'), width: 'calc(var(--space-16) * 1.7)', fit: true, cell: r => statusCell(r.status) }, { id: 'rev', label: 'Revision', value: true, width: 'calc(var(--space-16) * 1.2)' }, { id: 'chart', label: 'Chart', muted: true, optional: true }, { id: 'src', label: L('sim.v.c.source'), muted: true, optional: true, width: 'calc(var(--space-16) * 1.2)', cell: () => 'Helm' }, { id: 'updated', label: L('sim.v.git.updated'), time: true, optional: true, width: 'calc(var(--space-40) * .9)', cell: r => when(r.updated) }] }) }) : ''; })()}</section>`;
  }

  /* ---------- 리소스 상세(상세 칸) ---------- */
  function findResource(key) {
    const { w } = get(), [ns, kind, name] = key.split('/'), g = G.find(kind, ns, name); if (g) return g;
    return kind === 'Node' ? w.nodes.find(n => n.name === name) : kind === 'Pod' ? w.pods.find(p => p.name === name && p.ns === ns) : kind === 'Application' ? w.apps.find(a => a.name === name) : w.workloads.find(x => x.kind === kind && x.name === name && (ns === '_' || x.ns === ns)) ?? w.workloads.find(x => x.kind === kind && x.name === name);
  }
  /* the audit trail as one compact list: when (with the date), who (a person's avatar or the system's mark), what, with which permission, and its link */
  function auditList(rows) {
    const days = new Set(rows.map(r => ymd(r.at))), one = days.size === 1 ? [...days][0] : null; /* one day: the head names it and a row keeps its time; several: every row says its date */
    return rows.length ? C.dataTable.render({ clip: true, rowKey: 'id', rows: rows.map((r, i) => ({ ...r, id: 'a' + i })), reveal: true, columns: [
      { id: 'at', label: one ? `${L('sim.v.c.time')} · ${one}` : L('sim.v.c.time'), time: true, width: one ? 'calc(var(--space-16) * 2)' : 'calc(var(--space-40) * 1.1)', cell: r => one ? hms(r.at) : `${ymd(r.at)} ${hms(r.at)}` },
      { id: 'action', label: L('sim.v.past.whoWhat'), cell: r => html`<span class="v-who">${r.actor.user ? C.avatar.render({ name: r.actor.name, size: 'sm', showName: true }) : html`${icon(r.actor.icon, 'sm')}<b>${r.actor.name}</b>`}</span> <span title="${r.action}">${r.action}</span>` },
      { id: 'perm', label: L('sim.v.c.perm'), muted: true, optional: true, width: 'calc(var(--space-40) * 1.4)' },
      { id: 'link', label: '', optional: true, width: 'calc(var(--space-16) * 1.1)', cell: r => r.link ? C.button.render({ label: /\/pull\//.test(r.link) ? 'PR' : L('sim.v.c.ticket'), icon: 'arrow-up-right', variant: 'link', action: 'sim.openUrl', arg: r.link }) : '' }] }) : empty(L('sim.v.past.noTrail'));
  }
  /* ---------- 과거 인시던트: 그때의 기록(감지에서 복구까지, 원인과 조치, 누가 승인했는지)과 같은 대상의 반복 ---------- */
  function pastDetail(one, same) {
    const ok = one.outcome === 'recovered', at = one.at ?? -one.days * D, mins = one.mins ?? parseInt(one.took, 10);
    const head = C.pageHeader.render({ icon: 'incident', title: one.title, context: [L('sim.view.incidents'), one.ns, get().w.cluster.name].filter(Boolean).join(' · '), size: 'sm', after: status(ok ? 'ok' : 'warn', one.result) });
    const summary = sumBar({ label: L('sim.v.c.record'), items: [{ id: 'i', label: '', value: one.id.toUpperCase() }, { id: 'd', label: L('sim.v.past.detected'), value: day(at) }, { id: 't', label: L('sim.v.past.detectToRecover'), value: one.took }, { id: 'a', label: L('sim.view.alerts'), value: one.alert }] });
    const who = one.approver ?? ME, ns = one.ns ?? one.title.split(' ')[0], pr = /#(\d+)/.exec(one.by ?? '')?.[1] ?? 100 + hash(one.id) % 80 /* the PR the record names, the same number everywhere */, sys = (name, ic) => ({ name, icon: ic });
    const trail = [{ at, actor: sys('Alertmanager', 'bell'), action: `${one.alert} firing`, perm: L('sim.v.past.ruleOf', { alert: one.alert }) }, { at: at + 15, actor: sys('Wake AI', 'ai'), action: L('sim.v.past.autoInvestigate', { n: one.evidence ?? 4 }), perm: L('sim.v.past.agentRo') },
      ...(one.cause ? [{ at: at + 20, actor: sys(L('sim.v.actor.rule'), 'shield-check'), action: L('sim.v.past.causeOf', { cause: one.cause }), perm: one.rule ? L('sim.v.past.ruleBy', { rule: one.rule }) : '' }] : []), /* what the record does not hold is not a row */ { at: at + Math.round(mins * 60 * .25), actor: { name: who, user: true }, action: L('sim.v.c.approveOf', { what: one.by }), perm: /PR/.test(one.by) ? L('sim.v.past.permPr', { ns }) : L('sim.v.past.permCopy', { ns }) },
      ...(/PR/.test(one.by) ? [{ at: at + Math.round(mins * 60 * .3), actor: { name: who, user: true }, action: L('sim.v.past.merged', { pr }), perm: `GitHub acme/${ns}-deploy · write`, link: `https://github.com/acme/${ns}-deploy/pull/${pr}` }] : []),
      { at: at + Math.round(mins * 60 * .45), actor: sys(/PR/.test(one.by) ? 'Argo CD' : 'Kubernetes', /PR/.test(one.by) ? 'brand-argo' : 'k8s-deployment'), action: L('sim.v.past.applied', { what: one.by }), perm: /PR/.test(one.by) ? L('sim.v.past.appAutoSync') : L('sim.v.past.external') },
      { at: at + mins * 60, actor: sys(L('sim.v.actor.check'), 'circle-check'), action: one.result, perm: L('sim.v.past.verifyRule') }];
    const flow = bar('p-flow', L('sim.v.c.record'), [{ id: 'n', label: '', value: `${trail.length}` }], auditList(trail), true);
    const cause = one.cause ? bar('p-cause', L('sim.stage.cause'), [...(one.rule ? [{ id: 'r', label: L('sim.v.past.rule'), value: one.rule }] : []), ...(one.evidence ? [{ id: 'e', label: L('sim.v.c.evidence'), value: `${one.evidence}` }] : [])], html`<div class="v-line">${one.cause}</div>`, true) : '';
    const act = bar('p-act', L('sim.v.c.action'), [{ id: 'b', label: '', value: one.by }, { id: 'p', label: L('sim.v.past.approver'), value: one.approver ?? ME }], one.target ? html`<div class="v-acts">${C.button.render({ label: `${one.target.kind} ${one.target.name}`, icon: one.target.icon, variant: 'link', action: 'sim.openRow', arg: { id: `${one.target.ns}/${one.target.kind}/${one.target.name}` } })}</div>` : undefined, true);
    const sameBar = sumBar({ label: L('sim.v.past.sameTarget'), open: true, toggle: { action: 'sim.noop' }, items: [{ id: 't', label: '', value: L('sim.v.past.sameTarget') }, { id: 'n', label: L('sim.v.c.d90'), value: `${same.length}` }], body: C.dataTable.render({ clip: true, rowKey: 'id', rows: same.slice(0, 12), rowAction: 'sim.past', activeKey: one.id, reveal: true, columns: [{ id: 'when', label: L('sim.v.c.date'), time: true, width: 'calc(var(--space-16) * 1.5)' }, { id: 'title', label: L('sim.view.incidents') }, { id: 'by', label: L('sim.v.c.action'), muted: true, optional: true }, { id: 'took', label: L('sim.v.c.took'), value: true, width: 'calc(var(--space-16) * 1.3)' }] }) });
    return html`${head}${summary}${cause}${act}${flow}${sameBar}`;
  }
  /* ---------- 알림 상세: Alertmanager가 보낸 그대로(이름·심각도·상태·라벨·요약)와 대상, 같은 알림의 이력 ---------- */
  const ALERT_EXPR = { PersistentVolumeFillingUp: 'kubelet_volume_stats_available_bytes / kubelet_volume_stats_capacity_bytes < 0.1', KafkaConsumerLagHigh: 'sum by (consumergroup) (kafka_consumergroup_lag) > 10000', KubePodCrashLooping: 'max_over_time(kube_pod_container_status_waiting_reason{reason="CrashLoopBackOff"}[5m]) >= 1', KubeDeploymentReplicasMismatch: 'kube_deployment_spec_replicas != kube_deployment_status_replicas_available', HighErrorRate5xx: 'sum(rate(nginx_ingress_controller_requests{status=~"5.."}[5m])) / sum(rate(nginx_ingress_controller_requests[5m])) > 0.01', KubeContainerOOMKilled: 'increase(kube_pod_container_status_restarts_total[10m]) > 0 and kube_pod_container_status_last_terminated_reason{reason="OOMKilled"} == 1', NodeMemoryHigh: '1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes > 0.9', KubeHpaMaxedOut: 'kube_horizontalpodautoscaler_status_current_replicas == kube_horizontalpodautoscaler_spec_max_replicas', TargetDown: 'up == 0', CertificateExpiringSoon: 'certmanager_certificate_expiration_timestamp_seconds - time() < 14 * 86400', KubePodNotScheduled: 'kube_pod_status_phase{phase="Pending"} == 1 and kube_pod_status_scheduled{condition="false"} == 1' };
  /** the detail range an alert opens on: the last hour when it began within it (the default, live), else a window around its active span */
  function alertWindow(id) {
    const { sid, t, ph, cid } = get(), a = alertsOf(sid, t, ph, cid).find(x => x.id === id); if (!a || a.at >= t - H) return null;
    const end = a.end ?? t, pad = Math.max(900, Math.round((end - a.at) / 2));
    return a.end ? { from: a.at - pad, to: Math.min(t, end + pad), live: false } : { from: a.at - pad, to: t, live: true };
  }
  function alertDetail(id) {
    const { w, sid, t, ph, cid } = get(), all = alertsOf(sid, t, ph, cid), a = all.find(x => x.id === id);
    if (!a) return C.emptyState.render({ icon: 'bell', plainIcon: true, title: L('sim.v.alert.none'), description: L('sim.v.alert.retention') });
    const [ns, obj] = a.target.includes('/') ? a.target.split('/') : [a.target, ''];
    const wl = w.workloads.find(x => x.ns === ns && x.name === obj), firing = a.state === 'firing';
    const head = C.pageHeader.render({ icon: 'bell', title: a.name, context: [L('sim.view.alerts'), ns, w.cluster.name].filter(Boolean).join(' · '), size: 'sm', after: status(firing ? 'error' : 'ok', a.state), end: a.incident ? C.button.render({ label: alertText(sid)?.incident ?? '', icon: 'arrow-up-right', variant: 'link', action: 'sim.go', arg: { page: 'incident' } }) : '' });
    const summary = sumBar({ label: L('sim.view.alerts'), items: [{ id: 's', label: L('sim.v.c.severity'), value: a.severity }, { id: 'f', label: L('sim.v.c.start'), value: day(a.at) }, firing ? { id: 'd', label: L('sim.v.alert.duration'), value: lasted(t - a.at) } : { id: 'e', label: 'resolved', value: day(a.end ?? a.at) }] });
    /* what Alertmanager carries besides the title: the annotations (description, runbook), the expression over the window with its threshold and the firing span,
       the notifications it sent, silences, and the labels as chips */
    const TH = { HighErrorRate5xx: [1, '%'], KubeContainerOOMKilled: [0, L('sim.v.c.unitTimes')], KubePodCrashLooping: [1, ''], KubeDeploymentReplicasMismatch: [0, ''], NodeMemoryHigh: [90, '%'], KubeHpaMaxedOut: [0, ''], PersistentVolumeFillingUp: [10, '%'], TargetDown: [0, ''], CertificateExpiringSoon: [14, L('sim.v.c.unitDays')], KafkaConsumerLagHigh: [10000, ''], KubePodNotScheduled: [0, ''] };
    const [th, unit] = TH[a.name] ?? [1, ''], end = a.end ?? t, below = /PersistentVolume|Certificate/.test(a.name), hh = hash(a.id);
    const dw = win('detailRange'), wFrom = dw.from, wTo = dw.to; /* the detail's range, like every detail chart: opening an alert sets it around the alert's active span (alertWindow) */
    const count = ['', L('sim.v.c.unitTimes')].includes(unit), fn = at => count ? Math.round(fn0(at)) : fn0(at), fn0 = at => { const on = at >= a.at && at <= end, base = th || 1; return below ? (on ? base * .6 : base * 2.2) + base * .1 * Math.sin(at / 600 + hh) : (on ? base * 1.6 + base * .3 * Math.sin(at / 300) : base * (count ? .2 : .5) + base * .15 * Math.sin(at / 900 + hh)); };
    const exprChart = chart({ title: L('sim.v.alert.exprValue'), q: ALERT_EXPR[a.name] ?? a.name, fn, from: wFrom, to: wTo, unit, color: COUNT, refs: [{ value: th, label: L('sim.v.c.threshold', { v: `${th}${unit}` }), tone: 'limit' }], events: [{ at: a.at, label: L('sim.v.alert.firingAt', { at: day(a.at) }), kind: 'firing', tone: 'danger' }, ...(a.end ? [{ at: a.end, label: `resolved · ${day(a.end)}`, kind: 'resolved', tone: 'info' }] : [])], fmt: v => (count ? String(Math.round(v)) : String(Math.round(v * 10) / 10)) + unit, /* a count of pods or restarts has no fraction */ height: 170, sync: 'detailRange' });
    const exprBar = html`${bar('al-x', L('sim.v.alert.exprValue'), [{ id: 't', label: L('sim.v.c.threshold', { v: '' }).trim(), value: `${th}${unit}` }], exprChart)}`;
    const flow = bar('al-f', L('sim.v.alert.stateFlow'), [{ id: 'n', label: '', value: a.state }], html`<div class="v-steps">${[['pending', a.at - (a.severity === 'critical' ? 120 : 600), L('sim.v.alert.pendingText', { dur: a.severity === 'critical' ? '2m' : '10m' })], ['firing', a.at, L('sim.v.alert.sent')], ...(a.end ? [['resolved', a.end, L('sim.v.alert.resolvedText')]] : [])].map(([k, at, txt]) => C.stepRow.render({ state: k === 'firing' && firing ? 'run' : 'done', text: `${k} · ${txt}`, meta: day(at) }))}</div>`, true);
    const recv = [['Wake webhook', 'wake-agent /alerts', a.severity === 'critical' || a.incident ? L('sim.v.alert.recvIncident') : L('sim.v.alert.recvOnly')], ['Slack', `#oncall-${ns || 'platform'}`, L('sim.v.alert.recvSent')], ...(a.severity === 'critical' ? [['PagerDuty', 'payments-oncall', L('sim.v.alert.recvPaged')]] : [])];
    const recvBar = bar('al-n', L('sim.v.alert.receivers'), [{ id: 'n', label: '', value: `${recv.length}` }], C.dataTable.render({ clip: true, rowKey: 'r', rows: recv.map(([r, to, st]) => ({ r, to, st, at: day(a.at + 5) })), reveal: true, columns: [{ id: 'r', label: 'receiver', width: 'calc(var(--space-16) * 1.8)' }, { id: 'to', label: L('sim.v.c.target'), muted: true }, { id: 'st', label: L('sim.v.c.result'), optional: true }, { id: 'at', label: L('sim.v.c.time'), time: true, optional: true, width: 'calc(var(--space-40) * .9)' }] }), false);
    const silence = get().S.muted?.includes?.(a.name) ? bar('al-s', 'silence', [{ id: 'n', label: '', value: L('sim.v.alert.min30') }], empty(L('sim.v.alert.silenced', { name: a.name, who: ME })), false) : ''; /* no silence, no card */
    const ann = a.incident ? alertText(sid)?.annotations : null, rbUrl = ann?.runbook_url ?? `https://runbooks.acme.example/alerts/${a.name}.md`; /* the incident's alert carries its own annotations (world alertText) */
    const notes = sumBar({ label: L('sim.v.alert.notes'), items: [{ id: 'd', label: '', value: L('sim.v.alert.notes') }], body: html`<div class="v-stack">${C.propertyGrid.render({ items: [{ id: 'sum', label: 'summary', value: a.summary }, { id: 'rb', label: 'runbook_url', value: C.button.render({ label: rbUrl, tip: rbUrl, icon: 'arrow-up-right', variant: 'link', action: 'sim.openUrl', arg: rbUrl }) }, { id: 'dash', label: 'dashboard', value: C.button.render({ label: ann?.dashboard_url ? alertText(sid).dashboardName : L('sim.v.alert.dashboard', { ns: ns || 'cluster' }), tip: ann?.dashboard_url ?? '', icon: 'arrow-up-right', variant: 'link', action: ann?.dashboard_url ? 'sim.openUrl' : 'sim.noop', arg: ann?.dashboard_url ?? '' }) }] })}</div>`, open: true, toggle: { action: 'sim.noop' } }); /* annotations read one under another: a long URL never runs past the pane */
    const labels = [['alertname', a.name], ['severity', a.severity], ['cluster', w.cluster.name], ['namespace', ns], ...(obj ? [[wl ? wl.kind.toLowerCase() : 'target', obj]] : [])];
    const labelBar = bar('al-l', 'Labels', [{ id: 'n', label: '', value: String(labels.length) }], html`<div class="v-chips">${labels.map(([k, v]) => C.badge.render({ label: `${k}=${v}`, tone: 'neutral', size: 'sm' }))}</div>`, true);
    const forDur = a.severity === 'critical' ? '2m' : '10m';
    const rule = ALERT_EXPR[a.name] ? bar('al-r', L('sim.v.alert.rule'), [{ id: 'f', label: 'for', value: forDur }], C.codeBlock.render({ path: 'monitoring/PrometheusRule/kube-prometheus-rules.yaml', syntax: 'yaml', text: [`- alert: ${a.name}`, `  expr: ${ALERT_EXPR[a.name]}`, `  for: ${forDur}`, '  labels:', `    severity: ${a.severity}`, '  annotations:', `    summary: ${a.summary}`, `    runbook_url: https://runbooks.acme.example/alerts/${a.name}.md`].join('\n'), wrap: true, file: `${a.name}.yaml` }), true) : ''; /* the rule and its expr are open: what fired is read without a press */
    const same = all.filter(x => x.name === a.name && x.target === a.target);
    const hist = bar('al-h', L('sim.v.alert.history'), [{ id: 'n', label: L('sim.v.c.d90'), value: `${num(same.length)}` }], C.dataTable.render({ clip: true, rowKey: 'id', rows: same.slice(0, 10), rowAction: 'sim.openAlert', activeKey: a.id, reveal: true, columns: [{ id: 'state', label: L('sim.v.c.state'), width: 'calc(var(--space-16) * 1.4)', cell: x => status(x.state === 'firing' ? 'error' : 'ok', x.state) }, { id: 'at', label: L('sim.v.c.start'), time: true, width: 'calc(var(--space-40) * .9)', cell: x => when(x.at) }, { id: 'd', label: L('sim.v.alert.duration'), value: true, cell: x => x.end ? lasted(x.end - x.at) : L('sim.v.alert.ongoing') }] }), same.length > 1);
    const acts = wl ? html`<div class="v-acts">${C.button.render({ label: `${wl.kind} ${wl.name}`, icon: wl.icon, variant: 'link', action: 'sim.openRow', arg: { id: `${wl.ns}/${wl.kind}/${wl.name}` } })}</div>` : '';
    return html`${head}${detailRow("", rangeCtl("detailRange", RETENTION.metrics))}${summary}${acts}${notes}${exprBar}${rule}${flow}${labelBar}${recvBar}${silence}${hist}`;
  }
  /* ---------- 이벤트 상세: 무엇이 누구에게 몇 번, 누가 보고했고, 그 대상은 지금 어떤지 ---------- */
  function eventDetail(id) {
    const { w, sid, t, cid } = get(), [at, kind, name] = id.split('|');
    const day24 = groupEv(eventsIn(w, sid, t - D, t, cid)), e = day24.find(x => x.kind === kind && x.name === name && Math.abs(x.at - Number(at)) < 2) ?? groupEv(eventsIn(w, sid, Number(at) - 1, Number(at) + 1, cid)).find(x => x.kind === kind && x.name === name);
    if (!e) return C.emptyState.render({ icon: 'k8s-event', plainIcon: true, title: L('sim.v.event.expired'), description: L('sim.v.event.retention') });
    const node = e.source === 'kubelet' ? (w.pods.find(p => p.name === e.name)?.node ?? (e.kind === 'Node' ? e.name : null)) : null;
    const instance = node ?? `${e.source}-${hex7(e.source + cid).slice(0, 5)}`;
    const keyOf = (k, n, nsx) => `${nsx || '_'}/${k}/${n}`, obj = findResource(keyOf(e.kind, e.name, e.ns));
    const objIcon = { Pod: 'k8s-pod', Node: 'k8s-node', ReplicaSet: 'k8s-replicaset', CronJob: 'k8s-cronjob', Job: 'k8s-job', Deployment: 'k8s-deployment', StatefulSet: 'k8s-statefulset', DaemonSet: 'k8s-daemonset', Application: 'k8s-application' }[e.kind] ?? 'k8s-pod';
    const head = C.pageHeader.render({ icon: 'k8s-event', title: e.reason, context: ['Event', e.ns, w.cluster.name].filter(Boolean).join(' · '), size: 'sm', after: status(e.type === 'Warning' ? 'warn' : 'idle', e.type) });
    const target = html`<div class="v-acts">${C.button.render({ label: `${e.kind} ${e.name}`, icon: objIcon, variant: 'secondary', size: 'sm', round: true, action: 'sim.openEventObject', arg: id })}${e.ns ? html`<span class="v-sub">namespace ${e.ns}</span>` : ''}</div>`;
    const summary = sumBar({ label: L('sim.view.events'), items: [{ id: 'n', label: L('sim.v.event.count'), value: num(e.n) }, { id: 'f', label: L('sim.v.event.first'), value: `${ymd(e.first ?? e.at)} ${hms(e.first ?? e.at)}` }, { id: 'l', label: L('sim.v.event.last'), value: `${ymd(e.at)} ${hms(e.at)}` }, { id: 's', label: L('sim.v.event.reporter'), value: e.source }, { id: 'i', label: L('sim.v.event.instance'), value: instance }] });
    const msg = bar('ev-msg', 'Message', [], html`<div class="v-line">${e.msg}</div>`, true); /* the message as kubectl describe shows it: a field of the event, not a quote */
    /* the object now */
    const now = obj ? html`<div class="v-sub">${C.statusIcon.render({ kind: obj.status[0] === 'busy' ? 'busy' : obj.status[0], text: L('sim.v.event.nowState', { kind: e.kind, st: obj.status[1] }) })}</div>` : html`<div class="v-sub">${C.statusIcon.render({ kind: 'idle', text: L('sim.v.event.gone', { kind: e.kind }) })}</div>`;
    const same = day24.filter(x => x.kind === e.kind && x.name === e.name);
    const sameBar = bar('ev-same', L('sim.v.event.sameTarget'), [{ id: 'd', label: '', value: L('sim.v.c.h24') }, ...eventHead(same)], same.length ? eventTable(same.slice(0, 20)) : empty(L('sim.v.c.noEvents')), true);
    const sameReason = day24.filter(x => x.reason === e.reason), objs = new Set(sameReason.map(x => x.kind + '/' + x.name)).size;
    const reasonBar = bar('ev-reason', L('sim.v.event.sameReason'), [{ id: 'n', label: L('sim.v.c.h24'), value: num(sameReason.reduce((a, x) => a + x.n, 0)) }, { id: 'o', label: 'Object', value: num(objs) }], html`<div class="v-acts">${C.button.render({ label: L('sim.v.event.reasonList', { reason: e.reason }), icon: 'arrow-up-right', variant: 'link', action: 'sim.go', arg: { page: 'events', reason: e.reason, type: e.type } })}</div>`, false);
    /* related objects named in the message or owning the object */
    const rel = [];
    const job = /(?:Created|Deleted) job (\S+)/.exec(e.msg)?.[1], pod = /(?:Created pod: |pod: )(\S+)/.exec(e.msg)?.[1];
    if (job) rel.push({ kind: 'Job', name: job, ns: e.ns, why: /Deleted/.test(e.msg) ? L('sim.v.event.deletedBy') : L('sim.v.event.createdBy') });
    if (pod) rel.push({ kind: 'Pod', name: pod, ns: e.ns, why: L('sim.v.event.createdBy'), open: !!findResource(keyOf('Pod', pod, e.ns)) });
    if (e.owner?.name && !(e.owner.kind === e.kind && e.owner.name === e.name)) rel.push({ kind: e.owner.kind, name: e.owner.name, ns: e.ns, why: 'Owner', open: !!findResource(keyOf(e.owner.kind, e.owner.name, e.ns)) });
    if (node && e.kind !== 'Node') rel.push({ kind: 'Node', name: node, ns: '', why: L('sim.v.event.reporterNode'), open: true });
    const relBar2 = rel.length ? bar('ev-rel', L('sim.v.c.related'), [{ id: 'n', label: '', value: String(rel.length) }], C.dataTable.render({ clip: true, rowKey: 'id', rows: rel.map((x, i) => ({ ...x, id: 'r' + i })), reveal: true, columns: [{ id: 'kind', label: L('sim.v.c.kind'), width: 'calc(var(--space-16) * 1.4)' }, { id: 'name', label: L('sim.v.c.name'), cell: x => x.open ? C.button.render({ label: x.name, variant: 'link', action: 'sim.openRow', arg: { id: keyOf(x.kind, x.name, x.ns) } }) : x.name }, { id: 'why', label: L('sim.v.c.relation'), muted: true, optional: true }] })) : '';
    const iso = a => new Date((T0 + a) * 1000).toISOString().replace('.000', '');
    const yaml = ['apiVersion: v1', 'kind: Event', 'metadata:', `  name: ${e.name}.${hex7(id).padEnd(16, '0').slice(0, 16)}`, `  namespace: ${e.ns || 'default'}`, `  uid: ${hex7(id)}-${hex7(id + 'u').slice(0, 4)}-${hex7(id + 'v').slice(0, 4)}`, 'involvedObject:', `  kind: ${e.kind}`, `  name: ${e.name}`, ...(e.ns ? [`  namespace: ${e.ns}`] : []), `reason: ${e.reason}`, `message: ${JSON.stringify(e.msg)}`, `type: ${e.type}`, `count: ${e.n}`, `firstTimestamp: "${iso(e.first ?? e.at)}"`, `lastTimestamp: "${iso(e.at)}"`, 'source:', `  component: ${e.source}`, ...(node ? [`  host: ${node}`] : []), `reportingComponent: ${e.source}`, `reportingInstance: ${instance}`].join('\n');
    const yamlBar = bar('ev-yaml', 'YAML', [{ id: 'k', label: '', value: 'Event' }], C.codeBlock.render({ path: `${e.ns || 'default'}/Event/${e.name}.yaml`, syntax: 'yaml', text: yaml, wrap: true }), false);
    return html`${head}${target}${summary}${msg}${now}${sameBar}${reasonBar}${relBar2}${yamlBar}`;
  }
  /* an object's own events over the detail's range: those about it (same kind, name and namespace) and, for a workload, about its ReplicaSets and pods */
  function eventsOf(r) {
    const { w, sid, cid } = get(), dw = win('detailRange'), own = r.kind === 'Deployment' || r.kind === 'StatefulSet' || r.kind === 'DaemonSet' || r.kind === 'CronJob' || r.kind === 'Job';
    return eventsIn(w, sid, dw.from, dw.to, cid).filter(e => (e.ns || '') === (r.ns || '') && ((e.kind === r.kind && e.name === r.name) || (own && ['ReplicaSet', 'Pod', 'Job'].includes(e.kind) && e.name.startsWith(r.name + '-'))));
  }
  /* the events tab of every kind: the timeline of its changes and warnings, then its events (the same as the events page shows) */
  /* one event card everywhere (the events page, a detail's events tab, the home): the kubectl get events table and one head (Warning · Reason · 전체) */
  const eventTable = list => C.dataTable.render({ clip: true, rowKey: 'id', rows: list.map(e => ({ ...e, obj: `${e.kind}/${e.name}` })), rowAction: 'sim.openEvent', activeKey: get().S.sel?.type === 'event' ? get().S.sel.id : null, reveal: true, columns: ([{ id: 'at', label: 'Last Seen', time: true, width: 'calc(var(--space-16) * 2)', cell: e => when(e.at) }, { id: 'type', label: 'Type', width: 'calc(var(--space-16) * 1.6)', fit: true, cell: e => status(e.type === 'Warning' ? 'warn' : 'idle', e.type) }, { id: 'reason', label: 'Reason', width: 'calc(var(--space-16) * 2)', fit: true }, { id: 'obj', label: 'Object', optional: true, width: 'calc(var(--space-16) * 3.4)' }, { id: 'n', label: 'Count', value: true, optional: true, width: 'var(--space-16)', cell: e => num(e.n) }, { id: 'first', label: 'First Seen', time: true, optional: true, width: 'calc(var(--space-40) * .9)', cell: e => when(e.first) }, { id: 'source', label: 'Source', muted: true, optional: true, width: 'calc(var(--space-16) * 2.2)' }, { id: 'msg', label: 'Message', muted: true }]) });
  const eventHead = list => { const warn = list.filter(e => e.type === 'Warning').length; return [{ id: 'w', label: 'Warning', value: num(warn), ...(warn ? { tone: 'warn', priority: 3 } : {}) }, ...(topReasons(list) ? [{ id: 'r', label: 'Reason', value: topReasons(list), priority: 2 }] : []), { id: 'n', label: L('sim.v.c.all'), value: num(list.length), priority: 1 }]; };
  function eventsTab(r, evs, ownName = r.name) {
    const { sid, cid, t } = get(), dw = win('detailRange'), from = dw.from;
    const own = allChanges(sid, cid).filter(c => c.lane !== 'symptom' && (c.title.endsWith(' ' + ownName) || c.title.endsWith(' ' + r.name))), evg = groupEv(evs), warnG = evg.filter(e => e.type === 'Warning').length;
    const tlBar = r.kind === 'Node' ? '' : bar('d-tl', L('sim.v.c.timeline'), [{ id: 'c', label: L('sim.v.c.changes'), value: num(own.filter(c => c.at >= from).length) }, { id: 'w', label: 'Warning', value: num(warnG) }], timeline({ from, to: dw.to, changes: own, events: evs.filter(e => e.type === 'Warning'), zoom: 'sim.r.detailRange', home: { from: t - 3600, to: t } }), !!(warnG || own.some(c => c.at >= from)));
    const events = bar('d-e', L('sim.view.events'), eventHead(evg), evg.length ? eventTable(evg.slice(0, 20)) : empty(L('sim.v.c.noEvents')), true);
    return html`${tlBar}${events}`;
  }
  /* what the last rollout changed, from one source: for a scenario workload the template change its rollback undoes (the same lines the evidence
     names), otherwise the image tag the last revision moved to; the previous revision's image follows from it */
  function rolloutOf(r) {
    const { s } = get(), o = r.scenario ? (s?.options ?? []).find(x => x.kind === '롤백' && x.diff && /deployment/.test(x.diff.path)) : null;
    if (o) { const img = side => o.diff[side].find(l => /image:/.test(l))?.split('image:')[1]?.trim(), prevImg = img('after'), badImg = img('before'), rolled = !!r.rolledBack;
      return { path: o.diff.path, minus: o.diff.after, plus: o.diff.before, prevImage: prevImg ? prevImg.split('/').pop() : (r.image ?? '').split('/').pop(), badImage: badImg ? badImg.split('/').pop() : (r.image ?? '').split('/').pop(), rolled }; }
    const prev = (r.image ?? '').replace(/:(\d+)\.(\d+)\.(\d+)$/, (m0, a, b, c) => Number(c) > 0 ? `:${a}.${b}.${Number(c) - 1}` : Number(b) > 0 ? `:${a}.${Number(b) - 1}.9` : `:${Math.max(0, Number(a) - 1)}.9.9`);
    return { path: `apps/${r.name}/deployment.yaml`, minus: [`image: ${prev}`], plus: [`image: ${r.image}`], prevImage: prev.split('/').pop() };
  }
  /* one row under a detail's head: its tabs at the start, the time range at the end (the same place in every detail; a detail without tabs keeps the row for the range) */
  const detailRow = (tabs, range) => html`<div class="v-drow">${tabs ? html`<div class="v-kinds">${tabs}</div>` : ''}${range ? html`<span class="v-drow-r">${range}</span>` : ''}</div>`;
  function resourceDetail(key, lines = '', focus = {}) {
    const { S, w, sid, t, ph, cid } = get(), r = findResource(key);
    if (!r) return C.emptyState.render({ icon: 'search', plainIcon: true, title: L('sim.v.detail.none'), description: L('sim.v.detail.gone') });
    const dw = win('detailRange'), from = dw.from, evs = eventsOf(r);
    const pods = r.kind === 'Pod' || r.kind === 'Application' ? [] : r.kind === 'Node' ? w.pods.filter(p => p.node === r.name) : w.pods.filter(p => p.owner === r || (p.owner?.name === r.name && p.ns === r.ns));
    if (r.kind === 'Application') return appDetail(r, key, focus, lines);
    if (EXTRA_ICON[r.kind]) return G.detail(r, lines); /* Service · PVC · Job · Secret · Certificate · Helm: the same frame, their own sections */ /* the Application has its own view; `y` opens its YAML there */
    const head = C.pageHeader.render({ icon: r.icon, title: r.name, context: [r.kind, r.ns || null, w.cluster.name].filter(Boolean).join(' · '), size: 'sm', after: r.kind === 'Pod' ? podCell(r) : statusCell(r.status), end: G.actionButton(r) }); /* the head's state is the list's STATUS column */
    /* one status line: what kubectl get would print for it, as named values */
    const facts = r.kind === 'Pod' ? [{ id: 'r', label: 'Ready', value: r.ready === '1/1' ? 'True' : 'False', priority: 4, ...(r.ready === '1/1' ? {} : { tone: 'danger' }) }, { id: 's', label: L('sim.v.detail.restarts'), value: String(r.restarts), priority: 4, ...(r.restarts > 2 ? { tone: 'danger' } : {}) }, ...(r.node ? [{ id: 'n', label: 'Node', value: r.node, action: 'sim.openRow', arg: { id: `_/Node/${r.node}` } }] : []), ...(r.node && !/Pending/.test(r.status[1]) ? [{ id: 'i', label: 'IP', value: r.ip }] : []), { id: 'a', label: 'Age', value: kubeAge(r.age) }, ...(r.owner.kind === 'CronJob' ? [{ id: 'j', label: 'Job', value: r.name.replace(/-[a-z0-9]{4,5}$/, '') }] : []), { id: 'o', label: r.owner.kind, value: r.owner.name, action: 'sim.openRow', arg: { id: `${r.ns}/${r.owner.kind}/${r.owner.name}` } }]
      : r.kind === 'Node' ? [{ id: 'p', label: 'NodeGroup', value: r.pool }, { id: 'z', label: 'Zone', value: r.zone }, ...(r.status[0] === 'idle' ? [{ id: 'l', label: 'Last seen', value: when(r.lastSeen ?? -22 * 60) }] : [{ id: 'c', label: 'CPU', value: r.cpu + '%' }, { id: 'm', label: L('sim.v.c.memory'), value: r.mem + '%' }, { id: 'n', label: 'Pod', value: String(r.pods) }])]
        : r.kind === 'CronJob' ? (() => { const runs = cronRuns(r, t, 12), ok = runs.filter(x => x.result[0] === 'ok').length, bad = runs.filter(x => x.result[0] === 'error').length; return [{ id: 'l', label: L('sim.v.detail.lastRun'), value: `${when(runs[0]?.at)} · ${runs[0]?.result[1] ?? ''}` }, { id: 'n', label: L('sim.v.detail.nextRun'), value: r.suspend ? L('sim.v.detail.noneSuspend') : when(cronLast(r, t) + r.every) }, { id: 'h', label: L('sim.v.detail.lastRuns', { n: runs.length }), value: `${L('sim.v.detail.okFail', { ok, bad })}${runs.length - ok - bad ? ` · ${L('sim.v.detail.runningN', { n: runs.length - ok - bad })}` : ''}`, ...(bad ? { tone: 'warn' } : {}) }, { id: 's', label: 'Schedule', value: `${r.cron} · ${r.human}` }, { id: 'u', label: 'Suspend', value: r.suspend ? 'True' : 'False' }]; })()
        : [{ id: 'r', label: 'Ready', value: num(r.ready), ...(r.ready < r.replicas ? { tone: 'warn' } : {}) }, { id: 'g', label: 'Desired', value: num(r.replicas) }, ...(r.rev ? [{ id: 'v', label: 'Revision', value: String(r.rev) }] : []), { id: 'a', label: 'Age', value: kubeAge(r.age) }, ...(r.image ? [{ id: 'i', label: 'Image', value: r.image.split('/').pop() }] : [])];
    const status = sumBar({ label: L('sim.v.c.state'), open: !['ok', 'idle'].includes(r.status[0]), items: [{ id: 'st', label: '', value: html`<span class="wsc-t">${r.kind === 'Pod' ? podCell(r) : statusCell(r.status)}</span>`, priority: 9 }, ...facts] }); /* the state leads whole (the list's STATUS word), Ready and Restarts stay before the rest */
    /* graphs: memory and CPU against request and limit (a pod: its own; a workload: the sum of its pods; a node: its use against allocatable) */
    /* a mark on a chart says what happened then: the event's reason, its message, how many times */
    const marks = [...evs.filter(e => e.type === 'Warning').slice(0, 6).map(e => ({ at: e.at, label: `${e.reason} · ${e.msg}${e.n > 1 ? ` · ${L('sim.v.c.times', { n: num(e.n) })}` : ''}`, kind: e.reason, tone: 'warning' }))];
    let graphs = [];
    const nodeCpu = at => Math.max(0, Math.min(99, r.cpu + 6 * Math.sin(at / 700))), nodeMem = at => Math.max(0, Math.min(99, r.mem + 3 * Math.sin(at / 900)));
    const nodeCpuM = at => nodeCpu(at) / 100 * r.cpuCores * 1000, nodeMemMi = at => nodeMem(at) / 100 * r.memGi * 1024, allocMem = r.memGi * .93 * 1024;
    const memSum = at => { const vs = pods.filter(p => p.status[0] === 'ok').map(p => podMem(p, sid, ph)(at)).filter(v => v != null); /* the Running pods' sum: a pod waiting to restart has no sample */ return vs.length ? vs.reduce((a, v) => a + v, 0) : null; }; /* the pods that have a sample then; none, no sample */
    const memFn = r.kind === 'Pod' ? podMem(r, sid, ph) : memSum, cpuFn = r.kind === 'Pod' ? podCpu(r, sid) : at => pods.reduce((a, p) => a + podCpu(p, sid)(at), 0);
    const notRun = (r.kind === 'Pod' && /Pending|ContainerCreating|ImagePull|ErrImagePull/.test(r.status[1])) || (r.kind === 'Node' && r.status[0] === 'idle');
    if (notRun) graphs = [];
    else if (r.kind === 'Pod') graphs = [chart({ title: L('sim.v.detail.memWs'), q: `container_memory_working_set_bytes{namespace="${r.ns}",pod="${r.name}",container!=""}`, fn: podMem(r, sid, ph), from, to: dw.to, unit: 'Mi', color: MEM, refs: [{ value: r.memReq, label: L('sim.v.c.reqV', { v: `${r.memReq}Mi` }), tone: 'request' }, { value: r.memLim, label: L('sim.v.c.limV', { v: `${r.memLim}Mi` }), tone: 'limit' }], events: marks, fmt: v => Math.round(v) + 'Mi', height: 180, sync: 'detailRange' }), chart({ title: 'CPU', q: `rate(container_cpu_usage_seconds_total{namespace="${r.ns}",pod="${r.name}"}[5m])`, fn: podCpu(r, sid), from, to: dw.to, unit: 'm', color: CPU, refs: [{ value: r.cpuReq, label: L('sim.v.c.reqV', { v: `${r.cpuReq}m` }), tone: 'request' }], events: marks, fmt: v => Math.round(v) + 'm', height: 180, sync: 'detailRange' })];
    /* a node reads its use in the pod's units: % of the machine (node_exporter) × its capacity, against the summed requests and allocatable */
    else if (r.kind === 'Node') graphs = [chart({ title: L('sim.v.metric.cpu'), q: `100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle",instance="${r.internalIP}:9100"}[5m])))`, fn: nodeCpuM, from, to: dw.to, unit: 'm', color: CPU, refs: [{ value: r.cpuReq, label: L('sim.v.c.reqV', { v: `${num(r.cpuReq)}m` }), tone: 'request' }, { value: allocCpu(r), label: `allocatable ${num(allocCpu(r))}m`, tone: 'limit' }], fmt: v => num(Math.round(v)) + 'm', sync: 'detailRange' }), chart({ title: L('sim.v.metric.mem'), q: `100 * (1 - node_memory_MemAvailable_bytes{instance="${r.internalIP}:9100"} / node_memory_MemTotal_bytes{instance="${r.internalIP}:9100"})`, fn: nodeMemMi, from, to: dw.to, unit: 'Mi', color: MEM, refs: [{ value: r.memReq, label: L('sim.v.c.reqV', { v: `${num(r.memReq)}Mi` }), tone: 'request' }, { value: allocMem, label: `allocatable ${num(Math.round(allocMem))}Mi`, tone: 'limit' }], fmt: v => num(Math.round(v)) + 'Mi', sync: 'detailRange' })];
    else if (pods.length) graphs = [chart({ title: L('sim.v.detail.memSum', { n: pods.length }), fn: memSum, from, to: dw.to, unit: 'Mi', color: MEM, refs: [{ value: r.memReq * pods.length, label: L('sim.v.detail.reqSum'), tone: 'request' }, { value: r.memLim * pods.length, label: L('sim.v.detail.limSum'), tone: 'limit' }], events: marks, fmt: v => Math.round(v) + 'Mi', height: 180, sync: 'detailRange' }), chart({ title: L('sim.v.detail.cpuSum', { n: pods.length }), fn: at => pods.reduce((a, p) => a + podCpu(p, sid)(at), 0), from, to: dw.to, unit: 'm', color: CPU, refs: [{ value: r.cpuReq * pods.length, label: L('sim.v.detail.reqSum'), tone: 'request' }], fmt: v => Math.round(v) + 'm', height: 180, sync: 'detailRange' })];
    /* a workload's memory per pod (the five largest), so one pod running away is visible */
    const perPod = (r.kind === 'Deployment' || r.kind === 'StatefulSet' || r.kind === 'DaemonSet') && pods.length > 1 && !notRun ? chart({ named: true, title: L('sim.v.detail.memTop', { n: Math.min(5, pods.length) }), series: [...pods].sort((a, b) => b.memReq * b.use - a.memReq * a.use).slice(0, 5).map((p, i) => ({ key: p.name, name: p.name, color: `--series-${i + 1}`, fn: podMem(p, sid, ph) })), from, to: dw.to, unit: 'Mi', fmt: v => Math.round(v) + 'Mi', height: 180, sync: 'detailRange' }) : '';
    /* the charts live in 요약 as bars, as on the home: closed, the bar reads the current value against its request or allocatable; opened, the large chart
       (zoom, range) shows in place — no separate metric view under a detail */
    const reqOf = k => (r.kind === 'Pod' ? [r] : pods).reduce((a, p) => a + (p[k] ?? 0), 0);
    const mBars = notRun || !graphs.length ? [] /* nothing runs, nothing is measured: no card says so */
      : r.kind === 'Node' ? [bar('d-mc', 'CPU', useHead({ fn: nodeCpuM, now: nodeCpuM(dw.to), req: r.cpuReq, lim: allocCpu(r), unit: 'm', from, to: dw.to, limLabel: 'allocatable', ofLabel: L('sim.v.detail.ofAlloc'), reqWarn: false }), graphs[0], false),
         bar('d-mm', L('sim.v.c.memory'), useHead({ fn: nodeMemMi, now: nodeMemMi(dw.to), req: r.memReq, lim: allocMem, unit: 'Mi', from, to: dw.to, limLabel: 'allocatable', ofLabel: L('sim.v.detail.ofAlloc'), reqWarn: false }), graphs[1], false)]
      : [bar('d-mm', L('sim.v.c.memory'), useHead({ fn: memFn, now: memFn(dw.to), req: reqOf('memReq'), lim: reqOf('memLim'), unit: 'Mi', from, to: dw.to }), html`${graphs[0]}${perPod ? html`<div class="v-grid v-grid-1">${perPod}</div>` : ''}`, memFn(dw.to) > reqOf('memLim') * .9),
         bar('d-mc', 'CPU', useHead({ fn: cpuFn, now: cpuFn(dw.to), req: reqOf('cpuReq'), unit: 'm', from, to: dw.to }), graphs[1], false)];
    const graphBar = mBars.length ? html`<div class="v-dmetrics">${[...mBars, ...(notRun ? [] : G.ioBars(r, pods, from, dw.to))]}</div>` : '';
    /* a node: its conditions (lastTransitionTime), taints and root disk, the things that decide whether pods land and stay on it */
    const nf = r.kind === 'Node' ? nodeFacts(r, w) : null;
    const nodeBar = nf ? bar('d-nc', L('sim.v.detail.conditions'), [{ id: 'd', label: L('sim.v.detail.disk'), value: nf.disk == null ? '' : `${nf.disk}%`, ...(nf.disk >= 80 ? { tone: 'warn' } : {}) }, { id: 'i', label: 'inode', value: nf.inode == null ? '' : `${nf.inode}%` }, { id: 't', label: 'taint', value: String(nf.taints.length) }, { id: 'k', label: 'kubelet', value: nf.kubelet }],
      html`${C.dataTable.render({ clip: true, rowKey: 'type', rows: nf.conditions, reveal: true, columns: [{ id: 'type', label: 'Type' }, { id: 'status', label: 'Status', width: 'calc(var(--space-16) * 1.5)', fit: true, cell: x => statusCell([x.type === 'Ready' ? (x.status === 'True' ? 'ok' : 'warn') : x.status === 'False' ? 'ok' : x.status === 'Unknown' ? 'idle' : 'warn', x.status]) }, { id: 'at', label: 'LastTransitionTime', time: true, optional: true, width: 'calc(var(--space-40) * .9)', cell: x => when(x.at) }, { id: 'reason', label: 'Reason', muted: true, optional: true }] })}`, nf.disk >= 80) : '';
    /* a Deployment's revisions as ReplicaSets: which template runs now, which one it replaced, and how many pods each holds */
    const rsOf = p => p.name.slice(r.name.length + 1).split('-')[0];
    const rsNow = r.kind === 'Deployment' && pods.length ? [...new Set(pods.map(rsOf))] : [];
    const rsRows = rsNow.length ? [
      ...rsNow.map((rs, i) => { const ps = pods.filter(p => rsOf(p) === rs), young = Math.min(...ps.map(p => p.age)); return { id: rs, rev: String(r.rev - i), rs: `${r.name}-${rs}`, image: i === 0 ? (r.image ?? '').split('/').pop() : rolloutOf(r).prevImage, pods: String(ps.length), at: when(t - young) }; }), /* each ReplicaSet carries its own template's image: the newest the current one, the older the previous one */
      { id: 'prev', rev: String(r.rev - rsNow.length), rs: `${r.name}-${r.name === 'payments' ? '5d4b8' : sfx(r.name + 'rs' + (r.rev - rsNow.length), 5)}`, image: rolloutOf(r).rolled ? rolloutOf(r).badImage : rolloutOf(r).prevImage, pods: '0', at: when(t - Math.max(...pods.map(p => p.age)) - (r.scenario ? 3 * D + 2 * H : 3 * D)) }] : []; /* the previous revision ran for days before this one */
    const rsBar = rsRows.length ? bar('d-rs', 'ReplicaSet', [{ id: 'r', label: L('sim.v.detail.currentRev'), value: String(r.rev) }], C.dataTable.render({ clip: true, rowKey: 'id', rows: rsRows, reveal: true, columns: [{ id: 'rev', label: 'Revision', value: true, width: 'var(--space-16)' }, { id: 'rs', label: 'Name' }, { id: 'pods', label: 'Pods', value: true, width: 'var(--space-16)' }, { id: 'image', label: 'Image', muted: true, optional: true }, { id: 'at', label: 'Created', time: true, optional: true, width: 'calc(var(--space-16) * 1.6)' }] }), true) : '';
    /* ---- kind-specific sections: what kubectl describe and an SRE's checklist hold for each kind ---- */
    const openCell = (kind2, ns2, name2) => C.button.render({ label: name2, variant: 'link', action: 'sim.openRow', arg: { id: `${ns2 || '_'}/${kind2}/${name2}` } });
    const relBar = rows => rows.length ? bar('d-rel', L('sim.v.c.related'), [{ id: 'n', label: '', value: String(rows.length) }], C.dataTable.render({ clip: true, rowKey: 'id', rows: rows.map((x, i) => ({ ...x, id: 'r' + i })), reveal: true, columns: [{ id: 'kind', label: L('sim.v.c.kind'), width: 'calc(var(--space-16) * 1.8)' }, { id: 'name', label: L('sim.v.c.name'), cell: x => x.open ? openCell(x.kind, x.ns, x.name) : x.name }, { id: 'why', label: L('sim.v.c.relation'), muted: true, optional: true }] }), true) : '';
    const K = { tables: '', props: '', labels: '', related: '', rollout: '', runs: '' }; /* 요약 in one order for every kind: status → time → metrics → status·container tables → conditions → the kind's own properties → labels */
    if (r.kind === 'Pod') {
      K.tables = G.containersBar(r);
      K.related = html`${relBar([{ kind: r.owner?.kind ?? '', name: r.owner?.name ?? '', ns: r.ns, why: 'Owner', open: !!w.workloads.find(x => x === r.owner || (x.name === r.owner?.name && x.ns === r.ns)) }, ...(r.node ? [{ kind: 'Node', name: r.node, ns: '', why: L('sim.v.detail.runningNode'), open: true }] : []), { kind: 'Service', name: r.owner?.kind === 'StatefulSet' ? `${r.owner.name}-headless` : r.owner?.name ?? '', ns: r.ns, why: 'selector app=' + (r.owner?.name ?? ''), open: ['Deployment', 'StatefulSet'].includes(r.owner?.kind) }, { kind: 'ConfigMap', name: `${r.owner?.name ?? 'app'}-config`, ns: r.ns, why: 'mount' }])}`;
    } else if (r.kind === 'Node') {
      const cap = [['cpu', `${r.cpuCores}`, `${num(allocCpu(r))}m`, `${num(r.cpuReq)}m`, `${r.cpu}%`], ['memory', `${r.memGi}Gi`, `${(r.memGi * .93).toFixed(1)}Gi`, `${num(r.memReq)}Mi`, `${r.mem}%`], ['pods', String(r.podCap), String(r.podCap), String(r.pods), ''], ['ephemeral-storage', `${r.ephGi}Gi`, `${Math.round(r.ephGi * .9)}Gi`, '', nf.disk == null ? '' : `${nf.disk}%`]].map(row => r.status[0] === 'idle' ? [row[0], row[1], row[2], '', ''] : row); /* a deleted node keeps its last known capacity; current use is gone */
      K.props = bar('d-cap', 'Capacity', [{ id: 't', label: '', value: r.type }, { id: 'o', label: 'OS', value: r.os ?? '' }, { id: 'r', label: 'runtime', value: r.runtime ?? '' }], html`${C.dataTable.render({ clip: true, rowKey: 'k', rows: cap.map(([k, c, a, q, u]) => ({ k, c, a, q, u })), reveal: true, columns: [{ id: 'k', label: 'Resource' }, { id: 'a', label: 'Allocatable', value: true, width: 'calc(var(--space-16) * 1.6)' }, { id: 'u', label: L('sim.v.detail.used'), value: true, width: 'var(--space-16)' }, { id: 'q', label: L('sim.v.detail.reqTotal'), value: true, optional: true, width: 'calc(var(--space-16) * 1.6)' }, { id: 'c', label: 'Capacity', value: true, optional: true, width: 'calc(var(--space-16) * 1.4)' }] })}`, true);
      K.labels = bar('d-lt', 'Labels · Taints', [{ id: 'l', label: 'Labels', value: String((r.labels ?? []).length) }, { id: 't', label: 'Taints', value: String((r.taints ?? []).length) }], html`<div class="v-chips">${(r.labels ?? []).map(x => C.badge.render({ label: x, tone: 'neutral', size: 'sm' }))}${(r.taints ?? []).map(x => C.badge.render({ label: x, tone: 'warn', size: 'sm' }))}</div>`, true);
    } else if (r.kind === 'StatefulSet') {
      /* a StatefulSet's pods are listed once, in the Pod card, each with its claim */
    } else if (r.kind === 'DaemonSet') {
      const cov = [...pods.map(p => ({ node: p.node, pod: p.name, st: p.status })), ...(r.excluded ?? []).map(x => ({ node: x.node, pod: '', st: ['idle', L('sim.v.detail.excludedWhy', { why: x.why })] }))];
      K.tables = bar('d-cov', L('sim.v.detail.nodeCoverage'), [{ id: 'd', label: 'Desired', value: num(r.desired ?? pods.length) }, { id: 'x', label: L('sim.v.detail.excluded'), value: num((r.excluded ?? []).length) }, { id: 's', label: 'selector', value: r.selector ?? '' }], C.dataTable.render({ clip: true, rowKey: 'node', rows: cov.slice(0, 50), reveal: true, columns: [{ id: 'node', label: 'Node' }, { id: 'st', label: 'Status', width: 'calc(var(--space-16) * 2.5)', fit: true, cell: x => statusCell(x.st) }, { id: 'pod', label: 'Pod', muted: true, optional: true }] }), !!(r.excluded ?? []).length);
    } else if (r.kind === 'CronJob') {
      const runs = cronRuns(r, t, 12), nexts = r.suspend ? [] : [1, 2, 3].map(k => cronLast(r, t) + k * r.every);
      K.runs = html`${bar('d-run', L('sim.v.detail.runs'), [{ id: 's', label: 'Schedule', value: `${r.cron} · ${r.human}` }, { id: 'c', label: L('sim.v.detail.concurrency'), value: r.concurrency }, { id: 'n', label: L('sim.v.detail.next'), value: nexts.length ? nexts.map(when).join(' · ') : L('sim.v.detail.noneSuspend') }],
        C.dataTable.render({ clip: true, rowKey: 'id', rows: runs.map(x => ({ ...x, st: x.result })), reveal: true, columns: [{ id: 'id', label: 'Job', cell: x => findResource(`${r.ns}/Job/${x.id}`) ? openCell('Job', r.ns, x.id) : x.id }, { id: 'st', label: L('sim.v.c.result'), width: 'calc(var(--space-16) * 2)', fit: true, cell: x => statusCell(x.st) }, { id: 'at', label: L('sim.v.c.start'), time: true, optional: true, width: 'calc(var(--space-16) * 2)', cell: x => when(x.at) }, { id: 'dur', label: L('sim.v.c.took'), value: true, optional: true, width: 'calc(var(--space-16) * 1.4)', cell: x => x.result[0] === 'busy' ? '' : (x.dur >= 60 ? `${Math.floor(x.dur / 60)}m${x.dur % 60}s` : `${x.dur}s`) } /* kubectl's duration form */] }))}`;
    } else if (r.kind === 'Deployment') {
      const ro = rolloutOf(r);
      /* each change keeps its own revision pair: after a rollback the latest change is the rollback (bad → good), and the change that made the incident stays as it was */
      const diffOf = (from, to, minus, plus) => C.codeBlock.render({ path: `${ro.path} · rev ${from} → rev ${to}`, text: ['@@ spec.template.spec.containers[0] @@', ...minus.map(l => '- ' + l.trim()), ...plus.map(l => '+ ' + l.trim())].join('\n'), diff: true });
      const strat = { id: 's', label: L('sim.v.detail.strategy'), value: (r.strategy ?? '').split(' · ')[0] };
      K.rollout = ro.rolled
        ? html`${bar('d-roll', L('sim.v.detail.rolloutLog'), [{ id: 'r', label: L('sim.v.detail.rollback'), value: `rev ${r.rev - 1} → ${r.rev}` }, strat], diffOf(r.rev - 1, r.rev, ro.plus, ro.minus), !focus.label)}${bar('d-roll0', L('sim.v.detail.badChange'), [{ id: 'r', label: 'Revision', value: `${r.rev - 2} → ${r.rev - 1}` }], diffOf(r.rev - 2, r.rev - 1, ro.minus, ro.plus), true)}`
        : html`${bar('d-roll', L('sim.v.detail.rolloutLog'), [{ id: 'r', label: 'Revision', value: `${r.rev - 1} → ${r.rev}` }, strat], diffOf(r.rev - 1, r.rev, ro.minus, ro.plus), true)}`;
      K.related = html`${relBar([...(r.app ? [{ kind: 'Application', name: r.app, ns: 'argocd', why: L('sim.v.detail.gitopsManaged'), open: true }] : []), { kind: 'Service', name: r.name, ns: r.ns, why: 'selector app=' + r.name, open: true }, { kind: 'ConfigMap', name: `${r.name}-config`, ns: r.ns, why: 'envFrom' }])}`;
    }
    const podsBar = pods.length ? bar('d-p', 'Pod', [{ id: 'n', label: '', value: String(pods.length) }, { id: 'b', label: L('sim.v.c.bad'), value: String(pods.filter(p => p.status[0] !== 'ok').length), ...(pods.some(p => p.status[0] !== 'ok') ? { tone: 'warn' } : {}) }, { id: 'r', label: 'Restarts', value: num(pods.reduce((a, p) => a + (p.restarts ?? 0), 0)) }, ...(r.kind !== 'Node' && pods.some(p => p.node) ? [{ id: 'nd', label: 'Node', value: num(new Set(pods.map(p => p.node).filter(Boolean)).size) }] : []),
      /* a node: the pods placed on it against the pods it may hold, on the same Pod card (the count is said once) */
      ...(r.kind === 'Node' && r.podCap ? [{ id: 'l', label: 'allocatable', value: num(r.podCap) }, { id: 'u', label: L('sim.v.detail.ofAlloc'), value: `${Math.round(100 * r.pods / r.podCap)}%`, ...(r.pods >= r.podCap * .9 ? { tone: 'danger' } : {}) }] : [])], C.dataTable.render({ clip: true, rowKey: 'id', rows: [...pods].sort((a, b) => (a.status[0] === 'ok') - (b.status[0] === 'ok')).slice(0, 12).map(p => ({ ...p, id: p.ns + '/Pod/' + p.name })), rowAction: 'sim.openRow', reveal: true, columns: [{ id: 'name', label: 'Name', lead: x => ({ icon: x.icon }) }, { id: 'status', label: 'Status', width: 'calc(var(--space-16) * 2)', fit: true, cell: x => podCell(x) }, { id: 'restarts', label: 'Restarts', value: true, optional: true, width: 'var(--space-16)' }, ...(r.kind === 'StatefulSet' ? [{ id: 'pvc', label: 'PVC', muted: true, optional: true, cell: x => r.pvcs?.find(v => v.pod === x.name)?.name ?? r.pvcs?.[pods.indexOf(x)]?.name ?? '' }] : [])] })) : '';
    const ownName = r.kind === 'Pod' ? r.owner.name : r.name;
    /* one view per object, in tabs; an entry point opens it at the right tab with what it came for in focus (a range, lines, an event, a revision) */
    const canLog = r.kind === 'Pod' || (r.kind !== 'Node' && pods.length > 0);
    const tabs = [['overview', L('sim.v.c.summary')], ['events', L('sim.view.events')], /* one order for every kind: 요약 (with its charts) · 이벤트 · 로그 · the kind's own · YAML · 관련 */ ...(canLog ? [['logs', L('sim.view.logs')]] : []), ...(r.kind === 'Deployment' ? [['rollout', L('sim.v.detail.tabRollout')]] : []), ...(r.kind === 'CronJob' ? [['runs', L('sim.v.detail.runs')]] : []), ['yaml', 'YAML'], ...(K.related ? [['related', L('sim.v.detail.tabRelated')]] : [])];
    const tab = tabs.some(([id]) => id === S.dtab) ? S.dtab : 'overview';
    const banner = focus.label && focus.tab === tab ? html`<div class="v-focus">${C.statusIcon.render({ kind: 'idle', icon: 'search', text: focus.label })}${C.button.render({ label: L('sim.v.detail.unfocus'), variant: 'link', action: 'sim.unfocus' })}</div>` : '';
    let body = '';
    if (tab === 'overview') body = html`${status}${graphBar}${K.tables}${podsBar}${nodeBar}${G.conditionBars(r)}${K.props}${G.propBars(r)}${K.labels}`;
    else if (tab === 'events') body = eventsTab(r, evs, ownName);
    else if (tab === 'logs') {
      const lp = r.kind === 'Pod' ? r : pods.find(p => p.status[0] !== 'ok') ?? pods[0], lf = focus.tab === 'logs' && focus.range ? focus.range : { from: t - 900, to: t };
      body = html`${logViewer(lp, { from: lf.from, to: lf.to, q: focus.tab === 'logs' ? focus.q ?? '' : '', exactRange: !!(focus.tab === 'logs' && focus.range), agg: r.kind === 'Pod' ? null : pods }).card}${C.button.render({ label: L('sim.v.detail.logList'), icon: 'arrow-up-right', variant: 'link', action: 'sim.go', arg: { page: 'logs', pod: lp.ns + '/' + lp.name } })}`;
    }
    else if (tab === 'rollout') body = html`${K.rollout}${rsBar}`;
    else if (tab === 'runs') body = K.runs;
    else if (tab === 'yaml') body = bar('d-yaml', 'YAML', [...(r.rev ? [{ id: 'r', label: 'Revision', value: String(r.rev) }] : []), { id: 'v', label: 'resourceVersion', value: String(1000000 + hash(r.name) % 9000000) }], yamlBody(r, focus.tab === 'yaml' ? focus.hl : null), true); /* the same shape as 롤아웃: a bar with the file, the code inside */
    else if (tab === 'related') body = K.related;
    const ranged = (tab === 'overview' && mBars.length) || (tab === 'events' && r.kind !== 'Node');
    const tabBar = detailRow(C.pillTabs.render({ id: 'sim-dtab', label: L('sim.v.c.view'), value: tab, tabs: tabs.map(([id, label]) => ({ id, label })), action: 'sim.dtab' }), ranged ? rangeCtl('detailRange', RETENTION.metrics) : '');
    return html`${head}${lines}${tabBar}${banner}${body}<div class="v-acts">${C.button.render({ label: L('sim.v.detail.askAi'), icon: 'ai', variant: 'ghost', size: 'sm', round: true, action: 'sim.openAi' })}</div>`;
  }
  /* the Application as an SRE reads it: where it stands (sync, health, revision, auto-sync), what it deployed over time, the last change as a diff,
     how its resources stand (Application → workload → pods, a flow of pod counts), and for a failed hook the hook itself */
  function appDetail(a, key, focus = {}, lines = '') {
    const { w, t, sid, s } = get(), hist = syncHistory(a).filter(x => x.at <= t), tw = a.target ?? w.workloads.find(x => x.name === a.name);
    const head = C.pageHeader.render({ icon: a.icon, title: a.name, context: `Application · argocd · ${w.cluster.name}`, size: 'sm', after: statusCell(a.status) });
    const status = sumBar({ label: L('sim.v.c.state'), items: [{ id: 's', label: 'Sync', value: html`<span class="wsc-t">${syncCell(syncOf(a))}</span>` }, { id: 'h', label: 'Health', value: html`<span class="wsc-t">${healthCell(healthOf(a))}</span>` }, { id: 'v', label: 'Revision', value: a.revision }, { id: 'a', label: L('sim.v.c.autoSync'), value: a.auto ? L('sim.v.c.on') : L('sim.v.c.off') }, { id: 'r', label: L('sim.v.app.repo'), value: `${a.repo} · ${a.path}` }] });
    const gw = win('gitRange'), from = gw.from;
    const tl = timeline({ from, to: gw.to, zoom: 'sim.r.gitRange', home: { from: get().t - 604800, to: get().t }, extra: hist.map(x => ({ id: 'sync:' + x.id, lane: x.result[0] === 'error' ? 'symptom' : 'deploy', at: T0 + x.at, tone: x.result[0] === 'error' ? 'danger' : x.result[0] === 'warn' ? 'warn' : 'run', tip: { time: day(x.at), kind: x.result[1], title: `${a.name} → ${x.revision}`, text: x.by } })) });
    /* the last change: the manifest lines that moved between the last two revisions */
    /* the files the last revision changed, as the GitOps screen lists them: a tree of the changed files beside the chosen file's diff */
    const scen = a.scenario && sid === 's5', deployDiff = scen ? ['   spec:', '     template:', '       spec:', '         containers:', '         - name: orders', '-          image: registry.local/orders:1.4.1', '+          image: registry.local/orders:1.5.0'].join('\n')
      : [`   spec:`, `     template:`, `       spec:`, `         containers:`, `         - name: ${a.name}`, ...(tw ? [`-          ${rolloutOf(tw).minus[0].trim()}`, `+          ${rolloutOf(tw).plus[0].trim()}`] : [L('sim.v.app.noDiff')])] /* the same source as the workload's 롤아웃: the previous template's image against the current one */.join('\n');
    const files = [{ path: `${a.path}/deployment.yaml`, change: 'M', text: deployDiff }, ...(scen ? [{ path: `${a.path}/hooks/smoke-test.yaml`, change: 'A', text: ['+apiVersion: batch/v1', '+kind: Job', '+metadata:', '+  name: smoke-test', '+  annotations:', '+    argocd.argoproj.io/hook: PreSync', '+    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation'].join('\n') }] : [])];
    const cur = files.find(f => f.path === get().S.appFile) ?? files[0], changeWord = k => L(k === 'A' ? 'sim.v.app.added' : 'sim.v.app.modified');
    const dirOf = f => f.path.split('/').slice(0, -1).join('/'), dirs = [...new Set(files.map(dirOf))];
    const tree = C.fileTree.render({ action: 'sim.appFile', current: cur.path, nodes: dirs.map(d => ({ id: d, name: d, children: files.filter(f => dirOf(f) === d).map(f => ({ id: f.path, name: f.path.split('/').pop(), letter: f.change, letterLabel: changeWord(f.change) })) })) });
    const diff = html`<div class="v-files">${tree}${C.codeBlock.render({ path: cur.path, tag: C.fileTree.letter(cur.change, changeWord(cur.change)), syntax: 'yaml', text: cur.text, diff: true, file: cur.path.split('/').pop() })}</div>`;
    /* resources: Application → workload → pod states, in pod counts */
    const pods = tw ? w.pods.filter(p => p.owner?.name === tw.name && p.ns === tw.ns) : [];
    const sts = [...new Set(pods.map(podStatus))].sort((x, y) => (x === 'Running' ? -1 : y === 'Running' ? 1 : 0)), nOf = x => pods.filter(p => podStatus(p) === x).length, toneOf = x => podTone(pods.find(p => podStatus(p) === x));
    const flow = tw && pods.length ? { ...sankey({ id: 'app-' + a.name, label: L('sim.v.app.resState'), visual: 'filledOutline', aspect: .4, gap: .1, fit: .8, nodes: [{ id: 'app', col: 0, value: pods.length, label: a.name, icon: 'k8s-application', tone: 'system', state: syncOf(a) === 'Synced' ? 'ok' : 'warn' }, { id: 'wl', col: 1, value: pods.length, label: `${tw.kind} ${tw.name}`, icon: tw.icon, tone: 'other', state: tw.status[0] === 'ok' ? 'ok' : 'warn' }, ...sts.map(x => ({ id: 's-' + x, col: 2, value: nOf(x), label: x, icon: toneOf(x) === 'ok' ? 'circle-check' : 'exclamation-triangle', state: toneOf(x) }))],
      links: [{ from: 'app', to: 'wl', value: pods.length, text: `Pod ${pods.length}` }, ...sts.map(x => ({ from: 'wl', to: 's-' + x, value: nOf(x), text: String(nOf(x)), state: toneOf(x) }))] }), live: true, stateLabels: POD_STATE_WORDS } : null;
    const hook = scen ? bar('d-hook', 'PreSync hook', [{ id: 's', label: '', value: html`<span class="wsc-t">${C.statusIcon.render({ kind: 'error', text: 'Job smoke-test Failed · BackoffLimitExceeded' })}</span>` }], html`${C.codeBlock.render({ path: 'smoke-test/smoke-test.log', syntax: 'log', text: (get().evidence.find(e => e.kind === "로그")?.raw ?? ''), wrap: true })}<div class="v-acts">${C.button.render({ label: 'Job smoke-test', icon: 'arrow-up-right', variant: 'link', action: 'sim.openRow', arg: { id: `${a.ns}/Job/smoke-test` } })}</div>`) : '';
    const failedN = hist.filter(x => x.result[0] === 'error').length;
    return html`${head}${lines}${status}${hook}${detailRow('', rangeCtl('gitRange', RETENTION.gitops))}
      ${bar('d-sync', L('sim.v.app.syncHistory'), [{ id: 'n', label: '', value: `${hist.length}` }, ...(failedN ? [{ id: 'f', label: L('sim.v.c.failed'), value: String(failedN), tone: 'danger' }] : [])], html`${tl}${C.dataTable.render({ clip: true, rowKey: 'id', rows: hist.filter(x => x.at >= gw.from && x.at <= gw.to), reveal: true, columns: [{ id: 'at', label: L('sim.v.c.time'), time: true, width: 'calc(var(--space-40) * .9)', cell: x => when(x.at) }, { id: 'revision', label: 'Revision', mono: true, width: 'calc(var(--space-16) * 1.3)' }, { id: 'result', label: L('sim.v.c.result'), fit: true, cell: x => statusCell(x.result) }, { id: 'by', label: L('sim.v.app.by'), muted: true, optional: true, width: 'calc(var(--space-16) * 1.4)' }] })}`)}
      ${bar('d-diff', L('sim.v.app.lastChange'), [{ id: 'r', label: '', value: hist[1] ? `${hist[1].revision} → ${a.revision}` : a.revision }, { id: 'f', label: L('sim.v.app.files'), value: num(files.length) }], diff, scen)}
      ${flow ? bar('d-res', L('sim.v.app.resState'), [{ id: 'n', label: 'Pod', value: num(pods.length) }, { id: 'b', label: L('sim.v.c.bad'), value: num(pods.filter(p => p.status[0] !== 'ok').length) }], html`<div class="v-flow">${C.flowGraph.render(flow)}</div>${C.button.render({ label: `${tw.kind} ${tw.name}`, icon: 'arrow-up-right', variant: 'link', action: 'sim.openRow', arg: { id: `${tw.ns}/${tw.kind}/${tw.name}` } })}`) : ''}
      ${bar('d-ayaml', 'YAML', [{ id: 'k', label: '', value: 'Application' }], yamlBody(a, null), focus.tab === 'yaml')}`;
  }

  /* the object's YAML, with the fields that matter (or the ones an evidence pointed at) highlighted; its head names the file as kubectl get -o yaml would save it */
  const yamlPath = r => `${r.ns ? r.ns + '/' : ''}${r.kind}/${r.name}.yaml`;
  const yamlBody = (r, want) => { const text = yamlOf(r), lines = text.split('\n'); const re = want?.length ? new RegExp(want.map(escapeRe).join('|')) : /OOMKilled|exitCode: 137|status: "False"|status: "Unknown"|restartCount: [1-9]/; const hl = lines.map((l, i) => re.test(l) ? i + 1 : 0).filter(Boolean);
    return C.codeBlock.render({ path: yamlPath(r), syntax: 'yaml', text, hl, file: `${r.name}.yaml` }); };

  /* ---------- 로그 보기 ---------- */
  /** log lines: level, time, text; lines that match are marked, and with context only matches and the lines around them stay */
  function logList(lines, q, context, around = 2, keepIndex = false) {
    const re = q ? new RegExp(escapeRe(q), 'i') : null;
    let show = lines.map((l, i) => ({ ...l, i: keepIndex && l.i != null ? l.i : i, hit: re ? re.test(l.text) : l.level === 'ERROR' }));
    if (context && re) { const keep = new Set(); show.forEach((l, i) => { if (l.hit) for (let k = i - around; k <= i + around; k++) keep.add(k); }); const out = []; let last = -2; show.forEach((l, i) => { if (keep.has(i)) { if (i > last + 1 && out.length) out.push({ gap: i - last - 1 }); out.push(l); last = i; } }); show = out; }
    if (show.length > 240) show = show.slice(-240); /* never thousands of rows in the page: the viewer pages, a preview shows its last lines */
    const mark = text => { if (!re) return text; const m = re.exec(text); return m ? html`${text.slice(0, m.index)}<mark>${m[0]}</mark>${text.slice(m.index + m[0].length)}` : text; };
    return html`<div class="v-log">${show.map(l => l.gap ? html`<div class="v-log-gap">${L('sim.v.log.skipped', { n: num(l.gap) })}</div>` : html`<div class="v-log-l" data-level="${l.level}"${l.hit ? ' data-hit' : ''}><span class="v-log-n">${l.i + 1}</span><span class="v-log-at">${hms(l.at)}</span><span class="v-log-lv">${l.level}</span><span class="v-log-tx">${mark(l.text)}</span></div>`)}</div>`;
  }
  /** a page of at most 200 lines: the newest page first; with a search, the page jumps to a match */
  function logPaged(rows, q, context, around = 2) {
    const { S } = get(), re = q ? new RegExp(escapeRe(q), 'i') : null;
    let list = rows;
    if (context && re) { const keep = new Set(); rows.forEach((l, i) => { if (re.test(l.text)) for (let k = i - around; k <= i + around; k++) keep.add(k); }); list = rows.map((l, i) => ({ ...l, i: l.i ?? i })).filter((l, i) => keep.has(i)); }
    const per = 20, pages = Math.max(1, Math.ceil(list.length / per)), page = S.logPage == null ? pages : Math.min(Math.max(1, S.logPage), pages); /* the shared pager: 20 lines a page */
    /* pages count back from the newest line, so the first page shown is always a full page of the latest lines */
    const end = list.length - (pages - page) * per, start = Math.max(0, end - per);
    const slice = list.slice(start, end).map((l, j) => ({ ...l, i: l.i ?? start + j }));
    return html`${logList(slice, q, false, 2, true)}${pages > 1 ? html`<div class="v-pager"><span class="v-sub">${L('sim.v.log.pageOf', { from: num(start + 1), to: num(end), n: num(list.length) })}</span>${C.pager.render({ page, pages, action: 'sim.logPage' })}</div>` : ''}`; /* one page needs no pager */
  }
  /* how a search shows: every line with the matches marked, or only the matches with N lines around them (named in product words) */
  const searchView = (exactRange = false) => { const { S } = get(), only = S.logContext ?? exactRange;
    return html`${C.pillTabs.render({ id: 'sim-lc', label: L('sim.v.log.searchResults'), value: only ? 'only' : 'all', tabs: [{ id: 'all', label: L('sim.v.log.allLines') }, { id: 'only', label: L('sim.v.log.onlyResults') }], action: 'sim.logContext' })}${only ? C.select.render({ value: L('sim.v.log.aroundN', { n: S.logAround ?? 2 }), menu: 'sim.logAroundMenu', label: L('sim.v.log.around') }) : ''}`; };
  /* one log viewer for a Pod: the 로그 page and the Pod's 로그 tab draw the same card (container choice, counts, paged lines) over a window */
  function logViewer(p, { from, to, q = '', level = 'all', exactRange = false, withSearch = true, agg = null } = {}) {
    const { S, sid } = get();
    /* a crash loop has two containers to read: the one running now and the previous one that died (kubectl logs --previous); a container that never started has none */
    const crash = /CrashLoopBackOff/.test(p.status[1]), notRun = /Pending|ContainerCreating|ImagePull|ErrImagePull/.test(p.status[1]), prev = crash && S.logPrev !== false;
    const pc = prevContainer(p, sid);
    /* a workload's pods read together (each line led by its pod), or one container of one pod (init and sidecar containers have their own short logs) */
    const many = agg && agg.length > 1 && S.logAgg !== 'one', cs = containersOf(p), cName = cs.some(c => c.name === S.logC) ? S.logC : cs.find(c => !c.init)?.name;
    const side = !many && cName !== p.owner?.name ? cs.find(c => c.name === cName) : null;
    let all = notRun ? [] : many ? agg.slice(0, 6).flatMap(x => /Pending|ContainerCreating/.test(x.status[1]) ? [] : logsOf(x, sid, to, to - from, exactRange).map(l => ({ ...l, text: `[${x.name.split('-').pop()}] ${l.text}` }))).sort((a, b) => a.at - b.at)
      : side ? (side.init ? [{ at: -p.age + 2, level: 'INFO', text: 'waiting for db host to accept connections' }, { at: -p.age + 4, level: 'INFO', text: 'db is up · exit 0' }] : Array.from({ length: 30 }, (_, i) => ({ at: to - (30 - i) * 30, level: 'INFO', text: `exporter sent spans count=${120 + hash(p.name + i) % 300} queue=0` })))
      : prev ? logsOf(p, sid, pc.end, pc.life, true) : logsOf(p, sid, to, to - from, exactRange);
    if (exactRange) all = all.filter(l => l.at >= from && l.at <= to);
    if (exactRange && p.scenario && !many && !side && !prev) { const win = logWindow(sid, p.name, from, to); if (win.length) all = win; } /* an incident window is the one the incident read (world logWindow): the same lines in every phase */
    const countBy = lv => { let n = 0; for (const l of all) if (l.level === lv) n++; return n; };
    const rows = all.map((l, i) => ({ ...l, i: l.n != null ? l.n - 1 : i })).filter(l => level === 'all' || l.level === level) /* a filtered view keeps each line's own number */, re = q ? new RegExp(q, 'i') : null, hits = re ? rows.filter(l => re.test(l.text)).length : rows.filter(l => l.level === 'ERROR').length;
    const card = sumBar({ label: p.name, open: true, toggle: { action: 'sim.noop' }, items: [{ id: 't', label: '', value: p.name, shrink: true }, { id: 'c', label: many ? 'Pod' : L('sim.v.c.container'), value: many ? L('sim.v.log.aggPods', { n: num(Math.min(6, agg.length)) }) : crash && !side ? `${p.owner.name} · ${prev ? 'previous' : L('sim.v.log.current')}` : cName, priority: 1 }, { id: 'h', label: q ? L('sim.v.log.match') : 'ERROR', value: `${num(hits)}`, priority: 5, ...(!q && hits ? { tone: 'danger' } : {}) }, ...(q ? [] : [{ id: 'wn', label: 'WARN', value: num(countBy('WARN')), priority: 2 }]), ...((le => le ? [{ id: 'le', label: L('sim.v.log.lastError'), value: hms(le.at), priority: 4 }] : [])(all.findLast(l => l.level === 'ERROR'))), { id: 'n', label: L('sim.v.log.lines'), value: num(rows.length), priority: 3 }] /* a short head keeps the errors, the last one and the line count; the container gives way first */, body: html`<div class="v-tools v-logbar">${agg && agg.length > 1 ? C.pillTabs.render({ id: 'sim-lagg', label: L('sim.v.c.view'), value: many ? 'all' : 'one', tabs: [{ id: 'all', label: L('sim.v.log.aggPods', { n: num(Math.min(6, agg.length)) }) }, { id: 'one', label: p.name }], action: 'sim.logAgg' }) : ''}${!many && cs.length > 1 ? C.pillTabs.render({ id: 'sim-lc', label: L('sim.v.c.container'), value: cName, tabs: cs.map(c => ({ id: c.name, label: c.init ? `${c.name} (init)` : c.name })), action: 'sim.logC' }) : ''}<span class="v-sw">${C.toggle.render({ on: S.logTs !== false, action: 'sim.logTs', label: L('sim.v.c.time') })}${L('sim.v.c.time')}</span><span class="v-sw">${C.toggle.render({ on: S.logWrap !== false, action: 'sim.logWrap', label: L('sim.v.log.wrap') })}${L('sim.v.log.wrap')}</span>${C.button.render({ label: L('sim.v.log.download'), icon: 'download', variant: 'ghost', size: 'sm', round: true, action: 'sim.logDl', arg: p.name })}${crash && !side && !many ? C.pillTabs.render({ id: 'sim-lpv', label: L('sim.v.c.container'), value: prev ? 'prev' : 'cur', tabs: [{ id: 'prev', label: L('sim.v.log.prevRun', { from: hms(pc.end - pc.life), to: hms(pc.end), exit: pc.exit }) }, { id: 'cur', label: L('sim.v.log.curRun', { n: num(p.restarts) }) }], action: 'sim.logPrev' }) : ''}${q && withSearch ? searchView(exactRange) : ''}</div>${rows.length ? html`<div class="v-logw"${S.logTs === false ? ' data-nots' : ''}${S.logWrap === false ? ' data-nowrap' : ''}>${logPaged(rows, q, (S.logContext ?? exactRange) && !!q, S.logAround ?? 2)}</div>` : empty(notRun ? L('sim.v.log.notStarted', { st: podStatus(p) }) : L('sim.v.log.noneInRange'))}` });
    return { card, all, countBy };
  }
  /** the Pods the scope names for the logs: a picked Pod (its own), a workload's Pods (or a Service's or an Application's workload), or every Pod of the namespaces; none for a kind that runs no Pod */
  const logPods = sc => { const { w } = get(); return w.pods.filter(p => sc.inNs(p.ns) && (!sc.names || sc.names.has(p.name))); };
  function logsPage() {
    const { S, w } = get(), sc = scope(), pods = sc.kinds || sc.ns ? logPods(sc) : null;
    const picked = S.logPod; /* a Pod picked in the list (or by the AI) is read as picked; a new kind or namespace lets go of it */
    const first = pods ? [...pods].sort((a, b) => (RANK[a.status[0]] ?? 2) - (RANK[b.status[0]] ?? 2))[0] : (w.problems[0] ?? w.pods[0]);
    const key = picked ?? (first ? first.ns + '/' + first.name : null);
    const [ns, name] = (key ?? '/').split('/'), p = key ? w.pods.find(x => x.ns === ns && x.name === name) : null;
    const lw = win('logRange'), lvl = S.logLevel, q = sc.raw; /* the text: the words looked for in the lines */
    const loki = w.tools.find(x => x.id === 'loki'), lokiDown = sourceState(loki);
    const head = html`<div class="v-head"><div class="v-title">${icon('terminal', 'lg')}<b>${L('sim.view.logs')}</b><span class="v-sub">Loki · ${w.cluster.name} · ${L('sim.v.c.retention', { n: RETENTION.logs / D })}</span></div></div>${scopeHead(rangeCtl('logRange', RETENTION.logs, { zoomOut: false }))}${stale()}`;
    if (lokiDown) return html`<section class="v-page">${head}${C.emptyState.render({ icon: 'plug', plainIcon: true, title: lokiDown.title, description: `${lokiDown.hint} · ${L('sim.v.log.cannotRead')}`, action: C.button.render({ label: L('sim.crumb.tools'), variant: 'secondary', size: 'sm', action: 'sim.go', arg: { page: 'tools', tool: 'loki' } }) })}</section>`;
    const podPick = C.select.render({ value: p?.name ?? L('sim.v.scope.pickPod'), icon: 'k8s-pod', menu: 'sim.logPod', label: 'Pod', width: SCOPE_W });
    if (!p) return html`<section class="v-page">${head}${listBar({ scope: podPick })}${C.emptyState.render({ icon: 'k8s-pod', plainIcon: true, title: L('sim.v.scope.pickPod'), description: L('sim.v.scope.noPod') })}</section>`;
    const v = logViewer(p, { withSearch: false, from: lw.from, to: lw.to, q: escapeRe(q), level: lvl });
    return html`<section class="v-page">${head}
      ${listBar({ scope: podPick,
        filters: html`${C.pillTabs.render({ id: 'sim-lv', label: L('sim.v.log.level'), value: lvl, tabs: [['all', L('sim.v.c.all')], ['ERROR', 'ERROR'], ['WARN', 'WARN'], ['INFO', 'INFO']].map(([id, label]) => ({ id, label, count: num(id === 'all' ? v.all.length : v.countBy(id)) })), action: 'sim.logLevel' })}${q ? searchView() : ''}` })}
      ${v.card}</section>`;
  }

  /* ---------- 이벤트(하루 수만 건: 거르기와 이유별 묶음, 30줄씩) ---------- */
  function eventsPage() {
    const { S, w, sid, t, cid } = get(), sc = scope(), q = sc.q, ew = win('evRange');
    const occ = eventsIn(w, sid, ew.from, ew.to, cid), all = groupEv(occ); /* the list holds Event objects (count = running total); the timeline above keeps each occurrence */
    /* the text reads the whole object path (Kind/name), its namespace, the reason and the message; the kind is the involved object's or its owner's (a Deployment's Pods and ReplicaSets too); the timeline keeps what matches lit and dims the rest */
    const hay = e => `${e.kind}/${e.name} ${e.ns ?? ''} ${e.reason} ${e.msg}`.toLowerCase(), inSc = e => sc.inNs(e.ns) && sc.owns(e.kind, e.name) && (!q || hay(e).includes(q));
    const keep = e => (S.evType === 'all' || e.type === S.evType) && (!S.evReason || e.reason === S.evReason) && inSc(e);
    const rows = all.filter(keep);
    /* the type tabs count what the other filters (namespace, reason, search) leave: the same rows the list shows */
    const base = all.filter(e => (!S.evReason || e.reason === S.evReason) && inSc(e)), warnN = base.reduce((n, e) => n + (e.type === 'Warning'), 0);
    const tools = listBar({
      filters: html`${C.pillTabs.render({ id: 'sim-et', label: L('sim.v.event.type'), value: S.evType, tabs: [['all', L('sim.v.c.all')], ['Warning', 'Warning'], ['Normal', 'Normal']].map(([id, label]) => ({ id, label, count: num(id === 'all' ? base.length : id === 'Warning' ? warnN : base.length - warnN) })), action: 'sim.evType' })}${S.evReason ? C.button.render({ label: L('sim.v.event.clearReason', { reason: S.evReason }), icon: 'cross-medium', variant: 'ghost', size: 'sm', round: true, action: 'sim.evReason', arg: '' }) : ''}`,
      view: C.pillTabs.render({ id: 'sim-eg', label: L('sim.v.c.view'), value: S.evGroup, tabs: [{ id: 'list', label: L('sim.v.event.list') }, { id: 'reason', label: L('sim.v.event.byReason') }], action: 'sim.evGroup' }) });
    /* the same range drawn in time: the changes of the cluster and the warnings, by lane; marking a span on it narrows the list to that span */
    const tl = timeline({ from: ew.from, to: ew.to, changes: allChanges(sid, cid).filter(c => c.lane !== 'symptom') /* the Warning lane holds Warning events only: its count is the head's */, events: occ.filter(e => e.type === 'Warning'), zoom: 'sim.r.evRange', home: { from: t - 3600, to: t }, keepEv: keep, keepCh: c => changeOk(c, sc) && (!q || `${c.kind} ${c.title} ${c.text}`.toLowerCase().includes(q)) });
    let body;
    if (S.evGroup === 'reason') {
      const g = new Map(); for (const e of rows) { const k = e.type + '|' + e.reason, x = g.get(k) ?? { id: k, type: e.type, reason: e.reason, src: e.source, n: 0, objs: new Set(), last: e.at, msg: e.msg }; x.n += e.n; x.objs.add(e.name); x.last = Math.max(x.last, e.at); g.set(k, x); }
      const list = [...g.values()].sort((a, b) => (b.type === 'Warning') - (a.type === 'Warning') || b.n - a.n).map(x => ({ ...x, objs: x.objs.size }));
      body = C.dataTable.render({ clip: true, rowKey: 'id', rows: list, rowAction: 'sim.evReasonRow', reveal: true, columns: [{ id: 'type', label: 'Type', width: 'calc(var(--space-16) * 1.6)', cell: e => status(e.type === 'Warning' ? 'warn' : 'idle', e.type) }, { id: 'reason', label: 'Reason', width: 'calc(var(--space-16) * 2.2)' }, { id: 'n', label: 'Count', value: true, width: 'calc(var(--space-16) * 1.2)', cell: e => num(e.n) }, { id: 'objs', label: 'Objects', value: true, optional: true, width: 'calc(var(--space-16) * 1.2)', cell: e => num(e.objs) }, { id: 'src', label: 'Source', muted: true, optional: true, width: 'calc(var(--space-16) * 2.2)' }, { id: 'msg', label: 'Message', muted: true, optional: true }, { id: 'last', label: 'Last Seen', time: true, width: 'calc(var(--space-40) * .9)', cell: e => when(e.last) }] });
    } else {
      const per = 30, pages = Math.max(1, Math.ceil(rows.length / per)), page = Math.min(S.evPage, pages);
      body = html`${eventTable(rows.slice((page - 1) * per, page * per))}
        ${pager(page, per, rows.length, 'sim.evPage')}`;
    }
    return html`<section class="v-page"><div class="v-head"><div class="v-title">${icon('k8s-event', 'lg')}<b>${L('sim.view.events')}</b><span class="v-sub">Kubernetes Events · ${w.cluster.name} · ${L('sim.v.c.retention', { n: RETENTION.events / D })}</span></div></div>${scopeHead(rangeCtl('evRange', RETENTION.events))}${stale()}${tools}${bar('ev-tl', L('sim.v.c.timeline'), [{ id: 'w', label: 'Warning', value: num(warnN) }, { id: 'z', label: L('sim.v.c.range'), value: `${day(ew.from)} – ${hm(ew.to)}` }], tl, true)}
      ${rows.length ? sumBar({ label: L('sim.view.events'), open: true, toggle: { action: 'sim.noop' }, items: [{ id: 't', label: '', value: L('sim.view.events') }, ...eventHead(rows)], body }) : C.emptyState.render({ icon: 'k8s-event', plainIcon: true, title: L('sim.v.c.noEvents') })}</section>`;
  }

  /* ---------- 알림(90일 이력, 30줄씩) ---------- */
  function alertsPage() {
    const { S, sid, t, ph, cid, w } = get(), sc = scope(), q = sc.q, aw = win('alRange');
    /* an alert's labels as its target reads them: namespace/object, a namespace alone, or a Node and its path; an alert with no namespace label (a Node's) stays in sight under any kind and namespace */
    const labelsOf = a => { const [x, y] = a.target.split('/'); return y != null && !/\s/.test(x) ? { ns: x, obj: y } : w.namespaces.includes(a.target) ? { ns: a.target, obj: null } : { ns: null, obj: a.target.split(' ')[0] }; };
    const inSc = a => { const l = labelsOf(a); return (!l.ns || (sc.inNs(l.ns) && (!sc.names || (!!l.obj && sc.rel(l.obj))))) && (!q || `${a.name} ${a.target}`.toLowerCase().includes(q)); };
    const all = alertsOf(sid, t, ph, cid).filter(a => a.at >= aw.from && a.at <= aw.to && inSc(a)), rows = all.filter(a => S.alState === 'all' || a.state === S.alState);
    const tone = a => a.state === 'firing' ? 'error' : a.state === 'pending' ? 'busy' : 'ok';
    const per = 30, pages = Math.max(1, Math.ceil(rows.length / per)), page = Math.min(S.alPage, pages);
    return html`<section class="v-page"><div class="v-head"><div class="v-title">${icon('bell', 'lg')}<b>${L('sim.view.alerts')}</b><span class="v-sub">Alertmanager · ${get().w.cluster.name} · ${L('sim.v.c.retention', { n: RETENTION.alerts / D })}</span></div></div>${scopeHead(rangeCtl('alRange', RETENTION.alerts))}
      ${listBar({ filters: C.pillTabs.render({ id: 'sim-as', label: L('sim.v.c.state'), value: S.alState, tabs: [['all', L('sim.v.c.all')], ['firing', 'firing'], ['pending', 'pending'], ['resolved', 'resolved']].map(([id, label]) => ({ id, label, count: num(id === 'all' ? all.length : all.filter(a => a.state === id).length) })), action: 'sim.alState' }) })}
      ${sumBar({ label: L('sim.view.alerts'), open: true, toggle: { action: 'sim.noop' }, items: (() => { const fire = all.filter(a => a.state === 'firing'), oldest = fire.length ? Math.min(...fire.map(a => a.at)) : null;
          return [{ id: 't', label: '', value: L('sim.view.alerts') }, { id: 'f', label: 'firing', value: String(fire.length), ...(fire.length ? { tone: 'danger' } : {}) }, ...[{ id: 'c', label: 'critical', value: num(fire.filter(a => a.severity === 'critical').length), tone: 'danger' }, { id: 'w', label: 'warning', value: num(fire.filter(a => a.severity === 'warning').length) }].filter(x => x.value !== '0'), ...(oldest != null ? [{ id: 'o', label: L('sim.v.alert.oldest'), value: lasted(get().t - oldest) }] : []), { id: 'p', label: 'pending', value: String(all.filter(a => a.state === 'pending').length) }, { id: 'r', label: 'resolved', value: String(all.filter(a => a.state === 'resolved').length) }]; })(),
        body: rows.length ? html`${C.dataTable.render({ clip: true, rowKey: 'id', rows: rows.slice((page - 1) * per, page * per), rowAction: 'sim.openAlert', activeKey: S.sel?.type === 'alert' ? S.sel.id : null, reveal: true, columns: [{ id: 'name', label: L('sim.view.alerts') }, { id: 'state', label: L('sim.v.c.state'), width: 'calc(var(--space-16) * 1.5)', fit: true, cell: a => status(tone(a), a.state) }, { id: 'severity', label: L('sim.v.c.severity'), optional: true, width: 'calc(var(--space-16) * 1.2)' }, { id: 'target', label: L('sim.v.c.target'), muted: true, optional: true }, { id: 'at', label: L('sim.v.c.start'), time: true, width: 'calc(var(--space-40) * .9)', cell: a => when(a.at) }, { id: 'inc', label: L('sim.view.incidents'), optional: true, width: 'calc(var(--space-16) * 1.4)', muted: true, cell: a => a.incident === sid ? alertText(sid)?.incident ?? '' : '' }] })}${pager(page, per, rows.length, 'sim.alPage')}` : empty(L('sim.v.alert.none')) })}</section>`;
  }

  /* ---------- 네트워크: 서비스마다 송수신·연결·오류, 많이 주고받는 곳, 서비스 사이 흐름 ---------- */
  const bytes = v => v >= 1048576 ? `${(v / 1048576).toFixed(1)} MiB/s` : `${Math.round(v / 1024)} KiB/s`;
  function networkPage() {
    const { S, w, sid, t } = get(), sc = scope(), q = sc.q, nw = win('netRange'), by = S.netBy ?? 'svc';
    /* the text: a Service's name; the kind: a Service or Ingress itself, a workload or a Pod by the Services that select its Pods (a row is the workload's Service) */
    const svcs = netOf(w, sid, t).filter(x => sc.inNs(x.ns) && sc.rel(x.name) && (!q || x.name.toLowerCase().includes(q)));
    const groups = by === 'ns' ? [...new Set(svcs.map(x => x.ns))].map(ns => { const xs = svcs.filter(x => x.ns === ns); return { id: ns, ns, name: ns, kind: 'Namespace', rps: xs.reduce((a, x) => a + x.rps, 0), rx: xs.reduce((a, x) => a + x.rx, 0), tx: xs.reduce((a, x) => a + x.tx, 0), conns: xs.reduce((a, x) => a + x.conns, 0), err: Math.max(...xs.map(x => x.err)), retrans: Math.max(...xs.map(x => x.retrans)) }; }).sort((a, b) => b.tx + b.rx - a.tx - a.rx) : svcs;
    const tot = k => svcs.reduce((a, x) => a + x[k], 0), worst = [...svcs].sort((a, b) => b.err - a.err)[0];
    const series = [{ key: 'rx', name: L('sim.v.net.rx'), color: CPU, fn: at => tot('rx') / 1048576 * (1 + .3 * daily(at) + .05 * Math.sin(at / 400)) }, { key: 'tx', name: L('sim.v.net.tx'), color: MEM, fn: at => tot('tx') / 1048576 * (1 + .3 * daily(at) + .05 * Math.sin(at / 500)) }];
    /* the summary reads the same query as the chart: its value at the last scrape, and the window's highest point beside it */
    const peakOf = fn => { let m = 0; for (let i = 0; i <= 120; i++) m = Math.max(m, fn(nw.from + (nw.to - nw.from) * i / 120)); return m; }, mib = v => `${v.toFixed(1)} MiB/s`;
    const traffic = bar('n-io', L('sim.v.net.traffic'), [{ id: 'rx', label: L('sim.v.net.rx'), value: mib(series[0].fn(nw.to)) }, { id: 'tx', label: L('sim.v.net.tx'), value: mib(series[1].fn(nw.to)) }, { id: 'px', label: L('sim.v.net.rxPeak'), value: mib(peakOf(series[0].fn)) }, { id: 'pt', label: L('sim.v.net.txPeak'), value: mib(peakOf(series[1].fn)) }], chart({ title: L('sim.v.net.traffic'), q: 'sum(rate(container_network_receive_bytes_total[5m])) · sum(rate(container_network_transmit_bytes_total[5m]))', series, from: nw.from, to: nw.to, unit: 'MiB/s', fmt: v => v.toFixed(1) + ' MiB/s', height: 200, n: 120, sync: 'netRange' }));
    const f = netFlow(w, sid, t), g = { mode: 'relation', visual: 'filledOutline', stack: true, stretch: true, fade: true, live: true, label: L('sim.v.net.flow'), gid: 'flg-net', width: 920, height: 380, columns: [0, 300, 600, 820], bar: 56, wash: String(Math.floor(t / 10)), stateLabels: { ok: '2xx·3xx', warn: L('sim.v.net.errUp'), fail: '5xx' },
      nodes: f.nodes.map((n, i) => ({ id: n.id, col: n.col, y: i, h: 0, label: n.label, value: `${n.value.toLocaleString()}/s`, icon: n.icon, state: n.state || 'ok', ...colourOf(n.state || 'ok', n.col === 0 ? 'system' : 'other'), ...(n.go ? { action: 'sim.openRow', arg: { id: n.go } } : {}) })),
      links: f.links.map(l => ({ from: l.from, to: l.to, fromOffset: 0, toOffset: 0, size: l.value, amount: l.value, value: l.text, state: l.state })) };
    const per = 20, pages = Math.max(1, Math.ceil(groups.length / per)), page = Math.min(S.netPage ?? 1, pages);
    const table = sumBar({ label: L('sim.v.net.top'), open: true, toggle: { action: 'sim.noop' }, items: [{ id: 't', label: '', value: L('sim.v.net.top') }, { id: 'n', label: '', value: `${num(groups.length)}` }, { id: 'c', label: L('sim.v.net.active'), value: num(tot('conns')) }, { id: 'e', label: L('sim.v.net.errMax'), value: worst ? `${worst.name} ${worst.err}%` : '', ...(worst?.err > 1 ? { tone: 'danger' } : {}) }], body: html`${C.dataTable.render({ clip: true, rowKey: 'id', rows: groups.slice((page - 1) * per, page * per), rowAction: by === 'ns' ? null : 'sim.openRow', reveal: true, columns: ([{ id: 'name', label: by === 'ns' ? 'Namespace' : L('sim.v.c.name'), lead: () => ({ icon: by === 'ns' ? 'k8s-namespace' : 'k8s-service' }) }, ...(by === 'ns' ? [] : [{ id: 'ns', label: 'Namespace', muted: true, optional: true, width: W2 }]), { id: 'rx', label: L('sim.v.net.rx'), value: true, width: W2, cell: x => bytes(x.rx) }, { id: 'tx', label: L('sim.v.net.tx'), value: true, width: W2, cell: x => bytes(x.tx) }, { id: 'conns', label: L('sim.v.c.conn'), value: true, optional: true, width: W15, cell: x => num(x.conns) }, { id: 'err', label: L('sim.v.c.error'), value: true, optional: true, width: W15, cell: x => `${x.err}%` }, { id: 'retrans', label: L('sim.v.net.retrans'), value: true, optional: true, width: W15, cell: x => `${x.retrans}%` }]) })}${pager(page, per, groups.length, 'sim.netPage')}` });
    return html`<section class="v-page"><div class="v-head"><div class="v-title">${icon('k8s-service', 'lg')}<b>${L('sim.view.network')}</b><span class="v-sub">Prometheus · ${w.cluster.name} · ${L('sim.v.c.retention', { n: RETENTION.metrics / D })}</span></div></div>${scopeHead(rangeCtl('netRange', RETENTION.metrics))}${stale()}
      ${listBar({ view: C.pillTabs.render({ id: 'sim-netby', label: L('sim.v.c.view'), value: by, tabs: [{ id: 'svc', label: L('sim.v.net.svc') }, { id: 'ns', label: 'namespace' }], action: 'sim.netBy' }) })}
      ${traffic}${bar('n-flow', L('sim.v.net.flow'), [{ id: 'n', label: 'Ingress', value: `${num(Math.round(requestRate(t)))}/s` }, ...clusterWide()], html`<div class="v-flow">${C.flowGraph.render(g)}</div>`, true)}${table}</section>`;
  }

  /* ---------- AI 작업 기록: AI가 무엇을 읽었는지(출처·질의·양·마스킹)와 사람이 무엇을 승인·실행했는지 ---------- */
  const AI_MODEL = `Anthropic · ${MODEL} · 2026-10-01 · ap-northeast-1`, AILOG = new Map();
  /* one row of the AI work log in the pane: who asked, who did it with which permission, which model, what was asked, what was masked, how it ended */
  function aiLogDetail(id, kept) { const r = kept ?? AILOG.get(id); /* the row as it was when opened: a later filter does not take it away */ if (!r) return C.emptyState.render({ icon: 'search', plainIcon: true, title: L('sim.v.c.noRecord'), description: L('sim.v.ailog.changed') });
    return html`${C.pageHeader.render({ icon: r.actor === 'AI' ? 'ai' : 'circle-check', title: r.what, context: `${L('sim.view.ailog')} · ${get().w.cluster.name}`, size: 'sm', after: status(r.result === L('sim.v.ailog.success') ? 'ok' : 'warn', r.result) })}
      ${sumBar({ label: L('sim.v.c.record'), open: true, toggle: { action: 'sim.noop' }, items: [{ id: 't', label: '', value: r.inc }, { id: 'a', label: L('sim.v.c.time'), value: `${ymd(r.at)} ${hms(r.at)}` }], body: html`<div class="v-kv1">${C.propertyGrid.render({ items: [{ id: 'q', label: L('sim.v.c.request'), value: r.req.text }, { id: 'e', label: L('sim.v.ailog.exec'), value: r.exec }, { id: 'm', label: L('sim.v.ailog.model'), value: r.model }, { id: 's', label: L('sim.v.c.source'), value: r.src }, { id: 'x', label: r.kind === 'query' ? L('sim.v.ailog.queryRaw') : L('sim.v.ailog.queryLabel'), value: r.query }, { id: 'n', label: L('sim.v.ailog.size'), value: r.size }, ...(r.mask ? [{ id: 'k', label: L('sim.v.ailog.mask'), value: L('sim.v.ailog.masked', { n: r.mask }) }] : [])].filter(x => x.value !== '' && x.value != null) })}</div>` })}`; } /* one value a line, at the card's width; a value that is not there is not a row */
  const SYSTEM_ACTOR = { 'wake-executor': 'terminal', [L('sim.v.actor.check')]: 'shield-check', 'Argo CD': 'brand-argo', Kubernetes: 'k8s-cluster', 'Wake GitHub App': 'brand-github', Alertmanager: 'bell', [L('sim.v.actor.rule')]: 'shield-check' };
  function aiLogPage() {
    const { S, s, sid, cid, incidentOpen } = get(), q = (S.aqQ || '').toLowerCase(), aw = win('aiRange');
    const cur = incidentOpen && s?.skill ? [...s.skill.steps.map((st, i) => { const e = (get().evidence ?? []).find(x => x.id === s.skill.ev?.[i]); const bl = s.skill.blocked?.[i]; return { at: 2 + i * 3, inc: alertText(sid)?.incident ?? s.id, actor: 'AI', kind: bl ? 'denied' : 'read', what: bl ? L('sim.v.ailog.blocked', { step: st, how: bl[0] === 'perm' ? L('sim.v.ailog.denied') : L('sim.v.c.failed'), why: bl[1] }) : st, src: e?.kind ?? '', query: e?.query ?? '', size: bl ? L('sim.v.ailog.unread') : e?.count ?? '', mask: 0 }; }), /* a read that was refused or could not reach its source says so: it is not a read */
      { at: 18, inc: alertText(sid)?.incident ?? s.id, actor: 'AI', kind: 'model', what: L('sim.v.ailog.judged', { n: (get().evidence ?? []).filter(e => !e.blocked).length }), src: 'Wake', query: '', size: L('sim.v.ailog.tokens', { n: (get().evidence ?? []).filter(e => !e.blocked).length, tok: num((get().evidence ?? []).filter(e => !e.blocked).length * 1850) }), mask: redactedTotal(s.redactions) },
      ...(S.history ?? []).filter(h => h.kind === 'approve' || h.kind === 'merge' || h.kind === 'done').map(h => ({ at: h.at, inc: alertText(sid)?.incident ?? s.id, actor: ME, kind: 'user', what: h.kind === 'approve' ? L('sim.v.c.approveOf', { what: h.option }) : h.text, src: h.kind === 'merge' ? 'GitHub' : 'Wake', query: '', size: '', mask: 0 }))] : [];
    const past = pastOf(cid).slice(0, 40).flatMap(p => { const at = p.at ?? -p.days * D; return [{ at: at + 2, inc: p.id.toUpperCase(), actor: 'AI', kind: 'read', what: L('sim.v.ailog.readTarget'), src: 'Kubernetes API', query: `GET /api/v1/namespaces/${p.ns ?? 'default'}/pods`, size: L('sim.v.c.cases', { n: 3 + hash(p.id) % 20 }), mask: 0 }, { at: at + 9, inc: p.id.toUpperCase(), actor: 'AI', kind: 'read', what: L('sim.v.ailog.readLogs'), src: 'Loki', query: `{namespace="${p.ns ?? 'default'}"} |= "ERROR"`, size: L('sim.v.c.lines', { n: num(200 + hash(p.id + 'l') % 4000) }), mask: hash(p.id) % 3 }, { at: at + 20, inc: p.id.toUpperCase(), actor: 'AI', kind: 'model', what: L('sim.v.ailog.judgedExt'), src: 'Wake', query: '', size: L('sim.v.ailog.tokens', { n: p.evidence ?? 4, tok: num((p.evidence ?? 4) * 1850) }), mask: hash(p.id) % 3 }, { at: at + (p.mins ?? 20) * 15, inc: p.id.toUpperCase(), actor: p.approver ?? ME, kind: 'user', what: L('sim.v.c.approveOf', { what: p.by }), src: 'Wake', query: '', size: '', mask: 0 }]; });
    const plans = (S.planLog ?? []).map(x => ({ at: x.at, inc: x.inc ?? '', actor: x.kind === 'run' ? 'wake-executor' : ME, kind: 'user', what: x.kind === 'run' ? L('sim.v.ailog.run', { label: x.label }) : x.kind === 'deny' ? L('sim.v.ailog.deny', { label: x.label }) : L('sim.v.ailog.approvePlan', { label: x.label }), src: 'Kubernetes API', query: x.cmd, size: x.target, mask: 0 }));
    const curInc = alertText(sid)?.incident ?? s?.id, queries = (S.chat ?? []).filter(m => m.who === 'user').map(m => ({ at: m.at, inc: incidentOpen ? curInc : '', actor: ME, kind: 'query', what: L('sim.v.ailog.query', { text: m.text }), src: 'Wake AI', query: m.text, size: '', mask: m.masked ?? 0 }));
    /* every row says who asked for it (an alert's automatic investigation or a person with their role), who did it with which permission, and which model, if any */
    const meta = new Map([[curInc, { alert: s?.alert, policy: s?.skill?.id, ns: s?.ns }], ...pastOf(cid).map(p => [p.id.toUpperCase(), { alert: p.alert, policy: p.rule, ns: p.ns }])]);
    const EXEC = { 'Kubernetes API': L('sim.v.ailog.execK8s'), Loki: L('sim.v.ailog.execLoki'), 로그: L('sim.v.ailog.execLoki'), Prometheus: L('sim.v.ailog.execProm'), GitOps: L('sim.v.ailog.execArgo'), '과거 인시던트': L('sim.v.ailog.execPast') };
    const enrich = r => { const m = meta.get(r.inc) ?? { ns: r.ns ?? 'payments' }, person = r.actor === 'wake-executor' ? ME : r.actor, viaAlert = r.actor === 'AI' && r.kind !== 'query';
      const req = viaAlert ? { kind: 'alert', text: L('sim.v.ailog.reqAlert', { alert: m.alert ?? L('sim.view.alerts'), policy: m.policy ?? '' }) } : { kind: 'user', name: person, text: `${person} · on-call ${m.ns ?? ''}` };
      const exec = r.kind === 'model' ? 'Wake AI' : r.kind === 'query' ? 'Wake AI' : r.actor === 'AI' ? EXEC[r.src] ?? L('sim.v.ailog.collector') : r.actor === 'wake-executor' ? `wake-executor · ${m.ns ?? ''}-operator Role` : r.src === 'GitHub' ? 'GitHub App wake-bot' : /명령 계획/.test(r.what) ? L('sim.v.ailog.opApprover', { ns: m.ns ?? '' }) : L('sim.v.ailog.deployApprover', { rb: roleBinding(m.ns ?? r.ns ?? 'default') });
      const model = r.kind === 'model' || r.kind === 'query' ? AI_MODEL : r.kind === 'read' || r.kind === 'denied' ? L('sim.v.ailog.noModelCollector') : L('sim.v.ailog.noModel');
      return { ...r, req, exec, model, result: r.kind === 'denied' ? (/거부/.test(r.what) ? L('sim.v.ailog.denied') : L('sim.v.c.failed')) : L('sim.v.ailog.success'), rid: `${r.at}|${r.inc}|${r.what}` }; };
    const all = [...cur, ...plans, ...queries, ...past].filter(r => r.at >= aw.from && r.at <= aw.to + 15) /* the window is drawn on the 15 s grid: what happened in the last seconds still belongs to it */.sort((a, b) => b.at - a.at).map(enrich);
    const reqF = S.aqReq ?? 'all', modelF = S.aqModel ?? 'all';
    const rows = all.filter(r => (reqF === 'all' || r.req.kind === reqF) && (modelF === 'all' || (modelF === 'model' ? r.model === AI_MODEL : r.model !== AI_MODEL)) && (!q || `${r.inc} ${r.what} ${r.src} ${r.query} ${r.req.text} ${r.exec}`.toLowerCase().includes(q)));
    AILOG.clear(); for (const r of rows) AILOG.set(r.rid, r);
    const per = 30, pages = Math.max(1, Math.ceil(rows.length / per)), page = Math.min(S.aqPage ?? 1, pages);
    const summary = sumBar({ label: L('sim.v.ailog.work'), items: [{ id: 'r', label: L('sim.v.ailog.reads'), value: num(all.filter(r => r.kind === 'read').length) }, ...(all.some(r => r.kind === 'denied') ? [{ id: 'd', label: L('sim.v.ailog.deniedFailed'), value: num(all.filter(r => r.kind === 'denied').length), tone: 'warn' }] : []), { id: 'm', label: L('sim.v.ailog.toModel'), value: num(all.filter(r => r.model === AI_MODEL).length), action: 'sim.aqModel', arg: 'model' }, { id: 'k', label: L('sim.v.ailog.mask'), value: `${num(all.reduce((a, r) => a + r.mask, 0))}` }, { id: 'u', label: L('sim.v.ailog.byPeople'), value: num(all.filter(r => r.req.kind === 'user').length), action: 'sim.aqReq', arg: 'user' }] });
    return html`<section class="v-page"><div class="v-head"><div class="v-title">${icon('ai', 'lg')}<b>${L('sim.view.ailog')}</b><span class="v-sub">${L('sim.v.ailog.source')} · ${get().w.cluster.name} · ${L('sim.v.c.retention', { n: RETENTION.alerts / D })}</span></div></div>
      ${listBar({ search: findBox(L('sim.v.ailog.search')), filters: html`${C.pillTabs.render({ id: 'sim-aqr', label: L('sim.v.ailog.requester'), value: reqF, tabs: [['all', L('sim.v.c.all')], ['alert', L('sim.v.ailog.alertAuto')], ['user', L('sim.v.ailog.person')]].map(([id, label]) => ({ id, label, count: num(id === 'all' ? all.length : all.filter(r => r.req.kind === id).length) })), action: 'sim.aqReq' })}${C.pillTabs.render({ id: 'sim-aqm', label: L('sim.v.ailog.model'), value: modelF, tabs: [['all', L('sim.v.ailog.allModels')], ['model', MODEL], ['none', L('sim.v.ailog.noModel')]].map(([id, label]) => ({ id, label })), action: 'sim.aqModel' })}`, range: rangeCtl('aiRange', 'l', 90 * D) })}
      ${summary}${sumBar({ label: L('sim.v.c.record'), open: true, toggle: { action: 'sim.noop' }, items: [{ id: 't', label: '', value: L('sim.v.c.record') }, { id: 'n', label: '', value: `${num(rows.length)}` }], body: html`${C.dataTable.render({ clip: true, rowKey: 'rid', rows: rows.slice((page - 1) * per, page * per), rowAction: 'sim.aiRow', activeKey: S.sel?.type === 'ailog' ? S.sel.id : null, reveal: true, columns: ([{ id: 'at', label: L('sim.v.c.time'), time: true, width: 'calc(var(--space-40) * .9)', cell: r => when(r.at) }, { id: 'inc', label: L('sim.view.incidents'), width: W15 },
          { id: 'req', label: L('sim.v.c.request'), width: 'calc(var(--space-40) * 1.1)', cell: r => html`<span class="v-who">${r.req.kind === 'alert' ? icon('bell', 'sm') : C.avatar.render({ name: r.req.name, size: 'sm' })}<span class="v-trunc">${r.req.text}</span></span>`, tip: r => r.req.text },
          { id: 'what', label: L('sim.v.ailog.what'), cell: r => html`<span class="v-who">${r.actor === 'AI' ? icon('ai', 'sm') : SYSTEM_ACTOR[r.actor] ? icon(SYSTEM_ACTOR[r.actor], 'sm') : ''}<span class="v-trunc">${r.what}</span></span>`, tip: r => r.what },
          { id: 'exec', label: L('sim.v.ailog.execModel'), muted: true, optional: true, width: 'calc(var(--space-40) * 1.2)', cell: r => html`<span class="v-trunc">${r.exec} · ${r.model === AI_MODEL ? MODEL : L('sim.v.ailog.noModel')}</span>`, tip: r => `${r.exec} · ${r.model}` },
          { id: 'size', label: L('sim.v.ailog.size'), value: true, optional: true, width: W15 }]) })}${pager(page, per, rows.length, 'sim.aqPage')}` })}${otherKinds(S.aqQ)}</section>`;
  }

  /* ---------- 인시던트 목록 ---------- */
  function incidentsPage() {
    const { S, s, ph, cid } = get(), sc = scope(), q = sc.q;
    /* the text: a title, a number or an alert name; the kind and namespaces: the incident's target */
    const inSc = (ns, target, words) => sc.inNs(ns) && (!sc.names || sc.rel(target)) && (!q || words.toLowerCase().includes(q));
    const incidentOpen = get().incidentOpen && inSc(s.ns, (s.scope ?? []).find(r => sc.rel(r.name))?.name ?? s.scope?.[0]?.name, `${s.title} ${alertText(get().sid)?.incident ?? ''} ${s.alert}`);
    const past = pastOf(cid).filter(p => inSc(p.ns, p.target?.name ?? p.title.split(' ')[0], `${p.title} ${p.id} ${p.alert ?? ''}`));
    const iw = win('incRange'), kindOf = p => (p.outcome === 'recovered' ? 'ok' : p.outcome), il = incidentList(get().sid, get().t, ph, cid, iw), inR = past.filter(p => il.inRange.some(x => x.id === p.id)); /* the screen's range and Wake's whole keep are two counts, each named (world incidentList) */
    const rows = inR.filter(p => (S.incF === 'all' || kindOf(p) === S.incF)), per = 20, pages = Math.max(1, Math.ceil(rows.length / per)), page = Math.min(S.incPage, pages);
    return html`<section class="v-page"><div class="v-head"><div class="v-title">${icon('incident', 'lg')}<b>${L('sim.view.incidents')}</b><span class="v-sub">Wake · ${get().w.cluster.name} · ${L('sim.v.c.retention', { n: RETENTION.alerts / D })}</span></div></div>${scopeHead(rangeCtl('incRange', 'l', 90 * D))}
      ${listBar({ filters: C.pillTabs.render({ id: 'sim-incf', label: L('sim.v.c.result'), value: S.incF, tabs: [['all', L('sim.v.c.all')], ['ok', L('sim.hist.resolve')], ['manual', L('sim.v.inc.manual')], ['unknown', L('sim.v.inc.unknown')]].map(([id, label]) => ({ id, label, n: id === 'all' ? (sc.on ? inR.length + (incidentOpen ? 1 : 0) : il.rangeTotal) : inR.filter(p => kindOf(p) === id).length })).filter(x => x.id === 'all' || x.n || x.id === S.incF).map(({ n, ...x }) => ({ ...x, count: num(n) })), action: 'sim.incF' }) /* a filter with nothing to show is not offered; 전체 counts every row on the page, the open one too */ })}
      ${bar('i-open', L('sim.v.c.openIncidents'), [{ id: 'n', label: '', value: String(incidentOpen ? 1 : 0), ...(incidentOpen && ph !== 'resolved' ? { tone: 'danger' } : {}) }], incidentOpen ? html`<div class="v-rows"><button class="v-row" data-action="sim.go" data-arg="${JSON.stringify({ page: 'incident' })}">${C.statusIcon.render({ kind: ph === 'resolved' ? get().resultKind : 'error', attention: ph !== 'resolved' })}<span class="v-row-t"><b>${alertText(get().sid)?.incident ?? ''} ${s.title}</b><span>${s.alert} · ${alertText(get().sid)?.severity ?? s.severity} · ${s.cluster} · ${s.ns} · ${L('sim.v.c.createdAt', { at: when(0) })}</span></span><span class="v-row-m">${get().statusWord}</span>${icon('chevron-right-small', 'sm')}</button></div>` : empty(L('sim.v.c.noOpenIncidents')))}
      ${bar('i-past', L('sim.v.c.pastIncidents'), [{ id: 'n', label: '', value: String(rows.length) }, { id: 'kept', label: il.totalScope, value: num(il.total), priority: -1 }, { id: 'ok', label: L('sim.hist.resolve'), value: String(rows.filter(r => r.outcome === 'recovered').length) }, ...[{ id: 'm', label: L('sim.v.inc.manual'), value: num(rows.filter(r => r.outcome === 'manual').length) }, { id: 'u', label: L('sim.v.inc.unknown'), value: num(rows.filter(r => r.outcome === 'unknown').length) }].filter(x => x.value !== '0'), ...(rows.length ? [{ id: 'md', label: L('sim.v.inc.median'), value: (xs => xs.length ? L('sim.v.c.minN', { n: xs[Math.floor(xs.length / 2)] }) : '')(rows.map(r => r.mins ?? parseInt(r.took, 10)).filter(Number.isFinite).sort((a, b) => a - b)) }] : [])], rows.length ? html`${pastTable(rows.slice((page - 1) * per, page * per))}${pager(page, per, rows.length, 'sim.incPage')}` : empty(L('sim.v.inc.none')))}</section>`;
  }

  /* ---------- 설정: 도구 · 에이전트 ---------- */
  /* ---------- 설정 › 도구 · 에이전트: 목록은 연결 줄, 상세는 오른쪽 칸의 한 화면 ---------- */
  const TOOL_INFO = {
    prometheus: { perms: [['GET /api/v1/query', L('sim.v.tool.use.promQuery')], ['GET /api/v1/query_range', L('sim.v.tool.use.promRange')], ['GET /api/v1/series', L('sim.v.tool.use.promSeries')]], breaks: [L('sim.v.tool.brk.promVerify'), L('sim.v.tool.brk.promGraphs'), L('sim.v.tool.brk.promEvidence')] },
    loki: { perms: [['GET /loki/api/v1/query_range', L('sim.v.tool.use.lokiRange')], ['GET /loki/api/v1/labels', L('sim.v.tool.use.lokiLabels')]], breaks: [L('sim.v.tool.brk.lokiVerify'), L('sim.v.tool.brk.lokiPrev'), L('sim.v.tool.brk.lokiEvidence')] },
    grafana: { perms: [['dashboards:read', L('sim.v.tool.use.grafanaDash')], ['datasources:query', L('sim.v.tool.use.grafanaDs')]], breaks: [L('sim.v.tool.brk.grafana')] },
    argocd: { perms: [['applications get', L('sim.v.tool.use.argoGet')], ['applications list', L('sim.v.tool.use.argoList')], ['applications sync', L('sim.v.tool.use.argoSync')], ['applications rollback', L('sim.v.tool.use.argoRollback')]], breaks: [L('sim.v.tool.brk.argoScreen'), L('sim.v.tool.brk.argoApply')] },
    github: { perms: [['contents: read', L('sim.v.tool.use.ghContents')], ['pull_requests: write', L('sim.v.tool.use.ghPr')], ['metadata: read', L('sim.v.tool.use.ghMeta')]], breaks: [L('sim.v.tool.brk.ghPr')] },
    jvm: { perms: [['GET /metrics(:9404)', L('sim.v.tool.use.jvm')]], breaks: [L('sim.v.tool.brk.jvm')] },
    pgexporter: { perms: [['GET /metrics(:9187)', L('sim.v.tool.use.pg')]], breaks: [L('sim.v.tool.brk.pg')] },
  };
  const ERRS = { error: ['context deadline exceeded (Client.Timeout exceeded while awaiting headers)', 'dial tcp 10.0.12.40:9090: i/o timeout'], idle: ['service not found', 'no endpoints available for service'], perm: ['403 Forbidden: permission denied (applications, get)'] };
  function toolsPage() {
    const { S, w } = get();
    /* each tool: its mark, what it reads and where, the one action its state calls for, and its state (icon, colour, word); the row opens its detail */
    const rows = w.tools.map(x => C.connectionRow.render({ id: x.id, brand: x.icon, title: x.name, description: `${x.role} · ${x.where}${x.version ? ' · ' + x.version : ''}`, state: STATE_WORD[x.state], statusLabel: STATE_WORD[x.state], kind: ({ ok: 'ok', limited: 'warn', perm: 'perm', idle: 'idle', error: 'error', busy: 'busy' })[x.state], attention: S.sel?.type === 'tool' && S.sel.id === x.id, rowAction: 'sim.toolOpen', rowArg: x.id,
      action: x.state === 'ok' ? { label: { raw: L('sim.v.tool.check') }, icon: 'arrow-rotate-clockwise', action: 'sim.toolCheck', arg: x.id, variant: 'ghost' } : x.state === 'idle' ? { label: { raw: L('sim.v.tool.connect') }, action: 'sim.toolConnect', arg: x.id } : x.state === 'perm' || x.state === 'limited' ? { label: { raw: L('sim.v.tool.needPerm') }, action: 'sim.toolOpen', arg: x.id, variant: 'secondary' } : { label: { raw: L('sim.v.tool.retry') }, action: 'sim.toolConnect', arg: x.id } }));
    return html`<section class="v-page"><div class="v-head"><div class="v-title">${icon('plug', 'lg')}<b>${L('sim.view.tools')}</b><span class="v-sub">${L('sim.v.tool.source')} · ${w.cluster.name}</span></div>${findBox()}</div>${findResults()}
      ${sumBar({ label: L('sim.view.tools'), items: Object.keys(STATE_WORD).filter(k => w.tools.some(x => x.state === k)).map(k => ({ id: k, label: STATE_WORD[k], value: String(w.tools.filter(x => x.state === k).length), ...(k === 'error' ? { tone: 'danger' } : k === 'ok' ? {} : { tone: 'warn' }) })) })}
      ${C.settingsSection.render({ title: L('sim.view.tools'), children: C.settingsGroup.render({ children: rows }) })}</section>`;
  }
  function toolDetail(id) {
    const { w, t } = get(), x = w.tools.find(y => y.id === id); if (!x) return '';
    const info = TOOL_INFO[id] ?? { perms: [], breaks: [] }, up = x.state === 'ok' || x.state === 'limited', h = hash(id);
    const lastOk = up ? t - 15 - h % 30 : x.state === 'idle' ? null  : t - 4 * 60 - h % 200;
    const act = x.state === 'idle' ? C.button.render({ label: L('sim.v.tool.connect'), variant: 'secondary', size: 'sm', round: true, action: 'sim.toolConnect', arg: id }) : C.button.render({ label: up ? L('sim.v.tool.check') : L('sim.v.tool.retry'), icon: 'arrow-rotate-clockwise', variant: 'secondary', size: 'sm', round: true, action: up ? 'sim.toolCheck' : 'sim.toolConnect', arg: id });
    const head = C.pageHeader.render({ icon: x.icon, title: x.name, context: `${L('sim.view.tools')} · ${w.cluster.name}`, size: 'sm', after: stateCell(x.state), end: act });
    /* one card: what it is and how it answers in the head (the latency in the unit its chart reads), what it says and where it is under it; nothing floats outside a card */
    const summary = bar('t-sum', x.name, [{ id: 'r', label: L('sim.v.tool.role'), value: x.role }, ...(x.version ? [{ id: 'v', label: L('sim.v.c.version'), value: x.version }] : []), { id: 'l', label: L('sim.v.tool.latency'), value: up && x.latencyMs != null ? `${num(x.latencyMs)}ms` : L('sim.v.tool.noResponse') }, ...(lastOk == null ? [] : [{ id: 's', label: L('sim.v.tool.lastOk'), value: when(lastOk) }])],
      C.propertyGrid.render({ items: [{ id: 'd', label: L('sim.v.c.state'), value: html`${C.statusIcon.render({ kind: up ? (x.state === 'limited' ? 'warn' : 'ok') : x.state === 'perm' ? 'perm' : x.state === 'idle' ? 'idle' : 'error', text: x.detail })}` }, { id: 'a', label: L('sim.v.tool.address'), value: html`<span class="v-mono">${x.where}</span>` }] }), true);
    const lat = info.perms.length && x.last !== null ? bar('t-lat', L('sim.v.tool.latencyChart'), [{ id: 'v', label: '', value: up && x.latencyMs != null ? `${num(x.latencyMs)}ms` : L('sim.v.tool.noResponse') }], chart({ title: L('sim.v.tool.latencyChart'), fn: at => { const dn = !up && at > (lastOk ?? -Infinity); return dn ? null : (x.latencyMs ?? TOOL_LATENCY[id] ?? 0) * (1 + .25 * Math.sin(at / 900 + h) + .15 * Math.sin(at / 170)); }, from: scrapeFloor(t) - 6 * H, to: scrapeFloor(t), unit: 'ms', color: CPU, fmt: v => v == null ? '' : Math.round(v) + 'ms', height: 140, own: true }), true) : '';
    const perms = bar('t-perm', L('sim.v.tool.perms'), [{ id: 'n', label: '', value: String(info.perms.length) }], C.dataTable.render({ clip: true, rowKey: 'p', rows: info.perms.map(([p, use]) => ({ p, use, ok: /^없음/.test(use) ? ['idle', L('sim.v.tool.unused')] : x.state === 'perm' && /get|list/.test(p) ? ['perm', L('sim.v.c.noPerm')] : up ? ['ok', L('sim.v.tool.allowed')] : ['idle', L('sim.v.tool.unchecked')] })), reveal: true, columns: [{ id: 'p', label: L('sim.v.c.perm'), mono: true }, { id: 'ok', label: L('sim.v.c.state'), width: 'calc(var(--space-16) * 1.8)', fit: true, cell: r => statusCell(r.ok) }, { id: 'use', label: L('sim.v.tool.usedBy'), muted: true, optional: true }] }));
    const errs = up ? [] : (ERRS[x.state] ?? []).map((m, i) => ({ id: 'e' + i, at: t - 30 * (i + 1), m }));
    const errBar = bar('t-err', L('sim.v.tool.recentErrors'), [{ id: 'n', label: L('sim.v.c.h24'), value: `${errs.length}` }], errs.length ? C.dataTable.render({ clip: true, rowKey: 'id', rows: errs, reveal: true, columns: [{ id: 'at', label: L('sim.v.c.time'), time: true, width: 'calc(var(--space-16) * 1.4)', cell: r => hms(r.at) }, { id: 'm', label: L('sim.v.c.error'), mono: true }] }) : empty(L('sim.v.tool.noErrors')), !!errs.length);
    const breaks = bar('t-brk', L('sim.v.tool.breaks'), [{ id: 'n', label: '', value: String(info.breaks.length) }], html`<div class="v-steps">${info.breaks.map(b => C.stepRow.render({ state: up ? 'done' : 'blocked', text: b }))}</div>`, !up);
    return html`${head}${summary}${lat}${perms}${errBar}${breaks}`;
  }
  function agentPage() {
    const { w } = get(), a = w.agent, down = a.state !== 'ok';
    return html`<section class="v-page"><div class="v-head"><div class="v-title">${icon('k8s-cluster', 'lg')}<b>${L('sim.view.agent')}</b><span class="v-sub">wake-agent heartbeat · ${w.cluster.name}</span></div>${findBox()}</div>${findResults()}
      ${C.settingsSection.render({ title: L('sim.v.agent.section'), children: C.settingsGroup.render({ children: [C.connectionRow.render({ id: 'agent', brand: 'brand-kubernetes', title: `${a.name} ${a.version}`, description: `${a.ns} · heartbeat ${a.beat} · ${a.detail}`, state: STATE_WORD[a.state], statusLabel: STATE_WORD[a.state], kind: down ? 'error' : 'ok', attention: down, rowAction: 'sim.toolOpen', rowArg: 'agent', action: down ? { label: { raw: L('sim.v.agent.diagnose') }, action: 'sim.toolOpen', arg: 'agent' } : { label: { raw: L('sim.v.tool.check') }, icon: 'arrow-rotate-clockwise', action: 'sim.toolCheck', arg: 'wake-agent', variant: 'ghost' } })] }) })}</section>`;
  }
  const WATCHED = ['Pod', 'Deployment', 'ReplicaSet', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob', 'Node', 'Event', 'Service', 'Endpoints', 'EndpointSlice', 'Ingress', 'ConfigMap', 'PersistentVolumeClaim', 'PersistentVolume', 'StorageClass', 'HorizontalPodAutoscaler', 'PodDisruptionBudget', 'Namespace', 'ServiceAccount', 'Role', 'RoleBinding', 'ClusterRole', 'ClusterRoleBinding', 'NetworkPolicy', 'Lease', 'PriorityClass', 'ResourceQuota', 'LimitRange', 'CustomResourceDefinition', 'Application', 'AppProject', 'Certificate', 'Issuer', 'ServiceMonitor', 'PrometheusRule', 'VerticalPodAutoscaler', 'IngressClass', 'RuntimeClass', 'CSIDriver'];
  function agentDetail() {
    const { w, t, sid, ph, S } = get(), a = w.agent, down = a.state !== 'ok', downAt = down ? (S.agentDownAt ?? t) : Infinity;
    const p = w.pods.find(x => x.owner?.name === 'wake-agent');
    const head = C.pageHeader.render({ icon: 'brand-kubernetes', title: a.name, context: `${L('sim.view.agent')} · ${a.ns} · ${w.cluster.name}`, size: 'sm', after: stateCell(a.state) });
    const summary = bar('a-sum', a.name, [{ id: 'v', label: L('sim.v.c.version'), value: a.version }, { id: 'b', label: 'heartbeat', value: a.beat }, { id: 'w', label: 'watch', value: String(a.watch) }],
      C.propertyGrid.render({ items: [{ id: 'd', label: L('sim.v.c.state'), value: html`${C.statusIcon.render({ kind: down ? 'error' : 'ok', text: a.detail })}` }, { id: 'c', label: L('sim.v.agent.cacheL'), value: a.cache }] }), true);
    const beat = bar('a-beat', L('sim.v.agent.beatChart'), [{ id: 'v', label: '', value: down ? L('sim.v.agent.noBeat') : a.beat }], chart({ title: L('sim.v.agent.beatChart'), fn: at => at > downAt ? null : 38 + 6 * Math.sin(at / 1300) + 3 * Math.sin(at / 170), from: scrapeFloor(t) - 6 * H, to: scrapeFloor(t), unit: 'ms', color: COUNT, fmt: v => v == null ? L('sim.v.agent.noBeat') : `${Math.round(v)}ms`, height: 140, own: true }), true); /* a gap is the time no heartbeat came */
    const use = p && !down ? bar('a-mem', L('sim.v.agent.memory'), useHead({ fn: podMem(p, sid, ph), now: podMem(p, sid, ph)(scrapeFloor(t)), req: p.memReq, lim: p.memLim, unit: 'Mi', from: scrapeFloor(t) - 6 * H, to: scrapeFloor(t) }), chart({ title: L('sim.v.agent.memory'), fn: podMem(p, sid, ph), from: scrapeFloor(t) - 6 * H, to: scrapeFloor(t), unit: 'Mi', color: MEM, refs: [{ value: p.memReq, label: L('sim.v.c.reqV', { v: `${p.memReq}Mi` }), tone: 'request' }, { value: p.memLim, label: L('sim.v.c.limV', { v: `${p.memLim}Mi` }), tone: 'limit' }], fmt: v => Math.round(v) + 'Mi', height: 140 }), true) : '';
    const rbac = bar('a-rbac', 'RBAC', [{ id: 'v', label: 'verbs', value: a.verbs }], C.dataTable.render({ clip: true, rowKey: 'r', rows: [[L('sim.v.agent.rbacAll'), 'get · list · watch', L('sim.v.agent.clusterWide')], ['pods/log', 'get', L('sim.v.agent.logEvidence')], ['events', 'get · list · watch', L('sim.view.events')], ['secrets', L('sim.v.c.none'), L('sim.v.agent.noSecrets')], ['*', L('sim.v.agent.noWriteVerbs'), L('sim.v.agent.noWrite')]].map(([r, v, why]) => ({ r, v, why })), reveal: true, columns: [{ id: 'r', label: L('sim.v.agent.resource'), mono: true }, { id: 'v', label: 'verbs', width: 'calc(var(--space-16) * 2.6)' }, { id: 'why', label: L('sim.v.agent.purpose'), muted: true, optional: true }] }), false);
    const watched = bar('a-watch', L('sim.v.agent.watched'), [{ id: 'n', label: '', value: `${a.watch}` }], html`<p class="dt-p v-mono">${WATCHED.slice(0, Math.max(a.watch, 0) || WATCHED.length).join(' · ')}</p>`, false);
    const acts = html`<div class="v-acts">${p ? C.button.render({ label: L('sim.v.agent.podLogs', { name: p.name }), icon: 'terminal', variant: 'secondary', size: 'sm', round: true, action: 'sim.openRow', arg: { id: `${p.ns}/Pod/${p.name}`, tab: 'logs' } }) : ''}${C.button.render({ label: 'Deployment wake-agent', icon: 'k8s-deployment', variant: 'link', action: 'sim.openRow', arg: { id: 'monitoring/Deployment/wake-agent' } })}</div>`;
    return html`${head}${summary}${beat}${use}${acts}${rbac}${watched}`;
  }

  /* ---------- 근거 보기 ---------- */
  /* which source an evidence was read from (the freshness record's id) */
  const evidenceSource = e => e.kind === 'Prometheus' ? 'prometheus' : e.kind === 'GitOps' ? 'argocd' : e.kind === 'Kubernetes API' ? 'kubernetes' : e.kind === '로그' ? (/^pods\/log|^job\//.test(e.query ?? '') ? 'kubernetes' : 'loki') : null;
  function evidenceView(e) {
    const { w, sid, t, ph, s } = get();
    const metaOf = () => sumBar({ label: L('sim.v.c.evidence'), items: [{ id: 'k', label: '', value: `${L('sim.v.evid.id', { id: e.id })} · ${e.kind}` }, { id: 'r', label: L('sim.v.evid.range'), value: e.range }, { id: 'n', label: L('sim.v.evid.count'), value: e.blocked ? '' : e.count + (e.cut ? ` · ${L('sim.v.evid.cut')}` : '') }] });
    const query = html`<div class="v-q">${C.statusIcon.render({ kind: e.blocked ? (e.blocked === '권한' ? 'perm' : 'idle') : 'ok' })}<code>${e.query}</code></div>`;
    let body;
    /* evidence whose source is unreadable now (Argo CD without permission) shows that, not a stale success */
    const argoNow = w.tools.find(x => x.id === 'argocd'); if (!e.blocked && e.kind === 'GitOps' && ['perm', 'idle', 'error'].includes(argoNow?.state)) e = { ...e, blocked: '권한', raw: `Argo CD ${argoNow.detail} · ${L('sim.v.evid.unreadable')}` };
    if (e.blocked) body = C.emptyState.render({ icon: e.blocked === '권한' ? 'lock' : 'unplug', plainIcon: true, title: e.blocked === '권한' ? L('sim.v.evid.noPerm') : L('sim.v.evid.noTool'), description: e.raw, action: C.button.render({ label: e.blocked === '권한' ? L('sim.v.c.agentPerm') : L('sim.v.evid.connectTool'), variant: 'secondary', size: 'sm', action: 'sim.go', arg: { page: e.blocked === '권한' ? 'agent' : 'tools' } }) });
    else if (e.kind === '로그') {
      /* the log as it was read for the evidence (world evidenceSnapshot): its window, its lines and the lines it found, never read again from the pod now */
      const snap = evidenceSnapshot(sid, e.id), key = e.key ?? 'ERROR', p = snap?.pods?.[0] ? w.pods.find(x => x.name === snap.pods[0] || x.replaced === snap.pods[0]) : null, now = p?.replaced ? p : null;
      body = !snap?.lines?.length ? C.emptyState.render({ icon: 'search', plainIcon: true, title: L('sim.v.evid.notFound'), description: e.query })
        : html`<div class="v-tools"><span class="v-sub">${[snap.pods?.length > 1 ? L('sim.v.log.aggPods', { n: num(snap.pods.length) }) : snap.pods?.[0] ?? '', `${hms(snap.from)}–${hms(snap.to)}`, snap.count, L('sim.v.evid.hits', { key, n: num(snap.hits.length) })].filter(Boolean).join(' · ')}</span>${now ? C.button.render({ label: L('sim.v.evid.runningNow', { name: now.name }), icon: 'arrow-up-right', variant: 'link', action: 'sim.openRow', arg: { id: `${now.ns}/Pod/${now.name}` } }) : ''}${p ? C.button.render({ label: L('sim.v.evid.allLogs'), icon: 'arrow-up-right', variant: 'link', action: 'sim.go', arg: { page: 'logs', pod: p.ns + '/' + p.name, q: key } }) : ''}</div>${logList(snap.lines.map(l => ({ at: l.at, level: l.level, text: snap.pods?.length > 1 ? `[${l.pod.split('-').pop()}] ${l.text}` : l.text, i: l.n - 1 })), key, true, 2, true)}`;
    } else if (e.kind === 'Prometheus') {
      /* the evidence opens its own series (world evidenceSeries): its metric, target, window and the reference lines it names */
      const x = evidenceSeries(sid, e.id, get().fixAt);
      const ch = x?.fn ? chart({ title: x.title, q: x.query, ...(x.lines ? { series: Object.entries(x.lines).map(([k, fn], i) => ({ key: k, name: k === 'desired' ? 'desiredSize' : k === 'nodes' ? 'Node' : 'Ready', color: `--series-${i + 1}`, fn })) } : { fn: x.fn }), from: x.from, to: Math.min(t, x.to), n: x.to - x.from > D ? 168 : 72, unit: x.unit, color: x.metric === 'memory' ? MEM : COUNT,
          refs: (x.refs ?? []).map(r => ({ value: r.value, label: r.label, tone: r.kind === 'request' || r.kind === 'desired' ? 'request' : 'limit' })), fmt: v => (v == null ? '' : x.fmt(v)), height: 160 })
        : empty(L('sim.v.evid.noSeries'));
      body = bar('ev-chart', 'Prometheus', x?.valueText ? [{ id: 'v', label: '', value: x.valueText }] : [], ch, true);
    } else {
      const text = e.raw, hl = text.split('\n').map((l, i) => /OOMKilled|exitCode|restartCount|failed|Failed|limits|memory|Xmx|value:|image:|SESSION_TTL|Insufficient|manifest unknown/.test(l) ? i + 1 : 0).filter(Boolean);
      const isDiff = text.split('\n').every(l => /^[-+ ]/.test(l)); /* a revision diff (GitOps) reads as one, with its file head */
      body = C.codeBlock.render({ path: `evidence-${e.id}.${isDiff ? 'diff' : e.kind === 'GitOps' ? 'txt' : 'yaml'}`, syntax: e.kind === 'GitOps' ? undefined : 'yaml', text, ...(isDiff ? { diff: true } : { hl }), wrap: true });
    }
    /* evidence read before its source went down stays what it was, and says so: collected then, not now */
    const srcId = evidenceSource(e), gone = srcId && !e.blocked ? freshness(w, srcId) : null;
    const before = gone?.stale ? html`<div class="v-stale">${C.statusIcon.render({ kind: 'idle', icon: 'clock', text: L('sim.v.evid.before', { src: gone.name, state: STATE_WORD[gone.state] ?? '', at: hms(e.to ?? e.at ?? 0) }) })}</div>` : '';
    return html`${C.pageHeader.render({ icon: e.kind === '로그' ? 'terminal' : e.kind === 'Prometheus' ? 'chart-line' : 'file-text', title: L('sim.v.evid.id', { id: e.id }), context: `${e.kind} · ${s.title} · ${L('sim.v.evid.collectedAt', { at: day(Math.min(t, 0) - 2) })}`, size: 'sm' })}${before}${metaOf()}${query}${body}`;
  }

  /** the request path of checkout: Ingress → Pod → response, each band in requests per second */
  function reqFlow() {
    const { w, sid, ph } = get(), f = requestFlow(w, sid, ph), g = { ...sankey({ id: 'req', label: L('sim.v.flow.requests'), nodes: f.nodes, links: f.links, visual: 'filledOutline', aspect: .42, gap: .1, fit: .85, wash: Math.floor(get().t / 10) }), live: true, stateLabels: { ok: '2xx·3xx', fail: '5xx' } };
    for (const n of g.nodes) if (n.id === 'err' && n.state === 'fail') n.reasons = [{ label: 'HikariPool Connection is not available', count: 3912 }];
    g.nodes.forEach(n => { if (n.action) n.action = 'sim.flowGo'; });
    return C.flowGraph.render(g);
  }
  const css = `${G.css}
.sim-body .ltb-slot { flex-wrap: wrap; row-gap: var(--space-2); } .sim-body { --page-toolbar-wrap: wrap; } /* every list's toolbar breaks the same way when narrow: left group (scope · search · filters) first, the right group (time · view) on the next line at the right */ /* a narrow body (a report or detail beside it): a slot's filters wrap instead of running out of the column */

.v-page { display: grid; grid-auto-rows: max-content; gap: var(--space-4); min-width: 0; }
.v-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); }
.v-title { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); min-width: 0; } .v-title b { font-size: var(--text-lg); font-weight: var(--weight-semibold); }
.v-sub { font-size: var(--text-xs); color: var(--muted-foreground); font-variant-numeric: tabular-nums; min-width: 0; }
.v-page [data-c="pill-tabs"], .v-page [data-tabs] { font-variant-numeric: tabular-nums; } /* pill counts line up (kit sets it on the count only) */
.v-kinds { display: flex; justify-content: flex-start; min-width: 0; max-width: 100%; overflow-x: auto; scrollbar-width: none; } .v-kinds:has(.select, [data-c="select"]) { flex-wrap: wrap; gap: var(--space-2); overflow-x: visible; mask-image: none; padding-inline-end: 0; } /* tabs and the 'more' select: the select drops to the next line rather than past the column */ .v-kinds > * { flex: 0 0 auto; width: auto; } /* the tabs hug their content; a narrow column scrolls them rather than widen the page */
.v-page > * { min-width: 0; }
.v-scope { display: grid; gap: var(--space-2); min-width: 0; } .v-when { display: flex; justify-content: flex-end; min-width: 0; } /* the scope box and, on a time-windowed view, its time range on the row right under it, at its right end */
.v-page { container-type: inline-size; } @container (max-width: 840px) { .v-kinds { mask-image: linear-gradient(to right, #000 calc(100% - var(--space-8)), transparent); padding-inline-end: var(--space-8); } } /* a narrow column scrolls the kind tabs: the fading edge says there is more */
.v-steps { display: grid; }
.v-dmetrics { display: grid; gap: var(--space-4); } .v-dmetrics .sbar-item { font-variant-numeric: tabular-nums; } .v-dmetrics .sbar-item:first-child { flex: none; width: calc(var(--space-16) * 1.4); } /* a detail's metric pills: the names in one column so the readings start together; the readings take their own width and fold behind "+N" from the end */
.v-who { display: inline-flex; align-items: center; gap: var(--space-1_5); white-space: nowrap; }
.v-logbar { flex-wrap: wrap; gap: var(--space-2); padding-block-end: var(--space-2); }
.sim-detail { --dt-flex-min: calc(var(--space-40) * 1); } /* a table in the narrow detail pane keeps a smaller flexible column before it hides optional ones */
.v-focus { display: flex; align-items: center; gap: var(--space-2); justify-content: space-between; padding: var(--space-2) var(--space-4); border-radius: var(--r-surface); corner-shape: var(--corner-round); background: var(--surface-secondary); font-size: var(--text-sm); }

.v-line { font-size: var(--text-sm); color: var(--foreground); overflow-wrap: anywhere; } /* one plain sentence in a bar's body (a cause, an event's message) */
.v-mono { font-family: var(--font-mono); }
.v-pair { display: inline-flex; gap: var(--space-1); align-items: baseline; white-space: nowrap; } .v-pair > span { color: var(--muted-foreground); font-size: var(--text-xs); }
.v-page, .sim-detail { --page-toolbar-wrap: wrap; } .v-page .ltb-s, .v-page .ltb-e, .sim-detail .ltb-s, .sim-detail .ltb-e { flex-wrap: wrap; min-width: 0; }
.v-tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); min-width: 0; }
.v-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(calc(var(--space-40) * 1.6), 1fr)); gap: var(--space-3); min-width: 0; }
.v-grid-1 { grid-template-columns: minmax(0, 1fr); }
.v-chips { display: flex; flex-wrap: wrap; gap: var(--space-1_5); }
.v-chip { all: unset; display: inline-flex; align-items: center; gap: var(--space-1_5); height: var(--control-h-sm); padding: 0 var(--space-2_5); border-radius: var(--r-pill); background: var(--secondary); font-size: var(--text-xs); color: var(--foreground); cursor: pointer; } .v-chip:hover { background: var(--accent); } .v-chip { padding-inline-start: var(--space-1); }
.v-empty { padding-block: var(--space-1); color: var(--muted-foreground); }
.v-stack .pg { grid-template-columns: minmax(0, 1fr); } /* key/value pairs one under another */
.sim-detail .pg-value .btn { max-width: 100%; } .sim-detail .pg-value .btn > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } /* a link value in a detail grid ends in an ellipsis at the pane edge, never past it */
.v-rows, .v-evs { display: grid; }
.v-row, .v-ev { all: unset; box-sizing: border-box; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 0 var(--space-3); min-height: var(--dt-row-h); padding-block: var(--space-1); border-block-start: var(--line) solid var(--border-surface); cursor: pointer; font-size: var(--text-sm); line-height: var(--leading-sm); }
.v-ev { height: var(--dt-row-h); padding-block: 0; } /* one line, the table's row height: the content sits in the middle of the row */
.v-evs:first-child > .v-ev:first-child, .v-rows:first-child > .v-row:first-child { margin-block-start: calc(-1 * var(--space-1_5)); } /* under a bar's rule the first row starts as a table's first row does, not a row lower */
.v-rows > :first-child, .v-evs > :first-child, .v-row:only-child { border-block-start: 0; }
.v-row:hover .v-row-t b, .v-ev:hover .v-ev-t b { text-decoration: underline; text-underline-offset: 3px; }
.v-row-t { display: grid; min-width: 0; } .v-row-t b { font-weight: var(--weight-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .v-row-t span { font-size: var(--text-xs); color: var(--muted-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-row-m, .v-ev-m { font-size: var(--text-xs); color: var(--muted-foreground); white-space: nowrap; font-variant-numeric: tabular-nums; }
.v-ev-t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted-foreground); } /* one line; the full message on hover */ .v-ev-t b { color: var(--foreground); font-weight: var(--weight-medium); }
.v-ev-o { font-size: var(--text-xs); color: var(--muted-foreground); max-width: calc(var(--space-40) * 1.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-flow { min-width: 0; }
.v-files { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: flex-start; } .v-files > .ft { flex: 1 1 calc(var(--space-40) * 1.2); max-width: calc(var(--space-40) * 1.6); } .v-files > .cb { flex: 999 1 calc(var(--space-40) * 2.4); min-width: 0; margin: 0; } /* the changed files beside the chosen file's diff; a narrow pane puts the tree above it */
/* the metric bars as one table of columns: title, value, three readings, state; tabular figures; the separators line up and do not move */
.v-metrics { display: grid; gap: var(--space-4); container-type: inline-size; }
.v-metrics .sbar-item { flex: 0 0 auto; font-variant-numeric: tabular-nums; white-space: nowrap; }
/* one width per column, wide enough for its longest reading: the bars line up and no label is cut */
.v-metrics .sbar-item:nth-child(1) { width: calc(var(--space-16) * 1.9); }
.v-metrics .sbar-item:nth-child(2) { width: calc(var(--space-16) * 1.1); }
.v-metrics .sbar-item:nth-child(3) { width: calc(var(--space-16) * 3.4); }
.v-metrics .sbar-item:nth-child(4) { width: calc(var(--space-16) * 2.95); }
.v-metrics .sbar-item:nth-child(5) { width: calc(var(--space-16) * 2.55); }
/* narrower, the bar drops whole readings, least needed first */
@container (max-width: 1060px) { .v-metrics .sbar-item:nth-child(5) { display: none; } }
@container (max-width: 880px) { .v-metrics .sbar-item:nth-child(4) { display: none; } }
@container (max-width: 700px) { .v-metrics .sbar-item:nth-child(3) { display: none; } }
.v-pager { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: var(--control-h); padding-block-start: var(--space-3); border-block-start: var(--line) solid var(--border-surface); } .v-pager .pager { padding: 0; } /* the count and the buttons on one row, inside the card */
.v-acts { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.v-stale { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.v-perm { display: inline-flex; align-items: center; gap: var(--space-2); min-width: 0; font-size: var(--text-sm); } /* the limited role: which kinds it cannot read, and where to see the permission it needs */
.v-dim { color: var(--muted-foreground); font-weight: var(--weight-regular); } .v-drow { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); min-width: 0; } .v-drow > .v-kinds { flex: 0 1 auto; } .v-drow-r { margin-inline-start: auto; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.v-kv1 .pg { grid-template-columns: minmax(0, 1fr); } .v-k8s { display: contents; } .v-k8s[data-old] > .sbar { opacity: var(--disabled-opacity); } /* the agent's last values while it is down: dimmed, never read as now */
.v-q { display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--text-xs); color: var(--muted-foreground); } .v-q code { font-family: var(--font-mono); overflow-wrap: anywhere; }
.v-log { display: grid; font-family: var(--font-mono); font-size: var(--text-xs); line-height: var(--leading-sm); max-height: calc(var(--space-40) * 3); overflow: auto; }
.v-log-l { display: grid; grid-template-columns: calc(var(--space-8) + var(--space-1)) calc(var(--space-16) + var(--space-1)) calc(var(--space-10) + var(--space-1)) minmax(0, 1fr); gap: var(--space-2); padding-inline: var(--space-1); border-radius: var(--r-mark); }
.v-log-l:hover { background: var(--ghost-hover); } .v-log-l[data-hit] { background: color-mix(in oklab, var(--primary) 7%, transparent); box-shadow: inset var(--space-0_5) 0 0 var(--primary); } .v-log mark { background: color-mix(in oklab, var(--primary) 20%, transparent); color: inherit; border-radius: var(--r-mark); text-decoration: none; } /* a hovered row is a light wash; a matched row keeps its own fill and a mark on its edge */ .v-log-l[data-level="ERROR"] .v-log-lv { color: var(--destructive-content); } .v-log-l[data-level="WARN"] .v-log-lv { color: var(--warning-content); }
.v-log-l[data-level="ERROR"][data-hit] { background: color-mix(in oklab, var(--primary) 7%, transparent); } /* a match is marked by a quiet left bar and tint, not a warning colour */
.v-log-n, .v-log-at { color: var(--muted-foreground); text-align: end; font-variant-numeric: tabular-nums; } .v-log-at { text-align: start; }
.v-trunc { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .v-who { display: inline-flex; align-items: center; gap: var(--space-1_5); min-width: 0; max-width: 100%; }
.v-log-tx { white-space: pre-wrap; overflow-wrap: anywhere; } .v-sw { display: inline-flex; align-items: center; gap: var(--space-1_5); font-size: var(--text-xs); color: var(--muted-foreground); } .v-logw[data-nots] .v-log-at { display: none; } .v-logw[data-nots] .v-log-l { grid-template-columns: calc(var(--space-8) + var(--space-1)) calc(var(--space-10) + var(--space-1)) minmax(0, 1fr); } .v-logw[data-nowrap] .v-log-tx { white-space: pre; overflow-wrap: normal; } .v-logw[data-nowrap] .v-log { overflow-x: auto; }
.v-log-gap { padding: var(--space-0_5) var(--space-1); color: var(--muted-foreground); font-family: var(--font-sans); }
`;
  /* the scope box's two pickers, one menu design: a search field, the tri-state all row, then rows of checkbox · icon · name · count. A kind counts its
     objects in the namespaces chosen; a namespace counts the objects of the kinds chosen (every kind Wake reads when none) in it. What Wake cannot read has a lock and no count */
  const pickMenu = (key, value, options, action) => C.select.menuDef({ key, multi: true, boxes: true, bulk: true, search: true, value, options, action });
  const kindMenu = () => { const { S } = get(), sc = scope(), counts = Object.fromEntries(KINDS.map(([k]) => [k, num(rowsOfKind(k).filter(r => sc.inNs(r.ns)).length)]));
    return pickMenu('kind', picked(S.scKind) ?? (S.scKind?.length === 0 ? [] : KINDS.map(([k]) => k)), kindTabs(counts).map(x => ({ id: x.id, label: `${x.label} · ${x.count ?? L('sim.v.c.noPerm')}`, icon: x.count != null ? x.icon : 'lock' })), 'sim.pickKinds'); };
  const nsMenu = () => { const { S, w } = get(), kinds = (picked(S.scKind) ?? KINDS.map(([k]) => k)).filter(k => !deniedKinds(S.conn).includes(k)), n = new Map();
    for (const k of kinds) for (const r of rowsOfKind(k)) if (r.ns) n.set(r.ns, (n.get(r.ns) ?? 0) + 1);
    return pickMenu('nsm', picked(S.nsMulti) ?? (S.nsMulti?.length === 0 ? [] : w.namespaces), w.namespaces.map(x => ({ id: x, label: `${x} · ${num(n.get(x) ?? 0)}`, icon: 'k8s-namespace' })), 'sim.pickNsMulti'); };
  const aiLogRow = id => AILOG.get(id);
  /* what the head card says besides the state: a kind's own trouble, and what Wake cannot read or change about the object */
  const whyOf = r => G.whyOf(r);
  const notesOf = r => [...G.notesOf(r), ...(r.kind === 'Application' && get().w.tools.find(x => x.id === 'argocd')?.state === 'limited' ? [{ icon: 'lock', text: L('sim.v.app.readOnly') }] : [])];
  const scopePods = () => { const sc = scope(); return sc.kinds || sc.ns ? logPods(sc) : null; };
  return { scopePods, evidenceSource, eventsOf, alertWindow, whyOf, notesOf, aiLogRow, aiLogDetail, kindMenu, nsMenu, searchPage, findBox, findResults, listBar, status, statusCell, chart, groupEv, networkPage, aiLogPage, auditList, toolDetail, agentDetail, pastDetail, alertDetail, eventDetail, stale, reqFlow, metricPage, gitopsPage, home, resources, resourceDetail, logsPage, eventsPage, alertsPage, incidentsPage, toolsPage, agentPage, evidenceView, connChips, logList, findResource, css };
}
