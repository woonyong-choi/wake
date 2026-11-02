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


@pytest.mark.parametrize(
    "encoding", ["utf-16", "utf-16-le", "utf-16-be", "utf-32", "utf-32-le", "utf-32-be"]
)
def test_encoded_names_rejected_in_hook_tracked_message_and_range(
    repository: Path, encoding: str
) -> None:
    content = repository / "content.txt"
    content.write_bytes(("safe\n" + MARKER.upper() + "\n").encode(encoding))
    _git(repository, "add", "content.txt")

    _assert_rejected(_commit(repository))
    _assert_rejected(_check(repository, "--tracked"))
    _assert_rejected(_check(repository, str(content)))

    names = Path(os.environ["KIT_BANNED_NAMES"])
    names.write_text("another-synthetic-marker\n")
    assert _commit(repository).returncode == 0
    names.write_text(MARKER + "\n")
    _assert_rejected(_check(repository, "--range", "HEAD"))


@pytest.mark.parametrize("encoding", ["UTF-16", "UTF-32", "ISO-8859-1"])
def test_range_ignores_git_log_output_encoding(repository: Path, encoding: str) -> None:
    marker = MARKER + "-합성"
    names = Path(os.environ["KIT_BANNED_NAMES"])
    names.write_text("another-synthetic-marker\n")
    assert _commit(repository, SUBJECT + "\n\n" + marker).returncode == 0
    names.write_text(marker + "\n")
    _assert_rejected(_check(repository, "--range", "HEAD"))
    _git(repository, "config", "i18n.logOutputEncoding", encoding)

    _assert_rejected(_check(repository, "--range", "HEAD"))


def test_bom_list_first_name_rejected_in_hook_tracked_and_range(repository: Path) -> None:
    names = Path(os.environ["KIT_BANNED_NAMES"])
    names.write_text(MARKER + "\n", encoding="utf-8-sig")
    content = repository / "content.txt"
    content.write_text(MARKER)
    _git(repository, "add", "content.txt")

    _assert_rejected(_commit(repository))
    _assert_rejected(_check(repository, "--tracked"))

    names.write_text("another-synthetic-marker\n")
    assert _commit(repository).returncode == 0
    names.write_text(MARKER + "\n", encoding="utf-8-sig")
    _assert_rejected(_check(repository, "--range", "HEAD"))


@pytest.mark.parametrize("content", ["", "# synthetic comment\n", " \n\t"])
def test_bom_list_without_names_fails_closed(repository: Path, content: str) -> None:
    Path(os.environ["KIT_BANNED_NAMES"]).write_text(content, encoding="utf-8-sig")

    _assert_rejected(_commit(repository))


@pytest.mark.parametrize(
    "args",
    [
        ["--unknown={private}"],
        ["message", "{private}"],
        ["--tracked", "{private}"],
        ["--range", "{private}", "--tracked"],
        ["--tracked={private}"],
        ["--range"],
    ],
)
def test_cli_parse_errors_do_not_disclose_inputs(repository: Path, args: list[str]) -> None:
    private = "/synthetic-private-path/" + MARKER
    result = _check(repository, *(arg.format(private=private) for arg in args))

    assert result.returncode == 2
    assert private not in result.stdout + result.stderr
    assert MARKER not in result.stdout + result.stderr
    assert "banned-name check: invalid arguments" in result.stderr


def test_cli_help_preserves_static_usage(repository: Path) -> None:
    result = _check(repository, "--help")

    assert result.returncode == 0
    assert "usage: banned-name-check.py" in result.stdout
    assert all(option in result.stdout for option in ("--range", "--tracked", "message"))
    assert result.stderr == ""


@pytest.mark.parametrize("encoding", ["utf-16-le", "utf-16-be", "utf-32-le", "utf-32-be"])
def test_encoded_names_with_lf_byte_inside_character_are_rejected(
    repository: Path, encoding: str
) -> None:
    marker = "synthetic-\u0a61-\u610a-name"
    Path(os.environ["KIT_BANNED_NAMES"]).write_text(marker + "\n")
    (repository / "content.txt").write_bytes(marker.upper().encode(encoding))
    _git(repository, "add", "content.txt")

    result = _commit(repository)

    _assert_rejected(result)
    assert marker not in result.stderr.casefold()


@pytest.mark.parametrize("encoding", ["utf-16-le", "utf-16-be", "utf-32-le", "utf-32-be"])
def test_encoded_hook_uses_index_and_allows_name_removal(repository: Path, encoding: str) -> None:
    names = Path(os.environ["KIT_BANNED_NAMES"])
    names.write_text("another-synthetic-marker\n")
    content = repository / "content.txt"
    content.write_bytes((MARKER + "\n").encode(encoding))
    _git(repository, "add", "content.txt")
    assert _commit(repository).returncode == 0
    names.write_text(MARKER + "\n")
    content.write_bytes("safe\n".encode(encoding))
    _git(repository, "add", "content.txt")
    content.write_bytes((MARKER + "\n").encode(encoding))

    assert _commit(repository).returncode == 0

    _git(repository, "add", "content.txt")
    content.write_bytes("safe\n".encode(encoding))
    _assert_rejected(_commit(repository))


def test_normal_binary_image_is_allowed(repository: Path) -> None:
    shutil.copyfile(ROOT / "docs" / "figure.png", repository / "image.png")
    _git(repository, "add", "image.png")

    result = _commit(repository)

    assert result.returncode == 0, result.stderr
    assert _check(repository, "--tracked").returncode == 0
    assert _check(repository, "--range", "HEAD").returncode == 0


