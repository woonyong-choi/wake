/*
 * 리소스 상세의 관련 자료(spec/screens/resource-relations.md#SCR-RESOURCE-RELATIONS-01, resource-events.md):
 *  ownedEvents: 대상과 그것이 소유한 것(범위 검색 상자와 같은 소유 규칙, data/scope.js scopeRelation)에 걸린 Event 행. 대상 자신의 Event는 UID까지 같아야 한다.
 *  relatedResources: 관련 리소스 표의 행 — 소유(ownerReferences), 고르는 Service(selector), Node(spec.nodeName), 겨누는 HPA(scaleTargetRef), Service를 잇는 Ingress(backend.service),
 *   Pod(또는 워크로드의 Pod 템플릿)가 읽는 ConfigMap·Secret(envFrom, env valueFrom, volumes·projected). Secret은 이름만(Wake는 Secret을 읽지 않음).
 * 화면이 이미 읽은 행과 같은 namespace의 목록(Service·HPA·Ingress)만 쓴다. 이름이 비슷한 것은 잇지 않는다.
 */
import { scopeRelation } from './scope.js';
import { KIND_LIST, rowOf } from './kinds.js';
import { workloadOf } from './home.js';

const selects = (selector, labels) => Object.keys(selector || {}).length > 0 && Object.entries(selector).every(([k, v]) => labels?.[k] === v);
const uidOf = row => row?.raw?.metadata?.uid ?? row?.uid ?? null;
/* 원본 객체(관계 읽기의 ReplicaSet 등)를 scope.js가 읽는 행 모양으로 */
const rowOfRaw = raw => ({ ns: raw.metadata?.namespace || '', name: raw.metadata?.name, uid: raw.metadata?.uid, ownerReferences: raw.metadata?.ownerReferences || [] });

/** kind: 대상 종류 복수형, row: 대상 행, events: data 'events' 행, owned: { pods, replicasets(원본), jobs(행) } */
export function ownedEvents(kind, row, events, { pods = [], replicasets = [], jobs = [] } = {}) {
  const def = KIND_LIST.find(k => k.plural === kind), uid = uidOf(row);
  const rel = scopeRelation({ kinds: [kind] }, { objects: { [kind]: [{ ...row, uid }] }, pods, replicasets: replicasets.map(rowOfRaw), jobs });
  const rows = events.filter(e => {
    const o = e.object || {};
    if (o.kind === def.kind && o.name === row.name && (def.cluster || o.ns === row.ns)) return !!uid && o.uid === uid;
    return rel.has(o.kind, o.ns, o.name);
  });
  return Object.assign(rows, { partial: events.partial === true });
}

/**
 * 관련 리소스 표의 행 { id, kind, plural, name, ns, uid, relation, status }.
 *  kind·row: 대상, mine: 대상의 Pod(Pod 상세는 자신), owners: 확인된 소유자 행 { kind, name, ns, uid, status }(Pod 상세),
 *  replicasets: 관계 읽기의 ReplicaSet 원본(Deployment), services·hpas·ingresses: 같은 namespace의 행,
 *  objects: { 복수형: 행[] } 화면이 읽은 목록(Pod 상세의 deployments·cronjobs·nodes): 상태를 모르는 행(소유자의 소유자, Node)이 그 목록의 상태를 갖는다(A3-10)
 */
export function relatedResources(kind, row, { mine = [], owners = [], replicasets = [], services = [], hpas = [], ingresses = [], objects = {} } = {}) {
  const out = [], seen = new Set();
  const known = (plural, name, ns) => (objects[plural] || []).find(x => x.name === name && (!x.ns || !ns || x.ns === ns))?.status ?? null;
  const add = (kindName, name, ns, relation, status, uid = null, extra = {}) => {
    const plural = KIND_LIST.find(k => k.kind === kindName)?.plural, key = [kindName, ns, name, relation].join('/');
    if (!name || !plural || seen.has(key)) return;
    seen.add(key); out.push({ id: key, kind: kindName, plural, name, ns, uid, relation, status: status ?? (extra.nameOnly ? null : known(plural, name, ns)), ...extra });
  };
  for (const o of owners) add(o.kind, o.name, o.ns, 'owner', o.status, o.uid);
  if (kind === 'deployments') for (const raw of replicasets) add('ReplicaSet', raw.metadata?.name, raw.metadata?.namespace, 'owner', raw.status ? rowOf('replicasets', raw).status : null, raw.metadata?.uid); /* the list's status of the set (status read with it) */
  if (kind === 'pods' && row.node) add('Node', row.node, '', 'node', null);
  if (kind === 'horizontalpodautoscalers') { const [k, n] = String(row.reference || '').split('/'); add(k, n, row.ns, 'scaleTarget', null); }
  if (kind === 'ingresses') for (const b of row.backends || []) { const s = services.find(x => x.name === b.service); add('Service', b.service, row.ns, 'backend', s?.status ?? null, uidOf(s)); }
  /* 대상의 Pod를 고르는 Service, 그 Service를 잇는 Ingress, 대상(또는 Pod를 만든 워크로드)을 겨누는 HPA */
  const chosen = kind === 'services' ? [row] : services.filter(s => mine.some(p => p.ns === s.ns && selects(s.selector, p.labels)));
  if (kind !== 'services') for (const s of chosen) add('Service', s.name, s.ns, 'selector', s.status, uidOf(s));
  for (const i of ingresses) if ((i.backends || []).some(b => chosen.some(s => s.ns === i.ns && s.name === b.service))) add('Ingress', i.name, i.ns, 'backend', i.status, uidOf(i));
  const def = KIND_LIST.find(k => k.plural === kind), targets = new Set([`${def?.kind}/${row.name}`, ...mine.map(p => { const w = workloadOf(p); return `${w.kind}/${w.name}`; })]);
  for (const h of hpas) if (h.ns === row.ns && targets.has(h.reference)) add('HorizontalPodAutoscaler', h.name, h.ns, 'scaleTarget', h.status, uidOf(h));
  /* 그 Pod 명세가 읽는 ConfigMap·Secret: 환경 변수(envFrom, valueFrom) 다음 볼륨, 명세의 순서대로 */
  const spec = kind === 'pods' ? row.raw?.spec : row.raw?.spec?.template?.spec ?? row.raw?.spec?.jobTemplate?.spec?.template?.spec;
  const ref = (cm, sec, relation) => { if (cm) add('ConfigMap', cm, row.ns, relation, null); if (sec) add('Secret', sec, row.ns, relation, null, null, { nameOnly: true }); };
  for (const c of [...(spec?.initContainers || []), ...(spec?.containers || [])]) {
    for (const f of c.envFrom || []) ref(f.configMapRef?.name, f.secretRef?.name, 'env');
    for (const e of c.env || []) ref(e.valueFrom?.configMapKeyRef?.name, e.valueFrom?.secretKeyRef?.name, 'env');
  }
  for (const v of spec?.volumes || []) {
    ref(v.configMap?.name, v.secret?.secretName, 'volume');
    for (const p of v.projected?.sources || []) ref(p.configMap?.name, p.secret?.name, 'volume');
  }
  return out;
}
