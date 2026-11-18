# 리소스 상세 · 이벤트

<a id="SCR-RESOURCE-EVENTS"></a> 진입: `wake://cluster/:cluster/ns/:ns/:kind/:name?tab=events`. 목적(SRE 판단): 선택 대상의 이상을 만든 Event와 시점을 확인한다.
구성: 상세 머리·탭 → 시간 범위·검색 → event timeline → 대상 Event 표.
현재: [apps/wake/pages/resource-detail.js](../../apps/wake/pages/resource-detail.js); [apps/wake/data/kinds.js](../../apps/wake/data/kinds.js); [apps/wake/data/index.js](../../apps/wake/data/index.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 대상 사건, 시각·횟수; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: Kubernetes Event의 involvedObject/regarding UID와 apiVersion·kind·namespace·name으로 대상을 묶는다. firstTimestamp/eventTime, series.lastObservedTime/lastTimestamp, series.count/count를 각각 처음·마지막·횟수에 사용한다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-EVENTS-01"></a> `SCR-RESOURCE-EVENTS-01` | Pod UID A의 events 탭을 연다 → Kubernetes events 자료를 상세 머리·탭 아래 시간/검색 도구→타임라인→Event 표 순으로 표시한다 → 다른 UID Event나 검색 누락, 구역 순서 역전이면 실패 | apps/wake/pages/resource-detail.js:595 eventsTab()은 timeline→Warning/All 필터→Event 표를 반환한다 | 검색 입력과 namespace/kind 거르기가 없다. 기간은 상세 공통 상태를 사용한다 | 고정 없음 → TASK-SCREEN-RESOURCE-EVENTS | D00452, D00874 |
| <a id="SCR-RESOURCE-EVENTS-V01"></a> `SCR-RESOURCE-EVENTS-V01` | namespace/name이 같고 involvedObject.uid가 A/B인 Event를 UID A 상세에 준다 → A 대상의 Event만 표와 타임라인에 연결한다 → B Event가 대상 A 근거로 보이면 실패 | apps/wake/data/index.js:92 eventRowsOf()는 subject와 ref의 UID·kind·name·ns·apiVersion을 비교해 다른 항목을 제외한다 | 없음(확인: apps/wake/data/index.js:92) | 고정 없음 → TASK-SCREEN-RESOURCE-EVENTS | D00066, D00452 |
| <a id="SCR-RESOURCE-EVENTS-V02"></a> `SCR-RESOURCE-EVENTS-V02` | Event에 firstTimestamp=10:00, series.lastObservedTime=10:05, series.count=8을 준다 → First Seen 10:00·Last Seen 10:05·Count 8을 별도로 표시하고 다른 날이면 날짜를 붙인다. 좁은 폭에서는 First Seen 열이 가장 먼저 접히고 Last Seen 칸에 올리면 First Seen이 보인다(A3-09) → 8을 지속시간으로 쓰거나 과거 사건에 상대 시각만 있으면 실패 | apps/wake/data/kinds.js:178~180이 처음/마지막/횟수를 분리하고 apps/wake/pages/resource-detail.js:739가 상세의 세 값을 출력한다 | 없음(확인: apps/wake/data/kinds.js:178) | 고정 없음 → TASK-SCREEN-RESOURCE-EVENTS | D00090, D00091 |
| <a id="SCR-RESOURCE-EVENTS-A01"></a> `SCR-RESOURCE-EVENTS-A01` | 10:05 Event에서 대상 Pod의 로그를 연 뒤 복귀한다 → Event의 object.uid·container를 유지하고 로그 구간은 10:00~10:10, 복귀 시 원래 Event가 선택된다 → 현재 Pod나 다른 컨테이너로 바뀌면 실패 | apps/wake/pages/resource-detail.js:736 eventSubjectAddress()로 대상 링크를 만들고 :861은 Event 행에서 Event 상세로 이동한다 | Event에서 UID·컨테이너·전후 5분 로그를 직접 여는 동작이 없다 | 고정 없음 → TASK-SCREEN-RESOURCE-EVENTS | D00452 |
| <a id="SCR-RESOURCE-EVENTS-A02"></a> `SCR-RESOURCE-EVENTS-A02` | 같은 대상에서 Warning·검색어·namespace·kind·기간을 조합한다 → source Event에 한 번 적용한 조건으로 타임라인 표식과 표 행을 함께 줄인다 → 표에서 빠진 Event가 타임라인에 남으면 실패 | apps/wake/pages/resource-detail.js:598 list에 warnOnly를 적용하지만 :599 changeMarks()에는 원래 source를 전달한다 | Warning 조건이 타임라인에 전달되지 않으며 검색·namespace·kind 조작도 없다 | 고정 없음 → TASK-SCREEN-RESOURCE-EVENTS | D00874 |
| <a id="SCR-RESOURCE-EVENTS-G01"></a> `SCR-RESOURCE-EVENTS-G01` | 대상 UID가 없거나 같은 이름의 다른 UID Event를 응답한다 → 검증 못 함을 표시하거나 다른 UID를 제외하고 이름만으로 현재 대상에 연결하지 않는다 → 이름 일치만으로 같은 사건이라고 표시하면 실패 | apps/wake/data/index.js:84 일반 경로는 subject UID 부재를 거부하지만 api.events 경로는 예외이며 apps/wake/pages/resource-detail.js:744의 같은 대상 목록은 kind/name/ns만 비교한다 | 레거시 api.events는 UID 없는 subject를 받을 수 있고 Event 상세의 같은 대상 구역은 UID를 비교하지 않는다 | 고정 없음 → TASK-SCREEN-RESOURCE-EVENTS | D00066, D00452 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-EVENTS-CURRENT-EXCEPTION"></a> `SCR-RESOURCE-EVENTS-CURRENT-EXCEPTION` | Node Event 탭과 Pod Warning 필터를 차례로 연다 → Node 타임라인을 제공하지 않으면 그 이유를 표시하고 Pod는 A02의 동일 필터를 적용한다 → Node에서 설명 없는 빈 구역이나 표/타임라인 불일치면 실패 | apps/wake/pages/resource-detail.js:600은 nodes일 때 tl을 빈 문자열로 만들고 :605는 Event를 20행씩 페이지에 표시한다 | Node 타임라인 생략 이유가 없고 Warning 조건은 표에만 적용된다 | 고정 없음 → TASK-SCREEN-RESOURCE-EVENTS | D00874 |
