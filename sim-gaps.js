/*
 * 리소스 종류 보강(시뮬레이션 자료): Service·Endpoints, PVC·PV·StorageClass, Job, Secret(메타데이터만), cert-manager Certificate(사용자 정의),
 * Helm 릴리스, 워크로드 안의 HPA·PDB·조건, Pod 컨테이너(init·sidecar, probe 셋, env 참조, mount), 리소스 조치의 명령 계획.
 * 모두 world()의 바탕에서 씨앗 값으로 만든다: 같은 클러스터·시각이면 같은 값이다. Secret은 값을 만들지 않는다(키 이름·type·인증서 만료만).
 */
import { hash, hex7, cronRuns, servicePort as port, FULL_PVC, KNOWN_PORTS } from './sim-world.js';
import { H, D, ymd } from './sim-format.js';
import { SCENARIOS } from './sim-data.js';
import { t as L } from './sim-locale.js';

const cache = new WeakMap();
const once = (w, k, f) => { let m = cache.get(w); if (!m) cache.set(w, (m = {})); return (m[k] ??= f()); };

/** pods by their owner (one pass), so a list of hundreds of services reads its endpoints without scanning every pod each time */
export const podsOf = (w, owner) => once(w, 'byOwner', () => { const m = new Map(); for (const p of w.pods) { const k = `${p.ns}/${p.owner?.name}`; if (!m.has(k)) m.set(k, []); m.get(k).push(p); } return m; }).get(`${owner.ns}/${owner.name}`) ?? [];
const ready = p => p.status[0] === 'ok' && p.ready === '1/1';

/* ---------- Service · Endpoints ---------- */
export function services(w) {
  return once(w, 'svc', () => w.workloads.filter(x => x.kind === 'Deployment' || x.kind === 'StatefulSet').flatMap(x => {
    const [pt, pn] = port(x.name), lb = /gateway|-web$|ingress/.test(x.name) && x.kind === 'Deployment';
    const specs = KNOWN_PORTS[x.name]?.services ?? [{ name: x.kind === 'StatefulSet' ? `${x.name}-headless` : x.name, headless: x.kind === 'StatefulSet', type: lb ? 'LoadBalancer' : 'ClusterIP', ports: `${pn} ${lb ? 80 : pt}→${pt}/TCP` }];
    return specs.map(sp => { const h = hash(sp.name + x.ns), type = sp.type ?? 'ClusterIP';
      return { kind: 'Service', icon: 'k8s-service', name: sp.name, ns: x.ns, target: x, type, headless: !!sp.headless,
        clusterIP: sp.headless ? 'None' : `172.20.${h % 250}.${(h >>> 8) % 250 + 2}`, external: type === 'LoadBalancer' ? `k8s-${x.ns}-${sp.name}`.slice(0, 32) + `-${hex7(sp.name)}.elb.ap-northeast-2.amazonaws.com` : '', ports: sp.ports, selector: `app.kubernetes.io/name=${x.name}`, age: x.age, status: ['ok', ''] }; });
  }));
}
/** a service's endpoints now: the pods its selector picks, ready or not (and why not) */
export function endpointsOf(w, svc) {
  const ps = podsOf(w, svc.target).filter(p => p.node && !/Pending/.test(p.status[1]));
  const [pt] = port(svc.target.name);
  return ps.map(p => ({ id: p.name, pod: p.name, ip: p.ip, port: pt, node: p.node, ready: ready(p), why: ready(p) ? '' : /CrashLoop/.test(p.status[1]) ? L('sim.gd.ep.crashLoop') : /ContainerCreating/.test(p.status[1]) ? L('sim.gd.ep.creating') : L('sim.gd.ep.notReady', { status: p.status[1] }) }));
}
export const svcStatus = (w, svc) => { const e = endpointsOf(w, svc), nr = e.filter(x => !x.ready).length, r = e.length - nr; return !e.length ? ['error', L('sim.gd.svc.noEndpoint')] : !r ? ['error', `Ready 0 · NotReady ${nr}`] : nr ? ['warn', `Ready ${r} · NotReady ${nr}`] : ['ok', `Ready ${r}`]; };

