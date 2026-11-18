# 인시던트 범위와 감사

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 숫자 정렬과 기본 정렬은 D-USR-2026-11-16-1·2를 따른다. 그 밖의 검색·필터 추천안은 D-USR-2026-11-16-7의 기본값이다. 열의 값·정렬·톤·툴팁·폭은 아래 열 계약에 적는다. 공통 정렬·빈 값 처리는 CMP-TABLE-01~08을 참조한다.

## CMP-T-INCIDENT-DETAIL-01

- 목표: incident 서비스에 이름은 같고 namespace·UID가 다른 영향 대상 둘과 승인 감사 둘을 넣는다 → 영향 범위의 대상과 승인·실행 감사를 분리해 읽는다; [RULE-SORT](../../rules.md#RULE-SORT). 문제 우선: 대상만 위험·주의 우선, 감사는 시간순. 행 이동: 같은 UID의 리소스 상세 또는 감사 기록 상세. 검색·거르기: 인시던트 scope와 기간, 대상 이름·감사 요약 검색; [RULE-APPROVAL](../../rules.md#RULE-APPROVAL).
- 현재: scope 표는 행 id를 키로 쓰며 wake.inc.row로 이동한다(`apps/wake/pages/incident-detail.js:79`).
- 차이: scope 행 식별자에 namespace·UID가 빠져 같은 이름의 다른 대상을 구분하지 못한다.
- 고정 장치: 고정 없음 → TASK-CMP-T-INCIDENT-DETAIL
- 출처: D00092 D00093; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 행 계산

| 식 | 현재 계산 |
|---|---|
| counts @75 | `` rows => ({ bad: rows.filter(r => r.status[0] === 'danger').length, warn: rows.filter(r => r.status[0] === 'warn').length }) `` |
| rows @77 | `` inc.scope.map(r => ({ ...r, id: `${pluralOf(r.kind) ?? r.kind}/${r.name}` })) `` |
| rows @127 | `` inc.audit.map((r, i) => ({ ...r, id: `a${i}` })) `` |

### 열 목표와 현재 차이

각 식의 row는 위 읽기/계산 결과다. 열 종류는 의미 기준의 목표이며 기존 별칭은 현재다. 열 선택 정렬의 동점·결손 위치는 D-USR-2026-11-16-2를 따른다.

| 규칙 ID | 열 이름·현재 위치 | 종류 | 원본 필드·표시식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-t-incident-detail-c001"></a>CMP-T-INCIDENT-DETAIL-C001 | 'Name'; `apps/wake/pages/incident-detail.js:80` | text | `` row['name']; lead=r => ({ icon: KIND_LIST.find(k => k.kind === r.kind)?.icon }) `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 남은 폭 `` | 인시던트 범위와 감사 행의 name을 web로 넣는다 → Name 칸에 web을 표시한다(name); 표시: 원문 이름·보통 굵기·중립; 한 줄 말줄임과 잘린 이름 전문; 수치 변환 없음 →Name이 다른 필드 값이거나 web이 잘못 바뀌면 실패. 표시 이름과 상세 이동의 UID를 따로 보존. | `` row['name']; lead=r => ({ icon: KIND_LIST.find(k => k.kind === r.kind)?.icon }) `` 적용(apps/wake/pages/incident-detail.js:80) | 없음(확인: apps/wake/pages/incident-detail.js:80) | 고정 없음 → TASK-CMP-T-INCIDENT-DETAIL | D00092; D00093; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-incident-detail-c002"></a>CMP-T-INCIDENT-DETAIL-C002 | 'Status'; `apps/wake/pages/incident-detail.js:81` | status | `` r => status(r.status) `` | 상태 우선 | `` 공통 상태 톤 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 남은 폭 ``; fit | → [RULE-TONE](../../rules.md#RULE-TONE) | `` r => status(r.status) `` 적용(apps/wake/pages/incident-detail.js:81) | Status 열에 kind=status 선언이 없다(apps/wake/pages/incident-detail.js:81) | 고정 없음 → TASK-CMP-T-INCIDENT-DETAIL | D00092; D00093; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-incident-detail-c003"></a>CMP-T-INCIDENT-DETAIL-C003 | 최근 변경 / t('wake.inc.scope.change'); `apps/wake/pages/incident-detail.js:83` | text | `` r => (r.change ? `${r.change.text} ${when(r.change.at, inc.now)}` : ''); muted=true `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `'calc(var(--space-16) * 2.4)'`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 인시던트 범위에 change.text=이미지 변경, change.at=2026-11-17T01:00:00Z를 넣는다. 변경 요약과 시각의 분리·승인 상태는 [SRE-T-SCOPE](../../sre.md#sre-t-scope-영향-대상-표)를 따른다. 다른 사건의 변경을 붙이면 실패. | `` r => (r.change ? `${r.change.text} ${when(r.change.at, inc.now)}` : ''); muted=true `` 적용(apps/wake/pages/incident-detail.js:83) | 현재는 요약과 시각을 한 셀로 합친다. 별도 시각 열은 SRE-T-SCOPE의 문서 기본값이며 개별 화면 승인 기록은 없음 | 고정 없음 → TASK-CMP-T-INCIDENT-DETAIL | D00092; D00093; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-incident-detail-c004"></a>CMP-T-INCIDENT-DETAIL-C004 | one ? `${t('wake.inc.record.time')} · ${ymd(rows[0].at)}` : t('wake.inc.record.time'); `apps/wake/pages/incident-detail.js:129` | time | `` r => (one ? hms(r.at) : `${ymd(r.at)} ${hms(r.at)}`) `` | 시각↓ | 시간: muted | → [RULE-TIME](../../rules.md#RULE-TIME) | 유지; `` one ? 'calc(var(--space-16) * 2)' : 'calc(var(--space-40) * 1.1)' `` | → [RULE-TIME](../../rules.md#RULE-TIME) | `` r => (one ? hms(r.at) : `${ymd(r.at)} ${hms(r.at)}`) `` 적용(apps/wake/pages/incident-detail.js:129) | RULE-TIME 렌더 재검증 전 | 고정 없음 → TASK-CMP-T-INCIDENT-DETAIL | D00092; D00093; D-USR-2026-11-16-2; D00447; D00776 |
| <a id="cmp-t-incident-detail-c005"></a>CMP-T-INCIDENT-DETAIL-C005 | 누가 · 무엇 / t('wake.inc.record.who'); `apps/wake/pages/incident-detail.js:130` | text | `` r => html`${requesterMark(r)} ${auditSummary(t, r)} ${sourceBadge(t, r)}` `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 유지; `` 남은 폭 `` | 인시던트 범위와 감사: requester.name=kim, summary=조치 거부, transport=http 입력 → 누가 · 무엇 칸에 kim · 조치 거부 · HTTP 표시; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →거부를 실제 조치 실행으로 바꾸면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` r => html`${requesterMark(r)} ${auditSummary(t, r)} ${sourceBadge(t, r)}` `` 적용(apps/wake/pages/incident-detail.js:130) | 없음(확인: apps/wake/pages/incident-detail.js:130) | 고정 없음 → TASK-CMP-T-INCIDENT-DETAIL | D00092; D00093; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-incident-detail-c006"></a>CMP-T-INCIDENT-DETAIL-C006 | 권한 / t('wake.inc.record.perm'); `apps/wake/pages/incident-detail.js:131` | text | `` row['permission']; muted=true `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04; rich cell은 원문 tip 필요 `` | 화면 선언: optional, 초기 `'calc(var(--space-40) * 1.4)'`; → [RULE-WIDTH](../../rules.md#RULE-WIDTH) | 인시던트 범위와 감사 행의 permission를 sample-permission로 넣는다 → 권한 칸에 sample-permission를 표시한다(permission); 표시: 저장된 권한 원문·중립; 승인 상태와 별도 →권한가 다른 필드 값이거나 sample-permission가 잘못 바뀌면 실패. read를 실행 승인으로 해석하지 않음. | `` row['permission']; muted=true `` 적용(apps/wake/pages/incident-detail.js:131) | 없음(확인: apps/wake/pages/incident-detail.js:131) | 고정 없음 → TASK-CMP-T-INCIDENT-DETAIL | D00092; D00093; D-USR-2026-11-16-2; D00447 |
