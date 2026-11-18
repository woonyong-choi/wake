# 보안과 권한

Wake의 읽기·제안·사람 승인과 자격·자료 전송 경계를 정한다. 다른 namespace를 요구한 외부 AI에는 자료를 반환하기 전에 거절하고 감사를 남긴다. Secret은 수신 후 마스킹할 대상이 아니라 원본 접근부터 차단할 대상이다.

## 읽는 방법

상태·원천 약어·제안 처리·검증 범위는 [아키텍처의 근거와 판정 방식](architecture.md#근거와-판정-방식)을 따른다. 목표의 검사 절은 수용 기준이며 실행 결과가 아니다. `T-SEC-01~25`는 같은 번호 SEC의 차이를 닫는 작업이며 별도 작업 등록을 주장하지 않는다.

짧은 .cjs 파일과 `reads/`, `agent-install-charts/`는 `apps/wake/desktop/`, data·app.config·ai-hub·ai-connect는 `apps/wake/`, 페이지는 `apps/wake/pages/`다. main·main-url·tool-auth·preload는 `kit/desktop/`다. 모든 원본 링크는 읽기용이며 사용자 자료 정리를 허가하지 않는다.

1차 문서에는 hub·ai-target·mask·mask-text·tool-auth·main-url 시험 76 pass/0 fail/0 skipped가 기록되어 있다. 이 결과는 합성 공급자·임시 저장소·loopback·호스트 코드 범위의 과거 기록이며 이번 재실행·실제 보안 PASS가 아니다. 최신 Secret 정책은 계획 선택 D-01 A안으로 확인했다.

## 권한 범위

### SEC-001 AI 읽기와 사람의 변경 결정 <a id="SEC-001"></a>

- 목표: → [RULE-AI](rules.md#RULE-AI); [RULE-APPROVAL](rules.md#RULE-APPROVAL).
- 현재: 부분. `apps/wake/desktop/hub-tools.cjs:56–172,187–216`에는 18개 등록과 공통 검사, `apps/wake/desktop/ai-run.cjs:141–161`에는 동일 도구 호출이 있다. 외부 서버는 이 표만 노출한다. 다만 내장 AI의 `permission`과 대상 범위가 서버 권한 제한으로 연결되는지는 SEC-014의 미완료 사항이다. 승인 뒤 실제 실행은 SEC-006과 별개다.
- 차이: T-SEC-01. 공통 도구 표의 승인·셸 우회 거부와 내장 AI 권한 적용을 시험한다. 기존 U-06, U-36, U-38, U-39와 묶는다. 대상 hub-tools.cjs, ai-run.cjs; 자동 확인 `node --test apps/wake/desktop/hub.test.cjs`; 운영 검사 세 경로 도구 우회; 선행 T-SEC-14·15, U-06·38·39.
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `the tool layer has the 18 tools, each with a JSON schema, and only propose_action is not read-only`
- 출처: D00466, D00473, D00648, D00660, D00666
- 검사: → [RULE-AI](rules.md#RULE-AI); [RULE-APPROVAL](rules.md#RULE-APPROVAL).

### SEC-002 wake-reader의 최소 RBAC <a id="SEC-002"></a>

- 목표: 입력: wake-reader로 Secret 세 동사와 허용 namespace의 portforward 권한을 조회한다 → 기대: 전용 lab의 조사 계정은 `wake-system/wake-reader`다. 제품의 계정 이름을 이 lab 이름으로 강제하지 않는다. 데이터 읽기는 아래 원천 RBAC의 리소스와 동사에 한정한다. 도구 접속용 `pods/portforward`는 `monitoring`, `argocd` namespace에서만 `create,get`을 허용한다. 이 접속 권한을 워크로드 변경 권한으로 확대하지 않는다; [RULE-SECRET](rules.md#RULE-SECRET); 실패: Secret 읽기·워크로드 쓰기가 허용되거나 포워딩 범위가 넓어지면 실패.
- 현재: `apps/wake/desktop/probe.cjs:19`의 can이 SelfSubjectAccessReview를 호출한다. 이는 연결 계정 권한 조회이며 wake-reader의 현재 클러스터 RBAC가 안전하다는 증거는 아니다.
- 차이: T-SEC-02. 설치·재연결 때 읽기 계정의 금지 동사를 검사하고, reader와 도구 계정과 컨트롤러 계정을 구분해 결과를 남긴다. U-00, U-07, U-41에 이관한다. 대상 lab wake-reader RBAC, probe.cjs; 자동 확인 전용 kubeconfig `auth can-i` 세 동사; 운영 검사 실제 API 403, 도구 접속; 선행 U-00·07·41.
- 고정 장치: 고정 없음 → T-SEC-02
- 출처: D00979, D00980, D00981
- 검사: 전용 reader kubeconfig의 `kubectl --kubeconfig "$WAKE_READER_CONFIG" auth can-i get secrets --all-namespaces`, `list`, `watch`가 각각 `no`다. `patch deployments.apps`와 범위 밖 `create pods/portforward`도 `no`다. 허용 namespace의 도구 포워딩은 가능해야 한다. 실제 거부 시험은 합성 Secret이 있는 격리 lab에서 API 상태 코드만 수집하고 본문은 기록하지 않는다. 기대값은 403이며 관리자 계정으로 본문을 읽어 비교하지 않는다.

| API group | 허용 리소스 | 읽기 동사 |
|---|---|---|
| core | pods, pods/log, services, endpoints, events, namespaces, nodes, configmaps, persistentvolumes, persistentvolumeclaims, replicationcontrollers, resourcequotas, limitranges, serviceaccounts | get, list, watch |
| apps | deployments, replicasets, statefulsets, daemonsets, controllerrevisions | get, list, watch |
| batch | jobs, cronjobs | get, list, watch |
| autoscaling | horizontalpodautoscalers | get, list, watch |
| policy | poddisruptionbudgets | get, list, watch |
| networking.k8s.io | ingresses, ingressclasses, networkpolicies | get, list, watch |
| discovery.k8s.io | endpointslices | get, list, watch |
| events.k8s.io | events | get, list, watch |
| storage.k8s.io | storageclasses | get, list, watch |
| rbac.authorization.k8s.io | roles, rolebindings, clusterroles, clusterrolebindings | get, list, watch |
| apiextensions.k8s.io | customresourcedefinitions | get, list, watch |
| coordination.k8s.io | leases | get, list, watch |
| metrics.k8s.io | pods, nodes | get, list |
| argoproj.io | applications, appprojects | get, list, watch |
| kustomize.toolkit.fluxcd.io, source.toolkit.fluxcd.io, helm.toolkit.fluxcd.io | kustomizations, gitrepositories, helmrepositories, helmreleases | get, list, watch |
| monitoring.coreos.com | prometheusrules, servicemonitors, podmonitors, prometheuses, alertmanagers | get, list, watch |

### SEC-003 Secret은 수신 전부터 차단 <a id="SEC-003"></a>

- 목표: → [RULE-SECRET](rules.md#RULE-SECRET).
- 현재: 부분. `apps/wake/desktop/services.cjs:419–420`의 목록은 명시적으로 거절한다. 반면 `apps/wake/desktop/services.cjs:458–461`의 상세는 GET 후 `sanitize`하며, `apps/wake/desktop/hub-tools.cjs:57–72`의 목록·상세도 `sources.kube` 호출 뒤 필요한 값만 고른다. `apps/wake/desktop/reads/cluster.cjs:32`의 일반 GET에는 Secret 경로 거부가 없다. `apps/wake/desktop/tool-bootstrap.cjs:206–239`는 운영자 영수증 검증 뒤 `getToolBootstrapSecret`으로 관리자 값을 읽고 인증에 쓴다. `apps/wake/desktop/services.cjs:247–252`에서 이 경로를 연결한다. 소스에서 확인한 정책 불일치이며 이번에 실제 비밀 접근을 실행하지 않았다.
- 차이: T-SEC-03. 네 읽기 입구와 부트스트랩을 D-01로 닫고 옛 성공 시험을 거부 시험으로 바꾼다. `k8s.cjs:253–371`의 Secret 전용 읽기, `reads/cluster.cjs:26`의 후처리, 도구 설명의 메타데이터 지원 문구는 삭제·교체 후보로만 기록한다. 대상 services.cjs, hub-tools.cjs, reads/cluster.cjs, tool-bootstrap.cjs, k8s.cjs 및 해당 시험; 자동 확인 `node --test apps/wake/desktop/hub.test.cjs apps/wake/desktop/services.test.cjs apps/wake/desktop/tool-bootstrap.test.cjs`; 운영 검사 Secret 요청 0, 기존 연결 보존; 선행 T-SEC-02.
- 고정 장치: 고정 없음 → T-SEC-03
- 출처: D00979, D00980, D00981, D01050
- 검사: → [RULE-SECRET](rules.md#RULE-SECRET).

### SEC-004 Secret 화면과 Helm의 허용 정보 <a id="SEC-004"></a>

- 목표: → [RULE-SECRET](rules.md#RULE-SECRET).
- 현재: `apps/wake/data/index.js:129`의 UNCONNECTED.helm과 `apps/wake/data/gitops.js:147`의 Secret 기반 helmReleases가 공존한다. 허용 라벨·주석 공급으로 전환되지 않았다.
- 차이: T-SEC-04. U-22·U-30에서 허용 정보만 연결하고 차단 상태를 검수한다. Secret을 읽는 별도 publisher를 해결책으로 추가하지 않는다. 대상 data/index.js, resource-list.js, GitOps·Helm 데이터 경로; 자동 확인 `node --test apps/wake/data/index.test.mjs apps/wake/pages/resource-pages.test.mjs`; 운영 검사 Secret·Helm 금지 화면; 선행 T-SEC-03, U-22·30.
- 고정 장치: 고정 없음 → T-SEC-04
- 출처: D00979, D00980, D00981
- 검사: → [RULE-SECRET](rules.md#RULE-SECRET).

### SEC-005 wake-agent 권한과 설치 <a id="SEC-005"></a>

- 목표: 입력: Node·Pod watch와 자기 Lease 갱신 후 다른 Lease·Secret에 접근한다 → 기대: wake-agent는 Node·Pod watch 캐시와 heartbeat에 필요한 권한만 가진다. Secret 권한은 없다. 현재 차트의 읽기 권한은 core `nodes,pods`의 `get,list,watch`이고, heartbeat는 설치 namespace의 `leases`에 `get,create,update`, owner 확인은 이름 `wake-agent`인 DaemonSet `get`이다. 화면에서 “자기 Node만”이라고 말하려면 RBAC과 실제 수집 제한의 차이를 밝힌다. 설치와 갱신은 사람이 선택한 고정 버전·이미지를 확인한 뒤 수행한다; 실패: 자기 Lease 밖 쓰기나 Secret 읽기가 허용되면 실패.
- 현재: 부분. `agent-install-charts/wake-agent-only/templates/rbac.yaml:18–21,47–55`에 위 규칙이 있다. ClusterRole은 모든 Node·Pod 읽기를 허용하고 Lease Role에는 특정 Lease 이름 제한이 없다. 따라서 “자기 Node·Lease 하나만 RBAC으로 허용”은 현재 코드보다 강한 주장이다. 1차 작성에서 실제 설치·heartbeat는 확인하지 않았다.
- 차이: T-SEC-05. U-07에서 이미지와 실측 권한을 검증하고 필요 권한·실제 제한의 설명을 일치시킨다. 설치 성공과 관측 성공을 따로 판정한다. 대상 agent-install-charts/wake-agent-only, agent 상태 서비스; 자동 확인 `node --test apps/wake/desktop/services-agent.test.cjs`; 운영 검사 설치 이미지·RBAC·Lease; 선행 T-SEC-02, U-07.
- 고정 장치: 고정 없음 → T-SEC-05
- 출처: D00024, D00972
- 검사: 렌더한 차트와 설치된 Role을 비교한다. Secret 세 동사는 모두 `no`다. 실제 이미지 digest, Node UID, Pod UID, Lease renewTime과 소유자를 대조한다. 다른 리소스 쓰기 금지, 설치 namespace 밖 Lease 쓰기 금지다. 클러스터 전체 읽기 권한과 프로세스가 거르는 캐시 범위를 같은 주장으로 적지 않는다.

### SEC-006 승인·실행·복구의 분리 <a id="SEC-006"></a>

- 목표: 입력: 같은 승인 ID에 승인·거절을 전송하고 대상 UID를 교체한다 → 기대: 승인 화면은 대상 cluster/namespace/kind/name/UID, resourceVersion, 변경 경로와 전후 값 전체, 위험, 근거, 실행 경로를 보여 준다; [RULE-APPROVAL](rules.md#RULE-APPROVAL). 대상 교체·오래된 변경안은 재승인 없이 실행하지 않는다. Draft PR 생성, 다른 사람 리뷰, 병합, 배포, 복구 확인은 각각 별도 사건이다;  실패: 첫 결정이 덮이거나 새 UID를 재승인 없이 실행하면 실패.
- 현재: 부분. `apps/wake/desktop/approvals.cjs`는 첫 결정 재생과 감사 기록, 요청마다 불변 계획 해시(`planHash`: 클러스터·대상·인시던트·저장된 계획)를 구현했다. 허용은 메인 프로세스가 직접 띄우는 OS 확인 창(`kit/desktop/main.cjs` confirmNative → services `confirm`, 그 승인 ID·계획 해시·대상·바뀌는 값)에서 사람이 승인을 누를 때만 기록하고, 취소·확인 없음은 `not_confirmed`, 확인 중 계획이 바뀌면 `plan_changed`로 기록 0이다. 화면이 보낸 `approval.decide`만으로는 허용되지 않는다. 거절은 밖을 바꾸지 않아 확인 없이 기록한다. `propose`의 target에는 UID/resourceVersion 강제가 없고 `decide`에 클러스터 재조회가 없다. `github()`가 있으면 문자열 `pending`, 없으면 `github-unconnected`만 기록한다. 실제 PR 실행은 없다.
- 차이: T-SEC-06. U-36·U-37에서 승인 sender·대상 고정·동시 결정·실행 멱등을 구현한다. 자동 실행을 붙이기 전에 이 경계를 닫는다. 대상 approvals.cjs, hub.cjs, services.cjs, AI 승인 어댑터; 자동 확인 `node --test apps/wake/desktop/hub.test.cjs`; 운영 검사 사람 승인·PR·교체 대상; 선행 T-SEC-18·19, U-36·37.
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `approvals keep the first decision, never run anything, and record a Draft PR that cannot be made without GitHub`
- 출처: D00648, D00869
- 검사: 같은 요청을 두 번 허용·거절해 첫 결정·결정자·시각이 바뀌지 않아야 한다. 외부 API에서 승인 불가, 두 창의 상충 결정은 하나만 성립해야 한다. UID/resourceVersion이 바뀐 조치는 실행 0이다. Git 연결 없음이면 승인 기록과 `github-unconnected` 실패를 따로 남긴다. 실제 PR 번호·URL·head/base SHA를 조회하지 못하면 PR 성공이 아니다.

### SEC-007 Argo CD와 도구 로그인 <a id="SEC-007"></a>

- 목표: 입력: 읽기 계정과 발급 권한 없는 계정으로 로그인·토큰 연결을 시도한다 → 기대: 연결은 실제 사용자 로그인 또는 직접 입력한 토큰으로 검증한다. Grafana 발급 계정은 Viewer, Argo CD는 이미 관리자가 만든 읽기 전용 계정이 있을 때만 토큰을 발급한다. 읽기 권한을 확인할 수 없으면 검증된 읽기 연결로 표시하지 않는다. 발급 권한이 없을 때 세션 연결과 토큰 연결을 구분한다. Wake가 관리자 Secret을 읽어 대신 로그인하지 않는다. → 실패: 관리자 Secret을 읽거나 세션 연결을 토큰 발급 성공으로 표시하면 실패.
- 현재: 부분. `apps/wake/desktop/tool-connect.cjs:50–125`에 기간·계정·발급 검사가 있고 Argo 발급 결과의 role은 `unverified`다. 에는 당시 실험실 Argo `g, wake-reader, role:readonly`와 실제 Applications 열기가 기록되어 있다. 다른 설치·계정까지 확장할 수 없다. SEC-003의 부트스트랩은 현재 요구와 충돌한다.
- 차이: T-SEC-07. U-40·U-41에서 계정 종류별 권한 검증과 최초 로그인부터 재열기까지 확인한다. D00014의 미확인 Loki·Tempo 인증과 Flux 동작도 확인한 범위만 보고한다. 대상 tool-connect.cjs, connect-flow.js; 자동 확인 `node --test apps/wake/desktop/tool-connect.test.cjs apps/wake/data/connect-flow.test.mjs`; 운영 검사 읽기 계정 로그인·재열기; 선행 T-SEC-03·09, U-40·41.
- 고정 장치: 고정 없음 → T-SEC-07
- 출처: D00014, D00024, D00031, D00033, D00048, D00078, D00115, D00972, D01000
- 검사: 토큰 없음·정상 읽기 토큰·만료·인증 실패·권한 부족·발급 불가·로그인 탭 취소를 각각 확인한다. Argo Applications 목록 실제 읽기와 도구 열기가 일치해야 한다. 읽기 토큰으로 앱 수정·sync·삭제를 시도하는 격리 시험은 거부되어야 한다. 캡처에 토큰 값은 0이다.

### SEC-008 재시작 복원·인증 제한·도구 질의 <a id="SEC-008"></a>

- 목표: 입력: 재시작 뒤 새 Service/Pod binding에서 인증하고 쓰기 API를 요청한다 → 기대: 프로세스 메모리의 `bindingId`를 영속 자격으로 재사용하지 않는다. 재시작하면 저장된 키체인 참조와 대상 Service UID·Pod UID를 새 연결에 결합해 인증한다. 로그인·발급·저장·확인 중 실패한 단계를 표시하고 취소·재시도를 제공한다. 짧은 UI 제한으로 인증 완료를 실패로 만들지 않는다. 도구 API는 등록된 조회 메서드·경로만 허용하고 임의 Authorization 헤더나 쓰기 경로를 입력받지 않는다. → 실패: 옛 bindingId를 재사용하거나 임의 인증 헤더·쓰기 경로가 원본에 도달하면 실패.
- 현재: 부분. `apps/wake/desktop/services.cjs:231–236`은 origin과 Service/Pod UID가 맞을 때만 키체인 헤더를 제공한다. `apps/wake/desktop/tool-connect.cjs:174–227`은 검증·redirect 거절·재인증을 수행한다. `apps/wake/desktop/tools.cjs:75–106`은 Loki·Tempo 브리지의 GET·경로·Host·본문을 제한한다. 재시작과 모든 계정 조합의 현재 native 검증은 없다.
- 차이: T-SEC-08. B1·U-40에서 오래된 binding과 계정 복원 시나리오를 실행하고 인증 timeout과 connection 오류를 분리한다. 대상 tools.cjs, portforward.cjs, services.cjs; 자동 확인 `node --test apps/wake/desktop/tools.test.cjs apps/wake/desktop/portforward.test.cjs`; 운영 검사 재시작·timeout·Pod 교체; 선행 T-SEC-07, B1·U-40.
- 고정 장치: 고정 없음 → T-SEC-08
- 출처: D00016, D00036, D00077, D01000
- 검사: 저장→앱 종료→다시 연결→원본 읽기까지 같은 대상과 키체인 참조를 확인한다. 만료·Pod 교체·이전 binding·취소된 발급은 성공 처리하지 않는다. Loki·Tempo 브리지의 GET 외 메서드, 요청 본문, 잘못된 Host, 허용 목록 밖 경로는 거부한다. 제한 시간은 실제 정의값과 실패 단계를 기록하고 모든 단계에 근거 없는 동일 시간값을 강제하지 않는다.

## 비밀 값과 로컬 저장

### SEC-009 키체인과 자격 참조 <a id="SEC-009"></a>

- 목표: 입력: 키체인 성공·불가·basic_text 상태에서 API 키를 저장한다 → 기대: 재사용할 API 키·도구 토큰·Kubernetes 토큰·클라이언트 개인 키·비밀번호는 OS 키체인을 이용한 암호화 저장만 허용한다. 설정과 관리 kubeconfig에는 참조만 둔다. 키체인을 사용할 수 없거나 Linux backend가 `basic_text`이면 저장을 거절한다. 복호화 값은 필요한 메인 프로세스 인증 경로에만 전달한다. → 실패: 평문 설정·kubeconfig에 비밀이 남거나 basic_text 저장을 성공으로 표시하면 실패.
- 현재: 구현됨, 코드 확인. `apps/wake/desktop/keychain.cjs:10–32`는 safeStorage 암호문을 `userData/secrets.json`에 저장한다. “OS 키체인 항목에 값 자체를 직접 저장한다”는 구현은 아니다. `apps/wake/desktop/services.cjs:215–225`는 인라인 token/client-key-data/password를 참조로 바꾼다. 파일 참조형 자격의 이전·재시작 전 경로와 OS별 실제 보안 저장은 미검증이다.
- 차이: T-SEC-09. U-41에서 파일 참조형 자격·저장 중 실패·키링 불가·재시작을 고정한다. 대상 keychain.cjs, services.cjs, provider-connections.cjs; 자동 확인 `node --test apps/wake/desktop/services.test.cjs apps/wake/desktop/provider-connections.test.cjs`; 운영 검사 OS별 키링 실패·복원; 선행 U-41.
- 고정 장치: 고정 없음 → T-SEC-09
- 출처: D00016, D00033, D00048
- 검사: safeStorage 사용 가능·불가·basic_text 대역에서 저장 결과를 검사한다. 임시 `secrets.json`, `connections.json`, kubeconfig 사본을 합성 sentinel로 검사해 평문 일치 0이어야 한다. 저장 실패 후 참조만 남거나 이전 유효 자격이 사라지지 않아야 한다. renderer 목록 응답에는 값이 없고 ref·종류만 있어야 한다.

### SEC-010 파일 권한과 안전한 저장 <a id="SEC-010"></a>

- 목표: 입력: 저장 경로에 symlink·hardlink·0644 파일·쓰기 실패를 주입한다 → 기대: 민감한 로컬 기록 파일은 0600, 허브 폴더는 0700이다. 문서 갱신은 같은 폴더의 독점 임시 파일에 쓰고 동기화한 뒤 rename한다. (기본값 채택, 번복 가능) 기존 파일 권한이 느슨해졌거나 경로가 symlink·다중 hardlink·다른 소유자로 바뀌면 안전하게 거절하거나 권한을 복구한 사실을 확인한다. 권한 실패·손상을 정상 빈 자료로 바꾸지 않는다. → 실패: 다른 경로에 쓰거나 0600/0700이 아닌 상태로 저장을 성공시키면 실패.
- 현재: 부분. `apps/wake/desktop/hub-store.cjs:29–40,55,73–76`은 신규 파일 0600·폴더 0700·원자적 문서 저장을 구현한다. 기존 JSONL에 `appendFileSync(...,{mode:0600})`만 쓰므로 기존 mode 재설정은 없다. `apps/wake/desktop/keychain.cjs:13`도 기존 파일 mode 재검증이 없다. `apps/wake/desktop/hub-store.cjs:49,68`은 손상 행·문서를 버리거나 빈 객체로 바꾼다. `apps/wake/desktop/services.cjs:126–179`의 연결 저장소에는 더 강한 소유·링크·mode 검사가 있어 저장소 간 차이가 있다.
- 차이: T-SEC-10. U-04에서 파일별 권한·손상·경로 교체 시험을 추가하고 저장소 간 계약을 맞춘다. 대상 hub-store.cjs, keychain.cjs; 자동 확인 `node --test apps/wake/desktop/hub.test.cjs`; 운영 검사 격리 EACCES·재시작; 선행 U-04.
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `the store masks every text before it is written and prunes rows older than 90 days`
- 출처: D-USR-2026-11-16-7; D01050
- 검사: 생성·재시작·갱신·만료 정리 뒤 `stat.mode & 0o777`이 파일 0600, 폴더 0700이다. 합성 기존 파일을 0644로 바꾼 뒤 재쓰기, symlink 교체, EACCES, 손상 JSON, 중간 실패를 확인한다. 사용자 실제 저장소로 시험하지 않는다. 실패는 `local-store` 오류와 보존된 원본으로 확인한다.

### SEC-011 마스킹·개인정보·내보내기 <a id="SEC-011"></a>

- 목표: 입력: 토큰·이메일 sentinel 근거를 도구·모델·감사·보고서로 전달한다 → 기대: 비밀·개인정보가 허브 도구 반환, 근거 저장, 모델 입력, 감사, 대화, 보고서·내보내기에 나오기 전에 같은 `maskText` 규칙을 적용한다. 표시는 `••••`이고 `n`은 이번에 새로 가린 자리 수다. 명령 기록은 출력 전체를 저장하지 않고 `maskSecrets`를 거친 명령을 남긴다. 마스킹을 Secret 읽기 허가로 쓰지 않는다. → 실패: 출력에 sentinel이 남거나 이미 가린 값을 새 마스킹 수로 중복 계산하면 실패.
- 현재: 부분. `apps/wake/data/mask.js`의 패턴과 `apps/wake/desktop/hub-store.cjs`의 문자열별 저장 마스킹이 있다. 로그 글의 공개 정책 `discloseText`(maskText + 이름표 없는 불투명 자격)는 로그 IPC(`services.cjs` kube.logs·loki.logs)와 도구 `read_logs`·그것으로 만드는 로그 근거(`hub-tools.cjs`)에 적용한다. 인시던트 허브가 직접 읽어 고정하는 로그 근거(`incident-hub.cjs` cite 입구)는 아직 maskText만 지난다. `apps/wake/desktop/ai-run.cjs`는 공급자 실패 이유를 maskText로 가린 뒤 길이를 제한하고 같은 문구를 오류 이벤트와 대화에 쓴다. 저장 오류 code도 가린다. 어댑터의 서비스 reject는 원문을 전달하지 않고 고정된 request_failed 이유를 쓴다. 합성 token 반례에서 최초 이벤트·디스크·재조회 문구를 대조했다.
- 차이: T-SEC-11. 이번 오류 이벤트의 합성 token 유출은 해소했다. 구조형 비밀의 객체 키 문맥, 일반 모델 응답, 알려지지 않은 외부 토큰 형식, 보고서·내보내기 전체 경계는 미완료다. 대상 data/mask.js, ai-run.cjs, 보고서·내보내기 소비 경로이며 실제 Electron의 툴팁·오류·export 확인은 H-009에 남는다.
- 고정 장치: `apps/wake/desktop/ai-target.test.cjs`의 run_provider_error_is_masked_before_event_and_matches_reopened_message는 대역 공급자의 합성 token이 오류 이벤트·디스크·재열기 문구에 남지 않음을 검사한다. `apps/wake/desktop/hub.test.cjs`의 results are masked before they leave the tool layer도 유지한다. 실행은 [묶음 1 수정](tasks.md#batch1-fixes)이다.
- 출처: D00466, D00473
- 검사: 합성 값으로 아래 규칙을 검사한다. 같은 입력을 저장 전·도구 반환 전·모델 전송 전·내보내기 전에서 대조하여 sentinel 잔존 0, 이미 가린 값의 추가 count 0을 확인한다. 이벤트·툴팁·오류·클립보드도 검사한다. 키가 `token`인 JSON 값처럼 문자열 문맥이 없는 구조와 형식이 알려지지 않은 토큰을 별도 반례로 둔다.

| 입력 종류 | 적용 규칙 |
|---|---|
| 명령 플래그 | token, password, passwd, client-secret, secret, api-key, apikey, access-key, secret-key, auth, bearer 값 |
| Secret 생성 문자열 | `--from-literal`의 값. 이 문자열을 가린다고 실행을 허용하지 않는다 |
| 환경변수 대입 | TOKEN, SECRET, PASSWORD, PASSWD, PWD, API_KEY, ACCESS_KEY, PRIVATE_KEY 계열 이름 |
| 인증 헤더·URL | Authorization, x-api-key, api-key, Bearer, URL의 사용자:비밀번호 |
| 본문 키·개인 키 | password/token/secret 계열 `key=value`, `key: value`, PEM PRIVATE KEY 블록 |
| 형태 식별 토큰 | JWT, GitHub, Slack, AWS access key ID |
| 개인정보 | 이메일, 16자리 카드 번호 패턴 |

### SEC-012 자격의 origin·대상 고정 <a id="SEC-012"></a>

- 목표: 입력: 인증된 요청을 다른 origin으로 redirect하고 Pod UID를 교체한다 → 기대: 인증 헤더는 현재 확인한 도구 origin과 Service UID·Pod UID에만 붙인다. 외부 링크, redirect, 다른 origin, 다른 클러스터·도구, 교체된 Pod로 토큰을 전달하지 않는다. 자격을 URL·로그·진단·스크린샷·증거에 쓰지 않는다. HTTPS 검증을 끄는 방식으로 인증 실패를 해결하지 않는다. → 실패: 인증 헤더가 다른 origin·UID에 전달되거나 TLS 검증을 끄면 실패.
- 현재: 부분. `kit/desktop/tool-auth.cjs:9–18`, `apps/wake/desktop/services.cjs:231–236`, `apps/wake/desktop/tool-connect.cjs:174–185`에 origin·binding 확인과 redirect 거부가 있다. B1의 과거 캡처·문자열 검사도 전 네트워크·숨은 renderer 저장소까지 확인한 결과는 아니다. stdio의 별도 송신 경계는 SEC-017에 남아 있다.
- 차이: T-SEC-12. U-40에서 인증 경로별 목적지·전송 헤더·오류·캡처를 함께 고정한다. 대상 tool-auth.cjs, tool-connect.cjs, services.cjs; 자동 확인 `node --test kit/desktop/tool-auth.test.cjs apps/wake/desktop/tool-connect.test.cjs`; 운영 검사 인증 헤더 목적지; 선행 T-SEC-09, U-40.
- 고정 장치: `kit/desktop/main-url.test.cjs` — `tool_navigation_enforces_origin_and_path_boundaries`
- 출처: D00006, D00016, D00112, D00442
- 검사: same-origin 정상 요청, 다른 scheme/host/port, redirect, Pod 교체, 오래된 origin을 합성 자격으로 시험한다. 대상 밖 요청 Authorization 0, 모든 오류와 캡처의 sentinel 0이어야 한다. 네트워크 검사를 하지 않은 경우 “전송 안 됨 검증”이라고 쓰지 않는다.

## AI 입력과 범위

### SEC-013 등록된 질문 대상과 거절 <a id="SEC-013"></a>

- 목표: 입력: 등록 ARN context와 미등록·null·false·0·빈 문자열 target으로 질문한다 → 기대: `ai.run.target.cluster`는 Kubernetes 객체 이름이 아니라 등록된 kubeconfig context ID다. ARN·슬래시·콜론을 보존한다. (기본값 채택, 번복 가능) 허용 길이는 1–1024자, 제어문자 없음, 현재 `contexts()`에 존재함을 검사한다. 명시한 target이 무효·미등록·null·false·0·빈 문자열이면 모델 선택·호출 전에 거절한다. 전역 scope로 조용히 바꾸지 않는다. target 생략 요청만 전역 scope를 사용한다. 거절 질문·이유·대화 ID·실패 답은 저장·재조회에 남는다. → 실패: 무효 target이 전역 scope가 되거나 모델 호출·거절 질문 유실이 발생하면 실패.
- 현재: 코드 확인; 1차 계약 시험 기록. `apps/wake/desktop/ai-run.cjs:23–40,115–132`, `apps/wake/desktop/hub.cjs:72`에서 검사와 registry 전달을 확인했다. `apps/wake/desktop/ai-target.test.cjs:4`의 정상 ID·미등록 거절·등록 해제/복원 시험은 1차 작성 당시 통과 기록이 있다. falsey·오래된 사본 등은 B1 7차 고정본의 과거 검증이며 현재 전체 native·실제 모델 검증은 아니다. registry 생략을 허용하는 runner 대역을 제품 권한 근거로 쓰지 않는다.
- 차이: T-SEC-13. B1에 남은 거절·재열기 native 검증과 실제 다중 클러스터 경계를 고정한다. 공급자 미설정 기록 유실은 SEC-020으로 추적한다. 대상 ai-hub.js, ai-run.cjs, ai-target 시험; 자동 확인 `node --test apps/wake/desktop/ai-target.test.cjs apps/wake/ai-target-flow.test.mjs`; 운영 검사 target 거절·재열기; 선행 B1.
- 고정 장치: `apps/wake/desktop/ai-target.test.cjs` — `an unregistered or malformed target is refused before any model call, the person is told, and the conversation keeps the refusal`
- 출처: D-USR-2026-11-16-7; D00466, D00473; `round4/review-report.md:15–45`, `round5/review-report.md:64–87`, `round7/review-report.md:69–74`
- 검사: 정상 context 세 형태, 삭제·재등록, 1024자 경계, 초과 길이, 제어문자, falsey target을 어댑터→허브→runner→저장소로 보낸다. 거절 시 모델 호출 0, `step → error`, done 0, `error:target_rejected`, `cluster:null`, 원래 target의 거절 사유 보존이다. 재등록 뒤에는 같은 target으로 성공한다.

### SEC-014 프롬프트 데이터와 실행 권한의 분리 <a id="SEC-014"></a>

- 목표: 입력: 따옴표·개행·명령문 target/로그와 범위 밖 도구 호출을 모델 대역에 넣는다 → 기대: target·scope·namespace·리소스 이름·로그는 데이터로 직렬화한다. 식별자 안의 따옴표·개행·명령문이 system 지시문 구조를 바꾸지 못하게 한다. 직렬화 통과를 의미적 프롬프트 주입 차단으로 간주하지 않는다. 모델이 만든 도구 이름·인자에는 매번 스키마와 등록 대상·권한 범위를 적용한다. 사용자가 화면에서 고른 AI 권한이 모델 문자열에만 남지 않아야 한다. → 실패: 데이터가 system 지시 구조를 바꾸거나 모델이 scope 밖 자료를 받으면 실패.
- 현재: 부분. `apps/wake/desktop/ai-run.cjs:25–35`는 `JSON.stringify`로 target·scope를 넣으며 4차 보고는 직렬화만 검증했다. `apps/wake/desktop/ai-run.cjs:141`의 caller는 permission을 전달하지만 scope를 넣지 않는다. `apps/wake/desktop/hub-tools.cjs:175–182`는 scope가 없으면 허용하고 `call`은 caller.permission으로 제안 허용 여부를 검사하지 않는다. 전역 scope는 현재 모델 문맥이지 서버 권한 경계라고 보장할 수 없다.
- 차이: T-SEC-14. U-06·U-38에서 내장 caller의 권한·범위를 서버가 정하고 매 도구 호출에 적용한다. 프롬프트 수정만으로 닫지 않는다. 대상 ai-run.cjs, hub-tools.cjs, AI 권한 설정 연결; 자동 확인 `node --test apps/wake/desktop/ai-target.test.cjs apps/wake/desktop/hub.test.cjs`; 운영 검사 실제 질문 범위; 선행 T-SEC-13·15, U-06·38.
- 고정 장치: 고정 없음 → T-SEC-14
- 출처: D00466, D00473, D01050
- 검사: 등록된 합성 context에 따옴표와 지시문 형태를 넣고 전송 JSON을 역직렬화하면 원문과 같고 추가 system 줄이 없어야 한다. 로그에 쓰기·다른 클러스터 읽기·승인 명령을 넣은 모델 대역이 도구를 호출해도 scope 밖 자료와 쓰기 결과는 0이다. 읽기와 제안 허용 설정별 허브 결과를 검사한다.

### SEC-015 외부 클라이언트의 cluster·namespace·kind 범위 <a id="SEC-015"></a>

- 목표: 입력: cluster A/namespace a/Pod client로 B·b·Deployment의 감사·근거·화면을 요청한다 → 기대: 외부 클라이언트 범위는 저장된 `scope:{cluster,namespaces[],kinds[]}`다. (기본값 채택, 번복 가능) 빈 namespace/kind 배열은 해당 cluster 전체를 뜻하되 발급 전에 범위를 확인한다. 범위는 요청뿐 아니라 반환 행·근거·보고서·감사·화면 상태·화면 이동까지 적용한다. 다른 cluster 자료를 모두 받은 뒤 renderer에서 거르는 방식은 금지한다. PromQL·LogQL에 내장된 대상도 scope를 우회할 수 없다. → 실패: 반환 행에 범위 밖 대상이 하나라도 포함되면 실패.
- 현재: 부분. `apps/wake/desktop/hub-tools.cjs:175–182`는 일반 scope를 검사한다. 그러나 `query_audit:153–155`는 cluster 문자열만 검사하고 namespace/kind 필터가 없다. `get_screen_state`, `set_screen_state:156–159,178`은 실제 화면의 cluster를 검사하지 않는다. kind가 없는 조회는 kinds 제한을 건너뛴다. `list_apps` 반환 행의 namespace 필터도 없다. 이는 소스에서 확인한 누락이며 실제 외부 클라이언트 자료 유출을 실행한 결과는 아니다.
- 차이: T-SEC-15. U-06·U-39에서 아래 표 전체의 허용·거절·감사 시험을 추가한다. 이 범위가 닫히기 전 외부 경로를 제품 전체 안전성 PASS로 보고하지 않는다. 대상 hub-tools.cjs, hub.cjs, screen relay; 자동 확인 `node --test apps/wake/desktop/hub.test.cjs`; 운영 검사 두 cluster·namespace·도구 18개; 선행 U-06·39.
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `a call is checked, scoped and audited with its transport; out of scope ends forbidden and is recorded`
- 출처: D-USR-2026-11-16-7; D00089, D00466, D00473, D01050
- 검사: cluster A/namespace a/Pod로 제한한 client로 cluster B, namespace b, Deployment, 다른 인시던트 근거, 감사, 화면, 보고서를 요청한다. 허용된 행만 반환하거나 `forbidden`이며 거절 감사가 남아야 한다. cluster ID에 `/`가 있어도 문자열 접두사로 다른 대상을 허용하지 않는다. 수집된 근거의 실제 대상이 요청·인시던트 범위와 다르면 거절한다.

| 경로 | 강제할 대상 | 현재 확인한 공백 |
|---|---|---|
| list/get resources, events, logs | 요청 cluster·namespace·kind와 반환 객체의 실제 대상 | 요청값만으로 반환값 전체를 보증할 수 없음 |
| query_metrics, query_logs_count | query 안 대상과 허용 namespace·kind | 쿼리 의미와 범위의 일치 강제 없음 |
| list_apps, app_history | Application namespace·종류 | list_apps 반환 namespace 필터 없음, kind 생략 경로 |
| list/get incidents, timeline | 인시던트 실제 cluster·target UID·namespace | 중첩 workspace 값 전수 scope 검증 필요 |
| collect/get evidence, build_report | 인시던트와 개별 근거의 실제 범위 | 인시던트 범위와 별도 spec/근거 대상 일치 검증 필요 |
| query_audit | 행의 cluster·namespace·kind | cluster 문자열 접두사 검사만 존재 |
| get/set_screen_state | 현재 tab와 open 주소의 실제 cluster·namespace, 선언된 키 | scope 예외, open은 `wake://` 접두사만 검사 |
| propose_action | target와 incident·option이 가리키는 동일 객체 | 인시던트 클러스터와 후보 계획 대상(kind·namespace·name)이 target과 다르면 계획을 만들기 전 `invalid_request`(`approvals.cjs` propose). UID·resourceVersion 결합은 미완료 |

## MCP·HTTP와 데스크톱 경계

### SEC-016 로컬 서버와 인증 <a id="SEC-016"></a>

- 목표: 입력: 새 저장소에서 MCP만 켜고 무토큰·다른 transport·Origin·1MiB 초과 본문을 보낸다 → 기대: MCP·HTTP는 기본 꺼짐이고 `127.0.0.1`에만 listen한다. path별 활성 상태와 client transport를 검사한다. 인증은 `Authorization: Bearer`만 사용하고 URL query 토큰은 허용하지 않는다. Origin이 있는 브라우저 요청은 거절한다. 실패한 bind를 켜짐·연결됨으로 표시하지 않는다. (기본값 채택, 번복 가능) 본문은 1MiB 제한이다. → 실패: 외부 listen·무토큰 성공·충돌 포트 켜짐·비활성 경로 성공이 있으면 실패.
- 현재: 코드 확인; 1차 로컬 HTTP 계약 시험 기록. `apps/wake/desktop/hub-server.cjs:14–49,67–118`에 조건이 구현되어 있고 `apps/wake/desktop/hub.test.cjs:3`의 서버 시험에는 1차 작성 당시 통과 기록이 있다. 기본 포트는 현재 `47821`, 설정 유효 범위는 1024–65535다. U-39의 기본 포트 제거는 별도 남은 작업이다. Host·DNS rebinding 전 조합, 본문 초과의 클라이언트 응답, 종료 중 요청은 1차 시험 기록으로 보장하지 않는다.
- 차이: T-SEC-16. U-39에서 Host/Origin·CSRF·포트 충돌·종료·본문 상한을 독립 client로 고정한다. 대상 hub-server.cjs, ai-connect.js; 자동 확인 `node --test apps/wake/desktop/hub.test.cjs`; 운영 검사 loopback·포트 충돌·종료; 선행 U-39.
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `the server answers MCP and the HTTP API only with a client token of that transport, only on 127.0.0.1`
- 출처: D-USR-2026-11-16-7; D00466, D00473
- 검사: 새 저장소에서 mcp/api=false·listener 0, 활성화 후 host=127.0.0.1이다. 무토큰 401, 다른 transport 403, Origin 403, 꺼진 경로 503, 미등록 경로 404, MCP POST 외 405다. JSON 오류 400, 1MiB 초과 요청은 거부한다. 다른 프로세스가 포트를 소유하면 `port_in_use`와 두 경로 off다.

### SEC-017 외부 토큰 발급·해지·stdio 송신 <a id="SEC-017"></a>

- 목표: 입력: client 발급·삭제 뒤 stdio URL을 외부 host로 바꾸고 클립보드 복사를 실패시킨다 → 기대: 제안(승인 문서의 외부 토큰 계약 구체화). 외부 client 토큰은 생성할 때 한 번만 전달한다. 허브 저장소에는 SHA-256 해시만 두고 목록에서 해시도 제외한다. 삭제된 토큰은 다음 요청부터 거절한다. 토큰 발급은 의도된 입력·복사 순간의 예외이며 기록·로그·URL·캡처의 상시 노출은 금지한다. stdio 다리도 loopback MCP로만 토큰을 보내며 임의 `WAKE_MCP_URL`이나 redirect로 외부에 전달하지 않는다. → 실패: 해지 토큰이 통과하거나 외부로 전송되거나 복사 실패가 성공 토스트로 표시되면 실패.
- 현재: 부분. `apps/wake/desktop/hub-server.cjs:26–43`은 24 random bytes, `wake_` 접두어, 해시 저장, `timingSafeEqual`, 삭제를 구현한다. `apps/wake/ai-connect.js:54–60`은 토큰을 클립보드에 한 번 쓰지만 실패를 삼킨 뒤 성공 토스트를 낸다. `apps/wake/desktop/mcp-stdio.cjs:11–23`은 환경 URL을 검증하지 않고 Authorization을 포함해 fetch한다. 로컬 서버 listen 제한만으로 이 송신 경계를 보장할 수 없다.
- 차이: T-SEC-17. U-39에서 stdio 목적지·redirect·오류 노출 제한, 복사 실패 표시, 일회 노출과 폐기 시험을 추가한다. 대상 mcp-stdio.cjs, hub-server.cjs, ai-connect.js; 자동 확인 `node --test apps/wake/desktop/hub.test.cjs`; 운영 검사 token 해지·복사 실패; 선행 T-SEC-16, U-39.
- 고정 장치: 고정 없음 → T-SEC-17
- 출처: decisions ID 없음; 아래 승인 문서에서 도출
- 검사: add 응답만 token을 포함하고 디스크·list에는 원문 0이다. 토큰 비교는 해시의 일정 시간 비교를 사용한다. remove 직후 같은 토큰 요청은 401이다. stdio 목적지를 외부 host, 사용자정보 포함 URL, 잘못된 path, redirect로 바꾼 합성 시험에서 fetch 0 또는 안전한 거부여야 한다. 클립보드 실패를 복사 성공 토스트로 표시하지 않는다.

### SEC-018 IPC·외부 도구 창·사람의 터미널 <a id="SEC-018"></a>

- 목표: 입력: 외부 tab·subframe·가짜 owner·종료된 창에서 민감 IPC를 호출한다 → 기대: 외부 도구 페이지와 subframe은 내부 서비스·승인·자격·터미널을 호출하지 못한다. renderer는 sandbox, contextIsolation=true, nodeIntegration=false다. 실제 sender의 창·탭·문서 수명이 바뀌면 이전 owner는 무효다. 터미널은 사람이 고른 context·namespace·리소스와 전용 kubeconfig로 열며 AI 화면 조작으로 실행하지 않는다. 일반 iframe 차단과 민감 서비스의 사람 승인 권한은 별도 검사한다. → 실패: 외부 sender가 승인·자격·터미널을 실행하거나 바뀐 owner가 유효하면 실패.
- 현재: 부분. `kit/desktop/main.cjs`에 owner·sender·sandbox 검사가 있다. 클러스터에 쓰는 선언 명령(`apps/wake/commands.json` confirm: 에이전트 설치·권한 부여)은 메인 프로세스의 OS 확인 창(실제 명령 줄과 환경)에서 사람이 실행을 누른 뒤에만 시작하며, 화면이 터미널에 Enter를 써서 대신 답하던 길은 지웠다. 앱 문지기(`services.cjs` hooks.commandGuard)가 등록된 context, 앱에 든 차트 또는 사람이 메인 프로세스 폴더 창에서 고른 차트만 허락하고 KUBECONFIG를 Wake가 읽는 파일로 정한다. 승인 허용도 같은 OS 확인 창을 거친다([SEC-006](#SEC-006)). AI 서버 설정·client 추가는 별도 sender 제한 없이 전달된다. 전역 IPC가 내부 앱 페이지를 허용하므로 민감 서비스마다 필요한 권한을 따로 입증해야 한다. 실제 악성 페이지 접근을 재현한 주장은 아니다.
- 차이: T-SEC-18. U-36·U-39·U-43에서 민감 서비스의 신뢰된 sender와 일회 사람 결정을 연결하고 실제 Electron에서 우회를 검사한다. 대상 kit/desktop/main.cjs, services.cjs, kit/desktop/terminal.cjs; 자동 확인 `node --test kit/desktop/main-service-owner.test.cjs` 및 `node kit/tools/check-ipc.mjs`; 운영 검사 실제 sender·터미널; 선행 U-36·39·43.
- 고정 장치: `node kit/tools/check-ipc.mjs`의 IPC 노출·호출 검사
- 출처: D00466, D00473, D01050
- 검사: 외부 tool tab·subframe·가짜 owner·탭 이동·창 종료·같은 ID로 바뀐 webContents에서 민감 호출을 거부한다. 사용자 payload의 `approved:true`를 승인 근거로 쓰지 않는다. 키체인 원문과 임의 셸 실행 도구가 AI registry에 없어야 한다. 실제 터미널은 선택한 context와 종료·취소 상태를 확인한다.

## 감사와 실패 표시

### SEC-019 누가 무엇을 읽고 결정했는지 기록 <a id="SEC-019"></a>

- 목표: 입력: 같은 requestId로 도구·모델·승인·거절·실행을 기록한다 → 기대: AI 도구 호출·모델 전달·제안·사람 결정·실행은 서버가 정한 실제 시각과 주체로 자동 기록한다. 요청자와 실행자, 권한, 모델, desktop/mcp/api 경로, client, tool, scope, target, 마스킹한 인자, 결과, 마스킹 수를 구분한다. 사람 메모 입력으로 감사 자동 기록을 대신하지 않는다. 외부 caller가 자신의 이름·권한·결정자를 위조할 수 없어야 한다. 호출·결정의 requestId로 누락·중복을 가린다. → 실패: 주체 위조·거절 누락·실행 연결 누락이 있거나 보관 실패를 완료로 처리하면 실패.
- 현재: 부분. `apps/wake/desktop/hub-tools.cjs:187–212`, `apps/wake/desktop/ai-run.cjs:76–77,119,170`, `apps/wake/desktop/approvals.cjs:52–54`가 감사 행을 만든다. `apps/wake/desktop/hub-server.cjs:43`은 client의 저장 이름을 주체로 쓰고 `apps/wake/desktop/hub.cjs:104`는 로컬 사용자를 결정자로 쓴다. requestId를 전 경로에 연결하지 않으며 `caller.screen`은 기록을 생략한다. 인증 단계의 Origin/401/transport 거부는 도구 call 이전에 반환하여 도구 감사가 없다. 모델 기록의 `size`는 현재 공급자 usage 합계여서 실제 전송량과 동일하다고 단정할 수 없다.
- 차이: T-SEC-19. U-05에서 event→요청→모델→제안→사람 결정→실행 연결과 거절 기록을 고정한다. 화면 단순 읽기를 감사 대상에서 제외하는 정책은 명시적으로 구분한다. 대상 hub-tools.cjs, ai-run.cjs, approvals.cjs, data/audit.js; 자동 확인 `node --test apps/wake/desktop/hub.test.cjs apps/wake/data/audit.test.mjs`; 운영 검사 AI 작업 기록·결정자; 선행 T-SEC-10·15, U-05.
- 고정 장치: 고정 없음 → T-SEC-19
- 출처: D00466, D00473, D00869, D00912
- 검사: 정상·거절·실패 도구 호출 하나마다 해당 감사 행이 있어야 한다. 모델 송신·승인·거절·실행의 시각과 주체를 원본 사건에 대조한다. 외부 인증 실패는 token 원문 없이 구분하고 audit 조회에도 SEC-015 scope를 적용한다. 보관 실패가 나면 감사 완료로 처리하지 않는다.

### SEC-020 실패한 조사와 근거의 정직성 <a id="SEC-020"></a>

- 목표: 입력: 모델 없음 첫 질문 뒤 연결·후속 질문·재열기를 하고 없는 근거 999를 인용한다 → 기대: 공급자 미설정·단절·대상 거절도 같은 대화 ID로 질문·실패를 먼저 보존한다. 오래된 client 사본이 허브의 저장 이력을 지우지 않는다. 실패한 도구 호출의 인자를 “읽은 근거”로 인정하지 않는다. 인용 이름표는 성공한 허용 읽기 결과에서 확인한 인시던트·근거 번호에만 붙인다. → 실패: 첫 질문이 사라지거나 실패한 근거에 성공 인용 이름표가 붙으면 실패.
- 현재: 부분. 최신 B1 7차는 major 1·minor 3으로 FAIL이다. 보안·신뢰 관련 major는 최초 질문 유실, minor는 실패한 읽기의 근거 이름표다. 현재 `apps/wake/desktop/ai-run.cjs:83–85,135`는 미설정 질문 저장 공백을, `96,154–155`는 실패 여부와 무관한 incident 추적을 유지한다. 7차 보고의 Restarts 폭·이름표 키보드 minor는 화면 영역 소관이며 보안 완료로 흡수하지 않는다.
- 차이: T-SEC-20. B1 major를 먼저 해결하고 읽기 성공 기반 인용을 회귀 시험에 넣는다. 대화 동시성과 화면 접근성의 상세 정본은 각 영역과 연결한다. 대상 ai-run.cjs, ai-target 시험; 자동 확인 B1 7차 `assert-no-model.cjs`, `additional.cjs`를 현재 소스 고정본으로 재현; 운영 검사 저장·재열기·실패 근거; 선행 B1, U-38.
- 고정 장치: 고정 없음 → T-SEC-20
- 출처: D00466, D00473, D00660
- 검사: 모델 없음→첫 질문→공급자 연결→같은 대화 후속 질문→모델 입력과 재조회에서 두 질문과 첫 실패가 남아야 한다. 존재하지 않는 근거 999 조회 실패 뒤 모델이 `[1]`을 쓰더라도 해당 근거를 읽은 것처럼 이름표를 붙이지 않는다. 확인하지 못한 인용은 평문이다.

### SEC-021 권한 없음과 연결 실패의 구별 <a id="SEC-021"></a>

- 목표: 입력: 같은 대상에 403·인증 실패·timeout·성공 0건·부분 성공을 반환한다 → 기대: 인증 실패, 권한 없음, 미설정, 실제 성공 0건, 연결 실패, 부분 조회, 오래된 마지막 값을 구분한다. 실패 뒤 `[]`, `0`, `정상`으로 대체하지 않는다. 같은 값은 홈·목록·상세·도구 행·칩에서 같은 상태다. 권한 거부는 실패한 동사·리소스·namespace와 다음 동작을 보여 준다. 권한 부족으로 확인하지 못한 화면은 미완료로 기록한다. → 실패: 실패가 빈 값·0·정상이 되거나 화면마다 같은 출처 상태가 다르면 실패.
- 현재: 부분. `apps/wake/desktop/probe.cjs:16–57`은 인증 단계와 Pod 권한 단계를 구별하고 `apps/wake/desktop/hub-tools.cjs:211–216`은 forbidden을 분리한다. `probe.access:64–70`은 namespace 조회 실패 시 기본 namespace로 축소하고 30개까지만 확인하므로 전체 권한 목록으로 표시하면 안 된다. `gitops.read` 등 각 화면의 부분 실패 완결 여부는 U-03 이후 검증 대상이다.
- 차이: T-SEC-21. U-03·U-40·U-42에서 원본 상태와 화면을 대조한다. D00348의 예전 빨강 권한 표현은 현재 옛 결정 문서의 중립 자물쇠와 충돌하므로 중립 권한·빨강 오류를 따른다. 대상 reads/index.cjs, live.js, conn-view.js와 각 소비 화면; 자동 확인 `node --test apps/wake/data/conn-view.test.mjs apps/wake/desktop/reads/reads.test.cjs`; 운영 검사 7상태·403·복구; 선행 U-03·40·42.
- 고정 장치: `apps/wake/data/conn-view.test.mjs` — `tool_views_keep_read_outcomes_apart_and_never_promote_a_past_connection`
- 출처: D00078, D00090, D00099, D00106, D00111, D00114, D00115, D00348, D00453, D00454, D00456, D00666
- 검사: 실제 403·잘못된 인증·timeout·정상 빈 값·부분 권한·복구를 각 대상 화면에서 확인한다. 다크·라이트 × 1280·1680, 끝까지 스크롤 캡처와 동일 시각 원본을 남긴다. 이벤트는 소스 보존·권한·응답 제한의 확인 범위를, 로그는 `조회 결과 없음/소스 보존 범위 밖/권한 없음/연결 실패`를, GitOps diff는 `차이 없음/비교 미지원/권한 부족/조회 실패`를 분리한다. 비용은 권한 없음과 0원을 구분한다.

### SEC-022 필요한 권한 시트와 비지원 설정 <a id="SEC-022"></a>

- 목표: 입력: 권한 need를 열고 wake.perm.secret=true 설정을 불러온다 → 기대: 권한 시트는 실제 막힌 동사·리소스·namespace로 생성한 kubectl 및 Role·RoleBinding YAML을 보여 주고 복사할 수 있다. 직접 적용은 SelfSubjectAccessReview가 허용하고 사람이 실행할 때만 가능하다. Slack 전송은 연결되어 있고 사람이 선택했을 때만 가능하다. 권한을 얻으면 같은 연결 행이 재확인한다. “관리자”라는 제품 역할을 새로 만들지 않는다. Secret 읽기 설정은 저장된 옛 값과 관계없이 지원 불가·꺼짐을 나타낸다. → 실패: Secret 설정 켜짐·권한 없는 적용·Secret 포함 YAML이 제공되면 실패.
- 현재: 부분. `apps/wake/app.config.js:806–809`는 need와 `kube.can`으로 시트를 연다. `apps/wake/app.config.js:320`의 Secret switch는 disabled이지만 `key:'wake.perm.secret'` 값을 사용한다. T1 기록의 켜짐 문제를 차단하는 상수 false 또는 이전 처리를 확인하지 못했다. 읽기 계정의 권한을 확인하는 일과 그 권한을 변경하는 일은 분리해야 한다.
- 차이: T-SEC-22. T2·U-41에서 비지원 설정의 표시·이전과 시트 실제 권한을 고정한다. 대상 app.config.js, 권한 시트 정의와 settings 소비; 자동 확인 `node --test apps/wake/app.config.test.mjs`; 운영 검사 옛 true 설정·시트; 선행 T-SEC-03·21, T2·U-41.
- 고정 장치: 고정 없음 → T-SEC-22
- 출처: D00033, D00078, D00726
- 검사: need가 없으면 시트 없음, 권한 없음·실패이면 직접 적용 불가, 허용이면 실제 대상에 대한 버튼만 제공한다; [RULE-SECRET](rules.md#RULE-SECRET). 저장값 `wake.perm.secret=true`를 가진 격리 프로필에서도 화면과 실제 API 모두 Secret 금지다. 시트 코드 두 블록은 겹치지 않고 키보드로 복사·닫기 가능하다.

## 시험 자료 격리와 외부 전송

### SEC-023 전용 userData·kubeconfig와 프로세스 소유 <a id="SEC-023"></a>

- 목표: 입력: 전용 userData·reader kubeconfig로 Electron을 실행해 실제 경로·PID·포트를 읽는다 → 기대: 시험 Electron은 자기 `--user-data-dir`와 전용 reader kubeconfig로 실행한다. `~/.kube/config`, 사용자 실제 userData, 기존 앱 자격·탭·터널을 사용하거나 바꾸지 않는다. 실행 인자만 믿지 않고 실제 `app.getPath('userData')`를 확인한다. CDP에 붙기 전 port 소유 PID와 userData가 모두 자기 실행과 일치해야 한다. 다른 포트를 추측해 붙거나 넓은 pkill로 종료하지 않는다. → 실패: 사용자 프로필 변경·다른 PID CDP 접속·기본 kubeconfig 사용이 있으면 실패.
- 현재: 코드 확인; 1차 호스트 계약 시험 기록. `kit/desktop/main.cjs:290–291`은 switch가 있으면 우선하고 없으면 앱 기본 경로를 쓴다. `kit/desktop/main-url.test.cjs:81`의 `user_data_follows_the_user_data_dir_switch_and_defaults_to_the_app_folder`에는 1차 작성 당시 통과 기록이 있다. 실제 Electron을 이번에 실행하지 않았으므로 네이티브 격리 재검증은 아니다.
- 차이: T-SEC-23. 다음 승인된 native 검증에서 실제 경로와 사용자 자료 불변을 실행 초기에 확인한다. 예전 main 사본은 flag 지원을 따로 검사하며 “인자를 줬음”만으로 격리를 주장하지 않는다. 대상 main.cjs, native 실행 관문; 자동 확인 `node --test kit/desktop/main-url.test.cjs`; 운영 검사 userData·PID·원본 불변; 선행 모든 native 시험 이전.
- 고정 장치: `kit/desktop/main-url.test.cjs` — `user_data_follows_the_user_data_dir_switch_and_defaults_to_the_app_folder`
- 출처: D00006, D00019, D00112, D00442, D00510, D00511, D00672; `AGENTS.md`
- 검사: 임시 경로로 실행해 실제 userData가 일치하고 사용자 settings·connections·desktop의 수정 시각/해시가 바뀌지 않아야 한다. kubeconfig는 명시한 시험 파일만 쓴다. PID·포트·실행 경로를 확인하고 종료 뒤 자기 listener만 사라졌는지 검사한다. 증거에는 경로·ID·해시만 남기고 자격 파일 본문은 쓰지 않는다.

### SEC-024 사용자 자료의 시험 흔적 정리 목록 <a id="SEC-024"></a>

- 목표: 입력: 시험 흔적 후보를 생성 주체·백업·복구 방법과 함께 정리안으로 제출한다 → 기대: 격리 결함으로 사용자 자료에 남은 흔적은 대상·생성 주체·복구 방법·백업을 구분한 목록을 만든 뒤 사용자 확인을 받아 정리한다.  시험 자료처럼 보인다는 이유로 기존 연결·자격·인시던트를 지우지 않는다. → 실패: 식별·승인 전에 사용자 연결·자격·인시던트를 삭제하면 실패.
- 현재: `kit/desktop/main.cjs:290`의 userData 경로 선택은 현재 코드에 있다. 아래 과거 흔적 목록의 실제 잔존 여부를 검사하거나 정리하는 제품 경로는 없다.
- 차이: T-SEC-24. 대상 목록을 사용자에게 검토 가능한 정리안으로 올린다. 목록 확인과 삭제 승인을 구분한다. 대상 사용자 자료 정리안과 복구 영수증; 자동 확인 승인 후 대상별 전후 해시 비교; 운영 검사 사용자 확인 필수; 선행 T-SEC-23, 삭제는 별도 승인.
- 고정 장치: 고정 없음 → T-SEC-24
- 출처: D00006, D00019, D00112, D00442, D00510, D00511; `U-01/claims.md:31`, `B1/claims.md:8,12`
- 검사: 아래 각 대상을 읽기 전용으로 식별하고 생성 시각·소유 증거·복구 영수증을 연결한다. 승인 전 삭제 0, 다른 사용자 자료 변경 0이다. 이후 정리 실행은 전후 설정·자격 참조·인시던트 수를 확인하고 비밀 값은 열지 않는다.

| 정리 후보 | 출처·판정 | 처리 조건 |
|---|---|---|
| INC-0001 | U-01 격리 결함, 후속 기록에서 해결 | 실제 사용자 사건과 구별한 뒤 선택 정리 |
| INC-0002 | 08-검수 277행에는 존재·해결만 기록 | 시험 오염으로 단정하지 않고 소유부터 확인 |
| wake-lab 연결 | U-00가 실제 자료에 연결 추가 | 설정 › 클러스터에서 해제할 대상과 kubeconfig 사본·참조 목록 확인 |
| wake-lab Argo CD 토큰 | B1가 실제 자료에 저장, 키체인·toolTokens·toolMeta | 설정 › 도구의 해당 연결 해제 절차와 원격 토큰 폐기 범위 확인 |
| 도구·대화 열린 탭 | T1·B1·parity 기록 | 시험에서 연 탭만 식별 |
| 다크 테마·1280×900·위치 (40,40) | parity 실행 기록 | 현재 사용자 선택과 구분한 후 복원 |
| fixture-* 잔여 연결 키 | 11-02 캡처 기록 | 접두사만으로 지우지 않고 연결 출처 확인 |
| | U-00 이전 사본 | 비밀을 포함할 수 있으므로 0600 유지, 복구 확인 전 보존 |
| P1 격리 INC-0004~0006 | 별도 측정 userData, 앱 종료 뒤 완화 상태 기록 | 사용자 자료 정리와 분리, 측정 근거 보존 |

### SEC-025 외부 전송과 개인정보 경계 <a id="SEC-025"></a>

- 목표: 입력: 합성 개인정보·토큰을 질문·도구 결과에 넣고 공급자·MCP·보고서를 포착한다 → 기대: 비밀 값·개인정보 원문을 조사 자료로 외부 모델·MCP client·HTTP client·보고서·공유 채널에 전송하지 않는다. 사용자가 연결한 API 공급자에 마스킹된 질문·허용 도구 결과를 보내는 제품 동작과, 문서 검수 중 실자료를 외부로 전송하는 일을 구분한다. 승인되지 않은 외부 목적지·다른 origin으로의 전달은 금지한다. 외부 연결을 선택했다는 사실을 모든 클러스터 자료의 무제한 공개로 해석하지 않는다. → 실패: 미등록 목적지 전송이나 외부 출력에 원문 sentinel이 있으면 실패.
- 현재: 부분. `apps/wake/desktop/ai-run.cjs`는 Claude API 또는 연결한 구독 CLI(`apps/wake/desktop/ai-cli.cjs`, 표준 입력으로 가린 글, Wake 도구만 실행 전용 127.0.0.1 MCP 끝점·무작위 토큰)에 요청하며 사용자 글·관측 사실에 maskText를 적용한다. 모든 개인정보를 인식하는 분류기나 별도 전송 동의 정책 엔진은 확인하지 못했다. SEC-011·014·015·017의 공백 때문에 전체 전송 안전을 검증됨으로 표시할 수 없다.
- 차이: T-SEC-25. 허용 목적지·자료 범위·마스킹 결과를 전송 지점에서 검사하고, API 공급자와 구독 CLI의 검증 결과를 분리한다. 대상 AI·MCP·HTTP·export의 송신 지점; 자동 확인 mask·hub·tool-auth 시험 묶음; 운영 검사 합성 값 전송·내보내기; 선행 T-SEC-11·12·14·15·17.
- 고정 장치: 고정 없음 → T-SEC-25
- 출처: D00466, D00473, D01050
- 검사: 합성 이메일·카드·키·토큰을 포함한 질문과 도구 결과를 공급자 요청 직전에 포착한다. 허용 범위 자료만 있으며 sentinel은 0이어야 한다. 모델 오류·보고서·export 파일·MCP 응답·audit에서도 동일하다. 미등록 target·취소된 client·다른 origin은 전송 0이다. 캡처와 증거는 자격 화면의 원문을 포함하지 않는다.

## 보안·패키징 강화(2026-11-18)

이 절은 [작업의 보안·패키징 강화](tasks.md#보안패키징-강화)에서 고친 현재 상태다. 각 항목은 수정 전 실패를 확인한 시험으로 고정했다.

- 패키징(S-02): electron-builder 26.0.12(`kit/package.json` devDependencies)와 `kit/tools/package.mjs`. 패키지는 `kit/desktop/release.cjs` runtimeFiles의 허용 목록(kit/·apps/<id>/ 중 시험·spec·시뮬레이션·fixture·kit/tools·debug.cjs·native 원본·agent 원본 제외)만 담는다. 퓨즈는 RunAsNode·NODE_OPTIONS·inspect 끔, 쿠키 암호화·asar 무결성·asar만 읽기 켬이고, 만든 뒤 바이너리의 퓨즈를 다시 읽어 확인한다. hardened runtime의 entitlement는 JIT 하나. 서명·공증 자격은 환경 변수에서만 읽고 저장하지 않는다. 번들 ID(`apps/wake/desktop.config.cjs` bundleId)가 비면 패키징 점검이 실패한다. 앱이 Electron을 Node로 띄우는 곳이 있으면 패키징 점검이 실패한다([SEC-017](#SEC-017)).
- 내장 AI의 구독 CLI(S-02·S-16, [SEC-014](#SEC-014)): 실행 전용 MCP 끝점은 각 CLI의 HTTP MCP와 Bearer 헤더로 건넨다(Electron-as-Node 다리 없음). 토큰은 명령 줄에 없다. 실행 전에 지원 버전과 격리 옵션(각 CLI의 --help, Codex는 끄는 기능 목록)을 확인하고 없으면 실행하지 않는다. Gemini 기본 도구는 빈 core와 명시 exclude로 끈다. CLI에는 허용 목록 환경 변수만 넘긴다.
- 마스킹(S-03, [SEC-011](#SEC-011)): JSON 비밀 키("password":"x"), env 항목({"name":"DB_PASSWORD","value":"x"}, YAML 같은 모양)을 키 이름으로 가린다. 객체는 maskObject로 가린다.
- 네이티브 도우미(S-08): 패키지를 만들 때 빌드(`kit/tools/build-native.mjs`)하고 앱과 함께 서명해 unpacked로 싣는다. 실행 중에는 컴파일하지 않고 userData에서 읽지 않는다.
- 감사(S-09, [SEC-019](#SEC-019)): 도구 관리자 Secret 읽기, Argo CD 관리자 세션, Grafana 서비스 계정·토큰 만들기·지우기, Slack 보내기가 감사 행을 남긴다(값·주소·글 없음). services.cjs 연결 전에는 행이 기록되지 않는다.
- 키체인 파일(K-02, [SEC-010](#SEC-010)): 임시 파일 + fsync + rename. 읽을 수 없는 파일 위에는 쓰지 않고 사본을 남긴다.
- 원격 터미널(K-08, [SEC-018](#SEC-018)): aws·session-manager-plugin은 설정 경로나 PATH·표준 폴더에서 찾는다. 실제 경로가 root나 사용자 소유이고 group·other 쓰기가 없어야 쓴다.
- 자동 업데이트: 첫 출시는 끔(update.enabled가 true가 아니면 확인·내려받기 없음, 상태 unsupported/auto_update_disabled, 화면 표시 없음).
- 패키징 실행(2026-11-18, [작업](tasks.md#package-run)): electron-builder 26.0.12 설치, 번들 ID `io.github.woonyong-choi.wake`. 서명 자격이 없는 컴퓨터에서는 `package.mjs --unsigned`만 빌드한다(서명·공증 안 함, 같은 퓨즈·asar·무결성, ad hoc 재봉인). 자격도 `--unsigned`도 없으면 빌드를 거절한다. 만든 앱은 퓨즈(`010011001`), app.asar 내용(허용 목록·생성 package.json·런타임 모듈 밖 항목 0), unpacked window.node·node-pty를 다시 읽어 확인하고, 실제 실행에서 첫 실행 화면과 터미널(node-pty)이 동작했다. 런타임 파일에 Electron-as-Node 사용 0(terminal-credential.cjs 포함).
- 에이전트 이미지(K-15): `apps/wake/agent` 이미지를 로컬에서 linux/amd64·arm64로 빌드했고 values.yaml은 저장소 `ghcr.io/woonyong-choi/wake-agent`를 가리킨다. digest는 공개 뒤에 채우며, 그 전에는 image-state가 설치를 거절한다.
- 남은 차단: Developer ID 서명·공증 자격, 에이전트 이미지 공개와 digest(write:packages 필요), LICENSE 변호사 검토(한·영 초안 완성, 준거법 [대한민국 법] 확인 필요).

## 독립 검토 보안 수정(2026-11-19)

[작업의 독립 검토 보안 지적](tasks.md#independent-review-security)에서 고친 현재 상태다.

- 메인 프로세스 확인 창(`kit/desktop/main.cjs` confirmNative, services `create({ confirm })`): 문구는 locale 키, 취소가 첫 단추이자 기본(Return·Escape·초점 단추가 모두 취소)이라 다른 앱에 치던 키 입력으로 허용되지 않는다. 승인 확인 창은 클러스터·대상·경로(`wake.inc.route.*` 말)·바뀌는 값(컨테이너 자원은 `limits.memory (컨테이너 <이름>): 64Mi -> 128Mi`)·승인 ID를 보이고, 계획 해시는 보이지 않고 확인 전후 대조에만 쓴다. 개발 빌드의 뒤 검수 실행(`KIT_BACKGROUND=1`, `KIT_CONFIRM_LOG=<파일>`)은 창을 띄우지 않고 보일 글을 그 파일에 남기며 `<파일>.answer`가 `run`일 때만 허용한다(패키지 앱·일반 실행은 언제나 OS 창).
- 승인([SEC-006](#SEC-006)): 인시던트 후보 계획은 같은 클러스터·대상일 때만 만들고, 허용은 그 승인 ID·계획 해시의 메인 프로세스 확인 뒤에만 기록한다.
- 클러스터에 쓰는 선언 명령([SEC-018](#SEC-018)): OS 확인 창(명령 줄·실행 환경) 뒤에만 실행, 등록된 context·승인된 차트·Wake가 읽는 KUBECONFIG만.
- kubeconfig exec 동의: 실행 파일(실제 경로·dev·ino·크기·mtime)·인자·kubeconfig exec.env(이름·값)에 묶는다. 화면·동의 파일에는 명령 경로, 가린 인자(`argsPreview`), 환경 변수 이름만 남는다. ExecCredential의 PEM 인증서·키는 PEM 그대로 TLS에 쓴다(전에는 base64로 잘못 풀어 exec 인증서 연결이 실패).
- 공개 정책([SEC-011](#SEC-011)): `discloseText`·`discloseObject`가 로그 IPC와 도구 `read_logs`·로그 근거에 적용된다. 인시던트 허브 cite 입구는 미연결.
- 실제 확인(2026-11-19, 버리는 kind `wake-sec`, 격리 userData, 뒤 실행): 화면 문서의 `approval.decide`는 메인 프로세스 확인을 거쳤고 답하지 않으면 `not_confirmed`로 대기 유지, 화면이 고른 KUBECONFIG는 Wake가 읽는 파일로 바뀌어 확인 창에 보였으며 취소 시 Helm 실행 0, exec.env를 바꾸자 동의를 다시 물었다. 처음 띄운 실제 OS 확인 창이 사람의 다른 작업 앞에 떠서 몇 번 허용으로 끝났고(승인 단추가 첫 단추였음), 이를 고쳐 취소를 첫·기본 단추로 바꿨다.

### 재검토 반영(2026-11-19)

- 에이전트 설치 확인과 실행의 결합: 확인 창이 경로만 보이고 Helm이 나중에 그 내용을 읽던 공백을 닫았다. 메인 프로세스가 확인 전에 차트를 `userData/agent-install/<id>/chart`로 복사(일반 파일·폴더만, 링크·특수 파일은 거절, 내용 sha256)하고, 확인한 context·cluster·user 하나만 든 kubeconfig(파일 참조는 내용으로, 0600, 폴더 0700)를 쓰며, Helm은 실제 절대 경로(root나 사용자 소유, 그룹·다른 사람 쓰기 없음)로 실행한다. 확인 창은 context·서버·사용자와 자격 종류·차트 다이제스트·명령 줄·KUBECONFIG를 보인다. 실행이 끝나거나 취소·실패하면 폴더를 지우고, 앱 시작 때 남은 폴더도 지운다. 키체인 참조 자격(tokenRef 등)은 Helm이 읽지 못해 `AGENT_INSTALL_CREDENTIAL_UNSUPPORTED`로 거절한다.
- 일반 로컬 터미널(`pty:open` local, `pty:write`): 사람이 연 자기 대화형 셸이며 macOS 터미널 앱과 같은 권한이다. 셸 문서의 main frame만 열고 쓸 수 있고(`main.cjs` handle의 shellOf·mainFrame), 앱 페이지 문서·도구 탭·AI 도구·외부 클라이언트에는 이 통로가 없다(preload-page에 pty 없음, 화면 상태 도구는 터미널을 다루지 않음). 셸 문서는 앱 자신의 코드라 모든 IPC를 이미 가지므로 그 키 입력을 막는 것은 새 경계가 아니다. 확인 창은 Wake가 사람 대신 시작하는 선언 명령(클러스터 쓰기)에만 적용한다.
- 승인 요청: 인시던트는 그 후보(option)와 짝으로만 받고, 인시던트 대상이 요청 target과 같아야 하며, 인시던트가 아는 UID가 지금 그 이름의 객체 UID여야 저장한다. 일반 변경은 값마다 before가 있어야 하고 원본의 지금 값과 같아야 하며, 계획 명령은 클러스터 context를 이름으로 단다(UID·before의 JSON patch test 포함).
- 마스킹: Kubernetes bootstrap token(`[a-z0-9]{6}.[a-z0-9]{16}`), JWT, GitHub(`ghp_`·`github_pat_`), GitLab, Slack, AWS, Anthropic·OpenAI, Google API, Stripe, npm, Grafana, Hugging Face 토큰을 모양으로 가린다. UUID(숫자만인 묶음 포함), sha256 다이제스트, 64자 hex, resourceVersion은 규칙 전에 따로 두었다가 그대로 돌려놓는다. 카드 번호는 Luhn이 맞는 16자리만 가린다.
- 3차 검토 반영: 에이전트 설치의 Helm은 `env -i`로 PATH·HOME·KUBECONFIG만 받고(로그인 셸 시작 파일의 `HELM_KUBEAPISERVER`·`HELM_KUBETOKEN`·KUBE* 값 차단), exec 인증 사용자는 Wake의 exec 동의를 거친 플러그인 실행 결과를 사본 kubeconfig에 고정 자격으로 넣는다(동의 없음 `EXEC_CONSENT_REQUIRED`, 실패 `EXEC_CREDENTIAL_FAILED`, Helm은 플러그인을 실행하지 않음). 마스킹은 자격 문맥(플래그·헤더·Bearer·key=value·비밀 JSON 키)을 먼저 적용하고 그 뒤에 식별자를 따로 두며, Google OAuth `ya29.`를 가리고, `image` 필드 값·`repo:tag`·`@sha256` 이미지 참조와 trace/span/request id 이름표가 붙은 값은 그대로 둔다. 일반 제안 값은 원본 필드 형(숫자·불리언·글)으로 JSON patch test·replace에 나가고 다른 형은 거절한다.
