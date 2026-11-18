# 인시던트 작업면

<a id="SCR-INCIDENT-WORKSPACE"></a> 진입: `wake://cluster/:cluster/incidents/:id`. 목적(SRE 판단): 근거로 조치를 고르고 승인 뒤 실제 회복까지 확인한다.
구성: 사건 머리 → 검색·AI·내보내기·복사 한 도구 줄 → 작은 statusFlow → 범위·시간·원인·조치·확인·기록.
현재: [apps/wake/pages/incident-detail.js](../../apps/wake/pages/incident-detail.js); [apps/wake/pages/incident-parts.js](../../apps/wake/pages/incident-parts.js); [apps/wake/data/index.js](../../apps/wake/data/index.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 머리, 출처 칩; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-INC-01](../components/incident-criteria.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md); [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md); [CMP-T-INCIDENT-PARTS-01](../components/tables/incident-parts.md). 표 열과 카드 세부는 components ID를 참조한다.
표별 SRE 판단·기본 정렬/동점·문제 우선·행 이동·검색/거르기와 열 계약: [CMP-T-INCIDENT-DETAIL-01](../components/tables/incident-detail.md), [CMP-T-INCIDENT-PARTS-01](../components/tables/incident-parts.md). 화면의 대상/복귀 계약을 함께 적용한다.

