# Helm 릴리스 상세

<a id="SCR-HELM-DETAIL"></a> 진입: `wake://cluster/:cluster/gitops/:ns/:kind/:name (Helm 종류 분기)`. 목적(SRE 판단): Secret 없이 확인한 릴리스 메타와 소속 리소스를 판단한다.
구성: 허용 출처의 릴리스 이름·namespace·chart → 소속 리소스 → revision·status·이력의 권한 범위 밖(Secret) 표시.
현재: [apps/wake/pages/gitops-detail.js](../../apps/wake/pages/gitops-detail.js); [apps/wake/data/index.js](../../apps/wake/data/index.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 릴리스, 변경; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-GITOPS-DETAIL-01](../components/tables/gitops-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-GITOPS-DETAIL-01](../components/tables/gitops-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: 릴리스 이름·namespace는 meta.helm.sh/release-name·release-namespace, 관리 여부는 app.kubernetes.io/managed-by, 차트는 helm.sh/chart 또는 Argo helm source에서 읽는다. Secret 유래 상태·revision·values·이력은 허용 메타에 포함하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-HELM-DETAIL-01"></a> `SCR-HELM-DETAIL-01` | Helm 상세 진입 → 허용 메타의 이름·namespace·chart·소속 리소스와 읽기 범위를 표시한다 → Secret 기반 값 또는 가짜 정상 상태를 표시하면 실패 | Helm load는 data.get('helm')을 호출하지만 키가 UNCONNECTED로 분류된다(`apps/wake/pages/gitops-detail.js:31`, `apps/wake/data/index.js:131`). | 허용 주석·라벨을 읽는 공급원이 없어 이름·chart·소속 리소스를 구성하지 못한다. | 고정 없음 → TASK-SCREEN-HELM-DETAIL | D-01; C-003 |
| <a id="SCR-HELM-DETAIL-V01"></a> `SCR-HELM-DETAIL-V01` | → [RULE-SECRET](../rules.md#RULE-SECRET). | 상세는 helmReleases(h.secrets)를 남겨 두었고 라이브 data는 helm 미연결로 거절한다(`apps/wake/pages/gitops-detail.js:31`, `apps/wake/data/index.js:131`). | 차단된 Secret 모델을 허용 메타 모델로 교체해야 한다. | 고정 없음 → TASK-SCREEN-HELM-DETAIL | D-01; C-003 |
| <a id="SCR-HELM-DETAIL-V02"></a> `SCR-HELM-DETAIL-V02` | → [RULE-SECRET](../rules.md#RULE-SECRET). | helmBody는 revision·status·history를 값과 표로 그린다(`apps/wake/pages/gitops-detail.js:129`). | 제한 필드에 권한 범위 밖(Secret)을 표시하는 분기가 없다. | 고정 없음 → TASK-SCREEN-HELM-DETAIL | D-01; C-003 |
| <a id="SCR-HELM-DETAIL-A01"></a> `SCR-HELM-DETAIL-A01` | 허용 메타 읽기 실패 또는 미연결 → 읽기 실패·연결 안 됨과 검증된 릴리스 0개를 구분한다 → 실패를 0개로 표시하면 실패 | load의 catch가 unconfigured/forbidden/error를 나누고 empty가 각 상태를 표시한다(`apps/wake/pages/gitops-detail.js:42`, `apps/wake/pages/gitops-detail.js:145`). | 허용 메타 공급원은 없어서 검증된 릴리스 0개와 메타 조회 실패를 실제로 구분할 입력이 없다. | 고정 없음 → TASK-SCREEN-HELM-DETAIL | D-01; C-003 |
| <a id="SCR-HELM-DETAIL-A02"></a> `SCR-HELM-DETAIL-A02` | 이력 또는 revision별 values diff 열기 요청 → “권한 범위 밖(Secret)”으로 알리고 비활성화한다 → Secret 요청 또는 values 노출 시 실패 | values 탭과 이전/현재 values diff를 렌더하는 경로가 남아 있다(`apps/wake/pages/gitops-detail.js:132`, `apps/wake/pages/gitops-detail.js:140`). | Secret 유래 values 보기의 비활성화와 제한 안내가 없다. | 고정 없음 → TASK-SCREEN-HELM-DETAIL | D-01; C-003 |
| <a id="SCR-HELM-DETAIL-G01"></a> `SCR-HELM-DETAIL-G01` | meta.helm.sh·app.kubernetes.io 라벨/주석과 Argo CD helm source만 제공한다 → 릴리스 이름·namespace·chart·소속 리소스만 출처와 함께 표시한다 → revision·status·이력을 추정하거나 Secret 호출 시 실패 | helmReleases는 owner=helm Secret 라벨과 release 본문을 파싱한다(`apps/wake/data/gitops.js:147`). | meta.helm.sh·app.kubernetes.io·Argo helm source에서 소속 관계를 구성하는 모델이 없다. | 고정 없음 → TASK-SCREEN-HELM-DETAIL | D-01; C-003 |
