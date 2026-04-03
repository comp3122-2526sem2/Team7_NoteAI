"""
OpenAI client package.

Provides a cached AsyncOpenAI singleton and lightweight helpers so the
rest of the application never has to deal with env-var reading or client
construction directly.

Usage — direct call
-------------------
    from openai_client import get_client, get_model

    client = get_client()
    resp = await client.chat.completions.create(
        model=get_model(),
        messages=[{"role": "user", "content": "Hello!"}],
    )
    print(resp.choices[0].message.content)

Usage — convenience helper
--------------------------
    from openai_client import chat_complete

    text = await chat_complete("Summarise this document in 3 bullet points.")

Supported environment variables
--------------------------------
    OPENAI_API_KEY        Required. Your OpenAI (or compatible) API key.
    OPENAI_BASE_URL       Optional. Override the default https://api.openai.com/v1
                          (useful for Azure OpenAI, local LM Studio, etc.).
    OPENAI_MODEL          Optional. Default model name (default: gpt-4o-mini).
    OPENAI_TIMEOUT        Optional. Request timeout in seconds (default: 60).
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from openai import AsyncOpenAI

__all__ = [
    "get_client",
    "get_model",
    "chat_complete",
]

_DEFAULT_MODEL = "gpt-4o-mini"
_DEFAULT_TIMEOUT = 60.0


def _api_key() -> str:
    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        raise RuntimeError(
            "OPENAI_API_KEY environment variable is not set. "
            "Add it to backend/.env or your deployment secrets."
        )
    return key


def get_model() -> str:
    """Return the configured default model name."""
    return os.getenv("OPENAI_MODEL", _DEFAULT_MODEL)


@lru_cache(maxsize=1)
def get_client() -> AsyncOpenAI:
    """
    Return a cached singleton AsyncOpenAI client.

    The client is created once and reused for the lifetime of the process.
    Call get_client.cache_clear() in tests to reset it.
    """
    kwargs: dict[str, Any] = {
        "api_key": _api_key(),
        "timeout": float(os.getenv("OPENAI_TIMEOUT", str(_DEFAULT_TIMEOUT))),
    }
    base_url = os.getenv("OPENAI_BASE_URL", "")
    if base_url:
        kwargs["base_url"] = base_url

    return AsyncOpenAI(**kwargs)


async def chat_complete(
    prompt: str,
    *,
    system: str = "You are a helpful educational assistant.",
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int | None = None,
) -> str:
    """
    Send a single-turn chat prompt and return the assistant's text response.

    Args:
        prompt:      User message content.
        system:      System message content.
        model:       Model override; uses OPENAI_MODEL env var if omitted.
        temperature: Sampling temperature.
        max_tokens:  Optional max output tokens.

    Returns:
        The assistant reply as a plain string.
    """
    client = get_client()
    kwargs: dict[str, Any] = {
        "model": model or get_model(),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
    }
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens

    resp = await client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content or ""
