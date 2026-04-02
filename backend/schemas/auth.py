from pydantic import BaseModel
from models.user import UserRole


class RegisterRequest(BaseModel):
    username: str
    password: str
    nickname: str
    role: UserRole
    # Required when role == student
    student_id: str | None = None
    # Required when role == teacher
    teacher_id: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
