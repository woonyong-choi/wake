# 리소스 목록

<a id="SCR-RESOURCE-LIST"></a> 진입: `wake://cluster/:cluster/resources; wake://cluster/:cluster/ns/:ns/:kind`. 목적(SRE 판단): 상태·재시작·사용량이 나쁜 대상을 찾아 상세로 간다.
구성: pageColumn → 종류 선택·검색·namespace·상태 거르기·기간 → 종류별 summaryBar → dataTable → pager.
현재: [apps/wake/pages/resource-list.js](../../apps/wake/pages/resource-list.js); [apps/wake/data/kinds.js](../../apps/wake/data/kinds.js); [apps/wake/data/index.js](../../apps/wake/data/index.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 종류·지원 탭·판단 값, 목록 행, CPU·메모리 사용량, 개수·페이지; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.

자료: Kubernetes resources의 kind·metadata.uid·namespace/name·status와 timeBasis, metrics.usage의 관측값을 사용한다. 종류별 columns/facts/tabs는 아래 정의 목록을 참조하며 Secret 읽기 금지가 우선한다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-LIST-01"></a> `SCR-RESOURCE-LIST-01` | 리소스 목록 주소에서 Node를 열고 기간을 바꾼다 → Kubernetes 목록을 pageColumn 안의 종류/검색/namespace/상태/기간 도구→summaryBar→표→pager 순으로 표시한다 → 기간 조작 부재나 다른 종류 값이면 실패 | apps/wake/pages/resource-list.js:152 resources()는 머리·종류·도구·표를 만들고 :178은 스크롤 pageColumn에 넣는다 | 일반 리소스 목록에는 기간 선택 도구가 없다. evRange는 Event 목록에만 적용된다 | 고정 없음 → TASK-SCREEN-RESOURCE-LIST | D00074, D00450 |
| <a id="SCR-RESOURCE-LIST-V01"></a> `SCR-RESOURCE-LIST-V01` | 등록된 종류와 미등록 종류 주소를 각각 연다 → 아래 종류별 상세 진입 표의 columns/facts/tabs만 제공하고 미등록 종류를 지원 완료로 표시하지 않는다 → 미등록 종류에 Pod 열/탭을 대신 표시하면 실패 | apps/wake/data/kinds.js:199 KIND_LIST는 15종류의 columns/facts/tabs를 정의하고 apps/wake/pages/resource-list.js:30은 해당 kind를 조회한다 | 없음(확인: apps/wake/data/kinds.js:199) | apps/wake/pages/resource-pages.test.mjs — `normal: all declared kinds and tabs render using the fixture cluster` | D00491, D00492 |
| <a id="SCR-RESOURCE-LIST-V02"></a> `SCR-RESOURCE-LIST-V02` | 같은 namespace/name의 UID A와 B 목록 스냅숏을 시간순으로 준다 → 각 행의 metadata.uid·namespace/name과 timeBasis 관측 시점을 유지하고 상세 링크에도 UID를 넣는다 → 이름만으로 두 객체를 합치거나 현재 시각을 관측 시각으로 표시하면 실패 | apps/wake/pages/resource-list.js:122 idOf()는 UID를 우선하고 :123 open()은 uid와 at를 상세 주소에 넣는다 | UID가 없는 행은 namespace/name 키로 폴백하며 표에 관측 시각을 독립 표시하지 않는다 | 고정 없음 → TASK-SCREEN-RESOURCE-LIST | D00066, D00450 |
| <a id="SCR-RESOURCE-LIST-V03"></a> `SCR-RESOURCE-LIST-V03` | 과거 at가 있는 Pod 목록을 열고 현재 metrics.usage 응답을 준비한다 → 과거 스냅숏에 현재 CPU/memory를 합치지 않고 사용량 출처가 없으면 열을 숨긴다 → 현재 m/Mi 수치가 과거 행에 보이면 실패 | apps/wake/pages/resource-list.js:43은 q0.at이 undefined일 때만 usage를 요청하고 :113은 모두 빈 열을 제외한다 | 없음(확인: apps/wake/pages/resource-list.js:43) | 고정 없음 → TASK-SCREEN-RESOURCE-LIST | D00450 |
| <a id="SCR-RESOURCE-LIST-V04"></a> `SCR-RESOURCE-LIST-V04` | 45행 목록의 3페이지에서 namespace·문제 여부·검색을 바꾼다 → pg=1로 돌아가고 필터 모수·표시 1–20·전체 원본 수를 구별한다 → 필터 후 3페이지 유지나 원본 수를 결과 수로 표시하면 실패 | apps/wake/pages/resource-list.js:143은 필터 후 total/page를 계산하고 :198~205 상태 필터는 pg=1로 재설정한다 | 머리와 pager는 필터 후 total만 표시하고 전체 원본 수를 별도로 보여주지 않는다 | apps/wake/pages/resource-pages.test.mjs — `list: the problem filter and the page size of 20 keep a range row` | D00074; D00447; D-USR-2026-11-16-7 (20행·페이지 초기화) |
| <a id="SCR-RESOURCE-LIST-A01"></a> `SCR-RESOURCE-LIST-A01` | 리소스 종류 목록을 열고 Node와 Pod를 차례로 선택한다 → Node를 종류 목록의 앞에 둔다. 지원 종류를 누르면 그 종류의 열 머리와 뼈대를 먼저 그린다 → Node가 앞에 없거나 Pod에도 Node 열 뼈대가 남으면 실패 | apps/wake/data/kinds.js:244 KIND_ORDER는 nodes로 시작하며 apps/wake/pages/resource-list.js:138은 선택 kind.columns로 skeletonTable을 만든다 | 없음(확인: apps/wake/data/kinds.js:244) | 고정 없음 → TASK-SCREEN-RESOURCE-LIST | D00782, D01027 |
| <a id="SCR-RESOURCE-LIST-A02"></a> `SCR-RESOURCE-LIST-A02` | UID A 행을 열었다가 같은 이름 UID B로 교체된 뒤 복귀한다 → 상세는 요청 UID와 실제 raw.metadata.uid를 확인하고 목록 복귀 시 검색·필터·스크롤·선택 행을 복원한다 → A 응답을 B로 표시하거나 복귀가 첫 행으로 이동하면 실패 | apps/wake/pages/resource-list.js:123은 uid/at 주소를 만들고 :180 onDetail()은 닫힐 때 focusOpener()를 호출한다 | 목록에서 사라진 UID의 복귀 대체 위치를 정하는 분기가 없다 | 고정 없음 → TASK-SCREEN-RESOURCE-LIST | D00094, D00066 |
| <a id="SCR-RESOURCE-LIST-A03"></a> `SCR-RESOURCE-LIST-A03` | q·only·pst·node·owner·namespace를 함께 적용한다 → pass()를 통과한 같은 행 집합으로 표와 summaryBar 판단값을 만든다 → 표에서 제외한 Pod가 머리 문제 개수에 포함되면 실패 | apps/wake/pages/resource-list.js:117 pass()가 여섯 조건을 조합하고 :149 factItems(list)에 동일 필터 결과를 넘긴다 | 없음(확인: apps/wake/pages/resource-list.js:117) | 고정 없음 → TASK-SCREEN-RESOURCE-LIST | D00074; D00447; D-USR-2026-11-16-7 (집계 입력 일치) |
| <a id="SCR-RESOURCE-LIST-G01"></a> `SCR-RESOURCE-LIST-G01` | 등록된 리소스 종류마다 목록을 연다 → 각 종류의 components/tables 계약에 선언한 열·종류·단위·빈 값이 나온다 → Pod 열을 다른 종류에 재사용하거나 미등록 열을 정상으로 표시하면 실패 | apps/wake/pages/resource-list.js:98 CELL과 :113 columns()가 kind.columns를 값/셀 렌더에 매핑하고 모두 결측인 선택 열을 뺀다 | 없음(확인: apps/wake/pages/resource-list.js:98) | apps/wake/pages/resource-pages.test.mjs — `list: a kind table drops a column no row has a value for (no source, no column) and counts the head from the listed rows` | D00447 |
| <a id="SCR-RESOURCE-LIST-G02"></a> `SCR-RESOURCE-LIST-G02` | UID A 요청 대기 중 대상이 UID B로 교체된 뒤 A 응답을 완료한다 → B는 새 읽기가 끝날 때까지 미확인 상태를 유지한다 → A 응답으로 B를 ready로 표시하면 실패 | apps/wake/pages/resource-list.js:49 주 목록은 request를 확인하지만 :43 usage 응답은 disposed만 확인하며 :109는 ns/name으로 결합한다 | 이전 usage 응답이 새 UID의 같은 이름 행에 합쳐질 수 있다. 주 목록 응답 순서만 보호된다 | apps/wake/pages/resource-pages.test.mjs — `list: concurrent retry ignores older success after newer denial` | D00066, D-USR-2026-11-16-7 |
| <a id="SCR-RESOURCE-LIST-G03"></a> `SCR-RESOURCE-LIST-G03` | → [RULE-SECRET](../rules.md#RULE-SECRET). | apps/wake/data/index.js:25 list('secrets')는 service 호출 전에 forbidden으로 거부하며 apps/wake/desktop/services.cjs:420도 secrets를 차단한다 | 없음(확인: apps/wake/data/index.js:25) | 고정 없음 → TASK-SCREEN-RESOURCE-LIST | D-01, C-003 |

## 표별 판단 계약

열의 원본식·단위·톤·툴팁·숨김 순서는 머리의 구성 요소 계약을 참조한다.

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-LIST-TABLE"></a> `SCR-RESOURCE-LIST-TABLE` | → [RULE-SORT](../rules.md#RULE-SORT). | apps/wake/pages/resource-list.js:143 pass() 결과를 :147에서 그대로 slice해 표에 전달한다 | 필터는 있으나 위험→주의 및 namespace/name/UID 정렬 단계가 없다 | 고정 없음 → TASK-SCREEN-RESOURCE-LIST | D-USR-2026-11-16-2, D-USR-2026-11-16-7 |

## 종류별 상세 진입

| 종류 | kinds.js 줄 | 현재 지원 탭 | 요약 판단값 | 표 상세 |
|---|---|---|---|---|
| Pod / `pods` | 199 | 'summary', 'events', 'logs', 'yaml', 'relations' | 'ready', 'containers', 'restarts', 'lastExit', 'node', 'ip', 'age' | [CMP-K-PODS-01](../components/tables/resource-pods.md) |
| Deployment / `deployments` | 202 | 'summary', 'events', 'logs', 'rollout', 'yaml', 'relations' | 'ready', 'desired', 'upToDate', 'available', 'age' | [CMP-K-DEPLOYMENTS-01](../components/tables/resource-deployments.md) |
| StatefulSet / `statefulsets` | 206 | 'summary', 'events', 'logs', 'yaml', 'relations' | 'ready', 'desired', 'upToDate', 'age' | [CMP-K-STATEFULSETS-01](../components/tables/resource-statefulsets.md) |
| DaemonSet / `daemonsets` | 209 | 'summary', 'events', 'logs', 'yaml', 'relations' | 'desired', 'current', 'ready', 'available', 'age' | [CMP-K-DAEMONSETS-01](../components/tables/resource-daemonsets.md) |
| CronJob / `cronjobs` | 212 | 'summary', 'events', 'runs', 'yaml' | 'schedule', 'timeZone', 'suspend', 'active', 'activeJobs', 'lastSchedule', 'lastSuccess', 'age' | [CMP-K-CRONJOBS-01](../components/tables/resource-cronjobs.md) |
| Service / `services` | 216 | 'summary', 'events', 'yaml', 'relations' | 'type', 'clusterIP', 'externalIP', 'ports', 'age' | [CMP-K-SERVICES-01](../components/tables/resource-services.md) |
| PersistentVolumeClaim / `persistentvolumeclaims` | 219 | 'summary', 'events', 'yaml' | 'requested', 'capacity', 'age' | [CMP-K-PERSISTENTVOLUMECLAIMS-01](../components/tables/resource-persistentvolumeclaims.md) |
| Job / `jobs` | 222 | 'summary', 'events', 'logs', 'yaml' | 'succeeded', 'completions', 'failedPods', 'duration', 'age' | [CMP-K-JOBS-01](../components/tables/resource-jobs.md) |
| ReplicaSet / `replicasets` | 225 | 'summary', 'events', 'logs', 'yaml' | 'desired', 'current', 'ready', 'available', 'revision', 'age' | [CMP-K-REPLICASETS-01](../components/tables/resource-replicasets.md) |
| HorizontalPodAutoscaler / `horizontalpodautoscalers` | 228 | 'summary', 'events', 'yaml' | 'min', 'max', 'current', 'desired', 'age' | [CMP-K-HORIZONTALPODAUTOSCALERS-01](../components/tables/resource-horizontalpodautoscalers.md) |
| Ingress / `ingresses` | 231 | 'summary', 'events', 'yaml', 'relations' | 'class', 'hosts', 'address', 'age' | [CMP-K-INGRESSES-01](../components/tables/resource-ingresses.md) |
| Secret / `secrets` | 233 | 'summary', 'events' | 'type', 'keys', 'age' | [CMP-K-SECRETS-01](../components/tables/resource-secrets.md) |
| ConfigMap / `configmaps` | 235 | 'summary', 'yaml' | 'keys', 'age' | [CMP-K-CONFIGMAPS-01](../components/tables/resource-configmaps.md) |
| Node / `nodes` | 237 | 'summary', 'events', 'yaml', 'relations' | 'roles', 'version', 'internalIP', 'cpu', 'memory', 'age' | [CMP-K-NODES-01](../components/tables/resource-nodes.md) |
| Event / `events` | 241 | 'summary', 'yaml' | 사건 reason/type/대상 | [CMP-K-EVENTS-01](../components/tables/resource-events.md) |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-KINDS"></a> `SCR-RESOURCE-KINDS` | Node가 뒤에 오는 종류 응답과 kind별 객체를 준다 → 종류 선택은 Node가 처음이며 등록된 목록/상세에는 이름·namespace·상태·판단값과 지원 탭만 표시한다 → API 순서로 Node가 밀리거나 모든 종류에 같은 탭이면 실패 | apps/wake/data/kinds.js:244 KIND_ORDER와 :199~241의 종류별 columns/facts/tabs를 목록과 상세가 공유한다 | 없음(확인: apps/wake/data/kinds.js:244) | apps/wake/pages/resource-pages.test.mjs — `normal: all declared kinds and tabs render using the fixture cluster` | D00074, D00175, D00491, D00492, D00782 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-LIST-KINDS"></a> `SCR-RESOURCE-LIST-KINDS` | 1. 등록된 kind 행을 선택한다 → 종류별 상세 진입 표의 동일 UID·namespace/name으로 상세를 열고 tabs에 없는 기능은 숨기며 Secret은 G03 제한을 따른다 → 다른 kind 상세나 Secret 읽기 요청이면 실패.<br>2. 입력 여러 namespace에 같은 이름 Pod가 있는 전체 목록 및 checkout Pod 상세 → 기대 Namespace 열을 보이고 상세 머리 Logs에서 같은 UID/container의 이전 로그와 복귀를 제공 → 실패 namespace를 내부 파라미터로만 보존하거나 머리 Logs 진입이 없음. | apps/wake/pages/resource-list.js:123 open()은 현재 plural과 행 식별자를 사용하고 apps/wake/pages/resource-detail.js:354 loadResource()가 해당 상세를 읽는다 | 추가 대조: D00507: namespace를 내부 파라미터로만 보존하거나 머리 Logs 진입이 없음. | 고정 없음 → TASK-SCREEN-RESOURCE-LIST | D00492; D00507 |
| <a id="SCR-RESOURCE-LIST-UNSUPPORTED"></a> `SCR-RESOURCE-LIST-UNSUPPORTED` | Certificate·PersistentVolume·PodDisruptionBudget 종류로 진입한다 → 각 종류의 상태·판단값과 목록/상세를 제공하며 Secret 제한은 유지한다 → Pod 값 대체나 빈 성공이면 실패 | apps/wake/data/kinds.js:199~244 KIND_LIST/KIND_ORDER에는 Certificate·PersistentVolume·PodDisruptionBudget이 없다 | 세 종류의 등록·columns/facts/tabs와 조회 경로가 없다. 이 세부 지원 범위는 D-USR-2026-11-16-7 기본값이다 | 고정 없음 → TASK-SCREEN-RESOURCE-LIST | D00492, D-USR-2026-11-16-7 |
| <a id="SCR-RESOURCE-LIST-REQ-R-044"></a> `SCR-RESOURCE-LIST-REQ-R-044` | 각 등록 종류를 실제 Kubernetes와 연결해 읽고 사용량·관계 보조 읽기 중 하나를 실패시킨다 → 지원 탭의 값/조건/Event/log/YAML은 해당 출처 값을 쓰고 실패한 보조 자료는 미확인으로 표시한다 → 관계 조회 실패를 관련 Pod 0개로 표시하면 실패 | apps/wake/pages/resource-list.js:47 Node/PVC 관련 pods 실패는 []로 바꾸고 :43 usage 실패는 null로 만든다 | Node/PVC 관련 Pod 읽기 실패가 정상 0개로 합쳐진다. 사용량 열은 실패 이유 없이 숨겨진다 | 고정 없음 → TASK-SCREEN-RESOURCE-LIST | D00450 |

<a id="SCR-RESOURCE-METRIC-COLUMNS"></a>


## SCR-RESOURCE-METRIC-COLUMNS

- 목표: 입력 대상 종류에 대응하는 CPU·Memory·Network·Filesystem과 클러스터 비용 자료가 존재 → 기대 표에서 해당 지표들을 읽고 홈에서 비용을 읽음; 미지원/미연결은 그 상태로 구별 → 실패 지원되는 지표·비용을 단순 생략하거나 미지원 값을 0으로 조작
- 현재: 리소스 종류의 columns를 목록 표에 사용한다.(`apps/wake/pages/resource-list.js:113`)
- 차이: 종류별 실제 출처가 있는 지표 열과 미지원·미연결 상태를 고정해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-RESOURCE-LIST
- 출처: D00270
