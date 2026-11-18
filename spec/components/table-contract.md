# 표 공통 계약

각 화면 표의 모든 열·행은 이 계약을 상속한다. 아래 수치는 현재 구현값 또는 명시된 수용 기준이며 새 디자인 승인이 아니다. 7상태가 구현되지 않았으면 화면 문서의 상태를 부분으로 유지한다.

<a id="cmp-table-01"></a>

<a id="CMP-TABLE-01"></a>

## CMP-TABLE-01 — 열 의미와 모양

- 목표: → [RULE-SORT](../rules.md#RULE-SORT); [RULE-TONE](../rules.md#RULE-TONE).
- 현재: dataTable은 number/value를 숫자 칸으로 렌더하지만 비용 페이지는 숫자 열에 align:right를 전달한다(`kit/components/data-table.js:86–122`; `apps/wake/pages/costs.js:138`).
- 차이: 비용 정의의 align:right는 dataTable이 소비하지 않는 무효 속성이다. 실제 셀은 왼쪽이며 남은 차이는 value/mono/time 별칭과 무효 align 정리다.
- 고정 장치: `kit/components/data-table-extras.test.mjs` — `a figure column takes a tone, never an icon; a mono column keeps the header in the common face`
- 출처: D-USR-2026-11-16-1; D00728, D00953, D01033, D01034
- 점검 항목: → [RULE-SORT](../rules.md#RULE-SORT); [RULE-TONE](../rules.md#RULE-TONE).

<a id="cmp-table-02"></a>

## CMP-TABLE-02 — 7상태

- 목표: → [RULE-STATE](../rules.md#RULE-STATE).
- 현재: 주 조회는 세대를 검사하지만 usage는 disposed만 검사하고 빈 결과는 emptyState를 반환한다(`apps/wake/pages/resource-list.js:43–57,145`).
- 차이: 보조 조회에 세대 검사가 없고 성공 빈 표 머리가 사라진다. quiet 실패에는 stale 시각이 붙지 않는다.
- 고정 장치: 고정 없음 → TASK-CMP-TABLE-STATES
- 출처: D00447, D01027, D01031, D01032
- 점검 항목: → [RULE-STATE](../rules.md#RULE-STATE).

<a id="cmp-table-03"></a>

## CMP-TABLE-03 — 행 식별·이동·선택

- 목표: namespace가 다르거나 UID가 다른 동명 행에서 Enter로 상세를 열고 닫는다 → Kubernetes 행은 UID가 우선이며 namespace/kind/name은 이름 기반 fallback임을 구분한다. 이동은 cluster·namespace·kind·UID·at를 함께 전달한다. 같은 이름 새 UID는 이전 선택·과거 관측을 계승하지 않는다. 키보드로 첫 열 링크·버튼을 활성화하고 상세를 닫으면 선택행으로 초점과 스크롤을 복원한다. → 다른 UID 상세로 이동하거나 선택 행의 초점·스크롤을 복원하지 못하면 실패.
- 현재: resource-list.open은 UID와 at를 전달하지만 관련 리소스 표는 r+index 키를 쓴다(`apps/wake/pages/resource-list.js:122–123`; `apps/wake/pages/resource-detail.js:756`).
- 차이: 상세 관련 표의 index 키와 UID 없는 openOf 호출은 동명 새 객체를 구별하지 못한다.
- 고정 장치: `kit/components/data-table-extras.test.mjs` — `the open row stays marked through activeKey`
- 출처: D00093, D00094, D00447
- 점검 항목: 같은 이름 새 UID, 다른 namespace 같은 name을 넣어 교차 이동 0. Tab→Enter와 상세 닫기→원래 행 복귀 확인.

<a id="cmp-table-04"></a>

<a id="CMP-TABLE-04"></a>

## CMP-TABLE-04 — 폭·행 배경·줄바꿈

- 목표: → [RULE-WIDTH](../rules.md#RULE-WIDTH).
- 추가 조건: → [RULE-WIDTH](../rules.md#RULE-WIDTH).
- 추가 조건: → [RULE-WIDTH](../rules.md#RULE-WIDTH).
- 추가 조건: → [RULE-WIDTH](../rules.md#RULE-WIDTH).
- 현재: dataTable.fit은 머리·본문 폭을 재고 optional 숨김 규칙은 8단계까지 정의한다(`kit/components/data-table.js:158–183,68–75`).
- 차이: optional 순위가 9 이상인 열은 공통 숨김 규칙 범위를 벗어난다.
- 고정 장치: 고정 없음 → TASK-CMP-TABLE-WIDTH
- 출처: D-USR-2026-11-16-7; D00447, D01030, D01033; D00291; D00356; D00357
- 점검 항목: → [RULE-WIDTH](../rules.md#RULE-WIDTH).

<a id="cmp-table-05"></a>

## CMP-TABLE-05 — 필터·정렬·개수·페이저

- 목표: → [RULE-SORT](../rules.md#RULE-SORT).
- 현재: alertList는 state 우선 뒤 at 내림차순으로 정렬한다(`apps/wake/data/alerts.js:85`).
- 차이: 현재 상태 우선이며 동점 불변 키가 없다. 이력 정렬 판정은 [RULE-SORT](../rules.md#RULE-SORT)를 따른다.
- 고정 장치: 고정 없음 → TASK-CMP-TABLE-SORT
- 출처: D-USR-2026-11-16-7; D-USR-2026-11-16-2; D00074, D00822, D00874
- 점검 항목: → [RULE-SORT](../rules.md#RULE-SORT).
- 추가 조건: 열 머리를 한 번 누르면 그 열의 오름·내림 정렬만 바뀐다(D00600). 같은 클릭으로 그래프 선택이나 필터를 바꾸지 않는다 → 정렬 클릭 1회가 그래프 선택을 겸해 필터를 바꾸면 실패.

<a id="cmp-table-06"></a>

<a id="CMP-TABLE-06"></a>

## CMP-TABLE-06 — 값·빈 셀·시간

- 목표: API의 null·0·false와 과거 snapshot.at의 Age를 대조한다. 값·출처 상태는 [RULE-STATE](../rules.md#RULE-STATE), 시각은 [RULE-TIME](../rules.md#RULE-TIME)을 따른다. kubectl 원문 상태·열 이름을 유지한다.
- 추가 조건: 입력 A00201의 지목 표기와 같은 의미의 다른 화면 표기를 식별 → 기대 같은 역할의 표시 형식과 단위/상태 표현을 공통 적용 → 실패 지목한 표현을 특정하지 못하거나 타입/정렬만으로 통일 판정.
- 추가 조건: 상세 값의 null·0·403은 [RULE-STATE](../rules.md#RULE-STATE)로 판정한다. 과거 D00386의 N/A 요구와 옛 화면 규칙의 출처 차이를 남긴다.
- 추가 조건: PVC를 포함한 모든 등록 종류에 [RULE-STATE](../rules.md#RULE-STATE)를 적용한다. PVC만 검사하거나 과거 결정의 변경 근거를 숨기면 실패다.
- 추가 조건: 홈·목록·상세의 null·0·403과 중복 문구를 대조한다. 상태·정렬은 [RULE-STATE](../rules.md#RULE-STATE), [RULE-SORT](../rules.md#RULE-SORT)를 따른다. 중복 설명을 제거한다. 출처 경계: D00386·D00399·D00454는 과거 표기 요구이며 옛 화면 규칙이 우선한다. 별도의 후속 D번호를 만들지 않는다.
- 현재: kinds.age의 Unknown은 resource-list.CELL.age가 빈 셀로 바꾸고 related는 Node Pod 수 0도 빈 문자열로 바꾼다(`apps/wake/data/kinds.js:14`; `apps/wake/pages/resource-list.js:102,110`).
- 차이: 누락 Age는 빈 셀로 맞게 표시한다. Node pods의 실제 0은 빈 셀로 바뀌어 결손과 구분되지 않는다.
- 고정 장치: 고정 없음 → TASK-CMP-TABLE-FORMAT
- 출처: D00386, D00450, D00776; D00366; D00399; D00454; D00386; D00399; D00454
- 점검 항목: 원본 null/0/false/빈 배열 각각 검증. 연도 경계·시간대·과거 at에서 현재 날짜 혼입0.

<a id="cmp-table-07"></a>

## CMP-TABLE-07 — 보고서 예외

- 목표: reportCanvas에서 긴 설명과 수치 행을 선택해 PDF와 Markdown으로 내보낸다 → reportCanvas 문서 표는 설명·후속조치·로그 원문처럼 prose인 칸만 줄바꿈을 허용한다. 이름·수치·시각은 한 줄이다. 문서 표는 UI 버튼·hover·페이지 잘라내기를 그대로 내보내지 않는다. PDF와 Markdown은 같은 모델의 동일 값과 선택 구간을 쓴다. → 수치가 줄바꿈되거나 선택하지 않은 행이 포함되거나 UI 버튼이 문서에 출력되면 실패.
- 현재: incidentReport는 보고서 모델을 만들고 reportCanvas.print는 A4 인쇄 스타일을 적용한다(`apps/wake/pages/incident-report-doc.js:158`; `kit/components/report-canvas.js:183–201`).
- 차이: 페이지의 채널 복사는 초기 doc.channel을 사용해 편집된 report 모델과 달라질 수 있다(incident-report.js:88–90).
- 고정 장치: `kit/components/report-canvas.test.mjs` — `print: a cell keeps one line; long raw text stands under the table; a small section is marked to stay on one page`
- 출처: D00942, D00943, D00948, D00949
- 점검 항목: 미리보기/PDF/Markdown에서 선택한 섹션·행·숫자·시간 동일. 긴 설명 줄바꿈, 수치 잘림0.

<a id="cmp-table-08"></a>

## CMP-TABLE-08 — 회귀 검수

- 목표: 동일 UID·구간의 표를 다크·라이트와 760/1280/1680 폭에서 검수한다 → 모든 화면 표는 출처 값·화면 이름·대상 UID·구간·테마·폭·캡처 시각을 함께 기록한다. 원본이 없으면 0건으로 통과시키지 않는다. 표 부품 변경은 열 종류·폭·빈 상태·행 선택 고정 장치와 함께 바꾼다. → 원본 없는 행을 0건 합격으로 기록하거나 캡처의 대상·기간·테마를 식별하지 못하면 실패.
- 현재: check-layout은 기하를 검사하고 check-states는 정의된 앱 상태를 캡처한다(`kit/tools/check-layout.mjs:45–63`; `kit/tools/check-states.mjs:95–105`).
- 차이: 기존 점검 도구는 Kubernetes 원본 UID·시각·열 값의 동등성을 검사하지 않는다.
- 고정 장치: 고정 없음 → TASK-CMP-COVERAGE
- 출처: D01051
- 점검 항목: 다크·라이트 ×1280·1680, 끝까지 스크롤 및760상세. node kit/tools/check-states.mjs --app wake; node kit/tools/check-layout.mjs --app wake. 검사만 통과해도 실제앱 검수 전 검증됨 금지.
