# 클러스터 검색

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-T-CLUSTER-SEARCH-01

- 목표: 두 namespace에 이름 web인 Pod를 넣고 deployments 조회만 403으로 만든 뒤 web을 검색한다 → default/web과 다른 namespace의 web을 구별하고 deployments 권한 없음도 표시한다(resources 서비스). 같은 이름의 다른 종류·namespace를 구분하고 대상을 연다; [RULE-SORT](../../rules.md#RULE-SORT). 문제 우선: 같은 검색 일치 등급에서만 danger·warn 우선. 행 이동: 해당 cluster/ns/kind/name/UID 상세. 검색·거르기: 모든 허용된 종류의 name; namespace와 권한 누락 범위 표시; 두 Pod를 하나로 합치거나 deployments 거절을 전체 검색 성공으로 표시하면 실패.
- 현재: read는 Promise.allSettled로 종류별 읽기를 모은다(`apps/wake/pages/cluster-search.js:22`).
- 차이: 실패한 종류가 결과 집합에서 빠지며 결과 표에 실패 종류와 권한 범위가 없다.
- 고정 장치: 고정 없음 → TASK-CMP-T-CLUSTER-SEARCH
- 출처: D00447 D00093; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 행 계산

| 식 | 현재 계산 |
|---|---|
| ROWS | `` 80 `` |
| rows @30 | `` hits.slice(0, ROWS).map(r => ({ ...r, id: `${r.plural}/${r.ns \|\| '_all'}/${r.name}`, kind: KIND_OF[r.plural]?.kind ?? r.plural })) `` |

### 열 목표와 현재 차이

각 식의 row는 위 읽기/계산 결과다. 열 종류는 의미 기준의 목표이며 기존 별칭은 현재다. 열 선택 정렬의 동점·결손 위치는 D-USR-2026-11-16-2를 따른다.

| 규칙 ID | 열 이름·현재 위치 | 종류 | 원본 필드·표시식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-t-cluster-search-c001"></a>CMP-T-CLUSTER-SEARCH-C001 | 'Name'; `apps/wake/pages/cluster-search.js:36` | text | `` row['name']; lead=r => ({ icon: KIND_OF[r.plural]?.icon }) `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 남은 폭 `` | 클러스터 검색 행의 name을 web로 넣는다 → Name 칸에 web을 표시한다(name); 표시: 원문 이름·보통 굵기·중립; 한 줄 말줄임과 잘린 이름 전문; 수치 변환 없음 →Name이 다른 필드 값이거나 web이 잘못 바뀌면 실패. 표시 이름과 상세 이동의 UID를 따로 보존. | `` row['name']; lead=r => ({ icon: KIND_OF[r.plural]?.icon }) `` 적용(apps/wake/pages/cluster-search.js:36) | 없음(확인: apps/wake/pages/cluster-search.js:36) | 고정 없음 → TASK-CMP-T-CLUSTER-SEARCH | D00447; D00093 |
| <a id="cmp-t-cluster-search-c002"></a>CMP-T-CLUSTER-SEARCH-C002 | 'Kind'; `apps/wake/pages/cluster-search.js:37` | text | `` row['kind']; muted=true `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 'calc(var(--space-16) * 2.4)' `` | 클러스터 검색 행의 kind를 Pod로 넣는다 → Kind 칸에 Pod를 표시한다(kind); 표시: 종류/조건 type 원어·중립 일반체; 단위·반올림 없음 →Kind가 다른 필드 값이거나 Pod가 잘못 바뀌면 실패. 리소스 종류와 Event Type 및 조건 type을 서로 바꾸지 않음. | `` row['kind']; muted=true `` 적용(apps/wake/pages/cluster-search.js:37) | 없음(확인: apps/wake/pages/cluster-search.js:37) | 고정 없음 → TASK-CMP-T-CLUSTER-SEARCH | D00447; D00093 |
| <a id="cmp-t-cluster-search-c003"></a>CMP-T-CLUSTER-SEARCH-C003 | 'Namespace'; `apps/wake/pages/cluster-search.js:38` | text | `` row['ns']; muted=true `` | 원문↑ | 보조: muted | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `'calc(var(--space-16) * 2)'`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 클러스터 검색 행의 ns를 default로 넣는다 → Namespace 칸에 default를 표시한다(ns); 표시: namespace 원문·중립 보조 톤; 문자열 그대로 →Namespace가 다른 필드 값이거나 default가 잘못 바뀌면 실패. default를 빈 값으로 생략하거나 다른 범위 이름을 쓰지 않음. | `` row['ns']; muted=true `` 적용(apps/wake/pages/cluster-search.js:38) | 없음(확인: apps/wake/pages/cluster-search.js:38) | 고정 없음 → TASK-CMP-T-CLUSTER-SEARCH | D00447; D00093 |
| <a id="cmp-t-cluster-search-c004"></a>CMP-T-CLUSTER-SEARCH-C004 | 'Status'; `apps/wake/pages/cluster-search.js:39` | status | `` r => (r.status ? status(r.status) : '') `` | 상태 우선 | `` 공통 상태 톤 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `'calc(var(--space-16) * 2.5)'`, fit; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | → [RULE-TONE](../../rules.md#RULE-TONE) | `` r => (r.status ? status(r.status) : '') `` 적용(apps/wake/pages/cluster-search.js:39) | Status 열에 kind=status 선언이 없다(apps/wake/pages/cluster-search.js:39) | 고정 없음 → TASK-CMP-T-CLUSTER-SEARCH | D00447; D00093 |

<a id="cmp-t-cluster-search-limit"></a>

## CMP-T-CLUSTER-SEARCH-LIMIT — 검색 복원·제한

- 목표: 서로 다른 UID의 이름 일치 리소스 81개를 검색한다 → 최대 80행과 총 일치 81건을 구분하고 Secret은 제외한다(FIND_KINDS, findResources). 실패한 종류는 검색 범위의 결손으로 표시한다 → 80건이 전체 결과처럼 보이거나 실패 종류를 숨기면 실패.
- 출처: D00447 D00093; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.
- 현재: `apps/wake/pages/cluster-search.js:22–23`은 성공한 종류만 index.rows에 저장하고, `:29,33`은 표시 80행과 hits.length를 따로 계산한다.

- 고정 장치: 고정 없음 → TASK-CMP-T-CLUSTER-SEARCH
- 차이: TASK-CMP-SEARCH-COVERAGE: 거절된 종류가 검색 범위 안내에 나타나지 않는다.
