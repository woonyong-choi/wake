/*
 * 셸 쪽 실시간 상태: kubeconfig에서 읽은 context, 연결 확인 결과, 상태 갱신(AI·도구·알림 연결은 connect-flow.js의 연결 흐름).
 * 데스크톱은 메인 프로세스 서비스(desktop/services.cjs)를 부른다. 서비스 호스트가 없는 실행(브라우저)은 context가 없고 확인은 거절된다.
 * 상태 갱신 계기: kubeconfig 파일 바뀜, 네트워크 다시 연결, 창으로 돌아옴, 주기(설정 wake.cluster.refresh 초, 가장 짧아도 2분, 숨은 창은 다시 보일 때), 카드별 다시 확인.
 * 결과는 설정 저장소(wake.clusters.list)에 남겨 사이드바와 탭 페이지가 같은 값을 읽는다.
 */
import { service, onService, hasService } from '../../../kit/page/index.js';
import { ACTIONS, LIMITS } from './connect-flow.js';


/* 확인 결과 -> 묶음: 연결됨 / 확인 필요(내 컴퓨터·네트워크·설정에서 볼 것) / 권한 필요(내 자격에 클러스터 권한이 없음: 그 클러스터를 관리하는 사람이
   권한을 주면 풀림). 이 표 하나만 쓴다(live.test.mjs가 고정) */
export const GROUP_OF = {
  ok: 'ok',
  noAuthTool: 'check', needs_consent: 'check', unreachable: 'check', unauthorized: 'check', unknown: 'check', config: 'check', timeout: 'check', cert: 'check', unsupported: 'check',
  forbidden: 'perm',
};
export const GROUPS = [{ id: 'ok', label: 'wake.fr.grp.ok', mark: 'ok' }, { id: 'check', label: 'wake.fr.grp.check', mark: 'check' }, { id: 'perm', label: 'wake.fr.grp.perm', mark: 'perm' }];
/* 상태 아이콘 종류(kit status-icon): 내가 할 일(설치·로그인·파일)은 fix(주황), 실패는 error(빨강), 권한은 perm(중립) */
const KIND_OF = { ok: 'ok', noAuthTool: 'fix', needs_consent: 'fix', unauthorized: 'fix', config: 'fix', unreachable: 'error', timeout: 'error', unknown: 'error', cert: 'error', unsupported: 'error', forbidden: 'perm' };
const INSTALL = { 'gke-gcloud-auth-plugin': 'gcloud components install gke-gcloud-auth-plugin', aws: 'brew install awscli', 'aws-iam-authenticator': 'brew install aws-iam-authenticator', kubelogin: 'brew install Azure/kubelogin/kubelogin', 'oidc-login': 'kubectl krew install oidc-login', 'kubectl-oidc_login': 'kubectl krew install oidc-login' };
/* 공급자마다 브라우저로 다시 로그인하는 명령 */
const LOGIN = { eks: 'aws sso login', gke: 'gcloud auth login', aks: 'az login' };
export function cardOf(ctx, r) {
  const group = GROUP_OF[r.state] || 'self';
  /* 줄의 버튼은 연결 흐름의 같은 동작과 같은 모양(이름과 아이콘: ACTIONS) */
  const ICON = Object.fromEntries(Object.values(ACTIONS).map(a => [a.label, a.icon]));
  const act = (label, action, arg) => ({ label, action, arg, icon: ICON[label] });
  const again = act('wake.flow.a.retry', 'wake.cluster.recheck', { id: ctx.id });
  const actions = {
    ok: null,
    /* 설치·다시 로그인: 누르면 아래 터미널에서 실행하고 끝나면 이 줄을 다시 확인(connect-flow.js) */
    /* 설치 명령을 아는 도구만 설치(모르는 도구는 설치 뒤 다시 확인) */
    noAuthTool: INSTALL[String(r.command || '').split('/').pop()] ? act('wake.flow.a.install', 'wake.flow.ctxRun', { id: ctx.id, command: INSTALL[String(r.command || '').split('/').pop()] }) : again,
    /* kubeconfig의 exec 인증 명령을 처음 쓸 때: 그 명령(실제 경로와 인자)을 보고 허락하는 대화상자(허락은 셸만 기록, services kube.execConsent) */
    needs_consent: { label: 'wake.exec.review', action: 'wake.exec.review', arg: { id: ctx.id }, icon: 'shield-check' },
    unreachable: again,
    timeout: again,
    unauthorized: ctx.authKind === 'exec' && LOGIN[ctx.provider] ? act('wake.flow.a.login', 'wake.flow.ctxRun', { id: ctx.id, command: LOGIN[ctx.provider], step: 'authn' }) : again,
    unknown: again,
    config: ctx.file ? act('wake.chk.openFile', 'wake.kube.openFile', { path: ctx.file }) : again,
    cert: again,
    unsupported: again,
    /* 권한: 필요한 권한(실제로 막힌 동사·리소스·namespace에서 만든 명령)을 보고, 그 뒤 권한이 생기면 자동으로 연결 */
    forbidden: act('wake.flow.a.perm', 'wake.cluster.needPerm', { id: ctx.id }),
  };
  const action = r.state in actions ? actions[r.state] : again;
  const ver = (r.version || '').replace(/^(v\d+\.\d+).*/, '$1');
  const desc = r.state === 'ok' ? (r.nodes != null ? { key: 'wake.chk.desc.okNodes', vars: { version: ver, n: r.nodes } } : { raw: ver }) : { key: 'wake.chk.desc.' + r.state, vars: { ns: r.namespace || 'default', command: String(r.command || '').split('/').pop(), version: ver } };
  return { group, kind: KIND_OF[r.state] || 'error', desc, action }; // 원문 오류는 멈춘 연결 행 아래 출력으로만
}


