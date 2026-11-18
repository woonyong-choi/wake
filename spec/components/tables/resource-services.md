# Service 목록 표

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-K-SERVICES-01

- 목표: selector가 있는 Service에 ready EndpointSlice 주소 0개를 연결한다 → 준비 EndpointSlice 주소가 없다는 경고와 selector·포트를 표시한다(spec.selector, EndpointSlice.endpoints[].conditions.ready). 주소·포트·selector와 실제 backend를 대조한다. → [RULE-SORT](../../rules.md#RULE-SORT). 같은 문제 톤과 문제 없는 행 안에서는 namespace → name → UID 오름차순이며 값이 없으면 맨 뒤에 둔다. 문제 우선: selector가 있고 EndpointSlice 준비 주소가 0; ExternalName 제외. 검색 Name; 필터 namespace·문제 상태; Pod만 Status·Node·Controlled By 추가. 동일 cluster/ns/kind/UID/at 상세로 이동한다; backend가 없는데 정상 연결로 표시하거나 selector 이름만으로 Pod를 확정 연결하면 실패.
- 현재: ROW.services가 원본 API 필드를 목록 값으로 변환한다(`apps/wake/data/kinds.js:164`); 목록의 `columns`와 `table`은 `apps/wake/pages/resource-list.js:113,143`에 있다.
- 차이: resources 응답 순서를 필터 후 slice하며 문제 우선·UID 동점 정렬이 없다(`apps/wake/pages/resource-list.js:143–150`); ROW.services의 status는 실제 EndpointSlice와 무관한 Active 상수다(`apps/wake/data/kinds.js:164`).
- 고정 장치: 고정 없음 → TASK-CMP-K-SERVICES
- 출처: D00086; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 열 목표와 현재 차이

정렬 방향은 열 머리를 처음 선택한 방향이며 반대 방향도 지원한다(D00447). 동점은 표 계약의 namespace/name/UID다. 숨김 숫자는 오른쪽 optional부터 제거하는 순서다.

| 규칙 ID | 열 이름 | 종류 | 원본 필드·계산식 | 표시 형식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-k-services-c001"></a>CMP-K-SERVICES-C001 | Name | text | `` metadata.name `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | → [RULE-WIDTH](../../rules.md#RULE-WIDTH). | Service 목록 표의 metadata.name=web을 넣는다 → Name에 web을 표시한다; 표시: 원문 이름·보통 굵기·중립; 한 줄 말줄임과 잘린 이름 전문; 수치 변환 없음 →Name이 다른 객체의 이름으로 바뀌면 실패. 표시 이름과 상세 이동의 UID를 따로 보존. | `` metadata.name `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-SERVICES | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-services-c002"></a>CMP-K-SERVICES-C002 | Namespace | text | `` metadata.namespace `` | 원문·반올림 없음 | 원문↑ | 보조: muted | CMP-TABLE-04 | 6; `` calc(var(--space-16) * 2) ``; muted | Service 목록 표의 metadata.namespace=default를 넣는다 → Namespace에 default를 표시한다; 표시: namespace 원문·중립 보조 톤; 문자열 그대로 →Namespace가 다른 객체의 이름으로 바뀌면 실패. default를 빈 값으로 생략하거나 다른 범위 이름을 쓰지 않음. | `` metadata.namespace `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-SERVICES | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-services-c003"></a>CMP-K-SERVICES-C003 | Type | text | `` v.spec?.type \|\| 'ClusterIP' `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 2) ``; muted | Service 목록 표: spec.type=ExternalName 입력 → Type 칸에 ExternalName 표시; 표시: 종류/조건 type 원어·중립 일반체; 단위·반올림 없음 →ClusterIP로 덮어쓰면 실패. 리소스 종류와 Event Type 및 조건 type을 서로 바꾸지 않음. | `` v.spec?.type \|\| 'ClusterIP' `` 적용(apps/wake/data/kinds.js:164) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-SERVICES | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-services-c004"></a>CMP-K-SERVICES-C004 | Cluster-IP | text | `` v.spec?.clusterIP \|\| '' `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 5; `` calc(var(--space-16) * 2) ``; muted | Service 목록 표: spec.clusterIP=None 입력 → Cluster-IP 칸에 None 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →headless를 주소 결손으로 지우면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` v.spec?.clusterIP \|\| '' `` 적용(apps/wake/data/kinds.js:164) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-SERVICES | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-services-c005"></a>CMP-K-SERVICES-C005 | External-IP | text | `` (v.status?.loadBalancer?.ingress \|\| []).map(i => i.ip \|\| i.hostname).join(', ') `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 4; `` calc(var(--space-16) * 2) ``; muted | Service 목록 표: status.loadBalancer.ingress=[{hostname:lb.test}] 입력 → External-IP 칸에 lb.test 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →ip가 없다는 이유로 주소를 버리면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` (v.status?.loadBalancer?.ingress \|\| []).map(i => i.ip \|\| i.hostname).join(', ') `` 적용(apps/wake/data/kinds.js:164) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-SERVICES | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-services-c006"></a>CMP-K-SERVICES-C006 | Port(s) | text | `` (v.spec?.ports \|\| []).map(p => `${p.port}${p.nodePort ? ':' + p.nodePort : ''}/${p.protocol \|\| 'TCP'}`).join(', ') `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 3; `` calc(var(--space-16) * 2.5) ``; muted | Service 목록 표: spec.ports=[{port:80,nodePort:30080,protocol:TCP}] 입력 → Port(s) 칸에 80:30080/TCP 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →nodePort나 프로토콜을 누락하면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` (v.spec?.ports \|\| []).map(p => `${p.port}${p.nodePort ? ':' + p.nodePort : ''}/${p.protocol \|\| 'TCP'}`).join(', ') `` 적용(apps/wake/data/kinds.js:164) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-SERVICES | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-services-c007"></a>CMP-K-SERVICES-C007 | Selector | text | `` pairs(v.spec?.selector) `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 2; `` calc(var(--space-16) * 2.5) ``; muted | Service 목록 표: spec.selector={app:web} 입력 → Selector 칸에 app=web 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →metadata.labels로 selector를 대체하면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` pairs(v.spec?.selector) `` 적용(apps/wake/data/kinds.js:164) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-SERVICES | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-services-c008"></a>CMP-K-SERVICES-C008 | Age | time | `` age(metadata.creationTimestamp, referenceAt) `` | 나이 s/m/h/d·단위 반올림 | 생성시각↓ | 시간: muted | CMP-TABLE-04 | 1; `` var(--space-16) `` | Service 목록 표의 creationTimestamp가 referenceAt보다 3분 앞선 객체를 넣는다 → Age에 3m을 표시한다(metadata.creationTimestamp, referenceAt); 표시: 관측 기준 나이: 120초 미만 s, 7200초 미만 m, 172800초 미만 h, 이후 d; 해당 단위 Math.round; 흐린 고정폭 →기준 시각 대신 현재 시계를 써 과거 관측의 Age가 계속 늘어나면 실패. 미래/잘못된 시각은 정상 나이로 환산하지 않음. | `` age(metadata.creationTimestamp, referenceAt) `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-SERVICES | D00086; D-USR-2026-11-16-2; D00447; D00776 |

### 상세로 전달하는 현재 필드

| 필드 | 현재 계산식 |
|---|---|
| status | `` st('ok', 'Active') `` |
| selector | `` v.spec?.selector \|\| {} `` |
