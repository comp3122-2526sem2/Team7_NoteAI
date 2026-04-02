from .auth import RegisterRequest, TokenResponse
from .users import UserOut, UserUpdate
from .courses import CourseCreate, CourseUpdate, CourseOut, EnrollStudentRequest, AssignTeacherRequest
from .assignments import (
    AssignmentCreate, AssignmentUpdate, AssignmentOut,
    SubmissionCreate, SubmissionGrade, SubmissionOut,
)
from .lesson_plans import (
    LessonPlanCreate, LessonPlanUpdate, LessonPlanOut,
    TopicCreate, TopicUpdate, TopicOut,
    VersionOut, AIGenerateRequest,
)
from .documents import DocumentOut, DocumentUpdate, AICheckRequest
from .progress import (
    TopicProgressOut, TopicProgressUpdate,
    AIRecommendationOut, GenerateRecommendationRequest,
)

__all__ = [
    "RegisterRequest", "TokenResponse",
    "UserOut", "UserUpdate",
    "CourseCreate", "CourseUpdate", "CourseOut", "EnrollStudentRequest", "AssignTeacherRequest",
    "AssignmentCreate", "AssignmentUpdate", "AssignmentOut",
    "SubmissionCreate", "SubmissionGrade", "SubmissionOut",
    "LessonPlanCreate", "LessonPlanUpdate", "LessonPlanOut",
    "TopicCreate", "TopicUpdate", "TopicOut", "VersionOut", "AIGenerateRequest",
    "DocumentOut", "DocumentUpdate", "AICheckRequest",
    "TopicProgressOut", "TopicProgressUpdate",
    "AIRecommendationOut", "GenerateRecommendationRequest",
]
