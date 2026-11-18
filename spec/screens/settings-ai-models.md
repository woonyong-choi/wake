# 설정 · AI 모델

<a id="SCR-SETTINGS-AI-MODELS"></a> 진입: `wake://settings/ai-models`. 목적(SRE 판단): AI 모델의 대상·설정·실행 결과를 확인한다.
구성: 설정 공통 틀 → AI 모델 sections → settingsRow/connectionRow → 행 끝 컨트롤 하나.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 구독 CLI, API, 로컬, 모델 목록; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-SETTINGS](../components/tables/settings.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-AI-MODELS-01"></a> `SCR-SETTINGS-AI-MODELS-01` | AI 모델 설정을 연다 → AI 정의의 sub·api·local 순서로 공급자 연결 행을 표시한다 → API 계정이 구독 그룹에 들어가면 실패 | AI 목록을 group별로 나눠 aiView와 withForm으로 그린다 ([`apps/wake/app.config.js:302`](../../apps/wake/app.config.js#L302)) | 없음(확인: apps/wake/app.config.js:302) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-MODELS | D00078 |
| <a id="SCR-SETTINGS-AI-MODELS-V01"></a> `SCR-SETTINGS-AI-MODELS-V01` | 구독 CLI가 설치되었지만 로그인하지 않은 상태로 연결한다 → conn-ops의 tool·login 단계가 구분되며 로그인 전 사용 가능으로 표시하지 않는다 → 설치만으로 모델 실행 가능이면 실패 | ai-cli의 확인 순서는 tool·login 두 단계다 ([`apps/wake/desktop/conn-ops.cjs:100`](../../apps/wake/desktop/conn-ops.cjs#L100)) | CLI 모델 발견 단계와 실제 대화 실행 지원은 이 흐름에 없다 | 고정 없음 → TASK-SCREEN-SETTINGS-AI-MODELS | D01000; D-USR-2026-11-16-7 |
| <a id="SCR-SETTINGS-AI-MODELS-V02"></a> `SCR-SETTINGS-AI-MODELS-V02` | API 키를 행 안에 입력하고 제출한다 → 키체인 참조만 저장하고 비밀 입력을 비운다 → 설정 저장소나 재진입 입력에 원문 키가 남으면 실패 | keychain.set 결과 참조를 secrets에 저장하며 옛 참조를 삭제한다 ([`apps/wake/desktop/conn-ops.cjs:111`](../../apps/wake/desktop/conn-ops.cjs#L111)) | 없음(확인: apps/wake/desktop/conn-ops.cjs:111) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-MODELS | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-AI-MODELS-V03"></a> `SCR-SETTINGS-AI-MODELS-V03` | Codex CLI의 모델 목록(codex debug models)이 보이는 모델 하나와 숨긴 모델 하나를 반환하고, Gemini CLI는 설치돼 있지 않다 → 보이는 모델만 목록에 넣고 설치 안 된 CLI는 목록에서 뺀다 → 숨긴 모델이나 없는 CLI를 고를 수 있으면 실패 | 연결한 CLI만, 명령이 있을 때만, CLI가 준 목록 또는 별칭 ([`apps/wake/desktop/ai-cli.cjs:136`](../../apps/wake/desktop/ai-cli.cjs#L136)) | 없음 | `apps/wake/desktop/ai-cli.test.cjs` — `providers lists only connected CLIs that are installed, with the CLI model aliases or the list the CLI gives` | D-USR-2026-11-17-13 |
| <a id="SCR-SETTINGS-AI-MODELS-V04"></a> `SCR-SETTINGS-AI-MODELS-V04` | Anthropic 연결에서 실제 모델 m1만 발견한다 → ai-run.providers의 m1만 선택 가능하다 → 설정에 없는 예시 모델을 선택할 수 있으면 실패 | providers는 ai.models의 응답 모델만 반환한다 ([`apps/wake/desktop/ai-run.cjs:47`](../../apps/wake/desktop/ai-run.cjs#L47)) | 없음(확인: apps/wake/desktop/ai-run.cjs:47) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-MODELS | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-AI-MODELS-A01"></a> `SCR-SETTINGS-AI-MODELS-A01` | API 공급자를 연결하고 설정을 다시 연다 → 저장된 키체인 참조로 같은 공급자 상태를 읽는다 → 이전 키 원문 재입력을 요구하거나 다른 공급자로 바뀌면 실패 | secretOf는 method·target의 참조로 키체인을 조회한다 ([`apps/wake/desktop/conn-ops.cjs:55`](../../apps/wake/desktop/conn-ops.cjs#L55)) | 없음(확인: apps/wake/desktop/conn-ops.cjs:55) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-MODELS | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-AI-MODELS-A02"></a> `SCR-SETTINGS-AI-MODELS-A02` | API 키 입력 행 두 개를 번갈아 열고 제출·취소한다 → wake.conn.form은 한 행만 가리키고 닫힌 입력의 키를 남기지 않는다 → 두 비밀 폼이 동시에 열리면 실패 | withForm은 저장된 form 키와 같은 행에만 입력을 붙인다 ([`apps/wake/app.config.js:561`](../../apps/wake/app.config.js#L561)) | 없음(확인: apps/wake/app.config.js:561) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-MODELS | D00078; D-USR-2026-11-16-7 |
| <a id="SCR-SETTINGS-AI-MODELS-A03"></a> `SCR-SETTINGS-AI-MODELS-A03` | Anthropic 키만 거절시키고 Claude CLI는 정상으로 둔다 → Anthropic 행의 인증 오류만 바뀌고 Claude CLI 상태는 유지된다 → 구독 공급자까지 실패하면 실패 | 공급자마다 aiKey와 aiView를 별도로 계산한다 ([`apps/wake/app.config.js:303`](../../apps/wake/app.config.js#L303)) | 없음(확인: apps/wake/app.config.js:303) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-MODELS | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-AI-MODELS-G01"></a> `SCR-SETTINGS-AI-MODELS-G01` | 모델 없는 첫 질문 뒤 공급자를 추가해 같은 대화를 재개한다 → 첫 질문·실패·후속 질문을 같은 conversation ID 아래에 표시한다 → 첫 질문이 소실되거나 새 ID가 되면 실패 | 모델이 없고 prior가 없으면 conversation null로 반환한다 ([`apps/wake/desktop/ai-run.cjs:135`](../../apps/wake/desktop/ai-run.cjs#L135)) | 첫 질문의 대화 저장·ID 발급 전에 반환한다 | 고정 없음 → TASK-SCREEN-SETTINGS-AI-MODELS | D01000; D-USR-2026-11-16-7 |
| <a id="SCR-SETTINGS-AI-MODELS-G02"></a> `SCR-SETTINGS-AI-MODELS-G02` | 연결한 OpenAI API 또는 구독 CLI로 질문한다 → 연결 확인과 실행 지원 상태를 나누고 미지원이면 실행 불가를 표시한다 → 실행 가능한 공급자로 표시한 뒤 unknown provider이면 실패 | 실행 공급자는 Claude API와 구독 CLI 셋이다 ([`apps/wake/desktop/ai-run.cjs:60`](../../apps/wake/desktop/ai-run.cjs#L60), [`apps/wake/desktop/ai-cli.cjs:34`](../../apps/wake/desktop/ai-cli.cjs#L34)) | OpenAI·Google API 키 행은 아직 실행 지원보다 넓다 | `apps/wake/desktop/ai-cli.test.cjs` — `<cli>: one non-interactive run answers with a Wake tool …` | D01000; D-USR-2026-11-17-12 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-AI-MODELS-REQ-R-012"></a> `SCR-SETTINGS-AI-MODELS-REQ-R-012` | API 키 연결 후 설정 파일·오류·대화 근거를 확인한다 → 키체인 참조와 마스킹된 오류만 보인다 → 평문 자격 증명이 남으면 실패 | saveConns에는 원문 대신 keychain 참조를 기록한다 ([`apps/wake/desktop/conn-ops.cjs:112`](../../apps/wake/desktop/conn-ops.cjs#L112)) | 없음(확인: apps/wake/desktop/conn-ops.cjs:112) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-MODELS | D00466; D-USR-2026-11-16-7 |
