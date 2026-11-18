/*
 * 범위 검색 상자의 관계(spec/screens/common.md#SCR-SEARCH-SCOPE, 시뮬레이션 sim-views.js scope()): 클러스터 화면 여덟이 함께 쓰는 리소스 종류(여럿) · namespace 하나의 범위가
 * 각 화면의 행(이벤트의 대상, 알림 라벨, Application이 관리하는 리소스, Service, Pod, 인시던트 대상)과 맞는지.
 * 종류마다 그 종류의 객체와 그 객체가 소유한 것(ownerReferences: Deployment → ReplicaSet → Pod, CronJob → Job → Pod, StatefulSet·DaemonSet·Job·ReplicaSet → Pod),
 * Service는 selector가 고르는 같은 namespace의 Pod, Node는 그 위의 Pod가 범위다. 종류를 여럿 고르면 각 종류가 닿는 것의 합집합이다. 이름이 비슷한 것은 맞추지 않는다(소유 참조만).
 * 글은 화면마다 따로(scopeText): 화면을 옮겨도 다른 화면의 글을 가져오지 않는다.
 * 고르기 메뉴의 수(scopeCounts)는 객체 수: 종류는 고른 namespace 안의 그 종류 객체, namespace는 고른 종류(없으면 읽을 수 있는 모든 종류)의 그 namespace 객체.
 */
import { KIND_OF } from './kinds.js';
import { workloadOf } from './home.js';
import { alertLabels, alertObjects } from './alerts.js';

const key = (kind, ns, name) => `${kind}/${ns || ''}/${name}`;
/** 행의 컨트롤러 소유자(ownerReferences의 controller, 없으면 첫 소유자): { kind, name, uid } */
const controllerOf = r => { const refs = Array.isArray(r?.ownerReferences) ? r.ownerReferences : []; const c = refs.find(x => x?.controller === true) ?? refs[0] ?? (r?.owner && typeof r.owner === 'object' ? r.owner : null); return c ? { kind: c.kind, name: c.name, uid: c.uid ?? null } : null; };
const selects = (sel, labels) => Object.keys(sel || {}).length > 0 && Object.entries(sel).every(([k, v]) => labels?.[k] === v);

/** 고른 종류 목록: 빈 목록과 null은 고르지 않음(거르지 않음), 알 수 없는 종류는 뺀다 */
export const pickedKinds = list => { const k = (Array.isArray(list) ? list : []).filter(p => KIND_OF[p]); return k.length ? k : null; };

/* 종류 하나의 관계: 그 종류의 객체 키 · 소유한 것의 키 · 범위 Pod */
function reachOf(kind, objectsAll, data, inNs, allPods) {
  const def = KIND_OF[kind], objects = (objectsAll ?? []).filter(o => inNs(o.ns));
  const own = new Set(objects.map(o => key(def.kind, def.cluster ? '' : o.ns, o.name))), uids = new Set(objects.map(o => o.uid).filter(Boolean));
  const kids = new Set();
  /* 소유자 하나가 고른 것(또는 그것이 소유한 것)인지: uid가 있으면 uid, 없으면 같은 namespace의 종류·이름 */
  const ownedBy = (r, parents, parentKind) => { const c = controllerOf(r); return !!c && c.kind === parentKind && (c.uid ? parents.uids.has(c.uid) : parents.keys.has(key(parentKind, r.ns, c.name))); };
  const group = (rows, k) => ({ uids: new Set(rows.map(x => x.uid).filter(Boolean)), keys: new Set(rows.map(x => key(k, x.ns, x.name))) });
  const top = { uids, keys: own };
  let pods = [];
  if (kind === 'pods') pods = allPods.filter(p => own.has(key('Pod', p.ns, p.name)));
  else if (kind === 'deployments' || kind === 'cronjobs') {
    const [midKind, mids] = kind === 'deployments' ? ['ReplicaSet', data.replicasets ?? []] : ['Job', data.jobs ?? []];
    const mine = mids.filter(m => inNs(m.ns) && ownedBy(m, top, def.kind));
    for (const m of mine) kids.add(key(midKind, m.ns, m.name));
    pods = allPods.filter(p => ownedBy(p, group(mine, midKind), midKind));
  } else if (['statefulsets', 'daemonsets', 'jobs', 'replicasets'].includes(kind)) pods = allPods.filter(p => ownedBy(p, top, def.kind));
  else if (kind === 'services') pods = allPods.filter(p => objects.some(s => s.ns === p.ns && selects(s.selector, p.labels)));
  else if (kind === 'nodes') pods = allPods.filter(p => objects.some(n => n.name === p.node));
  for (const p of pods) kids.add(key('Pod', p.ns, p.name));
  return { def, own, kids, pods };
}

/**
 * scope: { kinds: 종류 복수형(kinds.js)[] | null, ns: namespace[] | null }
 * data: { objects: { 종류: 그 종류의 행 }, pods, replicasets, jobs } — 화면이 읽은 실제 행
 * 반환 { on, kinds, ns, inNs(ns), has(kind, ns, name), touches(kind, ns, name), pods, pod(p) }
 *   has: 고른 종류의 객체이거나 그것이 소유한 것(이벤트의 대상, 알림 라벨의 객체, 인시던트 대상)
 *   touches: has이거나 범위 Pod를 만든 워크로드(Application이 관리하는 리소스, 홈의 Unavailable 워크로드)
 */
