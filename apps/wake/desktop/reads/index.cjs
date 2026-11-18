/*
 * 허브 읽기 서비스(관문 2): 화면 자료 키가 부르는 메인 프로세스 서비스를 한곳에서 만든다(services.cjs가 이름만 등록).
 *   metrics.range, metrics.usage(metrics.cjs) · alerts.read, alerts.expr(alerts.cjs) · network.read(network.cjs)
 *   events.read(events.cjs) · logs.levels(log-levels.cjs) · hub.sources, tool.checks(source-checks.cjs)
 * hub.sources는 확인 기한이 지난 출처를 확인한 뒤 최신 상태를 반환하며 데이터 성공 시각은 바꾸지 않는다.
 * 주기 수집은 release(연결 해제)·close(종료)로 멈춘다.
 * 도구(Prometheus, Alertmanager, Loki)는 tools.cjs가 찾은 클러스터 안 Service로 Kubernetes API 포트 포워딩해 읽는다(주소를 적어 두지 않음).
 * 모든 응답은 실패를 던지지 않고 { error: 코드, source }로 돌려준다(IPC가 오류 종류를 잃지 않게). 연결 안 됨은 error 'unconfigured'.
 * 기록(허브 저장소 hub-store.cjs): 알림 수신 이력 90일, 이벤트 7일, 출처 확인 7일. 처음 읽은 클러스터는 알림 1분, 이벤트 5분마다 받아 둔다.
 */
const { createHubStore } = require('../hub-store.cjs');
const { createSourceStates, errorCode } = require('./source-checks.cjs');
const { createMetrics } = require('./metrics.cjs');
const { createAlerts } = require('./alerts.cjs');
const { createNetwork } = require('./network.cjs');
const { createEvents } = require('./events.cjs');
const { createLogLevels } = require('./log-levels.cjs');
const { createClusterReads } = require('./cluster.cjs');

const fail = (kind, extra = {}) => Object.assign(new Error('hub read ' + kind), { kind, ...extra });
/* 도구 응답 확인 경로(tools.cjs 허용 목록 안): 도구 상세의 연결 확인 */
const PROBE = { prometheus: '/api/v1/status/buildinfo', alertmanager: '/api/v2/status', loki: '/ready', tempo: '/ready' };
const POLL = { alerts: 60_000, events: 300_000 };
const PRUNE_MS = 86_400_000;
/* 주기 수집이 읽는 출처(출처 상태의 collectionIntervalMs): 알림 읽기는 Prometheus 규칙과 Alertmanager, 이벤트 읽기는 Kubernetes API */
const POLLED = { alerts: ['prometheus', 'alertmanager'], events: ['kubernetes'] };
/* hub.sources가 확인하는 출처: 마지막 시도가 이보다 오래됐거나 없으면 그 출처에 가벼운 GET 하나 */
const RECHECK_MS = 60_000;
const ARGO_PROBE = '/apis/argoproj.io/v1alpha1/applications?limit=1';
/* hub.sources가 확인하는 출처 */
const HUB_SOURCES = ['prometheus', 'alertmanager', 'loki', 'kubernetes', 'argocd'];

