# SRE 필요 정보와 검수 명세

예: 대상 UID가 바뀐 뒤 도착한 옛 응답은 새 대상의 정상 값으로 쓰지 않는다. 목표와 현재의 차이를 작업 ID로 추적한다.

이 문서의 현재는 2026-11-17 작업 트리의 정적 확인이다. 시험·화면·클러스터 실행 통과를 뜻하지 않는다. 원천 약어·제안의 효력·공통 읽기 계약은 [원칙](constitution.md)의 C-SOURCE, C-005, C-006을 따른다. 채택한 목표는 decisions.md를 따른다.

## 적용 범위와 근거 읽는 법

이 문서는 당번 SRE가 감지, 원인 조사, 조치 선택, 사람 승인, 실행 확인, 복구 확인, 인수인계와 회고에서 답해야 하는 질문을 정의한다. 화면을 구현하는 사람은 질문의 값 계약을, 검수자는 원본 대조와 실패 조건을 사용한다. SRE 영역 정본이며 다른 영역의 화면 명세와 열 명세를 대체하지 않는다.

확인 기준은 2026-11-17의 현재 작업 트리다. 미커밋 파일도 코드 근거에 포함한다. 이번 작성에서는 코드와 기존 판정·스크립트를 읽었으며 앱 실행, 클러스터 변경, 장애 주입, 제품 시험 재실행은 하지 않았다. 따라서 아래의 `구현됨`은 코드 존재, `부분`은 코드 일부와 남은 요구, `안 됨`은 요구 경로 부재를 뜻한다. `검증됨`은 해당 코드·환경·입력의 실행 증거가 있을 때만 쓴다. 과거 고정본의 PASS를 현재 트리 전체의 PASS로 옮기지 않는다.

코드의 `pages/`, `data/`, `desktop/`는 `apps/wake/` 기준이고 `reads/`는 `apps/wake/desktop/reads/` 기준이다. 단독 모듈명은 연결 문단의 같은 경로를 뜻한다.

원천 약어는 C-SOURCE를 따른다. D/U/CM/GH는 각각 decisions/user-messages/code-map/git-history 원천이다. 코드 줄은 병행 변경 시 달라질 수 있다.

D는 직접 요구 967개와 보조 문맥 85개, 총 1052개다(D:3). 질문이나 붙여넣은 제안을 승인으로 간주하지 않는다. 각 항목의 D ID와 정확한 원문 위치는 끝의 대응표에 있다. 1차 요청의 K·J는 SRE 정보·검증 영역을 가리킨다.

`SRE-Q-*`는 상황별 질문, `SRE-I-*`는 정보 품질, `SRE-V-*`는 검수 절차, `SRE-L-*`는 lab 시나리오, `SRE-R-*`는 반복 결함이다. `T-SRE-*`는 이 파일 안에 정의한 후속 작업 ID다. 다른 실행이 소유한 `tasks.md`에는 쓰지 않았으며, 통합 담당이 해당 ID를 가져갈 수 있도록 파일·검사·선행 조건을 끝에 명시한다. 존재하지 않는 `tasks.md` 항목을 이미 등록된 것으로 표시하지 않는다.

## SRE-Q-00 판단 흐름과 답의 계약

