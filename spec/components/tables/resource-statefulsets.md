# StatefulSet 목록 표

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-K-STATEFULSETS-01

- 목표: readyReplicas=1, spec.replicas=3, currentRevision과 updateRevision이 다른 StatefulSet을 조회한다 → Ready=1, Desired=3과 현재·목표 revision 차이를 상세에서 함께 보여 준다(status, spec.replicas). 준비 복제본 수와 현재·목표 revision 차이를 판단한다. → [RULE-SORT](../../rules.md#RULE-SORT). 같은 문제 톤과 문제 없는 행 안에서는 namespace → name → UID 오름차순이며 값이 없으면 맨 뒤에 둔다. 문제 우선: ready < desired 또는 revision 불일치. 검색 Name; 필터 namespace·문제 상태; Pod만 Status·Node·Controlled By 추가. 동일 cluster/ns/kind/UID/at 상세로 이동한다; Ready·Desired·리비전 차이가 감춰지거나 정상 행보다 뒤로 밀리면 실패.
- 현재: ROW.statefulsets가 원본 API 필드를 목록 값으로 변환한다(`apps/wake/data/kinds.js:123`); 목록의 `columns`와 `table`은 `apps/wake/pages/resource-list.js:113,143`에 있다.
- 차이: resources 응답 순서를 필터 후 slice하며 문제 우선·UID 동점 정렬이 없다(`apps/wake/pages/resource-list.js:143–150`).
- 고정 장치: 고정 없음 → TASK-CMP-K-STATEFULSETS
- 출처: D00083; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 계산의 지역 변수

- `` const want = d.spec?.replicas ?? 1, s = d.status \|\| {}; ``
- `` const claims = d.spec?.volumeClaimTemplates \|\| []; ``

### 열 목표와 현재 차이

정렬 방향은 열 머리를 처음 선택한 방향이며 반대 방향도 지원한다(D00447). 동점은 표 계약의 namespace/name/UID다. 숨김 숫자는 오른쪽 optional부터 제거하는 순서다.

| 규칙 ID | 열 이름 | 종류 | 원본 필드·계산식 | 표시 형식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-k-statefulsets-c001"></a>CMP-K-STATEFULSETS-C001 | Name | text | `` metadata.name `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | → [RULE-WIDTH](../../rules.md#RULE-WIDTH). | StatefulSet 목록 표의 metadata.name=web을 넣는다 → Name에 web을 표시한다; 표시: 원문 이름·보통 굵기·중립; 한 줄 말줄임과 잘린 이름 전문; 수치 변환 없음 →Name이 다른 객체의 이름으로 바뀌면 실패. 표시 이름과 상세 이동의 UID를 따로 보존. | `` metadata.name `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-STATEFULSETS | D00083; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-statefulsets-c002"></a>CMP-K-STATEFULSETS-C002 | Namespace | text | `` metadata.namespace `` | 원문·반올림 없음 | 원문↑ | 보조: muted | CMP-TABLE-04 | 6; `` calc(var(--space-16) * 2) ``; muted | StatefulSet 목록 표의 metadata.namespace=default를 넣는다 → Namespace에 default를 표시한다; 표시: namespace 원문·중립 보조 톤; 문자열 그대로 →Namespace가 다른 객체의 이름으로 바뀌면 실패. default를 빈 값으로 생략하거나 다른 범위 이름을 쓰지 않음. | `` metadata.namespace `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-STATEFULSETS | D00083; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-statefulsets-c003"></a>CMP-K-STATEFULSETS-C003 | Status | status | `` workload(d, want, s.readyReplicas \|\| 0, s.readyReplicas \|\| 0) `` | 원문 상태·상태 아이콘 | 상태 우선 | 원본 tone | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 2.5) ``; fit | → [RULE-TONE](../../rules.md#RULE-TONE) | `` workload(d, want, s.readyReplicas \|\| 0, s.readyReplicas \|\| 0) `` 적용(apps/wake/data/kinds.js:123) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-STATEFULSETS | D00083; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-statefulsets-c004"></a>CMP-K-STATEFULSETS-C004 | Ready | number | `` s.readyReplicas \|\| 0 `` | 정수·반올림 없음 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 유지; `` var(--space-16) `` | StatefulSet 목록 표: readyReplicas=3 입력 → Ready 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` s.readyReplicas \|\| 0 `` 적용(apps/wake/data/kinds.js:123) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-STATEFULSETS | D00083; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-statefulsets-c005"></a>CMP-K-STATEFULSETS-C005 | Desired | number | `` want `` | 정수·반올림 없음 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 1.5) `` | StatefulSet 목록 표: spec.replicas=3 입력 → Desired 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` want `` 적용(apps/wake/data/kinds.js:123) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-STATEFULSETS | D00083; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-statefulsets-c006"></a>CMP-K-STATEFULSETS-C006 | Service | text | `` d.spec?.serviceName \|\| '' `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 5; `` calc(var(--space-16) * 2.5) ``; muted | StatefulSet 목록 표: spec.serviceName=web-headless 입력 → Service 칸에 web-headless 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →StatefulSet 이름을 Service 이름으로 추정하면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` d.spec?.serviceName \|\| '' `` 적용(apps/wake/data/kinds.js:123) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-STATEFULSETS | D00083; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-statefulsets-c007"></a>CMP-K-STATEFULSETS-C007 | PVC | number | `` claims.length ? [claims.length, claims[0].spec?.resources?.requests?.storage].filter(Boolean).join(' · ') : '' `` | PVC 개수 정수와 요청 용량의 Gi/Mi 원문 단위 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 4; `` calc(var(--space-16) * 2) `` | StatefulSet 목록 표: volumeClaimTemplates 두 개, 첫 요청 용량 10Gi 입력 → PVC 칸에 2 · 10Gi 표시; 표시: PVC 개수 정수와 요청 용량의 Gi/Mi 원문 단위; 중립  →실제 사용량이라고 표시하면 실패. PVC 개수와 용량을 하나의 무단위 숫자로 합치지 않음. | `` claims.length ? [claims.length, claims[0].spec?.resources?.requests?.storage].filter(Boolean).join(' · ') : '' `` 적용(apps/wake/data/kinds.js:123) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-STATEFULSETS | D00083; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-statefulsets-c008"></a>CMP-K-STATEFULSETS-C008 | Image | text | `` imageShort(d.spec?.template?.spec) `` | 원문·반올림 없음 | 원문↑ | 보조: muted | CMP-TABLE-04 | 3; `` calc(var(--space-16) * 3) ``; muted | StatefulSet 목록 표: spec.template.spec.containers의 image=registry/team/web:1 입력 → Image 칸에 web:1 표시; 표시: 이미지의 표시 경로·tag/digest 보존·중립 보조 톤 →태그를 없애거나 앞 컨테이너만 남기면 실패. 숫자로 보이는 tag를 반올림하거나 동일 이름의 다른 digest와 합치지 않음. | `` imageShort(d.spec?.template?.spec) `` 적용(apps/wake/data/kinds.js:123) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-STATEFULSETS | D00083; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-statefulsets-c009"></a>CMP-K-STATEFULSETS-C009 | Update Strategy | text | `` d.spec?.updateStrategy?.type \|\| '' `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 2; `` calc(var(--space-16) * 2.5) ``; muted | StatefulSet 목록 표: spec.updateStrategy.type=OnDelete 입력 → Update Strategy 칸에 OnDelete 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →Deployment의 RollingUpdate로 바꾸면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` d.spec?.updateStrategy?.type \|\| '' `` 적용(apps/wake/data/kinds.js:123) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-STATEFULSETS | D00083; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-statefulsets-c010"></a>CMP-K-STATEFULSETS-C010 | Age | time | `` age(metadata.creationTimestamp, referenceAt) `` | 나이 s/m/h/d·단위 반올림 | 생성시각↓ | 시간: muted | CMP-TABLE-04 | 1; `` var(--space-16) `` | StatefulSet 목록 표의 creationTimestamp가 referenceAt보다 3분 앞선 객체를 넣는다 → Age에 3m을 표시한다(metadata.creationTimestamp, referenceAt); 표시: 관측 기준 나이: 120초 미만 s, 7200초 미만 m, 172800초 미만 h, 이후 d; 해당 단위 Math.round; 흐린 고정폭 →기준 시각 대신 현재 시계를 써 과거 관측의 Age가 계속 늘어나면 실패. 미래/잘못된 시각은 정상 나이로 환산하지 않음. | `` age(metadata.creationTimestamp, referenceAt) `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-STATEFULSETS | D00083; D-USR-2026-11-16-2; D00447; D00776 |

### 상세로 전달하는 현재 필드

| 필드 | 현재 계산식 |
|---|---|
| upToDate | `` s.updatedReplicas \|\| 0 `` |
| image | `` image(d.spec?.template?.spec) `` |
| selector | `` d.spec?.selector?.matchLabels \|\| {} `` |
| application | `` trackedApp(d) `` |
| conditions | `` conds(d) `` |
