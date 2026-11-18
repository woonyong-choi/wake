# 인시던트 감지·묶기·재발·복구

감지부터 보고까지 하나의 incident ID와 실제 시각으로 이어진다. 현재 순수 모델의 수치와 목표 수용 조건을 구분한다. PRD-006의 7상태 및 source/target/time 계약을 모든 단계에 적용한다.

공통: [권한·대상·7상태·왕복·원본 대조·표시](../product.md#공통-계약-적용). 현재는 소스 확인, 시험·캡처·실제 연결 합격은 별도다.

## FLOW-INC-001: 신호 수집과 감지

- 목표: 입력: Pod waiting.reason=ImagePullBackOff, PVC Pending, 대상 없는 firing Alert와 Watchdog을 수집한다 → 기대: AI 없이 Kubernetes Warning/Event·Pod container 상태·Alertmanager firing에서 같은 대상의 신호를 감지하고 원본 reason·알림 이름·UID·시각을 보존한다. ImagePull을 CrashLoop로, PVC를 Node로 바꾸거나 대상 없는 알림을 버리지 않는다. Watchdog의 용도·분류는 [RULE-CHIPS](../rules.md#RULE-CHIPS)를 따른다. (기본값 채택, 번복 가능) OPEN-PF-001: OOMKilled/OOMKilling→critical oom-limit, CrashLoopBackOff→critical crash-loop, 컨테이너 재시작으로 확인한 BackOff→warning crash-loop, FailedScheduling→warning unschedulable, NodeNotReady→critical node-not-ready, BackoffLimitExceeded/DeadlineExceeded→warning job-failed를 사용한다. ErrImagePull/ImagePullBackOff와 이미지 가져오기 BackOff는 warning image-pull, Application 배포 실패는 warning gitops-failed, PVC Pending은 warning volume-pending으로 분리한다. 대상 없는 알림은 cluster 범위로 남기고 알림 원본 severity를 보존한다. → 실패: ImagePull이 crash-loop가 되거나 PVC가 Node로 바뀌거나 Watchdog이 장애 사건으로 표시되면 실패
- 현재: `apps/wake/data/incident-detect.js:13`의 SIGNALS는 BackOff를 crash-loop로 매핑하고 ImagePull 전용 항목은 없다.
- 차이: 이미지 가져오기 BackOff가 crash-loop로 오분류되고 PVC·Application 전용 감지가 없다. → TASK-A3-INC-001
- 고정 장치: `apps/wake/data/incident-detect.test.mjs`, 시험 `an OOMKilled container, a BackOff event and a firing alert of one Deployment become one incident with a stable id`
- 출처: D-USR-2026-11-16-7; D00463 D00470 D00738 D00742 D00743 D00779 D00987 D01006 D01037; R-001,R-033,R-049,R-050; 1차; lab2/DESIGN.md:67-79.

## FLOW-INC-002: 대상 소유 관계와 중복 묶기

- 목표: 입력: Pod ownerReferences가 ReplicaSet→Deployment로 이어지고 같은 Event UID를 재수신한 뒤 같은 이름의 새 Pod UID가 생긴다 → 기대: Pod는 controller ownerReferences를 따라 ReplicaSet→Deployment 또는 Job→CronJob 등 최상위 workload에 묶되 cluster/namespace/group/kind/UID를 보존한다. 같은 Event 재전송·count 증가·동일 fingerprint·watch 재연결은 새 사건을 만들지 않는다. 다른 대상·새 UID·종료 뒤 새 발생은 분리한다. 신호 행 수와 Event.count 발생 횟수는 다르다. 과거 Pod가 없어져도 당시 소유 관계 스냅샷으로 연결하며 동명이 새 Pod를 옛 사건에 붙이지 않는다. → 실패: 재수신이 새 사건을 만들거나 새 UID가 이름만 같다는 이유로 옛 사건에 붙으면 실패
- 현재: `apps/wake/data/incident-detect.js:38`의 ownerChain은 최대 4단계를 추적하며 keyOf는 kind·namespace·name만 결합한다.
- 차이: 동일성 키에 UID가 없어 같은 이름의 새 객체가 이전 사건에 합쳐질 수 있다. → TASK-A3-INC-002
- 고정 장치: `apps/wake/data/incident-detect.test.mjs`, 시험 `ownerReferences lead from a Pod through its ReplicaSet to the Deployment`
- 출처: D00093 D00452 D00734 D00743 D00987 D01025 D01037; R-020,R-021,R-033,R-047,R-050; 1차

## FLOW-INC-003: 목록에서 범위·원인·조치·확인

- 목표: 입력: incident.workspace.id=i1을 목록·사이드바에서 열고 범위·원인·조치·확인을 차례로 선택한다 → 기대: 목록과 sidebar 열린 사건은 같은 저장소 목록의 id/번호/title/phase/result/detectedAt/duration/symptoms/alert refs를 쓴다. 사건을 누르면 incident.workspace의 범위→원인→조치→확인을 같은 작업면에서 이동한다. 범위는 대상 상태·사용자 영향·변경·연관 리소스, 원인은 관측/기준/해석/검증/미확인/근거, 조치는 모든 before/after·위험·권한·경로·승인, 확인은 조건별 pass/fail/miss·연속 기간·결손을 보여 준다. 수동 메모 입력은 만들지 않고 승인자·권한·시각을 자동 감사로 남긴다. → 실패: 번호·단계·결과가 서로 다르거나 원인 가설이 근거 없이 확정으로 보이면 실패
- 현재: `apps/wake/desktop/incident-hub.cjs:205`의 workspace는 scope·cause chain·options·verify 자료를 구성한다.
- 차이: 승인 뒤 실행 여부와 무관하게 chosen·approvedAt이 채워져 조치 선택과 실제 실행 단계를 구분할 receipt가 없다. → TASK-A3-INC-003
- 고정 장치: `apps/wake/data/incident-model.test.mjs`, 시험 `verifyCounts and causeStatus`
- 출처: D00092 D00984 D00648 D00734 D00742 D00743 D00779 D00869 D00883 D00912 D00952 D00955 D01004; R-050,R-051,R-070; 1차 ).

## FLOW-INC-004: 증거 수집과 가설

- 목표: 입력: incident i1의 동일 절대 구간에서 로그 읽기만 403이고 지표·Event 수집은 성공한다 → 기대: 증거는 incident ID·대상 UID·source/query·절대 window·collectedAt·coverage·결과를 묶은 불변 스냅샷이다. 지표/로그/Event/Kubernetes/Argo를 같은 조사 구간에서 읽고 성공 자료와 실패 출처를 함께 남긴다. 원인은 관측 근거가 있는 가설이며 단순 시간상 일치를 원인 확정으로 표시하지 않는다. 판정 뒤 추가 근거는 별도 표시한다. 외부 팀 회신은 실행자·티켓·시간을 가진 근거로 저장한다. 앱을 껐던 구간은 수집 누락이다. → 실패: 실패 출처가 evidence 목록에서 사라지거나 인용할 때 다른 snapshot hash를 열면 실패
- 현재: `apps/wake/desktop/incident-hub.cjs:162`의 Event 수집과 :169의 지표 수집은 catch에서 null을 반환한다.
- 차이: 읽기 실패를 evidence로 저장하지 않아 성공 근거와 함께 실패 출처를 볼 수 없다. → TASK-A3-INC-004
- 고정 장치: 고정 없음 → TASK-A3-INC-004
- 출처: D00089 D00464 D00465 D00471 D00472 D00660 D00734 D00742 D00884 D00885; R-034,R-035,R-036,R-070,R-071.

## FLOW-INC-005: 완화·재발·복구 관찰

- 목표: → [RULE-RECOVERY](../rules.md#RULE-RECOVERY).

- 현재: `apps/wake/data/incident-model.js:185`는 miss 개수만큼 기한을 연장하고 :188은 전체 경과에서 miss 시간을 뺀다.
- 차이: 연속 5분 대신 누락 전후 성공 시간을 합산하며 기한을 최대 20분까지 늘린다. incident-hub.cjs:64의 없는 대상 ready도 잘못된 복구를 허용한다. → TASK-A3-INC-005
- 고정 장치: `apps/wake/data/incident-model.test.mjs`, 시험 `verifyVerdict: pending, pass, fail and the blind-window deadline`
- 출처: D-USR-2026-11-16-7; D-USR-2026-11-16-3; D00100 D00734 D00738 D00742 D00743 D01037; R-001,R-033,R-054,R-071; 1차 U-34,U-45~U-52.

## FLOW-INC-006: 상황별 흐름 검수와 한계

- 목표: 입력: s2 ImagePull·x05 PVC·x10 동시 장애를 포함한 20개 시나리오에서 원본 신호와 감지·조치·복구 결과를 기록한다 → 기대: 20개 lab2 시나리오의 현재 예상과 목표를 혼동하지 않는다. s1 OOM/s2 ImagePull/s3 5xx/s4 Pending/s5 PreSync/s6 장기 Redis/s7 평상시/u52 수동 조치와 x01 drift/x02 잘못된 manifest/x03 netpol/x04 CronJob/x05 PVC/x06 HPA/x07 설정 rollout/x08 cordon/x09 인증서/x10 동시/x11 폭주/x12 prune를 모두 관련 흐름에 연결한다. 현재 0건 또는 잘못된 대상 예상은 제품 정상 요구가 아니다; 실패: 현재 구현이 놓친 0건을 정상 기대값으로 바꾸거나 7일 관찰을 짧은 시연으로 대체하면 실패
- 현재: `apps/wake/data/incident-detect.js:13`에 ImagePull 전용 감지가 없고 `apps/wake/desktop/approvals.cjs:49`에 PR 생성 호출이 없다.
- 차이: s2·x05의 대상 분류와 PR 조치 시나리오는 현재 감지·실행 경로가 목표를 충족하지 않는다. → TASK-A3-INC-006
- 고정 장치: 고정 없음 → TASK-A3-INC-006
- 출처: D00738 D00743 D00744 D00747 D00774 D00785 D00786 D00973 D00974 D00975 D01037; lab2/DESIGN.md:186-209; R-065,R-070,R-071.
