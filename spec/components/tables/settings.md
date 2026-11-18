# 설정 목록의 목록형 부품

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-LIST-SETTINGS

- 목표: 외관 설정을 바꾸고 설정 화면을 닫았다 다시 연다 → 선택한 설정값이 해당 행 끝 컨트롤 하나에 표시되고 다시 열어도 같은 값이다(ctx.settings). 행 끝 주 컨트롤 하나와 설명을 제공하고 변경한 설정의 실제 효과·저장·복원을 확인한다. 상태는 CMP-TABLE-02, 입력·접근성은 controls 계약을 따른다. → 같은 행 끝에 주 컨트롤이 둘이거나 저장된 선택과 복원된 선택이 다르면 실패.
- 현재: bootPage는 공통 createSettingsPage 결과를 withDisclosures로 감싼다(`apps/wake/pages/settings.js:5`).
- 차이: 없음(확인: apps/wake/pages/settings.js:5; 공통 설정 페이지 위임)
- 고정 장치: 고정 없음 → TASK-CMP-LIST-SETTINGS
- 출처: D01020; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 현재 호출과 입력

| 위치 | 부품·읽기 |
|---|---|
| `apps/wake/pages/settings.js` |  |
