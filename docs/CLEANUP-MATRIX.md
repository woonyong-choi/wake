# Cleanup Matrix

상태 의미:

- `삭제`: 기본 경로, route, service, 문서, 설정과 실행 구현을 제거
- `격리`: 외부에서 호출할 route/service가 없고 migration·핵심 영속 계약만 남김
- `유지`: Golden Path에 직접 필요하며 대체 불가 근거가 있음

| 감사 항목 | 상태 | 처리와 근거 |
|---|---|---|
| 1. 범용 AI 채팅 | 삭제 | frontend chat route/components, AI router/domain, chat·fallback workers, LLM 서술 보강과 conversation API types를 제거. RCA는 YAML rule과 evidence signal만 사용 |
| 2. 직접 클러스터 명령 실행 | 격리 | command worker/janitor, gateway router/handler/action catalog/repository, operation broker, agent executor, `pods/exec` RBAC를 제거. `AgentCommand` models/events는 migration과 기존 GitOps 참조 때문에 유지하며 호출 가능한 실행 메서드는 없음 |
| 3. 비용·트래픽·웹 터미널 | 삭제 | frontend, domains, contracts, evidence query, route, terminal/port-forward agent·realtime 구현을 제거 |
| 4. node collector | 삭제 | service, manager/spec, provider, chart values/env/RBAC, 관련 test와 install flag를 제거 |
| 5. 광범위한 CD orchestration | 격리 | release-flow, auto-revert, poll/diff/render/workflow controller와 direct deploy API를 제거. GitOps repository/model은 base SHA 고정, webhook lifecycle, Draft PR, 사후 검증의 권위 원장이라 유지 |
| 6. 거대한 dashboard | 격리 | frontend dashboard, HTTP route, dashboard repository·ready stream과 fleet/home projection을 제거. RCA·change query가 공유하는 `RcaTimeline` 영속 모델만 유지 |
| 7. 개인 AWS/Cloudflare 배포 경로 | 삭제 | Terraform, 개인 workflow/script/launcher, cloudflared manifest, AWS deploy catalog와 Secrets Manager adapter를 제거. EKS 같은 provider 문자열은 수집 증거의 cluster metadata 분류에만 존재 |
| 8. `.gitops` 실행 산출물 | 삭제 | 추적되던 실행 결과 307개를 제거하고 `.gitops/`를 ignore. 소스의 `.gitops/safe-pr` 문자열은 대상 GitOps 저장소 안에 생성할 review 문서/patch 경로 계약이며 이 저장소 runtime 출력이 아님 |
| 9. 과거 제품명과 실험 코드 | 삭제 | 과거 제품명, matchmaking/lobby/handoff/color-turf 전용 RCA·demo workspace·참조 기능 catalog와 연결 test를 제거. 별도 교육 계획 문서는 제품 진입점과 검사 대상에서 제외하고 내용은 변경하지 않음 |

## 보존 판단

- read-only Kubernetes snapshot provider: 장애 시점 Pod/Event 증거의 유일한 수집 경로
- deterministic cause catalog: 근거와 결론의 재현 가능한 연결
- GitOps authority/source patch: repository·manifest·base SHA·source digest를 고정하는 안전 경계
- GitHub SCM worker: 변경을 실행하지 않고 리뷰 가능한 Draft PR로 넘기는 유일한 쓰기 경계
- recovery verification worker: 배포 후 증거 재수집과 terminal outcome 기록
