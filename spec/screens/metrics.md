# 지표

<a id="SCR-METRICS"></a> 진입: `wake://cluster/:cluster/metrics/:metric`. 목적(SRE 판단): 같은 시간대의 변화·한도 초과·결측을 구분한다.
구성: 머리·검색·기간 → 지표 머리·chartCard → 관련 대상/근거.
현재: [apps/wake/pages/cluster-home.js](../../apps/wake/pages/cluster-home.js); [apps/wake/data/home.js](../../apps/wake/data/home.js); [apps/wake/data/index.js](../../apps/wake/data/index.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 시리즈, 머리 값, 축·범례; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-CLUSTER-HOME-01](../components/tables/cluster-home.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-CLUSTER-HOME-01](../components/tables/cluster-home.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: metricSeries의 query·from/to/step·result[].metric·values와 해당 대상의 기준선이 값·단위·시간축의 출처다. 과거 표본·현재 조회 결과·실제 0·결측을 구분한다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-METRICS-01"></a> `SCR-METRICS-01` | 1. metric=cpu로 지표 화면을 연다 → METRIC_DEFS.cpu의 머리·기간·확대 차트·Node별 차트·변경·이벤트가 보인다 → 다른 metric 단위나 관계없는 구역이면 실패.<br>2. 입력 연결된 출처가 있는 지표 화면 첫 진입 → 기대 범위·기간·데이터 출처를 먼저 읽고 상태·주요 추세를 함께 파악 → 실패 출처나 범위를 아래 단계까지 열어야 알 수 있음 | metricPage가 metricBar·bySeries·변경·이벤트를 조립한다(`apps/wake/pages/cluster-home.js:348`). | 추가 대조: D00075: 출처나 범위를 아래 단계까지 열어야 알 수 있음. | 고정 없음 → TASK-SCREEN-METRICS | D00075; D00451 |
| <a id="SCR-METRICS-V01"></a> `SCR-METRICS-V01` | cpu 정의로 1시간 시리즈를 조회한다 → metrics.range의 query·range·step과 % 단위를 차트 정보에 표시한다 → 표시 step/구간이 응답과 다르면 실패 | hubChart가 응답의 range/query/step과 METRIC_DEFS.unit을 쓴다(`apps/wake/pages/cluster-home.js:168`). | 없음(확인: apps/wake/pages/cluster-home.js:168) | 고정 없음 → TASK-SCREEN-METRICS | D00075; D00451 |
| <a id="SCR-METRICS-V02"></a> `SCR-METRICS-V02` | 과거 구간의 마지막 표본과 결측 표본을 공급한다 → 과거 수집 구간을 붙이고 결측값은 빈 값으로 표시한다 → null을 0이나 현재 정상으로 표시하면 실패 | metricBar는 live=false에 수집 구간을 붙이지만 lastOf는 Number로 변환한다(`apps/wake/pages/cluster-home.js:176`, `apps/wake/pages/cluster-home.js:195`). | null 표본이 Number(null)=0으로 변환될 수 있다. | 고정 없음 → TASK-SCREEN-METRICS | D00451 |
| <a id="SCR-METRICS-V03"></a> `SCR-METRICS-V03` | step 두 배 이상 공백과 null 표본을 넣는다 → 시간축 공백은 끊고 Node/namespace 범례를 유지한다 → 공백을 0 또는 연속 수집 선으로 보이면 실패 | hubChart는 maxGapSeconds=step×1.5이나 관측값을 Number로 변환한다(`apps/wake/pages/cluster-home.js:170`). | 명시적 null은 0으로 바뀌므로 시간 간격이 짧은 결측이 0점으로 남는다. | 고정 없음 → TASK-SCREEN-METRICS | D00451 |
| <a id="SCR-METRICS-A01"></a> `SCR-METRICS-A01` | 축을 드래그하고 키보드로 같은 절대 구간을 선택한다 → 축 드래그와 키보드로 범위를 바꾸고 같은 범위로 원본 질의를 대조한다 → 표시 구간과 원본 질의 from/to가 다르면 실패 | loadSeries는 선택 from/to를 질의하고 확대 차트의 +/- 키는 tellWindow로 같은 rangeAction을 호출한다(`apps/wake/pages/cluster-home.js:173`, `kit/components/chart-card.js:1373`). | 없음(확인: apps/wake/pages/cluster-home.js:173; kit/components/chart-card.js:1373) | 고정 없음 → TASK-SCREEN-METRICS | D00451; D-USR-2026-11-16-7 |
| <a id="SCR-METRICS-A02"></a> `SCR-METRICS-A02` | 지표를 처음 펼친 뒤 접고 threshold 초과 응답을 받는다 → folded의 사용자 상태를 유지하고 summaryBar 머리 상태만 바뀐다 → 카드가 다시 열리거나 아래 화면이 밀리면 실패 | isOpen은 folded를 우선하고 drawn 뒤 자동 펼침을 false로 고정한다(`apps/wake/pages/cluster-home.js:51`). | 없음(확인: apps/wake/pages/cluster-home.js:51) | 고정 없음 → TASK-SCREEN-METRICS | D01021 |
| <a id="SCR-METRICS-G01"></a> `SCR-METRICS-G01` | 1. 과거 구간 표본 뒤 현재 읽기를 실패시킨다 → 과거 값의 관측 시각·구간과 현재 조회 실패를 분리한다 → 과거 값을 현재 정상 지표로 승격하면 실패.<br>2. 입력 관련 실제 출처가 있는 CPU·Memory·Network·Filesystem 화면과 표본 0 → 기대 요구한 지표 항목에 접근 가능하고 동일 차트 틀·기존 공통 탭을 사용 → 실패 등록만 있고 UI에서 접근 불가 또는 탭 외곽선의 페이지별 예외. | loadSeries 실패는 기존 data와 stale을 남기고 metricBar는 마지막 수집을 붙인다(`apps/wake/pages/cluster-home.js:79`, `apps/wake/pages/cluster-home.js:205`). | 추가 대조: D00345: 등록만 있고 UI에서 접근 불가 또는 탭 외곽선의 페이지별 예외. | 고정 없음 → TASK-SCREEN-METRICS | D00451; D00345 |
| <a id="SCR-METRICS-G02"></a> `SCR-METRICS-G02` | 단위가 다른 CPU·메모리 및 결손 구간을 함께 그린다 → 각 단위·표본·실제 임계값과 결손을 보존하고 같은 시간축을 쓴다 → 결손 연결선·단위 혼용·임의 임계값 생성 시 실패 | METRIC_DEFS는 cpu 80·mem 85·err 1 임계값을 고정하며 hubChart가 null을 숫자로 변환한다(`apps/wake/data/home.js:14`, `apps/wake/pages/cluster-home.js:170`). | 실제 대상 임계값을 읽지 않고 고정값을 쓰며 결측 0 변환 가능성이 있다. | 고정 없음 → TASK-SCREEN-METRICS | D00451 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-METRICS-ENTRY"></a> `SCR-METRICS-ENTRY` | 홈 CPU 차트의 확대 보기를 누른다 → 같은 METRIC_DEFS.cpu 시리즈의 metric 화면이 열린다 → 별도 모니터링 복제 화면이나 다른 질의이면 실패 | metricBar의 확대 주소는 viewAddress(id,'metric',m.id)다(`apps/wake/pages/cluster-home.js:208`). | 주소에 기존 절대 기간을 전달하지 않는다. | 고정 없음 → TASK-SCREEN-METRICS | D00193; D00451 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-METRICS-REQ-R-043"></a> `SCR-METRICS-REQ-R-043` | 선택 클러스터의 cpu.byNode와 err.byNs를 같은 절대 구간으로 연다 → metrics.range 등록 질의와 result.metric의 Node/namespace 이름이 범례에 보인다 → 다른 클러스터나 구간의 시리즈가 섞이면 실패 | loadSeries는 cluster/from/to/step을 전달하고 seriesName은 nodename/namespace를 읽는다(`apps/wake/pages/cluster-home.js:77`, `apps/wake/pages/cluster-home.js:162`). | 일반 대상별 시리즈는 이 화면에서 선택할 수 없으며 등록된 클러스터·Node·namespace만 제공한다. | 고정 없음 → TASK-SCREEN-METRICS | D00075; D00451; D-USR-2026-11-16-7 |
