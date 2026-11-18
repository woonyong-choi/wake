# 설정 · 클러스터 목록

<a id="SCR-SETTINGS-CLUSTERS"></a> 진입: `wake://settings/clusters`. 목적(SRE 판단): 클러스터 목록의 대상·설정·실행 결과를 확인한다.
구성: 설정 공통 틀 → 클러스터 목록 sections → settingsRow/connectionRow → 행 끝 컨트롤 하나.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 클러스터, 새 연결, 갱신, 숨김; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-SETTINGS](../components/tables/settings.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-CLUSTERS-01"></a> `SCR-SETTINGS-CLUSTERS-01` | 저장된 클러스터 두 개로 연결 설정을 연다 → wake.clusters.list의 두 행·새 연결·갱신 옵션이 보인다 → 저장되지 않은 견본 행이 나타나면 실패 | clustersPage는 저장 목록과 기본 갱신 설정을 렌더한다 ([`apps/wake/settings-pages.js:213`](../../apps/wake/settings-pages.js#L213)) | 없음(확인: apps/wake/settings-pages.js:213) | 고정 없음 → TASK-SCREEN-SETTINGS-CLUSTERS | D00078 |
| <a id="SCR-SETTINGS-CLUSTERS-V01"></a> `SCR-SETTINGS-CLUSTERS-V01` | 저장만 된 연결·정상 연결·403 연결을 각각 둔다 → cardOf와 connView 상태에 따라 확인 필요·정상·권한 필요를 구분한다 → 저장 사실만으로 정상 체크면 실패 | clusterRow는 저장 상태와 현재 연결 흐름을 구분한다 ([`apps/wake/settings-pages.js:66`](../../apps/wake/settings-pages.js#L66)) | 없음(확인: apps/wake/settings-pages.js:66) | 고정 없음 → TASK-SCREEN-SETTINGS-CLUSTERS | D00078 |
| <a id="SCR-SETTINGS-CLUSTERS-V02"></a> `SCR-SETTINGS-CLUSTERS-V02` | 온보딩과 설정에서 새 연결 메뉴를 연다 → CLUSTER_ADD·CLOUDS의 파일·토큰·클라우드 명령 선택이 같다 → 한쪽에 클라우드 명령이 없으면 실패 | 두 진입점이 CLUSTER_ADD와 CLOUDS를 공유한다 ([`apps/wake/app.config.js:230`](../../apps/wake/app.config.js#L230)) | 없음(확인: apps/wake/app.config.js:230) | 고정 없음 → TASK-SCREEN-SETTINGS-CLUSTERS | D00994 |
| <a id="SCR-SETTINGS-CLUSTERS-V03"></a> `SCR-SETTINGS-CLUSTERS-V03` | 갱신을 30초·300초로 바꾸고 자동 갱신·포커스 갱신을 각각 끈다 → 저장 키에 맞는 간격과 중지 동작이 적용된다 → 선택을 바꿔도 60초 고정 요청이면 실패 | 도구 확인 타이머는 wake.cluster.refresh를 초 단위로 읽는다 ([`apps/wake/app.config.js:832`](../../apps/wake/app.config.js#L832)) | autoRefresh·refreshOnFocus 선택은 이 타이머 조건에 반영되지 않는다 | 고정 없음 → TASK-SCREEN-SETTINGS-CLUSTERS | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-CLUSTERS-V04"></a> `SCR-SETTINGS-CLUSTERS-V04` | hideOff를 켜고 off 상태 연결을 둔다 → 탐색에서만 숨기고 설정 저장 목록에는 연결을 남긴다 → 숨김이 연결 삭제로 처리되면 실패 | shownClusters는 off를 거르지만 설정 clusters는 원본 저장 목록을 사용한다 ([`apps/wake/app.config.js:159`](../../apps/wake/app.config.js#L159)) | 없음(확인: apps/wake/app.config.js:159) | 고정 없음 → TASK-SCREEN-SETTINGS-CLUSTERS | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-CLUSTERS-A01"></a> `SCR-SETTINGS-CLUSTERS-A01` | 갱신 간격 300을 저장하고 설정을 다시 연다 → wake.cluster.refresh=300 선택과 다음 타이머 간격을 유지한다 → 선택만 300이고 타이머가 이전 간격이면 실패 | restoreTools는 호출 당시 wake.cluster.refresh 값으로 연결 확인 setInterval을 만든다 ([`apps/wake/app.config.js:832`](../../apps/wake/app.config.js#L832)) | restoreTools는 onStart에서만 호출되어 실행 중 간격 변경이 도구 연결 확인 타이머에 적용되지 않는다 | 고정 없음 → TASK-SCREEN-SETTINGS-CLUSTERS | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-SETTINGS-CLUSTERS-A02"></a> `SCR-SETTINGS-CLUSTERS-A02` | 토큰 연결 입력을 열고 파일 입력으로 전환한 뒤 취소한다 → 한 입력 행만 보이고 취소한 token은 남지 않는다 → 두 입력이 함께 남거나 비밀이 복원되면 실패 | wake.conn.form은 단일 열린 연결 키를 토글한다 ([`apps/wake/app.config.js:1091`](../../apps/wake/app.config.js#L1091)) | 없음(확인: apps/wake/app.config.js:1091) | 고정 없음 → TASK-SCREEN-SETTINGS-CLUSTERS | D00078 |
| <a id="SCR-SETTINGS-CLUSTERS-A03"></a> `SCR-SETTINGS-CLUSTERS-A03` | 새 토큰 연결만 인증 실패시킨다 → 그 연결 행에 실패 단계를 표시하고 기존 정상 클러스터는 유지한다 → 기존 저장 목록을 비우면 실패 | add- 연결 흐름을 기존 list 행과 별도로 렌더한다 ([`apps/wake/settings-pages.js:219`](../../apps/wake/settings-pages.js#L219)) | 없음(확인: apps/wake/settings-pages.js:219) | 고정 없음 → TASK-SCREEN-SETTINGS-CLUSTERS | D00078 |
| <a id="SCR-SETTINGS-CLUSTERS-G01"></a> `SCR-SETTINGS-CLUSTERS-G01` | 동일 context 이름의 다른 연결을 추가하고 한 조회만 timeout시킨다 → 저장 대상 식별을 유지하고 나머지 행은 반응한다 → 이름만으로 덮어쓰거나 전체 페이지가 기다리면 실패 | 클러스터 저장 행은 id·ctx를 유지하지만 별도 클러스터 UID는 복사하지 않는다 ([`apps/wake/settings-pages.js:58`](../../apps/wake/settings-pages.js#L58)) | 동일 context 이름 재사용을 UID로 구분하는 필드가 없다 | 고정 없음 → TASK-SCREEN-SETTINGS-CLUSTERS | D00114; D-USR-2026-11-16-7 (context 중복·행 격리) |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-CONNECT-ENTRY"></a> `SCR-CONNECT-ENTRY` | 설정과 온보딩에서 클라우드 명령 연결을 시작해 인증 단계에서 실패시킨다 → 같은 METHODS 단계와 해당 단계 재시도가 보인다 → 서로 다른 명령이나 처음부터만 재시도이면 실패 | wake.kube.cloud는 METHODS의 cloud로 flows.run을 실행한다 ([`apps/wake/app.config.js:1139`](../../apps/wake/app.config.js#L1139)) | 없음(확인: apps/wake/app.config.js:1139) | 고정 없음 → TASK-SCREEN-SETTINGS-CLUSTERS | D00994, D01003 |
| <a id="SCR-CONNECT-STATE"></a> `SCR-CONNECT-STATE` | 1. 연결 진행·성공·설치 결과를 차례로 받는다 → connView의 진행 취소와 성공 체크·해제 동작이 상태에 맞게 보인다 → 중복 취소 X 또는 설치 전 성공 표시이면 실패.<br>2. 입력 연결 중→성공 전환 후 긴 연결 이름으로 렌더 → 기대 성공 체크와 연결 해제 컨트롤을 같은 인접 그룹으로 배치 → 실패 둘이 서로 떨어지거나 성공 뒤에도 이전 진행 컨트롤 잔존.<br>3. 입력 홈·인시던트·연결 관리에서 같은 연결의 성공 상태 → 기대 동일 연결 부품에서 초록 체크와 연결 해제를 인접 배치하고 취소 X는 없음 → 실패 한 화면만 연결 해제가 떨어져 있거나 공통 연결 부품 예외. | live 상태가 있을 때 connView를 연결 행으로 투영한다 ([`apps/wake/settings-pages.js:68`](../../apps/wake/settings-pages.js#L68)) | 성공 보조 동작은 더보기 메뉴에 들어가 체크 옆 직접 해제와는 다르다 | 고정 없음 → TASK-SCREEN-SETTINGS-CLUSTERS | D00078; D-USR-2026-11-16-7; D00428; D00449 |
