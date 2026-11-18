/*
 * 시뮬레이션의 클러스터 세계: 운영 SRE가 보는 규모(클러스터 3개, wake-prod는 namespace 30 · 워크로드 약 400 · Pod 약 2,500 · Node 40)를
 * seed로 정해진 생성기로 만든다. 같은 시각은 언제나 같은 값이라 다시 그려도 화면이 흔들리지 않는다(그릴 때 Math.random 없음).
 * 무거운 것(이벤트 하루 수만 건, 바쁜 서비스의 분당 수천 줄 로그)은 화면이 그 구간을 물을 때만 시간 묶음으로 만들고 캐시한다.
 * 시나리오(sim-data.js)는 이 규모 안의 문제 하나다: 사용자는 홈 요약, 알림, 거르기, 찾기로 그것을 찾아 들어간다.
 * 시각은 지금 시나리오의 감지 시각 t0에서 센 초. world()가 시나리오의 시계를 맞춘다(useClock).
 * 근거 조각(evidenceSnapshot)은 수집한 순간의 값으로 한 번 만들고, 근거 칸·로그 화면·보고서가 같은 조각을 읽는다.
 */
import { hash, hex7, COMMITS, SCENARIOS, PAST, OUTCOME, DETAIL, CRASH_EVERY, crashTimes, INC_BASE, ME, NEED, PROD_NODES, GENERAL_NODES, POD_CAP, HIKARI_EVERY, S3_HIKARI, SCRAPE, SLO, burnRate, allocCpu as allocOf, useClock, onRebuild, clockSid, detectRel, pastAt, linksOf, RECOVERY } from './sim-data.js';
import { T0, H, D, ymd, hm, hms, wallSec, weekday } from './sim-format.js';
import { t as L } from './sim-locale.js';

const rnd = s => (hash(s) % 100000) / 100000;
export const wave = (seed, t) => Math.sin(t / 900 + seed) * .6 + Math.sin(t / 233 + seed * 2) * .3 + Math.sin(t / 61 + seed * 3) * .1;
/* busier in the day and quieter at the weekend, by the wall clock (KST) of the scenario in play */
export const daily = (t, phase = 5) => Math.sin(((wallSec(t) - 50520 + phase * H) / D) * 2 * Math.PI);
const weekly = t => ([0, 6].includes(weekday(t)) ? -.35 : 0);
export const sfx = (seed, n) => { const a = 'bcdfghjklmnpqrstvwxz2456789'; let h = hash(seed), s = ''; for (let i = 0; i < n; i++) { s += a[h % a.length]; h = Math.floor(h / a.length) + hash(seed + i) % 997; } return s; };
/** the pod a rollout put in place of a failed one: a new ReplicaSet hash and suffix, a new UID */
export const replacementName = name => { const base = name.replace(/-[a-z0-9]{4,5}-[a-z0-9]{4,5}$/, ''); return `${base}-${sfx(base + 'rs2', 5)}-${sfx(name + 'p2', 5)}`; }; /* pods of one new ReplicaSet share its hash */
/* reading a scenario sets its clock: every accessor that takes a scenario id answers in that scenario's time */
export { hash, hex7 };
const sc = sid => { if (sid) useClock(sid); return SCENARIOS.find(s => s.id === sid); };
const memo = new Map();
const cached = (key, make) => { if (!memo.has(key)) { if (memo.size > 400) memo.delete(memo.keys().next().value); memo.set(key, make()); } return memo.get(key); };

/* ---------- 클러스터 ---------- */
export const CLUSTERS = [
  { id: 'wake-prod', name: 'wake-prod', env: L('sim.w.env.prod'), provider: 'EKS', region: 'ap-northeast-2', version: 'v1.31.4', ns: 30, nodes: PROD_NODES, agent: 'ok' },
  { id: 'wake-stage', name: 'wake-stage', env: L('sim.w.env.stage'), provider: 'EKS', region: 'ap-northeast-2', version: 'v1.31.4', ns: 14, nodes: 9, agent: 'ok' },
  { id: 'wake-dev', name: 'wake-dev', env: L('sim.w.env.dev'), provider: 'kind', region: 'local', version: 'v1.32.0', ns: 8, nodes: 3, agent: 'error' },
];

/* ---------- 이름과 모양 ---------- */
const SCENARIO_NS = ['payments', 'orders', 'checkout', 'reports', 'auth', 'argocd', 'monitoring', 'kube-system', 'platform'];
const TEAM_NS = ['search', 'catalog', 'inventory', 'shipping', 'notifications', 'recommendations', 'pricing', 'fraud', 'ledger', 'billing', 'identity', 'gateway', 'media', 'analytics', 'ml-serving', 'cms', 'partner-api', 'mobile-bff', 'logging', 'cert-manager', 'data-pipeline-ingest-eu-central-replica'];
const ROLES = [['api', 'Deployment'], ['worker', 'Deployment'], ['web', 'Deployment'], ['consumer', 'Deployment'], ['scheduler', 'Deployment'], ['cache', 'StatefulSet'], ['sync', 'Deployment'], ['gateway', 'Deployment'], ['admin', 'Deployment'], ['grpc', 'Deployment'], ['reconciler', 'Deployment'], ['exporter', 'Deployment'], ['cleanup', 'CronJob'], ['db', 'StatefulSet'], ['indexer', 'Deployment'], ['notifier', 'Deployment'], ['batch-nightly', 'CronJob'], ['stream-normalizer-consumer-group-primary', 'Deployment'], ['auth-proxy', 'Deployment'], ['webhook', 'Deployment'], ['replicator', 'Deployment'], ['feature-flags', 'Deployment'], ['report-builder', 'Deployment'], ['outbox-relay', 'Deployment'], ['search-sync', 'Deployment'], ['image-resizer', 'Deployment'], ['rate-limiter', 'Deployment'], ['session', 'StatefulSet'], ['metrics-adapter', 'Deployment'], ['archiver', 'CronJob']];
/* the scenario workloads and the platform ones are written out: their names, sizes and limits are what the scenarios read */
const FIXED = [
  ['payments', 'Deployment', 'payments', 3, 'registry.local/payments:2.8.0', 420, 384, 512],
  ['payments', 'Deployment', 'payments-worker', 2, 'registry.local/payments-worker:2.8.0', 200, 256, 384],
  ['payments', 'CronJob', 'settlement-batch', 1, 'registry.local/payments:2.8.0', 500, 1024, 1536],
  ['orders', 'Deployment', 'orders', 4, 'registry.local/orders:1.4.1', 300, 512, 768],
  ['orders', 'Deployment', 'orders-worker', 2, 'registry.local/orders-worker:1.4.1', 150, 256, 384],
  ['orders', 'StatefulSet', 'orders-db', 1, 'postgres:16.4', 1000, 2048, 4096],
  ['checkout', 'Deployment', 'checkout-api', 2, 'registry.local/checkout-api:5.1.3', 500, 1024, 1536],
  ['checkout', 'Deployment', 'checkout-web', 3, 'registry.local/checkout-web:3.9.0', 100, 128, 256],
  ['reports', 'Deployment', 'reports-api', 2, 'registry.local/reports:3.0.2', 200, 512, 768],
  ['reports', 'CronJob', 'reports-batch', 1, 'registry.local/reports:3.0.2', 1000, 2048, 3072],
  ['auth', 'Deployment', 'auth', 5, 'registry.local/auth:4.12.0', 250, 384, 512],
  ['auth', 'StatefulSet', 'auth-redis', 1, 'redis:7.4', 500, 1024, 2048],
  ['argocd', 'Deployment', 'argocd-server', 2, 'quay.io/argoproj/argocd:v2.13.1', 100, 256, 512],
  ['argocd', 'Deployment', 'argocd-repo-server', 3, 'quay.io/argoproj/argocd:v2.13.1', 200, 512, 1024],
  ['argocd', 'StatefulSet', 'argocd-application-controller', 1, 'quay.io/argoproj/argocd:v2.13.1', 1000, 2048, 4096],
  ['monitoring', 'StatefulSet', 'prometheus-k8s', 2, 'quay.io/prometheus/prometheus:v2.53.2', 2000, 16384, 24576],
  ['monitoring', 'StatefulSet', 'loki', 3, 'grafana/loki:3.2.0', 1000, 4096, 6144],
  ['monitoring', 'Deployment', 'alertmanager', 2, 'quay.io/prometheus/alertmanager:v0.27.0', 50, 64, 128],
  ['monitoring', 'Deployment', 'grafana', 1, 'grafana/grafana:11.3.0', 100, 256, 512],
  ['monitoring', 'Deployment', 'wake-agent', 1, 'registry.local/wake-agent:0.9.2', 50, 96, 192],
  ['kube-system', 'Deployment', 'coredns', 3, 'registry.k8s.io/coredns/coredns:v1.11.3', 100, 70, 170],
  ['kube-system', 'Deployment', 'cluster-autoscaler', 1, 'registry.k8s.io/autoscaling/cluster-autoscaler:v1.31.0', 100, 300, 600],
  ['kube-system', 'Deployment', 'metrics-server', 2, 'registry.k8s.io/metrics-server/metrics-server:v0.7.2', 100, 200, 400],
  ['kube-system', 'Deployment', 'aws-load-balancer-controller', 2, 'public.ecr.aws/eks/aws-load-balancer-controller:v2.9.2', 100, 200, 400],
  ['platform', 'Deployment', 'ingress-nginx-controller', 4, 'registry.k8s.io/ingress-nginx/controller:v1.11.3', 500, 512, 1024],
];
const DAEMONS = [['kube-system', 'aws-node', 'amazon-k8s-cni:v1.18.5', 25, 64, 128], ['kube-system', 'kube-proxy', 'kube-proxy:v1.31.4', 100, 64, 128], ['monitoring', 'node-exporter', 'quay.io/prometheus/node-exporter:v1.8.2', 50, 32, 64], ['logging', 'fluent-bit', 'fluent/fluent-bit:3.1.9', 100, 128, 256]];
/* the scenario nodes are the first ones, in the general pool */
const NAMED_NODES = ['ip-10-0-3-17', 'ip-10-0-3-52', 'ip-10-0-5-9', 'ip-10-0-7-3', 'ip-10-0-8-11', 'ip-10-0-2-40', 'ip-10-0-4-21', 'ip-10-0-6-14'];
const POOLS = [['general', 'm6i.2xlarge', 8, 32, GENERAL_NODES / PROD_NODES], /* 23 general · 10 memory · 7 spot of 40: the counts the scheduling scenario's events quote */ ['memory', 'r6i.4xlarge', 16, 128, .25], ['batch-spot', 'c6i.4xlarge', 16, 32, .15]];

/* ---------- 한 클러스터의 바탕(한 번 만들고 캐시) ---------- */
function base(cid) {
  return cached('base:' + cid, () => {
    const c = CLUSTERS.find(x => x.id === cid) ?? CLUSTERS[0], prod = c.id === 'wake-prod', seedC = c.id;
    const namespaces = prod ? [...SCENARIO_NS, ...TEAM_NS] : [...SCENARIO_NS.slice(0, 4), 'argocd', 'monitoring', 'kube-system', ...TEAM_NS.slice(0, c.ns - 7)].slice(0, c.ns);
    const nodes = [];
    for (let i = 0; i < c.nodes; i++) {
      const u = i / c.nodes, pool = u < POOLS[0][4] ? POOLS[0] : u < POOLS[0][4] + POOLS[1][4] ? POOLS[1] : POOLS[2];
      const name = prod && i < NAMED_NODES.length ? NAMED_NODES[i] : `ip-10-${c.id === 'wake-prod' ? 0 : c.id === 'wake-stage' ? 1 : 2}-${(hash(seedC + i) % 60) + 10}-${(hash(seedC + 'n' + i) % 240) + 10}`;
      nodes.push({ kind: 'Node', icon: 'k8s-node', name, ns: '', pool: pool[0], type: pool[1], zone: 'ap-northeast-2' + 'abc'[i % 3], cpuCores: pool[2], memGi: pool[3], status: ['ok', 'Ready'], age: (12 + hash(name) % 80) * D, pods: 0, cpuReq: 0, memReq: 0 });
    }
    const workloads = [];
    const add = (ns, kind, name, replicas, image, cpuReq, memReq, memLim) => workloads.push({ kind, icon: 'k8s-' + kind.toLowerCase(), name, ns, replicas, ready: replicas, image, cpuReq, memReq, memLim, status: ['ok', kind === 'CronJob' ? L('sim.w.cronLastOk') : 'Available'], age: (3 + hash(name) % 200) * D, rev: 2 + hash(name + 'rev') % 60 });
    for (const f of FIXED) if (namespaces.includes(f[0])) add(...(prod ? f : [f[0], f[1], f[2], Math.max(1, Math.ceil(f[3] / 2)), f[4], f[5], f[6], f[7]]));
    for (const ns of namespaces.filter(n => !SCENARIO_NS.includes(n))) {
      const n = prod ? 17 + hash(ns) % 6 : 3 + hash(ns) % 3;
      for (let k = 0; k < n; k++) {
        const [role, kind] = ROLES[(hash(ns) + k * 7) % ROLES.length];
        const name = `${ns}-${role}`;
        if (workloads.some(w => w.name === name && w.ns === ns)) continue;
        const big = rnd(name + 'big') > .85, reps = kind === 'CronJob' ? 1 : kind === 'StatefulSet' ? 1 + hash(name) % 3 : prod ? (big ? 10 + hash(name) % 12 : 2 + hash(name) % 6) : 1 + hash(name) % 2;
        const req = [50, 100, 100, 200, 250][hash(name + 'c') % 5], mem = [64, 128, 256, 512, 1024][hash(name + 'm') % 5];
        add(ns, kind, name, reps, `registry.local/${ns}-${role.split('-')[0]}:${1 + hash(name) % 9}.${hash(name + 'v') % 30}.${hash(name + 'p') % 12}`, req, mem, mem * 1.5);
      }
    }
    const pods = [];
    /* the scheduler places a pod on a node with room for its requests (probing on from a seeded start); daemons are placed first */
    const cap = nd => .62 + .28 * rnd(nd.name + 'fill'); /* nodes fill unevenly, as bin-packing over time leaves them */
    /* a node also takes at most its max-pods, less the daemon pods every node runs */
    const fits = (nd, p) => nd.cpuReq + p.cpuReq <= nd.cpuCores * 1000 * cap(nd) && nd.memReq + p.memReq <= nd.memGi * 1024 * .9 && nd.pods < (POD_CAP[nd.type] ?? 110) - DAEMONS.length;
    /* with no node that fits, the one with the most free pod slots takes it (never past its max-pods) */
    const room = nd => (POD_CAP[nd.type] ?? 110) - DAEMONS.length - nd.pods;
    const place = (p, i) => { const s0 = hash(p.name + i) % nodes.length; let nd = null; for (let k = 0; k < nodes.length; k++) { const c = nodes[(s0 + k) % nodes.length]; if (fits(c, p)) { nd = c; break; } } nd ??= nodes.reduce((a, c) => (room(c) > room(a) ? c : a)); p.node = nd.name; nd.pods++; nd.cpuReq += p.cpuReq; nd.memReq += p.memReq; };
    for (const w of workloads) {
      if (w.kind === 'CronJob') continue;
      const rs = sfx(w.name + 'rs', 5);
      for (let i = 0; i < w.replicas; i++) {
        const name = w.kind === 'StatefulSet' ? `${w.name}-${i}` : `${w.name}-${rs}-${sfx(w.name + i, 5)}`;
        const p = { kind: 'Pod', icon: 'k8s-pod', name, ns: w.ns, owner: w, image: w.image, status: ['ok', 'Running'], ready: '1/1', restarts: hash(name + 'r') % 23 === 0 ? 1 + hash(name) % 3 : 0, age: Math.min(w.age, hash(name + 'young') % 6 === 0 ? (1 + hash(name) % 23) * H + hash(name) % 3000 : (1 + hash(name) % 9) * D), cpuReq: w.cpuReq, memReq: w.memReq, memLim: w.memLim, use: .45 + .4 * rnd(name + 'u'), ip: `10.${hash(seedC) % 3}.${hash(name) % 64}.${hash(name + 'ip') % 250 + 2}` };
        place(p, i); pods.push(p);
      }
    }
    for (const [ns, name, image, cpuReq, memReq, memLim] of DAEMONS) {
      const w = { kind: 'DaemonSet', icon: 'k8s-daemonset', name, ns, replicas: nodes.length, ready: nodes.length, image, cpuReq, memReq, memLim, status: ['ok', 'Available'], age: 90 * D, rev: 4 };
      workloads.push(w);
      const on = name === 'fluent-bit' ? nodes.filter(nd => nd.pool !== 'batch-spot') : nodes; /* fluent-bit has no toleration for the spot taint */
      w.replicas = on.length; w.ready = on.length;
      on.forEach(nd => { const p = { kind: 'Pod', icon: 'k8s-pod', name: `${name}-${sfx(name + nd.name, 5)}`, ns, owner: w, image, status: ['ok', 'Running'], ready: '1/1', restarts: 0, age: nd.age, cpuReq, memReq, memLim, use: .5, ip: nd.name.replace('ip-', '').replaceAll('-', '.'), node: nd.name }; nd.pods++; nd.cpuReq += cpuReq; nd.memReq += memReq; pods.push(p); });
    }
    /* what goes wrong in a big cluster on an ordinary day, outside any scenario: an evicted pod, a pending batch, a slow-to-start pod */
    if (prod) {
      const touch = (filter, status, extra = {}) => { const p = pods.find(filter); if (p) Object.assign(p, { status, ready: '0/1', ...extra }); };
      touch(p => p.ns === 'analytics' && p.owner.kind === 'Deployment', ['warn', 'Evicted · ephemeral-storage'], { restarts: 0 });
      touch(p => p.ns === 'ml-serving', ['warn', 'Pending · Insufficient nvidia.com/gpu'], { age: GPU_WAIT, node: null });
      touch(p => p.ns === 'search' && p.owner.kind === 'Deployment', ['warn', 'ContainerCreating · FailedMount'], { age: 2 * H });
    }
    const apps = workloads.filter(w => w.kind !== 'DaemonSet' && !['kube-system', 'monitoring', 'logging', 'cert-manager'].includes(w.ns)).filter((w, i) => i % 2 === 0 || SCENARIO_NS.includes(w.ns))
      .map(w => ({ kind: 'Application', icon: 'k8s-application', name: w.ns === 'payments' || w.ns === 'orders' || w.ns === 'auth' ? w.name : `${w.name}`, ns: 'argocd', target: w, replicas: 1, ready: 1, status: ['ok', 'Synced · Healthy'], age: w.age, repo: `acme/${w.ns}-deploy`, path: `apps/${w.name}`, revision: hex7(w.name + 'rev'), auto: SCENARIO_NS.includes(w.ns) || rnd(w.name + 'auto') > .2, image: '' })); /* the scenario apps sync automatically: a merged PR is applied by Argo CD */
    if (prod) { apps.find(a => a.name === 'checkout-web').status = ['warn', 'OutOfSync · Healthy']; const x = apps.find(a => a.target.ns === 'cms'); if (x) x.status = ['warn', 'Synced · Progressing']; }
    enrich({ c, nodes, workloads, pods, apps, prod });
    return { cluster: c, namespaces, nodes, workloads, pods, apps };
  });
}

