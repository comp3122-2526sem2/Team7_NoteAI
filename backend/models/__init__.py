from .base import Base
from .user import User, StudentUser, TeacherUser, UserRole
from .course import Course, CourseStudent, CourseTeacher
from .chapter import Chapter, ChapterAIComment
from .chapter_thread import ChapterThread
from .assignment import Assignment, CourseAssignment, AssignmentSubmission, AssignmentType, SubmissionStatus
from .document import Document, DocumentType, ConversionStatus
from .progress import StudentTopicProgress, StudentAIRecommendation, MasteryLevel

__all__ = [
    "Base",
    # user
    "User", "StudentUser", "TeacherUser", "UserRole",
    # course
    "Course", "CourseStudent", "CourseTeacher",
    # chapter
    "Chapter", "ChapterAIComment", "ChapterThread",
    # assignment
    "Assignment", "CourseAssignment", "AssignmentSubmission",
    "AssignmentType", "SubmissionStatus",
    # document
    "Document", "DocumentType", "ConversionStatus",
    # progress
    "StudentTopicProgress", "StudentAIRecommendation", "MasteryLevel",
]