/* ---------- PVC · PV · StorageClass ---------- */
export const STORAGE_CLASSES = [
  { kind: 'StorageClass', name: 'gp3', provisioner: 'ebs.csi.aws.com', reclaim: 'Delete', binding: 'WaitForFirstConsumer', expand: true, def: true, params: 'type=gp3 · fsType=ext4 · encrypted=true' },
  { kind: 'StorageClass', name: 'gp3-retain', provisioner: 'ebs.csi.aws.com', reclaim: 'Retain', binding: 'WaitForFirstConsumer', expand: true, def: false, params: 'type=gp3 · iops=6000 · throughput=250' },
  { kind: 'StorageClass', name: 'efs-shared', provisioner: 'efs.csi.aws.com', reclaim: 'Delete', binding: 'Immediate', expand: false, def: false, params: 'provisioningMode=efs-ap · directoryPerms=700' }];
/* the disk that fills: a database volume whose log retention was never set (the 90% case), and one claim stuck Terminating behind its protection finalizer.
   A claim's use is the StatefulSet's own figure (one value for the PVC list, the StatefulSet and the Pod's filesystem) */
export function pvcs(w) {
  return once(w, 'pvc', () => {
    const out = [];
    for (const x of w.workloads.filter(y => y.kind === 'StatefulSet')) for (const c of x.pvcs ?? []) {
      const full = FULL_PVC.test(c.name), used = c.used;
      out.push({ kind: 'PersistentVolumeClaim', icon: 'k8s-pvc', name: c.name, ns: x.ns, size: c.size, sc: c.sc, used, pod: c.pod, owner: x, volume: `pvc-${hex7(c.name)}-${hex7(c.name + 'v').slice(0, 4)}`, mode: 'ReadWriteOnce', age: x.age,
        status: full ? ['warn', 'Bound'] : ['ok', 'Bound'], usedGi: c.usedGi, finalizers: ['kubernetes.io/pvc-protection'] });
    }
    const a = w.workloads.find(y => y.ns === 'analytics' && y.kind === 'Deployment');
    if (a) out.push({ kind: 'PersistentVolumeClaim', icon: 'k8s-pvc', name: `${a.name}-scratch`, ns: a.ns, size: 50, sc: 'gp3', used: 37, pod: podsOf(w, a)[0]?.name, owner: a, volume: `pvc-${hex7(a.name + 'scr')}-${hex7(a.name).slice(0, 4)}`, mode: 'ReadWriteOnce', age: 30 * D,
      status: ['warn', 'Terminating'], finalizers: ['kubernetes.io/pvc-protection'], deleting: -47 * 60 });
    return out;
  });
}
/** a pod's data volume use, from its claim (the same figure the PVC list shows); null for a pod without one */
export const podVolume = (w, p) => { const c = p.owner?.kind === 'StatefulSet' ? (p.owner.pvcs ?? w.workloads.find(x => x.name === p.owner.name && x.ns === p.ns)?.pvcs ?? []).find(v => v.pod === p.name) : null; return c ? { claim: c.name, size: c.size, used: c.used, usedGi: c.usedGi, mount: '/var/lib/data' } : null; };
export const pvOf = c => ({ kind: 'PersistentVolume', name: c.volume, capacity: `${c.size}Gi`, claim: `${c.ns}/${c.name}`, sc: c.sc, reclaim: STORAGE_CLASSES.find(s => s.name === c.sc)?.reclaim, source: `EBS vol-0${hex7(c.volume)}${hex7(c.volume + 'e')}`.slice(0, 21), zone: 'ap-northeast-2' + 'abc'[hash(c.name) % 3] });

/* ---------- Job ---------- */
export function jobs(w, t) {
  const out = [];
  for (const c of w.workloads.filter(x => x.kind === 'CronJob')) for (const r of cronRuns(c, t, 2)) {
    const name = r.id;
    out.push({ kind: 'Job', icon: 'k8s-job', name, ns: c.ns, owner: c, start: r.at, took: r.dur, completions: r.result[0] === 'error' ? 0 : r.result[0] === 'busy' ? 0 : 1, want: 1, failed: r.result[0] === 'error' ? 4 : 0, why: r.result[0] === 'error' ? L('sim.gd.job.backoff') : '', age: t - r.at, status: r.result[0] === 'error' ? ['error', 'Failed'] : r.result[0] === 'busy' ? ['busy', 'Running'] : ['ok', 'Complete'] });
  }
  const fixed = [['orders', 'orders-db-migrate-v42', -2 * D - 3 * H, 84, ['ok', 'Complete'], ''], ['search', 'search-reindex-full', -5 * H, 1260, ['error', 'Failed'], L('sim.gd.job.deadline')]];
  for (const [ns, name, at, took, st, why] of fixed) if (w.namespaces.includes(ns)) out.push({ kind: 'Job', icon: 'k8s-job', name, ns, owner: null, start: at, took, completions: st[0] === 'ok' ? 1 : 0, want: 1, failed: st[0] === 'ok' ? 0 : 1, why, age: t - at, status: st });
  return out;
}

