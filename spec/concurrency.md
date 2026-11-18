# 동시성·중복처리·정합성

## 공통 판정

현재는 2026-11-17 작업 트리의 정적 확인이다. 기존 시험의 위치와 현재 실행 결과를 구분한다. 이 문서의 소스 확인은 제품 시험·성능 측정·Electron 캡처의 통과를 뜻하지 않는다. 과거 보고의 통과를 현재 완료로 승계하지 않는다. 질문·붙여넣은 계획은 세부 정책이나 수치의 승인이 아니다. 목표는 D-USR-2026-11-16-1~7에 따라 확정 결정과 번복 가능한 기본값을 구분한다.

DEC·MSG·LAB·BACKEND 같은 약칭과 B1-7·U01-3·T1-4 같은 회차 표기는 저장소 밖 과거 기록(결정 기록, 시험 환경, 백엔드 최적화 요청, 단위별 검토 보고)을 가리킨다. 현재 목표는 이 문서의 규칙에서 읽는다. 동시성 문서의 PERF 약칭은 BACKEND와 같다.

작업 ID는 이 문서의 후속 작업이며 tasks.md 등록을 뜻하지 않는다. 이 파일의 표는 검사·설계·자료 필드 대응표이며 제품 화면의 열 정의가 아니다. 행 클릭·검색·숨김 순서는 화면 영역이 맡는다.

`desktop/`, `data/`, `pages/`, ai-hub.js와 앱 시험은 `apps/wake/` 아래이며 `kit/`는 저장소 루트다.

고정 장치의 시험명은 해당 시험이 다루는 부분을 뜻한다. 단위 시험 이름만으로 전체 native·외부 실행 계약의 합격을 주장하지 않는다. 고정이 없는 범위는 차이의 작업 ID에서 구현·검증한다.

