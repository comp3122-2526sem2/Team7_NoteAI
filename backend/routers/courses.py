import base64
import io
import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, status
from sqlalchemy import select

from database import SessionLocal
from deps import AdminUser, CurrentUser, DbDep, TeacherUser
from models import (
    Course, CourseStudent, CourseTeacher, Document, StudentUser,
    SyllabusGenerationPrompt,
    TeacherUser as TeacherModel, UserRole,
    DEFAULT_SYLLABUS_GENERATION_PROMPT,
)
from models.document import ConversionStatus, DocumentType
from schemas import (
    AssignTeacherRequest,
    CourseCreate,
    CourseOut,
    CourseUpdate,
    EnrollStudentRequest,
    SyllabusUploadOut,
    UserOut,
)

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(Path(__file__).parent.parent / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

SYLLABUS_ALLOWED_TYPES: dict[str, str] = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "text/plain": "txt",
    "text/markdown": "md",
}



router = APIRouter(prefix="/courses", tags=["Courses"])


def _get_course_or_404(course_id: uuid.UUID, db) -> Course:
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found.")
    return course


@router.get("", response_model=list[CourseOut])
def list_courses(current_user: CurrentUser, db: DbDep):
    if current_user.role == UserRole.admin:
        return db.scalars(select(Course).order_by(Course.created_at.desc())).all()
    if current_user.role == UserRole.teacher:
        return db.scalars(
            select(Course)
            .join(CourseTeacher, CourseTeacher.course_id == Course.id)
            .where(CourseTeacher.teacher_id == current_user.id)
        ).all()
    # student
    return db.scalars(
        select(Course)
        .join(CourseStudent, CourseStudent.course_id == Course.id)
        .where(CourseStudent.student_id == current_user.id)
    ).all()


