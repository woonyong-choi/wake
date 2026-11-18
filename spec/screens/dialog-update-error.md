# 다이얼로그 · 업데이트 실패

<a id="SCR-DIALOG-UPDATE-ERROR"></a> 진입: `update.failed`. 목적(SRE 판단): 업데이트 실패의 대상·설정·실행 결과를 확인한다.
구성: 실제 오류 codeBlock → 닫기.
현재: [apps/wake/app.config.js](../../apps/wake/app.config.js); [apps/wake/ai-connect.js](../../apps/wake/ai-connect.js); [kit/shell/shell.js](../../kit/shell/shell.js); [kit/components/dialog.js](../../kit/components/dialog.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: desktop update status.error; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
고정 장치: `apps/wake/app.config.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-DIALOG-UPDATE-ERROR-01"></a> `SCR-DIALOG-UPDATE-ERROR-01` | update.status.state=error에서 상세를 연다 → status.error 코드 블록과 닫기·다시 시도가 보인다 → 업데이트 실패를 완료 화면으로 보이면 실패 | 오류 codeBlock과 releaseVersion 유무에 따른 retry action을 만든다; `kit/shell/shell.js:1182` | 없음(확인: `kit/shell/shell.js:1182`) | 고정 없음 → TASK-SCREEN-DIALOG-UPDATE-ERROR | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-UPDATE-ERROR-V01"></a> `SCR-DIALOG-UPDATE-ERROR-V01` | status.error에 updater가 정제한 실패 코드를 반환한다 → 코드 블록은 그 문자열만 표시한다 → 토큰·인증 주소를 원문 그대로 노출하면 실패 | fail은 UpdateError.code 또는 update_failed만 status.error에 넣는다; `kit/desktop/updater.cjs:205` | 없음(확인: `kit/desktop/updater.cjs:205`) | 고정 없음 → TASK-SCREEN-DIALOG-UPDATE-ERROR | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-UPDATE-ERROR-A01"></a> `SCR-DIALOG-UPDATE-ERROR-A01` | 업데이트 다운로드 실패 후 오류 상세를 연다 → status.state=error의 오류와 다시 시도만 보인다 → 성공 배지나 재시작 완료로 보이면 실패 | status.state가 error일 때만 오류 상세를 연다; `kit/shell/shell.js:1181` | 없음(확인: `kit/shell/shell.js:1181`) | 고정 없음 → TASK-SCREEN-DIALOG-UPDATE-ERROR | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-UPDATE-ERROR-A02"></a> `SCR-DIALOG-UPDATE-ERROR-A02` | 업데이트 오류창에서 Tab 이동 후 Escape로 닫는다 → SCR-SHARED-05에 따라 상세를 연 버튼에 초점이 돌아오고 다운로드는 시작하지 않는다 → 닫기가 재시도를 실행하면 실패 | Escape는 제출 없이 현재 다이얼로그를 닫는다; `kit/components/dialog.js:192` | 없음(확인: `kit/components/dialog.js:192`) | 고정 없음 → TASK-SCREEN-DIALOG-UPDATE-ERROR | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-UPDATE-ERROR-G01"></a> `SCR-DIALOG-UPDATE-ERROR-G01` | native 업데이트 다운로드 또는 설치를 실패시킨다 → 실제 오류와 재시도 가능한 상태를 표시한다 → 성공 배지 또는 재시작 완료로 표시하면 실패 | releaseVersion이 있으면 download, 없으면 check로 재시도한다; `kit/shell/shell.js:1183` | 없음(확인: `kit/shell/shell.js:1183`) | kit/desktop/updater.test.cjs — update_failed_download_cleans_partial_and_allows_retry | D-USR-2026-11-16-7 |
