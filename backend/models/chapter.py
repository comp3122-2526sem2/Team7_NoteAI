import uuid
from typing import TYPE_CHECKING, Optional
from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from .user import User, StudentUser
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
    # Teacher (parent) workspace slug – shared by all teachers on the course
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
    user_workspaces: Mapped[list["ChapterUserWorkspace"]] = relationship(
        back_populates="chapter", cascade="all, delete-orphan"
    )


class ChapterUserWorkspace(Base):
    """
    Tracks the personal AnythingLLM workspace for each student per chapter.
    Teachers share the chapter-level workspace (Chapter.workspace_slug).
    Students each get a private clone populated with the same documents.
    """
    __tablename__ = "chapter_user_workspace"
    __table_args__ = (UniqueConstraint("chapter_id", "user_id"),)

    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chapter.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    workspace_slug: Mapped[str] = mapped_column(String(255), nullable=False)

    chapter: Mapped["Chapter"] = relationship(back_populates="user_workspaces")
    user: Mapped["User"] = relationship()


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
