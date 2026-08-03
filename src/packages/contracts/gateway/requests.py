from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import ConfigDict, Field, SecretStr, model_validator

from packages.config.constants import Target
from packages.contracts.evidence_policy import EvidenceProfile
from packages.contracts.gateway.base import StrictModel
from packages.contracts.gitops import (
    DEFAULT_APPLICATION_ID,
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_ENVIRONMENT,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_REPO_BRANCH,
    DEFAULT_REPOSITORY_ID,
    DEFAULT_WATCH_TARGET_ID,
    DEFAULT_WORKFLOW_RUN_ID,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.contracts.target import FAST_LANE_PRIORITY_CLASS_NAME

DEFAULT_WEBHOOK_REPLICAS = 2
MIN_WEBHOOK_REPLICAS = 1
MAX_WEBHOOK_REPLICAS = 10
DEFAULT_EVIDENCE_JOB_MAX_ATTEMPTS = 3
MAX_EVIDENCE_JOB_MAX_ATTEMPTS = 10
DEFAULT_AGENT_POLICY_GENERATION = 1
DEFAULT_PROVIDER_INTERVAL_SECONDS = 8
DEFAULT_PROVIDER_MIN_WORKERS = 1
DEFAULT_PROVIDER_MAX_WORKERS = 3
DEFAULT_QUEUE_AGE_TARGET_SECONDS = 15
# agent evidence 페이로드 상한 — 무한 크기 수집물이 DB/NATS/LLM 컨텍스트를 압박하지 않도록.
MAX_EVIDENCE_LOG_ENTRIES = 2000
MAX_EVIDENCE_PAYLOAD_BYTES = 1_048_576  # 직렬화 1MiB 상한(초과 시 422)
EVIDENCE_PAYLOAD_TOO_LARGE_MESSAGE = "evidence payload exceeds size limit"


class LoginRequest(StrictModel):
    # 우리 서비스 자체 계정 로그인 입력값
    # role 같은 권한 필드는 클라이언트 입력 금지, 서버가 DB/session 기준 결정
    # 로그인은 고정 dev 관리자 식별자(`admin`)와 가입 계정 이메일을 모두 허용한다.
    email: str = Field(
        min_length=1,
        max_length=320,
        pattern=r"^[^@\s]+(?:@[^@\s]+\.[^@\s]+)?$",
    )
    password: str = Field(min_length=8)


class WorkspaceSwitchRequest(StrictModel):
    workspace_id: str = Field(min_length=1, max_length=200)


class GitHubWebhookRequest(StrictModel):
    correlation_id: str | None = Field(default=None, min_length=1, max_length=2048)
    commit_sha: str
    image: str = Field(min_length=1)
    replicas: int = Field(
        default=DEFAULT_WEBHOOK_REPLICAS, ge=MIN_WEBHOOK_REPLICAS, le=MAX_WEBHOOK_REPLICAS
    )
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    repo_ref: str = Field(min_length=1)
    branch: str = DEFAULT_REPO_BRANCH
    watch_target_id: str = DEFAULT_WATCH_TARGET_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    application_id: str = DEFAULT_APPLICATION_ID
    workflow_run_id: str = DEFAULT_WORKFLOW_RUN_ID
    environment: str = DEFAULT_ENVIRONMENT
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    manifest_path: str = DEFAULT_MANIFEST_PATH
    source_type: str = Field(default="", max_length=40)
    force: bool = False


class AgentConnectRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    agent_id: str
    capabilities: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class AgentEvidenceRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    workspace_id: str = DEFAULT_WORKSPACE_ID
    correlation_id: str | None = None
    agent_id: str | None = None
    source_id: str | None = None
    window_start: str | None = None
    evidence_key: str | None = None
    workflow_run_id: str | None = None
    release_context: dict[str, Any] = Field(default_factory=dict)
    collection_status: dict[str, Any] = Field(default_factory=dict)
    kubernetes: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)
    logs: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_EVIDENCE_LOG_ENTRIES)
    traces: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _bound_payload_size(self) -> AgentEvidenceRequest:
        # logs 길이는 Field(max_length)로, 전체 수집물 크기는 직렬화 바이트로 상한.
        # (kubernetes/metrics/traces 는 중첩 dict 라 항목 수만으로는 못 막음)
        size = len(
            json.dumps(
                {
                    "kubernetes": self.kubernetes,
                    "metrics": self.metrics,
                    "logs": self.logs,
                    "traces": self.traces,
                    "metadata": self.metadata,
                    "release_context": self.release_context,
                    "collection_status": self.collection_status,
                },
                default=str,
            ).encode()
        )
        if size > MAX_EVIDENCE_PAYLOAD_BYTES:
            raise ValueError(EVIDENCE_PAYLOAD_TOO_LARGE_MESSAGE)
        return self