/* ---------- 종류마다 kubectl·k9s가 보여 주는 칸: 바탕을 만들 때 한 번 채운다 ---------- */
/** how long the background GPU pod has waited for a node at t0 (its alert fired then) */
const GPU_WAIT = 40 * 60;
/** the claim that fills (orders-db's data volume) */
export const FULL_PVC = /^data-orders-db-0$/;
/** a node's allocatable CPU in millicores */
export const allocCpu = nd => allocOf(nd.cpuCores);
/** the port a workload serves on, from its name (a database, a cache, gRPC, else HTTP): its Service, endpoints and probes use the same one */
/* the platform workloads listen where their projects ship them (container port, port name); their Services are named as the charts name them,
   and the tool connection addresses (prometheus-operated:9090, loki-gateway:80, grafana:3000) are among them */
export const KNOWN_PORTS = {
  coredns: { port: [53, 'dns'], services: [{ name: 'kube-dns', ports: 'dns 53/UDP · dns-tcp 53/TCP · metrics 9153/TCP' }] },
  'prometheus-k8s': { port: [9090, 'web'], services: [{ name: 'prometheus-operated', headless: true, ports: 'web 9090/TCP' }, { name: 'prometheus-k8s', ports: 'web 9090/TCP · reloader-web 8080/TCP' }] },
  loki: { port: [3100, 'http-metrics'], services: [{ name: 'loki-headless', headless: true, ports: 'http-metrics 3100/TCP · grpc 9095/TCP' }, { name: 'loki-gateway', ports: 'http 80→3100/TCP' }] },
  alertmanager: { port: [9093, 'web'], services: [{ name: 'alertmanager', ports: 'web 9093/TCP · reloader-web 8080/TCP' }] },
  grafana: { port: [3000, 'grafana'], services: [{ name: 'grafana', ports: 'service 3000/TCP' }] },
  'wake-agent': { port: [8443, 'https'], services: [{ name: 'wake-agent', ports: 'https 8443/TCP' }] },
  'argocd-server': { port: [8080, 'server'], services: [{ name: 'argocd-server', ports: 'http 80→8080/TCP · https 443→8080/TCP' }] },
  'argocd-repo-server': { port: [8081, 'server'], services: [{ name: 'argocd-repo-server', ports: 'server 8081/TCP · metrics 8084/TCP' }] },
  'argocd-application-controller': { port: [8082, 'metrics'], services: [{ name: 'argocd-metrics', ports: 'metrics 8082/TCP' }] },
  'ingress-nginx-controller': { port: [80, 'http'], services: [{ name: 'ingress-nginx-controller', type: 'LoadBalancer', ports: 'http 80/TCP · https 443/TCP' }] },
  'metrics-server': { port: [10250, 'https'], services: [{ name: 'metrics-server', ports: 'https 443→10250/TCP' }] },
  'cluster-autoscaler': { port: [8085, 'http'], services: [{ name: 'cluster-autoscaler', ports: 'http 8085/TCP' }] },
  'aws-load-balancer-controller': { port: [9443, 'webhook-server'], services: [{ name: 'aws-load-balancer-webhook-service', ports: 'webhook-server 443→9443/TCP' }] },
};
export const servicePort = name => KNOWN_PORTS[name]?.port ?? (/db$|-db-|postgres/.test(name) ? [5432, 'postgres'] : /cache|redis|session/.test(name) ? [6379, 'redis'] : /grpc/.test(name) ? [9090, 'grpc'] : [8080, 'http']);
const CRONS = [['*/15 * * * *', L('sim.w.cron.everyMin', { n: 15 }), 900, 0], ['0 * * * *', L('sim.w.cron.hourly'), 3600, 0], ['30 2 * * *', L('sim.w.cron.daily', { time: '02:30' }), 86400, 9000], ['0 */6 * * *', L('sim.w.cron.everyHour', { n: 6 }), 21600, 0], ['*/5 * * * *', L('sim.w.cron.everyMin', { n: 5 }), 300, 0]];
/* schedule times are wall-clock (KST): K is t0 on that clock, so a run at relative second `at` is K + at */
const K = () => T0 + 9 * H;
export const cronLast = (w, t) => Math.floor((K() + t - w.off) / w.every) * w.every + w.off - K();
function enrich({ c, nodes, workloads, pods, apps, prod }) {
  const ver = c.version ?? 'v1.31.4';
  nodes.forEach(nd => Object.assign(nd, {
    version: `${ver}-eks-a737599`, internalIP: nd.name.replace('ip-', '').replaceAll('-', '.'), podCap: POD_CAP[nd.type] ?? 110,
    taints: nd.pool === 'batch-spot' ? ['spot=true:NoSchedule'] : [], labels: [`node.kubernetes.io/instance-type=${nd.type}`, `topology.kubernetes.io/zone=${nd.zone}`, `eks.amazonaws.com/nodegroup=${nd.pool}`, `eks.amazonaws.com/capacityType=${nd.pool === 'batch-spot' ? 'SPOT' : 'ON_DEMAND'}`],
    ephGi: 80, kubelet: `${ver}-eks-a737599`, runtime: 'containerd://1.7.22', os: 'Amazon Linux 2023.6.20241111',
  }));
  /* one spot node is cordoned for a scheduled replacement: Ready but SchedulingDisabled */
  const cord = prod ? nodes.filter(n => n.pool === 'batch-spot')[1] : null;
  if (cord) Object.assign(cord, { status: ['warn', 'Ready · SchedulingDisabled'], taints: [...cord.taints, 'node.kubernetes.io/unschedulable:NoSchedule'] });
  for (const w of workloads) {
    const ps = pods.filter(p => p.owner === w), app = apps.find(a => a.target === w);
    Object.assign(w, { app: app?.name ?? null, restarts1h: ps.filter(p => p.restarts > 0 && p.age < 3 * H).reduce((a, p) => a + p.restarts, 0) });
    if (w.kind === 'Deployment') Object.assign(w, { upToDate: w.replicas, available: w.ready, strategy: 'RollingUpdate · maxSurge 25% · maxUnavailable 25%' });
    /* a claim's use is one figure: the PVC list, the StatefulSet and the Pod's filesystem all read `used` (the database whose log retention was never set is the full one) */
    if (w.kind === 'StatefulSet') Object.assign(w, { service: `${w.name}-headless`, pvcs: ps.map((p, i) => { const name = `data-${w.name}-${i}`, size = [10, 20, 50, 100][hash(w.name) % 4], used = FULL_PVC.test(name) ? 91 : 18 + hash(name) % 52; return { name, size, used, usedGi: Math.round(size * used) / 100, sc: /db/.test(w.name) ? 'gp3-retain' : 'gp3', status: 'Bound', pod: p.name }; }), strategy: 'RollingUpdate · partition 0', upToDate: w.replicas });
    if (w.kind === 'DaemonSet') Object.assign(w, { desired: w.replicas, current: w.replicas, upToDate: w.replicas, available: w.ready, selector: 'kubernetes.io/os=linux', excluded: nodes.filter(nd => !ps.some(p => p.node === nd.name)).map(nd => ({ node: nd.name, why: L('sim.w.noToleration', { taints: nd.taints.join(', ') }) })) });
    if (w.kind === 'CronJob') {
      const [cron, human, every, off] = w.name === 'reports-batch' ? ['*/30 * * * *', L('sim.w.cron.everyMin', { n: 30 }), 1800, 0] : CRONS[hash(w.name + 'cron') % CRONS.length], /* the scenario's batch runs on the schedule its incident quotes */ suspend = prod && hash(w.name + 'sus') % 17 === 0, suspendedAt = suspend ? -(2 * D + (hash(w.name + 'sat') % 18) * H + 17 * 60) : null;
      Object.assign(w, { cron, human, every, off, suspend, suspendedAt, concurrency: w.name === 'reports-batch' ? 'Replace' : hash(w.name) % 3 === 0 ? 'Allow' : 'Forbid', history: 3, failedHistory: 1, status: suspend ? ['idle', 'Suspend'] : w.status });
    }
  }
  for (const p of pods) {
    const lim = p.memLim != null && p.memLim > p.memReq;
    Object.assign(p, { qos: lim ? 'Burstable' : 'Guaranteed', lastReason: p.restarts > 0 ? (hash(p.name + 'lr') % 3 === 0 ? 'OOMKilled' : 'Error') : '', container: p.owner?.name ?? p.name,
      probes: p.owner?.kind === 'Deployment' ? 'liveness http-get :8080/healthz · readiness http-get :8080/ready' : p.owner?.kind === 'StatefulSet' ? `readiness tcp-socket :${servicePort(p.owner.name)[0]}` : 'liveness http-get :2020/' });
  }
}
/* a CronJob's runs over the last day: the job is named after its scheduled minute (as the controller names it), with its duration and result */
/** when a CronJob last scheduled a run: for a suspended one, the last run before it was suspended (it creates no Jobs after that) */
export const lastSchedule = (w, t) => cronLast(w, w.suspend ? Math.min(t, w.suspendedAt) : t);
export function cronRuns(w, t, n = 12) {
  if (w.kind !== 'CronJob') return [];
  const out = [], last = lastSchedule(w, t);
  for (let k = 0; k < n; k++) {
    const at = last - k * w.every, id = Math.floor((T0 + at) / 60), dur = 20 + hash(w.name + id) % 240, bad = hash(w.name + id + 'f') % 19 === 0;
    out.push({ id: `${w.name}-${id}`, at, dur, result: bad ? ['error', 'Failed · BackoffLimitExceeded'] : at + dur > t ? ['busy', 'Running'] : ['ok', 'Complete'] });
  }
  return out;
}

