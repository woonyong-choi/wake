# AI 칸 · 승인 시트

<a id="SCR-APPROVAL"></a> 진입: `AI 실행 계획의 승인/거절 시트`. 목적(SRE 판단): 대상·변경·위험·되돌림을 확인해 허용 또는 거절한다.
구성: 제안 → 대상·변경·위험·근거·되돌림·확인 조건 → 승인/거절 → 실행 결과.
현재: [kit/shell/panel-engine.js](../../kit/shell/panel-engine.js); [apps/wake/desktop/ai-run.cjs](../../apps/wake/desktop/ai-run.cjs); [apps/wake/app.config.js](../../apps/wake/app.config.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 계획, 결정·결과; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-INC-01](../components/incident-criteria.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
고정 장치: `apps/wake/desktop/ai-target.test.cjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-APPROVAL-01"></a> `SCR-APPROVAL-01` | propose_action 계획의 승인 시트를 연다 → target·전체 diff·위험·근거·되돌림·확인 조건 뒤 승인/거절과 별도 실행 결과를 본다 → 승인 표시만으로 실행 완료를 보이면 실패 | p.head가 있으면 approvalHead를 questionPanel detail로 렌더한다; `kit/shell/panel-engine.js:240` | 실행 결과는 approved/denied 기록과 별개이며 호스트는 PR 생성 결과 URL을 반환하지 않는다 | 고정 없음 → TASK-SCREEN-APPROVAL | D00627, D00628, D00869 |
| <a id="SCR-APPROVAL-V01"></a> `SCR-APPROVAL-V01` | 대상 UID=u1의 계획을 표시한 뒤 승인한다 → 저장 approvals.plan과 화면의 전체 diff가 같아야 한다 → 다른 UID·다른 변경을 같은 승인으로 실행하면 실패 | propose는 target과 plan을 approvals 문서에 저장한다; `apps/wake/desktop/approvals.cjs:38` | decide에는 현재 대상 UID나 계획 해시를 재검증하는 코드가 없다 | 고정 없음 → TASK-SCREEN-APPROVAL | D00869 |
| <a id="SCR-APPROVAL-V02"></a> `SCR-APPROVAL-V02` | 대기 계획을 승인하되 실행하지 않는다 → state=approved만 표시하며 실행·복구 완료는 별도 관측으로 남는다 → approved를 ran 또는 복구로 바꾸면 실패 | approved와 ran을 별도 part state로 보존한다; `kit/shell/panel-engine.js:158` | 복구 관측 상태는 승인 part에 없다 | 고정 없음 → TASK-SCREEN-APPROVAL | D00627, D00636 |
| <a id="SCR-APPROVAL-A01"></a> `SCR-APPROVAL-A01` | 동일 계획에서 승인과 거절을 각각 실행한다 → 승인 전 쓰기 요청0, 한 번 승인한 같은 계획의 중복 실행0 → 승인 전 쓰기가 발생하거나 같은 승인을 두 번 실행하면 실패 | waiting이 아닌 승인은 replayed 결과를 반환한다; `apps/wake/desktop/approvals.cjs:46` | 없음(확인: `apps/wake/desktop/approvals.cjs:46`) | 고정 없음 → TASK-SCREEN-APPROVAL | D00869 |
| <a id="SCR-APPROVAL-A02"></a> `SCR-APPROVAL-A02` | 계획을 승인한 뒤 계획 내용 또는 대상 UID를 바꾸어 실행을 요청한다 → 이전 승인을 재사용하지 않고 변경된 계획의 새 승인을 요구한다 → 옛 승인으로 바뀐 계획이나 대상을 실행하면 실패 | decide는 저장 ID만 읽고 현재 리소스를 다시 조회하지 않는다; `apps/wake/desktop/approvals.cjs:44` | 승인 뒤 대상 교체와 계획 변경을 탐지할 UID·해시 비교가 없다 | 고정 없음 → TASK-SCREEN-APPROVAL | D00869 |
| <a id="SCR-APPROVAL-A03"></a> `SCR-APPROVAL-A03` | 동일 조치에 거절·취소·권한 부족·실행 실패를 각각 발생시킨다 → 각 결과를 감사 기록에 남기고 읽기 대화는 유지한다 → 결과가 누락되거나 실패 때문에 읽기 대화가 사라지면 실패 | 사람 결정마다 approve/deny 감사 행을 생성한다; `apps/wake/desktop/approvals.cjs:52` | 권한/취소 사유는 남지만 실행 실패를 실행 결과로 저장하는 분기가 없다 | 고정 없음 → TASK-SCREEN-APPROVAL | D00869, D00636 |
| <a id="SCR-APPROVAL-G01"></a> `SCR-APPROVAL-G01` | → [RULE-APPROVAL](../rules.md#RULE-APPROVAL). | PR 경로는 pending 또는 github-unconnected 문자열만 기록한다; `apps/wake/desktop/approvals.cjs:49` | 실제 Draft PR 생성 호출·URL·동기화·복구 관측이 없다 | 고정 없음 → TASK-SCREEN-APPROVAL | D00627, D00636; Draft PR는 D-USR-2026-11-16-7 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-APPROVAL-EXEC"></a> `SCR-APPROVAL-EXEC` | 대상·변경·위험·근거·되돌림·확인 조건을 가진 제안을 거절하고 같은 ID를 재전송한다 → 첫 결정과 감사 주체가 보존되고 쓰기는 발생하지 않는다 → 거절이 승인으로 바뀌거나 재실행하면 실패 | 첫 결정 이후 재요청은 replayed로 반환하며 새 결정을 쓰지 않는다; `apps/wake/desktop/approvals.cjs:46` | 실행 경로 자체가 구현되지 않아 승인 후 실행 결과는 제공하지 못한다 | 고정 없음 → TASK-SCREEN-APPROVAL | D00627, D00628, D00636 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-APPROVAL-REQ-R-038"></a> `SCR-APPROVAL-REQ-R-038` | 전체 변경을 본 사용자가 승인 후 같은 요청을 다시 보낸다 → approvals.plan에 대한 첫 decidedBy·decidedAt을 계속 표시한다 → 두 번째 요청으로 결정자·시각을 덮어쓰면 실패 | 재전송 결과에 최초 state/by/time을 반환한다; `apps/wake/desktop/approvals.cjs:46` | 없음(확인: `apps/wake/desktop/approvals.cjs:46`) | 고정 없음 → TASK-SCREEN-APPROVAL | D00869 |
| <a id="SCR-APPROVAL-LAB-P6"></a> `SCR-APPROVAL-LAB-P6` | Git PR 경로를 승인한다 → 실제 공급자 생성 응답의 Draft PR 주소 또는 실패를 결과로 표시한다 → pending만으로 생성 완료를 보이면 실패 | github() 존재 여부로 prResult 문자열만 정한다; `apps/wake/desktop/approvals.cjs:49` | 지원 Git 공급자 선택 및 Draft PR 생성·URL 저장이 없다 | 고정 없음 → TASK-SCREEN-APPROVAL | D-USR-2026-11-16-7; SEC-006; FLOW-APR-003 (실제 PR 생성 응답) |
