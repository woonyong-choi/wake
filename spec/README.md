# Wake 스펙 정본

Wake의 목표와 현재 구현의 차이를 찾는 한국어 문서다. 예를 들어 Pod 기본 정렬을 고칠 때는 전체 문서를 읽지 않고 작업 ID, 화면, 공통 표 계약, Pod 표만 읽는다. 확정 결정과 나머지 추천안의 기본값 채택은 [결정](decisions.md)을 따른다. 기본값 채택은 구현·검증 완료와 다르다. 원문에 명시된 사용자 결정 ID가 있으면 그 결정을 우선하며 제안·번복 가능한 기본값으로 낮추지 않는다. 기본값은 별도 결정이 없는 세부에만 적용하고 질문·붙여넣은 보고를 승인으로 바꾸지 않는다.

## 읽는 순서

1. [원칙](constitution.md)의 C-SOURCE와 해당 권한·자료 보존 규칙을 읽는다.
2. [작업 목록](tasks.md)에서 작업 ID 하나를 고르고 연결된 스펙 ID를 찾는다.
3. 해당 규칙의 목표·현재·차이·고정 장치·출처와 참조한 공통 규칙만 읽는다.
4. 제품 흐름이나 서비스 경계를 바꿀 때만 아래 최소 파일 표에 있는 추가 문서를 읽는다.
5. [회귀](regression.md)의 관련 장치와 [검증](quality.md)의 실행 경계를 확인한다. 완료 뒤 원본 규칙·작업·실행 증거를 함께 갱신한다.

## 작업할 때 읽을 최소 파일

모든 작업은 constitution.md의 적용 규칙과 tasks.md의 해당 행에서 시작한다. 아래 파일의 전체가 아니라 대상 ID와 공통 참조 절만 읽는다.

| 작업 | 최소 파일 | 추가 경계 |
|---|---|---|
| 화면의 값·동선 | screens의 해당 화면, screens/common.md의 참조 규칙 | 표면이 바뀌면 design.md의 관련 B ID와 regression.md |
| 표의 열·정렬·검색 | 해당 화면, components/table-contract.md, components/tables의 해당 표 | 리소스 계산은 components/resource-values.md, 상태 판단은 sre.md |
| 차트·카드·입력·출처 칩 | components의 해당 부품, design.md의 관련 규칙 | 부품의 실제 소비 화면과 regression.md |
| 제품 흐름 | product.md의 해당 PRD, flows의 해당 흐름 | 흐름이 호출하는 화면·승인·저장 규칙 |
| 읽기·저장·API | architecture.md의 경계, backend.md의 해당 F ID | concurrency.md와 security.md의 관련 규칙 |
| 저장 등급·보관·도구 사용자 항목 | data-policy.md의 DP ID, rules.md의 RULE-RETENTION | security.md의 Secret 경계, architecture.md의 도구 층 |
| 승인·외부 연결·자격 | security.md의 관련 SEC ID, flows/approval-execution.md 또는 연결 흐름 | backend.md의 실행 경계와 concurrency.md의 멱등 규칙 |
| 성능·취소·재시도 | performance.md 또는 concurrency.md의 해당 ID | 영향을 받는 서비스와 화면의 기존 목표 |
| 시험·캡처·회귀 | quality.md의 해당 Q ID, regression.md의 해당 J ID | 제품 목표는 원본 영역 문서 |
| 문서 정리·중간 머지 | loop.md의 L-007~013, tasks.md의 H-010 | decisions.md의 결정과 해당 영역 규칙 |

Pod 예시는 TASK-CMP-K-PODS → [resource-list.md](screens/resource-list.md) → [table-contract.md](components/table-contract.md) → [resource-pods.md](components/tables/resource-pods.md) 순서다. 연결된 기본 정렬은 D-USR-2026-11-16-2의 확정 목표를 따른다.

## 정본과 상태