/* ---------- 한 순간의 세계: 바탕 위에 시나리오의 문제와 그 진행 ---------- */
const S_ROLLED = sid => ['s1', 's2'].includes(sid); /* the scenarios whose action rolls the Deployment back */
/* a scenario pod's age runs from its start in the data (seconds from t0) */
const startAge = (start, t) => (start != null ? -start + Math.max(0, t) : null);
export function world(sid, t, phase = 'idle', conn = 'ok', cid = 'wake-prod') {
  useClock(sid);
  const key = `w:${cid}:${sid}:${phase}:${conn}:${Math.floor(t / 15)}`;
  return cached(key, () => {
    const b = base(cid), s = cid === 'wake-prod' ? sc(sid) ?? {} : {}, scope = s.quiet ? [] : s.scope ?? [];
    const recovered = phase === 'resolved', verifying = phase === 'verifying';
    const swap = new Map(), wswap = new Map(), extraW = [], extraP = [];
    let k = 0;
    for (const row of scope) {
      if (row.kind === 'Pod' && row.surge && (recovered || verifying)) continue; /* the rollback's rollout leaves no surge pod behind */
      if (row.kind === 'Pod') {
        const wl = b.workloads.filter(w => row.name.startsWith(w.name + '-')).sort((x, y) => y.name.length - x.name.length)[0];
        const slot = wl ? b.pods.filter(p => p.owner === wl && !swap.has(p))[0] : null;
        const st = verifying && row.status[0] === 'warn' && /Pending/.test(row.status[1]) ? ['ok', 'Running'] : verifying && row.status[0] === 'error' ? ['busy', 'ContainerCreating → Running'] : recovered && row.status[0] !== 'ok' ? ['ok', 'Running'] : row.status;
        const nodeFact = DETAIL[row.name]?.node;
        const p = { ...(slot ?? { kind: 'Pod', icon: 'k8s-pod', ns: s.ns, owner: wl ?? b.workloads.find(w => w.name === row.name.split('-').slice(0, -1).join('-')) ?? { name: row.name, kind: 'Job', ns: s.ns }, image: wl?.image ?? 'registry.local/reports:3.0.2', cpuReq: wl?.cpuReq ?? 1000, memReq: wl?.memReq ?? 2048, memLim: wl?.memLim ?? 3072, use: .7, ip: '10.0.9.' + (40 + k++), age: 7 * 60 }),
          name: (verifying || recovered) && (row.status[0] === 'error' || S_ROLLED(sid)) && /-[a-z0-9]{4,5}-[a-z0-9]{4,5}$/.test(row.name) ? replacementName(row.name) : row.name, replaced: (verifying || recovered) && (row.status[0] === 'error' || S_ROLLED(sid)) && /-[a-z0-9]{4,5}-[a-z0-9]{4,5}$/.test(row.name) ? row.name : null, /* a rollback replaces every pod of the workload (a new ReplicaSet), not only the failing one */
          status: st, scenario: true, restarts: recovered || verifying ? 0 : row.restarts ?? 0, lastReason: recovered || verifying ? '' : /OOMKilled/.test(row.status[1]) ? 'OOMKilled' : /Error/.test(row.status[1]) ? 'Error' : '', ready: st[0] === 'ok' ? '1/1' : '0/1', age: recovered || verifying ? 240 : startAge(row.start, t) ?? slot?.age ?? 7 * 60,
          node: /Pending/.test(st[1]) ? null : sid === 's4' && (recovered || verifying) ? 'ip-10-0-9-41' : nodeFact ?? slot?.node ?? b.nodes[0].name };
        if (slot && !row.surge) swap.set(slot, p); else extraP.push(p); /* a surge pod is one more beside the old ones (maxSurge), not in place of one */
      } else if (row.kind === 'Node') continue;
      else {
        const w = b.workloads.find(x => x.name === row.name && x.kind === row.kind);
        const bad = scope.filter(r => r.kind === 'Pod' && r.status[0] === 'error' && !r.surge).length; /* a surge pod that never started takes no ready slot away */
        /* the revision is the scenario's (the one the rollout made), and a rollback to the previous one makes a new revision with its template */
        const rv = DETAIL[row.name]?.rev ?? w?.rev;
        const specImg = (s.options ?? []).find(o => o.diff && /image:/.test(o.diff.before?.join('') ?? ''))?.diff.before.find(l => /image:/.test(l))?.split('image:')[1].trim(); /* the template the rollout moved to */
        if (w) wswap.set(w, { ...w, ...(specImg && !recovered && !verifying ? { image: specImg } : {}), rev: (recovered || verifying) && sc(sid)?.options?.some(o => /되돌리기|롤백/.test(o.title + o.kind)) && S_ROLLED(sid) ? rv + 1 : rv, rolledBack: !!((recovered || verifying) && sc(sid)?.options?.some(o => /되돌리기|롤백/.test(o.title + o.kind)) && S_ROLLED(sid)), status: recovered ? ['ok', 'Available'] : row.status, scenario: true, ready: recovered ? w.replicas : Math.max(0, w.replicas - bad), available: recovered ? w.replicas : Math.max(0, w.replicas - bad) });
        else extraW.push({ ...row, icon: row.icon, ns: s.ns, scenario: true, status: recovered ? ['ok', row.kind === 'Job' ? 'Complete' : 'Synced · Healthy'] : row.status, age: 3 * 60, replicas: 1, ready: recovered ? 1 : 0 });
      }
    }
    const pods = [...b.pods.map(p => swap.get(p) ?? p), ...extraP];
    const workloads = [...b.workloads.map(w => wswap.get(w) ?? w), ...extraW.filter(x => x.kind !== 'Application')];
    for (const p of pods) if (p.scenario && p.owner && wswap.has(p.owner)) p.owner = wswap.get(p.owner);
    /* node load relative to the cluster's average: most nodes sit near the middle, a few run hot */
    const avgC = b.nodes.reduce((a, n) => a + n.cpuReq / n.cpuCores, 0) / b.nodes.length, avgM = b.nodes.reduce((a, n) => a + n.memReq / n.memGi, 0) / b.nodes.length;
    /* each node holds the pods placed on it now (the scenario moves some): its pod count and requests are counted from the pods, never kept apart */
    const per = new Map();
    for (const p of pods) if (p.node && !/Pending/.test(p.status[1])) { const x = per.get(p.node) ?? { pods: 0, cpuReq: 0, memReq: 0 }; x.pods++; x.cpuReq += p.cpuReq ?? 0; x.memReq += p.memReq ?? 0; per.set(p.node, x); }
    const nodes = b.nodes.map(nd => ({ ...nd, ...(per.get(nd.name) ?? { pods: 0, cpuReq: 0, memReq: 0 }) })).map(nd => ({ ...nd, cpu: Math.round(nodeCpu(nd, avgC)(t)), mem: Math.round(nodeMem(nd, avgM)(t)) }));
    if (sid === 's4' && cid === 'wake-prod') {
      /* the removed node lingers NotReady until the controller drops it; after the fix the platform team's new node takes the pending pod */
      const node = (name, extra) => ({ kind: 'Node', icon: 'k8s-node', name, ns: '', pool: 'general', type: 'm6i.2xlarge', zone: 'ap-northeast-2a', cpuCores: 8, memGi: 32, podCap: POD_CAP['m6i.2xlarge'], ephGi: 80, version: 'v1.31.4-eks-a737599', kubelet: 'v1.31.4-eks-a737599', internalIP: name.replace('ip-', '').replaceAll('-', '.'), runtime: 'containerd://1.7.22', os: 'Amazon Linux 2023.6.20241111', labels: ['node.kubernetes.io/instance-type=m6i.2xlarge', 'topology.kubernetes.io/zone=ap-northeast-2a', 'eks.amazonaws.com/nodegroup=general'], cpu: 0, mem: 0, pods: 0, cpuReq: 0, memReq: 0, ...extra });
      if (recovered || verifying) nodes.push(node('ip-10-0-9-41', { taints: [], status: ['ok', 'Ready'], age: 300, ...(per.get('ip-10-0-9-41') ?? {}) }));
      else nodes.push(node('ip-10-0-9-3', { taints: ['node.kubernetes.io/unreachable:NoExecute'], lastSeen: -22 * 60, status: ['idle', L('sim.w.node.deleted')], age: 22 * 60 }));
      if (!recovered) { const n = nodes.find(x => x.name === 'ip-10-0-3-52'); n.cpu = 94; n.status = ['warn', 'Ready · CPU requests 98%']; }
    }
    /* an Application's health is its owned resources' (Argo CD's Deployment check): a rollout that has not become available is Progressing, Degraded after
       its progress deadline (600 s); its revision and sync time are the scenario's rollout record (one source with the timeline) */
    const ownedBy = a => workloads.find(x => x.ns === a.target.ns && x.kind === a.target.kind && x.name === a.target.name);
    const healthOf = (x, dep) => !x || x.status[0] === 'ok' || (x.ready ?? 0) >= (x.replicas ?? 0) ? 'Healthy' : dep && t - dep.at > 600 ? 'Degraded' : 'Progressing';
    const apps = b.apps.map(a => {
      const x = extraW.find(e => e.kind === 'Application' && (a.name === e.name || a.target.name === e.name)), dep = (s.changes ?? []).find(c => c.commit && c.title === `${a.target.kind} ${a.target.name}`);
      if (x) return { ...a, status: x.status, scenario: true, ...(sid === 's5' ? { revision: COMMITS.ordersNew, syncedAt: s.changes?.find(c => c.lane === 'deploy')?.at } : {}) };
      if (!dep) return a;
      const h = recovered ? 'Healthy' : healthOf(ownedBy(a), dep);
      return { ...a, scenario: true, revision: recovered && S_ROLLED(sid) ? hex7(`${a.repo} revert ${dep.commit}`) : dep.commit, previous: recovered && S_ROLLED(sid) ? dep.commit : dep.previous, syncedAt: recovered && S_ROLLED(sid) ? null : dep.at, /* after a rollback the revision is the revert commit, synced when the fix synced (the engine's record) */ status: [h === 'Healthy' ? 'ok' : h === 'Degraded' ? 'error' : 'warn', `Synced · ${h}`] };
    });
    if (sid === 's5' && cid === 'wake-prod' && !apps.some(a => a.scenario)) apps.unshift({ ...extraW.find(e => e.kind === 'Application'), repo: 'acme/orders-deploy', path: 'apps/orders', revision: COMMITS.ordersNew, previous: COMMITS.ordersGood, syncedAt: s.changes?.find(c => c.lane === 'deploy')?.at, auto: true });
    const problems = pods.filter(p => p.status[0] === 'error' || p.status[0] === 'warn' || p.status[0] === 'busy').sort((x, y) => (y.scenario ? 1 : 0) - (x.scenario ? 1 : 0));
    const unavailable = workloads.filter(w => ['warn', 'error'].includes(w.status[0]));
    const agent = agentOf(conn, t, cid), tools = toolsOf(sid, conn, cid, t, apps.length);
    return { sid, cluster: b.cluster, namespaces: b.namespaces, nodes, workloads, pods, apps, problems, unavailable, tools, agent, quiet: !!s.quiet, sources: sourcesOf(tools, agent, t), denied: conn === 'limited' ? DENIED_LIMITED : [],
      /* the Kubernetes values above are the agent's cache: with the agent down they are as of its last heartbeat, never "now" */
      stale: agent.state !== 'ok', asOf: agent.last };
  });
}

/* ---------- 도구와 에이전트 연결(클러스터마다 섞인 상태) ---------- */
export const STATE_WORD = { ok: L('sim.w.state.ok'), limited: L('sim.w.state.limited'), perm: L('sim.w.state.perm'), idle: L('sim.w.state.idle'), error: L('sim.w.state.error'), busy: L('sim.w.state.busy') };
/* when the simulated outage began (seconds from t0): after the incident's evidence was read, so that evidence stays as read; the dev cluster's agent stopped two days before */
export const DOWN_AT = 20;
const DEV_LAST = -(2 * D + 3 * H + 17 * 60);
/* the kinds a limited (read-restricted) agent cannot list */
const DENIED_LIMITED = ['Secret', 'Certificate'];
/** a tool's answer time in milliseconds: the one figure its detail, its card and its chart quote */
export const TOOL_LATENCY = { prometheus: 380, loki: 1200, grafana: 210, argocd: 160, github: 240 };
const lastOf = (state, t, cid) => (cid === 'wake-dev' ? DEV_LAST : ['error', 'idle', 'perm'].includes(state) ? Math.min(t, DOWN_AT) - 2 : t - 2);
function toolsOf(sid, conn = 'ok', cid = 'wake-prod', t = 0, apps = 0) {
  const down = conn === 'tools-down', limited = conn === 'limited', dev = cid === 'wake-dev', stage = cid === 'wake-stage';
  const ms = id => L('sim.w.tool.latency', { ms: TOOL_LATENCY[id].toLocaleString('en-US') });
  const list = [
    { id: 'prometheus', name: 'Prometheus', icon: 'brand-prometheus', role: L('sim.w.role.metrics'), where: 'monitoring/prometheus-operated:9090', version: 'v2.53.2', state: down ? 'error' : dev ? 'idle' : 'ok', detail: down ? L('sim.w.tool.timeout') : dev ? L('sim.w.tool.noService') : L('sim.w.tool.prometheus.detail', { lat: ms('prometheus') }), uses: L('sim.w.tool.prometheus.uses') },
    { id: 'loki', name: 'Loki', icon: 'brand-loki', role: L('sim.w.role.logs'), where: 'monitoring/loki-gateway:80', version: '3.2.0', state: down ? 'error' : dev ? 'idle' : 'ok', detail: down ? L('sim.w.tool.timeout') : dev ? L('sim.w.tool.noService') : L('sim.w.tool.loki.detail', { lat: ms('loki') }), uses: L('sim.w.tool.loki.uses') },
    { id: 'grafana', name: 'Grafana', icon: 'brand-grafana', role: L('sim.w.role.dashboard'), where: 'monitoring/grafana:3000', version: '11.3.0', state: stage ? 'perm' : dev ? 'idle' : 'ok', detail: stage ? L('sim.w.tool.grafana.noToken') : L('sim.w.tool.grafana.detail'), uses: L('sim.w.role.dashboard') },
    { id: 'argocd', name: 'Argo CD', icon: 'brand-argo', role: 'GitOps', where: 'argocd/argocd-server', version: 'v2.13.1', state: limited ? 'perm' : dev ? 'idle' : 'limited', detail: limited ? L('sim.w.tool.argocd.noPerm') : L('sim.w.tool.argocd.detail', { n: apps.toLocaleString('en-US') }), uses: L('sim.w.tool.argocd.uses') },
    { id: 'github', name: 'GitHub', icon: 'brand-github', role: L('sim.w.role.change'), where: L('sim.w.tool.github.where'), version: '', state: down ? 'idle' : 'ok', detail: down ? L('sim.w.tool.github.expired') : L('sim.w.tool.github.detail'), uses: L('sim.w.tool.github.uses') },
    { id: 'jvm', name: 'jmx-exporter', icon: 'brand-prometheus', role: L('sim.w.role.metrics'), where: L('sim.w.tool.noService'), version: '', state: 'idle', detail: L('sim.w.tool.noExporter', { ns: 'payments' }), uses: L('sim.w.tool.jvm.uses') },
    { id: 'pgexporter', name: 'postgres-exporter', icon: 'brand-postgresql', role: L('sim.w.role.metrics'), where: L('sim.w.tool.noService'), version: '', state: 'idle', detail: L('sim.w.tool.noExporter', { ns: 'orders' }), uses: L('sim.w.tool.pg.uses') },
  ];
  /* every tool says when it last answered: an exporter that was never installed has no time */
  return list.map(x => ({ ...x, latencyMs: x.state === 'ok' || x.state === 'limited' ? TOOL_LATENCY[x.id] ?? null : null, last: ['jvm', 'pgexporter'].includes(x.id) ? null : lastOf(x.state, t, cid) }));
}
function agentOf(conn = 'ok', t = 0, cid = 'wake-prod') {
  const down = conn === 'agent-down' || cid === 'wake-dev', last = down ? lastOf('error', t, cid) : t - (2 + (Math.abs(Math.round(t)) % 5));
  return { name: 'wake-agent', ns: 'monitoring', version: cid === 'wake-dev' ? '0.8.7' : '0.9.2', state: down ? 'error' : 'ok', last, beat: ago(t - last), latencyMs: down ? null : 38,
    detail: down ? L('sim.w.agent.down') : L('sim.w.agent.ok', { ms: 38 }), verbs: 'get · list · watch', scope: L('sim.w.agent.scope'), watch: down ? 0 : 41, cache: down ? L('sim.w.agent.cacheStopped') : L('sim.w.agent.cache') };
}
/** how long ago, in the largest unit: 2초 전 · 4분 전 · 2일 전 */
export const ago = s => { s = Math.max(0, Math.round(s)); return s < 60 ? L('sim.fmt.agoSec', { n: s }) : s < H ? L('sim.fmt.agoMin', { n: Math.floor(s / 60) }) : s < D ? L('sim.fmt.agoHour', { n: Math.floor(s / H) }) : L('sim.fmt.agoDay', { n: Math.floor(s / D) }); };
/** every source a value can come from, with its connection state, when it last answered and whether a "now" value from it is stale:
 *  kubernetes is the agent's watch cache (Pod, Node, events, workloads); a down source keeps its last values, which are never shown as current */
function sourcesOf(tools, agent, t) {
  const of = (id, name, state, last) => ({ id, name, state, last, stale: !['ok', 'limited'].includes(state), lastText: last == null ? '' : `${ymd(last) === ymd(t) ? hms(last) : `${ymd(last)} ${hms(last)}`} · ${ago(t - last)}`, lastDate: last == null ? '' : ymd(last) });
  return Object.fromEntries([of('kubernetes', 'Kubernetes API', agent.state, agent.last), ...tools.map(x => of(x.id, x.name, x.state, x.last))].map(x => [x.id, x]));
}
/** the source of a value and whether it may be shown as now: `{ source, state, last, stale, lastText }` */
export const freshness = (w, id) => w.sources?.[id] ?? null;

