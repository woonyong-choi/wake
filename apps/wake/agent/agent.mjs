/*
 * wake-agent: 클러스터 안 DaemonSet(Node마다 하나). 데스크톱 허브가 Kubernetes API로 직접 읽지 못하는 Node 안쪽 사실만 낸다.
 * - heartbeat: 5초마다 자기 Node 이름의 Lease(wake-system/wake-agent-<node>)를 갱신. 허브는 Lease를 읽어 Node별 수신 여부를 판단한다
 * - 이 Node에서 API 서버까지의 왕복 시간(Service 주소 경유: 이 Node의 Service 네트워크를 지남)과 클러스터 DNS 응답
 * - watch 캐시: 자기 Node와 그 Node에 놓인 Pod만 watch(읽기만). 캐시 크기, 초당 변화, 준비 안 된 Pod 수
 * - 지연 이력: 1분 칸 최댓값 6시간을 Lease 주석에 둔다(데스크톱이 꺼져 있던 동안도 남고, 빈 칸은 heartbeat가 없던 분)
 * 쓰는 것은 자기 Lease 하나뿐이다. Secret은 읽지 않는다(get·list·watch 권한 없음). 의존 패키지 없음(Node 표준 모듈만).
 */
import https from 'node:https';
import fs from 'node:fs';
import { lookup } from 'node:dns/promises';
import { pathToFileURL } from 'node:url';

export const VERSION = '0.1.0';
export const BEAT_MS = 5000;
export const LEASE_SECONDS = 15;
export const HISTORY_MINUTES = 360;
export const WATCH = ['Node', 'Pod'];
const RATE_WINDOW_MS = 60000;

const A = 'wake-agent/';
const SA = '/var/run/secrets/kubernetes.io/serviceaccount';

/** 지연 이력 "<첫 분(epoch 분)>|v,v,,v" <-> { start, values }(빈 값은 null) */
export function decodeHistory(text) {
  const m = /^(\d+)\|([0-9,]*)$/.exec(String(text ?? ''));
  if (!m) return { start: null, values: [] };
  return { start: Number(m[1]), values: m[2].split(',').map(v => (v === '' ? null : Number(v))) };
}
export const encodeHistory = h => (h.start == null ? '' : `${h.start}|${h.values.map(v => (v == null ? '' : v)).join(',')}`);
/** 이번 분(minute)에 지연 하나: 같은 분이면 최댓값, 건너뛴 분은 빈 칸, 6시간을 넘는 앞은 버린다 */
export function pushHistory(h, minute, ms) {
  let { start, values } = h.start == null ? { start: minute, values: [] } : { start: h.start, values: [...h.values] };
  const at = minute - start;
  if (at < 0) return h;
  if (at < values.length) values[at] = values[at] == null ? ms : Math.max(values[at], ms);
  else { while (values.length < at) values.push(null); values.push(ms); }
  const drop = Math.max(0, values.length - HISTORY_MINUTES);
  return { start: start + drop, values: values.slice(drop) };
}
/** Kubernetes MicroTime(마이크로초 6자리) */
export const microTime = ms => new Date(ms).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
/** 최근 1분 watch 변화 시각들 -> 초당 변화(소수 한 자리) */
export function ratePerSec(times, now) {
  const recent = times.filter(t => now - t <= RATE_WINDOW_MS);
  return { times: recent, rate: Math.round((recent.length / (RATE_WINDOW_MS / 1000)) * 10) / 10 };
}
/** Pod가 준비됐는지(끝난 Pod는 준비 대상이 아님) */
export const podReady = p => p?.status?.phase === 'Succeeded' || (p?.status?.conditions ?? []).some(c => c.type === 'Ready' && c.status === 'True');