const catalogReads = new WeakMap();
const displayText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1024 && !/[\x00-\x1f\x7f]/.test(value);

/** 표시 메타는 등록 context와 현재 server에만 결속하며 연결 식별자를 바꾸지 않는다. */
export function clusterMetadata(context, catalog) {
  if (catalog?.status !== 'ok') return null;
  const candidates = (Array.isArray(catalog.connections) ? catalog.connections : []).filter(c => c?.status === 'configured' && c.identity?.cluster === context.id);
  if (!candidates.length || candidates.some(c => !['clusterName', 'projectId', 'location', 'source'].every(k => displayText(c.identity[k])))) return null;
  const tuples = candidates.map(c => JSON.stringify(['clusterName', 'projectId', 'location', 'source'].map(k => c.identity[k])));
  if (new Set(tuples).size !== 1) return null;
  const { clusterName, projectId, location, source } = candidates[0].identity;
  return { contextId: context.id, server: context.server || '', clusterName, projectId, location, source };
}

/** 이름과 접속주소만 투영한다. 원 context/server는 조회·주소·복사에 그대로 쓴다. */
export function clusterPresentation(context) {
  const metadata = context.presentation;
  const bound = metadata && metadata.contextId === context.id && metadata.server === (context.server || '')
    && ['clusterName', 'projectId', 'location', 'source'].every(k => displayText(metadata[k]));
  let endpoint = '';
  /* 주소가 없거나 URL이 아니면 접속주소 없음(던지지 않음: 페이지 예외 기록에 남지 않게) */
  const url = typeof context.server === 'string' && URL.canParse(context.server) ? new URL(context.server) : null;
  if (url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
    const ip = url.hostname.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname);
    endpoint = ip ? `${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}` : url.host;
  }
  return { name: bound ? metadata.clusterName : context.id, endpoint, originalContext: context.ctx || context.id,
    discriminator: bound ? [metadata.projectId, metadata.location].join(' · ') : '' };
}

