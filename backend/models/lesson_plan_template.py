import enum
import uuid
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Boolean, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from .user import User


class LessonPlanTemplateType(str, enum.Enum):
    system = "system"
    school = "school"
    teacher = "teacher"


class LessonPlanTemplate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "lesson_plan_template"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    default_config: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    template_type: Mapped[LessonPlanTemplateType] = mapped_column(
        Enum(LessonPlanTemplateType), nullable=False
    )
    school_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    creator: Mapped[Optional["User"]] = relationship()
