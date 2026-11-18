# AI 연결·조사·외부 연결 흐름

인증 성공과 실제 대화 실행을 별도로 판정한다. PRD-003의 읽기 경계, PRD-006의 7상태를 적용한다.

공통: [권한·대상·7상태·왕복·원본 대조·표시](../product.md#공통-계약-적용). 현재는 소스 확인, 시험·캡처·실제 연결 합격은 별도다.

## FLOW-AI-001: 공급자 선택·키·구독 CLI

- 목표: 입력: 6개 공급자 중 OpenAI API·구독 CLI를 각각 선택해 키 검증 다음 실제 질문을 보낸다 → 기대: (기본값 채택, 번복 가능) OPEN-PF-007: 지원 목표는 API 키(Anthropic/OpenAI/Google), 구독 CLI(codex-cli/gemini-cli/claude-cli) 6개로 하며(로컬 Ollama는 D-USR-2026-11-17-11로 지움) 인증 방식과 실제 실행 능력을 구분한다. API 키 검증/CLI 설치·로그인 다음 실제 모델 호출까지 통과한 기능만 사용 가능이다. 키 확인을 대화 연결 완료로 부르지 않는다. 공급자 미설정이면 한 설정 진입점으로 연결하고 최초 질문을 보존한다. 중복 연결 버튼을 늘리지 않는다. → 실패: 키 확인만으로 대화 연결 완료가 되거나 실행 미지원 공급자가 사용 가능으로 보이면 실패
- 현재: `apps/wake/app.config.js:528`은 6개 AI 연결을 표시한다. 실행은 Claude API와 연결한 구독 CLI 셋(`apps/wake/desktop/ai-cli.cjs`, 연결 파일 aiCli 기록이 있는 것만 모델 목록에 나옴)이다.
- 차이: OpenAI·Google API 키는 설정 연결과 실제 대화 실행 지원이 일치하지 않는다. Gemini CLI 연결 확인은 명령·설정 폴더만 보므로 계정 등급 오류를 연결 단계에서 잡지 못한다(대화에서 원인 글로 보임). → TASK-A3-AI-001
- 고정 장치: `apps/wake/desktop/hub.test.cjs`, 시험 `without a provider the built-in AI says no model is connected and calls nothing`
- 출처: D-USR-2026-11-16-7; D00033 D00660 D00741 D00965 D00966 D01000; R-037,R-058.

<a id="FLOW-AI-002"></a>

## FLOW-AI-002: 대상과 대화 보존

- 목표: 입력: 모델 미연결 상태에서 최초 질문을 보내고 연결 후 같은 conversation ID를 다시 연다 → 기대: 현재 화면에서 묻기는 오른쪽 AI를 열고 cluster/context/namespace/target/window/evidence를 보존한다. 등록되지 않은 context·빈 값·null·제어문자는 모델 호출 전에 거부한다. (기본값 채택, 번복 가능) OPEN-PF-008: target 문자열 상한은 1024자이며 초과하면 원문을 자르지 않고 입력 오류로 반환한다. 유효 ARN·슬래시 ID는 자르지 않는다. conversation ID는 허브 정본이며 오래된 클라이언트 사본으로 메시지를 지우지 않는다. 질문·도구 결과·부분 답·실패·취소를 저장하고 다시 열기/재시작/공급자 변경 후 이어간다. → 실패: 최초 질문이 저장되지 않거나 1025자 target을 잘라 다른 대상으로 호출하면 실패.
- 추가 조건: 입력 리소스/이벤트 상세의 AI에게 묻기를 포인터와 키보드로 실행 → 기대 같은 대상·시각·근거의 AI 맥락을 열고 실패 시 실제 오류 표시 → 실패 클릭 무반응 또는 다른 대상 전달.
- 현재: `apps/wake/desktop/ai-run.cjs:134`는 모델을 찾고 :135에서 없으면 반환하며 :139에서야 메시지를 합친다.
- 차이: 모델 없는 최초 질문은 저장 전에 반환되어 연결 후 이어지는 대화에서 사라진다. → TASK-A3-AI-002
- 고정 장치: `apps/wake/ai-target-flow.test.mjs`, 시험 `a target id goes to the hub as given: 1024 characters pass, 1025 or a control character at 1025 are refused, a longer id never matches a registered prefix`; 추가 조건 고정 없음
- 출처: D-USR-2026-11-16-7; D00452 D00506 D00607 D00866 D00884 D00910 D01000; R-037,R-038; 1차; D00513

<a id="FLOW-AI-003"></a>

## FLOW-AI-003: 읽기 진행·근거·감사

- 목표: 입력: get_evidence 도구가 403을 반환하고 다른 읽기는 성공한 AI 답의 근거 이름표를 Enter로 연다 → 기대: AI의 실제 도구 시작/완료/오류를 진행 상태로 표시한다. 가짜 생각·호출·완료를 만들지 않는다. 답은 관측/기준/해석/검증/미확인과 근거를 구분하고 실패 읽기를 성공 근거로 인용하지 않는다. 작업 기록에는 요청자·권한·모델·클라이언트·경로·도구·입력의 비밀 값 가림·결과·시각을 남긴다. 근거 이름표는 클릭·Enter·Space로 같은 스냅샷을 연다. → 실패: 실패한 읽기를 성공 근거로 인용하거나 requester·model·결과가 감사에서 빠지면 실패.
- 추가 조건: 한국어 최종 AI 답변·라벨·인용의 문체 판정은 [RULE-AI](../rules.md#RULE-AI)를 따른다. 출처: D00748, wake-ui-decisions의 2026-11-12 결정.
- 현재: `apps/wake/desktop/ai-run.cjs:155`는 도구 결과의 성공 여부와 무관하게 incident를 used에 넣는다.
- 차이: 실패한 get_evidence도 인용 후보 집합에 들어가 성공 근거처럼 연결될 수 있다. → TASK-A3-AI-003
- 고정 장치: 고정 없음 → TASK-A3-AI-003
- 출처: D00748 D00466 D00473 D00660 D00742 D00752 D00765 D00766 D00883 D00912; R-035,R-055,R-070; B1 round7 minor.

## FLOW-AI-004: MCP·HTTP·선언된 화면 제어

- 목표: 입력: MCP 클라이언트를 제한된 namespace scope로 발급하고 설정 화면을 열었다가 미등록 route·approve·script를 요청한다 → 기대: 외부 데스크톱/API AI와 내장 AI는 같은 읽기 허브를 사용한다. 설정에서 transport를 켜고 이름·cluster/namespace/kind scope로 클라이언트를 발급한다. 토큰은 최초 1회만 표시하고 서버는 해시만 보관한다. 외부는 읽기·propose_action만 가능하며 승인·실행 불가. 화면 제어는 선언된 page/filter/search/disclosure/chip만 patch하고 적용 키·되돌릴 칩을 반환한다. 임의 script/미등록 route/숨은 다른 탭/scope 밖은 거절한다. → 실패: 설정 읽기만으로 aiserver.set이 실행되거나 외부 클라이언트가 승인·임의 script를 실행하면 실패
- 현재: `apps/wake/ai-connect.js:22`는 렌더 중 저장된 transport 설정과 서버가 다르면 aiserver.set을 호출한다.
- 차이: 설정 화면 읽기가 서버 상태 변경을 일으킨다. Secret 메타 허용 문구도 읽기 금지 계약과 다르다. → TASK-A3-AI-004
- 고정 장치: `apps/wake/desktop/hub.test.cjs`, 시험 `the server answers MCP and the HTTP API only with a client token of that transport, only on 127.0.0.1`
- 출처: D00884 D00885 D00965 D00966 D00967; R-039,R-040,R-041; 1차 ).

## FLOW-AI-005: 대화 보관·재개·내보내기

- 목표: 입력: conversation ID=c1을 보관한 뒤 재시작·검색·Markdown 내보내기·삭제를 실행한다 → 기대: 보관은 대화의 위치만 옮기며 감사 기록을 지우지 않는다. 보관함에서 제목·마지막 답·cluster·incident·보관 시각으로 찾고 다시 열거나 Markdown으로 내보낸다. 실제 삭제는 대화만 삭제하며 별도 감사 보관 정책은 유지한다. 저장소 읽기 실패/미설정/검색 0건/보관 대화 0건은 서로 다른 상태다. → 실패: 메시지·대상이 바뀌거나 대화 삭제가 같은 incident의 감사 기록까지 지우면 실패
- 현재: `apps/wake/data/chats.js:9`의 chatList, :16의 filterArchive, :28의 toMarkdown이 위치·검색·문서 출력을 처리한다.
- 차이: 보관 기간 설정은 비활성이며 incident ID 검색과 보관 시각 정렬이 없다. → TASK-A3-AI-005
- 고정 장치: 고정 없음 → TASK-A3-AI-005
- 출처: D00776 D00445 D00506 D00734 D00883; R-038,R-055,R-059; app.config.js:203-225.
