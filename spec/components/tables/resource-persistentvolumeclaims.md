# PersistentVolumeClaim 목록 표

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-K-PERSISTENTVOLUMECLAIMS-01

- 목표: spec.requests.storage=10Gi, status.capacity.storage=8Gi, phase=Bound인 PVC를 조회한다 → Capacity는 8Gi이고 요청 10Gi와 실사용은 별도 의미로 유지한다(status.capacity, spec.resources). 요청·바인딩 용량·실사용량과 사용하는 Pod를 구분한다. → [RULE-SORT](../../rules.md#RULE-SORT). 같은 문제 톤과 문제 없는 행 안에서는 namespace → name → UID 오름차순이며 값이 없으면 맨 뒤에 둔다. 문제 우선: Lost/Pending; 사용률은 승인된 알림 정책에만 의존. 검색 Name; 필터 namespace·문제 상태; Pod만 Status·Node·Controlled By 추가. 동일 cluster/ns/kind/UID/at 상세로 이동한다; 요청 10Gi·바인딩 8Gi를 실사용 8Gi로 부르거나 출처 없는 사용률을 만들면 실패.
- 현재: ROW.persistentvolumeclaims가 원본 API 필드를 목록 값으로 변환한다(`apps/wake/data/kinds.js:161`); 목록의 `columns`와 `table`은 `apps/wake/pages/resource-list.js:113,143`에 있다.
- 차이: resources 응답 순서를 필터 후 slice하며 문제 우선·UID 동점 정렬이 없다(`apps/wake/pages/resource-list.js:143–150`).
- 고정 장치: 고정 없음 → TASK-CMP-K-PERSISTENTVOLUMECLAIMS
- 출처: D00450; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 계산의 지역 변수

- `` const phase = v.status?.phase \|\| ''; ``
- `` const status = v.metadata?.deletionTimestamp ? st('warn', 'Terminating') : phase === 'Bound' ? st('ok', 'Bound') : phase === 'Pending' ? st('warn', 'Pending') : phase === 'Lost' ? st('danger', 'Lost') : st('neutral', phase \|\| 'Unknown'); ``

### 열 목표와 현재 차이

정렬 방향은 열 머리를 처음 선택한 방향이며 반대 방향도 지원한다(D00447). 동점은 표 계약의 namespace/name/UID다. 숨김 숫자는 오른쪽 optional부터 제거하는 순서다.

| 규칙 ID | 열 이름 | 종류 | 원본 필드·계산식 | 표시 형식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-k-persistentvolumeclaims-c001"></a>CMP-K-PERSISTENTVOLUMECLAIMS-C001 | Name | text | `` metadata.name `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | → [RULE-WIDTH](../../rules.md#RULE-WIDTH). | PersistentVolumeClaim 목록 표의 metadata.name=web을 넣는다 → Name에 web을 표시한다; 표시: 원문 이름·보통 굵기·중립; 한 줄 말줄임과 잘린 이름 전문; 수치 변환 없음 →Name이 다른 객체의 이름으로 바뀌면 실패. 표시 이름과 상세 이동의 UID를 따로 보존. | `` metadata.name `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-PERSISTENTVOLUMECLAIMS | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-persistentvolumeclaims-c002"></a>CMP-K-PERSISTENTVOLUMECLAIMS-C002 | Namespace | text | `` metadata.namespace `` | 원문·반올림 없음 | 원문↑ | 보조: muted | CMP-TABLE-04 | 6; `` calc(var(--space-16) * 2) ``; muted | PersistentVolumeClaim 목록 표의 metadata.namespace=default를 넣는다 → Namespace에 default를 표시한다; 표시: namespace 원문·중립 보조 톤; 문자열 그대로 →Namespace가 다른 객체의 이름으로 바뀌면 실패. default를 빈 값으로 생략하거나 다른 범위 이름을 쓰지 않음. | `` metadata.namespace `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-PERSISTENTVOLUMECLAIMS | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-persistentvolumeclaims-c003"></a>CMP-K-PERSISTENTVOLUMECLAIMS-C003 | Status | status | `` status `` | 원문 상태·상태 아이콘 | 상태 우선 | 원본 tone | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 2) ``; fit | → [RULE-TONE](../../rules.md#RULE-TONE) | `` status `` 적용(apps/wake/data/kinds.js:161) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-PERSISTENTVOLUMECLAIMS | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-persistentvolumeclaims-c004"></a>CMP-K-PERSISTENTVOLUMECLAIMS-C004 | Capacity | number | `` v.status?.capacity?.storage \|\| '' `` | 열 목표의 단위·반올림 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 유지; `` var(--space-16) `` | PersistentVolumeClaim 목록 표: status.capacity.storage=8Gi, spec 요청=10Gi 입력 → Capacity 칸에 8Gi 표시; 표시: 원본 capacity 수량의 Gi/Mi 단위 보존·중립 고정폭; 원문 수량은 반올림하지 않음  →요청 용량 10Gi를 Capacity로 바꾸면 실패. PVC 용량을 Node CPU 용량으로 해석하지 않음. | `` v.status?.capacity?.storage \|\| '' `` 적용(apps/wake/data/kinds.js:161) | 열 정렬 없음; CMP-TABLE-05 | `apps/wake/data/kinds.test.mjs` — `PVC: 단계는 status.phase, 요청 용량과 바인딩 용량 분리(사용량 아님)` | D00450; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-persistentvolumeclaims-c005"></a>CMP-K-PERSISTENTVOLUMECLAIMS-C005 | Used | number | `` usage[namespace/name].usedPct `` | 사용량/용량 ×100의 % | 원시 수치↓ | 보통 | CMP-TABLE-04 | 5; `` var(--space-16) `` | PersistentVolumeClaim 목록 표: usage의 동일 namespace/name usedPct=25 입력 → Used 칸에 25% 표시; 표시: 사용량/용량 ×100의 %; 기존 표시식 자릿수 유지·중립 고정폭  →요청량으로 사용률을 추정하거나 null을 0%로 채우면 실패. 분모 결측을 정상 0%로 만들지 않음. | usageOf·CELL에서 `` usage[namespace/name].usedPct `` 표시(`apps/wake/pages/resource-list.js:98–109`) | 정렬·실패 시 열 숨김(CMP-TABLE-02/05) | 고정 없음 → TASK-CMP-K-PERSISTENTVOLUMECLAIMS | D00450; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-persistentvolumeclaims-c006"></a>CMP-K-PERSISTENTVOLUMECLAIMS-C006 | StorageClass | text | `` v.spec?.storageClassName ?? '' `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 4; `` calc(var(--space-16) * 2) ``; muted | PersistentVolumeClaim 목록 표: spec.storageClassName=fast 입력 → StorageClass 칸에 fast 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →기본 StorageClass를 임의로 채우면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` v.spec?.storageClassName ?? '' `` 적용(apps/wake/data/kinds.js:161) | 열 정렬 없음; CMP-TABLE-05 | `apps/wake/data/kinds.test.mjs` — `PVC: 단계는 status.phase, 요청 용량과 바인딩 용량 분리(사용량 아님)` | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-persistentvolumeclaims-c007"></a>CMP-K-PERSISTENTVOLUMECLAIMS-C007 | Used By | text | `` 같은 namespace에서 PVC를 참조한 Pod 이름 `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 3; `` calc(var(--space-16) * 2.5) ``; muted | PersistentVolumeClaim 목록 표: default의 Pod web만 해당 PVC를 volume으로 참조하고 다른 namespace Pod도 동명 PVC를 참조 입력 → Used By 칸에 web 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →다른 namespace Pod를 사용처에 섞으면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` 같은 namespace에서 PVC를 참조한 Pod 이름 `` 적용(apps/wake/data/kinds.js:161) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-PERSISTENTVOLUMECLAIMS | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-persistentvolumeclaims-c008"></a>CMP-K-PERSISTENTVOLUMECLAIMS-C008 | Volume | text | `` v.spec?.volumeName \|\| '' `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 2; `` calc(var(--space-16) * 2.5) ``; muted | PersistentVolumeClaim 목록 표: spec.volumeName=pv-a 입력 → Volume 칸에 pv-a 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →PVC 이름을 PV 이름으로 바꾸면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` v.spec?.volumeName \|\| '' `` 적용(apps/wake/data/kinds.js:161) | 열 정렬 없음; CMP-TABLE-05 | `apps/wake/data/kinds.test.mjs` — `PVC: 단계는 status.phase, 요청 용량과 바인딩 용량 분리(사용량 아님)` | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-persistentvolumeclaims-c009"></a>CMP-K-PERSISTENTVOLUMECLAIMS-C009 | Age | time | `` age(metadata.creationTimestamp, referenceAt) `` | 나이 s/m/h/d·단위 반올림 | 생성시각↓ | 시간: muted | CMP-TABLE-04 | 1; `` var(--space-16) `` | PersistentVolumeClaim 목록 표의 creationTimestamp가 referenceAt보다 3분 앞선 객체를 넣는다 → Age에 3m을 표시한다(metadata.creationTimestamp, referenceAt); 표시: 관측 기준 나이: 120초 미만 s, 7200초 미만 m, 172800초 미만 h, 이후 d; 해당 단위 Math.round; 흐린 고정폭 →기준 시각 대신 현재 시계를 써 과거 관측의 Age가 계속 늘어나면 실패. 미래/잘못된 시각은 정상 나이로 환산하지 않음. | `` age(metadata.creationTimestamp, referenceAt) `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-PERSISTENTVOLUMECLAIMS | D00450; D-USR-2026-11-16-2; D00447; D00776 |

### 상세로 전달하는 현재 필드

| 필드 | 현재 계산식 |
|---|---|
| phase | `` phase `` |
| requested | `` v.spec?.resources?.requests?.storage \|\| '' `` |
| accessModes | `` (v.status?.accessModes \|\| v.spec?.accessModes \|\| []).join(', ') `` |
| conditions | `` conds(v) `` |
