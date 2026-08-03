"""target cluster agent 연결 이벤트 계약."""

from __future__ import annotations

from dataclasses import dataclass, field

from packages.contracts.event_bus.bodies.base import EventBody
from packages.contracts.event_bus.registry import event
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.identity import DEFAULT_WORKSPACE_ID


@event(EventSubject.AGENT_CONNECTED)
@dataclass(frozen=True)
class AgentConnectedBody(EventBody):
    """agent.connected — target cluster agent가 management plane에 등록됨."""

    cluster_id: str
    agent_id: str
    capabilities: list[str] = field(default_factory=list)
    workspace_id: str = DEFAULT_WORKSPACE_ID