/* ---------- 지표: 30일까지, 하루·주 주기와 배포 튀어오름 ---------- */
export const seriesOf = (fn, from, to, n = 96) => { const dt = (to - from) / (n - 1); return Array.from({ length: n }, (_, i) => { const at = from + i * dt; const v = fn(at); return { at, value: v == null ? null : Math.round(v * 100) / 100, joinPrevious: i > 0 }; }); /* a null is a gap (nothing collected) */ };
const deploySpike = at => { const d = ((at % (6 * H)) + 6 * H) % (6 * H); return d < 600 ? (1 - d / 600) * 6 : 0; };
export function podMem(p, sid, phase) {
  const seed = hash(p.name) % 13, base0 = p.memReq * p.use;
  const loop = p.scenario && /OOM/.test(p.status[1] + (sc(sid)?.symptom ?? '')) ? sc(sid)?.crashLoop : null, runs = loop ? crashTimes(loop, 40) : [];
  return at => {
    /* a crash-looping container: each run fills toward its limit and is killed (the scrape every 15 s sees at most 498Mi of 512Mi; the kill falls between scrapes);
       between runs the kubelet waits its back-off and there is no container, so no sample (a gap, never a line drawn across it) */
    if (runs.length && phase !== 'resolved' && at >= runs[0].start) { const r = runs.find(x => at >= x.start && at <= x.end); return r ? Math.min(p.memLim * .973, p.memLim * (.72 + .3 * Math.min(1, (at - r.start) / (loop.life * .7)))) : null; }
    return Math.max(8, base0 + base0 * .07 * wave(seed, at) + base0 * .05 * daily(at));
  };
}
export const podCpu = (p, sid) => { const seed = hash(p.name) % 11 + 3, i = sc(sid)?.impact; return at => Math.max(2, p.cpuReq * (p.use - .15) * (1 + .3 * daily(at) + weekly(at)) + p.cpuReq * .12 * wave(seed, at) + (p.scenario && i?.load && at > i.from ? p.cpuReq * i.load : 0)); };
/** a node's CPU and memory use (%) over time: the cluster figure is the mean of these, so the top node is never below the cluster */
export const nodeCpu = (nd, avgC) => t => Math.max(6, Math.min(93, 42 + 22 * (nd.cpuReq / nd.cpuCores / avgC - 1) + 5 * wave(hash(nd.name) % 9, t) + 9 * daily(t)));
export const nodeMem = (nd, avgM) => t => Math.max(10, Math.min(92, 58 + 20 * (nd.memReq / nd.memGi / avgM - 1) + 3 * wave(hash(nd.name) % 7 + 1, t)));
const loadOf = (cid, k) => cached(`load:${cid}:${k}`, () => { const ns = base(cid).nodes, avg = ns.reduce((a, n) => a + (k === 'cpu' ? n.cpuReq / n.cpuCores : n.memReq / n.memGi), 0) / ns.length; return ns.map(n => (k === 'cpu' ? nodeCpu(n, avg) : nodeMem(n, avg))); });
/** the cluster's CPU and memory use (%): the mean of its nodes' (the basis the per-node figures share) */
export const clusterCpu = (sid, cid = 'wake-prod') => at => { const fs = loadOf(cid, 'cpu'); return fs.reduce((a, f) => a + f(at), 0) / fs.length; };
export const clusterMem = (sid, cid = 'wake-prod') => at => { const fs = loadOf(cid, 'mem'); return fs.reduce((a, f) => a + f(at), 0) / fs.length; };
export const errorRate = (sid, fixAt = Infinity) => at => {
  /* during an incident the ratio is the scenario's own figure (impact.during): every screen, the burn rate and the failed requests read this one value */
  const i = sc(sid)?.impact;
  if (i && at > i.from && at < fixAt) return i.during;
  return Math.max(0, .22 + .05 * wave(5, at) + .04 * daily(at) + (deploySpike(at) > 4 ? .2 : 0) + (at > -9 * D - 2 * H && at < -9 * D - H ? 1.6 : 0));
};
export const requestRate = at => Math.max(800, 5200 + 3400 * daily(at) + 1500 * weekly(at) + 300 * wave(9, at));
/** the 5xx figures of an incident over one window, all from the one query and series: the ratio (mean and now), the burn rate, the requests served and failed.
 *  start/end: the window (relative seconds); fixAt: when the fix took effect (the ratio drops there) */
export function impactNumbers(sid, start, end, fixAt = Infinity) {
  const i = sc(sid)?.impact; if (!i) return null;
  const fn = errorRate(sid, fixAt), from = Math.floor(start / SCRAPE) * SCRAPE + SCRAPE, pts = []; /* the scrapes inside the window */
  for (let at = from; at < end; at += SCRAPE) pts.push(fn(at));
  const mean = pts.length ? pts.reduce((a, v) => a + v, 0) / pts.length : fn(end), secs = Math.max(0, end - start), requests = Math.round(i.rps * secs);
  const failed = Math.round(pts.reduce((a, v) => a + i.rps * SCRAPE * v / 100, 0) * (pts.length ? secs / (pts.length * SCRAPE) : 0));
  const peak = Math.max(...pts, fn(end)), symptomTo = Math.min(end, fixAt);
  /* every burn rate names its window: the last hour to `end`, the impact window, and the 5-minute peak; budget = failed requests over the 30-day allowance (SLO) */
  const mean1h = (() => { const q = []; for (let at = Math.floor((end - H) / SCRAPE) * SCRAPE + SCRAPE; at <= end; at += SCRAPE) q.push(fn(at)); return q.reduce((a, v) => a + v, 0) / q.length; })();
  const r1 = v => Math.round(v * 10) / 10, budget = i.rps * 30 * D * (100 - SLO) / 100;
  const burns = [{ id: '1h', label: L('sim.w.burn.1h'), value: r1(burnRate(mean1h)), from: end - H, to: end }, { id: 'incident', label: L('sim.w.burn.incident'), value: r1(burnRate(mean)), from: start, to: end }, { id: 'peak', label: L('sim.w.burn.peak'), value: r1(burnRate(peak)), from: start, to: end }];
  return { label: i.label, query: i.query, service: i.service, ns: i.ns, from: start, to: end, symptomTo, secs, rps: i.rps, mean: Math.round(mean * 100) / 100, now: fn(end), peak, burnNow: r1(burnRate(fn(end))), burns, budgetUsed: Math.round(failed / budget * 1000) / 10, slo: SLO, requests, failed, limit: i.limit, base: i.base, during: i.during };
}
/** a batch run held up by the incident: when it was due, when it resumed (the fix), when it completes, what it processed, and how late it was */
export function batchRun(sid, t, fixAt = Infinity) {
  const u = sc(sid)?.affects; if (u?.kind !== 'batch') return null;
  const resumed = Number.isFinite(fixAt) && t >= fixAt ? fixAt : null, done = resumed != null ? resumed + u.runFor : null, complete = done != null && t >= done;
  return { job: u.job, due: u.run, resumed, done, complete, waited: (resumed ?? t) - u.run, items: u.items, processed: complete ? u.items : 0, delay: complete ? done - (u.run + u.runFor) : null, deadline: u.deadline, policy: u.policy };
}
/** what users felt, per scenario kind, each item with its value, structured numbers, the query or source it comes from, and whether it is measured,
 *  estimated or not known yet (then its owner and next check). final: the incident has ended (resolved): the values are the final ones, never "now" */
export function userImpactOf(sid, t, end = t, fixAt = Infinity, final = false) {
  const s = sc(sid), u = s?.affects; if (!u) return [];
  const until = Math.min(end, t);
  if (u.kind === 'api') { const x = impactNumbers(sid, s.impact.from, until, fixAt); return [
    final ? { id: 'ratio', label: s.impact.label, value: L('sim.w.ui.ratioFinal', { peak: x.peak.toFixed(1), from: hm(x.from), to: hm(x.symptomTo), now: x.now.toFixed(1) }), peak: x.peak, from: x.from, to: x.symptomTo, now: x.now, source: 'Prometheus', query: x.query, state: 'measured' }
      : { id: 'ratio', label: s.impact.label, value: L('sim.w.ui.ratio', { now: x.now.toFixed(1), base: x.base, limit: x.limit, from: hm(x.from) }), now: x.now, from: x.from, source: 'Prometheus', query: x.query, state: 'measured' },
    { id: 'failed', label: L('sim.w.ui.failedL'), value: L('sim.w.ui.failed', { n: num(x.failed), all: num(x.requests), rps: num(x.rps), from: hm(x.from), to: hm(final ? x.symptomTo : x.to) }), failed: x.failed, requests: x.requests, source: 'Prometheus', query: x.query, state: 'measured' },
    ...x.burns.filter(b => final || b.id !== 'peak').map(b => ({ id: `burn-${b.id}`, label: b.label, value: L('sim.w.ui.burn', { x: b.value.toFixed(1), slo: SLO }), burn: b.value, from: b.from, to: b.to, source: 'Prometheus', query: x.query, state: 'measured' })),
    ...(final ? [{ id: 'budget', label: L('sim.w.ui.budgetL'), value: L('sim.w.ui.budget', { pct: x.budgetUsed, slo: SLO }), budgetUsed: x.budgetUsed, source: 'Prometheus', query: x.query, state: 'measured' }] : [])]; }
  if (u.kind === 'capacity') return [
    { id: 'ready', label: `Deployment ${u.service}`, value: final ? L('sim.w.ui.readyFinal', { ready: u.want, desired: u.want, during: u.ready }) : L('sim.w.ui.ready', { ready: u.ready, desired: u.want }), ready: final ? u.want : u.ready, desired: u.want, readyDuring: u.ready, source: 'Kubernetes API', state: 'measured' },
    { id: 'err', label: `${u.service} 5xx`, value: L('sim.w.ui.noUser', { v: u.errRatio }), source: 'Prometheus', query: u.query, state: 'estimated' }];
  if (u.kind === 'batch') { const r = batchRun(sid, t, fixAt), wait = Math.round(r.waited / 60); return [
    r.resumed == null ? { id: 'run', label: L('sim.w.ui.runL'), value: L('sim.w.ui.run', { job: r.job, at: hm(r.due), dur: wait }), waited: r.waited, source: 'Kubernetes API', state: 'measured' }
      : { id: 'run', label: L('sim.w.ui.runL'), value: r.complete ? L('sim.w.ui.runDone', { job: r.job, at: hm(r.due), resumed: hm(r.resumed), done: hm(r.done), n: num(r.items), delay: Math.round(r.delay / 60) }) : L('sim.w.ui.runResumed', { job: r.job, at: hm(r.due), resumed: hm(r.resumed), dur: wait }), waited: r.waited, resumed: r.resumed, done: r.done, complete: r.complete, delay: r.delay, source: 'Kubernetes API', state: 'measured' },
    { id: 'items', label: L('sim.w.ui.itemsL'), value: r.complete ? L('sim.w.ui.itemsDone', { n: num(r.items) }) : L('sim.w.ui.items', { n: num(r.items) }), items: r.items, processed: r.processed, source: 'Kubernetes API', state: r.complete ? 'measured' : 'estimated' },
    ...(r.resumed == null ? [{ id: 'deadline', label: L('sim.w.ui.deadlineL'), value: L('sim.w.ui.deadline', { at: hm(u.deadline), policy: u.policy }), deadline: u.deadline, source: 'Kubernetes API', state: 'measured' }] : [])]; }
  if (u.kind === 'deploy') {
    const fu = (s.options ?? []).find(o => !o.disabled)?.followUps?.find(f => f.from === 'cause');
    return [
      { id: 'blocked', label: L('sim.w.ui.blockedL'), value: L('sim.w.ui.blocked', { blocked: u.blocked, running: u.running }), source: 'Kubernetes API', state: 'measured' },
      { id: 'err', label: `${u.service} 5xx`, value: L('sim.w.ui.noUser', { v: u.errRatio }), source: 'Prometheus', query: u.query, state: 'estimated' },
      final && fu ? { id: 'dep', label: L('sim.w.ui.depL'), value: L('sim.w.ui.depFollow', { owner: fu.owner, due: fu.dueDate }), source: '', state: 'unknown', owner: fu.owner, due: fu.dueDate }
        : { id: 'dep', label: L('sim.w.ui.depL'), value: L('sim.w.ui.dep', { owner: u.owner, at: hm(u.next) }), source: '', state: 'unknown', owner: u.owner, next: u.next }]; }
  if (u.kind === 'auth') { const on = until > u.from && until < fixAt, ratio = on ? u.during : u.base, secs = Math.max(0, Math.min(until, fixAt) - u.from), n = Math.round(u.rps * secs * u.during / 100); return [
    { id: 'login', label: L('sim.w.ui.loginL'), value: final ? L('sim.w.ui.loginFinal', { peak: u.during, n: num(n), from: hm(u.from), to: hm(Math.min(until, fixAt)), now: u.base }) : L('sim.w.ui.login', { now: ratio, base: u.base, n: num(n), from: hm(u.from) }), peak: u.during, failed: n, from: u.from, source: 'Prometheus', query: u.query, state: 'measured' },
    { id: 'ready', label: 'Deployment auth', value: final ? L('sim.w.ui.readyFinal', { ready: u.want, desired: u.want, during: u.ready }) : L('sim.w.ui.ready', { ready: u.ready, desired: u.want }), ready: final ? u.want : u.ready, desired: u.want, readyDuring: u.ready, source: 'Kubernetes API', state: 'measured' }]; }
  return [];
}

/* ---------- 이벤트: 하루 수만 건(분당 약 20건), 시간 묶음으로 만들고 캐시 ---------- */
const SOURCE_OF = { Scheduled: 'default-scheduler', FailedScheduling: 'default-scheduler', SuccessfulCreate: 'replicaset-controller', SuccessfulDelete: 'replicaset-controller', ScalingReplicaSet: 'deployment-controller', BackoffLimitExceeded: 'job-controller', Completed: 'job-controller', SawCompletedJob: 'cronjob-controller', NodeNotReady: 'node-controller', RemovingNode: 'node-controller', OperationCompleted: 'argocd-application-controller', OperationStarted: 'argocd-application-controller' };
/* every event comes from what the object is doing now: pods born in the last day were scheduled and started; the pods they replaced were stopped
   and deleted; CronJobs run on their schedule (their job pods start, complete and are cleaned up); a pod in trouble repeats the warning of its state */
/* who reports an event depends on the object it is about: the controller of that kind (a CronJob's job create/delete is the cronjob-controller's,
   a Job's pod create is the job-controller's), the scheduler for scheduling, the kubelet for what happens on a node */
