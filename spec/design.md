# 디자인 목표와 현재 차이

정상 조회 0건인 표는 열 머리와 빈 행을 유지한다. 같은 화면의 권한 실패는 빈 결과로 바꾸지 않는다. 이런 기대 동작을 먼저 정하고 현재 코드와의 차이를 추적한다. 이 문서는 디자인 영역의 정본이며 화면별 데이터 열·권한·백엔드 계약은 해당 영역이 소유한다.

## 적용 방식

- `목표`와 목표 안의 합격 조건은 검사할 동작이다. P-B-001~004는 decisions.md의 확정 결정과 기본값 채택으로 정리한다. 제품 구현 여부는 현재와 차이에서 구분한다.
- `현재`는 2026-11-17 작업 트리의 파일·심볼을 직접 대조한 한 줄이다. 시험 정의와 실행 통과, 브라우저와 Electron·실제 클러스터를 구별한다.
- `차이`에는 확인된 코드 차이와 아직 확인하지 못한 범위를 나눈다. `T-B-*`는 남은 디자인 작업 ID다.
- 공통 참조: 색 B-002, 반경 B-004, 빈 값 B-018, 상태 B-019/B-032, 폭 B-017/B-022, 원본 대조 B-046, 툴팁 B-047, 화면 검수 B-041. 각 열에서 이 규칙을 복사하지 않는다.
- [토큰](design/tokens.md)은 값과 적용 조건, [검수](design/verification.md)는 공통 상태·재현 입력이다.
- 출처 칸의 `D00000` 형식 ID는 소유자 결정 기록의 번호다. 같은 대상의 후속 결정이 앞선 결정을 대체한다.

## 대체된 결정의 적용 범위

- D00029의 Loki 터미널 제안은 D00046의 API 화면으로 대체한다(B-043).
- D00331의 그래프 우선은 D00919의 상태 우선 상세 순서로 대체한다(B-042).
- D00513의 폭 변화 모션은 D01022의 최종 폭 선배치로 대체한다(B-007/B-013).
- D00789의 흰 원과 D00776의 겹침은 각각 D00803, D00809로 대체한다(B-021).
- D00821의 압축 비율 방식을 D00833/D00836/D00838/D00862와 같은 variant·상황에서 대조한다(B-031).
- D00896은 D00897이 취소하고 D00902가 현재 팔레트·순서 조정을 선택한다(B-002).
- D00887/D00925/D00930의 체크박스 선택은 D00943의 드래그 선택으로 대체한다(B-039).
- D00258/D00344/D00951의 표 진행 막대는 D00953이 철회한다(B-018).
- D01028의 설정 바탕은 D01036의 창 바탕 유지·경계선으로 구체화한다(B-009).

## 목표

<a id="B-001"></a>

### B-001 승인된 모양과 공통 부품

