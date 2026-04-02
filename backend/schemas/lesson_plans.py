import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from models.lesson_plan import LessonPlanStatus


class LessonPlanCreate(BaseModel):
    title: str
    content: str | None = None
    css_style: str | None = None


class LessonPlanUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    css_style: str | None = None
    status: LessonPlanStatus | None = None


class LessonPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    created_by: uuid.UUID | None
    title: str
    content: str | None
    css_style: str | None
    pdf_export_path: str | None
    status: LessonPlanStatus
    created_at: datetime
    updated_at: datetime


class TopicCreate(BaseModel):
    topic: str
    teaching_method: str | None = None
    teaching_content: str | None = None


class TopicUpdate(BaseModel):
    topic: str | None = None
    teaching_method: str | None = None
    teaching_content: str | None = None


class TopicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lesson_plan_id: uuid.UUID
    topic: str
    teaching_method: str | None
    teaching_content: str | None


class VersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lesson_plan_id: uuid.UUID
    saved_by: uuid.UUID | None
    snapshot_content: str
    created_at: datetime


class AIGenerateRequest(BaseModel):
    prompt: str
    mode: str = "chat"          # "chat" | "query"
    session_id: str | None = None
