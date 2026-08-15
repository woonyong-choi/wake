from __future__ import annotations

from pathlib import Path

import pytest

from packages.runtime import controller

ROOT = Path(__file__).resolve().parents[1]


def test_validate_event_bus_mode_normalizes_and_rejects_unknown_mode() -> None:
    assert controller.validate_event_bus_mode(" NATS ") == "nats"

    with pytest.raises(ValueError, match="CONTROLLER_EVENT_BUS_MODE"):
        controller.validate_event_bus_mode("redis")


def test_build_composition_plan_does_not_construct_event_bus(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unexpected_factory(mode: str) -> object:
        raise AssertionError(f"composition must not construct an event bus: {mode}")

    monkeypatch.setattr(controller, "event_bus_for_mode", unexpected_factory)

    plan = controller.build_composition_plan(ROOT, event_bus_mode="inprocess")

    assert plan.event_bus_mode == "inprocess"
