/*
 * 클러스터 전체 이름 검색(읽기만): 찾는 말 하나로 리소스 이름을 찾음(pages/cluster-search.js).
 * 순서: 이름이 같음 -> 이름이 그 말로 시작 -> 이름에 들어 있음, 같은 순위면 문제 있는 것 먼저. 대소문자 구분 없음.
 * Secret은 읽지 않으므로 찾는 대상에 없음. 논리 검사: find.test.mjs
 */

/* 찾는 리소스 종류(Event는 이벤트 묶음, Secret은 읽지 않음) */
export const FIND_KINDS = ['pods', 'deployments', 'statefulsets', 'daemonsets', 'jobs', 'services', 'ingresses', 'configmaps', 'nodes'];

const norm = s => String(s || '').toLowerCase();
/* 이름 순위: 0 같음, 1 시작, 2 들어 있음, -1 없음 */
export function rank(name, q) {
  const n = norm(name), w = norm(q).trim();
  if (!w) return -1;
  return n === w ? 0 : n.startsWith(w) ? 1 : n.includes(w) ? 2 : -1;
}
const bad = r => r.status && r.status[0] !== 'ok' && r.status[1] !== 'Completed';

/** rows: { plural: 행[] } (kinds.js 행) -> [{ plural, name, ns, status }] 순위·문제 순 */
export function findResources(rows, q, { kinds } = {}) {
  const out = [];
  for (const [plural, list] of Object.entries(rows || {})) {
    if (kinds?.length && !kinds.includes(plural)) continue;
    for (const r of list || []) { const k = rank(r.name, q); if (k >= 0) out.push({ plural, name: r.name, ns: r.ns || '', status: r.status, k }); }
  }
  return out.sort((a, b) => a.k - b.k || Number(bad(b)) - Number(bad(a)) || a.name.localeCompare(b.name)).map(({ k, ...r }) => r);
}
