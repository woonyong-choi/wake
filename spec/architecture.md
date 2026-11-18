# Wake 허브 아키텍처

영역 F의 구조·경계 정본이다. 예를 들어 Pod에서 AI에게 묻는 요청은 그 Pod를 연 클러스터 context를 유지한 채 메인 프로세스에 도착하고, 허브가 원본을 읽어 마스킹한 결과와 출처를 모델에 전달하며, 같은 대화 ID에 질문·답·실패를 기록해야 한다. 모델 연결이 없었던 첫 질문도 이 계약의 일부다.

이 문서와 [백엔드와 데이터](backend.md)는 함께 읽는다. 구조와 공개 경계는 이 문서, 서비스별 값·저장·최적화는 backend.md가 소유한다. 화면 상세, 보안 정책 전체, 동시성 전체와 개선 루프의 소유권은 각각 다른 영역에 있다.

## 근거와 판정 방식

- `D00000` 형식은 저장소 밖 소유자 결정 기록의 번호이고, 계획 선택 `D-01`은 다른 ID다. `DEC`·`MSG` 같은 약칭도 같은 저장소 밖 기록을 가리킨다.
- 목표는 기존 결정과 D-USR-2026-11-16-1~7의 확정 결정·기본값 채택을 따른다. 질문·붙여넣은 보고는 단독 승인 또는 현재 구현 증거가 아니다.
- 현재는 2026-11-17 작업 트리의 코드 확인이다. 1차에 기록된 시험·캡처·외부 원본 판정은 과거 증거다. 현재 상태의 근거는 소스 대조이며 제품 시험·Electron·실클러스터·모델 실행 결과와 구분한다.
- 구현됨은 경로가 있다는 뜻, 부분은 기능 또는 검증이 빠진 상태다. 고정 없음은 해당 목표 전체를 잠그는 시험·점검·캡처가 없다는 뜻이다. 개별 계약 시험을 전체 제품·실원본 PASS로 올리지 않는다.
- `TASK-F-*`·`T-SEC-*`는 이 세 파일 안의 남은 작업 ID다. tasks.md 등록·착수 승인을 뜻하지 않는다. 공통 상태·표현은 F-ARC-STATE, 대조 오차는 F-BE-022, 실제 검수 관문은 F-BE-024를 참조한다.

## 지켜야 할 규칙

### F-ARC-STATE. 공통 상태·표현·원본 대조 <a id="F-ARC-STATE"></a>

