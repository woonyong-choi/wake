# 설정 · 에이전트 연결 설정

<a id="SCR-SETTINGS-AGENTS"></a> 진입: `wake://settings/agents`. 목적(SRE 판단): 에이전트 연결 설정의 대상·설정·실행 결과를 확인한다.
구성: 설정 공통 틀 → 에이전트 연결 설정 sections → settingsRow/connectionRow → 행 끝 컨트롤 하나.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 클러스터별 설치 상태, 설치·재시도; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-LIST-SETTINGS](../components/tables/settings.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-SETTINGS-AGENTS-01"></a> `SCR-SETTINGS-AGENTS-01` | 클러스터 A·B를 저장하고 에이전트 설정을 연다 → agent 서비스 결과에 따라 A·B 이름의 연결 행이 하나씩 보인다 → 같은 클러스터가 중복되거나 누락되면 실패 | agentsPage는 clusters 목록을 agentReads 결과별 행으로 만든다 ([`apps/wake/settings-pages.js:237`](../../apps/wake/settings-pages.js#L237)) | 없음(확인: apps/wake/settings-pages.js:237) | 고정 없음 → TASK-SCREEN-SETTINGS-AGENTS | D00021 |
| <a id="SCR-SETTINGS-AGENTS-V01"></a> `SCR-SETTINGS-AGENTS-V01` | A agent 읽기는 지연시키고 B는 rolloutReady=true로 응답한다 → A만 확인 중이며 B는 연결 결과를 표시한다 → A 응답 전까지 B도 비어 있으면 실패 | agentReads는 perCluster로 읽고 각 행은 reads.of로 상태를 선택한다 ([`apps/wake/settings-pages.js:236`](../../apps/wake/settings-pages.js#L236)) | 없음(확인: apps/wake/settings-pages.js:236) | 고정 없음 → TASK-SCREEN-SETTINGS-AGENTS | D00021; D-USR-2026-11-16-6 |
| <a id="SCR-SETTINGS-AGENTS-V02"></a> `SCR-SETTINGS-AGENTS-V02` | 에이전트 없는 클러스터에서 설치를 선택한다 → 대상 context·Helm 명령·버전·권한을 확인하고 실제 배포 결과만 성공으로 표시한다 → 명령 생성만으로 설치 완료이면 실패 | 설치 동작과 agentCommand 복사 동작을 분리한다 ([`apps/wake/settings-pages.js:177`](../../apps/wake/settings-pages.js#L177)) | 설정 행 자체는 설치 권한 확인과 버전 대조 결과를 표시하지 않는다 | 고정 없음 → TASK-SCREEN-SETTINGS-AGENTS | D00021, D00024 |
| <a id="SCR-SETTINGS-AGENTS-A01"></a> `SCR-SETTINGS-AGENTS-A01` | 에이전트 행을 읽은 뒤 다른 설정을 거쳐 돌아온다 → 같은 클러스터 agent 조회 결과가 유지되거나 갱신된다 → 다른 클러스터의 버전이 보이면 실패 | agentRow는 agent-접두와 클러스터 id로 상태를 분리한다 ([`apps/wake/settings-pages.js:170`](../../apps/wake/settings-pages.js#L170)) | 없음(확인: apps/wake/settings-pages.js:170) | 고정 없음 → TASK-SCREEN-SETTINGS-AGENTS | D00021 |
| <a id="SCR-SETTINGS-AGENTS-A02"></a> `SCR-SETTINGS-AGENTS-A02` | A 설치를 시작하고 B 설치 행도 연다 → 설치 진행과 취소는 각 agent 클러스터 키에 묶인다 → B 취소가 A 진행을 지우면 실패 | 각 행은 wake.conn.live의 agent-id 상태를 읽는다 ([`apps/wake/settings-pages.js:173`](../../apps/wake/settings-pages.js#L173)) | 없음(확인: apps/wake/settings-pages.js:173) | 고정 없음 → TASK-SCREEN-SETTINGS-AGENTS | D00021; D-USR-2026-11-16-7 |
| <a id="SCR-SETTINGS-AGENTS-A03"></a> `SCR-SETTINGS-AGENTS-A03` | A agent 조회만 timeout으로 응답한다 → A에 시간 초과·재시도, B에는 기존 연결 결과가 보인다 → B까지 오류로 바뀌면 실패 | 실패 클러스터만 readRow로 렌더한다 ([`apps/wake/settings-pages.js:239`](../../apps/wake/settings-pages.js#L239)) | 없음(확인: apps/wake/settings-pages.js:239) | 고정 없음 → TASK-SCREEN-SETTINGS-AGENTS | D00021; D-USR-2026-11-16-7 |
| <a id="SCR-SETTINGS-AGENTS-G01"></a> `SCR-SETTINGS-AGENTS-G01` | 배포는 ready지만 heartbeat·수집 조회는 실패시킨다 → 배포 준비와 등록·heartbeat·수집 상태를 분리한다 → 배포 ready만으로 수집 정상 표시이면 실패 | connected 판정은 lookup present와 rolloutReady true만 사용한다 ([`apps/wake/settings-pages.js:171`](../../apps/wake/settings-pages.js#L171)) | 등록·heartbeat·수집 확인을 연결 판정에 포함하지 않는다 | 고정 없음 → TASK-SCREEN-SETTINGS-AGENTS | D00021, D00024 |
