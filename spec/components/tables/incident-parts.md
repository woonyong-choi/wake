# 인시던트 목록

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-T-INCIDENT-PARTS-01

- 목표: 같은 기간에 미해결 warning, 해결 critical, 미해결 critical 사건을 넣는다 → 미해결 critical, 미해결 warning, 해결 critical 순서로 표시한다(incidents 응답). 발생·조치·결과·걸린 시간을 같은 인시던트로 대조한다. → [RULE-SORT](../../rules.md#RULE-SORT). 문제 우선: 미해결 사건을 먼저 두고 완료 기록은 시간순. 행 이동: 동일 인시던트 ID의 작업면. 검색·거르기: 제목·번호·대상 검색, 결과·기간. → 해결 critical이 미해결 사건보다 먼저이거나 클릭한 사건과 작업면 ID가 다르면 실패.
- 현재: incidentsTable은 입력 rows를 그대로 dataTable에 전달한다(`apps/wake/pages/incident-parts.js:98`).
- 차이: 표 렌더러에 미해결·심각도·감지 시각·ID 정렬이 없다.
- 고정 장치: 고정 없음 → TASK-CMP-T-INCIDENT-PARTS
- 출처: D00092 D-USR-2026-11-16-7; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 행 계산

| 식 | 현재 계산 |
|---|---|
| label | `` [kind, e.kind === 'events' ? '' : name, third].filter(Boolean).join(' · ') `` |
| sourceLabel @82 | `` (t, r) => sourceParts(r).filter(x => x !== r.requester?.name).map(x => (x === r.transport ? t(`wake.inc.transport.${x}`) : x)).join(' · ') `` |
| filters @116 | `` [['all', null], ...[...new Set(inRange.map(r => r.result))].map(code => [code, code])] `` |
| rows @117 | `` inRange.filter(r => match(r) && (st.result === 'all' \|\| r.result === st.result)) `` |
| per @117 | `` 20 `` |
| pages @117 | `` Math.max(1, Math.ceil(rows.length / per)) `` |
| page @117 | `` Math.min(st.page \|\| 1, pages) `` |
| openRows @123 | `` open.filter(match) `` |

### 열 목표와 현재 차이

각 식의 row는 위 읽기/계산 결과다. 열 종류는 의미 기준의 목표이며 기존 별칭은 현재다. 열 선택 정렬의 동점·결손 위치는 D-USR-2026-11-16-2를 따른다.

| 규칙 ID | 열 이름·현재 위치 | 종류 | 원본 필드·표시식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-t-incident-parts-c001"></a>CMP-T-INCIDENT-PARTS-C001 | 날짜 / t('wake.inc.list.date'); `apps/wake/pages/incident-parts.js:99` | time | `` r => ymd(r.at) `` | 시각↓ | 시간: muted | → [RULE-TIME](../../rules.md#RULE-TIME) | 유지; `` 'calc(var(--space-16) * 1.5)' `` | → [RULE-TIME](../../rules.md#RULE-TIME) | `` r => ymd(r.at) `` 적용(apps/wake/pages/incident-parts.js:99) | RULE-TIME 렌더 재검증 전 | 고정 없음 → TASK-CMP-T-INCIDENT-PARTS | D00092; D-USR-2026-11-16-7; D00447; D00776 |
| <a id="cmp-t-incident-parts-c002"></a>CMP-T-INCIDENT-PARTS-C002 | 인시던트 / t('wake.home.incidents'); `apps/wake/pages/incident-parts.js:100` | text | `` r => r.title `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 남은 폭 `` | 인시던트 목록: title=web 재시작 증가 입력 → 인시던트 칸에 web 재시작 증가 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →번호만 표시해 제목을 잃으면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` r => r.title `` 적용(apps/wake/pages/incident-parts.js:100) | 없음(확인: apps/wake/pages/incident-parts.js:100) | 고정 없음 → TASK-CMP-T-INCIDENT-PARTS | D00092; D-USR-2026-11-16-7; D00447 |
| <a id="cmp-t-incident-parts-c003"></a>CMP-T-INCIDENT-PARTS-C003 | 조치 / t('wake.inc.stage.act'); `apps/wake/pages/incident-parts.js:101` | text | `` row['action']; muted=true `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `남은 폭`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 인시던트 목록 행의 action를 읽기로 넣는다 → 조치 칸에 읽기를 표시한다(action); 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →조치가 다른 필드 값이거나 읽기가 잘못 바뀌면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` row['action']; muted=true `` 적용(apps/wake/pages/incident-parts.js:101) | 없음(확인: apps/wake/pages/incident-parts.js:101) | 고정 없음 → TASK-CMP-T-INCIDENT-PARTS | D00092; D-USR-2026-11-16-7; D00447 |
| <a id="cmp-t-incident-parts-c004"></a>CMP-T-INCIDENT-PARTS-C004 | 결과 / t('wake.inc.list.result'); `apps/wake/pages/incident-parts.js:102` | status | `` r => resultStatus(t, r.result) `` | 상태 우선 | `` 공통 상태 톤 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `남은 폭`, fit; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | → [RULE-TONE](../../rules.md#RULE-TONE) | `` r => resultStatus(t, r.result) `` 적용(apps/wake/pages/incident-parts.js:102) | 결과 열에 kind=status 선언이 없다(apps/wake/pages/incident-parts.js:102) | 고정 없음 → TASK-CMP-T-INCIDENT-PARTS | D00092; D-USR-2026-11-16-7; D00447 |
| <a id="cmp-t-incident-parts-c005"></a>CMP-T-INCIDENT-PARTS-C005 | 걸린 시간 / t('wake.inc.list.took'); `apps/wake/pages/incident-parts.js:103` | number | `` r => duration(t, r.took) `` | 수치↓ | 시간: muted | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 'calc(var(--space-16) * 1.2)' `` | 인시던트 목록: took=180000ms 또는 end-at=180000ms 입력 → 걸린 시간 칸에 3분 표시; 표시: 초 반올림 후 1분 미만 초, 1시간 미만 분·초, 이후 시간·분; 흐린 고정폭  →밀리초를 초로 해석해 3000분으로 표시하면 실패. 복구가 끝난 사건의 경과 시간을 현재 시계로 계속 늘리지 않음. | `` r => duration(t, r.took) `` 적용(apps/wake/pages/incident-parts.js:103) | 없음(확인: apps/wake/pages/incident-parts.js:103) | 고정 없음 → TASK-CMP-T-INCIDENT-PARTS | D00092; D-USR-2026-11-16-7; D00447; D-USR-2026-11-16-1; D01033; D01034 |
