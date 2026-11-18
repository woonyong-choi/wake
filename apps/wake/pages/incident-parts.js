import { compareHistory, compareIncidents } from '../data/table-order.js';
/*
 * 인시던트 화면 조각(작업면, 근거, 목록이 같이 씀): 시각과 걸린 시간 글, 원인 등급과 조치 근거 표시, 결과 코드의 상태 표시,
 * 인시던트 목록(열린 것 + 과거 표). 색은 결과 코드로만 정한다: 서비스 복구만 정상(초록), 완화·우회·증상 회복·재개는 경고(recoveryTone, N13).
 */
import { components as C, html } from '../../../kit/page/index.js';
import { recoveryTone, RECOVERY_KINDS } from '../data/incident-model.js';
import { localTime, num } from './parts.js';
import { sourceParts, resultOf } from '../data/audit.js';

/* 시각: 같은 날이면 HH:mm(:ss), 아니면 날짜까지(연도 없는 날짜 없음) */
export const hm = ms => localTime(ms)?.slice(11, 16) ?? '';
export const hms = ms => localTime(ms)?.slice(11, 19) ?? '';
export const ymd = ms => localTime(ms)?.slice(0, 10) ?? '';

/* 근거 이름표(번호 대신): '<종류> · <대상> · <시각 또는 값>'. 같은 근거는 같은 이름표, 툴팁은 발췌 원문.
   로그는 첫 걸린 줄 시각, 이벤트는 첫 사유, 지표는 마지막 값, 객체는 대상 종류 */
export function evidenceTag(t, e) {
  if (!e) return null;
  const kind = t(`wake.ev.tag.${['logs', 'events', 'metric'].includes(e.kind) ? e.kind : 'object'}`), name = e.target?.name ?? '';
  const hit = e.kind === 'logs' ? (e.hits?.[0] != null ? e.result?.lines?.[e.hits[0]] : e.result?.lines?.[0]) : null;
  const row = e.kind === 'events' ? e.result?.rows?.[0] : null, s = e.kind === 'metric' ? e.result?.series?.[0] : null, last = s?.samples?.at(-1);
  const third = e.kind === 'logs' ? hms(hit?.at ?? e.window?.to) : e.kind === 'events' ? row?.reason ?? '' : e.kind === 'metric' ? (last ? `${num(Math.round((last.value ?? last[1]) * 10) / 10)}${s.unit ?? ''}` : '') : e.target?.kind ?? '';
  const label = [kind, e.kind === 'events' ? '' : name, third].filter(Boolean).join(' · ');
  const tip = e.kind === 'logs' ? hit?.text ?? hit?.line ?? '' : e.kind === 'events' ? [row?.object, row?.message].filter(Boolean).join(' · ') : e.query ?? '';
  return { label, tip: String(tip).slice(0, 300) };
}
export const when = (ms, now) => (ymd(ms) === ymd(now) ? hm(ms) : localTime(ms)?.slice(0, 16) ?? '');
/** 차트 축 시각: 구간이 하루를 넘으면 날짜까지, 아니면 HH:mm */
export const axisTime = (from, to) => at => (to - from > 86400000 ? when(at, 0) : hm(at));
/** 문서 표의 시각: 기준일(감지일)이면 HH:MM:SS(날짜는 캡션), 다른 날은 YYYY-MM-DD HH:MM:SS */
export const docTime = (ms, day) => (ymd(ms) === ymd(day) ? hms(ms) : localTime(ms) ?? '');
/** 화면 시각의 기준 시간대 이름(UTC+09:00): 캡션과 머리에 날짜와 함께 쓴다 */
export const zoneOf = ms => { const m = -new Date(ms).getTimezoneOffset(), a = Math.abs(m); return `UTC${m < 0 ? '-' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`; };

/** 걸린 시간 글: 1분 미만은 초, 1시간 미만은 분(초가 있으면 분 초), 그 위는 시간 분 */
export function duration(t, ms) {
  const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60), h = Math.floor(m / 60);
  if (s < 60) return t('wake.inc.dur.s', { n: s });
  if (m < 60) return s % 60 && m < 10 ? t('wake.inc.dur.ms', { m, s: s % 60 }) : t('wake.inc.dur.m', { n: m });
  return m % 60 ? t('wake.inc.dur.hm', { h, m: m % 60 }) : t('wake.inc.dur.h', { n: h });
}

/** 원인 등급(사슬의 grade): 이름, 색, 표시 */
const GRADE = { confirmed: ['ok', 'shield-check'], inferred: ['warn'], supported: ['warn'], insufficient: ['idle', 'lock'] };
export const gradeOf = (t, g) => { const [kind, icon] = GRADE[g] ?? GRADE.insufficient; return { label: t(`wake.inc.grade.${GRADE[g] ? g : 'insufficient'}`), kind, ...(icon ? { icon } : {}) }; };

