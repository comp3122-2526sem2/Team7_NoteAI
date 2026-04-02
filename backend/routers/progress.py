import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from anythingllm import ChatMode, get_client
from deps import CurrentUser, DbDep, TeacherUser
from models import Assignment, Course, StudentAIRecommendation, StudentTopicProgress, StudentUser, UserRole
from schemas import (
    AIRecommendationOut,
    GenerateRecommendationRequest,
    TopicProgressOut,
    TopicProgressUpdate,
)

router = APIRouter(prefix="/courses/{course_id}/progress", tags=["Progress"])


def _get_course_or_404(course_id: uuid.UUID, db) -> Course:
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    return course


def _get_student_or_404(student_id: uuid.UUID, db) -> StudentUser:
    student = db.get(StudentUser, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    return student


# ── Topic progress ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[TopicProgressOut])
def list_course_progress(course_id: uuid.UUID, _: TeacherUser, db: DbDep):
    """List topic mastery records for ALL students in this course (teacher view)."""
    _get_course_or_404(course_id, db)
    return db.scalars(
        select(StudentTopicProgress).where(StudentTopicProgress.course_id == course_id)
    ).all()


@router.get("/students/{student_id}", response_model=list[TopicProgressOut])
def get_student_progress(
    course_id: uuid.UUID, student_id: uuid.UUID, current_user: CurrentUser, db: DbDep
):
    """Get topic mastery for a specific student. Students can only view their own."""
    _get_course_or_404(course_id, db)
    if current_user.role == UserRole.student and current_user.id != student_id:
        raise HTTPException(status_code=403, detail="Access denied.")
    _get_student_or_404(student_id, db)
    return db.scalars(
        select(StudentTopicProgress).where(
            StudentTopicProgress.course_id == course_id,
            StudentTopicProgress.student_id == student_id,
        )
    ).all()


@router.put("/students/{student_id}/topics/{topic}", response_model=TopicProgressOut)
def update_topic_mastery(
    course_id: uuid.UUID,
    student_id: uuid.UUID,
    topic: str,
    body: TopicProgressUpdate,
    _: TeacherUser,
    db: DbDep,
):
    """
    Set a student's mastery level for a topic.
    Creates the record if it does not exist yet (upsert).
    """
    from datetime import datetime, timezone

    _get_course_or_404(course_id, db)
    _get_student_or_404(student_id, db)

    progress = db.scalar(
        select(StudentTopicProgress).where(
            StudentTopicProgress.course_id == course_id,
            StudentTopicProgress.student_id == student_id,
            StudentTopicProgress.topic == topic,
        )
    )
    if not progress:
        progress = StudentTopicProgress(
            student_id=student_id,
            course_id=course_id,
            topic=topic,
        )
        db.add(progress)

    progress.mastery_level = body.mastery_level
    progress.last_assessed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(progress)
    return progress


# ── AI recommendations ─────────────────────────────────────────────────────────

@router.get("/students/{student_id}/recommendations", response_model=list[AIRecommendationOut])
def list_recommendations(
    course_id: uuid.UUID, student_id: uuid.UUID, current_user: CurrentUser, db: DbDep
):
    """List AI-generated teaching recommendations for a student."""
    if current_user.role == UserRole.student and current_user.id != student_id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return db.scalars(
        select(StudentAIRecommendation).where(
            StudentAIRecommendation.course_id == course_id,
            StudentAIRecommendation.student_id == student_id,
        ).order_by(StudentAIRecommendation.created_at.desc())
    ).all()


@router.post(
    "/students/{student_id}/recommendations/generate",
    response_model=AIRecommendationOut,
    status_code=status.HTTP_201_CREATED,
)
async def generate_recommendation(
    course_id: uuid.UUID,
    student_id: uuid.UUID,
    body: GenerateRecommendationRequest,
    _: TeacherUser,
    db: DbDep,
):
    """
    Generate a personalised AI teaching recommendation for a student.

    Builds a prompt from:
    - The student's current topic mastery levels for this course
    - The assignment they struggled with (if provided)

    Stores the result in student_ai_recommendation.
    """
    _get_course_or_404(course_id, db)
    student = _get_student_or_404(student_id, db)
    student_name = student.user.nickname

    # Gather topic progress
    progress_records = db.scalars(
        select(StudentTopicProgress).where(
            StudentTopicProgress.course_id == course_id,
            StudentTopicProgress.student_id == student_id,
        )
    ).all()
    progress_summary = "\n".join(
        f"- {p.topic}: {p.mastery_level.value}" for p in progress_records
    ) or "No topic progress recorded yet."

    # Gather assignment context if provided
    assignment_context = ""
    if body.based_on_assignment_id:
        assignment = db.get(Assignment, body.based_on_assignment_id)
        if assignment:
            from models import AssignmentSubmission
            sub = db.scalar(
                select(AssignmentSubmission).where(
                    AssignmentSubmission.assignment_id == assignment.id,
                    AssignmentSubmission.student_id == student_id,
                )
            )
            score_str = f"{sub.score}/{assignment.max_score}" if sub and sub.score is not None else "not graded"
            assignment_context = (
                f"\nLatest assignment: '{assignment.name}' (topic: {assignment.topic or 'N/A'})\n"
                f"Score: {score_str}\n"
                f"Student comment: {sub.student_feedback or 'none'}\n"
                f"Teacher feedback: {sub.teacher_feedback or 'none'}\n"
            )

    prompt = (
        f"Student: {student_name}\n"
        f"Course topic progress:\n{progress_summary}\n"
        f"{assignment_context}\n"
        f"Based on this student's performance and mastery levels, provide specific, "
        f"actionable teaching recommendations for the teacher. "
        f"Suggest differentiated activities, resources, or approaches. "
        f"Format your response in markdown."
    )

    client = get_client()
    response = await client.workspace.chat(body.workspace_slug, prompt, mode=ChatMode.chat)

    rec = StudentAIRecommendation(
        student_id=student_id,
        course_id=course_id,
        based_on_assignment_id=body.based_on_assignment_id,
        recommendation=response.textResponse,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec
