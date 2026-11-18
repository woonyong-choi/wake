# 이상 발견에서 근거 조사까지

PRD-005의 단일 상세·왕복 계약을 적용한다. 아래 흐름의 대상 키는 cluster/context·namespace·kind·name·UID, 시각은 absolute from/to·timezone·source·collectedAt다. 이름만 같은 새 객체를 이전 사건으로 취급하지 않는다.

공통: [권한·대상·7상태·왕복·원본 대조·표시](../product.md#공통-계약-적용). 현재는 소스 확인, 시험·캡처·실제 연결 합격은 별도다.

## FLOW-INV-001: 홈과 목록에서 문제를 고르기

- 목표: 입력: cluster summary의 Warning과 문제 Pod를 누르고 namespace 흐름의 요약 노드를 선택한다 → 기대: 홈은 핵심 수치·문제 Pod·최근 Warning·지표·GitOps·인시던트·연결 도구를 함께 보여 주며 각각 실제 목록/상세로 간다. OpenCost는 도구에 포함하고 검증된 값만 비용으로 표시한다. Node/namespace/workload/Pod 흐름의 요약 노드는 정확히 그 집합으로 거른 목록을 연다. 상세 한 곳에 정보가 모여야 하며 요약→하위 그래프 상세→다른 상세를 반복하지 않는다. → 실패: 요약 노드가 다른 집합을 열거나 UID 없는 집계를 존재하는 단일 객체 상세로 열면 실패
- 현재: `apps/wake/pages/resource-list.js:150`은 필터된 shown을 표로 만들고 wake.list.open을 행 동작에 둔다.
- 차이: 0건에서 표 머리가 없어지고 검색의 UID 누락 때문에 홈·검색·상세의 동일 대상 연결이 끊긴다. → TASK-A3-INV-001
- 고정 장치: `apps/wake/pages/resource-pages.test.mjs`, 시험 `normal: all declared kinds and tabs render using the fixture cluster`
- 출처: D00073 D00079 D00081 D00082 D00083 D00084 D00085 D00086 D00087 D00088 D00276 D00283 D00291 D00805 D00820 D00919 D00066 D00126 D00175 D00180 D00183 D00195 D00196 D00248 D00252 D00253 D00449 D00450 D00491 D00492 D00703 D00720 D00772 D00779 D00835 D00848 D00864 D00866 D00882 D00883; R-042,R-044,R-045,R-059.

## FLOW-INV-002: CrashLoop 조사와 Event→Logs

- 목표: 입력: metadata.uid=p1의 containerStatuses.restartCount=5, lastState.terminated.finishedAt=3분 전인 Pod에서 previous 로그와 Event 시각 12:00Z의 로그를 연다 → 기대: 문제 Pod를 고르면 restartCount·현재 waiting/terminated·lastState 종료사유/exitCode/시각·컨테이너별 상태를 먼저 판단한다. 해당 컨테이너의 현재/previous 로그를 구별한다. Event→Logs는 involvedObject UID·container·발생시각을 넘겨 전후 5분을 절대시각·UTC 표시로 연다. Event 목록·로그·인시던트·배포 기록이 같은 대상/구간을 유지한다. 없는 container/로그/과거UID를 다른 Pod의 현재 로그로 대체하지 않는다. → 실패: Restarts에 상태명이 섞이거나 다른 UID·컨테이너 로그가 나오거나 Event 로그 구간이 11:55Z~12:05Z가 아니면 실패
- 현재: `apps/wake/pages/logs.js:42`는 logs 요청에 uid·container·previous·window를 넘긴다.
- 차이: 로그 읽기 인수는 보존하지만 :22의 Pod 선택 키는 namespace/name이어서 동명이 새 UID 선택을 별도로 구분하지 않는다. → TASK-A3-INV-002
- 고정 장치: `apps/wake/pages/resource-pages.test.mjs`, 시험 `detail: the container table counts restarts the kubectl way, warning tone on the figure only, the last state in its tip`
- 출처: D00081 D00093 D00094 D00175 D00407 D00450 D00452 D00456 D00507 D00508; R-026,R-044,R-048.

## FLOW-INV-003: 기간·로그 한도·따라가기

- 목표: → [RULE-RANGE](../rules.md#RULE-RANGE). 과거 15분 기본 요구는 최신 공통 기간으로 대체하지만 최초 100줄·최대 1000줄/2MiB 및 소스 한도는 유지한다. Loki는 나노초 시각+동일시각 tie를 보존해 더 읽을 때 중복·유실 없이 이어간다. Kubernetes 로그는 tailLines/sinceTime/limitBytes로 제한하며 서버 페이지가 없는 것을 페이지처럼 가장하지 않는다. 500/1000줄 재조회는 재조회다; [RULE-RETENTION](../rules.md#RULE-RETENTION). 일부 창만 읽고 7일 전체를 읽었다고 표시하지 않는다. 따라가기는 명시 선택이고 읽던 scroll을 뺏지 않는다; 실패: 로그가 중복·유실되거나 일부 24시간 창만 읽고 7일 전체 성공으로 보이거나 읽던 스크롤을 빼앗으면 실패
- 현재: `apps/wake/pages/logs.js:42`는 선택한 from/to 구간 하나를 data.get에 넘기고 Loki tail=100을 사용한다.
- 차이: 7일을 24시간 이하 창으로 분할하는 호출과 동일 나노초 tie cursor가 이 페이지에 없다. → TASK-A3-INV-003
- 고정 장치: 고정 없음 → TASK-A3-INV-003
- 출처: D-USR-2026-11-16-7; D00064 D00095 D00096 D00097 D00098 D00099 D00369 D00370 D00373 D00384 D00388 D00452 D00508 D00806 D00830 D00879 D00880; R-022,R-023,R-048,R-071.

## FLOW-INV-004: 검색·필터·팔레트

- 목표: 입력: 검색어 pod-a와 namespace=n1을 입력하고 FIND_KINDS 중 한 출처는 403, 다른 출처는 성공으로 응답한다 → 기대: cluster 검색은 등록된 종류의 resource뿐 아니라 Application/Helm 등 지원 출처를 검색하고 어떤 출처를 조회/누락했는지 표시한다. namespace/kind/검색어는 동일 결과·타임라인·개수에 적용한다. Event는 reason/message와 Object의 전체 경로도 검색한다. 타임라인의 해당하지 않는 점/막대는 비활성 표시로 일관되게 바꾼다. 0건은 성공한 검색만,403이나 일부 실패는 성공 결과를 보존한 부분상태다. IME 입력 도중 이동하지 않는다. 팔레트·검색·표 클릭은 같은 상세로 간다. → 실패: 실패 출처가 사라지거나 성공 결과를 모두 지우거나 IME 조합 도중 상세로 이동하면 실패
- 현재: `apps/wake/data/find.js:8`은 9종만 검색하며 `apps/wake/pages/cluster-search.js:23`은 성공 출처만 저장한다.
- 차이: Application·Helm·CronJob·HPA·PVC가 빠지고 실패 출처 표시도 사라진다. → TASK-A3-INV-004
- 고정 장치: 고정 없음 → TASK-A3-INV-004
- 출처: D00074 D00322 D00066 D00447 D00825 D00864 D00866 D00874 D00921 D00922 D00995; R-026,R-044,R-046,R-059; 1차 ).

## FLOW-INV-005: 비용과 과거 자료로 이어가기

- 목표: 입력: OpenCost allocation이 같은 USD·7일 구간의 total/idle/workload를 반환하고 일부 날짜 coverage가 없는 상태로 비용을 연다 → 기대: OpenCost의 실제 allocation으로 같은 기간·통화·coverage의 합계/idle/workload를 보여 준다; [RULE-RETENTION](../rules.md#RULE-RETENTION). 비용은 클라우드 청구서가 아니라 출처가 계산한 allocation이다. UID 없는 집계는 이름집계이고 현재 리소스와 같다고 확정하지 않는다. 미설치·권한·보관부족·부분자료를 0원으로 만들지 않는다. 과거 사건에서 현재 비용을 과거값처럼 사용하지 않는다; 실패: 미수집 날짜를 0원으로 채우거나 통화·기간이 다른 합계를 비교하거나 이름 집계를 UID 확정 객체로 열면 실패
- 현재: `apps/wake/pages/costs.js:109`의 drillAddress는 data.start/end를 다음 allocation 주소에 보존한다.
- 차이: 비용 대상의 UID가 없는 allocation과 같은 이름의 현 리소스를 구분하는 식별자는 drillAddress에 없다. → TASK-A3-INV-005
- 고정 장치: 고정 없음 → TASK-A3-INV-005
- 출처: D00107 D00108 D00109 D00110 D00111 D00115 D00180 D00449 D00465 D00472; R-029,R-032,R-059,R-071; 1차 ).

## FLOW-INV-006: 닫기·초점·전환

- 목표: 입력: 목록을 스크롤한 뒤 리소스 상세를 열고 사용자가 카드를 접은 상태에서 자료 갱신·Escape·뒤로를 실행한다 → 기대: 상세는 중앙 왼쪽 경계에서 열리고 AI를 임의 열거나 닫지 않는다. 최종 폭을 누른 순간 배치하고 내용만 진입한다. 링크가 가리킨 섹션의 자동 펼침/스크롤은 최초 1회만, 이후 사용자 선택·읽는 위치를 유지한다. 보는 중 임계값을 넘어도 카드 재배치 대신 머리 강조만 한다. 닫기/뒤로는 출발 목록 필터/scroll/selection을 복원한다. → 실패: 자료 갱신이 카드를 다시 펴거나 닫기 후 목록 위치가 바뀌거나 AI 열림 상태를 임의 변경하면 실패
- 현재: `apps/wake/pages/resource-list.js:180`의 onDetail은 닫기 뒤 opener로 초점을 돌리고 activeKey를 비운다.
- 차이: 목록 activeKey가 닫기 때 지워져 선택 행 보존 요구와 다르다. → TASK-A3-INV-006
- 고정 장치: 고정 없음 → TASK-A3-INV-006
- 출처: D00226 D00228 D00234 D00240 D00241 D00249 D00230 D00242 D00243 D00248 D00376 D00419 D00425 D00448 D00477 D00478 D00513 D00866 D00882 D00883 D00910 D01021 D01022; R-026.

## FLOW-INV-007: 이벤트 발생과 처리 기록의 구별

- 목표: 입력: 같은 Event.metadata.uid가 count=2에서 3으로 갱신되고 새 Event가 도착하는 동안 목록을 읽는다 → 기대: 이벤트 목록은 시간·namespace·리소스·심각도로 조회하며 기본 50행, 홈과 리소스 상세의 경고 탐색은 최근 1시간에서 시작한다. 발생 기록의 최초 관측·최종 반복·Event.count와 Wake의 수집·기록·연관 분석·인시던트 연결을 구별한다. 처리 단계는 실제 시각과 출처가 있는 기록만 보인다. 연관 없음이라는 성공 결과와 처리 기록을 읽지 못한 상태는 다르다. 새 이벤트는 새 이벤트 수로 알리고 읽던 행을 자동으로 밀지 않는다. 수집·저장·연관 분석·인시던트 연결은 현 허브가 영속 기록으로 제공하고, 각 단계의 실제 실행 시각·결과·관련 incident ID를 조회할 수 있어야 한다. 폐기한 관리 서비스 API를 되살리거나 가짜 처리 타임라인을 채우지 않는다. 구현 전에는 해당 단계가 미지원임을 표시하며, 이는 목표 달성으로 세지 않는다. → 실패: 행 수를 발생 횟수로 표시하거나 없는 처리 시각을 채우거나 새 Event가 선택·스크롤을 밀면 실패
- 현재: `apps/wake/pages/events-view.js:13`의 PER는 30이며 `apps/wake/data/incident-model.js:134`의 eventSummary가 Event UID·count를 처리한다.
- 차이: 전체 목록 기본 50행 대신 30행이다. 처리 단계별 영속 시각은 Event 요약 모델에 없다. → TASK-A3-INV-007
- 고정 장치: `apps/wake/data/incident-model.test.mjs`, 시험 `eventSummary: one row per object and reason, every count from the same rows (N8)`
- 출처: D00064 D00087 D00089 D00090 D00091 D00092 D00093 D00452; R-047,R-050,R-071.

목록 공통: 열별 값·형식·톤·툴팁·숨김 순위는 각 화면과 `components/tables/`가 소유하며 공통 표시·왕복은 PRD-010과 PRD-005를 적용한다. 아래 목록 행에는 고유 입력·정렬·검색·이동만 적는다.

## FLOW-LIST-001: 리소스 목록

- 목표: → [RULE-SORT](../rules.md#RULE-SORT). 행을 누르면 같은 UID의 공통 리소스 상세로 이동한다. namespace·kind·상태·문제 여부, Pod는 Node·Owner도 거르고 Name을 검색한다. SRE는 이 표로 지금 우선 조사할 대상과 그 이유를 판단한다; 실패: 기본 첫 행이 p1이 아니거나 동점 namespace/name/UID 순서가 다르거나 상세 UID가 달라지면 실패
- 현재: `apps/wake/pages/resource-list.js:143`은 필터한 입력 순서로 페이지를 나누며 :150에 sortAction이 없다.
- 차이: API 순서가 기본 순서다. danger→warn→namespace→name→UID 정렬이 없다. → TASK-A3-LIST-001
- 고정 장치: 고정 없음 → TASK-A3-LIST-001
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00074 D00291 D00447

## FLOW-LIST-002: 이벤트 목록·Reason 묶음

- 목표: → [RULE-SORT](../rules.md#RULE-SORT). 개별 이력의 동점은 상태로 재정렬하지 않고 Reason 집계만 Warning을 우선한다. 행을 누르면 목록은 Event 상세, Reason 행은 같은 Reason 필터의 목록으로 이동한다. namespace·Type·Reason·절대 기간으로 거르고 Reason·Message·namespace/kind/name 전체 경로를 검색; 표·개수·타임라인에 같은 predicate 적용한다. SRE는 이 표로 새로운 경고인지 반복 폭주인지와 발생 대상을 판단한다; 실패: 개별 목록의 동점에 Warning을 끼워 넣거나 Reason count 합이 원본과 다르면 실패
- 현재: `apps/wake/pages/events-view.js:76`의 Reason 목록은 Warning·count까지만 정렬하고 `incident-model.js:154`는 last 내림차순만 사용한다.
- 차이: 동일 시각·같은 count에 불변 키 비교가 없으며 개별 Event가 대상+Reason으로 묶인다. → TASK-A3-LIST-002
- 고정 장치: 고정 없음 → TASK-A3-LIST-002
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00087 D00452 D00874

## FLOW-LIST-003: 인시던트 목록

- 목표: → [RULE-SORT](../rules.md#RULE-SORT). 행을 누르면 같은 incident ID의 범위·원인·조치·확인 작업면으로 이동한다. cluster·namespace·단계·심각도·감지 기간으로 거르고 번호·제목·대상·연결 Alert 이름을 검색한다. SRE는 이 표로 현재 담당해야 할 사건과 완화·복구 여부를 판단한다. → 실패: 해결된 i2가 i1보다 앞에 오거나 행 클릭이 다른 incident ID를 열면 실패
- 현재: `apps/wake/desktop/incident-hub.cjs:98`의 rows는 detectedAt 내림차순만 정렬한다.
- 차이: 미해결 우선·심각도 우선·ID 동점 정렬과 namespace 필터가 없다. → TASK-A3-LIST-003
- 고정 장치: 고정 없음 → TASK-A3-LIST-003
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00092 D00779 D00952 D00955

## FLOW-LIST-004: GitOps 대상

- 목표: → [RULE-SORT](../rules.md#RULE-SORT). 행을 누르면 같은 공급자·대상·revision의 GitOps 상세로 이동한다. namespace·공급자·Sync·Health·문제 여부·기간으로 거르고 이름·repo·manifest path를 검색한다. SRE는 이 표로 Git과 실제 상태의 차이, 건강 여부, 멈춘 단계를 판단한다; 
- 현재: `apps/wake/data/gitops.js:134`의 appRows는 appBad 뒤 name.localeCompare로 정렬한다.
- 차이: danger와 warn을 분리하지 않고 namespace·UID 동점 비교도 하지 않는다. → TASK-A3-LIST-004
- 고정 장치: 고정 없음 → TASK-A3-LIST-004
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00453 D00690 D00691

## FLOW-LIST-005: 클러스터 검색 결과

- 목표: → [RULE-SORT](../rules.md#RULE-SORT). 행을 누르면 목록·팔레트와 같은 종류별 상세로 이동한다. namespace·kind를 거르고 이름·namespace/kind/name 경로를 검색; 읽지 못한 출처도 결과 옆에 유지한다. SRE는 이 표로 어느 클러스터 객체를 조사할지와 검색이 빠진 출처를 판단한다; 실패: 포함 일치가 정확 일치보다 앞서거나 UID가 검색 결과에서 사라지면 실패
- 현재: `apps/wake/data/find.js:24`는 결과에서 UID를 빼며 :26은 일치 등급·문제 여부·이름만 비교한다.
- 차이: 같은 이름의 kind·namespace·UID 동점 순서와 danger/warn 구분이 없다. → TASK-A3-LIST-005
- 고정 장치: `apps/wake/data/find.test.mjs`, 시험 `리소스: 같은 이름 먼저, 같은 순위면 문제 있는 것 먼저, 종류 거르기`
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00864 D00866 D00921 D00922 D00995

## FLOW-LIST-006: 비용 allocation

- 목표: → [RULE-SORT](../rules.md#RULE-SORT). 행을 누르면 namespace→workload→Pod/Node의 같은 기간 allocation; UID 없는 값은 이름 집계로 유지한다. 기간·집계 수준·namespace/controllerKind/controller/pod/node로 거르고 해당 행 이름을 검색한다. SRE는 이 표로 총액·idle·상위 비용의 기여와 누락 범위를 판단한다. → 실패: null이 앞에 오거나 total=2가 10보다 앞서거나 클릭 후 절대 기간이 바뀌면 실패
- 현재: `apps/wake/pages/costs.js:122`의 sort는 원시 수치·결손 마지막·ID 동점을 적용한다.
- 차이: ID 동점은 localeCompare라 Unicode 코드포인트 순서와 다를 수 있다. → TASK-A3-LIST-006
- 고정 장치: 고정 없음 → TASK-A3-LIST-006
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00107 D00108 D00109 D00110 D00111 D00115

## FLOW-LIST-007: AI 작업 기록

- 목표: → [RULE-SORT](../rules.md#RULE-SORT). 행을 누르면 같은 감사 ID의 요청·권한·모델·도구·결과 상세로 이동한다. 기간·요청자·transport·성공/실패·incident로 거르고 incident/summary/requester/client/tool/target/executor/model을 검색한다. SRE는 이 표로 누가 어떤 권한으로 무엇을 읽거나 제안했고 실패했는지를 판단한다; 실패: 동점 ID 순서가 불안정하거나 실패 필터가 성공 행을 남기거나 상세 감사 ID가 다르면 실패
- 현재: `apps/wake/data/audit.js:32`의 auditIn은 at 내림차순이고 :35의 auditFilter는 requester/transport/q만 받는다.
- 차이: 동일 시각 ID 정렬과 성공/실패·incident 전용 필터가 없다. → TASK-A3-LIST-007
- 고정 장치: `apps/wake/data/audit.test.mjs`, 시험 `filters by requester group, transport, words and window`
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00466 D00473 D00912

## FLOW-LIST-008: 대화 보관함

- 목표: 입력: 보관 시각이 다른 conversation c1·c2와 같은 시각 c3를 보관함에 넣고 incident ID를 검색한다 → 기대: (기본값 채택, 번복 가능) OPEN-PF-020: 기본 정렬은 보관 시각 내림차순 → conversation ID 오름차순; 값 없음은 마지막. 행을 누르면 동일 conversation ID의 대화 재개로 이동한다. cluster·보관 기간으로 거르고 제목·마지막 답·incident ID를 검색한다. SRE는 이 표로 과거 조사와 근거를 찾아 다시 이어갈 수 있는지를 판단한다. → 실패: 원본 입력 순서가 보관 시각 순서를 대신하거나 incident 검색 결과가 누락되면 실패
- 현재: `apps/wake/data/chats.js:16`의 filterArchive는 제목·마지막 답·cluster·기간을 거르고 입력 순서를 유지한다.
- 차이: 보관 시각·conversation ID 정렬이 없고 incident ID를 검색하지 않는다. → TASK-A3-LIST-008
- 고정 장치: 고정 없음 → TASK-A3-LIST-008
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00445 D00734 D00883
