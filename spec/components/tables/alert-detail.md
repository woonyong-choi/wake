# 알림 상세 수신처와 이력

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-T-ALERT-DETAIL-01

- 목표: alerts 서비스의 같은 alert ID에 receivers 두 개와 같은 시각의 상태 전환 두 개를 넣고 상세를 연다 → 수신처와 상태 전환 이력을 구분한다. 기본 정렬: 수신처 이름 오름차순; 이력 at 내림차순; 동점: 원본의 불변 ID 오름차순(리소스는 namespace/kind/name/UID, RBAC는 resource/scope/verbs). 문제 우선: 이력 시간 순서 유지, 실패 전환만 톤. 행 이동: 수신처는 이동 없음; 관련 인시던트는 실제 링크. 검색·거르기: 상위 알림 ID에 종속, 표 자체 검색 없음. → 수신처가 상태 전환 이력에 섞이거나 이전 firing을 현재 정상 근거로 쓰면 실패.
- 현재: receiver 표는 a.receivers의 순서를 유지하고 이력은 same.slice(0,10)을 표시한다(`apps/wake/pages/alert-detail.js:86`).
- 차이: 수신처 이름 정렬과 같은 시각의 이력 ID 정렬을 렌더 경로에서 적용하지 않는다.
- 고정 장치: 고정 없음 → TASK-CMP-T-ALERT-DETAIL
- 출처: D00090; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 행 계산

| 식 | 현재 계산 |
|---|---|
| rows @25 | `` () => alertList({ ...snap, incidents, stale: { prometheus: !!sources.of('prometheus', now())?.stale, alertmanager: !!sources.of('alertmanager', now())?.stale } }) `` |
| items @58 | `` th ? [{ id: 'th', label: t('wake.al.threshold'), value: String(th.value) }] : [] `` |
| label @60 | `` axisTime(from, to) `` |
| target @71 | `` Object.keys(PLURAL).find(k => a.labels[k]) `` |
| labels @83 | `` Object.entries(a.labels) `` |
| labelCard @83 | `` card('labels', 'Labels', [{ id: 'n', label: '', value: num(labels.length) }], html`${labels.map(([k, v]) => C.badge.render({ label: `${k}=${v}`, tone: 'neutral', size: 'sm' }))}`) `` |

### 열 목표와 현재 차이

각 식의 row는 위 읽기/계산 결과다. 열 종류는 의미 기준의 목표이며 기존 별칭은 현재다. 열 선택 정렬의 동점·결손 위치는 D-USR-2026-11-16-2를 따른다.

| 규칙 ID | 열 이름·현재 위치 | 종류 | 원본 필드·표시식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-t-alert-detail-c001"></a>CMP-T-ALERT-DETAIL-C001 | 'receiver'; `apps/wake/pages/alert-detail.js:86` | text | `` row['r'] `` | 원문↑ | 보조: muted | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 남은 폭 `` | 알림 상세 수신처와 이력 행의 r를 on-call로 넣는다 → receiver 칸에 on-call를 표시한다(r); 표시: 원본 공급자/수신처 이름·중립 보조 톤 →receiver가 다른 필드 값이거나 on-call가 잘못 바뀌면 실패. 읽기 성공만으로 수신 또는 발송 성공색을 붙이지 않음. | `` row['r'] `` 적용(apps/wake/pages/alert-detail.js:86) | 없음(확인: apps/wake/pages/alert-detail.js:86) | 고정 없음 → TASK-CMP-T-ALERT-DETAIL | D-USR-2026-11-16-7; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-alert-detail-c002"></a>CMP-T-ALERT-DETAIL-C002 | 상태 / t('wake.al.state'); `apps/wake/pages/alert-detail.js:89` | status | `` x => alertState(x.state) `` | 상태 우선 | `` 공통 상태 톤 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 'calc(var(--space-16) * 1.5)' `` | → [RULE-TONE](../../rules.md#RULE-TONE) | `` x => alertState(x.state) `` 적용(apps/wake/pages/alert-detail.js:89) | 상태 열에 kind=status 선언이 없다(apps/wake/pages/alert-detail.js:89) | 고정 없음 → TASK-CMP-T-ALERT-DETAIL | D-USR-2026-11-16-7; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-alert-detail-c003"></a>CMP-T-ALERT-DETAIL-C003 | 시작 / t('wake.al.start'); `apps/wake/pages/alert-detail.js:90` | time | `` x => when(x.at, now()) `` | 시각↓ | 시간: muted | → [RULE-TIME](../../rules.md#RULE-TIME) | 유지; `` 'calc(var(--space-40) *.9)' `` | → [RULE-TIME](../../rules.md#RULE-TIME) | `` x => when(x.at, now()) `` 적용(apps/wake/pages/alert-detail.js:90) | RULE-TIME 렌더 재검증 전 | 고정 없음 → TASK-CMP-T-ALERT-DETAIL | D-USR-2026-11-16-7; D-USR-2026-11-16-2; D00447; D00776 |
| <a id="cmp-t-alert-detail-c004"></a>CMP-T-ALERT-DETAIL-C004 | 지속 / t('wake.al.duration'); `apps/wake/pages/alert-detail.js:91` | number | `` x => (x.end ? duration(t, x.end - x.at) : t('wake.al.ongoing')) `` | 수치↓ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 남은 폭 `` | 알림 상세 수신처와 이력: took=180000ms 또는 end-at=180000ms 입력 → 지속 칸에 3분 표시; 표시: 초 단위 반올림을 공통 duration의 분·초/시간·분으로 표시; 흐린 고정폭  →밀리초를 초로 해석해 3000분으로 표시하면 실패. 알림 발생 기간과 조회 지연 시간을 합치지 않음. | `` x => (x.end ? duration(t, x.end - x.at) : t('wake.al.ongoing')) `` 적용(apps/wake/pages/alert-detail.js:91) | 없음(확인: apps/wake/pages/alert-detail.js:91) | 고정 없음 → TASK-CMP-T-ALERT-DETAIL | D-USR-2026-11-16-7; D-USR-2026-11-16-2; D00447 |
