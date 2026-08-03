from __future__ import annotations

from dataclasses import dataclass

from domains.rca.events import (
    RcaActionRequiredBody,
    RecoveryPlannedBody,
    RecoverySelectionRequestedBody,
)
from packages.contracts.event_bus.bodies import EventBody
from services.ai.agent.recovery.engine import recovery_candidate_sort_key

NO_PLAN_REASON = "복구 계획이 없습니다."
NO_CANDIDATES_REASON = "복구 후보가 없어 사용자 선택이 필요합니다."


@dataclass(frozen=True)
class RecoverySelector:
    """Require an operator selection; remediation is delivered only as a Draft PR."""

    def select_body(self, evt: RecoveryPlannedBody) -> EventBody:
        if evt.plan is None:
            return RcaActionRequiredBody(
                reason=NO_PLAN_REASON,
                evidence_ref=(
                    evt.draft.source_evidence[0] if evt.draft.source_evidence else "unknown"
                ),
                workspace_id=evt.workspace_id,
            )
        candidates = sorted(evt.plan.candidates, key=recovery_candidate_sort_key)
        if not candidates:
            return RecoverySelectionRequestedBody(
                plan=evt.plan,
                reason=NO_CANDIDATES_REASON,
                workspace_id=evt.workspace_id,
            )
        selected = candidates[0]
        return RecoverySelectionRequestedBody(
            plan=evt.plan,
            reason=(
                "클러스터 직접 실행 경로가 없으므로 운영자가 제한된 GitOps 변경안을 "
                f"검토해야 합니다. 후보={selected.action_id}, route={selected.route}"
            ),
            workspace_id=evt.workspace_id,
        )
