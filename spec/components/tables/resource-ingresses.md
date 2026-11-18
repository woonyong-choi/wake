# Ingress 목록 표

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-K-INGRESSES-01

- 목표: host=example.test, path=/api, backend.service.name=api인 Ingress를 조회한다 → Hosts=example.test이고 상세 Rules에서 /api와 Service api를 연결한다(spec.rules). host/path의 Service와 port를 확인한다. → [RULE-SORT](../../rules.md#RULE-SORT). 같은 문제 톤과 문제 없는 행 안에서는 namespace → name → UID 오름차순이며 값이 없으면 맨 뒤에 둔다. 문제 우선: 참조 Service/port 없음; 주소 미할당만으로 원인 확정 금지. 검색 Name; 필터 namespace·문제 상태; Pod만 Status·Node·Controlled By 추가. 동일 cluster/ns/kind/UID/at 상세로 이동한다; 실제 backend 대신 이름이 비슷한 Service로 이동하면 실패.
- 현재: ROW.ingresses가 원본 API 필드를 목록 값으로 변환한다(`apps/wake/data/kinds.js:166`); 목록의 `columns`와 `table`은 `apps/wake/pages/resource-list.js:113,143`에 있다.
- 차이: resources 응답 순서를 필터 후 slice하며 문제 우선·UID 동점 정렬이 없다(`apps/wake/pages/resource-list.js:143–150`).
- 고정 장치: 고정 없음 → TASK-CMP-K-INGRESSES
- 출처: D00086; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 열 목표와 현재 차이

정렬 방향은 열 머리를 처음 선택한 방향이며 반대 방향도 지원한다(D00447). 동점은 표 계약의 namespace/name/UID다. 숨김 숫자는 오른쪽 optional부터 제거하는 순서다.

| 규칙 ID | 열 이름 | 종류 | 원본 필드·계산식 | 표시 형식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-k-ingresses-c001"></a>CMP-K-INGRESSES-C001 | Name | text | `` metadata.name `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | → [RULE-WIDTH](../../rules.md#RULE-WIDTH). | Ingress 목록 표의 metadata.name=web을 넣는다 → Name에 web을 표시한다; 표시: 원문 이름·보통 굵기·중립; 한 줄 말줄임과 잘린 이름 전문; 수치 변환 없음 →Name이 다른 객체의 이름으로 바뀌면 실패. 표시 이름과 상세 이동의 UID를 따로 보존. | `` metadata.name `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-INGRESSES | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-ingresses-c002"></a>CMP-K-INGRESSES-C002 | Namespace | text | `` metadata.namespace `` | 원문·반올림 없음 | 원문↑ | 보조: muted | CMP-TABLE-04 | 3; `` calc(var(--space-16) * 2) ``; muted | Ingress 목록 표의 metadata.namespace=default를 넣는다 → Namespace에 default를 표시한다; 표시: namespace 원문·중립 보조 톤; 문자열 그대로 →Namespace가 다른 객체의 이름으로 바뀌면 실패. default를 빈 값으로 생략하거나 다른 범위 이름을 쓰지 않음. | `` metadata.namespace `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-INGRESSES | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-ingresses-c003"></a>CMP-K-INGRESSES-C003 | Status | status | `` (i.status?.loadBalancer?.ingress \|\| []).length ? st('ok', 'Active') : st('warn', 'Pending') `` | 원문 상태·상태 아이콘 | 상태 우선 | 원본 tone | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 2) ``; fit | → [RULE-TONE](../../rules.md#RULE-TONE) | `` (i.status?.loadBalancer?.ingress \|\| []).length ? st('ok', 'Active') : st('warn', 'Pending') `` 적용(apps/wake/data/kinds.js:166) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-INGRESSES | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-ingresses-c004"></a>CMP-K-INGRESSES-C004 | Class | text | `` i.spec?.ingressClassName \|\| '' `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 1.5) ``; muted | Ingress 목록 표: spec.ingressClassName=nginx 입력 → Class 칸에 nginx 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →annotation이나 기본 클래스 이름을 추측해 채우면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` i.spec?.ingressClassName \|\| '' `` 적용(apps/wake/data/kinds.js:166) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-INGRESSES | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-ingresses-c005"></a>CMP-K-INGRESSES-C005 | Hosts | text | `` (i.spec?.rules \|\| []).map(r => r.host).filter(Boolean).join(', ') `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 3) `` | Ingress 목록 표: spec.rules의 host가 a.test와 b.test 입력 → Hosts 칸에 a.test, b.test 표시; 표시: host 원문·중립; wildcard와 포트가 있으면 보존 →첫 호스트만 남기면 실패. 추측한 프로토콜로 원래 host를 대체하지 않음. | `` (i.spec?.rules \|\| []).map(r => r.host).filter(Boolean).join(', ') `` 적용(apps/wake/data/kinds.js:166) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-INGRESSES | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-ingresses-c006"></a>CMP-K-INGRESSES-C006 | Address | text | `` (i.status?.loadBalancer?.ingress \|\| []).map(x => x.ip \|\| x.hostname).join(', ') `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 2; `` calc(var(--space-16) * 2) ``; muted | Ingress 목록 표: status.loadBalancer.ingress=[{ip:10.0.0.1},{hostname:lb.test}] 입력 → Address 칸에 10.0.0.1, lb.test 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →hostname 주소를 버리면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` (i.status?.loadBalancer?.ingress \|\| []).map(x => x.ip \|\| x.hostname).join(', ') `` 적용(apps/wake/data/kinds.js:166) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-INGRESSES | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-ingresses-c007"></a>CMP-K-INGRESSES-C007 | Age | time | `` age(metadata.creationTimestamp, referenceAt) `` | 나이 s/m/h/d·단위 반올림 | 생성시각↓ | 시간: muted | CMP-TABLE-04 | 1; `` var(--space-16) `` | Ingress 목록 표의 creationTimestamp가 referenceAt보다 3분 앞선 객체를 넣는다 → Age에 3m을 표시한다(metadata.creationTimestamp, referenceAt); 표시: 관측 기준 나이: 120초 미만 s, 7200초 미만 m, 172800초 미만 h, 이후 d; 해당 단위 Math.round; 흐린 고정폭 →기준 시각 대신 현재 시계를 써 과거 관측의 Age가 계속 늘어나면 실패. 미래/잘못된 시각은 정상 나이로 환산하지 않음. | `` age(metadata.creationTimestamp, referenceAt) `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-INGRESSES | D00086; D-USR-2026-11-16-2; D00447; D00776 |

### 상세로 전달하는 현재 필드

| 필드 | 현재 계산식 |
|---|---|
| backends | `` (i.spec?.rules \|\| []).flatMap(r => (r.http?.paths \|\| []).map(p => ({ host: r.host \|\| '*', path: p.path \|\| '/', service: p.backend?.service?.name \|\| '', port: p.backend?.service?.port?.number \|\| p.backend?.service?.port?.name \|\| '' }))) `` |
