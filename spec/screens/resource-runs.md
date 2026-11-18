# CronJob 상세 · 실행

<a id="SCR-RESOURCE-RUNS"></a> 진입: `wake://cluster/:cluster/ns/:ns/:kind/:name?tab=runs`. 목적(SRE 판단): 예약 실행의 시작·완료와 실패 Job을 찾는다.
구성: 상세 머리·탭 → 스케줄·실행 요약 → Job 실행 목록.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 예약·시간대·실행, 실행 Job; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-RUNS-01"></a> `SCR-RESOURCE-RUNS-01` | CronJob c의 spec.schedule과 소유 Job 2개를 읽고 실행 기록을 연다 → Schedule 아래 해당 controller UID의 Job 두 행과 status를 표시한다 → 다른 CronJob의 Job이 포함되면 실패 | runsTab은 inspector.rows와 r.schedule로 실행 카드를 그린다 ([`apps/wake/pages/resource-detail.js:659`](../../apps/wake/pages/resource-detail.js#L659)) | 없음(확인: apps/wake/pages/resource-detail.js:659) | 고정 없음 → TASK-SCREEN-RESOURCE-RUNS | D00491, D00084 |
| <a id="SCR-RESOURCE-RUNS-V01"></a> `SCR-RESOURCE-RUNS-V01` | spec.schedule='0 * * * *', timeZone=Asia/Seoul이고 lastScheduleTime·lastSuccessfulTime이 없다 → 예약·시간대와 실행 기록 없음이 보이며 실패로 칠하지 않는다 → 시각을 0으로 만들거나 실패로 표시하면 실패 | 실행 머리에 Schedule과 Concurrency Policy만 넣는다 ([`apps/wake/pages/resource-detail.js:663`](../../apps/wake/pages/resource-detail.js#L663)) | 실행 기록 탭에 Time Zone과 마지막 예약·성공 시각이 없다 | 고정 없음 → TASK-SCREEN-RESOURCE-RUNS | D00491; D-USR-2026-11-16-7 |
| <a id="SCR-RESOURCE-RUNS-V02"></a> `SCR-RESOURCE-RUNS-V02` | 같은 이름 job-a에 UID u1·u2인 두 이력 행을 준다 → 각 UID를 별도 실행으로 구분하고 링크에도 UID를 전달한다 → 한 행으로 합치거나 다른 실행이 열리면 실패 | Job 링크는 uid를 전달하지만 dataTable.rowKey는 name이다 ([`apps/wake/pages/resource-detail.js:664`](../../apps/wake/pages/resource-detail.js#L664)) | 동일 이름 재생성 실행의 행 키가 충돌한다 | 고정 없음 → TASK-SCREEN-RESOURCE-RUNS | D00084; D-USR-2026-11-16-7 |
| <a id="SCR-RESOURCE-RUNS-A01"></a> `SCR-RESOURCE-RUNS-A01` | 실패 Job 링크에서 Pod와 이전 로그를 열고 뒤로 돌아온다 → Job ownerReferences와 Pod UID·container가 같은 시도의 로그를 열고 CronJob 실행 기록으로 복귀한다 → 다른 시도 로그 또는 다른 CronJob이면 실패 | Job 링크는 openOf에 name·uid를 전달한다 ([`apps/wake/pages/resource-detail.js:665`](../../apps/wake/pages/resource-detail.js#L665)) | Job 진입은 UID를 고정하지만 원래 runs 탭 복귀 선택은 주소에 저장하지 않는다 | 고정 없음 → TASK-SCREEN-RESOURCE-RUNS | D00084, D00081 |
| <a id="SCR-RESOURCE-RUNS-G01"></a> `SCR-RESOURCE-RUNS-G01` | → [RULE-RECOVERY](../rules.md#RULE-RECOVERY). | 조회 인덱스는 Pod·ReplicaSet·Job·Deployment·StatefulSet·DaemonSet·Node만 담고 ready는 인덱스에서 소유자를 찾는다 ([`apps/wake/desktop/incident-hub.cjs:58`](../../apps/wake/desktop/incident-hub.cjs#L58)) | CronJob을 인덱스에 넣지 않아 ready가 null을 반환하며 이후 Job의 Complete로 복구 관측을 갱신하지 못한다 | 고정 없음 → TASK-SCREEN-RESOURCE-RUNS | D00491; D-USR-2026-11-16-3 |
