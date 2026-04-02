import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ThreadCreate(BaseModel):
    name: str


class ThreadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chapter_id: uuid.UUID
    user_id: uuid.UUID
    thread_slug: str
    name: str
    created_at: datetime
    updated_at: datetime
