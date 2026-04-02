from typing import TYPE_CHECKING
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from .user import StudentUser, TeacherUser
    from .assignment import Assignment, CourseAssignment
    from .lesson_plan import LessonPlan
    from .document import Document
    from .progress import StudentTopicProgress, StudentAIRecommendation


class Course(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "course"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    syllabus: Mapped[str | None] = mapped_column(Text, nullable=True)

    student_enrollments: Mapped[list["CourseStudent"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    teacher_assignments: Mapped[list["CourseTeacher"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    course_assignments: Mapped[list["CourseAssignment"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="course")
    lesson_plans: Mapped[list["LessonPlan"]] = relationship(back_populates="course")
    documents: Mapped[list["Document"]] = relationship(back_populates="course")
    student_topic_progress: Mapped[list["StudentTopicProgress"]] = relationship(
        back_populates="course"
    )
    student_ai_recommendations: Mapped[list["StudentAIRecommendation"]] = relationship(
        back_populates="course"
    )


class CourseStudent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "course_student"

    student_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("student_user.id", ondelete="CASCADE"),
        nullable=False,
    )
    course_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course.id", ondelete="CASCADE"),
        nullable=False,
    )

    student: Mapped["StudentUser"] = relationship(back_populates="course_enrollments")
    course: Mapped["Course"] = relationship(back_populates="student_enrollments")


class CourseTeacher(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "course_teacher"

    teacher_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teacher_user.id", ondelete="CASCADE"),
        nullable=False,
    )
    course_id: Mapped[str] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course.id", ondelete="CASCADE"),
        nullable=False,
    )

    teacher: Mapped["TeacherUser"] = relationship(back_populates="course_assignments")
    course: Mapped["Course"] = relationship(back_populates="teacher_assignments")
