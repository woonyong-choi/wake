# 설정 · AI 대화

<a id="SCR-SETTINGS-AI-CHAT"></a> 진입: `wake://settings/ai-chat`. 목적(SRE 판단): AI 대화의 대상·설정·실행 결과를 확인한다.
구성: 설정 공통 틀 → AI 대화 sections → settingsRow/connectionRow → 행 끝 컨트롤 하나.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 알림, 소리, 기본 권한, 추가 질문; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-SETTINGS](../components/tables/settings.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-AI-CHAT-01"></a> `SCR-SETTINGS-AI-CHAT-01` | AI 대화 설정을 연다 → 알림·소리 다음 기본 권한·추가 질문을 app.config의 순서로 표시한다 → 권한 행이 빠지거나 소리 행이 중복되면 실패 | ai-chat은 두 그룹의 네 행을 선언한다 ([`apps/wake/app.config.js:289`](../../apps/wake/app.config.js#L289)) | 없음(확인: apps/wake/app.config.js:289) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CHAT | D00078, D01020 |
| <a id="SCR-SETTINGS-AI-CHAT-V01"></a> `SCR-SETTINGS-AI-CHAT-V01` | OS 알림을 허용하고 창을 배경에 둔 채 알림을 attention만으로 저장한 뒤 승인 요청·답변 완료를 발생시킨다 → kit.ai.notify에 따라 승인 필요 알림만 표시한다 → 완료 알림도 나타나면 실패 | notify는 kit.ai.notify에 없는 종류와 초점 있는 창의 알림을 생략한다 ([`kit/page/kinds/ai/chat.js:68`](../../kit/page/kinds/ai/chat.js#L68)) | 없음(확인: kit/page/kinds/ai/chat.js:68) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CHAT | D00993; D-USR-2026-11-16-7 (attention 필터 세부) |
| <a id="SCR-SETTINGS-AI-CHAT-V02"></a> `SCR-SETTINGS-AI-CHAT-V02` | 소리를 켜고 미리듣기를 누른다 → kit.ai.sound 선택과 같은 알림 소리를 재생한다 → 버튼이 무응답이거나 선택과 다른 소리면 실패 | sound-preview 동작은 playChime을 호출하고 실패를 무시한다 ([`kit/page/kinds/settings.js:226`](../../kit/page/kinds/settings.js#L226)) | 재생 실패가 설정 화면에 표시되지 않는다 | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CHAT | D00993; D-USR-2026-11-16-7 (소리 선택·미리듣기) |
| <a id="SCR-SETTINGS-AI-CHAT-V03"></a> `SCR-SETTINGS-AI-CHAT-V03` | 권한 초기값으로 새 대화를 열고 변경 요청을 한다 → wake.perm.default=read이며 ask를 골라도 사람 승인 전 실행 성공이 보이지 않는다 → ask 선택만으로 변경 완료가 뜨면 실패 | propose_action 결과는 approval 이벤트로 전달하고 계획을 실행 완료로 바꾸지 않는다 ([`apps/wake/desktop/ai-run.cjs:156`](../../apps/wake/desktop/ai-run.cjs#L156)) | 없음(확인: apps/wake/desktop/ai-run.cjs:156) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CHAT | D00466, D00473 |
| <a id="SCR-SETTINGS-AI-CHAT-V04"></a> `SCR-SETTINGS-AI-CHAT-V04` | 응답 중 추가 질문을 보내며 queue와 steer를 각각 고른다 → kit.ai.followUp에 따라 대기 질문 또는 방향 수정으로 처리한다 → 두 모드가 모두 별도 새 대화로 열리면 실패 | queue일 때 사용자 메시지와 문맥을 c.queue에 추가한다 ([`kit/shell/panel-engine.js:82`](../../kit/shell/panel-engine.js#L82)) | 없음(확인: kit/shell/panel-engine.js:82) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CHAT | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-AI-CHAT-A01"></a> `SCR-SETTINGS-AI-CHAT-A01` | 추가 질문을 queue로 저장하고 설정을 다시 연다 → kit.ai.followUp 선택이 queue이고 진행 중 질문은 대기한다 → 선택이나 대기 동작이 steer로 돌아가면 실패 | follow-up select는 queue·steer를 동일 저장 키에 연결한다 ([`apps/wake/app.config.js:297`](../../apps/wake/app.config.js#L297)) | 없음(확인: apps/wake/app.config.js:297) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CHAT | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-AI-CHAT-A02"></a> `SCR-SETTINGS-AI-CHAT-A02` | 알림 선택을 연 뒤 기본 권한 선택을 연다 → 각 선택 목록은 자기 행에 대응하고 연결용 비밀 입력이 생기지 않는다 → 권한 변경이 알림 선택을 덮어쓰면 실패 | perm-default는 알림 키와 분리된 wake.perm.default를 사용한다 ([`apps/wake/app.config.js:296`](../../apps/wake/app.config.js#L296)) | 없음(확인: apps/wake/app.config.js:296) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CHAT | D00078 |
| <a id="SCR-SETTINGS-AI-CHAT-A03"></a> `SCR-SETTINGS-AI-CHAT-A03` | 미리듣기 재생을 실패시키고 기본 권한 read를 유지한다 → 소리 행에 실패가 보이며 권한 선택은 read로 남는다 → 실패를 성공처럼 숨기거나 권한값이 바뀌면 실패 | playChime 거절은 빈 catch로 처리한다 ([`kit/page/kinds/settings.js:226`](../../kit/page/kinds/settings.js#L226)) | 오디오 실패를 행에 전달하지 않는다 | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CHAT | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-AI-CHAT-G01"></a> `SCR-SETTINGS-AI-CHAT-G01` | 소리 행에서 켜기와 미리듣기를 사용한다 → D01020의 행 끝 컨트롤 영역 하나 안에서 조작한다 → 독립된 끝 컨트롤 두 개가 겹치면 실패 | sound 행은 control switch와 별도 stack button을 가진다 ([`apps/wake/app.config.js:293`](../../apps/wake/app.config.js#L293)) | 한 행에 control과 stack 두 동작 영역이 선언되어 있다 | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CHAT | D01020 |
