# 디자인 검수와 남은 차이

규칙별 목표·현재·차이·작업 ID는 [design.md](../design.md)에 한 번만 둔다. 이 문서는 그 규칙의 공통 입력과 판정 방법이다. 아래 과거 FAIL/PASS는 원래 사본의 결과이며 현재 트리의 시험 실행·앱 검수 결과가 아니다.

## B-CHECK-001 상태 일곱 가지

- 목표: 입력: 같은 대상 UID에 성공1건·성공0건·대기·미연결·403·부분 성공·마지막 성공값을 각각 응답한다 → 기대: 아래 상태표의 머리·본문·복구 동작이 readRow의 state와 원본 rows·collectedAt에 맞게 표시된다 → 실패:403을 빈 표로 표시하거나 실패를0으로 바꾸면 실패.
- 현재: `apps/wake/pages/view-parts.js:69`의 readRow가 읽기 상태를 분기하고 :81의 skeletonTable은 columns를 사용한다.
- 차이: readRow에 오기 전에 호출부가 null을 빈 배열로 바꾸면 실패 원인을 되살리지 못한다 → T-B-032.
- 고정 장치: 고정 없음 → T-B-041
- 출처: D00606, D00999, D01027, D01031, D01032.

| 상태 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| 정상 | → [RULE-STATE](../rules.md#RULE-STATE) | B-CHECK-001 현재 | B-032~034 차이 | 고정 없음 → T-B-032 | D00606, D00999, D01027 |
| 불러오는 중 | → [RULE-STATE](../rules.md#RULE-STATE) | B-CHECK-001 현재 | B-032~034 차이 | 고정 없음 → T-B-032 | D00606, D00999, D01027 |
| 비어 있음 | → [RULE-STATE](../rules.md#RULE-STATE) | B-CHECK-001 현재 | B-032~034 차이 | 고정 없음 → T-B-032 | D00606, D00999, D01027 |
| 연결 안 됨 | → [RULE-STATE](../rules.md#RULE-STATE) | B-CHECK-001 현재 | B-032~034 차이 | 고정 없음 → T-B-032 | D00606, D00999, D01027 |
| 권한 없음 | → [RULE-STATE](../rules.md#RULE-STATE) | B-CHECK-001 현재 | B-032~034 차이 | 고정 없음 → T-B-032 | D00606, D00999, D01027 |
| 부분 실패 조합 | → [RULE-STATE](../rules.md#RULE-STATE) | B-CHECK-001 현재 | B-032~034 차이 | 고정 없음 → T-B-032 | D00606, D00999, D01027 |
| 오래됨 | → [RULE-STATE](../rules.md#RULE-STATE) | B-CHECK-001 현재 | B-032~034 차이 | 고정 없음 → T-B-032 | D00606, D00999, D01027 |

## B-CHECK-002 출처 칩 실패 조합

- 목표: 입력: 저장된 Service UID에 Endpoints403과 hub ready를 동시에 응답한다 → 기대: conn-view의 연결 근거는 남고 홈 칩·연결 카드·목록·메뉴·상세·설정 및 인시던트 머리에 열거 실패가 표시된다 → 실패: 칩을 제거하거나 정상 체크만 남기면 실패.
- 현재: `apps/wake/data/conn-view.js:79`의 wasFound는 같은 UID 근거를 유지하고 `apps/wake/pages/tool-detail.js:64`는 inventoryFailure를 렌더링한다.
- 차이: tool-surfaces 시험은 같은 UID 복구와 상세 실패를 다루지만 인시던트 머리까지 묶지 않는다 → T-B-020.
- 고정 장치: 고정 없음 → T-B-020
- 출처: D00999, D01000.

| 연결·UID 근거 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| 없음 | 입력: 없음, 열거=발견만 성공, hub=정상 여부 무관 → 기대: 칩 연결 칩으로 포함 금지; 발견과 연결은 다름; 연결 시작 UI는 별도(conn-view 연결 근거) → 실패: 이 입력에서 연결 칩으로 포함 금지 판정과 다른 칩 집합이면 실패 | B-CHECK-002 현재 | B-020 차이 | 고정 없음 → T-B-020 | D00999, D01000 |
| 연결 근거 있음 | → [RULE-CHIPS](../rules.md#RULE-CHIPS). | B-CHECK-002 현재 | B-020 차이 | 고정 없음 → T-B-020 | D00999, D01000 |
| 연결 근거 있음 | → [RULE-CHIPS](../rules.md#RULE-CHIPS). | B-CHECK-002 현재 | B-020 차이 | 고정 없음 → T-B-020 | D00999, D01000 |
| 저장된 같은 Service UID | 입력: 저장된 같은 Service UID, 열거=목록 성공, Endpoints403/일시 오류로 행 unverified, hub=ready 또는 실패 → 기대: 칩 근거 유지; 부분 확인 실패; 검증되지 않은 binding 열기 금지(conn-view 연결 근거) → 실패: 이 입력에서 근거 유지 판정과 다른 칩 집합이면 실패 | B-CHECK-002 현재 | B-020 차이 | 고정 없음 → T-B-020 | D00999, D01000 |
| 저장된 근거 | 입력: 저장된 근거, 열거=전체 열거 실패, hub=ready → 기대: 칩 포함 유지; 허브 건강과 열거 실패를 동시에 표시, 상세에도 재시도(conn-view 연결 근거) → 실패: 이 입력에서 포함 유지 판정과 다른 칩 집합이면 실패 | B-CHECK-002 현재 | B-020 차이 | 고정 없음 → T-B-020 | D00999, D01000 |
| 저장된 근거 | 입력: 저장된 근거, 열거=전체 열거 실패, hub=실패 → 기대: 칩 포함 유지; 두 실패 출처를 혼동하지 않음(conn-view 연결 근거) → 실패: 이 입력에서 포함 유지 판정과 다른 칩 집합이면 실패 | B-CHECK-002 현재 | B-020 차이 | 고정 없음 → T-B-020 | D00999, D01000 |
| 이전 UID 근거 | 입력: 이전 UID 근거, 열거=다른 UID가 성공적으로 확인됨, hub=새 UID 상태 → 기대: 칩 이전 근거 제거; 새 대상을 이전 연결·오래된 값으로 정상 처리 금지(conn-view 연결 근거) → 실패: 이 입력에서 이전 근거 제거 판정과 다른 칩 집합이면 실패 | B-CHECK-002 현재 | B-020 차이 | 고정 없음 → T-B-020 | D00999, D01000 |
| 이전 근거 | 입력: 이전 근거, 열거=성공한 빈 목록, hub=해당 대상 없음 → 기대: 칩 오래된 포함 근거 제거; 실패한 빈 목록과 구별(conn-view 연결 근거) → 실패: 이 입력에서 오래된 포함 근거 제거 판정과 다른 칩 집합이면 실패 | B-CHECK-002 현재 | B-020 차이 | 고정 없음 → T-B-020 | D00999, D01000 |

## B-CHECK-003 반복 회귀 입력

- 목표: 입력: 아래 회귀표의 긴 목록·마지막 탭·9 (3m ago)·키보드 근거 사례를 실행한다 → 기대: 각 연결 B 규칙의 위치·값·조작 결과로 판정하며 과거 원인 추정은 별도 열에 남는다 → 실패: 과거 보고만으로 현행 소스 원인을 확정하거나 재현하지 않은 항목을 닫으면 실패.
- 현재: `kit/components/data-table.js:92`는 optional 숨김을8순위로 제한하고 `kit/components/ref.js:23`은 tabindex가 있는 span을 출력한다.
- 차이: Restarts의 fit 후 실제 폭과 native 창 밖 hover 복귀는 기존 정적 시험에서 빠져 있다 → T-B-018, T-B-012.
- 고정 장치: 고정 없음 → T-B-041
- 출처: D00008, D00009, D01008, D01012, D01029, D01030, D01033, D01034, D01035, D01041.

| 회귀 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| 세로 스크롤 | 입력: 긴 실제 목록/코드/설정의 마지막 행·페이저 접근, wheel/End, 아래 모서리 → 기대: B-008 목표의 값·위치·조작 결과 → 실패: 세로 스크롤 재현에서 B-008의 실패 조건에 걸리면 실패 | B-008 현재; 과거 관측: overflow·칸 레이아웃 변경이 원인 후보. 전체 화면 원인 확정은 안 됨 | B-008 차이 | 고정 없음 → T-B-008 | D00532, D01030, D01031 |
| 탭 스크롤 | 입력: 좁은 칸·세 칸·마지막 탭 선택, scroll0·선택 유지·더보기1 → 기대: B-022 목표의 값·위치·조작 결과 → 실패: 탭 스크롤 재현에서 B-022의 실패 조건에 걸리면 실패 | B-022 현재; 과거 관측: 이전 scroll/fade 정책이 최신 더보기 정책과 충돌; view-parts의 옛 주석 잔존 | B-022 차이 | 고정 없음 → T-B-022 | D01028, D01029 |
| 도구 상태 불일치 | 입력: 같은 UID Endpoints 실패, 허브 ready+열거 실패, 복구를 여섯 표면 비교 → 기대: B-020 목표의 값·위치·조작 결과 → 실패: 도구 상태 불일치 재현에서 B-020의 실패 조건에 걸리면 실패 | B-020 현재; 과거 관측: 포함·건강·열기 판단 혼합. 과거 T1 F1/F2가 실패 재현 | B-020 차이 | 고정 없음 → T-B-020 | D00992, D00999, D01000 |
| 아이콘 색 | 입력: 같은 상태를 머리/행/표/칩에 렌더, icon/text 색 의미 일치 → 기대: B-002 목표의 값·위치·조작 결과 → 실패: 아이콘 색 재현에서 B-002의 실패 조건에 걸리면 실패 | B-002 현재; 과거 관측: summary-bar의 `.sbar-item .wi`가 status-icon 색 상속을 덮은 사례(parity N4) | B-002 차이 | 고정 없음 → T-B-002 | D00902, D00998, D01008 |
| 표 정렬 | 입력: 모든 데이터 열 left, 공통 머리 글꼴, 숫자 tabular → 기대: B-016 목표의 값·위치·조작 결과 → 실패: 표 정렬 재현에서 B-016의 실패 조건에 걸리면 실패 | B-016 현재; 과거 관측: 옛 align/value/mono 덮어쓰기와 새 kind 경로 혼재 | B-016 차이 | 고정 없음 → T-B-016 | D00454, D01033, D01034 |
| 반경 | 입력: p=8<R16, p=20≥R16, sg-card/row-side 예외, 두 테마 → 기대: B-004 목표의 값·위치·조작 결과 → 실패: 반경 재현에서 B-004의 실패 조건에 걸리면 실패 | B-004 현재; 과거 관측: 역할·원형/초타원 배율·p<R 적용 범위 혼동 | B-004 차이 | 고정 없음 → T-B-004 | D01016, D01017, D01028 |
| 남는 호버 | 입력: 창 밖 이동/비활성/탭전환 뒤 복귀, 실제 hover 아닌 바탕0 → 기대: B-012 목표의 값·위치·조작 결과 → 실패: 남는 호버 재현에서 B-012의 실패 조건에 걸리면 실패 | B-012 현재; 과거 관측: 창 밖 포인터와 선택 상태 관리 문제 후보. CSS만의 원인으로 확정하지 않음 | B-012 차이 | 고정 없음 → T-B-012 | D01040, D01041, D01042 |
| 설정 이중 틀 | 입력: 창 바탕 메뉴+카드1, 전체 높이 경계선, 접힌 sidebar 선0 → 기대: B-005 목표의 값·위치·조작 결과 → 실패: 설정 이중 틀 재현에서 B-005의 실패 조건에 걸리면 실패 | B-005 현재; 과거 관측: 셸 frame-main과 설정 내부 카드의 역할 중복 | B-005 차이 | 고정 없음 → T-B-005 | D01016, D01017, D01020 |
| 상태 아이콘·숫자 혼합 | 입력: Ready/Status 분리, Restarts 숫자 tone만, 아이콘0 → 기대: B-016 목표의 값·위치·조작 결과 → 실패: 상태 아이콘·숫자 혼합 재현에서 B-016의 실패 조건에 걸리면 실패 | B-016 현재; 과거 관측: number cell에 임의 status markup 또는 legacy rendering | B-016 차이 | 고정 없음 → T-B-016 | D00454, D01033, D01034 |
| Restarts 잘림 | 입력: `9 (3m ago)` 포함 760/1680에서 전체 표시 → 기대: B-018 목표의 값·위치·조작 결과 → 실패: Restarts 잘림 재현에서 B-018의 실패 조건에 걸리면 실패 | B-018 현재; 과거 관측: B1 7차에서 64px 열에91px 문자열 | B-018 차이 | 고정 없음 → T-B-018 | D00953, D01033, D01034 |
| 과거·다른 대상 값 | 입력: 원본·절대 범위·step 일치, 새 UID에 이전값0 → 기대: B-028 목표의 값·위치·조작 결과 → 실패: 과거·다른 대상 값 재현에서 B-028의 실패 조건에 걸리면 실패 | B-028 현재; 과거 관측: 별도 머리/차트 출처, 늦은 UID 응답 | B-028 차이 | 고정 없음 → T-B-028 | D00612, D00830, D00831 |
| 근거 번호·잘못된 근거 | 입력: 실패 근거 링크0, 성공 이름표+대상, click/Enter/Space 동일 → 기대: B-026 목표의 값·위치·조작 결과 → 실패: 근거 번호·잘못된 근거 재현에서 B-026의 실패 조건에 걸리면 실패 | B-026 현재; 과거 관측: 실패 조회를 used refs에 포함, span의 키 활성화 없음 | B-026 차이 | 고정 없음 → T-B-026 | D00884, D00885 |

## B-CHECK-004 과거 판정의 남은 지적

- 목표: 입력: 과거 보고와 다른 소스 해시에서 같은 실패 입력을 실행한다 → 기대: 보고서에는 당시 판정과 현재 실행의 route·해시·결과가 나란히 남고 남은 minor도 연결 작업으로 유지된다 → 실패: 수정 소스가 있다는 이유만으로 과거 FAIL을 현재 PASS로 바꾸면 실패.
- 현재: `kit/tools/check-surfaces.mjs:44–59`의 SHOWN_WHY는 조상 opacity를 곱하지만 filter:opacity는 읽지 않는다.
- 차이: opacity:0과 filter:opacity(0)의 가시성 판정이 다르다 → T-B-041.
- 고정 장치: 고정 없음 → T-B-041
- 출처: D00008, D00009; B1 round7, T1 round4, C1 round4, U-01 round3, tone 보고.

| 보고·위치 | 남은 지적 | 영향·판정 범위 | 연결 작업 |
|---|---|---|---|
| B1 7차:11–37, major1 | 공급자 없음 때 첫 질문이 보이지만 저장·후속 모델 입력에서 유실 | 실제 엔진/허브/디스크+모의 공급자; native/실제 모델 검증 아님 | T-B-040, 대화 저장 영역 |
| B1 7차:39–47, minor2 | 실패한 근거 조회에도 인시던트 이름표 | 없는 근거를 읽은 것처럼 표시 | T-B-026 |
| B1 7차:49–55, minor3 | Restarts 경과 시간 잘림 | typed fixture DOM, 실제 native 미확인 | T-B-018 |
| B1 7차:57–63, minor4 | 근거 이름표 Enter/Space 미작동 | click은 정상, 키보드 navigate0 | T-B-012/026 |
| T1 4차:11–29, major F1 | 같은 Service UID의 부분 확인 실패가 연결 도구를 숨김 | 실제 Service 응답+Endpoints 실패 주입 native 재현 | T-B-020 |
| T1 4차:31–41, major F2 | 상세에서 열거 실패·재시도 누락 | hub ready와 열거 실패를 구별하지 못하는 표현 | T-B-020/032 |
| T1 4차:43–47, minor m1 | unused 결과가 기존18건과 다름 | 격리 사본/동시 의존 파일 차이부터 확인; 임의 삭제 금지 | T-B-001/041 |
| C1 4차:26–32, minor R4-M1 | clip-path의 부분/완전 잘림 분류 부정확 | 합성 극단 입력의 검사기 한계, 제품 실제 결함으로 확대하지 않음 | T-B-004/041 |
| C1 4차:34–40, minor R4-M2 | filter:opacity(0)를 표시됨으로 판단 | 실제 opacity 속성 경로 수정과 별개 | T-B-011/041 |
| U-01 3차:14–22, major1 | 이전 UID 읽기를 새 UID의 정상 관측으로 반환 | 대상·값 정합성 결함 | T-B-028/032, 동시성 영역 |
| U-01 3차:24–40, major2/3 | D6 결과0건도 성공; 홈 캡처를 네트워크 증거로 수용 | 검증 정체·완전성 결함 | T-B-041 |
| U-01 3차:42–45, minor | 라벨907픽셀 차이, 알림 동점 순서 | 픽셀 원인은 추정; 알림 순서는 U-28 이관, major 아님 | T-B-017/041, 알림 표 영역 |
| tone:38–46, M1 | Namespace·장애 알림·보관 기간 컨트롤의 실제 효과 없음 | 원래 삭제 권고는 D00993 기능 구현 지시로 대체 | T-B-010, T2 |
| tone:48–56, M2 | 보관함 클러스터 선택기가 이름 없는 화살표 | 실제 선택값·label 복원 | T-B-024/035 |
| tone:58–66, M3 | 정상0건 보관함을 AI 연결 실패로 표시 | 빈 결과와 조회 실패 분리 | T-B-034/040 |
| tone:68–78, M4 | 에이전트·권한 화면에 로딩 글만 남음 | 느림·실패·권한의 실제 상태 및 뼈대 필요 | T-B-010/032/033 |
| tone:80–86, m1 | 첫 실행 내부 상태 idle 노출 | locale 상태로 표시 | T-B-010/037 |
| tone:88–94, m2 | 발견한 도구를 “연결된 도구”로 묶음 | 포함/연결 의미 정합성 | T-B-020 |
| tone:96–102, m3 | 비용 미연결 상태의 아이콘·검색 누락 | 연결 전에도 기존 전체 이름 검색 동선 유지 | T-B-019/024/032 |

B1의 focused82/regression148/stream3은 별도 묶음으로 합산하지 않는다. deps15/unused18/reuse1 실패와 locale/ipc/release 통과도 그 사본의 결과다. tone의112개 합성 Electron 캡처에서1280은 emulation이며 native 모션·focus는 확인되지 않았다. C1 PASS는 검사기 범위이며 실제 Electron 재질·클러스터·제품 승인이 아니다. U-01의 다른 route 캡처와 0관측 성공 판정은 검증 결함으로 남는다.

## B-CHECK-005 이력과 복원

- 목표: 입력: 검색·AI·설정의 복원 이력과 현재 routes 정의를 비교하고 각 진입 동작을 누른다 → 기대: apps/wake/routes.js의 현재 목적 route에서 실제 첫 그림이 표시되고 과거 커밋은 이력으로만 적힌다 → 실패: 삭제된 견본 route나 과거 캡처를 현재 구현으로 세면 실패.
- 현재: `apps/wake/routes.js:4`의 route 정의와 `apps/wake/app.config.js:921`의 sidebar가 현재 진입 경로를 선언한다.
- 차이: 과거 복원 해시는 현재 route와 action 연결을 보증하지 않는다. 연결 상태를 자동 대조하는 이력 검사는 없다 → T-B-041.
- 고정 장치: 고정 없음 → T-B-041
- 출처: D00008, D00009

## B-CHECK-006 공통 화면 검수

- 목표: 입력: 동일 route·UID를 다크/라이트1280·1680과 표 경계1024·1440·760에서 열고 끝까지 스크롤한다 → 기대: 캡처에 마지막 행·activeElement·scrollTop·viewport와 소스 해시가 기록되고 구조 정리의 전후 위치·크기 차이는0이다 → 실패: 다른 route 또는0관측 결과가 합격으로 집계되면 실패.
- 현재: `kit/tools/check-surfaces.mjs:44`는 요소 가시성을 판정하며 native 창의 앱·대상 정체는 판정하지 않는다.
- 차이: check-surfaces는 DOM 가시성만 검사하므로 실제 클러스터와 캡처 route의 일치 판정이 빠져 있다 → T-B-041.
- 고정 장치: 고정 없음 → T-B-041
- 출처: D00008, D00009, AGENTS.md 점검 절.

```sh
node kit/tools/check-deps.mjs
node kit/tools/unused-check.mjs
node kit/tools/check-reuse.mjs
node kit/tools/check-locale.mjs
node kit/tools/check-tests.mjs
node kit/tools/check-release.mjs
node kit/tools/check-ipc.mjs
node kit/tools/check-states.mjs --app wake
node kit/tools/check-glass.mjs --app wake
node kit/tools/check-brand.mjs --app wake
node kit/tools/check.mjs --app wake
node kit/tools/check-layout.mjs --app wake
```

이 명령은 제품 변경·커밋 전 점검 계약이다. 실제 Playwright 설치의 NODE_PATH와 CHROMIUM_PATH를 사용한다. Mac은 통합 담당이 같은 Mac의 전후 그림을 비교하고 임시 기준을 커밋하지 않는다. Linux `check-visual.mjs --update`는 승인된 모양 변경을 통합 담당이 반영할 때만 쓴다.

캡처 필드: `B-ID, 코드/파일 해시, 앱·native 여부, route, cluster, namespace, UID, source, 절대 from/to, collectedAt, theme, CSS viewport, deviceScaleFactor, 상태, 입력 순서, scrollTop/scrollHeight/clientHeight, activeElement, 마지막 행 식별자, 캡처 위치, 판정`. 비밀 값은 제외한다. 네트워크 검수인데 홈 route가 찍혔으면 실패다. hover·가로 스크롤·클립보드·IME를 도구가 재현하지 못하면 확인 전으로 남긴다. 비활성 창과 앞에 있는 창의 복사 결과를 혼동하지 않는다.

## B-CHECK-007 부품 소유

- 목표: 입력: data-table과 소비자 columns를 두 작업자가 동시에 수정할 계획을 제출한다 → 기대: 아래 소유표에서 data-table 작성자 한 명을 정하고 소비자에는 확정된 kind·sortAction 계약을 전달한다 → 실패: 같은 공통 파일을 두 소유자가 동시에 쓰거나 기존 index를 덮으면 실패.
- 현재: `kit/components/data-table.js:94`의 kindOf는 columns 계약을 소비하며 `apps/wake/pages/resource-list.js:113`이 columns를 만든다.
- 차이: 공통 부품의 파일 소유 잠금은 제품 코드에 없고 작업 절차가 맡는다 → T-B-041.
- 고정 장치: 고정 없음 → T-B-041
- 출처: D00006, D00009.

| 부품 묶음 | 같은 소유자가 고칠 범위 | 의존 소비자 |
|---|---|---|
| 토큰·면 | tokens.css, theme.css, 반경 계약 | 셸·설정·모든 부품 |
| 칸·스크롤 | app-frame, page-column, shell, native host | 모든 화면·외부 도구 |
| 표 | data-table, 종류/fit/행 스타일 | 각 화면 columns 정의 |
| 카드 | summary-bar, disclosure | 홈·상세·코드·지표 |
| 구역 탭·도구 줄 | pill-tabs, list-toolbar, time-range | view-parts 및 목록 화면 |
| 출처 상태 | conn-view, source-chips, tool-surfaces | 홈·메뉴·목록·상세·설정·인시던트 |
| 차트·시간·흐름 | chart-card, temporal-chart, change-timeline, flow-graph | 모니터링·상세·보고서 |
| 떠 있는 면 | menu, dialog, palette, toast, notice | 셸과 페이지의 트리거 |
| AI·근거·보고서 | ref, ai-applied, report-canvas와 실제 허브 계약 | AI 칸·인시던트 보고서 |
| 검사기 | check-surfaces/check-states/check-glass 등 | 제품 부품과 독립 검수 |

## B-CHECK-008 시험 이름과 범위

아래 시험명은 정의된 입력의 회귀 경계다. native 전체 화면 검수와 시험 실행 통과를 뜻하지 않는다.

- 목표: 입력: 아래 시험 이름이 있는 소스를 읽고 skip이 포함된 시험 결과를 수집한다 → 기대: 파일 존재·정의된 시험·실행 pass·skip을 서로 다른 값으로 기록한다 → 실패: skip 또는 시험 파일 존재를 실행 통과로 계산하면 실패.
- 현재: `kit/components/chart-card-axis.test.mjs:44`는 playwright-core가 없으면 skip하도록 정의한다.
- 차이: skip 조건은 소스에 있지만 여러 실행을 합산한 보고가 skip을 제외하는 공통 집계기는 없다 → T-B-041.
- 고정 장치: 고정 없음 → T-B-041
- 출처: D00008, D00009.

| 파일 | 시험 이름 | 고정 범위 |
|---|---|---|
| `apps/wake/pages/cluster-home.test.mjs` | `home_pending_failure_forbidden_and_retry_are_distinct` | 정의된 입력만 |
| `apps/wake/pages/cluster-home.test.mjs` | `a_down_cluster_is_never_shown_as_current` | 정의된 입력만 |
| `apps/wake/pages/cluster-home.test.mjs` | `metric_bars_head_the_last_point_of_the_drawn_series_and_ask_the_hub_for_named_series` | 정의된 입력만 |
| `apps/wake/pages/cluster-home.test.mjs` | `a_connected_tool_that_stops_answering_keeps_its_chip_and_shows_it_down` | 정의된 입력만 |
| `apps/wake/pages/cluster-home.test.mjs` | `a_tool_whose_first_attempt_failed_and_was_never_connected_makes_no_chip` | 정의된 입력만 |
| `apps/wake/pages/cluster-home.test.mjs` | `a_past_window_names_its_span_in_the_head_and_going_back_restores_the_live_range` | 정의된 입력만 |
| `apps/wake/pages/cluster-home.test.mjs` | `a_metric_bar_crossing_its_threshold_after_the_first_drawing_stays_closed_and_marks_its_head` | 정의된 입력만 |
| `apps/wake/pages/cluster-home.test.mjs` | `home_draws_bars_of_the_final_size_with_grey_value_places_before_its_data` | 정의된 입력만 |
| `apps/wake/pages/resource-pages.test.mjs` | `list: concurrent retry ignores older success after newer denial` | 정의된 입력만 |
| `apps/wake/pages/resource-pages.test.mjs` | `detail: absent resource has no tabs, command menu, AI context or related requests` | 정의된 입력만 |
| `apps/wake/pages/resource-pages.test.mjs` | `detail: only the primary null, missing or 404 removes the target` | 정의된 입력만 |
| `apps/wake/pages/resource-pages.test.mjs` | `an Event deep link rejects a different UID before fetching related content` | 정의된 입력만 |
| `apps/wake/pages/resource-pages.test.mjs` | `list: a kind table drops a column no row has a value for (no source, no column) and counts the head from the listed rows` | 정의된 입력만 |
| `apps/wake/pages/resource-pages.test.mjs` | `detail: the head has one action, the warning card says why and who manages it, and the summary keeps the rule order` | 정의된 입력만 |
| `apps/wake/pages/resource-pages.test.mjs` | `detail: the container table counts restarts the kubectl way, warning tone on the figure only, the last state in its tip` | 정의된 입력만 |
| `apps/wake/pages/resource-pages.test.mjs` | `detail: the resource YAML wraps long lines` | 정의된 입력만 |
| `apps/wake/pages/resource-pages.test.mjs` | `detail: the event YAML head shows its resourceVersion, never the kind again` | 정의된 입력만 |
| `apps/wake/tool-surfaces.test.mjs` | `a_verified_tool_stays_on_every_surface_while_the_same_service_cannot_be_verified_and_comes_back` | 정의된 입력만 |
| `apps/wake/tool-surfaces.test.mjs` | `tool_detail_shows_the_inventory_failure_and_reads_again_even_when_the_hub_says_healthy` | 정의된 입력만 |
| `kit/components/status-flow.test.mjs` | `a step nobody reports on is idle, never done` | 정의된 입력만 |
| `kit/components/status-flow.test.mjs` | `an action the decision offers is shown there only, not again in the head` | 정의된 입력만 |

## B-CHECK-009 과거 지적 이후의 소스

- 목표: → [RULE-CHIPS](../rules.md#RULE-CHIPS).
- 현재: `apps/wake/data/conn-view.js:79`의 UID 유지와 `apps/wake/pages/tool-detail.js:64`의 실패 줄이 두 후속 경계다.
- 차이: 두 후속 시험은 정의돼 있으나 실제 창의 여섯 표면과 인시던트 머리 조합은 해당 시험에 없다 → T-B-020.
- 고정 장치: 고정 없음 → T-B-020
- 출처: D01038, D01041, D01042, D00999, D01000; B1/T1 원천 보고.
