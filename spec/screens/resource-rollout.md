# Deployment 상세 · 롤아웃

<a id="SCR-RESOURCE-ROLLOUT"></a> 진입: `wake://cluster/:cluster/ns/:ns/:kind/:name?tab=rollout`. 목적(SRE 판단): revision의 배포 진행과 변경을 판단한다.
구성: 상세 머리·탭 → revision·진행·변경·관련 ReplicaSet.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: revision·변경, 진행 상태; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-ROLLOUT-01"></a> `SCR-RESOURCE-ROLLOUT-01` | Deployment d에 revision 1·2 ReplicaSet을 주고 롤아웃을 연다 → annotations의 revision과 spec.template의 변경을 먼저, ReplicaSet 표를 아래에 표시한다 → 다른 Deployment의 revision이 섞이거나 변경 카드가 누락되면 실패 | rolloutTab은 relationships.items를 revision 내림차순으로 그린다 ([`apps/wake/pages/resource-detail.js:646`](../../apps/wake/pages/resource-detail.js#L646)) | 변경 카드 생성 조건이 이미지 문자열 차이뿐이다 | 고정 없음 → TASK-SCREEN-RESOURCE-ROLLOUT | D00082, D00450 |
| <a id="SCR-RESOURCE-ROLLOUT-V01"></a> `SCR-RESOURCE-ROLLOUT-V01` | 두 revision의 image는 같고 spec.template.spec.containers[0].env 값만 A에서 B로 바뀐다 → diff에 env의 A 제거와 B 추가가 보인다 → 빈 diff 또는 변경 없음이면 실패 | now.image와 prev.image가 다를 때만 codeBlock을 만든다 ([`apps/wake/pages/resource-detail.js:652`](../../apps/wake/pages/resource-detail.js#L652)) | env·resources·volumeMounts 등 템플릿 변경을 비교하지 않는다 | 고정 없음 → TASK-SCREEN-RESOURCE-ROLLOUT | D00450; D-USR-2026-11-16-7 |
| <a id="SCR-RESOURCE-ROLLOUT-V02"></a> `SCR-RESOURCE-ROLLOUT-V02` | generation=4, observedGeneration=3, availableReplicas=1, spec.replicas=3인 revision을 선택한다 → 진행 상태에서 관측 세대 3과 가용 1·목표 3을 구분하고 적용 완료로 표시하지 않는다 → 선택한 revision만으로 완료 배지가 뜨면 실패 | 롤아웃 표는 Revision·Name·Pods·Image·Created만 표시한다 ([`apps/wake/pages/resource-detail.js:654`](../../apps/wake/pages/resource-detail.js#L654)) | 세대 관측과 목표 복제본을 비교하는 진행 상태가 없다 | 고정 없음 → TASK-SCREEN-RESOURCE-ROLLOUT | D00082 |
| <a id="SCR-RESOURCE-ROLLOUT-A01"></a> `SCR-RESOURCE-ROLLOUT-A01` | revision 2를 고른 뒤 해당 ReplicaSet·Pod·Event를 열고 뒤로 간다 → 선택 revision과 원래 at 구간을 유지한 롤아웃으로 복귀한다 → revision 1 또는 현재 시각으로 바뀌면 실패 | ReplicaSet 이름 링크만 있고 revision 선택 컨트롤은 없다 ([`apps/wake/pages/resource-detail.js:655`](../../apps/wake/pages/resource-detail.js#L655)) | revision 선택과 그 선택에 연결된 Pod·Event 이동이 없다 | 고정 없음 → TASK-SCREEN-RESOURCE-ROLLOUT | D00082; D-USR-2026-11-16-7 |
| <a id="SCR-RESOURCE-ROLLOUT-A02"></a> `SCR-RESOURCE-ROLLOUT-A02` | Deployment의 되돌리기 제안을 승인·거절한다 → 승인 전에는 계획만 보이고 승인한 동일 계획만 실행 결과로 표시한다 → 거절 후 실행 또는 중복 실행이 보이면 실패 | decide는 첫 승인·거절 상태를 저장하고 재요청에는 replayed를 반환한다 ([`apps/wake/desktop/approvals.cjs:43`](../../apps/wake/desktop/approvals.cjs#L43)) | 승인 상태는 저장하지만 실제 rollback 실행 결과는 만들지 않으며 PR 경로도 pending 또는 github-unconnected에 머문다 | 고정 없음 → TASK-SCREEN-RESOURCE-ROLLOUT | D00466; D-USR-2026-11-16-7 |
| <a id="SCR-RESOURCE-ROLLOUT-G01"></a> `SCR-RESOURCE-ROLLOUT-G01` | env 변경 revision과 spec.template 전체가 동일한 revision을 각각 비교한다 → 전자는 필드 diff, 후자는 변경 없음으로 구별한다 → 두 입력에서 모두 카드가 없어지면 실패 | diff가 빈 문자열이면 d-roll 카드 전체를 생략한다 ([`apps/wake/pages/resource-detail.js:653`](../../apps/wake/pages/resource-detail.js#L653)) | 비이미지 변경과 실제 무변경이 같은 화면이 된다 | 고정 없음 → TASK-SCREEN-RESOURCE-ROLLOUT | D00450; D-USR-2026-11-16-7 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-ROLLOUT-LAB-P5"></a> `SCR-RESOURCE-ROLLOUT-LAB-P5` | 컨테이너 image 경로만 registry-a/x:v1에서 registry-b/x:v1로 바꾼다 → spec.template 원문 기준 diff에 전체 경로 변경을 표시한다 → x:v1이 같다는 이유로 변경이 숨으면 실패 | image를 slash로 나눈 마지막 조각으로 만든 뒤 비교한다 ([`apps/wake/pages/resource-detail.js:650`](../../apps/wake/pages/resource-detail.js#L650)) | 레지스트리·저장소 접두 변경도 누락된다 | 고정 없음 → TASK-SCREEN-RESOURCE-ROLLOUT | D00450; D-USR-2026-11-16-7 |