/* ---------- Secret(메타데이터만) · Certificate ---------- */
const DB_APPS = ['payments', 'orders', 'checkout-api', 'billing', 'ledger'];
export function secrets(w) {
  return once(w, 'sec', () => {
    const out = [];
    for (const ns of w.namespaces) {
      /* Let's Encrypt certificates live 90 days and cert-manager renews them 30 days before the end: a healthy one has 31–89 days left; platform's renewal failed */
      const tls = ns === 'platform' ? 'search-tls' : ns === 'search' ? 'search-internal-tls' : `${ns}-tls`, days = ns === 'platform' ? 13 : 31 + hash(ns) % 59;
      out.push({ kind: 'Secret', icon: 'k8s-secret', name: tls, ns, type: 'kubernetes.io/tls', keys: ['tls.crt', 'tls.key', 'ca.crt'], expires: days * D - 2 * H, issuer: "Let's Encrypt R11", cn: ns === 'platform' ? 'search.acme.example' : `${ns}.acme.example`, age: (90 - days) * D, status: days <= 14 ? ['warn', L('sim.gd.sec.expiresSoon', { days })] : ['ok', 'tls'] });
      for (const app of DB_APPS.filter(a => ns === a || ns.startsWith(a))) out.push({ kind: 'Secret', icon: 'k8s-secret', name: `${app}-db`, ns, type: 'Opaque', keys: ['username', 'password', 'host', 'port'], age: (40 + hash(app) % 200) * D, rotated: -(3 + hash(app) % 40) * D, status: ['ok', 'Opaque'] });
    }
    return out;
  });
}
export const certificates = w => once(w, 'cert', () => secrets(w).filter(s => s.type === 'kubernetes.io/tls').map(s => ({ kind: 'Certificate', icon: 'k8s-secret', name: s.name.replace(/-tls$/, ''), ns: s.ns, secret: s.name, issuer: 'ClusterIssuer/letsencrypt-prod', notAfter: s.expires, renew: s.expires - 30 * D, age: s.age,
  ready: s.ns === 'platform' ? 'False' : 'True', reason: s.ns === 'platform' ? 'Renewal failed · ACME HTTP-01 challenge 403 (Ingress 경로 없음)' : 'Certificate is up to date and has not expired', status: s.ns === 'platform' ? ['warn', L('sim.gd.cert.renewFailed')] : ['ok', 'Ready'] })));

/* ---------- Helm 릴리스 ---------- */
const CHARTS = [['monitoring', 'kube-prometheus-stack', '65.1.1', 'v0.77.1', 14], ['monitoring', 'loki', '6.16.0', '3.2.0', 9], ['logging', 'fluent-bit', '0.47.10', '3.1.9', 6], ['cert-manager', 'cert-manager', 'v1.16.1', 'v1.16.1', 11], ['platform', 'ingress-nginx', '4.11.3', '1.11.3', 18], ['kube-system', 'aws-load-balancer-controller', '1.9.2', 'v2.9.2', 7]];
export function helmReleases(w) {
  return once(w, 'helm', () => CHARTS.filter(([ns]) => w.namespaces.includes(ns)).map(([ns, name, chart, app, rev]) => {
    const hist = Array.from({ length: Math.min(rev, 6) }, (_, i) => { const r = rev - i, at = -(i * 9 + 1 + hash(name + r) % 7) * D - hash(name + r) % H; return { id: String(r), rev: r, at, chart: `${name}-${i ? chart.replace(/^(v?\d+)\.(\d+)\.\d+$/, (m, a, b) => `${a}.${Math.max(0, Number(b) - Math.ceil(i / 2))}.${i % 2}`) : chart}`, status: i ? 'superseded' : 'deployed', desc: i ? 'Upgrade complete' : name === 'loki' ? 'Upgrade complete · retention 값 바뀜' : 'Upgrade complete' }; });
    return { kind: 'HelmRelease', icon: 'k8s-application', name, ns, chart: `${name}-${chart}`, app, rev, hist, updated: hist[0].at, source: 'Helm', status: ['ok', 'deployed'],
      diff: name === 'loki' ? [' loki:', '   limits_config:', '-    retention_period: 744h', '+    retention_period: 336h', '   compactor:', '+    retention_enabled: true'].join('\n') : [' resources:', '   requests:', `-    memory: ${256 + hash(name) % 256}Mi`, `+    memory: ${512 + hash(name) % 256}Mi`].join('\n') };
  }));
}

