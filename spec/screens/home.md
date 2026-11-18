# 홈

<a id="SCR-HOME"></a> 진입: `wake://cluster/:cluster`. 목적(SRE 판단): 지금 깨진 대상과 먼저 조사할 사건을 고른다.
구성: pageColumn → viewHeader·sectionTabs → clusterSearch·시간 범위 → summaryBar·chartCard → 인시던트·구성 흐름·문제 Pod·가용하지 않은 워크로드·이벤트·변경·연결·지난 인시던트 카드.
현재: [apps/wake/pages/cluster-home.js](../../apps/wake/pages/cluster-home.js); [apps/wake/data/home.js](../../apps/wake/data/home.js); [apps/wake/data/index.js](../../apps/wake/data/index.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 전체·정상 Node, 문제 Pod, 최근 1시간 Warning 대상 수, 진행 중·지난 인시던트, 문제 Pod·가용하지 않은 워크로드, 구성 흐름, 변경·연결; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-FLOW-01](../components/flow-graph.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-CLUSTER-HOME-01](../components/tables/cluster-home.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-CLUSTER-HOME-01](../components/tables/cluster-home.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: cluster/summary/resources/events/incidents는 data.get의 같은 cluster 응답, 지표는 metricSeries의 query와 from/to, 연결은 toolViews의 저장 근거와 현재 읽기 결과를 사용한다. 표본 시각과 현재 읽기 상태를 구분한다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-HOME-01"></a> `SCR-HOME-01` | 클러스터 홈을 연다 → cluster/summary/resources/incident.list 응답으로 머리·탭·검색/기간·요약·인시던트·지표/구성 흐름·문제 Pod·워크로드·이벤트·변경·연결·지난 사건이 보인다 → 구역 누락·순서 역전이나 타 클러스터 값이면 실패 | home은 머리부터 pastCard까지 순서대로 조립한다(`apps/wake/pages/cluster-home.js:330`). | 없음(확인: apps/wake/pages/cluster-home.js:330) | `apps/wake/pages/cluster-home.test.mjs` — `home_follows_the_simulation_order_and_names_the_missing_incident_store` | D00073; D00195; D00449 |
| <a id="SCR-HOME-V01"></a> `SCR-HOME-V01` | 동일 관측 시각의 Node 3개(Ready 2), 문제 Pod 1개, 한 대상의 Warning 두 Reason을 준다 → 전체/Ready Node 3/2·문제 Pod 1·Warning 대상 1과 발생 Count가 구분된다 → Reason 2개를 대상 2개로 세면 실패 | summaryBar는 total/notReady와 warningSummary.objects를 쓰고 objects는 대상+Reason 행 수다(`apps/wake/pages/cluster-home.js:229`, `apps/wake/data/incident-model.js:149`). | Ready 수를 직접 표시하지 않으며 Warning의 대상 수가 UID 유일 수가 아닌 Reason별 행 수다. | 고정 없음 → TASK-SCREEN-HOME | D00073; D00449 |
| <a id="SCR-HOME-V02"></a> `SCR-HOME-V02` | incident.list에 열린 2건과 해결 3건을 준다 → 진행 카드에 result 없는 2건, 지난 카드에 result 있는 3건이 보인다 → 해결 사건이 열린 목록에 섞이면 실패 | incidentCard는 !result, pastCard는 result로 분리한다(`apps/wake/pages/cluster-home.js:243`, `apps/wake/pages/cluster-home.js:325`). | 없음(확인: apps/wake/pages/cluster-home.js:243) | 고정 없음 → TASK-SCREEN-HOME | D00092; D-USR-2026-11-16-7 |
| <a id="SCR-HOME-V03"></a> `SCR-HOME-V03` | 문제 Pod 12개와 비가용 워크로드 3개를 준다 → Pod 총 12·표시 8을 구분하고 워크로드 3개를 표시한다 → 표의 8개를 전체 8로 안내하면 실패 | badPodsCard는 머리 bad.length와 slice(0,8) 표를 쓰고 워크로드는 전체 rows를 쓴다(`apps/wake/pages/cluster-home.js:270`, `apps/wake/pages/cluster-home.js:280`). | Pod 표의 현재 표시 수 8은 별도 안내하지 않는다. | 고정 없음 → TASK-SCREEN-HOME | D00073; D00449 |
| <a id="SCR-HOME-V04"></a> `SCR-HOME-V04` | 트래픽 계측 없이 pods의 namespace·owner·status만 준다 → 구성 흐름의 노드와 띠 값은 Pod 개수로 보인다 → B/s·요청률이나 실제 통신으로 표시하면 실패 | podFlow는 namespace·workload·상태별 Pod 수를 합산한다(`apps/wake/data/home.js:38`). | 없음(확인: apps/wake/data/home.js:38) | `apps/wake/data/home.test.mjs` — `Pod 상태 흐름: 들어온 양과 나간 양이 같고, 워크로드 상태는 가장 나쁜 Pod` | D00073; D-USR-2026-11-16-7 |
| <a id="SCR-HOME-V05"></a> `SCR-HOME-V05` | 저장한 도구의 현재 읽기를 실패시키고 실제 변경 하나를 준다 → 연결 행은 유지하며 실패 상태를 보이고 변경은 changeMarks의 실제 시각/대상으로 보인다 → 저장 이력을 현재 건강으로 표시하면 실패 | toolSet은 readState와 저장 근거를 toolViews에 넘기고 homeMarks는 changeMarks를 쓴다(`apps/wake/pages/cluster-home.js:138`, `apps/wake/pages/cluster-home.js:299`). | 없음(확인: apps/wake/pages/cluster-home.js:138) | `apps/wake/pages/cluster-home.test.mjs` — `a_connected_tool_that_stops_answering_keeps_its_chip_and_shows_it_down` | D00017; D00449 |
| <a id="SCR-HOME-A01"></a> `SCR-HOME-A01` | 대상 상세를 열고 뒤로 이동한다 → 문제 Pod→상세→이전 로그→인시던트→revision을 조사하고 뒤로 돌아왔을 때 cluster/namespace/검색/기간/선택을 보존한다 → 대상·컨테이너·조회 구간이 다른 로그를 열면 실패 | Pod 이동은 ns/name 주소만 전달하고 사건 이동도 기간 인수 없이 연다(`apps/wake/pages/cluster-home.js:421`, `apps/wake/pages/cluster-home.js:422`). | UID·컨테이너·절대 구간을 조사 흐름 전체에 넘기는 연결이 빠졌다. | 고정 없음 → TASK-SCREEN-HOME | D00066; D00094 |
| <a id="SCR-HOME-A02"></a> `SCR-HOME-A02` | 카드를 접은 뒤 60초 갱신을 받는다 → 카드는 진입 시 한 번만 자동 펼침을 정하고 이후 갱신은 머리 상태만 바꾼다. 사람이 접은 카드는 60초 갱신으로 열리지 않는다 → 갱신이 펼침 상태를 바꾸거나 화면 위치를 밀면 실패 | isOpen은 사람의 folded 상태와 첫 decided 상태를 유지한다(`apps/wake/pages/cluster-home.js:51`). | 없음(확인: apps/wake/pages/cluster-home.js:51) | `apps/wake/pages/cluster-home.test.mjs` — `a_metric_bar_crossing_its_threshold_after_the_first_drawing_stays_closed_and_marks_its_head` | D01021 |
| <a id="SCR-HOME-A03"></a> `SCR-HOME-A03` | 홈의 도구 칩과 에이전트 칩을 각각 누른다 → connections[].id로 같은 클러스터의 tools?tool 또는 agents 본문을 열고 연결 설정은 설정 화면에서 수행한다 → 칩이 설정이나 다른 도구 본문을 열면 실패 | wake.home.source는 agent 본문 또는 tools?tool 주소로 이동한다(`apps/wake/pages/cluster-home.js:420`). | 없음(확인: apps/wake/pages/cluster-home.js:420) | `apps/wake/pages/cluster-home.test.mjs` — `home_source_chips_show_only_connected_tools_and_an_installed_agent_and_open_their_cluster_screens` | D00992 |
| <a id="SCR-HOME-G01"></a> `SCR-HOME-G01` | 워크로드 종류 중 하나의 읽기만 실패시킨다 → 실패 출처와 나머지 성공 값을 함께 표시한다 → 실패 종류를 빈 배열의 정상 0으로 합산하면 실패 | workloads의 종류별 조회 실패는 catch(() => [])로 바뀐다(`apps/wake/pages/cluster-home.js:94`). | 실패 종류 정보가 소실되어 비가용 워크로드를 정상 0으로 표시할 수 있다. | 고정 없음 → TASK-SCREEN-HOME | D00073; D00449 |
| <a id="SCR-HOME-G02"></a> `SCR-HOME-G02` | 저장된 도구와 같은 Service UID에서 Endpoints 읽기를 실패시킨다 → 도구 행은 유지하고 건강 실패·재시도를 표시한다 → 홈 칩이나 연결 카드에서 저장 도구가 사라지면 실패 | connCard()는 저장 연결 행을 유지하고 목록 실패에만 stateRow를 붙인다(`apps/wake/pages/cluster-home.js:312`). | 목록 읽기 실패에는 재시도가 있지만 개별 도구 건강 실패 행은 본문 이동만 제공해 그 자리에서 Endpoints를 재조회할 수 없다. | 고정 없음 → TASK-SCREEN-HOME | D00449; D00992 |
| <a id="SCR-HOME-G03"></a> `SCR-HOME-G03` | 동일 UID·구간에서 정상·로딩·빈 응답·오류를 차례로 준다 → summary·카드가 머리의 7상태 계약을 따르고 오류를 정상 0으로 바꾸지 않는다 → 실패 출처가 사라지거나 지난 값을 새 성공으로 표시하면 실패 | reads는 key별 pending/failures를 기록하지만 workload 하위 catch가 실패를 흡수한다(`apps/wake/pages/cluster-home.js:94`, `apps/wake/pages/cluster-home.js:103`). | 상위 읽기는 구분하지만 하위 종류별 실패는 같은 7상태 계약을 따르지 않는다. | `apps/wake/pages/cluster-home.test.mjs` — `home_pending_failure_forbidden_and_retry_are_distinct` | D00073; D01027 |

## 표별 판단 계약

열의 원본식·단위·톤·툴팁·숨김 순서는 머리의 구성 요소 계약을 참조한다.

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-HOME-TABLE"></a> `SCR-HOME-TABLE` | → [RULE-SORT](../rules.md#RULE-SORT). | apps/wake/pages/cluster-home.js:243 열린 사건, :268 문제 Pod, :278 워크로드는 필터 결과 순서를 유지하며 apps/wake/data/home.js:90 changeMarks()는 시각 오름차순이다 | 사건 심각도/ID와 리소스 위험·동점 정렬이 없으며 변경은 오름차순이다. 홈 이동의 UID·구간 유실은 A01에 해당한다 | 고정 없음 → TASK-SCREEN-HOME | D-USR-2026-11-16-2, D-USR-2026-11-16-7, D00094 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-HOME-FIRST"></a> `SCR-HOME-FIRST` | 1. 실제 요약·사용량·Warning·사건 응답으로 첫 화면을 연다 → 클러스터 이름·CPU/Memory 사용/할당·Ready Node·문제 Pod·최근 1시간 Warning과 근거 이동이 보인다 → 출처 없는 숫자나 기간이 다른 값을 같은 모수로 보이면 실패.<br>2. 입력 홈과 도구 연결 진입 경로를 함께 탐색 → 기대 상위 연결 요약을 홈에 통합하고 중복 상위 영역 제거; 실제 도구 상세/설정 진입은 유지 → 실패 같은 연결 요약을 별도 상위 영역으로 중복 제공.<br>3. 입력 A00140의 홈 기준과 D00449에서 구체화한 홈 구성 목록, 동일 상태 입력 → 기대 기준의 대상 구역을 식별하고 최신 홈 결정과 항목별 대조 → 실패 기준 구역을 확인하지 않은 채 문제/경고 순서만으로 전체 배치 반영 판정.<br>4. 입력 에이전트 미설치·연결 실패·설치 완료 클러스터의 홈 → 기대 D00449의 홈/인시던트 공통 연결 상태를 적용하고 미연결 에이전트의 상태/관리 진입을 제공 → 실패 미연결 때문에 에이전트 항목 자체가 사라져 연결 상태를 확인할 수 없음.<br>5. 입력 같은 에이전트 연결 상태로 홈과 인시던트를 연다 → 기대 같은 연결 상태 부품과 관리 진입을 사용 → 실패 면마다 연결 여부가 다르게 보이거나 한쪽에서 항목 소실. 공통 판정은 [SCR-INCIDENT-CONNECTION](incidents.md#SCR-INCIDENT-CONNECTION)에 연결한다.<br>6. 입력 CPU 요청 6시간 중 일부 구간만 실제 수집된 응답과 두 홈 목록 → 기대 문제 Pod/경고 목록 시작선 일치, 실제 수집 범위를 머리에 명시 → 실패 두 목록 시작선 차이 또는 요청 기간을 수집 전체 범위인 것처럼 표시. 정상·값 변동·변화 없음의 홈 지표 머리를 표시 → 수치/단위·필요한 비교값만 표시하고 '지금'·'1시간 전보다' 없음, 분할 폭 고정 → 두 문구가 남거나 문구 전환 때문에 영역 폭이 변하면 실패. 실시간 홈에서 금지한 두 문구를 제거해도 과거 조회의 실제 구간과 stale의 마지막 관측 시각은 B-028·SRE-Q-15에 따라 보존한다. | summaryBar는 Node/문제 Pod/Warning/열린 사건을, metricBar는 마지막 %를 표시한다(`apps/wake/pages/cluster-home.js:222`, `apps/wake/pages/cluster-home.js:183`). | CPU/Memory 할당 가능량과 Ready Node 수는 머리에서 직접 읽을 수 없다. | 고정 없음 → TASK-SCREEN-HOME | D00073; D00195; D00952; D00283; D00284; D00320; D00327; D00504; D00807 |
| <a id="SCR-HOME-DUPLICATE"></a> `SCR-HOME-DUPLICATE` | 같은 pods 스냅숏·기간의 문제 Pod 수를 홈에서 찾는다 → pods.filter(isProblem)의 값은 대표 요약 한 곳에 두고 구역 머리는 해당 구역의 정보를 표시한다 → 동일 모수 숫자를 장식용으로 거듭 표시하면 실패. 이 중복 수치 계약은 D-USR-2026-11-16-7을 근거로 판정한다. D00350은 이미지 미복원·대상 미확정으로 [J-043](../regression.md#j-043-이미지문맥이-부족한-지적)에 남기며 이 규칙의 삭제 대상 근거로 쓰지 않는다. | 문제 Pod 수가 summaryBar·flowCard·badPodsCard 머리에 반복된다(`apps/wake/pages/cluster-home.js:230`, `apps/wake/pages/cluster-home.js:262`, `apps/wake/pages/cluster-home.js:274`). | 동일 문제 Pod 수가 세 곳에 남아 있다. D00350의 이미지 지시만으로 삭제 위치는 확정할 수 없다. | 고정 없음 → TASK-SCREEN-HOME | D-USR-2026-11-16-7; D00350은 J-043의 미해결 문맥 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-HOME-REQ-R-063"></a> `SCR-HOME-REQ-R-063` | 클러스터 SLO와 서비스 덮어쓰기 값이 다른 사건을 홈에서 연다 → 유효 SLO에 따른 burn rate와 계산 구간, 심각도별 다음 공유 시각이 보인다 → 클러스터 기본값만 쓰거나 burn 구간이 빠지면 실패 | 홈 metric 정의에는 cpu/mem/err/rps만 있으며 burn rate와 공유 시각이 없다(`apps/wake/data/home.js:14`). | 서비스 SLO 덮어쓰기·burn rate·공유 주기 표시가 홈에 없다. | 고정 없음 → TASK-SCREEN-HOME | D-USR-2026-11-16-7 |
| <a id="SCR-HOME-REQ-R-042"></a> `SCR-HOME-REQ-R-042` | 홈에서 기간을 6시간으로 바꾼다 → summary/resources/incident.list/metricSeries/changeMarks의 적용 기간을 표시해 현재 스냅샷과 선택 구간을 구별한다 → 서로 다른 기간을 모두 선택 6시간 결과로 안내하면 실패 | 지표는 range, Warning은 1시간, 변경은 3일, 지난 사건은 30일을 쓴다(`apps/wake/pages/cluster-home.js:220`, `apps/wake/pages/cluster-home.js:301`, `apps/wake/pages/cluster-home.js:325`). | 전역 기간 변경이 Warning·변경·지난 사건에 공통 적용되지 않는다. | 고정 없음 → TASK-SCREEN-HOME | D00073; D00449 |

<a id="SCR-HOME-COST"></a>


## SCR-HOME-COST

- 목표: 입력 홈 대상 클러스터의 유효한 최근 7일 비용 응답 → 기대 홈에서 최근 7일 금액·통화·해당 자료의 시각 확인 → 실패 비용 페이지에만 금액이 있거나 다른 기간/시각의 값을 현재로 표시.
- 추가 조건: 입력 대상 종류에 대응하는 CPU·Memory·Network·Filesystem과 클러스터 비용 자료가 존재 → 기대 표에서 해당 지표들을 읽고 홈에서 비용을 읽음; 미지원/미연결은 그 상태로 구별 → 실패 지원되는 지표·비용을 단순 생략하거나 미지원 값을 0으로 조작. 공통 판정은 [SCR-RESOURCE-METRIC-COLUMNS](resource-list.md#SCR-RESOURCE-METRIC-COLUMNS)에 연결한다.
- 현재: home이 요약과 각 구역 카드를 조립한다.(`apps/wake/pages/cluster-home.js:330`)
- 차이: 홈에 최근 7일 비용·통화·관측 시각 및 연결 실패 구분을 추가 검증해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-HOME
- 출처: D00108; D00270

<a id="SCR-HOME-METRIC-PRESENTATION"></a>

## SCR-HOME-METRIC-PRESENTATION

- 목표: 홈 대상의 실제 CPU·메모리 등 승인된 핵심 지표가 있고 카드가 펼쳐진 상태 → 핵심 수치와 추세 그래프를 함께 읽는다 → 펼친 카드에서 그래프를 생략하거나 핵심 수치를 보조 정보처럼만 처리하면 실패. 첫 그리기는 D01021의 C안([CMP-CARD-01](../components/cards.md#CMP-CARD-01), [B-015](../design.md#B-015))을 따른다. 접힌 상태의 수치 요약과 사용자 접힘 보존은 SCR-HOME-METRIC-FOLD로 판정하며 그래프가 숨은 것을 실패로 세지 않는다.
- 현재: 홈 지표의 수치 items와 realChart 본문을 함께 구성한다.(`apps/wake/pages/cluster-home.js:206`)
- 차이: 승인된 첫 화면의 핵심 수치와 추세 가시성을 두 테마에서 대조해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-HOME
- 출처: D00177

<a id="SCR-HOME-CHART-ENTRY"></a>

## SCR-HOME-CHART-ENTRY

- 목표: 연결 자료가 있는 홈 지표 → 승인된 아이콘·범례와 같은 데이터/기간 상세 진입, UI 메타의 “되풀이”·“링크만 연결” 제거 → 범례 아이콘/상세 이동이 없거나 두 문구가 UI 메타로 남으면 실패. 데이터 원문은 교정하지 않음.
- 현재: 지표 본문에 같은 지표 페이지로 가는 button을 구성한다.(`apps/wake/pages/cluster-home.js:207`)
- 차이: 삭제 문구와 범례 아이콘 및 같은 기간 전달을 함께 고정해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-HOME
- 출처: D00776

<a id="SCR-HOME-METRIC-FOLD"></a>

## SCR-HOME-METRIC-FOLD

- 목표: 홈의 여러 지표 카드를 각각 접고 펼친다 → 접힘은 해당 수치 요약, 펼침은 가로 공간을 사용하는 차트를 보여 주고 갱신 후 수동 접힘을 유지한다 → 접힘 경로가 없거나 수치 요약 없이 차트만 사라지면 실패. 첫 그리기와 자동 펼침은 D01021의 C안([CMP-CARD-01](../components/cards.md#CMP-CARD-01), [B-015](../design.md#B-015))을 따른다. SCR-HOME-METRIC-PRESENTATION의 그래프 필수 조건은 펼친 상태에 적용한다.
- 현재: 지표 items와 본문 차트를 별도로 구성한다.(`apps/wake/pages/cluster-home.js:206`)
- 차이: 카드별 수동 접힘 보존과 펼친 차트의 가로 공간 사용을 검수해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-HOME
- 출처: D00777
