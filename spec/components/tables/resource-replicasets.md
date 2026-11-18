# ReplicaSet 목록 표

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-K-REPLICASETS-01

- 목표: spec.replicas=3, status.replicas=3, readyReplicas=1인 ReplicaSet을 조회한다 → Desired=3, Current=3, Ready=1로 표시한다(spec.replicas, status.replicas, status.readyReplicas). 원하는 복제 수와 실제 준비 수를 대조한다. → [RULE-SORT](../../rules.md#RULE-SORT). 같은 문제 톤과 문제 없는 행 안에서는 namespace → name → UID 오름차순이며 값이 없으면 맨 뒤에 둔다. 문제 우선: ready < desired. 검색 Name; 필터 namespace·문제 상태; Pod만 Status·Node·Controlled By 추가. 동일 cluster/ns/kind/UID/at 상세로 이동한다; Ready가 1 대신 목표 3이 되거나 관측 없는 status를 Ready 0으로 단정하면 실패.
- 현재: ROW.replicasets가 원본 API 필드를 목록 값으로 변환한다(`apps/wake/data/kinds.js:136`); 목록의 `columns`와 `table`은 `apps/wake/pages/resource-list.js:113,143`에 있다.
- 차이: resources 응답 순서를 필터 후 slice하며 문제 우선·UID 동점 정렬이 없다(`apps/wake/pages/resource-list.js:143–150`).
- 고정 장치: 고정 없음 → TASK-CMP-K-REPLICASETS
- 출처: D00082 D00450; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 계산의 지역 변수

- `` const s = r.status \|\| {}, num = v => Number.isFinite(v) ? v : null, desired = num(r.spec?.replicas), current = num(s.replicas); ``
- `` const ready = current == null ? null : num(s.readyReplicas) ?? 0, available = current == null ? null : num(s.availableReplicas) ?? 0; ``
- `` const failed = (s.conditions \|\| []).some(c => c.type === 'ReplicaFailure' && c.status === 'True'); ``
- `` const status = failed ? st('danger', 'ReplicaFailure') : desired == null \|\| current == null ? st('neutral', 'Unknown') : desired === 0 && current === 0 ? st('neutral', 'Scaled to 0') : ready >= desired && available >= desired ? st('ok', 'Available') : ready === 0 && desired > 0 ? st('danger', 'Unavailable') : st('warn', 'Progressing'); ``
- `` const owner = (r.metadata?.ownerReferences \|\| []).find(ref => ref?.controller === true); ``

### 열 목표와 현재 차이

정렬 방향은 열 머리를 처음 선택한 방향이며 반대 방향도 지원한다(D00447). 동점은 표 계약의 namespace/name/UID다. 숨김 숫자는 오른쪽 optional부터 제거하는 순서다.

| 규칙 ID | 열 이름 | 종류 | 원본 필드·계산식 | 표시 형식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-k-replicasets-c001"></a>CMP-K-REPLICASETS-C001 | Name | text | `` metadata.name `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | → [RULE-WIDTH](../../rules.md#RULE-WIDTH). | ReplicaSet 목록 표의 metadata.name=web을 넣는다 → Name에 web을 표시한다; 표시: 원문 이름·보통 굵기·중립; 한 줄 말줄임과 잘린 이름 전문; 수치 변환 없음 →Name이 다른 객체의 이름으로 바뀌면 실패. 표시 이름과 상세 이동의 UID를 따로 보존. | `` metadata.name `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-REPLICASETS | D00082; D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-replicasets-c002"></a>CMP-K-REPLICASETS-C002 | Namespace | text | `` metadata.namespace `` | 원문·반올림 없음 | 원문↑ | 보조: muted | CMP-TABLE-04 | 5; `` calc(var(--space-16) * 2) ``; muted | ReplicaSet 목록 표의 metadata.namespace=default를 넣는다 → Namespace에 default를 표시한다; 표시: namespace 원문·중립 보조 톤; 문자열 그대로 →Namespace가 다른 객체의 이름으로 바뀌면 실패. default를 빈 값으로 생략하거나 다른 범위 이름을 쓰지 않음. | `` metadata.namespace `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-REPLICASETS | D00082; D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-replicasets-c003"></a>CMP-K-REPLICASETS-C003 | Status | status | `` status `` | 원문 상태·상태 아이콘 | 상태 우선 | 원본 tone | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 2.5) ``; fit | → [RULE-TONE](../../rules.md#RULE-TONE) | `` status `` 적용(apps/wake/data/kinds.js:136) | 열 정렬 없음; CMP-TABLE-05 | `apps/wake/data/kinds.test.mjs` — `ReplicaSet: 0 준비는 관측된 status에서만 0, 소유자와 revision은 실제 필드` | D00082; D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-replicasets-c004"></a>CMP-K-REPLICASETS-C004 | Desired | number | `` desired `` | 정수·반올림 없음 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 1.5) `` | ReplicaSet 목록 표: spec.replicas=3 입력 → Desired 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` desired `` 적용(apps/wake/data/kinds.js:136) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-REPLICASETS | D00082; D00450; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-replicasets-c005"></a>CMP-K-REPLICASETS-C005 | Current | number | `` current `` | 정수·반올림 없음 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 4; `` calc(var(--space-16) * 1.5) `` | ReplicaSet 목록 표: status.replicas=3 입력 → Current 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` current `` 적용(apps/wake/data/kinds.js:136) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-REPLICASETS | D00082; D00450; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-replicasets-c006"></a>CMP-K-REPLICASETS-C006 | Ready | number | `` ready `` | 정수·반올림 없음 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 유지; `` var(--space-16) `` | ReplicaSet 목록 표: status.readyReplicas=3 입력 → Ready 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` ready `` 적용(apps/wake/data/kinds.js:136) | 열 정렬 없음; CMP-TABLE-05 | `apps/wake/data/kinds.test.mjs` — `ReplicaSet: 0 준비는 관측된 status에서만 0, 소유자와 revision은 실제 필드` | D00082; D00450; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-replicasets-c007"></a>CMP-K-REPLICASETS-C007 | Available | number | `` available `` | 정수·반올림 없음 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 3; `` calc(var(--space-16) * 1.5) `` | ReplicaSet 목록 표: status.availableReplicas=3 입력 → Available 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` available `` 적용(apps/wake/data/kinds.js:136) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-REPLICASETS | D00082; D00450; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-replicasets-c008"></a>CMP-K-REPLICASETS-C008 | Controlled By | text | `` owner ? `${owner.kind}/${owner.name}` : '' `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 2; `` calc(var(--space-16) * 2.5) ``; muted | ReplicaSet 목록 표: metadata.ownerReferences의 controller=true인 Deployment/web 입력 → Controlled By 칸에 Deployment/web 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →controller=false 참조를 소유자로 선택하면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` owner ? `${owner.kind}/${owner.name}` : '' `` 적용(apps/wake/data/kinds.js:136) | 열 정렬 없음; CMP-TABLE-05 | `apps/wake/data/kinds.test.mjs` — `ReplicaSet: 0 준비는 관측된 status에서만 0, 소유자와 revision은 실제 필드` | D00082; D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-replicasets-c009"></a>CMP-K-REPLICASETS-C009 | Age | time | `` age(metadata.creationTimestamp, referenceAt) `` | 나이 s/m/h/d·단위 반올림 | 생성시각↓ | 시간: muted | CMP-TABLE-04 | 1; `` var(--space-16) `` | ReplicaSet 목록 표의 creationTimestamp가 referenceAt보다 3분 앞선 객체를 넣는다 → Age에 3m을 표시한다(metadata.creationTimestamp, referenceAt); 표시: 관측 기준 나이: 120초 미만 s, 7200초 미만 m, 172800초 미만 h, 이후 d; 해당 단위 Math.round; 흐린 고정폭 →기준 시각 대신 현재 시계를 써 과거 관측의 Age가 계속 늘어나면 실패. 미래/잘못된 시각은 정상 나이로 환산하지 않음. | `` age(metadata.creationTimestamp, referenceAt) `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-REPLICASETS | D00082; D00450; D-USR-2026-11-16-2; D00447; D00776 |

### 상세로 전달하는 현재 필드

| 필드 | 현재 계산식 |
|---|---|
| revision | `` r.metadata?.annotations?.['deployment.kubernetes.io/revision'] ?? '' `` |
| image | `` image(r.spec?.template?.spec) `` |
| selector | `` r.spec?.selector?.matchLabels \|\| {} `` |
| conditions | `` conds(r) `` |
