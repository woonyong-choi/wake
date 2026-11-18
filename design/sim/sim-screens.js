/*
 * 시뮬레이션 화면 정의: 화면마다 읽는 상태(키와 기본값), AI가 대신 바꿀 수 있는 상태, 기간 막대, 상태를 바꾸는 동작, 그리고 데이터 약속.
 * sim.js는 상태 기본값·AI 조작 키·동작을 여기서 만들고, sim-views.js는 기간 기본값과 보관 기간을 여기서 읽는다.
 * 클러스터 화면 여덟(홈 · 리소스 · 네트워크 · GitOps · 이벤트 · 로그 · 알림 · 인시던트)은 머리 아래 범위 입력 하나(SCOPE)를 함께 쓴다: 글은 화면마다 따로(scQ.<화면>, 실행할 때 적용,
 * 화면마다 맞추는 칸이 다르고 화면을 옮기면 그 화면의 글로 바뀜), 리소스 종류(scKind, 여럿이면 합집합) · namespace(nsMulti)는 하나의 범위로 고르는 즉시 적용되고 화면을 옮겨도 남는다. 나머지 화면의 찾기 칸은 search.key의 상태를 바꾸고
 * (scope 'list'는 그 화면 목록, 'cluster'는 클러스터 전체 이름 찾기), search.reset은 함께 처음으로 돌릴 쪽 번호다. AI와 보고서도 이 키로 찾기를 바꾼다.
 *
 * 데이터 약속(contract)은 백엔드 이식의 기준이다. 항목마다
 *   field     화면에 보이는 값(또는 열)
 *   source    값을 주는 곳(Kubernetes API watch, Prometheus 질의, Loki, Alertmanager webhook, Argo CD API, GitHub App, Wake 저장소)
 *   collected 언제 읽은 값인지(watch 캐시 즉시 반영, 15초 scrape, 질의 시점, 수신 시점 등)
 *   window    어떤 구간을 모은 값인지(지금 값, 화면 기간, 5분 rate, 보관 기간 등)
 * 를 적는다. 시뮬레이션은 sim-world.js가 같은 모양으로 지어내고, 실제 앱은 같은 필드를 같은 출처에서 받아야 한다.
 */
import { D } from './sim-format.js';
import { t as L } from './sim-locale.js';

/** how long each source keeps its data: a view's range picker cannot go further back. A view's default range: live signals (metrics, events, logs, network) the last hour, records (alerts, incidents, GitOps, AI work) the last 7 days */
export const RETENTION = { metrics: 30 * D, logs: 14 * D, events: 7 * D, alerts: 90 * D, gitops: 90 * D };
/** the one preset set on every page (kit time-range ids), seconds ↔ id */
export const PRESETS = [[900, '15m'], [3600, '1h'], [21600, '6h'], [86400, '24h'], [604800, '7d']];

/* how a state-setting action reads its value: a typed text, a picked id, a page number */
const text = a => a.value ?? '', pick = a => String(a.arg?.value ?? a.arg), page = a => Number(a.arg?.value ?? a.arg);
/** the scope every cluster view shares: a change of it puts every list back on its first page */
export const SCOPE_PAGES = { pg: 1, netPage: 1, gpg: 1, evPage: 1, alPage: 1, incPage: 1, logPage: null };
/** a picked kind or namespace also lets go of the Pod the logs were reading (the scope names the Pods again) */
export const SCOPE_RESET = { ...SCOPE_PAGES, logPod: null };
/** each cluster view keeps its own text (switching views does not carry it over); the kind and the namespaces are one scope for all eight */
export const scopeKey = view => 'scQ.' + view;
const SCOPE = view => ({ key: scopeKey(view), scope: 'scope', reset: SCOPE_PAGES });

