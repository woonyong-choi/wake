/*
 * 로그 화면(시뮬레이션 logsPage()): 머리(로그 · 출처 · 클러스터) → 범위 검색 상자(로그 내용 · 종류 · namespace · 구간) → 도구 줄(Pod 고르기 → 레벨 알약(수), 검색 결과 · 앞뒤 줄)
 * → 로그 카드(log-card.js, 상세의 로그 탭과 같음). Pod 고르기는 범위의 Pod(종류면 그 객체가 소유한 Pod, data/scope.js), 처음 Pod는 문제 있는 Pod, 없으면 첫 Pod.
 * 로그는 Kubernetes API(pods/log, 구간과 Pod UID로 읽음) 또는 연결된 Loki에서 읽는다.
 */
import { createReadGuard } from '../data/read-state.js';
import config from '../app.config.js';
import { bootPage, components as C, html, hasService, createLivePoll } from '../../../kit/page/index.js';
import { parseLogs, logModel, logToolbar, logCard, logActions, logMenus, downloadText, previousOf, logLimitReached } from './log-card.js';
import { clusterNameOf, readRow, readFailure, sectionTabs, SCOPE_W } from './view-parts.js';
import { scopeBox } from './scope-box.js';
import { isProblem } from '../data/kinds.js';
import { windowOf, DAY } from '../data/home.js';

const LOG_ROW_LIMIT = 1000;
const FOLLOW_MS = 3000;