class RecoveryActionSelectRequest(StrictModel):
    reason: str | None = Field(default=None, max_length=500)


class RecoveryActionSelectByCorrelationRequest(StrictModel):
    expected_plan_id: str = Field(min_length=1, max_length=2048)
    action_id: str | None = Field(default=None, min_length=1, max_length=2048)
    reason: str | None = Field(default=None, max_length=500)


class RecoveryRetryRequest(StrictModel):
    expected_plan_id: str = Field(min_length=1, max_length=2048)
    reason: str | None = Field(default=None, max_length=500)


class RepositoryProbeRequest(StrictModel):
    repo_ref: str = Field(min_length=1, max_length=240)
    token: SecretStr | None = Field(
        default=None,
        min_length=1,
        max_length=500,
        json_schema_extra={"writeOnly": True},
    )
    # GitHub App 설치 id — 있으면 서버가 설치 토큰을 발급해 비공개 레포도 읽는다.
    installation_id: str | None = Field(default=None, min_length=1, max_length=40)


class RepositoryManifestDiscoveryRequest(StrictModel):
    repo_ref: str = Field(min_length=1, max_length=240)
    branch: str = Field(default=DEFAULT_REPO_BRANCH, min_length=1, max_length=200)
    installation_id: str | None = Field(default=None, min_length=1, max_length=40)


class RepositoryManifestValidationRequest(StrictModel):
    repo_ref: str = Field(min_length=1, max_length=240)
    branch: str = Field(default=DEFAULT_REPO_BRANCH, min_length=1, max_length=200)
    manifest_path: str = Field(default=DEFAULT_MANIFEST_PATH, min_length=1, max_length=500)
    source_type: str = Field(default="", max_length=40)
    values_path: str | None = Field(default=None, min_length=1, max_length=500)
    installation_id: str | None = Field(default=None, min_length=1, max_length=40)

    @model_validator(mode="after")
    def values_override_requires_helm(self) -> RepositoryManifestValidationRequest:
        if self.values_path is not None and self.source_type.strip().lower() not in {"", "helm"}:
            raise ValueError("values_path is valid only for Helm manifest validation")
        return self


class RcaRuleValidateRequest(StrictModel):
    yaml_text: str = Field(min_length=1, max_length=100_000)


class AlertmanagerAlert(StrictModel):
    """Alertmanager webhook payload 의 alert 항목 — 외부 계약이라 필드명 camelCase 유지."""

    model_config = ConfigDict(extra="allow")

    status: str = "firing"
    labels: dict[str, Any] = Field(default_factory=dict)
    annotations: dict[str, Any] = Field(default_factory=dict)
    startsAt: str = ""  # noqa: N815 — Alertmanager 계약 필드명
    endsAt: str = ""  # noqa: N815
    fingerprint: str = ""


class AlertmanagerWebhookRequest(StrictModel):
    """Alertmanager v4 webhook — https://prometheus.io/docs/alerting/latest/configuration/#webhook_config"""

    model_config = ConfigDict(extra="allow")

    version: str = "4"
    groupKey: str = ""  # noqa: N815
    status: str = "firing"
    receiver: str = ""
    alerts: list[AlertmanagerAlert] = Field(default_factory=list)


