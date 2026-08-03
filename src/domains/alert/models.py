"""Alertmanager 발생 원장 테이블."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Float, Index, Text, text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from packages.storage.base import Base, created_at_column, text_column, updated_at_column


class AlertEvent(Base):
    """Alertmanager 발생과 해소 이력을 보존하는 원장."""

    __tablename__ = "alert_events"
    __table_args__ = (
        Index("ix_alert_events_workspace_fired", "workspace_id", "fired_at"),
        Index("ix_alert_events_workspace_status", "workspace_id", "status"),
        Index(
            "uq_alert_events_active_subject",
            "rule_id",
            "subject_key",
            unique=True,
            postgresql_where=text("status in ('firing', 'acked')"),
        ),
    )

    event_id: Mapped[str] = mapped_column(Text, primary_key=True)
    workspace_id: Mapped[str] = text_column()
    rule_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = text_column()
    severity: Mapped[str] = text_column()
    subject_key: Mapped[str] = text_column()
    subject: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    fired_at: Mapped[Any] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    resolved_at: Mapped[Any | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    status: Mapped[str] = text_column()
    observed_value: Mapped[float | None] = mapped_column(Float(precision=53), nullable=True)
    threshold: Mapped[float | None] = mapped_column(Float(precision=53), nullable=True)
    series_identity: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    incident_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    acknowledged_at: Mapped[Any | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    promoted_at: Mapped[Any | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    promoted_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()
