import uuid
from typing import TYPE_CHECKING
from sqlalchemy import ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from .course import Course

# ── Default prompt templates ───────────────────────────────────────────────────
# Available variables are shown in the docstrings; use Python str.format() syntax.

DEFAULT_CHAPTER_PERFORMANCE_PROMPT = (
    "Chapter: {chapter_title}\n"
    "Description: {chapter_description}\n\n"
    "Based on the chapter content and {student_name}'s progress, provide a personalised, "
    "encouraging AI study comment. Summarise key learning points, highlight any areas "
    "that may need extra attention, and suggest next steps. "
    "Keep it concise and formatted in markdown."
)

DEFAULT_ASSIGNMENT_FEEDBACK_PROMPT = (
    "Assignment: {assignment_name}\n"
    "Topic: {topic}\n"
    "Max score: {max_score}\n"
    "Student score: {student_score}\n\n"
    "{qa_content}"
    "Please provide constructive feedback for {student_name} on this assignment. "
    "For each question, comment on correctness and suggest improvements. "
    "Format your response in markdown."
)


class ChapterPerformancePrompt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Custom prompt template for generating per-student chapter AI study comments.

    Available template variables:
        {chapter_title}       – chapter title
        {chapter_description} – chapter description (or "N/A")
        {student_name}        – student's nickname
    """
    __tablename__ = "chapter_performance_prompt"
    __table_args__ = (UniqueConstraint("course_id"),)

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course.id", ondelete="CASCADE"),
        nullable=False,
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)

    course: Mapped["Course"] = relationship(back_populates="chapter_performance_prompt")


class AssignmentFeedbackPrompt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Custom prompt template for generating AI feedback on student assignment submissions.

    Available template variables:
        {assignment_name} – assignment name
        {topic}           – topic (or "N/A")
        {max_score}       – maximum score (or "N/A")
        {student_score}   – student's score (or "not graded yet")
        {student_name}    – student's nickname
        {qa_content}      – formatted question-and-answer block (or empty string)
    """
    __tablename__ = "assignment_feedback_prompt"
    __table_args__ = (UniqueConstraint("course_id"),)

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course.id", ondelete="CASCADE"),
        nullable=False,
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)

    course: Mapped["Course"] = relationship(back_populates="assignment_feedback_prompt")
