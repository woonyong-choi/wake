# 도구 상세

<a id="SCR-TOOL-DETAIL"></a> 진입: `wake://cluster/:cluster/tools/:tool`. 목적(SRE 판단): 건강·권한·실패 원인과 마지막 성공을 확인한다.
구성: 머리·연결 상태 → 역할·버전·접속 → 검사 이력·지연 → 오류·연결 흐름.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 상태, 검사, 접속; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-TOOL-DETAIL-01](../components/tables/tool-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-TOOL-DETAIL-01](../components/tables/tool-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-TOOL-DETAIL-01"></a> `SCR-TOOL-DETAIL-01` | c/Grafana 상세를 연다 → 도구 머리 아래 역할·버전·주소·지연·최근 오류를 toolChecks와 toolViews에서 표시한다 → 다른 클러스터 검사 기록이 보이면 실패 | body는 summary·latency chart·errors를 순서대로 조립한다 ([`apps/wake/pages/tool-detail.js:61`](../../apps/wake/pages/tool-detail.js#L61)) | 없음(확인: apps/wake/pages/tool-detail.js:61) | 고정 없음 → TASK-SCREEN-TOOL-DETAIL | D00992 |
| <a id="SCR-TOOL-DETAIL-V01"></a> `SCR-TOOL-DETAIL-V01` | 허브 정상·열거 실패·UI 자격 없음 조합을 준다 → 건강과 열거 실패·열기 불가를 따로 표시한다 → 허브 정상만으로 열기 가능이면 실패 | 공통 toolViews 결과를 상세 상태로 사용한다 ([`apps/wake/pages/tool-detail.js:32`](../../apps/wake/pages/tool-detail.js#L32)) | 없음(확인: apps/wake/pages/tool-detail.js:32) | 고정 없음 → TASK-SCREEN-TOOL-DETAIL | D00017, D01000 |
| <a id="SCR-TOOL-DETAIL-V02"></a> `SCR-TOOL-DETAIL-V02` | toolChecks.samples의 과거 성공 뒤 최신 실패를 준다 → 마지막 성공 시각과 현재 무응답을 구분한다 → 과거 성공을 현재 정상으로 표시하면 실패 | latest와 answered.at(-1)를 분리해 지연·마지막 성공을 만든다 ([`apps/wake/pages/tool-detail.js:45`](../../apps/wake/pages/tool-detail.js#L45)) | 없음(확인: apps/wake/pages/tool-detail.js:45) | 고정 없음 → TASK-SCREEN-TOOL-DETAIL | D00115; D00017; D-USR-2026-11-16-7 (toolChecks 표본) |
| <a id="SCR-TOOL-DETAIL-V03"></a> `SCR-TOOL-DETAIL-V03` | 주소·실패 원문에 토큰이 포함된 도구 응답을 준다 → 화면·주소·근거에는 마스킹된 값만 표시한다 → 토큰 문자열이 한 곳이라도 보이면 실패 | 최근 오류는 x.live.raw 또는 checks.errors의 text를 그대로 렌더한다 ([`apps/wake/pages/tool-detail.js:55`](../../apps/wake/pages/tool-detail.js#L55)) | 상세 렌더 경계에는 오류 원문의 추가 마스킹이 없다 | 고정 없음 → TASK-SCREEN-TOOL-DETAIL | D00466; D-USR-2026-11-16-7 |
| <a id="SCR-TOOL-DETAIL-A01"></a> `SCR-TOOL-DETAIL-A01` | 열거 실패 후 다시 시도를 누른다 → 오류 행을 유지하면서 clusterTools를 재조회한다 → 실패를 도구 없음으로 바꾸면 실패 | inventoryFailure는 실패 상태와 wake.td.retry를 렌더한다 ([`apps/wake/pages/tool-detail.js:64`](../../apps/wake/pages/tool-detail.js#L64)) | 없음(확인: apps/wake/pages/tool-detail.js:64) | apps/wake/tool-surfaces.test.mjs :: tool_detail_shows_the_inventory_failure_and_reads_again_even_when_the_hub_says_healthy | D00017 |
| <a id="SCR-TOOL-DETAIL-A02"></a> `SCR-TOOL-DETAIL-A02` | 도구 열기 후 AI에 묻기를 누른다 → 실제 UI 또는 HTTP 화면을 열고 같은 cluster·tool kind를 AI 요청 대상에 전달한다 → 전역 다른 클러스터로 질문하면 실패 | 머리 동작은 cluster id와 x.raw를 toolAction에 전달한다 ([`apps/wake/pages/tool-detail.js:40`](../../apps/wake/pages/tool-detail.js#L40)) | 상세 meta.context는 도구 UID·출처·시간 범위를 전달하지 않는다 | 고정 없음 → TASK-SCREEN-TOOL-DETAIL | D00030, D01000 |
| <a id="SCR-TOOL-DETAIL-G01"></a> `SCR-TOOL-DETAIL-G01` | 저장된 Grafana의 열거만 실패시킨다 → 상세 본문 위 오류·재시도와 기존 도구 내용을 함께 표시한다 → 오류나 저장 행이 사라지면 실패 | ready에서도 inventoryFailure와 body를 함께 출력한다 ([`apps/wake/pages/tool-detail.js:65`](../../apps/wake/pages/tool-detail.js#L65)) | 없음(확인: apps/wake/pages/tool-detail.js:65) | 고정 없음 → TASK-SCREEN-TOOL-DETAIL | D00017, D01000 |
| <a id="SCR-TOOL-DETAIL-G02"></a> `SCR-TOOL-DETAIL-G02` | 외부 도구에서 시간 범위를 선택하고 AI에 묻는다 → cluster·Service UID·출처·구간이 같은 대화의 모델 요청까지 유지된다 → 이름만 남고 UID·구간이 사라지면 실패 | meta.context는 icon·title·클러스터 표시 문자열만 보낸다 ([`apps/wake/pages/tool-detail.js:69`](../../apps/wake/pages/tool-detail.js#L69)) | Service UID와 조회 구간을 AI 문맥에 싣지 않는다 | 고정 없음 → TASK-SCREEN-TOOL-DETAIL | D01000; D-USR-2026-11-16-7 |
