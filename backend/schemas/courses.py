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


class SyllabusUploadOut(BaseModel):
    """
    Returned immediately after a syllabus file is accepted.
    AI generation runs in the background; poll the document's
    conversion_status to know when it is complete or failed.
    """
    course_id: uuid.UUID
    document_id: uuid.UUID
    status: str = "pending"


class EnrollStudentRequest(BaseModel):
    student_id: str


class AssignTeacherRequest(BaseModel):
    teacher_id: str
