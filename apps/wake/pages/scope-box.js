/*
 * 범위 검색 상자(spec/screens/common.md#SCR-SEARCH-SCOPE, 시뮬레이션 sim-views.js scopeBox · scopeHead): 클러스터 화면 여덟(홈 · 리소스 · 네트워크 · GitOps · 이벤트 · 로그 · 알림 · 인시던트)의
 * 머리 바로 아래 kit composer 하나(wide, 한 줄): [리소스 종류 ▾][namespace ▾] 글(화면마다 따로, Enter나 실행 단추로 적용) … 실행. 글이 여러 줄일 때만 커진다.
 * 두 고르기는 같은 다중 선택 메뉴(검색, 세 상태 "전체", 체크 · 아이콘 · 이름 · 수)이고 고르는 즉시 여덟 화면이 같은 범위로 적용된다. 아무것도 고르지 않음은 거르지 않음(전부 체크로 보임).
 * 종류는 워크로드 → 네트워크 → 저장소·구성 순서이고, 읽을 수 없는 종류(Secret은 늘: RULE-SECRET, 그 밖은 종류 읽기가 권한 없음이라 한 것)는 끝의 자물쇠 줄로만 남아 고를 수 없다.
 * 기간이 있는 화면은 상자 바로 아래 제 줄 오른쪽에 그 화면의 기간(render({ range })).
 * 범위는 설정 wake.scope에 클러스터마다 { kinds: 종류 복수형[] | null, ns: namespace[] | null, q: { 화면: 글 } }로 남아 화면을 옮겨도 이어진다(null은 전체, 이전 버전이 남긴 빈 목록도 전체).
 * 늘 설정에서 읽고 따로 사본을 두지 않는다: 다른 탭이 바꾼 범위가 이 탭에도 오고(onRun으로 페이지가 다시 읽음), 이 탭의 쓰기가 다른 탭의 선택을 덮지 않는다.
 * 종류를 고르면 그 종류들의 객체와 소유 관계(Pod, ReplicaSet, Job)를 실제 목록에서 읽어 관계(data/scope.js, 합집합)를 만든다.
 * 메뉴의 수는 메뉴를 열 때 한 번 읽는 종류 읽기(data 'kinds': 종류마다 수와 namespace별 수)에서 센다. 다 올 때까지 메뉴는 읽는 중 줄을 보인다.
 */
import { components as C, html } from '../../../kit/page/index.js';
import { KIND_OF } from '../data/kinds.js';
import { pickedKinds, scopeCounts, scopeRelation, scopeText } from '../data/scope.js';
import { multiPick } from './view-parts.js';
import { num } from './parts.js';

const SETTING = 'wake.scope';
/* 종류 고르기의 종류(이벤트는 그 자체가 화면이라 없음): 워크로드 → 네트워크 → 저장소·구성, Wake가 읽지 않는 Secret은 끝(A-25) */
const ALL_KINDS = ['nodes', 'deployments', 'statefulsets', 'daemonsets', 'replicasets', 'jobs', 'cronjobs', 'pods', 'horizontalpodautoscalers', 'services', 'ingresses', 'persistentvolumeclaims', 'configmaps', 'secrets'];
/* 종류마다 관계에 더 읽을 것: Deployment는 ReplicaSet, CronJob은 Job(소유 참조의 가운데 단계) */
const MIDDLE = { deployments: 'replicasets', cronjobs: 'jobs' };
/** 종류 이름(시뮬레이션 KINDS: PersistentVolumeClaim은 PVC) */
export const kindName = p => KIND_OF[p]?.short || KIND_OF[p]?.kind || p;

