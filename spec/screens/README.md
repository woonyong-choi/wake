# 화면 명세

목표는 화면의 합격 조건이고, 현재는 각 행의 파일·줄에서 확인한 코드 동작이다. 차이는 두 항목 사이의 구체적인 불일치다. 코드 확인, 시험 실행, 실제 앱 합격은 서로 다른 근거다.

읽는 순서: [공통 계약](common.md) → 해당 화면 → 연결된 components ID. 셀·카드 세부는 components, 화면은 목적·구성·대상·정렬·이동을 소유한다.

결정의 짧은 원문과 관련 규칙은 파일 끝 표에 있다. 각 목표의 직접 근거는 그 행의 출처 칸을 우선한다. 질문·검토 문맥을 새 기능 승인으로 쓰지 않는다.

## 규칙 행을 읽고 쓰는 법

- 목표: 구체적인 입력·상태·조작 → 화면의 값·문구·위치·이동과 그 출처 필드/서비스 → 보이면 불합격인 결과. 반복되는 대상 식별·상태·구성 요소 계약은 화면 머리에서 선언하고 행에서 참조한다.
- 현재: 실제 함수나 표현식에서 확인한 사실 한 줄과 `파일:줄`. 서비스 공급원이 막혀 있으면 도달하지 않는 렌더 코드를 현재 사용 가능한 기능으로 세지 않는다.
- 차이: 해당 입력에서 목표와 달라지는 값·순서·동작을 쓴다. 코드상 차이가 없으면 `없음(확인: 파일:줄)`로 적는다. 이는 실행 합격 판정이 아니다.
- 고정 장치: 존재하는 시험 파일과 정확한 시험 이름, 또는 점검 도구의 항목을 쓴다. 시험은 해당 단위만 고정하며 화면 전체의 성공을 뜻하지 않는다. 없으면 `고정 없음 → TASK-ID`로 적는다. 이 표기만으로 tasks.md에 작업이 등록된 것은 아니다.
- 출처: 해당 내용을 결정한 ID를 쓴다. [사용자 확정 1~6](../decisions.md)의 수치·정렬·복구·보관·성능·동시 작업 규칙은 각각 `D-USR-2026-11-16-1`~`6`을 따른다. 실제 결정이 없는 세부값만 `D-USR-2026-11-16-7` 기본값이며, 확정 규칙에 이 기본값을 덮어씌우지 않는다.

각 화면의 자료 상태와 이동·복귀는 머리에 연결한 공통 계약을 적용한다. 등록 종류 표는 코드 정의 목록, 결정 대응표는 근거 색인이다. 이 두 표와 아래 화면 목록은 입력·기대·실패를 판정하는 목표 행 수에 포함하지 않는다.

## 화면 목록

