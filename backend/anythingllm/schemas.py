"""
Pydantic models for AnythingLLM API request payloads and response shapes.
Only the fields this project actually uses are modelled; extra fields are
ignored by default (model_config extra="ignore").
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict


# ── Shared ────────────────────────────────────────────────────────────────────

class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


# ── Workspace chat ─────────────────────────────────────────────────────────────

class ChatMode(str, Enum):
    chat = "chat"       # conversational – uses history
    query = "query"     # single-turn RAG lookup
    automatic = "automatic"


class ChatSource(_Base):
    id: str | None = None
    text: str | None = None
    title: str | None = None
    url: str | None = None
    score: float | None = None


class ChatResponse(_Base):
    id: str | None = None
    type: str | None = None
    textResponse: str
    sources: list[ChatSource] = []
    close: bool = False
    error: str | None = None


class ChatHistoryItem(_Base):
    role: str           # "user" | "assistant"
    content: str
    sentAt: int | None = None
    sources: list[ChatSource] = []


class ChatHistoryResponse(_Base):
    history: list[ChatHistoryItem] = []


# ── Vector search ──────────────────────────────────────────────────────────────

class VectorSearchResult(_Base):
    id: str | None = None
    text: str
    metadata: dict[str, Any] = {}
    score: float | None = None
    distance: float | None = None


class VectorSearchResponse(_Base):
    results: list[VectorSearchResult] = []


# ── Workspace ──────────────────────────────────────────────────────────────────

class WorkspaceInfo(_Base):
    id: int | None = None
    name: str
    slug: str
    chatMode: str | None = None
    openAiTemp: float | None = None
    openAiHistory: int | None = None
    openAiPrompt: str | None = None
    topN: int | None = None


# ── Documents ─────────────────────────────────────────────────────────────────

class UploadedDocument(_Base):
    id: str | None = None
    location: str
    title: str | None = None
    docAuthor: str | None = None
    description: str | None = None
    docSource: str | None = None
    chunkSource: str | None = None
    published: str | None = None
    wordCount: int | None = None
    token_count_estimate: int | None = None


class DocumentUploadResponse(_Base):
    success: bool
    error: str | None = None
    documents: list[UploadedDocument] = []


class DocumentRawTextResponse(_Base):
    success: bool
    error: str | None = None
    documents: list[UploadedDocument] = []
