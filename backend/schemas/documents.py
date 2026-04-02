import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from models.document import ConversionStatus, DocumentType


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    uploaded_by: uuid.UUID | None
    course_id: uuid.UUID | None
    chapter_id: uuid.UUID | None
    document_type: DocumentType
    original_filename: str
    original_file_type: str
    converted_markdown: str | None
    css_style: str | None
    ai_format_feedback: str | None
    conversion_status: ConversionStatus
    created_at: datetime
    updated_at: datetime


class DocumentUpdate(BaseModel):
    document_type: DocumentType | None = None
    course_id: uuid.UUID | None = None


class AICheckRequest(BaseModel):
    workspace_slug: str = "doc-checker"
    extra_instructions: str | None = None
