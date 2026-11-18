# 인시던트 · 감사 기록

<a id="SCR-INCIDENT-RECORD"></a> 진입: `wake://cluster/:cluster/incidents/:id (동일 작업면의 record 구역)`. 목적(SRE 판단): 요청·승인·실행 주체와 결과를 확인한다.
구성: 작업면 공통 머리 → 감사 기록 summaryBar → 해당 근거/표/계획.
현재: [apps/wake/pages/incident-detail.js](../../apps/wake/pages/incident-detail.js); [apps/wake/data/incident-model.js](../../apps/wake/data/incident-model.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 감사 기록 판단 값; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-INC-01](../components/incident-criteria.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: incident.workspace.audit의 at·requester·executor·client·model·action·result·permission과 불변 실행 ID를 기준으로 한다. 동일 승인/실행의 재전송을 새 기록으로 세지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-RECORD-01"></a> `SCR-INCIDENT-RECORD-01` | 감사 기록 구역을 연다 → workspace.audit의 시각·주체·결과·권한과 머리의 행 수가 보인다 → 다른 실행의 결과가 섞이거나 행 수와 표가 다르면 실패 | recordSection이 audit를 표와 rows.length 머리로 조립한다(`apps/wake/pages/incident-detail.js:126`). | 행 키가 불변 실행 ID가 아닌 배열 인덱스 aN이다. | 고정 없음 → TASK-SCREEN-INCIDENT-RECORD | D00869 |
| <a id="SCR-INCIDENT-RECORD-V01"></a> `SCR-INCIDENT-RECORD-V01` | 사람 승인 기록을 받는다 → audit.requester·executor·result·permission이 자동 기록으로 보인다 → 승인자를 생략하거나 수동 메모 입력을 요구하면 실패 | requesterMark·auditSummary·sourceBadge와 permission 열을 표시한다(`apps/wake/pages/incident-detail.js:130`). | executor를 별도 값으로 표시하는 열이 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-RECORD | D00912; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENT-RECORD-A01"></a> `SCR-INCIDENT-RECORD-A01` | 기록 구역을 펼쳤다가 다른 구역을 열고 돌아온다 → 같은 audit 행과 펼침 상태를 유지한다(SCR-SHARED-01) → 다른 사건 기록이나 접힌 초기 상태가 보이면 실패 | opened에 구역 상태를 기록하고 recordSection이 읽는다(`apps/wake/pages/incident-detail.js:132`, `apps/wake/pages/incident-detail.js:197`). | 없음(확인: apps/wake/pages/incident-detail.js:132) | 고정 없음 → TASK-SCREEN-INCIDENT-RECORD | D00094; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENT-RECORD-A02"></a> `SCR-INCIDENT-RECORD-A02` | 같은 approval 요청을 허용한 뒤 거절 응답을 다시 보낸다 → audit에 첫 승인 기록 하나와 그 requester.name만 남는다 → 후속 거절이 결정을 덮거나 감사 행을 추가하면 실패 | decide는 waiting이 아니면 replayed를 반환해 audit 호출을 건너뛴다(`apps/wake/desktop/approvals.cjs:45`). | 없음(확인: apps/wake/desktop/approvals.cjs:45) | 고정 없음 → TASK-SCREEN-INCIDENT-RECORD | D00869, D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENT-RECORD-G01"></a> `SCR-INCIDENT-RECORD-G01` | 조치를 부분 실행한 뒤 실패시키고 같은 결과를 재전달한다 → 부분·실패 감사 기록이 원래 실행 ID에 한 번씩 남는다 → 기록 누락·중복 또는 성공으로 승격 시 실패 | decide의 감사 결과는 승인 ok/denied이며 실행 부분 실패 수신은 없다(`apps/wake/desktop/approvals.cjs:52`). | 승인 중복 방지는 있으나 실행 ID별 부분·실패 결과 적재는 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-RECORD | D00869, D-USR-2026-11-16-7 |
