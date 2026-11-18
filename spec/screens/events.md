# 이벤트 목록

<a id="SCR-EVENTS"></a> 진입: `wake://cluster/:cluster/ns/:ns/events`. 목적(SRE 판단): 반복 경고의 대상·이유·시점을 찾아 로그 조사로 간다.
구성: viewHeader → namespace·검색·type/reason·기간 → 변화 타임라인 → Event 목록·묶음 → pager.
현재: [apps/wake/pages/events-view.js](../../apps/wake/pages/events-view.js); [apps/wake/pages/resource-list.js](../../apps/wake/pages/resource-list.js); [apps/wake/data/home.js](../../apps/wake/data/home.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 원본 사건, 타임라인, 조회 상태; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-EVENTS-VIEW-01](../components/tables/events-view.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-EVENTS-VIEW-01](../components/tables/events-view.md). 화면의 대상/복귀 계약을 함께 적용한다.
고정 장치: `apps/wake/pages/signal-pages.test.mjs`; `apps/wake/data/kinds.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-EVENTS-01"></a> `SCR-EVENTS-01` | Kubernetes Event 목록을 연다 → resources/events와 변경 리소스에서 머리·namespace/검색/type/reason/기간·타임라인·목록·pager를 구성한다 → 표와 타임라인 대상 클러스터가 다르면 실패 | head·tools·tl·card·otherKinds를 같은 ctx로 반환한다; `apps/wake/pages/events-view.js:87` | 성공한 빈 결과에서는 표와 pager 대신 emptyState만 반환한다 | 고정 없음 → TASK-SCREEN-EVENTS | D00090, D00452 |
| <a id="SCR-EVENTS-V01"></a> `SCR-EVENTS-V01` | 같은 Event UID의 count=4와 갱신 count=5를 준다 → eventSummary는 최종 Count 5인 한 사건으로 집계한다 → 9회 또는 2개 독립 사건으로 합산하면 실패 | byUid는 더 큰 count 또는 더 최근 last를 선택한다; `apps/wake/data/incident-model.js:144` | 없음(확인: `apps/wake/data/incident-model.js:144`) | apps/wake/data/incident-model.test.mjs — eventSummary: one row per object and reason, every count from the same rows (N8) | D00090, D00452 |
| <a id="SCR-EVENTS-V02"></a> `SCR-EVENTS-V02` | Event·Deployment·ConfigMap 변경 기록을 준다 → changeMarks의 실제 at에 배포·설정·인프라·증상 레인이 보인다 → 읽기 실패를 정상 변경 없음으로 표시하면 실패 | 보조 리소스 조회 실패를 []로 바꾼 뒤 changeMarks에 전달한다; `apps/wake/pages/events-view.js:41` | 보조 출처 실패가 사라져 빈 레인과 구별되지 않는다 | 고정 없음 → TASK-SCREEN-EVENTS | D00452, D00703 |
| <a id="SCR-EVENTS-V03"></a> `SCR-EVENTS-V03` | → [RULE-RETENTION](../rules.md#RULE-RETENTION). | PER=30이며 range는 1h·retention은 7일이다; `apps/wake/pages/events-view.js:13` | 기본 페이지가 목표 50행보다 20행 적다 | 고정 없음 → TASK-SCREEN-EVENTS | D00090; 보관 D-USR-2026-11-16-4; 창 기본 D-USR-2026-11-16-7 |
| <a id="SCR-EVENTS-A01"></a> `SCR-EVENTS-A01` | object 앞 경로를 검색하고 이벤트 종류를 선택한다 → 한 검색 조건으로 표와 타임라인을 같이 거른다. object 전체 경로 검색을 허용한다 → 표만 바뀌거나 object 전체 경로 검색이 실패하면 실패 | hay는 kind/name과 ns를 공백으로 분리해 검색한다; `apps/wake/pages/events-view.js:45` | kind/namespace/name 연속 경로가 없고 타임라인은 symptom 레인만 불일치 dim 처리한다 | 고정 없음 → TASK-SCREEN-EVENTS | D00874 |
| <a id="SCR-EVENTS-A02"></a> `SCR-EVENTS-A02` | 좁은 창에서 마지막 항목까지 스크롤한다 → 목록 마지막 행까지 세로 스크롤하고 타임라인 축·범례·표 머리 겹침이 없어야 한다 → 마지막 행이 잘리거나 고정 머리와 본문이 겹치면 실패 | 목록과 타임라인을 부모 화면의 단일 반환 HTML로 전달한다; `apps/wake/pages/events-view.js:87` | 스크롤 높이·고정 머리 겹침을 검사하는 코드는 이 renderer에 없다. 부모 pageColumn이 스크롤을 소유한다 | 고정 없음 → TASK-SCREEN-EVENTS | D01030 |
| <a id="SCR-EVENTS-A03"></a> `SCR-EVENTS-A03` | 이벤트 행에서 상세·대상 리소스·로그를 차례로 연다 → 같은 대상 UID의 로그를 사건 시각 전후 5분으로 연다 → 대상 UID가 바뀌거나 사건 시각 전후 5분을 잃으면 실패 | 행은 가장 최근 같은 대상·Reason의 Event 상세를 연다; `apps/wake/pages/events-view.js:95` | 목록에는 직접 로그 동작이 없고 Event 상세에도 ±5분 Logs 링크가 없다 | 고정 없음 → TASK-SCREEN-EVENTS | D00452 |
| <a id="SCR-EVENTS-G01"></a> `SCR-EVENTS-G01` | 51개 Event를 같은 필터로 조회한다 → D00090에 따라 첫 페이지 50행과 나머지 1행을 구분한다 → 현재 PER30을 승인된 50행 목표와 같다고 판정하면 실패 | PER=30으로 rows를 slice하고 pager를 만든다; `apps/wake/pages/events-view.js:82` | 51행은 30/21로 나뉘어 목표 50/1과 다르다 | 고정 없음 → TASK-SCREEN-EVENTS | D00090 |
| <a id="SCR-EVENTS-G02"></a> `SCR-EVENTS-G02` | 이벤트 페이지를 끝까지 스크롤한다 → 마지막 행·페이지 동작·타임라인 축이 가려지지 않는다 → 첫 화면만 정상이고 하단이 잘리면 실패 | pager를 eventTable 뒤 같은 body에 배치한다; `apps/wake/pages/events-view.js:82` | 레이아웃 점검의 실제 하단 도달 판정은 renderer 단위 시험에 포함되지 않는다 | 고정 없음 → TASK-SCREEN-EVENTS | D01030 |

## 표별 판단 계약

열 이름·종류·원본식·표시·톤·툴팁·숨김 순서는 머리의 components 계약을 참조한다. 시간 이력 정렬은 사용자 확정 D-USR-2026-11-16-2, 비용 정렬·검색 세부는 D-USR-2026-11-16-7 기본값이다.

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-EVENTS-TABLE"></a> `SCR-EVENTS-TABLE` | → [RULE-SORT](../rules.md#RULE-SORT). 목록은 Event 상세, 묶음은 같은 Reason 목록으로 간다 → 개별 행을 Warning 우선으로 바꾸거나 동점이 흔들리면 실패 | eventSummary는 latest 내림, Reason 묶음은 Warning 후 count 내림으로 정렬한다; `apps/wake/data/incident-model.js:154`, `apps/wake/pages/events-view.js:76` | 개별 Event와 Reason 묶음 모두 동점 불변 키 비교가 없다 | 고정 없음 → TASK-SCREEN-EVENTS | D-USR-2026-11-16-2; D-USR-2026-11-16-7 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-EVENT-INVESTIGATE"></a> `SCR-EVENT-INVESTIGATE` | 1. Warning Event를 열고 로그로 이동한 뒤 목록으로 돌아온다 → object UID·Reason·Type·Count·첫/마지막 시각·message 및 로그 ±5분과 기존 필터를 유지한다 → UID 또는 기간을 잃으면 실패.<br>2. 입력 처리 상태가 서로 다른 이벤트 행 → 기대 각 행에서 실제 처리 상태를 읽고 동일 대상 조사로 이동 → 실패 상태를 상세에만 숨기거나 미처리를 완료로 표시.<br>3. 입력 AI에 전달할 대상/근거가 같은 상단·본문 진입 두 개를 가진 이벤트 상세 → 기대 같은 AI 진입은 한 곳에 모으고 대상·근거를 보존 → 실패 중복 AI 버튼 잔존 또는 정리하며 실제 맥락 소실.<br>4. 입력 긴 이벤트 메시지·반복 횟수·시각·연결된 AI 대화가 있는 상세 → 기대 한 줄 이벤트에서 시각·횟수의 위치를 유지하고 반복 분류는 [RULE-TONE](../rules.md#RULE-TONE)을 따른다. 같은 대상 AI 진입은 하나 → 실패 시각/횟수 위치 불일치 또는 중복 AI 진입. | 행 상세는 kind·namespace·name·Reason으로 최신 Event를 선택한다; `apps/wake/pages/events-view.js:29` | 같은 이름의 다른 UID가 같은 행 주소 선택에 섞일 수 있고 로그 기간 이동도 없다 | 고정 없음 → TASK-SCREEN-EVENTS | D00094, D00452, D00877; D00090; D00358 |
| <a id="SCR-EVENT-PROCESS"></a> `SCR-EVENT-PROCESS` | 같은 UID의 갱신 Event를 읽는 중 새 Event를 받는다 → 발생의 첫/최근 시각과 실제 Wake 처리 시각을 분리하고 새 N건 안내 전 기존 행 위치를 유지한다 → count 중복 합산이나 관측 없는 처리 단계면 실패 | 상세 이벤트 탭은 eventBuffer를 새 N건 버튼으로 표시한다; `apps/wake/pages/resource-detail.js:604` | Event 전용 상세에는 수집·기록·연관 분석의 실제 처리 이력 구역이 없다 | 고정 없음 → TASK-SCREEN-EVENTS | D00091, D00452, D01025 |
| <a id="SCR-EVENT-FILTER"></a> `SCR-EVENT-FILTER` | Object='Pod/ns1/p1' 검색과 Warning·Reason 필터를 적용한다 → 같은 조건으로 표를 거르고 비일치 타임라인 점을 흐리게 남긴다 → namespace 경로 검색 실패나 비일치 점 활성화면 실패 | symptom 중 rows와 맞지 않는 점만 dim=true다; `apps/wake/pages/events-view.js:65` | 배포·설정 레인은 조건에서 제외되며 검색 문자열에도 전체 Object 경로가 없다 | 고정 없음 → TASK-SCREEN-EVENTS | D00874 |
| <a id="SCR-TIMELINE-READ"></a> `SCR-TIMELINE-READ` | 1. 서로 다른 날짜의 배포·증상 점과 근거 있는 구간을 확대한다 → mark.at와 from/to의 한 절대 축에서 날짜·시각·hover 원문·대상 이동이 유지된다 → 축 날짜를 잃거나 점을 임의 구간으로 늘리면 실패.<br>2. live에서 새 mark가 도착하고 pause/과거 구간으로 전환 → 새 이벤트 점에 공통 최신 표시, 과거/정지에서는 실시간 의미 제거 → 새 신호 구별이 없거나 과거 점이 실시간처럼 움직이면 실패.<br>3. GitOps/상세의 이벤트 기록 표시 → 같은 이벤트를 공통 changeTimeline의 시간축·hover·선택 문법으로 표시 → 임의 노란 막대만으로 대체하면 실패. | changeTimeline에 초 단위 from/to·marks와 selectAction을 준다; `apps/wake/pages/events-view.js:67` | 현재 eventsView marks는 모두 at 점이며 종료시각을 가진 구간 mark를 만들지 않는다 | 고정 없음 → TASK-SCREEN-EVENTS | D00703, D00708, D00709, D00875; D00714 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-EVENTS-REQ-R-047"></a> `SCR-EVENTS-REQ-R-047` | → [RULE-RETENTION](../rules.md#RULE-RETENTION). | eventHead는 Warning 행 수와 전체 list.length를, Reason 요약은 count 합을 사용한다; `apps/wake/pages/events-view.js:19` | 없음(확인: `apps/wake/pages/events-view.js:19`) | 고정 없음 → TASK-SCREEN-EVENTS | D00090; D-USR-2026-11-16-4 |
