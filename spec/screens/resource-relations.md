# 리소스 상세 · 관련

<a id="SCR-RESOURCE-RELATIONS"></a> 진입: `wake://cluster/:cluster/ns/:ns/:kind/:name?tab=relations`. 목적(SRE 판단): 소유·선택 관계와 영향 범위를 확인한다.
구성: 상세 머리·탭 → 관련 관계 흐름 → 관련 리소스 표.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 소유·선택·참조 관계, 노드·행; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-FLOW-01](../components/flow-graph.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-RELATIONS-01"></a> `SCR-RESOURCE-RELATIONS-01` | Pod p의 관련 탭을 연다 → 머리의 p 아래 소유 흐름과 관련 리소스 표에 Kubernetes ownerReferences의 대상 이름을 표시한다 → 표가 없거나 다른 Pod의 소유자가 나오면 실패 | relations는 flowGraph와 빈 상태만 반환한다 ([`apps/wake/pages/resource-detail.js:674`](../../apps/wake/pages/resource-detail.js#L674)) | 관련 리소스 공통 표가 없다 | 고정 없음 → TASK-SCREEN-RESOURCE-RELATIONS | D00088 |
| <a id="SCR-RESOURCE-RELATIONS-V01"></a> `SCR-RESOURCE-RELATIONS-V01` | Pod ownerReferences.uid=u1, Service selector app=api를 읽는다 → 소유 간선은 owner, 선택 간선은 selector로 구분한다 → selector 일치만으로 owner를 표시하면 실패 | Service는 selector, 워크로드는 owner 간선을 생성한다 ([`apps/wake/pages/resource-detail.js:708`](../../apps/wake/pages/resource-detail.js#L708)) | 없음(확인: apps/wake/pages/resource-detail.js:708) | 고정 없음 → TASK-SCREEN-RESOURCE-RELATIONS | D00088, D00450 |
| <a id="SCR-RESOURCE-RELATIONS-V02"></a> `SCR-RESOURCE-RELATIONS-V02` | UID u1의 Pod와 소유 ReplicaSet u2를 읽는다 → 그림 노드와 표 행이 같은 kind·namespace·name·UID를 가리키며 선택 강조도 일치한다 → 이름이 같은 u3가 강조되면 실패 | Pod 노드는 raw.metadata.uid를 ID로 쓰지만 표 선택 상태는 만들지 않는다 ([`apps/wake/pages/resource-detail.js:697`](../../apps/wake/pages/resource-detail.js#L697)) | 표 행과 노드 사이 선택 공유가 없다 | 고정 없음 → TASK-SCREEN-RESOURCE-RELATIONS | D00088; D-USR-2026-11-16-7 |
| <a id="SCR-RESOURCE-RELATIONS-A01"></a> `SCR-RESOURCE-RELATIONS-A01` | 검증된 ReplicaSet 소유 노드를 클릭한 뒤 뒤로 간다 → ownerReferences의 namespace·name·UID 상세를 열고 원래 Pod의 관련 탭으로 돌아온다 → 새 UID를 같은 소유자로 열거나 요약 탭으로 복귀하면 실패 | 소유 노드 주소에 namespace와 이름 및 at만 전달한다 ([`apps/wake/pages/resource-detail.js:704`](../../apps/wake/pages/resource-detail.js#L704)) | 소유 UID와 원래 관련 탭의 복귀 주소가 링크에 없다 | 고정 없음 → TASK-SCREEN-RESOURCE-RELATIONS | D00088, D00450 |
| <a id="SCR-RESOURCE-RELATIONS-A02"></a> `SCR-RESOURCE-RELATIONS-A02` | Pod에 소유 참조 두 개를 주고 하나만 403으로 응답한다 → 성공한 소유 노드는 유지하고 실패 참조에 권한 상태를 표시한다 → 성공 노드도 사라지거나 실패 참조가 정상색이면 실패 | loadOwners는 참조별 allSettled와 entry.state로 성공·실패를 분리한다 ([`apps/wake/pages/resource-detail.js:129`](../../apps/wake/pages/resource-detail.js#L129)) | 없음(확인: apps/wake/pages/resource-detail.js:129) | apps/wake/pages/resource-pages.test.mjs :: detail owner: one failed reference and auxiliary denial do not hide another verified owner | D00088 |
| <a id="SCR-RESOURCE-RELATIONS-G01"></a> `SCR-RESOURCE-RELATIONS-G01` | u1 소유 조회가 늦는 동안 Pod UID를 u2로 바꾼다 → relatedIdentity와 ownerBasis가 u2인 그림만 갱신한다 → u1의 늦은 참조가 u2의 소유자로 나타나면 실패 | valid는 tabRequest와 ownerBasis.key 변경을 검사한다 ([`apps/wake/pages/resource-detail.js:126`](../../apps/wake/pages/resource-detail.js#L126)) | 없음(확인: apps/wake/pages/resource-detail.js:126) | apps/wake/pages/resource-pages.test.mjs :: detail owner: late response after pod-uid cannot verify or update | D00088 |