const CONTROLLER_OF = { ReplicaSet: 'replicaset-controller', Deployment: 'deployment-controller', StatefulSet: 'statefulset-controller', DaemonSet: 'daemonset-controller', CronJob: 'cronjob-controller', Job: 'job-controller', Node: 'node-controller', Application: 'argocd-application-controller' };
const sourceOf = (reason, kind) => /^(SuccessfulCreate|SuccessfulDelete|FailedCreate|SawCompletedJob|ScalingReplicaSet)$/.test(reason) ? CONTROLLER_OF[kind] ?? SOURCE_OF[reason] : SOURCE_OF[reason] ?? 'kubelet';
function hourEvents(cid, h, w) {
  return cached(`ev:${cid}:${h}`, () => {
    const out = [], from = h * H, to = from + H;
    const ev = (at, type, reason, kind, name, ns, msg, owner, n = 1) => { if (at >= from && at < to) out.push({ at, type, reason, source: sourceOf(reason, kind), msg, n, kind, name, ns, owner }); };
    for (const p of w.pods) {
      const born = -p.age;
      if (p.age < D && !p.scenario && p.status[0] === 'ok') {
        const own = { kind: p.owner.kind, name: p.owner.name };
        ev(born, 'Normal', 'Scheduled', 'Pod', p.name, p.ns, `Successfully assigned ${p.ns}/${p.name} to ${p.node}`, own);
        ev(born + 2, 'Normal', 'Pulled', 'Pod', p.name, p.ns, `Container image "${p.image}" already present on machine`, own);
        ev(born + 3, 'Normal', 'Created', 'Pod', p.name, p.ns, `Created container ${p.owner.name}`, own);
        ev(born + 3, 'Normal', 'Started', 'Pod', p.name, p.ns, `Started container ${p.owner.name}`, own);
        const old = `${p.owner.name}-${sfx(p.owner.name + 'old', 5)}-${sfx(p.name + 'old', 5)}`;
        if (p.owner.kind === 'Deployment') { ev(born - 1, 'Normal', 'SuccessfulCreate', 'ReplicaSet', `${p.owner.name}-${sfx(p.owner.name + 'rs', 5)}`, p.ns, `Created pod: ${p.name}`, own); ev(born + 40, 'Normal', 'Killing', 'Pod', old, p.ns, `Stopping container ${p.owner.name}`, own); ev(born + 70, 'Normal', 'SuccessfulDelete', 'ReplicaSet', `${p.owner.name}-${sfx(p.owner.name + 'old', 5)}`, p.ns, `Deleted pod: ${old}`, own); }
      }
      /* a pod in trouble keeps reporting the warning of its own state, the count growing with each repeat */
      if (!p.scenario && p.status[0] === 'warn') {
        const [reason, msg, every] = /Evicted/.test(p.status[1]) ? ['Evicted', 'The node was low on resource: ephemeral-storage. Threshold quantity: 10%, available: 6%.', 0]
          : /Insufficient/.test(p.status[1]) ? ['FailedScheduling', (n => `0/${n} nodes are available: ${n} Insufficient nvidia.com/gpu. preemption: 0/${n} nodes are available: ${n} Preemption is not helpful for scheduling.`)(w.nodes.filter(x => x.status[0] !== 'idle').length), 300]
            : ['FailedMount', 'MountVolume.SetUp failed for volume "certs" : secret "search-tls" not found', 120];
        if (every) for (let at = Math.max(from, born + 5); at < to && at <= 0; at += every) ev(at, 'Warning', reason, 'Pod', p.name, p.ns, msg, { kind: p.owner.kind, name: p.owner.name }, 1 + Math.floor((at - born) / every));
        else ev(born + p.age - 2 * H, 'Warning', reason, 'Pod', p.name, p.ns, msg, { kind: p.owner.kind, name: p.owner.name });
      }
    }
    /* CronJobs: each run creates a job, its pod starts and completes, and the oldest job is cleaned up */
    for (const cj of w.workloads.filter(x => x.kind === 'CronJob')) {
      if (cj.suspend) continue; /* a suspended CronJob creates no jobs */
      const period = cj.every ?? 900; /* the same schedule the CronJob table and run history show */
      for (let at = cronLast(cj, from) + period; at < to; at += period) {
        const id = String(Math.floor((T0 + at) / 60)), job = `${cj.name}-${id}`, pod = `${job}-${sfx(job, 5)}`, own = { kind: 'CronJob', name: cj.name };
        ev(at, 'Normal', 'SuccessfulCreate', 'CronJob', cj.name, cj.ns, `Created job ${job}`, own);
        ev(at + 1, 'Normal', 'Scheduled', 'Pod', pod, cj.ns, `Successfully assigned ${cj.ns}/${pod} to ${w.nodes[hash(pod) % w.nodes.length].name}`, own);
        ev(at + 3, 'Normal', 'Pulled', 'Pod', pod, cj.ns, `Container image "${cj.image}" already present on machine`, own);
        ev(at + 3, 'Normal', 'Created', 'Pod', pod, cj.ns, `Created container ${cj.name}`, own);
        ev(at + 4, 'Normal', 'Started', 'Pod', pod, cj.ns, `Started container ${cj.name}`, own);
        const took = 20 + hash(job) % 200;
        ev(at + took, 'Normal', 'Completed', 'Job', job, cj.ns, 'Job completed', own);
        ev(at + took + 5, 'Normal', 'SawCompletedJob', 'CronJob', cj.name, cj.ns, `Saw completed job: ${job}, status: Complete`, own);
        ev(at + took + 6, 'Normal', 'SuccessfulDelete', 'CronJob', cj.name, cj.ns, `Deleted job ${cj.name}-${Number(id) - 3 * period / 60}`, own);
      }
    }
    return out;
  });
}
/** events between from and to (seconds from t0), newest first; the scenario's own are added; at most seven days back */
export function eventsIn(w, sid, from, to, cid = 'wake-prod') {
  from = Math.max(from, to - 7 * D); /* Wake keeps events for 7 days (Kubernetes itself keeps an hour) */
  const out = [];
  for (let h = Math.floor(from / H); h <= Math.floor(to / H); h++) for (const e of hourEvents(cid, h, w)) if (e.at >= from && e.at <= to) out.push(e);
  const s = sc(sid) ?? {};
  if (cid === 'wake-prod') for (const [name, d] of Object.entries(DETAIL)) {
    const row = (s.scope ?? []).find(r => (r.key ?? r.name) === name);
    if (!row) continue;
    d.events.forEach(e => { const at = e.at; if (at >= from && at <= to) out.push({ at, type: e.type, reason: e.reason, source: SOURCE_OF[e.reason] ?? 'kubelet', msg: e.msg, n: e.n, kind: row.kind, name: row.name, ns: row.kind === 'Node' ? '' : s.ns, scenario: true }); });
  }
  /* first seen: a repeated event is one object whose count grows; it was first seen n-1 intervals before the last time */
  return out.sort((a, b) => b.at - a.at).map((e, i) => ({ ...e, first: e.at - (e.n - 1) * (e.reason === 'BackOff' ? 40 : 75), id: [e.at, e.kind, e.name, e.ns, e.owner?.kind ?? '', e.owner?.name ?? '', i].join('|') }));
}

/** the events of a window as kubectl lists them: one row per object and reason, its count the occurrences (Event.count). Every number a card shows
 *  (rows, Warning rows, a timeline point's badge) is counted from these rows, never from the occurrences */
export function eventSummary(w, sid, from, to, { cid = 'wake-prod', ns = null, type = 'all' } = {}) {
  const rows = new Map();
  for (const e of eventsIn(w, sid, from, to, cid)) {
    if ((ns && e.ns !== ns) || (type !== 'all' && e.type !== type)) continue;
    const key = `${e.kind}/${e.ns}/${e.name}|${e.reason}`, r = rows.get(key);
    if (!r) rows.set(key, { key, type: e.type, reason: e.reason, kind: e.kind, name: e.name, ns: e.ns, msg: e.msg, source: e.source, last: e.at, first: e.first, count: e.n, scenario: !!e.scenario });
    else { r.count = Math.max(r.count, e.n); r.first = Math.min(r.first, e.first); }
  }
  const list = [...rows.values()].sort((a, b) => b.last - a.last), warn = list.filter(r => r.type === 'Warning');
  return { rows: list, objects: list.length, warning: warn.length, normal: list.length - warn.length, occurrences: list.reduce((a, r) => a + r.count, 0), warningOccurrences: warn.reduce((a, r) => a + r.count, 0) };
}

/* ---------- 변경: 30일 치 배포·설정·인프라 ---------- */
export function changesOf(sid, cid = 'wake-prod') {
  useClock(sid);
  return cached(`ch:${cid}:${sid}`, () => {
    const s = cid === 'wake-prod' ? sc(sid) ?? {} : {}, own = s.changes ?? [], w = base(cid), out = [...own];
    const deps = w.workloads.filter(x => x.kind === 'Deployment');
    for (let i = 0; i < (cid === 'wake-prod' ? 260 : 60); i++) {
      const x = deps[hash(cid + 'chg' + i) % deps.length], at = -Math.floor(rnd(cid + 'cat' + i) * 30 * D) - 900;
      if (own.some(o => o.title.endsWith(' ' + x.name))) continue;
      const r = rnd(cid + 'ck' + i);
      out.push(r < .7 ? { id: 'g' + i, lane: 'deploy', at, tone: 'run', kind: L('sim.hist.rollout'), title: `Deployment ${x.name}`, text: L('sim.w.change.rollout', { from: x.rev - 1, to: x.rev, commit: hex7(x.name + i) }) }
        : r < .85 ? { id: 'g' + i, lane: 'config', at, tone: 'neutral', kind: 'ConfigMap', title: `ConfigMap ${x.name}-config`, text: 'LOG_LEVEL info → warn' }
          : { id: 'g' + i, lane: 'infra', at, tone: 'neutral', kind: 'HPA Scale', title: `HorizontalPodAutoscaler ${x.name}`, text: `replicas ${x.replicas - 1} → ${x.replicas}` });
    }
    out.push({ id: 'n1', lane: 'infra', at: -9 * H, end: -9 * H + 900, tone: 'warn', kind: L('sim.w.change.nodeState'), title: 'Node ip-10-0-8-11', text: L('sim.w.change.diskPressure') });
    out.push({ id: 'n2', lane: 'infra', at: -2 * D - 9 * H, tone: 'neutral', kind: L('sim.w.change.nodeAdd'), title: 'Node ip-10-0-2-40', text: 'cluster-autoscaler · general 23 → 24' });
    return out;
  });
}

/* ---------- 로그: 바쁜 서비스는 분당 수천 줄, 구간을 물을 때만 만든다 ---------- */
const INFO = ['GET /api/v1/{n} 200 {ms}ms', 'POST /api/v1/{c} 201 {ms}ms', 'cache hit ratio 0.{r}', 'connection pool active={a} idle={i} max=20', 'GET /healthz 200 1ms', 'span exported trace_id={tid}', 'request completed user_id=[마스킹] {ms}ms'];
/** lines per second of a pod: busy front services write thousands a minute */
export const logRate = p => p.scenario ? 11 :  /api|gateway|ingress|web|checkout|payments/.test(p.owner.name) ? 40 + hash(p.name) % 20 : 2 + hash(p.name) % 6;
/** a pod's log evidence of the scenario, if any (its query names the pod, or the pod's workload) */
const logEvidence = (p, sid) => (sc(sid)?.evidence ?? []).find(e => e.kind === '로그' && (e.target?.name === p.name || e.target?.name === p.owner?.name || new RegExp(`pods/log ${p.name}\\b`).test(e.query)));
/* a crash-looping pod's previous container: its whole life is the log evidence's window (it started at `from`, wrote its last line and was killed at `to`),
   else the usual interval; its exit code from its last termination reason (OOMKilled is 137, an application error 1) */
export function prevContainer(p, sid) {
  const e = logEvidence(p, sid), oom = /OOM/.test(p.lastReason ?? p.status[1]), prev = e?.target?.previous;
  const end = prev ? e.to : -12, life = prev ? e.to - e.from : oom ? CRASH_EVERY : 90;
  return { end, start: end - life, life, exit: oom ? 137 : 1, reason: oom ? 'OOMKilled' : 'Error', id: containerId(p.name, end) };
}
/** a container's runtime id as the kubelet reports it (containerd://…): one per container run */
export const containerId = (pod, end) => `containerd://${hex7(pod + end)}${hex7(pod + 'c' + end)}${hex7(pod + 'd' + end)}`.slice(0, 33);
/* exact: a container's end (a crash loop's previous container) is read to the second; otherwise lines are made per minute */
export function logsOf(p, sid, t, range = 900, exact = false) {
  t = exact ? Math.floor(t) : Math.floor(t / 60) * 60;
  const s = sc(sid) ?? {}, fixed = p.scenario && !p.replaced, errUntil = p.errUntil ?? Infinity;
  /* the key names everything the lines depend on: the same pod read as the incident's container and as its replacement are two logs */
  return cached(`log:${p.ns}/${p.name}:${sid}:${t}:${range}:${fixed ? 1 : 0}:${p.age}:${errUntil}`, () => {
    /* a container that never ran has no log; a pod's lines start when it was born */
    if (/Pending|ContainerCreating|ImagePull|ErrImagePull/.test(p.status[1])) return [];
    const born = t - p.age; if (born > t - range) range = Math.max(0, t - born);
    const rate = logRate(p), n = Math.min(Math.round(range * rate), 60000), lines = new Array(n), from = t - range;
    for (let i = 0; i < n; i++) {
      const at = from + (i / n) * range, sd = `${p.name}${Math.floor(at)}${i}`, r = hash(sd) % 1000;
      const res = p.owner.name.split('-')[0], msg = INFO[hash(sd + 'm') % INFO.length].replace('{n}', [res, res + '/' + (r % 900 + 100), res + '/search', res + '/status'][r % 4]).replace('{c}', res).replace('{ms}', 3 + r % 90).replace('{r}', 90 + hash(p.name + Math.floor(at / 300)) % 6).replace('{a}', 4 + (hash(p.name + Math.floor(at / 60)) % 9)).replace('{i}', 16 - (hash(p.name + Math.floor(at / 60)) % 9)).replace('{tid}', (hex7(sd) + hex7(sd + 'b') + hex7(sd + 'c') + hex7(sd + 'd') + hex7(sd + 'e')).slice(0, 32)); /* a pool keeps its size, a hit ratio moves slowly, a trace id is 32 hex digits */
      /* a database writes database logs, a web service request logs */
      const db = /(^|-)(db|postgres|redis|kafka|mysql|mongo)(-|$)/.test(p.owner.name);
      const dbMsg = [`LOG:  checkpoint complete: wrote ${200 + r * 3} buffers (${(r % 40) / 4}%); write=${(r % 90) / 10} s`, `LOG:  duration: ${(r % 300) / 10} ms  statement: SELECT * FROM ${res}_items WHERE id = $1`, `LOG:  automatic vacuum of table "${res}.public.${res}_items": index scans: 1`, `LOG:  connection authorized: user=${res} database=${res}`, `LOG:  disconnection: session time: 0:0${r % 6}:1${r % 10}.${r % 1000}`][r % 5];
      const noisy = !p.scenario && hash(p.name) % 7 === 0; /* most healthy pods write no errors at all; a few noisy ones time out now and then; a scenario pod writes only its own errors */
      lines[i] = db ? { at, level: r < 4 ? 'WARN' : 'INFO', text: r < 4 ? `could not obtain lock on row in relation "${res}_items"` : dbMsg.replace(/^LOG:\s+/, '') } : { at, level: r < (noisy ? 3 : 0) ? 'ERROR' : r < 15 ? 'WARN' : 'INFO', text: r < (noisy ? 3 : 0) ? `upstream timed out (110: Connection timed out) while reading response header from ${res}` : r < 15 ? `slow request ${1 + r % 3}.${r % 10}s ${res}` : msg };
    }
    if (fixed) {
      const e = logEvidence(p, sid), i = s.impact;
      /* a crash loop's containers each end with the evidence's last lines, at their own times (one container life apart) */
      const ends = s.crashLoop ? crashTimes(s.crashLoop).map(r => r.end) : Array.from({ length: 40 }, (_, k) => (e?.to ?? 0) - k * CRASH_EVERY);
      if (e?.lines && e.target?.previous) for (const end of ends) for (const l of e.lines) { const at = l.at - (e.to - end); if (at > from && at <= t) lines.push({ at, level: l.level, text: l.text }); }
      /* the connection errors of the 5xx scenario: one per pod every HIKARI_EVERY seconds while the error ratio is up */
      if (sid === 's3' && i && p.owner?.name === i.service) for (let k = 1; i.from + k * HIKARI_EVERY <= Math.min(t, errUntil); k++) { const at = i.from + k * HIKARI_EVERY; if (at > from) lines.push({ at, level: 'ERROR', text: S3_HIKARI }); }
      lines.sort((a, b) => a.at - b.at);
    }
    return lines;
  });
}