공통 규칙은 CON-001(요청 identity), CON-002(응답 세대), CON-006(저장), CON-023(빈 값·7상태), CON-024(시각), CON-027(원본 연결), CON-029(검증)이다. 경로별 항목은 이 규칙을 함께 적용한다. 화면 톤·폭·툴팁은 [PERF-020](performance.md#perf-020)·[PERF-021](performance.md#perf-021)·[PERF-028](performance.md#perf-028)을 참조한다.

정책·키·수치는 D-USR-2026-11-16-7의 기본값을 채택한다. 복구·보관·작업 상한은 D-USR-2026-11-16-3/4/6이 우선하며

## 요청과 자원 수명

### CON-001

같은 읽기의 요청 합치기

- 목표: 동일 서비스·scope·UID·query·from/to로 네 소비자가 동시에 읽고 한 소비자만 취소한다 → 동일한 권한 범위·클러스터·대상 UID·조회 조건의 진행 중 읽기는 single-flight, 즉 원본 요청 하나와 이를 기다리는 여러 소비자로 처리한다. 화면·감지·AI가 같은 읽기 층을 사용한다. 키에는 서비스 이름, 출처, context, namespace, 종류, UID, query, 절대 from/to, step, 페이지 커서, 자격 세대를 포함한다. 서로 다른 권한·UID·시간 구간을 합치지 않는다. 성공·실패·취소 어느 경우든 진행 중 항목을 제거한다. 완료 캐시와 진행 중 요청 합치기를 구분한다. → 원본 요청이 둘 이상이거나 남은 소비자가 실패하거나 다른 UID 요청이 합쳐지면 실패
- 현재: `data/live.js:85`는 catalogReads, `data/index.js:168`은 3초 도구 찾기, `desktop/incident-hub.cjs:44`는 20초 감지를 공유한다. `desktop/reads/index.cjs:103`에는 공통 identity 키 맵이 없다.
- 차이: 공유 키가 catalog·도구 찾기·감지에 따로 있고 reads/index에는 전 서비스 identity 맵이 없다. TASK-D-01
- 고정 장치: `apps/wake/data/live.test.mjs` — `optional catalog reads coalesce in flight, terminate and never replace kube state or query metrics`
- 점검: 동일 입력의 동시 요청 4개는 원본 호출 1회, 결과 소비 4회다. UID·namespace·scope·구간·커서 각각을 바꾼 요청은 별도 호출이다. 실패 후 재시도는 원본을 다시 읽는다. 서로 다른 소비자 중 하나만 취소해도 나머지 소비자가 실패하지 않는다.
- 출처: D-USR-2026-11-16-7; D01024

### CON-002

늦은 응답의 적용 조건

- 목표: A 요청을 보류하고 B를 먼저 완료한 뒤 A 성공과 A 실패를 각각 도착시킨다 → 요청 시작 때 화면 세대, requestId, context, 대상 UID, namespace, 필터, 절대 시간 구간을 고정한다. 완료 시 현재 요청과 모두 같은 응답만 화면과 현재 캐시에 적용한다. A 요청 뒤 B 요청을 시작하고 B가 먼저 끝나면 A 성공과 A 실패 모두 B의 값·오류·로딩 상태를 덮지 않는다. 같은 대상의 새로고침은 이전 값과 실제 관측 시각을 유지할 수 있다. 다른 대상으로 이동한 경우 이전 값을 새 대상 값으로 표시하지 않는다. → A가 B의 값·오류·로딩·선택을 바꾸거나 pagehide 뒤 DOM을 갱신하면 실패
- 현재: `pages/resource-list.js:32`·logs.js:19·cluster-home.js:41은 sequence/disposed, resource-detail.js:168은 metrics identity를 검사한다. `desktop/reads/source-checks.cjs:61`은 같은 UID 요청의 선후를 비교하지 않는다.
- 차이: resource-list의 request guard와 달리 source-checks는 같은 UID의 요청 순서를 기록하지 않는다. TASK-D-02
- 고정 장치: 고정 없음 → TASK-D-02
- 점검: A 보류 → B 완료 → A 성공, A 실패의 두 순서를 각각 시험한다. B의 값·선택·오류·로딩이 바뀐 횟수는 0이다. pagehide 후 완료도 화면 갱신 0회다. 같은 이름의 새 UID로 전환한 경우 이전 UID의 값이 표시된 프레임은 0이다.
- 출처: D00114, D00457

### CON-003

취소의 끝단 전파

- 목표: HTTP·CLI 읽기 중 화면 이동·대상 변경·중지를 누르고 공유 터널의 다른 요청은 유지한다 → 화면 떠나기·대상 변경·클러스터 해제·사람의 중지에서 시작한 취소를 IPC 요청 소유자, 허브 읽기, HTTP 요청, 포트포워딩 요청, CLI까지 전달한다. 타이머와 구독도 해제한다. 결과를 무시하는 처리와 실제 자원 중단을 구분한다. 공유 터널을 한 요청의 timeout으로 닫아 다른 유효 요청을 끊지 않는다. 취소는 실패나 정상 완료로 바꾸지 않는다. → 취소 요청의 소켓·CLI·타이머가 남거나 공유 중인 다른 요청까지 끊기면 실패
- 현재: `desktop/k8s.cjs:131`·services.cjs:307·portforward.cjs:52는 일부 signal·owner 수명을 연결한다. `data/index.js:221`·`kit/core/service.js:10`에는 전체 취소 인자가 없고 ai-hub.js:48은 모델 호출을 중지하지 않는다. reads release는 타이머·상태만 정리한다.
- 차이: service(name,args)와 data.get에는 전 경로 취소 인자가 없고 AI 중지는 모델 호출까지 전달되지 않는다. TASK-D-03
- 고정 장치: 고정 없음 → TASK-D-03
- 점검: 보류 중 요청에서 화면 이동·클러스터 해제를 각각 실행한다. 해당 요청의 abort, 소켓/CLI 종료, 타이머·구독 해제, 늦은 UI 적용 0회를 측정한다. 같은 터널의 다른 요청은 정상 완료한다. 오류 표시와 완료 토스트를 중지로 잘못 내보내지 않는다.
- 출처: D-USR-2026-11-16-7; D00013, D00036

### CON-004

요청 상한과 대기열

- 목표: 화면 네 개와 MCP·HTTP가 같은 느린 출처에 동시에 요청한다 → 느린 원본 앞에는 backpressure, 즉 처리 가능한 수를 넘는 요청을 제한하는 장치를 둔다. 출처별 실행 4개·대기 32개·대기 30초, 캐시 256키 또는 32MiB, 스트림 256항목 또는 2MiB 중 먼저 닿는 상한을 적용한다. 오래된 화면 요청은 취소하고 같은 요청은 합친다. 승인·감사·대화 쓰기는 조용히 버리지 않는다. 재시도는 지수 백오프와 상한을 가진다. 원본 Retry-After가 있으면 이를 존중한다. 재시도는 최대 3회(1/2/4초), 연속 5실패면 30초 차단 후 1개 탐색 요청만 허용한다. → 출처별 실행 4·대기 32·대기 30초 또는 정한 byte 상한을 넘거나 감사·대화 쓰기를 버리면 실패
- 현재: `desktop/hub-server.cjs:81`은 batch Promise.all, mcp-stdio.cjs:16은 상한·fetch timeout 없는 직렬 대기, `ai-hub.js:50`은 무제한 이벤트 queue다.
- 차이: HTTP batch는 Promise.all로 무제한 시작하고 AI queue에는 길이·byte 상한이 없다. TASK-D-04
- 고정 장치: 고정 없음 → TASK-D-04
- 점검: 화면 4개 재조회와 MCP·HTTP 동시 호출 중 원본을 지연시킨다. 실행 수·대기 수·메모리·취소 수·timeout 수를 기록한다. 정한 상한을 한 번도 넘지 않고 해제 후 대기 항목이 0이 된다. 초기 기본값은 출처별 실행 4개·대기 32개·대기 30초, 캐시 256키 또는 32MiB, 스트림 256항목 또는 2MiB 중 먼저 도달한 한도다. 재시도는 최대 3회(1/2/4초), 연속 5실패면 30초 회로 차단 뒤 1개 탐색 요청을 허용한다. 원본 timeout은 연결 단계별로 정하며 큐 대기 30초와 혼동하지 않는다. 채택한 목표와 실제 측정 결과를 구분한다.
- 출처: D-USR-2026-11-16-7; D00013, D00036, D01024, D01050

### CON-005

주기 수집과 강제 재조회

- 목표: 30초 incident tick을 60초 보류하고 그 사이 force 재조회를 세 번 요청한다 → 같은 클러스터·작업의 이전 실행이 끝나지 않았으면 주기 실행을 추가하지 않는다. 사람이 요청한 다시 읽기도 같은 진행 중 실행을 합치거나 다음 한 번으로 예약한다. force는 완료 캐시를 무효화하는 의미로 쓰고 진행 중 잠금을 우회하지 않는다. 다른 실행의 finally가 새 실행의 running을 해제하지 않는다. → 같은 cluster 감지가 동시에 둘 실행되거나 옛 finally가 새 running을 해제하면 실패
- 현재: `desktop/reads/index.cjs:74`는 타이머 중복 등록만 막는다. `desktop/incident-hub.cjs:46`은 force가 공유를 우회하고 finally가 현재 running을 무조건 해제한다. hub.cjs:80의 감지·prune 타이머와 수명이 별도다.
- 차이: scan(force)는 진행 중 Promise 공유를 우회하고 옛 finally가 현재 running을 해제한다. TASK-D-05
- 고정 장치: 고정 없음 → TASK-D-05
- 점검: 알림 60초, 이벤트 300초, 인시던트 tick 30초를 가상 시계로 진행시키되 요청을 그 주기보다 오래 보류한다. 작업별 최대 실행 수는 1이다. 감지 3회 동시 호출, force 혼합, 실패 후 다음 주기, release/close 뒤 추가 호출 0회를 검사한다.
- 출처: D-USR-2026-11-16-7; D00622, D01025

### CON-006

저장의 원자성과 갱신 충돌

- 목표: 같은 expectedVersion으로 두 문서를 저장하고 JSONL 손상·prune·쓰기 실패를 주입한다 → 단일 main owner가 저장한다. 문서는 expectedVersion을 받아 현재 버전이 다르면 충돌로 거절하고 기존 문서를 유지한다. 임시 파일 쓰기·동기화·rename으로 파일 교체를 완료한다. 저장 실패를 정상 완료로 알리지 않는다. 손상 JSON/JSONL은 보존하고 storage_error를 반환하며 빈 자료로 초기화하지 않는다. 기록의 순서·재시작 복구·prune과 쓰기의 경합을 검사한다; [RULE-RETENTION](rules.md#RULE-RETENTION);   둘 다 성공하거나 손상 원본이 지워지거나 storage_error 대신 빈 정상 자료를 반환하면 실패
- 현재: `desktop/hub-store.cjs:29,73`은 임시 파일·fsync·rename·0700/0600을 쓰지만 expectedVersion은 없다. :49,68은 손상 JSONL을 버리고 SyntaxError를 빈 객체로 바꾼다. reads의 7일 인스턴스와 기본 90일 인스턴스가 같은 userData를 공유한다.
- 차이: expectedVersion 검사가 없고 손상 JSON/JSONL을 빈값으로 바꾼다. source-checks는 reads/index.cjs:40의 shortLog로 7일, 목표는 90일이다. TASK-D-06
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `the store masks every text before it is written and prunes rows older than 90 days`
- 점검: 같은 버전의 두 변경 중 하나만 성공하고 두 번째는 충돌이다. 기록 도중 종료·디스크 쓰기 실패·손상 행·prune 겹침을 주입한 뒤 원본 또는 완전한 새 문서만 읽힌다. 폴더 0700, 파일 0600을 검사한다. 만료 삭제와 파일 손상을 다른 결과로 반환한다.
- 출처: D-USR-2026-11-16-7; D-USR-2026-11-16-4; 기존 제품·kit 계약에서 도출한 세부 설계 기본값; D00465, D00472

## 경로별 중복처리 계약

아래 표의 키와 판정 창은 목표 계약이다. 현재 코드의 키가 다르면 각 항목의 상태에 적는다. 시간 창만으로 영구 중복 방지를 대신하지 않는다. 재시작 뒤에도 보관 중인 결과의 키를 재구성한다. UID와 resourceVersion은 문자열 그대로 보존한다. resourceVersion은 불투명 문자열로 다루고 숫자·사전순으로 최신을 판정하지 않는다. RV 숫자 정렬을 사용하지 않는 계약을 기본값으로 채택한다. 410 재목록 동작은 [Kubernetes API Concepts](https://kubernetes.io/docs/reference/using-api/api-concepts/)를 따른다. Event 누적 횟수의 의미는 [Kubernetes Event API](https://kubernetes.io/docs/reference/kubernetes-api/core/event-v1/)와 대조한다.

| 경로 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| Kubernetes Event | → [RULE-RETENTION](rules.md#RULE-RETENTION). 상세 전이는 CON-007 적용 → 반복 수가 10을 넘거나 3으로 줄거나 다른 cluster의 동일 UID와 합쳐지면 실패 | `desktop/reads/events.cjs:19`의 known 키는 UID뿐이며 변화마다 append한다. | known 키가 cluster 없는 UID이며 append 전에 count 역전을 막지 않고 slim에서 resourceVersion을 버린다. TASK-D-07 | `apps/wake/desktop/reads/reads.test.cjs` — `events are kept for 7 days: a stored event outlives the API server list` | D-USR-2026-11-16-7; D00064, D00090, D00091, D00452, D01025 |
| watch·폴링 | 재연결·410·겹친 목록 입력 → 키는 cluster + 대상 UID + resourceVersion; watch 세대와 재목록 경계, 보관 중 처리 위치. 상세 전이는 CON-008 적용 → 중복 RV를 두 번 반영하거나 옛 세대가 새 스냅샷을 덮거나 실패를 전체 삭제로 표시하면 실패 | `desktop/reads/index.cjs:74`는 폴링이고 `desktop/k8s.cjs`는 일반 HTTP 읽기다. | 현재 reads의 watch는 setInterval 폴링이며 API watch·resourceVersion 재개·410 처리기가 없다. TASK-D-08 | 고정 없음 → TASK-D-08 | D-USR-2026-11-16-7; D01025 |
| Alertmanager·Prometheus | 반복 전송·라벨 사본·해제 뒤 재발 입력 → 키는 cluster + fingerprint + startsAt; 지문 없으면 정규화 labels + startsAt; alert-history의 보관은 [RULE-RETENTION](rules.md#RULE-RETENTION). 상세 전이는 CON-009 적용 → 재발 이력이 없어지거나 조회 실패가 해제로 바뀌거나 Watchdog가 firing 수에 포함되면 실패 | `desktop/reads/alerts.cjs:12`는 cluster/fingerprint/startsAt 이력을 매번 append하고 지문 없는 행은 제외한다. | 지문 없는 알림이 제외되고 같은 이력은 반복 append된다. 조회 부재를 lastSeen 종료로 추론한다. TASK-D-09 | `apps/wake/desktop/reads/reads.test.cjs` — `alert history: new alerts are written, alerts gone from Alertmanager end at the last time they were seen`; `apps/wake/desktop/reads/reads.test.cjs` — `alerts.read keeps rules, live alerts and the resolved history; alerts.expr reads the rule expr itself` | D-USR-2026-11-16-7; D01006 |
| 인시던트 | 여러 출처의 같은 원인, 감지 겹침 입력 → 키는 cluster + 최상위 소유자 UID + 규칙 + 열림 창; incidents, evidence, meta; 활성·재발 정책. 상세 전이는 CON-010, CON-011 적용 → 같은 장애가 중복되거나 새 UID가 옛 사건에 합쳐지거나 ImagePull이 crash-loop로 표시되면 실패 | `data/incident-detect.js:96,119,132`는 owner UID를 받지만 이름 key·과거 연결·stableId를 쓴다. | keyOf는 owner UID 대신 kind/namespace/name을 사용하고 incident-hub는 PVC·Application을 읽지 않는다. TASK-D-10 | `apps/wake/data/incident-detect.test.mjs` — `ownerReferences lead from a Pod through its ReplicaSet to the Deployment`; `apps/wake/data/incident-detect.test.mjs` — `an OOMKilled container, a BackOff event and a firing alert of one Deployment become one incident with a stable id`; `apps/wake/data/incident-detect.test.mjs` — `a signal of a Pod that is gone (its owner can no longer be read) joins the incident that already holds that Pod` | D-USR-2026-11-16-7; D00093, D00114 |
| IPC 구독 | 재렌더·탭 재열기·두 번 등록 입력 → 키는 문서 수명 + 이벤트 구독, AI는 run; 구독 수명 동안 메모리. 상세 전이는 CON-012 적용 → 한 이벤트가 같은 소비자에 두 번 전달되거나 종료 문서·다른 대화에 적용되면 실패 | `kit/core/service.js:14`는 bridge 1개·콜백 Set, `ai-hub.js:52,65`는 run 필터·finally off를 쓴다. | preload의 on은 해제 함수를 반환하지 않아 문서 구독의 종료 수명이 공통 계약과 다르다. TASK-D-12 | 고정 없음 → TASK-D-12 | D-USR-2026-11-16-7; D00457 |
| 감사 | 같은 요청 재전송·동일 단계 반복 입력 → 키는 requestId + 사건 종류/단계; audit의 보관은 [RULE-RETENTION](rules.md#RULE-RETENTION). 상세 전이는 CON-013 적용 → 동일 사건이 둘 이상 남거나 서로 다른 세 단계가 하나로 합쳐지면 실패 | `desktop/hub-tools.cjs:187`은 매 호출 append하고 requestId가 없다. | 도구 호출마다 무작위 ID로 append하며 requestId/action 멱등 키가 없다. TASK-D-13 | `apps/wake/desktop/hub.test.cjs` — `a call is checked, scoped and audited with its transport; out of scope ends forbidden and is recorded` | D-USR-2026-11-16-7; D00869; D00466, D00473 |
| 승인·실행 | 이중 클릭·두 창·전송 경로 변경 입력 → 키는 approvalId, executionId; approvals 및 독립 실행 기록의 보관은 [RULE-RETENTION](rules.md#RULE-RETENTION). 상세 전이는 CON-014 적용 → 첫 결정이 바뀌거나 저장 실패가 approved가 되거나 외부 변경이 두 번 실행되면 실패 | `desktop/approvals.cjs:43`은 waiting에서만 결정 저장 후 replay한다. | 결정 put 이후 choose·audit가 실패해도 원자적으로 되돌리거나 재생할 수 없고 executionId가 없다. TASK-D-14 | `apps/wake/desktop/hub.test.cjs` — `approvals keep the first decision, never run anything, and record a Draft PR that cannot be made without GitHub` | D-USR-2026-11-16-7; 기존 제품·kit 계약에서 도출한 세부 설계 기본값; D00869 |
| Draft PR·Git 쓰기 | 생성 응답 유실·timeout 뒤 재시도 입력 → 키는 저장소 + 제안/실행 멱등 키 + 브랜치; 승인 결과와 외부 PR 식별자. 상세 전이는 CON-015 적용 → 브랜치·PR이 둘 생성되거나 PR 생성만으로 배포·복구 성공을 표시하면 실패 | `desktop/approvals.cjs:49`는 pending/github-unconnected만 기록하고 PR 생성 API를 호출하지 않는다. | approvals는 pending/github-unconnected만 기록하며 PR API 생성·조회·재시도 경로가 없다. TASK-D-15 | 고정 없음 → TASK-D-15 | D-USR-2026-11-16-7; 기존 제품·kit 계약에서 도출한 세부 설계 기본값 |
| 시스템 알림·토스트 | 같은 인시던트·단계 반복 입력 → 키는 incident ID + 단계 + 재발 회차; 알림 기록과 전달 상태. 상세 전이는 CON-016 적용 → 같은 전이·repeat·채널에 알림이 두 번 나오거나 실패한 대화가 완료 알림을 내면 실패 | `kit/shell/panel-engine.js`는 실패와 완료 알림을 나누고 `desktop/hub.cjs:82`는 changed 이벤트를 보낸다. | hub의 changed 이벤트는 영속 전달 키 없이 전송되므로 재시작 후 채널별 전달 여부를 복원하지 못한다. TASK-D-16 | 고정 없음 → TASK-D-16 | D-USR-2026-11-16-7; 기존 제품·kit 계약에서 도출한 세부 설계 기본값 |
| MCP·HTTP 도구 | 클라이언트 재시도 입력 → 키는 인증 주체·scope + 요청 키 + 도구 + 정규화 입력; 결과·제안 멱등 저장소, 수명은 CON-017에서 결정. 상세 전이는 CON-017 적용 → approval ID가 달라지거나 같은 키의 다른 입력을 허용하거나 외부 직접 승인·실행을 허용하면 실패 | `desktop/hub-server.cjs:51`은 공통 tools.call을 쓰지만 approvals.cjs:37은 제안마다 randomUUID를 만든다. | 제안마다 randomUUID로 새 approval을 만들며 MCP/HTTP 요청 키 전달·영속 응답 재생이 없다. TASK-D-17 | 고정 없음 → TASK-D-17 | D-USR-2026-11-16-7; 기존 제품·kit 계약에서 도출한 세부 설계 기본값 |
| CLI·로그 스트림 | 청크 재전달·재시작·페이지 경계 입력 → 키는 실행 ID + 스트림 위치; 로그는 대상·컨테이너 인스턴스 + ns 시각 + 스트림 + 행 순번; 실행 수명·조회 커서. 상세 전이는 CON-018 적용 → 실제 반복 행을 지우거나 이미 읽은 경계 행을 중복하거나 포화 구간을 완전 조회로 표시하면 실패 | `desktop/pod-logs.cjs:90`은 schema/at/seen 커서·UID 라벨·전후 인스턴스·hash 다중집합·포화 partial을 처리한다. | Loki hash 다중집합과 포화 partial은 있지만 CLI 재시작 위치 키와 청크 멱등 처리는 연결되지 않았다. TASK-D-18 | `apps/wake/desktop/pod-logs.test.cjs` — `readPodLogWindow keeps the 100-line request even with 50,000 source lines and filters the upper bound`; `apps/wake/desktop/pod-logs.test.cjs` — `readPodLogWindow rejects replacement during a read and distinguishes a pre-instance window`; `apps/wake/desktop/pod-logs.test.cjs` — `readLokiPodLogWindow retains equal-timestamp repeated lines across 100-line pages`; `apps/wake/desktop/pod-logs.test.cjs` — `readLokiPodLogWindow stops at a saturated nanosecond and leaves unverified streams unread` | D-USR-2026-11-16-7; D00064, D00095, D00097, D00098, D00099, D00452 |

### CON-007

Event 원본과 사건 묶음

- 목표: 같은 cluster/Event UID의 count를 1부터 10까지 갱신하고 count 3을 늦게 재전달한다 → 같은 cluster+Event UID를 다시 받으면 최신 count/series.count·마지막 시각을 갱신한다. 누적 count를 매 수신마다 더하지 않는다. 과거 응답은 횟수·시각을 되돌리지 않는다. 별개 Event UID의 발생 기록은 출처로 보존하고, 같은 대상 UID·reason·정규화 message의 사건 묶음과 구분한다. 제안 정규화 v1은 연속 공백만 한 칸으로 바꾸고 대소문자·숫자·대상명을 유지한다. 정규화 버전을 키에 포함하며 대상명·UID·오류 원인처럼 의미 있는 차이를 지워 합치지 않는다. 7일 저장소에는 같은 상태의 재전송 행을 쌓지 않는다. Wake 처리의 수집·기록·연관 분석·인시던트 연결 시각은 실제 처리 기록이 있을 때만 표시한다. `연관 없음`과 처리 기록 조회 실패를 구분한다. 새 Event 도착은 읽던 행 위치를 바꾸지 않고 새 건수로 알린다; 반복 수가 10을 넘거나 3으로 줄거나 다른 cluster의 동일 UID와 합쳐지면 실패
- 현재: `desktop/reads/events.cjs:19`의 known 키는 UID뿐이며 변화마다 append한다. retained는 마지막 행 우선이고 slim은 resourceVersion을 버린다. count 역전·다른 UID 사건 정규화·영속 중복 제거는 없다.
- 차이: known 키가 cluster 없는 UID이며 append 전에 count 역전을 막지 않고 slim에서 resourceVersion을 버린다. TASK-D-07
- 고정 장치: `apps/wake/desktop/reads/reads.test.cjs` — `events are kept for 7 days: a stored event outlives the API server list`
- 점검: 같은 Event의 count 1부터 10까지 갱신 뒤 동일 응답을 열 번 더 보내도 최종 반복 수는 10이다. cluster가 다른 같은 UID는 섞이지 않는다. count 3의 늦은 응답이 count 10을 덮지 않는다. UID가 다른 같은 사건은 원본 UID 집합을 보존하며 묶음 수·반복 수를 혼동하지 않는다. continue가 있는 500행 응답은 partial이다. 화면의 Event 행 수와 occurrences를 따로 원본 대조한다.
- 출처: D-USR-2026-11-16-7; D00064, D00090, D00091, D00452, D01025

### CON-008

watch 재연결과 410

- 목표: watch RV2를 재전달한 뒤 410과 재목록 실패·성공을 순서대로 입력한다 → watch와 폴링을 선택한 읽기별로 명시한다. watch는 마지막 처리 resourceVersion을 보존하며 중복 UID+resourceVersion을 재처리하지 않는다. 410을 받으면 기존 세대를 폐기하고 재목록에서 현재 스냅샷과 새 watch 경계를 확정한다. 재목록 중 예전 watch 이벤트가 완료돼도 새 스냅샷을 덮지 않는다. 재목록 실패를 전체 삭제·정상 빈 목록으로 처리하지 않는다. → 중복 RV를 두 번 반영하거나 옛 세대가 새 스냅샷을 덮거나 실패를 전체 삭제로 표시하면 실패
- 현재: `desktop/reads/index.cjs:74`는 폴링이고 `desktop/k8s.cjs`는 일반 HTTP 읽기다. 리소스 watch·RV 재개·410 재목록은 없다. kubeconfig 파일 watcher와 다르다.
- 차이: 현재 reads의 watch는 setInterval 폴링이며 API watch·resourceVersion 재개·410 처리기가 없다. TASK-D-08
- 고정 장치: 고정 없음 → TASK-D-08
- 점검: 목록 RV1 → 변경 RV2 → 연결 단절 → RV2 재전달 → 410 → 재목록 → 새 변경의 순서에서 논리 변경은 한 번씩만 반영된다. 이전 세대의 지연 이벤트·삭제 이벤트도 주입한다. 재목록 실패 때 이전 자료는 출처 실패와 함께 남고 신규 대상과 혼합되지 않는다.
- 출처: D-USR-2026-11-16-7; D01025

### CON-009

알림 지문과 해제·재발

- 목표: 동일 fingerprint/startsAt 알림을 반복 받은 뒤 endsAt과 새 startsAt으로 재발시킨다 → Alertmanager의 fingerprint와 startsAt을 함께 보존한다. 지문이 없는 Prometheus 알림은 정렬한 라벨 집합과 startsAt으로 식별한다. 서로 다른 클러스터를 합치지 않는다. 외부 라벨만 다른 사본은 명시 allowlist에 있는 라벨만 제외해 합친다. 제안 기본값은 빈 allowlist로, 별도 결정 전 어떤 라벨도 제거하지 않는다. endsAt과 새 startsAt을 분리해 해제 후 재발을 보존한다. 조회 실패를 알림 해제로 처리하지 않는다. Watchdog는 목록·firing 수에서 숨기고 Alertmanager 출처의 확인 근거로만 쓴다. Watchdog 수신을 다른 지표의 데이터 신선도로 전파하지 않는다. → 재발 이력이 없어지거나 조회 실패가 해제로 바뀌거나 Watchdog가 firing 수에 포함되면 실패
- 현재: `desktop/reads/alerts.cjs:12`는 cluster/fingerprint/startsAt 이력을 매번 append하고 지문 없는 행은 제외한다. 부재는 lastSeen 종료로 추론한다. `data/alerts.js:15`는 Watchdog를 제외한다.
- 차이: 지문 없는 알림이 제외되고 같은 이력은 반복 append된다. 조회 부재를 lastSeen 종료로 추론한다. TASK-D-09
- 고정 장치: `apps/wake/desktop/reads/reads.test.cjs` — `alert history: new alerts are written, alerts gone from Alertmanager end at the last time they were seen`; `apps/wake/desktop/reads/reads.test.cjs` — `alerts.read keeps rules, live alerts and the resolved history; alerts.expr reads the rule expr itself`
- 점검: 같은 fingerprint+startsAt 10회 수신은 활성 알림 1개다. 해제 뒤 새 startsAt은 새 발생 회차다. 해제보다 늦게 도착한 옛 firing이 해제를 되돌리지 않는다. 두 클러스터·라벨 순서 변경·외부 라벨 사본·부분 실패를 각각 시험한다. Watchdog 사본 두 개는 목록 0개, 출처 확인 1개 의미를 가진다. 같은 상태·시각의 행은 안정된 식별자로 동점 정렬한다.
- 출처: D-USR-2026-11-16-7; D01006

### CON-010

인시던트 묶기와 대상 UID

- 목표: 한 Deployment owner UID의 OOM Pod·Event·알림과 같은 이름의 새 UID를 입력한다 → Pod·Event·알림이 같은 장애를 가리키면 확인된 ownerReferences의 최상위 소유자 UID와 감지 규칙, 열림 창으로 묶는다. 이름만 같은 새 UID는 이전 인시던트에 합치지 않는다. 인과 관계가 확인되지 않은 Ingress 5xx를 무조건 기존 장애에 합치지 않고, Service·워크로드 연결 근거가 있을 때 같은 원인 묶음에 연결한다. 감지 입력이 일부 실패하면 빠진 출처를 표시한다. PVC 알림을 Node로, ImagePull을 crash-loop로 잘못 분류하거나 Application 신호를 누락하지 않는다. → 같은 장애가 중복되거나 새 UID가 옛 사건에 합쳐지거나 ImagePull이 crash-loop로 표시되면 실패
- 현재: `data/incident-detect.js:96,119,132`는 owner UID를 받지만 이름 key·과거 연결·stableId를 쓴다. `desktop/incident-hub.cjs:54`에는 PVC·Application 읽기가 없다. PVC 라벨 오분류·ImagePull 원인 구분은 추가 검증 대상이다.
- 차이: keyOf는 owner UID 대신 kind/namespace/name을 사용하고 incident-hub는 PVC·Application을 읽지 않는다. TASK-D-10
- 고정 장치: `apps/wake/data/incident-detect.test.mjs` — `ownerReferences lead from a Pod through its ReplicaSet to the Deployment`; `apps/wake/data/incident-detect.test.mjs` — `an OOMKilled container, a BackOff event and a firing alert of one Deployment become one incident with a stable id`; `apps/wake/data/incident-detect.test.mjs` — `a signal of a Pod that is gone (its owner can no longer be read) joins the incident that already holds that Pod`
- 점검: 한 Deployment의 OOM Pod+Event+알림으로 인시던트 1개, 반복 감지·재시작 뒤 같은 ID다. 같은 이름의 새 Deployment UID, 별도 rule, 서로 다른 namespace는 의도한 분리 결과를 가진다. PVC+node 라벨 입력의 target.kind는 PVC 계열이고 Node가 아니다. ImagePull·Application 시나리오는 전용 원인과 올바른 대상이 남는다.
- 출처: D-USR-2026-11-16-7; D00093, D00114

### CON-011

재발과 복구 관찰 창

- 목표: → [RULE-RECOVERY](rules.md#RULE-RECOVERY);  과거 신호의 재수신은 재발로 세지 않는다. 재발 때 새 근거·시작 시각·회차를 보존한다. 규칙·소유자 UID가 바뀌면 별개 장애다;   앱이 꺼져 있던 시간·조회 실패는 miss이며 정상으로 채우지 않는다; 
- 현재: `data/incident-detect.js:115`는 옛 신호를 거르고 새 신호에는 새 ID를 만든다. :154는 open/mitigated/resolved와 miss를 처리한다. DETECT는 lookback 60분·active 10분·quiet 5분·gap 30분·maxSignals 200이다.
- 차이: 해결 뒤 새 신호에 새 ID를 만들므로 24시간 이내 repeat 회차가 없다. TASK-D-11
- 고정 장치: `apps/wake/data/incident-detect.test.mjs` — `lifecycle: quiet after the alert clears is mitigated, enough ok windows resolve it, a new signal while mitigated opens it again`; `apps/wake/data/incident-detect.test.mjs` — `a window the hub could not read is a miss, never ok; a not-ready workload fails the check and it starts again`
- 점검: 해결된 장애에 같은 옛 신호를 10회 보내도 repeat 증가 0이다. 새 발생 회차는 repeat 1 증가, 기존 ID 유지, 과거 근거 불변이다. mitigated 중 재발은 open으로 돌아가 관찰 창을 다시 시작한다. 앱 중단 구간과 조회 실패는 miss이고 해결 조건에 포함되지 않는다; [RULE-RECOVERY](rules.md#RULE-RECOVERY). 정확히 24시간과 그 다음 1ms를 검사하며 제품 검증 전 완료로 판정하지 않는다.
- 출처: D-USR-2026-11-16-7; D01024; D-USR-2026-11-16-3

### CON-012

IPC 구독과 문서 수명

- 목표: 같은 문서를 열고 닫는 일을 10회 반복하며 서로 다른 run ID 이벤트를 교차 전달한다 → 같은 문서가 같은 구독을 중복 등록하지 않으며 dispose·pagehide·탭 종료에서 구독을 해제한다. AI 이벤트는 정확한 run으로만 전달한다. 다른 대화의 완료 이벤트가 현재 대화의 답·승인·알림을 바꾸지 않는다. 구독 함수의 호출 횟수와 실제 IPC listener 수를 구분해 검사한다. → 한 이벤트가 같은 소비자에 두 번 전달되거나 종료 문서·다른 대화에 적용되면 실패
- 현재: `kit/core/service.js:14`는 bridge 1개·콜백 Set, `ai-hub.js:52,65`는 run 필터·finally off를 쓴다. 새 함수는 별도 listener이며 `kit/desktop/preload-page.cjs:19`의 on은 해제 함수를 반환하지 않는다. boot.js:103 relay 수명도 확인이 필요하다.
- 차이: preload의 on은 해제 함수를 반환하지 않아 문서 구독의 종료 수명이 공통 계약과 다르다. TASK-D-12
- 고정 장치: 고정 없음 → TASK-D-12
- 점검: 화면을 10회 다시 그리거나 탭을 닫았다 열어도 한 이벤트당 활성 소비자 호출은 1회다. 종료 문서 호출은 0회다. 서로 다른 run 두 개의 교차 스트림은 각각의 대화에만 기록된다. 완료·오류·취소에서 listener 수가 시작 수준으로 돌아온다.
- 출처: D-USR-2026-11-16-7; D00457

### CON-013

감사 기록의 멱등성과 사건 구분

- 목표: 같은 requestId/action을 열 번 재전송하고 같은 requestId의 승인·실행·검증도 기록한다 → 같은 논리 요청의 같은 사건은 requestId로 한 번만 저장한다. 승인·실행·검증은 독립 사건이므로 하나로 합쳐 삭제하지 않는다. 사건 키에는 requestId와 단계 또는 action을 포함한다. 요청자, 모델, transport, scope, target UID, permission, result, masked, approvalId/executionId를 보존한다. 보관 기간은 CON-006을 따른다. 재시도는 원래 결과를 반환하되 서로 다른 실제 요청의 감사 기록은 남긴다. → 동일 사건이 둘 이상 남거나 서로 다른 세 단계가 하나로 합쳐지면 실패
- 현재: `desktop/hub-tools.cjs:187`은 매 호출 append하고 requestId가 없다. `desktop/hub-store.cjs:52`는 무작위 ID를 만들며 approvals.cjs:46의 replay는 승인 중복 일부만 막는다.
- 차이: 도구 호출마다 무작위 ID로 append하며 requestId/action 멱등 키가 없다. TASK-D-13
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `a call is checked, scoped and audited with its transport; out of scope ends forbidden and is recorded`
- 점검: 같은 requestId/action 재전송 10회는 해당 사건 1행이다. 동일 requestId의 승인·실행·검증은 각각 1행이며 결과가 섞이지 않는다. scope 밖 호출은 거절 감사가 남는다. 재시작 뒤 같은 멱등 키도 중복 행 0이다. 다른 요청은 같은 입력이어도 별도 감사가 남는다.
- 출처: D-USR-2026-11-16-7; D00869; D00466, D00473

### CON-014

승인 첫 결정과 실행 한 번

- 목표: 두 창에서 같은 approvalId에 allow/deny를 동시에 보내고 동일 executionId를 재전송한다 → approvalId의 첫 유효한 사람 결정을 영속 보존한다. 두 번 클릭·두 창의 allow/deny 경쟁에서 첫 결정만 유효하다. 저장 실패는 승인 완료가 아니다. 결정 저장 후 부수 작업이 실패해도 최초 결정·실패 원인을 재조회할 수 있어야 한다. 승인과 실행·복구 확인은 서로 다른 상태다; [RULE-AI](rules.md#RULE-AI). executionId의 동일 실행은 최대 한 번이다; 첫 결정이 바뀌거나 저장 실패가 approved가 되거나 외부 변경이 두 번 실행되면 실패
- 현재: `desktop/approvals.cjs:43`은 waiting에서만 결정 저장 후 replay한다. put 뒤 choose·audit 실패와 프로세스 경합은 원자적이지 않고 executionId·실제 실행이 없다.
- 차이: 결정 put 이후 choose·audit가 실패해도 원자적으로 되돌리거나 재생할 수 없고 executionId가 없다. TASK-D-14
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `approvals keep the first decision, never run anything, and record a Draft PR that cannot be made without GitHub`
- 점검: 같은 approvalId에 allow/deny를 동시에 보내면 결과 하나, 승인 감사 하나다. 재시작 뒤 반대 결정도 replay다. 저장 실패를 주입하면 approved/ran을 내보내지 않는다. 실행 구현 뒤 동일 executionId를 재전송해도 외부 변경은 1회다. MCP·HTTP의 직접 승인·실행은 거절되며 0회 실행이다.
- 출처: D-USR-2026-11-16-7; 기존 제품·kit 계약에서 도출한 세부 설계 기본값; D00869

### CON-015

Draft PR 멱등 처리

- 목표: PR 생성 응답 유실 뒤 같은 승인·change digest를 재시작 전후 재전송한다 → 같은 승인·변경의 재시도는 같은 브랜치·PR을 재사용한다. 외부에서 PR은 생성됐지만 응답이 유실된 경우에도 다시 생성하기 전에 멱등 키나 브랜치로 기존 PR을 찾는다. PR ID·URL·원본 revision·변경 digest·결과를 영속 저장한다. PR 생성, 사람의 merge, 배포, 복구 확인을 별도 상태로 둔다. → 브랜치·PR이 둘 생성되거나 PR 생성만으로 배포·복구 성공을 표시하면 실패
- 현재: `desktop/approvals.cjs:49`는 pending/github-unconnected만 기록하고 PR 생성 API를 호출하지 않는다. 삭제된 이전 배포 모듈은 현 구현 근거가 아니다.
- 차이: approvals는 pending/github-unconnected만 기록하며 PR API 생성·조회·재시도 경로가 없다. TASK-D-15
- 고정 장치: 고정 없음 → TASK-D-15
- 점검: 허용된 시험 Git 서버에서 생성 응답 유실 → 동일 승인 재전송 → 재시작 재전송을 수행해 PR 1개, 브랜치 1개다. PR 생성 실패는 approved와 구분되고 ran/복구 성공으로 표시되지 않는다. 다른 change digest는 기존 PR에 조용히 덮지 않는다.
- 출처: D-USR-2026-11-16-7; 기존 제품·kit 계약에서 도출한 세부 설계 기본값

### CON-016

알림과 토스트 중복

- 목표: 같은 incident 상태 전이 이벤트를 두 문서에 열 번 전달하고 앱을 재시작한다 → incident ID·상태 전이 ID·repeat 회차·채널을 전달 키로 영속 저장하며 같은 전이는 채널마다 한 번만 전달한다. 새 상태 전이 또는 재발 회차는 새 알림이다. 재활성 시 과거 알림을 일괄 전송하지 않고 전달 결과 불명은 확인 전에 재전송하지 않는다. 같은 이벤트를 여러 문서가 받는 것, 앱 재시작 뒤 기존 인시던트를 읽는 것으로 새 장애 알림을 만들지 않는다. 실패한 대화는 완료 알림을 내보내지 않는다. → 같은 전이·repeat·채널에 알림이 두 번 나오거나 실패한 대화가 완료 알림을 내면 실패
- 현재: `kit/shell/panel-engine.js`는 실패와 완료 알림을 나누고 `desktop/hub.cjs:82`는 changed 이벤트를 보낸다. incident/phase/repeat별 영속 전달 원장은 없다.
- 차이: hub의 changed 이벤트는 영속 전달 키 없이 전송되므로 재시작 후 채널별 전달 여부를 복원하지 못한다. TASK-D-16
- 고정 장치: 고정 없음 → TASK-D-16
- 점검: 같은 단계 이벤트 10회, 구독 문서 2개, 앱 재시작을 거쳐 각 전달 채널의 중복은 0이다. 실제 단계 변화와 재발은 각각 새 알림 1회다. 모델 실패·거절·취소는 done 알림 0회다.
- 출처: D-USR-2026-11-16-7; 기존 제품·kit 계약에서 도출한 세부 설계 기본값

### CON-017

MCP·HTTP 재시도

- 목표: 동일 인증 scope·요청 키·propose_action 인자를 MCP와 HTTP에서 재전송한다 → 읽기는 동일 조건의 재시도에서 부작용을 중복 생성하지 않는다. 시간 경과로 원본이 변할 수 있으므로 멱등은 항상 같은 최신 값이라는 뜻이 아니다. propose_action은 동일 권한 범위·동일 요청 키·동일 입력에 같은 approval ID를 돌려준다. 같은 요청 키에 다른 입력은 거절한다. JSON-RPC id는 응답 대응용이며 그 자체로 전송 경로를 넘는 영속 멱등 키로 가정하지 않는다. 외부 경로에는 직접 승인·실행을 추가하지 않는다. → approval ID가 달라지거나 같은 키의 다른 입력을 허용하거나 외부 직접 승인·실행을 허용하면 실패
- 현재: `desktop/hub-server.cjs:51`은 공통 tools.call을 쓰지만 approvals.cjs:37은 제안마다 randomUUID를 만든다. 요청 키·영속 응답 재생·mcp-stdio.cjs:23의 재시도 정책은 없다.
- 차이: 제안마다 randomUUID로 새 approval을 만들며 MCP/HTTP 요청 키 전달·영속 응답 재생이 없다. TASK-D-17
- 고정 장치: 고정 없음 → TASK-D-17
- 점검: desktop/MCP/HTTP의 권한 있는 제안 경로에서 동일 논리 요청을 재전송하면 승인 요청 1개다. 응답 유실·클라이언트 재연결·앱 재시작에도 같다. 다른 사용자·scope의 결과를 공유하지 않는다. 직접 승인 요청은 인증된 외부 클라이언트여도 거절한다.
- 출처: D-USR-2026-11-16-7; 기존 제품·kit 계약에서 도출한 세부 설계 기본값

### CON-018

로그·CLI 중복과 경계

- 목표: 같은 나노초·동일 문자열 반복 로그를 100행 경계로 읽고 CLI 청크를 재전달한다 → CLI 스트림은 실행 ID·stdout/stderr 위치로 전달을 구분한다. 문자열이 같다는 이유로 실제 반복 로그를 지우지 않는다. Loki는 정확한 Pod UID·컨테이너 인스턴스·시간·스트림의 경계를 사용하며 같은 나노초의 여러 행도 보존한다. 페이지 경계에서 이미 받은 행만 제외한다. 경계를 다 읽을 수 없으면 partial과 범위 좁히기를 제공한다. Kubernetes 로그에는 존재하지 않는 서버 페이지 커서를 만들어 붙이지 않는다. → 실제 반복 행을 지우거나 이미 읽은 경계 행을 중복하거나 포화 구간을 완전 조회로 표시하면 실패
- 현재: `desktop/pod-logs.cjs:90`은 schema/at/seen 커서·UID 라벨·전후 인스턴스·hash 다중집합·포화 partial을 처리한다. CLI 재시작 위치 키와 화면 따라가기·스크롤은 미검증이다.
- 차이: Loki hash 다중집합과 포화 partial은 있지만 CLI 재시작 위치 키와 청크 멱등 처리는 연결되지 않았다. TASK-D-18
- 고정 장치: `apps/wake/desktop/pod-logs.test.cjs` — `readPodLogWindow keeps the 100-line request even with 50,000 source lines and filters the upper bound`; `apps/wake/desktop/pod-logs.test.cjs` — `readPodLogWindow rejects replacement during a read and distinguishes a pre-instance window`; `apps/wake/desktop/pod-logs.test.cjs` — `readLokiPodLogWindow retains equal-timestamp repeated lines across 100-line pages`; `apps/wake/desktop/pod-logs.test.cjs` — `readLokiPodLogWindow stops at a saturated nanosecond and leaves unverified streams unread`
- 점검: 50,000줄 원본에도 첫 요청은 100줄이다. 같은 ns 시각·같은 문자열의 실제 반복 행은 원본 개수대로 보존한다. 100행 경계 재조회 후 누락·중복 0이다. 포화된 단일 ns 경계는 부분 조회이며 다음 경계를 추정하지 않는다. 조회 중 UID/컨테이너 인스턴스 교체는 identity_changed다. CLI 청크 재전달·프로세스 재시작을 별도로 시험한다.
- 출처: D-USR-2026-11-16-7; D00064, D00095, D00097, D00098, D00099, D00452

## 대화 저장 계약

### CON-019

명시적 대화 ID

- 목표: 새 질문 뒤 목록에서 같은 대화를 다른 엔진으로 열어 후속 질문을 보낸다 → 새 대화는 고유 conversation ID를 만들고 모든 ai.run 요청에 명시한다. 허브가 반환한 ID를 엔진이 보존하며 목록 재열기·후속 질문·실패 후 재시도에 같은 ID를 쓴다. 클라이언트의 시각·첫 문장·메시지 수로 ID를 다시 추정하지 않는다. run ID는 한 번의 요청·이벤트 흐름 식별자이며 conversation ID와 다르다. → ai.run.conversation·저장 ID·재열기 ID가 다르거나 신규 동시 대화 ID가 충돌하면 실패
- 현재: `ai-hub.js:55`는 명시 또는 무작위 ID, `desktop/ai-run.cjs:86,121`은 그 ID를 사용한다. ID 없는 직접 호출은 ms 기반 fallback이라 같은 ms 충돌 가능성이 있다.
- 차이: ai-hub의 UUID와 달리 ai-run 직접 호출의 fallback은 ms 기반이어서 같은 ms 신규 호출이 충돌할 수 있다. TASK-D-19
- 고정 장치: `apps/wake/ai-target-flow.test.mjs` — `refused → reopened from the list → the context comes back → a follow-up in the reopened conversation → reopened from a new store: one conversation, the refusal kept`
- 점검: 엔진에서 질문 → 목록 조회 → 다른 엔진에서 같은 대화 선택 → 후속 질문을 수행한다. 원래 ID=후속 요청 ID=저장 ID이고 대화 수는 1이다. 질문 시각을 바꾸어도 ID는 바뀌지 않는다. 신규 동시 대화끼리는 ID가 다르다.
- 출처: D-USR-2026-11-16-7; D00984

### CON-020

허브 기록과 오래된 사본

- 목표: 같은 conversation의 두 창 A/B가 동시에 질문하고 B 응답을 먼저 저장한다 → 허브에 저장된 대화가 이력의 기준이다. 클라이언트는 새 사용자 메시지를 추가하며 오래된 전체 사본으로 저장 이력을 덮지 않는다. 메시지 ID와 처리 위치 또는 동등한 확인 정보로 이미 저장한 질문을 식별한다. 두 창에서 같은 대화에 동시에 질문해도 두 질문과 각 응답·실패가 모두 남아야 한다. 전송 재시도는 같은 질문을 두 번 저장하지 않는다. 모델 입력도 확정된 허브 이력에서 만든다. → 허브 재조회에 A/B 질문·답이 하나라도 없거나 동일 message 재전송이 새 질문을 추가하면 실패
- 현재: `desktop/ai-run.cjs:83,121,176`은 호출 전 prior를 한 번 읽고 마지막 put에 사용한다. 순차 staleClient는 보존하지만 동시 완료 시 다른 결과를 잃을 수 있다. 메시지 멱등 키·버전 검사는 없다. 이는 정적 분석이다.
- 차이: 두 실행이 같은 prior를 읽은 뒤 전체 문서를 put하므로 늦은 완료가 먼저 저장한 답을 덮을 수 있다. TASK-D-20
- 고정 장치: 고정 없음 → TASK-D-20
- 점검: A/B 창이 같은 사본을 연 뒤 A의 질문·답 저장 → 오래된 B의 질문을 보내면 원래 이력+A+B가 각각 한 번 남는다. 다음으로 A/B 모델 응답을 동시에 보류했다 역순 완료해도 모두 남는다. 동일 메시지 재전송 10회는 새 질문 1개다. 재시작 재조회에서 같은 결과다.
- 출처: D-USR-2026-11-16-7; 기존 제품·kit 계약에서 도출한 세부 설계 기본값

### CON-021

실패한 질문·부분 답의 저장

- 목표: 모델 미설정에서 첫 질문을 보낸 뒤 연결·후속 질문·재열기와 부분 응답 단절을 수행한다 → 모델 없음·발견 실패·인증 실패·응답 중 단절·대상 거절·취소에서도 사용자 질문을 동일 conversation ID로 보존한다. 실패 답은 error·message·steps·부분 text·rejectedTarget을 보존한다. 질문을 기록하기 전 모델 호출에 의존하지 않는다. 저장 실패를 done으로 내보내지 않는다. 저장본이 없는데 클라이언트에 오류 assistant가 있다는 이유로 그 앞의 사용자 질문을 이미 저장된 것으로 취급하지 않는다. → 최초 질문·error·부분 text가 유실되거나 저장 실패 전에 done을 내보내면 실패
- 현재: `apps/wake/desktop/ai-run.cjs`는 미설정·대상 거절 질문과 실패를 저장하고, 설정된 모델도 호출 전에 질문을 저장한다. 클라이언트의 메시지 ID를 저장·목록에서도 유지한다. newMessages·record는 저장된 ID를 새 질문에서 제외하고, 답 저장 직전에도 최신 본문과 같은 ID로 병합한다. 같은 문장의 별도 질문은 서로 다른 ID로 남는다. prefs.put 실패는 질문·storage_failed 기록의 저장을 시도하고 오류 이벤트와 storage_failed를 반환한다. 대화 쓰기도 실패하면 done을 내보내지 않는다. `apps/wake/ai-hub.js`는 서비스 reject를 기존 오류 이벤트로 전달한다.
- 차이: 최초 실패·동시 저장·중단 후 후속 질문·설정 저장 실패와 진행 중 재열기 후 중복(R-01)은 격리 디스크와 대역 공급자에서 해소했다. 메시지 ID 중복 방어는 공급자 호출 자체의 멱등성을 뜻하지 않는다. 중단은 화면 소비와 대기만 종료하며 메인 요청을 취소하지 않는다. 공급자 호출의 취소 전파와 중단 상태의 별도 영속 표시는 TASK-D-21에 남긴다. 다중 프로세스 쓰기는 보장하지 않는다. 실제 공급자·Electron 확인은 H-009이다.
- 고정 장치: `apps/wake/desktop/ai-target.test.cjs`의 run_unconfigured_then_connected_preserves_questions_and_failure_on_disk_and_in_model, run_without_saved_history_preserves_users_before_client_assistant, run_conversation_write_failure_reports_storage_failure_without_done, run_concurrent_same_id_merges_completed_turns_without_loss, run_prefs_write_failure_reports_storage_failed_and_attempts_question_save. `apps/wake/ai-hub.test.mjs`의 adapter_service_rejection_is_visible_as_error와 `apps/wake/ai-target-flow.test.mjs`의 stopped_first_run_and_followup_keep_both_questions_and_reverse_answers. R-01 고정 장치는 `apps/wake/ai-target-flow.test.mjs`의 reopened_pending_run_followup_keeps_each_question_once·reopened_pending_run_identical_questions_keep_distinct_ids, `apps/wake/desktop/ai-target.test.cjs`의 run_message_ids_deduplicate_replays_and_latest_save_without_comparing_text·run_legacy_saved_messages_keep_list_ids_when_reopened_and_saved다. 실행은 [R-01 수정](tasks.md#batch1-r01)이다.
- 점검: 공급자 미설정에서 첫 질문 → 공급자 연결 → 같은 대화 후속 질문 → 모델 입력·디스크·재조회 순으로 확인한다. 사용자 질문은 각각 2개, 최초 실패 상태는 1개다. 정상 부분 답 뒤 연결을 끊어도 text·error·steps가 재조회에서 유지된다. 대상 거절은 모델 호출 0회이고 질문·거절이 남는다. 쓰기 실패는 완료 알림 0회다.
- 출처: D-USR-2026-11-16-7; 기존 제품·kit 계약에서 도출한 세부 설계 기본값

### CON-022

답변 근거의 실제 읽기 연결

- 목표: get_evidence 성공·실패·미조회 번호·두 incident 인용을 각각 답변에 포함한다 → 답변의 근거 이름표는 성공한 허용 읽기 도구가 실제 반환한 인시던트·근거에만 연결한다; [RULE-EVIDENCE](rules.md#RULE-EVIDENCE). 근거가 하나의 인시던트로 확정되지 않으면 번호를 평문으로 남긴다. 저장·재조회는 원래 snapshot의 번호·대상·시각·발췌를 그대로 사용한다; 실패 조회·없는 번호·불명확 incident에 클릭 가능한 근거 이름표가 생기면 실패
- 현재: `desktop/ai-run.cjs:106`은 단일 incident의 refs를 저장하지만 :154는 out.error를 검사하지 않고 used에 추가해 실패 조회도 읽은 근거로 셀 수 있다.
- 차이: out.error가 있는 get_evidence도 used에 추가되어 읽기에 실패한 근거가 이름표 후보가 된다. TASK-D-22
- 고정 장치: `apps/wake/desktop/ai-target.test.cjs` — `an answer citing incident evidence carries the cited pieces as short records, in the done event, the saved conversation and the list`; `apps/wake/desktop/ai-target.test.cjs` — `marks with no incident read, or with two incidents read, carry no refs`
- 점검: 성공 1개 인시던트의 존재하는 번호만 링크한다. incident 0개·2개, get_evidence 실패, 없는 번호, propose_action 인자만 있는 경우 링크는 0개다. 최초 표시와 재조회 링크 목적지·snapshot ID가 같다.
- 출처: D-USR-2026-11-16-7; D00452; D00742

## 출처 상태와 시간·대상 정합성

### CON-023

공통 계약 v1의 필드와 상태

- 목표: 원본 읽기에 성공 0·null·403·부분 성공·미관측 응답을 각각 전달한다 → 원본 읽기·화면·AI 도구가 같은 SourceState를 소비한다. null은 reasons의 해당 필드 이유를 동반한다. 정상 응답의 실제 0과 무응답을 구별한다. 관측 전 unknown을 ready로 올리지 않는다. 원본 성공 빈 응답만 empty로 표시한다. 부분 실패에서는 성공 값과 빠진 출처·구간을 함께 보존한다. service 최상위 오류와 출처의 상태는 각각 유지한다. → null 이유가 없거나 성공 0과 실패를 같은 empty로 표시하거나 unknown을 ready로 올리면 실패
- 현재: `desktop/reads/source-checks.cjs:131`은 SourceState·reasons를 만들지만 reads/index.cjs:103의 일부 실패 source는 문자열이다. tracker는 ready/unconfigured/forbidden/stale/error/unknown만 만들며 hub-tools.cjs:219의 coverage는 보관 기간 전체다.
- 차이: tracker에는 loading/empty/partial이 없고 일부 service 오류의 source는 객체가 아닌 문자열이다. TASK-D-23
- 고정 장치: 고정 없음 → TASK-D-23
- 점검: 아래 필드가 성공·실패·미관측·대상 교체의 모든 응답에 존재한다. null 필드의 이유 누락은 0개다. S1–S7의 입력과 표시를 각각 대조한다. 알 수 없는 state 문자열은 정상으로 표시하지 않는다.
- 출처: D-USR-2026-11-16-7; D00090, D00111, D00454, D00978

| 필드 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| id, cluster | 등록 context c의 prometheus 출처를 읽는다 → id=prometheus, cluster=c; 로컬 비클러스터만 cluster=null+이유 → 임의 표시 이름으로 context ID를 바꾸면 실패 | `apps/wake/desktop/reads/source-checks.cjs:136` id:source, cluster를 그대로 반환 | 로컬 비클러스터 null 이유 계약은 이 tracker 밖에서 정한다 | 고정 없음 → TASK-D-23 | D-USR-2026-11-16-7; CON-023 |
| target | Service UID u와 ref를 조회한다 → target={uid:u,ref}; 미조회는 null과 reasons.target → 이름만으로 확인되지 않은 UID를 채우면 실패 | `apps/wake/desktop/reads/source-checks.cjs:136` t.uid가 있을 때 uid/ref를 만든다 | 없음(확인: apps/wake/desktop/reads/source-checks.cjs:136) | 고정 없음 → TASK-D-23 | D00093 |
| state | 같은 출처에 성공 0건·403·부분 실패를 입력한다 → ready/loading/empty/unconfigured/forbidden/partial/stale/error/unknown을 구분 → 부분 결과를 ready만으로 반환하면 실패 | `apps/wake/desktop/reads/source-checks.cjs:123` stateOf는 loading/empty/partial 분기가 없다 | 자료 빈값과 부분 성공 상태를 tracker가 구분하지 않는다 | 고정 없음 → TASK-D-23 | D-USR-2026-11-16-7; CON-023 |
| observedAt | 원본 표본 시각 t1을 t2에 읽는다 → observedAt은 실제 관측 기준 ISO8601 UTC이며 receivedAt과 구분 → 과거 표본을 새 응답 시각으로 덮으면 실패 | `apps/wake/desktop/reads/source-checks.cjs:137` iso(s.dataStart)를 반환한다 | 원본 표본 대신 요청 시작 시각을 사용한다 | 고정 없음 → TASK-D-23 | D-USR-2026-11-16-7; CON-023 |
| receivedAt | 데이터 읽기 또는 probe가 t2에 끝난다 → receivedAt=ISO8601 UTC t2 → 마지막 성공 시각으로 응답 시각을 대신하면 실패 | `apps/wake/desktop/reads/source-checks.cjs:137` iso(s.at)를 반환한다 | 없음(확인: apps/wake/desktop/reads/source-checks.cjs:137) | 고정 없음 → TASK-D-23 | D-USR-2026-11-16-7; CON-023 |
| lastSuccessAt | 성공 t0 뒤 t1에 probe만 성공한다 → lastSuccessAt=t0 유지, 데이터 성공 때만 갱신 → probe가 데이터 성공 시각을 t1로 바꾸면 실패 | `apps/wake/desktop/reads/source-checks.cjs:137` iso(s.last)를 반환한다 | 없음(확인: apps/wake/desktop/reads/source-checks.cjs:137) | 고정 없음 → TASK-D-23 | D-USR-2026-11-16-7; CON-023 |
| checkedAt | 출처 probe가 t2에 완료된다 → checkedAt=t2, 데이터 신선도 시각과 별도 → checkedAt만으로 stale가 해제되면 실패 | `apps/wake/desktop/reads/source-checks.cjs:137` iso(s.checkedAt)를 반환한다 | 없음(확인: apps/wake/desktop/reads/source-checks.cjs:137) | 고정 없음 → TASK-D-23 | D-USR-2026-11-16-7; CON-023 |
| collectionIntervalMs | 주기 30000ms와 on-demand 출처를 조회한다 → 주기는 30000, on-demand는 null과 이유 on_demand → 주기 없는 값을 임의 0ms로 만들면 실패 | `apps/wake/desktop/reads/source-checks.cjs:150` every=null이면 이유 on_demand를 붙인다 | 없음(확인: apps/wake/desktop/reads/source-checks.cjs:150) | 고정 없음 → TASK-D-23 | D-USR-2026-11-16-7; CON-023 |
| retention | → [RULE-RETENTION](rules.md#RULE-RETENTION). | `apps/wake/desktop/reads/source-checks.cjs`는 RETENTION_DAYS=90을 반환하고 저장소의 출처 기록 기간과 같다 | 기간 불일치 해소. 미해결 인시던트·근거 보호는 TASK-F-17 | `apps/wake/desktop/hub-store.test.cjs`의 source_checks_read_uses_same_retention_as_persisted_records가 8일 전 기록 유지와 90일 반환을 검사한다 | D-USR-2026-11-16-4 |
| coverage | 두 성공 사이에 실패와 수집 공백을 넣는다 → from/to/missingIntervals/partial/truncated는 실제 대상 범위, 불명은 null+이유 → 보관 기간 전체를 실제 읽은 범위로 반환하면 실패 | `apps/wake/desktop/reads/source-checks.cjs:133` coverageOf로 UID별 확인 기록을 집계한다 | truncated는 :121에서 항상 false이며 원본 잘림을 받지 않는다 | 고정 없음 → TASK-D-23 | D-USR-2026-11-16-7; CON-023 |
| error, reasons | 403 응답과 미관측 null 필드를 조회한다 → 정규화 오류 코드 및 각 null의 이유 맵, 원문 자격 미포함 → null 이유가 없거나 비밀 원문이 들어가면 실패 | `apps/wake/desktop/reads/source-checks.cjs:142` reasons를 만들고 :155에서 붙인다 | 공통 오류와 기존 상세 코드의 매핑은 CON-023 후속 작업이다 | 고정 없음 → TASK-D-23 | D-USR-2026-11-16-7; CON-023 |
| previous | target UID를 old에서 new로 바꾼다 → 이전 target/lastSuccessAt만 previous에 보존, 현재 값은 미관측 → old 값을 new 정상 값으로 승계하면 실패 | `apps/wake/desktop/reads/source-checks.cjs:140` identityChanged.previous가 있을 때만 붙인다 | 없음(확인: apps/wake/desktop/reads/source-checks.cjs:140) | 고정 없음 → TASK-D-23 | D00093 |
| last, at | ms 기록 s.last/s.at와 ISO 대응 필드를 조회한다 → last/at는 같은 시각의 epoch ms이며 없으면 null+이유 → ISO 필드와 ms가 다른 순간을 나타내면 실패 | `apps/wake/desktop/reads/source-checks.cjs:139` s.last/s.at를 null 병합해 반환한다 | 없음(확인: apps/wake/desktop/reads/source-checks.cjs:139) | 고정 없음 → TASK-D-23 | D-USR-2026-11-16-7; CON-023 |

| 화면 상태 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| 출처 사례: 정상 | → [RULE-STATE](rules.md#RULE-STATE) | `apps/wake/desktop/reads/source-checks.cjs:129` stateOf 최종 분기는 ready다 | 자료 값이 빈지에 따른 empty 분기가 없다 | 고정 없음 → TASK-D-23 | D00093 |
| 출처 사례: 불러오는 중 | → [RULE-STATE](rules.md#RULE-STATE) | `apps/wake/desktop/reads/source-checks.cjs:123` stateOf에 loading 반환이 없다 | 진행 중 표시가 공통 SourceState가 아닌 각 페이지 상태다 | 고정 없음 → TASK-D-23 | D01027 |
| 출처 사례: 빈 상태 | → [RULE-STATE](rules.md#RULE-STATE) | `apps/wake/desktop/reads/source-checks.cjs:129` 성공 후 자료가 비어도 ready로 간다 | empty를 원본 값에서 별도로 판정하는 공통 분기가 없다 | 고정 없음 → TASK-D-23 | D00454 |
| 출처 사례: 연결 안 됨 | → [RULE-STATE](rules.md#RULE-STATE) | `apps/wake/desktop/reads/source-checks.cjs:125` unconfigured는 그대로, connection은 error로 반환한다 | disconnected와 일반 error가 같은 분기로 반환된다 | 고정 없음 → TASK-D-23 | D00111, D00999 |
| 출처 사례: 권한 없음 | → [RULE-STATE](rules.md#RULE-STATE) | `apps/wake/desktop/reads/source-checks.cjs:125` s.error=forbidden이면 forbidden을 반환한다 | 거절된 자료 범위는 source state 필드에 없다 | 고정 없음 → TASK-D-23 | D00111, D00454 |
| 출처 사례: 부분 실패 | → [RULE-STATE](rules.md#RULE-STATE) | `apps/wake/desktop/reads/source-checks.cjs:121` coverage.partial은 실패 기록 유무로 계산한다 | stateOf에는 partial 분기가 없어 coverage와 별도 상태다 | 고정 없음 → TASK-D-23 | D00090, D00111 |
| 출처 사례: 오래됨 | → [RULE-STATE](rules.md#RULE-STATE) | `apps/wake/desktop/reads/source-checks.cjs:128` 주기가 있으면 last와 현재 시각 차이로 stale를 반환한다 | on-demand의 60초 기준이 없다 | 고정 없음 → TASK-D-23 | D00105, D00451 |

공통 최상위 오류의 목표 집합은 `unconfigured/forbidden/timeout/unavailable/invalid_request/not_found/partial/stale/storage_error/cancelled/unsupported`다. 현재 `source-checks.cjs:21–29`는 `connection`, `target`, `query_failed`, `invalid_response`, `response_too_large`, `identity_changed`, `http_*`도 받는다. 기존 상세 코드가 모두 공통 최상위 코드로 정규화됐다고 기록하지 않는다.

### CON-024

관측 시각·오래됨·부분 실패

- 목표: → [RULE-STATE](rules.md#RULE-STATE). 신규 상태·저장 시각은 ISO8601 UTC다. 예전 evidence의 관측 시각을 새 receivedAt으로 바꾸지 않는다. → [RULE-STATE](rules.md#RULE-STATE). → [RULE-STATE](rules.md#RULE-STATE). 연결 확인 성공은 lastSuccessAt·observedAt을 갱신하지 않는다. GitOps의 ‘감시 중’ 옆에는 같은 대상의 lastSuccessAt을 표시한다(SRE-Q-21, D00105). 성공 시각이 없으면 ‘감시 중’으로 표시하지 않으며 시각 생략이나 probe 시각 대체는 실패다. 데이터가 실제로 새로 들어왔을 때만 오래됨을 해제한다. 실패 상태가 우선이어도 이전 성공 시각과 값의 오래됨을 숨기지 않는다. → lastSuccessAt·observedAt이 probe 시각으로 바뀌거나 오래된 값이 ready로 복구되면 실패
- 현재: `desktop/reads/source-checks.cjs:19,123`은 factor 2·probe 분리를 쓰지만 null interval에는 시간 stale 판정이 없다. observedAt은 요청 시작이고 저장에는 epoch ms at도 남는다.
- 차이: 주기 없는 출처에는 60초 stale 판정이 없고 observedAt은 원본 표본 시각 대신 요청 시작 시각이다. TASK-D-24
- 고정 장치: 고정 없음 → TASK-D-24
- 점검: → [RULE-STATE](rules.md#RULE-STATE). 이때 probe만 성공해도 lastSuccessAt=t0, stale을 유지한다. 실제 데이터 성공 뒤 ready로 복구한다. 403·timeout 뒤 이전 lastSuccessAt은 그대로다. sample timestamp·범위·단위 변환을 같은 절대 구간 원본과 대조한다. 0 표본·1 표본·누락 구간에서 합성값 0개다.
- 출처: D-USR-2026-11-16-7; D00105, D00451

### CON-025

UID 교체 중 완료되는 이전 응답

- 목표: old UID의 값 7 응답을 보류하고 target을 new UID로 바꾼 뒤 old를 완료한다 → 출처 요청 시작 때 UID와 대상 세대 및 클러스터 해제 세대를 고정한다. 대상이 바뀌면 이전 성공·coverage를 현재 대상으로 승계하지 않고 unknown/identity_changed와 previous를 반환한다. 이전 UID의 늦은 성공은 현재 값으로 반환하지 않는다. 새 UID의 실제 데이터 읽기 전 ready는 금지한다. 연결 해제 뒤의 완료도 출처 상태를 부활시키지 않는다. → new를 실제 읽기 전에 값 7 또는 ready를 반환하거나 release 뒤 출처 상태가 부활하면 실패
- 현재: `apps/wake/desktop/reads/source-checks.cjs`의 track은 요청 시작 UID·대상 세대·해제 세대를 고정한다. 늦은 이전 UID 성공은 identity_changed, forget 뒤 성공은 cancelled로 거절한다. `apps/wake/pages/cluster-home.js`는 출처만 갱신돼도 이미 보관한 시리즈의 UID를 대조해 지우며, 진행 중이던 옛 시리즈가 완료될 때도 현재 출처와 다시 대조한다.
- 차이: 알려진 UID overlap·이전 요청 실패·UID 왕복·forget 성공 및 홈 출처 갱신 뒤 보관 시리즈 무효화는 반례 시험을 통과했다. 최초 UID 미확정·UID 조회 실패·close 도중 완료와 실제 Service UID 교체는 TASK-D-25에 남는다. 이번 홈 변경의 Electron 확인은 H-009에 남는다.
- 고정 장치: `apps/wake/desktop/reads/reads.test.cjs`의 source_states_overlap_success/failure/roundtrip_does_not_publish_previous_uid, source_states_forget_pending_read_rejects_value_and_does_not_revive_state, hub_reads_overlap_returns_identity_changed_until_new_target_data_arrives. `apps/wake/pages/source-state-pages.test.mjs`의 home_identity_changed_drops_previous_metric_values, home_source_uid_change_invalidates_saved_and_inflight_series. 허브 실행은 [H-003](tasks.md#H-003-run), 출처 갱신 반례는 [묶음 1 수정](tasks.md#batch1-fixes)이다.
- 점검: old에서 값 7 읽기 → old의 다음 응답 보류 → targetOf를 new로 변경 → hub.sources에서 unknown/previous → old 완료 순서를 실행한다. new를 읽은 횟수 0인 동안 new/ready 또는 값 7은 0회다. new의 값 9를 실제 읽은 뒤만 ready다. old 실패·old→new→old 왕복·release 도중 완료도 검사한다.
- 출처: D-USR-2026-11-16-7; D00093, D00114

### CON-026

여섯 화면의 연결 상태 일관성

- 목표: → [RULE-CHIPS](rules.md#RULE-CHIPS). 연결 근거가 있어 포함하는 것과 현재 건강, 실제로 열 수 있는 것을 분리한다. 저장된 정상 이력이 현재 허브 실패를 덮지 않는다. 같은 UID의 Endpoints 403·일시 실패는 연결 근거를 지우지 않지만 정상 건강이나 검증된 binding으로 만들지 않는다. 성공한 빈 열거·다른 UID는 예전 찾기 근거를 무효화한다. 열거 자체 실패는 빈 성공으로 바꾸지 않는다; 
- 현재: `apps/wake/data/conn-view.js`는 같은 UID의 unverified 근거를 유지하고 다른 UID의 저장 연결을 배제한다. 도구 상세·목록·설정·홈·인시던트 재시도는 refresh를 전달하며 `desktop/reads/index.cjs`는 명시적 재시도에서 주기 제한을 건너뛰고 확인 완료를 기다린다. 실제 화면 범위는 H-002에 기록한다.
- 차이: 실제 Endpoints 403과 Service UID 교체는 H-002-N1에 남는다. reader RBAC는 변경하지 않는다. TASK-D-26의 종료는 이 실제 검증 뒤 판정한다.
- 고정 장치: `apps/wake/tool-surfaces.test.mjs`의 실패·회복·동일 UID·새 UID·인시던트 반례와 `apps/wake/desktop/reads/reads.test.cjs`의 명시적 재시도·대상별 확인 이력 시험.
- 점검: 정상 찾기 → 같은 Service UID의 Endpoints 403 → 회복을 여섯 화면에서 검사한다. 포함은 유지, 건강은 권한/오류, 열기 가능은 현재 binding 기준이다. 다른 UID·성공 빈 목록은 찾기 근거를 해제한다. 허브 오류·열거 오류·미관측·실패 시도만 있는 도구·연결 기록만 있는 도구의 조합에서 화면별 판단 차이 0이다. 다시 시도는 캐시된 실패만 돌려주지 않는다.
- 출처: D-USR-2026-11-16-7; D00449, D00454, D00978, D00999

### CON-027

조사 대상과 불변 근거

- 목표: Event 발생을 선택한 뒤 반복 시각을 갱신하고 로그·근거·보고서로 이동한다 → 화면 이동과 근거 저장에는 cluster/context, namespace, kind, UID, source ID, 선택한 절대 시각·구간을 전달한다. Event의 반복 갱신이 사람이 선택한 발생 시각을 바꾸지 않는다. Event에서 로그로 갈 때 같은 Pod UID·컨테이너·선택 시각 전후 5분을 연다. 이름 기반 연결만 가능한 자료는 이름 기준이라고 표시하고 UID 연결로 승격하지 않는다. 같은 근거 identity는 저장 번호·원본 hash·관측 시각을 덮지 않는다. 현재 상태로 과거 이력을 합성하지 않는다. → 선택 UID·발생 시각·전후 5분 구간·snapshot hash가 바뀌거나 이름 연결을 UID 확인으로 표시하면 실패
- 현재: `desktop/incident-hub.cjs:108`은 identity hash로 cite를 재사용하지만 :125,157의 일부 context·Event 연결은 이름 기준이다. pod-logs.cjs는 전후 UID를 확인하며 gitops-incident.cjs는 삭제된 상태다.
- 차이: incident-hub의 일부 context·Event 조인은 이름 기준이라 동일 이름의 재생성 UID를 분리할 수 없다. TASK-D-27
- 고정 장치: 고정 없음 → TASK-D-27
- 점검: Event count·lastTimestamp 갱신 뒤 이전 선택 시각의 로그·보고서가 같은 구간을 연다. 같은 이름의 새 Pod가 생겨도 과거 근거의 UID는 바뀌지 않는다. 동일 incident/kind/query/window/target을 재수집하면 같은 근거 번호이고 저장된 결과 hash가 같다. 시간·대상이 다른 근거는 별도 번호다. 뒤로 이동하면 기간·필터·선택 행을 복원한다.
- 출처: D-USR-2026-11-16-7; D00066, D00093, D00094, D00110, D00452

### CON-028

시도와 집계의 소유

이전 CON-028의 GitOps 조항은 CON-028-GITOPS, 비용 조항은 CON-028-COST로 나눈다. 두 규칙의 작업 ID는 TASK-D-28을 유지한다.

### CON-028-GITOPS

배포 시도와 현재 관측

- 목표: 같은 Application UID·revision의 실패 후 재시도와 operation/history 성공 중복을 입력한다 → Application UID·revision·attempt로 적용 시도를 구분한다. 같은 revision의 재시도는 별도 기록이며 같은 성공 시도가 operationState/history에 겹친 경우만 합친다. Synced·Healthy·현재 관측·과거 성공을 각각 판단한다. 제안(OPEN-CON-028-GITOPS): attempt 키는 UID·순서 있는 revision 배열·시작/완료 시각으로 만들고 원본 attempt ID가 있으면 함께 보존한다. → 재시도가 사라지거나 이전 성공이 현재 실패를 덮거나 revision 배열 순서가 바뀌면 실패
- 현재: `desktop/gitops-deployment.cjs:21`은 operation/history 성공 중복과 이전 재시도를 구분한다. 설정만 바뀐 rollout의 빈 diff는 LAB P5의 과거 미해결 관측이다.
- 차이: 동일 성공 시도 병합은 구현돼 있다. 설정만 바뀐 rollout의 실제 diff가 비는 원인은 현재 코드만으로 확정되지 않았다. TASK-D-28
- 고정 장치: `apps/wake/desktop/gitops-deployment.test.cjs` — `argoDeployment keeps one row for the same successful attempt and preserves a prior retry of that revision`; `apps/wake/desktop/gitops-deployment.test.cjs` — `argoDeployment keeps source revisions ordered and rejects scalar fallback for multiple sources`; `apps/wake/desktop/gitops-deployment.test.cjs` — `fluxDeployment preserves controller history and keeps inventory without UID unlinked`
- 점검: 동일 revision 이전 성공·새 실패·재시도를 각각 보존한다. 시작·완료·revision이 같은 성공만 1행이다. multi-source revision 순서는 유지하고 UID 없는 Flux inventory는 정확한 리소스 링크를 만들지 않는다. 현재 관측의 갱신 지연은 CON-024를 따른다.
- 출처: D00105, D00106, D00453, D00622. 짧은 원문은 끝 대응표를 따른다.

### CON-028-COST

비용 합계와 이름 기반 자료

- 목표: 같은 cluster·기간·통화의 namespace/workload/Pod 집계와 UID 없는 OpenCost를 읽는다 → 같은 cluster·절대 기간·집계 계층·통화·가격 기준의 한 결과에서 합산한다. namespace·워크로드·Pod를 중복 합산하지 않고 유휴·미할당을 별도 보존한다. 미제공 수치는 빈값이며 coverage가 불충분한 기간 비교는 거절한다. UID 없는 OpenCost는 이름 기준을 표시하고 과거 인스턴스가 섞인 값을 현재 Pod의 확정 비용으로 표시하지 않는다. 초기 범위는 Kubernetes 할당 추정이고 실제 청구액은 검증된 별도 연결에서만 추가한다. → 여러 계층을 중복 합산하거나 미제공 비용을 0으로 만들거나 과거 이름 비용을 현재 UID 확정값으로 표시하면 실패
- 현재: `data/costs.js:8`의 costValue와 `desktop/services.cjs:332`에 비용 읽기 경로가 있으나 현재 같은 원본 합계·UID 없는 과거 인스턴스 혼합 검증은 없다.
- 차이: costValue는 숫자와 통화만 받으므로 UID 없는 과거 allocation을 현 Pod 확정값과 구분할 정보가 없다. TASK-D-28
- 고정 장치: 고정 없음 → TASK-D-28
- 점검: 같은 출처·통화·가격 기준·수집 범위에서만 이전 기간을 비교한다. 미설정·권한 없음·조회 실패·일부 집계·최신을 CON-023으로 구분한다. 인시던트에서 같은 기간 비용을 열어도 시간상 겹침을 인과 관계로 표시하지 않는다. 같은 대상·기간 링크는 CON-027을 따른다.
- 출처: D00066, D00109, D00110, D00111, D00115, D00449. 짧은 원문은 끝 대응표를 따른다.

### CON-029

검증 입력과 합격 기준

- 목표: 경로별 동일 사건 반복·응답 역전·재시작·실패 회복을 24시간 상당으로 재현한다 → 경로별 중복 키, 판정 창, 저장 위치, 시험 이름을 함께 고정한다. 고정 장치가 없는 항목은 완료로 올리지 않는다. 같은 사건 반복·응답 역전·재시작·실패 후 회복을 각각 검증한다. 인시던트 1·감사 1·실행 1·PR 1·알림 1은 하나의 허용된 논리 사건별 기대값이다. 승인/실행/검증의 다른 감사 사건까지 하나로 줄이지 않는다. 실제 외부 실행 미구현은 기대 횟수를 0으로 낮춰 PASS시키지 않는다. → 논리 사건별 중복이 남거나 실행 미구현을 기대 0회로 낮춰 PASS하면 실패
- 현재: `desktop/reads/reads.test.cjs:110`은 Event 7일 보관을 검사한다. watch·실제 PR·24시간 중복 계수·현재 Electron/클러스터 실패 유도 결과는 없다.
- 차이: Event 보관 계약 시험은 있으나 watch·실제 PR·24시간 중복 계수를 합친 실행기가 없다. TASK-D-29
- 고정 장치: 고정 없음 → TASK-D-29
- 점검: Event 10회 갱신, 알림 재전송, watch 410, 감지 동시 3회, 앱 재시작, 두 창·복수 전송 경로의 동일 제안을 모두 검사한다. 24시간 가속 실행 뒤 경로별 저장소의 논리 키 중복 행은 0이다. 실제 화면 변경은 다크·라이트 × 1280·1680에서 정확한 route/context/UID/시각을 캡처 전후 확인하고 끝까지 스크롤한다. 허용된 실제 클러스터에서 실패·회복을 확인하며 대역 계약 시험과 별도 표기한다. 사용자 판단을 바꾸는 major 0을 묶음 통과 조건으로 삼고 minor는 남긴다.
- 출처: D-USR-2026-11-16-7; D00114, D00115, D00457, D01025, D01050

### CON-030

대화 목록 조회 실패와 빈 목록

- 목표: 대화 목록 A를 보류하고 B를 완료한 뒤 A 실패를 전달하며 공급자 연결만 변경한다 → 대화 목록의 읽기 상태는 모델 공급자 연결 상태와 별개다. 대화 목록의 내부 conversationRead는 서비스 없음 unconfigured, 조회 중 loading, 성공 배열 ready(빈 배열 포함), 거절·잘못된 응답 failed를 사용한다. 화면의 성공 빈 배열은 CON-023의 empty로 표시한다. 내부 읽기 코드 ready를 빈 대화가 존재한다는 화면 상태로 해석하지 않는다. 실패 때 기존 대화 목록을 유지하더라도 최신 정상 결과로 표시하지 않는다. 시작·사이드바·보관함은 같은 읽기 상태를 소비한다. 동시에 요청한 목록의 오래된 응답이 최신 목록을 덮지 않는다. → A가 B의 conversationRead를 덮거나 공급자 연결을 목록 조회 성공으로 표시하면 실패
- 현재: `ai-hub.js:21`의 refreshConversations는 목록 실패와 빈 배열을 구분하고 이전 배열을 보존하지만 refreshConversations에 요청 세대 검사가 없다.
- 차이: refreshConversations는 응답 세대를 검사하지 않아 늦은 목록 응답이 conversationRead를 덮을 수 있다. TASK-D-30
- 고정 장치: 고정 없음 → TASK-D-30
- 점검: 저장 대화가 있을 때 목록 실패를 주입하면 대화 없음 대신 읽기 실패가 보인다. 실제 빈 배열 성공에만 대화 없음이다. 실패 → 재시도는 실제 서비스 재호출이며 모델 연결 여부와 무관하게 성공한다. 목록 A 지연 → B 성공 → A 완료에서 B 결과 유지다.
- 출처: D-USR-2026-11-16-7; D00984

## 다시 실행할 확인 명령

Q1은 1차 초안의 경계 시험 기록이다. 당시 결과는 57개 통과, 실패·취소·건너뜀 0이며 코드 변경 없이 격리 임시 자료를 사용했다고 기록되어 있다. 현재 소스 대조는 이 시험 결과의 재실행이 아니다. 대역 공급자·계약 입력을 사용한 결과이며 실제 클러스터·Electron 판정이 아니다.

```sh
node --test --test-concurrency=1 apps/wake/desktop/reads/reads.test.cjs apps/wake/desktop/hub.test.cjs apps/wake/desktop/ai-target.test.cjs apps/wake/desktop/pod-logs.test.cjs apps/wake/data/incident-detect.test.mjs apps/wake/data/alerts.test.mjs apps/wake/data/conn-view.test.mjs apps/wake/data/live.test.mjs kit/core/live.test.mjs
```

Q2는 저장·대화·화면 응답 변경 때 해당 소유자가 실행할 추가 기존 시험이다. 2차 실행 결과로 보고하지 않는다.

```sh
node --test --test-concurrency=1 apps/wake/ai-hub.test.mjs apps/wake/ai-target-flow.test.mjs apps/wake/start-conversations.test.mjs kit/shell/panel-engine.test.mjs apps/wake/pages/resource-pages.test.mjs apps/wake/pages/cluster-home.test.mjs apps/wake/desktop/gitops-deployment.test.cjs apps/wake/tool-surfaces.test.mjs
```

새 계약 시험은 각 CON의 수용 기준을 그대로 재현한다. 아직 없는 시험 파일에 실행 가능한 것처럼 명령을 붙이지 않는다. 외부 B1/U-01 재현은 해당 보고의 실행 사본·ROOT·의존성 계약을 읽은 후 사용한다. 과거 고정본만 통과시켜 현재 코드 통과로 기록하지 않는다.

## 충돌과 회귀 처리

| 충돌·회귀 | 채택하는 계약 | 현재 상태·고정과 후속 작업 |
|---|---|---|
| Event UID 병합과 대상 UID/reason/message 병합 | 원본 Event 재수신 제거와 논리 사건 묶음을 구분한다. 원본 식별자를 버리지 않는다 | CON-007. 정규화 버전·별개 사건 경계는 TASK-D-07 |
| 해결 뒤 새 인시던트와 repeat | PERF 초안의 repeat를 채택 목표로 두되 현재 새 ID 동작을 구현 완료로 쓰지 않는다 | CON-011. 최대 간격·이전 정책은 TASK-D-11 |
| “감사 1”과 승인·실행·검증의 독립 사건 | 동일 요청의 동일 단계만 한 행이다. 다른 사건은 각각 보존한다 | CON-013/014/029 |
| 모든 전송 경로의 승인 중복 시험과 [RULE-AI](rules.md#RULE-AI) 적용 | 외부 propose 재전송은 합치고 외부 직접 approve/execute는 거절한다. 사람의 두 창 결정은 첫 결과 유지 | CON-014/017. 권한을 넓혀 시험을 통과시키지 않는다 |
| 클라이언트 날짜 ID와 명시적 conversation ID | PLAN 08의 299–300행 최신 계약을 사용한다. 날짜 추정은 복원하지 않는다 | CON-019. 엔진 재열기 시험 유지 |
| 허브 이력 우선과 첫 질문 유실 | 저장본이 없을 때 마지막 assistant를 저장 완료 경계로 삼지 않는다 | CON-021. H-001 메인 프로세스 반례 해소, 실제 앱은 H-009 미검증 |
| UID 순차 교체 통과와 겹친 읽기 실패 | 요청 시작 UID·세대를 고정하고 현재 UID에 옛 응답을 붙이지 않는다 | CON-025. 현재 방어 코드 있음, 독립 재판정 필요 |
| probe 성공과 데이터 신선도 | checkedAt과 lastSuccessAt을 분리한다 | CON-024. stale/probe 계약 시험 |
| 과거 연결 근거와 현재 건강 | [RULE-CHIPS](rules.md#RULE-CHIPS)의 포함·건강·열기 판정 적용 | CON-026. T1-4 이후 코드 수정과 전체 PASS를 구분 |
| 동점 알림 순서 | 행 집합과 행 순서 모두 검사하고 안정된 두 번째 키를 둔다 | CON-009. U01-3 minor는 U-28 작업 |
| 예전 적용·인시던트 연결 코드 삭제 | HIST의 기능 이력은 이전 존재 근거다. 현재 `gitops-incident.cjs`, `event-processing.js`의 삭제를 현재 기능 보존으로 해석하지 않는다 | CON-007/027. 현재 대체 경로로 검증 필요 |
| 짧은 timeout 지적과 무제한 요청 | 연결 UI의 대기·재시도와 백엔드 자원 상한을 구분한다. 현재 20초는 관측된 읽기 구현값이며 사용자 승인된 모든 경로 SLA가 아니다 | CON-003/004. D00013은 질문, D00036은 개선 요구로 반영 |

## tasks.md 인수 목록

이 표는 다른 영역 파일을 수정하지 않고 인수할 작은 작업을 명시한다. 각 작업의 자동 확인은 대응 CON의 수용 기준과 Q1/Q2의 관련 파일만 먼저 실행한다. 새 시험이 필요한 항목은 구현과 같은 변경에서 추가한다.

| 작업 ID | 스펙 ID | 고칠 경로 | 선행·화면 확인 |
|---|---|---|---|
| TASK-D-21 | CON-021 | desktop/ai-run.cjs, ai-hub.js, ai-target.test.cjs, ai-target-flow.test.mjs | H-001 메인 프로세스 수정 완료. 모델 호출 전 저장·취소 보존과 H-009 실제 앱 검증은 남음 |
| TASK-D-25 | CON-025 | desktop/reads/source-checks.cjs, reads/reads.test.cjs | U-01 overlap 재판정. UID 교체 화면 필요 |
| TASK-D-26 | CON-026 | data/conn-view.js, data/index.js, tool-surfaces.test.mjs, pages/tool-detail.js | T1의 여섯 화면 실패·복구 필요 |
| TASK-D-06 | CON-006 | desktop/hub-store.cjs, hub.test.cjs | U-04 선행, 저장 소비 화면 오류 확인 |
| TASK-D-01 | CON-001 | desktop/reads/index.cjs, reads/cluster.cjs, data/index.js | scope·취소 키 결정. 호출 수와 화면 네 개 확인 |
| TASK-D-02 | CON-002 | pages/resource-list.js, resource-detail.js, logs.js, cluster-home.js, reads/source-checks.cjs | 요청 세대 계약. 대상·필터 전환 화면 필요 |
| TASK-D-03 | CON-003 | kit/core/service.js, desktop/services.cjs, ai-hub.js, desktop/ai-run.cjs | 요청 소유권·공유 자원. 중지·탭 이동 화면 필요 |
| TASK-D-04 | CON-004 | desktop/hub-server.cjs, mcp-stdio.cjs, reads/index.cjs, ai-hub.js | 부하 측정 후 상한 결정. 상태 표시 바뀌면 화면 필요 |
| TASK-D-05 | CON-005 | desktop/incident-hub.cjs, hub.cjs, reads/index.cjs | CON-001. force·주기 겹침 자동 확인 |
| TASK-D-07 | CON-007 | desktop/reads/events.cjs, data/incident-detect.js, pages/events-view.js | CON-006. Event 10회·역전·행 위치 화면 필요 |
| TASK-D-08 | CON-008 | desktop/k8s.cjs, reads/index.cjs, reads/events.cjs | watch 채택 경로 결정. 재목록 실패 화면 필요 |
| TASK-D-09 | CON-009 | desktop/reads/alerts.cjs, data/alerts.js, alerts.test.mjs | CON-006. 재발·Watchdog·동점 정렬 화면 필요 |
| TASK-D-10 | CON-010 | data/incident-detect.js, desktop/incident-hub.cjs | 5a/U-33, UID 이전. LAB 대상 화면 필요 |
| TASK-D-11 | CON-011 | data/incident-detect.js, incident-model.js, desktop/incident-hub.cjs | CON-010, repeat 간격 결정. 재발·복구 화면 필요 |
| TASK-D-12 | CON-012 | kit/core/service.js, kit/page/boot.js, kit/desktop/preload-page.cjs, ai-hub.js | 문서 소유권. 네이티브 탭 수명 확인 |
| TASK-D-13 | CON-013 | desktop/hub-tools.cjs, hub-store.cjs, approvals.cjs | U-05, CON-006. 감사 목록·상세 확인 |
| TASK-D-14 | CON-014 | desktop/approvals.cjs, hub-store.cjs, services.cjs | U-36, CON-006/013. 두 창 승인 화면 필요 |
| TASK-D-15 | CON-015 | desktop/approvals.cjs 및 5c가 소유하는 Git 연결 경로 | U-37, CON-014. 시험 Git PR 끝까지 확인 |
| TASK-D-16 | CON-016 | desktop/hub.cjs, app.config.js, kit/shell/panel-engine.js | CON-011/013. 토스트·시스템 알림 확인 |
| TASK-D-17 | CON-017 | desktop/hub-server.cjs, hub-tools.cjs, approvals.cjs, mcp-stdio.cjs | U-06, CON-006/013. 승인 요청 표시 확인 |
| TASK-D-18 | CON-018 | desktop/pod-logs.cjs, pages/logs.js, pages/log-card.js, CLI 전달 경로 | 원본/대역 경계 구분. 스크롤·새 줄 화면 필요 |
| TASK-D-19 | CON-019 | desktop/ai-run.cjs, ai-hub.js, kit/shell/panel-engine.js | 기존 ID 계약 유지. 재열기 화면 필요 |
| TASK-D-20 | CON-020 | desktop/ai-run.cjs, hub-store.cjs, ai-hub.js | CON-006/019/021. 동시 두 대화 창 확인 |
| TASK-D-22 | CON-022 | desktop/ai-run.cjs, ai-target.test.cjs | B1 minor. 실패한 근거의 링크 없음 확인 |
| TASK-D-23 | CON-023 | desktop/reads/index.cjs, source-checks.cjs, hub-tools.cjs, kit/core/live.js | U-01/U-03. 소비 화면 S1–S7 필요 |
| TASK-D-24 | CON-024 | desktop/reads/source-checks.cjs, metrics.cjs, kit/core/clock.js | U-02, 원본 시각 계약. 과거·stale 화면 필요 |
| TASK-D-27 | CON-027 | desktop/incident-hub.cjs, pages/resource-detail.js, events-view.js, incident-report-doc.js | 5a/5b. Event→로그→보고서 왕복 필요 |
| TASK-D-28 | CON-028 | desktop/gitops-deployment.cjs, data/costs.js, desktop/services.cjs | 4b/5b·비용 담당. 동일 시도·비용 원본 대조 |
| TASK-D-29 | CON-029 | 각 계약 시험과 kit/tools의 중복 계수 도구(신규 경로는 담당자가 확정) | 모든 경로 구현 후 24시간 가속·실제 환경 별도 |
| TASK-D-30 | CON-030 | ai-hub.js, start-conversations.test.mjs, app.config.js | CON-002. 목록 실패·복구·역전 확인 |

표의 `desktop/`, `data/`, `pages/`는 `apps/wake/` 아래 경로다. kit 경로는 저장소 루트 기준이다. 위 작업을 다른 단위가 동시에 같은 파일에서 구현하지 않도록 인수 시 파일 소유를 먼저 확인한다.
