# 인시던트 · 복구 확인

<a id="SCR-INCIDENT-VERIFY"></a> 진입: `wake://cluster/:cluster/incidents/:id (동일 작업면의 verify 구역)`. 목적(SRE 판단): 증상 회복과 서비스 복구의 필수 조건을 판정한다.
구성: 작업면 공통 머리 → 복구 확인 summaryBar → 해당 근거/표/계획.
현재: [apps/wake/pages/incident-detail.js](../../apps/wake/pages/incident-detail.js); [apps/wake/data/incident-model.js](../../apps/wake/data/incident-model.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 복구 확인 판단 값; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-INC-01](../components/incident-criteria.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료와 판정: incident.workspace.verify의 conditions·windows·verifyFrom·stable·need와 실제 관측 target/condition/source/at/result를 사용한다. → [RULE-RECOVERY](../rules.md#RULE-RECOVERY).

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-VERIFY-01"></a> `SCR-INCIDENT-VERIFY-01` | verify.verifyFrom이 있는 사건을 연다 → windows 관측 띠·conditions 상태와 stable/need 지속 시간이 보인다 → 관측 없이 해결로 보이면 실패 → [RULE-RECOVERY](../rules.md#RULE-RECOVERY) | verifySection이 verifyFrom을 검사하고 verifyCard를 구성한다(`apps/wake/pages/incident-detail.js:117`). | 해결 시각은 inc.phase를 믿으며 마지막 정상 관측과 교차 확인하지 않는다. | 고정 없음 → TASK-SCREEN-INCIDENT-VERIFY | D-USR-2026-11-16-3 |
| <a id="SCR-INCIDENT-VERIFY-V01"></a> `SCR-INCIDENT-VERIFY-V01` | 같은 UID·조건·출처에 정상 관측과 중간 누락을 각각 공급한다. 판정은 [RULE-RECOVERY](../rules.md#RULE-RECOVERY)를 따른다. | verifyVerdict는 경과에서 누락 횟수만 빼고 ok 수를 합산한다(`apps/wake/data/incident-model.js:183`). | 정상 창 재시작 대신 누적 누락 10분 및 전체 deadline으로 inconclusive를 만든다. | 고정 없음 → TASK-SCREEN-INCIDENT-VERIFY | D-USR-2026-11-16-3 |
| <a id="SCR-INCIDENT-VERIFY-A01"></a> `SCR-INCIDENT-VERIFY-A01` | 확인 조건의 근거 원문을 열고 돌아온다 → 같은 UID·조건·출처 관찰창과 마지막 관측이 유지된다(SCR-SHARED-01) → 다른 대상 관측을 이어 붙이면 실패 | 조건에는 source 이름만 전달하며 근거 action은 없다(`apps/wake/pages/incident-detail.js:119`). | 조건별 관측 원문을 여는 링크가 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-VERIFY | D00094; D-USR-2026-11-16-3 |
| <a id="SCR-INCIDENT-VERIFY-A02"></a> `SCR-INCIDENT-VERIFY-A02` | 승인 뒤 정상 관측 두 개만 받은 채 5분이 지난다 → 복구 대신 관찰 중을 표시한다(V01 판정 계약) → 타이머만으로 통과나 해결이 보이면 실패 → [RULE-RECOVERY](../rules.md#RULE-RECOVERY) | verifyVerdict는 최소 ok 수를 검사하지만 화면 완료 단계는 inc.phase를 따른다(`apps/wake/data/incident-model.js:193`, `apps/wake/pages/incident-detail.js:149`). | 판정 결과와 phase를 하나의 관찰창에서 공급하는 경계가 화면 계약에 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-VERIFY | D-USR-2026-11-16-3 |
| <a id="SCR-INCIDENT-VERIFY-G01"></a> `SCR-INCIDENT-VERIFY-G01` | 관측 중 UID·조건·출처 중 하나를 바꾸고 새 정상 관측을 공급한다 → 머리의 판정 계약에 따라 새 관찰창에서 시간과 횟수를 센다 → 이전 창의 정상 시간을 계승하거나 실행 완료만으로 복구하면 실패 → [RULE-RECOVERY](../rules.md#RULE-RECOVERY) | verifyVerdict는 miss 앞뒤 ok를 모두 세며 마지막 miss만 배제한다(`apps/wake/data/incident-model.js:193`). | 누락 앞뒤 성공을 합칠 수 있고 UID·조건·출처 변경 판별 인수가 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-VERIFY | D-USR-2026-11-16-3 |

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-VERIFY-REQ-R-054"></a> `SCR-INCIDENT-VERIFY-REQ-R-054` | 필수 조건에 pass·fail·unknown과 수집 miss를 공급한다 → 조건별 통과·실패·미판정, windows 누락, 연속 정상 시간이 구분된다 → unknown/miss를 pass로 표시하면 실패 → [RULE-RECOVERY](../rules.md#RULE-RECOVERY) | workspace의 condState는 모든 조건을 phase에 따라 pass/watch/undefined로 만든다(`apps/wake/desktop/incident-hub.cjs:289`). | 조건별 판정 대신 사건 phase 하나로 상태를 일괄 정한다. | 고정 없음 → TASK-SCREEN-INCIDENT-VERIFY | D-USR-2026-11-16-3 |
