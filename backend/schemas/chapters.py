import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class ChapterCreate(BaseModel):
    title: str
    description: Optional[str] = None
    order: int = 0


class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = None


class ChapterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    description: Optional[str]
    order: int
    workspace_slug: Optional[str]
    created_at: datetime
    updated_at: datetime


class ChapterAICommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chapter_id: uuid.UUID
    student_id: uuid.UUID
    comment: str
    created_at: datetime
    updated_at: datetime


class ChapterSubmissionSummary(BaseModel):
    assignment_id: uuid.UUID
    assignment_name: str
    status: str
    score: Optional[float] = None
    max_score: Optional[float] = None


class ChapterStudentPerformance(BaseModel):
    student_id: uuid.UUID
    student_name: str
    has_ai_comment: bool
    ai_comment: Optional[str] = None
    ai_comment_updated_at: Optional[datetime] = None
    submissions: list[ChapterSubmissionSummary] = []
