# 다이얼로그 · 북마크 폴더 이름 변경

<a id="SCR-DIALOG-FOLDER-RENAME"></a> 진입: `wake.folder.rename`. 목적(SRE 판단): 북마크 폴더 이름 변경의 대상·설정·실행 결과를 확인한다.
구성: 기존 name 필수 입력 → 저장.
현재: [apps/wake/app.config.js](../../apps/wake/app.config.js); [apps/wake/ai-connect.js](../../apps/wake/ai-connect.js); [kit/shell/shell.js](../../kit/shell/shell.js); [kit/components/dialog.js](../../kit/components/dialog.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: folderOf(st,id).label; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
고정 장치: `apps/wake/app.config.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-DIALOG-FOLDER-RENAME-01"></a> `SCR-DIALOG-FOLDER-RENAME-01` | f1 이름 변경을 연다 → folderOf(st,f1).label이 필수 name 입력에 보이고 저장 버튼이 있다 → 빈 초기값 또는 다른 폴더 label이면 실패 | name에 현재 label을 넣고 required=true로 둔다; `apps/wake/app.config.js:442` | 없음(확인: `apps/wake/app.config.js:442`) | 고정 없음 → TASK-SCREEN-DIALOG-FOLDER-RENAME | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-FOLDER-RENAME-V01"></a> `SCR-DIALOG-FOLDER-RENAME-V01` | f1 이름을 '운영 <A>'로 저장한다 → wake.pinned.added의 f1.label만 이 문자열이 되어 사이드바와 메뉴에 나타난다 → HTML 요소로 실행하거나 f2도 바뀌면 실패 | 같은 id의 label을 trim한 name으로 교체한다; `apps/wake/app.config.js:1066` | 없음(확인: `apps/wake/app.config.js:1066`) | 고정 없음 → TASK-SCREEN-DIALOG-FOLDER-RENAME | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-FOLDER-RENAME-A01"></a> `SCR-DIALOG-FOLDER-RENAME-A01` | 새 이름을 입력한 뒤 취소하고 다시 열어 저장한다 → 취소 때 기존 label, 저장 후 사이드바와 계정 메뉴에 새 label이 보인다 → 취소만으로 저장되면 실패 | rename action에서만 setSetting을 호출한다; `apps/wake/app.config.js:1066` | 없음(확인: `apps/wake/app.config.js:1066`) | 고정 없음 → TASK-SCREEN-DIALOG-FOLDER-RENAME | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-FOLDER-RENAME-A02"></a> `SCR-DIALOG-FOLDER-RENAME-A02` | 이름을 공백으로 지우고 Enter 후 Escape를 누른다 → SCR-SHARED-05에 따라 저장을 막고 원래 폴더 버튼으로 돌아온다 → 빈 폴더 이름으로 저장하면 실패 | 공백만 있는 required 문자열을 오류로 처리한다; `kit/components/dialog.js:159` | 없음(확인: `kit/components/dialog.js:159`) | 고정 없음 → TASK-SCREEN-DIALOG-FOLDER-RENAME | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-FOLDER-RENAME-G01"></a> `SCR-DIALOG-FOLDER-RENAME-G01` | 기존 이름과 특수문자 이름을 입력해 Enter 저장 또는 Escape 취소한다 → 저장은 같은 폴더의 표시 이름을 바꾸고 취소는 원래 이름을 유지한다 → HTML로 해석하거나 다른 폴더를 바꾸면 실패 | rename은 id로 선택한 객체의 label 문자열만 교체한다; `apps/wake/app.config.js:1066` | 없음(확인: `apps/wake/app.config.js:1066`) | 고정 없음 → TASK-SCREEN-DIALOG-FOLDER-RENAME | D-USR-2026-11-16-7 |
