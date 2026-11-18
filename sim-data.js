/*
 * 시뮬레이션의 하나뿐인 자료원: 시나리오 7개. 모든 화면(사이드바, 인시던트, 상세, AI 창, 출력물)이 여기서만 읽어 같은 대상의 사실이 화면마다 다르지 않다.
 * 시나리오마다 감지 시각(DETECT)이 다르다. 시각은 그 감지 시각(t0)에서 센 초이고(앞이면 음수), 시각이 들어간 글은 시계를 맞춘 뒤 build가 다시 만든다.
 * 순서는 근거 수집 → 판정 → 승인이다: 근거마다 수집한 시각(got)이 있고 판정 시각(script의 judged)은 모든 근거 뒤다.
 * script: 시뮬레이션 시계가 지나며 일어나는 일. 사람·외부 팀이 하는 일(리뷰, 병합, 외부 조치)은 엔진이 실제로 걸리는 간격으로 기록한다.
 */
import { D, H, hm, hms, ymd, rangeText, setDetection, T0 } from './sim-format.js';
/** a stable hash of a seed (FNV-1a): every generated name and number in the simulation comes from it */
export const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
/** a git commit as people see it: seven hex digits from a seed */
export const hex7 = seed => (hash(seed + 'a').toString(16) + hash(seed + 'b').toString(16)).padStart(8, '0').slice(0, 7);
/* the commits the scenarios name: one source for the rollout record, the Application revision, the sync history and the texts */
export const COMMITS = { payRev14: hex7('acme/payments-deploy rev14'), payRev13: hex7('acme/payments-deploy rev13'), ordersRev9: hex7('acme/orders-deploy rev9'), ordersNew: hex7('acme/orders-deploy 1.5.0'), ordersGood: hex7('acme/orders-deploy 1.4.1') };
export const CADENCE = 30, NEED = 300, MAX = 600; /* 백엔드 복구 검증 기본값: 30초 수집, 300초 연속 정상, 600초 마감 */
export const MIN_WINDOWS = Math.max(2, Math.ceil(NEED / CADENCE) + 1);
export const FAIL_WINDOW = 5; /* the collection window an injected failure lands in (0-based) */
export const SCRAPE = 15; /* Prometheus scrape interval: windows end on this grid */
export const scrapeFloor = at => Math.floor(at / SCRAPE) * SCRAPE;
export const CRASH_EVERY = 115; /* seconds between restarts of a crash-looping container that has no timeline of its own */
/* the payments crash loop: each container runs `life` seconds to its OOMKill, then the kubelet waits its back-off (10 s doubling to 5 min) before the next;
   the last kill is the one the log evidence reads, restartCount is the restarts so far */
export const S1_CRASH = { life: 55, backoff: [10, 20, 40, 80, 160, 300], restarts: 6, lastEnd: -18 };
/** the containers of a crash loop, oldest first: [{ start, end }] up to the last kill, then the ones that would follow it (`ahead`) */
export function crashTimes({ life, backoff, restarts, lastEnd }, ahead = 0) {
  const out = [{ start: lastEnd - life, end: lastEnd }];
  for (let k = restarts - 1; k >= 0; k--) { const end = out[0].start - backoff[Math.min(k, backoff.length - 1)]; out.unshift({ start: end - life, end }); }
  for (let k = 0; k < ahead; k++) { const start = out.at(-1).end + backoff.at(-1); out.push({ start, end: start + life }); }
  return out;
}
const S1_ROLL = -1080; /* rev 14 rolled out 18 minutes before the alert: the first container started a minute later */
const S1_FIRST = crashTimes(S1_CRASH)[0].end; /* the first OOMKill: where the symptom and the detection gap start */
const gapWords = s => `${Math.floor(s / 60)}분 ${s % 60}초`;
export const INC_BASE = 2141; /* the newest incident before the scenarios: the scenarios are INC-2142 onward, in time order */
export const ME = 'jiwoo.han'; /* the person on call in the simulation (a sample actor, never a real account) */
export const MODEL = 'claude-sonnet-5-5'; /* the external model the AI calls */
/** the availability objective every 5xx burn rate is read against */
export const SLO = 99.9;
/** how fast an error ratio (percent) spends the error budget of the SLO: 3.1% at 99.9% is 31× */
export const burnRate = pct => pct / (100 - SLO);
/* 변경 기록 줄(배포·설정·인프라·증상): 시간 축 변경 칸의 줄 이름과 아이콘 */
export const CHANGE_LANES = [{ id: 'deploy', label: '배포', icon: 'k8s-deployment', kept: true }, { id: 'config', label: '설정', icon: 'k8s-configmap' }, { id: 'infra', label: '인프라', icon: 'k8s-node' }, { id: 'symptom', label: '증상', icon: 'exclamation-triangle' }];

/** when each scenario's alert fired (KST): in the order of their incident numbers, each on its own day and time */
export const DETECT = { s1: '2026-11-09T10:47:20+09:00', s2: '2026-11-09T16:23:05+09:00', s3: '2026-11-10T11:38:40+09:00', s4: '2026-11-10T21:12:15+09:00', s5: '2026-11-11T09:56:30+09:00', s6: '2026-11-12T14:02:37+09:00', s7: '2026-11-13T10:31:44+09:00' };
const epochOf = sid => Date.parse(DETECT[sid] ?? DETECT.s1) / 1000;
/** seconds from the scenario in play's t0 to another scenario's detection */
export const detectRel = sid => epochOf(sid) - T0;

/* the merge rule of the deploy repositories: one review by someone other than the author; the reviewer merges (squash) after approving */
export const PR_POLICY = { reviews: 1, mergedBy: 'reviewer', reviewAfter: 250, mergeAfter: 45 };
/* where links point: one place, every screen and document reuses these */
export const SITES = { wake: 'https://wake.acme.example', alertmanager: 'https://alertmanager.acme.example', grafana: 'https://grafana.acme.example', runbooks: 'https://runbooks.acme.example', github: 'https://github.com', tickets: 'https://tickets.acme.example' };
/** the links of an incident: the web page (with the app path beside it), the alert, the runbook, the dashboard, a PR of its repository, a ticket */
export function linksOf(s, inc, repo = s.repo) {
  if (!s?.alert) return null;
  return {
    incident: `${SITES.wake}/clusters/${s.cluster}/incidents/${inc}`, app: `wake://cluster/${s.cluster}/incidents/${inc}`,
    alert: `${SITES.alertmanager}/#/alerts?filter=${encodeURIComponent(`{alertname="${s.alert}",namespace="${s.ns}"}`)}`,
    runbook: `${SITES.runbooks}/skills/${s.skill.id}/${s.skill.version}`,
    dashboard: `${SITES.grafana}/d/${s.dashboard.uid}/${s.dashboard.slug}?orgId=1&var-namespace=${s.ns}`, dashboardName: s.dashboard.title,
    pr: n => `${SITES.github}/${repo}/pull/${n}`,
    ticket: id => `${SITES.tickets}/browse/${id}`,
  };
}

/* wake-prod's nodes: the pending scenario quotes these counts (its scheduler message, the pool size before and after the removal), and the world builds its pools from them */
export const PROD_NODES = 40, GENERAL_NODES = 23;
/** a node's allocatable CPU in millicores: its cores less what the kubelet and the system reserve (140m) */
export const allocCpu = cores => cores * 1000 - 140;
/** the most pods a node of each instance type takes (EKS max-pods with the VPC CNI) */
export const POD_CAP = { 'm6i.2xlarge': 58, 'r6i.4xlarge': 234, 'c6i.4xlarge': 234 };
const SCHED_MSG = `0/${PROD_NODES} nodes are available: ${GENERAL_NODES} Insufficient cpu, ${PROD_NODES - GENERAL_NODES} node(s) didn't match Pod's node affinity/selector`;
/* the checkout error lines: one per pod every HIKARI_EVERY seconds while the error ratio is up (the logs, the evidence and the cause read the same count) */
export const HIKARI_EVERY = .28;
const S3_FROM = -540, S3_PODS = 2, S3_HITS = S3_PODS * Math.floor(-S3_FROM / HIKARI_EVERY);
export const S3_HIKARI = 'HikariPool-1 - Connection is not available, request timed out after 30000ms';

/* how a recovery is classed: what the check could show about the service */
export const RECOVERY = {
  service: { label: '서비스 복구', text: '사용자 경로의 성공까지 확인' },
  symptom: { label: '증상 회복', text: '증상 지표는 기준 아래로 돌아왔지만 복구 원인은 확인하지 못함' },
  mitigated: { label: '완화', text: '증상은 멈췄지만 원인은 남아 있음' },
  bypassed: { label: '검증 우회', text: '실패한 검사를 지워 얻은 정상 상태 · 원인은 그대로' },
  resumed: { label: '실행 재개 · Job Complete 확인 중', text: '배치가 다시 돌기 시작했지만 Job Complete와 처리 건수는 아직 확인 전' },
};

const pod = (name, status, restarts, start, change, extra = {}) => ({ kind: 'Pod', icon: 'k8s-pod', name, status, restarts, start, change, ...extra });
const ev = (type, reason, msg, n, at) => ({ type, reason, msg, n, at });
const iso = at => new Date((T0 + at) * 1000).toISOString().replace('.000', '');
/** a log line's own time as the container writes it: 10:45:59.400 */
const stamp = at => `${hms(Math.floor(at))}.${String(Math.round((at - Math.floor(at)) * 1000)).padStart(3, '0')}`;
const rawOf = lines => lines.map(l => `${stamp(l.at)} ${l.level.padEnd(5)} ${l.text}`).join('\n');

