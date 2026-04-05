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
    "Student: {student_name}\n\n"
    "{assignment_performance}\n\n"
    "Based on the chapter content and the student's assignment performance above, "
    "provide a personalised, encouraging AI study comment. "
    "Summarise their performance, highlight strengths, identify areas that need "
    "extra attention, and suggest specific next steps. "
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
    "The attached file is the source material uploaded by the teacher. "
    "Using it as the primary reference, generate a comprehensive, "
    "well-structured course syllabus in markdown format. Include: an overview, "
    "learning objectives, weekly/chapter breakdown with topics, recommended readings "
    "or resources (if inferable), and assessment methods."
)

DEFAULT_LESSON_PLAN_GENERATION_PROMPT = (
    "Chapter title: {chapter_title}\n"
    "Chapter description: {chapter_description}\n\n"
    "Teacher instruction: {instruction}\n\n"
    "Course syllabus context:\n"
    "---\n"
    "{syllabus}\n"
    "---\n\n"
    "Chapter materials (uploaded file text + workspace retrieval; this is the main source of truth):\n"
    "---\n"
    "{rag_context}\n"
    "---\n\n"
    "Lesson plan config (JSON):\n"
    "{config_json}\n\n"
    "Generate a complete, practical lesson plan in GitHub-flavored markdown (GFM). "
    "Objectives, examples, vocabulary, and activities MUST follow the PRIMARY chapter "
    "materials above when that section is present. Do not replace them with an unrelated "
    "subject (e.g. inventing a software testing unit when the materials are about something else).\n\n"
    "Use clear heading hierarchy: a single top-level # for the lesson title, then ## "
    "for major sections (e.g. Learning Objectives, Lesson Flow, Assessment, Homework). "
    "Use ### for subsections where helpful.\n\n"
    "Include at minimum: learning objectives (bullet list), a Lesson Flow section with "
    "a GFM pipe table with columns: Time | Phase | Teacher activity | Student activity | "
    "Materials/notes; materials and resources; formative assessment; differentiation or "
    "support ideas; homework or extension.\n\n"
    "For the materials/resources section: only list concrete items, equipment names, or "
    "handout titles that appear in the PRIMARY chapter materials above or are clearly "
    "implied there. If the excerpt is silent, give generic placeholders (e.g. \"printed "
    "handout matching the textbook section\") rather than inventing specific apparatus.\n\n"
    "Table rules: header row required; align columns sensibly; keep rows classroom-actionable; "
    "if timing is unknown, use ranges or TBD in the Time column. "
    "Use bullet lists for objectives and materials where appropriate. "
    "Do not wrap the entire output in a fenced code block."
)

DEFAULT_LESSON_PLAN_SECTION_PROMPT = (
    "Original lesson plan section:\n"
    "---\n"
    "{original_section}\n"
    "---\n\n"
    "Rewrite instruction:\n"
    "{instruction}\n\n"
    "Context config (JSON):\n"
    "{config_json}\n\n"
    "Rewrite only this section in GFM markdown. Preserve any existing table structure "
    "if the section is tabular; otherwise use short paragraphs and bullets. "
    "Keep it concise and classroom-practical. Do not add a title outside the section scope."
)


# ── Singleton prompt models ────────────────────────────────────────────────────

class ChapterPerformancePrompt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Global prompt template for generating per-student chapter AI study comments.
    Only one row exists in this table at a time.

    Template variables:
        {chapter_title}          – chapter title
        {chapter_description}    – chapter description (or "N/A")
        {student_name}           – student's nickname
        {assignment_performance} – formatted block with each assignment's status,
                                   score, and AI feedback for this student
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


class LessonPlanGenerationPrompt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Global prompt template for generating a full lesson plan draft.
    Only one row exists in this table at a time.

    Template variables:
        {chapter_title}       – chapter title
        {chapter_description} – chapter description
        {instruction}         – teacher free-form instruction
        {syllabus}            – course-level syllabus context
        {rag_context}         – chapter-level material context from AnythingLLM
        {config_json}         – lesson plan config JSON
    """
    __tablename__ = "lesson_plan_generation_prompt"

    prompt: Mapped[str] = mapped_column(Text, nullable=False)


class LessonPlanSectionPrompt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Global prompt template for regenerating a selected section in a lesson plan.
    Only one row exists in this table at a time.

    Template variables:
        {original_section} – selected markdown section
        {instruction}      – rewrite instruction from teacher
        {config_json}      – lesson plan config JSON
    """
    __tablename__ = "lesson_plan_section_prompt"

    prompt: Mapped[str] = mapped_column(Text, nullable=False)
