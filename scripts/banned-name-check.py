"""Check staged additions and a message, --range history, or --tracked files.

KIT_BANNED_NAMES must name a nonempty UTF-8 list (optional BOM), one name per line.
Blank lines and lines starting with # are ignored. Content is scanned as UTF-8
and UTF-16/32 in both byte orders, with or without BOM, including binary data.
Other encodings and compressed data are not decoded. Invalid sequences become
replacement characters; binary files are not rejected solely for their encoding.
Changed blobs are decoded in full before comparing logical lines against the base.
Unchanged lines and removals are allowed; changed lines containing a name are rejected.
Failures exit 1; invalid arguments exit 2. Diagnostics never include input values.
"""

from __future__ import annotations

import argparse
import difflib
import os
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

_DIFF_OPTIONS = (
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
    "--no-color",
    "--raw",
    "-z",
    "--no-abbrev",
)
_ENCODINGS = (("utf-8", 1), ("utf-16-le", 2), ("utf-16-be", 2), ("utf-32-le", 4), ("utf-32-be", 4))


class BannedNameError(Exception):
    pass


class _ArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        self.print_usage(sys.stderr)
        self.exit(2, "banned-name check: invalid arguments\n")


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


if __name__ == "__main__":
    sys.exit(main())
