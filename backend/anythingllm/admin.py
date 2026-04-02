"""
Admin operations (requires admin API key, only works in multi-user mode):
  - create_user  → provision a new AnythingLLM user
  - list_users   → list all users
  - delete_user  → remove a user by id
"""

from __future__ import annotations

from typing import Any

import httpx

from .exceptions import AnythingLLMAuthError, AnythingLLMNotFoundError, AnythingLLMRequestError
from .schemas import AnythingLLMUser


class AdminAPI:
    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    async def create_user(
        self,
        username: str,
        password: str,
        role: str = "default",
    ) -> AnythingLLMUser | None:
        """
        Create a user in AnythingLLM.
        Returns None gracefully if multi-user mode is not enabled.
        """
        payload: dict[str, Any] = {
            "username": username,
            "password": password,
            "role": role,
        }
        resp = await self._http.post("/v1/admin/users/new", json=payload)
        # 401 means multi-user mode is off — degrade gracefully
        if resp.status_code == 401:
            return None
        _raise_for_status(resp)
        data = resp.json()
        if data.get("user"):
            return AnythingLLMUser.model_validate(data["user"])
        return None

    async def list_users(self) -> list[AnythingLLMUser]:
        resp = await self._http.get("/v1/admin/users")
        if resp.status_code == 401:
            return []
        _raise_for_status(resp)
        return [AnythingLLMUser.model_validate(u) for u in resp.json().get("users", [])]

    async def delete_user(self, user_id: int) -> None:
        resp = await self._http.delete(f"/v1/admin/users/{user_id}")
        if resp.status_code == 401:
            return
        _raise_for_status(resp)


def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code == 403:
        raise AnythingLLMAuthError("Invalid or missing AnythingLLM API key.", status_code=403)
    if response.status_code == 404:
        raise AnythingLLMNotFoundError("Resource not found.", status_code=404)
    if response.status_code >= 400:
        raise AnythingLLMRequestError(
            f"AnythingLLM API error {response.status_code}: {response.text}",
            status_code=response.status_code,
        )
