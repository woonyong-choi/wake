/*
 * Wake 용어집: 개념 하나 -> 한국어 이름 하나, 영어 이름 하나, 그 이름을 쓰는 사전 키. 같은 동작·상태는 어디서나 같은 이름.
 * 동작은 짧은 동사(연결, 다시 시도, 복사, 열기), 상태는 명사로 끝남(연결됨, 확인 중, 권한 없음). 보고하는 "~함" 끝맺음과
 * 번역투(아래 avoid)는 쓰지 않는다.
 * 항목: { ko, en, keep, avoid, keys, basis }
 *   keep: 원어 유지(한국어 화면에도 en과 같은 글자). Kubernetes 리소스·필드·상태·kubectl 동작, 도구 고유 상태는 원어.
 *   avoid: 이 개념에 쓰지 않을 말(직역·음차·번역투). 문자열은 포함 여부, 정규식은 일치 여부로 본다.
 *   keys: 이 이름을 그대로 쓰는 사전 키. basis: 관례의 출처.
 * kit/tools/check-locale.mjs가 키마다 이 이름과 같은지, 사전과 SCREENS 파일의 화면 문자열에 avoid 낱말이 없는지 확인한다.
 */
const K8S = 'Kubernetes 공식 문서 · kubectl 출력', KUBECTL = 'kubectl 출력', DESCRIBE = 'kubectl describe 출력', SRE = 'SRE 관례', ARGO = 'Argo CD 화면', PROM = 'Prometheus·Alertmanager 화면', KO = '한국 현업 관례';

