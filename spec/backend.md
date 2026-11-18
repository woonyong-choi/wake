# Wake 백엔드와 데이터

영역 F의 서비스·저장·최적화 정본이다. [허브 아키텍처](architecture.md)의 경계와 함께 구현한다. 예를 들어 `events.read`가 최근 이벤트 500개를 받았고 다음 페이지 커서가 있다면, 현재 받은 행은 보존하되 전체를 다 읽었다고 표시하지 않는다. 7일 보관은 과거 7일을 소급 수집했다는 뜻이 아니다.

출처 약어 DEC·MSG·MAP·HIST·PLAN·S, 상태와 작업 ID의 의미는 architecture.md의 근거 절과 같다. D1~D7은 F-BE-024, 최적화 제안은 F-BE-P00~P10, 작업 인계는 TASK-F-01~23에서 찾는다. 이 문서의 현재 상태는 코드 직접 열람과 명시한 과거 검증 보고에 근거한다. 문서 검토에서 실제 클러스터·모델·Electron을 새로 검증하거나 저장소 이전·최적화를 실행하지 않았다. 아래 명령은 수용 기준이며 실행한 결과로 오해하지 않는다.

## 원본과 읽기 서비스

### F-BE-001. 자료 키와 공개 서비스 <a id="F-BE-001"></a>

- 목표: 입력: 호스트 없는 브라우저와 Kubernetes 403 응답에서 같은 자료 키를 연다 → 기대: 각 값은 아래 실제 서비스와 원본을 가진다. 브라우저 무호스트·미연결·권한 실패를 견본이나 0으로 채우지 않는다. 화면과 AI의 차이가 있는 경로는 표와 F-ARC-003의 남은 일로 공개한다. → 실패: 미연결 키가 견본 행·0이 되거나 원본 서비스 없는 값이 정상으로 표시되면 실패.
- 현재: 부분. 서비스 목록은 `apps/wake/desktop/services.cjs:374-712`, `apps/wake/desktop/reads/index.cjs:109-138`에 존재한다. 기본 읽기 경로는 구현됐으나 값·보관·scope·실제 검증 빈 곳은 각 항목에 남겼다.
- 차이: 화면과 AI의 동일 자료 키가 같은 보관·scope 계약을 공유하지 않는다(F-ARC-003).
- 고정 장치: 고정 없음 → TASK-F-02
- 출처: D00973
- 검사: `apps/wake/data/index.js`, `desktop/services.cjs`, `desktop/reads/index.cjs`의 이름 대응 누락 0. API 원문과 IPC·화면의 동일 context/UID/절대 구간/단위 대조. 성공0·loading·empty·unconfigured·forbidden·partial·stale를 각각 검사한다.

| 값·기능 | 실제 서비스·입력 | 원본·구현 | 반환 계약의 핵심 |
|---|---|---|---|
| 클러스터 목록 | `kube.read` | kubeconfig 파일, `provider-connections.cjs` | context 식별자. 목록을 읽는 것은 클러스터 접속 성공과 다름 |
| 리소스 목록·상세 | `kube.list {id,kind,ns}`, `kube.get {id,kind,ns,name,managedFields?}` | `services.cjs`, `data/kinds.js` API 경로 | 검증된 TypeMeta·metadata·spec/status, 선택 시만 managedFields; Secret list는 거절, get은 API 읽기 뒤 가림으로 D-01 미충족 |
| 권한·요약 | `kube.access`, `kube.can`, `kube.summary` | SelfSubjectAccessReview, 실제 Node/Pod/namespace | 허용 여부와 원본 요약, 없는 값의 0 대체 금지 |
| 상세 지표 | `observability.read` | `observability.cjs` 공급자 연결과 실제 질의 | B1 fallback과 같은 대상·단위·구간으로 비교 |
| 범위 시계열 | `metrics.range {id,series,target?,from,to,step}` | `reads/metrics.cjs` → Prometheus query_range | query,unit,step,range,fetchedAt,result,sourceState |
| 목록 사용량 | `metrics.usage {id,kind}` | Prometheus instant query 묶음 | kind,fetchedAt,rows,queries,sourceState |
| 규칙·알림·이력 | `alerts.read {id}`, `alerts.expr {id,rule:{group,name},from,to,step}` | Prometheus /rules, Alertmanager /alerts, alert-history | rules,alertmanager,history,partial,sources; expr은 허브가 규칙에서 찾는다 |
| 이벤트 | `events.read {id,ns?,subjectUid?}` | Kubernetes Event + events.jsonl | items,partial,retainedFrom,sourceState |
| Pod 로그 | `kube.logs` | `pod-logs.cjs` 또는 Kubernetes pods/log | 현재/이전 컨테이너·tail/window·제한·원본 시각 |
| Loki 로그·수준 | `loki.logs`, `logs.levels {id,ns,pod,container?,from,to}` | Loki query_range/query, `log-levels.cjs` | 발췌와 전체 구간 수준 수를 분리 |
| 네트워크 | `network.read {id,from,to,step}` | EndpointSlice + Prometheus | rx,tx,err,ingress,conns,retrans,queries,unmapped,sourceState |
| GitOps | `gitops.read {id}`, `gitops.diff {id,application,tool}` | Argo Application/Flux CRD, 연결한 Argo API | controllers,repos; sourceIdentity/revision/시각/diffState, 실제 diff |
| 도구 발견·질의 | `tools.find {id,refresh?}`, `tool.query {id,kind,route}` | Service/Endpoints/Pod UID → 포트포워딩 | list/access/error, 실제 status/headers/body/크기/지연 |
| 도구 확인·출처 | `tool.checks {id,kind}`, `hub.sources {id}` | source-checks + 가벼운 probe | 6시간 samples,24시간 errors, 전체 SourceState |
| 비용 | `costs.open {id,op}` | `opencost.cjs`, `tools.cjs` /allocation | 기간·집계·통화·가격/부분 수집 계약에 맞춘 실제 값 |
| 에이전트 | `agent.status {id}`, `agent.heartbeat {id}` | DaemonSet/Pod/Lease/RBAC | 배포·노드별 heartbeat·버전·watch·6시간 지연 |
| 인시던트 | `incident.list`, `incident.workspace` | `hub.cjs` → `incident-hub.cjs` + incidents/evidence | 안정 ID, 단계, 근거, 조치, 확인, 감사 |
| 감사 | `audit.query {cluster}` | `hub.cjs:92` audit.jsonl | `{at,rows}`; 현재 화면 경로는 전체 반환, 외부 도구는 500행 상한 |
| 대화·승인 | `ai.providers`, `ai.run`, `ai.conversations`, `ai.chat`, `approval.decide` | `hub.cjs`, `ai-run.cjs`, `approvals.cjs` | ID·진행 이벤트·대화 기록·첫 결정; 보관·복원·삭제는 ai.chat으로 허브 저장소에 반영 |
| 외부 AI·화면 | `aiserver.state/set/client`, `screen.reply` | hub-server, hub.cjs | 서버 설정·클라이언트·request UUID 응답 |
| 해제 | `hub.release {id}` | `reads/index.cjs:82-85` | 주기 읽기 타이머 중단·출처 상태 삭제. 전체 허브 정리를 뜻하지 않는다 |

### F-BE-002. 도구 접속, timeout과 connection <a id="F-BE-002"></a>

- 목표: 입력: 같은 이름의 Service 두 개 중 UID를 지정하고 응답 지연·연결 거절을 발생시킨다 → 기대: 서비스 이름만으로 첫 항목을 고르지 않고 context·Service UID·Pod UID·허용 포트를 고정한다. Loki·Tempo는 읽기 API 화면으로 연결한다. 포트포워딩은 Kubernetes API WebSocket을 통한다. 요청 제한에 걸려 아무 응답도 없는 경우 timeout, 거절·중도 연결 끊김은 connection으로 구분한다. 일시 실패로 기존 연결 증거를 삭제하거나 새 연결 권한을 부여하지 않는다. → 실패: 첫 이름 일치 대상으로 연결하거나 timeout과 connection을 성공으로 표시하면 실패.
- 추가 조건: 입력 동일 단계·동일 서비스의 지연 응답을 서로 다른 읽기 진입점에 공급 → 기대 해당 단계의 공통 제한 정책을 적용하고 그 예산 안의 늦은 응답을 성공으로 수신 → 실패 경로 자체의 별도 짧은 제한으로 한 경로만 먼저 종료
- 현재: 부분. `apps/wake/desktop/tools.cjs:147-218` 바인딩·세대·발견 공유, `apps/wake/desktop/portforward.cjs:45-80` handshake와 지속 스트림 수명 분리. `apps/wake/data/tool-connection-limits.js:1` 연결 120000ms/요청 30000ms지만 `apps/wake/desktop/reads/index.cjs:49`는 자체 20000ms 제한이다. 경로별 제한을 하나의 값으로 통일했다고 하면 안 된다. tools.query 분류 시험은 존재하나 전체 reads 상위 정규화는 U-03 미완료다.
- 차이: 연결 제한 120초·요청 30초와 reads의 20초 제한이 병존하며 상위 오류 코드 정규화가 끝나지 않았다.
- 고정 장치: `apps/wake/desktop/tools.test.cjs` — `query classifies an unanswered request as timeout and a refused or dropped one as connection`; 추가 조건 고정 없음
- 출처: D00011, D00012, D00013, D00014, D00015, D00036, D00044, D00114, D00115, D00505, D00999
- 검사: 같은 context 동시 발견은 공유, 명시 재시도는 새 조회. 같은 이름 다른 UID/복수 Service/포트 모호성은 바인딩 금지. 20초보다 늦지만 허용 예산 안의 응답은 성공 가능. 응답 보류·connection refused·socket drop·403·UID 교체를 각각 주입해 분류와 재연결 확인. 수립된 스트림은 최초 요청의 만료 신호만으로 끊지 않는다.

### F-BE-003. 지표의 질의·단위·구간 <a id="F-BE-003"></a>

- 목표: 입력: pod.cpu와 namespace/pod 라벨·과거 from/to/step을 metrics.range로 요청한다 → 기대: 화면은 등록 series ID와 대상 라벨만 보내고 허브가 PromQL을 만든다. target의 미등록 키·이름 형식 오류는 거절한다. 요청 구간과 실제 표본 시각, 최신값과 과거 마지막값을 구분한다. Pod 재시작 누적값과 최근 1시간 증가량은 다른 값이다. → 실패: 미등록 target이 PromQL에 삽입되거나 과거값이 현재값·누적 재시작이 증가량이 되면 실패.
- 현재: 부분. `apps/wake/desktop/reads/metrics.cjs:19-62,66-116`에 25개 시리즈와 질의·단위·구간 정규화가 있다. `usageRows`는 Pod/Deployment/Node/PVC 네 종류를 지원한다. `apps/wake/desktop/reads/cluster.cjs:45-46`의 AI PromQL 경로는 화면 등록 시리즈와 상한이 다르다. 실클러스터 동시 원본 대조는 이번 미실행.
- 차이: 화면 등록 시리즈와 AI 자유 PromQL의 허용 범위가 다르다. rangeOf의 양 끝점 포함 표본 수가 1000개 경계를 넘을 수 있다.
- 고정 장치: `apps/wake/desktop/reads/reads.test.cjs` — `metrics.range returns the query, step, range and fetch time with the series`
- 출처: D00075, D00081, D00082, D00085, D00086, D00171, D00196, D00272, D00276, D00344, D00345, D00450, D00451, D00504, D00830
- 검사: `node --test apps/wake/desktop/reads/reads.test.cjs`; 동일 from/to/step의 원본 query_range와 series·label·각 표본·단위를 대조한다. 제안 수치: 최소 step 15초, 15초 배수, 구간 최대 15일. 코드가 구간/1000으로 step을 계산하므로 양 끝 포함 표본 수가 1001이 될 경계도 별도 검사하여 목표 1000개를 판정한다. CPU만 실패·RX만 실패 시 정상 시리즈를 남기고 실패를 수집 없음으로 바꾸지 않는다.

### F-BE-004. Event 보관과 중복 처리 <a id="F-BE-004"></a>

