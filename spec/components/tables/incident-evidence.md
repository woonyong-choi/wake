# 근거 상세의 목록형 부품

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-LIST-INCIDENT-EVIDENCE

- 목표: incident.evidence에 n=3인 로그 스냅샷과 현재 끊긴 source를 넣고 근거 3을 연다 → 근거 3의 n·window·source·query를 유지하고 끊기기 전 자료로 표시한다(incident.evidence). 근거 스냅숏의 대상·절대 구간·출처·질의·실제 수집 결과를 보존한다. 상태는 CMP-TABLE-02, 입력·접근성은 controls 계약을 따른다. → 로그 원문 줄 번호가 재번호화되거나 재조회한 최신 값으로 과거 근거를 바꾸면 실패.
- 현재: body는 e.result.lines의 n·at·level·text를 logView에 전달한다(`apps/wake/pages/incident-evidence.js:27`).
- 차이: 없음(확인: apps/wake/pages/incident-evidence.js:21,27–35,47–60).
- 고정 장치: 고정 없음 → TASK-CMP-LIST-INCIDENT-EVIDENCE
- 출처: D00093 D00465; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 호출과 입력

| 위치 | 부품·읽기 |
|---|---|
| `apps/wake/pages/incident-evidence.js` | logView.render @28, chartCard.render @31, codeBlock.render @35, pageColumn.render @38, statusIcon.render @44, emptyState.render @46, pageHeader.render @50, staleLine.render @52, summaryBar.render @53, queryLine.render @59 |
| 데이터 | `` [{"key": "incident", "source": "data.get('incident', { cluster: params.cluster, id: params.id })", "line": 18}] `` |
