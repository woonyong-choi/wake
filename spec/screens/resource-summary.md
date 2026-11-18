# 리소스 상세 · 요약

<a id="SCR-RESOURCE-SUMMARY"></a> 진입: `wake://cluster/:cluster/ns/:ns/:kind/:name?tab=summary`. 목적(SRE 판단): 상태·컨테이너·조건·한도와 증거로 대상의 이상 이유를 판단한다.
공통 요약 순서: pageHeader → 상태·사양을 합친 summaryBar → 지표 → 컨테이너 → 하위 Pod → Conditions → 추가 속성 → Labels·Annotations.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 상태·사양, 컨테이너, 하위 Pod·Conditions, 리소스 속성; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-SUMMARY-01"></a> `SCR-RESOURCE-SUMMARY-01` | Pod p에 컨테이너·조건·라벨 자료를 넣고 요약을 연다 → 화면 머리의 구성 순서에 따라 p의 Kubernetes 값만 보인다 → 조건이 컨테이너보다 앞서거나 다른 Pod 값이 섞이면 실패 | summary는 statusBar부터 labelsCard까지 정해진 순서로 호출한다 ([`apps/wake/pages/resource-detail.js:570`](../../apps/wake/pages/resource-detail.js#L570)) | 없음(확인: apps/wake/pages/resource-detail.js:570) | apps/wake/pages/resource-pages.test.mjs :: detail: the head has one action, the warning card says why and who manages it, and the summary keeps the rule order | D00919, D01007 |
| <a id="SCR-RESOURCE-SUMMARY-V01"></a> `SCR-RESOURCE-SUMMARY-V01` | Deployment spec.replicas=3, status.readyReplicas=2와 image·strategy·selector를 읽는다 → 상태 막대와 펼친 본문에 Ready 2·Desired 3 및 해당 사양 값이 보인다 → 종류명만 반복하거나 가용 수와 목표 수가 뒤바뀌면 실패 | statusBar는 HEAD_FACTS와 specItems를 한 summaryBar에 합친다 ([`apps/wake/pages/resource-detail.js:488`](../../apps/wake/pages/resource-detail.js#L488)) | 없음(확인: apps/wake/pages/resource-detail.js:488) | 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY | D00082, D01007 |
| <a id="SCR-RESOURCE-SUMMARY-V02"></a> `SCR-RESOURCE-SUMMARY-V02` | Pod 컨테이너가 waiting이고 lastState.terminated.exitCode=137, restartCount=5이다 → State와 Last State·Exit 137·Restarts 5 및 requests/limits를 구분한다 → 이전 종료를 현재 상태로 표시하면 실패 | 컨테이너 표는 state·last·lastExitCode를 분리하고 펼친 행에 resources를 표시한다 ([`apps/wake/pages/resource-detail.js:521`](../../apps/wake/pages/resource-detail.js#L521)) | 없음(확인: apps/wake/pages/resource-detail.js:521) | 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY | D00081, D00450 |
| <a id="SCR-RESOURCE-SUMMARY-V03"></a> `SCR-RESOURCE-SUMMARY-V03` | Deployment 소유 UID가 일치하는 Pod 13개와 selector만 같은 별도 Pod를 준다 → 소유 Pod만 12행 표시하고 제한된 범위를 밝히며 Conditions는 status.conditions를 쓴다 → selector만 같은 Pod가 들어가거나 12행을 전체라고 표시하면 실패 | 소유 집합 mine을 12개로 자르며 childCoverageRow는 소유 조회 coverage만 검사한다 ([`apps/wake/pages/resource-detail.js:531`](../../apps/wake/pages/resource-detail.js#L531)) | 13개 중 12개라는 표시 제한은 별도 표시하지 않는다 | 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY | D00450; D-USR-2026-11-16-7 |
| <a id="SCR-RESOURCE-SUMMARY-V04"></a> `SCR-RESOURCE-SUMMARY-V04` | Node status.capacity.memory만 있고 allocatable.memory는 빠진다 → Capacity에는 원본 용량이 보이고 Allocatable은 값 없음으로 남는다 → 빠진 allocatable이 0으로 보이면 실패 | propsCards의 byte는 null 값을 빈 문자열로 바꾸고 존재하는 자원 행만 만든다 ([`apps/wake/pages/resource-detail.js:548`](../../apps/wake/pages/resource-detail.js#L548)) | 없음(확인: apps/wake/pages/resource-detail.js:548) | 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY | D00085, D00450 |
| <a id="SCR-RESOURCE-SUMMARY-A01"></a> `SCR-RESOURCE-SUMMARY-A01` | Deployment 상태 요약을 펼친다 → specItems의 image·strategy가 첫 상태 카드 본문에 나타나고 별도 사양 카드는 없다 → 같은 사양 카드가 아래에 다시 나타나면 실패 | more를 상태 summaryBar.body의 propertyGrid로 렌더한다 ([`apps/wake/pages/resource-detail.js:500`](../../apps/wake/pages/resource-detail.js#L500)) | 없음(확인: apps/wake/pages/resource-detail.js:500) | 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY | D01007, D00919 |
| <a id="SCR-RESOURCE-SUMMARY-A02"></a> `SCR-RESOURCE-SUMMARY-A02` | Pod p의 container api에서 현재 로그와 이전 로그를 연다 → kube.logs 요청의 uid·container는 유지하고 previous만 false·true로 달라진다 → sidecar 로그나 새 UID로 바뀌면 실패 | logRequest는 pod·namespace·container·previous와 uid를 조립한다 ([`apps/wake/pages/resource-detail.js:623`](../../apps/wake/pages/resource-detail.js#L623)) | 요약 컨테이너 행은 펼치기만 제공해 행에서 로그로 바로 가는 동작이 없다 | 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY | D00081, D00088 |
| <a id="SCR-RESOURCE-SUMMARY-A03"></a> `SCR-RESOURCE-SUMMARY-A03` | Deployment의 하위 Pod 행을 누른다 → 그 Pod의 정본 상세를 열고 뒤로 가면 원래 Deployment 요약과 선택 행을 복원한다 → 별도 중첩 사양 상세가 생기거나 대상이 바뀌면 실패 | openPod는 mine에서 이름으로 찾은 Pod를 podAddr로 이동한다 ([`apps/wake/pages/resource-detail.js:860`](../../apps/wake/pages/resource-detail.js#L860)) | 선택 행 복원용 상태는 요약에 저장하지 않는다 | 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY | D00450; D-USR-2026-11-16-7 |
| <a id="SCR-RESOURCE-SUMMARY-G01"></a> `SCR-RESOURCE-SUMMARY-G01` | → [RULE-RESTARTS](../rules.md#RULE-RESTARTS); [RULE-WIDTH](../rules.md#RULE-WIDTH) | 하위 Pod의 restartsColumn은 초기 var(--space-16) 폭과 number·fit:true를 사용하며 최종 폭은 data-table fit이 정한다 (`apps/wake/data/kinds.js:25`, `apps/wake/pages/resource-detail.js:534`, `kit/components/data-table.js:172–192`) | fit 경로 있음, 실제 렌더 재검증 전이다. 초기 64px만으로 현재 잘림을 단정하지 않고 SRE-R-06의 문자열·폭·테마 조합을 확인한다 | 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY | D00081, D00450 |
| <a id="SCR-RESOURCE-SUMMARY-G02"></a> `SCR-RESOURCE-SUMMARY-G02` | Secret 종류의 상세 주소를 직접 연다 → 권한 범위 밖(Secret)만 보이고 keyNames·data는 읽지 않는다 → 키 이름 하나라도 표시되면 실패 | Secret 분기가 keyNames를 Data 카드에 렌더하도록 남아 있다 ([`apps/wake/pages/resource-detail.js:557`](../../apps/wake/pages/resource-detail.js#L557)) | Secret 데이터가 공급되면 키 목록을 표시할 수 있는 분기가 존재한다 | 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY | D-01, C-003 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-ORDER"></a> `SCR-RESOURCE-ORDER` | 1. 상태·지표·조건·속성이 모두 있는 리소스를 연다 → 화면 머리의 요약 순서를 유지하고 사양은 상태 막대 안에서 읽는다 → 별도 사양 카드나 순서 역전이면 실패.<br>2. 입력 최신 경고·관련 인시던트·배포 변경이 있는 리소스 상세 → 기대 관련 증거를 최대 3줄로 요약하고 각 원본으로 이동 → 실패 증거 존재에도 요약 또는 원본 진입이 없거나 요약이 3줄 초과.<br>3. 입력 트래픽 관측 없음, 실제 endpoint·backend·host/path 매핑 있음 → 기대 확인된 backend·매핑을 첫 화면 판단 근거로 사용 → 실패 빈 그래프 공간 때문에 실제 backend·매핑이 첫 화면에서 밀림.<br>4. 입력 D00315·D00450에서 구체화된 종류별 필수 정보가 있는 상세 응답 → 기대 아래 ‘종류별 필수 정보’ 표의 각 항목에 대해 원본 값·표시 위치·누락 사유를 공통 형태와 함께 대조 → 실패 표면만 통과시키고 필수 정보가 누락된 상세를 합격 처리.<br>5. 입력 컨테이너 둘의 서로 다른 사용량·상태·포트·requests/limits와 표본 0을 가진 Pod 및 다른 종류 상세 → 기대 요약에서 컨테이너별 지표/필드에 접근하고 동일 정보 탭을 병합; 표본 0은 빈 차트 → 실패 Pod 합계로 컨테이너 차이를 숨김, 필드/그래프 누락 또는 중복 탭 잔존.<br>6. 입력 D00450으로 구체화된 종류별 필수 정보와 1280px 상세 → 기대 필수 정보 존재와 읽기 가능성을 함께 확인 → 실패 토큰/위계 합격만으로 정보 누락 화면 통과.<br>7. 입력 D00450의 종류별 필수 운영 필드를 가진 객체 → 기대 기준 항목별로 실제 원본→표시 위치→누락 상태를 대조 → 실패 필드가 있는데 표시 위치가 없거나 생략을 빈 데이터로 처리.<br>8. 입력 구성 정보가 없는 종류와 실제 필드가 있는 종류 → 기대 정보 없는 구역은 생략하고 있는 종류만 실제 값과 함께 표시 → 실패 내용 없는 구성 제목/카드가 남거나 실제 필드도 함께 사라짐.<br>9. 입력 Pod와 다른 종류의 공통 역할 상세 구역을 같은 폭/테마로 비교 → 기대 종류별 데이터 차이 외 공통 부품·배치·역할 토큰을 일치 → 실패 표면/상태만 맞고 같은 역할 UI가 종류별로 달라짐. 공통 판정은 [B-001](../design.md#B-001)에 연결한다.<br>10. Node에 여러 긴 labels를 제공 → 지정 라벨 구역의 공통 key=value 표현만 사용, 별도 'label … · …' 합성 진단 줄 없음 → 원본 라벨을 별도 메타 줄로 중복 출력하면 실패. | specItems가 종류별 사양과 rawFacts를 모아 상태 막대에 공급한다 ([`apps/wake/pages/resource-detail.js:503`](../../apps/wake/pages/resource-detail.js#L503)) | 추가 대조: D00079: 증거 존재에도 요약 또는 원본 진입이 없거나 요약이 3줄 초과; D00086: 빈 그래프 공간 때문에 실제 backend·매핑이 첫 화면에서 밀림; D00275: 표면만 통과시키고 필수 정보가 누락된 상세를 합격 처리; D00276: Pod 합계로 컨테이너 차이를 숨김, 필드/그래프 누락 또는 중복 탭 잔존; D00305: 토큰/위계 합격만으로 정보 누락 화면 통과; D00315: 필드가 있는데 표시 위치가 없거나 생략을 빈 데이터로 처리; D00385: 내용 없는 구성 제목/카드가 남거나 실제 필드도 함께 사라짐; D00882: 원본 라벨을 별도 메타 줄로 중복 출력하면 실패. | 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY | D00919, D01007; D00079; D00086; D00275; D00276; D00305; D00315; D00385; D00392; D00882 |
| <a id="SCR-RESOURCE-DEPTH"></a> `SCR-RESOURCE-DEPTH` | 요약에서 지표를 펼치고 관련 리소스를 열었다 뒤로 간다 → 지표는 같은 상세 안에 보이고 관련 대상은 정본 상세로 열리며 원래 리소스로 돌아온다 → 동일 대상의 하위 상세를 추가로 쌓으면 실패 | BODY는 같은 상세 페이지에서 summary·relations 등 탭 함수를 선택한다 ([`apps/wake/pages/resource-detail.js:762`](../../apps/wake/pages/resource-detail.js#L762)) | 없음(확인: apps/wake/pages/resource-detail.js:762) | 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY | D00882, D00883, D01007 |

### 종류별 필수 정보

SCR-RESOURCE-ORDER의 D00275·D00315·D00450 대조 목록이다. 각 항목은 원본 필드가 있으면 지정 구역에서 읽을 수 있어야 한다. 미수집·권한 없음·미지원은 이유를 표시하며, 실제 값이 있는데 표시 위치가 없거나 이유 없이 생략하면 실패다.

| 종류 | 필수 정보 | 표시·진입 위치 |
|---|---|---|
| Pod | 재시작 수·마지막 종료 reason/finishedAt, 컨테이너별 상태·사용량·포트·requests/limits | 요약 상태·컨테이너 표·지표, 해당 컨테이너 로그 |
| Deployment | revision, Available·Desired, 소유 관계·관련 ReplicaSet/Pod | 요약 상태·종류별 속성, 관계·변경 원본 |
| Node | Pressure 조건, 저장소 용량·사용량·출처 상태 | 요약 조건·Storage 지표 |
| Service·Ingress | 실제 EndpointSlice 대상, backend, host/path 매핑 | 요약·관계의 실제 대상 링크; 트래픽 미관측과 분리 |
| PVC | 요청 용량, 바인딩 PV·phase, 실사용량·출처 | 요약 속성·지표, PV 원본 링크 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-SUMMARY-REQ-R-027"></a> `SCR-RESOURCE-SUMMARY-REQ-R-027` | Pod와 Deployment 상세를 차례로 연다 → 공통 summaryBar와 kind.tabs의 적용 가능한 탭이 같은 위치에 있고 동일 객체 링크는 정본 상세 주소로 간다 → 종류별 별도 사양 화면이나 중복 상세가 생기면 실패 | 모든 리소스의 tabs를 동일 listToolbar와 pillTabs로 출력한다 ([`apps/wake/pages/resource-detail.js:840`](../../apps/wake/pages/resource-detail.js#L840)) | 없음(확인: apps/wake/pages/resource-detail.js:840) | 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY | D00450, D00919 |

<a id="SCR-RESOURCE-DEPLOYMENT-FACTS"></a>


## SCR-RESOURCE-DEPLOYMENT-FACTS

- 목표: 입력 Deployment 세대 8, 관측된 세대 7과 실제 rollout 자료 → 기대 관측된 세대 및 현재 세대와의 차이를 원본 값으로 읽음 → 실패 observedGeneration 생략·세대 동일시·다른 rollout 값 혼합
- 현재: rawFacts가 Generation과 Observed Generation을 각각 읽는다.(`apps/wake/pages/resource-detail.js:44`)
- 차이: 세대 지연과 rollout 자료를 함께 표시하는 반례를 고정해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY
- 출처: D00082

<a id="SCR-RESOURCE-SET-FACTS"></a>

## SCR-RESOURCE-SET-FACTS

- 목표: 입력 리비전이 다른 StatefulSet과 미배치·사용 불가 노드가 있는 DaemonSet → 기대 StatefulSet의 current/updateRevision·ordinal·PVC, DaemonSet의 노드별 배치·가용 상태를 확인 → 실패 총 Ready만으로 해당 차이와 노드별 문제를 가림
- 현재: HEAD_FACTS에 StatefulSet과 DaemonSet의 서로 다른 요약 필드가 선언되어 있다.(`apps/wake/pages/resource-detail.js:34`)
- 차이: revision·ordinal·PVC 및 노드별 배치의 누락 여부를 종류별로 대조해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY
- 출처: D00083

<a id="SCR-RESOURCE-JOB-ATTEMPTS"></a>

## SCR-RESOURCE-JOB-ATTEMPTS

- 목표: 입력 같은 Job의 실패 Pod와 재시도 Pod, 또는 이력 없는 단일 실행 → 기대 Pod별 시도 기록에서 그 시도의 로그로 이동; 단일 실행은 실행 시각·소요 시간 표시 → 실패 시도 누락·다른 시도의 로그 연결·이력 없음을 가짜 이력으로 채움
- 현재: Job 실행 표에 inspector.rows.items를 전달한다.(`apps/wake/pages/resource-detail.js:664`)
- 차이: 실패·재시도 Pod와 해당 로그의 연결 및 단일 실행 시간을 검증해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY
- 출처: D00084

<a id="SCR-RESOURCE-NODE-COST"></a>

## SCR-RESOURCE-NODE-COST

- 목표: 입력 Node와 동일 대상 비용 조회가 가능한 출처 → 기대 해당 Node의 비용 탐색으로 대상·기간을 보존해 이동 → 실패 비용 근거가 있어도 진입이 없거나 다른 Node/기간으로 이동
- 현재: Node 상세는 capacity·allocatable 용량 표를 만든다.(`apps/wake/pages/resource-detail.js:549`)
- 차이: 같은 Node·기간을 보존하는 비용 진입의 공급 및 이동 검증이 남는다.
- 고정 장치: 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY
- 출처: D00085

<a id="SCR-RESOURCE-CONFIGMAP-FACTS"></a>

## SCR-RESOURCE-CONFIGMAP-FACTS

- 목표: 입력 immutable=true/false 및 해당 필드 읽기 실패 → 기대 원본의 immutable과 확인된 소비 워크로드를 구분해 표시 → 실패 immutable 생략·읽기 실패를 false로 처리·소비 관계 추정
- 현재: rawFacts는 원본이 있을 때 Immutable의 누락을 false로 읽는다.(`apps/wake/pages/resource-detail.js:49`)
- 차이: 원본 조회 실패와 false를 구별하고 확인된 소비 관계를 함께 검증해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY
- 출처: D00087

<a id="SCR-RESOURCE-METRIC-SET"></a>

## SCR-RESOURCE-METRIC-SET

- 목표: 입력 Node 스토리지 자료와 Pod CPU·메모리 자료가 조회 가능 → 기대 Node에서 스토리지를 포함하고 Pod에서 기본 지표를 해당 대상 그래프로 표시 → 실패 조회 가능한 필수 그래프 생략·다른 대상 자료로 대체.
- 추가 조건: 입력 A00122~A00124 문맥의 리소스 상세에 해당하는 실제 시계열 자료 → 기대 상세에서 종류에 맞는 조회 가능한 지표 그래프를 표시 → 실패 공통 차트 존재만 확인하고 상세의 그래프 누락을 허용
- 현재: 상세 지표 reader의 해당 진입은 Pod summary에 한정한다.(`apps/wake/pages/resource-detail.js:183`)
- 차이: Node Storage와 종류별 지원 지표의 공급·누락 상태 및 표시 위치를 확인해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY
- 출처: D00196; D00263

<a id="SCR-RESOURCE-HEAD-LOGS"></a>

## SCR-RESOURCE-HEAD-LOGS

- 목표: checkout Pod 상세 머리에서 Logs를 누른 뒤 previous를 선택하고 돌아온다 → 같은 namespace·UID·container의 이전 로그를 열고 원래 상세 위치로 복귀한다 → 머리의 Logs 진입이 없거나 동명 Pod로 대상이 바뀌거나 복귀 위치를 잃으면 실패. 전체 목록의 Namespace 열은 [SCR-RESOURCE-LIST-KINDS](resource-list.md#SCR-RESOURCE-LIST-KINDS)를 따른다.
- 현재: Pod 상세가 pod 선택값과 로그 상태를 갖는다.(`apps/wake/pages/resource-detail.js:85`)
- 차이: 머리 Logs 진입에서 UID·container·previous 및 돌아갈 위치를 보존하는 검증이 남는다.
- 고정 장치: 고정 없음 → TASK-SCREEN-RESOURCE-SUMMARY
- 출처: D00507
