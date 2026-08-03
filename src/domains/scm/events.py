"""SCM gateway event body — Safe PR 생성 게이트: patch_prepared→diff.explained→ready_for_creation."""

from __future__ import annotations

from dataclasses import dataclass, field

from packages.contracts.event_bus.bodies.base import EventBody
from packages.contracts.event_bus.registry import event
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gitops import (
    DEFAULT_APPLICATION_ID,
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_ENVIRONMENT,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_REPO_REF,
    DEFAULT_REPOSITORY_ID,
    DEFAULT_WORKFLOW_RUN_ID,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID

SAFE_PR_KIND_PATCH = "safe_pr_patch"
SAFE_PR_KIND_REVIEW_DOC = "safe_pr_review_doc"
SAFE_PR_DELIVERY_PULL_REQUEST = "pull_request"


@dataclass(frozen=True)
class SafePrFilePatch(EventBody):
    """Safe PR branch에 커밋할 파일 변경."""

    path: str
    content: str
    description: str = ""


@event(EventSubject.SAFE_PR_REQUESTED)
@dataclass(frozen=True)
class SafePrRequestedBody(EventBody):
    """safe_pr.requested — PR 생성 요청(제목/본문/공급자)."""

    title: str
    body: str
    provider: str
    patches: list[SafePrFilePatch] = field(default_factory=list)
    pr_kind: str = SAFE_PR_KIND_PATCH
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    application_id: str = DEFAULT_APPLICATION_ID
    workflow_run_id: str = DEFAULT_WORKFLOW_RUN_ID
    environment: str = DEFAULT_ENVIRONMENT
    manifest_path: str = DEFAULT_MANIFEST_PATH
    repo_ref: str = DEFAULT_REPO_REF
    base_branch: str = ""
    commit_sha: str = ""
    cluster_id: str = ""
    target_namespace: str = ""
    target_resource: str = ""
    target_authority: str = ""
    patch_sha256: str = ""
    approval_ref: str | None = None
    policy_decision_ref: str | None = None
    evidence_ref: str = ""
    # Safe PR은 제안 경계다. base branch 쓰기나 다른 전달 모드는 허용하지 않는다.
    delivery: str = SAFE_PR_DELIVERY_PULL_REQUEST


@event(EventSubject.SAFE_PR_CREATED)
@dataclass(frozen=True)
class SafePrCreatedBody(EventBody):
    """safe_pr.created — scm-worker의 PR 생성 완료."""

    pr_url: str
    provider: str
    mode: str
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    application_id: str = DEFAULT_APPLICATION_ID
    workflow_run_id: str = DEFAULT_WORKFLOW_RUN_ID
    environment: str = DEFAULT_ENVIRONMENT
    manifest_path: str = DEFAULT_MANIFEST_PATH
    repo_ref: str = DEFAULT_REPO_REF
    base_branch: str = ""
    commit_sha: str = ""
    patch_sha256: str = ""
    pr_number: int | None = None
    pr_node_id: str = ""
    head_ref: str = ""
    head_sha: str = ""


@event(EventSubject.SAFE_PR_READY_FOR_CREATION)
@dataclass(frozen=True)
class SafePrReadyForCreationBody(EventBody):
    """safe_pr.ready_for_creation — diff 검증 통과, PR 생성 진행 가능."""

    request: SafePrRequestedBody
    summary: str
    risk: str
    details: dict[str, object] = field(default_factory=dict)
    workspace_id: str = DEFAULT_WORKSPACE_ID


@event(EventSubject.SAFE_PR_FAILED)
@dataclass(frozen=True)
class SafePrFailedBody(EventBody):
    """safe_pr.failed — scm-worker의 PR 생성 실패."""

    provider: str
    title: str
    reason: str
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    application_id: str = DEFAULT_APPLICATION_ID
    workflow_run_id: str = DEFAULT_WORKFLOW_RUN_ID
    environment: str = DEFAULT_ENVIRONMENT
    manifest_path: str = DEFAULT_MANIFEST_PATH
    repo_ref: str = DEFAULT_REPO_REF
    base_branch: str = ""
    commit_sha: str = ""
    patch_sha256: str = ""
    reason_code: str = "safe_pr_failed"
    stage: str = "scm"
    evidence_ref: str = ""
    details: dict[str, object] = field(default_factory=dict)