@pytest.mark.parametrize("encoding", ["utf-16-le", "utf-16-be", "utf-32-le", "utf-32-be"])
@pytest.mark.parametrize("mode", ["hook", "range"])
def test_partial_encoded_name_uses_complete_blob_context(
    repository: Path, encoding: str, mode: str
) -> None:
    marker = "verify-\u0a61-\u610a-denied"
    names = Path(os.environ["KIT_BANNED_NAMES"])
    names.write_text(marker + "\n")
    content = repository / "content.bin"
    content.write_bytes(marker.replace("denied", "safe").encode(encoding))
    _git(repository, "add", content.name)
    assert _commit(repository).returncode == 0
    payload = marker.encode(encoding)
    content.write_bytes(payload)
    _git(repository, "add", content.name)

    if mode == "hook":
        _assert_rejected(_commit(repository))
    else:
        names.write_text("another-synthetic-marker\n")
        assert _commit(repository).returncode == 0
        names.write_text(marker + "\n")
        blob = subprocess.check_output(["git", "show", "HEAD:content.bin"], cwd=repository)
        assert blob == payload
        _assert_rejected(_check(repository, "--range", "HEAD~1..HEAD"))


@pytest.mark.parametrize("encoding", ["utf-8", "utf-16-le", "utf-16-be", "utf-32-le", "utf-32-be"])
@pytest.mark.parametrize(
    "change", ["unrelated", "remove", "replace-occurrence", "rename", "encoding"]
)
def test_existing_encoded_matches_are_compared_per_changed_line(
    repository: Path, encoding: str, change: str
) -> None:
    marker = "verify-\u0a61-\u610a-denied"
    names = Path(os.environ["KIT_BANNED_NAMES"])
    names.write_text("another-synthetic-marker\n")
    content = repository / "content.bin"
    original = "old " + marker + "\n" + "unchanged\n" * 8 + "safe tail\n"
    content.write_bytes(original.encode(encoding))
    _git(repository, "add", content.name)
    assert _commit(repository).returncode == 0
    names.write_text(marker + "\n")
    updated = original.replace("safe tail", "changed tail")
    if change == "remove":
        updated = updated.replace(marker, "safe")
    elif change == "replace-occurrence":
        updated = updated.replace("old " + marker, "old safe").replace(
            "changed tail", "new " + marker
        )
    elif change == "rename":
        _git(repository, "mv", content.name, "renamed.bin")
        content = repository / "renamed.bin"
        updated = updated.replace("changed tail", marker)
    elif change == "encoding":
        encoding = "utf-32-be" if encoding != "utf-32-be" else "utf-16-le"
        updated = updated.replace("changed tail", marker)
    content.write_bytes(updated.encode(encoding))
    _git(repository, "add", content.name)
    result = _commit(repository)

    if change in {"unrelated", "remove"}:
        assert result.returncode == 0, result.stderr
        assert _check(repository, "--range", "HEAD~1..HEAD").returncode == 0
    else:
        _assert_rejected(result)
        names.write_text("another-synthetic-marker\n")
        assert _commit(repository).returncode == 0
        names.write_text(marker + "\n")
        _assert_rejected(_check(repository, "--range", "HEAD~1..HEAD"))


@pytest.mark.parametrize("encoding", ["utf-16-le", "utf-16-be", "utf-32-le", "utf-32-be"])
def test_partial_names_at_random_character_and_byte_boundaries(
    repository: Path, encoding: str
) -> None:
    import random

    randomizer = random.Random(3612)
    names = Path(os.environ["KIT_BANNED_NAMES"])
    for case in range(8):
        letters = "".join(chr(randomizer.randrange(1, 0xD8) * 256 + 10) for _ in range(3))
        marker = "boundary-" + letters + "-denied"
        names.write_text(marker + "\n")
        prefix = b"X" * (case % 4)
        content = repository / f"content-{case}.bin"
        content.write_bytes(prefix + marker.replace("denied", "safe").encode(encoding))
        _git(repository, "add", content.name)
        assert _commit(repository).returncode == 0
        content.write_bytes(prefix + marker.encode(encoding))
        _git(repository, "add", content.name)

        _assert_rejected(_commit(repository))
        names.write_text("another-synthetic-marker\n")
        assert _commit(repository).returncode == 0
        names.write_text(marker + "\n")
        assert (
            subprocess.check_output(["git", "show", f"HEAD:{content.name}"], cwd=repository)
            == content.read_bytes()
        )
        _assert_rejected(_check(repository, "--range", "HEAD~1..HEAD"))


def test_gitlink_object_name_is_checked(repository: Path) -> None:
    assert _commit(repository).returncode == 0
    oid = _git(repository, "rev-parse", "HEAD").stdout.strip()
    Path(os.environ["KIT_BANNED_NAMES"]).write_text(oid + "\n")
    _git(repository, "update-index", "--add", "--cacheinfo", f"160000,{oid},module")

    _assert_rejected(_commit(repository))


def test_range_checks_merge_against_each_parent(repository: Path) -> None:
    content = repository / "content.txt"
    content.write_text("safe\n")
    _git(repository, "add", content.name)
    assert _commit(repository).returncode == 0
    base = _git(repository, "rev-parse", "HEAD").stdout.strip()
    _git(repository, "switch", "-c", "side")
    names = Path(os.environ["KIT_BANNED_NAMES"])
    names.write_text("another-synthetic-marker\n")
    content.write_text(MARKER + "\n")
    _git(repository, "add", content.name)
    assert _commit(repository).returncode == 0
    _git(repository, "switch", "-c", "mainline", base)
    (repository / "other.txt").write_text("safe\n")
    _git(repository, "add", "other.txt")
    assert _commit(repository).returncode == 0
    _git(repository, "merge", "--no-ff", "side", "-m", SUBJECT)
    names.write_text(MARKER + "\n")

    _assert_rejected(_check(repository, "--range", "HEAD^!"))
