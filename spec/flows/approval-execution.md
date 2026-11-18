# 조치 제안·사람 승인·실행·확인

AI 제안, 사람 승인, 실제 실행은 서로 다른 단계다.

공통: [권한·대상·7상태·왕복·원본 대조·표시](../product.md#공통-계약-적용). 현재는 소스 확인, 시험·캡처·실제 연결 합격은 별도다.

<a id="FLOW-APR-001"></a>

## FLOW-APR-001: 소유 관계로 조치 경로 결정

- 목표: Argo tracking-id와 Helm release 주석이 있는 resource.metadata.uid=p1의 메모리 변경을 제안한다. 현재 resource, 실제 Argo Application status.resources/tracking-id·destination, Helm managed-by/release-name/release-namespace로 소유 관계를 판단하고 아래 표의 경로와 위험 설명을 적용한다. Argo가 Helm 배포를 관리하면 Argo 정책을 먼저 판정한다. OPEN-PF-006의 기본값 채택 범위다.
- 공통 조건: 계획 target에 UID·cluster를 보존하고 values의 모든 path/before/after를 제시한다. 경로 선택은 실행 승인이 아니며 사람 승인과 실행 결과는 FLOW-APR-002·003으로 판정한다.
- 실패 조건: 자동 동기화 Argo 또는 정책 미확인 Argo에 rollout undo·kubectl patch 등 직접 쓰기를 권하면 실패다. 아래 표와 다른 경로를 고르거나 UID·cluster 또는 해당 위험 설명을 빠뜨려도 실패다.

| 대상·입력 | 경로 | 위험 설명·복원 조건 | 실패 조건 |
|---|---|---|---|
| 자동 Argo: auto=true | `pr`, Draft PR | 다음 sync가 직접 변경을 되돌릴 수 있다. Git 원본 변경과 실제 PR·merge·sync 근거로 적용·복원을 확인한다 | 직접 cluster 쓰기 또는 Git 반영 없이 영속 복원으로 표시 |
| 수동 Argo: auto=false | `command` | cluster 변경은 임시이며 다음 수동 sync가 덮어쓸 수 있다(`gitops-manual-drift`). 다음 sync 뒤에도 변경·복원을 유지해야 하면 실제 repo/path/base revision을 확인해 Git 변경을 별도 제안·승인하고 반영·sync까지 확인한다([FLOW-GIT-004](gitops-change.md#FLOW-GIT-004)) | command를 Git 소유라는 이유만으로 거절하거나 덮어쓰기 위험을 숨김; cluster 변경만으로 영속 복원이라고 표시 |
| 정책 미확인 Argo: auto=null 또는 정책을 읽지 못함 | `pr`, Draft PR | 자동 동기화 가능성을 배제할 수 없음을 `gitops-sync-unknown`으로 알린다. repo/path·Git 권한 확인 전에는 PR 생성 완료로 표시하지 않는다 | 정책을 수동으로 추정해 직접 쓰기를 권함 |
| Helm 소유: Argo 관리 근거 없음 | `helm`, release 경로 | release·namespace·chart와 전체 values 변경을 확인한다. chart를 모르면 명령을 만들지 않는다. Secret 없이 알 수 없는 revision/status는 “권한 범위 밖(Secret)”으로 남긴다 | chart·revision을 지어내거나 Secret을 읽거나 release 경로를 우회 |
| 무관리: Argo·Helm 소유 근거 없음 | `command` | `not-gitops`와 직접 변경의 영향·변경 전 값·되돌릴 지점을 제시한다. 실제 유효 revision이 없는 rollout undo를 확정하지 않는다 | 존재하지 않는 revision을 제시하거나 영향·복원 근거를 생략 |

- 현재: `apps/wake/data/ownership.js:85`의 planFor target은 kind/namespace/name뿐이고 `approvals.cjs:34`는 ownerOf에 cluster를 전달하지 않는다.
- 차이: 계획에 UID가 없으며 같은 이름의 다른 cluster 소유 관계를 제외하는 인수가 누락된다. → TASK-A3-APR-001
- 고정 장치: `apps/wake/data/ownership.test.mjs:62`의 `planFor: an auto-synced Argo CD target gets a Draft PR, never a cluster command (N2)`는 자동·정책 미확인의 PR 분기를 검사한다. :83의 `planFor: manual Argo CD, Helm and unowned resources`는 수동 command·gitops-manual-drift, Helm·chart 미확인, 무관리 command 분기를 검사한다. UID·cluster와 위험 문구의 실제 화면 표시는 별도 검증이다.
- 출처: D-USR-2026-11-16-7; D00634 D00636 D00742 D00743 D00869; R-052; 1차 U-36.

## FLOW-APR-002: 승인 요청과 결정

- 목표: → [RULE-APPROVAL](../rules.md#RULE-APPROVAL).
- 현재: `apps/wake/desktop/approvals.cjs:37`은 매 제안에 새 ID를 만들고 :46은 이미 결정된 상태를 replayed로 반환한다.
- 차이: 같은 제안 재전송이 새 승인 ID를 만들며 불변 계획 hash·base와 결정 시점 대상 재검증이 없다. → TASK-A3-APR-002
- 고정 장치: `apps/wake/desktop/hub.test.cjs`, 시험 `approvals keep the first decision, never run anything, and record a Draft PR that cannot be made without GitHub`
- 출처: D00466 D00473 D00648 D00742 D00869 D00912 D00965 D00966; R-036,R-040,R-052.

## FLOW-APR-003: 승인 뒤 실행 결과

- 목표: → [RULE-APPROVAL](../rules.md#RULE-APPROVAL).
- 현재: `apps/wake/desktop/approvals.cjs:49`의 decide는 PR 상태 문자열을 저장하고 실행 receipt를 생성하지 않는다.
- 차이: 허용 뒤 실제 PR 실패·수동 실행자·적용 시각·원본 변경을 기록할 수 없다. → TASK-A3-APR-003, TASK-A3-APR-004
- 고정 장치: 고정 없음 → TASK-A3-APR-003
- 출처: D00627 D00628 D00634 D00636 D00743 D00869; R-053,R-054,R-070; 1차 U-37,U-52; lab2/DESIGN.md:78.

## FLOW-APR-004: 실행 뒤 확인과 거절 후 재조사

- 목표: → [RULE-APPROVAL](../rules.md#RULE-APPROVAL).
- 현재: `apps/wake/data/incident-model.js:183`의 verifyVerdict는 관찰을 판정하지만 `approvals.cjs:51`은 승인만으로 hub.choose를 호출한다.
- 차이: 실제 실행 receipt 없이 선택 조치·approvedAt을 기록하므로 실행 성공과 복구 관찰의 연결이 없다. → TASK-A3-APR-005
- 고정 장치: 고정 없음 → TASK-A3-APR-005
- 출처: D00094 D00648 D00742 D00743 D00869; R-001,R-052,R-054; 1차 U-34,U-36,U-52.