- 아래 주제의 값·조건·실패 판정은 지정한 정본 규칙만 소유한다. 영역의 기존 ID는 정본 참조와 화면별 예외·현재·차이·고정 장치·출처를 보존한다. tasks.md는 실행 색인이다.
- 코드 위치는 정적 근거다. 시험 이름은 장치의 존재다. 실행 통과·실제 앱 화면·클러스터 원본·독립 검토·머지는 각각 별도 근거다.
- 출처 칸의 `D00000` 형식 ID는 저장소 밖 소유자 결정 기록의 번호다. 그 기록에는 질문·지적·실행 지시도 있으므로 ID가 연결됐다는 사실만으로 제품 요구 승인이나 구현 완료를 뜻하지 않는다.
- 공통 빈 값·7상태·툴팁·폭·원본 대조는 참조한 공통 규칙에서 읽는다. 화면별 예외에도 최신 명시 결정을 우선 적용한다. 영역 간 추천 차이는 decisions.md의 통일 목록을 따른다.
- 숫자 열 정렬·표 기본 정렬·복구 관찰·보관 기간·화면 속도·동시 작업은 D-USR-2026-11-16-1~6으로 확정한다. 나머지 추천안은 D-USR-2026-11-16-7로 기본값을 채택한다.
- kit/ARCHITECTURE.md·CONTRACTS.md·QUALITY.md·README.md는 제품과 무관한 kit 계약으로 유지한다.
## 주제 → 정본 규칙 ID

같은 값과 조건을 영역별로 다시 쓰지 않는다. 화면의 원본 필드·이동 대상과 명시된 예외만 해당 화면에 남긴다. 원문 발췌·코드 선언·과거 관측은 출처이며 현재 목표의 재정의로 읽지 않는다. 이 표 밖의 고유 계산·권한·화면 계약은 기존 구체 ID가 소유한다.

`check-canonical.py`의 재정의 0은 등록된 표현에서 위반이 없다는 뜻이며 의미상 충돌 전체가 없다는 증명은 아니다. 문체·기간·단위·상태의 최신 결정은 원천과 목표·실패 조건을 직접 대조한다. 검사기의 문서 회귀 사례는 `test_check_canonical.py`에 둔다.

