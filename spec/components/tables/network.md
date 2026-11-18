# 네트워크 표

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-T-NETWORK-01

- 목표: network 서비스에 송신·수신 시계열과 저장소 추정 관계를 넣고 Prometheus 한 질의를 실패시킨다 → 실측 송수신·오류와 추정 관계를 구분한다; [RULE-SORT](../../rules.md#RULE-SORT). 문제 우선: 상태 톤 위험·주의만 먼저 두며 읽기 실패·무계측을 정상으로 보지 않음. 행 이동: 실제 이름과 namespace의 리소스 상세. 검색·거르기: name·namespace, 선택 network 범위와 기간; 추정선을 실측 연결 수로 보이거나 실패한 질의가 0 트래픽으로 표시되면 실패.
- 현재: load는 services와 network를 Promise.all로 읽고 services 실패만 빈 배열로 바꾼다(`apps/wake/pages/network.js:37`).
- 차이: services 조회 오류가 빈 배열로 사라지며 network 실패 시 성공한 부분 시계열을 분리 표시하지 못한다.
- 고정 장치: 고정 없음 → TASK-CMP-T-NETWORK
- 출처: D00086; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 행 계산

| 식 | 현재 계산 |
|---|---|
| PER @16 | `` 20 `` |
| label @51 | `` axisTime(from, to) `` |
| items @57 | `` down ? [] : [{ id: 'rx', label: t('wake.net.rx'), value: rate(sum.rx) }, { id: 'tx', label: t('wake.net.tx'), value: rate(sum.tx) }, { id: 'px', label: t('wake.net.rxPeak'), value: rate(sum.rxPeak) }, { id: 'pt', label: t('wake.net.txPeak'), value: rate(sum.txPeak) }] `` |
| pages @72 | `` Math.max(1, Math.ceil(rows.length / PER)) `` |
| page @72 | `` Math.min(s.page, pages) `` |
| label @72 | `` t('wake.net.top') `` |
| rows @93 | `` prom?.stale ? [] : serviceRows(input, by) `` |

### 열 목표와 현재 차이

각 식의 row는 위 읽기/계산 결과다. 열 종류는 의미 기준의 목표이며 기존 별칭은 현재다. 열 선택 정렬의 동점·결손 위치는 D-USR-2026-11-16-2를 따른다.

| 규칙 ID | 열 이름·현재 위치 | 종류 | 원본 필드·표시식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-t-network-c001"></a>CMP-T-NETWORK-C001 | 이름 / by === 'ns' ? 'Namespace' : t('wake.git.name'); `apps/wake/pages/network.js:74` | text | `` row['name']; lead=() => ({ icon: by === 'ns' ? 'k8s-namespace' : 'k8s-service' }) `` | 원문↑ | 이름: 중립 본문; namespace 범위 이름도 상태색을 쓰지 않음 | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 남은 폭 `` | by='service'에서 name=web, by='ns'에서 name=default를 넣는다 → 이름 열에는 선택한 집계 범위의 원문 문자열과 해당 종류 아이콘을 중립 본문 톤으로 표시한다; 단위·반올림 없음 → Service 이름을 namespace로 치환하거나 default를 빈 값으로 생략하거나 오류색을 붙이면 실패. | `` row['name']; lead=() => ({ icon: by === 'ns' ? 'k8s-namespace' : 'k8s-service' }) `` 적용(apps/wake/pages/network.js:74) | 없음(확인: apps/wake/pages/network.js:74) | 고정 없음 → TASK-CMP-T-NETWORK | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-network-c002"></a>CMP-T-NETWORK-C002 | 'Namespace'; `apps/wake/pages/network.js:75` | text | `` row['ns']; muted=true `` | 원문↑ | 보조: muted | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `W2`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 네트워크 표 행의 ns를 default로 넣는다 → Namespace 칸에 default를 표시한다(ns); 표시: namespace 원문·중립 보조 톤; 문자열 그대로 →Namespace가 다른 필드 값이거나 default가 잘못 바뀌면 실패. default를 빈 값으로 생략하거나 다른 범위 이름을 쓰지 않음. | `` row['ns']; muted=true `` 적용(apps/wake/pages/network.js:75) | 없음(확인: apps/wake/pages/network.js:75) | 고정 없음 → TASK-CMP-T-NETWORK | D00086; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-network-c003"></a>CMP-T-NETWORK-C003 | 수신 / t('wake.net.rx'); `apps/wake/pages/network.js:76` | number | `` x => rate(x.rx) `` | 수치↓ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` W2 `` | 네트워크 표: rx=1048576바이트/초 입력 → 수신 칸에 1.0 MiB/s 표시; 표시: bytes/s ≥1048576이면 MiB/s 소수 1자리, 미만은 KiB/s 정수 반올림; 중립 고정폭  →MiB와 MB 단위를 혼용하면 실패. 수신 단위를 연결 개수와 혼합하지 않음. | `` x => rate(x.rx) `` 적용(apps/wake/pages/network.js:76) | 없음(확인: apps/wake/pages/network.js:76) | 고정 없음 → TASK-CMP-T-NETWORK | D00086; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-t-network-c004"></a>CMP-T-NETWORK-C004 | 송신 / t('wake.net.tx'); `apps/wake/pages/network.js:76` | number | `` x => rate(x.tx) `` | 수치↓ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` W2 `` | 네트워크 표: tx=1048576바이트/초 입력 → 송신 칸에 1.0 MiB/s 표시; 표시: 송신 bytes/s를 MiB/s 소수 1자리 또는 KiB/s 정수로 반올림; 중립 고정폭  →MiB와 MB 단위를 혼용하면 실패. 송신량을 수신량 필드에서 가져오지 않음. | `` x => rate(x.tx) `` 적용(apps/wake/pages/network.js:76) | 없음(확인: apps/wake/pages/network.js:76) | 고정 없음 → TASK-CMP-T-NETWORK | D00086; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-t-network-c005"></a>CMP-T-NETWORK-C005 | 연결 / t('wake.net.conn'); `apps/wake/pages/network.js:77` | number | `` x => (x.conns == null ? '' : num(x.conns)) `` | 수치↓ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `W15`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 네트워크 표: conns=null 입력 → 연결 칸에 빈 연결 수 셀과 출처의 관측 없음 상태 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →연결 수를 0으로 채우면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` x => (x.conns == null ? '' : num(x.conns)) `` 적용(apps/wake/pages/network.js:77) | 없음(확인: apps/wake/pages/network.js:77) | 고정 없음 → TASK-CMP-T-NETWORK | D00086; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-t-network-c006"></a>CMP-T-NETWORK-C006 | '5xx'; `apps/wake/pages/network.js:77` | number | `` x => pct(x.err) `` | 수치↓ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `W15`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 네트워크 표: err=1.25 입력 → 5xx 칸에 1.3% 표시; 표시: 원본 백분율 값의 % 소수 1자리 반올림; 중립 고정폭 숫자; 별도 확인된 상태 없이 위험색으로 올리지 않음  →비율의 분모를 바꾸거나 null을 0%로 채우면 실패. 5xx 비율을 요청 횟수로 바꾸지 않음. | `` x => pct(x.err) `` 적용(apps/wake/pages/network.js:77) | 없음(확인: apps/wake/pages/network.js:77) | 고정 없음 → TASK-CMP-T-NETWORK | D00086; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-t-network-c007"></a>CMP-T-NETWORK-C007 | TCP 재전송 / t('wake.net.retrans'); `apps/wake/pages/network.js:78` | number | `` x => pct(x.retrans) `` | 수치↓ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `W15`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 네트워크 표: retrans=1.25 입력 → TCP 재전송 칸에 1.3% 표시; 표시: TCP 재전송 비율의 % 소수 1자리 반올림; 중립 고정폭 숫자; 재전송률만으로 위험색을 임의 부여하지 않음  →비율의 분모를 바꾸거나 null을 0%로 채우면 실패. 전체 송신 바이트를 재전송 분모로 임의 대체하지 않음. | `` x => pct(x.retrans) `` 적용(apps/wake/pages/network.js:78) | 없음(확인: apps/wake/pages/network.js:78) | 고정 없음 → TASK-CMP-T-NETWORK | D00086; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