- 목표: → [RULE-STATE](rules.md#RULE-STATE).
- 현재: `apps/wake/desktop/reads/source-checks.cjs:131`의 state가 출처 상태를, `apps/wake/data/conn-view.js:74`의 도구 표시가 읽기 결과를 처리한다. source state와 화면 상태는 별도 변환이다.
- 차이: 읽기 실패와 성공 0건의 소비 화면별 변환이 분산되어 있으며 SourceState enum과 화면 일곱 상태의 공통 변환이 없다.
- 고정 장치: 고정 없음 → TASK-F-03
- 출처: D00451, D00454; 옛 결정 문서 상태 표시·연결 행, 옛 화면 규칙 표·상태.
- 표현: → [RULE-STATE](rules.md#RULE-STATE).
- 시각·검사: → [RULE-STATE](rules.md#RULE-STATE).

## 구성 요소

### F-ARC-001. 데스크톱 메인 프로세스가 허브다 <a id="F-ARC-001"></a>

- 목표: 입력: 허브가 켜진 Electron과 호스트 없는 브라우저에서 incident.list를 요청한다 → 기대: 클러스터 자료의 읽기, 규칙 감지, AI 호출, 근거·감사·대화 저장의 실행 주체는 데스크톱 메인 프로세스다. 별도 관리 서비스의 미병합 HTTP 경로를 제품의 필수 의존으로 두지 않는다. 화면이 요구하는 값이 없으면 백엔드의 남은 일로 남기고 승인된 화면을 축소하지 않는다. → 실패: 브라우저에 합성 사건이 나타나거나 옛 관리 서비스 부재로 Electron 읽기가 막히면 실패.
- 현재: 부분. `apps/wake/desktop/services.cjs:255-274,567-578`이 읽기 및 허브를 구성한다. `apps/wake/desktop/hub.cjs:35-74`가 저장·감지·승인·도구·AI·서버를 조립한다. 옛 관리 서비스 파일은 현재 삭제 상태다. `apps/wake/desktop/services.cjs:30`에 연결 저장·GitOps 조립도 남아 있어 노출 계층이 등록만 한다는 목표까지 달성된 것은 아니다.
- 차이: services.cjs에 연결 저장·GitOps 조립이 남고 hub.cjs가 pages의 보고서 함수를 import한다.
- 고정 장치: `node kit/tools/check-ipc.mjs`의 IPC 노출·호출 검사
- 출처: D00463, D00464, D00467, D00470, D00471, D00734, D00735, D00736, D00917, D00960, D00962, D00965, D00966
- 검사: 렌더러 → 등록된 IPC → 허브 → 원본/저장소 경로를 추적할 수 있다. `agent-management.cjs`, 옛 `incidents.read`, `event.processing*`에 대한 실행 import·등록·호출 0개. 실제 허브가 없는 브라우저에는 출처별 연결 안 됨이 보인다.

| 구성 요소 | 상태와 책임의 소유자 | 실제 위치 | 입력 → 출력 |
|---|---|---|---|
| 데스크톱 호스트 | 창·문서·IPC 송신자, 앱 서비스 단일 소유 | `kit/desktop/main.cjs`, `preload-shell.cjs`, `preload-page.cjs` | 검증된 bridge 요청 → 앱 서비스 결과 |
| 화면·자료 | 표시 상태·필터, 파생 계산 | `apps/wake/pages/`, `apps/wake/data/index.js`, `data/live.js` | 서비스 결과 → kit props; 자격증명 없음 |
| 서비스 조립 | context 클라이언트, 연결 설정, 핸들러 등록 | `apps/wake/desktop/services.cjs` | IPC 이름/인자 → 읽기·허브 호출 |
| 원본 접속 | Kubernetes 인증·HTTP·터널·바인딩 세대 | `k8s.cjs`, `provider-connections.cjs`, `tools.cjs`, `portforward.cjs`, `tool-connect.cjs` | context와 고정 대상 → API 응답 또는 분류한 오류 |
| 읽기 | 시리즈 정의·범위·단위·출처 상태 | `desktop/reads/index.cjs`, `cluster.cjs`, `metrics.cjs`, `alerts.cjs`, `events.cjs`, `network.cjs`, `log-levels.cjs`, `source-checks.cjs` | 서비스 인자 → 실제 값과 출처 계약 |
| 허브 저장 | 마스킹한 JSON/JSONL | `desktop/hub-store.cjs` | 기록 → userData/hub; 현재 동기 파일 I/O |
| 규칙 판단 | 감지·묶기·단계·고정 근거 | `desktop/incident-hub.cjs`, `data/incident-detect.js`, `data/incident-model.js`, `data/ownership.js` | 원본 신호 → 인시던트·조치 계획 |
| 도구 경계 | 23개 입력 스키마, scope, 마스킹, 감사 | `desktop/hub-tools.cjs` | call(name,args,caller) → result/source/masked 또는 error |
| AI 실행 | 모델 선택·호출·도구 반복·대화 | `desktop/ai-run.cjs`, `ai.cjs` | 질문/대상/모델 → 이벤트와 저장 대화 ID |
| 외부 AI | 인증과 전송 변환 | `desktop/hub-server.cjs`, `mcp-stdio.cjs` | MCP·HTTP → 같은 도구 call |
| 승인 | 제안과 첫 사람 결정 | `desktop/approvals.cjs` | propose → waiting; decide → approved/denied; 실행과 별개 |

위 표의 desktop 생략 경로는 모두 `apps/wake/desktop/` 아래다. 목표 의존 방향은 노출 → 판단·읽기 → 원본 접속·저장이다. 현재 `hub.cjs:65-69`는 보고서 생성을 위해 `pages/incident-report-doc.js`를 불러오므로 계층 정리 대상이며, 같은 보고서 계산을 복제해 해결하지 않는다.

### F-ARC-002. kit와 Wake의 경계를 유지한다 <a id="F-ARC-002"></a>

- 목표: 입력: Wake 페이지에서 kit 공개 진입점을 import하고 bridge 요청을 보낸다 → 기대: kit는 제품과 무관한 호스트·셸·페이지·부품·토큰을 소유한다. Wake 정의·Kubernetes 데이터·업무 규칙은 apps/wake에 둔다. 앱은 kit 공개 진입점만 사용한다. kit 문서는 삭제·복제하지 않고 kit 자체 약속의 정본으로 유지한다. → 실패: kit 안에 Kubernetes 판단 코드가 있거나 renderer가 자격 저장소를 직접 읽으면 실패.
- 현재: 부분. 위 경계는 kit 문서와 `kit/desktop/main.cjs:35`·preload·`kit/core/bridge-protocol.js:5`에 존재한다. B1 7차 보고의 정적 검사에는 deps 15, unused 18, reuse 1 실패가 남아 있으며 전체 경계 통과로 쓰지 않는다.
- 차이: kit 공개 경계는 있으나 기존 deps·unused·reuse 실패를 해소한 동일 소스 결과가 없다.
- 고정 장치: `node kit/tools/check-deps.mjs`의 앱과 kit 의존 방향 검사
- 출처: D00467, D00469; 소유자 결정(kit 문서는 kit 자체 문서로 남기고 참조만 한다)
- 검사: `node kit/tools/check-deps.mjs`, `node kit/tools/check-reuse.mjs`, `node kit/tools/check-ipc.mjs` 통과. bridge envelope `{v,type,id,replyTo?,payload}` 검증, 허용 채널과 sender 검증, 렌더러의 Node·자격 접근 0. 구조 정리 후 승인된 화면·동작 유지.

## 처리 흐름

### F-ARC-003. 화면·감지·AI가 같은 원본 접속과 출처 상태를 사용한다 <a id="F-ARC-003"></a>

- 목표: 입력: 같은 context·Pod UID·구간으로 화면 IPC·내장 AI·MCP·HTTP를 조회한다 → 기대: 화면은 자료 키를 요청하고, services는 reads에 전달한다. 인시던트와 AI도 같은 `createHubReads().cluster()`를 사용한다. 같은 출처의 성공·실패·대상 UID를 소비자마다 별도로 만들지 않는다. 공유된 접속 층이 있다는 사실만으로 질의 결과 캐시·중복 제거까지 구현됐다고 하지 않는다. → 실패: 전송 경로만 바꿨는데 Event 보관 범위나 Prometheus 오류가 달라지면 실패.
- 현재: 부분. `apps/wake/desktop/services.cjs:255-274`가 같은 reads 인스턴스를 허브에 넘기고 `apps/wake/desktop/reads/index.cjs:68-70`에서 cluster를 만든다. 그러나 AI `list_events`는 `apps/wake/desktop/hub-tools.cjs:76-80`의 현재 API 목록이고 화면 `events.read`는 7일 보관도 읽는다. AI 지표는 자유 PromQL·31일 구간, 화면은 등록 시리즈·15일 구간이다. `apps/wake/desktop/observability.cjs:690` 별도 읽기도 존재한다.
- 차이: 화면 Event는 7일 보관, AI list_events는 현재 API 목록이다. 지표 범위도 화면 15일·AI 31일로 다르다.
- 고정 장치: 고정 없음 → TASK-F-02
- 출처: D00965, D00966, D00978, D00984, D00987
- 검사: 같은 context·대상 UID·구간으로 화면 IPC/내장 AI/MCP/HTTP를 호출해 값·단위·출처·오류를 대조한다. Prometheus 실패 시 네 경로 모두 실패 출처를 유지한다. `events.read`의 보관 이력과 AI `list_events`가 같은 범위 요청에 다른 계약을 제공하면 완료가 아니다.

### F-ARC-004. 공통 읽기 계약 v1을 경계마다 보존한다 <a id="F-ARC-004"></a>

- 목표: 입력: old UID 요청을 보류하고 new UID 등록 뒤 old 응답을 완료한다 → 기대: 아래 필드를 누락 없이 전달한다. 알 수 없는 값은 null과 reasons를 함께 전달하며 성공한 0으로 대체하지 않는다. 연결 확인은 데이터 수집 시각을 갱신하지 않는다. 교체 전 대상의 늦은 응답은 새 대상의 값·ready·마지막 성공으로 붙이지 않는다. → 실패: old 값이 new의 ready·lastSuccessAt을 갱신하거나 실패가 0으로 반환되면 실패.
- 현재: 부분. `apps/wake/desktop/reads/source-checks.cjs:60-92`에 시작 UID·대상 세대 고정과 `identity_changed` 거절이 현재 존재한다. U-01 3차 고정본의 해당 실패 뒤 수정된 소스이지만 이번 재검증은 없다. `apps/wake/desktop/reads/index.cjs:103-108` 실패의 source는 문자열이고, `apps/wake/desktop/hub-tools.cjs:108`에는 missing/failed 등의 기존 코드가 남아 공통 오류 계약은 완료되지 않았다.
- 차이: 읽기 실패 source가 문자열이고 도구 early error에는 source가 빠진다. UID 세대 거절은 코드에 존재한다.
- 고정 장치: 고정 없음 → TASK-F-03
- 출처: D00451, D00978; 소유자 결정(다른 탭이나 클러스터에서 돌아온 이전 요청은 현재 화면에 반영하지 않는다)
- 검사: 정상 0, 데이터 없음, 한 출처 실패, timeout, forbidden, 2수집주기 경과, UID 교체 중 응답 완료, 해제 뒤 응답 완료를 각각 검사한다. old 요청 보류 → new UID 등록 → old 완료 시 new ready 금지 → new 데이터 수집 후에만 ready. ISO UTC와 epoch ms를 단위별로 대조한다.

| 계약 | 필드·판정 |
|---|---|
| SourceState | `id`, `cluster`(등록 context), `target:{uid,ref}`, `state`, `error`, `observedAt`, `receivedAt`, `lastSuccessAt`, `checkedAt`, `collectionIntervalMs`, `retention`, `coverage`, `reasons`; 호환 `last`,`at`은 ms, 새 시각은 ISO UTC |
| state | `ready/loading/empty/unconfigured/forbidden/partial/stale/error/unknown`. 현재 source-checks가 직접 생성하는 상태와 렌더러 loading/empty를 구분한다 |
| coverage | `{from,to,missingIntervals,partial,truncated}`. 요청 구간·실제 수집 구간과 [RULE-RETENTION](rules.md#RULE-RETENTION)의 보관 기간을 구분한다. 보관 설정만으로 실제 관측 구간을 주장하지 않는다 |
| 시각 | 기존 화면 IPC `from/to` epoch ms, 외부 도구 `window` ISO UTC. Prometheus 초, Loki ns 변환은 접속 adapter. 기존 evidence의 collectedAt을 새 receivedAt으로 덮지 않는다 |
| 오류 목표 | `unconfigured/forbidden/timeout/unavailable/invalid_request/not_found/partial/stale/storage_error/cancelled/unsupported`; raw 메시지·토큰·내부 주소를 반환하지 않는다 |
| 오래됨 | [RULE-STATE](rules.md#RULE-STATE)로 판정한다. 입력은 수집주기·leaseDurationSeconds·coverage·lastSuccessAt·observedAt이며 probe 시각과 구별한다 |
| 대상 교체 | context + source + UID + 요청 세대를 고정한다. previous는 과거 대상임을 밝히고 새 대상 관측과 분리한다 |

### F-ARC-005. 도구 층 하나가 읽기와 제안을 노출한다 <a id="F-ARC-005"></a>

- 목표: 입력: 23개 도구에 정상 인자와 추가 필드·범위 밖 namespace·Secret을 보낸다 → 기대: 아래 23개 도구 이름·입력 스키마를 한 표로 유지하고 desktop/MCP/HTTP에서 공통 `call`을 사용한다. 추가 인자는 거절한다. 외부 AI가 승인·실행 API를 우회 호출할 수 없어야 한다. `set_screen_state`는 표현 상태 변경만 허용하며 실제 조치가 아니다. → 실패: Secret 원본 요청이나 외부 승인·실행 호출이 허용되면 실패.
- 현재: 부분. `apps/wake/desktop/hub-tools.cjs:19-42`의 재귀 검사와 `createToolLayer.call/list`가 단일 표를 쓴다. `inScope`의 screen 예외는 실제 화면의 cluster를 검사하지 않는다. `list_apps` 반환 행·`query_audit` namespace 및 자유 PromQL/LogQL의 상세 scope는 별도 보강이 필요하다. `list_resources/get_resource`는 Secret을 원본에서 읽은 뒤 메타/키만 내보낼 수 있어 최신 D-01과 충돌한다. `apps/wake/desktop/services.cjs:458-461`의 kube.get도 Secret 종류를 원본 GET 전에 막지 않고 sanitize에서 값만 가리므로 D-01 보완 대상이다. 읽기 전용 힌트와 실제 접근 통제는 다르다.
- 차이: Secret 원본 접근 전 거절과 screen·audit·list_apps의 반환 범위 검사가 빠져 있다.
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `the tool layer has the 23 tools, each with a JSON schema, and only propose_action is not read-only`
- 출처: D00466, D00473, D00648, D00660, D00741, D00742, D00965, D00966, D00967, D00980, D00981, D00982, D00987
- 검사: 세 경로의 `name/inputSchema/readOnly` 집합 차이 0, 도구 수 23. 미등록 도구·추가 필드·잘못된 타입·범위 밖 namespace/kind/cluster 거절. 화면·감사·범위 없는 자유 질의도 scope 우회를 허용하지 않는다; [RULE-SECRET](rules.md#RULE-SECRET).

### F-ARC-006. MCP·HTTP 전송과 인증 <a id="F-ARC-006"></a>

- 목표: 입력: MCP만 켠 뒤 같은 토큰으로 MCP·HTTP에 요청하고 토큰을 해지한다 → 기대: 기본 꺼짐인 MCP와 HTTP를 각각 켠다. 서버는 127.0.0.1에만 바인딩하고 클라이언트별 transport와 scope를 검사한다. 토큰 원문은 생성 응답에 한 번만 포함하고 서버에는 SHA-256만 저장한다. 재표시해야 할 클라이언트 비밀은 키체인에 둔다. 승인된 D-02에 따라 자동 포트 배정·실행 endpoint 발견 또는 사람이 명시한 포트를 사용해야 한다. → 실패: 외부 인터페이스에 listen하거나 해지 토큰이 다음 요청에서 통과하면 실패.
- 현재: 부분. `apps/wake/desktop/hub-server.cjs:14-118`에 loopback·기본 꺼짐·SHA-256·timingSafeEqual·Origin 차단이 있다. 현재 기본 포트는 `47821`, MCP protocolVersion은 `2025-06-18`, body 한도는 `1048576`. `apps/wake/desktop/mcp-stdio.cjs:8`는 `WAKE_MCP_URL`/`WAKE_MCP_TOKEN`으로 연결하지만 URL loopback 검증·요청 timeout·대기열 상한은 없다. 자동 포트와 endpoint discovery는 안 됐다. 이는 구현된 프로토콜 표기이며 최신 외부 MCP 표준 적합성 인증이 아니다.
- 차이: 기본 포트 47821이 고정이며 자동 할당·endpoint discovery·stdio 목적지 제한이 없다.
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `the server answers MCP and the HTTP API only with a client token of that transport, only on 127.0.0.1`
- 출처: D00965, D00966
- 검사: 외부 인터페이스 리슨 0, 경로 꺼짐 503, 토큰 없음 401, 다른 transport 403, Origin 포함 403. 토큰 제거 즉시 거절, API/MCP 결과 동일. 제안 상한 1MiB 초과 요청 거절. 포트 충돌·앱 재시작·stdio 재연결을 실제 endpoint로 검사한다.

| 경로 | 실제 요청·응답과 실패 |
|---|---|
| `POST /mcp` | JSON-RPC 2.0; `initialize`, `ping`, `tools/list`, `tools/call`; notification은 202. batch는 현재 Promise.all. 알 수 없는 method `-32601`, 잘못된 요청 `-32600` |
| `GET /api/v1/tools` | `{tools:[{name,description,inputSchema,readOnly}]}` |
| `POST /api/v1/tools/<name>` | 본문이 인자. 성공 `{result,source,masked}`. forbidden 403, invalid_request 400, unknown_tool/missing 404, unconfigured 503, 그 밖 502 |
| `GET /api/v1/audit` | from/to 미지정 시 최근 24시간; incident/transport/tool 조건을 query_audit로 전달 |
| stdio | 한 줄 JSON-RPC를 /mcp로 전달. JSON 파싱 실패 `-32700`; 허브 연결 실패 `-32000`; 토큰 없으면 stderr 안내 후 exit 2. 토큰 값은 출력하지 않는다 |

### F-ARC-007. 모델 공급자와 대화 엔진 <a id="F-ARC-007"></a>

- 목표: 입력: 등록 context와 미등록·1025자·null target으로 ai.run을 요청한다 → 기대: 모델 호출은 메인 프로세스에서만 한다. API 키·구독 CLI 연결을 서로 구분하며, 키 검증 성공을 대화 실행 지원으로 표시하지 않는다. 등록된 context ID를 검증한 target을 JSON 데이터로 직렬화한다. 미등록·과도한 길이·명시 null/false/0/빈 문자열 target은 모델 호출 전에 거절하고 질문·실패를 저장한다. target을 잘라 다른 등록 context로 바꾸거나 전역 scope로 조용히 바꾸지 않는다. → 실패: 거절 입력이 모델에 전송되거나 전역 context로 바뀌거나 질문이 저장되지 않으면 실패.
- 현재: 부분. `apps/wake/desktop/ai-run.cjs`에 target 검증·직렬화·거절 저장이 있다. 실행 공급자는 Claude API(POST /v1/messages 120초·max_tokens 2048, 도구 반복 최대 8회, 도구 결과 최대 60000자)와 연결한 구독 CLI 셋(`apps/wake/desktop/ai-cli.cjs`: claude·codex·gemini를 비대화로 한 번, Wake 도구만 실행 전용 MCP로, 300초, 도구 호출 최대 24회)이다. 두 길은 같은 useTool(단계·도구 층·승인·감사)을 쓴다. Ollama는 지웠다(D-USR-2026-11-17-11). `apps/wake/desktop/ai.cjs`는 OpenAI·Google 키 확인도 하지만 runner가 실행하지 않는다.
- 차이: OpenAI·Google API 키 확인을 실행 지원과 분리해야 한다. 이 Mac의 Gemini CLI는 계정 등급 오류(IneligibleTierError)로 인증 단계에서 끝나 실제 대화는 확인하지 못했다([H-009 AI 공급자](tasks.md#H-009-ai-cli)).
- 고정 장치: `apps/wake/desktop/ai-target.test.cjs` — `an unregistered or malformed target is refused before any model call, the person is told, and the conversation keeps the refusal`
- 출처: D00466, D00473, D00742, D01000
- 검사: SEC-013의 제안 길이 상한을 적용하며 등록된 ARN·슬래시 포함 context 유지; 미등록/1025자/제어 문자/falsey 명시 target의 모델 호출 0회·거절 기록 1개. 공급자별 실제 모델 목록→질문→도구 호출→답→실패→재시작 재조회 확인. API 키 확인만 한 공급자는 실행 완료로 세지 않는다.

### F-ARC-008. 대화 ID와 기록의 정본 <a id="F-ARC-008"></a>

- 목표: 입력: 모델 없이 첫 질문을 보낸 뒤 공급자를 연결하고 같은 대화에 후속 질문을 보낸다 → 기대: 대화 ID는 허브가 돌려준 ID를 클라이언트가 보존해 후속 요청에 보낸다. 날짜나 질문에서 재구성하지 않는다. 허브 저장 기록이 정본이고 오래된 창의 사본이 기존 말을 삭제하면 안 된다. 최초 모델 미설정, 거절, 도구 호출 뒤 공급자 실패에도 질문·부분 답·error/message·steps·refs를 저장한다. 조회·재열기·같은 대화 후속 질문에서 실패가 빈 답이나 성공으로 바뀌지 않는다. → 실패: 재조회에서 첫 질문·실패가 사라지거나 대화 ID가 바뀌면 실패.
- 현재: 부분. `apps/wake/desktop/ai-run.cjs`는 저장본 우선·최초 no-model 질문과 실패 답 저장을 구현한다. `apps/wake/desktop/ai-target.test.cjs`의 공급자 미설정·복구 시험이 통과했다. 도구 실패 여부와 무관하게 인시던트를 used에 더하는 minor는 남아 있다. `apps/wake/desktop/ai-run.cjs`의 archive/restore/remove와 services.cjs의 ai.chat을 연결했다. H-001-F1의 격리 저장소·화면 action 시험으로 보관·복원·삭제와 늦은 답의 재생성 방지를 확인했다. Electron은 미검증이다.
- 차이: 보관·복원·삭제의 코드 결함은 H-001-F1에서 수정했다. 실제 화면 검수는 TASK-SCREEN-SETTINGS-ARCHIVE와 TASK-SCREEN-DIALOG-CHAT-DELETE에 남는다.
- 고정 장치: `apps/wake/chat-lifecycle.test.mjs` — archive_restore_remove_persist_same_id_and_preserve_audit, run_finishing_after_archive_or_delete_does_not_undo_the_change, chat_actions_use_service_before_success_and_delete_only_after_confirmation; 실패 보존은 `apps/wake/desktop/ai-target.test.cjs`. 동시 후속 질문은 TASK-F-09에 남는다.
- 출처: D00316, D00466, D00470, D00471, D00473, D00734, D00742, D00984
- 검사: ① 공급자 없음 첫 질문 ② 연결 복구 ③ 같은 대화 후속 질문 ④ 모델 입력과 디스크·재조회에 질문 둘 다 존재. 재열기 ID=요청 ID=저장 ID. 오래된 사본 A/B의 질문·답 쌍 보존; [RULE-EVIDENCE](rules.md#RULE-EVIDENCE). 보관/삭제 요청은 실제 runner 메서드와 이어진다.

### F-ARC-009. 승인·실행·복구는 서로 다른 사건이다 <a id="F-ARC-009"></a>

- 목표: → [FLOW-APR-001](flows/approval-execution.md#FLOW-APR-001); [RULE-APPROVAL](rules.md#RULE-APPROVAL).
- 현재: 부분. `apps/wake/desktop/approvals.cjs:21-55`는 소유 관계 계획·waiting·첫 결정·감사를 저장한다. PR 길은 토큰 존재에 따라 pending/github-unconnected만 기록하며 PR 생성 HTTP 호출이 없다. propose는 매번 UUID이므로 동일 요청 재시도 멱등도 없다. L1 P6이 현재 코드와 일치한다.
- 차이: 승인 첫 결정은 보존하지만 실제 PR 생성 호출과 제안 재시도 멱등 키가 없다.
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `approvals keep the first decision, never run anything, and record a Draft PR that cannot be made without GitHub`
- 출처: D00466, D00473, D00648, D00869, D00912, D00986
- 검사: → [FLOW-APR-001](flows/approval-execution.md#FLOW-APR-001); [RULE-APPROVAL](rules.md#RULE-APPROVAL).

### F-ARC-010. 에이전트는 필요한 읽기 캐시와 heartbeat만 맡는다 <a id="F-ARC-010"></a>

- 목표: 입력: wake-agent 설치 후 Node·Pod watch 재연결과 Lease 만료를 관측한다 → 기대: DaemonSet 이름은 wake-agent다. Node·Pod watch 캐시와 heartbeat를 제공하며 관리 서비스 설치·관리 계정·정책 동기화·근거 작업 폴링을 되살리지 않는다; [RULE-SECRET](rules.md#RULE-SECRET). 설치부터 실제 Lease·이미지 digest까지 제품 검증에 포함한다; 실패: 만료 Lease가 정상 heartbeat이거나 Secret 권한·관리 서비스 설치가 포함되면 실패.
- 현재: 부분. `apps/wake/agent/agent.mjs:53-69,91-129,133-170`은 Node·Pod list/watch와 Lease 갱신을 구현한다. `apps/wake/desktop/agent-heartbeat.cjs:42`와 설치 차트가 존재한다. 현재 설치본과 imageID는 이번에 확인하지 않았다. 허브 Event 7일 보관은 현재 API 폴링이며 에이전트 watch 캐시를 읽는 경로가 아니다.
- 차이: Event 보관이 에이전트 watch 캐시 대신 현재 API 폴링을 사용한다. 설치 이미지·Lease 전체 검수는 고정되지 않았다.
- 고정 장치: `apps/wake/desktop/agent-heartbeat.test.cjs` — `heartbeat_marks_each_node_ok_stale_or_missing`
- 출처: D00007, D00018, D00021, D00024, D00649, D00972, D00974, D00980, D00981, D00982, D00983, D00984, D00985
- 검사: 지정 테스트 kubeconfig로 DaemonSet·Pod·Lease·RBAC·실제 imageID를 대조한다. watch 재연결과 410 relist, UID 교체, heartbeat stale·복구를 확인한다; [RULE-SECRET](rules.md#RULE-SECRET).

### F-ARC-011. AI 화면 조작과 보고서는 실제 자료를 공유한다 <a id="F-ARC-011"></a>

- 목표: 입력: AI가 선언된 검색 키를 바꾸고 같은 incident 근거로 보고서를 생성한다 → 기대: AI는 페이지가 선언한 키·검색·필터·열린 칸만 조작한다. 승인·머지·실행 버튼을 대신 누르지 않는다. 변경된 상태는 되돌릴 수 있는 칩으로 남긴다. 보고서는 같은 고정 근거·감사·단계·시각·영향·원인·조치·확인·후속 담당/기한으로 만들고 내보내기 숫자가 달라지면 실패다. → 실패: 승인 버튼이 실행되거나 보고서 숫자·근거 해시가 저장 스냅샷과 다르면 실패.
- 현재: 부분. `apps/wake/desktop/hub.cjs:51-69`의 request UUID·2초 reply 및 같은 문서 생성, `apps/wake/desktop/hub-tools.cjs:108` get/set_screen_state·build_report가 있다. build_report는 스키마에서 incident 선택이지만 실행에서 필수로 거절하므로 무인시던트 check 경로는 안 된다. 서버에서 화면 cluster scope 확인도 부족하다. PDF·엑셀 지원을 이 도구의 md/channel 지원으로 대체하지 않는다.
- 차이: build_report의 선택적 incident 스키마와 실행 필수 조건이 충돌하고 화면 cluster scope 검사가 없다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00740, D00742, D00884, D00885, D00910
- 검사: 선언 밖 키·다른 클러스터·외부 주소 거절, (기본값 채택, 번복 가능) 2초 무응답은 화면 없음, 첫 유효 답만 반영. status/postmortem/check와 Markdown/PDF/채널 출력의 대상·절대 시각·근거 해시 동일. 근거 없는 보고서 문장·숫자 0.

## 충돌과 최종 적용

| 충돌 | 적용 규칙과 남은 차이 |
|---|---|
| 옛 관리면 history API(D00089)와 데스크톱 허브 | 2026-11-15 이식-계획 1.3이 우선. 과거 조회 요구는 로컬 incident/evidence로 이어받고 옛 서버를 복원하지 않는다 |
| Secret 메타만 읽기와 권한 자체 금지 | PLAN 검수 D-01 A가 우선. Secret 종류 화면은 권한 없음; Helm은 비밀 없는 리소스 라벨·주석. AI 도구의 원본 Secret 요청을 제거해야 한다 |
| 고정 localhost 포트와 D-02 | 현재 47821은 구현 관측값이다. 가용 포트·endpoint 발견 요구가 최종이며 아직 미구현 |
| 공급자 연결 확인과 실제 대화 | ai.cjs 키 확인 지원 집합과 ai-run 실행 지원 집합을 분리. 구독 CLI 요구를 외부 MCP 사용으로 충족했다고 하지 않는다 |
| 연결 성공과 값의 최신성 | probe는 checkedAt만, 실제 데이터 읽기는 observedAt/lastSuccessAt. 보관 기간은 coverage가 아니다 |
| 대화 UI의 첫 질문과 저장본 | B1 7차 유실이 남음. 화면에서 두 질문이 보여도 재조회·모델 이력까지 보존 전에는 완료 아님 |
| 승인과 PR 실행 | approved와 pending은 실행 성공이 아니다. 실제 PR 기능은 남은 일 |
| 과거 샘플 시뮬레이션 지시와 앱 검수 | D00973 최신 결정. sim은 앱 밖 비교본, 앱은 실제 값 또는 정직한 실패. 시험 대역 결과는 실클러스터 완료와 구분 |

## 도구 공통 계약 F-ARC-TOOLS <a id="F-ARC-TOOLS"></a>

- 목표: 입력: 각 도구에 필수 인자 누락·추가 필드·타입 오류·음수 정수를 전달한다 → 기대: F-ARC-004/005와 SEC-001/003/011/014/015를 모든 도구에 적용한다. 아래 스키마는 현재 입력 계약이며 목표를 제한하지 않는다. required·type·enum·pattern·maxLength·추가 필드를 검사하고 정수 범위는 실행 전 검사한다. 성공은 `{result,source,masked}`, 실패는 `{error,source}`로 반환한다. → 실패: scope 밖 결과가 반환되거나 오류 응답에 source가 빠지면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:3`에 23개 도구와 입력 검사·마스킹·감사가 있다; early error의 source, 권한별 결과 필터, 정수 하한이 불완전하다.
- 차이: check는 정수 타입만 검사하고 minimum을 검사하지 않는다. unknown_tool·invalid_request·scope 거절의 early error에는 source가 없다.
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `a call is checked, scoped and audited with its transport; out of scope ends forbidden and is recorded`
- 출처: D00466, D00473, D00965, D00966. 짧은 인용은 끝 대응표에 있다.
- 검사: 정상·추가 인자·오타·음수·상한 초과·범위 밖 cluster/namespace/kind를 각 전송으로 호출한다. Secret 원본 호출 수와 범위 밖 반환 행 수는 0이다.
- `readOnly=true`는 클러스터 쓰기를 하지 않는다는 힌트다. 근거 저장·감지 갱신·화면 표현 변경은 있을 수 있으며 승인 권한을 뜻하지 않는다. T18만 `readOnly=false`이고 대기 제안만 만든다.

### F-ARC-T01. `list_resources` <a id="F-ARC-T01"></a>

- 목표: 입력: namespace a의 Pod 목록에 labelSelector와 limit=10을 보낸다 → 기대: 허용 종류의 목록을 namespace·labelSelector로 조회하고 대상 UID를 보존한다. Secret 요청은 읽기 전에 거절한다. F-ARC-TOOLS를 적용한다. → 실패: Secret 호출이나 다른 namespace 행이 반환되면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:57`; 각 행 kind,namespace,name,uid,status,age(ms),owner. limit 기본200/최대500. pagination/total/continue를 반환하지 않는다. status는 phase 또는 마지막 condition.type이다. 음수 limit 거절과 Secret API 금지는 아직 부족하다.
- 차이: Secret을 LIST 전에 거절하지 않으며 음수 limit·continue·total 검사가 없다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"cluster":{"type":"string","description":"kubeconfig context id of the cluster"},"namespace":{"type":"string","description":"namespace (omit for all)"},"kind":{"type":"string","description":"kind, e.g. Pod or pods"},"labelSelector":{"type":"string","description":"label selector","maxLength":512},"limit":{"type":"integer","description":"max rows (default 200)"}},"required":["cluster","kind"],"additionalProperties":false}`

### F-ARC-T02. `get_resource` <a id="F-ARC-T02"></a>

- 목표: 입력: Pod p와 Secret s로 get_resource를 호출한다 → 기대: 허용된 객체 하나를 UID와 소유 관계·조건으로 반환하며 managedFields는 기본 제외한다. Secret 요청은 원본 GET 전에 거절한다. F-ARC-TOOLS를 적용한다. → 실패: managedFields가 남거나 Secret GET이 발생하면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:65`; `{object,owner,conditions}`. object.metadata.managedFields 제거; 현재 Secret은 API 읽기 뒤 data 키만 남기는 결함. name은 DNS형 정규식, namespace는 현재 자유 string.
- 차이: Secret GET 뒤 data 키만 남긴다. 목표는 원본 GET 전 거절이다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"cluster":{"type":"string","description":"kubeconfig context id of the cluster"},"namespace":{"type":"string","description":"namespace"},"kind":{"type":"string","description":"kind"},"name":{"type":"string","description":"name","pattern":"^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$"}},"required":["cluster","kind","name"],"additionalProperties":false}`

### F-ARC-T03. `list_events` <a id="F-ARC-T03"></a>

- 목표: → [RULE-RETENTION](rules.md#RULE-RETENTION). F-ARC-TOOLS를 적용한다; 실패: 보관 Event가 빠지거나 count를 사건 수로 쓰면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:74`; `{rows,objects,warning,normal,occurrences,warningOccurrences}`는 eventSummary가 생성한다. involved UID/name/kind 모두 조건 AND, type 기본 all. 보관7일·전체 page와 현재 API 목록이 다르다. 31일 win 상한은 원본 retention이 아니다.
- 차이: 현재 API 목록만 읽어 화면의 7일 저장 이력을 조회하지 못한다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"cluster":{"type":"string","description":"kubeconfig context id of the cluster"},"namespace":{"type":"string","description":"namespace"},"involved":{"type":"object","properties":{"kind":{"type":"string","description":"kind"},"name":{"type":"string","description":"name"},"uid":{"type":"string","description":"uid"}},"required":[],"additionalProperties":false},"type":{"type":"string","enum":["all","Warning","Normal"]},"window":{"type":"object","description":"time window, ISO 8601","properties":{"from":{"type":"string","description":"start (ISO 8601)"},"to":{"type":"string","description":"end (ISO 8601)"}},"required":["from","to"],"additionalProperties":false}},"required":["cluster","window"],"additionalProperties":false}`

### F-ARC-T04. `read_logs` <a id="F-ARC-T04"></a>

- 목표: 입력: 같은 Pod UID·컨테이너·previous·5분 창으로 read_logs를 호출한다 → 기대: 같은 Pod UID·컨테이너의 요청 절대 구간을 읽고 원본 줄·시각·검색 범위·잘림을 보존한다. 24시간 상한은 F-BE-005를 따른다. F-ARC-TOOLS를 적용한다. → 실패: 다른 컨테이너·구간 밖 줄이 섞이거나 잘림을 숨기면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:82`; `{lines:[{n,at,text,level}],hits,total}`. Kubernetes timestamps=true/tailLines=2000/최대2MiB, Loki1000, 검색 없으면 마지막500줄. query 있으면 주변 around 기본2줄 발췌. ERROR=fatal/panic/error, WARN=warn, 나머지 INFO는 현재 텍스트 휴리스틱이다. source detected_level과 구별한다. total은 읽은 범위이며 UID/containerId/coverage 보강 필요.
- 차이: 이름으로 로그를 읽고 UID·containerId·coverage·잘림 반환이 없으며 요청 창은 31일까지다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"cluster":{"type":"string","description":"kubeconfig context id of the cluster"},"namespace":{"type":"string","description":"namespace"},"pod":{"type":"string","description":"pod name","pattern":"^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$"},"container":{"type":"string","description":"container"},"previous":{"type":"boolean"},"window":{"type":"object","description":"time window, ISO 8601","properties":{"from":{"type":"string","description":"start (ISO 8601)"},"to":{"type":"string","description":"end (ISO 8601)"}},"required":["from","to"],"additionalProperties":false},"query":{"type":"string","description":"text to find","maxLength":200},"around":{"type":"integer"},"source":{"type":"string","enum":["kubernetes","loki"]}},"required":["cluster","namespace","pod","window"],"additionalProperties":false}`

### F-ARC-T05. `query_metrics` <a id="F-ARC-T05"></a>

- 목표: 입력: 허용 namespace의 PromQL과 from/to/step을 보낸다 → 기대: 허용 범위 안의 PromQL만 읽고 시리즈 labels·단위·step·실제 coverage를 반환한다. F-ARC-TOOLS를 적용한다. → 실패: 범위 밖 시리즈가 나오거나 단위·coverage가 빠지면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:100`; `{series}`. query 최대2000자, step 초→ms. 기본 step=max(15,round(windowMs/120000)); 31일 상한. integer에 양수 최솟값 검사가 없고 자유 PromQL 범위 필터가 부족하다.
- 차이: 자유 PromQL 식 내부의 namespace와 kind 범위를 검사하지 않는다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"cluster":{"type":"string","description":"kubeconfig context id of the cluster"},"query":{"type":"string","description":"PromQL","maxLength":2000},"window":{"type":"object","description":"time window, ISO 8601","properties":{"from":{"type":"string","description":"start (ISO 8601)"},"to":{"type":"string","description":"end (ISO 8601)"}},"required":["from","to"],"additionalProperties":false},"step":{"type":"integer","description":"seconds (default: window / 120)"}},"required":["cluster","query","window"],"additionalProperties":false}`

### F-ARC-T06. `query_logs_count` <a id="F-ARC-T06"></a>

- 목표: 입력: Loki selector와 1시간 구간으로 수준 수를 요청한다 → 기대: 허용 범위 안의 LogQL로 전체 요청 구간의 수준별 수를 반환하고 발췌 줄 수와 구별한다. F-ARC-TOOLS를 적용한다. → 실패: 발췌 100줄을 전체 발생 수로 반환하면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:103`; `{counts}`; selector 최대500자, 중괄호 한 쌍 정규식. by는 level만 선언되며 다른 차원 없음. 자유 selector의 namespace 범위를 서버에서 보강해야 한다.
- 차이: LogQL selector 형식만 검사하고 내부 namespace scope를 강제하지 않는다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"cluster":{"type":"string","description":"kubeconfig context id of the cluster"},"selector":{"type":"string","description":"LogQL stream selector, e.g. {namespace=\"payments\"}","maxLength":500,"pattern":"^\\{[^}]*\\}$"},"window":{"type":"object","description":"time window, ISO 8601","properties":{"from":{"type":"string","description":"start (ISO 8601)"},"to":{"type":"string","description":"end (ISO 8601)"}},"required":["from","to"],"additionalProperties":false},"by":{"type":"string","enum":["level"]}},"required":["cluster","selector","window"],"additionalProperties":false}`

### F-ARC-T07. `list_apps` <a id="F-ARC-T07"></a>

- 목표: 입력: 여러 namespace와 multi-source Application이 있는 cluster를 조회한다 → 기대: 허용 namespace의 Application만 Sync·Health·UID·revision·repo/path·자동동기화·소속 수와 함께 반환한다. multi-source를 단일 출처로 바꾸지 않는다. F-ARC-TOOLS를 적용한다. → 실패: 허용 밖 Application이 나오거나 sources를 단일 repo로 바꾸면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:106`; 행 name,namespace,sync,health,revision,repo,path,auto,resources(개수). 단일 spec.source만 읽는다. multi-source/UID/시각 없음. namespace 제한 caller는 인자 namespace가 없어 거절될 수 있으므로 조회·반환 범위 계약 필요.
- 차이: Application UID가 없고 단일 spec.source만 읽으며 namespace 반환 필터가 없다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"cluster":{"type":"string","description":"kubeconfig context id of the cluster"}},"required":["cluster"],"additionalProperties":false}`

### F-ARC-T08. `app_history` <a id="F-ARC-T08"></a>

- 목표: 입력: Application UID·revision·window를 지정해 app_history를 읽는다 → 기대: Application UID·revision·시도를 보존한 실제 이력만 요청 구간에 맞춰 반환한다. F-ARC-TOOLS를 적용한다. → 실패: 다른 시도의 성공이나 구간 밖 이력을 포함하면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:111`; 행 revision,at=deployedAt,id. 선택 window의 양 끝 포함 필터. 없으면 missing. revision/attempt·현재 관측 구분은 GitOps 계약을 따른다.
- 차이: history의 revision/at/id만 반환하며 Application UID를 받지 않아 이름 재사용을 구별하지 못한다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"cluster":{"type":"string","description":"kubeconfig context id of the cluster"},"namespace":{"type":"string","description":"Application namespace"},"name":{"type":"string","description":"Application name","pattern":"^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$"},"window":{"type":"object","description":"time window, ISO 8601","properties":{"from":{"type":"string","description":"start (ISO 8601)"},"to":{"type":"string","description":"end (ISO 8601)"}},"required":["from","to"],"additionalProperties":false}},"required":["cluster","namespace","name"],"additionalProperties":false}`

### F-ARC-T09. `collect_evidence` <a id="F-ARC-T09"></a>

- 목표: 입력: 같은 incident 근거 spec을 두 번 수집한다 → 기대: 인시던트 범위 안의 근거를 불변 조각으로 저장하고 동일 조각에는 같은 번호·해시를 반환한다. F-ARC-TOOLS를 적용한다. → 실패: 같은 조각에 새 번호를 주거나 다른 UID 자료를 고정하면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:118`; `{n,hash}`. pod는 status JSON, logs는 발췌, events는 namespace 이벤트 요약, metric은 PromQL step30초/현재 unit 빈 문자열, app은 history JSON. window 미지정은 감지30분전~now. 고정 출처/UID/containerId/단위와 마스킹 해시 계약 보강 필요.
- 차이: 일부 근거 종류가 UID·containerId·단위를 누락하고 성공 sourceState를 고정한다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"incident":{"type":"string","description":"incident id"},"spec":{"type":"object","properties":{"kind":{"type":"string","enum":["pod","logs","events","metric","app"]},"namespace":{"type":"string","description":"namespace"},"name":{"type":"string","description":"object name"},"container":{"type":"string","description":"container"},"query":{"type":"string","description":"PromQL or text","maxLength":2000},"window":{"type":"object","description":"time window, ISO 8601","properties":{"from":{"type":"string","description":"start (ISO 8601)"},"to":{"type":"string","description":"end (ISO 8601)"}},"required":["from","to"],"additionalProperties":false}},"required":["kind"],"additionalProperties":false}},"required":["incident","spec"],"additionalProperties":false}`

### F-ARC-T10. `get_evidence` <a id="F-ARC-T10"></a>

- 목표: 입력: 허용 incident와 범위 밖 incident의 n=1을 각각 읽는다 → 기대: 저장된 근거 조각을 변경 없이 번호로 읽으며 다른 대상의 근거를 반환하지 않는다. F-ARC-TOOLS를 적용한다. → 실패: 범위 밖 조각이 나오거나 저장 hash가 바뀌면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:138`; n 없으면 모든 조각, 있으면 해당 n. identity/incident 내부 필드를 제외하고 반환. 없는 번호는 missing. 실패했으면 AI used/refs에 추가하지 않는다.
- 차이: n의 하한 검사와 저장 조각의 namespace/kind 검사가 없다.
- 고정 장치: 고정 없음 → TASK-F-09
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"incident":{"type":"string","description":"incident id"},"n":{"type":"integer"}},"required":["incident"],"additionalProperties":false}`

### F-ARC-T11. `list_incidents` <a id="F-ARC-T11"></a>

- 목표: 입력: 감지 출처를 실패시킨 뒤 state=open으로 목록을 읽는다 → 기대: 한 저장소의 안정 ID를 사용해 허용 범위·단계·시간의 인시던트를 조회하며 감지 실패를 해결로 바꾸지 않는다. F-ARC-TOOLS를 적용한다. → 실패: 기존 열린 사건이 실패 때문에 resolved가 되면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:141`; cluster 없으면 contexts 전체 감지. 최대8초 기다리고 저장 목록 반환; 뒤의 scan 취소는 안 된다. scope.cluster로 인자 대체, namespace는 반환 ns 필터. state all/open/mitigated/resolved; window 저장 필터와 coverage 재검토.
- 차이: 스캔 8초 timeout 뒤 저장 행을 반환하지만 실패·최신 coverage를 별도 반환하지 않는다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"cluster":{"type":"string","description":"kubeconfig context id of the cluster"},"state":{"type":"string","enum":["all","open","mitigated","resolved"]},"window":{"type":"object","description":"time window, ISO 8601","properties":{"from":{"type":"string","description":"start (ISO 8601)"},"to":{"type":"string","description":"end (ISO 8601)"}},"required":["from","to"],"additionalProperties":false}},"required":[],"additionalProperties":false}`

### F-ARC-T12. `get_incident` <a id="F-ARC-T12"></a>

- 목표: 입력: incident ID 하나로 workspace를 요청한다 → 기대: 같은 incident ID의 영향·근거·타임라인·조치·확인·감사를 단일 작업면으로 반환한다. F-ARC-TOOLS를 적용한다. → 실패: 다른 사건의 영향·근거·승인 내용이 섞이면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:144`; 범위·영향·타임라인·근거·원인 후보·조치 후보·복구·감사 작업면. id 없으면 missing. 저장 incident의 cluster/namespace로 scope 검사. 필드별 데이터 출처는 F-BE-011/018.
- 차이: workspace는 있지만 근거·감사·범위의 source 상태를 공통 계약으로 묶지 않는다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"id":{"type":"string","description":"incident id"}},"required":["id"],"additionalProperties":false}`

### F-ARC-T13. `get_timeline` <a id="F-ARC-T13"></a>

- 목표: 입력: 변경 시각이 없는 리소스의 incident 타임라인을 조회한다 → 기대: 인시던트에 연결된 실제 변경·증상 시각만 타임라인으로 반환하고 현재 상태로 과거 기록을 만들지 않는다. F-ARC-TOOLS를 적용한다. → 실패: 현재 상태로 과거 변경 사건을 생성하면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:147`; 행 at(ISO),kind,source=lane,title,text. 타임라인 lane은 관측 사건의 출처이며 시간상 인접은 원인 확정이 아니다.
- 차이: workspace 파생 타임라인에서 추정과 실제 변경 이력을 구별하는 필드가 없다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"incident":{"type":"string","description":"incident id"}},"required":["incident"],"additionalProperties":false}`

### F-ARC-T14. `query_audit` <a id="F-ARC-T14"></a>

- 목표: 입력: namespace a client로 24시간 감사 기록을 요청한다 → 기대: 권한 범위 안의 감사 기록을 절대 구간·요청자·경로·도구·인시던트로 조회한다. F-ARC-TOOLS를 적용한다. → 실패: namespace b·다른 kind 감사가 반환되면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:151`; window 필수, incident/requester/transport/tool 선택. at 내림차순 최대500. cluster scope 문자열 prefix는 있으나 namespace와 cursor/requestId는 없다. actor 입력을 caller 본인 권한으로 오인하지 않는다.
- 차이: cluster 접두사만 필터링하고 namespace/kind·ID 동점·cursor가 없다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"window":{"type":"object","description":"time window, ISO 8601","properties":{"from":{"type":"string","description":"start (ISO 8601)"},"to":{"type":"string","description":"end (ISO 8601)"}},"required":["from","to"],"additionalProperties":false},"incident":{"type":"string","description":"incident id"},"requester":{"type":"string","enum":["human","ai","wake","external"]},"transport":{"type":"string","enum":["desktop","mcp","api"]},"tool":{"type":"string","description":"tool name"}},"required":["window"],"additionalProperties":false}`

### F-ARC-T15. `get_screen_state` <a id="F-ARC-T15"></a>

- 목표: 입력: cluster A client가 cluster B 탭 상태를 요청한다 → 기대: 권한 범위 안의 실제 탭 주소와 선언된 화면 상태만 반환한다. F-ARC-TOOLS를 적용한다. → 실패: B의 주소·검색·필터가 반환되면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:156`; 현재 또는 지정 tab의 address와 선언 state keys. 2초 제한·첫 유효 응답. source wake, 관측 순간 coverage. 실제 화면 cluster와 caller scope 검사 보강.
- 차이: 화면 예외로 실제 탭의 cluster를 검사하지 않는다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"tab":{"type":"string","description":"tab (omit for the open one)"}},"required":[],"additionalProperties":false}`

### F-ARC-T16. `set_screen_state` <a id="F-ARC-T16"></a>

- 목표: 입력: 선언된 검색 키와 미선언 승인 키·외부 URL을 patch한다 → 기대: 권한 범위 안의 선언된 화면 키와 wake:// 이동만 적용하고 되돌릴 수 있는 칩을 반환한다. 승인·실행을 조작하지 않는다. F-ARC-TOOLS를 적용한다. → 실패: 승인 실행·외부 이동이 일어나거나 되돌림 칩이 빠지면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:158`; patch 선언 key와 open wake:// 주소. 현재 patch는 자유 object이고 required 없음. schema 통과가 페이지의 선언/권한 검사 통과를 뜻하지 않는다. 상태 변경은 가역 칩, 실제 승인 실행 금지.
- 차이: open은 wake:// 접두사만 검사하며 서버가 목적 탭 cluster 범위를 확인하지 않는다.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"tab":{"type":"string","description":"tab"},"patch":{"type":"object","description":"declared AI keys only"},"open":{"type":"string","description":"a wake:// address to open beside the screen (a detail or the report)"}},"required":[],"additionalProperties":false}`

