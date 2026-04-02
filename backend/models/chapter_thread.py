import uuid
from typing import TYPE_CHECKING
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from .user import User
    from .chapter import Chapter


class ChapterThread(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Maps a user's AnythingLLM workspace thread to a chapter.
    Each user can have multiple named threads per chapter workspace.
    """
    __tablename__ = "chapter_thread"

    chapter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chapter.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
    )
    thread_slug: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    chapter: Mapped["Chapter"] = relationship(back_populates="threads")
    user: Mapped["User"] = relationship(back_populates="chapter_threads")
