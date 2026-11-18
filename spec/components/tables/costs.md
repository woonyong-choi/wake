# 비용

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-T-COSTS-01

- 목표: costs 서비스에 같은 USD·7일 구간의 total 20·10·결손 행을 넣고 total 열을 고른다 → total 열의 20 USD, 10 USD, 빈값 순서로 표시한다(costs 서비스). 동일 구간·통화에서 할당 추정액이 큰 대상을 찾는다. → [RULE-SORT](../../rules.md#RULE-SORT). 문제 우선: 비용만으로 장애 판정하지 않음. 행 이동: scope의 다음 namespace/workload/pod/node 범위. 검색·거르기: name 검색, scope·namespace·기간·통화; 결손이 0으로 보이거나 통화가 다른 비용을 합치거나 비용만으로 장애 톤을 주면 실패.
- 현재: 표는 선택 sort.id를 비교하고 dataTable에 sort와 sortAction을 전달한다(`apps/wake/pages/costs.js:122`).
- 차이: 열 선언의 align:right는 남아 있으나 공통 표는 왼쪽으로 렌더링한다. 동점은 a.id.localeCompare(b.id)라 코드포인트 목표와 다르다. 동일 비용의 a/B ID는 목표 B→a지만 현재 a→B다.
- 고정 장치: 고정 없음 → TASK-CMP-T-COSTS
- 출처: D00107 D00108 D00109; D-USR-2026-11-16-7; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 행 계산

| 식 | 현재 계산 |
|---|---|
| PERIODS @8 | `` { '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 } `` |
| COLUMNS @10 | `` ['name', 'total', 'cpu', 'memory', 'storage', 'network', 'share'] `` |
| PAGE_SIZE @13 | `` 25 `` |
| period @17 | `` Object.hasOwn(PERIODS, query.period) ? query.period : '7d' `` |
| scope @19 | `` Object.fromEntries(['namespace', 'controllerKind', 'controller', 'pod', 'node'].filter(key => query[key]).map(key => [key, query[key]])) `` |
| data @23, targets @23, selected @23, configured @23 | 초기값 선언(apps/wake/pages/costs.js:23) |
| page @24 | `` 1 `` |
| sort @24 | `` { id: 'total', dir: 'desc' } `` |
| findAll @27 | `` clusterSearch(ctx, id) `` |
| money @28 | `` number => costValue(number, data?.currency) `` |
| selectedLabel @74 | `` () => { const target = targets?.find(row => row.uid === selected); return target ? target.namespace + '/' + target.name : t('wake.cost.service'); } `` |
| target @75 | `` targets?.find(row => row.uid === selected) `` |
| percent @91 | `` value => formatPercent(value, { maximumFractionDigits: 1 }) `` |
| label @107 | `` row => row.name === '__idle__' ? t('wake.cost.idle') : row.name === '__unallocated__' ? t('wake.cost.unallocated') : row.name === '__unknown__' ? t('wake.cost.targetUnknown') : row.name `` |
| share @119 | `` row => data.total > 0 && Number.isFinite(row.total) ? row.total / data.total : null `` |
| rows @122 | `` data.rows.filter(row => !q \|\| label(row).toLowerCase().includes(q)).sort((a, b) => { if (sort.id === 'name') return (sort.dir === 'asc' ? 1 : -1) * label(a).localeCompare(label(b)); const first = field(a, sort.id), second = field(b, sort.id); if (first == null \|\| second == null) return (first == null) - (second == null) \|\| a.id.localeCompare(b.id); return (sort.dir === 'asc' ? first - second : second - first) \|\| a.id.localeCompare(b.id); }) `` |
| pages @128 | `` Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) `` |
| current @128 | `` Math.max(1, Math.min(page, pages)) `` |
| labels @134 | `` first.map(row => row.name) `` |
| columns @138 | `` COLUMNS.map(col => ({ id: col, label: t('wake.cost.' + col), align: col === 'name' ? 'left' : 'right', value: col !== 'name', sortable: true, width: col === 'name' ? undefined : `calc(${col === 'total' ? 18 : 10}ch + 2 * var(--space-2))`, cell: row => { if (col === 'name') { const address = drillAddress(row); return address ? C.button.render({ label: label(row), tip: label(row), size: 'sm', variant: 'ghost', action: 'kit.navigate', arg: { address } }) : C.value.render({ text: label(row), reveal: true }); } if (col === 'share') return share(row) == null ? '' : percent(share(row)); return money(row[col]); }, })) `` |
| items @151 | `` [{ id: 'n', label: '', value: t('wake.cost.scope.' + view) }, { id: 'total', label: t('wake.cost.total'), value: money(data.total) }, { id: 'idle', label: t('wake.cost.idle'), value: money(data.idle) }, { id: 'unallocated', label: t('wake.cost.unallocated'), value: money(data.unallocated) }, ...(comparison ? [{ id: 'previous', label: t('wake.cost.previous'), value: comparison }] : []), { id: 'window', label: t('wake.cost.period'), value: time(data.start) + ' → ' + time(data.observedThrough ?? data.end) }, ...(status === 'partial' ? [{ id: 'state', label: '', value: t(key(status)), tone: 'warn' }] : [])] `` |
| scoped @175 | `` Object.values(scope).join(' / ') `` |

### 열 목표와 현재 차이

각 식의 row는 위 읽기/계산 결과다. 열 종류는 의미 기준의 목표이며 기존 별칭은 현재다. 열 선택 정렬의 동점·결손 위치는 D-USR-2026-11-16-2를 따른다.

| 규칙 ID | 열 이름·현재 위치 | 종류 | 원본 필드·표시식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-t-costs-c001"></a>CMP-T-COSTS-C001 | t('wake.cost.' + col); `apps/wake/pages/costs.js:138` | text | `` row => { if (col === 'name') { const address = drillAddress(row); return address ? C.button.render({ label: label(row), tip: label(row), size: 'sm', variant: 'ghost', action: 'kit.navigate', arg: { address } }) : C.value.render({ text: label(row), reveal: true }); } if (col === 'share') return share(row) == null ? '' : percent(share(row)); return money(row[col]); }; align=col === 'name' ? 'left' : 'right'; sortable=true `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` col === 'name' ? undefined : `calc(${col === 'total' ? 18 : 10}ch + 2 * var(--space-2))` `` | 비용: name=web, total=20, data.total=100, currency=USD 입력 → t('wake.cost.' + col) 칸에 대상 web, 총액 20 USD, 비중 20%를 각각의 열에 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →금액과 비중을 같은 열에 섞으면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` row => { if (col === 'name') { const address = drillAddress(row); return address ? C.button.render({ label: label(row), tip: label(row), size: 'sm', variant: 'ghost', action: 'kit.navigate', arg: { address } }) : C.value.render({ text: label(row), reveal: true }); } if (col === 'share') return share(row) == null ? '' : percent(share(row)); return money(row[col]); }; align=col === 'name' ? 'left' : 'right'; sortable=true `` 적용(apps/wake/pages/costs.js:138) | align:right는 무효 속성; 실제 전 열 왼쪽 정렬 | 고정 없음 → TASK-CMP-T-COSTS | D00107 D00109; D-USR-2026-11-16-7; D00447 |

<a id="cmp-t-costs-expand"></a>

## CMP-T-COSTS-EXPAND — 동적 7열

통화값은 같은 기간의 `currency`를 붙이고, 0보다 크고 0.01보다 작은 절댓값은 최대 소수 6자리, 나머지는 최대 2자리로 표시한다. 비중은 퍼센트이며 금액이 아니다. 전 열 왼쪽 정렬(D-USR-2026-11-16-1), 숫자 tabular-nums를 적용한다. 총액 열 폭은 18ch, 다른 숫자 열은 10ch에 양쪽 space-2를 더한다. 대상 열은 남는 폭을 쓴다.

| 열 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| name | currency=USD인 비용 응답에 row.name=web 입력 → 대상 칸에 web과 drillAddress의 하위 범위 링크 표시 → 다른 namespace의 web으로 이동하면 실패 | name: `apps/wake/pages/costs.js:141`의 label·drillAddress | 없음(확인: apps/wake/pages/costs.js:141) | 고정 없음 → TASK-CMP-COSTS-VALUES | D00107 D00109; D-USR-2026-11-16-7; D-USR-2026-11-16-1 |
| total | currency=USD인 비용 응답에 row.total=20 입력 → 총 할당 추정액 칸에 20 USD 표시 → 월 비용으로 확대하거나 통화 없이 표시하면 실패 | total: `apps/wake/pages/costs.js:147`의 money(row[col]) | 없음(확인: apps/wake/pages/costs.js:147) | 고정 없음 → TASK-CMP-COSTS-VALUES | D00107 D00109; D-USR-2026-11-16-7; D-USR-2026-11-16-1 |
| cpu | currency=USD인 비용 응답에 row.cpu=0.001 입력 → CPU 칸에 0.001 USD 표시 → 작은 비용을 0으로 반올림하면 실패 | cpu: `apps/wake/pages/costs.js:147`의 money(row[col]) | 없음(확인: apps/wake/pages/costs.js:147) | 고정 없음 → TASK-CMP-COSTS-VALUES | D00107 D00109; D-USR-2026-11-16-7; D-USR-2026-11-16-1 |
| memory | currency=USD인 비용 응답에 row.memory=null 입력 → 메모리 칸에 빈 셀 표시 → 미관측 비용을 0 USD로 채우면 실패 | memory: `apps/wake/pages/costs.js:147`의 money(row[col]) | 없음(확인: apps/wake/pages/costs.js:147) | 고정 없음 → TASK-CMP-COSTS-VALUES | D00107 D00109; D-USR-2026-11-16-7; D-USR-2026-11-16-1 |
| storage | currency=USD인 비용 응답에 row.storage=2.5 입력 → 저장소 칸에 2.5 USD 표시 → 용량 단위 Gi로 바꾸면 실패 | storage: `apps/wake/pages/costs.js:147`의 money(row[col]) | 없음(확인: apps/wake/pages/costs.js:147) | 고정 없음 → TASK-CMP-COSTS-VALUES | D00107 D00109; D-USR-2026-11-16-7; D-USR-2026-11-16-1 |
| network | currency=USD인 비용 응답에 row.network=0 입력 → 네트워크 칸에 0 USD 표시 → 실제 비용 0을 결손으로 숨기면 실패 | network: `apps/wake/pages/costs.js:147`의 money(row[col]) | 없음(확인: apps/wake/pages/costs.js:147) | 고정 없음 → TASK-CMP-COSTS-VALUES | D00107 D00109; D-USR-2026-11-16-7; D-USR-2026-11-16-1 |
| share | currency=USD인 비용 응답에 row.total=20, data.total=100 입력 → 비중 칸에 20% 표시 → 금액 20 USD로 표시하거나 분모 0에서 비중을 만들면 실패 | share: `apps/wake/pages/costs.js:146`의 share·percent | 없음(확인: apps/wake/pages/costs.js:146) | 고정 없음 → TASK-CMP-COSTS-VALUES | D00107 D00109; D-USR-2026-11-16-7; D-USR-2026-11-16-1 |

- 현재: `apps/wake/data/costs.js:8–12`의 costValue가 통화와 소수 자릿수를 결정한다. `apps/wake/pages/costs.js:119,146`은 비중의 분모 0을 빈값으로 처리한다.
- 차이: 정렬 선언의 align:right는 공통 dataTable이 무시하는 무효 속성이다. 실제 오른쪽 정렬 결함으로 판정하지 않는다.
- 고정 장치: `kit/components/data-table-extras.test.mjs` — `a name column leads with a dot or a kind icon, a figure column is a left tabular figure, a time column is quiet`
- 출처: D-USR-2026-11-16-1; D-USR-2026-11-16-7.