@router.post("", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(body: CourseCreate, current_user: TeacherUser, db: DbDep):
    course = Course(**body.model_dump())
    db.add(course)
    db.flush()
    db.add(CourseTeacher(teacher_id=current_user.id, course_id=course.id))
    db.commit()
    db.refresh(course)
    return course


@router.get("/{course_id}", response_model=CourseOut)
def get_course(course_id: uuid.UUID, _: CurrentUser, db: DbDep):
    return _get_course_or_404(course_id, db)


@router.put("/{course_id}", response_model=CourseOut)
def update_course(course_id: uuid.UUID, body: CourseUpdate, _: TeacherUser, db: DbDep):
    course = _get_course_or_404(course_id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(course, field, value)
    db.commit()
    db.refresh(course)
    return course


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(course_id: uuid.UUID, _: AdminUser, db: DbDep):
    course = _get_course_or_404(course_id, db)
    db.delete(course)
    db.commit()


# ── Students ──────────────────────────────────────────────────────────────────

@router.get("/{course_id}/students", response_model=list[UserOut])
def list_students(course_id: uuid.UUID, _: TeacherUser, db: DbDep):
    _get_course_or_404(course_id, db)
    enrollments = db.scalars(
        select(CourseStudent).where(CourseStudent.course_id == course_id)
    ).all()
    student_ids = [e.student_id for e in enrollments]
    students = [db.get(StudentUser, sid) for sid in student_ids]
    return [s.user for s in students if s]


@router.post("/{course_id}/students", status_code=status.HTTP_201_CREATED)
def enroll_student(course_id: uuid.UUID, body: EnrollStudentRequest, _: TeacherUser, db: DbDep):
    _get_course_or_404(course_id, db)
    student = db.scalar(select(StudentUser).where(StudentUser.student_id == body.student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")
    existing = db.scalar(
        select(CourseStudent).where(
            CourseStudent.course_id == course_id,
            CourseStudent.student_id == student.id,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Student already enrolled.")
    db.add(CourseStudent(course_id=course_id, student_id=student.id))
    db.commit()
    return {"detail": "Student enrolled."}


@router.delete("/{course_id}/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def unenroll_student(course_id: uuid.UUID, student_id: uuid.UUID, _: TeacherUser, db: DbDep):
    enrollment = db.scalar(
        select(CourseStudent).where(
            CourseStudent.course_id == course_id,
            CourseStudent.student_id == student_id,
        )
    )
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found.")
    db.delete(enrollment)
    db.commit()


# ── Teachers ──────────────────────────────────────────────────────────────────

@router.get("/{course_id}/teachers", response_model=list[UserOut])
def list_teachers(course_id: uuid.UUID, _: CurrentUser, db: DbDep):
    _get_course_or_404(course_id, db)
    assignments = db.scalars(
        select(CourseTeacher).where(CourseTeacher.course_id == course_id)
    ).all()
    teacher_ids = [a.teacher_id for a in assignments]
    teachers = [db.get(TeacherModel, tid) for tid in teacher_ids]
    return [t.user for t in teachers if t]


@router.post("/{course_id}/teachers", status_code=status.HTTP_201_CREATED)
def assign_teacher(course_id: uuid.UUID, body: AssignTeacherRequest, _: AdminUser, db: DbDep):
    _get_course_or_404(course_id, db)
    teacher = db.scalar(select(TeacherModel).where(TeacherModel.teacher_id == body.teacher_id))
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found.")
    existing = db.scalar(
        select(CourseTeacher).where(
            CourseTeacher.course_id == course_id,
            CourseTeacher.teacher_id == teacher.id,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Teacher already assigned.")
    db.add(CourseTeacher(course_id=course_id, teacher_id=teacher.id))
    db.commit()
    return {"detail": "Teacher assigned."}


@router.delete("/{course_id}/teachers/{teacher_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_teacher(course_id: uuid.UUID, teacher_id: uuid.UUID, _: AdminUser, db: DbDep):
    assignment = db.scalar(
        select(CourseTeacher).where(
            CourseTeacher.course_id == course_id,
            CourseTeacher.teacher_id == teacher_id,
        )
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Teacher assignment not found.")
    db.delete(assignment)
    db.commit()


# ── Syllabus validation ────────────────────────────────────────────────────────

_MAX_FILE_SIZE_MB = 20
_MAX_PDF_PAGES = 50


def _validate_syllabus_file(file_bytes: bytes, content_type: str) -> None:
    """
    Raise HTTPException(400) if the file would be rejected by the LLM.

    Checks:
      • File size ≤ 20 MB  (all types)
      • PDF page count ≤ 50  (API limit: one image per page, max 50 images)
    """
    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > _MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=(
                f"File is too large ({size_mb:.1f} MB). "
                f"Maximum allowed size is {_MAX_FILE_SIZE_MB} MB."
            ),
        )

    if content_type == "application/pdf":
        try:
            from pypdf import PdfReader
            page_count = len(PdfReader(io.BytesIO(file_bytes)).pages)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Could not read PDF: {exc}")

        if page_count > _MAX_PDF_PAGES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"PDF has {page_count} pages. "
                    f"Maximum allowed is {_MAX_PDF_PAGES} pages. "
                    f"Please split the document or reduce it to {_MAX_PDF_PAGES} pages or fewer."
                ),
            )


# ── Syllabus helpers ───────────────────────────────────────────────────────────

# Bound syllabus size when embedded in other LLM prompts (e.g. lesson-plan generation).
_MAX_SYLLABUS_FOR_PROMPT_CHARS = 24_000


async def _condense_for_prompt(syllabus: str) -> str:
    """
    Trim syllabus markdown for use inside another model prompt (token / context limits).
    Does not call an LLM — only truncates with a clear suffix when needed.
    """
    text = (syllabus or "").strip()
    if len(text) <= _MAX_SYLLABUS_FOR_PROMPT_CHARS:
        return text
    return (
        text[:_MAX_SYLLABUS_FOR_PROMPT_CHARS]
        + "\n\n[... syllabus truncated for prompt size ...]"
    )


async def _call_llm_with_file(
    file_bytes: bytes,
    content_type: str,
    filename: str,
    prompt: str,
    system: str,
    temperature: float = 0.4,
) -> str:
    """
    Call the LLM with the file attached directly — no chunking or summarisation.

    All file types are base64-encoded and sent as an inline file attachment
    so the model reads the full document in one shot.
    """
    from openai_client import get_client as _get_client, get_model as _get_model

    client = _get_client()

    b64 = base64.b64encode(file_bytes).decode("utf-8")
    user_content: object = [
        {
            "type": "file",
            "file": {
                "filename": filename,
                "file_data": f"data:{content_type};base64,{b64}",
            },
        },
        {"type": "text", "text": prompt},
    ]

    resp = await client.chat.completions.create(
        model=_get_model(),
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        temperature=temperature,
    )
    return resp.choices[0].message.content or ""


# ── Syllabus background task ───────────────────────────────────────────────────

async def _generate_syllabus_bg(
    course_id: uuid.UUID,
    doc_id: uuid.UUID,
    file_bytes: bytes,
    content_type: str,
    filename: str,
    course_name: str,
    course_description: str,
    prompt_template: str,
) -> None:
    """
    Background task: attach the uploaded file to the LLM → persist results.

    Opens its own DB session because the request session is closed by the
    time this runs.  On any failure the Document is marked as failed.
    """
    db = SessionLocal()
    try:
        # Build the text part of the prompt (file is passed separately as attachment)
        prompt = prompt_template.format(
            course_name=course_name,
            course_description=course_description,
            # Legacy placeholder — silently ignored if absent in newer templates
            file_content="",
        ).strip()

        syllabus_md = await _call_llm_with_file(
            file_bytes=file_bytes,
            content_type=content_type,
            filename=filename,
            prompt=prompt,
            system="You are an expert curriculum designer. Always respond in markdown.",
            temperature=0.4,
        )

        doc = db.get(Document, doc_id)
        course = db.get(Course, course_id)
        if doc:
            doc.conversion_status = ConversionStatus.completed
        if course:
            course.syllabus = syllabus_md
        db.commit()
        logger.info("Syllabus generated for course %s (doc %s)", course_id, doc_id)

    except Exception:
        logger.exception("Syllabus generation failed for doc %s", doc_id)
        db.rollback()
        try:
            doc = db.get(Document, doc_id)
            if doc:
                doc.conversion_status = ConversionStatus.failed
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


# ── Syllabus endpoints ─────────────────────────────────────────────────────────

@router.get("/{course_id}/syllabus", tags=["Syllabus"])
def get_syllabus(course_id: uuid.UUID, _: CurrentUser, db: DbDep):
    """Return the current AI-generated syllabus for a course (plain markdown string)."""
    course = _get_course_or_404(course_id, db)
    if not course.syllabus:
        raise HTTPException(status_code=404, detail="No syllabus has been generated for this course yet.")
    return {"course_id": course_id, "syllabus": course.syllabus}


@router.post(
    "/{course_id}/syllabus/upload",
    response_model=SyllabusUploadOut,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Syllabus"],
)
async def upload_syllabus_file(
    course_id: uuid.UUID,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    current_user: TeacherUser,
    db: DbDep,
):
    """
    Accept a file upload and immediately return 202 Accepted.

    Text extraction happens synchronously (fast); AI condensation and syllabus
    generation are dispatched as a background task so the client is not blocked.
    Poll GET /documents/{document_id} and check conversion_status:
      - "pending"   → still generating
      - "completed" → Course.syllabus has been updated
      - "failed"    → generation failed; the teacher may retry
    """
    course = _get_course_or_404(course_id, db)

    if file.content_type not in SYLLABUS_ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type '{file.content_type}'. "
                f"Allowed: {', '.join(SYLLABUS_ALLOWED_TYPES.keys())}"
            ),
        )

    file_bytes = await file.read()
    _validate_syllabus_file(file_bytes, file.content_type)

    ext = SYLLABUS_ALLOWED_TYPES[file.content_type]
    saved_name = f"{uuid.uuid4()}.{ext}"
    save_path = UPLOAD_DIR / saved_name
    save_path.write_bytes(file_bytes)

    prompt_row = db.scalar(select(SyllabusGenerationPrompt))
    prompt_template = prompt_row.prompt if prompt_row else DEFAULT_SYLLABUS_GENERATION_PROMPT

    doc = Document(
        uploaded_by=current_user.id,
        course_id=course_id,
        document_type=DocumentType.other,
        original_filename=file.filename,
        original_file_type=ext,
        original_file_path=str(save_path),
        conversion_status=ConversionStatus.pending,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(
        _generate_syllabus_bg,
        course_id=course_id,
        doc_id=doc.id,
        file_bytes=file_bytes,
        content_type=file.content_type,
        filename=file.filename or saved_name,
        course_name=course.name,
        course_description=course.description or "N/A",
        prompt_template=prompt_template,
    )

    return SyllabusUploadOut(course_id=course_id, document_id=doc.id, status="pending")
