import uuid
from typing import Optional
from pydantic import BaseModel


class PromptOut(BaseModel):
    id: Optional[uuid.UUID] = None
    prompt: str
    is_default: bool = False


class PromptUpdate(BaseModel):
    prompt: str
