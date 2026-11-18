# 알림 목록

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-T-ALERTS-01

- 목표: alerts에 firing 두 건과 Watchdog 한 건, 동시각의 서로 다른 alert ID를 넣는다 → firing 집계는 2이며 Watchdog 행은 없고 동시각 alert ID는 오름차순이다(alerts 서비스). 현재 조치할 firing 경고와 연결 인시던트를 고른다; [RULE-SORT](../../rules.md#RULE-SORT). 문제 우선: 시간순 유지; firing·severity는 필터와 톤으로 식별. Watchdog의 분류는 [RULE-CHIPS](../../rules.md#RULE-CHIPS)를 따른다. 행 이동: alert ID의 알림 상세. 검색·거르기: name·target 검색, state 필터, 기간; Watchdog가 firing 개수에 포함되거나 동시각 순서가 ID와 다르면 실패.
- 현재: 목록은 rows.slice로 30행씩 표시하며 dataTable에 sortAction을 전달하지 않는다(`apps/wake/pages/alerts.js:51`).
- 차이: 동시각 ID 정렬과 열 머리 정렬 제어가 목록에 없다.
- 고정 장치: 고정 없음 → TASK-CMP-T-ALERTS
- 출처: D01006; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

알림의 한 페이지 30행은 이력 탐색 밀도를 위한 기본값 채택(D-USR-2026-11-16-7)이다. 일반 리소스 표 20행과 역할이 다르며 전체 목록을 뜻하지 않는다. 31행 입력이면 첫 페이지 30행·다음 1행, 필터 변경 시 1페이지 복귀를 검수한다. Event의 명시된 50행 결정(D00090)은 알림에 적용하지 않는다.

### 현재 행 계산

| 식 | 현재 계산 |
|---|---|
| PER @15 | `` 30 `` |
| rowsOf @32 | `` () => alertList({ ...snap, incidents, stale: { prometheus: !!sources.of('prometheus', now())?.stale, alertmanager: !!sources.of('alertmanager', now())?.stale } }) `` |
| all @43 | `` alertsIn(rowsOf(), windowOf(s.range, now())) `` |
| rows @44 | `` found.filter(a => s.state === 'all' \|\| a.state === s.state) `` |
| pages @47 | `` Math.max(1, Math.ceil(rows.length / PER)) `` |
| page @47 | `` Math.min(s.page, pages) `` |
| label @47 | `` t('wake.view.alerts') `` |
| items @48 | `` [{ id: 't', label: '', value: label }, { id: 'f', label: 'firing', value: num(c.firing), ...(c.firing ? { tone: 'danger' } : {}) }, ...Object.entries(c.bySeverity).sort((a, b) => SEV.indexOf(a[0]) - SEV.indexOf(b[0])).map(([sev, n]) => ({ id: 's-' + sev, label: sev, value: num(n), ...(sev === 'critical' ? { tone: 'danger' } : {}) })), ...(c.oldest != null ? [{ id: 'o', label: t('wake.al.oldest'), value: duration(t, now() - c.oldest) }] : []), { id: 'p', label: 'pending', value: num(c.pending) }, { id: 'r', label: 'resolved', value: num(c.resolved) }] `` |

### 열 목표와 현재 차이

각 식의 row는 위 읽기/계산 결과다. 열 종류는 의미 기준의 목표이며 기존 별칭은 현재다. 열 선택 정렬의 동점·결손 위치는 D-USR-2026-11-16-2를 따른다.

| 규칙 ID | 열 이름·현재 위치 | 종류 | 원본 필드·표시식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-t-alerts-c001"></a>CMP-T-ALERTS-C001 | 알림 / t('wake.view.alerts'); `apps/wake/pages/alerts.js:52` | text | `` row['name'] `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 남은 폭 `` | 알림 목록 행의 name을 web로 넣는다 → 알림 칸에 web을 표시한다(name); 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →알림가 다른 필드 값이거나 web이 잘못 바뀌면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` row['name'] `` 적용(apps/wake/pages/alerts.js:52) | 없음(확인: apps/wake/pages/alerts.js:52) | 고정 없음 → TASK-CMP-T-ALERTS | D-USR-2026-11-16-7; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-alerts-c002"></a>CMP-T-ALERTS-C002 | 상태 / t('wake.al.state'); `apps/wake/pages/alerts.js:53` | status | `` a => alertState(a.state) `` | 상태 우선 | `` 공통 상태 톤 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 'calc(var(--space-16) * 1.5)' ``; fit | → [RULE-TONE](../../rules.md#RULE-TONE) | `` a => alertState(a.state) `` 적용(apps/wake/pages/alerts.js:53) | 상태 열에 kind=status 선언이 없다(apps/wake/pages/alerts.js:53) | 고정 없음 → TASK-CMP-T-ALERTS | D-USR-2026-11-16-7; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-alerts-c003"></a>CMP-T-ALERTS-C003 | 심각도 / t('wake.al.severity'); `apps/wake/pages/alerts.js:54` | text | `` row['severity'] `` | → RULE-SORT | → RULE-TONE | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `'calc(var(--space-16) * 1.2)'`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | severity 원문 분류의 색·실패 판정은 → [RULE-TONE](../../rules.md#RULE-TONE), 사용자 선택 정렬은 → [RULE-SORT](../../rules.md#RULE-SORT) | `` row['severity'] `` 적용(apps/wake/pages/alerts.js:54) | 현재 severity 열에 tone·선택 정렬 연결이 없어 정본 적용 필요 | 고정 없음 → TASK-CMP-T-ALERTS | D-USR-2026-11-16-7; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-alerts-c004"></a>CMP-T-ALERTS-C004 | 대상 / t('wake.al.target'); `apps/wake/pages/alerts.js:55` | text | `` row['target']; muted=true `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `남은 폭`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 알림 목록 행의 target를 Pod/web로 넣는다 → 대상 칸에 Pod/web을 표시한다(target); 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →대상가 다른 필드 값이거나 Pod/web이 잘못 바뀌면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` row['target']; muted=true `` 적용(apps/wake/pages/alerts.js:55) | 없음(확인: apps/wake/pages/alerts.js:55) | 고정 없음 → TASK-CMP-T-ALERTS | D-USR-2026-11-16-7; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-alerts-c005"></a>CMP-T-ALERTS-C005 | 시작 / t('wake.al.start'); `apps/wake/pages/alerts.js:56` | time | `` a => when(a.at, now()) `` | 시각↓ | 시간: muted | → [RULE-TIME](../../rules.md#RULE-TIME) | 유지; `` 'calc(var(--space-40) *.9)' `` | → [RULE-TIME](../../rules.md#RULE-TIME) | `` a => when(a.at, now()) `` 적용(apps/wake/pages/alerts.js:56) | RULE-TIME 렌더 재검증 전 | 고정 없음 → TASK-CMP-T-ALERTS | D-USR-2026-11-16-7; D-USR-2026-11-16-2; D00447; D00776 |
| <a id="cmp-t-alerts-c006"></a>CMP-T-ALERTS-C006 | 인시던트 / t('wake.home.incidents'); `apps/wake/pages/alerts.js:57` | text | `` a => a.incident?.number ?? ''; muted=true `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `'calc(var(--space-16) * 1.4)'`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 알림 목록: incident.number=INC-0042 입력 → 인시던트 칸에 INC-0042 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →다른 알림의 incident 번호를 가져오면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` a => a.incident?.number ?? ''; muted=true `` 적용(apps/wake/pages/alerts.js:57) | 없음(확인: apps/wake/pages/alerts.js:57) | 고정 없음 → TASK-CMP-T-ALERTS | D-USR-2026-11-16-7; D-USR-2026-11-16-2; D00447 |
