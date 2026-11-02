"""Check staged additions and a message, --range history, or --tracked files.

KIT_BANNED_NAMES must name a nonempty UTF-8 list (optional BOM), one name per line.
Blank lines and lines starting with # are ignored. Content is scanned as UTF-8
and UTF-16/32 in both byte orders, with or without BOM, including binary data.
Other encodings and compressed data are not decoded. Invalid sequences become
replacement characters; binary files are not rejected solely for their encoding.
Changed blobs are decoded in full before comparing logical lines against the base.
Unchanged lines and removals are allowed; changed lines containing a name are rejected.
Secret mode (--secrets) requires Gitleaks 8.30.1 on PATH. With a message file it
checks only the index and message; --range A..B checks each introduced commit,
including intermediate commits and each merge parent. --changes BASE additionally
checks staged and unstaged tracked changes against HEAD. BASE must be an ancestor
of HEAD; open/three-dot ranges and unrelated bases fail closed. No history
before BASE is scanned by --changes. Explicit --range REV scans all history
reachable from REV, matching the name checker; it is never the gate default. Added/replaced logical lines and new paths are checked;
deletions and unchanged legacy lines pass. Renames are delete/add, binary bytes
are scanned as text, and UTF-16/32 byte orders and alignments are also checked.
Archives are not expanded; changed submodules and hidden index flags fail closed. Untracked files are excluded until staged. External
config, ignore files, inline allow comments, and environment overrides cannot
narrow the scanner. Reports stay in memory and all failures use a fixed diagnostic.
Failures exit 1; invalid arguments exit 2. Diagnostics never include input values.
"""

from __future__ import annotations

import argparse
import difflib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import NoReturn

_DIFF_OPTIONS = (
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
    "--ignore-submodules=none",
    "--no-color",
    "--raw",
    "-z",
    "--no-abbrev",
)
_ENCODINGS = (("utf-8", 1), ("utf-16-le", 2), ("utf-16-be", 2), ("utf-32-le", 4), ("utf-32-be", 4))


class SecretCheckError(Exception):
    pass


class BannedNameError(Exception):
    pass


class _ArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        if self.prog == "secret-check":
            self.exit(2, "secret check: invalid arguments (redacted)\n")
        self.print_usage(sys.stderr)
        self.exit(2, "banned-name check: invalid arguments\n")


class _SecretScanner:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.config = directory / "scanner.toml"
        self.config.write_text("[extend]\nuseDefault = true\n")
        self.environment = {k: v for k, v in os.environ.items() if not k.startswith("GITLEAKS_")}
        version = subprocess.run(
            ["gitleaks", "version"], capture_output=True, timeout=30, env=self.environment
        )
        if version.returncode or version.stdout.strip() != b"8.30.1":
            raise SecretCheckError
        self._findings("")

    def check_added(self, before: bytes, after: bytes) -> None:
        encodings = _ENCODINGS if b"\0" in after else _ENCODINGS[:1]
        for encoding, width in encodings:
            for offset in range(width):
                old_lines = before[offset:].decode(encoding, errors="replace").split("\n")
                new_text = after[offset:].decode(encoding, errors="replace")
                new_lines = new_text.split("\n")
                changes = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False)
                additions = [
                    (start + 1, end)
                    for tag, _, _, start, end in changes.get_opcodes()
                    if tag in {"insert", "replace"}
                ]
                if not additions:
                    continue
                for finding in self._findings(new_text):
                    start, end = finding["StartLine"], finding["EndLine"]
                    if any(
                        start <= added_end and end >= added_start
                        for added_start, added_end in additions
                    ):
                        raise SecretCheckError

    def _findings(self, content: str) -> list[dict]:
        result = subprocess.run(
            [
                "gitleaks",
                "stdin",
                "--config",
                str(self.config),
                "--gitleaks-ignore-path",
                str(self.directory / "absent-ignore"),
                "--ignore-gitleaks-allow",
                "--redact=100",
                "--no-banner",
                "--no-color",
                "--log-level=error",
                "--report-format=json",
                "--report-path=-",
            ],
            input=content.encode("utf-8"),
            capture_output=True,
            cwd=self.directory,
            env=self.environment,
            timeout=30,
        )
        findings = json.loads(result.stdout)
        if not isinstance(findings, list) or result.returncode != (1 if findings else 0):
            raise SecretCheckError
        for finding in findings:
            if (
                not isinstance(finding, dict)
                or type(finding.get("StartLine")) is not int
                or type(finding.get("EndLine")) is not int
                or not 1 <= finding["StartLine"] <= finding["EndLine"]
            ):
                raise SecretCheckError
        return findings


