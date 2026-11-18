/*
 * 로그 카드(시뮬레이션 logViewer): 로그 화면과 상세의 로그 탭이 같은 것을 그린다.
 * 도구 줄(Pod 고르기 → 로그 검색(로그 화면은 범위 검색 상자의 글) → 레벨 알약(수), 검색이 있으면 검색 결과 · 앞뒤 줄) → 카드(Pod · 컨테이너 · ERROR · WARN · 마지막 ERROR · 줄)
 * 안의 줄(컨테이너, 시각 · 줄바꿈 · 실시간 스위치, 내려받기, 이전 · 현재 실행, 출처) → kit 로그 보기(원본 줄 번호 그대로 N15) → 범위 줄(20줄씩, 최근 쪽부터).
 * 상태 s: { q, level, only, around, page, ts, wrap, previous, follow }. 동작 이름은 wake.log.*이고 두 화면이 같은 처리를 한다.
 */
import { components as C, html } from '../../../kit/page/index.js';
import { hms } from './incident-parts.js';
import { num } from './parts.js';

const LOG_PER = 20;
const LEVEL = /\b(FATAL|PANIC|ERROR|ERR|WARN(?:ING)?|INFO|DEBUG|TRACE)\b/i;
/** 로그 한 줄: 맨 앞 시각(timestamps=true)과 수준 낱말. 번호는 읽은 순서이고 걸러도 바뀌지 않는다 */
function parseLog(raw, i) {
  const m = /^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s?(.*)$/.exec(raw), at = m ? Date.parse(m[1]) : NaN, body = m ? m[2] : raw;
  const word = LEVEL.exec(body)?.[1]?.toUpperCase(), level = !word ? '' : word.startsWith('WARN') ? 'WARN' : word === 'ERR' ? 'ERROR' : word === 'PANIC' ? 'FATAL' : word;
  const text = word && body.toUpperCase().startsWith(word + ' ') ? body.slice(word.length + 1) : body;
  return { n: i + 1, ms: at, at: Number.isFinite(at) ? hms(at) : '', level, text };
}
export const parseLogs = text => (text ? text.replace(/\n$/, '').split('\n').filter((l, i, a) => l || i < a.length - 1).map(parseLog) : []);
const isError = l => l.level === 'ERROR' || l.level === 'FATAL';
/** 수준 묶음(레벨 알약): FATAL은 ERROR, TRACE는 DEBUG, 수준 낱말 없는 줄은 none. 묶음들의 합이 전체 */
const bucketOf = l => (isError(l) ? 'ERROR' : l.level === 'TRACE' ? 'DEBUG' : l.level || 'none');
const LEVEL_TABS = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'none'];

/** 줄 수 상한에 닿았는가: 백엔드가 구간으로 거르기 전에 받은 줄로 말한 것(limitReached), 그 말이 없는 읽기(구간 없는 글)는 받은 줄 수 */
export const logLimitReached = (meta, lines, tail) => (typeof meta?.limitReached === 'boolean' ? meta.limitReached : lines >= tail);
/** 이전 컨테이너를 읽는가: 사람이 고른 것, 아니면 재시작 반복 중인 컨테이너는 이전 실행(시뮬레이션 logPrev 기본) */
export const previousOf = (s, cur) => s.previous ?? !!(cur?.last && cur?.status?.[0] === 'danger');
/** 보이는 줄: 레벨로 거르고, 검색어가 있으면 일치 줄 표시(검색 결과만이면 앞뒤 줄만 남김), 한 쪽 20줄(page null은 가장 최근 쪽) */
export function logModel(all, s) {
  const q = (s.q || '').trim().toLowerCase(), count = lv => all.filter(l => bucketOf(l) === lv).length;
  const levelled = all.filter(l => s.level === 'all' || bucketOf(l) === s.level);
  const hit = l => (q ? l.text.toLowerCase().includes(q) : isError(l));
  let shown = levelled;
  if (q && s.only) { const keep = new Set(); levelled.forEach((l, i) => { if (hit(l)) for (let k = i - s.around; k <= i + s.around; k++) keep.add(k); }); shown = levelled.filter((_, i) => keep.has(i)); }
  const pages = Math.max(1, Math.ceil(shown.length / LOG_PER)), page = s.page == null ? pages : Math.min(Math.max(1, s.page), pages);
  const end = shown.length - (pages - page) * LOG_PER, start = Math.max(0, end - LOG_PER), slice = shown.slice(start, end);
  /* 쪽은 가장 최근 쪽부터 20줄씩 끝에서 센다: 바닥 범위도 같은 자리(from·to, 1부터)를 말한다(R5-03) */
  return { q, count, levelled, shown, slice, from: start + 1, to: end, page, hits: levelled.filter(hit).length, hit, lastError: [...all].reverse().find(isError), errors: count('ERROR') };
}

