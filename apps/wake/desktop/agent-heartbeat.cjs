/*
 * 에이전트 heartbeat 읽기(agent.heartbeat {id}): 클러스터 안 wake-agent가 Node마다 갱신하는 Lease(wake-system, 라벨 app.kubernetes.io/instance=wake-agent)를
 * Kubernetes API로 읽는다(허브는 에이전트에 직접 닿지 않음). Node 목록과 맞춰 Node마다 수신(ok) · 끊김(stale, Lease 기간이 지남) · 없음(missing, Lease 없음).
 * 지연 이력은 에이전트가 Lease 주석에 남긴 1분 칸 6시간(데스크톱이 꺼져 있던 동안 포함)을 Node 사이 최댓값으로 합친다.
 * RBAC은 ServiceAccount wake-system/wake-agent에 묶인 ClusterRole·Role 규칙을 그대로 읽는다.
 * 실패는 던지지 않고 lookup(forbidden, error)으로 돌려준다. 시각 비교는 이 컴퓨터 시계 기준.
 */
const NS = 'wake-system';
const SELECTOR = 'app.kubernetes.io/instance=wake-agent';
const A = 'wake-agent/';
const SA = { kind: 'ServiceAccount', name: 'wake-agent', namespace: NS };

const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const lookupOf = error => (error?.status === 403 || error?.kind === 'forbidden' ? 'forbidden' : error?.status === 404 ? 'absent' : 'error');

/** 주석의 지연 이력 "<첫 분>|v,v,,v" -> [{ at(ms), ms }](빈 칸은 빼서 차트에 빈 구간으로) */
function historySamples(text) {
  const m = /^(\d+)\|([0-9,]*)$/.exec(String(text ?? ''));
  if (!m) return [];
  return m[2].split(',').flatMap((v, i) => (v === '' ? [] : [{ at: (Number(m[1]) + i) * 60000, ms: Number(v) }]));
}

/** Lease 하나 -> Node 줄(now: ms) */
function nodeOf(lease, now) {
  const a = lease.metadata?.annotations ?? {}, renew = Date.parse(lease.spec?.renewTime ?? '');
  const duration = Number.isFinite(lease.spec?.leaseDurationSeconds) ? lease.spec.leaseDurationSeconds : 15;
  const age = Number.isFinite(renew) ? Math.max(0, Math.round((now - renew) / 1000)) : null;
  return { node: a[A + 'node'] || lease.metadata?.name?.replace(/^wake-agent-/, ''), lease: lease.metadata?.name, holder: lease.spec?.holderIdentity ?? null,
    state: age != null && age <= duration ? 'ok' : 'stale', at: Number.isFinite(renew) ? new Date(renew).toISOString() : null, ageSeconds: age,
    version: a[A + 'version'] || null, apiMs: num(a[A + 'api-ms']), dnsMs: num(a[A + 'dns-ms']), nodeReady: a[A + 'node-ready'] === '' || a[A + 'node-ready'] == null ? null : a[A + 'node-ready'] === 'true',
    objects: num(a[A + 'objects']), changesPerSec: num(a[A + 'changes-per-sec']), pods: num(a[A + 'pods']), podsNotReady: num(a[A + 'pods-not-ready']),
    watch: a[A + 'watch'] ? a[A + 'watch'].split(',').filter(Boolean) : [], clusterId: a[A + 'cluster-id'] || null, samples: historySamples(a[A + 'history']) };
}

/** 묶인 역할의 규칙 -> 화면 줄 { resource, verbs, scope } */
function ruleRows(roles) {
  return roles.flatMap(({ rules, scope }) => (rules ?? []).flatMap(r => (r.resources ?? []).map(res => ({
    resource: (r.apiGroups ?? []).filter(Boolean).map(g => `${g}/`).join('') + res + (r.resourceNames?.length ? ` (${r.resourceNames.join(', ')})` : ''),
    verbs: (r.verbs ?? []).join(' · '), scope }))));
}