/* ---------- 근거 조각: 수집한 순간에 한 번 만든 값(대상, 컨테이너, 절대 구간, 조회, 결과). 근거 칸·로그 화면·보고서가 이것만 읽는다 ---------- */
const num = n => Number(n).toLocaleString('en-US');
/** the incident-time pod of a scenario by name, as the evidence read it (before any rollback replaced it) */
function incidentPod(sid, name) {
  const s = sc(sid), row = s?.scope?.find(r => r.name === name), b = base('wake-prod');
  const wl = b.workloads.filter(w => name.startsWith(w.name + '-')).sort((x, y) => y.name.length - x.name.length)[0] ?? b.workloads.find(w => w.name === name);
  const slot = b.pods.find(p => p.owner === wl);
  return slot && { ...slot, name, scenario: true, replaced: null, status: row?.status ?? ['ok', 'Running'], lastReason: /OOMKilled/.test(row?.status?.[1] ?? '') ? 'OOMKilled' : /Error/.test(row?.status?.[1] ?? '') ? 'Error' : '', restarts: row?.restarts ?? 0, age: 9 * D, node: DETAIL[name]?.node ?? slot.node };
}
/** one evidence as it was collected: { id, kind, query, got (when read), from, to (its absolute window, relative seconds), target, container, lines, total, hits (line numbers), last, count, raw } */
export function evidenceSnapshot(sid, id) {
  const s = sc(sid), e = s?.evidence?.find(x => x.id === id);
  if (!e || e.blocked) return null;
  return cached(`snap:${sid}:${id}`, () => {
    const out = { id: e.id, kind: e.kind, query: e.query, got: e.got, from: e.from ?? e.at ?? null, to: e.to ?? e.at ?? null, target: e.target ?? null };
    if (e.kind === '로그' && e.target?.kind === 'Pod') {
      const p = incidentPod(sid, e.target.name); if (!p) return out;
      const raw = logsOf(p, sid, e.to, e.to - e.from, true).filter(l => l.at >= e.from && l.at <= e.to);
      return finishLog(out, e, raw.map((l, i) => ({ n: i + 1, at: l.at, pod: p.name, level: l.level, text: l.text })), containerId(p.name, e.to));
    }
    if (e.kind === '로그' && e.target?.kind === 'Deployment') {
      /* a Loki query over the workload's pods: only the matching lines come back, each with its pod */
      const pods = sc(sid).scope.filter(r => r.kind === 'Pod' && r.name.startsWith(e.target.name + '-')).map(r => incidentPod(sid, r.name)).filter(Boolean);
      const re = new RegExp(e.key), got = pods.flatMap(p => logsOf(p, sid, e.to, e.to - e.from, true).filter(l => l.at >= e.from && l.at <= e.to && re.test(l.text)).map(l => ({ ...l, pod: p.name }))).sort((a, b) => a.at - b.at);
      return finishLog(out, e, got.map((l, i) => ({ n: i + 1, at: l.at, pod: l.pod, level: l.level, text: l.text })), null, pods.map(p => p.name));
    }
    if (e.kind === '로그' && e.lines) return finishLog(out, e, e.lines.map((l, i) => ({ n: i + 1, at: l.at, pod: e.target?.name ?? '', level: l.level, text: l.text })), null);
    if (e.kind === 'Prometheus' && e.metric) { const x = evidenceSeries(sid, id); return { ...out, series: x, ...(x?.raw ? { raw: x.raw } : {}) }; }
    return out;
  });
}
function finishLog(out, e, lines, cid, pods) {
  const re = new RegExp(e.key ?? 'ERROR'), hits = lines.filter(l => re.test(l.text) || l.level === 'ERROR').map(l => l.n), lastHit = lines.find(l => l.n === hits.at(-1));
  /* the query's own count when it says more than it shows (a Job keeps only its last lines in the view); otherwise the lines it returned */
  const count = /^조회/.test(e.count ?? '') ? e.count : L('sim.w.snap.lines', { n: num(lines.length) });
  return { ...out, container: cid, pods: pods ?? (lines[0]?.pod ? [lines[0].pod] : []), lines, total: lines.length, hits, last: lastHit?.at ?? null, count };
}
/** a Prometheus evidence's series: its metric, target, window and query, the function of time that draws it (fixAt: when the fix took effect,
 *  for drawing past the evidence), and the value at its collection moment (`value`, `valueText`) that its text states */
export function evidenceSeries(sid, id, fixAt = Infinity, until = null) {
  const s = sc(sid), e = s?.evidence?.find(x => x.id === id);
  if (!e || e.kind !== 'Prometheus' || !e.metric) return null;
  /* view: the window a resolved document reads again, from 30 minutes before detection (or the evidence's own start, if earlier) through the recovery check */
  const out = { id, metric: e.metric, target: e.target, query: e.query, from: e.from, to: e.to, got: e.got, ...(until != null ? { view: { from: Math.min(e.from, -1800), to: until } } : {}) };
  /* the reference lines a chart draws, each with its kind (threshold, limit, desired, request) and its own words */
  const ref = (value, kind, label) => ({ value, kind, label });
  const at = (fn, fmt, x) => { const v = fn(e.got), value = v == null ? null : Math.round(v * 100) / 100; return { ...out, ...x, fn, value, valueText: value == null ? L('sim.w.snap.noSample') : fmt(value), fmt }; };
  const n0 = v => Math.round(v).toLocaleString('en-US');
  if (e.metric === 'error_ratio') { const i = s.impact, fmt = v => `${v.toFixed(1)}%`, x = at(errorRate(sid, fixAt), fmt, { title: i.label, unit: '%', refs: [ref(i.limit, 'threshold', L('sim.w.ref.threshold', { v: fmt(i.limit) }))] }); return { ...x, raw: L('sim.w.snap.ratio', { from: hm(i.from), now: x.valueText, base: `${i.base}%` }) }; }
  if (e.metric === 'memory') {
    /* what the evidence states: the working set at the last scrape before the OOMKill the log evidence is about (the kill falls between scrapes) */
    /* after the fix the pod is replaced and its memory is the steady one again */
    const p = incidentPod(sid, e.target.name), mem = podMem(p, sid, 'investigating'), calm = podMem(p, sid, 'resolved'), fn = t => (t >= fixAt ? calm(t) : mem(t)), fmt = v => `${Math.round(v)}Mi`, kill = s.evidence.find(v => v.target?.previous)?.to ?? e.to;
    let lastAt = null; for (let x = Math.floor(kill / SCRAPE) * SCRAPE; x > kill - 600; x -= SCRAPE) if (fn(x) != null) { lastAt = x; break; }
    const last = lastAt == null ? null : Math.round(fn(lastAt) * 100) / 100;
    const x = at(fn, fmt, { title: 'container_memory_working_set_bytes', unit: 'Mi', request: p.memReq, refs: [ref(p.memLim, 'limit', `limits.memory ${p.memLim}Mi`), ref(p.memReq, 'request', `requests.memory ${p.memReq}Mi`)], last, lastAt, lastText: last == null ? '' : fmt(last), kill });
    return { ...x, raw: L('sim.w.snap.memLast', { v: x.lastText, at: hms(lastAt), lim: p.memLim, req: p.memReq, kill: hms(kill), now: x.valueText }) };
  }
  if (e.metric === 'redis_clients') { const x = at(redisClients(sid, fixAt), n0, { title: 'redis_connected_clients', unit: '', refs: [ref(10000, 'limit', 'maxclients 10,000'), ref(7000, 'threshold', L('sim.w.ref.threshold', { v: '7,000(70%)' }))] }); return { ...x, raw: L('sim.w.snap.redis', { now: x.valueText, max: '10,000', at: hm(-300) }) }; }
  if (e.metric === 'replicas_available') {
    const roll = -360, fn = t => (t >= fixAt ? 4 : t >= roll ? 3 : 4), x = at(fn, n0, { title: 'replicas available · orders', unit: '', refs: [ref(4, 'desired', 'Desired 4')] });
    return { ...x, raw: L('sim.w.snap.replicas', { now: x.valueText, want: 4, from: hm(roll) }) };
  }
  if (e.metric === 'nodes_ready') {
    /* three values at each moment: the NodeGroup's desiredSize, the Nodes that exist, the Nodes that are Ready. The upgrade lowered desiredSize at `cut`;
       the fix raises it, a new instance joins about a minute later and is Ready when the fix is observed */
    const ng = nodeGroupAt(sid, fixAt), fn = t => ng(t).ready, x = at(fn, n0, { title: 'Ready Node · NodeGroup general', unit: '', refs: [] });
    return { ...x, lines: { desired: t => ng(t).desired, nodes: t => ng(t).nodes, ready: fn }, valueAt: ng(e.got), raw: L('sim.w.snap.nodes', { now: x.valueText, before: GENERAL_NODES + 1, at: hm(-1320), desired: ng(e.got).desired, nodes: ng(e.got).nodes }) };
  }
  if (e.metric === 'latency_p99') {
    /* inventory-api slows from 15 minutes before the alert until it reaches the 10 s client timeout; the bypass does not change it */
    const fn = t => Math.min(10, t < -900 ? .38 + .04 * wave(4, t) : .38 + 9.62 * Math.min(1, (t + 900) / 600) ** 2), fmt = v => `${v.toFixed(1)}초`, x = at(fn, fmt, { title: 'inventory-api p99', unit: 's', refs: [ref(10, 'limit', L('sim.w.ref.timeout', { v: '10초' }))] });
    return { ...x, raw: L('sim.w.snap.p99', { now: x.valueText, from: hm(-900), limit: '10초' }) };
  }
  return out;
}
/** the general NodeGroup at a moment: { desired, nodes, ready } (the pending scenario; elsewhere it holds at GENERAL_NODES) */
export const nodeGroupAt = (sid, fixAt = Infinity) => {
  const s = sc(sid), x = s?.options?.find(o => o.external?.team === '플랫폼 팀')?.external, cut = -1320, ran = fixAt - (x?.settle ?? 170);
  return t => {
    if (s?.id !== 's4') return { desired: GENERAL_NODES, nodes: GENERAL_NODES, ready: GENERAL_NODES };
    const up = GENERAL_NODES + 1;
    return { desired: t >= ran ? up : t >= cut ? GENERAL_NODES : up, nodes: t >= ran + 60 ? up : t >= cut ? GENERAL_NODES : up, ready: t >= fixAt ? up : t >= cut - 60 ? GENERAL_NODES : up };
  };
};
/** auth-redis connections: since the rollback 8 days ago emptied them they climb with the long session TTL until they hold at maxclients (the symptom),
 *  and the fix (shorter TTL, or a restart) brings them down to about 41% */
export const redisClients = (sid = 's6', fixAt = Infinity) => {
  const reset = -8 * D, full = -300, top = 10000;
  return t => {
    const wob = 180 * Math.sin(t / 3600) + 90 * daily(t);
    if (t >= fixAt) { const k = Math.min(1, (t - fixAt) / 900); return Math.round(top - (top - 4100) * k + (k >= 1 ? wob : 0)); }
    if (t >= full) return top;
    if (t < reset) return Math.round(Math.min(top, 3900 + wob));
    return Math.round(Math.min(top, 3900 + (top - 3900) * ((t - reset) / (full - reset)) ** 1.15 + wob * Math.min(1, (full - t) / 3600)));
  };
};

/* ---------- 알림(Alertmanager): 90일 firing·resolved 이력 ---------- */
const ALERT_NAMES = [['KubePodCrashLooping', 'warning'], ['KubeDeploymentReplicasMismatch', 'warning'], ['HighErrorRate5xx', 'critical'], ['KubeContainerOOMKilled', 'warning'], ['NodeMemoryHigh', 'warning'], ['KubeHpaMaxedOut', 'warning'], ['PersistentVolumeFillingUp', 'warning'], ['TargetDown', 'warning'], ['CertificateExpiringSoon', 'info'], ['KafkaConsumerLagHigh', 'warning']];
/* the annotation summary each rule sends, filled with its target */
const ALERT_SUMMARY = {
  KubePodCrashLooping: w => `${w.name} Pod 컨테이너가 15분 동안 CrashLoopBackOff`,
  KubeDeploymentReplicasMismatch: w => `${w.name} Deployment가 15분 넘게 replica ${w.replicas}개를 채우지 못함`,
  HighErrorRate5xx: (w, i) => `${w.name} 5xx 비율 ${(1.2 + (hash(w.name + i) % 30) / 10).toFixed(1)}%(임계값 1%)`,
  KubeContainerOOMKilled: w => `${w.name} 컨테이너가 limits.memory ${w.memLim}Mi에 닿아 OOMKilled`,
  NodeMemoryHigh: (w, i) => `Node 메모리 사용률 ${91 + hash(w.name + i) % 7}%(임계값 90%)`,
  KubeHpaMaxedOut: w => `HPA ${w.name}가 최대 replica ${w.replicas * 3}개에서 15분 넘게 머묾`,
  PersistentVolumeFillingUp: (w, i) => `${w.name} PVC 남은 공간 ${3 + hash(w.name + i) % 9}%`,
  TargetDown: w => `${w.ns}/${w.name} 수집 대상 1개가 10분 넘게 응답 없음`,
  CertificateExpiringSoon: (w, i) => `${w.name} TLS 인증서 만료 ${5 + hash(w.name + i) % 9}일 전`,
  KafkaConsumerLagHigh: (w, i) => `${w.name} 컨슈머 lag ${num0(20000 + hash(w.name + i) % 80000)}건`,
};
const num0 = n => n.toLocaleString('ko-KR');
export function alertsOf(sid, t, phase, cid = 'wake-prod') {
  useClock(sid);
  const hist = cached(`al:${cid}`, () => {
    const w = base(cid), out = [];
    for (let i = 0; i < (cid === 'wake-prod' ? 420 : 60); i++) {
      const [name, sev] = ALERT_NAMES[hash(cid + 'al' + i) % ALERT_NAMES.length], wl = w.workloads[hash(cid + 'aw' + i) % w.workloads.length], at = -Math.floor(rnd(cid + 'at' + i) * 90 * D) - 2 * H;
      out.push({ id: `al-${i}`, name, severity: sev, state: 'resolved', target: `${wl.ns}/${wl.name}`, at, end: at + 300 + hash(cid + 'ad' + i) % 7200, summary: ALERT_SUMMARY[name]?.(wl, i) ?? name });
    }
    if (cid !== 'wake-prod') return out; /* the firing ones below name wake-prod's own nodes and services */
    out.push({ id: 'a-disk', name: 'NodeFilesystemSpaceFillingUp', severity: 'warning', state: 'pending', target: 'ip-10-0-8-11 /var/lib/containerd', at: -25 * 60, summary: '24시간 안에 디스크가 가득 찰 것으로 예상' });
    out.push({ id: 'a-cert', name: 'CertificateExpiringSoon', severity: 'info', state: 'firing', target: 'platform/search-tls', at: -6 * H, summary: '인증서 만료 13일 전' });
    out.push({ id: 'a-gpu', name: 'KubePodNotScheduled', severity: 'warning', state: 'firing', target: 'ml-serving', at: -GPU_WAIT, summary: 'GPU Node 없음' });
    return out;
  });
  const s = cid === 'wake-prod' ? sc(sid) ?? {} : {};
  const live = !s.quiet && s.alert && t >= 0 ? [{ id: 'a-' + sid, name: s.alert, severity: s.severity, state: phase === 'resolved' ? 'resolved' : 'firing', target: `${s.ns}/${s.scope?.[0]?.name ?? ''}`, at: 0, incident: sid, summary: s.symptom }] : [];
  return [...live, ...hist].filter(a => a.at <= t).sort((a, b) => (a.state === b.state ? b.at - a.at : ['firing', 'pending', 'resolved'].indexOf(a.state) - ['firing', 'pending', 'resolved'].indexOf(b.state)));
}

