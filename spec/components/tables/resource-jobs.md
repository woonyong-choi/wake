# Job 목록 표

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-K-JOBS-01

- 목표: status.failed=1, succeeded=0, spec.completions=1인 Job을 조회한다 → 실패 시도 1, 성공 0, 목표 1을 구분하고 최종 Failed는 conditions로만 확정한다(status, spec.completions). 실패·진행·완료와 실행 시간을 판단한다. → [RULE-SORT](../../rules.md#RULE-SORT). 같은 문제 톤과 문제 없는 행 안에서는 namespace → name → UID 오름차순이며 값이 없으면 맨 뒤에 둔다. 문제 우선: Failed 조건 또는 failed > 0; 완료는 문제 아님. 검색 Name; 필터 namespace·문제 상태; Pod만 Status·Node·Controlled By 추가. 동일 cluster/ns/kind/UID/at 상세로 이동한다; 실패 수를 완료 수로 합치거나 실패 Job을 Completed로 표시하면 실패.
- 현재: ROW.jobs가 원본 API 필드를 목록 값으로 변환한다(`apps/wake/data/kinds.js:131`); 목록의 `columns`와 `table`은 `apps/wake/pages/resource-list.js:113,143`에 있다.
- 차이: resources 응답 순서를 필터 후 slice하며 문제 우선·UID 동점 정렬이 없다(`apps/wake/pages/resource-list.js:143–150`).
- 고정 장치: 고정 없음 → TASK-CMP-K-JOBS
- 출처: D00084; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 계산의 지역 변수

- `` const s = j.status \|\| {}, want = j.spec?.completions ?? 1, failed = (s.conditions \|\| []).some(c => c.type === 'Failed' && c.status === 'True'), done = (s.conditions \|\| []).some(c => c.type === 'Complete' && c.status === 'True'); ``
- `` const dur = s.startTime ? Math.round(((s.completionTime ? Date.parse(s.completionTime) : now) - Date.parse(s.startTime)) / 1000) : null; ``
- `` const suspended = j.spec?.suspend === true \|\| (s.conditions \|\| []).some(c => c.type === 'Suspended' && c.status === 'True'); ``

### 열 목표와 현재 차이

정렬 방향은 열 머리를 처음 선택한 방향이며 반대 방향도 지원한다(D00447). 동점은 표 계약의 namespace/name/UID다. 숨김 숫자는 오른쪽 optional부터 제거하는 순서다.

| 규칙 ID | 열 이름 | 종류 | 원본 필드·계산식 | 표시 형식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-k-jobs-c001"></a>CMP-K-JOBS-C001 | Name | text | `` metadata.name `` | 원문·반올림 없음 | 원문↑ | 보통 | CMP-TABLE-04 | → [RULE-WIDTH](../../rules.md#RULE-WIDTH). | Job 목록 표의 metadata.name=web을 넣는다 → Name에 web을 표시한다; 표시: 원문 이름·보통 굵기·중립; 한 줄 말줄임과 잘린 이름 전문; 수치 변환 없음 →Name이 다른 객체의 이름으로 바뀌면 실패. 표시 이름과 상세 이동의 UID를 따로 보존. | `` metadata.name `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-JOBS | D00084; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-jobs-c002"></a>CMP-K-JOBS-C002 | Namespace | text | `` metadata.namespace `` | 원문·반올림 없음 | 원문↑ | 보조: muted | CMP-TABLE-04 | 5; `` calc(var(--space-16) * 2) ``; muted | Job 목록 표의 metadata.namespace=default를 넣는다 → Namespace에 default를 표시한다; 표시: namespace 원문·중립 보조 톤; 문자열 그대로 →Namespace가 다른 객체의 이름으로 바뀌면 실패. default를 빈 값으로 생략하거나 다른 범위 이름을 쓰지 않음. | `` metadata.namespace `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-JOBS | D00084; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-jobs-c003"></a>CMP-K-JOBS-C003 | Status | status | `` failed ? st('danger', 'Failed') : done ? st('ok', 'Complete') : suspended ? st('neutral', 'Suspended') : st('warn', 'Running') `` | 원문 상태·상태 아이콘 | 상태 우선 | 원본 tone | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 2) ``; fit | → [RULE-TONE](../../rules.md#RULE-TONE) | `` failed ? st('danger', 'Failed') : done ? st('ok', 'Complete') : suspended ? st('neutral', 'Suspended') : st('warn', 'Running') `` 적용(apps/wake/data/kinds.js:131) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-JOBS | D00084; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-jobs-c004"></a>CMP-K-JOBS-C004 | Succeeded | number | `` s.succeeded \|\| 0 `` | 정수·반올림 없음 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 1.5) `` | Job 목록 표: succeeded=3 입력 → Succeeded 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` s.succeeded \|\| 0 `` 적용(apps/wake/data/kinds.js:131) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-JOBS | D00084; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-jobs-c005"></a>CMP-K-JOBS-C005 | Completions | number | `` want `` | 정수·반올림 없음 | 원시 수치↓ | 보통 | CMP-TABLE-04 | 4; `` calc(var(--space-16) * 1.5) `` | Job 목록 표: spec.completions=3 입력 → Completions 칸에 3 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →해당 필드의 3을 다른 열의 개수로 바꾸면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` want `` 적용(apps/wake/data/kinds.js:131) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-JOBS | D00084; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-jobs-c006"></a>CMP-K-JOBS-C006 | Duration | number | `` !Number.isFinite(dur) \|\| dur < 0 ? '' : dur < 120 ? `${dur}s` : `${Math.round(dur / 60)}m` `` | 정수·반올림 없음 | 원시 수치↓ | 시간: muted | CMP-TABLE-04 | 3; `` calc(var(--space-16) * 2) `` | Job 목록 표: startTime과 completionTime 차이가 180초 입력 → Duration 칸에 3m 표시; 표시: 경과 시간의 s/m/h 단위; 관측 기준 경과값·흐린 고정폭 →초 180을 분 180m으로 표시하면 실패. 완료한 실행의 시간이 갱신마다 늘지 않음. | `` !Number.isFinite(dur) \|\| dur < 0 ? '' : dur < 120 ? `${dur}s` : `${Math.round(dur / 60)}m` `` 적용(apps/wake/data/kinds.js:131) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-JOBS | D00084; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-jobs-c007"></a>CMP-K-JOBS-C007 | Reason | text | `` (s.conditions \|\| []).find(c => c.type === 'Failed' && c.status === 'True')?.reason \|\| '' `` | 원문·반올림 없음 | 원문↑ | 보조: muted | CMP-TABLE-04 | 2; `` calc(var(--space-16) * 2.5) ``; muted | Job 목록 표: status.conditions에 type=Failed,status=True,reason=BackoffLimitExceeded 입력 → Reason 칸에 BackoffLimitExceeded 표시; 표시: Reason·종료 사유 원문과 Exit 정수·중립 보조 톤 →성공 조건의 사유를 실패 칸에 넣으면 실패. 현재 상태로 마지막 종료를 덮거나 사유만으로 별도 상태색을 만들지 않음. | `` (s.conditions \|\| []).find(c => c.type === 'Failed' && c.status === 'True')?.reason \|\| '' `` 적용(apps/wake/data/kinds.js:131) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-JOBS | D00084; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-jobs-c008"></a>CMP-K-JOBS-C008 | Start Time | time | `` s.startTime \|\| '' `` | 원문·반올림 없음 | 원문↑ | 시간: muted | CMP-TABLE-04 | 1; `` calc(var(--space-16) * 2) `` | → [RULE-TIME](../../rules.md#RULE-TIME). 다른 시간대로 표시해도 같은 절대 시각을 보존. | `` s.startTime \|\| '' `` 적용(apps/wake/data/kinds.js:131) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-JOBS | D00084; D-USR-2026-11-16-2; D00447; D00776 |

### 상세로 전달하는 현재 필드

| 필드 | 현재 계산식 |
|---|---|
| completionTime | `` s.completionTime \|\| '' `` |
| failedPods | `` s.failed \|\| 0 `` |
| image | `` image(j.spec?.template?.spec) `` |
| selector | `` j.spec?.selector?.matchLabels \|\| {} `` |
| conditions | `` conds(j) `` |
