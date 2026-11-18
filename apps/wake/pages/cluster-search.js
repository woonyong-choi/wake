/*
 * 클러스터 전체 이름 검색(spec/screens/common.md#SCR-SEARCH-SCOPE, 시뮬레이션 findBox · findResults): 홈은 범위 검색 상자의 글(그 종류 · namespace 안), 클러스터 구역 밖 화면(도구 · 에이전트 ·
 * 비용 · 인시던트 상세)은 머리 끝 검색 칸의 글로 찾고, 그 아래 결과 카드(결과 · 수 · 종류별 수, Name · Kind · Namespace · Status 표). 검색 칸의 상태는 화면 정의의 search 키(kit.screen.search).
 * 처음 칠 때 종류마다 이름 목록을 읽고(Secret은 읽지 않음) 1분이 지나면 다음 검색에서 다시 읽는다. 못 읽은 종류는 "결과 없음" 대신 그 종류 · 원인 · 다시 시도로 말한다(C-20).
 * 행을 누르면 그 리소스의 상세 칸.
 */
import { components as C, html } from '../../../kit/page/index.js';
import { status, num } from './parts.js';
import { readRow, readFailure } from './view-parts.js';
import { FIND_KINDS, findResources } from '../data/find.js';
import { KIND_OF } from '../data/kinds.js';

export const SEARCH_W = 'calc(var(--space-40) * 1.5)';
const ROWS = 80;
const INDEX_MS = 60_000;

/** ctx: 페이지 문맥(screen에 { search: { key } } 선언), cluster: 클러스터 id, key: 검색 상태 키 */
export function clusterSearch(ctx, cluster, key = 'q') {
  const { t, data } = ctx;
  /* 색인: rows(종류 -> 행, 읽기 전 null), failed([{ kind, error }]: 못 읽은 종류), at(읽은 시각), reading(읽는 중) */
  let index = null;
  const query = () => String(ctx.state()[key] ?? '');
  function read(force = false) {
    if (index?.reading || (index && !force && Date.now() - index.at < INDEX_MS)) return index?.reading ?? Promise.resolve();
    const next = index ?? { rows: null, failed: [], at: 0 };
    index = next;
    next.reading = Promise.allSettled(FIND_KINDS.map(kind => data.get('resources', { cluster, ns: '_all', kind }).then(rows => [kind, rows])))
      .then(all => { next.rows = Object.fromEntries(all.filter(r => r.status === 'fulfilled').map(r => r.value));
        next.failed = all.flatMap((r, i) => (r.status === 'rejected' ? [{ kind: FIND_KINDS[i], error: r.reason }] : [])); next.at = Date.now(); next.reading = null; ctx.update(); });
    return next.reading;
  }
  /* 못 읽은 종류의 줄: 종류 이름 · 원인, 다시 시도(색인을 다시 읽음) */
  const failedRow = () => (index.failed.length ? readRow(t, 'error', 'wake.search.retry', readFailure(t, index.failed[0].error, t('wake.search.partial', { kinds: index.failed.map(f => KIND_OF[f.kind]?.kind ?? f.kind).join(' · ') }))) : '');
  const field = (placeholder = t('wake.inc.searchCluster')) => C.searchInput.render({ placeholder, action: 'kit.screen.search', value: query(), width: SEARCH_W });
  /** o: { q: 찾을 글(없으면 검색 칸), kinds: 종류 복수형(범위의 종류), inNs(ns): 범위의 namespace } */
  const find = (q, o = {}) => findResources(index.rows, q, o.kinds ? { kinds: o.kinds } : {}).filter(r => !o.inNs || o.inNs(r.ns));
  function results(o = {}) {
    const q = String(o.q ?? query()).trim(); if (!q) return '';
    read();
    if (!index.rows) return C.statusIcon.render({ kind: 'busy', text: t('wake.res.loading') });
    const failed = failedRow();
    const hits = find(q, o), rows = hits.slice(0, ROWS).map(r => ({ ...r, id: `${r.plural}/${r.ns || '_all'}/${r.name}`, kind: KIND_OF[r.plural]?.kind ?? r.plural }));
    if (!rows.length) return failed || C.emptyState.render({ icon: 'search', plainIcon: true, title: t('wake.search.none', { q }) });
    const kinds = [...new Set(rows.map(r => r.kind))].map(k => ({ id: 'k-' + k, label: k, value: num(rows.filter(r => r.kind === k).length) }));
    return html`${failed}${C.summaryBar.render({ label: t('wake.search.result'), open: true,
      items: [{ id: 't', label: '', value: t('wake.search.result') }, { id: 'n', label: '', value: num(hits.length) }, ...kinds],
      body: C.dataTable.render({ clip: true, rowKey: 'id', rows, rowAction: 'wake.search.open', reveal: true, columns: [
        { id: 'name', label: 'Name', lead: r => ({ icon: KIND_OF[r.plural]?.icon }) },
        { id: 'kind', label: 'Kind', muted: true, width: 'calc(var(--space-16) * 2.4)' },
        { id: 'ns', label: 'Namespace', muted: true, optional: true, width: 'calc(var(--space-16) * 2)' },
        { id: 'status', label: 'Status', optional: true, fit: true, width: 'calc(var(--space-16) * 2.5)', cell: r => (r.status ? status(r.status) : '') }] }) })}`;
  }
  /* 목록 화면의 "다른 종류에서 N건": 이 종류(except)를 뺀 종류에서 이름이 맞는 수(읽기 전이면 0), inNs가 있으면 그 namespace 안 */
  const otherCount = (q, except, inNs) => { if (!String(q).trim()) return 0; read(); return index.rows ? find(String(q).trim(), { inNs }).filter(r => r.plural !== except).length : 0; };
  const actions = {
    'wake.search.retry': () => read(true),
    'wake.search.open': a => { const [plural, ns, ...name] = String(a.arg).split('/');
      if (KIND_OF[plural]) ctx.api.navigate(`wake://${['cluster', cluster, 'ns', ns, plural, name.join('/')].map(encodeURIComponent).join('/')}`, { presentation: 'detail' }); },
  };
  return { field, results, otherCount, actions };
}
