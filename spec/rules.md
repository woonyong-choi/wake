# 주제별 정본 규칙

공통 값·조건·실패 판정은 이 문서와 FLOW-APR-001에서만 정의한다. 영역 문서는 정본 ID와 화면별 입력·출처·예외·현재 구현 차이를 연결한다. 원문 인용, 코드 발췌, 과거 측정은 목표 정의가 아니다. 정본으로 옮긴 것은 문서 계약이며 구현 완료를 뜻하지 않는다.

<a id="RULE-STATE"></a>

## RULE-STATE 상태 정의와 판정

출처: SCR-STATES, D00451, D00454, D01027, D01031, D01032. 서비스 내부 SourceState enum은 화면 상태와 별개이며 아래 판정으로 변환한다. 판정 단위는 대상 UID·출처·질의·절대 구간이다. 대상·출처·질의나 선택 구간이 바뀌면 이전 성공값을 제거한다. 상대 프리셋을 유지한 채 now만 이동하는 재조회는 같은 논리 구간으로 본다. 이 예외에서도 보존한 값의 실제 from/to와 마지막 데이터 성공 시각은 바꾸지 않으며, 구간 선택의 정규화는 RULE-RANGE를 따른다. cancelled·identity_changed·unconfigured는 이전 값을 계승하지 않는다.

| 화면 상태 | 입력·판정 | 표시 | 실패 조건 |
|---|---|---|---|
| 정상 | 권한 있는 요청의 유효한 성공 응답 | 실제 값·단위·대상·관측 시각. 실제 0은 0 | 결손이나 실패를 정상 수치로 생성 |
| 불러오는 중 | 최초 요청 또는 같은 대상의 재조회 진행 | → RULE-SKELETON | 다른 대상의 이전 값 재사용 |
| 빈 값 | 성공한 요청에 결과 없음 | 표 머리·빈 행·차트 축 유지, 결측 셀과 점은 비움. N/A·대시로 채우지 않음 | 오류·권한 거부를 성공 빈 결과로 치환 |
| 오류 | 설정된 출처의 timeout, 요청·파싱·서버 실패 | 실패 범위·원인·재시도. timeout만으로 미연결로 바꾸지 않음 | catch의 null/[]를 정상 빈 값으로 표시 |
| 권한 없음 | 403 또는 명시적 정책 거부 | 거부된 verb/resource/group/namespace와 권한 보기, 허용된 영역 유지 | 연결 안 됨이나 정상 0건으로 표시 |
| 오래됨 | 같은 대상의 마지막 성공값이 있고 최신성 기준을 넘었거나 후속 조회 실패 | 이전 값·실제 마지막 성공 시각·stale 사유. 후속 오류/403은 원인으로 함께 표시 | 요청·probe 시각을 데이터 성공 시각으로 덮음 |
| 연결 안 됨 | 서비스 호스트 부재, 미설정, 명시적 연결 해제 또는 연결 자체의 부재가 확인됨 | 필요한 출처와 연결 경로, 수치는 비움 | 발견·저장 기록만으로 연결 성공 표시 |

부분 실패는 여덟 번째 상태가 아니다. 성공한 영역은 유지하고 실패한 출처에 위 상태를 각각 적용한다. 마지막 성공값이 없는 timeout은 오류다. 같은 대상의 이전 성공값을 유지하는 timeout은 오래됨과 timeout 원인을 함께 표시한다. 인증·권한 거부 원인은 stale 뒤에도 숨기지 않는다. 대상이 바뀌면 이전 성공값을 계승하지 않는다.

로컬 설정·메뉴는 저장값, 진행, 입력 없음, 저장 실패, 정책 거부, 열린 뒤 대상 변경, 필요한 호스트 부재를 위 판정에 대응한다. 순수 로컬 행에 연결 표시를 추가하지 않는다. 최신성은 수집주기 I의 마지막 데이터 성공 t0에서 2I를 초과하면 stale이다. t0+2I는 아직 경계를 넘지 않았고 +1ms부터 오래됨이다. Lease는 leaseDurationSeconds를 우선한다. on-demand 출처는 마지막 데이터 성공 뒤 60초 초과를 채택 기본값으로 사용한다. probe 성공으로 해제하지 않고 실제 새 데이터 성공으로만 해제한다. 출처: CON-024.

GitOps도 출처의 조회 방식으로 분류한다. 알려진 poll 주기는 위 2I 경계를 적용하며 두 번째 예정 시각 자체를 실패 확정으로 세지 않는다. 주기를 모르는 poll은 신선도 미판정이고, 주기가 없는 on-demand와 다르다. 마지막 성공이 있는 on-demand는 t0+60초에는 경계 안이고 t0+60초+1ms부터 오래됨이다. 실제 요청 실패는 경과 경계와 별도로 위 상태표를 적용한다.

