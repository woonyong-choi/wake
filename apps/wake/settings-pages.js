/*
 * 설정 › 연결 묶음의 페이지 정의(데이터만, 화면은 kit 설정 페이지가 그림).
 *   클러스터 개요 + 클러스터마다 하위 페이지(연결 정보·상태와 동작, namespace, 권한 요약, 에이전트, 이 클러스터의 도구, GitOps)
 *   에이전트(클러스터마다 한 줄), 도구(클러스터별 도구, 공통 도구), Git 연결(계정, 저장소)
 * 클러스터는 사용자 것이고 Wake는 연결만 관리한다: kubeconfig를 고치지 않고, namespace를 만들거나 지우지 않는다.
 */
import { text } from '../../kit/index.js';
import { costAddress } from './data/costs.js';
import { cardOf, clusterPresentation } from './data/live.js';
import { connView, hasToolReadPath, toolPermissionLabel, toolViews, readOf, read, rememberFound, SOURCE_KIND } from './data/conn-view.js';
import { LIMITS, ACTIONS } from './data/connect-flow.js';
import { formatToolVersion } from './version-display.js';
import { toolKind } from './data/tool-kinds.js';

const TOOL_LOGIN = ['grafana', 'argocd'];
export const PROVIDER_ICON = { eks: 'brand-eks', gke: 'brand-gke', aks: 'brand-aks', kind: 'brand-kind', docker: 'brand-docker', minikube: 'brand-kubernetes', kubernetes: 'brand-kubernetes' };

/* 권한 세 칸(읽기·쓰기·Secret): 허용은 성공 색 원 체크, 없음은 주황 자물쇠(처음 디자인), 모든 칸에 이름. 모든 행이 같은 세 칸이라 열이 맞음 */
export const permVerbs = a => ({ type: 'group', items: ['read', 'write', 'secret'].map(k => a[k] ? { type: 'state', kind: 'ok', label: `wake.s.perm.verb.${k}`, labeled: true }
  : { type: 'state', kind: 'fix', icon: 'status-perm', label: `wake.s.perm.verb.${k}` }) });

/**
 * 클러스터마다 따로 읽기(설정 › 권한·에이전트·도구): 한 클러스터가 답하지 않아도 페이지 전체를 막지 않는다. 답을 기다리는 동안 그 클러스터의 행은 확인 중,
 * LIMITS.readMs 안에 답이 없으면 시간 초과, 실패는 읽기 실패(둘 다 다시 시도). 다시 시도(ctx.fresh)는 실패한 것만 다시 읽는다.
 * 답은 keepMs가 지나면 뒤에서 다시 읽고, 새 답이 올 때까지 지난 답을 그대로 보인다(설정이 바뀔 때마다 "확인 중"으로 돌아가지 않음, R4-02).
 * 실패·시간 초과는 사람이 다시 시도할 때까지 그대로(스스로 다시 읽어 "확인 중"을 되풀이하지 않음).
 * pending: 아직 답을 기다리는 읽기(kit 설정 페이지가 답이 오면 그 페이지를 다시 그림)
 */
export function perCluster(read, keepMs = 10000, failed = () => false) {
  const kept = new Map(), again = new Map();
  const start = (ctx, id) => { const next = { state: 'busy', at: Date.now() }; let timer;
    const limit = new Promise((_, no) => { timer = setTimeout(() => no(Object.assign(new Error('read timeout'), { kind: 'timeout' })), LIMITS.readMs); });
    next.promise = Promise.race([Promise.resolve().then(() => read(ctx, id)), limit])
      .then(value => Object.assign(next, { state: 'ok', value, at: Date.now() }),
        error => Object.assign(next, { state: error?.kind === 'timeout' ? 'timeout' : 'error', at: Date.now() }))
      .finally(() => clearTimeout(timer));
    return next; };
  return (ctx, ids) => {
    /* 다시 시도: 실패·시간 초과와, 읽기는 끝났지만 그 값이 실패를 말하는 것(failed(value): 도구 찾기의 권한 없음·시간 초과·일부만 등)을 다시 읽음 */
    if (ctx.fresh) for (const [id, e] of kept) if (e.state !== 'busy' && (e.state !== 'ok' || failed(e.value))) { kept.delete(id); again.delete(id); }
    const waits = [];
    for (const id of ids) {
      let e = kept.get(id);
      if (!e) kept.set(id, (e = start(ctx, id)));
      /* 오래된 답: 뒤에서 다시 읽고 그동안 지난 답. 새 답이 성공이면 바꾸고, 실패면 지난 답을 두고 다음 keepMs 뒤에 다시 */
      else if (e.state === 'ok' && Date.now() - e.at > keepMs && !again.has(id)) {
        const next = start(ctx, id); again.set(id, next);
        next.promise = next.promise.then(() => { if (again.get(id) !== next) return; again.delete(id); if (next.state === 'ok') kept.set(id, next); else e.at = Date.now(); });
      }
      if (e.state === 'busy') waits.push(e.promise);
      else if (again.has(id)) waits.push(again.get(id).promise);
    }
    return { of: id => kept.get(id), pending: waits.length ? Promise.race(waits) : undefined };
  };
}

