# CronJob 목록 표

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-K-CRONJOBS-01

- 목표: spec.suspend=true이고 최근 성공 시각이 없는 CronJob을 조회한다 → Status는 Suspended, Suspend는 True, Last Success는 빈값이다(spec.suspend, status.lastSuccessfulTime). 실행 예정·일시 중단·최근 실행과 활성 Job을 구분한다. → [RULE-SORT](../../rules.md#RULE-SORT). 같은 문제 톤과 문제 없는 행 안에서는 namespace → name → UID 오름차순이며 값이 없으면 맨 뒤에 둔다. 문제 기준은 관련 Job 실패만 확정 문제; schedule 미경과나 의도한 suspend는 실패 아님. 행은 동일 cluster/ns/kind/UID/at의 상세를 연다. 검색은 Name, 필터는 namespace·문제 상태이며 Pod는 Status·Node·Controlled By도 적용한다; Suspended를 실패로 칠하거나 없는 최근 성공을 현재 시각으로 채우면 실패.
- 현재: ROW.cronjobs가 원본 API 필드를 목록 값으로 변환한다(`apps/wake/data/kinds.js:145`); 목록의 `columns`와 `table`은 `apps/wake/pages/resource-list.js:113,143`에 있다.
- 차이: resources 응답 순서를 필터 후 slice하며 문제 우선·UID 동점 정렬이 없다(`apps/wake/pages/resource-list.js:143–150`).
- 고정 장치: 고정 없음 → TASK-CMP-K-CRONJOBS
- 출처: D00450; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 계산의 지역 변수

- `` const s = c.status \|\| {}, suspend = typeof c.spec?.suspend === 'boolean' ? c.spec.suspend : null, active = (s.active \|\| []).length; ``
- `` const status = suspend === true ? st('neutral', 'Suspended') : !c.spec?.schedule ? st('neutral', 'Unknown') : active > 0 ? st('warn', 'Running') : s.lastScheduleTime ? st('ok', 'Scheduled') : st('neutral', 'Never scheduled'); ``

### 열 목표와 현재 차이

정렬 칸은 열 머리 선택 시의 첫 방향이며 반대 방향도 지원한다(D00447). 동점은 표의 namespace/name/UID다. 숨김 숫자는 오른쪽 optional부터 숨기는 순서다. 폭은 현재 선언값으로, 새 고정 폭 승인이 아니다.

| 규칙 ID | 열 이름 | 종류 | 원본 필드·계산식 | 표시 형식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-k-cronjobs-c001"></a>CMP-K-CRONJOBS-C001 | Name | text | `` metadata.name `` | 원문·반올림 없음 | 오름차순(원문) | 보통 | CMP-TABLE-04 | → [RULE-WIDTH](../../rules.md#RULE-WIDTH). | CronJob 목록 표의 metadata.name=web을 넣는다 → Name에 web을 표시한다; 표시: 원문 이름·보통 굵기·중립; 한 줄 말줄임과 잘린 이름 전문; 수치 변환 없음 →Name이 다른 객체의 이름으로 바뀌면 실패. 표시 이름과 상세 이동의 UID를 따로 보존. | `` metadata.name `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-CRONJOBS | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-cronjobs-c002"></a>CMP-K-CRONJOBS-C002 | Namespace | text | `` metadata.namespace `` | 원문·반올림 없음 | 오름차순(원문) | 보조: muted | CMP-TABLE-04 | 6; `` calc(var(--space-16) * 2) ``; muted | CronJob 목록 표의 metadata.namespace=default를 넣는다 → Namespace에 default를 표시한다; 표시: namespace 원문·중립 보조 톤; 문자열 그대로 →Namespace가 다른 객체의 이름으로 바뀌면 실패. default를 빈 값으로 생략하거나 다른 범위 이름을 쓰지 않음. | `` metadata.namespace `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-CRONJOBS | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-cronjobs-c003"></a>CMP-K-CRONJOBS-C003 | Status | status | `` status `` | 원문 상태·상태 아이콘 | 상태 우선순위 | 원본 tone | 원문 상태·사유 | 유지; `` calc(var(--space-16) * 2.5) ``; fit | → [RULE-TONE](../../rules.md#RULE-TONE) | `` status `` 적용(apps/wake/data/kinds.js:145) | 열 정렬 없음; CMP-TABLE-05 | `apps/wake/data/kinds.test.mjs` — `CronJob: 중지·실행 중·마지막 시각은 실제 필드만, 성공 기록 없음은 성공이 아님` | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-cronjobs-c004"></a>CMP-K-CRONJOBS-C004 | Schedule | text | `` c.spec?.schedule \|\| '' `` | 원문·반올림 없음 | 오름차순(원문) | 보통 | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 2.5) `` | CronJob 목록 표: spec.schedule=0 * * * * 입력 → Schedule 칸에 0 * * * * 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →시각 문자열로 추정 변환하면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` c.spec?.schedule \|\| '' `` 적용(apps/wake/data/kinds.js:145) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-CRONJOBS | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-cronjobs-c005"></a>CMP-K-CRONJOBS-C005 | Suspend | text | `` suspend == null ? '' : suspend ? 'True' : 'False' `` | 원문·반올림 없음 | 오름차순(원문) | 보통 | CMP-TABLE-04 | 5; `` calc(var(--space-16) * 1.5) ``; muted | CronJob 목록 표: spec.suspend=true 입력 → Suspend 칸에 True 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →알 수 없는 suspend를 False로 채우면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` suspend == null ? '' : suspend ? 'True' : 'False' `` 적용(apps/wake/data/kinds.js:145) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-CRONJOBS | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-cronjobs-c006"></a>CMP-K-CRONJOBS-C006 | Active | number | `` active `` | 정수·반올림 없음 | 내림차순(원시 수치) | 보통 | CMP-TABLE-04 | 4; `` var(--space-16) `` | CronJob 목록 표: status.active에 Job 참조 두 개 입력 → Active 칸에 2 표시; 표시: 개수 정수·단위 없음·소수 반올림/축약 없음; 중립 tabular-nums →완료된 과거 Job까지 세면 실패. 실제 0을 보존하고 다른 수량의 합계나 비율로 바꾸지 않음. | `` active `` 적용(apps/wake/data/kinds.js:145) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-CRONJOBS | D00450; D-USR-2026-11-16-2; D00447; D-USR-2026-11-16-1; D01033; D01034 |
| <a id="cmp-k-cronjobs-c007"></a>CMP-K-CRONJOBS-C007 | Last Schedule | time | `` s.lastScheduleTime \|\| '' `` | 원문·반올림 없음 | 오름차순(원문) | 시간: muted | CMP-TABLE-04 | 유지; `` calc(var(--space-16) * 2) `` | → [RULE-TIME](../../rules.md#RULE-TIME). 다른 시간대로 표시해도 같은 절대 시각을 보존. | `` s.lastScheduleTime \|\| '' `` 적용(apps/wake/data/kinds.js:145) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-CRONJOBS | D00450; D-USR-2026-11-16-2; D00447; D00776 |
| <a id="cmp-k-cronjobs-c008"></a>CMP-K-CRONJOBS-C008 | Last Success | time | `` s.lastSuccessfulTime \|\| '' `` | 원문·반올림 없음 | 오름차순(원문) | 시간: muted | CMP-TABLE-04 | 3; `` calc(var(--space-40) *.9) `` | → [RULE-TIME](../../rules.md#RULE-TIME). 다른 시간대로 표시해도 같은 절대 시각을 보존. | `` s.lastSuccessfulTime \|\| '' `` 적용(apps/wake/data/kinds.js:145) | 열 정렬 없음; CMP-TABLE-05 | `apps/wake/data/kinds.test.mjs` — `CronJob: 중지·실행 중·마지막 시각은 실제 필드만, 성공 기록 없음은 성공이 아님` | D00450; D-USR-2026-11-16-2; D00447; D00776 |
| <a id="cmp-k-cronjobs-c009"></a>CMP-K-CRONJOBS-C009 | Concurrency Policy | text | `` c.spec?.concurrencyPolicy \|\| '' `` | 원문·반올림 없음 | 오름차순(원문) | 보통 | CMP-TABLE-04 | 2; `` calc(var(--space-16) * 1.5) ``; muted | CronJob 목록 표: spec.concurrencyPolicy=Forbid 입력 → Concurrency Policy 칸에 Forbid 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →현재 실행 수로 정책을 추정하면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` c.spec?.concurrencyPolicy \|\| '' `` 적용(apps/wake/data/kinds.js:145) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-CRONJOBS | D00450; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-k-cronjobs-c010"></a>CMP-K-CRONJOBS-C010 | Age | time | `` age(metadata.creationTimestamp, referenceAt) `` | 나이 s/m/h/d·단위 반올림 | 생성 시각 내림차순 | 시간: muted | 생성 일시·관측 기준시각 | 1; `` var(--space-16) `` | CronJob 목록 표의 creationTimestamp가 referenceAt보다 3분 앞선 객체를 넣는다 → Age에 3m을 표시한다(metadata.creationTimestamp, referenceAt); 표시: 관측 기준 나이: 120초 미만 s, 7200초 미만 m, 172800초 미만 h, 이후 d; 해당 단위 Math.round; 흐린 고정폭 →기준 시각 대신 현재 시계를 써 과거 관측의 Age가 계속 늘어나면 실패. 미래/잘못된 시각은 정상 나이로 환산하지 않음. | `` age(metadata.creationTimestamp, referenceAt) `` 계산: meta(`apps/wake/data/kinds.js:79`) | 열 정렬 없음; CMP-TABLE-05 | 고정 없음 → TASK-CMP-K-CRONJOBS | D00450; D-USR-2026-11-16-2; D00447; D00776 |

### 상세로 전달하는 현재 필드

| 필드 | 현재 계산식 |
|---|---|
| timeZone | `` c.spec?.timeZone \|\| '' `` |
| suspend | `` suspend `` |
| activeJobs | `` (s.active \|\| []).map(ref => ref.name).filter(Boolean).join(', ') `` |
| lastSchedule | `` s.lastScheduleTime ? age(s.lastScheduleTime, now) : '' `` |
| lastSuccess | `` s.lastSuccessfulTime ? age(s.lastSuccessfulTime, now) : '' `` |
| image | `` image(c.spec?.jobTemplate?.spec?.template?.spec) `` |
| conditions | `` conds(c) `` |
