"""Check staged additions and a message, --range history, or --tracked files.

KIT_BANNED_NAMES must name a nonempty UTF-8 list of literal names, one per line.
Blank lines and lines starting with # are ignored. Failures exit 1 without values.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
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
        for line in Path(path).read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )
    if not names:
        raise BannedNameError("banned-name check: name list must not be empty")
    return names


def _git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], stderr=subprocess.PIPE)


def _check(names: tuple[str, ...], content: bytes, source: str) -> None:
    text = content.decode("utf-8", errors="replace").casefold()
    if any(name in text for name in names):
        raise BannedNameError(f"banned-name check: forbidden name in {source}")


def _check_patch(names: tuple[str, ...], patch: bytes) -> None:
    in_hunk = False
    for line in patch.split(b"\n"):
        if line.startswith(b"diff --git "):
            in_hunk = False
        elif line.startswith(b"@@ "):
            in_hunk = True
        elif in_hunk and line.startswith(b"+"):
            _check(names, line[1:], "added content")


def _check_range(names: tuple[str, ...], revision_range: str) -> None:
    commits = _git("rev-list", "--end-of-options", revision_range).splitlines()
    for commit in commits:
        revision = commit.decode("ascii")
        _check(names, _git("show", "-s", "--format=%B", revision), "commit message")
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