/* ---------- 워크로드 안: HPA · PDB · 조건 ---------- */
export function hpaOf(x, w, t) {
  if (x.kind !== 'Deployment' || x.replicas < 4) return null;
  const max = hash(x.name + 'hpa') % 7 === 0 ? x.replicas : x.replicas + 2 + hash(x.name) % 6, min = Math.max(2, Math.ceil(x.replicas / 3)), cur = max === x.replicas ? 88 + hash(x.name) % 9 : 42 + hash(x.name + t.toString().slice(0, -3)) % 25;
  return { name: x.name, min, max, replicas: x.replicas, target: 70, cpu: cur, atMax: x.replicas >= max, last: -(2 + hash(x.name) % 50) * 60 };
}
export function pdbOf(x, w) {
  if (!['Deployment', 'StatefulSet'].includes(x.kind) || x.replicas < 2) return null;
  const ps = podsOf(w, x), healthy = ps.filter(ready).length, minA = x.kind === 'StatefulSet' ? x.replicas - 1 : Math.max(1, x.replicas - Math.max(1, Math.floor(x.replicas / 4)));
  return { name: `${x.name}-pdb`, minAvailable: minA, healthy, desired: minA, allowed: Math.max(0, healthy - minA), expected: ps.length };
}
export function conditionsOf(x, w) {
  const ps = podsOf(w, x), ok = ps.filter(ready).length, want = x.replicas;
  return [{ type: 'Available', status: ok >= Math.max(1, want - Math.floor(want / 4)) ? 'True' : 'False', reason: ok >= want ? 'MinimumReplicasAvailable' : 'MinimumReplicasUnavailable', at: ok >= want ? -x.age : -13 * 60 },
    { type: 'Progressing', status: 'True', reason: x.scenario && ok < want ? 'ReplicaSetUpdated' : 'NewReplicaSetAvailable', at: x.scenario ? -13 * 60 : -(x.age % (9 * D)) }];
}

