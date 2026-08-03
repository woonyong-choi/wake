from __future__ import annotations

import base64
import hashlib
import json
import ssl
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib import request as urlrequest
from urllib.parse import quote

from packages.config.logs import get_logger
from packages.config.settings import env
from packages.contracts.security import SecretRef, SecretVaultPort, TokenVaultPort

SECRET_VAULT_PROVIDER_ENV = "SECRET_VAULT_PROVIDER"
TOKEN_VAULT_PROVIDER_ENV = "TOKEN_VAULT_PROVIDER"
K8S_SECRET_API_BASE_ENV = "OPSIA_K8S_API_BASE"
K8S_SECRET_TOKEN_PATH_ENV = "OPSIA_K8S_TOKEN_PATH"
K8S_SECRET_CA_CERT_PATH_ENV = "OPSIA_K8S_CA_CERT_PATH"
K8S_SECRET_HTTP_TIMEOUT_SECONDS_ENV = "OPSIA_K8S_SECRET_TIMEOUT_SECONDS"
PROVIDER_AUTO = "auto"
PROVIDER_ENV = "env"
PROVIDER_KUBERNETES_SECRET = "kubernetes-secret"
ENV_REF_PREFIX = "env:"
KUBERNETES_SECRET_REF_PREFIX = "k8s-secret:"
DEFAULT_K8S_SECRET_TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token"
DEFAULT_K8S_SECRET_CA_CERT_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
DEFAULT_K8S_SECRET_HTTP_TIMEOUT_SECONDS = "5"
LOGGER = get_logger(__name__)


class SecretNotFound(RuntimeError):
    pass


class SecretProviderUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class ParsedSecretRef:
    provider: str
    name: str
    field: str | None = None


class EnvSecretVault(SecretVaultPort):
    def read_secret(self, ref: SecretRef) -> str:
        parsed = parse_secret_ref(ref, default_provider=PROVIDER_ENV)
        if parsed.provider != PROVIDER_ENV:
            raise SecretNotFound(f"unsupported env secret ref provider: {parsed.provider}")
        value = env(parsed.name, "").strip()
        if not value:
            raise SecretNotFound(f"secret ref not found: {parsed.name}")
        log_secret_read(PROVIDER_ENV, parsed.name, parsed.field)
        return value


