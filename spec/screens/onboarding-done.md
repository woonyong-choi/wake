# 첫 실행 · 기본 설정

<a id="SCR-ONBOARDING-DONE"></a> 진입: `셸 firstRun.steps.setup`(세 단계 중 마지막, 예전 permission·done 단계 값도 여기로). 목적(SRE 판단): 연결 결과를 보고 AI 권한 기본값·언어·테마를 정한 뒤 클러스터 홈으로 시작한다.
구성: firstRun 기본 설정 단계(D-USR-2026-11-18-20) → 요약 한 줄 · 선택 세 행(AI 권한 기본값 읽기만/변경 전 묻기, 언어, 테마) · 시작.
현재: [apps/wake/app.config.js](../../apps/wake/app.config.js); [kit/components/first-run.js](../../kit/components/first-run.js). 2026-11-17 H-006에서 실제 Electron의 해당 단계 다크·라이트를 확인했다. 세부 상태별 판정과 미검증 범위는 [H-006 실행 판정](../tasks.md#H-006-run)을 따른다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 요약, 선택 세 행; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.

자료: firstRun.setup의 행 정의, wake.conn.live와 저장 연결, homeAddress(마지막으로 본 클러스터, 없으면 첫 연결 클러스터, 없으면 설정 › 클러스터), wake.perm.default(기본 read)가 요약·시작 주소·권한 기본값의 출처다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-ONBOARDING-DONE-01"></a> `SCR-ONBOARDING-DONE-01` | 기본 설정 단계에 도착한다 → 연결 수·AI 수 요약 아래 AI 권한 기본값(읽기만)·언어·테마 세 행과 시작 버튼이 보인다 → 발견 수를 연결 수로 쓰거나 세 행 중 하나가 빠지거나 다른 빠른 설정이 끼면 실패 | setup.description·options·primary(`apps/wake/app.config.js` firstRun.steps setup) | 없음 | `apps/wake/app.config.test.mjs` — first_run_is_three_steps_clusters_ai_and_basic_settings_with_old_steps_mapped | D-USR-2026-11-18-20 |
| <a id="SCR-ONBOARDING-DONE-V01"></a> `SCR-ONBOARDING-DONE-V01` | context 3개 중 1개만 연결하고 모델 공급자 0개로 완료 화면을 연다 → wake.clusters.connected 길이 1과 aiConnected 길이 0이 보인다 → 발견한 3개를 연결 3개로 표시하면 실패 | `apps/wake/app.config.js`의 done.description이 저장한 연결의 현재 ok·권한 제한 상태만 집계하며 발견 수와 구별한다. | 저장 후 실패한 연결을 완료 요약에 계속 세던 결함을 수정했다. 실제 정상 1개·접속 실패 0개를 확인했다. | `apps/wake/app.config.test.mjs` — firstRun_done_summary_excludes_connections_that_failed_after_being_saved; [H-006 실행 판정](../tasks.md#H-006-run) | D00078 |
| <a id="SCR-ONBOARDING-DONE-V02"></a> `SCR-ONBOARDING-DONE-V02` | 기본 설정에서 언어를 ko에서 en으로, AI 권한 기본값을 묻기로 바꾼다 → 같은 화면의 글이 바로 바뀌고 wake.perm.default=ask가 저장된다 → 다음 화면이나 재시작 뒤에야 바뀌면 실패 | 선택 행은 kit.firstRun.set으로 바로 저장한다(`kit/shell/shell.js`) | 없음 | `kit/shell/first-run.test.mjs` — firstRun_select_is_named_by_its_row_and_its_value_like_settings | D-USR-2026-11-18-20 |
| <a id="SCR-ONBOARDING-DONE-A01"></a> `SCR-ONBOARDING-DONE-A01` | 실제 연결된 범위를 확인한 뒤 시작을 누른다 → homeAddress가 가리키는 홈으로 실제 연결 문맥을 유지해 이동한다 → 다른 주소로 이동하거나 연결되지 않은 클러스터를 연결됨으로 표시하면 실패 | `apps/wake/app.config.js`의 home이 표시 대상 중 현재 ok·권한 제한 연결을 고른다. 없으면 homeAddress는 클러스터 설정으로 간다. | 실패 연결을 첫 홈으로 고르는 결함을 수정했다. 실제 Electron에서 연결 실패 후 완료는 클러스터 설정으로, 정상 완료·재실행은 같은 클러스터 홈으로 이동했다. | `apps/wake/app.config.test.mjs` — firstRun_done_skips_failed_clusters_and_keeps_permission_limited_connection; [H-006 실행 판정](../tasks.md#H-006-run) | D00078 |
| <a id="SCR-ONBOARDING-DONE-A02"></a> `SCR-ONBOARDING-DONE-A02` | 첫 실행을 완료하고 재실행한 뒤 보기 메뉴에서 다시 연다 → kit.firstRun.done=true를 복원하고 kit.firstRun.open으로 시작 단계를 다시 볼 수 있다 → 완료 저장 유실이나 메뉴 무응답이면 실패 | closeFirstRun은 done을 저장하고 kit.firstRun.open은 다시 연다(`kit/shell/shell.js:1124`, `kit/shell/shell.js:1254`). | 없음(확인: kit/shell/shell.js:1124) | 고정 없음 → TASK-SCREEN-ONBOARDING-DONE | D01003; D-USR-2026-11-16-7 |
| <a id="SCR-ONBOARDING-DONE-G01"></a> `SCR-ONBOARDING-DONE-G01` | 권한 단계나 준비 완료 단계에서 멈춘 첫 실행을 다시 연다 → 기본 설정 단계에서 이어 한다 → 첫 단계로 돌아가면 실패 | 단계 aliases로 예전 id를 찾는다(`kit/shell/shell.js` openFirstRun) | 없음 | `kit/shell/first-run.test.mjs` — firstRun_a_stored_step_id_from_before_resumes_at_the_step_that_took_it_over | D-USR-2026-11-18-21 |
