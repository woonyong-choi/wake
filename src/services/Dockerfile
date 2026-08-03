FROM python:3.13.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src

WORKDIR /app

RUN useradd --uid 10001 --user-group --no-create-home --shell /usr/sbin/nologin appuser \
    && apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY src/services/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appuser alembic ./alembic
COPY --chown=appuser:appuser alembic.ini ./alembic.ini
COPY --chown=appuser:appuser src ./src
RUN find /app/src -type d -exec chmod 755 {} + \
    && find /app/src -type f -exec chmod 644 {} + \
    && test "$(alembic heads | wc -l | tr -d ' ')" = "1" \
    && alembic heads | grep -Eq '^[0-9_]+ \(head\)$' \
    && python -m packages.storage.baseline verify

USER 10001

EXPOSE 8000 9100

CMD ["python", "src/services/gateway/api-gateway/app.py"]
