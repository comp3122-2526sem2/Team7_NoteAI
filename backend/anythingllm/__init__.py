"""
AnythingLLM client package.

Usage
-----
Inject via FastAPI dependency:

    from anythingllm import get_client
    from fastapi import Depends

    @router.post("/generate")
    async def generate(client: AnythingLLMClient = Depends(get_client)):
        response = await client.workspace.chat("lesson-plans", "Generate a lesson plan.")
        return {"content": response.textResponse}

Or use directly (e.g. in background tasks):

    from anythingllm import build_client

    async def my_task():
        async with build_client() as client:
            result = await client.document.upload_file(pdf_bytes, "exam.pdf")
"""

from __future__ import annotations

import os
from functools import lru_cache

from .client import AnythingLLMClient
from .exceptions import AnythingLLMAuthError, AnythingLLMError, AnythingLLMNotFoundError, AnythingLLMRequestError
from .schemas import (
    ChatHistoryItem,
    ChatHistoryResponse,
    ChatMode,
    ChatResponse,
    ChatSource,
    DocumentRawTextResponse,
    DocumentUploadResponse,
    UploadedDocument,
    VectorSearchResponse,
    VectorSearchResult,
    WorkspaceInfo,
)

__all__ = [
    # client
    "AnythingLLMClient",
    "get_client",
    "build_client",
    # exceptions
    "AnythingLLMError",
    "AnythingLLMAuthError",
    "AnythingLLMNotFoundError",
    "AnythingLLMRequestError",
    # schemas
    "ChatMode",
    "ChatResponse",
    "ChatSource",
    "ChatHistoryItem",
    "ChatHistoryResponse",
    "VectorSearchResult",
    "VectorSearchResponse",
    "WorkspaceInfo",
    "UploadedDocument",
    "DocumentUploadResponse",
    "DocumentRawTextResponse",
    # misc
    "get_client",
    "build_client",
]


def _base_url() -> str:
    return os.getenv("ANYTHINGLLM_BASE_URL", "http://noteai-anythingllm:3001/api")


def _api_key() -> str:
    key = os.getenv("ANYTHINGLLM_API_KEY", "")
    if not key:
        raise RuntimeError(
            "ANYTHINGLLM_API_KEY environment variable is not set. "
            "Generate one in the AnythingLLM UI under Settings → API Keys."
        )
    return key


@lru_cache(maxsize=1)
def get_client() -> AnythingLLMClient:
    """
    Return a cached singleton AnythingLLMClient.

    Suitable for use as a FastAPI dependency:

        async def endpoint(client: AnythingLLMClient = Depends(get_client)):
            ...

    The client is created once and reused for the lifetime of the process.
    Call get_client.cache_clear() in tests to reset it.
    """
    return AnythingLLMClient(base_url=_base_url(), api_key=_api_key())


def build_client(
    base_url: str | None = None,
    api_key: str | None = None,
) -> AnythingLLMClient:
    """
    Build a fresh (non-cached) AnythingLLMClient, useful for tests or
    one-off async context-manager usage.

        async with build_client() as client:
            result = await client.workspace.chat("slug", "hello")
    """
    return AnythingLLMClient(
        base_url=base_url or _base_url(),
        api_key=api_key or _api_key(),
    )