/** a follow-up: what to do, the team that owns it, its due (seconds from t0, and the date with its year) and what it comes from (cause, detection gap, process) */
const fu = (title, owner, days, from) => ({ title, owner, due: days * D, dueDate: ymd(days * D), from });
/** the scenarios at the clock now set (texts with a time in them are written for that clock) */
function build() {
  const crashEnd = S1_CRASH.lastEnd, crashStart = crashEnd - S1_CRASH.life; /* the payments container that died: started, wrote, and was OOMKilled at crashEnd */
  const s1Log = [{ at: -20.8, level: 'ERROR', text: 'java.lang.OutOfMemoryError: Java heap space at com.wake.payments.settlement.SettlementBatch.collect' }, { at: -20.7, level: 'ERROR', text: 'Exception in thread "settlement-batch-1" java.lang.OutOfMemoryError: Java heap space' }, { at: -19.4, level: 'WARN', text: 'G1 Old Generation pause 2977ms, heap 479M->479M(480M)' }];
  const s3Impact = { label: 'checkout-api 5xx', unit: '%', base: .3, during: 3.1, limit: 1, from: S3_FROM, load: .25, rps: 420, service: 'checkout-api', ns: 'checkout',
    query: '100 * sum(rate(http_requests_total{namespace="checkout",service="checkout-api",code=~"5.."}[5m])) / sum(rate(http_requests_total{namespace="checkout",service="checkout-api"}[5m]))' };
  const s4Start = -735, s4Job = `reports-batch-${Math.floor((T0 + s4Start) / 60)}`, s4Pod = `${s4Job}-k9x7t`, s4Next = s4Start + 1800;
  const s5Sync = -240, s5Fail = -155, s5Att = -170;
  const s5Log = [{ at: s5Att, level: 'INFO', text: 'smoke-test starting (attempt 3/3) target=http://orders.orders.svc:8080' }, { at: s5Att, level: 'INFO', text: 'GET /healthz 200 4ms' }, { at: s5Att + 1, level: 'INFO', text: 'GET /api/v1/orders?limit=1 200 38ms' }, { at: s5Att + 1, level: 'INFO', text: 'GET /healthz/deep -> checking dependencies: postgres ok, redis ok, inventory-api ...' }, { at: s5Att + 11, level: 'ERROR', text: 'GET /healthz/deep 503 · dependency inventory-api timeout after 10000ms' }, { at: s5Att + 11, level: 'ERROR', text: 'FAIL deep health check (3/3)' }, { at: s5Att + 11, level: 'ERROR', text: 'Error: smoke-test failed after 3 attempts' }];
  const s6End = -60, s6Start = s6End - 18, s6Cfg = -(23 * D + 4 * H + 23 * 60); /* before the two earlier incidents of the same kind (21 and 8 days ago) */
  const s6Log = [{ at: s6End - .6, level: 'ERROR', text: 'FATAL redis: ERR max number of clients reached' }];
  const pastDay = days => ymd(detectRel('s6') - days * D);
  return [
    {
      people: { ack: 74, read: 168 }, /* the on-call acknowledges the page, then reads the judgement before approving */
      retro: { good: ['종료 직전 working set 498Mi와 rev 14의 -Xmx 상향을 근거로 되돌릴 revision(rev 13)을 판정 18초 만에 좁혔습니다', 'Draft PR이 다른 사람의 리뷰를 거쳐 Argo CD 동기화로 적용되어 변경과 승인 기록이 한곳에 남았습니다'], bad: [`첫 OOMKilled에서 알림까지 ${gapWords(-S1_FIRST)}가 걸렸습니다(for 조건)`, 'JVM 힙 밖 메모리 지표가 없어 원인은 가설로 남았습니다', 'rev 14가 -Xmx와 requests.cpu를 한 커밋에서 함께 바꿔 되돌리기 범위가 넓어졌습니다'] }, /* 잘된 점과 아쉬운 점: this incident's own events */
      id: 's1', short: 'OOMKilled', rollsBack: true, missWindow: 3, extraTools: ['jvm'], errTop: 'payments', title: 'payments OOMKilled 반복 재시작', cluster: 'wake-prod', prod: true, ns: 'payments', severity: 'critical',
      alert: 'PaymentsRestarting', symptom: 'payments 컨테이너 OOMKilled 반복 · 재시작 6', repo: 'acme/payments-deploy', owners: { team: 'payments 팀', reviewer: 'jhkim' },
      dashboard: { uid: 'payments-overview', slug: 'payments', title: 'Grafana · payments 개요' },
      scope: [
        pod('payments-7c9f6-x2k4', ['error', 'CrashLoopBackOff · OOMKilled'], 6, S1_ROLL, `배포 ${hm(S1_ROLL)}`, { node: 'ip-10-0-3-17' }),
        pod('payments-7c9f6-q8m1', ['ok', 'Running'], 0, S1_ROLL, `배포 ${hm(S1_ROLL)}`, { node: 'ip-10-0-3-52' }),
        pod('payments-7c9f6-t5n8', ['ok', 'Running'], 0, S1_ROLL + 60, `배포 ${hm(S1_ROLL + 60)}`, { node: 'ip-10-0-5-9' }),
        { kind: 'Deployment', icon: 'k8s-deployment', name: 'payments', status: ['warn', 'Available False'], restarts: null, start: S1_ROLL, change: `rev 14 · ${hm(S1_ROLL)}` },
      ],
      crashLoop: S1_CRASH,
      impact: { label: '결제 API 5xx', unit: '%', base: .2, during: 3.1, limit: 1, from: S1_FIRST, rps: 140, service: 'payments', ns: 'payments',
        query: '100 * sum(rate(http_server_requests_seconds_count{namespace="payments",service="payments",status=~"5.."}[5m])) / sum(rate(http_server_requests_seconds_count{namespace="payments",service="payments"}[5m]))' },
      affects: { kind: 'api' },
      changes: [
        { id: 'c1', lane: 'deploy', at: S1_ROLL, commit: COMMITS.payRev14, previous: COMMITS.payRev13, tone: 'run', kind: '롤아웃', title: 'Deployment payments', text: `rev 13 → 14 · Argo CD · 커밋 ${COMMITS.payRev14}`, diff: { path: 'apps/payments/deployment.yaml', before: ['        - name: JAVA_OPTS', '          value: -Xmx384m'], after: ['        - name: JAVA_OPTS', '          value: -Xmx480m'] } },
        { id: 'c2', lane: 'config', at: S1_ROLL - 60, tone: 'neutral', kind: 'resources', title: 'Deployment payments', text: 'requests.cpu 300m → 420m', diff: { path: 'apps/payments/deployment.yaml', before: ['            cpu: 300m'], after: ['            cpu: 420m'] } },
        { id: 'c3', lane: 'infra', at: -2400, tone: 'neutral', kind: 'HPA Scale', title: 'HorizontalPodAutoscaler payments', text: 'replicas 2 → 3' },
        { id: 'c4', lane: 'symptom', at: S1_FIRST, end: 0, tone: 'danger', kind: 'OOMKilled', title: 'Pod payments-7c9f6-x2k4', text: 'Exit Code 137 · 재시작 6' },
        { id: 'c5', lane: 'symptom', at: 0, tone: 'warn', kind: '알림', title: 'PaymentsRestarting', text: 'Alertmanager · critical' },
      ],
      skill: { id: 'post-deploy-restart', version: 'v2', steps: ['Pod 상태와 lastState 읽기', '이전 컨테이너 로그', '이벤트(대상)', 'rollout history · rev 13 → 14 diff', 'working set 지표(지난 30분)', '과거 인시던트(같은 워크로드·같은 증상)'], ev: [1, 2, 3, 4, 5, 6] },
      evidence: [
        { id: 1, kind: 'Kubernetes API', got: 4, at: 4, target: { ns: 'payments', kind: 'Pod', name: 'payments-7c9f6-x2k4' }, query: 'GET /api/v1/namespaces/payments/pods/payments-7c9f6-x2k4', count: '1', cut: false, hash: 'a91f…e2', raw: `lastState:\n  terminated:\n    reason: OOMKilled\n    exitCode: 137\n    finishedAt: "${iso(crashEnd)}"\nrestartCount: 6\nresources:\n  limits:\n    memory: 512Mi` },
        { id: 2, kind: '로그', got: 6, from: crashStart, to: crashEnd, target: { ns: 'payments', kind: 'Pod', name: 'payments-7c9f6-x2k4', container: 'payments', previous: true }, query: 'pods/log payments-7c9f6-x2k4 container=payments previous=true tail=2000', key: 'OutOfMemoryError', cut: false, hash: '3c0d…91', lines: s1Log, raw: rawOf(s1Log) },
        { id: 3, kind: 'Kubernetes API', got: 8, from: 8 - H, to: 8, target: { ns: 'payments', kind: 'Pod', name: 'payments-7c9f6-x2k4' }, query: 'GET events involvedObject.uid=9f2c…a41', count: '2건', cut: false, hash: '77b2…0c', raw: 'Warning BackOff   Back-off restarting failed container payments in pod payments-7c9f6-x2k4_payments (×14)\nNormal  Pulled    Container image "registry.local/payments:2.8.0" already present on machine (×7)' },
        { id: 4, kind: 'GitOps', got: 10, at: 10, target: { ns: 'argocd', kind: 'Application', name: 'payments' }, query: 'argocd app history payments · diff rev 13..14', range: 'rev 13 → 14', count: '값 2개', cut: false, hash: 'e5a4…3b', raw: '-          value: -Xmx384m\n+          value: -Xmx480m\n-            cpu: 300m\n+            cpu: 420m' },
        { id: 5, kind: 'Prometheus', got: 12, from: -1800, to: 0, metric: 'memory', target: { ns: 'payments', kind: 'Pod', name: 'payments-7c9f6-x2k4', container: 'payments' }, query: 'container_memory_working_set_bytes{namespace="payments",pod="payments-7c9f6-x2k4",container="payments"}', count: '샘플 120개', cut: false, hash: '0f6e…d8' },
        { id: 6, kind: '과거 인시던트', got: 14, at: 14, query: 'payments/Deployment/payments + memory_limit_too_low', range: '지난 30일', count: '0건', cut: false, hash: '—', raw: '같은 워크로드·같은 후보의 지난 사건 없음(지난 30일)' },
      ],
      chain: {
        conclusion: 'rev 14에서 올린 힙 480m에 힙 밖 메모리를 더하면 limits.memory 512Mi를 넘을 수 있습니다', grade: 'inferred', source: { kind: 'skill', name: 'post-deploy-restart', version: 'v2' },
        cells: {
          observe: [{ text: 'lastState OOMKilled, Exit Code 137, 재시작 6', refs: [1] }, { text: 'OutOfMemoryError: Java heap space, 배치 SettlementBatch 중', refs: [2] }, { text: `${hm(S1_ROLL)} rev 14에서 -Xmx 384m → 480m`, refs: [4] }, { text: 'limits.memory 512Mi, 종료 직전 마지막 수집값 498Mi', refs: [5] }],
          basis: [{ text: '규칙 oom_memory_pressure v3: OOMKilled + 137은 limits.memory 초과' }, { text: '-Xmx는 힙만 제한하고 메타스페이스·스레드 스택·코드 캐시는 힙 밖에서 limits에 함께 잡힙니다' }],
          interpret: [{ text: '컨테이너가 메모리 limits에 걸려 종료됐습니다', refs: [1, 3] }, { text: '힙 상한 480m에 힙 밖 메모리를 더하면 512Mi에 닿습니다', refs: [4, 5] }],
          conclude: [{ text: '가설: rev 14의 힙 상한 상향 뒤 힙과 힙 밖 메모리의 합이 한도를 넘었을 수 있습니다(종료 순간 사용량은 15초 수집 사이라 남지 않음 · 힙 밖 크기는 재지 않음)' }],
          verify: [{ text: 'rev 13으로 되돌린 뒤 배치 1회를 포함해 5분 동안 OOMKilled가 없으면 복구는 확인됩니다' }, { text: '되돌리기는 -Xmx와 requests.cpu를 함께 바꾸므로 원인 확인은 힙 밖 메모리를 잰 뒤입니다(그때까지 가설)' }],
          unknown: [{ text: '힙 밖 메모리의 실제 사용량: JVM 지표 연결 안 됨' }],
        },
      },
      aiAlt: {
        conclusion: '힙 상한 480m과 limits.memory 512Mi 사이 여유가 32Mi뿐이라 힙 밖 메모리가 그보다 크면 한도를 넘습니다(힙 밖 크기는 재지 않음)', grade: 'inferred', source: { kind: 'ai', name: MODEL },
        cells: {
          observe: [{ text: 'G1 Old Generation 정지 2,977ms, heap 479M→479M(480M)', refs: [2] }, { text: '종료 직전 마지막 수집값 498Mi, limits.memory 512Mi', refs: [5] }],
          basis: [{ text: 'JVM은 힙 밖에 메타스페이스·스레드 스택·코드 캐시를 따로 씁니다(보통 수십 Mi)' }],
          interpret: [{ text: '힙이 상한까지 찬 상태에서 힙 밖 메모리가 더해져 한도에 닿았습니다', refs: [2, 5] }],
          conclude: [{ text: '추정: 되돌리기보다 한도를 768Mi로 올리는 편이 rev 14의 의도(힙 상향)를 살립니다' }],
          verify: [{ text: 'limits.memory 768Mi에서 배치 1회를 포함해 5분 동안 OOMKilled가 없으면 복구는 확인되지만, 원인 확인은 힙 밖 메모리를 잰 뒤입니다' }],
          unknown: [{ text: '힙 밖 메모리의 실제 크기: JVM 지표 연결 안 됨' }],
        },
      },
      rule: { name: 'oom_memory_pressure', version: 'v3', result: '완결' },
      memory: null,
      options: [
        { id: 'rollback', kind: '롤백', mode: 'pr', recovery: 'service', basis: '확인됨(rev 13 정상 운영 3일 2시간)', title: 'rev 13으로 되돌리기', grade: 'confirmed', change: 'JAVA_OPTS -Xmx480m → -Xmx384m, requests.cpu 420m → 300m (변경 2개)', impact: `Pod 3개 차례로 교체(maxSurge 25% · maxUnavailable 25%) · ${hm(S1_ROLL - 60)} requests.cpu 변경도 함께 되돌림`, path: ['Draft PR', 'PR 병합', 'Argo CD 동기화(최대 3분)', '롤아웃'], diff: { path: 'apps/payments/deployment.yaml', before: ['          value: -Xmx480m', '            cpu: 420m'], after: ['          value: -Xmx384m', '            cpu: 300m'] } },
        { id: 'tune', kind: '리소스 조정', mode: 'pr', recovery: 'service', basis: '추정(힙 밖 메모리 크기 확인 안 됨)', title: 'limits와 힙을 함께 조정', grade: 'inferred', change: 'limits.memory 512Mi → 768Mi, -Xmx 480m 유지 (변경 1개 · 유지 1개)', impact: 'Pod 3개 차례로 교체 · Node 여유 메모리 2.1Gi', note: '원인 판정 후 권장', path: ['Draft PR', 'PR 병합', 'Argo CD 동기화(최대 3분)', '롤아웃'], diff: { path: 'apps/payments/deployment.yaml', before: ['              memory: 512Mi'], after: ['              memory: 768Mi'] } },
      ],
      approval: { target: ['wake-prod', 'payments', 'Deployment payments'], change: 'Draft PR · acme/payments-deploy · apps/payments/deployment.yaml · 변경 값 2개 (-Xmx480m → -Xmx384m, requests.cpu 420m → 300m)', impact: 'Pod 3개 차례로 교체 · 되돌릴 수 없는 변경 없음' },
      verify: [{ id: 'v1', label: 'OOMKilled 재발 없음(조치 뒤 Pod)', metric: 'oom' }, { id: 'v2', label: '같은 오류 로그 없음', metric: 'log' }, { id: 'v3', label: '결제 API 5xx 임계값 1% 미만(사용자 경로)', metric: 'slo', value: '0.2% · 임계값 1%', userPath: true }, { id: 'v4', label: '배치 SettlementBatch 1회 이상 실행', metric: 'trigger' }],
      redactions: [{ label: '카드 번호(로그)', n: 2 }, { label: '토큰(환경 변수)', n: 2 }],
      pr: 142, script: [['skill', 3], ['judged', 18]], applyTimes: { sync: 95, rollout: 30 },
    },
    {
      people: { ack: 52, read: 97 }, /* the on-call acknowledges the page, then reads the judgement before approving */
      retro: { good: ['레지스트리 태그 목록으로 1.42가 없다는 사실을 바로 확인했습니다', '기존 ReplicaSet의 Pod 3개가 Ready로 남아(maxUnavailable 1) 사용자 요청 실패가 늘지 않았습니다'], bad: ['image-policy webhook이 레지스트리 경로만 보고 없는 태그를 통과시켰습니다', 'CI에 태그 존재 검사가 없어 오타가 운영 배포까지 갔습니다', 'ImagePullBackOff에서 알림까지 5분 30초가 걸렸습니다'] }, /* 잘된 점과 아쉬운 점: this incident's own events */
      id: 's2', short: 'ImagePull', rollsBack: true, title: 'orders ImagePullBackOff', cluster: 'wake-prod', prod: true, ns: 'orders', severity: 'warning', repo: 'acme/orders-deploy', owners: { team: 'orders 팀', reviewer: 'mlee' },
      dashboard: { uid: 'orders-overview', slug: 'orders', title: 'Grafana · orders 개요' },
      alert: 'OrdersPodsNotReady', symptom: 'orders 새 Pod ImagePullBackOff',
      scope: [pod('orders-6f8c9-k2p7', ['error', 'ImagePullBackOff'], 0, -360, `배포 ${hm(-360)}`), pod('orders-6f8c9-m4v1', ['error', 'ErrImagePull'], 0, -360, `배포 ${hm(-360)}`, { surge: true }), { kind: 'Deployment', icon: 'k8s-deployment', name: 'orders', status: ['warn', 'Progressing'], restarts: null, start: -360, change: `rev 9 · ${hm(-360)}` }],
      impact: null,
      affects: { kind: 'capacity', service: 'orders', ns: 'orders', ready: 3, want: 4, errRatio: .2, query: '100 * sum(rate(http_requests_total{namespace="orders",service="orders",code=~"5.."}[5m])) / sum(rate(http_requests_total{namespace="orders",service="orders"}[5m]))' },
      changes: [{ id: 'c1', lane: 'deploy', at: -360, commit: COMMITS.ordersRev9, previous: COMMITS.ordersGood, tone: 'run', kind: '롤아웃', title: 'Deployment orders', text: `rev 8 → 9 · image orders:1.42 · Argo CD · 커밋 ${COMMITS.ordersRev9}`, diff: { path: 'apps/orders/deployment.yaml', before: ['          image: registry.local/orders:1.4.1'], after: ['          image: registry.local/orders:1.42'] } }, { id: 'c2', lane: 'symptom', at: -330, end: 0, tone: 'danger', kind: 'ImagePullBackOff', title: 'Pod orders-6f8c9-k2p7', text: 'manifest unknown' }],
      skill: { id: 'image-pull', version: 'v1', steps: ['Pod 이벤트 읽기', '레지스트리 태그 목록 조회', 'rollout history · rev 8 → 9 diff', 'admission webhook 설정', 'Available replicas 지표(지난 30분)'], ev: [1, 2, 3, 4, 5] },
      evidence: [
        { id: 1, kind: 'Kubernetes API', got: 3, from: 3 - H, to: 3, target: { ns: 'orders', kind: 'Pod', name: 'orders-6f8c9-k2p7' }, query: 'GET events involvedObject.name=orders-6f8c9-k2p7', count: '2건', cut: false, hash: '11aa…09', raw: 'Warning Failed  Failed to pull image "registry.local/orders:1.42": manifest unknown' },
        { id: 2, kind: '레지스트리', got: 5, at: 5, query: 'GET https://registry.local/v2/orders/tags/list', count: '태그 12개', cut: false, hash: 'c3d1…5e', raw: '1.4.0, 1.4.1, 1.4.2-rc1, … (1.42 없음)' },
        { id: 3, kind: 'GitOps', got: 7, at: 7, target: { ns: 'argocd', kind: 'Application', name: 'orders' }, query: 'argocd app history orders · diff rev 8..9', range: 'rev 8 → 9', count: '값 1개', cut: false, hash: '9e0b…44', raw: '-          image: registry.local/orders:1.4.1\n+          image: registry.local/orders:1.42' },
      ],
      chain: { conclusion: '이미지 태그 1.42가 레지스트리에 없습니다(1.4.1의 오타로 보임)', grade: 'confirmed', source: { kind: 'rule', name: 'image_pull', version: 'v4' },
        cells: { observe: [{ text: 'Failed to pull image orders:1.42: manifest unknown', refs: [1] }, { text: '레지스트리 태그에 1.42 없음', refs: [2] }, { text: 'rev 9에서 image 1.4.1 → 1.42', refs: [3] }, { text: `${hm(-360)}부터 Available 3 · Desired 4(새 Pod 2개 시작 못 함 · maxSurge 1 · maxUnavailable 1)`, refs: [5] }], basis: [{ text: '규칙 image_pull v4: manifest unknown + 태그 없음 = 존재하지 않는 태그' }], interpret: [{ text: '배포가 없는 태그를 가리킵니다', refs: [1, 2, 3] }, { text: 'image-policy webhook은 레지스트리 경로만 보고 태그가 있는지는 보지 않아 통과시켰습니다', refs: [4] }], conclude: [{ text: '확인: 태그 1.42가 없습니다' }], verify: [{ text: '태그를 1.4.1로 되돌려 새 Pod가 Ready면 확인됩니다' }], unknown: [] } },
      rule: { name: 'image_pull', version: 'v4', result: '완결' },
      options: [{ id: 'tag', kind: '롤백', mode: 'pr', recovery: 'service', basis: '확인됨(1.4.1 레지스트리에 있음)', title: '태그 1.4.1로 되돌리기', grade: 'confirmed', change: 'image orders:1.42 → orders:1.4.1 (변경 1개)', impact: '새 ReplicaSet 대신 rev 10이 1.4.1로 Pod 4개를 차례로 교체', path: ['Draft PR', 'PR 병합', 'Argo CD 동기화(최대 3분)', '롤아웃'], diff: { path: 'apps/orders/deployment.yaml', before: ['          image: registry.local/orders:1.42'], after: ['          image: registry.local/orders:1.4.1'] } }],
      approval: { target: ['wake-prod', 'orders', 'Deployment orders'], change: 'Draft PR · acme/orders-deploy · 변경 값 1개 (image 태그)', impact: 'Pod 4개 차례로 교체 · 되돌릴 수 없는 변경 없음' },
      verify: [{ id: 'v1', label: 'ImagePullBackOff 없음', metric: 'oom' }, { id: 'v2', label: 'Ready 4 · Desired 4', metric: 'ready' }, { id: 'v3', label: 'orders 5xx 임계값 1% 미만(사용자 경로)', metric: 'slo', value: '0.2% · 임계값 1%', userPath: true }],
      redactions: [{ label: '레지스트리 토큰', n: 1 }], pr: 57, script: [['skill', 2], ['judged', 12]], applyTimes: { sync: 80, rollout: 25 },
    },
    {
      people: { ack: 88, read: 214 }, /* the on-call acknowledges the page, then reads the judgement before approving */
      retro: { good: ['NetworkPolicy를 읽어 정책 거부를 원인 후보에서 일찍 뺐습니다', 'DB 팀 회신이 티켓 DBA-4127로 남아 원인 근거(근거 [6])가 되었습니다'], bad: ['postgres-exporter가 없어 DB 연결 수를 Wake가 직접 보지 못했습니다', `5xx 상승에서 알림까지 ${gapWords(-S3_FROM)}가 걸렸습니다`, 'checkout 사용자 세션이 idle in transaction으로 쌓인 이유는 아직 모릅니다'] }, /* 잘된 점과 아쉬운 점: this incident's own events */
      id: 's3', short: '5xx 근거 부족', extraTools: ['pgexporter'], errTop: 'checkout-api', reqFlow: true, title: 'checkout-api 5xx 비율 상승', cluster: 'wake-prod', prod: true, ns: 'checkout', severity: 'critical', repo: 'acme/checkout-deploy', owners: { team: 'checkout 팀', reviewer: 'sypark' },
      dashboard: { uid: 'checkout-overview', slug: 'checkout', title: 'Grafana · checkout 개요' },
      alert: 'CheckoutHighErrorRate', symptom: `checkout-api 5xx 비율 ${s3Impact.during}%`,
      scope: [{ kind: 'Deployment', icon: 'k8s-deployment', name: 'checkout-api', status: ['warn', `Available · 5xx 비율 ${s3Impact.during}%`], restarts: null, start: S3_FROM, change: '변경 없음(24시간)' }, pod('checkout-api-7cf98-p4x2m', ['ok', 'Running'], 0, -2 * D, ''), pod('checkout-api-7cf98-d9m2p', ['ok', 'Running'], 0, -2 * D, '')],
      impact: s3Impact, affects: { kind: 'api' },
      changes: [{ id: 'c1', lane: 'symptom', at: s3Impact.from, end: 0, tone: 'danger', kind: '5xx 비율', title: 'checkout-api', text: `5xx ${s3Impact.during}%` }, { id: 'c2', lane: 'infra', at: -3000, tone: 'neutral', kind: 'Node 추가', title: 'ip-10-0-11-6', text: 'cluster-autoscaler' }],
      skill: { id: 'error-rate', version: 'v1', steps: ['5xx 비율 지표(지난 1시간)', '최근 변경(24시간)', '애플리케이션 로그 오류 묶음', 'DB 연결 지표', 'Secret checkout-db', 'NetworkPolicy'], ev: [1, null, 2, 3, 4, 5], notes: { 1: '변경 0건 · checkout-api 24시간 배포·설정 변경 없음' }, blocked: { 3: ['idle', '연결 안 됨'], 4: ['perm', '권한 밖'] } },
      evidence: [
        { id: 1, kind: 'Prometheus', got: 4, from: -H, to: 0, metric: 'error_ratio', target: { ns: 'checkout', kind: 'Service', name: 'checkout-api' }, query: s3Impact.query, count: '샘플 240개', cut: false, hash: '4d2e…71' },
        { id: 2, kind: '로그', got: 7, from: -900, to: 0, target: { ns: 'checkout', kind: 'Deployment', name: 'checkout-api', container: 'checkout-api' }, query: '{namespace="checkout", app="checkout-api"} |= "Connection is not available"', key: 'Connection is not available', count: `${S3_HITS.toLocaleString('en-US')}줄`, cut: false, hash: 'b8c3…20', raw: `ERROR ${S3_HIKARI} (×${S3_HITS.toLocaleString('en-US')})` },
        { id: 3, kind: 'Prometheus', got: 9, query: 'pg_stat_activity_count{datname="checkout"}', range: '—', count: '없음', cut: false, hash: '—', raw: 'postgres-exporter가 없어 DB 연결 수 지표가 없음', blocked: '연결 안 됨' },
        { id: 4, kind: 'Kubernetes API', got: 11, query: 'GET secret checkout-db', range: '—', count: '—', cut: false, hash: '—', raw: '읽지 않음(Secret 읽기는 기본 권한에 넣지 않음)', blocked: '권한' },
      ],
      chain: { conclusion: 'DB 연결 풀 고갈로 보이나 DB 쪽 근거를 확인하지 못했습니다', grade: 'insufficient', held: true, source: { kind: 'skill', name: 'error-rate', version: 'v1' },
        cells: { observe: [{ text: `${hm(s3Impact.from)}부터 5xx ${s3Impact.during}%`, refs: [1] }, { text: `Connection is not available ${S3_HITS.toLocaleString('en-US')}회`, refs: [2] }, { text: '지난 24시간 배포·설정 변경 없음' }], basis: [{ text: '판정 규칙 error_rate v2: DB 연결 수 신호가 없어 판정 보류' }], interpret: [{ text: '애플리케이션이 DB 연결을 얻지 못합니다', refs: [2] }], conclude: [{ text: '가설: DB 연결 고갈로 보이나 확인하지 못했습니다' }], verify: [{ text: 'DB 최대 연결 수와 현재 연결 수를 보면 확인됩니다' }], unknown: [{ text: 'DB 연결 수: postgres-exporter 없음', refs: [3] }, { text: 'Secret checkout-db: 읽지 않음(기본 권한 밖)', refs: [4] }] } },
      rule: { name: 'error_rate', version: 'v2', result: '보류 · 빠진 근거: DB 연결 수', held: true },
      /* the cause once the DB team's reply (a numbered evidence added after the approval) is in: supported by that reply, still not seen in Wake's own metrics */
      chainAfterReply: { conclusion: 'DB 연결 풀 고갈: orders-db 연결이 max_connections 200 중 198까지 찼고 checkout 사용자의 idle in transaction 세션 64개가 연결을 잡고 있었습니다', grade: 'inferred', supported: 'reply', source: { kind: 'skill', name: 'error-rate', version: 'v1' },
        cells: { observe: [{ text: `${hm(s3Impact.from)}부터 5xx ${s3Impact.during}%`, refs: [1] }, { text: `Connection is not available ${S3_HITS.toLocaleString('en-US')}회`, refs: [2] }, { text: 'DB 팀 회신: max_connections 200 중 198 사용 · idle in transaction 세션 64개 종료', refs: [6] }], basis: [{ text: '판정 규칙 error_rate v2: DB 연결 수 신호를 사람 회신(티켓)으로 받음 · Wake 지표로는 확인 안 됨' }], interpret: [{ text: '세션이 연결을 잡아 풀에서 새 연결을 얻지 못했습니다', refs: [2, 6] }, { text: '세션 종료 직후 5xx가 기준선으로 내려갔습니다', refs: [1, 6] }], conclude: [{ text: 'DB 팀 회신으로 뒷받침됨: DB 연결 고갈이 원인입니다(Wake 지표로는 확인 안 됨)' }], verify: [{ text: 'postgres-exporter 연결 뒤 연결 수가 max_connections 70% 아래로 유지되면 확인됩니다' }], unknown: [{ text: 'idle in transaction 세션이 쌓인 이유(애플리케이션 쪽)', refs: [6] }] } },
      options: [{ id: 'handoff', kind: '에스컬레이션', mode: 'manual', recovery: 'service', to: 'DB 팀',
        reply: { kind: '사람 회신', query: '티켓 DBA-4127 회신(DB 팀 kmin)', count: '회신 1건', cut: false, hash: 'f2a9…4b', raw: 'orders-db: max_connections 200 중 198 사용 중\ncheckout 사용자의 idle in transaction 세션 64개 종료(pg_terminate_backend)\n종료 뒤 활성 연결 131' },
        external: { actor: 'kmin', team: 'DB 팀', ticket: 'DBA-4127', after: 420, settle: 60, did: 'orders-db에서 checkout 사용자의 idle in transaction 세션 64개 종료 · max_connections 200 중 198 사용 중이었음(DB 팀 회신)', observed: `checkout-api 5xx ${s3Impact.base}%대로 내려감 · Connection is not available 멈춤` },
        verifyExtra: [{ id: 'x1', label: 'DB 연결 여유(max_connections 대비)', metric: 'db', optional: true }], residual: '세션이 쌓인 원인(DB 쪽)은 Wake가 확인하지 못함 · postgres-exporter 연결 필요', basis: '근거 부족(DB 지표 연결 안 됨)', title: 'DB 팀에 확인 요청', grade: 'insufficient', change: '클러스터 변경 없음 · 요청 내용 복사', impact: '없음', path: ['요청 내용 복사', 'DB 팀 조치', '조치 완료 표시'],
        command: `[wake-prod] checkout-api 5xx ${s3Impact.during}% (${hm(s3Impact.from)}부터, 기준 ${s3Impact.limit}%)\nHikariPool-1: Connection is not available ${S3_HITS.toLocaleString('en-US')}회/15분\n확인 요청: orders-db 최대 연결 수와 현재 연결 수, ${hm(s3Impact.from)} 이후 DB 쪽 변경\nWake 인시던트: INC-${INC_BASE + 3}` }],
      approval: { target: ['wake-prod', 'checkout', 'Deployment checkout-api'], change: '클러스터를 바꾸지 않음 · DB 팀 확인 요청', impact: '없음' },
      verify: [{ id: 'v1', label: `checkout-api 5xx 임계값 ${s3Impact.limit}% 미만(사용자 경로)`, metric: 'slo', value: `${s3Impact.base}% · 임계값 ${s3Impact.limit}%`, userPath: true }, { id: 'v2', label: 'Connection is not available 없음', metric: 'log' }],
      redactions: [{ label: 'DB 접속 문자열', n: 1 }], script: [['skill', 3], ['judged', 16]], applyTimes: { sync: 0, rollout: 60 },
    },
    {
      people: { ack: 131, read: 183 }, /* the on-call acknowledges the page, then reads the judgement before approving */
      retro: { good: ['FailedScheduling 원문과 Node별 여유로 쿼터가 아니라 Node 자리 부족임을 확인했습니다', `플랫폼 팀이 티켓 PLAT-2291로 desiredSize를 되돌려 다음 실행(${hm(s4Next)}) 전에 처리를 다시 시작했습니다`], bad: ['Node 업그레이드가 surge 없이 desiredSize를 줄여 배치 Pod의 자리를 없앴습니다', `Pending에서 알림까지 ${gapWords(-s4Start)}가 걸렸습니다`] }, /* 잘된 점과 아쉬운 점: this incident's own events */
      id: 's4', short: 'Pending', title: 'reports-batch Pending', cluster: 'wake-prod', prod: true, ns: 'reports', severity: 'warning', repo: 'acme/reports-deploy', owners: { team: 'reports 팀', reviewer: 'mlee' },
      dashboard: { uid: 'reports-batch', slug: 'reports-batch', title: 'Grafana · reports 배치' },
      alert: 'ReportsPending', symptom: 'reports-batch Pending · NodeGroup general Insufficient cpu',
      scope: [pod(s4Pod, ['warn', 'Pending · Insufficient cpu'], 0, s4Start, `Node 제거 ${hm(-1320)}`), { kind: 'Node', icon: 'k8s-node', name: 'ip-10-0-9-3', status: ['idle', '제거됨'], restarts: null, start: -1320, change: 'NodeGroup general 축소' }],
      impact: null,
      affects: { kind: 'batch', cron: 'reports-batch', every: 1800, run: s4Start, job: s4Job, next: s4Next, items: 1240, runFor: 240, deadline: s4Next, policy: 'Replace' },
      changes: [{ id: 'c1', lane: 'infra', at: -1320, tone: 'warn', kind: 'Node 제거', title: 'ip-10-0-9-3', text: `NodeGroup general desiredSize ${GENERAL_NODES + 1} → ${GENERAL_NODES} · Node 업그레이드 중 축소(ip-10-0-9-3 제거)` }, { id: 'c2', lane: 'symptom', at: s4Start, end: 0, tone: 'warn', kind: 'FailedScheduling', title: `Pod ${s4Pod}`, text: SCHED_MSG }],
      skill: { id: 'scheduling', version: 'v1', steps: ['Pod 이벤트 원문', 'Node Allocatable과 requests 합', '최근 인프라 변경', 'namespace ResourceQuota', 'NodeGroup general Ready Node 지표(지난 1시간)'], ev: [1, 2, 3, 4, 5] },
      evidence: [
        { id: 1, kind: 'Kubernetes API', got: 3, from: 3 - H, to: 3, target: { ns: 'reports', kind: 'Pod', name: s4Pod }, query: `GET events involvedObject.name=${s4Pod}`, count: '1건', cut: false, hash: '5c1f…aa', raw: `Warning FailedScheduling ${SCHED_MSG}. preemption: 0/${PROD_NODES} nodes are available: ${PROD_NODES} No preemption victims found for incoming pod. (×12)` },
        { id: 2, kind: 'Kubernetes API', got: 5, at: 5, target: { kind: 'NodeGroup', name: 'general' }, query: 'list nodes -l eks.amazonaws.com/nodegroup=general + pods requests', count: `Node ${GENERAL_NODES}`, cut: false, hash: '7e2d…10', raw: `general 노드풀 Node ${GENERAL_NODES}개 · Allocatable cpu ${(GENERAL_NODES * allocCpu(8) / 1000).toFixed(1)}코어(${(GENERAL_NODES * allocCpu(8)).toLocaleString('en-US')}m) · requests 합 ${(GENERAL_NODES * allocCpu(8) - 1840).toLocaleString('en-US')}m · 여유 합 1,840m\nNode별 여유 상위: ip-10-0-5-9 620m · ip-10-0-7-3 410m · ip-10-0-2-40 300m · 그 밖의 20개는 각 30m 이하\nreports-batch 요청 1,000m: 이를 받을 Node 없음(가장 큰 여유 620m)` },
        { id: 3, kind: 'Kubernetes API', got: 7, from: 7 - H, to: 7, target: { kind: 'Node', name: 'ip-10-0-9-3' }, query: 'GET events involvedObject.kind=Node', count: '2건', cut: false, hash: 'aa31…6f', raw: `NodeNotReady ip-10-0-9-3 · RemovingNode (general 노드풀 ${GENERAL_NODES + 1} → ${GENERAL_NODES})` },
      ],
      chain: { conclusion: `NodeGroup general이 ${GENERAL_NODES + 1}개에서 ${GENERAL_NODES}개로 줄어 CPU requests 1,000m를 받을 Node가 없습니다`, grade: 'confirmed', source: { kind: 'rule', name: 'scheduling', version: 'v3' },
        cells: { observe: [{ text: `0/${PROD_NODES} nodes are available: general ${GENERAL_NODES}개 모두 Insufficient cpu`, refs: [1] }, { text: 'general 여유 합 1,840m이지만 Node마다 나뉘어 가장 큰 여유는 ip-10-0-5-9의 620m · 필요 1,000m', refs: [2] }, { text: `${hm(-1320)} Node 제거 · general Ready Node ${GENERAL_NODES + 1} → ${GENERAL_NODES}`, refs: [3, 5] }], basis: [{ text: '규칙 scheduling v3: Insufficient cpu + 여유 < 요청' }], interpret: [{ text: 'requests 1,000m를 한 번에 받을 Node가 없습니다(이 Pod는 NodeGroup general에만 스케줄)', refs: [2] }, { text: 'ResourceQuota는 원인이 아닙니다: Pod는 만들어졌고(FailedCreate 0건) requests.cpu 7,600m로 hard 8,000m 안입니다', refs: [4] }], conclude: [{ text: '확인: Node마다 CPU 여유가 요청보다 작습니다' }], verify: [{ text: 'general Node 추가 또는 requests 조정 뒤 reports-batch Pod가 스케줄되어 Ready면 확인됩니다' }], unknown: [] } },
      rule: { name: 'scheduling', version: 'v3', result: '완결' },
      options: [{ id: 'node', kind: '수동 조치', mode: 'manual', recovery: 'service', to: '플랫폼 팀',
        external: { actor: 'hyun.cho', team: '플랫폼 팀', ticket: 'PLAT-2291', after: 240, settle: 170, did: `aws eks update-nodegroup-config 실행 · general desiredSize ${GENERAL_NODES} → ${GENERAL_NODES + 1}`, observed: `Node ip-10-0-9-41 Ready(NodeGroup general ${GENERAL_NODES + 1}개) · reports-batch Pod가 ip-10-0-9-41에 스케줄됨` },
        verifyExtra: [{ id: 'x1', label: `NodeGroup general Node ${GENERAL_NODES + 1}개 Ready`, metric: 'ready' }], target: ['wake-prod', 'eks', 'NodeGroup general'], basis: '확인됨(Node 제거 뒤부터 Pending)', title: `NodeGroup general ${GENERAL_NODES + 1}개로 되돌리기`, grade: 'confirmed', change: '클라우드 NodeGroup 설정(Wake 밖) · 명령 복사', impact: 'Node 1개 추가(m6i.2xlarge · 8코어)', path: ['명령 복사', '플랫폼 팀 실행', '조치 완료 표시'],
        command: `aws eks update-nodegroup-config --cluster-name wake-prod --nodegroup-name general --scaling-config minSize=${GENERAL_NODES + 1},maxSize=30,desiredSize=${GENERAL_NODES + 1}` },
      { id: 'req', kind: '리소스 조정', mode: 'pr', recovery: 'mitigated', basis: '추정(실행 시간 영향 확인 안 됨) · ip-10-0-5-9 여유 620m ≥ 500m', observed: `새 Job ${`reports-batch-${Math.floor((T0 + s4Next) / 60)}`} 생성 · Pod가 ip-10-0-5-9에 스케줄됨(요청 500m · 그 Node 여유 620m → 120m) · Pending이던 Job ${s4Job}은 concurrencyPolicy Replace로 교체됨`, title: 'reports-batch requests.cpu 500m로 조정', grade: 'inferred', change: 'requests.cpu 1000m → 500m (변경 1개)', impact: '배치 실행 시간 증가 가능성 · Pending인 실행은 다음 일정에서 교체됨', path: ['Draft PR', 'PR 병합', 'Argo CD 동기화(최대 3분)', '다음 실행'], target: ['wake-prod', 'reports', 'CronJob reports-batch'], repo: 'acme/reports-deploy', diff: { path: 'apps/reports/cronjob.yaml', before: ['                cpu: 1000m'], after: ['                cpu: 500m'] } }],
      approval: { target: ['wake-prod', 'reports', 'CronJob reports-batch'], change: '클러스터 밖 조치(NodeGroup) · 명령 복사', impact: 'Node 1개 추가' },
      verify: [{ id: 'v1', label: `${s4Job} 실행이 스케줄되고 Ready`, metric: 'ready' }, { id: 'v3', label: `Job ${s4Job} Complete · 정산 리포트 1,240건 처리`, metric: 'job', userPath: true }, { id: 'v2', label: 'Running이지만 Ready 아닌 Pod 없음', metric: 'oom' }],
      redactions: [], script: [['skill', 2], ['judged', 12]], applyTimes: { sync: 0, rollout: 90 },
    },
    {
      people: { ack: 61, read: 151 }, /* the on-call acknowledges the page, then reads the judgement before approving */
      retro: { good: ['hook 로그와 inventory-api p99로 새 버전이 아니라 의존 서비스 지연임을 좁혔습니다'], bad: ['되돌리기가 smoke-test hook까지 지워 배포 전 검사를 우회했습니다', 'inventory namespace 읽기 권한이 없어 의존 서비스 상태를 Wake가 확인하지 못했습니다', 'inventory-api를 거치는 사용자 경로는 판정하지 못한 채 닫았습니다'] }, /* 잘된 점과 아쉬운 점: this incident's own events */
      id: 's5', short: 'GitOps', title: 'orders PreSync 실패', cluster: 'wake-prod', prod: true, ns: 'argocd', severity: 'warning', repo: 'acme/orders-deploy', owners: { team: 'orders 팀', reviewer: 'mlee' },
      dashboard: { uid: 'argocd-apps', slug: 'argo-cd', title: 'Grafana · Argo CD Application' },
      alert: 'ArgoAppSyncFailed', symptom: 'orders OutOfSync · PreSync Failed',
      scope: [{ kind: 'Application', icon: 'k8s-application', name: 'orders', key: 'orders-app', status: ['error', 'OutOfSync · PreSync Failed'], restarts: null, start: s5Sync, change: `커밋 ${COMMITS.ordersNew} ${hm(s5Sync)}` }, { kind: 'Job', icon: 'k8s-job', name: 'smoke-test', status: ['error', 'Failed · BackoffLimitExceeded'], restarts: null, start: s5Sync, change: '' }],
      impact: null,
      affects: { kind: 'deploy', service: 'orders', ns: 'orders', running: '1.4.1', blocked: '1.5.0', errRatio: .2, owner: 'orders 팀', next: 15 * 60, query: '100 * sum(rate(http_requests_total{namespace="orders",service="orders",code=~"5.."}[5m])) / sum(rate(http_requests_total{namespace="orders",service="orders"}[5m]))' },
      changes: [{ id: 'c1', lane: 'deploy', at: s5Fail, tone: 'danger', kind: 'GitOps 적용 실패', title: 'Application orders', text: 'PreSync hook Job smoke-test Exit Code 1 · 리소스 적용 안 됨' }],
      skill: { id: 'gitops-sync', version: 'v1', steps: ['Application 상태와 operationState', 'hook Job 로그', '이력과 diff', 'inventory-api 응답 시간 지표(지난 1시간)'], ev: [1, 2, null, 3], notes: { 2: `${COMMITS.ordersGood} → ${COMMITS.ordersNew} · image 1.4.1 → 1.5.0 · 근거로 쓰지 않음` } },
      evidence: [
        { id: 1, kind: 'Kubernetes API', got: 3, at: 3, target: { ns: 'argocd', kind: 'Application', name: 'orders' }, query: 'GET /apis/argoproj.io/v1alpha1/namespaces/argocd/applications/orders', count: '1', cut: false, hash: '2b44…e9', raw: `# Application CR(Kubernetes API 읽기) · Argo CD API 계정은 읽기 전용이라 이력·diff는 읽지 않음\nstatus.sync.status: OutOfSync · status.health.status: Healthy · syncPolicy.automated: prune, selfHeal\nstatus.operationState.phase: Failed · message: PreSync hook smoke-test failed\nstatus.sync.revision: ${COMMITS.ordersNew} · 실행 중 revision: ${COMMITS.ordersGood}` },
        { id: 2, kind: '로그', got: 5, from: s5Att - 5, to: s5Fail, target: { ns: 'orders', kind: 'Job', name: 'smoke-test', container: 'smoke-test' }, query: 'job/smoke-test', key: '503|FAIL|Error', count: '조회 42줄(시도 3번) · 표시 마지막 7줄', cut: true, hash: '61de…c0', lines: s5Log, raw: s5Log.map(l => `${hms(Math.floor(l.at))} ${l.text}`).join('\n') },
      ],
      chain: { conclusion: 'PreSync hook smoke-test가 inventory-api 시간 초과로 실패해 1.5.0이 적용되지 않았습니다', grade: 'inferred', held: true, source: { kind: 'skill', name: 'gitops-sync', version: 'v1' },
        cells: { observe: [{ text: 'PreSync hook smoke-test 실패 · operation Failed', refs: [1] }, { text: '/healthz/deep 503 · inventory-api timeout', refs: [2] }, { text: `inventory-api p99 응답 시간이 ${hm(-900)}부터 늘어 10초(smoke-test 시간 초과 한도)에 닿음`, refs: [3] }], basis: [{ text: 'PreSync hook이 실패하면 Argo CD는 리소스를 적용하지 않고 operation을 Failed로 끝냅니다(지금 실행 중인 1.4.1 그대로)' }], interpret: [{ text: '새 버전 문제가 아니라 의존 서비스 응답 실패일 수 있습니다', refs: [2, 3] }], conclude: [{ text: '가설: 의존 서비스 시간 초과로 hook이 실패했습니다' }], verify: [{ text: 'inventory-api 응답이 돌아온 뒤 다시 동기화가 성공하면 이 가설이 맞습니다' }], unknown: [{ text: 'inventory-api가 느려진 이유: inventory namespace 읽기 권한 없음(지표만 읽음)' }] } },
      rule: { name: 'deployment_gitops', version: 'v2', result: '보류 · 빠진 근거: 의존 서비스 상태', held: true },
      options: [{ id: 'pr', kind: '롤백', mode: 'pr', recovery: 'bypassed', basis: `추정(마지막 정상 버전 ${COMMITS.ordersGood} · Application CR로 확인 · Argo CD API로 되돌리는 권한은 없음)`, title: `커밋 ${COMMITS.ordersNew} 롤백 Draft PR`, grade: 'inferred', diff: { path: 'apps/orders/deployment.yaml', before: ['          image: registry.local/orders:1.5.0', '  - name: smoke-test', '    hook: PreSync'], after: ['          image: registry.local/orders:1.4.1'] }, change: 'Git 되돌리기 커밋 1개(image 1.5.0 → 1.4.1 · PreSync hook smoke-test 제거)', impact: 'Pod 교체 없음(지금 실행 중인 1.4.1과 같아짐) · 배포 전 검사 smoke-test도 함께 지워짐', residual: '실패 원인(inventory-api 응답 없음)은 그대로 · hook을 지워 검사를 건너뛴 것', path: ['Draft PR', 'PR 병합', 'Argo CD 동기화(최대 3분)'] }, { id: 'history', kind: '권한 없음', title: 'Argo CD 이력으로 되돌리기', grade: 'inferred', change: '자동 동기화를 먼저 꺼야 함', impact: 'Wake는 Argo CD를 읽기 전용 계정으로 연결', note: '자동 동기화 켜짐 · 쓰기 계정 없음', path: ['자동 동기화 끄기 승인', '되돌리기', 'Git 맞추기 PR', '자동 동기화 켜기'], disabled: true }],
      approval: { target: ['wake-prod', 'argocd', 'Application orders'], change: 'Draft PR · acme/orders-deploy · 되돌리기 커밋 1개(image 1.5.0 → 1.4.1 · PreSync hook smoke-test 제거)', impact: '클러스터 직접 수정 없음(자동 동기화 켜짐) · 배포 전 검사 smoke-test가 지워짐' },
      verify: [{ id: 'v1', label: 'Synced · Healthy', metric: 'gitops', source: 'Kubernetes API(Application CR · 읽기 전용)' }, { id: 'v2', label: 'orders Pod Ready · 오류 로그 없음(hook 없이 확인)', metric: 'oom' }, { id: 'v3', label: 'orders 주문 API 5xx 임계값 1% 미만', metric: 'slo', value: '0.2% · 임계값 1%' }, { id: 'v4', label: 'inventory-api를 거치는 주문 생성 성공(사용자 경로)', metric: 'none', userPath: true, unjudged: '판정 안 함 · inventory namespace 읽기 권한 없음 · smoke-test가 지워져 다시 돌지 않음' }],
      redactions: [], pr: 95, script: [['skill', 2], ['judged', 12]], applyTimes: { sync: 110, rollout: 20 },
    },
    {
      people: { ack: 95, read: 262 }, /* the on-call acknowledges the page, then reads the judgement before approving */
      retro: { good: ['과거 인시던트 2건을 묶어 재시작으로는 재발한다는 점을 근거로 원인 조치(SESSION_TTL)를 골랐습니다'], bad: ['같은 증상이 30일 안에 세 번째입니다', 'Redis 연결 수가 8일 동안 한도까지 늘어나는 동안 알림이 없었습니다', '7일 관찰이 끝나기 전이라 근본 원인 확인은 아직입니다'] }, /* 잘된 점과 아쉬운 점: this incident's own events */
      id: 's6', short: '반복', title: 'auth CrashLoopBackOff', cluster: 'wake-prod', prod: true, ns: 'auth', severity: 'warning', repo: 'acme/auth-deploy', owners: { team: 'auth 팀', reviewer: 'sypark' },
      dashboard: { uid: 'auth-overview', slug: 'auth', title: 'Grafana · auth 개요' },
      alert: 'AuthCrashLooping', symptom: 'auth CrashLoopBackOff · 지난 30일 3번째', repeat: 3,
      scope: [pod('auth-66b4c-zz19', ['error', 'CrashLoopBackOff · Error'], 4, -300, `설정 변경 ${ymd(s6Cfg)}`), { kind: 'Deployment', icon: 'k8s-deployment', name: 'auth', status: ['warn', 'Available · NotReady 1'], restarts: null, start: -300, change: '' }],
      impact: null,
      affects: { kind: 'auth', service: 'auth', ns: 'auth', base: .1, during: 2.4, from: -300, rps: 85, ready: 4, want: 5, query: '100 * sum(rate(auth_login_requests_total{namespace="auth",result="error"}[5m])) / sum(rate(auth_login_requests_total{namespace="auth"}[5m]))' },
      changes: [{ id: 'c1', lane: 'config', at: s6Cfg, tone: 'neutral', kind: 'ConfigMap', title: 'ConfigMap auth-config', text: 'SESSION_TTL 3600 → 86400' }, { id: 'c2', lane: 'symptom', at: -300, end: 0, tone: 'danger', kind: 'CrashLoopBackOff', title: 'Pod auth-66b4c-zz19', text: 'Exit Code 1 · redis: max number of clients reached' }],
      skill: { id: 'crashloop-dependency', version: 'v1', steps: ['Pod 상태와 lastState', '이전 컨테이너 로그', '과거 인시던트(같은 워크로드·같은 증상)', 'Redis 연결 지표'], ev: [null, 1, 2, 3], notes: { 0: 'lastState Error · Exit Code 1 · 재시작 4 · 근거로 쓰지 않음' } },
      evidence: [
        { id: 1, kind: '로그', got: 4, from: s6Start, to: s6End, target: { ns: 'auth', kind: 'Pod', name: 'auth-66b4c-zz19', container: 'auth', previous: true }, query: 'pods/log auth-66b4c-zz19 container=auth previous=true', key: 'FATAL', cut: false, hash: '8f21…3d', lines: s6Log, raw: rawOf(s6Log) },
        { id: 2, kind: '과거 인시던트', got: 7, at: 7, query: 'auth/Deployment/auth + redis_clients_exhausted', range: '지난 30일', count: '2건', cut: false, hash: 'd0e9…11', raw: `${pastDay(21)} 재시작으로 끝남 · ${pastDay(8)} 되돌리기로 끝남(PR #131) · 둘 다 복구 확인됨` },
        { id: 3, kind: 'Prometheus', got: 10, from: -7 * D, to: 0, metric: 'redis_clients', target: { ns: 'auth', kind: 'StatefulSet', name: 'auth-redis' }, query: 'max_over_time(redis_connected_clients{namespace="auth",service="auth-redis"}[5m])', count: '샘플 2,016개', cut: false, hash: '55c2…7a' },
      ],
      chain: { conclusion: '세션 TTL 연장으로 Redis 연결이 쌓여 주기적으로 한도에 닿습니다', grade: 'inferred', source: { kind: 'skill', name: 'crashloop-dependency', version: 'v1' },
        cells: { observe: [{ text: 'redis: max number of clients reached', refs: [1] }, { text: '지난 30일 같은 증상 2회, 재시작·되돌리기로 끝남', refs: [2] }, { text: '8일 전 되돌리기(PR #131)로 비운 연결이 다시 늘어 maxclients 10000에 닿음', refs: [3] }], basis: [{ text: '규칙 crashloop v5: Exit Code 1 + 의존 서비스 오류 → 원인 후보: 의존 서비스' }], interpret: [{ text: '되돌리기·재시작은 연결을 비워 잠시 낫게 할 뿐입니다', refs: [2, 3] }], conclude: [{ text: '추정: 세션 TTL 연장이 재발 원인입니다' }], verify: [{ text: 'TTL을 3600으로 돌리고 7일 동안 연결 최대가 maxclients 70% 아래면 이 추정이 맞습니다' }], unknown: [] } },
      rule: { name: 'crashloop', version: 'v5', result: '완결(원인 종류) · 근본 원인은 추정' },
      memory: { count: 2, text: '지난 30일 같은 증상 2회 · 둘 다 재시작·되돌리기로 끝남 · 반복' },
      options: [{ id: 'root', kind: '설정 변경', mode: 'pr', recovery: 'mitigated', watch: 7 * D, basis: '추정(7일 관찰 필요)', title: 'SESSION_TTL 86400 → 3600', grade: 'inferred', change: 'ConfigMap 값 1개', impact: '세션 1시간 뒤 만료(다시 로그인)', path: ['Draft PR', 'PR 병합', 'Argo CD 동기화(최대 3분)', 'Pod 재시작'], diff: { path: 'apps/auth/configmap.yaml', before: ['  SESSION_TTL: "86400"'], after: ['  SESSION_TTL: "3600"'] } },
        { id: 'restart', kind: '재시작', mode: 'manual', recovery: 'mitigated', to: '당번(kubectl 직접 실행)',
          external: { actor: ME, team: '당번', ticket: null, after: 60, settle: 75, did: 'kubectl -n auth rollout restart deployment/auth 실행', observed: 'Deployment auth 롤아웃 완료 · 새 Pod 5개 Ready' },
          residual: '근본 원인(SESSION_TTL) 해결 전 · 재발 가능', basis: '완화만(지난 두 번 재발)', title: 'Deployment auth 재시작(지난 두 번과 같음)', grade: 'insufficient', change: '값 바꿈 없음 · Wake는 읽기 전용이라 명령만 복사', impact: 'Pod 5개 차례로 교체 · 재발 가능성 높음', path: ['명령 복사', '당번 실행', '조치 완료 표시'], target: ['wake-prod', 'auth', 'Deployment auth'], command: 'kubectl -n auth rollout restart deployment/auth' }],
      approval: { target: ['wake-prod', 'auth', 'ConfigMap auth-config'], change: 'Draft PR · acme/auth-deploy · 변경 값 1개 (SESSION_TTL)', impact: '세션 만료 1시간 · Pod 5개 차례로 교체' },
      verify: [{ id: 'v1', label: 'CrashLoopBackOff 없음', metric: 'oom' }, { id: 'v2', label: 'Redis 연결 수 maxclients 70% 이하', metric: 'slo', value: '41% · 임계값 70%' }, { id: 'v3', label: '로그인 실패 비율 1% 미만(사용자 경로)', metric: 'slo', value: '0.1% · 임계값 1%', userPath: true }],
      redactions: [{ label: '세션 토큰(로그)', n: 5 }, { label: '이메일', n: 3 }], pr: 143, script: [['skill', 3], ['judged', 15]], applyTimes: { sync: 90, rollout: 40 },
    },
    { id: 's7', short: '조용한 날·부하', title: '인시던트 없는 날의 점검과 부하', cluster: 'wake-prod', prod: true, quiet: true },
  ];
}

