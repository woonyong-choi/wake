# 설정 · Git 연결

<a id="SCR-SETTINGS-GIT"></a> 진입: `wake://settings/git`. 목적(SRE 판단): Git 연결의 대상·설정·실행 결과를 확인한다.
구성: 설정 공통 틀 → Git 연결 sections → settingsRow/connectionRow → 행 끝 컨트롤 하나.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 계정, 저장소, Draft PR; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-SETTINGS](../components/tables/settings.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-GIT-01"></a> `SCR-SETTINGS-GIT-01` | Git 설정을 연다 → 계정 상태 다음 gitops 서비스의 저장소·Application 행이 보인다 → 읽기 저장소를 인증된 Git 계정으로 표시하면 실패 | gitPage는 계정 미연결 행과 조회한 저장소 그룹을 반환한다 ([`apps/wake/settings-pages.js:263`](../../apps/wake/settings-pages.js#L263)) | 없음(확인: apps/wake/settings-pages.js:263) | 고정 없음 → TASK-SCREEN-SETTINGS-GIT | D00453 |
| <a id="SCR-SETTINGS-GIT-V01"></a> `SCR-SETTINGS-GIT-V01` | GitHub 계정이 없는 상태로 진입한다 → github 출처 연결 안 됨을 표시한다 → 정상 계정 체크가 나타나면 실패 | 계정 그룹은 sourceOff github로 고정한다 ([`apps/wake/settings-pages.js:269`](../../apps/wake/settings-pages.js#L269)) | Git 계정 연결 입력·인증 동작이 없다 | 고정 없음 → TASK-SCREEN-SETTINGS-GIT | D00453 |
| <a id="SCR-SETTINGS-GIT-V02"></a> `SCR-SETTINGS-GIT-V02` | Argo CD가 읽는 저장소만 있고 Git 쓰기 자격은 없다 → 저장소 읽기와 PR 쓰기 자격을 구분한다 → Synced를 PR 작성 가능으로 표시하면 실패 | 저장소 행은 Application.sync를 상태로 표시한다 ([`apps/wake/settings-pages.js:272`](../../apps/wake/settings-pages.js#L272)) | Git 계정의 쓰기 권한을 표시하는 값이 없다 | 고정 없음 → TASK-SCREEN-SETTINGS-GIT | D00453 |
| <a id="SCR-SETTINGS-GIT-V03"></a> `SCR-SETTINGS-GIT-V03` | 승인된 PR 계획을 GitHub 미연결 상태에서 결정한다 → 승인 상태와 github-unconnected를 구분하고 PR URL·번호는 비워 둔다 → 가짜 PR 번호가 생기면 실패 | PR 경로의 승인 결과는 pending 또는 github-unconnected 문자열이다 ([`apps/wake/desktop/approvals.cjs:49`](../../apps/wake/desktop/approvals.cjs#L49)) | PR 생성 호출과 응답 URL·번호 저장이 없다 | 고정 없음 → TASK-SCREEN-SETTINGS-GIT | D00453 |
| <a id="SCR-SETTINGS-GIT-A01"></a> `SCR-SETTINGS-GIT-A01` | Git 연결을 저장하고 다른 설정을 거쳐 돌아온다 → 같은 계정·저장소 연결 상태를 유지한다 → 재진입 때 계정이 초기화되면 실패 | 계정은 미연결 빈 그룹으로만 정의되어 있다 ([`apps/wake/settings-pages.js:269`](../../apps/wake/settings-pages.js#L269)) | 계정 연결 저장과 복원 기능이 없다 | 고정 없음 → TASK-SCREEN-SETTINGS-GIT | D00453; D-USR-2026-11-16-7 (재진입 저장) |
| <a id="SCR-SETTINGS-GIT-A02"></a> `SCR-SETTINGS-GIT-A02` | Git 자격 입력을 열고 제출·취소한다 → 한 입력만 열며 비밀값을 비운다 → 제출 후 토큰 원문이 남으면 실패 | gitPage는 계정 입력 control이나 withForm을 만들지 않는다 ([`apps/wake/settings-pages.js:263`](../../apps/wake/settings-pages.js#L263)) | Git 자격 입력 행 자체가 없다 | 고정 없음 → TASK-SCREEN-SETTINGS-GIT | D00453; D-USR-2026-11-16-7 (자격 입력 취소) |
| <a id="SCR-SETTINGS-GIT-A03"></a> `SCR-SETTINGS-GIT-A03` | 한 저장소의 gitops 조회만 실패시킨다 → 그 출처 오류를 표시하고 다른 저장소는 유지한다 → 실패 저장소를 설명 없이 없애면 실패 | gitops 거절을 null로 바꿔 저장소 목록을 합친다 ([`apps/wake/settings-pages.js:265`](../../apps/wake/settings-pages.js#L265)) | 실패한 클러스터 출처 상태가 사라진다 | 고정 없음 → TASK-SCREEN-SETTINGS-GIT | D00453 |
| <a id="SCR-SETTINGS-GIT-G01"></a> `SCR-SETTINGS-GIT-G01` | 허용된 계정으로 승인 계획의 Draft PR 생성을 요청한다 → 서버 응답의 PR URL·번호와 감사 결과가 보인다 → 승인 기록만으로 PR 생성 완료이면 실패 | decide는 prResult를 저장하고 감사만 기록한다 ([`apps/wake/desktop/approvals.cjs:50`](../../apps/wake/desktop/approvals.cjs#L50)) | 실제 Draft PR 생성기는 호출하지 않는다 | 고정 없음 → TASK-SCREEN-SETTINGS-GIT | D00453 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-GIT-REQ-R-053"></a> `SCR-SETTINGS-GIT-REQ-R-053` | PR 생성 후 리뷰·병합·동기화·롤아웃 결과를 읽는다 → Git 서버와 Kubernetes의 단계별 응답을 각각 표시하고 승인과 실행 실패를 나눈다 → 승인만으로 배포 완료이면 실패 | 승인 반환에는 state·by·time·pr 상태만 있다 ([`apps/wake/desktop/approvals.cjs:55`](../../apps/wake/desktop/approvals.cjs#L55)) | 리뷰·병합·동기화·롤아웃 추적 결과가 연결되지 않았다 | 고정 없음 → TASK-SCREEN-SETTINGS-GIT | D00453 |