/* ---------- 과거 인시던트: 90일 약 100건(되풀이를 셀 수 있게 같은 대상이 여러 번 나온다) ---------- */
/* [symptom, action, typical minutes, alert, cause, rule] */
const PAST_KINDS = [['CrashLoopBackOff', '재시작', 9, 'KubePodCrashLooping', '의존 서비스 연결 실패로 시작 직후 종료', 'crashloop v5'], ['OOMKilled', 'limits 조정 PR', 17, 'KubeContainerOOMKilled', 'limits.memory가 사용량 최대보다 낮음', 'oom_memory_pressure v3'], ['5xx 비율 상승', '롤백 PR', 24, 'HighErrorRate5xx', '직전 배포의 회귀', 'error_rate v2'], ['Pending', 'Node 추가', 38, 'KubePodNotScheduled', 'NodeGroup CPU requests 합이 Allocatable에 닿음', 'scheduling v3'], ['ImagePullBackOff', '태그 PR', 8, 'KubePodCrashLooping', '없는 이미지 태그', 'image_pull v2'], ['PostSync 실패', '롤백 PR', 21, 'ArgoAppSyncFailed', '의존 서비스가 응답하지 않아 PostSync hook 실패', 'deployment_gitops v2'], ['디스크 사용률 90%', 'PVC 확장', 44, 'PersistentVolumeFillingUp', '로그 보관 설정이 빠져 PVC가 가득 참', 'pvc_fill v1'], ['지연 증가', 'HPA 최대 조정', 26, 'KubeHpaMaxedOut', 'HPA 최대 replica에서 머묾', 'hpa_saturation v1']];
export function pastOf(cid = 'wake-prod') {
  return cached(`past:${cid}:${clockSid()}`, () => {
    const w = base(cid), out = cid === 'wake-prod' ? PAST.map(p => { const at = pastAt(p); return { ...p, at, days: Math.max(1, Math.round(-at / D)), result: OUTCOME[p.outcome], when: ymd(at) }; }) : [];
    /* the scenarios that happened before the one in play are past incidents of its world, with their own numbers and outcome */
    const earlier = cid === 'wake-prod' ? SCENARIOS.filter(x => !x.quiet && detectRel(x.id) < 0) : [];
    const lead = cid === 'wake-prod' ? Math.max(0, Math.ceil(-detectRel('s1') / D)) : 0; /* the other past incidents are older than the first scenario (their numbers are lower) */
    for (let i = 0; i < (cid === 'wake-prod' ? 96 : 14); i++) {
      const [sym, by, mins, alert, cause, rule] = PAST_KINDS[hash(cid + 'pk' + i) % PAST_KINDS.length], wl = w.workloads[(hash(cid + 'pw' + i) % 40) * 7 % w.workloads.length], days = lead + 1 + Math.floor(rnd(cid + 'pd' + i) * 89);
      const r = rnd(cid + 'pr' + i), took = Math.max(4, Math.round(mins * (.6 + .9 * rnd(cid + 'pt' + i)))), hour = 8 + hash(cid + 'ph' + i) % 14, minute = hash(cid + 'pm' + i) % 60;
      out.push({ id: `inc-${1900 - i}`, title: `${wl.name} ${sym}`, when: ymd(-days * D), days, at: -days * D + (hour - 14) * H + (minute - 2) * 60, ns: wl.ns, target: wl, alert, cause, rule, outcome: r < .82 ? 'recovered' : r < .93 ? 'manual' : 'unknown', by, took: L('sim.w.minutes', { n: took }), mins: took, approver: [ME, 'jhkim', 'sypark', 'mlee'][hash(cid + 'pa' + i) % 4], evidence: 3 + hash(cid + 'pe' + i) % 5 });
    }
    /* one numbering for the whole world: the scenarios keep theirs (INC-2142 onward); the rest count down from INC_BASE, newest first, so a number always grows with time */
    const atOf = p => p.at ?? -p.days * D;
    const older = out.sort((a, b) => atOf(b) - atOf(a)).map((p, i) => ({ ...p, result: OUTCOME[p.outcome], id: `inc-${(cid === 'wake-prod' ? INC_BASE : cid === 'wake-stage' ? 412 : 87) - i}` }));
    const mine = earlier.map(x => { const at = detectRel(x.id), o = x.options.find(y => !y.disabled), rec = RECOVERY[o.recovery]; return { id: incOf(x.id).toLowerCase(), title: x.title, when: ymd(at), days: Math.max(0, Math.round(-at / D)), at, ns: x.ns, alert: x.alert, cause: x.chain.conclusion, rule: `${x.rule.name} ${x.rule.version}`, outcome: o.mode === 'manual' ? 'manual' : 'recovered', result: rec.label, recovery: o.recovery, by: o.title, took: L('sim.w.minutes', { n: 24 + (hash(x.id) % 20) }), mins: 24 + (hash(x.id) % 20), approver: ME, evidence: x.evidence.length, scenario: x.id }; }).sort((a, b) => b.at - a.at);
    return [...mine, ...older];
  });
}

/** the incident list of a world: the open one (if the scenario has one and it fired) first, then the past ones; `all` is every row the list shows */
export function incidentList(sid, t, phase, cid = 'wake-prod', range = null) {
  const s = cid === 'wake-prod' ? sc(sid) : null, open = s && !s.quiet && t >= 0 && phase !== 'resolved' ? [{ id: incOf(sid).toLowerCase(), title: s.title, at: 0, alert: s.alert, ns: s.ns, open: true, scenario: sid }] : [];
  const closed = s && !s.quiet && phase === 'resolved' ? [{ id: incOf(sid).toLowerCase(), title: s.title, at: 0, alert: s.alert, ns: s.ns, open: false, scenario: sid }] : [];
  const past = pastOf(cid), all = [...open, ...closed, ...past], inRange = range ? all.filter(x => x.open || (x.at >= range.from && x.at <= range.to)) : all;
  /* two counts with their scope: everything Wake keeps (90 days) and what the page's range shows */
  return { open, past: [...closed, ...past], all, total: all.length, totalScope: L('sim.w.inc.kept'), inRange, rangeTotal: inRange.length };
}
/** the past incidents of the same alert in a namespace within `days` (the repeat memory): one list, so the cause card, the AI log and the report name the same numbers */
export function memoryOf(sid, days = 30) {
  const s = sc(sid); if (!s?.alert) return [];
  return pastOf('wake-prod').filter(p => p.alert === s.alert && p.at >= -days * D && !p.scenario).map(p => ({ id: p.id.toUpperCase(), when: p.when, at: p.at, by: p.by, result: p.result }));
}
/** the RoleBinding a namespace's approver acts through */
export const roleBinding = ns => `${ns}-deployer`;
/** the NodeGroups of a world, each with its desiredSize, its Nodes and its Ready Nodes now */
export function nodeGroups(w, fixAt = Infinity) {
  const ng = nodeGroupAt(w.sid, fixAt), pools = [...new Set(w.nodes.map(n => n.pool))];
  return pools.map(name => { const ns = w.nodes.filter(n => n.pool === name), live = ns.filter(n => n.status[0] !== 'idle'); return { name, type: ns[0]?.type, nodes: live.length, ready: live.filter(n => /^Ready/.test(n.status[1])).length, desired: name === 'general' && w.sid === 's4' ? ng(0).desired : live.length }; });
}
/** a frozen log window of a scenario pod as the incident read it: the same lines whatever the phase (the screen's body log and the report read this) */
export function logWindow(sid, podName, from, to) {
  return cached(`logwin:${sid}:${podName}:${from}:${to}`, () => { const p = incidentPod(sid, podName); return p ? logsOf(p, sid, to, to - from, true).filter(l => l.at >= from && l.at <= to).map((l, i) => ({ n: i + 1, ...l })) : []; });
}

/* ---------- 홈 흐름: namespace → 워크로드 → Pod 상태(단위: Pod 개수, 문제가 있는 곳 위주) ---------- */
/* a node's conditions, taints and disk as kubectl describe node prints them; a node that evicted a pod for ephemeral storage
   had DiskPressure, which the kubelet cleared after the eviction */
export function nodeFacts(r, w) {
  const evicted = w.pods.some(p => p.node === r.name && /Evicted/.test(p.status[1])), gone = r.status[0] === 'idle', h = hash(r.name);
  const disk = gone ? null : evicted ? 81 : 22 + h % 41, inode = gone ? null : 4 + h % 13, since = -(3 + h % 20) * D; /* a deleted node has no current disk */
  const cond = (type, bad, reason, at) => ({ type, status: gone ? 'Unknown' : type === 'Ready' ? (bad ? 'False' : 'True') : bad ? 'True' : 'False', reason: gone ? 'NodeStatusUnknown' : reason, at: gone ? -22 * 60 : at });
  return {
    conditions: [cond('Ready', false, 'KubeletReady', since), cond('MemoryPressure', false, 'KubeletHasSufficientMemory', since), cond('DiskPressure', false, 'KubeletHasNoDiskPressure', evicted ? -41 * 60 : since), cond('PIDPressure', false, 'KubeletHasSufficientPID', since), { type: 'NetworkUnavailable', status: 'False', reason: 'RouteCreated', at: r.age ? -r.age : since }],
    taints: r.pool === 'batch-spot' ? ['spot=true:NoSchedule'] : gone ? ['node.kubernetes.io/unreachable:NoExecute', 'node.kubernetes.io/unreachable:NoSchedule'] : [],
    disk, inode, kubelet: r.kubelet, evicted,
  };
}

/* a Pod's status is the STATUS column of the Pod table (the reason before its detail), and its tone is the table's: the graph counts
   exactly what filtering the table by that word lists */
export const podStatus = p => p.status[1].split(' · ')[0];
export const podTone = p => ({ ok: 'ok', warn: 'warn', busy: 'warn', error: 'fail', idle: 'idle' })[p.status[0]] ?? 'warn';
export const POD_STATE_WORDS = { ok: 'Ready', warn: 'NotReady', fail: L('sim.w.pod.failing'), idle: 'Completed' };
export function podFlow(w) {
  /* the whole graph, every namespace and workload with real Pod counts: the kit decides what fits (all to scale, or the problems with the healthy rest
     summarised and crowded columns folded) */
  const nodes = [], links = [], byNs = new Map(), byWl = new Map(), groups = new Map();
  for (const p of w.pods) {
    byNs.set(p.ns, (byNs.get(p.ns) ?? 0) + 1);
    const wk = p.ns + '/' + (p.owner?.name ?? p.name); if (!byWl.has(wk)) byWl.set(wk, { ns: p.ns, name: p.owner?.name ?? p.name, kind: p.owner?.kind ?? 'Pod', pods: [] }); byWl.get(wk).pods.push(p);
    const k = podStatus(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p);
  }
  const nsOrder = [...byNs.keys()].sort((a, b) => byNs.get(b) - byNs.get(a));
  for (const ns of nsOrder) nodes.push({ id: 'ns-' + ns, col: 0, value: byNs.get(ns), label: ns, icon: 'k8s-namespace', tone: 'soc', go: { page: 'resources', kind: 'Pod', ns } });
  for (const [wk, x] of [...byWl].sort((a, b) => b[1].pods.length - a[1].pods.length)) {
    const bad = x.pods.filter(p => p.status[0] !== 'ok'), worst = bad.some(p => podTone(p) === 'fail') ? 'fail' : bad.length ? 'warn' : 'ok';
    nodes.push({ id: 'w-' + wk, col: 1, value: x.pods.length, label: x.name, icon: 'k8s-' + x.kind.toLowerCase(), tone: 'other', state: worst, go: { page: 'resources', kind: 'Pod', q: x.name, ns: x.ns } });
    links.push({ from: 'ns-' + x.ns, to: 'w-' + wk, value: x.pods.length, text: x.pods.length.toLocaleString(), state: worst === 'ok' ? 'ok' : worst });
    const per = new Map(); for (const p of x.pods) per.set(podStatus(p), (per.get(podStatus(p)) ?? 0) + 1);
    for (const [st, n] of per) links.push({ from: 'w-' + wk, to: 's-' + st, value: n, text: n.toLocaleString(), state: podTone(x.pods.find(p => podStatus(p) === st)) });
  }
  const states = [...groups.keys()].sort((a, b) => (a === 'Running' ? 1 : b === 'Running' ? -1 : groups.get(b).length - groups.get(a).length));
  for (const k of states) {
    const ps = groups.get(k), tone = podTone(ps[0]), why = new Map();
    for (const p of ps) { const d = p.status[1].split(' · ')[1]; if (d) why.set(d, (why.get(d) ?? 0) + 1); }
    nodes.push({ id: 's-' + k, col: 2, value: ps.length, label: k, icon: tone === 'ok' ? 'circle-check' : tone === 'idle' ? 'check' : 'exclamation-triangle', state: tone, go: { page: 'resources', kind: 'Pod', st: k }, ...(why.size ? { reasons: [...why].map(([label, count]) => ({ label, count })) } : {}) });
  }
  return { nodes, links };
}

/* ---------- 요청 흐름(checkout): Ingress → Pod → 응답(단위: 초당 요청) ---------- */
export function requestFlow(w, sid, phase) {
  const i = sc(sid)?.impact, pods = w.pods.filter(p => p.owner.name === 'checkout-api'), rps = i?.rps ?? 420, bad = (i && phase !== 'resolved' ? i.during : i?.base ?? .3) / 100;
  const per = Math.round(rps / Math.max(1, pods.length)), err = Math.round(per * bad * 10) / 10;
  return {
    nodes: [
      { id: 'ing', col: 0, value: rps, label: 'Ingress checkout', sub: `${rps} req/s`, icon: 'k8s-ingress', tone: 'system' },
      ...pods.map(p => ({ id: 'p-' + p.name, col: 1, value: per, label: p.name, short: p.name.slice(-5), icon: 'k8s-pod', tone: 'other', state: err > 1 ? 'warn' : 'ok', go: { sel: `${p.ns}/Pod/${p.name}` } })),
      { id: 'ok', col: 2, value: Math.round(rps - err * pods.length), label: '2xx·3xx', icon: 'circle-check', state: 'ok' },
      { id: 'err', col: 2, value: Math.max(.5, Math.round(err * pods.length * 10) / 10), label: '5xx', icon: 'exclamation-triangle', state: err > 1 ? 'fail' : 'idle' },
    ],
    links: [...pods.map(p => ({ from: 'ing', to: 'p-' + p.name, value: per, text: `${per}/s` })), ...pods.flatMap(p => [{ from: 'p-' + p.name, to: 'ok', value: per - err, text: `${Math.round(per - err)}/s` }, { from: 'p-' + p.name, to: 'err', value: Math.max(.25, err), text: `${err}/s`, state: err > 1 ? 'fail' : 'idle' }])],
  };
}