/* 시나리오 대상의 사실 중 세계 생성기가 지어내지 않는 것: 놓인 Node(node), 롤아웃이 만든 revision(rev), 대상의 이벤트(events: 유형, 이유, 메시지, 횟수, 마지막 시각 at) */
function buildDetail(list) {
  const s4 = list.find(s => s.id === 's4'), s4Pod = s4.scope[0].name;
  return {
    'payments-7c9f6-x2k4': { node: 'ip-10-0-3-17', events: [ev('Warning', 'BackOff', 'Back-off restarting failed container payments in pod payments-7c9f6-x2k4_payments', 14, -60), ev('Normal', 'Pulled', 'Container image "registry.local/payments:2.8.0" already present on machine', 7, -127)] },
    'payments-7c9f6-q8m1': { node: 'ip-10-0-3-52', events: [ev('Normal', 'Started', 'Started container payments', 1, S1_ROLL)] },
    'payments-7c9f6-t5n8': { node: 'ip-10-0-5-9', events: [ev('Normal', 'Started', 'Started container payments', 1, S1_ROLL + 60)] },
    'payments': { rev: 14, events: [ev('Normal', 'ScalingReplicaSet', 'Scaled up replica set payments-7c9f6 to 3', 1, S1_ROLL), ev('Normal', 'ScalingReplicaSet', 'Scaled down replica set payments-5d4b8 to 0', 1, S1_ROLL + 60)] },
    'orders-6f8c9-k2p7': { node: 'ip-10-0-4-21', events: [ev('Warning', 'Failed', 'Failed to pull image "registry.local/orders:1.42": manifest unknown', 4, -60), ev('Normal', 'BackOff', 'Back-off pulling image "registry.local/orders:1.42"', 22, -30)] },
    'orders-6f8c9-m4v1': { node: 'ip-10-0-6-14', events: [ev('Warning', 'Failed', 'Failed to pull image "registry.local/orders:1.42": manifest unknown', 3, -60)] },
    'orders': { rev: 9, events: [ev('Normal', 'ScalingReplicaSet', 'Scaled up replica set orders-6f8c9 to 2', 1, -360), ev('Normal', 'ScalingReplicaSet', 'Scaled down replica set orders-5b7d2 to 3', 1, -358)] },
    'checkout-api': { rev: 31, events: [] },
    'checkout-api-7cf98-p4x2m': { node: 'ip-10-0-7-3', events: [] },
    'checkout-api-7cf98-d9m2p': { node: 'ip-10-0-8-11', events: [] },
    [s4Pod]: { events: [ev('Warning', 'FailedScheduling', `${SCHED_MSG}. preemption: 0/${PROD_NODES} nodes are available: ${PROD_NODES} No preemption victims found for incoming pod.`, 12, -60)] },
    'ip-10-0-9-3': { events: [ev('Normal', 'NodeNotReady', 'Node ip-10-0-9-3 status is now: NodeNotReady', 1, -1380), ev('Normal', 'RemovingNode', 'Node ip-10-0-9-3 event: Removing Node ip-10-0-9-3 from Controller', 1, -1320)] },
    'orders-app': { events: [ev('Warning', 'OperationCompleted', `Sync operation to ${COMMITS.ordersNew} failed: PreSync hook smoke-test failed`, 1, -155), ev('Normal', 'OperationStarted', `Initiated automated sync to ${COMMITS.ordersNew}`, 1, -240)] },
    'smoke-test': { events: [ev('Warning', 'BackoffLimitExceeded', 'Job has reached the specified backoff limit', 1, -157)] },
    'auth-66b4c-zz19': { node: 'ip-10-0-2-40', events: [ev('Warning', 'BackOff', 'Back-off restarting failed container auth in pod auth-66b4c-zz19_auth', 9, -30)] },
    'auth': { rev: 22, events: [] },
  };
}

