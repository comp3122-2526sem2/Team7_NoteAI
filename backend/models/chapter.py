import uuid
from typing import TYPE_CHECKING, Optional
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from .user import StudentUser
    from .course import Course
    from .assignment import Assignment
    from .document import Document
    from .chapter_thread import ChapterThread


class Chapter(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "chapter"

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    workspace_slug: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    course: Mapped["Course"] = relationship(back_populates="chapters")
    assignments: Mapped[list["Assignment"]] = relationship(
        back_populates="chapter", cascade="all, delete-orphan"
    )
    ai_comments: Mapped[list["ChapterAIComment"]] = relationship(
        back_populates="chapter", cascade="all, delete-orphan"
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="chapter", cascade="all, delete-orphan"
    )
    threads: Mapped[list["ChapterThread"]] = relationship(
        back_populates="chapter", cascade="all, delete-orphan"
    )


class ChapterAIComment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "chapter_ai_comment"

    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chapter.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("student_user.id", ondelete="CASCADE"),
        nullable=False,
    )
    comment: Mapped[str] = mapped_column(Text, nullable=False)

    chapter: Mapped["Chapter"] = relationship(back_populates="ai_comments")
    student: Mapped["StudentUser"] = relationship(back_populates="chapter_ai_comments")
