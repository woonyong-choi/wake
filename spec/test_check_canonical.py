"""Regression cases from the canonical specification reviews."""

from __future__ import annotations

import runpy
from pathlib import Path

import pytest

CHECKER = runpy.run_path(str(Path(__file__).with_name("check-canonical.py")))
FIELDS = ["목표", "톤", "현재", "차이", "고정 장치", "기대", "실패", "추가 조건"]


def _find(text: str) -> set[str]:
    return {
        topic
        for fragment in CHECKER["_fragments"](text, "example.md")
        for topic in CHECKER["_hits"](fragment)
    }


@pytest.mark.parametrize("field", FIELDS)
@pytest.mark.parametrize("layout", ["table", "item"])
def test_all_required_fields_reject_normative_repetition(
    field: str, layout: str
) -> None:
    value = "프리셋은 `15분·1시간·6시간·24시간·7일`이어야 한다"
    text = f"- {field}: {value}"
    if layout == "table":
        text = f"| 항목 | {field} |\n|---|---|\n| 로그 | {value} |"
    assert "RULE-RANGE" in _find(text)


@pytest.mark.parametrize(
    "value", ["15분", "1시간", "6시간", "24시간", "7일", "15m", "1h", "6h", "24h", "7d"]
)
def test_preset_header_supplies_context_for_short_korean_values(value: str) -> None:
    assert _find(f"| 프리셋 |\n|---|\n| {value} |") == {"RULE-RANGE"}


@pytest.mark.parametrize(
    "text, topic",
    [
        ("## CMP-VALUE-02 Restarts\n- 톤: 주의색", "RULE-RESTARTS"),
        ("- 목표: 최초 유효 자료가 온 한 번만 자동 펼친다", "RULE-FOLD"),
        (
            "| 역할 | 목표 |\n|---|---|\n| surface | 기대: 23px, 모서리 원형1(surface 토큰) |",
            "RULE-PANE",
        ),
        (
            "| 역할 | 목표 |\n|---|---|\n| row-side | 기대: 8px, 모서리 원형1(row-side 토큰) |",
            "RULE-PANE",
        ),
        (
            "| 지표 | 채택 기준 |\n|---|---|\n| 동일 관측 중복 원본 요청 | 0 |",
            "RULE-PERFORMANCE",
        ),
        (
            "| 지표 | 채택 기준 |\n|---|---|\n| 해제 후 연결·타이머 | 0 |",
            "RULE-PERFORMANCE",
        ),
        (
            "| 지표 | 채택 기준 |\n|---|---|\n| 24시간 상당 RSS 증가 | 누수 없이 0에 수렴 |",
            "RULE-PERFORMANCE",
        ),
        ("- 목표: 비용 기간은 24h·7d·30d를 고를 수 있다", "RULE-RANGE"),
        ("- 추가 값 계약: 기본 7일, 24시간/7일/30일 선택", "RULE-RANGE"),
        ("- 목표: 상태는 정상·경고·오류·심각도 역할색", "RULE-TONE"),
        (
            "- 추가 조건: 한국어 최종 AI 답변은 '~다/합니다' 계열. 한다체/합니다체 중 하나를 새 승인 없이 단정하지 않는다.",
            "RULE-AI",
        ),
        ("- 목표: AI 문장 합니다체, 라벨은 명사", "RULE-AI"),
        ("- 실패: 최소 160/최대 360px를 넘으면 실패", "RULE-CHART"),
        ("- 목표: 범주형 높이 상한 240px", "RULE-CHART"),
        ("- 목표: kit 행 40px·Wake 본문 행 28px", "RULE-WIDTH"),
        ("- 목표: kit40, Wake28px(--dt-row-h 선언)", "RULE-WIDTH"),
        ("- 목표: surface는 23px, 모서리 원형1", "RULE-PANE"),
        ("- 목표: row-side는 8px, 모서리 원형1", "RULE-PANE"),
        ("- 목표: 주기 2배 초과면 stale다", "RULE-STATE"),
        ("- 실패: 5분 관찰 없이 복구하면 실패", "RULE-RECOVERY"),
        (
            "- 목표: Watchdog는 firing 알림 목록과 심각도 집계에서 제외한다",
            "RULE-CHIPS",
        ),
        ("- 실패: 횟수 배지가 빠지면 실패", "RULE-TONE"),
        ("- 목표: 상대 나이는 과거 스냅숏 기준시각에서 계산한다", "RULE-TIME"),
        ("- 차이: 긴 Restarts 전체 표시는 목표 미충족", "RULE-RESTARTS"),
        ("- 현재: 프리셋은 `1시간·6시간·24시간`이어야 한다", "RULE-RANGE"),
        (
            "- 차이: D00542: plot이 그대로이거나 분기에 중복 선·clip이 생기면 실패",
            "RULE-CHART",
        ),
        ("| 톤 |\n|---|\n| firing 위험·pending 주의·resolved 중립 |", "RULE-TONE"),
        ("| 채택 기준 |\n|---|\n| 1% 이하 / 20ms 이하 |", "RULE-PERFORMANCE"),
        ("- 기대: audit 90일", "RULE-RETENTION"),
        ("검사: 전환 첫 1초의 50ms 이상 프레임 0개", "RULE-PERFORMANCE"),
        ("- 실패: 긴 프레임 50ms 이하", "RULE-PERFORMANCE"),
        (
            "- 목표: → [RULE-RANGE](rules.md#RULE-RANGE). 프리셋은 15분·1시간·6시간·24시간·7일",
            "RULE-RANGE",
        ),
    ],
)
def test_review_regressions_are_detected(text: str, topic: str) -> None:
    assert topic in _find(text)