/* the one key time series of a scenario that had none: what the cause leans on, read before the judgement */
const SERIES_EVIDENCE = {
  s2: { kind: 'Prometheus', got: 10, from: -1800, to: 0, metric: 'replicas_available', target: { ns: 'orders', kind: 'Deployment', name: 'orders' }, query: 'kube_deployment_status_replicas_available{namespace="orders",deployment="orders"}', count: '샘플 120개', cut: false, hash: '3e8a…5c' },
  s4: { kind: 'Prometheus', got: 11, from: -H, to: 0, metric: 'nodes_ready', target: { kind: 'NodeGroup', name: 'general' }, query: 'sum(kube_node_status_condition{condition="Ready",status="true"} * on(node) group_left() kube_node_labels{label_eks_amazonaws_com_nodegroup="general"})', count: '샘플 240개', cut: false, hash: '9b17…e4' },
  s5: { kind: 'Prometheus', got: 7, from: -H, to: 0, metric: 'latency_p99', target: { ns: 'inventory', kind: 'Service', name: 'inventory-api' }, query: 'histogram_quantile(0.99, sum by (le) (rate(http_server_requests_seconds_bucket{namespace="inventory",service="inventory-api"}[5m])))', count: '샘플 240개', cut: false, hash: 'c0d4…18' },
};
/* lines that rule a cause in or out from objects the kinds above do not show as views: an admission webhook, a namespace quota, a network policy */
/* each choice's follow-ups (in order: the cause it leaves, the detection gap, the process). A choice may add its own before the scenario's shared ones */
const FOLLOW = {
  s1: { shared: [
    () => fu(`KubeContainerOOMKilled 알림을 첫 OOMKilled에서 보내도록 for 조건 제거(첫 종료에서 알림까지 ${gapWords(-S1_FIRST)} 걸림)`, '플랫폼 팀', 3, 'detection'),
    () => fu('배포 리뷰 항목에 -Xmx와 limits.memory 비율(힙 밖 메모리 여유 25% 이상) 확인 추가', 'payments 팀', 14, 'process')],
    rollback: [() => fu('jmx-exporter로 힙 밖 메모리 지표를 연결한 뒤 -Xmx와 limits.memory를 함께 정한 PR', 'payments 팀', 7, 'cause')],
    tune: [() => fu('jmx-exporter로 힙 밖 메모리 지표를 연결해 768Mi가 맞는지 확인', 'payments 팀', 7, 'cause')] },
  s2: { shared: [
    () => fu('ImagePullBackOff 알림을 5분 30초에서 1분으로(OrdersPodsNotReady for 5m 대신 kube_pod_container_status_waiting_reason)', '플랫폼 팀', 3, 'detection'),
    () => fu('CI에서 배포 전 이미지 태그가 레지스트리에 있는지 검사하는 단계 추가', 'orders 팀', 7, 'process')],
    tag: [() => fu('image-policy webhook이 레지스트리 경로뿐 아니라 태그가 있는지도 검사하도록 정책 추가', '플랫폼 팀', 14, 'cause')] },
  s3: { shared: [
    () => fu('5xx 알림을 burn rate 다중 구간(5분·1시간)으로 바꿔 9분 걸린 감지를 2분 안으로', 'checkout 팀', 7, 'detection'),
    () => fu('DB 팀 에스컬레이션 경로와 티켓 양식(DBA)을 checkout runbook에 추가', 'SRE 팀', 7, 'process')],
    handoff: [() => fu('orders namespace에 postgres-exporter를 배포하고 DB 연결 수 알림 규칙 추가', 'DB 팀', 7, 'cause'), () => fu('checkout 사용자의 idle in transaction 세션이 쌓인 원인 조사(HikariCP leakDetectionThreshold 설정)', 'checkout 팀', 14, 'cause')] },
  s4: { shared: [
    () => fu('Pending 배치 알림을 10분에서 5분으로(12분 15초 걸린 감지 단축)', 'reports 팀', 3, 'detection'),
    () => fu('Node 업그레이드 runbook에 NodeGroup surge 설정(maxUnavailable 0) 추가', '플랫폼 팀', 7, 'process')],
    node: [() => fu('reports-batch requests.cpu를 실제 사용량 기준으로 다시 정하기', 'reports 팀', 14, 'cause')],
    req: [() => fu('requests.cpu 500m에서 배치 실행 시간이 마감 안에 끝나는지 확인', 'reports 팀', 3, 'cause')] },
  s5: { shared: [
    () => fu('Wake 에이전트에 inventory namespace 읽기 권한을 주어 의존 서비스 상태를 근거로 쓰기', '플랫폼 팀', 7, 'process'),
    () => fu('PreSync hook을 지워 배포하는 되돌리기는 hook을 되살리는 PR을 함께 만들도록 배포 규칙 추가', 'orders 팀', 14, 'process')],
    pr: [() => fu('inventory-api 응답 확인 뒤 smoke-test hook을 다시 넣고 1.5.0 재배포', 'orders 팀', 2, 'cause')] },
  s6: { shared: [
    () => fu('redis_connected_clients가 maxclients 80%를 넘으면 알림(8일 동안 늘어 한도에 닿을 때까지 알림 없음)', 'auth 팀', 3, 'detection'),
    () => fu('같은 증상 3번째부터는 재시작으로 닫지 않도록 runbook에 원인 조치 단계 추가', 'SRE 팀', 7, 'process')],
    root: [() => fu('7일 관찰: 매일 Redis 연결 최대를 maxclients 70%와 비교하고 7일째 인시던트 종료 여부 결정', 'auth 팀', 7, 'cause')],
    restart: [() => fu('SESSION_TTL 조정 PR 올리기 · 재발하면 이 인시던트에 연결', 'auth 팀', 2, 'cause')] },
};