/** state every view shares: which view, the namespace in scope, open summary bars, the connection the simulation plays, the cluster */
export const SHELL = {
  state: { view: 'home', ns: 'all', bars: {}, conn: 'ok', cid: 'wake-prod', seen: false, detailRange: '3600', gs: '', scKind: null },
  ai: ['view', 'ns', 'nsMulti', 'gs', 'scKind'],
  range: { key: 'detailRange', retention: 'metrics' }, /* the detail pane's charts */
  set: { 'sim.paneTab': ['paneTab', pick], 'sim.scKind': ['scKind', a => (pick(a) === 'all' ? null : [pick(a)]), SCOPE_RESET] },
};

export const SCREENS = {
  home: {
    title: L('sim.view.home'), icon: 'k8s-cluster', search: SCOPE('home'),
    state: { homeRange: '3600' }, ai: [], range: { key: 'homeRange', retention: 'metrics', ai: true },
    contract: [
      { field: '클러스터 정보(이름, 환경, 버전, namespace·워크로드·Pod 수)', source: 'Kubernetes API watch(Node, Namespace, 워크로드, Pod)', collected: 'watch 캐시 즉시 반영', window: '지금 값' },
      { field: '도구 연결 칩(wake-agent, Prometheus, Loki, Grafana, Argo CD, GitHub)', source: 'Wake 연결 확인(에이전트 heartbeat, 도구 상태 확인)', collected: '마지막 확인 시점', window: '지금 값' },
      { field: 'Ready Node / 전체, 문제 Pod / 전체', source: 'Kubernetes API watch(Node.status.conditions, Pod.status)', collected: 'watch 캐시 즉시 반영', window: '지금 값' },
      { field: '경고 이벤트 수', source: 'Kubernetes API watch(Event type=Warning)', collected: '수신 시점', window: '최근 1시간' },
      { field: '열린 인시던트, 지난 30일 인시던트 수', source: 'Wake 저장소(인시던트)', collected: '생성·종료 시점', window: '열린 것 / 지난 30일' },
      { field: 'CPU·메모리 사용률, Allocatable 대비 requests, 임계값 넘은 Node 수, 최고 Node', source: 'Prometheus(node_cpu_seconds_total, node_memory_*) + Kubernetes API(requests, Allocatable)', collected: '15초 scrape', window: '화면 기간(homeRange), 지금 값은 마지막 scrape' },
      { field: '5xx 비율(Ingress), burn rate, 최다 namespace', source: 'Prometheus(nginx_ingress_controller_requests)', collected: '15초 scrape', window: '5분 rate, burn rate는 같은 비율 ÷ (100 − SLO 99.9)' },
      { field: '초당 요청(Ingress), 24시간 최고', source: 'Prometheus(nginx_ingress_controller_requests)', collected: '15초 scrape', window: '5분 rate, 최고는 24시간' },
      { field: '변경 타임라인(배포·설정·인프라·증상)', source: 'Argo CD 동기화 이력, Kubernetes 이벤트, Wake 인시던트', collected: '발생 시점', window: '화면 기간' },
      { field: 'Pod 상태 흐름(namespace → 워크로드 → 상태)', source: 'Kubernetes API watch(Pod, ownerReferences)', collected: 'watch 캐시 즉시 반영', window: '지금 값' },
    ],
  },
  metric: {
    title: L('sim.s.metric'), icon: 'k8s-cluster', search: { key: 'gs', scope: 'cluster' },
    state: {}, ai: [], range: { key: 'homeRange', retention: 'metrics' },
    contract: [
      { field: '지표 그래프(클러스터 전체, Node별·namespace별 상위 5개)', source: 'Prometheus 질의(차트 정보의 PromQL)', collected: '15초 scrape, step은 구간에 맞춰 15초 배수', window: '화면 기간(homeRange)' },
      { field: '이 구간의 변경', source: 'Argo CD 동기화 이력, Kubernetes 이벤트, Wake 인시던트', collected: '발생 시점', window: '화면 기간' },
    ],
  },
  resources: {
    title: L('sim.view.resources'), icon: 'k8s-deployment', search: SCOPE('resources'),
    state: { st: 'all', only: 'all', pg: 1 }, ai: [],
    set: { 'sim.only': ['only', pick, { pg: 1 }], 'sim.page': ['pg', page], 'sim.pickSt': ['st', pick, { pg: 1 }] },
    contract: [
      { field: '종류별 개수와 문제 수(Node, Deployment, StatefulSet, DaemonSet, CronJob, Pod, Service, PVC, Job, Secret, Certificate)', source: 'Kubernetes API watch(종류마다)', collected: 'watch 캐시 즉시 반영', window: '지금 값' },
      { field: 'Pod 표(이름, Namespace, Ready, 상태, 재시작, CPU, 메모리, Node, Age)', source: 'Kubernetes API watch(Pod) + Prometheus(container_cpu_usage_seconds_total, container_memory_working_set_bytes)', collected: 'watch 즉시, 사용량은 15초 scrape', window: '지금 값, 사용량은 5분 rate' },
      { field: '워크로드 표(Ready/Desired, 이미지, 최근 변경)', source: 'Kubernetes API watch(Deployment·StatefulSet·DaemonSet·CronJob)', collected: 'watch 캐시 즉시 반영', window: '지금 값' },
      { field: 'Node 표(상태, NodeGroup, CPU·메모리 사용률, Pod 수, Pressure, Taint)', source: 'Kubernetes API watch(Node) + Prometheus(node_*)', collected: 'watch 즉시, 사용량은 15초 scrape', window: '지금 값' },
      { field: '권한 없는 종류', source: 'wake-agent RBAC(SelfSubjectAccessReview)', collected: '연결 확인 시점', window: '지금 값' },
    ],
  },
  search: {
    title: L('sim.crumb.search'), icon: 'search', search: { key: 'gs', scope: 'cluster' },
    state: {}, ai: [],
    contract: [
      { field: '이름이 맞는 리소스(종류, Namespace, 상태)', source: 'Kubernetes API watch 캐시 전체 + Argo CD Application + Helm 릴리스', collected: 'watch 캐시 즉시 반영', window: '지금 값' },
    ],
  },
  network: {
    title: L('sim.view.network'), icon: 'k8s-service', search: SCOPE('network'),
    state: { netRange: '3600', netBy: 'svc', netPage: 1 }, ai: [], range: { key: 'netRange', retention: 'metrics', ai: true },
    set: { 'sim.netBy': ['netBy', pick, { netPage: 1 }], 'sim.netPage': ['netPage', page] },
    contract: [
      { field: '수신·송신 지금, 활성 연결, 5xx 비율 최대, 구간 최대 수신', source: 'Prometheus(container_network_*_bytes_total, container_sockets, nginx_ingress_controller_requests)', collected: '15초 scrape', window: '5분 rate, 최대는 화면 기간' },
      { field: '서비스 흐름(Ingress → 서비스 → DB·Redis)', source: 'Ingress → 서비스는 nginx_ingress_controller_requests(관측), 서비스 → 서비스·DB는 호출하는 앱 지표(추정)', collected: '15초 scrape', window: '5분 rate' },
      { field: '서비스·namespace별 표(수신, 송신, 연결, 5xx)', source: 'Prometheus(위와 같음)', collected: '15초 scrape', window: '화면 기간(netRange)' },
    ],
  },
  gitops: {
    title: L('sim.view.gitops'), icon: 'branch', search: SCOPE('gitops'),
    state: { gitRange: '604800', gf: 'all', gpg: 1 }, ai: [], range: { key: 'gitRange', retention: 'gitops' },
    set: { 'sim.gf': ['gf', pick, { gpg: 1 }], 'sim.gpg': ['gpg', page] },
    contract: [
      { field: 'Argo CD 버전·권한 상태', source: 'Argo CD API(/api/version, 계정 권한)', collected: '연결 확인 시점', window: '지금 값' },
      { field: 'Application 표(Sync, Health, Revision, 마지막 동기화, 구간 동기화 수)', source: 'Argo CD API(applications, status.history)', collected: 'Argo CD 상태 수신 시점', window: '지금 값, 동기화 수는 화면 기간(gitRange)' },
      { field: 'Helm 릴리스(chart, revision, 상태)', source: 'Kubernetes API(Helm release Secret)', collected: 'watch 캐시 즉시 반영', window: '지금 값' },
    ],
  },
  events: {
    title: L('sim.view.events'), icon: 'k8s-event', search: SCOPE('events'),
    state: { evType: 'all', evRange: '3600', evPage: 1, evGroup: 'list', evReason: '' },
    ai: ['evType', 'evReason', 'evGroup', 'evPage', 'evRange'], range: { key: 'evRange', retention: 'events', ai: true },
    set: { 'sim.evType': ['evType', pick, { evPage: 1 }], 'sim.evPage': ['evPage', page], 'sim.evGroup': ['evGroup', pick], 'sim.evReason': ['evReason', a => String(a.arg?.value ?? a.arg ?? ''), { evPage: 1 }] },
    contract: [
      { field: 'Warning·Normal 수', source: 'Kubernetes API watch(Event)', collected: '수신 시점', window: '화면 기간(evRange), 보관 7일' },
      { field: '이벤트 표(Last seen, 유형, Reason, Object, 횟수, 메시지)', source: 'Kubernetes API(Event: lastTimestamp, type, reason, involvedObject, count, message)', collected: '수신 시점', window: '화면 기간, 같은 Reason·대상은 한 줄(횟수는 Event.count)' },
      { field: 'Reason별 묶음, 타임라인', source: 'Kubernetes API(Event) + Argo CD 동기화 이력', collected: '수신 시점', window: '화면 기간' },
    ],
  },
  logs: {
    title: L('sim.view.logs'), icon: 'terminal', search: SCOPE('logs'),
    state: { logPod: null, logLevel: 'all', logRange: '3600', logContext: null, logPage: null, logPrev: null },
    ai: ['logPod', 'logPrev', 'logLevel', 'logContext', 'logAround', 'logPage', 'logRange'], range: { key: 'logRange', retention: 'logs', ai: true },
    set: { 'sim.pickPod': ['logPod', pick, { logPage: null }], 'sim.logLevel': ['logLevel', pick, { logPage: null }], 'sim.pickAround': ['logAround', page, { logPage: null }], 'sim.logPage': ['logPage', page], 'sim.logAgg': ['logAgg', pick], 'sim.logC': ['logC', pick, { logPage: null }] },
    contract: [
      { field: '수준별 줄 수(ERROR, WARN, INFO)', source: 'Loki(count_over_time by level)', collected: '질의 시점', window: '화면 기간(logRange), 보관 14일' },
      { field: '로그 줄(번호, 시각, 수준, 본문), 검색 일치와 앞뒤 줄', source: 'Loki({namespace, pod, container} |= 검색어)', collected: '질의 시점', window: '화면 기간, 한 쪽 20줄' },
      { field: '컨테이너(현재, 이전, init·sidecar)와 이전 컨테이너 종료(시각, Exit code)', source: 'Kubernetes API(Pod.status.containerStatuses.lastState) + Loki', collected: 'watch 즉시, 로그는 질의 시점', window: '이전 컨테이너의 수명' },
    ],
  },
  alerts: {
    title: L('sim.view.alerts'), icon: 'bell', search: SCOPE('alerts'),
    state: { alState: 'all', alPage: 1, alRange: '604800' }, ai: [], range: { key: 'alRange', retention: 'alerts', ai: true },
    set: { 'sim.alState': ['alState', pick, { alPage: 1 }], 'sim.alPage': ['alPage', page] },
    contract: [
      { field: 'firing·pending·resolved 수', source: 'Alertmanager → Wake webhook', collected: '수신 시점', window: '화면 기간(alRange), 보관 90일' },
      { field: '알림 표(상태, 알림, 심각도, 대상, 시작, 인시던트)', source: 'Alertmanager webhook(status, labels.alertname, labels.severity, labels.namespace·pod, startsAt) + Wake 인시던트 연결', collected: '수신 시점', window: '화면 기간' },
    ],
  },
  incidents: {
    title: L('sim.view.incidents'), icon: 'incident', search: SCOPE('incidents'),
    state: { incPage: 1, incF: 'all', incRange: '604800' }, ai: [], range: { key: 'incRange', retention: 'alerts' },
    set: { 'sim.incF': ['incF', pick, { incPage: 1 }], 'sim.incPage': ['incPage', page] },
    contract: [
      { field: '열린 인시던트(번호, 제목, 알림, 심각도, 생성 시각, 지금 단계)', source: 'Wake 저장소(인시던트) + Alertmanager webhook', collected: '알림 수신 시 생성, 단계는 바뀔 때', window: '열린 것' },
      { field: '과거 인시던트 표(날짜, 인시던트, 조치, 결과, 걸린 시간)', source: 'Wake 저장소(인시던트 기록)', collected: '복구 확인 후 종료 시점', window: '화면 기간(incRange)' },
    ],
  },
  incident: {
    title: L('sim.view.incidents'), icon: 'incident', search: { key: 'gs', scope: 'cluster' },
    state: {}, ai: [],
    contract: [
      { field: '범위(대상 리소스 상태, 재시작, 최근 변경), 영향(5xx 비율 감지 시점·지금·기준선·임계값)', source: 'Kubernetes API watch + Prometheus', collected: 'watch 즉시, 지표는 15초 scrape', window: '지금 값, 감지 시점 값은 알림 시각' },
      { field: '사용자 영향(API 실패·지연 요청, 배치 지연 실행·처리 대기·마감, 로그인 실패, 남은 Ready Pod; 모르면 확인 담당과 다음 확인 시각)', source: 'Prometheus(서비스·namespace 필터가 있는 같은 질의) + Kubernetes API', collected: '15초 scrape', window: '증상 시작부터 지금(실패 요청은 같은 질의·같은 구간의 비율 × 요청 수)' },
      { field: '근거 조각(대상, 컨테이너 id, 절대 구간, 질의, 결과 줄과 일치 줄 번호)', source: '스킬이 읽은 출처(Kubernetes API, Loki, Prometheus, Argo CD)', collected: '근거마다 수집 시각(got) · 판정 전', window: '근거마다 질의 구간 · 한 번 고정해 근거 칸·로그 화면·보고서가 같은 조각을 읽음' },
      { field: '값마다 출처 연결 상태와 마지막 수집 시각', source: 'Wake 연결 확인(에이전트 heartbeat, 도구 상태 확인)', collected: '마지막 성공 시점', window: '끊긴 출처의 값은 "지금 값"으로 보이지 않음' },
      { field: '타임라인(변경과 증상)', source: 'Argo CD 동기화 이력, Kubernetes 이벤트, 롤아웃 기록', collected: '발생 시점', window: '첫 변경 직전부터 지금까지' },
      { field: '원인(추론 사슬, 등급, 근거 번호)', source: 'Wake 판정 규칙 + 스킬이 읽은 근거(질의, 범위, 건수, 해시)', collected: '스킬 실행 시점', window: '근거마다 질의 범위' },
      { field: '조치(후보, 승인, Draft PR, 병합, 동기화, 롤아웃)', source: 'Wake 저장소(승인 기록) + GitHub App + Argo CD API + Kubernetes API', collected: '각 단계가 일어난 시점', window: '시도마다' },
      { field: '확인(조건, 정상 지속, 수집 구간)', source: 'Prometheus·Loki·Kubernetes API(조건마다 출처)', collected: '30초 수집 구간', window: '정상 5분, 마감 10분(출처가 끊긴 구간만큼 늘어남)' },
      { field: '기록(누가, 무엇을, 어떤 권한으로)', source: 'Wake 감사 기록', collected: '일어난 시점', window: '감지부터 지금까지' },
    ],
  },
  ailog: {
    title: L('sim.view.ailog'), icon: 'ai', search: { key: 'aqQ', scope: 'list', reset: { aqPage: 1 } },
    state: { aiRange: '604800', aqQ: '', aqPage: 1 }, ai: [], range: { key: 'aiRange', retention: 'alerts' },
    set: { 'sim.aqPage': ['aqPage', page], 'sim.aqReq': ['aqReq', pick, { aqPage: 1 }], 'sim.aqModel': ['aqModel', pick, { aqPage: 1 }] },
    contract: [
      { field: '기록 표(시각, 인시던트, 요청, 한 일, 실행 주체(모델), 양)', source: 'Wake 감사 기록(AI 읽기, 모델 전달, 사람 요청·승인)', collected: '일어난 시점', window: '화면 기간(aiRange)' },
      { field: 'AI 읽기·모델 전달·마스킹·사람 요청 수', source: 'Wake 감사 기록', collected: '일어난 시점', window: '화면 기간' },
    ],
  },
  tools: {
    title: L('sim.crumb.tools'), icon: 'plug', search: { key: 'gs', scope: 'cluster' },
    state: {}, ai: [],
    contract: [
      { field: '도구 목록(이름, 역할, 주소, 버전, 연결 상태)', source: 'Wake 연결 확인(도구마다 상태 확인 요청)', collected: '마지막 확인 시점', window: '지금 값' },
      { field: '도구 상세(응답 지연, 오류)', source: 'Wake 연결 확인 기록', collected: '확인마다', window: '최근 6시간' },
    ],
  },
  agent: {
    title: L('sim.crumb.agent'), icon: 'wake-agent', search: { key: 'gs', scope: 'cluster' },
    state: {}, ai: [],
    contract: [
      { field: '버전, heartbeat, watch 종류 수, 지연, 캐시 변화', source: 'wake-agent heartbeat', collected: '5초마다', window: '지금 값' },
      { field: 'heartbeat 지연·에이전트 메모리 그래프', source: 'wake-agent heartbeat + Prometheus(container_memory_working_set_bytes)', collected: '5초 / 15초 scrape', window: '최근 6시간' },
      { field: 'RBAC(verbs, watch 대상 종류)', source: 'Kubernetes API(ClusterRole wake-agent)', collected: '연결 확인 시점', window: '지금 값' },
    ],
  },
};

