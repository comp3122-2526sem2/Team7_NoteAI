"""
Main AnythingLLM client.

Initialise once and reuse throughout the application lifetime.
All network I/O is async via httpx.AsyncClient.

    from anythingllm import get_client

    client = get_client()
    response = await client.workspace.chat("my-workspace", "Hello!")
    print(response.textResponse)
"""

from __future__ import annotations

import httpx

from .admin import AdminAPI
from .document import DocumentAPI
from .workspace import WorkspaceAPI


class AnythingLLMClient:
    """
    Async client for the AnythingLLM API.

    Sub-clients:
        .admin      – user provisioning (multi-user mode only)
        .workspace  – chat, threads, vector_search, workspace CRUD
        .document   – upload_file, upload_raw_text, upload_link, list, delete
    """

    def __init__(self, base_url: str, api_key: str, timeout: float = 60.0) -> None:
        self._http = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )
        self.admin = AdminAPI(self._http)
        self.workspace = WorkspaceAPI(self._http)
        self.document = DocumentAPI(self._http)

    async def verify_auth(self) -> bool:
        """Return True if the configured API key is valid."""
        resp = await self._http.get("/v1/auth")
        return resp.status_code == 200

    async def close(self) -> None:
        """Close the underlying HTTP connection pool."""
        await self._http.aclose()

    async def __aenter__(self) -> "AnythingLLMClient":
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()
