from __future__ import annotations

from typing import Any, Literal, Self

from pydantic import Field, model_validator

from packages.contracts.gateway.base import StrictModel

JsonMap = dict[str, Any]


class HealthResponse(StrictModel):
    status: str
    service: str | None = None


class AcceptedResponse(StrictModel):
    accepted: bool
    event_id: str
    correlation_id: str
    command_id: str | None = None


class AcceptedEventResponse(AcceptedResponse):
    event: JsonMap


class AuthLogoutCapability(StrictModel):
    action: Literal["end_session", "upstream_identity_required"]
    supported: bool
    reauthentication_expected: bool


class AuthSessionResponse(StrictModel):
    authenticated: Literal[True]
    auth_enabled: Literal[True]
    auth_mode: Literal["password", "trusted_proxy"]
    display_name: str | None = None
    email: str | None = None
    user_id: str = Field(min_length=1)
    groups: list[str]
    roles: list[str] = Field(min_length=1)
    workspace_id: str = Field(min_length=1)
    logout: AuthLogoutCapability

    @model_validator(mode="after")
    def validate_logout_semantics(self) -> Self:
        expected = (
            ("end_session", True, False)
            if self.auth_mode == "password"
            else ("upstream_identity_required", False, True)
        )
        actual = (
            self.logout.action,
            self.logout.supported,
            self.logout.reauthentication_expected,
        )
        if actual != expected:
            raise ValueError("logout capability must match the authentication authority")
        return self


class AuthWorkspaceItem(StrictModel):
    workspace_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1)


class AuthWorkspaceListResponse(StrictModel):
    current_workspace_id: str = Field(min_length=1)
    items: list[AuthWorkspaceItem]


class UserApprovalResponse(StrictModel):
    accepted: bool
    user_id: str
    status: str
    role: str
    workspace_id: str


class LogoutResponse(StrictModel):
    authenticated: bool


class EvidenceSourceSummaryItem(StrictModel):
    """저장된 evidence 원문에서 추출한 안전 요약 — raw payload 값은 제외."""

    source: str
    summary: str
    schema_version: int | None = None
    collector: str | None = None
    collector_version: str | None = None
    source_version: str | None = None
    query_version: str | None = None
    collected_at: str | None = None
    evidence_key: str | None = None
    source_id: str | None = None
    agent_id: str | None = None
    window_start: str | None = None


class EvidenceRecordItem(StrictModel):
    """저장된 evidence row 하나 — raw payload 대신 안전 요약만 노출."""

    id: int
    workspace_id: str
    correlation_id: str
    kind: str
    cluster_id: str | None = None
    evidence_ref: str | None = None
    summary: str
    sources: list[EvidenceSourceSummaryItem] = Field(default_factory=list)
    created_at: str | None = None


class EvidenceQueryResponse(StrictModel):
    items: list[EvidenceRecordItem]
    limit: int
    offset: int
    has_more: bool
    next_cursor: str | None = None


class EvidenceWindowSummaryItem(StrictModel):
    """저장된 evidence window 목록 — 원문 payload 없이 source 존재 여부만 노출."""

    evidence_key: str
    workspace_id: str
    cluster_id: str | None = None
    source_id: str | None = None
    window_start: str | None = None
    agent_id: str | None = None
    correlation_id: str | None = None
    sources: list[str] = Field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None


class EvidenceWindowListResponse(StrictModel):
    items: list[EvidenceWindowSummaryItem]
    limit: int
    offset: int
    has_more: bool


class EvidenceWindowPayloadResponse(StrictModel):
    """저장된 evidence window 원문 조회 — RCA 스키마 확정용 read-only debug 응답."""

    evidence_key: str
    workspace_id: str
    cluster_id: str | None = None
    source: str | None = None
    payload: JsonMap


class RcaCandidateScoreItem(StrictModel):
    """원인 후보 1개의 평가 결과 — 카탈로그 메타(제목/출처) + 평가(점수/근거) 병합."""

    candidate_id: str
    title: str | None = None
    source: str | None = None  # rule | ai_fallback
    score: float | None = None
    reason: str | None = None
    supporting_evidence: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)


