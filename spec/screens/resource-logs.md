# 리소스 상세 · 로그

<a id="SCR-RESOURCE-LOGS"></a> 진입: `wake://cluster/:cluster/ns/:ns/:kind/:name?tab=logs`. 목적(SRE 판단): 해당 시각·컨테이너 로그로 증상을 확인한다.
구성: 상세 머리·탭 → 공통 로그 도구 줄 → 시각·수준·원문 로그 보기.
현재: [apps/wake/pages/resource-detail.js](../../apps/wake/pages/resource-detail.js); [apps/wake/data/kinds.js](../../apps/wake/data/kinds.js); [apps/wake/data/index.js](../../apps/wake/data/index.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 현재·이전 로그, 줄·수집 범위; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: 선택 Pod metadata.uid·container·previous·절대 조회 구간에 대응하는 Kubernetes/Loki 로그 snapshot.text·partial·outsideRetention이 출처다. 공통 로그 보기의 줄 번호 n과 시각·수준·본문은 이 원문에서 파싱한다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-LOGS-01"></a> `SCR-RESOURCE-LOGS-01` | 검증된 Pod UID·container의 logs 탭을 연다 → 상세 머리·탭 아래 공통 로그 도구와 원문 보기에 Kubernetes/Loki 응답의 시각·수준·내용을 표시한다 → 다른 대상 로그나 도구 없는 원문이면 실패 | apps/wake/pages/resource-detail.js:635 logsTab()은 logToolbar와 logCard를 렌더하고 유효 스냅숏만 parseLogs에 넘긴다 | 없음(확인: apps/wake/pages/resource-detail.js:635) | 고정 없음 → TASK-SCREEN-RESOURCE-LOGS | D00452 |
| <a id="SCR-RESOURCE-LOGS-V01"></a> `SCR-RESOURCE-LOGS-V01` | 재시작한 컨테이너에서 현재/이전을 전환한다 → 요청 previous 값과 같은 실행 로그만 표시하고 이전 선택을 머리에 유지한다 → current와 previous가 섞이거나 이전 자료를 현재로 표시하면 실패 | apps/wake/pages/resource-detail.js:619 logSourceKey에 UID·container·previous가 포함되며 :624 logRequest()에도 previous가 전달된다 | 없음(확인: apps/wake/pages/resource-detail.js:619) | 고정 없음 → TASK-SCREEN-RESOURCE-LOGS | D00098, D00452 |
| <a id="SCR-RESOURCE-LOGS-V02"></a> `SCR-RESOURCE-LOGS-V02` | 범위 일부만 반환한 로그와 보관 기간 밖 응답을 각각 준다 → snapshot.partial은 잘림, outsideRetention은 보관 기간 밖, 정상 빈 응답은 로그 없음으로 구분하고 조회 구간·반환 줄을 표시한다 → 부분 응답을 전체 원문이나 기간 밖을 정상 0줄로 쓰면 실패 | apps/wake/pages/resource-detail.js:641 outsideRetention/unverifiedStream 문구를 고르고 :814는 서버 partial과 로컬 잘림을 합친다 | 원본 snapshot의 전체 수와 수집 범위를 별도 상태로 표시하는 값은 logCard에 전달하지 않는다 | 고정 없음 → TASK-SCREEN-RESOURCE-LOGS | D00095, D00452 |
| <a id="SCR-RESOURCE-LOGS-A01"></a> `SCR-RESOURCE-LOGS-A01` | 컨테이너 A 조회 중 B로 바꾼 뒤 A 응답을 늦게 전달한다 → tabRequest와 logSourceKey가 B인 원문만 남는다 → A 응답이 B 본문을 덮으면 실패 | apps/wake/pages/resource-detail.js:807은 이전 tabRequest를 폐기하고 :810은 logKey 불일치 스냅숏을 지운다 | 없음(확인: apps/wake/pages/resource-detail.js:807) | 고정 없음 → TASK-SCREEN-RESOURCE-LOGS | D00066, D-USR-2026-11-16-7 |
| <a id="SCR-RESOURCE-LOGS-A02"></a> `SCR-RESOURCE-LOGS-A02` | 현재 로그 따라가기를 끄고 이전 컨테이너로 전환한다 → 사용자가 켠 따라가기만 갱신한다. 이전 로그에는 따라가기를 적용하지 않는다 → 이전 로그가 자동 갱신되거나 스크롤이 강제 이동하면 실패 | apps/wake/pages/resource-detail.js:826 follow()는 ls.follow이고 previous가 아니며 logs 탭/ready일 때만 3초 갱신한다 | 없음(확인: apps/wake/pages/resource-detail.js:826) | 고정 없음 → TASK-SCREEN-RESOURCE-LOGS | D00099 |
| <a id="SCR-RESOURCE-LOGS-A03"></a> `SCR-RESOURCE-LOGS-A03` | 로그 줄바꿈·번호·시각을 토글하고 복사 실패와 다운로드를 수행한다 → log-card 공통 조작으로 원문은 그대로 보존하고 복사 실패는 성공 토스트로 알리지 않는다 → 다운로드 원문 변형이나 실패를 복사됨으로 표시하면 실패 | logActions는 다운로드·시각·줄바꿈을 연결하지만 복사 동작은 없고 logView는 원문 행 렌더만 제공한다(`apps/wake/pages/log-card.js:62`, `kit/components/log-view.js:38`). | 복사 버튼·성공/실패 피드백 경로가 없다. 다운로드는 st.logs를 그대로 저장한다. | 고정 없음 → TASK-SCREEN-RESOURCE-LOGS | D00452, D-USR-2026-11-16-7 |
| <a id="SCR-RESOURCE-LOGS-G01"></a> `SCR-RESOURCE-LOGS-G01` | 같은 UID·container·previous·절대 구간을 독립 로그와 상세 로그에서 읽는다 → 두 화면은 동일 원문·요청 한도·잘림 정보를 표시한다 → 한 화면이 잘린 결과를 전체라고 표시하거나 다른 실행 로그를 섞으면 실패 | 두 화면 모두 Kubernetes tail=1000/Loki=100을 요청하지만 상세는 추가 바이트 상한을 검사한다(`apps/wake/pages/logs.js:42`, `apps/wake/pages/resource-detail.js:628`). | 독립 화면은 1000행만 자르고 상세는 2MiB도 잘라 로컬 보관 범위가 다르다. 최초 100행 목표와의 차이는 BOUNDS에 해당한다. | 고정 없음 → TASK-SCREEN-RESOURCE-LOGS | D00095, D00098, D00452 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-LOGS-BOUNDS"></a> `SCR-RESOURCE-LOGS-BOUNDS` | 초기 100행 이후 더 보기로 읽은 로그가 1000행 또는 UTF-8 2MiB를 넘는다 → 처음에는 100행만 요청하고 누적 메모리 상한에서 잘림을 표시하며 previous·source를 유지한다 → 처음부터 1000행을 요청하거나 상한 초과분을 전부라고 표시하면 실패 | apps/wake/pages/resource-detail.js:23~24 상한은 1000행/2MiB이고 :630 boundedLogRows()는 바이트와 줄을 함께 제한한다 | 로컬 상한은 있으나 Kubernetes 첫 요청은 tail=1000이고 이어 읽기 cursor를 요청에 전달하지 않는다 | 고정 없음 → TASK-SCREEN-RESOURCE-LOGS | D00095, D-USR-2026-11-16-7 |

<a id="SCR-RESOURCE-LOG-TARGET-PICK"></a>


## SCR-RESOURCE-LOG-TARGET-PICK

- 목표: 입력 둘 이상의 Pod·컨테이너를 가진 워크로드에서 로그 열기 → 기대 확인된 Pod와 컨테이너를 선택하고 그 대상의 현재/이전 로그 조회 → 실패 첫 대상을 임의로 택하거나 선택과 실제 로그 대상이 다름
- 현재: 상세 상태가 pod 및 로그 선택값을 보관한다.(`apps/wake/pages/resource-detail.js:85`)
- 차이: 다중 Pod·컨테이너 선택과 실제 조회 대상의 일치를 고정해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-RESOURCE-LOGS
- 출처: D00088

<a id="SCR-RESOURCE-LOGS-HEADING"></a>

## SCR-RESOURCE-LOGS-HEADING

- 목표: Pod 상세의 Logs 탭을 선택한다 → 선택 탭의 Logs 이름과 같은 역할을 하는 본문 제목은 반복하지 않고 공통 탭 모양을 유지한다 → 같은 제목을 본문에 다시 붙이거나 이 상세만 탭 모양을 바꾸면 실패. 탭 전체 계약은 [CMP-CTRL-TABS](../components/controls.md#CMP-CTRL-TABS)를 따른다.
- 현재: 상세가 선택한 탭을 st.tab에 보관한다.(`apps/wake/pages/resource-detail.js:85`)
- 차이: Logs 탭에서 같은 역할 제목이 중복되는지 점검해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-RESOURCE-LOGS
- 출처: D00360
