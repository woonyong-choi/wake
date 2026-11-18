# 알림 상세

<a id="SCR-ALERT-DETAIL"></a> 진입: `wake://cluster/:cluster/alerts/:id`. 목적(SRE 판단): 규칙 식과 실측값으로 발생·해소 이유를 판단한다.
구성: 알림 이름·상태·인시던트 링크 → 심각도·발생/종료 → 식 값 차트·임계값 → 상태 흐름 → Annotations·Rule·Labels·Receivers·과거 발생.
현재: [apps/wake/pages/alert-detail.js](../../apps/wake/pages/alert-detail.js); [apps/wake/data/alerts.js](../../apps/wake/data/alerts.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 알림 신원·대상, 식·임계값, 통지·이력; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-INC-01](../components/incident-criteria.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-ALERT-DETAIL-01](../components/tables/alert-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-ALERT-DETAIL-01](../components/tables/alert-detail.md), [CMP-T-ALERTS-01](../components/tables/alerts.md). 화면의 대상/복귀 계약을 함께 적용한다.
고정 장치: `apps/wake/data/alerts.test.mjs`; `apps/wake/pages/signal-pages.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-ALERT-DETAIL-01"></a> `SCR-ALERT-DETAIL-01` | 알림 상세를 연다 → alertList의 이름·상태·사건, 심각도·시각, expr·임계값, 흐름, Annotations·Rule·Labels·Receivers·이력 순서로 보인다 → Annotations가 expr 앞에 놓이면 실패 | body는 summary·link·notes·expr·rule·steps·labels·recv·hist 순서다; `apps/wake/pages/alert-detail.js:92` | Annotations와 Rule이 목표의 차트·흐름보다 앞에 있다 | 고정 없음 → TASK-SCREEN-ALERT-DETAIL | D-USR-2026-11-16-7 |
| <a id="SCR-ALERT-DETAIL-V01"></a> `SCR-ALERT-DETAIL-V01` | instance=10.0.0.1:9100만 있는 알림을 연다 → instance는 원문 라벨로 남고 실제 Node 신원 확인 전 Node 링크가 없다 → instance를 Node 이름으로 열면 실패 | PLURAL은 instance를 nodes로 매핑한다; `apps/wake/pages/alert-detail.js:17` | instance를 검증 없이 Node 이름으로 사용한다 | 고정 없음 → TASK-SCREEN-ALERT-DETAIL | D00093; D-USR-2026-11-16-7 (instance 신원 대조) |
| <a id="SCR-ALERT-DETAIL-V02"></a> `SCR-ALERT-DETAIL-V02` | 비교 임계값 없는 복합 expr와 빈 표본을 준다 → alertExpr의 실제 표본만 표시하고 thresholdOf=null이면 기준선이 없다 → 임의 임계값·0 표본을 만들면 실패 | thresholdOf 결과가 있을 때만 refs를 만든다; `apps/wake/pages/alert-detail.js:57` | alertExpr 응답의 첫 시리즈만 사용하여 나머지 라벨 집합은 누락된다 | 고정 없음 → TASK-SCREEN-ALERT-DETAIL | D00451; 식 처리는 D-USR-2026-11-16-7 |
| <a id="SCR-ALERT-DETAIL-V03"></a> `SCR-ALERT-DETAIL-V03` | Alertmanager 마지막 성공 뒤 출처를 중단한다 → receivers는 staleLine과 마지막 수집시각을 동반한다 → 현재 통지 성공으로 표시하면 실패 | amOld.stale이면 Receivers 앞에 staleLine을 넣는다; `apps/wake/pages/alert-detail.js:86` | 없음(확인: `apps/wake/pages/alert-detail.js:86`) | 고정 없음 → TASK-SCREEN-ALERT-DETAIL | D00115; D-USR-2026-11-16-7 (receivers 신선도) |
| <a id="SCR-ALERT-DETAIL-A01"></a> `SCR-ALERT-DETAIL-A01` | 과거에 발생하고 해결된 알림을 연다 → 과거 알림을 열면 발생 구간 주변으로 맞추고 시작·해결 마커를 같은 축에 표시한다 → 현재 시간축을 쓰거나 발생·해결 마커를 다른 축에 놓으면 실패 | 오래된 알림은 발생·종료 구간에 여유를 더한 절대 창을 쓴다; `apps/wake/pages/alert-detail.js:28` | 없음(확인: `apps/wake/pages/alert-detail.js:28`) | 고정 없음 → TASK-SCREEN-ALERT-DETAIL | D00830; 알림 창은 D-USR-2026-11-16-7 |
| <a id="SCR-ALERT-DETAIL-A02"></a> `SCR-ALERT-DETAIL-A02` | https·javascript·data URL을 포함한 Annotations를 준다 → Annotations의 https 링크만 외부 링크로 제공한다 → https 외 스킴을 외부 링크로 실행하면 실패 | linkOf는 https://로 시작하는 문자열만 href로 만든다; `apps/wake/pages/alert-detail.js:75` | 없음(확인: `apps/wake/pages/alert-detail.js:75`) | 고정 없음 → TASK-SCREEN-ALERT-DETAIL | D-USR-2026-11-16-7 |
| <a id="SCR-ALERT-DETAIL-A03"></a> `SCR-ALERT-DETAIL-A03` | 알림 상세의 규칙·PromQL·인시던트·리소스 링크를 각각 누른다 → 원본 규칙과 PromQL, 인시던트 및 대상 리소스에 도달할 수 있어야 한다 → 원본 규칙이나 동일 대상 근거에 도달하지 못하면 실패 | 규칙은 codeBlock, PromQL은 차트 info.code로 제공한다; `apps/wake/pages/alert-detail.js:80` | 원본 규칙 또는 PromQL 실행 화면으로 가는 링크 action이 없고 리소스 링크에도 UID가 없다 | 고정 없음 → TASK-SCREEN-ALERT-DETAIL | D-USR-2026-11-16-7 |
| <a id="SCR-ALERT-DETAIL-G01"></a> `SCR-ALERT-DETAIL-G01` | expr 조회를 지연·거절·실패시킨다 → 불러오는 중·권한·오류를 나누고 나머지 성공 카드를 유지한다 → 실패를 빈 정상 차트로 표시하면 실패 | expr 조회는 unconfigured 외 모든 예외를 null로 변환한다; `apps/wake/pages/alert-detail.js:45` | 403 권한 부족도 일반 error로 표시된다 | 고정 없음 → TASK-SCREEN-ALERT-DETAIL | D00114; D00454; D-USR-2026-11-16-7 (expr 부분 실패) |
| <a id="SCR-ALERT-DETAIL-G02"></a> `SCR-ALERT-DETAIL-G02` | PVC 라벨의 알림을 열고 대상 링크를 누른다 → 동일 namespace·PVC UID 상세로 이동한다 → instance를 Node 이름으로 오인하면 실패 | PVC 링크는 namespace와 라벨 이름으로 주소를 만든다; `apps/wake/pages/alert-detail.js:74` | 링크에 PVC UID가 없어 재생성 대상 구별이 불가능하다 | 고정 없음 → TASK-SCREEN-ALERT-DETAIL | D00094; PVC 매핑은 D-USR-2026-11-16-7 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-ALERT-EXPR"></a> `SCR-ALERT-EXPR` | rule.expr='up < 1', for=5m와 Pod 알림을 연다 → expr 표본과 기준값 1·연산자 <·기간 5m 및 같은 UID 대상 링크가 보인다 → 비교 방향이 뒤집히거나 다른 Pod면 실패 | 임계값 요약은 th.value만 표시하며 rule의 for는 규칙 카드에 넣는다; `apps/wake/pages/alert-detail.js:58` | 연산자는 임계값 요약에서 빠지고 대상 링크는 이름 기반이다 | 고정 없음 → TASK-SCREEN-ALERT-DETAIL | D-USR-2026-11-16-7 |
