import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from models.progress import MasteryLevel


class TopicProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    student_id: uuid.UUID
    course_id: uuid.UUID
    topic: str
    mastery_level: MasteryLevel
    last_assessed_at: datetime | None
    updated_at: datetime


class TopicProgressUpdate(BaseModel):
    mastery_level: MasteryLevel


class AIRecommendationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    student_id: uuid.UUID
    course_id: uuid.UUID
    based_on_assignment_id: uuid.UUID | None
    recommendation: str
    created_at: datetime


class GenerateRecommendationRequest(BaseModel):
    based_on_assignment_id: uuid.UUID | None = None
    workspace_slug: str = "student-progress"
