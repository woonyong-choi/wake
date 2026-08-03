#!/usr/bin/env bash
set -euo pipefail

uv run ruff check .
uv run python -m compileall -q src scripts
uv export --locked --no-dev --no-emit-project --no-hashes --format requirements-txt \
  | diff -u src/services/requirements.txt -
uv run pytest -q
