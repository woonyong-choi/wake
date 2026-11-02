"""Issue #37: verify temporary scanner setup and integrity failures."""

from __future__ import annotations

import hashlib
import io
import runpy
import tarfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("is_valid", [True, False])
def test_temporary_scanner_checks_pinned_digest_before_extraction(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, is_valid: bool
) -> None:
    namespace = runpy.run_path(str(ROOT / "scripts/secret-check-environment.py"))
    content = io.BytesIO()
    executable = b"#!/bin/sh\necho 8.30.1\n"
    with tarfile.open(fileobj=content, mode="w:gz") as archive:
        member = tarfile.TarInfo("gitleaks")
        member.size = len(executable)
        archive.addfile(member, io.BytesIO(executable))
    payload = content.getvalue()
    platform = namespace["platform"]
    monkeypatch.setitem(
        namespace["_RELEASES"],
        (platform.system(), platform.machine()),
        ("synthetic", hashlib.sha256(payload).hexdigest() if is_valid else "0" * 64),
    )
    monkeypatch.setattr(namespace["urllib"].request, "urlopen", lambda *a, **k: io.BytesIO(payload))
    if is_valid:
        binary = namespace["_install"](tmp_path)
        assert binary.read_bytes() == executable
        binary.unlink()
    else:
        with pytest.raises(ValueError, match="checksum mismatch"):
            namespace["_install"](tmp_path)
        assert not (tmp_path / "gitleaks").exists()
