# 인시던트 · 범위

<a id="SCR-INCIDENT-SCOPE"></a> 진입: `wake://cluster/:cluster/incidents/:id (동일 작업면의 scope 구역)`. 목적(SRE 판단): 영향 받은 대상·서비스·기간을 특정한다.
구성: 작업면 공통 머리 → 범위 summaryBar → 해당 근거/표/계획.
현재: [apps/wake/pages/incident-detail.js](../../apps/wake/pages/incident-detail.js); [apps/wake/data/incident-model.js](../../apps/wake/data/incident-model.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 범위 판단 값; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-INC-01](../components/incident-criteria.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: incident.workspace.scope·affected와 evidence의 target이 대상·영향의 출처다. cluster·namespace·kind·name이 같아도 UID가 다르면 별도 객체로 취급한다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-SCOPE-01"></a> `SCR-INCIDENT-SCOPE-01` | 영향 범위를 펼친다 → workspace.scope의 Name·Status·Restarts·Change 표와 위험/주의 수가 보인다 → 범위 밖 대상이나 근거 없는 상태가 섞이면 실패 | scopeSection이 scope 배열을 표와 counts에 넘긴다(`apps/wake/pages/incident-detail.js:76`). | 행 식별자가 kind/name이며 namespace·UID가 빠졌다. | 고정 없음 → TASK-SCREEN-INCIDENT-SCOPE | D00092 |
| <a id="SCR-INCIDENT-SCOPE-V01"></a> `SCR-INCIDENT-SCOPE-V01` | → [RULE-SORT](../rules.md#RULE-SORT). | counts는 status 톤별 배열 길이를 센다(`apps/wake/pages/incident-detail.js:75`). | UID 중복 제거와 서비스 관계 표시가 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-SCOPE | D00092; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENT-SCOPE-A01"></a> `SCR-INCIDENT-SCOPE-A01` | 서로 다른 namespace의 동명 Pod 중 하나를 누르고 돌아온다 → 선택 행의 namespace·kind·name 상세와 기존 범위가 보인다 → 다른 namespace의 첫 동명 Pod를 열면 실패 | wake.inc.row가 name만으로 scope.find를 수행한다(`apps/wake/pages/incident-detail.js:199`). | 행 클릭에서 namespace·UID를 판별하지 않아 동명 대상이 충돌한다. | 고정 없음 → TASK-SCREEN-INCIDENT-SCOPE | D00094 |
| <a id="SCR-INCIDENT-SCOPE-A02"></a> `SCR-INCIDENT-SCOPE-A02` | 워크로드와 소속 Pod 두 개의 영향 근거를 연다 → scope[].uid와 evidence.target.uid가 같은 대상끼리 연결된다 → 다른 Pod 근거 연결이나 중복 UID 집계이면 실패 | workspace는 Pod 행에 uid를 넣고 소유자 행에서는 생략한다(`apps/wake/desktop/incident-hub.cjs:237`, `apps/wake/desktop/incident-hub.cjs:240`). | 소유자 행 UID와 표에서 근거로 가는 직접 연결이 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-SCOPE | D00092; D00742 |
| <a id="SCR-INCIDENT-SCOPE-G01"></a> `SCR-INCIDENT-SCOPE-G01` | PVC와 Application 장애를 각각 감지한다 → 원래 리소스 종류·namespace·UID와 영향 링크를 보존한다 → PVC를 Node로 바꾸거나 Application 사건을 누락하면 실패 | signalsOf의 알림 ref 분기는 Pod·Deployment·StatefulSet·CronJob·Job·Node·Ingress만 받는다(`apps/wake/data/incident-detect.js:62`). | PVC·Application 알림은 ref=null로 누락된다. Event의 involvedObject 종류는 보존한다. | 고정 없음 → TASK-SCREEN-INCIDENT-SCOPE | D00092; D-USR-2026-11-16-7 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-SUMMARY"></a> `SCR-INCIDENT-SUMMARY` | 범위와 확인 구역을 접고 펼친다 → 위험/주의 수와 verify 지속 시간은 머리 요약에만 보인다 → 본문에 큰 숫자 네 칸이 다시 보이면 실패 | scopeSection·verifySection은 items에 수치와 duration을 넣는다(`apps/wake/pages/incident-detail.js:85`, `apps/wake/pages/incident-detail.js:121`). | 없음(확인: apps/wake/pages/incident-detail.js:85) | `kit/components/verify-card.test.mjs` — `the card draws no strip of big time figures: those are named values in the head of the stage around it` | D01004 |
