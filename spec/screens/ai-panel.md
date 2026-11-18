# AI 칸 · 대화

<a id="SCR-AI-PANEL"></a> 진입: `셸 오른쪽 panel; 레거시 wake://chat/:id`. 목적(SRE 판단): AI 조사·근거·제안과 사람 승인 결과를 확인한다.
구성: 한 AI 칸 → 대화·작업 단계 → context 칩 → 작성창·모델·권한·노력 수준.
현재: [apps/wake/app.config.js](../../apps/wake/app.config.js); [apps/wake/ai-hub.js](../../apps/wake/ai-hub.js); [kit/shell/panel-engine.js](../../kit/shell/panel-engine.js). 정적 코드 확인이며 실제 화면·실클러스터 합격은 미검증이다. 출처의 D-USR-2026-11-16-1~6은 확정값, -7의 세부 동작은 기본값이다.
공통: [원본·대상](common.md#SCR-SOURCE-IDENTITY), [7상태](common.md#SCR-STATES), [이동·복귀](common.md#SCR-NAV-RETURN), [검수](common.md#SCR-NATIVE-ACCEPT).
7상태 적용 대상: 대화 신원, 모델·노력, 작업·답변; 판정은 → [RULE-STATE](../rules.md#RULE-STATE). 로컬 화면은 설정/호스트 작업 상태에 한정한다.
구성 요소: [CMP-CTRL-SEARCH](../components/controls.md); [CMP-CHART-01](../components/charts.md); [CMP-TABLE-01~08](../components/table-contract.md); [CMP-CARD-01~02](../components/cards.md); [CMP-CHIP-01~03](../components/source-chips.md). 표 열과 카드 세부는 components ID를 참조한다.
고정 장치: `apps/wake/ai-target-flow.test.mjs`; `apps/wake/ai-hub.test.mjs`. 시험 파일의 존재는 실행 합격 근거가 아니다.

## 목표와 현재의 차이

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AI-PANEL-01"></a> `SCR-AI-PANEL-01` | 본문의 AI에 묻기를 누른다 → 같은 오른쪽 panel에 대화·진행·context 칩·작성창·모델·권한·노력 선택이 나타난다 → 중앙 대화를 새로 만들거나 질문 대상이 사라지면 실패 | renderBottom은 승인 질문과 chip을 받은 composer, controls를 조립한다; `kit/shell/panel-engine.js:244` | 앱에 레거시 chat 탭 경로도 남아 있어 모든 진입점이 오른쪽 칸으로 통합된 것은 아니다 | 고정 없음 → TASK-SCREEN-AI-PANEL | D00607, D01000 |
| <a id="SCR-AI-PANEL-V01"></a> `SCR-AI-PANEL-V01` | 같은 대화를 닫았다 열고 실패 답변 뒤 재시도한다 → ai.run의 conversation ID와 저장 실패 메시지를 유지한다 → 새 ID 생성이나 실패 기록 소실이면 실패 | 요청은 c.savedId 또는 c.id를 conversation으로 쓴다; `kit/shell/panel-engine.js:98` | 없음(확인: `kit/shell/panel-engine.js:98`) | apps/wake/ai-target-flow.test.mjs — a partial answer and a dropped provider → read again → a question once it is back → read again: the failure, its words and the partial text stay | D00316; 저장 세부는 D-USR-2026-11-16-7 |
| <a id="SCR-AI-PANEL-V02"></a> `SCR-AI-PANEL-V02` | ai.providers=[]인 상태에서 모델·노력 메뉴를 연다 → composer.noModel과 연결 설정 이동을 보이고 공급자가 실제 지원하는 모델·노력만 실행 선택지로 제공한다 → 존재하지 않는 모델·노력을 실행 가능으로 나열하면 실패 | 실제 providers 목록을 읽되 노력 선택지는 ai.efforts 정적 정의를 사용한다; `kit/shell/panel-engine.js:51` | 노력 수준은 공급자의 지원 목록을 조회하지 않는다 | 고정 없음 → TASK-SCREEN-AI-PANEL | D-USR-2026-11-16-7 |
| <a id="SCR-AI-PANEL-V03"></a> `SCR-AI-PANEL-V03` | get_evidence 실패 뒤 답변이 [1]을 언급한다 → 성공 조회로 확인된 refs만 근거 이름표를 가진다 → 실패 조회 번호에 원문 링크를 만들면 실패 | citedIn은 used의 단일 사건에서 근거를 조회한다; `apps/wake/desktop/ai-run.cjs:109` | 없음(확인: `apps/wake/desktop/ai-run.cjs:109`) | apps/wake/desktop/ai-target.test.cjs — marks with no incident read, or with two incidents read, carry no refs | D00466, D00473 |
| <a id="SCR-AI-PANEL-A01"></a> `SCR-AI-PANEL-A01` | 등록되지 않은 context ID를 붙여 질문한다 → 모델 호출 전에 거절하고 현재 대화에 실패를 보존한다 → 모델을 호출하거나 거절 이유가 대화에서 사라지면 실패 | 거절 답변을 convs.put으로 저장하고 target_rejected를 반환한다; `apps/wake/desktop/ai-run.cjs:131` | 없음(확인: `apps/wake/desktop/ai-run.cjs:131`) | apps/wake/desktop/ai-target.test.cjs — an unregistered or malformed target is refused before any model call, the person is told, and the conversation keeps the refusal | D-USR-2026-11-16-7 |
| <a id="SCR-AI-PANEL-A02"></a> `SCR-AI-PANEL-A02` | 본문과 외부 도구에서 각각 AI에 묻기를 누른다 → 외부 AI·본문 AI에 묻기 모두 같은 오른쪽 칸을 연다. 중복 AI 창·중앙 대화로 쪼개지 않는다 → 오른쪽 칸 대신 중앙 대화 또는 중복 AI 창을 열면 실패 | 대화 메뉴의 cv-open은 addr.chat(id)를 새 탭으로 연다; `apps/wake/app.config.js:503` | 오른쪽 패널 외에 중앙 chat 탭을 여는 메뉴가 남아 있다 | 고정 없음 → TASK-SCREEN-AI-PANEL | D00607, D01000 |
| <a id="SCR-AI-PANEL-A03"></a> `SCR-AI-PANEL-A03` | 공급자 미설정 상태에서 첫 질문을 입력하고 공급자 연결 뒤 두 번째 질문을 보낸다 → 두 질문 모두 모델 입력과 저장 기록에 남는다 → 첫 질문이 연결 과정에서 사라지거나 모델 입력과 저장 기록이 다르면 실패 | 공급자가 없으면 convs.put 전에 unconfigured로 반환하고 새 대화 ID도 null이다; `apps/wake/desktop/ai-run.cjs:135` | 미연결 첫 질문을 새 대화에 저장하지 않아 연결 후 자동 복원할 원본이 없다 | 고정 없음 → TASK-SCREEN-AI-PANEL | D00316; 연결 전후 저장은 D-USR-2026-11-16-7 |
| <a id="SCR-AI-PANEL-A04"></a> `SCR-AI-PANEL-A04` | 답변의 복사·고치기·받아쓰기·표 크게 보기를 각각 실행한다 → 각 동작이 선택한 답변에 적용되고 복사 실패는 실패로 알린다 → 다른 답변을 처리하거나 지원 동작이 사라지거나 복사 실패를 성공으로 알리면 실패 | 엔진 actions에는 모델·권한·대화·근거·승인 동작이 있다; `kit/shell/panel-engine.js:290` | 이 action 목록에는 받아쓰기·답변 고치기·표 크게 보기 처리가 없다 | 고정 없음 → TASK-SCREEN-AI-PANEL | D-USR-2026-11-16-7 |
| <a id="SCR-AI-PANEL-G01"></a> `SCR-AI-PANEL-G01` | 공급자 없이 첫 질문 후 연결하고 같은 대화에 두 번째 질문을 보낸다 → 두 질문과 최초 실패를 같은 ID로 저장하고 모델 입력에 유지한다 → 첫 질문 소실 또는 중복 저장 시 실패 | defaultModel이 없으면 저장 전에 unconfigured로 반환한다; `apps/wake/desktop/ai-run.cjs:135` | 첫 질문과 실패가 convs.put에 도달하지 않아 같은 저장 대화로 이어지지 않는다 | 고정 없음 → TASK-SCREEN-AI-PANEL | D00316; 실패 보존은 D-USR-2026-11-16-7 |
| <a id="SCR-AI-PANEL-G02"></a> `SCR-AI-PANEL-G02` | null 대상·거절·오래된 대화 사본·공급자 실패로 후속 질문을 보낸다 → 대상 오류는 호출 전 거절하고 실패·기존 이력은 같은 대화에 보존한다 → 다른 대상 호출 또는 재조회 때 실패 기록 소실 시 실패 | target 형태와 등록 여부를 먼저 검사하고 거절을 별도로 저장한다; `apps/wake/desktop/ai-run.cjs:116` | 없음(확인: `apps/wake/desktop/ai-run.cjs:116`) | apps/wake/ai-target-flow.test.mjs — a named but wrong target (false, 0, empty, null) is refused, not taken as "no target", and not announced as done | D-USR-2026-11-16-7 |
| <a id="SCR-AI-PANEL-G03"></a> `SCR-AI-PANEL-G03` | 외부 도구와 본문에서 각각 AI에 묻기를 실행한다 → 같은 오른쪽 AI 칸을 열고 대상 문맥을 전달한다 → 중앙 독립 대화나 중복 AI 창으로 분기하면 실패 | cv-open이 newTab:true로 chat 주소에 이동한다; `apps/wake/app.config.js:503` | 새 탭 대화 진입이 남아 단일 오른쪽 칸 계약과 다르다 | 고정 없음 → TASK-SCREEN-AI-PANEL | D00607, D01000 |
| <a id="SCR-AI-PANEL-G04"></a> `SCR-AI-PANEL-G04` | 연결된 공급자별로 실제 대화 요청을 보낸다 → 실행 지원 공급자만 호출하고 미지원은 명시한다 → 연결 행이 있다는 이유로 OpenAI·Google·구독 CLI 실행 성공을 표시하면 실패 | Claude API와 구독 CLI 셋을 실행한다; `apps/wake/desktop/ai-run.cjs:223`, `apps/wake/desktop/ai-cli.cjs:161` | OpenAI·Google API 키 실행 분기가 없다. 이 둘의 연결 표시를 대화 실행 지원으로 읽으면 안 된다 | `apps/wake/desktop/ai-cli.test.cjs` | D-USR-2026-11-16-7 |

## 결정에서 옮긴 규칙

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AI-ONE-PANE"></a> `SCR-AI-ONE-PANE` | 본문과 외부 도구에서 같은 대화 ID로 질문하고 패널을 다시 연다 → 오른쪽 한 칸에서 ai.run 저장 이력과 최초 실패를 이어 본다 → 중앙 chat이나 새 ID로 분리되면 실패 | send 요청에 savedId를 넣어 같은 대화로 이어 간다; `kit/shell/panel-engine.js:98` | 대화 ID는 공유하지만 앱 메뉴의 새 chat 탭 경로가 남아 있다 | 고정 없음 → TASK-SCREEN-AI-PANEL | D00607, D01000, D00316 |
| <a id="SCR-AI-SCREEN-CONTROL"></a> `SCR-AI-SCREEN-CONTROL` | AI가 선언된 검색·필터를 적용하고 해당 칩 하나를 지운다 → screen state의 그 값만 이전 값으로 돌아가며 마지막 칩 삭제 후 줄이 사라진다 → 무관한 값 복원이나 승인 버튼 실행이면 실패 | aiKeys만 변경하고 before에 이전 값을 저장하며 resetAi(key)는 그 키만 복원한다; `kit/page/screen.js:32` | 없음(확인: `kit/page/screen.js:32`) | kit/page/screen.test.mjs — the AI sets only its keys, each remembers its value before the AI, and a reset puts one or all back | D00884, D00885, D00922 |
| <a id="SCR-AI-PROGRESS"></a> `SCR-AI-PROGRESS` | 1. 도구 단계 2개와 근거 답변이 도착한다 → AiEvent 단계는 접을 수 있는 줄로, 최종 답변은 refs 이름표로 보인다 → 상태 아이콘 겹침이나 근거 없는 번호 링크가 생기면 실패.<br>2. 도구 단계 3개와 짧은 제목의 최종 답변, 충분/좁은 폭 → compact 한 줄 진행, 불필요한 강제 개행 없음, 경계선 한 번 → 큰 세로 공백·불필요한 첫줄 개행·중복선이면 실패. | 조사 단계는 state 없는 stepRow, 완료 그룹은 stepGroup으로 그린다; `kit/shell/panel-engine.js:203` | 조사 단계가 compact state 행이 아니라 padding-bottom과 연결선이 있는 icon 행을 사용한다 | 고정 없음 → TASK-SCREEN-AI-PANEL | D00752, D00758, D00742 |

## 추가 수용 조건

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AI-PANEL-REQ-R-040"></a> `SCR-AI-PANEL-REQ-R-040` | 연결 공급자 목록을 읽은 뒤 실제 질문을 보낸다 → ai.providers 모델만 선택하고 ai.run 응답과 conversation 저장 기록의 답변이 같다 → 도구가 반환하지 않은 수치를 정상 관측처럼 표시하면 실패 | SYSTEM은 읽기 도구 반환값만 사용하도록 지시한다; `apps/wake/desktop/ai-run.cjs:28` | 모델의 수치 진술을 원본과 대조하는 구조화된 검증기는 없다 | 고정 없음 → TASK-SCREEN-AI-PANEL | D00466, D00473; 모델 목록은 D-USR-2026-11-16-7 |
| <a id="SCR-AI-PANEL-REQ-R-041"></a> `SCR-AI-PANEL-REQ-R-041` | 화면 필터 적용과 승인 버튼 누르기를 AI가 요청한다 → 등록 screen 키만 바뀌며 승인·병합·실행은 사람에게 남는다 → 임의 action이 실행되면 실패 | relay set은 ctx.setState(patch,{ai:true})와 상세 이동만 수행하고 임의 action을 호출하지 않는다; `kit/page/boot.js:108` | 없음(확인: `kit/page/boot.js:108`) | kit/page/screen.test.mjs — the AI sets only its keys, each remembers its value before the AI, and a reset puts one or all back | D00884, D00885, D00869 |

| 규칙 ID | 목표 | 현재(코드 위치) | 차이·남은 작업 | 고정 장치 | 출처 |
|---|---|---|---|---|---|
| <a id="SCR-AI-PANEL-KIT"></a> `SCR-AI-PANEL-KIT` | 같은 conversation으로 스트림 오류와 승인 결과를 받는다 → AiEvent는 해당 대화의 오류·승인 part에 반영되고 재열기에도 유지된다 → 다른 대화에 결정을 붙이면 실패 | 저장 대화 list 변환은 text/error parts만 재구성한다; `apps/wake/desktop/ai-run.cjs:198` | approval part를 저장 대화에서 재구성하지 않으며 hub의 외부 승인함도 pending만 포함한다 | 고정 없음 → TASK-SCREEN-AI-PANEL | D00316; 대화 저장·승인 이벤트 세부는 D-USR-2026-11-16-7 |
