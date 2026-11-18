# 도구 상세 오류

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-T-TOOL-DETAIL-01

- 목표: toolChecks.errors에 날짜가 다른 두 오류를 넣고 상세의 최근 오류를 편다 → 실제 연결 오류의 시각과 원문을 확인한다; [RULE-SORT](../../rules.md#RULE-SORT). 문제 우선: 시간순 유지. 이동: 이동 없음, 연결 재시도는 별도 동작. 검색·거르기: 선택 도구에 종속, 자체 검색 없음; 날짜가 다른 오류를 시분초만으로 구별하게 하거나 최신 오류가 아래로 가면 실패.
- 현재: errs는 24시간 checks 오류와 flowFail을 이어 붙이고 hms(e.at)만 출력한다(`apps/wake/pages/tool-detail.js:56`).
- 차이: 오류 표에 날짜·연도가 없고 합친 행의 최신순·불변 키 정렬도 없다.
- 고정 장치: 고정 없음 → TASK-CMP-T-TOOL-DETAIL
- 출처: D00776 D-USR-2026-11-16-2; D-USR-2026-11-16-2; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 열 목표와 현재 차이

| 규칙 ID | 열 이름·현재 위치 | 종류 | 원본 필드·표시식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-t-tool-detail-c001"></a>CMP-T-TOOL-DETAIL-C001 | t('wake.inc.record.time'); `apps/wake/pages/tool-detail.js:59` | time | `` e => (e.at ? hms(e.at) : '') `` | 시각↓ | 시간: muted | → [RULE-TIME](../../rules.md#RULE-TIME) | 유지; `` 'calc(var(--space-16) * 1.4)' `` | → [RULE-TIME](../../rules.md#RULE-TIME) | `` e => (e.at ? hms(e.at) : '') `` 적용(apps/wake/pages/tool-detail.js:59) | hms만 출력하여 날짜·연도 누락 | 고정 없음 → TASK-CMP-T-TOOL-DETAIL | D00776; D-USR-2026-11-16-2; D00447 |
| <a id="cmp-t-tool-detail-c002"></a>CMP-T-TOOL-DETAIL-C002 | t('wake.tool.error'); `apps/wake/pages/tool-detail.js:60` | mono | `` row['text'] `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04 `` | 유지; `` 남은 폭 `` | 도구 상세 오류 행의 text를 read denied로 넣는다 → error 칸에 read denied를 표시한다(text); 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →error가 다른 필드 값이거나 read denied가 잘못 바뀌면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` row['text'] `` 적용(apps/wake/pages/tool-detail.js:60) | 없음(확인: apps/wake/pages/tool-detail.js:60) | 고정 없음 → TASK-CMP-T-TOOL-DETAIL | D00776; D-USR-2026-11-16-2; D00447 |
