# 알림 목록

<a id="SCR-ALERTS"></a> 진입: `wake://cluster/:cluster/alerts`. 목적(SRE 판단): firing·pending·resolved를 구분하고 대상 사건으로 간다.
구성: 머리·Prometheus/Alertmanager 출처 → 검색·all/firing/pending/resolved·기간 → 요약·dataTable·pager.
현재: [apps/wake/pages/alerts.js](../../apps/wake/pages/alerts.js); [apps/wake/data/alerts.js](../../apps/wake/data/alerts.js); [apps/wake/data/index.js](../../apps/wake/data/index.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 알림, 상태별 개수, 페이지·기간; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-INC-01](../components/incident-criteria.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-ALERTS-01](../components/tables/alerts.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-ALERTS-01](../components/tables/alerts.md). 화면의 대상/복귀 계약을 함께 적용한다.
고정 장치: `apps/wake/data/alerts.test.mjs`; `apps/wake/pages/signal-pages.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-ALERTS-01"></a> `SCR-ALERTS-01` | 클러스터 A의 알림을 연다 → alerts 응답의 Prometheus/Alertmanager 출처, 검색·상태·기간, 요약·표·pager가 보인다 → 다른 클러스터 알림이나 출처 누락이면 실패 | head·lines·tools·card를 순서대로 반환한다; `apps/wake/pages/alerts.js:60` | 없음(확인: `apps/wake/pages/alerts.js:60`) | 고정 없음 → TASK-SCREEN-ALERTS | D-USR-2026-11-16-7 |
| <a id="SCR-ALERTS-V01"></a> `SCR-ALERTS-V01` | Prometheus firing과 Alertmanager stale 응답을 함께 준다 → 규칙의 firing은 유지하고 통지 출처는 오래됨으로 보인다 → 통지 실패를 규칙 resolved로 바꾸면 실패 | 규칙 상태는 stale.prometheus에만 영향을 받고 receivers는 별도 저장한다; `apps/wake/data/alerts.js:69` | 없음(확인: `apps/wake/data/alerts.js:69`) | apps/wake/data/alerts.test.mjs — a_down_source_never_reads_as_a_current_state | D-USR-2026-11-16-7 |
| <a id="SCR-ALERTS-V02"></a> `SCR-ALERTS-V02` | 같은 검색·기간에 Watchdog 1건과 firing 2건을 준다 → [RULE-CHIPS](../rules.md#RULE-CHIPS)를 적용한 목록·firing 탭의 건수는 alertCounts(found)와 같다 → firing 3건으로 세면 실패 | Watchdog를 out에서 제외하고 화면은 found로 count를 구한다; `apps/wake/data/alerts.js:84` | 없음(확인: `apps/wake/data/alerts.js:84`) | apps/wake/data/alerts.test.mjs — an alert Alertmanager holds with the external labels added is the same row as its rule alert, and the Watchdog heartbeat is not listed | D01006 |
| <a id="SCR-ALERTS-V03"></a> `SCR-ALERTS-V03` | 필터 결과 31건의 2페이지를 연다 → rows.slice와 pager.total=31에 따라 마지막 1행이 보인다 → 30행을 전체 개수로 표시하면 실패 | PER=30으로 pages와 page를 계산하고 rows.length를 pager에 준다; `apps/wake/pages/alerts.js:47` | 없음(확인: `apps/wake/pages/alerts.js:47`) | 고정 없음 → TASK-SCREEN-ALERTS | D-USR-2026-11-16-7 |
| <a id="SCR-ALERTS-A01"></a> `SCR-ALERTS-A01` | 알림 행을 누르고 연결된 인시던트로 이동한다 → 같은 alert ID의 상세를 열고 인시던트 연결을 유지한다 → 다른 alert ID를 열거나 인시던트 연결을 잃으면 실패 | 클릭 id를 alerts 상세 주소에 전달한다; `apps/wake/pages/alerts.js:76` | 인시던트 연결은 UID가 아닌 알림 이름·namespace·15분 시간 근접 조건이다 | 고정 없음 → TASK-SCREEN-ALERTS | D00093; D-USR-2026-11-16-7 (alert ID 연결) |
| <a id="SCR-ALERTS-A02"></a> `SCR-ALERTS-A02` | 동점과 결손 행을 넣고 정렬을 바꾼다 → 동점 정렬은 안정된 두 번째 키를 적용하여 새로고침마다 순서가 흔들리지 않는다 → 동점 순서가 갱신마다 바뀌거나 결손 행이 앞으로 오면 실패 | 정렬은 STATE_ORDER 후 at 내림차순이다; `apps/wake/data/alerts.js:85` | 상태 우선이 최신순을 앞서며 ID 동점 키와 결손 마지막 처리가 없다 | 고정 없음 → TASK-SCREEN-ALERTS | D-USR-2026-11-16-2 |
| <a id="SCR-ALERTS-G01"></a> `SCR-ALERTS-G01` | → [RULE-SORT](../rules.md#RULE-SORT). | 동일 상태·시각 비교가 0으로 끝난다; `apps/wake/data/alerts.js:85` | 불변 ID tie-break가 없어 입력 순서에 좌우된다 | 고정 없음 → TASK-SCREEN-ALERTS | D-USR-2026-11-16-2 |
| <a id="SCR-ALERTS-G02"></a> `SCR-ALERTS-G02` | 실패 CronJob이 정상 실행을 회복한 뒤 같은 출처를 재관측한다 → 해제된 신호와 복구 관찰 상태를 구분한다 → 해제 후에도 CronJobRunFailed를 현재 발생으로 표시하면 실패. 복구 판정은 [RULE-RECOVERY](../rules.md#RULE-RECOVERY)를 따른다 | history의 endsAt 기록을 resolved로 추가한다; `apps/wake/data/alerts.js:81` | CronJob 규칙의 현재 firing과 인시던트의 30초·5분 복구 관찰을 연결하는 판정은 없다 | 고정 없음 → TASK-SCREEN-ALERTS | D-USR-2026-11-16-3; 알림 해제는 D-USR-2026-11-16-7 |

## 표별 판단 계약

열 이름·종류·원본식·표시·톤·툴팁·숨김 순서는 머리의 components 계약을 참조한다. 시간 이력 정렬은 사용자 확정 D-USR-2026-11-16-2, 비용 정렬·검색 세부는 D-USR-2026-11-16-7 기본값이다.

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-ALERTS-TABLE"></a> `SCR-ALERTS-TABLE` | 같은 at 알림과 다른 severity를 조회하고 Name·Target 및 상태·기간으로 거른다 → alerts의 at 내림·id 오름, 결측 마지막이며 상태는 톤·필터로 구별한다. 행은 같은 알림 상세와 연관 사건으로 간다 → severity/상태가 시간순보다 앞서거나 다른 알림을 열면 실패 | STATE_ORDER 뒤 at 내림차순으로 정렬한다; `apps/wake/data/alerts.js:85` | 목표의 시간순보다 상태를 먼저 비교하며 id 동점 키가 없다 | 고정 없음 → TASK-SCREEN-ALERTS | D-USR-2026-11-16-2; D-USR-2026-11-16-7 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-ALERT-WATCHDOG"></a> `SCR-ALERT-WATCHDOG` | Watchdog firing과 일반 장애 firing을 조회한다 → Watchdog는 목록·firing 수에서 빠지고 상태와 severity는 서로 다른 열이다 → Watchdog가 장애 수를 올리면 실패 | HEARTBEAT 이름은 목록에서 제외한다; `apps/wake/data/alerts.js:84` | 없음(확인: `apps/wake/data/alerts.js:84`) | apps/wake/data/alerts.test.mjs — an alert Alertmanager holds with the external labels added is the same row as its rule alert, and the Watchdog heartbeat is not listed | D01006 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-ALERTS-REQ-R-049"></a> `SCR-ALERTS-REQ-R-049` | → [RULE-RETENTION](../rules.md#RULE-RETENTION). | history를 resolved로 추가하고 ALERT_RETENTION_DAYS는 90이다; `apps/wake/data/alerts.js:81` | 없음(확인: `apps/wake/data/alerts.js:81`) | 고정 없음 → TASK-SCREEN-ALERTS | D-USR-2026-11-16-4; 규칙 출처는 D-USR-2026-11-16-7 |
| <a id="SCR-ALERTS-LAB-P7"></a> `SCR-ALERTS-LAB-P7` | CronJob의 최신 성공과 남아 있는 과거 실패 이력을 조회한다 → rules의 현재 firing 여부와 history.endsAt의 과거 발생을 구분한다 → 실패 기록 존재만으로 현재 발생을 추정하면 실패 | 현재 규칙 alerts와 보관 history를 다른 루프로 처리한다; `apps/wake/data/alerts.js:66` | 실험 CronJobRunFailed 규칙이 왜 계속 firing인지 판정할 규칙 평가 결과는 앱 변환 코드에 없다 | 고정 없음 → TASK-SCREEN-ALERTS | D-USR-2026-11-16-7 |
