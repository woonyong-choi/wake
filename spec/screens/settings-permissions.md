# 설정 · 권한

<a id="SCR-SETTINGS-PERMISSIONS"></a> 진입: `wake://settings/permissions`. 목적(SRE 판단): 권한의 대상·설정·실행 결과를 확인한다.
구성: 설정 공통 틀 → 권한 sections → settingsRow/connectionRow → 행 끝 컨트롤 하나.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 클러스터 권한 탭, 기본 AI 권한, Secret, 클러스터별 AI 권한; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-SETTINGS](../components/tables/settings.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-PERMISSIONS-01"></a> `SCR-SETTINGS-PERMISSIONS-01` | 권한 설정에서 클러스터와 AI 탭을 연다 → access 조회와 wake.perm 설정을 각각의 탭에서 표시한다 → RBAC 결과와 AI 선택이 같은 값으로 섞이면 실패 | permissions는 cluster·ai 탭과 각 sections를 선언한다 ([`apps/wake/app.config.js:310`](../../apps/wake/app.config.js#L310)) | 없음(확인: apps/wake/app.config.js:310) | 고정 없음 → TASK-SCREEN-SETTINGS-PERMISSIONS | D00466 |
| <a id="SCR-SETTINGS-PERMISSIONS-V01"></a> `SCR-SETTINGS-PERMISSIONS-V01` | A access 읽기를 지연시키고 B 응답 뒤 AI 탭을 선택한다 → A만 대기하며 B 권한과 AI 선택 행을 즉시 표시한다 → AI 탭도 A 응답을 기다리면 실패 | accessReads는 클러스터별 상태와 pending을 반환한다 ([`apps/wake/app.config.js:312`](../../apps/wake/app.config.js#L312)) | 없음(확인: apps/wake/app.config.js:312) | apps/wake/app.config.test.mjs :: settings_reads_per_cluster_never_hold_the_page_and_a_silent_cluster_times_out | D00466; D-USR-2026-11-16-6 |
| <a id="SCR-SETTINGS-PERMISSIONS-V02"></a> `SCR-SETTINGS-PERMISSIONS-V02` | 초기 권한으로 변경 작업을 요청한다 → wake.perm.default=read이고 쓰기는 별도 사람 승인 상태로 남는다 → 기본 설정만으로 쓰기가 실행되면 실패 | 기본 권한은 read로 선언된다 ([`apps/wake/app.config.js:241`](../../apps/wake/app.config.js#L241)) | 권한 시트의 직접 실행 우회는 G01에 남아 있다 | 고정 없음 → TASK-SCREEN-SETTINGS-PERMISSIONS | D00466, D00473 |
| <a id="SCR-SETTINGS-PERMISSIONS-V03"></a> `SCR-SETTINGS-PERMISSIONS-V03` | Secret 허용 스위치나 직접 설정 변경으로 Secret 읽기를 요청한다 → 설정과 무관하게 권한 범위 밖(Secret)을 표시한다 → 키 이름·원문을 읽으면 실패 | Secret 스위치는 disabled이며 기본값은 false이다 ([`apps/wake/app.config.js:320`](../../apps/wake/app.config.js#L320)) | UI 비활성만으로 데스크톱 계정 RBAC의 Secret 차단은 보장되지 않는다 | 고정 없음 → TASK-SCREEN-SETTINGS-PERMISSIONS | D-01, C-003 |
| <a id="SCR-SETTINGS-PERMISSIONS-V04"></a> `SCR-SETTINGS-PERMISSIONS-V04` | AI 정책 ask·실제 RBAC write=false 조합을 준다 → 권한 행은 쓰기 불가이며 AI 선택이 RBAC를 확대하지 않는다 → ask를 실제 쓰기 허용으로 표시하면 실패 | 클러스터별 AI 선택값은 wake.perm.id로 독립 저장한다 ([`apps/wake/app.config.js:322`](../../apps/wake/app.config.js#L322)) | 표시에는 실제 RBAC와의 유효 권한 교집합 계산이 없다 | 고정 없음 → TASK-SCREEN-SETTINGS-PERMISSIONS | D00466, D00473 |
| <a id="SCR-SETTINGS-PERMISSIONS-A01"></a> `SCR-SETTINGS-PERMISSIONS-A01` | 기본 권한 read와 c의 별도 ask를 저장하고 재진입한다 → 두 키를 구분해 유지한다 → c 설정이 전체 기본값을 바꾸면 실패 | 클러스터별 키는 기본값을 fallback으로만 사용한다 ([`apps/wake/app.config.js:322`](../../apps/wake/app.config.js#L322)) | 없음(확인: apps/wake/app.config.js:322) | 고정 없음 → TASK-SCREEN-SETTINGS-PERMISSIONS | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-PERMISSIONS-A02"></a> `SCR-SETTINGS-PERMISSIONS-A02` | 클러스터 권한 탭에서 AI 탭으로 이동한다 → 조회용 권한 행과 정책 선택만 보이고 토큰 입력은 나타나지 않는다 → 읽기 권한 행이 비밀 입력 폼으로 바뀌면 실패 | RBAC 행은 permVerbs 상태 control로만 만든다 ([`apps/wake/app.config.js:314`](../../apps/wake/app.config.js#L314)) | 없음(확인: apps/wake/app.config.js:314) | 고정 없음 → TASK-SCREEN-SETTINGS-PERMISSIONS | D00466 |
| <a id="SCR-SETTINGS-PERMISSIONS-A03"></a> `SCR-SETTINGS-PERMISSIONS-A03` | c access 조회를 403으로 거절하고 d는 허용한다 → c에 실패·재시도, d에 허용 상태가 남는다 → d까지 권한 없음이면 실패 | 읽기 상태가 ok가 아닌 클러스터만 readRow로 바꾼다 ([`apps/wake/app.config.js:313`](../../apps/wake/app.config.js#L313)) | 없음(확인: apps/wake/app.config.js:313) | 고정 없음 → TASK-SCREEN-SETTINGS-PERMISSIONS | D00466 |
| <a id="SCR-SETTINGS-PERMISSIONS-G01"></a> `SCR-SETTINGS-PERMISSIONS-G01` | 권한 시트의 적용을 선택하고 거절·승인을 각각 준다 → 거절은 쓰기 0회, 승인은 승인 계획만 실행하고 감사를 남긴다 → 적용 버튼이 승인 경계를 건너뛰면 실패 | wake.perm.apply는 api.terminal.run을 직접 호출한다 ([`apps/wake/app.config.js:1097`](../../apps/wake/app.config.js#L1097)) | 중앙 승인 계획 검사와 감사 기록 없이 직접 명령을 실행한다 | 고정 없음 → TASK-SCREEN-SETTINGS-PERMISSIONS | D00466, D00473 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-PERMISSIONS-REQ-R-011"></a> `SCR-SETTINGS-PERMISSIONS-REQ-R-011` | 데스크톱 계정으로 Secret get·list·watch를 시도한다 → 권한 단계에서 거절되어 화면에 권한 범위 밖(Secret)이 보인다 → 읽은 뒤 값만 마스킹하면 실패 | cluster 읽기는 Secret.data 키를 남기고 값만 빈 문자열로 바꾼다 ([`apps/wake/desktop/reads/cluster.cjs:26`](../../apps/wake/desktop/reads/cluster.cjs#L26)) | Secret 객체를 읽은 뒤 마스킹하는 경로가 남아 있다 | 고정 없음 → TASK-SCREEN-SETTINGS-PERMISSIONS | D-01, C-003 |
