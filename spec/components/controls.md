# 검색·탭·도구 줄·설정·메뉴

부품의 7상태는 table-contract.md CMP-TABLE-02의 읽기 의미를 따른다. 버튼의 disabled는 빈 응답과 다르며 이유를 tooltip/설명으로 제공한다. 모든 action은 실제 등록된 동작을 호출해야 한다.

<a id="cmp-ctrl-search"></a>

## CMP-CTRL-SEARCH — 검색 칸과 필터 칩

- 목표: searchInput.value에 한글을 조합 입력하고 namespace 메뉴에서 전체 해제 후 하나를 선택한다 → 검색 입력은 실제 결과 집합을 거르고 Enter·지우기·Escape 후 초점을 보존한다. namespace 다중 선택은 전체·없음·선택 집합을 구별하고 체크박스·전체 선택·전체 해제·메뉴 검색·제한 높이 스크롤을 제공한다. 검색 범위는 각 표 계약에서 정한다. 폼 반경은 D01005의 공통 알약 토큰을 쓴다. → 조합 중간 값으로 필터를 실행하거나 빈 선택을 전체로 바꾸거나 Escape 뒤 초점을 잃으면 실패.
- 현재: searchInput은 data-input을 전달하고 multiPick은 전체 선택을 null,전체 해제를 빈 배열로 돌려준다(`kit/components/search-input.js:19`; `apps/wake/pages/view-parts.js:24`).
- 차이: 없음(확인: kit/components/search-input.js:19–31; apps/wake/pages/view-parts.js:24–35)
- 고정 장치: `kit/components/list-toolbar.test.mjs` — `slots stand in one order whatever order they are given in, left then right` (슬롯 순서). 검색 모양 통일은 H-011의 승인 대기이며 별도 고정 없음.
- 출처: D00819, D00874, D00930, D00995, D00996
- 점검 항목: namespace 0개·1개·복수, 긴 이름·한글·공백 검색을 확인한다. 선택 없음과 전체를 혼동하면 실패다.

<a id="cmp-ctrl-tabs"></a>

<a id="CMP-CTRL-TABS"></a>

## CMP-CTRL-TABS — 탭과 더보기