- 목표: 입력: 동일 route·UID·상태에서 셸과 메뉴를 수정 전후 1280px 다크·라이트로 연다 → 기대: 셸·사이드바·경로 막대·AI 칸·설정·입력·메뉴는 승인된 기준 화면의 배치, 치수, 상태, 모션을 보존한다. 본문에 없는 부품만 기존 kit를 확장하며 글꼴·색·반경을 맞춘다. 기존 배치를 다른 결함 수정 때문에 옮기지 않는다. 새 모양·문구 묶음은 승인 전 요구로 확정하지 않는다. kit에는 제품 이름·도메인 문구를 넣지 않는다. 확인할 세부 값: 같은 기능의 구현은 kit 하나를 호출한다. 변경 전후 같은 페이지·대상·상태·뷰포트의 다크/라이트 캡처에서 승인 범위 밖 위치·크기 변화가 없어야 한다. `node kit/tools/check-deps.mjs`, `node kit/tools/check-reuse.mjs`와 해당 부품 시험을 통과한다. 표시·판정 출처: `app.config의 sidebar·routes와 kit render props`. → 실패: 승인하지 않은 위치·크기 변화 또는 kit 안 Wake 문구가 나오면 실패.
- 추가 조건: 입력 A00159 첫 이미지에 해당하는 승인 공통 화면과 같은 상태의 변경 화면 → 기대 동일 역할의 기존 톤을 보존하고 글자 크기 예외는 D00314대로 분리 → 실패 표면 구조만 같다는 이유로 다른 톤을 통과.
- 추가 조건: 입력 기존 화면에 새 차트 부품을 추가 → 기대 D00313의 공통 디자인 승격과 승인 화면 전후 비교를 적용 → 실패 차트가 별도 스타일로 삽입되어 같은 역할 표현이 달라짐.
- 추가 조건: 입력 A00171 첫/둘째 이미지의 지정 영역을 식별한 변경 전후 화면 → 기대 대상 영역 교체·공통 적용 여부와 원형 보존 범위를 대조 → 실패 대상 영역 미식별 또는 무변경인데 용어 합격으로 반영 처리.
- 추가 조건: 입력 A00197 전후의 지목 부품과 승인 공통 부품을 같은 상태로 렌더 → 기대 대상 부품의 형태 차이를 실제 원형과 대조 → 실패 비교 대상이 없거나 표면만 맞는 것을 동일 UI로 처리.
- 추가 조건: 입력 A00210의 지목 영역과 승인된 동일 역할 원형을 식별 → 기대 어떤 차이를 고쳤는지 전후 그림으로 대조 → 실패 대상 불명 상태에서 네이티브 실행만으로 해당 지적 해결 판정.
- 추가 조건: 입력 Pod와 다른 종류의 공통 역할 상세 구역을 같은 폭/테마로 비교 → 기대 종류별 데이터 차이 외 공통 부품·배치·역할 토큰을 일치 → 실패 표면/상태만 맞고 같은 역할 UI가 종류별로 달라짐.
- 추가 조건: 입력 홈·목록·상세에서 같은 역할 UI의 테마/폭/상태 전환을 비교 → 기대 공통 역할·모션·문구 기준을 전 화면에 적용하고 필요한 정보 유지 → 실패 정보가 있다는 이유로 화면별 디자인/모션 예외를 통과.
- 추가 조건: 입력 같은 역할 부품을 전 화면에서 동일 입력/상태 전환으로 비교 → 기대 공통 시각/모션 기준을 같은 방식으로 적용 → 실패 데이터가 맞는다는 이유로 화면별 표현 예외 허용.
- 추가 조건: 입력 U00383 이미지 #5의 대상 입력과 승인된 동일 역할 폼을 식별 → 기대 2단계 작업의 공통 입력 기준과 같은 정렬·크기·상태 표현 → 실패 연결 동작 정상만으로 폼 불일치 해결 처리. 공통 판정은 [CMP-CTRL-TOKENS](components/controls.md#CMP-CTRL-TOKENS)에 연결한다.
- 추가 조건: 입력 U00395 이미지 #21~#23의 적용 대상과 넓고 좁은 화면의 같은 데이터 → 기대 중앙 최대 폭을 유지하며 적용 대상의 hover/모션/정보 문법을 항목별 대조 → 실패 최대 폭만 맞춘 뒤 전체 표현 이관을 완료로 판정.
- 추가 조건: 입력 요청한 그래프/표현 목록과 각 항목의 적용 화면·상태 → 기대 대상별 반영/후속 변경/미반영 근거를 구체적으로 대조 → 실패 대상 목록 없이 일반 데이터 계약 통과를 전체 표현 반영으로 처리.
- 현재: 기존 경계 검사와 공통 부품을 유지하고 H-004는 정렬·정상 상태 문구·탭 접힘과 사이드바 왕복 시 재열기 버튼 보존의 기존 계약을 수정한다. 화면 정체·테마·실제 창 폭을 캡처 전후 확인한 자료는 H-004 실행 판정에 연결한다.
- 차이: 독립 승인 그림 대조는 T-B-001·H-009다. 구현자 캡처 및 자동 검사만으로 승인 밖 차이 0을 확정하지 않는다.
- 고정 장치: check-deps·check-reuse, 기존 capture-range 검사, H-004의 실제 화면 정체 원장. 기존 정적 실패는 [H-008](tasks.md#H-008-run)에서 0건으로 정리했다.
- 출처: D00056, D00057, D00059, D00313, D00339, D00447, D00522, D00523; D00308; D00309; D00330; D00362; D00377; D00392; D00467; D00474; D00516; D00532; D00536

<a id="B-002"></a>

### B-002 역할 색과 테마

- 목표: 입력: statusIcon kind=ok/warn/error/busy와 값 1·2인 차트 시리즈를 두 테마에 렌더링한다 → 기대: 색은 kit/tokens.css와 apps/wake/theme.css의 역할 토큰만 사용한다. UI 크롬은 중립색, 데이터 차트는 시리즈 색을 쓴다. 상태·심각도는 [RULE-TONE](rules.md#RULE-TONE)을 따른다. 밝고 어두운 테마에서 색 역할을 바꾸지 않는다. 임의의 파란 강조, 회색으로 퇴색한 차트, 상태와 무관한 글자색을 허용하지 않는다. 앱 내부 로고는 전경 또는 흐린 전경색이며 Dock용 파란 로고와 구분한다. 확인할 세부 값: 색 선언을 토큰 대장과 대조한다. 정상/진행/경고/오류/중립을 두 테마에서 촬영한다. 단일 시리즈와 다중 시리즈 차트에 색과 면 채움이 있고 상태 아이콘과 글자의 의미가 일치해야 한다. `node kit/tools/unused-check.mjs`, `node kit/tools/check-brand.mjs --app wake`를 실행한다. 표시·판정 출처: `statusIcon.kind와 chart.series[].color`. → 실패: 경고가 중립색이거나 시리즈가 모두 회색으로 표시되면 실패.
- 추가 조건: 같은 내부 동작 버튼을 변경 전후 비교 → 기존 승인 파란 강조 역할 보존, 상태/차트/장식 하늘색과 분리 → 같은 토큰을 썼다는 이유로 하늘색 회귀를 통과시키면 실패.
- 추가 조건: 다크·라이트에서 해당 UI 외곽선을 접힘/펼침으로 표시 → 승인된 경계색 역할 토큰 사용, 시리즈 보라색으로 대체하지 않음 → 보라색 계열 토큰이나 임의 강조색이 경계에 적용되면 실패. 공통 판정은 [CMP-CTRL-TOKENS](components/controls.md#CMP-CTRL-TOKENS)에 연결한다.
- 현재: `kit/tokens.css:26`의 테마별 역할색과 `apps/wake/theme.css:110`의 본문 범위 덮어쓰기를 `kit/components/status-icon.js:27`가 사용한다.
- 차이: 상태 아이콘은 역할 토큰을 사용한다. 정상 글자 처리 차이는 B-019에 분리한다. 시리즈 팔레트의 회색화 방지는 chart-card 시험에만 있다 → T-B-002.
- 고정 장치: 고정 없음 → T-B-002
- 출처: D00338, D00680, D00698, D00707, D00786, D00812, D00896, D00897, D00902, D00998, D01008; D00719; D00801

<a id="B-003"></a>

### B-003 글자·간격·그림자 단계

- 목표: 입력: 홈·상세·설정·AI에 이름 api-worker와 본문 숫자 1234를 표시한다 → 기대: 셸은 native 14px, Wake 본문은 현재 승인된 native-sm 13px/행간 17px 구분을 유지한다. 제목·보조·코드·차트 값은 토큰 대장의 역할을 쓴다. 컨트롤 높이, 행 높이, 아이콘 크기를 개별 화면에서 임의로 바꾸지 않는다. 이름·식별자는 합자를 끄고 입력 그대로 표시한다. 떠 있는 면만 공통 float 그림자를 쓴다. 모든 내부 화면(홈·목록·상세·설정·API 도구·GitOps)에 같은 밀도를 적용한다. 제목이나 표마다 장식 배경·외곽선을 추가하지 않는다. 확인할 세부 값: 셸·본문·AI·설정의 computed font-size/line-height를 각각 확인한다. 본문 표 행은 apps/wake/theme.css의 28px, 일반 kit 표는 기본 40px임을 혼동하지 않는다. 1280/1680에서 머리·도구 줄·표의 시작선과 간격이 토큰 배수로 맞아야 한다. 표시·판정 출처: `tokens.css의 text-native·text-native-sm·leading-native`. → 실패: 본문이 13px/17px가 아니거나 식별자 합자가 생기면 실패.
- 추가 조건: 해당 항목 묶음을 승인된 비교 화면과 같은 폭·값으로 표시 → 공통 역할의 행간/세로 padding 및 정상 수직 정렬 유지 → 임의 빈 공간을 추가하거나 항목을 하단으로 밀면 실패; 정확한 대상 캡처와 수치는 추후 고정. 공통 판정은 [SCR-CARD-SURFACE](screens/common.md#SCR-CARD-SURFACE)에 연결한다.
- 현재: `kit/tokens.css:26`의 native 14/13px와 `apps/wake/theme.css:110`의 `body[data-kind="page"]` 13px·17px, `--dt-row-h` 28px가 선언되어 있다.
- 차이: 본문 CSS의 13px·17px·28px 선언 차이 없음(확인: apps/wake/theme.css:99–127). 셸과 본문 글꼴 실측은 별도 작업 T-B-003.
- 고정 장치: 고정 없음 → T-B-003
- 출처: D00048, D00055, D00056, D00059, D00062, D00067, D00069, D00314, D00752, D01018; D00938

### B-004 반경과 동심 규칙

- 목표: → [RULE-PANE](rules.md#RULE-PANE).
- 현재: 기존 반경 토큰과 app-frame을 유지하고 H-004 실제 화면에 check-surfaces의 역할 반경·단일 면 판정을 적용한다.
- 차이: p<R·p≥R 모든 조합과 네이티브 합성 네 모서리 독립 판정은 T-B-004·H-009다.
- 고정 장치: `kit/tools/check-surfaces.mjs`, `check-surfaces.test.mjs`의 역할 반경·이중 면 반례. 화면별 결과는 H-004 실행 판정.
- 출처: D00728, D00767, D00768, D00870, D00954, D01001, D01005, D01009, D01013, D01014, D01015, D01016, D01017, D01028

<a id="B-005"></a>

### B-005 면 중첩과 예외

- 목표: 입력: 요약 안 표·코드와 설정 sg-card를 펼친다 → 기대: 페이지 카드 안에 같은 역할의 카드를 거듭 넣지 않는다. 요약 막대 안 표·코드는 본문으로 이어진다. 설정 .sg-card는 명시된 예외로 면과 반경을 갖되 두 테마 모두 테두리가 없다. AI·사이드바의 승인된 옆 칸 톤은 이 규칙을 이유로 제거하지 않는다. 상세의 별도 “사양” 카드는 판단에 필요한 값을 기존 요약 칸으로 옮긴다. 확인할 세부 값: 각 카드 경로의 면·선·반경을 기록한다. 설정에는 창 바탕의 메뉴와 내용 카드 하나만 남고 .sg-card에 border가 없어야 한다. 요약 안의 표·코드에 별도 바깥 카드가 생기지 않아야 한다. 표시·판정 출처: `settingsGroup.round·children와 summaryBar.body`. → 실패: 본문 카드 안 같은 역할 카드가 한 겹 더 생기거나 설정 카드에 테두리가 나오면 실패.
- 현재: `kit/components/settings-group.js:18`의 sg-card와 `apps/wake/theme.css:110`의 `.cc-card`, `resource-detail.js`의 요약 카드 구성이 공존한다.
- 차이: sg-card.round는 border-color를 border-surface로 바꾼다. 목표의 설정 카드 무테두리와 충돌한다(kit/components/settings-group.js:12) → T-B-005.
- 고정 장치: 고정 없음 → T-B-005
- 출처: D00060, D00067, D00637, D00678, D01007, D01015, D01016, D01017, D01020

<a id="B-006"></a>

### B-006 사이드바 네 구역과 경로 막대

- 목표: → [RULE-SIDEBAR](rules.md#RULE-SIDEBAR).
- 화면별 조건: 경로 막대는 cluster › namespace › kind › name과 같은 수준의 이동 목록을 제공한다. URL 입력·웹 검색·다운로드·확장·방문 기록은 노출하지 않고 새 탭은 Wake 시작 화면이다.
- 현재: `apps/wake/app.config.js:921`의 sidebar 정의를 `kit/shell/shell.js:29`와 `kit/components/topbar.js`가 그린다.
- 차이: 네 구역 정의 차이 없음(확인: apps/wake/app.config.js:922). 긴 구역 스크롤과 계정 고정 위치는 별도 T-B-006.
- 고정 장치: 고정 없음 → T-B-006
- 출처: D00990, D01018

### B-007 칸의 사방 여백·모서리·크게 보기

- 목표: → [RULE-PANE](rules.md#RULE-PANE).
- 화면별 조건: 칸마다 자기 경로·뒤로·앞으로·다시 불러오기를 둔다. AI 표의 크게 보기는 새 탭으로 이어 열며 기존 문맥과 다른 칸의 스크롤·이력을 보존한다.
- 현재: `kit/components/app-frame.js:18`은 frame 사방 gap과 숨긴 사이드바의 왼쪽 gap을 처리하고 :34는 split-pane 반경을 설정한다.
- 차이: 칸 사방 여백·분할 반경 선언 차이 없음(확인: kit/components/app-frame.js:18–34). 크게 보기 전후 다른 칸의 scrollTop 보존 시험은 없다 → T-B-007.
- 고정 장치: 고정 없음 → T-B-007
- 출처: D00513, D01010, D01011, D01012, D01013, D01014, D01015, D01016, D01017, D01022, D01028

<a id="B-008"></a>

### B-008 본문 폭과 세로 스크롤

- 목표: 입력: 홈·대화·목록에 100행을 넣고 End를 누른다 → 기대: 페이지는 page-column 하나를 사용하고 home 680, chat/detail 820, list 1040, settings 672px 역할 폭을 가운데 둔다. 긴 콘텐츠는 소유 본문에서 끝까지 세로 스크롤된다. 머리·탭·도구 줄의 고정과 본문 스크롤을 혼동하지 않는다. overflow 수정 때문에 마지막 행·카드·페이저가 접근 불가능해지면 실패다. 확인할 세부 값: 모든 바뀐 화면에서 첫 화면과 scrollTop 최대 지점의 두 캡처를 남긴다. 마지막 행·페이저·아래 모서리가 보이고 wheel/PageDown/End와 내부 코드 스크롤이 올바른 소유자를 움직여야 한다. 가로·세로 스크롤 막대가 덮개에 잘리면 실패다. 표시·판정 출처: `pageColumn.kind와 pane-max-w·rows`. → 실패: 홈이1040px로 늘거나 마지막 행·페이저를 스크롤로 볼 수 없으면 실패.
- 현재: `kit/components/page-column.js:14`의 pcol-scroll은 세로 overflow를 갖지만 `apps/wake/theme.css:110`의 본문 `--pane-max-w:var(--list-col-w)`가 home/chat 기본 폭도 덮는다.
- 차이: page body의 pane-max-w를 list-col-w로 덮어 home680·chat820 역할 폭을 가린다 → T-B-008.
- 고정 장치: 고정 없음 → T-B-008
- 출처: D00053, D00054, D00068, D00532, D01030, D01031

<a id="B-009"></a>

### B-009 설정 구조와 경계선

- 목표: 입력: 설정을 연 뒤 긴 메뉴를 스크롤하고 사이드바를 접는다 → 기대: 설정은 탭이다. 설정 메뉴는 창 바탕 위, 본문은 가운데 고정 폭 카드 하나다. 앱 사이드바와 설정 메뉴 사이에는 창 위부터 아래까지 1px --border 선과 --window-gap 8px 간격을 둔다. 사이드바를 접으면 경계선도 없어진다. 내용 카드 외곽선은 네 변·네 모서리에서 끊기지 않는다. 설정 검색은 고정하고 메뉴 목록만 스크롤한다. 확인할 세부 값: 설정 각 메뉴, 사이드바 접기, 긴 메뉴, 긴 본문에서 다크/라이트 × 1280/1680 캡처. 메뉴가 카드 안에 한 번 더 감싸지거나 경계선이 본문 높이에서 멈추면 실패다. 표시·판정 출처: `settings kind와 sidebar-hidden·snav 목록`. → 실패: 검색까지 스크롤되거나 사이드바를 접은 뒤 경계선이 남으면 실패.
- 추가 조건: 설정 값을 바꾼다 → 정의 데이터로 만든 설정 행이 자동 저장하고 짧은 값은 내용 폭 컨트롤을 쓴다 → 저장 버튼을 새로 요구하거나 값 길이와 무관하게 늘어나면 실패. 출처: 옛 화면 규칙. 자동 저장의 실행 고정은 T-B-009에서 확인한다.
- 현재: `apps/wake/theme.css:110`는 settings bare의 투명 바탕, sidebar 경계선, window-gap과 cc-card 선 여유를 선언하고 `kit/page/kinds/settings.js:38`가 내용을 구성한다.
- 차이: settings bare의 배경·경계선 CSS는 존재한다. 전체 창 높이에서 선 단절과 사이드바 접힘을 검사하는 설정 시험은 없다 → T-B-009.
- 고정 장치: 고정 없음 → T-B-009
- 출처: D01017, D01020, D01028, D01035, D01036

<a id="B-010"></a>

### B-010 설정·연결 행

- 목표: 입력: 연결 행에 running 상태를 넣고15초 동안 출력을 중단한 뒤 403으로 종료한다 → 기대: settings-row 하나를 재사용한다. 행 끝의 주 컨트롤은 하나다. 상태는 끝 한 곳의 아이콘과 짧은 글, 진행 중에는 단계명·경과 시간, 성공 뒤에는 잠깐 “연결됨” 후 체크만 남긴다. 입력·오류를 읽어야 할 때만 행을 열고 “자세히” 토글을 추가하지 않는다. 한 번에 한 행만 열며 다시 시도 때 닫혔다 열리지 않는다. 취소는 hover/focus에서만 표시한다. 오류 빨강, 설치·로그인 필요 주황, 권한 자물쇠 중립, 사용자 취소 빈 원을 구별한다. 출력 없이 15초가 지나면 응답 기다림과 취소·계속 기다리기를 표시한다. 작업자가 새로 정하는 시간 초과는 상태 정의에 남긴다. 권한 시트에는 막힌 동사·리소스·namespace와 복사 가능한 명령·YAML을 보여준다. 성공 터미널은 닫고 실패 출력은 공통 코드 보기로 남긴다. 확인할 세부 값: 대기/확인 중/응답 기다림/사용자 조치/권한/실패/취소/시간 초과/연결됨을 한 행에서 재현한다. 동시 상태 0, 행 높이 흔들림 0, 실패마다 유효한 복구 동작 1개를 확인한다. 입력은 이름표·실제 예시·획득 경로를 제공한다. 표시·판정 출처: `connect-flow의 state·step·elapsed와 권한 응답`. → 실패: 행 끝에 서로 다른 상태가 동시에 나오거나 거절 동사·대상이 없으면 실패.
- 현재: `kit/components/settings-row.js:59`, `settings-group.js`와 `apps/wake/settings-pages.js:17`에 행 및 단계 정의가 있다.
- 차이: settings-row 렌더는 주어진 상태를 표시하며15초 무출력 판정은 맡지 않는다. 연결 서비스와 행 상태 전이의 결합이 남는다 → T-B-010.
- 고정 장치: 고정 없음 → T-B-010
- 출처: D00765, D00775, D00993, D01020

### B-011 투명 창과 중앙 면

- 목표: 입력: 밝은 바탕 위 Electron에서 다크 YAML을 열고 창을 비활성화한다 → 기대: 본문 중앙은 불투명한 --background 면을 유지한다. 옆 칸·떠 있는 면의 승인된 투명도와 blur는 역할 토큰을 따른다. YAML과 코드 카드에 임의의 투명 배경을 넣어 뒤 내용이 비치지 않게 한다. 창 비활성, native 도구 탭, 툴팁·메뉴의 합성도 같은 기준을 따른다. 확인할 세부 값: 밝고 어두운 바탕의 실제 Electron 창에서 활성/비활성·메뉴 열림·YAML을 비교한다. CSS alpha 검사와 native 합성 캡처를 별도로 기록한다. 본문 뒤 배경 누출과 모서리 선 단절 0건. 표시·판정 출처: `theme.css의 background·content·glass 토큰`. → 실패: 중앙 코드 뒤 배경이 비치거나 비활성화 때문에 본문 투명도가 바뀌면 실패.
- 현재: `apps/wake/theme.css:7`의 desktop frame-main/page body는 content를 background로 바꾸며 설정 cc-split은 별도 투명 예외다.
- 차이: 중앙 background 선언 차이 없음(확인: apps/wake/theme.css:7). native 비활성 창 합성은 CSS 검사기의 판정 범위 밖이다 → T-B-011.
- 고정 장치: 고정 없음 → T-B-011
- 출처: D00119, D00446, D00996, D01011, D01013, D01035

<a id="B-012"></a>

### B-012 호버·초점·키보드

- 목표: 입력: 근거 이름표에 Tab으로 초점을 옮겨 Enter와 Space를 누르고 한글 조합 중 Enter를 누른다 → 기대: 클릭 요소에는 hover/active/focus-visible이 있다. 초점 고리는 3px --focus이며 창 비활성에도 유지한다. 행 안 작은 아이콘 버튼은 이중 바탕 없이 색만 변한다. 창 밖 이동·탭 이동 뒤 이전 hover나 선택이 남지 않는다. 마우스가 없어도 열기·선택·복귀·닫기가 가능해야 하며 한글 조합 중 Enter를 전송/확정으로 처리하지 않는다. 입력 중 전체 화면을 다시 그려 한글 조합이나 선택을 잃지 않는다. 단축키는 macOS와 다른 플랫폼의 modifier 차이를 따른다. 확인할 세부 값: Tab/Shift+Tab/Enter/Space/Escape, 창 외부로 포인터 이동 후 복귀, 활성 창 전환, 한글 IME 조합을 확인한다. 숨긴 컨트롤은 focus 시 접근할 수 있어야 한다. 버튼 의미를 가진 모든 span에는 실제 키보드 활성화가 있어야 한다. 표시·판정 출처: `ref.action·data-arg와 KeyboardEvent.isComposing`. → 실패: 근거 이동이0회이거나 한글 조합 중 메시지가 전송되면 실패.
- 추가 조건: textarea를 연다 → 크기 조절 손잡이를 노출하지 않는다 → 브라우저 기본 resize 손잡이가 보이면 실패. 출처: 옛 화면 규칙. 실제 입력 화면 고정은 T-B-012에서 확인한다.
- 현재: `kit/components/ref.js:23`은 role=button과 tabindex를 렌더링하지만 이 부품에는 keydown 활성화가 없다.
- 차이: ref의 role=button·tabindex는 있으나 Enter/Space 활성화 구현은 이 부품에 없다(kit/components/ref.js:23) → T-B-012.
- 고정 장치: 고정 없음 → T-B-012
- 출처: D00609, D00760, D01038, D01039, D01040, D01041, D01042

<a id="B-013"></a>

### B-013 모션과 첫 그림

- 목표: 입력: 같은 클러스터의 홈에서 리소스로 이동하고 AI 칸을 연다 → 기대: 칸은 최종 폭으로 먼저 배치하고 내용만 들어온다. 폭 0에서 커져 이웃 레이아웃을 밀거나 빈 카드 뒤에 내용을 붙이지 않는다. 모션은 token 시간·곡선을 사용하고 reduced-motion을 존중한다. 작업 중 상태는 의미 있는 회전·진행·경과 시간을 보이며 장식 펄스는 금지한다. 일반 상태의 정지 경계는 → [RULE-TONE](rules.md#RULE-TONE). 샌키는 → [RULE-SANKEY](rules.md#RULE-SANKEY)의 예외를 적용한다; [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE);  reduced-motion에서도 상태 의미·진행 글은 남는다. 프레임 녹화와 rect 추적으로 폭 선점 시점을 확인한다. 표시·판정 출처: `route 전환 시각·첫 paint·데이터 완료 시각·요소 rect`; 
- 현재: `kit/tokens.css:139` 이후 모션 토큰, reduced-motion 조건과 `kit/shell/shell.js:29`의 칸 관리가 있다. 현재 성능 측정은 없다.
- 차이: 모션 토큰은 있으나 150ms·1초·0.01 기준을 함께 판정하는 native 전환 측정기는 없다 → T-B-013.
- 고정 장치: 고정 없음 → T-B-013
- 출처: D-USR-2026-11-16-5; D00051, D00052, D00932, D01021, D01022, D01023, D01027

<a id="B-014"></a>

### B-014 알약 카드 머리와 꺾쇠

- 목표: 입력: metadata.resourceVersion=123인 YAML 카드를 접은 뒤 머리와 꺾쇠를 각각 hover한다 → 기대: summary-bar 머리는 판단할 값(실패·경고 수, 상태 없는 표의 개수, 실제 현재 값)을 보인다. 제목이나 종류를 값으로 반복하지 않는다. 표·코드는 같은 알약 카드 본문에 둔다. YAML 머리의 버전 값은 resourceVersion이며 이벤트 YAML도 같다. 꺾쇠 둥근 바탕은 꺾쇠 자체의 hover/focus 때만, 머리 전체 hover는 꺾쇠 색만 바꾼다. 머리 순서는 이름 → 주 값 → 이름 붙은 값 → 기간 → 상태 → 접기다. 개수에 건·개·회 접미사를 붙이지 않고 점·막대는 최대 3개와 +N으로 줄인다. 같은 입력의 카드 간격은16px다. 문제가 있는 카드와 주 표의 첫 펼침 판단은 B-015를 따른다. 확인할 세부 값: 접힘/펼침 머리에 동일한 의미의 값이 유지되고 실제 데이터 변화만 반영된다. 머리와 꺾쇠의 hover 캡처를 구분한다. YAML과 이벤트 YAML의 resourceVersion을 원본 metadata.resourceVersion과 대조한다. 표시·판정 출처: `summaryBar.items와 metadata.resourceVersion`. → 실패: 머리 전체 hover로 꺾쇠 바탕이 생기거나 버전 대신 종류 이름이 표시되면 실패.
- 추가 조건: 단계 상태 0·1·3·4·12개 → 요약은 최대 3점과 나머지 +N, 실제 상태 접근 유지 → 4점 이상 직접 나열 또는 n/n이면 실패. 공통 판정은 [CMP-FLOW-STAGES](components/flow-graph.md#CMP-FLOW-STAGES)에 연결한다.
- 현재: `kit/components/summary-bar.js:57`은 머리 전체 hover에 꺾쇠 background를 바꾸며 `apps/wake/pages/resource-detail.js:669`는 resourceVersion 외 조건부 Revision도 출력한다.
- 차이: summary:hover가 꺾쇠 background를 바꾼다. 목표는 꺾쇠 자체 hover/focus만 바탕을 바꾸는 것이다(kit/components/summary-bar.js:57) → T-B-014.
- 고정 장치: 고정 없음 → T-B-014
- 출처: D00710, D00935, D00936, D01007, D01021, D01038, D01039, D01040, D01041, D01042; D00728

<a id="B-015"></a>

### B-015 처음 한 번 자동 펼침

- 목표: → [RULE-FOLD](rules.md#RULE-FOLD).
- 현재: `apps/wake/pages/cluster-home.js:34`는 FIRST_WAIT_MS=100을 쓰고 `kit/components/summary-bar.js`는 호출자가 준 open 상태를 사용한다.
- 차이: 최초와 후속 임계값 응답은 시험으로 분리돼 있다. 정확히100ms에서 사용자 접기와 응답이 겹치는 경계 시험은 없다 → T-B-015.
- 고정 장치: `apps/wake/pages/cluster-home.test.mjs` — `a_metric_bar_crossing_its_threshold_after_the_first_drawing_stays_closed_and_marks_its_head`
- 출처: D-USR-2026-11-16-7; D-USR-2026-11-16-5; D00700, D01021, D01022

### B-016 표 열 종류·왼쪽 정렬·한 의미

- 목표: → [RULE-SORT](rules.md#RULE-SORT); [RULE-TONE](rules.md#RULE-TONE).
- 현재: 공통 표의 왼쪽 정렬과 숫자 열을 유지한다. H-004에서 리소스·이력의 누락된 기본 정렬을 공통 비교 함수로 적용하고, 실제 렌더 셀의 정렬·숫자와 상태 혼합을 검사한다.
- 차이: legacy 열 별칭과 임의 cell markup은 남는다. 자료 없는 표의 실제 값 검수는 H-004-N1; 스키마 정리는 T-B-016.
- 고정 장치: `apps/wake/data/table-order.test.mjs`, resource-pages·resource-inspector·tool-surfaces·alerts·gitops-view·network 시험; `check-regressions.mjs`와 data-table-extras 시험.
- 출처: D-USR-2026-11-16-1; D00049, D00393, D00454, D01033, D01034

<a id="B-017"></a>

### B-017 표 폭·행·구분선·페이저

- 목표: 입력: 짧은 값123456·긴 Pod 이름·optional9개·21행인 표를760px 칸에 연다 → 기대: 표는 한 줄 행이며 짧은 값은 머리글과 최대 값 폭보다 좁아지지 않는다. 긴 이름·메시지 열만 말줄임한다; [RULE-WIDTH](rules.md#RULE-WIDTH). 최후에는 표 내부 가로 스크롤을 사용한다. 긴 글 열의 최소 폭은 역할 토큰을 쓰며 짧은 값의 가독성을 먼저 지킨다. 행 hover/선택 바탕·구분선은 승인된 내용 폭을 따르며 양 끝 8px 여백과 모서리를 유지한다. 긴 상세 로그·이벤트는 페이지당 20행, 페이저는 카드 안이다. 열 순서는 이름 → Namespace → 상태 → 수치 → 기타 글 → 시각이며 시각 정렬 기록만 시각을 첫 열에 둔다. 대상 이름이 있는 행은 정본 상세 칸으로, 본문을 바꾸는 행은 끝 꺾쇠로 이동을 나타낸다. 확인할 세부 값: 760px 칸과 1024/1280/1440/1680 창에서 짧은 값 잘림 0. optional 숨김 순서를 확인하고 긴 이름의 title은 실제 잘릴 때만 표시한다. 선택·호버·기본 행의 배경과 선을 비교한다. 0/1/20/21행에서 머리·빈 행·페이지 수가 맞아야 한다. 표시·판정 출처: `columns[].optional·fit·width와 rows.length`; 실패: 짧은 값이 잘리거나21행에서 페이저가 카드 밖으로 나가면 실패.
- 추가 조건: 입력 양쪽 옆 칸이 열린 1280px 홈에 긴 이벤트 이유·대상 입력 → 기대 최신 한 줄 말줄임 정책을 유지하면서 hover/focus로 전문에 접근 → 실패 잘린 이유·대상의 전문을 포인터나 키보드로 읽을 수 없음. 공통 판정은 [SCR-TABLE-OVERFLOW](screens/common.md#SCR-TABLE-OVERFLOW)에 연결한다.
- 추가 조건: 입력 1280px 홈에서 긴 범례·이벤트 값을 가진 AWS·GKE·kind 자료 → 기대 그래프 판단 공간을 유지하고 승인된 범례 넘침 처리 및 한 줄 행·전문 접근 적용 → 실패 범례/셀 줄바꿈 때문에 행·영역이 불필요하게 높아지고 그래프가 작아짐. 공통 판정은 [B-027](design.md#B-027)에 연결한다.
- 현재: `kit/components/data-table.js:92`는 optional을 오른쪽부터 최대 8순위로 숨기며 fit을 측정한다. `apps/wake/theme.css:110`는 상세 flex 최소 폭 160px, 480px 이하104px로 덮는다.
- 차이: optional 숨김은 RANKS=8로 제한된다.9번째 optional까지 순서대로 숨기는 목표를 처리하지 못한다(kit/components/data-table.js:85–92) → T-B-017.
- 고정 장치: 고정 없음 → T-B-017
- 출처: D00064, D00361, D00371, D00372, D00794, D00822, D01012; D00206; D00209

### B-018 표 원문·숫자·빈 값

- 목표: → [RULE-RESTARTS](rules.md#RULE-RESTARTS); [RULE-STATE](rules.md#RULE-STATE); [RULE-TONE](rules.md#RULE-TONE); [RULE-WIDTH](rules.md#RULE-WIDTH).
- 화면별 조건: kubectl 계열은 kubectl/describe 원문 머리글과 data-kube-head를 사용하고 Wake 표는 한국어 머리글을 쓴다. 원문 머리글 혼용은 실패다.
- 현재: → [RULE-WIDTH](rules.md#RULE-WIDTH)의 fit 경로 근거, [RULE-RESTARTS](rules.md#RULE-RESTARTS)의 셀 톤 근거.
- 차이: 실제 렌더 재검증 전. → [RULE-WIDTH](rules.md#RULE-WIDTH).
- 고정 장치: 고정 없음 → T-B-018
- 출처: D00386, D00399, D00794, D00951, D00953, D01033, D01034

### B-019 상태 아이콘·글자·크기

- 목표: → [RULE-TONE](rules.md#RULE-TONE).
- 현재: `kit/components/status-icon.js:27`은 ok/warn/error/busy의 content 토큰과 회전을 사용하며 `kit/icons/icons.js`가 공통 글리프를 출력한다.
- 차이: error·warn·fix 아이콘과 글자는 같은 역할색이고 busy의 흐린 글자는 의도된 예외다. render가 ok에 text를 받으면 글자를 출력하므로 정상 아이콘만 정책은 호출부가 지켜야 한다(kit/components/status-icon.js:27–53) → T-B-019.
- 고정 장치: 고정 없음 → T-B-019
- 출처: D00338, D00680, D00765, D00786, D00997, D01008, D01018.

### B-020 연결한 출처 칩과 실패 표현

- 목표: → [RULE-CHIPS](rules.md#RULE-CHIPS).
- 현재: `apps/wake/data/conn-view.js:79`의 wasFound는 같은 UID 근거를 유지하고 `apps/wake/pages/tool-detail.js:64`는 inventoryFailure를 ready 본문 앞에도 출력한다.
- 차이: 같은 UID의 부분 확인 실패를 남기는 후속 소스와 시험이 있다. 인시던트 머리까지 여섯 표면과 묶는 시험은 없다 → T-B-020.
- 고정 장치: 고정 없음 → T-B-020
- 출처: D00992, D00999, D01000

<a id="B-021"></a>

### B-021 브랜드 아이콘과 쌓인 아이콘

- 목표: 입력: Grafana·Prometheus 로고를 dark/light의 iconStack에 함께 표시한다 → 기대: 공급자·도구는 실제 로고를 앱 맵에서 쓰고 상태 아이콘으로 대체하지 않는다. 로고의 내부·외곽·겹침 판정은 [RULE-CHIPS](rules.md#RULE-CHIPS)를 따른다. 개별 상태와 도구 정체를 혼동하지 않는다. 확인할 세부 값: 다크/라이트에서 공급자·도구 아이콘의 내부 도형과 외곽이 보이고 hover 바탕을 이중으로 갖지 않아야 한다. 긴 목록과 icon-stack에서 로고가 가려지는 경우 0건. 표시·판정 출처: `brand-glyphs와 iconStack.items`. → 실패: brand-glyphs의 실제 공급자와 화면 아이콘이 다르거나 정본의 로고 판정을 위반함.
- 추가 조건: 입력 D00050 전후 동일 Git 아이콘·배율·부모 행을 비교 → 기대 배경 없이 자연스럽게 붙고 승인 전 기준보다 아이콘의 보이는 크기가 커짐 → 실패 배경만 바꾸고 보이는 크기는 같거나 작아지면 실패.
- 추가 조건: 입력 outline이 있는 버전과 없는 버전이 섞인 동일 역할의 도구 목록 → 승인된 로고 버전·외부 장식 규칙 하나 적용, 내부 도형의 흰색 유지 → 일부 도구에만 임의 외곽선이 덧대지면 실패.
- 현재: `kit/components/icon-stack.js:26`은 바깥 disc에 background:none·box-shadow:none을 지정하고 :38–44는 로고 SVG를 렌더한다. `apps/wake/assets/brands/brand-glyphs.js`와 `apps/wake/theme.css:85–89`는 로고 내부 도형과 테마별 자산을 처리한다.
- 차이: `icon-stack.test.mjs:23`의 시험명에는 white disc가 남아 있지만 실제 단언은 disc 클래스·SVG 구조·크기 변수뿐이다. 흰색·배경·computed style을 검사하지 않으므로 흰 배경 계약의 근거가 아니다. 바깥 흰 원 금지는 양 테마 실제 렌더로 재검증해야 한다 → T-B-021.
- 고정 장치: `kit/components/icon-stack.test.mjs:23` — `a brand mark sits on the white disc, alone or in the row`(구조만 검사). 바깥 흰 원 금지의 시각 고정 없음 → T-B-021
- 출처: D00050, D00694, D00775, D00776, D00789, D00803, D00809

### B-022 구역 탭과 더보기

- 목표: 입력: 구역8개에서 마지막 탭을 선택하고 칸 폭을760px로 줄인다 → 기대: 구역 탭 줄에는 가로 스크롤과 끝 흐림을 두지 않는다. 공간이 부족할 때만 뒤쪽 탭을 더보기 메뉴 하나로 접는다. 고른 탭은 항상 줄에 남고 메뉴에서 선택하면 표시 집합을 다시 계산한다. 여유 폭에서는 더보기가 없다. 선택·focus·disabled 의미를 유지한다. 확인할 세부 값: 8개 구역을 760px 칸, 1280/1680 창, 세 칸에서 확인한다. scrollWidth 초과로 탭 줄을 스크롤하게 되면 실패다. 마지막 탭 선택 후 축소/확대에도 선택 탭이 남아야 하며 더보기 키보드 선택 후 focus가 유실되지 않아야 한다. 표시·판정 출처: `pillTabs.tabs·선택 id·컨테이너 폭`. → 실패: 선택 탭이 더보기 안으로 사라지거나 가로 스크롤·끝 흐림이 생기면 실패.
- 현재: H-004에서 활성 탭이 들어갈 때까지 뒤쪽 탭을 접도록 수정했다. H-004-R1에서는 빈 더보기를 숨기고 자리보다 긴 선택 탭에 기존 말줄임을 적용했다. 접힌 개수 문구 변경은 자연 폭을 다시 재며, 탭 줄 밖 변경은 접기와 표시 막대의 재측정을 유발하지 않는다.
- 차이: 더보기 키보드 메뉴의 전체 복귀 흐름은 T-B-022·H-009에 남는다. 실제 폭 왕복의 선택 탭 숨김 반례는 수정했다.
- 고정 장치: `kit/tools/check-surfaces.test.mjs`의 `folded_disabled_tab_blocks_pointer_and_keyboard_selection`(접힌 disabled의 포인터·키보드 차단); `check-surfaces.test.mjs`의 folded_tabs_keep_a_wider_selected_tab_visible_across_resize와 fold_single_oversized_tab_hides_empty_more, fold_oversized_selection_stays_inside_card, fold_hidden_count_change_refreshes_width_before_unfolding, fold_unrelated_body_mutation_does_not_measure_tabs, `check-layout.mjs`의 탭 넘침·선택 표시 검사.
- 출처: D01028, D01029

<a id="B-023"></a>

### B-023 도구 줄 간격과 줄바꿈

- 목표: 입력: 범위·검색·필터·시간 범위를 모두 넣고 도구 줄을 두 줄로 줄인다 → 기대: list-toolbar 슬롯은 왼쪽 범위 → 검색 → 거르기, 오른쪽 시간 범위 → 보기 순서다. 한 묶음의 가로 간격은 6px(--space-1_5), 줄 사이·세로 간격은 8px(--space-2)이다. 넘치면 오른쪽 묶음 전체가 다음 줄 오른쪽에 붙는다. 둘째 줄 왼쪽 시작 지시는 폐기한다. 시간 범위·버튼의 글자를 자르거나 겹치지 않는다. 확인할 세부 값: 검색과 필터 수를 늘리고 칸 폭을 줄여 1/2줄 상태를 확인한다. 오른쪽 묶음의 right 좌표가 컨테이너 right와 같고 줄 사이 8px, 내부 가로 6px이다. 빈 슬롯은 빈 간격을 남기지 않는다. 표시·판정 출처: `listToolbar.slots의 scope·search·filter·range·view`. → 실패: 오른쪽 묶음이 둘째 줄 왼쪽에 붙거나 간격이 가로6px·세로8px와 다르면 실패.
- 추가 조건: 같은 폭의 관련 페이지에 범위·검색·필터·시간을 모두 표시 → 왼쪽 범위/검색/필터, 오른쪽 공통 시간/보기 → 화면마다 순서나 프리셋 집합이 달라지면 실패. 공통 판정은 [CMP-CTRL-TOOLBAR](components/controls.md#CMP-CTRL-TOOLBAR)에 연결한다.
- 현재: `kit/components/list-toolbar.js:24`의 slots는 세로8px, 내부6px와 오른쪽 auto margin을 쓰며 legacy start/end 경로도 남아 있다.
- 차이: slots는6px/8px지만 legacy start/end를 별도로 받는다. 줄바꿈 뒤 오른쪽 좌표를 확인하는 시험은 없다 → T-B-023.
- 고정 장치: `kit/components/list-toolbar.test.mjs` — `slots stand in one order whatever order they are given in, left then right`
- 출처: D00825, D00826, D01043; D00828

<a id="B-024"></a>

### B-024 검색 칸·검색 칩·선택 목록

- 목표: 입력: 검색에 api를 입력하고11개 선택 항목에서 마지막 항목으로 키보드 이동한다 → 기대: 승인된 검색 위치는 도구 줄 왼쪽(범위 다음, 거르기 전)이며 검색 칸만 별도 한 줄을 만들지 않는다. 말은 “검색”, placeholder는 대상만 표시하고 “예:” 설명·실행 버튼을 두지 않는다. 입력 중 결과를 갱신하며 지우기 x가 나타나도 크기가 움직이지 않는다. 선택 목록은 최대 10행 높이 이후 스크롤하고 긴 목록은 검색을 제공한다. 다중 선택은 checkbox, 단일 선택은 check다. 목록은 현재 목록을 거르고 다른 종류의 일치는 별도 이동으로 안내한다. 목록 밖 화면은 클러스터 전체 이름 검색을 제공한다. 검색 상태는 화면 정의에 두어 AI 조작과 보고서에도 적용한다. 확인할 세부 값: 기존 승인 위치·검색 대상·즉시 갱신을 확인한다. 새 모양은 B-001의 승인 규칙을 따른다. x 표시 전후 input rect 동일, 11행 목록 내부 스크롤, 선택과 검색 키보드 이동을 확인한다. 표시·판정 출처: `화면 검색 state와 select.items`. → 실패: 결과가 입력 중 바뀌지 않거나 지우기 버튼 때문에 검색 칸 폭이 변하면 실패.
- 추가 조건: 쿼리 입력을 연다 → AI 입력창과 같은 공통 틀을 쓴다 → 실행 버튼을 별도 줄·다른 모양으로 구현하면 실패. 출처: 옛 화면 규칙. 실제 쿼리 화면 고정은 T-B-024에서 확인한다.
- 현재: `kit/components/list-toolbar.js:35`의 search 슬롯, `select.js`, `query-line.js`와 `apps/wake/pages/cluster-search.js`에 입력·선택·검색 경로가 있다.
- 차이: select의 긴 목록 검색은 시험에 있다. 화면별 이름 검색의 대상 범위와 AI 상태 선언을 함께 검사하지 않는다 → T-B-024.
- 고정 장치: `kit/components/select.test.mjs` — `a list longer than the visible rows gets a search field on top and opens under the field; search overrides`
- 출처: D00818, D00819, D00879, D00995, D00996

<a id="B-025"></a>

### B-025 코드 보기·YAML·차이

- 목표: 입력: resourceVersion=123과 managedFields가 있는 긴 YAML 및 파일 차이를 연다 → 기대: YAML·로그·명령·연결 출력·권한 시트·GitOps 차이는 kit code-block을 사용한다. YAML 구문 강조, managedFields 숨김, 머리 resourceVersion, hover/focus 보조 복사를 갖는다. 긴 YAML의 줄바꿈은 승인된 코드 보기 동작을 따르며 일반 표의 한 줄 규칙을 적용하지 않는다. GitOps는 왼쪽 파일 트리와 오른쪽 파일별 − 클러스터/+ Git 차이이며 폭에 따라 한 줄/나란히 전환한다. 코드 접힘·나란히 보기·숨긴 줄 펼침은 재렌더 뒤에도 사용자 상태를 보존한다. 여러 YAML은 같은 파일 보기 안에서 전환하고 별도 알약을 무작정 늘리지 않는다. sticky 코드 머리는 불투명 바탕으로 스크롤 중 줄이 비치지 않게 한다. 확인할 세부 값: 긴 YAML·빈 YAML·오류 출력·권한 YAML·여러 파일 차이를 두 테마에서 확인한다. 복사 값은 원문과 같고 숨김 필드 정책을 구분한다. 가로/세로 스크롤의 소유자, 긴 줄 줄바꿈, 코드 배경 불투명, 머리 값 원본을 확인한다. 표시·판정 출처: `metadata.resourceVersion·managedFields 및 codeBlock.text`. → 실패: resourceVersion 누락·managedFields 노출·복사 원문 변형 또는 재렌더 뒤 사용자 접힘 소실이면 실패.
- 추가 조건: 입력 키·문자열·숫자·불리언·주석이 섞인 실제 YAML → 기대 원문을 보존하며 코드 구성 요소의 YAML 구문 하이라이트 적용 → 실패 일반 텍스트로만 표시하거나 하이라이트 때문에 원문 변경
- 현재: `apps/wake/pages/resource-detail.js:669`의 YAML 머리와 :670의 codeBlock wrap:true, `kit/components/code-block.js` 및 `file-viewer.js`가 있다.
- 차이: resource-detail은 YAML wrap과 resourceVersion을 출력하지만 조건부 Revision도 추가한다. 중복 버전 표시의 필요성은 정해지지 않았다 → T-B-025.
- 고정 장치: 고정 없음 → T-B-025
- 출처: D00050, D00054, D00879, D00931, D00996, D01038, D01042; D00253

### B-026 근거 이름표

- 목표: → [RULE-EVIDENCE](rules.md#RULE-EVIDENCE).
- 현재: `kit/components/ref.js:23`에는 키 활성화가 없고 `apps/wake/desktop/ai-run.cjs:154`는 tools.call 뒤 성공 여부와 무관하게 incidentOf를 used에 넣는다.
- 차이: tools.call 결과가 실패여도 incidentOf를 used에 추가하며 ref에는 키 활성화가 없다( apps/wake/desktop/ai-run.cjs:153–154, kit/components/ref.js:23) → T-B-026.
- 고정 장치: 고정 없음 → T-B-026
- 출처: D00884, D00885

<a id="B-027"></a>

### B-027 차트 모양·높이·범례

- 목표: 입력: 0점·1점·다중 시리즈를 폭 200px와1000px에 표시한 뒤 범례를 누른다 → 기대: 차트는 공통 chart-card와 계열 부품을 사용한다; [RULE-CHART](rules.md#RULE-CHART). 선 굵기3px, 실제 시리즈 색과 면 채움, 단위 있는 축, 일관된 머리 값 글자 단계를 적용한다. 범례 클릭은 해당 시리즈 표시를 제어하며 +N은 숨긴 목록을 연다. 작은 차트에 불필요한 확대 버튼을 넣지 않는다. 범주·시간축 엔진의 선 두께와 위에서 아래로 옅어지는 면 채움을 통일한다. 새 표본은 이전 마지막 점에서 이어지고 그래프 전체가 사라졌다 다시 생기지 않는다. D00568이 허용한 시간축 밀림 효과 생략을 필수 애니메이션으로 뒤집지 않는다. 같은 화면 차트의 시간축·커서를 공유하고 축 소수는 첫째 자리까지 표시한다. 확인할 세부 값: 단일/다중/0/1점 차트와 최소·최대 폭에서 높이, 선, 면, 범례를 비교한다. 같은 열의 차트 폭이 맞고 범례가 카드 높이를 임의로 늘리지 않아야 한다. 장식 PromQL 설명은 없애되 실제 질의 편집 기능은 구분한다. 표시·판정 출처: `chart.series·timeAxis 및 chart-aspect 토큰`; 실패: 시계열·범주형별 높이가 [RULE-CHART](rules.md#RULE-CHART)를 벗어나거나 범례가 다른 시리즈를 숨기면 실패.
- 추가 조건: 입력 선·막대 등 서로 다른 차트 유형을 동일 화면·배율에서 비교 → 기대 승인된 공통 눈금·글꼴·간격·범례 규칙을 공유 → 실패 단위 차이와 무관하게 같은 역할의 눈금·간격·높이가 달라짐.
- 추가 조건: 입력 1280px 홈에서 긴 범례·이벤트 값을 가진 AWS·GKE·kind 자료 → 기대 그래프 판단 공간을 유지하고 승인된 범례 넘침 처리 및 한 줄 행·전문 접근 적용 → 실패 범례/셀 줄바꿈 때문에 행·영역이 불필요하게 높아지고 그래프가 작아짐
- 현재: `kit/components/chart-card.js:272`에 aspect·높이 제한·static·legend 경로가 있고 관련 값은 `kit/tokens.css:26`에서 읽는다.
- 차이: 공통 차트의 aspect·범례 경로는 있다. 페이지 재조회가 조상 DOM을 바꾸는 경우에는 부품 갱신 시험만으로 재등장을 막지 못한다 → T-B-027.
- 고정 장치: 고정 없음 → T-B-027
- 출처: D00562, D00563, D00565, D00566, D00568, D00569, D00570, D00571, D00573, D00575, D00576, D00581, D00595, D00605, D00776, D00778, D00817, D00829, D00935, D01000; D00187; D00209

<a id="B-028"></a>

### B-028 차트 머리 값·과거·끊김·오래됨

- 목표: 입력: 동일 UID의 과거 범위에 빈 시리즈·한 점·중간 누락을 응답한 뒤 UID를 교체한다 → 기대: 머리 값은 선택 구간·시리즈·집계 기준에 맞는 실제 값이다. 과거 구간 값을 현재 값처럼 표시하거나 없음을 0으로 만들지 않는다. 빈 시리즈/한 점/중간 누락은 구분하고 끊긴 구간을 임의로 잇지 않는다. 오래된 동일 대상 데이터는 오래됨을 표시해 남길 수 있지만 다른 대상 값은 재사용하지 않는다. 실시간 펄스는 실제 최신 구간에만 적용한다; [RULE-RANGE](rules.md#RULE-RANGE). 어제/지난주 등 비교 시리즈는 기준 기간을 식별하고 같은 단위·집계·시간 정렬을 사용하며 서로 다른 기간을 현재 값처럼 섞지 않는다. 확인할 세부 값: 원본 대조는 B-046을 따른다. 과거 범위의 live 표시 0, 누락의 가짜0 0, 대상 전환 후 이전 UID 데이터 0. 머리 값의 선택 기준은 각 화면 차트 스펙에 명시한다. 표시·판정 출처: `series.observations·UID·range.from/to·collectedAt`; 실패: 누락을0으로 잇거나 과거에 live 표식·새 UID에 옛 값이 나오면 실패.
- 추가 조건: → [RULE-RANGE](rules.md#RULE-RANGE). 공통 판정은 [CMP-CTRL-TIME](components/controls.md#CMP-CTRL-TIME)에 연결한다.
- 현재: `apps/wake/pages/cluster-home.js:70`의 loadSeries·nowValue·spanText가 stale과 과거 범위를 나누며 `kit/components/chart-card.js:272`는 timeAxis와 rangeAction을 받는다.
- 차이: 홈 과거 범위는 spanText와 stale로 구분한다. 다른 페이지의 머리 값과 비교 시리즈가 동일 집계인지 묶는 검사는 없다 → T-B-028.
- 고정 장치: `apps/wake/pages/cluster-home.test.mjs` — `a_past_window_names_its_span_in_the_head_and_going_back_restores_the_live_range`
- 출처: D00451, D00611, D00612, D00830, D00831; D00615

<a id="B-029"></a>

### B-029 축 드래그와 키보드

- 목표: → [RULE-CHART](rules.md#RULE-CHART).
- 추가 조건: → [RULE-CHART](rules.md#RULE-CHART).
- 추가 조건: → [RULE-CHART](rules.md#RULE-CHART).
- 현재: `kit/components/chart-card.js:1313,1326,1373`에 축 이벤트가 있고 `kit/components/chart-card-axis.test.mjs`에 드래그·키보드·readonly 사례가 정의되어 있다.
- 차이: 축 드래그·키보드·readonly 경로는 chart-card-axis 시험에 있으나 실제 페이지의 wheel 소유 경계는 포함하지 않는다 → T-B-029.
- 고정 장치: 고정 없음 → T-B-029
- 출처: D00562, D00595, D00830, D00875, D01000; D00804

<a id="B-030"></a>

### B-030 시간 막대

- 목표: → [RULE-RANGE](rules.md#RULE-RANGE).
- 추가 조건: → [RULE-RANGE](rules.md#RULE-RANGE).
- 추가 조건: → [RULE-RANGE](rules.md#RULE-RANGE).
- 현재: `kit/components/change-timeline.js:139`, `time-range.js`, `temporal-chart.js`와 `kit/core/clock.js:6`가 시각과 범위를 다룬다.
- 차이: clock과 time-range가 시각·기간을 처리한다. 필터 뒤 표와 타임라인의 절대 구간 일치를 검사하는 통합 시험은 없다 → T-B-030.
- 고정 장치: 고정 없음 → T-B-030
- 출처: D00273, D00610, D00708, D00709, D00711, D00830, D00874, D00875; D00826; D00828

<a id="B-031"></a>

### B-031 흐름 그래프의 승인된 표현

승인된 흐름의 값과 조건은 → [RULE-SANKEY](rules.md#RULE-SANKEY).

- 목표: → [RULE-SANKEY](rules.md#RULE-SANKEY).
- 추가 조건: → [RULE-SANKEY](rules.md#RULE-SANKEY).
- 추가 조건: → [RULE-SANKEY](rules.md#RULE-SANKEY).
- 추가 조건: → [RULE-SANKEY](rules.md#RULE-SANKEY).
- 추가 조건: → [RULE-SANKEY](rules.md#RULE-SANKEY).
- 현재: `kit/components/flow-graph.js:590`는 relation 타일과 막대 분기, tilePath·band·읽기 tooltip을 가지며 `flow-graph-relation.test.mjs`가 관계 입력을 검사한다.
- 차이: flow-graph는 relation과 막대형을 분기한다. 정상 2490개 요약·문제 3개 선택은 렌더러 입력을 만드는 호출부 계약이다 → T-B-031.
- 고정 장치: 고정 없음 → T-B-031
- 출처: D00538, D00544, D00571, D00720, D00724, D00780, D00783, D00821, D00833, D00836, D00838, D00841, D00842, D00843, D00844, D00845, D00846, D00847, D00848, D00849, D00850, D00851, D00852, D00853, D00854, D00855, D00856, D00857, D00858, D00859, D00860, D00861, D00862; D00537

### B-032 일곱 가지 출처 상태

- 목표: → [RULE-STATE](rules.md#RULE-STATE).
- 현재: `apps/wake/pages/view-parts.js:69`의 readRow와 skeletonBar/skeletonTable, `kit/components/stale-line.js:17`가 상태별 표현을 제공한다.
- 차이: readRow와 staleLine은 상태 표시를 제공하지만 호출부가 실패를 빈 배열로 바꾸면 이를 복원하지 못한다 → T-B-032.
- 고정 장치: 고정 없음 → T-B-032
- 출처: D00606, D00999

### B-033 레이아웃 먼저 그리는 로딩

- 목표: → [RULE-SKELETON](rules.md#RULE-SKELETON).
- 현재: `apps/wake/pages/view-parts.js:81`의 skeletonTable은 실제 columns와 기본 8행을 받으며 readRow loading은 skeletonBar를 쓴다.
- 차이: skeletonTable은 실제 columns를 받지만 모든 페이지가 초기 loading에서 이 함수를 호출하도록 강제하지 않는다 → T-B-033.
- 고정 장치: 고정 없음 → T-B-033
- 출처: D01022, D01027, D01031, D01032

<a id="B-034"></a>

### B-034 빈 상태

- 목표: 입력: 총0건·검색 0건·미연결·403을 같은 표에 각각 입력한다 → 기대: 정상 조회 결과가 0개일 때만 빈 상태다. 표는 실제 열 머리를 유지하고 빈 행 자리를 둔다. 전체 빈 화면은 짧은 명사구와 필요한 동작 하나를 쓴다. 비어 있음, 검색 결과 없음, 출처 미연결, 권한 없음은 다른 상태로 표현한다. 임의 견본으로 빈 상태를 채우지 않는다. 카드 안 빈 상태는 아이콘 없는 흐린 한 줄이며 기간은 머리에만 둔다. 표의 빈 행 계약과 전체 화면의 empty-state 계약을 혼합하지 않는다. 확인할 세부 값: 총 데이터 0/필터결과0/연결없음/403/부분 실패를 비교한다. 결측 셀 판정은 [RULE-STATE](rules.md#RULE-STATE)를 따른다. 데이터가 생길 때 불필요한 머리나 카드 이동이 생기지 않아야 한다. 표시·판정 출처: `성공 응답 rows.length·query·source state`. → 실패: 열 머리가 없어지거나403이 빈 목록·없는 수치가0으로 나오면 실패.
- 현재: `kit/components/data-table.js:94`의 keepEmptyRow·emptyText와 `kit/components/empty-state.js`가 존재하며 화면 호출자가 빈 결과와 실패를 선택한다.
- 차이: keepEmptyRow는 호출자가 선택한다. 실패와 정상 0건을 구분하는 책임도 호출부에 있어 부품만으로 빈 상태를 보장하지 못한다 → T-B-034.
- 고정 장치: 고정 없음 → T-B-034
- 출처: D00361, D00606

<a id="B-035"></a>

### B-035 메뉴·팝오버·팔레트·다이얼로그

- 목표: 입력: 창 네 모서리에서 메뉴·하위 메뉴·승인 시트를 열고 Escape로 닫는다 → 기대: 떠 있는 면은 같은 --float-* 배경·선·그림자·간격을 사용하고 역할에 따라 panel/dialog 반경을 쓴다. 메뉴는 실제 트리거 옆에 붙고 창 밖으로 넘지 않는다. 팔레트와 다이얼로그는 승인된 폭·검색·목록 동작을 보존한다. Escape/바깥 클릭/선택 후 닫기와 원래 트리거 focus 복원을 일관되게 제공한다. 승인 시트의 허용/거절 의미는 시각 변경으로 바꾸지 않는다. 팝업 안 팝업은 금지하고 승인된 겹친 하위 메뉴만 예외다. native view 위 메뉴의 덮개는 연 소유자가 닫을 때까지 유지한다. 다른 화면 이동은 link, 현재 화면 행동은 secondary sm, 권장 하나만 default, 보조 아이콘은 ghost를 쓴다. 확인할 세부 값: 화면 네 모서리·긴 목록·서브메뉴·검색 결과0·disabled에서 pointer/keyboard를 확인한다. backdrop/메뉴가 문맥을 가리거나 스크롤 잠금이 닫힌 뒤 남으면 실패다. focus trap과 focus 복귀를 각 dialog에 검사한다. 표시·판정 출처: `menu 트리거 rect·dialog action·activeElement`. → 실패: 창 밖 항목·닫힌 뒤 스크롤 잠금·트리거 초점 유실이면 실패.
- 추가 조건: 같은 역할의 권한/다른 화면 이동이 있는 행 여러 개 → 기존 공통 행 끝 슬롯·동작 문법 유지 → 한 화면만 중간에 별도 버튼을 만들면 실패. 공통 판정은 [CMP-CTRL-TOKENS](components/controls.md#CMP-CTRL-TOKENS)에 연결한다.
- 현재: `kit/components/menu.js:56`, `submenu.js`, `context-menu.js`, `palette.js`, `dialog.js`가 공통 float 토큰을 사용한다.
- 차이: 공통 float 토큰을 공유해도 native 도구 view의 덮개 해제와 메뉴 focus 복귀는 서로 다른 소유자다 → T-B-035.
- 고정 장치: 고정 없음 → T-B-035
- 출처: D00707, D00760, D00818, D00819; D00726

<a id="B-036"></a>

### B-036 토스트와 알림 카드

- 목표: 입력: 1·2·3칸에서 알림1개를 표시하고3000ms를 기다린다 → 기대: 토스트·알림 카드는 overlay이며 본문 폭·위치·여백을 움직이거나 줄이지 않는다. 최신 알림 카드 위치는 가장 오른쪽 칸의 머리 아래로 닫기·도구 줄을 가리지 않는다. 보통 토스트는 3초, 사용자가 해결해야 하는 중요 알림은 의미 있는 동작까지 유지한다. 진행 막대를 제거한 승인 모양과 알약 면·선·반경을 사용한다. 같은 사건의 중복 토스트를 쌓지 않는다. 확인할 세부 값: 표시 전/중/후 본문·칸 rect 변화 0. 1/2/3칸과 좁은 창에서 닫기·도구 줄이 가려지지 않아야 한다. 보통 3000ms 만료와 중요 알림 유지, Escape/닫기/동작 버튼 focus를 확인한다. 표시·판정 출처: `notice.id·persist·duration와 가장 오른쪽 pane rect`. → 실패: 본문 rect가 변하거나 알림이 칸 닫기·도구 줄을 가리면 실패.
- 현재: `kit/components/notice.js:44`의 컨테이너는 fixed이고 persist/duration을 받으며 `kit/components/toast.js`는 별도 토스트 수명을 다룬다.
- 차이: fixed 알림 위치 선언은 있다.1·2·3칸의 머리·도구 줄과 겹치지 않는지는 toast 수명 시험으로 판정하지 못한다 → T-B-036.
- 고정 장치: `kit/components/toast.test.mjs` — `toast_stack_long_content_and_overlay_lifecycle`
- 출처: D00914, D00915, D00950, D00957

<a id="B-037"></a>

### B-037 용어·금지 표현·날짜

- 목표: 입력: 오늘과 전년도 시각·Ready2 Desired3·긴 원문 로그를 표시한다 → 기대: 화면 문구는 apps/wake/locale에 두고 glossary의 개념별 이름 하나를 쓴다. Kubernetes/도구 원문 용어는 음차·직역하지 않는다. 메타 설명, “~함/못함”, “미~” 축약, 조사 조립, 과장·데모 문장을 쓰지 않는다. 시간의 절대 날짜는 연도를 포함하고 단위·시간대는 일관된다. n/n 진행·준비 분수는 Ready 2 · Desired 3처럼 이름 있는 값으로 나눈다. 표는 한 줄+실제 잘림 tooltip이며 AI 답변·보고서 문단·코드의 승인 줄바꿈은 예외다; [RULE-TIME](rules.md#RULE-TIME). Age는45s·13m·5h·144d 같은 원문 형식이다. 데이터 원문 로그·질의·YAML에는 화면 문구 교정 규칙을 적용하지 않는다. 확인할 세부 값: `node kit/tools/check-locale.mjs`와 화면 문자열 검토를 함께 한다. 로그·이벤트 메시지·YAML·질의 RAW_FIELDS는 원문을 수정하지 않는다. 새해 경계 날짜, 긴 상태 문구, 잘리지 않은 값의 불필요한 tooltip을 검사한다. 운영 상태·실패·stale 표시는 메타 금지로 지우지 않는다. 표시·판정 출처: `locale 키·glossary·timestamp·referenceAt·RAW_FIELDS`; 
- 추가 조건: 사람을 표시한다 → 공통 사용자 표식인 아바타와 이름을 함께 쓴다 → 화면마다 다른 사람 표식을 만들면 실패. 출처: 옛 화면 규칙. 실제 소비 화면 고정은 T-B-037에서 확인한다.
- 현재: `apps/wake/locale/glossary.js:13`와 `kit/tools/check-locale.mjs:15`가 사전과 화면 문자열을 검사하며 원문 필드 예외가 있다.
- 차이: check-locale은 RAW_FIELDS를 제외한다. 런타임 날짜의 연도·시간대와 잘림 툴팁은 문자열 검사 대상이 아니다 → T-B-037.
- 고정 장치: 고정 없음 → T-B-037
- 출처: D00728, D00748, D00794, D00831, D00875

### B-038 보고서의 문서 표현

- 목표: 입력: 여러 쪽 표·긴 로그·차트·한글 문단을 포함한 보고서를 PDF와 Markdown으로 내보낸다 → 기대: 보고서는 조각 카드의 모음이 아니라 한 장의 문서다. 제목·단계·문단·근거·표·차트를 문서 흐름에 놓는다. 차트는 실제 공통 chart-card의 static 표현을 쓰고 hover/드래그 장식을 제거한다. PDF는 화면 캡처를 붙이는 방식이 아니라 문서 내보내기다. A4 페이지에서 표·코드·긴 문장이 잘리거나 중간에 의미 없이 끊기지 않아야 한다. PDF는 테마와 무관한 흰 바탕·검은 글자, 쪽 머리 문서 제목·인시던트 번호, 쪽 아래 쪽 번호를 쓴다. 표 머리는 쪽마다 반복하고 행·절 머리·그림과 캡션을 분리하지 않는다. 작은 부록을 묶어 거의 빈 마지막 쪽을 만들지 않는다. 알약·꺾쇠·버튼은 내보내지 않는다. 인쇄 전에 종이 폭으로 차트를 다시 그린다. Markdown은 같은 머리 두 칸 표·번호 절·자료 표·로그 코드·캡션·출처를 유지한다. 확인할 세부 값: 긴 표·여러 차트·코드·한글 문단·근거를 포함한 보고서를 화면 및 PDF에서 대조한다. 동일 값·제목·순서를 유지하고 마지막 페이지까지 확인한다. 카드 외곽 중복과 상호작용 없는 가짜 버튼 0개. 표시·판정 출처: `report blocks와 reportCanvas.pageSheet·print`. → 실패: 표 머리 반복 누락·행 분할·빈 마지막 쪽 또는 화면과 수치가 다르면 실패.
- 현재: `kit/components/report-canvas.js:189`의 print·A4 스타일, `chart-card.js` static과 `apps/wake/pages/incident-report-doc.js:25`의 문서 구성 경로가 있다.
- 차이: reportCanvas.print는 종이 폭·light 테마를 적용한다. 실제 PDF 쪽 나눔·고아 제목 결과는 HTML 시험에서 검사하지 않는다 → T-B-038.
- 고정 장치: `kit/components/report-canvas.test.mjs` — `print: a cell keeps one line; long raw text stands under the table; a small section is marked to stay on one page`
- 출처: D00942, D00948, D00949

<a id="B-039"></a>

### B-039 보고서 선택과 AI 변경 표시

- 목표: 입력: 보고서 본문을 드래그해 선택하고 Delete·undo·머리 드래그·Escape를 수행한다 → 기대: 보고서 문맥 선택은 승인된 드래그 선택을 쓰며 과거 checkbox 방식을 되살리지 않는다. AI의 필터·강조·변경은 실제 화면 상태에 반영하고 그 상태를 알 수 있게 한다. AI가 바꿨다는 장식만 붙이고 자료는 그대로인 상태를 허용하지 않는다. 근거 이동과 선택 대상이 같은 대상을 가리켜야 한다. 본문·빈 곳에서 시작한 드래그는 닿은 행·줄·문장을 선택하고 머리를 지나거나 선택할 줄 없는 절은 통째로 선택한다. 머리에서 시작한 드래그는 순서만 바꾼다. 클릭은 하나, Shift/Cmd/Ctrl은 추가·제거, 빈 곳·Escape는 해제한다. 선택 중에만 머리 도구를 선택 수·삭제·AI 참조로 바꾸되 높이는 유지하며 Delete/Backspace 삭제·되돌리기를 제공한다. AI 적용 줄은 바뀐 필터 칩과 인시던트 링크만 두고 칩 하나를 지우면 그 값만 이전으로 복귀한다. 확인할 세부 값: 여러 블록 드래그 선택·해제·AI 요청·필터 적용·복귀를 확인한다. 선택 범위와 요청한 context ID가 일치하고 화면 변경 뒤 요약·표·차트가 같은 필터를 사용한다. 스크롤 중 선택이 다른 대상을 가리키면 실패다. 표시·판정 출처: `report.selected·block id·handle 연산`. → 실패: 체크박스가 나타나거나 머리 드래그가 선택을 만들고 undo가 원문을 잃으면 실패.
- 현재: `kit/components/report-canvas.js:240`는 본문 marquee 선택과 머리 드래그 순서 변경을 나누며 `kit/components/ai-applied.js`가 변경 표시를 제공한다.
- 차이: reportCanvas.handle은 stable ids를 전달하지만 incident-report 참조 호출은 label 앞80자만 사용한다 → T-B-039.
- 고정 장치: `kit/components/report-canvas.test.mjs` — `handle: set, add, clear, move, delete and undo; refer hands over stable ids`
- 출처: D00884, D00885, D00887, D00943

<a id="B-040"></a>

### B-040 AI 칸·입력·승인·새 탭

- 목표: 입력: 공급자 없이 첫 질문을 입력한 뒤 공급자를 연결하고 같은 대화를 재개한다 → 기대: AI는 오른쪽 칸 하나이며 현재 탭 문맥을 따른다. 도구 목록에서 AI를 눌러 본문에 중복 AI 화면을 만들지 않는다. 입력 아래 AI 권한·클러스터/namespace·모델·추론 노력은 연결 여부와 관계없이 유지한다. 제안은 답변 안, 선택은 입력 바로 위 질문 패널의 “허용하고 실행”(⌘Enter)/“거절”(Escape)이다. 새 탭 검색·검색/묻기·대화/인시던트 탭은 승인된 알약 반경·높이·시작선을 맞춘다. 확인할 세부 값: 모델 없음→연결→후속 질문→다시 열기, 승인/거절/입력 중 거절, 도구에서 AI 열기, 새 탭 좁은 폭을 검수한다. 첫 질문이 사라지거나 AI 칸이 둘이면 실패다. 제안 target과 승인 대상은 같아야 한다. 표시·판정 출처: `대화 messages·model·scope·approval.target`. → 실패: 저장한 첫 질문이 후속 모델 입력에서 빠지거나 새 대화로 갈라지면 실패.
- 현재: `apps/wake/desktop/ai-run.cjs:135`는 모델 없음 때 record(:139) 전에 반환하며 `kit/components/approval-head.js`, `question-panel.js`가 승인·질문 UI를 제공한다.
- 차이: 공급자 부재 분기와 대화 저장의 순서 때문에 첫 질문 보존이 별도 경계다. 재연결 후 후속 모델 history까지 검사하는 고정이 없다 → T-B-040.
- 고정 장치: 고정 없음 → T-B-040
- 출처: D00694, D00765, D00870, D01000, D01001, D01005, D01009

### B-041 화면 검수와 회귀 고정

- 목표: 입력: 동일 소스·대상·상태로 다크/라이트 1280·1680 창의 기본·끝 스크롤을 비교한다 → 기대: 스펙을 바꾸면 같은 변경에서 고정 장치를 갱신한다. 고정 장치 없이 화면을 바꾸지 않는다. 부품 하나는 한 소유자가 고친다. 다크/라이트 × 1280/1680에서 기본·열림·hover·focus·빈/실패·끝까지 스크롤을 확인한다. 캡처는 앱·페이지·대상·범위·테마·폭·현재 코드의 정체가 맞아야 한다. 자동 시험·fixture·브라우저·Electron·실제 클러스터·사용자 승인을 구별한다. 확인할 세부 값: verification.md의 반복 회귀별 고정 장치와 판정표를 채운다. 구조 정리는 전후 화면 변화 0, 화면 변경은 승인된 차이만 허용한다. 검토자는 같은 고정 사본을 독립 검토하고 major 0 기준을 적용하되 minor를 삭제하지 않는다. Mac의 기준 그림 갱신 권한은 통합 담당에게 있다. 표시·판정 출처: `route·UID·source hash·viewport·관측 수`. → 실패: 다른 route 캡처나0관측 결과를 현재 화면 합격으로 처리하면 실패.
- 현재: `kit/tools/check-surfaces.mjs:44`의 SHOWN_WHY는 숨김·opacity 판정을 하고 `kit/tools/check-layout.mjs`는 화면 좌표를 검사한다.
- 차이: check-surfaces의 opacity 판정은 있지만 filter:opacity와 캡처 route 정체는 같은 검사 범위가 아니다 → T-B-041.
- 고정 장치: 고정 없음 → T-B-041
- 출처: D00006, D00008, D00009

<a id="B-042"></a>

### B-042 상세와 본문 배치 순서

- 목표: 입력: Pod·Deployment·Node 상세의 요약을 열고 관련 구역으로 이동한다 → 기대: 모든 리소스 상세의 요약 순서는 상태 막대 → 시간 → 지표 → 상태·컨테이너 표 → 조건 → 종류별 속성 → 라벨이다. 없는 구역은 생략하되 순서는 바꾸지 않는다. 이벤트·로그·종류별 기록·YAML·관련은 요약 뒤 탭이다. 목록의 요약 그래프는 표 위, 질의 화면은 입력 → 차트 → 표다. 확인·범위의 큰 숫자 칸은 머리 요약과 중복하므로 앱과 시뮬레이션에서 제거하는 결정이다. 상세 머리에는 종류 아이콘·이름·목록과 같은 상태·종류/namespace/클러스터·주 행동 하나를 둔다. 머리 아래 원인 행은 탭 전환에도 남고 상태 문구를 반복하지 않는다. 워크로드 원인은 문제 Pod, 다른 종류는 그 대상의 원인이며 읽기 제한은 중립 행이다. 상세 안의 둘째 머리·상세의 서브뷰를 만들지 않는다. 확인할 세부 값: Pod/Deployment/Node 및 자료 없는 리소스에서 DOM·화면 순서를 비교한다. 상세 아래 별도 상세를 겹치지 않고 “요약” 탭 이름을 사용한다. 숫자 칸 제거 뒤에도 같은 판단 값이 머리 요약에 남아 있어야 한다. 표시·판정 출처: `resource-detail summary와 리소스 status·metadata·spec`. → 실패: 요약 순서가 바뀌거나 상세 안 둘째 머리·하위 상세가 생기면 실패.
- 현재: `apps/wake/pages/resource-detail.js:570`의 summary/tab 구성과 `apps/wake/pages/view-parts.js`의 구역 탭 정의가 있다.
- 차이: resource-detail summary는 정해진 순서로 구성한다. 리소스 종류별 없는 구역 생략과 주 행동 중복을 전수 검사하지 않는다 → T-B-042.
- 고정 장치: 고정 없음 → T-B-042
- 출처: D00063, D00066, D00331, D00882, D00883, D00919, D01004, D01007

<a id="B-043"></a>

### B-043 터미널과 외부 도구의 경계

D00038·D00039: 터미널 바의 위 화살표 크게 보기를 누르면 패널이 위쪽으로 확장되어 중앙 칸 전체 높이를 사용한다. 복귀를 누르면 기존 dock 높이로 돌아가며 같은 세션·대상·출력을 유지한다. 현재 `kit/components/terminal-panel.js:19–23,52`가 expanded 높이·핸들 숨김·확대/복귀 버튼을 정의한다. 실제 애니메이션·상단 도달·복귀는 SCR-TERMINAL-EXPAND에서 검수한다.

- 목표: 입력: 터미널에 100줄 출력 후 테마를 바꾸고 확장·복귀한다 → 기대: 터미널은 실제 세션의 입력·출력·크기 변경을 보여 주며 가짜 로그 보기로 대체하지 않는다. 머리와 본문은 선택한 터미널 테마를 함께 따르고 머리 경계선을 일관되게 둔다. 기본은 앱 따르기이며 Midnight/Paper/Solarized를 구별한다. 펼침·복귀·닫기 뒤 옆 칸과 본문 스크롤을 보존한다. HTTP 도구를 여는 동작과 로컬/원격 터미널을 여는 동작은 이름과 내용이 일치해야 한다. Grafana·Argo CD 등 외부 도구의 상단바와 스크롤이 Wake 셸에 겹치거나 잘리지 않아야 한다. 합격 조건: 두 앱 테마 × 터미널 기본/세 preset, 활성/비활성, 펼침/복귀, 긴 출력의 마지막 줄과 입력을 확인한다. 머리·본문의 실제 세션 색이 맞고 색·폰트 변경 때 세션 내용이 사라지지 않아야 한다. 실제 외부 도구 페이지에서 첫/끝 스크롤과 경로 막대 겹침을 캡처한다. 로컬/원격/명령 실행/진단 세션 종류를 기록한다. 표시·판정 출처: `terminal session PID·stdout·theme와 native view`. → 실패: PID·출력이 사라지거나 외부 도구와 경로 막대가 겹치면 실패.
- 현재: `kit/components/terminal-panel.js:19`는 세션 배경·머리선·dock을, `kit/shell/terminal.js`는 세션을, `kit/desktop/main.cjs`는 외부 도구 view를 관리한다.
- 차이: terminal-panel은 expanded 높이를 정의한다. theme·PID·긴 출력·외부 도구 스크롤을 한 세션으로 묶는 검사는 없다 → T-B-043.
- 고정 장치: 고정 없음 → T-B-043
- 출처: D00034, D00037, D00041, D00043, D00044, D00046, D00189

<a id="B-044"></a>

### B-044 상태 흐름과 접힌 판단 값

- 목표: 입력: 보고하지 않은 단계와 이벤트 3개·승인 action 1개를 statusFlow에 넣고 접는다 → 기대: 상태 흐름은 실제 보고된 이벤트→승인/적용/확인 단계→결과를 한 줄로 나타내고 접혀 있어도 대상·출처·현재 상태를 읽을 수 있어야 한다. 여러.
- 추가 조건: 입력 이벤트는 같은 묶음의 개수로 표시하며 같은 흐름을 중복 행으로 반복하지 않는다. 보고되지 않은 단계는 idle이며 done으로 만들어내지 않는다. 판단이 필요한 단계에는 실제 가능한 재시도·승인·적용 동작을 연결하고 카드 머리와 결정 행에 같은 버튼을 중복하지 않는다. 열림 상태와 선택 노드는 페이지가 소유한다. 확인할 세부 값: idle/run/wait/fail/done/live, 이벤트 0/1/3개, 결정 있음/없음, 선택 노드와 접힘/펼침, 긴 이름을 검수한다. 없는 단계 완료표시0, 같은 action의 머리/결정 중복0, 버튼 클릭 시 해당 unit·node·action이 일치해야 한다. reduced-motion에서도 실제 상태와 동작은 유지한다. 표시·판정 출처: `statusFlow.unit·sections·decision·actions`. → 실패: 미보고 단계가 done이거나 같은 action이 머리와 결정에 중복되면 실패. 실행·실패·대기 단계가 있는 GitOps 작업 → 단계별 시각 장치 아래 이름/상태, 실제 진행·정지 상태 모션과 가능한 판단 버튼 → 텍스트 표만 제공하거나 시각 단계와 아래 상태가 분리되면 실패.
- 추가 조건: 같은 작업에 수신 이벤트 3개 → 요약 진입 노드 하나와 실제 개수, 원본 개별 기록은 상세 유지 → 3개 진입 노드가 별도로 반복되면 실패. 공통 판정은 [SCR-GITOPS-CARD](screens/gitops.md#SCR-GITOPS-CARD)에 연결한다.
- 추가 조건: 동일 작업의 복수 원천 이벤트 → 요약에는 짧은 키워드·수, 세부 원천은 상세/기록에서 확인 → 원천별 긴 설명이 단계 흐름을 밀어내면 실패. 공통 판정은 [CMP-FLOW-STAGES](components/flow-graph.md#CMP-FLOW-STAGES)에 연결한다. 새 event.id 도착과 같은 event.id 재조회 → 실제 새 사건에 시각 변화, 아래에는 짧은 키워드, 같은 사건을 새 발생처럼 반복하지 않음 → 정적 숫자만 변하거나 장문 설명으로 대체하면 실패.
- 추가 조건: 기존 GitOps 상태도구를 같은 입력으로 렌더 → 승인된 원형 단계의 가로 한 줄과 상태 모션 보존 → 별도 승인 없이 네모 카드나 세로 단계로 바뀌면 실패.
- 추가 조건: 긴 이벤트 본문과 공급자·상대시각 → 오른쪽 공급자/시각은 하나의 메타 줄, 공통 항목 간격 유지 → 메타만 두 줄로 갈라지거나 서로 붙으면 실패. D00683에 따라 이벤트 공급자는 로고 없는 이름 링크 허용. 같은 GitOps의 요약 바와 이벤트 행 → 요약은 실제 공급자 로고, 이벤트 기록은 로고 제거 후 이름/링크로 출처 보존 → 이벤트 행에 Argo 공급자 로고가 남으면 실패.
- 추가 조건: 실제 GitOps 단계가 run/wait/fail로 전환 → 해당 원형 단계에 승인된 공통 상태 모션 적용, reduced-motion은 상태 의미 유지 → 상태값만 변하고 진행/정지의 시각 구분이 사라지면 실패.
- 추가 조건: 같은 작업을 접힘/펼침으로 전환 → 요약은 기존 점 크기의 원형 상태 장치와 같은 상태 모션·주기 사용 → 접힌 쪽이 정적이거나 크기/상태/모션이 달라지면 실패.
- 현재: `kit/components/status-flow.js:8`은 미보고 단계 idle 계약과 unit/sections/decision/actions를 제공하며 `status-flow.test.mjs`가 동작 중복을 검사한다.
- 차이: 미보고 단계 idle과 결정 action 중복 제거는 시험에 있다. 서비스 실행 결과를 각 단계로 연결하는 것은 호출부 작업이다 → T-B-044.
- 고정 장치: `kit/components/status-flow.test.mjs` — `a step nobody reports on is idle, never done`; 추가 조건 고정 없음
- 출처: D00063, D00064, D00616, D00626, D00632, D00641, D00755; D00628; D00630; D00631; D00679; D00681; D00683; D00693; D00694

### B-045 표의 판단·정렬·이동 계약

- 목표: 입력: danger·warn·정상 Pod와 같은 시각 이력2개를 역순으로 응답하고 정렬 머리를 누른다 → 기대: D-USR-2026-11-16-2. 화면별 표 정의는 SRE가 내릴 판단, 기본 정렬, 문제 우선 기준, 행 이동, 검색·필터 열을 명시한다. 문제가 있는 현재 대상과 읽기 실패를 구분한다; [RULE-SORT](rules.md#RULE-SORT). 시계열 기록은 시각 내림차순 → 안정 ID 오름차순으로 두고 문제만 보기는 별도 필터로 제공한다. 사용자가 고른 정렬에서는 몰래 문제 우선을 덧씌우지 않는다. 숫자는 원시 숫자, 시각은 절대 시각으로 비교하며 빈 값은 양방향 모두 마지막이다. 문제 등급은 해당 화면의 승인된 상태 분류에서 받으며 이 문서가 새 장애 임계값을 만들지 않는다. 대상이 있는 행은 같은 클러스터·namespace·UID의 상세로 열고, 없는 행에 거짓 링크를 만들지 않는다. 검색은 이름·namespace·상태·사유·메시지·원본 경로 중 화면에 선언한 필드에만 적용한다. 시간·namespace·상태 필터와 검색을 함께 적용한 결과로 표·차트·개수를 맞춘다. 표시·판정 출처: `상태 tone·namespace·name·UID·timestamp·불변 key`; 실패: 리소스 문제 우선·이력 최신순이 틀리거나 결손이 앞으로 오면 실패.
- 현재: `kit/components/data-table.js:98`는 sortable 머리에서 sortAction을 보내고 실제 비교는 호출자가 맡는다. `apps/wake/pages/resource-detail.js:531`은 상태 우선만, :651은 revision 내림차순만 지정해 모든 표의 동점 키를 보장하지 않는다.
- 차이: data-table은 sortAction만 발행한다. resource-detail의 상태/revision 정렬에는 모든 동점 키가 연결되지 않았다 → T-B-045.
- 고정 장치: 고정 없음 → T-B-045
- 출처: D-USR-2026-11-16-2; D00067, D00447, D00919

아래는 제품 표를 복제한 목록이 아니라 화면별 열 정의가 참조하는 공통 열 계약이다. 열 이름·원본 필드는 화면 영역에서 실제 값으로 채운다. 숨김 순위 1은 가장 먼저 숨김이며 필수 식별 열은 숨기지 않는다.

| 열 역할 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| 대상 이름 | 입력: metadata.name=api-worker, namespace=prod, UID=u1 → 기대: 종류: text; 원본: 화면의 metadata.name 또는 대상 이름 필드; 표시: 한 줄, 종류 아이콘, 식별자 합자 없음; 정렬: 이름 오름차순; 동점 namespace·UID; 톤: B-002, 상태를 이름색으로 추정 금지; 툴팁: B-047의 전체 이름; 좁은 폭: 필수 유지 → 실패: 대상 이름의 표시·정렬·숨김이 이 열 계약과 다르면 실패 | `kit/components/data-table.js:98`가 kind·표시를 소비 | 임의 cell 콜백의 링크·식별자는 T-B-045 | 고정 없음 → T-B-045 | D00447; D-USR-2026-11-16-2 |
| 상태 | 입력: status=CrashLoopBackOff, tone=danger → 기대: 종류: status; 원본: 해당 출처의 상태 필드; 표시: B-019 원문·아이콘; 정렬: 승인된 문제 등급 내림차순; 동점 이름·UID 오름차순; 톤: B-019; 툴팁: 원문 상태·필요 원인만 B-047; 좁은 폭: 문제 판단 필수면 유지, 그 밖은 화면 명시 → 실패: 상태의 표시·정렬·숨김이 이 열 계약과 다르면 실패 | `kit/components/status-icon.js:27`가 kind·표시를 소비 | 상태 enum의 순서는 화면별 확인 필요 | 고정 없음 → T-B-045 | D01008; D-USR-2026-11-16-2 |
| 수치 | → [RULE-WIDTH](rules.md#RULE-WIDTH). | `kit/components/data-table.js:119`가 kind·표시를 소비 | 단위가 붙은 문자열 정렬 여부 확인 필요 | 고정 없음 → T-B-045 | D-USR-2026-11-16-1; D-USR-2026-11-16-2 |
| 시각·Age | 입력: timestamp=2026-01-01T00:00:00Z, referenceAt=같은 날00:03:00Z → 기대: 종류: time; 원본: timestamp; Age=기준시각−timestamp; 표시: 연도 포함 절대시각 또는 경과; 정렬: 절대시각 내림차순(Age 오름차순); 동점 UID 오름차순; 톤: B-002; 오래됨 B-032; 툴팁: 절대시각·시간대; 좁은 폭: 시간 조사 필수면 유지 → 실패: 시각·Age의 표시·정렬·숨김이 이 열 계약과 다르면 실패 | `kit/components/data-table.js:94`가 kind·표시를 소비 | 표시 문자열과 원시 정렬 분리 필요 | 고정 없음 → T-B-045 | D00875; D-USR-2026-11-16-2 |
| ID·해시 | → [RULE-WIDTH](rules.md#RULE-WIDTH). | `kit/components/data-table.js:94`가 kind·표시를 소비 | mono legacy를 kind로 정리할 작업 | 고정 없음 → T-B-045 | D00447; D-USR-2026-11-16-2 |

### B-046 원본과 표시값의 일치

- 목표: 입력: 같은 이름의 서로 다른 UID와 동일 query의 서로 다른 from/to 응답을 대조한다 → 기대: 원본과 화면을 같은 cluster·namespace·UID·질의·단위·절대 from/to·step·집계·수집시각으로 대조한다. 같은 이름의 새 UID, 보관 기간 밖 값, 시간대 표시 차이를 구분한다. 표·차트·머리 값의 표본 범위가 다르면 같다고 판정하지 않는다. 실패한 읽기는 0이 아니며 숫자 변환·반올림의 근거를 화면 계약에 적는다. 표시·판정 출처: `cluster·namespace·UID·query·from/to·step·raw`. → 실패: 다른 UID·범위 값을 같은 관측으로 비교하거나 반올림 전 원값이 없으면 실패.
- 현재: `apps/wake/pages/cluster-home.js:70`의 series와 `apps/wake/data/kinds.js`의 값 변환, `kit/core/clock.js:6`의 시각 처리가 별도 경로다.
- 차이: cluster-home 시리즈와 kinds 리소스 변환은 별도 경로라 UID·from/to·step이 같은 입력인지 검사하는 공통 비교기가 없다 → T-B-046.
- 고정 장치: 고정 없음 → T-B-046
- 출처: D00009, D00066, D00451, D00830, D00831

<a id="B-047"></a>

### B-047 툴팁과 원문 접근

- 목표: 입력: 잘린 이름과 안 잘린 이름을 각각 hover·focus하고 아이콘 버튼을 focus한다 → 기대: 일반 텍스트는 실제 잘린 경우에만 전체 값을 hover와 키보드 focus로 보여준다. 아이콘 전용 버튼의 동작 이름, 차트의 값·시각·단위, 흐름 노드·출처 칩의 실제 상태·원인은 기능성 툴팁으로 허용한다. 설명용 메타 문구는 넣지 않는다. 같은 값을 두 툴팁으로 겹쳐 가리지 않으며 떠 있는 면·위치는 B-035를 따른다. 표시·판정 출처: `data-tip 값·scrollWidth/clientWidth·chart observation`. → 실패: 안 잘린 일반 값에 설명 툴팁이 뜨거나 잘린 이름을 키보드로 읽을 수 없으면 실패.
- 현재: `kit/components/tooltip.js:10`의 부품 정의, `data-table.js`, `flow-graph.js`와 `chart-card.js`에 서로 다른 툴팁 진입 경로가 있다.
- 차이: tooltip·data-table·flow-graph·chart-card의 진입 경로가 나뉜다. 같은 값에 두 툴팁이 겹치는 소비자 조합은 검사하지 않는다 → T-B-047.
- 고정 장치: 고정 없음 → T-B-047
- 출처: D00372, D00447, D00720, D00776, D00794

<a id="B-048"></a>

### B-048 크게 연 차트와 이벤트 판독

- 목표: 입력: 이벤트 선과11개 시리즈가 있는 차트를 크게 열고 +N의 마지막 시리즈를 끈다 → 기대: 크게 열 수 있는 차트의 버튼은 카드 안 오른쪽 위에 두고 hover·focus 때 보인다. 확대 면은 불투명하고 뒤 화면을 식별할 수 있는 배경은 남긴다. 제목·닫기 줄을 고정하고 화면을 넘는 내용은 확대 영역 안에서 스크롤한다. 확대 직후 값·범례가 보이며 다시 hover해야만 나타나지 않는다. +N 목록의 각 시리즈도 켜고 끌 수 있다. 이벤트 선은 시리즈와 구별되는 상태색 점선이며 이벤트 선 hover·focus는 그 이벤트의 값·시각·원인을 보여준다. 갱신 숫자 길이가 달라져도 머리 도구의 위치를 밀지 않는다. 작은 차트의 휠 확대 금지는 B-027, 상세의 불필요한 추가 깊이 금지는 B-042를 따른다. 표시·판정 출처: `chart-layer의 series·events·range·visibility`. → 실패: 확대 직후 값·범례가 없거나 시리즈 전환이 다른 선에 적용되면 실패.
- 추가 조건: 동일 구간을 미니/확대 상태로 표시하고 사용자 지정 기간 선택 → 넓어진 plot에는 겹치지 않는 범위에서 더 상세한 축 판독 정보를 제공하고 확대/닫기 버튼은 공통 컨트롤 역할 사용 → 넓은 상태도 축 정보가 그대로 성기거나 버튼 역할 반경이 불일치하면 실패.
- 추가 조건: 긴 확대 내용·좁은 카드 → 공통 scrollArea 표현과 --widget-expand-inset에 따른 버튼 안쪽 간격 유지 → 별도 스크롤 표현 또는 버튼이 둥근 경계에 닿으면 실패.
- 추가 조건: 긴 표/이벤트가 있는 큰 보기에서 끝까지 스크롤 → 상단 고정과 함께 본문/스크롤바 간 공통 간격 보존 → 마지막 셀이나 글자가 스크롤바에 맞닿거나 가려지면 실패.
- 추가 조건: 양 테마의 확대 차트에 시리즈·이벤트 선 입력 → 이벤트 선은 공통 이벤트선 두께 토큰으로 시리즈와 구별되면서 읽을 수 있게 표시 → 임의 hairline으로 거의 보이지 않거나 점선이 사라지면 실패. 공통 판정은 [CMP-CHART-02](components/charts.md#CMP-CHART-02)에 연결한다.
- 추가 조건: CPU 한도/범례가 있는 미니 카드를 확대·복귀 → 머리와 plot의 한 카드 관계를 유지하며 전환하고 중복 머리/남은 원위치 머리 없음 → 머리만 별도 떠 있거나 순간적으로 이중 표시되면 실패. 공통 판정은 [CMP-CHART-OVERLAY](components/charts.md#CMP-CHART-OVERLAY)에 연결한다.
- 현재: `kit/components/chart-layer.js:93`가 확대 층을, `chart-card.js`가 범례·이벤트·축을 구성한다. 현재 native 확대/복귀 검수는 없다.
- 차이: chart-layer에는 시리즈별 표와 스위치가 있다. 확대 직후 hover 없이 범례가 읽히는 첫 프레임은 현재 시험에서 판정하지 않는다 → T-B-048.
- 고정 장치: 고정 없음 → T-B-048
- 출처: D00579, D00580, D00582, D00583, D00584, D00585, D00586, D00587, D00588, D00589, D00590, D00591, D00592, D00593, D00594, D00595, D00605, D00817; D00603

<a id="B-049"></a>

### B-049 보고서 내용의 문서 변환

- 목표: 입력: open·resolved·사건 없음 자료로 보고서를 만들고 편집 후 PDF·Markdown을 내보낸다 → 기대: 열린 인시던트는 상황 공유, 해결된 인시던트는 사후 분석, 인시던트 없는 점검은 점검 보고서 구조를 사용한다. 상황 공유는 지금 상황 → 영향 → 원인 가설·근거 → 진행 기록 → 부록, 사후 분석은 요약 → 영향 → 타임라인 → 원인·근거 → 감지 → 대응·복구 확인 → 잘된 점·아쉬운 점 → 담당·기한 있는 후속 조치 → 부록이다. 점검은 요약 → 클러스터 상태 → 활성 알림 → Warning 이벤트 → 문제 Pod다. 없는 담당·근본 원인·복구 결과를 만들지 않으며 미확인은 이유와 구별한다. 아래 변환으로 화면·PDF·Markdown이 같은 대상·값·순서를 유지한다. 머리에는 심각도·상태·서비스·감지·당번·작성의 한 줄 값만 두고 자료·마스킹·작성 모델은 부록에 둔다. 채널용 요약은 5~8줄이며 단계에 맞는 영향·원인·결정·다음 단계·다음 공유·링크를 포함한다. 상황 공유의 다음 공유 간격은 기존 규칙의 critical 30분·그 밖 60분을 표시한다. 표시·판정 출처: `incidentReport의 stage·impact·evidence·timeline·recovery`. → 실패: 보고서 단계가 틀리거나 원본에 없는 담당·원인·복구값이 추가되면 실패.
- 현재: `apps/wake/pages/incident-report-doc.js:25`가 단계별 문서, `kit/components/report-canvas.js:189`와 `kit/core/report.js`가 화면·인쇄·Markdown을 구성한다.
- 차이: 단계별 문서는 생성하지만 편집 후 channel은 초기 doc.channel을 복사한다. 화면의 편집 결과와 채널 출력이 달라질 수 있다(apps/wake/pages/incident-report.js:88–90) → T-B-049.
- 고정 장치: 고정 없음 → T-B-049
- 출처: D00942, D00948, D00949; 옛 화면 규칙 보고서 절. 짧은 인용은 결정 연결 표에 있다.

| 화면 자료 | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| 차트 | 입력: incidentReport의 차트 블록을 화면·PDF·Markdown으로 출력한다 → 기대: 문서에는 정적 공통 차트, 제목·단위·기간·범례·관측값·출처 캡션; Markdown에는 같은 관측값과 기간·출처, 상호작용 장식 없음 → 실패: 차트의 값·원본 근거·순서가 출력 사이에 달라지면 실패 | B-049 현재 | B-049 차이 | 고정 없음 → T-B-049 | D00942, D00948, D00949 |
| 리소스 표 | 입력: incidentReport의 리소스 표 블록을 화면·PDF·Markdown으로 출력한다 → 기대: 문서에는 필요한 열과 근거 행, 의미 있는 원문 머리글; Markdown에는 같은 열·값의 표 → 실패: 리소스 표의 값·원본 근거·순서가 출력 사이에 달라지면 실패 | B-049 현재 | B-049 차이 | 고정 없음 → T-B-049 | D00942, D00948, D00949 |
| 로그 | 입력: incidentReport의 로그 블록을 화면·PDF·Markdown으로 출력한다 → 기대: 문서에는 줄 번호·시각·수준·본문, 근거 줄 강조, 생략 줄 수, 찾은/전체/마지막 줄·근거와 출처·질의; Markdown에는 줄 번호·근거 표시·생략 줄을 보존한 코드 블록 → 실패: 로그의 값·원본 근거·순서가 출력 사이에 달라지면 실패 | B-049 현재 | B-049 차이 | 고정 없음 → T-B-049 | D00942, D00948, D00949 |
| 이벤트 | 입력: incidentReport의 이벤트 블록을 화면·PDF·Markdown으로 출력한다 → 기대: 문서에는 Last Seen·Type·Reason·Object·Count·Message, Warning과 근거 행; Markdown에는 같은 표 → 실패: 이벤트의 값·원본 근거·순서가 출력 사이에 달라지면 실패 | B-049 현재 | B-049 차이 | 고정 없음 → T-B-049 | D00942, D00948, D00949 |
| 지표 요약 | 입력: incidentReport의 지표 요약 블록을 화면·PDF·Markdown으로 출력한다 → 기대: 문서에는 이름·값의 두 칸; Markdown에는 두 칸 표 → 실패: 지표 요약의 값·원본 근거·순서가 출력 사이에 달라지면 실패 | B-049 현재 | B-049 차이 | 고정 없음 → T-B-049 | D00942, D00948, D00949 |
| 해석 | 입력: incidentReport의 해석 블록을 화면·PDF·Markdown으로 출력한다 → 기대: 문서에는 관측·해석·기준·확인 방법·확인 안 됨·판정과 문장별 근거 번호; Markdown에는 이름별 목록과 근거 번호 → 실패: 해석의 값·원본 근거·순서가 출력 사이에 달라지면 실패 | B-049 현재 | B-049 차이 | 고정 없음 → T-B-049 | D00942, D00948, D00949 |
| 조치 기록 | 입력: incidentReport의 조치 기록 블록을 화면·PDF·Markdown으로 출력한다 → 기대: 문서에는 시각·출처·내용 타임라인, 승인·실패·복구 행 구별; Markdown에는 같은 값의 표 → 실패: 조치 기록의 값·원본 근거·순서가 출력 사이에 달라지면 실패 | B-049 현재 | B-049 차이 | 고정 없음 → T-B-049 | D00942, D00948, D00949 |

문서 시각의 예외는 → [RULE-TIME](rules.md#RULE-TIME). 왼쪽 장식 띠·인용 상자·조각 사이 설명을 넣지 않는다. 복구는 서비스 복구 확인·증상 회복·수동 종료를 데이터의 복구 종류대로 구별한다.

## 결정 반영과 기본값

| 쟁점 | 이전 지시 또는 문서 | 최종 적용 | 판정 근거 |
|---|---|---|---|
| 숫자 정렬 | D00454를 D-USR-2026-11-16-1로 대체 | [RULE-SORT](rules.md#RULE-SORT) 적용 | B-016 |
| 상태와 숫자 | 숫자 옆 경고 아이콘, Ready와 상태 혼합 | number는 숫자와 tone만, status 별도 열 | D01033–34, B-016/018 |
| 구역 탭 | 07:00 가로 스크롤 허용 | 14:02 더보기, 선택 탭 유지, 스크롤·끝 흐림 금지 | D01029, B-022 |
| 설정 모양 | 03:56 본문 톤 적용 | 04:15 기준 구조·비율, 07:00 확정, 14:19 경계선 | D01020/028/035/036, B-009 |
| 동심 반경 | 과거의 무조건 안쪽 반경 축소 | → [RULE-PANE](rules.md#RULE-PANE) | B-004 |
| 카드 중첩 | 모든 안쪽 면 제거 | .sg-card는 면·반경 허용, border 없음 | polish 04:50, B-005 |
| 칸 열기 | 왼쪽 overlay/폭 0→증가 | 최종 폭 선배치·내용만 진입·빈 카드0 | D01022, B-007/013 |
| 자동 펼침 | 과거 늦은 응답 자동 펼침 | → [RULE-FOLD](rules.md#RULE-FOLD) | D01021, B-015 |
| 도구 줄 둘째 줄 | 오른쪽 묶음을 다음 줄 왼쪽 | 다음 줄 오른쪽, 가로6/세로8 | polish14:4x, B-023 |
| YAML 머리 | 이름/Revision 중심 | resourceVersion; 현재 추가 Revision의 중복은 미해결 | polish14:55, B-014/025 |
| 꺾쇠 바탕 | 머리 전체 hover 때 바탕 | 꺾쇠 자체 hover/focus에만 바탕 | D01038–42+polish14:55, B-014 |
| 설정의 죽은 기능 | tone 검토의 삭제 권고 | 기능 구현(T2), 삭제 완료로 처리 금지 | D00993, B-010 |
| 빈 값 | 대시/N/A 제안 | 빈 셀; 미연결은 출처 상태 별도 | 옛 화면 규칙 B-018/034 |
| 진행 표시 | 공통 progress 사용 | 요약·표 사용량/요청/한도 막대 제거; 실제 진행 의미는 유지 | D00951/053, B-018 |
| 보고서 선택 | checkbox 선택 | 드래그 선택 | D00943, B-039 |
| 로고 장식 | 흰 원·겹친 아이콘 제안 | → [RULE-CHIPS](rules.md#RULE-CHIPS) | D00803/009, B-021 |
| 그래프 | 모든 variant에 세로 막대 규칙 | 승인된 타일형과 막대형 계약 분리 | D00862와 승인 메모, B-031 |
| 검색 통일 | 1차가 과거 요청을 이번 사용자 요청으로 기재 | 옛 결정 문서의 2026-11-14 승인 위치·kit 입력 유지 | B-024 |
| 메타 문구 금지 | 내부 설명 제거 | 실제 오류·권한·부분 실패·오래됨은 반드시 표시 | 정직한 상태 원칙, B-032/037 |
| 구조 정리 | 시험만 통과하면 완료 | 실제 전후 모습·동작 유지 필요 | D00008/009, B-041 |

P-B-001~004는 decisions.md의 확정 결정과 기본값 채택에 대응한다. 그림만 가리킨 지시는 원본 그림 없이 새 픽셀 값의 승인 근거로 삼지 않는다. 작업자 해석은 사용자의 명시 선택과 구별한다.