/* ---------- Pod 컨테이너 ---------- */
/** a container's state as the kubelet reports it (Running, Waiting with its reason, Terminated), never the pod's phase */
const containerState = p => { const st = p.status[1]; return /Pending/.test(st) ? ['warn', L('sim.gd.ctr.unscheduled')] : /ContainerCreating/.test(st) ? ['busy', 'Waiting · ContainerCreating'] : /ImagePull|ErrImagePull/.test(st) ? ['error', `Waiting · ${st.split(' · ')[0]}`] : /CrashLoop/.test(st) ? ['error', 'Waiting · CrashLoopBackOff'] : /Evicted/.test(st) ? ['warn', 'Terminated · Evicted'] : ['ok', 'Running']; };
export function containersOf(p) {
  const app = p.owner?.name ?? 'app', [pt] = port(app), db = DB_APPS.some(a => app.startsWith(a)) || /db/.test(app), side = /api|gateway/.test(app);
  const probe = (kind, path) => ({ kind, text: pt === 8080 ? `httpGet ${path}:${pt} · ${kind === 'startup' ? 'period 5s · failure 30' : 'period 10s · failure 3'}` : `tcpSocket :${pt} · period 10s` });
  const main = { name: app, init: false, image: p.image, state: containerState(p), restarts: p.restarts ?? 0, last: p.restarts ? `Terminated · ${p.lastReason || 'Error'} · Exit ${p.lastReason === 'OOMKilled' ? 137 : 1}` : L('sim.gd.none'), port: pt,
    probes: [probe('liveness', '/healthz'), probe('readiness', '/ready'), ...(app === 'payments' || /api/.test(app) ? [probe('startup', '/healthz')] : [])],
    env: [{ name: 'JAVA_OPTS', from: L('sim.gd.env.spec') }, ...(db ? [{ name: 'DB_USER', from: `Secret ${DB_APPS.find(a => app.startsWith(a)) ?? app}-db · username` }, { name: 'DB_PASSWORD', from: `Secret ${DB_APPS.find(a => app.startsWith(a)) ?? app}-db · password` }] : []), { name: 'LOG_LEVEL', from: `ConfigMap ${app}-config · log.level` }],
    mounts: ['/var/run/secrets/kubernetes.io/serviceaccount (projected · ro)', `/etc/${app} (ConfigMap ${app}-config · ro)`, ...(p.owner?.kind === 'StatefulSet' ? [`/var/lib/data (PVC data-${p.name})`] : [])] };
  const out = [];
  if (db) out.push({ name: 'wait-for-db', init: true, image: 'busybox:1.36', state: ['ok', 'Terminated · Completed'], restarts: 0, last: 'Exit 0', port: null, probes: [], env: [{ name: 'DB_HOST', from: `Secret ${DB_APPS.find(a => app.startsWith(a)) ?? app}-db · host` }], mounts: [] });
  out.push(main);
  if (side) out.push({ name: 'otel-agent', init: false, image: 'otel/opentelemetry-collector-contrib:0.111.0', state: /Pending|ContainerCreating/.test(p.status[1]) ? containerState(p) : ['ok', 'Running'], restarts: 0, last: L('sim.gd.none'), port: 4317, probes: [{ kind: 'liveness', text: 'httpGet /:13133 · period 10s · failure 3' }], env: [{ name: 'K8S_NODE_NAME', from: 'fieldRef spec.nodeName' }], mounts: ['/conf (ConfigMap otel-agent · ro)'] });
  return out;
}

/* ---------- 리소스 조치 → 명령 계획 ---------- */
/** the actions a person may propose from a resource's view; each is a plan (the exact command, its reach, the checks) that runs only after approval */
/** how many pods a rolling restart replaces at once, from the strategy (a Deployment's maxSurge and maxUnavailable, a StatefulSet one at a time) */
const rollStep = r => r.kind === 'Deployment' ? { surge: Math.max(1, Math.ceil(r.replicas * .25)), unavailable: Math.floor(r.replicas * .25) } : { surge: 0, unavailable: 1 };
/** the Argo CD Application that manages an object, found by namespace, kind and name (an object read again is a new object: identity never decides this) */
export const ownerApp = (w, r) => w.apps.find(a => a.target && a.target.ns === r.ns && a.target.kind === r.kind && a.target.name === r.name) ?? null;
const diffText = d => d ? [`--- ${d.path}`, ...d.before.map(l => `-${l}`), ...d.after.map(l => `+${l}`)].join('\n') : '';
/** one plan from an incident's choice: the change, its route (a Draft PR or a command run outside Wake), its reach and checks.
 *  The incident's choices and the resource view's proposals are both built here, so the same object gets the same plan wherever it starts */
export function planFromOption(s, o) {
  const mode = o.mode ?? (o.path?.[0] === 'Draft PR' ? 'pr' : 'manual'), repo = o.repo ?? s.repo, target = o.target ?? s.approval?.target ?? [];
  return { id: o.id, source: 'incident', mode, label: o.title, target, change: o.change, reach: o.impact, diff: o.diff ?? null, repo: mode === 'pr' ? repo : null, path: o.diff?.path ?? null,
    cmd: mode === 'pr' ? `# Draft PR · ${repo}\n${diffText(o.diff)}` : o.command ?? '', out: mode === 'pr' ? L('sim.gd.act.prOut', { repo }) : '',
    checks: [mode === 'pr' ? L('sim.gd.act.prRoute', { repo }) : L('sim.gd.act.outside', { to: o.to ?? '' }), ...(o.residual ? [o.residual] : [])] };
}
/** the actions a person may propose from a resource's view; each is a plan (the exact change, its reach, the checks) that runs only after approval.
 *  An object Argo CD syncs automatically is changed through Git (a Draft PR), never by a command against the cluster that the next sync would undo */
