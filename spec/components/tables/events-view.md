# 이벤트 목록과 Reason 묶음

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-T-EVENTS-VIEW-01

- 목표: → [RULE-SORT](../../rules.md#RULE-SORT). 반복 경고의 사유·대상·발생 구간을 추적한다;  문제 우선: 개별 이벤트는 시간순, Reason 집계만 Warning 우선. 행 이동: 이벤트 상세 또는 Reason 필터를 건 목록. 검색·거르기: type·reason·message·kind/name 전체 경로·source·namespace; 타임라인 동일 검색 조건; 개별 이력에서 심각도를 시간보다 우선하거나 Reason 동점 순서가 불변 키와 다르면 실패.
- 현재: Reason 집계는 Warning 여부와 count 내림만 비교한다(`apps/wake/pages/events-view.js:76`).
- 차이: Reason 동률 키가 없고 전체 이벤트의 현재 페이지 크기는 목표 50행과 다르다.
- 고정 장치: 고정 없음 → TASK-CMP-T-EVENTS-VIEW
- 출처: D00090 D00091; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 행 계산

| 식 | 현재 계산 |
|---|---|
| PER @13 | `` 30 `` |
| eventColumns @22 | `` now => [ { id: 'last', label: 'Last Seen', time: true, width: W.at, cell: e => when(e.last, now) }, { id: 'type', label: 'Type', width: W.type, fit: true, cell: e => typeCell(e.type) }, { id: 'reason', label: 'Reason', width: W.reason, fit: true }, { id: 'obj', label: 'Object', optional: true, width: W.obj }, { id: 'count', label: 'Count', kind: 'number', optional: true, width: W.n, cell: e => num(e.count) }, { id: 'first', label: 'First Seen', time: true, optional: true, width: W.first, cell: e => when(e.first, now) }, { id: 'source', label: 'Source', muted: true, optional: true, width: W.src }, { id: 'message', label: 'Message', muted: true }] `` |
| all @53 | `` wait ? [] : eventSummary(deps.rows().map(eventObjectOf), { from, to }).rows `` |
| rows @55 | `` base.filter(e => s.evType === 'all' \|\| e.type === s.evType) `` |
| list @76 | `` [...g.values()].sort((a, b) => (b.type === 'Warning') - (a.type === 'Warning') \|\| b.count - a.count).map(x => ({ ...x, objs: x.objs.size })) `` |
| pages @81 | `` Math.max(1, Math.ceil(rows.length / PER)) `` |
| page @81 | `` Math.min(s.evPage, pages) `` |

### 열 목표와 현재 차이

각 식의 row는 위 읽기/계산 결과다. 열 종류는 의미 기준의 목표이며 기존 별칭은 현재다. 열 선택 정렬의 동점·결손 위치는 D-USR-2026-11-16-2를 따른다.

| 규칙 ID | 열 이름·현재 위치 | 종류 | 원본 필드·표시식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-t-events-view-c001"></a>CMP-T-EVENTS-VIEW-C001 | 'Last Seen'; `apps/wake/pages/events-view.js:23` | time | `` e => when(e.last, now) `` | 시각↓ | 시간: muted | → [RULE-TIME](../../rules.md#RULE-TIME) | 유지; `` W.at `` | → [RULE-TIME](../../rules.md#RULE-TIME) | `` e => when(e.last, now) `` 적용(apps/wake/pages/events-view.js:23) | RULE-TIME 렌더 재검증 전 | 고정 없음 → TASK-CMP-T-EVENTS-VIEW | D00090; D00091; D-USR-2026-11-16-2; D00447; D00776 |
| <a id="cmp-t-events-view-c002"></a>CMP-T-EVENTS-VIEW-C002 | 'Type'; `apps/wake/pages/events-view.js:23` | status | `` e => typeCell(e.type) `` | 상태 원문순 | Warning은 warn, Normal은 중립; typeCell의 상태 아이콘·색·글 | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` W.type ``; fit | → [RULE-TONE](../../rules.md#RULE-TONE) | `` e => typeCell(e.type) `` 적용(apps/wake/pages/events-view.js:23) | 표시 결과는 status와 일치. 현재 열 선언의 kind 누락을 status로 명시해야 함 | 고정 없음 → TASK-CMP-T-EVENTS-VIEW | D00090; D00091; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-events-view-c003"></a>CMP-T-EVENTS-VIEW-C003 | 'Reason'; `apps/wake/pages/events-view.js:24` | text | `` row['reason'] `` | 원문↑ | 보조: muted | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` W.reason ``; fit | 이벤트 목록과 Reason 묶음 행의 reason를 BackOff로 넣는다 → Reason 칸에 BackOff를 표시한다(reason); 표시: Reason·종료 사유 원문과 Exit 정수·중립 보조 톤 →Reason가 다른 필드 값이거나 BackOff가 잘못 바뀌면 실패. 현재 상태로 마지막 종료를 덮거나 사유만으로 별도 상태색을 만들지 않음. | `` row['reason'] `` 적용(apps/wake/pages/events-view.js:24) | 없음(확인: apps/wake/pages/events-view.js:24) | 고정 없음 → TASK-CMP-T-EVENTS-VIEW | D00090; D00091; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-events-view-c004"></a>CMP-T-EVENTS-VIEW-C004 | 'Count'; `apps/wake/pages/events-view.js:24` | number | `` e => num(e.count) `` | 수치↓ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `W.reason`, fit; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 이벤트 목록과 Reason 묶음: count=3 입력 → Count 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →다른 행의 집계 수를 넣거나 숫자에 상태 아이콘을 붙이면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` e => num(e.count) `` 적용(apps/wake/pages/events-view.js:24) | 없음(확인: apps/wake/pages/events-view.js:24) | 고정 없음 → TASK-CMP-T-EVENTS-VIEW | D00090; D00091; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-t-events-view-c005"></a>CMP-T-EVENTS-VIEW-C005 | 'First Seen'; `apps/wake/pages/events-view.js:25` | time | `` e => when(e.first, now) `` | 시각↓ | 시간: muted | → [RULE-TIME](../../rules.md#RULE-TIME) | 화면 선언: optional, 초기 `W.first`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | → [RULE-TIME](../../rules.md#RULE-TIME) | `` e => when(e.first, now) `` 적용(apps/wake/pages/events-view.js:25) | RULE-TIME 렌더 재검증 전 | 고정 없음 → TASK-CMP-T-EVENTS-VIEW | D00090; D00091; D-USR-2026-11-16-2; D00447; D00776 |
| <a id="cmp-t-events-view-c006"></a>CMP-T-EVENTS-VIEW-C006 | 'Type'; `apps/wake/pages/events-view.js:77` | status | `` e => typeCell(e.type) `` | 상태 원문순 | Warning은 warn, Normal은 중립; typeCell의 상태 아이콘·색·글 | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` W.type `` | → [RULE-TONE](../../rules.md#RULE-TONE) | `` e => typeCell(e.type) `` 적용(apps/wake/pages/events-view.js:77) | 표시 결과는 status와 일치. 현재 열 선언의 kind 누락을 status로 명시해야 함 | 고정 없음 → TASK-CMP-T-EVENTS-VIEW | D00090; D00091; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-events-view-c007"></a>CMP-T-EVENTS-VIEW-C007 | 'Reason'; `apps/wake/pages/events-view.js:77` | text | `` row['reason'] `` | 원문↑ | 보조: muted | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 'calc(var(--space-16) * 2.2)' `` | 이벤트 목록과 Reason 묶음 행의 reason를 BackOff로 넣는다 → Reason 칸에 BackOff를 표시한다(reason); 표시: Reason·종료 사유 원문과 Exit 정수·중립 보조 톤 →Reason가 다른 필드 값이거나 BackOff가 잘못 바뀌면 실패. 현재 상태로 마지막 종료를 덮거나 사유만으로 별도 상태색을 만들지 않음. | `` row['reason'] `` 적용(apps/wake/pages/events-view.js:77) | 없음(확인: apps/wake/pages/events-view.js:77) | 고정 없음 → TASK-CMP-T-EVENTS-VIEW | D00090; D00091; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-events-view-c008"></a>CMP-T-EVENTS-VIEW-C008 | 'Count'; `apps/wake/pages/events-view.js:78` | number | `` e => num(e.count) `` | 수치↓ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 'calc(var(--space-16) * 1.2)' `` | 이벤트 목록과 Reason 묶음: count=3 입력 → Count 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →다른 행의 집계 수를 넣거나 숫자에 상태 아이콘을 붙이면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` e => num(e.count) `` 적용(apps/wake/pages/events-view.js:78) | 없음(확인: apps/wake/pages/events-view.js:78) | 고정 없음 → TASK-CMP-T-EVENTS-VIEW | D00090; D00091; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-t-events-view-c009"></a>CMP-T-EVENTS-VIEW-C009 | 'Objects'; `apps/wake/pages/events-view.js:78` | number | `` e => num(e.objs) `` | 수치↓ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `'calc(var(--space-16) * 1.2)'`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 이벤트 목록과 Reason 묶음: objs=3 입력 → Objects 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →다른 행의 집계 수를 넣거나 숫자에 상태 아이콘을 붙이면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` e => num(e.objs) `` 적용(apps/wake/pages/events-view.js:78) | 없음(확인: apps/wake/pages/events-view.js:78) | 고정 없음 → TASK-CMP-T-EVENTS-VIEW | D00090; D00091; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-t-events-view-c010"></a>CMP-T-EVENTS-VIEW-C010 | 'Source'; `apps/wake/pages/events-view.js:79` | text | `` row['source']; muted=true `` | 원문↑ | 보조: muted | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `W.src`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 이벤트 목록과 Reason 묶음 행의 source를 kubelet로 넣는다 → Source 칸에 kubelet를 표시한다(source); 표시: 원본 공급자/수신처 이름·중립 보조 톤 →Source가 다른 필드 값이거나 kubelet가 잘못 바뀌면 실패. 읽기 성공만으로 수신 또는 발송 성공색을 붙이지 않음. | `` row['source']; muted=true `` 적용(apps/wake/pages/events-view.js:79) | 없음(확인: apps/wake/pages/events-view.js:79) | 고정 없음 → TASK-CMP-T-EVENTS-VIEW | D00090; D00091; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-events-view-c011"></a>CMP-T-EVENTS-VIEW-C011 | 'Message'; `apps/wake/pages/events-view.js:79` | text | `` row['message']; muted=true `` | 원문↑ | 보조: muted | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `W.src`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 이벤트 목록과 Reason 묶음 행의 message를 Back-off restarting failed container로 넣는다 → Message 칸에 Back-off restarting failed container를 표시한다(message); 표시: 마스킹한 원문 한 줄·중립 보조 톤; 잘릴 때 전문 접근 →Message가 다른 필드 값이거나 Back-off restarting failed container가 잘못 바뀌면 실패. HTML 실행·번역·숫자 재포맷으로 원문을 손상하지 않음. | `` row['message']; muted=true `` 적용(apps/wake/pages/events-view.js:79) | 없음(확인: apps/wake/pages/events-view.js:79) | 고정 없음 → TASK-CMP-T-EVENTS-VIEW | D00090; D00091; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-events-view-c012"></a>CMP-T-EVENTS-VIEW-C012 | 'Last Seen'; `apps/wake/pages/events-view.js:79` | time | `` e => when(e.last, now()) `` | 시각↓ | 시간: muted | → [RULE-TIME](../../rules.md#RULE-TIME) | 유지; `` W.first `` | → [RULE-TIME](../../rules.md#RULE-TIME) | `` e => when(e.last, now()) `` 적용(apps/wake/pages/events-view.js:79) | RULE-TIME 렌더 재검증 전 | 고정 없음 → TASK-CMP-T-EVENTS-VIEW | D00090; D00091; D-USR-2026-11-16-2; D00447; D00776 |

<a id="cmp-t-events-extra"></a>

## CMP-T-EVENTS-EXTRA — 공유 Event 표의 추가 3열

아래는 개별 Event 표의 Object·Source·Message 열이다. Reason 집계의 Source·Message와 별도로 `eventColumns`가 소유한다. Object와 Source는 optional, Message는 유지한다. 긴 값의 한 줄 표시와 전문 열기는 CMP-TABLE-04를 따른다.

| ID | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| CMP-T-EVENTS-OBJECT | eventSummary 행에 kind=Pod, name=web 입력 → Object에 Pod/web 표시 → Pod를 빼거나 검색에서 잘린 이름만 비교하면 실패 | eventTable이 kind/name을 /로 결합(`apps/wake/pages/events-view.js:26`) | 없음(확인: apps/wake/pages/events-view.js:26) | 고정 없음 → TASK-CMP-EVENTS-EXTRA | D00087 D00090 D00447 |
| CMP-T-EVENTS-SOURCE | eventSummary 행에 source=kubelet 입력 → Source에 kubelet 표시 → reportingController와 다른 출처를 추측하면 실패 | eventColumns의 source 셀(`apps/wake/pages/events-view.js:25`) | 없음(확인: apps/wake/pages/events-view.js:25) | 고정 없음 → TASK-CMP-EVENTS-EXTRA | D00087 D00090 D00447 |
| CMP-T-EVENTS-MESSAGE | eventSummary 행에 message=Back-off restarting failed container 입력 → Message에 Back-off restarting failed container 표시 → 말줄임 때문에 원문 전체를 열 수 없으면 실패 | eventColumns의 message 셀(`apps/wake/pages/events-view.js:25`) | 없음(확인: apps/wake/pages/events-view.js:25) | 고정 없음 → TASK-CMP-EVENTS-EXTRA | D00087 D00090 D00447 |

- 현재: `apps/wake/pages/events-view.js:23–25`는 개별 Event 8열을, `:77–79`는 Reason 집계 7열을 정의한다.
- 고정 장치: 고정 없음 → TASK-CMP-EVENTS-EXTRA
