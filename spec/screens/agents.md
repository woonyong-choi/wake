# 에이전트 목록

<a id="SCR-AGENTS"></a> 진입: `wake://cluster/:cluster/agent`. 목적(SRE 판단): 설치·등록·수집 상태를 구분한다.
구성: 머리 → 에이전트 요약 → connectionRow.
현재: [apps/wake/pages/agent.js](../../apps/wake/pages/agent.js); [apps/wake/data/index.js](../../apps/wake/data/index.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 설치·상태, 버전·namespace·heartbeat·지연·무응답·노드; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-AGENT](../components/tables/agent.md). 화면의 대상/복귀 계약을 함께 적용한다.
고정 장치: `apps/wake/desktop/services-agent.test.cjs`; `apps/wake/desktop/agent-heartbeat.test.cjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AGENTS-01"></a> `SCR-AGENTS-01` | agent.status 응답이 있는 클러스터의 에이전트 목록을 연다 → agentFacts의 머리와 에이전트 connectionRow가 보인다 → 다른 클러스터 에이전트 또는 행 누락이면 실패 | body는 head·검색 결과·에이전트 설정 구역의 row를 반환한다; `apps/wake/pages/agent.js:32` | 없음(확인: `apps/wake/pages/agent.js:32`) | 고정 없음 → TASK-SCREEN-AGENTS | D00021 |
| <a id="SCR-AGENTS-V01"></a> `SCR-AGENTS-V01` | lookup=absent와 heartbeat 읽기 오류를 각각 반환한다 → absent는 미설치, 오류는 수집 실패로 표시한다 → 두 응답 모두 미설치로 표시하면 실패 | missing은 lookup=absent 또는 installed=false일 때만 true다; `apps/wake/pages/setup-parts.js:65` | 없음(확인: `apps/wake/pages/setup-parts.js:65`) | 고정 없음 → TASK-SCREEN-AGENTS | D00021, D00024 |
| <a id="SCR-AGENTS-V02"></a> `SCR-AGENTS-V02` | numberReady=2, desiredNumberScheduled=3과 heartbeat.at을 반환한다 → Ready 2 · Desired 3과 버전·namespace·수집시각·무응답 노드를 agentFacts 필드대로 표시한다 → 2/3 분수나 추정 시각을 쓰면 실패 | agentFacts의 namespace·heartbeat.at·Ready/Desired·latencyMs·silent를 행 설명으로 조합한다; `apps/wake/pages/agent.js:27` | 없음(확인: `apps/wake/pages/agent.js:27`) | 고정 없음 → TASK-SCREEN-AGENTS | D00021; 표시 필드는 D-USR-2026-11-16-7 |
| <a id="SCR-AGENTS-A01"></a> `SCR-AGENTS-A01` | 미설치 클러스터 A의 설치 버튼과 설치된 B의 에이전트 행을 각각 누른 뒤 돌아온다 → wake.agent.install은 A, wake.agent.open은 B 상세를 열고 기존 q·선택을 유지한다 → 다른 cluster로 이동하거나 복귀 시 q를 지우면 실패 | 미설치는 설치 action, 설치된 행은 상세 action을 받고 screen.state에 q를 둔다; `apps/wake/pages/agent.js:28` | onDetail에서 별도 선택 행을 보존하는 처리가 없으므로 q 외 선택 복귀는 구현되어 있지 않다 | 고정 없음 → TASK-SCREEN-AGENTS | D00021 |
| <a id="SCR-AGENTS-A02"></a> `SCR-AGENTS-A02` | lookup=present·rolloutReady=true지만 beatLookup·nodes·heartbeat가 모두 없는 응답을 준다 → 수집 확인 전 연결 정상으로 표시하지 않는다 → DaemonSet Ready만으로 정상 아이콘이면 실패 | beatLookup과 nodes가 없고 rolloutReady가 true이면 ok를 반환한다; `apps/wake/data/home.js:115` | heartbeat 관측이 없어도 정상 상태가 된다 | 고정 없음 → TASK-SCREEN-AGENTS | D00021, D00024 |
| <a id="SCR-AGENTS-G01"></a> `SCR-AGENTS-G01` | 전용 lab에서 에이전트 설치·등록 뒤 heartbeat를 수신한다 → 설치·등록·수집을 각각 실제 결과와 시각으로 표시한다 → 설치 명령 완료만으로 수집 정상 표시 시 실패 | connectionRow는 agentFacts의 상태 한 개를 kind/statusLabel로 사용한다; `apps/wake/pages/agent.js:30` | 실제 설치·등록·수집 결과별 시각을 표시하는 열이 없다 | 고정 없음 → TASK-SCREEN-AGENTS | D00974 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AGENT-READY"></a> `SCR-AGENT-READY` | DaemonSet Ready지만 heartbeat가 없는 응답을 읽는다 → 설치 상태와 heartbeat 없음이 따로 보이며 수집 정상은 표시하지 않는다 → Ready를 수집 완료로 표시하면 실패 | rollout 카운터와 heartbeat를 별도로 반환한다; `apps/wake/pages/setup-parts.js:64` | agentFacts에는 등록 결과와 등록 시각 필드가 없다 | 고정 없음 → TASK-SCREEN-AGENTS | D00021, D00974 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AGENTS-REQ-R-006"></a> `SCR-AGENTS-REQ-R-006` | wake-lab에서 설치된 agent.status와 heartbeat를 읽는다 → 실제 imageRef·namespace·Ready·heartbeat.at이 에이전트 화면에 보인다 → 합성 데이터나 DaemonSet 상태만으로 전체 수집 합격을 기록하면 실패 | load는 data.get('agent')를 호출한다; `apps/wake/pages/agent.js:17` | 목록 자체는 설치 및 수집 검수 결과를 기록하지 않는다 | 고정 없음 → TASK-SCREEN-AGENTS | D00973, D00974, D00975 |
| <a id="SCR-AGENTS-REQ-R-056"></a> `SCR-AGENTS-REQ-R-056` | watch·rules·imageRef·heartbeat가 포함된 agent 응답의 상세를 연다 → agentFacts의 버전·watch·RBAC·지연·캐시가 해당 카드에 보인다 → 설치 여부만 보여 수집 범위를 알 수 없으면 실패 | 상세 summary와 RBAC·watched 카드가 agentFacts를 소비한다; `apps/wake/pages/agent-detail.js:30` | 목록에는 watch/cache와 RBAC가 없으므로 상세 진입이 필요하다 | 고정 없음 → TASK-SCREEN-AGENTS | D00021; 세부 필드는 D-USR-2026-11-16-7 |
| <a id="SCR-AGENTS-REQ-R-057"></a> `SCR-AGENTS-REQ-R-057` | 에이전트 배포 설정과 RBAC를 연다 → imageRef는 digest를 포함하고 rules에는 읽기 및 자기 heartbeat 쓰기만 보인다 → 광범위 쓰기 권한이나 가변 tag만 있으면 실패 | imageRef를 Image로 표시하고 rules를 그대로 표에 준다; `apps/wake/pages/agent-detail.js:36` | 화면에는 digest 고정이나 자기 heartbeat 이외 쓰기 권한을 판정하는 검사가 없다 | 고정 없음 → TASK-SCREEN-AGENTS | D-USR-2026-11-16-7 |
