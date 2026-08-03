"""Deterministic RCA signal extraction from bounded evidence bundles."""

from __future__ import annotations

from dataclasses import dataclass, field

from domains.rca.events import EvidenceBundle
from packages.contracts.event_bus.bodies import JsonObject

MATCHER_KEYS = ("fact", "log_pattern", "event_pattern")
FACT_EXIT_CODE_NON_OOM = "exit_code=non_oom"
OOM_EXIT_CODE = 137


@dataclass(frozen=True)
class BundleSignals:
    facts: frozenset[str] = frozenset()
    log_lines: tuple[str, ...] = ()
    event_texts: tuple[str, ...] = ()


@dataclass
class _SignalCollector:
    facts: set[str] = field(default_factory=set)
    log_lines: list[str] = field(default_factory=list)
    event_texts: list[str] = field(default_factory=list)


def extract_bundle_signals(evidence_bundle: EvidenceBundle) -> BundleSignals:
    collector = _SignalCollector()
    for item in evidence_bundle.items:
        if item.source == "kubernetes":
            collect_kubernetes_signals(item.value, collector)
        elif item.source == "logs":
            collect_log_lines(item.value, collector)
        elif item.source == "metrics":
            collect_alert_facts(item.value, collector)
    return BundleSignals(
        facts=frozenset(collector.facts),
        log_lines=tuple(collector.log_lines),
        event_texts=tuple(collector.event_texts),
    )


def collect_kubernetes_signals(value: JsonObject, collector: _SignalCollector) -> None:
    for pod in dict_items(value.get("pods")):
        labels = pod.get("labels")
        if isinstance(labels, dict):
            for raw_key, raw_value in labels.items():
                key = str(raw_key).strip()
                label_value = str(raw_value).strip()
                if key and label_value:
                    collector.facts.add(f"pod_label:{key}={label_value}")
        for reason in text_items(pod.get("waiting_reasons")):
            collector.facts.add(f"waiting_reason={reason}")
        for reason in text_items(pod.get("terminated_reasons")):
            collector.facts.add(f"terminated_reason={reason}")
        for container in dict_items(pod.get("containers")):
            add_exit_code_facts(container, collector)
    for event in dict_items(value.get("events")):
        reason = str(event.get("reason") or "").strip()
        message = str(event.get("message") or "").strip()
        if reason:
            collector.facts.add(f"event_reason={reason}")
        if reason or message:
            collector.event_texts.append(f"{reason} {message}".strip())


def add_exit_code_facts(container: JsonObject, collector: _SignalCollector) -> None:
    for key in ("exit_code", "last_exit_code"):
        raw = container.get(key)
        if raw is None or isinstance(raw, bool):
            continue
        try:
            code = int(raw)
        except (TypeError, ValueError):
            continue
        collector.facts.add(f"exit_code={code}")
        if code not in (0, OOM_EXIT_CODE):
            collector.facts.add(FACT_EXIT_CODE_NON_OOM)


def collect_log_lines(value: JsonObject, collector: _SignalCollector) -> None:
    for entry in dict_items(value.get("entries")):
        line = entry.get("line")
        if isinstance(line, str) and line:
            collector.log_lines.append(line)
        for stream in dict_items(entry.get("streams")):
            for sample in dict_items(stream.get("values")):
                sample_line = sample.get("line")
                if isinstance(sample_line, str) and sample_line:
                    collector.log_lines.append(sample_line)


def collect_alert_facts(value: JsonObject, collector: _SignalCollector) -> None:
    alertmanager = value.get("alertmanager")
    if not isinstance(alertmanager, dict):
        return
    for alert in dict_items(alertmanager.get("alerts")):
        if str(alert.get("status") or "firing") != "firing":
            continue
        labels = alert.get("labels")
        if not isinstance(labels, dict):
            continue
        name = str(labels.get("alertname") or "").strip()
        if name:
            collector.facts.add(f"alert_name={name}")


def match_signal_group(group: JsonObject, signals: BundleSignals) -> bool:
    matchers = group.get("any_of")
    if not isinstance(matchers, list) or not matchers:
        return False
    return any(isinstance(matcher, dict) and match_one(matcher, signals) for matcher in matchers)


def match_one(matcher: JsonObject, signals: BundleSignals) -> bool:
    fact = matcher.get("fact")
    if isinstance(fact, str):
        return fact in signals.facts
    log_pattern = matcher.get("log_pattern")
    if isinstance(log_pattern, str):
        needle = log_pattern.casefold()
        return any(needle in line.casefold() for line in signals.log_lines)
    event_pattern = matcher.get("event_pattern")
    if isinstance(event_pattern, str):
        needle = event_pattern.casefold()
        return any(needle in text.casefold() for text in signals.event_texts)
    return False


def split_signal_groups(
    candidate_signals: list[JsonObject],
    signals: BundleSignals,
) -> tuple[list[JsonObject], list[JsonObject]]:
    matched: list[JsonObject] = []
    unmatched: list[JsonObject] = []
    for group in candidate_signals:
        (matched if match_signal_group(group, signals) else unmatched).append(group)
    return matched, unmatched


def signal_group_id(group: JsonObject) -> str:
    return str(group.get("id") or "unnamed")


def signal_missing_token(group: JsonObject) -> str:
    return f"signal:{signal_group_id(group)}"


def describe_signal_group(group: JsonObject) -> str:
    parts: list[str] = []
    for matcher in group.get("any_of") or []:
        if not isinstance(matcher, dict):
            continue
        for key in MATCHER_KEYS:
            value = matcher.get(key)
            if isinstance(value, str):
                parts.append(f"{key}:{value}")
    return " | ".join(parts) if parts else "정의된 matcher 없음"


def dict_items(value: object) -> list[JsonObject]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def text_items(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if item]