- 목표: spaced=true인 pillTabs에서 마지막 탭을 선택하고 폭을 줄였다 늘린다 → pillTabs 입력 id/tabs/value/action, 각 tab id,label,icon,count,badge,disabled,tip. 구역 탭은 spaced=true의 pills-fold로 렌더한다. 가로 스크롤·fade 금지. 폭을 재서 뒤쪽 항목을 더보기로 이동하되 현재 선택은 반드시 남긴다. 다시 펼침에는 12px 여유를 둬 경계 깜박임을 막는다. 메뉴 항목은 원래 action/arg를 그대로 호출한다. → 선택 탭이 더보기 안에 숨거나 가로 스크롤이 생기거나 메뉴 action의 arg가 달라지면 실패.
- 추가 조건: 입력 동일 데이터·동작을 가진 탭 둘과 독립 기능 탭을 렌더 → 기대 중복 기능은 하나로 합치고 필수 탭·아이콘·선택/복귀를 유지 → 실패 동일 기능 탭이 둘 이상이거나 병합으로 정보/동작 소실.
- 추가 조건: 입력 컨테이너 둘의 서로 다른 사용량·상태·포트·requests/limits와 표본 0을 가진 Pod 및 다른 종류 상세 → 기대 요약에서 컨테이너별 지표/필드에 접근하고 동일 정보 탭을 병합; 표본 0은 빈 차트 → 실패 Pod 합계로 컨테이너 차이를 숨김, 필드/그래프 누락 또는 중복 탭 잔존. 공통 판정은 [SCR-RESOURCE-ORDER](../screens/resource-summary.md#SCR-RESOURCE-ORDER)에 연결한다.
- 추가 조건: 입력 관련 실제 출처가 있는 CPU·Memory·Network·Filesystem 화면과 표본 0 → 기대 요구한 지표 항목에 접근 가능하고 동일 차트 틀·기존 공통 탭을 사용 → 실패 등록만 있고 UI에서 접근 불가 또는 탭 외곽선의 페이지별 예외. 공통 판정은 [SCR-METRICS-G01](../screens/metrics.md#SCR-METRICS-G01)에 연결한다.
- 추가 조건: 입력 Logs를 선택한 상세와 다른 탭을 렌더 → 기대 현재 탭을 반복하는 제목 제거 및 기존 공통 탭 모습 유지 → 실패 같은 역할 Logs 제목 중복 또는 페이지별 탭 스타일 예외.
- 추가 조건: 입력 긴 이름의 정상 컨테이너와 같은 데이터를 가진 요약/독립 탭 → 기대 정상 체크는 이름 옆, 중복 정보는 한곳으로 통합 → 실패 필드가 존재한다는 이유로 상태 위치 오류나 중복 탭을 허용. 공통 판정은 [CMP-T-RESOURCE-DETAIL-01](tables/resource-detail.md#CMP-T-RESOURCE-DETAIL-01)에 연결한다.
- 추가 조건: 연결한 클러스터의 구역 탐색을 넓은/좁은 폭에서 열기 → GitOps가 직접 탭 또는 더보기에서 같은 클러스터 구역으로 접근 가능 → GitOps 탐색 항목 누락이나 다른 클러스터로 이동하면 실패.
- 추가 조건: 몇 개의 짧은 종류 탭을 넓은 영역에서 렌더 → 승인된 탭 내용 폭과 공통 간격 유지, 마지막 탭 뒤의 빈 폭으로 탭을 늘리지 않음 → 불필요한 균등 확장으로 전체 폭을 채우면 실패.
- 현재: pillTabs는 spaced일 때 pills-fold로 감싸고 폭 측정에서 선택 탭을 keep에 남긴다(`kit/components/pill-tabs.js:40–68`).
- 차이: spaced가 없는 호출은 더보기 접힘을 적용하지 않는다. 화면 구역 탭은 spaced=true로 전달해야 한다.
- 고정 장치: 고정 없음 → TASK-CMP-CTRL-TABS
- 출처: D01029, D01005; D00272; D00276; D00345; D00360; D00450; D00805; D00820
- 점검 항목: 창 폭과 번역 길이·폰트 로드를 바꿔도 선택 탭을 보여야 한다. 더보기의 숨긴 탭은 모두 키보드로 선택할 수 있어야 한다.

<a id="cmp-ctrl-toolbar"></a>

<a id="CMP-CTRL-TOOLBAR"></a>

## CMP-CTRL-TOOLBAR — 도구 줄

- 목표: listToolbar에 scope,search,filters,time,view를 넣고 760px 영역으로 줄인다 → listToolbar의 scope/search/filters/time/view 슬롯을 사용한다. 인접 컨트롤 간격은 공통 토큰에서만 가져온다. 좁아지면 역할 단위로 줄바꿈하되 컨트롤끼리 붙거나 본문을 가리지 않는다. pager는 표 카드 안에 둔다. 현재 값을 비운 화살표만 있는 select 금지. → 시간이 검색 앞에 오거나 컨트롤이 겹치거나 현재 값 없이 화살표만 보이면 실패.
- 추가 조건: 같은 폭의 관련 페이지에 범위·검색·필터·시간을 모두 표시 → 왼쪽 범위/검색/필터, 오른쪽 공통 시간/보기 → 화면마다 순서나 프리셋 집합이 달라지면 실패.
- 현재: SLOTS.start는 scope/search/filters,SLOTS.end는 time/view이고 render가 비어 있는 슬롯을 생략한다(`kit/components/list-toolbar.js:32–40`).
- 차이: 기존 동작은 위 코드 위치를 따른다. 추가한 결정 조건의 구현·렌더 대조가 남아 있다.
- 고정 장치: `kit/components/list-toolbar.test.mjs` — `slots stand in one order whatever order they are given in, left then right`; 추가 조건 고정 없음
- 출처: D00825, D00826, D01043; D00828
- 점검 항목: 다크·라이트의 1280/1680 창과 760 상세에서 간격을 확인한다. 컨트롤 겹침·값 없는 화살표·중복 margin은 실패다.

<a id="cmp-ctrl-settings"></a>

## CMP-CTRL-SETTINGS — 설정 행과 경계

- 목표: 설정 행의 control을 바꾸고 앱을 다시 열며 사이드바를 접고 편다 → settingsRow는 lead/title/description/control/extra/stack/body/action을 받는다. 행 끝 주 컨트롤은 하나, 설명과 상태를 중복하지 않는다. 최소 높이·여백·폰트는 --srow-*와 --text-*를 사용한다. 설정 목록은 창 바탕에 두고 앱 사이드바와 사이에 전체 높이 --line/--border 경계와 --window-gap을 둔다. 사이드바 접힘에는 경계 없음. 본문 카드 네 변·모서리는 끊김 없음. 효과 없는 알림·namespace·보관기간 설정을 작동하는 값처럼 표시하지 않는다. → 행 끝에 주 컨트롤이 둘 생기거나 저장 값의 효과가 없거나 본문 카드 경계가 끊기면 실패.
- 현재: settingsRow는 control 영역을 하나 만들고 열린 body만 inert를 해제한다(`kit/components/settings-row.js:47–64`).
- 차이: 부품은 저장·보관 TTL을 실행하지 않는다. 설정 값의 실제 효과는 설정 서비스와 소비 기능이 연결돼야 한다.
- 고정 장치: 고정 없음 → TASK-CMP-CTRL-SETTINGS
- 출처: D01015, D01020, D01028, D01036
- 점검 항목: 각 설정 변경의 실제 효과와 재시작 후 값을 확인한다. 행 끝 주 컨트롤은 하나이며 설정 이중 틀과 끊긴 경계를 허용하지 않는다.

<a id="cmp-ctrl-menu"></a>

## CMP-CTRL-MENU — 메뉴·팝오버·팔레트·다이얼로그

- 목표: 화면 우하단 트리거에서 메뉴를 열어 방향키·Enter·Escape와 바깥 클릭을 사용한다 → 등록된 action·대상만 보여주고 anchor와 viewport 안에 배치한다. 방향키·Enter·Escape, 외부 클릭, 닫힌 뒤 트리거 초점 복귀를 지원한다. 팝오버는 차트/모달 아래 숨지 않고 +N 목록은 가로 문자열이 아닌 세로 목록. 다이얼로그는 사용자의 실제 입력·승인 선택이 필요할 때만, 진행·완료는 인라인/토스트. 모달 밖 포커스 이동을 막고 dismiss가 승인을 뜻하지 않는다. → 항목이 viewport 밖에 잘리거나 취소가 승인으로 처리되거나 트리거로 초점이 돌아오지 않으면 실패.
- 현재: contextMenu.attach는 대상 arg로 메뉴를 만들고 선택한 action만 emit한다(`kit/components/context-menu.js:32–51`).
- 차이: 없음(확인: kit/components/context-menu.js:32–51)
- 고정 장치: 고정 없음 → TASK-CMP-CTRL-MENU
- 출처: D00025, D00078, D00614, D00609
- 점검 항목: viewport 네 모서리·짧은 높이·확대 상태에서 메뉴를 연다. 잘림 없이 선택하고 Escape 뒤 초점이 복귀하며 취소 시 쓰기가 없어야 한다.

<a id="cmp-ctrl-toast"></a>

## CMP-CTRL-TOAST — 토스트

- 목표: 동일 id의 critical 알림을 발생·갱신·해결시키고 본문 사각형을 비교한다 → A안 두 줄을 사용하고 진행 막대를 두지 않는다. critical은 사용자가 확인할 때까지 남기고 해결은 같은 항목을 갱신한다. 외곽선은 1px이며 본문을 밀지 않는 overlay로 표시한다. 같은 신호의 중복 알림을 새 토스트로 늘리지 않는다. 사용자가 누르면 정확한 대상·인시던트로 이동한다. → 토스트가 둘로 늘거나 critical이 자동 소실되거나 본문 위치가 움직이면 실패.
- 현재: toast.render는 data-id와 제목·본문 두 줄을 출력하고 desktop host가 별도 창을 관리한다(`kit/components/toast.js:30–32`; `kit/desktop/main.cjs`).
- 차이: 공통 render에는 critical 유지·동일 신호 중복 제거 로직이 없다. 호스트의 토스트 수명 관리와 결합해야 한다.
- 고정 장치: 고정 없음 → TASK-CMP-CTRL-TOAST
- 출처: D00914, D00915, D00950, D00957
- 점검 항목: 동일 id의 발생·갱신·해결은 토스트 하나를 유지한다. critical 자동 소실과 표시 전후 본문 기하 변화는 실패다.

<a id="cmp-ctrl-sidebar"></a>

## CMP-CTRL-SIDEBAR — 사이드바 줄

- 목표: → [RULE-SIDEBAR](../rules.md#RULE-SIDEBAR). 인시던트를 일반 열린 탭과 섞지 않는다. 각 줄은 대상ID·아이콘·이름·현재 선택·메뉴 동작을 가지며 상태 아이콘은 원본 상태와 같다. 남은 hover는 창 leave에 지우고 선택 상태는 유지한다. 길어도 이름 전체는 툴팁/접근 가능한 이름으로 읽을 수 있어야 한다; 열린 인시던트가 대화 뒤로 가거나 열린 탭과 섞이거나 창 밖 이동이 선택까지 지우면 실패.
- 현재: app.config의 구역 정의는 cluster/bookmarks 뒤 incident·conversation과 열린 탭을 구성한다(`apps/wake/app.config.js:922–936`).
- 차이: 없음(확인: apps/wake/app.config.js:922–936)
- 고정 장치: 고정 없음 → TASK-CMP-CTRL-SIDEBAR
- 출처: D00990, D01008, D01041
- 점검 항목: 네 구역 순서·선택·키보드·창 leave·긴 이름을 확인한다. 다른 대상이 열리면 실패다.

<a id="cmp-ctrl-empty"></a>

## CMP-CTRL-EMPTY — 빈 상태와 뼈대

- 목표: → [RULE-STATE](../rules.md#RULE-STATE); [RULE-SKELETON](../rules.md#RULE-SKELETON).
- 현재: skeletonTable은 label·width·optional을 전달하지만 kind·fit은 전달하지 않고 성공 빈 목록은 emptyState로 반환한다(`apps/wake/pages/view-parts.js:81–82`; `apps/wake/pages/resource-list.js:145`).
- 차이: 뼈대와 완료 표의 열 의미·맞춤 폭이 달라지고 성공 빈 상태에서 실제 열 머리가 사라진다.
- 고정 장치: 고정 없음 → TASK-CMP-CTRL-EMPTY
- 출처: D01027, D01031, D01032
- 점검 항목: 500ms 지연·실패·회복에서 첫 그림 틀을 유지한다. 실패를 0건으로 표시하지 않고 skeletonTable과 완료 표의 열 폭을 비교한다.

## 세부 동작 계약

| 규칙 ID | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="CMP-CTRL-TOKENS"></a><a id="cmp-ctrl-tokens"></a>CMP-CTRL-TOKENS 반경·글자·간격 | 1. 같은 역할의 입력 두 개를 다크와 라이트에서 펼치고 접는다 → 같은 역할의 입력·탭·선택·카드는 같은 토큰으로 그린다. 열림·닫힘·폭·테마 변화가 반경과 글자 크기를 바꾸지 않는다. 제목·탭·표는 승인된 작은 글자 크기를 유지하고 인접 탭과 필드의 여백을 보존한다. → 상태 전환만으로 반경·글자 크기가 달라지면 실패.<br>2. 입력 메인 도구와 상세의 같은 역할 하이라이트를 다크/라이트로 비교 → 기대 메인 edge 역할 토큰을 공통 사용 → 실패 별도 색 상수/다른 토큰으로 면마다 하이라이트가 달라짐.<br>3. 입력 홈·목록·상세에서 같은 역할 UI의 테마/폭/상태 전환을 비교 → 기대 공통 역할·모션·문구 기준을 전 화면에 적용하고 필요한 정보 유지 → 실패 정보가 있다는 이유로 화면별 디자인/모션 예외를 통과. 공통 판정은 [B-001](../design.md#B-001)에 연결한다.<br>4. 입력 같은 역할 부품을 전 화면에서 동일 입력/상태 전환으로 비교 → 기대 공통 시각/모션 기준을 같은 방식으로 적용 → 실패 데이터가 맞는다는 이유로 화면별 표현 예외 허용. 공통 판정은 [B-001](../design.md#B-001)에 연결한다.<br>5. 입력 U00383 이미지 #5의 대상 입력과 승인된 동일 역할 폼을 식별 → 기대 2단계 작업의 공통 입력 기준과 같은 정렬·크기·상태 표현 → 실패 연결 동작 정상만으로 폼 불일치 해결 처리. 같은 역할의 권한/다른 화면 이동이 있는 행 여러 개 → 기존 공통 행 끝 슬롯·동작 문법 유지 → 한 화면만 중간에 별도 버튼을 만들면 실패.<br>6. 다크·라이트에서 해당 UI 외곽선을 접힘/펼침으로 표시 → 승인된 경계색 역할 토큰 사용, 시리즈 보라색으로 대체하지 않음 → 보라색 계열 토큰이나 임의 강조색이 경계에 적용되면 실패. | listToolbar가 슬롯마다 같은 공통 클래스와 CSS 토큰을 사용한다(`kit/components/list-toolbar.js:35`) | 추가 대조: D00365: 별도 색 상수/다른 토큰으로 면마다 하이라이트가 달라짐; D00516: 연결 동작 정상만으로 폼 불일치 해결 처리; D00726: 한 화면만 중간에 별도 버튼을 만들면 실패; D00801: 보라색 계열 토큰이나 임의 강조색이 경계에 적용되면 실패. | 고정 없음 → TASK-CMP-CTRL-TOKENS | D00207, D00209, D00339, D00447, D00481, D00496, D00748, D00768, D00819, D00870, D01005, D01014, D01043; D00365; D00467; D00474; D00516; D00726; D00801 |
| <a id="CMP-CTRL-ICON"></a><a id="cmp-ctrl-icon"></a>CMP-CTRL-ICON 아이콘 의미와 색 | 1. statusIcon에 ok는 label,warn/error는 text를 주고 공급자 아이콘을 나란히 둔다 → 대상 종류·공급자·상태의 아이콘을 구분한다; [RULE-TONE](../rules.md#RULE-TONE). 공급자 로고 전체에 흰 원을 덧대지 않고 로고 내부 불투명 영역만 유지한다. 링크된 이름과 아이콘은 같은 실제 대상을 연다; 정상 글자를 색 불일치로 판정하거나 경고·오류 글자색이 아이콘과 다르면 실패. 2. 같은 GitOps의 요약 바와 이벤트 행 → 요약은 실제 공급자 로고, 이벤트 기록은 로고 제거 후 이름/링크로 출처 보존 → 이벤트 행에 Argo 공급자 로고가 남으면 실패. 공통 판정은 [B-044](../design.md#B-044)에 연결한다. | render는 label과 text를 구분하며 warn/error 글자는 아이콘과 같은 content 토큰이다(`kit/components/status-icon.js:51`) | 없음(확인: kit/components/status-icon.js:51) | 고정 없음 → TASK-CMP-CTRL-ICON | D00326, D00329, D00355, D00367, D00381, D00682, D00683, D00788, D00789, D00790, D00803, D01008 |
| <a id="CMP-CTRL-TERMS"></a><a id="cmp-ctrl-terms"></a>CMP-CTRL-TERMS 문구와 원어 | 1. Pod Ready와 한국어 인시던트 화면을 열고 원문 YAML도 연다 → Kubernetes 필드·상태·도구 고유 용어는 원문을 쓴다. Wake 개념은 glossary의 한국어/영어 한 쌍을 쓴다. 검색 동사는 검색으로 통일하고 값·실제 행동·출처와 관계없는 안내 문장을 추가하지 않는다. 로그·YAML 원문은 번역하지 않는다. → Pod를 파드로 바꾸거나 로그 원문을 번역하면 실패.<br>2. 입력 실제 정보·행동을 제공하는 화면에 설명용 장식 패널 추가 → 기대 판단 정보나 실제 행동 없이 설명만을 위한 패널을 두지 않음 → 실패 실제 데이터라는 이유만으로 무용한 설명 UI를 허용.<br>3. 입력 메모리 차트 제목과 지적된 번역투 UI 문자열 → 기대 UI 제목 “메모리 추세”를 제거하고 같은 지표의 승인된 Memory 라벨 사용 → 실패 locale 등록만을 이유로 지적된 문구를 허용.<br>4. 입력 A00199에서 지목한 리소스 종류 선택의 전체 옵션 → 기대 종류 선택의 “모든 종류”를 제거하고 용어집의 전체 선택 라벨을 사용 → 실패 같은 잘못된 표현을 locale 경유라는 이유로 통과. 연결 자료가 있는 홈 지표 → 승인된 아이콘·범례와 같은 데이터/기간 상세 진입, 두 지적 UI 문구 제거 → 범례 아이콘/상세 이동이 없거나 두 문구가 UI 메타로 남으면 실패. 데이터 원문은 교정하지 않음. 공통 판정은 [SCR-HOME-CHART-ENTRY](../screens/home.md#SCR-HOME-CHART-ENTRY)에 연결한다.<br>5. 송수신 대상 요약을 한국어로 표시 → 해당 개념의 승인된 glossary 라벨 사용, '많이 주고 받는 곳' 없음 → 금지된 데모성 UI 제목이 locale에 남거나 렌더되면 실패; 원본 데이터 문자열은 제외. | check-locale는 용어집 avoid 낱말과 화면 문자열을 검사한다(`kit/tools/check-locale.mjs:62–92`) | 추가 대조: D00143: 실제 데이터라는 이유만으로 무용한 설명 UI를 허용; D00335: locale 등록만을 이유로 지적된 문구를 허용; D00364: 같은 잘못된 표현을 locale 경유라는 이유로 통과; D00929: 금지된 데모성 UI 제목이 locale에 남거나 렌더되면 실패; 원본 데이터 문자열은 제외. | 고정 없음 → TASK-CMP-CTRL-TERMS | D00032, D00199, D00277, D00282, D00335, D00344, D00346, D00347, D00364, D00389, D00396, D00929, D00995; D00143; D00776 |
| <a id="cmp-ctrl-scroll"></a>CMP-CTRL-SCROLL 끝 행과 선택 접근 | scrollArea에 화면 높이보다 긴 항목을 넣고 마지막 줄로 이동한다 → 콘텐츠가 세로 범위를 넘으면 해당 스크롤 영역에서 마지막 항목까지 도달한다. 오버레이·코드·팝업의 독립 스크롤 소유자를 유지하고 전체 화면에 불필요한 가로 스크롤을 만들지 않는다. 창 밖으로 나가면 hover만 지우고 선택은 유지한다. → 마지막 줄이 둥근 모서리에 가려지거나 페이지 전체 가로 스크롤이 생기면 실패. | attach는 data-scroll 영역의 스크롤 막대를 연결한다(`kit/components/scroll-area.js:40`) | 없음(확인: kit/components/scroll-area.js:40) | 고정 없음 → TASK-CMP-CTRL-SCROLL | D00188, D00211, D00349, D00644, D01030, D01041 |

| 규칙 ID | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="cmp-ctrl-frame"></a>CMP-CTRL-FRAME | 창 투명 옵션을 켠 상태에서 상세와 AI를 함께 연다 → 중앙 본문은 투명 옵션과 무관하게 불투명하다. 본문·상세·AI는 최대 세 칸이며 AI가 마지막이다. 상세는 승인된 왼쪽 진입을 유지하고 같은 종류의 정본 상세를 여러 진입점에서 재사용한다. → 중앙 본문 뒤가 비치거나 AI가 마지막 칸이 아니거나 네 번째 칸이 생기면 실패. | createPanelEngine이 상세와 AI의 열린 상태 및 선택을 소유한다(`kit/shell/panel-engine.js:41`) | 없음(확인: kit/shell/panel-engine.js:41) | 고정 없음 → TASK-CMP-CTRL-FRAME | D00119, D00176, D00226, D00228, D00234, D00241, D00243, D00376, D00425, D00446, D00651, D00866, D01010, D01011 |
| <a id="CMP-CTRL-REUSE"></a><a id="cmp-ctrl-reuse"></a>CMP-CTRL-REUSE | 1. 두 목록 화면을 같은 부품 정의로 렌더하고 서비스 연결을 끊는다 → 같은 역할의 부품은 공통 kit 정의를 재사용한다. 공급자별 데이터 차이는 앱 정의가 맡고 승인된 화면 모양을 구조 정리 과정에서 바꾸지 않는다. 견본 자료는 앱 밖 시뮬레이션에만 두며 실제 화면을 채우는 대체 데이터로 쓰지 않는다. → 한 목록만 자체 스타일로 바뀌거나 실제 값 자리에 견본 수치가 나타나면 실패.<br>2. 입력 동일 역할 화면 둘을 변경하고 토큰 값을 바꿈 → 기대 모든 소비 화면이 같은 공통 정의를 사용 → 실패 페이지별 상수/CSS 복제로 일부 화면만 달라짐. | skeletonTable은 dataTable에 실제 열 이름과 공통 skeleton을 전달한다(`apps/wake/pages/view-parts.js:81`) | 추가 대조: D00299: 페이지별 상수/CSS 복제로 일부 화면만 달라짐. | 고정 없음 → TASK-CMP-CTRL-REUSE | D00057, D00143, D00174, D00268, D00306, D00462, D00469, D00527, D00608, D00692, D00699, D00715, D00725, D00863; D00299 |
| <a id="CMP-CTRL-TIME"></a><a id="cmp-ctrl-time"></a>CMP-CTRL-TIME | → [RULE-RANGE](../rules.md#RULE-RANGE) | render는 presets와 사용자 지정 기간 컨트롤을 같은 시간 선택기에 둔다(`kit/components/time-range.js:154`) | 추가 대조: D00615: 선택 표시만 바뀌거나 이전 구간 자료를 새 선택값으로 보이면 실패; D00806: 어느 과거 조회 화면이 프리셋만 제공하거나 선택 구간이 요청에서 사라지면 실패; D00826: 한 화면만 선택지를 임의 교체/누락하면 실패.  공통 기본 프리셋은 [RULE-RANGE](../rules.md#RULE-RANGE)와 일치한다. resource-detail.js:28의 DETAIL_PRESETS는 7d가 빠져 공통 계약과 다르며 승인 예외가 아니다. | `kit/components/time-range.test.mjs` — `the reference zone reads as its offset and its name`; 추가 조건 고정 없음 | D00611, D00614, D00710, D00826; D00615; D00806; D00828; D00926 |

<a id="CMP-CTRL-SHORTCUT-VISUAL"></a>


## CMP-CTRL-SHORTCUT-VISUAL

- 목표: 단축키 힌트가 있는 허용 화면을 양 플랫폼에서 표시 → 공통 kbd/shortcut 표시와 플랫폼 기호 사용 → 페이지 전용 키 상자·서로 다른 역할 반경/글꼴이면 실패.
- 현재: 앱 동작과 단축키 정의를 앱 설정에서 공급한다.(`apps/wake/app.config.js:1`)
- 차이: 플랫폼별 기호와 공통 kbd의 계산 스타일 일치를 검증해야 한다.
- 고정 장치: 고정 없음 → TASK-CMP-CTRL-SHORTCUT-VISUAL
- 출처: D00749

<a id="CMP-CTRL-PROGRESS"></a>

## CMP-CTRL-PROGRESS 비율 진행 표시

- 목표: 일반 진행률을 표시한다 → 공통 progress 하나로 한 줄 글자와 고정 폭의 짧은 막대를 그린다 → 전체 폭 막대나 줄바꿈이면 실패. 리소스 사용량은 [SCR-NO-USAGE-BAR](../screens/common.md#SCR-NO-USAGE-BAR)를 따라 이 부품으로 표시하지 않는다.
- 현재: `kit/components/progress.js`와 `kit/components/progress.test.mjs`가 있다. 파일 존재는 소비 화면의 폭·줄바꿈 합격을 뜻하지 않는다.
- 차이: 모든 소비 화면의 실제 폭 검증은 남아 있다.
- 고정 장치: `kit/components/progress.test.mjs`의 선언 범위와 `kit/tools/check-layout.mjs`의 실제 소비 화면을 함께 확인한다. 전체 소비 화면 고정 없음 → T-B-041.
- 출처: 옛 화면 규칙.
