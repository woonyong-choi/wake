# AI 칸 · 문맥 칩

<a id="SCR-AI-CONTEXT"></a> 진입: `AI 작성창과 답변의 context`. 목적(SRE 판단): 질문의 대상·구간·출처 범위를 확인한다.
구성: 작성창 문맥 칩 → 대상 이름·출처 상태 → 제거/대상 열기.
현재: [apps/wake/ai-hub.js](../../apps/wake/ai-hub.js); [apps/wake/desktop/ai-run.cjs](../../apps/wake/desktop/ai-run.cjs); [apps/wake/app.config.js](../../apps/wake/app.config.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 대상, 포함; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
고정 장치: `apps/wake/ai-target-flow.test.mjs`; `apps/wake/desktop/ai-target.test.cjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AI-CONTEXT-01"></a> `SCR-AI-CONTEXT-01` | 현재 도구 탭에서 질문을 작성한다 → req.context.ref의 cluster·kind가 문맥 칩과 ai.run.target에 유지된다 → 전역 scope로 대체되면 실패 | context.ref가 있으면 askedTarget 결과를 target으로 보낸다; `apps/wake/ai-hub.js:57` | 없음(확인: `apps/wake/ai-hub.js:57`) | apps/wake/ai-hub.test.mjs — a question from a tool page carries the tool's cluster and kind to ai.run as the target, the global scope as scope | D00452; 문맥 칩은 D-USR-2026-11-16-7 |
| <a id="SCR-AI-CONTEXT-V01"></a> `SCR-AI-CONTEXT-V01` | cluster='팀/prod:서울'인 등록 문맥을 붙인다 → contextId 원문을 칩 이름과 요청 target.cluster에 유지한다 → 콜론·슬래시를 잘라 다른 cluster로 보내면 실패 | refOf가 유효한 contextId 원문을 cluster에 그대로 넣는다; `apps/wake/ai-hub.js:38` | 없음(확인: `apps/wake/ai-hub.js:38`) | 고정 없음 → TASK-SCREEN-AI-CONTEXT | D00093; D-USR-2026-11-16-7 (contextId 문자 보존) |
| <a id="SCR-AI-CONTEXT-V02"></a> `SCR-AI-CONTEXT-V02` | 미등록 target과 get_evidence 실패 응답을 각각 준다 → ai.run은 미등록 target을 거절하고 성공 조회의 e.n·cluster·incident만 이름표로 표시한다 → 실패를 성공 근거로 표시하면 실패 | citedIn은 성공 조회로 모인 used 사건의 pieces만 refs로 만든다; `apps/wake/desktop/ai-run.cjs:109` | 없음(확인: `apps/wake/desktop/ai-run.cjs:109`) | 고정 없음 → TASK-SCREEN-AI-CONTEXT | D00466, D00473 |
| <a id="SCR-AI-CONTEXT-A01"></a> `SCR-AI-CONTEXT-A01` | 문맥 칩을 지우고 같은 페이지를 갱신한 뒤 다른 페이지로 이동한다 → 칩을 제거한 탭은 같은 페이지에서 다시 자동 부착하지 않고 페이지가 바뀌면 새 문맥을 반영한다 → 같은 페이지에서 지운 칩이 재부착되거나 새 페이지 문맥을 놓치면 실패 | contextOff와 JSON.stringify(askContext)를 비교해 삭제한 문맥 칩을 숨긴다; `kit/page/kinds/ai/chat.js:38` | 칩의 신원 비교가 페이지 주소가 아닌 문맥 JSON이어서 같은 문맥의 다른 페이지 이동을 구별하지 못한다 | 고정 없음 → TASK-SCREEN-AI-CONTEXT | D-USR-2026-11-16-7 |
| <a id="SCR-AI-CONTEXT-A02"></a> `SCR-AI-CONTEXT-A02` | 도구 문맥의 cluster·대상·구간을 정해 질문한다 → 도구의 실제 클러스터·출처·대상·기간이 모델 요청과 감사 저장까지 같아야 한다 → 모델 요청과 감사 저장의 대상·기간이 다르면 실패 | refOf는 cluster와 허용 kind만 반환한다; `apps/wake/ai-hub.js:38` | 대상 UID·namespace·절대 기간은 refOf 반환에 없어 모델 요청의 동일 범위를 보장하지 않는다 | 고정 없음 → TASK-SCREEN-AI-CONTEXT | D00452 |
| <a id="SCR-AI-CONTEXT-G01"></a> `SCR-AI-CONTEXT-G01` | 콜론·슬래시·비ASCII 및 1024자 경계의 context로 질문한다 → 원래 cluster·scope를 손실 없이 전달하거나 명시적으로 거절한다 → 문자열 절단으로 다른 허용 대상에 매칭되면 실패 | askedTarget은 잘못된 입력도 잘라내지 않고 호스트에 전달한다; `apps/wake/ai-hub.js:37` | 없음(확인: `apps/wake/ai-hub.js:37`) | apps/wake/ai-target-flow.test.mjs — a target id goes to the hub as given: 1024 characters pass, 1025 or a control character at 1025 are refused, a longer id never matches a registered prefix | D00093; D-USR-2026-11-16-7 (1024자 경계) |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AI-TARGET"></a> `SCR-AI-TARGET` | 미등록·제거·1025자 target으로 질문한다 → ai.run이 모델 호출 전에 거절하고 같은 대화에 오류를 보존한다 → 다른 등록 scope로 대체하거나 거절을 저장하지 않으면 실패 | ai.run에 conversation ID와 원형 target을 전달한다; `apps/wake/ai-hub.js:55` | UID·window까지 묶은 리소스 문맥은 현재 cluster/kind 전달 계약에 없다 | apps/wake/desktop/ai-target.test.cjs — an unregistered or malformed target is refused before any model call, the person is told, and the conversation keeps the refusal | D00660; 구체 거절은 D-USR-2026-11-16-7 |
| <a id="SCR-AI-GUARD"></a> `SCR-AI-GUARD` | 허용되지 않은 대상의 읽기를 AI에 요청한다 → 호스트가 거절하고 감사에 요청자·대상·실패를 남긴다 → 프롬프트 허용 문구만으로 읽거나 성공 근거를 만들면 실패 | inScope 거절은 forbidden 반환 전에 감사에 기록하며 도구 실행으로 진행하지 않는다; `apps/wake/desktop/hub-tools.cjs:201` | 없음(확인: `apps/wake/desktop/hub-tools.cjs:201`) | 고정 없음 → TASK-SCREEN-AI-CONTEXT | D00466, D00473, D00742 |
