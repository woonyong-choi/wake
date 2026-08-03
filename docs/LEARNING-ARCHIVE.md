# Kubernetes 장애 처리 파이프라인 학습 아카이브

이 문서는 프로젝트를 구현하며 확인한 백엔드·Kubernetes·GitOps 개념을 실제 코드와 테스트에 연결한다. 저장소 전체 기능을 나열하지 않고 ImagePullBackOff 한 경로를 기준으로 입력, 상태 전이, 권한과 실패 조건을 따라간다.

## 1. 장애 증거를 먼저 고정한다

### 문제

장애가 발생한 뒤 현재 상태만 조회하면 원인 분석 시점의 Pod 상태와 Event가 이미 달라질 수 있다. 원인 판단과 변경 결과를 비교하려면 장애 당시 증거를 식별 가능한 단위로 보존해야 한다.

### 구현

- event root는 [`event()`](../src/packages/events/envelope.py)에서 `event_id`와 Correlation ID를 만든다.
- 후속 worker는 [`_collect()`](../src/packages/runtime/dispatch.py)에서 부모의 Correlation ID와 causation ID를 이어받는다.
- cluster agent는 Kubernetes API를 읽기 전용으로 조회하고, cluster·namespace·resource identity가 포함된 evidence payload를 반환한다.
- 원본 evidence reference는 incident, 변경 제안과 실패 이벤트까지 전달한다.

### 확인할 코드

```text
src/packages/events/envelope.py
src/packages/runtime/dispatch.py
src/services/target/cluster-agent/evidence/collector.py
src/services/target/cluster-agent/providers/kubernetes_providers.py
```

### 검증

```bash
uv run pytest -q \
  tests/test_golden_path_safety_contracts.py \
  tests/test_target_evidence_scope.py
```

핵심 검증은 child event가 동일한 Correlation ID를 유지하는지, agent가 Kubernetes mutation API를 갖지 않는지, 실패 이벤트에도 원본 evidence reference가 남는지다.

## 2. 상태 기계와 멱등성으로 중복 사건을 막는다

### 문제

Event bus는 재전달될 수 있고 agent도 같은 장애를 여러 수집 주기에서 관측한다. 메시지를 한 번만 받는다고 가정하면 incident와 Draft PR이 중복 생성된다.

### 구현

- worker processing ledger는 `(event_id, consumer)` 조합으로 처리 결과를 기록한다.
- incident claim은 workspace·cluster·signal identity에 unique constraint를 둔다.
- 이미 열린 동일 Draft PR이 있으면 새 PR 대신 기존 PR을 재사용한다.
- 재시도 가능한 실패와 종료 실패를 reason code로 구분한다.

### 확인할 코드

```text
src/packages/runtime/worker.py
src/domains/rca/models.py
src/services/ai/incident-worker/app.py
src/services/gitops/scm-worker/github_provider.py
```

### 검증

```bash
uv run pytest -q \
  tests/test_incident_signal_identity.py \
  tests/test_recovery_retry_state.py \
  tests/test_safe_pr_structured_base_advance.py
```

테스트에서는 같은 alert와 evidence window를 반복 주입해 incident가 하나로 유지되는지, base branch가 전진한 뒤에도 기존 PR 재전달이 중복 PR을 만들지 않는지 확인한다.

## 3. 원인 판정과 설명 생성을 분리한다

### 문제

LLM의 자연어 답변을 원인 판정의 권위로 사용하면 같은 증거에 결과가 달라질 수 있고, 수정 가능한 범위도 통제하기 어렵다.

### 구현

- ImagePullBackOff의 원인 후보는 versioned YAML catalog와 exact signal match로 판정한다.
- `wrong_image_tag`처럼 안전한 manifest 수정으로 연결되는 원인만 자동 제안 대상으로 남긴다.
- image pull secret 부재나 registry 장애는 관측 결과로 남기고 자동 변경하지 않는다.
- 증거가 부족하면 정상 완료로 위장하지 않고 `insufficient_evidence`로 종료한다.

### 확인할 코드

```text
src/services/ai/agent/causes/
src/services/ai/agent/pipeline/causes.py
src/services/ai/rca-worker/app.py
```

### 검증

```bash
uv run pytest -q \
  tests/test_golden_path_safety_contracts.py \
  tests/test_recovery_gitops_authority.py
```

이 구조에서 AI는 변경 권한의 근거가 아니다. 자동화의 권위는 수집된 증거, 규칙과 GitOps source identity에서 나온다.

## 4. YAML 전체가 아니라 허용된 scalar만 바꾼다

### 문제

