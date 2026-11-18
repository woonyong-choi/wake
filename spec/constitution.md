# Wake 불변 원칙

예: 대상 UID가 바뀐 뒤 도착한 옛 응답은 새 대상의 정상 값으로 쓰지 않는다. 목표와 현재의 차이를 작업 ID로 추적한다.

이 문서의 현재는 2026-11-17 작업 트리의 정적 확인이다. 시험·화면·클러스터 실행 통과를 뜻하지 않는다. 원천 약어·제안의 효력·공통 읽기 계약은 [원칙](constitution.md)의 C-SOURCE, C-005, C-006을 따른다. 채택한 목표는 decisions.md를 따른다.

<a id="C-SOURCE"></a>

## C-SOURCE 원천과 해석

- 목표: 동일 규칙에 직접 요구·질문·과거 PASS 보고와 후속 취소가 함께 있는 원천 행을 읽는다 → decisions ID의 원문·성격·후속 변경을 함께 읽는다. 직접 요구는 목표 근거, 질문은 확인할 반례, 붙여넣은 보고는 과거 관측이다. 구현·옛 PASS로 목표를 낮추지 않는다. 확정된 사용자 결정이 기본값 채택보다 우선한다. 문서 편집과 제품 실행의 허용 범위는 작업마다 H-000에 기록한다. → 질문이나 과거 PASS를 현재 승인으로 쓰거나 취소가 다른 대상의 규칙까지 지우면 실패.
- 현재: `kit/tools/check-tests.mjs:16`은 kit/apps 시험을 수집하며 spec 결정 ID의 승인·질문 분류를 읽지 않는다.
- 차이: 결정 원장의 직접 요구·질문·보고 분류를 검사하는 자동 경로가 없다. G-T-12.
- 고정 장치: 고정 없음 → G-T-12
- 출처: D01047, D01049, D01050, D01051, D01052; 정본 유지 요구.

코드의 pages/·data/·desktop/는 apps/wake/ 기준이고 reads/는 apps/wake/desktop/reads/ 기준이다. 단독 파일명은 해당 규칙의 모듈 경로를 뜻한다. `D00000` 형식 ID는 소유자 결정 기록의 번호이고, B7/U3/T4/C4 같은 표기는 과거 독립 검토 회차다. 둘 다 저장소 밖 기록이며 현재 목표는 이 저장소의 규칙에서 읽는다. G-T-*·T-SRE-*는 후속 작업 식별자이며 tasks.md에 등록됐다는 뜻은 아니다.

공통 정보 계약의 정본은 Q-003(원본 대조), Q-004(7상태), SRE-I-02(시각), SRE-I-04(대상), SRE-I-05(근거), SRE-I-06(단위), SRE-T-COMMON(표 표현)이다. 항목은 이 ID를 상속하고 예외만 적는다.

## 제품과 작업 원칙

### C-001 당번 SRE의 판단 흐름

- 목표: CrashLoopBackOff Pod의 Warning Event에서 인시던트를 연다 → 감지 → 근거로 원인 이해 → 조치 승인 → 복구 확인을 하나의 조사 흐름으로 제공한다. SRE 필요 정보와 사용성, 디자인 일관성, 견본·하드코딩 제거 순으로 판단하고 다른 도구의 기능 수로 완료를 정하지 않는다. 각 시나리오의 대상 UID·근거·승인자·결과·원래 증상 회복을 Q-020~Q-024로 대조한다. 신호 해제만으로 원인 해결을 표시한 경우 실패다. → incident.target.uid와 다른 Pod를 조사하거나 승인 기록 없이 조치 완료, Event 해제만으로 원인 해결을 표시하면 실패.
- 현재: `apps/wake/desktop/incident-hub.cjs:304`의 workspace는 target UID를 반환하고 `apps/wake/desktop/approvals.cjs:43`의 decide는 승인 기록만 저장한다.
- 차이: 승인 기록에서 실제 PR 생성·변경 실행으로 이어지는 실행기가 없다. G-T-01.
- 고정 장치: 고정 없음 → G-T-01
- 출처: D00463, D00464, D00465, D00466, D00467, D00468, D00469, D00470, D00471, D00472, D00473, D00474, D00475, D00476, D00905. 근거: D00463~D00476, D00905