/** every screen's state with its defaults (a fresh copy each time: objects are never shared between runs) */
export const navDefaults = () => structuredClone(Object.assign({}, SHELL.state, ...Object.values(SCREENS).map(x => x.state)));
/** the find field of a view: the state key it sets, what it resets, and whether it filters the view's list or finds across the cluster */
export const searchOf = view => SCREENS[view]?.search ?? SCREENS.home.search;
/** the state keys the AI may set on the main view (what it changes it says, and one press puts them back): every view's find field among them */
export const AI_KEYS = [...new Set([...SHELL.ai, ...Object.values(SCREENS).flatMap(x => [...x.ai, x.search.key])])];
/** the range key of every view that has one, and the default preset of each */
export const RANGE_KEYS = [...new Set([SHELL.range, ...Object.values(SCREENS).map(x => x.range)].filter(Boolean).map(r => r.key))];
export const DEFAULT_RANGE = Object.fromEntries(RANGE_KEYS.map(k => [k, navDefaults()[k]]));
/** the range key a view's "지난 N시간" request sets, for the views that take one */
export const aiRangeKey = view => (SCREENS[view]?.range?.ai ? SCREENS[view].range.key : null);
/** the state-setting actions of every screen: each sets one key from its value and resets the page it moves */
export const setters = (state, update) => ({ ...Object.fromEntries([SHELL, ...Object.values(SCREENS)].flatMap(x => Object.entries(x.set ?? {}))
  .map(([name, [key, read, reset = {}]]) => [name, a => { const S = state(); S[key] = read(a); Object.assign(S, reset); update(); }])),
  /* the one find field: it sets the key the view in sight declares */
  'sim.find': a => { const S = state(), f = searchOf(S.view); S[f.key] = text(a); Object.assign(S, f.reset ?? {}); update(); } });
