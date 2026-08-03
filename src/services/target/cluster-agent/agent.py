"""Read-only target agent for bounded Kubernetes evidence collection."""

from __future__ import annotations

import asyncio
from typing import Self

import httpx
from evidence import EvidenceCollector, EvidenceJobScheduler
from providers import KubernetesSnapshotProvider, TelemetryProvider

from packages.config.constants import Target
from packages.config.logs import CONTEXT_KEY, get_logger
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.fields import Gateway
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.contracts.interfaces import ManagementPlaneClient

LOGGER = get_logger(__name__)


class AgentConfig:
    TARGET_AGENT_SERVICE_NAME = "cluster-agent"
    MANAGEMENT_BASE_URL_ENV = "MANAGEMENT_BASE_URL"
    TARGET_CLUSTER_ID_ENV = "TARGET_CLUSTER_ID"
    WORKSPACE_ID_ENV = "WORKSPACE_ID"
    EVIDENCE_INTERVAL_ENV = "EVIDENCE_INTERVAL_SECONDS"
    AGENT_TOKEN_ENV = "AGENT_TOKEN"
    AGENT_TOKEN_HEADER = "x-agent-token"
    HOSTNAME_ENV = "HOSTNAME"
    TARGET_AGENT_IMAGE_ENV = "TARGET_AGENT_IMAGE"

    DEFAULT_MANAGEMENT_BASE_URL = ""
    DEFAULT_AGENT_ID = "target-agent"
    DEFAULT_HTTP_TIMEOUT_SECONDS = 20
    DEFAULT_REGISTER_RETRY_SECONDS = 3
    EVIDENCE_SOURCE_ID = "cluster-snapshot"
    AGENT_CAPABILITIES = [
        "collector",
        "evidence.kubernetes.snapshot.v1",
    ]


def agent_version_from_image(image_ref: str) -> str | None:
    """Return an observed tag or shortened digest without inventing a version."""

    ref = image_ref.strip()
    if not ref:
        return None
    if "@sha256:" in ref:
        return ref.rsplit("@sha256:", 1)[1][:12]
    tail = ref.rsplit("/", 1)[-1]
    return tail.rsplit(":", 1)[1] if ":" in tail else None


class HttpManagementPlaneClient:
    """Only the management-plane calls required by the evidence scheduler."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(timeout=AgentConfig.DEFAULT_HTTP_TIMEOUT_SECONDS)
        self.headers = {AgentConfig.AGENT_TOKEN_HEADER: env(AgentConfig.AGENT_TOKEN_ENV, "")}

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.client.aclose()

    async def register_agent(
        self,
        cluster_id: str,
        agent_id: str,
        capabilities: list[str],
    ) -> None:
        payload: JsonObject = {
            Gateway.CLUSTER_ID: cluster_id,
            Gateway.AGENT_ID: agent_id,
            Gateway.CAPABILITIES: capabilities,
        }
        version = agent_version_from_image(env(AgentConfig.TARGET_AGENT_IMAGE_ENV, ""))
        if version:
            payload["details"] = {"version": version, "access_mode": "read_only"}
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.AGENT_CONNECT_PATH}",
            json=payload,
            headers=self.headers,
        )
        response.raise_for_status()

    async def schedule_evidence_jobs(
        self,
        source_id: str,
        window_start: str,
        provider_keys: list[str],
    ) -> JsonObject:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.AGENT_EVIDENCE_JOB_SCHEDULE_PATH}",
            json={
                Gateway.SOURCE_ID: source_id,
                Gateway.WINDOW_START: window_start,
                Gateway.PROVIDER_KEYS: provider_keys,
            },
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json()

    async def poll_evidence_job(
        self,
        provider_key: str,
        agent_id: str,
        timeout_seconds: int,
    ) -> JsonObject | None:
        response = await self.client.get(
            f"{self.base_url}{gateway_routes.AGENT_EVIDENCE_JOB_POLL_PATH}",
            params={
                Gateway.PROVIDER_KEY: provider_key,
                Gateway.AGENT_ID: agent_id,
                "timeout": timeout_seconds,
            },
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json().get(Gateway.JOB)

    async def complete_evidence_job(
        self,
        job_id: str,
        agent_id: str,
        lease_id: str,
        status: str,
        result: JsonObject,
        error: str,
    ) -> JsonObject:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.agent_evidence_job_result_path(job_id)}",
            json={
                Gateway.AGENT_ID: agent_id,
                Gateway.LEASE_ID: lease_id,
                Gateway.STATUS: status,
                Gateway.RESULT: result,
                Gateway.ERROR: error,
            },
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json()


class TargetClusterAgent:
    """Run Kubernetes evidence jobs; it has no command or mutation channel."""

    def __init__(
        self,
        client: ManagementPlaneClient | None = None,
        providers: tuple[TelemetryProvider, ...] | None = None,
        kubernetes_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = env(
            AgentConfig.MANAGEMENT_BASE_URL_ENV,
            AgentConfig.DEFAULT_MANAGEMENT_BASE_URL,
        ).rstrip("/")
        if not self.base_url:
            raise RuntimeError(f"{AgentConfig.MANAGEMENT_BASE_URL_ENV} is required")
        self.cluster_id = env(AgentConfig.TARGET_CLUSTER_ID_ENV, Target.DEFAULT_CLUSTER_ID)
        self.workspace_id = env(AgentConfig.WORKSPACE_ID_ENV, DEFAULT_WORKSPACE_ID)
        self.agent_id = env(AgentConfig.HOSTNAME_ENV, AgentConfig.DEFAULT_AGENT_ID)
        interval = int(
            env(
                AgentConfig.EVIDENCE_INTERVAL_ENV,
                Target.DEFAULT_EVIDENCE_INTERVAL_SECONDS,
            )
        )
        selected_providers = providers or (
            KubernetesSnapshotProvider(
                cluster_id=self.cluster_id,
                transport=kubernetes_transport,
            ),
        )
        self.collector = EvidenceCollector(selected_providers)
        provider_keys = tuple(self.collector.providers)
        self.scheduler = EvidenceJobScheduler(
            cluster_id=self.cluster_id,
            workspace_id=self.workspace_id,
            agent_id=self.agent_id,
            source_id=AgentConfig.EVIDENCE_SOURCE_ID,
            collector=self.collector,
            provider_keys=provider_keys,
            provider_worker_counts={key: 1 for key in provider_keys},
            interval_seconds=interval,
        )
        self.client = client

    async def register(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                await client.register_agent(
                    self.cluster_id,
                    self.agent_id,
                    list(AgentConfig.AGENT_CAPABILITIES),
                )
                return
            except Exception as exc:
                LOGGER.warning(
                    "agent_waiting_for_management_gateway",
                    extra={
                        CONTEXT_KEY: {
                            Gateway.CLUSTER_ID: self.cluster_id,
                            Gateway.AGENT_ID: self.agent_id,
                            "exception_type": type(exc).__name__,
                        }
                    },
                )
                await asyncio.sleep(AgentConfig.DEFAULT_REGISTER_RETRY_SECONDS)

    async def run_with_client(self, client: ManagementPlaneClient) -> None:
        await self.register(client)
        await self.scheduler.run(client)

    async def run(self) -> None:
        if self.client is not None:
            await self.run_with_client(self.client)
            return
        async with HttpManagementPlaneClient(self.base_url) as client:
            await self.run_with_client(client)