### F-ARC-T17. `build_report` <a id="F-ARC-T17"></a>

- 목표: 입력: incident 없이 check 보고서와 해결 사건의 postmortem을 요청한다 → 기대: 상태에 맞는 실제 스냅숏 보고서를 Markdown 또는 채널용 문장으로 반환한다. 인시던트 없는 점검 보고서도 지원한다. F-ARC-TOOLS를 적용한다. → 실패: 점검이 incident 필수 오류로 끝나거나 해결 사건을 진행 중으로 쓰면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:160`; kind status/postmortem/check, format md/channel. schema에서 incident optional이지만 run은 필수 거절하므로 check 무인시던트 경로 미완료. 전송이나 PR 게시를 수행하지 않는다.
- 차이: incident가 스키마에서는 선택이나 실행에서 필수라 사건 없는 check가 거절된다.
- 고정 장치: 고정 없음 → TASK-F-14
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"incident":{"type":"string","description":"incident id"},"kind":{"type":"string","enum":["status","postmortem","check"]},"format":{"type":"string","enum":["md","channel"]}},"required":["kind"],"additionalProperties":false}`

### F-ARC-T18. `propose_action` <a id="F-ARC-T18"></a>

- 목표: 입력: UID·resourceVersion·변경 전체를 포함한 제안을 요청한다 → 기대: 전체 변경과 대상 UID·resourceVersion·위험·근거를 갖춘 승인 대기 제안만 만들며 자동으로 승인·실행하지 않는다. F-ARC-TOOLS를 적용한다. → 실패: waiting 이전에 실행되거나 변경 경로·위험·근거가 빠지면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:165`; target 필수, incident/option/change 선택. change.values 각 path와 after 필수, before 선택. caller를 기록하고 waiting approval만 생성한다. 실제 실행0. 매회UUID로 재시도 멱등 미완료; readOnly=false는 실행권한을 뜻하지 않는다.
- 차이: propose가 매번 UUID를 발급해 재전송을 같은 승인 ID로 합치지 않는다.
- 고정 장치: 고정 없음 → TASK-F-11
- 출처: D00466, D00473, D00965, D00966; 세부 승인 계약은 연결된 F-BE/SEC 규칙.
- 입력 스키마(현재): `{"type":"object","properties":{"incident":{"type":"string","description":"incident id"},"option":{"type":"string","description":"an action candidate id of the incident (raise-memory, rollback)"},"target":{"type":"object","properties":{"cluster":{"type":"string","description":"kubeconfig context id of the cluster"},"namespace":{"type":"string","description":"namespace"},"kind":{"type":"string","description":"kind"},"name":{"type":"string","description":"name"}},"required":["cluster","kind","name"],"additionalProperties":false},"change":{"type":"object","properties":{"title":{"type":"string","description":"title","maxLength":200},"values":{"type":"array","items":{"type":"object","properties":{"path":{"type":"string","description":"dotted path"},"before":{"type":"string","description":"value now"},"after":{"type":"string"}},"required":["path","after"],"additionalProperties":false}}},"required":["title"],"additionalProperties":false}},"required":["target"],"additionalProperties":false}`

## 작업 단위별 입력과 출력

각 단위는 아래 입력·출력·원본·위험을 연결된 규칙의 검사에 추가한다. 공통 실패 상태는 F-ARC-STATE, 대조 오차는 F-BE-022, 완료 관문은 F-BE-024를 참조한다. 원천의 미래 시험 경로는 현존하는 고정 장치로 세지 않는다. 원천 일정은 단위당 3~6시간, 시작 30분 내 원본·해시, 중간 IPC·화면, 종료 D1~D6였으며 현재 실행 일정이나 승인이 아니다.

U 항목 공통: 현재·고정 장치는 연결한 상위 규칙의 코드 위치·시험을 따른다. 단위 전체의 실행 판정은 이번에 재검증하지 않았다. 화면은 해당 영역과 함께 검수하고, 후보 파일은 착수 전에 실제 존재·소유를 확인한다.

### F-ARC-U01. U-01 출처 상태 계약: 홈의 마지막 성공·실패·오래됨 <a id="F-ARC-U01"></a>

- 목표: F-ARC-004를 적용한다. 입력: `id=context id; source별 실제 관측시각과 수집주기` → 기대: `SourceState v1; observedAt/receivedAt/lastSuccessAt/coverage/state; null 이유 필수`; IPC·도구 `hub.sources`. → 실패: probe만 성공했는데 observedAt·lastSuccessAt이 갱신되면 실패.
- 현재: `apps/wake/desktop/reads/source-checks.cjs:131`의 state가 observedAt·lastSuccessAt·coverage를 반환한다.
- 차이: TASK-F-03. 제거·교체 대상: 별도 hub-sources가 있으면 참조 0 확인 뒤 제거; unknown을 ok로 올리는 fallback. 위험·검사: 1차 원천의 stale 부재 지적과 달리 현재 source-checks는 stale을 생성한다; 수신시각으로 과거값을 신선하게 만들지 않는다.
- 고정 장치: 고정 없음 → TASK-F-03
- 출처: D00451, D00978. 결정 ID는 F-ARC-004에 명시한다.
- 범위: 화면 `cluster`; 요구 R-029, R-030, R-032, R-066, R-068, R-069, R-071, R-073; 선후행 설계 승인·인계; 후행: U-02, U-07, U-08, U-09, U-10, U-11, U-12, U-13, U-14, U-15, U-16, U-17, U-18, U-19, U-20, U-21, U-22, U-23, U-24, U-25, U-26, U-27, U-28, U-29, U-30, U-31, U-32, U-33, U-34, U-35, U-36, U-37, U-38, U-39, U-40, U-41, U-42, U-43, U-44.
- 변경 후보 파일: apps/wake/desktop/reads/source-checks.cjs, apps/wake/desktop/reads/index.cjs, apps/wake/data/live.js, apps/wake/desktop/reads/reads.test.cjs, kit/core/live.js, apps/wake/data/live.test.mjs, kit/core/live.test.mjs

### F-ARC-U02. U-02 시각 계약: 지표 구간·표 날짜·보관 범위 <a id="F-ARC-U02"></a>

- 목표: F-ARC-004, F-BE-003를 적용한다. 입력: `id:string,series:registry enum,target:kind별 labels,from/to:number epoch milliseconds,step:number seconds. 기존 IPC ms 유지; 외부 도구 ISO는 hub-tools 단일 adapter에서 ms 변환. 새 SourceState 시각은 ISO UTC.` → 기대: `query/unit/step/range/observedAt/coverage; UTC ISO 저장과 연도 포함 현지 표시`; IPC·도구 `metrics.range`. → 실패: 초와 ms가 섞이거나 연도 없이 과거 시각을 표시하면 실패.
- 현재: `apps/wake/desktop/reads/metrics.cjs:58`의 rangeOf가 IPC ms를 Prometheus 초로 변환한다.
- 차이: TASK-F-03. 제거·교체 대상: 15/30/90일을 실제 출처 보관과 혼동하는 상수; month/day만 보이는 보관함 날짜. 위험·검사: 구간 경계 포함 규칙과 ns/ms/s 변환, 날짜 범위 확대가 데이터 생성으로 이어지지 않는지 검사.
- 고정 장치: 고정 없음 → TASK-F-03
- 출처: D00451, D00978. 결정 ID는 F-ARC-004, F-BE-003에 명시한다.
- 범위: 화면 `metric`; 요구 R-021, R-031, R-032, R-043, R-071; 선후행 U-01; 후행: U-03, U-07, U-08, U-09, U-10, U-11, U-12, U-13, U-14, U-15, U-16, U-17, U-18, U-19, U-20, U-21, U-22, U-23, U-24, U-25, U-26, U-27, U-28, U-29, U-30, U-31, U-32, U-33, U-34, U-35, U-36, U-37, U-38, U-39, U-40, U-41, U-42, U-43, U-44.
- 변경 후보 파일: kit/core/clock.js, kit/core/clock.test.mjs, apps/wake/desktop/reads/metrics.cjs, apps/wake/pages/cluster-home.js, apps/wake/app.config.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/pages/cluster-home.test.mjs, apps/wake/app.config.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-ARC-U03. U-03 오류 계약: 리소스 목록의 권한·부분 실패 <a id="F-ARC-U03"></a>

- 목표: F-ARC-004를 적용한다. 입력: `id,kind,ns; 허용 종류 registry에서만 선택` → 기대: `성공 rows와 source; 실패 error 코드와 source; 부분은 coverage와 누락 사유`; IPC·도구 `kube.list`. → 실패: 403 응답이 성공 rows=[]로 변환되면 실패.
- 현재: `apps/wake/desktop/reads/index.cjs:103`의 answer 실패의 source는 문자열이며 SourceState 객체와 다르다.
- 차이: TASK-F-04. 제거·교체 대상: throw/string/lookup/access 오류의 중복 변환; catch 후 [] 대체. 위험·검사: 정상 빈 목록과 API 실패를 분리; 코드별 화면 정직성과 재연결 검사.
- 고정 장치: 고정 없음 → TASK-F-04
- 출처: D00451, D00978. 결정 ID는 F-ARC-004에 명시한다.
- 범위: 화면 `list:pods`; 요구 R-029, R-030, R-044, R-065, R-071; 선후행 U-02; 후행: U-04, U-07, U-08, U-09, U-10, U-11, U-12, U-13, U-14, U-15, U-16, U-17, U-18, U-19, U-20, U-21, U-22, U-23, U-24, U-25, U-26, U-27, U-28, U-29, U-30, U-31, U-32, U-33, U-34, U-35, U-36, U-37, U-38, U-39, U-40, U-41, U-42, U-43, U-44.
- 변경 후보 파일: apps/wake/desktop/reads/index.cjs, apps/wake/desktop/services.cjs, kit/core/service.js, apps/wake/data/live.js, apps/wake/pages/resource-list.js, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs, apps/wake/data/live.test.mjs

### F-ARC-U04. U-04 저장소 계약: 인시던트·근거 보존과 재시작 읽기 <a id="F-ARC-U04"></a>

- 목표: F-BE-010/014/015를 적용한다. 입력: `collection,id,schemaVersion,at,expectedVersion; 기록 종류별 retention` → 기대: `log append/list/prune; docs get/all/put/remove; 손상·쓰기 실패는 error/source=local-store`; IPC·도구 `incident.list`. → 실패: expectedVersion 충돌을 덮어쓰거나 손상을 빈 자료로 반환하면 실패.
- 현재: `apps/wake/desktop/hub-store.cjs:73`의 docs.put에 expectedVersion 검사가 없다.
- 차이: TASK-F-17. H-001-F3에서 collection별 TTL을 분리했다. 제거·교체 대상: 손상 JSON을 {}로 덮는 경로. 위험·검사: 90일·7일 경계, 종료 중 쓰기, 손상 보존, 동시 갱신, open incident 만료 정책.
- 고정 장치: 고정 없음 → TASK-F-17
- 출처: D00465, D00466, D00472, D00473, D00984. 결정 ID는 F-BE-010/014/015에 명시한다.
- 범위: 화면 `incidents`; 요구 R-033, R-034, R-050, R-068, R-073; 선후행 U-03; 후행: U-05, U-07, U-08, U-09, U-10, U-11, U-12, U-13, U-14, U-15, U-16, U-17, U-18, U-19, U-20, U-21, U-22, U-23, U-24, U-25, U-26, U-27, U-28, U-29, U-30, U-31, U-32, U-33, U-34, U-35, U-36, U-37, U-38, U-39, U-40, U-41, U-42, U-43, U-44.
- 변경 후보 파일: apps/wake/desktop/hub-store.cjs, apps/wake/desktop/hub.test.cjs, apps/wake/desktop/reads/index.cjs, apps/wake/desktop/incident-hub.cjs

### F-ARC-U05. U-05 감사 계약: AI 기록 행의 요청·결정·실행 연결 <a id="F-ARC-U05"></a>

- 목표: F-BE-012를 적용한다. 입력: `cluster,from,to,requester,transport,tool,cursor; actor 서버가 결정` → 기대: `id/at/requestId/incident/requester/model/transport/tool/scope/permission/result/masked/source; 거부도 기록`; IPC·도구 `audit.query`. → 실패: 거부 행·requestId가 빠져 호출과 결정을 연결하지 못하면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:187`의 call이 감사를 만들지만 전 요청 requestId를 연결하지 않는다.
- 차이: TASK-F-06, TASK-F-12. 제거·교체 대상: 중복 감사 포맷; 승인 성공을 실행 성공으로 적는 행. 위험·검사: 필터·정렬·페이지 간 중복/누락, 토큰 원문 미포함, 다른 namespace 감사 접근 금지.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00167, D00466, D00473, D00869, D00882, D00912, D00984, D01025. 결정 ID는 F-BE-012에 명시한다.
- 범위: 화면 `ailog,ailog-detail`; 요구 R-035, R-055, R-068; 선후행 U-04; 후행: U-06, U-07, U-08, U-09, U-10, U-11, U-12, U-13, U-14, U-15, U-16, U-17, U-18, U-19, U-20, U-21, U-22, U-23, U-24, U-25, U-26, U-27, U-28, U-29, U-30, U-31, U-32, U-33, U-34, U-35, U-36, U-37, U-38, U-39, U-40, U-41, U-42, U-43, U-44.
- 변경 후보 파일: apps/wake/desktop/hub-tools.cjs, apps/wake/desktop/approvals.cjs, apps/wake/desktop/hub.cjs, apps/wake/data/audit.js, apps/wake/pages/ailog.js, apps/wake/pages/ailog-detail.js, apps/wake/desktop/hub.test.cjs, apps/wake/data/audit.test.mjs

