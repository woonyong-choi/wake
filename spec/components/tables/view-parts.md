# 표 로딩 뼈대

[공통 표 계약](../table-contract.md)의 CMP-TABLE-01~08을 상속한다. 각 열의 현재·차이·고정 장치·출처는 아래 열 계약에 적는다. 정렬은 D-USR-2026-11-16-2, 문제 판단·검색 확장은 D-USR-2026-11-16-7의 기본값을 따른다.

## CMP-T-VIEW-PARTS-01

- 목표: columns에 number·time·mono·fit 속성을 넣어 skeletonTable(columns,8)을 그린다 → 뼈대 8행의 열 머리·폭·숫자 정렬은 전달한 columns의 완료 표와 같다. 로딩 중에도 완료 표의 열 틀을 유지한다. 기본 정렬: 입력 columns 순서; 동점 원본의 불변 ID(리소스 namespace/kind/name/UID). 문제 우선: 해당 없음. 이동: 가짜 행 이동 금지. 검색·거르기: 상위 화면 검색 조건 유지. → 로딩 전후 열 폭·숫자 정렬이 바뀌거나 뼈대 행이 상세 이동을 만들면 실패.
- 현재: skeletonTable은 8행과 label·width·optional·value·muted만 복사한다(`apps/wake/pages/view-parts.js:81`).
- 차이: kind·time·mono·fit을 복사하지 않아 완료 표와 글꼴·열 폭 조건이 달라진다.
- 고정 장치: 고정 없음 → TASK-CMP-T-VIEW-PARTS
- 출처: D01027; D00447; D01051. 그 밖의 검색·필터 기본값은 D-USR-2026-11-16-7.

### 열 목표와 현재 차이

| 규칙 ID | 열 이름·현재 위치 | 종류 | 원본 필드·표시식 | 정렬 | 톤 조건 | 툴팁 | 숨김·현재 폭 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| <a id="cmp-t-view-parts-c001"></a>CMP-T-VIEW-PARTS-C001 | c.label; `apps/wake/pages/view-parts.js:82` | text | `` () => C.skeleton.render({ width: c.value ? 'calc(var(--space-4) * 2)' : '60%', height: '1lh' }); muted=c.muted `` | 원문↑ | `` 보통 `` | `` CMP-TABLE-04 `` | 유지; `` c.width `` | Name·CPU 열 두 개와 n=8을 skeletonTable에 전달한다 → 두 머리와 8개 뼈대 행을 같은 columns.width에 표시한다; 표시: 해당 원본 필드의 문자열 보존·중립 일반체; 단위 변환·반올림 없음 →완료 표에서 열 경계가 이동하거나 가짜 값이 보이면 실패. 다른 필드의 표시식이나 상태색을 빌려 쓰지 않음. | `` () => C.skeleton.render({ width: c.value ? 'calc(var(--space-4) * 2)' : '60%', height: '1lh' }); muted=c.muted `` 적용(apps/wake/pages/view-parts.js:82) | kind·time·mono·fit 전달 누락 | 고정 없음 → TASK-CMP-T-VIEW-PARTS | D01027 |
