# 로그 목록의 목록형 부품

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-LIST-LOGS

- 목표: Pod UID=u1, container=web의 이전 로그를 1시간 범위와 error 검색 조건으로 요청한다 → logs 요청과 화면 선택의 uid=u1·container=web·previous·window가 일치하고 원문 줄 번호를 유지한다. 원문 줄 번호와 선택 구간을 보존하고 수준·검색·현재/이전 컨테이너 조건을 실제 요청과 맞춘다. 상태는 CMP-TABLE-02, 입력·접근성은 controls 계약을 따른다. → 요청 previous·uid·window가 선택 조건과 다르거나 필터 뒤 원문 줄 번호를 바꾸면 실패.
- 현재: logs 요청은 previous·uid·window·source와 Loki search를 전달한다(`apps/wake/pages/logs.js:42`).
- 차이: 없음(확인: apps/wake/pages/logs.js:42–50).
- 고정 장치: 고정 없음 → TASK-CMP-LIST-LOGS
- 출처: D00095 D00452 D00806; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 호출과 입력

| 위치 | 부품·읽기 |
|---|---|
| `apps/wake/pages/logs.js` | timeRange.render @57, pageHeader.render @61, emptyState.render @62, select.render @64, pageColumn.render @74, select.menuDef @80 |
| 데이터 | `` [{"key": "resources", "source": "data.get('resources', { cluster: id, ns: '_all', kind: 'pods', at: ctx.query.at })", "line": 28}, {"key": "logLevels", "source": "data.get('logLevels', { cluster: id, ns: p.ns, pod: p.name, container, from, to: Math.min(to, Date.now()) })", "line": 38}, {"key": "logs", "source": "data.get('logs', { cluster: id, ns: p.ns, pod: p.name, container, previous: prevOf(p), uid, tail: s.source === 'loki' ? 100 : LOG_ROW_LIMIT, window: { fromMs: from, toMs: Math.min(to, Date.now()) }, source: s.source, ...(s.source === 'loki' ? { search: s.search } : {}) }, { signal: controller.signal })", "line": 42}] `` |