/** 카드 위 도구 줄 */
/** levels: Loki가 구간 전체를 센 수준별 수({ all, ERROR, WARN, INFO, DEBUG, unknown }, logs.levels). 없으면 읽은 줄에서 센다.
 *  알약은 전체 · ERROR · WARN · INFO, 그리고 그 줄이 있을 때만 DEBUG · 수준 없음: 묶음 수의 합이 전체와 같다.
 *  counted: false면 수를 비운다(읽기 실패·읽는 중에 0을 만들지 않음, RULE-STATE).
 *  search: false면 검색 칸 없음(로그 화면은 범위 검색 상자의 글이 로그 내용 검색) */
export function logToolbar(t, s, m, all, { scope = '', loki = false, time = '', busy = false, levels = null, search = true, counted = true, partial = false } = {}) {
  const countOf = id => (levels ? levels[id === 'none' ? 'unknown' : id] ?? 0 : id === 'all' ? all.length : m.count(id));
  /* 구간의 일부만 읽었고 수가 읽은 줄에서 왔으면 첫 알약은 "전체"가 아니라 "읽은 줄"(A2-21) */
  const allLabel = partial && !levels ? t('wake.log.loaded') : t('wake.list.all');
  const shown = LEVEL_TABS.filter(id => !['DEBUG', 'none'].includes(id) || s.level === id || counted && countOf(id) > 0);
  return C.listToolbar.render({ ...(scope ? { scope } : {}),
    ...(search ? { search: C.searchInput.render({ placeholder: t(loki ? 'wake.log.serverSearch' : 'wake.rv.searchLogs'), action: 'wake.log.q', value: s.q, width: 'calc(var(--space-40) * 1.5)' }) } : {}),
    filters: html`${C.pillTabs.render({ id: 'wake-log-lv', label: t('wake.rv.level'), value: s.level, action: 'wake.log.level', tabs: [['all', allLabel], ...shown.map(id => [id, id === 'none' ? t('wake.log.noLevel') : id])].map(([id, label]) => ({ id, label, ...(counted ? { count: num(countOf(id)) } : {}) })) })}${m.q ? html`${C.pillTabs.render({ id: 'wake-log-lc', label: t('wake.rv.searchResults'), value: s.only ? 'only' : 'all', action: 'wake.log.only', tabs: [{ id: 'all', label: t('wake.rv.allLines') }, { id: 'only', label: t('wake.rv.onlyResults') }] })}${s.only ? C.select.render({ value: t('wake.rv.aroundN', { n: s.around }), menu: 'wake.log.aroundMenu', label: t('wake.rv.around') }) : ''}` : ''}${loki ? C.button.render({ label: t('wake.log.search'), size: 'sm', variant: 'secondary', action: 'wake.log.searchLoki', disabled: busy }) : ''}`,
    ...(time ? { time } : {}) });
}

