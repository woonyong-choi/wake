from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest


@pytest.mark.parametrize(
    ("subject", "returncode"),
    [
        ("fix(repo): 초기 실행 오류 수정", 0),
        ("fix(repo): 오류 수정 (#12)", 0),
        ("# 주석\n\nfix(repo): 오류 수정", 0),
        ("Merge branch x", 1),
        ("# 주석\n\n", 1),
        ("\nfix: 오류 수정\nfix(repo): 오류 수정", 1),
        ("docs(docs): " + "가" * 70 + "추가 (#12)", 0),
        ("docs(docs): " + "가" * 71 + "추가 (#12)", 1),
        ("refactor(runtime): 미사용 세션 코드 제거", 0),
        ("fix: 실행 / 오류", 1),
        ("fix(repo): fix startup", 1),
        ("docs(docs): " + "가" * 70 + "추가", 0),
        ("docs(docs): " + "가" * 71 + "추가", 1),
    ],
)
def test_existing_commit_hook_uses_current_subject_contract(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, subject: str, returncode: int
) -> None:
    # #2: 기존 hook 경로를 유지하면서 type(scope) 형식을 허용해야 한다.
    message = tmp_path / "message"
    message.write_text(subject + "\n")
    names = tmp_path / "names.txt"
    names.write_text("synthetic-denied-marker\n")
    monkeypatch.setenv("KIT_BANNED_NAMES", str(names))
    for key in tuple(os.environ):
        if key.startswith("GIT_"):
            monkeypatch.delenv(key)
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True, capture_output=True)

    result = subprocess.run(
        [
            "bash",
            str(Path(__file__).resolve().parents[1] / "scripts/commit-msg-gate.sh"),
            str(message),
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == returncode
