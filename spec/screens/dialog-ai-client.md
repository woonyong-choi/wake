# 다이얼로그 · 외부 AI 클라이언트 추가

<a id="SCR-DIALOG-AI-CLIENT"></a> 진입: `wake.ai.client.add`. 목적(SRE 판단): 외부 AI 클라이언트 추가의 대상·설정·실행 결과를 확인한다.
구성: 이름·경로mcp/api·cluster·namespaces·kinds·Secret metadata 선택.
현재: [apps/wake/app.config.js](../../apps/wake/app.config.js); [apps/wake/ai-connect.js](../../apps/wake/ai-connect.js); [kit/shell/shell.js](../../kit/shell/shell.js); [kit/components/dialog.js](../../kit/components/dialog.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: aiserver.client add; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
고정 장치: `apps/wake/app.config.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-DIALOG-AI-CLIENT-01"></a> `SCR-DIALOG-AI-CLIENT-01` | 외부 AI 클라이언트 추가를 연다 → aiClientDialog의 이름·mcp/api·cluster·namespaces·kinds와 Secret 읽기 금지가 보인다 → Secret metadata 읽기를 선택 가능 권한으로 보이면 실패 | secrets 필드는 metadata 한 옵션을 제공한다; `apps/wake/ai-connect.js:49` | Secret metadata 옵션이 D-01의 Secret 읽기 금지와 충돌한다 | 고정 없음 → TASK-SCREEN-DIALOG-AI-CLIENT | D-01; D00965, D00966 |
| <a id="SCR-DIALOG-AI-CLIENT-V01"></a> `SCR-DIALOG-AI-CLIENT-V01` | 이름 bot, transport=api, cluster=A, namespaces=ns1, kinds=Pod로 제출한다 → aiserver.client add에 같은 범위가 저장되고 목록에 bot이 보인다 → 다른 cluster·범위로 저장하면 실패 | add 호출에 name·transport·scope의 cluster/namespaces/kinds를 보낸다; `apps/wake/ai-connect.js:57` | 없음(확인: `apps/wake/ai-connect.js:57`) | 고정 없음 → TASK-SCREEN-DIALOG-AI-CLIENT | D00965, D00966; 입력 필드는 D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-AI-CLIENT-A01"></a> `SCR-DIALOG-AI-CLIENT-A01` | 토큰을 생성하고 클립보드 쓰기 성공·거절을 각각 준다 → 생성 시 한 번만 클립보드로 전달하고 화면·로그에 남기지 않는다 → 토큰을 재노출하거나 로그에 남기거나 복사 거절을 성공으로 알리면 실패 | clipboard.writeText 거절을 빈 catch로 삼키고 tokenCopied 토스트를 띄운다; `apps/wake/ai-connect.js:59` | 클립보드 거절도 복사 성공으로 알린다 | 고정 없음 → TASK-SCREEN-DIALOG-AI-CLIENT | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-AI-CLIENT-A02"></a> `SCR-DIALOG-AI-CLIENT-A02` | 이름을 비운 추가 폼에서 Enter 후 Escape를 누른다 → SCR-SHARED-05에 따라 필수 이름은 제출되지 않고 닫기 후 추가 버튼에 초점이 온다 → 빈 client 생성 또는 초점 소실이면 실패 | required 입력이 비면 오류를 남기고 제출하지 않는다; `kit/components/dialog.js:159` | 없음(확인: `kit/components/dialog.js:159`) | 고정 없음 → TASK-SCREEN-DIALOG-AI-CLIENT | D-USR-2026-11-16-7 |
| <a id="SCR-DIALOG-AI-CLIENT-G01"></a> `SCR-DIALOG-AI-CLIENT-G01` | 토큰 생성 후 클립보드 쓰기를 거절시킨다 → 복사 실패를 표시하고 원문 토큰을 화면·로그에 남기지 않는다 → 복사 성공 토스트가 뜨면 실패 | 토큰이 있으면 복사 결과와 관계없이 tokenCopied를 호출한다; `apps/wake/ai-connect.js:60` | 복사 거절을 알리는 실패 토스트 분기가 없다 | 고정 없음 → TASK-SCREEN-DIALOG-AI-CLIENT | D-USR-2026-11-16-7 |
