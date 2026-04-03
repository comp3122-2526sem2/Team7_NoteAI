"""
Course-level AI prompt configuration.

Each course can override the default prompts used when generating:
  - Chapter performance / AI study comments
  - Assignment submission feedback

GET  returns the active prompt (custom if set, otherwise the system default).
PUT  upserts the custom prompt (teacher / admin only).
DELETE resets back to the system default.

Template variables are documented in models/prompt.py.
"""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from deps import CurrentUser, DbDep, TeacherUser
from models import (
    Course,
    AssignmentFeedbackPrompt,
    ChapterPerformancePrompt,
    DEFAULT_ASSIGNMENT_FEEDBACK_PROMPT,
    DEFAULT_CHAPTER_PERFORMANCE_PROMPT,
)
from schemas import PromptOut, PromptUpdate

router = APIRouter(prefix="/courses/{course_id}/prompts", tags=["Prompts"])


def _get_course_or_404(course_id: uuid.UUID, db) -> Course:
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    return course


# ── Chapter performance prompt ────────────────────────────────────────────────

@router.get("/chapter-performance", response_model=PromptOut)
def get_chapter_performance_prompt(
    course_id: uuid.UUID, _: CurrentUser, db: DbDep
):
    """Return the active chapter-performance prompt (custom or system default)."""
    _get_course_or_404(course_id, db)
    row = db.scalar(
        select(ChapterPerformancePrompt).where(
            ChapterPerformancePrompt.course_id == course_id
        )
    )
    if row:
        return row
    # Return a virtual object representing the system default
    return PromptOut(
        id=uuid.UUID(int=0),
        course_id=course_id,
        prompt=DEFAULT_CHAPTER_PERFORMANCE_PROMPT,
        created_at=None,  # type: ignore[arg-type]
        updated_at=None,  # type: ignore[arg-type]
    )


@router.put(
    "/chapter-performance",
    response_model=PromptOut,
    status_code=status.HTTP_200_OK,
)
def upsert_chapter_performance_prompt(
    course_id: uuid.UUID, body: PromptUpdate, _: TeacherUser, db: DbDep
):
    """Create or replace the chapter-performance prompt for this course."""
    _get_course_or_404(course_id, db)
    row = db.scalar(
        select(ChapterPerformancePrompt).where(
            ChapterPerformancePrompt.course_id == course_id
        )
    )
    if row:
        row.prompt = body.prompt
    else:
        row = ChapterPerformancePrompt(course_id=course_id, prompt=body.prompt)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/chapter-performance",
    status_code=status.HTTP_204_NO_CONTENT,
)
def reset_chapter_performance_prompt(
    course_id: uuid.UUID, _: TeacherUser, db: DbDep
):
    """Delete the custom prompt, reverting to the system default."""
    _get_course_or_404(course_id, db)
    row = db.scalar(
        select(ChapterPerformancePrompt).where(
            ChapterPerformancePrompt.course_id == course_id
        )
    )
    if row:
        db.delete(row)
        db.commit()


# ── Assignment feedback prompt ────────────────────────────────────────────────

@router.get("/assignment-feedback", response_model=PromptOut)
def get_assignment_feedback_prompt(
    course_id: uuid.UUID, _: CurrentUser, db: DbDep
):
    """Return the active assignment-feedback prompt (custom or system default)."""
    _get_course_or_404(course_id, db)
    row = db.scalar(
        select(AssignmentFeedbackPrompt).where(
            AssignmentFeedbackPrompt.course_id == course_id
        )
    )
    if row:
        return row
    return PromptOut(
        id=uuid.UUID(int=0),
        course_id=course_id,
        prompt=DEFAULT_ASSIGNMENT_FEEDBACK_PROMPT,
        created_at=None,  # type: ignore[arg-type]
        updated_at=None,  # type: ignore[arg-type]
    )


@router.put(
    "/assignment-feedback",
    response_model=PromptOut,
    status_code=status.HTTP_200_OK,
)
def upsert_assignment_feedback_prompt(
    course_id: uuid.UUID, body: PromptUpdate, _: TeacherUser, db: DbDep
):
    """Create or replace the assignment-feedback prompt for this course."""
    _get_course_or_404(course_id, db)
    row = db.scalar(
        select(AssignmentFeedbackPrompt).where(
            AssignmentFeedbackPrompt.course_id == course_id
        )
    )
    if row:
        row.prompt = body.prompt
    else:
        row = AssignmentFeedbackPrompt(course_id=course_id, prompt=body.prompt)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/assignment-feedback",
    status_code=status.HTTP_204_NO_CONTENT,
)
def reset_assignment_feedback_prompt(
    course_id: uuid.UUID, _: TeacherUser, db: DbDep
):
    """Delete the custom prompt, reverting to the system default."""
    _get_course_or_404(course_id, db)
    row = db.scalar(
        select(AssignmentFeedbackPrompt).where(
            AssignmentFeedbackPrompt.course_id == course_id
        )
    )
    if row:
        db.delete(row)
        db.commit()