| 화면 | 파일·ID | 목적(SRE 판단) |
|---|---|---|
| 비용 | [SCR-COSTS](costs.md#SCR-COSTS) | 같은 기간·통화·집계 범위에서 비용이 큰 대상을 고른다. |
| 인시던트 · 복구 확인 | [SCR-INCIDENT-VERIFY](incident-verify.md#SCR-INCIDENT-VERIFY) | 증상 회복과 서비스 복구의 필수 조건을 판정한다. |
| 설정 · 일반 | [SCR-SETTINGS-GENERAL](settings-general.md#SCR-SETTINGS-GENERAL) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 다이얼로그 · 대화 삭제 확인 | [SCR-DIALOG-CHAT-DELETE](dialog-chat-delete.md#SCR-DIALOG-CHAT-DELETE) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 첫 실행 · 권한 선택(삭제됨) | [SCR-ONBOARDING-PERMISSION](onboarding-permission.md#SCR-ONBOARDING-PERMISSION) | 기본 설정의 한 행으로 합쳐졌다. |
| 다이얼로그 · 북마크 폴더 삭제 확인 | [SCR-DIALOG-FOLDER-DELETE](dialog-folder-delete.md#SCR-DIALOG-FOLDER-DELETE) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 검색 결과 | [SCR-SEARCH](search.md#SCR-SEARCH) | 일치한 리소스와 검색하지 못한 출처를 구분한다. |
| 다이얼로그 · 앱 종료 확인 | [SCR-DIALOG-QUIT](dialog-quit.md#SCR-DIALOG-QUIT) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 리소스 목록 | [SCR-RESOURCE-LIST](resource-list.md#SCR-RESOURCE-LIST) | 상태·재시작·사용량이 나쁜 대상을 찾아 상세로 간다. |
| AI 칸 · 승인 시트 | [SCR-APPROVAL](approval.md#SCR-APPROVAL) | 대상·변경·위험·되돌림을 확인해 허용 또는 거절한다. |
| 설정 · 에이전트 연결 설정 | [SCR-SETTINGS-AGENTS](settings-agents.md#SCR-SETTINGS-AGENTS) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 설정 탐색과 틀 | [SCR-SETTINGS](settings.md#SCR-SETTINGS) | 설정 범주와 바뀌는 실제 동작을 찾는다. |
| 네트워크 | [SCR-NETWORK](network.md#SCR-NETWORK) | 서비스 구성 관계와 관측된 통신 문제를 구분한다. |
| AI 칸 · 문맥 칩 | [SCR-AI-CONTEXT](ai-context.md#SCR-AI-CONTEXT) | 질문의 대상·구간·출처 범위를 확인한다. |
| 인시던트 · 시간순 변화 | [SCR-INCIDENT-TIMELINE](incident-timeline.md#SCR-INCIDENT-TIMELINE) | 증상 전후에 무엇이 바뀌었는지 확인한다. |
| 다이얼로그 · 북마크 폴더 이름 변경 | [SCR-DIALOG-FOLDER-RENAME](dialog-folder-rename.md#SCR-DIALOG-FOLDER-RENAME) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 설정 · 도구 연결 설정 | [SCR-SETTINGS-TOOLS](settings-tools.md#SCR-SETTINGS-TOOLS) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 로그 | [SCR-LOGS](logs.md#SCR-LOGS) | 원문에서 오류와 전후 문맥을 찾는다. |
| 첫 실행 · AI 연결 | [SCR-ONBOARDING-AI](onboarding-ai.md#SCR-ONBOARDING-AI) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 보고서 | [SCR-REPORT](report.md#SCR-REPORT) | 영향·원인·대응·후속 조치를 팀에 전달한다. |
| AI 작업 기록 목록 | [SCR-AI-HISTORY](ai-history.md#SCR-AI-HISTORY) | 읽기·모델 전달·사람 동작과 실패를 추적한다. |
| 설정 · 보관함 | [SCR-SETTINGS-ARCHIVE](settings-archive.md#SCR-SETTINGS-ARCHIVE) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 설정 · 클러스터 개별 설정 | [SCR-SETTINGS-CLUSTER-DETAIL](settings-cluster-detail.md#SCR-SETTINGS-CLUSTER-DETAIL) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 인시던트 목록 | [SCR-INCIDENTS](incidents.md#SCR-INCIDENTS) | 지금 대응할 사건과 해결 사건을 구분한다. |
| 근거 상세 | [SCR-EVIDENCE](evidence.md#SCR-EVIDENCE) | 결론의 원문·질의·시각·대상·마스킹 범위를 확인한다. |
| 다이얼로그 · 필요한 권한 시트 | [SCR-DIALOG-PERMISSION](dialog-permission.md#SCR-DIALOG-PERMISSION) | 설정·입력·실행의 대상과 결과를 확인한다. |
| AI 칸 · 대화 | [SCR-AI-PANEL](ai-panel.md#SCR-AI-PANEL) | AI 조사·근거·제안과 사람 승인 결과를 확인한다. |
| 설정 · AI 모델 | [SCR-SETTINGS-AI-MODELS](settings-ai-models.md#SCR-SETTINGS-AI-MODELS) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 위 경로 막대와 구역 탭 | [SCR-TOPBAR](topbar.md#SCR-TOPBAR) | 현재 경로·구역·탭과 AI·도구 동작을 확인한다. |
| 에이전트 상세 | [SCR-AGENT-DETAIL](agent-detail.md#SCR-AGENT-DETAIL) | heartbeat·감시 범위·권한·DaemonSet으로 수집 공백을 찾는다. |
| 설정 · 외부 AI 연결 | [SCR-SETTINGS-AI-CONNECT](settings-ai-connect.md#SCR-SETTINGS-AI-CONNECT) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 인시던트 · 범위 | [SCR-INCIDENT-SCOPE](incident-scope.md#SCR-INCIDENT-SCOPE) | 영향 받은 대상·서비스·기간을 특정한다. |
| 다이얼로그 · 업데이트 실패 | [SCR-DIALOG-UPDATE-ERROR](dialog-update-error.md#SCR-DIALOG-UPDATE-ERROR) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 알림 상세 | [SCR-ALERT-DETAIL](alert-detail.md#SCR-ALERT-DETAIL) | 규칙 식과 실측값으로 발생·해소 이유를 판단한다. |
| 인시던트 · 감사 기록 | [SCR-INCIDENT-RECORD](incident-record.md#SCR-INCIDENT-RECORD) | 요청·승인·실행 주체와 결과를 확인한다. |
| 홈 | [SCR-HOME](home.md#SCR-HOME) | 지금 깨진 대상과 먼저 조사할 사건을 고른다. |
| 다이얼로그 · 외부 AI 클라이언트 추가 | [SCR-DIALOG-AI-CLIENT](dialog-ai-client.md#SCR-DIALOG-AI-CLIENT) | 설정·입력·실행의 대상과 결과를 확인한다. |
| Helm 릴리스 상세 | [SCR-HELM-DETAIL](helm-detail.md#SCR-HELM-DETAIL) | Secret 없이 확인한 릴리스 메타와 소속 리소스를 판단한다. |
| Deployment 상세 · 롤아웃 | [SCR-RESOURCE-ROLLOUT](resource-rollout.md#SCR-RESOURCE-ROLLOUT) | revision의 배포 진행과 변경을 판단한다. |
| 인시던트 작업면 | [SCR-INCIDENT-WORKSPACE](incident-workspace.md#SCR-INCIDENT-WORKSPACE) | 근거로 조치를 고르고 승인 뒤 실제 회복까지 확인한다. |
| AI 작업 기록 상세 | [SCR-AI-HISTORY-DETAIL](ai-history-detail.md#SCR-AI-HISTORY-DETAIL) | 작업 주체·권한·범위·근거·결과를 감사한다. |
| 새 탭(삭제됨) | [SCR-NEW-TAB](new-tab.md#SCR-NEW-TAB) | 새 탭은 마지막으로 본 클러스터 홈을 연다. |
| 터미널 | [SCR-TERMINAL](terminal.md#SCR-TERMINAL) | 현재 대상에 연결된 실제 터미널을 고른다. |
| 첫 실행 · 클러스터 연결 | [SCR-ONBOARDING-CLUSTERS](onboarding-clusters.md#SCR-ONBOARDING-CLUSTERS) | 설정·입력·실행의 대상과 결과를 확인한다. |
| GitOps 목록 | [SCR-GITOPS](gitops.md#SCR-GITOPS) | Git 일치와 건강을 구분해 조사할 배포를 고른다. |
| 도구 상세 | [SCR-TOOL-DETAIL](tool-detail.md#SCR-TOOL-DETAIL) | 건강·권한·실패 원인과 마지막 성공을 확인한다. |
| 설정 · 모양 | [SCR-SETTINGS-APPEARANCE](settings-appearance.md#SCR-SETTINGS-APPEARANCE) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 사이드바 | [SCR-SIDEBAR](sidebar.md#SCR-SIDEBAR) | 연결 대상·북마크·열린 작업·인시던트를 구분해 오간다. |
| 설정 · Git 연결 | [SCR-SETTINGS-GIT](settings-git.md#SCR-SETTINGS-GIT) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 설정 · AI 대화 | [SCR-SETTINGS-AI-CHAT](settings-ai-chat.md#SCR-SETTINGS-AI-CHAT) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 리소스 상세 · 로그 | [SCR-RESOURCE-LOGS](resource-logs.md#SCR-RESOURCE-LOGS) | 해당 시각·컨테이너 로그로 증상을 확인한다. |
| 알림 목록 | [SCR-ALERTS](alerts.md#SCR-ALERTS) | firing·pending·resolved를 구분하고 대상 사건으로 간다. |
| 인시던트 · 조치 | [SCR-INCIDENT-ACTION](incident-action.md#SCR-INCIDENT-ACTION) | 변경·위험·되돌림을 비교해 조치를 고른다. |
| 다이얼로그 · namespace 표시 목록 추가 | [SCR-DIALOG-NAMESPACE](dialog-namespace.md#SCR-DIALOG-NAMESPACE) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 리소스 상세 · YAML | [SCR-RESOURCE-YAML](resource-yaml.md#SCR-RESOURCE-YAML) | 객체 설정과 resourceVersion을 확인한다. |
| 설정 · 클러스터 목록 | [SCR-SETTINGS-CLUSTERS](settings-clusters.md#SCR-SETTINGS-CLUSTERS) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 리소스 상세 · 요약 | [SCR-RESOURCE-SUMMARY](resource-summary.md#SCR-RESOURCE-SUMMARY) | 상태·컨테이너·조건·한도와 증거로 대상의 이상 이유를 판단한다. |
| 지표 | [SCR-METRICS](metrics.md#SCR-METRICS) | 같은 시간대의 변화·한도 초과·결측을 구분한다. |
| 설정 · 권한 | [SCR-SETTINGS-PERMISSIONS](settings-permissions.md#SCR-SETTINGS-PERMISSIONS) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 이벤트 상세 | [SCR-EVENT-DETAIL](event-detail.md#SCR-EVENT-DETAIL) | Event 원문·반복·대상을 다른 사건과 구분한다. |
| GitOps 상세 | [SCR-GITOPS-DETAIL](gitops-detail.md#SCR-GITOPS-DETAIL) | 변경 파일·revision·적용 상태로 드리프트와 실패 원인을 확인한다. |
| 첫 실행 · 기본 설정 | [SCR-ONBOARDING-DONE](onboarding-done.md#SCR-ONBOARDING-DONE) | AI 권한 기본값·언어·테마를 정하고 클러스터 홈으로 시작한다. |
| 에이전트 목록 | [SCR-AGENTS](agents.md#SCR-AGENTS) | 설치·등록·수집 상태를 구분한다. |
| 첫 실행 · 시작(삭제됨) | [SCR-ONBOARDING-WELCOME](onboarding-welcome.md#SCR-ONBOARDING-WELCOME) | 첫 실행은 클러스터 연결에서 시작한다. |
| 계정 메뉴 | [SCR-ACCOUNT-MENU](account-menu.md#SCR-ACCOUNT-MENU) | 로컬 프로필과 설정·기록·권한 진입점을 찾는다. |
| 명령 팔레트 | [SCR-PALETTE](palette.md#SCR-PALETTE) | 이름·명령으로 리소스·탭·대화에 접근한다. |
| 도구 HTTP 조회 | [SCR-TOOL-API](tool-api.md#SCR-TOOL-API) | 조회 요청의 원문·HTTP 결과·크기를 확인한다. |
| 리소스 상세 · 이벤트 | [SCR-RESOURCE-EVENTS](resource-events.md#SCR-RESOURCE-EVENTS) | 선택 대상의 이상을 만든 Event와 시점을 확인한다. |
| 이벤트 목록 | [SCR-EVENTS](events.md#SCR-EVENTS) | 반복 경고의 대상·이유·시점을 찾아 로그 조사로 간다. |
| 리소스 상세 · 관련 | [SCR-RESOURCE-RELATIONS](resource-relations.md#SCR-RESOURCE-RELATIONS) | 소유·선택 관계와 영향 범위를 확인한다. |
| CronJob 상세 · 실행 | [SCR-RESOURCE-RUNS](resource-runs.md#SCR-RESOURCE-RUNS) | 예약 실행의 시작·완료와 실패 Job을 찾는다. |
| 인시던트 · 원인 | [SCR-INCIDENT-CAUSE](incident-cause.md#SCR-INCIDENT-CAUSE) | 관측·가설·확정 원인을 근거별로 구분한다. |
| 다이얼로그 · 탭 그룹 북마크 저장 | [SCR-DIALOG-GROUP-BOOKMARK](dialog-group-bookmark.md#SCR-DIALOG-GROUP-BOOKMARK) | 설정·입력·실행의 대상과 결과를 확인한다. |
| 도구 목록 | [SCR-TOOLS](tools.md#SCR-TOOLS) | 어떤 도구를 실제로 읽고 열 수 있는지 확인한다. |

## 확인 범위

현재 칸의 정적 확인 시점은 2026-11-17이다. 고정 장치 칸은 시험 정의의 연결이며 실행 결과가 아니다. 실제 앱·실클러스터 수용은 연결된 공통 검수 계약으로 따로 판정한다. 과거 Git 이력이나 보고의 통과를 현재 작업 트리의 합격으로 재사용하지 않는다. 일회성 파일 범위·작업 순서·실행 권한은 화면 목표에 넣지 않고 작업 기록에서 관리한다.
