# 설정 · 일반

<a id="SCR-SETTINGS-GENERAL"></a> 진입: `wake://settings/general`. 목적(SRE 판단): 일반의 대상·설정·실행 결과를 확인한다.
구성: 설정 공통 틀 → 일반 sections → settingsRow/connectionRow → 행 끝 컨트롤 하나.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 언어, 시작 방식, 로그인 시 실행, 인시던트 알림, 맞춤법, 버전; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-SETTINGS](../components/tables/settings.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-GENERAL-01"></a> `SCR-SETTINGS-GENERAL-01` | 일반 설정을 연다 → app.config의 preferences와 about 순서로 언어·시작·로그인·알림·맞춤법·버전이 보인다 → 버전이 빠지거나 같은 행이 두 번 나오면 실패 | general.sections가 기본 설정과 앱 정보 묶음을 선언한다 ([`apps/wake/app.config.js:252`](../../apps/wake/app.config.js#L252)) | 없음(확인: apps/wake/app.config.js:252) | 고정 없음 → TASK-SCREEN-SETTINGS-GENERAL | D00078, D01020 |
| <a id="SCR-SETTINGS-GENERAL-V01"></a> `SCR-SETTINGS-GENERAL-V01` | 언어에서 English를 고른다 → kit.locale=en에 따라 현재 화면과 재시작한 화면 문구가 영어가 된다 → 메뉴만 한국어로 남거나 재시작 후 선택이 사라지면 실패 | locale 변경 시 applyLocale 후 모든 호스트에 shell:locale을 보낸다 ([`kit/shell/shell.js:641`](../../kit/shell/shell.js#L641)) | 없음(확인: kit/shell/shell.js:641) | 고정 없음 → TASK-SCREEN-SETTINGS-GENERAL | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-GENERAL-V02"></a> `SCR-SETTINGS-GENERAL-V02` | 일반 설정을 연다 → 새 탭 기본 모드 행이 없다(새 탭 시작 화면 삭제) → 그 행이 다시 보이면 실패 | general.sections에 new-tab-mode 행이 없다 | 없음 | `apps/wake/app.config.test.mjs` — new_tab_and_start_open_the_last_viewed_cluster_home_and_there_is_no_start_page | D-USR-2026-11-18-22 |
| <a id="SCR-SETTINGS-GENERAL-V03"></a> `SCR-SETTINGS-GENERAL-V03` | 시작할 때를 "지난 탭 다시 열기"와 "클러스터 홈"으로 바꿔 재시작한다 → 앞은 kit.session의 탭을 복원하고 뒤는 마지막으로 본 클러스터 홈을 연다. 예전 저장 값 new는 클러스터 홈으로 보이고 그렇게 동작한다 → 두 선택이 같은 결과이거나 새 탭 화면이 열리면 실패 | 세션 읽기는 kit.startup이 new가 아닐 때만, 아니면 startAt()(`kit/shell/shell.js`); 선택지 restore·new(클러스터 홈) | 없음 | `kit/shell/shell.test.mjs` — startup_and_a_new_tab_open_the_start_address_as_it_is_now_and_there_is_no_new_tab_page; `apps/wake/app.config.test.mjs` — new_tab_and_start_open_the_last_viewed_cluster_home_and_there_is_no_start_page | D-USR-2026-11-18-23 |
| <a id="SCR-SETTINGS-GENERAL-V04"></a> `SCR-SETTINGS-GENERAL-V04` | 패키지 앱에서 로그인 시 실행을 켰는데 OS 등록이 실패한다 → kit.openAtLogin 스위치는 실제 등록 결과를 반영한다 → 실패 뒤에도 켜짐으로 남으면 실패 | login:set 실패를 catch로 삼키고 설정 값을 되돌리지 않는다 ([`kit/shell/shell.js:643`](../../kit/shell/shell.js#L643)) | OS 실패와 저장된 켜짐 값을 조정하는 경로가 없다 | 고정 없음 → TASK-SCREEN-SETTINGS-GENERAL | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-GENERAL-V05"></a> `SCR-SETTINGS-GENERAL-V05` | 인시던트 알림 행을 연다 → wake.notify.incidents의 기능 상태를 보여 주고 소비자가 없으면 조작 불가로 둔다 → 작동하지 않는 스위치를 사용 가능으로 표시하면 실패 | 인시던트 알림 스위치는 disabled true이다 ([`apps/wake/app.config.js:259`](../../apps/wake/app.config.js#L259)) | D00993의 실제 알림 기능 활성화는 남아 있다 | 고정 없음 → TASK-SCREEN-SETTINGS-GENERAL | D00993 |
| <a id="SCR-SETTINGS-GENERAL-V06"></a> `SCR-SETTINGS-GENERAL-V06` | 맞춤법을 끄고 대화 입력란에 오탈자를 쓴 뒤 다시 켠다 → kit.spellcheck 값에 따라 입력란의 맞춤법 검사 사용 상태가 달라진다 → 토글만 바뀌고 검사 사용 상태는 같으면 실패 | spellcheck 스위치는 kit.spellcheck 키에 연결하지만 disabled true이다 ([`apps/wake/app.config.js:260`](../../apps/wake/app.config.js#L260)) | 일반 설정에서 맞춤법 검사 사용 여부를 바꿀 수 없다 | 고정 없음 → TASK-SCREEN-SETTINGS-GENERAL | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-GENERAL-V07"></a> `SCR-SETTINGS-GENERAL-V07` | 일반 설정의 앱 정보를 연다 → 실행 패키지의 package.json version을 formatToolVersion으로 표시한다 → 고정 예시 버전이 보이면 실패 | 버전 행은 pkg.version을 formatToolVersion에 전달한다 ([`apps/wake/app.config.js:263`](../../apps/wake/app.config.js#L263)) | 없음(확인: apps/wake/app.config.js:263) | 고정 없음 → TASK-SCREEN-SETTINGS-GENERAL | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-GENERAL-A01"></a> `SCR-SETTINGS-GENERAL-A01` | 언어를 en으로 저장하고 모양 설정을 거쳐 돌아온다 → 저장된 kit.locale과 일반 설정 선택값이 en이다 → 선택만 ko로 돌아오면 실패 | 언어 control은 kit.locale을 저장 키로 사용한다 ([`apps/wake/app.config.js:254`](../../apps/wake/app.config.js#L254)) | 없음(확인: apps/wake/app.config.js:254) | 고정 없음 → TASK-SCREEN-SETTINGS-GENERAL | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-GENERAL-A02"></a> `SCR-SETTINGS-GENERAL-A02` | 일반 설정에서 언어를 바꾼 뒤 시작 방식 선택을 연다 → 각 행의 선택은 자기 설정 키에만 반영되고 연결용 비밀 입력은 나타나지 않는다 → 일반 설정에 토큰 폼이 열리면 실패 | 일반 페이지는 select·switch·버전 행으로 구성되며 연결 폼이 없다 ([`apps/wake/app.config.js:253`](../../apps/wake/app.config.js#L253)) | 없음(확인: apps/wake/app.config.js:253) | 고정 없음 → TASK-SCREEN-SETTINGS-GENERAL | D00078, D01020 |
| <a id="SCR-SETTINGS-GENERAL-A03"></a> `SCR-SETTINGS-GENERAL-A03` | 로그인 시 실행 저장만 호스트에서 실패시키고 언어 en은 유지한다 → 실패를 해당 행에 표시하고 언어 선택은 en으로 남긴다 → 오류가 숨거나 언어도 초기화되면 실패 | login:set 거절 결과를 빈 catch로 처리한다 ([`kit/shell/shell.js:643`](../../kit/shell/shell.js#L643)) | 행별 저장 실패 표시가 없다 | 고정 없음 → TASK-SCREEN-SETTINGS-GENERAL | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-GENERAL-G01"></a> `SCR-SETTINGS-GENERAL-G01` | 인시던트 알림을 끈 설정으로 새 사건을 발생시킨다 → 알림 소비자가 wake.notify.incidents=false를 적용해 알림을 보내지 않는다 → 저장값과 무관하게 알림이 뜨면 실패 | 알림 행은 비활성이고 기본값 true만 선언되어 있다 ([`apps/wake/app.config.js:259`](../../apps/wake/app.config.js#L259)) | 일반 설정에서 알림 소비자를 켜고 끄는 기능이 제공되지 않는다 | 고정 없음 → TASK-SCREEN-SETTINGS-GENERAL | D00993 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-CONSUMERS"></a> `SCR-SETTINGS-CONSUMERS` | 알림을 끄고 namespace 숨김·대화 보관 기간을 저장한 뒤 재시작한다 → 각 저장 키가 실제 알림·탐색·정리에 반영된다 → 스위치 표시만 유지되고 소비 결과가 같으면 실패 | 보관 기간과 알림 컨트롤을 disabled로 선언한다 ([`apps/wake/app.config.js:223`](../../apps/wake/app.config.js#L223)) | 보관 기간·알림의 활성 소비 경로가 설정 UI에 연결되지 않았다 | 고정 없음 → TASK-SCREEN-SETTINGS-GENERAL | D00993, D00465, D00472 |
