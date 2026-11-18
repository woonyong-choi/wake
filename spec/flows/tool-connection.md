# 도구 연결·열기·복원 흐름

발견·연결 기록·현재 건강·열기 가능을 구분한다. PRD-006의 일곱 상태와 실제 Electron 검수 조건을 적용한다.

공통: [권한·대상·7상태·왕복·원본 대조·표시](../product.md#공통-계약-적용). 현재는 소스 확인, 시험·캡처·실제 연결 합격은 별도다.

## FLOW-TOOL-001: 찾기·상태·칩

- 목표: 입력: tools.find의 Service UID=s1이 검증된 뒤 허브 읽기는 실패하고 inventory만 성공하는 응답을 넣는다 → 기대: tools.find로 Service와 endpoint를 열거해 Service UID/Pod UID/cluster/kind를 묶는다. 발견은 연결 성공이 아니다. 허브 읽기·열거·저장 연결 근거를 conn-view의 단일 판단으로 합친다. 홈/설정/목록/상세/인시던트/AI에서 같은 입력이면 같은 상태다. 연결한 것만 칩에 포함하되 기존 연결의 현재 실패는 숨기지 않는다. 실패한 새 발견만으로 칩을 만들지 않는다. 건강과 열 수 있음은 별개다. → 실패: 기존 연결 칩을 숨기거나 일부 실패를 정상으로 바꾸거나 새 UID=s2에 s1 자격을 붙이면 실패
- 현재: `apps/wake/data/conn-view.js:74`의 toolViews가 저장 기록·inventory·hub를 받아 같은 연결 상태 모델을 만든다.
- 차이: recorded(kind)는 cluster·kind만 확인하고 UID를 확인하지 않는다. :93의 openable도 이 기록을 사용해 새 UID를 과거 연결로 열 수 있다. → TASK-A3-TOOL-001
- 고정 장치: `apps/wake/data/conn-view.test.mjs`, 시험 `tool_views_keep_read_outcomes_apart_and_never_promote_a_past_connection`
- 출처: D00320 D00327 D00338 D00017 D00180 D00449 D00775 D00790 D00972 D00987 D00992 D00999 D01000; R-016,R-018,R-056; 1차 ).

## FLOW-TOOL-002: 로그인·토큰·발급

- 목표: 입력: tool-login에서 로그인 후 승인 대기 중이며 서비스 토큰 발급 권한은 없는 계정으로 계속한다 → 기대: tool-open은 reach/authn/ready, tool-login은 reach/login/approve/issue/authn/ready, tool-token은 input/reach/authn/ready다. 실제 로그인 세션을 열고 승인 전 발급하지 않는다. 서비스 토큰 생성 권한이 없으면 개인 세션으로 실제 읽기를 검증하며 발급 성공을 주장하지 않는다. 실제 필요한 인증 필드만 받고 로그인 탭 닫기는 취소다. Argo CD는 read-only 계정의 Applications 읽기까지 검증한다. → 실패: 승인 전에 발급하거나 세션 전용 연결을 서비스 토큰 발급 성공으로 표시하면 실패
- 현재: `apps/wake/data/connect-flow.js:81`은 login→approve→issue→authn→ready를 정의하고 :463의 toolLogin이 세션 연결을 처리한다.
- 차이: 없음(확인: apps/wake/data/connect-flow.js:463; 세션 전용은 발급 단계를 건너뛴다)
- 고정 장치: `apps/wake/data/connect-flow.test.mjs`, 시험 `도구: 승인 대기 중 발급하지 않고 허용 뒤 새 요청으로 한 번만 발급`
- 출처: D00026 D00031 D00032 D00033 D00034 D00036 D00048 D00115 D00428 D00429 D01000; R-058.

## FLOW-TOOL-003: 웹 UI·API·현재 대상 터미널

