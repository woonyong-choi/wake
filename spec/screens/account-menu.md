# 계정 메뉴

<a id="SCR-ACCOUNT-MENU"></a> 진입: `wake.account`. 목적(SRE 판단): 로컬 프로필과 설정·기록·권한 진입점을 찾는다.
구성: 로컬 프로필 → 북마크·작업 기록·도구·권한 → 설정 → 새 탭.
현재: [apps/wake/app.config.js](../../apps/wake/app.config.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 프로필, 메뉴 대상; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
고정 장치: `apps/wake/app.config.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-ACCOUNT-MENU-01"></a> `SCR-ACCOUNT-MENU-01` | 계정 버튼을 연다 → api.user 또는 로컬 프로필 다음 북마크·작업 기록·현재 클러스터 도구·권한·설정·새 탭이 나타난다 → 메뉴 순서가 다르거나 다른 클러스터 도구가 나타나면 실패 | wake.account가 프로필과 이동 항목을 순서대로 반환한다; `apps/wake/app.config.js:470` | 없음(확인: `apps/wake/app.config.js:470`) | 고정 없음 → TASK-SCREEN-ACCOUNT-MENU | D-USR-2026-11-16-7 |
| <a id="SCR-ACCOUNT-MENU-V01"></a> `SCR-ACCOUNT-MENU-V01` | api.user가 없는 로컬 실행에서 계정 메뉴를 연다 → 프로필은 wake.account.local 번역이며 로그인·로그아웃·조직 항목이 없다 → 서버 계정에 로그인한 것처럼 표시하면 실패 | acc-me는 api.user가 없으면 로컬 프로필을 쓴다; `apps/wake/app.config.js:472` | 없음(확인: `apps/wake/app.config.js:472`) | 고정 없음 → TASK-SCREEN-ACCOUNT-MENU | D-USR-2026-11-16-7 |
| <a id="SCR-ACCOUNT-MENU-V02"></a> `SCR-ACCOUNT-MENU-V02` | 활성 탭 cluster=A, scopeCluster=B에서 메뉴를 연다 → 도구는 toolsHere(A), 작업 기록은 B의 ailog로 이동한다 → 도구와 감사 범위를 서로 바꾸면 실패 | 활성 경로의 cluster로 도구를 찾고 468행에서 logCluster를 별도로 얻는다; `apps/wake/app.config.js:466` | 없음(확인: `apps/wake/app.config.js:466`) | 고정 없음 → TASK-SCREEN-ACCOUNT-MENU | D-USR-2026-11-16-7 |
| <a id="SCR-ACCOUNT-MENU-A01"></a> `SCR-ACCOUNT-MENU-A01` | 마우스와 방향키로 하위 메뉴를 열고 Escape를 누른다 → 키보드·마우스로 모든 하위 메뉴를 열고 Escape로 닫아 원래 버튼에 초점을 돌린다 → 닫힌 뒤 원래 계정 버튼으로 초점이 돌아오지 않으면 실패 | Escape 처리와 closeAll의 trigger 초점 복귀가 있다; `kit/components/menu.js:410` | 없음(확인: `kit/components/menu.js:410`) | 고정 없음 → TASK-SCREEN-ACCOUNT-MENU | D-USR-2026-11-16-7 |
| <a id="SCR-ACCOUNT-MENU-A02"></a> `SCR-ACCOUNT-MENU-A02` | Electron 도구 탭 위에서 계정 메뉴를 열고 메뉴 항목을 누른다 → 메뉴가 탭 위에 보이고 입력은 해당 메뉴가 처리한다 → 메뉴가 탭 뒤로 숨거나 클릭이 뒤 페이지로 통과하면 실패 | setOverlay가 메뉴 소유자를 등록하고 native 탭을 freeze하여 셸 메뉴가 입력을 받게 한다; `kit/shell/hosts/desktop-host.js:105` | 없음(확인: `kit/shell/hosts/desktop-host.js:105`) | kit/shell/hosts/desktop-host.test.mjs — setOverlay_multiple_owners_release_only_after_last_owner | D-USR-2026-11-16-7 |
| <a id="SCR-ACCOUNT-MENU-G01"></a> `SCR-ACCOUNT-MENU-G01` | 계정 메뉴에서 최근 감사 항목을 연다 → 실제 감사 ID·시각과 모두 보기 이동을 제공한다 → 최근 기록 요구를 모두 보기 링크만으로 충족했다고 판정하면 실패 | 작업 기록 하위 메뉴에는 aa-all 한 항목만 있다; `apps/wake/app.config.js:476` | 최근 감사 ID·시각 목록이 없고 모두 보기 링크만 있다 | 고정 없음 → TASK-SCREEN-ACCOUNT-MENU | D00466, D00473; 세부 메뉴는 D-USR-2026-11-16-7 |

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-ACCOUNT-MENU-KIT"></a> `SCR-ACCOUNT-MENU-KIT` | 계정 메뉴와 북마크 하위 메뉴를 Tab·Shift+Tab·Escape로 조작한다 → MenuDef의 선택 항목으로 이동하고 닫기 후 계정 버튼에 초점이 온다 → 초점이 뒤 페이지로 새거나 하위 메뉴가 남으면 실패 | 북마크 폴더를 submenu.items로 변환한다; `apps/wake/app.config.js:474` | 계정 메뉴는 일반 메뉴이므로 Tab은 닫기로 처리된다. 순환 이동은 popover에서만 제공한다 | 고정 없음 → TASK-SCREEN-ACCOUNT-MENU | D-USR-2026-11-16-7 |
