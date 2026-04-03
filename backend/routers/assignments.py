import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from deps import CurrentUser, DbDep, TeacherUser
from openai_client import chat_complete
from models import Assignment, AssignmentSubmission, Course, StudentUser, UserRole
from models.assignment import SubmissionStatus
from models.prompt import AssignmentFeedbackPrompt, DEFAULT_ASSIGNMENT_FEEDBACK_PROMPT
from schemas import (
    AssignmentCreate,
    AssignmentOut,
    AssignmentUpdate,
    SubmissionCreate,
    SubmissionGrade,
    SubmissionOut,
)

router = APIRouter(prefix="/courses/{course_id}/assignments", tags=["Assignments"])


def _strip_answers(content: dict | None) -> dict | None:
    """
    Remove correct_answer / suggested_answer from every question in an
    assignment content dict before returning it to a student.
    """
    if not content or not isinstance(content, dict):
        return content
    import copy
    content = copy.deepcopy(content)
    for section in content.get("sections", []):
        stype = section.get("type")
        if stype == "mc":
            section.pop("correct_answer", None)
        elif stype == "long":
            section.pop("suggested_answer", None)
        elif stype == "passage":
            for q in section.get("questions", []):
                if q.get("type") == "mc":
                    q.pop("correct_answer", None)
                elif q.get("type") == "long":
                    q.pop("suggested_answer", None)
    return content


def _assignment_out(assignment: Assignment, student: bool) -> dict:
    """Serialise an Assignment, stripping answer keys when caller is a student."""
    out = AssignmentOut.model_validate(assignment).model_dump()
    if student:
        out["content"] = _strip_answers(out.get("content"))
    return out


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
def list_assignments(
    course_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbDep,
    chapter_id: Optional[uuid.UUID] = Query(None),
):
    _get_course_or_404(course_id, db)
    query = select(Assignment).where(Assignment.course_id == course_id)
    if chapter_id is not None:
        query = query.where(Assignment.chapter_id == chapter_id)
    is_student = current_user.role == UserRole.student
    return [
        _assignment_out(a, is_student)
        for a in db.scalars(query.order_by(Assignment.due_date)).all()
    ]


@router.post("", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED)
def create_assignment(course_id: uuid.UUID, body: AssignmentCreate, _: TeacherUser, db: DbDep):
    _get_course_or_404(course_id, db)
    data = body.model_dump()
    # Serialise Pydantic content model → plain dict for JSONB storage
    if data.get("content") is not None:
        data["content"] = body.content.model_dump() if body.content else None
    assignment = Assignment(course_id=course_id, **data)
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.get("/{assignment_id}", response_model=AssignmentOut)
def get_assignment(course_id: uuid.UUID, assignment_id: uuid.UUID, current_user: CurrentUser, db: DbDep):
    assignment = _get_assignment_or_404(assignment_id, course_id, db)
    return _assignment_out(assignment, current_user.role == UserRole.student)


@router.put("/{assignment_id}", response_model=AssignmentOut)
def update_assignment(
    course_id: uuid.UUID, assignment_id: uuid.UUID, body: AssignmentUpdate, _: TeacherUser, db: DbDep
):
    assignment = _get_assignment_or_404(assignment_id, course_id, db)
    data = body.model_dump(exclude_none=True)
    if "content" in data and body.content is not None:
        data["content"] = body.content.model_dump()
    for field, value in data.items():
        setattr(assignment, field, value)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(course_id: uuid.UUID, assignment_id: uuid.UUID, _: TeacherUser, db: DbDep):
    assignment = _get_assignment_or_404(assignment_id, course_id, db)
    db.delete(assignment)
    db.commit()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _append_question(
    lines: list[str],
    num: int,
    section: dict,
    answers: dict | None,
) -> None:
    q_type = section.get("type")
    question_text = section.get("question", "")
    student_answer = (answers or {}).get(str(num), "(no answer)")

    if q_type == "mc":
        opts_list = section.get("options", [])
        labels = [chr(ord("A") + i) for i in range(len(opts_list))]
        opts_str = "  ".join(f"{lbl}) {txt}" for lbl, txt in zip(labels, opts_list))
        correct = section.get("correct_answer", "?")
        lines.append(
            f"Q{num} [MC] {question_text}\n"
            f"  Options: {opts_str}\n"
            f"  Correct: {correct}  |  Student answered: {student_answer}"
        )
    elif q_type == "long":
        suggested = section.get("suggested_answer", "")
        lines.append(
            f"Q{num} [Long] {question_text}\n"
            + (f"  Suggested answer: {suggested}\n" if suggested else "")
            + f"  Student answer: {student_answer}"
        )


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
        answers=body.answers,
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

    # Build a human-readable question+answer summary for the AI
    qa_lines: list[str] = []
    if assignment.content and isinstance(assignment.content, dict):
        q_num = 0
        for section in assignment.content.get("sections", []):
            if section.get("type") == "passage":
                qa_lines.append(f"[Reading Passage]\n{section.get('passage', '')}\n")
                for sq in section.get("questions", []):
                    q_num += 1
                    _append_question(qa_lines, q_num, sq, sub.answers)
            else:
                q_num += 1
                _append_question(qa_lines, q_num, section, sub.answers)

    qa_content = ("\n".join(qa_lines) + "\n\n") if qa_lines else (
        f"Student answer: {sub.student_feedback or sub.answers or 'none'}\n\n"
    )

    # Load the global custom prompt or fall back to default
    prompt_row = db.scalar(select(AssignmentFeedbackPrompt))
    template = prompt_row.prompt if prompt_row else DEFAULT_ASSIGNMENT_FEEDBACK_PROMPT
    prompt = template.format(
        assignment_name=assignment.name,
        topic=assignment.topic or "N/A",
        max_score=assignment.max_score or "N/A",
        student_score=sub.score or "not graded yet",
        student_name=student_name,
        qa_content=qa_content,
    )

    sub.ai_feedback = await chat_complete(
        prompt,
        system="You are a helpful educational assistant. Always respond in markdown.",
        temperature=0.7,
    )
    db.commit()
    db.refresh(sub)
    return sub
