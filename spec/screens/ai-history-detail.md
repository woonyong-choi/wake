# AI 작업 기록 상세

<a id="SCR-AI-HISTORY-DETAIL"></a> 진입: `wake://cluster/:cluster/ailog/:id`. 목적(SRE 판단): 작업 주체·권한·범위·근거·결과를 감사한다.
구성: 한 일·결과 머리 → 인시던트·시각 머리 → 요청/도구/범위/실행주체·권한/모델/대상/질의/근거/양/마스킹.
현재: [apps/wake/pages/ailog-detail.js](../../apps/wake/pages/ailog-detail.js); [apps/wake/pages/incident-parts.js](../../apps/wake/pages/incident-parts.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 기록, 없는 값, 시각; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-INCIDENT-PARTS-01](../components/tables/incident-parts.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-AILOG-DETAIL](../components/tables/ailog-detail.md), [CMP-T-INCIDENT-PARTS-01](../components/tables/incident-parts.md). 화면의 대상/복귀 계약을 함께 적용한다.
고정 장치: `apps/wake/data/audit.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AI-HISTORY-DETAIL-01"></a> `SCR-AI-HISTORY-DETAIL-01` | 감사 ID=a1 상세를 연다 → audit.rows의 a1로 한 일·결과 머리와 인시던트·시각·속성 카드가 보인다 → a2의 속성이 섞이면 실패 | audit 응답 rows에서 params.id와 같은 행을 찾는다; `apps/wake/pages/ailog-detail.js:15` | 없음(확인: `apps/wake/pages/ailog-detail.js:15`) | 고정 없음 → TASK-SCREEN-AI-HISTORY-DETAIL | D00466, D00912 |
| <a id="SCR-AI-HISTORY-DETAIL-V01"></a> `SCR-AI-HISTORY-DETAIL-V01` | executor=e1, permission=read, model=m1인 a1 기록을 연다 → 각 속성 줄은 같은 r의 request·tool·scope·executor·permission·model·target·query·evidence·size·masked를 쓴다 → 다른 기록 값을 보이면 실패 | body의 items는 선택한 row 하나의 속성을 사용한다; `apps/wake/pages/ailog-detail.js:26` | 근거 필드는 원문 링크 없이 번호 문자열만 표시한다 | 고정 없음 → TASK-SCREEN-AI-HISTORY-DETAIL | D00466, D00473, D00912 |
| <a id="SCR-AI-HISTORY-DETAIL-V02"></a> `SCR-AI-HISTORY-DETAIL-V02` | 모델을 쓰지 않은 호출과 모델 필드 유실 기록을 각각 연다 → 전자는 모델 없음, 후자는 기록 누락을 보인다 → 두 경우를 모두 모델 없음으로 표시하면 실패 | r.model이 null이면 모두 wake.ailog.noModel을 사용한다; `apps/wake/pages/ailog-detail.js:31` | 모델 미사용과 수집 누락을 구분하는 상태가 없다 | 고정 없음 → TASK-SCREEN-AI-HISTORY-DETAIL | D00912; 누락 구분은 D-USR-2026-11-16-7 |
| <a id="SCR-AI-HISTORY-DETAIL-V03"></a> `SCR-AI-HISTORY-DETAIL-V03` | 서로 다른 연도에 발생한 r.at 기록을 연다 → ymd+hms로 연도 포함 시각을 보이고 원본 시각·시간대를 확인할 수 있다 → 연도를 생략하거나 시간대를 알 수 없으면 실패 | 요약 머리는 ymd(r.at)와 hms(r.at)를 결합한다; `apps/wake/pages/ailog-detail.js:38` | 원본 ISO 시각과 시간대 설명이 머리 값에 없다 | 고정 없음 → TASK-SCREEN-AI-HISTORY-DETAIL | D00508, D00830 |
| <a id="SCR-AI-HISTORY-DETAIL-A01"></a> `SCR-AI-HISTORY-DETAIL-A01` | 삭제된 감사 ID와 조회 실패 응답을 각각 연다 → 삭제된 기록과 조회 실패를 다른 상태로 표시한다 → 삭제와 읽기 오류를 같은 빈 기록으로 표시하면 실패 | missing은 빈 기록, forbidden/error는 readRow로 분기한다; `apps/wake/pages/ailog-detail.js:41` | 없음(확인: `apps/wake/pages/ailog-detail.js:41`) | 고정 없음 → TASK-SCREEN-AI-HISTORY-DETAIL | D00466, D00473 |
| <a id="SCR-AI-HISTORY-DETAIL-A02"></a> `SCR-AI-HISTORY-DETAIL-A02` | r.evidence=[1]인 기록에서 근거를 누르고 돌아온다 → 해당 근거 이름표가 같은 사건·대상·기간의 원문을 연다 → [1] 글자만 보이거나 링크가 없으면 실패 | evidence는 [n] 문자열 배열을 join한다; `apps/wake/pages/ailog-detail.js:34` | 이름표와 이동 action이 없다 | 고정 없음 → TASK-SCREEN-AI-HISTORY-DETAIL | D00883; 근거 이름표는 D-USR-2026-11-16-7 |
| <a id="SCR-AI-HISTORY-DETAIL-G01"></a> `SCR-AI-HISTORY-DETAIL-G01` | 근거가 있는 감사 기록을 연다 → 근거 이름표에서 해당 원문·대상·기간으로 이동한다 → 번호 문자열만 보이거나 다른 근거를 열면 실패 | 근거 값은 링크 없는 [n] 문자열이다; `apps/wake/pages/ailog-detail.js:34` | 숫자만으로 근거의 대상·기간을 구별하거나 원문으로 이동할 수 없다 | 고정 없음 → TASK-SCREEN-AI-HISTORY-DETAIL | D00466, D00473 |