class EvidenceProviderPolicy(StrictModel):
    enabled: bool = True
    interval_seconds: int = Field(default=DEFAULT_PROVIDER_INTERVAL_SECONDS, ge=1)
    min_workers: int = Field(default=DEFAULT_PROVIDER_MIN_WORKERS, ge=0)
    max_workers: int = Field(default=DEFAULT_PROVIDER_MAX_WORKERS, ge=0)
    queue_age_target_seconds: int = Field(default=DEFAULT_QUEUE_AGE_TARGET_SECONDS, ge=1)
    queries: list[dict[str, Any]] = Field(default_factory=list)
    # Opaque management-plane revision only. Provider secrets never enter the
    # durable policy or the agent's on-disk policy cache.
    configuration_revision: str | None = Field(default=None, min_length=1, max_length=120)
    configuration_operation_id: str | None = Field(default=None, min_length=1, max_length=160)

    @model_validator(mode="after")
    def require_complete_configuration_identity(self) -> EvidenceProviderPolicy:
        if (self.configuration_revision is None) != (self.configuration_operation_id is None):
            raise ValueError(
                "provider configuration revision and operation identity must be paired"
            )
        return self


class EvidenceRuntimePolicy(StrictModel):
    profile: EvidenceProfile = "standard"
    failure_policy: Literal["allow_partial", "strict"] = "allow_partial"
    max_attempts: int = Field(
        default=DEFAULT_EVIDENCE_JOB_MAX_ATTEMPTS,
        ge=1,
        le=MAX_EVIDENCE_JOB_MAX_ATTEMPTS,
    )
    providers: dict[str, EvidenceProviderPolicy] = Field(default_factory=dict)


class DesiredResource(StrictModel):
    resource_id: str
    scope: Literal["target-agent", "system", "user-workload"] = "target-agent"
    kind: Literal["ConfigMap", "Deployment"]
    namespace: str
    name: str
    action: Literal["observe", "apply"] = "observe"
    state: dict[str, Any] = Field(default_factory=dict)


class BootstrapPolicy(StrictModel):
    mode: Literal["management", "target"] = "target"
    resources: list[DesiredResource] = Field(default_factory=list)


class DesiredStatePolicy(StrictModel):
    resources: list[DesiredResource] = Field(default_factory=list)


class SchedulingSelector(StrictModel):
    namespaces: list[str] = Field(default_factory=list, max_length=50)
    labels: dict[str, str] = Field(default_factory=dict)
    workload_names: list[str] = Field(default_factory=list, max_length=100)


class SchedulingToleration(StrictModel):
    key: str = Field(min_length=1, max_length=120)
    operator: Literal["Exists", "Equal"] = "Equal"
    value: str = Field(default="", max_length=120)
    effect: Literal["NoSchedule", "PreferNoSchedule", "NoExecute"] = "NoSchedule"


class SchedulingProfile(StrictModel):
    profile_id: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")
    enabled: bool = True
    description: str = Field(default="", max_length=500)
    selector: SchedulingSelector = Field(default_factory=SchedulingSelector)
    priority_class_name: str = Field(default=FAST_LANE_PRIORITY_CLASS_NAME, max_length=120)
    priority_value: int = Field(default=100_000, ge=0, le=1_000_000_000)
    preemption_policy: Literal["PreemptLowerPriority", "Never"] = "PreemptLowerPriority"
    placement_mode: Literal["preferred", "required"] = "preferred"
    node_selector: dict[str, str] = Field(default_factory=dict)
    preferred_node_labels: dict[str, str] = Field(default_factory=dict)
    tolerations: list[SchedulingToleration] = Field(default_factory=list, max_length=20)
    pre_pull_images: list[str] = Field(default_factory=list, max_length=50)
    termination_grace_period_seconds: int | None = Field(default=None, ge=0, le=300)
    scheduler_name: str | None = Field(default=None, min_length=1, max_length=120)

    @model_validator(mode="after")
    def require_explicit_selector(self) -> SchedulingProfile:
        if not self.enabled:
            return self
        if self.selector.namespaces or self.selector.labels or self.selector.workload_names:
            return self
        raise ValueError("enabled scheduling profile requires at least one selector")


class SchedulingPolicy(StrictModel):
    profiles: list[SchedulingProfile] = Field(default_factory=list, max_length=50)


class AgentPolicy(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    generation: int = Field(default=DEFAULT_AGENT_POLICY_GENERATION, ge=1)
    cluster_role: Literal["management", "target"] = "target"
    evidence: EvidenceRuntimePolicy = Field(default_factory=EvidenceRuntimePolicy)
    bootstrap: BootstrapPolicy = Field(default_factory=BootstrapPolicy)
    desired_state: DesiredStatePolicy = Field(default_factory=DesiredStatePolicy)
    scheduling: SchedulingPolicy = Field(default_factory=SchedulingPolicy)