const EXTRA_EVIDENCE = {
  s2: { kind: 'Kubernetes API', got: 9, at: 9, query: 'GET validatingwebhookconfigurations image-policy', count: 'webhook 1개 · 통과', cut: false, hash: 'a7d1…4e', raw: 'webhooks:\n- name: images.policy.acme.io\n  failurePolicy: Ignore\n  timeoutSeconds: 5\n  clientConfig.service: kyverno/kyverno-svc:443\n# 검사는 레지스트리 경로(registry.local/*)만: 태그가 있는지는 보지 않음 · 거부 기록 없음(FailedCreate 0건)' },
  s3: { kind: 'Kubernetes API', got: 13, at: 13, query: 'GET networkpolicies -n checkout', count: '정책 2개 · orders-db:5432 허용', cut: false, hash: 'c41e…07', raw: 'checkout-default-deny: ingress []\ncheckout-egress: egress → namespace orders, app=orders-db, port 5432/TCP 허용\n# orders-db:5432는 허용됨: 연결 실패는 정책 거부가 아님' },
  s4: { kind: 'Kubernetes API', got: 9, at: 9, query: 'GET resourcequotas -n reports', count: 'requests.cpu 사용 7,600m · hard 8,000m', cut: false, hash: '5b90…d3', raw: 'reports-quota\n  requests.cpu: used 7600m, hard 8000m\n  requests.memory: used 28Gi, hard 32Gi\n  pods: used 31, hard 60\n# Pod는 만들어졌고(FailedCreate 0건) Pending: 쿼터가 아니라 Node 자리 부족' },
};

