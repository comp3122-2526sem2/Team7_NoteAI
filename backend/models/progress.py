import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from .base import Base, UUIDPrimaryKeyMixin, utcnow

if TYPE_CHECKING:
    from .user import StudentUser
    from .course import Course
    from .assignment import Assignment


class MasteryLevel(str, enum.Enum):
    weak = "weak"
    developing = "developing"
    proficient = "proficient"


class StudentTopicProgress(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "student_topic_progress"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("student_user.id", ondelete="CASCADE"),
        nullable=False,
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course.id", ondelete="CASCADE"),
        nullable=False,
    )
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    mastery_level: Mapped[MasteryLevel] = mapped_column(
        Enum(MasteryLevel), default=MasteryLevel.weak, nullable=False
    )
    last_assessed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    student: Mapped["StudentUser"] = relationship(back_populates="topic_progress")
    course: Mapped["Course"] = relationship(back_populates="student_topic_progress")


class StudentAIRecommendation(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "student_ai_recommendation"

    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("student_user.id", ondelete="CASCADE"),
        nullable=False,
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course.id", ondelete="CASCADE"),
        nullable=False,
    )
    based_on_assignment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("assignment.id", ondelete="SET NULL"),
        nullable=True,
    )
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    student: Mapped["StudentUser"] = relationship(back_populates="ai_recommendations")
    course: Mapped["Course"] = relationship(back_populates="student_ai_recommendations")
    based_on_assignment: Mapped[Optional["Assignment"]] = relationship()