@pytest.mark.parametrize(
    "text",
    [
        "- 현재: 로그 프리셋은 15분·1시간·6시간·24시간이다",
        "- 현재: 비용 PERIODS는 24h·7d·30d다",
        "| 실제 코드 계약 |\n|---|\n| period는 24시간/7일/30일 |",
        "- 차이: 현재 AI 답변은 한다체다",
        "| 원문 |\n|---|\n| AI 문장 합니다체 |",
        "- 목표: → [RULE-AI](rules.md#RULE-AI)",
        "- 현재: kit 행 40px·Wake 본문 행 28px다",
        "- 현재: surface는 23px, 모서리 원형1이다",
        "- 목표: 입력: 과거 비용 목록 24h·7d·30d → 기대: [RULE-RANGE](rules.md#RULE-RANGE)를 따른다",
        "- 목표: 요청 제한 시간은 240ms다",
        "- 차이: 현재 코드에는 7일 프리셋이 없다",
        "| 현재(코드 위치) | 차이·남은 작업 |\n|---|---|\n| pending 주의 | 프리셋은 1시간·6시간·24시간이다 |",
        "- 목표: → [RULE-RANGE](rules.md#RULE-RANGE)",
        "## 원문 발췌\n- 항목: 프리셋은 15분·1시간·6시간·24시간",
        "```text\n- 목표: 프리셋은 15분·1시간·6시간·24시간\n```",
        "| 원문 |\n|---|\n| audit 90일 |",
        "| 지표 | 합격 식 |\n|---|---|\n| 로그인 실패율 | value < 0.01 |",
    ],
)
def test_facts_sources_and_unrelated_numbers_are_not_targets(text: str) -> None:
    assert not _find(text)


def test_inline_pipe_and_escaped_pipe_do_not_hide_following_cells() -> None:
    text = "| 현재 | 실패 |\n|---|---|\n| `pending|firing`과 a\\|b | 프리셋 7일이어야 한다 |"
    fragments = list(CHECKER["_fragments"](text, "example.md"))
    assert [fragment.part for fragment in fragments] == ["현재", "실패"]
    assert "RULE-RANGE" in _find(text)


def test_fact_sentence_does_not_mask_following_target() -> None:
    text = "- 차이: 현재 프리셋은 15분·1시간이다. 프리셋은 7일이어야 한다."
    assert _find(text) == {"RULE-RANGE"}


def test_canonical_flow_owns_only_its_own_topic() -> None:
    text = "## FLOW-APR-001\n- 목표: 정책 미확인은 pr. 프리셋은 7일이다"
    assert _find(text) == {"RULE-RANGE"}


@pytest.mark.parametrize(
    "destination", ["missing.md#RULE-RANGE", "rules.md#MISSING", "rules.md"]
)
def test_missing_canonical_target_fails(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture, destination: str
) -> None:
    root = CHECKER["ROOT"]
    original = Path.read_text

    def read_text(path: Path, *args, **kwargs) -> str:
        text = original(path, *args, **kwargs)
        if path == root / "README.md":
            text += f"\n[RULE-RANGE]({destination})\n"
        return text

    monkeypatch.setattr(Path, "read_text", read_text)
    assert CHECKER["_check"](root) == 1
    assert "BROKEN_CANONICAL_LINKS 1" in capsys.readouterr().out


def test_wrapped_item_keeps_its_normative_field() -> None:
    assert _find("- 추가 조건:\n  프리셋은 7일이다") == {"RULE-RANGE"}


def test_merged_table_rows_are_rejected_without_discarding_cells() -> None:
    text = "| 목표 | 현재 |\n|---|---|\n| 참조 | 사실 | 프리셋은 7일 |"
    assert CHECKER["_table_shape_errors"](text) == [(3, 2, 3)]
    assert "RULE-RANGE" in _find(text)
