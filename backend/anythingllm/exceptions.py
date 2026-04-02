class AnythingLLMError(Exception):
    """Base error for AnythingLLM client."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class AnythingLLMAuthError(AnythingLLMError):
    """Raised when the API key is invalid or missing (HTTP 403)."""


class AnythingLLMNotFoundError(AnythingLLMError):
    """Raised when the requested resource does not exist (HTTP 404)."""


class AnythingLLMRequestError(AnythingLLMError):
    """Raised for unexpected HTTP errors from the AnythingLLM API."""
