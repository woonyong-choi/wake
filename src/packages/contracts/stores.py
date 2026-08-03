"""Worker-facing store protocols used by mounted services."""

from __future__ import annotations

from typing import Protocol

from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.timeline import TimelineEvent


class RcaStore(Protocol):
    async def save_evidence(
        self, correlation_id: str, workspace_id: str, kind: str, body: JsonObject
    ) -> None: ...

    async def upsert_rca_enriched_evidence_window(
        self,
        *,
        evidence_key: str,
        workspace_id: str,
        cluster_id: str,
        correlation_id: str,
        window_start: str,
        source_id: str,
        agent_id: str | None,
        payload: JsonObject,
    ) -> bool: ...

    async def get_evidence_payload(
        self, workspace_id: str, correlation_id: str, kind: str
    ) -> JsonObject | None: ...

    async def claim_incident_signal(
        self,
        workspace_id: str,
        cluster_id: str,
        signal_key: str,
        correlation_id: str,
        payload: JsonObject,
    ) -> bool: ...

    async def append_timeline_event(self, event: TimelineEvent) -> object: ...

    async def get_evidence_window(self, evidence_key: str) -> JsonObject | None: ...

    async def get_evidence_window_payload(self, evidence_key: str) -> JsonObject | None: ...

    async def list_aligned_evidence_window_payloads(
        self,
        workspace_id: str,
        cluster_id: str,
        observed_at: str,
        *,
        exclude_source_id: str,
        before_seconds: int = 600,
        after_seconds: int = 60,
        limit: int = 12,
    ) -> list[JsonObject]: ...

    async def list_aligned_alertmanager_window_payloads(
        self,
        workspace_id: str,
        cluster_id: str,
        observed_at: str,
        *,
        source_id: str,
        before_seconds: int = 60,
        after_seconds: int = 600,
        limit: int = 12,
    ) -> list[JsonObject]: ...

    async def save_rca_report(
        self,
        correlation_id: str,
        workspace_id: str,
        root_cause: str,
        action: str,
        body: JsonObject,
    ) -> None: ...

    async def find_recent_rca_report(
        self,
        workspace_id: str,
        root_cause: str,
        resource_key: str,
        window_seconds: int,
    ) -> JsonObject | None: ...

    async def list_recent_workload_changes_for_evidence(
        self,
        workspace_id: str,
        cluster_id: str,
        namespace: str,
        resource_kind: str,
        resource_name: str,
        changed_before: str,
        *,
        limit: int = 5,
    ) -> list[JsonObject]: ...


class RcaBacklogStore(Protocol):
    async def upsert_rca_backlog_item(self, body: JsonObject) -> None: ...

    async def resolve_rca_backlog_item_for_rule(
        self, workspace_id: str, symptom: str, reason: str
    ) -> int: ...


class RecoveryPlanStore(Protocol):
    async def get_cluster_registration(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> JsonObject | None: ...

    async def get_evidence_payload(
        self,
        workspace_id: str,
        correlation_id: str,
        kind: str,
    ) -> JsonObject | None: ...

    async def upsert_recovery_plan(
        self,
        correlation_id: str,
        workspace_id: str,
        plan: JsonObject,
        *,
        status: str,
        selected_action_id: str | None = None,
        selected_by: str | None = None,
    ) -> None: ...

    async def upsert_recovery_selection_request(
        self,
        correlation_id: str,
        workspace_id: str,
        plan: JsonObject,
    ) -> None: ...

    async def reopen_recovery_plan_action(
        self,
        plan_id: str,
        workspace_id: str,
        action_id: str,
    ) -> bool: ...

    async def get_recovery_plan_by_correlation(
        self,
        correlation_id: str,
        workspace_id: str,
    ) -> JsonObject | None: ...

    async def get_workflow_approval(
        self,
        approval_id: str,
        workspace_id: str = "default",
    ) -> JsonObject | None: ...

    async def update_recovery_plan_lifecycle_if_status(
        self,
        plan_id: str,
        workspace_id: str,
        *,
        expected_statuses: tuple[str, ...],
        status: str,
        lifecycle: JsonObject,
        clear_selection: bool = False,
    ) -> JsonObject | None: ...

    async def get_recovery_plan_for_workflow(
        self,
        workspace_id: str,
        workflow_run_id: str,
        binding_id: str,
        application_id: str,
    ) -> JsonObject | None: ...

    async def list_recovery_verification_plans(
        self,
        workspace_id: str,
        cluster_id: str,
        *,
        limit: int = 100,
    ) -> list[JsonObject]: ...

    async def expire_recovery_verifications(
        self,
        *,
        now: object | None = None,
        limit: int = 100,
    ) -> list[JsonObject]: ...

    async def get_evidence_window_payload_for_workspace(
        self,
        workspace_id: str,
        evidence_key: str,
    ) -> JsonObject | None: ...

    async def list_alert_events(
        self,
        workspace_id: str,
        *,
        from_time: object | None = None,
        rule_name: str | None = None,
        source: str | None = None,
        incident_ids: tuple[str, ...] | None = None,
        event_ids: tuple[str, ...] | None = None,
        subject_key: str | None = None,
        limit: int = 100,
    ) -> list[JsonObject]: ...

    async def current_database_time(self) -> object: ...

    async def get_workflow_run(self, workflow_run_id: str) -> JsonObject | None: ...


class PullRequestStore(Protocol):
    async def get_workflow_approval(
        self,
        approval_id: str,
        workspace_id: str = "default",
    ) -> JsonObject | None: ...

    async def get_completed_workload_resource_diff(
        self,
        workspace_id: str,
        workflow_run_id: str,
        binding_id: str,
        cluster_id: str,
        namespace: str,
        resource_kind: str,
        resource_name: str,
    ) -> JsonObject | None: ...

    async def save_pull_request(
        self, correlation_id: str, pr_url: str, title: str, body: str, status: str
    ) -> None: ...