자료: data.get('incident', {cluster,id})의 workspace 한 개가 scope·impact·timeline·chain·options·verify·audit를 공급한다. 응답 교체 시 incident ID와 대상 UID·기간이 다른 구역을 혼합하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-WORKSPACE-01"></a> `SCR-INCIDENT-WORKSPACE-01` | incident.workspace가 반환한 사건을 연다 → 머리·출처·검색/AI/내보내기/복사 도구 줄·작은 상태 흐름·범위/시간/원인/조치/확인/기록 순서로 보인다 → 다른 사건 값이나 빠진 구역이 있으면 실패 | render가 focusLine·headMeta·chips·actionRow·compact statusFlow를 조립한다(`apps/wake/pages/incident-detail.js:173`). | verifyFrom이 없으면 확인 구역을 생략하므로 아직 시작 전 상태를 볼 수 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-WORKSPACE | D00092; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENT-WORKSPACE-V01"></a> `SCR-INCIDENT-WORKSPACE-V01` | impact={label:5xx,now:3,baseline:1,threshold:2,unit:%,from:10:00}인 사건을 연다 → 머리에 5xx 현재 3%·평소 1%·기준 2%·10:00, target와 oncall·nextShare·detectedAt이 보인다 → 단위나 영향 시작 시각 누락이면 실패 | impactText와 focusLine·headMeta가 해당 필드를 읽는다(`apps/wake/pages/incident-detail.js:44`). | baseline 관측이 없으면 허브가 0을 넣어 평소 0%로 보일 수 있다. | 고정 없음 → TASK-SCREEN-INCIDENT-WORKSPACE | D00092; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENT-WORKSPACE-V02"></a> `SCR-INCIDENT-WORKSPACE-V02` | sources에 kubernetes, idle Loki, error Prometheus를 공급한다 → 연결된 Prometheus 오류 칩만 보이고 마지막 성공 시각이 유지된다 → Loki 미연결 칩이나 정상 Prometheus 칩이 보이면 실패 | chipSources는 kubernetes와 idle을 제외하고 state/detail/last를 전달한다(`apps/wake/pages/incident-detail.js:67`). | 없음(확인: apps/wake/pages/incident-detail.js:67) | 고정 없음 → TASK-SCREEN-INCIDENT-WORKSPACE | D00992; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENT-WORKSPACE-A01"></a> `SCR-INCIDENT-WORKSPACE-A01` | 조치 보기 버튼을 누른다 → 같은 사건의 act 구역을 펼쳐 이동하고 작은 상태 흐름을 유지한다 → 새 사건이나 큰 단계 상자로 전환하면 실패 | wake.inc.focus는 opened·cardOpen·focusSection을 설정한다(`apps/wake/pages/incident-detail.js:198`). | 없음(확인: apps/wake/pages/incident-detail.js:198) | 고정 없음 → TASK-SCREEN-INCIDENT-WORKSPACE | D01004; D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENT-WORKSPACE-A02"></a> `SCR-INCIDENT-WORKSPACE-A02` | focusSection이 있는 사건에 진입한 뒤 사용자가 다른 위치로 스크롤하고 데이터를 갱신한다 → 최초 진입에만 focusSection으로 이동하며 이후 갱신은 사용자의 위치를 유지한다 → 갱신 때 focusSection으로 다시 이동하면 실패 | afterRender는 focusSection으로 스크롤한 직후 null로 지운다(`apps/wake/pages/incident-detail.js:182`). | 없음(확인: apps/wake/pages/incident-detail.js:182) | 고정 없음 → TASK-SCREEN-INCIDENT-WORKSPACE | D00910 |
| <a id="SCR-INCIDENT-WORKSPACE-A03"></a> `SCR-INCIDENT-WORKSPACE-A03` | 인시던트에서 AI에 묻기를 누른다 → AI에 묻기는 한 오른쪽 칸에서 같은 사건 ID/UID/기간으로 시작한다 → 사건 ID·UID·기간이 다른 대화로 시작하면 실패 | wake.inc.ask는 openPanel({})를 호출하고 meta.context에는 icon/title/sub만 넣는다(`apps/wake/pages/incident-detail.js:37`, `apps/wake/pages/incident-detail.js:203`). | 명시적 incident ID·UID·조회 구간이 AI 호출 인수에 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-WORKSPACE | D00094; D00742 |
| <a id="SCR-INCIDENT-WORKSPACE-G01"></a> `SCR-INCIDENT-WORKSPACE-G01` | 조치 후보를 선택하고 아직 실행하지 않는다 → 선택 상태와 실제 적용 완료 단계를 분리한다 → chosen만으로 applyDone을 표시하면 실패 | unit은 chosen이 있으면 act state=done과 applyDone을 만든다(`apps/wake/pages/incident-detail.js:146`). | 실제 실행 확인 없이 선택만으로 적용 완료가 된다. | 고정 없음 → TASK-SCREEN-INCIDENT-WORKSPACE | D00092 |
| <a id="SCR-INCIDENT-WORKSPACE-G02"></a> `SCR-INCIDENT-WORKSPACE-G02` | 인시던트 작업면 데이터를 지연시킨다 → 완성될 머리·카드·표와 같은 레이아웃 뼈대를 유지한다 → busy 아이콘만 남거나 완료 시 빈 칸만큼 화면이 밀리면 실패 | loading 분기는 busy statusIcon 하나만 반환한다(`apps/wake/pages/incident-detail.js:170`). | 머리·카드·표 자리를 유지하는 로딩 뼈대가 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-WORKSPACE | D01027; D01032 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-CYCLE"></a> `SCR-INCIDENT-CYCLE` | 한 사건에서 범위·변경·원인·근거·제안·승인·적용·확인·감사를 따라간다 → 각 결과가 workspace.id와 원래 evidence에 연결된다 → 선택을 실행 완료로, 증상 완화를 서비스 복구로 표시하면 실패 | unit은 chosen이면 applyDone, resolved이면 verify done을 표시한다(`apps/wake/pages/incident-detail.js:146`). | 실행 결과를 확인하는 중간 상태 없이 승인된 선택과 해결 phase만 사용한다. | 고정 없음 → TASK-SCREEN-INCIDENT-WORKSPACE | D00092; D00094; D00738; D00742 |
| <a id="SCR-INCIDENT-CHOICE"></a> `SCR-INCIDENT-CHOICE` | 원인 조사 중 조치 보기를 누른다 → 같은 작업면에 target, chain의 근거, options의 다음 행동이 함께 보인다 → 근거를 잃는 별도 화면으로 이동하면 실패 | unit은 decision.actions와 여섯 sections를 함께 넘긴다(`apps/wake/pages/incident-detail.js:152`). | 없음(확인: apps/wake/pages/incident-detail.js:152) | 고정 없음 → TASK-SCREEN-INCIDENT-WORKSPACE | D00745; D00746; D-USR-2026-11-16-7 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-INCIDENT-WORKSPACE-REQ-R-001"></a> `SCR-INCIDENT-WORKSPACE-REQ-R-001` | 감지된 사건에서 근거·조치·승인·복구를 차례로 연다 → 동일 workspace.id의 감사와 관측 결과로 각 단계가 표시된다 → 후보 선택이나 증상 완화만으로 서비스 복구이면 실패 | unit은 chosen·phase로 단계를 파생하고 choose는 승인 시각만 저장한다(`apps/wake/pages/incident-detail.js:139`, `apps/wake/desktop/incident-hub.cjs:317`). | 승인에서 실제 배포 결과 수집으로 이어지는 단계가 없다. | 고정 없음 → TASK-SCREEN-INCIDENT-WORKSPACE | D00092; D00738; D00742 |
| <a id="SCR-INCIDENT-WORKSPACE-REQ-R-051"></a> `SCR-INCIDENT-WORKSPACE-REQ-R-051` | workspace 응답 한 개로 사건을 연다 → scope·impact·timeline·chain·options·verify·audit가 같은 incident ID에 속한다 → 다른 사건 응답의 구역을 혼합하면 실패 | data.get('incident')는 incident.workspace를 호출하고 화면은 inc 하나를 사용한다(`apps/wake/data/index.js:154`, `apps/wake/pages/incident-detail.js:29`). | 없음(확인: apps/wake/data/index.js:154) | 고정 없음 → TASK-SCREEN-INCIDENT-WORKSPACE | D-USR-2026-11-16-7 |
| <a id="SCR-INCIDENT-WORKSPACE-FIELDS"></a> `SCR-INCIDENT-WORKSPACE-FIELDS` | impact.now/baseline/threshold/unit/from와 options/chosen을 공급한다 → V01 머리 값과 선택한 options[].title이 보인다 → actionCompare라는 응답 필드를 요구하거나 값이 비면 실패 | impactText와 chosen 함수가 impact 및 options/chosen을 직접 읽는다(`apps/wake/pages/incident-detail.js:40`, `apps/wake/pages/incident-detail.js:44`). | 없음(확인: apps/wake/pages/incident-detail.js:40) | 고정 없음 → TASK-SCREEN-INCIDENT-WORKSPACE | D-USR-2026-11-16-7 |