/* 지난 인시던트(과거 인시던트, 사이드바의 해결된 행): outcome은 결과의 코드 값, 글자는 OUTCOME. days와 time은 s6 감지일(2026-11-12) 기준 날짜와 그날 시각 */
export const OUTCOME = { recovered: '복구 확인', manual: '복구 확인 실패 → 수동 조치', unknown: '원인 확인 안 됨 · 자연 복구' };
export const PAST = [
  { title: 'auth CrashLoopBackOff', days: 8, time: '16:41', alert: 'AuthCrashLooping', outcome: 'recovered', by: '롤백 PR #131', took: '18분' },
  { title: 'checkout-web 지연 증가', days: 13, time: '20:12', alert: 'CheckoutLatencyHigh', outcome: 'recovered', by: 'HPA 최대 6으로 조정', took: '26분' },
  { title: 'auth CrashLoopBackOff', days: 21, time: '09:27', alert: 'AuthCrashLooping', outcome: 'recovered', by: '재시작', took: '9분' },
  { title: 'orders ImagePullBackOff', days: 24, time: '15:08', alert: 'OrdersPodsNotReady', outcome: 'recovered', by: '태그 PR #51', took: '7분' },
  { title: 'orders-db 디스크 사용률 90%', days: 28, time: '03:55', alert: 'PersistentVolumeFillingUp', outcome: 'recovered', by: 'PVC 200Gi로 확장', took: '44분' },
  { title: 'reports Pending', days: 32, time: '21:33', alert: 'ReportsPending', outcome: 'manual', by: 'Node 추가', took: '41분' },
  { title: 'search-api 인증서 만료', days: 36, time: '00:04', alert: 'CertificateExpired', outcome: 'recovered', by: 'cert-manager 재발급', took: '12분' },
  { title: 'payments OOMKilled', days: 41, time: '11:19', alert: 'PaymentsRestarting', outcome: 'recovered', by: 'limits.memory 512Mi로 조정 PR #118', took: '15분' },
  { title: 'coredns 응답 지연', days: 45, time: '13:46', alert: 'CoreDNSLatencyHigh', outcome: 'recovered', by: 'replicas 2 → 3', took: '22분' },
  { title: 'event-stream-normalizer-consumer-group-primary 소비 지연 누적', days: 49, time: '05:18', alert: 'KafkaConsumerLagHigh', outcome: 'unknown', by: '없음', took: '1시간 8분' },
];
/** a fixed past incident's moment, relative to the scenario in play's t0 */
export const pastAt = p => { const [h, m] = p.time.split(':').map(Number); const day0 = detectRel('s6') - (14 * H + 2 * 60); return day0 - p.days * D + h * H + m * 60; };

