# 흐름 그래프

<a id="cmp-flow-01"></a>

<a id="CMP-FLOW-01"></a>

## CMP-FLOW-01 — 문제 중심 노드·띠

- 목표: → [RULE-SANKEY](../rules.md#RULE-SANKEY).
- 추가 조건: → [RULE-SANKEY](../rules.md#RULE-SANKEY).
- 추가 조건: → [RULE-SANKEY](../rules.md#RULE-SANKEY).
- 추가 조건: → [RULE-SANKEY](../rules.md#RULE-SANKEY).
- 추가 조건: → [RULE-SANKEY](../rules.md#RULE-SANKEY).
- 추가 조건: → [RULE-SANKEY](../rules.md#RULE-SANKEY).
- 현재: flowGraph.render는 nodes·links를 받고 sankeyLayout으로 띠·노드를 배치한다(`kit/components/flow-graph.js:152,358`).
- 차이: 목록을 요약하는 화면 데이터와 실제 전체 개수의 연결은 부품 render 입력만으로 고정되지 않는다.
- 고정 장치: 고정 없음 → TASK-CMP-FLOW-REVIEW
- 출처: D-USR-2026-11-16-7; D00821, D00833, D00836, D00838, D00862; D00644; D00724; D00811; D00816; D00872
- 점검 항목: → [RULE-SANKEY](../rules.md#RULE-SANKEY).

<a id="cmp-flow-02"></a>

## CMP-FLOW-02 — 관측과 추정·상태7개

- 목표: ownerReferences·selector·EndpointSlice만 있고 실제 트래픽 표본이 없는 network 입력을 연다 → 소유자·selector·EndpointSlice 관계는 근거를 밝히고 같은 namespace만으로 확정 통신이라고 표시하지 않는다. Network rx/tx는 실제 Prometheus 출처에서 읽으며 conns/retrans 미관측은 빈 값이다; [RULE-STATE](../rules.md#RULE-STATE); [RULE-SANKEY](../rules.md#RULE-SANKEY); 관계를 확정 통신량으로 표시하거나 미관측 conns/retrans를 0으로 채우거나 403인데 건강한 띠를 그리면 실패.
- 현재: network 읽기는 conns/retrans를 빈 배열로 반환하고 serviceFlow는 같은 namespace의 저장소에 estimated 링크를 만든다(`apps/wake/desktop/reads/network.cjs:49–59`; `apps/wake/data/network.js:57–78`).
- 차이: 저장소 띠의 값은 실제 통신 측정이 아니라 namespace별 ingress 값의 재사용이다. 추정 표시가 필요하다.
- 고정 장치: 고정 없음 → TASK-CMP-FLOW-SOURCE
- 출처: D00451, D00862
- 점검 항목: Service와 Pod는 EndpointSlice 대상으로 대조한다. 저장소 연결은 추정임을 표시하고 실제 호출 관측 없이 통신을 확정하지 않는다. 클릭은 같은 UID·namespace로 이동한다.

## 세부 동작 계약

| 규칙 ID | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="CMP-FLOW-MOTION"></a><a id="cmp-flow-motion"></a>CMP-FLOW-MOTION 흐름과 노드 움직임 | → [RULE-SANKEY](../rules.md#RULE-SANKEY) | render는 노드·띠의 상태 클래스와 공통 상태 모션을 그린다(`kit/components/flow-graph.js:152`) | 추가 대조: D00538: 모든 끝이 같은 각진 형상, 도착 때 노드 생성/소실, 값과 무관한 크기 또는 금지된 노드 바탕 채움; D00540: 중간 멈춤, 각진 띠 끝 또는 겹친 분기 외곽선; D00544: 한 프레임 점프 또는 전체 최초 등장 효과 재생이면 실패. reduced-motion 예외는 유지; D00713: 기본 바탕 alpha가 변해 뒤가 비치면 실패. | 고정 없음 → TASK-CMP-FLOW-MOTION | D00538, D00540, D00542, D00544, D00571, D00723, D00724, D00783, D00784, D00800, D00930; D00713; D00720 |
| <a id="CMP-FLOW-LABEL"></a><a id="cmp-flow-label"></a>CMP-FLOW-LABEL 실제 대상 이름과 요약 | 긴 Pod 이름과 count=12인 묶음 노드를 축소 화면에서 선택한다 → 노드의 실제 종류·이름과 묶인 개수를 읽을 수 있게 한다. 아이콘보다 노드 바탕이 작아지지 않는다. 띠 숫자는 공간이 있을 때만 쓰되 실제 값은 툴팁에서 항상 확인한다. 관련 리소스 노드 클릭은 UID·namespace를 보존하고 사용자가 접은 정보 카드를 자동으로 다시 펼치지 않는다. → 이름이 말줄임으로 사라지거나 링크가 namespace·UID를 잃으면 실패. | render는 노드 label과 링크 읽기값을 SVG에 구성한다(`kit/components/flow-graph.js:152`) | 없음(확인: kit/components/flow-graph.js:152) | 고정 없음 → TASK-CMP-FLOW-LABEL | D00697, D00700, D00712, D00713, D00780, D00848, D00855 |

| 규칙 ID | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="CMP-FLOW-STAGES"></a><a id="cmp-flow-stages"></a>CMP-FLOW-STAGES | 1. GitOps 이벤트가 적용 완료이되 health 미관측인 작업을 연다 → GitOps 한 카드에는 하나의 작업 흐름을 보인다. 실제 이벤트 수신 → 승인 → 적용 → 건강 확인 → 결과를 데이터가 보고한 상태로만 그린다. 미관측 단계는 idle이고 승인 필요는 wait, 실패는 fail로 표시한다. 적용 완료를 건강 확인 완료로 바꾸지 않고 다음 실제 이벤트와 현재 revision을 구별한다. → 적용 완료만으로 건강 확인·결과까지 성공 표시하면 실패.<br>2. 실행·실패·대기 단계가 있는 GitOps 작업 → 단계별 시각 장치 아래 이름/상태, 실제 진행·정지 상태 모션과 가능한 판단 버튼 → 텍스트 표만 제공하거나 시각 단계와 아래 상태가 분리되면 실패. 공통 판정은 [B-044](../design.md#B-044)에 연결한다.<br>3. 동일 작업의 복수 원천 이벤트 → 요약에는 짧은 키워드·수, 세부 원천은 상세/기록에서 확인 → 원천별 긴 설명이 단계 흐름을 밀어내면 실패.<br>4. 긴 이벤트 본문과 공급자·상대시각 → 오른쪽 공급자/시각은 하나의 메타 줄, 공통 항목 간격 유지 → 메타만 두 줄로 갈라지거나 서로 붙으면 실패. D00683에 따라 이벤트 공급자는 로고 없는 이름 링크 허용. 공통 판정은 [B-044](../design.md#B-044)에 연결한다.<br>5. 단계 상태 0·1·3·4·12개 → 요약은 최대 3점과 나머지 +N, 실제 상태 접근 유지 → 4점 이상 직접 나열 또는 n/n이면 실패. | statusFlow.render는 전달된 단계별 상태를 별도 행으로 렌더한다(`kit/components/status-flow.js:270`) | 추가 대조: D00631: 원천별 긴 설명이 단계 흐름을 밀어내면 실패; D00728: 4점 이상 직접 나열 또는 n/n이면 실패. | 고정 없음 → TASK-CMP-FLOW-STAGES | D00617, D00619, D00621, D00622, D00631, D00632, D00633, D00690, D00728; D00628; D00681 |

<a id="CMP-FLOW-VISUAL"></a>


## CMP-FLOW-VISUAL

- 목표: 같은 nodes/links에 filledOutline·outline·filled 입력 → 면+선·선만·면만을 각각 제공하며 데이터/위치/동작 보존 → 세 값이 같은 모양이거나 변형이 사라지면 실패.
- 현재: relation의 vs-outline과 vs-filled가 각각 fill·stroke를 끄며 기본은 filledOutline이다.(`kit/components/flow-graph.js:55`)
- 차이: 세 variant의 면·선 차이와 동일 데이터·좌표·조작을 함께 대조해야 한다.
- 고정 장치: 고정 없음 → TASK-CMP-FLOW-VISUAL
- 출처: D00550
