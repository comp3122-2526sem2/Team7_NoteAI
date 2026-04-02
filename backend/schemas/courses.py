import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class CourseCreate(BaseModel):
    name: str
    description: str | None = None
    syllabus: str | None = None


class CourseUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    syllabus: str | None = None


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    syllabus: str | None
    created_at: datetime
    updated_at: datetime


class EnrollStudentRequest(BaseModel):
    student_id: uuid.UUID


class AssignTeacherRequest(BaseModel):
    teacher_id: uuid.UUID
