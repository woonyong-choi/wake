# 도구 API 매개변수

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-T-TOOL-API-01

- 목표: route에 /api/search?tag=a&tag=b를 입력하고 요청 매개변수 탭을 연다 → 읽기 API 매개변수를 확인한다. 기본 정렬: API 스키마 선언순, name 동점; 동점 원본의 불변 ID(리소스 namespace/kind/name/UID). 문제 우선: 문제 우선 없음; 입력 필드에 유효성 오류 표시. 이동: 이동 없음, 실제 읽기 요청 실행. 검색·거르기: 선택 API에 종속, 자체 검색 없음. → 동일 키 tag 두 개가 한 행으로 합쳐지거나 POST 변경 요청을 만들면 실패.
- 현재: parameters는 URLSearchParams의 모든 쌍을 id·name·value 행으로 만든다(`apps/wake/pages/tool-api.js:54`).
- 차이: 현재 표는 URL 쿼리 입력 순서이며 API 스키마 선언순 정렬 모델은 없다.
- 고정 장치: 고정 없음 → TASK-CMP-T-TOOL-API
- 출처: D00046; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 열 목표와 현재 차이

| 규칙 ID | 열 이름·현재 위치 | 종류 | 원본 필드·표시식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-t-tool-api-c001"></a>CMP-T-TOOL-API-C001 | t('wake.tool.api.parameter'); `apps/wake/pages/tool-api.js:58` | text | `` row['name'] `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04 `` | 유지; `` 남은 폭 `` | 도구 API 매개변수 행의 name을 web로 넣는다 → parameter 칸에 web을 표시한다(name); 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →parameter가 다른 필드 값이거나 web이 잘못 바뀌면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` row['name'] `` 적용(apps/wake/pages/tool-api.js:58) | 없음(확인: apps/wake/pages/tool-api.js:58) | 고정 없음 → TASK-CMP-T-TOOL-API | D00046; D00447 |
| <a id="cmp-t-tool-api-c002"></a>CMP-T-TOOL-API-C002 | t('wake.tool.api.value'); `apps/wake/pages/tool-api.js:59` | text | `` row['value'] `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04 `` | 유지; `` 남은 폭 `` | 도구 API 매개변수 행의 value를 80%로 넣는다 → value 칸에 80%를 표시한다(value); 표시: 원본 값과 정의된 단위; 숫자는 해당 formatter의 자릿수·중립 →value가 다른 필드 값이거나 80%가 잘못 바뀌면 실패. 단위 없는 문자열을 임의 비율이나 화폐로 바꾸지 않음. | `` row['value'] `` 적용(apps/wake/pages/tool-api.js:59) | 없음(확인: apps/wake/pages/tool-api.js:59) | 고정 없음 → TASK-CMP-T-TOOL-API | D00046; D00447 |
