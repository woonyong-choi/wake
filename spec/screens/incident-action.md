# 인시던트 · 조치

<a id="SCR-INCIDENT-ACTION"></a> 진입: `wake://cluster/:cluster/incidents/:id (동일 작업면의 act 구역)`. 목적(SRE 판단): 변경·위험·되돌림을 비교해 조치를 고른다.
구성: 작업면 공통 머리 → 조치 summaryBar → 해당 근거/표/계획.
현재: [apps/wake/pages/incident-detail.js](../../apps/wake/pages/incident-detail.js); [apps/wake/data/incident-model.js](../../apps/wake/data/incident-model.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 조치 판단 값; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-INC-01](../components/incident-criteria.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: incident 서비스의 workspace.options[]·chosen·audit가 후보·선택·실행 기록의 출처다. 각 후보의 id·plan·reach·residual·basis는 그 후보에 묶고 다른 후보의 값과 합치지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-ACTION-01"></a> `SCR-INCIDENT-ACTION-01` | 미선택 사건의 조치 구역을 연다 → incident.workspace.options의 후보 수와 title·change·reach·note·plan이 보인다 → 적용 전 완료 단계가 보이면 실패 | actSection은 options를 actionCompare로 만들고 chosen이 있으면 단계 전부를 done으로 그린다(`apps/wake/pages/incident-detail.js:108`). | 선택된 후보의 경로를 실행 결과와 무관하게 완료로 표시한다. | 고정 없음 → TASK-SCREEN-INCIDENT-ACTION | D00092; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENT-ACTION-V01"></a> `SCR-INCIDENT-ACTION-V01` | 메모리 증설·롤백 두 후보를 제공한다 → options[].plan.values 전후 값과 reach·note·plan 경로가 후보별로 보인다 → 변경값 또는 위험 설명이 옆 후보와 섞이면 실패 | 후보의 changeOf·reach·note·routeOf를 전달한다(`apps/wake/pages/incident-detail.js:111`). | 후보 모델에 검증·되돌림 조건을 나누는 표시가 없다. | `kit/components/action-compare.test.mjs` — `change, reach, note and route are a name and value list with the route joined by arrows; empty ones are left out` | D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENT-ACTION-A01"></a> `SCR-INCIDENT-ACTION-A01` | 후보를 골라 AI 칸을 열었다가 닫는다 → 같은 incident ID의 후보와 열린 구역을 유지한다(SCR-SHARED-01) → 다른 사건 후보나 초기화된 펼침이 보이면 실패 | wake.inc.choose가 후보 title을 승인 질문에 넣어 openPanel을 호출한다(`apps/wake/pages/incident-detail.js:204`). | 승인 질문에 번호·제목만 넣으며 후보 ID를 구조화해 넘기지 않는다. | 고정 없음 → TASK-SCREEN-INCIDENT-ACTION | D00094; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENT-ACTION-A02"></a> `SCR-INCIDENT-ACTION-A02` | 후보 하나를 승인하되 실제 적용은 하지 않는다 → options[].title이 선택 상태로만 보인다 → plan 단계가 모두 완료로 표시되면 실패 | chosen이 있으면 routeOf의 모든 stepRow가 done이다(`apps/wake/pages/incident-detail.js:113`). | 승인·선택과 실제 적용 결과를 분리하지 않는다. | 고정 없음 → TASK-SCREEN-INCIDENT-ACTION | D00092 |
| <a id="SCR-INCIDENT-ACTION-G01"></a> `SCR-INCIDENT-ACTION-G01` | 승인된 Git 변경으로 Draft PR 생성을 요청한다 → 실제 서버 생성 결과의 번호·URL·실행 기록을 표시한다 → 서버 조회만 하거나 가짜 PR 주소로 성공하면 실패 | decide는 PR 경로를 pending/github-unconnected로 기록한다(`apps/wake/desktop/approvals.cjs:42`). | 실제 PR 생성 호출 및 서버 반환 번호·URL 저장 경로가 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-ACTION | D-USR-2026-11-16-7 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-ACTION-REQ-R-052"></a> `SCR-INCIDENT-ACTION-REQ-R-052` | spec.syncPolicy.automated가 있는 Application 소유 리소스의 조치를 연다 → ownership의 plan.route=pr와 Git 변경 경로가 보인다 → kubectl 직접 변경을 제안하면 실패 | planFor가 소유 관계로 pr·helm·command 경로를 선택한다(`apps/wake/data/ownership.js:73`). | 없음(확인: apps/wake/data/ownership.js:73) | `apps/wake/data/ownership.test.mjs` — `planFor: an auto-synced Argo CD target gets a Draft PR, never a cluster command (N2)` | D-USR-2026-11-16-7 |
