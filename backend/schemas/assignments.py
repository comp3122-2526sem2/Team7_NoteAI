import uuid
from datetime import datetime
from typing import Annotated, Any, Literal, Union
from pydantic import BaseModel, ConfigDict, Field
from models.assignment import AssignmentType, SubmissionStatus


# ── Question content types ─────────────────────────────────────────────────────

class MCQuestion(BaseModel):
    type: Literal["mc"] = "mc"
    question: str
    # Ordered list of option texts; labels (A, B, C…) are derived from position
    options: list[str] = Field(default_factory=list)
    correct_answer: str | None = None  # "A", "B", "C", … matching position label


class LongQuestion(BaseModel):
    type: Literal["long"] = "long"
    question: str
    suggested_answer: str | None = None  # visible to teachers only


# Sub-questions inside a passage can be MC or Long
PassageSubQuestion = Annotated[
    Union[MCQuestion, LongQuestion],
    Field(discriminator="type"),
]


class PassageSection(BaseModel):
    type: Literal["passage"] = "passage"
    passage: str
    questions: list[PassageSubQuestion] = Field(default_factory=list)


# Top-level sections in an assignment
Section = Annotated[
    Union[MCQuestion, LongQuestion, PassageSection],
    Field(discriminator="type"),
]


class AssignmentContent(BaseModel):
    sections: list[Section] = Field(default_factory=list)


# ── Assignment CRUD ────────────────────────────────────────────────────────────

class AssignmentCreate(BaseModel):
    name: str
    description: str | None = None
    assignment_type: AssignmentType
    topic: str | None = None
    due_date: datetime | None = None
    max_score: float | None = None
    chapter_id: uuid.UUID | None = None
    content: AssignmentContent | None = None


class AssignmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    assignment_type: AssignmentType | None = None
    topic: str | None = None
    due_date: datetime | None = None
    max_score: float | None = None
    chapter_id: uuid.UUID | None = None
    content: AssignmentContent | None = None


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
    content: Any | None  # raw JSON — frontend uses the typed structure
    created_at: datetime
    updated_at: datetime


# ── Submission ─────────────────────────────────────────────────────────────────

class SubmissionCreate(BaseModel):
    # Structured per-question answers: { "1": "A", "2": "long answer text", … }
    answers: dict[str, str] | None = None
    # Legacy free-text field kept for backward compatibility
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
    answers: Any | None
    ai_feedback: str | None
    student_feedback: str | None
    teacher_feedback: str | None
    created_at: datetime
    updated_at: datetime