/** ctx: 페이지 문맥, cluster: 클러스터 id, section: 화면(home · resources · network · gitops · events · logs · alerts · incidents), related: 종류의 소유 관계를 읽는가(리소스 목록은 그 종류 자체만 보여 읽지 않음), alive(): 페이지가 아직 열려 있는가(닫힌 뒤 늦게 온 읽기는 그리지 않음), onRun(patch): 글(patch.q)·범위(patch.kinds · patch.ns)가 바뀐 뒤 페이지가 할 일(쪽 번호 되돌리기 등) */
export function scopeBox(ctx, cluster, section, { onRun = () => {}, related = true, alive = () => true } = {}) {
  const { t, data } = ctx;
  let namespaces = null, namespaceError = null, counted = null, countError = null, counting = null, rel = { key: null, ready: true, data: {}, error: null }, seq = 0, loading = Promise.resolve();
  const all = () => ctx.settings?.()?.[SETTING] ?? {};
  const store = () => all()[cluster] ?? {};
  /* 이 화면의 범위(종류 · namespace · 이 화면의 글): 다른 탭이 설정을 바꿨는지 알아보는 값 */
  const mark = () => ({ kinds: JSON.stringify(store().kinds ?? null), ns: JSON.stringify(store().ns ?? null), q: text() });
  let seen = null, relSeen = null;
  /* 저장된 목록 그대로(null: 전체, []: 아무것도 고르지 않음)와 거르는 범위(둘 다 거르지 않으면 null) */
  const stored = key => (Array.isArray(store()[key]) ? store()[key] : null);
  /* 읽을 수 없는 종류: Secret(RULE-SECRET)과 종류 읽기가 권한 없음이라 한 것. 고를 수 없고 "전체"에도 들지 않는다(C-14) */
  const denied = p => p === 'secrets' || counted?.find(x => x.plural === p)?.readStatus === 'forbidden';
  const pickable = () => ALL_KINDS.filter(p => !denied(p));
  const kinds = () => pickedKinds(stored('kinds')?.filter(p => !denied(p)));
  const ns = () => (stored('ns')?.length ? stored('ns') : null);
  const text = () => scopeText(store(), section);
  const write = patch => { ctx.api?.setSetting?.(SETTING, { ...all(), [cluster]: { ...store(), ...patch } }); seen = mark(); };
  const save = patch => { write(patch); loading = load(); onRun(patch); ctx.update(); };
  const read = kindName => data.get('resources', { cluster, ns: '_all', kind: kindName });
  /* namespace만 골라도 Pod를 읽는다: Node(namespace 없음)의 이벤트·알림은 그 namespace의 Pod가 도는 Node만(R4-05) */
  const relKey = () => (related ? kinds()?.join(',') ?? (ns() ? 'pods' : null) : null);
  /** 고른 종류들의 관계 자료: 그 종류들의 행, Pod, 가운데 단계(ReplicaSet·Job). 하나라도 못 읽으면(권한·시간 초과) 빈 관계로 치지 않고 그 실패를 남긴다(RULE-STATE) */
  async function load() {
    const k = related ? kinds() ?? [] : [], key = relKey();
    if (!key) { rel = { key: null, ready: true, data: {}, error: null }; return; }
    if (rel.key === key && !rel.error) return;
    const mine = ++seq; rel = { key, ready: false, data: {}, error: null };
    const need = [...new Set([...k, 'pods', ...k.map(p => MIDDLE[p]).filter(Boolean)])];
    let error = null;
    const lists = Object.fromEntries(await Promise.all(need.map(async p => [p, await read(p).then(v => v || [], e => { error ??= e; return []; })])));
    if (mine !== seq || !alive()) return;
    rel = { key, ready: true, error, data: { objects: Object.fromEntries(k.map(p => [p, lists[p]])), pods: lists.pods, replicasets: lists.replicasets ?? [], jobs: lists.jobs ?? [] } };
    ctx.update();
  }
  /* 설정(wake.scope)은 페이지가 연 뒤에 셸이나 다른 탭에서 올 수 있다: 그릴 때 범위의 종류가 읽은 관계와 다르면 다시 읽고, 바뀐 범위는 페이지에 알린다(자기 쓰기와 같은 onRun) */
  const sync = () => {
    if (relKey() !== rel.key) loading = load();
    const now = mark();
    if (seen && Object.keys(now).some(key => now[key] !== seen[key])) {
      const patch = Object.fromEntries(Object.keys(now).filter(key => now[key] !== seen[key]).map(key => [key, key === 'q' ? store().q : store()[key]]));
      queueMicrotask(() => { if (alive()) onRun(patch); });
    }
    seen = now;
  };
  /** 처음 한 번: namespace 목록(고르기 메뉴의 행)과 지금 범위의 관계 */
  async function init() {
    void data.get('namespaces', { cluster }).then(v => { namespaces = v || []; namespaceError = null; if (alive()) ctx.update(); }, e => { namespaceError = e; if (alive()) ctx.update(); });
    seen ??= mark(); loading = load(); await loading;
  }
  /** 메뉴의 수: 메뉴를 처음 열 때 한 번 종류 읽기(종류마다 수와 namespace별 수). 못 읽으면 수 없이 이름만 두고 메뉴에 그 원인을 적는다(0으로 채우지 않음) */
  const counts = () => {
    counting ??= data.get('kinds', { cluster, ns: '_all' }).then(v => { counted = (v || []).flatMap(g => g.items || []); }, e => { countError = e; });
    return counted;
  };
  /* 읽기 실패의 원인 낱말(권한 없음 · 시간 초과 · 그 밖의 읽기 실패) */
  const reasonOf = e => t(Number(e?.status) === 403 || e?.kind === 'forbidden' ? 'wake.flow.c.forbidden' : e?.kind === 'timeout' ? 'wake.flow.c.timeout' : 'wake.find.c.read');
  /** 주소가 이름 붙인 범위(홈의 수에서 연 리소스 목록: 종류, namespace)를 받는다. 글은 그대로 */
  const adopt = ({ kind: k, ns: n } = {}) => {
    const next = { ...(k !== undefined && KIND_OF[k] ? { kinds: [k] } : {}), ...(n !== undefined ? { ns: n } : {}) };
    if (Object.entries(next).some(([key, v]) => JSON.stringify(store()[key] ?? null) !== JSON.stringify(v))) write(next);
    loading = load(); return loading;
  };
  const nsAll = () => [...new Set([...(namespaces ?? []), ...(ns() ?? [])])].sort();
  /* 고르기 단추의 이름: 전체나 없음은 칸 이름, 하나는 그 이름, 여럿은 첫 이름과 나머지 수 */
  const pickLabel = (list, total, field, nameOf = x => x) => (!list || list.length >= total ? field : list.length === 1 ? nameOf(list[0]) : t('wake.scope.more', { name: nameOf(list[0]), n: list.length - 1 }));
  /** 상자 한 줄(종류 · namespace · 글 · 실행)과, 기간이 있는 화면이면 바로 아래 제 줄의 기간 */
  const render = ({ range = '' } = {}) => {
    const k = kinds();
    const tools = html`${C.toolbarButton.render({ icon: k?.length === 1 ? KIND_OF[k[0]].icon : 'k8s-deployment', label: pickLabel(k, pickable().length, t('wake.scope.allKinds'), kindName), menu: 'wake.scope.kindMenu', tip: t('wake.scope.kind') })}${C.toolbarButton.render({ icon: 'k8s-namespace', label: pickLabel(ns(), namespaces ? nsAll().length : Infinity, t('wake.list.allNs')), menu: 'wake.scope.nsMenu', tip: 'namespace' })}`;
    return html`${C.composer.render({ id: 'wake-scope', variant: 'wide', placeholder: t(`wake.scope.ph.${section}`), run: t('wake.scope.run'), tools, value: text() })}${range}`;
  };
  const on = () => !!(kinds() || ns() || text().trim());
  /** 범위와 상관없이 클러스터 전체를 읽는 묶음(홈의 지표 줄) 위에 한 번 그렇다고 말하는 글: 범위가 있을 때만 */
  const clusterNote = () => (on() ? C.value.render({ text: t('wake.scope.cluster'), size: 'xs' }) : '');
  /** 두 고르기의 같은 메뉴: 검색, 세 상태 "전체", 체크 · 아이콘 · 이름 · 수. 수가 아직이면 읽는 중 줄을 두고 다 오면 다시 그린다. 못 읽었으면 같은 자리에 그 원인 줄 */
  const pickMenu = (key, value, options, action, error = countError) => {
    const def = C.select.menuDef({ key, multi: true, boxes: true, bulk: true, search: true, value, options, action });
    const line = error ? { id: 'failed', label: reasonOf(error), lead: C.statusIcon.render({ kind: Number(error?.status) === 403 || error?.kind === 'forbidden' ? 'perm' : 'error' }), disabled: true }
      : counted ? null : { id: 'busy', label: 'wake.res.loading', lead: C.statusIcon.render({ kind: 'busy' }), disabled: true };
    return !line ? def : { ...def, ...(line.id === 'busy' ? { pending: counting } : {}), items: [...def.items.slice(0, 2), line, ...def.items.slice(2)] };
  };
  /* 메뉴의 체크: 저장된 고른 것, 거르지 않으면(null · 이전의 빈 목록) 전부 */
  const shown = (key, every) => (stored(key)?.length ? stored(key) : every);
  return {
    init, adopt, render, clusterNote, on, kinds, ns, text,
    /** 종류를 꼭 하나 골랐을 때 그 종류(그 종류의 열로 보이는 목록) */
    kind: () => (kinds()?.length === 1 ? kinds()[0] : null),
    /** 지금 범위의 관계를 다 읽은 뒤 */
    loaded: () => loading,
    q: () => text().trim().toLowerCase(),
    /** 종류의 관계를 아직 읽는 중(그 동안 목록은 뼈대) */
    wait: () => { sync(); return !!relKey() && !rel.ready; },
    /** 지금 범위의 관계를 읽지 못한 원인(오류 객체, 없으면 null): 화면은 빈 범위 대신 이 실패를 보인다. 다시 읽기는 retry() */
    failure: () => (sync(), relKey() && rel.ready && rel.key === relKey() ? rel.error : null),
    retry: () => { if (rel.error) { rel = { ...rel, key: null }; loading = load(); } return loading; },
    /* 같은 범위(종류 · namespace)와 같은 관계 자료면 같은 관계: 행마다 부르는 화면(네트워크 · GitOps · 리소스)이 다시 계산하지 않는다 */
    relation: () => { sync(); const scope = { kinds: kinds(), ns: ns() }, key = JSON.stringify(scope), source = rel.ready && rel.key === relKey() ? rel.data : null;
      if (relSeen?.key !== key || relSeen.source !== source) relSeen = { key, source, value: scopeRelation(scope, source ?? {}) };
      return relSeen.value; },
    menus: {
      'wake.scope.kindMenu': () => { const items = counts(), n = items && scopeCounts(items, { kinds: kinds(), ns: ns() }).kind;
        const def = pickMenu('kinds', shown('kinds', pickable()), pickable().map(p => ({ id: p, icon: KIND_OF[p].icon, label: { raw: [kindName(p), n?.[p] != null ? num(n[p]) : ''].filter(Boolean).join(' · ') } })), 'wake.scope.kinds');
        /* 읽을 수 없는 종류는 끝에 자물쇠와 이유만(체크도 "전체"도 아님) */
        const locked = ALL_KINDS.filter(denied).map(p => ({ id: p, icon: 'lock', label: { raw: `${kindName(p)} · ${t('wake.rv.noPerm')}` }, disabled: true }));
        return { ...def, items: [...def.items, ...locked] }; },
      'wake.scope.nsMenu': () => { const items = counts(), n = items && scopeCounts(items, { kinds: kinds(), ns: ns() }).ns;
        return pickMenu('ns', shown('ns', nsAll()), nsAll().map(x => ({ id: x, icon: 'k8s-namespace', label: { raw: n ? `${x} · ${num(n[x] ?? 0)}` : x } })), 'wake.scope.ns', namespaceError ?? countError); },
    },
    actions: {
      /* 글은 실행할 때(Enter·실행 단추) 이 화면의 것으로만 */
      'kit.composer.send': a => { if (a?.id === 'wake-scope') save({ q: { ...(store().q || {}), [section]: String(a.text ?? '') } }); },
      /* 종류 여럿: 관계는 고른 종류들의 합집합 */
      'wake.scope.kinds': a => save({ kinds: multiPick(kinds(), pickable(), a) }),
      'wake.scope.ns': a => save({ ns: multiPick(ns(), nsAll(), a) }),
    },
  };
}
