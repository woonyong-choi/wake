# 이벤트 상세

<a id="SCR-EVENT-DETAIL"></a> 진입: `wake://cluster/:cluster/ns/:ns/events/:name`. 목적(SRE 판단): Event 원문·반복·대상을 다른 사건과 구분한다.
구성: reason·type 머리 → 발생 요약 → message → 대상 → 동일 대상/이유 사건 → YAML.
현재: [apps/wake/pages/resource-detail.js](../../apps/wake/pages/resource-detail.js); [apps/wake/data/kinds.js](../../apps/wake/data/kinds.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 사건 식별·시각, 대상, 관련 사건; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.
고정 장치: `apps/wake/pages/resource-inspector.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-EVENT-DETAIL-01"></a> `SCR-EVENT-DETAIL-01` | Event 상세를 연다 → Event reason/type 머리 다음 Count·First/Last Seen·Source, message, 대상, 관련 사건, YAML을 본다 → 다른 Event 원문 또는 순서 역전이면 실패 | eventDetail은 target·head·msg·now·sameBar·reasonBar·relBar·yaml 순서다; `apps/wake/pages/resource-detail.js:759` | 대상 링크가 발생 요약·message보다 앞에 있다 | 고정 없음 → TASK-SCREEN-EVENT-DETAIL | D00452; 구역 순서는 D-USR-2026-11-16-7 |
| <a id="SCR-EVENT-DETAIL-V01"></a> `SCR-EVENT-DETAIL-V01` | 동일 이름 Event의 UID·resourceVersion·첫/마지막 시각이 다른 응답을 연다 → metadata와 firstAt/at에 대응한 시각·Source·reportingInstance를 보인다 → 다른 Event 버전의 시각을 합치면 실패 | Count·First Seen·Last Seen·Source·instance를 현재 e로 조립한다; `apps/wake/pages/resource-detail.js:739` | 없음(확인: `apps/wake/pages/resource-detail.js:739`) | 고정 없음 → TASK-SCREEN-EVENT-DETAIL | D00452, D00508 |
| <a id="SCR-EVENT-DETAIL-V02"></a> `SCR-EVENT-DETAIL-V02` | 원래 대상 UID=u1이 사라지고 같은 이름 u2가 존재한다 → 대상 상태는 사라짐이고 링크도 u1을 유지한다 → u2를 원래 대상으로 연결하면 실패 | 대상 UID가 ref.uid와 다르면 subjectNow를 gone으로 둔다; `apps/wake/pages/resource-detail.js:337` | 읽기 오류도 null로 바꿔 gone 처리하므로 삭제와 조회 실패는 합쳐진다 | 고정 없음 → TASK-SCREEN-EVENT-DETAIL | D00094; UID 세부는 D-USR-2026-11-16-7 |
| <a id="SCR-EVENT-DETAIL-V03"></a> `SCR-EVENT-DETAIL-V03` | 최근 24시간에 같은 대상·서로 다른 Reason 25행을 준다 → 전체 25행 모수와 현재 표시 20행을 구분하고 나머지 5행으로 이동할 수 있다 → 20행만 보이며 전체 범위를 알 수 없으면 실패 | same 전체로 머리를 세지만 표는 slice(0,20)이다; `apps/wake/pages/resource-detail.js:745` | 이벤트 상세의 같은 대상 표에 pager와 표시 범위가 없다 | 고정 없음 → TASK-SCREEN-EVENT-DETAIL | D00090; 상세 20행은 D-USR-2026-11-16-7 |
| <a id="SCR-EVENT-DETAIL-A01"></a> `SCR-EVENT-DETAIL-A01` | 1. Event message를 읽고 Logs를 누른다 → involvedObject UID·container와 발생시각 ±5분을 로그에 전달한다 → 이름만 전달하거나 기본 현재 구간이면 실패.<br>2. 입력 메시지 블록의 hover/keyboard focus와 같은 시점 Logs 링크 → 기대 호버/포커스에서 공통 복사 아이콘을 제공하고 링크 라벨은 Logs·공통 색 토큰 사용 → 실패 텍스트 복사만 제공, Logs 대신 설명 문구 또는 페이지별 파랑 예외. 공통 판정은 [SCR-ICON-ACTIONS](common.md#SCR-ICON-ACTIONS)에 연결한다. | eventDetail은 대상 상세 링크를 만든다; `apps/wake/pages/resource-detail.js:736` | Event 전용 본문에는 Logs 동작과 발생시각 ±5분 전달이 없다 | 고정 없음 → TASK-SCREEN-EVENT-DETAIL | D00452; D00384 |
| <a id="SCR-EVENT-DETAIL-A02"></a> `SCR-EVENT-DETAIL-A02` | resourceVersion이 바뀐 Event YAML을 재조회한다 → YAML 카드 머리에서 이 Event의 resourceVersion을 확인한다 → 머리 버전과 본문이 다른 응답이면 실패 | YAML 머리 resourceVersion과 본문 toYaml은 같은 e.raw를 사용한다; `apps/wake/pages/resource-detail.js:758` | 없음(확인: `apps/wake/pages/resource-detail.js:758`) | 고정 없음 → TASK-SCREEN-EVENT-DETAIL | D00452; 버전 표시는 D-USR-2026-11-16-7 |
| <a id="SCR-EVENT-DETAIL-G01"></a> `SCR-EVENT-DETAIL-G01` | 같은 namespace/name의 원래 UID를 지우고 새 UID로 재생성한다 → 옛 Event는 원래 UID를 가리키며 삭제 상태를 알린다 → 새 객체 상세로 자동 연결하면 실패 | 현재 대상과 Event ref UID를 비교해 gone을 결정한다; `apps/wake/pages/resource-detail.js:337` | UID 불일치는 구분하지만 읽기 거절·오류도 gone으로 표시한다 | 고정 없음 → TASK-SCREEN-EVENT-DETAIL | D00094 |

<a id="SCR-EVENT-METADATA-PRESENTATION"></a>


## SCR-EVENT-METADATA-PRESENTATION

- 목표: 긴 Event object/message 및 최초 시각·reportingController를 표시 → 필요한 값은 지정된 요약/필드에 두고 진단성 합성 로그 줄을 중복 출력하지 않음 → 지적된 합성 메타 줄이 별도로 남으면 실패; 실제 원본 로그/YAML 텍스트는 변경하지 않음.
- 현재: eventDetail이 Count·First Seen·Last Seen·Source와 instance를 조립한다.(`apps/wake/pages/resource-detail.js:739`)
- 차이: 첫 시각·controller를 별도 합성 로그로 중복 표시하지 않는 조건을 고정해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-EVENT-DETAIL
- 출처: D00878
