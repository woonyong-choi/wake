# 에이전트 목록의 목록형 부품

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-LIST-AGENT

- 목표: agent 서비스에 설치됨·heartbeat 만료인 에이전트를 넣고 해당 행을 누른다 → 만료된 heartbeat를 오래됨 상태로 보이고 같은 cluster의 에이전트 상세를 연다(agent 서비스). 에이전트별 설치·등록·heartbeat·수집 상태와 다음 실제 행동을 구별하고 같은 agent ID 상세를 연다. 상태는 CMP-TABLE-02, 입력·접근성은 controls 계약을 따른다. → 만료된 heartbeat가 연결됨이거나 다른 cluster의 상세가 열리면 실패.
- 현재: connectionRow는 agentFacts의 state와 statusLabel을 표시한다(`apps/wake/pages/agent.js:30`).
- 차이: 행의 표시 분기는 있으나 설치 정보 읽기 실패와 heartbeat 수집 실패를 구분하는 원인 필드가 없다.
- 고정 장치: 고정 없음 → TASK-CMP-LIST-AGENT
- 출처: D00999; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 호출과 입력

| 위치 | 부품·읽기 |
|---|---|
| `apps/wake/pages/agent.js` | pageHeader.render @24, connectionRow.render @30, settingsSection.render @32, settingsGroup.render @32, pageColumn.render @37 |
| 데이터 | `` [{"key": "agent", "source": "data.get('agent', { cluster: id })", "line": 19}] `` |
