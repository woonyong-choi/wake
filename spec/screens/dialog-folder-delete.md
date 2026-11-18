# 다이얼로그 · 북마크 폴더 삭제 확인

<a id="SCR-DIALOG-FOLDER-DELETE"></a> 진입: `wake.folder.delete`. 목적(SRE 판단): 북마크 폴더 삭제 확인의 대상·설정·실행 결과를 확인한다.
구성: 삭제할 폴더 이름 → 취소/삭제.
현재: [apps/wake/app.config.js](../../apps/wake/app.config.js); [apps/wake/ai-connect.js](../../apps/wake/ai-connect.js); [kit/shell/shell.js](../../kit/shell/shell.js); [kit/components/dialog.js](../../kit/components/dialog.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: folder id/name; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
고정 장치: `apps/wake/app.config.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-DIALOG-FOLDER-DELETE-01"></a> `SCR-DIALOG-FOLDER-DELETE-01` | 북마크 폴더 f1 삭제를 연다 → folderOf의 label과 폴더 안 모든 항목 삭제 안내, 취소·삭제가 보인다 → 하위 항목 삭제 안내가 없으면 실패 | 폴더 label을 wake.folder.deleteDesc의 name에 넣는다; `apps/wake/app.config.js:443` | 없음(확인: `apps/wake/app.config.js:443`) | 고정 없음 → TASK-SCREEN-DIALOG-FOLDER-DELETE | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-FOLDER-DELETE-V01"></a> `SCR-DIALOG-FOLDER-DELETE-V01` | label이 같은 f1·f2 중 f1을 삭제한다 → wake.pinned.added에서 f1과 그 하위 items만 제거된다 → f2까지 사라지면 실패 | a.arg와 같은 id의 폴더만 filter로 제거한다; `apps/wake/app.config.js:1067` | 없음(확인: `apps/wake/app.config.js:1067`) | 고정 없음 → TASK-SCREEN-DIALOG-FOLDER-DELETE | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-FOLDER-DELETE-A01"></a> `SCR-DIALOG-FOLDER-DELETE-A01` | 하위 북마크 2개인 f1 삭제를 취소한 뒤 확인한다 → 취소 시 2개 유지, 확인 시 안내대로 f1과 2개 모두 제거된다 → 취소 때 구조가 바뀌거나 하위 항목만 남으면 실패 | 폴더 객체 전체를 저장 목록에서 제거한다; `apps/wake/app.config.js:1067` | 없음(확인: `apps/wake/app.config.js:1067`) | 고정 없음 → TASK-SCREEN-DIALOG-FOLDER-DELETE | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-FOLDER-DELETE-A02"></a> `SCR-DIALOG-FOLDER-DELETE-A02` | 폴더 삭제창에서 Escape로 취소한다 → SCR-SHARED-05의 초점 복귀가 적용되어 폴더 메뉴 버튼으로 돌아온다 → 폴더가 삭제되거나 focus가 닫힌 창에 남으면 실패 | close가 연결된 trigger에 focus를 돌린다; `kit/components/dialog.js:153` | 없음(확인: `kit/components/dialog.js:153`) | 고정 없음 → TASK-SCREEN-DIALOG-FOLDER-DELETE | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-FOLDER-DELETE-G01"></a> `SCR-DIALOG-FOLDER-DELETE-G01` | 하위 북마크가 있는 폴더의 삭제를 취소한 뒤 확인한다 → 취소는 구조를 보존하고 확인 결과는 다이얼로그의 하위 항목 처리 안내와 같다 → 안내 없이 하위 북마크를 잃거나 취소 때 변경하면 실패 | deleteDesc는 폴더와 그 안의 모든 항목 삭제를 알린다; `apps/wake/locale/ko.js:139` | 없음(확인: `apps/wake/locale/ko.js:139`) | 고정 없음 → TASK-SCREEN-DIALOG-FOLDER-DELETE | D-USR-2026-11-16-7 |