- 현재: `apps/wake/data/read-state.js`의 질의·구간·UID 판정과 요청 세대 가드를 홈·알림·이벤트·로그·출처 상태 읽기에 적용한다. 홈은 출처 갱신과 지표 완료 때 모두 UID를 대조한다. 알림은 새 요청 시작 뒤 옛 응답의 값·phase·출처 반영을 거절한다. 리소스 목록은 본문뿐 아니라 사용량·종류·namespace에도 기존 요청 세대를 적용한다. GitOps 본 조회는 겹친 요청 하나를 공유하고 보조 자료는 최초 한 번 읽는다.
- 차이: 묶음 1의 UID 교체·역순 응답은 실제 페이지 함수에 합성 입력을 넣어 확인했다. 나머지 전 화면 조합은 TASK-D-23, 실제 UID 교체는 TASK-D-25, 이번 변경의 Electron 확인은 H-009에 남는다. 실제 알림 목록의 실패 보존과 화면 검수로 승격하지 않는다.
- 고정 장치: `apps/wake/pages/source-state-pages.test.mjs`의 home_source_uid_change_invalidates_saved_and_inflight_series, alerts_late_success/failure_cannot_replace_new_values_phase_or_sources, source_lines_reversed_reads_keep_latest_source_state, resource_list_late_usage_failure_cannot_erase_new_values, resource_list_reversed_auxiliary_reads_keep_latest_kinds_and_namespaces, logs_late_pod_failure_cannot_replace_new_page_phase, events_late_related_read_cannot_replace_new_timeline, home_reversed_summary_and_source_reads_keep_latest_snapshot, gitops_overlapping_retries_share_one_read_and_keep_its_result. 기존 구간 변경·취소·권한 실패·복구 시험도 유지한다. 실행은 [묶음 1 수정](tasks.md#batch1-fixes)이다.

<a id="RULE-TONE"></a>

## RULE-TONE 상태·심각도·숫자 톤

출처: 옛 화면 규칙의 상태·심각도 규칙을 4·5절보다 우선한다. 나머지 역할 토큰은 4·5절을 따른다. 함께 대조한 출처는 옛 결정 문서 상태 표시, polish decisions.md:59, D00338, D01008, D01033, D01034. 색은 kit와 앱의 역할 토큰을 사용하며 두 테마에서 의미를 유지한다.

| 의미 | 표시·색 | 실패 조건 |
|---|---|---|
| 정상 ok | 공통 아이콘만, 접근성 이름 유지 | 일반 리소스에 상시 정상 글자 추가 |
| 진행 busy | 회전 아이콘과 흐린 글자 | 실제 진행을 정지한 상태로 표현 |
| 경고 warn | 아이콘과 warning-content 글자. 밝은 테마 amber-700, 어두운 테마 amber-400 | 임의 중립색으로 경고 소실 |
| 오류·위험 error/danger | 아이콘과 destructive-content 글자, 빨강 | 경고와 같은 역할로 혼합 |
| 오래된 GitOps 행 | 기존 idle 시계 아이콘과 원문 Sync·Health 글자. 표 위에는 마지막 데이터 성공 시각과 실패 원인을 한 줄로 표시 | 오래된 Synced·Healthy를 현재 정상 아이콘으로 표시하거나 새 모양 추가 |
| 중립 idle·권한 거부 | 빈 원 또는 권한 자물쇠, 중립 톤 | 권한 부재 자체를 장애 위험색으로 표현 |
| 알림 상태 | firing은 오류, pending은 진행, resolved는 정상 역할의 상태 아이콘·글자 규칙 적용 | 심각도로 상태 톤을 바꾸거나 pending을 경고로 표시 |
| 심각도 분류 | 원문 분류를 심각도 열의 글자로 표시. 별도 분류색·상태 아이콘 없음 | 심각도에 상태색을 배정하거나 상태 열과 혼합 |
| 인시던트 반복 분류 | `반복 ×N`을 흐린 글자로 표시, 배지 바탕 없음 | 반복 횟수에 배지 바탕을 넣거나 실제 횟수 누락 |
| 숫자 주의 신호 | 숫자 열 셀 전체에 해당 톤만 적용, 상태 아이콘 없음 | 숫자와 상태 아이콘 혼합 또는 셀 일부에 임의 별도 톤 |

색은 상태로만 정한다. 일반 상태의 정지 허용은 할 일 없는 대기와 정상 연결 표시뿐이다. 실행·대기·감시 중은 상태 움직임을 유지한다. 경과 시간을 표시하는 진행 상태는 1초 단위로 갱신한다(옛 결정 문서 옛 작업 노하우). 샌키의 별도 모션은 → RULE-SANKEY다. 심각도의 선택 정렬은 → RULE-SORT. Restarts 적용은 → RULE-RESTARTS. 열 종류는 text·number·status·time·mono다. 상태와 수량은 Ready·Status처럼 별도 열로 나누고 n/n 대신 Ready 2 · Desired 3처럼 이름 붙은 값을 쓴다. 사용량 진행 막대를 추가하지 않는다. 상태 부품은 배지 바탕이 없다. 일반 리소스 상태는 이름·제목 인접 위치에 한 번만 표시한다. 연결·설정 행은 끝 상태 슬롯과 성공 직후 잠깐의 연결됨 표시가 승인된 예외다. 위험 권한 표시의 주황은 밝은 테마 orange-600, 어두운 테마 orange-400이다.

- 현재: H-004에서 statusIcon의 일반 ok+text는 접근성 이름만 남기며, 기존 작업 등급·검증 대상 이름은 subject로 보존한다. `apps/wake/pages/gitops.js`의 staleCell은 기존 statusIcon의 idle·clock을 재사용한다. k8sLine과 출처 줄은 중복 출력하지 않는다.
- 차이: 이 변경은 다른 리소스 행의 상태 표시를 바꾸지 않는다. 실제 OS 창 합성은 H-003 2차 검증 범위 밖이다.
- 고정 장치: `apps/wake/pages/source-state-pages.test.mjs`의 gitops_forbidden_reread_keeps_applications_and_recovery_replaces_them은 잠금 줄 하나, 정상 아이콘 제거, 원문 상태 보존을 확인한다.

<a id="RULE-SORT"></a>

## RULE-SORT 표 정렬

출처: D-USR-2026-11-16-1·2, CMP-TABLE-05, SRE-T-ALERT. 심각도 순서는 별도 사용자 결정이 없는 세부에 대한 SRE 기본값이다.

| 구분 | 비교 순서·조건 | 실패 조건 |
|---|---|---|
| 리소스 기본 | danger → warn → 문제 없음. 각 묶음에서 namespace → name → UID 오름차순 | API 응답 순서 유지 또는 임의 심각도 삽입 |
| 이력 기본 | 이벤트·알림·감사·AI 기록의 원시 시각 내림차순 → 불변 키 오름차순 | 상태·심각도가 시각 또는 동점 키보다 먼저 적용 |
| 사용자 선택 | 숫자는 원시 수치, 시각은 epoch, 문자열은 locale 독립 Unicode 코드포인트. 선택한 열·방향을 우선하고 동점은 불변 키 오름차순 | 표시 문자열로 숫자·시각 비교 또는 동점 흔들림 |
| 심각도 선택 | 오름차순은 critical → high → warning → medium → low → info → none → unknown. 내림차순은 역순. 미등록 분류는 unknown 묶음에서 원문·불변 키로 구분 | 문자열 알파벳순 적용 또는 사용자 선택을 이력 기본순 금지로 거절 |
| 결손 | 오름·내림 모두 마지막, 결손끼리는 불변 키 | null을 맨 앞 또는 0으로 정렬 |

기간 → namespace → 검색 → 상태 필터를 명시적으로 조합한다. 정렬은 필터를 반영한 전체 모집단에 적용한 뒤 페이지를 자른다. 건수와 표시 행은 같은 모집단이며 전체 요약은 별도 모집단임을 표시한다. 필터 변경 시 페이지를 보정하고 pager는 같은 카드의 표 아래에 둔다. 검색은 정확 일치 → 접두 → 포함, 같은 등급 안에서 danger → warn → 나머지 → kind → namespace → name → UID다. 현재 대응 인시던트는 미해결 → 해결, 각 묶음에서 위 심각도 선택의 오름차순 → 감지 시각 내림 → incident ID다. 비용은 같은 통화·기간의 total 내림 → allocation ID다. Reason 집계는 Warning → count 내림 → Reason/묶음 키, 보고서 서술은 발생 순이다. 이 예외들은 D-USR-2026-11-16-7의 채택 기본값이며 완료 이력은 이력 기본순을 따른다. 모든 열 머리와 값은 왼쪽 정렬하며 숫자는 tabular-nums다. 머리는 공통 글꼴이고 해시·ID 값만 고정폭이다. costs의 align:right는 dataTable이 소비하지 않는 속성으로 실제 오른쪽 정렬 결함의 근거가 아니다.

- 현재: H-004의 `apps/wake/data/table-order.js`가 Unicode 코드포인트·문제 등급·원시 시각·불변 키를 비교한다. 리소스 목록과 관련 Pod는 제한 전에, 알림·감사·동기화·실행·오류 기록은 표시 전에 적용한다. 네트워크·GitOps의 문제 등급은 기존 상태 판정을 사용한다. H-004-R1에서 비용의 이름·같은 총액·결손끼리 정렬도 공통 compareText로 바꿨다.
- 차이: 모든 사용자 선택 정렬과 실제 빈 공급자 표까지 이번 실행으로 검증한 것은 아니다. 네이티브 대상별 결과와 남은 범위는 [H-004 실행 판정](tasks.md#H-004-run)이다.
- 고정 장치: `table-order.test.mjs`, `resource-pages.test.mjs`, `resource-inspector.test.mjs`, `tool-surfaces.test.mjs`, alerts·gitops-view·network 시험의 역순·동점·제한 전 정렬 반례. `apps/wake/pages/costs.test.mjs`의 costs_name_uses_codepoint_order, costs_equal-total_uses_codepoint_order, costs_missing-total_uses_codepoint_order.

<a id="RULE-WIDTH"></a>

## RULE-WIDTH 표 열 폭

출처: CMP-TABLE-04, B-017·018, D00447, D01030, D01033. 초기 선언은 최종 렌더 폭이 아니다. 각 표의 열별 선언은 해당 열 ID의 예외 입력으로만 둔다. 공장은 fit을 요청하며 초기 폭은 호출부마다 다르다.

| 항목 | 값·조건 | 실패 조건 |
|---|---|---|
| Restarts 초기 선언 | `restartsColumn` 자체에는 폭 없음, `fit:true`. resource-detail은 space-16, incident-detail은 space-16+space-2, resource-list는 c.width, inspector는 short를 전달 | 초기 값만 보고 현재 잘림을 확정 |
| fit | 실제 머리와 최장 값의 측정 폭 중 큰 값에 1px 여유. 초기 폭보다 내용이 크면 확장 | 짧은 필수 값이 fit 후에도 잘림 |
| 최소 폭 | 이름 220px 하한은 채택 기본값이며 실제 최소 폭 검수 대상 | 긴 이름의 전문 접근 없이 삭제 |
| 좁은 폭 | 핵심 이름·상태·판단값 유지, 오른쪽 optional부터 숨김. 그래도 부족하면 표 내부만 가로 스크롤 | 페이지 전체 가로 넘침 또는 필수 값 숨김 |
| 행·전문 | 한 줄, 긴 글만 말줄임과 hover/focus 전문. kit 행 40px·subline 56px, Wake 본문 행 28px | 짧은 fit 값의 잘림을 긴 글 정책으로 허용 |

과거 B7/B1의 내용 폭 91px 측정은 당시 증거다. 현재 data-table.js:172–192에 측정·확장 경로가 있고 kinds.js:25는 fit을 요청한다. H-004의 실제 다크·라이트×1280·1680 캡처에서 현재 Pod 표의 최종 Restarts를 확인한다. 이 관측을 과거 정확한 값·760px 상세나 모든 표의 최종 폭으로 확대하지 않는다. 행 배경은 첫·끝 셀의 space-2 범위이고 카드 밖으로 번지지 않는다. hover는 dark surface-tertiary/light row-hover, 선택은 secondary다.

<a id="RULE-TIME"></a>

## RULE-TIME 시각 표시 판정표

출처: B-037, D00396, D00508, D00830, D00831. epoch는 보존하고 날짜 비교는 선택한 표시 시간대에서 한다. ‘오늘’은 실제 읽는 날이며 과거 스냅숏의 상대 나이는 snapshot 기준시각을 사용한다.

| 입력·위치 | 본문 | 툴팁·상세 | 실패 조건 |
|---|---|---|---|
| 오늘의 절대 시각 열 | HH:mm | 본문 전문 | 본문에 상대 경과를 대신 표시 |
| 같은 해 다른 날의 절대 시각 열 | YYYY-MM-DD HH:mm | 본문 전문 | 본문 연월일 누락 |
| 다른 해의 절대 시각 열 | YYYY-MM-DD HH:mm | 본문 전문 | 연도 누락 또는 다른 epoch로 변환 |
| 상세 막대 | YYYY-MM-DD HH:mm:ss | 같은 절대 시각 | 원문에 있는 초를 잃음 |
| Age·경과 전용 열 | kubectl형 45s·13m·5h·144d 또는 해당 경과 형식 | 원본 시각과 상대 계산 기준을 상세에서 확인 | 과거 스냅숏을 현재 시각 기준으로 계산 |
| 보고서 감지일의 시각 | HH:mm:ss, 캡션에 YYYY-MM-DD와 시간대 | 다른 날은 YYYY-MM-DD HH:mm:ss | 감지일 캡션 없이 날짜 생략 |
| 로그·YAML 등 원문 | 원문 보존 | 원문 보존 | 공통 UI 형식 때문에 원문 수정 |

일반 표의 본문·툴팁은 시분까지만 표시하고 초는 상세 막대에서만 보존한다. 표 툴팁에 초·시간대 표기를 추가하지 않는다. 출처: 옛 화면 규칙. 초가 없는 원문에 정밀도를 꾸며 넣지 않는다. 오늘 본문에는 연도가 없어도 정상이다. 연도 실패 조건은 다른 날 본문과 전체 시각을 요구하는 위치에만 적용한다. 알림 ‘시작’은 절대 시각 열이며 상대 시간 예외가 아니다.

고정 반례: 기준 2026-11-17 12:00 KST, 입력 2026-11-17T01:00:00Z의 알림 시작 본문은 10:00, 툴팁도 본문 전문인 10:00이다. 전날과 전년도 입력은 각각 날짜와 연도를 포함한다. 이 결과는 위 실패 조건에 걸리지 않는다.

<a id="RULE-RANGE"></a>

## RULE-RANGE 시간 범위와 전 기간 비교

출처: D00611의 제외 가능성 뒤 D00612의 구현 요청, D00615, D00806, D00826, B-028. 최신 요구는 비교 구현이며 지원 제외가 아니다.

| 입력·조작 | 기대 | 실패 조건 |
|---|---|---|
| 비교 자료 있음, 비교 탭 변경 | 비교없음·어제·지난주 선택에 맞춰 같은 대상·출처·집계의 현재 구간과 선택한 비교 구간을 조회. 어제·지난주의 실제 from/to를 보존하고 선을 겹쳐 비교. 질의·시리즈·머리 값·표·실제 절대 구간이 함께 바뀜 | 선택 표시만 변경하거나 이전 자료를 새 구간으로 재표시 |
| 비교 구간의 성공 자료 없음 | 비교 자료 없음과 실제 coverage 표시. 선택을 숨기거나 비활성화할 경우 그 사유를 표시 | 0·정상 비교·기능 삭제로 처리 |
| 비교 기능 미구현 | 구현 차이와 작업 ID 기록, 제품 검수는 미완료 | 자료 없음으로 위장하거나 지원 제외로 종결 |
| 정상 비교 | 두 구간의 같은 단위·집계·범위로 비교 결과 제공 | 서로 다른 모집단이나 집계를 같은 비교로 표시 |

공통 프리셋은 15m → 1h → 6h → 24h → 7d이며 사용자 지정도 제공한다. 한국어 표기는 15분·1시간·6시간·24시간·7일이다. D00826의 공통 통일과 kit/components/time-range.js:88의 DEFAULT_PRESETS를 따른다. D00826은 D00108의 비용 전용 선택 목록을 대체한다. 비용의 초기값 7d는 D00108대로 유지하며 별도 프리셋 예외는 없다. 로그도 같은 집합을 사용하며 한 요청의 최대 구간은 프리셋 목록을 제한하지 않는다. 신호 화면 초기값은 1h, 기록 화면은 7d이며 화면의 승인 예외만 달리한다. 사용자 지정은 절대 from/to와 시간대를 보존하고 화면·내보내기·AI 근거에 같은 구간을 넘긴다. 선택 해제·이동은 기간 알약 안에 두고 상태별 오른쪽 여백을 유지한다. 과거 자료가 없으면 현재 값으로 채우지 않는다. 조회 기간은 → RULE-RETENTION의 보관 기간과 별개다.

상대 프리셋의 동일성은 preset으로 판단한다. 사용자 지정의 동일성은 from·to·live로 판단하며, live가 참인 같은 선택에서 now만 이동한 경우도 동일한 논리 구간이다. 고정 절대 구간에서 시작이나 끝이 바뀌면 다른 구간이다. 상대 구간의 후속 실패는 마지막 성공 응답의 절대 구간을 그대로 표시한다. 다른 프리셋·질의·사용자 지정 구간의 이전 값으로 새 선택을 채우면 실패다. 보존과 제거의 상태 판정은 RULE-STATE를 따른다.

- 현재: `apps/wake/data/read-state.js`의 readIdentity가 위 선택을 정규화한다. 홈·네트워크는 이전 성공 질의 키를 요청 키와 대조하며, 실패 상태에서도 다음 구간 선택과 재시도를 허용한다.
- 차이: H-003 2차는 조회 실패의 구간 보존 경계만 고정한다. 전 기간 비교의 다른 구현 차이는 각 화면 작업에 남는다.
- 고정 장치: `apps/wake/pages/source-state-pages.test.mjs`의 홈·네트워크 changed_range_failure_drops_old_values_and_can_retry, `kit/tools/capture-range.test.cjs`의 capture_range_rejects_15_minutes_selected_with_a_60_minute_chart.

<a id="RULE-CHART"></a>

## RULE-CHART 차트 축과 모션

출처: CMP-CHART-01·03·04·LIVE·AXES, B-013·029. 차트는 실제 관측과 단위를 그린다. 빈 배열은 축만, 한 점은 한 점, null·비유한 값·maxGapSeconds 초과는 끊긴 선이다. 없는 점·선·0을 생성하면 실패다.

| 입력·조작 | 기대 | 실패 조건 |
|---|---|---|
| 일반 모션의 라이브 유효 시리즈 | 새 표본 시각에만 추가, 각 시리즈 마지막 유효 진한 구간에 브리딩. 최초 진입은 아래에서 위로 차오름 | 시계만으로 점 추가, 끝 점만 강조, 갱신마다 최초 모션 재생 |
| 고정 과거·reduced-motion·유효 구간 없음 | 과거 축과 값 고정, pulse/브리딩 중지 또는 축소 | 과거 구간이 실시간처럼 이동 |
| 차트 hover/focus | plot을 우상단으로 축소·이동해 X/Y축 표시 공간 확보, 라벨 실제 폭 사용 | 축 clip 또는 plot 자리를 만들지 않음 |
| 시각이 확인된 재시작·Warning | 같은 대상·시각에 이벤트 표식과 근거 접근 | 다른 Pod·시각에 표시하거나 알려진 이벤트 누락 |
| full X/Y축 드래그 | X 오른쪽·Y 위쪽은 범위 축소. 실제 from/to·척도와 표시 일치 | 표시만 변경 |
| 복원·키보드 | X 더블클릭은 이전 구간, Y 더블클릭은 데이터 맞춤. −/+·Shift+방향키·0, 관측 탐색 방향키·Escape 제공 | 다른 범위 복원 또는 초점·선택 해제 불가 |
| 미니 차트 wheel | 페이지 스크롤, reset-zoom 버튼 없음 | 차트가 휠을 가로채 확대 |

크기는 --chart-aspect=.4, 시계열 높이 160~360px, 범주형 최대 240px, 축 글자 11px와 축 굵기 역할 토큰을 쓴다. height=880 입력도 높이 상한 안에 둔다. 축의 시각 형식은 → RULE-TIME. 샌키는 → RULE-SANKEY의 별도 모션 계약을 적용하며 과거 차트의 정지를 확대 적용하지 않는다.

<a id="RULE-SANKEY"></a>

## RULE-SANKEY 샌키 흐름

출처: B-031, 2026-11-13의 샌키 채택 규칙(wake-sankey-accepted), 2026-11-14의 아이콘 안쪽 색 지적(wake-ui-decisions), D00811, D00816, D00821, D00833, D00836, D00838, D00862, D00872, CMP-FLOW-MOTION. 관계 타일형과 트래픽·저장소·비용 막대형은 같은 공통 부품의 승인 변형이다.

| 입력·조건 | 기대 | 실패 조건 |
|---|---|---|
| 표시 범위 초과 | 열당 상위 6개와 기타 1개, 실제 수·최악 상태 보존. 기타는 필터된 실제 목록으로 이동 | 열당 7개 초과 또는 가독성을 위해 수 조작 |
| 문제 중심 보기 | 최소 띠 4px는 2026-11-13 사용자가 받아들인 샌키 규칙. 전체 보기 복귀 경계 80%만 채택 기본값 | 작은 문제 띠 소실 |
| 이름·툴팁 | 이름 최대 2줄, 말줄임 없음. 이름은 자기 타일 아래, 띠가 지나지 않는 자리. 한 줄이면 띠가 지나는 이름은 띠가 비운 폭에서 두 줄로 접히고 아래 노드가 그만큼 내려감. 툴팁 상위 10개와 나머지 수 | 이름 누락 또는 나머지 대상 접근 불가, 띠가 이름을 가로지름 |
| 연결 끝·분기·합류 | 띠 끝 스택이 노드 변을 빈틈없이 채움. 숫자가 부족하면 툴팁으로 이동. 바깥 끝은 둥글고 내부 경계 중복선 없음 | 숫자 때문에 끝 축소, 틈·clip·별도 흰 선 |
| 동일 입력 반복 | 노드·띠 좌표 유지. 값 변경 때 기존 순서와 값에 따른 위치 변화만 허용 | 왕복 이동·무관한 재정렬·맥동 이동 |
| 일반 모션, 실패·대기 포함 | 출발→도착 상태색 그라데이션의 띠 흐름 지속. 노드 아이콘 안쪽 색은 흐르는 띠 색을 따름. 경고·실패 외곽선·아이콘 강조는 같은 시계 | 띠 정지, 강조 시계 불일치 |
| 로드·새로고침·상태 변화 | 타일·아이콘 크기 유지. 정상 타일 바탕·외곽은 승인된 중립 표현. 상태 표현은 흐름·아이콘·허용된 외곽 강조 | 노드나 아이콘 확대·축소, 금지된 노드 바탕 채움 |
| reduced-motion | 좌표·값·색 의미 유지, 반복 움직임 축소 | 의미·값까지 제거 |

hover는 해당 노드·연결 강조와 나머지 흐림만 사용하고 갈 곳 없는 노드는 클릭·커서 변화를 주지 않는다. 통신량을 관측하지 않은 소유·selector·EndpointSlice 관계를 확정 트래픽으로 표현하지 않는다. 차트 plot의 축 전환은 → RULE-CHART이며 샌키 분기 geometry와 한 실패 문장으로 묶지 않는다.

<a id="RULE-APPROVAL"></a>

## RULE-APPROVAL 승인과 실행

출처: FLOW-APR-002·003·004, D00466, D00473, D00648, D00742, D00869, D00912, D00965, D00966. 조치 경로의 유일한 판정표는 → [FLOW-APR-001](flows/approval-execution.md#FLOW-APR-001)이다.

제안은 approval ID·incident·requester·transport·model·target·불변 plan hash/base·요청 시각을 저장한다. 사람은 대상 UID·cluster, 모든 변경 전후 값, 영향·위험·근거·경로를 보고 질문 패널에서 허용하고 실행 또는 거절한다. 항상 허용은 없다. 외부 AI도 같은 패널로 모으고 외부에서 결정을 확정하지 못한다. 패널이 열린 동안 입력한 답은 메시지로 보내며 제안은 거절로 남긴다.

첫 결정의 actor·permission·time을 자동 감사한다. 중복 결정·재전송은 같은 결과를 반환하고 실행을 중복하지 않는다. 대상 UID·소유 관계·변경 전 값·계획이 바뀌면 재검증하고 새 승인을 받는다. 바뀐 계획에 옛 승인을 쓰면 실패다.

허용과 실제 실행은 다른 기록이다. PR은 실제 번호·URL·상태를 받은 뒤 생성 완료다. API 실패는 승인 허용과 실행 실패를 함께 남긴다. 수동 command/Helm은 복사·사람 실행·원본 변경 확인을 분리한다. 외부 조치도 요청·실행자/티켓·관측 회복을 각각 남긴다. receipt 없이 실행자·적용 시각·성공을 만들거나 승인/복사를 적용으로 표시하면 실패다. 실행 뒤 같은 incident의 → RULE-RECOVERY 관찰로 돌아간다. 거절은 조사 대상·대화를 지우지 않으며 새로운 변경은 별도 승인이다.

<a id="RULE-RETENTION"></a>

## RULE-RETENTION 보관 기간

출처: D-USR-2026-11-16-4. 감사·근거·인시던트·승인·알림·source-checks 기본 보관은 90일, 대화는 365일, Event는 7일이다. 대화의 선택값은 90일·365일·영구다. 미해결 인시던트와 참조 근거는 해결 뒤 90일까지 보호한다. 조회 기간·삭제 TTL·실제 수집 coverage를 구별하며 원본 보관이 더 짧으면 실제 coverage를 표시한다.

기본 설정에서 8일 전 Event와 91일 전 감사는 보관 밖이고 91일 전 대화는 남는다. 대화를 공통 prune으로 삭제하거나 없는 과거 자료를 현재 값·0으로 채우면 실패다. 보관 밖·미수집·권한 실패는 같은 자료 없음 사유로 합치지 않는다.

허브 저장소 묶음별 기간(등급·크기 상한·저장 금지는 [data-policy.md](data-policy.md#DP-CLASS)):

| 묶음 | 기간 | 기준 시각 |
|---|---|---|
| incidents | 해결 뒤 90일. 열린 동안 보호, 클러스터 삭제 뒤에는 그 시각부터 90일 | resolvedAt, 단계 없는 옛 행은 at |
| evidence, audit, approvals | 90일. 그 인시던트가 남아 있으면 함께 남음 | at |
| conversations | 365일(선택 90일·365일·영구) | at |
| alert-history, source-checks | 90일 | at |
| events | 7일 | at |
| tool-catalog | 7일 | at |
| meta, ai-prefs, ai-clients, ai-server | 기간 없음 | 해당 없음 |

- 현재: `apps/wake/desktop/data-policy.cjs:19`의 POLICY가 묶음별 기간을 선언하고 `apps/wake/desktop/hub-store.cjs:57`의 cutoff(name)가 그 기간과 `settings.json`의 `wake.archive.keep`을 읽는다. 기본값·기존 선택값은 위 정본과 같으며 각 prune에서 다시 읽는다. 설정 파일 읽기 실패나 손상 시 대화 정리를 건너뛴다. 활성·보관 대화 모두 마지막 대화 저장 시각 at을 기준으로 하며 보관·복원은 at을 늘리지 않는다. `:71` anchorOf가 열린 인시던트를 보호하고 `:79` keepRow가 남은 인시던트의 근거·감사·승인을 지킨다. `apps/wake/desktop/reads/index.cjs`는 같은 저장소 정책을 쓰고 source-checks 읽기도 저장 기간에 맞춘다.
- 차이: H-001-F3의 종류별 기간·설정 연계와 미해결 인시던트·참조 근거 보호는 격리 저장소 시험을 통과했다. 실제 coverage 계산은 TASK-F-17에 남는다. Electron 설정 조작은 사용자 지시로 미검증이다.
- 고정 장치: `apps/wake/desktop/hub-store.test.cjs` — prune_default_keeps_conversations_365_days_events_7_and_other_records_90, prune_uses_saved_conversation_selection_on_restart_and_each_cleanup, source_checks_read_uses_same_retention_as_persisted_records. `apps/wake/desktop/data-policy.test.cjs` — cache_rows_past_ttl_are_purged_while_archive_rows_follow_their_incident, incident_counter_is_configuration_and_never_pruned, incident_archive_keeps_referenced_snapshot_after_catalogue_purge. `apps/wake/app.config.test.mjs` — policy_controls_without_consumers_are_disabled_but_appearance_remains_available.

<a id="RULE-RECOVERY"></a>

## RULE-RECOVERY 복구 판정

출처: D-USR-2026-11-16-3, FLOW-INC-005, CMP-INC-03. 같은 대상 UID·조건·출처를 30초마다 관찰한다. 0~300초의 최소 11개 관측이 5분 연속 정상이고 마지막도 정상일 때 복구다. 실패·누락은 연속 창과 개수를 초기화한다. 조회 실패·앱 중단도 누락이며 연속 10분 누락만 inconclusive다. UID·조건·출처가 바뀌면 창을 계승하지 않는다.

누락 전후 정상 시간을 합산하거나 10개 관측으로 복구하거나 최초 관찰 후 총 10분만으로 판정 불가를 만들면 실패다. 승인·Synced·rollout 성공·Alert 소멸·Pod Ready 하나만으로 사용자 영향의 복구를 확정하지 않는다. 같은 원인의 24시간 내 재발은 회차를 더하며 장기 원인 검증 7일 관찰은 서비스 복구와 별개다.

<a id="RULE-PERFORMANCE"></a>

## RULE-PERFORMANCE 성능 목표

출처: D-USR-2026-11-16-5, PERF-001~004·016·017. 화면 전환의 목적 화면 첫 그림은 150ms 이하, 정상 데이터 완성은 1초 이하, 시작 뒤 layout-shift 합계는 0.01 이하, 빈 창·빈 칸은 0이다. 측정 시작·첫 paint·응답 완성을 따로 기록한다. 이전 화면 유지 시간을 목적 화면 첫 그림으로 세거나 실패 응답을 정상 데이터 완성으로 세면 실패다. 사용자 접힘 보존은 → RULE-FOLD, 초기 표시 자리는 → RULE-SKELETON이다.

성능의 추가 채택 기본값은 lab IPC p95 50ms 이하, 유휴 main CPU 1% 이하, event loop 지연 p99 20ms 이하, 전환 첫 1초의 50ms 이상 프레임 0개(정확히 50ms도 실패), 같은 대상·인자의 동시 원본 요청 중복 0, 회수되지 않는 자원 누수 0이다. source hash·동일 입력·연결 클러스터·열린 탭·갱신 주기와 표본 수·측정 구간을 고정한다. 단일 시행을 p95로 부르거나 평균으로 초과값을 숨기면 실패다.

저장 크기 목표는 동일 원자료의 90일분을 기준선의 1/5 이하로 압축하는 것이다. 인덱스·메타데이터·임시 조각을 포함한 파일 byte 합을 비교하며 필드·정밀도·조회 결과·근거 hash·감사·마스킹·복구 조건을 보존한다. 삭제·TTL 축소를 압축 성과로 세면 실패다. 실제 종류별 삭제 TTL은 → RULE-RETENTION이며 이 비교의 고정 표본 기간과 별개다. 출처: PERF-005~008, F-BE-P07, OPEN-PERF-006의 채택 추천안, D-USR-2026-11-16-7.

<a id="RULE-AI"></a>

## RULE-AI AI 경계

출처: C-002, PRD-003, SEC-001·014, FLOW-APR-002. AI는 기본 읽기·분석·제안만 한다. 모델 응답과 외부 MCP 자료는 신뢰할 실행 지시가 아니다. 변경은 → RULE-APPROVAL의 사람 승인·고정 계획을 통과해야 하며 모델이나 외부 클라이언트가 승인을 대신하지 못한다. 실제 읽은 대상·출처·시각·근거만 인용하고 추론과 관측을 구별한다. 모델 미연결·도구 실패를 성공 답변으로 만들면 실패다. 민감 자료는 → RULE-SECRET, 근거 이름표는 → RULE-EVIDENCE를 따른다.

한국어 최종 AI 답변은 합니다체의 완결된 서술 문장을 사용하고 라벨은 명사로 쓴다. 원문 인용·코드·표 값은 답변 문장과 구분해 보존한다. 답변 본문을 한다체나 `~함` 메모체로 출력하거나 문체를 미결로 돌리면 실패다. 출처: D00748, wake-ui-decisions의 2026-11-12 결정, 2026-11-17 스펙 정본 10차 확정 지시.

<a id="RULE-SECRET"></a>

## RULE-SECRET Secret 경계

출처: SEC-003·004, C-003, D-01 A, D00979~D00982. Wake의 계정은 Secret get/list/watch 권한을 갖지 않는다. 화면 IPC·허브 도구·에이전트·도구 자격 발급은 Secret API 호출 전에 거절한다. PartialObjectMetadata 요청이나 수신 뒤 마스킹은 대안이 아니다. 관리자 Secret으로 도구 로그인하는 경로도 금지한다. Secret 종류는 권한 없음으로 표시하고 이름·키 수·TLS 만료일·본문·YAML을 읽을 수 있다고 주장하지 않는다.

Helm은 일반 리소스의 meta.helm.sh/release-name·release-namespace, app.kubernetes.io/managed-by=Helm, 존재하는 helm.sh/chart로 릴리스 이름·namespace·chart·소속 리소스만 만든다. revision·status·이력은 권한 범위 밖(Secret)이며 values나 diff를 정상 빈 값으로 꾸미지 않는다. 별도 publisher가 대신 Secret을 읽는 우회도 허용하지 않는다.

메타데이터 요청만 하는 현재 경로와 RBAC 권한 차단은 별개다. RBAC가 list/get을 허용하면 값까지 받을 수 있는 권한이 있다는 차이를 기록한다. 정상·과도 권한 합성 클라이언트 모두 Secret 네트워크 호출 0과 forbidden, 전용 reader·agent의 get/list/watch 권한 no를 각각 확인한다. 마스킹 여부와 무관하게 원본 API를 호출하거나 권한 차단을 검증 없이 주장하면 실패다. 이 경계는 실행 승인으로 해제되지 않는다. 비밀을 검수 출력에 남기지 않는다.

<a id="RULE-PANE"></a>

## RULE-PANE 칸 모서리와 여백

출처: B-004·007, D01010~D01017, D01028. 분할 칸 외곽은 16px 원형, 사방 여백은 8px, 옆 칸 행은 8px 원형이다. 페이지 면은 23px 원형이다. superellipse 역할만 기준값에 1.4를 곱한다. 바깥 반경 R과 안쪽 여백 p에서 p<R이면 안쪽 반경은 R−p 이하이며 p≥R이면 독립 카드의 승인 반경을 유지한다.

R=16,p=8에서 안쪽 반경이 8을 넘거나 R=16,p=20의 독립 카드 반경 23을 강제로 평평하게 만들면 실패다. 사이드바를 접어도 왼쪽 여백을 복원하고 긴 본문 끝의 모서리·마지막 행을 스크롤로 읽을 수 있어야 한다. 본문·상세·AI 순서의 최대 세 칸, 맨 오른쪽 AI와 각 칸의 이력·스크롤을 보존한다. 설정 묶음과 승인 코드는 승인된 별도 면 예외이며 임의 중첩 카드를 만들지 않는다.

역할표의 출처는 옛 화면 규칙이다. 모든 border-radius는 아래 역할 토큰을 쓰며 flow-graph 타일의 그림 계산은 예외다. 옆 칸 톤(AI 대화·사이드바·설정)은 역할을 옮겨도 승인된 픽셀과 원형 모서리를 유지한다. 아래 기준값에 superellipse를 적용하는 역할만 위 배율을 곱한다.

| 역할 토큰 | 기준값 | 적용 대상 |
|---|---|---|
| `--r-surface` | `--sbar-h / 2 + --line` | 페이지의 요약 막대·카드·알림·토스트·질문 패널·코드 보기 |
| `--r-panel` | 12px | 메뉴·선택 목록·팝오버·툴팁·시간 범위·팔레트, 설정 묶음·AI 카드 |
| `--r-dialog` | 16px | 대화상자·composer·큰 시트 |
| `--r-control` | 8px | 버튼·입력·검색·선택·폼 세그먼트·그릇 안 코드 보기 |
| `--r-control-sm` | 6px | 컨트롤 안 아이콘 버튼·세그먼트 표시·탭 칩 |
| `--r-row` | 8px | 메뉴·사이드바·표의 행 표시; 옆 칸은 `--r-row-side` 원형 |
| `--r-chip` | 4px | 태그·배지·kbd·작은 칩, link 버튼의 호버·초점 면 |
| `--r-mark` | 2px | 체크박스·범례·글자 강조 |
| `--r-pill` | 완전 둥긂 | 도구 줄 검색·선택·알약 탭·칩 |
| `--r-round` | 완전 둥긂 | 아바타·점·스위치 |
| `--r-window` | 16px | 앱 창 본문 카드 |

고정 장치는 `kit/tools/unused-check.mjs`의 역할 밖 반경 검사와 `kit/tools/check-surfaces.mjs`의 선택자별 computed 반경·corner-shape 대조다. 문서 이관은 이 기대값을 바꾸지 않는다. H-004 실제 캡처에는 같은 검사기의 결과를 연결한다. 전체 p/R 조합과 네이티브 합성 검수는 B-004·J-106의 남은 검증으로 둔다.

<a id="RULE-SIDEBAR"></a>

## RULE-SIDEBAR 사이드바 구역

출처: D00990, B-006. 순서는 클러스터 → 북마크 → 대화·인시던트 → 열린 탭이다. 대화·인시던트 안에서는 열린 인시던트가 대화보다 위에 오며 대화를 없애거나 별도 두 구역으로 나누지 않는다. 고정 탭은 위쪽의 스크롤되지 않는 타일 줄, 계정은 맨 아래다. 클러스터는 해당 홈을 열고 저장 연결만 탐색 주 대상으로 삼는다. 구역 누락·역순·다른 클러스터 이동은 실패다. 갱신은 사용자 접힘을 유지한다.

<a id="RULE-CHIPS"></a>

## RULE-CHIPS 칩 포함 규칙

출처: CMP-CHIP-01·03·LOGOS, D00775, D00992, D00999, D01000, D01006. 실제 연결·관측으로 확인된 도구와 출처만 포함하며 발견·저장 기록을 연결 성공으로 승격하지 않는다. 홈 칩은 연결된 본문, 관리 동작은 설정으로 간다. 읽기 가능한 상태라도 listed=false이면 열기 동작을 만들지 않는다. Watchdog는 출처 응답 확인용이며 장애 알림·심각도 집계에서 제외한다.

included는 연결 근거, health는 현재 읽기 결과, openable은 현재 확인된 바인딩이다. verified/not-ready receipt 또는 연결 기록은 cluster·kind·Service UID·namespace·service·port·at에 묶는다. 같은 UID의 일시적 열거 실패에는 포함을 유지하고 실패 원인을 표시한다. 성공 열거의 다른 UID 또는 사라진 receipt만 있는 도구는 제외한다. 연결 기록까지 있으면 사라진 도구를 missing으로 남기되 열기는 금지한다. 저장 receipt만 있고 현재 바인딩을 확인하지 못했으면 열 수 없다. 다른 UID에 옛 receipt를 사용하면 실패다.

공급자 로고는 실제 관측 출처만 중복 없이 묶는다. D00809가 D00776·D00780의 겹침 제안을 대체한다. 로고는 일정한 간격의 한 줄에 서로 붙거나 겹치지 않게 배치하고 넘친 항목은 +N에서 읽는다. 요약과 열린 상태에서 같은 로고 모양을 사용한다. 로고 사이 겹침이나 요약 전용 모양이면 실패다. 요약 전용 링·테두리·축소 변형이나 로고 전체 흰 원을 만들지 않고 로고 내부 불투명 영역을 보존한다. 실패·권한 출처는 숨겨 정상으로 보이게 하지 않는다. 포함되지 않은 도구를 클릭 가능 성공 칩으로 만들거나 저장 연결만으로 최신 수집을 주장하면 실패다.

H는 허브 읽기, I는 열거다.

|근거/열거|H unread|H failed|H ok+출처 상태|H ok+출처 항목 없음|열기|
|---|---|---|---|---|---|
|근거 없음,I unread/failed|칩 없음|칩 없음|실패 시도만으로는칩 없음|칩 없음|불가|
|현재 verified|busy|error,reason hub|sourceView(state)|toolState|현재 바인딩 있음. health와 별개로 실패 사유 제시|
|저장receipt,I unread|busy|error|sourceView(state)|busy|불가|
|저장receipt,I failed|busy+열거 실패|error|sourceView(state)+열거 실패|error,reason inventory|불가,재시도 유지|
|동일 UID,unverified|busy|error|sourceView(state)+blocked|toolState+blocked|연결 기록 없는 receipt만이면 불가|
|다른 UID,unverified|포함 안 함|포함 안 함|포함 안 함|포함 안 함|이전 receipt로 열기 금지|
|성공 목록에 없음,receipt만|포함 안 함|포함 안 함|포함 안 함|포함 안 함|불가|
|성공 목록에 없음,연결 기록있음|busy|error|sourceView(state)|error,reason missing|불가|


<a id="RULE-SKELETON"></a>

## RULE-SKELETON 로딩 뼈대

출처: SCR-LOAD-SKELETON, D01027, D01031, D01032. 최초 응답 전 실제 머리·탭·열·카드 높이에 맞는 뼈대를 먼저 표시한다. 같은 대상 재조회에서는 마지막 성공값과 실제 성공 시각을 유지하고 해당 영역만 진행 표시한다. 대상 교체는 이전 자료를 제거하고 새 대상의 뼈대를 쓴다. 재조회 때 표 전체를 지우거나 흰 빈 화면·여백 없는 재시도 카드·다른 대상의 값을 보이면 실패다. 실패 후 상태는 → RULE-STATE로 판정한다.

- 현재: `apps/wake/pages/cluster-home.js`는 출처 UID 교체 때 보관 시리즈와 진행 중 세대를 무효화하고 기존 loading 뼈대와 재조회 경로를 쓴다. 자료 없는 off·error 상태는 유지한다. 늦은 옛 지표도 제거하며 새 UID의 데이터가 도착하면 값을 표시한다.
- 차이: 합성 페이지 함수 반례를 통과했다. 실제 Electron 다크·라이트의 상태 전환은 H-009에 남는다.
- 고정 장치: `apps/wake/pages/source-state-pages.test.mjs`의 home_source_uid_change_invalidates_saved_and_inflight_series. 실행은 [묶음 1 수정](tasks.md#batch1-fixes)이다.

<a id="RULE-FOLD"></a>

## RULE-FOLD 자동 펼침

출처: D01021, D-USR-2026-11-16-5, polish의 최초 판단 기본값. 화면 최초 진입 후 100ms 이내이면서 첫 그림 전에 판단 가능한 자료로만 자동 펼침을 결정한다. 그 뒤 도착한 문제 자료는 머리 상태만 갱신한다. 사람이 접거나 펼친 상태·스크롤은 재조회·상태 변화 뒤에도 보존한다. 늦은 응답이 카드를 펼치거나 매 갱신마다 초기 선택으로 되돌리면 실패다. 이 판단 창은 → RULE-PERFORMANCE의 첫 그림 목표와 별개다.

<a id="RULE-EVIDENCE"></a>

## RULE-EVIDENCE 근거 이름표

출처: CMP-REF-01, F-ARC-008, D00466, D00473, D00660, D00884, D00885. 성공적으로 읽은 근거에만 안정된 ID·출처·대상 UID·절대 구간·관측 시각을 연결해 이름표를 붙인다. ref 입력은 n/label/tip/action이며 label은 Logs·대상·시각처럼 출처를 읽을 수 있는 이름, tip은 발췌문이다. 발췌 최대 300자는 채택 기본값이다. label 없는 [n] fallback은 원래 번호 보존용이며 기본 이름이 아니다. 클릭·Enter·Space로 같은 근거를 연다. 같은 근거를 목록·AI·상세·보고서에서 열면 같은 원문과 범위를 가리킨다. 실패한 get_evidence·미조회 근거·생성한 추론을 관측 이름표로 만들거나 키보드로 열지 못하면 실패다. 자료 보관 밖과 삭제·권한 부재는 원인을 보존하며 다른 근거로 대체하지 않는다. 이름표 모양은 기존 공통 부품을 사용한다.

<a id="RULE-RESTARTS"></a>

## RULE-RESTARTS Restarts 형식과 톤

출처: polish decisions.md:59, kinds.js:25, data-table.js:33·119, D01033, D01034. restartCount 합계와 실제 마지막 종료 시각을 사용한다. 양수이고 경과 근거가 있으면 `1 (5m ago)`처럼 수와 경과를 함께 표시하고, 0은 `0`, 시각이 없으면 경과를 만들지 않는다. 과거 스냅숏은 해당 기준시각으로 경과를 계산한다.

양수는 셀 전체에 숫자 열의 주의 톤, 0은 기본 톤, 아이콘은 없다. 경과 부분만 기본 톤으로 분리하는 요구는 없다. 원본 없는 경과를 만들거나 상태 아이콘을 붙이거나 양수 셀 일부만 임의 다른 톤으로 나누면 실패다. 폭과 잘림의 유일한 판정은 → RULE-WIDTH다. 현재 fit 경로가 있다는 정적 사실을 실제 렌더 통과로 표현하지 않는다.
