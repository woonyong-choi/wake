# 설정 · 도구 연결 설정

<a id="SCR-SETTINGS-TOOLS"></a> 진입: `wake://settings/tools`. 목적(SRE 판단): 도구 연결 설정의 대상·설정·실행 결과를 확인한다.
구성: 설정 공통 틀 → 도구 연결 설정 sections → settingsRow/connectionRow → 행 끝 컨트롤 하나.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 클러스터 도구, 공유 도구, 비용 연결, 연결 흐름; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-SETTINGS](../components/tables/settings.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-TOOLS-01"></a> `SCR-SETTINGS-TOOLS-01` | 도구 설정의 클러스터·공유 탭을 연다 → 발견한 서비스와 Slack·PagerDuty 연결 행을 각 탭에 표시한다 → 공유 자격이 특정 클러스터의 서비스로 보이면 실패 | toolsPage는 clusters·shared 탭을 정의한다 ([`apps/wake/settings-pages.js:245`](../../apps/wake/settings-pages.js#L245)) | 없음(확인: apps/wake/settings-pages.js:245) | 고정 없음 → TASK-SCREEN-SETTINGS-TOOLS | D00078, D00992 |
| <a id="SCR-SETTINGS-TOOLS-V01"></a> `SCR-SETTINGS-TOOLS-V01` | 연결 기록 없는 Grafana 서비스가 발견된다 → 설정에는 연결 대상 행이 보이고 본문 연결 목록과 구분한다 → 발견만으로 본문에서 연결됨이면 실패 | 설정 toolGroups는 발견한 모든 rows를 행으로 만든다 ([`apps/wake/settings-pages.js:158`](../../apps/wake/settings-pages.js#L158)) | 없음(확인: apps/wake/settings-pages.js:158) | apps/wake/settings-icons.test.mjs :: settings tool inventory only shows discovered targets and distinguishes incomplete reads | D00992 |
| <a id="SCR-SETTINGS-TOOLS-V02"></a> `SCR-SETTINGS-TOOLS-V02` | Slack 웹후크를 입력하고 제출한다 → notify 자격은 키체인 참조만 저장하고 입력란은 비워진다 → URL 비밀이 설정 원문에 남으면 실패 | notify 비밀도 keychain.set을 거쳐 참조로 저장한다 ([`apps/wake/desktop/conn-ops.cjs:111`](../../apps/wake/desktop/conn-ops.cjs#L111)) | 없음(확인: apps/wake/desktop/conn-ops.cjs:111) | 고정 없음 → TASK-SCREEN-SETTINGS-TOOLS | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-TOOLS-V03"></a> `SCR-SETTINGS-TOOLS-V03` | c의 OpenCost 설정을 누른다 → costAddress의 configure=1에서 동일 Service UID 연결을 선택한다 → 다른 서비스의 비용으로 조용히 연결되면 실패 | OpenCost 행은 해당 c.id의 비용 설정 주소를 연다 ([`apps/wake/settings-pages.js:167`](../../apps/wake/settings-pages.js#L167)) | 설정 행 자체는 Service UID를 전달하지 않고 비용 화면에서 선택한다 | 고정 없음 → TASK-SCREEN-SETTINGS-TOOLS | D00110, D00111 |
| <a id="SCR-SETTINGS-TOOLS-V04"></a> `SCR-SETTINGS-TOOLS-V04` | 로그인·토큰 오류·403·접속 실패를 각각 발생시킨다 → connView의 authn·perm·reach 실패 단계와 해당 재시도를 표시한다 → 모두 연결 안 됨 한 상태로 숨기면 실패 | toolRow는 login/token 대안과 공통 connView 흐름을 구성한다 ([`apps/wake/settings-pages.js:76`](../../apps/wake/settings-pages.js#L76)) | 없음(확인: apps/wake/settings-pages.js:76) | 고정 없음 → TASK-SCREEN-SETTINGS-TOOLS | D00078 |
| <a id="SCR-SETTINGS-TOOLS-A01"></a> `SCR-SETTINGS-TOOLS-A01` | 도구 연결 후 설정을 다시 연다 → 저장된 연결과 현재 hub.sources 상태를 함께 읽어 같은 서비스 행을 유지한다 → 옛 연결 성공이 현재 오류를 덮으면 실패 | operating이 아니면 hub 상태를 연결 흐름보다 우선한다 ([`apps/wake/settings-pages.js:85`](../../apps/wake/settings-pages.js#L85)) | 없음(확인: apps/wake/settings-pages.js:85) | apps/wake/settings-icons.test.mjs :: settings_tool_row_health_is_the_hub_source_and_a_finished_flow_never_masks_a_hub_failure | D00115; D-USR-2026-11-16-7 (저장 상태와 현재 읽기) |
| <a id="SCR-SETTINGS-TOOLS-A02"></a> `SCR-SETTINGS-TOOLS-A02` | Grafana 토큰 입력을 열고 Slack 입력으로 바꾼 뒤 취소한다 → 한 form 키만 남고 닫힌 행의 비밀을 지운다 → 이전 토큰이 다시 나타나면 실패 | 토큰 폼도 wake.conn.form 단일 키를 사용한다 ([`apps/wake/app.config.js:1088`](../../apps/wake/app.config.js#L1088)) | 없음(확인: apps/wake/app.config.js:1088) | 고정 없음 → TASK-SCREEN-SETTINGS-TOOLS | D00078 |
| <a id="SCR-SETTINGS-TOOLS-A03"></a> `SCR-SETTINGS-TOOLS-A03` | Grafana 인증만 실패시키고 Prometheus 읽기는 성공시킨다 → Grafana 행의 원인만 바뀌고 Prometheus는 유지된다 → 전체 도구 그룹이 실패로 바뀌면 실패 | toolRow는 cluster-kind별 key로 연결 상태를 읽는다 ([`apps/wake/settings-pages.js:75`](../../apps/wake/settings-pages.js#L75)) | 없음(확인: apps/wake/settings-pages.js:75) | 고정 없음 → TASK-SCREEN-SETTINGS-TOOLS | D00017 |
| <a id="SCR-SETTINGS-TOOLS-G01"></a> `SCR-SETTINGS-TOOLS-G01` | 저장 도구의 열거·허브 읽기를 실패시킨 뒤 다시 시도한다 → 행을 유지하며 실패 캐시를 버리고 실제 출처를 다시 읽는다 → 저장 행이 사라지거나 옛 오류 캐시만 보이면 실패 | toolReads는 access 또는 hub 실패를 재시도 무효화 대상으로 둔다 ([`apps/wake/settings-pages.js:244`](../../apps/wake/settings-pages.js#L244)) | 없음(확인: apps/wake/settings-pages.js:244) | apps/wake/settings-icons.test.mjs :: settings_tool_row_when_the_hub_read_fails_never_shows_an_old_connection_as_healthy_and_retry_reads_the_hub_again | D00115; D-USR-2026-11-16-7 (실패 캐시 무효화) |
