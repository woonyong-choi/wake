# 명령 팔레트

<a id="SCR-PALETTE"></a> 진입: `mod+k / kit.palette.open`. 목적(SRE 판단): 이름·명령으로 리소스·탭·대화에 접근한다.
구성: 검색 입력 → 리소스·대화·명령·열린 탭 결과.
현재: [apps/wake/app.config.js](../../apps/wake/app.config.js); [kit/components/palette.js](../../kit/components/palette.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 리소스, 최근 대화, 명령; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.

자료: PaletteDef.sources/commands와 각 항목의 action·arg·address, activeCluster가 결과·실행 대상의 출처다. 선택 인덱스와 열기 전 focus는 키보드 이동·닫기 판정에 사용한다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-PALETTE-01"></a> `SCR-PALETTE-01` | mod+k로 팔레트를 열고 이름을 입력한다 → 검색 입력 아래 등록 sources의 리소스·대화·명령 결과가 보이고 열린 탭 검색에 접근할 수 있다 → 등록 결과가 빠지거나 입력이 다른 창에 남으면 실패 | palette.sources는 resources·conv·cmd 세 개이며 단축키는 mod+k다(`apps/wake/app.config.js:1287`). | 열린 탭은 별도 kit.palette.tabs 동작이다. 일반 팔레트 sources에는 탭 그룹이 없다. | 고정 없음 → TASK-SCREEN-PALETTE | D-USR-2026-11-16-7 |
| <a id="SCR-PALETTE-V01"></a> `SCR-PALETTE-V01` | 클러스터 A에서 빈 검색 후 Pod 이름을 입력한다 → A의 리소스만 조회·표시하며 입력 전에는 리소스 조회를 시작하지 않는다 → B 결과 혼입 또는 빈 입력 조회이면 실패 | paletteResources는 cluster별 캐시를 쓰고 queryOnly는 visible에서 결과만 숨긴다(`apps/wake/app.config.js:187`, `kit/components/palette.js:37`). | queryOnly는 표시 조건이며 입력 후 조회 시작을 보장하지 않는다. | 고정 없음 → TASK-SCREEN-PALETTE | D-USR-2026-11-16-7 |
| <a id="SCR-PALETTE-V02"></a> `SCR-PALETTE-V02` | 저장된 활성 대화 하나를 선택한다 → chatsOf의 c.id에 해당하는 wake:// 대화가 열린다 → 새 ID를 만들거나 삭제된 대화를 열면 실패 | conv source가 active 대화의 id를 addr.chat으로 바꾼다(`apps/wake/app.config.js:1292`). | 없음(확인: apps/wake/app.config.js:1292) | 고정 없음 → TASK-SCREEN-PALETTE | D00078; D-USR-2026-11-16-7 |
| <a id="SCR-PALETTE-V03"></a> `SCR-PALETTE-V03` | activeCluster가 없는 상태와 A인 상태로 명령을 연다 → PaletteDef.commands에서 연결 설정은 항상 보이고 감사 기록은 A가 있을 때만 A 주소로 보인다 → 대상 없는 감사 주소가 보이면 실패 | cmd source는 scopeCluster 값이 있을 때 감사 명령을 추가한다(`apps/wake/app.config.js:1293`). | 없음(확인: apps/wake/app.config.js:1293) | 고정 없음 → TASK-SCREEN-PALETTE | D-USR-2026-11-16-7 |
| <a id="SCR-PALETTE-A01"></a> `SCR-PALETTE-A01` | 결과 목록에서 방향키·Enter·Escape를 각각 누른다 → 방향키로 선택하고 Enter로 선택 결과를 열며 Escape로 닫아 원래 초점을 복원한다 → 다른 결과를 열거나 Escape 뒤 초점이 돌아오지 않으면 실패 | attach는 방향키·Enter·Escape를 처리하지만 close는 요소 제거와 onOverlay만 호출한다(`kit/components/palette.js:70`, `kit/components/palette.js:86`). | 구성 요소 close()에는 열기 전 초점을 저장·복원하는 코드가 없다. | 고정 없음 → TASK-SCREEN-PALETTE | D-USR-2026-11-16-7 |
| <a id="SCR-PALETTE-A02"></a> `SCR-PALETTE-A02` | 좁은 창에서 마지막 항목까지 스크롤한다 → 최대 높이는 viewport 안이며 결과 끝까지 스크롤 가능하다 → 마지막 행이 잘리거나 고정 머리와 본문이 겹치면 실패 | pal은 viewport 기반 max-height이고 pal-list는 min-height:0과 overflow-y:auto다(`kit/components/palette.js:16`, `kit/components/palette.js:24`). | 없음(확인: kit/components/palette.js:16) | 고정 없음 → TASK-SCREEN-PALETTE | D-USR-2026-11-16-7 |
| <a id="SCR-PALETTE-G01"></a> `SCR-PALETTE-G01` | 검색 일부 출처를 실패시키고 인덱스 작성 후 대상 UID를 교체한다 → 부분 실패·오래된 색인을 표시하고 원래 대상 신원을 재확인한다 → 부분 결과를 전체로 표시하거나 새 UID로 조용히 이동하면 실패 | paletteResources는 fulfilled 결과만 모으고 kind/ns/name을 ID로 삼아 30초 캐시한다(`apps/wake/app.config.js:190`). | 실패 종류·오래됨 안내와 UID 재확인이 없다. | 고정 없음 → TASK-SCREEN-PALETTE | D00066; D-USR-2026-11-16-7 |

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-PALETTE-KIT"></a> `SCR-PALETTE-KIT` | 단축키로 열고 리소스·대화·명령 결과를 각각 실행한다 → PaletteDef.sources의 action과 arg에 맞는 화면이 열린다 → 라벨만 있고 동작이 없거나 다른 주소를 열면 실패 | palette.run은 선택 행의 action과 arg를 emit한다(`kit/components/palette.js:84`). | 없음(확인: kit/components/palette.js:84) | 고정 없음 → TASK-SCREEN-PALETTE | D00760, D-USR-2026-11-16-7 |
