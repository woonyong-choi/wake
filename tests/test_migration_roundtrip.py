"""Run #38 with WAKE_MIGRATION_ROUNDTRIP=1 and pytest --noconftest -s.

Only a disposable PostgreSQL 17 container is used. The immutable pre-Alembic
schema is the intended starting fixture; an empty database is unsupported.
The round trip targets Alembic base, not deletion of the pre-Alembic schema.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import psycopg
import pytest

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "alembic/baselines/20260708_pre_alembic.sql"
pytestmark = pytest.mark.skipif(
    os.environ.get("WAKE_MIGRATION_ROUNDTRIP") != "1",
    reason="explicit disposable Docker check; run make migration-roundtrip",
)


class _Postgres:
    def __init__(self) -> None:
        self.token = uuid.uuid4().hex
        self.name = f"wake-migration-roundtrip-{self.token}"
        self.password = uuid.uuid4().hex
        self.port = 0
        self.env = {
            "PATH": os.environ.get("PATH", os.defpath),
            "POSTGRES_PASSWORD": self.password,
        }

    def run(self, *args: str) -> str:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            env=self.env,
            timeout=120,
            cwd=ROOT,
        )
        if result.returncode:
            diagnostic = (result.stdout + result.stderr).replace(self.password, "[masked]")
            raise RuntimeError(f"{args[0]} failed ({result.returncode}):\n{diagnostic}")
        if args[0] == sys.executable:
            print(result.stderr.replace(self.password, "[masked]"), flush=True)
        return result.stdout.strip()

    def start(self) -> None:
        container_id = self.run(
            "docker",
            "run",
            "--detach",
            "--name",
            self.name,
            "--label",
            f"wake.migration-roundtrip={self.token}",
            "--publish",
            "127.0.0.1::5432",
            "--env",
            "POSTGRES_PASSWORD",
            "--env",
            "POSTGRES_USER=localtest",
            "--env",
            "POSTGRES_DB=localtest",
            "--tmpfs",
            "/var/lib/postgresql/data",
            "postgres:17-alpine",
        )
        print(f"container name={self.name} id={container_id}", flush=True)
        binding = self.run("docker", "port", self.name, "5432/tcp")
        assert binding.startswith("127.0.0.1:"), "database must bind only to loopback"
        self.port = int(binding.rsplit(":", 1)[1])
        for _ in range(60):
            result = subprocess.run(
                ["docker", "exec", self.name, "pg_isready", "-h", "127.0.0.1", "-U", "localtest"],
                capture_output=True,
                env=self.env,
                timeout=5,
            )
            if result.returncode == 0:
                return
            time.sleep(0.5)
        raise RuntimeError("disposable postgres did not become ready")

    def close(self) -> None:
        owned = self.run(
            "docker",
            "ps",
            "--all",
            "--quiet",
            "--no-trunc",
            "--filter",
            f"name=^/{self.name}$",
            "--filter",
            f"label=wake.migration-roundtrip={self.token}",
        )
        if owned:
            self.run("docker", "rm", "--force", "--volumes", owned)
        remaining = self.run(
            "docker",
            "ps",
            "--all",
            "--quiet",
            "--filter",
            f"label=wake.migration-roundtrip={self.token}",
        )
        assert not remaining, "owned test container was not removed"
        print(f"cleanup name={self.name} remaining=0", flush=True)

    def connect(self) -> psycopg.Connection[Any]:
        return psycopg.connect(
            host="127.0.0.1",
            port=self.port,
            user="localtest",
            password=self.password,
            dbname="localtest",
            connect_timeout=5,
            autocommit=True,
        )

    def migrate(self, action: str, revision: str) -> None:
        self.env["DATABASE_URL"] = (
            f"postgresql://localtest:{self.password}@127.0.0.1:{self.port}/localtest"
        )
        output = self.run(sys.executable, "-m", "alembic", action, revision)
        print(f"alembic {action} {revision}: completed {output}", flush=True)


@pytest.fixture
def postgres() -> Iterator[_Postgres]:
    def interrupt(_signum: int, _frame: Any) -> None:
        raise KeyboardInterrupt

    previous = signal.signal(signal.SIGTERM, interrupt)
    database = _Postgres()
    try:
        database.start()
        yield database
    finally:
        try:
            database.close()
        finally:
            signal.signal(signal.SIGTERM, previous)


def _script_config() -> Any:
    from alembic.config import Config

    config = Config()
    config.set_main_option("script_location", str(ROOT / "alembic"))
    return config


def _revision(connection: psycopg.Connection[Any]) -> list[str]:
    return [row[0] for row in connection.execute("SELECT version_num FROM alembic_version")]


def _schema(connection: psycopg.Connection[Any]) -> list[tuple[Any, ...]]:
    return connection.execute(
        """
        SELECT 'column', table_name, column_name,
               data_type || ':' || udt_name || ':' || is_nullable || ':' ||
               coalesce(column_default, '')
        FROM information_schema.columns WHERE table_schema = 'public'
        UNION ALL
        SELECT 'index', tablename, indexname, indexdef
        FROM pg_indexes WHERE schemaname = 'public'
        UNION ALL
        SELECT 'constraint', c.relname, con.conname, pg_get_constraintdef(con.oid)
        FROM pg_constraint con JOIN pg_class c ON con.conrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public'
        ORDER BY 1, 2, 3, 4
        """
    ).fetchall()


def test_upgrade_empty_database_is_unsupported(postgres: _Postgres) -> None:
    with pytest.raises(RuntimeError, match='relation "rca_timeline" does not exist'):
        postgres.migrate("upgrade", "head")
    print("negative check: empty database rejected; no roundtrip success claimed", flush=True)


def test_baseline_head_base_head_preserves_schema_and_baseline_row(postgres: _Postgres) -> None:
    from alembic.script import ScriptDirectory

    scripts = ScriptDirectory.from_config(_script_config())
    head = scripts.get_current_head()
    assert head is not None
    print("revisions=" + ",".join(r.revision for r in reversed(list(scripts.walk_revisions()))))
    with postgres.connect() as connection:
        connection.execute(BASELINE.read_text())
        connection.execute("SET search_path TO public")
        connection.execute(
            "INSERT INTO workspaces (workspace_id, slug, name, status) "
            "VALUES ('roundtrip', 'roundtrip', 'roundtrip', 'active')"
        )
        original_row = connection.execute(
            "SELECT * FROM workspaces WHERE workspace_id = 'roundtrip'"
        ).fetchone()

    postgres.migrate("upgrade", "head")
    with postgres.connect() as connection:
        assert _revision(connection) == [head]
        head_schema = _schema(connection)
        assert any(row[2] == "ix_rca_timeline_occurrence" for row in head_schema)
        assert any(row[2] == "incident_occurrence_id" for row in head_schema)

    postgres.migrate("downgrade", "base")
    with postgres.connect() as connection:
        assert _revision(connection) == []
        base_schema = _schema(connection)
        assert not any(row[2] == "ix_rca_timeline_occurrence" for row in base_schema)
        assert not any(row[2] == "incident_occurrence_id" for row in base_schema)
        assert connection.execute("SELECT to_regclass('release_plans')").fetchone() == (None,)
        assert (
            connection.execute(
                "SELECT * FROM workspaces WHERE workspace_id = 'roundtrip'"
            ).fetchone()
            == original_row
        )

    postgres.migrate("upgrade", "head")
    with postgres.connect() as connection:
        assert _revision(connection) == [head]
        assert _schema(connection) == head_schema
        assert (
            connection.execute(
                "SELECT * FROM workspaces WHERE workspace_id = 'roundtrip'"
            ).fetchone()
            == original_row
        )
