/*
 * 도구 상세 칸(시뮬레이션 toolDetail()): 주소 cluster/:cluster/tools/:tool(도구 종류).
 * 머리(상표 · 이름 · 상태 · 도구 · 클러스터 · 머리 끝 연결 확인/다시 시도/연결) → 도구 카드(역할 · 버전 · 지연 · 마지막 성공, 상태 · 주소)
 * → 응답 지연(지난 6시간, 연결 확인 기록이 있을 때) → 최근 오류(24시간, 연결 확인 기록 또는 연결 흐름의 실패 원문).
 */
import config from '../app.config.js';
import { bootPage, components as C, html, text, liveInterval } from '../../../kit/page/index.js';
import { when, hms } from './incident-parts.js';
import { clusterNameOf, readRow } from './view-parts.js';
import { viewRow, stateMark, stateWords, latencyChart, latencyText, offCard, toolAction, blockedText, lastSuccess } from './setup-parts.js';
import { toolViews, readOf, read, rememberFound } from '../data/conn-view.js';
import { TOOL_KINDS, toolKind } from '../data/tool-kinds.js';
import { DAY } from '../data/home.js';
import { compareHistory } from '../data/table-order.js';
import { num } from './parts.js';

bootPage(config, ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  let inventory = read.unread(), hub = read.unread(), kinds = TOOL_KINDS, checks = null, checksFailure = null, phase = 'loading';
  const folded = {};
  async function load(refresh = false) {
    phase = 'loading'; ctx.update();
    const hubRead = readOf(data.get('sourceStates', { cluster: id, refresh })).then(r => { hub = r; ctx.update(); });
    inventory = await readOf(data.get('clusterTools', { cluster: id, discovery: {}, refresh }));
    rememberFound(ctx.settings, ctx.api?.setSetting, id, inventory); /* 열거가 오면 찾기 확인 근거(wake.tools.found)에 반영: 열거를 못 읽는 동안에도 확인한 도구가 남음 */
    kinds = await data.get('toolKinds').catch(() => TOOL_KINDS) || TOOL_KINDS; // 이름·아이콘 표(상태 판단 아님)
    checks = await data.get('toolChecks', { cluster: id, kind: params.tool }).then(v => { checksFailure = null; return v; }, e => { checksFailure = e; return null; });
    if (refresh) await hubRead;
    if (checks?.state && hub.status === 'ok') hub = read.ok({ ...hub.value, [params.tool]: checks.state });
    /* 열거에 없어도 연결 기록이 있으면 그 도구(상태는 확인 불가), 둘 다 없으면 열거 실패면 실패, 아니면 없음 */
    phase = view() ? 'ready' : inventory.status === 'failed' ? (inventory.error?.status === 403 ? 'forbidden' : 'error') : 'missing';
    ctx.update();
  }
  /* 열어 둔 상세도 살아 있는 화면과 같은 박자(live 여섯 번, 리소스 상세의 follow와 같음)로 확인 기록과 허브 상태를 다시 읽음: 읽는 동안 "확인 중"으로 돌아가지 않고
     답이 오면 머리(지연 · 마지막 성공)와 차트가 그 답으로(R4-12). 숨은 문서에서는 쉬고, 다시 보이면 다음 박자에 */
  let refreshing = false;
  async function refresh() {
    if (refreshing || phase !== 'ready' || globalThis.document?.hidden) return;
    refreshing = true;
    try {
      const [states, next] = await Promise.all([readOf(data.get('sourceStates', { cluster: id })), data.get('toolChecks', { cluster: id, kind: params.tool }).catch(() => null)]);
      if (states.status === 'ok') hub = states;
      if (next) { checks = next; checksFailure = null; if (checks.state && hub.status === 'ok') hub = read.ok({ ...hub.value, [params.tool]: checks.state }); }
      ctx.update();
    } finally { refreshing = false; }
  }
  const every = liveInterval();
  const timer = every ? setInterval(() => void refresh(), every * 6) : null;
  if (timer) globalThis.addEventListener?.('pagehide', () => clearInterval(timer), { once: true });
  /* 상태는 도구 목록·홈 칩·설정과 같은 판단 함수 하나(toolViews) */
  const view = () => toolViews({ cluster: id, settings: ctx.settings(), inventory, hub }).included.find(v => v.kind === params.tool);
  const tool = () => { const v = view(); return v && viewRow(t, v, kinds, ctx.settings()['wake.conn.live'] || {}, id); };
  const end = () => Date.parse(checks?.at ?? '') || Date.now();
  const card = (key, label, items, body, open = true) => C.summaryBar.render({ label, open: key in folded ? !folded[key] : open, /* folded: 사람이 접은 카드(true)·편 카드(false) */ toggle: { action: 'wake.td.fold', arg: key }, items: [{ id: 't', label: '', value: label }, ...items], body });
  function head() {
    const x = phase === 'ready' ? tool() : null, context = [t('wake.home.tools'), clusterNameOf(ctx, id)].join(' · ');
    if (!x) return C.pageHeader.render({ icon: 'plug', title: toolKind(params.tool).name, size: 'sm', context }); // 읽는 동안·없을 때도 도구 이름(주소의 id가 아님)
    /* 머리 끝 동작 하나(도구 화면 행과 같은 판단 toolAction): 연결됨·제한은 열기, 연결 안 됨은 설정 › 도구, 그 밖은 다시 시도(확인 중에는 없음) */
    const a = x.state === 'error' ? { label: 'wake.flow.a.retry', action: 'wake.td.retry' } : x.state === 'busy' ? null : toolAction(x.state, { cluster: id, tool: x.raw }, null, x.listed);
    const act = a?.action ? C.button.render({ label: text(a.label), icon: a.icon, variant: 'secondary', size: 'sm', round: true, action: a.action, arg: a.arg }) : '';
    return C.pageHeader.render({ icon: x.icon, title: x.name, size: 'sm', after: stateMark(t, x.state), context, end: act });
  }
  function body(x) {
    const samples = checks?.samples ?? [], answered = samples.filter(s => s.ms != null), latest = samples.at(-1), up = x.state === 'ok' || x.state === 'limited';
    const lat = latest?.ms != null ? latencyText(latest.ms) : samples.length ? t('wake.tool.noResponse') : '';
    /* 마지막 성공: 확인 기록과 도구 목록이 쓰는 허브 마지막 성공 중 늦은 것(두 화면이 다른 시각을 말하지 않게) */
    const lastOk = lastSuccess(x, samples);
    const summary = card('sum', x.name, [...(x.role ? [{ id: 'r', label: t('wake.tool.role'), value: x.role }] : []), ...(x.version ? [{ id: 'v', label: t('wake.tool.version'), value: x.version }] : []),
      ...(lat ? [{ id: 'l', label: t('wake.tool.latency'), value: lat }] : []), ...(lastOk ? [{ id: 's', label: t('wake.tool.lastOk'), value: when(lastOk, end()) }] : [])],
      C.propertyGrid.render({ items: [{ id: 'd', label: t('wake.tool.state'), value: x.blocked ? html`${stateWords(t, x.state)} ${blockedText(t, x.blocked)}` : stateWords(t, x.state) }, ...(x.where ? [{ id: 'a', label: t('wake.tool.address'), value: C.value.render({ text: x.where, mono: true }) }] : [])] }));
    const chart = answered.length ? card('lat', t('wake.tool.latencyChart'), [{ id: 'v', label: '', value: up && latest?.ms != null ? latencyText(latest.ms) : t('wake.tool.noResponse') }],
      latencyChart(t, { id: `tool:${x.id}`, title: t('wake.tool.latencyChart'), samples, end: end() }))
      : checksFailure?.kind === 'unconfigured' ? offCard(card, 'lat', t('wake.tool.latencyChart'), checksFailure.source) : '';
    /* 최근 오류: 연결 확인 기록(24시간), 없으면 연결 흐름이 남긴 실패(원인과 원문) */
    const flowFail = x.live && ['failed', 'timeout', 'needs-perm', 'needs-login'].includes(x.live.state) ? [{ at: Date.parse(x.live.last ?? '') || null, text: x.live.raw || text(x.live.cause || '') }] : [];
    const errs = [...(checks?.errors ?? []).filter(e => e.at > end() - DAY), ...flowFail].filter(e => e.text)
      .map(e => ({ ...e, id: e.id ?? JSON.stringify([e.at, e.text]) })).sort(compareHistory);
    const errors = checksFailure ? card('err', t('wake.tool.recentErrors'), [], readRow(t, checksFailure.status === 403 || checksFailure.kind === 'forbidden' ? 'forbidden' : 'error', 'wake.td.retry')) : card('err', t('wake.tool.recentErrors'), [{ id: 'n', label: t('wake.tool.h24'), value: num(errs.length) }],
      errs.length ? C.dataTable.render({ clip: true, rowKey: 'id', rows: errs, reveal: true, columns: [
        { id: 'at', label: t('wake.inc.record.time'), time: true, width: 'calc(var(--space-16) * 1.4)', cell: e => (e.at ? hms(e.at) : '') },
        { id: 'text', label: t('wake.tool.error'), mono: true }] }) : C.emptyState.render({ title: t('wake.tool.noErrors'), variant: 'line' }), !!errs.length);
    return html`${summary}${chart}${errors}`;
  }
  /* 근거로 남은 도구(ready)라도 지금 열거를 읽지 못했으면 그 실패와 다시 시도(실제로 다시 읽음)를 본문 위에. 건강은 허브 값 그대로 */
  const inventoryFailure = () => (inventory.status === 'failed' ? readRow(t, inventory.error?.status === 403 ? 'forbidden' : 'error', 'wake.td.retry') : '');
  const content = () => (phase === 'ready' ? html`${inventoryFailure()}${body(tool())}` : phase === 'missing' ? C.emptyState.render({ icon: 'plug', plainIcon: true, title: t('wake.tool.gone') }) : readRow(t, phase, 'wake.td.retry'));
  void load();
  return {
    render: () => html`${C.pageColumn.render({ width: 'list', header: true, children: head() })}${C.pageColumn.render({ width: 'list', children: content(), scroll: true })}`,
    meta: () => { const x = phase === 'ready' ? tool() : null, name = x?.name ?? toolKind(params.tool).name; return { title: name, icon: x?.icon ?? 'plug', context: { icon: 'plug', title: name, sub: clusterNameOf(ctx, id) } }; },
    afterRender: root => { root.dataset.wakeView = 'detail'; },
    actions: {
      'wake.td.retry': () => load(true),
      'wake.td.fold': a => { folded[a.arg] = !a.open; },
    },
  };
}, { scroll: false });
