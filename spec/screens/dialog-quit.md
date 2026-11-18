# 다이얼로그 · 앱 종료 확인

<a id="SCR-DIALOG-QUIT"></a> 진입: `quit-request`. 목적(SRE 판단): 앱 종료 확인의 대상·설정·실행 결과를 확인한다.
구성: 앱 이름·종료 설명 → 취소/종료.
현재: [apps/wake/app.config.js](../../apps/wake/app.config.js); [apps/wake/ai-connect.js](../../apps/wake/ai-connect.js); [kit/shell/shell.js](../../kit/shell/shell.js); [kit/components/dialog.js](../../kit/components/dialog.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: desktop quit-request; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
고정 장치: `apps/wake/app.config.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-DIALOG-QUIT-01"></a> `SCR-DIALOG-QUIT-01` | desktop quit-request를 보낸다 → config.brand.name을 포함한 종료 제목과 취소·종료 버튼이 탭 위에 보인다 → 확인 전 앱이 닫히면 실패 | Dialog overlay를 소유자 집합에 넣고 뒤 native view를 freeze한다; `kit/shell/hosts/desktop-host.js:105` | 없음(확인: `kit/shell/hosts/desktop-host.js:105`) | kit/shell/hosts/desktop-host.test.mjs — setOverlay_multiple_owners_release_only_after_last_owner | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-QUIT-V01"></a> `SCR-DIALOG-QUIT-V01` | 종료 확인에서 취소 후 다시 열어 종료를 누른다 → 전자는 app:quit-cancel, 후자는 app:quit 호출이다 → 취소가 app:quit을 부르면 실패 | 종료와 취소 action을 각각 다른 desktop invoke에 연결한다; `kit/shell/shell.js:1308` | 없음(확인: `kit/shell/shell.js:1308`) | 고정 없음 → TASK-SCREEN-DIALOG-QUIT | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-QUIT-A01"></a> `SCR-DIALOG-QUIT-A01` | 종료 대화상자를 열어 취소와 확인을 각각 누른다 → 취소하면 원래 입력으로 초점이 돌아오고 확인하면 종료하며 대화상자는 탭 위에 보인다 → 취소해도 종료되거나 초점이 유실되거나 대화상자가 탭 뒤로 숨으면 실패 | close는 trigger가 연결되어 있으면 focus를 돌린다; `kit/components/dialog.js:153` | desktop quit-request는 호출 인자에 원래 입력 trigger를 명시하지 않는다 | 고정 없음 → TASK-SCREEN-DIALOG-QUIT | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-QUIT-A02"></a> `SCR-DIALOG-QUIT-A02` | 종료 확인에서 Escape를 누른다 → SCR-SHARED-05의 취소·초점 복귀와 함께 app:quit-cancel만 발생한다 → 창이 종료되거나 뒤 탭으로 클릭이 통과하면 실패 | onCancel은 kit.app.quit-cancel로 선언되어 있다; `kit/shell/shell.js:1386` | 없음(확인: `kit/shell/shell.js:1386`) | 고정 없음 → TASK-SCREEN-DIALOG-QUIT | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-QUIT-G01"></a> `SCR-DIALOG-QUIT-G01` | 종료 확인을 연 채 취소하고 늦은 thaw 응답을 전달한다 → 소유 다이얼로그만 닫히고 원래 입력 초점이 돌아온다 → 다른 overlay가 닫히거나 뒤 페이지로 클릭이 통과하면 실패 | 늦은 capture는 frozen !== pending이면 폐기하고 다른 owner가 남으면 thaw하지 않는다; `kit/shell/hosts/desktop-host.js:116` | overlay 소유권은 보호하지만 quit-request에서 원래 입력 trigger를 넘기지 않아 취소 초점 복귀는 빠져 있다 | kit/shell/hosts/desktop-host.test.mjs — setOverlay_late_capture_cannot_release_a_new_toast_cycle | D-USR-2026-11-16-7 |
