# 인시던트 · 원인

<a id="SCR-INCIDENT-CAUSE"></a> 진입: `wake://cluster/:cluster/incidents/:id (동일 작업면의 cause 구역)`. 목적(SRE 판단): 관측·가설·확정 원인을 근거별로 구분한다.
구성: 작업면 공통 머리 → 원인 summaryBar → 해당 근거/표/계획.
현재: [apps/wake/pages/incident-detail.js](../../apps/wake/pages/incident-detail.js); [apps/wake/data/incident-model.js](../../apps/wake/data/incident-model.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 원인 판단 값; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-INC-01](../components/incident-criteria.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: incident.workspace.chain의 conclusion·grade·source·cells와 evidence[].n을 사용한다. observe는 관측, basis는 기준, interpret는 해석, verify는 확인법, unknown은 확인하지 못한 항목이다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-CAUSE-01"></a> `SCR-INCIDENT-CAUSE-01` | 원인 구역을 펼친다 → workspace.chain의 결론·grade·source와 observe/basis/interpret/verify/unknown이 보인다 → 관측과 해석을 한 항목으로 합치면 실패 | causeSection이 CELLS와 chain.source를 reasoningChain에 전달한다(`apps/wake/pages/incident-detail.js:101`). | 빈 셀은 생략되므로 근거 부족 때 unknown을 공급하는 계약이 필요하다. | `kit/components/reasoning-chain.test.mjs` — `each cell with items is a row of its name and items, every item followed by its references; an empty cell is left out` | D00742 |
| <a id="SCR-INCIDENT-CAUSE-V01"></a> `SCR-INCIDENT-CAUSE-V01` | 관측 근거 2와 미확인 항목이 있는 chain을 받는다 → 관측 뒤 근거 2, unknown 설명, source.name/version이 보인다 → 미확인을 확정 원인으로 표시하면 실패 | grade·source·version·cells·refLabel을 구성한다(`apps/wake/pages/incident-detail.js:102`). | 화면은 공급된 grade를 신뢰하며 읽기 실패 때 등급을 낮추지 않는다. | 고정 없음 → TASK-SCREEN-INCIDENT-CAUSE | D00742 |
| <a id="SCR-INCIDENT-CAUSE-A01"></a> `SCR-INCIDENT-CAUSE-A01` | 원인 관측의 근거 2를 열었다가 돌아온다 → 같은 사건의 evidence/2와 원인 구역으로 복귀한다(SCR-SHARED-01) → 다른 사건이나 번호의 근거를 열면 실패 | wake.inc.ref가 incidentAddress(inc)에 evidence 번호를 붙인다(`apps/wake/pages/incident-detail.js:201`). | 근거 링크에 원래 cause 구역이나 스크롤 위치를 담는 복귀 인수가 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-CAUSE | D00094; D00742 |
| <a id="SCR-INCIDENT-CAUSE-A02"></a> `SCR-INCIDENT-CAUSE-A02` | 로그 근거 수집만 실패한 사건을 연다 → 읽지 못한 로그는 unknown에 남기고 성공한 관측만 연결한다 → 실패 로그를 읽은 것으로 표시하면 실패 | collect는 로그 수집 오류를 catch 후 null로 버린다(`apps/wake/desktop/incident-hub.cjs:191`). | 로그 수집 실패 사유가 chain.unknown으로 전달되지 않는다. | 고정 없음 → TASK-SCREEN-INCIDENT-CAUSE | D00742 |
| <a id="SCR-INCIDENT-CAUSE-G01"></a> `SCR-INCIDENT-CAUSE-G01` | ImagePullBackOff와 CrashLoopBackOff를 각각 입력한다 → 이미지 가져오기 실패와 프로세스 반복 종료를 별개 원인 후보로 표시한다 → ImagePull을 crash-loop로 일반화하면 실패 | SIGNALS.BackOff는 crash-loop이며 Pod 직접 감지는 CrashLoopBackOff만 처리한다(`apps/wake/data/incident-detect.js:17`, `apps/wake/data/incident-detect.js:87`). | ImagePullBackOff 전용 분기가 없다. 이미지 pull BackOff 이벤트도 crash-loop로 분류할 수 있다. | 고정 없음 → TASK-SCREEN-INCIDENT-CAUSE | D00738; D00742 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-CAUSE-REQ-R-070"></a> `SCR-INCIDENT-CAUSE-REQ-R-070` | 외부 회신을 근거로 추가한 원인 사슬을 연다 → chain.grade=supported와 회신 번호, 관측·기준·해석·검증·확인 못함이 구분된다 → 회신을 내부 측정이나 확정 원인으로 바꾸면 실패 | causeStatus는 supported를 구분하지만 workspace는 confirmed/inferred/insufficient만 만든다(`apps/wake/data/incident-model.js:168`, `apps/wake/desktop/incident-hub.cjs:264`). | 외부 회신을 workspace 등급과 근거에 공급하는 경로가 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-CAUSE | D00742; D-USR-2026-11-16-7 |