- 목표: 입력: 같은 Event UID의 resourceVersion·count를 갱신하고 다른 Pod UID의 같은 reason을 추가한다 → 기대: 같은 사건의 갱신을 중복 사건으로 세지 않는다. (기본값 채택, 번복 가능) cluster·대상 UID·reason·정규화 message의 사건 키와 Event UID/resourceVersion의 전달 키를 구분한다. series.count/count 및 마지막 시각 갱신은 같은 사건에 합친다. 다른 cluster·재발·다른 대상의 자료는 합치지 않는다. 대상+Reason 행 수와 발생 횟수 합계는 따로 계산한다. → 실패: count 갱신을 새 사건으로 늘리거나 다른 UID의 사건을 합치면 실패.
- 현재: 부분. `apps/wake/desktop/reads/events.cjs:19-53`은 Event UID별 count/마지막 시각 변화만 추가 기록하고 반환 시 cluster+UID별 마지막 행을 택한다. known Map은 cluster 없이 UID만 키로 사용한다. `apps/wake/data/incident-model.js:134-155`의 eventSummary는 Event UID별 최신/최대 count를 고른 뒤 kind/namespace/name+reason으로 다시 묶으므로 같은 이름으로 재생성된 object UID가 섞일 수 있다. 메시지 정규화와 대상 UID 분리도 필요하다. 새 Event UID의 같은 사건 정규화는 없다. limit 500 첫 페이지만 읽고 continue가 있으면 partial이다. slim은 metadata.resourceVersion을 보존하지 않는다. AI list_events는 현재 API만 읽는다.
- 차이: known 키에 cluster가 없고 eventSummary가 대상 UID 대신 이름으로 재집계한다. resourceVersion·새 Event UID의 사건 정규화가 없다.
- 고정 장치: `apps/wake/desktop/reads/reads.test.cjs` — `events are kept for 7 days: a stored event outlives the API server list`
- 출처: D-USR-2026-11-16-7; D00064, D00090, D00091, D00092, D00095, D00452, D01025, D01039
- 검사: 같은 Event 갱신 10회, 동일 내용 다른 Event 이름, 순서 뒤바뀜, 재시작, 같은 UID를 사용하는 서로 다른 cluster 입력을 대조한다; [RULE-RETENTION](rules.md#RULE-RETENTION). count 중복 합계 0, 논리적 사건 중복 0. AI와 화면이 같은 보관 계약을 사용해야 한다.

### F-BE-005. 로그 발췌와 전체 구간 수 <a id="F-BE-005"></a>

- 목표: 입력: Pod 이벤트에서 Logs를 열고 previous 컨테이너와 검색어를 선택한다 → 기대: 로그에는 cluster·Pod UID·컨테이너/이전 컨테이너·절대 구간·원본 줄 번호·시각·텍스트·잘림·출처를 붙인다. 이벤트에서 Logs로 이동하면 같은 Pod UID·컨테이너·발생 전후 5분이다. 기본 최근 1시간·100줄, 기간 선택은 [RULE-RANGE](rules.md#RULE-RANGE), 요청 최대 24시간을 지킨다. Kubernetes 로그의 검색은 받은 범위 안이며 Loki 전체 구간 수와 혼동하지 않는다. → 실패: 전후 5분·UID가 바뀌거나 발췌 수가 전체 Loki 발생 수로 표시되면 실패.
- 현재: 부분. `apps/wake/desktop/pod-logs.cjs:46`, `apps/wake/desktop/services.cjs:465-490`, `apps/wake/desktop/reads/log-levels.cjs:5`가 실제 로그·수준 질의를 구현한다. AI `apps/wake/desktop/hub-tools.cjs:82-102`는 Kubernetes tailLines 2000/2MiB 후 최대 500줄, Loki 1000줄, 공통 win 최대 31일이다. AI 결과 total은 읽은 lines 수이고 containerId/coverage/잘림을 충분히 반환하지 않아 화면 계약과 차이가 있다.
- 차이: AI는 최대 31일·Kubernetes 500줄을 반환하며 containerId·coverage·잘림 정보가 빠진다. 목표는 최대 24시간이다.
- 고정 장치: `apps/wake/desktop/reads/reads.test.cjs` — `log levels count Loki detected_level over the whole window`
- 출처: D00064, D00093, D00095, D00096, D00097, D00098, D00099, D00114, D00117, D00452
- 검사: pod-logs 시험과 같은 UID·container·from/to의 실제 API/Loki 응답 대조. 현재/previous·보관 밖·권한 없음·연결 실패·결과 없음·truncated를 분리한다. 읽은 100줄을 전체 구간 ERROR 합계로 사용하지 않는다. 길이 한도 초과와 복수 스트림 동일 timestamp의 커서 중복·누락도 검사한다.

### F-BE-006. 알림 상태·이력·감시 신호 <a id="F-BE-006"></a>

- 목표: 입력: Watchdog와 firing 알림을 읽은 뒤 Alertmanager 조회를 실패시킨다 → 기대: Prometheus 규칙의 이름·group·expr·for·labels와 Alertmanager fingerprint/startsAt/endsAt/receivers를 원본으로 사용한다. 해제와 재발을 구분한다. fingerprint 없으면 정규화 labels+startsAt이 중복 키다. Watchdog는 firing 목록에서 숨기고 출처 건강 근거로만 사용한다. 실패한 조회를 빈 활성 목록으로 해석해 resolved를 만들지 않는다. → 실패: Watchdog가 장애 목록에 나오거나 조회 실패로 기존 알림이 resolved가 되면 실패.
- 현재: 부분. `apps/wake/desktop/reads/alerts.cjs:12-43`은 cluster+fingerprint+startsAt별 마지막 행을 읽고 매 조회마다 lastSeen 행을 append한다. fingerprint 없는 알림은 현재 버린다. AM 성공 때 사라진 알림만 lastSeen 시각으로 종료하며 한쪽 실패는 partial을 표시한다. 원문 주석의 예정 endsAt 최소값 처리와 구현 사이 차이도 있다. 보관 90일은 행 at=startsAt 기준이다.
- 차이: fingerprint 없는 알림을 버리고 startsAt을 보관 기준으로 쓰며 조회마다 lastSeen 행을 추가한다.
- 고정 장치: `apps/wake/desktop/reads/reads.test.cjs` — `alerts.read keeps rules, live alerts and the resolved history; alerts.expr reads the rule expr itself`
- 출처: D01006, D01025
- 검사: 규칙만 실패/AM만 실패/둘 다 실패, 같은 알림 재전송, 외부 라벨만 다른 사본, resolved 후 재발, 역순 해제, 재시작을 검사한다. 동일 상태·동일 시작 시각 동점은 안정 두 번째 키로 정렬하고 행 수·순서가 두 테마에서 같다. 정상 0과 실패 0을 구분한다.

### F-BE-007. 네트워크의 관측과 추정 <a id="F-BE-007"></a>

- 목표: 입력: EndpointSlice 매핑·Pod rx/tx만 있고 서비스 간 호출 자료는 없는 응답을 연다 → 기대: Pod rx/tx와 EndpointSlice 매핑, ingress-nginx 요청/5xx만 관측값으로 표시한다. 실제 서비스 간 호출·활성 연결·재전송을 측정하지 못하면 이유를 밝히고 비워 둔다. 같은 namespace의 저장소 연결을 관측 트래픽으로 표시하지 않는다. → 실패: namespace 연관선에 관측 트래픽을 붙이거나 미수집 연결 수를 0으로 표시하면 실패.
- 현재: 부분. `apps/wake/desktop/reads/network.cjs:11-65`의 rx/tx는 Pod→Service 집계, 다중 Service는 이름의 headless 접미사 후순위·이름순 첫째다. err/ingress는 현재 시각 instant query이고 rx/tx는 요청 range여서 시각이 같다고 가정하면 안 된다. conns/retrans는 빈 배열, 실제 서비스 간 호출은 없으며 L1 P4가 남는다.
- 차이: rx/tx는 요청 구간이지만 err/ingress는 현재 시각이다. 실제 서비스 간 호출·conns·retrans 수집은 없다.
- 고정 장치: `apps/wake/desktop/reads/reads.test.cjs` — `network: Pod traffic is grouped by the Service of its EndpointSlice; unmeasured values stay empty`
- 출처: D00086, D00450, D00882, D01037
- 검사: EndpointSlice 원본의 namespace/Pod/Service와 PromQL label/동일 시각 값을 대조한다. 매핑 안 된 Pod 수는 unmapped에 보존. 여러 Service에 속한 Pod 배정 기준을 공개하고 중복 합산하지 않는다. conns/retrans에 합성 0 금지.

### F-BE-008. GitOps·소유 관계·Helm <a id="F-BE-008"></a>

- 목표: 입력: multi-source Application revision을 바꾸고 Helm 라벨만 있는 리소스를 조회한다 → 기대: Argo Sync와 Health는 별도이고 새 revision에 과거 성공을 붙이지 않는다. 앱 UID/revision/시도에 연결된 기록만 반환한다. diff는 없음/비교 미지원/권한 부족/조회 실패를 구분한다. multi-source를 단일 repo나 revision으로 지어내지 않는다. Helm 정보는 리소스의 승인된 라벨·주석에서만 읽고 Secret release는 읽지 않는다. → 실패: 새 revision에 과거 성공이 붙거나 Helm 확인을 위해 Secret을 읽으면 실패.
- 현재: 부분. `apps/wake/desktop/services.cjs:74-80,580-642`, `apps/wake/desktop/gitops-deployment.cjs:10`, `apps/wake/desktop/tool-connect.cjs:15`에 CRD·정체성·multi-source·diff 읽기가 있다. `apps/wake/desktop/hub-tools.cjs:108` list_apps/app_history는 단일 source 및 제한된 history 필드로 화면과 다르다. L1 P3(Application incident), P5(설정만 바뀐 rollout diff), P6(PR 미생성)가 남는다.
- 차이: AI list_apps는 spec.source 하나만 읽고 app_history는 제한된 필드만 반환한다. Helm은 Secret 입력을 쓰는 변환기가 남아 있다.
- 고정 장치: 고정 없음 → TASK-F-07
- 출처: D00050, D00063, D00100, D00101, D00102, D00103, D00104, D00105, D00106, D00453, D00505, D00618, D00624, D00625, D00636, D00659, D01037
- 검사: Application UID·status.sync.revision·operationState·history·status.resources, Flux sourceRef/Ready/suspend/lastAppliedRevision을 동일 시각 대조한다. diff -클러스터/+Git, 여러 파일, 설정만 바뀐 rollout까지 검사한다. Helm release-name/release-namespace/managed-by/chart가 없으면 없는 이유를 표시한다. revision/status·이력을 “권한 범위 밖(Secret)”으로 둔다.

### F-BE-009. 모든 지원 리소스와 비용·에이전트의 실제 출처 <a id="F-BE-009"></a>

- 목표: 입력: 등록 종류 목록과 OpenCost 미설치·Lease 만료 응답을 조회한다 → 기대: 리소스 종류는 `data/kinds.js`의 등록 표를 정본으로 삼고 실제 목록 TypeMeta를 검사한다. 서로 다른 객체 종류나 UID를 혼합하지 않는다. 값 부재를 0·가짜 관계로 만들지 않는다. 비용은 실제 OpenCost /allocation, 에이전트는 실제 Lease/DaemonSet/Pod/RBAC를 사용한다. → 실패: 다른 TypeMeta를 같은 종류 행에 섞거나 미설치 비용을 0원으로 표시하면 실패.
- 현재: 부분. `apps/wake/desktop/services.cjs:59-72` typedListItems, `kube.list` Secret 거절과 종류 기반 읽기가 있다. `kube.get:458-461`은 Secret API GET 이후 sanitize로 값만 가려 최신 Secret 무호출 계약에 어긋난다. `apps/wake/desktop/opencost.cjs:133`·`apps/wake/desktop/tools.cjs:116-173`, `apps/wake/desktop/agent-heartbeat.cjs:42` 실제 읽기가 있다. 정상 비용·wake-agent 설치본·Certificate 전체 검수는 이번 확인하지 않았다. `apps/wake/desktop/reads/cluster.cjs:10` 내부 LIST_PATH는 화면 kinds 전체와 같지 않다.
- 차이: kube.get은 Secret을 GET한 뒤 가린다. AI LIST_PATH는 화면 등록 종류 전체를 지원하지 않는다.
- 고정 장치: 고정 없음 → TASK-F-02
- 출처: D00064, D00079, D00080, D00081, D00082, D00083, D00084, D00085, D00086, D00087, D00088, D00107, D00108, D00109, D00110, D00111, D00114, D00115, D00117, D00167, D00196, D00252, D00276, D00317, D00445, D00449, D00450, D00467, D00474, D00974, D00985
- 검사: Pod,Deployment,StatefulSet,DaemonSet,CronJob,Service,PVC,Job,ReplicaSet,HPA,Ingress,Secret,ConfigMap,Node,Event 15종에 대해 목록/상세 값의 API 경로 대조. Secret 정상 읽기 대신 금지 상태. Certificate 요구는 등록 부재를 남긴다. OpenCost 기간 선택은 [RULE-RANGE](rules.md#RULE-RANGE)에 맞춰 검사한다. namespace→workload→Pod·Node 집계, 유휴/미할당·통화·비교기간 coverage를 대조하고 같은 결과를 중복 합산하지 않는다.

F-BE-009의 비용 경계는 `services.cjs:332-353`의 `costs.open`이다. `opencost`라는 이름의 IPC는 없다. 실제 입력·상태는 다음 표를 따른다. 이 표의 수용 기준·상태·고정·남은 일은 F-BE-009와 같다.

| 항목 | 실제 코드 계약 |
|---|---|
| op와 허용 필드 | summary/targets/cancel은 id,op. connect는 id,op,service(Service UID). read는 id,op,period,from,to,view,namespace,controllerKind,controller,pod,node,compare. 추가 필드 거절 |
| 송신자·동시성 | mainFrame·현재 page owner·sourceDocumentGeneration 고정. summary는 같은 cluster 홈, 나머지는 그 cluster costs 주소만 허용. 문서당 동시1, 이미 진행 중이면 busy. cancel/owner 교체는 AbortSignal. connect 쓰기는 cluster별 단일 실행 |
| 기간·집계 | period 24h/7d/30d, 기본7d. view namespace/workload/pod/node, 기본namespace. from/to epoch ms 정수, 과거부터 현재 이하, 최대30일. 초 단위 올림/내림. 정상 preset step은 1시간/6시간/24시간, 사용자 지정은 전체 구간1개 |
| 대상 정체 | kube-system Namespace UID와 OpenCost cluster ID 매핑. Node 이름 교집합 후보가 정확히 하나이며 그 후보 모든 Node가 실제 집합에 있어야 연결 가능. 저장 Service UID 및 조회 전후 cluster UID 재검사 |
| 값 원본 | total=totalCost, cpu=cpuCost, memory=ramCost, storage=pvCost, network=networkCost. currencyCode는 대문자3자, pricingSource는 허용문자100자 이내일 때만 반환. 없으면 null |
| 반환 | currency,basis,total,cpu,memory,storage,network,idle,unallocated,status,covered,slots,observedThrough,start,end,trend,rows,previous,configured,receivedAt. partial/empty와 unconfigured는 서로 다름 |
| 비교 | compare=true이며 현재 ready·통화·가격기준 존재할 때만 이전 같은 길이 구간을 질의. 이전도 ready이고 같은 currency/basis일 때 previous를 채움. 부분·이전 조회 실패는 비교값 null |
| coverage | MAX_COVERAGE_GAP_MS=300000, MAX_COVERAGE_GAP_FRACTION=0.1. 이 기준으로 슬롯 수/covered/observedThrough를 판정하며 수집 부재를 실제 0으로 보지 않는다 |
| 근거 | `desktop/opencost.cjs:8-14,27-57,124-130,140-210`, `services.cjs:332-353`. 실 OpenCost 원본 대조 결과는 없다 |

리소스 관계는 `kube.relationships {id,kind,ns,name,uid}`가 Deployment와 Service만 받는다(`services.cjs:423-456`). 이름253자·UID128자 형식, 요청 전후 실제 UID 검사, ReplicaSet 또는 EndpointSlice 목록 limit300/continue→partial을 사용한다. 이 계약을 모든 종류의 관계 그래프로 확대했다고 표시하지 않는다. F-BE-009/TASK-F-15의 원본·대상 교체 시험에서 검사한다.

## 연결과 조사 문맥의 세부 계약

### F-BE-CONNECT-RESTORE. 로그인과 재시작 복원 <a id="F-BE-CONNECT-RESTORE"></a>

- 목표: 입력: 도구 토큰을 키체인에 저장한 뒤 재시작하고 같은 Service UID를 연다 → 기대: 사용자 로그인·직접 입력 토큰·키체인 참조로 인증하고, 재시작마다 새 binding에 실제 자격을 복원한다. 저장·인증·실제 데이터 읽기를 구분한다. 로그인 권한이 부족하면 허용된 입력과 필요한 권한을 보여 주며 기존 연결을 보존한다. → 실패: 옛 bindingId를 자격으로 쓰거나 복원 실패에도 연결됨으로 표시하면 실패.
- 현재: `apps/wake/desktop/services.cjs:30`, `apps/wake/desktop/tool-connect.cjs:15`, `apps/wake/app.config.js:29`에 연결 흐름과 자격 참조가 있다; SEC-003의 bootstrap 충돌과 계정별 재시작 검증이 남는다.
- 차이: TASK-F-04·07; T-SEC-07·08·09. Grafana Viewer·Argo 읽기 계정·Loki/Tempo·Flux를 각각 검증한다.
- 고정 장치: 고정 없음 → TASK-F-04
- 출처: D00016, D00024, D00031, D00033, D00048, D00078, D00115, D00972, D01003.

### F-BE-CONNECT-OPEN. 연결한 대상 열기 <a id="F-BE-CONNECT-OPEN"></a>

- 목표: 입력: 인증이 필요한 도구를 클릭하고 터널 연결 중 취소한다 → 기대: 누르면 즉시 대상 탭 틀을 열고 인증·터널·문서 읽기를 뒤에서 진행한다. 같은 도구 탭은 재사용하며 실패 단계와 취소·재시도를 제공한다. 연결됨은 그 대상의 현재 인증으로 실제 문서를 열 수 있다는 확인과 연결한다. 실제 화면이 없는 도구에는 웹 화면을 꾸며 만들지 않는다. → 실패: 탭 틀이 인증 완료까지 비거나 취소 뒤 다른 대상 문서가 나타나면 실패.
- 현재: `apps/wake/desktop/services.cjs:30`, `apps/wake/desktop/tools.cjs:148`, `apps/wake/app.config.js:29`에 열기 경로가 있으나 전체 도구의 인증 유지·재열기 검증은 없다.
- 차이: TASK-F-04·05. F-BE-002의 요청 예산 안에 도착한 응답을 짧은 화면 타이머로 실패 처리하지 않는다.
- 고정 장치: 고정 없음 → TASK-F-04
- 출처: D00026, D00030, D00031, D00051, D00052, D01000.

### F-BE-CONNECT-QUERY. 조회 전용 도구 API <a id="F-BE-CONNECT-QUERY"></a>

- 목표: 입력: Loki API에서 허용 질의와 쓰기 경로를 각각 전송한다 → 기대: Loki·Tempo는 등록된 조회 메서드·경로·허용 파라미터·헤더만 받는다. 결과에는 실제 본문·응답 헤더·HTTP 상태·소요 시간·크기를 보존한다. 인증 값은 노출하지 않으며 미지원 메서드·쓰기 경로를 만들지 않는다. → 실패: 쓰기 경로가 원본에 도달하거나 인증 원문이 응답 패널에 보이면 실패.
- 현재: `apps/wake/desktop/tools.cjs:77`, 조회 브리지와 `apps/wake/pages/tool-api.js:8`가 HTTP 조회를 처리한다.
- 차이: TASK-F-04·06; T-SEC-08·12. 실제 인증·응답·오류 대조와 허용 목록 전수 거절이 남는다. D00029의 Loki 터미널 요구는 D00046·D00077로 대체한다.
- 고정 장치: 고정 없음 → TASK-F-04
- 출처: D00017, D00029, D00046, D00077.

### F-BE-CONNECT-TERMINAL. 사람이 선택한 터미널 대상 <a id="F-BE-CONNECT-TERMINAL"></a>

- 목표: 입력: namespace a의 Pod 탭에서 사람이 터미널을 연다 → 기대: 사람이 일반 터미널을 열면 현재 탭의 cluster·namespace·리소스에 연결한다. 로컬 셸을 원격 대상 터미널로 가장하지 않는다. AI와 외부 도구 페이지에는 임의 셸 실행 권한을 주지 않는다. → 실패: 표시 context와 PTY 환경이 다르거나 AI가 임의 명령을 실행하면 실패.
- 현재: `apps/wake/desktop/services.cjs`의 term.env(그 화면 context·namespace로 고정한 kubeconfig), `kit/desktop/main.cjs:35`에 target·owner 경계가 있으며 실제 PTY 대상 검증은 이 실행에서 하지 않았다.
- 차이: TASK-F-04; T-SEC-18. 탭 교체·종료·취소와 잘못된 sender의 대상 재사용을 거절해야 한다.
- 고정 장치: 고정 없음 → TASK-F-04
- 출처: D00037, D00040, D00044, D00045, D00047; SEC-018, F-BE-U43.

### F-BE-CONTEXT. 화면 사이 대상과 시각 보존 <a id="F-BE-CONTEXT"></a>

- 목표: 입력: UID A의 Pod 목록에서 로그로 이동하고 같은 이름 UID B가 생긴 뒤 뒤로 간다 → 기대: 목록·상세·이벤트·로그·인시던트·GitOps·비용 이동에 cluster·namespace·kind·UID·source ID·선택 절대 시각·기간을 전달한다. 돌아오면 필터와 선택 행을 복원한다. 재생성된 같은 이름의 Pod는 다른 객체이며 UID를 모르는 과거 연결은 이름 기준이라고 밝힌다. → 실패: A의 과거 로그가 B에 연결되거나 필터·선택 행이 복원되지 않으면 실패.
- 현재: `apps/wake/pages/resource-list.js:123`, `apps/wake/pages/resource-detail.js:22`, `apps/wake/pages/events-view.js:13`에 이동과 상태 보존 경로가 있다; 모든 입구의 동일 UID·시각 검증은 없다.
- 차이: TASK-F-16·23. Event Logs는 같은 Pod UID·컨테이너로 전후 5분, 이전 컨테이너는 해당 instance를 유지한다.
- 고정 장치: 고정 없음 → TASK-F-16
- 출처: D00066, D00076, D00093, D00094, D00452, D00456.

### F-BE-HOME. 홈 판단에 필요한 실제 값 <a id="F-BE-HOME"></a>

- 목표: 입력: cluster A·1시간을 선택하고 Kubernetes·Prometheus·OpenCost 결과를 반환한다 → 기대: 선택 cluster·기간에서 CPU/Memory 사용과 할당 가능량, Ready Node, 문제 Pod, 최근 1시간 Warning, 열린 인시던트를 원본으로 제공한다. 도구·에이전트 상태와 비용은 각 실제 출처로 연결하고 출처 없는 비용·과거 추세를 만들지 않는다. → 실패: Warning 구간이 다르거나 OpenCost 출처 없이 비용 숫자가 나타나면 실패.
- 현재: `apps/wake/pages/cluster-home.js:24`, `apps/wake/data/index.js:13`, `apps/wake/desktop/reads/metrics.cjs:8`가 홈의 원본 읽기를 연결한다; 정상/누락/부분 출처 전수 대조는 남는다.
- 차이: TASK-F-02·03·13·15. 홈 요약을 누르면 같은 범위의 거른 목록으로 가야 하며 6시간 지표에는 실제 수집 구간을 제공한다.
- 고정 장치: 고정 없음 → TASK-F-02
- 출처: D00066, D00073, D00173, D00449, D00504.

## 목록 결과 계약 F-BE-TABLE <a id="F-BE-TABLE"></a>

- 목표: 입력: 열 머리 정렬·namespace 필터·행 상세 이동을 차례로 실행한다 → 기대: 기존 표의 조회·정렬·필터·행 이동을 같은 데이터 계약으로 제공한다. 화면 모양은 F-ARC-STATE를 재사용하고 새 열이나 화면은 추가하지 않는다. 기본 정렬·동점은 D-USR-2026-11-16-2를, 숨김 순서는 D-USR-2026-11-16-7의 기본값을 따른다. → 실패: 정렬된 행 UID와 상세 대상이 다르거나 결손값이 맨 앞으로 이동하면 실패.
- 현재: `apps/wake/pages/resource-list.js:19`, `apps/wake/pages/alerts.js:15`, `apps/wake/data/gitops.js:7`, `apps/wake/data/audit.js:6`, `apps/wake/data/find.js:8`의 정렬·검색·필터가 서로 다르다.
- 차이: TASK-F-23. 필터→전체 결과 정렬→페이지 순서를 고정한다. 서버 페이지 자료는 서버에서 같은 키로 정렬하며 빈 값은 방향과 무관하게 끝에 둔다. 문자열 비교는 (기본값 채택, 번복 가능) Unicode 코드포인트 기준, 숫자·시각은 원시값 기준이다.
- 고정 장치: 고정 없음 → TASK-F-23
- 출처: D00090, D00106, D00107, D00450, D00452, D00454, D00882, D01006; 옛 화면 규칙 표 규칙.
- 열 표의 공통값: 정렬 `표`는 해당 목록 기본 키·동점 키를 뜻한다. `중립`은 값 자체에 상태 색을 추가하지 않는다는 뜻이다. 툴팁 `원문`은 마스킹 후 전체 값이며 주소·자격을 추가하지 않는다. 숨김 숫자는 작은 순서부터 optional 열을 숨기는 제안, `유지`는 식별/상태 핵심 열이다. 종류별 나머지 리소스 열은 `data/kinds.js`와 해당 화면 정본을 따른다.

### F-BE-TABLE-RESOURCE. 리소스 <a id="F-BE-TABLE-RESOURCE"></a>

- 목표: → [RULE-SORT](rules.md#RULE-SORT). 문제 행 기준: status가 danger/warn인 행. 행 이동: cluster/namespace/kind/name/UID를 보존한 리소스 상세. 필터: namespace·문제 여부; Pod는 상태·Node·owner도 적용; 검색: name. SRE 판단: 현재 장애 대상과 소유자·사용량을 판별한다; 실패: 정상 행이 문제 행보다 먼저거나 결손이 앞에 오면 실패.
- 현재: `apps/wake/pages/resource-list.js:143`의 table은 all.filter(pass) 뒤 정렬 없이 slice로 페이지를 자른다.
- 차이: 필터 후 API 입력 순서로 페이지를 자르며 danger/warn·namespace/name/UID 정렬이 없다.
- 고정 장치: 고정 없음 → TASK-F-23
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00079, D00088, D00450; 정렬은 D-USR-2026-11-16-2, 필터·숨김 세부는 D-USR-2026-11-16-7로 채택.

### F-BE-TABLE-EVENT. 이벤트 <a id="F-BE-TABLE-EVENT"></a>

- 목표: → [RULE-SORT](rules.md#RULE-SORT). 문제 행 기준: 시간순 유지, 문제는 필터·톤으로 식별한다. 행 이동: 동일 대상 UID의 이벤트 상세; Logs는 같은 Pod·컨테이너의 발생 전후 5분. 필터: 절대 구간·namespace·리소스 UID·type; 검색: reason·대상 이름·message. SRE 판단: 같은 사건의 반복 증가와 새 객체의 사건을 구분한다; 실패: 이전 Warning이 최신 Normal보다 먼저거나 동시각 키가 불안정하면 실패.
- 현재: `apps/wake/data/incident-model.js:134`는 last만 정렬하고 이름+reason으로 집계한다.
- 차이: last만 정렬하고 대상 이름+reason으로 집계해 불변 키 동점·재생성 UID 구분이 없다.
- 고정 장치: 고정 없음 → TASK-F-12
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00090, D00095, D00452; 정렬은 D-USR-2026-11-16-2, 필터·숨김 세부는 D-USR-2026-11-16-7로 채택.

### F-BE-TABLE-ALERT. 알림 <a id="F-BE-TABLE-ALERT"></a>

- 목표: → [RULE-SORT](rules.md#RULE-SORT). 문제 행 기준: 시간순 유지, 문제는 필터·톤으로 식별한다. Watchdog 판정은 [RULE-CHIPS](rules.md#RULE-CHIPS)를 따른다. 행 이동: 규칙 출처·group·name·fingerprint·startsAt을 보존한 알림 상세. 필터: 구간·state·severity·namespace; 검색: name·target. SRE 판단: 활성 위험과 해제 이력을 구분한다; 실패: Watchdog가 표시되거나 상태가 최신순보다 우선하면 실패.
- 현재: `apps/wake/pages/alerts.js:34`, `apps/wake/data/alerts.js:10`가 변환·필터·페이지를 처리한다.
- 차이: 알림 변환·필터는 있으나 같은 시각의 불변 키 정렬이 고정되지 않았다.
- 고정 장치: 고정 없음 → TASK-F-16
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D01006, 정렬은 D-USR-2026-11-16-2, 필터·숨김 세부는 D-USR-2026-11-16-7로 채택.

### F-BE-TABLE-GITOPS. GitOps Application <a id="F-BE-TABLE-GITOPS"></a>

- 목표: → [RULE-SORT](rules.md#RULE-SORT). 문제 행 기준: OutOfSync, Degraded/Missing/Unknown 또는 연결된 workload 이상. 행 이동: 실제 controller·Application UID의 상세와 해당 revision/시도. 필터: controller·namespace·sync·health·절대 구간; 검색: name·repoURL·path. SRE 판단: 동기화 여부와 서비스 건강이 일치하는지 판별한다; 실패: 정상 Application이 문제 Application보다 먼저면 실패.
- 현재: `apps/wake/data/gitops.js:134`의 appRows는 appBad와 name.localeCompare만으로 정렬한다.
- 차이: appBad 불리언 뒤 name만 비교해 danger/warn 구분과 namespace·UID 동점이 없다.
- 고정 장치: 고정 없음 → TASK-F-15
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00106, D00453; 정렬은 D-USR-2026-11-16-2, 필터·숨김 세부는 D-USR-2026-11-16-7로 채택.

### F-BE-TABLE-INCIDENT. 인시던트 <a id="F-BE-TABLE-INCIDENT"></a>

- 목표: → [RULE-SORT](rules.md#RULE-SORT). 문제 행 기준: 복구 확인 전인 사건을 해결된 사건 위에 유지. 행 이동: 동일 incident ID의 작업면. 필터: cluster·namespace·phase·severity·구간; 검색: number·title·대상 이름. SRE 판단: 지금 대응할 사건과 복구 확인이 남은 사건을 판별한다. → 실패: 해결 critical이 미해결 warning보다 먼저면 실패.
- 추가 조건: 입력 동일 허용 범위에 한 페이지를 넘는 인시던트 → 기대 서버가 범위·정렬·커서에 결합된 다음 페이지를 반환 → 실패 후속 행 접근 불가·클라이언트의 타 클러스터 사후 거르기·페이지 중복/누락. 공통 판정은 [F-BE-018](backend.md#F-BE-018)에 연결한다.
- 현재: `apps/wake/desktop/incident-hub.cjs:98`의 rows는 detectedAt 내림차순이며 상태·심각도·ID 동점 비교가 없다.
- 차이: detectedAt 내림차순만 적용해 미해결·심각도 우선 정렬이 없다.
- 고정 장치: 고정 없음 → TASK-F-19
- 출처: D-USR-2026-11-16-7; D00089, D00094, D00464; 정렬 예외와 필터·숨김 세부는 D-USR-2026-11-16-7의 통일 목록을 따른다.

### F-BE-TABLE-AUDIT. AI 작업 기록 <a id="F-BE-TABLE-AUDIT"></a>

- 목표: → [RULE-SORT](rules.md#RULE-SORT). 문제 행 기준: 시간 순서를 보존한다; 실패/거절은 필터로 분리하고 최신 정상보다 임의 승격하지 않는다. 행 이동: 같은 audit ID의 요청·권한·모델·근거·승인/실행 상세; [RULE-RETENTION](rules.md#RULE-RETENTION). SRE 판단: 누가 무엇을 읽거나 결정했고 무엇이 실패했는지 재구성한다; 실패: 이전 실패가 최신 정상보다 앞으로 승격되면 실패.
- 현재: `apps/wake/data/audit.js:32`, `apps/wake/desktop/hub-tools.cjs:151`는 at 순서와 최대 500행이다.
- 차이: at 내림차순 500행 제한이며 ID 동점과 namespace/kind 범위 필터가 없다.
- 고정 장치: 고정 없음 → TASK-F-20
- 출처: D-USR-2026-11-16-2; D-USR-2026-11-16-7; D00466, D00473, D00869, D00912; 정렬은 D-USR-2026-11-16-2, 필터·숨김 세부는 D-USR-2026-11-16-7로 채택.

### F-BE-TABLE-SEARCH. 클러스터 검색 <a id="F-BE-TABLE-SEARCH"></a>

- 목표: → [RULE-SORT](rules.md#RULE-SORT). 문제 행 기준: 검색 관련성 같은 행 중 danger/warn을 우선; Completed는 정상. 행 이동: cluster/kind/namespace/name/UID를 가진 정본 상세. 필터: cluster·kind·namespace; 검색: 리소스·Application·허용 Helm 이름. SRE 판단: 여러 종류에서 같은 이름의 올바른 대상을 찾는다; 실패: 포함 일치 danger가 정확 일치보다 먼저면 실패.
- 현재: `apps/wake/data/find.js:20`의 findResources는 일치 등급·문제 여부·name 순이며 반환 필드에 UID가 없다.
- 차이: 일치 등급·문제 불리언·name만 비교하며 반환 UID와 kind·namespace 동점이 없다.
- 고정 장치: 고정 없음 → TASK-F-20
- 출처: D-USR-2026-11-16-7; D00882, D00465, D00472; 정렬 예외와 필터·숨김 세부는 D-USR-2026-11-16-7의 통일 목록을 따른다.

### F-BE-TABLE-COST. 비용 <a id="F-BE-TABLE-COST"></a>

- 목표: → [RULE-SORT](rules.md#RULE-SORT). 문제 행 기준: 권한/부분 집계는 출처 상태로 분리; 비용이 높다는 이유만으로 오류 색을 주지 않는다. 행 이동: 같은 cluster·기간·workload의 비용 상세. 필터: 기간·namespace·workload·집계 차원; 검색: namespace·workload. SRE 판단: 같은 기간의 할당 추정 비용이 큰 대상을 판별한다; 실패: 결손이 앞에 오거나 다른 통화·기간을 합쳐 정렬하면 실패.
- 현재: `apps/wake/desktop/opencost.cjs:133`, `apps/wake/data/costs.js:3`, `apps/wake/pages/costs.js:8`가 allocation을 읽고 표시한다.
- 차이: 비용 수치·결손 마지막·ID 동점은 구현되어 있다. 문자열 ID 비교는 localeCompare이므로 채택한 Unicode 코드포인트 비교와 다르다.
- 고정 장치: 고정 없음 → TASK-F-15
- 출처: D-USR-2026-11-16-7; D00107, D00111; 정렬 예외와 필터·숨김 세부는 D-USR-2026-11-16-7의 통일 목록을 따른다.

열은 F-BE-TABLE의 정렬·필터·이동과 F-ARC-STATE의 빈 값·툴팁을 상속한다. 정렬 기준의 `표`는 해당 목록 규칙을 뜻한다. 열별 표시 원본과 실패를 아래에서 판정한다.

| 목록 | 열 이름 | 열 종류 | 원본 필드·계산 | 표시 형식 | 정렬 기준 | 톤 조건 | 툴팁 | 숨김 순서 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RESOURCE | 이름 | 식별자 | metadata.name; metadata.uid | 원문 | 표 | 중립 | 이름·UID | 유지 | RESOURCE 응답의 이름에 `metadata.name; metadata.uid` 값을 넣는다 → 이름 열은 원문, 중립 톤, 이름·UID 툴팁 → 이름의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/pages/resource-list.js:98`에서 이름의 목록 행을 계산한다 | UID는 이동에 사용; 정렬 추가 | 고정 없음 → TASK-F-23 | D00447; D00450 |
| RESOURCE | namespace | 범위 | metadata.namespace | 원문 | 표 | 중립 | 원문 | 2 | RESOURCE 응답의 namespace에 `metadata.namespace` 값을 넣는다 → namespace 열은 원문, 중립 톤, 원문 툴팁 → namespace의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/pages/resource-list.js:98`에서 namespace의 목록 행을 계산한다 | cluster 범위 종류는 제외 | 고정 없음 → TASK-F-23 | D00447; D00450 |
| RESOURCE | 상태 | 상태 | kinds.js의 종류별 status 계산 | Kubernetes 원문 | 표 | 상태 | 원인·조건 | 유지 | RESOURCE 응답의 상태에 `kinds.js의 종류별 status 계산` 값을 넣는다 → 상태 열은 Kubernetes 원문, 상태 톤, 원인·조건 툴팁 → 상태의 출처 필드가 다른 값으로 바뀌거나 Kubernetes 원문 형식이 아니면 실패 | `apps/wake/pages/resource-list.js:98`에서 상태의 목록 행을 계산한다 | 종류별 문제 판정 유지 | 고정 없음 → TASK-F-23 | D00447; D00450 |
| RESOURCE | CPU·Memory | 수치 | metrics.usage rows의 cpu/memory | m·Mi 또는 종류별 % | 원시 수치→표 | 중립 | 원본 값·단위·수집시각 | 1 | RESOURCE 응답의 CPU·Memory에 `metrics.usage rows의 cpu/memory` 값을 넣는다 → CPU·Memory 열은 m·Mi 또는 종류별 %, 중립 톤, 원본 값·단위·수집시각 툴팁 → CPU·Memory의 출처 필드가 다른 값으로 바뀌거나 m·Mi 또는 종류별 % 형식이 아니면 실패 | `apps/wake/pages/resource-list.js:98`에서 CPU·Memory의 목록 행을 계산한다 | 사용/요청/할당 구분; 기본 정렬에 쓰지 않음 | 고정 없음 → TASK-F-23 | D00447; D00450 |
| EVENT | 최종 발생 | 시각 | series.lastObservedTime→lastTimestamp→eventTime→creationTimestamp | 공통 시각 | 내림→표 | 중립 | 절대 시각·시간대 | 유지 | EVENT 응답의 최종 발생에 `series.lastObservedTime→lastTimestamp→eventTime→creationTimestamp` 값을 넣는다 → 최종 발생 열은 공통 시각, 중립 톤, 절대 시각·시간대 툴팁 → 최종 발생의 출처 필드가 다른 값으로 바뀌거나 공통 시각 형식이 아니면 실패 | `apps/wake/data/incident-model.js:134`에서 최종 발생의 목록 행을 계산한다 | 동점 키 추가 | 고정 없음 → TASK-F-23 | D00452 |
| EVENT | Type | 상태 | type | Warning/Normal | 표 | Warning 경고 | 원문 | 유지 | EVENT 응답의 Type에 `type` 값을 넣는다 → Type 열은 Warning/Normal, Warning 경고 톤, 원문 툴팁 → Type의 출처 필드가 다른 값으로 바뀌거나 Warning/Normal 형식이 아니면 실패 | `apps/wake/data/incident-model.js:134`에서 Type의 목록 행을 계산한다 | Severity와 혼합 금지 | 고정 없음 → TASK-F-23 | D00452 |
| EVENT | Reason | 텍스트 | reason | 원문 | 표 | 중립 | 원문 | 유지 | EVENT 응답의 Reason에 `reason` 값을 넣는다 → Reason 열은 원문, 중립 톤, 원문 툴팁 → Reason의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/data/incident-model.js:134`에서 Reason의 목록 행을 계산한다 | 없음(확인: apps/wake/data/incident-model.js:134) | 고정 없음 → TASK-F-23 | D00452 |
| EVENT | Object | 식별자 | involvedObject 또는 regarding의 kind/ns/name/uid | kind/name | 표 | 중립 | namespace·UID | 유지 | EVENT 응답의 Object에 `involvedObject 또는 regarding의 kind/ns/name/uid` 값을 넣는다 → Object 열은 kind/name, 중립 톤, namespace·UID 툴팁 → Object의 출처 필드가 다른 값으로 바뀌거나 kind/name 형식이 아니면 실패 | `apps/wake/data/incident-model.js:134`에서 Object의 목록 행을 계산한다 | 집계 키에 UID 반영 | 고정 없음 → TASK-F-23 | D00452 |
| EVENT | Count | 수치 | series.count/count/deprecatedCount; 사건별 중복 제거 | 정수 | 원시 수→표 | 중립 | 첫·마지막 발생 | 2 | EVENT 응답의 Count에 `series.count/count/deprecatedCount; 사건별 중복 제거` 값을 넣는다 → Count 열은 정수, 중립 톤, 첫·마지막 발생 툴팁 → Count의 출처 필드가 다른 값으로 바뀌거나 정수 형식이 아니면 실패 | `apps/wake/data/incident-model.js:134`에서 Count의 목록 행을 계산한다 | 행 수와 발생 수 구분 | 고정 없음 → TASK-F-23 | D00452 |
| EVENT | Message | 텍스트 | message 또는 note | 한 줄 원문 | 표 | 중립 | 마스킹 원문 | 1 | EVENT 응답의 Message에 `message 또는 note` 값을 넣는다 → Message 열은 한 줄 원문, 중립 톤, 마스킹 원문 툴팁 → Message의 출처 필드가 다른 값으로 바뀌거나 한 줄 원문 형식이 아니면 실패 | `apps/wake/data/incident-model.js:134`에서 Message의 목록 행을 계산한다 | 동일 사건 정규화 전 원문 보존 | 고정 없음 → TASK-F-23 | D00452 |
| ALERT | 이름 | 식별자 | 규칙 name 또는 labels.alertname | 원문 | 표 | 중립 | group·이름 | 유지 | ALERT 응답의 이름에 `규칙 name 또는 labels.alertname` 값을 넣는다 → 이름 열은 원문, 중립 톤, group·이름 툴팁 → 이름의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/pages/alerts.js:34`에서 이름의 목록 행을 계산한다 | id 동점 추가 | 고정 없음 → TASK-F-23 | D00456 |
| ALERT | 상태 | 상태 | 규칙 state와 startsAt/endsAt | firing/pending/resolved | 표 | → [RULE-TONE](rules.md#RULE-TONE) | 해제·억제·silence 근거 | 유지 | ALERT 응답의 상태에 `규칙 state와 startsAt/endsAt` 값을 넣는다 → 상태 열은 firing/pending/resolved, [RULE-TONE](rules.md#RULE-TONE)의 알림 상태 톤, 해제·억제·silence 근거 툴팁 → 상태의 출처 필드가 다른 값으로 바뀌거나 firing/pending/resolved 형식이 아니면 실패 | `apps/wake/pages/alerts.js:34`에서 상태의 목록 행을 계산한다 | Watchdog 제외 | 고정 없음 → TASK-F-23 | D00456 |
| ALERT | 심각도 | 분류 | labels.severity | 원문 | → RULE-SORT | → RULE-TONE | 원문 | 3 | labels.severity 표시는 → [RULE-TONE](rules.md#RULE-TONE), 선택 정렬은 → [RULE-SORT](rules.md#RULE-SORT) | `apps/wake/pages/alerts.js:34`에서 심각도의 목록 행을 계산한다 | 상태색과 심각도 글자의 분리·선택 정렬 소비 검증 필요 | 고정 없음 → TASK-F-23 | D00456 |
| ALERT | 대상 | 식별자 | labels의 실제 대상 매핑 | 원문 | 표 | 중립 | namespace·대상 UID | 2 | ALERT 응답의 대상에 `labels의 실제 대상 매핑` 값을 넣는다 → 대상 열은 원문, 중립 톤, namespace·대상 UID 툴팁 → 대상의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/pages/alerts.js:34`에서 대상의 목록 행을 계산한다 | 추정 대상은 구별 | 고정 없음 → TASK-F-23 | D00456 |
| ALERT | 시작 | 시각 | startsAt 또는 activeAt | → RULE-TIME | 내림→표 | 중립 | → RULE-TIME | 유지 | startsAt 또는 activeAt의 표시 판정은 → [RULE-TIME](rules.md#RULE-TIME) | `apps/wake/pages/alerts.js:34`에서 시작의 목록 행을 계산한다 | 빈 시각 생성 금지 | 고정 없음 → TASK-F-23 | D00456 |
| ALERT | 인시던트 | 링크 | 실제 연결 incident.number/id | 번호 | 표 | 중립 | 사건 제목 | 1 | ALERT 응답의 인시던트에 `실제 연결 incident.number/id` 값을 넣는다 → 인시던트 열은 번호, 중립 톤, 사건 제목 툴팁 → 인시던트의 출처 필드가 다른 값으로 바뀌거나 번호 형식이 아니면 실패 | `apps/wake/pages/alerts.js:34`에서 인시던트의 목록 행을 계산한다 | 확정 연결만 제공 | 고정 없음 → TASK-F-23 | D00456 |
| GITOPS | 이름·namespace | 식별자 | Application metadata.name/namespace/uid | 원문 | 표 | 중립 | controller·UID | 유지 | GITOPS 응답의 이름·namespace에 `Application metadata.name/namespace/uid` 값을 넣는다 → 이름·namespace 열은 원문, 중립 톤, controller·UID 툴팁 → 이름·namespace의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/data/gitops.js:134`에서 이름·namespace의 목록 행을 계산한다 | UID 동점 추가 | 고정 없음 → TASK-F-23 | D00100; D00103 |
| GITOPS | Sync | 상태 | status.sync.status 또는 Flux 대응 조건 | 원문 | 표 | 문제 조건 경고 | 원본 조건 | 유지 | GITOPS 응답의 Sync에 `status.sync.status 또는 Flux 대응 조건` 값을 넣는다 → Sync 열은 원문, 문제 조건 경고 톤, 원본 조건 툴팁 → Sync의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/data/gitops.js:134`에서 Sync의 목록 행을 계산한다 | Healthy와 합치지 않음 | 고정 없음 → TASK-F-23 | D00100; D00103 |
| GITOPS | Health | 상태 | status.health.status 또는 Ready 조건 | 원문 | 표 | 상태 | 원본 조건·workload 경고 | 유지 | GITOPS 응답의 Health에 `status.health.status 또는 Ready 조건` 값을 넣는다 → Health 열은 원문, 상태 톤, 원본 조건·workload 경고 툴팁 → Health의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/data/gitops.js:134`에서 Health의 목록 행을 계산한다 | 현재 앱 건강과 workload 상태 모두 보존 | 고정 없음 → TASK-F-23 | D00100; D00103 |
| GITOPS | Revision | 식별자 | status.sync.revision/revisions와 실제 history | 짧은 표시 | 표 | 중립 | 전체 revision·source별 값 | 1 | GITOPS 응답의 Revision에 `status.sync.revision/revisions와 실제 history` 값을 넣는다 → Revision 열은 짧은 표시, 중립 톤, 전체 revision·source별 값 툴팁 → Revision의 출처 필드가 다른 값으로 바뀌거나 짧은 표시 형식이 아니면 실패 | `apps/wake/data/gitops.js:134`에서 Revision의 목록 행을 계산한다 | multi-source 누락 보완 | 고정 없음 → TASK-F-23 | D00100; D00103 |
| GITOPS | 최근 동기화 | 시각 | history.deployedAt; fallback reconciledAt는 별도 의미 | 공통 시각 | 내림→표 | 중립 | 시각의 출처·시도 | 2 | GITOPS 응답의 최근 동기화에 `history.deployedAt; fallback reconciledAt는 별도 의미` 값을 넣는다 → 최근 동기화 열은 공통 시각, 중립 톤, 시각의 출처·시도 툴팁 → 최근 동기화의 출처 필드가 다른 값으로 바뀌거나 공통 시각 형식이 아니면 실패 | `apps/wake/data/gitops.js:134`에서 최근 동기화의 목록 행을 계산한다 | 동기화와 reconcile 시각 혼동 금지 | 고정 없음 → TASK-F-23 | D00100; D00103 |
| INCIDENT | 번호·제목 | 식별자 | 저장 incident.id/number/title | 원문 | 표 | 중립 | 제목·ID | 유지 | INCIDENT 응답의 번호·제목에 `저장 incident.id/number/title` 값을 넣는다 → 번호·제목 열은 원문, 중립 톤, 제목·ID 툴팁 → 번호·제목의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/desktop/incident-hub.cjs:98`에서 번호·제목의 목록 행을 계산한다 | 안정 ID 유지 | 고정 없음 → TASK-F-23 | D00092; D00648 |
| INCIDENT | 심각도 | 분류 | severity | 원문 | 표 | 중립 | 판정 근거 | 3 | → [RULE-TONE](rules.md#RULE-TONE). | `apps/wake/desktop/incident-hub.cjs:98`에서 심각도의 목록 행을 계산한다 | 새 기본 순서 제안 | 고정 없음 → TASK-F-23 | D00092; D00648 |
| INCIDENT | 단계·결과 | 상태 | phase; resolved일 때 recovery | 사전의 명사 | 표 | 실제 단계/복구 결과 | 확인 조건·미판정 | 유지 | INCIDENT 응답의 단계·결과에 `phase; resolved일 때 recovery` 값을 넣는다 → 단계·결과 열은 사전의 명사, 실제 단계/복구 결과 톤, 확인 조건·미판정 툴팁 → 단계·결과의 출처 필드가 다른 값으로 바뀌거나 사전의 명사 형식이 아니면 실패 | `apps/wake/desktop/incident-hub.cjs:98`에서 단계·결과의 목록 행을 계산한다 | 승인을 복구로 표시 금지 | 고정 없음 → TASK-F-23 | D00092; D00648 |
| INCIDENT | 감지 | 시각 | detectedAt → rows.at | 공통 시각 | 내림→id | 중립 | 절대 시각 | 2 | INCIDENT 응답의 감지에 `detectedAt → rows.at` 값을 넣는다 → 감지 열은 공통 시각, 중립 톤, 절대 시각 툴팁 → 감지의 출처 필드가 다른 값으로 바뀌거나 공통 시각 형식이 아니면 실패 | `apps/wake/desktop/incident-hub.cjs:98`에서 감지의 목록 행을 계산한다 | 새 우선순위 제안 | 고정 없음 → TASK-F-23 | D00092; D00648 |
| INCIDENT | 걸린 시간 | 기간 | (resolvedAt 또는 now)-detectedAt | 기간 | 원시 ms→표 | 중립 | 시작·종료 시각 | 1 | INCIDENT 응답의 걸린 시간에 `(resolvedAt 또는 now)-detectedAt` 값을 넣는다 → 걸린 시간 열은 기간, 중립 톤, 시작·종료 시각 툴팁 → 걸린 시간의 출처 필드가 다른 값으로 바뀌거나 기간 형식이 아니면 실패 | `apps/wake/desktop/incident-hub.cjs:98`에서 걸린 시간의 목록 행을 계산한다 | 해결 뒤 증가 금지 | 고정 없음 → TASK-F-23 | D00092; D00648 |
| AUDIT | 시각 | 시각 | at | 공통 시각 | 내림→id | 중립 | 절대 시각 | 유지 | AUDIT 응답의 시각에 `at` 값을 넣는다 → 시각 열은 공통 시각, 중립 톤, 절대 시각 툴팁 → 시각의 출처 필드가 다른 값으로 바뀌거나 공통 시각 형식이 아니면 실패 | `apps/wake/data/audit.js:33`에서 시각의 목록 행을 계산한다 | id 동점 추가 | 고정 없음 → TASK-F-23 | D00466; D00912 |
| AUDIT | 주체·모델 | 식별자 | requester.kind/name; executor; model | 원문 | 표 | 중립 | 요청자·실행자 구분 | 유지 | AUDIT 응답의 주체·모델에 `requester.kind/name; executor; model` 값을 넣는다 → 주체·모델 열은 원문, 중립 톤, 요청자·실행자 구분 툴팁 → 주체·모델의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/data/audit.js:33`에서 주체·모델의 목록 행을 계산한다 | 누락 필드 보완 | 고정 없음 → TASK-F-23 | D00466; D00912 |
| AUDIT | 경로·도구 | 분류 | transport/client/tool/action | 원문 | 표 | 중립 | 호출·client 식별 | 2 | AUDIT 응답의 경로·도구에 `transport/client/tool/action` 값을 넣는다 → 경로·도구 열은 원문, 중립 톤, 호출·client 식별 툴팁 → 경로·도구의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/data/audit.js:33`에서 경로·도구의 목록 행을 계산한다 | 위조 caller 차단 | 고정 없음 → TASK-F-23 | D00466; D00912 |
| AUDIT | 대상·범위 | 식별자 | scope/target/target UID | 원문 | 표 | 중립 | 허용 범위 | 유지 | AUDIT 응답의 대상·범위에 `scope/target/target UID` 값을 넣는다 → 대상·범위 열은 원문, 중립 톤, 허용 범위 툴팁 → 대상·범위의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/data/audit.js:33`에서 대상·범위의 목록 행을 계산한다 | namespace/kind scope 필터 보강 | 고정 없음 → TASK-F-23 | D00466; D00912 |
| AUDIT | 결과 | 상태 | result/error | 사전 상태 | 표 | 실패 오류/거절 중립 | 마스킹한 실패 이유 | 유지 | AUDIT 응답의 결과에 `result/error` 값을 넣는다 → 결과 열은 사전 상태, 실패 오류/거절 중립 톤, 마스킹한 실패 이유 툴팁 → 결과의 출처 필드가 다른 값으로 바뀌거나 사전 상태 형식이 아니면 실패 | `apps/wake/data/audit.js:33`에서 결과의 목록 행을 계산한다 | 실행과 승인 구분 | 고정 없음 → TASK-F-23 | D00466; D00912 |
| AUDIT | 가림·전달량 | 수치 | masked; size.n/unit | 정수·단위 | 원시 수→표 | 중립 | 가린 자리·실제 전달 단위 | 1 | AUDIT 응답의 가림·전달량에 `masked; size.n/unit` 값을 넣는다 → 가림·전달량 열은 정수·단위, 중립 톤, 가린 자리·실제 전달 단위 툴팁 → 가림·전달량의 출처 필드가 다른 값으로 바뀌거나 정수·단위 형식이 아니면 실패 | `apps/wake/data/audit.js:33`에서 가림·전달량의 목록 행을 계산한다 | provider usage와 자료량 구분 | 고정 없음 → TASK-F-23 | D00466; D00912 |
| SEARCH | 이름 | 식별자 | metadata.name | 원문 | 일치 등급→표 | 중립 | 전체 이름 | 유지 | SEARCH 응답의 이름에 `metadata.name` 값을 넣는다 → 이름 열은 원문, 중립 톤, 전체 이름 툴팁 → 이름의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/data/find.js:20`에서 이름의 목록 행을 계산한다 | UID 반환 추가 | 고정 없음 → TASK-F-23 | D00063; D-USR-2026-11-16-7 |
| SEARCH | 종류·namespace | 분류 | kind/plural; metadata.namespace | 원문 | 표 | 중립 | cluster·UID | 1 | SEARCH 응답의 종류·namespace에 `kind/plural; metadata.namespace` 값을 넣는다 → 종류·namespace 열은 원문, 중립 톤, cluster·UID 툴팁 → 종류·namespace의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/data/find.js:20`에서 종류·namespace의 목록 행을 계산한다 | Application/Helm 누락 | 고정 없음 → TASK-F-23 | D00063; D-USR-2026-11-16-7 |
| SEARCH | 상태 | 상태 | 종류별 status | 원문 | 표 | 상태 | 판정 조건 | 유지 | SEARCH 응답의 상태에 `종류별 status` 값을 넣는다 → 상태 열은 원문, 상태 톤, 판정 조건 툴팁 → 상태의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/data/find.js:20`에서 상태의 목록 행을 계산한다 | Completed 정상 구분 | 고정 없음 → TASK-F-23 | D00063; D-USR-2026-11-16-7 |
| COST | 대상 | 식별자 | allocation의 namespace/workload 매핑 | 원문 | 표 | 중립 | 집계 차원·UID | 유지 | COST 응답의 대상에 `allocation의 namespace/workload 매핑` 값을 넣는다 → 대상 열은 원문, 중립 톤, 집계 차원·UID 툴팁 → 대상의 출처 필드가 다른 값으로 바뀌거나 원문 형식이 아니면 실패 | `apps/wake/pages/costs.js:138`에서 대상의 목록 행을 계산한다 | 실제 대상 대조 필요 | 고정 없음 → TASK-F-23 | D00107; D00111 |
| COST | 비용 | 수치 | allocation의 실제 기간 비용 합계 | 응답 통화·기간 | 내림→표 | 중립 | 원본 통화·기간·부분 집계 | 유지 | COST 응답의 비용에 `allocation의 실제 기간 비용 합계` 값을 넣는다 → 비용 열은 응답 통화·기간, 중립 톤, 원본 통화·기간·부분 집계 툴팁 → 비용의 출처 필드가 다른 값으로 바뀌거나 응답 통화·기간 형식이 아니면 실패 | `apps/wake/pages/costs.js:138`에서 비용의 목록 행을 계산한다 | 청구 확정액으로 표시 금지 | 고정 없음 → TASK-F-23 | D00107; D00111 |
| COST | CPU·Memory | 수치 | allocation의 CPU/Memory 할당·비용 필드 | 원본 단위 | 원시 수→표 | 중립 | 계산 범위·단위 | 1 | COST 응답의 CPU·Memory에 `allocation의 CPU/Memory 할당·비용 필드` 값을 넣는다 → CPU·Memory 열은 원본 단위, 중립 톤, 계산 범위·단위 툴팁 → CPU·Memory의 출처 필드가 다른 값으로 바뀌거나 원본 단위 형식이 아니면 실패 | `apps/wake/pages/costs.js:138`에서 CPU·Memory의 목록 행을 계산한다 | 누락 비용을 0으로 만들지 않음 | 고정 없음 → TASK-F-23 | D00107; D00111 |

## 저장 방식과 수명

### F-BE-010. 허브 파일 형식과 단일 소유 <a id="F-BE-010"></a>

- 목표: 입력: 같은 version에 두 expectedVersion 쓰기를 보내고 비밀 sentinel을 저장한다 → 기대: 한 메인 소유자가 `userData/hub`에 컬렉션을 관리한다. 폴더 0700, 파일 0600이며 기록 전 모든 문자열을 공통 maskText로 가린다. 저장 레코드는 id·시각·schemaVersion·version을 가져야 하고 expectedVersion 불일치 쓰기는 거절한다. 비밀 원문은 저장하지 않는다. → 실패: 충돌 쓰기가 덮어쓰거나 파일에 sentinel 원문이 남으면 실패.
- 현재: 부분. `apps/wake/desktop/hub-store.cjs:13-95`는 NAME 정규식 `^[a-z][a-z0-9-]{0,40}$`, 파일 0600·폴더 0700, maskDeep, JSON/JSONL을 구현한다. docs.put은 read-all→replace이고 log.append는 동기 append다. schemaVersion/expectedVersion/CAS·프로세스 간 잠금·인덱스·압축은 없다. 단일 owner만으로 비동기 모델 실행의 오래된 prior 덮어쓰기까지 해결되지는 않는다.
- 차이: expectedVersion·schemaVersion·CAS가 없어 동시 문서 갱신의 오래된 사본을 거절하지 못한다.
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `the store masks every text before it is written and prunes rows older than 90 days`
- 출처: D00465, D00466, D00472, D00473, D00984
- 검사: 격리 userData에서 파일 권한·마스킹·재시작 ID와 해시 일치, 같은 version 갱신 경쟁에서 하나만 성공, 디스크 실패 시 명시 storage_error. 저장 schemaVersion 변화와 reader 호환성 시험. 파일 경로는 정해진 컬렉션명만 허용한다.

| 컬렉션/파일 | API·생성 주체 | 핵심 필드와 현재 보관 기준 | 차이·주의 |
|---|---|---|---|
| `incidents.json` | docs, incident-hub | id,at,cluster,target,rule,reasons,phase,detectedAt,resolvedAt,chosen 등; 현재 at 기준 90일 | 진행 중 참조 보호 없음 |
| `evidence.jsonl` | log, incident-hub.cite | id,at,incident,n,identity,kind,source,target,window,query,result,hits,total,collectedAt,sourceState,masked,hash,addedAfter?; 90일 | 불변 조각, 물리 내용 주소 중복 제거 없음 |
| `audit.jsonl` | log, hub/tools/runner/approvals | id,at,requester,transport,model?,tool/action,scope,target,args,result,summary,masked; 90일 | requestId/target UID/approvalId/executionId 완전 계약 미달 |
| `approvals.json` | docs, approvals | id,at,state,incident,cluster,target,title,plan,requester,transport,model,decidedBy/At,reason,prResult; 90일 | 승인 결과만으로 PR 성공 아님 |
| `conversations.json` | docs, ai-run | id,title,cluster,target?,rejectedTarget?,scope,state,archivedAt?,model,at,messages; RULE-RETENTION의 대화 정책 | 보관·복원·삭제 및 실패 질문 저장; H-001-F1 격리 시험 통과 |
| `alert-history.jsonl` | log, reads/alerts | cluster,fingerprint,labels,annotations,startsAt,endsAt,receivers,lastSeen,at=startsAt; 90일 | 갱신마다 append, 읽기에서 마지막 행 선택 |
| `events.jsonl` | log, reads/events | cluster,event,at=Event 마지막 시각; 7일 | 현재 capture는 first page 500; Event resourceVersion 미보존 |
| `source-checks.jsonl` | log, source-checks | cluster,source,target UID?,at,start,ok,ms,error?,probe?; RULE-RETENTION의 source-checks 정책 | 같은 출처·probe·결과는 1분 한 행; 저장 실패를 삼키는 경로 |
| `meta.json` | docs, incident-hub | counter 문서 n, id,at | 현재 일반 prune의 90일 적용 대상; 번호 재사용 가능성 경계 검증 필요 |
| `ai-prefs.json` | docs, ai-run | model/provider,at | 일반 TTL에 의한 설정 소실 정책 미정 |
| `ai-clients.json` | docs, hub-server | id,name,transport,scope,tokenHash,createdAt,lastCall,at | 원문 token 없음; touch가 기존 at을 보존해 일반 TTL 대상 |
| `ai-server.json` | docs, hub-server | config:mcp/api/port,id,at | 기본 꺼짐, 현재 일반 TTL 대상. 사용자 설정과 기록 TTL 분리 필요 |

위 컬렉션의 필드는 현재 저장 코드의 실제 이름이다. schemaVersion/version 등 목표 필드를 이미 저장한다고 해석하지 않는다. `connections.json`과 공급자 비밀 참조는 허브 컬렉션 밖 `services.cjs:createConnectionStore`가 소유하고 키체인 원문과 구분한다.

### F-BE-011. 근거 조각을 불변으로 저장한다 <a id="F-BE-011"></a>

- 목표: 입력: 같은 incident·UID·window·원본 조각을 두 번 수집하고 결정 후 새 조각을 추가한다 → 기대: 근거 하나는 `{n,kind,source,target:{kind,namespace,name,uid,container,containerId},window:{from,to},query,result:{lines|series|object},hits,total,collectedAt,sourceState,masked,hash}`다. 같은 조각 재수집은 같은 번호, 덮어쓰기 없음이다. 결정 후 새 근거는 addedAfter=decision이다. 화면·로그·보고서·AI는 같은 저장 조각을 읽는다. → 실패: 같은 조각 번호가 늘거나 기존 hash가 덮이거나 addedAfter가 빠지면 실패.
- 현재: 부분. `apps/wake/desktop/incident-hub.cjs:108-119`는 incident/kind/query/window/target의 SHA-256 identity와 result hash, 기존 조각 재사용, addedAfter를 구현한다. 모든 수집 경로가 uid/containerId/sourceState 전체를 채우는 것은 아니다. hash는 maskDeep 저장 전 result로 계산되므로 저장된 마스킹 결과의 해시 정의를 명확히 고정해야 한다.
- 차이: uid/containerId/sourceState 누락 경로가 있고 hash는 저장 마스킹 전 result를 기준으로 계산한다.
- 고정 장치: 고정 없음 → TASK-F-17
- 출처: D00464, D00465, D00471, D00472, D00742
- 검사: 같은 identity 두 번 수집해 n/hash/원문 불변, 다른 구간/UID/containerId는 다른 조각. 저장 전·모델 전·내보내기 마스킹 동일. 최초 수집·재열기·해결 후 보고서의 값·해시 동일. 원본 일부 실패는 누락·상태를 보존한다.

### F-BE-012. 감사 기록은 호출·결정·실행을 추적한다 <a id="F-BE-012"></a>

- 목표: 입력: 같은 requestId를 재전송하고 사람이 승인한 뒤 실행 결과를 기록한다 → 기대: id,at,requestId,incident,requester(kind/name),model,transport,tool/action,scope,target UID,permission,result,masked,approvalId/executionId를 연결한다. 요청자는 서버가 결정하고 거부도 기록한다. 도구 요청 재시도는 requestId로 중복 쓰지 않는다. 모델에 보낸 자료·양·마스킹과 실제 실행 결과를 분리한다. 화면 조회는 현재 screenCaller 정책에 따라 AI 도구 호출 감사와 구분한다. → 실패: 감사가 중복되거나 승인자·실행자·모델·전송 경로를 재구성하지 못하면 실패.
- 현재: 부분. `apps/wake/desktop/hub-tools.cjs:181-214`, `apps/wake/desktop/ai-run.cjs:75-77,169-171`, `apps/wake/desktop/approvals.cjs:52-54`가 감사를 쓴다. 현재 `approval` 필드와 목표 approvalId가 다르고 requestId/executionId·UID·커서가 일관되지 않다. query_audit는 최근순 500개·cluster prefix 필터이며 namespace 전수 필터는 없다. 모델 성공·실패 전후 자료량 의미도 보강 대상이다.
- 차이: requestId/executionId·UID·cursor 연결과 namespace/kind 감사 필터가 없다. 실제 필드 approval과 목표 approvalId도 다르다.
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `a call is checked, scoped and audited with its transport; out of scope ends forbidden and is recorded`
- 출처: D00167, D00466, D00473, D00869, D00882, D00912, D00984, D01025
- 검사: 실제 요청→도구 결과→승인→실행→검증을 ID로 추적, 다른 namespace 행 0, 500행 초과 페이지 이동에 중복·누락 0, 중복 요청 감사 1행, 비밀 원문 0; [RULE-RETENTION](rules.md#RULE-RETENTION).

### F-BE-013. 대화의 데이터 형식과 실패 보존 <a id="F-BE-013"></a>

- 목표: 입력: 질문·부분 답·error·refs가 있는 대화를 오래된 client 사본으로 다시 저장한다 → 기대: F-ARC-008을 저장 계약으로 적용한다. 사용자 메시지 id/text/time/ref, 답 text/steps/refs/error/message/rejectedTarget/time, 대화 id/target/scope/state/model/at를 보존한다. 오래된 클라이언트가 새 서버 기록을 잘라내지 않는다. 클라이언트가 만든 메시지 ID를 전송·저장·재조회에서 유지한다. 이미 저장된 ID는 다시 붙이지 않으며 같은 문장이라도 ID가 다르면 각각 보존한다. 목록 메타데이터는 본문·근거가 아니다. → 실패: 새 메시지가 지워지거나 실패 답이 빈 성공으로 읽히면 실패.
- 현재: 부분. `kit/shell/panel-engine.js`는 일반·대기 질문에 UUID를 붙이고 `apps/wake/ai-hub.js`는 기존 ID를 그대로 전송한다. `apps/wake/desktop/ai-run.cjs`의 newMessages·record·saveConversation은 메시지 ID로 중복을 제거한다. 같은 ID의 다른 내용은 저장본을 유지한다. ID 없는 과거 저장본은 목록의 안정된 키를 첫 저장부터 보존한다. `apps/wake/desktop/ai-run.cjs`는 공급자 호출 전에 질문을 저장하고, 답 저장 직전에 최신 본문을 다시 읽어 ID로 새 질문·답만 병합한다. 같은 메인 프로세스의 동시 실행은 질문을 접수 순서, 답을 완료 순서로 보존한다. archive/restore/remove 뒤 늦은 답의 보관·삭제 방어도 유지한다.
- 차이: 같은 ID의 동시 후속 질문 및 중단 후 후속 질문의 유실 반례와 진행 중 재열기 후 질문 중복(R-01)은 격리 시험에서 해소했다. 과거에 ID 없이 중복 저장된 본문은 내용으로 삭제하지 않는다. 읽기와 쓰기 사이에 await가 없는 단일 메인 프로세스 범위이며 다중 프로세스 파일 쓰기의 expectedVersion 계약은 없다. AbortSignal은 화면 소비만 중단하고 메인 공급자 요청은 계속한다. 이미 접수한 질문과 늦은 답은 저장하되 중단한 화면에는 전달하지 않는다. 실제 화면 검수는 H-001-F1과 H-009에 남는다.
- 고정 장치: `apps/wake/desktop/ai-target.test.cjs`의 run_concurrent_same_id_merges_completed_turns_without_loss, `apps/wake/ai-target-flow.test.mjs`의 stopped_first_run_and_followup_keep_both_questions_and_reverse_answers. `apps/wake/chat-lifecycle.test.mjs`의 archive_restore_remove_persist_same_id_and_preserve_audit, run_finishing_after_archive_or_delete_does_not_undo_the_change도 유지한다. `apps/wake/ai-target-flow.test.mjs`의 reopened_pending_run_followup_keeps_each_question_once·reopened_pending_run_identical_questions_keep_distinct_ids와 `apps/wake/desktop/ai-target.test.cjs`의 run_message_ids_deduplicate_replays_and_latest_save_without_comparing_text·run_legacy_saved_messages_keep_list_ids_when_reopened_and_saved가 R-01·동일 문장·최신 병합·과거 저장본을 고정한다. 실행은 [R-01 수정](tasks.md#batch1-r01)이다.
- 출처: D00078, D00167, D00465, D00472, D00734, D00984
- 검사: 공급자 미설정→복구에서 질문 2개 모두 모델/디스크/재조회에 존재. 공급자 후속 도구 호출 실패의 부분 답·steps·error 보존. 같은 ID의 동시 후속 질문 손실 0. archived bodyMissing은 실제 본문 부재의 표시이며 조회 실패와 다르다.

### F-BE-014. 보관 기간과 수집 범위를 구분한다 <a id="F-BE-014"></a>

- 목표: → [RULE-RETENTION](rules.md#RULE-RETENTION).
- 현재: 부분. `apps/wake/desktop/hub-store.cjs`의 cutoff(name)가 RULE-RETENTION의 종류별 기간과 settings.json의 wake.archive.keep을 적용한다. reads/index.cjs는 같은 정책으로 개별 log.prune을 실행하고 hub.cjs는 시작·하루 간격으로 store.prune을 실행한다. source-checks 읽기도 같은 기간을 사용한다.
- 차이: 열린 사건·참조 근거 보호 및 실제 coverage 계산은 TASK-F-17에 남는다. 대화 설정의 Electron 조작은 사용자 지시로 미검증이다.
- 고정 장치: `apps/wake/desktop/hub-store.test.cjs` — prune_default_keeps_conversations_365_days_events_7_and_other_records_90, prune_uses_saved_conversation_selection_on_restart_and_each_cleanup, source_checks_read_uses_same_retention_as_persisted_records.
- 출처: D-USR-2026-11-16-4; D00465, D00472, D00734, D00993
- 검사: → [RULE-RETENTION](rules.md#RULE-RETENTION).

### F-BE-015. 손상·쓰기 실패·강제 종료 복구 <a id="F-BE-015"></a>

- 목표: 입력: JSON 손상·쓰기 실패·rename 전후 강제 종료를 각각 주입한다 → 기대: 제안(저장 보존 규칙의 실패 처리 구체화). 손상 파일을 보존하고 storage_error를 반환한다. 빈 컬렉션으로 조용히 초기화하지 않는다. 확정된 기록은 앱 강제 종료 뒤 남아 있어야 한다. 파일·디렉터리 fsync 정책, 원자적 교체, batch 확정 경계를 명시한다. → 실패: 손상 원본이 사라지거나 storage_error 대신 빈 컬렉션이 반환되면 실패.
- 현재: 부분. `apps/wake/desktop/hub-store.cjs:29-33` docs 원자 쓰기는 임시 파일 fsync 후 rename이다. log.append는 appendFileSync로 fsync가 없고 디렉터리 fsync도 없다. 49행은 손상 JSONL 줄을 버리며, 68행은 SyntaxError를 빈 객체로 바꿔 다음 put에서 기존 손상 자료를 덮을 수 있다. 이는 U-04의 명시적인 제거 대상이다.
- 차이: 손상 JSONL 줄을 버리고 JSON SyntaxError를 빈 객체로 반환한다. append·디렉터리 fsync가 없다.
- 고정 장치: 고정 없음 → TASK-F-17
- 출처: decisions ID 없음; 아래 승인 문서에서 도출
- 검사: JSONL 중간/끝 손상, JSON 문서 파손, rename 실패, ENOSPC, 쓰기 중 SIGKILL 후 재시작을 격리 자료로 시험한다. 원본 바이트 보존·마지막 확정 ID/hash 유지·부분 손상 위치 반환·실패와 빈 결과 구분. 기존 사용자 자료로 장애 주입하지 않는다.

### F-BE-016. 압축·인덱스·메모리 상한 <a id="F-BE-016"></a>

- 목표: 입력: 같은 90일 원본을 내용 주소·차분·블록 압축으로 저장하고 target/시간 검색한다 → 기대: 기록을 압축해 장기 검색 비용을 줄인다. (기본값 채택, 번복 가능) 같은 스냅샷 내용 주소화, 시각/값 차분 및 정밀도, 오래된 블록 gzip/brotli/zstd를 비교해 선택한다. 외부 의존을 늘리지 않는다. 원본 정확도·마스킹·0600·복구 가능성을 유지한다. 조회는 시간·cluster·target 인덱스로 전체 파일 스캔을 피하고 큰 목록은 스트리밍/페이지·렌더러 필요한 필드/차분으로 다룬다. → 실패: 근거 hash·정밀도가 달라지거나 전체 스캔·무제한 메모리 증가가 남으면 실패.
- 현재: 안 됨. `apps/wake/desktop/hub-store.cjs:48-80`은 매 읽기 readFileSync/JSON.parse·전체 배열/객체 생성, docs.put 전체 파일 교체다. 압축·시간 조각·조회 인덱스·batch 쓰기·저장 버전 이전 구현은 없다. evidence identity hash는 조각 재사용이지 압축 저장이 아니다.
- 차이: 매 조회 전체 파일을 파싱하며 압축·시간 조각·인덱스·batch 저장이 없다.
- 고정 장치: 고정 없음 → TASK-F-18
- 출처: D-USR-2026-11-16-7; D00465, D00472
- 검사: 같은 데이터의 압축률, write/read CPU, 시작/복구 시간, 사람이 열람할 수 있는지 표로 비교. → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE). 정밀도 손실·중복 참조 단절 0, RSS 증가·직렬화 바이트·파일별 증가율을 전후 측정한다. 외부 의존 추가가 필요하면 승인 대상임을 명시한다.

### F-BE-017. 저장 형식 이전과 되돌리기 <a id="F-BE-017"></a>

- 목표: 입력: 서로 다른 schemaVersion 자료를 이전하다 중단하고 재개·되돌리기를 실행한다 → 기대: 현재 JSON/JSONL 자료를 새 형식으로 이전할 때 schemaVersion별 reader·writer 호환, 원본 보존, 중단 후 재개, 되돌리기 절차를 둔다. 모든 ID·시간·근거 해시·참조·실패 기록을 보존한다. 삭제·migration의 lab 전용 허용을 실제 사용자 데이터 삭제 허가로 확대하지 않는다. → 실패: ID·시각·근거 참조·실패 기록이 소실되거나 원본으로 복원할 수 없으면 실패.
- 현재: `apps/wake/desktop/hub-store.cjs:65`의 docs는 JSON 전체를 읽고 put으로 교체하며 schemaVersion별 이전·역변환 경로가 없다.
- 차이: schemaVersion별 reader/writer·중단 재개·역변환이 없어 기존 기록 이전·되돌리기를 수행할 수 없다.
- 고정 장치: 고정 없음 → TASK-F-18
- 출처: D00465, D00472
- 검사: 이전 전후 컬렉션별 레코드 수·고유 ID·필드 값·참조 도달성·해시 대조 불일치 0. 빈 자료/손상 자료/90일 경계/진행 중 incident/미완료 승인/실패 대화/클라이언트 설정을 포함한다. 임의 단계 중단 뒤 재실행은 중복 0. 롤백 후 이전 reader로 원래 자료를 읽을 수 있어야 한다.

### F-BE-018. 인시던트 감지·근거·실행의 남은 데이터 결함 <a id="F-BE-018"></a>

- 목표: 입력: AI 없이 같은 owner UID 장애 신호를 반복 전달하고 출처를 중단한다 → 기대: 규칙 기반 감지는 AI 없이 동작하며 안정 ID·소유 대상 UID·규칙·열림 창으로 묶는다. 같은 사건의 해결 뒤 재발은 repeat에 기록한다. 출처 실패로 신호가 안 보이는 것을 해결로 오판하지 않는다. 단계별 근거는 수집 당시 값을 고정한다. → 실패: 사건 ID가 매번 생기거나 출처 실패가 resolved로 바뀌면 실패.
- 추가 조건: 입력 동일 허용 범위에 한 페이지를 넘는 인시던트 → 기대 서버가 범위·정렬·커서에 결합된 다음 페이지를 반환 → 실패 후속 행 접근 불가·클라이언트의 타 클러스터 사후 거르기·페이지 중복/누락
- 현재: 부분. `apps/wake/desktop/incident-hub.cjs:24-84`가 cluster별 scan, 원본 병렬 읽기, 규칙 적용·저장·감사를 수행한다. 실패한 읽기를 arr([])로 바꾸는 경로가 있어 누락과 정상 무신호를 별도 검증해야 한다. L1 P1(PVC→Node), P2(ImagePull 전용 규칙 없음), P3(Application 없음)가 남는다. P4 네트워크/P5 rollout diff/P6 PR/P7 lab 해제도 각각 F-BE-007/008/F-ARC-009/F-BE-006에 이관한다.
- 차이: 실패한 읽기를 빈 배열로 바꾸는 경로와 ImagePull·Application 전용 감지 공백이 남는다.
- 고정 장치: 고정 없음 → TASK-F-12
- 출처: D00089, D00091, D00092, D00094, D00464, D00465, D00466, D00470, D00471, D00472, D00473, D00658, D00742, D00984, D01025, D01037
- 검사: 감지 동시 3회·재시작 동일 신호·여러 출처 같은 대상·해결 뒤 재발에서 incident ID/횟수/감사 일치. PVC/Node/이미지 오류/Application의 대상과 규칙을 검증한다. 필수 복구 조건·연속 관찰 창 충족 전 resolved 0. 데이터 누락은 미판정이다.

### F-BE-019. 삭제·복원 이력의 적용 <a id="F-BE-019"></a>

- 목표: 입력: 현재 import·IPC 등록과 삭제된 관리면·견본 어댑터 이력을 비교한다 → 기대: 이력에 존재한 기능을 현 구현으로 세지 않는다. 옛 관리면 클라이언트·견본 자료·견본 AI 어댑터는 최신 데스크톱 허브/no-sample 결정에 따라 제거 상태를 유지한다. 실제 사용자에게 필요한 온보딩·도구 연결·대화 이관은 최신 요구에 따라 복구하고 실제 실행을 확인한다.  → 실패: 삭제 파일을 현재 기능으로 세거나 no-sample 앱에 견본 연결을 복원하면 실패.
- 현재: `apps/wake/desktop/hub.cjs:35`의 createHub가 현재 읽기·저장·감지·AI를 조립한다. 옛 agent-management.cjs와 sample*.js는 작업 트리에서 삭제 상태다.
- 차이: 옛 관리면·견본 경로는 삭제됐으나 대화 no-model 유실이 남아 사용자 대화 복원까지 완료되지는 않았다.
- 고정 장치: `node kit/tools/check-release.mjs`의 배포 입력·레거시 경로 검사
- 출처: D00143, D00427, D00436, D00459, D00478, D00692, D00773, D00774, D00917, D00959, D00960, D00962, D00963, D00973, D01003, D01049
- 검사: 현재 경로의 존재·import·service 등록 대조, 옛 코드의 존재를 제품 기능으로 인용하지 않음. 연결 재시작 뒤 새 binding과 실제 인증 검증, 대화 크게 보기/재열기에서 원 ID·본문 유지. sim import 도달성 0.

### F-BE-020. 성능 측정·기능 보존·독립 판정 <a id="F-BE-020"></a>

- 목표: 입력: 격리 환경에서 같은 workload의 전후 지연·RSS·요청량·저장량을 수집한다 → 기대: 같은 격리 환경·스크립트·입력으로 전후를 측정한다. 전용 wake-lab·호스트 부하 10 이하 등 세부 조건은 F-BE-P03의 채택 기본값이다. 지연 p50/p95/p99, CPU/RSS/이벤트 루프/GC, 파일·소켓·타이머·터널, 원본 요청·바이트·재시도·timeout, IPC 직렬화, 저장 증가·fsync·prune·복구를 기록한다. 상태를 숨기거나 시험을 약화해 속도를 얻지 않는다. → 실패: 상태 숨김·시험 약화로 얻은 지연 감소를 성능 향상으로 판정하면 실패.
- 현재: 안 됨. 이번에는 성능 기준선/최종 수치를 생산하지 않았다. 부분 single-flight·세대·터널 정리는 존재하나 전 경로 backpressure·회로 차단·취소·누수 증명이 없다. `apps/wake/desktop/hub.cjs:77-85` 감지/정리 타이머와 server를 닫는 공개 close가 없고 `apps/wake/desktop/services.cjs:269,573`은 reads만 정리한다. unref는 취소가 아니다.
- 차이: 허브 감지·정리 타이머와 서버를 모두 닫는 공개 close가 없다. reads 정리만으로 전체 수명을 닫지 못한다.
- 고정 장치: 고정 없음 → TASK-F-05
- 출처: D00458, D00967
- 검사: F-BE-P03~P10의 측정·실패·중복 주입·24시간 가속·100회 해제 재연결·원본 대조·독립 검증을 연결한다. 수치와 실행 방식은 D-USR-2026-11-16-7의 검수 목표이며 실측 결과나 판매 SLA를 뜻하지 않는다. 승인된 기능·보안 보존 조건은 계속 적용한다.

## 빠지면 안 되는 조회·정합 계약

### F-BE-021. 검색과 장기 기억 <a id="F-BE-021"></a>

- 목표: 입력: 현재 리소스와 과거 incident/evidence/audit/conversation을 cluster·UID·기간으로 검색한다 → 기대: 현재 리소스 검색은 등록 종류·Application·허용 Helm 메타데이터의 조회 성공 집합과 누락 출처를 함께 반환한다. Secret은 읽지 않는다. 과거 장애 검색은 incident/evidence/audit/conversation의 시각·cluster·대상 UID로 찾고 원본 보관 밖·앱 미실행·수집 실패를 구별한다. 장기 기록을 AI에 넘길 때 조회 조건·실제 선택된 근거·마스킹 수·모델·요청자를 남긴다. → 실패: 실패 출처가 조용히 빠지거나 보관 밖 자료가 0건 성공으로 표시되면 실패.
- 현재: 부분. `apps/wake/data/find.js:8`의 FIND_KINDS는 9종이며 Application/Helm/CronJob/PVC/HPA/ReplicaSet을 포함하지 않는다. `apps/wake/app.config.js:187-196` 팔레트는 cluster 키 30초 캐시와 Promise.allSettled 뒤 성공 결과만 남기므로 누락 출처가 사라진다. 허브의 audit/incident/conversation 읽기는 있으나 파일 인덱스·통합 장기기억 조회 도구·bounded cursor 계약은 없다.
- 차이: 검색은 9종이며 Application·허용 Helm 등이 빠진다. allSettled의 실패 출처와 장기 통합 검색 cursor가 없다.
- 고정 장치: 고정 없음 → TASK-F-20
- 출처: D00465, D00466, D00472, D00473, D00734, D00882, D00912
- 검사: 현재 목록의 독립 원본 집합과 검색 집합 차이 0, 조회 실패 종류가 성공 0건으로 사라지는 경우 0. 다른 namespace·같은 이름 새 UID·90일/7일 경계·손상·미수집 구간을 포함한다. 과거 질문의 응답은 실제 저장된 근거 ID/hash를 따라갈 수 있고, 없는 기록을 기억한다고 표시하지 않는다. 결과 수와 cursor 경계의 중복·누락 0.

### F-BE-022. SLO와 원본 대조 오차 <a id="F-BE-022"></a>

- 목표: 입력: 서비스 SLO와 cluster 기본값이 다른 상태에서 동일 UID·구간의 수치를 비교한다 → 기대: 서비스별 SLO가 있으면 cluster 기본값보다 우선한다. burn rate는 비율/기간/SLO를 함께 가진다. 관측·해석·기준·확인 못함을 분리하고 과거 baseline이 없다고 0을 만들지 않는다. 아래 허용 오차를 같은 UID·절대 구간·원본 시각에 적용한다. → 실패: 기본 SLO가 우선하거나 baseline 누락을 0으로 채우거나 허용 오차를 넘으면 실패.
- 현재: 부분. `apps/wake/desktop/incident-hub.cjs:21-22,135-141`은 Service 주석 `wake.dev/slo`의 0<SLO<100을 읽고, 없으면 `apps/wake/data/incident-model.js:12` 고정 99.9를 쓴다. cluster 설정 기본값 연결은 없다. `apps/wake/data/incident-model.js:18-20,38-58` burn 계산과 구간이 있으나 `apps/wake/desktop/incident-hub.cjs:225`의 과거 표본 부재 baseline=0 경로가 남아 있다.
- 차이: cluster 기본 SLO 설정이 연결되지 않고 과거 표본이 없을 때 baseline=0으로 만드는 경로가 남는다.
- 고정 장치: 고정 없음 → TASK-F-21
- 출처: D00742
- 검사: 개수·UID·문자열·상태·승인·revision·hash는 차이 0. Prometheus 원시값은 `abs(diff) <= max(1e-9, abs(raw)*1e-6)`; 표시값은 최소 표시 단위의 1/2 이내이며 같은 반올림 함수. 로그는 같은 UID/container/window의 ns timestamp+마스킹 정규화 원문 해시 집합 100% 일치. truncated는 비교 모수를 coverage로 제한한다. 수집 시각 차이는 실제 scrape/evaluation/poll 주기 이내; 주기를 모르면 미판정. 불변 근거 hash는 오차 0.

### F-BE-023. 최신 판정과 이전 지적의 수명 <a id="F-BE-023"></a>

- 목표: 입력: 과거 FAIL 반례에 소스 수정·대역 PASS만 추가해 판정을 갱신한다 → 기대: 과거 실패는 더 최신 동일 반례 PASS가 있을 때만 닫는다. 소스 수정, 대역 시험, 브라우저, Electron, 실클러스터, 실제 모델·Git 제공자 통과는 서로 대체하지 않는다. minor도 삭제하지 않는다. → 실패: 같은 반례·같은 검증 수준 PASS 없이 FAIL이나 minor를 닫으면 실패.
- 현재: `apps/wake/desktop/ai-run.cjs:135`의 no-model 조기 반환에는 질문 저장이 없다. B1 첫 질문 유실 반례를 닫을 소스 변경이 없는 상태다.
- 차이: no-model 질문 유실의 최신 동일 반례 PASS가 없어 B1 major는 열린 상태다.
- 고정 장치: 고정 없음 → TASK-F-03
- 출처: D00007, D00019, D00458, D00967, D00987
- 검사: 아래 항목별 현재 소스와 재현 파일을 고정 사본에서 대조하고, 실패 원인이 사라진 것과 실제 재시험 PASS를 구분한다. 각 미완료 행에 TASK-F 연결 1개 이상. 실클러스터 확인을 대역 PASS로 닫는 행 0.

| 보고/지적 | 현재 적용과 후속 판정 |
|---|---|
| B1 7차 major: no-model 첫 질문 유실 | F-ARC-008/F-BE-013. TASK-F-09. 6차 저장본/오래된 사본/실패 저장 수정의 PASS와 별개 |
| B1 7차 minor: 실패 get_evidence를 읽은 근거로 셈 | F-BE-011/F-ARC-008. TASK-F-09. 번호 출현 자체로 출처를 보강하지 않는다 |
| B1 7차 minor: Restarts 잘림, 근거 Enter/Space | 화면·부품 영역으로 인계. 이 F 변경으로 고쳤다고 하지 않는다 |
| T1 4차 major F1: 같은 Service UID의 Endpoints 403에서 저장 도구 숨김 | F-BE-002. TASK-F-04. 포함 근거·현재 건강·실제 열기 가능성을 분리. same UID unverified는 저장 근거 유지, different UID/정상 빈 목록은 제거. 현재 `conn-view.js:78-84`에 같은 UID의 저장 근거를 포함하는 수정과 tool-surfaces의 해당 반례 시험이 있다. 현재 소스 수정 확인, 독립 재검증 전 과거 FAIL을 새 PASS로 바꾸지 않는다 |
| T1 4차 major F2: 열거 실패인데 상세가 ready만 표시 | TASK-F-04. hub health와 inventory failure를 각각 남기고 여섯 소비 화면에서 재시도 가능. 현재 `tool-detail.js:64-65,72`에 inventoryFailure와 다시 읽기 수정 및 tool-surfaces 반례 시험이 있다. 소스 수정 확인, 독립 판정 미갱신. 허브 ready를 무조건 error로 바꾸는 해결 금지 |
| T1 4차 minor: 미사용 수 불일치 | TASK-F-01/22. 고정본 22시험과 보고 23시험 차이, 통합 unused 24건과 과거 18건 차이를 합쳐 성공으로 보고하지 않는다 |
| U-01 3차 major: old UID 완료를 new UID ready에 적용하는 오류 | F-ARC-004. source-checks의 현재 generation 수정은 소스 관측만. TASK-F-03에서 재현 재실행 |
| U-01 3차 major: 빈 compare 자료 통과, network 대신 home 캡처 통과 | TASK-F-22. 값 행 수/원본·화면 키/라우트 정체를 검사. 원본 공백을 성공으로 처리하는 검증자 금지 |
| U-01 3차 minor: 알림 동점 정렬 | F-BE-006/TASK-F-16. U-28로 넘겼다는 사실만으로 해결 아님 |
| U-00 3차 minor: 실패 상태인데 개별 ok 표기 | TASK-F-22. 전체 판정과 개별 원본 상태를 분리해서 검증 도구 자체를 점검 |
| U-01 3차 minor: 라벨 미세 차이 | 화면 영역으로 인계. 데이터 반례와 별도로 남기며 이 F 작업으로 해결하지 않는다 |
| C1 4차 minor: clip-path 부분 잘림, filter:opacity(0) | 품질/부품 영역으로 인계. 두 검사 도구의 범위 한계이며 F의 화면 확인에서도 가시성 판정만 믿지 않는다 |
| T1 claims: Secret 읽기 스위치와 삭제 cluster 잔여 설정 | 지원하지 않는 Secret 읽기 스위치가 켜져 보이는 상태와 connections/ns/perm 잔여는 TASK-F-07/17 및 설정/보안 영역과 대조. 실제 사용자 자료는 이번에 열거나 삭제하지 않았다 |
| L1 P1~P7 | F-BE-006/007/008/018 및 F-ARC-009. 설계한 20시나리오는 실행되지 않았으므로 현재 PASS 없음 |

## tasks.md 통합용 작업 인계표

이 표는 아키텍처·백엔드의 부분·안 됨·고정 없음 항목을 빠짐없이 묶은 작업 정의다. 실제 착수·병렬 실행·코드 변경 승인을 추가로 부여하지 않는다. 먼저 기존 관문 실패를 해결할 F-03/04/09와 관련 시험·검증자 F-22를 체크포인트 후보로 넘긴다. 최종 체크포인트 순서는 tasks.md 담당이 전체 영역의 선행 조건과 함께 정한다. 새 시험 파일은 만들 대상이라고 표시하며 현재 존재하는 것으로 세지 않는다.

| 작업 ID | 요구·수정 대상 | 자동 확인·추가 고정 | 화면/원본 확인·선행 |
|---|---|---|---|
| TASK-F-01 | F-ARC-001/002, F-BE-019/023: services 조립·hub 보고 의존·옛 실행 경로/중복/unused | check-deps, unused-check, check-reuse, check-release; services/hub 시험. 삭제는 별도 구현 변경에서만 | 역의존 화면 필요; 파일 소유권 확정 선행 |
| TASK-F-02 | F-ARC-003, F-BE-001: reads/cluster, index, hub-tools, observability 경로 통합 | `node --test apps/wake/desktop/reads/reads.test.cjs apps/wake/desktop/hub.test.cjs`; 3전송+화면 동일 결과 시험 신설 | 실제 원본·화면 필요; F-03/06 |
| TASK-F-03 | F-ARC-004, F-BE-003: source-checks, metrics, data/live | 위 reads 시험 + `node --test apps/wake/data/live.test.mjs`; old/new UID·release·probe·coverage 반례 고정 | 네트워크/지표/홈 실제 대조; U-01 재판정 선행 |
| TASK-F-04 | F-BE-002/023: tools, conn-view, tool-connection-limits, reads 오류 adapter | `node --test apps/wake/desktop/tools.test.cjs apps/wake/tool-surfaces.test.mjs apps/wake/data/conn-view.test.mjs`; 같은 UID Endpoints 403·열거 실패 6화면 고정 | Electron dark/light 1280/1680 필요; T1 소유권 인수 |
| TASK-F-05 | F-BE-020: hub.close, reads polling, services 종료, 터널/stdio/CLI 취소·backpressure | portforward/tools 시험 + 주기 겹침/100회 release/종료 누수 시험 신설 | 실클러스터 24시간 가속·자원 측정; F-22 기준선 |
| TASK-F-06 | F-ARC-003/005/011, F-BE-003/005: hub-tools/서버/화면 relay 계약·scope | hub.test + 18스키마 전체 경계·screen/audit 반환 범위 시험 신설 | 3전송 동일 원본·화면 필요; F-03/07 |
| TASK-F-07 | F-ARC-005/010, F-BE-008/009: services kube.get·hub-tools·agent RBAC·Helm metadata | hub/agent/services-agent/ownership 시험; Secret GET/LIST/WATCH 요청 0 반례 | can-i와 실제 digest/허용 metadata 대조; D-01 |
| TASK-F-08 | F-ARC-006: hub-server/mcp-stdio 자동 포트·discovery·취소/상한 | hub.test + 충돌 포트·token revoke·stdio loopback/timeout/queue 시험 신설 | 실제 외부 AI 연결 필요; F-06 |
| TASK-F-09 | F-ARC-007/008, F-BE-011/013: ai-run/ai-hub/panel-engine/services 대화 저장·실패 인용·보관 | `node --test apps/wake/desktop/ai-target.test.cjs apps/wake/ai-hub.test.mjs kit/shell/panel-engine.test.mjs`; B1 no-model·stale copy·실패 refs 재현 이관 | 실제 대화 재열기/연결복구 필요; F-17 CAS 후 재경쟁 |
| TASK-F-10 | F-ARC-007: ai-run/ai-cli/provider 연결 API·구독 CLI | 공급자별 실제 응답 스키마·실패/취소/도구 반복 고정, 공급자 대역과 실제 결과 분리 | 실제 허용 공급자 각각 필요; F-09/06 |
| TASK-F-11 | F-ARC-009, F-BE-008: approvals/Git 계정/PR provider/실행 기록 | ownership/hub 시험 + base/head SHA·중복 PR·실패 회복·수동 실행 검증 시험 신설 | 승인 후 전용 시험 Git 원본 대조, merge는 별도 사람 결정; F-07/12/17 |
| TASK-F-12 | F-BE-004/006/012/018, 최적화 2-1: 이벤트·알림·감사·승인·PR 중복 키 | 경로별 10회 Event/3회 scan/410/replay/역순/24시간 저장 중복0 시험 신설 | 실제 4화면+desktop/MCP/HTTP 동시 호출; F-17 |
| TASK-F-13 | F-ARC-010, F-BE-009: agent/heartbeat/설치 차트 | agent.test, agent-heartbeat.test, services-agent.test + watch410·노드 교체·stale 고정 | 전용 클러스터 설치부터 digest/Lease 대조; F-07 |
| TASK-F-14 | F-ARC-011: hub 보고 계층/무인시던트 check·내보내기 | hub.test + check/status/postmortem의 동일 snapshot 계약 신설 | Electron PDF 모든 쪽·Markdown·채널 원문 대조; F-11/17 |
| TASK-F-15 | F-BE-007/008/018: reads/network, incident-detect/hub, rollout diff L1 P1~P5 | reads/incident-detect/incident-model/ownership/gitops-deployment 시험 + PVC/ImagePull/Application/config-only 반례 | L1 20시나리오 중 해당 실원본 필요; F-03/12 |
| TASK-F-16 | F-BE-004/005/006: events/alerts/log-levels/pod-logs·pagination | reads/pod-logs/log-excerpt 시험 + 같은 ns timestamp·500경계·stable tie·TTL·fingerprint 없음 고정 | 원본 로그/이벤트/알림 실제 대조; F-03/12 |
| TASK-F-17 | F-BE-010/013/014/015: hub-store·저장 오류·CAS·TTL·settings | hub.test + 저장 손상/ENOSPC/SIGKILL/CAS/진행 incident 참조 보호 시험 신설 | 격리 실제 기록·재시작과 설정 화면; U-04/D-06 |
| TASK-F-18 | F-BE-016/017/021: storage 압축·인덱스·migration | 압축 왕복/인덱스 재구성/이전·롤백 시험 신설; 90일 크기·CPU 비교 | 이전 실제 자료 사본 검증; F-17/22, 형식 선택 검토 |
| TASK-F-19 | F-BE-018: incident-hub·복구 관찰 창·재발 | incident-model/detect 시험 + 실패 출처→미판정·관찰 누락·repeat 고정 | L1 장애/복구·재발 실원본; F-12/15 |
| TASK-F-20 | F-BE-021: data/find·app.config·허브 장기 검색 | find.test + 등록종류/partial/UID/보관범위/cursor 시험 신설 | 검색·팔레트·과거 조사 실제 원본; F-06/18 |
| TASK-F-21 | F-BE-022: incident-hub/model·SLO 설정 | incident-model 시험 + cluster/service 우선순위·없는 baseline 고정 | 지표·인시던트 동일 시각 대조; F-03/15 |
| TASK-F-23 | F-BE-TABLE과 F-BE-CONTEXT: 기존 목록의 기본 정렬·동점·필터·UID 이동 | data/find·audit·gitops·incident-model 시험에 동점·빈 값·페이지 경계 반례 추가; 채택 목표에 따라 별도 구현 | 동일 UID·기간의 화면/원본 대조; F-03·06, 각 화면 소유자 협의 |
| TASK-F-22 | F-BE-020/023: 측정·검증 도구 및 판정 증거 | PLAN verify 도구의 빈행·오라우트 거절 시험, check-tests/check-ipc/check-release 및 필수 전체 점검; baseline/changes 측정 | 부하≤10, 격리 userData, 실제 원본, 독립 이중 검토. 측정은 부하/전역 잠금 규칙 준수 |

위 표의 check 도구는 `node kit/tools/<이름>.mjs`, desktop 시험은 `apps/wake/desktop/`, data 시험은 `apps/wake/data/` 아래다. 제품 작업이 실제로 시작될 때 추가할 시험의 정확한 파일·test 이름을 먼저 해당 스펙 ID에 등록한다. 현재 없는 시험을 실행됐다고 보고하지 않는다.

## 최적화 목표와 판정

D01024는 최적화 프롬프트 작성 요청이고 D01025는 중복 처리 요구다. 원천 프롬프트의 선택지·수치를 곧바로 승인으로 올리지 않는다. 아래 P 항목 중 기존 보안·데이터 계약은 해당 규칙을 따르고, 추가 측정·키·상한·방식은 D-USR-2026-11-16-7의 기본값으로 채택한다. 문서 검토는 문서만 바꾼다.

### F-BE-P00. 최적화 범위 <a id="F-BE-P00"></a>

- 목표: 입력: 같은 workload로 읽기·저장·감지·AI·MCP·IPC를 실행한다 → 기대: (기본값 채택, 번복 가능) 읽기·저장·판단·AI·외부 연결·IPC를 같은 조건으로 측정하고 기능 보존과 성능 향상을 함께 입증한다. → 실패: 한 경계만 빨라진 결과로 전체 기능·성능 합격을 선언하면 실패.
- 현재: `apps/wake/desktop/hub.cjs:35`에 허브 조립, `apps/wake/desktop/hub-store.cjs:45`에 동기 저장이 있으며 이 두 경계를 함께 측정한 기준선은 없다.
- 차이: TASK-F-22. 대상은 reads/k8s/tools/portforward/observability, hub-store/incident-hub/approvals, ai-run/hub-tools/hub-server/mcp-stdio, services다.
- 고정 장치: 고정 없음 → TASK-F-22
- 출처: D-USR-2026-11-16-7; D01024, D01025.

### F-BE-P01. 기능과 성능의 동시 합격 <a id="F-BE-P01"></a>

- 목표: 입력: 전후 workload와 P08 실패 반례를 같은 소스에서 실행한다 → 기대: (기본값 채택, 번복 가능) 같은 workload에서 지연·자원·요청·저장량의 전후 수치를 제시하고 F-BE-P08 기능 반례를 모두 통과한다. → 실패: 자원이 줄어도 실패 상태·회복 반례가 하나라도 깨지면 실패.
- 현재: `apps/wake/desktop/hub-store.cjs:45`의 동기 전체 읽기와 `apps/wake/desktop/reads/index.cjs:33`의 주기 수집은 존재하며 비용 기준선은 없다.
- 차이: TASK-F-22. 수치가 없는 최적화 완료 주장을 제거하고 미달 지표의 원인·다음 수단을 남긴다.
- 고정 장치: 고정 없음 → TASK-F-22
- 출처: D-USR-2026-11-16-7; D01024; F-BE-020·023.

### F-BE-P02. 보존 조건 <a id="F-BE-P02"></a>

- 목표: 입력: 403·stale·Secret 입력을 최적화 전후 IPC/MCP/HTTP에 보낸다 → 기대: F-ARC-004/005·SEC-003·F-BE-023을 유지한다. 최적화로 출처 누락·권한·오래됨을 정상으로 바꾸거나 시험을 약화하지 않는다. 확인된 결함 외의 IPC·MCP·HTTP 계약을 바꾸지 않고 동일 기능을 복제하지 않는다. → 실패: 거절이 정상으로 바뀌거나 같은 기능의 복제 경로가 추가되면 실패.
- 현재: `apps/wake/desktop/hub-tools.cjs:108`, `apps/wake/desktop/hub-store.cjs:45`, `apps/wake/desktop/reads/index.cjs:33`의 계약 차이는 해당 본문에 남아 있다.
- 차이: TASK-F-01·06·07·22. 제품 실행 경로의 sample/fixture는 금지한다. 단위시험의 합성 입력은 실제 앱 검수를 대신할 수 없다.
- 고정 장치: 고정 없음 → TASK-F-01
- 출처: D00973, D01024, D01025. 원천 프롬프트의 커밋 금지는 H-000의 문서 작업 범위로 분리한다.

### F-BE-P03. 같은 조건의 기준선 <a id="F-BE-P03"></a>

- 목표: 입력: 호스트 부하 10 이하 lab에서 같은 userData 초기본·스크립트·입력으로 측정한다 → 기대: (기본값 채택, 번복 가능) 아래 측정을 실제 전용 lab·격리 userData·호스트 부하≤10에서 같은 스크립트와 입력으로 반복한다. → 실패: 부하·입력·초기본이 다른 표본을 전후 효과로 비교하면 실패.
- 현재: `apps/wake/desktop/services.cjs:30`의 IPC, `apps/wake/desktop/hub.cjs:35`의 감지, `apps/wake/desktop/hub-store.cjs:45`의 파일 작업에 대한 통합 baseline.csv가 없다.
- 차이: TASK-F-22. 원천의 baseline.csv, CPU 프로파일·힙 스냅숏·할당 추적과 재실행 스크립트를 측정 산출물로 만든다.
- 고정 장치: 고정 없음 → TASK-F-22
- 출처: D-USR-2026-11-16-7; D01024; 원천 프롬프트 20–51행.

| 측정 영역 | 같은 조건에서 기록할 값 |
|---|---|
| 지연 | IPC·서비스별 p50/p95/p99; 홈 첫 읽기·구역 전환·리소스 목록·상세·이벤트·로그·지표 범위·감지 1회·근거 수집·MCP/HTTP 호출 |
| 규모 | Pod 1천·5천 상당 입력, 시작·1시간 유지·24시간 상당 가속 실행; 실제 수집과 부하 재현 결과 구분 |
| 프로세스 | 메인 CPU/RSS, monitorEventLoopDelay, GC 시간, 열린 파일·소켓·타이머·포워딩·WebSocket 수 |
| 네트워크 | Kubernetes와 도구의 초당/화면당 요청·같은 자료 중복 수, 응답 bytes, 재시도·timeout 수 |
| IPC | 채널별 메시지 수·bytes, renderer 객체 크기·직렬화 시간, 프레임마다 반복 호출 |
| 저장 | 컬렉션 크기·하루 증가·90일 추정, 쓰기/fsync/prune 횟수·시간, 손상 복구·시작 읽기 시간 |

### F-BE-P04. 계층과 자원 수명 <a id="F-BE-P04"></a>

- 목표: 입력: 읽기 시작·탭 닫기·cluster 해제·허브 종료를 반복해 소켓·타이머·터널을 센다 → 기대: (기본값 채택, 번복 가능) 아래 각 경계의 결함·영향·수정안을 코드 위치와 측정 또는 반례로 남기며, 데이터 상태와 화면 기능을 보존한다. → 실패: 해제 뒤 자원이 남거나 최적화 뒤 상태·표시 기능이 사라지면 실패.
- 현재: `apps/wake/desktop/services.cjs:30`에 연결 저장·GitOps 조립이 남고 `apps/wake/desktop/hub.cjs:35`는 pages의 보고서 함수를 import한다; 종료 API가 감지·정리 타이머를 모두 정리하지 않는다.
- 차이: TASK-F-01·02·05·17. structure.md에 결함별 고침/승인된 보류/결함 아님과 의존 방향 근거를 기록한다.
- 고정 장치: 고정 없음 → TASK-F-01
- 출처: D-USR-2026-11-16-7; D01024; 원천 프롬프트 52–83행.

| 경계 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| 계층 | hub 보고서 생성을 호출한다 → 노출→판단·읽기→접속·저장 단방향; 순환·별도 원본 경로·노출 계층의 업무 계산을 찾아 한 정본으로 합침 → hub.cjs가 pages를 import하면 실패 | `apps/wake/desktop/hub.cjs:65`에서 pages/incident-report-doc.js를 동적으로 읽는다 | 판단 계층이 화면 모듈에 의존한다 | 고정 없음 → TASK-F-22 | D01024; D-USR-2026-11-16-7 |
| 요청 | 같은 UID 조회를 중복 실행하고 탭을 닫는다 → 같은 요청 single-flight, requestId·세대로 늦은 응답 거절; AbortSignal을 끝까지 전달하고 화면 이탈·해제 시 요청·타이머 취소 → 두 원본 호출이 생기거나 해제 후 늦은 값이 반영되면 실패 | `apps/wake/desktop/tools.cjs:213`에서 find가 발견 요청을 공유한다 | 전체 reads 질의의 공유·취소 계약은 없다 | 고정 없음 → TASK-F-22 | D01024; D-USR-2026-11-16-7 |
| 쓰기·주기 | 같은 문서 버전에서 두 쓰기와 주기 수집을 실행한다 → 원자 쓰기·expectedVersion·쓰기 순서로 경합 차단; 감지·수집·수동 읽기 중복 시 이전 실행과 겹치지 않음 → 오래된 쓰기가 새 값을 덮거나 주기 작업이 겹치면 실패 | `apps/wake/desktop/hub-store.cjs:73`에서 docs.put이 전체 문서를 교체한다 | expectedVersion 비교가 없다 | 고정 없음 → TASK-F-22 | D01024; D-USR-2026-11-16-7 |
| 처리량 | 큰 JSON 응답을 받는 중 느린 출처 요청을 반복한다 → 큰 JSON 파싱·동기 fs·정규식·정렬의 이벤트 루프 점유 측정; 동시 요청·대기열 상한을 정하고 느린 출처에 무한 적재 금지 → 대기열이 상한 없이 증가하거나 이벤트 루프 예산을 넘으면 실패 | `apps/wake/desktop/hub-store.cjs:68`에서 readFileSync 뒤 JSON.parse를 호출한다 | 메인 동기 파싱과 전체 파일 읽기가 남는다 | 고정 없음 → TASK-F-22 | D01024; D-USR-2026-11-16-7 |
| 수집·캐시 | watch 재연결 때 같은 UID/resourceVersion을 재수신한다 → polling/watch/informer 선택 근거, resourceVersion 재사용·재연결; 캐시별 cluster·UID 키·수명·무효화·메모리 상한 명시; 화면·감지·AI 공유 → 다른 cluster 값이 캐시에 섞이거나 옛 버전이 새 상태를 덮으면 실패 | `apps/wake/desktop/reads/events.cjs:19`에서 Event 저장 캐시를 만든다 | known Map이 cluster 없이 UID를 키로 쓴다 | 고정 없음 → TASK-F-22 | D01024; D-USR-2026-11-16-7 |
| 전송 | managedFields가 큰 객체 목록을 renderer로 보낸다 → renderer에 필요한 필드만 전송, managedFields 기본 제외; 큰 배열은 페이지·차분으로 처리 → 사용하지 않는 전체 관리 필드와 배열을 매번 복제하면 실패 | `apps/wake/desktop/hub-tools.cjs:70`에서 get_resource가 managedFields를 지운다 | 큰 목록 공통 페이지·차분 전송은 없다 | 고정 없음 → TASK-F-22 | D01024; D-USR-2026-11-16-7 |
| 회복 | timeout·거절·중도 연결 끊김 뒤 출처를 복구한다 → timeout/connection/forbidden 단일 분류, 재시도 지수 백오프·상한·회로 차단 조건을 측정으로 정함 → 재시도가 무한 반복되거나 서로 다른 오류를 같은 성공으로 바꾸면 실패 | `apps/wake/desktop/reads/index.cjs:103`에서 answer가 읽기 실패를 정규화한다 | 전 경로 회로 차단·재시도 상한이 없다 | 고정 없음 → TASK-F-22 | D01024; D-USR-2026-11-16-7 |
| 종료 | cluster 해제와 앱 종료를 반복한다 → 앱 종료·클러스터 해제·실패 뒤 포워딩·소켓·watch·타이머·CLI 프로세스 잔여 0 → 포워딩·소켓·watch·타이머·CLI가 종료 후 남으면 실패 | `apps/wake/desktop/hub.cjs:77`에서 감지 타이머를 시작한다 | 허브 전체를 닫는 공개 close가 없다 | 고정 없음 → TASK-F-22 | D01024; D-USR-2026-11-16-7 |

### F-BE-P05. 사건 중복과 멱등성 <a id="F-BE-P05"></a>

- 목표: 입력: 같은 사건·승인·PR·알림 키를 재시작 포함 24시간 가속 중복 전송한다 → 기대: 중복 입력으로 사건·승인 실행·PR·알림을 증식시키지 않는다. (기본값 채택, 번복 가능) 아래 키·판정 창을 영속화하고 24시간 가속 후 중복 행 0을 검사한다. → 실패: 같은 키의 사건·실행·전송 행이 증식하면 실패.
- 현재: `apps/wake/desktop/reads/events.cjs:19`는 Event UID+count/lastAt 갱신을 append하고 `apps/wake/desktop/reads/alerts.cjs:15`는 매 조회 lastSeen을 append한다; `apps/wake/desktop/approvals.cjs:21`는 매번 UUID를 만든다.
- 차이: TASK-F-12. dedup.md에 경로·중복 원인·키·판정 창·저장 위치·시험 이름·수정 위치를 남긴다. 감사 사건의 동일 요청 재전송과 별개의 재시도는 구분한다.
- 고정 장치: 고정 없음 → TASK-F-12
- 출처: D-USR-2026-11-16-7; D01025, D01024; F-BE-004/006/012/018, F-ARC-009.

| 경로 | 제안 키·판정·저장 계약 |
|---|---|
| Event | cluster+대상 UID+reason+정규화 message로 같은 사건 집계; Event UID·resourceVersion의 전달 이력과 구분; count/series/lastTimestamp 증가는 같은 사건 행 갱신, 7일 저장 중복 방지 |
| watch·poll | cluster+UID+resourceVersion으로 재연결·410 relist·겹친 polling 중복 제거; 늦은 옛 버전은 새 상태를 덮지 않음 |
| Alertmanager·Prometheus | cluster+fingerprint+startsAt, fingerprint 없으면 정규화 labels+startsAt; 외부 라벨 사본·Watchdog 중복과 해제·재발 구분 |
| 감지 | cluster+소유자 UID+규칙+열림 창; 여러 출처의 같은 원인 신호·동시 감지·재시작 신호를 동일 인시던트로 묶음; 해결 뒤 재발은 repeat |
| CLI·IPC·타이머 | 스트림 줄 위치/실행 ID로 중복 줄 차단; 문서 수명별 구독 하나와 해제; 이전 주기 실행 중에는 다음 실행 병합 또는 건너뜀 |
| 감사 | 서버 requestId와 사건 단계별 중복 키; 동일 호출 재전송은 같은 감사 행, 모델·승인·실행의 서로 다른 사건은 각각 보존 |
| 승인·실행 | approvalId/executionId와 원자 상태 전이; 외부 AI 승인 요청은 거부하고, 두 허용된 사람 창의 중복 결정은 첫 결정/실행 1개 이하 |
| Git·PR | 재시도·timeout 후 멱등 키 또는 브랜치로 이미 만든 PR 재조회; PR 중복 생성 0 |
| 알림·토스트 | incident+단계 전이로 1회 알림; 실제 재발과 다음 단계만 새 알림 |
| MCP·HTTP | 읽기 재시도는 같은 관측에 같은 결과; propose 재전송은 같은 제안 ID; 승인·실행 호출은 항상 거절 |

검사: 같은 Event 10회 갱신, 같은 알림 재전송, watch 410 재목록, 감지 3회 동시 실행, 앱 재시작 후 같은 신호, 두 사람 창 승인 중복과 외부 승인 거절을 주입한다. 동일 사건의 인시던트·해당 감사 사건·실행·PR·알림은 각각 1개 이하이고 필요한 사건은 누락 0이다. 해제보다 늦게 도착한 발생, 오래된 resourceVersion에도 최종 상태와 원본 이력이 보존되어야 한다.

### F-BE-P06. 저장 방식 선택과 복구 <a id="F-BE-P06"></a>

- 목표: 입력: 같은 원본을 gzip/brotli/zstd·내용 주소·차분 후보로 왕복 변환한다 → 기대: 압축 비교 방식은 기본값 채택으로서 내용 주소 저장·시각/값 차분·정밀도·기간별 블록 압축(gzip/brotli/zstd)을 같은 원본으로 비교해 선택한다; [RULE-RETENTION](rules.md#RULE-RETENTION). 외부 의존·정밀도·마스킹·0600·복구 조건은 유지한다; 실패: 90/365/7일 정책·정밀도·마스킹·권한·복구가 깨지면 실패.
- 현재: `apps/wake/desktop/hub-store.cjs:45`는 JSON/JSONL 전체 읽기·동기 append·전체 문서 교체이며 압축·인덱스·형식 이전이 없다.
- 차이: TASK-F-17·18. storage.md에 압축률, 읽기/쓰기 CPU, 손상 복구, 사람이 읽을 수 있는지와 선택 이유를 기록한다. 반복 키·큰 문자열·같은 근거의 중복을 줄인다.
- 고정 장치: 고정 없음 → TASK-F-17
- 출처: D-USR-2026-11-16-4; D-USR-2026-11-16-7; D00465, D00472, D01024; 원천 프롬프트 127–157행.

검사: 기간별 조각 정리 비용, batch 확정·fsync·원자 교체, 강제 종료 후 확정 기록 보존, 시간/cluster/target 인덱스, 대용량 streaming/page·차분 IPC를 비교한다. 새 reader/writer·schemaVersion·중단 재개·원본 보존·되돌리기에서 ID·시간·해시·참조·실패 기록이 같아야 한다.

### F-BE-P07. 변경 순서와 채택 성능 기준 <a id="F-BE-P07"></a>

- 목표: 입력: 후보 하나씩 적용해 같은 측정으로 지연·RSS·요청·크기를 비교한다 → 기대: (기본값 채택, 번복 가능) 영향 대비 위험으로 변경을 정렬하고 하나씩 적용한 뒤 같은 측정으로 효과를 비교한다. 효과가 없거나 위험만 늘면 되돌린다. → 실패: 개선이 없거나 위험만 늘어난 변경을 최종 후보에 남기면 실패.
- 현재: `apps/wake/desktop/hub-store.cjs:45`·`apps/wake/desktop/hub.cjs:35`·`apps/wake/desktop/reads/index.cjs:33`의 병목 후보만 확인했다; 아래 수치의 달성 여부는 측정 전이다.
- 차이: TASK-F-22. changes.csv에 변경·지표·전·후·부하를 남긴다. [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE)는 채택된 합격 기준이며 달성 여부는 측정 전이다. 측정 부재를 기준 면제로 처리하지 않는다.
- 고정 장치: 고정 없음 → TASK-F-22
- 출처: D-USR-2026-11-16-7; D01024; 원천 프롬프트 158–170행.

| 지표 | 채택 기준 | 측정 조건 |
|---|---|---|
| IPC p95 | → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE) | 원본 대기 포함 여부와 payload 규모를 고정 |
| 동일 관측 중복 원본 요청 | → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE) | 키·구간·권한·UID·취소 수명을 고정 |
| 유휴 메인 CPU / 이벤트 루프 p99 | → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE) | 유휴 정의·호스트 사양·부하를 고정 |
| 24시간 상당 RSS 증가 | → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE)의 자원 누수 판정 | GC 뒤 안정 구간·측정 오차·회수 여부를 기록. RSS 추이만으로 누수 유무를 단정하지 않음 |
| 90일 저장 크기 | → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE) | 같은 원본·보관·정확도·복구 조건에서 비교 |
| 해제 후 연결·타이머 | → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE) | 해제 완료 시각·진행 중 취소 완료를 대조 |

원천의 최적화 종료 후보는 Wake 자체 처리 시간이 측정 오차 수준이며 대부분이 원본 응답 대기인 상태다. 그 뒤에는 watch·공유 캐시·질의 병합으로 원본 호출 감소를 검토한다. 정밀도나 기능을 낮춰 이 수치를 맞추지 않는다.

### F-BE-P08. 실패와 동시성 검증 <a id="F-BE-P08"></a>

- 목표: 입력: Prometheus 중단·권한 회수·포워딩 단절·손상·디스크 가득 참·재시작을 주입한다 → 기대: (기본값 채택, 번복 가능) 계약 시험·check-tests·verify-hub·verify-desktop과 아래 실패·부하를 같은 소스에서 재현하고 실제 상태·회복·누수 여부를 확인한다. → 실패: 실패 값이 ready로 남거나 해제 100회 뒤 자원이 누적되면 실패.
- 현재: `apps/wake/desktop/reads/index.cjs:6`, `apps/wake/desktop/tools.cjs:446` 등 부분 정리는 있으나 `apps/wake/desktop/hub.cjs:35` 전체 종료 계약과 동시 실행 상한은 부족하다.
- 차이: TASK-F-22. 출처 중단·권한 제거·복원은 전용 lab의 승인 범위와 잠금을 확보한 별도 실행에서 수행한다.
- 고정 장치: 고정 없음 → TASK-F-22
- 출처: D-USR-2026-11-16-7; D01024, D01037; 원천 프롬프트 171–188행.

검사: Prometheus STOP/CONT, Kubernetes API 지연, 권한 회수, 포워딩 단절, 저장 파일 손상, 격리 폴더 디스크 가득 참, 앱 강제 종료·재시작. 홈·인시던트·리소스·AI의 값을 같은 원본 시각에 대조한다. 화면 4개 동시 갱신·감지와 사람 조작 중첩·MCP/HTTP 동시 호출·클러스터 해제/재연결 100회에서 잘못된 상태와 남은 자원 0을 확인한다.

### F-BE-P09. 최적화 완료 조건 <a id="F-BE-P09"></a>

- 목표: 입력: 기준선·최종 측정·24시간 중복 주입·이전·되돌리기 결과를 모은다 → 기대: (기본값 채택, 번복 가능) 같은 스크립트·조건의 기준선/최종 측정, 결함별 판정, 모든 경로 중복 주입 통과, 24시간 중복 행 0, 기존 자료 이전·되돌리기, F-BE-P08 원본 대조를 갖춘다. 지정 검사 수는 악화하지 않아야 한다. → 실패: 검사 실패가 증가하거나 이전·되돌리기 결과가 빠지면 실패.
- 현재: `apps/wake/desktop/hub-store.cjs:45`의 이전·멱등·손상 보존이 미완료여서 이 완료 조건의 전체 PASS는 없다.
- 차이: TASK-F-22. 고정 사본을 두 검증자가 각각 재실행하고 코드와 결과를 독립 판정해야 한다. 측정 불가·미달은 원인·다음 수단을 남긴다.
- 고정 장치: 고정 없음 → TASK-F-22
- 출처: D-USR-2026-11-16-7; D01024, D01025; 원천 프롬프트 189–197행, F-BE-024.

### F-BE-P10. 보고 내용 <a id="F-BE-P10"></a>

- 목표: 입력: 미측정 지표와 미완료 계약이 있는 최적화 결과를 보고한다 → 기대: (기본값 채택, 번복 가능) 미완료·미측정부터 쓰고 지표 전후, 구조 결함 처리, 저장 방식 선택 근거, 필요한 계약/의존/형식 변경 결정을 제시한다. 구현자의 완료 주장과 독립 검증 판정을 구분한다. → 실패: 미측정을 0으로 채우거나 구현자 주장만 독립 합격으로 표기하면 실패.
- 현재: `apps/wake/desktop/hub-store.cjs:45`·`apps/wake/desktop/hub.cjs:35`의 결함은 F-BE-010~020에 기록했으며 전체 측정 보고는 없다.
- 차이: TASK-F-22. 판정자는 같은 고정 소스의 증거 범위에 한해 완료를 선언한다.
- 고정 장치: 고정 없음 → TASK-F-22
- 출처: D-USR-2026-11-16-7; D01024; 원천 프롬프트 198–204행.

## 지표 공통 계약 F-BE-METRICS <a id="F-BE-METRICS"></a>

- 목표: 입력: series에 필수 target과 누락·추가·잘못된 이름을 각각 보낸다 → 기대: 등록 시리즈를 이름·필수 target으로 요청하고 아래 식의 단위·labels·표본을 그대로 반환한다. target 누락·추가·잘못된 라벨은 invalid_request다. 누락은 0으로 채우지 않는다. → 실패: 잘못된 target을 질의하거나 없는 Prometheus 표본을 0으로 채우면 실패.
- 현재: `apps/wake/desktop/reads/metrics.cjs:19`에 25개 식과 target 검사가 있다. `rangeOf`는 15일·15초 배수·약 1,000 구간 상한이다; 양 끝점을 포함한 표본 수와 1,000개 목표의 경계 검사는 남는다.
- 차이: TASK-F-03·21·22. 실원본·화면·AI 값 동등성은 미검증이다. 아래 식을 현재 구현만으로 승인된 계산식이라고 간주하지 않는다.
- 고정 장치: `apps/wake/desktop/reads/reads.test.cjs` — `series definitions build PromQL from a name and Kubernetes-name labels only`
- 출처: D00451; PLAN U-09. 정확한 식·topk(5)·분모·단위는 F-BE-M01~M25의 채택 목표이며 D-USR-2026-11-16-7의 기본값으로 채택한다.
- 검사: F-BE-022의 같은 target/query/from/to/step·오차를 적용한다. 정상 0·empty·한 점·부분 실패·과거 구간을 따로 대조한다. 함수 보간 표기 `${target}`는 검증된 target만 치환한다.

각 시리즈는 F-BE-METRICS의 target 검증·오류 계약과 F-BE-022의 수치 오차를 상속한다. 아래 수치는 계산을 판별하는 합성 입력이며 실제 관측값이 아니다. 식의 선택은 D-USR-2026-11-16-7, 원본 지표 사용은 D00451을 따른다.

| 규칙 ID | 시리즈 | 필수 target | 반환 단위 | 계산식 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|---|---|---|---|
| <a id="F-BE-M01"></a>F-BE-M01 | `cluster.cpu` | 없음 | `%` | `100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))` | Prometheus에서 노드 idle rate 평균 0.8 → CPU 20%(왼쪽 식의 원본 metric·labels) → idle을 사용률로 반환하면 실패 | `apps/wake/desktop/reads/metrics.cjs:20`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:20) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M02"></a>F-BE-M02 | `cluster.mem` | 없음 | `%` | `100 * (1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))` | Prometheus에서 가용 메모리 4GiB·전체 16GiB → Memory 75%(왼쪽 식의 원본 metric·labels) → 가용량 25%를 사용량으로 반환하면 실패 | `apps/wake/desktop/reads/metrics.cjs:21`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:21) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M03"></a>F-BE-M03 | `cluster.err` | 없음 | `%` | `100 * sum(rate(nginx_ingress_controller_requests{status=~"5.."}[5m])) / sum(rate(nginx_ingress_controller_requests[5m]))` | Prometheus에서 5xx rate 2·전체 rate 100 → 오류율 2%(왼쪽 식의 원본 metric·labels) → 비율 0.02에 % 단위만 붙이면 실패 | `apps/wake/desktop/reads/metrics.cjs:22`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:22) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M04"></a>F-BE-M04 | `cluster.rps` | 없음 | `/s` | `sum(rate(nginx_ingress_controller_requests[5m]))` | Prometheus에서 ingress 요청 rate 합 50 → 요청 50/s(왼쪽 식의 원본 metric·labels) → 누적 counter를 초당 요청으로 반환하면 실패 | `apps/wake/desktop/reads/metrics.cjs:23`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:23) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M05"></a>F-BE-M05 | `cluster.cpu.byNode` | 없음 | `%` | `topk(5, 100 * (1 - avg by (nodename) ((rate(node_cpu_seconds_total{mode="idle"}[5m])) * on (instance) group_left(nodename) node_uname_info)))` | Prometheus에서 여섯 노드 CPU 사용률 10/20/30/40/50/60 → 상위 다섯 nodename의 60/50/40/30/20%(왼쪽 식의 원본 metric·labels) → instance를 Node 이름으로 표시하거나 여섯 번째를 포함하면 실패 | `apps/wake/desktop/reads/metrics.cjs:24`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:24) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M06"></a>F-BE-M06 | `cluster.mem.byNode` | 없음 | `%` | `topk(5, 100 * (1 - sum by (nodename) ((node_memory_MemAvailable_bytes) * on (instance) group_left(nodename) node_uname_info) / sum by (nodename) ((node_memory_MemTotal_bytes) * on (instance) group_left(nodename) node_uname_info)))` | Prometheus에서 노드별 available/total이 1/4·1/2 → 각 nodename 메모리 75%·50%(왼쪽 식의 원본 metric·labels) → 노드 간 용량을 합쳐 단일 비율로 만들면 실패 | `apps/wake/desktop/reads/metrics.cjs:25`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:25) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M07"></a>F-BE-M07 | `cluster.err.byNs` | 없음 | `%` | `topk(5, 100 * sum by (namespace)(rate(nginx_ingress_controller_requests{status=~"5.."}[5m])) / sum by (namespace)(rate(nginx_ingress_controller_requests[5m])))` | Prometheus에서 namespace a 5xx/전체 1/100·b 2/100 → namespace별 1%·2%, 상위 5개(왼쪽 식의 원본 metric·labels) → 다른 namespace 분모를 공유하면 실패 | `apps/wake/desktop/reads/metrics.cjs:26`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:26) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M08"></a>F-BE-M08 | `cluster.rps.byNs` | 없음 | `/s` | `topk(5, sum by (namespace) (rate(nginx_ingress_controller_requests[5m])))` | Prometheus에서 namespace a 요청 rate 10·b 20 → 각 namespace 10/s·20/s, 상위 다섯(왼쪽 식의 원본 metric·labels) → namespace 라벨을 잃으면 실패 | `apps/wake/desktop/reads/metrics.cjs:27`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:27) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M09"></a>F-BE-M09 | `ingress.err` | namespace,ingress | `%` | `100 * sum(rate(nginx_ingress_controller_requests{namespace="${namespace}",ingress="${ingress}",status=~"5.."}[5m])) / sum(rate(nginx_ingress_controller_requests{namespace="${namespace}",ingress="${ingress}"}[5m]))` | Prometheus에서 ingress web의 5xx 3/s·전체 100/s → web 오류율 3%(왼쪽 식의 원본 metric·labels) → 같은 namespace 다른 ingress의 요청을 합치면 실패 | `apps/wake/desktop/reads/metrics.cjs:28`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:28) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M10"></a>F-BE-M10 | `ingress.rps` | namespace,ingress | `/s` | `sum(rate(nginx_ingress_controller_requests{namespace="${namespace}",ingress="${ingress}"}[5m]))` | Prometheus에서 ingress web 요청 rate 17 → web 요청 17/s(왼쪽 식의 원본 metric·labels) → 필수 ingress 라벨을 생략한 질의를 허용하면 실패 | `apps/wake/desktop/reads/metrics.cjs:29`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:29) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M11"></a>F-BE-M11 | `ingress.p95` | namespace,ingress | `s` | `histogram_quantile(0.95, sum by (le) (rate(nginx_ingress_controller_request_duration_seconds_bucket{namespace="${namespace}",ingress="${ingress}"}[5m])))` | Prometheus에서 ingress web histogram_quantile 결과 0.25 → p95 0.25s(왼쪽 식의 원본 metric·labels) → bucket 경계를 지우거나 ms로 0.25를 표시하면 실패 | `apps/wake/desktop/reads/metrics.cjs:30`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:30) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M12"></a>F-BE-M12 | `service.err` | namespace,service | `%` | `100 * sum(rate(nginx_ingress_controller_requests{namespace="${namespace}",service="${service}",status=~"5.."}[5m])) / sum(rate(nginx_ingress_controller_requests{namespace="${namespace}",service="${service}"}[5m]))` | Prometheus에서 service api의 5xx rate 4·전체 100 → api 오류율 4%(왼쪽 식의 원본 metric·labels) → 다른 service 분모로 나누면 실패 | `apps/wake/desktop/reads/metrics.cjs:31`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:31) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M13"></a>F-BE-M13 | `service.rps` | namespace,service | `/s` | `sum(rate(nginx_ingress_controller_requests{namespace="${namespace}",service="${service}"}[5m]))` | Prometheus에서 service api 요청 rate 23 → api 처리량 23/s(왼쪽 식의 원본 metric·labels) → 누적 요청 수를 rate 결과 대신 내보내면 실패 | `apps/wake/desktop/reads/metrics.cjs:32`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:32) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M14"></a>F-BE-M14 | `service.p95` | namespace,service | `s` | `histogram_quantile(0.95, sum by (le) (rate(nginx_ingress_controller_request_duration_seconds_bucket{namespace="${namespace}",service="${service}"}[5m])))` | Prometheus에서 service api의 duration bucket 결과 0.5 → p95 0.5s(왼쪽 식의 원본 metric·labels) → p99 식이나 평균 지연을 사용하면 실패 | `apps/wake/desktop/reads/metrics.cjs:33`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:33) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M15"></a>F-BE-M15 | `pod.cpu` | namespace,pod | `m` | `1000 * sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}",pod="${pod}",container!=""}[5m]))` | Prometheus에서 Pod의 비어 있지 않은 container CPU rate 합 0.25 → 250m(왼쪽 식의 원본 metric·labels) → 빈 container 집계를 더하거나 0.25m를 반환하면 실패 | `apps/wake/desktop/reads/metrics.cjs:34`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:34) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M16"></a>F-BE-M16 | `pod.mem` | namespace,pod | `bytes` | `sum(container_memory_working_set_bytes{namespace="${namespace}",pod="${pod}",container!=""})` | Prometheus에서 Pod 컨테이너 working_set 합 104857600 → 104857600 bytes(왼쪽 식의 원본 metric·labels) → Mi 변환값 100에 bytes를 붙이면 실패 | `apps/wake/desktop/reads/metrics.cjs:35`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:35) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M17"></a>F-BE-M17 | `container.cpu` | namespace,pod,container | `cores` | `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}",pod="${pod}",container="${container}"}[5m]))` | Prometheus에서 container app CPU rate 0.1 → 0.1 cores(왼쪽 식의 원본 metric·labels) → Pod 합계 0.2 또는 100 cores를 반환하면 실패 | `apps/wake/desktop/reads/metrics.cjs:37`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:37) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M18"></a>F-BE-M18 | `container.mem` | namespace,pod,container | `bytes` | `sum(container_memory_working_set_bytes{namespace="${namespace}",pod="${pod}",container="${container}"})` | Prometheus에서 container app working_set 52428800 → 52428800 bytes(왼쪽 식의 원본 metric·labels) → 동일 Pod의 sidecar 메모리를 합치면 실패 | `apps/wake/desktop/reads/metrics.cjs:38`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:38) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M19"></a>F-BE-M19 | `pod.net.rx` | namespace,pod | `bytes/s` | `sum(rate(container_network_receive_bytes_total{namespace="${namespace}",pod="${pod}"}[5m]))` | Prometheus에서 Pod receive counter의 5분 rate 1024 → 수신 1024 bytes/s(왼쪽 식의 원본 metric·labels) → 누적 bytes나 송신 counter를 반환하면 실패 | `apps/wake/desktop/reads/metrics.cjs:39`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:39) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M20"></a>F-BE-M20 | `pod.net.tx` | namespace,pod | `bytes/s` | `sum(rate(container_network_transmit_bytes_total{namespace="${namespace}",pod="${pod}"}[5m]))` | Prometheus에서 Pod transmit counter의 5분 rate 2048 → 송신 2048 bytes/s(왼쪽 식의 원본 metric·labels) → 수신 값을 송신으로 뒤바꾸면 실패 | `apps/wake/desktop/reads/metrics.cjs:40`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:40) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M21"></a>F-BE-M21 | `pod.restarts1h` | namespace,pod | `(빈 문자열: 횟수)` | `sum(increase(kube_pod_container_status_restarts_total{namespace="${namespace}",pod="${pod}"}[1h]))` | Prometheus에서 재시작 counter가 최근 한 시간에 10에서 13으로 증가 → 증가량 3, unit 빈 문자열(왼쪽 식의 원본 metric·labels) → 누적값 13을 restarts1h로 반환하면 실패 | `apps/wake/desktop/reads/metrics.cjs:41`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:41) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M22"></a>F-BE-M22 | `node.cpu` | node | `%` | `100 * (1 - avg((rate(node_cpu_seconds_total{mode="idle"}[5m])) * on (instance) group_left(nodename) node_uname_info{nodename="${node}"}))` | Prometheus에서 node-a의 idle 평균 0.7 → node-a CPU 30%(왼쪽 식의 원본 metric·labels) → 다른 노드 평균을 섞으면 실패 | `apps/wake/desktop/reads/metrics.cjs:42`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:42) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M23"></a>F-BE-M23 | `node.mem` | node | `%` | `100 * (1 - sum((node_memory_MemAvailable_bytes) * on (instance) group_left(nodename) node_uname_info{nodename="${node}"}) / sum((node_memory_MemTotal_bytes) * on (instance) group_left(nodename) node_uname_info{nodename="${node}"}))` | Prometheus에서 node-a available 2GiB·total 8GiB → node-a Memory 75%(왼쪽 식의 원본 metric·labels) → nodename join 없이 전체 노드 합계를 쓰면 실패 | `apps/wake/desktop/reads/metrics.cjs:43`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:43) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M24"></a>F-BE-M24 | `node.disk` | node | `%` | `100 * max((1 - node_filesystem_avail_bytes{fstype=~"ext4\|xfs\|btrfs"} / node_filesystem_size_bytes{fstype=~"ext4\|xfs\|btrfs"}) * on (instance) group_left(nodename) node_uname_info{nodename="${node}"})` | Prometheus에서 node-a의 ext4 사용률 20%·xfs 80% → 최대 파일시스템 사용률 80%(왼쪽 식의 원본 metric·labels) → 평균 50%를 쓰거나 제외한 tmpfs를 포함하면 실패 | `apps/wake/desktop/reads/metrics.cjs:44`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:44) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |
| <a id="F-BE-M25"></a>F-BE-M25 | `pvc.used` | namespace,persistentvolumeclaim | `%` | `100 * max(kubelet_volume_stats_used_bytes{namespace="${namespace}",persistentvolumeclaim="${persistentvolumeclaim}"} / kubelet_volume_stats_capacity_bytes{namespace="${namespace}",persistentvolumeclaim="${persistentvolumeclaim}"})` | Prometheus에서 PVC data의 used 3GiB·capacity 4GiB → 사용률 75%(왼쪽 식의 원본 metric·labels) → 다른 PVC 용량을 분모로 쓰거나 사용량을 백분율로 반환하면 실패 | `apps/wake/desktop/reads/metrics.cjs:45`의 SERIES 항목 | 없음(확인: apps/wake/desktop/reads/metrics.cjs:45) | 고정 없음 → TASK-F-21 | D00451; D-USR-2026-11-16-7 |

## 작업 단위별 입력과 출력

각 단위는 아래 입력·출력·원본·위험을 연결된 규칙의 검사에 추가한다. 공통 실패 상태는 F-ARC-STATE, 대조 오차는 F-BE-022, 완료 관문은 F-BE-024를 참조한다. 원천의 미래 시험 경로는 현존하는 고정 장치로 세지 않는다. 원천 일정은 단위당 3~6시간, 시작 30분 내 원본·해시, 중간 IPC·화면, 종료 D1~D6였으며 현재 실행 일정이나 승인이 아니다.

U 항목 공통: 현재·고정 장치는 연결한 상위 규칙의 코드 위치·시험을 따른다. 단위 전체의 실행 판정은 이번에 재검증하지 않았다. 화면은 해당 영역과 함께 검수하고, 후보 파일은 착수 전에 실제 존재·소유를 확인한다.

### F-BE-U09. U-09 지표 상세: 질의·기간·현재점 정합 <a id="F-BE-U09"></a>

- 목표: F-BE-003/022를 적용한다. 입력: `id,series in registry,target,from,to,step; SLO cluster default/service override` → 기대: `모든 result label/value/timestamp/unit/query와 coverage; NaN/missing은 null`; IPC·도구 `metrics.range; metrics.usage`. → 실패: NaN이 0으로 변환되거나 target과 result 라벨이 다르면 실패.
- 현재: `apps/wake/desktop/reads/metrics.cjs:50`의 seriesQuery가 registry의 식과 단위를 반환한다.
- 차이: TASK-F-03, TASK-F-21. 제거·교체 대상: 화면별 중복 PromQL·임의 보간 점·임의 SLO 기본값. 위험·검사: 단위 seconds→ms, bytes→MiB, 비율 %; 마지막점과 현재 값 차이를 의미 없이 허용 금지.
- 고정 장치: 고정 없음 → TASK-F-03
- 출처: D00075, D00081, D00082, D00085, D00086, D00171, D00196, D00272, D00276, D00344, D00345, D00450, D00451, D00504, D00830. 결정 ID는 F-BE-003/022에 명시한다.
- 범위: 화면 `metric:cpu,metric:mem,metric:err,metric:rps`; 요구 R-031, R-032, R-043, R-063, R-071; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-07; 후행: U-08, U-10, U-11, U-12, U-13, U-14, U-15, U-16, U-17, U-18, U-19, U-20, U-21, U-22, U-23, U-24, U-31, U-34, U-45, U-46, U-47, U-48, U-49, U-50.
- 변경 후보 파일: apps/wake/desktop/reads/metrics.cjs, apps/wake/data/home.js, apps/wake/pages/cluster-home.js, apps/wake/pages/monitoring-parts.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/pages/monitoring-parts.test.mjs, kit/components/chart-card.test.mjs, kit/core/temporal-chart.js, kit/core/temporal-chart.test.mjs, kit/tools/unused-check.mjs, kit/tools/check-deps.mjs, apps/wake/data/home.test.mjs, apps/wake/pages/cluster-home.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U26. U-26 이벤트 목록·상세: 발생 횟수와 7일 이력 <a id="F-BE-U26"></a>

- 목표: F-BE-004를 적용한다. 입력: `id,ns,subjectUid,window,cursor` → 기대: `items UID/count/first/last/reason/message; partial/retainedFrom/coverage`; IPC·도구 `events.read`; [RULE-RETENTION](rules.md#RULE-RETENTION).
- 현재: `apps/wake/desktop/reads/events.cjs:19`의 changedEvents가 UID의 count·마지막 시각 변경을 저장한다.
- 차이: TASK-F-12, TASK-F-16. 제거·교체 대상: UID만으로 cluster가 다른 이벤트를 합치는 키; retainedFrom을 실제 수집 시작으로 속이는 값. 위험·검사: Event row 수와 발생 수 분리; 500개 pagination/부분 수집 누락 검사.
- 고정 장치: 고정 없음 → TASK-F-12
- 출처: D-USR-2026-11-16-7, D00064, D00090, D00091, D00092, D00095, D00452, D01025, D01039. 결정 ID는 F-BE-004에 명시한다.
- 범위: 화면 `resources 이벤트 탭,detail:*:events`; 요구 R-033, R-047, R-065, R-071; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-07; 후행: U-08, U-10, U-11, U-12, U-13, U-14, U-15, U-16, U-17, U-18, U-19, U-20, U-21, U-22, U-23, U-24, U-33, U-45, U-46, U-47, U-48, U-49, U-50.
- 변경 후보 파일: apps/wake/desktop/reads/events.cjs, apps/wake/data/index.js, apps/wake/pages/events-view.js, apps/wake/desktop/reads/reads.test.cjs, apps/wake/data/index.test.mjs

### F-BE-U27. U-27 로그 목록·발췌: 원본 줄과 전체 구간 수준 수 <a id="F-BE-U27"></a>

- 목표: F-BE-005를 적용한다. 입력: `id,ns,pod UID,container,previous,from,to,cursor,search` → 기대: `lines timestamp/ns/pod/container/text/lineId; scannedThrough/coverage; counts 범위`; IPC·도구 `kube.logs; logs.levels`. → 실패: 발췌 수가 전체 count가 되거나 Pod UID가 바뀌면 실패.
- 현재: `apps/wake/desktop/pod-logs.cjs:46`의 readPodLogWindow가 현재·이전 Pod 로그를 읽는다.
- 차이: TASK-F-16. 제거·교체 대상: Loki 실패 시 page 줄 수를 전체 level 수로 대체하는 경로. 위험·검사: 정규식/특수문자 검색, 동일 시각 중복, 이전 container, truncation과 retention 처리.
- 고정 장치: 고정 없음 → TASK-F-16
- 출처: D00064, D00093, D00095, D00096, D00097, D00098, D00099, D00114, D00117, D00452. 결정 ID는 F-BE-005에 명시한다.
- 범위: 화면 `logs,detail:pods:logs`; 요구 R-032, R-034, R-048, R-065, R-071; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-07; 후행: U-10, U-11, U-12, U-13, U-14, U-16, U-34, U-45, U-46, U-47, U-48, U-49, U-50.
- 변경 후보 파일: apps/wake/desktop/pod-logs.cjs, apps/wake/desktop/reads/log-levels.cjs, apps/wake/pages/logs.js, apps/wake/pages/log-card.js, apps/wake/data/log-excerpt.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/desktop/pod-logs.test.cjs, apps/wake/data/log-excerpt.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U28. U-28 알림 규칙 목록·상세와 90일 상태 이력 <a id="F-BE-U28"></a>

- 목표: F-BE-006를 적용한다. 입력: `id,rule group/name,from,to,step` → 기대: `rules/expr/state/activeAt/labels/annotations/history/source coverage; silence/inhibit 구분`; IPC·도구 `alerts.read; alerts.expr`. → 실패: 조회 실패가 resolved를 만들거나 다른 startsAt 재발이 합쳐지면 실패.
- 현재: `apps/wake/desktop/reads/alerts.cjs:32`의 createAlerts가 규칙·활성 알림·해제 이력을 조립한다.
- 차이: TASK-F-16. 제거·교체 대상: 15일 expr 범위를 90일 원본 시계열처럼 보이는 문구/가짜 알림. 위험·검사: 규칙 evaluation interval·for와 실제 발화시각; 사라진 알림을 해결로 단정 금지.
- 고정 장치: 고정 없음 → TASK-F-16
- 출처: D01006, D01025. 결정 ID는 F-BE-006에 명시한다.
- 범위: 화면 `alerts,alert`; 요구 R-022, R-032, R-049, R-065, R-071; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-07; 후행: U-33, U-45, U-46, U-47, U-48, U-49, U-50.
- 변경 후보 파일: apps/wake/desktop/reads/alerts.cjs, apps/wake/data/alerts.js, apps/wake/pages/alerts.js, apps/wake/pages/alert-detail.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/data/alerts.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U29. U-29 GitOps Application 목록·상세의 Sync·Health·revision <a id="F-BE-U29"></a>

- 목표: F-BE-008를 적용한다. 입력: `id,namespace,name,application UID,revision` → 기대: `sync/health/auto/by/repoURL/path/history/resource diff; 조회 불가와 정상 분리`; IPC·도구 `gitops.read; gitops.diff`. → 실패: 새 revision에 이전 Sync 성공이 붙거나 Health가 Sync로 대체되면 실패.
- 현재: `apps/wake/desktop/gitops-deployment.cjs:10`의 argoDeployment가 Sync·Health·revision과 적용 시도를 변환한다.
- 차이: TASK-F-15. 제거·교체 대상: healthy 기본값·고정 revision·다른 화면의 중복 applicationState. 위험·검사: Argo 상태와 workload 상태가 다른 경우 둘 모두 원본 보존; 자동동기화 소유 관계.
- 고정 장치: 고정 없음 → TASK-F-15
- 출처: D00050, D00063, D00100, D00101, D00102, D00103, D00104, D00105, D00106, D00453, D00505, D00618, D00624, D00625, D00636, D00659, D01037. 결정 ID는 F-BE-008에 명시한다.
- 범위: 화면 `gitops,gitops-detail:Application`; 요구 R-032, R-046, R-052, R-065; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-07; 후행: U-32, U-34, U-36, U-45, U-46, U-47, U-48, U-49, U-50.
- 변경 후보 파일: apps/wake/data/gitops.js, apps/wake/pages/gitops.js, apps/wake/pages/gitops-detail.js, apps/wake/desktop/gitops-deployment.cjs, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/desktop/gitops-deployment.test.cjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U30. U-30 Helm 릴리스 목록·상세: 일반 리소스 메타데이터 <a id="F-BE-U30"></a>

- 목표: F-BE-008·SEC-004와 승인 D-01을 적용한다. 입력: `id,namespace; 실제 리소스 UID·관측 시각` → 기대: 릴리스 이름·namespace·chart·소속 리소스. 일반 리소스의 `meta.helm.sh/release-name`, `meta.helm.sh/release-namespace`, `app.kubernetes.io/managed-by=Helm`, `helm.sh/chart`만 사용한다. revision·status·이력은 “권한 범위 밖(Secret)”, values·diff는 지원하지 않는 이유를 반환한다. IPC 후보는 `helm.releases`다; 실패: Secret 요청이 발생하거나 메타로 확인 못 하는 revision·status를 채우면 실패.
- 현재: `apps/wake/data/index.js:13`의 Helm 공급은 UNCONNECTED이며 `apps/wake/data/gitops.js:143`에는 Secret 라벨을 전제한 변환 코드가 남아 있다. 일반 리소스만으로 끝까지 이어지는 공급·화면 검증은 없다.
- 차이: TASK-F-07, T-SEC-04. Secret 본문·values 읽기와 그 입력을 전제한 변환을 제거하고 허용 필드만 연결한다. 이전 U-30의 publisher UID/time, revision·status·modifiedAt 공급 및 게시 ConfigMap 대조 설계는 D-01로 대체한다. 별도 Secret 읽기 publisher나 `agent-published.cjs`를 신설하는 것은 목표가 아니다.
- 고정 장치: 고정 없음 → TASK-F-07
- 출처: D00979, D00980, D00981.
- 범위: 화면 `gitops,gitops-detail:HelmRelease`; 요구 R-011, R-032, R-046, R-057; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-07; 후행 U-32.
- 변경 후보 파일: apps/wake/desktop/reads/helm.cjs, apps/wake/pages/gitops.js, apps/wake/pages/gitops-detail.js, apps/wake/data/gitops.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.cjs, 기존 services.test.mjs 후보는 실제 시험 배치를 확인해 정한다.

### F-BE-U31. U-31 네트워크 흐름: 관측 트래픽과 추정 관계 <a id="F-BE-U31"></a>

- 목표: F-BE-007를 적용한다. 입력: `id,from,to,step; EndpointSlice/Service UID` → 기대: `rx/err/ingress/unmapped; edge마다 observed|inferred와 원본 시간`; IPC·도구 `network.read`. → 실패: 추정 edge를 observed로 표시하거나 시각 없는 트래픽을 채우면 실패.
- 현재: `apps/wake/desktop/reads/network.cjs:11`의 네트워크 읽기가 Pod 트래픽과 EndpointSlice를 집계한다.
- 차이: TASK-F-15. 제거·교체 대상: 출처 없는 활성 연결/재전송 값, inferred를 실제 request로 세는 합성. 위험·검사: service 라벨 없는 NGINX계열과 EndpointSlice 추정 분리; total 보존과 Sankey 모양 회귀.
- 고정 장치: 고정 없음 → TASK-F-15
- 출처: D00086, D00450, D00882, D01037. 결정 ID는 F-BE-007에 명시한다.
- 범위: 화면 `network`; 요구 R-023, R-032, R-045, R-065, R-071; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-07, U-09, U-18, U-19; 후행: 최종 전체관문.
- 변경 후보 파일: apps/wake/desktop/reads/network.cjs, apps/wake/data/network.js, apps/wake/pages/network.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/data/network.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U32. U-32 검색: 등록 종류·Application·Helm까지 결과와 누락 <a id="F-BE-U32"></a>

- 목표: F-BE-021를 적용한다. 입력: `id,scope,query,kind filters; declared state` → 기대: `typed hits identity/namespace/kind/name/status plus queried/missing sources`; IPC·도구 `kube.list; gitops.read; helm.releases`. → 실패: 실패 출처가 missing에서 빠지거나 Secret을 조회하면 실패.
- 현재: `apps/wake/data/find.js:20`의 findResources 반환에 UID가 없고 검색 종류는 9종이다.
- 차이: TASK-F-20. 제거·교체 대상: FIND_KINDS 중복9종 표/실패→검색0건 변환. 위험·검사: 다른 namespace 결과 누출, 한국어 IME, 0건과 권한 없음의 차이.
- 고정 장치: 고정 없음 → TASK-F-20
- 출처: D00465, D00466, D00472, D00473, D00734, D00882, D00912. 결정 ID는 F-BE-021에 명시한다.
- 범위: 화면 `cluster-search,command-palette`; 요구 R-026, R-044, R-046, R-059; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-07, U-29, U-30; 후행: U-51.
- 변경 후보 파일: apps/wake/data/find.js, apps/wake/pages/cluster-search.js, apps/wake/data/find.test.mjs, apps/wake/app.config.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/app.config.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U33. U-33 인시던트 목록: 감지→저장→단계·결과 <a id="F-BE-U33"></a>

- 목표: F-BE-018를 적용한다. 입력: `cluster,absolute window,stable fingerprint/target UID` → 기대: `id/title/phase/result/detectedAt/duration/symptoms/alert refs; 중복 감지 id 유지`; IPC·도구 `incident.list`. → 실패: 같은 fingerprint 재전송이 새 incident ID를 만들면 실패.
- 현재: `apps/wake/desktop/incident-hub.cjs:98`의 rows가 저장 incident를 detectedAt 내림차순으로 읽는다.
- 차이: TASK-F-12, TASK-F-19. 제거·교체 대상: 견본 incident generator, 매 조회 바뀌는 id, source 실패 시 자동 resolved. 위험·검사: 이름 재사용/UID교체/재시작/중복알림/앱이 꺼진 구간 수집누락.
- 고정 장치: 고정 없음 → TASK-F-12
- 출처: D00089, D00091, D00092, D00094, D00464, D00465, D00466, D00470, D00471, D00472, D00473, D00658, D00742, D00984, D01025, D01037. 결정 ID는 F-BE-018에 명시한다.
- 범위: 화면 `incidents`; 요구 R-001, R-033, R-050, R-054, R-070; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-07, U-26, U-28; 후행: U-08, U-34, U-45, U-46, U-47, U-48, U-49, U-50.
- 변경 후보 파일: apps/wake/desktop/incident-hub.cjs, apps/wake/data/incident-detect.js, apps/wake/data/incident-model.js, apps/wake/pages/cluster-home.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/data/incident-detect.test.mjs, apps/wake/data/incident-model.test.mjs, apps/wake/pages/cluster-home.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U34. U-34 인시던트 작업면: 영향·근거·원인·복구 조건 <a id="F-BE-U34"></a>

- 목표: F-BE-018를 적용한다. 입력: `cluster,incident id,target UID,evidence revision,absolute window` → 기대: `scope/impact/timeline/evidence/hypotheses/options/checks/audit; 각 null 이유; resolved 조건별 판정`; IPC·도구 `incident.workspace`. → 실패: null 이유가 빠지거나 관측 없이 resolved가 되면 실패.
- 현재: `apps/wake/desktop/incident-hub.cjs:205`의 workspace가 영향·근거·타임라인·확인 조건을 조립한다.
- 차이: TASK-F-15, TASK-F-19. 제거·교체 대상: 해석을 관측으로 만드는 템플릿, 조치직후 해결 타이머, 부족 근거를 확신으로 변경. 위험·검사: s3 근거 부족과 s6 재발; 원인 해소와 증상 해소·확인완료 시각 분리.
- 고정 장치: 고정 없음 → TASK-F-15
- 출처: D00089, D00091, D00092, D00094, D00464, D00465, D00466, D00470, D00471, D00472, D00473, D00658, D00742, D00984, D01025, D01037. 결정 ID는 F-BE-018에 명시한다.
- 범위: 화면 `incident`; 요구 R-001, R-034, R-051, R-054, R-070, R-071; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-33, U-09, U-10, U-11, U-27, U-29; 후행: U-35, U-36, U-38, U-44, U-45, U-46, U-47, U-48, U-49, U-50, U-52.
- 변경 후보 파일: apps/wake/desktop/incident-hub.cjs, apps/wake/data/incident-model.js, apps/wake/pages/incident-detail.js, apps/wake/desktop/reads/cluster.cjs, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/data/incident-model.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U35. U-35 근거 상세: 불변 스냅숏과 원문 도달 <a id="F-BE-U35"></a>

- 목표: F-BE-011를 적용한다. 입력: `incident id,evidence n,hash,subject UID,container,query,window` → 기대: `원문/수집시각/범위/출처/hash/masked/truncated/missing intervals`; IPC·도구 `incident.workspace`. → 실패: 수집 이후 원문·hash가 바뀌거나 잘림·누락 구간이 숨겨지면 실패.
- 현재: `apps/wake/desktop/incident-hub.cjs:110`의 cite가 identity와 result hash로 기존 근거를 재사용한다.
- 차이: TASK-F-17. 제거·교체 대상: 현재 live 값을 과거 frozen evidence로 갈아끼우는 경로. 위험·검사: 삭제된 Pod·retention 만료·재시작 뒤 hash 불변; 마스킹 전후 hash 정의.
- 고정 장치: 고정 없음 → TASK-F-17
- 출처: D00464, D00465, D00471, D00472, D00742. 결정 ID는 F-BE-011에 명시한다.
- 범위: 화면 `evidence`; 요구 R-032, R-034, R-048, R-070, R-071; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-34; 후행: U-44, U-45, U-46, U-47, U-48, U-49, U-50.
- 변경 후보 파일: apps/wake/pages/incident-evidence.js, apps/wake/desktop/incident-hub.cjs, apps/wake/desktop/hub-store.cjs, apps/wake/data/incident-model.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/data/incident-model.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U36. U-36 조치 선택→사람 승인→거절·중복 방지 <a id="F-BE-U36"></a>

- 목표: F-ARC-009를 적용한다. 입력: `incident,option,target UID,resourceVersion,change paths; actor는 desktop sender` → 기대: `plan route/diff/risk/evidence/approval state; execution과 recovery는 별도`; IPC·도구 `propose_action; approval.decide`. → 실패: 중복 승인으로 첫 결정이 바뀌거나 승인만 실행 성공이 되면 실패.
- 현재: `apps/wake/desktop/approvals.cjs:43`의 decide가 이미 결정된 승인의 최초 결과를 반환한다.
- 차이: TASK-F-11, TASK-F-12. 제거·교체 대상: prompt 클릭만으로 실행된 것처럼 표시; 승인=적용/복구 처리; 항상승인. 위험·검사: scope/UID stale·replay·두 창 동시 결정·외부 API 승인 우회·권한 없는 실행.
- 고정 장치: 고정 없음 → TASK-F-11
- 출처: D00466, D00473, D00648, D00869, D00912, D00986. 결정 ID는 F-ARC-009에 명시한다.
- 범위: 화면 `approval,incident,AI-panel`; 요구 R-035, R-037, R-038, R-052, R-054; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-34, U-29; 후행: U-37, U-44, U-45, U-46, U-47, U-48, U-49, U-50, U-52.
- 변경 후보 파일: apps/wake/data/ownership.js, apps/wake/desktop/approvals.cjs, apps/wake/ai-hub.js, apps/wake/pages/incident-detail.js, kit/components/question-panel.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/data/ownership.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U37. U-37 Git 계정→Draft PR→실제 revision 추적 <a id="F-BE-U37"></a>

- 목표: F-ARC-009를 적용한다. 입력: `provider endpoint/repository/base SHA/target file/change; keychain token reference` → 기대: `실제 Draft PR URL/number/head SHA/base SHA/state; 실패단계와 retry idempotency`; IPC·도구 `git.accounts; git.draftPr (신설 승인 계약); approval.decide`. → 실패: PR API 응답 없이 URL·번호·SHA를 만들어 내면 실패.
- 현재: `apps/wake/desktop/approvals.cjs:49`의 GitHub 토큰 유무에 따라 pending 또는 github-unconnected만 기록한다.
- 차이: TASK-F-11. 제거·교체 대상: gitAccounts unconnected 상수·github token 존재만으로 pending 처리. 위험·검사: Gitea 시험은 GitHub 제공자 PASS 아님. PR 생성은 사람 승인 뒤, merge는 별도 사람 결정.
- 고정 장치: 고정 없음 → TASK-F-11
- 출처: D00466, D00473, D00648, D00869, D00912, D00986. 결정 ID는 F-ARC-009에 명시한다.
- 범위: 화면 `settings:git,approval,gitops-detail`; 요구 R-012, R-016, R-038, R-046, R-052, R-053; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-36; 후행: U-44, U-45, U-46, U-47, U-48, U-49, U-50.
- 변경 후보 파일: apps/wake/settings-pages.js, apps/wake/data/ownership.js, apps/wake/desktop/approvals.cjs, apps/wake/desktop/keychain.cjs, apps/wake/desktop/git-provider.cjs, apps/wake/desktop/git-provider.test.cjs, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/data/ownership.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U38. U-38 내장 AI 대화: 실제 모델·도구·저장 <a id="F-BE-U38"></a>

- 목표: F-ARC-007/008를 적용한다. 입력: `실제 연결 provider/model id,conversation,cluster,read-only tools` → 기대: `stream events/tool result/evidence refs/failure/cancel/conversation id; 모델 실패는 실패`; IPC·도구 `ai.providers; ai.run; ai.conversations`. → 실패: 공급자 오류가 성공 답으로 저장되거나 후속 대화 ID가 바뀌면 실패.
- 현재: `apps/wake/desktop/ai-run.cjs:135`의 모델이 없으면 첫 질문을 저장하지 않고 반환한다.
- 차이: TASK-F-09, TASK-F-10. 제거·교체 대상: 가짜 AI/고정 model list/완료 토큰을 임의 작성. 위험·검사: 연결 끊김·취소·재시작·비밀 가림·근거 없는 숫자 반증.
- 고정 장치: 고정 없음 → TASK-F-09
- 출처: D00466, D00473, D00742, D01000. 결정 ID는 F-ARC-007/008에 명시한다.
- 범위: 화면 `chat,AI-panel,settings:ai,settings:archive`; 요구 R-012, R-035, R-037, R-040, R-059, R-070; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-34; 후행: U-39.
- 변경 후보 파일: apps/wake/desktop/ai-run.cjs, apps/wake/desktop/ai.cjs, apps/wake/ai-hub.js, apps/wake/pages/chat.js, apps/wake/data/chats.js, apps/wake/settings-pages.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, kit/page/kinds/ai/chat.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U39. U-39 외부 AI 연결: 토큰·범위→동일 화면 상태 <a id="F-BE-U39"></a>

- 목표: F-ARC-005/006/011를 적용한다. 입력: `transport enabled/configured endpoint/client scope/token reference; declared keys patch` → 기대: `실제 listening endpoint; read tools 결과·applied keys/chips/open; forbidden 경계`; IPC·도구 `aiserver.state; aiserver.set; aiserver.client; get/set_screen_state`. → 실패: 해지 토큰·범위 밖 patch가 적용되거나 bind 실패가 켜짐으로 표시되면 실패.
- 현재: `apps/wake/desktop/hub-server.cjs:67`의 loopback HTTP 요청에 활성 경로와 토큰 transport를 검사한다.
- 차이: TASK-F-06, TASK-F-08. 제거·교체 대상: 고정 DEFAULT_PORT 47821; 설정 읽기 진입만으로 server set; 선언되지 않은 키 쓰기. 위험·검사: revoked token·다른 cluster screen/audit 조회·prompt의 승인 실행·충돌 포트·앱 종료.
- 고정 장치: 고정 없음 → TASK-F-06
- 출처: D00466, D00473, D00648, D00660, D00741, D00742, D00965, D00966, D00967, D00980, D00981, D00982, D00987. 결정 ID는 F-ARC-005/006/011에 명시한다.
- 범위: 화면 `settings:ai-connect,AI-panel,report`; 요구 R-012, R-016, R-036, R-037, R-039, R-041; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-38; 후행: 최종 전체관문.
- 변경 후보 파일: apps/wake/ai-connect.js, apps/wake/desktop/hub-server.cjs, apps/wake/desktop/mcp-stdio.cjs, apps/wake/desktop/hub-tools.cjs, apps/wake/ai-hub.js, kit/page/boot.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, kit/page/boot.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U40. U-40 도구 연결 목록·상세·API 응답 <a id="F-BE-U40"></a>

- 목표: F-BE-002를 적용한다. 입력: `cluster/discovered service UID/pod UID/kind/allowed route` → 기대: `실주소 binding/버전/latency/최근 오류/raw 응답/permission; 출처 미설치`; IPC·도구 `tools.find; tool.checks; tool.query; tool.op`. → 실패: 다른 Service UID binding을 재사용하거나 raw 응답에 인증 원문이 있으면 실패.
- 현재: `apps/wake/desktop/tools.cjs:405`의 query가 등록 도구 경로를 읽고 원본 응답을 반환한다.
- 차이: TASK-F-04. 제거·교체 대상: 고정 도구 주소/포트·중복 probe·연결 성공 가짜 fallback. 위험·검사: 도구 Pod 교체·토큰 다른 origin 전송·일반 HTTP200이 protocol 정상인지 확인.
- 고정 장치: 고정 없음 → TASK-F-04
- 출처: D00011, D00012, D00013, D00014, D00015, D00036, D00044, D00114, D00115, D00505, D00999. 결정 ID는 F-BE-002에 명시한다.
- 범위: 화면 `tools,tool,tool-api`; 요구 R-016, R-029, R-056, R-058, R-059; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-07; 후행: U-51.
- 변경 후보 파일: apps/wake/desktop/tools.cjs, apps/wake/desktop/tool-connect.cjs, apps/wake/desktop/reads/source-checks.cjs, apps/wake/pages/tools.js, apps/wake/pages/tool-detail.js, apps/wake/pages/tool-api.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/desktop/tools.test.cjs, apps/wake/desktop/tool-connect.test.cjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U41. U-41 시작·첫 실행·클러스터 설정: 읽기 연결과 권한 <a id="F-BE-U41"></a>

- 목표: F-BE-002/019를 적용한다. 입력: `전용 kubeconfig,context id,연결 선택; 계정·scope` → 기대: `welcome/clusters/ai/permissions/done 및 settings 모든 등록 section; 실제 접근상태`; IPC·도구 `kube.read; kube.probe; conn.step; conn.verify; kube.can`. → 실패: probe 실패가 연결 완료로 표시되거나 등록 설정 구역이 누락되면 실패.
- 현재: `apps/wake/desktop/probe.cjs:24`의 probe가 인증과 Pod 접근 가능 여부를 조회한다.
- 차이: TASK-F-04. 제거·교체 대상: sample cluster/dev switch·빈 계정 그룹·메타 설명/중복 연결 상태 계산. 위험·검사: default kubeconfig fallback 실행 금지; 취소·잘못된 파일·권한거부·다른 클러스터 삭제.
- 고정 장치: 고정 없음 → TASK-F-04
- 출처: D00011, D00012, D00013, D00014, D00015, D00036, D00044, D00114, D00115, D00505, D00999. 결정 ID는 F-BE-002/019에 명시한다.
- 범위: 화면 `start,first-run,settings:*`; 요구 R-010, R-016, R-018, R-024, R-028, R-058, R-059; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-07; 후행: 최종 전체관문.
- 변경 후보 파일: apps/wake/pages/start.js, apps/wake/pages/settings.js, apps/wake/settings-pages.js, apps/wake/data/connect-flow.js, apps/wake/data/conn-view.js, apps/wake/desktop/conn-ops.cjs, apps/wake/desktop/provider-connections.cjs, apps/wake/app.config.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/data/conn-view.test.mjs, apps/wake/data/connect-flow.test.mjs, apps/wake/desktop/provider-connections.test.cjs, apps/wake/app.config.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U42. U-42 비용 화면: 실제 출처 또는 정직한 미연결 <a id="F-BE-U42"></a>

- 목표: F-BE-009를 적용한다. 입력: `id,window,currency,allocation basis` → 기대: `allocation/cost/coverage/source; 미설치인 경우 unconfigured, 0원 금지`; IPC·도구 `costs.open`. → 실패: 미설치가 0원으로 표시되거나 통화·기간이 다른 allocation을 합치면 실패.
- 현재: `apps/wake/desktop/opencost.cjs:133`의 createOpenCost가 실제 allocation 조회와 연결 상태를 처리한다.
- 차이: TASK-F-02, TASK-F-22. 제거·교체 대상: 견본 가격/고정 환율/추정비용을 실제 청구로 표시. 위험·검사: 출처 없으면 정상 데이터 D1은 미완료. 연결 범위는 D-08 승인 결과에 따름.
- 고정 장치: 고정 없음 → TASK-F-02
- 출처: D00064, D00079, D00080, D00081, D00082, D00083, D00084, D00085, D00086, D00087, D00088, D00107, D00108, D00109, D00110, D00111, D00114, D00115, D00117, D00167, D00196, D00252, D00276, D00317, D00445, D00449, D00450, D00467, D00474, D00974, D00985. 결정 ID는 F-BE-009에 명시한다.
- 범위: 화면 `costs`; 요구 R-016, R-029, R-032, R-059, R-071; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-07; 후행: 최종 전체관문.
- 변경 후보 파일: apps/wake/pages/costs.js, apps/wake/data/costs.js, apps/wake/desktop/opencost.cjs, apps/wake/desktop/observability.cjs, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/desktop/opencost.test.cjs, apps/wake/desktop/observability.test.cjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U43. U-43 셸 터미널: 사람이 연 대상과 실행 범위 <a id="F-BE-U43"></a>

- 목표: F-BE-002/020를 적용한다. 입력: `사용자가 선택한 context/ns/kind/name; 일회 owner ticket` → 기대: `정확한 kubeconfig/env/context 표시 및 PTY 종료·취소; AI 실행 불가`; IPC·도구 `term.target; term.env`. → 실패: PTY 대상이 화면 선택과 다르거나 AI가 실행하면 실패.
- 현재: `apps/wake/desktop/services.cjs`의 term.env가 사람이 연 대상의 context·namespace로 고정한 kubeconfig를 만들고 내 셸이 그것으로 열린다(원격 대상이 있으면 term.target, [출시 검수 수정 3차 (흐름)](tasks.md#release-qa-fix-3-flow) B2-02).
- 차이: TASK-F-05. 제거·교체 대상: 오래된 target 재사용·자동 kubeconfig fallback·중복 터미널 연결. 위험·검사: focus/Escape/한글입력·탭 이동 후 권한 재사용·프로세스 종료 회귀.
- 고정 장치: 고정 없음 → TASK-F-05
- 출처: D00011, D00012, D00013, D00014, D00015, D00036, D00044, D00114, D00115, D00505, D00999. 결정 ID는 F-BE-002/020에 명시한다.
- 범위: 화면 `terminal,command-palette`; 요구 R-010, R-018, R-024, R-028, R-037, R-059; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-07; 후행: 최종 전체관문.
- 변경 후보 파일: kit/desktop/terminal.cjs, kit/shell/shell.js, apps/wake/app.config.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, kit/core/pane.js, kit/shell/hosts/desktop-host.test.mjs, kit/desktop/terminal.test.cjs, kit/shell/shell.test.mjs, apps/wake/app.config.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs, kit/core/pane.test.mjs

### F-BE-U44. U-44 보고서: 스냅숏→편집→PDF·Markdown·채널 <a id="F-BE-U44"></a>

- 목표: F-ARC-011를 적용한다. 입력: `incident/evidence hash/report kind/selected blocks/user edits; 조용한 날 점검 source coverage` → 기대: `열린공유/해결사후분석/점검 문서와 세 형식에서 같은 필드·출처·시각`; IPC·도구 `incident.workspace; build_report; kit.file.save; reportCanvas.print; wake.copy`. → 실패: 편집 후 PDF·Markdown·채널의 숫자·출처·시각이 다르면 실패.
- 현재: `apps/wake/desktop/hub.cjs:65`의 report가 incident-report-doc의 문서 계산을 사용한다.
- 차이: TASK-F-14. 제거·교체 대상: checkInput catch→[]·PDF에서 잘린 나머지만 흘리는 코드·견본 보고서. 위험·검사: 원인확정/외부회신/증상회복/확인완료 분리, 긴 표·인쇄·민감값·되돌리기.
- 고정 장치: 고정 없음 → TASK-F-14
- 출처: D00740, D00742, D00884, D00885, D00910. 결정 ID는 F-ARC-011에 명시한다.
- 범위: 화면 `report,check-report,report-selection`; 요구 R-007, R-034, R-035, R-060, R-061, R-062, R-070, R-071; 선후행 U-01, U-02, U-03, U-04, U-05, U-06, U-34, U-35, U-36, U-37, U-52; 후행: U-45, U-46, U-47, U-48, U-49, U-50, U-51.
- 변경 후보 파일: apps/wake/pages/incident-report.js, apps/wake/pages/incident-report-doc.js, apps/wake/desktop/hub.cjs, kit/core/report.js, kit/components/report-canvas.js, apps/wake/data/index.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/pages/incident-report-doc.test.mjs, apps/wake/desktop/hub.test.cjs, kit/core/report.test.mjs, kit/components/report-canvas.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

### F-BE-U52. U-52 수동 조치: 명령 복사→사람 실행→원본 확인 <a id="F-BE-U52"></a>

- 목표: F-ARC-009를 적용한다. 입력: `approvalId,incident,target UID,command digest,사람이 제출한 startedAt/finishedAt/exitCode; main sender 검증` → 기대: `selfReported 실행기록과 independentlyVerified 원본변화 상태 분리; exit 실패는 failed; 재조회에서 expected revision/UID/Ready 일치 전 verified 금지`; IPC·도구 `approval.decide; action.record(신설 목표 채택); incident.workspace`. → 실패: 자기 보고 exitCode=0만으로 independentlyVerified가 true가 되면 실패.
- 현재: `apps/wake/desktop/approvals.cjs:43`의 decide는 승인 기록만 쓰며 action.record 실행 기록 서비스는 없다.
- 차이: TASK-F-11, TASK-F-12. 제거·교체 대상: 승인만으로 실행 성공 기록·AI 자동명령·자기신고 즉시 resolved. 위험·검사: 사람은 기존 sim 명령복사/실행완료 flow를 사용. 새 UI 필요하면 D-03 승인. 실패·취소·재전송·stale target·사람 결과 오기입을 원본으로 반증.
- 고정 장치: 고정 없음 → TASK-F-11
- 출처: D00466, D00473, D00648, D00869, D00912, D00986. 결정 ID는 F-ARC-009에 명시한다.
- 범위: 화면 `approval,incident`; 요구 R-035, R-037, R-038, R-052, R-054; 선후행 U-36, U-34; 후행: U-44, U-45, U-46, U-47, U-48, U-49, U-50.
- 변경 후보 파일: apps/wake/data/ownership.js, apps/wake/desktop/approvals.cjs, apps/wake/desktop/incident-hub.cjs, apps/wake/pages/incident-detail.js, apps/wake/ai-hub.js, apps/wake/desktop/services.cjs, apps/wake/locale/ko.js, apps/wake/locale/en.js, apps/wake/data/ownership.test.mjs, apps/wake/desktop/services.test.mjs, apps/wake/desktop/services.test.cjs

## 완료 관문과 원천 요구 대응

### F-BE-024. F 작업의 D1~D7 <a id="F-BE-024"></a>

- 목표: 입력: 같은 고정본으로 IPC·원본·Electron·실패 복원·역의존을 두 검증자가 확인한다 → 기대: D1은 실제 IPC 반환 필드와 null 이유를 남긴다. D2는 별도 원본 질의와 모든 값의 오차를 대조한다. D3은 실제 Electron 다크·라이트 각각 1280×900·1680×900에서 영향을 받는 구역을 펼치고 끝까지 스크롤한다. D4는 출처 끊김·권한 없음·오래됨과 복구, 검증자가 추가한 실패를 실제 전용 lab에서 확인한다. D5는 필수 검사 전후 수와 소유 파일의 삭제 후보·회귀를 대조한다. D6은 공통 파일의 역의존 화면 전후를 비교한다. D7은 같은 고정 사본에서 두 검증자가 독립 재실행한다. → 실패: native 대신 브라우저 결과를 제출하거나 다른 소스 결과를 같은 검수로 합치면 실패.
- 현재: `apps/wake/desktop/ai-run.cjs:135`의 no-model 조기 반환 결함이 남아 있고 전체 D1~D7 실행 결과는 이 명세에 없다.
- 차이: 첫 질문 저장 결함과 U-03 오류 계약 공백이 남아 전체 D1~D7 관문을 통과한 결과가 없다.
- 고정 장치: 고정 없음 → TASK-F-22
- 출처: D00048, D00143, D00167, D00173, D00317, D00436, D00445, D00456, D00467, D00474, D00774, D00959, D00967, D00987
- 검사: 값 누락·원본 실패·다른 대상/라우트·변경된 소스·복원 실패는 PASS 불가. 수용 오차는 F-BE-022. 검증 중 소스가 바뀌면 영향 증거를 다시 수집한다. 최신 major 기준으로 독립 판정하며 minor는 작업 목록에 남긴다. 환경 불가를 제품 실패라고 꾸미지 않고 미검증/보류로 남기며 전체 완료도 선언하지 않는다. 검증 명령의 종료0은 캡처·값 정체 검사를 대신하지 않는다.

비밀을 가진 응답은 원문 전체 기록보다 마스킹·권한 금지를 우선한다. kubeconfig 본문·키·토큰·Secret을 증거에 남기지 않는다. 사용자 자료 격리는 `--user-data-dir`로 실제 앱 경로를 확인하며 환경 변수만으로 격리를 주장하지 않는다. 사용자 자료 정리 대상은 품질/보안 영역으로 인계하고 이 실행에서는 삭제하지 않는다. 부하≤10은 성능 기준선, 새 단위 시작 부하≤20 및 heavy.lock은 운영 조건이다. 낮은 부하만으로 잠금 없이 클러스터 장애를 중복 주입하지 않는다.
