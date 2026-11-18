# 출처 칩과 도구 상태

<a id="cmp-chip-01"></a>

## CMP-CHIP-01 — 포함·건강·열기 분리

- 목표: → [RULE-CHIPS](../rules.md#RULE-CHIPS).
- 현재: `apps/wake/data/conn-view.js`의 toolViews가 receipt·저장 연결의 UID와 현재 열거를 대조하고 포함·건강·열기를 분리한다. 열기는 현재 verified 바인딩에만 허용한다. 상세·설정·인시던트도 같은 포함 판정을 사용한다. H-002의 실제 앱 판정은 tasks에서 읽는다.
- 차이: 저장 연결의 UID가 없는 과거 기록은 대상을 대조할 수 없지만 열기는 허용하지 않는다. 실제 Service UID 교체와 timeout 주입은 H-002-N1에 남긴다.
- 고정 장치: `apps/wake/data/conn-view.test.mjs`의 recorded_tools_require_a_current_verified_binding_to_open, `apps/wake/tool-surfaces.test.mjs`의 tool_detail_does_not_inherit_a_receipt_for_a_new_unverified_uid와 incident_chips_use_connection_evidence_and_current_health_instead_of_failed_attempts. 실제 재판정은 H-002.
- 출처: D00231, D00775, D00992, D00999, D01000
- 점검 항목: → [RULE-CHIPS](../rules.md#RULE-CHIPS).

<a id="cmp-chip-02"></a>

## CMP-CHIP-02 — 실패 조합 행렬

모든 행은 CMP-CHIP-01의 출처·수용 기준·고정 장치·남은 일을 상속한다. 현재 상태와 실제 여섯 화면의 실패·복구 범위는 H-002에 기록한다. H는 허브, I는 열거다.

포함·건강·열기 조합의 판정표는 → [RULE-CHIPS](../rules.md#RULE-CHIPS).

현재 openable의 식은 `included && tool?.selection === "verified"`다. 다른 UID의 저장 연결은 현재 열거의 포함 근거가 아니다. 열거 실패는 H 정상이어도 없애지 않는다. retry는 H failed 또는 I failed다.

<a id="cmp-chip-03"></a>

## CMP-CHIP-03 — 모양·상태7개·이동

- 목표: → [RULE-CHIPS](../rules.md#RULE-CHIPS).
- 현재: sourceChips는 state별 버튼을 만들고 SOURCE_KIND는 limited를 warn으로 매핑한다. `cluster-home.js`의 refreshSources는 열린 화면에서 15초마다 출처 상태를 다시 읽고 pagehide 때 중단한다. `reads/index.cjs`의 hub.sources는 확인 기한이 지난 probe를 기다려 최신 관측을 반환한다. toolViews.last는 lastSuccessAt을 사용한다.
- 차이: toolViews.last는 lastSuccessAt을 읽지만 view-parts.sourceLines는 s.last를 사용한다. 소비 경로의 마지막 성공 필드가 다르다.
- 고정 장치: `kit/components/source-chips.test.mjs`의 칩 이름·상태·시각 표시 시험, `apps/wake/pages/source-state-pages.test.mjs`의 home_source_chips_follow_permission_loss_and_recovery_without_reloading_home, `apps/wake/desktop/reads/reads.test.cjs`의 hub_sources_returns_current_permission_loss_and_recovery_without_changing_data_time. 실제 실행은 [H-003 2차](../tasks.md#H-003-round2)이다.
- 출처: D00992, D00999, D01008
- 점검 항목: → [RULE-CHIPS](../rules.md#RULE-CHIPS).

## 세부 동작 계약

| 규칙 ID | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="CMP-CHIP-LOGOS"></a><a id="cmp-chip-logos"></a>CMP-CHIP-LOGOS 공급자 요약과 이동 | 입력: iconStack의 items 5개와 max=3에서 +2를 열고 공급자 아이콘을 선택한다. 포함·배치·넘침·요약 모양은 [RULE-CHIPS](../rules.md#RULE-CHIPS)를 따른다. 넘친 두 공급자의 이름과 현재 연결 대상의 실제 페이지/API 이동을 확인한다. 외부 Alertmanager 지원은 유지하며 내부 알람 기능과 구분한다. | render는 max를 넘는 items를 +N 마크로 접는다(`kit/components/icon-stack.js:41`) | 추가 대조: D00788: 내부 기능을 연결 도구처럼 섞으면 실패. D00788 지적은 외부 Alertmanager 자체 지원 취소로 확대하지 않음; D00809: 요약 전용 테두리/링/축소 variant가 추가되면 실패. | `kit/components/icon-stack.test.mjs` — `marks beyond max fold into one +N mark that names them`; 추가 조건 고정 없음 | D00026, D00030, D00776, D00780, D00809, D00999; D00788 |

| 규칙 ID | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="cmp-chip-watchdog"></a>CMP-CHIP-WATCHDOG | Alertmanager labels.alertname=Watchdog와 실제 장애 알림을 함께 읽는다. 출처 응답과 장애 분류·집계의 판정은 [RULE-CHIPS](../rules.md#RULE-CHIPS)를 따른다. | alertList는 HEARTBEAT에 든 이름을 out에서 제거한다(`apps/wake/data/alerts.js:50`) | 없음(확인: apps/wake/data/alerts.js:50) | `apps/wake/data/alerts.test.mjs` — `an alert Alertmanager holds with the external labels added is the same row as its rule alert, and the Watchdog heartbeat is not listed` | D01006 |
