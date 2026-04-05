from .auth import RegisterRequest, TokenResponse
from .users import UserOut, UserUpdate
from .courses import CourseCreate, CourseUpdate, CourseOut, SyllabusUploadOut, EnrollStudentRequest, AssignTeacherRequest
from .chapters import ChapterCreate, ChapterUpdate, ChapterOut, ChapterAICommentOut, ChapterStudentPerformance, StudentChapterPerformance
from .threads import ThreadCreate, ThreadOut
from .assignments import (
    AssignmentCreate, AssignmentUpdate, AssignmentOut,
    SubmissionCreate, SubmissionGrade, SubmissionOut, SubmissionWithStudentOut,
)
from .documents import DocumentOut, DocumentUpdate, DocumentKeywordsOut, AICheckRequest
from .progress import (
    TopicProgressOut, TopicProgressUpdate,
    AIRecommendationOut, GenerateRecommendationRequest,
)
from .prompts import PromptOut, PromptUpdate
from .lesson_plans import (
    LessonPlanCreate, LessonPlanUpdate, LessonPlanOut,
    LessonPlanVersionOut, LessonPlanVersionDetailOut,
    AiGenerateRequest, AiRegenerateSectionRequest, AiRegenerateSectionOut,
    LessonPlanTemplateCreate, LessonPlanTemplateUpdate, LessonPlanTemplateOut,
)

__all__ = [
    "RegisterRequest", "TokenResponse",
    "UserOut", "UserUpdate",
    "CourseCreate", "CourseUpdate", "CourseOut", "SyllabusUploadOut", "EnrollStudentRequest", "AssignTeacherRequest",
    "ChapterCreate", "ChapterUpdate", "ChapterOut", "ChapterAICommentOut", "ChapterStudentPerformance", "StudentChapterPerformance",
    "ThreadCreate", "ThreadOut",
    "AssignmentCreate", "AssignmentUpdate", "AssignmentOut",
    "SubmissionCreate", "SubmissionGrade", "SubmissionOut", "SubmissionWithStudentOut",
    "DocumentOut", "DocumentUpdate", "DocumentKeywordsOut", "AICheckRequest",
    "TopicProgressOut", "TopicProgressUpdate",
    "AIRecommendationOut", "GenerateRecommendationRequest",
    "PromptOut", "PromptUpdate",
    "LessonPlanCreate", "LessonPlanUpdate", "LessonPlanOut",
    "LessonPlanVersionOut", "LessonPlanVersionDetailOut",
    "AiGenerateRequest", "AiRegenerateSectionRequest", "AiRegenerateSectionOut",
    "LessonPlanTemplateCreate", "LessonPlanTemplateUpdate", "LessonPlanTemplateOut",
]
