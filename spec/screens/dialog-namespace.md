# 다이얼로그 · namespace 표시 목록 추가

<a id="SCR-DIALOG-NAMESPACE"></a> 진입: `wake.ns.add`. 목적(SRE 판단): namespace 표시 목록 추가의 대상·설정·실행 결과를 확인한다.
구성: name 필수 입력 → 추가.
현재: [apps/wake/app.config.js](../../apps/wake/app.config.js); [apps/wake/ai-connect.js](../../apps/wake/ai-connect.js); [kit/shell/shell.js](../../kit/shell/shell.js); [kit/components/dialog.js](../../kit/components/dialog.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: name DNS 정규식; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
고정 장치: `apps/wake/app.config.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-DIALOG-NAMESPACE-01"></a> `SCR-DIALOG-NAMESPACE-01` | 클러스터 A에서 namespace 추가를 연다 → 필수 name과 Wake 목록에만 추가한다는 wake.ns.addDesc가 보인다 → Kubernetes 생성으로 안내하면 실패 | name 필드와 ns.addDesc를 지정한다; `apps/wake/app.config.js:444` | 없음(확인: `apps/wake/app.config.js:444`) | 고정 없음 → TASK-SCREEN-DIALOG-NAMESPACE | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-NAMESPACE-V01"></a> `SCR-DIALOG-NAMESPACE-V01` | 이름 'prod-1'과 'Prod_1'을 각각 제출한다 → DNS 이름 규칙으로 전자만 wake.ns.added.A에 저장한다 → 대문자·밑줄 이름이 저장되면 실패 | validate 정규식이 소문자·숫자·하이픈만 허용한다; `apps/wake/app.config.js:444` | 문자 규칙은 있지만 63자 상한이 없다 | 고정 없음 → TASK-SCREEN-DIALOG-NAMESPACE | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-NAMESPACE-A01"></a> `SCR-DIALOG-NAMESPACE-A01` | 표시 목록에 namespace 이름을 저장한다 → Kubernetes 생성으로 안내하지 않고 지정 cluster의 저장 목록만 바꾼다 → Kubernetes 생성 요청을 보내거나 다른 cluster 목록을 바꾸면 실패 | wake.ns.added.<cluster> 설정 배열만 갱신한다; `apps/wake/app.config.js:1073` | 없음(확인: `apps/wake/app.config.js:1073`) | 고정 없음 → TASK-SCREEN-DIALOG-NAMESPACE | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-NAMESPACE-A02"></a> `SCR-DIALOG-NAMESPACE-A02` | namespace 이름을 비우고 Enter를 누른다 → SCR-SHARED-05의 필수 검사가 저장을 막고 입력에 오류를 보인다 → 빈 이름이 목록에 생기면 실패 | required name 오류가 있으면 submit.action을 보내지 않는다; `kit/components/dialog.js:159` | 없음(확인: `kit/components/dialog.js:159`) | 고정 없음 → TASK-SCREEN-DIALOG-NAMESPACE | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-NAMESPACE-G01"></a> `SCR-DIALOG-NAMESPACE-G01` | 63자·64자 및 DNS 규칙 위반 이름을 입력한다 → 유효한 63자 이름만 지정 클러스터 표시 목록에 저장한다 → 잘못된 이름 저장이나 Kubernetes Namespace 생성 요청 시 실패 | DNS 정규식에는 최대 길이 검사가 없다; `apps/wake/app.config.js:444` | 64자 이상의 소문자 이름도 통과한다 | 고정 없음 → TASK-SCREEN-DIALOG-NAMESPACE | D-USR-2026-11-16-7 |
