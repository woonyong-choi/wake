# AI 작업 기록 목록

<a id="SCR-AI-HISTORY"></a> 진입: `wake://cluster/:cluster/ailog`. 목적(SRE 판단): 읽기·모델 전달·사람 동작과 실패를 추적한다.
구성: 머리·보관기간 → 검색·요청자·경로·기간 → 읽기/실패/모델전달/마스킹/사람 요약 → 기록 표·pager.
현재: [apps/wake/pages/ailog.js](../../apps/wake/pages/ailog.js); [apps/wake/data/audit.js](../../apps/wake/data/audit.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 감사 행, 거르기, 요약; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-AILOG-01](../components/tables/ailog.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-AILOG-01](../components/tables/ailog.md). 화면의 대상/복귀 계약을 함께 적용한다.
고정 장치: `apps/wake/data/audit.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AI-HISTORY-01"></a> `SCR-AI-HISTORY-01` | → [RULE-RETENTION](../rules.md#RULE-RETENTION). | head·tools·summary·card·otherKinds 순서로 반환한다; `apps/wake/pages/ailog.js:60` | 없음(확인: `apps/wake/pages/ailog.js:60`) | 고정 없음 → TASK-SCREEN-AI-HISTORY | D00466; 보관은 D-USR-2026-11-16-4 |
| <a id="SCR-AI-HISTORY-V01"></a> `SCR-AI-HISTORY-V01` | AI 호출 1건과 사람 호출 1건을 조회한다 → snap.rows 각 id가 한 행이며 requester·executor·model이 해당 기록대로 표시된다 → 사람 요청을 AI 요청으로 합치면 실패 | dataTable rowKey=id이고 requesterMark와 auditExec가 행 값을 읽는다; `apps/wake/pages/ailog.js:51` | 없음(확인: `apps/wake/pages/ailog.js:51`) | 고정 없음 → TASK-SCREEN-AI-HISTORY | D00912 |
| <a id="SCR-AI-HISTORY-V02"></a> `SCR-AI-HISTORY-V02` | → [RULE-RETENTION](../rules.md#RULE-RETENTION). | state 기본값은 7d/all/all/page1이고 필터 action은 page를 1로 바꾼다; `apps/wake/pages/ailog.js:63` | 없음(확인: `apps/wake/pages/ailog.js:63`) | apps/wake/data/audit.test.mjs — filters by requester group, transport, words and window | D-USR-2026-11-16-7 |
| <a id="SCR-AI-HISTORY-V03"></a> `SCR-AI-HISTORY-V03` | 기간 내 전체 3건 중 검색에 1건이 맞는다 → 요약은 auditCounts(all)의 전체 3건 모수임을 밝히고 표는 1건이다 → 요약의 3건을 검색 결과 수처럼 보이면 실패 | 요약은 auditCounts(all), 표는 auditFilter(found)를 사용한다; `apps/wake/pages/ailog.js:43` | 요약 라벨에 검색 전 전체 모수라는 설명이 없다 | 고정 없음 → TASK-SCREEN-AI-HISTORY | D00466, D00473 |
| <a id="SCR-AI-HISTORY-A01"></a> `SCR-AI-HISTORY-A01` | 실행 실패·거절 기록이 포함된 목록에서 감사 ID를 누른다 → 해당 감사 ID의 상세를 열고 실패·거절 기록도 목록에 유지한다 → 다른 ID를 열거나 실패·거절 기록을 숨기면 실패 | wake.ailog.open은 클릭한 id를 ailog 상세 주소에 넣는다; `apps/wake/pages/ailog.js:77` | 없음(확인: `apps/wake/pages/ailog.js:77`) | 고정 없음 → TASK-SCREEN-AI-HISTORY | D00466, D00473 |
| <a id="SCR-AI-HISTORY-A02"></a> `SCR-AI-HISTORY-A02` | 기록이 있는 목록의 다음 조회를 실패시킨다 → 기존 기록과 읽기 오류를 구분하고 실패를 기록 없음으로 바꾸지 않는다 → 읽기 실패를 정상 0건으로 표시하면 실패 | phase가 ready가 아니면 표 대신 readRow를 반환한다; `apps/wake/pages/ailog.js:38` | 읽기 오류는 구분하지만 마지막 성공 기록 표는 화면에서 사라진다 | 고정 없음 → TASK-SCREEN-AI-HISTORY | D00466, D00473 |
| <a id="SCR-AI-HISTORY-G01"></a> `SCR-AI-HISTORY-G01` | 같은 시각의 기록 2개와 검색 비일치 기록 1개를 조회한다 → 요약의 전체·검색 모수를 구분하고 동점은 불변 ID 오름차순이다 → 새로고침마다 동점 순서가 달라지거나 검색 수를 전체로 표시하면 실패 | 필터 결과를 별도 정렬 없이 slice하여 표에 전달하고 전체를 집계한다; `apps/wake/pages/ailog.js:43` | 화면에서 동점 ID 정렬을 보장하지 않으며 전체 모수 라벨도 없다 | 고정 없음 → TASK-SCREEN-AI-HISTORY | D-USR-2026-11-16-2; D00466 |

## 표별 판단 계약

열 이름·종류·원본식·표시·톤·툴팁·숨김 순서는 머리의 components 계약을 참조한다. 시간 이력 정렬은 사용자 확정 D-USR-2026-11-16-2, 비용 정렬·검색 세부는 D-USR-2026-11-16-7 기본값이다.

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AI-HISTORY-TABLE"></a> `SCR-AI-HISTORY-TABLE` | 감사 기록의 같은 at 두 ID와 결측 시각·실패 행을 조회하고 요청자/실행자/도구/대상/작업을 검색한다 → audit.rows의 at 내림·id 오름, 결측 마지막으로 정렬하고 요청자 유형·경로·기간 필터 뒤 같은 id 상세로 이동한다. 실패는 시간순을 유지하며 톤·필터로 구별한다 → 동점 흔들림·실패 우선 재배치·다른 id 이동이면 실패 | auditIn은 at 차이만 비교하고 auditFilter는 requester·transport·q를 거른다; `apps/wake/data/audit.js:32` | id 동점 정렬과 결측 시각 마지막 처리가 없다 | 고정 없음 → TASK-SCREEN-AI-HISTORY | D-USR-2026-11-16-2; D-USR-2026-11-16-7 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AI-AUDIT"></a> `SCR-AI-AUDIT` | 읽기 성공·거절·모델 전달·사람 승인을 각각 기록한다 → auditLog의 requester·executor·model·permission·at·scope·masked와 실제 result가 목록·상세에 보인다 → 거절을 읽기 성공으로 세면 실패 | 도구 결과를 done에서 마스킹한 args와 result로 auditLog에 추가한다; `apps/wake/desktop/hub-tools.cjs:191` | 없음(확인: `apps/wake/desktop/hub-tools.cjs:191`) | 고정 없음 → TASK-SCREEN-AI-HISTORY | D00466, D00473, D00912 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AI-HISTORY-REQ-R-055"></a> `SCR-AI-HISTORY-REQ-R-055` | → [RULE-RETENTION](../rules.md#RULE-RETENTION). | RETENTION은 AUDIT_RETENTION_DAYS이고 range 기본값은 7d다; `apps/wake/pages/ailog.js:16` | 없음(확인: `apps/wake/pages/ailog.js:16`) | 고정 없음 → TASK-SCREEN-AI-HISTORY | D-USR-2026-11-16-4; D00912; 조회 기본은 D-USR-2026-11-16-7 |
| <a id="SCR-AI-HISTORY-REQ-R-035"></a> `SCR-AI-HISTORY-REQ-R-035` | 서로 다른 requester·transport로 도구 호출과 승인을 수행한다 → audit 기록에 각 요청의 권한과 실제 at이 남아 상세에서 구분된다 → 현재 사용자의 이름이나 조회 시각으로 덮어쓰면 실패 | executor/permission을 표시하고 38행에서 기록의 at을 사용한다; `apps/wake/pages/ailog-detail.js:30` | 목록에는 권한 열이 없으므로 상세에서 확인한다 | 고정 없음 → TASK-SCREEN-AI-HISTORY | D00466, D00473, D00912 |
