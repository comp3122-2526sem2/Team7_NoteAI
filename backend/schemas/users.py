import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from models.user import UserRole


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nickname: str
    username: str
    role: UserRole
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseModel):
    nickname: str | None = None
    password: str | None = None
    is_active: bool | None = None
