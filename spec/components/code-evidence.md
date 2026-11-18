# 코드·로그·근거 이름표

<a id="cmp-code-01"></a>

## CMP-CODE-01 — YAML과 diff

- 목표: metadata.resourceVersion=42이고 이미지가 같은 두 revision의 spec.template 설정만 다른 YAML을 연다 → codeBlock은 path/text/syntax/diff/wrap 입력으로 원문을 렌더한다. YAML 카드 머리 값은 metadata.resourceVersion이며 이벤트 YAML도 동일하다. revision이 별도로 있으면 혼동하지 않게 분리한다. 코드 머리·접기·복사·찾기·줄바꿈은 공통 부품을 사용한다. 본문 뒤가 비치거나 코드영역이 가로로 끊기지 않아야 한다. diff는 실제 before/after와 파일 경로를 사용한다. 이미지가 같다는 이유로 설정변경 diff를 비우면 안 된다. → resourceVersion 대신 revision을 표시하거나 설정 diff를 빈 화면으로 만들거나 복사 원문이 잘리면 실패.
- 현재: rolloutTab은 now.image와 prev.image가 다를 때만 diff를 만들고 YAML은 resourceVersion을 별도로 표시한다(`apps/wake/pages/resource-detail.js:652,669`).
- 차이: 같은 이미지의 환경변수·리소스 설정 변경은 diff가 없다. 목표는 spec.template 전체 변경이다.
- 고정 장치: `kit/components/code-block.test.mjs` — `the language comes from syntax, else lang, else the file extension; docs draw one block with --- between documents`
- 출처: D00879, D00996, D01039
- 점검 항목: 긴 YAML·긴 한 줄·여러 파일·설정만 바뀐 rollout·빈 원문·403·조회 중을 다크와 라이트에서 확인한다. 복사 값은 안전한 원문과 같아야 한다.

<a id="cmp-log-01"></a>

<a id="CMP-LOG-01"></a>

## CMP-LOG-01 — 로그 줄과 범위

- 목표: parseLogs에 n=7,8,9인 ERROR·INFO·FATAL 줄을 넣고 ERROR 필터를 켠다 → 로그 목록과 상세는 log-card/logView를 공유한다. parseLogs는 원본 순서의 n을 유지하고 필터 후 다시 번호를 매기지 않는다. 렌더 페이지 20줄은 기본값 채택이며 최초 요청량·전체 보관량과 다르다. ERROR에는 FATAL을 포함하고 WARN/WARNING과 ERR/PANIC을 정규화하며 없는 레벨은 빈 값이다. 검색만 보기의 앞뒤 줄은 수집한 동일 레벨 집합 기준임을 밝힌다. 전체 구간 수준별 수는 logs.levels가 있을 때만 전체라고 표시한다. → 선택 줄 번호가 1,2로 바뀌거나 FATAL을 누락하거나 읽은 줄 수를 전체 기간 건수로 표시하면 실패.
- 추가 조건: 로그 행에 hover/focus, 검색 전후 표시 → 현재 행 식별용 공통 강조, UI 설명 “모든 줄”·“일치 줄과 앞뒤 2줄” 제거, 실제 검색 범위/생략 정보는 정직하게 유지 → 행 위치를 식별할 수 없거나 지적 문구를 메타 안내로 반복하면 실패.
- 현재: log-card의 model은 20줄 페이지와 레벨·검색 필터를 만들고 previousOf로 이전 컨테이너를 구분한다(`apps/wake/pages/log-card.js:11–36`).
- 차이: 20줄 렌더 페이저에는 서버 커서와 전체 기간 레벨 집계를 만드는 기능이 없다. logs.levels가 없는 응답의 전체 건수는 계산할 수 없다.
- 고정 장치: `kit/components/log-view.test.mjs` — `lines keep the numbers given, never renumbered, with time, level and text; the level words set the tone`; 추가 조건 고정 없음
- 출처: D-USR-2026-11-16-7; D00064, D00095, D00097, D00098, D00452, D00874; D00778
- 점검 항목: 동일 나노초의 여러 줄, 빈 줄, ANSI, 긴 줄, 레벨 없는 줄, 이전 컨테이너와 50,000건 입력에서 누락·중복을 확인한다. 원문 줄 번호를 보존하고 전체 구간 건수와 읽은 줄 수를 구분한다.

<a id="cmp-log-02"></a>

## CMP-LOG-02 — 동일 대상·과거 연결·7상태