/** 갱신할 Lease 본문 */
export function leaseBody({ name, namespace, node, pod, clusterId, owner, previous, now, apiMs, dnsMs, cache, history }) {
  const annotations = {
    [A + 'version']: VERSION, [A + 'node']: node, [A + 'watch']: WATCH.join(','),
    [A + 'api-ms']: apiMs == null ? '' : String(apiMs), [A + 'dns-ms']: dnsMs == null ? '' : String(dnsMs),
    [A + 'objects']: String(cache.objects), [A + 'changes-per-sec']: String(cache.rate),
    [A + 'pods']: String(cache.pods), [A + 'pods-not-ready']: String(cache.podsNotReady), [A + 'node-ready']: cache.nodeReady == null ? '' : String(cache.nodeReady),
    [A + 'history']: encodeHistory(history),
    ...(clusterId ? { [A + 'cluster-id']: clusterId } : {}),
  };
  const holderChanged = previous?.spec?.holderIdentity !== pod;
  return { apiVersion: 'coordination.k8s.io/v1', kind: 'Lease',
    metadata: { name, namespace, labels: { 'app.kubernetes.io/instance': 'wake-agent', 'app.kubernetes.io/component': 'heartbeat' }, annotations,
      ...(owner ? { ownerReferences: [owner] } : previous?.metadata?.ownerReferences ? { ownerReferences: previous.metadata.ownerReferences } : {}),
      ...(previous?.metadata?.resourceVersion ? { resourceVersion: previous.metadata.resourceVersion } : {}) },
    spec: { holderIdentity: pod, leaseDurationSeconds: LEASE_SECONDS, renewTime: microTime(now),
      acquireTime: holderChanged || !previous?.spec?.acquireTime ? microTime(now) : previous.spec.acquireTime,
      leaseTransitions: (previous?.spec?.leaseTransitions ?? 0) + (previous && holderChanged ? 1 : 0) } };
}

/* ---------- 실행(클러스터 안) ---------- */
function api() {
  const host = process.env.KUBERNETES_SERVICE_HOST, port = process.env.KUBERNETES_SERVICE_PORT_HTTPS || process.env.KUBERNETES_SERVICE_PORT || '443';
  if (!host) throw new Error('KUBERNETES_SERVICE_HOST is not set');
  const ca = fs.readFileSync(`${SA}/ca.crt`);
  const base = { hostname: host, port, ca, agent: new https.Agent({ keepAlive: true, ca }) };
  /* projected token은 바뀌므로 요청마다 다시 읽는다 */
  const headers = extra => ({ authorization: `Bearer ${fs.readFileSync(`${SA}/token`, 'utf8').trim()}`, accept: 'application/json', ...extra });
  function json(method, path, body) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const req = https.request({ ...base, method, path, timeout: 30000, headers: headers(payload ? { 'content-type': 'application/json' } : {}) }, res => {
        let text = ''; res.setEncoding('utf8'); res.on('data', c => { text += c; });
        res.on('end', () => { let value = null; try { value = text ? JSON.parse(text) : null; } catch { value = null; } resolve({ status: res.statusCode, body: value }); });
      });
      req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject);
      req.end(payload);
    });
  }
  /* watch 한 줄씩: onEvent({type, object}). 끝나면 resolve(마지막 resourceVersion), 410은 { gone: true } */
  function watch(path, onEvent) {
    return new Promise((resolve, reject) => {
      const req = https.request({ ...base, method: 'GET', path, headers: headers() }, res => {
        if (res.statusCode === 410) { res.resume(); resolve({ gone: true }); return; }
        if (res.statusCode !== 200) { res.resume(); reject(new Error(`watch ${res.statusCode}`)); return; }
        let buf = '', gone = false; res.setEncoding('utf8');
        res.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line) continue;
          let e; try { e = JSON.parse(line); } catch { continue; }
          if (e.type === 'ERROR') { gone = gone || e.object?.code === 410; continue; }
          onEvent(e); } });
        res.on('end', () => resolve({ gone })); res.on('error', reject);
      });
      req.on('error', reject); req.end();
    });
  }
  return { json, watch };
}

/** 한 종류의 list + watch를 계속(끊기면 마지막 resourceVersion부터, 410이면 다시 list). store: Map(uid -> 객체) */
async function keepWatching(k, path, store, onChange, log) {
  let rv = null;
  for (;;) {
    try {
      if (!rv) {
        const r = await k.json('GET', path);
        if (r.status !== 200) throw new Error(`list ${r.status}`);
        store.clear(); for (const o of r.body.items ?? []) store.set(o.metadata.uid, o);
        rv = r.body.metadata?.resourceVersion; onChange();
      }
      const sep = path.includes('?') ? '&' : '?';
      const r = await k.watch(`${path}${sep}watch=1&allowWatchBookmarks=true&timeoutSeconds=300&resourceVersion=${encodeURIComponent(rv)}`, e => {
        if (e.object?.metadata?.resourceVersion) rv = e.object.metadata.resourceVersion;
        if (e.type === 'BOOKMARK') return;
        if (e.type === 'DELETED') store.delete(e.object.metadata.uid); else store.set(e.object.metadata.uid, e.object);
        onChange();
      });
      if (r.gone) rv = null;
    } catch (error) { log('watch_error', { path: path.split('?')[0], error: error.message }); rv = null; await new Promise(r => setTimeout(r, 5000)); }
  }
}

