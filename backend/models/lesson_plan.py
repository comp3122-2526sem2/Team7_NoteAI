import enum
import uuid
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from .chapter import Chapter
    from .course import Course
    from .user import User


class LessonPlanStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class LessonPlan(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "lesson_plan"
    __table_args__ = (UniqueConstraint("chapter_id"),)

    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chapter.id", ondelete="CASCADE"),
        nullable=False,
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    config: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    css_style: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[LessonPlanStatus] = mapped_column(
        Enum(LessonPlanStatus), default=LessonPlanStatus.draft, nullable=False
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True,
    )

    chapter: Mapped["Chapter"] = relationship()
    course: Mapped["Course"] = relationship()
    creator: Mapped[Optional["User"]] = relationship()
    versions: Mapped[list["LessonPlanVersion"]] = relationship(
        back_populates="lesson_plan", cascade="all, delete-orphan", order_by="LessonPlanVersion.version_number"
    )


class LessonPlanVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "lesson_plan_version"

    lesson_plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lesson_plan.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_content: Mapped[str] = mapped_column(Text, nullable=False)
    snapshot_config: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    saved_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True,
    )

    lesson_plan: Mapped["LessonPlan"] = relationship(back_populates="versions")
    saver: Mapped[Optional["User"]] = relationship()
