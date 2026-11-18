# GitOps 목록

<a id="SCR-GITOPS"></a> 진입: `wake://cluster/:cluster/gitops`. 목적(SRE 판단): Git 일치와 건강을 구분해 조사할 배포를 고른다.
구성: viewHeader·구역 탭 → namespace·검색·기간 → 컨트롤러/출처 → Application·Helm·워크로드 카드.
현재: [apps/wake/pages/gitops.js](../../apps/wake/pages/gitops.js); [apps/wake/data/gitops.js](../../apps/wake/data/gitops.js); [apps/wake/data/index.js](../../apps/wake/data/index.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: Application, 컨트롤러, 워크로드·Helm, 페이지·시간; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-GITOPS-01](../components/tables/gitops.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-GITOPS-01](../components/tables/gitops.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: GitOps Application은 gitops.repos의 binding/status/revision, Helm은 허용된 리소스 주석·라벨, 워크로드는 Kubernetes status를 기준으로 한다. 모든 이동은 cluster·namespace·kind·name·UID를 같은 대상으로 유지한다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-GITOPS-01"></a> `SCR-GITOPS-01` | GitOps 목록에 진입한다 → gitops.read의 컨트롤러·출처 상태와 namespace/검색/기간 아래 Application·허용 Helm 메타·워크로드가 보인다 → 다른 클러스터 대상이나 Secret 기반 값이면 실패 | body는 Application/Helm 표를 만들고 workloads는 건강 대조에만 쓴다(`apps/wake/pages/gitops.js:100`). | 워크로드 독립 카드가 없고 Helm 허용 메타 공급원은 미연결이다. | 고정 없음 → TASK-SCREEN-GITOPS | D00093; D00453; D-01 |
| <a id="SCR-GITOPS-V01"></a> `SCR-GITOPS-V01` | 클러스터 A/B Application을 함께 공급한다 → A binding.cluster_id의 sync·health·revision·namespace만 표시한다 → B 행이 섞이거나 Synced를 Healthy로 대체하면 실패 | apps는 cluster_id를 거르고 표는 Sync/Health/Revision을 별도 열로 둔다(`apps/wake/pages/gitops.js:27`, `apps/wake/pages/gitops.js:74`). | 없음(확인: apps/wake/pages/gitops.js:27) | 고정 없음 → TASK-SCREEN-GITOPS | D00100; D00104; D00106 |
| <a id="SCR-GITOPS-V02"></a> `SCR-GITOPS-V02` | 컨트롤러 0개 성공 응답과 API 403/접속 실패를 각각 공급한다 → 미설치와 권한 없음·읽기 실패가 다른 문구로 보인다 → 실패를 미설치로 표시하면 실패 | empty는 failure·access·controllers 길이에 따라 표시를 나눈다(`apps/wake/pages/gitops.js:53`). | 없음(확인: apps/wake/pages/gitops.js:53) | 고정 없음 → TASK-SCREEN-GITOPS | D00093; D00453 |
| <a id="SCR-GITOPS-V03"></a> `SCR-GITOPS-V03` | StatefulSet만 읽기 실패하고 Helm 허용 메타만 제공한다 → 실패 종류를 남기고 Secret 없이 릴리스 메타를 표시한다 → 실패를 빈 정상으로 합산하면 실패 | load의 종류별 catch는 []를 반환하고 Helm은 UNCONNECTED에 속한다(`apps/wake/pages/gitops.js:33`, `apps/wake/data/index.js:131`). | 워크로드 부분 실패가 소실되며 허용 메타를 읽는 경로가 없다. | 고정 없음 → TASK-SCREEN-GITOPS | D00453; D-01 |
| <a id="SCR-GITOPS-V04"></a> `SCR-GITOPS-V04` | 탭을 닫은 뒤 이전 gitops.read 응답을 완료한다 → 닫힌 세대의 응답은 화면에 반영되지 않는다 → 새 탭의 revision이 이전 값으로 바뀌면 실패 | polling의 current가 disposed·epoch·identity를 비교한다(`apps/wake/data/gitops.js:50`). | 없음(확인: apps/wake/data/gitops.js:50) | 고정 없음 → TASK-SCREEN-GITOPS | D00094 |
| <a id="SCR-GITOPS-A01"></a> `SCR-GITOPS-A01` | 서로 다른 revision의 Application 두 개를 표시한다 → 한 앱의 상태·revision·대상 워크로드는 동일 카드/상세에 묶는다 → 한 앱 카드에 다른 앱의 상태·revision·워크로드를 섞으면 실패 | applicationIdentity는 sourceIdentity를 쓰고 ownedWarnings는 kind/name/namespace로 소유 대상을 찾는다(`apps/wake/data/gitops.js:23`, `apps/wake/data/gitops.js:118`). | 소유 리소스 매칭에 UID를 사용하지 않아 이름이 재사용된 워크로드를 배제하지 못한다. | `apps/wake/data/gitops-view.test.mjs` — `a_healthy_application_with_an_unavailable_owned_deployment_is_not_plainly_healthy` | D00100; D00104; D00106 |
| <a id="SCR-GITOPS-A02"></a> `SCR-GITOPS-A02` | 해당 링크로 이동하고 이전 화면으로 복귀한다 → 행→앱 상세→Git과 클러스터 차이→원인 Pod로 이동한다 → 다른 클러스터의 상태·동작을 표시하면 실패 | 행 이동 주소에 Application UID를 넣지만 상세 조회는 UID 불일치 시 apps[0]으로 대체한다(`apps/wake/pages/gitops.js:133`, `apps/wake/pages/gitops-detail.js:35`). | 삭제·재생성한 동명 Application을 이전 대상 대신 열 수 있다. | 고정 없음 → TASK-SCREEN-GITOPS | D00094; D00106 |
| <a id="SCR-GITOPS-A03"></a> `SCR-GITOPS-A03` | 동일 계획에서 승인과 거절을 각각 실행한다 → sync 버튼처럼 보이는 요소가 쓰기 실행이면 사람 승인 없이는 작동하지 않는다 → 승인 전 쓰기가 발생하거나 같은 승인을 두 번 실행하면 실패 | 목록 actions는 조회·필터·상세 이동뿐이며 쓰기 sync 동작이 없다(`apps/wake/pages/gitops.js:126`). | 이 화면에 승인 후 실행 경로 자체가 없어 승인·거절에 따른 sync 결과를 표시하지 못한다. | 고정 없음 → TASK-SCREEN-GITOPS | D00869 |
| <a id="SCR-GITOPS-G01"></a> `SCR-GITOPS-G01` | → [RULE-SECRET](../rules.md#RULE-SECRET). | data의 helm 키는 미연결이고 목록은 helmFailure 때 카드를 숨긴다(`apps/wake/data/index.js:131`, `apps/wake/pages/gitops.js:86`). | 현재 Secret 요청은 미연결로 차단되지만 허용 메타와 권한 범위 밖 표시가 없다. | 고정 없음 → TASK-SCREEN-GITOPS | D-01; C-003 |
| <a id="SCR-GITOPS-G02"></a> `SCR-GITOPS-G02` | multi-source Application의 차이 조회를 거절·실패시킨다 → 지원하지 않는 출처와 실제 변경 없음·오류를 구분한다 → 조회 실패를 차이 0으로 표시하면 실패 | readDiff는 multiSource를 unsupported로 분류하고 실패를 error로 바꾼다(`apps/wake/pages/gitops-detail.js:51`). | 차이 문구는 구분하지만 files.length는 오류·미지원에도 0으로 머리에 표시한다. | 고정 없음 → TASK-SCREEN-GITOPS | D00453 |

## 표별 판단 계약

열의 원본식·단위·톤·툴팁·숨김 순서는 머리의 구성 요소 계약을 참조한다.

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-GITOPS-TABLE"></a> `SCR-GITOPS-TABLE` | → [RULE-SORT](../rules.md#RULE-SORT). | apps/wake/data/gitops.js:139 appRows()는 appBad→name, :159 helmReleases()는 ns→name으로 정렬하고 apps/wake/pages/gitops.js:106은 name/manifest_path만 검색한다 | Applications는 danger/warn과 namespace/UID 동점을 구분하지 않고 Helm은 문제 우선이 아니다. 저장소/revision 검색도 없다 | 고정 없음 → TASK-SCREEN-GITOPS | D-USR-2026-11-16-2, D-USR-2026-11-16-7, D00093 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-GITOPS-AXES"></a> `SCR-GITOPS-AXES` | Synced/Degraded인 앱을 열고 오래된 탭으로 복귀한다 → Sync=Synced와 Health=Degraded를 별도로 표시하고 마지막 수집 시각과 재조회 상태를 보인다 → Synced만으로 정상 처리하면 실패 | 목록은 별도 열을 쓰고 k8sLine이 stale/실패를 표시한다(`apps/wake/pages/gitops.js:45`, `apps/wake/pages/gitops.js:74`). | polling의 setVisible·resumeNow를 페이지 탭 복귀에 연결하지 않았다. | 고정 없음 → TASK-SCREEN-GITOPS | D00093; D00453 |
| <a id="SCR-GITOPS-STAGES"></a> `SCR-GITOPS-STAGES` | 1. 자동 동기화가 꺼진 OutOfSync 앱에 과거 revision 성공만 준다 → 목표 revision의 감지·적용·확인·감시를 구분하고 적용은 대기로 보인다 → 과거 성공을 새 revision 적용 완료로 보이면 실패.<br>2. 입력 Flux 조정 중, 적용/확인 단계의 구분 근거 없음 → 기대 조정 중임과 세부 단계 미확인을 함께 표시 → 실패 특정 세부 단계를 추정하거나 미확인이라는 사실을 생략. 공통 판정은 [FLOW-GIT-003](../flows/gitops-change.md#FLOW-GIT-003)에 연결한다. | contract는 deployment·revision·auto를 전달하지만 목록은 Sync/Health와 마지막 시각만 표시한다(`apps/wake/data/gitops.js:14`, `apps/wake/pages/gitops.js:71`). | 네 단계와 자동 적용 대기 정책을 보여주는 카드가 목록에 없다. | 고정 없음 → TASK-SCREEN-GITOPS | D00102; D00103; D00104; D00105; D00453 |
| <a id="SCR-GITOPS-HISTORY"></a> `SCR-GITOPS-HISTORY` | 같은 앱 UID의 revision 두 개와 서로 다른 시도 기록을 준 뒤 30초 갱신을 중단한다 → 시도별 원래 결과와 지연 표시가 보인다 → 과거 시도 값을 새 시도로 덮거나 최신 정상으로 표시하면 실패 | syncHistory는 deployment.history의 key/at/revision/state/by를 옮기고 stale 임계는 30초다(`apps/wake/data/gitops.js:98`, `apps/wake/data/gitops.js:104`). | 이력 화면 모델에서 컨트롤러·실패 사유·영향 리소스 필드를 생략한다. | 고정 없음 → TASK-SCREEN-GITOPS | D00105; D00106; D00453 |
| <a id="SCR-GITOPS-CARD"></a> `SCR-GITOPS-CARD` | 1. 서로 다른 저장소를 따르는 Application 두 개를 제공한다 → 대상마다 공급자·Git 소스·동작·현재 상태와 실제 이벤트 흐름이 한 카드에 보인다 → 여러 대상을 한 흐름의 단계로 합치면 실패.<br>2. 같은 작업에 수신 이벤트 3개 → 요약 진입 노드 하나와 실제 개수, 원본 개별 기록은 상세 유지 → 3개 진입 노드가 별도로 반복되면 실패. | appCard는 모든 Application을 하나의 summaryBar와 표로 그린다(`apps/wake/pages/gitops.js:64`). | 현재는 전체 집계 카드이며 대상별 상태 흐름·판단 선택이 없다. | 고정 없음 → TASK-SCREEN-GITOPS | D00625; D00627; D00630; D00634; D00690 |