export function connectPages({ raw, sel, opt, addr, notify, agentCommand, withForm, addMethods, clouds }) {
  const knownResult = value => {
    if (value == null || value.unknown || value.access === 'unknown') throw new Error();
    return value;
  };
  const clusters = st => {
    const list = st.settings['wake.clusters.list'];
    return Array.isArray(list) ? list.map(c => ({ id: c.id, ctx: c.ctx, presentation: c.presentation, infrastructure: c.infrastructure, server: c.server, provider: c.provider, file: c.file, version: c.version, state: c.state, user: c.user || '', real: true })) : [];
  };
  const pageId = id => 'cluster-' + id;
  /* 클러스터 한 줄: kit 연결 행. 다시 확인하면 행 끝 글이 단계를 따라 바뀌고, 멈추면 원인의 두 낱말과 그 동작 */
  /* 연결 모습(conn-view) -> kit 설정 페이지의 연결 행 값: 머리 동작은 상태 표(HEAD)가 정한 것만, 흐름의 상태와 동작은 행 끝 */
  /* 행 끝 더 보기(…): 상태 하나 옆의 메뉴 하나(app.config.js 'wake.row.more'). 연결 해제는 위험 항목 */
  const more = acts => acts.length ? [{ type: 'more', menu: 'wake.row.more', arg: acts.map(a => ({ id: a.id, label: a.label, icon: a.icon, action: a.action, arg: a.arg, danger: !!a.danger || a.action === 'wake.flow.disconnect' })) }] : [];
  const connRow = v => ({ kind: v.kind, busy: v.busy, attention: v.attention, action: v.action, extra: v.extra.map(b => ({ type: 'button', size: 'sm', variant: 'secondary', ...b })), flow: v.flow, state: v.word ? text(v.word) : undefined });
  const clusterRow = (st, c) => { const k = cardOf({ ...c, authKind: 'token' }, { state: c.state, version: c.version, namespace: '', error: '' }), live = (st['wake.conn.live'] || {})[c.id];
    /* 다시 확인 중이거나 그 결과를 펼친 줄: 연결 행 상태 표(HEAD)대로(진행 중에는 취소만), 그 밖은 저장한 확인 결과의 상태와 동작 하나 */
    const v = live ? connView(st, c.id, {}) : null, head = v ? connRow({ ...v, action: v.connected ? null : v.action, extra: [] }) : null;
    return { id: 'cl-' + c.id, icon: PROVIDER_ICON[c.provider] || 'brand-kubernetes', title: raw(clusterPresentation(c).name), description: raw(clusterPresentation(c).endpoint),
      connection: head ? { ...head, statusLabel: text(v.description || k.desc), kind: v.connected ? k.kind : head.kind, rowAction: v.busy ? undefined : 'kit.navigate', rowArg: { address: addr.settings(pageId(c.id)) } }
        : { kind: k.kind, statusLabel: text(k.desc), busy: false, attention: !!k.action, action: k.action, rowAction: 'kit.navigate', rowArg: { address: addr.settings(pageId(c.id)) }, flow: null } }; };
  /* 도구 한 줄: kit 연결 행(상태, 동작 하나, 단계). 로그인하는 도구는 로그인해서 연결(Wake 전용 읽기 계정), 토큰 직접 입력은 대체 방법.
     연결됨에는 열기와 연결 해제 */
  /* view: 판단 함수 toolViews(conn-view)의 그 도구(health · reason), hubRead: 허브 출처 상태의 읽기 결과(아직 · 실패 · 값) */
  const toolRow = (c, t, st = {}, view = null, hubRead = read.unread()) => { const k = toolKind(t.kind, 'server-cog'), key = `${c}-${t.kind}`, login = TOOL_LOGIN.includes(t.kind), tool = t.raw || t;
    const v = connView(st, key, { connect: { label: login ? 'wake.tool.loginConnect' : 'wake.flow.connect', icon: login ? 'log-in' : undefined, action: 'wake.tool.connect', arg: { cluster: c, tool } },
      alt: login ? { label: 'wake.flow.a.token', variant: 'ghost', action: 'wake.tool.tokenForm', arg: { cluster: c, tool } } : null, open: { label: 'wake.home.open', icon: 'arrow-up-right', action: 'wake.tool.open', arg: { cluster: c, tool } }, idleText: raw(t.svc) });
    const row = { id: `tool-${key}`, tile: k.icon, title: raw(k.name), description: raw(t.svc || '') };
    /* 도구의 건강 상태는 홈 칩·도구 화면과 같은 출처 상태(허브가 읽은 hub.sources) 하나. 연결 흐름은 사람이 하는 조작이 진행 중이거나 사람의 조치를 기다릴 때만
       그 줄을 차지하고(단계·취소·로그인 등), 끝난 흐름(연결됨·실패·취소·시간 초과)의 기록은 허브의 끊김·권한 필요·오래됨을 정상으로 덮지 않는다 */
    const lives = st['wake.conn.live'] || {}, live = lives[key + ':open'] || lives[key];
    const operating = !!live && (['running', 'waiting', 'watching'].includes(live.state) || /^needs-/.test(live.state || ''));
    /* 건강은 판단 함수 하나(홈·도구 목록·상세와 같은 입력이면 같은 값). 허브가 그 종류를 읽었거나 허브 읽기가 실패·아직이면 그 값,
       허브 읽기 실패는 과거 연결 기록을 지금 건강으로 올리지 않고 끊김 + 다시 시도 */
    if (view && !operating && (hubRead.status !== 'ok' || hubRead.value?.[t.kind] || view.retry)) {
      const state = view.health, word = state === 'ok' ? undefined : text(`source.${state}`), rec = (st['wake.connections'] || {})[key];
      const open = { label: 'wake.home.open', icon: 'arrow-up-right', action: 'wake.tool.open', arg: { cluster: c, tool } };
      /* 열 수 없는 사유(확인 못 한 바인딩의 권한·준비 안 됨)는 건강과 따로 설명 끝에 */
      const why = view.blocked ? text(view.blocked) : '';
      return withForm(st, key, { ...row, ...(why ? { description: raw([t.svc, why].filter(Boolean).join(' · ')) } : {}), connection: { kind: SOURCE_KIND[state], busy: state === 'busy', attention: ['error', 'perm', 'limited'].includes(state), state: word, statusLabel: text(`source.${state}`),
        /* 연결됨: 연결 기록이 있으면 같은 줄 모양(열기 · 연결 해제), 없으면 열기 하나 */
        /* 열거를 읽지 못해 지금 열 대상(바인딩)이 없으면 열기를 두지 않음(다시 시도는 아래 도구 찾기 줄) */
        /* 연결됨: 행 끝은 상태 하나 + 더 보기(… 안에 열기 · 연결 기록이 있으면 연결 해제) */
        ...(state === 'ok' ? { action: null, extra: more([...(view.openable ? [{ id: 'open', ...open }] : []), ...(rec ? [{ id: 'off', ...ACTIONS.disconnect, arg: { key }, danger: true }] : [])]) }
          /* 출처 조회 실패는 연결이 아니라 다시 읽기(다시 시도) */
          : view.retry || state === 'error' ? { action: RETRY, extra: [] }
          : { action: state === 'busy' ? null : { label: login ? 'wake.tool.loginConnect' : 'wake.flow.connect', icon: login ? 'log-in' : undefined, action: 'wake.tool.connect', arg: { cluster: c, tool } }, extra: [] }),
        flow: null } });
    }
    /* 허브가 아직 읽지 않은 도구: 찾기 결과(서비스가 하나로 정해지지 않음·준비 안 됨·권한 없음)가 상태 */
    if (tool.selection && tool.selection !== 'verified' && !(tool.selection === 'unverified' && hasToolReadPath(st, key, tool))) {
      const permission = toolPermissionLabel(tool);
      const state = { type: 'state', kind: permission ? 'perm' : 'error', label: permission || 'wake.home.toolNotReady' };
      return { ...row, wideControl: true, control: permission ? { type: 'group', items: [
        state, { type: 'button', label: 'wake.flow.a.retry', size: 'sm', variant: 'secondary', action: 'kit.settings.reload' },
      ] } : state };
    }
    const flow = !v.connected && v.flow ? { ...v.flow, raw: null, cause: null, approval: false } : null;
    /* 연결됨(흐름 기록): 행 끝은 상태 하나 + 더 보기(열기 · 연결 해제) */
    const conn = v.connected && !flow ? { ...connRow({ ...v, action: null, extra: [] }), extra: more([...v.extra, ...(v.action ? [v.action] : [])].map((a, i) => ({ id: 'a' + i, ...a }))) } : connRow({ ...v, flow });
    return withForm(st, key, { ...row, connection: { ...conn, statusLabel: v.connected ? text('wake.connected') : text(v.flow?.cause || v.description) } }); };
  /* 도구 찾기: 열거(clusterTools)와 찾기 권한(toolAccess)·허브 출처 상태를 각각 읽음. 열거 실패는 빈 목록이 아니라 실패(inventory)로 남기고,
     열거가 오면 찾기 확인 근거(wake.tools.found)에 반영 */
  const discoverTools = async (ctx, id) => {
    const request = { cluster: id, discovery: {}, refresh: ctx.fresh === true };
    const [inventory, access, hub, cost] = await Promise.all([readOf(ctx.data.get('clusterTools', request)), ctx.data.get('toolAccess', request).catch(() => null), readOf(ctx.data.get('sourceStates', request)), ctx.data.get('costState', request).catch(() => null)]);
    rememberFound(() => ctx.settings?.(), ctx.api?.setSetting, id, inventory);
    if (inventory.status === 'ok') return { rows: Array.isArray(inventory.value) ? inventory.value : [], inventory, access: access?.access || 'ok', need: access?.need, hub, cost };
    const error = inventory.error;
    const kind = error?.status === 403 || access?.access === 'forbidden' ? 'forbidden' : error?.kind === 'timeout' || error?.code === 'tool_deadline' ? 'timeout' : 'unknown';
    return { rows: [], inventory, access: kind, need: access?.need, hub, cost };
  };

  /* 클러스터 페이지의 자료: 연결 흐름이 움직이는 동안 설정이 자주 바뀌어 다시 그려지므로, 같은 클러스터 자료는 잠깐 다시 쓰고 클러스터에는 다시 묻지 않음 */
  const KEEP_MS = 10000, kept = new Map();
  const clusterData = (ctx, id) => { const k = kept.get(id); if (k && !ctx.fresh && Date.now() - k.at < KEEP_MS) return k.p;
    const p = Promise.all([...['namespaces', 'access', 'agent', 'gitops'].map(key => ctx.data.get(key, { cluster: id }).then(knownResult)), discoverTools(ctx, id)]); kept.set(id, { at: Date.now(), p }); p.catch(() => { if (kept.get(id)?.p === p) kept.delete(id); }); return p; };
  /* 흐름이 없는 연결의 지금 상태(읽은 결과에서): 연결 행이 같은 상태 표로 그리도록 흐름 모습처럼 만듦 */
  const derived = (st, key, d) => (st['wake.conn.live'] || {})[key] || !d ? st : { ...st, 'wake.conn.live': { ...(st['wake.conn.live'] || {}), [key]: d } };
  /* 클러스터마다 읽은 결과(perCluster)가 아직이거나 실패한 행: 같은 연결 행(확인 중 · 시간 초과 · 읽기 실패와 다시 시도) */
  const RETRY = { label: 'wake.flow.a.retry', icon: 'arrow-rotate-clockwise', action: 'kit.settings.reload' };
  const readFlow = e => (e.state === 'busy' ? { state: 'running' } : { state: e.state === 'timeout' ? 'timeout' : 'failed', cause: e.state === 'timeout' ? 'wake.flow.c.timeout' : 'wake.find.c.read', kind: 'error', actions: [RETRY] });
  const readRow = (st, key, e, row) => { const v = connView(derived(st, key, readFlow(e)), key, {}); return { ...row, id: key, description: v.description, connection: connRow(v) }; };
  /* 권한이 없어 읽지 못함(흐름 없이 읽은 결과): 권한 필요 상태와 그 동작 하나(필요한 권한 보기) */
  const permView = (cluster, need) => ({ state: 'needs-perm', cause: 'wake.flow.c.forbidden', kind: 'perm', actions: need ? [{ label: 'wake.flow.a.perm', icon: 'lock', action: 'wake.perm.show', arg: { cluster, need } }] : [] });
  /* GitOps: 찾은 컨트롤러마다 연결 행(내 kubeconfig로 읽음: 읽을 수 있으면 연결됨, 못 읽으면 관리자 필요), 그 아래 Application·Kustomization.
     컨트롤러가 없으면 GitOps 컨트롤러 연결 행 하나(누르면 찾기: 접속 → 권한 → 준비 완료) */
  const gitopsGroups = (st, c, g) => {
    const ctrls = g?.controllers?.[c.id] || [], apps = (g?.repos || []).flatMap(r => r.apps.filter(a => a.cluster === c.id).map(a => ({ ...a, repo: r })));
    const row = (key, kind, title, icon, d, desc) => { const v = connView(derived(st, key, d), key, { connect: { label: 'wake.flow.connect', action: 'wake.conn.start', arg: { key, method: 'gitops', target: `${c.id}/${kind}` } }, connectedText: desc, });
      return { id: key, icon, title, description: v.description, connection: { ...connRow({ ...v, action: v.connected ? null : v.action, extra: [] }), extra: v.connected ? [] : more(v.extra.map((a, i) => ({ id: 'a' + i, ...a }))) } }; };
    const ctrlRows = ctrls.map(x => row(`gitops-${c.id}-${x.kind}`, x.kind, raw(toolKind(x.kind).name), toolKind(x.kind, 'server-cog').icon,
      x.access === 'forbidden' ? permView(c.id, x.kind === 'flux' ? { user: c.user, resource: 'kustomizations', group: 'kustomize.toolkit.fluxcd.io', namespace: '' } : { user: c.user, resource: 'applications', group: 'argoproj.io', namespace: '' }) : { state: 'connected' },
      raw([x.ns, formatToolVersion(x.version)].filter(Boolean).join(' · '))));
    const appRows = apps.map(a => ({ id: 'app-' + a.name, icon: a.controller === 'flux' ? 'brand-flux' : 'brand-argo', title: raw(`${a.kind} ${a.name}`), description: raw(`${a.repo.name} · ${a.path} → ${a.ns}`), wideControl: true,
      control: { type: 'state', kind: ['Synced', 'Ready'].includes(a.sync) ? 'ok' : 'warn', label: raw(a.sync) }, trail: 'chevron', action: 'kit.navigate', arg: { address: addr.cluster(c.id) + '/gitops' } }));
    if (ctrlRows.length || appRows.length) return [ctrlRows, ...(appRows.length ? [appRows] : [])].filter(x => x.length);
    return [[row(`gitops-${c.id}-any`, 'any', 'wake.s.cl.gitopsConnect', 'tool-gitops', g?.access === 'forbidden' ? permView(c.id, { user: c.user, resource: 'applications', group: 'argoproj.io', namespace: '' }) : null)]];
  };
  /* 열거를 읽지 못한 동안(아직·실패·시간 초과) 남는 도구: 판단 함수의 included(연결 기록·찾기 확인 근거), 건강은 같은 판단(허브·실패 사유) */
  const keptGroups = (st, c, inventory, hub) => { const set = toolViews({ cluster: c.id, settings: st, inventory, hub });
    return set.included.length ? [set.included.map(v => toolRow(c.id, { kind: v.kind, ns: v.found?.ns || '', svc: v.found ? [v.found.ns, v.found.svc].filter(Boolean).join('/') + (v.found.port ? ':' + v.found.port : '') : '' }, st, v, hub))] : []; };
  const toolGroups = (st, c, { rows, access, need, inventory = read.ok(rows), hub = read.unread() }) => {
    /* 도구 찾기가 멈춘 행: 같은 연결 행(원인과 다시 시도). 연결 근거가 있는 도구는 그 위에 남음 */
    const key = `tools-${c.id}`, findRow = d => { const v = connView(derived(st, key, d), key, {}); return { id: key, icon: 'puzzle', title: 'wake.s.cl.toolsFind', description: v.description, connection: connRow(v) }; };
    if (access === 'forbidden') return [...keptGroups(st, c, inventory, hub), [findRow(permView(c.id, need))]];
    if (!['ok', 'partial'].includes(access)) return [...keptGroups(st, c, inventory, hub), [findRow(readFlow({ state: access === 'timeout' ? 'timeout' : 'error' }))]];
    const set = toolViews({ cluster: c.id, settings: st, inventory: read.ok(rows), hub });
    const groups = set.included.length ? [set.included.map(view => toolRow(c.id, view.tool || { kind: view.kind }, st, view, hub))] : [];
    if (access === 'partial') return [...groups, [findRow({ state: 'failed', cause: 'wake.gitops.partial', kind: 'warn', actions: [RETRY] })]];
    return groups.length ? groups : [[{ id: `tools-${c.id}-none`, title: 'wake.s.cl.toolsNone' }]];
  };
  const toolSection = (st, c, inventory, title) => ({
    title, count: ['ok', 'partial'].includes(inventory.access) ? toolViews({ cluster: c.id, settings: st, inventory: inventory.inventory || read.ok(inventory.rows), hub: inventory.hub }).included.length : undefined,
    /* OpenCost: 비용 화면과 같은 사실(저장된 연결 기록, A2-20). 연결되면 Service와 연결됨, 아니면 비용 화면과 같은 "연결 안 됨" */
    groups: [...toolGroups(st, c, inventory), [{ id: 'costs-' + c.id, icon: 'chart-line', title: raw('OpenCost'),
      description: inventory.cost?.status === 'connected' ? raw(inventory.cost.service) : 'wake.cost.unconfigured',
      ...(inventory.cost?.status === 'connected' ? { control: { type: 'state', kind: 'ok', label: 'wake.connected' } } : {}),
      trail: 'chevron', action: 'kit.navigate', arg: { address: costAddress(c.id, { configure: 1 }) } }]],
  });
  /* 에이전트 한 줄: 연결 행(설치를 누르면 아래 터미널에서 Helm 명령을 대신 실행하고 권한 → 설치 → 준비 → 연결 확인 단계), 명령 복사는 보조 */
  const agentRow = (st, id, a, extra = {}) => { const key = 'agent-' + id, live = (st['wake.conn.live'] || {})[key];
    const connected = a?.lookup === 'present' && a.rolloutReady === true;
    const missing = a?.lookup === 'absent' || (!a?.lookup && a?.installed === false && !a?.unknown);
    /* 앱이 설치할 차트의 이미지가 이 버전에 없음(agent installImage): 설치 단추 대신 그 이유(R4-02). 모르면(null) 설치를 두고 흐름이 확인 */
    const blocked = missing && a?.installImage && a.installImage.published !== true ? (a.installImage.reason === 'agent_values_unreadable' ? 'wake.flow.c.chartUnreadable' : 'wake.flow.c.imageUnpublished') : null;
    const projected = live && live.state !== 'connected' ? live : { ...(live || {}), state: connected ? 'connected' : 'idle' };
    const installText = a?.lookup === 'present' ? a.rolloutReady === true ? 'wake.agent.rolloutReady' : a.rolloutReady === false ? 'wake.agent.rolloutProgressing' : 'wake.agent.rolloutUnknown'
      : a?.installed === true ? 'wake.home.agentInstalled' : 'wake.s.ag.none';
    const v = connView({ ...st, 'wake.conn.live': { ...(st['wake.conn.live'] || {}), [key]: projected } }, key, {
      connect: blocked ? null : missing ? { label: 'wake.s.ag.install', icon: 'download', action: 'wake.agent.install', arg: id }
        : { label: 'wake.flow.a.retry', icon: 'arrow-rotate-clockwise', action: 'kit.history.reload' },
      alt: missing && !blocked && agentCommand(id) ? { label: 'wake.flow.a.copyInstall', icon: 'copy', variant: 'ghost', action: 'wake.copy', arg: { value: agentCommand(id) } } : null, /* 이미지가 공개되지 않은 차트의 설치 명령은 복사하게 하지 않음(B2-01) */
      connectedText: a?.version ? { key: 'wake.s.ag.version', vars: { v: a.version } } : 'wake.connected',
      idleText: blocked || (missing ? 'wake.s.ag.none' : null) || raw(`${text(installText)} · ${text('wake.notConnected')}`) });
    return { id: 'ag-' + id, icon: 'wake-agent', title: 'wake.home.agentName', ...extra, description: v.description, connection: { ...connRow({ ...v, action: v.connected ? null : v.action, extra: [] }), extra: v.connected ? [] : more(v.extra.map((a, i) => ({ id: 'a' + i, ...a }))) } }; };
  /* 클러스터 하위 페이지 하나 */
  const clusterPage = c => ({ id: pageId(c.id), label: raw(clusterPresentation(c).name), icon: 'k8s-cluster', title: raw(clusterPresentation(c).name), sections: async ctx => {
    const [nsList, access0, agent0, gitops, inventory] = await clusterData(ctx, c.id), access = access0 || [], agent = agent0 || { installed: false };
    const st = ctx.settings(), added = st['wake.ns.added.' + c.id] || [], names = [...new Set([...(nsList || []), ...added])];
    return [
      { title: 'wake.s.cl.connection', groups: [[
        /* 연결 상태: 목록과 같은 연결 행(다시 확인하면 이 자리에서 단계가 채워짐), 더 보기 메뉴 */
        (r => ({ ...r, id: 'cl-state', title: raw(clusterPresentation(c).name), connection: { ...r.connection, rowAction: undefined, action: null,
          extra: [...(r.connection.extra || []), ...(r.connection.action ? [{ type: 'button', size: 'sm', variant: 'secondary', ...r.connection.action }] : []), { type: 'more', menu: 'wake.cluster.more', arg: c.id }] } }))(clusterRow(st, c)),
        /* 주소는 남는 폭을 다 쓴다(짧은 값 칸 폭으로 잘리지 않음) */
        ...(c.server ? [{ id: 'cl-server', title: 'wake.s.cl.server', wideControl: true, control: { type: 'value', text: raw(c.server), mono: true } }] : []),
        { id: 'cl-version', title: 'wake.s.cl.version', control: { type: 'value', text: raw(c.version || '') } },
      ]] },
      { title: 'wake.s.cl.agent', groups: [[agentRow(st, c.id, agent)]] },
      toolSection(st, c, inventory, 'wake.s.cl.tools'),
      { title: raw('Namespace'), count: names.length, groups: [[
        { id: 'ns-default', title: 'wake.s.cl.nsDefault', description: 'wake.s.cl.nsDefault.desc', control: sel('wake.ns.default.' + c.id, names.map(n => opt(n, raw(n)))) },
      ], [
        ...names.map(n => ({ id: `ns-${c.id}-${n}`, icon: 'k8s-namespace', title: raw(n) })),
        { id: 'ns-add', variant: 'add', title: 'wake.s.cl.nsAdd', dialog: 'wake.ns.add', arg: c.id },
      ]] },
      { title: 'wake.s.cl.access', groups: [[
        ...(access.length ? access.map(a => ({ id: `acc-${c.id}-${a.ns}`, icon: 'k8s-namespace', title: raw(a.ns), control: permVerbs(a), wideControl: true })) : [{ id: 'acc-none', title: 'wake.s.perm.unknown', description: 'wake.s.perm.unknown.desc' }]),
        { id: 'acc-open', title: 'wake.s.cl.accessAll', trail: 'chevron', action: 'kit.navigate', arg: { address: addr.settings('permissions') } },
      ]] },
      { title: raw('GitOps'), groups: gitopsGroups(st, c, gitops) },
    ];
  } });

  const clustersPage = { id: 'clusters', label: 'wake.settings.clusters', icon: 'k8s-cluster', children: st => clusters(st).map(c => ({ ...clusterPage(c) })),
    sections: ctx => { const st = { settings: ctx.settings() }; const list = clusters(st); return [
      { title: 'wake.s.clusters.list', count: list.length, groups: [[
        /* 연결 설정 파일(connections.json)을 읽지 못함: 그동안은 환경의 kubeconfig만 읽는다(services kube.read connections). 고치는 길과 다시 읽기 */
        ...(st.settings['wake.kube.connections']?.state === 'error' ? [{ id: 'cl-conn-file', icon: 'file-text', title: 'wake.s.connFile.title', description: `wake.s.connFile.${st.settings['wake.kube.connections'].repair || 'CONNECTIONS_REPAIR_RETRY'}`,
          connection: { kind: 'error', attention: true, state: text('wake.s.connFile.state'), statusLabel: text('wake.s.connFile.state'), action: st.settings['wake.kube.connections'].repair === 'CONNECTIONS_REPAIR_PERMISSIONS'
            /* 권한 오류는 Wake가 고칠 수 있다(확인 대화상자 뒤 kube.connectionsRepair). 내용 오류는 사람이 고친 뒤 다시 읽기 */
            ? { label: 'wake.s.connFile.repair', icon: 'shield-check', action: 'kit.dialog.open', arg: { id: 'wake.kube.repairDlg' }, variant: 'secondary' }
            : { label: 'wake.s.connFile.reread', icon: 'arrow-rotate-clockwise', action: 'wake.kube.reread', variant: 'secondary' } } }] : []),
        ...list.map(c => clusterRow(st.settings, c)),
        /* 설정에서 시작한 새 연결(파일, 붙여넣기, 토큰): 끝나면 접힌 뒤 위 목록의 클러스터 줄이 됨 */
        /* 붙여넣기·토큰은 고르면 그 줄이 펼쳐진 채 나타나 값 줄에서 받음(대화상자 없음) */
        /* 줄 이름·아이콘은 첫 실행 "새로 연결"과 같은 연결 방법(파일·붙여넣기, 서버 주소와 토큰, 클라우드 명령) */
        ...[...new Set([...Object.keys(st.settings['wake.conn.live'] || {}).filter(k => /^add-/.test(k)), ...(/^add-(paste|token|cloud-\w+)$/.test(st.settings['wake.conn.form'] || '') ? [st.settings['wake.conn.form']] : [])])].map(k => { const v = connView(st.settings, k, { connect: { label: 'wake.flow.a.cancel', variant: 'ghost', action: 'wake.conn.form', arg: k } });
          const method = /^add-cloud/.test(k) ? 'add-cloud' : k === 'add-token' ? 'add-token' : 'add-file', m = addMethods.find(x => x.id === method);
          const row = connRow(v), pick = k === 'add-paste' ? [{ type: 'button', size: 'sm', variant: 'secondary', icon: 'folder-open', label: 'wake.fr.add.pick', action: 'wake.kube.pick' }] : [];
          /* 클라우드 줄은 고른 곳의 상표로(어느 클라우드인지) */
          const cloud = clouds.find(x => k === 'add-cloud-' + x.id);
          return withForm(st.settings, k, { id: 'cl-' + k, icon: cloud?.icon || m.icon, title: m.label, description: v.description, connection: { ...row, extra: [...pick, ...row.extra] } }); }),
        { id: 'cl-add', variant: 'add', title: 'wake.cmd.connectCluster', menu: 'wake.cluster.connect' },
      ]] },
      { title: 'wake.s.clusters.defaults', groups: [[
        { id: 'cl-auto', title: 'wake.s.clusters.auto', description: 'wake.s.clusters.auto.desc', control: { type: 'switch', key: 'wake.cluster.autoRefresh' } },
        { id: 'cl-refresh', title: 'wake.s.clusters.refresh', description: 'wake.s.clusters.refresh.desc', control: sel('wake.cluster.refresh', [opt('120', 'wake.s.sec.120'), opt('300', 'wake.s.sec.300'), opt('600', 'wake.s.sec.600')]) },
        { id: 'cl-focus', title: 'wake.s.clusters.focus', description: 'wake.s.clusters.focus.desc', control: { type: 'switch', key: 'wake.cluster.refreshOnFocus' } },
        { id: 'cl-hide', title: 'wake.s.clusters.hide', description: 'wake.s.clusters.hide.desc', control: { type: 'switch', key: 'wake.cluster.hideOff' } },
      ]] },
    ]; } };

  /* 에이전트: 각 클러스터 안에서 쿠버네티스 정보와 연결한 도구 자료를 모아 Wake에 주는 수집기(읽기 전용) */
  const agentReads = perCluster((ctx, id) => ctx.data.get('agent', { cluster: id }).then(knownResult));
  const agentsPage = { id: 'agents', label: 'wake.settings.agents', icon: 'wake-agent', sections: ctx => { const st = { settings: ctx.settings() }; const list = clusters(st), reads = agentReads(ctx, list.map(c => c.id));
    const row = c => { const e = reads.of(c.id), head = { icon: 'k8s-cluster', title: raw(clusterPresentation(c).name) };
      return e.state === 'ok' ? agentRow(st.settings, c.id, e.value, head) : readRow(st.settings, 'ag-read-' + c.id, e, head); };
    return [{ title: 'wake.s.ag.list', pending: reads.pending, groups: [list.map(row)] }]; } };

  /* 도구: 클러스터에서 찾은 서비스, 공통 도구 */
  /* 다시 시도는 도구 찾기 실패와 출처 상태 조회 실패 모두 다시 읽음 */
  const toolReads = perCluster(discoverTools, 10000, inventory => inventory?.access !== 'ok' || inventory?.hub?.status === 'failed' || Object.values(inventory?.hub?.value || {}).some(source => source.state === 'error'));
  const toolsPage = { id: 'tools', label: 'wake.settings.tools', icon: 'server-cog', tabs: [{ id: 'clusters', label: 'wake.s.tools.tab.clusters' }, { id: 'shared', label: 'wake.s.tools.tab.shared' }],
    sections: ctx => {
      const list = clusters({ settings: ctx.settings() }), reads = toolReads(ctx, list.map(c => c.id));
      const st = ctx.settings();
      /* 클러스터마다 따로: 아직 찾는 중이거나 시간 초과인 클러스터는 그 묶음의 도구 찾기 행만 */
      const section = c => { const e = reads.of(c.id), title = raw(clusterPresentation(c).name);
        return e.state === 'ok' ? toolSection(st, c, e.value, title)
          : { title, groups: [...keptGroups(st, c, e.state === 'busy' ? read.unread() : read.failed({ kind: e.state }), read.unread()), [readRow(st, `tools-${c.id}`, e, { icon: 'puzzle', title: 'wake.s.cl.toolsFind' })]] }; };
      return [
        ...list.map((c, i) => ({ tab: 'clusters', ...(i === 0 ? { pending: reads.pending } : {}), ...section(c) })),
        /* 알림(Slack, PagerDuty): 같은 연결 행. 웹후크 주소·API 키는 그 행 안의 값 줄로 받아 키체인에만 */
        { tab: 'shared', title: 'wake.s.tools.notify', groups: [notify().map(n => { const v = connView(ctx.settings(), n.key, { connect: { label: 'wake.flow.connect', action: 'wake.conn.form', arg: n.key }, idleText: 'wake.notify.desc.' + n.id });
          return withForm(ctx.settings(), n.key, { id: n.key, icon: n.icon, title: raw(n.name), description: v.description, connection: connRow(v) }); })] },
      ];
    },
  };

  /* Git 연결: 계정(GitHub 토큰: 바꾸기 제안의 Draft PR이 읽음. 알림과 같은 연결 행, B3-14), 저장소(클러스터마다 GitOps 컨트롤러가 읽는 저장소와 그 Application·Kustomization) */
  const gitPage = { id: 'git', label: 'wake.settings.git', icon: 'git-pull-request', sections: async ctx => {
    const list = clusters({ settings: ctx.settings() });
    const reads = await Promise.all(list.map(c => ctx.data.get('gitops', { cluster: c.id }).catch(() => null)));
    const repos = new Map();
    for (const r of reads.flatMap(g => g?.repos || [])) { const have = repos.get(r.id); if (have) have.apps.push(...r.apps); else repos.set(r.id, { ...r, apps: [...r.apps] }); }
    const key = 'git-github', v = connView(ctx.settings(), key, { connect: { label: 'wake.flow.connect', action: 'wake.conn.form', arg: key }, idleText: 'wake.git.desc' });
    return [
      { title: 'wake.s.git.accounts', groups: [[withForm(ctx.settings(), key, { id: key, icon: 'brand-github', title: raw('GitHub'), description: v.description, connection: connRow(v) })]] },
      ...[...repos.values()].map(r => ({ title: raw(r.name), count: r.apps.length, groups: [r.apps.map(a => ({ id: `ra-${r.id}-${a.cluster}-${a.name}`, icon: a.controller === 'flux' ? 'brand-flux' : 'brand-argo', title: raw(`${a.kind} ${a.name}`),
        description: raw(`${a.path} → ${a.cluster} · ${a.ns}`), trail: 'chevron', action: 'kit.navigate', arg: { address: addr.settings(pageId(a.cluster)) }, wideControl: true,
        control: { type: 'state', kind: ['Synced', 'Ready'].includes(a.sync) ? 'ok' : 'warn', label: raw(a.sync) } }))] })),
    ];
  } };
  return { clustersPage, agentsPage, toolsPage, gitPage, clusters, readRow };
}
