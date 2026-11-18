# 검색 결과

<a id="SCR-SEARCH"></a> 진입: `홈·지표·인시던트의 q; 목록의 다른 종류 결과; 팔레트`. 목적(SRE 판단): 일치한 리소스와 검색하지 못한 출처를 구분한다.
구성: searchInput → 검색 결과 summaryBar → Name/Kind/Namespace/Status 표.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 검색 범위, 표시·전체 건수; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-CLUSTER-SEARCH-01](../components/tables/cluster-search.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-CLUSTER-SEARCH-01](../components/tables/cluster-search.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SEARCH-01"></a> `SCR-SEARCH-01` | 클러스터 c에서 api를 검색한다 → findResources 결과가 검색 칸 아래 Name·Kind·Namespace·Status 표에 보인다 → 다른 클러스터의 api가 나타나면 실패 | 결과 표는 네 열과 wake.search.open 동작을 쓴다 ([`apps/wake/pages/cluster-search.js:35`](../../apps/wake/pages/cluster-search.js#L35)) | 없음(확인: apps/wake/pages/cluster-search.js:35) | 고정 없음 → TASK-SCREEN-SEARCH | D00074 |
| <a id="SCR-SEARCH-V01"></a> `SCR-SEARCH-V01` | Secret과 Pod에 같은 이름을 넣고 검색한다 → FIND_KINDS의 허용 리소스만 조회하고 Secret은 결과에 없다 → Secret 조회 요청 또는 결과가 있으면 실패 | 검색은 FIND_KINDS만 data.get resources로 읽는다 ([`apps/wake/pages/cluster-search.js:22`](../../apps/wake/pages/cluster-search.js#L22)) | 없음(확인: apps/wake/pages/cluster-search.js:22) | 고정 없음 → TASK-SCREEN-SEARCH | D-01, C-003 |
| <a id="SCR-SEARCH-V02"></a> `SCR-SEARCH-V02` | 검색 응답 100건 중 Pod 90건·Service 10건을 준다 → 전체 100과 표시 상한 80을 구분하고 종류별 수의 집계 범위를 표시한다 → 전체 수 100 옆에 설명 없이 표시 80건의 종류 수를 섞으면 실패 | 행은 80개로 자르고 전체 건수는 hits.length, 종류 수는 잘린 rows에서 센다 ([`apps/wake/pages/cluster-search.js:30`](../../apps/wake/pages/cluster-search.js#L30)) | 전체 합계와 종류별 수의 모집단이 다르며 표시 상한 안내가 없다 | 고정 없음 → TASK-SCREEN-SEARCH | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SEARCH-A01"></a> `SCR-SEARCH-A01` | 검색한 뒤 q를 빈 문자열로 지운다 → 결과 카드가 닫히고 원래 화면의 내용·스크롤이 돌아온다 → 빈 결과 카드가 남거나 본문 위치가 초기화되면 실패 | q가 비면 results는 빈 문자열을 반환한다 ([`apps/wake/pages/cluster-search.js:27`](../../apps/wake/pages/cluster-search.js#L27)) | 결과 닫기는 구현되어 있으나 원래 본문 스크롤 복원 상태는 저장하지 않는다 | 고정 없음 → TASK-SCREEN-SEARCH | D00074 |
| <a id="SCR-SEARCH-A02"></a> `SCR-SEARCH-A02` | c/default/Pod/api 결과를 누른다 → 같은 cluster·namespace·kind·name의 정본 상세를 연다 → Service api 또는 다른 namespace가 열리면 실패 | 행 ID를 plural·ns·name으로 분해해 상세 주소를 만든다 ([`apps/wake/pages/cluster-search.js:44`](../../apps/wake/pages/cluster-search.js#L44)) | 없음(확인: apps/wake/pages/cluster-search.js:44) | 고정 없음 → TASK-SCREEN-SEARCH | D00074 |
| <a id="SCR-SEARCH-A03"></a> `SCR-SEARCH-A03` | Service 검색을 지연시키고 Pod 검색은 0건으로 완료한다 → 읽는 중인 다른 종류 수는 대기 상태, 완료한 빈 결과는 0으로 구분한다 → 응답 전 다른 종류 수가 0으로 표시되면 실패 | otherCount는 index.rows가 없을 때 0을 반환한다 ([`apps/wake/pages/cluster-search.js:42`](../../apps/wake/pages/cluster-search.js#L42)) | 조회 전과 실제 빈 결과가 모두 숫자 0이다 | 고정 없음 → TASK-SCREEN-SEARCH | D00074; D00114; D-USR-2026-11-16-7 (종류별 대기 집계) |
| <a id="SCR-SEARCH-G01"></a> `SCR-SEARCH-G01` | Pod 조회만 403, Service 조회는 2건으로 응답한다 → Service 두 행과 Pod 권한 부족의 부분 조회 상태를 함께 표시한다 → 전체 조회 성공 또는 빈 결과로 표시하면 실패 | allSettled에서 fulfilled 결과만 index.rows에 남긴다 ([`apps/wake/pages/cluster-search.js:23`](../../apps/wake/pages/cluster-search.js#L23)) | 실패 종류와 원인을 버린다 | 고정 없음 → TASK-SCREEN-SEARCH | D00074 |
| <a id="SCR-SEARCH-G02"></a> `SCR-SEARCH-G02` | 검색된 Pod api UID u1을 u2로 재생성한 뒤 옛 결과를 누른다 → 원래 UID u1과 재조회 UID를 대조해 대상 변경을 표시한다 → u2를 u1 결과로 조용히 열면 실패 | 검색 이동 주소에는 UID가 없다 ([`apps/wake/pages/cluster-search.js:45`](../../apps/wake/pages/cluster-search.js#L45)) | 이름 재사용을 구분하는 UID 전달이 빠져 있다 | 고정 없음 → TASK-SCREEN-SEARCH | D00456; D-USR-2026-11-16-7 |
| <a id="SCR-SEARCH-G03"></a> `SCR-SEARCH-G03` | 1. 홈과 인시던트 검색을 같은 폭에서 연다 → 두 필드는 clusterSearch.field의 같은 searchInput과 SEARCH_W를 사용한다 → 한쪽만 별도 반경·폭 규칙이면 실패.<br>2. 홈과 다른 본문 검색을 같은 사용 가능 폭에서 표시 → 같은 searchInput 및 승인된 공통 SEARCH_W 규칙 사용 → 한쪽만 별도 폭·다른 검색 renderer를 쓰면 실패. | field가 C.searchInput과 SEARCH_W를 공통 사용한다 ([`apps/wake/pages/cluster-search.js:25`](../../apps/wake/pages/cluster-search.js#L25)) | 추가 대조: D00939: 한쪽만 별도 폭·다른 검색 renderer를 쓰면 실패. | 고정 없음 → TASK-SCREEN-SEARCH | D00827, D00995; D00939 |

## 표별 판단 계약

검색은 cluster 범위의 FIND_KINDS에 한정한다. 열 정의는 [CMP-T-CLUSTER-SEARCH-01](../components/tables/cluster-search.md)을 따른다. 일치 등급과 kind 우선순위는 기본값 D-USR-2026-11-16-7이고, 문제 우선·namespace·name·UID 동점 규칙은 확정 결정 D-USR-2026-11-16-2이다. 행 이동은 SCR-SEARCH-G02, 부분 실패는 SCR-SEARCH-G01을 적용한다.

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SEARCH-TABLE"></a> `SCR-SEARCH-TABLE` | → [RULE-SORT](../rules.md#RULE-SORT). | findResources는 일치 등급·bad 여부·name만 비교한다 ([`apps/wake/data/find.js:26`](../../apps/wake/data/find.js#L26)) | danger·warn을 같은 bad로 묶고 kind·namespace·UID 동점 비교와 없는 값 후순위를 제공하지 않는다 | 고정 없음 → TASK-SCREEN-SEARCH | D-USR-2026-11-16-2; D-USR-2026-11-16-7 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SEARCH-REQ-R-026"></a> `SCR-SEARCH-REQ-R-026` | 홈·리소스에서 namespace를 고르고 검색한다 → 공통 도구 줄에서 범위·검색·필터 위치를 유지하며 kit.screen.search가 q를 바꾼다 → 페이지마다 검색 위치가 바뀌거나 q가 별도 복사본에 저장되면 실패 | query는 ctx.state의 key를 읽고 field는 kit.screen.search를 호출한다 ([`apps/wake/pages/cluster-search.js:18`](../../apps/wake/pages/cluster-search.js#L18)) | 없음(확인: apps/wake/pages/cluster-search.js:18) | 고정 없음 → TASK-SCREEN-SEARCH | D00825, D00826, D00827 |
| <a id="SCR-SEARCH-COVERAGE"></a> `SCR-SEARCH-COVERAGE` | 허용 종류 일부에 403을 주고 전체 이름 검색을 한다 → 읽은 종류의 결과와 미지원·권한 부족 종류를 구분한다 → 실패 종류를 검색 범위 전체에서 없던 종류로 처리하면 실패 | 종류별 읽기 결과를 모으되 거절된 Promise의 종류는 보존하지 않는다 ([`apps/wake/pages/cluster-search.js:22`](../../apps/wake/pages/cluster-search.js#L22)) | 검색 coverage에서 권한 부족 종류가 사라진다 | 고정 없음 → TASK-SCREEN-SEARCH | D00074; D-USR-2026-11-16-7 |