async function main() {
  const node = process.env.NODE_NAME, pod = process.env.POD_NAME, namespace = process.env.POD_NAMESPACE, clusterId = process.env.WAKE_CLUSTER_ID || '';
  if (!node || !pod || !namespace) throw new Error('NODE_NAME, POD_NAME and POD_NAMESPACE are required');
  const log = (event, fields = {}) => process.stdout.write(JSON.stringify({ at: new Date().toISOString(), event, node, ...fields }) + '\n');
  const k = api(), name = `wake-agent-${node}`, leasePath = `/apis/coordination.k8s.io/v1/namespaces/${namespace}/leases`;
  const nodes = new Map(), pods = new Map(); let changes = [];
  const changed = () => { changes.push(Date.now()); };
  void keepWatching(k, `/api/v1/nodes?fieldSelector=${encodeURIComponent('metadata.name=' + node)}`, nodes, changed, log);
  void keepWatching(k, `/api/v1/pods?fieldSelector=${encodeURIComponent('spec.nodeName=' + node)}`, pods, changed, log);

  let previous = null, owner = null, history = { start: null, values: [] }, apiMs = null;
  const got = await k.json('GET', `${leasePath}/${name}`).catch(() => null);
  if (got?.status === 200) { previous = got.body; history = decodeHistory(got.body.metadata?.annotations?.[A + 'history']); }
  log('started', { version: VERSION, namespace, lease: name, history: history.values.length });

  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; log('stopping', { signal }); process.exit(0); });
  while (!stopping) {
    const began = Date.now();
    if (!owner) {
      const ds = await k.json('GET', `/apis/apps/v1/namespaces/${namespace}/daemonsets/wake-agent`).catch(() => null);
      if (ds?.status === 200 && ds.body?.metadata?.uid) owner = { apiVersion: 'apps/v1', kind: 'DaemonSet', name: 'wake-agent', uid: ds.body.metadata.uid };
    }
    let dnsMs = null;
    try { const t = Date.now(); await lookup('kubernetes.default.svc'); dnsMs = Date.now() - t; } catch (error) { log('dns_error', { error: error.code || error.message }); }
    const r = ratePerSec(changes, began); changes = r.times;
    const own = [...nodes.values()][0], ready = own ? (own.status?.conditions ?? []).find(c => c.type === 'Ready') : null;
    const podList = [...pods.values()].filter(p => !p.metadata?.deletionTimestamp);
    const cache = { objects: nodes.size + pods.size, rate: r.rate, pods: podList.length, podsNotReady: podList.filter(p => !podReady(p)).length, nodeReady: ready ? ready.status === 'True' : null };
    if (apiMs != null) history = pushHistory(history, Math.floor(began / 60000), apiMs);
    const body = leaseBody({ name, namespace, node, pod, clusterId, owner, previous, now: began, apiMs, dnsMs, cache, history });
    const t = Date.now();
    try {
      let res = previous ? await k.json('PUT', `${leasePath}/${name}`, body) : await k.json('POST', leasePath, body);
      if (res.status === 409 || res.status === 404) {
        const fresh = await k.json('GET', `${leasePath}/${name}`);
        previous = fresh.status === 200 ? fresh.body : null;
        res = previous ? await k.json('PUT', `${leasePath}/${name}`, { ...body, metadata: { ...body.metadata, resourceVersion: previous.metadata.resourceVersion } }) : await k.json('POST', leasePath, body);
      }
      if (res.status >= 200 && res.status < 300) { previous = res.body; apiMs = Date.now() - t; }
      else { log('renew_failed', { status: res.status, reason: res.body?.reason }); apiMs = null; }
    } catch (error) { log('renew_error', { error: error.message }); apiMs = null; }
    await new Promise(resolve => setTimeout(resolve, Math.max(0, BEAT_MS - (Date.now() - began))));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { process.stderr.write(`wake-agent: ${error.message}\n`); process.exit(1); });
}
