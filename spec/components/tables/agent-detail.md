# 에이전트 상세 RBAC

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-T-AGENT-DETAIL-01

- 목표: agent.rules에 pods/get/list와 nodes/get 규칙을 넣고 에이전트 상세의 RBAC를 편다 → RBAC에 pods/get/list와 nodes/get을 각각 한 행으로 보이고, heartbeat 실패는 연결 실패로 표시한다(agent.rules, agentBeats). 에이전트의 실제 verb/resource/scope 권한을 대조한다. 기본 정렬: resource, scope, verbs 오름차순; 동점: 원본의 불변 ID 오름차순(리소스는 namespace/kind/name/UID, RBAC는 resource/scope/verbs). 문제 우선: 누락 권한은 별도 연결 상태; 규칙 자체를 실패로 색칠하지 않음. 행 이동: 이동 없음; 읽기 전용 RBAC. 검색·거르기: 표 자체 검색 없음; 상위 에이전트 대상에 종속. → RBAC 행의 resource·scope·verbs가 agent.rules와 다르거나 heartbeat 조회 실패가 미설치로 표시되면 실패.
- 현재: load는 agentBeats 오류를 null로 바꾸고 agentFacts(agent).missing으로 화면 상태를 정한다(`apps/wake/pages/agent-detail.js:18`).
- 차이: heartbeat 조회 오류를 null로 지워 미설치와 조회 실패를 별도로 표시할 수 없다.
- 고정 장치: 고정 없음 → TASK-CMP-T-AGENT-DETAIL
- 출처: D00999; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 열 목표와 현재 차이

각 식의 row는 위 읽기/계산 결과다. 열 종류는 의미 기준의 목표이며 기존 별칭은 현재다. 열 선택 정렬의 동점·결손 위치는 D-USR-2026-11-16-2를 따른다.

| 규칙 ID | 열 이름·현재 위치 | 종류 | 원본 필드·표시식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-t-agent-detail-c001"></a>CMP-T-AGENT-DETAIL-C001 | 리소스 / t('wake.agent.resource'); `apps/wake/pages/agent-detail.js:42` | mono | `` row['resource'] `` | 원문↑ | 보조: muted | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 남은 폭 `` | 에이전트 상세 RBAC 행의 resource를 pods로 넣는다 → 리소스 칸에 pods를 표시한다(resource); 표시: 원본 공급자/수신처 이름·중립 보조 톤 →리소스가 다른 필드 값이거나 pods가 잘못 바뀌면 실패. 읽기 성공만으로 수신 또는 발송 성공색을 붙이지 않음. | `` row['resource'] `` 적용(apps/wake/pages/agent-detail.js:42) | 없음(확인: apps/wake/pages/agent-detail.js:42) | 고정 없음 → TASK-CMP-T-AGENT-DETAIL | D-USR-2026-11-16-7; D00447 |
| <a id="cmp-t-agent-detail-c002"></a>CMP-T-AGENT-DETAIL-C002 | 'verbs'; `apps/wake/pages/agent-detail.js:42` | text | `` row['verbs'] `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 'calc(var(--space-16) * 2.6)' `` | 에이전트 상세 RBAC 행의 verbs를 get, list로 넣는다 → verbs 칸에 get, list를 표시한다(verbs); 표시: 허용 동사 원문 목록·중립 고정폭; 쉼표로 구분 →verbs가 다른 필드 값이거나 get, list가 잘못 바뀌면 실패. get/list만으로 watch나 쓰기 허용을 추정하지 않음. | `` row['verbs'] `` 적용(apps/wake/pages/agent-detail.js:42) | 없음(확인: apps/wake/pages/agent-detail.js:42) | 고정 없음 → TASK-CMP-T-AGENT-DETAIL | D-USR-2026-11-16-7; D00447 |
| <a id="cmp-t-agent-detail-c003"></a>CMP-T-AGENT-DETAIL-C003 | 범위 / t('wake.agent.scope'); `apps/wake/pages/agent-detail.js:42` | text | `` row['scope']; muted=true `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `'calc(var(--space-16) * 2.6)'`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 에이전트 상세 RBAC 행의 scope를 default로 넣는다 → 범위 칸에 default를 표시한다(scope); 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →범위가 다른 필드 값이거나 default가 잘못 바뀌면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` row['scope']; muted=true `` 적용(apps/wake/pages/agent-detail.js:42) | 없음(확인: apps/wake/pages/agent-detail.js:42) | 고정 없음 → TASK-CMP-T-AGENT-DETAIL | D-USR-2026-11-16-7; D00447 |
