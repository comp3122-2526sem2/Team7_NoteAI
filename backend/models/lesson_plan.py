import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utcnow

if TYPE_CHECKING:
    from .user import TeacherUser
    from .course import Course


class LessonPlanStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class LessonPlan(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "lesson_plan"

    course_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teacher_user.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    css_style: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pdf_export_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    status: Mapped[LessonPlanStatus] = mapped_column(
        Enum(LessonPlanStatus), default=LessonPlanStatus.draft, nullable=False
    )

    course: Mapped["Course"] = relationship(back_populates="lesson_plans")
    created_by_teacher: Mapped[Optional["TeacherUser"]] = relationship(
        back_populates="lesson_plans", foreign_keys=[created_by]
    )
    topics: Mapped[list["LessonPlanTopic"]] = relationship(
        back_populates="lesson_plan", cascade="all, delete-orphan"
    )
    versions: Mapped[list["LessonPlanVersion"]] = relationship(
        back_populates="lesson_plan",
        cascade="all, delete-orphan",
        order_by="LessonPlanVersion.created_at",
    )


class LessonPlanTopic(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "lesson_plan_topic"

    lesson_plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lesson_plan.id", ondelete="CASCADE"),
        nullable=False,
    )
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    teaching_method: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    teaching_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    lesson_plan: Mapped["LessonPlan"] = relationship(back_populates="topics")


class LessonPlanVersion(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "lesson_plan_version"

    lesson_plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lesson_plan.id", ondelete="CASCADE"),
        nullable=False,
    )
    saved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teacher_user.id", ondelete="SET NULL"),
        nullable=True,
    )
    snapshot_content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, nullable=False)

    lesson_plan: Mapped["LessonPlan"] = relationship(back_populates="versions")
    saved_by_teacher: Mapped[Optional["TeacherUser"]] = relationship(
        back_populates="lesson_plan_versions", foreign_keys=[saved_by]
    )
