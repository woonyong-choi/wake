# 렌더링과 성능

## 공통 판정

현재는 2026-11-17 작업 트리의 정적 확인이다. 기존 시험의 위치와 현재 실행 결과를 구분한다. 이 문서의 소스 확인은 제품 시험·성능 측정·Electron 캡처의 통과를 뜻하지 않는다. 과거 보고의 통과를 현재 완료로 승계하지 않는다. 질문·붙여넣은 계획은 세부 정책이나 수치의 승인이 아니다. 목표는 D-USR-2026-11-16-1~7에 따라 확정 결정과 번복 가능한 기본값을 구분한다.

DEC·MSG·LAB·BACKEND 같은 약칭과 B1-7·U01-3·T1-4 같은 회차 표기는 저장소 밖 과거 기록(결정 기록, 시험 환경, 백엔드 최적화 요청, 단위별 검토 보고)을 가리킨다. 현재 목표는 이 문서의 규칙에서 읽는다. 동시성 문서의 PERF 약칭은 BACKEND와 같다.

축약 경로 `desktop/`, `data/`, `pages/`는 `apps/wake/` 아래다. 작업 ID는 이 문서의 후속 작업이며 tasks.md 등록을 뜻하지 않는다. 이 파일의 표는 검사·설계·자료 필드 대응표이며 제품 화면의 열 정의가 아니다. 행 클릭·검색·숨김 순서는 화면 영역이 맡는다.

고정 장치는 명시한 시험의 범위만 고정한다. 예를 들어 홈 펼침 시험은 전체 라우트 layout-shift 합격을 대신하지 않는다. 전체 측정이 없는 범위는 차이에 연결한 작업에서 검증한다.

공통 규칙은 PERF-009(측정·원본 대조), PERF-011(화면 정체·테마·폭), PERF-020(표 폭), PERF-021(전문 툴팁), PERF-026(뼈대), PERF-028(톤·동작 보존), PERF-033(정합성)이다. 모든 항목에 적용한다. 빈 값·7상태·관측 시각은 [CON-023](concurrency.md#con-023)·[CON-024](concurrency.md#con-024)를 참조한다.

화면 속도는 → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE), 최초 펼침은 → [RULE-FOLD](rules.md#RULE-FOLD).

## 수치와 완료 기준

### PERF-001

시작 뒤 배치 이동

- 목표: 홈을 처음 연 뒤 같은 metricSeries를 60초 주기로 갱신하고 summaryBar 설명 길이를 바꾼다 → 첫 화면부터 최종 배치를 유지한다; [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE). 데이터 갱신만으로 카드가 열리고 닫히며 생기는 이동은 0이다. 카드 안 값만 바뀌는 경우도 위아래 위치와 행 높이를 보존한다. 요약 글이 “변화 없음”과 비교 표현 사이에서 바뀌어 분할 영역이 늘고 줄지 않아야 한다(D00807); 
- 현재: `apps/wake/pages/cluster-home.js:46,387`에 최초 펼침 고정과 뼈대가 있다. 전 화면 배치 이동은 측정 전이다.
- 차이: 전 화면 이동량·상세 최초 펼침의 현재 실측이 없다. T-PERF-01, T-PERF-05, T-PERF-06.
- 고정 장치: `apps/wake/pages/cluster-home.test.mjs` — `a_metric_bar_over_its_threshold_opens_only_when_the_screen_is_first_drawn_with_it`; `apps/wake/pages/cluster-home.test.mjs` — `a_metric_bar_crossing_its_threshold_after_the_first_drawing_stays_closed_and_marks_its_head`; `apps/wake/pages/cluster-home.test.mjs` — `home_draws_bars_of_the_final_size_with_grey_value_places_before_its_data`
- 점검: → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE). 뼈대와 완성 캡처를 같은 viewport·스크롤·펼침 상태로 대조한다. 사용자에 의한 한 번의 분할 재배치는 입력 여부와 함께 별도로 기록한다.
- 출처: D-USR-2026-11-16-7; D-USR-2026-11-16-5; D00807, D01021

### PERF-002

빈 창과 빈 카드

- 목표: → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE); [RULE-SKELETON](rules.md#RULE-SKELETON).
- 현재: `kit/desktop/main.cjs:392,900`은 준비 대기·1500ms/5000ms 탈출을 두지만 Linux는 즉시 노출하고 오류 문서도 drawn으로 센다.
- 차이: Linux·준비 실패·타이머 만료의 빈 프레임 방지가 남는다. T-PERF-02, T-PERF-03, T-PERF-06.
- 고정 장치: `kit/desktop/main-url.test.cjs` — `a window shows once its placed in-app pages have drawn, and a place already sent is not sent to the view again`; `kit/desktop/main-url.test.cjs` — `a pane keeps showing its previous tab until the new tab has drawn`; `kit/desktop/main-url.test.cjs` — `a failed first document counts as drawn for the window`
- 점검: → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE); [RULE-SKELETON](rules.md#RULE-SKELETON).
- 출처: D-USR-2026-11-16-5; D01022, D01027

### PERF-003

전환 첫 그림

- 목표: → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE). 같은 클러스터의 구역 8개는 한 문서 안에서 바꾼다. 이전 화면이 계속 보인 시간을 새 화면의 첫 그림으로 세지 않는다; 
- 현재: `apps/wake/routes.js:4`와 `kit/desktop/main.cjs:506`은 구역마다 문서와 loadURL을 사용한다. 현재 전환 지연은 측정 전이다.
- 차이: 한 문서 전환·현재 150ms 판정이 없다. T-PERF-01, T-PERF-03, T-PERF-04.
- 고정 장치: 고정 없음 → T-PERF-01
- 점검: → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE). 기존 문서 FCP를 재사용하지 않는다. 같은 문서 전환은 새 구역 DOM 식별자와 다음 실제 paint를 기준으로 계측한다. 원자료의 각 시행과 최댓값을 남기고 평균만으로 초과값을 숨기지 않는다.
- 출처: D-USR-2026-11-16-7; D-USR-2026-11-16-5; D01023

### PERF-004

데이터 완성

- 목표: → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE).
- 현재: `apps/wake/pages/cluster-home.js:70`의 loadSeries 읽기와 `apps/wake/data/index.js`의 metrics.range 연결이 있다. 현재 데이터 완성 시간은 측정 전이다.
- 차이: 필수 읽기를 포함한 1초 판정이 없다. T-PERF-01, T-PERF-04, T-PERF-10.
- 고정 장치: 고정 없음 → T-PERF-01
- 점검: → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE).
- 출처: D-USR-2026-11-16-7; D-USR-2026-11-16-5; D00743

### PERF-005

백엔드 지연과 중복 요청