/** 복구 종류(recoveryKind)의 말 하나: 작업면, 목록, 보고서 머리·요약·채널이 같은 말을 쓴다 */
export const recoveryWord = (t, code) => t(`wake.inc.result.${code}`);
/** 결과 코드(recoveryKind) -> 상태 표시: 서비스 복구만 정상 아이콘, 나머지는 경고 아이콘 + 글 */
const resultStatus = (t, code) => (recoveryTone(code) === 'ok'
  ? C.statusIcon.render({ kind: 'ok', label: recoveryWord(t, code) })
  : C.statusIcon.render({ kind: 'warn', text: recoveryWord(t, code) }));

/** 조치 계획의 길(planFor route) -> 단계 코드: Draft PR → 병합 → 동기화 → 롤아웃, helm, 명령, 직접 확인 */
export const routeKeys = plan => (plan.route === 'pr' ? ['pr', 'merge', 'sync', 'rollout'] : plan.route === 'helm' ? [plan.id === 'rollback' ? 'helmRollback' : 'helm', 'rollout'] : plan.route === 'manual' ? ['manual'] : ['command']);
export const routeOf = (t, plan) => routeKeys(plan).map(k => t(`wake.inc.route.${k}`));
/** 승인한 조치의 실행 단계와 상태(receipts: 허브 workspace.execution.receipts). 영수증이 있는 단계만 done: Draft PR은 PR 만들기 결과(만들어짐 done, 대기 wait,
 *  GitHub 연결 안 됨·실패 fail), 그 밖의 단계는 Wake가 받는 영수증이 없어 wait(사람이 밖에서 실행) */
export const routeSteps = (plan, receipts = {}) => routeKeys(plan).map(key => {
  const pr = receipts?.pr;
  return { key, state: key !== 'pr' ? 'wait' : pr === 'created' || pr?.url ? 'done' : pr === 'github-unconnected' || pr === 'failed' || pr?.error ? 'fail' : 'wait' };
});
/* 바꾸는 값의 짧은 이름: 경로의 마지막 두 칸(limits.memory, pool.max) */
const shortPath = path => String(path).replace(/^.*\]\.?/, '').split('.').filter(Boolean).slice(-2).join('.');
/** 조치가 바꾸는 값 전부(승인 창과 같은 목록) */
/* 명령은 보이는 꼴(preview: 옛 템플릿의 비밀 값을 가림)로 */
export const changeOf = (t, o) => { const v = o.plan.values; return v.length ? t('wake.inc.act.values', { values: v.map(x => `${shortPath(x.path)} ${x.before} → ${x.after}`).join(', '), n: v.length }) : o.plan.preview ?? o.plan.command ?? o.title; };
/** 조치 후보 하나 -> 조치 비교(actionCompare) 한 줄. 직접 확인(manual)의 명령은 바꾸는 값이 아니라 확인 명령이라 그 이름으로 */
export const compareOption = (t, x) => {
  const g = gradeOf(t, x.grade);
  return { id: x.id, title: x.title, kind: x.kind, grade: { ...g, label: x.basis ? t('wake.inc.act.basis', { g: x.basis }) : t('wake.inc.act.grade', { g: g.label }) }, change: changeOf(t, x), reach: x.reach, note: x.note,
    route: routeOf(t, x.plan), ...(x.plan.route === 'manual' ? { labels: { change: t('wake.inc.act.check') } } : {}) };
};

/**
 * 근거 시계열 한 줄의 차트(chart-card props): 근거 상세와 보고서 그림이 같이 쓴다. 시각은 ms, 표본 [{ at, value|null }]. from·to가 없으면 표본의 처음과 끝.
 * events: [{ at(ms), label, kind?, tone? }] 표시선(보고서: 승인 · 적용 · 복구 확인)
 */