| 주제 | 정본 규칙 ID |
|---|---|
| 7상태 정의와 판정 | [RULE-STATE](rules.md#RULE-STATE) |
| 상태·심각도·숫자 톤과 색 | [RULE-TONE](rules.md#RULE-TONE) |
| 표 기본·사용자 선택 정렬 | [RULE-SORT](rules.md#RULE-SORT) |
| 표 초기 폭·fit·최소 폭·숨김 순서 | [RULE-WIDTH](rules.md#RULE-WIDTH) |
| 시각 표시 | [RULE-TIME](rules.md#RULE-TIME) |
| 시간 범위와 전 기간 비교 | [RULE-RANGE](rules.md#RULE-RANGE) |
| 차트 축과 모션 | [RULE-CHART](rules.md#RULE-CHART) |
| 샌키 흐름 | [RULE-SANKEY](rules.md#RULE-SANKEY) |
| 승인과 실행 | [RULE-APPROVAL](rules.md#RULE-APPROVAL) |
| 보관 기간 | [RULE-RETENTION](rules.md#RULE-RETENTION) |
| 복구 판정 | [RULE-RECOVERY](rules.md#RULE-RECOVERY) |
| 성능 목표 | [RULE-PERFORMANCE](rules.md#RULE-PERFORMANCE) |
| AI 경계 | [RULE-AI](rules.md#RULE-AI) |
| Secret 경계 | [RULE-SECRET](rules.md#RULE-SECRET) |
| 칸 모서리와 여백 | [RULE-PANE](rules.md#RULE-PANE) |
| 사이드바 구역 | [RULE-SIDEBAR](rules.md#RULE-SIDEBAR) |
| 칩 포함 규칙 | [RULE-CHIPS](rules.md#RULE-CHIPS) |
| 로딩 뼈대 | [RULE-SKELETON](rules.md#RULE-SKELETON) |
| 자동 펼침 | [RULE-FOLD](rules.md#RULE-FOLD) |
| 근거 이름표 | [RULE-EVIDENCE](rules.md#RULE-EVIDENCE) |
| Restarts 형식과 톤 | [RULE-RESTARTS](rules.md#RULE-RESTARTS) |
| GitOps 조치 경로 | [FLOW-APR-001](flows/approval-execution.md#FLOW-APR-001) |

## 규칙의 판정 형식

목표는 구체 입력이나 조작 → 출처 필드·서비스로 정한 표시 값·위치·이동 → 실패 조건 순서로 읽는다. 현재는 코드에서 확인한 사실과 파일:줄이고, 실행 성공을 뜻하지 않는다. 차이는 해당 입력에서 목표와 어긋나는 동작을 적으며 일치하면 `없음(확인: 파일:줄)`로 쓴다. 고정 장치는 실재 시험 파일과 시험명 또는 점검 도구 항목이다. 장치가 없으면 `고정 없음 → 작업 ID`로 남긴다. 같은 화면의 공통 계약은 머리에서 한 번 연결한다.

결정 기록은 목표의 근거이고, 파일 목록·작업 색인은 목표를 다시 정의하지 않는다. 형식 비율은 `- 목표:`·`- 추가 조건:` 항목과 표의 `목표` 열을 분모로 센다. 표 안의 독립 조건은 번호와 줄바꿈으로 구분한다. 원문 발췌, 계산식 사전, 색인, 선택 이유는 제외한다. 형식 검사 통과와 코드·결정 의미 대조는 별도 판정이다.

일회성 편집 범위와 과거 과업의 실행 순서는 [작업 목록의 H-000](tasks.md)에서만 관리한다.

## 목차

목록은 저장된 파일에서 만든다. 새 파일을 추가·삭제할 때 해당 행을 함께 갱신한다.

| 파일 | 내용 |
|---|---|
| [README.md](README.md) | 목차·최소 읽기 경로 |
| [rules.md](rules.md) | 주제별 값·조건·실패 판정 정본 |
| [test_check_canonical.py](test_check_canonical.py) | 정본 검사기의 검수 지적·사실/목표 구분 회귀 시험 |
| [check-canonical.py](check-canonical.py) | 전체 표 칸·항목의 규범 중복·현재/목표 구분·정본 링크 검사 |
| [decisions.md](decisions.md) | 2026-11-16 확정 결정·기본값 채택·통일 목록 |
| [architecture.md](architecture.md) | Wake 허브 아키텍처 |
| [backend.md](backend.md) | Wake 백엔드와 데이터 |
| [components/cards.md](components/cards.md) | 알약 카드와 요약 막대 |
| [components/charts.md](components/charts.md) | 차트 |
| [components/code-evidence.md](components/code-evidence.md) | 코드·로그·근거 이름표 |
| [components/column-inventory.md](components/column-inventory.md) | 열 선언 대조 색인 |
| [components/control-inventory.md](components/control-inventory.md) | 그 밖의 부품 입력과 모양 토큰 |
| [components/controls.md](components/controls.md) | 검색·탭·도구 줄·설정·메뉴 |
| [components/flow-graph.md](components/flow-graph.md) | 흐름 그래프 |
| [components/incident-criteria.md](components/incident-criteria.md) | 인시던트 판단 부품과 판정 기준 |
| [components/index.md](components/index.md) | 부품 목표 명세 |
| [components/regressions.md](components/regressions.md) | 회귀와 과거 판정 |
| [components/resource-values.md](components/resource-values.md) | 리소스 원본 값과 공통 변환 |
| [components/source-chips.md](components/source-chips.md) | 출처 칩과 도구 상태 |
| [components/table-contract.md](components/table-contract.md) | 표 공통 계약 |
| [components/tables/agent-detail.md](components/tables/agent-detail.md) | 에이전트 상세 RBAC |
| [components/tables/agent.md](components/tables/agent.md) | 에이전트 목록의 목록형 부품 |
| [components/tables/ailog-detail.md](components/tables/ailog-detail.md) | AI 작업 기록 상세의 목록형 부품 |
| [components/tables/ailog.md](components/tables/ailog.md) | AI 작업 기록 |
| [components/tables/alert-detail.md](components/tables/alert-detail.md) | 알림 상세 수신처와 이력 |
| [components/tables/alerts.md](components/tables/alerts.md) | 알림 목록 |
| [components/tables/cluster-home.md](components/tables/cluster-home.md) | 홈 문제 Pod·워크로드·이벤트 |
| [components/tables/cluster-search.md](components/tables/cluster-search.md) | 클러스터 검색 |
| [components/tables/costs.md](components/tables/costs.md) | 비용 |
| [components/tables/events-view.md](components/tables/events-view.md) | 이벤트 목록과 Reason 묶음 |
| [components/tables/gitops-detail.md](components/tables/gitops-detail.md) | GitOps 상세 이력 |
| [components/tables/gitops.md](components/tables/gitops.md) | GitOps Application과 Helm 목록 |
| [components/tables/incident-detail.md](components/tables/incident-detail.md) | 인시던트 범위와 감사 |
| [components/tables/incident-evidence.md](components/tables/incident-evidence.md) | 근거 상세의 목록형 부품 |
| [components/tables/incident-parts.md](components/tables/incident-parts.md) | 인시던트 목록 |
| [components/tables/incident-report-doc.md](components/tables/incident-report-doc.md) | 보고서 표 |
| [components/tables/logs.md](components/tables/logs.md) | 로그 목록의 목록형 부품 |
| [components/tables/network.md](components/tables/network.md) | 네트워크 표 |
| [components/tables/resource-configmaps.md](components/tables/resource-configmaps.md) | ConfigMap 목록 표 |
| [components/tables/resource-cronjobs.md](components/tables/resource-cronjobs.md) | CronJob 목록 표 |
| [components/tables/resource-daemonsets.md](components/tables/resource-daemonsets.md) | DaemonSet 목록 표 |
| [components/tables/resource-deployments.md](components/tables/resource-deployments.md) | Deployment 목록 표 |
| [components/tables/resource-detail.md](components/tables/resource-detail.md) | 리소스 상세 안의 표 |
| [components/tables/resource-events.md](components/tables/resource-events.md) | Event 목록 표 |
| [components/tables/resource-horizontalpodautoscalers.md](components/tables/resource-horizontalpodautoscalers.md) | HorizontalPodAutoscaler 목록 표 |
| [components/tables/resource-ingresses.md](components/tables/resource-ingresses.md) | Ingress 목록 표 |
| [components/tables/resource-inspector.md](components/tables/resource-inspector.md) | 리소스 상세 하위 Pod와 HPA |
| [components/tables/resource-jobs.md](components/tables/resource-jobs.md) | Job 목록 표 |
| [components/tables/resource-nodes.md](components/tables/resource-nodes.md) | Node 목록 표 |
| [components/tables/resource-persistentvolumeclaims.md](components/tables/resource-persistentvolumeclaims.md) | PersistentVolumeClaim 목록 표 |
| [components/tables/resource-pods.md](components/tables/resource-pods.md) | Pod 목록 표 |
| [components/tables/resource-replicasets.md](components/tables/resource-replicasets.md) | ReplicaSet 목록 표 |
| [components/tables/resource-secrets.md](components/tables/resource-secrets.md) | Secret 목록 표 |
| [components/tables/resource-services.md](components/tables/resource-services.md) | Service 목록 표 |
| [components/tables/resource-statefulsets.md](components/tables/resource-statefulsets.md) | StatefulSet 목록 표 |
| [components/tables/settings.md](components/tables/settings.md) | 설정 목록의 목록형 부품 |
| [components/tables/tool-api.md](components/tables/tool-api.md) | 도구 API 매개변수 |
| [components/tables/tool-detail.md](components/tables/tool-detail.md) | 도구 상세 오류 |
| [components/tables/tools.md](components/tables/tools.md) | 도구 목록의 목록형 부품 |
| [components/tables/view-parts.md](components/tables/view-parts.md) | 표 로딩 뼈대 |
| [concurrency.md](concurrency.md) | 동시성·중복처리·정합성 |
| [data-policy.md](data-policy.md) | 저장 등급·저장 금지·연결 해제·도구 사용자 항목 |
| [constitution.md](constitution.md) | Wake 불변 원칙 |
| [design/tokens.md](design/tokens.md) | 디자인 토큰의 목표와 적용 범위 |
| [design/verification.md](design/verification.md) | 디자인 검수와 남은 차이 |
| [design.md](design.md) | 디자인 목표와 현재 차이 |
| [flows/agent-installation.md](flows/agent-installation.md) | wake-agent 설치와 수집 확인 |
| [flows/ai-connection.md](flows/ai-connection.md) | AI 연결·조사·외부 연결 흐름 |
| [flows/approval-execution.md](flows/approval-execution.md) | 조치 제안·사람 승인·실행·확인 |
| [flows/cluster-connection.md](flows/cluster-connection.md) | 클러스터 연결 흐름 |
| [flows/gitops-change.md](flows/gitops-change.md) | Git 연결·Draft PR·배포 추적 |
| [flows/incident-lifecycle.md](flows/incident-lifecycle.md) | 인시던트 감지·묶기·재발·복구 |
| [flows/investigation.md](flows/investigation.md) | 이상 발견에서 근거 조사까지 |
| [flows/onboarding-settings.md](flows/onboarding-settings.md) | 첫 실행·설정·연결 관리 흐름 |
| [flows/reports.md](flows/reports.md) | 보고서 작성·편집·내보내기 |
| [flows/tool-connection.md](flows/tool-connection.md) | 도구 연결·열기·복원 흐름 |
| [loop.md](loop.md) | Wake 개선 루프 |
| [performance.md](performance.md) | 렌더링과 성능 |
| [product.md](product.md) | Wake 제품 목적과 사용자 흐름 |
| [quality.md](quality.md) | Wake 검증과 운영 |
| [regression.md](regression.md) | 회귀 고정 장치 |
| [screens/README.md](screens/README.md) | 화면 명세 |
| [screens/account-menu.md](screens/account-menu.md) | 계정 메뉴 |
| [screens/agent-detail.md](screens/agent-detail.md) | 에이전트 상세 |
| [screens/agents.md](screens/agents.md) | 에이전트 목록 |
| [screens/ai-context.md](screens/ai-context.md) | AI 칸 · 문맥 칩 |
| [screens/ai-history-detail.md](screens/ai-history-detail.md) | AI 작업 기록 상세 |
| [screens/ai-history.md](screens/ai-history.md) | AI 작업 기록 목록 |
| [screens/ai-panel.md](screens/ai-panel.md) | AI 칸 · 대화 |
| [screens/alert-detail.md](screens/alert-detail.md) | 알림 상세 |
| [screens/alerts.md](screens/alerts.md) | 알림 목록 |
| [screens/approval.md](screens/approval.md) | AI 칸 · 승인 시트 |
| [screens/common.md](screens/common.md) | 화면 공통 계약 |
| [screens/costs.md](screens/costs.md) | 비용 |
| [screens/dialog-ai-client.md](screens/dialog-ai-client.md) | 다이얼로그 · 외부 AI 클라이언트 추가 |
| [screens/dialog-chat-delete.md](screens/dialog-chat-delete.md) | 다이얼로그 · 대화 삭제 확인 |
| [screens/dialog-folder-delete.md](screens/dialog-folder-delete.md) | 다이얼로그 · 북마크 폴더 삭제 확인 |
| [screens/dialog-folder-rename.md](screens/dialog-folder-rename.md) | 다이얼로그 · 북마크 폴더 이름 변경 |
| [screens/dialog-group-bookmark.md](screens/dialog-group-bookmark.md) | 다이얼로그 · 탭 그룹 북마크 저장 |
| [screens/dialog-namespace.md](screens/dialog-namespace.md) | 다이얼로그 · namespace 표시 목록 추가 |
| [screens/dialog-permission.md](screens/dialog-permission.md) | 다이얼로그 · 필요한 권한 시트 |
| [screens/dialog-quit.md](screens/dialog-quit.md) | 다이얼로그 · 앱 종료 확인 |
| [screens/dialog-update-error.md](screens/dialog-update-error.md) | 다이얼로그 · 업데이트 실패 |
| [screens/event-detail.md](screens/event-detail.md) | 이벤트 상세 |
| [screens/events.md](screens/events.md) | 이벤트 목록 |
| [screens/evidence.md](screens/evidence.md) | 근거 상세 |
| [screens/gitops-detail.md](screens/gitops-detail.md) | GitOps 상세 |
| [screens/gitops.md](screens/gitops.md) | GitOps 목록 |
| [screens/helm-detail.md](screens/helm-detail.md) | Helm 릴리스 상세 |
| [screens/home.md](screens/home.md) | 홈 |
| [screens/incident-action.md](screens/incident-action.md) | 인시던트 · 조치 |
| [screens/incident-cause.md](screens/incident-cause.md) | 인시던트 · 원인 |
| [screens/incident-record.md](screens/incident-record.md) | 인시던트 · 감사 기록 |
| [screens/incident-scope.md](screens/incident-scope.md) | 인시던트 · 범위 |
| [screens/incident-timeline.md](screens/incident-timeline.md) | 인시던트 · 시간순 변화 |
| [screens/incident-verify.md](screens/incident-verify.md) | 인시던트 · 복구 확인 |
| [screens/incident-workspace.md](screens/incident-workspace.md) | 인시던트 작업면 |
| [screens/incidents.md](screens/incidents.md) | 인시던트 목록 |
| [screens/logs.md](screens/logs.md) | 로그 |
| [screens/metrics.md](screens/metrics.md) | 지표 |
| [screens/network.md](screens/network.md) | 네트워크 |
| [screens/new-tab.md](screens/new-tab.md) | 새 탭(삭제됨) |
| [screens/onboarding-ai.md](screens/onboarding-ai.md) | 첫 실행 · AI 연결 |
| [screens/onboarding-clusters.md](screens/onboarding-clusters.md) | 첫 실행 · 클러스터 연결 |
| [screens/onboarding-done.md](screens/onboarding-done.md) | 첫 실행 · 준비 완료 |
| [screens/onboarding-permission.md](screens/onboarding-permission.md) | 첫 실행 · 권한 선택(삭제됨) |
| [screens/onboarding-welcome.md](screens/onboarding-welcome.md) | 첫 실행 · 시작(삭제됨) |
| [screens/palette.md](screens/palette.md) | 명령 팔레트 |
| [screens/report.md](screens/report.md) | 보고서 |
| [screens/resource-events.md](screens/resource-events.md) | 리소스 상세 · 이벤트 |
| [screens/resource-list.md](screens/resource-list.md) | 리소스 목록 |
| [screens/resource-logs.md](screens/resource-logs.md) | 리소스 상세 · 로그 |
| [screens/resource-relations.md](screens/resource-relations.md) | 리소스 상세 · 관련 |
| [screens/resource-rollout.md](screens/resource-rollout.md) | Deployment 상세 · 롤아웃 |
| [screens/resource-runs.md](screens/resource-runs.md) | CronJob 상세 · 실행 |
| [screens/resource-summary.md](screens/resource-summary.md) | 리소스 상세 · 요약 |
| [screens/resource-yaml.md](screens/resource-yaml.md) | 리소스 상세 · YAML |
| [screens/search.md](screens/search.md) | 검색 결과 |
| [screens/settings-agents.md](screens/settings-agents.md) | 설정 · 에이전트 연결 설정 |
| [screens/settings-ai-chat.md](screens/settings-ai-chat.md) | 설정 · AI 대화 |
| [screens/settings-ai-connect.md](screens/settings-ai-connect.md) | 설정 · 외부 AI 연결 |
| [screens/settings-ai-models.md](screens/settings-ai-models.md) | 설정 · AI 모델 |
| [screens/settings-appearance.md](screens/settings-appearance.md) | 설정 · 모양 |
| [screens/settings-archive.md](screens/settings-archive.md) | 설정의 보관 자료 |
| [screens/settings-cluster-detail.md](screens/settings-cluster-detail.md) | 설정 · 클러스터 개별 설정 |
| [screens/settings-clusters.md](screens/settings-clusters.md) | 설정 · 클러스터 목록 |
| [screens/settings-general.md](screens/settings-general.md) | 설정 · 일반 |
| [screens/settings-git.md](screens/settings-git.md) | 설정 · Git 연결 |
| [screens/settings-permissions.md](screens/settings-permissions.md) | 설정 · 권한 |
| [screens/settings-tools.md](screens/settings-tools.md) | 설정 · 도구 연결 설정 |
| [screens/settings.md](screens/settings.md) | 설정 탐색과 틀 |
| [screens/sidebar.md](screens/sidebar.md) | 사이드바 |
| [screens/terminal.md](screens/terminal.md) | 터미널 |
| [screens/tool-api.md](screens/tool-api.md) | 도구 HTTP 조회 |
| [screens/tool-detail.md](screens/tool-detail.md) | 도구 상세 |
| [screens/tools.md](screens/tools.md) | 도구 목록 |
| [screens/topbar.md](screens/topbar.md) | 위 경로 막대와 구역 탭 |
| [security.md](security.md) | 보안과 권한 |
| [sre.md](sre.md) | SRE 필요 정보와 검수 명세 |
| [tasks.md](tasks.md) | 중간 머지와 영역별 남은 작업 |
