"""
Document operations:
  - upload_file      → upload PDF / Word / etc. for conversion and embedding
  - upload_raw_text  → persist plain text or pre-converted markdown as a document
  - upload_link      → scrape and ingest a URL
  - list             → list all uploaded documents
  - delete           → remove documents from storage
"""

from __future__ import annotations

from typing import Any

import httpx

from .exceptions import AnythingLLMAuthError, AnythingLLMNotFoundError, AnythingLLMRequestError
from .schemas import DocumentRawTextResponse, DocumentUploadResponse, UploadedDocument


class DocumentAPI:
    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    async def upload_file(
        self,
        file_bytes: bytes,
        filename: str,
        *,
        folder: str | None = None,
        add_to_workspaces: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> DocumentUploadResponse:
        """
        Upload a binary file (PDF, DOCX, etc.) to AnythingLLM for processing.

        AnythingLLM converts the file to text internally and stores it as a
        retrievable document. Use workspace.add_documents() afterwards to
        embed it into a specific workspace.

        Args:
            file_bytes:          Raw file content.
            filename:            Original filename including extension (e.g. "exam.pdf").
            folder:              Optional folder name to organise uploads.
            add_to_workspaces:   Workspace slugs to immediately embed into after upload.
            metadata:            Extra key/value metadata attached to the document.

        Returns:
            DocumentUploadResponse with `documents[].location` (needed for embedding).

        Usage (Req 2 — 文件格式檢查):
            result = await client.document.upload_file(pdf_bytes, "circular.pdf")
            doc_path = result.documents[0].location
            await client.workspace.add_documents("doc-checker", [doc_path])
        """
        path = f"/v1/document/upload/{folder}" if folder else "/v1/document/upload"
        files = {"file": (filename, file_bytes)}
        data: dict[str, Any] = {}
        if add_to_workspaces:
            data["addToWorkspaces"] = add_to_workspaces
        if metadata:
            import json
            data["metadata"] = json.dumps(metadata)

        resp = await self._http.post(path, files=files, data=data)
        _raise_for_status(resp)
        return DocumentUploadResponse.model_validate(resp.json())

    async def upload_raw_text(
        self,
        text: str,
        *,
        title: str | None = None,
        description: str | None = None,
        author: str | None = None,
        source: str | None = None,
        add_to_workspaces: list[str] | None = None,
    ) -> DocumentRawTextResponse:
        """
        Save a plain-text or markdown string directly as an AnythingLLM document.

        Useful for storing AI-converted markdown from uploaded files, or for
        persisting lesson plan content so it becomes searchable.

        Args:
            text:              The full text / markdown content.
            title:             Human-readable document title.
            description:       Short description stored as metadata.
            author:            Author metadata field.
            source:            Source metadata field (e.g. original filename).
            add_to_workspaces: Workspace slugs to immediately embed into after creation.

        Returns:
            DocumentRawTextResponse with `documents[].location`.

        Usage (Req 1 — 教案製作 / persist lesson plan content):
            result = await client.document.upload_raw_text(
                lesson_plan.content,
                title=lesson_plan.title,
                source="lesson_plan",
                add_to_workspaces=["lesson-plans"],
            )
        """
        metadata: dict[str, Any] = {}
        if title:
            metadata["title"] = title
        if description:
            metadata["description"] = description
        if author:
            metadata["docAuthor"] = author
        if source:
            metadata["docSource"] = source

        payload: dict[str, Any] = {"textContent": text, "metadata": metadata}
        if add_to_workspaces:
            payload["addToWorkspaces"] = add_to_workspaces

        resp = await self._http.post("/v1/document/raw-text", json=payload)
        _raise_for_status(resp)
        return DocumentRawTextResponse.model_validate(resp.json())

    async def upload_link(
        self,
        url: str,
        *,
        add_to_workspaces: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> DocumentUploadResponse:
        """
        Scrape a URL and store its content as an AnythingLLM document.

        Args:
            url:               The URL to scrape.
            add_to_workspaces: Workspace slugs to immediately embed into after scraping.
            metadata:          Extra metadata key/value pairs.

        Returns:
            DocumentUploadResponse.
        """
        payload: dict[str, Any] = {"link": url}
        if add_to_workspaces:
            payload["addToWorkspaces"] = add_to_workspaces
        if metadata:
            payload["metadata"] = metadata

        resp = await self._http.post("/v1/document/upload-link", json=payload)
        _raise_for_status(resp)
        return DocumentUploadResponse.model_validate(resp.json())

    async def list(self) -> list[UploadedDocument]:
        """
        List all documents currently stored in AnythingLLM.

        Returns a flat list of UploadedDocument objects from the nested
        localFiles tree.
        """
        resp = await self._http.get("/v1/documents")
        _raise_for_status(resp)
        return _flatten_local_files(resp.json().get("localFiles", {}))

    async def delete(self, *doc_names: str) -> None:
        """
        Permanently remove documents from AnythingLLM storage.

        Args:
            doc_names: One or more document names / location paths to delete.
        """
        resp = await self._http.delete(
            "/v1/system/remove-documents", json={"names": list(doc_names)}
        )
        _raise_for_status(resp)

    async def create_folder(self, name: str) -> None:
        """Create a named folder to organise uploaded documents."""
        resp = await self._http.post("/v1/document/create-folder", json={"name": name})
        _raise_for_status(resp)

    async def move_files(self, moves: list[tuple[str, str]]) -> None:
        """
        Move documents between folders.

        Args:
            moves: List of (from_path, to_path) tuples.
        """
        payload = {"files": [{"from": f, "to": t} for f, t in moves]}
        resp = await self._http.post("/v1/document/move-files", json=payload)
        _raise_for_status(resp)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _flatten_local_files(node: dict[str, Any]) -> list[UploadedDocument]:
    """Recursively flatten the nested localFiles tree into a flat list."""
    docs: list[UploadedDocument] = []
    for item in node.get("items", []):
        if item.get("type") == "file":
            docs.append(UploadedDocument.model_validate(item))
        else:
            docs.extend(_flatten_local_files(item))
    return docs


def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code == 403:
        raise AnythingLLMAuthError("Invalid or missing AnythingLLM API key.", status_code=403)
    if response.status_code == 404:
        raise AnythingLLMNotFoundError("Document or resource not found.", status_code=404)
    if response.status_code >= 400:
        raise AnythingLLMRequestError(
            f"AnythingLLM API error {response.status_code}: {response.text}",
            status_code=response.status_code,
        )