export function seriesChart({ title, name, unit, samples, refs = [], from, to, events = [], height = 160, key = 'ws', color = '--series-2', marksLabel = null }) {
  const sec = ms => ms / 1000, step = samples.length > 1 ? samples[1].at - samples[0].at : 0;
  const max = Math.max(...samples.map(x => x.value ?? 0), ...refs.map(r => r.value));
  const a = from ?? samples[0].at, b = to ?? samples.at(-1).at, shown = events.filter(e => e.at >= a && e.at <= b);
  /* marksLabel(보고서): 범례에 선 · 기준선 · 표시선을 이름과 함께 */
  const legend = marksLabel ? [{ label: name, color }, ...refs.map(r => ({ label: r.label, color: r.tone === 'limit' ? '--chart-limit' : '--muted-foreground', dash: true })), ...(shown.length ? [{ label: marksLabel, color: '--muted-foreground', dash: true }] : [])] : null;
  return { title, density: 'compact', bare: true, ...(legend ? { legend } : {}), chart: { kind: 'area', height, unit, max, refs, ticks: [0, Math.round(max / 2), max],
    timeAxis: { from: sec(a), to: sec(b), maxGapSeconds: sec(step) },
    ...(shown.length ? { events: shown.map(e => ({ ...e, at: sec(e.at), time: hms(e.at) })) } : {}),
    series: [{ name, color, key, observations: samples.filter(x => x.at >= a && x.at <= b).map((x, i) => ({ at: sec(x.at), value: x.value, joinPrevious: i > 0 })) }] } };
}

/** 감사 행(6.2)의 조각: 요청자 표시(사람은 아바타 + 이름, 그 밖은 아이콘 + 이름), 출처 이름표(클라이언트 · 경로, kit badge 흐린 글자), 한 일, 결과 상태 */
const REQUESTER_ICON = { ai: 'ai', wake: 'shield-check', external: 'bell' };
export const requesterMark = r => (r.requester.kind === 'human' ? C.avatar.render({ name: r.requester.name, size: 'sm', showName: true }) : C.statusIcon.render({ kind: 'idle', icon: REQUESTER_ICON[r.requester.kind] ?? 'circle-check', text: r.requester.name }));
/* 클라이언트 이름이 요청자 이름과 같으면(외부 AI 클라이언트) 경로만 */
const sourceLabel = (t, r) => sourceParts(r).filter(x => x !== r.requester?.name).map(x => (x === r.transport ? t(`wake.inc.transport.${x}`) : x)).join(' · ');
export const sourceBadge = (t, r) => (sourceParts(r).length ? C.badge.render({ tone: 'neutral', size: 'sm', label: sourceLabel(t, r) }) : '');
export const auditSummary = (t, r) => (typeof r.summary === 'string' ? r.summary : t(r.summary.key, r.summary.vars));
const ACTION_ICON = { read: 'file-text', model: 'ai', propose: 'git-pull-request', approve: 'circle-check', deny: 'circle-check', alert: 'bell', judge: 'shield-check', resolve: 'circle-check' };
export const auditIcon = r => ACTION_ICON[r.action] ?? 'circle-check';
/* 양(줄 · 건 · 샘플 · 토큰)과 실행 주체(모델) */
export const auditSize = (t, s) => (s ? t(`wake.ailog.size.${s.unit}`, { n: num(s.n) }) : '');
export const auditExec = (t, r) => `${r.executor} · ${r.model ?? t('wake.ailog.noModel')}`;
export const auditResult = (t, code) => { const [kind, key] = resultOf(code), word = key ? t(key) : code; return kind === 'ok' ? C.statusIcon.render({ kind, label: word }) : C.statusIcon.render({ kind, text: word }); };

/** 심각도: critical은 오류, 그 밖은 경고(원문 그대로) */
export const severityStatus = sev => C.statusIcon.render({ kind: sev === 'critical' ? 'error' : 'warn', text: sev });

const median = xs => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

/** 과거 인시던트 표(인시던트 목록, 홈 과거 인시던트 카드): 날짜 · 인시던트 · 조치 · 결과 · 걸린 시간. action: 행을 누르면 그 번호로 */
export const incidentsTable = ({ t, rows, action }) => C.dataTable.render({ rowKey: 'id', rows, rowAction: action, reveal: true, clip: true, columns: [
  { id: 'at', label: t('wake.inc.list.date'), time: true, width: 'calc(var(--space-16) * 1.5)', cell: r => ymd(r.at) },
  { id: 'title', label: t('wake.home.incidents'), cell: r => r.title },
  { id: 'action', label: t('wake.inc.stage.act'), muted: true, optional: true },
  { id: 'result', label: t('wake.inc.list.result'), fit: true, optional: true, cell: r => resultStatus(t, r.result) },
  { id: 'took', label: t('wake.inc.list.took'), kind: 'number', width: 'calc(var(--space-16) * 1.2)', cell: r => duration(t, r.took) },
] });

/**
 * 인시던트 목록(시뮬레이션 인시던트 화면): 도구 줄(검색 → 결과 거르기 → 기간), 열린 인시던트 카드(한 줄 행), 과거 인시던트 카드(표 + 페이저).
 *  list: 목록 행(인시던트 저장소 incidents 응답 모양), st: { q, result, page, range }, now: 기준 시각(ms),
 *  actions: { search, result, page, range, open(인시던트 번호로 여는 action), card }, folded: 접은 카드
 */
