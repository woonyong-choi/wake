"""Provider boundary for the Golden Path.

Only GitHub is exposed because the product creates reviewable Draft PRs; cluster
deployment and cloud provisioning adapters are intentionally outside this repo.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ProviderCategory(StrEnum):
    SOURCE = "source"


class ProviderStatus(StrEnum):
    AVAILABLE = "available"


@dataclass(frozen=True)
class ProviderDefinition:
    category: ProviderCategory
    key: str
    label: str
    status: ProviderStatus
    adapter: str
    capabilities: tuple[str, ...]


GITHUB_PROVIDER = ProviderDefinition(
    category=ProviderCategory.SOURCE,
    key="github",
    label="GitHub",
    status=ProviderStatus.AVAILABLE,
    adapter="GithubScmProvider",
    capabilities=("manifest_read", "safe_pr"),
)


def require_available_provider(
    category: ProviderCategory | str,
    key: str,
) -> ProviderDefinition:
    normalized_category = ProviderCategory(category)
    if normalized_category == ProviderCategory.SOURCE and key.strip().casefold() == "github":
        return GITHUB_PROVIDER
    raise ValueError(f"unsupported provider: {normalized_category.value}/{key}")
