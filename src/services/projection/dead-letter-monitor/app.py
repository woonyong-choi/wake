"""dead-letter-monitor — dead_letter.created 를 운영 alert 흐름으로 연결."""

from __future__ import annotations

from packages.config.logs import get_logger
from packages.contracts.event_bus.bodies.platform import DeadLetterCreatedBody
from packages.runtime.app import App

app = App("dead-letter-monitor")
LOGGER = get_logger(__name__)
@app.on(DeadLetterCreatedBody)
async def on_dead_letter_created(evt: DeadLetterCreatedBody) -> None:
    LOGGER.warning(
        "dead letter created",
        extra={
            "context": {
                "dead_letter_id": evt.dead_letter_id,
                "original_subject": evt.original_subject,
                "consumer": evt.consumer,
                "attempts": evt.attempts,
                "error": evt.error,
            }
        },
    )


if __name__ == "__main__":
    app.run()