- 목표: Pod UID=a의 Event 시각에서 로그를 열고 동일 이름 UID=b가 생성된 뒤 응답을 받는다 → 이벤트의 이 시점 로그는 같은 cluster/ns/Pod UID/container의 전후 5분이다. 삭제 뒤 같은 이름의 새 Pod로 대체하지 않는다. 현재/이전 컨테이너 선택은 명시한다. 수집 중은 로그 틀, 성공 빈 응답은 빈 상태, 연결/권한 실패는 출처 상태, 부분 조회는 수집한 구간, 오래됨은 실제 마지막 수집 시각을 보인다. 따라가기를 끄면 스크롤을 강제로 내리지 않는다. 로그 원문은 신뢰할 수 없는 문자열로 이스케이프한다. → a의 로그 자리에 b의 줄을 붙이거나 전후 5분·container·previous 선택이 바뀌면 실패.
- 현재: logCard는 previousOf와 공통 logView를 사용하고 o.partial이면 경고를 붙인다(`apps/wake/pages/log-card.js:24,58`).
- 차이: logCard 입력은 이미 받은 줄과 대상이다. UID 전환 중 요청 취소·과거 전후 5분 조회는 호출 페이지가 별도로 처리해야 한다.
- 고정 장치: 고정 없음 → TASK-CMP-LOG-IDENTITY
- 출처: D00093, D00094, D00452
- 점검 항목: 이벤트에서 로그를 열고 돌아올 때 UID·시간·컨테이너·필터를 복원한다. 새 UID 응답을 이전 UID에 붙이거나 따라가기 해제 후 새 줄이 scrollTop을 바꾸면 실패다.

<a id="cmp-ref-01"></a>

## CMP-REF-01 — 근거 이름표와 실제 읽기

- 목표: → [RULE-EVIDENCE](../rules.md#RULE-EVIDENCE).
- 현재: ref는 action이 있으면 span에 role=button과 tabindex를 붙이고 ai-run은 incidentOf(c)를 used에 추가한다(`kit/components/ref.js:21–25`; `apps/wake/desktop/ai-run.cjs:155`).
- 차이: ref 자체에 Enter/Space 핸들러가 없고 used 추가는 도구 성공 판정을 조건으로 삼지 않는다.
- 고정 장치: `kit/components/ref.test.mjs` — `a labelled reference reads where the evidence is from, its excerpt as the tip, and still opens it by its number`
- 출처: D-USR-2026-11-16-7; D00660, D00884, D00885, D01051
- 점검 항목: → [RULE-EVIDENCE](../rules.md#RULE-EVIDENCE).

## 세부 동작 계약

| 규칙 ID | 목표 | 현재 | 차이 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="cmp-code-tree"></a>CMP-CODE-TREE 파일 트리와 코드 동작 | 경로 a/x.yaml,b/y.yaml의 diff 두 개 중 y를 선택한다 → 여러 파일의 diff는 실제 경로 트리에서 선택한다. 접기 아이콘은 파일/폴더 이름 옆에 두고 코드와 트리의 스크롤 영역을 분리한다. 복사·찾기는 공통 아이콘 동작이며 선택한 안전한 원문만 복사한다. → y의 원문 대신 x를 복사하거나 트리와 본문 스크롤이 함께 움직이면 실패. | render는 파일 트리와 선택 항목을 만든다(`kit/components/file-tree.js:41`) | 없음(확인: kit/components/file-tree.js:41) | 고정 없음 → TASK-CMP-CODE-TREE | D00253, D00254, D00394, D00426, D00714, D00879 |
| <a id="cmp-report-select"></a>CMP-REPORT-SELECT 보고서 선택과 출력 | report.selected 두 줄을 삭제한 뒤 같은 report 상태를 내보낸다 → 드래그한 실제 근거 구간에 선택 삭제를 제공하고 체크박스를 보고서 선택 방식으로 쓰지 않는다. 보고서는 실제 화면의 데이터 모델을 재사용하되 PDF/Markdown에는 카드·버튼 대신 제목·표·그래프·근거 링크를 배치한다. 선택·삭제 후 출력되는 데이터와 기간이 미리보기와 같아야 한다. → 삭제된 줄이 PDF나 Markdown에 다시 나타나면 실패. | handle은 선택·삭제·되돌리기 연산을 report 모델에 적용한다(`kit/components/report-canvas.js:170`) | 없음(확인: kit/components/report-canvas.js:170) | `kit/components/report-canvas.test.mjs` — `handle: set, add, clear, move, delete and undo; refer hands over stable ids` | D00884, D00885, D00887, D00925, D00930, D00942, D00943, D00948, D00949 |
