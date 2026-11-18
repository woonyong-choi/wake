# 위 경로 막대와 구역 탭

<a id="SCR-TOPBAR"></a> 진입: `셸 활성 페이지 경로·구역`. 목적(SRE 판단): 현재 경로·구역·탭과 AI·도구 동작을 확인한다.
구성: 클러스터·구역·대상 경로 → 탭/더보기 → AI·도구·계정 동작.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 경로, 구역, 탭; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-TOPBAR-01"></a> `SCR-TOPBAR-01` | c/default/Pod/p 상세를 활성화한다 → 경로와 대상 도구·AI 동작은 활성 라우트의 params·meta를 표시한다 → 다른 탭의 경로나 계정 동작이 끼어들면 실패 | topbarHtml은 해당 tab의 crumbs와 route 기반 buttons를 전달한다 ([`kit/shell/shell.js:767`](../../kit/shell/shell.js#L767)) | 없음(확인: kit/shell/shell.js:767) | 고정 없음 → TASK-SCREEN-TOPBAR | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-TOPBAR-V01"></a> `SCR-TOPBAR-V01` | c/default/Pod/p와 d/prod/Service/s 탭을 번갈아 선택한다 → crumbsOf가 활성 대상 cluster·namespace·kind·name을 표시한다 → c 데이터에 d 경로가 붙으면 실패 | 경로는 tab.id의 meta.crumbs 또는 route.crumbs에서 만든다 ([`kit/shell/shell.js:751`](../../kit/shell/shell.js#L751)) | 없음(확인: kit/shell/shell.js:751) | 고정 없음 → TASK-SCREEN-TOPBAR | D00074 |
| <a id="SCR-TOPBAR-V02"></a> `SCR-TOPBAR-V02` | 구역 탭에서 홈·리소스·네트워크·GitOps·이벤트·로그·알림·인시던트를 누른다 → SECTIONS의 실제 경로로 같은 클러스터 안에서 이동한다 → 빈 페이지나 다른 클러스터이면 실패 | SECTIONS의 여덟 ID를 wake.view.section 동작에 연결한다 ([`apps/wake/pages/view-parts.js:18`](../../apps/wake/pages/view-parts.js#L18)) | 없음(확인: apps/wake/pages/view-parts.js:18) | 고정 없음 → TASK-SCREEN-TOPBAR | D01023 |
| <a id="SCR-TOPBAR-V03"></a> `SCR-TOPBAR-V03` | 구역 탭 전체 폭보다 창을 좁힌다 → 선택 탭은 남고 나머지는 더보기 메뉴에 들어간다 → 가로 스크롤이나 접근 불가 탭이면 실패 | fold는 선택 탭을 보존하고 넘친 탭을 more._items에 모은다 ([`kit/components/pill-tabs.js:61`](../../kit/components/pill-tabs.js#L61)) | 없음(확인: kit/components/pill-tabs.js:61) | 고정 없음 → TASK-SCREEN-TOPBAR | D01029 |
| <a id="SCR-TOPBAR-A01"></a> `SCR-TOPBAR-A01` | A meta 요청 중 B 탭으로 이동한 뒤 A 응답을 준다 → B 경로는 B의 meta를 유지한다 → B 경로가 A 이름으로 바뀌면 실패 | meta를 발신 tabId에 저장하고 topbar는 현재 navTab으로 다시 그린다 ([`kit/shell/shell.js:611`](../../kit/shell/shell.js#L611)) | 없음(확인: kit/shell/shell.js:611) | 고정 없음 → TASK-SCREEN-TOPBAR | D-USR-2026-11-16-6 |
| <a id="SCR-TOPBAR-A02"></a> `SCR-TOPBAR-A02` | 홈에서 GitOps로 바꾸고 창 폭을 줄였다 늘린다 → pill-tabs의 pane-tabs-before·after 토큰 간격을 유지한다 → 탭과 도구 줄이 겹치거나 화면별 간격이 달라지면 실패 | pills-fold는 공통 위·아래 margin 토큰을 사용한다 ([`kit/components/pill-tabs.js:27`](../../kit/components/pill-tabs.js#L27)) | 없음(확인: kit/components/pill-tabs.js:27) | 고정 없음 → TASK-SCREEN-TOPBAR | D00826 |
| <a id="SCR-TOPBAR-A03"></a> `SCR-TOPBAR-A03` | 상세와 AI 칸을 연다 → 누른 순간 최종 폭을 잡고 내용만 짧게 들어오며 빈 칸은 0개이다 → 폭이 점차 늘거나 빈 카드가 먼저 보이면 실패 | 카드는 ready 전에는 배치에서 빠지고 1,500ms 타이머가 만료되면 준비 여부와 무관하게 표시된다 ([`kit/shell/shell.js:391`](../../kit/shell/shell.js#L391)) | 누른 순간 폭을 예약하지 않으며 준비 신호 없는 페이지는 1,500ms 뒤 내용 없이 나타날 수 있다 | 고정 없음 → TASK-SCREEN-TOPBAR | D01022, D-USR-2026-11-16-5 |
| <a id="SCR-TOPBAR-G01"></a> `SCR-TOPBAR-G01` | 탭이 넘치는 창에서 메뉴를 닫고 포인터를 창 밖으로 뺀다 → 더보기 접근은 남고 hover 선택은 지워진다 → 창 밖인데 이전 항목 강조가 계속 보이면 실패 | 상단 버튼 강조는 CSS hover로 정의한다 ([`kit/components/topbar.js:23`](../../kit/components/topbar.js#L23)) | 창 밖 hover 해제 처리는 이 구성 요소에 별도로 없다 | 고정 없음 → TASK-SCREEN-TOPBAR | D01029; D-USR-2026-11-16-7 |
| <a id="SCR-TOPBAR-G02"></a> `SCR-TOPBAR-G02` | c에서 namespace prod·검색 api를 고른 뒤 홈·리소스·GitOps를 왕복한다 → 같은 cluster와 공통 필터 값을 유지한다 → 구역마다 기본 namespace로 돌아가면 실패 | nsScope는 페이지 ctx.state의 ns 키를 읽는다 ([`apps/wake/pages/view-parts.js:29`](../../apps/wake/pages/view-parts.js#L29)) | 구역별 페이지 상태에서 namespace를 읽어 공통 필터 공유가 이 함수만으로 이루어지지 않는다 | 고정 없음 → TASK-SCREEN-TOPBAR | D01023, D00826 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-TOPBAR-REQ-R-018"></a> `SCR-TOPBAR-REQ-R-018` | 본문에서 상세를 연 뒤 AI에 묻는다 → 본문·상세·AI 최대 세 칸이며 AI는 마지막이고 동일 내용의 하위 상세는 추가하지 않는다 → 네 번째 칸 또는 상세의 중복 하위 칸이면 실패 | applyPanes는 content·content2·content3 세 호스트를 배치한다 ([`kit/shell/shell.js:837`](../../kit/shell/shell.js#L837)) | 없음(확인: kit/shell/shell.js:837) | 고정 없음 → TASK-SCREEN-TOPBAR | D00882, D00883, D01022 |
| <a id="SCR-TOPBAR-REQ-R-022"></a> `SCR-TOPBAR-REQ-R-022` | 일반 알림과 critical 알림을 발생시킨다 → 가장 오른쪽 칸 머리 아래에 겹쳐 뜨며 화면 폭·위치·여백을 유지하고 critical은 남는다 → 화면이 밀리거나 critical이 자동 종료되면 실패 | 토스트는 fixed left 50%에 놓고 모든 알림에 종료 타이머를 건다 ([`kit/components/toast.js:13`](../../kit/components/toast.js#L13)) | 오른쪽 칸 기준 위치가 아니며 critical 유지 분기가 없다 | 고정 없음 → TASK-SCREEN-TOPBAR | D00950; D-USR-2026-11-16-7 |

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-TOPBAR-KIT"></a> `SCR-TOPBAR-KIT` | 탭·뒤로·AI 토글 단축키를 사용한다 → 셸 tabs와 chain의 같은 상태를 경로·상세·AI 표면이 공유한다 → 단축키 후 경로와 선택 탭이 달라지면 실패 | renderTopbar는 activePair 또는 navTab의 탭 모델을 사용한다 ([`kit/shell/shell.js:759`](../../kit/shell/shell.js#L759)) | 없음(확인: kit/shell/shell.js:759) | 고정 없음 → TASK-SCREEN-TOPBAR | D00074; D-USR-2026-11-16-7 |
