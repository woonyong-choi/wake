# 인시던트 목록

<a id="SCR-INCIDENTS"></a> 진입: `wake://cluster/:cluster/incidents`. 목적(SRE 판단): 지금 대응할 사건과 해결 사건을 구분한다.
구성: 머리 → 클러스터 검색·상태·기간 → 인시던트 요약 → 사건 표.
현재: [apps/wake/pages/cluster-home.js](../../apps/wake/pages/cluster-home.js); [apps/wake/data/incident-model.js](../../apps/wake/data/incident-model.js); [apps/wake/data/home.js](../../apps/wake/data/home.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 사건 목록, 범위·개수; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-INC-01](../components/incident-criteria.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-CLUSTER-HOME-01](../components/tables/cluster-home.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-CLUSTER-HOME-01](../components/tables/cluster-home.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: incident.list의 id·number·cluster·ns·target·sev·phase·at·result·ttr가 목록의 원본이다. result가 없으면 열린 사건, 있으면 해결 사건으로 분류한다. 필터와 페이지는 이 원본을 기준으로 계산한다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENTS-01"></a> `SCR-INCIDENTS-01` | incident.list에 열린 사건과 해결 사건을 공급한다 → 검색·결과·기간 도구 줄 아래 열린 목록과 지난 사건 표가 분리된다 → 해결 사건이 열린 수에 포함되면 실패 | incidentsView는 result 유무로 open/inRange를 나누어 두 카드를 만든다(`apps/wake/pages/incident-parts.js:111`). | 없음(확인: apps/wake/pages/incident-parts.js:111) | 고정 없음 → TASK-SCREEN-INCIDENTS | D00092; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENTS-V01"></a> `SCR-INCIDENTS-V01` | 서로 다른 ID의 사건 두 개를 공급한다 → 각 행에 감지 at·target 범위·sev·phase·재발·result가 해당 ID로 보인다 → 동명 사건을 합치거나 다른 결과를 붙이면 실패 | 열린 행은 id·number/title·alert/sev/cluster/ns·phase를 표시한다(`apps/wake/pages/incident-parts.js:126`). | 대상 UID와 재발 회차/이전 사건 링크가 행 모델·표시에 없다. | 고정 없음 → TASK-SCREEN-INCIDENTS | D00092; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENTS-V02"></a> `SCR-INCIDENTS-V02` | 열린 2건·선택 기간 해결 3건·기간 밖 해결 4건을 준다 → 열린 2, 기간 해결 3, 보관 해결 7이 구분된다 → 전체 9건을 기간 해결 수로 표시하면 실패 | openRows.length·rows.length·해결 list 길이를 각 머리에 쓴다(`apps/wake/pages/incident-parts.js:125`, `apps/wake/pages/incident-parts.js:131`). | 없음(확인: apps/wake/pages/incident-parts.js:125) | 고정 없음 → TASK-SCREEN-INCIDENTS | D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENTS-A01"></a> `SCR-INCIDENTS-A01` | 검색 q와 result 필터를 적용한 목록 2페이지에서 사건 ID를 열고 복귀한다 → 같은 incident.id 작업면을 열며 복귀 시 q/result/page/range·스크롤·선택 행을 복원한다 → 다른 ID를 열거나 목록 상태를 잃으면 실패 | wake.home.incident는 id로 대상을 찾지만 목록 상태는 지역 변수 st.inc다(`apps/wake/pages/cluster-home.js:366`, `apps/wake/pages/cluster-home.js:421`). | 페이지 재생성 시 q/result/page/range와 스크롤 복원 저장이 없다. | 고정 없음 → TASK-SCREEN-INCIDENTS | D00094 |
| <a id="SCR-INCIDENTS-A02"></a> `SCR-INCIDENTS-A02` | → [RULE-RECOVERY](../rules.md#RULE-RECOVERY). | detect는 closed 이후 새 detectedAt으로 stableId를 만든다(`apps/wake/data/incident-detect.js:127`). | 24시간 repeat 처리와 이전 사건 링크가 없고 이름 기반 key가 UID를 포함하지 않는다. | 고정 없음 → TASK-SCREEN-INCIDENTS | D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENTS-G01"></a> `SCR-INCIDENTS-G01` | PVC·ImagePull·Application·CronJob 실패/정상화 입력을 각각 제공한다 → 실제 대상별 사건·원인·신호 해제 상태를 구분한다 → 잘못된 종류·사건 누락·영구 발생 상태를 정상 검증으로 보고하면 실패 | signalsOf는 제한된 알림 대상과 SIGNALS 이유만 처리한다(`apps/wake/data/incident-detect.js:62`, `apps/wake/data/incident-detect.js:72`). | PVC·Application 알림과 ImagePull 전용 규칙이 없으며 입력 종류별 해제 검증도 없다. | 고정 없음 → TASK-SCREEN-INCIDENTS | D00092; D00738; D-USR-2026-11-16-7 |

## 표별 판단 계약

열의 원본식·단위·톤·툴팁·숨김 순서는 머리의 구성 요소 계약을 참조한다.

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENTS-TABLE"></a> `SCR-INCIDENTS-TABLE` | → [RULE-SORT](../rules.md#RULE-SORT). | apps/wake/pages/incident-parts.js:114 incidentsView()는 열린/지난 사건을 나누지만 :123과 :130에서 정렬 없이 필터 결과를 렌더한다 | 심각도·감지 시각·ID 비교 정렬이 없다. 기간은 해결 목록에만 적용된다 | 고정 없음 → TASK-SCREEN-INCIDENTS | D-USR-2026-11-16-7, D00092 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-CONNECTION"></a> `SCR-INCIDENT-CONNECTION` | 1. incident.list가 unconfigured인 목록과 대화 탭을 연다 → sourceOff 안내에서 해당 cluster의 에이전트 연결 관리로 이동하고 머리에 연결 체크를 중복하지 않는다 → 동작 없는 안내나 중복 체크면 실패.<br>2. 입력 같은 에이전트 연결 상태로 홈과 인시던트를 연다 → 기대 같은 연결 상태 부품과 관리 진입을 사용 → 실패 면마다 연결 여부가 다르게 보이거나 한쪽에서 항목 소실. | 인시던트 실패 분기는 action 없는 emptyState다(`apps/wake/pages/cluster-home.js:369`). | 미연결 안내에서 에이전트 연결 관리로 가는 동작이 없다. | 고정 없음 → TASK-SCREEN-INCIDENTS | D00449; D00506; D00327 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENTS-REQ-R-050"></a> `SCR-INCIDENTS-REQ-R-050` | incident.list 한 응답에 열린 사건과 서로 다른 결과/기간 사건을 준다 → 안정 ID·제목·알림·단계·결과·시각·걸린 시간과 구간/전체 수가 같은 응답에서 나온다 → 카드마다 다른 목록을 세면 실패 | cluster-home이 한 incidents 배열을 incidentsView에 전달한다(`apps/wake/pages/cluster-home.js:371`). | 열린 목록은 단계·알림을, 지난 표는 결과·시간을 보여 모든 필드를 두 영역에서 공통 제공하지 않는다. | 고정 없음 → TASK-SCREEN-INCIDENTS | D00092; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENTS-LAB-P1"></a> `SCR-INCIDENTS-LAB-P1` | PVC 대상 알림과 대상 라벨 없는 알림을 공급한다 → 실제 kind/namespace/UID 사건 또는 연결 불가 이유가 보인다 → PVC를 Node로 바꾸거나 조용히 버리면 실패 | 알림 ref에 PVC 분기가 없고 ref가 없으면 continue한다(`apps/wake/data/incident-detect.js:62`). | PVC가 누락되고 대상 없는 신호의 거절 사유도 남기지 않는다. | 고정 없음 → TASK-SCREEN-INCIDENTS | D00092; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENTS-LAB-P2"></a> `SCR-INCIDENTS-LAB-P2` | waiting.reason을 ImagePullBackOff와 CrashLoopBackOff로 각각 준다 → 이미지 pull 실패와 반복 종료가 다른 원인·신호로 보인다 → 둘 다 crash-loop이면 실패 | Pod 분기는 CrashLoopBackOff만 직접 만들고 BackOff 이벤트는 crash-loop다(`apps/wake/data/incident-detect.js:17`, `apps/wake/data/incident-detect.js:87`). | 이미지 pull 실패의 별도 규칙과 상태 연결이 없다. | 고정 없음 → TASK-SCREEN-INCIDENTS | D00738; D00742; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENTS-LAB-P3"></a> `SCR-INCIDENTS-LAB-P3` | Application namespace·UID·revision이 있는 장애 알림을 공급한다 → 해당 Application 사건과 같은 revision 근거가 연결된다 → 다른 앱이나 revision의 사건으로 열리면 실패 | 알림 target 분기에 Application이 없고 context app 근거는 이미 생긴 사건에만 붙는다(`apps/wake/data/incident-detect.js:62`, `apps/wake/desktop/incident-hub.cjs:193`). | Application 알림에서 사건을 만드는 진입 경로가 없다. | 고정 없음 → TASK-SCREEN-INCIDENTS | D00094; D00106; D-USR-2026-11-16-7 |

<a id="SCR-INCIDENT-TIME-COUNT"></a>


## SCR-INCIDENT-TIME-COUNT

- 목표: 관측 시각과 반복 횟수가 있는 인시던트 행 및 긴 시각을 넣는다. 같은 줄의 시각은 [RULE-TIME](../rules.md#RULE-TIME), 반복 분류는 [RULE-TONE](../rules.md#RULE-TONE)을 따른다. 두 줄로 나뉘거나 실제 횟수가 누락되면 실패다.
- 추가 조건: 횟수 1과 다수에서 같은 표시 규칙을 적용한다. D00325·D00452의 과거 모양과 최신 결정의 충돌은 [결정 통일 목록](../decisions.md#영역-간-추천-통일-목록)에 기록한다.
- 추가 조건: 입력 긴 이벤트 메시지·반복 횟수·시각·연결된 AI 대화가 있는 상세 → 기대 한 줄 이벤트에서 시각·횟수의 위치를 유지하고 반복 분류는 [RULE-TONE](../rules.md#RULE-TONE)을 따른다. 같은 대상 AI 진입은 하나 → 실패 시각/횟수 위치 불일치 또는 중복 AI 진입. 공통 판정은 [SCR-EVENT-INVESTIGATE](events.md#SCR-EVENT-INVESTIGATE)에 연결한다.
- 현재: Warning 요약이 대상·Reason별 발생을 집계한다.(`apps/wake/data/incident-model.js:149`)
- 차이: 관측 시각·횟수의 한 줄 배치와 x 없는 공통 표현을 화면에서 고정해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-INCIDENTS
- 출처: D00325; D00351; D00452
