from pydantic import BaseModel, Field
from models.user import UserRole


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=100)
    nickname: str = Field(min_length=1, max_length=100)
    role: UserRole
    # Required when role == student
    student_id: str | None = None
    # Required when role == teacher
    teacher_id: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
