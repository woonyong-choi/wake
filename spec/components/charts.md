# 차트

<a id="cmp-chart-01"></a>

<a id="CMP-CHART-01"></a>

## CMP-CHART-01 — 시리즈·단위·시간 범위

- 목표: metrics.range에 pod.cpu와 namespace=default,pod=web,from/to 및 step=15를 보내고 허용되지 않은 target 키도 보낸다 → 화면은 metrics.range에 등록된 series ID와 허용된 target만 보낸다. 임의 PromQL을 보내지 않는다. 계열 ID마다 질의·단위·대상을 고정하고 실제 응답과 대조한다. 아래 25개는 현재 등록값이다. from/to 입력은 ms, 응답 sample 시각과 step은 초다. (기본값 채택, 번복 가능) 구간은 15일 이하, step은 최소 15초이자 15초 배수로 두고 양끝 표본을 포함해 1,000점 이하로 제한한다. 대상 라벨은 Kubernetes 이름 정규식과 일치해야 한다. → pod.cpu가 m 이외 단위이거나 등록되지 않은 질의가 실행되거나 1000점을 넘기면 실패.
- 추가 조건: 입력 CPU·Memory 아이콘이 표시되는 지표 머리를 렌더 → 기대 아이콘 영역에 같은 의미의 가시 텍스트 없음; 값/단위·접근성 이름은 유지 → 실패 아이콘 옆에 CPU/Memory 등 중복 설명이 보이거나 접근성 이름 소실.
- 추가 조건: 입력 기존 화면에 새 차트 부품을 추가 → 기대 D00313의 공통 디자인 승격과 승인 화면 전후 비교를 적용 → 실패 차트가 별도 스타일로 삽입되어 같은 역할 표현이 달라짐. 공통 판정은 [B-001](../design.md#B-001)에 연결한다.
- 추가 조건: 입력 최신 D00573·D00575 적용 차트와 제품 내 동일 역할 차트들의 엔진/어댑터 식별 → 기대 현재 승인 엔진·공통 어댑터의 동일 사용을 확인하고 기준 표현을 비교 → 실패 시리즈 이름만 같고 엔진/표현이 페이지마다 달라도 통과.
- 추가 조건: 입력 CPU·Memory 값과 긴 단위/기간을 좁은 카드에 입력 → 기대 공통 용어와 승인된 머리 행 수·폭을 유지 → 실패 일부 카드만 세 줄이 되거나 단독 전체 폭으로 바뀜.
- 추가 조건: 입력 동일 대상의 CPU·Memory·Network·Filesystem을 0/1/복수 표본으로 연속 전환 → 기대 최신 승인 공통 엔진/어댑터와 같은 시간축·여백·범례·툴팁·기간 틀 사용 → 실패 시리즈 데이터는 맞아도 전환 시 다른 엔진/배치 정책 사용.

아이콘 영역의 중복 글자 금지는 값·단위·필요한 범례 및 접근성 이름을 지우는 규칙이 아니다.
- 현재: seriesQuery는 등록 ID·허용 라벨을 검사하고 rangeOf는 15일·15초 단위를 제한한다(`apps/wake/desktop/reads/metrics.cjs:50–62`).
- 차이: step 산식은 구간을 1000등분하므로 양끝을 포함하면 1001점이 가능하다. 목표 상한은 양끝 포함 1000점이다.
- 고정 장치: 고정 없음 → TASK-CMP-CHART-VALUES
- 출처: D-USR-2026-11-16-7; D00451, D00777, D01000; D00277; D00309; D00333; D00346
- 점검 항목: 허용된 테스트 출처에서 반환 query와 동일 구간·step을 독립 조회한다. series ID/labels/단위/시각/유효값이 일치. 이상 라벨·추가 target 키·역전 구간은 거절.

### 현재 등록 시리즈

| ID | 단위 | 필수 대상 라벨 | 현재 PromQL 식 |
|---|---|---|---|
| cluster.cpu | `` '%' `` | `` [] `` | `` () => '100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))' `` |
| cluster.mem | `` '%' `` | `` [] `` | `` () => '100 * (1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))' `` |
| cluster.err | `` '%' `` | `` [] `` | `` () => ratio5xx('', '') `` |
| cluster.rps | `` '/s' `` | `` [] `` | `` () => `sum(rate(${NGINX}[5m]))` `` |
| cluster.cpu.byNode | `` '%' `` | `` [] `` | `` () => `topk(5, 100 * (1 - avg by (nodename) (${BY_NODE('rate(node_cpu_seconds_total{mode="idle"}[5m])')})))` `` |
| cluster.mem.byNode | `` '%' `` | `` [] `` | `` () => `topk(5, 100 * (1 - sum by (nodename) (${BY_NODE('node_memory_MemAvailable_bytes')}) / sum by (nodename) (${BY_NODE('node_memory_MemTotal_bytes')})))` `` |
| cluster.err.byNs | `` '%' `` | `` [] `` | `` () => `topk(5, ${ratio5xx(' by (namespace)', '')})` `` |
| cluster.rps.byNs | `` '/s' `` | `` [] `` | `` () => `topk(5, sum by (namespace) (rate(${NGINX}[5m])))` `` |
| ingress.err | `` '%' `` | `` ['namespace', 'ingress'] `` | `` t => ratio5xx('', sel(t, ['namespace', 'ingress']).slice(1, -1)) `` |
| ingress.rps | `` '/s' `` | `` ['namespace', 'ingress'] `` | `` t => `sum(rate(${NGINX}${sel(t, ['namespace', 'ingress'])}[5m]))` `` |
| ingress.p95 | `` 's' `` | `` ['namespace', 'ingress'] `` | `` t => p95('', sel(t, ['namespace', 'ingress']).slice(1, -1)) `` |
| service.err | `` '%' `` | `` ['namespace', 'service'] `` | `` t => ratio5xx('', sel(t, ['namespace', 'service']).slice(1, -1)) `` |
| service.rps | `` '/s' `` | `` ['namespace', 'service'] `` | `` t => `sum(rate(${NGINX}${sel(t, ['namespace', 'service'])}[5m]))` `` |
| service.p95 | `` 's' `` | `` ['namespace', 'service'] `` | `` t => p95('', sel(t, ['namespace', 'service']).slice(1, -1)) `` |
| pod.cpu | `` 'm' `` | `` ['namespace', 'pod'] `` | `` t => `1000 * sum(rate(container_cpu_usage_seconds_total${sel(t, ['namespace', 'pod'], 'container!=""')}[5m]))` `` |
| pod.mem | `` 'bytes' `` | `` ['namespace', 'pod'] `` | `` t => `sum(container_memory_working_set_bytes${sel(t, ['namespace', 'pod'], 'container!=""')})` `` |
| container.cpu | `` 'cores' `` | `` ['namespace', 'pod', 'container'] `` | `` t => `sum(rate(container_cpu_usage_seconds_total${sel(t, ['namespace', 'pod', 'container'])}[5m]))` `` |
| container.mem | `` 'bytes' `` | `` ['namespace', 'pod', 'container'] `` | `` t => `sum(container_memory_working_set_bytes${sel(t, ['namespace', 'pod', 'container'])})` `` |
| pod.net.rx | `` 'bytes/s' `` | `` ['namespace', 'pod'] `` | `` t => `sum(rate(container_network_receive_bytes_total${sel(t, ['namespace', 'pod'])}[5m]))` `` |
| pod.net.tx | `` 'bytes/s' `` | `` ['namespace', 'pod'] `` | `` t => `sum(rate(container_network_transmit_bytes_total${sel(t, ['namespace', 'pod'])}[5m]))` `` |
| pod.restarts1h | `` '' `` | `` ['namespace', 'pod'] `` | `` t => `sum(increase(kube_pod_container_status_restarts_total${sel(t, ['namespace', 'pod'])}[1h]))` `` |
| node.cpu | `` '%' `` | `` ['node'] `` | `` t => `100 * (1 - avg(${BY_NODE('rate(node_cpu_seconds_total{mode="idle"}[5m])', t.node)}))` `` |
| node.mem | `` '%' `` | `` ['node'] `` | `` t => `100 * (1 - sum(${BY_NODE('node_memory_MemAvailable_bytes', t.node)}) / sum(${BY_NODE('node_memory_MemTotal_bytes', t.node)}))` `` |
| node.disk | `` '%' `` | `` ['node'] `` | `` t => `100 * max(${BY_NODE(`1 - node_filesystem_avail_bytes{${FS}} / node_filesystem_size_bytes{${FS}}`, t.node)})` `` |
| pvc.used | `` '%' `` | `` ['namespace', 'persistentvolumeclaim'] `` | `` t => `100 * max(kubelet_volume_stats_used_bytes${sel(t, ['namespace', 'persistentvolumeclaim'])} / kubelet_volume_stats_capacity_bytes${sel(t, ['namespace', 'persistentvolumeclaim'])})` `` |

공유 질의 조각과 입력 경계는 같은 소스의 다음 정의다.

| 정의 | 코드 위치 | 현재 식 |
|---|---|---|
| NAME | `apps/wake/desktop/reads/metrics.cjs:8` | `` /^[a-z0-9](?:[-a-z0-9.]{0,251}[a-z0-9])?$/ `` |
| LABEL | `apps/wake/desktop/reads/metrics.cjs:9` | `` { namespace: NAME, ingress: NAME, service: NAME, pod: NAME, container: NAME, node: NAME, persistentvolumeclaim: NAME } `` |
| NGINX | `apps/wake/desktop/reads/metrics.cjs:10` | `` 'nginx_ingress_controller_requests' `` |
| BY_NODE | `apps/wake/desktop/reads/metrics.cjs:12` | `` (expr, node) => `(${expr}) * on (instance) group_left(nodename) node_uname_info${node ? `{nodename="${node}"}` : ''}` `` |
| sel | `apps/wake/desktop/reads/metrics.cjs:13` | `` (target, keys, extra = '') => `{${[...keys.map(k => `${k}="${target[k]}"`), ...(extra ? [extra] : [])].join(',')}}` `` |
| ratio5xx | `apps/wake/desktop/reads/metrics.cjs:14` | `` (by, match) => `100 * sum${by}(rate(${NGINX}{${[match, 'status=~"5.."'].filter(Boolean).join(',')}}[5m])) / sum${by}(rate(${NGINX}${match ? `{${match}}` : ''}[5m]))` `` |
| p95 | `apps/wake/desktop/reads/metrics.cjs:15` | `` (by, match) => `histogram_quantile(0.95, sum by (le${by ? ', ' + by : ''}) (rate(nginx_ingress_controller_request_duration_seconds_bucket${match ? `{${match}}` : ''}[5m])))` `` |
| FS | `apps/wake/desktop/reads/metrics.cjs:16` | `` 'fstype=~"ext4\|xfs\|btrfs"' `` |
| invalid | `apps/wake/desktop/reads/metrics.cjs:48` | `` () => Object.assign(new Error('invalid metrics request'), { kind: 'invalid_request' }) `` |
| seriesQuery | `apps/wake/desktop/reads/metrics.cjs:50` | `` function seriesQuery(id, target = {}) { const def = Object.hasOwn(SERIES, id) ? SERIES[id] : null; if (!def) throw invalid(); const keys = def.target ?? []; if (Object.keys(target ?? {}).some(k => !keys.includes(k)) \|\| keys.some(k => typeof target[k] !== 'string' \|\| !LABEL[k].test(target[k]))) throw invalid(); return { query: def.expr(target), unit: def.unit }; } `` |
| rangeOf | `apps/wake/desktop/reads/metrics.cjs:58` | `` function rangeOf(from, to, step) { if (!Number.isFinite(from) \|\| !Number.isFinite(to) \|\| to <= from \|\| to - from > 15 * 86_400_000) throw invalid(); const min = Math.ceil((to - from) / 1000 / 1000 / 15) * 15; const s = Math.max(15, min, Math.round((Number(step) \|\| 0) / 15) * 15); return { from: Math.floor(from / 1000), to: Math.ceil(to / 1000), step: s }; } `` |

<a id="cmp-chart-02"></a>

<a id="CMP-CHART-02"></a>

## CMP-CHART-02 — 머리 값·한도·범례

- 목표: observations 마지막 값이 300m이고 spec.requests.cpu=100m,limits.cpu=500m인 계열과 누락 한도 계열을 연다 → 머리 값은 선택 구간의 마지막 유효 관측인지 집계인지 구분한다. CPU·메모리 한도선은 같은 대상의 실제 requests/limits에서만 그린다. 소스가 없으면 선을 만들지 않는다. 선의 이름/색/단위와 범례를 일치시키고 +N은 나머지를 세로 팝오버로 펼쳐 각 시리즈를 켜고 끈다. 미니·크게 보기 모두 같은 숨김 상태와 대상·기간을 쓴다. 이벤트 선은 이유·시각·상태를 hover로 확인한다. → 마지막 값을 평균으로 바꾸거나 없는 한도선을 그리거나 큰 보기에서 숨긴 계열이 다시 보이면 실패.
- 추가 조건: 양 테마의 확대 차트에 시리즈·이벤트 선 입력 → 이벤트 선은 공통 이벤트선 두께 토큰으로 시리즈와 구별되면서 읽을 수 있게 표시 → 임의 hairline으로 거의 보이지 않거나 점선이 사라지면 실패.
- 현재: refLevels는 명시된 기준선을 처리하고 fitLegend는 넘친 범례를 접는다(`kit/components/chart-card.js:512,836`).
- 차이: 기존 동작은 위 코드 위치를 따른다. 추가한 결정 조건의 구현·렌더 대조가 남아 있다.
- 고정 장치: 고정 없음 → TASK-CMP-CHART-HEAD
- 출처: D00592, D00594, D00595, D00598, D00600, D00605, D00614
- 점검 항목: 마지막값/평균/합계가 섞이지 않는지 원본 샘플로 검산. +N 전체 접근, on/off 후 머리·툴팁·표가 일치. 이벤트 선 hover시 이벤트 정보를 표시.

<a id="cmp-chart-03"></a>

<a id="CMP-CHART-03"></a>

## CMP-CHART-03 — 7상태와 과거 구간

- 목표: observations를 빈 배열·한 점·중간 null로 바꾸고 고정된 과거 from/to로 연다 → 정상은 유효 관측만 연결한다. 로딩은 차트 자리·축·머리 뼈대를 유지한다. 성공 빈 시리즈는 빈 그래프, 한 점은 한 점이며 없는 값을0으로 보간하지 않는다. 연결·권한 실패는 출처 상태와 재시도, 부분 실패는 성공 시리즈와 누락범위, 오래됨은 실제 수집시각과 끊긴 구간을 표시한다; [RULE-CHART](../rules.md#RULE-CHART). 현재 구간에 늦게 도착한 다른 대상의 응답을 붙이지 않는다; null 자리에 0을 그리거나 한 점을 가짜 선으로 늘리거나 과거 차트가 실시간으로 이동하면 실패.
- 추가 조건: 입력 기존 하늘색 기준선과 같은 역할의 추가 기준선을 한 차트에 렌더 → 기대 승인된 선의 굵기·dash 간격 패턴을 공통으로 사용 → 실패 한 기준선만 버그처럼 다른 점선 패턴 사용.
- 현재: temporalSegments는 null·비유한 값과 maxGapSeconds 초과 구간에서 선을 끊는다(`kit/core/temporal-chart.js:27–38`).
- 차이: 부품의 공백 처리는 있다. resource-list.js:43처럼 출처 실패를 null로 바꾸는 호출 경로는 실패 이유를 차트에 전달하지 못한다.
- 고정 장치: `kit/core/temporal-chart.test.mjs` — `temporal_segments_split_on_null_gap_unknown_distance_and_join_rules_without_inventing_points`; 추가 조건 고정 없음
- 출처: D00451, D00777, D00817, D00875; D00336
- 점검 항목: 빈/한 점/null/중간 공백/오래됨/과거 at/UID 교체 입력; [RULE-CHART](../rules.md#RULE-CHART). 실제 출처 수집주기와 maxGapSeconds 대조.

<a id="cmp-chart-04"></a>

<a id="CMP-CHART-04"></a>

## CMP-CHART-04 — 크기·축 드래그·키보드

- 목표: → [RULE-CHART](../rules.md#RULE-CHART).
- 추가 조건: → [RULE-CHART](../rules.md#RULE-CHART).
- 추가 조건: → [RULE-CHART](../rules.md#RULE-CHART).
- 현재: aspectHeight가 높이 토큰을 읽고 attach가 축·포인터 입력을 연결한다(`kit/components/chart-card.js:634,1187`).
- 차이: 기존 동작은 위 코드 위치를 따른다. 추가한 결정 조건의 구현·렌더 대조가 남아 있다.
- 고정 장치: 고정 없음 → TASK-CMP-CHART-AXIS
- 출처: D00562, D00568, D00817, D00875, D01000; D00543
- 점검 항목: → [RULE-CHART](../rules.md#RULE-CHART).

## 세부 동작 계약

| 규칙 ID | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="CMP-CHART-LIVE"></a><a id="cmp-chart-live"></a>CMP-CHART-LIVE 라이브 마지막 구간 | → [RULE-CHART](../rules.md#RULE-CHART) | temporalSegments는 관측 시각과 null 및 maxGapSeconds로 선을 나눈다(`kit/core/temporal-chart.js:27`) | 추가 대조: D00264: 업데이트 순간 전환만 있고 이후 브리딩이 없거나 과거도 지속 움직임; D00267: 끝 점만 움직이고 구간은 정적이거나 과거 구간까지 움직임; D00269: 한 시리즈만 반복 강조하거나 유효 구간 없는 시리즈를 움직임. | `kit/core/temporal-chart.test.mjs` — `temporal_option_animates_only_the_latest_run_under_the_explicit_live_flag`; 추가 조건 고정 없음 | D00264, D00267, D00451, D00562, D00563, D00568; D00269 |
| <a id="CMP-CHART-OVERLAY"></a><a id="cmp-chart-overlay"></a>CMP-CHART-OVERLAY 큰 보기와 닫기 | 1. chartCard 확대 버튼을 누르고 정보 영역 끝까지 이동한 뒤 Escape를 누른다 → 카드 우측 상단의 확대 버튼이 같은 데이터·기간의 큰 보기를 연다. 원 카드 위치에서 자연스럽게 확대하고 큰 보기 본문은 불투명하게 그린다. 큰 보기의 정보 영역 전체가 제한 높이 안에서 스크롤한다. Escape·닫기로 원 카드의 초점과 위치를 복원한다. → 큰 보기의 from/to가 달라지거나 닫힌 뒤 원 카드 초점이 없어지면 실패.<br>2. 긴 확대 내용·좁은 카드 → 공통 scrollArea 표현과 --widget-expand-inset에 따른 버튼 안쪽 간격 유지 → 별도 스크롤 표현 또는 버튼이 둥근 경계에 닿으면 실패. 공통 판정은 [B-048](../design.md#B-048)에 연결한다.<br>3. CPU 한도/범례가 있는 미니 카드를 확대·복귀 → 머리와 plot의 한 카드 관계를 유지하며 전환하고 중복 머리/남은 원위치 머리 없음 → 머리만 별도 떠 있거나 순간적으로 이중 표시되면 실패.<br>4. 왼쪽·중앙·오른쪽 카드 각각 확대 → 왼쪽은 오른쪽, 오른쪽은 왼쪽, 가운데는 가운데를 기준으로 확대 → 위치와 무관하게 항상 같은 한쪽으로 자라면 실패. | render는 큰 차트와 요약·정보 영역을 같은 layer 안에 구성한다(`kit/components/chart-layer.js:93`) | 추가 대조: D00603: 머리만 별도 떠 있거나 순간적으로 이중 표시되면 실패; D00638: 위치와 무관하게 항상 같은 한쪽으로 자라면 실패. | `kit/components/chart-layer.test.mjs:141` — `the layer grows out of the side where its card stands: a card at the left end opens to the right, one at the right end to the left, one in the middle from the middle`: 좌·중·우 카드의 unfoldFrames 기하를 검사한다. 실제 렌더·Escape·초점 복귀 고정 없음 → TASK-CMP-CHART-OVERLAY | D00583, D00586, D00587, D00588, D00591, D00593, D00638; D00603 |
| <a id="CMP-CHART-LEGEND"></a><a id="cmp-chart-legend"></a>CMP-CHART-LEGEND 범례와 머리 정렬 | 1. 계열 8개와 request·limit를 가진 같은 줄 차트 두 개를 연다 → 같은 줄 차트의 머리·그림 시작선·시간축을 맞춘다. 범례는 값 아래 공통 위치에 두고 넘친 항목은 +N 세로 목록에서 이름·색·값을 확인한다. request·limit는 실제 기준선을 뜻하며 계열을 구별하기 위한 임의 점선을 추가하지 않는다. → +N의 항목이 가로 문자열이거나 임의 계열 점선이 기준선으로 오인되면 실패.<br>2. 단일/다중 범례 카드와 좁은 폭 → 범례는 plot 가까운 공통 머리 간격과 plot 안쪽 시작·끝선을 유지 → 두 카드가 서로 정렬됐어도 범례만 바깥 라운드 끝에 닿거나 불필요한 공백이 생기면 실패.<br>3. D00580과 같은 카드에서 범례를 표시 → 값 아래이면서 plot에 붙는 공통 간격·inset을 유지 → '값 아래'만 만족하고 거리·끝선이 어긋나면 실패.<br>4. 8개 이상 시리즈의 +N에 hover/focus → 추가 클릭 없이 나머지 세로 목록이 열리고 각 시리즈 토글 및 큰 보기 동기화 → hover가 무반응이거나 목록 항목 토글 불가면 실패.<br>5. 위 공간이 충분/부족한 +N을 연다 → 기본 위쪽, 위에 들어가지 않을 때만 viewport에 맞는 대안 → 공간이 충분한데 아래 plot을 가리면 실패. | fitLegend가 공간에 따라 범례를 접고 숨긴 항목을 팝오버에 둔다(`kit/components/chart-card.js:836`) | temporal-chart.js:48의 seriesDash는 두 번째 계열부터 기본 점선을 지정한다. 실제 기준선만 점선으로 구별하는 목표와 다르다. | `kit/components/chart-card.test.mjs:797` — `the card head sits over the open button (so the legend popup covers it) and the button over the plate, the legend shows only once fitted, and its popup opens upward unless told otherwise`: z-index·fit 전 숨김·위쪽 기본 팝오버 CSS를 검사한다. 실제 hover/focus·화면 경계·큰 보기 동기화 고정 없음 → TASK-CMP-CHART-LEGEND | D00579, D00580, D00581, D00582, D00614, D00776, D00796, D00797, D00815; D00605 |
| <a id="CMP-CHART-AXES"></a><a id="cmp-chart-axes"></a>CMP-CHART-AXES 축과 이벤트 상호작용 | → [RULE-CHART](../rules.md#RULE-CHART) | showEventPoint는 선택 이벤트와 같은 시각의 묶음을 읽기 표시로 만든다(`kit/components/chart-card.js:1160`) | 추가 대조: D00081: 알려진 이벤트가 시간축에 없거나 다른 Pod/시각에 붙음; D00542: 축 전환은 [RULE-CHART](../rules.md#RULE-CHART)로 재검증. 샌키 분기는 이 부품의 판정 대상이 아니며 [RULE-SANKEY](../rules.md#RULE-SANKEY)에서 검증; D00804: 표시만 이전 범위에 남거나 최종 범위와 어긋나면 실패. | 고정 없음 → TASK-CMP-CHART-AXES | D00539, D00542, D00592, D00810, D00817, D00875; D00081; D00804; D00830 |
| <a id="CMP-CHART-PALETTE"></a><a id="cmp-chart-palette"></a>CMP-CHART-PALETTE 계열과 상태 색 분리 | 1. seriesAppearance에 slot 0,1,2를 주고 테마를 바꾼다 → 차트 계열은 공통 series 토큰과 정해진 순서를 쓴다. 상태 warning/danger 색을 계열 의미로 오인하게 만들지 않는다. 임의 팔레트 회귀·선 굵기·그라데이션 차이를 공통 부품에서 막고 양 테마에서 계열을 구별한다. → 계열 순서가 바뀌거나 danger 토큰을 계열 1의 색으로 쓰면 실패.<br>2. D00813의 청록·분홍 쌍을 양 테마 및 녹색맹 시뮬레이션으로 비교 → 아래 색 거리 판정법으로 두 계열의 거리가 각각 10 이상이고, D00813 적용 전후의 1·2번과 상태색은 유지한다. 이후 팔레트·순서 변경은 D00895~D00903의 승인 범위와 구별한다 → 두 테마 중 하나라도 거리가 10 미만이거나 승인 범위 밖 색을 바꾸면 실패. | seriesAppearance는 SERIES_PALETTE에서 slot별 색을 고른다(`kit/components/chart-card.js:321`) | D00813의 2·3번 쌍에 아래 동일 색 거리 계산을 적용해야 한다. 현재 최신 팔레트의 양 테마 계산·실제 렌더는 재검증 전이다. | `kit/core/temporal-chart.test.mjs` — `concrete_color_converts_modern_syntax_and_rejects_invalid_or_transparent`; 추가 조건 고정 없음 | D00568, D00569, D00570, D00573, D00813, D00895, D00896, D00897, D00902, D00903 |
| <a id="CMP-CHART-METADATA"></a><a id="cmp-chart-metadata"></a>CMP-CHART-METADATA 질의와 관측 시각 | 1. Prometheus query·step·source가 있는 작은 카드를 큰 보기로 연다 → 작은 차트에는 긴 PromQL과 step 안내 문장을 늘어놓지 않는다. 출처·단위·마지막 실제 관측 시각은 큰 보기 또는 조회 근거에서 확인 가능하게 유지한다. 숫자가 바뀌어도 머리의 위치와 폭이 움직이지 않는다. → 작은 머리에 긴 PromQL이 노출되거나 큰 보기에서도 관측 시각을 찾지 못하면 실패.<br>2. 정상·값 변동·변화 없음의 홈 지표 머리를 표시 → 수치/단위·필요한 비교값만 표시하고 '지금'·'1시간 전보다' 없음, 분할 폭 고정 → 두 문구가 남거나 문구 전환 때문에 영역 폭이 변하면 실패. 공통 판정은 [SCR-HOME-FIRST](../screens/home.md#SCR-HOME-FIRST)에 연결한다. | monitoring-parts가 서비스 응답의 시계열과 출처 정보로 차트 정의를 만든다(`apps/wake/pages/monitoring-parts.js:136–158`) | 없음(확인: apps/wake/pages/monitoring-parts.js:136–158) | 고정 없음 → TASK-CMP-CHART-METADATA | D00592, D00829, D00831; D00807 |

### 색 거리 판정법

CMP-CHART-PALETTE의 D00813 범위는 당시 2번 청록·3번 분홍이다. U00600의 비교값 4.6과 다른 계열 10 이상을 기준으로, 해당 쌍의 합격 하한을 10으로 명시한다. 정상 시각에서 다르다는 판단만으로 통과시키지 않는다. 후속 승인으로 슬롯 순서가 바뀐 최신 팔레트는 색의 대응을 먼저 확인한다.

원천 `lab(c, DEUT)`·`d(a,b)*100` 계산을 사용한다. 실제 테마 색을 선형 sRGB로 변환해 각 성분을 0~1로 제한하고, 아래 DEUT 행렬을 곱한 결과를 다시 0~1로 제한한다. 이를 OKLab으로 바꾼 두 값의 유클리드 거리에 100을 곱한다. CIEDE2000이나 감마가 적용된 RGB의 거리를 같은 수치로 비교하지 않는다.

| DEUT 행 | R | G | B |
|---|---|---|---|
| R′ | 0.367322 | 0.860646 | -0.227968 |
| G′ | 0.280085 | 0.672501 | 0.047413 |
| B′ | -0.011820 | 0.042940 | 0.968881 |

테마별 입력 색·슬롯 대응·계산값을 남긴다. 대응 색이나 입력이 복원되지 않으면 통과 대신 미검증으로 남긴다. 계산 통과와 실제 화면에서 범례·선·상태색을 구별하는 검수는 별도다.

<a id="CMP-CHART-ENCODING"></a>


## CMP-CHART-ENCODING

- 목표: 입력 CPU·메모리 시간열과 namespace별 Pod 상태·Deployment 가용 수 비교 자료 → 기대 시간 변화는 선, 해당 범주 비교는 막대와 수치로 표시 → 실패 정확한 수치라는 이유로 두 자료 유형을 모두 같은 선형 표현으로 처리
- 현재: render가 차트 정의를 받아 공통 카드를 만든다.(`kit/components/chart-card.js:272`)
- 차이: 시간열과 범주 비교에 적합한 선·막대 선택을 소비 화면별로 확인해야 한다.
- 고정 장치: 고정 없음 → TASK-CMP-CHART-ENCODING
- 출처: D00171
