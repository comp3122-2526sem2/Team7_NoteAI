"""
OpenAI Chat Completions helper for inline file attachments.

Mirrors the base64 file-attachment wire format used by courses._call_llm_with_file,
extracted here so document_keywords and other modules can share it without
importing from routers.

courses.py and openai_client/__init__.py are NOT touched.
"""

from __future__ import annotations

import base64
from typing import Any

from openai_client import get_client, get_model

__all__ = ["chat_complete_with_file_bytes"]


async def chat_complete_with_file_bytes(
    file_bytes: bytes,
    content_type: str,
    filename: str,
    prompt: str,
    *,
    system: str = "Reply with valid JSON only: a JSON array of strings.",
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> str:
    """
    Send *file_bytes* as a base64 inline file attachment to Chat Completions.

    Wire format is identical to courses._call_llm_with_file — no chunking,
    no summarisation: the model reads the full document in a single request.

    Args:
        file_bytes:   Raw bytes of the file (PDF, DOCX, TXT, …).
        content_type: MIME type, e.g. "application/pdf".
        filename:     Original filename (used by the API for format detection).
        prompt:       User-turn text that accompanies the file.
        system:       System message.
        temperature:  Sampling temperature (default 0.2 for structured output).
        max_tokens:   Optional output token cap.

    Returns:
        The assistant reply as a plain string.
    """
    client = get_client()

    b64 = base64.b64encode(file_bytes).decode("utf-8")
    user_content: list[Any] = [
        {
            "type": "file",
            "file": {
                "filename": filename,
                "file_data": f"data:{content_type};base64,{b64}",
            },
        },
        {"type": "text", "text": prompt},
    ]

    kwargs: dict[str, Any] = {
        "model": get_model(),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
    }
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens

    resp = await client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content or ""
