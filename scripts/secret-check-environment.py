"""Run backend tests with Gitleaks 8.30.1, provisioning a verified temporary binary.

Only this explicit test setup command downloads a tool. Hooks never install tools.
The existing PATH binary must match the version; a missing binary is downloaded
from the pinned official release for Linux x64 or macOS arm64. SHA-256 is checked
before extracting the single executable. Temporary installation is removed when
tests finish, including failures. Other platforms and setup errors fail closed.
"""

from __future__ import annotations

import hashlib
import io
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

_VERSION = "8.30.1"
_RELEASES = {
    ("Linux", "x86_64"): (
        "linux_x64",
        "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
    ),
    ("Darwin", "arm64"): (
        "darwin_arm64",
        "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
    ),
}


def main() -> int:
    try:
        with tempfile.TemporaryDirectory(prefix="wake-secret-tool-") as directory:
            environment = os.environ.copy()
            binary = shutil.which("gitleaks")
            if binary is None:
                binary = str(_install(Path(directory)))
                environment["PATH"] = directory + os.pathsep + environment.get("PATH", "")
            version = subprocess.run([binary, "version"], capture_output=True, timeout=30)
            if version.returncode or version.stdout.strip() != _VERSION.encode():
                raise ValueError("unsupported scanner version")
            return subprocess.run(["bash", "scripts/test.sh"], env=environment).returncode
    except Exception:
        print("secret test setup: failed (redacted)", file=sys.stderr)
        return 1


def _install(directory: Path) -> Path:
    archive_platform, checksum = _RELEASES[(platform.system(), platform.machine())]
    url = (
        f"https://github.com/gitleaks/gitleaks/releases/download/v{_VERSION}/"
        f"gitleaks_{_VERSION}_{archive_platform}.tar.gz"
    )
    with urllib.request.urlopen(url, timeout=60) as response:
        content = response.read()
    if hashlib.sha256(content).hexdigest() != checksum:
        raise ValueError("scanner checksum mismatch")
    with tarfile.open(fileobj=io.BytesIO(content), mode="r:gz") as archive:
        member = archive.getmember("gitleaks")
        if not member.isfile():
            raise ValueError("invalid scanner archive")
        stream = archive.extractfile(member)
        if stream is None:
            raise ValueError("missing scanner executable")
        with stream:
            binary = directory / "gitleaks"
            binary.write_bytes(stream.read())
    binary.chmod(0o700)
    return binary


if __name__ == "__main__":
    sys.exit(main())
