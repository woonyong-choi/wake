# 에이전트 상세

<a id="SCR-AGENT-DETAIL"></a> 진입: `wake://cluster/:cluster/agent/:name`. 목적(SRE 판단): heartbeat·감시 범위·권한·DaemonSet으로 수집 공백을 찾는다.
구성: 상태·버전·watch·image·cache·이벤트율·Ready 요약 → heartbeat 지연 → RBAC·감시 범위 → DaemonSet.
현재: [apps/wake/pages/agent-detail.js](../../apps/wake/pages/agent-detail.js); [apps/wake/data/index.js](../../apps/wake/data/index.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 수집 상태, 지연 시리즈, 권한·대상; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-AGENT-DETAIL-01](../components/tables/agent-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-AGENT-DETAIL-01](../components/tables/agent-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.
고정 장치: `apps/wake/desktop/services-agent.test.cjs`; `apps/wake/desktop/agent-heartbeat.test.cjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AGENT-DETAIL-01"></a> `SCR-AGENT-DETAIL-01` | 설치된 wake-agent 상세를 연다 → agentFacts의 상태·버전·watch·imageRef·heartbeat.eventsPerSec·Ready 요약, agentBeats 지연, RBAC·watch 범위, DaemonSet 순서로 보인다 → DaemonSet이 RBAC보다 앞서거나 다른 에이전트 값이면 실패 | summary·chart·DaemonSet·RBAC·watch 순서로 조립한다; `apps/wake/pages/agent-detail.js:44` | DaemonSet이 RBAC와 watch 앞에 있다 | 고정 없음 → TASK-SCREEN-AGENT-DETAIL | D-USR-2026-11-16-7 |
| <a id="SCR-AGENT-DETAIL-V01"></a> `SCR-AGENT-DETAIL-V01` | DaemonSet Ready이고 heartbeat가 오래되었지만 watch 종류가 남은 응답을 연다 → rollout.counters·heartbeat.at·watch의 각 관측 상태를 구분한다 → Ready만으로 heartbeat/watch도 정상 표시하면 실패 | heartbeat 시각과 watch.length는 별도 값이지만 watch 상태·관측시각은 표시하지 않는다; `apps/wake/pages/agent-detail.js:30` | watch는 종류 수로만 표시되어 heartbeat와 다른 관측시각·상태를 확인할 수 없다 | 고정 없음 → TASK-SCREEN-AGENT-DETAIL | D00021, D00024 |
| <a id="SCR-AGENT-DETAIL-V02"></a> `SCR-AGENT-DETAIL-V02` | agentBeats.samples=[]로 상세를 연다 → 지연 표본이 없는 상태이며 임의 선·점·0ms가 없다 → 표본 없이 지연 그래프를 그리면 실패 | samples.length가 0이면 지연 카드 전체를 생략한다; `apps/wake/pages/agent-detail.js:38` | 임의 선·점은 만들지 않지만 공통 SCR-CHART-EMPTY의 빈 차트 틀도 사라진다 | 고정 없음 → TASK-SCREEN-AGENT-DETAIL | D00451 |
| <a id="SCR-AGENT-DETAIL-V03"></a> `SCR-AGENT-DETAIL-V03` | rules와 watch가 있는 agent.status 응답을 연다 → RBAC 표에 resource·verbs·scope, watch에 실제 종류가 보이며 Secret 조회는 0회다 → 임의 권한을 보이거나 Secret을 읽으면 실패 | Lease·Node와 연결된 RBAC 역할만 조회해 rules와 watch를 만들며 Secret 요청은 없다; `apps/wake/desktop/agent-heartbeat.cjs:56` | 없음(확인: `apps/wake/desktop/agent-heartbeat.cjs:56`) | 고정 없음 → TASK-SCREEN-AGENT-DETAIL | D-01, D00024 |
| <a id="SCR-AGENT-DETAIL-A01"></a> `SCR-AGENT-DETAIL-A01` | agent.identity.uid=u1인 DaemonSet 링크를 누른다 → 같은 cluster·namespace·name·uid=u1의 정본 상세로 이동한다 → 같은 이름 u2를 원래 대상으로 열면 실패 | DaemonSet 링크에 namespace/name만 넣고 uid는 넣지 않는다; `apps/wake/pages/agent-detail.js:40` | 재생성된 동일 이름의 DaemonSet을 u1과 구별할 수 없다 | 고정 없음 → TASK-SCREEN-AGENT-DETAIL | D00094; UID 보존 세부는 D-USR-2026-11-16-7 |
| <a id="SCR-AGENT-DETAIL-A02"></a> `SCR-AGENT-DETAIL-A02` | 실패 응답 뒤 다시 시도를 누른다 → 설치 실패 원문과 재시도는 연결 행의 단계로 제공한다 → 재시도 요청이 실제 출처에 도달하지 않거나 이전 오류를 정상으로 숨기면 실패 | wake.ag.retry는 load를 다시 호출한다; `apps/wake/pages/agent-detail.js:53` | 설치 단계와 설치 오류 원문이 없으며 agent/agentBeats 조회만 재시도한다 | 고정 없음 → TASK-SCREEN-AGENT-DETAIL | D00021, D00024 |
| <a id="SCR-AGENT-DETAIL-G01"></a> `SCR-AGENT-DETAIL-G01` | 두 에이전트 중 하나의 heartbeat 조회만 실패시킨다 → 실패한 대상에 읽기 실패를 표시하고 다른 대상의 마지막 관측을 유지한다 → 전체를 정상 또는 빈 목록으로 바꾸면 실패 | agentBeats 조회 실패를 catch에서 null로 바꾼다; `apps/wake/pages/agent-detail.js:18` | heartbeat 시리즈 조회 실패가 표시되지 않고 지연 카드가 사라진다 | 고정 없음 → TASK-SCREEN-AGENT-DETAIL | D00021, D00024 |
