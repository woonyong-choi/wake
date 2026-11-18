# AI 작업 기록

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-T-AILOG-01

- 목표: audit.rows에 같은 at과 서로 다른 id의 성공·거부 기록을 넣고 결과 필터를 바꾼다 → audit의 at 내림, 동점 id 오름으로 보이고 결과 필터에 맞는 행만 남긴다. 누가 어떤 대상으로 무엇을 실행했고 결과가 무엇인지 확인한다; [RULE-SORT](../../rules.md#RULE-SORT). 문제 우선: 시간순 유지. 행 이동: 동일 기록 ID의 AI 작업 기록 상세. 검색·거르기: 기간·결과, 요청자·행위·대상 텍스트; 거부 기록을 성공으로 보이거나 동시각 행이 새로고침마다 뒤집히면 실패.
- 현재: dataTable은 필터 결과를 페이지 단위로 잘라 rowKey=id로 렌더링하며 sortAction이 없다(`apps/wake/pages/ailog.js:51`).
- 차이: 열 머리 정렬 동작이 연결되지 않아 선택 열의 오름차순·내림차순 전환이 없다.
- 고정 장치: 고정 없음 → TASK-CMP-T-AILOG
- 출처: D00466; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 행 계산

| 식 | 현재 계산 |
|---|---|
| PER | `` 30 `` |
| transportLabel @33 | `` k => (k === 'all' ? t('wake.ailog.allTransports') : t(`wake.inc.transport.${k}`)) `` |
| all @42 | `` auditIn(snap.rows, windowOf(s.range, now())) `` |
| rows @43 | `` auditFilter(found, { requester: s.requester, transport: s.transport }) `` |
| pages @50 | `` Math.max(1, Math.ceil(rows.length / PER)) `` |
| page @50 | `` Math.min(s.page, pages) `` |
| label @50 | `` t('wake.ailog.record') `` |

### 열 목표와 현재 차이

각 식의 row는 위 읽기/계산 결과다. 열 종류는 의미 기준의 목표이며 기존 별칭은 현재다. 열 선택 정렬의 동점·결손 위치는 D-USR-2026-11-16-2를 따른다.

| 규칙 ID | 열 이름·현재 위치 | 종류 | 원본 필드·표시식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-t-ailog-c001"></a>CMP-T-AILOG-C001 | 시각 / t('wake.inc.record.time'); `apps/wake/pages/ailog.js:52` | time | `` r => when(r.at, now()) `` | 시각↓ | 시간: muted | → [RULE-TIME](../../rules.md#RULE-TIME) | 유지; `` 'calc(var(--space-40) *.9)' `` | → [RULE-TIME](../../rules.md#RULE-TIME) | `` r => when(r.at, now()) `` 적용(apps/wake/pages/ailog.js:52) | RULE-TIME 렌더 재검증 전 | 고정 없음 → TASK-CMP-T-AILOG | D00466; D-USR-2026-11-16-2; D00447; D00776 |
| <a id="cmp-t-ailog-c002"></a>CMP-T-AILOG-C002 | 인시던트 / t('wake.home.incidents'); `apps/wake/pages/ailog.js:53` | text | `` r => r.incidentNumber ?? '' `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 'calc(var(--space-16) * 1.4)' `` | AI 작업 기록: incidentNumber=INC-0042 입력 → 인시던트 칸에 INC-0042 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →사건 번호를 감사 ID로 대체하면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` r => r.incidentNumber ?? '' `` 적용(apps/wake/pages/ailog.js:53) | 없음(확인: apps/wake/pages/ailog.js:53) | 고정 없음 → TASK-CMP-T-AILOG | D00466; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-ailog-c003"></a>CMP-T-AILOG-C003 | 요청 / t('wake.ailog.request'); `apps/wake/pages/ailog.js:54` | text | `` r => html`${requesterMark(r)} ${sourceBadge(t, r)}` `` | 원문↑ | `` 보통 `` | `` r => r.requester.name `` | 유지; `` 'calc(var(--space-40) * 1.5)' `` | AI 작업 기록: requester.kind=human, requester.name=kim, transport=http 입력 → 요청 칸에 kim 아바타·이름과 HTTP 출처 이름표 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →요청자를 실행 모델 이름으로 바꾸면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` r => html`${requesterMark(r)} ${sourceBadge(t, r)}` `` 적용(apps/wake/pages/ailog.js:54) | 없음(확인: apps/wake/pages/ailog.js:54) | 고정 없음 → TASK-CMP-T-AILOG | D00466; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-ailog-c004"></a>CMP-T-AILOG-C004 | 한 일 / t('wake.ailog.what'); `apps/wake/pages/ailog.js:55` | text | `` r => C.statusIcon.render({ kind: 'idle', icon: auditIcon(r), text: auditSummary(t, r) }) `` | 원문↑ | `` 보통 `` | `` r => auditSummary(t, r) `` | 유지; `` 남은 폭 `` | AI 작업 기록: action=read, summary=Pod 로그 읽기 입력 → 한 일 칸에 읽기 아이콘과 Pod 로그 읽기 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →읽기를 승인·실행으로 표시하면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` r => C.statusIcon.render({ kind: 'idle', icon: auditIcon(r), text: auditSummary(t, r) }) `` 적용(apps/wake/pages/ailog.js:55) | 없음(확인: apps/wake/pages/ailog.js:55) | 고정 없음 → TASK-CMP-T-AILOG | D00466; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-ailog-c005"></a>CMP-T-AILOG-C005 | 실행 주체(모델) / t('wake.ailog.execModel'); `apps/wake/pages/ailog.js:56` | text | `` r => auditExec(t, r); muted=true `` | 원문↑ | `` 보통 `` | `` r => auditExec(t, r) `` | 화면 선언: optional, 초기 `'calc(var(--space-40) * 1.2)'`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | AI 작업 기록: executor=local, model=null 입력 → 실행 주체(모델) 칸에 local · 모델 없음 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →없는 모델 이름을 채우면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` r => auditExec(t, r); muted=true `` 적용(apps/wake/pages/ailog.js:56) | 없음(확인: apps/wake/pages/ailog.js:56) | 고정 없음 → TASK-CMP-T-AILOG | D00466; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-ailog-c006"></a>CMP-T-AILOG-C006 | 양 / t('wake.ailog.size'); `apps/wake/pages/ailog.js:57` | number | `` r => auditSize(t, r.size) `` | 수치↓ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `'calc(var(--space-16) * 1.6)'`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | AI 작업 기록: size={unit:lines,n:12} 입력 → 양 칸에 12줄 표시; 표시: 수량 정수와 실제 단위(줄·행·byte) 보존; 중립 tabular-nums  →토큰 수나 건수로 단위를 바꾸면 실패. 전송 byte 수를 로그 줄 수처럼 표시하지 않음. | `` r => auditSize(t, r.size) `` 적용(apps/wake/pages/ailog.js:57) | 없음(확인: apps/wake/pages/ailog.js:57) | 고정 없음 → TASK-CMP-T-AILOG | D00466; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
