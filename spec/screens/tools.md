# 도구 목록

<a id="SCR-TOOLS"></a> 진입: `wake://cluster/:cluster/tools`. 목적(SRE 판단): 어떤 도구를 실제로 읽고 열 수 있는지 확인한다.
구성: 머리·검색 → 연결 요약 → connectionRow 목록.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 포함 목록, 행 건강·동작; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-TOOLS](../components/tables/tools.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-TOOLS-01"></a> `SCR-TOOLS-01` | c의 도구 목록을 연다 → clusterTools·sourceStates의 머리·검색·상태 합계·연결 행을 순서대로 표시한다 → 합계와 행의 연결 상태가 다르면 실패 | body는 head·search·summary·settingsSection 순으로 출력한다 ([`apps/wake/pages/tools.js:43`](../../apps/wake/pages/tools.js#L43)) | 없음(확인: apps/wake/pages/tools.js:43) | 고정 없음 → TASK-SCREEN-TOOLS | D00992 |
| <a id="SCR-TOOLS-V01"></a> `SCR-TOOLS-V01` | 실패 시도만 있고 연결 receipt가 없는 도구를 준다 → 본문 목록에는 toolViews.included인 연결 근거가 있는 도구만 보인다 → 실패 시도만으로 연결 목록에 추가되면 실패 | rows는 set().included를 viewRow로 변환한다 ([`apps/wake/pages/tools.js:31`](../../apps/wake/pages/tools.js#L31)) | 없음(확인: apps/wake/pages/tools.js:31) | 고정 없음 → TASK-SCREEN-TOOLS | D00231 |
| <a id="SCR-TOOLS-V02"></a> `SCR-TOOLS-V02` | 현재 허브 오류지만 저장된 열기 자격이 있는 도구를 준다 → 건강 오류와 실제 열기 가능 여부를 구분하고 로그인·권한·접속 원인을 표시한다 → 열 수 있다는 이유로 정상 체크면 실패 | toolAction은 state와 raw 대상 및 listed를 함께 받는다 ([`apps/wake/pages/tools.js:40`](../../apps/wake/pages/tools.js#L40)) | 없음(확인: apps/wake/pages/tools.js:40) | 고정 없음 → TASK-SCREEN-TOOLS | D00017, D01000 |
| <a id="SCR-TOOLS-A01"></a> `SCR-TOOLS-A01` | Grafana 행을 누르고 상세의 열기를 누른다 → 첫 클릭은 같은 도구 상세, 다음은 실제 Grafana UI를 연다 → Grafana의 저장된 실제 UI 주소가 열리지 않거나 다른 도구가 열리면 실패 | open은 cluster와 kind의 정본 도구 상세 주소로 이동한다 ([`apps/wake/pages/tools.js:45`](../../apps/wake/pages/tools.js#L45)) | 없음(확인: apps/wake/pages/tools.js:45) | 고정 없음 → TASK-SCREEN-TOOLS | D00992, D00030 |
| <a id="SCR-TOOLS-A02"></a> `SCR-TOOLS-A02` | 열거 읽기를 실패시킨 뒤 다시 시도를 누른다 → 저장 행은 남고 clusterTools와 sourceStates를 새로 요청한다 → 오류 캐시만 재표시하면 실패 | load는 두 읽기 상태를 초기화하고 실제 data.get을 다시 호출한다 ([`apps/wake/pages/tools.js:21`](../../apps/wake/pages/tools.js#L21)) | 없음(확인: apps/wake/pages/tools.js:21) | apps/wake/tool-surfaces.test.mjs :: tool_surfaces_recover_together_after_the_hub_and_the_inventory_answer_again | D00017 |
| <a id="SCR-TOOLS-G01"></a> `SCR-TOOLS-G01` | 같은 Service UID의 재확인만 실패시킨다 → 저장 도구 행을 유지하며 실패 상태를 표시한다 → 연결 목록에서 행이 사라지면 실패 | toolViews에 저장 설정·열거·허브 결과를 함께 전달한다 ([`apps/wake/pages/tools.js:29`](../../apps/wake/pages/tools.js#L29)) | 없음(확인: apps/wake/pages/tools.js:29) | apps/wake/tool-surfaces.test.mjs :: a_verified_tool_stays_on_every_surface_while_the_same_service_cannot_be_verified_and_comes_back | D00231, D01000 |
| <a id="SCR-TOOLS-G02"></a> `SCR-TOOLS-G02` | 허브 조회만 거절하고 연결 receipt는 남긴다 → 등록 사실과 sourceStates 실패를 나누어 표시한다 → 과거 receipt로 현재 정상 체크를 만들면 실패 | sourceStates 실패도 readOf 결과로 보존한다 ([`apps/wake/pages/tools.js:24`](../../apps/wake/pages/tools.js#L24)) | 없음(확인: apps/wake/pages/tools.js:24) | 고정 없음 → TASK-SCREEN-TOOLS | D00017, D01000 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-TOOL-OPEN"></a> `SCR-TOOL-OPEN` | Grafana·Loki·Tempo를 각각 연다 → Grafana는 실제 UI, Loki·Tempo는 PATHS 기반 HTTP 읽기 화면을 연다 → 존재하지 않는 UI나 가짜 터미널이면 실패 | tool-api 경로에서는 terminal.session을 null로 반환한다 ([`apps/wake/app.config.js:959`](../../apps/wake/app.config.js#L959)) | 없음(확인: apps/wake/app.config.js:959) | apps/wake/app.config.test.mjs :: API-only tools open a page for the source cluster without a terminal or a network preflight | D00030, D00046 |