/** 카드: pod(행), container(이름), body(로그가 없을 때의 줄), o: { containers, cur(지금 컨테이너 행), loki, sources(출처 고르기 보임), partial } */
export function logCard(t, s, m, pod, container, o = {}) {
  const crash = !!o.cur?.last, cs = o.containers || [], prev = previousOf(s, o.cur);
  const tools = C.listToolbar.render({
    ...(cs.length > 1 ? { scope: C.pillTabs.render({ id: 'wake-log-c', label: t('wake.res.container'), value: container, action: 'wake.log.container', tabs: cs.map(x => ({ id: x.name, label: x.name })) }) } : {}),
    filters: html`${C.toggle.render({ on: s.ts, action: 'wake.log.ts', text: t('wake.rv.time') })}${C.toggle.render({ on: s.wrap, action: 'wake.log.wrap', text: t('wake.rv.wrap') })}${prev ? '' : C.toggle.render({ on: s.follow, action: 'wake.log.follow', text: t('log.live') })}`,
    view: html`${C.button.render({ label: t('wake.rv.download'), icon: 'download', variant: 'ghost', size: 'sm', round: true, action: 'wake.log.download', disabled: !m.levelled.length })}${crash ? C.pillTabs.render({ id: 'wake-log-pv', label: t('wake.res.container'), value: prev ? 'prev' : 'cur', action: 'wake.log.instance', tabs: [{ id: 'prev', label: t('wake.rv.prevRun', { last: o.cur.last, exit: o.cur.lastExitCode ?? '' }) }, { id: 'cur', label: t('wake.rv.curRun', { n: num(o.cur.restarts ?? 0) }) }] }) : ''}${o.sources && !prev ? C.select.render({ value: o.loki ? 'Loki' : 'Kubernetes', menu: 'wake.log.sources', label: t('wake.log.source') }) : ''}` });
  const counted = o.body === undefined; /* 읽은 줄이 없으면(실패·읽는 중) 수 칸을 두지 않는다: 0을 만들지 않음 */
  const items = [{ id: 't', label: '', value: pod.name, shrink: true }, { id: 'c', label: t('wake.res.container'), value: crash ? `${container} · ${prev ? 'previous' : t('wake.rv.current')}` : container, priority: 1 }, ...(!counted ? [] : [
    { id: 'h', label: m.q ? t('wake.rv.match') : 'ERROR', value: num(m.hits), priority: 5, ...(!m.q && m.hits ? { tone: 'danger' } : {}) }, ...(m.q ? [] : [{ id: 'wn', label: 'WARN', value: num(m.count('WARN')), priority: 2 }]),
    ...(m.lastError?.at ? [{ id: 'le', label: t('wake.rv.lastError'), value: m.lastError.at, priority: 4 }] : []), { id: 'n', label: t('wake.rv.lines'), value: num(m.levelled.length), priority: 3 }])];
  const view = o.body ?? (m.slice.length ? html`${C.logView.render({ lines: m.slice.map(({ n, at, level, text }) => ({ n, at, level, text })), ...(m.q ? { query: s.q.trim() } : { hits: m.slice.filter(m.hit).map(l => l.n) }), gaps: !!(m.q && s.only), times: s.ts, wrap: s.wrap, labels: { skipped: t('wake.rv.skipped') } })}${C.pager.range({ page: m.page, per: LOG_PER, total: m.shown.length, action: 'wake.log.page', labels: { range: t(o.partial ? 'wake.rv.logRangeRead' : 'wake.rv.logRange', { from: num(m.from), to: num(m.to), total: num(m.shown.length) }) } }) /* 부분 조회면 "전체"가 아니라 읽은 줄(A3-06). 범위는 보이는 줄(끝에서 센 쪽) */}`
    : C.emptyState.render({ title: t(o.empty || (m.q ? 'wake.overview.noMatches' : 'wake.rv.noLogs')), variant: 'line' }));
  return C.summaryBar.render({ label: pod.name, open: true, items, body: html`${tools}${o.partial ? C.statusIcon.render({ kind: 'warn', text: o.tail ? t('wake.log.tailOnly', { n: num(o.tail) }) : t('wake.log.partial') }) : ''}${view}` });
}

/** 공통 동작(두 화면): get()은 상태, set(patch, reload)는 상태를 바꾸고 다시 읽을지 정한다 */
export function logActions(get, set, { download }) {
  const pick = a => String(a.arg?.value ?? a.arg ?? '');
  return {
    'wake.log.q': a => set({ q: a.value || '', page: null }),
    'wake.log.level': a => set({ level: pick(a), page: null }),
    'wake.log.only': a => set({ only: pick(a) === 'only', page: null }),
    'wake.log.around': a => set({ around: Number(pick(a)), page: null }),
    'wake.log.page': a => set({ page: Number(pick(a)) }),
    'wake.log.ts': a => set({ ts: a.on ?? !get().ts }),
    'wake.log.wrap': a => set({ wrap: a.on ?? !get().wrap }),
    'wake.log.follow': a => set({ follow: a.on ?? !get().follow }, 'follow'),
    'wake.log.instance': a => set({ previous: pick(a) === 'prev', follow: false, page: null, ...(pick(a) === 'prev' ? { source: 'kubernetes', search: '' } : {}) }, 'read'),
    'wake.log.container': a => set({ container: pick(a), previous: null, page: null }, 'read'),
    'wake.log.source': a => { const v = pick(a); if (!['kubernetes', 'loki'].includes(v) || get().previous && v === 'loki') return; set({ source: v, search: '', q: '', follow: false }, 'read'); },
    'wake.log.searchLoki': () => { if (get().source === 'loki') set({ search: get().q.trim().slice(0, 256) }, 'read'); },
    'wake.log.download': () => download(),
  };
}
export const logMenus = (t, get) => ({
  'wake.log.aroundMenu': () => C.select.menuDef({ key: 'around', value: String(get().around), action: 'wake.log.around', options: [0, 2, 5].map(n => ({ id: String(n), label: { raw: n ? t('wake.rv.aroundN', { n }) : t('wake.rv.matchOnly') } })) }),
  'wake.log.sources': () => C.select.menuDef({ options: [{ id: 'kubernetes', label: { raw: 'Kubernetes' } }, { id: 'loki', label: { raw: 'Loki' } }], value: get().source, action: 'wake.log.source' }),
});
/** 읽은 줄을 파일로 내려받기 */
export function downloadText(name, text) {
  const doc = globalThis.document; if (!doc) return;
  const a = doc.createElement('a'); a.href = URL.createObjectURL(new Blob([text || ''], { type: 'text/plain' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