export const GLOSSARY = {
  /* 일반 UI 동작·상태 */
  connect: { ko: '연결', en: 'Connect', keys: ['wake.flow.connect', 'wake.fr.ai.connect'] },
  retry: { ko: '다시 시도', en: 'Try again', keys: ['wake.flow.a.retry'] },
  copy: { ko: '복사', en: 'Copy', keys: ['code.copy'] },
  copied: { ko: '복사됨', en: 'Copied', avoid: ['복사함'], keys: ['message.copied'] },
  saved: { ko: '저장됨', en: 'Saved', avoid: ['저장함'], keys: ['code.saved', 'wake.chat.exported'] },
  cancel: { ko: '취소', en: 'Cancel', keys: ['wake.flow.a.cancel'] },
  cancelled: { ko: '취소됨', en: 'Cancelled', keys: ['wake.flow.c.cancelled', 'wake.conn.st.cancelled', 'code.cancelled'] },
  install: { ko: '설치', en: 'Install', keys: ['wake.flow.a.install', 'wake.s.ag.install'] },
  signIn: { ko: '로그인', en: 'Sign in', keys: ['wake.flow.a.login'] },
  disconnect: { ko: '연결 해제', en: 'Disconnect', keys: ['wake.flow.a.disconnect'] },
  connected: { ko: '연결됨', en: 'Connected', keys: ['wake.connected', 'wake.fr.grp.ok'] },
  notConnected: { ko: '연결 안 됨', en: 'Not connected', avoid: ['미연결'], keys: ['wake.conn.st.idle', 'wake.notConnected'] },
  checking: { ko: '확인 중', en: 'Checking', keys: ['wake.conn.st.running'] },
  waiting: { ko: '응답 기다리는 중', en: 'Waiting for a response', keys: ['wake.conn.st.waiting', 'wake.flow.c.quiet'] },
  checkNeeded: { ko: '확인 필요', en: 'Check needed', keys: ['wake.fr.grp.check'] },
  permNeeded: { ko: '권한 필요', en: 'Permission needed', keys: ['wake.fr.grp.perm'] },
  noPermission: { ko: '권한 없음', en: 'No permission', keys: ['wake.flow.c.forbidden'] },
  wholeCluster: { ko: '클러스터 전체', en: 'Whole cluster', keys: ['wake.perm.inCluster'] },
  viewPermission: { ko: '필요한 권한 보기', en: 'View required permission', keys: ['wake.flow.a.perm'] },
  watchPermission: { ko: '권한이 생기면 자동으로 연결', en: 'Connects once access is granted', keys: ['wake.flow.watch'] },
  timedOut: { ko: '시간 초과', en: 'Timed out', keys: ['wake.flow.c.timeout'] },
  home: { ko: '홈', en: 'Home', keys: ['wake.view.home'] },
  summary: { ko: '요약', en: 'Summary', keys: ['wake.home.summary', 'wake.detail.summary'] },
  spec: { ko: '사양', en: 'Spec', keys: [] },
  /* 검색 칸(결정 2026-11-14, 시뮬레이션 design/sim/sim-screens.js의 search)과 사이드바·시작 화면·단축키: 동사는 검색 하나, 자리 표시는 "<대상> 검색"("예:" 없음) */
  search: { ko: '검색', en: 'Search', keys: ['wake.search', 'wake.s.sc.find'], basis: KO },
  readFailed: { ko: '클러스터 읽기 실패', en: 'Cluster read failed', avoid: ['조회하지 못함'], keys: ['wake.find.c.read'], basis: KO },
  simClusterSearch: { ko: '클러스터 전체 검색', en: 'Search the whole cluster', keys: ['wake.inc.searchCluster'], basis: KO },
  simNameSearch: { ko: '이름 검색', en: 'Search by name', keys: [], basis: KO },
  noResults: { ko: '결과 없음', en: 'No results', keys: ['menu.empty'] },
  more: { ko: '더 보기', en: 'More', keys: ['wake.more'] },
  viewLogs: { ko: '로그 보기', en: 'View logs', keys: [] },
  filter: { ko: '필터', en: 'Filter', avoid: ['거르기'], keys: [], basis: KO },
  source: { ko: '출처', en: 'Source', avoid: [/(^|[^리])소스/], keys: [], basis: KO },
  resource: { ko: '리소스', en: 'Resource', avoid: ['오브젝트'], keys: [], basis: K8S },
  masking: { ko: '마스킹', en: 'Masked', avoid: ['가릴 항목'], keys: [], basis: KO },
  now: { ko: '지금', en: 'Now', avoid: ['현재 단계'], keys: [], basis: KO },
  elapsed: { ko: '걸린 시간', en: 'Duration', avoid: ['소요 시간'], keys: ['wake.inc.list.took'], basis: KO },
  reasoningEffort: { ko: '추론 노력', en: 'Reasoning effort', avoid: ['추론 강도'], keys: [], basis: 'spec/design.md#B-037' },
  incidentScreen: { ko: '인시던트 화면', en: 'Incident view', avoid: ['작업면'], keys: [], basis: KO },

  /* Kubernetes 리소스: 원어 */
  pod: { ko: 'Pod', en: 'Pod', keep: true, avoid: ['파드'], keys: [], basis: K8S },
  node: { ko: 'Node', en: 'Node', keep: true, avoid: ['노드'], keys: [], basis: K8S },
  nodeGroup: { ko: 'NodeGroup', en: 'NodeGroup', keep: true, avoid: ['노드풀', '노드 풀', '노드 그룹'], keys: [], basis: 'EKS 리소스 이름' },
  namespace: { ko: 'namespace', en: 'Namespace', keep: true, avoid: ['네임스페이스'], keys: [], basis: K8S },
  deployment: { ko: 'Deployment', en: 'Deployment', keep: true, avoid: ['디플로이먼트'], keys: [], basis: K8S },
  replicaSet: { ko: 'ReplicaSet', en: 'ReplicaSet', keep: true, avoid: ['레플리카셋'], keys: [], basis: K8S },
  statefulSet: { ko: 'StatefulSet', en: 'StatefulSet', keep: true, avoid: ['스테이트풀셋'], keys: [], basis: K8S },
  daemonSet: { ko: 'DaemonSet', en: 'DaemonSet', keep: true, avoid: ['데몬셋'], keys: [], basis: K8S },
  cronJob: { ko: 'CronJob', en: 'CronJob', keep: true, avoid: ['크론잡'], keys: [], basis: K8S },
  configMap: { ko: 'ConfigMap', en: 'ConfigMap', keep: true, avoid: ['컨피그맵'], keys: [], basis: K8S },
  secret: { ko: 'Secret', en: 'Secret', keep: true, avoid: ['시크릿'], keys: [], basis: K8S },
  ingress: { ko: 'Ingress', en: 'Ingress', keep: true, avoid: ['인그레스'], keys: [], basis: K8S },
  container: { ko: '컨테이너', en: 'Container', keys: [], basis: K8S },
  workload: { ko: '워크로드', en: 'Workload', keys: [], basis: K8S },
  event: { ko: '이벤트', en: 'Events', keys: [], basis: K8S },
  log: { ko: '로그', en: 'Logs', keys: [], basis: K8S },

  /* Kubernetes 필드·표 머리글: 원어 */
  revision: { ko: 'revision', en: 'Revision', keep: true, avoid: ['리비전'], keys: [], basis: KUBECTL },
  replicas: { ko: 'replica', en: 'Replicas', keep: true, avoid: ['레플리카', '복제 수'], keys: [], basis: K8S },
  labels: { ko: 'Labels', en: 'Labels', keep: true, avoid: ['라벨', '레이블'], keys: [], basis: DESCRIBE },
  annotations: { ko: 'Annotations', en: 'Annotations', keep: true, avoid: ['어노테이션'], keys: [], basis: DESCRIBE },
  taints: { ko: 'Taints', en: 'Taints', keep: true, avoid: ['테인트'], keys: [], basis: DESCRIBE },
  tolerations: { ko: 'Tolerations', en: 'Tolerations', keep: true, avoid: ['톨러레이션'], keys: [], basis: DESCRIBE },
  conditions: { ko: 'Conditions', en: 'Conditions', keep: true, keys: [], basis: DESCRIBE },
  allocatable: { ko: 'Allocatable', en: 'Allocatable', keep: true, avoid: ['할당 가능', '요청/할당'], keys: [], basis: DESCRIBE },
  capacity: { ko: 'Capacity', en: 'Capacity', keep: true, avoid: [/(^|[^사])용량/], keys: [], basis: DESCRIBE },
  requests: { ko: 'requests', en: 'Requests', keep: true, avoid: ['CPU 요청', '메모리 요청', '요청 합'], keys: [], basis: DESCRIBE },
  limits: { ko: 'limits', en: 'Limits', keep: true, avoid: [/(메모리|CPU|컨테이너|자원) 한도|한도 [\d,.]+\w*/], keys: [], basis: DESCRIBE },
  qosClass: { ko: 'QoS Class', en: 'QoS Class', keep: true, keys: [], basis: DESCRIBE },
  probe: { ko: 'probe', en: 'Probe', keep: true, avoid: ['프로브'], keys: [], basis: K8S },
  controlledBy: { ko: 'Controlled By', en: 'Controlled By', keep: true, avoid: ['소유자'], keys: [], basis: DESCRIBE },
  age: { ko: 'Age', en: 'Age', keep: true, avoid: ['나이'], keys: [], basis: KUBECTL },
  restarts: { ko: 'Restarts', en: 'Restarts', keep: true, keys: [], basis: KUBECTL },
  exitCode: { ko: 'Exit Code', en: 'Exit Code', keep: true, avoid: ['종료 코드'], keys: [], basis: DESCRIBE },
  firstSeen: { ko: 'First seen', en: 'First seen', keep: true, keys: [], basis: KUBECTL },
  lastSeen: { ko: 'Last seen', en: 'Last seen', keep: true, avoid: ['마지막으로 본'], keys: [], basis: KUBECTL },
  reportingController: { ko: 'Reporting controller', en: 'Reporting controller', keep: true, avoid: ['보고한'], keys: [], basis: DESCRIBE },
  zone: { ko: 'Zone', en: 'Zone', keep: true, avoid: ['영역'], keys: [], basis: 'topology.kubernetes.io/zone' },
  pressure: { ko: 'Pressure', en: 'Pressure', keep: true, avoid: ['압박'], keys: [], basis: DESCRIBE },
  allowedDisruptions: { ko: 'Allowed disruptions', en: 'Allowed disruptions', keep: true, avoid: ['허용 중단'], keys: [], basis: KUBECTL },
  endpointReady: { ko: 'Ready', en: 'Ready', keep: true, avoid: ['미준비'], keys: [], basis: 'EndpointSlice conditions' },
  verbs: { ko: 'verbs', en: 'Verbs', keep: true, avoid: ['동사'], keys: [], basis: 'Kubernetes RBAC' },
  watch: { ko: 'watch', en: 'Watch', keep: true, avoid: ['감시하는 종류'], keys: [], basis: K8S },
  workingSet: { ko: 'working set', en: 'Working set', keep: true, avoid: ['working_set 지표'], keys: [], basis: 'cAdvisor 지표' },
  nonHeap: { ko: '힙 밖 메모리', en: 'Non-heap memory', avoid: ['비힙'], keys: [], basis: KO },

  /* kubectl 동작: 원어(재시작·롤아웃·동기화는 한국 현업 말) */
  evict: { ko: 'Evict', en: 'Evict', keep: true, avoid: ['축출'], keys: [], basis: 'kubectl drain · Event reason Evicted' },
  drain: { ko: 'Drain', en: 'Drain', keep: true, avoid: ['드레인'], keys: [], basis: KUBECTL },
  cordon: { ko: 'Cordon', en: 'Cordon', keep: true, avoid: ['코든'], keys: [], basis: KUBECTL },
  scale: { ko: 'Scale', en: 'Scale', keep: true, avoid: ['스케일'], keys: [], basis: KUBECTL },
  portForward: { ko: 'Port forward', en: 'Port forward', keep: true, avoid: ['포트 포워드', '포트 포워딩'], keys: [], basis: KUBECTL },
  shell: { ko: 'Shell', en: 'Shell', keep: true, keys: [], basis: KUBECTL },
  restart: { ko: '재시작', en: 'Restart', keys: [], basis: KO },
  rollout: { ko: '롤아웃', en: 'Rollout', avoid: [/반영 완료|반영 확인|반영 · |^반영$/], keys: [], basis: KO },
  rollback: { ko: '롤백', en: 'Rollback', avoid: ['되돌리기 PR'], keys: [], basis: ARGO },
  diff: { ko: '차이', en: 'Diff', keys: [], basis: 'spec/design.md#B-025' },

  /* GitOps */
  sync: { ko: '동기화', en: 'Sync', keys: [], basis: KO },
  hook: { ko: 'hook', en: 'Hook', keep: true, avoid: [/(^|[^웹])훅/], keys: [], basis: ARGO },
  webhook: { ko: 'webhook', en: 'Webhook', keep: true, avoid: ['웹훅'], keys: [], basis: PROM },
  pullRequest: { ko: 'PR', en: 'PR', keep: true, keys: [], basis: SRE },
  merge: { ko: '병합', en: 'Merge', avoid: ['머지'], keys: [], basis: KO },

  /* 알림 */
  alert: { ko: '알림', en: 'Alert', avoid: ['경보'], keys: [], basis: PROM },
  alertResolved: { ko: 'resolved', en: 'Resolved', keep: true, avoid: ['해소'], keys: [], basis: PROM },
  silence: { ko: 'silence', en: 'Silence', keep: true, avoid: ['무음'], keys: [], basis: PROM },
  expr: { ko: 'expr', en: 'Expr', keep: true, avoid: [/(^|\s)식( 값|이 )/], keys: [], basis: PROM },
  threshold: { ko: '임계값', en: 'Threshold', avoid: [/(알림|경고|기준) \d+(\.\d+)?%|기준선 이하/], keys: [], basis: SRE },
  baseline: { ko: '기준선', en: 'Baseline', keys: [], basis: SRE },
  metricSample: { ko: '샘플', en: 'Samples', avoid: [/[\d,]+점/], keys: [], basis: PROM },
  errorRatio: { ko: '5xx 비율', en: '5xx ratio', avoid: ['오류율'], keys: [], basis: SRE },
  topTalkers: { ko: '트래픽 상위', en: 'Top talkers', avoid: ['많이 주고받는'], keys: [], basis: 'NetFlow·Hubble 같은 네트워크 관측 도구의 Top talkers' },

  /* SRE·Wake 개념: 한국어 */
  incident: { ko: '인시던트', en: 'Incident', avoid: ['사고', '사건'], keys: [], basis: SRE },
  onCall: { ko: '당번', en: 'On-call', avoid: ['온콜'], keys: ['wake.inc.head.oncall'], basis: KO },
  severity: { ko: '심각도', en: 'Severity', keys: [], basis: SRE },
  slo: { ko: 'SLO', en: 'SLO', keep: true, keys: [], basis: SRE },
  errorBudget: { ko: 'error budget', en: 'Error budget', keep: true, avoid: ['오류 예산', '에러 버짓'], keys: [], basis: SRE },
  burnRate: { ko: 'burn rate', en: 'Burn rate', keep: true, avoid: ['소진율', '소진 속도'], keys: [], basis: SRE },
  postmortem: { ko: '사후 분석', en: 'Postmortem', avoid: ['사후 보고', '포스트모템'], keys: [], basis: SRE },
  mitigation: { ko: '완화', en: 'Mitigation', keys: ['wake.inc.result.mitigated'], basis: SRE },
  action: { ko: '조치', en: 'Action', avoid: ['대응책'], keys: [], basis: KO },
  approve: { ko: '승인', en: 'Approve', keys: [], basis: SRE },
  evidence: { ko: '근거', en: 'Evidence', avoid: ['증거'], keys: [], basis: KO },
  cause: { ko: '원인', en: 'Cause', keys: [], basis: SRE },
  unknown: { ko: '확인 안 됨', en: 'Unknown', avoid: ['미확인'], keys: ['wake.inc.cell.unknown'], basis: 'spec/design.md#B-037' },
  verifyRecovery: { ko: '복구 확인', en: 'Recovery check', avoid: ['검증 실패', '후속 검증', '지지됩니다', /어김/], keys: [], basis: SRE },
  recurrence: { ko: '재발', en: 'Recurrence', avoid: ['반복의 원인', '되풀이'], keys: [], basis: KO },
  escalation: { ko: '에스컬레이션', en: 'Escalation', keys: [], basis: SRE },
  runbook: { ko: '런북', en: 'Runbook', keys: [], basis: SRE },
  report: { ko: '보고서', en: 'Report', keys: [], basis: KO },
};
/* 번역투·관공서 말투, 보고형 끝맺음, "미~" 축약(spec/design.md#B-037), 이제 없는 개념(Wake에는 관리자가 없음): 사전과 화면 문자열 어디에도 쓰지 않음 */
export const AVOID = ['관리자', '수행', '해당', '처리 완료', '실시하', '요청 사항', '활성화', '진행하', '복사함', '저장함', '삭제함', '원문 보기',
  '미연결', '미확인', '미채택', '미실행', '미기록', '미해결', '미준비', '미달', '미수집', '미지원', '거절함', '채택함', '확인함'];
/* 사전 밖에서 화면 문자열을 두는 파일(저장소 기준 경로, 파일 이름에 * 허용): check-locale이 같은 avoid 규칙으로 검사 */
export const SCREENS = ['sim*.js'];
/* 원문 필드: 로그, Kubernetes 이벤트 메시지, YAML, PromQL·LogQL, 명령, 복사해 보내는 요청 본문. 화면 말이 아니라서 검사하지 않음 */
export const RAW_FIELDS = ['raw', 'query', 'command', 'cmd', 'before', 'after', 'yaml', 'path', 'out'];
