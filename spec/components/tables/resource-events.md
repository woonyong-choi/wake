# Event 목록 표

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-K-EVENTS-01

- 목표: 같은 Event UID와 Reason의 반복을 포함한 events 서비스를 읽는다 → CMP-T-EVENTS-VIEW-01의 목록·Reason 묶음·타임라인 검색·정렬을 사용한다. 별도 표를 만들지 않는다. → 독립된 두 번째 Event 표를 만들거나 전체 목록이 50행 기준을 따르지 않으면 실패.
- 현재: events 화면은 `eventsView`로 위임한다(`apps/wake/pages/resource-list.js:160`); 이벤트 기준 시각은 `apps/wake/data/kinds.js:177–181`에서 계산한다.
- 차이: 전체 Event 페이지 크기가 30이며 목표 50과 다르다. 목록과 Reason 집계의 계약은 CMP-T-EVENTS-VIEW-01을 따른다.
- 고정 장치: 고정 없음 → TASK-CMP-K-EVENTS
- 출처: D00087 D00090; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 계산의 지역 변수

- `` const firstAt = e.firstTimestamp \|\| e.eventTime \|\| e.metadata?.creationTimestamp; ``
- `` const at = e.series?.lastObservedTime \|\| e.lastTimestamp \|\| firstAt; ``
- `` const o = e.involvedObject \|\| e.regarding \|\| {}; ``

열은 [이벤트 표](events-view.md#cmp-t-events-view-01)에 한 번만 정의한다.

### 상세로 전달하는 현재 필드

| 필드 | 현재 계산식 |
|---|---|
| status | `` e.type === 'Warning' ? st('warn', 'Warning') : st('neutral', 'Normal') `` |
| type | `` e.type \|\| 'Normal' `` |
| reason | `` e.reason \|\| '' `` |
| message | `` e.message \|\| e.note \|\| '' `` |
| count | `` [e.series?.count, e.count].find(n => Number.isFinite(n)) `` |
| object | `` { kind: o.kind \|\| '', name: o.name \|\| '', ns: o.namespace \|\| '', uid: o.uid, apiVersion: o.apiVersion, fieldPath: o.fieldPath } `` |
| source | `` e.reportingController \|\| e.reportingComponent \|\| e.source?.component \|\| '' `` |
| firstAt | `` firstAt `` |
| last | `` age(at, now) `` |
| at | `` at `` |
| atState | `` timestampState(at, now) `` |
