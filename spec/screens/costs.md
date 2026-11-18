# 비용

<a id="SCR-COSTS"></a> 진입: `wake://cluster/:cluster/costs`. 목적(SRE 판단): 같은 기간·통화·집계 범위에서 비용이 큰 대상을 고른다.
구성: 미연결이면 검색·OpenCost 연결 → 연결 후 기간·집계범위 → 총액·추세·상위10+기타 → 비용 표·pager.
현재: [apps/wake/pages/costs.js](../../apps/wake/pages/costs.js); [apps/wake/data/costs.js](../../apps/wake/data/costs.js); [apps/wake/desktop/opencost.cjs](../../apps/wake/desktop/opencost.cjs). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 배분값, 구간·범위, 비교·점유, 연결 신원; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-COSTS-01](../components/tables/costs.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-COSTS-01](../components/tables/costs.md). 화면의 대상/복귀 계약을 함께 적용한다.
고정 장치: `apps/wake/desktop/opencost.test.cjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-COSTS-01"></a> `SCR-COSTS-01` | OpenCost 미연결과 연결 상태로 비용을 연다 → 미연결에는 검색·연결, 연결 후 costs.open의 기간·집계·총액·추세·상위10+기타·표·pager를 보인다 → 연결 전에 가짜 비용을 채우면 실패 | unconfigured 분기에는 검색과 OpenCost 연결 빈 상태를 반환한다; `apps/wake/pages/costs.js:173` | 없음(확인: `apps/wake/pages/costs.js:173`) | 고정 없음 → TASK-SCREEN-COSTS | D00107, D00108 |
| <a id="SCR-COSTS-V01"></a> `SCR-COSTS-V01` | OpenCost /allocation 결과 total=12.5와 currency를 받는다 → 비용은 해당 통화의 할당 추정액으로 보이고 청구서로 부르지 않는다 → 실제 클라우드 청구액으로 표시하면 실패 | money는 costValue(number,data.currency)를 사용한다; `apps/wake/pages/costs.js:28` | 비용 머리에는 OpenCost 출처만 있고 할당 추정액 설명은 별도 표기가 없다 | 고정 없음 → TASK-SCREEN-COSTS | D00107 |
| <a id="SCR-COSTS-V02"></a> `SCR-COSTS-V02` | 절대 from/to를 지정하고 namespace 비용을 연다 → drillAddress는 data.start/end를 다음 workload 주소에 유지한다 → 상대 기간으로 다시 계산하면 실패 | 드릴다운 window에 period와 절대 start/end를 넣는다; `apps/wake/pages/costs.js:111` | 없음(확인: `apps/wake/pages/costs.js:111`) | 고정 없음 → TASK-SCREEN-COSTS | D00066 |
| <a id="SCR-COSTS-V03"></a> `SCR-COSTS-V03` | → [RULE-SORT](../rules.md#RULE-SORT). | share는 total>0일 때만 계산하고 정렬 동점은 id를 비교한다; `apps/wake/pages/costs.js:119` | id 비교가 localeCompare라 Unicode 코드포인트 기본값과 다를 수 있다 | 고정 없음 → TASK-SCREEN-COSTS | D-USR-2026-11-16-2; D00109; D-USR-2026-11-16-7 (분모 0 세부) |
| <a id="SCR-COSTS-V04"></a> `SCR-COSTS-V04` | 동일 cluster·Service UID·질의·절대 구간에서 12.5 USD 성공 뒤 403을 주는 경우와 Service UID 교체·명시적 연결 해제를 각각 검사한다. 후속 403은 이전 금액·마지막 성공 시각을 보존하면서 오래됨과 거부 범위를 표시한다. 대상 교체·연결 해제에는 이전 금액을 제거한다. 상태·실패 판정은 [RULE-STATE](../rules.md#RULE-STATE)를 따른다. 오류 응답에 동반된 rows를 새 성공값으로 채우면 실패 | 세 상태에서 data=null로 지운다; `apps/wake/pages/costs.js:60` | 같은 대상의 후속 forbidden에서도 이전 data를 지운다. result.rows가 함께 오면 다음 행에서 다시 data를 채워 오류 응답의 행을 차단하지 못한다 | 고정 없음 → TASK-SCREEN-COSTS | D00110; 세부 상태는 D-USR-2026-11-16-7 |
| <a id="SCR-COSTS-A01"></a> `SCR-COSTS-A01` | 해당 링크로 이동하고 이전 화면으로 복귀한다 → namespace→workload→pod 이동은 같은 구간이며 idle/unallocated/unknown 합성 분류는 실제 대상 링크로 열지 않는다 → 다른 namespace의 값이 섞이거나 선택 범위가 유실되면 실패 | 합성 분류는 null 링크, namespace/workload는 같은 window로 이동한다; `apps/wake/pages/costs.js:110` | 없음(확인: `apps/wake/pages/costs.js:110`) | 고정 없음 → TASK-SCREEN-COSTS | D00066, D00109 |
| <a id="SCR-COSTS-A02"></a> `SCR-COSTS-A02` | 정상 조회 뒤 수집을 중단하고 오래된 비용을 표시한다 → 오래된 데이터는 받은 시각을 남기되 현재 성공으로 보이지 않는다 → 과거 비용을 현재 조회 성공으로 표시하면 실패 | 오류 상태 줄은 !data일 때만 만든다; `apps/wake/pages/costs.js:182` | 이전 data가 있는 조회 실패는 오류 줄이 숨고 마지막 성공시각도 따로 표시하지 않는다 | 고정 없음 → TASK-SCREEN-COSTS | D00115 |
| <a id="SCR-COSTS-G01"></a> `SCR-COSTS-G01` | → [RULE-SORT](../rules.md#RULE-SORT). | 렌더러 cls는 align 속성을 사용하지 않으며 :24는 머리 왼쪽, :32는 숫자 tabular-nums를 지정한다; `kit/components/data-table.js:95` | 없음(확인: `kit/components/data-table.js:95`) | kit/components/data-table-extras.test.mjs — a name column leads with a dot or a kind icon, a figure column is a left tabular figure, a time column is quiet | D-USR-2026-11-16-1 |
| <a id="SCR-COSTS-G02"></a> `SCR-COSTS-G02` | 같은 OpenCost 절대 구간과 통화로 원본·화면을 조회한다 → 할당 비용·유휴 비용·집계 범위가 원본과 일치한다 → 통화나 구간이 다른 수치를 비교하거나 청구액으로 부르면 실패 | 응답 bucket의 start/end를 요청과 대조하고 currencyCode·idle·unallocated·합계를 반환한다; `apps/wake/desktop/opencost.cjs:83` | 없음(확인: `apps/wake/desktop/opencost.cjs:83`) | 고정 없음 → TASK-SCREEN-COSTS | D00107, D00115 |

## 표별 판단 계약

열 이름·종류·원본식·표시·톤·툴팁·숨김 순서는 머리의 components 계약을 참조한다. 시간 이력 정렬은 사용자 확정 D-USR-2026-11-16-2, 비용 정렬·검색 세부는 D-USR-2026-11-16-7 기본값이다.

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-COSTS-TABLE"></a> `SCR-COSTS-TABLE` | → [RULE-SORT](../rules.md#RULE-SORT). 지원 대상만 상세 링크가 있다 → 문자열 정렬·결측 우선·합성 분류 링크면 실패 | sortedRows는 결측을 뒤로 보내고 값 비교 뒤 id.localeCompare를 쓴다; `apps/wake/pages/costs.js:125` | 동점 키가 Unicode 코드포인트 순서가 아닌 localeCompare다 | 고정 없음 → TASK-SCREEN-COSTS | D-USR-2026-11-16-2; D00109; D00110; D-USR-2026-11-16-7 (필터 세부) |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-COST-SOURCE"></a> `SCR-COST-SOURCE` | 등록 서비스 UID와 다른 OpenCost 응답을 읽는다 → costs.open의 identity_changed가 보이고 기존 금액이 지워진다 → 다른 클러스터 비용을 현재 할당 비용으로 보이면 실패 | identity_changed 상태를 받아 data를 초기화한다; `apps/wake/pages/costs.js:60` | 화면은 서비스의 identity 판정을 신뢰하며 응답 rows 동반 여부를 별도로 차단하지 않는다 | 고정 없음 → TASK-SCREEN-COSTS | D00107, D00110, D00111 |
| <a id="SCR-COST-AGGREGATE"></a> `SCR-COST-AGGREGATE` | 7일 namespace 집계 11개와 idle/unallocated를 준다 → total·idle·unallocated, 전기 대비, 추세, 상위10+기타를 data 필드로 표시한다. 기간 선택·초기값은 [RULE-RANGE](../rules.md#RULE-RANGE)를 따른다 → 결손 비용을 0으로 채우거나 유휴를 중복 합산하면 실패 | 상위10 뒤 나머지를 합산해 기타 막대를 만들고 합성 분류는 제외한다; `apps/wake/pages/costs.js:130` | 총액이 0 또는 previous=0이면 전기 대비 행을 숨기므로 비교 불가 이유가 없다. costs.js:8의 PERIODS와 opencost.cjs의 period 처리에는 옛 24h·7d·30d 집합이 남아 있다. 공통 선택의 절대 from/to를 읽기 요청에 전달하는 연결은 미완료 | 고정 없음 → TASK-SCREEN-COSTS | D00108, D00109, D00826 |
| <a id="SCR-COST-IDENTITY"></a> `SCR-COST-IDENTITY` | 이름만 있는 과거 workload 비용을 눌러 Pod 집계로 이동한다 → 동일 cluster·namespace·from/to로 집계를 열되 개별 UID 인스턴스로 단정하지 않는다 → 이름 집계를 현재 Pod UID 비용으로 보이면 실패 | controllerKind·controller·namespace와 절대 window를 비용 주소에 넣는다; `apps/wake/pages/costs.js:114` | 없음(확인: `apps/wake/pages/costs.js:114`) | 고정 없음 → TASK-SCREEN-COSTS | D00109, D00110 |