/** targetOf(id, source) -> { uid, ref } | { reason }: 출처의 대상 identity(services.cjs가 찾은 Service, 클러스터는 kube-system Namespace) */
/** liveEvents(id, ns) -> 공유 watch 캐시의 지금 이벤트 | null(kube-watch.cjs): 있으면 이벤트 읽기가 API 서버에 다시 묻지 않는다 */
function createHubReads({ userData, client, toolQuery, maskText, now = Date.now, targetOf = async () => ({ reason: 'unsupported' }), liveEvents = () => null, cached = () => null, liveWatch = () => false }) {
  /* 저장소와 읽기 묶음은 처음 부를 때 만든다(앱을 켜기만 해서는 userData에 아무것도 쓰지 않음) */
  let built = null;
  const hub = () => (built ??= build());
  function build() {
    const store = createHubStore({ userData, maskText, now });
    const logs = { alerts: store.log('alert-history'), events: store.log('events'), checks: store.log('source-checks') };
    /* 보관 정리(파일 전체를 다시 씀)는 하루 한 번: 처음 만들 때와 그 뒤 PRUNE_MS마다 */
    let prunedAt = -Infinity;
    const prune = () => { if (now() - prunedAt < PRUNE_MS) return; prunedAt = now(); for (const log of Object.values(logs)) { try { log.prune(); } catch { /* 다음 정리 때 다시 */ } } };
    prune();
    const sources = createSourceStates({ log: logs.checks, now });

    /* 도구 하나에 GET 하나: 응답 본문(JSON)의 data, Alertmanager는 본문 그대로 */
    async function tool(id, kind, path, params = {}, { json = true, probe = false } = {}) {
      /* Grafana는 출처 상태 칸이 없는 보조 읽기(대시보드 찾기): 상태를 남기지 않고 읽는다 */
      const track = kind === 'grafana' ? (_id, _kind, fn) => fn() : sources.track;
      return track(id, kind, async () => {
        const route = path + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '');
        const r = await toolQuery(id, kind, route, AbortSignal.timeout(20_000));
        if (r?.error) throw fail(r.error === 'unconfigured' ? 'unconfigured' : r.error === 'target' ? 'target' : 'connection', { source: kind });
        if (r.status !== 200) throw fail(r.status === 401 || r.status === 403 ? 'forbidden' : 'http_' + r.status, { source: kind });
        if (r.truncated) throw fail('response_too_large', { source: kind });
        if (!json) return r.body;
        let body;
        try { body = JSON.parse(r.body); } catch { throw fail('invalid_response', { source: kind }); }
        if (kind === 'alertmanager' || kind === 'grafana') return body;
        if (body?.status !== 'success') throw fail('query_failed', { source: kind });
        return body.data;
      }, { probe });
    }
    const prom = (id, path, params) => tool(id, 'prometheus', path, params);
    const k8s = (id, fn) => sources.track(id, 'kubernetes', fn);
    const metrics = createMetrics({ prom, now });
    const alerts = createAlerts({ log: logs.alerts, prom, alertmanager: (id, path, params) => tool(id, 'alertmanager', path, params), now });
    /* 보관 기간 읽기는 출처 상태(데이터 신선도)를 바꾸지 않는다: 이 경로가 없는 Prometheus도 연결은 그대로 */
    const runtimeInfo = async id => { const r = await toolQuery(id, 'prometheus', '/api/v1/status/runtimeinfo', AbortSignal.timeout(5_000));
      if (r?.status !== 200 || r.truncated) return null; try { return JSON.parse(r.body)?.data ?? null; } catch { return null; } };
    const network = createNetwork({ prom, now, runtimeInfo, listSlices: id => k8s(id, async () => (await client(id).request('GET', '/apis/discovery.k8s.io/v1/endpointslices?limit=2000')).items ?? []) });
    const events = createEvents({ log: logs.events, client, now, live: (id, ns) => liveEvents(id, ns || '_all') });
    const levels = createLogLevels({ loki: (id, path, params) => tool(id, 'loki', path, params), now });
    /* 인시던트 허브와 AI 도구 층(hub.cjs)도 같은 tool·같은 출처 상태로 읽는다(12.1) */
    const cluster = createClusterReads({ client, k8s, tool, sources, cached });
    return { sources, prune, k8s, tool, metrics, alerts, network, events, levels, cluster };
  }

  /* 처음 읽은 클러스터는 화면이 닫혀 있어도 알림·이벤트를 받아 둔다(앱이 켜져 있는 동안) */
  const timers = new Map();
  function watch(id, what, run) {
    const key = JSON.stringify([id, what]);
    if (timers.has(key)) return;
    const timer = setInterval(() => { run().catch(() => {}); if (what === 'events') hub().prune(); }, POLL[what]);
    timer.unref?.(); timers.set(key, timer);
    for (const source of POLLED[what]) hub().sources.interval(id, source, POLL[what]);
  }
  /** 클러스터 하나의 주기 수집을 멈추고 그 출처 상태를 잊는다(연결 해제, kubeconfig에서 사라짐) */
  function release(id) {
    for (const [key, timer] of timers) if (JSON.parse(key)[0] === id) { clearInterval(timer); timers.delete(key); }
    built?.sources.forget(id);
  }
  /* 연결 확인: 마지막 시도가 RECHECK_MS보다 오래된 출처만. 연결 확인(probe)은 데이터 신선도(lastSuccessAt)를 바꾸지 않는다.
     확인할 때 대상 identity도 다시 찾는다(클러스터를 다시 만들거나 같은 이름으로 바꾸면 UID가 달라짐). 실패는 출처 상태에 남고 여기서는 삼킨다 */
  async function probe(id, { refresh = false } = {}) {
    const due = source => { const at = hub().sources.attemptedAt(id, source); return refresh || at === null || now() - at >= RECHECK_MS; };
    /* 살아 있는 공유 watch(liveWatch)가 그 출처의 응답을 이미 보이고 있으면 확인 요청을 보내지 않는다(Kubernetes: 그 클러스터의 준비된 watch, Argo CD: Application watch) */
    const checkK8s = route => hub().sources.track(id, 'kubernetes', () => (liveWatch(id, 'kubernetes') ? true : client(id).request('GET', route)), { probe: true });
    const resolve = source => targetOf(id, source).then(t => hub().sources.target(id, source, t), () => hub().sources.target(id, source, { reason: 'lookup_failed' }));
    const sourcesDue = HUB_SOURCES.filter(due);
    /* 대상을 먼저 찾는다(확인할 때와, 아직 찾지 못한 출처면 데이터 읽기가 막 있었어도). 확인 결과는 그 대상의 것으로 남아야 한다 */
    await Promise.all(HUB_SOURCES.filter(source => sourcesDue.includes(source) || !hub().sources.state(id, source).target).map(resolve));
    await Promise.all([
      ...['prometheus', 'alertmanager', 'loki'].filter(k => sourcesDue.includes(k)).map(kind => hub().tool(id, kind, PROBE[kind], {}, { json: false, probe: true }).catch(() => {})),
      sourcesDue.includes('kubernetes') ? checkK8s('/version').catch(() => {}) : null,
      sourcesDue.includes('argocd') ? hub().sources.track(id, 'argocd', () => liveWatch(id, 'argocd') ? true : client(id).request('GET', ARGO_PROBE).catch(e => { throw e?.status === 404 ? Object.assign(e, { kind: 'unconfigured' }) : e; }), { probe: true }).catch(() => {}) : null,
    ]);
  }
  /* 서비스 응답: 실패는 { error, source } */
  const answer = (source, fn) => async (args = {}) => {
    if (!args || typeof args !== 'object' || typeof args.id !== 'string' || !args.id) return { error: 'invalid_request', source };
    try { return await fn(args); }
    catch (error) { return { error: error?.kind === 'unconfigured' ? 'unconfigured' : errorCode(error), source: error?.source || source, ...(error?.status ? { status: error.status } : {}) }; }
  };
  const withSource = (id, source, value) => ({ ...value, sourceState: hub().sources.state(id, source) });
  return {
    'metrics.range': answer('prometheus', async a => withSource(a.id, 'prometheus', await hub().metrics.range(a))),
    'metrics.usage': answer('prometheus', async a => withSource(a.id, 'prometheus', await hub().metrics.usage(a))),
    'alerts.read': answer('alertmanager', async a => { watch(a.id, 'alerts', () => hub().alerts.read({ id: a.id }));
      return { ...(await hub().alerts.read(a)), sources: { prometheus: hub().sources.state(a.id, 'prometheus'), alertmanager: hub().sources.state(a.id, 'alertmanager') } }; }),
    'alerts.expr': answer('prometheus', async a => withSource(a.id, 'prometheus', await hub().alerts.expr(a))),
    'network.read': answer('prometheus', async a => withSource(a.id, 'prometheus', await hub().network(a))),
    'events.read': answer('kubernetes', async a => { watch(a.id, 'events', () => hub().k8s(a.id, () => hub().events.capture(a.id, '')));
      return withSource(a.id, 'kubernetes', await hub().k8s(a.id, () => hub().events.read(a))); }),
    'logs.levels': answer('loki', async a => withSource(a.id, 'loki', await hub().levels(a))),
    'hub.sources': answer('kubernetes', async a => {
      await probe(a.id, { refresh: a.refresh === true });
      return { at: new Date(now()).toISOString(), sources: hub().sources.states(a.id) };
    }),
    'tool.checks': answer('tool', async a => {
      if (!Object.hasOwn(PROBE, a.kind)) return { at: new Date(now()).toISOString(), samples: [], errors: [], probe: false };
      await hub().tool(a.id, a.kind, PROBE[a.kind], {}, { json: false, probe: true }).catch(() => {});
      return { ...hub().sources.checks(a.id, a.kind), state: hub().sources.state(a.id, a.kind), probe: true };
    }),
    /** 같은 읽기 층(reads/cluster.cjs): 허브가 인시던트 감지·작업면·도구 층에 쓴다 */
    cluster: () => hub().cluster,
    /** 공유 watch가 받은 이벤트 변화를 7일 보관에 남긴다(바뀐 것만) */
    recordEvents: (id, items) => hub().events.record(id, items),
    /** 다른 서비스(gitops.read)가 같은 출처 상태를 남기며 읽을 때 */
    track: (id, source, fn) => hub().sources.track(id, source, fn),
    release,
    /** 주기 수집 중인 클러스터 id */
    watching: () => [...new Set([...timers.keys()].map(key => JSON.parse(key)[0]))],
    close() { for (const timer of timers.values()) clearInterval(timer); timers.clear(); },
  };
}

module.exports = { createHubReads };
