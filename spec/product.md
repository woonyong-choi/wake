# Wake 제품 목적과 사용자 흐름

당번 SRE는 홈의 이상에서 같은 대상·시각의 리소스, Event, 로그, 인시던트, 조치, 복구 보고로 이어간다. 이 문서는 제품 목표와 흐름의 공통 계약이고, 각 흐름은 `flows/`, 개별 화면 열·값·배치는 `screens/`와 `components/`가 소유한다.

흐름: [클러스터 연결](flows/cluster-connection.md), [도구 연결](flows/tool-connection.md), [AI 연결·조사](flows/ai-connection.md), [에이전트 설치](flows/agent-installation.md), [조사와 왕복](flows/investigation.md), [인시던트 생애](flows/incident-lifecycle.md), [승인과 실행](flows/approval-execution.md), [Git 연결과 변경](flows/gitops-change.md), [보고서](flows/reports.md), [첫 실행과 설정](flows/onboarding-settings.md).

목표는 요구 동작이며 현재 구현의 한계를 목표로 삼지 않는다. `제안 OPEN-PF-*`는 승인 전 목표다. `차이`의 TASK-A1/A3는 이 영역의 남은 작업 식별자이며 통합 작업 대장 등록이나 구현 완료를 뜻하지 않는다.

현재는 2026-11-17 작업 트리의 소스 대조 결과다. 시험 파일은 고정 위치이며 제품 시험·Electron·공급자·클러스터 검증의 통과를 뜻하지 않는다. 고정 장치는 적힌 시험 이름이 다루는 부분의 회귀 방지 수단이다. 현재 차이가 남은 항목은 그 시험의 존재만으로 목표 전체가 충족됐다고 판정하지 않는다. 과거 B1/T1/U-01/L1 보고는 당시 결함·계획이고 현재 합격/실패 판정을 대신하지 않는다.

출처의 D ID는 저장소 밖 소유자 결정 기록의 번호다. 현 코드가 과거 기록과 다르면 현 코드가 현재 상태의 근거다.

제안 질문·추천·대안·근거는 지정된 이관 작업 폴더의 `open-제품과-흐름.md`에 모은다. 추천안은 D-USR-2026-11-16-7로 목표에 채택한다. 목표 채택과 제품 구현 완료는 구분한다.

## 충돌과 범위별 우선순위