function createAgentHeartbeat({ client, now = Date.now }) {
  async function rbac(c) {
    const bound = b => (b.subjects ?? []).some(s => s.kind === SA.kind && s.name === SA.name && s.namespace === SA.namespace);
    const [crb, rb] = await Promise.all([c.request('GET', '/apis/rbac.authorization.k8s.io/v1/clusterrolebindings'), c.request('GET', '/apis/rbac.authorization.k8s.io/v1/rolebindings')]);
    const refs = [...(crb.items ?? []).filter(bound).map(b => ({ ref: b.roleRef, ns: null })), ...(rb.items ?? []).filter(bound).map(b => ({ ref: b.roleRef, ns: b.metadata.namespace }))];
    const roles = await Promise.all(refs.map(({ ref, ns }) => c.request('GET', ref.kind === 'ClusterRole' || !ns
      ? `/apis/rbac.authorization.k8s.io/v1/clusterroles/${encodeURIComponent(ref.name)}`
      : `/apis/rbac.authorization.k8s.io/v1/namespaces/${encodeURIComponent(ns)}/roles/${encodeURIComponent(ref.name)}`).then(role => ({ rules: role.rules, scope: ns ?? 'cluster' }))));
    return ruleRows(roles);
  }

  async function read(args) {
    const at = now(), result = { at: new Date(at).toISOString(), lookup: 'error', version: null, clusterId: null, nodes: [], heartbeat: null, watch: null, rules: null, samples: [] };
    if (!args || typeof args.id !== 'string' || !args.id) return { ...result, lookup: 'invalid_request' };
    const c = client(args.id);
    const [leases, nodes, rules] = await Promise.allSettled([
      c.request('GET', `/apis/coordination.k8s.io/v1/namespaces/${NS}/leases?labelSelector=${encodeURIComponent(SELECTOR)}`),
      c.request('GET', '/api/v1/nodes', null, { metadataList: true }),
      rbac(c)]);
    if (leases.status === 'rejected') return { ...result, lookup: lookupOf(leases.reason) };
    result.lookup = 'ok';
    const byNode = new Map((leases.value.items ?? []).map(l => nodeOf(l, at)).map(n => [n.node, n]));
    const names = nodes.status === 'fulfilled' ? (nodes.value.items ?? []).map(n => n.metadata.name) : [...byNode.keys()];
    result.nodes = names.sort().map(node => byNode.get(node) ?? { node, lease: null, holder: null, state: 'missing', at: null, ageSeconds: null, samples: [] });
    const fresh = result.nodes.filter(n => n.state === 'ok');
    const count = new Map(); for (const n of fresh) count.set(n.version, (count.get(n.version) ?? 0) + 1);
    result.version = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    result.clusterId = fresh.find(n => n.clusterId)?.clusterId ?? null;
    const watch = [...new Set(fresh.flatMap(n => n.watch))];
    result.watch = watch.length ? watch : null;
    if (fresh.length) {
      const latest = Math.max(...fresh.map(n => Date.parse(n.at))), lat = fresh.map(n => n.apiMs).filter(v => v != null);
      result.heartbeat = { at: new Date(latest).toISOString(), latencyMs: lat.length ? Math.max(...lat) : null,
        eventsPerSec: Math.round(fresh.reduce((s, n) => s + (n.changesPerSec ?? 0), 0) * 10) / 10, fresh: fresh.length, nodes: result.nodes.length };
    }
    const minutes = new Map(); for (const n of result.nodes) for (const s of n.samples) minutes.set(s.at, Math.max(minutes.get(s.at) ?? 0, s.ms));
    result.samples = [...minutes].sort((a, b) => a[0] - b[0]).map(([t, ms]) => ({ at: t, ms }));
    for (const n of result.nodes) delete n.samples;
    result.rules = rules.status === 'fulfilled' ? rules.value : null;
    return result;
  }
  return { read };
}

module.exports = { createAgentHeartbeat };
