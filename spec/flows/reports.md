# 보고서 작성·편집·내보내기

입력은 실제 incident.workspace 또는 클러스터 점검자료다. 화면은 공통 reportCanvas의 한 문서로 작성하고 내보내기는 같은 상태를 사용한다. 외부 채널에 자동 발송하지 않으며 채널용 글 생성/복사와 발송을 구별한다.

공통: [권한·대상·7상태·왕복·원본 대조·표시](../product.md#공통-계약-적용). 현재는 소스 확인, 시험·캡처·실제 연결 합격은 별도다.

## FLOW-REP-001: 진입과 문서 종류

- 목표: 입력: incident.workspace.phase가 open인 사건과 resolved인 사건에서 내보내기를 누르고 작성 중 중단·재개한다 → 기대: 인시던트 내보내기 또는 AI 보고서 요청은 같은 대상·시각의 보고서를 연다. 열린 사건은 상황 공유, 해결된 사건은 사후 분석, 사건 없는 날은 점검 보고서다. 본문 보고서와 오른쪽 AI를 함께 유지하고 잘못된 하위 상세 깊이를 만들지 않는다. 실제 원본을 공통 부품으로 구성하고 추려내는 과정을 보여 주며 가짜 자료를 만들지 않는다. stop/resume/regenerate는 작성 상태와 남은 작업을 바꾸고 reduced-motion에서는 즉시 반영한다. → 실패: 문서 종류가 단계와 다르거나 중단 뒤 op가 적용되거나 같은 op가 재개 때 중복되면 실패
- 현재: `apps/wake/pages/incident-report.js:28`의 load가 incidentReport/checkReport를 고르고 :39의 stream은 중단 상태를 확인한 뒤 op를 적용한다.
- 차이: AI 요청에서 선택한 evidence snapshot ID를 load 인수로 전달하지 않고 incident ID로 작업면을 다시 읽는다. → TASK-A3-REP-001
- 고정 장치: `apps/wake/pages/incident-report-doc.test.mjs`, 시험 `the stage picks the document: an open incident is a status update, a resolved one a postmortem`
- 출처: D00648 D00740 D00742 D00743 D00884 D00885 D00910 D00911 D00916 D00941 D00948 D00949; R-060,R-061.

## FLOW-REP-002: 상황 공유의 필수 내용

- 목표: 입력: incident.workspace에 critical·영향 수치·근거가 있고 담당자 값은 없는 사건의 상황 공유 문서를 연다 → 기대: 맨 위 지금 상황을 10초 안에 읽게 한다. 단계·감지 뒤 경과, 사용자 영향 수치·시작 시각, 원인 추정/확인·근거, 확인 방법, 결정 필요(조치·승인자·영향·근거), 다음 단계(순서·담당), 다음 공유(critical 30분/그 밖 60분), incident/alert/runbook/PR/dashboard 링크가 필수다. 아래는 2 영향 → 3 원인 가설과 근거(이벤트·로그·지표) → 4 진행 기록 → 5 부록이다. 승인 창과 같은 모든 변경·위험을 쓰고 판정 뒤 근거는 추가 수집으로 표시한다. 원본에 없는 담당자는 지정 필요, 없는 값은 확인하지 못함과 이유로 쓴다. → 실패: 가공 담당자가 나오거나 사용자 영향·결정 필요·다음 공유를 첫 화면에서 식별할 수 없으면 실패
- 현재: `apps/wake/pages/incident-report-doc.js:193`의 statusOps는 다음 공유의 every를 (nextShare-detectedAt)/MIN으로 계산한다.
- 차이: 반복 공유 때 경과 시간이 주기로 표시된다. critical 사건의 90분째 공유는 목표 주기 30분 대신 90분으로 계산된다. → TASK-A3-REP-002
- 고정 장치: `apps/wake/pages/incident-report-doc.test.mjs`, 시험 `follow-ups with no owner in the data say "to be assigned"; the on-call is the document on-call`
- 출처: D00464 D00471 D00734 D00740 D00742 D00884 D00885 D00941 D00944; R-060,R-070.

## FLOW-REP-003: 사후 분석과 점검 보고서

- 목표: 입력: resolved 사건을 보고서로 열고 별도 점검 보고서에서 resources(nodes) 읽기를 403으로 실패시킨다 → 기대: 사후 분석은 1 요약 → 2 영향 → 3 타임라인 → 4 원인(근본 원인·동시간 변경·관측/기준·근거) → 5 감지(첫 증상/알림/판정/승인/복구 시간·공백) → 6 대응(조치·변경·영향·판단·승인·결과, 6.1 복구 확인) → 7 잘된 점/아쉬운 점 → 8 후속(할 일·담당·기한·근거) → 9 부록 순서다. 실행 기록은 3절, 원인은 4절에 한 번만 쓴다. 최종 영향·peak·실패 수·Ready·배치 처리 완료를 쓰고 현재 진행형을 남기지 않는다. 그림은 감지 30분 전부터 복구 확인까지이며 승인·적용·복구 표식과 burn 구간을 보인다. 서비스 복구/증상 회복/완화/검증 우회를 구분한다. 점검은 요약 → cluster 상태 → 활성 alert → Warning → 문제 Pod 순서이며 읽기 실패를 0으로 쓰지 않는다. → 실패: 해결 문서에 현재 진행형 값이 남거나 Node 읽기 실패가 0개 정상으로 보이면 실패
- 현재: `apps/wake/pages/incident-report.js:21`의 get은 실패를 null로 바꾸고 :26은 nodes/pods/events를 빈 배열로 전달한다.
- 차이: Node·Pod·Event 읽기 실패가 성공 0건으로 변환된다. Alert 실패만 별도 alertsOff로 보존한다. → TASK-A3-REP-003
- 고정 장치: `apps/wake/pages/incident-report-doc.test.mjs`, 시험 `a resolved document never says "now": final values and "at the end" (N5)`
- 출처: D00734 D00738 D00740 D00742 D00941 D00942 D00944; R-054,R-060,R-063,R-070,R-071.

## FLOW-REP-004: 선택·삭제·참조·순서·되돌리기

- 목표: 입력: reportCanvas의 본문 두 줄을 드래그 선택한 뒤 삭제·undo·절 순서 변경·AI 참조를 실행한다 → 기대: 보고서는 한 장이며 절을 카드·알약으로 중첩하지 않는다. 체크박스나 선택 모드 없이 몸통·빈 곳에서 끌면 닿은 행·줄·문장을 선택한다. 머리를 지나거나 선택할 줄이 없는 그림·문단은 절 전체를 선택한다. 클릭은 하나, Shift/Cmd/Ctrl은 추가·제외, 빈 곳 클릭과 Escape는 선택 해제다. 선택할 때만 같은 머리 높이에 N개 선택·삭제·AI 참조를 표시한다. Delete/Backspace로 삭제하고 undo를 제공한다. 절 머리에서 끌기는 순서 변경이며 선택이 아니다. 참조는 선택한 원본 ID·근거·기간을 보존한다. → 실패: 절을 카드 안 카드로 감싸거나 checkbox가 생기거나 선택 evidence ID·기간이 AI 참조에서 빠지면 실패
- 현재: `apps/wake/pages/incident-report.js:81`의 AI 참조 동작은 선택 label의 앞 80자를 전송한다.
- 차이: 선택 줄의 evidence ID·절대 기간이 참조에서 빠진다. → TASK-A3-REP-004
- 고정 장치: 고정 없음 → TASK-A3-REP-004
- 출처: D00637 D00678; D00884 D00885 D00887 D00925 D00943 D00948; R-062; U00663 원문.

## FLOW-REP-005: PDF·Markdown·채널·Excel

- 목표: 입력: incident 보고서의 수치·근거 절을 편집한 뒤 PDF·Markdown·채널·Excel 출력을 선택한다 → 기대: 화면/PDF/Markdown/채널은 편집 후 같은 문서 상태의 수치·절·근거·링크를 쓴다. PDF는 A4 흰 종이에 검은 글자, incident 번호를 포함한 제목 쪽머리, 쪽 번호·절 번호를 쓴다. 표 머리를 반복하고 행 분할과 고아 제목을 금지하며 그림·캡션·출처를 같은 쪽에 둔다. 인쇄 전 종이 폭으로 다시 계산한다. 알약·chevron·버튼·checkbox는 출력하지 않는다. 차트는 공통 static의 축·범례·임계선·단위·연도·캡션·구간·step·source를 사용한다. 표는 머리와 행으로, 긴 원문은 행 키가 있는 전체 발췌로, 로그는 줄 번호·일치 강조·생략 줄·조회·출처로, AI 해석은 관측/해석/기준/확인/미확인/판정과 근거 번호로 바꾼다. Markdown은 같은 절·표·코드·캡션·각주다. 채널용 5~8줄은 생성·복사만 한다. Excel 출력도 제공한다. (기본값 채택, 번복 가능) OPEN-PF-012: 요약·타임라인·근거·조치·복구 조건을 시트로 나누고 모든 행에 incident ID와 원본 링크를 보존한다. → 실패: 출력 값이 편집 전 상태이거나 Excel이 없거나 PDF에서 표 행·그림 출처가 잘리면 실패
- 현재: `apps/wake/pages/incident-report.js:88`의 출력 동작은 PDF·편집된 Markdown·초기 doc.channel을 사용한다.
- 차이: Excel 출력이 없고 채널 복사는 편집 후 report.state가 아니라 초기 doc.channel을 사용한다. → TASK-A3-REP-005, TASK-A3-REP-006
- 고정 장치: 고정 없음 → TASK-A3-REP-005
- 출처: D-USR-2026-11-16-7; D00740 D00884 D00885 D00941 D00942 D00943 D00948 D00949; R-061.
