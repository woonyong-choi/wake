# AI 작업 기록 상세의 목록형 부품

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-LIST-AILOG-DETAIL

- 목표: audit.rows에 id=a1, requester=kim, target=Pod/web, result=denied인 기록을 넣고 a1을 연다 → 요청자 kim, 대상 Pod/web, 거부 결과를 a1의 원문대로 표시한다(audit.rows). 기록의 요청자·대상·행동·결과와 원문을 같은 기록 ID로 대조한다. 상태는 CMP-TABLE-02, 입력·접근성은 controls 계약을 따른다. → 요청자·대상·거부 결과가 다른 기록에서 섞이거나 없는 모델을 채워 표시하면 실패.
- 현재: load는 audit.rows에서 params.id와 같은 기록만 선택한다(`apps/wake/pages/ailog-detail.js:15`).
- 차이: 없음(확인: apps/wake/pages/ailog-detail.js:15,25–39).
- 고정 장치: 고정 없음 → TASK-CMP-LIST-AILOG-DETAIL
- 출처: D00466; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 호출과 입력

| 위치 | 부품·읽기 |
|---|---|
| `apps/wake/pages/ailog-detail.js` | pageHeader.render @21, pageHeader.render @22, value.render @33, summaryBar.render @38, propertyGrid.render @39, emptyState.render @41, emptyState.render @42, pageColumn.render @45, pageColumn.render @45 |
| 데이터 | `` [{"key": "audit", "source": "data.get('audit', { cluster: id })", "line": 15}] `` |
