# 다이얼로그 · 탭 그룹 북마크 저장

<a id="SCR-DIALOG-GROUP-BOOKMARK"></a> 진입: `kit.group.to-bookmarks`. 목적(SRE 판단): 탭 그룹 북마크 저장의 대상·설정·실행 결과를 확인한다.
구성: 그룹 이름 입력 → 저장.
현재: [apps/wake/app.config.js](../../apps/wake/app.config.js); [apps/wake/ai-connect.js](../../apps/wake/ai-connect.js); [kit/shell/shell.js](../../kit/shell/shell.js); [kit/components/dialog.js](../../kit/components/dialog.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: tabs.state.groups와 groupName; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
고정 장치: `apps/wake/app.config.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-DIALOG-GROUP-BOOKMARK-01"></a> `SCR-DIALOG-GROUP-BOOKMARK-01` | 탭 그룹 g1에서 북마크로 저장을 연다 → groups의 groupName(g1)이 필수 name 입력에 보인다 → 다른 그룹 이름으로 시작하면 실패 | 그룹 id를 찾아 groupName을 입력값으로 설정한다; `kit/shell/shell.js:1227` | 없음(확인: `kit/shell/shell.js:1227`) | 고정 없음 → TASK-SCREEN-DIALOG-GROUP-BOOKMARK | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-GROUP-BOOKMARK-V01"></a> `SCR-DIALOG-GROUP-BOOKMARK-V01` | 탭 2개인 g1을 '운영'으로 저장한다 → membersOf(g1)의 현재 address·title·icon이 운영 폴더 items가 된다 → 그룹 밖 탭을 포함하면 실패 | 현재 members를 config.sidebar.bookmark에 전달하고 각 탭을 닫는다; `kit/shell/shell.js:1230` | 없음(확인: `kit/shell/shell.js:1230`) | 고정 없음 → TASK-SCREEN-DIALOG-GROUP-BOOKMARK | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-GROUP-BOOKMARK-A01"></a> `SCR-DIALOG-GROUP-BOOKMARK-A01` | g1 저장을 취소한 뒤 다시 확인한다 → 취소는 탭 유지, 확인은 실제 members의 주소를 북마크 폴더에 저장한다 → 취소 때 그룹이 닫히거나 주소가 바뀌면 실패 | bookmarked action은 북마크 전달 후 members의 탭을 닫는다; `kit/shell/shell.js:1231` | 북마크 영속 저장 성공을 기다리는 응답 처리 없이 탭을 닫는다 | 고정 없음 → TASK-SCREEN-DIALOG-GROUP-BOOKMARK | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-GROUP-BOOKMARK-A02"></a> `SCR-DIALOG-GROUP-BOOKMARK-A02` | 그룹 이름을 비워 Enter를 누른 뒤 Escape로 닫는다 → SCR-SHARED-05에 따라 빈 이름 저장은 막고 원래 그룹 버튼에 초점을 돌린다 → Enter 중복 제출이나 초점 소실이면 실패 | 검증 후 submit.action을 한 번 emit한다; `kit/components/dialog.js:168` | 없음(확인: `kit/components/dialog.js:168`) | 고정 없음 → TASK-SCREEN-DIALOG-GROUP-BOOKMARK | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-GROUP-BOOKMARK-G01"></a> `SCR-DIALOG-GROUP-BOOKMARK-G01` | 중복 이름·빈 그룹·닫힌 탭이 포함된 그룹을 저장한다 → 실제 남은 탭만 같은 그룹의 저장 대상이 되고 빈 그룹·충돌은 명시적으로 처리한다 → 닫힌 주소를 다른 탭으로 대체하거나 무관한 폴더를 덮어쓰면 실패 | 저장 시점 membersOf를 읽으며 빈 그룹이면 바로 반환한다; `kit/shell/shell.js:1229` | 빈 그룹에 대한 안내가 없고 동명 폴더 충돌 여부도 이 처리에서 검사하지 않는다 | 고정 없음 → TASK-SCREEN-DIALOG-GROUP-BOOKMARK | D-USR-2026-11-16-7 |
