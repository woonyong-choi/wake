"""Issue #37: exercise hooks and gates using synthetic, nonfunctional credentials."""

from __future__ import annotations

import os
import random
import shutil
import string
import subprocess
from collections.abc import Iterator
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SUBJECT = "test(repo): 합성 검사 추가"
FAKE_TOKEN = (
    "gh" + "p_" + "".join(random.Random(37).choices(string.ascii_letters + string.digits, k=36))
)


@pytest.fixture
def repository(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    for key in tuple(os.environ):
        if key.startswith(("GIT_", "GITLEAKS_")):
            monkeypatch.delenv(key)
    repo = tmp_path / "repository"
    repo.mkdir()
    _run(repo, "git", "init", "-q")
    (repo / "scripts").mkdir()
    for name in ("banned-name-check.py", "commit-msg-gate.sh"):
        shutil.copyfile(ROOT / "scripts" / name, repo / "scripts" / name)
    shutil.copyfile(ROOT / "Makefile", repo / "Makefile")
    hooks = repo / ".git" / "hooks"
    _run(repo, "git", "config", "core.hooksPath", str(hooks))
    hook = hooks / "commit-msg"
    hook.write_text('#!/bin/sh\nexec bash scripts/commit-msg-gate.sh "$1"\n')
    hook.chmod(0o755)
    names = tmp_path / "names.txt"
    names.write_text("synthetic-denied-marker\n")
    monkeypatch.setenv("KIT_BANNED_NAMES", str(names))
    for key in ("user.name", "user.email"):
        identity = subprocess.run(["git", "config", "--get", key], cwd=repo, capture_output=True)
        if identity.returncode or not identity.stdout.strip():
            shutil.rmtree(repo)
            pytest.skip("synthetic commits require the current user's Git identity")
    _commit(repo)
    _run(repo, "git", "branch", "baseline")
    try:
        yield repo
    finally:
        shutil.rmtree(repo)


def _run(repo: Path, *args: str, expected: int = 0) -> subprocess.CompletedProcess[bytes]:
    result = subprocess.run(args, cwd=repo, capture_output=True)
    output = result.stdout + result.stderr
    if FAKE_TOKEN.encode() in output:
        raise AssertionError("synthetic credential leaked")
    if result.returncode != expected:
        raise AssertionError("unexpected command exit status")
    return result


def _commit(repo: Path, message: str = SUBJECT, *, expected: int = 0) -> None:
    _run(repo, "git", "commit", "-q", "--allow-empty", "-m", message, expected=expected)


def _check(repo: Path, *args: str, expected: int = 0) -> None:
    result = _run(
        repo,
        "python3",
        str(ROOT / "scripts/banned-name-check.py"),
        "--secrets",
        *args,
        expected=expected,
    )
    if expected == 1 and result.stderr != b"secret check: rejected or unavailable (redacted)\n":
        raise AssertionError("failure diagnostic must be fixed")


def _stage(repo: Path, content: bytes, name: str = "content with spaces.txt") -> None:
    (repo / name).write_bytes(content)
    _run(repo, "git", "add", "--", name)


@pytest.mark.parametrize("location", ["text", "binary", "path", "body", "subject", "multiple"])
def test_hook_rejects_synthetic_secret_without_output(repository: Path, location: str) -> None:
    message = SUBJECT
    if location in {"body", "subject"}:
        message = (
            SUBJECT + "\n\n" + FAKE_TOKEN
            if location == "body"
            else "test(repo): " + FAKE_TOKEN + " 추가"
        )
    else:
        name = FAKE_TOKEN if location == "path" else "content with spaces.txt"
        prefix = b"\x00\xff" if location == "binary" else b""
        _stage(repository, prefix + FAKE_TOKEN.encode(), name)
        if location == "multiple":
            _stage(repository, b"safe", "second.txt")
    _commit(repository, message, expected=1)


@pytest.mark.parametrize("encoding", ["utf-16-le", "utf-16-be", "utf-32-le", "utf-32-be"])
def test_hook_rejects_encoded_synthetic_secret(repository: Path, encoding: str) -> None:
    _stage(repository, ("fake fixture\n" + FAKE_TOKEN).encode(encoding))
    _commit(repository, expected=1)


def test_hook_reads_index_and_allows_empty_commit(repository: Path) -> None:
    _stage(repository, b"safe staged hunk\n")
    (repository / "content with spaces.txt").write_text(FAKE_TOKEN)
    _commit(repository)
    _check(repository, "--changes", "baseline", expected=1)

    _stage(repository, FAKE_TOKEN.encode())
    (repository / "content with spaces.txt").write_text("safe unstaged hunk")
    _commit(repository, expected=1)


def test_hook_preserves_banned_name_check(repository: Path) -> None:
    _stage(repository, b"synthetic-denied-marker")
    _commit(repository, expected=1)


def test_hook_checks_partial_hunk_and_rename(repository: Path) -> None:
    _stage(repository, b"safe\n" * 20)
    _commit(repository)
    _stage(repository, b"safe\n" * 20 + FAKE_TOKEN.encode())
    (repository / "content with spaces.txt").write_bytes(b"safe\n" * 20)
    _commit(repository, expected=1)
    _stage(repository, b"safe\n" * 20)
    _run(repository, "git", "mv", "content with spaces.txt", FAKE_TOKEN)
    _commit(repository, expected=1)


def test_gate_checks_committed_staged_and_unstaged_changes(repository: Path) -> None:
    _run(repository, "make", "secret-check", "SECRET_BASE=baseline")
    _stage(repository, FAKE_TOKEN.encode())
    result = _run(repository, "make", "gate", "SECRET_BASE=baseline", expected=2)
    if b"scripts/test.sh" in result.stdout:
        raise AssertionError("backend gate ran after secret rejection")
    _stage(repository, b"safe")
    _commit(repository)
    (repository / "content with spaces.txt").write_text(FAKE_TOKEN)
    _run(repository, "make", "secret-check", "SECRET_BASE=baseline", expected=2)


def test_range_rejects_transient_secret_and_allows_legacy_lines(repository: Path) -> None:
    _stage(repository, FAKE_TOKEN.encode() + b"\nsafe\n")
    tree = _run(repository, "git", "write-tree").stdout.strip().decode("ascii")
    parent = _run(repository, "git", "rev-parse", "HEAD").stdout.strip().decode("ascii")
    commit = _run(repository, "git", "commit-tree", tree, "-p", parent, "-m", SUBJECT)
    _run(repository, "git", "update-ref", "HEAD", commit.stdout.strip().decode("ascii"))
    _check(repository, "--range", "baseline..HEAD", expected=1)
    _run(repository, "git", "branch", "legacy")
    _stage(repository, FAKE_TOKEN.encode() + b"\nsafe\nnew safe line\n")
    _commit(repository)
    _check(repository, "--changes", "legacy")
    _stage(repository, b"safe\n")
    _commit(repository)
    _check(repository, "--range", "baseline..HEAD", expected=1)
    _check(repository, "--changes", "legacy")


@pytest.mark.parametrize(
    "revision", ["missing..HEAD", "..HEAD", "HEAD..", "HEAD...HEAD", "-x..HEAD"]
)
def test_invalid_range_fails_closed(repository: Path, revision: str) -> None:
    _check(repository, "--range=" + revision, expected=1)


@pytest.mark.parametrize("behavior", ["absent", "error", "invalid-report", "wrong-version"])
def test_tool_failure_is_redacted_even_on_empty_changes(
    repository: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, behavior: str
) -> None:
    tools = tmp_path / "tools"
    tools.mkdir()
    for command in ("python3", "git"):
        (tools / command).symlink_to(shutil.which(command))
    if behavior != "absent":
        scanner = tools / "gitleaks"
        scanner.write_text(
            '#!/bin/sh\nif [ "$1" = version ]; then\n'
            + ("echo 0.0.0\n" if behavior == "wrong-version" else "echo 8.30.1\n")
            + "else\n"
            + (
                'echo "' + FAKE_TOKEN + '" >&2\nexit 2\n'
                if behavior == "error"
                else "echo invalid\n"
            )
            + "fi\n"
        )
        scanner.chmod(0o755)
    monkeypatch.setenv("PATH", str(tools))
    try:
        _check(repository, "--changes", "baseline", expected=1)
    finally:
        shutil.rmtree(tools)


def test_repository_and_environment_cannot_disable_rules(
    repository: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    config = repository / ".gitleaks.toml"
    config.write_text('[allowlist]\nregexes = [".*"]\n')
    monkeypatch.setenv("GITLEAKS_CONFIG", str(config))
    monkeypatch.setenv("GITLEAKS_CONFIG_TOML", config.read_text())
    (repository / ".gitleaksignore").write_text("stdin:github-pat:1\n")
    _stage(repository, (FAKE_TOKEN + " # gitleaks:allow").encode())
    _commit(repository, expected=1)


def test_untracked_files_and_deletions_are_outside_added_content(repository: Path) -> None:
    (repository / "untracked.txt").write_text(FAKE_TOKEN)
    _check(repository, "--changes", "baseline")
    _stage(repository, b"safe")
    _commit(repository)
    (repository / "content with spaces.txt").unlink()
    _check(repository, "--changes", "baseline")
    _run(repository, "git", "add", "-u")
    _commit(repository)


def test_nonancestor_base_is_rejected_and_subdirectory_cannot_narrow_scan(repository: Path) -> None:
    _stage(repository, b"safe")
    _commit(repository)
    _check(repository / "scripts", "--changes", "baseline")
    (repository / "content with spaces.txt").write_text(FAKE_TOKEN)
    _check(repository / "scripts", "--changes", "baseline", expected=1)
    tree = _run(repository, "git", "write-tree").stdout.strip().decode("ascii")
    unrelated = _run(repository, "git", "commit-tree", tree, "-m", SUBJECT)
    _run(
        repository,
        "git",
        "update-ref",
        "refs/heads/unrelated",
        unrelated.stdout.strip().decode("ascii"),
    )
    _check(repository, "--changes", "unrelated", expected=1)


def test_hook_rejects_nonfunctional_private_key(repository: Path) -> None:
    header = "-----BEGIN " + "RSA PRIVATE KEY-----"
    footer = "-----END " + "RSA PRIVATE KEY-----"
    content = header + "\n" + "synthetic-nonfunctional-fixture" * 3 + "\n" + footer
    _stage(repository, content.encode())
    _commit(repository, expected=1)


@pytest.mark.parametrize("flag", ["--assume-unchanged", "--skip-worktree"])
def test_hidden_index_flags_fail_closed(repository: Path, flag: str) -> None:
    _stage(repository, b"safe")
    _commit(repository)
    _run(repository, "git", "update-index", flag, "content with spaces.txt")
    (repository / "content with spaces.txt").write_text(FAKE_TOKEN)
    _check(repository, "--changes", "baseline", expected=1)
