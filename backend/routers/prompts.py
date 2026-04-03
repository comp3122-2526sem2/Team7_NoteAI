"""
Global AI prompt configuration endpoints.

Each prompt type stores at most one row in the database (singleton).
Only teachers may create / update / delete; anyone may read (GET).

Routes
------
GET    /prompts/chapter-performance
PUT    /prompts/chapter-performance
DELETE /prompts/chapter-performance

GET    /prompts/assignment-feedback
PUT    /prompts/assignment-feedback
DELETE /prompts/assignment-feedback

GET    /prompts/syllabus-generation
PUT    /prompts/syllabus-generation
DELETE /prompts/syllabus-generation
"""

from __future__ import annotations

from typing import Any, Type

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from deps import CurrentUser, DbDep, TeacherUser
from models import (
    AssignmentFeedbackPrompt,
    ChapterPerformancePrompt,
    SyllabusGenerationPrompt,
    DEFAULT_ASSIGNMENT_FEEDBACK_PROMPT,
    DEFAULT_CHAPTER_PERFORMANCE_PROMPT,
    DEFAULT_SYLLABUS_GENERATION_PROMPT,
)
from schemas import PromptOut, PromptUpdate

prompts_router = APIRouter(prefix="/prompts", tags=["prompts"])


# ── Generic helpers ────────────────────────────────────────────────────────────

def _get_singleton(db, model: Type[Any], default: str) -> PromptOut:
    row = db.scalar(select(model))
    return PromptOut(
        id=row.id if row else None,
        prompt=row.prompt if row else default,
        is_default=row is None,
    )


def _put_singleton(db, model: Type[Any], body: PromptUpdate) -> PromptOut:
    row = db.scalar(select(model))
    if row is None:
        row = model(prompt=body.prompt)
        db.add(row)
    else:
        row.prompt = body.prompt
    db.commit()
    db.refresh(row)
    return PromptOut(id=row.id, prompt=row.prompt, is_default=False)


def _delete_singleton(db, model: Type[Any]) -> dict:
    row = db.scalar(select(model))
    if row is None:
        raise HTTPException(status_code=404, detail="No custom prompt set; already using default.")
    db.delete(row)
    db.commit()
    return {"detail": "Custom prompt deleted. Default will be used."}


# ── Chapter-performance prompt ─────────────────────────────────────────────────

@prompts_router.get("/chapter-performance", response_model=PromptOut)
def get_chapter_performance_prompt(_: CurrentUser, db: DbDep):
    return _get_singleton(db, ChapterPerformancePrompt, DEFAULT_CHAPTER_PERFORMANCE_PROMPT)


@prompts_router.put("/chapter-performance", response_model=PromptOut)
def put_chapter_performance_prompt(body: PromptUpdate, _: TeacherUser, db: DbDep):
    return _put_singleton(db, ChapterPerformancePrompt, body)


@prompts_router.delete("/chapter-performance")
def delete_chapter_performance_prompt(_: TeacherUser, db: DbDep):
    return _delete_singleton(db, ChapterPerformancePrompt)


# ── Assignment-feedback prompt ─────────────────────────────────────────────────

@prompts_router.get("/assignment-feedback", response_model=PromptOut)
def get_assignment_feedback_prompt(_: CurrentUser, db: DbDep):
    return _get_singleton(db, AssignmentFeedbackPrompt, DEFAULT_ASSIGNMENT_FEEDBACK_PROMPT)


@prompts_router.put("/assignment-feedback", response_model=PromptOut)
def put_assignment_feedback_prompt(body: PromptUpdate, _: TeacherUser, db: DbDep):
    return _put_singleton(db, AssignmentFeedbackPrompt, body)


@prompts_router.delete("/assignment-feedback")
def delete_assignment_feedback_prompt(_: TeacherUser, db: DbDep):
    return _delete_singleton(db, AssignmentFeedbackPrompt)


# ── Syllabus-generation prompt ─────────────────────────────────────────────────

@prompts_router.get("/syllabus-generation", response_model=PromptOut)
def get_syllabus_generation_prompt(_: CurrentUser, db: DbDep):
    return _get_singleton(db, SyllabusGenerationPrompt, DEFAULT_SYLLABUS_GENERATION_PROMPT)


@prompts_router.put("/syllabus-generation", response_model=PromptOut)
def put_syllabus_generation_prompt(body: PromptUpdate, _: TeacherUser, db: DbDep):
    return _put_singleton(db, SyllabusGenerationPrompt, body)


@prompts_router.delete("/syllabus-generation")
def delete_syllabus_generation_prompt(_: TeacherUser, db: DbDep):
    return _delete_singleton(db, SyllabusGenerationPrompt)