<a id="C-002"></a>

### C-002 AI 읽기와 사람 승인

- 목표: → [RULE-AI](rules.md#RULE-AI); [RULE-APPROVAL](rules.md#RULE-APPROVAL).
- 현재: `apps/wake/desktop/approvals.cjs:46`은 이미 결정된 요청에 replayed를 반환하며 :49는 PR 경로를 pending/github-unconnected로 기록한다.
- 차이: 같은 프로세스의 첫 결정은 보존하지만 실제 실행기와 저장 실패 뒤 실행 0회 계약은 연결되지 않았다. G-T-02.
- 고정 장치: `apps/wake/desktop/hub.test.cjs` — `approvals keep the first decision, never run anything, and record a Draft PR that cannot be made without GitHub` (승인 기록 범위)
- 출처: D00466, D00473, D00869. 근거: R-037~R-038; D00869.

### C-003 Secret 요청 자체 금지

- 목표: → [RULE-SECRET](rules.md#RULE-SECRET).
- 현재: `apps/wake/desktop/hub-tools.cjs:71`은 Secret을 받은 뒤 data의 키 이름을 남기고 각 값을 빈 문자열로 바꾸며 `apps/wake/desktop/k8s.cjs:253`의 readToolSecret은 Secret 조회 경로를 가진다.
- 차이: 본문을 받은 뒤 지우는 Secret 경로가 남아 요청 자체 0회 조건에 어긋난다. G-T-03.
- 고정 장치: 고정 없음 → G-T-03
- 출처: D00979, D00980, D00981, D00982, D01051. 근거: R-037, R-057의 D-01 정정; D00979~D00982는 과거 메타 전용 보고다.

<a id="C-004"></a>

### C-004 제품 안 견본 금지

- 목표: 서비스 호스트 없는 브라우저에서 클러스터 홈을 열고 실제 Kubernetes 연결 뒤 같은 화면을 연다 → apps/wake의 제품 실행은 실제 출처 값 또는 정직한 실패·연결 상태만 그린다. source가 없는 수치를 0·정상·견본 응답으로 채우지 않는다. 루트 sim은 제품 밖 디자인 비교본이고 순수 함수 시험 fixture는 시험 입력이다. 이 둘의 통과를 실제 앱·클러스터 통과로 부르지 않는다. 제품 import 도달 경로에서 sample/fixture fallback 0. 실제 kind wake-lab 연결 및 wake-agent 설치·등록·heartbeat·수집을 각각 확인한다. 브라우저 서비스 호스트 없음은 연결 안 됨으로 표시한다. → 미연결 홈에 Pod 0·정상 상태·견본 개수가 표시되거나 sim 통과를 실제 연결 성공으로 기록하면 실패.
- 현재: `apps/wake/data/live.js:13`의 GROUP_OF는 실제 연결 응답을 ok/check/perm으로 분류하며 브라우저 기본 연결은 `apps/wake/data/live.test.mjs:25`에 빈 context로 고정되어 있다.
- 차이: 브라우저 기본값 시험은 있지만 릴리스 전 import 도달성 전체에서 견본 fallback을 금지하는 전용 검사는 없다. G-T-04.
- 고정 장치: `apps/wake/data/live.test.mjs` — `default_browser_connection_discovery_has_no_mock_contexts_or_probe_success` (브라우저 기본값)
- 출처: D00973, D00974, D00975. 근거: D00973~D00975

### C-005 정직한 상태와 동일 대상

- 목표: → [RULE-STATE](rules.md#RULE-STATE).
- 현재: `apps/wake/desktop/reads/source-checks.cjs:65`는 uidAtStart와 identity를 고정하고 :81은 대상이 바뀐 성공 응답을 superseded로 보낸다.
- 차이: 조회 도중 UID 변경은 방어하지만 모든 소비 화면이 unknown·이전 출처 정보를 함께 표시하는지는 source-checks 시험만으로 고정하지 못한다. G-T-05.
- 고정 장치: 고정 없음 → G-T-05
- 출처: D00458, D00987. 근거: R-029~R-032,R-071; D00458,D00987.

### C-006 근거 수준과 이중 검토

- 목표: 동일 소스에 대해 단위 시험 PASS와 실제 Electron 미검증 보고를 함께 받는다 → 구현자 보고·계약 시험·브라우저 렌더·Electron/native·실제 출처·CI·머지·운영은 구분한다. 독립 검토자 둘이 같은 고정본과 기준으로 서로 결론을 보지 않고 검토한다. 단위 PASS는 사용자 영향 major 0이며 minor를 삭제하거나 숨기지 않는다. 환경 때문에 못 본 것은 미검증이다. Q-001,Q-007,Q-030을 만족한다. 판정 두 개의 source hash·범위가 같고 major 미해결 0, minor 전부 담당·후속 ID가 있어야 한다. → fixture PASS가 Electron·실제 클러스터 PASS로 승격되거나 서로 다른 소스 해시의 독립 판정을 합치면 실패.
- 현재: `kit/tools/check-tests.mjs:35`은 Node 시험을 실행하고 TAP 실패 수로 종료하며 실제 Electron·클러스터·독립 판정은 읽지 않는다.
- 차이: Node TAP 결과에는 native·실제 출처·독립 검토의 범위와 해시가 없으므로 전체 제품 PASS 판정에 쓸 수 없다. G-T-06.
- 고정 장치: 고정 없음 → G-T-06
- 출처: D00007, D00008, D00009, D00733, D00785, D00786, D00787, D00788, D00789, D00790, D00791, D00967, D01044, D01051. 근거: D00007~D00009,D00733,D00785~D00791,D00967,D01044

<a id="C-007"></a>

### C-007 승인된 모습 보존

- 목표: 승인된 data-table의 구조만 정리한 전후 화면을 같은 테마·폭·고정 시각으로 비교한다 → 새 요소·변형·배치·움직임·문구 묶음은 승인 없이 추가하지 않는다. 버그 수정·과거 모습 복원·기존 kit 재사용·미사용 제거는 허용한다. 구조·색·성능 정리로 승인된 배치·동작을 옮기지 않는다. 요구를 변경할 때 같은 변경에서 고정 장치도 갱신한다. 모양 불변 정리는 같은 Mac·시계·데이터·테마·폭의 정적 영역 픽셀 차이 0. 의도 변경은 결정 ID·전후·영향 화면과 해당 반례 시험을 함께 제시한다. 임의 mask 확대 0. → 배치·문구·색 픽셀 중 하나라도 달라졌는데 승인 결정과 영향 화면 비교가 없으면 실패.
- 현재: `kit/tools/check-visual.mjs:32`의 TOLERANCE=24, MAX_PIXELS=12와 :62의 비교식은 엄격한 픽셀 차이 0보다 넓다.
- 차이: 색 채널 차이 24 이하 또는 변경 픽셀 12 이하는 도구가 통과시켜 구조 정리의 차이 0을 강제하지 못한다. G-T-07.
- 고정 장치: `kit/tools/check-visual.mjs:61–62` — 채널·픽셀 비교 항목(허용치 차이는 G-T-07)
- 출처: D00725, D00747, D00916, D00951, D00952, D00953, D00954, D01050, D01051. 근거: AGENTS.md 승인 규칙; D00725,D00747,D00916,D00951~D00954,D01050~D01051

<a id="C-008"></a>

### C-008 kit와 제품 경계

- 목표: kit 파일에 apps/wake 내부 import 또는 locale 밖 한국어를 넣은 변경을 검사한다 → kit은 제품 독립 틀이며 apps/wake는 정의·데이터와 kit 호출로 화면을 만든다. kit/locale 밖 한국어와 Wake/Kubernetes 용어, 앱의 별도 CSS·마크업·동일 역할 중복 부품을 만들지 않는다. kit 자체 문서 ARCHITECTURE·CONTRACTS·QUALITY·README는 공용 계약이므로 유지하고 스펙에서 참조한다. check-deps·check-reuse·check-locale·unused-check 위반 0. 동적 호출·vendor 예외는 실행 도달성과 근거를 별도로 남긴다. → check-deps가 금지 import·한국어를 허용하거나 앱 화면이 공개 kit 진입점 밖 구현을 중복하면 실패.
- 현재: `kit/tools/check-deps.mjs:62` 이후 kit→apps와 앱의 비공개 kit import를 검사하고 :100 이후 한국어를 검사한다.
- 차이: 정적 import 검사는 있지만 동적 호출의 실제 화면 소비 경로는 검사 범위 밖이다. G-T-08.
- 고정 장치: `kit/tools/check-deps.mjs` — kit→apps import, 공개 진입점, 금지 용어·locale 밖 한국어 항목
- 출처: D00916, D00917, D01051. 근거: AGENTS.md 구조; kit/ARCHITECTURE.md; kit/QUALITY.md:1-29; D00916~D00917.

<a id="C-009"></a>

### C-009 비밀과 사용자 자료 보존

- 목표: 전용 userData와 시험 kubeconfig로 토큰이 들어 있는 도구 오류를 발생시킨다 → 세부 구현 (기본값 채택, 번복 가능): 키체인·서버 해시·파일 0600의 저장 구현 계약. 원칙: 토큰·키·원문 자격은 화면·URL·로그·캡처·문서에 쓰지 않는다. 원문은 키체인, 서버 검증은 해시만 사용하고 저장 파일은 0600이다. 시험은 별도 userData와 전용 kubeconfig를 쓴다. 실제 사용자 자료·앱·자격·터널·dirty/index를 보존한다. 외부 전송은 승인된 기능과 범위로 한정한다. 실행 PID와 userData, kubecontext/cluster UID를 기록한다. 토큰 포함 산출물 0, 사용자 settings 수정 시각/해시 불변. 오염 흔적은 목록만 제시하고 삭제는 사용자 확인 뒤에 한다. → 화면·URL·감사·캡처에 원문 자격이 남거나 사용자 프로필의 설정 해시가 바뀌면 실패.
- 현재: `kit/desktop/main.cjs:291`은 --user-data-dir가 있으면 해당 경로를 userData로 선택한다.
- 차이: 전용 userData 선택은 가능하지만 원래 사용자 설정의 전후 해시 보존을 자동 판정하지 않는다. G-T-09.
- 고정 장치: 고정 없음 → G-T-09
- 출처: D-USR-2026-11-16-7; D00006, D00019, D00441, D01051. 근거: D00006,D00019,D00441; R-068 비밀 예외.

### C-010 파일·실행 자원 소유

- 목표: Electron 두 슬롯과 heavy 검사 하나를 점유한 상태에서 세 번째 앱 또는 두 번째 heavy 실행을 요청한다 → Electron 2자리·heavy 1개·독립 검증 1개는 D-USR-2026-11-16-6의 확정값이다. 동시 구현 2와 부하 10/20은 D-USR-2026-11-16-7의 기본값이다. 한 파일·공통 부품은 한 구현 단위만 수정한다. 구현 동시 최대 2, 무거운 전체 검사·빌드·클러스터 변경은 heavy.lock 하나, 독립 검증도 한 번에 하나다. Electron은 slot1/slot2 최대 2이며 자기 PID·포트·프로필만 제어한다. 파일 교집합 0. uptime 1분 부하 >20이면 신규 실행 금지, 진행 측정 무효. 성능 기준값은 부하 ≤10. 포트 PID와 userData 모두 자기 값이어야 CDP 접속한다. → 세 번째 Electron이나 두 번째 heavy·독립 검증이 시작되거나 다른 소유 PID에 접속하면 실패.
- 현재: `kit/tools/check-tests.mjs:35`은 spawnSync로 시험을 실행하며 Electron 슬롯·heavy.lock·다른 검사 프로세스 소유 여부를 확인하지 않는다.
- 차이: 전체 시험 실행기에 프로세스 간 heavy 배타 검사와 Electron 슬롯 획득 절차가 없다. G-T-10.
- 고정 장치: 고정 없음 → G-T-10
- 출처: D-USR-2026-11-16-7; D-USR-2026-11-16-6; D00977, D01051. 근거: 68-71,216-234; D00977; R-067의 최대3은 이후 최대2로 대체.

<a id="C-011"></a>

### C-011 커밋과 이름

- 목표: 승인된 커밋 범위를 check-commits에 넘긴다 → 커밋은 명시된 허용 범위에서만 한다. 작성자·커미터는 사용자 git 설정을 사용한다. 메시지는 type(scope): 한글 설명, 본문은 명사로 끝나는 항목이다. 커밋·트레일러·코드 주석에 생성 주체 흔적이나 세션 링크를 남기지 않는다. 기준 앱 고유명은 저장소 파일·주석·커밋 어디에도 넣지 않는다. 허용된 커밋 단계에서 git-commit 스킬 및 `node kit/tools/check-commits.mjs --range <승인된 범위>`를 통과한다. --no-verify 0. → 사용자와 다른 작성자, 금지 이름, 생성 주체 트레일러, 잘못된 제목 또는 --no-verify 우회가 있으면 실패.
- 현재: `kit/tools/check-commits.mjs:26`은 기본 범위를 origin/main..HEAD로 선택하고 :31은 KIT_BANNED_NAMES를 필수 입력으로 읽는다.
- 차이: AGENTS.md의 upstream 기본 범위와 .local 기본 금지 목록 설명이 origin/main·환경 변수 필수 구현과 다르다. G-T-11.
- 고정 장치: `kit/tools/check-commits.test.mjs` — `check_commits_default_range_includes_all_commits_since_origin_main`, `check_commits_requires_environment_file_and_ignores_legacy_default`
- 출처: D01051. 근거: AGENTS.md 커밋 절

### C-012 살아 있는 정본과 정지

- 목표: 동일 요구를 가진 두 문서를 통합하는 동안 사용자가 제품 작업 정지를 지시한다 → 승인된 의도는 spec에 유지하고 코드는 현상 증거로 대조한다. 구현에 맞추려고 요구를 낮추지 않는다. 중복 문서는 요구·근거·재현 경로를 이전하고 누락 0을 확인한 뒤에만 삭제 대상으로 확정한다. 사용자의 정지는 자동 재개하지 않는다. L-001~L-012를 만족한다. 정본 편집만으로 정지된 제품 구현·검증 큐를 재개하지 않는다. → 원천 ID의 도착 규칙·재현 경로를 잃거나 문서 수정만으로 멈춘 제품 큐를 재개하면 실패.
- 현재: `kit/tools/check-tests.mjs:16`의 대상은 kit/apps 시험이며 spec 원천 대응·문서 삭제 조건·사용자 정지 상태는 검사 대상이 아니다.
- 차이: 삭제 전 원천 ID 도착·재현 경로와 정지 상태를 함께 강제하는 도구가 없다. G-T-12.
- 고정 장치: 고정 없음 → G-T-12
- 출처: D01045, D01046, D01047, D01048, D01049, D01050, D01051, D01052. 근거: D01045~D01052
