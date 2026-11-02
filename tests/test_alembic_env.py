from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_alembic_env_registers_all_current_model_tables_without_database() -> None:
    script = """
import ast
import io
from pathlib import Path
from typing import Any
from unittest.mock import patch

from alembic import command, context
from alembic.config import Config

root = Path.cwd()
model_paths = sorted((root / "src/domains").glob("*/models.py"))
model_paths.append(root / "src/packages/storage/schema.py")
expected = set()
for path in model_paths:
    names = {
        node.value.value
        for node in ast.walk(ast.parse(path.read_text()))
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "__tablename__"
                for target in node.targets)
        and isinstance(node.value, ast.Constant)
        and isinstance(node.value.value, str)
    }
    assert names, f"no table declarations found: {path.name}"
    expected.update(names)

captured = []
configure = context.configure

def capture_metadata(*args: Any, **kwargs: Any) -> None:
    captured.append(kwargs["target_metadata"])
    return configure(*args, **kwargs)

config = Config(output_buffer=io.StringIO())
config.set_main_option("script_location", str(root / "alembic"))
with patch.object(context, "configure", capture_metadata):
    command.upgrade(config, "base", sql=True)

assert len(captured) == 1
actual = set(captured[0].tables)
assert actual == expected, f"missing={sorted(expected - actual)}, extra={sorted(actual - expected)}"
print(f"registered model modules={len(model_paths)} tables={len(actual)}")
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=ROOT,
        env={
            "PATH": os.environ.get("PATH", os.defpath),
            "PYTHONPATH": str(ROOT / "src"),
            "DATABASE_URL": "postgresql://localtest:synthetic@127.0.0.1:1/localtest",
        },
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    print(result.stdout.strip())
