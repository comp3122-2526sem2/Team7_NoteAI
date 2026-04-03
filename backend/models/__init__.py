from .base import Base
from .user import User, StudentUser, TeacherUser, UserRole
from .course import Course, CourseStudent, CourseTeacher
from .chapter import Chapter, ChapterAIComment, ChapterUserWorkspace
from .chapter_thread import ChapterThread
from .assignment import Assignment, CourseAssignment, AssignmentSubmission, AssignmentType, SubmissionStatus
from .document import Document, DocumentType, ConversionStatus
from .progress import StudentTopicProgress, StudentAIRecommendation, MasteryLevel
from .prompt import (
    ChapterPerformancePrompt, AssignmentFeedbackPrompt, SyllabusGenerationPrompt,
    DEFAULT_CHAPTER_PERFORMANCE_PROMPT, DEFAULT_ASSIGNMENT_FEEDBACK_PROMPT,
    DEFAULT_SYLLABUS_GENERATION_PROMPT,
)

__all__ = [
    "Base",
    # user
    "User", "StudentUser", "TeacherUser", "UserRole",
    # course
    "Course", "CourseStudent", "CourseTeacher",
    # chapter
    "Chapter", "ChapterAIComment", "ChapterUserWorkspace", "ChapterThread",
    # assignment
    "Assignment", "CourseAssignment", "AssignmentSubmission",
    "AssignmentType", "SubmissionStatus",
    # document
    "Document", "DocumentType", "ConversionStatus",
    # progress
    "StudentTopicProgress", "StudentAIRecommendation", "MasteryLevel",
    # prompt
    "ChapterPerformancePrompt", "AssignmentFeedbackPrompt", "SyllabusGenerationPrompt",
    "DEFAULT_CHAPTER_PERFORMANCE_PROMPT", "DEFAULT_ASSIGNMENT_FEEDBACK_PROMPT",
    "DEFAULT_SYLLABUS_GENERATION_PROMPT",
]
