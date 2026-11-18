/*
 * 설정 › 도구(시뮬레이션 toolsPage()): 머리(도구 · Wake 연결 확인 · 클러스터 | 클러스터 전체 검색) → 검색 결과 → 상태별 수(연결됨 · 제한 · 권한 필요 · 연결 안 됨 · 끊김)
 * → 도구 묶음(연결 행: 상표 · 이름 · 역할 · 주소 · 버전 · 마지막 확인, 상태가 부르는 동작 하나, 상태). 행을 누르면 도구 상세 칸(tool-detail.js).
 * 도구 목록은 연결한 도구만(도구 상태 판단 하나 conn-view toolViews: 열거·허브 읽기 결과와 연결 근거), 상태는 홈 칩·도구 메뉴·상세·설정 › 도구와 같은 health.
 * 홈의 도구 칩은 ?tool=<종류>로 들어와 그 도구의 상세 칸을 연다.
 */
import config from '../app.config.js';
import { bootPage, components as C, html, liveInterval } from '../../../kit/page/index.js';
import { clusterSearch } from './cluster-search.js';
import { clusterNameOf, readRow } from './view-parts.js';
import { viewRow, toolLine, toolAction, lastSuccess, STATES, STATE_KIND } from './setup-parts.js';
import { num } from './parts.js';
import { toolViews, readOf, read, rememberFound } from '../data/conn-view.js';
import { TOOL_KINDS } from '../data/tool-kinds.js';

