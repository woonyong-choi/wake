# 첫 실행 · AI 연결

<a id="SCR-ONBOARDING-AI"></a> 진입: `셸 firstRun.steps.ai`. 목적(SRE 판단): AI 연결의 대상·설정·실행 결과를 확인한다.
구성: firstRun AI 연결 단계 → 공통 연결 행/선택/다음 동작.
현재: [apps/wake/app.config.js](../../apps/wake/app.config.js); [kit/components/first-run.js](../../kit/components/first-run.js). 2026-11-17 H-006에서 실제 Electron의 해당 단계 다크·라이트를 확인했다. 세부 상태별 판정과 미검증 범위는 [H-006 실행 판정](../tasks.md#H-006-run)을 따른다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 공급자 목록; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.

자료: firstRun의 ai 단계, connView의 공급자 연결 상태와 aiHub.models가 출처다. 인증 연결과 실제 모델 발견은 다른 상태이며 실제 읽기에 성공한 모델만 선택할 수 있다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-ONBOARDING-AI-01"></a> `SCR-ONBOARDING-AI-01` | AI 연결 단계에 진입한다 → AI 정의의 sub·api·local 공급자가 공통 연결 행과 다음/AI 없이 계속 버튼으로 보인다 → 빈 예시 공급자나 동작 없는 연결 버튼이면 실패 | aiGroups가 AI 그룹을 순회해 connRowOf를 구성한다(`apps/wake/app.config.js:568`). | 없음(확인: apps/wake/app.config.js:568) | 고정 없음 → TASK-SCREEN-ONBOARDING-AI | D00078; D01003 |
| <a id="SCR-ONBOARDING-AI-V01"></a> `SCR-ONBOARDING-AI-V01` | CLI 미설치·API 인증 실패·다른 CLI 연결 성공을 각각 공급한다 → connView 상태에 맞는 설치·로그인·연결됨과 동작이 해당 공급자에 보인다 → 다른 공급자 상태를 복사하면 실패 | aiView의 연결 상태와 행동을 공급자 key별 행에 넣는다(`apps/wake/app.config.js:571`). | 없음(확인: apps/wake/app.config.js:571) | `apps/wake/data/connect-flow.test.mjs` — `AI API 키: 키가 거부되면 인증에서 로그인 필요, 동작은 다시 입력` | D00078 |
| <a id="SCR-ONBOARDING-AI-A01"></a> `SCR-ONBOARDING-AI-A01` | 공급자를 연결하지 않고 계속을 선택한다 → 모델이 없어도 AI 없이 계속할 수 있다 → AI 모델 연결을 필수로 강제해 다음 단계를 막으면 실패 | aiConnected가 0이면 primary를 wake.fr.ai.without으로 지정하며 required를 두지 않는다(`apps/wake/app.config.js:1264`). | 없음(확인: apps/wake/app.config.js:1264) | 고정 없음 → TASK-SCREEN-ONBOARDING-AI | D-USR-2026-11-16-7 |
| <a id="SCR-ONBOARDING-AI-A02"></a> `SCR-ONBOARDING-AI-A02` | 공급자 인증은 성공했지만 aiHub.models 발견은 아직 대기 중이다 → connView 연결 행은 모델 발견 전 완료로 표시되지 않는다 → 모델 0개인 대기 상태를 연결 완료로 표시하면 실패 | aiConnected는 connView.connected로 공급자 수를 세고 aiHub.models는 별도로 공급한다(`apps/wake/app.config.js:539`, `apps/wake/app.config.js:1314`). | 연결 완료 집계가 실제 모델 목록 발견 완료와 결합되어 있지 않다. | 고정 없음 → TASK-SCREEN-ONBOARDING-AI | D00078, D-USR-2026-11-16-7 |
| <a id="SCR-ONBOARDING-AI-G01"></a> `SCR-ONBOARDING-AI-G01` | 공급자 미설정 첫 질문 뒤 온보딩에서 연결하고 다시 질문한다 → 원래 대화 ID·첫 질문·실패와 후속 질문을 보존한다 → 연결 과정에서 첫 질문이 사라지면 실패 | AI 단계의 aiGroups는 연결 설정만 다루며 진행 중 대화 ID를 받지 않는다(`apps/wake/app.config.js:568`). | 온보딩 연결 뒤 원래 대화로 돌아가는 ID·질문 복원 계약이 없다. | 고정 없음 → TASK-SCREEN-ONBOARDING-AI | D00078 |
