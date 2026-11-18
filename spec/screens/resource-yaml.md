# 리소스 상세 · YAML

<a id="SCR-RESOURCE-YAML"></a> 진입: `wake://cluster/:cluster/ns/:ns/:kind/:name?tab=yaml`. 목적(SRE 판단): 객체 설정과 resourceVersion을 확인한다.
구성: 상세 머리·탭 → resourceVersion 머리의 알약 카드 → codeBlock.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 문서, 파일·복사; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-RESOURCE-DETAIL-01](../components/tables/resource-detail.md). 화면의 대상/복귀 계약을 함께 적용한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-RESOURCE-YAML-01"></a> `SCR-RESOURCE-YAML-01` | metadata.resourceVersion=42인 Pod의 YAML을 연다 → 상세 머리 아래 YAML 카드 머리에 resourceVersion 42, 본문에 같은 응답의 YAML을 표시한다 → 머리 41·본문 42처럼 버전이 섞이면 실패 | yamlTab 머리는 r.raw.metadata.resourceVersion, 본문은 st.yaml을 사용한다 ([`apps/wake/pages/resource-detail.js:669`](../../apps/wake/pages/resource-detail.js#L669)) | 머리 객체와 YAML을 별도 요청으로 읽어 응답 버전이 달라질 수 있다 | 고정 없음 → TASK-SCREEN-RESOURCE-YAML | D01039; D-USR-2026-11-16-7 (후속 채택) |
| <a id="SCR-RESOURCE-YAML-V01"></a> `SCR-RESOURCE-YAML-V01` | managedFields가 있는 객체를 읽고 포함 선택을 켠다 → 기본 문서에서 metadata.managedFields를 빼고 선택 후 원본 필드를 포함한다 → 선택 전 노출 또는 선택 후 누락이면 실패 | yaml resolver는 managedFields와 UID를 검사한 뒤 toYaml로 변환한다 ([`apps/wake/data/index.js:121`](../../apps/wake/data/index.js#L121)) | 없음(확인: apps/wake/data/index.js:121) | apps/wake/data/kinds.test.mjs :: YAML: managedFields 숨김, 특수 값은 따옴표 | D-USR-2026-11-16-7 (세부 동작 기본값) |
| <a id="SCR-RESOURCE-YAML-V02"></a> `SCR-RESOURCE-YAML-V02` | UID u1·resourceVersion 42의 표시 문서를 복사·내려받기 한다 → 두 결과가 현재 codeBlock.text의 YAML과 일치한다 → 이전 문서나 다른 UID가 복사되면 실패 | codeBlock에 st.yaml과 r.name.yaml 파일명을 전달한다 ([`apps/wake/pages/resource-detail.js:670`](../../apps/wake/pages/resource-detail.js#L670)) | 없음(확인: apps/wake/pages/resource-detail.js:670) | 고정 없음 → TASK-SCREEN-RESOURCE-YAML | D00454; D00093; D-USR-2026-11-16-7 (표시 문서와 복사 일치) |
| <a id="SCR-RESOURCE-YAML-A01"></a> `SCR-RESOURCE-YAML-A01` | 여러 문서와 긴 문자열이 있는 YAML에서 접기·줄바꿈을 바꾼다 → 공통 codeBlock에 키·문자열 구문색과 원문을 유지한다 → 문서 누락 또는 구문색 소실이면 실패 | YAML 본문은 syntax yaml과 wrap true인 codeBlock이다 ([`apps/wake/pages/resource-detail.js:670`](../../apps/wake/pages/resource-detail.js#L670)) | 없음(확인: apps/wake/pages/resource-detail.js:670) | kit/components/code-block.test.mjs :: yaml: keys, quoted and bare strings, numbers and booleans, comments, list items and document separators | D00253, D00879 |
| <a id="SCR-RESOURCE-YAML-A02"></a> `SCR-RESOURCE-YAML-A02` | YAML 읽기에 403·404·다른 UID 응답을 각각 준다 → 권한 없음·대상 없음·대상 변경을 구분해 표시한다 → 빈 YAML 성공이나 옛 UID 본문이 보이면 실패 | failure는 forbidden·missing·identity_changed를 별도 상태로 바꾼다 ([`apps/wake/pages/resource-detail.js:89`](../../apps/wake/pages/resource-detail.js#L89)) | 없음(확인: apps/wake/pages/resource-detail.js:89) | 고정 없음 → TASK-SCREEN-RESOURCE-YAML | D00114; D-USR-2026-11-16-7 |
| <a id="SCR-RESOURCE-YAML-A03"></a> `SCR-RESOURCE-YAML-A03` | → [RULE-SECRET](../rules.md#RULE-SECRET). | yaml resolver는 종류 제한 없이 adapter.get을 호출한다 ([`apps/wake/data/index.js:121`](../../apps/wake/data/index.js#L121)) | YAML resolver 자체에는 Secret 선차단 조건이 없다 | 고정 없음 → TASK-SCREEN-RESOURCE-YAML | D-01, C-003 |
| <a id="SCR-RESOURCE-YAML-G01"></a> `SCR-RESOURCE-YAML-G01` | 기본 객체 읽기 뒤 resourceVersion이 41에서 42로 바뀐 YAML 응답을 준다 → YAML 카드 머리와 문서 metadata.resourceVersion이 모두 42이다 → 머리만 41이면 실패 | YAML 응답은 st.yaml만 갱신하고 r.raw는 갱신하지 않는다 ([`apps/wake/pages/resource-detail.js:808`](../../apps/wake/pages/resource-detail.js#L808)) | YAML 재조회가 머리 resourceVersion을 원자적으로 바꾸지 않는다 | 고정 없음 → TASK-SCREEN-RESOURCE-YAML | D01039; D-USR-2026-11-16-7 (후속 채택) |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-YAML-READ"></a> `SCR-YAML-READ` | 1. 긴 YAML에서 검색·복사·접기와 managedFields 선택을 사용한다 → 같은 codeBlock 원문을 대상으로 조작하고 코드는 내부에서 스크롤한다 → 검색이 다른 문서를 찾거나 페이지 전체가 가로로 늘어나면 실패.<br>2. 입력 키·문자열·숫자·불리언·주석이 섞인 실제 YAML → 기대 원문을 보존하며 코드 구성 요소의 YAML 구문 하이라이트 적용 → 실패 일반 텍스트로만 표시하거나 하이라이트 때문에 원문 변경. 공통 판정은 [B-025](../design.md#B-025)에 연결한다. | managedFields 버튼을 codeBlock.head에 배치한다 ([`apps/wake/pages/resource-detail.js:671`](../../apps/wake/pages/resource-detail.js#L671)) | 없음(확인: apps/wake/pages/resource-detail.js:671) | 고정 없음 → TASK-SCREEN-RESOURCE-YAML | D00253, D00879; D-USR-2026-11-16-7 |