bootPage(config, ctx => {
  const { t, params, data } = ctx, id = params.cluster;
  let pods = [], phase = 'loading', text = null, meta = null, levels = null, read = 'ready', failure = null, request = 0, disposed = false, controller, poll = null;
  /* 글을 실행하면 그 글로 줄을 찾고(Loki면 늘 상자의 글이 서버 검색: 출처를 바꿔도 글이 적용된다, C-25), 종류·namespace가 바뀌면 고른 Pod를 놓고 범위의 Pod에서 다시 고른다 */
  const box = scopeBox(ctx, id, 'logs', { onRun: patch => {
    if ('q' in patch) { ctx.setState({ page: null }); if (st().source === 'loki') void loadLogs(); return; }
    ctx.setState({ logPod: null, container: '', previous: null, page: null }); follow(); void box.loaded().then(() => loadLogs()); }, alive: () => !disposed });
  /* 로그 카드가 읽는 상태: 검색어(q)는 범위 검색 상자의 글 */
  const st = () => ({ ...ctx.state(), q: box.text() });
  const inScope = () => { const r = box.relation(); return pods.filter(p => (r.kinds ? r.pod(p) : r.inNs(p.ns))); };
  const podOf = () => { const key = st().logPod, list = inScope(); return (key && list.find(p => `${p.ns}/${p.name}` === key)) || list.find(isProblem) || list[0] || null; };
  /* 고른 컨테이너와 이전 실행을 읽는지(재시작 반복이면 처음엔 이전 실행) */
  const containerOf = p => { const cs = p?.containerList || []; return cs.find(c => c.name === st().container) || cs[0]; };
  const prevOf = p => previousOf(st(), containerOf(p));
  const now = () => (ctx.query.at !== undefined ? Date.parse(ctx.query.at) : Date.now());
  const beginPods = createReadGuard();
  async function loadPods() {
    const current = beginPods();
    try {
      const value = await data.get('resources', { cluster: id, ns: '_all', kind: 'pods', at: ctx.query.at });
      if (!current() || disposed) return;
      pods = value || []; phase = 'ready';
    } catch (e) {
      if (!current() || disposed) return;
      phase = 'error'; failure = e;
    }
    ctx.update(); void loadLogs();
  }
  async function loadLogs({ background = false } = {}) {
    const p = podOf(), s = st();
    if (disposed || !p) return;
    controller?.abort(); controller = new AbortController();
    const seq = ++request, container = s.container || p.containerList?.[0]?.name, uid = p.raw?.metadata?.uid || p.uid, { from, to } = windowOf(s.range, now());
    if (!background) { read = 'loading'; text = null; ctx.update(); }
    /* Loki: 구간 전체의 수준별 수(허브 logs.levels). 못 읽으면 읽은 줄에서 센다 */
    if (s.source === 'loki') void data.get('logLevels', { cluster: id, ns: p.ns, pod: p.name, container, from, to: Math.min(to, Date.now()) })
      .then(v => { if (seq === request && !disposed) { levels = v.counts; ctx.update(); } }, () => { if (seq === request && !disposed) levels = null; });
    else levels = null;
    try {
      const tail = s.source === 'loki' ? 100 : LOG_ROW_LIMIT;
      const result = await data.get('logs', { cluster: id, ns: p.ns, pod: p.name, container, previous: prevOf(p), uid, tail, window: { fromMs: from, toMs: Math.min(to, Date.now()) }, source: s.source, ...(s.source === 'loki' ? { search: s.q.trim().slice(0, 256) } : {}) }, { signal: controller.signal });
      if (disposed || seq !== request) return;
      const snapshot = typeof result === 'string' ? { text: result } : result, { text: body, ...rest } = snapshot || {};
      if (typeof body !== 'string') throw new Error('invalid log snapshot');
      const rows = body ? body.split('\n') : [];
      /* 줄 수 상한(tail)까지 받았으면 구간의 앞부분은 읽지 않은 것: 수는 읽은 줄의 수(A2-21). 상한에 닿았는지는 거르기 전 받은 줄(limitReached, R5-02) */
      const limit = logLimitReached(rest, rows.length, tail);
      text = rows.slice(-LOG_ROW_LIMIT).join('\n'); meta = { ...rest, partial: rest.partial || limit, tail: limit ? Math.min(tail, rows.length, LOG_ROW_LIMIT) : null }; read = 'ready';
    } catch (e) {
      if (disposed || seq !== request || e?.name === 'AbortError') return;
      read = e?.kind === 'unconfigured' ? 'lokiUnavailable' : (Number(e?.status) === 403 || e?.kind === 'forbidden') ? 'forbidden' : 'error'; failure = e;
      ctx.update();
      /* 따라가기의 실패는 갱신 간격을 늘린다(createLivePoll) */
      if (background) throw e;
      return;
    }
    ctx.update();
  }
  /* 따라가기: 읽는 중에는 다음 읽기를 쌓지 않고, 숨은 문서는 읽지 않으며, 실패하면 물러난다(createLivePoll) */
  const follow = () => { poll?.stop(); poll = st().follow && !prevOf(podOf()) ? createLivePoll({ every: FOLLOW_MS, read: () => (read !== 'loading' ? loadLogs({ background: true }) : undefined) }) : null; poll?.start(); };
  globalThis.addEventListener?.('pagehide', () => { disposed = true; ++request; controller?.abort(); poll?.stop(); }, { once: true });

  const range = () => C.timeRange.render({ id: 'logs-range', value: st().range, action: 'kit.screen.range', fallback: '1h', retention: 14 * DAY / 1000, now: Math.floor(now() / 1000), label: t('wake.view.range') });
  /* 실패 줄: 오류면 원인까지(RULE-STATE) */
  const failed = state => readRow(t, state, 'wake.logs.retry', ...(state === 'error' ? [readFailure(t, failure)] : []));
  function body() {
    const s = st(), p = podOf(), loki = s.source === 'loki';
    const head = html`${C.pageHeader.render({ icon: 'terminal', title: t('wake.view.logs'), sub: [loki ? 'Loki' : 'Kubernetes API', clusterNameOf(ctx, id)], size: 'home', end: sectionTabs(t, 'logs') })}${box.render({ range: range() })}`;
    if (phase !== 'ready' || box.wait()) return html`${head}${failed(phase === 'error' ? 'error' : 'loading')}`;
    /* 범위(종류가 소유한 Pod)를 읽지 못하면 빈 범위 대신 그 실패와 원인 */
    if (box.failure()) return html`${head}${readRow(t, 'error', 'wake.logs.retry', readFailure(t, box.failure()))}`;
    if (!p) return html`${head}${C.emptyState.render({ icon: 'k8s-pod', plainIcon: true, title: t(pods.length ? 'wake.scope.noPod' : 'wake.res.noPods') })}`;
    const all = read === 'ready' && text != null ? parseLogs(text) : [], m = logModel(all, s), cs = p.containerList || [], c = s.container || cs[0]?.name;
    const scope = C.select.render({ value: p.name, icon: 'k8s-pod', menu: 'wake.logs.podMenu', label: 'Pod', width: SCOPE_W });
    const notRun = /Pending|ContainerCreating|ImagePull/.test(p.status?.[1] || '');
    const partial = read === 'ready' && meta?.partial;
    return html`${head}${logToolbar(t, s, m, all, { scope, loki, search: false, busy: read === 'loading', levels: loki ? levels : null, counted: read === 'ready', partial })}
      ${logCard(t, s, m, p, c, { containers: cs, cur: cs.find(x => x.name === c), loki, sources: hasService(), partial: meta?.partial, tail: meta?.tail, body: read === 'ready' ? undefined : failed(read), empty: notRun ? 'wake.rv.notStarted' : undefined })}`;
  }
  let started = false, lastWindow = null;
  return {
    screen: { state: { logPod: null, level: 'all', only: false, around: 2, page: null, ts: true, wrap: true, previous: null, follow: false, source: 'kubernetes', search: '', container: '', range: { preset: '1h' } },
      ai: ['logPod', 'previous', 'level', 'only', 'around', 'page', 'range'], range: { key: 'range', retention: 14 * DAY / 1000 } },
    init: () => { if (started) return; started = true; void box.init().then(() => { if (phase === 'ready') void loadLogs(); }); void loadPods(); },
    render: () => { const key = JSON.stringify(st().range); if (lastWindow !== null && key !== lastWindow) void loadLogs(); lastWindow = key; return C.pageColumn.render({ width: 'home', children: body() }); },
    afterRender: root => { root.dataset.wakeView = 'logs'; },
    meta: () => ({ title: t('wake.view.logs'), icon: 'terminal' }),
    onSettings: () => ctx.update(),
    menus: {
      ...logMenus(t, st),
      ...box.menus,
      'wake.logs.podMenu': () => { const list = [...inScope().filter(isProblem), ...inScope().filter(p => !isProblem(p))].slice(0, 80), cur = podOf();
        return C.select.menuDef({ key: 'pod', value: cur ? `${cur.ns}/${cur.name}` : '', action: 'wake.logs.pod', options: list.map(p => ({ id: `${p.ns}/${p.name}`, icon: 'k8s-pod', label: { raw: `${p.name} · ${p.status?.[1] ?? ''}` } })) }); },
    },
    actions: {
      ...box.actions,
      ...logActions(st, (patch, after) => { ctx.setState(patch); if (after === 'read') { follow(); void loadLogs(); } else if (after === 'follow') follow(); },
        { download: () => { const p = podOf(); downloadText(`${p?.name || 'pod'}${st().container ? '-' + st().container : ''}${prevOf(p) ? '.previous' : ''}.log`, text); } }),
      'wake.logs.pod': a => { ctx.setState({ logPod: String(a.arg?.value ?? a.arg), container: '', previous: null, page: null }); follow(); void loadLogs(); },
      'wake.logs.retry': () => (box.failure() ? Promise.resolve(box.retry()).then(() => ctx.update()) : phase === 'ready' ? loadLogs() : loadPods()),
    },
  };
});
