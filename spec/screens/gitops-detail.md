# GitOps 상세

<a id="SCR-GITOPS-DETAIL"></a> 진입: `wake://cluster/:cluster/gitops/:ns/:kind/:name`. 목적(SRE 판단): 변경 파일·revision·적용 상태로 드리프트와 실패 원인을 확인한다.
구성: 머리 → Sync·Health·revision 상태 → 기간 → 동기화 이력 → 파일 트리·diff → 리소스 흐름/표.
현재: [apps/wake/pages/gitops-detail.js](../../apps/wake/pages/gitops-detail.js); [apps/wake/data/gitops.js](../../apps/wake/data/gitops.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 앱 신원, 차이, 파일 트리, 이력·영향; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-GITOPS-DETAIL-01](../components/tables/gitops-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-GITOPS-DETAIL-01](../components/tables/gitops-detail.md), [CMP-T-GITOPS-01](../components/tables/gitops.md). 화면의 대상/복귀 계약을 함께 적용한다.
고정 장치: `apps/wake/data/gitops-view.test.mjs`; `apps/wake/desktop/gitops-deployment.test.cjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-GITOPS-DETAIL-01"></a> `SCR-GITOPS-DETAIL-01` | Application 상세를 연다 → contract의 Sync·Health·revision 뒤 기간·이력·파일 diff·리소스 관계가 보인다; [RULE-SECRET](../rules.md#RULE-SECRET). | Helm 분기는 data.get('helm')의 secrets로 release를 만든다; `apps/wake/pages/gitops-detail.js:31` | Helm Secret 기반 이력·values 경로가 남아 D-01과 충돌한다 | 고정 없음 → TASK-SCREEN-GITOPS-DETAIL | D00453; D-01 |
| <a id="SCR-GITOPS-DETAIL-V01"></a> `SCR-GITOPS-DETAIL-V01` | UID=u1, revision=r1로 diff를 요청한다 → gitops.diff application에 name·namespace·uid=u1·revision=r1이 간다 → 다른 UID/revision으로 비교하면 실패 | service 호출에 sourceIdentity와 app.revision을 함께 보낸다; `apps/wake/pages/gitops-detail.js:55` | 조회 UID가 없으면 apps[0]로 대체하므로 오래된 UID 진입을 거절하지 않는다 | 고정 없음 → TASK-SCREEN-GITOPS-DETAIL | D00453; UID 고정은 D-USR-2026-11-16-7 |
| <a id="SCR-GITOPS-DETAIL-V02"></a> `SCR-GITOPS-DETAIL-V02` | available diff와 verified_empty·forbidden·unauthorized·unsupported·unconfigured·timeout·notQueried 응답을 각각 연다 → −live/+git 방향과 DIFF_TEXT 상태별 문구를 보인다 → 비교 실패를 차이 없음으로 표시하면 실패 | DIFF_TEXT가 각 상태를 나누고 lineDiff는 live를 첫 인수로 받는다; `apps/wake/pages/gitops-detail.js:91` | available인데 files=[]인 응답도 차이 없음으로 표시하며 검증된 빈 결과와 합친다 | 고정 없음 → TASK-SCREEN-GITOPS-DETAIL | D00453 |
| <a id="SCR-GITOPS-DETAIL-V03"></a> `SCR-GITOPS-DETAIL-V03` | files에 a.yaml·b.yaml을 주고 b.yaml을 선택한다 → fileTree current와 codeBlock path/text는 같은 cur.file의 git/live다 → a.yaml 코드가 남으면 실패 | st.file로 cur를 찾고 tree와 code에 같은 cur를 사용한다; `apps/wake/pages/gitops-detail.js:96` | 없음(확인: `apps/wake/pages/gitops-detail.js:96`) | 고정 없음 → TASK-SCREEN-GITOPS-DETAIL | D00453, D00931 |
| <a id="SCR-GITOPS-DETAIL-V04"></a> `SCR-GITOPS-DETAIL-V04` | Sync=Synced, Health=Degraded와 경고 Pod를 준다 → Health와 리소스 경고가 별도로 남는다 → Sync 정상만으로 초록 정상 머리를 보이면 실패 | headState는 비정상 health를 sync보다 먼저 판단한다; `apps/wake/pages/gitops-detail.js:61` | 없음(확인: `apps/wake/pages/gitops-detail.js:61`) | apps/wake/pages/signal-pages.test.mjs — application_detail_warns_about_the_owned_deployment_and_shows_the_read_diff | D00453 |
| <a id="SCR-GITOPS-DETAIL-A01"></a> `SCR-GITOPS-DETAIL-A01` | 미지원 Flux·multi-source 비교를 요청한다 → Flux 또는 multiSource 미지원은 차이 없음으로 표시하지 않는다 → 비교 미지원을 차이 없음으로 표시하면 실패 | Flux 또는 multiSource는 unsupported로 반환한다; `apps/wake/pages/gitops-detail.js:51` | 없음(확인: `apps/wake/pages/gitops-detail.js:51`) | 고정 없음 → TASK-SCREEN-GITOPS-DETAIL | D00453 |
| <a id="SCR-GITOPS-DETAIL-A02"></a> `SCR-GITOPS-DETAIL-A02` | Git 파일 diff에서 대상 리소스로 이동한 뒤 돌아온다 → Git 변경 원문과 대상 리소스를 왔다 갔다 해도 file/range와 앱 신원을 보존한다 → file·range·Application UID가 바뀌면 실패 | file·range는 페이지 지역 st에 보관한다; `apps/wake/pages/gitops-detail.js:25` | 페이지 재생성 시 st가 초기화되며 리소스 링크에도 Application UID를 전달하지 않는다 | 고정 없음 → TASK-SCREEN-GITOPS-DETAIL | D00453 |
| <a id="SCR-GITOPS-DETAIL-A03"></a> `SCR-GITOPS-DETAIL-A03` | 이미지 태그는 그대로 두고 Git 설정값만 바뀐 두 revision을 비교한다 → 설정 변경이 해당 파일 diff에 나타난다 → 이미지가 같다는 이유로 설정 diff를 누락하거나 차이 없음으로 표시하면 실패 | lineDiff는 이미지 필터 없이 cur.live와 cur.git 전체를 비교한다; `apps/wake/pages/gitops-detail.js:99` | 없음(확인: `apps/wake/pages/gitops-detail.js:99`) | 고정 없음 → TASK-SCREEN-GITOPS-DETAIL | D00453 |
| <a id="SCR-GITOPS-DETAIL-G01"></a> `SCR-GITOPS-DETAIL-G01` | Application 사건과 이미지 불변·설정 변경 배포를 조회한다 → Application UID를 사건에 연결하고 변경 설정 diff를 표시한다 → 사건 부재를 정상으로 숨기거나 설정 변경을 차이 없음으로 표시하면 실패 | 본문은 status·range·history·diff·resource를 조립한다; `apps/wake/pages/gitops-detail.js:89` | Application UID 기반 사건 연결 구역이 없다. 설정 diff 자체는 전체 텍스트 비교다 | 고정 없음 → TASK-SCREEN-GITOPS-DETAIL | D00453 |
| <a id="SCR-GITOPS-DETAIL-G02"></a> `SCR-GITOPS-DETAIL-G02` | Pod 읽기를 실패시키고 diff 대기 중 다른 Application으로 이동한다 → 부분 실패를 남기고 이전 UID·revision 응답을 폐기한다 → 빈 정상 목록 또는 다른 앱 diff가 나타나면 실패 | Pod 조회 실패를 []로 바꾸고 diff 응답은 56행에서 그대로 대입한다; `apps/wake/pages/gitops-detail.js:38` | 부분 실패가 사라지며 비동기 diff에 요청 UID·revision 세대 검사가 없다 | 고정 없음 → TASK-SCREEN-GITOPS-DETAIL | D00453 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-GITOPS-DIFF"></a> `SCR-GITOPS-DIFF` | 1. 여러 Git 파일과 revision을 가진 Application을 연다 → 실제 저장소 commit 링크와 파일 트리, 선택 파일의 −클러스터/+Git 전체 diff가 보인다 → 해시가 링크가 아니거나 설정 변경을 누락하면 실패.<br>2. 입력 diff 없음과 아직 조회하지 않음 상태를 각각 표시 → 기대 상태 의미에 맞는 간결한 문구·git 아이콘을 가로/세로 중앙에 표시 → 실패 잘못된 번역투·다른 아이콘·중앙 이탈 또는 오류를 빈 성공으로 처리. | Revision은 shortRev 문자열이며 diffCard는 fileTree와 codeBlock을 쓴다; `apps/wake/pages/gitops-detail.js:77` | Revision에 공급자 commit URL과 아이콘 링크가 없다 | 고정 없음 → TASK-SCREEN-GITOPS-DETAIL | D00453, D00931, D01037; D00347 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-GITOPS-DETAIL-REQ-R-046"></a> `SCR-GITOPS-DETAIL-REQ-R-046` | Synced/Degraded와 최근 실패 이력이 있는 Application을 조회한다 → app.sync·health·revision·repo/path·syncHistory 및 소유 리소스 이상을 함께 보인다 → sync만으로 장애를 숨기면 실패 | statusBar는 Sync와 Health를 별도 items로 구성한다; `apps/wake/pages/gitops-detail.js:76` | 없음(확인: `apps/wake/pages/gitops-detail.js:76`) | 고정 없음 → TASK-SCREEN-GITOPS-DETAIL | D00453 |

<a id="SCR-GITOPS-DEFAULT-TAB"></a>


## SCR-GITOPS-DEFAULT-TAB

- 목표: 입력 GitOps 대상 상세 최초 진입 → 기대 배포 상태를 기본으로 열고 차이 보기를 별도 진입으로 제공 → 실패 차이 보기만 기본으로 열려 배포 상태를 먼저 볼 수 없음
- 현재: GitOps 상세가 대상 종류에 따라 분기한다.(`apps/wake/pages/gitops-detail.js:31`)
- 차이: 최초 기본 탭과 별도 차이 보기 진입을 상태별로 대조해야 한다.
- 고정 장치: 고정 없음 → TASK-SCREEN-GITOPS-DETAIL
- 출처: D00100