/** 같은 문서의 동시 표시 조회만 합친다. 지표 조회·영구 cache·외부 호출은 하지 않는다. */
export function readClusterCatalog(call = service) {
  if (catalogReads.has(call)) return catalogReads.get(call);
  let timer;
  const pending = Promise.race([
    Promise.resolve().then(() => call('observability.catalog')).catch(() => null),
    new Promise(resolve => { timer = setTimeout(() => resolve(null), LIMITS.quietMs); }),
  ]).finally(() => { clearTimeout(timer); if (catalogReads.get(call) === pending) catalogReads.delete(call); });
  catalogReads.set(call, pending);
  return pending;
}

/* 연결 상태를 시계로 다시 확인하는 가장 짧은 간격(초)과 창으로 돌아올 때의 최소 간격: 읽기가 도는 동안은 화면의 읽기 결과가 상태를 말한다 */
const CHECK_EVERY_S = 120, FOCUS_GAP_MS = 60_000;
export const checkEverySeconds = setting => Math.max(CHECK_EVERY_S, +setting || CHECK_EVERY_S);
export function createLive() {
  const st = { kube: null, results: {}, started: false, api: null };
  const desktop = hasService();
  const redraw = () => { st.api?.firstRun.render(); };

  let readSequence = 0;
  async function readKube() {
    const sequence = ++readSequence;
    const catalog = desktop ? readClusterCatalog() : Promise.resolve(null);
    const kube = desktop ? await service('kube.read').catch(e => ({ contexts: [], files: [], paths: [], error: String(e.message) })) : { contexts: [], files: [], paths: [], unsupported: true };
    if (sequence !== readSequence) return kube;
    st.kube = { ...kube, contexts: (kube.contexts || []).map(c => ({ ...c, presentation: null })) };
    /* 연결 설정 파일을 읽지 못함(kube.read connections): 설정 › 클러스터가 그 줄과 고치는 길을 그리도록 알림. 다시 읽혀 괜찮아지면 지움 */
    const fileError = kube.connections?.state === 'error' ? { state: 'error', code: kube.connections.code, repair: kube.connections.repair } : null;
    if (st.api && JSON.stringify(st.api.settings.get('wake.kube.connections') ?? null) !== JSON.stringify(fileError)) st.api.setSetting('wake.kube.connections', fileError);
    void catalog.then(value => {
      if (sequence !== readSequence) return;
      st.kube = { ...kube, contexts: (kube.contexts || []).map(c => ({ ...c, presentation: clusterMetadata(c, value) })) };
      const api = st.api, list = api?.settings.get('wake.clusters.list');
      if (Array.isArray(list)) api.setSetting('wake.clusters.list', list.map(c => {
        const current = st.kube.contexts.find(item => item.id === c.id && (item.server || '') === (c.server || ''));
        return { ...c, presentation: current?.presentation || null };
      }));
      redraw();
    });
    redraw();
    return st.kube;
  }
  const probes = new Map();
  const appliedProbes = new Map();
  let probeSequence = 0;
  async function requestProbe(id, isCurrent = () => true) {
    const sequence = ++probeSequence;
    const pending = probes.get(id) || new Map();
    probes.set(id, pending);
    pending.set(sequence, isCurrent);
    const current = () => isCurrent() && sequence >= (appliedProbes.get(id) || 0)
      && ![...(probes.get(id) || [])].some(([newer, eligible]) => newer > sequence && eligible());
    let result;
    try {
      if (!desktop) throw new Error('no service host');
      result = await service('kube.probe', { id });
    } catch (e) { result = { state: e.kind || 'unknown', error: String(e.message || e), checkedAt: new Date().toISOString() }; }
    const accepted = current();
    if (accepted) { st.results[id] = result; appliedProbes.set(id, sequence); }
    pending.delete(sequence);
    if (!pending.size) probes.delete(id);
    return { result, current: () => accepted && current() };
  }
  async function probe(id, isCurrent = () => true) {
    if (!desktop) throw new Error('no service host');
    return (await requestProbe(id, isCurrent)).result;
  }
  function saveIdentity(api, id, result) {
    const records = api.settings.get('wake.connections') || {};
    if (!records[id] || !Object.hasOwn(result, 'identity')) return;
    api.setSetting('wake.connections', { ...records, [id]: { ...records[id], identity: result.identity, identityError: result.identityError || null } });
  }
  /* 앱 전체 상태 갱신: 연결된 클러스터를 다시 확인해 저장소에 남김 */
  let busy = false;
  async function refresh(api) {
    if (busy || api.firstRun.active()) return;
    const list = api.settings.get('wake.clusters.list'); if (!list?.length) return;
    busy = true;
    try {
      if (desktop) await readKube();
      /* 공급자(로고)는 저장한 값이 아니라 지금 kubeconfig에서 다시 판별한 값 */
      const prov = id => st.kube?.contexts.find(x => x.id === id)?.provider;
      for (const { id } of list) {
        const { result: r, current } = await requestProbe(id);
        if (!current()) continue;
        const saved = api.settings.get('wake.clusters.list') || [];
        api.setSetting('wake.clusters.list', saved.map(c => c.id === id ? { ...c, provider: prov(id) || c.provider, infrastructure: st.kube?.contexts.find(item => item.id === id)?.infrastructure || c.infrastructure, presentation: st.kube?.contexts.find(item => item.id === id)?.presentation || null, state: r.state, identity: Object.hasOwn(r, 'identity') ? r.identity : c.identity, identityError: Object.hasOwn(r, 'identity') ? r.identityError || null : c.identityError, version: r.version || c.version, user: r.username || c.user || '', checkedAt: r.checkedAt } : c));
        saveIdentity(api, id, r);
        api.setSetting('wake.clusters.checkedAt', new Date().toISOString());
      }
    } finally { busy = false; }
  }
  /* 줄 몇 개만 다시 확인(설정 › 클러스터의 다시 확인): 그 줄의 단계가 확인을 따라 채워지고, 결과를 저장소에 남김 */
  async function recheck(api, ids, flows) {
    for (const id of ids) {
      const { result: r, current } = await requestProbe(id);
      if (!current()) continue;
      flows.recheckDone(id, r);
      const list = api.settings.get('wake.clusters.list') || [];
      api.setSetting('wake.clusters.list', list.map(c => c.id === id ? { ...c, state: r.state, identity: Object.hasOwn(r, 'identity') ? r.identity : c.identity, identityError: Object.hasOwn(r, 'identity') ? r.identityError || null : c.identityError, version: r.version || c.version, checkedAt: r.checkedAt } : c));
      saveIdentity(api, id, r);
    }
  }
  function start(api) {
    if (st.started) return; st.started = true; st.api = api;
    readKube();
    if (desktop) onService((ev, p) => { if (ev === 'probe-step') st.onProbeStep?.(p); if (ev === 'kube-changed') { if (api.firstRun.active()) st.onKubeChanged?.(); else { readKube(); refresh(api); } } });
    /* 주기 확인은 쉬는 동안의 확인: 가장 짧아도 CHECK_EVERY_S(설정이 더 짧아도), 숨은 창은 시계로 확인하지 않고 다시 보일 때 한 번.
       다시 연결(online)은 바로, 창으로 돌아오면 마지막 확인이 FOCUS_GAP_MS보다 오래됐을 때 바로 */
    const win = globalThis.window, doc = globalThis.document;
    const run = () => { st.checkedAt = Date.now(); return refresh(api); };
    win?.addEventListener('online', () => run());
    win?.addEventListener('focus', () => { if (api.settings.get('wake.cluster.refreshOnFocus') !== false && Date.now() - (st.checkedAt || 0) > FOCUS_GAP_MS) run(); });
    doc?.addEventListener?.('visibilitychange', () => { if (!doc.hidden && st.missed) { st.missed = false; run(); } });
    const tick = () => { setTimeout(() => {
      if (api.settings.get('wake.cluster.autoRefresh') !== false) { if (doc?.hidden) st.missed = true; else run(); }
      tick();
    }, checkEverySeconds(api.settings.get('wake.cluster.refresh')) * 1000); };
    tick();
  }
  return { st, start, readKube, probe, refresh, recheck, desktop };
}