export function actionsFor(r, w) {
  const n = `-n ${r.ns}`, app = ownerApp(w, r), gitops = !!app?.auto, s = SCENARIOS.find(x => x.id === w.sid);
  const here = o => { const tg = o.target ?? s.approval?.target ?? []; return tg[1] === r.ns && tg[2] === `${r.kind} ${r.name}`; };
  const own = (s?.options ?? []).filter(o => !o.disabled && here(o)).map(o => planFromOption(s, o));
  const list = [...own];
  /* a restart does not fix a container killed for its memory limit: the same limit kills the new pods too, so it is not offered as a fix for one */
  const oom = podsOf(w, r).some(p => p.lastReason === 'OOMKilled' || /OOMKilled/.test(p.status[1]));
  const st = rollStep(r), kind = r.kind.toLowerCase();
  if (gitops && ['Deployment', 'StatefulSet'].includes(r.kind)) {
    const file = `${app.path}/${kind}.yaml`, pr = (id, label, change, before, after, reach) => ({ id, source: 'gitops', mode: 'pr', label, target: [w.cluster.name, r.ns, `${r.kind} ${r.name}`], change, reach, repo: app.repo, path: file, diff: { path: file, before, after }, cmd: `# Draft PR · ${app.repo}\n${diffText({ path: file, before, after })}`, out: L('sim.gd.act.prOut', { repo: app.repo }), checks: [L('sim.gd.act.prRoute', { repo: app.repo }), L('sim.gd.act.gitopsApp', { app: app.name, rev: app.revision })] });
    if (!own.some(o => /롤백|되돌리기/.test(o.label)) && r.kind === 'Deployment') list.push({ ...pr('revert', L('sim.gd.act.revertPr', { commit: app.revision }), L('sim.gd.act.revertChange', { commit: app.revision }), [], [], L('sim.gd.act.revertReach', { n: r.replicas })), cmd: `# Draft PR · ${app.repo}\ngit revert ${app.revision}`, diff: null });
    list.push(pr('scale', `Scale(${r.replicas} → ${r.replicas + 1}) PR`, `replicas ${r.replicas} → ${r.replicas + 1}`, [`  replicas: ${r.replicas}`], [`  replicas: ${r.replicas + 1}`], L('sim.gd.act.scaleReach', { cpu: r.cpuReq, mem: r.memReq })));
  } else {
    if (['Deployment', 'StatefulSet', 'DaemonSet'].includes(r.kind) && !oom) list.push({ id: 'restart', mode: 'command', out: `${kind}.apps/${r.name} restarted`, label: L('sim.gd.act.restart'), cmd: `kubectl rollout restart ${kind}/${r.name} ${n}`, reach: r.kind === 'Deployment' ? L('sim.gd.act.restartReach', { n: r.replicas, surge: st.surge, unavailable: st.unavailable }) : L('sim.gd.act.restartReachOne', { n: r.replicas }), checks: [L('sim.gd.act.restartNoPdb'), L('sim.gd.act.notGitops')] });
    if (oom && ['Deployment', 'StatefulSet'].includes(r.kind)) list.push({ id: 'limits', mode: 'command', out: `${kind}.apps/${r.name} resource requirements updated`, label: L('sim.gd.act.limits'), cmd: `kubectl set resources ${kind}/${r.name} ${n} --limits=memory=${Math.round((r.memLim ?? 512) * 1.5)}Mi`, reach: L('sim.gd.act.limitsReach', { from: r.memLim ?? 512, to: Math.round((r.memLim ?? 512) * 1.5), n: r.replicas }), checks: [L('sim.gd.act.oomNoRestart'), L('sim.gd.act.notGitops')] });
    if (['Deployment', 'StatefulSet'].includes(r.kind)) list.push({ id: 'scale', mode: 'command', out: `${kind}.apps/${r.name} scaled`, label: `Scale(${r.replicas} → ${r.replicas + 1})`, cmd: `kubectl scale ${kind}/${r.name} --replicas=${r.replicas + 1} ${n}`, reach: L('sim.gd.act.scaleReach', { cpu: r.cpuReq, mem: r.memReq }), checks: [L('sim.gd.act.notGitops'), hpaOf(r, w, 0) ? L('sim.gd.act.hpaResets') : L('sim.gd.act.noHpa')] });
    if (r.kind === 'Deployment') list.push({ id: 'rollback', mode: 'command', label: L('sim.gd.act.rollback', { rev: r.rev - 1 }), out: `deployment.apps/${r.name} rolled back`, cmd: `kubectl rollout undo deployment/${r.name} --to-revision=${r.rev - 1} ${n}`, reach: L('sim.gd.act.rollbackReach', { from: r.rev, to: r.rev - 1 }), checks: [L('sim.gd.act.notGitops'), L('sim.gd.act.rollbackDiff', { name: r.name, rev: r.rev - 1 })] });
  }
  if (r.kind === 'Node') list.push({ id: 'cordon', out: `node/${r.name} cordoned`,  label: L('sim.gd.act.cordon'), cmd: `kubectl cordon ${r.name}`, reach: L('sim.gd.act.cordonReach'), checks: [] },
    { id: 'drain', out: `node/${r.name} drained`,  label: L('sim.gd.act.drain'), cmd: `kubectl drain ${r.name} --ignore-daemonsets --delete-emptydir-data --timeout=10m`, reach: L('sim.gd.act.drainReach', { n: r.pods }), checks: w.pods.filter(p => p.node === r.name && p.owner?.kind !== 'DaemonSet').map(p => pdbOf(p.owner, w)).filter(x => x && x.allowed === 0).slice(0, 3).map(x => L('sim.gd.act.drainWaits', { name: x.name })) });
  if (r.kind === 'CronJob') list.push({ id: 'trigger', out: `job.batch/${r.name}-manual-${hex7(r.name).slice(0, 5)} created`,  label: L('sim.gd.act.trigger'), cmd: `kubectl create job ${r.name}-manual-${hex7(r.name).slice(0, 5)} --from=cronjob/${r.name} ${n}`, reach: L('sim.gd.act.triggerReach'), checks: [`concurrencyPolicy ${r.concurrency ?? 'Forbid'}`] },
    { id: 'suspend', out: `cronjob.batch/${r.name} patched`,  label: r.suspend ? L('sim.gd.act.resume') : L('sim.gd.act.suspend'), cmd: `kubectl patch cronjob/${r.name} ${n} -p '{"spec":{"suspend":${!r.suspend}}}'`, reach: r.suspend ? L('sim.gd.act.resumeReach') : L('sim.gd.act.suspendReach'), checks: ownerApp(w, r)?.auto ? [L('sim.gd.act.gitopsRevert', { app: ownerApp(w, r).name })] : [] });
  if (r.kind === 'Pod') list.push({ id: 'evict', out: `pod/${r.name} evicted`,  label: 'Evict', cmd: `kubectl create --raw /api/v1/namespaces/${r.ns}/pods/${r.name}/eviction -f eviction.json`, reach: L('sim.gd.act.evictReach', { kind: r.owner?.kind ?? '', name: r.owner?.name ?? '' }), checks: [(() => { const x = r.owner && pdbOf(r.owner, w); return x ? (x.allowed === 0 ? L('sim.gd.act.pdbEvictRefused', { name: x.name }) : `PDB ${x.name} · Allowed disruptions ${x.allowed}`) : L('sim.gd.act.noPdb'); })()] });
  if (r.kind === 'HelmRelease') list.push({ id: 'rollback', label: L('sim.gd.act.rollback', { rev: r.rev - 1 }), out: 'Rollback was a success! Happy Helming!', cmd: `helm rollback ${r.name} ${r.rev - 1} -n ${r.ns} --wait --timeout 10m`, reach: L('sim.gd.act.helmReach', { chart: r.hist[1]?.chart ?? '' }), checks: [L('sim.gd.act.helmCheck')] });
  return list;
}
export const copyCommands = (p, c) => [
  { id: 'exec', label: L('sim.gd.copy.exec'), cmd: `kubectl exec -it ${p.name} -n ${p.ns} -c ${c.name} -- sh` },
  { id: 'debug', label: L('sim.gd.copy.debug'), cmd: `kubectl debug -it ${p.name} -n ${p.ns} --image=busybox:1.36 --target=${c.name}` },
  ...(c.port ? [{ id: 'pf', label: L('sim.gd.copy.pf'), cmd: `kubectl port-forward pod/${p.name} -n ${p.ns} ${c.port}:${c.port}` }] : [])];

export const expiresIn = at => L('sim.gd.expiresIn', { date: ymd(at), n: Math.round(at / D) });
