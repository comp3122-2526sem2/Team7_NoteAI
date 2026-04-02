import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from .user import StudentUser
    from .course import Course
    from .chapter import Chapter


class AssignmentType(str, enum.Enum):
    quiz = "quiz"
    homework = "homework"
    project = "project"
    exam = "exam"


class SubmissionStatus(str, enum.Enum):
    pending = "pending"
    submitted = "submitted"
    graded = "graded"


class Assignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "assignment"

    course_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course.id", ondelete="CASCADE"),
        nullable=False,
    )
    chapter_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chapter.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assignment_type: Mapped[AssignmentType] = mapped_column(
        Enum(AssignmentType), nullable=False
    )
    topic: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    due_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    max_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    course: Mapped["Course"] = relationship(back_populates="assignments")
    chapter: Mapped[Optional["Chapter"]] = relationship(back_populates="assignments")
    course_assignments: Mapped[list["CourseAssignment"]] = relationship(
        back_populates="assignment", cascade="all, delete-orphan"
    )
    submissions: Mapped[list["AssignmentSubmission"]] = relationship(
        back_populates="assignment", cascade="all, delete-orphan"
    )


class CourseAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "course_assignment"

    course_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course.id", ondelete="CASCADE"),
        nullable=False,
    )
    assignment_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignment.id", ondelete="CASCADE"),
        nullable=False,
    )

    course: Mapped["Course"] = relationship(back_populates="course_assignments")
    assignment: Mapped["Assignment"] = relationship(back_populates="course_assignments")


class AssignmentSubmission(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "assignment_submission"

    assignment_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignment.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("student_user.id", ondelete="CASCADE"),
        nullable=False,
    )
    submission_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    submission_status: Mapped[SubmissionStatus] = mapped_column(
        Enum(SubmissionStatus), default=SubmissionStatus.pending, nullable=False
    )
    ai_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    student_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    teacher_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    assignment: Mapped["Assignment"] = relationship(back_populates="submissions")
    student: Mapped["StudentUser"] = relationship(back_populates="submissions")