/** 인시던트 화면의 기간(범위 검색 상자 아래 줄 끝): 보관 90일 */
export const incidentRange = ({ st, now, action }) => C.timeRange.render({ id: 'wake-inc-range', value: st.range ?? { preset: '7d' }, action, presets: [{ id: '15m', seconds: 900 }, { id: '1h', seconds: 3600 }, { id: '6h', seconds: 21600 }, { id: '24h', seconds: 86400 }, { id: '7d', seconds: 604800 }], fallback: '7d', retention: 90 * 86400, now: Math.floor(now / 1000) });
export function incidentsView({ t, list, st, now, actions, folded = {} }) {
  const q = (st.q || '').toLowerCase(), seconds = { '15m': 900, '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 }[st.range?.preset] ?? 30 * 86400;
  const range = st.range?.from != null ? r => r.at >= st.range.from * 1000 && r.at <= st.range.to * 1000 : r => r.at >= now - seconds * 1000;
  const open = list.filter(r => !r.result).sort(compareIncidents), inRange = list.filter(r => r.result && range(r)).sort(compareHistory);
  const match = r => !q || r.title.toLowerCase().includes(q) || r.number.toLowerCase().includes(q) || (r.alert || '').toLowerCase().includes(q);
  /* 결과 알약은 늘 같은 다섯(알림 상태 알약처럼), "전체"는 결과 표가 거르는 구간 안 지난 인시던트 수(A-21) */
  const filters = [['all', null], ...RECOVERY_KINDS.map(code => [code, code])];
  const rows = inRange.filter(r => match(r) && (st.result === 'all' || r.result === st.result)), per = 20, pages = Math.max(1, Math.ceil(rows.length / per)), page = Math.min(st.page || 1, pages);
  /* 글(제목·번호·알림)과 기간은 범위 검색 상자(scope-box.js)에, 결과 알약만 이 줄 */
  const toolbar = C.listToolbar.render({
    filters: C.pillTabs.render({ id: 'wake-inc-result', fold: true, value: st.result, action: actions.result, tabs: filters.map(([id, code]) => ({ id, label: code ? t(`wake.inc.result.${code}`) : t('wake.inc.list.all'), count: num(code ? inRange.filter(r => r.result === code).length : inRange.length) })) }),
  });
  const openRows = open.filter(match);
  const openCard = C.summaryBar.render({ label: t('wake.home.openIncidents'), open: !folded.open, toggle: { action: actions.card, arg: 'open' },
    items: [{ id: 'title', label: '', value: t('wake.home.openIncidents') }, { id: 'n', label: '', value: String(openRows.length), ...(openRows.length ? { tone: 'danger' } : {}) }],
    body: openRows.length ? C.rowList.render({ rows: openRows.map(r => ({ id: r.id, lead: C.statusIcon.render({ kind: 'error', attention: true }), title: `${r.number} ${r.title}`,
      sub: [r.alert, r.sev, r.cluster, r.ns, t('wake.inc.list.createdAt', { at: when(r.at, now) })].filter(Boolean).join(' · '), meta: t(`wake.inc.phase.${r.phase}`), action: actions.open, arg: r.id })) })
      : C.emptyState.render({ title: t('wake.inc.list.noOpen'), variant: 'line' }) });
  const took = median(rows.map(r => r.took));
  const pastCard = C.summaryBar.render({ label: t('wake.inc.list.past'), open: !folded.past, toggle: { action: actions.card, arg: 'past' },
    items: [{ id: 'title', label: '', value: t('wake.inc.list.past') }, { id: 'n', label: '', value: String(rows.length) }, { id: 'kept', label: t('wake.inc.list.kept', { n: 90 }), value: String(list.filter(r => r.result).length), priority: -1 },
      ...filters.slice(1).map(([code]) => ({ id: code, label: t(`wake.inc.result.${code}`), value: String(rows.filter(r => r.result === code).length) })).filter(x => x.value !== '0'),
      ...(took != null ? [{ id: 'md', label: t('wake.inc.list.median'), value: duration(t, took) }] : [])],
    body: rows.length ? html`${incidentsTable({ t, rows: rows.slice((page - 1) * per, page * per), action: actions.open })}${C.pager.range({ page, per, total: rows.length, action: actions.page })}` : C.emptyState.render({ title: t('wake.home.noIncidents'), variant: 'line' }) });
  return html`${toolbar}${openCard}${pastCard}`;
}