class RcaEvidenceRefItem(StrictModel):
    """판단에 실제 사용된 근거 참조 — 어떤 소스에 어떤 쿼리를 던져 얻었는지."""

    source: str
    name: str
    check_id: str | None = None
    summary: str | None = None
    query: str | None = None
    evidence_ref: str | None = None
    schema_version: int | None = None
    source_version: str | None = None
    collector: str | None = None
    collector_version: str | None = None
    query_version: str | None = None
    collected_at: str | None = None
    evidence_key: str | None = None
    source_id: str | None = None
    agent_id: str | None = None
    window_start: str | None = None


class RcaMissingCheckItem(StrictModel):
    """확정에 필요하지만 미충족인 근거 수집 상태."""

    check_id: str
    source: str | None = None
    status: str | None = None
    reason: str | None = None


class RcaNarrativeItem(StrictModel):
    """Evidence-bounded prose generated after deterministic RCA completion."""

    locale: Literal["ko"]
    executive_summary: str
    impact: str
    reasoning: str
    recommended_action: str
    recurrence_prevention: list[str] = Field(min_length=1)
    limitations: list[str] = Field(min_length=1)


class RcaReportSummaryItem(StrictModel):
    """저장된 RCA report 요약 — payload 원문 대신 화이트리스트 필드만 노출(secret 유출 방지)."""

    id: int
    workspace_id: str
    correlation_id: str
    analysis_status: Literal["completed", "blocked"] = "completed"
    root_cause: str
    action: str
    incident_id: str | None = None
    cluster_id: str | None = None
    symptom: str | None = None
    severity: str | None = None
    first_seen_at: str | None = None
    confidence: float | None = None
    reason: str | None = None
    evidence_ref: str | None = None
    supporting_evidence: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    evidence_summary: str | None = None
    evidence_bundle_summary: str | None = None
    created_at: str | None = None
    # ── 분석 심화(화이트리스트) — 대상 리소스·부증상·후보 점수·근거 쿼리 트레일 ──
    resource_kind: str | None = None
    resource_name: str | None = None
    namespace: str | None = None
    secondary_symptoms: list[str] = Field(default_factory=list)
    selected_candidate_id: str | None = None
    candidates: list[RcaCandidateScoreItem] = Field(default_factory=list)
    supporting_evidence_refs: list[RcaEvidenceRefItem] = Field(default_factory=list)
    missing_evidence_checks: list[RcaMissingCheckItem] = Field(default_factory=list)
    narrative: RcaNarrativeItem | None = None
    narrative_status: Literal["generated", "unavailable"] = "unavailable"


class RcaReportListResponse(StrictModel):
    items: list[RcaReportSummaryItem]
    limit: int
    offset: int
    has_more: bool
    next_cursor: str | None = None


class RecoveryActionCandidateItem(StrictModel):
    action_id: str
    title: str
    description: str
    route: str
    rank: int
    score: float
    risk_level: str
    blast_radius: str
    approval_required: bool
    prerequisites: list[str] = Field(default_factory=list)
    validation_checks: list[str] = Field(default_factory=list)
    rollback_plan: str
    evidence_refs: list[str] = Field(default_factory=list)
    recommendation_reason: str | None = None
    expected_outcome: str | None = None
    risk_explanation: str | None = None
    rollback_reason: str | None = None


class RecoveryPlanStatusResponse(StrictModel):
    plan_id: str
    correlation_id: str
    incident_id: str
    evidence_ref: str
    status: str
    summary: str
    target: JsonMap = Field(default_factory=dict)
    recommended_action_id: str
    execution_route: str
    selection_required: bool
    selected_action_id: str | None = None
    selected_by: str | None = None
    selected_action: RecoveryActionCandidateItem | None = None
    candidates: list[RecoveryActionCandidateItem] = Field(default_factory=list)
    lifecycle: JsonMap | None = None


