# 설정 · 외부 AI 연결

<a id="SCR-SETTINGS-AI-CONNECT"></a> 진입: `wake://settings/ai-connect`. 목적(SRE 판단): 외부 AI 연결의 대상·설정·실행 결과를 확인한다.
구성: 설정 공통 틀 → 외부 AI 연결 sections → settingsRow/connectionRow → 행 끝 컨트롤 하나.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 경로, 클라이언트, 최근 호출; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-SETTINGS](../components/tables/settings.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-AI-CONNECT-01"></a> `SCR-SETTINGS-AI-CONNECT-01` | AI 연결 설정을 연다 → aiserver.state의 경로·클라이언트와 audit.query의 최근 호출을 차례로 표시한다 → 요청 이력을 클라이언트 목록으로 섞으면 실패 | sections는 transports·clients·calls 순으로 반환한다 ([`apps/wake/ai-connect.js:24`](../../apps/wake/ai-connect.js#L24)) | 없음(확인: apps/wake/ai-connect.js:24) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CONNECT | D00965; D-USR-2026-11-16-7 |
| <a id="SCR-SETTINGS-AI-CONNECT-V01"></a> `SCR-SETTINGS-AI-CONNECT-V01` | HTTP API를 켜되 포트가 이미 사용 중이다 → 실제 listener 오류와 127.0.0.1 주소 상태를 구분하고 연결 성공으로 표시하지 않는다 → 스위치 켜짐만으로 수신 중이면 실패 | 원하는 스위치 값으로 aiserver.set을 호출하고 반환 오류를 설명에 쓴다 ([`apps/wake/ai-connect.js:22`](../../apps/wake/ai-connect.js#L22)) | 서비스가 실패로 꺼져도 화면의 저장된 스위치 값은 다시 맞추지 않는다 | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CONNECT | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-AI-CONNECT-V02"></a> `SCR-SETTINGS-AI-CONNECT-V02` | cluster=c·namespaces=[prod]·kinds=[Pod] 클라이언트를 만든다 → 행에 c·prod·Pod 범위를 보이고 토큰 원문은 다시 표시하지 않는다 → 토큰이나 다른 범위가 행에 보이면 실패 | scopeLine은 scope의 cluster·namespaces·kinds를 설명으로 만든다 ([`apps/wake/ai-connect.js:31`](../../apps/wake/ai-connect.js#L31)) | 없음(확인: apps/wake/ai-connect.js:31) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CONNECT | D00965; D-USR-2026-11-16-7 |
| <a id="SCR-SETTINGS-AI-CONNECT-V03"></a> `SCR-SETTINGS-AI-CONNECT-V03` | 외부 client-a 호출을 forbidden으로 감사 저장한다 → 최근 호출에 client-a·transport·at·권한 없음 결과가 보인다 → 요청자를 생략하거나 성공으로 표시하면 실패 | calls는 audit 행의 summary·client·transport·at·result를 렌더한다 ([`apps/wake/ai-connect.js:35`](../../apps/wake/ai-connect.js#L35)) | 없음(확인: apps/wake/ai-connect.js:35) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CONNECT | D00466, D00473 |
| <a id="SCR-SETTINGS-AI-CONNECT-A01"></a> `SCR-SETTINGS-AI-CONNECT-A01` | MCP를 켜고 다른 설정을 거쳐 돌아온다 → wake.ai.mcp와 aiserver.state의 실제 수신 상태를 대조해 표시한다 → 수신 실패를 켜진 스위치만으로 숨기면 실패 | 페이지를 그릴 때 state를 읽고 설정과 다르면 set을 다시 호출한다 ([`apps/wake/ai-connect.js:21`](../../apps/wake/ai-connect.js#L21)) | 실패한 원하는 상태가 저장되어 재진입마다 수신을 재시도한다 | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CONNECT | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-AI-CONNECT-A02"></a> `SCR-SETTINGS-AI-CONNECT-A02` | 클라이언트 추가 폼을 취소하고 다시 연다 → name·scope는 새 입력 상태이며 직전 발급 토큰을 재표시하지 않는다 → 토큰이 입력란에 복원되면 실패 | 추가 폼은 이름·경로·범위 필드만 생성하고 토큰 필드는 만들지 않는다 ([`apps/wake/ai-connect.js:43`](../../apps/wake/ai-connect.js#L43)) | 없음(확인: apps/wake/ai-connect.js:43) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CONNECT | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-AI-CONNECT-A03"></a> `SCR-SETTINGS-AI-CONNECT-A03` | 빈 이름으로 제출한 뒤 기존 클라이언트 목록을 확인한다 → name 필드에 오류를 표시하고 기존 client id·lastCall은 유지한다 → 오류 없이 멈추거나 빈 이름 행이 생기면 실패 | name 또는 cluster가 없으면 add 동작이 반환한다 ([`apps/wake/ai-connect.js:56`](../../apps/wake/ai-connect.js#L56)) | 유효성 거절 시 해당 입력의 오류 문구는 이 동작에서 만들지 않는다 | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CONNECT | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-AI-CONNECT-G01"></a> `SCR-SETTINGS-AI-CONNECT-G01` | lastCall 값이 긴 클라이언트 행을 연다 → 시간은 값으로 읽히고 동작은 더보기 하나이다 → 시간 값이 독립 버튼이 되거나 더보기와 겹치면 실패 | control group 안에 value와 more 하나를 넣는다 ([`apps/wake/ai-connect.js:32`](../../apps/wake/ai-connect.js#L32)) | 없음(확인: apps/wake/ai-connect.js:32) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CONNECT | D01020 |
| <a id="SCR-SETTINGS-AI-CONNECT-G02"></a> `SCR-SETTINGS-AI-CONNECT-G02` | 토큰 생성 후 clipboard.writeText를 거절한다 → 복사 실패를 표시하며 토큰 원문은 다른 표면에 노출하지 않는다 → tokenCopied 성공 토스트이면 실패 | 클립보드 거절을 삼킨 뒤 tokenCopied 토스트를 무조건 호출한다 ([`apps/wake/ai-connect.js:59`](../../apps/wake/ai-connect.js#L59)) | 복사 실패도 성공으로 표시한다 | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CONNECT | D-USR-2026-11-16-7 (세부 동작 기본값) |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AI-CLIENTS"></a> `SCR-AI-CLIENTS` | 같은 범위로 MCP와 HTTP에서 리소스 읽기를 호출한다 → 허용 범위와 전송 방식이 기록되고 실제 응답 상태가 최근 호출에 보인다 → 경로 활성화만으로 읽기 성공이면 실패 | MCP와 API는 tools.call에 전송 방식별 caller를 전달한다 ([`apps/wake/desktop/hub-server.cjs:61`](../../apps/wake/desktop/hub-server.cjs#L61)) | 없음(확인: apps/wake/desktop/hub-server.cjs:61) | apps/wake/desktop/hub.test.cjs :: a call is checked, scoped and audited with its transport; out of scope ends forbidden and is recorded | D00965, D00466 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-AI-CONNECT-REQ-R-036"></a> `SCR-SETTINGS-AI-CONNECT-REQ-R-036` | MCP·HTTP·내장 AI에서 같은 도구와 인자를 요청한다 → 중앙 도구의 inputSchema 검증과 동일 읽기 결과가 적용된다 → 전송 방식에 따라 범위 검증이 생략되면 실패 | 중앙 call은 tool.input 검증 뒤 inScope를 검사하며 MCP·HTTP와 ai-run이 이 함수를 호출한다 ([`apps/wake/desktop/hub-tools.cjs:195`](../../apps/wake/desktop/hub-tools.cjs#L195)) | 없음(확인: apps/wake/desktop/hub-tools.cjs:195) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CONNECT | D00965; D-USR-2026-11-16-7 |
| <a id="SCR-SETTINGS-AI-CONNECT-REQ-R-037"></a> `SCR-SETTINGS-AI-CONNECT-REQ-R-037` | 외부 클라이언트가 조치 제안 뒤 승인·실행 메서드를 호출한다 → 제안은 대기, 승인·실행 호출은 거절되며 쓰기 결과가 없다 → 외부 호출로 변경 완료이면 실패 | propose_action은 승인 대기 요청만 만드는 도구이다 ([`apps/wake/desktop/hub-tools.cjs:168`](../../apps/wake/desktop/hub-tools.cjs#L168)) | 없음(확인: apps/wake/desktop/hub-tools.cjs:168) | 고정 없음 → TASK-SCREEN-SETTINGS-AI-CONNECT | D00466, D00473 |
| <a id="SCR-SETTINGS-AI-CONNECT-REQ-R-039"></a> `SCR-SETTINGS-AI-CONNECT-REQ-R-039` | 초기 상태에서 MCP·API를 확인하고 서로 다른 경로의 토큰을 교차 사용한다 → 기본 꺼짐·loopback 전용이며 잘못된 경로 토큰은 거절된다 → 외부 주소 수신이나 토큰 교차 허용이면 실패 | config 기본값은 mcp false·api false이며 클라이언트별 tokenHash를 저장한다 ([`apps/wake/desktop/hub-server.cjs:23`](../../apps/wake/desktop/hub-server.cjs#L23)) | 없음(확인: apps/wake/desktop/hub-server.cjs:23) | apps/wake/desktop/hub.test.cjs :: the server answers MCP and the HTTP API only with a client token of that transport, only on 127.0.0.1 | D00965; D-USR-2026-11-16-7 |
