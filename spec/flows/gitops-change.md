# Git 연결·Draft PR·배포 추적

GitOps 읽기 연결, Git 계정 쓰기 연결, Draft PR 생성은 별개다. Argo 읽기성공이나 시험Git 준비를 PR 기능 완료로 표시하지 않는다.

공통: [권한·대상·7상태·왕복·원본 대조·표시](../product.md#공통-계약-적용). 현재는 소스 확인, 시험·캡처·실제 연결 합격은 별도다.

## FLOW-GIT-001: GitOps 읽기와 Git 계정 연결

- 목표: 입력: Argo 읽기 연결만 성공한 상태에서 Git 계정 화면을 열고 읽기 전용 Git 자격으로 변경을 요청한다 → 기대: 연결한 Argo/Flux에서 실제 Application/Kustomization/HelmRelease 등의 repo/path/revision/destination/sync/health/resources/history를 읽는다. Git 계정 연결은 권한·서버주소·저장소 범위를 확인하고 credential을 보안 저장소에 둔다. GitOps 읽기 토큰으로 Git 쓰기 권한이 있다고 가정하지 않는다. 계정 미연결은 실제 설정 진입으로 안내하고 승인 후 PR 실패와 구분한다. GitHub 성공과 시험 Gitea 성공은 별개 판정이다. → 실패: Argo 토큰으로 Git 쓰기 가능을 표시하거나 Git 미연결을 PR 생성 성공으로 표시하면 실패
- 현재: `apps/wake/data/index.js:132`의 gitAccounts는 github 미연결 키다.
- 차이: Git 계정·서버·저장소 권한을 연결하는 서비스가 없어 Argo 읽기와 Git 쓰기 연결을 완성할 수 없다. → TASK-A3-GIT-001
- 고정 장치: 고정 없음 → TASK-A3-GIT-001
- 출처: D00026 D00031 D00402 D00453 D00456 D00619 D00624 D00636 D00659 D00972 D00986 D00987; R-046,R-053; 1차 U-29,U-37.

## FLOW-GIT-002: Draft PR부터 적용까지

- 목표: 입력: 승인한 plan.values·base revision으로 Draft PR 생성 요청이 timeout난 뒤 같은 approval ID로 재시도한다 → 기대: 승인한 모든 변경값과 base revision으로 제한된 diff를 만든다. 같은 승인 ID의 생성 재시도는 동일 PR을 반환한다. 실제 Draft PR 번호/URL/작성 대상 branch/base/head SHA를 저장하고 사람이 review·merge한다. 앱은 review/정책/merge SHA→Argo revision→rollout→증상 관측을 순서대로 읽는다. PR 생성·리뷰·병합·sync·health는 각각 서버 근거가 필요하며 앞 단계 성공으로 뒷 단계 완료를 만들지 않는다. → 실패: PR이 두 개 생기거나 실제 번호·URL·head SHA 없이 생성 완료로 표시하면 실패
- 현재: `apps/wake/desktop/approvals.cjs:49`는 github 유무에 따라 pending/github-unconnected 문자열만 저장한다.
- 차이: Draft PR 번호·URL·base/head SHA를 생성·저장하는 Git API 호출이 없다. → TASK-A3-GIT-002
- 고정 장치: 고정 없음 → TASK-A3-GIT-002
- 출처: D00627 D00628 D00632 D00634 D00636 D00648 D00742 D00743 D00869; R-053,R-054; lab2/DESIGN.md:78,230.

<a id="FLOW-GIT-003"></a>

## FLOW-GIT-003: 배포 단계·판단·재시도

- 목표: 입력: Application revision A는 성공, B는 PreSync 실패이며 health=Healthy지만 workload Available=False인 상태로 탭에 복귀한다 → 기대: 한 카드에는 한 GitOps 대상의 공급자·Git source·동작·현재 상태를 보여 준다. 감지→승인 필요 시 대기→적용→건강 확인→관측은 실제 revision/attempt에 묶는다. 여러 트리거를 시각 요약으로 묶어도 원본 기록은 유지한다. CI는 실제 CI 근거가 있을 때만 표시한다. Synced와 Healthy는 별개이며 Kubernetes Available=False 같은 반례도 보여 준다. 실패 단계의 허용된 retry/보류/수동 sync는 capability와 사람 승인 뒤만 실행한다. Argo/Flux가 지원하지 않는 rollback을 같은 버튼 성공으로 만들지 않는다. 탭으로 돌아오면 재조회한다. 현재 읽기 성공이 이어질 때 ‘감시 중’ 옆에 같은 Application UID의 마지막 데이터 읽기 성공 시각을 표시한다(SRE-Q-21). 시각을 생략하거나 probe·과거 적용 성공 시각으로 대신하면 실패다. GitOps 조회 방식·주기 미상·경계 시각 판정은 [RULE-STATE](../rules.md#RULE-STATE)에 연결한다. → 실패: A의 성공이 B에 붙거나 Available=False가 숨거나 미지원 rollback을 성공으로 표시하면 실패.
- 추가 조건: 입력 Flux 조정 중, 적용/확인 단계의 구분 근거 없음 → 기대 조정 중임과 세부 단계 미확인을 함께 표시 → 실패 특정 세부 단계를 추정하거나 미확인이라는 사실을 생략.
- 추가 조건: 입력 health check 미구성 사례와 구성되어 있으나 확인 자료 없는 사례 → 기대 전자는 상태 검사 없음, 후자는 상태 미확인으로 구별 → 실패 두 상태를 합치거나 둘 중 하나를 성공으로 바꿈
- 현재: `apps/wake/data/gitops.js:104`의 syncHistory가 실제 이력을 정리하고 :134의 appRows가 sync·health·revision을 분리한다.
- 차이: `gitops-detail.js:156`의 동작에는 승인된 retry·보류·sync 실행 경로가 없다. → TASK-A3-GIT-003
- 고정 장치: 고정 없음 → TASK-A3-GIT-003
- 출처: D-USR-2026-11-16-7; D00063 D00650 D00688 D00728 D00100 D00101 D00102 D00103 D00104 D00105 D00106 D00402 D00403 D00453 D00505 D00617 D00618 D00619 D00621 D00622 D00623 D00624 D00627 D00628 D00630 D00631 D00632 D00633 D00636 D00659 D00681 D00690 D00691 D00693 D00694; R-046,R-053.

<a id="FLOW-GIT-004"></a>

## FLOW-GIT-004: 변경 비교·되돌릴 지점·이력

- 목표: 입력: GitOps diff가 여러 경로의 ConfigMap 변경만 포함한 배포에서 이전 revision을 골라 비교한다 → 기대: 여러 파일의 중첩 경로 트리와 선택한 diff를 유지한다. diff는 -클러스터/+Git 방향을 밝히고 차이 없음/권한 없음/미지원/읽기 실패를 구별한다. 짧은 commit hash와 공급자 icon은 실제 commit link 하나다. 이전 한 개만 아니라 실제 revision/history에서 되돌릴 지점을 고르고 그 diff·영향·현재 base를 확인한다. Git 관리 대상의 영속 복원은 Git 변경이며 임시 cluster rollback과 구분한다. 현재 단계 관련 이력·로그를 기본으로 보이고 모든 과거 기록을 무제한 펼치지 않는다. 설정만 바뀐 rollout도 차이를 보인다. → 실패: 이미지 불변을 차이 없음으로 표시하거나 -클러스터/+Git 방향을 바꾸거나 없는 revision으로 복원을 제안하면 실패.
- 추가 조건: 입력 유효 revision·저장소 URL의 GitOps 요약 → 기대 해시/아이콘 링크는 유지하고 “적용 리비전” 장식 라벨 제거 → 실패 라벨이 남거나 링크 동작/대상 소실.
- 현재: `apps/wake/pages/gitops-detail.js:97`의 fileTree와 :102의 diffCard가 파일 선택·방향 문구를 표시한다.
- 차이: 이전 revision 선택에서 실제 Git 변경 PR을 만드는 경로는 approvals.cjs:49의 pending 상태에 멈춘다. → TASK-A3-GIT-004
- 고정 장치: 고정 없음 → TASK-A3-GIT-004
- 출처: D00050 D00324 D00326 D00347 D00367 D00426 D00453 D00456 D00634 D00635 D00636 D00637 D00639 D00931 D01037; R-046,R-052,R-053; lab2/DESIGN.md:77.
