from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SUBJECT = "test(repo): 합성 검사 추가"
MARKER = "synthetic-denied-marker"


@pytest.fixture
def repository(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    for key in tuple(os.environ):
        if key.startswith("GIT_"):
            monkeypatch.delenv(key)
    repo = tmp_path / "repository"
    repo.mkdir()
    _git(repo, "init", "-q")
    scripts = repo / "scripts"
    scripts.mkdir()
    for name in ("commit-msg-gate.sh", "banned-name-check.py"):
        shutil.copyfile(ROOT / "scripts" / name, scripts / name)
    shutil.copyfile(ROOT / "Makefile", repo / "Makefile")
    hooks = repo / ".git" / "hooks"
    _git(repo, "config", "core.hooksPath", str(hooks))
    hook = hooks / "commit-msg"
    hook.write_text('#!/bin/sh\nexec bash scripts/commit-msg-gate.sh "$1"\n')
    hook.chmod(0o755)
    names = tmp_path / "names.txt"
    names.write_text(f"# synthetic test list\n\n{MARKER}\n", encoding="utf-8")
    monkeypatch.setenv("KIT_BANNED_NAMES", str(names))
    return repo


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, check=True)


def _commit(repo: Path, message: str = SUBJECT) -> subprocess.CompletedProcess[str]:
    for key in ("user.name", "user.email"):
        identity = subprocess.run(
            ["git", "config", "--get", key], cwd=repo, capture_output=True, text=True
        )
        if identity.returncode or not identity.stdout.strip():
            pytest.skip("synthetic commits require the current user's Git identity")
    return subprocess.run(
        ["git", "commit", "-q", "--allow-empty", "-m", message],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )


