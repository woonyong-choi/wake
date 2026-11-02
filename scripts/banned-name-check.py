"""Check staged additions and a message, --range history, or --tracked files.

KIT_BANNED_NAMES must name a nonempty UTF-8 list (optional BOM), one name per line.
Blank lines and lines starting with # are ignored. Content is scanned as UTF-8
and UTF-16/32 in both byte orders, with or without BOM, including binary data.
Other encodings and compressed data are not decoded. Invalid sequences become
replacement characters; binary files are not rejected solely for their encoding.
Failures exit 1; invalid arguments exit 2. Diagnostics never include input values.
"""

from __future__ import annotations

import argparse
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
    "--text",
    "--unified=0",
    "--output-indicator-new=+",
    "--output-indicator-old=-",
    "--output-indicator-context= ",
)


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
            _check_patch(names, _git("diff", "--cached", *_DIFF_OPTIONS))
            _check(
                names,
                _git("diff", "--cached", "--diff-filter=ACMRT", "--name-only", "-z"),
                "staged paths",
            )
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
    for encoding, width in (
        ("utf-8", 1),
        ("utf-16-le", 2),
        ("utf-16-be", 2),
        ("utf-32-le", 4),
        ("utf-32-be", 4),
    ):
        # Git splits diffs on byte LF, which can leave partial UTF-16/32 units.
        for offset in range(width):
            text = content[offset:].decode(encoding, errors="replace").casefold()
            if any(name in text for name in names):
                raise BannedNameError(f"banned-name check: forbidden name in {source}")


def _check_patch(names: tuple[str, ...], patch: bytes) -> None:
    in_hunk = False
    added: list[bytes] = []
    for line in patch.split(b"\n"):
        if in_hunk and line.startswith(b"+"):
            added.append(line[1:])
            continue
        if added:
            _check(names, b"\n".join(added), "added content")
            added.clear()
        if line.startswith(b"diff --git "):
            in_hunk = False
        elif line.startswith(b"@@ "):
            in_hunk = True
    if added:
        _check(names, b"\n".join(added), "added content")


def _check_range(names: tuple[str, ...], revision_range: str) -> None:
    commits = _git("rev-list", "--end-of-options", revision_range).splitlines()
    for commit in commits:
        revision = commit.decode("ascii")
        _check(
            names,
            _git("show", "-s", "--encoding=UTF-8", "--format=%B", revision),
            "commit message",
        )
        _check_patch(
            names,
            _git("diff-tree", "--root", "-m", "-r", "-p", *_DIFF_OPTIONS, revision),
        )
        _check(
            names,
            _git(
                "diff-tree",
                "--root",
                "-m",
                "-r",
                "--diff-filter=ACMRT",
                "--name-only",
                "-z",
                revision,
            ),
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
