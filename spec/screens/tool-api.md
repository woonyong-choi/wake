# 도구 HTTP 조회

<a id="SCR-TOOL-API"></a> 진입: `wake://cluster/:cluster/api/:tool (loki/tempo)`. 목적(SRE 판단): 조회 요청의 원문·HTTP 결과·크기를 확인한다.
구성: 머리 → GET·경로·실행 → params/headers/auth → 응답 body/headers·상태·소요시간·크기.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 요청, 응답, 인증; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-TOOL-API-01](../components/tables/tool-api.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-TOOL-API-01](../components/tables/tool-api.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-TOOL-API-01"></a> `SCR-TOOL-API-01` | c/Loki API를 열고 GET을 실행한다 → 경로·params/headers/auth와 tool.query의 body·headers·HTTP 상태·elapsedMs·bytes가 보인다 → 다른 도구의 응답이 섞이면 실패 | viewHeader·요청 도구 줄·요청과 응답 구역을 렌더한다 ([`apps/wake/pages/tool-api.js:101`](../../apps/wake/pages/tool-api.js#L101)) | 없음(확인: apps/wake/pages/tool-api.js:101) | 고정 없음 → TASK-SCREEN-TOOL-API | D00046 |
| <a id="SCR-TOOL-API-V01"></a> `SCR-TOOL-API-V01` | Loki와 Tempo 프리셋 목록을 연다 → PATHS의 labels/ready와 search/tags/ready 경로 및 GET을 제공한다 → 쓰기 메서드가 활성화되면 실패 | PATHS는 두 도구의 읽기 경로만 정의한다 ([`apps/wake/pages/tool-api.js:8`](../../apps/wake/pages/tool-api.js#L8)) | 없음(확인: apps/wake/pages/tool-api.js:8) | 고정 없음 → TASK-SCREEN-TOOL-API | D00046; D-USR-2026-11-16-7 |
| <a id="SCR-TOOL-API-V02"></a> `SCR-TOOL-API-V02` | JSON 응답과 truncated=true 응답을 차례로 준다 → JSON 보기의 값은 body와 같고 잘린 응답은 잘림 상태를 보인다 → 잘린 JSON을 완전한 문서로 표시하면 실패 | 완전한 JSON만 들여쓰기하고 truncated이면 원문을 유지한다 ([`apps/wake/pages/tool-api.js:91`](../../apps/wake/pages/tool-api.js#L91)) | 없음(확인: apps/wake/pages/tool-api.js:91) | 고정 없음 → TASK-SCREEN-TOOL-API | D00077; D-USR-2026-11-16-7 (truncated 표시) |
| <a id="SCR-TOOL-API-V03"></a> `SCR-TOOL-API-V03` | /ready는 200, labels는 401로 응답한다 → 인증 영역은 ready를 인증 근거로 쓰지 않고 labels에는 자격 필요를 표시한다 → ready 성공으로 인증 완료이면 실패 | sameEndpoint는 ready를 제외하고 401·403을 별도 인증 상태로 만든다 ([`apps/wake/pages/tool-api.js:63`](../../apps/wake/pages/tool-api.js#L63)) | 없음(확인: apps/wake/pages/tool-api.js:63) | 고정 없음 → TASK-SCREEN-TOOL-API | D00046; D-USR-2026-11-16-7 |
| <a id="SCR-TOOL-API-A01"></a> `SCR-TOOL-API-A01` | A 경로 성공 뒤 B를 요청하고 지연·실패시킨다 → A 응답에는 resultRoute·receivedAt을 표시하고 B 실패를 따로 표시한다 → A 결과를 B 최신 성공으로 표시하면 실패 | pending·오류·경로 불일치 때 마지막 응답 시각과 경로를 붙인다 ([`apps/wake/pages/tool-api.js:97`](../../apps/wake/pages/tool-api.js#L97)) | 없음(확인: apps/wake/pages/tool-api.js:97) | 고정 없음 → TASK-SCREEN-TOOL-API | D00077 |
| <a id="SCR-TOOL-API-A02"></a> `SCR-TOOL-API-A02` | 진행 중 GET을 취소하고 원래 성공 응답을 늦게 반환한다 → 취소 상태를 유지하고 늦은 성공은 폐기한다 → 취소 뒤 본문이 성공 응답으로 바뀌면 실패 | cancel은 service에 cancel true를 보내지만 send 응답은 disposed만 검사한다 ([`apps/wake/pages/tool-api.js:38`](../../apps/wake/pages/tool-api.js#L38)) | 취소한 요청의 늦은 성공을 막는 요청 세대 검사가 없다 | 고정 없음 → TASK-SCREEN-TOOL-API | D00114; D-USR-2026-11-16-7 (취소·늦은 성공) |
| <a id="SCR-TOOL-API-A03"></a> `SCR-TOOL-API-A03` | 웹 UI 없는 Loki·Tempo를 도구 메뉴에서 연다 → 해당 cluster의 내장 API 화면이 보이며 터미널이 열리지 않는다 → 가짜 웹 UI나 셸 출력이 생기면 실패 | TOOLS에 있는 두 종류만 API 페이지로 구성한다 ([`apps/wake/pages/tool-api.js:12`](../../apps/wake/pages/tool-api.js#L12)) | 없음(확인: apps/wake/pages/tool-api.js:12) | 고정 없음 → TASK-SCREEN-TOOL-API | D00030, D00046 |
| <a id="SCR-TOOL-API-G01"></a> `SCR-TOOL-API-G01` | unconfigured 응답 후 연결 설정으로 이동한다 → 같은 클러스터·도구 연결 행을 열고 복구 뒤 해당 읽기를 재시도한다 → 대상 선택이 사라져 다른 도구를 연결하면 실패 | 미연결 동작은 wake://settings/tools만 연다 ([`apps/wake/pages/tool-api.js:85`](../../apps/wake/pages/tool-api.js#L85)) | 설정 이동에 cluster·tool 선택을 전달하지 않는다 | 고정 없음 → TASK-SCREEN-TOOL-API | D00078; D-USR-2026-11-16-7 |

<a id="SCR-TOOL-API-LAYOUT"></a>

## SCR-TOOL-API-LAYOUT

- 목표: 입력 기존 승인 화면 폭에서 Loki 또는 Tempo API 열기 → 기대 첫 줄에 메서드·경로·보내기, 아래에 요청과 응답을 나란히 배치 → 실패 첫 줄의 실행 구조가 흩어지거나 승인 폭에서 요청과 응답이 세로로만 배치
- 현재: 요청과 응답 상태는 requestTab·responseTab으로 분리되어 있다.(`apps/wake/pages/tool-api.js:16`)
- 차이: 승인 폭의 나란한 배치를 렌더로 대조해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-TOOL-API
- 출처: D00077
