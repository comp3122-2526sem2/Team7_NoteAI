import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class PromptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    prompt: str
    created_at: datetime
    updated_at: datetime


class PromptUpdate(BaseModel):
    prompt: str
