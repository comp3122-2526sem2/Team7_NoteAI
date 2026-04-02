"""
Workspace-scoped operations:
  - chat / stream_chat          → AI generation, feedback, recommendations
  - get_chat_history            → retrieve past messages for a session
  - vector_search               → semantic similarity search over workspace docs
  - create / get / delete       → workspace lifecycle management
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from .exceptions import AnythingLLMAuthError, AnythingLLMNotFoundError, AnythingLLMRequestError
from .schemas import (
    ChatHistoryResponse,
    ChatMode,
    ChatResponse,
    ChatSource,
    ThreadInfo,
    VectorSearchResponse,
    WorkspaceInfo,
)


class WorkspaceAPI:
    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    # ── Chat ──────────────────────────────────────────────────────────────────

    async def chat(
        self,
        slug: str,
        message: str,
        *,
        mode: ChatMode = ChatMode.chat,
        session_id: str | None = None,
        attachments: list[dict[str, str]] | None = None,
        reset: bool = False,
    ) -> ChatResponse:
        """
        Send a message to a workspace and receive a complete response.

        Args:
            slug:        Workspace slug identifier.
            message:     User message text.
            mode:        ChatMode.chat (conversational) | ChatMode.query (RAG) | ChatMode.automatic.
            session_id:  Optional session ID to continue a conversation.
            attachments: Optional list of {"name", "mime", "contentString"} dicts.
            reset:       If True, clears chat history for the session before sending.

        Returns:
            ChatResponse with textResponse and sources.

        Usage (教案製作 / AI gen):
            response = await client.workspace.chat("lesson-plans", prompt, mode=ChatMode.chat)
            ai_content = response.textResponse

        Usage (學生進度 / recommendation):
            response = await client.workspace.chat(
                "student-progress",
                f"Student scored {score}/100 on topic '{topic}'. Suggest teaching strategies.",
            )
        """
        payload: dict[str, Any] = {"message": message, "mode": mode.value, "reset": reset}
        if session_id:
            payload["sessionId"] = session_id
        if attachments:
            payload["attachments"] = attachments

        resp = await self._http.post(f"/v1/workspace/{slug}/chat", json=payload)
        _raise_for_status(resp)
        return ChatResponse.model_validate(resp.json())

    async def stream_chat(
        self,
        slug: str,
        message: str,
        *,
        mode: ChatMode = ChatMode.chat,
        session_id: str | None = None,
        attachments: list[dict[str, str]] | None = None,
        reset: bool = False,
    ) -> AsyncIterator[ChatResponse]:
        """
        Send a message and stream the response token by token as an SSE stream.

        Yields ChatResponse chunks; the final chunk has close=True.

        Usage (live editor AI gen with streaming):
            async for chunk in client.workspace.stream_chat("lesson-plans", prompt):
                yield chunk.textResponse   # forward to frontend via SSE
                if chunk.close:
                    break
        """
        payload: dict[str, Any] = {"message": message, "mode": mode.value, "reset": reset}
        if session_id:
            payload["sessionId"] = session_id
        if attachments:
            payload["attachments"] = attachments

        async with self._http.stream(
            "POST", f"/v1/workspace/{slug}/stream-chat", json=payload
        ) as response:
            _raise_for_status(response)
            async for line in response.aiter_lines():
                line = line.strip()
                if not line or not line.startswith("data:"):
                    continue
                raw = line[len("data:"):].strip()
                if raw == "[DONE]":
                    break
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                err = data.get("error")
                chunk = ChatResponse(
                    id=data.get("id"),
                    type=data.get("type"),
                    textResponse=data.get("textResponse") or "",
                    sources=[ChatSource(**s) for s in data.get("sources", [])],
                    close=data.get("close", False),
                    error=str(err) if err and err is not True else None,
                )
                yield chunk
                if chunk.close:
                    break

    async def get_chat_history(
        self,
        slug: str,
        *,
        session_id: str | None = None,
        limit: int | None = None,
    ) -> ChatHistoryResponse:
        """
        Fetch chat history for a workspace session.

        Args:
            slug:       Workspace slug.
            session_id: Filter by API session ID.
            limit:      Max number of messages to return.
        """
        params: dict[str, Any] = {}
        if session_id:
            params["apiSessionId"] = session_id
        if limit:
            params["limit"] = limit

        resp = await self._http.get(f"/v1/workspace/{slug}/chats", params=params)
        _raise_for_status(resp)
        return ChatHistoryResponse.model_validate(resp.json())

    # ── Vector search ─────────────────────────────────────────────────────────

    async def vector_search(
        self,
        slug: str,
        query: str,
        *,
        top_n: int = 5,
        score_threshold: float | None = None,
    ) -> VectorSearchResponse:
        """
        Run a semantic similarity search over documents embedded in a workspace.

        Args:
            slug:            Workspace slug.
            query:           Natural language search query.
            top_n:           Number of results to return.
            score_threshold: Minimum similarity score (0.0 – 1.0).

        Returns:
            VectorSearchResponse with ranked results.

        Usage (學生進度 / find relevant materials for a student):
            results = await client.workspace.vector_search(
                "course-materials", f"exercises for topic: {topic}", top_n=3
            )
        """
        payload: dict[str, Any] = {"query": query, "topN": top_n}
        if score_threshold is not None:
            payload["scoreThreshold"] = score_threshold

        resp = await self._http.post(f"/v1/workspace/{slug}/vector-search", json=payload)
        _raise_for_status(resp)
        return VectorSearchResponse.model_validate(resp.json())

    # ── Workspace lifecycle ────────────────────────────────────────────────────

    async def create(
        self,
        name: str,
        *,
        system_prompt: str | None = None,
        chat_mode: str = "chat",
        temperature: float = 0.7,
        history_count: int = 20,
        top_n: int = 4,
    ) -> WorkspaceInfo:
        """Create a new workspace and return its info."""
        payload: dict[str, Any] = {
            "name": name,
            "chatMode": chat_mode,
            "openAiTemp": temperature,
            "openAiHistory": history_count,
            "topN": top_n,
        }
        if system_prompt:
            payload["openAiPrompt"] = system_prompt

        resp = await self._http.post("/v1/workspace/new", json=payload)
        _raise_for_status(resp)
        data = resp.json()
        return WorkspaceInfo.model_validate(data.get("workspace", data))

    async def get(self, slug: str) -> WorkspaceInfo:
        """Fetch workspace metadata by slug."""
        resp = await self._http.get(f"/v1/workspace/{slug}")
        _raise_for_status(resp)
        data = resp.json()
        workspaces = data.get("workspace", [data])
        if isinstance(workspaces, list):
            return WorkspaceInfo.model_validate(workspaces[0])
        return WorkspaceInfo.model_validate(workspaces)

    async def list(self) -> list[WorkspaceInfo]:
        """List all workspaces."""
        resp = await self._http.get("/v1/workspaces")
        _raise_for_status(resp)
        return [WorkspaceInfo.model_validate(w) for w in resp.json().get("workspaces", [])]

    async def delete(self, slug: str) -> None:
        """Delete a workspace by slug."""
        resp = await self._http.delete(f"/v1/workspace/{slug}")
        _raise_for_status(resp)

    async def add_documents(self, slug: str, doc_paths: list[str]) -> None:
        """
        Embed documents into a workspace so they become searchable via vector_search/chat.

        Args:
            slug:      Workspace slug.
            doc_paths: List of document location paths returned from DocumentAPI.upload_*.
        """
        payload = {"adds": doc_paths, "deletes": []}
        resp = await self._http.post(f"/v1/workspace/{slug}/update-embeddings", json=payload)
        _raise_for_status(resp)

    async def remove_documents(self, slug: str, doc_paths: list[str]) -> None:
        """Remove documents from a workspace's vector index."""
        payload = {"adds": [], "deletes": doc_paths}
        resp = await self._http.post(f"/v1/workspace/{slug}/update-embeddings", json=payload)
        _raise_for_status(resp)

    # ── Threads ───────────────────────────────────────────────────────────────

    async def create_thread(
        self,
        slug: str,
        name: str,
        *,
        user_id: int | None = None,
        thread_slug: str | None = None,
    ) -> ThreadInfo:
        """Create a new thread inside a workspace."""
        payload: dict[str, Any] = {"name": name}
        if user_id is not None:
            payload["userId"] = user_id
        if thread_slug:
            payload["slug"] = thread_slug
        resp = await self._http.post(f"/v1/workspace/{slug}/thread/new", json=payload)
        _raise_for_status(resp)
        return ThreadInfo.model_validate(resp.json()["thread"])

    async def delete_thread(self, slug: str, thread_slug: str) -> None:
        """Delete a thread from a workspace."""
        resp = await self._http.delete(f"/v1/workspace/{slug}/thread/{thread_slug}")
        _raise_for_status(resp)

    async def get_thread_history(self, slug: str, thread_slug: str) -> ChatHistoryResponse:
        """Fetch the chat history for a specific thread."""
        resp = await self._http.get(f"/v1/workspace/{slug}/thread/{thread_slug}/chats")
        _raise_for_status(resp)
        return ChatHistoryResponse.model_validate(resp.json())

    async def stream_thread_chat(
        self,
        slug: str,
        thread_slug: str,
        message: str,
        *,
        mode: ChatMode = ChatMode.chat,
    ) -> AsyncIterator[ChatResponse]:
        """Stream chat within a specific workspace thread."""
        payload: dict[str, Any] = {"message": message, "mode": mode.value}
        async with self._http.stream(
            "POST",
            f"/v1/workspace/{slug}/thread/{thread_slug}/stream-chat",
            json=payload,
        ) as response:
            _raise_for_status(response)
            async for line in response.aiter_lines():
                line = line.strip()
                if not line or not line.startswith("data:"):
                    continue
                raw = line[len("data:"):].strip()
                if raw == "[DONE]":
                    break
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                err = data.get("error")
                chunk = ChatResponse(
                    id=data.get("id"),
                    type=data.get("type"),
                    textResponse=data.get("textResponse") or "",
                    sources=[ChatSource(**s) for s in data.get("sources", [])],
                    close=data.get("close", False),
                    error=str(err) if err and err is not True else None,
                )
                yield chunk
                if chunk.close:
                    break


# ── Helpers ───────────────────────────────────────────────────────────────────

def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code == 403:
        raise AnythingLLMAuthError("Invalid or missing AnythingLLM API key.", status_code=403)
    if response.status_code == 404:
        raise AnythingLLMNotFoundError("Workspace or resource not found.", status_code=404)
    if response.status_code >= 400:
        raise AnythingLLMRequestError(
            f"AnythingLLM API error {response.status_code}: {response.text}",
            status_code=response.status_code,
        )
