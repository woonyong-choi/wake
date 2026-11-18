# DaemonSet 목록 표

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-K-DAEMONSETS-01

- 목표: desiredNumberScheduled=3, numberReady=2, numberMisscheduled=1인 DaemonSet을 조회한다 → Desired=3, Ready=2를 별도 칸에 표시하고 Misscheduled=1은 해당 상세 정보에 보인다(status). 대상 Node에 빠진 Pod와 준비되지 않은 Pod를 찾는다. → [RULE-SORT](../../rules.md#RULE-SORT). 같은 문제 톤과 문제 없는 행 안에서는 namespace → name → UID 오름차순이며 값이 없으면 맨 뒤에 둔다. 문제 기준은 ready < desired 또는 misscheduled > 0. 행은 동일 cluster/ns/kind/UID/at의 상세를 연다. 검색은 Name, 필터는 namespace·문제 상태이며 Pod는 Status·Node·Controlled By도 적용한다; Ready·Desired·Misscheduled를 각각 2·3·1로 읽을 수 없으면 실패.
- 현재: ROW.daemonsets가 원본 API 필드를 목록 값으로 변환한다(`apps/wake/data/kinds.js:128`); 목록의 `columns`와 `table`은 `apps/wake/pages/resource-list.js:113,143`에 있다.
- 차이: resources 응답 순서를 필터 후 slice하며 문제 우선·UID 동점 정렬이 없다(`apps/wake/pages/resource-list.js:143–150`).
- 고정 장치: 고정 없음 → TASK-CMP-K-DAEMONSETS
- 출처: D00083; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 계산의 지역 변수

- `` const s = d.status \|\| {}, want = s.desiredNumberScheduled \|\| 0; ``

### 열 목표와 현재 차이

정렬 칸은 열 머리 선택 시의 첫 방향이며 반대 방향도 지원한다(D00447). 동점은 표의 namespace/name/UID다. 숨김 숫자는 오른쪽 optional부터 숨기는 순서다. 폭은 현재 선언값으로, 새 고정 폭 승인이 아니다.

| 규칙 ID | 열 이름 | 종류 | 원본 필드·계산식 | 표시 형식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-k-daemonsets-c001"></a>CMP-K-DAEMONSETS-C001 | Name | text | `` metadata.name `` | 원문·반올림 없음 | 오름차순(원문) | 보통 | CMP-TABLE-04 | → [RULE-WIDTH](../../rules.md#RULE-WIDTH). | DaemonSet 목록 표의 metadata.name=web을 넣는다 → Name에 web을 표시한다; 표시: 원문 이름·보통 굵기·중립; 한 줄 말줄임과 잘린 이름 전문; 수치 변환 없음 →Name이 다른 객체의 이름으로 바뀌면 실패. 표시 이름과 상세 이동의 UID를 따로 보존. | `` metadata.name `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-DAEMONSETS | D00083; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-daemonsets-c002"></a>CMP-K-DAEMONSETS-C002 | Namespace | text | `` metadata.namespace `` | 원문·반올림 없음 | 오름차순(원문) | 보조: muted | CMP-TABLE-04 | 6; `` calc(var(--space-16) * 2) ``; muted | DaemonSet 목록 표의 metadata.namespace=default를 넣는다 → Namespace에 default를 표시한다; 표시: namespace 원문·중립 보조 톤; 문자열 그대로 →Namespace가 다른 객체의 이름으로 바뀌면 실패. default를 빈 값으로 생략하거나 다른 범위 이름을 쓰지 않음. | `` metadata.namespace `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-DAEMONSETS | D00083; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-daemonsets-c003"></a>CMP-K-DAEMONSETS-C003 | Status | status | `` workload(d, want, s.numberReady \|\| 0, s.numberAvailable \|\| 0) `` | 원문 상태·상태 아이콘 | 상태 우선순위 | 원본 tone | 원문 상태·사유 | 유지; `` calc(var(--space-16) * 2.5) ``; fit | → [RULE-TONE](../../rules.md#RULE-TONE) | `` workload(d, want, s.numberReady \|\| 0, s.numberAvailable \|\| 0) `` 적용(apps/wake/data/kinds.js:128) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-DAEMONSETS | D00083; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-daemonsets-c004"></a>CMP-K-DAEMONSETS-C004 | Desired | number | `` want `` | 정수·반올림 없음 | 내림차순(원시 수치) | 보통 | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 1.5) `` | DaemonSet 목록 표: status.desiredNumberScheduled=3 입력 → Desired 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` want `` 적용(apps/wake/data/kinds.js:128) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-DAEMONSETS | D00083; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-daemonsets-c005"></a>CMP-K-DAEMONSETS-C005 | Current | number | `` s.currentNumberScheduled \|\| 0 `` | 정수·반올림 없음 | 내림차순(원시 수치) | 보통 | CMP-TABLE-04 | 5; `` calc(var(--space-16) * 1.5) `` | DaemonSet 목록 표: currentNumberScheduled=3 입력 → Current 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` s.currentNumberScheduled \|\| 0 `` 적용(apps/wake/data/kinds.js:128) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-DAEMONSETS | D00083; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-daemonsets-c006"></a>CMP-K-DAEMONSETS-C006 | Ready | number | `` s.numberReady \|\| 0 `` | 정수·반올림 없음 | 내림차순(원시 수치) | 보통 | CMP-TABLE-04 | 유지; `` var(--space-16) `` | DaemonSet 목록 표: numberReady=3 입력 → Ready 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` s.numberReady \|\| 0 `` 적용(apps/wake/data/kinds.js:128) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-DAEMONSETS | D00083; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-daemonsets-c007"></a>CMP-K-DAEMONSETS-C007 | Up-to-date | number | `` s.updatedNumberScheduled \|\| 0 `` | 정수·반올림 없음 | 내림차순(원시 수치) | 보통 | CMP-TABLE-04 | 4; `` calc(var(--space-16) * 1.5) `` | DaemonSet 목록 표: updatedNumberScheduled=3 입력 → Up-to-date 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` s.updatedNumberScheduled \|\| 0 `` 적용(apps/wake/data/kinds.js:128) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-DAEMONSETS | D00083; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-daemonsets-c008"></a>CMP-K-DAEMONSETS-C008 | Available | number | `` s.numberAvailable \|\| 0 `` | 정수·반올림 없음 | 내림차순(원시 수치) | 보통 | CMP-TABLE-04 | 3; `` calc(var(--space-16) * 1.5) `` | DaemonSet 목록 표: numberAvailable=3 입력 → Available 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` s.numberAvailable \|\| 0 `` 적용(apps/wake/data/kinds.js:128) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-DAEMONSETS | D00083; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-daemonsets-c009"></a>CMP-K-DAEMONSETS-C009 | Node Selector | text | `` pairs(d.spec?.template?.spec?.nodeSelector) `` | 원문·반올림 없음 | 오름차순(원문) | 보통 | CMP-TABLE-04 | 2; `` calc(var(--space-16) * 2.5) ``; muted | DaemonSet 목록 표: spec.template.spec.nodeSelector={disk:ssd} 입력 → Node Selector 칸에 disk=ssd 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →labels를 nodeSelector로 대체하면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` pairs(d.spec?.template?.spec?.nodeSelector) `` 적용(apps/wake/data/kinds.js:128) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-DAEMONSETS | D00083; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-daemonsets-c010"></a>CMP-K-DAEMONSETS-C010 | Age | time | `` age(metadata.creationTimestamp, referenceAt) `` | 나이 s/m/h/d·단위 반올림 | 생성 시각 내림차순 | 시간: muted | 생성 일시·관측 기준시각 | 1; `` var(--space-16) `` | DaemonSet 목록 표의 creationTimestamp가 referenceAt보다 3분 앞선 객체를 넣는다 → Age에 3m을 표시한다(metadata.creationTimestamp, referenceAt); 표시: 관측 기준 나이: 120초 미만 s, 7200초 미만 m, 172800초 미만 h, 이후 d; 해당 단위 Math.round; 흐린 고정폭 →기준 시각 대신 현재 시계를 써 과거 관측의 Age가 계속 늘어나면 실패. 미래/잘못된 시각은 정상 나이로 환산하지 않음. | `` age(metadata.creationTimestamp, referenceAt) `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-DAEMONSETS | D00083; D-USR-2026-11-16-2; D00447; D00776 |

### 상세로 전달하는 현재 필드

| 필드 | 현재 계산식 |
|---|---|
| image | `` image(d.spec?.template?.spec) `` |
| selector | `` d.spec?.selector?.matchLabels \|\| {} `` |
| conditions | `` conds(d) `` |
