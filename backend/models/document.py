import enum
import uuid
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from .user import TeacherUser
    from .course import Course
    from .chapter import Chapter


class DocumentType(str, enum.Enum):
    notice = "notice"
    exam = "exam"
    worksheet = "worksheet"
    other = "other"


class ConversionStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"


class Document(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "document"

    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teacher_user.id", ondelete="SET NULL"),
        nullable=True,
    )
    course_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course.id", ondelete="SET NULL"),
        nullable=True,
    )
    chapter_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chapter.id", ondelete="CASCADE"),
        nullable=True,
    )
    anythingllm_location: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    document_type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType), nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    original_file_type: Mapped[str] = mapped_column(String(20), nullable=False)
    original_file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    converted_markdown: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    css_style: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_format_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    conversion_status: Mapped[ConversionStatus] = mapped_column(
        Enum(ConversionStatus), default=ConversionStatus.pending, nullable=False
    )

    uploader: Mapped[Optional["TeacherUser"]] = relationship(back_populates="documents")
    course: Mapped[Optional["Course"]] = relationship(back_populates="documents")
    chapter: Mapped[Optional["Chapter"]] = relationship(back_populates="documents")