- 목표: 입력: 현재 cluster=c1·namespace=n1·Pod=p1에서 Loki 칩·API 보기·터미널 열기를 차례로 선택한다 → 기대: 홈 칩은 본문 도구/agent 상태로 간다. 웹 UI가 있는 도구만 원래 UI를 연다. Loki/Tempo는 읽기 API 화면에서 method/path/request/response/status/시간/크기를 보인다. 허용된 읽기 질의만 실행하고 없는 UI를 만들지 않는다. 일반 터미널은 현재 탭 cluster/namespace/resource의 환경으로 열며 무관한 로컬 셸을 대상 연결로 표시하지 않는다. 터미널 앱 선택은 실제 설치 목록이다. → 실패: Loki에 없는 웹 UI를 만들거나 쓰기 API를 실행하거나 터미널 context가 c1과 다르면 실패
- 현재: `apps/wake/pages/tool-api.js:24`의 send는 tool.query를 호출하고 `apps/wake/app.config.js:979`는 term.env에 cluster·namespace·resource를 보낸다.
- 차이: term.env의 resource 인수는 kind/name뿐이므로 같은 이름의 재생성 UID를 고정하지 않는다. → TASK-A3-TOOL-003
- 고정 장치: 고정 없음 → TASK-A3-TOOL-003
- 출처: D00038 D00040 D00026 D00028 D00029 D00030 D00037 D00042 D00044 D00045 D00046 D00047 D00077 D00445 D00456 D00992 D01000; R-059.

## FLOW-TOOL-004: 재시작·진단·재시도

- 목표: 입력: Service UID 교체 후 저장된 binding으로 도구를 열고 401에서 로그인·timeout에서 재시도를 누른다 → 기대: 키체인 참조나 실제 로그인 세션으로 새 binding을 만든 뒤 해당 protocol 읽기를 검증한다. HTTP 200만으로 정상 판정하지 않는다. retry는 실패 cache 대신 신규 요청이다. Service/Pod 교체 뒤 옛 주소·자격·늦은 답을 새 대상에 붙이지 않는다. 진단은 실제 오류 원문을 보존하고 도구 출력과 Wake 안내 언어를 구분한다. → 실패: 옛 binding이 새 UID에 사용되거나 retry가 새 요청 없이 이전 실패만 재표시하면 실패
- 현재: `apps/wake/desktop/tools.cjs:314`의 rebind는 kind/ns/svc/port/portName/url로 기존 binding을 찾고 :327에서 하나면 반환한다.
- 차이: binding 비교 키에 Service UID가 없다. 주소가 같은 교체 대상을 옛 binding과 구분하지 못한다. → TASK-A3-TOOL-004
- 고정 장치: 고정 없음 → TASK-A3-TOOL-004
- 출처: D00016 D00017 D00034 D00036 D00048 D00115 D01000; R-017,R-018,R-020,R-021; 1차

## FLOW-TOOL-005: 알림 서비스 연결과 실제 발송의 구별

- 목표: 입력: 설정에 Slack URL 또는 PagerDuty key를 입력해 연결 확인·재확인·해제를 수행한다 → 기대: 설정의 알림 서비스는 Slack URL과 PagerDuty key를 받고 notify의 input→reach→authn→ready 단계를 따른다. 비밀은 키체인 참조로 저장한다. Slack 주소 확인은 실제 메시지를 게시하지 않는 빈 본문 검증, PagerDuty는 읽기 API 검증이다. 이 확인을 장애 알림의 실제 전달 성공으로 부르지 않는다. 해제·재확인·권한 오류는 공통 연결 행으로 표시한다. 사용자가 발송한 보고서와 자동 장애 알림은 다른 동작이다. → 실패: 연결 검사만으로 실제 장애 전달 성공을 표시하거나 검사 중 메시지를 게시하면 실패
- 현재: `apps/wake/desktop/conn-ops.cjs:35`의 notifyCheck와 :117의 send가 연결 확인·Slack 발송을 분리한다.
- 차이: Slack 외 발송 경로는 unsupported이며 장애 알림 스위치는 발송 서비스에 연결되지 않는다. → TASK-A3-TOOL-005
- 고정 장치: 고정 없음 → TASK-A3-TOOL-005
- 출처: D00464 D00471 D00740 D00993; R-058,R-059; apps/wake/app.config.js:527-530; apps/wake/desktop/conn-ops.cjs:35-44,76-79,117-123.
