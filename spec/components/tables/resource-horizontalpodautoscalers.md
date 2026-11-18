# HorizontalPodAutoscaler 목록 표

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-K-HORIZONTALPODAUTOSCALERS-01

- 목표: HPA spec.metrics 목표 CPU 80%와 status.currentMetrics 누락을 넣는다 → Targets는 cpu: unknown/80%로 보인다(spec.metrics, status.currentMetrics). 현재·목표 지표와 min/max, scale 제한을 판단한다. → [RULE-SORT](../../rules.md#RULE-SORT). 같은 문제 톤과 문제 없는 행 안에서는 namespace → name → UID 오름차순이며 값이 없으면 맨 뒤에 둔다. 문제 우선: 실패 조건·목표 지표 미취득; max 도달만으로 실패 확정 금지. 검색 Name; 필터 namespace·문제 상태; Pod만 Status·Node·Controlled By 추가. 동일 cluster/ns/kind/UID/at 상세로 이동한다; 현재 값이 unknown 대신 목표 80%나 0으로 보이면 실패.
- 현재: ROW.horizontalpodautoscalers가 원본 API 필드를 목록 값으로 변환한다(`apps/wake/data/kinds.js:150`); 목록의 `columns`와 `table`은 `apps/wake/pages/resource-list.js:113,143`에 있다.
- 차이: resources 응답 순서를 필터 후 slice하며 문제 우선·UID 동점 정렬이 없다(`apps/wake/pages/resource-list.js:143–150`).
- 고정 장치: 고정 없음 → TASK-CMP-K-HORIZONTALPODAUTOSCALERS
- 출처: D00450; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 계산의 지역 변수

- `` const s = h.status \|\| {}, num = v => Number.isFinite(v) ? v : null, cs = h.status?.conditions \|\| [], flag = type => cs.find(c => c.type === type)?.status; ``
- `` const target = m => m?.target?.averageUtilization != null ? `${m.target.averageUtilization}%` : m?.target?.averageValue ?? m?.target?.value ?? ''; ``
- `` const metricName = m => m.type === 'Resource' ? m.resource?.name : m.type === 'ContainerResource' ? `${m.containerResource?.name}/${m.containerResource?.container}` : m.type === 'Pods' ? m.pods?.metric?.name : m.type === 'Object' ? m.object?.metric?.name : m.type === 'External' ? m.external?.metric?.name : m.type; ``
- `` const spec = (h.spec?.metrics \|\| []).map(m => ({ name: metricName(m), target: target(m[{ Resource: 'resource', ContainerResource: 'containerResource', Pods: 'pods', Object: 'object', External: 'external' }[m.type]]) })); ``
- `` const cur = (s.currentMetrics \|\| []).map(m => ({ name: metricName(m), value: (v => v?.current?.averageUtilization != null ? `${v.current.averageUtilization}%` : v?.current?.averageValue ?? v?.current?.value ?? '')(m[{ Resource: 'resource', ContainerResource: 'containerResource', Pods: 'pods', Object: 'object', External: 'external' }[m.type]]) })); ``
- `` const targets = spec.filter(m => m.name).map(m => `${m.name}: ${cur.find(c => c.name === m.name)?.value \|\| 'unknown'}/${m.target \|\| 'unknown'}`).join(', '); ``
- `` const status = flag('ScalingActive') === 'False' \|\| flag('AbleToScale') === 'False' ? st('danger', flag('AbleToScale') === 'False' ? 'Unable to scale' : 'Not active') : !cs.length ? st('neutral', 'Unknown') : flag('ScalingLimited') === 'True' ? st('warn', 'Limited') : flag('ScalingActive') === 'True' && flag('AbleToScale') === 'True' ? st('ok', 'Active') : st('neutral', 'Unknown'); ``
- `` const ref = h.spec?.scaleTargetRef; ``

### 열 목표와 현재 차이

정렬 방향은 열 머리를 처음 선택한 방향이며 반대 방향도 지원한다(D00447). 동점은 표 계약의 namespace/name/UID다. 숨김 숫자는 오른쪽 optional부터 제거하는 순서다.

| 규칙 ID | 열 이름 | 종류 | 원본 필드·계산식 | 표시 형식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-k-horizontalpodautoscalers-c001"></a>CMP-K-HORIZONTALPODAUTOSCALERS-C001 | Name | text | `` metadata.name `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | → [RULE-WIDTH](../../rules.md#RULE-WIDTH). | HorizontalPodAutoscaler 목록 표의 metadata.name=web을 넣는다 → Name에 web을 표시한다; 표시: 원문 이름·보통 굵기·중립; 한 줄 말줄임과 잘린 이름 전문; 수치 변환 없음 →Name이 다른 객체의 이름으로 바뀌면 실패. 표시 이름과 상세 이동의 UID를 따로 보존. | `` metadata.name `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-HORIZONTALPODAUTOSCALERS | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-horizontalpodautoscalers-c002"></a>CMP-K-HORIZONTALPODAUTOSCALERS-C002 | Namespace | text | `` metadata.namespace `` | 원문·반올림 없음 | 원문↑ | 보조: muted | CMP-TABLE-04 | 3; `` calc(var(--space-16) * 2) ``; muted | HorizontalPodAutoscaler 목록 표의 metadata.namespace=default를 넣는다 → Namespace에 default를 표시한다; 표시: namespace 원문·중립 보조 톤; 문자열 그대로 →Namespace가 다른 객체의 이름으로 바뀌면 실패. default를 빈 값으로 생략하거나 다른 범위 이름을 쓰지 않음. | `` metadata.namespace `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-HORIZONTALPODAUTOSCALERS | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-horizontalpodautoscalers-c003"></a>CMP-K-HORIZONTALPODAUTOSCALERS-C003 | Status | status | `` status `` | 원문 상태·상태 아이콘 | 상태 우선 | 원본 tone | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 2.5) ``; fit | → [RULE-TONE](../../rules.md#RULE-TONE) | `` status `` 적용(apps/wake/data/kinds.js:150) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-HORIZONTALPODAUTOSCALERS | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-horizontalpodautoscalers-c004"></a>CMP-K-HORIZONTALPODAUTOSCALERS-C004 | Reference | text | `` ref?.kind && ref?.name ? `${ref.kind}/${ref.name}` : '' `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 2; `` calc(var(--space-16) * 2.5) ``; muted | HorizontalPodAutoscaler 목록 표: spec.scaleTargetRef={kind:Deployment,name:web} 입력 → Reference 칸에 Deployment/web 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →종류를 생략해 다른 대상을 가리키면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` ref?.kind && ref?.name ? `${ref.kind}/${ref.name}` : '' `` 적용(apps/wake/data/kinds.js:150) | 열 정렬 없음; CMP-TABLE-05 | `apps/wake/data/kinds.test.mjs` — `HPA: 지표 현재 값은 status에 있을 때만, 없으면 unknown, 조건으로 상태 판정` | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-horizontalpodautoscalers-c005"></a>CMP-K-HORIZONTALPODAUTOSCALERS-C005 | Targets | text | `` targets `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 3) `` | HorizontalPodAutoscaler 목록 표: spec.metrics의 CPU 목표 80%, status.currentMetrics 없음 입력 → Targets 칸에 cpu: unknown/80% 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →현재 CPU를 0이나 목표 80%로 채우면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` targets `` 적용(apps/wake/data/kinds.js:150) | 열 정렬 없음; CMP-TABLE-05 | `apps/wake/data/kinds.test.mjs` — `HPA: 지표 현재 값은 status에 있을 때만, 없으면 unknown, 조건으로 상태 판정` | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-horizontalpodautoscalers-c006"></a>CMP-K-HORIZONTALPODAUTOSCALERS-C006 | Min | number | `` num(h.spec?.minReplicas) `` | 정수·반올림 없음 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 유지; `` var(--space-16) `` | HorizontalPodAutoscaler 목록 표: minReplicas=3 입력 → Min 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` num(h.spec?.minReplicas) `` 적용(apps/wake/data/kinds.js:150) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-HORIZONTALPODAUTOSCALERS | D00450; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-horizontalpodautoscalers-c007"></a>CMP-K-HORIZONTALPODAUTOSCALERS-C007 | Max | number | `` num(h.spec?.maxReplicas) `` | 정수·반올림 없음 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 유지; `` var(--space-16) `` | HorizontalPodAutoscaler 목록 표: maxReplicas=3 입력 → Max 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` num(h.spec?.maxReplicas) `` 적용(apps/wake/data/kinds.js:150) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-HORIZONTALPODAUTOSCALERS | D00450; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-horizontalpodautoscalers-c008"></a>CMP-K-HORIZONTALPODAUTOSCALERS-C008 | Replicas | number | `` num(s.currentReplicas) `` | 정수·반올림 없음 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 1.5) `` | HorizontalPodAutoscaler 목록 표: currentReplicas=3 입력 → Replicas 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` num(s.currentReplicas) `` 적용(apps/wake/data/kinds.js:150) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-HORIZONTALPODAUTOSCALERS | D00450; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-horizontalpodautoscalers-c009"></a>CMP-K-HORIZONTALPODAUTOSCALERS-C009 | Age | time | `` age(metadata.creationTimestamp, referenceAt) `` | 나이 s/m/h/d·단위 반올림 | 생성시각↓ | 시간: muted | CMP-TABLE-04 | 1; `` var(--space-16) `` | HorizontalPodAutoscaler 목록 표의 creationTimestamp가 referenceAt보다 3분 앞선 객체를 넣는다 → Age에 3m을 표시한다(metadata.creationTimestamp, referenceAt); 표시: 관측 기준 나이: 120초 미만 s, 7200초 미만 m, 172800초 미만 h, 이후 d; 해당 단위 Math.round; 흐린 고정폭 →기준 시각 대신 현재 시계를 써 과거 관측의 Age가 계속 늘어나면 실패. 미래/잘못된 시각은 정상 나이로 환산하지 않음. | `` age(metadata.creationTimestamp, referenceAt) `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-HORIZONTALPODAUTOSCALERS | D00450; D-USR-2026-11-16-2; D00447; D00776 |

### 상세로 전달하는 현재 필드

| 필드 | 현재 계산식 |
|---|---|
| desired | `` num(s.desiredReplicas) `` |
| conditions | `` conds(h) `` |
