# 설정 탐색과 틀

<a id="SCR-SETTINGS"></a> 진입: `wake://settings/:page`. 목적(SRE 판단): 설정 범주와 바뀌는 실제 동작을 찾는다.
공통 배치 계약: 앱 사이드바 → 경계선·여백 → 창 바탕의 설정 목록 → 가운데 고정 폭 내용 칸 하나.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 목록, 선택·검색, 바닥 링크; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-SETTINGS](../components/tables/settings.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-01"></a> `SCR-SETTINGS-01` | 앱 사이드바를 펼친 채 설정을 연다 → 화면 머리의 설정 배치 계약대로 창 바탕 메뉴와 내용 칸 하나를 표시한다 → 이중 둥근 프레임이면 실패 | 설정은 nav와 col을 contentCard inset 하나에 넣는다 ([`kit/page/kinds/settings.js:186`](../../kit/page/kinds/settings.js#L186)) | 없음(확인: kit/page/kinds/settings.js:186) | kit/tools/check-surfaces.test.mjs :: the settings body is the one frame: a frame around it or a card inside it fails | D01020, D01036; D00637, D00678 |
| <a id="SCR-SETTINGS-V01"></a> `SCR-SETTINGS-V01` | 설정 목록의 각 페이지를 선택한다 → SETTINGS.groups의 일반·모양·AI 대화·모델·연결·클러스터·에이전트·도구·Git·권한·보관함으로 이동한다 → 선택 가능한 항목이 열리지 않으면 실패 | SETTINGS.groups가 개인·AI·연결·권한·기록 페이지를 선언한다 ([`apps/wake/app.config.js:250`](../../apps/wake/app.config.js#L250)) | 없음(확인: apps/wake/app.config.js:250) | 고정 없음 → TASK-SCREEN-SETTINGS | D00078, D00445 |
| <a id="SCR-SETTINGS-V02"></a> `SCR-SETTINGS-V02` | 설정 검색 후 한 항목을 고르고 포인터를 창 밖으로 뺀다 → page.id와 일치하는 항목 하나만 선택 표시하고 hover는 지운다 → 두 행이 동시에 선택된 것처럼 남으면 실패 | navItem.current는 p.id와 page.id가 같은지 비교한다 ([`kit/page/kinds/settings.js:156`](../../kit/page/kinds/settings.js#L156)) | 선택 ID는 하나지만 창 밖 포인터의 hover 해제는 navItem에서 다루지 않는다 | 고정 없음 → TASK-SCREEN-SETTINGS | D01041; D-USR-2026-11-16-7 |
| <a id="SCR-SETTINGS-V03"></a> `SCR-SETTINGS-V03` | 바닥의 의견 보내기와 문서를 누른다 → package.repository에서 만든 issues·README URL을 시스템 브라우저로 연다 → 앱 내부 설정 탭이 웹 페이지로 대체되면 실패 | footer URL을 kit.settings.link 동작으로 연결한다 ([`kit/page/kinds/settings.js:174`](../../kit/page/kinds/settings.js#L174)) | 없음(확인: kit/page/kinds/settings.js:174) | 고정 없음 → TASK-SCREEN-SETTINGS | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-A01"></a> `SCR-SETTINGS-A01` | AI 칸이 열린 리소스 탭에서 설정으로 갔다 돌아온다 → 설정에서는 AI를 숨기고 복귀하면 원래 대화·칸 상태를 표시한다 → 설정에 AI가 남거나 대화가 바뀌면 실패 | settleCards는 열린 AI 카드를 활성 탭에 옮기며 settings 경로를 제외하지 않는다 ([`kit/shell/shell.js:440`](../../kit/shell/shell.js#L440)) | 설정에서는 새 AI 열기 버튼만 숨기며 이미 열린 AI 카드를 숨기는 분기가 없다 | 고정 없음 → TASK-SCREEN-SETTINGS | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-A02"></a> `SCR-SETTINGS-A02` | 사이드바를 펼쳤다 접으며 설정 목록을 본다 → 창 바탕 메뉴와 세로 구분선·여백을 유지하고 접으면 앱 사이드바 경계만 사라진다 → 메뉴까지 둥근 카드로 감싸면 실패 | 설정 경로에는 frame-main의 bare 클래스를 적용한다 ([`kit/shell/shell.js:816`](../../kit/shell/shell.js#L816)) | 없음(확인: kit/shell/shell.js:816) | 고정 없음 → TASK-SCREEN-SETTINGS | D01036 |
| <a id="SCR-SETTINGS-A03"></a> `SCR-SETTINGS-A03` | 다크·라이트에서 1280px·1680px 창으로 마지막 설정 행까지 스크롤한다 → contentCard의 내부 스크롤로 마지막 행과 테두리를 전부 볼 수 있다 → 잘려서 도달하지 못하면 실패 | inset 본문에 data-scroll content 영역을 둔다 ([`kit/components/content-card.js:21`](../../kit/components/content-card.js#L21)) | 없음(확인: kit/components/content-card.js:21) | 고정 없음 → TASK-SCREEN-SETTINGS | D01030 |
| <a id="SCR-SETTINGS-G01"></a> `SCR-SETTINGS-G01` | 설정 전체를 두 테마에서 연다 → 화면 머리의 배치 계약과 동일한 메뉴 바탕·가운데 고정 폭·단일 카드가 보인다 → 중첩 프레임 또는 폭 무제한 본문이면 실패 | s-col은 settings-col-w 최대 폭과 margin auto를 사용한다 ([`kit/page/kinds/settings.js:247`](../../kit/page/kinds/settings.js#L247)) | 없음(확인: kit/page/kinds/settings.js:247) | 고정 없음 → TASK-SCREEN-SETTINGS | D01020, D01036 |
| <a id="SCR-SETTINGS-G02"></a> `SCR-SETTINGS-G02` | 설정 면에 filter opacity(0)와 clip-path circle(0px)을 적용한다 → 보이지 않는 면은 점검에서도 실패한다 → 안 보이는 면이 PASS이면 실패 | SHOWN_WHY는 opacity 곱과 일부 clipPath를 검사한다 ([`kit/tools/check-surfaces.mjs:51`](../../kit/tools/check-surfaces.mjs#L51)) | CSS filter의 opacity 함수는 SHOWN_WHY에서 판정하지 않는다 | kit/tools/check-surfaces.mjs :: SHOWN_WHY | D01035; D-USR-2026-11-16-7 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-FRAME"></a> `SCR-SETTINGS-FRAME` | 설정에서 셸 사이드바를 토글하고 검색 후 다른 범주를 고른다 → 왼쪽 설정 메뉴는 창 바탕과 구분선 위에 있고 가운데 본문 카드 하나만 유지한다. 검색은 메뉴 위 고정 위치, 행의 단일 동작은 오른쪽 끝 슬롯에 둔다 → 카드 안에 두 번째 외부 틀이 생기거나 검색이 본문과 함께 스크롤되거나 컨트롤이 겹치면 실패 | nav를 cc-card 바깥에 두어 본문 카드와 분리한다 ([`kit/components/content-card.js:21`](../../kit/components/content-card.js#L21)) | AI 대화 소리 행은 switch와 stack 버튼을 함께 둬 별도 행 검토가 남는다 | 고정 없음 → TASK-SCREEN-SETTINGS | D01020; D01028; D01036; D00637; D00678 |
| <a id="SCR-SETTING-STATE"></a> `SCR-SETTING-STATE` | 1. 연결 행의 비밀 입력을 제출·취소하고 재진입한다 → 같은 저장 키의 실제 결과만 표시하며 오류는 해당 행에 남긴다 → 비밀 복원 또는 다른 행 결과 초기화이면 실패.<br>2. 입력 각 대상 화면에 실제 이어갈 작업이 있는 경우와 없는 경우 입력 → 기대 컨트롤마다 가능한 실제 행동을 제공하고 진행 로그는 실제 작업에서만 발생 → 실패 아무 일도 하지 않는 등록 핸들러나 가짜 진행 로그가 노출 | 연결 시작 시 form 키를 비우고 흐름별 key로 run을 호출한다 ([`apps/wake/app.config.js:1116`](../../apps/wake/app.config.js#L1116)) | 추가 대조: D00078: 아무 일도 하지 않는 등록 핸들러나 가짜 진행 로그가 노출. | 고정 없음 → TASK-SCREEN-SETTINGS | D00078, D00993 |

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-KIT"></a> `SCR-SETTINGS-KIT` | 클러스터 A 읽기가 대기인 설정 정의를 로드한다 → SettingsDef sections·rows·controls를 그대로 그리고 B 응답이 먼저 표시된다 → 모든 pending 완료까지 빈 페이지이면 실패 | sections를 먼저 반영하고 pending 중 하나가 끝나면 다시 load한다 ([`kit/page/kinds/settings.js:144`](../../kit/page/kinds/settings.js#L144)) | 없음(확인: kit/page/kinds/settings.js:144) | kit/page/kinds/settings.test.mjs :: a section with reads still under way draws now and builds again when they settle, and a reload passes fresh | D-USR-2026-11-16-6 |
