import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from models.assignment import AssignmentType, SubmissionStatus


class AssignmentCreate(BaseModel):
    name: str
    description: str | None = None
    assignment_type: AssignmentType
    topic: str | None = None
    due_date: datetime | None = None
    max_score: float | None = None
    chapter_id: uuid.UUID | None = None


class AssignmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    assignment_type: AssignmentType | None = None
    topic: str | None = None
    due_date: datetime | None = None
    max_score: float | None = None
    chapter_id: uuid.UUID | None = None


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    chapter_id: uuid.UUID | None
    name: str
    description: str | None
    assignment_type: AssignmentType
    topic: str | None
    due_date: datetime | None
    max_score: float | None
    created_at: datetime
    updated_at: datetime


class SubmissionCreate(BaseModel):
    student_feedback: str | None = None


class SubmissionGrade(BaseModel):
    score: float | None = None
    teacher_feedback: str | None = None


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    assignment_id: uuid.UUID
    student_id: uuid.UUID
    submission_date: datetime | None
    submission_status: SubmissionStatus
    score: float | None
    ai_feedback: str | None
    student_feedback: str | None
    teacher_feedback: str | None
    created_at: datetime
    updated_at: datetime
