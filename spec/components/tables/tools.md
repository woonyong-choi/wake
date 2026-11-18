# 도구 목록의 목록형 부품

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-LIST-TOOLS

- 목표: → [RULE-CHIPS](../../rules.md#RULE-CHIPS). 상태는 CMP-TABLE-02, 입력·접근성은 controls 계약을 따른다; 연결 행을 모두 지우거나 오류인 Prometheus를 연결됨으로 표시하면 실패.
- 현재: rows는 toolViews.included를 viewRow로 바꾸고 failure는 열거 거절과 재시도를 표시한다(`apps/wake/pages/tools.js:31`).
- 차이: 없음(확인: apps/wake/pages/tools.js:31–42).
- 고정 장치: 고정 없음 → TASK-CMP-LIST-TOOLS
- 출처: D00999; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 호출과 입력

| 위치 | 부품·읽기 |
|---|---|
| `apps/wake/pages/tools.js` | pageHeader.render @34, summaryBar.render @37, settingsGroup.render @38, connectionRow.render @38, emptyState.render @41, settingsSection.render @43, pageColumn.render @49 |
| 데이터 | `` [{"key": "sourceStates", "source": "data.get('sourceStates', { cluster: id })", "line": 24}, {"key": "toolKinds", "source": "data.get('toolKinds')", "line": 25}, {"key": "clusterTools", "source": "data.get('clusterTools', { cluster: id, discovery: {} })", "line": 26}] `` |