- 목표: 입력: 홈 인시던트를 열고 범위·원인·조치·확인·결과를 왕복한다 → 기대: 당번은 같은 인시던트에서 감지 → 범위 → 원인 → 조치 → 확인 → 결과를 따라간다. 원인은 관측, 판단 규칙, 해석, 확인하지 못한 것, 확인 계획을 구분한다. 시간상 가까운 배포를 원인으로 확정하지 않는다; [RULE-AI](rules.md#RULE-AI). 모든 질문 결과는 `clusterId, kind, namespace, name, uid, container/containerId(해당 시), source, query, from, to, collectedAt, sourceState, evidenceHash(저장 근거 시)`를 대조표에 갖는다. 이름만 일치하는 결과는 UID 일치로 통과시키지 않는다. 현재 값, 과거 구간 값, 고정 근거를 서로 바꾸지 않는다. 화면 이동 후 같은 대상과 구간을 유지하고 목록으로 돌아온다; 실패: UID·절대 구간이 달라지거나 승인만으로 복구 완료가 보이면 실패.
- 현재: 부분. `apps/wake/pages/incident-detail.js:43-158`에 summaryBar, statusFlow, reasoningChain, actionCompare, verifyCard, dataTable이 있다. `apps/wake/desktop/incident-hub.cjs:205-311`이 작업면을 만든다. 승인만으로 조치 단계가 완료처럼 보이는 경로와 실제 PR 부재는 SRE-Q-10·11에서 별도로 남긴다.
- 차이: 승인→실행→원증상 복구의 전체 실제 흐름과 PR 연결이 미검증이다. T-SRE-01, T-SRE-05, T-SRE-06, T-SRE-15.
- 고정 장치: `apps/wake/data/incident-model.test.mjs:188` — `verifyCounts and causeStatus`; `apps/wake/data/ownership.test.mjs:62` — `planFor: an auto-synced Argo CD target gets a Draft PR, never a cluster command (N2)`
- 출처: D00066, D00092, D00742, D00743, D00960, D00987. 근거: D00066, D00092, D00742, D00743, D00960, D00987.

### SRE-TIME 질문별 시간과 클릭 수의 측정 계약

- 목표: 입력: 첫 화면 표시부터 답과 근거를 말할 때까지 시간을 잰다 → 기대: (기본값 채택, 번복 가능) 질문의 시작점은 각 항목의 첫 화면이다. 화면이 열린 시점부터 검수자가 질문의 답과 근거를 말할 때까지의 시간을 잰다. 클릭, 키보드 활성화, 메뉴 선택을 각각 행동 1회로 센다. 스크롤·검색 입력 횟수와 대기 시간은 별도 열에 남긴다. 로그인을 포함한 연결 준비 시간, 사람 승인 대기, [RULE-RECOVERY](rules.md#RULE-RECOVERY)의 복구·장기 관찰은 탐색 시간과 합치지 않는다; 실패: 탐색 시간에서 제외한 대기를 별도 대기 열에서도 누락하거나 클릭 수·탐색 시간을 숨기면 실패.

10초 상황 공유 읽기는 옛 화면 규칙의 기존 기준이다. 나머지 질문의 10·30·60초와 1~4회 목표는 (기본값 채택, 번복 가능)이며 실측값이나 과거 사용자 승인 수치가 아니다. 정보 정확성 PASS와 탐색 목표 PASS를 별도로 기록한다. 목표 초과를 숨기거나 합격하도록 시계를 뒤에서 시작하지 않는다. T-SRE-01에서 실제 측정으로 채택 목표의 달성 여부를 판정한다.

- 현재: kit/tools/check-layout.mjs:79~104는 scrollTop 이동을 검사하지만 사용자의 질문 시작·답 도달 시각이나 클릭 수는 수집하지 않는다.
- 차이: 질문별 타이머·행동 계수 수집기가 없고 질문별 허용 시간도 미정이다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D-USR-2026-11-16-7; D00905, D00987; 옛 화면 규칙의 상황 공유 기준, 그 밖의 수치는 제안.

## 상황별 질문과 답 위치

### SRE-Q-01 평상시 점검: 어디부터 조사해야 하는가

- 목표: 입력: 클러스터 홈에서 Pods·Nodes·Events와 metrics.range 응답을 읽는다 → 기대: 홈 첫 화면에서 클러스터 식별, 열린 인시던트, 문제 Pod, Ready Node, Warning 발생, CPU·메모리·오류율·요청률의 구간을 판별한다. 정상은 필요한 출처가 정상 응답했을 때만 쓴다. 숫자가 없는 출처를 0으로 만들지 않는다. C-K·C-P·C-H로 같은 범위의 원본과 대조한다. 정수 개수 오차 0, 실수는 SRE-I-01의 반올림 기준을 따른다. 장애 없는 s7에서도 조회 실패를 감추지 않는다. 홈에서 10초·1회 이내에 조사 대상 하나와 이유를 설명한다. → 실패: 출처 실패가 0·정상으로 보이거나 홈 머리 값과 그래프 끝값이 다르면 실패.
- 현재: 부분, 답 가능성 부분. `cluster-home.js:95-115,175-207`에 분리 읽기·시리즈 머리 값·과거 구간 표기가 있다. CM의 `cluster-home.js`는 구현 위치 목록이며 실제 값 검증은 아니다. 과거 시험 환경 기록의 과부하·namespace 편중으로 전부 실측된 상태가 아니다.
- 차이: 홈 값의 원본 동시 대조와 첫 화면 판단 시간 증거가 부족하다. T-SRE-01, T-SRE-02, T-SRE-11.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00073, D00074, D00781, D00807, D00952, D00955. 근거: D00073, D00074, D00781, D00807, D00952, D00955.

- 답 위치·값·출처: `cluster-home.js`의 머리·지표 알약·인시던트·Pod 흐름, `data/home.js:14-20`의 `cpu, mem, err, rps`, 허브 `metrics.range`의 `cluster.cpu, cluster.mem, cluster.err, cluster.rps` 및 `*.byNode, *.byNs`, Kubernetes Nodes·Pods·Events, 허브 인시던트 저장소. 홈의 머리 값은 그래프와 동일 시리즈의 마지막 점이다. 상위 5 Node·namespace는 전체 합계가 아니다.

### SRE-Q-02 알림 수신: 실제 장애 알림이며 언제부터인가

- 목표: 입력: firing·resolved·Watchdog가 섞인 alerts 응답에서 상세를 연다 → 기대: 알림 이름·심각도·대상·상태·시작과 종료·expr·규칙의 평가 시각을 함께 확인한다. Watchdog의 분류·집계는 [RULE-CHIPS](rules.md#RULE-CHIPS)를 따른다. pending, firing, resolved 이력과 알림 수신 실패를 구분한다. C-A로 원본을 읽고 필터 전·후 행 집합과 Watchdog 제외 개수를 대조한다. 같은 시각 동점은 결정된 두 번째 키로 안정 정렬한다. 알림 수신에서 상세까지 30초·2회 이내를 측정한다. → 실패: Watchdog가 장애 수에 포함되거나 상세 fingerprint·시각이 바뀌면 실패.
- 현재: apps/wake/data/alerts.js:84는 Watchdog를 제외하고 :85는 상태·at 순으로 정렬한다.
- 차이: 같은 상태·at의 알림을 고정하는 두 번째 안정 키가 없다.
- 고정 장치: 고정 없음 → T-SRE-03
- 출처: D00091, D01006. 근거: D00091, D01006.

- 답 위치·값·출처: `pages/alerts.js`, `pages/alert-detail.js`, `data/alerts.js`, `desktop/reads/alerts.cjs`; Alertmanager `/api/v2/alerts`의 `fingerprint, labels, annotations, startsAt, endsAt, status`, Prometheus `/api/v1/rules`의 그룹·이름·query·평가 시각, 허브 알림 이력. 행의 `fingerprint`와 규칙 그룹·이름을 별도로 고정한다.

### SRE-Q-03 인시던트 감지: 무엇을 한 장애로 묶었는가

- 목표: 입력: 같은 Deployment의 OOM·BackOff와 다른 owner의 실패를 입력한다 → 기대: 신호의 종류, reason, 심각도, 대상 소유 관계, 최초·마지막 시각, 반복 수를 표시한다. 동일 Event UID 재수신은 발생 횟수를 더하지 않는다. OOM·CrashLoop·알림이 같은 소유 워크로드면 한 사건, 다른 소유자면 별도 사건으로 추적한다. 감지 실패와 인시던트 0건은 다르다. C-K·C-A·C-H, s1·x10·x11을 사용한다. 동일 신호 재조회 전후 id·number 불변, x10은 2건, x11은 같은 Deployment에 신호 15개 이상과 사건 1건을 대조한다. 같은 이름의 새 UID를 추가해 과거 사건과 혼합하지 않는지도 별도 확인한다. 목록에서 30초·2회 이내다. → 실패: 같은 Event UID가 중복 집계되거나 서로 다른 owner가 한 사건이면 실패.
- 현재: apps/wake/data/incident-detect.js:28의 DETECT는 lookback 60분·active 10분·quiet 5분·gap 30분·maxSignals 200이다. :96의 keyOf에는 UID가 없다.
- 차이: PVC·Application 대상과 ImagePull 전용 분류가 없으며 동명 UID 교체를 사건 키가 구분하지 않는다.
- 고정 장치: `apps/wake/data/incident-detect.test.mjs:19` — `an OOMKilled container, a BackOff event and a firing alert of one Deployment become one incident with a stable id`; `apps/wake/data/incident-model.test.mjs:164` — `eventSummary: one row per object and reason, every count from the same rows (N8)`
- 출처: D00064, D00091, D00092, D01025, D01037. 근거: D00064, D00091, D00092, D01025, D01037.

- 답 위치·값·출처: `cluster-home.js` 인시던트 목록, `incident-detail.js` 범위·기록; `incident-detect.js:13-28,58-93,96-151`의 `SIGNALS, DETECT, signalsOf, detect`; 저장 `id, key, number, target, reasons, signals, detectedAt, lastSignalAt, phase`. 현재 key는 `cluster|kind|namespace|name`이며 UID를 포함하지 않는다.

### SRE-Q-04 사용자 영향: 5xx·지연·SLO로 실제 피해를 말할 수 있는가

- 목표: 입력: 5xx·전체 요청률 시리즈에 요청 0과 수집 누락을 각각 넣는다 → 기대: 세부 수치 (기본값 채택, 번복 가능): SLO 기본 99.9%와 영향 추정의 기준. 오류율, 요청률, p95, SLO, burn rate, 영향 기간, 실패 요청 수를 구별한다. Ready 부족은 용량 감소이지 측정한 사용자 오류율이 아니다. 요청 0·수집 누락·지표 없음은 서로 다른 상태다. 추정 실패 요청 수를 실측 건수로 표기하지 않는다. C-P로 같은 쿼리·labels·절대 구간을 조회한다. `5xx%=100×rate(5xx)/rate(all)`, `burn=5xx%/(100-SLO)`와 구간 이름을 대조한다. 분모 없음은 unknown이다. s3에서 5xx 상승을 확인하되 원인은 근거 부족으로 남긴다. 작업면에서 30초·2회 이내다. → 실패: 분모 없음이 오류율 0이 되거나 외삽 실패 요청 수를 실측으로 쓰면 실패.
- 현재: 부분, 답 가능성 부분. `incident-model.js:38-58`은 누락 구간을 배율로 확장해 요청 수를 계산한다. `userImpact:103`은 결과가 있으면 failed를 measured로 표기하므로 보간·외삽 사실이 숨을 수 있다. `incident-hub.cjs:225`의 과거 baseline 없는 경우 0 대체도 정적 위험이다. 서비스 p95는 조회 정의가 있으나 작업면 영향의 수집은 5xx와 rps뿐이다.
- 차이: 실제 사용자 영향·수집 공백·서비스별 SLO와 화면 수치를 같은 구간으로 대조하지 못했다. T-SRE-07, T-SRE-15.
- 고정 장치: `apps/wake/data/incident-model.test.mjs:37` — `impactFromSeries: every burn names its window (N7)`
- 출처: D-USR-2026-11-16-7; D00086, D00742, D00781, D00987. 근거: D00086, D00742, D00781, D00987.

- 답 위치·값·출처: 홈 `cluster.err/rps`, 네트워크·Service/Ingress 지표 `service.err/rps/p95`, `ingress.err/rps/p95`; 작업면 `impact.{now,baseline,threshold,from,atDetect,query,samples,slo,ref}`, 보고서 `userImpact`. `reads/metrics.cjs:14-33`의 nginx 지표 질의와 `incident-hub.cjs:172-180,217-231`의 영향 근거를 쓴다. SLO는 Service의 `wake.dev/slo`, 없으면 `SLO_DEFAULT=99.9`다. 현재 코드는 클러스터 설정 기본 SLO를 읽지 않는다.

### SRE-Q-05 원인 파악: 실제 관측과 가설이 무엇인가

- 목표: 입력: OOM 원본과 원인이 확인되지 않은 5xx 사건의 원인 절을 연다 → 기대: 관측마다 근거 조각을 열 수 있고 규칙 이름·버전과 추론 등급을 보여 준다. `observe, basis, interpret, verify, unknown`을 혼합하지 않는다. 외부 회신으로 보강한 supported와 직접 확인한 confirmed를 구별한다. AI 연결이 없으면 해석을 만들지 않는다. 원인 문장의 모든 숫자가 C-H의 근거 해시와 일치하고 해당 근거가 실제로 성공한 읽기여야 한다. s1은 OOM 종료 사유·한도·표본을 나란히, s3은 원인 미확정을, s5는 hook 실패와 Application 상태를 구분한다. 근거 부족일 때 확정 원인 0건이다. 작업면에서 60초·3회 이내다. → 실패: 관측·추정이 섞이거나 실패한 근거 읽기가 confirmed를 만들면 실패.
- 현재: apps/wake/data/incident-model.js:168의 causeStatus는 OOM 외에 observe 단계가 있으면 inferred를 반환한다.
- 차이: observe 존재와 근본 원인 확인을 동치로 볼 수 없다. 실패 get_evidence도 ai-run.cjs:155의 used에 들어가는 경로가 남아 있다.
- 고정 장치: `apps/wake/data/incident-model.test.mjs:188` — `verifyCounts and causeStatus`
- 출처: D00092, D00738, D00742. 근거: D00092, D00738, D00742.

- 답 위치·값·출처: 작업면 원인 `reasoningChain`, 근거 `incident-evidence.js`; `incident-hub.cjs:251-267`의 `chain`, Kubernetes 상태·Events·이전 로그·Prometheus·Application 스냅샷; `incident-model.js:168-172`의 `causeStatus`.

### SRE-Q-06 최근 변경: 무엇이 언제 바뀌었는가

- 목표: 입력: 이미지가 같고 ConfigMap 참조만 다른 두 revision을 비교한다 → 기대: 배포·설정·인프라·증상을 같은 시간축의 별도 줄로 표시한다. ReplicaSet revision·전체 이미지, ConfigMap 변경, Application revision·시도·hook 결과를 구별한다. 현재 상태로 과거 이력을 만들지 않는다. 이미지가 같아도 설정 변경으로 발생한 롤아웃의 차이를 숨기지 않는다. C-K·C-G에서 before/after resourceVersion·UID·revision·전체 image·template를 고정한다. x01·x02·x07·x12에서 차이 없음, 비교 불가, 권한 거부, 조회 실패, 실제 차이를 구분한다. 작업면에서 60초·3회 이내다. → 실패: 변경이 없다고 표시하거나 시간상 인접 배포를 확정 원인으로 쓰면 실패.
- 현재: 부분, 답 가능성 부분. `resource-detail.js:646-657`은 이미지 마지막 경로 조각만 비교하고 image가 다를 때만 diff를 그린다. 설정만 변경된 x07은 빈 diff로 남는 P5다. 최신 원본과 이전 원본을 보존한 전체 template 비교가 필요하다.
- 차이: 설정만 바뀐 rollout과 원 revision의 변경 내용을 끝까지 연결하지 못했다. T-SRE-09, T-SRE-15.
- 고정 장치: 고정 없음 → T-SRE-09
- 출처: D00082, D00102, D00103, D00104, D00105, D00106, D00453, D00806. 근거: D00082, D00102~D00106, D00453, D00806.

- 답 위치·값·출처: 홈 `changeMarks`, 작업면 `timeline`, 리소스 `rolloutTab`, GitOps 상세 코드·기록. `incident-hub.cjs:242-249`는 ReplicaSet 생성 시각, ConfigMap managedFields 시각, Argo `status.history[].deployedAt`, 신호 시각을 사용한다. ConfigMap 변경 시각은 diff 원문 자체가 아니다.

### SRE-Q-07 영향 범위: 어디까지 퍼졌으며 무엇은 추정인가

- 목표: 입력: ownerReferences·selector·EndpointSlice 결과를 범위 화면에 넣는다 → 기대: namespace·소유 워크로드·Pod·Service·Ingress·PVC를 식별한다. Service selector, EndpointSlice targetRef, ownerReferences로 확인한 연결과 같은 namespace라는 추정을 구분한다. 저장소로 흐르는 띠를 실제 서비스 호출 수로 단정하지 않는다. C-K·C-P로 노드와 edge를 각각 검증한다. x03에서 web→api 호출 계측 부재를 밝히고 conns/retrans 빈값을 0으로 읽지 않는다. 두 Ingress 사건을 합치지 않는 현재 규칙과 같은 원인일 가능성을 따로 기록한다. 작업면에서 60초·3회 이내다. → 실패: 선택자 관계를 실제 트래픽량·확인한 인과로 표시하면 실패.
- 현재: 부분, 답 가능성 부분. `reads/network.cjs:57`은 conns/retrans를 빈 배열로 반환한다. `incident-hub.cjs:233-240`은 현재 owner·Pod를 범위로 만든다. 장애 시점 전체 영향 topology를 고정한 것과 같지 않다.
- 차이: 모든 관계에서 실측 트래픽·추정·확인된 소유 관계의 구별을 검증하지 못했다. T-SRE-04, T-SRE-07, T-SRE-15.
- 고정 장치: 고정 없음 → T-SRE-04
- 출처: D00083, D00086, D00088, D00781, D00851. 근거: D00083, D00086, D00088, D00781, D00851.

- 답 위치·값·출처: 작업면 `scope`, 네트워크 `flowGraph`, `serviceRows.{rx,tx,err,conns,retrans}`, 리소스 관련 표. Kubernetes Service/EndpointSlice/ownerReferences와 nginx 요청률, 컨테이너 네트워크 지표가 출처다. `network.js:54-77`의 저장소 링크는 `estimated:true`다.

### SRE-Q-08 재발: 같은 일이 전에 있었는가

- 목표: 입력: 같은 owner의 해결 사건 뒤 새 신호와 옛 신호 재수신을 각각 입력한다 → 기대: 이전 사건의 번호·대상·규칙·기간·조치·복구 종류를 찾아 현재 사건과 구분한다. 과거 기록이 없거나 보관 기간 밖이면 재발 없음으로 결론 내리지 않는다. 완화 중 재신호와 해결 뒤 새 사건을 분리한다. C-H에서 현재·과거 번호와 해시를 대조한다. 이미 해결한 동일 신호 재수신은 새 사건을 만들지 않는다; [RULE-RECOVERY](rules.md#RULE-RECOVERY); [RULE-RETENTION](rules.md#RULE-RETENTION). 목록에서 60초·3회 이내다; 실패: 옛 신호가 새 발생으로 늘거나 보관 만료가 재발 0으로 보이면 실패.
- 현재: apps/wake/desktop/incident-hub.cjs:98의 rows는 사건을 cluster·state·window로 거르고 :74는 저장된 클러스터 사건을 읽는다.
- 차이: 동일 원인 재발 전용 검색과 7일 관찰 coverage를 판정하는 흐름은 rows에 없다.
- 고정 장치: `apps/wake/data/incident-model.test.mjs:233` — `nextShare, figureWindow and freshness`
- 출처: D00465, D00472, D00734, D00806. 근거: D00465, D00472, D00734, D00806; U-50.

- 답 위치·값·출처: 인시던트 목록·보고서, 허브 `incidents`, `signals`, `resolvedAt`, `recovery`, `evidence`, `audit`; `incident-detect.js:114-151,155-174`, `incident-hub.cjs:98-103`.

### SRE-Q-09 조치 선택: 무엇을 바꾸며 위험과 되돌릴 revision은 무엇인가

- 목표: → [FLOW-APR-001](flows/approval-execution.md#FLOW-APR-001); [RULE-APPROVAL](rules.md#RULE-APPROVAL).
- 현재: apps/wake/desktop/incident-hub.cjs:273~281은 OOM 한도 상향과 rollout undo 후보를 만들며 rollback 명령에 revision을 고정하지 않는다.
- 차이: 되돌릴 이전 revision과 현재 가용 여유를 검증한 뒤 후보를 확정하는 조건이 없다.
- 고정 장치: 고정 없음 → T-SRE-05
- 출처: D00453, D00742, D00743. 근거: D00453, D00742, D00743.

- 답 위치·값·출처: `actionCompare`, 승인 시트; `incident-hub.cjs:269-285`의 `options`; `data/ownership.js`의 `ownerOf, planFor`; Application `status.resources`, tracking annotation, Helm metadata, ReplicaSet revision, Git 원본.

### SRE-Q-10 승인: 누가 정확히 무엇을 승인했는가

- 목표: 입력: waiting 승인에 allow·deny와 동시 재전송을 입력한다 → 기대: 승인 전 전체 변경과 영향·근거·대상을 읽을 수 있다. 첫 사람 결정의 주체·시각·사유를 보존하고 재시도는 replay로 표시한다. AI·MCP·HTTP가 사람 승인으로 가장하지 않는다. 거절과 승인 실패도 기록한다. C-H에서 승인 id별 감사 행과 결정 원본을 대조한다; [RULE-APPROVAL](rules.md#RULE-APPROVAL). 시트가 열린 뒤 60초·2회 이내에 대상·변경·위험을 말한다. 사람 판단 시간은 따로 기록한다; 실패: 첫 사람 결정의 주체·시각이 바뀌거나 AI 요청이 사람 승인으로 저장되면 실패.
- 현재: apps/wake/desktop/approvals.cjs:43~46의 decide는 waiting 이후 재결정에서 저장된 판정을 반환한다.
- 차이: 중복 결정은 보존하지만 승인 순간 plan의 대상 UID를 원본에 재조회하여 같은 대상인지 확인하지 않는다.
- 고정 장치: 고정 없음 → T-SRE-05
- 출처: D00742, D00743, D00987. 근거: D00742, D00743, D00987.

- 답 위치·값·출처: AI 승인 시트, 작업면 기록, AI 작업 기록·상세; `desktop/approvals.cjs:21-55`의 `target, plan, requester, transport, model, state, decidedBy, decidedAt, reason, prResult`, `audit`의 `approval, permission, result`.

### SRE-Q-11 실행: 승인이 실제 변경으로 이어졌는가

- 목표: 입력: 승인만 있고 PR URL·merge SHA·실행 결과가 없는 사건을 연다 → 기대: 승인, PR 생성, 리뷰·병합, sync, rollout, 외부 사람이 실행한 명령, 원본 재확인을 각기 다른 시각·상태로 표시한다. 승인만 있거나 pending이면 적용 완료로 표시하지 않는다. 자기신고로 복구를 확정하지 않는다. C-G·C-K·C-H로 실행별 기록을 대조한다. u52는 사람이 명령을 실행했다는 말 뒤 실제 spec·UID·상태를 다시 읽는다. PR 경로는 실제 PR 번호·URL·merge SHA가 없으면 실패 또는 대기다. 실행 결과 탐색 30초·3회, 실제 rollout 완료 시간은 별도다. → 실패: 적용 done·복구 성공을 표시하면 실패.
- 현재: 안 됨(PR 실행), 부분(승인·수동 기록), 답 가능성 부분. `approvals.cjs:49`는 GitHub 연결 유무에 따라 pending 또는 github-unconnected만 기록한다. `incident-detail.js:113,146`은 chosen이 있으면 경로·적용을 done으로 그린다. LAB P6와 같은 구현 공백이며 코드상 승인과 적용 상태가 혼동될 위험이 있다.
- 차이: 승인 저장이 실제 PR·명령 실행을 보장하지 않으며 실행 결과 연결이 부족하다. T-SRE-05, T-SRE-06, T-SRE-15.
- 고정 장치: 고정 없음 → T-SRE-05
- 출처: D00102, D00103, D00104, D00105, D00106, D00453, D00743. 근거: D00102~D00106, D00453, D00743.

- 답 위치·값·출처: 작업면 조치·기록, GitOps 상세, AI 작업 기록; 승인 docs와 Git 서버 PR·merge SHA, Argo `operationState, sync.revision`, Deployment `observedGeneration, updatedReplicas, availableReplicas`, 실제 외부 실행 기록.

### SRE-Q-12 복구 확인: 복구됐다고 말할 근거는 무엇인가

- 목표: 필수 조건별 관측 결과와 누락 구간을 보존한다. 서비스 복구·증상 회복·완화·검증 우회·배치 재개를 구분하며 배치는 Job Complete와 실제 처리 완료를 따로 확인한다. 복구 시계와 판정은 → [RULE-RECOVERY](rules.md#RULE-RECOVERY).
- 현재: 부분, 답 가능성 부분. 순수 함수의 창 판정은 존재한다. `incident-hub.cjs:64-72`의 ready는 CronJob이면 true이고, 일부 사라진 Pod·Job을 true로 취급한다. `287-292`는 phase로 conditions 상태를 공통 생성하며 ratio는 optional이다. 이것만으로 서비스별 SLO·배치 완료를 검증했다고 말할 수 없다. 정적 위험이며 실제 환경에서 실제 오판을 재현하지 않았다.
- 차이: 증상 해제와 원인 해결을 구별하는 실제 연속 복구·재발 반례가 미검증이다. T-SRE-07, T-SRE-12, T-SRE-15.
- 고정 장치: `apps/wake/data/incident-model.test.mjs:82` — `batchRunOf: complete only with Job Complete and every item processed`; `apps/wake/data/incident-detect.test.mjs:63` — `a window the hub could not read is a miss, never ok; a not-ready workload fails the check and it starts again`
- 출처: D-USR-2026-11-16-3; D00092, D00104, D00743. 근거: D00092, D00104, D00743.

- 답 위치·값·출처: `verifyCard`, 작업면 결과, 보고서 복구 확인; `incident-model.js:14-15,161-207`의 `VERIFY_DEFAULT, verifyCounts, verifyVerdict, recoveryKind, recoveryTone`; Kubernetes 건강 상태, Prometheus 5xx, 필요 시 로그·배치 처리 지표.

### SRE-Q-13 인수인계·보고: 다음 당번이 같은 결론을 재현할 수 있는가

- 목표: 입력: open·resolved·사건 없음 입력으로 보고서를 내보낸다 → 기대: 열린 사건은 상황 공유, 해결 사건은 사후 분석, 사건 없는 날은 점검 보고서로 내보낸다. 요약의 영향·원인 등급·결정 필요·담당·다음 공유와 원본 링크를 읽고 근거까지 이동할 수 있다. 보고서 화면·PDF·Markdown·채널 요약은 동일 스냅샷을 쓴다. 지금 상황을 10초 안에 읽는다. critical 다음 공유 30분, 그 밖 60분을 실제 감지 시각 기준으로 계산한다. 채널은 5~8줄이며 출처·링크가 빠지지 않는다. C-H·내보낸 실제 파일을 대조하고 PDF 모든 쪽을 직접 확인한다. 보고서 진입·내보내기는 60초·3회 목표이며 저장 창 조작을 포함한다. → 실패: 다른 스냅샷 값·가짜 담당·누락 근거 링크가 출력되면 실패.
- 현재: 부분, 답 가능성 부분. `incident-report-doc.js:20-95`는 상태별 문서와 최종값·그림을 만든다. `incident-report.js`에 PDF·Markdown·채널 경로가 있다. Excel 요구(D00740)의 구현과 검증은 확인하지 못했다. `incident-hub.cjs:306`은 빈 설정으로 `linksOf`를 호출하므로 팀 공유 가능한 외부 링크가 실제 제공되는지 추가 확인이 필요하다.
- 차이: 같은 스냅숏으로 보고·공유·재열기를 재현한 전체 증거가 부족하다. T-SRE-13, T-SRE-15.
- 고정 장치: `apps/wake/pages/incident-report-doc.test.mjs:53` — `the stage picks the document: an open incident is a status update, a resolved one a postmortem`
- 출처: D00464, D00471, D00734, D00740, D00942, D00944. 근거: D00464, D00471, D00734, D00740, D00942, D00944.

- 답 위치·값·출처: `incident-report.js`, `incident-report-doc.js`의 `incidentReport, checkReport`, `kit reportCanvas`; 허브 `evidence, audit, phase, detectedAt, resolvedAt, userImpact, chain, verify`, 후속 작업. 경로는 `wake://cluster/:cluster/incidents/:id/report`, 점검은 `wake://cluster/:cluster/report`다.

### SRE-Q-14 사후 회고: 감지·승인·실행·복구 사이 어디서 지연됐는가

- 목표: 입력: 감지·승인·실행·복구 시각 중 실행 시각만 없는 해결 사건을 연다 → 기대: 최초 증상, 알림, 원인 판정, 승인, PR·리뷰·병합, sync·rollout, 복구 확인 시각을 실제 기록으로 설명한다. 누가 잘못했는지 추정하지 않고 기록에서 확인한 잘된 점·아쉬운 점·후속 작업을 분리한다. 담당·기한이 없으면 지정 필요다. 기록이 없는 시점은 빈 이유를 표시하고 생성 시각으로 대신하지 않는다. 해결 그림은 감지 30분 전부터 복구 확인까지, 승인·적용·복구 확인 표시를 포함한다. 상태와 수치는 보고서를 다시 열어도 같은 해시에서 나온다. 보고서에서 60초·4회 이내다; 실패: 문서 생성 시각을 실행 시각으로 채우거나 근거 없는 담당자를 만들면 실패.
- 현재: apps/wake/data/incident-model.js:220의 figureWindow는 detectedAt~verifiedAt/watchUntil을 구성하고 incident-hub.cjs:307은 fixAt에 mitigatedAt을 넣는다.
- 차이: mitigatedAt을 실제 명령·배포 적용 시각과 구별하지 않아 단계별 실행 지연을 확정할 수 없다.
- 고정 장치: `apps/wake/pages/incident-report-doc.test.mjs:68` — `figures run from 30 minutes before detection through the recovery check, marked, with the 7-day watch (N6)`
- 출처: D00734, D00742, D00942, D00944. 근거: D00734, D00742, D00942, D00944.

- 답 위치·값·출처: 사후 분석 3 타임라인, 5 감지, 6 대응·복구 확인, 7 잘된 점·아쉬운 점, 8 후속 조치; frozen evidence·audit·Git·Kubernetes·Argo 기록.

### SRE-Q-15 신선도: 지금 값인지 과거 값인지 알 수 있는가

- 목표: 입력: 과거 1시간을 선택하고 공급자를 끊은 뒤 복구한다 → 기대: 수집 시각·선택 구간·마지막 성공·현재 출처 상태를 함께 읽는다. 고정 과거 구간의 마지막 값을 현재 상태로 말하지 않는다. 끊긴 뒤 남은 선은 stale이고 0도 정상도 아니다. 새 대상에 이전 대상 값을 붙이지 않는다. C-P·C-S·C-H로 고정 from/to와 마지막 유효 표본을 대조한다. 공급자를 끊었다 복구한 동안 값·상태·시각이 같이 바뀌고, 늦은 이전 UID 응답은 거절한다. 어느 화면에서든 10초·1회 이내에 현재 값 여부를 말한다. → 실패: 과거 끝값을 현재 정상으로 표시하거나 재연결로 lastSuccessAt을 덮으면 실패.
- 현재: 부분, 답 가능성 부분. 홈 `cluster-home.js:186-207`에 마지막 수집·구간 표기가 있다. U3:14-22는 이전 Service UID 읽기가 새 UID의 정상 관측으로 반환되는 major를 확인했다. 현재 source-checks.cjs의 identity_changed 거절 수정은 I04에 기록했으며, 재시험 없이 검증됨으로 승격하지 않는다.
- 차이: 출처 시각 계약은 있으나 모든 소비 화면에서 과거값과 현재 값의 구별이 고정되지 않았다. T-SRE-02, T-SRE-04, T-SRE-15.
- 고정 장치: 고정 없음 → T-SRE-02
- 출처: D00093, D00451, D00505, D00806. 근거: D00093, D00451, D00505, D00806.

- 답 위치·값·출처: 홈·상세 지표 머리와 `staleLine`, `sourceChips`, 근거 상세의 `window, collectedAt, sourceState, hash`; `metrics.range.{range,step,fetchedAt,result}`, 허브 source state와 Service UID.

### SRE-Q-16 도구·AI 신뢰: 연결 표시와 실제 읽은 대상이 같은가

- 목표: → [RULE-CHIPS](rules.md#RULE-CHIPS). 포함 여부, 건강, 열 수 있음은 별도 판정이다. 과거 연결 기록이 현재 정상 읽기를 보증하지 않는다. AI의 주 대상은 열린 화면의 등록 context ID이며 미등록 대상은 모델 호출 전에 거절한다. 질문·실패·대화 ID를 저장한다. C-S와 C-H로 같은 Service UID의 열거·근거·허브 상태를 6곳에서 대조한다. 최초 질문 → 공급자 미설정 실패 → 연결 → 같은 대화 후속 질문 → 재열기에서 최초 질문·오류·대화 id가 남고 모델 입력도 같다. 도구 화면에서 30초·3회 이내로 읽기 가능 여부를 판단한다; 실패: 연결 근거와 읽기 건강이 합쳐지거나 칩의 대상이 모델 입력에서 사라지면 실패.
- 현재: apps/wake/data/conn-view.js:79~97은 같은 UID 포함 근거·열거 실패·retry를 합성하지만 ai-run.cjs:135는 no-model에서 기록 전 반환한다.
- 차이: 도구 상태 수정과 별개로 공급자 없는 최초 질문이 저장되지 않는 경로가 남아 있다.
- 고정 장치: `apps/wake/data/conn-view.test.mjs:66` — `tool_views_keep_read_outcomes_apart_and_never_promote_a_past_connection`; `apps/wake/desktop/ai-target.test.cjs:35` — `a registered context id of any form is the target through the model call and the saved conversation on disk`
- 출처: D00017, D00026, D00987, D00999, D01000. 근거: D00017, D00026, D00987, D00999, D01000.

- 답 위치·값·출처: 홈 칩·연결 카드·도구 목록·도구 상세·위 도구 메뉴·설정 도구의 6곳, AI 칩·대화·AI 작업 기록; `data/conn-view.js`의 `toolViews`, inventory·hub state·저장 binding, `ai-hub.js`, `desktop/ai-run.cjs`.

<a id="SRE-Q-17"></a>

### SRE-Q-17 리소스 상세: 장애를 설명할 필수 사실이 빠지지 않았는가

- 목표: 입력: KIND_LIST의 각 종류를 열고 조건·속성·마지막 행까지 이동한다 → 기대: 모든 지원 종류에서 상태 막대 → 시간 → 지표 → 상태·컨테이너 표 → 조건 → 종류별 속성 → 라벨 순서를 유지한다. 대상 삭제·권한·출처 부재도 첫 읽기 영역에서 구분한다. 판단 사실을 상세의 하위 상세로 숨기지 않는다. C-K·C-P로 종류별 값과 UID를 대조하고 현재 상태와 마지막 종료를 구분한다. 리소스 목록에서 60초·3회 이내에 상태의 이유·현재 한도·최근 변경을 찾는다. 1280·1680, 다크·라이트, 마지막 행까지 스크롤하고 이름·값 전체를 키보드로 읽는다. → 실패: 종류 고유 필드가 빠지거나 삭제·403이 정상 상세로 보이면 실패.
- 추가 조건: 입력 Deployment 세대 8, 관측된 세대 7과 실제 rollout 자료 → 기대 관측된 세대 및 현재 세대와의 차이를 원본 값으로 읽음 → 실패 observedGeneration 생략·세대 동일시·다른 rollout 값 혼합. 공통 판정은 [SCR-RESOURCE-DEPLOYMENT-FACTS](screens/resource-summary.md#SCR-RESOURCE-DEPLOYMENT-FACTS)에 연결한다.
- 추가 조건: 입력 리비전이 다른 StatefulSet과 미배치·사용 불가 노드가 있는 DaemonSet → 기대 StatefulSet의 current/updateRevision·ordinal·PVC, DaemonSet의 노드별 배치·가용 상태를 확인 → 실패 총 Ready만으로 해당 차이와 노드별 문제를 가림. 공통 판정은 [SCR-RESOURCE-SET-FACTS](screens/resource-summary.md#SCR-RESOURCE-SET-FACTS)에 연결한다.
- 현재: apps/wake/pages/resource-detail.js:523은 초기 폭과 fit을 전달한다. 최종 폭 판정은 [RULE-WIDTH](rules.md#RULE-WIDTH). :652는 이미지가 다를 때만 rollout diff를 만든다. :492의 요약 막대는 restarts>2에서 danger다.
- 차이: Restarts 최종 폭은 실제 다크·라이트 렌더 재검증 전이다. 요약 막대의 별도 임계·톤은 [RULE-RESTARTS](rules.md#RULE-RESTARTS)와 다르며 승인 예외 근거가 없다. 설정만 바뀐 rollout diff는 제공되지 않는다. Secret은 data/index.js:25에서 읽기 거절된다.
- 고정 장치: 고정 없음 → T-SRE-08
- 출처: D00079, D00080, D00081, D00082, D00083, D00084, D00085, D00086, D00087, D00088, D00276, D00450, D00451, D00452, D00453, D00454, D00820, D00882, D00883, D00919, D01007. 근거: D00079~D00088, D00276, D00450~D00454, D00820, D00882, D00883, D00919, D01007; U-10~U-25.

- 답 위치·값·출처: `data/kinds.js`의 `KIND_LIST, ROW`, `pages/resource-detail.js`의 `summary, HEAD_FACTS, rolloutTab, runsTab, relations`; Kubernetes 원본과 metrics.usage. 다음 표는 이 질문의 필수 값 계약이다.

| 종류 | 판단에 필요한 원본 필드와 의미 |
|---|---|
| Pod·컨테이너 | `status.phase`, 현재 `state.waiting/running/terminated`, ready, `restartCount`, `lastState.terminated.{reason,exitCode,finishedAt}`, spec 이미지·포트·requests·limits, nodeName, podIP, 생성시각, 소유 UID; 현재 로그와 previous 로그·containerID 구분 |
| Deployment·ReplicaSet | spec.replicas와 ready/available/updatedReplicas, observedGeneration, Conditions reason/message, revision, template 이미지·설정, 소유 관계; Desired와 Ready는 이름 붙은 별도 숫자 |
| StatefulSet·DaemonSet | StatefulSet current/updateRevision·ordinal·PVC, DaemonSet desired/current/ready/available/misscheduled와 노드별 Pod; PVC 실사용은 실제 지표가 있을 때만 |
| Job·CronJob | active/succeeded/failed, completions, startTime/completionTime, Complete·Failed conditions, schedule·timeZone·concurrencyPolicy·suspend·lastScheduleTime·lastSuccessfulTime, 소유 Job·Pod와 해당 시도 로그; 실행 재개와 완료 구별 |
| Node | Ready·MemoryPressure·DiskPressure·PIDPressure·NetworkUnavailable 조건, spec.unschedulable·taints, capacity·allocatable, kubelet 버전·주소, 배치 Pod·실사용·이벤트; Ready와 스케줄 가능은 별도 |
| Service·Ingress | selector·ports·type, EndpointSlice ready와 targetRef UID, Ingress class·host·path·backend·주소·TLS 참조; 서비스별 지표가 없으면 backend 상태와 관계로 판단 |
| PVC | 요청량 `spec.resources.requests.storage`, `status.capacity.storage`, phase·volumeName·storageClassName·accessModes, PV claimRef와 mount Pod, kubelet used/capacity; 요청·할당·실사용은 서로 다른 값 |
| HPA·PDB | scaleTargetRef, min/maxReplicas, current/desiredReplicas, current/target metrics·Conditions; PDB currentHealthy/desiredHealthy/disruptionsAllowed·selector; HPA 지표 없음은 실제 0이 아님 |
| ConfigMap·Event | ConfigMap data 키·binaryData 키·immutable·사용처·resourceVersion·변경 시각; Event reason·message·source·대상 UID·first/last·count/series.count |
| Secret·Certificate | reader의 접근 판정은 [RULE-SECRET](rules.md#RULE-SECRET)를 따른다. 값·raw YAML을 대조 자료에 넣지 않는다. Secret 메타 공급원이 승인·구현되지 않으면 권한 없음/출처 없음이다. 인증서는 승인된 Certificate CRD·만료 지표·Secret 참조로만 판별한다 |
| 나머지 등록 종류 | `KIND_LIST`의 kind마다 ROW 원본 필드·탭·조건·관계·YAML을 대응한다. 없는 CRD와 forbidden을 구별하고 누락 종류를 임의의 Pod 상세로 대체하지 않는다 |

### SRE-Q-18 로그·이벤트: 같은 컨테이너의 그 시점 원문인가

- 목표: 입력: Event UID·발생 시각으로 해당 Pod 컨테이너 로그를 연다 → 기대: 이벤트 행의 UID·대상 UID·발생 시각에서 로그를 열면 동일 Pod·컨테이너·발생 전후 5분으로 이어진다. 기본 로그는 최근 1시간·100줄이고 검색은 읽은 범위를 밝힌다. 원본 줄·시간·수준·생략 수·previous를 유지한다. 행 개수와 발생 횟수는 구분한다. C-E·C-L로 `from/to, Pod UID, containerId, previous, limits, returned/truncated`를 대조한다. 5만 줄 상당 결과는 분할·제한을 표시하고 화면 전체 검색으로 오인시키지 않는다. 로그 있음·없음·보존 만료·권한·단절에서 각각 답을 기록한다. 이벤트 상세에서 30초·2회 이내다. → 실패: 다른 UID·container·구간으로 이동하거나 제한된 발췌를 전체 검색으로 표시하면 실패.
- 현재: 부분, 답 가능성 부분. `incident-hub.cjs:183-190`의 근거는 previous=true·tailLines=200·512KiB 상한이고 일반 로그 기본값과 다른 근거 수집 계약이다. `resource-detail.js:641-642`는 스트림 미확인과 부분 상태를 받는다. 모든 링크에서 UID와 구간이 보존되는 실제 경로는 재검증 전이다.
- 차이: 같은 Pod UID·컨테이너·구간에서 로그와 이벤트 전체 범위를 대조하지 못했다. T-SRE-04, T-SRE-11, T-SRE-15.
- 고정 장치: 고정 없음 → T-SRE-04
- 출처: D00087, D00091, D00093, D00094, D00095, D00096, D00097, D00098, D00099, D00452, D00456. 근거: D00087, D00091, D00093~D00099, D00452, D00456.

- 추가 값 계약: 이벤트 표는 최종 발생·심각도·이유·리소스·반복·처리 상태를 구분하며 기본 50행, 홈·대상 상세의 기본 최근 1시간을 명시한다(D00090). 발생 기록과 Wake 수집→기록→연관 분석→사건 연결 시각을 분리하고, 처리 기록 없음과 연관 없음은 다르다(D00091). 로그는 이전 100줄씩 탐색하며 뷰당 1,000줄 또는 2MiB 먼저 도달한 한도를 적용하고 제거 구간 재조회가 가능해야 한다. Loki는 서버 검색과 시간·스트림 커서, 동일 나노초 경계의 누락/중복 검사를 사용한다. Kubernetes 로그 검색은 읽어 온 범위이며 과거 cursor를 있는 것처럼 표시하지 않고 최근 500/1,000줄 재조회로 제공한다. [RULE-RANGE](rules.md#RULE-RANGE)의 공통 프리셋과 사용자 범위를 제공하되 로그 한 요청 최대 24시간을 유지한다. 최신 따라가기는 명시적으로 켠 경우만, 과거 스크롤 중 새 줄은 배지로 모으며 위치를 이동하지 않는다. 이 전체 경계는 부분 구현·실제 검증 전이며 T-SRE-04·11·15 대상이다.
- 답 위치·값·출처: `events-view.js`, `resource-detail.js` 이벤트·로그, `logs.js`, `log-card.js`, `data/log-excerpt.js`, Kubernetes `/log`, Loki query_range, 허브 Event 이력. 삭제된 Pod의 보존 로그 없음은 장애 당시 오류 없음이 아니다.

### SRE-Q-19 비용: 장애 구간의 비용과 실제 청구를 구별할 수 있는가

- 목표: 입력: 같은 통화·기간의 allocation과 미연결 비용 응답을 번갈아 연다 → 기대: 동일 클러스터·기간·워크로드의 할당 추정액, 유휴·미할당, 통화·가격 기준·수집 범위를 구분한다. 원본이 이름 집계면 이전 UID가 섞일 수 있음을 밝히고 개별 Pod 비용으로 확정하지 않는다. 연결 안 됨을 0원으로 표시하지 않는다. 같은 allocation 원본의 합계와 화면 합계 오차를 통화 반올림 기준으로 대조하고 중복 합산 0이다. 비용 화면에서 30초·2회 이내다. 연결되지 않은 lab에서 정상값을 평가하지 않는다. → 실패: 추정액을 청구액으로 부르거나 미연결을 0원으로 표시하면 실패.
- 현재: apps/wake/desktop/opencost.cjs:69의 project는 비용 응답을 변환하고 :145의 run이 실제 요청을 수행한다.
- 차이: 응답 변환은 있으나 lab2에 OpenCost가 없어서 해당 환경의 청구/배분 값 비교 입력이 없다.
- 고정 장치: 고정 없음 → T-SRE-16
- 출처: D00064, D00066, D00107, D00108, D00109, D00110, D00111, D00115. 근거: D00064, D00066, D00107~D00111, D00115.

- 추가 값 계약: 기간 선택·초기값은 [RULE-RANGE](rules.md#RULE-RANGE)를 따른다. 총 할당 추정액·유휴·이전 같은 기간 변화, 시간별 추세·상위 10 namespace+기타, namespace→workload→Pod 및 별도 Node 보기를 제공한다. 총액/CPU/메모리/저장소/네트워크/비중은 한 allocation 집계에서 계산하고 유휴·미할당을 따로 둔다. 전체값·단위·통화·가격 기준·coverage가 같을 때만 이전 기간과 비교한다. UID 없는 이름 집계는 이전 인스턴스가 섞일 수 있음을 표시한다(D00108~D00111). 현재 전체 실측은 없으며 T-SRE-16에서 확인한다.
- 답 위치·값·출처: `pages/costs.js`, `data/costs.js`, `desktop/opencost.cjs`; 실제 OpenCost allocation 응답, 기간별 합계·namespace·workload·Pod·Node. 실제 청구는 별도 검증된 출처가 있을 때만 표시한다.

### SRE-Q-20 에이전트·접근 범위: 무엇까지 관측 가능한가

- 목표: 입력: agent 미설치·rollout 중·Lease stale·403 상태를 연다 → 기대: 설치·rollout·heartbeat·권한·수집·오래됨을 구분한다. agent가 없어도 kubeconfig로 읽을 수 있는 현재 값을 숨기지 않고, agent가 있다고 수집 전 과거 이력을 만들지 않는다. 권한 부족 시 필요한 읽기와 거절된 범위를 알 수 있어야 한다. C-K·C-S로 DaemonSet desired/ready·실제 imageID·Lease renewTime·노드별 heartbeat·허용 verb를 대조한다. 중단 뒤 stale, 복구 뒤 새 관측을 확인한다. 30초·2회 이내에 관측 가능한 범위와 빠진 출처를 말한다. → 실패: 직접 kubeconfig 읽기를 agent 수집 성공으로 세거나 수집 전 과거값을 만들면 실패.
- 현재: apps/wake/desktop/services.cjs:505는 agent.heartbeat를 agentHeartbeat.read에 연결하고 agent-heartbeat.cjs:53에서 읽는다.
- 차이: 코드 경로는 존재하지만 lab2의 기본 비설치 상태에서는 실제 Lease·수집·권한의 계정별 값을 검증할 수 없다.
- 고정 장치: 고정 없음 → T-SRE-02
- 출처: D00021, D00024, D00649, D00972, D00974, D00987. 근거: D00021, D00024, D00649, D00972, D00974, D00987; `GH:2176`의 에이전트 없는 연결 메트릭 복원 이력.

- 답 위치·값·출처: `agent.js`, `agent-detail.js`, 홈 연결 칩; `data/home.js:105-117`의 `agentState`; DaemonSet·Pod·Lease·RBAC 원본, `agent-heartbeat.cjs`와 실제 연결 정보.

## 정보 품질 기준

### SRE-I-01 정확도와 원본 비교 기준

- 목표: 입력: 독립 reader와 앱에서 같은 UID·질의·구간을 읽는다 → 기대: 앱이 반환한 값을 다시 원본으로 쓰지 않는다. 별도 reader로 원본을 읽고 대상 UID·질의·절대 구간·단위·집계 범위를 먼저 일치시킨다. 정수·문자·상태·UID는 정확히 같아야 한다. 실수는 같은 원본을 앱과 같은 산식으로 계산한 뒤 표시의 마지막 자릿수 반올림만 허용한다. 개수 오차 0, 범주·UID 불일치 0. 소수 d자리 표시면 원시값 허용 오차는 표시 단위의 `0.5×10^-d` 이하이고 최종 표시 문자열은 동일하다. 예를 들어 소수 1자리 %는 0.05%p 이하다. 누락 구간과 다른 timestamp를 오차로 흡수하지 않는다. 동시 수집이 불가능하면 frozen 표본으로 다시 대조하고 현재 값 비교는 미검증으로 남긴다. → 실패: UID·문자열·개수가 다르거나 앱 응답을 독립 원본으로 재사용하면 실패.
- 현재: 부분. `reads/metrics.cjs:113-124`가 query·step·range·fetchedAt을 반환하고 `incident-model.js`가 산식을 가진다. B7의 고정 표본 통과는 대역·렌더 범위이며 신규 native 동시 대조가 아니다.
- 차이: 모든 화면 값의 독립 원본 대조가 없다. T-SRE-01, T-SRE-07, T-SRE-15.
- 고정 장치: `apps/wake/desktop/reads/reads.test.cjs:39` — `metrics.range returns the query, step, range and fetch time with the series`
- 출처: D00114, D00115, D00450, D00987. 근거: D00114, D00115, D00450, D00987.

### SRE-I-02 신선도·수집 범위·시간대

- 목표: → [RULE-STATE](rules.md#RULE-STATE). 관측 요청 시각 observedAt, 응답 receivedAt, 데이터 마지막 성공 lastSuccessAt, 연결 확인 checkedAt, 수집주기 collectionIntervalMs를 구분한다. 연결 probe 성공으로 데이터 신선도를 갱신하지 않는다. 통신 시각은 ISO8601 UTC, 내부 숫자 시각은 해당 계약의 epoch ms·초를 명시하고 화면은 선택 시간대와 연도를 보존한다. 마지막 데이터 성공 유무와 조회 방식에 따른 신선도 판정은 [RULE-STATE](rules.md#RULE-STATE)를 따른다. checkedAt만 바뀐 반례에서 lastSuccessAt 불변; [RULE-TIME](rules.md#RULE-TIME). 고정 과거 범위에서는 수집 구간과 끝값임을 표시한다; 실패: probe 성공으로 관측값 시각이나 stale 상태를 정상으로 바꾸면 실패.
- 현재: 부분. `desktop/reads/source-checks.cjs:1-21`에 계약이 있다. 홈 과거 구간 표기와 stale 값 보존은 구현됐다. 현재 source-checks.cjs:64-85에는 identity 세대 고정·이전 대상 응답 identity_changed 거절이 있어 U3의 수정 코드가 반영되어 있다. 전체 소비 화면 일치와 해당 반례의 현재 native 재검증은 미완료다.
- 차이: 수집 시각 계약의 전체 화면 일치와 실제 공급자 시계 대조가 없다. T-SRE-02, T-SRE-04, T-SRE-15.
- 고정 장치: 고정 없음 → T-SRE-02
- 출처: D-USR-2026-11-16-7; D00451, D00776, D00806. 근거: D00451, D00776, D00806; `kit/CONTRACTS.md:5-7`.

### SRE-I-03 완전성과 7개 화면 상태

- 목표: 입력: 성공 빈 목록·403·부분 수집·보존 만료를 각각 입력한다 → 기대: 아래 상태를 질문의 답과 함께 표시한다. 정상 0은 성공한 전체 응답의 0이며, 실패·보존 만료·부분 수집의 0 대체를 금지한다. 상태 이름은 화면 분류이며 서버 상태 코드와 일대일이라고 가정하지 않는다. 질문에 쓰는 부품마다 아래 7상태의 표시값·상태·재시도·캡처가 존재한다. 상태별 캡처가 없으면 그 상태는 미검증이다. 목록 정상 행과 일부 실패는 함께 남고 개수의 범위를 밝힌다. → 실패: 실패·보존 만료를 정상 0으로 표시하면 실패.
- 현재: 부분. 홈은 읽기별 pending·failures를 갖는다. `incident-detail.js:170-172`는 로딩 상태 아이콘 한 줄, 실패·없음으로만 분기한다. 작업면의 레이아웃 선출력과 부분 실패 구별을 전부 구현한 상태가 아니다. `incident-hub.cjs:156-191` 수집 실패 catch가 null로 빠지는 경로는 실패 조각 누락 위험이다.
- 차이: 인시던트 작업면의 레이아웃 선출력·부분 실패 구별과 7상태 고정이 부족하다. T-SRE-02, T-SRE-07, T-SRE-11.
- 고정 장치: 고정 없음 → T-SRE-11
- 출처: D00017, D00099, D00111, D00454, D00973, D01027, D01031, D01032. 근거: D00017, D00099, D00111, D00454, D00973, D01027, D01031, D01032.

7상태의 입력·표시·금지는 quality.md Q-004의 표를 상속한다. 연결 이력이 있는 도구는 단절만으로 목록에서 제거하지 않으며, 보존 범위 밖은 성공 빈 응답과 구별한다.

### SRE-I-04 대상 일관성과 교체

- 목표: 입력: A UID 읽기를 지연하고 같은 이름 B UID를 연 뒤 A 응답을 반환한다 → 기대: 같은 이름이어도 UID가 바뀌면 별도 대상이다. 요청 시작의 context·resource UID·Service UID·세대를 고정하고 늦은 응답을 새 대상에 붙이지 않는다. 과거 근거는 수집 당시 UID로 유지한다. 데이터가 이름 기준이면 그 제한을 표시한다. A UID 읽기 지연 → 같은 이름 B UID 등록 → A 응답 완료에서 B ready/lastSuccessAt/값 변경 0, 모델에 잘못된 대상 전달 0. 과거 Pod에서 현재 Pod로 이동할 때 대상 교체를 밝힌다. scope·timeline·근거·보고서·AI에서 동일 대상 계약을 확인한다. → 실패: B의 값·로그·준비 상태가 A 응답으로 바뀌면 실패.
- 현재: 부분. 리소스 owner 조회의 UID 시험은 있다. `incident-detect.js:96,119-121`은 이름 key를 사용하고 `incident-hub.cjs:304`는 현재 owner UID를 target에 우선 반영한다. 이 둘은 과거 사건과 새 객체 혼합의 정적 위험이며 실제 재현 전이다. U3의 source UID 문제는 과거 고정본에서 확인된 결함이다. 현재 source-checks.cjs:64-85의 identity 세대와 identity_changed 거절은 수정 코드이며 이번에는 재실행하지 않아 검증됨으로 올리지 않는다.
- 차이: UID 교체 중 읽기 거절은 소스에 있으나 실제 소비 화면의 최신 검증이 없다. T-SRE-04.
- 고정 장치: 고정 없음 → T-SRE-04
- 출처: D00093, D00110, D00114, D00452. 근거: D00093, D00110, D00114, D00452; U3:14-22.

### SRE-I-05 출처와 근거의 불변성

- 목표: 입력: 저장 근거를 다시 읽고 결정 뒤 새 근거를 추가한다 → 기대: 근거 하나는 대상·컨테이너·질의·절대 구간·결과·수집 시각·해시·마스킹·누락을 갖는다. 같은 조각은 같은 번호와 결과를 반환한다. 결정 뒤 추가한 근거는 구분한다. 읽기에 실패한 근거를 AI가 읽었다고 이름표로 강화하지 않는다. `incident-hub.cjs:cite`의 identity와 SHA-256을 저장본과 재조회에서 비교한다. `n:999` 실패 읽기 뒤 `[1]`이 와도 읽은 근거로 만들지 않는다. 근거 이름표는 종류·대상·시각이며 번호만 보이지 않는다. 클릭·Enter·Space가 같은 incident/evidence 경로로 간다; [RULE-EVIDENCE](rules.md#RULE-EVIDENCE); 실패: 같은 근거 번호의 해시가 바뀌거나 추가 근거를 원래 판단 근거로 표시하면 실패.
- 현재: 부분. `cite:110-117`은 불변 identity·hash·addedAfter를 저장한다. B7은 실패 읽기가 refs에 포함되고 `ref.js` 키보드 활성화가 없음을 재현했다. 현재 `ai-run.cjs:155`도 out.error 판정 없이 used에 추가한다. 번호 기반 저장과 이름표 표시는 다른 계약이다.
- 차이: 근거 저장·재열기·원문 도달의 전체 불변성 증거가 없다. T-SRE-10, T-SRE-14.
- 고정 장치: 고정 없음 → T-SRE-10
- 출처: D00734, D00742, D00987. 근거: D00734, D00742, D00987; B7 지적 2·4.

### SRE-I-06 단위·형식·한 셀 한 의미

- 목표: 입력: CPU 0.5core·메모리 1048576byte·재시작 1회를 표에 넣는다 → 기대: CPU cores/m, 메모리 bytes/Mi/Gi, 비율 %와 0~1, 지연 s/ms, 요청률 /s를 혼합하지 않는다; [RULE-RESTARTS](rules.md#RULE-RESTARTS). 종료 사유는 Last State·tooltip에 둔다. 숫자 톤은 [RULE-TONE](rules.md#RULE-TONE), 정렬은 [RULE-SORT](rules.md#RULE-SORT)를 따른다. Restarts `0`, `1 (5m ago)`, 여러 컨테이너 합계와 가장 최근 종료 시각을 대조한다. original count와 1h increase를 같은 열로 바꾸지 않는다. 1280·1680 및 좁은 상세 칸에서 경과 문자열 전체 열람 가능, 상태 사유 혼합 0, 표시 단위의 변환 오차는 SRE-I-01 이하다; 실패: 500m·1Mi 변환이 틀리거나 재시작 숫자에 상태 아이콘을 합치면 실패.
- 현재: Restarts의 현재 폭·톤 근거는 → [RULE-WIDTH](rules.md#RULE-WIDTH), [RULE-RESTARTS](rules.md#RULE-RESTARTS). 비용 align 속성의 효력은 → [RULE-SORT](rules.md#RULE-SORT).
- 차이: Restarts 실제 렌더 재검증 전이다. 공통 셀 규칙의 전 화면 적용 검수는 남아 있다. → [RULE-WIDTH](rules.md#RULE-WIDTH).
- 고정 장치: 고정 없음 → T-SRE-11
- 출처: D-USR-2026-11-16-1; D00451, D00454, D00776, D01033, D01034. 근거: D00451, D00454, D00776, D01033, D01034.

### SRE-I-07 화면 사이의 일관성과 숨김 없는 실패

- 목표: 입력: 동일 scope·구간 결과를 홈·상세·AI·보고서에서 연다 → 기대: 같은 scope·구간의 홈·목록·상세·근거·AI·보고서 숫자는 같은 집계 결과를 사용한다. Event의 행 수와 발생 수, 인시던트 전체 보관 수와 현재 범위 수, Alert firing과 Watchdog 제외 수를 구분한다. 출처 오류는 상세로 이동해도 사라지지 않는다. 같은 조회 결과의 모든 소비 화면 값을 대조표에서 조인해 차이 0을 확인한다. 상세 오류·재시도 누락, 실패 때 도구 칩 소실은 실패다. 같은 UID의 Endpoints 403·열거 전체 실패·hub ready 조합을 각각 검사한다. → 실패: Event 행 수와 count가 같은 이름으로 쓰이거나 상세에서 실패 출처가 사라지면 실패.
- 현재: apps/wake/data/incident-model.js:134는 eventSummary를 만들고 conn-view.js:79~97은 공통 toolViews에 포함·오류·retry를 모은다.
- 차이: 상태 합성은 공통화됐지만 알림 목록의 동점 순서를 고정하는 키가 data/alerts.js:85에 없다.
- 고정 장치: 고정 없음 → T-SRE-02
- 출처: D00091, D00454, D00987, D01000. 근거: D00091, D00454, D00987, D01000; T4 F1·F2.

### SRE-I-08 보안이 제한한 답을 정직하게 표시

- 목표: 입력: Secret이 필요한 질문과 허용된 공개 메타 질문을 실행한다 → 기대: SRE 답을 채우려고 Secret을 읽거나 비밀을 evidence·URL·로그·보고서·모델 입력에 넣지 않는다. 필요한 권한이 없는 질문은 출처와 권한 부족을 답으로 남긴다. 합성 마스킹 시험과 실제 비밀 열람은 구분한다. reader `can-i get/list/watch secrets` 모두 no, 앱 Secret 값·raw YAML·실제 자격 출력 0. 인증서 x09는 지표와 참조만으로 검사한다. 원본을 제한 때문에 못 읽으면 값 정확도 검증은 미검증이며 빈값 성공으로 처리하지 않는다; 실패: Secret 요청이 한 번이라도 나가거나 비밀이 근거·URL·모델 입력에 남으면 실패.
- 현재: 부분. `data/index.js:25`의 Secret 거절, 과거 시험 환경 기록의 reader list 금지 관측이 있다. 과거 D00980의 열린 권한은 최신 D-01 계약을 대신하지 않는다. 모든 외부 경로의 권한·마스킹 재검증은 보안 영역 몫이다.
- 차이: 잔여 Secret 경로와 모든 reader·agent의 실제 권한 대조가 남았다. T-SRE-15.
- 고정 장치: 고정 없음 → T-SRE-15
- 출처: D00980, D00981, D00982, D00987. 근거: D00980~D00982(사용자가 붙여넣은 과거 문제), D00987.

## 원본 대조 명령과 값 추출

다음 명령은 향후 승인된 검수에서 사용할 읽기 템플릿이다. 이번 문서 작성에서 실행한 명령이 아니다. `SRE_KUBECONFIG`는 테스트 reader kubeconfig, `SRE_CONTEXT`는 등록 context ID다. `SRE_NS, SRE_KIND, SRE_NAME, SRE_UID, SRE_CONTAINER, SRE_FROM, SRE_TO`는 화면에서 고정한 대상·절대 시각이다. 전역 기본 kubeconfig를 사용하지 않는다. 인증이 필요한 HTTP는 값이 출력되지 않는 0600 curl 설정 파일 `SRE_CURL_CONFIG`를 사용하고 URL에 토큰을 넣지 않는다. API 주소는 승인된 discovery의 Service UID·port로 구한 loopback 포워드 주소다.

### C-K Kubernetes 객체와 건강

- 목표: 입력: kubectl get의 metadata.uid·status.conditions 원본을 독립 reader로 읽는다 → 기대: Kubernetes 객체·UID·조건·RBAC 원본을 별도 reader로 읽어 Q-003의 동일 대상·시각 계약으로 대조한다. 아래 명령의 실패·빈 결과·누락을 구별한다. → 실패: UID·조건 누락을 정상 객체로 표시하면 실패.
- 현재: apps/wake/desktop/services.cjs:414의 kube.list handler가 Kubernetes 객체 목록 읽기를 제공한다.
- 차이: 목록 handler는 독립 kubectl 원본과 동일 UID·시각의 필드별 비교를 수행하지 않는다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00458, D00987.

```sh
kubectl --kubeconfig "$SRE_KUBECONFIG" --context "$SRE_CONTEXT" -n "$SRE_NS" get "$SRE_KIND" "$SRE_NAME" -o json
kubectl --kubeconfig "$SRE_KUBECONFIG" --context "$SRE_CONTEXT" -n "$SRE_NS" get pods,replicasets,deployments,statefulsets,daemonsets,jobs,cronjobs -o json
kubectl --kubeconfig "$SRE_KUBECONFIG" --context "$SRE_CONTEXT" get nodes -o json
kubectl --kubeconfig "$SRE_KUBECONFIG" --context "$SRE_CONTEXT" -n "$SRE_NS" get services,endpointslices,ingresses,persistentvolumeclaims,horizontalpodautoscalers,poddisruptionbudgets -o json
```

객체 JSON에서는 필요한 metadata.uid/resourceVersion, spec의 비밀 아닌 판단 필드, status만 마스킹 뒤 저장한다. ConfigMap·Pod env·annotation 원문을 무심코 보고서에 붙이지 않는다. `SRE_KIND=secrets`는 이 템플릿에서 허용하지 않는다. RBAC는 읽기 시도 대신 다음으로 확인한다.

```sh
kubectl --kubeconfig "$SRE_KUBECONFIG" --context "$SRE_CONTEXT" auth can-i get secrets --all-namespaces
kubectl --kubeconfig "$SRE_KUBECONFIG" --context "$SRE_CONTEXT" auth can-i list secrets --all-namespaces
kubectl --kubeconfig "$SRE_KUBECONFIG" --context "$SRE_CONTEXT" auth can-i watch secrets --all-namespaces
```

### C-E Event 원문

- 목표: 입력: Event metadata.uid·series.count·lastTimestamp 원본을 독립 reader로 읽는다 → 기대: Event UID·최초/최종 시각·count 원본을 별도 reader로 읽어 Q-003의 동일 대상·시각 계약으로 대조한다. 아래 명령의 실패·빈 결과·누락을 구별한다. → 실패: Event 행 수를 발생 횟수로 대체하면 실패.
- 현재: apps/wake/desktop/reads/events.cjs:19의 changedEvents는 UID별 known의 lastAt·count와 새 Event의 lastAt·series.count/count를 비교한다. :14의 slim은 resourceVersion을 버리고 :35–38에서 축약한 행을 비교·보관한다. :42의 read는 보관분과 지금 읽은 이벤트를 UID로 병합해 반환한다.
- 차이: resourceVersion은 보존되지 않아 UID·lastAt·count가 같고 resourceVersion만 달라진 Event는 새 행으로 저장되지 않는다. count 변화는 version 비교 없이 저장한다. CON-007과 같이 동일 시점의 원문/버전 대조는 별도 reader 근거가 필요하다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00458, D00987.

```sh
kubectl --kubeconfig "$SRE_KUBECONFIG" --context "$SRE_CONTEXT" -n "$SRE_NS" get events --field-selector "involvedObject.uid=$SRE_UID" -o json
```

`metadata.uid`로 중복 제거하고 `series.lastObservedTime → lastTimestamp → eventTime → creationTimestamp`와 `series.count → count`를 비교한다. 서로 다른 Event를 대상·Reason으로 합친 행의 count 합계와 Event UID별 원본 발생 수를 함께 기록한다. events.k8s.io 원본이면 regarding·deprecatedCount 등의 실제 경로를 기록한다. API TTL로 사라진 과거 Event는 hub 7일 이력과 수집 당시 스냅샷을 대조하며 현재 API 0개와 섞지 않는다.

### C-P Prometheus

- 목표: 입력: Prometheus query_range의 query·start·end·step 원본을 독립 reader로 읽는다 → 기대: Prometheus의 같은 query·timestamp·step 원본을 별도 reader로 읽어 Q-003의 동일 대상·시각 계약으로 대조한다. 아래 명령의 실패·빈 결과·누락을 구별한다. → 실패: 다른 step·구간 시리즈를 동일 표본으로 비교하면 실패.
- 현재: apps/wake/desktop/reads/metrics.cjs:111의 createMetrics와 range 경로가 query·range·step·fetchedAt을 반환한다.
- 차이: 원본 Prometheus API를 별도로 조회해 표시 반올림 공차까지 판정하는 코드는 range에 없다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00458, D00987.

```sh
curl --silent --show-error --fail --config "$SRE_CURL_CONFIG" --get "$SRE_PROM_URL/api/v1/query_range" --data-urlencode "query=$SRE_PROMQL" --data-urlencode "start=$SRE_FROM_SECONDS" --data-urlencode "end=$SRE_TO_SECONDS" --data-urlencode "step=$SRE_STEP_SECONDS"
```

`SRE_PROMQL`은 `reads/metrics.cjs:19-45`의 실제 seriesQuery 결과 또는 근거에 저장된 query를 사용한다. `data.result[].metric` 라벨과 `[seconds,stringValue]`를 같은 순서·단위로 대조한다. query_range 결과가 빈 것은 연결 성공과 별개의 상태다. 주요 질문에 쓰는 질의는 다음과 같다.

| 값 ID | 질의·계산 | 단위 |
|---|---|---|
| cluster.cpu | `100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))` | % |
| cluster.mem | `100 * (1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))` | % |
| cluster.err | `100 * sum(rate(nginx_ingress_controller_requests{status=~"5.."}[5m])) / sum(rate(nginx_ingress_controller_requests[5m]))` | % |
| cluster.rps | `sum(rate(nginx_ingress_controller_requests[5m]))` | /s |
| ingress.err | 위 오류율의 분자·분모에 동일 `namespace,ingress` selector 적용 | % |
| ingress.p95 | `histogram_quantile(0.95, sum by (le) (rate(nginx_ingress_controller_request_duration_seconds_bucket{namespace="<ns>",ingress="<name>"}[5m])))` | s |
| container.mem | `sum(container_memory_working_set_bytes{namespace="<ns>",pod="<pod>",container="<container>"})` | bytes |
| pod.restarts1h | `sum(increase(kube_pod_container_status_restarts_total{namespace="<ns>",pod="<pod>"}[1h]))` | 기간 내 증가량; restartCount 누계와 별도 |
| pvc.used | `100 * max(kubelet_volume_stats_used_bytes{namespace="<ns>",persistentvolumeclaim="<pvc>"} / kubelet_volume_stats_capacity_bytes{namespace="<ns>",persistentvolumeclaim="<pvc>"})` | % |

### C-L 컨테이너 로그와 Loki

- 목표: 입력: Pod UID·container·previous·from/to의 로그 원본을 독립 reader로 읽는다 → 기대: 같은 Pod UID·컨테이너·시간 구간의 로그 원문을 별도 reader로 읽어 Q-003의 동일 대상·시각 계약으로 대조한다. 아래 명령의 실패·빈 결과·누락을 구별한다. → 실패: 다른 컨테이너·구간 로그를 같은 근거로 연결하면 실패.
- 현재: apps/wake/desktop/pod-logs.cjs:46의 readPodLogWindow와 :90의 readLokiPodLogWindow가 각 로그 공급원을 읽는다.
- 차이: 서로 다른 공급원의 timestamp+원문 hash 집합을 동일 Pod UID·컨테이너·구간으로 비교하는 통합 검사는 없다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00458, D00987.

```sh
kubectl --kubeconfig "$SRE_KUBECONFIG" --context "$SRE_CONTEXT" -n "$SRE_NS" logs "$SRE_POD" -c "$SRE_CONTAINER" --timestamps --since-time "$SRE_FROM" --tail=100
curl --silent --show-error --fail --config "$SRE_CURL_CONFIG" --get "$SRE_LOKI_URL/loki/api/v1/query_range" --data-urlencode "query=$SRE_LOGQL" --data-urlencode "start=$SRE_FROM_NS" --data-urlencode "end=$SRE_TO_NS" --data-urlencode "limit=$SRE_LOG_LIMIT" --data-urlencode 'direction=forward'
```

previous 근거는 kubectl에 `--previous --tail=200 --limit-bytes=524288`을 적용하고 원본 Pod UID·lastState·containerID와 함께 대조한다. kubectl은 종료 구간·페이지 커서를 제공하는 Loki와 같지 않으므로 반환 줄을 SRE_TO로 거르고 범위를 기록한다. Loki selector는 실제 labels로 고정하며 namespace·pod·container를 생략하지 않는다. 문자열 검색 결과와 전체 구간 수준별 수는 각각 query_range와 count_over_time의 독립 결과다.

### C-A 알림과 규칙

- 목표: 입력: Alertmanager fingerprint·startsAt·status와 Prometheus rules 원본을 독립 reader로 읽는다 → 기대: Alertmanager·규칙·알림 이력 원본을 별도 reader로 읽어 Q-003의 동일 대상·시각 계약으로 대조한다. 아래 명령의 실패·빈 결과·누락을 구별한다. → 실패: Watchdog를 장애 수에 포함하면 실패.
- 현재: apps/wake/desktop/reads/alerts.cjs:36의 read가 Alertmanager를 읽고 :45의 expr가 Prometheus 규칙 식을 조회한다.
- 차이: 알림·규칙 식의 동시 원본 일치와 목록 안정 정렬을 한 실행에서 판정하지 않는다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00458, D00987.

```sh
curl --silent --show-error --fail --config "$SRE_CURL_CONFIG" "$SRE_AM_URL/api/v2/alerts"
curl --silent --show-error --fail --config "$SRE_CURL_CONFIG" "$SRE_PROM_URL/api/v1/rules"
```

fingerprint와 labels의 alertname·대상·severity를 고정하고 rule group/name을 정확히 하나 찾는다. active·suppressed 및 Prometheus pending/firing을 한 상태로 합치지 않는다. resolved 과거 이력은 허브 저장본과 마지막 관측 시각을 비교한다. Watchdog 제외는 장애 목록에만 적용하며 수신 건강 확인 근거는 남긴다.

### C-G GitOps와 실제 변경

- 목표: 입력: Git SHA·Argo revision·Deployment observedGeneration 원본을 독립 reader로 읽는다 → 기대: Git·컨트롤러 revision·실제 rollout을 별도 reader로 읽어 Q-003의 동일 대상·시각 계약으로 대조한다. 아래 명령의 실패·빈 결과·누락을 구별한다. → 실패: 승인 기록만으로 rollout 완료 처리하면 실패.
- 현재: apps/wake/desktop/gitops-deployment.cjs:10의 argoDeployment는 컨트롤러 operation·revision을 변환한다.
- 차이: 변환된 revision과 Git 서버의 실제 base/head·merge 결과를 비교하는 실행 단계는 이 변환기에 없다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00458, D00987.

```sh
kubectl --kubeconfig "$SRE_KUBECONFIG" --context "$SRE_CONTEXT" -n "$SRE_ARGO_NS" get applications.argoproj.io "$SRE_APP" -o json
```

`metadata.uid`, `spec.source.repoURL/path/targetRevision`, `spec.syncPolicy`, `status.sync.status/revision`, `status.health.status`, `status.operationState.{phase,message,startedAt,finishedAt,syncResult}`, `status.history`, `status.resources`를 비교한다. repoURL에 자격이 있으면 제거한다. Git 서버의 읽기 API에서 실제 commit SHA·PR 번호·리뷰·merge SHA를 확인한다. 현재 GitOps 읽기와 Draft PR 쓰기 미구현은 구분한다. Flux는 해당 CRD의 conditions·observedGeneration·artifact/revision으로 별도 판정하며 Argo 원본으로 대체하지 않는다.

### C-H 허브 기록과 보고서

- 목표: 입력: incident·audit·evidence의 ID·hash 원본을 독립 reader로 읽는다 → 기대: 허브 인시던트·감사·근거·보고서 원본을 별도 reader로 읽어 Q-003의 동일 대상·시각 계약으로 대조한다. 아래 명령의 실패·빈 결과·누락을 구별한다. → 실패: 다른 incident의 근거를 같은 번호로 연결하면 실패.
- 현재: apps/wake/desktop/incident-hub.cjs:110~117의 cite는 identity·결과 hash·addedAfter를 저장한다.
- 차이: 저장 근거 해시와 내보낸 보고서의 최종 값·시각을 다시 비교하는 원본 검사기는 cite에 없다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00458, D00987.

허브 도구 `get_incident, get_evidence, query_audit` 및 화면의 `incident.workspace, audit.query` 응답과 격리 userData의 `hub` 저장 원본을 독립 비교한다. 실제 등록 도구 이름·인자는 `desktop/hub-tools.cjs`를 따른다. 임의의 report IPC를 만들지 않는다. docs incidents·approvals와 log evidence·audit에서 동일 id를 고르고, 민감한 대화·args 원문 대신 비교에 필요한 마스킹 필드·해시를 남긴다. 근거 `hash`는 수집 결과의 JSON 직렬화 SHA-256이다. 마스킹 전·후 해시를 혼동하지 않는다. 파일 전체를 채팅·공개 문서에 출력하지 않는다.

### C-S 출처와 연결

- 목표: 입력: hub.sources의 target·lastSuccessAt·state 원본을 독립 reader로 읽는다 → 기대: 출처 상태·연결과 데이터 읽기의 구별을 별도 reader로 읽어 Q-003의 동일 대상·시각 계약으로 대조한다. 아래 명령의 실패·빈 결과·누락을 구별한다. → 실패: probe 성공으로 오래된 관측을 정상으로 변경하면 실패.
- 현재: apps/wake/desktop/reads/source-checks.cjs:136~138의 state는 target UID·관측 시각·coverage·retention을 반환한다.
- 차이: 출처 상태 형식은 있으나 실제 Service UID와 소비 화면의 같은 시점 값을 별도로 대조하는 과정은 포함하지 않는다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00458, D00987.

화면 `data.get('sourceStates')`, `clusterTools`, `toolChecks`, `agent`의 원본을 `hub.sources, tools.find, tool.checks, agent.status, agent.heartbeat` 및 독립 Service·Endpoints·Lease 조회와 비교한다. Service UID·연결 근거·hub 데이터 건강·현재 열기 가능 여부를 별도 열에 기록한다. 같은 UID의 부분 Endpoints 실패와 성공한 빈 Service 목록, 교체된 Service UID를 구분한다. 연결 probe 응답과 실제 지표·로그 성공은 다른 증거다.

## 검수 절차와 판정

### SRE-V-01 증거의 정체와 독립 대조

- 목표: 입력: 동일 빌드·UID·기간의 두 독립 검수 결과를 수집한다 → 기대: 같은 빌드·실행 대상·데이터 구간을 고정하고 독립 검토자 둘이 각각 SRE 질문에 답한다. 코드 검토, 계약 시험, 브라우저 fixture, Electron 실제 출처, 시나리오 실행을 별도 증거로 기록한다. 앞 단계 PASS가 뒤 단계를 대신하지 않는다. 검수 시작 전에 checkout 경로, 변경 파일 해시, 실행 앱 경로, PID, userData, reader kubeconfig의 경로와 대상 cluster UID, CDP 소유 포트, 빌드 시각을 기록한다. 비밀 값은 기록하지 않는다. 각 캡처에 실제 route, 대상 UID, theme, viewport, 구간, 촬영 시각을 결합한다. 네트워크 캡처에 홈이 보이면 실패다. 빈 원본을 정상 원본으로 통과시키지 않는다. 원본 수집 실패·응답 없음·빈 성공·권한 없음은 서로 다른 결과다. → 실패: fixture PASS를 Electron·실원본 PASS로 올려 적으면 실패.
- 현재: 빈 D6·route 미검증을 거절하고 apps/wake/desktop/reads/source-checks.cjs:82는 identity_changed를 반환한다.
- 차이: 정적 방어는 반영됐지만 증거 수집기 자체의 PID·userData·UID 진실성까지 독립 재조회하지 않는다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00142, D00436, D00785, D00786, D00960, D00975, D00988. 근거: D00142, D00436, D00785, D00786, D00960, D00975, D00988; 실제 SRE 검수 원칙; 요청 K.

### SRE-V-02 시작·중단·복구 조건

- 목표: 입력: 전용 시험 클러스터의 reader·Healthy·복원 통로를 확인한다 → 기대: 승인된 테스트 클러스터만 사용하고 실제 사용자의 클러스터·userData·프로세스에 섞지 않는다. 문서 작성은 장애 주입 재개 승인이 아니다. 한 시나리오의 원상복구가 실패하면 다음 시나리오를 시작하지 않는다. 시작 전 지정 reader로 Secret 읽기 거부, 필수 Apps Synced·Healthy, 필요한 지표와 로그의 실제 샘플, conflicts의 다른 실행 부재를 확인한다. 작업 자리와 포트 소유권을 확보한다. heavy.lock은 하나이며 시나리오를 병렬 실행하지 않는다(x10의 정의된 조합만 예외). 시나리오 시작 부하는 1분 평균 20 이하, 성능 기준 측정은 10 이하를 별도로 요구한다. 부하 초과·출처 실패·정체 불일치는 미실행/무효로 기록한다. 테스트 Electron은 별도 `--user-data-dir`와 승인된 reader를 쓰며 기본 `~/.kube/config`를 사용하지 않는다. 자리의 9401–9409 또는 9411–9419 중 소유한 포트만 사용하고 10분 자리 조건과 시나리오의 긴 관찰을 사전 조율한다. → 실패: 복원 실패 뒤 다음 시나리오를 시작하거나 사용자 프로필을 사용하면 실패.
- 현재: opt-in 없으면 dry-run, :49는 pre 실패 중단, :43~45는 restore와 복원 확인을 수행한다.
- 차이: 스크립트 승인 변수 외에 통합 검수의 재개 신호와 소유 인수 기록을 자동 검증하지 않는다.
- 고정 장치: 고정 없음 → T-SRE-12
- 출처: D00960, D01037, D01045. 근거: D00960, D01037, D01045.

- 실행·복구 계약:, 는 설계 점검용 DRY-RUN이다. 실제 변경은 별도 실행 승인과 `WAKE_LAB2_GO=1`이 모두 있어야 한다. sync 대행에는 `WAKE_SYNC_APPROVED=1`의 선행 승인도 필요하다. `--no-restore`는 장애를 남기므로 인계 대상·복구 담당·시한이 기록된 경우만 사용한다. receipt에 변경 전 namespace/kind/name/UID/resourceVersion/base SHA/spec를 남기고, 원본 복구와 restore checks 및 사용자 영향 회복을 확인한다. 시나리오의 Gitea 접속값·환경 파일 값은 출력하지 않는다. 실패 복구도 기록을 남기고 진행을 중단한다.

### SRE-V-03 질문별 기록과 합격·실패

- 목표: 입력: 검수자가 화면에서 답을 적은 뒤 독립 원본과 대조한다 → 기대: 검수자는 화면에서 답을 먼저 기록한 뒤 독립 원본과 비교한다. 구현 설명을 읽고 답을 보충하지 않는다. 답이 없는 상태를 정확히 알린 경우와 필요한 답을 제공한 경우를 나눠 판정한다. 기록 한 행은 아래 필드를 모두 갖는다. 질문의 원본 일치·대상·시각·출처·완전성·독립 재현이 충족되면 정보 PASS, 하나라도 잘못되면 FAIL이다. 답이 정확히 '모름/연결 안 됨'이면 정직성은 PASS 가능하나 업무 질문 완수는 부분/불가다. 미실행·선행 조건 불충족은 BLOCKED/NOT-RUN이며 PASS 수에 넣지 않는다. 시간·행동 목표 초과는 탐색 FAIL로 별도 표시한다. → 실패: 구현 설명으로 빠진 답을 보충하거나 source·UID 누락을 PASS로 세면 실패.
- 현재: result.json은 scenario·dir·status·loadAtEnd를 기록한다.
- 차이: 결과 스키마에 SRE 질문별 답·시간·클릭 수·동시 원본 값이 없다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00066, D00742, D00785, D00786, D00987, D01050, D01051. 근거: D00066, D00742, D00785, D00786, D00987, D01050, D01051; 요청 K.

| 필드 | 필수 값 |
|---|---|
| 실행 정체 | run ID, source hash, app path/PID/userData, scenario, phase(pre/trigger/restore), theme, viewport, route |
| 질문 정체 | SRE-Q ID, 시작 화면, cluster/namespace/kind/name/UID, container, from/to/timezone |
| 답 | 화면에 보이는 원문 답, 현재/과거/고정 근거 구분, 답 가능성(가능/부분/불가), 숨겨진 실패 유무 |
| 비용 | startedAt, answeredAt, elapsedMs, clickCount, keyboardActivationCount, scrollCount, searchCount, waitMs |
| 대조 | 비교 명령·query, 원본 수집 시각·수집 성공 여부, sourceState, coverage, 원본 값, 화면 값, 허용 오차, 실제 차이 |
| 근거 | 화면 캡처, 필요한 아래쪽 캡처, 마스킹한 원본 파일, 해시, 관련 계약 시험명 |
| 판정 | 정보 PASS/FAIL, 탐색 PASS/FAIL, major/minor, 혼동의 문장·위치, T-SRE ID, 독립 검수자 판정 |

- 시나리오 전체 통과: pre·trigger·restore 원본 검사가 모두 통과하고 연결된 필수 질문의 정보 FAIL이 0이며, 실제 실행·복구를 허위로 표시한 곳이 0이어야 한다. major 0만 묶음 검토의 PASS 조건이며 minor는 지우지 않고 작업·소유자·영향과 함께 남긴다. 질문 전체가 미실행이면 major 0이어도 PASS가 아니다. 중간 머지 PASS와 제품 완성은 별개다. 기능 부재를 명시해도 해당 기능 판정 기준은 통과하지 않는다.

### SRE-V-04 화면·키보드·스크롤과 반복 검수

- 목표: 입력: 두 테마·두 폭에서 첫 화면·펼친 영역·마지막 행을 읽는다 → 기대: 정보가 있는 화면의 처음부터 끝까지 검수한다. 어두운 화면과 밝은 화면, 폭 1280과 1680의 네 조합에서 같은 질문에 답할 수 있어야 한다. 좁은 폭 결함을 넓은 화면 PASS로 덮지 않는다. 각 질문의 첫 화면·필요한 펼침·마지막 행을 캡처한다. 문서/칸의 세로 스크롤이 필요한 행에 도달하고 원치 않는 이중 스크롤이 없는지 확인한다. 탭은 가로 스크롤 없이 더보기에서 모든 탭으로 접근한다. 실제 긴 값으로 Restarts·UID·근거 이름을 확인한다. B7 재현 폭 760도 해당 회귀의 추가 입력으로 유지한다. 근거 이름표는 클릭과 Tab→Enter/Space가 같은 대상으로 이동해야 한다. Escape·뒤로·목록 복귀 시 대상과 필터가 보존되어야 한다. 메뉴를 닫은 뒤 hover 잔상이 없어야 하며 상태 아이콘과 숫자는 한 셀에서 섞지 않는다. → 실패: 좁은 폭의 잘림·키보드 목적지 누락을 넓은 폭 PASS로 덮으면 실패.
- 현재: Restarts 폭의 현재 근거는 → [RULE-WIDTH](rules.md#RULE-WIDTH). ref.js의 키보드 활성화 여부는 별도 대조한다.
- 차이: Restarts는 실제 렌더 재검증 전이다. ref의 키보드 활성화 공백은 남는다. → [RULE-WIDTH](rules.md#RULE-WIDTH).
- 고정 장치: `kit/tools/check-layout.mjs:79~104` — 짧은 창에서 최하단 요소 조상의 스크롤 이동 검사
- 출처: D00464, D00465, D00785, D00786, D00975, D01029, D01030, D01033, D01034. 근거: D00464, D00465, D00785, D00786, D00975, D01029, D01030, D01033, D01034; 옛 화면 규칙 점검 절; B7 minor 2·3.

### SRE-V-05 독립 판정과 사용자 검수 보고

- 목표: 입력: 두 검수자가 같은 고정본으로 각자 결과를 작성한다 → 기대: 두 검수자는 같은 고정본과 원본 묶음으로 각각 답·오류·심각도를 기록한 뒤 대조한다. 첫 검수자의 결론을 두 번째 검수자의 결과로 복사하지 않는다. 의견 차이는 원본과 재현으로 해결하고 해결되지 않은 major는 열린 채로 둔다. major는 SRE의 원인·영향·조치·복구 판단을 오도하거나 대상/데이터를 바꾸거나 실패를 숨기거나 검사가 그 회귀를 놓치는 경우다. 문장 길이·정렬 등의 minor도 읽을 수 있는 정보가 사라지거나 의미가 바뀌면 major가 된다. 보고는 아래 형식의 실제 측정값을 넣고 미실행은 명시한다. 비밀 값·시험 접속값·실제 대화 전체를 넣지 않는다. → 실패: 열린 major를 합의 문장만으로 닫거나 다른 검수자의 답을 복사하면 실패.
- 현재: bundleProblems는 한 실행 묶음을 검사하며 :658은 U-01만 지원한다.
- 차이: 묶음 유효성으로 검토자별 major·minor의 독립 판정이나 제품 전체 합격을 자동 계산하지 않는다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00785, D00786, D00960, D00988. 근거: D00785, D00786, D00960, D00988; 요청 K 독립 검토자 둘이 각각 SRE 관점으로 판정.

```text
대상: [작업 트리/고정본 해시], [실제 앱·클러스터 범위], [절대 시각]
실행: 20개 중 실행 N, 통과 N, 실패 N, 차단 N, 미실행 N
질문: Q별 답 가능성/정보 판정/탐색 판정, 최대 소요 시간·행동 수
지금 당번이 답할 수 있는 것: [질문 ID와 실제 답 위치]
잘못 판단할 위험: [major ID, 관측 답, 원본, 영향, 재현]
복구: [trigger/restore, 남은 객체, 실제 영향 회복, 관찰 기간]
두 검수 결과: [각 major/minor 및 남은 의견 차이]
남은 일: [T-SRE ID, 파일, 고정 장치, 선행 작업]
사용자 검수 동선: [시작 화면 → 질문 → 근거], [캡처·마스킹 원본]
```

## 20개 시나리오와 SRE 질문 대응

아래 `현재 기대`는 기존 expect.json이 기술한 현재 코드 동작이며 제품의 합격 기준과 같지 않을 수 있다. P1~P7을 재현한 것을 해결 PASS로 세지 않는다. 각 항목의 판정 기준은 해당 expect의 모든 pre·trigger·restore checks와 아래 추가 SRE 질문을 함께 적용한다. `within`은 원본의 초 단위 마감이며 수집기는 30초 간격으로 다시 읽는다. 현재 체크에 `// 0`이 있더라도 Prometheus 빈 성공 응답·통신 실패를 복구 0으로 간주하지 않는다. 먼저 대상 시리즈의 존재·시각·coverage를 검사한다. 새롭게 발견한 이 검수 공백은 T-SRE-17에서 고정한다.

공통 출처는 D00960·D01037과 과거 L1·U-45~52 계획이다. 각 시나리오의 질문 시간·행동 수는 SRE-Q 기준을 적용한다. 시나리오 자체의 복구·관찰 시간과 합치지 않는다. 아래 모든 시나리오는 설계와 현재 코드의 비교이며 문서 검수에서 실제로 돌리지 않았다.

### SRE-L-COMMON 질문별 시나리오 판정

- 목표: 입력: Q-S01~20의 동일 실행을 질문별 답과 연결한다 → 기대: Q-S-COMMON의 동일 실행을 SRE 질문으로 읽고, 아래 고유 제품·복구 기대를 판정한다. 시나리오별 수치·건수·분류는 (기본값 채택, 번복 가능)이다. → 실패: 환경 스크립트 PASS만으로 사용자 영향·복구 답을 통과시키면 실패.
- 현재: apps/wake/data/incident-detect.js:113은 신호를 사건으로 묶고 incident-model.js:183은 관찰 창으로 verifyVerdict를 계산한다.
- 차이: 20시나리오별 실제 trigger·화면 값·독립 원본·restore 판정을 이 두 순수 함수가 통합하지 않는다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D-USR-2026-11-16-7; D00960, D01037.

| 규칙 ID·시나리오 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SRE-L-01"></a>SRE-L-01 s1-oom: s1 OOMKilled와 한도·실제 메모리 근거 | 입력: payments/checkout-api 컨테이너가 메모리 한도(128Mi)를 넘는 실제 메모리 부하(podinfo --stress-memory=200)로 OOMKilled 뒤 재시작을 반복한다 → 기대: Deployment payments/checkout-api 한 건, oom-limit, critical. 같은 owner의 OOMKilled·CrashLoopBackOff·알림을 중복 사건으로 만들지 않는다. 이전 컨테이너 종료 reason·exitCode·restart 시각, 실제 memory/limit, 이전 로그가 원인 근거다. 정상 Pod가 남았다는 사실만으로 영향 0을 단정하지 않는다. receipt의 설정·Git revision을 복원하고 rollout 완료, 재시작 증가 없음, 알림 해소와 사용자 오류율 회복을 확인한다. Pod 교체 뒤 옛 UID 근거를 새 Pod 현재 상태로 표시하지 않는다. → 실패: Deployment payments/checkout-api 한 건, oom-limit, critical 조건과 원본 값·대상이 다르면 실패 | apps/wake/data/incident-detect.js:14~16은 OOMKilled와 CrashLoopBackOff 신호를 정의하며 :38의 ownerChain으로 소유 대상을 찾는다. | 원인·복구 계산은 incident-model에 일부 구현. 실제 승인→실행은 P6와 별개. T-SRE-04, T-SRE-05, T-SRE-07.  | 고정 없음 → T-SRE-15 | SRE-Q-03, SRE-Q-04, SRE-Q-05, SRE-Q-06, SRE-Q-09, SRE-Q-10, SRE-Q-11, SRE-Q-12, SRE-Q-13, SRE-Q-17, SRE-Q-18. D00960, D01037. |
| <a id="SRE-L-02"></a>SRE-L-02 s2-bad-image: s2 존재하지 않는 이미지와 복구 revision | 입력: orders/inventory-worker 이미지를 없는 태그(redis:7.4.1-wake-missing)로 바꾼 커밋을 시험 가지 wake-test/s2-bad-image에 만들고, orders Application을 그 가지로 사람 승인 sync 한다 → 기대: orders/inventory-worker의 ErrImagePull/ImagePullBackOff와 Failed·BackOff 메시지의 이미지 태그가 일치해야 한다. 현재 expect의 warning/crash-loop 1건은 P2 재현이며 정답이 아니다. 새 이미지 취득 실패와 실행 후 프로세스 실패를 구분한다. 기존 정상 Pod와 실패 revision의 서비스 영향도 구분한다. 원래 targetRevision과 이미지로 복원하고 updatedReplicas=availableReplicas=spec.replicas 및 Argo Synced·Healthy를 확인한다. 이름이 같아도 새 UID를 대조한다. → 실패: orders/inventory-worker의 ErrImagePull/ImagePullBackOff와 Failed·BackOff 메시지의 이미지 태그가 일치해야 한다 조건과 원본 값·대상이 다르면 실패 | apps/wake/data/incident-detect.js:17은 BackOff를 crash-loop로 분류한다. SIGNALS에는 ErrImagePull·ImagePullBackOff 전용 항목이 없다. | P2 미해결: SIGNALS에 ImagePull 전용 규칙 없음. 분류·심각도 최종 계약과 시험 필요. T-SRE-08, T-SRE-04.  | 고정 없음 → T-SRE-15 | SRE-Q-03, SRE-Q-05, SRE-Q-06, SRE-Q-09, SRE-Q-10, SRE-Q-12, SRE-Q-17, SRE-Q-18. D00960, D01037. |
| <a id="SRE-L-03"></a>SRE-L-03 s3-5xx: s3 5xx 상승과 원인 근거 부족 | 입력: loadgen namespace에 시한 Job(15분, 초당 2회)을 만들어 checkout-api Ingress의 /status/500 경로로 실제 요청을 보낸다 → 기대: Ingress payments/checkout-api critical alert 1건. 5xx 비율 >5%와 해당 ingress 라벨·500 로그가 같은 시간에 있어야 한다. UI는 요청 실패 증가를 말하되 이 근거만으로 메모리·배포 원인을 만들어 내지 않는다. 시한 Job 종료·제거를 확인하고 대상 요청 시리즈가 실제 존재한 상태에서 5xx<1%, 알림 해소, 복구 관찰 창 통과를 확인한다. → 실패: Ingress payments/checkout-api critical alert 1건 조건과 원본 값·대상이 다르면 실패 | apps/wake/data/incident-detect.js:65는 ingress 라벨을 Ingress 대상으로 만들고 apps/wake/data/incident-model.js:45~48은 구간 coverage를 확대하여 영향 요청 수를 계산한다. | 원인 미확인 표기는 필요. 표본 공백 전체창 확대 추정 문제는 SRE-R-03. T-SRE-07.  | 고정 없음 → T-SRE-15 | SRE-Q-02, SRE-Q-04, SRE-Q-05, SRE-Q-07, SRE-Q-12, SRE-Q-13, SRE-Q-18. D00960, D01037. |
| <a id="SRE-L-04"></a>SRE-L-04 s4-pending-cpu: s4 CPU 부족 Pending 배치 | 입력: orders/ledger-reconcile CronJob에서 시험 Job을 만들되 requests.cpu를 Node 최대 allocatable(9500m)보다 큰 12로 둔다 → 기대: FailedScheduling 메시지 Insufficient cpu, Pending Pod, Job→CronJob orders/ledger-reconcile 소유 관계로 warning unschedulable 1건. 노드 CPU 사용률과 스케줄러 request/allocatable 부족을 혼동하지 않는다. 과도 request를 원상복구하고 재실행 Job succeeded=1, 완료 로그·작업 항목 결과를 확인한다. Pod Ready만으로 배치 성공을 판단하지 않는다. → 실패: FailedScheduling 메시지 Insufficient cpu, Pending Pod, Job→CronJob orders/ledger-reconcile 소유 관계로 warning unschedulable 1건 조건과 원본 값·대상이 다르면 실패 | apps/wake/data/incident-detect.js:18은 FailedScheduling 신호를 warning으로 매핑한다. CPU 부족 여부는 Event 원문에 남고 전용 CPU 원인 분류는 없다. | CronJob ready를 즉시 true로 처리하는 경로와 배치 완료 판정 차이 확인 필요. T-SRE-07, T-SRE-04.  | 고정 없음 → T-SRE-15 | SRE-Q-03, SRE-Q-05, SRE-Q-07, SRE-Q-09, SRE-Q-12, SRE-Q-17, SRE-Q-18. D00960, D01037. |
| <a id="SRE-L-05"></a>SRE-L-05 s5-presync-fail: s5 Argo PreSync 실패 | 입력: 시험 가지 wake-test/s5-presync에 실제 exit 1로 끝나는 PreSync hook Job(orders/wake-s5-presync)을 더하고, orders를 그 가지로 사람 승인 sync 한다 → 기대: Argo operationState Failed/Error, orders/wake-s5-presync Job 실패, hook 로그, hook phase/wave를 보여 준다. 현재 hook Job warning 1건은 일부 증거일 뿐 Application 대상 사건 부재(P3)를 해결하지 않는다. Application UID·실패 revision·실행 단계로 사건을 추적할 수 있어야 한다. 원래 revision으로 되돌리고 승인된 sync 후 Synced·Healthy·operationState Succeeded, hook 정리를 확인한다. → 실패: Argo operationState Failed/Error, orders/wake-s5-presync Job 실패, hook 로그, hook phase/wave를 보여 준다 조건과 원본 값·대상이 다르면 실패 | apps/wake/data/incident-detect.js:60~65의 알림 대상 후보에는 Application이 없어서 PreSync Application 알림을 해당 객체 사건으로 만들지 않는다. | P3 미해결. hook Job에 CronJob owner가 없으므로 expect의 CronJob&#124;Job을 실제 대상 검증 없이 허용하면 안 된다. T-SRE-08, T-SRE-04.  | 고정 없음 → T-SRE-15 | SRE-Q-02, SRE-Q-03, SRE-Q-05, SRE-Q-06, SRE-Q-09, SRE-Q-10, SRE-Q-12, SRE-Q-17, SRE-Q-18. D00960, D01037. |
| <a id="SRE-L-06"></a>SRE-L-06 s6-redis-maxclients: s6 Redis 연결 한도와 반복 장애 | 입력: U-50 시험 auth 워크로드가 로그인마다 Redis 연결을 SESSION_TTL 동안 쥔다 → 기대: Redis clients/maxclients>0.9, rejected connection 로그, 인증 오류·CrashLoop의 구간을 대조한다. 단기 maxclients 완화와 TTL 86400→3600의 장기 개선을 구분하고 이전 30일 자료가 없으면 비교 불가로 표시한다; [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE). 수집 누락 시간만큼 관찰을 연장하고 7일 실제 coverage를 기록한다; 실패: Redis clients/maxclients>0.9, rejected connection 로그, 인증 오류·CrashLoop의 구간을 대조한다 조건과 원본 값·대상이 다르면 실패 | U-50 workload 파일이 없으면 exit 3으로 막는다. | 안 됨(설계·스크립트만, 실제 검수 미실행). 안 됨: U-50 workload 선행 파일 부재로 trigger exit 3. 기존 단기 restore만으로 7일 기준을 대체할 수 없다. T-SRE-12, T-SRE-07. | 고정 없음 → T-SRE-15 | SRE-Q-04, SRE-Q-05, SRE-Q-06, SRE-Q-07, SRE-Q-09, SRE-Q-10, SRE-Q-12, SRE-Q-14, SRE-Q-15, SRE-Q-18. D00960, D01037. |
| <a id="SRE-L-07"></a>SRE-L-07 s7-quiet-day: s7 조용한 날 점검과 제한된 화면 부하 | 입력: 아무것도 깨지 않는다 → 기대: 인시던트 0, Watchdog·InfoInhibitor 외 active alert 0, Pending·CrashLoop 0, metrics-server Node 3개가 원본상 성립해야 한다. 존재하지 않는 OpenCost/Tempo나 아직 없는 과거 자료는 연결 안 됨/자료 없음으로 나타나야 한다. 변경 없이 시작·끝의 상태를 재확인한다. 다른 시나리오 신호가 섞이면 조용한 날로 판정하지 않는다. → 실패: 인시던트 0, Watchdog·InfoInhibitor 외 active alert 0, Pending·CrashLoop 0, metrics-server Node 3개가 원본상 성립해야 한다 조건과 원본 값·대상이 다르면 실패 | pre 원본 확인 실패 때 시작을 막고 apps/wake/data/incident-detect.js:113의 detect는 입력 신호에서만 사건을 만든다. | 부분: 홈 상태 집계와 출처 분리 구현은 있으나 20개 실제 검수 없음. 비용 원본 검증은 별도 필요. T-SRE-02, T-SRE-15, T-SRE-16. | 고정 없음 → T-SRE-15 | SRE-Q-01, SRE-Q-02, SRE-Q-04, SRE-Q-13, SRE-Q-15, SRE-Q-16, SRE-Q-17, SRE-Q-19, SRE-Q-20. D00960, D01037. |
| <a id="SRE-L-08"></a>SRE-L-08 u52-manual-action: U-52 수동 조치: 명령 복사 -> 사람 실행 -> 원본 확인 | 입력: 수동 동기화 Application orders의 inventory-worker 명령을 kubectl로 바로 바꿔(drift, selfHeal 없음) 시작하자마자 exit 1 하게 한다 → 기대: Deployment orders/inventory-worker critical 1건. Argo OutOfSync와 live 변경, 사람이 승인한 명령·범위·위험을 보여 주며 사용자 외부 실행과 Wake 승인 기록을 분리한다. 사람이 별도 경로에서 수행한 조치의 결과를 독립 Kubernetes·Argo·지표로 읽어 Ready, rollout 일치, Synced·Healthy와 관찰 창을 확인한다. → 실패: Deployment orders/inventory-worker critical 1건 조건과 원본 값·대상이 다르면 실패 | apps/wake/desktop/incident-hub.cjs:317의 choose는 chosen·approvedAt만 저장하며 실제 외부 조치의 독립 확인 결과는 저장하지 않는다. | 부분: manual approval 외부 실행 안내는 있으나 chosen만으로 단계 완료 표시하는 경로는 실패. T-SRE-05, T-SRE-07.  | 고정 없음 → T-SRE-15 | SRE-Q-05, SRE-Q-06, SRE-Q-09, SRE-Q-10, SRE-Q-11, SRE-Q-12, SRE-Q-13. D00960, D01037. |
| <a id="SRE-L-09"></a>SRE-L-09 x01-gitops-drift: GitOps drift: 손으로 replicas·image 변경 | 입력: 수동 Application shop-dev의 shop-web을 kubectl로 replicas 1 -> 3, image nginx.27.3-alpine -> nginx.27.4-alpine 으로 바꾼다(OutOfSync가 남음) → 기대: dev의 shop-web OutOfSync 1행, prod replicas=2로 자동 수렴, ArgoAppOutOfSync의 name=shop-dev를 보여 준다. 현재 인시던트 0은 관측 계약이며 모든 drift를 장애로 만드는 승인은 아니다. 영향·심각도·사건화 조건을 명시적으로 정해야 한다. receipt로 dev 변경을 되돌리고 Synced·Healthy 및 해당 알림 해소를 확인한다. prod 자동 복구를 사용자가 실행한 조치로 기록하지 않는다. → 실패: dev의 shop-web OutOfSync 1행, prod replicas=2로 자동 수렴, ArgoAppOutOfSync의 name=shop-dev를 보여 준다 조건과 원본 값·대상이 다르면 실패 | apps/wake/data/incident-detect.js:60~65는 name만 있는 Argo Application 알림의 대상을 찾지 못한다. | Application 신호 매핑 공백(P1·P3), drift 사건화 기준 미정. T-SRE-08, T-SRE-05.  | 고정 없음 → T-SRE-15 | SRE-Q-02, SRE-Q-06, SRE-Q-09, SRE-Q-10, SRE-Q-11, SRE-Q-17. D00960, D01037. |
| <a id="SRE-L-10"></a>SRE-L-10 x02-bad-manifest: 잘못된 manifest 커밋: sync 실패 | 입력: 자동 Application ops에 스키마가 틀린 Deployment(spec.replicas: "two")를 커밋한다 → 기대: operationState Failed/Error와 replicas/unmarshal/invalid 오류, ArgoAppSyncFailed labels.name=ops, 실패 revision을 연결한다. 현재 사건 0은 P3 결함이며 실패를 정상처럼 보이는 합격 근거가 아니다. 해당 변경을 복원하고 Application Synced·Healthy 및 실패 operation의 새 결과를 확인한다. → 실패: operationState Failed/Error와 replicas/unmarshal/invalid 오류, ArgoAppSyncFailed labels.name=ops, 실패 revision을 연결한다 조건과 원본 값·대상이 다르면 실패 | apps/wake/desktop/gitops-deployment.cjs:10의 argoDeployment는 operation 기록을 변환하지만 apps/wake/data/incident-detect.js:60~65에는 Application 사건 대상이 없다. | P1·P3 미해결, Application 대상과 오류 근거 필요. T-SRE-08.  | 고정 없음 → T-SRE-15 | SRE-Q-02, SRE-Q-03, SRE-Q-05, SRE-Q-06, SRE-Q-09, SRE-Q-12. D00960, D01037. |
| <a id="SRE-L-11"></a>SRE-L-11 x03-netpol-block: NetworkPolicy가 api -> db를 막음: 5xx와 연결 오류 로그 | 입력: allow-db 정책에서 api를 빼는 커밋(shop-prod만 자동 반영)과, 이미 열린 DB 연결을 끊는 pg_terminate_backend(정책은 새 연결만 막으므로) → 기대: shop-api·shop-web Ingress 두 건 critical이라는 현재 owner별 계약을 기록한다. 5xx>5%, DB 연결 로그와 NetworkPolicy 변경의 시각을 비교한다. 같은 원인 두 사건 통합 여부는 아직 결정되지 않았다. 그래프의 Service→DB 추정선을 실제 호출·활성 연결·재전송 수치로 표시하면 실패다. 원래 정책을 복원하고 실제 요청량 존재, 5xx<1%, 해당 알림 해소, Argo Synced·Healthy를 확인한다. → 실패: shop-api·shop-web Ingress 두 건 critical이라는 현재 owner별 계약을 기록한다 조건과 원본 값·대상이 다르면 실패 | apps/wake/desktop/reads/network.cjs:57은 connections·retransmits를 빈 배열로 돌려주어 실제 서비스 간 호출 측정값을 제공하지 않는다. | P4 미해결: conns/retrans 빈 목록, ns 기반 DB 추정. 인과 확정·사건 병합은 미승인. T-SRE-07, T-SRE-08.  | 고정 없음 → T-SRE-15 | SRE-Q-04, SRE-Q-05, SRE-Q-07, SRE-Q-09, SRE-Q-12, SRE-Q-18. D00960, D01037. |
| <a id="SRE-L-12"></a>SRE-L-12 x04-cronjob-fail: CronJob 연속 실패 | 입력: orders/ledger-reconcile의 FAIL_RATE_PERCENT를 0 -> 100으로 커밋하고 orders를 승인 sync 한다 → 기대: CronJob orders/ledger-reconcile warning job-failed 1건. 실패 Job별 UID·시각·로그·완료 항목을 보존하고 반복 신호와 새 사건을 구분한다. 설정 복원 뒤 새 실행 성공, lastSuccessfulTime>=lastScheduleTime, 작업 결과 확인. 기존 실패 Job 때문에 firing이 남는 P7은 lab 원본 규칙 결함으로 분리한다. 복구 스크립트가 지우는 실패 Job은 receipt와 근거를 먼저 남긴다. → 실패: CronJob orders/ledger-reconcile warning job-failed 1건 조건과 원본 값·대상이 다르면 실패 | 실패 Job을 receipt로 저장한 뒤 지워 알림 해제를 유도한다. | P7 lab 규칙 수정 필요. 과거 실패 삭제를 제품의 서비스 복구 조건으로 만들지 않는다. T-SRE-12, T-SRE-04. | 고정 없음 → T-SRE-15 | SRE-Q-03, SRE-Q-05, SRE-Q-08, SRE-Q-09, SRE-Q-12, SRE-Q-14, SRE-Q-17, SRE-Q-18. D00960, D01037. |
| <a id="SRE-L-13"></a>SRE-L-13 x05-pvc-full: PVC 90% 이상 | 입력: redis-0의 /data(64Mi tmpfs, PVC data-redis-0)에 사용률 92%까지 채우는 파일을 쓴다 → 기대: PersistentVolumeFillingUp critical 1건의 직접 대상은 data-redis-0 PVC UID이고 owner는 실제 확인한 StatefulSet이어야 한다. Node 라벨이 있어도 Node 장애로 바꾸지 않는다. 사용량/용량 원본과 쓰기 오류(있을 때만)를 보여 준다. 현재 Node wake-lab-worker2 기대값은 P1 재현이다. 주입 파일만 제거하고 원본 사용률<90%, 알림 해소 및 필요한 실제 쓰기 성공을 확인한다. PVC/PV 보존 여부를 확인한다. → 실패: PersistentVolumeFillingUp critical 1건의 직접 대상은 data-redis-0 PVC UID이고 owner는 실제 확인한 StatefulSet이어야 한다 조건과 원본 값·대상이 다르면 실패 | apps/wake/data/incident-detect.js:64는 node 라벨을 대상으로 선택하며 persistentvolumeclaim 라벨 후보는 없다. | P1 미해결. PVC 선택자·namespace·UID와 owner 연결 필요. T-SRE-08, T-SRE-04.  | 고정 없음 → T-SRE-15 | SRE-Q-02, SRE-Q-03, SRE-Q-05, SRE-Q-07, SRE-Q-09, SRE-Q-12, SRE-Q-17. D00960, D01037. |
| <a id="SRE-L-14"></a>SRE-L-14 x06-hpa-max: HPA 최대치 도달 | 입력: payments/checkout-api HPA 목표 CPU 70% -> 5%로 커밋한다 → 기대: Deployment payments/checkout-api warning alert 1건. HPA currentMetrics, target, current/desired/max replicas와 CPU request·사용량을 분리한다. 최대 도달만으로 사용자 장애를 단정하지 않는다. 원래 목표 복원 뒤 currentReplicas=minReplicas=2, HPAMaxedOut 해소, Argo 정상 수렴을 확인한다. → 실패: Deployment payments/checkout-api warning alert 1건 조건과 원본 값·대상이 다르면 실패 | apps/wake/pages/resource-detail.js:540~542는 conditions의 status·reason·message를 표로 표시한다. HPA의 CPU 수집 실패가 목표치 충족을 뜻하지는 않는다. | HPA 원본 열은 존재하나 원본 대비 판단·클릭 측정 미실행. T-SRE-07, T-SRE-11.  | 고정 없음 → T-SRE-15 | SRE-Q-02, SRE-Q-04, SRE-Q-05, SRE-Q-06, SRE-Q-07, SRE-Q-09, SRE-Q-12, SRE-Q-17. D00960, D01037. |
| <a id="SRE-L-15"></a>SRE-L-15 x07-configmap-regression: ConfigMap 변경으로 롤아웃 -> 회귀 | 입력: shop-web nginx 설정(configMapGenerator, 이름에 해시)에서 upstream 포트를 3000 -> 3001로 커밋한다 → 기대: Ingress shop/shop-web critical 1건, 5xx>5%, nginx 오류 로그, revision>=2와 같은 이미지의 설정 차이를 보여 준다. 설정만 바뀌어 diff가 비면 P5 실패다. revision·ConfigMap 이름/해시·변경 시각을 근거로 삼고 관련 없는 변경을 원인으로 확정하지 않는다. 설정 변경 복원 후 Synced·Healthy·알림 해소, 실제 5xx 회복과 관찰 창을 확인한다. → 실패: Ingress shop/shop-web critical 1건, 5xx>5%, nginx 오류 로그, revision>=2와 같은 이미지의 설정 차이를 보여 준다 조건과 원본 값·대상이 다르면 실패 | apps/wake/pages/resource-detail.js:652는 now.image와 prev.image가 다를 때만 diff를 만든다. | P5 미해결: rolloutTab 이미지가 다를 때만 비교. T-SRE-09, T-SRE-07.  | 고정 없음 → T-SRE-15 | SRE-Q-04, SRE-Q-05, SRE-Q-06, SRE-Q-09, SRE-Q-10, SRE-Q-11, SRE-Q-12, SRE-Q-17, SRE-Q-18. D00960, D01037. |
| <a id="SRE-L-16"></a>SRE-L-16 x08-cordon-drain: 노드 하나 cordon과 drain | 입력: wake-lab-worker를 cordon하고 앱 namespace Pod만 골라 drain한다(관측·플랫폼 Pod는 남김) → 기대: unschedulable=true와 disruptionsAllowed=0을 다른 상태로 표시한다. 현재 기대 사건 0이나 실제 FailedScheduling이 생기면 해당 workload 사건을 기록한다. Node 관리 상태를 NodeNotReady로 오인하지 않는다. uncordon 및 관련 namespace(shop/payments/orders/ops)의 Deployment available>=desired, 알림 해소와 이동 Pod의 실제 owner/UID를 확인한다. → 실패: unschedulable=true와 disruptionsAllowed=0을 다른 상태로 표시한다 조건과 원본 값·대상이 다르면 실패 | apps/wake/data/incident-detect.js:19는 NodeNotReady를 감지하며 :38의 ownerChain이 대상을 추적한다. uncordon 후 Pod 복귀를 실행하는 경로는 이 감지기에 없다. | 조건부 결과를 고정 0으로 통과시키면 실패. 대상 교체·노드 영향 범위 검수 미실행. T-SRE-04, T-SRE-15.  | 고정 없음 → T-SRE-15 | SRE-Q-01, SRE-Q-03, SRE-Q-05, SRE-Q-07, SRE-Q-09, SRE-Q-10, SRE-Q-12, SRE-Q-17. D00960, D01037. |
| <a id="SRE-L-17"></a>SRE-L-17 x09-cert-expiry: 인증서 만료 임박(D-01 범위: Secret을 읽지 않고 지표로) | 입력: 7일 짜리 자체 서명 인증서를 로컬에서 만들어 TLS Secret status/status-page-tls로 넣고, status-page Helm 값 tlsSecret을 커밋한다 → 기대: CertificateExpiringSoon과 만료까지 <1209600초(14일)를 대조한다. 현재 사건 0은 Ingress 라벨 매핑 부재(P1)이며 인증서 정보가 정상이라는 뜻이 아니다. 알림→Ingress 연결이 검증되지 않으면 미확인 대상으로 남긴다. 원래 인증서 상태 복원·알림 해소·Application 정상과 시험 객체 정리를 운영자 receipt로 확인한다. expect의 secret-gone 검사는 운영자 cleanup 책임이며 Wake reader에 Secret list 권한을 부여하지 않는다. → 실패: CertificateExpiringSoon과 만료까지 <1209600초(14일)를 대조한다 조건과 원본 값·대상이 다르면 실패 | apps/wake/data/index.js:25는 Secret 읽기를 forbidden으로 거절한다. 인증서 만료 값은 Secret 직접 읽기로 공급되지 않는다. | P1 및 대상 없는 알림 처리 필요. 보안 경계는 유지한다. T-SRE-08, T-SRE-15.  | 고정 없음 → T-SRE-15 | SRE-Q-02, SRE-Q-03, SRE-Q-05, SRE-Q-07, SRE-Q-09, SRE-Q-12, SRE-Q-20. D00960, D01037. |
| <a id="SRE-L-18"></a>SRE-L-18 x10-dual: 동시에 두 장애: 묶기와 분리 | 입력: s1(payments/checkout-api OOM)과 x04(orders/ledger-reconcile 연속 실패)를 같이 일으킨다 → 기대: checkout-api와 ledger-reconcile 두 사건. 같은 Pod OOM·CrashLoop·알림은 한 사건으로 합치고 서로 다른 owner 둘은 합치지 않는다. 머리·목록·상세·보고서 사건 수와 심각도·복구 상태가 일치해야 한다. 각 시나리오의 receipt·restore·사용자 영향 회복을 독립 확인한다. 하나의 복구를 다른 사건 복구로 전파하지 않는다. → 실패: checkout-api와 ledger-reconcile 두 사건 조건과 원본 값·대상이 다르면 실패 | apps/wake/data/incident-detect.js:96의 keyOf는 cluster·kind·namespace·name을 키로 묶으며 UID는 넣지 않는다. | 현재 owner별 grouping은 있으나 UID·재발 경계와 실제 동시 검수 미실행. T-SRE-04, T-SRE-12.  | 고정 없음 → T-SRE-15 | SRE-Q-01, SRE-Q-03, SRE-Q-04, SRE-Q-05, SRE-Q-07, SRE-Q-08, SRE-Q-12, SRE-Q-13. D00960, D01037. |
| <a id="SRE-L-19"></a>SRE-L-19 x11-event-storm: 이벤트 폭주: 중복 처리(dedup) | 입력: namespace wake-storm(Git 밖, 시험용)에 맞는 Node가 없는 Deployment storm(replicas 15)을 만든다 → 기대: Deployment 한 사건 warning unschedulable, distinct Pod/Event 신호 15개 이상. 동일 Event UID count 갱신은 새 사건/새 이벤트 행으로 중복하지 않는다. 사건 수, 신호 수, 발생 횟수, Pod 수를 서로 구분한다. 시험 namespace 제거와 알림 해소를 확인한다. 대상이 사라진 상황은 삭제·완화와 서비스 복구를 구분하고 고정 근거는 남긴다. → 실패: Deployment 한 사건 warning unschedulable, distinct Pod/Event 신호 15개 이상 조건과 원본 값·대상이 다르면 실패 | apps/wake/data/incident-detect.js:28의 DETECT.maxSignals는 200이며 사건의 보존 신호 수 상한으로 사용된다. | eventSummary의 UID 중복 제거 일부 구현. 사건 key에 UID 없음과 삭제 대상 ready=true 위험 검수 필요. T-SRE-04, T-SRE-07.  | 고정 없음 → T-SRE-15 | SRE-Q-03, SRE-Q-05, SRE-Q-08, SRE-Q-15, SRE-Q-17, SRE-Q-18. D00960, D01037. |
| <a id="SRE-L-20"></a>SRE-L-20 x12-prune-pending: prune 대기 리소스 | 입력: prune을 끈 자동 Application batch에서 LimitRange batch-defaults를 Git에서 지운다 → 기대: Git 원본 부재·live 존재·requiresPruning=true LimitRange 1개를 구분한다. 현재 사건 0이며 prune 대기를 실행 실패 또는 이미 삭제 완료로 표시하지 않는다. 삭제 위험과 사람 승인 대상을 설명할 수 있어야 한다. 원본 Git 정의 복원 후 Synced·Healthy와 live LimitRange 일치를 확인한다. 승인 없이 prune를 실행해서 통과시키지 않는다. → 실패: Git 원본 부재·live 존재·requiresPruning=true LimitRange 1개를 구분한다 조건과 원본 값·대상이 다르면 실패 | apps/wake/desktop/gitops-deployment.cjs:79의 argoResources는 컨트롤러 리소스별 상태를 변환하며 실제 prune 실행을 수행하지 않는다. | GitOps resource rows는 존재하나 삭제 계획·감사·실행 전체 검증 미실행. T-SRE-05, T-SRE-15.  | 고정 없음 → T-SRE-15 | SRE-Q-02, SRE-Q-06, SRE-Q-09, SRE-Q-10, SRE-Q-11, SRE-Q-17. D00960, D01037. |

## 반복된 SRE 지적과 회귀 고정

### SRE-R-01 얇은 머리 요약

- 목표: 입력: s7 정상과 s1·x10 장애의 첫 화면을 읽는다 → 기대: 요약만 읽어 대상·현재 상태·사용자 영향·긴급도·다음 판단을 알 수 있어야 한다. 제목·종류·본문 숫자 반복이나 의미 없는 진행률로 자리를 채우지 않는다. 정상 Node 등 실제로 유용한 수를 이름과 함께 표시한다. Q01·Q04·Q13·Q17의 핵심 답을 첫 화면에서 얻는다. s7 정상과 s1·x10 장애의 머리 값이 실제 원본 및 펼친 본문과 같다. 종류 이름·중복 현재 값 제거 뒤 공백을 새로운 가짜 숫자로 메우지 않는다. → 실패: 대상·영향·다음 판단이 반복 제목과 장식 진행률 아래로 밀리면 실패.
- 현재: 부분. `incident-detail.js:43-64`의 focusLine과 `cluster-home.js:175-207`의 머리 시리즈는 구현되어 있다. 모든 종류·카드의 판단 정보 충분성은 전수 검증되지 않았다. 원인이 단순 공간 부족인지 값 공급 부재인지 질문별로 확인해야 하며 추정해서 단정하지 않는다.
- 차이: T-SRE-01, T-SRE-11.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00067, D00073, D00600, D00771, D00781, D00807, D00844, D00951, D00952, D00953, D00954, D00955. 근거: D00067, D00073, D00600, D00771, D00781, D00807, D00844, D00951~D00955; 요청 K 얇은 머리 요약.

### SRE-R-02 상태를 숨긴 화면

- 목표: → [RULE-STATE](rules.md#RULE-STATE); [RULE-CHIPS](rules.md#RULE-CHIPS).
- 현재: 부분. T4는 부분 열거 실패를 도구 부재로 취급해 저장된 도구를 숨긴 경로와 hub 성공이 inventory 실패를 덮은 경로를 재현했다. `data/conn-view.js:79-95`에는 같은 UID receipt를 보존하는 wasFound와 retry가 있고 `pages/tool-detail.js:64-65`에는 inventoryFailure를 body 앞에 표시하는 수정 코드가 있다. T4의 두 반례를 닫는 현재 실행 증거는 없으므로 부분이다.
- 차이: T-SRE-02, T-SRE-15.
- 고정 장치: 고정 없음 → T-SRE-02
- 출처: D00017, D00454, D00919, D01000. 근거: D00017, D00454, D00919, D01000; T4 F1·F2; 요청 K 상태를 숨긴 화면.

### SRE-R-03 과거 값·누락을 현재 값으로 오인

- 목표: 입력: 과거 하루·공백 있는 1시간·자료 없는 30일을 선택한다 → 기대: 선택 구간의 마지막 값과 현재 건강, 과거 기준선과 현재 표본, 저장 근거와 live 값을 구분한다. 관측하지 않은 구간을 측정된 요청 수·영향으로 표시하지 않는다. 과거 하루, 끝에 공백이 있는 1시간, 데이터가 전혀 없는 30일을 선택한다. 과거에는 현재 신선도 기준을 적용하지 않고 절대 구간·마지막 표본 시각을 보인다. 실제 표본이 덮은 구간과 추정한 전체 구간을 각각 표시한다. 오류율/요청률이 없으면 영향 미확인이며 0명·0건으로 만들지 않는다. → 실패: 없는 구간을 측정값으로 채우거나 과거값을 현재 건강으로 쓰면 실패.
- 현재: 부분. 홈 과거 구간 표기는 구현됨. `incident-model.js:38-58`은 coverage 대비 전체 window로 요청 수를 확대하며 `userImpact`는 숫자 유무로 measured를 선택하는 경로가 있다. `incident-hub.cjs:225` 기준선 0 대체도 확인된다. 이는 정적 검토로 찾은 위험이며 이 실행에서 실제 오표시를 재현한 것은 아니다.
- 차이: T-SRE-07, T-SRE-12.
- 고정 장치: 고정 없음 → T-SRE-07
- 출처: D00451, D00776, D00806. 근거: D00451, D00776, D00806; 요청 K 과거 값을 현재 값처럼 보인 것.

### SRE-R-04 조사 중 대상 교체

- 목표: 입력: 같은 이름의 A UID 요청 뒤 B UID 응답과 A 응답을 역순 반환한다 → 기대: 동일 이름의 새 UID로 바뀌면 옛 요청·근거·로그·선택 상태를 새 객체의 사실로 붙이지 않는다. 역사 기록은 원래 UID와 시각을 유지한다. A UID 요청을 지연시킨 뒤 같은 kind/ns/name의 B UID로 바꾸고 B 응답 후 A 응답을 반환한다. A는 B의 ready/값/로그/칩을 갱신하지 않는다. 근거 링크는 A 고정 기록 또는 삭제됨을 보인다. 재발 판정도 UID 경계와 이름 기준 역사 연결을 구별한다. → 실패: B 객체 화면에 A 로그·칩·근거를 붙이면 실패.
- 현재: 부분. resource-pages의 늦은 응답·owner UID 시험은 있다. `incident-detect.js:96,119-121` 사건 key가 이름 기반이며 `incident-hub.cjs:304`는 현재 owner UID를 우선한다. U3의 실제 과거 대상 혼입과 별도로 현재 사건 경계의 정적 위험을 재검증해야 한다.
- 차이: T-SRE-04.
- 고정 장치: 고정 없음 → T-SRE-04
- 출처: D00093, D00110, D00114, D00452. 근거: D00093, D00110, D00114, D00452; U3 major 1; 요청 K 대상이 바뀌어 있던 것.

### SRE-R-05 연결 칩 불일치

- 목표: 입력: 같은 Service UID의 도구 상태를 여섯 소비 화면에서 연다 → 기대: 실제 연결한 도구만 칩에 두고 연결 근거·데이터 건강·열 수 있음의 입력을 구분한다. '연결됨'을 눌렀는데 아무 설명 없이 다시 연결하라는 화면이면 실패다. 홈 칩·홈 연결 카드·위쪽 도구 메뉴·클러스터 도구 목록·도구 상세·설정 도구의 6곳에서 같은 도구 ID·Service UID와 출처 상태를 비교한다. AI 대상 칩은 별도의 추가 소비 경로로 함께 확인한다. 과거 연결 정보만 있는 대상은 현재 성공으로 승격하지 않고, 일시적 읽기 실패는 연결 기록을 삭제하지 않는다. AI에 실제 제공되지 않은 도구는 사용 가능 대상으로 노출하지 않는다; 실패: 열기 불가 사유가 사라지거나 도구 ID·UID가 소비처마다 다르면 실패.
- 현재: apps/wake/data/conn-view.js:79의 wasFound가 같은 UID receipt를 유지하고 :95~97은 inventory/hub 실패 시 retry를 만든다.
- 차이: 여섯 화면이 동일 toolViews를 소비하는 전체 native 조합과 실제 retry 읽기 횟수는 별도 검증 범위다.
- 고정 장치: `apps/wake/data/conn-view.test.mjs:66` — `tool_views_keep_read_outcomes_apart_and_never_promote_a_past_connection`
- 출처: D00017, D00026, D00999, D01000. 근거: D00017, D00026, D00999, D01000; T4 F1·F2; 요청 K 칩 불일치.

### SRE-R-06 Restarts 혼합 표시와 잘림

- 목표: → [RULE-RESTARTS](rules.md#RULE-RESTARTS); [RULE-WIDTH](rules.md#RULE-WIDTH).
- 현재: → [RULE-WIDTH](rules.md#RULE-WIDTH)의 fit 경로 근거, [RULE-RESTARTS](rules.md#RULE-RESTARTS)의 셀 톤 근거.
- 차이: 실제 렌더 재검증 전. → [RULE-WIDTH](rules.md#RULE-WIDTH).
- 고정 장치: 고정 없음 → T-SRE-11
- 출처: D-USR-2026-11-16-1; D00454, D00776, D01033, D01034. 근거: D00454, D00776, D01033, D01034; B7 minor 2; 요청 K Restarts 혼합 표시.

### SRE-R-07 근거 번호·잘못된 근거 링크

- 목표: 입력: 없는 근거 999·다른 사건 번호·실패 조회 응답을 인용한다 → 기대: 근거는 이름과 대상·구간으로 식별하게 한다. AI가 숫자 표식을 만들었다고 등록되지 않은 근거를 정상 이름표로 바꾸지 않는다. 마우스와 키보드가 같은 고정 근거로 이동해야 한다. 실제 근거 번호, 없는 번호 999, 다른 사건의 번호, 실패한 get_evidence 응답, 같은 이름 새 UID를 넣는다. 유효한 사건·근거 쌍만 이름표가 되고 실패에는 임의 첫 근거를 연결하지 않는다. Tab 후 Enter/Space와 클릭의 대상·구간·hash가 일치한다. 근거 수집 후 live 값이 바뀌어도 원본은 유지된다; 실패: 유효하지 않은 번호가 정상 링크가 되거나 Enter가 다른 근거를 열면 실패.
- 현재: 부분. `incident-hub.cjs:110-117` cite는 query/window/target과 결과 해시를 저장한다. `ai-run.cjs:155`는 도구 결과 error와 별개로 사건을 used에 넣을 수 있어 실패 읽기가 링크 허용 근거가 되는 경로가 남아 있다. B7에서 실제 없는 번호가 이름표로 바뀌고 키보드 활성화가 실패했다.
- 차이: T-SRE-10, T-SRE-14.
- 고정 장치: 고정 없음 → T-SRE-10
- 출처: D00734, D00742, D00987. 근거: D00734, D00742, D00987; B7 minor 1·3; 요청 K 근거 번호 표기.

### SRE-R-08 PVC를 Node로 잡은 인시던트

- 목표: 입력: PVC와 Node 라벨이 함께 있는 PersistentVolumeFillingUp 알림을 입력한다 → 기대: 저장소 용량 경보는 경보의 namespace/persistentvolumeclaim을 직접 대상에 연결하고 실제 owner만 후속 관계로 사용한다. node 라벨은 측정 위치이지 자동으로 사건 주체가 아니다. 같은 경보에 PVC·Node 라벨을 모두 넣어 PVC UID를 선택한다. namespace가 없거나 원본 UID를 확인하지 못하면 대상 미확인으로 표시한다. 사건·범위·조치·보고서·AI context 모두 같은 직접 대상을 사용한다. → 실패: 측정 Node가 PVC 대신 직접 장애 대상으로 잡히면 실패.
- 현재: 안 됨. `incident-detect.js:58-78` 알림 대상 우선순위에 persistentvolumeclaim이 없고 node가 있어 P1이 발생한다. x05의 Node 기대값은 이 결함의 기록이다.
- 차이: T-SRE-08, T-SRE-04.
- 고정 장치: 고정 없음 → T-SRE-08
- 출처: D00086, D00820, D01037. 근거: x05 expect의 note; D00086, D00820, D01037; 요청 K PVC가 Node를 대상으로 잡힌 것.

### SRE-R-09 ImagePull 분류 누락

- 목표: 입력: ErrImagePull·ImagePullBackOff와 일반 BackOff를 입력한다 → 기대: ErrImagePull/ImagePullBackOff·관련 Failed/BackOff 이벤트는 이미지 취득 실패로 설명한다. 실행 중 프로세스의 CrashLoop와 구별하고 이미지 참조·오류 메시지·revision을 근거로 제공한다. s2 및 Failed만 있는 경우, 일반 BackOff와 ImagePull BackOff가 섞인 경우를 검사한다. 상태·이유·조치 제안이 일치하고 이미지 문제에 메모리 증가를 제안하지 않는다. 이전 정상 Pod가 남으면 부분 가용성을 표시한다. → 실패: 이미지 취득 실패를 실행 중 CrashLoop로 분류하면 실패.
- 현재: 안 됨. `incident-detect.js:13-22` SIGNALS는 BackOff를 crash-loop로 매핑하고 Failed를 감지하지 않는다. 분류 개선의 최종 규칙·심각도 계약을 구현 전에 명시해야 한다.
- 차이: T-SRE-08.
- 고정 장치: 고정 없음 → T-SRE-08
- 출처: D00081, D00450, D01037. 근거: s2 expect; D00081, D00450, D01037; 요청 K ImagePull 분류 누락.

### SRE-R-10 Application 대상 인시던트 없음

- 목표: 입력: Application sync 실패·hook 실패·단순 drift를 각각 입력한다 → 기대: GitOps sync 실패·hook 실패·degraded가 원본에 있으면 Application과 실패 revision·operation을 식별할 수 있어야 한다. 단순 drift·prune 대기를 모두 장애로 자동 승격하지 않는다. s5·x02는 Application 대상 원인과 실행 단계에 도달해야 한다. x01·x12는 상태를 정직하게 보이며 사건화 정책 미정을 표시한다. hook Job 사건만 남아도 Application 실패를 놓치면 불합격이다. Application UID·revision·operation startedAt 조합의 중복/재발 시험을 갖춘다. → 실패: 실패 revision·operation을 잃거나 모든 drift를 장애로 승격하면 실패.
- 현재: apps/wake/data/incident-detect.js:60~65의 signalsOf 알림 대상 후보에는 Application이 없다.
- 차이: Argo 실패 알림이 Application UID·revision을 가진 사건으로 이어지지 않는다.
- 고정 장치: 고정 없음 → T-SRE-08
- 출처: D00102, D00103, D00104, D00105, D00106, D00453, D00691, D01037. 근거: D00102~D00106, D00453, D00691, D01037; 요청 K Application 대상 인시던트 없음.

### SRE-R-11 설정만 바뀐 롤아웃의 빈 diff

- 목표: 입력: 동일 이미지에서 env·ConfigMap 해시만 달라진 rollout을 연다 → 기대: 이미지가 같아도 pod template·ConfigMap 참조/해시·env 참조·리소스 request/limit 변경을 비교하고 변경이 없거나 과거 원본이 없는 상태를 빈 화면과 구별한다. 비밀 값은 diff에 포함하지 않는다. x07에서 이전/현재 revision·같은 이미지·바뀐 설정 위치가 보인다. 원본 diff를 보존하지 못했으면 변경 시각/참조까지만 확인했다고 표시한다. 오직 이미지 basename 비교로 다른 digest·registry·설정 차이를 없애지 않는다. → 실패: 빈 diff를 변경 없음으로 단정하거나 Secret 값을 노출하면 실패.
- 현재: 부분. `resource-detail.js:646-657` rolloutTab은 이미지 차이가 있을 때만 비교를 그린다. ConfigMap managedFields 시각과 Argo history는 변경 이력 일부이며 설정 원문 diff가 아니다.
- 차이: T-SRE-09.
- 고정 장치: 고정 없음 → T-SRE-09
- 출처: D00082, D00102, D00103, D00104, D00105, D00106, D00453, D00806. 근거: D00082, D00102~D00106, D00453, D00806; 요청 K 설정만 바뀐 롤아웃의 빈 diff.

### SRE-R-12 시각 회귀가 정보를 숨기는 경계

- 목표: 입력: 공통 부품 변경 후 끝 행·더보기·설정·hover를 네 조합에서 조작한다 → 기대: 세로 스크롤·탭 더보기·표 정렬·아이콘 의미·여백/반경·hover·설정 틀의 변경이 SRE 질문의 답을 숨기거나 바꾸지 않아야 한다. 같은 부품은 한 작업 소유자만 변경하고 같은 변경에서 고정 장치를 갱신한다; [RULE-SORT](rules.md#RULE-SORT). 반경·여백은 승인된 디자인 값을 참조하고 이 영역에서 새 값을 만들지 않는다; 실패: SRE 답이 숨거나 정상 숫자에 상태 아이콘이 붙으면 실패.
- 현재: kit/tools/check-layout.mjs:69는 가로 클리핑만 판정하고 :79~104는 조상의 스크롤 이동을 확인한다.
- 차이: 끝 행 가시성·남은 hover·구역 탭 활성 항목을 함께 확인하지 않아 해당 정보 은폐 회귀가 빠질 수 있다.
- 고정 장치: 고정 없음 → T-SRE-11
- 출처: D-USR-2026-11-16-1; D01000, D01008, D01012, D01021, D01022, D01023, D01027, D01029, D01030, D01031, D01032, D01033, D01034. 근거: D01000, D01008, D01012, D01021~D01023, D01027, D01029~D01034; 요청 J의 반복 회귀 목록과 변경 규칙. 전역 토큰·설정 배치의 정본은 design 영역이며 여기서는 정보 접근 결과를 검사한다.

## 영역 간 넘길 작업과 고정 장치 소유

아래 작업은 이 문서의 부분·안 됨·`고정 없음`에 대응한다. 출처·현재 상태·미완료 근거는 각 행의 연결 SRE 항목을 그대로 적용한다. 파일은 수정 후보이며 현재 수정 권한을 뜻하지 않는다. 현재 담당 단위의 소유를 확인한 뒤 통합 담당이 tasks.md에 편입한다. 이 문서 작성으로 구현·시험·실행을 승인하지 않는다.

중간 체크포인트의 SRE 필수 조건은 잘못된 대상·상태·근거·실행/복구 완료 표시를 먼저 막는 것이다. T-SRE-02·03·04·05·07·10·14·17과 관련 native 검수 T-SRE-15의 해당 묶음이 선행한다. 미구현 PR·감지 확장·장기 관찰을 정직하게 남겼다는 이유만으로 그 기능의 제품 완성을 선언하지 않는다. 전체 시나리오 PASS는 T-SRE-06·08·09·12의 선행 결함을 포함해 닫은 뒤다.

| ID | 규칙·완료 조건과 연결 항목 | 고칠 파일·소유 조율 | 자동 확인 명령·고정 장치 | 화면/실제 확인·선행 | 지금 상태·남은 일 |
|---|---|---|---|---|---|
| T-SRE-01 | Q00~23·V01·03·05: 질문별 답·시간·행동·원본·독립 판정 기록을 빠짐없이 생성 | 검수 기록 도구의 위치를 quality/loop 담당과 확정; 이 파일의 측정 계약 | 새 기록 검사에 필수 필드·실제 원본 존재·20개 분모·독립 판정 누락 차단 추가. 현재 `고정 없음` | 필요. 탐색 목표는 실제 질문 측정 후 확정 | 안 됨. 기록 형식은 본문 표로 정의, 구현·실측 남음 |
| T-SRE-02 | Q01·15·16·20, I02·03·07, R02·05: 연결·열거·건강·열기 분리, 같은 UID 부분 실패 보존 | `data/conn-view.js`, `desktop/reads/source-checks.cjs`, `pages/cluster-home.js`, `pages/tools.js`, 실제 도구 상세·AI 칩 호출부; T1 소유 조율 | `node --test apps/wake/data/conn-view.test.mjs apps/wake/desktop/reads/reads.test.cjs apps/wake/tool-surfaces.test.mjs`; T4 F1/F2 재현을 고정 | 필요. 6표면 × hub/inventory/forbidden/empty/UID 교체. T4 판정 닫기 | 부분. 같은 UID 보존·상세 오류 표시 코드 있음, T4 실제 재검수 남음 |
| T-SRE-03 | Q02·I07: alert fingerprint·동률 순서·Watchdog 제외·pending/firing의 일관성 | `desktop/reads/alerts.cjs`, `data/alerts.js`, `pages/alerts.js`의 실제 호출 경로 확인 후 수정; U-28 소유 조율 | `node --test apps/wake/desktop/reads/reads.test.cjs`; 동률 fingerprint 보조 키 및 반복 읽기 순서 시험 추가 | 필요. U3 sameRows=true/sameOrder=false 재검수 | 부분. 원본 대비 순서와 표시 의미 고정 |
| T-SRE-04 | Q03·08·15·18, I04, R04: UID·세대·구간 경계와 재발·중복 보장 | `data/incident-detect.js`, `desktop/incident-hub.cjs`, `pages/resource-detail.js`, hub 도구 입력 경계; B1/U-01 소유 조율 | `node --test apps/wake/data/incident-detect.test.mjs apps/wake/pages/resource-pages.test.mjs`; A→B UID 늦은 응답·과거 대상·동명 재발 시험 추가 | 필요. x10/x11 및 U3 경계, T-SRE-17 원본 정체 검사 | 부분. 출처 응답 identity_changed 수정 코드 있음; 사건 key·현재 UID 혼합과 실제 재검수 남음 |
| T-SRE-05 | Q09~14, R10: 선택·승인·실행·배포·확인을 각각 실제 상태로 판정 | `desktop/approvals.cjs`, `desktop/incident-hub.cjs`, `pages/incident-detail.js`, `pages/incident-report-doc.js`; 승인 담당 소유 | `node --test apps/wake/data/ownership.test.mjs apps/wake/data/audit.test.mjs apps/wake/pages/incident-report-doc.test.mjs`; 승인만 한 경우 실행 미완료·재결정 멱등·실제 fixAt 시험 추가 | 필요. manual 외부 실행 및 미실행·실패·취소 | 부분. chosen/approvedAt를 실행 완료로 표현하는 경로 제거 |
| T-SRE-06 | Q09~11: 승인된 Draft PR 생성의 실제 외부 결과와 멱등성 확인 | `desktop/approvals.cjs`, Git 연결 서비스·설정; P6 및 Git 단위 소유 | 실제 PR 생성 어댑터 계약·중복 요청·권한 거절·외부 실패 시험 신규, 현재 `고정 없음` | 필요. 승인된 시험 저장소의 PR URL·base/head·diff·미머지 상태, T-SRE-05 선행 | 안 됨. pending 기록을 실제 PR로 바꿀 구현과 검증 필요 |
| T-SRE-07 | Q04·05·07·12, I01·03, R03: 영향·원인·추정·복구의 정직성 | `data/incident-model.js`, `desktop/incident-hub.cjs`, `data/network.js`, `desktop/reads/network.cjs`, `pages/incident-detail.js` | `node --test apps/wake/data/incident-model.test.mjs apps/wake/data/incident-detect.test.mjs apps/wake/desktop/reads/reads.test.cjs`; 공백 확대 추정·unknown 기준선·5분 관찰·Job 완료·추정 관계 시험 추가 | 필요. s1/s3/s4/x03/x07/x11. 실제 없는 conns/retrans를 추정값으로 채우지 않음 | 부분. 측정과 추정 분리·복구 기준 정합성 보완 |
| T-SRE-08 | Q03·07·17, R08~10: PVC·ImagePull·Application 감지 대상·분류 정의 | `data/incident-detect.js`, `data/ownership.js`, `desktop/incident-hub.cjs`; L1 발견 P1~3 제품 소유 | `node --test apps/wake/data/incident-detect.test.mjs apps/wake/data/ownership.test.mjs`; PVC+Node 라벨·ImagePull Failed·Argo operation별 중복/재발 시험 추가 | 필요. s2/s5/x01/x02/x05/x09. 단순 drift 사건화 정책은 미정으로 남김 | 안 됨. 기존 잘못된 expect를 제품 정답으로 쓰지 않도록 동반 변경 |
| T-SRE-09 | Q06·17, R11: 같은 이미지 설정 롤아웃 비교·원본 없음 표시 | `pages/resource-detail.js`, `desktop/gitops-deployment.cjs`, 관련 data 변환; U-22/GitOps 소유 | `node --test apps/wake/pages/resource-pages.test.mjs apps/wake/desktop/reads/reads.test.cjs`; 같은 image 다른 template/config·Secret 마스킹·history 없음 시험 추가 | 필요. x07, T-SRE-04 대상 고정 선행 | 부분. P5 해결·변경 원본 보존 범위 명시 |
| T-SRE-10 | Q05·16, I05, R07: 유효 근거 이름표와 키보드 경로 | `desktop/ai-run.cjs`, `kit/components/ref.js`, `kit/page/kinds/ai/chat.js`, `apps/wake/pages/chat.js`의 참조 renderer 실제 위치 확인 후 소유 배정 | B7 실패 도구 n999·교차 사건·Enter/Space 동작을 계약 시험에 추가. 현재 전체 `고정 없음` | 필요. click/Tab/Enter/Space 동일 target/hash. T-SRE-04와 소유 조율 | 부분. 실패 응답을 읽기 근거로 인정하는 경로와 키보드 수정 |
| T-SRE-11 | Q01·17·18, I03·06, R01·06·12: 핵심 요약·긴 표 값·원본 로그·끝행 접근 | `data/kinds.js`, `pages/resource-detail.js`, `pages/events-view.js`, `pages/costs.js`, kit 표/탭/스크롤; 공통 부품 소유 한 명 | `node --test apps/wake/data/kinds.test.mjs apps/wake/pages/resource-pages.test.mjs`; `node kit/tools/check-layout.mjs --app wake`; table-cells/toolbar-gaps/scroll 의미 검사와 긴 값 캡처 추가 | 필요. 양 테마×1280·1680, Restarts 760 추가, 끝까지 스크롤 | 부분. Restarts 렌더 재검증과 무효 align 정리. → [RULE-WIDTH](rules.md#RULE-WIDTH); [RULE-SORT](rules.md#RULE-SORT) |
| T-SRE-12 | Q08·12·14, L06·12: 장기 관찰·재발·보관·lab P7 수정 | `data/incident-model.js`, hub 저장/보관 경로, U-50 소유 workload, LAB CronJob 알림 규칙(저장소 밖 담당) | incident-model 시험, 7일 coverage/누락 연장 검사 신규, x04 restore 규칙 검사 | 필요. s6 workload와 168시간 이상, 이전 30일 데이터 유무를 별도 표시 | 부분; s6 준비 안 됨. 단기 복구로 장기 성공 대체 금지 |
| T-SRE-13 | Q13·14: 상황 공유·회고·내보내기의 실제 문서 품질 | `pages/incident-report-doc.js`, `pages/incident-report.js`, export 경로 | `node --test apps/wake/pages/incident-report-doc.test.mjs`; PDF 내용/페이지·CSV escape·HTML·Markdown 동등성 검사, Excel 지원은 별도 범위 확정 | 필요. 실제 PDF 페이지와 10초 상황 공유, 원본 최종 값·시각 | 부분. 화면 복사형 출력·누락·링크·최종값 확인 |
| T-SRE-14 | Q16, I05, R05·07: 공급자 없는 첫 질문과 실패 대화도 허브에 보존 | `desktop/ai-run.cjs`, 대화 저장·context/ref 검증, AI 칸 연결 상태 | B7 no-provider→connect→follow-up 재현과 disk readback, 실패 get_evidence 참조 검사를 기존 스트림/대화 시험에 추가 | 필요. model 입력·허브·화면에서 같은 두 질문, 모델 대역과 실제 공급자 구분 | 부분. B7 major와 minor 근거 오류 수정 |
| T-SRE-15 | 모든 Q/I/L/V/R의 `고정 없음`: 실제 원본·Electron·독립 SRE 판정 | 검수 기록과 시나리오 담당 파일, 제품 코드 변경 없음 | 승인 후 DRY 확인; 실제 GO 단계는 SRE-V-02. 각 Q의 C-K~C-S 대조 및 기존 점검 명령 | 필요. 선행 결함·통합 GO·reader·자리·부하 충족 | 안 됨(20개 전체 실행). 기존 단위 PASS 재사용 금지 |
| T-SRE-16 | Q19·I06: OpenCost 비용의 실제 값·coverage·통화·가격 비교 | `desktop/opencost.cjs`, `data/costs.js`, `pages/costs.js` | `node --test apps/wake/desktop/opencost.test.cjs`; identity/coverage/총계/빈값/순위 비교 고정 | 필요. 실제 OpenCost 연결 승인·준비가 선행; lab2에는 설치 안 됨 | 부분. 코드 존재, 실제 비용 전수 대조 안 됨 |
| T-SRE-17 | V01~05·L01~20·R12: 검수 도구가 빈 결과·잘못된 화면·가려진 정보로 통과하지 않게 함 | 기록 검사, LAB collect.sh/expect.json, kit 가시성 검사 담당과 조율 | 빈 series를 넣어 `//0` 복구 PASS 금지; route/UID/source hash 누락 FAIL; C4 clip-path/filter opacity 경계 입력 추가. 현재 통합 `고정 없음` | 필요. T-SRE-01 기록 형식, U3·C4 재현 입력 | 부분. 기존 검사 경계 확장·잘못된 기대값의 명시적 마이그레이션 필요 |

### SRE-V-06 작업 소유와 스펙 변경

- 목표: 입력: 규칙과 장치가 공유하는 파일의 담당 범위를 비교한다 → 기대: (기본값 채택, 번복 가능) 아래 경계를 동시에 고치지 않는다. 스펙의 값·판정·상태를 바꾸면 같은 변경에서 시험 또는 점검 또는 승인 캡처도 바꾼다. `고정 없음`인 항목은 장치를 먼저 만들거나 같은 변경에 포함한다. 변경 시작 시 실제 담당자·허용 경로·관련 T-SRE·대기 작업을 등록한다. 표의 담당 단위명은 조율 대상이며 현재 락을 소유했다는 뜻이 아니다. 다른 영역 정본과 충돌하면 어느 규칙을 바꾸는지 기록한 뒤 해당 소유자가 수정한다. → 실패: 겹친 쓰기 소유권이나 장치 없는 규칙 변경을 허용하면 실패.
- 현재: 슬롯 lock을 wx로 만들지만 제품 파일별 변경 소유권은 검사하지 않는다.
- 차이: 실행 슬롯 소유와 제품 파일 쓰기 소유는 다르며 공통 파일 교집합을 막는 자동 관문은 없다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D-USR-2026-11-16-7; D01051. 근거: 요청 J 여러 단위가 같은 부품을 동시에 고치지 않도록 부품 소유 표, 고정 장치 없이 화면을 바꾸는 변경은 금지; D01051.

| 공통 경계 | 조율할 단위 | 이 파일의 관련 작업 | 충돌 방지 |
|---|---|---|---|
| 연결 상태·도구·칩 | T1, U-01, B1 | 02, 04, 14 | 상태 계약 변경 담당 한 명, 6표면 소비자는 순차 적용 |
| 사건 감지·workspace·근거 | L1 발견 사항 담당, 인시던트 단위, B1 | 04, 05, 07, 08, 10 | key/target/query/window 계약을 함께 고정 |
| 리소스·GitOps 상세 | U-01~06 및 해당 화면 담당 | 09, 11 | 동일 resource-detail.js 변경 동시 금지 |
| 표·탭·스크롤·아이콘 | polish, parity, C1 | 11, 17 | 공통 kit 소유자 변경 뒤 소비 화면 검수 |
| 시나리오·장기 관찰 | L1, U-45~52 | 12, 15, 17 | heavy.lock·conflicts·복구 receipt 준수 |
| 보고·비용·대화 | 해당 기능 단위 | 13, 16, 14 | 실제 저장/내보내기 계약 담당과 조율 |

## 충돌과 최신 결정

| 관련 원천 | 이 영역의 최종 적용 | 근거·남은 일 |
|---|---|---|
| D00079의 첫 화면 순서, D00331의 그래프 우선 제안 | D00919의 상태 막대→지표→상태·컨테이너 표→조건→종류별 속성→라벨. 문제 상태를 먼저 판단 | Q17, R01. 그래프 우선으로 되돌리지 않음 |
| D00081의 Ready/전체, D00325·D00351의 숫자/시간 알약, D00776의 혼합 표시 | D01033·D01034 적용: [RULE-TONE](rules.md#RULE-TONE), [RULE-RESTARTS](rules.md#RULE-RESTARTS), [RULE-SORT](rules.md#RULE-SORT) | I06, R06. 예전 분수·숫자/상태 혼합은 새 요구로 복원하지 않음 |
| D00344의 진행률, D00951의 일부 진행률 제거 | D00953의 전체 진행률 제거와 D00952·D00955의 판단 정보 보강 | R01. 실제 판단에 필요한 머리 값으로 대체 |
| D00506의 미연결 인시던트→에이전트 연결 관리 | 현재 허브·도구 출처 계약과 D00987·D01000에 따라 필요한 출처와 실패를 구분. 에이전트가 없다고 직접 Kubernetes/도구 읽기를 모두 차단하지 않음 | Q16·20, GH:2176 복원 이력. 예전 일괄 안내를 강제하지 않음 |
| D00744·D00774의 많은 시뮬레이션 자료 | 디자인 시뮬레이션 범위의 과거 결정. D00960·D00973·D00975 이후 제품 검수는 실제 앱·실제 클러스터 | V01·02·L01~20. 시뮬레이션을 runtime 증거로 제출 금지 |
| D00611의 전 기간 비교선 | → [RULE-RANGE](rules.md#RULE-RANGE), 후속 D00612 적용 | → [RULE-RANGE](rules.md#RULE-RANGE), 후속 D00612 적용 |
| LAB expect의 Node PVC 사건·crash-loop ImagePull·Application 0 | 현재 결함을 재현하는 값. R08~10의 제품 판정 기준을 대신하지 않음 | T-SRE-08·17 |
| 규칙 기반 감지 D00738과 AI 추론 요구 D00734·D00742 | 감지 규칙·관측 근거·해석·검증을 분리. AI의 문장을 실제 감지·확정 원인·실행 결과로 승격하지 않음 | Q03·05·09~12 |
| 7일 관찰과 짧은 시나리오 restore | s6의 7일 실제 coverage를 별도로 요구. 짧은 restore는 환경 복원 조건 | L06, T-SRE-12 |
| D01045의 작업 뒤 정지 | tasks.md H-000으로 이관 | 제품 목표에서 제외 |

## 원천의 추가 판단 계약

<a id="SRE-Q-21"></a>

### SRE-Q-21 GitOps: 지금 revision은 어디까지 진행했는가

- 목표: 입력: 같은 Application UID의 새 revision과 과거 성공 operation을 연다 → 기대: 목록은 앱·namespace·현재 단계·목표 revision·마지막 적용 revision·Health·최근 변경을 보여 준다. 상세에서 감지·적용·상태 확인·관측을 서로 다른 근거로 판단하고 과거 성공을 새 revision 성공으로 표시하지 않는다. 단계 기록은 시각·컨트롤러·단계·revision·결과·이유·영향 리소스를 갖는다. C-G에서 같은 Application UID·revision·attempt를 대조한다. OutOfSync만으로 적용 중을 표시하지 않는다. 수동 sync 대기와 정책 정지를 구분하고 실제 현재 읽기 성공 후에만 ‘감시 중’으로 표시한다. ‘감시 중’ 옆에는 같은 Application UID의 마지막 데이터 읽기 성공 시각을 보인다. probe·화면 재렌더 시각이나 과거 적용 성공 시각으로 대신하지 않는다. 시각 없이 ‘감시 중’만 보이면 실패다. 갱신 지연은 [RULE-STATE](rules.md#RULE-STATE)의 GitOps 조회 방식과 경계 시각으로 판정한다. diff의 차이 없음/미지원/권한 부족/조회 실패를 구분한다. 목록에서 30초·2회 이내, s2/s5/x01/x02/x07/x12에서 이전 성공·실패 재시도·prune·수동 대기를 판별한다. → 실패: 과거 성공을 새 revision 성공으로 표시하거나 OutOfSync를 적용 중으로 단정하면 실패.
- 추가 조건: 입력 health check 미구성 사례와 구성되어 있으나 확인 자료 없는 사례 → 기대 전자는 상태 검사 없음, 후자는 상태 미확인으로 구별 → 실패 두 상태를 합치거나 둘 중 하나를 성공으로 바꿈. 공통 판정은 [FLOW-GIT-003](flows/gitops-change.md#FLOW-GIT-003)에 연결한다.
- 현재: apps/wake/desktop/gitops-deployment.cjs:10은 Argo operation 기록을 변환하고 resource-detail.js:652는 이미지 차이만 rollout diff로 그린다.
- 차이: 설정만 바뀐 revision의 diff와 승인부터 실제 PR·rollout까지의 실행 연결은 없다.
- 고정 장치: 고정 없음 → T-SRE-04
- 출처: D00100, D00101, D00102, D00103, D00104, D00105, D00106, D00453, D00691. 근거: D00100~D00106, D00453, D00691.

- 답 위치·값·출처: `pages/gitops.js`, `pages/gitops-detail.js`, `data/gitops.js`, `desktop/gitops-deployment.cjs`; Argo Application spec.source/ sources, status.sync.revision, status.history, operationState, health, resource rows; Flux 해당 종류 status의 attempted/applied revision과 conditions. 감지는 컨트롤러가 확인한 목표로, 적용은 실제 시도·시작·결과로, 확인은 같은 revision의 health로 판정한다. Flux가 세부 단계를 주지 않으면 '조정 중·세부 단계 미확인', health check가 없으면 '상태 검사 없음', 자료가 없으면 '상태 미확인'이다.

### SRE-Q-22 진단: 도구 원문과 조사 한계를 알 수 있는가

- 목표: 입력: 원문 오류 코드·명령·revision이 있는 도구 진단을 연다 → 기대: 실제 도구의 오류·명령·로그·필드명은 원문을 보존하고 한국어 설명과 분리한다. 진단이 원본을 고쳐 성공처럼 보이게 하면 안 된다. 인프라 장애 외에 애플리케이션 소스 구현의 결함 가능성도 조사 질문에 남긴다. 소스를 읽지 못했으면 소스 분석 완료나 원인 확정으로 말하지 않는다. 원문 진단 문장의 오류 코드·resource·revision은 원본과 같고, 한국어 설명은 원문 대체가 아니다. 읽기 전용 조회의 성공/403/timeout/connection과 실제 원문을 확인한다. 소스 검토 여부·revision·제약을 원인 분석에 적는다. 도구 상세에서 30초·2회 이내 원인 미확인과 다음 조사를 찾는다. → 실패: 한국어 설명이 원문을 덮거나 읽지 않은 소스를 분석 완료로 표시하면 실패.
- 현재: apps/wake/desktop/ai-run.cjs:153~155는 도구 결과를 대화에 넣고 incident 인수를 used에 추가한다.
- 차이: 도구 실패도 used에 포함될 수 있으며 일반 모델 응답을 소스 분석 완료로 판정하는 근거 검증기는 없다.
- 고정 장치: 고정 없음 → T-SRE-07
- 출처: D00010, D00034, D00077, D00078, D00742. 근거: D00010, D00034, D00077, D00078, D00742.

- 답 위치·값·출처: `pages/tool-api.js`, `pages/tool-detail.js`, `pages/incident-detail.js`, `pages/chat.js`; 허용된 도구 API의 method/path/params, HTTP status, duration, bytes, body/headers의 비밀 아닌 값, 로그·Git revision. 요청과 응답을 구별하고 허용 조회 경로만 선택한다. 토큰은 body·header 표시나 복사에서 노출하지 않는다.

### SRE-Q-23 알림·namespace·보관 설정이 조사 결과를 바꾸는가

- 목표: 입력: 격리 저장소에서 알림·namespace·보관 설정을 바꾸고 다시 조회한다 → 기대: 알림 설정은 실제 알림 수신에, namespace 표시 설정은 실제 탐색에, 보관 기간은 실제 조회 가능 기간에 반영한다. 설정 값을 저장한 것만으로 동작한다고 표시하지 않는다. 숨긴 namespace의 장애가 전체 정상으로 오인되거나 삭제된 역사 자료가 재발 없음으로 오인되어서는 안 된다. 격리 userData에서 설정 전후의 알림 수신·namespace 행/검색·역사 조회 범위를 기록한다. 보관 종료를 자료 없음으로 표시하고 현재 건강 0으로 계산하지 않는다. 자동 삭제 시험은 격리된 시험 저장소에서만 한다. 설정에서 60초·3회 이내 적용 여부와 조사 범위를 설명한다. → 실패: 숨긴 namespace 장애를 전체 정상으로 세거나 만료 자료를 재발 없음으로 쓰면 실패.
- 현재: apps/wake/app.config.js:223·259는 보관 기간·알림 설정을 disabled로 선언한다.
- 차이: 해당 설정의 실행 효과가 연결되지 않았고 선택 값을 실제 보관 삭제·알림 발송 결과로 해석할 수 없다.
- 고정 장치: 고정 없음 → T-SRE-02
- 출처: D00993. 근거: D00993.

- 답 위치·값·출처: `apps/wake/settings-pages.js`, `apps/wake/app.config.js` 설정 정의, 알림·목록 scope와 허브 저장 보관 계약. 같은 설정을 읽는 실제 소비 경로와 전체/표시 범위를 대조한다.

## SRE-V-07 기존 판정의 남은 지적과 승계 범위

- 목표: 입력: 열린 U00·B1·U01·T1·C1 지적에 후속 재현 결과를 연결한다 → 기대: 과거 FAIL을 삭제하거나 이후 일부 PASS로 전체 종료 처리하지 않는다. 최신 보고가 같은 반례를 재실행해 해소했다고 명시한 범위만 닫는다. 환경 PASS는 화면·수치·실패 복구 PASS가 아니다. 최신 열린 지적은 U-00 개별 ok 거짓 표시 1건, B1 첫 질문 유실 major 1·실패 근거 이름표/Restarts 잘림/키보드 minor 3, U-01 UID·빈 D6·다른 route 캡처 major 3 및 라벨 미세 차이·알림 순서 minor, T1 부분 열거 실패 도구 소실/상세 오류 소실 major 2·unused 검사 minor 1, C1 clip-path/filter opacity minor 2를 빠짐없이 추적한다. 과거 보고의 미검증 경로는 별도 목록으로 유지한다. 종료 코드 0 외에 각 행 상태·필수 시험 수·데이터 수를 검사하고 `ok kube.probe, state=unreachable`은 실패로 판정한다. → 실패: 부분 PASS나 exit 0만으로 남은 지적 전체를 닫으면 실패.
- 현재: unreachable 개별 결과를 실패시키지만 apps/wake/desktop/ai-run.cjs:135의 no-model 반환은 여전히 기록 전에 있다.
- 차이: 과거 U-00의 행 판정 결함은 수정됐고 B1의 최초 질문 유실은 남아 있어 보고 단위로 일괄 해소할 수 없다.
- 고정 장치: 고정 없음 → T-SRE-01
- 출처: D00457. 근거: B7:11-63,65-101, U3:14-45, T4:11-47, C4:26-39 및 아래 전 차수 목록. D00457·D00458의 검증 수준 구분, 현재 요청의 minor 포함 요구를 적용한다.

세부 반례와 원문 위치는 quality.md Q-H001~Q-H078에 한 번만 보존한다. B1→SRE-Q-15·16/I04·05/R03·06·07, C1→SRE-V-04/R12, T1→SRE-Q-16/I03·07/R02·05, U-00/U-01→SRE-V-01/I01·02·04로 대조한다.

T-SRE-18: 알림·영향 대상·감사 표의 채택 정렬·불변 행 키·검색·숨김 계약을 확정하고 각 표의 동점·좁은 폭·행 왕복 반례로 고정한다. 화면 영역 소유자에게 넘기는 작업이며 문서 검수은 구현하지 않는다.

## SRE-T-COMMON 표 판단과 열 공통 계약

- 목표: 입력: 표 필터·검색·스크롤을 바꾸고 상세로 갔다 돌아온다 → 기대: 출처·빈 값·7상태는 Q-003·Q-004, 단위·좌측 정렬은 SRE-I-06을 따른다. 말줄임은 실제 잘린 값만 전체 툴팁으로 확인하며 키보드로도 연다. 톤은 정상 중립, 실패 danger, 주의 warn이고 숫자에 상태 아이콘을 합치지 않는다. 열 전체에 출처가 없으면 열을 숨기고 표 출처 상태에 이유를 남긴다. 선택 행과 필터·검색·스크롤·대상 UID는 왕복 뒤 유지한다; 실패: UID·선택·필터가 바뀌거나 잘린 값의 전문을 키보드로 읽지 못하면 실패.
- 현재: kit/components/data-table.js, apps/wake/data/kinds.js와 pages/resource-list.js:113~150에 열·행·검색이 있다. 알림은 data/alerts.js:85에서 state·at 정렬만 한다. incident-detail.js:79·128은 입력 순서, 감사 행 키는 배열 순번이다.
- 차이: 채택 정렬·동점 키·숨김 순서가 계약으로 고정되지 않았다. T-SRE-18. 비용의 무효 align 속성은 → [RULE-SORT](rules.md#RULE-SORT).
- 고정 장치: 고정 없음 → T-SRE-18
- 출처: D00066, D00067, D00074, D00088, D00093, D01033, D01034, D01051. 아래 정렬은 D-USR-2026-11-16-2, 검색·숨김 순서는 D-USR-2026-11-16-7의 기본값이다.

기본·사용자 선택·동점·결손 정렬은 → [RULE-SORT](rules.md#RULE-SORT). 새 결과의 적용 시점은 읽던 행을 보존하는 화면별 갱신 계약을 따른다.

### SRE-T-ALERT 알림 판단 표

- 목표: → [RULE-SORT](rules.md#RULE-SORT). Watchdog는 제외한다. 행은 같은 cluster·fingerprint·구간의 알림 상세로 간다. 검색은 이름·대상, 거르기는 상태·기간에 적용한다. SRE는 지금 대응할 알림과 지속 시간을 판단한다; 
- 현재: apps/wake/pages/alerts.js:43~57, data/alerts.js:83~85; Watchdog 제외·상태/기간 거르기·이름/대상 검색은 존재한다.
- 차이: 최신 시각·불변 동점 키 정렬이 필요하다. T-SRE-18.
- 고정 장치: 고정 없음 → T-SRE-18
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00091, D01006, D01051.

| 열 | 종류 | 원본·계산 | 표시 | 정렬 기준 | 톤 | 툴팁 | 숨김 순서 | 차이 | 목표 | 현재 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 이름 | text | labels.alertname→name | 원문 한 줄 | name↑·불변 ID↑ | 공통 | 잘린 전체 이름 | 0 | 열 머리 정렬 동작이 없다 | 입력: labels.alertname=HighCPU → 기대: 이름 칸에 HighCPU 한 줄(labels.alertname→name; 정렬·톤·툴팁·숨김은 해당 칸) → 실패: 다른 이름·내부 키가 보이면 실패 | `apps/wake/pages/alerts.js:52` `{ id: 'name', label: t('wake.view.alerts') },` | 고정 없음 → T-SRE-18 | D-USR-2026-11-16-2; D00091, D01006 |
| 상태 | state | live/history.state | firing/pending/resolved | 사용자 선택 시 firing→pending→resolved | → [RULE-TONE](rules.md#RULE-TONE) | 공통 | 0 | 없음(확인: apps/wake/pages/alerts.js:53) | 입력: history.state=firing → 기대: 상태 칸에 firing과 위험 상태 아이콘(live/history.state; 정렬·톤·툴팁·숨김은 해당 칸) → 실패: resolved로 바꾸거나 배지 바탕을 만들면 실패 | `apps/wake/pages/alerts.js:53` `{ id: 'state', label: t('wake.al.state'), width: 'calc(var(--space-16) * 1.5)', fit: true, cell: a => alertState(a.state) },` | 고정 없음 → T-SRE-18 | D-USR-2026-11-16-2; D00091, D01006 |
| 심각도 | enum | labels.severity | 원문 | → RULE-SORT | → RULE-TONE | 공통 | 3 | severity는 원문 글자이고 상태색은 state 열에서 처리한다. 정본 적용의 실제 화면 검증은 남아 있다 | labels.severity 판정은 → [RULE-TONE](rules.md#RULE-TONE), [RULE-SORT](rules.md#RULE-SORT) | `apps/wake/pages/alerts.js:54` `{ id: 'severity', label: t('wake.al.severity'), optional: true, width: 'calc(var(--space-16) * 1.2)' },` | 고정 없음 → T-SRE-18 | D-USR-2026-11-16-2; D00091, D01006 |
| 대상 | resource | labels→target | namespace/kind/name | target↑·ID↑ | 중립 | 잘린 전체 대상·UID는 상세 | 2 | optional만 있으며 숨김 우선순위 2를 지정하지 않는다 | 입력: target={namespace:payments,kind:Pod,name:api} → 기대: 대상 칸에 payments/Pod/api(labels→target; 정렬·톤·툴팁·숨김은 해당 칸) → 실패: namespace를 잃거나 다른 UID 상세로 이동하면 실패 | `apps/wake/pages/alerts.js:55` `{ id: 'target', label: t('wake.al.target'), muted: true, optional: true },` | 고정 없음 → T-SRE-18 | D-USR-2026-11-16-2; D00091, D01006 |
| 시작 | time | startsAt→at | → RULE-TIME | → RULE-SORT | 중립 | → RULE-TIME | 0 | data/alerts.js:85는 state 우선이며 동점 불변 키가 없다 | 원본·계산 열에 연결한 시각의 표시·실패 판정은 → [RULE-TIME](rules.md#RULE-TIME), 정렬은 → [RULE-SORT](rules.md#RULE-SORT) | `apps/wake/pages/alerts.js:56` `{ id: 'at', label: t('wake.al.start'), time: true, width: 'calc(var(--space-40) *.9)', cell: a => when(a.at, now()) },` | 고정 없음 → T-SRE-18 | D-USR-2026-11-16-2; D00091, D01006 |
| 인시던트 | link | incident.number | INC 번호 | 번호↑·ID↑ | 중립 | 공통 | 1 | 번호만 출력하며 인시던트 링크 동작을 지정하지 않는다 | 입력: incident.number=INC-0042 → 기대: 인시던트 칸에 INC-0042와 해당 사건 링크(incident.number; 정렬·톤·툴팁·숨김은 해당 칸) → 실패: 다른 사건을 열거나 링크 없이 번호만 보이면 실패 | `apps/wake/pages/alerts.js:57` `{ id: 'inc', label: t('wake.home.incidents'), optional: true, width: 'calc(var(--space-16) * 1.4)', muted: true, cell: a => a.incident?.number ?? '' }] });` | 고정 없음 → T-SRE-18 | D-USR-2026-11-16-2; D00091, D01006 |

### SRE-T-SCOPE 영향 대상 표

- 목표: → [RULE-SORT](rules.md#RULE-SORT). 행은 같은 UID의 리소스 상세로 간다. 검색은 대상 이름·namespace·kind, 거르기는 인시던트의 cluster·연관 범위에 적용한다. SRE는 장애 대상과 함께 관측된 대상, 재시작·변경 연관성을 구별한다; 실패: 문제 톤·namespace·name·UID 순서가 깨지거나 다른 UID 상세를 열면 실패.
- 현재: apps/wake/pages/incident-detail.js:76~88은 scope 입력 순서이고 행 키가 kind/name이다. 상단 검색은 cluster 범위다.
- 차이: UID 기반 키·정렬 및 범위 내 검색이 필요하다. T-SRE-18. 확인되지 않은 관계는 SRE-Q-07을 따른다.
- 고정 장치: 고정 없음 → T-SRE-18
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00066, D00081, D00092, D00093, D01051.

| 열 | 종류 | 원본·계산 | 표시 | 정렬 기준 | 톤 | 툴팁 | 숨김 순서 | 차이 | 목표 | 현재 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Name | resource | scope[].name·kind·namespace·uid | 이름·종류 아이콘 | namespace/kind/name/UID↑ | 중립 | 잘린 이름 | 0 | 행 id가 kind/name이며 namespace·UID를 쓰지 않는다 | 입력: scope[].name=api, namespace=payments, kind=Pod, uid=u1 → 기대: Name 칸에 api와 Pod 아이콘, u1 상세 이동(scope[].name·kind·namespace·uid; 정렬·톤·툴팁·숨김은 해당 칸) → 실패: 동명이인 u2를 열거나 namespace 없는 키가 충돌하면 실패 | `apps/wake/pages/incident-detail.js:80` `{ id: 'name', label: 'Name', lead: r => ({ icon: KIND_LIST.find(k => k.kind === r.kind)?.icon }) },` | 고정 없음 → T-SRE-18 | D-USR-2026-11-16-2; D00092, D00742 |
| Status | state | scope[].status | 상태 원문 | 표 기본 첫 키 | 상태별 공통 | 상태 사유는 상세 | 0 | scope 입력 순서라 danger·warn 우선 정렬이 없다 | 입력: scope[].status.text=CrashLoopBackOff, tone=danger → 기대: Status 칸에 CrashLoopBackOff와 위험 상태 아이콘(scope[].status; 정렬·톤·툴팁·숨김은 해당 칸) → 실패: 재시작 수를 합쳐 표시하거나 정상 톤이면 실패 | `apps/wake/pages/incident-detail.js:81` `{ id: 'status', label: 'Status', fit: true, cell: r => status(r.status) },` | 고정 없음 → T-SRE-18 | D-USR-2026-11-16-2; D00092, D00742 |
| Restarts | count | restartCount 합·최근 종료 시각 | → RULE-RESTARTS | 원시 횟수↓·UID↑ | → [RULE-RESTARTS](rules.md#RULE-RESTARTS) | 마지막 종료 사유 | 3 | 초기 선언과 fit 경로는 [RULE-WIDTH](rules.md#RULE-WIDTH). 실제 최종 폭은 재검증 전 | → [RULE-RESTARTS](rules.md#RULE-RESTARTS). | `apps/wake/pages/incident-detail.js:82` `{...restartsColumn({ width: 'calc(var(--space-16) + var(--space-2))' }), cell: r => ((r.restarts ?? '') === '' ? '' : restartsColumn().cell(r)) },` | 고정 없음 → T-SRE-18 | D-USR-2026-11-16-2; D01033, D01034 |
| 변경 | text | change.text | 변경 요약 | 원문·UID | 중립 | 전체 변경 요약 | 2 | 현재 한 셀에 요약·절대 시각을 합친다. 별도 시각 열은 미구현 | change.text=ConfigMap updated를 변경 요약으로 표시한다. 셀 의미 분리는 [RULE-TONE](rules.md#RULE-TONE). 이미지가 같아도 실제 설정 변경을 숨기지 않는다 | `apps/wake/pages/incident-detail.js:83` `{ id: 'change', label: t('wake.inc.scope.change'), muted: true, optional: true, width: 'calc(var(--space-16) * 2.4)', cell: r => (r.change ? '${r.change.text} ${when(r.change.at, inc.now)}' : '') }] });` | 고정 없음 → T-SRE-18 | D-USR-2026-11-16-2; D00092, D00742 |
| 변경 시각 | time | change.at | → RULE-TIME | → RULE-SORT | 공통 | → RULE-TIME | 1 | 현재 change 열에 합쳐져 있으며 독립 열 없음 | change.at의 표시·정렬은 [RULE-TIME](rules.md#RULE-TIME), [RULE-SORT](rules.md#RULE-SORT). 변경 요약과 같은 대상 UID를 유지 | `apps/wake/pages/incident-detail.js:83`의 when(r.change.at, inc.now)는 절대 시각을 반환 | 고정 없음 → T-SRE-18 | D01033, D01034 |

변경 요약과 시각의 별도 열 및 숨김 순서는 10차 문서 정리의 기본값 채택(번복 가능)이다. 오른쪽 변경 시각 → 변경 요약 → Restarts 순으로 숨긴다. 근거는 [RULE-TONE](rules.md#RULE-TONE)의 셀 의미 분리와 [RULE-WIDTH](rules.md#RULE-WIDTH)의 좁은 폭 처리다. 새 열 자체의 개별 사용자 승인 기록은 없으며 이 기본값을 화면 추가 승인으로 해석하지 않는다.

### SRE-T-AUDIT 승인·실행 기록 표

- 목표: → [RULE-SORT](rules.md#RULE-SORT). 실패 행만 위로 옮겨 시간 순서를 깨지 않는다. 행 선택은 같은 approval/request/incident 근거를 연다. 검색은 주체·동작·결과, 거르기는 현재 인시던트·기간에 적용한다. SRE는 요청·승인·실행·확인 중 누가 무엇을 했는지 판단한다; 실패: 실패 행 우선으로 시간 순서를 바꾸거나 다른 approval 근거를 열면 실패.
- 현재: apps/wake/pages/incident-detail.js:126~135에 at·summary·permission 열, 배열 순번 key가 있고 행 동작·표 검색은 없다.
- 차이: 불변 키·명시 정렬·감사 근거 이동·검색 적용이 필요하다. T-SRE-18; 승인과 실행 연결은 T-SRE-05.
- 고정 장치: 고정 없음 → T-SRE-18
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00869, D00092, D01051.

| 열 | 종류 | 원본·계산 | 표시 | 정렬 기준 | 톤 | 툴팁 | 숨김 순서 | 차이 | 목표 | 현재 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 시각 | time | audit[].at | → RULE-TIME | → RULE-SORT | 중립 | → RULE-TIME | 0 | 행 키가 배열 순번 aN이며 불변 audit ID가 아니다 | 원본·계산 열에 연결한 시각의 표시·실패 판정은 → [RULE-TIME](rules.md#RULE-TIME), 정렬은 → [RULE-SORT](rules.md#RULE-SORT) | `apps/wake/pages/incident-detail.js:129` `{ id: 'at', label: one ? '${t('wake.inc.record.time')} · ${ymd(rows[0].at)}' : t('wake.inc.record.time'), time: true, width: one ? 'calc(var(--space-16) * 2)' : 'calc(var(--space-40) * 1.1)', cell: r => (one ? hms(r.at) : '${ymd(r.at)} ${hms(r.at)}') },` | 고정 없음 → T-SRE-18 | D-USR-2026-11-16-2; D00092, D00742 |
| 주체·동작 | actor/text | requester·summary·transport·result | 사용자 표식·동작·출처 | actor/action↑·ID↑ | 실패 결과만 위험 | 잘린 원문 | 0 | 표에 rowAction이 없어 감사 근거로 이동하지 않는다 | → [RULE-APPROVAL](rules.md#RULE-APPROVAL). | `apps/wake/pages/incident-detail.js:130` `{ id: 'summary', label: t('wake.inc.record.who'), cell: r => html'${requesterMark(r)} ${auditSummary(t, r)} ${sourceBadge(t, r)}' },` | 고정 없음 → T-SRE-18 | D-USR-2026-11-16-2; D00092, D00742 |
| 권한 | enum | permission | 실제 승인 정책 값 | permission↑·ID↑ | 위험 권한만 주의 | 실제 권한 범위 | 1 | 권한 열의 검색·정렬을 연결하지 않는다 | 입력: permission=ask인 승인 요청 → 기대: 권한 칸에 실제 정책 ask(permission; 정렬·톤·툴팁·숨김은 해당 칸) → 실패: read로 바꾸거나 승인 범위 전문을 읽을 수 없으면 실패 | `apps/wake/pages/incident-detail.js:131` `{ id: 'permission', label: t('wake.inc.record.perm'), muted: true, optional: true, width: 'calc(var(--space-40) * 1.4)' }] });` | 고정 없음 → T-SRE-18 | D-USR-2026-11-16-2; D00092, D00742 |

자원별 전체 열 정의는 화면 영역의 소유다. 이 영역에서는 Q-U-10~32로 열별 원본·판단을 인계하며 중복 열 사본을 만들지 않는다. 문서 안 실행·매핑 표는 제품 UI가 아니므로 정렬·툴팁·좁은 폭 규칙의 대상이 아니다.