def main() -> int:
    parser = _ArgumentParser(prog="banned-name-check.py", description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("message", nargs="?", type=Path)
    mode.add_argument("--range", dest="revision_range")
    mode.add_argument("--tracked", action="store_true")
    args = parser.parse_args()
    try:
        names = _load_names()
        if args.revision_range is not None:
            _check_range(names, args.revision_range)
        elif args.tracked:
            _check_tracked(names)
        else:
            if args.message is not None:
                _check(names, args.message.read_bytes(), "commit message")
            _check_changes(names, _git("diff", "--cached", *_DIFF_OPTIONS), "staged paths")
    except BannedNameError as error:
        print(str(error), file=sys.stderr)
        return 1
    except (OSError, UnicodeError, subprocess.CalledProcessError):
        print("banned-name check: cannot read required input", file=sys.stderr)
        return 1
    return 0


def _load_names() -> tuple[str, ...]:
    path = os.environ.get("KIT_BANNED_NAMES")
    if not path:
        raise BannedNameError("banned-name check: KIT_BANNED_NAMES is required")
    names = tuple(
        line.strip().casefold()
        for line in Path(path).read_text(encoding="utf-8-sig").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )
    if not names:
        raise BannedNameError("banned-name check: name list must not be empty")
    return names


def _git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], stderr=subprocess.PIPE)


def _check(names: tuple[str, ...], content: bytes, source: str) -> None:
    for encoding, width in _ENCODINGS:
        for offset in range(width):
            text = content[offset:].decode(encoding, errors="replace").casefold()
            if any(name in text for name in names):
                raise BannedNameError(f"banned-name check: forbidden name in {source}")


def _check_changes(names: tuple[str, ...], changes: bytes, source: str) -> None:
    records = changes.split(b"\0")
    for index in range(0, len(records) - 1, 2):
        old_mode, new_mode, old_oid, new_oid, status = records[index].split()
        if status == b"D":
            continue
        _check(names, records[index + 1], source)
        if status == b"U":
            raise BannedNameError("banned-name check: unresolved index")
        before = _read_blob(old_mode.lstrip(b":"), old_oid)
        after = _read_blob(new_mode, new_oid)
        _check_added_content(names, before, after)


def _read_blob(mode: bytes, oid: bytes) -> bytes:
    if mode == b"000000":
        return b""
    if mode == b"160000":
        return b"Subproject commit " + oid + b"\n"
    return _git("cat-file", "blob", oid.decode("ascii"))


def _check_added_content(names: tuple[str, ...], before: bytes, after: bytes) -> None:
    for encoding, width in _ENCODINGS:
        for offset in range(width):
            old_text = before[offset:].decode(encoding, errors="replace").casefold()
            new_text = after[offset:].decode(encoding, errors="replace").casefold()
            if not any(name in new_text for name in names):
                continue
            old_lines = old_text.split("\n")
            new_lines = new_text.split("\n")
            changes = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False)
            for tag, _, _, start, end in changes.get_opcodes():
                if tag in {"insert", "replace"}:
                    added = "\n".join(new_lines[start:end])
                    if any(name in added for name in names):
                        raise BannedNameError("banned-name check: forbidden name in added content")


def _check_range(names: tuple[str, ...], revision_range: str) -> None:
    commits = _git("rev-list", "--end-of-options", revision_range).splitlines()
    for commit in commits:
        revision = commit.decode("ascii")
        _check(
            names,
            _git("show", "-s", "--encoding=UTF-8", "--format=%B", revision),
            "commit message",
        )
        _check_changes(
            names,
            _git("diff-tree", "--root", "--no-commit-id", "-m", "-r", *_DIFF_OPTIONS, revision),
            "committed paths",
        )


def _check_tracked(names: tuple[str, ...]) -> None:
    root = Path(os.fsdecode(_git("rev-parse", "--show-toplevel").rstrip(b"\n")))
    paths = _git("-C", str(root), "ls-files", "--cached", "-z").split(b"\0")
    for raw_path in filter(None, paths):
        _check(names, raw_path, "tracked paths")
        path = root / os.fsdecode(raw_path)
        content = os.fsencode(os.readlink(path)) if path.is_symlink() else path.read_bytes()
        _check(names, content, "tracked content")