- 목표: → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE). IPC 메시지 수와 실제 원본 호출 수를 각각 센다. 요청의 출처·대상 UID·권한·시간 구간·오래됨 의미를 바꾸지 않는다. 
- 현재: `apps/wake/desktop.config.cjs:19`의 6개 서비스는 `kit/desktop/main.cjs:759`에서 `kit/core/live.js` createRequestGate로 진행 중 Promise를 공유한다. 클러스터 API는 `apps/wake/desktop/provider-connections.cjs:22`에서 클러스터마다 동시 6개 상한과 같은 GET 공유, 렌더러 데이터층은 `apps/wake/data/index.js:224`에서 같은 읽기를 공유한다. 리소스(모든 종류) 30초 서비스 호출 120→42·진행 중 중복 39→0, 이벤트 75→21·12→0([H-009 갱신 경로 부하](tasks.md#H-009-refresh-load)). 2차에서 Kubernetes 목록은 메인 프로세스 watch 공유 캐시(`apps/wake/desktop/kube-watch.cjs`)와 문서별 차이 밀어 주기로 바꿨다: 60초 리소스(모든 종류) IPC 206→42건·4.36MB→48KB, 클러스터 HTTP 85→7건·6.7MB→46KB, 이벤트 IPC 4.36MB→44KB·HTTP 37→7, 로그 따라가기 IPC 5.7MB→69KB·HTTP 68→26([갱신 경로 2차](tasks.md#H-009-watch-cache)). 도구 바인딩 확인 30초·도구 찾기 120초·kube.read는 kubeconfig 변경까지 재사용한다. p95는 미확인이다.
- 차이: 전체 서비스 공유·권한별 키·p95 검사가 없다. 리소스 상세·GitOps·홈 출처·셸 연결 확인은 아직 주기 읽기다. T-PERF-10, T-PERF-13.
- 고정 장치: `apps/wake/desktop/kube-watch.test.cjs`, `apps/wake/desktop/services-watch.test.cjs`, `apps/wake/data/index.test.mjs`의 watch·로그 시험([Q-H102](quality.md#Q-H102)). 그 밖 → T-PERF-10
- 점검: 서비스별 p50·p95·p99, IPC 수·바이트·직렬화 시간, 원본 요청 수·바이트·재시도·timeout을 동일 스크립트로 전후 대조한다. 화면 4개 동시 다시 읽기, 감지 주기와 수동 읽기 겹침, MCP·HTTP 동시 호출을 포함한다. 원본 대기와 Wake 처리 시간을 분리하며 원본 대기를 생략해 [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE)의 IPC 목표를 통과 처리하지 않는다.
- 출처: D-USR-2026-11-16-7; D01024

### PERF-006

유휴 CPU와 이벤트 루프

- 목표: → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE). 실제로 실행 중·대기 중인 작업의 상태 움직임을 삭제하거나 데이터 읽기를 끊어 수치만 낮추지 않는다. 전환 긴 프레임의 창·경계·개수는 [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE)로 판정한다. 
- 현재: `kit/page/boot.js:101`은 이미 그린 숨은 문서의 재그리기를 보류하고 첫 그림 뒤 갱신은 다음 프레임에 한 번 그린다(`:107`). 리소스·이벤트 갱신은 `kit/core/live.js:98` createLiveFeed로 밀려온 차이 묶음마다 한 번 읽고(숨은 문서는 구독을 닫음), 로그 따라가기·홈 출처 상태는 `kit/core/live.js:63` createLivePoll로 숨은 문서에서 읽지 않고 진행 중 틱을 건너뛰며 실패·느린 응답에 간격을 늘린다. 60초 메인 CPU는 리소스 731→135ms, 이벤트 476→185ms(부하 다름, [갱신 경로 2차](tasks.md#H-009-watch-cache)). 리소스 상세·GitOps 폴링은 아직이다. CPU·이벤트 루프 예산 충족은 측정 전이다.
- 차이: 숨은 작업 수명·CPU·loop delay·긴 프레임 측정이 없다. T-PERF-07, T-PERF-08, T-PERF-09, T-PERF-13.
- 고정 장치: 고정 없음 → T-PERF-07
- 점검: 시작, 1시간 유지, 24시간 상당 가속 실행에서 메인 CPU·RSS·`monitorEventLoopDelay`·GC 시간·렌더러 긴 프레임을 기록한다. 유휴의 연결 클러스터·열린 탭·보이는 차트·갱신 주기·샘플링 구간을 고정한다. 긴 프레임은 함수별 CPU 프로파일에 연결한다; [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE).
- 출처: D-USR-2026-11-16-7; D00701, D00702

### PERF-007

메모리와 자원 수명

- 목표: 클러스터 연결·해제와 탭 열기·닫기를 100회 반복하고 같은 부하를 24시간 상당으로 진행한다 → 누수는 0이어야 한다. 24시간 상당 가속 실행의 RSS는 지속 증가하지 않고 안정화되어야 하며, 클러스터 해제 후 해당 클러스터의 연결·타이머는 0이다. 종료·오류·탭 폐기 때 소켓, 포트포워딩, watcher, CLI 하위 프로세스를 정리한다. → 해제된 cluster의 소켓·타이머가 남거나 process.memoryUsage().rss가 반복마다 증가하면 실패
- 현재: `apps/wake/desktop/kube-watch.cjs`는 구독자 수를 세어 마지막 구독 뒤 60초에 watch 소켓과 목록을 버리고, 연결 해제(hub.release)·앱 종료에 그 클러스터·모두를 닫는다. 이벤트 캐시는 10,000개 상한(합성 50,000개 시험). `apps/wake/desktop/reads/index.cjs:83,138`에 release·close 정리, `apps/wake/pages/cluster-home.js:394`에 monitoring dispose, `kit/components/chart-card.js:760`에 늦은 엔진 폐기가 있다. 전체 누수 0은 미검증이다.
- 차이: 100회·24시간 자원 회수와 RSS 안정화 판정이 없다. T-PERF-13.
- 고정 장치: 고정 없음 → T-PERF-13
- 점검: 1시간 실시간 관측과 24시간 상당 가속 실행, 해제·재연결 100회에서 RSS·heap·할당·열린 파일·소켓·타이머·포트포워딩·WebSocket·하위 프로세스 수를 전후 대조한다. GC 후 heap의 기준점과 반복 종료 뒤 남은 참조를 확인한다. RSS의 순간 증감을 0바이트로 강제하지 않고 회수되지 않는 지속 증가와 잔존 자원을 실패로 판정한다. 허용 측정 오차와 RSS 안정화 판정 구간은 기준선 단계에서 고정해야 하며 아직 수치가 없다.
- 출처: D-USR-2026-11-16-7; 기존 제품·kit 계약에서 도출한 세부 설계 기본값

### PERF-008

90일 저장 크기

- 목표: 동일 원자료·조회 결과를 유지해 압축 전후 저장소를 비교한다. 크기 목표와 실패 판정은 → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE), 보관 정책은 → [RULE-RETENTION](rules.md#RULE-RETENTION).
- 현재: `apps/wake/desktop/hub-store.cjs:45`는 JSONL append·문서 전체 읽기/쓰기이고 압축·기간 조각·조회 인덱스가 없다. `apps/wake/desktop/reads/index.cjs:37`은 90일·7일 저장 인스턴스를 분리한다.
- 차이: 압축·인덱스·1/5 비교가 없다. 저장소의 단일 retentionDays가 대화 365일·source-checks 90일을 구분하지 않는다. T-PERF-14.
- 고정 장치: 고정 없음 → T-PERF-14
- 점검: 동일 이벤트율과 원본 집합으로 하루 증가량과 90일 추정량을 산출하고, 압축 뒤 총 파일 크기÷기준선 ≤0.2. 인덱스·메타데이터·임시 조각도 포함한다. 원본 읽기 결과·근거 해시·감사·마스킹·권한·TTL 경계를 전후 대조한다. 실제 90일 관측과 가속·추정치를 구별한다. 저장 최적화의 구체 항목은 PERF-030을 따른다.
- 출처: D-USR-2026-11-16-7; D-USR-2026-11-16-4; D00465, D00472

## 측정과 판정

### PERF-009

측정 조건과 시나리오

- 목표: 같은 코드 해시·lab snapshot·viewport·theme으로 개선 전후 계측을 수행한다 → 추측으로 최적화하지 않는다. 같은 앱 코드·실제 lab·자료 상태·기기·시계·테마·폭·스크롤·펼침·계측 스크립트로 전후를 잰다. 1분 호스트 부하 10 이하의 시간값만 기준선으로 사용한다. 10 초과 관측은 참고로 분리하고, 20 초과 측정은 무효로 남긴다. → os.loadavg()[0]이 20을 넘은 시행을 유효 표본에 넣거나 서로 다른 입력을 전후 비교하면 실패
- 현재: `kit/tools/check-layout.mjs:79`는 조상 scrollTop 이동을 검사한다. P1의 1440×900·Electron 44.7.2 개발 실행 계측은 있으나 현재 전후 측정·정식 패키지 결과는 없다.
- 차이: 최신 실행 정체·부하·종료 코드 강제가 남는다. T-PERF-01.
- 고정 장치: 고정 없음 → T-PERF-01
- 점검: 아래 시나리오와 열을 빠짐없이 기록한다. 첫 정상 시작은 기존 기준선과 비교하도록 최소 3회 기록한다. 이후 전환 반복 횟수는 실행 전 고정하며 모든 시행을 남긴다. 이 횟수 규칙은 문서의 재검사 절차이지 과거 사용자가 승인한 새 성능 수치가 아니다.
- 출처: D-USR-2026-11-16-7; D00458, D00702, D00743, D00872

| 시나리오 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| 앱 시작·새 창 | 앱 프로세스를 시작하고 새 창을 연다 → 프로세스 시작·창 노출·셸 첫 그림·사이드바·탭 FCP·필수 자료 완료·bounds/rect를 각각 기록 → 첫 창 노출만으로 데이터 완료 시간을 대체하면 실패 | kit/desktop/main.cjs:429 revealWindow는 placed/drawn을 본다 | 타임라인 CSV를 기록하는 저장소 도구가 없다 | 고정 없음 → T-PERF-01 | D-USR-2026-11-16-5 |
| 구역 8개 | 홈·리소스·네트워크·GitOps·이벤트·로그·알림·인시던트·홈 순서로 이동 → 각 입력/목적 paint/데이터 완료 시각과 document·scheme 요청 수 기록 → 이전 문서 FCP 재사용이나 누락된 구역이 있으면 실패 | kit/desktop/main.cjs:506 구역 전환에 loadURL을 부른다 | 같은 문서 구역 이동과 전환 계측이 없다 | 고정 없음 → T-PERF-04 | D01023 |
| 상세·AI | 리소스 행·AI 열기·닫기·크게 보기·복귀를 클릭한다 → 각 칸 DOMRect와 setBounds 횟수·내용 진입·목록 상태 기록 → 내용 paint 전 빈 칸이나 중간 폭을 최종 폭으로 세면 실패 | kit/shell/shell.js:390 ready 뒤 칸을 배치한다 | 입력 직후 배치와 ready 지연을 나누는 자동 계측이 없다 | 고정 없음 → T-PERF-03 | D01022 |
| 설정·탭 | 설정 이동·새 탭·이미 그린 탭·뒤로·앞으로·새로고침·복원을 수행 → 각 실제 목적 URL의 첫 그림과 저장 state 복원을 기록 → 원래 탭만 보이는 지연을 목적 화면 성공으로 세면 실패 | kit/desktop/main.cjs:393 holder가 이전 탭을 유지한다 | 유지된 이전 화면과 새 paint를 구분한 계측 결과가 없다 | 고정 없음 → T-PERF-01 | D01023 |
| 갱신 | 홈에서 90초 머물며 임계값 아래/위와 실패/복구 자료를 보낸다 → folded·머리 tone·scrollTop과 입력 없는 이동 합 기록 → 임계값 갱신으로 자동 toggle이나 사용자 스크롤 이동이 생기면 실패 | apps/wake/pages/cluster-home.js:46 folded가 사람 선택을 저장한다 | 홈 외 상세의 최초 펼침 경계를 고정하는 시험이 없다 | 고정 없음 → T-PERF-05 | D01021 |
| 렌더 비용 | 자료 읽기를 유지하며 같은 DOM 갱신과 구역 전환을 반복한다 → CPU·LoAF·50ms 이상 작업·forced layout과 format/fit/tooltip/engine 호출 위치 기록 → 읽기를 끊거나 함수 위치 없는 평균만 비교하면 실패 | kit/components/data-table.js:158 fit이 폭을 측정한다 | forced layout 및 LoAF 임계값을 통합 판정하는 도구가 없다 | 고정 없음 → T-PERF-07 | D-USR-2026-11-16-7 |
| 백엔드 | Pod 1000·5000 조건에서 홈·상세·로그·지표·감지·MCP/HTTP를 호출 → IPC와 원본 요청별 횟수·byte·지연 기록; 실제 lab에 없는 규모는 합성 입력 표시 → 합성 부하를 실제 cluster 값으로 기록하거나 서비스 읽기를 누락하면 실패 | kit/desktop/main.cjs:756 cfg.coalesce 서비스만 Promise를 공유한다 | 원본별 호출 계수·5000 Pod 실제 자료 판정이 없다 | 고정 없음 → T-PERF-13 | D01024, D-USR-2026-11-16-7 |

CSV의 최소 열은 실행 ID, 코드 해시 목록, 시작·종료 절대 시각과 시간대, 앱·Electron 버전, OS, PID, userData 경로, 클러스터 ID, route·대상 UID·query·기간, 테마, viewport, 펼침·스크롤 상태, 동작, 상대 시각 ms, 호스트 부하, 첫 그림 ms, 데이터 ms, 입력 없는 이동 합, 전체 이동 합, rect, IPC 이름·횟수·바이트·시간, 원본 호출 횟수·시간, 유효 여부와 제외 사유, 영상·프로파일 위치다. 데이터나 권한이 다른 두 시행을 직접 성능 개선율로 계산하지 않는다.

### PERF-010

실행 소유와 격리

- 목표: 전용 user-data-dir·디버그 포트로 성능 실행을 시작하고 하위 계측 명령을 실패시킨다 → Electron 동시 실행은 2자리, 무거운 점검은 1개, 독립 검증은 1개다. 자기 앱·자기 디버그 포트·자기 userData만 조작한다. 실제 사용자 설정과 다른 단위의 앱은 읽기·캡처 대상에서 제외한다. 파일 소유가 겹치면 그 파일 구현을 시작하지 않는다. 정지 지시는 새 측정 큐를 자동 재개하지 않는다. → 2/1/1 상한을 넘거나 타 작업 PID·프로필을 조작하거나 하위 실패 종료 코드를 최종 성공으로 바꾸면 실패
- 현재: `kit/desktop/main.cjs:291`는 user-data-dir을 사용한다. 옛 p1-session.sh는 maxLoad 20·단계 기본 99·최종 exit 0이어서 현재 합격 실행기로 쓸 수 없다.
- 차이: PID·userData·부하와 하위 종료 코드의 동시 강제가 없다. T-PERF-01. 실행기 보완 전 옛 큐 스크립트 재사용 금지.
- 고정 장치: 고정 없음 → T-PERF-01
- 점검: `--user-data-dir=<전용 폴더>`의 실제 런타임 경로와 포트 listener PID를 시작 PID와 대조한다. KUBECONFIG는 지정 시험 파일만 쓰며 `~/.kube/config`는 쓰지 않는다. Electron 자리 최대 2개, 1회 최대 10분, slot1 포트 9401~9409, slot2 9411~9419, 무거운 전체 점검은 `heavy.lock` 한 개로 직렬 실행한다. 20 초과에서 새 Electron·측정·무거운 점검·클러스터 변경을 시작하지 않는다. 10~20은 성능 기준선으로 채택하지 않는다. 포트 범위 추측 연결과 사용자 프로세스 종료는 금지한다.
- 출처: D-USR-2026-11-16-7; D-USR-2026-11-16-6; 기존 제품·kit 계약에서 도출한 세부 설계 기본값

### PERF-011

캡처 정체와 회귀 판정

- 목표: 다크·라이트와 지정 창 폭에서 목적 URL을 열고 본문 마지막 행까지 스크롤한다 → 그림을 찍는 순간 목적 URL, 고유 화면 요소, 클러스터·대상·조회 범위가 일치해야 한다. 다크·라이트 × 1280·1440(1680 추가 기본값 채택)에서 처음과 끝까지 스크롤한 상태를 본다. 성능 수정으로 승인된 모양·정보·상호작용을 바꾸지 않는다. → 캡처의 URL·대상 UID·기간이 요청과 다르거나 마지막 실제 행이 잘리면 실패
- 현재: `kit/tools/check-layout.mjs:79`와 check-states는 배치·상호작용 검사다. 실제 URL·대상과 성능을 함께 판정하는 현재 결과는 없다.
- 차이: 정확한 화면의 끝 스크롤·잘림·native 판정이 남는다. T-PERF-01, T-PERF-12, T-PERF-15.
- 고정 장치: 고정 없음 → T-PERF-01
- 점검: 캡처 직전·직후 URL과 고유 요소를 검사하고 불일치면 실패한다. `network`를 찍었는데 홈이면 픽셀 차이 0이어도 무효다. 같은 데이터·고정 시계·viewport·스크롤·펼침·배경을 맞추고 승인된 변경 영역 외 픽셀 차이 0을 검사한다. 동적 마스크는 실행 전에 정하며 결과를 통과시키려고 사후 확대하지 않는다. 두 검토자가 같은 고정 사본을 독립 판정한다. 단위 PASS는 사용자 영향 major 0, minor는 남은 작업으로 보존한다. 결함 0 회차와 사용자 검수·머지 조건은 별도다.
- 출처: D-USR-2026-11-16-7; D00113, D00455, D00457, D00458

## P1 결함별 구현 계약

여기서 D1~D14는 과거 P1 원인 목록의 번호다. 결정 기록의 D00001 형식이나 L1의 P1~P7 결함 번호와 다르다. 각각의 현재 상태는 기능의 존재와 남은 성능 검증을 함께 적는다.

### PERF-012

D1 창을 내용보다 먼저 노출

- 목표: 저장된 테마·최종 창 크기로 앱을 시작하고 네이티브 모서리 모듈을 지연시킨다 → 창은 최종 크기·테마·사이드바 설정과 첫 페이지 그림이 준비된 뒤 노출한다. 네이티브 모서리 모듈의 동기 로드가 셸 적재를 가로막지 않게 한다. → 첫 노출 frame의 theme·bounds가 최종 설정과 다르거나 모듈 대기 중 빈 창이 보이면 실패
- 현재: `kit/desktop/main.cjs:900`은 show:false·macOS/Windows opacity 0·loadURL 뒤 네이티브 처리를 쓴다. Linux 즉시 노출과 오류 탈출은 미검증이다.
- 차이: 플랫폼별 첫 노출·실패 탈출·첫 테마 검사가 없다. T-PERF-02.
- 고정 장치: 고정 없음 → T-PERF-02
- 점검: PERF-002. 시작 3회와 새 창에서 창 노출보다 셸·페이지 paint가 늦지 않아야 한다. 라이트 시작에서 다크 한 프레임도 없어야 한다. native 모듈 로드 시간과 `loadURL` 순서를 프로파일로 남긴다.
- 출처: D-USR-2026-11-16-7; D01027

### PERF-013

D2 새 탭과 view의 빈 카드

- 목표: 자료가 있는 탭에서 아직 그리지 않은 새 탭과 외부 도구 탭으로 전환한다 → 같은 칸에서 아직 그리지 않은 새 탭으로 갈 때 이전의 유효한 화면을 유지하고 새 페이지 첫 그림 뒤 교체한다. 새 탭을 숨긴 동안에도 준비 작업은 진행되어야 한다. 외부 도구 view를 불필요하게 분리·재부착하지 않는다. → 새 탭의 drawn 전에 이전 유효 화면을 지우거나 이미 붙은 외부 view를 분리하면 실패
- 현재: `kit/desktop/main.cjs:393`은 holder·waiting·lingering으로 이전 화면을 유지하고 교체 뒤 120ms 잔류·130ms 정리를 한다. 1500ms 탈출은 실제 그림과 별개이며 신규 상세·AI에는 이전 칸이 없다.
- 차이: 새 칸의 이전 화면 부재와 오류 탈출에 대한 빈 프레임 검사가 없다. T-PERF-02, T-PERF-03.
- 고정 장치: `kit/desktop/main-url.test.cjs` — `showing a newly prepared tool leaves its native view attached, and still raises older tabs`
- 점검: PERF-002. 새 탭·사이드바 탭·설정·도구 탭에서 이전 화면과 새 화면 사이 빈 프레임 0. 교체 뒤 옛 페이지의 클릭·초점이 남지 않아야 한다. 오류 문서와 배경 탭에서 교체가 영원히 멈추지 않아야 한다.
- 출처: D-USR-2026-11-16-7; D01027

### PERF-014

D3 셸 왕복을 기다리는 첫 그림

- 목표: 일반 페이지를 boot 값과 함께 열고 별도로 presentation·대화 handoff 페이지를 연다 → 일반 페이지의 첫 그림에 필요한 app·tab·테마·locale·저장 설정은 부트에서 제공한다. 일반 페이지는 `page:ready`와 `shell:init` 왕복을 기다리지 않는다. 상세 presentation 또는 대화 handoff를 받는 페이지는 필요한 정보 없이 먼저 그리지 않는다. → 일반 페이지가 shell:init까지 비어 있거나 handoff 페이지가 대상 없이 먼저 그리면 실패
- 현재: `kit/desktop/preload-page.cjs`·`kit/page/boot.js:200`은 일반 페이지의 조기 부트를 제공하고 handoff는 기다린다. 보이는 문서는 두 rAF 뒤, 숨은 문서는 즉시 drawn을 보내므로 실제 노출 확인은 별도다.
- 차이: 부트 구현은 있으나 drawn과 실제 native paint의 현재 대조가 없다. T-PERF-01에서 현재 native 시작 순서 재측정. 구현을 되돌려 일반 페이지를 다시 왕복 대기시키지 않는다.
- 고정 장치: `kit/page/boot.test.mjs` — `bootPage_desktop_draws_from_the_boot_values_before_the_shell_init_and_says_it_drew`; `kit/page/boot.test.mjs` — `bootPage_desktop_page_taking_a_handoff_waits_for_the_shell_init`
- 점검: 일반 페이지는 boot 값으로 먼저 그리고 뒤 `shell:init`을 권위 있는 갱신으로 적용한다. 상세·handoff 페이지는 기존 ID·대화·초점·표시 계약을 보존한다. `page:ready { drawn }`과 실제 paint를 분리 계측한다. 빠른 응답으로 잘못된 테마·대상이 한 프레임 보이면 실패다.
- 출처: D-USR-2026-11-16-7; D00702, D01023

### PERF-015

D4 파일 읽기와 문서 재생성

- 목표: 같은 정적 모듈을 두 번 읽은 뒤 파일의 import와 mtime을 바꾸어 다시 연다 → 정적 파일 읽기는 비동기이고 같은 크기·수정 시각 파일의 본문을 재사용한다. 정적 import 그래프를 미리 알리며, 같은 클러스터 구역 이동에서는 문서 재생성과 같은 자료 재수집을 없앤다. 개발 중 바뀐 파일을 오래된 캐시로 감추지 않는다. → 바뀐 모듈이 이전 moduleGraph 캐시에 남거나 같은 클러스터 이동에 loadURL이 발생하면 실패
- 현재: `kit/desktop/main.cjs:320`의 readKept는 비동기 stat 후 크기·mtime이 같으면 본문을 재사용한다. moduleGraph는 entry별 수명 캐시여서 import 변경 무효화가 없고 응답은 no-cache다. routePage는 page만 반환한다.
- 차이: import 그래프 무효화·문서/요청 0회 전환이 없다. T-PERF-04. 강한 HTTP 캐시를 이미 구현했다고 기록하지 않는다.
- 고정 장치: 고정 없음 → T-PERF-04
- 점검: cold·warm을 분리해 scheme 요청 수·총 바이트·파일 read 횟수·새 문서 수를 잰다. 같은 파일 재요청은 본문 디스크 읽기 없이 반환하고 수정 파일은 새 내용이 보인다; [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE). 그래프 캐시 무효화는 entry뿐 아니라 import 변경도 검사한다.
- 출처: D-USR-2026-11-16-7; D01023

### PERF-016

D5 칸의 폭 애니메이션

- 목표: 검색·선택·스크롤이 있는 목록에서 상세·AI 칸을 열고 닫기·크게 보기·복귀한다 → 상세·AI 칸의 폭을 0부터 260ms 동안 키우거나 닫을 때 줄이지 않는다. 최종 비율로 한 번에 배치하고 내용만 기존 진입 모션으로 나타낸다. 닫기·크게 보기·복귀도 폭을 프레임마다 재배치하지 않는다. 기존 목록의 검색·필터·선택·스크롤을 보존한다. → appFrame의 칸 폭이 중간 프레임마다 변하거나 목록 search·scrollTop이 초기화되면 실패
- 현재: `kit/shell/shell.js:390,820`은 ready 또는 1500ms 뒤에 최종 폭을 한 번 적용하며 `kit/components/app-frame.js:30`에는 폭 transition이 없다. 입력 즉시 배치·sim의 16px/450ms 내용 진입·native 전후는 미검증이다.
- 차이: ready 뒤 배치는 입력 순간 배치와 다르며 내용 진입·빈 카드 검증이 남는다. T-PERF-03. 준비 지연 중 최종 칸의 실제 뼈대를 먼저 그리는 방식과 current ready 대기를 요구에 맞춰 정리한다.
- 고정 장치: 고정 없음 → T-PERF-03
- 점검: 같은 화면에서 상세·AI 열기, 닫기, 확대·복귀를 녹화한다; [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE). 문서 밖 셸과 native view의 위치가 한 프레임씩 어긋나지 않아야 한다. reduced-motion에서는 내용 진입도 종단 상태만 보인다.
- 출처: D-USR-2026-11-16-5; D00448, D01022

### PERF-017

D6 자동 펼침 C안

- 목표: → [RULE-FOLD](rules.md#RULE-FOLD).
- 현재: `apps/wake/pages/cluster-home.js`는 최초 진입의 performance.now 마감과 지표·인시던트가 판단 가능해진 시각을 비교한다. 첫 그림이 늦어져도 마감 안 자료는 유지하고 마감 뒤 자료는 닫힌 상태로 고정한다. `kit/page/boot.js`는 init 중 갱신을 그리지 않는다. 상세·캐시 재진입 전체 적용은 미확인이다.
- 차이: 모든 상세와 캐시 재진입의 최초 판단 경계가 고정되지 않았다. T-PERF-05, T-PERF-04.
- 고정 장치: `apps/wake/pages/cluster-home-boot.test.mjs`의 `home_bootPage_first_drawing_obeys_the_fold_window`(실제 bootPage, 합성 응답과 이벤트 루프 지연); `apps/wake/pages/cluster-home.test.mjs`의 `home_fold_uses_arrival_*_even_when_first_render_is_late`; `apps/wake/pages/cluster-home.test.mjs`의 `a_metric_bar_over_its_threshold_opens_only_when_the_screen_is_first_drawn_with_it`·`incident_cards_arriving_after_the_first_drawing_stay_closed_until_a_person_opens_them`. 상세·재진입 잔여 → T-PERF-05
- 점검: → [RULE-FOLD](rules.md#RULE-FOLD).
- 출처: D-USR-2026-11-16-7; D-USR-2026-11-16-5; D01021

### PERF-018

D7 같은 view 위치 반복 전송

- 목표: 같은 viewport rect에서 스피너만 움직이고 이어 본문 스크롤로 rect를 바꾼다 → rect와 반경이 같으면 `tabs:layout`을 다시 보내지 않고, main도 같은 rect에 `setBounds`를 호출하지 않는다. 스피너·버튼·알약 표시기의 애니메이션으로 400ms 동안 배치를 추적하지 않는다. 실제 viewport를 움직이는 상자와 스크롤만 반영한다. → 같은 rect인데 tabs:layout 또는 setBounds가 다시 호출되거나 실제 이동이 누락되면 실패
- 현재: `kit/shell/hosts/desktop-host.js:24`의 placed 비교·상자 제한 follow와 `kit/desktop/main.cjs:406`의 sameRect가 중복 위치 전송·setBounds를 막는다. setVisible은 별도다.
- 차이: 중복 제거 코드는 있으나 현재 호출 수의 실측이 없다. T-PERF-01에서 현재 수치 재측정.
- 고정 장치: `kit/shell/hosts/desktop-host.test.mjs` — `relayout_sends_a_changed_place_once_and_follows_only_boxes_that_can_move_the_slot`; `kit/shell/hosts/desktop-host.test.mjs` — `scrolling the frame moves the native viewport without following sibling scrolls`
- 점검: 정지 화면 20초·구역 이동·상태 고리 반복에서 동일 rect IPC와 동일 setBounds 0회. 칸 크기·창 크기·스크롤이 실제 바뀌면 새 rect를 놓치지 않는다. 이전 측정의 시작 layout 28회→1회, setBounds 57~65회→2회와 현재 값을 구분한다.
- 출처: D-USR-2026-11-16-7; D00701, D00702

### PERF-019

D8 설정 저장과 전 탭 전파

- 목표: kit.session만 연속 변경한 뒤 저장 대기 중 앱을 종료하고 디스크 쓰기 실패도 주입한다 → 연속 설정 저장은 모아 기록하되 종료 때 남은 값을 저장한다. 페이지가 쓰지 않는 `kit.session` 변화 때문에 모든 페이지의 onSettings·재계산을 돌리지 않는다. 전환 중 동기 파일 쓰기 비용을 계측하고 원자성·오류 표시를 보존한다. → 미사용 페이지 onSettings가 호출되거나 마지막 설정이 유실되거나 저장 오류가 숨겨지면 실패
- 현재: `kit/desktop/main.cjs:301,960`은 200ms debounce·will-quit 동기 flush를 쓰며 쓰기 실패를 삼킨다. `kit/shell/shell.js:592,644`에는 meta마다 세션 저장·전체 settings broadcast가 남는다.
- 차이: session-only 전파 제외·저장 오류 전달·동기 쓰기 제거가 없다. 200ms는 현재 값이다. T-PERF-10.
- 고정 장치: 고정 없음 → T-PERF-10
- 점검: 연속 `page:meta`·전환에서 설정 write 횟수, main 차단 시간, broadcast 횟수, 페이지 재그리기 횟수를 센다. 마지막 변경 후 현재 200ms debounce와 종료 flush를 검증하고 `kit.session`만 바뀔 때 일반 페이지 onSettings 0회를 목표로 한다. 강제 종료·저장 실패를 성공으로 숨기지 않는다.
- 출처: D-USR-2026-11-16-7; D00701, D00702, D01023

### PERF-020

D9 표 열의 반복 측정

- 목표: Name·optional 열이 있는 dataTable에 같은 값 재조회와 좁은 폭 변경을 입력한다 → 첫 그림부터 칸 폭에 맞는 열을 보인다. 숨겼던 열을 매번 전부 풀고 읽기·쓰기·레이아웃을 반복하지 않는다. 이름 열의 최소 폭, 실제 값 표시, optional 우선순위, 표 내부 최후 가로 스크롤은 보존한다. → 첫 paint 뒤 열 폭이 다시 튀거나 바뀌지 않은 표가 모든 optional 셀의 폭을 다시 측정하면 실패
- 현재: `kit/components/data-table.js:158`의 fit은 optional을 풀고 Range·offsetWidth를 읽은 뒤 숨긴다. 의 MutationObserver는 characterData·childList·COL 변경을 microtask로 합쳐 paint 전에 측정하고 :193은 fit 자체의 열 너비 쓰기를 관찰에서 제외한다. :208은 제거된 host의 ResizeObserver·MutationObserver를 해제한다.
- 차이: 동기 변경 묶음의 fit 1회와 다음 paint 전 너비 안정은 브라우저 반례로 고정했다. 실제 morph의 텍스트만 바뀌는 입력에서 셀 사용 가능 폭이 텍스트 폭 이상임을 함께 단언한다. 순수 폭 계산·동일 값 fit 생략·연속 microtask 및 ResizeObserver 전달 사이의 중복 측정·실제 화면 forced layout 비용은 남는다. T-PERF-07.
- 고정 장치: `kit/tools/check-surfaces.test.mjs`의 `table_coalesces_synchronous_changes_and_does_not_refit_its_own_width_writes`·`table_removal_releases_observers_and_reinsertion_observes_again`·`table_refits_changed_values_before_the_next_paint`. 실제 비용 측정 → T-PERF-07
- 점검: 리소스·이벤트·상세 표에서 첫 그림의 열 조합과 완성 뒤 조합, 1280·1680과 세 칸 폭을 비교한다. 같은 폭·동일 값 재그리기에서는 불필요 fit 0회, fit 기인 프레임도 [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE)의 측정 창·경계·개수로 판정한다. `9 (3m ago)` 같은 실제 형식의 최소 폭·전문 열람을 유지하며 단순히 숨겨 빨라지면 실패다.
- 출처: D-USR-2026-11-16-7; D00701, D00702

### PERF-021

D10 툴팁 후보 전체 재측정

- 목표: 말줄임 셀 하나의 textContent만 바꾸고 키보드로 전문을 연 뒤 그 셀을 제거한다 → DOM 변화 때 변경된 영역의 말줄임 후보만 확인하고 한 프레임의 변화를 모아서 처리한다. 말줄임 전문을 마우스와 키보드로 볼 수 있어야 한다. 요소가 사라지면 observer·후보 참조를 해제한다. → 변경하지 않은 root 전체를 다시 측정하거나 전문을 읽을 수 없거나 observer가 제거 셀을 붙잡으면 실패
- 현재: `kit/components/tooltip.js:68`은 mutation·resize마다 root의 모든 overflow 후보를 재측정한다. 후보 Set·ResizeObserver·pagehide 정리는 있고 변경 범위 제한·rAF 묶기는 없다.
- 차이: 변경 영역 제한·프레임별 측정 모으기가 없다. T-PERF-08.
- 고정 장치: 고정 없음 → T-PERF-08
- 점검: 한 셀만 갱신한 큰 표에서 다른 모든 `[data-tip-overflow]`의 geometry를 재조회하지 않는다. mutation·resize 연쇄의 프레임당 측정 수를 기록한다. 전문 툴팁·focus-visible·행 클릭을 유지하고 detached 후보 수가 증가하지 않아야 한다.
- 출처: D-USR-2026-11-16-7; D00447, D00701, D00702

### PERF-022

D11 시각 형식기 재생성

- 목표: 같은 locale·zone·옵션으로 100개 시각과 DST 경계 시각을 format한다 → 같은 시간대·locale·옵션의 `Intl.DateTimeFormat`을 재사용한다. `system`, `utc`, IANA 시간대, DST 중복·건너뜀, 연도가 있는 날짜, 짧은 구간 초 표기를 유지한다. → Intl.DateTimeFormat을 100회 만들거나 시간대·연도·초·DST 표기가 원래 계약과 달라지면 실패
- 현재: `kit/core/clock.js:18`의 parts는 호출마다 Intl.DateTimeFormat을 생성한다. validZone 검사는 format 캐시가 아니다.
- 차이: 형식기 재사용과 생성 횟수 검사가 없다. T-PERF-09.
- 고정 장치: `kit/core/clock.test.mjs` — `an instant is written in the zone asked: utc, a named zone, and seconds only in a short window, the date only in a long one`; `kit/core/clock.test.mjs` — `a day and a full instant always carry the year`
- 점검: 홈·차트 같은 입력의 전후 format 문자열이 같고, 반복 시각 라벨의 형식기 생성 횟수가 서로 다른 설정 수에 비례해야 한다. 과거 `parts` 72~120ms와 같은 조건의 개선 수치를 제출한다. 시간대 설정 변경 때 옛 문자열이 남으면 실패다.
- 출처: D-USR-2026-11-16-7; D00701, D00702

### PERF-023

D12 같은 데이터 중복 읽기

- 목표: 셸·홈·감지·AI를 같은 인자로 열고 다른 문서에서도 app.config.js를 import한다 → 화면·셸·감지·AI가 같은 대상·인자·권한으로 동시에 읽는 원본 작업을 공유한다. 문서가 `app.config.js`를 import했다는 이유로 모든 페이지에서 인시던트 읽기를 시작하지 않는다. 읽기 취소·실패·대상 교체는 공유 이후에도 구별한다. → 문서 import만으로 incident.list를 추가 호출하거나 권한이 다른 요청을 공유하면 실패
- 현재: `apps/wake/app.config.js:177`은 서비스가 있으면 import 때 refreshIncidents를 시작한다. 문서 하나 안의 같은 읽기는 데이터층이 공유한다(`apps/wake/data/index.js:224`). 문서끼리의 공유는 PERF-005의 메인 프로세스 공유와 같다.
- 차이: import 부작용·모든 원본 공유·소비자별 취소가 남는다. 진행 중 공유는 TTL 캐시가 아니다. T-PERF-04, T-PERF-10, T-PERF-13.
- 고정 장치: 고정 없음 → T-PERF-04
- 점검: 시작 incident.list 3회, ai.conversations 2회, kube.read 18회 등 과거 사례를 같은 단계에서 다시 센다. 같은 인자 동시 원본 1회, 새 대상·다른 UID·권한·기간의 합치기 0회. 끝난 Promise는 제거하고 실패 후 재시도 가능해야 한다. 메시지 감소와 원본 작업 감소를 각각 보고한다.
- 출처: D-USR-2026-11-16-7; D00701, D00702, D00743, D01024

### PERF-024

D13 차트 엔진 늦은 적재

- 목표: 4000개와 4001개 표본의 chartCard를 열고 엔진 Promise 완료 전에 카드를 제거한다 → 차트가 있는 화면은 최종 높이를 처음부터 확보하고 엔진 적재 비용을 데이터 뒤 첫 표시에 몰지 않는다. 기존 선·축·범례·툴팁·키보드·실제 표본을 보존하고, 적재 실패는 fallback으로 구별한다. 사라진 차트에 늦게 도착한 엔진을 장착하지 않는다. → 늦은 엔진이 제거된 DOM에 mount되거나 로딩 중 최종 높이가 사라지거나 원본 표본이 바뀌면 실패
- 현재: `kit/core/temporal-chart.js:7`은 4000점 초과 canvas·그 이하 SVG와 페이지당 import Promise를 쓰며 `kit/components/chart-card.js:760`은 lazy load·dispose를 검사한다. 유휴 사전 적재는 없다.
- 차이: 사전 적재·엔진 첫 그림 예산 검사가 없다. T-PERF-09.
- 고정 장치: 고정 없음 → T-PERF-09
- 점검: 네트워크·홈 지표 펼침·상세 지표의 첫 내용과 엔진 적재 시각, 초기화 긴 작업을 기록한다. 이전 네트워크 FCP 641ms 뒤 4.4~4.5초에 엔진 초기화 243ms가 발생한 조건을 재현한다. 사전 적재 뒤에도 엔진 초기화 비용이 남는지 따로 잰다. 없음·한 점·끊김·과거 스냅샷·늦은 응답·닫기 후 응답을 대조한다.
- 출처: D-USR-2026-11-16-7; D00451, D00701, D00702, D00872

### PERF-025

D14 메뉴 재생성과 미리보기 캡처

- 목표: 탭 제목이 그대로인 상태 이벤트를 반복 보내고 다른 탭으로 전환한다 → 탭 상태 변화마다 앱 메뉴 전체를 불필요하게 재생성하지 않는다. 탭 미리보기 그림을 전환의 필수 경로에서 매번 캡처하지 않는다. 메뉴의 활성·checked·zoom·단축키와 미리보기의 올바른 대상은 보존한다. → 변경 없는 menu:state마다 전체 메뉴가 재생성되거나 capturePage가 전환 첫 그림을 막으면 실패
- 현재: `kit/desktop/main.cjs:212,521,632,953`에 thumbOf·이전 탭 capturePage·menu:state마다 setMenu·전체 buildAppMenu가 남는다.
- 차이: 메뉴 재생성·전환 중 캡처 비용이 남는다. T-PERF-11.
- 고정 장치: 고정 없음 → T-PERF-11
- 점검: 탭·구역 전환에서 메뉴 build 횟수와 capturePage·resize·toDataURL 시간을 계측한다. 상태 미변경 메뉴 build 0회, 필요 항목만 변경하거나 묶어서 한 번 처리한다. 미리보기 요청·유휴 처리로 옮긴 뒤에도 대상이 다른 캡처를 보이지 않아야 한다.
- 출처: D-USR-2026-11-16-7; D00701, D00702

## 화면과 구조의 상세 계약

### PERF-026

실제 배치에서 만드는 로딩 뼈대

- 목표: → [RULE-SKELETON](rules.md#RULE-SKELETON); [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE).
- 현재: `apps/wake/pages/cluster-home.js:422`의 초기 읽기가 끝나지 않으면 판단 창이 지난 뒤 첫 뼈대를 그린다. 판단 창의 계약은 [RULE-FOLD](rules.md#RULE-FOLD)이며 첫 그림 측정 시간에서 빼지 않는다. `apps/wake/pages/view-parts.js:81,91,93`은 loading bar·기본 8행 skeletonTable을 제공한다. resource-list·events-view가 쓰지만 `apps/wake/pages/resource-detail.js:641`에는 로그 busy 글자가 남는다.
- 차이: 전 화면 최종 구조 뼈대와 실패 전환 geometry 검사가 없다. T-PERF-06.
- 고정 장치: 고정 없음 → T-PERF-06
- 점검: → [RULE-SKELETON](rules.md#RULE-SKELETON); [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE).
- 출처: D-USR-2026-11-16-7; D00606, D00666, D01021, D01027, D01031

| 부품 또는 화면 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| pageHeader | 주소에 title·icon이 있고 버전·namespace 수는 아직 없음 → pageHeader.title·icon은 실제 값, 미확정 숫자 자리만 skeleton → 제목까지 회색 가짜 문자이거나 버전이 0이면 실패 | kit/components/page-header.js:36 render는 title/icon을 그대로 출력한다 | 페이지가 숫자 placeholder를 전달하는 정책은 render에 없다 | 고정 없음 → T-PERF-06 | D01027 |
| sourceChips | 연결 근거가 있는 Prometheus와 미설정 Loki에서 읽기 대기 → toolViews.included인 Prometheus 칩 자리만 유지 → 읽기 전 Loki가 연결 칩으로 생기면 실패 | apps/wake/pages/cluster-home.js:151 sourceChips에 items를 전달한다 | 새로 발견한 출처의 줄 높이를 예약하는 경로가 없다 | 고정 없음 → T-PERF-06 | D00999, D01027 |
| listToolbar | 자료 요청이 pending인 목록을 연다 → scope/search/filters/time/view의 기존 slot 순서와 disabled를 유지 → 검색창이 데이터 도착 뒤에만 생기거나 slot이 바뀌면 실패 | kit/components/list-toolbar.js:31 SLOTS가 좌우 순서를 고정한다 | 비데이터 조작의 초기 노출은 호출 페이지가 결정한다 | 고정 없음 → T-PERF-06 | D01027 |
| summaryBar | summary와 pods 읽기를 보류한다 → Node·문제 Pod·Warning·인시던트 이름과 값 자리만 표시, 열림은 PERF-017 적용 → 개수가 0으로 나오거나 갱신이 카드를 자동 펼치면 실패 | apps/wake/pages/cluster-home.js:227 pending 두 자료에 SKEL을 쓴다 | 접힘 46px 계획과 실제 토큰 높이의 native 비교가 없다 | 고정 없음 → T-PERF-06 | D01021, D01027 |
| dataTable | 종류별 columns와 페이지 크기를 정한 뒤 목록을 지연한다 → columns 이름·순서·width·optional 그대로 보이고 행 수는 현재 페이지 기준 → 다른 종류의 열이나 고정 8행으로 완성 표 높이가 달라지면 실패 | apps/wake/pages/view-parts.js:81 skeletonTable 기본 n은 8이다 | 호출자가 페이지 크기를 넘기지 않으면 항상 8행이다 | 고정 없음 → T-PERF-06 | D01027 |
| chartCard | chart.height=220이고 state.kind=loading인 차트 → 220px chart-state와 축 자리, 실제 표본 전 0선 없음 → 자료 대기 중 높이가 줄거나 0선이 생기면 실패 | kit/components/chart-card.js:269 stateBody가 height를 유지한다 | loading stateBody에는 완성 차트 축을 그리지 않는다 | 고정 없음 → T-PERF-06 | D00606, D01027 |
| 홈·지표·인시던트 목록 | home 필수 읽기와 incidents를 보류 → 주소의 머리·칩·요약·카드 순서 유지, pending count는 skeleton → 인시던트 대기가 한 줄로 줄거나 미확인 개수가 0이면 실패 | apps/wake/pages/cluster-home.js:368 incidents pending은 stateRow를 반환한다 | 인시던트 목록의 최종 행 구조 대신 상태 줄을 쓴다 | 고정 없음 → T-PERF-06 | D01027 |
| 리소스·이벤트 목록 | Pod·Event columns를 760px 칸에서 pending으로 연다 → 각 columns의 열·optional 순서로 최초 폭을 맞춘 skeleton → Pod에 Event 열을 쓰거나 완성 뒤 열이 밀리면 실패 | apps/wake/pages/view-parts.js:82 columns의 label/width/optional을 복사한다 | 실제 처음 폭의 fit 적용 시점은 페이지별로 확인되지 않았다 | 고정 없음 → T-PERF-06 | D01027, D01033 |
| 상세 모든 탭 | Pod A의 로그에서 Pod B 요약·로그·YAML·관련으로 이동 → 탭별 실제 블록을 먼저 그리고 B 미확정 값만 비운다 → A의 내용이 B 로딩으로 남거나 로그가 busy 한 줄이면 실패 | apps/wake/pages/resource-detail.js:640 로그 미완료는 busy statusIcon이다 | 상세 로그의 최종 코드 구조 뼈대가 없다 | 고정 없음 → T-PERF-06 | D01027 |
| 네트워크·GitOps·로그·알림 | 각 서비스가 지연되는 첫 화면을 연다 → 주소별 요약·표·차트·코드 블록의 최종 순서 유지 → 모든 화면을 같은 readRow 한 줄로 바꾸면 실패 | apps/wake/pages/network.js:89 pending 네트워크는 readRow를 쓴다 | 네트워크 표와 차트의 자리가 로딩 동안 사라진다 | 고정 없음 → T-PERF-06 | D01027 |
| 인시던트 작업면·근거·보고서 | incident.workspace와 보고 입력을 보류한다 → 작업 단계와 report 문서 블록을 유지하며 미수집·생성 중·실패를 구분 → 보고서 읽기 대기가 빈 본문 또는 단일 busy이면 실패 | apps/wake/pages/incident-report.js:67 loading은 busy statusIcon 하나다 | 문서 블록별 로딩 뼈대를 만들지 않는다 | 고정 없음 → T-PERF-06 | D01027 |
| 도구·에이전트·AI 기록·비용·검색 | 도구 열거·Lease·audit·cost·검색 읽기를 지연·거절한다 → 각 목록·상세의 구조에서 발견·연결·읽기 상태를 따로 표시 → 도구 발견 실패가 목록 성공 0건이 되면 실패 | apps/wake/pages/tools.js:35 unread는 readRow 뒤 반환한다 | 도구 목록의 실제 행 대신 하나의 뼈대 줄만 렌더한다 | 고정 없음 → T-PERF-06 | D01027, D00999 |
| 설정·첫 실행·AI 칸·새 탭 | 공급자 없는 AI와 출처 없는 새 탭을 연다 → settings/단계/대화/검색의 실제 틀에서 없음 원인을 표시 → 미설정 상태가 무기한 loading으로 남으면 실패 | apps/wake/ai-hub.js:19 서비스 부재는 unconfigured로 초기화한다 | 공급자 부재와 서비스 부재의 모든 진입 화면 geometry는 고정되지 않았다 | 고정 없음 → T-PERF-06 | D01027 |

### PERF-027

구역 한 문서 구조

- 목표: 같은 cluster의 여덟 구역을 순회하고 뒤로·앞으로·직접 주소·복원을 수행한다 → 같은 클러스터의 홈·리소스·네트워크·GitOps·이벤트·로그·알림·인시던트는 문서 하나에서 전환한다. 지표 주소도 홈 계열로 처리한다. 뒤로·앞으로·새로고침·주소 직접 열기·복원·탭 제목·경로 막대·AI 화면 제어의 계약을 유지한다. → 구역 이동마다 document/loadURL이 새로 생기거나 검색·스크롤·AI screen 대상이 다른 구역으로 섞이면 실패
- 현재: `apps/wake/routes.js:4`에는 doc 묶음이 없고 `kit/desktop/main.cjs:506`은 loadURL을 호출한다. sections.js·cluster.html·cluster.js·bootSections는 없다.
- 차이: 아래 11조항의 한 문서 구조와 회귀 검사가 없다. T-PERF-04.
- 고정 장치: 고정 없음 → T-PERF-04
- 점검: 아래 설계 조항 전부와 PERF-003·004·015를 검사한다; [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE); 
- 출처: D-USR-2026-11-16-7; D01023

1. 문서 단위 초기화는 설정·테마·언어·브리지·boot·메뉴·다이얼로그·단축키·화면 제어 중계를 한 번만 한다. `bootSections(config, sections)`와 `cluster.html`·`cluster.js`는 계획된 이름이며 현 API가 아니다.
2. 구역 모듈은 현재 bootPage 팩토리를 `create<구역>(ctx)`로 추출하고 기존 직접 진입 파일은 같은 팩토리를 부르는 얇은 진입으로 남긴다. home·metric·incidents는 cluster-home, resources·events는 resource-list, network·gitops·logs·alerts는 각 페이지가 담당한다. 동일 기능의 복사본을 만들지 않는다.
3. 라우트에 계획 속성 `doc: 'cluster'`를 두고 pageResponse가 문서 묶음을 선택한다. 다른 클러스터 또는 다른 문서 종류는 현재처럼 새 문서를 연다.
4. 구역 ctx의 route·params·query·address·state·update는 독립이다. 최초 방문 때 인스턴스를 만들고 문서 수명 동안 필터·검색·펼침·스크롤을 보존한다. 보이는 section 하나만 활성화한다. 같은 프레임에 새 본문을 준비한 뒤 이전 본문을 숨기고 제목·알약·칸 폭은 이동시키지 않는다.
5. 숨은 구역은 다시 그리지 않는다. `onHide`·`onShow`에서 실시간 읽기 정지·재개를 처리한다. 기존 설계의 “훅이 없으면 타이머는 두되 그리지만 않음”은 중간 단계로만 남기고 CPU·자원 기준 충족을 따로 검증한다. 표시 복귀 때 갱신된 값과 stale 상태를 반영한다.
6. 페이지 안 전환은 `history.pushState({address}, '', address)` 뒤 구역을 바꾸고 계획 메시지 `page:navigate { address, inPlace:true }`를 셸에 보낸다. 셸은 tabs.push로 기록만 갱신하고 host.navigate를 다시 부르지 않는다.
7. 사이드바·경로 막대·팔레트·AI에서 시작한 전환은 셸 기록을 갱신한 뒤 main에서 같은 doc·클러스터인지 확인한다. 같으면 계획 메시지 `shell:goto { address, replace }`로 보내며 loadURL을 호출하지 않는다. 다르면 기존 문서 이동을 유지한다.
8. 뒤로·앞으로는 Electron navigationHistory와 popstate로 동일 구역을 복원한다. did-navigate-in-page에서 canBack·canForward를 갱신한다. 새로고침은 현재 주소 구역에서 시작한다. 새 탭·세션 복원·창 옮기기는 주소 계약을 유지한다.
9. 데이터층 하나에서 동일 인자 진행 중 읽기를 공유한다. 짧은 TTL은 설계 예시 5초이며 아직 확정한 값이 아니다. 실제 갱신 주기·freshness 기준으로 정하고 대상 UID·권한·query·기간을 키에 포함한다. 모듈 최상위 refreshIncidents는 셸 전용으로 옮긴다.
10. AI screen get/set은 보이는 구역 하나만 답한다. 숨은 구역·상세·screen 선언 없는 구역은 응답하지 않는다. 적용 가능한 ai 키만 바꾸고 되돌림 칩을 구역별 보존한다. 반환 view 주소는 현재 구역이다. 보고서 조립 중 구역을 오가도 선택·필터를 잃지 않는다.
11. 계획 수정 파일은 `kit/page/boot.js`, 새 `kit/page/sections.js`, `kit/core/bridge-protocol.js`, `kit/desktop/preload-page.cjs`, `kit/shell/shell.js`, `kit/desktop/main.cjs`, `apps/wake/routes.js`, 새 cluster 진입 파일, 구역 페이지 7개, `apps/wake/app.config.js`다. 각 파일의 실제 소유가 해제된 뒤 작업한다.

<a id="PERF-028"></a>

### PERF-028

최소 재그리기와 승인된 동작 보존

- 목표: 한글 조합·코드 펼침·차트 선택 상태에서 같은 자료 재조회와 칸 폭 변경을 수행한다 → 전체 DOM 교체로 입력 조합·초점·스크롤·펼침·차트 엔진을 잃지 않는다. 같은 값 재수신과 폭 변경에서 최초 등장 효과를 다시 재생하지 않는다. 현재 시리즈의 마지막 구간 강조와 과거 스냅샷의 정지는 구분한다. 노드가 생기고 사라질 때 한 프레임에 크기가 바뀐다는 원천 관측과 자체 추가한 부드러운 성장 효과를 구분하며, 성장 속도에 측정하지 않은 원본 수치를 붙이지 않는다(D00555). 사용자가 승인한 상태 움직임·색·샌키 모양을 성능 개선 명목으로 바꾸지 않는다. → composition·focus·scrollTop·펼침·chart engine이 사라지거나 첫 등장 모션이 다시 재생되면 실패.
- 추가 조건: 같은 상세값을 반복 수신하면서 코드 선택·펼침·스크롤 유지 → 본문/차트 엔진/초점을 보존하며 최초 등장 효과 재생 없음 → 동일 입력의 빈 프레임·본문 재등장·선택/엔진 소실이면 실패.
- 현재: `kit/page/boot.js:97`·`kit/core/morph.js`는 부분 갱신·LIVE_CLASSES를 쓰고 `kit/components/chart-card.js:748`은 엔진 mount를 별도 자식으로 유지한다. Node 상세·샌키·반복 스크롤의 현재 native 판정은 없다.
- 차이: Node 상세 깜빡임·샌키 첫 진입·반복 스크롤의 현재 native 검증이 없다. T-PERF-09, T-PERF-12, T-PERF-15.
- 고정 장치: 고정 없음 → T-PERF-09
- 점검: 한글 조합 중 갱신, 코드 접기·줄 펼침 후 갱신, 토스트 자동 닫힘, 사이드바·상세·AI 폭 변화, 데이터 동일 재조회, 페이지 링크 진입 뒤 사용자 스크롤을 검사한다. 입력 조합·선택·스크롤·펼침 유지, 자동 스크롤은 최초 진입 1회, 폭 변경 시 그래프 등장 재생 0회. 현재·과거 강조를 따로 대조한다. 샌키 페이지 첫 열기의 CPU·LoAF·부하를 측정한다.
- 출처: D00264, D00269, D00451, D00555, D00701, D00702, D00872, D00882, D00910; D00933

### PERF-029

대량 로그의 요청·렌더 한도

- 목표: 같은 Pod UID의 최근 1시간 원본 5만 로그 행을 열고 이전 100줄·follow를 조작한다 → 기본 최근 1시간 마지막 100줄을 시간순으로 표시하고 최신 줄 위치에서 연다. `이전 100줄`로 넓히며 보이는 줄 주변만 렌더한다. 뷰당 1000줄 또는 2MiB 중 먼저 도달한 한도를 적용하고 제거된 구간은 재조회할 수 있어야 한다. 저장 5만 건을 첫 화면에서 모두 요청하지 않는다. 전체 건수를 모르면 `100줄 표시`처럼 실제 표시 수만 말한다. → 첫 요청이 100줄을 넘거나 뷰가 1000줄/2MiB를 넘거나 과거를 읽는 중 scrollTop이 이동하면 실패
- 현재: `apps/wake/pages/logs.js:15,42,71`은 기본 1시간·Kubernetes tail 1000·Loki 100·뷰 1000줄·follow false다. `desktop/pod-logs.cjs:5,56`은 요청 2MiB·tail 100/500/1000, log-card.js:33은 페이지 slice이며 viewport 가상화가 아니다.
- 차이: 1시간/100줄 기본·뷰 전체 2MiB·viewport 가상화·과거 재조회·새 줄 배지가 남는다. T-PERF-16. 로그·이벤트 화면 정본과 concurrency 정본에도 같은 미충족을 연결한다.
- 고정 장치: 고정 없음 → T-PERF-16
- 점검: 5만 건 조건에서 최초 요청 limit 100, 최초 1시간, UI 원본 줄 번호·시각·내용 동일, 보관 메모리 한도 ≤1000줄 및 ≤2MiB를 확인한다. 프리셋은 [RULE-RANGE](rules.md#RULE-RANGE)로 대조하고 한 요청 최대 24시간과 더 긴 선택 구간의 창 분할을 검사한다. follow는 사용자가 켠 경우만 동작하며 과거로 스크롤하면 새 줄을 배지로 모으고 위치를 유지한다. 성공 빈 결과·보존 범위 밖·권한 없음·연결 실패를 구별한다. 지연 응답·새 Event 도착에도 읽던 행과 scrollTop을 보존한다.
- 출처: D00064, D00091, D00095, D00099, D00114, D00452

### PERF-030

저장 최적화의 측정과 보존

- 목표: 같은 사용자 자료 사본을 후보 저장 형식으로 이전하고 손상·쓰기 실패·되돌리기를 수행한다 → 저장 형식은 압축률만으로 고르지 않는다. 읽기·쓰기 CPU, 손상 복구, 원자성, 검색 비용, 사람의 확인 가능성, 이전·되돌리기까지 비교한다. 공통 계약 v1과 IPC·MCP·HTTP 출력은 유지한다. → 크기만 줄고 조회 값·권한·순서·마지막 확정 기록이 달라지거나 역방향 복구가 불가능하면 실패
- 현재: `apps/wake/desktop/hub-store.cjs:32,48`은 동기 I/O·전체 parse/rewrite·손상 행 제외를 수행하고 `desktop/hub.cjs:80`은 주기 감지·prune를 한다. 형식 비교·성장률·압축·이전 측정은 없다.
- 차이: 압축 비교·손상 보존·이전·복원 증거가 없다. T-PERF-13, T-PERF-14. 구체 데이터·동시성·보안 계약은 backend·concurrency·security 영역에서 소유하며 이 파일은 성능 수용 조건을 유지한다.
- 고정 장치: 고정 없음 → T-PERF-13
- 점검: 아래 각 항목의 전후 근거와 기능 대조표가 있어야 한다. 선택 후 같은 스크립트로 PERF-005~008을 재측정한다. 효과가 없거나 위험만 늘어난 변경은 채택하지 않는다. 개인정보·비밀 값은 profile·CSV·heap 증거에도 남기지 않는다.
- 출처: D-USR-2026-11-16-7; D00465, D00472, D01024

| 검사 항목 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| 기준선 | → [RULE-RETENTION](rules.md#RULE-RETENTION). | apps/wake/desktop/hub-store.cjs:55 appendFileSync로 한 행씩 쓴다 | 일 증가율·90일 추정 크기의 계측기가 없다 | 고정 없음 → T-PERF-14 | D00465 |
| 내용 중복 | 같은 근거 snapshot을 여러 incident에서 참조한다 → 반복 키·큰 문자열·동일 근거 스냅샷, 내용 주소 해시 참조. 같은 근거의 번호·해시·불변성 유지 → 번호·hash·본문이 바뀌거나 다른 근거를 같은 내용으로 합치면 실패 | apps/wake/desktop/incident-hub.cjs:108 hashOf가 JSON 해시를 만든다 | 파일 간 동일 문자열의 저장 중복을 제거하지 않는다 | 고정 없음 → T-PERF-14 | D00465 |
| 시계열 | 동일 timestamp/value 시리즈를 차분 형식으로 왕복 변환한다 → 시각 차분·값 차분·정밀도 고정의 크기와 CPU. 원본 정확도 허용 기준을 바꾸려면 별도 계약 결정 필요 → 복원값이 허용 정확도 밖이거나 누락 구간을 채우면 실패 | apps/wake/desktop/hub-store.cjs:55 JSON.stringify로 행을 저장한다 | 시각·값 차분 인코더가 없다 | 고정 없음 → T-PERF-14 | D00451 |
| 오래된 블록 | 동일 오래된 원자료 블록을 gzip·brotli·zstd 후보로 압축·해제한다 → Node 내장 gzip·brotli와 zstd 후보의 압축률·CPU·복구·열람 비교. 외부 의존 증가 없이 가능한 구현만 비교하고 런타임 지원을 확인 → 읽기 불가·필드 유실·지원하지 않는 runtime 의존이 생기면 실패 | apps/wake/desktop/hub-store.cjs:48 UTF-8 JSONL을 전부 읽는다 | 압축 codec 선택·읽기·손상 복구 비교가 없다 | 고정 없음 → T-PERF-14 | D00465, D-USR-2026-11-16-7 |
| 기간 조각 | → [RULE-RETENTION](rules.md#RULE-RETENTION);  | apps/wake/desktop/hub-store.cjs:87 prune은 모든 파일을 순회한다 | 컬렉션별 TTL과 활성 참조 보호가 없는 단일 cutoff다 | 고정 없음 → T-PERF-14 | D-USR-2026-11-16-4 |
| 쓰기 | 두 expectedVersion 쓰기와 종료 중 저장·fsync 실패를 입력한다 → batch 크기·대기 시간, 원자적 교체, fsync 정책. 강제 종료 뒤 마지막 확정 기록 보존, expectedVersion 충돌·쓰기 순서 → 확정 기록이 사라지거나 충돌 두 쓰기를 모두 성공시키면 실패 | apps/wake/desktop/hub-store.cjs:73 put은 전체 문서를 읽고 덮는다 | 쓰기 batch·버전 충돌 검사가 없다 | 고정 없음 → T-PERF-14 | D-USR-2026-11-16-7 |
| 조회 | 같은 기간·cluster·UID 조건으로 저장 전후 검색한다 → 시간·클러스터·대상 인덱스, 인시던트·감사·대화의 전체 스캔 제거. 검색 결과·순서·권한 필터 유지 → 결과 순서·권한 필터·행 집합이 하나라도 달라지면 실패 | apps/wake/desktop/hub-store.cjs:58 list는 전체 read 뒤 filter한다 | 시간·cluster·대상 인덱스가 없다 | 고정 없음 → T-PERF-14 | D00465 |
| 메모리·IPC | 큰 배열과 managedFields 포함 자료를 IPC로 전달한다 → 스트리밍·페이지 읽기, managedFields 등 불필요 필드 제거, 큰 배열 차분 전송. 구조 복제 시간과 byte 수 → 필수 자료 손실 없이 byte·clone 시간의 전후를 재현하지 못하면 실패 | kit/desktop/main.cjs:756 service 결과 Promise를 공유한다 | 큰 배열 차분 전송·구조복제 byte 계측이 없다 | 고정 없음 → T-PERF-14 | D01024 |
| 이전·복구 | 사용자 자료 사본을 이전하고 디스크 부족·손상·역방향 복구를 수행한다 → 기존 사용자 자료 사본에 migration·역방향 복구, 손상 파일 보존, 디스크 가득 참, 종료 중 쓰기. 파일 0600·폴더 0700·마스킹·토큰 미저장 → 0600/0700·마스킹·확정 기록이 깨지거나 손상 원본이 사라지면 실패 | apps/wake/desktop/hub-store.cjs:68 SyntaxError를 빈 객체로 바꾼다 | 손상 보존과 저장 형식 migration 경로가 없다 | 고정 없음 → T-PERF-14 | D00466, D-USR-2026-11-16-7 |
| 실패 주입 | Prometheus 중단·API 지연·권한 회수·터널 끊김·강제 종료를 입력한다 → Prometheus STOP/CONT, Kubernetes API 지연, 권한 회수, 포트포워딩 끊김, 격리 저장 파일 손상·디스크 부족, 강제 종료 후 재시작 → 실패가 정상 0이나 자료 삭제로 보이거나 복구 때 대상이 섞이면 실패 | apps/wake/desktop/reads/index.cjs:49 요청에 20초 timeout을 준다 | 여러 출처 중단과 저장 장애를 결합한 자동 시나리오가 없다 | 고정 없음 → T-PERF-14 | D00114 |
| 동시성 | 네 화면·수집·감지·MCP/HTTP를 겹치고 해제/연결을 100회 반복한다 → 4화면 다시 읽기, 감지/수집/수동 작업 겹침, MCP·HTTP 동시 호출, 해제·재연결 100회. backpressure·취소·재시도 상한·중복·늦은 응답 보존 → 상한 초과·취소 자원 잔류·중복 기록·늦은 응답 적용이 남으면 실패 | apps/wake/desktop/incident-hub.cjs:46 force가 진행 공유를 우회한다 | 수집과 수동 실행의 공통 잠금이 없다 | 고정 없음 → T-PERF-14 | D01025 |
| 완료 | 같은 조건의 baseline과 최종 측정을 독립 검토에 제출한다 → 동일 조건 baseline과 최종 측정, 결함별 고침·승인 보류·결함 아님 근거, 이전·되돌리기 시험, 원본 동시 대조, 품질 점검 악화 없음, 독립 이중 PASS → 원자료·되돌리기 결과가 없거나 품질 악화를 숨기고 완료 처리하면 실패 | kit/tools/check-tests.mjs:35는 시험 종료코드만 집계한다 | 성능 원자료와 독립 판정을 결합한 완료 게이트가 없다 | 고정 없음 → T-PERF-14 | D00114, D-USR-2026-11-16-7 |

<a id="PERF-031"></a>

### PERF-031

세로 스크롤과 전환 뒤 위치

- 목표: scrollHeight가 clientHeight보다 큰 화면에서 표·코드·그래프 위로 세로 휠을 보낸다 → 내용이 viewport를 넘으면 그 내용을 소유한 본문에서 끝까지 스크롤할 수 있어야 한다. 상단바·표 머리·코드 머리가 겹치거나 배경이 비치지 않아야 한다. 가로 전용 표·코드·그래프 위의 세로 휠이 본문으로 전달되어야 한다. 링크 진입 위치 맞춤은 처음 한 번만 한다. → 마지막 실제 행에 도달하지 못하거나 링크 진입 후 사용자 스크롤을 다시 강제로 되돌리면 실패.
- 추가 조건: 입력 YAML·목록·홈·도구 화면을 열고 상단 및 끝으로 스크롤 → 기대 페이지 제목·도구막대가 상단바와 겹치지 않으며 본문 마지막 항목에 접근 → 실패 상단바가 제목·행동을 덮거나 끝 항목 접근 불가
- 현재: `kit/tools/check-layout.mjs:100`은 40px 이동 가능 여부를 검사하고 :106~114는 마지막 항목을 소유한 본문에 실제 wheel을 보낸 뒤 읽기 전용으로 끝 도달을 판정한다. :115는 강제 이동 helper로 clip을 별도 검사한다. 끝 도달의 native 전수 근거는 없다.
- 차이: wheel 끝 도달 장치는 있으나 반복 자동 스크롤·외부 도구·긴 실제 로그와 YAML의 native 경계는 미검증이다. T-PERF-12.
- 고정 장치: `kit/tools/check-surfaces.test.mjs`의 `scroll_end_reaches_last_control_and_rejects_a_clipped_container`·`scroll_wheel_targets_the_last_controls_owner_in_a_two_column_page`; `kit/tools/check-layout.mjs:106`. native 잔여 → T-PERF-12
- 점검: 각 라우트의 첫 화면과 마지막 실제 행/블록을 다크·라이트 ×1280·1440(1680 추가 기본값 채택)에서 캡처한다. scrollHeight>clientHeight일 때 실제 scrollTop 변경과 마지막 행 도달을 확인한다. 도구 실화면의 Wake 상단바·scroll 경계도 별도 검사한다. `check-layout`의 +40px 움직임만으로 끝까지 도달했다고 판정하지 않는다.
- 출처: D00068, D00113, D00167, D00188, D00189, D00211, D00349, D00455, D00457, D00910, D01030; D00053; D00054

### PERF-032

남는 호버와 접기 버튼

- 목표: 설정 행 위의 포인터를 창 밖으로 옮기고 창 blur 후 카드 머리·접기 버튼에 복귀한다 → 창 밖으로 포인터가 나가거나 창이 비활성화되면 이전 행의 호버 표시가 남지 않는다. 설정에서 두 행이 동시에 선택된 것처럼 보이면 실패다. 접기 버튼의 둥근 바탕은 버튼 자체 호버·키보드 초점에서만 보이고 카드 머리 호버는 꺾쇠 색만 바꾼다. 최적화 중 새로운 hover 디자인을 만들지 않는다. → 이전 행 hover가 남거나 선택이 둘로 보이거나 버튼 밖에서 둥근 버튼 바탕이 나타나면 실패
- 현재: `kit/desktop/main.cjs:831,910`에 blur·repaint 경로는 있으나 모든 native view hover 해제와 summary-bar·content-card 버튼 바탕은 실화면 미검증이다.
- 차이: 창 이탈 잔상·단일 선택·버튼 바탕의 실화면 검증이 없다. T-PERF-12. 디자인 영역과 같은 규칙으로 처리한다.
- 고정 장치: 고정 없음 → T-PERF-12
- 점검: 설정 행→창 밖→복귀, 카드 머리→접기 버튼→키보드 focus→blur, 메뉴 열린 채 창 비활성화를 다크·라이트에서 녹화한다. 실제 선택 행 1개 유지, hover 잔상 0, 포인터 없는 버튼 바탕 0을 확인한다.
- 출처: D-USR-2026-11-16-7; D01040, D01041

### PERF-033

상태·계약을 희생하지 않는 최적화

- 목표: 모델 미설정 질문과 old UID의 지연 응답을 포함하여 다섯 화면을 30분 순환한다 → CON-023·024·027의 상태·시각·원본 대조 계약을 지킨다. AI 입력·대화·근거·감사의 보존을 깨뜨려 빠른 응답을 만들지 않는다. 캐시는 대상 교체·권한·세대·취소를 구별한다. → 질문·감사·근거가 사라지거나 old 값이 new UID의 ready로 표시되거나 앱이 응답하지 않으면 실패
- 현재: `apps/wake/desktop/reads/source-checks.cjs:63`에 UID 세대 방어가 있고 `apps/wake/desktop/ai-run.cjs:135`에는 모델 미설정 질문 미저장이 남는다. 현재 종합 성능·정합성 판정은 없다.
- 차이: 대화 유실·출처 세대·장시간 사용성의 현재 독립 판정이 없다. T-PERF-13, T-PERF-15. U-01·B1 고유 수정은 해당 영역 작업에 연결한다.
- 고정 장치: 고정 없음 → T-PERF-13
- 점검: 같은 시각 원본 대조, 이전 UID 응답이 새 대상 ready에 붙지 않음, 실패 뒤 이전 값에 stale 표시, 부분 실패 시 성공 데이터 유지, 취소 후 갱신 없음, scope 다른 요청 병합 없음. U-51의 30분 5화면 순환 10회, 키보드/클릭 2초 이내, timeout 20초 안의 정직한 실패, 앱 무응답 0도 별도 장시간 사용성 조건으로 검사한다; [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE).
- 출처: D-USR-2026-11-16-7; D00458, D00702, D00743, D01024, D01050

### PERF-034

성능 작업의 완료와 중간 머지

- 목표: 성능 변경의 현재 코드 해시·측정 원자료·화면 캡처·회귀 결과를 제출한다 → 성능 변경은 승인된 수치와 현재 화면 근거를 모두 제출한 뒤 독립 검증을 받는다. 일부 단위 시험이나 과거 캡처만으로 완료 처리하지 않는다. 새 성능·화면 변경은 같은 변경에서 고정 장치를 갱신하며 고정 없음 항목의 화면 변경은 먼저 장치를 만든다. → 과거 캡처나 일부 unit PASS만으로 전 화면 성능 완료를 표시하면 실패
- 현재: `kit/tools/check-tests.mjs:35`는 node --test를 실행하지만 현재 전 화면 성능·빈 프레임·장시간 자원 합격을 결합한 결과는 없다. P1 독립 검증 보고도 1차에서 확인되지 않았다.
- 차이: 개별 코드와 과거 보고만으로 전체 성능 완료를 판정할 수 없다. T-PERF-15. 성능 구현·측정의 범위는 tasks.md H-000에서 관리한다.
- 고정 장치: 고정 없음 → T-PERF-15
- 점검: PERF-001~004와 P1 D1~D14의 처리표, 실제 전후 자료, 수정 파일 소유, 현재 해시 고정본, 필수 자동 확인, 다크·라이트 화면 검수, major 0의 독립 이중 판정이 있어야 P1 PASS다. minor는 작업으로 남기고 사용자 검수 전 결함 0 회차에서 처리한다. 미구현·측정 전 항목은 승인된 보류가 없는 한 완료로 바꾸지 않는다. 백엔드 1/5·CPU·IPC는 별도 최적화 완료 조건이며 P1만으로 충족하지 않는다.
- 출처: D-USR-2026-11-16-7; D00458, D00670, D00702, D00988, D01050

## 충돌과 이력 처리

| 이전 규칙·보고 | 적용하는 결정과 현재 차이 |
|---|---|
| 카드 값마다 열기·닫기, 히스테리시스 대안 | D01021의 최초 한 번+머리 강조가 우선이다. 히스테리시스를 홈 자동 펼침에 되살리지 않는다. 흐름 그래프 비율 전환의 80% 경계(D00856)는 다른 대상이다 |
| 최초 데이터 도착 때 자동 펼침 | 현재 홈은 첫 그림 기준이며 100ms 뒤 자료는 닫힌 채 강조한다. batch2의 공개 제한을 보존한다. 뒤늦게 열려 이동을 만드는 방식은 C안·0.01과 다시 조정해야 한다 |
| 0폭→260ms 폭 증가, 닫기 축소 | D01022가 대체한다. 현재 ready 이후 즉시 배치는 입력 순간 배치와 다르며 전체 충족으로 판정하지 않는다 |
| 과거 전환·시작 예산 | → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE). 내부 처리 예산은 별도 구현 목표이며 사용자 목표를 완화하지 않음 |
| targets의 창 노출 ≤FCP 표기 | 빈 창 0의 의미와 모순되는 부등호다. 올바른 수용식은 노출 시각 ≥필수 그림 시각이다. 원본 숫자는 고치지 않고 해석 오류를 이곳에 남긴다 |
| 모든 출처 정의 수만큼 칩 자리 표시 제안 | 연결 근거 있는 칩만 보이는 최신 출처 규칙을 따른다. 공간 예약을 위해 미연결 칩을 생성하지 않는다 |
| 과거 “불러오는 중” 단독 한 줄 | D01027과 08 검수 19절에 따라 실제 배치 뼈대로 교체한다. 실패·권한 없음 상태 줄은 삭제하지 않는다 |
| 전체 innerHTML 교체 | morph 도입으로 대체됐다. 토스트 전체 redraw 제거(`:319`), 폭 변경 시 그래프 재생 제거(`:503`), 무한 redraw 수정(`:764`)을 새 구조에서 회귀시키지 않는다 |
| 옛 측정·검증 스크립트 삭제 이력 | 옛 시안·검증 부산물 삭제는 현재 P1 재현 스크립트 삭제 허가가 아니다. 일회성 삭제 제한은 tasks.md H-000 참조 |
| B1 시험 통과 수·홈 과거 수치 | B1 7차의 82·148개 시험은 대역/렌더 범위이며 현재 P1 native 성능 검증으로 합산하지 않는다. 현재 작업 트리와 해당 고정본의 차이를 분리한다 |
| 부하 20 이하 실행 허용 | 성능 기준선은 10 이하가 더 엄격한 조건이다. 10~20에서 실행 가능했다고 시간 기준선으로 채택하지 않는다 |
| backend prompt의 측정 뒤 확정할 목표 | → [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE). 채택과 실제 달성을 구별 |

## 남은 작업 대응표

중간 머지 체크포인트까지 우선하는 항목은 T-PERF-01~12와 T-PERF-15의 P1 범위다. backend 측정·저장 최적화는 T-PERF-13~14, 로그 한도 불일치는 T-PERF-16으로 분리한다. 우선순위는 다른 작업의 파일 소유를 무시하는 실행 허가가 아니다.

| 작업 ID | 요구 ID | 고칠 파일·범위 | 자동 확인 명령 또는 아직 만들 검사 | 화면 확인 | 선행 |
|---|---|---|---|---|---|
| T-PERF-01 | PERF-001~004,009~011,014,018 | 성능 실행기·계측·정체 검사. 저장소 내 영구 위치는 quality 소유자와 확정 | 과거 저장소 밖 성능 실행기(outDir·userData·CDP 포트·inspect 포트·시나리오 인자)의 계약을 유지하며 PID·userData·부하·exit 강제. 현재 명령은 보완 전 직접 실행하지 않는다 | 실제 Electron 전체 전후 | 파일·포트 소유, 명시적 구현 재개 |
| T-PERF-02 | PERF-002,012,013 | `kit/desktop/main.cjs`, `main-url.test.cjs` | `node --test kit/desktop/main-url.test.cjs`; 타임아웃·Linux·오류 문서 첫 그림 시험 추가 | 시작·새 창·탭·도구 | T-PERF-01 |
| T-PERF-03 | PERF-002,003,016 | `kit/shell/shell.js`, `kit/components/app-frame.js`, `kit/page/boot.js`, desktop host | `node --test kit/page/boot.test.mjs kit/shell/hosts/desktop-host.test.mjs kit/shell/tabs.test.mjs`; 입력부터 첫 배치·paint 측정 추가 | 상세·AI·확대·닫기 | T-PERF-01, 셸 소유 해제 |
| T-PERF-04 | PERF-003,004,015,023,027 | PERF-027의 파일 목록 | 기존 boot·tabs·screen 시험, `node kit/tools/check.mjs --app wake`; 새 sections·popstate·숨은 구역·cache 시험 | 8구역·복원·AI 제어 | T-PERF-01, 라우트·셸·홈 소유 해제 |
| T-PERF-05 | PERF-001,017 | `apps/wake/pages/cluster-home.js`, `resource-detail.js`, `sim-views.js` | `node --test apps/wake/pages/cluster-home.test.mjs apps/wake/pages/resource-pages.test.mjs`; 상세 최초 판단 추가 | 임계값 왕복·재방문 | T-PERF-01, 홈·상세 소유 해제 |
| T-PERF-06 | PERF-001,002,026 | `view-parts.js`, 화면별 페이지, 필요한 기존 kit 부품 | 홈·resource-pages·signal-pages 시험, 뼈대/완성 geometry 검사 추가 | 전 화면 7상태 | T-PERF-01, 부품별 단일 소유 |
| T-PERF-07 | PERF-006,020 | `kit/components/data-table.js`, 표 관련 시험 | `node --test kit/components/data-table-extras.test.mjs kit/tools/check-surfaces.test.mjs`; 동기 묶음 fit·해제 고정, 실제 강제 layout 비용 측정 잔여 | 좁은 칸·긴 이름·Restarts | 표 소유 해제 |
| T-PERF-08 | PERF-006,021 | `kit/components/tooltip.js` | 변경 범위·rAF·detached 후보 시험 추가. `node kit/tools/check-states.mjs --app wake` | hover·키보드 전문 | 툴팁 소유 해제 |
| T-PERF-09 | PERF-006,022,024,028 | `kit/core/clock.js`, `chart-card.js`, `temporal-chart.js` | `node --test kit/core/clock.test.mjs kit/components/chart-card.test.mjs kit/components/chart-card-static.test.mjs kit/components/chart-card-axis.test.mjs`; 생성 횟수·preload·LoAF 검사 | 현재·과거·없음·한 점·끊김 | 차트·시각 부품 소유 해제 |
| T-PERF-10 | PERF-004,005,019,023 | `kit/desktop/main.cjs`, `kit/shell/shell.js`, `apps/wake/app.config.js`, `desktop.config.cjs` | services·main-url 시험, 동시 원본 수·settings 쓰기·broadcast 검사 추가 | 전환·설정·종료 복원 | T-PERF-01 |
| T-PERF-11 | PERF-025 | `kit/desktop/main.cjs`, `menu.cjs` | `node --test kit/desktop/main-toast-menu.test.cjs kit/desktop/main-toast-focus.test.cjs`; build·capture 횟수 추가 | 탭 미리보기·메뉴 | T-PERF-01 |
| T-PERF-12 | PERF-011,028,031,032 | `kit/tools/check-layout.mjs`, 셸·페이지·스크롤·hover 경계 | `node kit/tools/check-layout.mjs --app wake`; 마지막 행 도달·창 이탈·한 번만 위치 맞춤 검사 추가 | 전 화면 끝 스크롤·외부 도구 | T-PERF-01 |
| T-PERF-13 | PERF-005~007,030,033 | `apps/wake/desktop/reads/`, `hub.cjs`, k8s·tools·portforward·observability·services, kit desktop | `node --test apps/wake/desktop/hub.test.cjs apps/wake/desktop/portforward.test.cjs apps/wake/desktop/services.test.cjs`; baseline·p95·loop-delay·자원 100회 검사 추가 | 실제 lab 동시 4화면 | baseline, concurrency·security 계약 |
| T-PERF-14 | PERF-008,030 | `apps/wake/desktop/hub-store.cjs`, 저장소 호출자·이전 코드 | 압축 비교·TTL·손상·강제종료·migration·rollback·90일 크기 검사 추가 | 보관 이력·감사·대화 원본 대조 | T-PERF-13 기준선, backend 저장 계약 |
| T-PERF-15 | PERF-011,028,033,034 | 검증 묶음과 성능 상태. 제품 코드 추가 수정은 발견 항목 소유자가 담당 | 해당 계약 시험과 저장소 필수 check-*; 현재 없는 종합 성능 판정기 추가 | 다크·라이트 ×1280·1440(1680 추가 기본값 채택), 끝 스크롤, 두 독립 검수 | P1 구현·U-01/B1 관련 major 처리 |
| T-PERF-16 | PERF-029 | `logs.js`, `log-card.js`, `resource-detail.js`, `pod-logs.cjs`, `log-view.js` | `node --test apps/wake/desktop/pod-logs.test.cjs kit/components/log-view.test.mjs apps/wake/pages/resource-pages.test.mjs`; 기본·한도·메모리·과거 스크롤 검사 추가 | 100줄·이전·follow·실패 | 로그·데이터 계약 소유 조정 |

위 명령은 각 작업을 실제로 고칠 때 쓰는 확인 명령이다. `node kit/tools/check-tests.mjs` 전체 및 states·glass 등 무거운 검사는 heavy.lock과 부하 조건을 만족할 때만 실행한다. 소스 확인만으로 위 시험의 통과를 보고하지 않는다.
