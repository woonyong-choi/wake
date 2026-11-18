# 회귀 고정 장치

이 문서는 회귀 목표와 고정 장치의 연결 정본이다. 제품 동작은 각 영역 규칙이 소유한다. 2026-11-17 작업 트리의 spec 전체와 장치 선언·현재 코드를 대조했다. 제품 시험, 브라우저, Electron, 실제 클러스터, 캡처 비교는 실행하지 않았다. 과거 FAIL도 현재의 실행 결과로 옮기지 않는다. 원천·약어는 [C-SOURCE](constitution.md#C-SOURCE)를 따른다. 저장소 밖 검증 기록은 저장소 시험과 구별한다.

목표·현재·차이·고정 장치·출처는 아래 계약에 한 번 정의한다. 요약 표의 각 원본 규칙은 J-001을 적용하고, 제품 목표·차이·후속 작업은 원본에서 읽는다. 빈 값·톤·툴팁·7상태·폭·원본 대조는 CMP-TABLE-01~08, SCR-STATES, Q-003~006을 참조한다. 여기서 표의 정렬이나 SRE 판단 기준을 다시 정하지 않는다.

## 공통 판정과 변경 규칙

### J-001 규칙별 고정의 성립 조건

- 목표: 입력: 규칙을 위반하는 입력과 정상 입력을 연결된 장치에 넣는다 → 기대: 규칙을 어기는 입력에서 실패하는 시험·점검·캡처를 연결한다(D01051). 입력, 기대값, 실패 단언 또는 수동 판정 절차, 실제 파일, 실행 환경과 결과를 모두 식별한다. 파일 존재와 실행 합격을 따로 기록한다. → 실패: 위반 입력이 PASS이거나 시험 경로·실행 환경이 없으면 실패.
- 현재: kit/tools/check-tests.mjs:16은 시험 파일을 모으고 :35에서 실행하지만 spec ID별 반례 대응을 검사하지 않는다.
- 차이: 시험 파일 실행과 규칙별 전체 조건 충족을 연결하는 ID·단언 대응 검사가 없다.
- 고정 장치: 고정 없음 → J-T-001
- 출처: D-USR-2026-11-16-7; D01051; 이번 회귀 영역 요청.

| 장치 판정 | 지금 있는 것 | 남아 있는 것 |
|---|---|---|
| 파일·부분 | 선언이 가리키는 시험·점검 파일 본문 | 해당 규칙의 모든 단언·현재 실행 결과 |
| 외부·부분 | 지정 원천에 있는 재현·검사 파일 | 저장소 이관·의존성·현재 코드 재실행 |
| 상속·부분 | 명시한 부모 규칙의 장치 | 자식 열·상태·대상의 별도 반례 |
| 선언·점검만 | 원본에 적힌 시험명·입력·판정 항목 | 실행 가능한 시험 또는 같은 조건의 캡처; 자동 고정 없음 |
| 고정 없음 | 장치 없음 명시 또는 구체 장치 미식별 | 장치 작성·경로 확정·반례·실행 결과 |
| 문서 검사 | ID·경로·해시·범위 검사 | 제품 실행과 별도 |

파일·부분에 “고정 없음”이 함께 있으면 해당 목표의 일부만 검사한다. 모든 표 행은 실행 미확인이며, 규칙 자체가 제안이면 장치 존재로 승인 상태를 바꾸지 않는다. 전체 고정으로 판정한 제품 규칙은 없다.

### J-002 규칙과 고정 장치의 동반 변경

- 목표: 입력: 값·상태·동작 규칙을 바꾸는 변경을 검토한다 → 기대: 요구·값·상태·모양·동작을 바꾸는 변경에서 규칙 ID와 장치를 함께 갱신한다(D00447). 기대값 삭제·skip·기준 그림 덮어쓰기로 회귀를 숨기지 않는다. 승인된 동작 보존은 C-007, 변경 절차는 L-004~008을 따른다. → 실패: 기대값 삭제·skip·기준 덮어쓰기만으로 회귀를 숨기면 실패.
- 현재: kit/tools/check-visual.mjs:119~124는 그림 차이를 실패시키고 check-reuse.mjs:121~141은 중복·금지 스타일을 검사한다.
- 차이: 두 검사 모두 변경 규칙 ID·승인 ID·간접 소비 화면의 전체 목록을 입력받지 않아 장치 동반 변경을 강제하지 않는다.
- 고정 장치: 고정 없음 → J-T-002
- 출처: D00447, D00457, D00458, D01051.

### J-003 실행 수준과 화면 정체

- 목표: 입력: 정적·fixture·브라우저·Electron·실원본 결과를 함께 읽는다 → 기대: 정적 코드·합성 입력·브라우저·Electron/native·실원본·독립 검토를 구별한다(D00458). Q-005~009의 시작/종료 소스, PID·userData·화면키·UID·절대 기간·테마·폭·스크롤 위치를 결과에 묶는다. 다른 화면·빈 결과·skip을 합격으로 세지 않는다. → 실패: 다른 route·빈 결과·skip이 실제 화면 합격으로 집계되면 실패.
- 현재: [H-003](tasks.md#H-003-run)은 격리 허브·페이지 시험, 실제 Electron WebContents, lab 원본을 구별해 기록했다. 캡처 집합의 빈 입력·홈을 네트워크로 제출·잘못된 테마를 모두 거절했다. H-003 2차는 선택된 15분과 차트의 60분 구간 불일치도 거절한다. `kit/tools/check-layout.mjs`의 예시 0개 통과는 이번 실제 화면 판정에 쓰지 않았다.
- 차이: J-T-003. (기본값 채택, 번복 가능) OPEN-REG-002: 공통 회귀는 다크·라이트 × 1280·1680, 높이 900과 760 상세를 기본으로 하되 원본의 860·1440·240 높이 조건도 빠뜨리지 않는다.
- 고정 장치: 고정 없음 → J-T-003
- 출처: D-USR-2026-11-16-7; D00008, D00009, D00458, D01051.

### J-004 실패 재현 자료의 보존

- 목표: 입력: 실패 재현 장치를 새 위치로 옮긴 뒤 같은 입력을 실행한다 → 기대: 장치를 옮기거나 원천을 지우기 전에 동일 실패를 검출하는 대체 장치와 입력·기대값·승인 캡처·복원 절차를 연결한다(D01049). 원문 보고의 복사본을 줄여도 유일한 재현 자료는 버리지 않는다. → 실패: 대체 장치가 원래 실패를 놓치거나 유일한 재현 자료를 잃으면 실패.
- 현재: missingEvidence는 claims의 증거 파일 누락을 찾고 :200은 증거 hash 변화를 검출한다.
- 차이: 파일 존재·해시만 비교하므로 이관한 장치가 원래 실패 입력을 동일하게 검출하는지 실행하지 않는다.
- 고정 장치: 고정 없음 → J-T-004
- 출처: D01047, D01048, D01049, D01050, D01051.

### J-020 공통 부품 소유와 변경 경계

- 목표: 입력: 공통 파일을 고치는 두 작업의 허용 경로를 비교한다 → 기대: 한 파일의 변경·시험·장치 갱신은 인수한 한 담당자가 맡는다(D00977). 소비 화면 담당은 공통 파일을 별도로 고치지 않는다.  → 실패: 한 파일을 두 담당자가 동시에 변경하면 실패.
- 현재: kit/ARCHITECTURE.md:107의 Components 절은 공통 부품 경계를 설명하지만 kit/tools/check-deps.mjs:69는 import 경계만 검사한다.
- 차이: 한 파일에 겹친 담당 쓰기 권한과 인수 기록을 검사하는 저장소 자동 장치는 없다.
- 고정 장치: 고정 없음 → J-T-020
- 출처: D00977, D01051; 이번 부품 소유 표 요청.

| 변경 규칙·부품 | 변경 책임 역할 | 함께 고정할 것 | 영향 화면·인수 경계 |
|---|---|---|---|
| J-101/102/107, shell·app-frame·host·boot | 셸 담당 | 끝 스크롤·접힘·hover·native 경계 | 모든 탭·상세·AI·외부 도구 |
| J-105/109, data-table·kinds·resource-inspector | 표 담당 | kind·정렬·fit·열별 원본 | 직접 cell 콜백을 포함한 모든 표 |
| J-104/106, tokens·icons·status-icon | 디자인 토큰 담당 | 상태색·stroke·반경·역할 | 두 테마와 전체 소비자 |
| J-108, settings·settings-group·sidebar | 설정 담당 | 단일 카드·접힌 경계·키 조작 | 모든 설정 하위 페이지 |
| J-103, conn-view·source-checks·tool surfaces | 연결·출처 담당 | UID·실패·복구·포함/건강/열기 | 홈·메뉴·도구·설정·인시던트 |
| J-110/111, ai-run·hub·panel-engine·ref | 대화·근거 담당 | 같은 대화 ID·실패 보존·인용 성공·키 | 셸/탭 왕복, 저장·모델 입력 |
| J-112, states·glass·surfaces·layout·외부 검사기 | 품질 도구 담당 | 빈 입력·잘못된 화면·실패 종료 | 검사기 대역과 제품 화면 구분 |
| J-113, chart-card·chart-layer·페이지 갱신 | 차트 담당 | 빈/단일 입력·detach·초점·DOM 수명 | 홈·지표·리소스·인시던트 |
| J-114, menu·select·dialog·morph | 입력·팝업 담당 | form 제출·팝업 소유·선택 보존 | 설정·연결·시간 범위·코드 보기 |
| events-view.js, kit/CONTRACTS.md | 인수 합의 뒤 한 담당 | 이벤트 열·스크롤, AI refs와 공통 계약 | 과거 중복 소유; 절 분할만으로 파일 동시 변경 금지 |

## 되풀이된 회귀

각 항목의 공통 입력은 J-003과 원본 규칙의 상태·폭 조건이다. “원인 후보”는 재현으로 원인이 확정되지 않았다는 뜻이다. 현재는 코드 정적 확인, 과거 보고는 그 사본의 관측이다.
### J-101 세로 스크롤

- 목표: 입력: 긴 표·YAML·설정을 1280×240 창에서 End·PageDown·wheel로 내린다 → 기대: 내용이 칸보다 길면 마지막 행·페이저·마지막 설정 컨트롤까지 wheel과 키보드로 도달한다. 상세·AI·확대 카드에서도 헤더와 닫기 동작이 본문에 가려지지 않는다. 긴 이벤트/리소스 표·YAML·로그·설정을 열고 첫 화면과 scrollTop 최대 화면을 캡처한다. End·PageDown·wheel 후 마지막 요소가 실제 clip 영역 안에 보이고 클릭 가능해야 한다. 화면 밖 마지막 요소 0, 가로 스크롤의 세로 이동 차단 0, 중복 스크롤바 0이다. 기존 1280×240 반례도 유지한다. → 실패: 마지막 행·페이저가 clip 밖이거나 입력별 끝 도달이 다르면 실패.
- 원인: 원인 후보는 칸 여백·overflow와 탭 표시 변경이다. 스크롤 상자의 존재만 확인하면 마지막 행 가림과 native clip을 놓친다.
- 현재: H-004에서 1280×240 검사에 마지막 요소를 실제 clip 안까지 스크롤하는 단언을 추가했다. 실제 Electron의 화면별 끝 도달·입력 경로 결과는 [H-004 실행 판정](tasks.md#H-004-run)에 구분한다.
- 차이: 실제 데이터가 없는 작업면과 독립 화면 판정은 H-004-N1·H-009에 남는다. 프로그램 scrollTop 도달과 wheel·키보드 입력은 별도 증거다.
- 고정 장치: `kit/tools/check-regressions.mjs`의 readScrollEndInPage, `check-layout.mjs`의 1280×240 끝 도달, `check-surfaces.test.mjs`의 scroll_end_reaches_last_control_and_rejects_a_clipped_container.
- 출처: D00048, D00068, D00113, D00455, D00591, D00593, D01030. 제품 세부는 대응 원본 규칙과 적용한다.

### J-102 탭 스크롤과 더보기

- 목표: 입력: 상세·AI를 동시에 열고 마지막 구역 탭을 선택한 뒤 폭을 줄인다 → 기대: 구역 탭 줄에는 가로 스크롤·끝 흐림이 없다. 폭이 모자라면 뒤쪽 탭을 더보기 메뉴 하나로 접고 선택한 탭은 항상 보인다. 07:00 가로 스크롤 지시는 D01029로 대체한다. 1280·1680 창에서 1칸·상세·AI 동시 개방, 긴 탭 이름, 마지막 탭 선택, 폭 확대·축소를 검사한다. 탭 줄 scrollWidth≤clientWidth, 가로 scrollLeft 변화0, 활성 탭 hidden=false, 넘칠 때 더보기1개·전부 들어갈 때0개다. 메뉴 선택·Escape·키보드 복귀와 disabled 보존을 확인한다. 경계 폭 왕복에서 접힘 반복 진동0이다. → 실패: 활성 탭이 숨거나 가로 스크롤·끝 흐림·접힘 진동이 생기면 실패.
- 원인: 고정 탭 폭과 overflow에 의존한 구현이 좁은 칸에서 가로 스크롤을 만들었다. 현재 fold의 폭 측정·활성 탭 대체·경계 여유는 문자열 시험에서 실행되지 않는다.
- 현재: H-004에서 선택 탭이 교체 대상보다 넓으면 숨는 반례를 재현했다. 필요한 만큼 뒤쪽 탭을 접어 선택 탭 자리를 확보한다. 300·420·760 폭 왕복에서 활성 탭 표시와 넘침 없음이 자동 검증된다.
- 차이: 실제 메뉴 선택·Escape·초점 복귀 전체와 탭 하나조차 들어가지 않는 극단 폭은 J-T-102·H-009에 남는다.
- 고정 장치: `kit/tools/check-surfaces.test.mjs`의 folded_tabs_keep_a_wider_selected_tab_visible_across_resize; `check-layout.mjs`의 활성 탭·가로 넘침 검사.
- 출처: D01028, D01029. 제품 세부는 대응 원본 규칙과 적용한다.

### J-103 도구 상태 일치

- 목표: → [RULE-CHIPS](rules.md#RULE-CHIPS). 같은 Service UID의 일시 확인 실패는 연결 이력을 지우지 않는다. 새 UID에는 이전 연결·값을 승계하지 않는다. 열거 실패와 허브 건강은 동시에 표시한다;   인시던트 머리 칩은 추가 소비자로 검사한다. 실패 뒤 복구하면 여섯 곳이 같은 원본 상태로 돌아온다; 실패: 기존 도구가 사라지거나 새 UID가 옛 연결 receipt를 물려받으면 실패.
- 원인: 포함·건강·열기를 하나의 연결 상태로 취급하거나 열거 실패를 성공 빈 목록으로 바꾸면 표면별 불일치가 생긴다. 다른 UID의 receipt 승계도 별도 원인이다.
- 현재: H-002에서 새 UID 상세·설정 제외, 저장 기록의 미검증 열기 차단, timeout 오류 건수, 인시던트의 실패 시도 제외, 명시적 재시도, 이전 UID의 확인 이력 제외를 고정했다. 기존 행렬의 공통 함수 비교와 별도로 직접 기대값을 단언한다. 실제 Electron·클러스터 결과는 tasks의 H-002 판정을 따른다.
- 차이: J-T-103, TASK-CMP-REG-SOURCE, T-B-020. 실제 UID 교체·403·timeout은 H-002-N1이며 합성 반례 통과로 닫지 않는다.
- 고정 장치: `apps/wake/tool-surfaces.test.mjs`, `apps/wake/data/conn-view.test.mjs`, `apps/wake/desktop/reads/reads.test.cjs`. 실행 결과·캡처·원본은 H-002에 연결한다.
- 출처: D00999, D01000. 제품 세부는 대응 원본 규칙과 적용한다.

### J-104 아이콘 색과 굵기

- 목표: → [RULE-TONE](rules.md#RULE-TONE).
- 원인: 일반 아이콘 선택자의 색 상속은 소비 화면에서 같은 상태색을 덮어쓸 수 있다. 모션 시험은 계산된 색·stroke를 검사하지 않는다.
- 현재: H-004에서 statusIcon의 ok+text가 일반 정상 문구를 남기던 반례를 수정했다. 접근성 이름은 유지한다. 기존 작업 등급·검증 항목 이름은 subject로 구분하여 보존한다. 계산된 SVG 색 상속과 실제 stroke 값은 화면 원장에 기록한다.
- 차이: 실제 발생하지 않은 오류·경고 상태의 네이티브 모습과 독립 판정은 H-004-N1·H-009다. 모든 아이콘의 상태 토큰·굵기를 정적 검사 하나로 보장하지는 않는다.
- 고정 장치: `kit/components/status-icon.test.mjs`, action-compare·approval-head·verify-card 소비자 시험, `kit/tools/check-regressions.mjs`와 `check-surfaces.test.mjs`의 정상 문구·색 상속 검사.
- 출처: D01008, D01018. 정상은 아이콘만이며 숫자 정렬 결정은 색 규칙의 근거가 아니다.

### J-105 표 왼쪽 정렬

- 목표: → [RULE-SORT](rules.md#RULE-SORT). mono는 해시·ID 값 셀에만 적용한다. 이전 숫자 오른쪽 정렬 규칙을 새 단언으로 되살리지 않는다. text/number/status/time/mono와 옛 align:center/right·value·mono 인자를 조합해도 머리·값 computed text-align이 left 또는 start다;  모든 표의 직접 cell 콜백과 좁은 폭 숨김 후 첫·끝 열도 검사한다; 
- 원인: 과거 숫자 오른쪽 정렬·align 별칭과 최신 전체 왼쪽 정렬 계약이 충돌한다. 마크업의 클래스 제거만으로 실제 CSS 상속을 검사할 수 없다.
- 현재: H-004-R1의 check-layout과 실제 Electron 수집은 계산된 text-align과 같은 열의 머리 글자·셀 첫 보이는 내용의 left를 함께 비교한다. 2CSSpx 허용치는 1px 경계와 소수점 배치·글자 좌표 반올림을 포함하며 가운데 정렬을 허용하지 않는다. 뼈대에서 다른 부품으로 전환할 때 이전 inline style을 제거했다. 화면별 측정 셀 수를 기록하며 빈 표를 값 셀 검증으로 세지 않는다.
- 차이: 자료 없는 표의 실제 값·직접 cell 출력은 H-004-N1에 남는다. 기존 열 종류 단위 시험과 실제 셀 검사를 함께 유지한다.
- 고정 장치: `kit/tools/check-surfaces.test.mjs`의 `regression_probe_follows_contents_and_counts_empty_and_unmeasured_values`(display:contents의 보이는 자식 순회, 값 없음·미측정 분리); `kit/tools/check-regressions.mjs`의 계산값·첫 내용 기하 검사와 `check-surfaces.test.mjs`의 regression_probe_rejects_centered_content_with_left_text_align, morph_skeleton_to_status_keeps_first_visible_content_aligned 및 규칙별 독립 반례; `data-table-extras.test.mjs`의 열 종류 시험.
- 출처: D-USR-2026-11-16-1; D00049, D00387, D00393, D00447, D00454. 제품 세부는 대응 원본 규칙과 적용한다.

### J-106 반경과 동심 조건

- 목표: 입력: R16/p8과 R16/p20, 펼친 설정·접힌 사이드바를 표시한다 → 기대: 여백 p가 바깥 원형 반경 R보다 작을 때만 안쪽 반경 R−p를 적용한다; [RULE-PANE](rules.md#RULE-PANE);  옆 칸 행8px 원형과 설정 sg-card의 면·반경 유지/테두리 없음 예외를 보존한다. R16/p8의 안쪽8, R16/p20의 독립 승인 역할23을 별도 검사한다;.sb-row는8px 원형,.sg-card는 양 테마 테두리0이다. 토큰 식의 computed 값과 선택자 덮어쓰기를 검사한다; 
- 원인: 원형과 superellipse의 1.4배 값, 역할 반경과 동심 조건을 혼용한 것이 원인 후보다. p≥R에 R−p를 무조건 적용하면 안쪽 역할이 무너진다.
- 현재: 부분. `kit/tokens.css:70–71`과 `kit/components/app-frame.js:18–25`에 칸 역할이 있다. `kit/tools/check-surfaces.test.mjs:28–43`은 .sb-row 반경과 설정 이중 면 반례를 검사한다. 모든 p/R 조합과 native 네 모서리를 고정한 장치는 확인하지 못했다.
- 차이: J-T-106, TASK-CMP-REG-RADIUS, T-B-004. C1 clip-path·filter opacity minor도 검사기 한계로 남긴다.
- 고정 장치: `kit/tools/check-surfaces.test.mjs:32` — `the sidebar row keeps the side tone pixels: 8px circular`
- 출처: D01001, D01005, D01009, D01010, D01011, D01012, D01013, D01014, D01015, D01016, D01017, D01020, D01028. 제품 세부는 대응 원본 규칙과 적용한다.

### J-107 남는 호버

- 목표: 입력: 설정 행 hover 뒤 창 밖으로 나가고 다른 창 활성화 후 돌아온다 → 기대: 포인터가 창 밖으로 나가거나 창이 비활성화되거나 대상 내용이 교체되면 이전 hover 그림이 남지 않는다. 선택과 focus는 hover 제거 때문에 사라지지 않는다. 꺾쇠의 둥근 바탕은 꺾쇠 hover/focus에만 나타난다. 설정 행A hover→창 밖→행B 선택→창 복귀, 카드 머리→꺾쇠→창 밖, 활성 창 변경, 탭 전환·DOM 갱신을 수행한다. 실제 hover 대상 외 바탕0, 선택 행1, 키보드 focus 유지, 머리 전체 hover 때 꺾쇠 바탕0이다. 마우스 이동은 실제 창 경계를 넘겨 확인한다. → 실패: 이전 hover 바탕이 남거나 선택·키보드 focus가 지워지면 실패.
- 원인: 선택 상태·hover 상태·포인터 수명 관리의 혼선이 원인 후보다. 창 밖 입력과 native view 교체 재현 없이 CSS만의 결함으로 확정하지 않는다.
- 현재: kit/components/summary-bar.js:49·52·57은 hover 색을 CSS로 바꾸며 kit/desktop/main.cjs:910은 blur·show·restore 때 repaintSoon을 호출한다.
- 차이: 호스트 재그리기가 포인터 상태 초기화를 보장하지 않는다. 실제 창 밖 이동→복귀·view 교체를 재현하는 전용 시험은 없다.
- 고정 장치: 고정 없음 → J-T-107
- 출처: D00297, D01040, D01041. 제품 세부는 대응 원본 규칙과 적용한다.

### J-108 설정 이중 틀과 경계선

- 목표: 입력: 두 테마에서 사이드바를 접고 설정 하위 페이지를 왕복한다 → 기대: 설정 메뉴는 창 바탕에 있고 내용은 가운데 카드 하나다. 사이드바와 설정 메뉴 사이에 전체 높이 경계선과 여백을 둔다. 사이드바를 접으면 그 경계선은 없다. 카드의 네 변·네 모서리는 끊기지 않는다. 두 테마·두 폭, 사이드바 펼침/접힘, 설정 각 하위 페이지와 긴 목록에서 본문 카드1, 메뉴 자체 카드0, sg-card 테두리0을 확인한다. 외곽 경계선 끊김0, 안쪽 중복 틀0이다. 행 끝 컨트롤1개 규칙도 보존한다. → 실패: 본문 카드가 두 겹이거나 접힌 사이드바 자리에 경계선이 남으면 실패.
- 원인: app-frame 바깥 면과 settings 내부 카드·sg-card 경계가 중첩되는 경로가 원인이다. 단일 카드 검사와 전체 native 경계 검사는 다르다.
- 현재: 기존 단일 면 검사를 H-004 실제 설정 전 항목에 적용했다. 네이티브 사이드바 왕복에서 재열기 버튼이 뒤로 버튼으로 바뀌는 캐시 회귀를 찾아 morph에서 일반 요소로 바뀔 때 이전 부품 캐시를 지웠다. 추가 검사도 설정 본문 .cc-card 아래 sg-card만 대상으로 하며, 일반 상세 summary의 허용 경계선을 설정 회귀로 오인하지 않는다.
- 차이: 네이티브 전체 창의 접힌 사이드바·모서리와 독립 화면 판정 범위는 H-004 실행 판정 및 H-009를 따른다.
- 고정 장치: `kit/tools/check-surfaces.test.mjs`의 단일 면·sg-card 테두리 반례, `check-regressions.mjs`의 설정 경계선 검사; sidebar_toggle_survives_component_to_plain_button_round_trips의 3회 왕복 반례.
- 출처: D01015, D01020, D01028, D01035, D01036. 제품 세부는 대응 원본 규칙과 적용한다.

### J-109 한 셀의 상태 아이콘과 숫자 혼합

- 목표: 입력: Restarts=0과 9 (3m ago)를 760px 상세 표에 입력한다 → 기대: 열 kind는 text/number/status/time/mono 중 하나다. 숫자 셀에는 상태 아이콘을 넣지 않고, 위험 숫자는 tone만 바꾼다. 상태와 수가 둘 다 필요하면 열을 나눈다; [RULE-RESTARTS](rules.md#RULE-RESTARTS). Restarts0은 중립 숫자, Restarts>0은 숫자 tone만 적용하고 status-icon0이다. Ready 수와 Status를 분리한다. 모든 cell 콜백 출력까지 검사하며 값 문자열에 아이콘을 숨겨 통과시키지 않는다. `9 (3m ago)`는 상세760px·1680px에서 fit 후 한 줄로 전체 표시한다. 전문 열람으로 Restarts 잘림을 합격 처리하지 않는다. 현재 정책은 fit과 한 줄 유지의 동시 충족이다; 실패: 숫자 셀에 상태 아이콘이 붙거나 시간 부분이 잘리면 실패.
- 원인: 열 kind와 직접 cell 콜백의 의미가 달라 숫자에 상태 아이콘을 섞는다. Restarts 잘림은 fit 폭 측정의 별도 경계다.
- 현재: H-004는 실제 표의 숫자 셀 안 status-icon 유무를 검사하고 양 테마·두 폭의 Restarts를 캡처한다. 실제 값은 입력 원장에 한정하며 과거 9 (3m ago)와 동일한 입력을 만들지는 않았다.
- 차이: 760px 상세와 과거 정확한 값의 재현은 T-B-018에 남는다. 모든 cell 콜백에 대해 render가 혼합을 거부하는 계약은 아니며 실제 DOM 검사로 회귀를 검출한다.
- 고정 장치: `data-table-extras.test.mjs`, `check-regressions.mjs`의 숫자 셀 상태 아이콘 검사, `check-surfaces.test.mjs`의 직접 cell 혼합 반례.
- 출처: D01033, D01034, D01051. 제품 세부는 대응 원본 규칙과 적용한다.

### J-110 공급자 미설정 뒤 대화 보존

- 목표: 입력: 모델 없음 첫 질문 뒤 공급자 복구·후속 질문·재열기를 수행한다 → 기대: (기본값 채택, 번복 가능) OPEN-REG-003: 공급자 없이 보낸 최초 질문과 실패도 같은 대화 ID로 저장한다. 공급자를 연결해 후속 질문을 보내면 최초 질문이 모델 입력과 디스크 재조회에 남는다. 클라이언트 마지막 assistant를 저장 완료 경계로 추정하지 않는다. 새 격리 userData→모델 없음→최초 질문→실패→공급자 복구→같은 대화 후속 질문→모델 messages·저장 목록·재열기 대조에서 사용자 질문2개가 각각 정확히1회 남는다. 최초 실패 상태·원래 ID도 유지한다. 오래된 사본의 후속 질문, 공급자 도구 후속 호출 단절, falsey target 거절을 함께 유지한다. → 실패: 첫 질문·실패·대화 ID가 저장본이나 모델 messages에서 사라지면 실패.
- 원인: 수정 전에는 모델 미설정 분기가 record/convs.put 전에 반환했고, 후속 기록이 마지막 assistant 뒤의 질문만 취해 최초 질문을 버렸다.
- 현재: `apps/wake/desktop/ai-run.cjs:79,145,152`에서 저장본 없는 질문, 미설정 실패 저장, 실패를 포함한 모델 이력을 처리한다. H-001 회귀 3개가 변경 전 실패(exit 1), 변경 후 통과했다. 관련 4파일 27시험도 통과했고 오래된 사본·부분 답 단절·falsey target 거절을 유지했다.
- 차이: J-T-110의 최초 질문 유실 반례 이관은 완료했다. 격리 디스크·대역 공급자 범위이며 실제 설정 연결·재열기 화면은 H-009에서 확인한다. TASK-F-09·TASK-CMP-CHAT-SAVE의 나머지 저장 계약은 별도다.
- 고정 장치: `apps/wake/desktop/ai-target.test.cjs`의 `run_unconfigured_then_connected_preserves_questions_and_failure_on_disk_and_in_model`, `run_without_saved_history_preserves_users_before_client_assistant`, `run_conversation_write_failure_reports_storage_failure_without_done`.
- 출처: D-USR-2026-11-16-7; D01051. 제품 세부는 대응 원본 규칙과 적용한다.

### J-111 근거 인용의 성공 조건과 키보드

- 목표: 입력: n999 실패 조회와 유효 근거 조회 뒤 click·Enter·Space를 실행한다 → 기대: (기본값 채택, 번복 가능) OPEN-REG-004: 성공한 허용 읽기로 실제 얻은 근거만 이름표와 링크로 강화한다. 실패 get_evidence·읽지 않은 번호·다른 인시던트 번호는 읽은 근거처럼 표시하지 않는다. 같은 이름표의 click/Enter/Space는 같은 실제 근거 상세를 연다. 실패한 n999 조회 뒤 모델의 [1]은 근거 링크0, 성공 조회1개 인시던트만 원래 n·대상·기간·발췌에 연결한다; [RULE-EVIDENCE](rules.md#RULE-EVIDENCE). click/Enter/Space 각각 navigate1회, 동일 route·cluster·incident·n을 단언한다; 실패: 실패한 조회가 출처 칩이 되거나 키 입력이 같은 근거를 한 번 열지 못하면 실패.
- 원인: ai-run은 도구 호출 성공을 확인하지 않고 incident를 used에 넣는다. ref의 span role=button은 click 위임만으로 Enter/Space 활성화를 제공하지 않는다.
- 현재: 부분. `ai-run.cjs:96,153–155`는 호출 성공 여부를 확인하지 않고 incident를 used에 넣는다. `kit/components/ref.js:23–25`는 span role=button/tabindex를 만들지만 자체 키 활성화가 없다. B1 7차가 두 경계를 minor로 재현했으며 현재 코드 정적 확인과 별도로 native 재검증이 남았다.
- 차이: J-T-111, T-B-026. 실패 조회 반례와 실제 이벤트 위임 경로의 키보드 단언을 추가한다.
- 고정 장치: 고정 없음 → J-T-111
- 출처: D-USR-2026-11-16-7; D01051. 제품 세부는 대응 원본 규칙과 적용한다.

### J-112 검사기의 거짓 통과 방지

- 목표: 입력: 빈 디렉터리·누락 열·다른 화면·투명 메뉴를 검사기에 넣는다 → 기대: (기본값 채택, 번복 가능) OPEN-REG-001: 입력·화면·상태·열이 0개이거나 누락됐으면 성공으로 처리하지 않는다. 보고를 만드는 도구와 실패 종료를 보장하는 관문을 구별한다. 장치 자체에도 정상과 실패 반례를 둔다. 빈 디렉터리, tableCells 누락, 다른 화면, 누락 열, clip-path 부분/전체 잘림, filter:opacity(0), 스크롤바 겹침 반례가 실패한다. toolbar CSV의 결함 행이 1개 이상이면 관문도 실패한다. 누락은 합격 0건과 구별하고 기대 조합과 관측 조합의 차집합 0을 요구한다. → 실패: 입력 누락이나 결함 행이 있는데 관문이 exit 0이면 실패.
- 원인: 기대 입력 집합을 확인하지 않거나 결함을 CSV에만 쓰고 실패 종료하지 않는다. 수집 성공과 제품 합격을 같은 종료 코드로 해석한 것이 거짓 통과의 원인이다.
- 현재: `kit/tools/check-layout.mjs:25`는 화면 0개에 exit 0이다. 는 빈 입력에도 bad=[]로 성공하고 `toolbar-gaps.py`는 결함 CSV를 쓰지만 실패 종료하지 않는다.
- 차이: J-T-112, G-T-13, G-T-14. 코드·입력·실행 수준을 함께 검증하는 관문으로 보강한다.
- 고정 장치: 고정 없음 → J-T-112
- 출처: D-USR-2026-11-16-7; D00458, D01051. 제품 세부는 대응 원본 규칙과 적용한다.

### J-113 차트의 빈 입력과 수명 종료

- 목표: 입력: 빈·단일·null 시리즈와 활성 점을 둔 DOM에서 detach를 호출한다 → 기대: (기본값 채택, 번복 가능) OPEN-REG-005: 빈/단일/누락/중간 null/길이 불일치/max 0/all-hidden 입력에서 NaN 경로·없는 추이·값 없는 툴팁을 만들지 않는다. DOM을 유지한 채 활성 점에서 detach하면 hover·_point·툴팁·마커를 즉시 비우고 이후 이벤트는 동작하지 않는다. CMP-CHART-01~04의 정상 모양을 보존한다. → 실패: NaN 경로·없는 추이·잔존 툴팁·작동하는 후속 이벤트가 있으면 실패.
- 원인: 빈·단일 입력의 좌표 계산과 이벤트 해제만으로 끝나는 수명 정리가 서로 다른 경계다. 현재 detach 구현은 정리하지만 기존 시험은 빈 데이터로 바꾼 뒤 detach하여 활성 점 정리를 직접 고정하지 않는다.
- 현재: `kit/components/chart-card.js:1180,1434`는 clearPoint를 호출한다. `chart-card.test.mjs:175–207`은 경계 입력을 다루지만 detach 직전 활성 입력을 비운다.
- 차이: J-T-113. DOM 유지·활성 점·detach 직후의 반례를 별도로 추가한다. 현재 구현 결함이 재현됐다는 뜻은 아니다.
- 고정 장치: `kit/components/chart-card.test.mjs:59` — `chart_keyboard_legend_resize_data_update_and_detach`
- 출처: D-USR-2026-11-16-7; D00333, D01051; CMP-CHART-01~04의 기존 입력 계약.

<a id="J-114"></a>

### J-114 입력·팝업·사람이 바꾼 상태 보존

- 목표: 입력: form 안 select를 키보드로 열고 팝업·코드 접기 상태를 왕복한다 → 기대: (기본값 채택, 번복 가능) OPEN-REG-006: 실제 select 트리거의 click/Enter/Space는 선택만 바꾸고 form을 제출하지 않는다. 메뉴·하위 메뉴·종료 확인은 올바른 native view 위에서 입력을 받고 닫으면 원래 소유자에 초점을 돌린다. 코드 접기·나란히 보기·숨긴 줄과 대화 handoff는 재렌더·탭 왕복 뒤 유지한다. → 실패: 선택이 form 제출을 일으키거나 초점·접기 상태가 사라지면 실패.
- 원인: form 안 버튼의 기본 제출, 별도 WebContentsView의 쌓임 순서, morph의 속성 덮어쓰기, 셸 메모리만 참조한 대화 전달은 각각 다른 원인이다. 옛 작업 노하우의 관측을 한 CSS 결함으로 합치지 않는다.
- 현재: kit/components/dialog.js:190과 menu.js:396은 keydown을 처리하고 kit/core/morph.js:26·44는 속성·노드 갱신을 담당한다.
- 차이: 각 모듈의 입력 처리는 존재하지만 form 안 실제 select·native 메뉴 쌓임·morph 뒤 사용자 접기 상태를 한 흐름으로 검사하지 않는다.
- 고정 장치: 고정 없음 → J-T-114
- 출처: D-USR-2026-11-16-7; D01051; 옛 작업 노하우의 겪은 오류와 원인, SCR-KEYBOARD, SCR-NAV-RETURN.

### J-115 승인된 샌키 표현 보존

- 목표: 입력: sankey-review의 11개 상황을 같은 시계·테마·폭으로 연다 → 기대: B-031의 2026-11-13 승인 규칙을 상속한다; [RULE-SANKEY](rules.md#RULE-SANKEY);  그라데이션 흐름과 경고·실패의 동기화된 상태 모션을 유지한다; 실패: 띠 끝 틈·이름 말줄임·묶음 누락·경고 모션 비동기가 있으면 실패.
- 현재: 저장소 `design/sankey/sankey-review.html`이 `design/sankey/sankey-review.js:55–76`의 11개 상황을 연다. 재현 파일 존재는 확인했으며 이번 문서 교정에서 렌더 비교는 실행하지 않았다.
- 차이: G-T-07-SANK. 같은 테마·폭·시계의 전후 그림에서 띠 끝 틈·외곽선 단절·이름 잘림·묶음 누락이 하나라도 있으면 실패다.
- 고정 장치: 고정 없음 → G-T-07-SANK
- 출처: B-031; 2026-11-13 승인 메모; D00862, D00872 및 4차 사용자 지시.

<a id="J-116"></a>

### J-116 이전 작업에서 겪은 오류와 대처

- 목표: 아래 증상을 다시 재현한다 → 원인에 맞는 대처와 연결된 제품 규칙을 확인한다 → 증상이 남거나 다른 승인된 화면을 바꾸면 실패.
- 현재: 아래는 옛 작업 노하우의 과거 관측과 대처를 옮긴 기록이다. 파일명과 당시 해결 방법은 현재 구현·실행 합격의 증거가 아니다.
- 차이: J-114에 묶여 있던 원인을 개별 재현 단위로 보존한다. 각 항목의 현재 실행과 반례 고정 여부는 별도 확인이 필요하다.
- 고정 장치: J-001의 기준으로 각 행의 검사·소비 화면을 재확인한다. 전체 19개 반례를 실행한 장치는 없음 → J-T-116.
- 출처: 기존 작업 노하우의 정본 이관 요청.

| 항목 | 증상과 원인 | 대처·확인 경로 |
|---|---|---|
| J-116-01 | 대화상자 공통화 때 바탕이 투명해지고 버튼 테두리가 사라짐. CSS 통합 중 배경·테두리 토큰 유실 | 이전 코드를 복원하고 두 테마의 전후 화면을 비교한다. B-001·B-011·Q-009 |
| J-116-02 | 비활성 창에서 초점 고리가 사라짐. 창 초점을 잃으면 `:focus-visible`이 풀림 | dialog의 `[data-focus-visible]` 보존과 `doc.hasFocus()` 판단을 함께 확인한다. B-012 |
| J-116-03 | 하위 메뉴 아래 글자가 비치고 클릭이 페이지로 감. 별도 WebContentsView가 셸보다 위에 있음 | menu의 하위 메뉴도 `onOverlay`로 탭 위 덮개에 그린다. J-114 |
| J-116-04 | 종료 확인 창이 탭 뒤에 숨음. 다른 덮개가 소유권을 풀어 버림 | 연 소유자가 닫을 때까지 덮개 고정을 유지한다. J-114 |
| J-116-05 | 페이지 버튼을 눌러도 무반응. preload의 PAGE_TYPES에서 `page:action` 누락 | 페이지→셸 메시지를 bridge-protocol과 preload-page 허용 목록에 함께 등록한다. Q-010-ipc |
| J-116-06 | 문구 키가 그대로 보임. 사전과 호출 키가 불일치 | `check-locale.mjs`로 키를 대조한다. B-037 |
| J-116-07 | 권한 시트의 코드 블록이 붙고 부제 끝에 빈 구분점이 남음 | `.cb + .cb` 간격을 확인하고 부제의 빈 값을 거른 뒤 결합한다. B-025 |
| J-116-08 | 고정된 달 선택 때문에 다른 달의 작업 기록이 섞임 | 실제 기록에서 선택지를 만들고 선택한 달로 거른다. 설정에 남은 옛 선택값도 재현 입력에 포함한다. F-BE-012 |
| J-116-09 | 창마다 본문 폭이 달라 보임 | page-column 역할 폭을 적용하고 덮어쓰는 CSS를 찾는다. 폭의 값은 B-008에서 읽는다 |
| J-116-10 | 카드 외곽선이 잘림. 부모 overflow와 음수 여백이 원인 | 외곽선·그림자를 부모 여백 안에 두고 `check-layout.mjs`로 확인한다. J-106 |
| J-116-11 | 연결 단계의 세로 선·번호 체인·가운데 글이 잘리거나 회전 아이콘이 중복됨 | 승인된 행 끝 상태 하나를 쓰고 폐기한 stepper를 되살리지 않는다. B-010 |
| J-116-12 | 행 끝 굴러가는 글이 넘침. 바깥 상자의 inline 글이 잘림 판정을 받음 | `.fs-tx > span` 안쪽 글 상자가 말줄임을 맡는다. B-010·Q-010 |
| J-116-13 | AI 대화를 크게 연 탭이 비어 있음. 대화가 셸 메모리에만 있음 | 셸의 주소별 대화를 `shell:init`의 `handoff`로 보내고 페이지 `onHandoff`로 받는다. shell.js·page/boot.js·page/kinds/ai/chat.js, J-114 |
| J-116-14 | 코드 접기·나란히·숨긴 줄 펼치기가 재렌더 뒤 풀림. morph가 속성을 덮어씀 | 사람이 바꾼 상태는 `LIVE_CLASSES`의 `cb-folded`, `cb-seen`, `cb-one`, `cb-two`, `cb-shown`으로 보존한다. J-114 |
| J-116-15 | sticky 코드 머리 아래로 줄이 비침. 표면 토큰이 반투명 | framed file-viewer에서 불투명 `--cb-head-bg`와 상자 여백에 맞춘 `--cb-head-top`을 확인한다. B-025 |
| J-116-16 | 컨테이너 쿼리 경계에 토큰을 넣어 동작하지 않음 | 숫자 리터럴을 쓰고 `quality:literal` 주석에 이유를 단다. kit 주석은 영어다. Q-010 |
| J-116-17 | 입력 즉시 검색인데 돋보기와 실행 버튼이 함께 있음 | 실행 버튼을 없애고 composer `lead`와 `variant: 'wide'`를 쓴 당시 대처를 보존한다. 현재 검색 모양은 B-024가 소유하므로 옛 composer 배치를 복원하지 않는다 |
| J-116-18 | 검색 칸이 여러 줄로 늘어나 결과를 가림. combobox가 처음 좌표에 머묾 | menu combo의 결과를 다시 채울 때 입력 아래 위치를 다시 계산한다. B-024 |
| J-116-19 | 좁은 패널에서 표 크게 보기 버튼이 마지막 머리글을 가림 | `.reveal-host`·`.reveal`로 hover/focus에서만 보인다. 복사·고치기·진행 중 취소도 같은 패턴을 쓴다. B-012 |

<a id="J-117"></a>

### J-117 H-009 수정 1회차의 되돌림 금지

- 목표: 입력: 홈 지표 막대, 상세 머리, 검색칸 메뉴, kit/core 도우미를 [Q-H079~Q-H083](quality.md#Q-H079)의 입력으로 연다 → 기대: 각 고정 시험이 통과한다 → 실패: 정상 체크 하나만 있는 지표 칸, 넘음과 어긋난 값, 상세 상태 두 번, 검색칸까지 스크롤되는 메뉴, 부품 등록의 temporal-chart, token-source.mjs가 돌아오면 실패.
- 현재: [H-009 수정 1회차](tasks.md#H-009-fix-1)의 6건.
- 차이: 실제 클러스터 화면 판정은 사용자 확인으로 남는다.
- 고정 장치: apps/wake/pages/cluster-home.test.mjs, apps/wake/pages/resource-pages.test.mjs, kit/components/menu.test.mjs, kit/core/temporal-chart.test.mjs, kit/core/pane.test.mjs, kit/tools/raw-values.test.mjs의 Q-H079~Q-H083 시험.
- 출처: 2026-11-17 사용자 실제 앱 검수.

<a id="J-118"></a>

### J-118 H-009 수정 2회차의 되돌림 금지

- 목표: 입력: Pod 상세 요약의 지표 막대, 다중 선택·검색칸 메뉴를 [Q-H084~Q-H085](quality.md#Q-H084)의 입력으로 연다 → 기대: 각 고정 시험이 통과한다 → 실패: 이름과 값만 남는 닫힌 지표 막대, 고정 폭 아닌 칸의 좁은 칸 숨김, 전체 선택·해제 글 링크, 메뉴 위의 채운 검색 상자가 돌아오면 실패.
- 현재: [H-009 수정 2회차](tasks.md#H-009-fix-2)의 3건.
- 차이: 실제 클러스터 화면 판정과 메뉴 클릭·키보드 동작은 사용자 확인으로 남는다.
- 고정 장치: apps/wake/pages/resource-pages.test.mjs, kit/components/summary-bar.test.mjs, kit/components/menu.test.mjs, kit/components/select.test.mjs의 Q-H084~Q-H085 시험.
- 출처: 2026-11-17 사용자 요청.

<a id="J-119"></a>

### J-119 범위 검색 상자의 되돌림 금지

- 목표: 입력: 클러스터 화면 여덟을 [Q-H086~Q-H089](quality.md#Q-H086)의 입력으로 연다 → 기대: 각 고정 시험이 통과한다 → 실패: 화면별 검색 칸·namespace 고르기·리소스 종류 고르기가 돌아오거나, 상자 안 기간(v3: 기간은 상자 바로 아래 제 줄), 화면을 옮길 때 사라지는 종류·namespace, 다른 화면으로 넘어가는 글, Deployment 범위에서 빠지는 Pod 이벤트, 셸이 늦게 준 범위에서 빈 관계가 돌아오면 실패.
- 현재: [H-009 범위 검색 상자](tasks.md#H-009-scope).
- 차이: 좁은 폭에서 기간이 한 칸으로 접히는 것은 견본(820px)에서만 기계 확인했고 실제 앱은 1168px 한 폭이다.
- 고정 장치: apps/wake/pages/scope-pages.test.mjs, apps/wake/data/scope.test.mjs, apps/wake/data/index.test.mjs, apps/wake/desktop/incident-hub.test.cjs의 Q-H086~Q-H089, Q-H091~Q-H092 시험.
- v3(2026-11-17): 기간이 상자 안(composer end)으로 돌아오거나, 홈 지표 줄 안에 "클러스터 전체" 칸이 돌아와 1060px 아래에서 임계값 칸을 밀어내거나, 두 고르기 메뉴가 서로 다른 모양이거나 수가 읽지 않은 값이면 실패([Q-H091](quality.md#Q-H091), [Q-H092](quality.md#Q-H092)).
- 출처: D-USR-2026-11-17-1~5, D-USR-2026-11-17-6~10.

<a id="J-120"></a>

### J-120 샌키 띠 읽기 위치의 되돌림 금지

- 목표: 입력: [Q-H090](quality.md#Q-H090)의 입력 → 기대: 고정 시험이 통과하고 sankey-review 11개 상황의 포인터 없는 그림이 바뀌지 않는다(J-115) → 실패: 띠의 읽기가 띠 상자(getBoundingClientRect) 기준으로 돌아오거나, 같은 띠 위 이동에 읽기가 닫혔다 열리거나, 노드 읽기가 타일을 떠나면 실패.
- 현재: [H-009 샌키 읽기 위치](tasks.md#H-009-sankey-tip).
- 차이: 실제 클러스터 홈 화면 판정은 사용자 확인으로 남는다.
- 고정 장치: kit/components/flow-graph-relation.test.mjs의 Q-H090 시험.
- 출처: 2026-11-17 사용자 실제 앱 지적.

<a id="J-121"></a>

### J-121 출시 검수 수정 1차의 되돌림 금지

- 목표: 입력: [Q-H093](quality.md#Q-H093)의 입력 → 기대: 고정 시험이 모두 통과한다 → 실패: 로그 구역의 읽기 거절, 묶음 합이 맞지 않는 수준 수, 원인 없는 실패 줄이나 실패를 0으로 표시, 한 글자에 두 줄이 되는 범위 상자, 좁은 폭에서 사라지는 상태 칸·식별 열, 누적 count로 센 구간 발생, minReplicas HPA의 경고, 확인 전으로 남는 자동 동기화, 소유 Pod Event가 빠진 워크로드 이벤트, 개발 용어 문구, ReplicaSet 없는 Deployment 흐름, 탭끼리 덮어쓰는 범위, 빈 범위로 바뀐 관계 실패, 다시 그리며 잃는 메뉴 입력, 창 밖으로 넘치거나 목록이 스크롤되지 않는 제자리 하위 메뉴, 심각도 수의 상태색, 접두사 메모리 질의, 수집 완료로 기록된 근거 실패가 돌아오면 실패.
- 현재: [출시 검수 수정 1차](tasks.md#release-qa-fix-1).
- 차이: 잠긴 파일 몫(events-view.js 열 우선순위, 다른 구역의 범위 실패 표시)은 [J-123](#J-123)에서 고정했다. 실제 앱 검수의 나머지는 같은 절의 남은 작업이다.
- 고정 장치: 같은 절 표의 시험 이름.
- 출처: 2026-11-17 출시 검수.
<a id="J-122"></a>

### J-122 갱신 경로 부하의 되돌림 금지

- 목표: 입력: [Q-H097](quality.md#Q-H097)의 입력 → 기대: 고정 시험이 모두 통과한다 → 실패: 한 갱신에서 같은 목록을 두 번 읽음, 클러스터 동시 요청 상한 없음, 진행 중에 다음 갱신을 쌓음, 숨은 문서의 읽기, 흔들지 않은 첫 갱신·재시도나 실패 뒤 같은 간격, 행마다 범위 관계 재계산, 타임라인 표시마다 행 훑기, 한 프레임 안 여러 번 그림이 돌아오면 실패.
- 현재: [H-009 갱신 경로 부하](tasks.md#H-009-refresh-load).
- 차이: 리소스 상세·GitOps 폴링과 실제 끊김·복구는 같은 절의 남은 것이다.
- 고정 장치: 같은 절의 시험 이름.
- 출처: 2026-11-17 갱신 경로 부하 지시, 검토 C-06·C-07·C-08.
<a id="J-123"></a>

### J-123 출시 검수 수정 2차의 되돌림 금지

- 목표: 입력: [Q-H098](quality.md#Q-H098)의 입력 → 기대: 고정 시험이 모두 통과한다 → 실패: 좁은 폭에서 접히는 이벤트 Object·Count·First Seen, 빈 목록으로 바뀐 네트워크·GitOps·이벤트의 관계 실패, MiB/s로 고정된 대역폭 축, 출처가 말하지 않은 보관 기간, 한 화면 안에서 다른 Warning 수, 관련 탭의 필드 이름·섞인 머리 말·중복 제목, 빈 알약으로 잘리거나 머리 밖으로 나가는 구역 탭, 모델 없이 실행 가능한 노력 메뉴, 줄·칸 없는 YAML 오류, 켜진 지원하지 않는 알림 스위치, 열린 대화를 덮어쓴 복제 탭, ISO 그대로인 시각, 성공 읽기 뒤에 남는 끊김, 글자뿐인 설정 안내, 빈 몸통의 카드, 복원에서 사라지거나 원시 id인 도구 탭, 시작 주소로 열리는 새 탭 시작, 뒤로·점 없는 마지막 첫 실행 단계, 아이콘 없는 클러스터 문맥 메뉴, 이름 없는 대화 "…" 단추, 이유 없이 비운 필수 칸, "undefined"이거나 설정·구역을 못 찾는 팔레트, package.json MIME·Invalid URL 콘솔 오류, 패키지에 든 시험·spec·시뮬레이션·검수 그림, 이어 붙은 답 목록 줄이 돌아오면 실패.
- 현재: [출시 검수 수정 2차](tasks.md#release-qa-fix-2).
- 차이: B-18 토스트 자리, 팔레트 빈 상자 높이, 820px 이벤트 표의 가로 스크롤은 같은 절의 남은 것이다.
- 고정 장치: 같은 절 표의 시험 이름.
- 출처: 2026-11-17~18 출시 검수 A·B·F1.

<a id="J-135"></a>

### J-135 출시 검수 수정 4차(화면)의 되돌림 금지

- 목표: 입력: [Q-H115](quality.md#Q-H115)의 입력 → 기대: 고정 시험이 모두 통과한다 → 실패: [RULE-SANKEY](rules.md#RULE-SANKEY)의 이름 자리를 어긴 이름(두 줄로 들어갈 때), apiVersion·kind 없는 YAML, 아이콘만인 상태 칸의 선언 폭과 끝이 잘린 생성 이름, 자리가 있는데 숨는 지표 칸이나 임계값보다 먼저 남는 기간 최고, 값과 겹치는 지표 이름, Pod 흐름까지 덮는 "클러스터 전체 값", 부분 조회의 "전체 N줄", 선과 다른 범례 색, 정수로 반올림한 KiB/s, 좁은 이벤트 표의 시각 두 칸, 상태 없는 Pod 관련 Deployment·Node, Pod 관계 그래프의 "Running" 값, false/False 섞임, 열린 인시던트 0인데 펼친 카드, namespace 범위의 모든 Node, "1,000m", 좁은 축의 시각 하나, 빠진 ConfigMap·Secret 관계, 큰 아이콘 이벤트 빈 상태.
- 현재: [출시 검수 수정 4차 (화면)](tasks.md#release-qa-fix-4-screen).
- 차이: 같은 절의 남은 것.
- 고정 장치: 같은 절 표의 시험 이름, sankey-review 11상황 전후 그림 비교.
- 출처: 2026-11-18 출시 검수 A3.

<a id="J-137"></a>

### J-137 출시 검수 수정 5차의 되돌림 금지

- 목표: 입력: [Q-H117](quality.md#Q-H117)의 입력 → 기대: 고정 시험이 모두 통과한다 → 실패: 없어진 경로(start 등)로 복원된 탭, "missing locale key"(브랜드·모델 이름·첫 실행 단추), 에이전트 화면에 없는 흐름 상태나 미공개 이미지의 설치 단추, 다시 읽을 때 "확인 중"으로 돌아가는 설정, 홈 경고 표에서 Message보다 먼저 접히는 Object, 상한까지 읽은 상세 로그의 "전체", namespace 범위의 다른 Node 이벤트와 목록과 다른 메뉴 수, 수 세기 말 첫 실행 설명, 단계마다 다른 첫 실행 폭이나 설명 줄로 움직이는 머리, 칸이 비어도 켜진 연결과 예시 이름, 좁은 표에서 가려지는 probe, 날짜 눈금 옆만 빠진 축, 처음 값에 머무는 도구 상세, 밝은 띠의 경계선 앞 가장자리, 다시 그린 뒤 줄 밖 "+N"이나 임계값보다 먼저 남는 기간 최고, 잠긴 스위치·회색 행으로 보이는 지원 안 하는 기능, 한 열 안 다른 소수 자리, 클러스터 없을 때 빈 클러스터 구역, ⌘K의 같은 대화 두 줄, 재시작 없는 Pod 목록 도구 행이 돌아오면 실패.
- 현재: [출시 검수 수정 5차](tasks.md#release-qa-fix-5).
- 차이: 같은 절의 남은 것.
- 고정 장치: 같은 절 표의 시험 이름, sankey-review 11상황 전후 그림 비교.
- 출처: 2026-11-18 출시 검수 R4.

<a id="J-138"></a>

### J-138 출시 검수 수정 6차의 되돌림 금지

- 목표: 입력: [Q-H118](quality.md#Q-H118)의 입력 → 기대: 고정 시험이 모두 통과한다 → 실패: 알림 대상·범위·감지·상세 링크가 수집 대상(exporter) Pod를 가리키거나 서로 다른 대상, 거른 줄 수로 판단한 로그 상한, 보이는 줄과 다른 로그 바닥 범위, 상세와 다른 도구 목록 "확인" 시각이나 다시 읽지 않는 목록, 번역한 글을 다시 키로 찾는 "missing locale key", 화면마다 다른 "읽기만" 아이콘, 관찰 콜백 안에서 배치를 쓰는 셸 터미널·노력 이름 상자·탭 접기, 다른 설정 선택과 다른 "작업 알림" 트리거가 돌아오면 실패.
- 현재: [출시 검수 수정 6차](tasks.md#release-qa-fix-6).
- 차이: 같은 절의 남은 것.
- 고정 장치: 같은 절 표의 시험 이름.
- 출처: 2026-11-18 출시 검수 R5.

<a id="J-136"></a>

### J-136 출시 검수 수정 4차(흐름)의 되돌림 금지

- 목표: 입력: [Q-H116](quality.md#Q-H116)의 입력 → 기대: 고정 시험이 모두 통과한다 → 실패: meta() 없는 화면, 찾기 뒤 같은 동작 단추 둘, 위험 확인의 첫 초점이 위험 단추, 대화상자 단어 중간 줄바꿈, 클립보드 실패에도 "복사했습니다"이거나 닫기 전에 사라지는 새 토큰, 흐르던 답과 다르게 그려지는 다시 연 대화(펼친 단계·시각·칩 없음), 내부 코드가 든 출력 칸, 경로 낱말(_all·events) 터미널 제목이나 제목과 다른 셸 namespace, 원문 조각을 자른 미리보기, 화면·저장 답의 도구 id, 말줄임 없이 끊긴 대화 제목, 화면마다 다른 시각 형식, 값 없는 선택 이름, 같은 이름의 여러 단추, "github" 원시 id, "New Tab", ⌘K에 없는 도구, 옆 칸으로 넘치는 답 표 칸이 돌아오면 실패.
- 현재: [출시 검수 수정 4차 (흐름)](tasks.md#release-qa-fix-4-flow).
- 차이: 같은 절의 남은 것.
- 고정 장치: 같은 절 표의 시험 이름.
- 출처: 2026-11-18 출시 검수 B3.

<a id="J-134"></a>

### J-134 출시 검수 수정 3차(흐름)의 되돌림 금지

- 목표: 입력: [Q-H114](quality.md#Q-H114)의 입력 → 기대: 고정 시험이 모두 통과한다 → 실패: 공개되지 않은 에이전트 이미지로 Helm을 부르거나 그 설치 명령을 복사하게 함, 화면만 막고 메인 프로세스가 실행함, 대상 없는 터미널이 코드(TERMINAL_UNAVAILABLE)만 보이거나 앱 한글이 터미널 칸에 벌어짐, 페이지 단추의 대화상자가 열리지 않거나 가림막이 그 뷰만 덮음, 새 대화가 재시작 전까지 목록에 없거나 "새 대화"로 남음, 다시 연 탭의 뒤로가 빈 몸통, AI 칸 옆 본문의 서비스가 target으로 거절됨, 찾기 실패가 화면 상태를 덮음, 범위 밖을 RBAC 거절이라 함, 답 시각이 UTC 그대로, 멈춘 답이 말없이 끝나거나 단계가 실패로, 답 표 칸 겹침, ⇧⌘A가 전체 팔레트, AI 칸이 열리면 터미널 비활성, 이름 없는 설정 스위치·선택, 좁은 칸에서 넘치는 결과 알약, 복사뿐인 에이전트 권한 필요, "보내기"인 멈춤 단추, 밝은 첫 실행의 안 보이는 점·카드, 창 가운데 토스트, Enter 대기 중 응답 기다리는 중이 돌아오면 실패.
- 현재: [출시 검수 수정 3차 (흐름)](tasks.md#release-qa-fix-3-flow).
- 차이: 같은 절의 남은 것.
- 고정 장치: 같은 절 표의 시험 이름.
- 출처: 2026-11-18 출시 검수 B2.

<a id="J-133"></a>

### J-133 출시 검수 수정 3차의 되돌림 금지

- 목표: 입력: [Q-H113](quality.md#Q-H113)의 입력 → 기대: 고정 시험이 모두 통과한다 → 실패: 한 화면 안에서 다른 모집단의 Warning 수나 누적 수를 구간 수처럼 보임, 같은 대상·Reason의 다른 Event를 합침, 단위 없는 Pod 네트워크 축, 상세 옆에서 읽을 수 없게 좁아진 목록 칸, clip 표의 가로 스크롤, 차이 실패의 "파일 0", 같은 값의 data-time-zone·data-theme 다시 쓰기, 첫 방문 때 모듈 그래프를 걷는 문서 응답, 반올림한 Age, 자동 치유를 따로 센 동기화, 원인 없는 지표 실패, 자릿수가 흔들리는 비율, 문제 먼저 정렬한 트래픽 상위, 관측 없는 추측 띠, 표시 위의 지금 선, 단어 중간 줄바꿈, 수 없는 RS 띠, 빠진 표본의 낙폭, 두 번 나오는 찾기 단추, "설정" 경로, 화면마다 다른 OpenCost 연결 상태, 상한까지 읽은 줄을 "전체"라 부름, 정확한 이름이 뒤에 오는 검색, 세 번 나오는 지연 카드 이름·4000ms 축, 첫 컨테이너만의 Pod 지표, 카드 구분선보다 넓은 표 줄 선이 돌아오면 실패.
- 현재: [출시 검수 수정 3차](tasks.md#release-qa-fix-3).
- 차이: 같은 절의 남은 것.
- 고정 장치: 같은 절 표의 시험 이름.
- 출처: 2026-11-18 출시 검수 A2.

<a id="J-131"></a>

### J-131 출시 직전 백엔드 마무리의 되돌림 금지

- 목표: 입력: [Q-H111](quality.md#Q-H111)의 입력 → 기대: 고정 시험이 모두 통과한다 → 실패: 닫히는 탭의 호출이 다시 sender not allowed로 거절되거나, 워크로드 지표가 Pod마다 읽거나 상한을 두거나, 클러스터에 쓰는 선언 명령이 Enter 없이 실행되거나, 페이지·확인 없는 요청이 연결 설정 파일을 바꾸거나 링크를 따라가거나, 상세·GitOps·출처 확인이 watch가 살아 있는데도 주기 GET을 보내거나, 셸 연결 확인이 2분보다 자주 돌거나, 교체된 Pod로 질의 다리가 열리면 실패.
- 현재: [출시 직전 백엔드 마무리](tasks.md#release-backend).
- 차이: 같은 절의 남은 것.
- 고정 장치: 같은 절 표의 시험 이름.
- 출처: 2026-11-18 갱신 경로·보안 검토의 남은 항목.

<a id="J-130"></a>

### J-130 출시 직전 화면 다듬기의 되돌림 금지

- 목표: 입력: [Q-H110](quality.md#Q-H110)의 입력 → 기대: 고정 시험이 모두 통과한다 → 실패: HTML·링크를 그대로 그리거나 표·목록·코드를 날것으로 보이는 답, 지표 줄 없는 워크로드·Node 상세, Pod 수를 두 번 말하는 Node, Ready·cordon 없는 Node 머리, 사용량도 원인도 없는 PVC, 길이 없는 비용·에이전트, 머리를 가리는 토스트, 개발 용어·자리 표시 문구, 820px 이벤트 표의 가로 스크롤, 다른 모집단의 알약·메뉴 수, 줄마다 다른 첫 구분선, Secret을 고르는 범위 메뉴, 원 덧댄 상표 마크, 선언하지 않은 명령 글을 터미널에 보냄이 돌아오면 실패.
- 현재: [출시 직전 화면 다듬기](tasks.md#release-polish).
- 차이: A-30·A-32와 실제 앱에서 재현하지 못한 경로는 같은 절의 남은 것이다.
- 고정 장치: 같은 절 표의 시험 이름.
- 출처: 2026-11-18 사용자 결정과 출시 검수.

<a id="J-124"></a>

### J-124 watch 공유 캐시의 되돌림 금지

- 목표: 입력: [Q-H102](quality.md#Q-H102)의 입력과 같은 조건의 실제 앱 60초 측정 → 기대: 고정 시험이 모두 통과하고 리소스(모든 종류)·이벤트 구역의 클러스터 목록 GET이 연결 확인 밖에서 0, IPC 바이트가 변화량에 비례한다 → 실패: 화면이 다시 주기적으로 kube.list·events.read 전체를 읽거나, 차이 대신 목록 전체를 매번 밀어 주거나, 한 문서의 차이가 모든 창으로 방송되거나, 구독이 끝난 watch가 남거나, 410·watch 403에서 멈추거나 폭주하거나, 이벤트 캐시가 상한 없이 자라거나, 로그 따라가기가 창 전체·Pod GET 두 번으로 돌아오거나, Secret 값·값을 담은 주석이 IPC로 나가면 실패.
- 현재: [갱신 경로 2차](tasks.md#H-009-watch-cache).
- 차이: 같은 절의 남은 것.
- 고정 장치: 같은 절의 시험 이름.
- 출처: 2026-11-18 소유자 우선순위(통신 줄이기), 백엔드·보안 검토.

## 고정 없음과 남은 작업

아래는 반복 회귀의 공백이다. 그 밖의 모든 원본 규칙 공백은 다음 요약 표의 “고정 없음”, “선언·점검만”, “상속·부분” 및 파일·부분의 원본 차이에서 찾는다. 작업 ID는 인계 식별자이며 tasks.md 등록이나 구현 완료를 뜻하지 않는다.

| 작업 ID | 고정하지 못한 조건 | 완료할 때 필요한 증거 |
|---|---|---|
| J-T-001/002/004/020 | 규칙별 반례·동반 변경·이관 동등성·단일 소유 | 변경 ID/소유/장치/소비 화면 누락 0 |
| J-T-003/112 | 입력 0건·잘못된 화면·누락 열·CSV 결함의 거짓 합격 | 정상은 통과, 각 누락·결함은 실패 종료 |
| J-T-101 | 모든 페이지의 마지막 요소 도달과 native clip | wheel·End·PageDown 뒤 마지막 요소 클릭 |
| J-T-102 | 실제 폭의 접힘·더보기·활성 탭·경계 왕복 | ResizeObserver와 실제 DOM 폭 입력 |
| J-T-103 | 여섯 표면+인시던트의 원본 상태·복구 | 같은 UID 실패와 새 UID 교체를 독립 기대값에 대조 |
| J-T-104 | 모든 소비자의 상태색·굵기·크기 | computed 값과 승인 캡처 |
| J-T-105 | [RULE-SORT](rules.md#RULE-SORT)의 실제 화면 대조 | 직접 cell·숨김 열을 포함한 계산 스타일 |
| J-T-106/108 | 동심 조건·native 네 모서리·접힌 설정 경계 | 역할별 반경과 겹친 면·경계 비교 |
| J-T-107 | 실제 창 밖 포인터·비활성·복귀 hover | 선택·키보드 focus를 유지한 native 입력 |
| J-T-109 | 숫자 셀 아이콘 금지·Restarts 최장값 폭 | 760/1680 상세의 원본 문자열과 실제 셀 |
| J-T-110 | 최초 무모델 실패 질문의 저장·복구·재열기 | 같은 ID·사용자 질문 2개가 모델/디스크에 각각 1회 |
| J-T-111 | 실패 근거의 링크 금지·키 활성화 | 성공/실패 조회와 click/Enter/Space 각각 1회 |
| J-T-113/114 | 활성 점 detach·form·native 팝업·재렌더 상태 | 실제 진입 경로와 즉시 상태 단언 |
| J-T-116 | 이전 오류 19개의 현재 재현과 대처 보존 | J-116 각 행의 정상·실패 입력과 실제 소비 화면 |
| J-T-030 | 진행 지시·질문·문맥이 부족한 지적을 제품 승인으로 바꾸지 않는 분류 | 해당 입력의 분류와 실제 규칙 대응 |

### J-041 작업 지시의 적용 범위

- 목표: 입력: 과거 진행 지시·경로 전달·정지 지시를 현재 작업 범위와 비교한다 → 기대: “진행해”, 경로 전달, 작업 순서·모델·언어·보고 요청은 당시 작업의 범위로 해석한다. 지금의 제품 동작 승인이나 멈춘 실행의 재개 권한으로 바꾸지 않는다. → 실패: 일회성 지시가 새 제품 승인이나 재개 권한으로 쓰이면 실패.
- 현재: [C-SOURCE](constitution.md#C-SOURCE)가 실행 지시·진행 질문·외부 분석 의뢰를 제품 승인과 분리한다. 제품 코드에는 이 해석을 자동 판정하는 경로가 없다.
- 차이: 원천의 일회성 지시가 제품 목표에 들어갔는지 분류하는 자동 검사는 없다.
- 고정 장치: 고정 없음 → J-T-030
- 출처: D00001, D00004, D00005, D00435, D01045, D01046, D01052.

### J-042 질문·붙여넣은 보고·외부 비교의 효력

- 목표: 입력: 질문·외부 URL·붙여넣은 PASS 보고의 원문과 후속 결정을 읽는다 → 기대: 질문, 외부 제품 URL, 붙여넣은 PASS·FAIL·제안은 그 자체로 구현 완료나 새 제품 요소의 승인이 아니다. 제품 조건이 명확하면 실제 규칙에 연결하되 원문 성격과 후속 번복을 함께 적용한다. → 실패: 독립 승인 근거 없이 질문이나 보고를 완료·승인으로 바꾸면 실패.
- 현재: spec/constitution.md:9는 질문·과거 PASS·직접 요구의 효력을 구분하고 kit/tools/check-tests.mjs:35는 제품 시험만 실행한다.
- 차이: 과거 보고의 PASS를 새 규칙 승인으로 잘못 연결하는 경우를 제품 시험 실행기는 판별하지 않는다.
- 고정 장치: 고정 없음 → J-T-030
- 출처: D00008, D00009, D00458, D00785, D00967, D01051.

<a id="J-043"></a>

### J-043 이미지·문맥이 부족한 지적

- 목표: 입력: 대상을 식별할 그림 없이 이것·아니만 남은 지적을 이관한다 → 기대: 이미지 없이 “이것”, “아니”만 남은 지적은 원본 대상 확인 전 임의 픽셀·배치·문구 목표로 확장하지 않는다. 이미 특정한 화면 규칙은 보존하고 확인이 필요한 조건만 미해결로 둔다. → 실패: 임의 픽셀·문구·배치를 승인 목표로 덧붙이면 실패.
- 현재: D00022의 이미지 질문은 비규칙으로 처리했다. 제품 코드로는 누락된 원본 그림의 대상을 복구할 수 없다.
- 차이: 원본 그림·앞뒤 메시지가 없는 지적의 픽셀·대상을 확정할 근거가 없어 해당 목표는 미해결로 유지해야 한다. D00350/A00188의 “이거”는 이미지 미복원·대상 미확정이다. 원본 이미지와 앞뒤 문맥으로 삭제 대상·위치가 식별되고 전후 화면에서 제거를 확인하기 전까지 삭제 반영 완료로 집계하지 않는다.
- 고정 장치: 고정 없음 → J-T-030
- 출처: D00022, D00229, D00236, D00350, D01051.

## 규칙 ID별 고정 장치 요약

표의 숫자 범위는 같은 접두사·자리수의 연속 ID만 포함한다. 예를 들어 `CMP-K-PODS-C001~C003`은 정확히 세 열이다. 모든 행에 J-001~004를 적용한다. 장치의 세부 시험 이름·반례·원래 차이는 원본 규칙에서 읽는다. 동일 파일·장치·판정·상속 관계만 묶었으며 다른 조건의 실행 결과는 상속하지 않는다.

`K/`는 `kit/`, `A/`는 `apps/wake/`, 는 지정 원천의 이다. 표의 파일 경로는 장치 존재를 뜻하고 통과를 뜻하지 않는다. “고정 없음”은 원본의 명시 공백 또는 구체 장치 미식별이며, 외부 보고 파일은 시험 단언으로 세지 않는다. 열은 해당 표의 부모 장치를 상속하되 정렬·동점·문제 우선·검색·행 이동의 전수 시험을 확보한 것으로 세지 않는다.

입력 문서 159개, 제품·검증 규칙 1994개. tasks·README·결정 출처 앵커는 작업/색인으로 전부 읽되 제품 규칙 수에서 제외한다. 입력 묶음 SHA-256: `220cd8856c83abfda71ff026164465c69b516aea5c613e3c259f55237a206e42`.

| 원본 파일 | 규칙 ID | 장치 유무 | 현재 장치·상속 |
|---|---|---|---|
| [architecture.md](architecture.md) | F-ARC-STATE | 파일·부분·공백 | `A/data/conn-view.test.mjs`, `A/data/live.test.mjs`, `A/desktop/reads/reads.test.cjs` |
| [architecture.md](architecture.md) | F-ARC-001 | 파일·부분·공백 | `A/desktop/hub.test.cjs`, `A/desktop/services.test.cjs`, `K/tools/check-deps.mjs`, `K/tools/check-ipc.mjs` |
| [data-policy.md](data-policy.md) | DP-CLASS | 파일·부분 | `A/desktop/data-policy.test.cjs`, `A/desktop/hub-store.test.cjs` |
| [data-policy.md](data-policy.md) | DP-NEVER | 파일·부분 | `A/desktop/data-policy.test.cjs`, `A/desktop/hub-review.test.cjs`, `A/desktop/tool-items.test.cjs` |
| [data-policy.md](data-policy.md) | DP-LIFE | 파일·부분·공백 | `A/desktop/data-policy.test.cjs`(화면·흐름 연결은 고정 없음) |
| [data-policy.md](data-policy.md) | DP-ITEMS | 파일·부분·공백 | `A/desktop/tool-items.test.cjs`(실제 도구 응답은 고정 없음) |
| [data-policy.md](data-policy.md) | DP-REVIEW | 파일·부분 | `A/desktop/hub-review.test.cjs` |
| [architecture.md](architecture.md) | F-ARC-002 | 파일·부분 | `K/desktop/main-service-owner.test.cjs`, `K/desktop/preload-page.test.mjs` |
| [architecture.md](architecture.md) | F-ARC-003 | 파일·부분·공백 | `A/desktop/hub.test.cjs`, `A/desktop/reads/reads.test.cjs` |
| [architecture.md](architecture.md) | F-ARC-004 | 파일·부분 | `A/data/live.test.mjs`, `A/desktop/reads/reads.test.cjs`, `K/core/live.test.mjs` |
| [architecture.md](architecture.md) | F-ARC-005, F-ARC-006, F-ARC-011, F-ARC-TOOLS | 파일·부분·공백 | `A/desktop/hub.test.cjs` |
| [architecture.md](architecture.md) | F-ARC-007 | 파일·부분 | `A/desktop/ai-target.test.cjs`, `A/desktop/hub.test.cjs` |
| [architecture.md](architecture.md) | F-ARC-008 | 파일·부분·공백 | `A/ai-hub.test.mjs`, `A/desktop/ai-target.test.cjs`, `K/shell/panel-engine.test.mjs` |
| [architecture.md](architecture.md) | F-ARC-009 | 파일·부분·공백 | `A/data/ownership.test.mjs`, `A/desktop/hub.test.cjs` |
| [architecture.md](architecture.md) | F-ARC-010 | 파일·부분 | `A/agent/agent.test.mjs`, `A/desktop/agent-heartbeat.test.cjs`, `A/desktop/services-agent.test.cjs` |
| [architecture.md](architecture.md) | F-ARC-T01~18, F-ARC-U01~07 | 고정 없음 | 고정 없음 |
| [backend.md](backend.md) | F-BE-001 | 파일·부분 | `A/data/index.test.mjs`, `A/desktop/reads/reads.test.cjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs`, `K/tools/check-ipc.mjs` |
| [backend.md](backend.md) | F-BE-002 | 파일·부분 | `A/desktop/portforward.test.cjs`, `A/desktop/tools.test.cjs` |
| [backend.md](backend.md) | F-BE-003, F-BE-M01~25 | 선언·점검만 | 원본 점검 항목 |
| [backend.md](backend.md) | F-BE-004 | 파일·부분·공백 | `A/data/incident-model.test.mjs`, `A/desktop/reads/reads.test.cjs` |
| [backend.md](backend.md) | F-BE-005 | 파일·부분 | `A/data/log-excerpt.test.mjs`, `A/desktop/pod-logs.test.cjs`, `A/desktop/reads/reads.test.cjs` |
| [backend.md](backend.md) | F-BE-006, F-BE-007, F-BE-014~017, F-BE-020, F-BE-023, F-BE-CONNECT-OPEN, F-BE-CONNECT-QUERY, F-BE-CONNECT-RESTORE, F-BE-CONTEXT, F-BE-HOME, F-BE-P00~10, F-BE-TABLE, F-BE-TABLE-ALERT, F-BE-TABLE-AUDIT, F-BE-TABLE-COST, F-BE-TABLE-EVENT, F-BE-TABLE-GITOPS, F-BE-TABLE-INCIDENT, F-BE-TABLE-RESOURCE, F-BE-TABLE-SEARCH, F-BE-U09, F-BE-U26~44, F-BE-U52 | 고정 없음 | 고정 없음 |
| [backend.md](backend.md) | F-BE-008 | 파일·부분 | `A/data/ownership.test.mjs`, `A/desktop/gitops-deployment.test.cjs`, `A/desktop/services.test.cjs`, `A/desktop/tool-connect.test.cjs` |
| [backend.md](backend.md) | F-BE-009 | 파일·부분 | `A/data/kinds.test.mjs`, `A/desktop/agent-heartbeat.test.cjs`, `A/desktop/opencost.test.cjs`, `A/desktop/services.test.cjs`, `A/desktop/tools.test.cjs` |
| [backend.md](backend.md) | F-BE-CONNECT-TERMINAL | 파일·부분·공백 | `K/desktop/main-service-owner.test.cjs` |
| [backend.md](backend.md) | F-BE-010 | 파일·부분·공백 | `A/desktop/hub.test.cjs`, `K/desktop/main-service-owner.test.cjs` |
| [backend.md](backend.md) | F-BE-011 | 파일·부분·공백 | `A/data/incident-model.test.mjs`, `A/desktop/ai-target.test.cjs` |
| [backend.md](backend.md) | F-BE-012 | 파일·부분·공백 | `A/data/audit.test.mjs`, `A/desktop/hub.test.cjs` |
| [backend.md](backend.md) | F-BE-013 | 파일·부분·공백 | `A/ai-hub.test.mjs`, `A/ai-target-flow.test.mjs`, `K/shell/panel-engine.test.mjs` |
| [backend.md](backend.md) | F-BE-018 | 파일·부분 | `A/agent/agent.test.mjs`, `A/data/incident-detect.test.mjs`, `A/data/incident-model.test.mjs`, `A/data/ownership.test.mjs`, `A/desktop/agent-heartbeat.test.cjs`, `A/desktop/incident-hub.test.cjs`, `A/desktop/hub.test.cjs`, `A/pages/cluster-home.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [backend.md](backend.md) | F-BE-019 | 파일·부분·공백 | `K/tools/check-deps.mjs`, `K/tools/check-release.mjs`, `K/tools/unused-check.mjs` |
| [backend.md](backend.md) | F-BE-021 | 파일·부분·공백 | `A/data/find.test.mjs` |
| [backend.md](backend.md) | F-BE-022 | 파일·부분·공백 | `A/data/incident-model.test.mjs` |
| [backend.md](backend.md) | F-BE-METRICS | 파일·부분·공백 | `A/desktop/reads/reads.test.cjs` |
| [backend.md](backend.md) | F-BE-024 | 외부·부분 | |
| [components/cards.md](components/cards.md) | CMP-CARD-01, CMP-CARD-BOUNDARY, CMP-CARD-SUMMARY | 파일·부분 | `K/components/summary-bar.test.mjs` |
| [components/cards.md](components/cards.md) | CMP-CARD-02, CMP-CARD-AGENT-DETAIL-01, CMP-CARD-AILOG-01, CMP-CARD-AILOG-02, CMP-CARD-AILOG-DETAIL-01, CMP-CARD-ALERT-DETAIL-01, CMP-CARD-ALERT-DETAIL-02, CMP-CARD-ALERTS-01, CMP-CARD-CLUSTER-HOME-01~05, CMP-CARD-CLUSTER-SEARCH-01, CMP-CARD-COSTS-01, CMP-CARD-EVENTS-VIEW-01~03, CMP-CARD-GITOPS-01, CMP-CARD-GITOPS-02, CMP-CARD-GITOPS-DETAIL-01~03, CMP-CARD-INCIDENT-EVIDENCE-01, CMP-CARD-INCIDENT-PARTS-01, CMP-CARD-INCIDENT-PARTS-02, CMP-CARD-LOG-CARD-01, CMP-CARD-NETWORK-01, CMP-CARD-RESOURCE-DETAIL-01~04, CMP-CARD-RESOURCE-DETAIL-CALL-01~20, CMP-CARD-RESOURCE-LIST-01, CMP-CARD-RESOURCE-LIST-02, CMP-CARD-TOOL-DETAIL-01, CMP-CARD-TOOLS-01, CMP-CARD-VIEW-PARTS-01, CMP-CARD-VIEW-PARTS-02 | 파일·부분·공백 | `K/components/summary-bar.test.mjs` |
| [components/cards.md](components/cards.md) | CMP-CARD-WIDTH | 파일·부분 | `K/tools/check-layout.mjs` |
| [components/charts.md](components/charts.md) | CMP-CHART-01 | 파일·부분 | `A/desktop/observability.test.cjs`, `K/core/temporal-chart.test.mjs` |
| [components/charts.md](components/charts.md) | CMP-CHART-02 | 파일·부분 | `A/pages/monitoring-parts.test.mjs`, `K/components/chart-card.test.mjs`, `K/components/chart-layer.test.mjs` |
| [components/charts.md](components/charts.md) | CMP-CHART-03 | 파일·부분 | `K/components/chart-card-static.test.mjs`, `K/components/chart-live.test.mjs`, `K/core/temporal-chart.test.mjs` |
| [components/charts.md](components/charts.md) | CMP-CHART-04 | 파일·부분 | `K/components/chart-card-axis.test.mjs`, `K/components/chart-card.test.mjs` |
| [components/charts.md](components/charts.md) | CMP-CHART-LIVE | 파일·부분 | `K/core/temporal-chart.test.mjs` |
| [components/charts.md](components/charts.md) | CMP-CHART-OVERLAY | 파일·부분 | `K/components/chart-layer.test.mjs` |
| [components/charts.md](components/charts.md) | CMP-CHART-LEGEND | 파일·부분 | `K/components/chart-card.test.mjs` |
| [components/charts.md](components/charts.md) | CMP-CHART-AXES | 파일·부분 | `K/components/chart-card-axis.test.mjs` |
| [components/charts.md](components/charts.md) | CMP-CHART-PALETTE | 파일·부분 | `K/tools/check-brand.mjs`, `K/tools/check-visual.mjs` |
| [components/charts.md](components/charts.md) | CMP-CHART-METADATA | 파일·부분 | `K/components/chart-card-static.test.mjs` |
| [components/code-evidence.md](components/code-evidence.md) | CMP-CODE-01 | 파일·부분·공백 | `A/pages/resource-pages.test.mjs`, `K/components/code-block.test.mjs` |
| [components/code-evidence.md](components/code-evidence.md) | CMP-LOG-01 | 파일·부분 | `A/desktop/pod-logs.test.cjs`, `A/pages/parts-format.test.mjs`, `K/components/log-view.test.mjs` |
| [components/code-evidence.md](components/code-evidence.md) | CMP-LOG-02 | 파일·부분·공백 | `A/desktop/pod-logs.test.cjs`, `K/components/log-view.test.mjs` |
| [components/code-evidence.md](components/code-evidence.md) | CMP-REF-01 | 파일·부분·공백 | `K/components/ref.test.mjs` |
| [components/code-evidence.md](components/code-evidence.md) | CMP-CODE-TREE | 파일·부분 | `K/components/code-block.test.mjs` |
| [components/code-evidence.md](components/code-evidence.md) | CMP-REPORT-SELECT | 파일·부분 | `A/pages/incident-report-doc.test.mjs`, `K/components/report-canvas.test.mjs` |
| [components/control-inventory.md](components/control-inventory.md) | CMP-INPUT-CONTEXT-MENU, CMP-INPUT-DIALOG, CMP-INPUT-EMPTY-STATE, CMP-INPUT-MENU, CMP-INPUT-MENU-ITEM, CMP-INPUT-PALETTE, CMP-INPUT-SEARCH-INPUT, CMP-INPUT-SETTINGS-ROW, CMP-INPUT-SIDEBAR-ROW, CMP-INPUT-SKELETON, CMP-INPUT-STATUS-ICON, CMP-INPUT-SUBMENU | 고정 없음 | 고정 없음 |
| [components/control-inventory.md](components/control-inventory.md) | CMP-INPUT-PILL-TABS | 파일·부분 | `K/components/pill-tabs.test.mjs` |
| [components/control-inventory.md](components/control-inventory.md) | CMP-INPUT-LIST-TOOLBAR | 파일·부분 | `K/components/list-toolbar.test.mjs` |
| [components/control-inventory.md](components/control-inventory.md) | CMP-INPUT-CODE-BLOCK | 파일·부분 | `K/components/code-block.test.mjs` |
| [components/control-inventory.md](components/control-inventory.md) | CMP-INPUT-REF | 파일·부분 | `K/components/ref.test.mjs` |
| [components/control-inventory.md](components/control-inventory.md) | CMP-INPUT-TOAST | 파일·부분 | `K/components/toast.test.mjs` |
| [components/control-inventory.md](components/control-inventory.md) | CMP-INPUT-SOURCE-CHIPS | 파일·부분 | `K/components/source-chips.test.mjs` |
| [components/control-inventory.md](components/control-inventory.md) | CMP-INPUT-APPROVAL-HEAD | 파일·부분 | `K/components/approval-head.test.mjs` |
| [components/control-inventory.md](components/control-inventory.md) | CMP-INPUT-VERIFY-CARD | 파일·부분 | `K/components/verify-card.test.mjs` |
| [components/control-inventory.md](components/control-inventory.md) | CMP-INPUT-REPORT-CANVAS | 파일·부분 | `K/components/report-canvas.test.mjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-SEARCH | 파일·부분 | `A/pages/resource-pages.test.mjs`, `K/components/select.test.mjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-TABS | 파일·부분 | `K/components/pill-tabs.test.mjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-TOOLBAR | 파일·부분 | `K/components/list-toolbar.test.mjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-SETTINGS | 파일·부분·공백 | `K/components/settings-group.test.mjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-MENU | 고정 없음 | 고정 없음 |
| [components/controls.md](components/controls.md) | CMP-CTRL-TOAST | 파일·부분 | `K/components/toast.test.mjs`, `K/desktop/main-toast-focus.test.cjs`, `K/desktop/main-toast-menu.test.cjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-SIDEBAR | 파일·부분·공백 | `K/shell/shell.test.mjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-EMPTY | 파일·부분·공백 | `A/pages/resource-pages.test.mjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-TOKENS | 파일·부분 | `K/tools/check-layout.mjs`, `K/tools/unused-check.mjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-ICON | 파일·부분 | `K/icons/icons.test.mjs`, `K/tools/check-brand.mjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-TERMS | 파일·부분 | `K/tools/check-locale.mjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-SCROLL | 파일·부분 | `K/tools/check-layout.mjs`, `K/tools/check-states.mjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-FRAME | 파일·부분 | `K/shell/panel-engine.test.mjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-REUSE | 파일·부분 | `K/tools/check-release.mjs`, `K/tools/check-reuse.mjs` |
| [components/controls.md](components/controls.md) | CMP-CTRL-TIME | 파일·부분 | `K/components/time-range.test.mjs` |
| [components/flow-graph.md](components/flow-graph.md) | CMP-FLOW-01, CMP-FLOW-02 | 파일·부분·공백 | `K/components/flow-graph-relation.test.mjs` |
| [components/flow-graph.md](components/flow-graph.md) | CMP-FLOW-LABEL, CMP-FLOW-MOTION | 파일·부분 | `K/components/flow-graph-relation.test.mjs` |
| [components/flow-graph.md](components/flow-graph.md) | CMP-FLOW-STAGES | 파일·부분 | `K/components/status-flow.test.mjs` |
| [components/incident-criteria.md](components/incident-criteria.md) | CMP-INC-01, CMP-INC-02 | 파일·부분·공백 | `A/data/incident-detect.test.mjs` |
| [components/incident-criteria.md](components/incident-criteria.md) | CMP-INC-03 | 파일·부분 | `A/data/incident-detect.test.mjs`, `A/data/incident-model.test.mjs` |
| [components/incident-criteria.md](components/incident-criteria.md) | CMP-INC-04 | 파일·부분·공백 | `A/data/incident-model.test.mjs`, `A/pages/incident-report-doc.test.mjs` |
| [components/incident-criteria.md](components/incident-criteria.md) | CMP-INC-05 | 고정 없음 | 고정 없음 |
| [components/regressions.md](components/regressions.md) | CMP-REG-SCROLL | 파일·부분·공백 | `K/tools/check-layout.mjs` |
| [components/regressions.md](components/regressions.md) | CMP-REG-TABS | 파일·부분 | `K/components/pill-tabs.test.mjs` |
| [components/regressions.md](components/regressions.md) | CMP-REG-SOURCE | 파일·부분 | `A/tool-surfaces.test.mjs` |
| [components/regressions.md](components/regressions.md) | CMP-REG-ICON | 파일·부분·공백 | `K/components/state-motion.test.mjs` |
| [components/regressions.md](components/regressions.md) | CMP-REG-ALIGN | 파일·부분 | `K/components/data-table-extras.test.mjs` |
| [components/regressions.md](components/regressions.md) | CMP-HISTORY-01, CMP-REG-HOVER, CMP-REG-RADIUS | 고정 없음 | 고정 없음 |
| [components/regressions.md](components/regressions.md) | CMP-REG-FRAME | 파일·부분·공백 | `K/components/settings-group.test.mjs` |
| [components/regressions.md](components/regressions.md) | CMP-REG-CELL | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/resource-values.md](components/resource-values.md) | CMP-VALUE-01 | 파일·부분 | `A/data/kinds.test.mjs`, `A/desktop/observability.test.cjs` |
| [components/resource-values.md](components/resource-values.md) | CMP-VALUE-02 | 고정 없음 | 고정 없음 |
| [components/source-chips.md](components/source-chips.md) | CMP-CHIP-01 | 파일·부분 | `A/tool-surfaces.test.mjs` |
| [components/source-chips.md](components/source-chips.md) | CMP-CHIP-02 | 상속·부분 | `A/tool-surfaces.test.mjs`; 상속 CMP-CHIP-01 |
| [components/source-chips.md](components/source-chips.md) | CMP-CHIP-03 | 파일·부분 | `A/tool-surfaces.test.mjs`, `K/components/source-chips.test.mjs` |
| [components/source-chips.md](components/source-chips.md) | CMP-CHIP-LOGOS | 파일·부분 | `A/tool-surfaces.test.mjs`, `K/components/icon-stack.test.mjs` |
| [components/source-chips.md](components/source-chips.md) | CMP-CHIP-WATCHDOG | 파일·부분 | `A/data/alerts.test.mjs` |
| [components/table-contract.md](components/table-contract.md) | CMP-TABLE-01 | 파일·부분 | `K/components/data-table-extras.test.mjs` |
| [components/table-contract.md](components/table-contract.md) | CMP-TABLE-02 | 파일·부분·공백 | `A/pages/resource-pages.test.mjs`, `A/pages/signal-pages.test.mjs` |
| [components/table-contract.md](components/table-contract.md) | CMP-TABLE-03, CMP-TABLE-04 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/table-contract.md](components/table-contract.md) | CMP-TABLE-05 | 파일·부분·공백 | `A/data/alerts.test.mjs`, `K/components/pager.test.mjs` |
| [components/table-contract.md](components/table-contract.md) | CMP-TABLE-06 | 파일·부분·공백 | `A/pages/parts-format.test.mjs` |
| [components/table-contract.md](components/table-contract.md) | CMP-TABLE-07 | 파일·부분 | `A/pages/incident-report-doc.test.mjs`, `K/components/report-canvas.test.mjs` |
| [components/table-contract.md](components/table-contract.md) | CMP-TABLE-08 | 고정 없음 | 고정 없음 |
| [components/tables/agent-detail.md](components/tables/agent-detail.md) | CMP-T-AGENT-DETAIL-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/agent-detail.md](components/tables/agent-detail.md) | CMP-T-AGENT-DETAIL-C001~003 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-AGENT-DETAIL-01 |
| [components/tables/agent.md](components/tables/agent.md) | CMP-LIST-AGENT | 고정 없음 | 고정 없음 |
| [components/tables/ailog-detail.md](components/tables/ailog-detail.md) | CMP-LIST-AILOG-DETAIL | 고정 없음 | 고정 없음 |
| [components/tables/ailog.md](components/tables/ailog.md) | CMP-T-AILOG-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/ailog.md](components/tables/ailog.md) | CMP-T-AILOG-C001~006 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-AILOG-01 |
| [components/tables/alert-detail.md](components/tables/alert-detail.md) | CMP-T-ALERT-DETAIL-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/alert-detail.md](components/tables/alert-detail.md) | CMP-T-ALERT-DETAIL-C001~004 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-ALERT-DETAIL-01 |
| [components/tables/alerts.md](components/tables/alerts.md) | CMP-T-ALERTS-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/alerts.md](components/tables/alerts.md) | CMP-T-ALERTS-C001~006 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-ALERTS-01 |
| [components/tables/cluster-home.md](components/tables/cluster-home.md) | CMP-T-CLUSTER-HOME-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/cluster-home.md](components/tables/cluster-home.md) | CMP-T-CLUSTER-HOME-C001~011 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-CLUSTER-HOME-01 |
| [components/tables/cluster-search.md](components/tables/cluster-search.md) | CMP-T-CLUSTER-SEARCH-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/cluster-search.md](components/tables/cluster-search.md) | CMP-T-CLUSTER-SEARCH-C001~004 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-CLUSTER-SEARCH-01 |
| [components/tables/cluster-search.md](components/tables/cluster-search.md) | CMP-T-CLUSTER-SEARCH-LIMIT | 고정 없음 | 고정 없음 |
| [components/tables/costs.md](components/tables/costs.md) | CMP-T-COSTS-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/costs.md](components/tables/costs.md) | CMP-T-COSTS-C001 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-COSTS-01 |
| [components/tables/costs.md](components/tables/costs.md) | CMP-T-COSTS-EXPAND | 파일·부분·공백 | `A/desktop/opencost.test.cjs` |
| [components/tables/events-view.md](components/tables/events-view.md) | CMP-T-EVENTS-VIEW-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/events-view.md](components/tables/events-view.md) | CMP-T-EVENTS-VIEW-C001~012 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-EVENTS-VIEW-01 |
| [components/tables/events-view.md](components/tables/events-view.md) | CMP-T-EVENTS-EXTRA, CMP-T-EVENTS-MESSAGE, CMP-T-EVENTS-OBJECT, CMP-T-EVENTS-SOURCE | 고정 없음 | 고정 없음 |
| [components/tables/gitops-detail.md](components/tables/gitops-detail.md) | CMP-T-GITOPS-DETAIL-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/gitops-detail.md](components/tables/gitops-detail.md) | CMP-T-GITOPS-DETAIL-C001~009 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-GITOPS-DETAIL-01 |
| [components/tables/gitops.md](components/tables/gitops.md) | CMP-T-GITOPS-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/gitops.md](components/tables/gitops.md) | CMP-T-GITOPS-C001~015 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-GITOPS-01 |
| [components/tables/incident-detail.md](components/tables/incident-detail.md) | CMP-T-INCIDENT-DETAIL-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/incident-detail.md](components/tables/incident-detail.md) | CMP-T-INCIDENT-DETAIL-C001~006 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-INCIDENT-DETAIL-01 |
| [components/tables/incident-evidence.md](components/tables/incident-evidence.md) | CMP-LIST-INCIDENT-EVIDENCE | 고정 없음 | 고정 없음 |
| [components/tables/incident-parts.md](components/tables/incident-parts.md) | CMP-T-INCIDENT-PARTS-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/incident-parts.md](components/tables/incident-parts.md) | CMP-T-INCIDENT-PARTS-C001~005 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-INCIDENT-PARTS-01 |
| [components/tables/incident-report-doc.md](components/tables/incident-report-doc.md) | CMP-T-INCIDENT-REPORT-DOC-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/incident-report-doc.md](components/tables/incident-report-doc.md) | CMP-T-INCIDENT-REPORT-DOC-C001~031 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-INCIDENT-REPORT-DOC-01 |
| [components/tables/logs.md](components/tables/logs.md) | CMP-LIST-LOGS | 고정 없음 | 고정 없음 |
| [components/tables/network.md](components/tables/network.md) | CMP-T-NETWORK-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/network.md](components/tables/network.md) | CMP-T-NETWORK-C001~007 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-NETWORK-01 |
| [components/tables/resource-configmaps.md](components/tables/resource-configmaps.md) | CMP-K-CONFIGMAPS-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-configmaps.md](components/tables/resource-configmaps.md) | CMP-K-CONFIGMAPS-C001~004 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-CONFIGMAPS-01 |
| [components/tables/resource-cronjobs.md](components/tables/resource-cronjobs.md) | CMP-K-CRONJOBS-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-cronjobs.md](components/tables/resource-cronjobs.md) | CMP-K-CRONJOBS-C001~010 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-CRONJOBS-01 |
| [components/tables/resource-daemonsets.md](components/tables/resource-daemonsets.md) | CMP-K-DAEMONSETS-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-daemonsets.md](components/tables/resource-daemonsets.md) | CMP-K-DAEMONSETS-C001~010 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-DAEMONSETS-01 |
| [components/tables/resource-deployments.md](components/tables/resource-deployments.md) | CMP-K-DEPLOYMENTS-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-deployments.md](components/tables/resource-deployments.md) | CMP-K-DEPLOYMENTS-C001~015 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-DEPLOYMENTS-01 |
| [components/tables/resource-detail.md](components/tables/resource-detail.md) | CMP-T-RESOURCE-DETAIL-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/resource-detail.md](components/tables/resource-detail.md) | CMP-T-RESOURCE-DETAIL-C001~037 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-RESOURCE-DETAIL-01 |
| [components/tables/resource-events.md](components/tables/resource-events.md) | CMP-K-EVENTS-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-horizontalpodautoscalers.md](components/tables/resource-horizontalpodautoscalers.md) | CMP-K-HORIZONTALPODAUTOSCALERS-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-horizontalpodautoscalers.md](components/tables/resource-horizontalpodautoscalers.md) | CMP-K-HORIZONTALPODAUTOSCALERS-C001~009 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-HORIZONTALPODAUTOSCALERS-01 |
| [components/tables/resource-ingresses.md](components/tables/resource-ingresses.md) | CMP-K-INGRESSES-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-ingresses.md](components/tables/resource-ingresses.md) | CMP-K-INGRESSES-C001~007 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-INGRESSES-01 |
| [components/tables/resource-inspector.md](components/tables/resource-inspector.md) | CMP-T-RESOURCE-INSPECTOR-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/resource-inspector.md](components/tables/resource-inspector.md) | CMP-T-RESOURCE-INSPECTOR-C001~007 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-RESOURCE-INSPECTOR-01 |
| [components/tables/resource-jobs.md](components/tables/resource-jobs.md) | CMP-K-JOBS-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-jobs.md](components/tables/resource-jobs.md) | CMP-K-JOBS-C001~008 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-JOBS-01 |
| [components/tables/resource-nodes.md](components/tables/resource-nodes.md) | CMP-K-NODES-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-nodes.md](components/tables/resource-nodes.md) | CMP-K-NODES-C001~014 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-NODES-01 |
| [components/tables/resource-persistentvolumeclaims.md](components/tables/resource-persistentvolumeclaims.md) | CMP-K-PERSISTENTVOLUMECLAIMS-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-persistentvolumeclaims.md](components/tables/resource-persistentvolumeclaims.md) | CMP-K-PERSISTENTVOLUMECLAIMS-C001~009 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-PERSISTENTVOLUMECLAIMS-01 |
| [components/tables/resource-pods.md](components/tables/resource-pods.md) | CMP-K-PODS-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-pods.md](components/tables/resource-pods.md) | CMP-K-PODS-C001~012 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-PODS-01 |
| [components/tables/resource-replicasets.md](components/tables/resource-replicasets.md) | CMP-K-REPLICASETS-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-replicasets.md](components/tables/resource-replicasets.md) | CMP-K-REPLICASETS-C001~009 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-REPLICASETS-01 |
| [components/tables/resource-secrets.md](components/tables/resource-secrets.md) | CMP-K-SECRETS-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-secrets.md](components/tables/resource-secrets.md) | CMP-K-SECRETS-C001~005 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-SECRETS-01 |
| [components/tables/resource-services.md](components/tables/resource-services.md) | CMP-K-SERVICES-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-services.md](components/tables/resource-services.md) | CMP-K-SERVICES-C001~008 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-SERVICES-01 |
| [components/tables/resource-statefulsets.md](components/tables/resource-statefulsets.md) | CMP-K-STATEFULSETS-01 | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [components/tables/resource-statefulsets.md](components/tables/resource-statefulsets.md) | CMP-K-STATEFULSETS-C001~010 | 상속·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs`; 상속 CMP-K-STATEFULSETS-01 |
| [components/tables/settings.md](components/tables/settings.md) | CMP-LIST-SETTINGS | 고정 없음 | 고정 없음 |
| [components/tables/tool-api.md](components/tables/tool-api.md) | CMP-T-TOOL-API-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/tool-api.md](components/tables/tool-api.md) | CMP-T-TOOL-API-C001, CMP-T-TOOL-API-C002 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-TOOL-API-01 |
| [components/tables/tool-detail.md](components/tables/tool-detail.md) | CMP-T-TOOL-DETAIL-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/tool-detail.md](components/tables/tool-detail.md) | CMP-T-TOOL-DETAIL-C001, CMP-T-TOOL-DETAIL-C002 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-TOOL-DETAIL-01 |
| [components/tables/tools.md](components/tables/tools.md) | CMP-LIST-TOOLS | 고정 없음 | 고정 없음 |
| [components/tables/view-parts.md](components/tables/view-parts.md) | CMP-T-VIEW-PARTS-01 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [components/tables/view-parts.md](components/tables/view-parts.md) | CMP-T-VIEW-PARTS-C001 | 상속·부분·공백 | `K/components/data-table-extras.test.mjs`; 상속 CMP-T-VIEW-PARTS-01 |
| [concurrency.md](concurrency.md) | CON-001 | 파일·부분·공백 | `A/data/live.test.mjs` |
| [concurrency.md](concurrency.md) | CON-002 | 파일·부분·공백 | `A/pages/cluster-home.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [concurrency.md](concurrency.md) | CON-003 | 파일·부분·공백 | `A/desktop/pod-logs.test.cjs`, `A/desktop/portforward.test.cjs`, `A/desktop/services.test.cjs` |
| [concurrency.md](concurrency.md) | CON-004, CON-008, CON-015, CON-020, CON-028, CON-028-COST, CON-029 | 고정 없음 | 고정 없음 |
| [concurrency.md](concurrency.md) | CON-005, CON-025 | 외부·부분 | |
| [concurrency.md](concurrency.md) | CON-006, CON-013, CON-017 | 파일·부분·공백 | `A/desktop/hub.test.cjs` |
| [concurrency.md](concurrency.md) | CON-007 | 파일·부분·공백 | `A/desktop/reads/reads.test.cjs` |
| [concurrency.md](concurrency.md) | CON-009 | 파일·부분·공백 | `A/data/alerts.test.mjs`, `A/desktop/reads/reads.test.cjs` |
| [concurrency.md](concurrency.md) | CON-010, CON-011 | 파일·부분·공백 | `A/data/incident-detect.test.mjs` |
| [concurrency.md](concurrency.md) | CON-012 | 파일·부분·공백 | `A/ai-hub.test.mjs`, `K/shell/panel-engine.test.mjs` |
| [concurrency.md](concurrency.md) | CON-014 | 파일·부분·공백 | `A/desktop/hub.test.cjs`, `K/shell/panel-engine.test.mjs` |
| [concurrency.md](concurrency.md) | CON-016 | 파일·부분·공백 | `K/shell/panel-engine.test.mjs` |
| [concurrency.md](concurrency.md) | CON-018 | 파일·부분 | `A/desktop/pod-logs.test.cjs` |
| [concurrency.md](concurrency.md) | CON-019 | 파일·부분 | `A/ai-hub.test.mjs`, `A/ai-target-flow.test.mjs`, `K/shell/panel-engine.test.mjs` |
| [concurrency.md](concurrency.md) | CON-021 | 파일·부분·공백 | `A/desktop/ai-target.test.cjs` |
| [concurrency.md](concurrency.md) | CON-022 | 파일·부분 | `A/desktop/ai-target.test.cjs` |
| [concurrency.md](concurrency.md) | CON-023 | 파일·부분 | `A/desktop/reads/reads.test.cjs`, `K/core/live.test.mjs` |
| [concurrency.md](concurrency.md) | CON-024 | 파일·부분 | `A/desktop/pod-logs.test.cjs`, `K/core/clock.test.mjs` |
| [concurrency.md](concurrency.md) | CON-026 | 파일·부분 | `A/data/conn-view.test.mjs`, `A/settings-icons.test.mjs`, `A/tool-surfaces.test.mjs` |
| [concurrency.md](concurrency.md) | CON-027 | 파일·부분 | `A/desktop/pod-logs.test.cjs`, `A/pages/incident-report-doc.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [concurrency.md](concurrency.md) | CON-028-GITOPS | 파일·부분 | `A/desktop/gitops-deployment.test.cjs` |
| [concurrency.md](concurrency.md) | CON-030 | 파일·부분·공백 | `A/ai-hub.test.mjs`, `A/app.config.test.mjs`, `A/start-conversations.test.mjs` |
| [constitution.md](constitution.md) | C-007, C-008, C-SOURCE | 선언·점검만 | 원본 점검 항목 |
| [constitution.md](constitution.md) | C-001, C-003, C-005, C-006, C-009, C-010, C-012 | 고정 없음 | 고정 없음 |
| [constitution.md](constitution.md) | C-002 | 파일·부분·공백 | `A/desktop/hub.test.cjs`, `K/shell/panel-engine.test.mjs` |
| [constitution.md](constitution.md) | C-004 | 파일·부분 | `A/data/live.test.mjs` |
| [constitution.md](constitution.md) | C-011 | 파일·부분 | `K/tools/check-commits.mjs`, `K/tools/check-commits.test.mjs` |
| [design/tokens.md](design/tokens.md) | B-TOKEN-001 | 파일·부분·공백 | `K/tools/check-brand.mjs`, `K/tools/check-layout.mjs`, `K/tools/check-surfaces.mjs`, `K/tools/unused-check.mjs` |
| [design/verification.md](design/verification.md) | B-CHECK-001 | 파일·부분·공백 | `A/pages/cluster-home.test.mjs`, `A/pages/resource-pages.test.mjs`, `K/components/source-chips.test.mjs`, `K/components/stale-line.test.mjs` |
| [design/verification.md](design/verification.md) | B-CHECK-002 | 파일·부분·공백 | `A/data/conn-view.test.mjs`, `A/tool-surfaces.test.mjs` |
| [design/verification.md](design/verification.md) | B-CHECK-003~005, B-CHECK-008, B-CHECK-009 | 고정 없음 | 고정 없음 |
| [design/verification.md](design/verification.md) | B-CHECK-006, B-CHECK-007, B-CHECK-010 | 선언·점검만 | 원본 점검 항목 |
| [design.md](design.md) | B-001, B-041 | 선언·점검만 | 원본 점검 항목 |
| [design.md](design.md) | B-002, B-003, B-007, B-011, B-012, B-032, B-033, B-037, B-042, B-046 | 고정 없음 | 고정 없음 |
| [design.md](design.md) | B-004 | 파일·부분·공백 | `K/tools/check-surfaces.test.mjs` |
| [design.md](design.md) | B-005, B-010 | 파일·부분·공백 | `K/components/settings-group.test.mjs` |
| [design.md](design.md) | B-006 | 파일·부분 | `K/components/topbar.test.mjs` |
| [design.md](design.md) | B-008 | 파일·부분·공백 | `K/tools/check.mjs` |
| [design.md](design.md) | B-009 | 파일·부분·공백 | `K/components/settings-group.test.mjs`, `K/page/kinds/settings.test.mjs` |
| [design.md](design.md) | B-013 | 파일·부분·공백 | `K/components/state-motion.test.mjs` |
| [design.md](design.md) | B-014 | 파일·부분·공백 | `K/components/summary-bar.test.mjs` |
| [design.md](design.md) | B-015 | 파일·부분 | `A/pages/cluster-home.test.mjs`, `K/components/summary-bar.test.mjs` |
| [design.md](design.md) | B-016 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [design.md](design.md) | B-017 | 파일·부분 | `K/components/data-table-extras.test.mjs`, `K/components/data-table.test.mjs`, `K/components/pager.test.mjs` |
| [design.md](design.md) | B-018 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [design.md](design.md) | B-019 | 파일·부분·공백 | `K/components/state-motion.test.mjs`, `K/icons/icons.test.mjs` |
| [design.md](design.md) | B-020 | 파일·부분·공백 | `A/tool-surfaces.test.mjs`, `K/components/source-chips.test.mjs` |
| [design.md](design.md) | B-021 | 파일·부분 | `A/settings-icons.test.mjs`, `K/components/icon-stack.test.mjs` |
| [design.md](design.md) | B-022 | 파일·부분·공백 | `K/components/pill-tabs.test.mjs` |
| [design.md](design.md) | B-023 | 파일·부분 | `K/components/list-toolbar.test.mjs` |
| [design.md](design.md) | B-024 | 파일·부분·공백 | `K/components/query-line.test.mjs`, `K/components/select.test.mjs` |
| [design.md](design.md) | B-025 | 파일·부분·공백 | `K/components/code-block.test.mjs`, `K/components/log-view.test.mjs` |
| [design.md](design.md) | B-026 | 파일·부분·공백 | `K/components/ref.test.mjs` |
| [design.md](design.md) | B-027 | 파일·부분 | `K/components/chart-card-axis.test.mjs`, `K/components/chart-card.test.mjs`, `K/components/chart-layer.test.mjs` |
| [design.md](design.md) | B-028 | 파일·부분·공백 | `A/pages/cluster-home.test.mjs`, `K/components/chart-live.test.mjs`, `K/components/stale-line.test.mjs`, `K/core/temporal-chart.test.mjs` |
| [design.md](design.md) | B-029 | 파일·부분·공백 | `K/components/chart-card-axis.test.mjs` |
| [design.md](design.md) | B-030 | 파일·부분·공백 | `K/components/change-timeline.test.mjs`, `K/core/temporal-chart.test.mjs`, `K/components/time-range.test.mjs` |
| [design.md](design.md) | B-031 | 파일·부분·공백 | `K/components/flow-graph-relation.test.mjs` |
| [design.md](design.md) | B-034 | 파일·부분·공백 | `K/components/data-table.test.mjs` |
| [design.md](design.md) | B-035 | 파일·부분·공백 | `K/components/select.test.mjs` |
| [design.md](design.md) | B-036 | 파일·부분 | `K/components/notice.test.mjs`, `K/components/toast.test.mjs` |
| [design.md](design.md) | B-038 | 파일·부분·공백 | `A/pages/incident-report-doc.test.mjs`, `K/components/chart-card-static.test.mjs`, `K/components/report-canvas.test.mjs`, `K/core/report.test.mjs` |
| [design.md](design.md) | B-039 | 파일·부분·공백 | `K/components/ai-applied.test.mjs`, `K/components/report-canvas.test.mjs` |
| [design.md](design.md) | B-040 | 파일·부분·공백 | `K/components/approval-head.test.mjs`, `K/components/reasoning-chain.test.mjs` |
| [design.md](design.md) | B-043 | 파일·부분·공백 | `K/core/terminal-appearance.test.mjs`, `K/shell/terminal-output.test.mjs`, `K/shell/terminal-remote.test.mjs`, `K/shell/terminal-theme.test.mjs` |
| [design.md](design.md) | B-044 | 파일·부분·공백 | `K/components/status-flow.test.mjs` |
| [design.md](design.md) | B-045 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs`, `K/components/data-table.test.mjs` |
| [design.md](design.md) | B-047 | 파일·부분·공백 | `K/tools/check-states.mjs` |
| [design.md](design.md) | B-048 | 파일·부분·공백 | `K/components/chart-card.test.mjs`, `K/components/chart-layer.test.mjs` |
| [design.md](design.md) | B-049 | 파일·부분·공백 | `A/pages/incident-report-doc.test.mjs`, `K/components/report-canvas.test.mjs`, `K/core/report.test.mjs` |
| [flows/agent-installation.md](flows/agent-installation.md) | FLOW-AGT-001 | 파일·부분 | `A/data/connect-flow.test.mjs`, `A/desktop/services-agent.test.cjs` |
| [flows/agent-installation.md](flows/agent-installation.md) | FLOW-AGT-002 | 파일·부분·공백 | `A/agent/agent.test.mjs`, `A/desktop/agent-heartbeat.test.cjs` |
| [flows/ai-connection.md](flows/ai-connection.md) | FLOW-AI-001 | 파일·부분·공백 | `A/ai-target-flow.test.mjs`, `A/data/connect-flow.test.mjs`, `A/desktop/hub.test.cjs` |
| [flows/ai-connection.md](flows/ai-connection.md) | FLOW-AI-002 | 파일·부분 | `A/ai-target-flow.test.mjs`, `A/desktop/ai-target.test.cjs` |
| [flows/ai-connection.md](flows/ai-connection.md) | FLOW-AI-003, FLOW-AI-004 | 파일·부분·공백 | `A/ai-hub.test.mjs`, `A/desktop/hub.test.cjs` |
| [flows/ai-connection.md](flows/ai-connection.md) | FLOW-AI-005 | 파일·부분·공백 | `A/ai-hub.test.mjs`, `A/app.config.test.mjs` |
| [flows/approval-execution.md](flows/approval-execution.md) | FLOW-APR-001~003 | 파일·부분·공백 | `A/desktop/hub.test.cjs` |
| [flows/approval-execution.md](flows/approval-execution.md) | FLOW-APR-004 | 파일·부분·공백 | `A/ai-target-flow.test.mjs`, `A/data/incident-model.test.mjs` |
| [flows/cluster-connection.md](flows/cluster-connection.md) | FLOW-CLU-001 | 파일·부분·공백 | `A/app.config.test.mjs`, `A/data/connect-flow.test.mjs` |
| [flows/cluster-connection.md](flows/cluster-connection.md) | FLOW-CLU-002 | 파일·부분 | `A/data/connect-flow.test.mjs` |
| [flows/cluster-connection.md](flows/cluster-connection.md) | FLOW-CLU-003 | 파일·부분·공백 | `A/data/connect-flow.test.mjs`, `A/desktop/provider-connections.test.cjs` |
| [flows/gitops-change.md](flows/gitops-change.md) | FLOW-GIT-001 | 파일·부분·공백 | `A/desktop/gitops-deployment.test.cjs`, `A/desktop/hub.test.cjs` |
| [flows/gitops-change.md](flows/gitops-change.md) | FLOW-GIT-002 | 파일·부분·공백 | `A/desktop/hub.test.cjs` |
| [flows/gitops-change.md](flows/gitops-change.md) | FLOW-GIT-003, FLOW-GIT-004 | 파일·부분·공백 | `A/data/gitops-view.test.mjs`, `A/desktop/gitops-deployment.test.cjs` |
| [flows/incident-lifecycle.md](flows/incident-lifecycle.md) | FLOW-INC-001, FLOW-INC-002 | 파일·부분·공백 | `A/data/incident-detect.test.mjs` |
| [flows/incident-lifecycle.md](flows/incident-lifecycle.md) | FLOW-INC-003 | 파일·부분·공백 | `A/data/incident-model.test.mjs`, `A/pages/incident-report-doc.test.mjs` |
| [flows/incident-lifecycle.md](flows/incident-lifecycle.md) | FLOW-INC-004 | 파일·부분·공백 | `A/data/incident-model.test.mjs`, `A/desktop/hub.test.cjs` |
| [flows/incident-lifecycle.md](flows/incident-lifecycle.md) | FLOW-INC-005 | 파일·부분·공백 | `A/data/incident-detect.test.mjs`, `A/data/incident-model.test.mjs` |
| [flows/incident-lifecycle.md](flows/incident-lifecycle.md) | FLOW-INC-006 | 고정 없음 | 고정 없음 |
| [flows/investigation.md](flows/investigation.md) | FLOW-INV-001 | 파일·부분·공백 | `A/pages/cluster-home.test.mjs`, `A/pages/resource-inspector.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [flows/investigation.md](flows/investigation.md) | FLOW-INV-002 | 파일·부분·공백 | `A/pages/resource-pages.test.mjs` |
| [flows/investigation.md](flows/investigation.md) | FLOW-INV-003 | 파일·부분·공백 | `A/desktop/services.test.cjs` |
| [flows/investigation.md](flows/investigation.md) | FLOW-INV-004 | 파일·부분·공백 | `A/app.config.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [flows/investigation.md](flows/investigation.md) | FLOW-INV-005 | 파일·부분·공백 | `A/desktop/opencost.test.cjs` |
| [flows/investigation.md](flows/investigation.md) | FLOW-INV-006 | 파일·부분·공백 | `A/pages/resource-inspector.test.mjs` |
| [flows/investigation.md](flows/investigation.md) | FLOW-INV-007 | 파일·부분·공백 | `A/data/incident-model.test.mjs` |
| [flows/investigation.md](flows/investigation.md) | FLOW-LIST-001~008 | 고정 없음 | 고정 없음 |
| [flows/onboarding-settings.md](flows/onboarding-settings.md) | FLOW-ONB-001 | 파일·부분·공백 | `A/app.config.test.mjs`, `A/data/connect-flow.test.mjs` |
| [flows/onboarding-settings.md](flows/onboarding-settings.md) | FLOW-ONB-002 | 파일·부분·공백 | `A/app.config.test.mjs`, `A/data/conn-view.test.mjs`, `A/data/connect-flow.test.mjs` |
| [flows/onboarding-settings.md](flows/onboarding-settings.md) | FLOW-SET-001~003 | 고정 없음 | 고정 없음 |
| [flows/onboarding-settings.md](flows/onboarding-settings.md) | FLOW-ONB-003 | 파일·부분·공백 | `A/app.config.test.mjs` |
| [flows/reports.md](flows/reports.md) | FLOW-REP-001, FLOW-REP-002, FLOW-REP-004, FLOW-REP-005 | 파일·부분·공백 | `A/pages/incident-report-doc.test.mjs` |
| [flows/reports.md](flows/reports.md) | FLOW-REP-003 | 파일·부분·공백 | `A/data/incident-model.test.mjs`, `A/pages/incident-report-doc.test.mjs` |
| [flows/tool-connection.md](flows/tool-connection.md) | FLOW-TOOL-001 | 파일·부분·공백 | `A/data/conn-view.test.mjs`, `A/desktop/tool-connect.test.cjs` |
| [flows/tool-connection.md](flows/tool-connection.md) | FLOW-TOOL-002 | 파일·부분·공백 | `A/data/connect-flow.test.mjs`, `A/desktop/tool-connect.test.cjs` |
| [flows/tool-connection.md](flows/tool-connection.md) | FLOW-TOOL-003 | 파일·부분·공백 | `A/app.config.test.mjs`, `A/desktop/tool-connect.test.cjs` |
| [flows/tool-connection.md](flows/tool-connection.md) | FLOW-TOOL-004 | 파일·부분·공백 | `A/desktop/provider-connections.test.cjs`, `A/desktop/tool-connect.test.cjs` |
| [flows/tool-connection.md](flows/tool-connection.md) | FLOW-TOOL-005 | 파일·부분·공백 | `A/data/connect-flow.test.mjs` |
| [loop.md](loop.md) | L-001, L-004~006, L-009~013 | 고정 없음 | 고정 없음 |
| [loop.md](loop.md) | L-002, L-003, L-007, L-008 | 선언·점검만 | 원본 점검 항목 |
| [performance.md](performance.md) | PERF-001 | 파일·부분·공백 | `A/pages/cluster-home.test.mjs` |
| [performance.md](performance.md) | PERF-002, PERF-012 | 파일·부분·공백 | `K/desktop/main-url.test.cjs` |
| [performance.md](performance.md) | PERF-003, PERF-004, PERF-006, PERF-010, PERF-015, PERF-017, PERF-019, PERF-021, PERF-023, PERF-027, PERF-030, PERF-034 | 고정 없음 | 고정 없음 |
| [performance.md](performance.md) | PERF-005 | 파일·부분·공백 | `A/desktop/hub.test.cjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [performance.md](performance.md) | PERF-007 | 파일·부분·공백 | `A/desktop/portforward.test.cjs`, `K/components/chart-card-static.test.mjs`, `K/components/chart-card.test.mjs` |
| [performance.md](performance.md) | PERF-008 | 파일·부분·공백 | `A/desktop/hub.test.cjs` |
| [performance.md](performance.md) | PERF-009 | 선언·점검만 | 원본 점검 항목 |
| [performance.md](performance.md) | PERF-011 | 파일·부분·공백 | `K/tools/check-glass.mjs`, `K/tools/check-layout.mjs`, `K/tools/check-states.mjs`, `K/tools/check.mjs` |
| [performance.md](performance.md) | PERF-013 | 파일·부분 | `K/desktop/main-url.test.cjs` |
| [performance.md](performance.md) | PERF-014 | 파일·부분 | `K/page/boot.test.mjs` |
| [performance.md](performance.md) | PERF-016 | 파일·부분·공백 | `K/shell/hosts/desktop-host.test.mjs`, `K/shell/tabs.test.mjs` |
| [performance.md](performance.md) | PERF-018 | 파일·부분 | `K/shell/hosts/desktop-host.test.mjs` |
| [performance.md](performance.md) | PERF-020 | 파일·부분·공백 | `K/components/data-table-extras.test.mjs` |
| [performance.md](performance.md) | PERF-022 | 파일·부분·공백 | `K/core/clock.test.mjs` |
| [performance.md](performance.md) | PERF-024 | 파일·부분·공백 | `K/components/chart-card-axis.test.mjs`, `K/components/chart-card-static.test.mjs`, `K/components/chart-card.test.mjs`, `K/components/chart-layer.test.mjs` |
| [performance.md](performance.md) | PERF-025 | 파일·부분·공백 | `K/desktop/main-toast-focus.test.cjs`, `K/desktop/main-toast-menu.test.cjs` |
| [performance.md](performance.md) | PERF-026 | 파일·부분·공백 | `A/pages/resource-pages.test.mjs`, `A/pages/signal-pages.test.mjs` |
| [performance.md](performance.md) | PERF-028 | 파일·부분·공백 | `K/components/chart-card.test.mjs`, `K/components/chart-layer.test.mjs`, `K/components/code-block.test.mjs`, `K/page/boot.test.mjs` |
| [performance.md](performance.md) | PERF-029 | 파일·부분·공백 | `A/desktop/pod-logs.test.cjs`, `A/pages/resource-pages.test.mjs`, `K/components/log-view.test.mjs` |
| [performance.md](performance.md) | PERF-031 | 파일·부분·공백 | `K/shell/hosts/desktop-host.test.mjs`, `K/tools/check-layout.mjs` |
| [performance.md](performance.md) | PERF-032 | 파일·부분·공백 | `K/tools/check-states.mjs` |
| [performance.md](performance.md) | PERF-033 | 파일·부분·공백 | `A/ai-target-flow.test.mjs`, `A/desktop/hub.test.cjs`, `K/page/screen.test.mjs` |
| [product.md](product.md) | FLOW-AGT, FLOW-AI, FLOW-APR, FLOW-CLU, FLOW-GIT, FLOW-INC, FLOW-INV, FLOW-LIST, FLOW-ONB, FLOW-REP, FLOW-SET, FLOW-TOOL, PRD-009, PRD-010 | 고정 없음 | 고정 없음 |
| [product.md](product.md) | PRD-001 | 파일·부분·공백 | `A/data/incident-detect.test.mjs`, `A/data/incident-model.test.mjs`, `A/desktop/hub.test.cjs` |
| [product.md](product.md) | PRD-002 | 파일·부분·공백 | `A/ai-target-flow.test.mjs`, `A/desktop/hub.test.cjs` |
| [product.md](product.md) | PRD-003 | 파일·부분 | `A/desktop/hub.test.cjs` |
| [product.md](product.md) | PRD-004 | 파일·부분·공백 | `A/data/index.test.mjs`, `A/desktop/agent-heartbeat.test.cjs` |
| [product.md](product.md) | PRD-005 | 파일·부분·공백 | `A/pages/resource-inspector.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [product.md](product.md) | PRD-006 | 파일·부분 | `A/data/conn-view.test.mjs`, `A/data/connect-flow.test.mjs`, `A/desktop/provider-connections.test.cjs` |
| [product.md](product.md) | PRD-007, PRD-008 | 선언·점검만 | 원본 점검 항목 |
| [quality.md](quality.md) | Q-001, Q-003, Q-006, Q-014, Q-020, Q-023, Q-025~027, Q-030, Q-035, Q-F-B1-7-2~4, Q-F-U00-3, Q-H-COMMON, Q-H001~078, Q-S-COMMON, Q-S01~20, Q-U-45~51 | 고정 없음 | 고정 없음 |
| [quality.md](quality.md) | Q-002 | 외부·부분 | 외부 참고 장치(저장소 고정 아님) |
| [quality.md](quality.md) | Q-004, Q-005, Q-008~010, Q-012, Q-013, Q-021, Q-024, Q-031~034, Q-F-T1-4, Q-F-U01-3 | 선언·점검만 | 원본 점검 항목 |
| [quality.md](quality.md) | Q-007 | 파일·부분·공백 | `K/tools/check-layout.mjs`, `K/tools/check-states.mjs` |
| [quality.md](quality.md) | Q-011 | 파일·부분 | `K/tools/check-surfaces.test.mjs`, `K/tools/check-tests.test.mjs` |
| [quality.md](quality.md) | Q-022 | 외부·부분 | |
| [quality.md](quality.md) | Q-F-B1-7-1 | 파일·부분 | `A/ai-target-flow.test.mjs` |
| [quality.md](quality.md) | Q-F-C1-4 | 파일·부분 | `K/tools/check-surfaces.test.mjs` |
| [quality.md](quality.md) | Q-U-01 | 파일·부분 | `A/data/live.test.mjs`, `A/desktop/reads/reads.test.cjs`, `K/core/live.test.mjs`, 외부 참고 장치(저장소 고정 아님) |
| [quality.md](quality.md) | Q-U-02 | 파일·부분 | `A/app.config.test.mjs`, `A/data/index.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs`, `A/pages/cluster-home.test.mjs`, `K/core/clock.test.mjs` |
| [quality.md](quality.md) | Q-U-03 | 파일·부분 | `A/data/live.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [quality.md](quality.md) | Q-U-04, Q-U-06 | 파일·부분 | `A/desktop/hub.test.cjs` |
| [quality.md](quality.md) | Q-U-05 | 파일·부분 | `A/data/audit.test.mjs`, `A/desktop/hub.test.cjs` |
| [quality.md](quality.md) | Q-U-07 | 파일·부분 | `A/agent/agent.test.mjs`, `A/data/index.test.mjs`, `A/desktop/agent-heartbeat.test.cjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [quality.md](quality.md) | Q-U-08 | 파일·부분 | `A/data/home.test.mjs`, `A/data/index.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs`, `A/pages/cluster-home.test.mjs`, `K/components/data-table.test.mjs`, `K/components/detail-bar.test.mjs`, `K/components/status-flow.test.mjs`, `K/components/toast.test.mjs` |
| [quality.md](quality.md) | Q-U-09 | 파일·부분 | `A/data/home.test.mjs`, `A/data/index.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs`, `A/pages/cluster-home.test.mjs`, `A/pages/monitoring-parts.test.mjs`, `K/components/chart-card.test.mjs`, `K/core/temporal-chart.test.mjs` |
| [quality.md](quality.md) | Q-U-10~24 | 파일·부분 | `A/data/index.test.mjs`, `A/data/kinds.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs`, `A/pages/resource-inspector.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [quality.md](quality.md) | Q-U-25 | 파일·부분 | `A/data/index.test.mjs`, `A/data/kinds.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs`, `A/pages/resource-inspector.test.mjs` |
| [quality.md](quality.md) | Q-U-26 | 파일·부분 | `A/data/index.test.mjs`, `A/desktop/reads/reads.test.cjs` |
| [quality.md](quality.md) | Q-U-27 | 파일·부분 | `A/data/index.test.mjs`, `A/data/log-excerpt.test.mjs`, `A/desktop/pod-logs.test.cjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [quality.md](quality.md) | Q-U-28 | 파일·부분 | `A/data/alerts.test.mjs`, `A/data/index.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [quality.md](quality.md) | Q-U-29 | 파일·부분 | `A/data/index.test.mjs`, `A/desktop/gitops-deployment.test.cjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [quality.md](quality.md) | Q-U-30 | 파일·부분 | `A/data/index.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [quality.md](quality.md) | Q-U-31 | 파일·부분 | `A/data/index.test.mjs`, `A/data/network.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [quality.md](quality.md) | Q-U-32 | 파일·부분 | `A/app.config.test.mjs`, `A/data/find.test.mjs`, `A/data/index.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [quality.md](quality.md) | Q-U-33 | 파일·부분 | `A/data/incident-detect.test.mjs`, `A/data/incident-model.test.mjs`, `A/data/index.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs`, `A/pages/cluster-home.test.mjs` |
| [quality.md](quality.md) | Q-U-34, Q-U-35 | 파일·부분 | `A/data/incident-model.test.mjs`, `A/data/index.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [quality.md](quality.md) | Q-U-36, Q-U-37 | 파일·부분 | `A/data/index.test.mjs`, `A/data/ownership.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [quality.md](quality.md) | Q-U-38 | 파일·부분 | `A/data/index.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs`, `K/page/kinds/ai/chat.test.mjs` |
| [quality.md](quality.md) | Q-U-39 | 파일·부분 | `A/data/index.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs`, `K/page/boot.test.mjs` |
| [quality.md](quality.md) | Q-U-40 | 파일·부분 | `A/data/index.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs`, `A/desktop/tool-connect.test.cjs`, `A/desktop/tools.test.cjs` |
| [quality.md](quality.md) | Q-U-41 | 파일·부분 | `A/app.config.test.mjs`, `A/data/conn-view.test.mjs`, `A/data/connect-flow.test.mjs`, `A/data/index.test.mjs`, `A/desktop/provider-connections.test.cjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [quality.md](quality.md) | Q-U-42 | 파일·부분 | `A/data/index.test.mjs`, `A/desktop/observability.test.cjs`, `A/desktop/opencost.test.cjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [quality.md](quality.md) | Q-U-43 | 파일·부분 | `A/app.config.test.mjs`, `A/data/index.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs`, `K/core/pane.test.mjs`, `K/desktop/terminal.test.cjs`, `K/shell/hosts/desktop-host.test.mjs`, `K/shell/shell.test.mjs` |
| [quality.md](quality.md) | Q-U-44 | 파일·부분 | `A/data/index.test.mjs`, `A/desktop/hub.test.cjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs`, `A/pages/incident-report-doc.test.mjs`, `K/components/report-canvas.test.mjs`, `K/core/report.test.mjs` |
| [quality.md](quality.md) | Q-U-52 | 파일·부분 | `A/data/ownership.test.mjs`, `A/desktop/services.test.cjs`, `A/desktop/services.test.mjs` |
| [screens/account-menu.md](screens/account-menu.md) | SCR-ACCOUNT-MENU | 파일·부분 | `A/app.config.test.mjs` |
| [screens/account-menu.md](screens/account-menu.md) | SCR-ACCOUNT-MENU-01, SCR-ACCOUNT-MENU-A01, SCR-ACCOUNT-MENU-A02, SCR-ACCOUNT-MENU-G01, SCR-ACCOUNT-MENU-KIT, SCR-ACCOUNT-MENU-V01, SCR-ACCOUNT-MENU-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/agent-detail.md](screens/agent-detail.md) | SCR-AGENT-DETAIL | 파일·부분 | `A/desktop/agent-heartbeat.test.cjs`, `A/desktop/services-agent.test.cjs` |
| [screens/agent-detail.md](screens/agent-detail.md) | SCR-AGENT-DETAIL-01, SCR-AGENT-DETAIL-A01, SCR-AGENT-DETAIL-A02, SCR-AGENT-DETAIL-G01, SCR-AGENT-DETAIL-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/agents.md](screens/agents.md) | SCR-AGENTS | 파일·부분 | `A/desktop/agent-heartbeat.test.cjs`, `A/desktop/services-agent.test.cjs` |
| [screens/agents.md](screens/agents.md) | SCR-AGENT-READY, SCR-AGENTS-01, SCR-AGENTS-A01, SCR-AGENTS-A02, SCR-AGENTS-G01, SCR-AGENTS-V01, SCR-AGENTS-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/agents.md](screens/agents.md) | SCR-AGENTS-REQ-R-006, SCR-AGENTS-REQ-R-056, SCR-AGENTS-REQ-R-057 | 고정 없음 | 고정 없음 |
| [screens/ai-context.md](screens/ai-context.md) | SCR-AI-CONTEXT | 파일·부분 | `A/ai-target-flow.test.mjs`, `A/desktop/ai-target.test.cjs` |
| [screens/ai-context.md](screens/ai-context.md) | SCR-AI-CONTEXT-01, SCR-AI-CONTEXT-A01, SCR-AI-CONTEXT-A02, SCR-AI-CONTEXT-G01, SCR-AI-CONTEXT-V01, SCR-AI-CONTEXT-V02, SCR-AI-GUARD, SCR-AI-TARGET | 선언·점검만 | 원본 점검 항목 |
| [screens/ai-history-detail.md](screens/ai-history-detail.md) | SCR-AI-HISTORY-DETAIL | 파일·부분 | `A/data/audit.test.mjs` |
| [screens/ai-history-detail.md](screens/ai-history-detail.md) | SCR-AI-HISTORY-DETAIL-01, SCR-AI-HISTORY-DETAIL-A01, SCR-AI-HISTORY-DETAIL-A02, SCR-AI-HISTORY-DETAIL-G01, SCR-AI-HISTORY-DETAIL-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/ai-history.md](screens/ai-history.md) | SCR-AI-HISTORY | 파일·부분 | `A/data/audit.test.mjs` |
| [screens/ai-history.md](screens/ai-history.md) | SCR-AI-AUDIT, SCR-AI-HISTORY-01, SCR-AI-HISTORY-A01, SCR-AI-HISTORY-A02, SCR-AI-HISTORY-G01, SCR-AI-HISTORY-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/ai-history.md](screens/ai-history.md) | SCR-AI-HISTORY-REQ-R-035, SCR-AI-HISTORY-REQ-R-055 | 고정 없음 | 고정 없음 |
| [screens/ai-panel.md](screens/ai-panel.md) | SCR-AI-PANEL | 파일·부분 | `A/ai-hub.test.mjs`, `A/ai-target-flow.test.mjs` |
| [screens/ai-panel.md](screens/ai-panel.md) | SCR-AI-ONE-PANE, SCR-AI-PANEL-01, SCR-AI-PANEL-A01~04, SCR-AI-PANEL-G01~04, SCR-AI-PANEL-KIT, SCR-AI-PANEL-V01~03, SCR-AI-PROGRESS, SCR-AI-SCREEN-CONTROL | 선언·점검만 | 원본 점검 항목 |
| [screens/ai-panel.md](screens/ai-panel.md) | SCR-AI-PANEL-REQ-R-040, SCR-AI-PANEL-REQ-R-041 | 고정 없음 | 고정 없음 |
| [screens/alert-detail.md](screens/alert-detail.md) | SCR-ALERT-DETAIL | 파일·부분 | `A/data/alerts.test.mjs`, `A/pages/signal-pages.test.mjs` |
| [screens/alert-detail.md](screens/alert-detail.md) | SCR-ALERT-DETAIL-01, SCR-ALERT-DETAIL-A01~03, SCR-ALERT-DETAIL-G01, SCR-ALERT-DETAIL-G02, SCR-ALERT-DETAIL-V01~03, SCR-ALERT-EXPR | 선언·점검만 | 원본 점검 항목 |
| [screens/alerts.md](screens/alerts.md) | SCR-ALERTS | 파일·부분 | `A/data/alerts.test.mjs`, `A/pages/signal-pages.test.mjs` |
| [screens/alerts.md](screens/alerts.md) | SCR-ALERT-WATCHDOG, SCR-ALERTS-01, SCR-ALERTS-A01, SCR-ALERTS-A02, SCR-ALERTS-G01, SCR-ALERTS-G02, SCR-ALERTS-LAB-P7, SCR-ALERTS-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/alerts.md](screens/alerts.md) | SCR-ALERTS-REQ-R-049 | 고정 없음 | 고정 없음 |
| [screens/approval.md](screens/approval.md) | SCR-APPROVAL | 파일·부분 | `A/desktop/ai-target.test.cjs` |
| [screens/approval.md](screens/approval.md) | SCR-APPROVAL-01, SCR-APPROVAL-A01~03, SCR-APPROVAL-EXEC, SCR-APPROVAL-G01, SCR-APPROVAL-LAB-P6, SCR-APPROVAL-V01, SCR-APPROVAL-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/approval.md](screens/approval.md) | SCR-APPROVAL-REQ-R-038 | 고정 없음 | 고정 없음 |
| [screens/common.md](screens/common.md) | SCR-BRAND-ICONS, SCR-CARD-FOLD, SCR-CARD-SURFACE, SCR-CHANGE-BOUNDARY, SCR-CHART-EMPTY, SCR-CHART-EXPAND, SCR-CHART-PALETTE, SCR-CHART-READ, SCR-CHART-SAMPLES, SCR-DENSITY, SCR-FLOW-DENSITY, SCR-FLOW-MOTION, SCR-FLOW-READ, SCR-ICON-ACTIONS, SCR-KEYBOARD, SCR-LOAD-SKELETON, SCR-NAMESPACE-PICK, SCR-NATIVE-ACCEPT, SCR-NAV-RETURN, SCR-NO-USAGE-BAR, SCR-PAGE-RENDER, SCR-PAGE-WIDTH, SCR-PANE-EDGES, SCR-PANE-MOTION, SCR-PANE-ORDER, SCR-SEARCH-SCOPE, SCR-SECRET-BOUNDARY, SCR-SECTION-OVERFLOW, SCR-SHARED-01~05, SCR-SOURCE-CHIPS, SCR-SOURCE-IDENTITY, SCR-SOURCE-TRUTH, SCR-TABLE-CELLS, SCR-TABLE-EMPTY, SCR-TABLE-OVERFLOW, SCR-TABLE-PAGING, SCR-TABLE-SORT, SCR-TEXT-TERMS, SCR-TIME-CONTROLS, SCR-TIME-FORMAT, SCR-TOAST-OVERLAY, SCR-TYPE-TONE | 선언·점검만 | 원본 점검 항목 |
| [screens/common.md](screens/common.md) | SCR-COMMON-INVENTORY, SCR-COMMON-LAB-SCENES, SCR-COMMON-REQ-R-002~005, SCR-COMMON-REQ-R-007~010, SCR-COMMON-REQ-R-013~017, SCR-COMMON-REQ-R-019, SCR-COMMON-REQ-R-021, SCR-COMMON-REQ-R-023, SCR-COMMON-REQ-R-025, SCR-COMMON-REQ-R-028~033, SCR-COMMON-REQ-R-059, SCR-COMMON-REQ-R-064~069, SCR-COMMON-REQ-R-072, SCR-COMMON-REQ-R-073 | 고정 없음 | 고정 없음 |
| [screens/costs.md](screens/costs.md) | SCR-COSTS | 파일·부분 | `A/desktop/opencost.test.cjs` |
| [screens/costs.md](screens/costs.md) | SCR-COST-AGGREGATE, SCR-COST-IDENTITY, SCR-COST-SOURCE, SCR-COSTS-01, SCR-COSTS-A01, SCR-COSTS-A02, SCR-COSTS-G01, SCR-COSTS-G02, SCR-COSTS-V01~04 | 선언·점검만 | 원본 점검 항목 |
| [screens/dialog-ai-client.md](screens/dialog-ai-client.md) | SCR-DIALOG-AI-CLIENT | 파일·부분 | `A/app.config.test.mjs` |
| [screens/dialog-ai-client.md](screens/dialog-ai-client.md) | SCR-DIALOG-AI-CLIENT-01, SCR-DIALOG-AI-CLIENT-A01, SCR-DIALOG-AI-CLIENT-A02, SCR-DIALOG-AI-CLIENT-G01, SCR-DIALOG-AI-CLIENT-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/dialog-chat-delete.md](screens/dialog-chat-delete.md) | SCR-DIALOG-CHAT-DELETE | 파일·격리 시험, Electron 미검증 | `A/chat-lifecycle.test.mjs`의 chat_actions_use_service_before_success_and_delete_only_after_confirmation, `kit/page/kinds/ai/chat.test.mjs`의 createChatPage_deleted_conversation_clears_body_and_keeps_other_conversations |
| [screens/dialog-chat-delete.md](screens/dialog-chat-delete.md) | SCR-DIALOG-CHAT-DELETE-01, SCR-DIALOG-CHAT-DELETE-A01, SCR-DIALOG-CHAT-DELETE-A02, SCR-DIALOG-CHAT-DELETE-G01, SCR-DIALOG-CHAT-DELETE-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/dialog-folder-delete.md](screens/dialog-folder-delete.md) | SCR-DIALOG-FOLDER-DELETE | 파일·부분 | `A/app.config.test.mjs` |
| [screens/dialog-folder-delete.md](screens/dialog-folder-delete.md) | SCR-DIALOG-FOLDER-DELETE-01, SCR-DIALOG-FOLDER-DELETE-A01, SCR-DIALOG-FOLDER-DELETE-A02, SCR-DIALOG-FOLDER-DELETE-G01, SCR-DIALOG-FOLDER-DELETE-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/dialog-folder-rename.md](screens/dialog-folder-rename.md) | SCR-DIALOG-FOLDER-RENAME | 파일·부분 | `A/app.config.test.mjs` |
| [screens/dialog-folder-rename.md](screens/dialog-folder-rename.md) | SCR-DIALOG-FOLDER-RENAME-01, SCR-DIALOG-FOLDER-RENAME-A01, SCR-DIALOG-FOLDER-RENAME-A02, SCR-DIALOG-FOLDER-RENAME-G01, SCR-DIALOG-FOLDER-RENAME-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/dialog-group-bookmark.md](screens/dialog-group-bookmark.md) | SCR-DIALOG-GROUP-BOOKMARK | 파일·부분 | `A/app.config.test.mjs` |
| [screens/dialog-group-bookmark.md](screens/dialog-group-bookmark.md) | SCR-DIALOG-GROUP-BOOKMARK-01, SCR-DIALOG-GROUP-BOOKMARK-A01, SCR-DIALOG-GROUP-BOOKMARK-A02, SCR-DIALOG-GROUP-BOOKMARK-G01, SCR-DIALOG-GROUP-BOOKMARK-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/dialog-namespace.md](screens/dialog-namespace.md) | SCR-DIALOG-NAMESPACE | 파일·부분 | `A/app.config.test.mjs` |
| [screens/dialog-namespace.md](screens/dialog-namespace.md) | SCR-DIALOG-NAMESPACE-01, SCR-DIALOG-NAMESPACE-A01, SCR-DIALOG-NAMESPACE-A02, SCR-DIALOG-NAMESPACE-G01, SCR-DIALOG-NAMESPACE-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/dialog-permission.md](screens/dialog-permission.md) | SCR-DIALOG-PERMISSION | 파일·부분 | `A/app.config.test.mjs` |
| [screens/dialog-permission.md](screens/dialog-permission.md) | SCR-DIALOG-PERMISSION-01, SCR-DIALOG-PERMISSION-A01, SCR-DIALOG-PERMISSION-A02, SCR-DIALOG-PERMISSION-G01, SCR-DIALOG-PERMISSION-KIT, SCR-DIALOG-PERMISSION-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/dialog-quit.md](screens/dialog-quit.md) | SCR-DIALOG-QUIT | 파일·부분 | `A/app.config.test.mjs` |
| [screens/dialog-quit.md](screens/dialog-quit.md) | SCR-DIALOG-QUIT-01, SCR-DIALOG-QUIT-A01, SCR-DIALOG-QUIT-A02, SCR-DIALOG-QUIT-G01, SCR-DIALOG-QUIT-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/dialog-update-error.md](screens/dialog-update-error.md) | SCR-DIALOG-UPDATE-ERROR | 파일·부분 | `A/app.config.test.mjs` |
| [screens/dialog-update-error.md](screens/dialog-update-error.md) | SCR-DIALOG-UPDATE-ERROR-01, SCR-DIALOG-UPDATE-ERROR-A01, SCR-DIALOG-UPDATE-ERROR-A02, SCR-DIALOG-UPDATE-ERROR-G01, SCR-DIALOG-UPDATE-ERROR-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/event-detail.md](screens/event-detail.md) | SCR-EVENT-DETAIL | 파일·부분 | `A/pages/resource-inspector.test.mjs` |
| [screens/event-detail.md](screens/event-detail.md) | SCR-EVENT-DETAIL-01, SCR-EVENT-DETAIL-A01, SCR-EVENT-DETAIL-A02, SCR-EVENT-DETAIL-G01, SCR-EVENT-DETAIL-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/events.md](screens/events.md) | SCR-EVENTS | 파일·부분 | `A/data/kinds.test.mjs`, `A/pages/signal-pages.test.mjs` |
| [screens/events.md](screens/events.md) | SCR-EVENT-FILTER, SCR-EVENT-INVESTIGATE, SCR-EVENT-PROCESS, SCR-EVENTS-01, SCR-EVENTS-A01~03, SCR-EVENTS-G01, SCR-EVENTS-G02, SCR-EVENTS-V01~03, SCR-TIMELINE-READ | 선언·점검만 | 원본 점검 항목 |
| [screens/events.md](screens/events.md) | SCR-EVENTS-REQ-R-047 | 고정 없음 | 고정 없음 |
| [screens/evidence.md](screens/evidence.md) | SCR-EVIDENCE | 파일·부분 | `A/data/incident-model.test.mjs` |
| [screens/evidence.md](screens/evidence.md) | SCR-EVIDENCE-01, SCR-EVIDENCE-A01, SCR-EVIDENCE-A02, SCR-EVIDENCE-G01, SCR-EVIDENCE-G02, SCR-EVIDENCE-V01~04 | 선언·점검만 | 원본 점검 항목 |
| [screens/evidence.md](screens/evidence.md) | SCR-EVIDENCE-REQ-R-034, SCR-EVIDENCE-REQ-R-071 | 고정 없음 | 고정 없음 |
| [screens/gitops-detail.md](screens/gitops-detail.md) | SCR-GITOPS-DETAIL | 파일·부분 | `A/data/gitops-view.test.mjs`, `A/desktop/gitops-deployment.test.cjs` |
| [screens/gitops-detail.md](screens/gitops-detail.md) | SCR-GITOPS-DETAIL-01, SCR-GITOPS-DETAIL-A01~03, SCR-GITOPS-DETAIL-G01, SCR-GITOPS-DETAIL-G02, SCR-GITOPS-DETAIL-V01~04, SCR-GITOPS-DIFF | 선언·점검만 | 원본 점검 항목 |
| [screens/gitops-detail.md](screens/gitops-detail.md) | SCR-GITOPS-DETAIL-REQ-R-046 | 고정 없음 | 고정 없음 |
| [screens/gitops.md](screens/gitops.md) | SCR-GITOPS | 파일·부분 | `A/data/gitops-view.test.mjs`, `A/desktop/gitops-deployment.test.cjs` |
| [screens/gitops.md](screens/gitops.md) | SCR-GITOPS-01, SCR-GITOPS-A01~03, SCR-GITOPS-AXES, SCR-GITOPS-CARD, SCR-GITOPS-G01, SCR-GITOPS-G02, SCR-GITOPS-HISTORY, SCR-GITOPS-STAGES, SCR-GITOPS-V01~04 | 선언·점검만 | 원본 점검 항목 |
| [screens/helm-detail.md](screens/helm-detail.md) | SCR-HELM-DETAIL | 파일·부분 | `A/pages/signal-pages.test.mjs` |
| [screens/helm-detail.md](screens/helm-detail.md) | SCR-HELM-DETAIL-01, SCR-HELM-DETAIL-A01, SCR-HELM-DETAIL-A02, SCR-HELM-DETAIL-G01, SCR-HELM-DETAIL-V01, SCR-HELM-DETAIL-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/home.md](screens/home.md) | SCR-HOME | 파일·부분 | `A/data/home.test.mjs`, `A/pages/cluster-home.test.mjs` |
| [screens/home.md](screens/home.md) | SCR-HOME-01, SCR-HOME-A01~03, SCR-HOME-DUPLICATE, SCR-HOME-FIRST, SCR-HOME-G01~03, SCR-HOME-V01~05 | 선언·점검만 | 원본 점검 항목 |
| [screens/home.md](screens/home.md) | SCR-HOME-REQ-R-042, SCR-HOME-REQ-R-063 | 고정 없음 | 고정 없음 |
| [screens/incident-action.md](screens/incident-action.md) | SCR-INCIDENT-ACTION | 파일·부분 | `A/data/incident-model.test.mjs` |
| [screens/incident-action.md](screens/incident-action.md) | SCR-INCIDENT-ACTION-01, SCR-INCIDENT-ACTION-A01, SCR-INCIDENT-ACTION-A02, SCR-INCIDENT-ACTION-G01, SCR-INCIDENT-ACTION-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/incident-action.md](screens/incident-action.md) | SCR-INCIDENT-ACTION-REQ-R-052 | 고정 없음 | 고정 없음 |
| [screens/incident-cause.md](screens/incident-cause.md) | SCR-INCIDENT-CAUSE | 파일·부분 | `A/data/incident-model.test.mjs` |
| [screens/incident-cause.md](screens/incident-cause.md) | SCR-INCIDENT-CAUSE-01, SCR-INCIDENT-CAUSE-A01, SCR-INCIDENT-CAUSE-A02, SCR-INCIDENT-CAUSE-G01, SCR-INCIDENT-CAUSE-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/incident-cause.md](screens/incident-cause.md) | SCR-INCIDENT-CAUSE-REQ-R-070 | 고정 없음 | 고정 없음 |
| [screens/incident-record.md](screens/incident-record.md) | SCR-INCIDENT-RECORD | 파일·부분 | `A/data/incident-model.test.mjs` |
| [screens/incident-record.md](screens/incident-record.md) | SCR-INCIDENT-RECORD-01, SCR-INCIDENT-RECORD-A01, SCR-INCIDENT-RECORD-A02, SCR-INCIDENT-RECORD-G01, SCR-INCIDENT-RECORD-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/incident-scope.md](screens/incident-scope.md) | SCR-INCIDENT-SCOPE | 파일·부분 | `A/data/incident-model.test.mjs` |
| [screens/incident-scope.md](screens/incident-scope.md) | SCR-INCIDENT-SCOPE-01, SCR-INCIDENT-SCOPE-A01, SCR-INCIDENT-SCOPE-A02, SCR-INCIDENT-SCOPE-G01, SCR-INCIDENT-SCOPE-V01, SCR-INCIDENT-SUMMARY | 선언·점검만 | 원본 점검 항목 |
| [screens/incident-timeline.md](screens/incident-timeline.md) | SCR-INCIDENT-TIMELINE | 파일·부분 | `A/data/incident-model.test.mjs` |
| [screens/incident-timeline.md](screens/incident-timeline.md) | SCR-INCIDENT-TIMELINE-01, SCR-INCIDENT-TIMELINE-A01, SCR-INCIDENT-TIMELINE-A02, SCR-INCIDENT-TIMELINE-G01, SCR-INCIDENT-TIMELINE-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/incident-verify.md](screens/incident-verify.md) | SCR-INCIDENT-VERIFY | 파일·부분 | `A/data/incident-model.test.mjs` |
| [screens/incident-verify.md](screens/incident-verify.md) | SCR-INCIDENT-VERIFY-01, SCR-INCIDENT-VERIFY-A01, SCR-INCIDENT-VERIFY-A02, SCR-INCIDENT-VERIFY-G01, SCR-INCIDENT-VERIFY-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/incident-verify.md](screens/incident-verify.md) | SCR-INCIDENT-VERIFY-REQ-R-054 | 고정 없음 | 고정 없음 |
| [screens/incident-workspace.md](screens/incident-workspace.md) | SCR-INCIDENT-WORKSPACE | 파일·부분 | `A/data/incident-model.test.mjs` |
| [screens/incident-workspace.md](screens/incident-workspace.md) | SCR-INCIDENT-CHOICE, SCR-INCIDENT-CYCLE, SCR-INCIDENT-WORKSPACE-01, SCR-INCIDENT-WORKSPACE-A01~03, SCR-INCIDENT-WORKSPACE-G01, SCR-INCIDENT-WORKSPACE-G02, SCR-INCIDENT-WORKSPACE-V01, SCR-INCIDENT-WORKSPACE-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/incident-workspace.md](screens/incident-workspace.md) | SCR-INCIDENT-WORKSPACE-FIELDS, SCR-INCIDENT-WORKSPACE-REQ-R-001, SCR-INCIDENT-WORKSPACE-REQ-R-051 | 고정 없음 | 고정 없음 |
| [screens/incidents.md](screens/incidents.md) | SCR-INCIDENTS | 파일·부분 | `A/data/incident-detect.test.mjs`, `A/data/incident-model.test.mjs` |
| [screens/incidents.md](screens/incidents.md) | SCR-INCIDENT-CONNECTION, SCR-INCIDENTS-01, SCR-INCIDENTS-A01, SCR-INCIDENTS-A02, SCR-INCIDENTS-G01, SCR-INCIDENTS-LAB-P1~3, SCR-INCIDENTS-V01, SCR-INCIDENTS-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/incidents.md](screens/incidents.md) | SCR-INCIDENTS-REQ-R-050 | 고정 없음 | 고정 없음 |
| [screens/logs.md](screens/logs.md) | SCR-LOGS | 파일·부분 | `A/data/log-excerpt.test.mjs`, `A/desktop/pod-logs.test.cjs`, `A/pages/signal-pages.test.mjs` |
| [screens/logs.md](screens/logs.md) | SCR-LOG-BOUND, SCR-LOG-KUBERNETES, SCR-LOG-LOKI, SCR-LOG-WINDOW, SCR-LOGS-01, SCR-LOGS-A01~03, SCR-LOGS-G01, SCR-LOGS-G02, SCR-LOGS-V01~04 | 선언·점검만 | 원본 점검 항목 |
| [screens/logs.md](screens/logs.md) | SCR-LOGS-REQ-R-048 | 고정 없음 | 고정 없음 |
| [screens/metrics.md](screens/metrics.md) | SCR-METRICS | 파일·부분 | `A/data/home.test.mjs`, `A/pages/monitoring-parts.test.mjs` |
| [screens/metrics.md](screens/metrics.md) | SCR-METRICS-01, SCR-METRICS-A01, SCR-METRICS-A02, SCR-METRICS-ENTRY, SCR-METRICS-G01, SCR-METRICS-G02, SCR-METRICS-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/metrics.md](screens/metrics.md) | SCR-METRICS-REQ-R-043 | 고정 없음 | 고정 없음 |
| [screens/network.md](screens/network.md) | SCR-NETWORK | 파일·부분 | `A/data/network.test.mjs`, `A/pages/signal-pages.test.mjs` |
| [screens/network.md](screens/network.md) | SCR-NETWORK-01, SCR-NETWORK-A01, SCR-NETWORK-A02, SCR-NETWORK-G01, SCR-NETWORK-G02, SCR-NETWORK-LAB-P4, SCR-NETWORK-TRUTH, SCR-NETWORK-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/network.md](screens/network.md) | SCR-NETWORK-REQ-R-045 | 고정 없음 | 고정 없음 |
| [screens/new-tab.md](screens/new-tab.md) | SCR-NEW-TAB | 파일·부분 | `A/start-conversations.test.mjs` |
| [screens/new-tab.md](screens/new-tab.md) | SCR-NEW-TAB-01, SCR-NEW-TAB-A01, SCR-NEW-TAB-A02, SCR-NEW-TAB-G01, SCR-NEW-TAB-SHAPE, SCR-NEW-TAB-V01, SCR-NEW-TAB-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/onboarding-ai.md](screens/onboarding-ai.md) | SCR-ONBOARDING-AI | 파일·부분 | `A/app.config.test.mjs`, `A/data/connect-flow.test.mjs` |
| [screens/onboarding-ai.md](screens/onboarding-ai.md) | SCR-ONBOARDING-AI-01, SCR-ONBOARDING-AI-A01, SCR-ONBOARDING-AI-A02, SCR-ONBOARDING-AI-G01, SCR-ONBOARDING-AI-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/onboarding-clusters.md](screens/onboarding-clusters.md) | SCR-ONBOARDING-CLUSTERS | 파일·부분 | `A/app.config.test.mjs`, `A/data/connect-flow.test.mjs` |
| [screens/onboarding-clusters.md](screens/onboarding-clusters.md) | SCR-ONBOARDING-CLUSTERS-01, SCR-ONBOARDING-CLUSTERS-A01, SCR-ONBOARDING-CLUSTERS-A02, SCR-ONBOARDING-CLUSTERS-G01, SCR-ONBOARDING-CLUSTERS-V01, SCR-ONBOARDING-CLUSTERS-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/onboarding-clusters.md](screens/onboarding-clusters.md) | SCR-ONBOARDING-CLUSTERS-REQ-R-058 | 고정 없음 | 고정 없음 |
| [screens/onboarding-done.md](screens/onboarding-done.md) | SCR-ONBOARDING-DONE | 파일·부분 | `A/app.config.test.mjs`, `A/data/connect-flow.test.mjs` |
| [screens/onboarding-done.md](screens/onboarding-done.md) | SCR-ONBOARDING-DONE-01, SCR-ONBOARDING-DONE-A01, SCR-ONBOARDING-DONE-A02, SCR-ONBOARDING-DONE-G01, SCR-ONBOARDING-DONE-V01, SCR-ONBOARDING-DONE-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/onboarding-permission.md](screens/onboarding-permission.md) | SCR-ONBOARDING-PERMISSION | 파일·부분 | `A/app.config.test.mjs`, `A/data/connect-flow.test.mjs` |
| [screens/onboarding-permission.md](screens/onboarding-permission.md) | SCR-ONBOARDING-PERMISSION-01, SCR-ONBOARDING-PERMISSION-A01, SCR-ONBOARDING-PERMISSION-G01, SCR-ONBOARDING-PERMISSION-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/onboarding-welcome.md](screens/onboarding-welcome.md) | SCR-ONBOARDING-WELCOME | 파일·부분 | `A/app.config.test.mjs`, `A/data/connect-flow.test.mjs` |
| [screens/onboarding-welcome.md](screens/onboarding-welcome.md) | SCR-ONBOARDING-WELCOME-01, SCR-ONBOARDING-WELCOME-A01, SCR-ONBOARDING-WELCOME-G01, SCR-ONBOARDING-WELCOME-KIT, SCR-ONBOARDING-WELCOME-V01 | 선언·점검만 | 원본 점검 항목 |
| [screens/palette.md](screens/palette.md) | SCR-PALETTE | 파일·부분 | `A/data/find.test.mjs` |
| [screens/palette.md](screens/palette.md) | SCR-PALETTE-01, SCR-PALETTE-A01, SCR-PALETTE-A02, SCR-PALETTE-G01, SCR-PALETTE-KIT, SCR-PALETTE-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/report.md](screens/report.md) | SCR-REPORT | 파일·부분 | `A/pages/incident-report-doc.test.mjs` |
| [screens/report.md](screens/report.md) | SCR-REPORT-01, SCR-REPORT-A01~03, SCR-REPORT-BUILD, SCR-REPORT-CAUSE, SCR-REPORT-CHANNEL, SCR-REPORT-CHART, SCR-REPORT-CLOSED, SCR-REPORT-DAILY, SCR-REPORT-DATE, SCR-REPORT-DOCUMENT, SCR-REPORT-EDIT, SCR-REPORT-EXCERPT, SCR-REPORT-EXPORT, SCR-REPORT-G01~03, SCR-REPORT-HEAD, SCR-REPORT-LINKS, SCR-REPORT-NO-DUPLICATE, SCR-REPORT-OPEN, SCR-REPORT-PAGINATION, SCR-REPORT-RECOVERY, SCR-REPORT-SELECTION, SCR-REPORT-TABLE, SCR-REPORT-V01~03, SCR-REPORT-VALUE | 선언·점검만 | 원본 점검 항목 |
| [screens/report.md](screens/report.md) | SCR-REPORT-REQ-R-020, SCR-REPORT-REQ-R-060~062 | 고정 없음 | 고정 없음 |
| [screens/resource-events.md](screens/resource-events.md) | SCR-RESOURCE-EVENTS | 파일·부분 | `A/pages/resource-inspector.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [screens/resource-events.md](screens/resource-events.md) | SCR-RESOURCE-EVENTS-01, SCR-RESOURCE-EVENTS-A01, SCR-RESOURCE-EVENTS-A02, SCR-RESOURCE-EVENTS-G01, SCR-RESOURCE-EVENTS-V01, SCR-RESOURCE-EVENTS-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/resource-events.md](screens/resource-events.md) | SCR-RESOURCE-EVENTS-CURRENT-EXCEPTION | 고정 없음 | 고정 없음 |
| [screens/resource-list.md](screens/resource-list.md) | SCR-RESOURCE-LIST | 파일·부분 | `A/data/kinds.test.mjs`, `A/data/ownership.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [screens/resource-list.md](screens/resource-list.md) | SCR-RESOURCE-KINDS, SCR-RESOURCE-LIST-01, SCR-RESOURCE-LIST-A01~03, SCR-RESOURCE-LIST-G01~03, SCR-RESOURCE-LIST-V01~04 | 선언·점검만 | 원본 점검 항목 |
| [screens/resource-list.md](screens/resource-list.md) | SCR-RESOURCE-LIST-KINDS, SCR-RESOURCE-LIST-REQ-R-044, SCR-RESOURCE-LIST-UNSUPPORTED | 고정 없음 | 고정 없음 |
| [screens/resource-logs.md](screens/resource-logs.md) | SCR-RESOURCE-LOGS | 파일·부분 | `A/pages/resource-inspector.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [screens/resource-logs.md](screens/resource-logs.md) | SCR-RESOURCE-LOGS-01, SCR-RESOURCE-LOGS-A01~03, SCR-RESOURCE-LOGS-G01, SCR-RESOURCE-LOGS-V01, SCR-RESOURCE-LOGS-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/resource-logs.md](screens/resource-logs.md) | SCR-RESOURCE-LOGS-BOUNDS | 고정 없음 | 고정 없음 |
| [screens/resource-relations.md](screens/resource-relations.md) | SCR-RESOURCE-RELATIONS | 파일·부분 | `A/pages/resource-inspector.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [screens/resource-relations.md](screens/resource-relations.md) | SCR-RESOURCE-RELATIONS-01, SCR-RESOURCE-RELATIONS-A01, SCR-RESOURCE-RELATIONS-A02, SCR-RESOURCE-RELATIONS-G01, SCR-RESOURCE-RELATIONS-V01, SCR-RESOURCE-RELATIONS-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/resource-rollout.md](screens/resource-rollout.md) | SCR-RESOURCE-ROLLOUT | 파일·부분 | `A/pages/resource-inspector.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [screens/resource-rollout.md](screens/resource-rollout.md) | SCR-RESOURCE-ROLLOUT-01, SCR-RESOURCE-ROLLOUT-A01, SCR-RESOURCE-ROLLOUT-A02, SCR-RESOURCE-ROLLOUT-G01, SCR-RESOURCE-ROLLOUT-LAB-P5, SCR-RESOURCE-ROLLOUT-V01, SCR-RESOURCE-ROLLOUT-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/resource-runs.md](screens/resource-runs.md) | SCR-RESOURCE-RUNS | 파일·부분 | `A/pages/resource-inspector.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [screens/resource-runs.md](screens/resource-runs.md) | SCR-RESOURCE-RUNS-01, SCR-RESOURCE-RUNS-A01, SCR-RESOURCE-RUNS-G01, SCR-RESOURCE-RUNS-V01, SCR-RESOURCE-RUNS-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/resource-summary.md](screens/resource-summary.md) | SCR-RESOURCE-SUMMARY | 파일·부분 | `A/pages/resource-inspector.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [screens/resource-summary.md](screens/resource-summary.md) | SCR-RESOURCE-DEPTH, SCR-RESOURCE-ORDER, SCR-RESOURCE-SUMMARY-01, SCR-RESOURCE-SUMMARY-A01~03, SCR-RESOURCE-SUMMARY-G01, SCR-RESOURCE-SUMMARY-G02, SCR-RESOURCE-SUMMARY-V01~04 | 선언·점검만 | 원본 점검 항목 |
| [screens/resource-summary.md](screens/resource-summary.md) | SCR-RESOURCE-SUMMARY-REQ-R-027 | 고정 없음 | 고정 없음 |
| [screens/resource-yaml.md](screens/resource-yaml.md) | SCR-RESOURCE-YAML | 파일·부분 | `A/pages/resource-inspector.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [screens/resource-yaml.md](screens/resource-yaml.md) | SCR-RESOURCE-YAML-01, SCR-RESOURCE-YAML-A01~03, SCR-RESOURCE-YAML-G01, SCR-RESOURCE-YAML-V01, SCR-RESOURCE-YAML-V02, SCR-YAML-READ | 선언·점검만 | 원본 점검 항목 |
| [screens/search.md](screens/search.md) | SCR-SEARCH | 파일·부분 | `A/data/find.test.mjs` |
| [screens/search.md](screens/search.md) | SCR-SEARCH-01, SCR-SEARCH-A01~03, SCR-SEARCH-G01~03, SCR-SEARCH-V01, SCR-SEARCH-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/search.md](screens/search.md) | SCR-SEARCH-COVERAGE, SCR-SEARCH-REQ-R-026 | 고정 없음 | 고정 없음 |
| [screens/settings-agents.md](screens/settings-agents.md) | SCR-SETTINGS-AGENTS | 파일·부분 | `A/app.config.test.mjs`, `A/settings-icons.test.mjs` |
| [screens/settings-agents.md](screens/settings-agents.md) | SCR-SETTINGS-AGENTS-01, SCR-SETTINGS-AGENTS-A01~03, SCR-SETTINGS-AGENTS-G01, SCR-SETTINGS-AGENTS-V01, SCR-SETTINGS-AGENTS-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/settings-ai-chat.md](screens/settings-ai-chat.md) | SCR-SETTINGS-AI-CHAT | 파일·부분 | `A/app.config.test.mjs`, `A/settings-icons.test.mjs` |
| [screens/settings-ai-chat.md](screens/settings-ai-chat.md) | SCR-SETTINGS-AI-CHAT-01, SCR-SETTINGS-AI-CHAT-A01~03, SCR-SETTINGS-AI-CHAT-G01, SCR-SETTINGS-AI-CHAT-V01~04 | 선언·점검만 | 원본 점검 항목 |
| [screens/settings-ai-connect.md](screens/settings-ai-connect.md) | SCR-SETTINGS-AI-CONNECT | 파일·부분 | `A/app.config.test.mjs`, `A/settings-icons.test.mjs` |
| [screens/settings-ai-connect.md](screens/settings-ai-connect.md) | SCR-AI-CLIENTS, SCR-SETTINGS-AI-CONNECT-01, SCR-SETTINGS-AI-CONNECT-A01~03, SCR-SETTINGS-AI-CONNECT-G01, SCR-SETTINGS-AI-CONNECT-G02, SCR-SETTINGS-AI-CONNECT-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/settings-ai-connect.md](screens/settings-ai-connect.md) | SCR-SETTINGS-AI-CONNECT-REQ-R-036, SCR-SETTINGS-AI-CONNECT-REQ-R-037, SCR-SETTINGS-AI-CONNECT-REQ-R-039 | 고정 없음 | 고정 없음 |
| [screens/settings-ai-models.md](screens/settings-ai-models.md) | SCR-SETTINGS-AI-MODELS | 파일·부분 | `A/app.config.test.mjs`, `A/settings-icons.test.mjs` |
| [screens/settings-ai-models.md](screens/settings-ai-models.md) | SCR-SETTINGS-AI-MODELS-01, SCR-SETTINGS-AI-MODELS-A01~03, SCR-SETTINGS-AI-MODELS-G01, SCR-SETTINGS-AI-MODELS-G02, SCR-SETTINGS-AI-MODELS-V01~04 | 선언·점검만 | 원본 점검 항목 |
| [screens/settings-ai-models.md](screens/settings-ai-models.md) | SCR-SETTINGS-AI-MODELS-REQ-R-012 | 고정 없음 | 고정 없음 |
| [screens/settings-appearance.md](screens/settings-appearance.md) | SCR-SETTINGS-APPEARANCE | 파일·부분 | `A/app.config.test.mjs`, `A/settings-icons.test.mjs` |
| [screens/settings-appearance.md](screens/settings-appearance.md) | SCR-SETTINGS-APPEARANCE-01, SCR-SETTINGS-APPEARANCE-A01~03, SCR-SETTINGS-APPEARANCE-G01, SCR-SETTINGS-APPEARANCE-V01~09 | 선언·점검만 | 원본 점검 항목 |
| [screens/settings-archive.md](screens/settings-archive.md) | SCR-SETTINGS-ARCHIVE | 파일·격리 시험, Electron 미검증 | `A/chat-lifecycle.test.mjs`, `A/desktop/hub-store.test.cjs`, `A/app.config.test.mjs`, `A/settings-icons.test.mjs` |
| [screens/settings-archive.md](screens/settings-archive.md) | SCR-SETTINGS-ARCHIVE-01, SCR-SETTINGS-ARCHIVE-A01~03, SCR-SETTINGS-ARCHIVE-G01, SCR-SETTINGS-ARCHIVE-G02, SCR-SETTINGS-ARCHIVE-V01~04 | 선언·점검만 | 원본 점검 항목 |
| [screens/settings-archive.md](screens/settings-archive.md) | SCR-SETTINGS-ARCHIVE-RETENTION | 격리 저장소 시험 통과, Electron 미검증 | `A/desktop/hub-store.test.cjs`의 prune_default_keeps_conversations_365_days_events_7_and_other_records_90, prune_uses_saved_conversation_selection_on_restart_and_each_cleanup |
| [screens/settings-cluster-detail.md](screens/settings-cluster-detail.md) | SCR-SETTINGS-CLUSTER-DETAIL | 파일·부분 | `A/app.config.test.mjs`, `A/settings-icons.test.mjs` |
| [screens/settings-cluster-detail.md](screens/settings-cluster-detail.md) | SCR-SETTINGS-CLUSTER-DETAIL-01, SCR-SETTINGS-CLUSTER-DETAIL-A01~03, SCR-SETTINGS-CLUSTER-DETAIL-G01, SCR-SETTINGS-CLUSTER-DETAIL-V01~06 | 선언·점검만 | 원본 점검 항목 |
| [screens/settings-clusters.md](screens/settings-clusters.md) | SCR-SETTINGS-CLUSTERS | 파일·부분 | `A/app.config.test.mjs`, `A/settings-icons.test.mjs` |
| [screens/settings-clusters.md](screens/settings-clusters.md) | SCR-CONNECT-ENTRY, SCR-CONNECT-STATE, SCR-SETTINGS-CLUSTERS-01, SCR-SETTINGS-CLUSTERS-A01~03, SCR-SETTINGS-CLUSTERS-G01, SCR-SETTINGS-CLUSTERS-V01~04 | 선언·점검만 | 원본 점검 항목 |
| [screens/settings-general.md](screens/settings-general.md) | SCR-SETTINGS-GENERAL | 파일·부분 | `A/app.config.test.mjs`, `A/settings-icons.test.mjs` |
| [screens/settings-general.md](screens/settings-general.md) | SCR-SETTINGS-CONSUMERS, SCR-SETTINGS-GENERAL-01, SCR-SETTINGS-GENERAL-A01~03, SCR-SETTINGS-GENERAL-G01, SCR-SETTINGS-GENERAL-V01~07 | 선언·점검만 | 원본 점검 항목 |
| [screens/settings-git.md](screens/settings-git.md) | SCR-SETTINGS-GIT | 파일·부분 | `A/app.config.test.mjs`, `A/settings-icons.test.mjs` |
| [screens/settings-git.md](screens/settings-git.md) | SCR-SETTINGS-GIT-01, SCR-SETTINGS-GIT-A01~03, SCR-SETTINGS-GIT-G01, SCR-SETTINGS-GIT-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/settings-git.md](screens/settings-git.md) | SCR-SETTINGS-GIT-REQ-R-053 | 고정 없음 | 고정 없음 |
| [screens/settings-permissions.md](screens/settings-permissions.md) | SCR-SETTINGS-PERMISSIONS | 파일·부분 | `A/app.config.test.mjs`, `A/settings-icons.test.mjs` |
| [screens/settings-permissions.md](screens/settings-permissions.md) | SCR-SETTINGS-PERMISSIONS-01, SCR-SETTINGS-PERMISSIONS-A01~03, SCR-SETTINGS-PERMISSIONS-G01, SCR-SETTINGS-PERMISSIONS-V01~04 | 선언·점검만 | 원본 점검 항목 |
| [screens/settings-permissions.md](screens/settings-permissions.md) | SCR-SETTINGS-PERMISSIONS-REQ-R-011 | 고정 없음 | 고정 없음 |
| [screens/settings-tools.md](screens/settings-tools.md) | SCR-SETTINGS-TOOLS | 파일·부분 | `A/app.config.test.mjs`, `A/settings-icons.test.mjs` |
| [screens/settings-tools.md](screens/settings-tools.md) | SCR-SETTINGS-TOOLS-01, SCR-SETTINGS-TOOLS-A01~03, SCR-SETTINGS-TOOLS-G01, SCR-SETTINGS-TOOLS-V01~04 | 선언·점검만 | 원본 점검 항목 |
| [screens/settings.md](screens/settings.md) | SCR-SETTINGS | 파일·부분 | `A/app.config.test.mjs`, `A/settings-icons.test.mjs` |
| [screens/settings.md](screens/settings.md) | SCR-SETTING-STATE, SCR-SETTINGS-01, SCR-SETTINGS-A01~03, SCR-SETTINGS-FRAME, SCR-SETTINGS-G01, SCR-SETTINGS-G02, SCR-SETTINGS-KIT, SCR-SETTINGS-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/sidebar.md](screens/sidebar.md) | SCR-SIDEBAR | 파일·부분 | `A/app.config.test.mjs` |
| [screens/sidebar.md](screens/sidebar.md) | SCR-SIDEBAR-01, SCR-SIDEBAR-A01~03, SCR-SIDEBAR-G01, SCR-SIDEBAR-G02, SCR-SIDEBAR-GROUPS, SCR-SIDEBAR-KIT, SCR-SIDEBAR-V01~04 | 선언·점검만 | 원본 점검 항목 |
| [screens/sidebar.md](screens/sidebar.md) | SCR-SIDEBAR-REQ-R-024 | 고정 없음 | 고정 없음 |
| [screens/terminal.md](screens/terminal.md) | SCR-TERMINAL | 파일·부분 | `A/desktop/services.test.cjs` |
| [screens/terminal.md](screens/terminal.md) | SCR-TERMINAL-01, SCR-TERMINAL-A01, SCR-TERMINAL-A02, SCR-TERMINAL-G01, SCR-TERMINAL-KIT, SCR-TERMINAL-TARGET, SCR-TERMINAL-V01, SCR-TERMINAL-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/tool-api.md](screens/tool-api.md) | SCR-TOOL-API | 파일·부분 | `A/desktop/tools.test.cjs` |
| [screens/tool-api.md](screens/tool-api.md) | SCR-TOOL-API-01, SCR-TOOL-API-A01~03, SCR-TOOL-API-G01, SCR-TOOL-API-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/tool-detail.md](screens/tool-detail.md) | SCR-TOOL-DETAIL | 파일·부분 | `A/tool-surfaces.test.mjs` |
| [screens/tool-detail.md](screens/tool-detail.md) | SCR-TOOL-DETAIL-01, SCR-TOOL-DETAIL-A01, SCR-TOOL-DETAIL-A02, SCR-TOOL-DETAIL-G01, SCR-TOOL-DETAIL-G02, SCR-TOOL-DETAIL-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/tools.md](screens/tools.md) | SCR-TOOLS | 파일·부분 | `A/data/conn-view.test.mjs`, `A/tool-surfaces.test.mjs` |
| [screens/tools.md](screens/tools.md) | SCR-TOOL-OPEN, SCR-TOOLS-01, SCR-TOOLS-A01, SCR-TOOLS-A02, SCR-TOOLS-G01, SCR-TOOLS-G02, SCR-TOOLS-V01, SCR-TOOLS-V02 | 선언·점검만 | 원본 점검 항목 |
| [screens/topbar.md](screens/topbar.md) | SCR-TOPBAR | 파일·부분 | `A/app.config.test.mjs` |
| [screens/topbar.md](screens/topbar.md) | SCR-TOPBAR-01, SCR-TOPBAR-A01~03, SCR-TOPBAR-G01, SCR-TOPBAR-G02, SCR-TOPBAR-KIT, SCR-TOPBAR-V01~03 | 선언·점검만 | 원본 점검 항목 |
| [screens/topbar.md](screens/topbar.md) | SCR-TOPBAR-REQ-R-018, SCR-TOPBAR-REQ-R-022 | 고정 없음 | 고정 없음 |
| [security.md](security.md) | SEC-001, SEC-006, SEC-015, SEC-017, SEC-019, SEC-025 | 파일·부분·공백 | `A/desktop/hub.test.cjs` |
| [security.md](security.md) | SEC-002, SEC-004, SEC-024 | 고정 없음 | 고정 없음 |
| [security.md](security.md) | SEC-003 | 파일·부분·공백 | `A/desktop/tool-bootstrap.test.cjs` |
| [security.md](security.md) | SEC-005 | 파일·부분 | `A/desktop/services-agent.test.cjs` |
| [security.md](security.md) | SEC-007 | 파일·부분 | `A/desktop/tool-connect.test.cjs` |
| [security.md](security.md) | SEC-008 | 파일·부분 | `A/desktop/portforward.test.cjs`, `A/desktop/tool-connect.test.cjs`, `A/desktop/tools.test.cjs`, `K/desktop/tool-auth.test.cjs` |
| [security.md](security.md) | SEC-009 | 파일·부분 | `A/desktop/provider-connections.test.cjs`, `A/desktop/safe-errors.test.cjs`, `A/desktop/services.test.cjs` |
| [security.md](security.md) | SEC-010, SEC-016 | 파일·부분 | `A/desktop/hub.test.cjs` |
| [security.md](security.md) | SEC-011 | 파일·부분·공백 | `A/data/mask-text.test.mjs`, `A/data/mask.test.mjs`, `A/desktop/hub.test.cjs` |
| [security.md](security.md) | SEC-012 | 파일·부분 | `A/desktop/tool-connect.test.cjs`, `K/desktop/main-url.test.cjs`, `K/desktop/tool-auth.test.cjs` |
| [security.md](security.md) | SEC-013 | 파일·부분 | `A/ai-target-flow.test.mjs`, `A/desktop/ai-target.test.cjs` |
| [security.md](security.md) | SEC-014 | 파일·부분·공백 | `A/desktop/ai-target.test.cjs` |
| [security.md](security.md) | SEC-018 | 파일·부분 | `K/desktop/main-service-owner.test.cjs`, `K/desktop/preload-page.test.mjs`, `K/desktop/tool-auth.test.cjs`, `K/tools/check-ipc.mjs` |
| [security.md](security.md) | SEC-020, SEC-023 | 선언·점검만 | 원본 점검 항목 |
| [security.md](security.md) | SEC-021 | 파일·부분·공백 | `A/data/conn-view.test.mjs`, `A/data/connect-flow.test.mjs`, `A/desktop/reads/reads.test.cjs` |
| [security.md](security.md) | SEC-022 | 파일·부분·공백 | `A/app.config.test.mjs` |
| [sre.md](sre.md) | SRE-Q-00 | 파일·부분·공백 | `A/data/incident-model.test.mjs`, `A/data/ownership.test.mjs` |
| [sre.md](sre.md) | C-A, C-E, C-G, C-H, C-K, C-L, C-P, C-S, SRE-L-COMMON, SRE-Q-11, SRE-Q-19, SRE-Q-22, SRE-Q-23, SRE-R-01, SRE-R-02, SRE-R-06~12, SRE-TIME, SRE-V-01~03, SRE-V-05~07 | 고정 없음 | 고정 없음 |
| [sre.md](sre.md) | SRE-Q-01 | 파일·부분·공백 | `A/data/home.test.mjs`, `A/pages/cluster-home.test.mjs` |
| [sre.md](sre.md) | SRE-Q-02 | 파일·부분·공백 | `A/data/alerts.test.mjs`, `A/pages/signal-pages.test.mjs` |
| [sre.md](sre.md) | SRE-Q-03, SRE-Q-12 | 파일·부분 | `A/data/incident-detect.test.mjs`, `A/data/incident-model.test.mjs` |
| [sre.md](sre.md) | SRE-Q-04 | 파일·부분 | `A/data/incident-model.test.mjs` |
| [sre.md](sre.md) | SRE-Q-05, SRE-R-03 | 파일·부분·공백 | `A/data/incident-model.test.mjs` |
| [sre.md](sre.md) | SRE-Q-06, SRE-Q-21 | 파일·부분·공백 | `A/data/gitops-view.test.mjs`, `A/desktop/gitops-deployment.test.cjs` |
| [sre.md](sre.md) | SRE-Q-07 | 파일·부분·공백 | `A/data/network.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [sre.md](sre.md) | SRE-Q-08 | 파일·부분·공백 | `A/data/incident-detect.test.mjs`, `A/data/incident-model.test.mjs` |
| [sre.md](sre.md) | SRE-Q-09 | 파일·부분·공백 | `A/data/ownership.test.mjs` |
| [sre.md](sre.md) | SRE-Q-10 | 파일·부분·공백 | `A/desktop/hub.test.cjs`, `K/shell/panel-engine.test.mjs` |
| [sre.md](sre.md) | SRE-Q-13 | 파일·부분·공백 | `A/pages/incident-report-doc.test.mjs` |
| [sre.md](sre.md) | SRE-Q-14 | 파일·부분 | `A/pages/incident-report-doc.test.mjs` |
| [sre.md](sre.md) | SRE-Q-15 | 파일·부분 | `A/pages/resource-pages.test.mjs`, `K/core/live.test.mjs` |
| [sre.md](sre.md) | SRE-Q-16 | 파일·부분 | `A/data/conn-view.test.mjs`, `A/desktop/ai-target.test.cjs` |
| [sre.md](sre.md) | SRE-I-06, SRE-Q-17, SRE-T-COMMON | 파일·부분·공백 | `A/data/kinds.test.mjs`, `A/pages/resource-pages.test.mjs` |
| [sre.md](sre.md) | SRE-Q-18 | 파일·부분 | `A/data/incident-model.test.mjs`, `A/data/log-excerpt.test.mjs`, `A/desktop/pod-logs.test.cjs`, `A/pages/resource-pages.test.mjs` |
| [sre.md](sre.md) | SRE-Q-20 | 파일·부분·공백 | `A/desktop/agent-heartbeat.test.cjs`, `A/desktop/services-agent.test.cjs` |
| [sre.md](sre.md) | SRE-I-01 | 파일·부분·공백 | `A/desktop/reads/reads.test.cjs` |
| [sre.md](sre.md) | SRE-I-02 | 파일·부분·공백 | `A/data/incident-model.test.mjs`, `A/desktop/reads/reads.test.cjs`, `K/core/clock.test.mjs` |
| [sre.md](sre.md) | SRE-I-03 | 파일·부분·공백 | `A/pages/resource-pages.test.mjs`, `K/tools/check-states.mjs` |
| [sre.md](sre.md) | SRE-I-04, SRE-R-04, SRE-T-SCOPE | 파일·부분·공백 | `A/pages/resource-pages.test.mjs` |
| [sre.md](sre.md) | SRE-I-05 | 파일·부분·공백 | `A/desktop/ai-target.test.cjs` |
| [sre.md](sre.md) | SRE-I-07 | 파일·부분·공백 | `A/data/conn-view.test.mjs`, `A/data/incident-model.test.mjs`, `A/tool-surfaces.test.mjs` |
| [sre.md](sre.md) | SRE-I-08 | 파일·부분 | `A/data/mask-text.test.mjs`, `A/desktop/safe-errors.test.cjs` |
| [sre.md](sre.md) | SRE-V-04 | 파일·부분 | `K/tools/check-brand.mjs`, `K/tools/check-glass.mjs`, `K/tools/check-layout.mjs`, `K/tools/check-states.mjs`, `K/tools/check.mjs` |
| [sre.md](sre.md) | SRE-L-01~20 | 선언·점검만 | 원본 점검 항목 |
| [sre.md](sre.md) | SRE-R-05 | 파일·부분·공백 | `A/data/conn-view.test.mjs` |
| [sre.md](sre.md) | SRE-T-ALERT | 파일·부분·공백 | `A/data/alerts.test.mjs`, `A/desktop/reads/reads.test.cjs` |
| [sre.md](sre.md) | SRE-T-AUDIT | 파일·부분·공백 | `A/desktop/hub.test.cjs` |
