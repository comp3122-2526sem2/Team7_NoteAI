from .base import Base
from .user import User, StudentUser, TeacherUser, UserRole
from .course import Course, CourseStudent, CourseTeacher
from .chapter import Chapter, ChapterAIComment, ChapterUserWorkspace
from .chapter_thread import ChapterThread
from .assignment import Assignment, CourseAssignment, AssignmentSubmission, AssignmentType, SubmissionStatus
from .document import Document, DocumentType, ConversionStatus
from .progress import StudentTopicProgress, StudentAIRecommendation, MasteryLevel
from .lesson_plan import LessonPlan, LessonPlanVersion, LessonPlanStatus
from .lesson_plan_template import LessonPlanTemplate, LessonPlanTemplateType
from .prompt import (
    ChapterPerformancePrompt, AssignmentFeedbackPrompt, SyllabusGenerationPrompt,
    LessonPlanGenerationPrompt, LessonPlanSectionPrompt,
    DEFAULT_CHAPTER_PERFORMANCE_PROMPT, DEFAULT_ASSIGNMENT_FEEDBACK_PROMPT,
    DEFAULT_SYLLABUS_GENERATION_PROMPT, DEFAULT_LESSON_PLAN_GENERATION_PROMPT,
    DEFAULT_LESSON_PLAN_SECTION_PROMPT,
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
    # lesson plan
    "LessonPlan", "LessonPlanVersion", "LessonPlanStatus",
    "LessonPlanTemplate", "LessonPlanTemplateType",
    # prompt
    "ChapterPerformancePrompt", "AssignmentFeedbackPrompt", "SyllabusGenerationPrompt",
    "LessonPlanGenerationPrompt", "LessonPlanSectionPrompt",
    "DEFAULT_CHAPTER_PERFORMANCE_PROMPT", "DEFAULT_ASSIGNMENT_FEEDBACK_PROMPT",
    "DEFAULT_SYLLABUS_GENERATION_PROMPT",
    "DEFAULT_LESSON_PLAN_GENERATION_PROMPT", "DEFAULT_LESSON_PLAN_SECTION_PROMPT",
]
