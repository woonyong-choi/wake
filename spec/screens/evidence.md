# 근거 상세

<a id="SCR-EVIDENCE"></a> 진입: `wake://cluster/:cluster/incidents/:id/evidence/:n`. 목적(SRE 판단): 결론의 원문·질의·시각·대상·마스킹 범위를 확인한다.
구성: 머리·출처·수집시각 → 범위·적중·마스킹 요약 → query → log/chart/code 원문.
현재: [apps/wake/pages/incident-evidence.js](../../apps/wake/pages/incident-evidence.js); [apps/wake/pages/incident-parts.js](../../apps/wake/pages/incident-parts.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 스냅숏, 로그, 지표, 신선도; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-INCIDENT-PARTS-01](../components/tables/incident-parts.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-INCIDENT-EVIDENCE](../components/tables/incident-evidence.md), [CMP-T-INCIDENT-PARTS-01](../components/tables/incident-parts.md). 화면의 대상/복귀 계약을 함께 적용한다.
고정 장치: `apps/wake/data/incident-model.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-EVIDENCE-01"></a> `SCR-EVIDENCE-01` | 인시던트 i1의 근거 n=2를 연다 → incident.evidence의 n=2로 출처·collectedAt·구간·hits/total/masked·query·원문이 보인다 → 다른 근거의 원문이나 현재 재조회 값이면 실패 | ev는 params.n과 같은 evidence 항목을 찾는다; `apps/wake/pages/incident-evidence.js:21` | 머리는 의미 있는 이름 대신 근거 번호를 사용한다 | 고정 없음 → TASK-SCREEN-EVIDENCE | D00466, D00742; 스냅숏 세부는 D-USR-2026-11-16-7 |
| <a id="SCR-EVIDENCE-V01"></a> `SCR-EVIDENCE-V01` | 수집 뒤 원본 대상 값이 바뀐 근거를 연다 → 저장 e.result가 그대로 보인다 → 원본을 재조회해 과거 원문을 덮으면 실패 | incident 한 건을 조회하며 원본 로그·지표 서비스는 호출하지 않는다; `apps/wake/pages/incident-evidence.js:18` | 없음(확인: `apps/wake/pages/incident-evidence.js:18`) | 고정 없음 → TASK-SCREEN-EVIDENCE | D-USR-2026-11-16-7 |
| <a id="SCR-EVIDENCE-V02"></a> `SCR-EVIDENCE-V02` | total=100, lines=10, hits=2와 중간 누락을 가진 로그 근거를 연다 → total 100·hits 2 및 원래 줄 번호와 생략 행을 표시한다 → 10줄을 전체 10건으로 표기하면 실패 | logView에 원문 줄 번호·hits·gaps=true를 주고 요약은 e.total을 쓴다; `apps/wake/pages/incident-evidence.js:28` | 명시적인 조회 잘림 사유·coverage 필드는 요약에 없다 | 고정 없음 → TASK-SCREEN-EVIDENCE | D00452; 집계 세부는 D-USR-2026-11-16-7 |
| <a id="SCR-EVIDENCE-V03"></a> `SCR-EVIDENCE-V03` | result.series에 container=a,b 두 시리즈를 준다 → 두 라벨·단위·표본을 각각 구별해 볼 수 있다 → 첫 a만 보이고 b가 사라지면 실패 | 지표 body는 result.series[0]만 읽는다; `apps/wake/pages/incident-evidence.js:30` | 두 번째 이후 시리즈가 누락되며 빈 배열이면 s.labels 접근이 실패한다 | 고정 없음 → TASK-SCREEN-EVIDENCE | D00451; 다중 시리즈는 D-USR-2026-11-16-7 |
| <a id="SCR-EVIDENCE-V04"></a> `SCR-EVIDENCE-V04` | collectedAt 이후 출처가 stale인 근거를 연다 → 수집시각과 끊기기 전 자료 안내를 함께 보인다 → 수집시각을 현재 시각으로 바꾸면 실패 | staleLine은 src.name과 e.collectedAt을 사용한다; `apps/wake/pages/incident-evidence.js:52` | 출처 state=unknown은 stale 안내에서 제외되어 원인 불명 수집 상태가 드러나지 않는다 | 고정 없음 → TASK-SCREEN-EVIDENCE | D00451; 신선도는 D-USR-2026-11-16-7 |
| <a id="SCR-EVIDENCE-A01"></a> `SCR-EVIDENCE-A01` | evidence n=2 이름표를 클릭·Enter·Space로 각각 연다 → refs의 cluster·incident·n으로 같은 저장 근거 상세를 한 번 연다 → 입력 방식에 따라 다른 근거를 열거나 키보드가 무반응이면 실패 | 이름표는 role=button·tabindex=0인 span이고 action은 클릭 위임으로 실행된다; `kit/components/ref.js:23` | ref에는 Enter·Space를 click으로 바꾸는 처리나 native button이 없다 | 고정 없음 → TASK-SCREEN-EVIDENCE | D-USR-2026-11-16-7 |
| <a id="SCR-EVIDENCE-A02"></a> `SCR-EVIDENCE-A02` | 근거 대상 삭제와 보존 기간 만료를 각각 발생시킨다 → 보존 스냅숏과 해시는 당시 근거를 가리키고 현재 자료 부재를 구분한다 → 현재 자료 부재 때문에 보존 스냅숏·해시를 바꾸거나 현재 값으로 위장하면 실패 | 조회 failure 또는 근거 부재는 같은 missing 빈 상태로 간다; `apps/wake/pages/incident-evidence.js:46` | 삭제·만료·권한 오류가 분리되지 않고 스냅숏 hash도 화면에 없다 | 고정 없음 → TASK-SCREEN-EVIDENCE | D-USR-2026-11-16-7 |
| <a id="SCR-EVIDENCE-G01"></a> `SCR-EVIDENCE-G01` | 이름과 원문이 있는 근거를 연다 → 머리와 참조를 의미 있는 이름표로 표시한다 → 근거 n만 표시해 원문을 구별할 수 없으면 실패 | 머리 title은 wake.inc.ev.n이며 n만 넣는다; `apps/wake/pages/incident-evidence.js:50` | 근거를 구별하는 의미 있는 이름표가 머리에 없다 | 고정 없음 → TASK-SCREEN-EVIDENCE | D00466, D00742 |
| <a id="SCR-EVIDENCE-G02"></a> `SCR-EVIDENCE-G02` | → [RULE-EVIDENCE](../rules.md#RULE-EVIDENCE). | 등록 refs만 참조 action으로 바꾸며 실제 알약은 ref span을 사용한다; `kit/shell/panel-engine.js:190` | 성공 근거 링크는 생성하지만 span의 Enter·Space 활성화가 구현되지 않았다 | 고정 없음 → TASK-SCREEN-EVIDENCE | D00466, D00473 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-EVIDENCE-REQ-R-071"></a> `SCR-EVIDENCE-REQ-R-071` | 누락된 시계열 구간과 실패한 근거 조회를 연다 → 누락·실패가 표시되고 실제 값 0과 구별된다 → 조회 실패를 빈 정상 근거로 표시하면 실패 | unconfigured 외 조회 failure는 근거 missing과 같은 문구다; `apps/wake/pages/incident-evidence.js:46` | 오류와 만료·삭제를 구분하지 못한다 | 고정 없음 → TASK-SCREEN-EVIDENCE | D00451; coverage는 D-USR-2026-11-16-7 |
| <a id="SCR-EVIDENCE-REQ-R-034"></a> `SCR-EVIDENCE-REQ-R-034` | 동일 evidence n을 원본 변경 전후에 연다 → 저장 target UID·container·query·window·result·hash·masked가 변하지 않고 확인 가능하다 → 새 조회로 원문·해시를 바꾸면 실패 | queryLine은 e.query와 sourceState를 표시한다; `apps/wake/pages/incident-evidence.js:59` | UID·container·hash를 보여 주는 속성 항목이 없다 | 고정 없음 → TASK-SCREEN-EVIDENCE | D-USR-2026-11-16-7 |