export function scopeRelation(scope = {}, data = {}) {
  const kinds = pickedKinds(scope.kinds), ns = Array.isArray(scope.ns) && scope.ns.length ? scope.ns : null;
  const inNs = x => !ns || !x || ns.includes(x);
  const allPods = (data.pods ?? []).filter(p => inNs(p.ns));
  if (!kinds) {
    /* namespace만 고르면 Node(namespace 없음)는 그 namespace의 Pod가 도는 것만(Node→Pod, 목록과 같은 규칙 A3-13·R4-05). Pod를 읽지 않은 문맥은 거르지 않는다 */
    const nodes = ns && data.pods ? new Set(allPods.map(p => p.node).filter(Boolean)) : null;
    const has = (k, n, name) => (k === 'Node' && nodes ? nodes.has(name) : inNs(n));
    return { on: !!ns, kinds: null, ns, inNs, has, touches: has, pods: allPods, pod: p => inNs(p.ns) };
  }
  const reach = kinds.map(k => reachOf(k, data.objects?.[k], data, inNs, allPods));
  const podKeys = new Set(reach.flatMap(r => r.pods.map(p => key('Pod', p.ns, p.name))));
  const pods = allPods.filter(p => podKeys.has(key('Pod', p.ns, p.name)));
  /* 범위 Pod를 만든 워크로드(ReplicaSet 소유는 Deployment): Pod·Service·Node 범위에서 GitOps·홈 워크로드가 맞는 길 */
  const makers = new Set(pods.map(p => { const w = workloadOf({ ...p, owner: controllerOf(p) }); return key(w.kind, p.ns, w.name); }));
  const has = (k, n, name) => !!name && inNs(n) && reach.some(r => (k === r.def.kind ? r.own.has(key(k, r.def.cluster ? '' : n, name)) : r.kids.has(key(k, n, name))));
  return { on: true, kinds, ns, inNs, has, touches: (k, n, name) => has(k, n, name) || makers.has(key(k, n, name)), pods, pod: p => podKeys.has(key('Pod', p.ns, p.name)) };
}

/**
 * 고르기 메뉴의 수: kinds는 종류 읽기(data 'kinds')의 항목 { plural, cluster, count, readStatus, byNs }.
 * 반환 { kind: { 종류: 수 | null(읽을 수 없음) }, ns: { namespace: 수 } }. 종류의 수는 고른 namespace 안(클러스터 범위 종류는 전체), namespace의 수는 고른 종류(없으면 읽을 수 있는 모든 종류)
 */
export function scopeCounts(kinds = [], scope = {}) {
  const ns = Array.isArray(scope.ns) && scope.ns.length ? scope.ns : null, chosen = pickedKinds(scope.kinds);
  const readable = kinds.filter(k => k.readStatus === 'ok');
  /* 클러스터 범위 종류는 전체, 단 Node는 고른 namespace의 Pod가 도는 것(namesByNs, 목록과 같은 수) */
  const kind = Object.fromEntries(kinds.map(k => [k.plural, k.readStatus !== 'ok' ? null : !ns ? k.count ?? 0 : k.namesByNs ? new Set(ns.flatMap(x => k.namesByNs[x] ?? [])).size : k.cluster ? k.count ?? 0 : ns.reduce((n, x) => n + (k.byNs?.[x] ?? 0), 0)]));
  const by = {};
  /* namespace의 수는 목록과 한 모집단: 클러스터 범위 종류 중 Node는 그 namespace의 Pod가 도는 것(namesByNs, 목록이 그 Node를 보임 A3-13·R4-06) */
  for (const k of readable) if (!chosen || chosen.includes(k.plural)) {
    if (!k.cluster) for (const [x, n] of Object.entries(k.byNs ?? {})) by[x] = (by[x] ?? 0) + n;
    else if (k.namesByNs) for (const [x, names] of Object.entries(k.namesByNs)) by[x] = (by[x] ?? 0) + new Set(names).size;
  }
  return { kind, ns: by };
}

/** 알림이 범위에 드는가: 알림이 말하는 객체의 라벨(data/alerts.js alertLabels: 수집 대상 라벨을 뺀 것)로 본다. namespace 라벨이 없는 알림(Node 등)은 늘 보인다.
 *  종류를 고르면 알림이 말하는 객체가 그 종류의 것(또는 그것이 소유한 것)이어야 한다 */
export function alertInScope(rel, labels = {}) {
  const ns = alertLabels(labels).namespace;
  if (!ns) return true;
  if (!rel.inNs(ns)) return false;
  if (!rel.kinds) return true;
  return alertObjects(labels).some(o => o.kind !== 'Node' && rel.has(o.kind, ns, o.name));
}

/** 화면 하나의 글(화면마다 따로): store는 설정 wake.scope의 클러스터 하나 { kinds, ns, q: { 화면: 글 } } */
export const scopeText = (store, section) => String(store?.q?.[section] ?? '');
