import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from deps import AdminUser, CurrentUser, DbDep, TeacherUser
from models import Course, CourseStudent, CourseTeacher, StudentUser, TeacherUser as TeacherModel, UserRole
from schemas import (
    AssignTeacherRequest,
    CourseCreate,
    CourseOut,
    CourseUpdate,
    EnrollStudentRequest,
    UserOut,
)

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
