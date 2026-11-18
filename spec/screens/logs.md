# 로그

<a id="SCR-LOGS"></a> 진입: `wake://cluster/:cluster/logs`. 목적(SRE 판단): 원문에서 오류와 전후 문맥을 찾는다.
구성: 머리 → Pod·container·source·기간 → 로그 도구 줄(검색·수준·시각·줄바꿈·이전·따라가기) → codeBlock.
현재: [apps/wake/pages/logs.js](../../apps/wake/pages/logs.js); [apps/wake/data/log-excerpt.js](../../apps/wake/data/log-excerpt.js); [apps/wake/data/index.js](../../apps/wake/data/index.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 대상, 로그, 수준별 집계, 시간·갱신; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-LOGS](../components/tables/logs.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: Kubernetes pods/log 또는 검증된 Loki 스트림의 원문·timestamp·cursor·partial·조회 절대 구간을 사용한다. Pod metadata.uid와 container/previous를 조회 신원에 포함한다. 읽은 줄 수와 기간 전체 집계는 다른 모수다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-LOGS-01"></a> `SCR-LOGS-01` | 클러스터 로그를 연다 → pods/log 또는 Loki 출처와 선택 Pod·container·기간 도구 줄 아래 시간/레벨/원문 로그가 보인다 → 다른 Pod 로그나 표 셀로 쪼갠 원문이면 실패 | body는 pageHeader·logToolbar·logCard를 조립한다(`apps/wake/pages/logs.js:59`). | 선택 Pod 소실 시 다른 Pod로 대체하는 V01의 차이가 화면 진입에도 적용된다. | 고정 없음 → TASK-SCREEN-LOGS | D00452 |
| <a id="SCR-LOGS-V01"></a> `SCR-LOGS-V01` | 선택한 logPod가 새 목록에서 사라진다 → 그 Pod의 없음/신원 변경을 표시한다 → 문제 Pod나 첫 Pod로 조용히 바뀌면 실패 | podOf는 선택값을 못 찾으면 문제 Pod 또는 pods[0]을 반환한다(`apps/wake/pages/logs.js:22`). | 선택 대상 소실을 표시하지 않고 다른 Pod로 대체한다. | 고정 없음 → TASK-SCREEN-LOGS | D00095; D00097 |
| <a id="SCR-LOGS-V02"></a> `SCR-LOGS-V02` | timestamp와 동일 시각 여러 줄, 다음 cursor가 있는 응답을 준다 → 원문 순서·시각·커서로 이전 페이지를 이어 읽는다 → 줄 누락·중복 또는 커서 소실이면 실패 | loadLogs는 text와 나머지 메타를 저장하지만 logActions에는 커서 읽기가 없다(`apps/wake/pages/logs.js:44`, `apps/wake/pages/log-card.js:62`). | 서버 cursor를 다음 요청에 전달하는 UI 동작이 없다. | 고정 없음 → TASK-SCREEN-LOGS | D00095; D00097; D00098 |
| <a id="SCR-LOGS-V03"></a> `SCR-LOGS-V03` | Loki 수준 집계는 실패하고 로그 100줄만 성공한다 → 수치가 읽은 100줄 기준임을 표시한다 → 전체 기간 ERROR 수로 표시하면 실패 | logToolbar는 levels가 없으면 읽은 줄에서 세지만 같은 레벨 탭 라벨을 사용한다(`apps/wake/pages/log-card.js:42`). | 전체 구간 집계와 읽은 줄 집계의 모수 안내가 없다. | 고정 없음 → TASK-SCREEN-LOGS | D00095 |
| <a id="SCR-LOGS-V04"></a> `SCR-LOGS-V04` | 빈 성공·보관기간 밖·403을 각각 조회한다 → 로그 없음·보관 범위 밖·권한 없음이 구분된다 → 세 상태를 모두 빈 성공으로 보이면 실패 | loadLogs는 unconfigured·forbidden·error만 구분한다(`apps/wake/pages/logs.js:48`). | 보관 만료 전용 상태와 coverage 안내가 없다. | 고정 없음 → TASK-SCREEN-LOGS | D00099 |
| <a id="SCR-LOGS-A01"></a> `SCR-LOGS-A01` | 로그 요청 대기 중 다른 Pod로 바꾸고 이전 응답을 완료한다 → 응답 세대와 abort로 늦은 로그/집계 응답을 버린다 → 이전 응답의 줄·집계가 새 Pod 화면에 섞이면 실패 | request 세대와 AbortController를 갱신하고 로그·levels 응답 모두 seq를 검사한다(`apps/wake/pages/logs.js:34`). | 없음(확인: apps/wake/pages/logs.js:34) | 고정 없음 → TASK-SCREEN-LOGS | D00095; D00114 |
| <a id="SCR-LOGS-A02"></a> `SCR-LOGS-A02` | Loki 응답의 동일 timestampNs 줄을 cursor 경계에 두고 앞뒤로 탐색한다 → timestampNs와 cursor.seen 기준으로 반복 원문을 누락·중복 없이 이어 표시한다 → 경계 줄이 빠지거나 반복 추가되면 실패 | 서버는 동시각 seen 해시 커서를 처리하지만 페이지 요청에는 cursor가 없다(`apps/wake/desktop/pod-logs.cjs:153`, `apps/wake/pages/logs.js:42`). | 서버 경계 보존은 구현됐으나 화면의 이전 100줄 탐색이 연결되지 않았다. | `apps/wake/desktop/pod-logs.test.cjs` — `readLokiPodLogWindow retains equal-timestamp repeated lines across 100-line pages` | D00097 |
| <a id="SCR-LOGS-A03"></a> `SCR-LOGS-A03` | 100행·1000행·2MiB·24시간 경계의 요청과 초과 입력을 준다 → SCR-LOG-WINDOW의 최초100행·최대1000행/2MiB·24시간 범위를 지킨다 → 허용 한도를 넘겨 읽거나 잘림을 숨기면 실패 | 서버는 2MiB와 최대 구간을 검사하고 화면은 최대 1,000줄을 유지한다(`apps/wake/desktop/pod-logs.cjs:5`, `apps/wake/desktop/pod-logs.cjs:13`, `apps/wake/pages/logs.js:47`). | Kubernetes 최초 요청은 100줄이 아니라 1,000줄이다. | 고정 없음 → TASK-SCREEN-LOGS | D00095; D00099; D00452; D00806 |
| <a id="SCR-LOGS-G01"></a> `SCR-LOGS-G01` | 기본 1시간에 100행 초과 및 2MiB 초과 로그를 조회한다 → 첫 100행·2MiB 한도와 잘림·더 읽기 범위를 표시한다 → 1000행을 최초 요구와 같게 취급하거나 잘림을 숨기면 실패 | loadLogs의 tail은 Loki=100, Kubernetes=LOG_ROW_LIMIT(1,000)이다(`apps/wake/pages/logs.js:42`). | Kubernetes 첫 100줄과 더 읽기 UI가 없고 최초부터 상한을 요청한다. | 고정 없음 → TASK-SCREEN-LOGS | D00095; D00098; D00806 |
| <a id="SCR-LOGS-G02"></a> `SCR-LOGS-G02` | Pod 81개가 있는 namespace에서 마지막 Pod를 선택한다 → 80개 뒤 대상도 검색·선택으로 접근한다 → 첫 80개만 제공하고 전체로 표시하면 실패 | Pod 메뉴는 문제 우선 배열을 slice(0,80)으로 자른다(`apps/wake/pages/logs.js:79`). | 81번째 이후 Pod에 접근하는 검색·추가 읽기가 없다. | 고정 없음 → TASK-SCREEN-LOGS | D00095; D-USR-2026-11-16-7 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-LOG-BOUND"></a> `SCR-LOG-BOUND` | 1. Pod UID·container·previous·절대 기간을 지정하고 ERROR를 검색한다 → 같은 대상의 원문 번호와 적중/앞뒤 문맥/생략 줄을 최대 20줄씩 표시한다 → 대상 교체 후 로그 혼입이나 무제한 렌더이면 실패.<br>2. 원문·필터 결과·긴 줄 로그를 같은 logView로 표시 → 승인된 스크롤/상태/검색 표시만 사용하고 지적된 노란 오류 모양 장식 없음 → 로그와 무관한 해당 표시가 오른쪽 끝에 남으면 실패; 정확한 대상은 원본 캡처 확보 후 고정. 같은 로그를 목록/상세에서 표시 → 공통 log-card의 승인된 머리·탭·본문 연결과 면 사용 → 별도 장식 띠나 승인되지 않은 상단 면이 삽입되면 실패. | loadLogs가 UID/기간을 보내고 logModel은 LOG_PER=20으로 자른다(`apps/wake/pages/logs.js:35`, `apps/wake/pages/log-card.js:32`). | Pod 선택은 이름 기반이며 목록 교체 시 이전 UID를 유지하지 않는다. | 고정 없음 → TASK-SCREEN-LOGS | D00095; D00096; D00099; D00452; D00881; D00940 |
| <a id="SCR-LOG-LOKI"></a> `SCR-LOG-LOKI` | 1. 검증된 Pod 스트림에서 같은 나노초의 반복 줄을 포함한 이전 100줄을 요청한다 → UID·container 일치 스트림만 읽고 cursor로 이어가며 포화 경계는 부분 결과로 표시한다 → 다른 스트림이나 중복·누락 줄이면 실패.<br>2. 입력 첫 페이지 밖에 검색 일치 로그가 존재 → 기대 검색어·대상·기간을 Loki 조회에 반영하고 그 결과의 커서로 더 보기 → 실패 현재 읽은 행만 필터하거나 기존 비검색 커서 재사용 | readLokiPodLogWindow가 스트림 신원과 cursor.seen을 검사한다(`apps/wake/desktop/pod-logs.cjs:91`, `apps/wake/desktop/pod-logs.cjs:153`). | 화면은 서버 커서와 포화 경계의 기간 축소 안내를 소비하지 않는다. | `apps/wake/desktop/pod-logs.test.cjs` — `readLokiPodLogWindow stops at a saturated nanosecond and leaves unverified streams unread`; 추가 조건 고정 없음 | D00097; D00452 |
| <a id="SCR-LOG-KUBERNETES"></a> `SCR-LOG-KUBERNETES` | 1. Kubernetes 출처에서 previous와 최근 500/1,000줄을 고른다 → tailLines·sinceTime·limitBytes 제한의 재조회와 읽은 줄 검색으로 표시한다 → 과거 커서 탐색이나 서버 전체 검색으로 안내하면 실패.<br>2. 입력 Kubernetes 보존 범위를 넘는 요청과 동일 Pod·컨테이너의 확인된 Loki 스트림 → 기대 일치가 검증된 Loki 스트림으로 대상·시간 범위를 보존해 이동 → 실패 일치 스트림이 있어도 경로 없음·이름만 같은 다른 UID로 이동 | 서버는 tail·sinceTime·limitBytes를 구성하지만 화면에 tail 선택은 없다(`apps/wake/desktop/pod-logs.cjs:55`, `apps/wake/pages/logs.js:42`). | 최근 500/1,000줄 재조회 선택과 검증된 Loki 과거 이동이 없다. | 고정 없음 → TASK-SCREEN-LOGS | D00098; D00452 |
| <a id="SCR-LOG-WINDOW"></a> `SCR-LOG-WINDOW` | → [RULE-RANGE](../rules.md#RULE-RANGE). | 기본 range=1h/follow=false이고 화면은 1,000줄, 20줄 페이지를 쓴다(`apps/wake/pages/logs.js:71`, `apps/wake/pages/log-card.js:32`). | 첫 요청이 Kubernetes 1,000줄이며 새 줄 배지와 24h를 넘는 선택의 창 분할 UI가 없다. | 고정 없음 → TASK-SCREEN-LOGS | D00095; D00099; D00452; D00806 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-LOGS-REQ-R-048"></a> `SCR-LOGS-REQ-R-048` | 200줄 중 ERROR가 80번째에 있는 컨테이너를 검색하고 앞뒤 2줄을 고른다 → logModel이 원래 n=78~82와 일치 줄·생략 수, 요청 절대 기간을 보존한다 → 결과를 1~5로 재번호화하거나 다른 컨테이너 줄을 넣으면 실패 | parseLog는 읽은 순서 n을 부여하고 logModel은 n을 유지해 자른다(`apps/wake/pages/log-card.js:14`, `apps/wake/pages/log-card.js:26`). | 수준 필터 뒤 앞뒤 문맥을 계산하므로 원본의 다른 수준 문맥 줄이 빠질 수 있다. | 고정 없음 → TASK-SCREEN-LOGS | D00452; D-USR-2026-11-16-7 |