class RemediationBundleMeta(StrictModel):
    correlation_id: str
    incident_id: str | None
    cluster_id: str
    workspace_id: str
    created_at: str | None


class RemediationBundleDiagnosis(StrictModel):
    root_cause: str
    confidence: float | None
    supporting_evidence: list[str]
    missing_evidence: list[str]
    supporting_evidence_refs: list[RcaEvidenceRefItem]
    missing_evidence_checks: list[RcaMissingCheckItem]
    selected_candidate_id: str | None


class RemediationBundleActionDraft(StrictModel):
    action_type: str
    namespace: str
    resource_kind: str
    resource_name: str
    reason: str
    risk_level: str
    dry_run: bool
    source_evidence: list[str]
    params: JsonMap


class RemediationBundleRecoveryCandidate(RecoveryActionCandidateItem):
    """Bundle candidate sharing the canonical recovery-plan contract.

    The bundle adds an executable draft while keeping the three evidence and
    validation lists required for its detail surface.  Common recovery copy
    fields are inherited so the two APIs cannot silently drift again.
    """

    draft: RemediationBundleActionDraft
    prerequisites: list[str]
    validation_checks: list[str]
    evidence_refs: list[str]


class RemediationBundleRemediation(StrictModel):
    status: str
    selected_action_id: str | None
    selected_by: str | None
    candidates: list[RemediationBundleRecoveryCandidate]
    evidence_ref: str


class RemediationBundleResponse(StrictModel):
    meta: RemediationBundleMeta
    diagnosis: RemediationBundleDiagnosis
    remediation: RemediationBundleRemediation | None


class ValidationErrorItem(StrictModel):
    code: str
    detail: str
    line: int | None = None


class RcaRuleValidateResponse(StrictModel):
    valid: bool
    errors: list[ValidationErrorItem] = Field(default_factory=list)
    matched_symptom: str | None = None
    candidates_count: int = 0


class RcaRuleCandidateItem(StrictModel):
    candidate_id: str
    title: str
    expected_evidence: list[str] = Field(default_factory=list)
    signals_count: int = 0


class RcaRuleCatalogItem(StrictModel):
    rule_id: str
    symptoms: list[str] = Field(default_factory=list)
    required_sources: list[str] = Field(default_factory=list)
    candidates: list[RcaRuleCandidateItem] = Field(default_factory=list)


class RcaRuleCatalogResponse(StrictModel):
    items: list[RcaRuleCatalogItem] = Field(default_factory=list)
    rules_count: int = 0
    candidates_count: int = 0


class DeadLettersResponse(StrictModel):
    dead_letters: list[JsonMap]


class DeadLetterReplayResponse(StrictModel):
    accepted: bool
    dead_letter_id: int
    replay_event: JsonMap


class RepositoryProbeResponse(StrictModel):
    repo_ref: str
    normalized_repo_ref: str
    valid: bool
    reachable: bool
    default_branch: str | None = None
    private: bool | None = None
    html_url: str | None = None
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class RepositoryBranchItem(StrictModel):
    name: str
    protected: bool = False
    default: bool = False


class RepositoryBranchListResponse(StrictModel):
    repo_ref: str
    default_branch: str | None = None
    branches: list[RepositoryBranchItem] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RepositoryManifestCandidate(StrictModel):
    path: str
    source_type: str
    display_name: str
    reason: str = ""


class RepositoryManifestCandidateListResponse(StrictModel):
    repo_ref: str
    branch: str
    candidates: list[RepositoryManifestCandidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RepoManifestFile(StrictModel):
    path: str
    kinds: list[str] = Field(default_factory=list)


class RepoManifestFileListResponse(StrictModel):
    repo: str
    branch: str
    manifests: list[RepoManifestFile] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RepositoryManifestResource(StrictModel):
    api_version: str = ""
    kind: str
    namespace: str | None = None
    name: str


class RepositoryManifestValidationResponse(StrictModel):
    repo_ref: str
    branch: str
    manifest_path: str
    valid: bool
    status: str
    validation_mode: str
    resource_count: int = 0
    resources: list[RepositoryManifestResource] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