| 충돌 | 최종 적용 |
|---|---|
| Loki 터미널 D00029 → D00046 | Loki·Tempo는 읽기 HTTP API 화면, 일반 터미널은 현재 대상 |
| Secret 메타 허용 과거 문서 | 최신 D-01: [RULE-SECRET](rules.md#RULE-SECRET). Helm은 리소스 주석 기반 |
| 기본 로그 15분 D00095/D00452 → D00806 | → [RULE-RANGE](rules.md#RULE-RANGE). 소스당 한도·잘림 표시는 유지 |
| 오른쪽 검사기 D00242 → D00448 | 중앙 상세와 AI 칸은 독립. D01022는 칸 최종 폭을 즉시 배치 |
| 폭 애니메이션 D00513 → D01022 | 최종 폭 1회, 내용만 진입. D01021 자동 펼침은 처음 1회 |
| 보고서 체크박스 D00887/D00925 → D00943 | 보고서만 드래그 선택. D00930은 일반 리스트박스 전체선택/해제 요구이므로 폐기하지 않음(U00662:17217, U00663 원문) |
| 견본 시나리오 D00744 → D00973/D00975 | 앱 밖 설계 비교만 허용. 실제 Electron·클러스터 기능 검증 필수 |
| 관리형 설치 D00018/D00024 → 허브 결정 | 옛 이식 계획의 데스크톱 허브·wake-agent 적용 |
| 옛 이식 계획 AI 모델 없음 → 현재 코드 | ai-run.cjs Claude API와 구독 CLI(ai-cli.cjs) runner 존재(Ollama는 D-USR-2026-11-17-11로 삭제). 다른 API 완료로 확대하지 않는다 |
| settings·반경·정렬·상태 모양의 반복 지적 | design/screens/components 소유. 대상·왕복·7상태는 여기서 유지 |

| 규칙 접두사 | 소유 파일 |
|---|---|
| PRD | [product.md](product.md) |
| FLOW-AGT | [flows/agent-installation.md](flows/agent-installation.md) |
| FLOW-AI | [flows/ai-connection.md](flows/ai-connection.md) |
| FLOW-APR | [flows/approval-execution.md](flows/approval-execution.md) |
| FLOW-CLU | [flows/cluster-connection.md](flows/cluster-connection.md) |
| FLOW-GIT | [flows/gitops-change.md](flows/gitops-change.md) |
| FLOW-INC | [flows/incident-lifecycle.md](flows/incident-lifecycle.md) |
| FLOW-INV | [flows/investigation.md](flows/investigation.md) |
| FLOW-ONB | [flows/onboarding-settings.md](flows/onboarding-settings.md) |
| FLOW-SET | [flows/onboarding-settings.md](flows/onboarding-settings.md) |
| FLOW-REP | [flows/reports.md](flows/reports.md) |
| FLOW-TOOL | [flows/tool-connection.md](flows/tool-connection.md) |
| FLOW-LIST | [flows/investigation.md](flows/investigation.md) |

## 공통 계약 적용

모든 흐름에 PRD-003(권한), PRD-005(왕복), PRD-006(7상태·대상·시각), PRD-009(원본 대조), PRD-010(빈 값·톤·툴팁·폭·정렬)을 적용한다. 각 흐름은 고유 입력·전이·결손·검사만 덧붙인다. 보고서의 정적 표는 FLOW-REP-003/005의 문서 순서를 따르며 탐색 표의 문제 우선 정렬을 적용하지 않는다.

<a id="PRD-001"></a>

## PRD-001: 제품과 사용자

- 목표: 입력: Kubernetes Event.reason=BackOff, Pod UID=p1, incident.workspace.id=i1인 사건을 홈에서 열고 승인·확인 단계로 이동한다 → 기대: Wake는 당번 SRE가 기존 Kubernetes·Prometheus·Loki·Alertmanager·Argo CD의 실제 근거로 장애를 발견→조사→조치 제안→사람 승인→실행 추적→복구 확인하는 Electron 작업대다. 플랫폼 운영자·서비스 개발자·다음 당번도 같은 incident ID로 감지 시각·대상 UID·영향·원인·승인·조치·복구 관측 구간과 원본에 접근한다. 근거 출처나 수집 시각이 없으면 미확인이다. → 실패: incident ID가 단계마다 달라지거나 원본·collectedAt 없는 근거가 확인됨으로 보이면 실패
- 현재: `apps/wake/desktop/incident-hub.cjs:205`의 workspace가 사건 작업면을 만들고 `apps/wake/desktop/approvals.cjs:49`는 PR 결과를 pending 또는 github-unconnected로만 기록한다.
- 차이: 실제 PR 생성 결과와 복구 관찰을 연결하는 실행 기록이 없다. → TASK-A1-001
- 고정 장치: 고정 없음 → TASK-A1-001
- 출처: D00642 D00657 D00685 D00462 D00463 D00464 D00467 D00469 D00470 D00471 D00474 D00476 D00648 D00658 D00664 D00733 D00734 D00735 D00736 D00737 D00738 D00741 D00742 D00743 D00905; R-001,R-070.

## PRD-002: 제품이 줄이는 세 가지 작업

- 목표: 입력: 허브에 저장한 incident=i1, evidence=e1, conversation=c1과 감사 requester/model/transport/scope/result를 앱 재시작 뒤 검색한다 → 기대: 첫째 기존 도구와 사용자 요청에서 실제 근거를 모아 장애를 탐색하고 같은 대상·시각의 링크와 보고서로 공유한다. 둘째 설정한 보관 기간의 과거 장애·근거를 검색해 재발과 변경을 비교한다. 압축·인덱스로 장기 보관 비용을 낮춘다. 셋째 AI가 무엇을 어떤 권한으로 읽고 판단했는지 감사 기록으로 보여 주고 허용 범위를 시스템에서 강제한다. 세 목적은 인시던트·대화·근거 식별자로 이어져야 한다. → 실패: 과거 근거 대신 현재 값을 보이거나 로컬 전용 링크를 팀 공유 완료로 표시하면 실패
- 현재: `apps/wake/desktop/hub-store.cjs:36`의 createHubStore는 로컬 JSON/JSONL 저장소를 만들고 :42에서 같은 보관 cutoff를 사용한다.
- 차이: 원격 공유·압축 경로가 없다. 대화의 보관 정책·설정 연계는 H-001-F3의 격리 저장소 시험을 통과했으며 실제 설정 화면은 미검증이다. → TASK-A1-002
- 고정 장치: 고정 없음 → TASK-A1-002
- 출처: D00465 D00466 D00472 D00473 D00660 D00734 D00742 D00912; R-035,R-036,R-037,R-038,R-039,R-040,R-041,R-055,R-071.

## PRD-003: 읽기와 변경의 경계

- 목표: → [RULE-AI](rules.md#RULE-AI). 프롬프트·MCP·HTTP·터미널 우회로 승인이나 변경을 자동 실행하지 않는다. 감지는 규칙으로 수행하고 AI는 근거 해석을 보탠다. Secret은 메타데이터를 포함해 읽지 않는 최신 D-01을 적용한다. AI 권한은 read/ask 두 단계이며 무조건 실행은 없다. 승인·명령 제시·실제 실행·Git 병합·배포 성공·증상 복구를 각각 기록한다; 실패: secrets get/list/watch가 실행되거나 거절 뒤 실행 성공·복구가 표시되면 실패
- 현재: `apps/wake/desktop/hub-tools.cjs:56`의 TOOLS는 읽기·제안 도구를 열거하고 `apps/wake/desktop/approvals.cjs:43`의 decide는 상태만 저장한다.
- 차이: 승인 뒤 실제 변경 receipt를 남기는 실행기는 없다. 읽기·제안 경계 자체는 허브 도구 목록과 일치한다. → TASK-A1-003
- 고정 장치: `apps/wake/desktop/hub.test.cjs`, 시험 `the tool layer has the 18 tools, each with a JSON schema, and only propose_action is not read-only`
- 출처: D00466 D00473 D00648 D00738 D00869; 1차 D-01; R-011,R-012,R-052,R-053,R-054.

## PRD-004: 연결 수준과 제품 범위

- 목표: 입력: data 서비스가 없는 상태, kube 연결만 있는 상태, 도구 연결 상태, agent Lease가 있는 상태를 차례로 연다 → 기대: 노트북만 있으면 연결 관리·제품 설정, 클러스터 연결 후 Kubernetes 읽기, 관측 도구 연결 후 해당 지표·로그·알림·GitOps, wake-agent 설치 후 실제 watch/cache/heartbeat 정보를 추가한다. 연결 단계가 올라가도 과거 자료가 생기지 않는다. 출처 유무·권한·보관 범위를 명시한다. 기본 데스크톱과 자체 설치 에이전트는 무료, 추가 권한·서비스용 백엔드 구독은 미래 제품 경계이며 현재 결제·팀 서비스 구현으로 주장하지 않는다. → 실패: 미연결 도구를 정상·비용 0으로 보이거나 직접 API 읽기를 agent 수집으로 표시하면 실패
- 현재: `apps/wake/data/index.js:129`의 UNCONNECTED가 Git 계정 등 빠진 출처를 명시하고 `apps/wake/desktop/agent-heartbeat.cjs:24`의 nodeOf가 Lease를 상태로 바꾼다.
- 차이: Git 계정이 연결 가능한 출처가 아니라 고정 미연결 키에 남아 있다. → TASK-A1-004
- 고정 장치: `apps/wake/data/index.test.mjs`, 시험 `keys without a source reject as not connected and name the missing source`
- 출처: D00649 D00740 D00972 D00974 D00975 D00987; R-006,R-016,R-056.

## PRD-005: 판단 흐름의 출입점

- 목표: 입력: namespace=n1·기간 1h·검색 pod-a를 지정하고 metadata.uid=p1인 행에서 상세·Event·로그를 열었다가 뒤로 간다 → 기대: 홈의 이상·검색·리소스·Event·Alert·GitOps·인시던트에서 같은 리소스 상세로 진입한다. 종류별 상세는 하나이며 탭·초기 초점·필터만 바꾼다. 상세의 하위 상세를 쌓지 않는다. AI는 오른쪽, 보고서·기능 화면은 본문, 상세는 승인된 상세 칸에 연다. 뒤로/닫기는 namespace·기간·검색·스크롤·선택을 복원한다. 홈 도구/에이전트 칩은 본문 상태 화면, 연결 관리는 설정이다. → 실패: UID·기간·검색이 바뀌거나 AI가 본문에 열리거나 추가 상세 계층이 생기면 실패
- 현재: `apps/wake/pages/resource-list.js:150`은 wake.list.open으로 상세를 열고 :180의 onDetail은 닫기 뒤 opener 초점을 복원한다.
- 차이: 검색 결과는 `find.js:24`에서 UID를 버려 이름이 같은 재생성 객체까지 동일 대상 왕복을 보장하지 못한다. → TASK-A1-005
- 고정 장치: 고정 없음 → TASK-A1-005
- 출처: D00063 D00076 D00316 D00317 D00651 D00066 D00175 D00195 D00248 D00445 D00448 D00449 D00452 D00456 D00507 D00508 D00607 D00864 D00866 D00882 D00883 D00990 D00992 D01000; R-026,R-041,R-059.

## PRD-006: 모든 흐름의 일곱 상태와 증거

- 목표: → [RULE-STATE](rules.md#RULE-STATE).
- 현재: `apps/wake/pages/cluster-search.js:22`의 Promise.allSettled 결과에서 fulfilled만 index.rows에 저장한다.
- 차이: 검색의 실패 출처가 결과 모델에서 빠져 성공 0건과 전체 읽기 실패가 구분되지 않는다. → TASK-A1-006
- 고정 장치: `apps/wake/pages/resource-pages.test.mjs`, 시험 `list: concurrent retry ignores older success after newer denial`
- 출처: D00051 D00052 D00113 D00167 D00189 D00978 D00009 D00017 D00114 D00115 D00455 D00456 D00457 D00478 D00485 D00495 D00973 D00974 D00975 D00987 D00999 D01000 D01027 D01032 D01037; R-004,R-007,R-008,R-017,R-018,R-019,R-020,R-021,R-022,R-023,R-065,R-073.

<a id="PRD-007"></a>

## PRD-007: 완료·정보·검수의 우선순위

- 목표: 입력: SRE가 인시던트의 영향·원인·조치·복구 질문을 열고 미연결 서비스의 결과도 확인한다 → 기대: SRE 질문에 답할 수 있는 정보와 실제 조작을 완성도 기준으로 삼는다. 백엔드가 없다는 이유로 요구를 삭제하지 않고 부분/안 됨과 작업을 남긴다. 실제 원본·앱·독립 검토 충족 전 판매 가능·완료·사용자 승인으로 부르지 않는다. 시뮬레이션은 앱 밖 설계 비교이며 실제 기능 성공 근거가 아니다. → 실패: 미구현 단계를 완료로 보이거나 sim 자료를 실제 클러스터 근거로 인용하면 실패
- 현재: `apps/wake/data/index.js:140`의 unconnected는 없는 출처를 unconfigured 오류로 반환한다.
- 차이: 검색은 읽기 실패를 버리고 점검 보고서는 Node·Pod 실패를 빈 배열로 바꿔 미구현·실패 정보가 끝까지 보존되지 않는다. → TASK-A1-007
- 고정 장치: 고정 없음 → TASK-A1-007
- 출처: D00062 D00254 D00962 D00007 D00183 D00405 D00407 D00409 D00421 D00432 D00436 D00457 D00459 D00467 D00474 D00480 D00483 D00485 D00489 D00499 D00500 D00733 D00734 D00735 D00736 D00743 D00744 D00747 D00774 D00785 D00786 D00905 D00917 D00959 D00960 D00967 D00973 D01037; R-003,R-004,R-007,R-008.

## PRD-008: 소유 범위와 출처 해석

- 목표: 입력: 같은 규칙에 과거 제안과 최신 사용자 결정이 함께 있고 화면 열 정의가 중복된 문서를 읽는다 → 기대: 제품·흐름 규칙을 구체적인 목표와 검사로 유지하고 화면 열·시각 수치는 해당 screens/components 규칙에 연결한다. 최신 직접 선택은 같은 범위의 과거 제안보다 우선한다. 질문·붙여넣은 보고는 승인·구현 증거가 아니다. 중복 문서는 규칙 이관과 검증 뒤에 삭제한다. → 실패: 과거 제안이 최신 결정의 목표를 덮거나 원문 질문을 구현 완료로 분류하면 실패
- 현재: `spec/product.md:48`의 공통 계약이 권한·왕복·상태·표시 규칙의 소유 위치를 연결한다.
- 차이: 없음(확인: spec/product.md:48)
- 고정 장치: 고정 없음 → TASK-PRD-008
- 출처: D00468 D00475 D00647 D00744 D00747 D01046 D01047 D01048 D01049 D01050 D01051 D01052; R-069,R-072,R-073.

## PRD-009: 흐름별 원본 비교와 검증 완료 조건

- 목표: 입력: 동일 UID·query·timestamp·step·절대 기간의 원본 응답과 화면 값·로그 해시를 비교한다 → 기대: 각 흐름은 값·대상·시각·실패·왕복을 원본과 대조한다. 개수/UID/문자열/상태/승인 결정/revision/hash는 차이 0, 로그는 동일 namespace/Pod UID/container/window의 나노초 시각+원문 해시 집합 100% 일치다. (기본값 채택, 번복 가능) OPEN-PF-022: Prometheus 같은 query/timestamp/step의 원시값 차이는 max(1e-9, abs(raw)*1e-6) 이하, 화면 반올림 차이는 표시 최소 단위의 절반 이하다. 수집 시각 차이는 실제 scrape/evaluation/poll 주기 이내이며 주기를 모르면 미판정이다. 검수 화면은 Electron 다크·라이트 각각 1280·1440·1680×900이며 페이지·탭·펼친 구역의 끝까지 확인한다. innerText·geometry·window bounds와 원본 query·UID·절대 window를 함께 비교한다. 정적 화면 변화는 같은 환경에서 픽셀 0이고 승인된 모양 변경만 결정·전후 그림으로 예외를 기록한다. → 실패: UID·문자열·해시가 다르거나 수치 오차 한도를 넘거나 출처 주기를 모르는 값을 합격 처리하면 실패
- 현재: `apps/wake/desktop/incident-hub.cjs:108`의 hashOf와 :110의 cite가 근거 identity·스냅샷을 저장한다.
- 차이: collect의 지표는 r1로 반올림해 저장하므로 화면과 별도로 원시 수치 오차를 대조할 원본 값이 빠진다. → TASK-A1-008
- 고정 장치: 고정 없음 → TASK-A1-008
- 출처: D-USR-2026-11-16-7; D00009 D00114 D00115 D00455 D00456 D00457 D00785 D00786 D00974 D00975; 1차,44-55; R-007,R-008,R-065,R-073; 1차 초안의 검수 조건.

## PRD-010: 공통 표시와 목록 계약

- 목표: 입력: 리소스 응답 0건, 긴 metadata.name, 결손 숫자, 같은 수치의 서로 다른 UID를 표에 넣고 숫자 오름차순을 선택한 뒤 폭을 줄인다 → 기대: 빈 값은 0·정상으로 채우지 않고 PRD-006의 출처 상태와 미확인 이유를 표시한다. 상태 톤은 정상·진행·경고/오류·중립의 공통 status로 표현하고 색만으로 구분하지 않는다. 긴 값은 행을 늘리지 않으며 호버와 키보드로 전체 값을 확인한다. 목록 검색은 하나로 결과·개수·타임라인에 함께 적용한다. 열 정렬은 표시 문자열 대신 원본 숫자·절대 시각을 사용한다. 좁은 폭에서는 해당 표의 숨김 순위에 따라 보조 열을 숨기고 대상·핵심 판단·상세 진입을 유지한다. 성공 0건인 리소스 표는 헤더와 빈 행 하나, 표 밖의 빈 이벤트·로그는 공통 빈 상태를 유지한다. 페이지 이동 전에 필터·정렬을 전체 결과에 적용한다. OPEN-PF-021: 결손값은 정렬 방향과 무관하게 끝에 두고 동점은 UID/고유 ID로 안정화한다. → 실패: 0건에서 머리가 사라지거나 결손이 0으로 보이거나 표시 문자열 기준 정렬로 10이 2보다 앞서면 실패
- 현재: `apps/wake/pages/resource-list.js:145`는 total=0이면 dataTable 대신 emptyState만 반환한다.
- 차이: 리소스 0건에서 표 머리가 사라진다. :143의 목록은 정렬 없이 페이지를 자른다. → TASK-A1-009
- 고정 장치: 고정 없음 → TASK-A1-009
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00074 D00088 D00447 D00450 D00874 D01051; 옛 화면 규칙 표·상태·폭 규칙.

<a id="PRD-011"></a>

## PRD-011 제품 운영의 신뢰

- 목표: 계정·공개 범위·가격 정책을 바꾼다 → 계정 강제, 갑작스러운 비공개 전환, 갑작스러운 가격 인상을 하지 않는다 → 이 조건을 어기는 운영 변경이면 실패.
- 현재: 옛 제품 제약의 운영 제약을 정본에 이관했다. 정책 준수의 현재 실행 근거는 없다.
- 차이: 운영 변경마다 별도 검토가 필요하며 UI·코드 시험으로 준수 여부를 확정하지 않는다.
- 고정 장치: 자동 고정 없음. 운영 변경 시 C-SOURCE에 따라 사용자 결정과 조건을 대조한다.
- 출처: 옛 제품 제약.

<a id="PRD-012"></a>

## PRD-012 직접 구성과의 사용성 비교

- 목표: 같은 조사 과제를 직접 구성한 모델·MCP와 Wake에서 수행한다 → 원인 추정 성능만이 아니라 설치·자격 설정·자료 수집·확인·기록·공유·보안의 사람 작업 단계와 시간을 비교한다. 로컬 모델을 포함해 모델 선택을 제한하지 않고 규칙 기반 동작 위에서 AI가 판단을 돕는다 → 근거 없이 시간 절감이나 현재 없는 팀 기능을 소개하면 실패.
- 현재: 옛 제품 제약의 비교 의도와 과거 관측을 이관했다. 당시 원인 조사 31초, 첫 답까지 17분, 서버·자격 각 4종과 설정 약 140줄은 단일 구성의 기록이다. 비숙련 1~3시간은 추정이었다.
- 차이: 위 수치는 현재 Wake의 측정이나 우월성 증거가 아니다. 팀 기능은 PRD-001의 범위와 현재 연결·내보내기 구현을 따르며 새 계정·관리자·서버 기능을 승인하지 않는다.
- 고정 장치: 자동 고정 없음. 동일 과제의 단계·시간·환경을 Q-027에 따라 측정하고 C-004의 과장 금지와 대조한다.
- 출처: 옛 제품 제약.