manifest 전체를 모델이나 문자열 치환에 맡기면 의도하지 않은 field, 다른 workload 또는 Kustomize base까지 함께 바뀔 수 있다.

### 구현

- [`source_patch.py`](../src/domains/gitops/source_patch.py)는 대상 kind를 Deployment로 제한한다.
- 변경 action과 manifest path를 allowlist로 검사한다.
- 변경 전 scalar, 변경 후 scalar와 inverse rollback 값을 함께 고정한다.
- repository, branch, manifest path, base SHA와 source SHA-256이 모두 있어야 patch를 만든다.
- 같은 대상에서 승인되지 않은 형제 field가 바뀌면 실패한다.

### 검증

```bash
uv run pytest -q \
  tests/test_recovery_merge_scope.py \
  tests/test_recovery_kustomize_edit_source.py \
  tests/test_golden_path_safety_contracts.py
```

## 5. 승인 이후의 base branch 변화도 다시 확인한다

### 문제

변경안을 계산한 뒤 PR을 만드는 사이 base branch가 전진할 수 있다. 처음 읽은 SHA만 신뢰하면 다른 코드 위에 오래된 판단을 적용한다.

### 구현

- 승인 시점의 base SHA와 source digest를 저장한다.
- branch와 file을 준비한 뒤 PR POST 직전에 base ref를 다시 조회한다.
- 현재 base SHA가 승인된 SHA와 다르면 변경 내용을 비교하고, 허용되지 않은 변화가 있으면 PR 생성을 중단한다.
- GitHub 요청에 `draft: true`를 강제하고 non-Draft 응답도 실패로 처리한다.
- provider에는 merge API와 base branch direct commit 경로가 없다.

### 확인할 코드

```text
src/services/gitops/scm-worker/github_provider.py
src/domains/scm/policy.py
```

### 검증

```bash
uv run pytest -q tests/test_safe_pr_structured_base_advance.py
```

대표 테스트는 PR 생성 직전 base SHA를 실제로 다시 읽는지, base 전진이 target scalar를 바꿨을 때 fail-closed 하는지, GitHub가 non-Draft PR을 반환하면 거부하는지 확인한다.

## 6. 배포 성공과 장애 해소를 같은 상태로 보지 않는다

### 문제

PR merge나 배포 성공은 manifest가 적용됐다는 뜻이지 장애가 해결됐다는 뜻은 아니다. 이전 evidence를 다시 읽으면 변화가 없는데도 성공으로 판정할 수 있다.

### 구현

- 서명된 merge·deploy lifecycle event 뒤 verification을 시작한다.
- verification 시작 시각보다 오래된 evidence window는 거부한다.
- 다음 agent 수집 주기의 Pod Ready, ImagePullBackOff와 보호된 baseline을 같은 resource identity로 비교한다.
- 중복·stale window는 안정화 시간을 진행시키지 않는다.
- 기준선이 없거나 수집이 끊기면 성공 대신 실패 원인을 저장한다.

### 확인할 코드

```text
src/domains/rca/recovery_verification.py
src/services/ai/rca-feedback-worker/app.py
tests/test_recovery_verification.py
```

### 검증

```bash
uv run pytest -q tests/test_recovery_verification.py
```

## 7. 프로젝트 종료 후 제거한 것

초기 구현은 범용 채팅, 직접 명령, 웹 터미널, 비용·트래픽 화면, node collector와 광범위한 배포 흐름을 함께 포함했다. 기능 수가 늘면서 대표 경로와 권한 경계를 설명하기 어려워졌다.

포트폴리오 정리에서는 다음 기준으로 제거했다.

- ImagePullBackOff 경로에 입력이나 소비자로 연결되지 않음
- 클러스터 직접 변경 가능성을 만듦
- 개인 AWS·Cloudflare 환경에 종속됨
- 실행 산출물이나 과거 실험임
- UI는 남아 있지만 backend route가 없음
- migration 호환 이외의 실행 참조가 없음

삭제·격리 근거는 [Cleanup Matrix](./CLEANUP-MATRIX.md)에 정리했다.

## 8. 검증 범위와 남은 과제

확인한 범위:

- Python lint·compile·pytest
- frontend typecheck·lint·unit·production build
- Helm template와 read-only RBAC
- in-process/NATS event semantics
- Docker image build
- Alembic baseline

확인하지 못한 범위:

- 실제 GitHub App이 만든 Draft PR
- 실제 Kubernetes 장애 주입부터 복구까지의 외부 E2E
- 운영 트래픽과 장기 실행
- ImagePullBackOff 이외 장애의 동일 수준 완결성

로컬 계약 테스트 통과를 실서비스 운영 경험이나 복구 성능으로 확대하지 않는다.