/* ---------- GitOps 동기화 이력 ---------- */
export function syncHistory(a) {
  /* one source for a scenario app: its latest sync is the scenario's rollout record (the failed PreSync sync for orders), the one before it the previous revision */
  const failed = a.name === 'orders' && a.status[1].includes('PreSync'), at0 = a.syncedAt ?? DETAIL['orders-app']?.events.find(e => e.reason === 'OperationCompleted')?.at ?? -155;
  return Array.from({ length: 12 }, (_, i) => ({ id: a.name + i, at: a.scenario && i === 0 ? at0 : -(i * (6 + hash(a.name + i) % 30) * H + hash(a.name) % H) - (a.scenario ? 3600 - at0 : 0), revision: i === 0 ? a.revision : a.scenario && i === 1 && a.previous ? a.previous : hex7(a.name + 'r' + i), result: failed && i === 0 ? ['error', 'Failed · PreSync hook'] : hash(a.name + 'f' + i) % 17 === 0 ? ['warn', 'Retried · Succeeded'] : ['ok', 'Succeeded'], by: hash(a.name + 'a' + i) % 3 ? 'automated' : ME }));
}

/* ---------- YAML ---------- */
export function yamlOf(r) {
  if (r.kind === 'Pod') {
    const term = r.scenario && /OOM/.test(r.status[1]);
    return [`apiVersion: v1`, `kind: Pod`, `metadata:`, `  name: ${r.name}`, `  namespace: ${r.ns}`, `  labels:`, `    app: ${r.owner.name}`, `  ownerReferences:`, `  - kind: ${r.owner.kind === 'Deployment' ? 'ReplicaSet' : r.owner.kind === 'CronJob' ? 'Job' : r.owner.kind}`, `    name: ${r.owner.kind === 'Deployment' || r.owner.kind === 'CronJob' ? r.name.replace(/-[a-z0-9]{4,5}$/, '') : r.owner.name}`, `spec:`, ...(r.node ? [`  nodeName: ${r.node}`] : []), `  containers:`, `  - name: ${r.owner.name}`, `    image: ${r.image}`, ...(r.owner.name === 'payments' ? [`    env:`, `    - name: JAVA_OPTS`, `      value: ${r.replaced ? '-Xmx384m' : '-Xmx480m'}`] : []), `    resources:`, `      requests:`, `        cpu: ${r.cpuReq}m`, `        memory: ${r.memReq}Mi`, `      limits:`, `        memory: ${r.memLim}Mi`, `status:`, `  phase: ${/Pending/.test(r.status[1]) ? 'Pending' : 'Running'}`, ...(r.node && !/Pending/.test(r.status[1]) ? [`  podIP: ${r.ip}`] : [`  conditions:`, `  - type: PodScheduled`, `    status: "False"`, `    reason: Unschedulable`]), ...(r.node && !/Pending/.test(r.status[1]) ? [`  containerStatuses:`, `  - name: ${r.owner.name}`, `    ready: ${r.ready === '1/1'}`, `    restartCount: ${r.restarts}`, ...(term ? [`    lastState:`, `      terminated:`, `        reason: OOMKilled`, `        exitCode: 137`] : [])] : [])].join('\n');
  }
  if (r.kind === 'Node') return [`apiVersion: v1`, `kind: Node`, `metadata:`, `  name: ${r.name}`, `  labels:`, `    eks.amazonaws.com/nodegroup: ${r.pool}`, `    node.kubernetes.io/instance-type: ${r.type}`, `    topology.kubernetes.io/zone: ${r.zone}`, `status:`, `  allocatable:`, `    cpu: "${allocCpu(r)}m"`, `    memory: ${r.memGi}Gi`, `  conditions:`, `  - type: Ready`, `    status: "${r.status[0] === 'idle' ? 'Unknown' : 'True'}"`].join('\n');
  if (r.kind === 'CronJob') return [`apiVersion: batch/v1`, `kind: CronJob`, `metadata:`, `  name: ${r.name}`, `  namespace: ${r.ns}`, `spec:`, `  schedule: "${r.cron}"`, `  timeZone: Asia/Seoul`, `  suspend: ${!!r.suspend}`, `  concurrencyPolicy: ${r.concurrency}`, `  successfulJobsHistoryLimit: ${r.history ?? 3}`, `  failedJobsHistoryLimit: ${r.failedHistory ?? 1}`, `  jobTemplate:`, `    spec:`, `      backoffLimit: 3`, `      template:`, `        spec:`, `          restartPolicy: OnFailure`, `          containers:`, `          - name: ${r.name}`, `            image: ${r.image}`, `            resources:`, `              requests:`, `                cpu: ${r.cpuReq}m`, `                memory: ${r.memReq}Mi`].join('\n');
  if (r.kind === 'Application') return [`apiVersion: argoproj.io/v1alpha1`, `kind: Application`, `metadata:`, `  name: ${r.name}`, `  namespace: argocd`, `spec:`, `  source:`, `    repoURL: https://github.com/${r.repo}`, `    path: ${r.path}`, `  syncPolicy:`, ...(r.auto ? [`    automated:`, `      prune: true`, `      selfHeal: true`] : [`    {}`]), `status:`, `  sync:`, `    status: ${r.status[1].split(' · ')[0]}`, `    revision: ${r.revision}`, `  health:`, `    status: ${r.status[1].split(' · ')[1] ?? 'Healthy'}`].join('\n');
  return [`apiVersion: apps/v1`, `kind: ${r.kind}`, `metadata:`, `  name: ${r.name}`, `  namespace: ${r.ns}`, `spec:`, `  replicas: ${r.replicas ?? 1}`, `  template:`, `    spec:`, `      containers:`, `      - name: ${r.name}`, `        image: ${r.image ?? ''}`, `status:`, `  readyReplicas: ${r.ready ?? 0}`, `  conditions:`, `  - type: Available`, `    status: "${r.status[0] === 'ok' ? 'True' : 'False'}"`].join('\n');
}

/* ---------- 알림 원문: Alertmanager가 보내는 그대로(라벨과 annotation) ---------- */
const minutes = sec => Math.round(Math.abs(sec) / 60);
const replicasOf = (ns, name) => base('wake-prod').workloads.find(x => x.ns === ns && x.name === name)?.replicas;
/* each from the scenario's own facts: the pod, its restarts and start, the error rate, the replicas the workload wants; `fact` is the one line a notice adds */
const ALERT_TEXT = {
  s1: (s, [p] = s.scope) => ({ labels: { namespace: s.ns, pod: p.name }, summary: `${p.name} 컨테이너가 15분 동안 ${p.restarts}번 재시작됨 (OOMKilled)`, resolved: `${p.name} 재시작 멈춤 · ${minutes(NEED)}분 동안 OOMKilled 없음`, fact: `재시작 ${p.restarts}번 · OOMKilled` }),
  s2: s => { const wl = s.scope.find(r => r.kind === 'Deployment'), bad = s.scope.filter(r => r.kind === 'Pod' && r.status[0] === 'error').length;
    return { labels: { namespace: s.ns, deployment: wl.name }, summary: `${wl.name} Deployment의 새 Pod ${bad}개가 이미지를 받지 못함 (ImagePullBackOff)`, resolved: `${wl.name} Pod ${replicasOf(s.ns, wl.name)}개 모두 Ready`, fact: 'ImagePullBackOff · 이미지 태그 없음' }; },
  s3: (s, [wl] = s.scope, i = s.impact) => ({ labels: { namespace: s.ns, service: wl.name }, summary: `${wl.name} 5xx 비율 ${i.during}% · ${minutes(i.from)}분째 임계값 ${i.limit}% 초과`, resolved: `${wl.name} 5xx 비율 ${i.base}% · 임계값 ${i.limit}% 아래`, fact: `5xx ${i.during}% · 임계값 ${i.limit}%` }),
  s4: (s, [p] = s.scope, job = p.name.replace(/-\d+-[a-z0-9]+$/, '')) => ({ labels: { namespace: s.ns, pod: p.name }, summary: `${job} Pod가 ${minutes(p.start)}분째 스케줄되지 않음 (Insufficient cpu)`, resolved: `${job} Pod 스케줄됨 · Running`, fact: 'Pending · CPU 부족' }),
  s5: (s, [app, hook] = s.scope) => ({ labels: { namespace: s.ns, application: app.name }, summary: `Argo CD Application ${app.name} 동기화 실패 (PreSync hook ${hook.name})`, resolved: `Argo CD Application ${app.name} Synced · Healthy`, fact: 'PostSync hook 실패' }),
  s6: (s, [p] = s.scope) => ({ labels: { namespace: s.ns, pod: p.name }, summary: `${p.name} 컨테이너가 ${minutes(p.start)}분 동안 ${p.restarts}번 재시작됨 (CrashLoopBackOff)`, resolved: `${p.name} 재시작 멈춤 · ${minutes(NEED)}분 동안 정상`, fact: '재시작 반복 · Redis 연결 한도' }),
};
/** the firing alert of a scenario as Alertmanager sends it: the severity label (the scenario's), the alertname, the key labels, the annotation summary,
 *  and the id of the incident Wake opened for it */
/** a scenario's incident number: the scenarios count on from INC_BASE in their time order */
export const incOf = sid => `INC-${INC_BASE + SCENARIOS.findIndex(x => x.id === sid) + 1}`;
export function alertText(sid) {
  useClock(sid);
  const s = sc(sid) ?? {}, a = ALERT_TEXT[sid]?.(s);
  if (!a) return null;
  const inc = incOf(sid), ln = linksOf(s, inc);
  return { ...a, severity: s.severity, alertname: s.alert, labels: { cluster: s.cluster, ...a.labels }, incident: inc, annotations: { summary: a.summary, runbook_url: ln.runbook, dashboard_url: ln.dashboard }, dashboard: ln.dashboard, dashboardName: ln.dashboardName, links: ln };
}
/** the background alert before any scenario: the GPU pod that waits for a node, read from the world (its name, how long it has waited) */
export function backgroundAlert(cid = 'wake-prod') {
  const p = base(cid).pods.find(x => x.ns === 'ml-serving' && /Pending/.test(x.status[1]));
  return p && { severity: 'warning', alertname: 'KubePodNotScheduled', labels: { cluster: cid, namespace: p.ns, pod: p.name }, summary: `${p.owner.name} Pod가 ${minutes(GPU_WAIT)}분째 스케줄되지 않음 (GPU Node 부족)` };
}

/* ---------- 네트워크: 서비스마다 송수신·연결·오류, 서비스 사이 요청 흐름(초당 요청) ---------- */
export function netOf(w, sid, t) {
  const svcs = w.workloads.filter(x => x.kind === 'Deployment' || x.kind === 'StatefulSet').map(x => {
    const i0 = sc(sid)?.impact, own = !!i0 && x.name === i0.service; /* the scenario's service serves the request rate its impact quotes */
    /* each figure from its own seed (no two services share a row of numbers); background roles (exporters, schedulers) move little */
    const h = hash(x.ns + '/' + x.name), g = k => hash(x.ns + '/' + x.name + k), role = /exporter|scheduler|cleanup|archiver|reconciler|metrics/.test(x.name) ? .15 : /api|gateway|web/.test(x.name) ? 1.6 : 1, rps = (x.replicas ?? 1) * (6 + g('r') % 71) * role * (1 + .25 * daily(t)), i = sc(sid)?.impact, bad = !!i && x.name === sc(sid).errTop; /* the service the scenario's error rate is about reads that rate here too */
    return { id: `${x.ns}/${x.kind}/${x.name}`, ns: x.ns, name: x.name, kind: x.kind, rps: own ? i0.rps : Math.round(rps), rx: Math.round(rps * (1.2 + (g('x') % 70) / 10) * 1024), tx: Math.round(rps * (2.5 + (g('t') % 150) / 10) * 1024), conns: Math.round(rps * (0.8 + (g('c') % 23) / 10)), err: bad ? i.during : Math.round((h % 40) / 10) / 10, retrans: Math.round((h % 25) / 10) / 10 };
  });
  return svcs.sort((a, b) => b.tx + b.rx - a.tx - a.rx);
}
export function netFlow(w, sid, t) {
  const svcs = netOf(w, sid, t), pick = re => svcs.filter(x => re.test(x.name));
  const prefer = (names, rest) => [...names.map(n => svcs.find(x => x.name === n)).filter(Boolean), ...rest];
  const front = prefer(['gateway-api', 'checkout-web', 'mobile-bff'], pick(/gateway|web/)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 3);
  const data = prefer(['orders-db', 'auth-redis', 'payments-db', 'checkout-db'], pick(/(^|-)(db|redis|kafka)$/)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4);
  const back = prefer(['checkout-api', 'payments', 'orders', 'auth', 'reports-api', 'search-api'], []).filter(x => !front.includes(x) && !data.includes(x)).slice(0, 6);
  const nodes = [{ id: 'in', col: 0, label: 'Ingress nginx', icon: 'k8s-ingress', value: 0 }], links = [];
  const add = (from, to, v, bad) => { links.push({ from, to, value: v, text: `${v.toLocaleString()}/s`, state: bad ? 'fail' : 'ok' }); };
  front.forEach(f => nodes.push({ id: f.id, col: 1, label: f.name, icon: 'k8s-service', value: f.rps, go: f.id }));
  back.forEach(b => nodes.push({ id: b.id, col: 2, label: b.name, icon: 'k8s-service', value: b.rps, state: b.err > 1 ? 'warn' : 'ok', go: b.id }));
  data.forEach(d => nodes.push({ id: d.id, col: 3, label: d.name, icon: 'k8s-statefulset', value: d.rps, go: d.id }));
  front.forEach(f => add('in', f.id, f.rps));
  back.forEach((b, i) => { const f = front[i % Math.max(1, front.length)]; if (f) add(f.id, b.id, Math.max(1, Math.round(b.rps * .8)), b.err > 1); });
  data.forEach((d, i) => { const b = back[i % Math.max(1, back.length)]; if (b) add(b.id, d.id, Math.max(1, Math.round(d.rps * .6))); });
  /* the ingress carries what its frontends carry; a path that leads to a failing service is marked along its way */
  nodes[0].value = front.reduce((a, f) => a + f.rps, 0);
  const badTo = new Set(links.filter(l => l.state === 'fail').map(l => l.from));
  for (const l of links) if (badTo.has(l.to) && l.state === 'ok') l.state = 'warn';
  for (const n of nodes) if (badTo.has(n.id) && n.col === 1) n.state = 'warn';
  return { nodes: nodes.filter(n => n.id === 'in' || links.some(l => l.from === n.id || l.to === n.id)), links };
}

/* a new clock: everything made for the old one goes (the cluster's base does not depend on the clock and stays), and the evidence counts are read again */
onRebuild(() => { for (const k of [...memo.keys()]) if (!k.startsWith('base:')) memo.delete(k);
  /* the repeat memory names the past incidents by their numbers in the one past list */
  for (const s of SCENARIOS.filter(x => x.id === clockSid())) { const mem = memoryOf(s.id), e = s.evidence?.find(x => x.kind === '과거 인시던트'); if (s.memory) s.memory.incidents = mem; if (e && mem.length) { e.raw = L('sim.w.mem.raw', { list: mem.map(p => L('sim.w.mem.item', { id: p.id, when: p.when, by: p.by })).join(' · ') }); e.count = L('sim.w.mem.count', { n: mem.length }); } }
  for (const s of SCENARIOS.filter(x => x.id === clockSid())) for (const e of s.evidence ?? []) { const x = evidenceSnapshot(s.id, e.id); if (x?.count) e.count = x.count; if (x?.raw) e.raw = x.raw; } });
