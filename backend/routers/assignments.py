import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from anythingllm import ChatMode, get_client
from deps import CurrentUser, DbDep, TeacherUser
from models import Assignment, AssignmentSubmission, Course, StudentUser, UserRole
from models.assignment import SubmissionStatus
from schemas import (
    AssignmentCreate,
    AssignmentOut,
    AssignmentUpdate,
    SubmissionCreate,
    SubmissionGrade,
    SubmissionOut,
)

router = APIRouter(prefix="/courses/{course_id}/assignments", tags=["Assignments"])


def _get_course_or_404(course_id: uuid.UUID, db) -> Course:
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    return course


def _get_assignment_or_404(assignment_id: uuid.UUID, course_id: uuid.UUID, db) -> Assignment:
    assignment = db.scalar(
        select(Assignment).where(
            Assignment.id == assignment_id,
            Assignment.course_id == course_id,
        )
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    return assignment


def _get_submission_or_404(submission_id: uuid.UUID, assignment_id: uuid.UUID, db) -> AssignmentSubmission:
    sub = db.scalar(
        select(AssignmentSubmission).where(
            AssignmentSubmission.id == submission_id,
            AssignmentSubmission.assignment_id == assignment_id,
        )
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found.")
    return sub


# ── Assignments ───────────────────────────────────────────────────────────────

@router.get("", response_model=list[AssignmentOut])
def list_assignments(course_id: uuid.UUID, _: CurrentUser, db: DbDep):
    _get_course_or_404(course_id, db)
    return db.scalars(
        select(Assignment).where(Assignment.course_id == course_id).order_by(Assignment.due_date)
    ).all()


@router.post("", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED)
def create_assignment(course_id: uuid.UUID, body: AssignmentCreate, _: TeacherUser, db: DbDep):
    _get_course_or_404(course_id, db)
    assignment = Assignment(course_id=course_id, **body.model_dump())
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.get("/{assignment_id}", response_model=AssignmentOut)
def get_assignment(course_id: uuid.UUID, assignment_id: uuid.UUID, _: CurrentUser, db: DbDep):
    return _get_assignment_or_404(assignment_id, course_id, db)


@router.put("/{assignment_id}", response_model=AssignmentOut)
def update_assignment(
    course_id: uuid.UUID, assignment_id: uuid.UUID, body: AssignmentUpdate, _: TeacherUser, db: DbDep
):
    assignment = _get_assignment_or_404(assignment_id, course_id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(assignment, field, value)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(course_id: uuid.UUID, assignment_id: uuid.UUID, _: TeacherUser, db: DbDep):
    assignment = _get_assignment_or_404(assignment_id, course_id, db)
    db.delete(assignment)
    db.commit()


# ── Submissions ───────────────────────────────────────────────────────────────

@router.get("/{assignment_id}/submissions", response_model=list[SubmissionOut])
def list_submissions(
    course_id: uuid.UUID, assignment_id: uuid.UUID, current_user: CurrentUser, db: DbDep
):
    assignment = _get_assignment_or_404(assignment_id, course_id, db)
    query = select(AssignmentSubmission).where(
        AssignmentSubmission.assignment_id == assignment.id
    )
    # Students can only see their own submission
    if current_user.role == UserRole.student:
        query = query.where(AssignmentSubmission.student_id == current_user.id)
    return db.scalars(query).all()


@router.post("/{assignment_id}/submit", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
def submit_assignment(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    body: SubmissionCreate,
    current_user: CurrentUser,
    db: DbDep,
):
    if current_user.role != UserRole.student:
        raise HTTPException(status_code=403, detail="Only students can submit assignments.")
    assignment = _get_assignment_or_404(assignment_id, course_id, db)

    existing = db.scalar(
        select(AssignmentSubmission).where(
            AssignmentSubmission.assignment_id == assignment.id,
            AssignmentSubmission.student_id == current_user.id,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already submitted.")

    submission = AssignmentSubmission(
        assignment_id=assignment.id,
        student_id=current_user.id,
        student_feedback=body.student_feedback,
        submission_date=datetime.now(timezone.utc),
        submission_status=SubmissionStatus.submitted,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


@router.get("/{assignment_id}/submissions/{submission_id}", response_model=SubmissionOut)
def get_submission(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    submission_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbDep,
):
    sub = _get_submission_or_404(submission_id, assignment_id, db)
    if current_user.role == UserRole.student and sub.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return sub


@router.put("/{assignment_id}/submissions/{submission_id}/grade", response_model=SubmissionOut)
def grade_submission(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    submission_id: uuid.UUID,
    body: SubmissionGrade,
    _: TeacherUser,
    db: DbDep,
):
    sub = _get_submission_or_404(submission_id, assignment_id, db)
    if body.score is not None:
        sub.score = body.score
    if body.teacher_feedback is not None:
        sub.teacher_feedback = body.teacher_feedback
    sub.submission_status = SubmissionStatus.graded
    db.commit()
    db.refresh(sub)
    return sub


@router.post("/{assignment_id}/submissions/{submission_id}/ai-feedback", response_model=SubmissionOut)
async def generate_ai_feedback(
    course_id: uuid.UUID,
    assignment_id: uuid.UUID,
    submission_id: uuid.UUID,
    _: TeacherUser,
    db: DbDep,
):
    """
    Ask AnythingLLM to generate AI feedback for a student submission.
    Saves the result to assignment_submission.ai_feedback.
    """
    assignment = _get_assignment_or_404(assignment_id, course_id, db)
    sub = _get_submission_or_404(submission_id, assignment_id, db)

    student = db.get(StudentUser, sub.student_id)
    student_name = student.user.nickname if student else "the student"

    prompt = (
        f"Assignment: {assignment.name}\n"
        f"Topic: {assignment.topic or 'N/A'}\n"
        f"Max score: {assignment.max_score or 'N/A'}\n"
        f"Student score: {sub.score or 'not graded yet'}\n"
        f"Student comment: {sub.student_feedback or 'none'}\n\n"
        f"Please provide constructive feedback for {student_name} on this assignment. "
        f"Highlight strengths, areas for improvement, and specific suggestions. "
        f"Format your response in markdown."
    )

    client = get_client()
    response = await client.workspace.chat("assignments", prompt, mode=ChatMode.query)
    sub.ai_feedback = response.textResponse
    db.commit()
    db.refresh(sub)
    return sub