### F-ARC-U06. U-06 도구 스키마 계약: 같은 읽기를 desktop·MCP·API로 조회 <a id="F-ARC-U06"></a>

- 목표: F-ARC-005/006를 적용한다. 입력: `name,args,caller scope; 23개 실제 registry를 정본으로 schema version 부여` → 기대: `동일 result/source/coverage; additionalProperties 금지; namespace/kind 모든 반환 행 필터`; IPC·도구 `internal createToolLayer.call; MCP tools/list·tools/call; HTTP /api/v1/tools`. → 실패: 동일 입력의 전송별 결과·scope 거절이 달라지면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:27`의 check가 required·type·추가 필드를 검사하고 minimum은 검사하지 않는다.
- 차이: TASK-F-06, TASK-F-08. 제거·교체 대상: MCP/API 별도 읽기 복제, st?.state ?? ok, scope가 없는 screen/audit 우회. 위험·검사: get/set_screen_state와 query_audit의 간접 범위 누출, revoke 뒤 재사용, 임의 변경 도구 차단.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00648, D00660, D00741, D00742, D00965, D00966, D00967, D00980, D00981, D00982, D00987. 결정 ID는 F-ARC-005/006에 명시한다.
- 범위: 화면 `settings:ai-connect`; 요구 R-013, R-036, R-037, R-039, R-041; 선후행 U-05; 후행: U-07, U-08, U-09, U-10, U-11, U-12, U-13, U-14, U-15, U-16, U-17, U-18, U-19, U-20, U-21, U-22, U-23, U-24, U-25, U-26, U-27, U-28, U-29, U-30, U-31, U-32, U-33, U-34, U-35, U-36, U-37, U-38, U-39, U-40, U-41, U-42, U-43, U-44.
- 변경 후보 파일: apps/wake/desktop/hub-tools.cjs, apps/wake/desktop/hub-server.cjs, apps/wake/desktop/mcp-stdio.cjs, apps/wake/desktop/hub.cjs, apps/wake/desktop/hub.test.cjs

### F-ARC-U07. U-07 에이전트 설치→노드별 heartbeat→상세 <a id="F-ARC-U07"></a>

- 목표: F-ARC-010를 적용한다. 입력: `id; node UID; Lease renewTime/duration; 실 배포 digest` → 기대: `설치여부/버전/digest/nodes/heartbeat/watch/rules/apiMs/dnsMs/cache/memory; 없는 관측 null+reason`; IPC·도구 `agent.status; agent.heartbeat`. → 실패: Lease 없이 heartbeat 정상·설치 버전을 만들어 내면 실패.
- 현재: `apps/wake/desktop/agent-heartbeat.cjs:24`의 nodeOf가 Lease 시각으로 Node heartbeat 상태를 계산한다.
- 차이: TASK-F-07, TASK-F-13. 제거·교체 대상: 모든 Secret get/list/watch 경로; node missing을 정상 개수에 포함하는 합성. 위험·검사: D-01은 agent에도 예외 없이 적용한다. 진행 중 agent 작업의 인수 전 중복 착수하지 않는다.
- 고정 장치: 고정 없음 → TASK-F-07
- 출처: D00007, D00018, D00021, D00024, D00649, D00972, D00974, D00980, D00981, D00982, D00983, D00984, D00985, D-01. 결정 ID는 F-ARC-010에 명시한다.
- 범위: 화면 `agent,agent-detail`; 요구 R-006, R-010, R-011, R-016, R-056, R-057, R-067; 선후행 U-01, U-02, U-03, U-04, U-05, U-06; 후행: U-08, U-09, U-10, U-11, U-12, U-13, U-14, U-15, U-16, U-17, U-18, U-19, U-20, U-21, U-22, U-23, U-24, U-25, U-26, U-27, U-28, U-29, U-30, U-31, U-32, U-33, U-40, U-41, U-42, U-43, U-45, U-46, U-47, U-48, U-49, U-50, U-51.
- 변경 후보 파일: apps/wake/agent/agent.mjs, apps/wake/agent/agent.test.mjs, apps/wake/agent/Dockerfile, apps/wake/desktop/agent-heartbeat.cjs, apps/wake/desktop/agent-heartbeat.test.cjs, apps/wake/pages/agent.js, apps/wake/pages/agent-detail.js, apps/wake/desktop/agent-install-charts/wake-agent-only/templates/rbac.yaml, apps/wake/desktop/agent-install-charts/wake-agent-only/templates/agent.yaml, apps/wake/desktop/agent-install-charts/wake-agent-only/values.yaml, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

<a id="F-ARC-DESKTOP-RESTART"></a>


## F-ARC-DESKTOP-RESTART

- 목표: 입력 이전 인스턴스가 정상 종료를 지연하는 동안 같은 프로필로 재시작 → 기대 종료/단일 인스턴스 인계 상태를 처리하고 사용자에게 실제 결과를 표시; 프로필/탭 보존 → 실패 이전 프로세스 때문에 새 창이 조용히 실패하거나 중복 인스턴스가 자격/상태를 손상.
- 현재: before-quit와 종료 signal을 처리하고 종료 시 terminal 정리를 수행한다.(`kit/desktop/main.cjs:970`)
- 차이: 이전 프로세스가 늦게 끝나는 재시작의 인계·중복 실행·자료 보존 시험이 없다.
- 고정 장치: 고정 없음 → TASK-F-ARC-DESKTOP-RESTART
- 출처: D00515