def secret_main() -> int:
    parser = _ArgumentParser(prog="secret-check")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("message", nargs="?", type=Path)
    mode.add_argument("--range", dest="revision_range")
    mode.add_argument("--changes", metavar="BASE")
    try:
        args = parser.parse_args(sys.argv[2:])
        with tempfile.TemporaryDirectory(prefix="wake-secret-") as directory:
            scanner = _SecretScanner(Path(directory))
            if args.revision_range is not None:
                _check_secret_range(scanner, args.revision_range)
            elif args.changes is not None:
                _check_secret_range(scanner, args.changes + "..HEAD")
                _check_secret_changes(scanner, _git("diff", "--cached", *_DIFF_OPTIONS))
                _check_secret_worktree(scanner)
            else:
                scanner.check_added(b"", args.message.read_bytes())
                _check_secret_changes(scanner, _git("diff", "--cached", *_DIFF_OPTIONS))
    except SystemExit:
        return 2
    except Exception:
        print("secret check: rejected or unavailable (redacted)", file=sys.stderr)
        return 1
    print("secret check: passed")
    return 0


def _check_secret_changes(scanner: _SecretScanner, changes: bytes) -> None:
    records = changes.split(b"\0")
    for index in range(0, len(records) - 1, 2):
        old_mode, new_mode, old_oid, new_oid, status = records[index].split()
        if status == b"D":
            continue
        if status not in {b"A", b"M", b"T"}:
            raise SecretCheckError
        scanner.check_added(b"", records[index + 1])
        if new_mode == b"160000":
            raise SecretCheckError
        scanner.check_added(
            _read_blob(old_mode.lstrip(b":"), old_oid), _read_blob(new_mode, new_oid)
        )


def _check_secret_worktree(scanner: _SecretScanner) -> None:
    entries = _git("ls-files", "-v", "-z").split(b"\0")
    if any(entry and (entry[:1] == b"S" or entry[:1].islower()) for entry in entries):
        raise SecretCheckError
    root = Path(os.fsdecode(_git("rev-parse", "--show-toplevel").rstrip(b"\n")))
    changes = _git("diff-files", *_DIFF_OPTIONS).split(b"\0")
    for index in range(0, len(changes) - 1, 2):
        old_mode, new_mode, old_oid, _, status = changes[index].split()
        if status == b"D":
            continue
        if status not in {b"M", b"T"} or new_mode == b"160000":
            raise SecretCheckError
        raw_path = changes[index + 1]
        scanner.check_added(b"", raw_path)
        path = root / os.fsdecode(raw_path)
        content = os.fsencode(os.readlink(path)) if path.is_symlink() else path.read_bytes()
        scanner.check_added(_read_blob(old_mode.lstrip(b":"), old_oid), content)


def _check_secret_range(scanner: _SecretScanner, revision_range: str) -> None:
    if ".." not in revision_range:
        if not revision_range or revision_range.startswith("-"):
            raise SecretCheckError
        revision = _git("rev-parse", "--verify", "--end-of-options", revision_range + "^{commit}")
        _scan_secret_commits(scanner, _git("rev-list", revision.strip().decode("ascii")))
        return
    if revision_range.count("..") != 1 or "..." in revision_range:
        raise SecretCheckError
    refs = revision_range.split("..")
    if any(not ref or ref.startswith("-") for ref in refs):
        raise SecretCheckError
    base, head = (
        _git("rev-parse", "--verify", "--end-of-options", ref + "^{commit}").strip().decode("ascii")
        for ref in refs
    )
    _git("merge-base", "--is-ancestor", base, head)
    _scan_secret_commits(scanner, _git("rev-list", base + ".." + head))


def _scan_secret_commits(scanner: _SecretScanner, commits: bytes) -> None:
    for commit in commits.splitlines():
        revision = commit.decode("ascii")
        scanner.check_added(b"", _git("show", "-s", "--encoding=UTF-8", "--format=%B", revision))
        _check_secret_changes(
            scanner,
            _git("diff-tree", "--root", "--no-commit-id", "-m", "-r", *_DIFF_OPTIONS, revision),
        )


if __name__ == "__main__":
    sys.exit(secret_main() if sys.argv[1:2] == ["--secrets"] else main())