bootPage(config, ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  /* 열거·허브 읽기 결과(아직 · 실패 · 값)를 그대로 판단 함수에 넘김(거절을 빈 값으로 바꾸지 않음) */
  let inventory = read.unread(), hub = read.unread(), kinds = TOOL_KINDS, active = null, started = false, checked = {};
  const search = clusterSearch(ctx, id);
  async function load(refresh = false) {
    inventory = read.unread(); hub = read.unread(); ctx.update();
    /* 셋은 서로 기다리지 않음: 열거가 오면 줄을 그리고 허브 상태는 오는 대로(그 전에는 확인 중) */
    const hubRead = readOf(data.get('sourceStates', { cluster: id, refresh })).then(r => { hub = r; ctx.update(); });
    kinds = await data.get('toolKinds').catch(() => TOOL_KINDS) || TOOL_KINDS; // 이름·아이콘 표(상태 판단 아님)
    inventory = await readOf(data.get('clusterTools', { cluster: id, discovery: {}, refresh })); rememberFound(ctx.settings, ctx.api?.setSetting, id, inventory); ctx.update(); /* 열거가 오면 찾기 확인 근거(wake.tools.found)에 반영: 열거를 못 읽는 동안에도 확인한 도구가 남음 */
    void hubRead.then(() => lastChecks());
    return Promise.race([hubRead, Promise.resolve()]);
  }
  /* "확인" 시각은 상세 칸의 마지막 성공과 같은 것(setup-parts lastSuccess: 그 도구의 확인 기록 마지막 응답과 허브 지난 성공 중 늦은 것, B-20·R5-04).
     확인 기록은 도구마다 읽고, again이면 이미 읽은 도구도 다시 읽는다(읽는 동안 앞 값을 둠) */
  async function lastChecks(again = false) {
    const want = set().included.filter(v => again || !(v.kind in checked)).map(v => v.kind);
    await Promise.all(want.map(async kind => {
      checked[kind] ??= null;
      const c = await data.get('toolChecks', { cluster: id, kind }).catch(() => null);
      if (c?.samples) checked[kind] = c.samples;
    }));
    if (want.length) ctx.update();
  }
  /* 상세 칸과 같은 박자(live 여섯 번)로 허브 상태와 확인 기록을 다시 읽음: 읽는 동안 "확인 중"으로 돌아가지 않음. 숨은 문서에서는 쉼 */
  let refreshing = false;
  async function refresh() {
    if (refreshing || inventory.status !== 'ok' || globalThis.document?.hidden) return;
    refreshing = true;
    try {
      const states = await readOf(data.get('sourceStates', { cluster: id }));
      if (states.status === 'ok') hub = states;
      await lastChecks(true);
      ctx.update();
    } finally { refreshing = false; }
  }
  const every = liveInterval();
  const timer = every ? setInterval(() => void refresh(), every * 6) : null;
  if (timer) globalThis.addEventListener?.('pagehide', () => clearInterval(timer), { once: true });
  const set = () => toolViews({ cluster: id, settings: ctx.settings(), inventory, hub });
  /* 이 화면은 연결한 도구만(연결은 설정 › 도구) */
  const rows = () => set().included.map(v => (x => ({ ...x, last: lastSuccess(x, checked[v.kind]) ?? x.last }))(viewRow(t, v, kinds, ctx.settings()['wake.conn.live'] || {}, id)));
  const failure = () => inventory.status === 'failed' ? readRow(t, inventory.error?.status === 403 ? 'forbidden' : 'error', 'wake.tools.retry') : '';
  function body() {
    const head = C.pageHeader.render({ icon: 'plug', title: t('wake.home.tools'), sub: [t('wake.tool.source'), clusterNameOf(ctx, id)], size: 'home', end: search.field() });
    if (inventory.status === 'unread') return html`${head}${search.results()}${readRow(t, 'loading', 'wake.tools.retry')}`;
    const list = rows();
    const summary = list.length ? C.summaryBar.render({ label: t('wake.home.tools'), items: STATES.filter(k => list.some(x => x.state === k)).map(k => ({ id: k, label: t(`source.${k}`), value: num(list.filter(x => x.state === k).length), ...(k === 'error' ? { tone: 'danger' } : k === 'ok' || k === 'idle' ? {} : { tone: 'warn' }) })) }) : '';
    const group = list.length ? C.settingsGroup.render({ children: list.map(x => C.connectionRow.render({ id: x.id, brand: x.icon, title: x.name, description: toolLine(t, x), state: x.state === 'ok' ? undefined : t(`source.${x.state}`), statusLabel: t(`source.${x.state}`),
      kind: STATE_KIND[x.state], attention: active === x.id, rowAction: 'wake.tools.open', rowArg: x.id,
      action: x.state === 'error' ? { label: 'wake.flow.a.retry', action: 'wake.tools.retry' } : toolAction(x.state, { cluster: id, tool: x.raw }, { action: 'wake.tools.open', arg: x.id }, x.listed) })) }) /* 연결 행 단추 글은 키(행이 읽음) */
      : inventory.status === 'failed' ? '' : C.emptyState.render({ title: t('wake.s.cl.toolsNone'), variant: 'line' });
    /* 열거 실패는 0개가 아님: 실패와 다시 시도(연결 기록이 있는 도구 줄은 남음) */
    return html`${head}${search.results()}${summary}${C.settingsSection.render({ title: t('wake.home.tools'), children: html`${group}${failure()}` })}`;
  }
  function open(kind) { active = kind; ctx.update(); ctx.api.navigate(`wake://cluster/${encodeURIComponent(id)}/tools/${encodeURIComponent(kind)}`, { presentation: 'detail' }); }
  return {
    screen: { state: { q: '' }, ai: [], search: { key: 'q', scope: 'cluster' } },
    init: () => { if (started) return; started = true; void load().then(() => { const want = ctx.query?.tool; if (want && set().included.some(v => v.kind === want)) open(want); }); },
    render: () => C.pageColumn.render({ width: 'home', children: body() }),
    afterRender: root => { root.dataset.wakeView = 'tools'; },
    onDetail: p => { if (p.state !== 'open' && active != null) { active = null; ctx.update(); } },
    meta: () => ({ title: t('wake.home.tools'), icon: 'plug' }),
    actions: {
      ...search.actions,
      'wake.tools.retry': () => { checked = {}; return load(true); },
      'wake.tools.open': a => open(String(a.arg)),
    },
  };
});
