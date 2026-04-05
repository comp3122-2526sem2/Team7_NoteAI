import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from models.lesson_plan import LessonPlanStatus
from models.lesson_plan_template import LessonPlanTemplateType


class LessonPlanCreate(BaseModel):
    title: str
    config: Optional[dict[str, Any]] = None
    template_id: Optional[uuid.UUID] = None


class LessonPlanUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    css_style: Optional[str] = None
    status: Optional[LessonPlanStatus] = None
    #: When True, persist fields but do not append a history snapshot (for debounced settings sync).
    skip_version: Optional[bool] = None


class LessonPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chapter_id: uuid.UUID
    course_id: uuid.UUID
    title: str
    content: str
    config: Optional[dict[str, Any]]
    css_style: Optional[str]
    status: LessonPlanStatus
    created_by: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime


class LessonPlanVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lesson_plan_id: uuid.UUID
    version_number: int
    saved_by: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime


class LessonPlanVersionDetailOut(LessonPlanVersionOut):
    snapshot_content: str
    snapshot_config: Optional[dict[str, Any]]


LessonPlanOutputLanguage = Literal["zh", "en"]
LessonPlanStylePreset = Literal[
    "balanced",
    "activity_heavy",
    "lecture_focus",
    "exam_prep",
    "public_lesson",
]


class AiGenerateRequest(BaseModel):
    instruction: Optional[str] = None
    output_language: LessonPlanOutputLanguage = "zh"
    style_preset: LessonPlanStylePreset = "balanced"
    #: If omitted, include all completed chapter documents. Empty list means no primary file text.
    document_ids: Optional[list[uuid.UUID]] = None
    focus_keywords: Optional[list[str]] = Field(default=None, description="Subsection phrases selected in the UI.")


class AiRegenerateSectionRequest(BaseModel):
    original_section: str
    instruction: str
    context_config: Optional[dict[str, Any]] = None
    output_language: LessonPlanOutputLanguage = "zh"
    style_preset: LessonPlanStylePreset = "balanced"


class AiRegenerateSectionOut(BaseModel):
    content: str


class LessonPlanTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    content: str
    default_config: Optional[dict[str, Any]] = None
    template_type: LessonPlanTemplateType = LessonPlanTemplateType.teacher
    school_id: Optional[str] = None


class LessonPlanTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    default_config: Optional[dict[str, Any]] = None
    template_type: Optional[LessonPlanTemplateType] = None
    school_id: Optional[str] = None
    is_active: Optional[bool] = None


class LessonPlanTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: Optional[str]
    content: str
    default_config: Optional[dict[str, Any]]
    template_type: LessonPlanTemplateType
    school_id: Optional[str]
    created_by: Optional[uuid.UUID]
    is_active: bool
    created_at: datetime
    updated_at: datetime
