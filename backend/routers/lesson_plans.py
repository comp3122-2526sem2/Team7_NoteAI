import uuid

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from anythingllm import ChatMode, get_client
from deps import CurrentUser, DbDep, TeacherUser
from models import Course, LessonPlan, LessonPlanTopic, LessonPlanVersion
from schemas import (
    AIGenerateRequest,
    LessonPlanCreate,
    LessonPlanOut,
    LessonPlanUpdate,
    TopicCreate,
    TopicOut,
    TopicUpdate,
    VersionOut,
)

router = APIRouter(prefix="/courses/{course_id}/lesson-plans", tags=["Lesson Plans"])


def _get_course_or_404(course_id: uuid.UUID, db) -> Course:
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    return course


def _get_plan_or_404(plan_id: uuid.UUID, course_id: uuid.UUID, db) -> LessonPlan:
    plan = db.scalar(
        select(LessonPlan).where(
            LessonPlan.id == plan_id,
            LessonPlan.course_id == course_id,
        )
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found.")
    return plan


# ── Lesson Plans CRUD ─────────────────────────────────────────────────────────

@router.get("", response_model=list[LessonPlanOut])
def list_lesson_plans(course_id: uuid.UUID, _: CurrentUser, db: DbDep):
    _get_course_or_404(course_id, db)
    return db.scalars(
        select(LessonPlan)
        .where(LessonPlan.course_id == course_id)
        .order_by(LessonPlan.updated_at.desc())
    ).all()


@router.post("", response_model=LessonPlanOut, status_code=status.HTTP_201_CREATED)
def create_lesson_plan(
    course_id: uuid.UUID, body: LessonPlanCreate, current_user: TeacherUser, db: DbDep
):
    _get_course_or_404(course_id, db)
    plan = LessonPlan(course_id=course_id, created_by=current_user.id, **body.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/{plan_id}", response_model=LessonPlanOut)
def get_lesson_plan(course_id: uuid.UUID, plan_id: uuid.UUID, _: CurrentUser, db: DbDep):
    return _get_plan_or_404(plan_id, course_id, db)


@router.put("/{plan_id}", response_model=LessonPlanOut)
def update_lesson_plan(
    course_id: uuid.UUID,
    plan_id: uuid.UUID,
    body: LessonPlanUpdate,
    current_user: TeacherUser,
    db: DbDep,
):
    """
    Update a lesson plan. Automatically saves the previous content as a version snapshot
    before applying changes (live editor history).
    """
    plan = _get_plan_or_404(plan_id, course_id, db)

    # Save a version snapshot of the current content before overwriting
    if plan.content and (body.content is not None and body.content != plan.content):
        db.add(
            LessonPlanVersion(
                lesson_plan_id=plan.id,
                saved_by=current_user.id,
                snapshot_content=plan.content,
            )
        )

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(plan, field, value)

    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lesson_plan(course_id: uuid.UUID, plan_id: uuid.UUID, _: TeacherUser, db: DbDep):
    plan = _get_plan_or_404(plan_id, course_id, db)
    db.delete(plan)
    db.commit()


# ── Topics ────────────────────────────────────────────────────────────────────

@router.get("/{plan_id}/topics", response_model=list[TopicOut])
def list_topics(course_id: uuid.UUID, plan_id: uuid.UUID, _: CurrentUser, db: DbDep):
    plan = _get_plan_or_404(plan_id, course_id, db)
    return db.scalars(
        select(LessonPlanTopic).where(LessonPlanTopic.lesson_plan_id == plan.id)
    ).all()


@router.post("/{plan_id}/topics", response_model=TopicOut, status_code=status.HTTP_201_CREATED)
def add_topic(
    course_id: uuid.UUID, plan_id: uuid.UUID, body: TopicCreate, _: TeacherUser, db: DbDep
):
    plan = _get_plan_or_404(plan_id, course_id, db)
    topic = LessonPlanTopic(lesson_plan_id=plan.id, **body.model_dump())
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic


@router.put("/{plan_id}/topics/{topic_id}", response_model=TopicOut)
def update_topic(
    course_id: uuid.UUID,
    plan_id: uuid.UUID,
    topic_id: uuid.UUID,
    body: TopicUpdate,
    _: TeacherUser,
    db: DbDep,
):
    _get_plan_or_404(plan_id, course_id, db)
    topic = db.scalar(
        select(LessonPlanTopic).where(
            LessonPlanTopic.id == topic_id,
            LessonPlanTopic.lesson_plan_id == plan_id,
        )
    )
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found.")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(topic, field, value)
    db.commit()
    db.refresh(topic)
    return topic


@router.delete("/{plan_id}/topics/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_topic(
    course_id: uuid.UUID, plan_id: uuid.UUID, topic_id: uuid.UUID, _: TeacherUser, db: DbDep
):
    _get_plan_or_404(plan_id, course_id, db)
    topic = db.scalar(
        select(LessonPlanTopic).where(
            LessonPlanTopic.id == topic_id,
            LessonPlanTopic.lesson_plan_id == plan_id,
        )
    )
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found.")
    db.delete(topic)
    db.commit()


# ── Version history ────────────────────────────────────────────────────────────

@router.get("/{plan_id}/versions", response_model=list[VersionOut])
def list_versions(course_id: uuid.UUID, plan_id: uuid.UUID, _: TeacherUser, db: DbDep):
    plan = _get_plan_or_404(plan_id, course_id, db)
    return db.scalars(
        select(LessonPlanVersion)
        .where(LessonPlanVersion.lesson_plan_id == plan.id)
        .order_by(LessonPlanVersion.created_at.desc())
    ).all()


@router.post("/{plan_id}/versions/{version_id}/restore", response_model=LessonPlanOut)
def restore_version(
    course_id: uuid.UUID,
    plan_id: uuid.UUID,
    version_id: uuid.UUID,
    current_user: TeacherUser,
    db: DbDep,
):
    """Restore a previous version's snapshot_content as the current plan content."""
    plan = _get_plan_or_404(plan_id, course_id, db)
    version = db.scalar(
        select(LessonPlanVersion).where(
            LessonPlanVersion.id == version_id,
            LessonPlanVersion.lesson_plan_id == plan.id,
        )
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found.")

    # Save current content as a new version before restoring
    if plan.content:
        db.add(
            LessonPlanVersion(
                lesson_plan_id=plan.id,
                saved_by=current_user.id,
                snapshot_content=plan.content,
            )
        )

    plan.content = version.snapshot_content
    db.commit()
    db.refresh(plan)
    return plan


# ── AI generation ──────────────────────────────────────────────────────────────

@router.post("/{plan_id}/ai-generate", response_model=LessonPlanOut)
async def ai_generate(
    course_id: uuid.UUID,
    plan_id: uuid.UUID,
    body: AIGenerateRequest,
    current_user: TeacherUser,
    db: DbDep,
):
    """
    Generate or partially rewrite lesson plan content using AnythingLLM.
    The AI response is saved as the new plan content (existing content snapshotted first).
    """
    plan = _get_plan_or_404(plan_id, course_id, db)

    # Snapshot current content before AI overwrites it
    if plan.content:
        db.add(
            LessonPlanVersion(
                lesson_plan_id=plan.id,
                saved_by=current_user.id,
                snapshot_content=plan.content,
            )
        )

    client = get_client()
    mode = ChatMode.chat if body.mode == "chat" else ChatMode.query
    response = await client.workspace.chat(
        "lesson-plans", body.prompt, mode=mode, session_id=body.session_id
    )
    plan.content = response.textResponse
    db.commit()
    db.refresh(plan)
    return plan


@router.post("/{plan_id}/ai-stream")
async def ai_stream(
    course_id: uuid.UUID,
    plan_id: uuid.UUID,
    body: AIGenerateRequest,
    _: TeacherUser,
    db: DbDep,
):
    """
    Stream AI-generated lesson plan content token by token (SSE).
    Use this for the live editor so content appears progressively.
    The streamed content is NOT saved automatically — call PUT /{plan_id} to save.
    """
    _get_plan_or_404(plan_id, course_id, db)

    client = get_client()
    mode = ChatMode.chat if body.mode == "chat" else ChatMode.query

    async def event_stream():
        async for chunk in client.workspace.stream_chat(
            "lesson-plans", body.prompt, mode=mode, session_id=body.session_id
        ):
            if chunk.textResponse:
                yield f"data: {chunk.textResponse}\n\n"
            if chunk.close:
                yield "data: [DONE]\n\n"
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")
