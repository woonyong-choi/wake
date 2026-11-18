# 사이드바

<a id="SCR-SIDEBAR"></a> 진입: `셸 sidebar`. 목적(SRE 판단): 연결 대상·북마크·열린 작업·인시던트를 구분해 오간다.
공통 구역 계약: → [RULE-SIDEBAR](../rules.md#RULE-SIDEBAR).
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 클러스터, 북마크, 대화·인시던트, 열린 탭; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SIDEBAR-01"></a> `SCR-SIDEBAR-01` | → [RULE-SIDEBAR](../rules.md#RULE-SIDEBAR) | sidebar.sections는 clusters·pinned·conversations·tabs 순서이며, conversations.rows는 열린 인시던트를 일반 대화보다 앞에 합친다 ([`apps/wake/app.config.js:922`](../../apps/wake/app.config.js#L922)) | 없음(확인: apps/wake/app.config.js:922) | apps/wake/app.config.test.mjs :: sidebar_is_clusters_bookmarks_conversations_and_open_tabs_without_page_rows | D00990; B-006 |
| <a id="SCR-SIDEBAR-V01"></a> `SCR-SIDEBAR-V01` | 연결한 클러스터 c와 발견만 한 d를 둔다 → 탐색에는 저장 연결 c만 주 대상으로 표시한다 → d를 연결된 클러스터로 추가하면 실패 | 클러스터 행은 shownClusters의 저장 연결로 생성한다 ([`apps/wake/app.config.js:924`](../../apps/wake/app.config.js#L924)) | 없음(확인: apps/wake/app.config.js:924) | `apps/wake/app.config.test.mjs` — `sidebar_cluster_provider_icons_preserve_navigation_suffix_and_filter`; `no_cluster_appears_without_a_connected_kubeconfig_context` (표시 대상·필터만 고정) | D00990 |
| <a id="SCR-SIDEBAR-V02"></a> `SCR-SIDEBAR-V02` | 주소와 폴더명을 저장한 북마크를 다시 연다 → pinnedOf의 label·address·폴더 children을 보존한다 → 폴더명이 바뀌거나 다른 주소가 열리면 실패 | 북마크 폴더와 단일 항목을 구분해 원래 값을 전달한다 ([`apps/wake/app.config.js:926`](../../apps/wake/app.config.js#L926)) | 없음(확인: apps/wake/app.config.js:926) | apps/wake/app.config.test.mjs :: saved_bookmarks_keep_the_existing_submenu_and_navigation | D00990 |
| <a id="SCR-SIDEBAR-V03"></a> `SCR-SIDEBAR-V03` | 열린 탭 B를 선택한 뒤 닫는다 → tabs 상태에 따라 B 선택을 표시하고 닫은 뒤 목록에서 제거한다 → 닫힌 B가 남거나 A가 대신 닫히면 실패 | kind tabs 구역은 tabsSection으로 현재 탭 모델을 렌더한다 ([`kit/shell/shell.js:708`](../../kit/shell/shell.js#L708)) | 없음(확인: kit/shell/shell.js:708) | 고정 없음 → TASK-SCREEN-SIDEBAR | D00990 |
| <a id="SCR-SIDEBAR-V04"></a> `SCR-SIDEBAR-V04` | → [RULE-SIDEBAR](../rules.md#RULE-SIDEBAR) | new-chat 뒤에 inc·conv를 이어 붙이고 최근 한도로 자른다 ([`apps/wake/app.config.js:934`](../../apps/wake/app.config.js#L934)) | 열린 인시던트가 최근 한도를 채우면 활성 대화가 모두 잘릴 수 있다 | 고정 없음 → TASK-SCREEN-SIDEBAR | D00990; B-006 |
| <a id="SCR-SIDEBAR-A01"></a> `SCR-SIDEBAR-A01` | conversations를 접은 상태에서 새 인시던트를 수신한다 → kit.collapsed의 접힘과 lead 새 대화 행을 유지한다 → 갱신이 구역을 자동으로 펼치면 실패 | 구역 collapsed와 lead는 행 데이터 갱신과 별도 상태로 전달한다 ([`kit/shell/shell.js:736`](../../kit/shell/shell.js#L736)) | 없음(확인: kit/shell/shell.js:736) | 고정 없음 → TASK-SCREEN-SIDEBAR | D00990; D-USR-2026-11-16-7 (수동 접힘 유지) |
| <a id="SCR-SIDEBAR-A02"></a> `SCR-SIDEBAR-A02` | c 메뉴의 context 복사·새 탭·연결 해제를 사용한다 → c.ctx를 복사하고 c 홈을 열며 해제는 c 연결에만 적용한다 → 다른 연결까지 해제되면 실패 | 클러스터 메뉴의 열기·복사·해제는 모두 선택한 id를 동작 인자로 전달한다 ([`apps/wake/app.config.js:500`](../../apps/wake/app.config.js#L500)) | 없음(확인: apps/wake/app.config.js:500) | 고정 없음 → TASK-SCREEN-SIDEBAR | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SIDEBAR-A03"></a> `SCR-SIDEBAR-A03` | 같은 클러스터에서 홈·리소스·GitOps로 이동한다 → 머리의 네 구역을 유지하고 페이지 구역을 사이드바 항목으로 추가하지 않는다 → 홈·네트워크 탐색 행이 다시 생기면 실패 | 사이드바에는 클러스터 행이 있고 본문 구역의 고정 탐색 행은 없다 ([`apps/wake/app.config.js:923`](../../apps/wake/app.config.js#L923)) | 없음(확인: apps/wake/app.config.js:923) | 고정 없음 → TASK-SCREEN-SIDEBAR | D00990 |
| <a id="SCR-SIDEBAR-G01"></a> `SCR-SIDEBAR-G01` | 인시던트가 열린 상태에서 대화 목록을 갱신한다 → 머리의 conversations 위치를 유지하고 실제 대화 ID를 표시한다 → 열린 탭과 순서가 바뀌거나 대화 구역이 삭제되면 실패 | conv는 active 대화를 필터하고 chat id 주소를 만든다 ([`apps/wake/app.config.js:933`](../../apps/wake/app.config.js#L933)) | 없음(확인: apps/wake/app.config.js:933) | 고정 없음 → TASK-SCREEN-SIDEBAR | D00990; B-006 |
| <a id="SCR-SIDEBAR-G02"></a> `SCR-SIDEBAR-G02` | 구역 표시 선택을 저장하고 다시 연다 → kit.sidebar.sections의 pinned·conversations 선택과 고정 clusters·tabs 순서가 일치한다 → incidents라는 별도 구역이 생기면 실패 | optional 구역만 저장된 표시 목록으로 거른다 ([`kit/shell/shell.js:736`](../../kit/shell/shell.js#L736)) | 없음(확인: kit/shell/shell.js:736) | 고정 없음 → TASK-SCREEN-SIDEBAR | D00990; B-006 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SIDEBAR-GROUPS"></a> `SCR-SIDEBAR-GROUPS` | 사이드바를 접었다 펼치고 데이터를 새로 받는다 → 머리의 구역 계약을 유지하며 하단 계정은 스크롤 목록 바깥에 남는다 → 계정이 열린 탭 사이에 섞이면 실패 | 계정과 검색을 sidebar.bottom에 별도로 정의한다 ([`apps/wake/app.config.js:940`](../../apps/wake/app.config.js#L940)) | 없음(확인: apps/wake/app.config.js:940) | 고정 없음 → TASK-SCREEN-SIDEBAR | D00990; B-006 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SIDEBAR-REQ-R-024"></a> `SCR-SIDEBAR-REQ-R-024` | 본문 표를 평면으로 표시한 채 사이드바 선택 행을 연다 → 승인된 sidebar-row의 둥근 선택 면과 설정·AI 컨트롤 반경은 유지한다 → 본문 규칙을 따라 사이드바 반경까지 0이 되면 실패 | sidebar는 별도 native 토큰을 사용하는 공통 구성 요소이다 ([`kit/components/sidebar.js:14`](../../kit/components/sidebar.js#L14)) | 없음(확인: kit/components/sidebar.js:14) | kit/tools/check-surfaces.test.mjs :: the sidebar row keeps the side tone pixels: 8px circular | D00059, D00067 |

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SIDEBAR-KIT"></a> `SCR-SIDEBAR-KIT` | lead 새 대화 행이 있는 conversations를 접는다 → SectionDef.id로 접힘을 저장하고 lead는 계속 보인다 → 새 대화 행까지 사라지면 실패 | rowsOf는 lead와 일반 행을 나눠 렌더한다 ([`kit/shell/shell.js:719`](../../kit/shell/shell.js#L719)) | 없음(확인: kit/shell/shell.js:719) | 고정 없음 → TASK-SCREEN-SIDEBAR | D00990; D-USR-2026-11-16-7 (접힘·lead 보존) |
