"""rca-worker — rca.candidates.evaluated -> rca.completed."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.rca.events import (
    RcaAnalysisBlockedBody,
    RcaCandidatesEvaluatedBody,
    RcaCompletedBody,
)
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.stores import RcaStore
from packages.runtime.app import App, EventContext
from services.ai.agent.pipeline import RcaCompletionPipeline

app = App("rca-worker")
pipeline = RcaCompletionPipeline()


@app.on(RcaCandidatesEvaluatedBody)
async def on_candidates_evaluated(
    evt: RcaCandidatesEvaluatedBody,
    ctx: EventContext[RcaStore],
) -> AsyncIterator[EventBody]:
    result = pipeline.complete_body(evt)
    if isinstance(result, RcaCompletedBody):
        # correlation_id is the public lookup key used by the incident detail UI.
        # Skipping persistence because a similar resource report exists leaves the
        # newly emitted incident with no report at all. Incident de-duplication belongs
        # at the incident projection boundary; every emitted correlation must retain
        # its own evidence-backed report.
        report_body = result.to_body()
        report_body["analysis_status"] = "completed"
        await ctx.db.save_rca_report(
            ctx.correlation_id,
            result.workspace_id,
            result.root_cause,
            result.action,
            report_body,
        )
    elif isinstance(result, RcaAnalysisBlockedBody):
        # A blocked analysis is still a durable RCA outcome. Persist its ranked
        # candidates and evidence trail so the issue detail can explain why the
        # cause was not finalized and what evidence is still required.
        report_body = result.to_body()
        report_body["analysis_status"] = "blocked"
        await ctx.db.save_rca_report(
            ctx.correlation_id,
            result.workspace_id,
            "insufficient_evidence",
            "추가 근거 수집 후 RCA 재분석",
            report_body,
        )
    yield result
if __name__ == "__main__":
    app.run()
