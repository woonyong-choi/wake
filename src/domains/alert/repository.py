"""Alertmanager 발생 원장 저장소."""

from __future__ import annotations

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.alert.models import AlertEvent
from packages.contracts.event_bus.interfaces import JsonObject
from packages.storage.engine import DatabaseConnection, iso_or_none


def serialize_alert_event(row: JsonObject) -> JsonObject:
    item = dict(row)
    item["fired_at"] = iso_or_none(item.get("fired_at"))
    item["resolved_at"] = iso_or_none(item.get("resolved_at"))
    item["acknowledged_at"] = iso_or_none(item.get("acknowledged_at"))
    item["promoted_at"] = iso_or_none(item.get("promoted_at"))
    item["created_at"] = iso_or_none(item.get("created_at"))
    item["updated_at"] = iso_or_none(item.get("updated_at"))
    return item


class AlertRuleRepository(DatabaseConnection):
    """복구 검증에 필요한 Alertmanager 발생 원장 접근만 제공합니다."""

    def list_alert_events(
        self,
        workspace_id: str,
        *,
        from_time: object | None = None,
        to_time: object | None = None,
        rule_id: str | None = None,
        rule_name: str | None = None,
        source: str | None = None,
        incident_ids: tuple[str, ...] | None = None,
        event_ids: tuple[str, ...] | None = None,
        subject_key: str | None = None,
        severity: str | None = None,
        status: str | None = None,
        limit: int = 100,
    ) -> list[JsonObject]:
        table = AlertEvent.__table__
        statement = select(table).where(table.c.workspace_id == workspace_id)
        if from_time is not None:
            statement = statement.where(table.c.fired_at >= from_time)
        if to_time is not None:
            statement = statement.where(table.c.fired_at <= to_time)
        if rule_id is not None:
            statement = statement.where(table.c.rule_id == rule_id)
        if rule_name is not None:
            statement = statement.where(table.c.rule_name == rule_name)
        if source is not None:
            statement = statement.where(table.c.source == source)
        if incident_ids is not None:
            normalized_incident_ids = tuple(
                sorted({value.strip() for value in incident_ids if value.strip()})
            )
            if not normalized_incident_ids:
                return []
            statement = statement.where(table.c.incident_id.in_(normalized_incident_ids))
        if event_ids is not None:
            normalized_event_ids = tuple(
                sorted({value.strip() for value in event_ids if value.strip()})
            )
            if not normalized_event_ids:
                return []
            statement = statement.where(table.c.event_id.in_(normalized_event_ids))
        if subject_key is not None:
            statement = statement.where(table.c.subject_key == subject_key)
        if severity is not None:
            statement = statement.where(table.c.severity == severity)
        if status is not None:
            statement = statement.where(table.c.status == status)
        statement = statement.order_by(table.c.fired_at.desc(), table.c.event_id).limit(limit)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [serialize_alert_event(dict(row)) for row in rows]

    def upsert_external_alert_event(self, payload: JsonObject) -> JsonObject:
        """Alertmanager 재전송을 하나의 결정적 event id로 병합합니다."""
        table = AlertEvent.__table__
        insert = pg_insert(table).values(**payload, updated_at=func.now())
        incident_changed = (
            insert.excluded.incident_id.is_not(None)
            & table.c.incident_id.is_not(None)
            & (insert.excluded.incident_id != table.c.incident_id)
        )
        resolved_is_terminal = (
            (table.c.status == "resolved")
            & (insert.excluded.status != "resolved")
            & ~incident_changed
        )
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.event_id],
            set_={
                "workspace_id": insert.excluded.workspace_id,
                "rule_name": insert.excluded.rule_name,
                "source": insert.excluded.source,
                "severity": insert.excluded.severity,
                "subject_key": insert.excluded.subject_key,
                "subject": insert.excluded.subject,
                "resolved_at": case(
                    (resolved_is_terminal, table.c.resolved_at),
                    else_=insert.excluded.resolved_at,
                ),
                "status": case(
                    (resolved_is_terminal, table.c.status),
                    else_=insert.excluded.status,
                ),
                "observed_value": case(
                    (resolved_is_terminal, table.c.observed_value),
                    else_=insert.excluded.observed_value,
                ),
                "threshold": case(
                    (resolved_is_terminal, table.c.threshold),
                    else_=insert.excluded.threshold,
                ),
                "series_identity": func.coalesce(
                    insert.excluded.series_identity,
                    table.c.series_identity,
                ),
                "evidence": case(
                    (resolved_is_terminal, table.c.evidence),
                    else_=insert.excluded.evidence,
                ),
                "incident_id": func.coalesce(insert.excluded.incident_id, table.c.incident_id),
                "acknowledged_at": case(
                    (incident_changed, None),
                    else_=table.c.acknowledged_at,
                ),
                "acknowledged_by": case(
                    (incident_changed, None),
                    else_=table.c.acknowledged_by,
                ),
                "promoted_at": case(
                    (incident_changed, None),
                    else_=table.c.promoted_at,
                ),
                "promoted_by": case(
                    (incident_changed, None),
                    else_=table.c.promoted_by,
                ),
                "updated_at": func.now(),
            },
        ).returning(table)
        with self.connection() as conn:
            row = conn.execute(statement).mappings().one()
        return serialize_alert_event(dict(row))