class KubernetesSecretVault(SecretVaultPort):
    def __init__(
        self,
        secret_reader: Any | None = None,
        api_base: str | None = None,
        token_path: str | None = None,
        ca_cert_path: str | None = None,
    ) -> None:
        self.secret_reader = secret_reader
        self.api_base = api_base
        self.token_path = token_path or env(
            K8S_SECRET_TOKEN_PATH_ENV, DEFAULT_K8S_SECRET_TOKEN_PATH
        )
        self.ca_cert_path = ca_cert_path or env(
            K8S_SECRET_CA_CERT_PATH_ENV, DEFAULT_K8S_SECRET_CA_CERT_PATH
        )

    def read_secret(self, ref: SecretRef) -> str:
        parsed = parse_secret_ref(ref, default_provider=PROVIDER_KUBERNETES_SECRET)
        if parsed.provider != PROVIDER_KUBERNETES_SECRET:
            raise SecretNotFound(f"unsupported kubernetes secret ref provider: {parsed.provider}")
        namespace, name = parse_kubernetes_secret_name(parsed.name)
        if not parsed.field:
            raise SecretNotFound("k8s-secret ref requires a key after '#'")
        response = (
            dict(self.secret_reader(namespace, name))
            if self.secret_reader is not None
            else self.fetch_kubernetes_secret(namespace, name)
        )
        value = secret_value_from_kubernetes_response(response, parsed.field)
        log_secret_read(PROVIDER_KUBERNETES_SECRET, parsed.name, parsed.field)
        return value

    def fetch_kubernetes_secret(self, namespace: str, name: str) -> dict[str, Any]:
        host = env("KUBERNETES_SERVICE_HOST", "").strip()
        port = env("KUBERNETES_SERVICE_PORT", "443").strip()
        api_base = (self.api_base or env(K8S_SECRET_API_BASE_ENV, "")).strip().rstrip("/")
        if not api_base:
            if not host:
                raise SecretProviderUnavailable("in-cluster Kubernetes service is required")
            api_base = f"https://{host}:{port}"
        token = Path(self.token_path).read_text(encoding="utf-8").strip()
        url = (
            f"{api_base}/api/v1/namespaces/{quote(namespace, safe='')}"
            f"/secrets/{quote(name, safe='')}"
        )
        request = urlrequest.Request(
            url,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        ca_cert = Path(self.ca_cert_path)
        context = ssl.create_default_context(cafile=str(ca_cert)) if ca_cert.exists() else None
        timeout = float(
            env(K8S_SECRET_HTTP_TIMEOUT_SECONDS_ENV, DEFAULT_K8S_SECRET_HTTP_TIMEOUT_SECONDS)
        )
        try:
            with urlrequest.urlopen(request, timeout=timeout, context=context) as response:  # noqa: S310
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            raise SecretNotFound(
                f"k8s secret ref not found: {redacted_ref(f'{namespace}/{name}')}"
            ) from exc


class RoutingSecretVault(SecretVaultPort):
    def __init__(
        self,
        env_vault: SecretVaultPort | None = None,
        kubernetes_vault: SecretVaultPort | None = None,
    ) -> None:
        self.env_vault = env_vault or EnvSecretVault()
        self.kubernetes_vault = kubernetes_vault

    def read_secret(self, ref: SecretRef) -> str:
        parsed = parse_secret_ref(ref, default_provider=PROVIDER_ENV)
        if parsed.provider == PROVIDER_KUBERNETES_SECRET:
            if self.kubernetes_vault is None:
                self.kubernetes_vault = KubernetesSecretVault()
            return self.kubernetes_vault.read_secret(ref)
        return self.env_vault.read_secret(ref)


class EnvTokenVault(TokenVaultPort):
    def __init__(self, secret_vault: SecretVaultPort | None = None) -> None:
        self.secret_vault = secret_vault or EnvSecretVault()

    def read_token(self, ref: SecretRef) -> str:
        return self.secret_vault.read_secret(ref)


def build_secret_vault(provider: str | None = None) -> SecretVaultPort:
    selected = normalize_provider(provider or env(SECRET_VAULT_PROVIDER_ENV, PROVIDER_AUTO))
    if selected == PROVIDER_AUTO:
        return RoutingSecretVault()
    if selected == PROVIDER_ENV:
        return EnvSecretVault()
    if selected == PROVIDER_KUBERNETES_SECRET:
        return KubernetesSecretVault()
    raise ValueError(f"unsupported secret vault provider: {selected}")


def build_token_vault(provider: str | None = None) -> TokenVaultPort:
    selected = provider or env(TOKEN_VAULT_PROVIDER_ENV, "")
    return EnvTokenVault(build_secret_vault(selected or None))


def normalize_provider(value: str) -> str:
    provider = value.strip().lower() or PROVIDER_AUTO
    if provider in {"k8s", "k8s-secret", "kubernetes", "kubernetes-secret"}:
        return PROVIDER_KUBERNETES_SECRET
    return provider


def parse_secret_ref(ref: SecretRef, *, default_provider: str) -> ParsedSecretRef:
    raw = ref.value.strip()
    if not raw:
        raise SecretNotFound("secret ref is empty")
    if raw.startswith(ENV_REF_PREFIX):
        return ParsedSecretRef(PROVIDER_ENV, raw.removeprefix(ENV_REF_PREFIX))
    if raw.startswith(KUBERNETES_SECRET_REF_PREFIX):
        locator, _, field = raw.removeprefix(KUBERNETES_SECRET_REF_PREFIX).partition("#")
        return ParsedSecretRef(PROVIDER_KUBERNETES_SECRET, locator.strip(), field.strip() or None)
    return ParsedSecretRef(normalize_provider(default_provider), raw)


def parse_kubernetes_secret_name(name: str) -> tuple[str, str]:
    parts = [part for part in name.strip("/").split("/") if part]
    if len(parts) != 2:
        raise SecretNotFound("k8s-secret ref must be '<namespace>/<secret-name>#<key>'")
    return parts[0], parts[1]


def secret_value_from_kubernetes_response(response: dict[str, Any], key: str) -> str:
    data = response.get("data")
    if not isinstance(data, dict) or not isinstance(data.get(key), str):
        raise SecretNotFound(f"k8s secret data key not found: {key}")
    try:
        return base64.b64decode(data[key]).decode("utf-8")
    except Exception as exc:
        raise SecretNotFound(f"k8s secret data key is not valid base64: {key}") from exc


def log_secret_read(provider: str, name: str, field: str | None) -> None:
    LOGGER.info(
        "secret_vault_read",
        extra={"context": {"provider": provider, "ref_hash": redacted_ref(name), "field": bool(field)}},
    )


def redacted_ref(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:12]
