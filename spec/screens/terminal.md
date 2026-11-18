# 터미널

<a id="SCR-TERMINAL"></a> 진입: `클러스터/리소스 문맥의 터미널 열기`. 목적(SRE 판단): 현재 대상에 연결된 실제 터미널을 고른다.
구성: 현재 대상 표시 → 실제 선택 터미널 실행.
구현 위치는 각 행의 현재 칸에서 함수·분기와 파일:줄로 지정한다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 대상, 프로필; 판정은 → [RULE-STATE](../rules.md#RULE-STATE).
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
판정 범위: 현재와 차이는 정적 코드 대조다. 고정 장치는 해당 행의 시험 이름·점검 항목을 가리키며 시험 실행 결과나 Electron·실클러스터 합격을 뜻하지 않는다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-TERMINAL-01"></a> `SCR-TERMINAL-01` | c/default/Pod/p에서 터미널을 연다 → terminal.session의 c·default·Pod·p를 제목과 실제 세션 대상으로 사용한다 → 전역 current-context의 다른 클러스터가 열리면 실패 | 세션 키에 cluster·namespace·kind·name을 직렬화한다 ([`apps/wake/app.config.js:961`](../../apps/wake/app.config.js#L961)) | 없음(확인: apps/wake/app.config.js:961) | apps/wake/app.config.test.mjs :: terminal_cluster_descendants_preserve_namespace_and_resource_identity | D00045, D00047 |
| <a id="SCR-TERMINAL-V01"></a> `SCR-TERMINAL-V01` | 전역 current-context=B인 상태에서 A 화면 터미널을 연다 → term.target 또는 term.env가 A contextId를 사용한다 → B 셸로 조용히 대체되면 실패 | 원격 대상 조회와 fallback 모두 target.cluster를 전달한다 ([`apps/wake/app.config.js:972`](../../apps/wake/app.config.js#L972)) | 없음(확인: apps/wake/app.config.js:972) | 고정 없음 → TASK-SCREEN-TERMINAL | D00045, D00047 |
| <a id="SCR-TERMINAL-V02"></a> `SCR-TERMINAL-V02` | 1. 터미널 선택을 연다 → 로컬 발견 결과의 설치된 앱·프로필만 목록에 보인다 → 없는 앱을 사용 가능으로 표시하면 실패.<br>2. 입력 로컬에 터미널 앱 둘 이상이 발견된 상태에서 터미널 선택 열기 → 기대 터미널 항목에서 설치된 앱 목록을 직접 열어 선택 → 실패 앱 목록에 닿으려면 추가 중첩 메뉴를 통과하거나 발견되지 않은 앱을 사용 가능으로 표시 | terminal control은 terminalOptions와 terminalSelection을 사용한다 ([`apps/wake/app.config.js:271`](../../apps/wake/app.config.js#L271)) | 현재 선택은 터미널 모양 가져오기에 연결되어 외부 터미널 앱 실행 선택과 다르다 | 고정 없음 → TASK-SCREEN-TERMINAL | D00042 |
| <a id="SCR-TERMINAL-A01"></a> `SCR-TERMINAL-A01` | A 세션을 열고 B로 이동해 터미널을 연다 → 서로 다른 session key와 제목으로 분리된다 → A 출력을 B 제목 아래 보이면 실패 | session은 활성 라우트 대상별 JSON 키를 만든다 ([`apps/wake/app.config.js:958`](../../apps/wake/app.config.js#L958)) | 없음(확인: apps/wake/app.config.js:958) | 고정 없음 → TASK-SCREEN-TERMINAL | D00045, D00047 |
| <a id="SCR-TERMINAL-A02"></a> `SCR-TERMINAL-A02` | 원격 대상 조회에 오류를 반환한다 → 대상 연결 실패를 표시하고 가짜 성공 출력은 만들지 않는다 → 실패를 정상 프롬프트로 대체하면 실패 | 잘못된 native 응답은 REMOTE_RESPONSE_REJECTED 오류로 반환한다 ([`apps/wake/app.config.js:976`](../../apps/wake/app.config.js#L976)) | 없음(확인: apps/wake/app.config.js:976) | 고정 없음 → TASK-SCREEN-TERMINAL | D00037, D00045 |
| <a id="SCR-TERMINAL-G01"></a> `SCR-TERMINAL-G01` | 연결된 터미널을 확대했다 복귀한다 → context·프로세스·기존 출력이 유지된다 → 새 프로세스가 생기거나 출력이 지워지면 실패 | 확대 동작은 dockExpanded 토글과 syncDock만 호출한다 ([`kit/shell/shell.js:1244`](../../kit/shell/shell.js#L1244)) | 없음(확인: kit/shell/shell.js:1244) | 고정 없음 → TASK-SCREEN-TERMINAL | D00038, D00039 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-TERMINAL-TARGET"></a> `SCR-TERMINAL-TARGET` | 현재 Pod에서 터미널을 요청하되 원격 환경이 없다 → 해당 cluster 연결 실패 또는 명시된 연결 상태를 보이며 로컬 기본 셸을 원격으로 표시하지 않는다 → 대상 없는 셸이 열리면 실패 | 호스트와 연결된 클러스터를 검사한 뒤 대상 서비스를 호출한다 ([`apps/wake/app.config.js:970`](../../apps/wake/app.config.js#L970)) | 없음(확인: apps/wake/app.config.js:970) | apps/wake/app.config.test.mjs :: terminal_without_native_environment_fails_instead_of_inheriting_global_context | D00042, D00045, D00047 |

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-TERMINAL-KIT"></a> `SCR-TERMINAL-KIT` | 하단 터미널 닫기 후 다시 연다 → 패널 숨김과 프로세스 종료를 구분하며 같은 세션 출력이 유지된다 → 숨김만으로 명령 실행이 완료 처리되면 실패 | 터미널 토글은 openTerminals 표시 집합만 바꾸고 기존 terms 세션을 종료하지 않는다 ([`kit/shell/shell.js:1245`](../../kit/shell/shell.js#L1245)) | 없음(확인: kit/shell/shell.js:1245) | 고정 없음 → TASK-SCREEN-TERMINAL | D00045; D-USR-2026-11-16-7 |

## 크게 보기와 복귀

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-TERMINAL-EXPAND"></a> `SCR-TERMINAL-EXPAND` | 1. 하단 터미널의 위 화살표를 누른다 → 중앙 칸 상단까지 확장하고 복귀 시 저장 높이·세션·출력을 유지한다 → 상단 미도달·새 PID·출력 소실이면 실패.<br>2. 입력 일반 모션 설정에서 터미널 확장·복원 → 기대 기존 모션 토큰에 따라 현재 높이와 최종 높이를 연속적으로 연결 → 실패 일반 모션에서 중간 프레임 없이 높이가 즉시 바뀜; 세션·초점 손실 | expanded는 height 100%이며 위·아래 화살표를 전환한다 ([`kit/components/terminal-panel.js:19`](../../kit/components/terminal-panel.js#L19)) | 추가 대조: D00039: 일반 모션에서 중간 프레임 없이 높이가 즉시 바뀜; 세션·초점 손실. | 고정 없음 → TASK-SCREEN-TERMINAL | D00038, D00039 |