def _check(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", str(ROOT / "scripts" / "banned-name-check.py"), *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )


def _assert_rejected(result: subprocess.CompletedProcess[str]) -> None:
    assert result.returncode != 0
    assert "banned-name check:" in result.stderr
    assert MARKER not in (result.stdout + result.stderr).casefold()


@pytest.mark.parametrize("location", ["subject", "body", "added", "plus", "binary", "path"])
def test_real_hook_rejects_names_without_disclosing_values(repository: Path, location: str) -> None:
    message = SUBJECT
    if location == "subject":
        message = f"test(repo): {MARKER.upper()} 추가"
    elif location == "body":
        message += f"\n\n{MARKER.upper()}"
    else:
        path = repository / (MARKER if location == "path" else "content.txt")
        content = {
            "added": MARKER.upper(),
            "plus": f"++{MARKER}",
            "binary": f"\x00{MARKER}",
            "path": "safe",
        }[location]
        path.write_text(content)
        _git(repository, "add", "--", path.name)

    result = _commit(repository, message)

    _assert_rejected(result)
    assert (
        subprocess.run(
            ["git", "rev-parse", "--verify", "HEAD"], cwd=repository, capture_output=True
        ).returncode
        != 0
    )


@pytest.mark.parametrize(
    "state", ["unset", "missing", "directory", "unreadable", "empty", "comments", "invalid-utf8"]
)
def test_hook_fails_closed_for_unusable_list(
    repository: Path, monkeypatch: pytest.MonkeyPatch, state: str
) -> None:
    names = Path(os.environ["KIT_BANNED_NAMES"])
    if state == "unset":
        monkeypatch.delenv("KIT_BANNED_NAMES")
    elif state == "missing":
        monkeypatch.setenv("KIT_BANNED_NAMES", str(names.parent / MARKER))
    elif state == "directory":
        monkeypatch.setenv("KIT_BANNED_NAMES", str(names.parent))
    elif state == "unreadable":
        names.chmod(0)
    elif state == "empty":
        names.write_text("")
    elif state == "comments":
        names.write_text("# synthetic comment\n\n")
    else:
        names.write_bytes(b"\xff")
    try:
        _assert_rejected(_commit(repository))
    finally:
        names.chmod(0o600)


def test_hook_reads_index_and_allows_removing_existing_name(repository: Path) -> None:
    names = Path(os.environ["KIT_BANNED_NAMES"])
    names.write_text("another-synthetic-marker\n")
    content = repository / "content.txt"
    content.write_text(f"{MARKER}\n")
    _git(repository, "add", "content.txt")
    assert _commit(repository).returncode == 0
    names.write_text(f"{MARKER}\n")
    content.write_text("safe\n")
    _git(repository, "add", "content.txt")
    content.write_text(f"{MARKER}\n")

    result = _commit(repository)

    assert result.returncode == 0, result.stderr
    assert _git(repository, "show", "HEAD:content.txt").stdout == "safe\n"


def test_hook_rejects_staged_name_even_with_clean_working_copy(repository: Path) -> None:
    content = repository / "content.txt"
    content.write_text(MARKER)
    _git(repository, "add", "content.txt")
    content.write_text("safe")

    _assert_rejected(_commit(repository))


def test_hook_rejects_names_with_custom_diff_display(repository: Path) -> None:
    _git(repository, "config", "color.ui", "always")
    _git(repository, "config", "diff.outputIndicatorNew", ">")
    content = repository / "content.txt"
    content.write_text(MARKER)
    _git(repository, "add", "content.txt")

    _assert_rejected(_commit(repository))


def test_names_are_literal_case_insensitive_substrings(repository: Path) -> None:
    names = Path(os.environ["KIT_BANNED_NAMES"])
    names.write_text("synthetic.name[1]\n")
    assert _commit(repository, SUBJECT + "\n\nsyntheticXname1").returncode == 0
    result = _commit(repository, SUBJECT + "\n\nprefixSYNTHETIC.NAME[1]suffix")
    _assert_rejected(result)
    assert "synthetic.name[1]" not in result.stderr.casefold()


@pytest.mark.parametrize("location", ["body", "content"])
def test_range_rejects_committed_names_even_after_removal(repository: Path, location: str) -> None:
    names = Path(os.environ["KIT_BANNED_NAMES"])
    names.write_text("another-synthetic-marker\n")
    content = repository / "content.txt"
    content.write_text(MARKER if location == "content" else "safe")
    _git(repository, "add", "content.txt")
    assert (
        _commit(repository, SUBJECT + (f"\n\n{MARKER}" if location == "body" else "")).returncode
        == 0
    )
    content.write_text("safe again")
    _git(repository, "add", "content.txt")
    assert _commit(repository).returncode == 0
    names.write_text(f"{MARKER}\n")

    _assert_rejected(_check(repository, "--range", "HEAD"))


def test_range_accepts_clean_history_and_rejects_invalid_revision(repository: Path) -> None:
    assert _commit(repository).returncode == 0
    assert _check(repository, "--range", "HEAD").returncode == 0
    _assert_rejected(_check(repository, "--range", MARKER))


def test_make_gate_checks_tracked_working_files_and_requires_list(repository: Path) -> None:
    content = repository / "content with spaces.txt"
    content.write_text("safe")
    _git(repository, "add", content.name)
    assert (
        subprocess.run(
            ["make", "banned-name-check"], cwd=repository, capture_output=True
        ).returncode
        == 0
    )
    content.write_text(MARKER)
    result = subprocess.run(["make", "gate"], cwd=repository, capture_output=True, text=True)
    _assert_rejected(result)
    assert "scripts/test.sh" not in result.stdout
    content.write_text("safe")
    Path(os.environ["KIT_BANNED_NAMES"]).write_text("")
    result = subprocess.run(["make", "gate"], cwd=repository, capture_output=True, text=True)
    _assert_rejected(result)


def test_tracked_check_from_subdirectory_scans_repository_root(repository: Path) -> None:
    content = repository / "content.txt"
    content.write_text(MARKER)
    _git(repository, "add", "content.txt")

    _assert_rejected(_check(repository / "scripts", "--tracked"))
