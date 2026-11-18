# 다이얼로그 · 필요한 권한 시트

<a id="SCR-DIALOG-PERMISSION"></a> 진입: `wake.perm.sheet`. 목적(SRE 판단): 필요한 권한 시트의 대상·설정·실행 결과를 확인한다.
구성: 빠진 권한 한 줄 → kubectl → YAML → 복사·가능 시 적용·Slack.
현재: [apps/wake/app.config.js](../../apps/wake/app.config.js); [apps/wake/ai-connect.js](../../apps/wake/ai-connect.js); [kit/shell/shell.js](../../kit/shell/shell.js); [kit/components/dialog.js](../../kit/components/dialog.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: arg.need→grantOf; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
고정 장치: `apps/wake/app.config.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-DIALOG-PERMISSION-01"></a> `SCR-DIALOG-PERMISSION-01` | need={resource,verb,namespace,user}로 권한 시트를 연다 → grantOf의 빠진 권한·kubectl·YAML과 복사, can일 때 적용, Slack 연결 상태가 보인다 → 다른 namespace 명령이면 실패 | arg.need를 grantOf에 전달하고 can과 Slack 설정으로 버튼을 구성한다; `apps/wake/app.config.js:446` | 없음(확인: `apps/wake/app.config.js:446`) | 고정 없음 → TASK-SCREEN-DIALOG-PERMISSION | D00033, D00078; 시트 구성은 D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-PERMISSION-V01"></a> `SCR-DIALOG-PERMISSION-V01` | namespace=ns1인 need를 표시한다 → 설명과 kubectl·YAML이 grantOf(need,cluster)의 ns1 범위다 → 클러스터 전체 권한으로 넓히면 실패 | namespace 유무로 설명을 나누고 grantOf 결과를 본문에 넣는다; `apps/wake/app.config.js:447` | 없음(확인: `apps/wake/app.config.js:447`) | 고정 없음 → TASK-SCREEN-DIALOG-PERMISSION | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-PERMISSION-A01"></a> `SCR-DIALOG-PERMISSION-A01` | 권한 명령을 복사하고 부여 가능 여부와 Slack 연결 유무를 바꾼다 → 복사는 원문 명령을 전달하고 실제 부여 가능한 경우만 적용 표시하며 Slack 연결 때만 전송을 허용한다 → 복사값이 다르거나 부여 불가 상태를 적용 완료로 표시하거나 미연결 Slack으로 전송하면 실패 | wake.copy는 writeText 실패를 무시한 뒤 copied 토스트를 낸다; `apps/wake/app.config.js:1135` | 복사 거절을 성공으로 표시한다 | 고정 없음 → TASK-SCREEN-DIALOG-PERMISSION | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-PERMISSION-A02"></a> `SCR-DIALOG-PERMISSION-A02` | 권한 시트를 Tab으로 순환하다 Escape로 닫는다 → SCR-SHARED-05에 따라 복사·적용·Slack 호출 없이 원래 권한 버튼으로 돌아온다 → 닫기가 전송이나 적용을 실행하면 실패 | Escape는 close를 호출하며 submit을 실행하지 않는다; `kit/components/dialog.js:192` | 없음(확인: `kit/components/dialog.js:192`) | 고정 없음 → TASK-SCREEN-DIALOG-PERMISSION | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-PERMISSION-G01"></a> `SCR-DIALOG-PERMISSION-G01` | 권한 적용·명령 복사·외부 전송을 각각 요청한다 → 승인된 적용 범위만 실행하고 연결된 전송 대상에만 사용자 동의 후 보낸다 → 복사만으로 적용 성공 표시 또는 동의 없는 전송 시 실패 | 적용은 terminal.run, Slack은 notify.send에 명령 문자열을 전달한다; `apps/wake/app.config.js:1097` | 적용 action에는 별도 계획 승인 ID 검사가 없고 can은 시트 버튼 표시 조건이다 | 고정 없음 → TASK-SCREEN-DIALOG-PERMISSION | D00869; 전송 세부는 D-USR-2026-11-16-7 |

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-DIALOG-PERMISSION-KIT"></a> `SCR-DIALOG-PERMISSION-KIT` | 권한 시트에서 닫기를 누르고 이름 입력이 있는 다른 다이얼로그를 연다 → SCR-SHARED-05의 동일 DialogDef 초점·필수 검사·제출/취소 계약을 적용한다 → 이전 시트 값이나 초점이 새 폼에 남으면 실패 | close는 현재 다이얼로그를 정리하고 trigger를 복원한다; `kit/components/dialog.js:145` | 없음(확인: `kit/components/dialog.js:145`) | 고정 없음 → TASK-SCREEN-DIALOG-PERMISSION | D-USR-2026-11-16-7 |
