"""
Global AI prompt configuration tables.

Each table holds at most one row (a singleton).  There is no per-course or
per-chapter scoping — the prompts apply system-wide.

Use Python str.format() syntax for template variables documented on each class.
"""

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin

# ── Default prompt templates ───────────────────────────────────────────────────

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

DEFAULT_SYLLABUS_GENERATION_PROMPT = (
    "Course: {course_name}\n"
    "Description: {course_description}\n\n"
    "The following content was extracted from an uploaded file:\n"
    "---\n"
    "{file_content}\n"
    "---\n\n"
    "Using the file content above as the source material, generate a comprehensive, "
    "well-structured course syllabus in markdown format. Include: an overview, "
    "learning objectives, weekly/chapter breakdown with topics, recommended readings "
    "or resources (if inferable), and assessment methods."
)


# ── Singleton prompt models ────────────────────────────────────────────────────

class ChapterPerformancePrompt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Global prompt template for generating per-student chapter AI study comments.
    Only one row exists in this table at a time.

    Template variables:
        {chapter_title}       – chapter title
        {chapter_description} – chapter description (or "N/A")
        {student_name}        – student's nickname
    """
    __tablename__ = "chapter_performance_prompt"

    prompt: Mapped[str] = mapped_column(Text, nullable=False)


class AssignmentFeedbackPrompt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Global prompt template for generating AI feedback on student submissions.
    Only one row exists in this table at a time.

    Template variables:
        {assignment_name} – assignment name
        {topic}           – topic (or "N/A")
        {max_score}       – maximum score (or "N/A")
        {student_score}   – student's score (or "not graded yet")
        {student_name}    – student's nickname
        {qa_content}      – formatted question-and-answer block (or empty string)
    """
    __tablename__ = "assignment_feedback_prompt"

    prompt: Mapped[str] = mapped_column(Text, nullable=False)


class SyllabusGenerationPrompt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Global prompt template for generating a course syllabus from an uploaded file.
    Only one row exists in this table at a time.

    Template variables:
        {course_name}        – course name
        {course_description} – course description (or "N/A")
        {file_content}       – text extracted from the uploaded file
    """
    __tablename__ = "syllabus_generation_prompt"

    prompt: Mapped[str] = mapped_column(Text, nullable=False)
