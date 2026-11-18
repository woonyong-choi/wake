# 인시던트 · 시간순 변화

<a id="SCR-INCIDENT-TIMELINE"></a> 진입: `wake://cluster/:cluster/incidents/:id (동일 작업면의 time 구역)`. 목적(SRE 판단): 증상 전후에 무엇이 바뀌었는지 확인한다.
구성: 작업면 공통 머리 → 시간순 변화 summaryBar → 해당 근거/표/계획.
현재: [apps/wake/pages/incident-detail.js](../../apps/wake/pages/incident-detail.js); [apps/wake/data/incident-model.js](../../apps/wake/data/incident-model.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 시간순 변화 판단 값; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-INC-01](../components/incident-criteria.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: incident.workspace.timeline의 at·lane·kind·title·text와 evidence 참조를 사용한다. deploy/config/symptom 레인은 변경과 증상을 구분하며 시각 근접만으로 인과를 만들지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-TIMELINE-01"></a> `SCR-INCIDENT-TIMELINE-01` | 배포·설정·증상 기록이 있는 시간 구역을 연다 → workspace.timeline[].at를 같은 시간축에 lane별로 표시한다 → 관측 시각을 수집 시각으로 바꾸거나 사건 구간 밖 표식을 넣으면 실패 | timeSection은 at를 초로 바꾸고 표시가 있는 LANES만 그린다(`apps/wake/pages/incident-detail.js:89`). | 없음(확인: apps/wake/pages/incident-detail.js:89) | 고정 없음 → TASK-SCREEN-INCIDENT-TIMELINE | D00092 |
| <a id="SCR-INCIDENT-TIMELINE-V01"></a> `SCR-INCIDENT-TIMELINE-V01` | 10:01 증상과 10:00 배포를 역순으로 공급한다 → timeline.at 순으로 10:00 배포와 10:01 증상이 보인다 → 배열 순서로 시각을 뒤집으면 실패 | workspace가 marks를 at 오름차순으로 정렬한다(`apps/wake/desktop/incident-hub.cjs:249`). | 없음(확인: apps/wake/desktop/incident-hub.cjs:249) | 고정 없음 → TASK-SCREEN-INCIDENT-TIMELINE | D00092 |
| <a id="SCR-INCIDENT-TIMELINE-A01"></a> `SCR-INCIDENT-TIMELINE-A01` | 타임라인 배포 표식을 선택하고 닫는다 → 같은 revision·시각의 변경 근거와 원래 시간 범위를 유지한다(SCR-SHARED-01) → 다른 revision이 열리거나 기간이 초기화되면 실패 | changeTimeline에 tip은 있지만 표식별 이동 action은 전달하지 않는다(`apps/wake/pages/incident-detail.js:99`). | 표식에서 revision 근거 상세를 여는 동작이 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-TIMELINE | D00094 |
| <a id="SCR-INCIDENT-TIMELINE-A02"></a> `SCR-INCIDENT-TIMELINE-A02` | 배포 1분 뒤 장애 관측을 넣는다 → 배포와 증상은 별도 lane에 놓이고 chain 검증 근거가 없으면 원인 확정 표시는 없다 → 시간 근접만으로 원인 확정이면 실패 | LANES는 deploy/symptom을 나누며 chain은 다른 구역에서 표시한다(`apps/wake/pages/incident-detail.js:19`, `apps/wake/pages/incident-detail.js:101`). | workspace의 원인 등급은 observe 존재만으로 inferred가 될 수 있다. | 고정 없음 → TASK-SCREEN-INCIDENT-TIMELINE | D00092; D00742 |
| <a id="SCR-INCIDENT-TIMELINE-G01"></a> `SCR-INCIDENT-TIMELINE-G01` | 이미지는 그대로 두고 설정만 바꿔 rollout한다 → 해당 revision의 설정 diff와 시각을 타임라인에서 연다 → 빈 diff를 변경 없음으로 표시하면 실패 | ConfigMap 표식은 resourceVersion, ReplicaSet 표식은 revision만 담는다(`apps/wake/desktop/incident-hub.cjs:245`). | 설정 전후 스냅샷과 diff 링크가 타임라인 모델에 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-TIMELINE | D00453 |