/* ---------- 시계와 시나리오: 고른 시나리오의 감지 시각으로 시계를 맞추고, 시각이 들어간 글을 그 시계로 다시 쓴다 ---------- */
export const SCENARIOS = [];
export const DETAIL = {};
const hooks = [];
/** run after every rebuild (the world fills what it derives: snapshot counts, caches cleared) */
export const onRebuild = fn => { hooks.push(fn); fn(); };
let clockOf = null;
/** the scenario whose clock is set */
export const clockSid = () => clockOf;
function rebuild() {
  const list = build();
  for (const s of list) for (const e of [EXTRA_EVIDENCE[s.id], SERIES_EVIDENCE[s.id]].filter(Boolean)) if (s.evidence) s.evidence.push({ id: Math.max(...s.evidence.map(x => x.id)) + 1, ...e });
  /* the range each evidence shows is made from its numbers (a read moment `at`, or a window `from`–`to`); a window that is not a moment keeps its words */
  for (const s of list) for (const e of s.evidence ?? []) e.range ??= rangeText(e);
  for (const s of list) for (const o of s.options ?? []) {
    const f = FOLLOW[s.id]; if (!f || o.disabled) continue;
    o.followUps = [...(f[o.id] ?? []), ...f.shared].map(make => make());
  }
  SCENARIOS.splice(0, SCENARIOS.length, ...list);
  for (const k of Object.keys(DETAIL)) delete DETAIL[k];
  Object.assign(DETAIL, buildDetail(list));
  hooks.forEach(fn => fn());
}
/** set the clock to a scenario's detection and rewrite the scenarios for it; true when the clock moved */
export function useClock(sid) {
  const key = DETECT[sid] ? sid : 's1';
  if (clockOf === key) return false;
  clockOf = key; setDetection(epochOf(key)); rebuild();
  return true;
}
useClock('s1');
