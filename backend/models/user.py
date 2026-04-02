import uuid
import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from .course import CourseStudent, CourseTeacher
    from .assignment import AssignmentSubmission
    from .chapter import ChapterAIComment
    from .chapter_thread import ChapterThread
    from .document import Document
    from .progress import StudentTopicProgress, StudentAIRecommendation


class UserRole(str, enum.Enum):
    student = "student"
    teacher = "teacher"
    admin = "admin"


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user"

    nickname: Mapped[str] = mapped_column(String(100), nullable=False)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    anythingllm_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    student_profile: Mapped[Optional["StudentUser"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    teacher_profile: Mapped[Optional["TeacherUser"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    chapter_threads: Mapped[list["ChapterThread"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class StudentUser(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "student_user"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="CASCADE"),
        primary_key=True,
    )
    student_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    user: Mapped["User"] = relationship(back_populates="student_profile")
    course_enrollments: Mapped[list["CourseStudent"]] = relationship(
        back_populates="student"
    )
    submissions: Mapped[list["AssignmentSubmission"]] = relationship(
        back_populates="student"
    )
    topic_progress: Mapped[list["StudentTopicProgress"]] = relationship(
        back_populates="student"
    )
    ai_recommendations: Mapped[list["StudentAIRecommendation"]] = relationship(
        back_populates="student"
    )
    chapter_ai_comments: Mapped[list["ChapterAIComment"]] = relationship(
        back_populates="student"
    )


class TeacherUser(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "teacher_user"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="CASCADE"),
        primary_key=True,
    )
    teacher_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    user: Mapped["User"] = relationship(back_populates="teacher_profile")
    course_assignments: Mapped[list["CourseTeacher"]] = relationship(
        back_populates="teacher"
    )
    documents: Mapped[list["Document"]] = relationship(back_populates="uploader")
